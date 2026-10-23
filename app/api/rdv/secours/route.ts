// ─────────────────────────────────────────────────────────────────────────────
// LE RENDEZ-VOUS D'UNE PAGE MORTE, CRÉÉ DEPUIS SA COPIE (23 oct. 2026).
//
// Appelée par la surveillance des paiements, et SEULEMENT quand Stripe a
// confirmé un paiement sans que la page ait commencé à créer son rendez-vous.
// La réservation normale ne passe jamais ici.
//
// On refait exactement ce que la page aurait fait, dans le même ordre : la
// cliente, le rendez-vous (réponses, commentaire, offre, collaboratrice), le
// paiement rattaché, la fidélité, la réduction, l'offre, les photos, le mail de
// confirmation, le rappel de la veille, la notification à la pro.
//
// Jamais sans argent reçu : paiement abouti chez Stripe, pour CETTE pro, ni
// remboursé ni contesté, créneau pas encore passé. Jamais deux fois : la copie
// se prend d'un coup ; si la page l'a prise, on ne fait rien.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe-serveur'
import { delaiAvant, jourChezLaPro } from '@/lib/heure-pro'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co'

type Copie = {
  creation: Record<string, unknown> & { date: string; heure: string; praticienne_id?: string | null; offre_id?: string | null }
  cliente: { telephone: string; prenom?: string; nom?: string; email?: string }
  fidelite?: { active?: boolean; recompense_existante?: boolean }
  reduction_limitee?: boolean
  prix_brut?: number
  mail?: Record<string, unknown> | null
  notif?: { nouvelle?: { title: string; body: string }; habituee?: { title: string; body: string } }
  photos?: string[]
}

export async function POST(req: NextRequest) {
  const cle = process.env.REPARATION_SECRET
  if (!cle || req.headers.get('authorization') !== `Bearer ${cle}`) {
    return NextResponse.json({ error: 'non_autorise' }, { status: 401 })
  }
  const { intent_id } = await req.json().catch(() => ({})) as { intent_id?: string }
  if (typeof intent_id !== 'string' || !/^(seti|pi)_[A-Za-z0-9]+$/.test(intent_id)) {
    return NextResponse.json({ error: 'intent_invalide' }, { status: 400 })
  }

  // ── ON PREND LA COPIE, D'UN COUP ─────────────────────────────────────────
  const { data: prises } = await supabaseAdmin.from('reservations_en_attente')
    .update({ statut: 'serveur', maj_le: new Date().toISOString() })
    .eq('intent_id', intent_id).eq('statut', 'en_attente')
    .select('pro_id, corps, source')
  const prise = (prises ?? [])[0]
  if (!prise) return NextResponse.json({ ok: false, raison: 'copie_absente_ou_prise' })
  const proId = prise.pro_id as string
  const copie = prise.corps as Copie
  const origine = req.nextUrl.origin

  const finir = async (statut: string, resultat: Record<string, unknown>, rdvId: string | null = null) => {
    await supabaseAdmin.from('reservations_en_attente')
      .update({ statut, resultat, rdv_id: rdvId, maj_le: new Date().toISOString() })
      .eq('intent_id', intent_id)
  }
  // Rien n'est créé : on rend la copie, pour qu'un humain voie le cas en entier.
  const refus = async (raison: string, extra: Record<string, unknown> = {}) => {
    await finir('refuse', { raison, ...extra })
    return NextResponse.json({ ok: false, raison, ...extra })
  }

  // Pas encore confirmé (la cliente est encore dans l'app de sa banque) : on
  // rend la copie telle quelle, elle resservira. Abandonné : on la range.
  const pasEncore = async (etat: string) => {
    if (etat === 'canceled') { await finir('abandonne', { etat }); return NextResponse.json({ ok: false, raison: 'abandonne' }) }
    await supabaseAdmin.from('reservations_en_attente')
      .update({ statut: 'en_attente', maj_le: new Date().toISOString() })
      .eq('intent_id', intent_id).eq('statut', 'serveur')
    return NextResponse.json({ ok: false, raison: 'pas_encore', etat })
  }

  try {
    // ── L'ARGENT EST-IL BIEN LÀ ? ──────────────────────────────────────────
    const { data: compte } = await supabaseAdmin.from('stripe_comptes').select('account_id').eq('pro_id', proId).maybeSingle()
    if (!compte?.account_id) return refus('compte_introuvable')
    const stripeAccount = compte.account_id as string
    if (intent_id.startsWith('seti_')) {
      const si = await stripe().setupIntents.retrieve(intent_id, {}, { stripeAccount })
      if (si.status !== 'succeeded') return pasEncore(si.status)
      if (si.metadata?.glamia_pro_id && si.metadata.glamia_pro_id !== proId) return refus('autre_pro')
    } else {
      const pi = await stripe().paymentIntents.retrieve(intent_id, { expand: ['latest_charge'] }, { stripeAccount })
      if (pi.status !== 'succeeded') return pasEncore(pi.status)
      if (!(pi.amount_received > 0)) return refus('paiement_non_abouti', { etat: 'rien_recu' })
      if (pi.metadata?.glamia_pro_id && pi.metadata.glamia_pro_id !== proId) return refus('autre_pro')
      const ch = pi.latest_charge as { refunded?: boolean; amount_refunded?: number; disputed?: boolean } | string | null
      if (ch && typeof ch === 'object' && (ch.refunded || (ch.amount_refunded ?? 0) > 0)) return refus('rembourse')
      if (ch && typeof ch === 'object' && ch.disputed) return refus('litige')
    }

    // Déjà rattaché à un rendez-vous (la page a fini malgré tout) : rien à faire.
    const { data: dejaLie } = await supabaseAdmin.from('paiements').select('rdv_id')
      .or(`stripe_payment_intent_id.eq.${intent_id},stripe_setup_intent_id.eq.${intent_id}`).limit(1)
    if ((dejaLie ?? []).length) {
      await finir('cree', { deja: true }, (dejaLie![0].rdv_id as string | null) ?? null)
      return NextResponse.json({ ok: true, deja: true })
    }

    const { date, heure } = copie.creation
    const { data: pro } = await supabaseAdmin.from('profiles').select('timezone').eq('id', proId).maybeSingle()
    if (`${date}T${heure}` <= jourChezLaPro(pro?.timezone) + 'T' + new Intl.DateTimeFormat('fr-FR', { timeZone: pro?.timezone || 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date())) {
      return refus('date_passee')
    }

    // ── LA CLIENTE ─────────────────────────────────────────────────────────
    const repCli = await fetch(`${origine}/api/cliente/identifier`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pro_id: proId, telephone: copie.cliente.telephone, creer: true,
        prenom: copie.cliente.prenom ?? '', nom: copie.cliente.nom ?? '', email: copie.cliente.email ?? '' }),
    })
    const { cliente, creee } = await repCli.json().catch(() => ({})) as { cliente?: { id: string }; creee?: boolean }
    if (!cliente?.id) return refus('cliente_impossible')

    // ── LE RENDEZ-VOUS, TEL QUE LA PAGE L'AURAIT ENVOYÉ ─────────────────────
    const repRdv = await fetch(`${origine}/api/rdv/creer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cle}`, ...(prise.source ? { 'x-glamia-source': prise.source as string } : {}) },
      body: JSON.stringify({ ...copie.creation, pro_id: proId, cliente_id: cliente.id, intent_id }),
    })
    const creation = await repRdv.json().catch(() => ({})) as { ok?: boolean; id?: string; raison?: string }
    if (!repRdv.ok || creation.ok !== true || !creation.id) {
      // Le créneau est parti entre-temps : comme la page, on rend l'argent.
      await fetch(`${origine}/api/propay/rembourser-orphelin`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pro_id: proId, intent_id }),
      }).catch(() => null)
      return refus('creneau_refuse', { detail: creation.raison ?? null, rembourse: true })
    }
    const rdvId = creation.id

    // ── LE PAIEMENT RATTACHÉ ────────────────────────────────────────────────
    let lie = false
    for (let i = 0; i < 3 && !lie; i++) {
      const r = await fetch(`${origine}/api/propay/lier`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pro_id: proId, rdv_id: rdvId, intent_id }),
      }).catch(() => null)
      const d = await r?.json().catch(() => ({}))
      lie = !!(r && ((r.ok && d?.success) || r.status === 409))
    }

    const tel = copie.cliente.telephone
    // ── FIDÉLITÉ, RÉDUCTION, OFFRE, PHOTOS ─────────────────────────────────
    if (copie.fidelite?.active) {
      await fetch(`${origine}/api/rdv/fidelite`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rdv_id: rdvId, telephone: tel, recompense_existante: !!copie.fidelite.recompense_existante }),
      }).catch(e => console.error('[rdv/secours] fidélité', e))
    }
    if (copie.reduction_limitee) {
      const { error } = await supabaseAdmin.rpc('consommer_reduction_cliente', { p_cliente_id: cliente.id })
      if (error) console.error('[rdv/secours] réduction', error)
    }
    if (copie.creation.offre_id) {
      const res = await supabaseAdmin.rpc('apply_offer_to_rdv', { p_offre_id: copie.creation.offre_id, p_rdv_id: rdvId, p_telephone: tel })
      const ok = (res.data as { success?: boolean } | null)?.success
      if (res.error || !ok) {
        await fetch(`${origine}/api/rdv/retirer-offre`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rdv_id: rdvId, telephone: tel, prix: (copie.prix_brut ?? 0) > 0 ? copie.prix_brut : null }),
        }).catch(e => console.error('[rdv/secours] retirer-offre', e))
      }
    }
    if (Array.isArray(copie.photos) && copie.photos.length) {
      await supabaseAdmin.from('rendez_vous').update({ inspirations: copie.photos.slice(0, 3) }).eq('id', rdvId)
    }

    // ── LE MAIL DE CONFIRMATION À LA CLIENTE ────────────────────────────────
    if (copie.mail && copie.cliente.email) {
      await fetch(`${origine}/api/rdv/mail-confirmation`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(copie.mail),
      }).catch(e => console.error('[rdv/secours] mail', e))
    }

    // ── LE RAPPEL, SI LE RENDEZ-VOUS EST DANS MOINS DE 24 H (pas le jour même) ─
    const heuresAvant = delaiAvant(`${date}T${heure}:00.000Z`, pro?.timezone) / 3_600_000
    if (heuresAvant > 0 && heuresAvant <= 24 && date !== jourChezLaPro(pro?.timezone)) {
      await fetch(`${SUPABASE}/functions/v1/rappel-confirmation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ rdv_id: rdvId }),
      }).catch(e => console.error('[rdv/secours] rappel', e))
    }

    // ── LA NOTIFICATION À LA PRO, LA MÊME QUE D'HABITUDE ────────────────────
    const notif = creee ? copie.notif?.nouvelle : copie.notif?.habituee
    if (notif?.title && notif?.body) {
      await fetch(`${origine}/api/push-notify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proId, title: notif.title, body: notif.body, praticienneId: copie.creation.praticienne_id ?? null }),
      }).catch(e => console.error('[rdv/secours] notification', e))
    }

    await finir('cree', { lie }, rdvId)
    await supabaseAdmin.from('paiements_orphelins')
      .update({ statut: 'resolu', rdv_id: rdvId, resolu_le: new Date().toISOString(), verifie_le: new Date().toISOString() })
      .eq('stripe_intent_id', intent_id)
    console.log('[rdv/secours] rendez-vous créé depuis la copie', intent_id, rdvId)
    return NextResponse.json({ ok: true, rdv_id: rdvId, lie })
  } catch (e) {
    console.error('[rdv/secours]', intent_id, e)
    return refus('erreur_interne')
  }
}
