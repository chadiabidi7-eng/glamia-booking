import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe-serveur'
import { adressePourEtape } from '@/lib/adresse-due'
import { traduireDans } from '@/lib/i18n'

// ─────────────────────────────────────────────────────────────────────────────
// UN PAIEMENT SANS RENDEZ-VOUS SE REPOSE TOUT SEUL.
//
// LE 24 AOÛT 2026, une cliente d'Ilana Douceur a payé 2,80 € et son
// rendez-vous n'a jamais existé : la connexion est morte entre l'encaissement
// et l'écriture. Il restait un numéro de paiement, et rien d'autre.
//
// Depuis, le paiement emporte la réservation avec lui : le créneau, la
// prestation, le nom et le téléphone sont posés SUR le paiement avant qu'il
// parte. Tout ce qu'il faut pour reposer le rendez-vous est donc là.
//
// LA RÉPARATION NE RECOPIE AUCUNE RÈGLE. Elle rappelle les guichets qui les
// portent déjà : `cliente/identifier` reconnaît la cliente, `rdv/creer` vérifie
// que le créneau est libre et recalcule le prix depuis le catalogue,
// `propay/lier` vérifie le montant chez Stripe et écrit l'encaissement. Une
// réparation suit donc exactement le chemin d'une réservation normale — c'est
// la seule façon qu'elle ne fabrique pas des rendez-vous qu'une vraie
// réservation aurait refusés.
//
// SI L'ENCAISSEMENT NE SE RATTACHE PAS, ON DÉFAIT. Un rendez-vous dans
// l'agenda sans l'acompte en face est pire que pas de rendez-vous du tout : la
// pro le redemanderait à une cliente qui a déjà payé.
//
// Appelée par le vérificateur d'orphelins, toutes les minutes.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** Ce que le paiement a emporté avec lui. Champs courts : Stripe plafonne à 500 caractères. */
type Reservation = {
  d?: string; h?: string; m?: number
  s?: string; t?: string; p?: number
  pr?: string; no?: string; te?: string; em?: string
}

const refus = (raison: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: false, raison, ...extra })

export async function POST(req: NextRequest) {
  // Réservée au service : elle crée des rendez-vous et lit des données de clientes.
  // La clé partagée avec le vérificateur (23 oct. 2026) : les deux côtés n'avaient
  // pas la même clé de service, l'appel était refusé et la réparation morte.
  const entete = req.headers.get('Authorization') ?? ''
  const cles = [process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.REPARATION_SECRET].filter(Boolean)
  if (!cles.some(c => entete === `Bearer ${c}`)) {
    return NextResponse.json({ error: 'non_autorise' }, { status: 401 })
  }

  try {
    const { intent_id, simulation } = await req.json() as { intent_id?: string; simulation?: boolean }
    if (typeof intent_id !== 'string' || !/^(seti|pi)_[A-Za-z0-9]+$/.test(intent_id)) {
      return NextResponse.json({ error: 'intent_invalide' }, { status: 400 })
    }

    const { data: orphelin } = await supabaseAdmin
      .from('paiements_orphelins')
      .select('id, pro_id, statut')
      .eq('stripe_intent_id', intent_id)
      .maybeSingle()
    if (!orphelin?.pro_id) return refus('paiement_inconnu')
    if (orphelin.statut === 'resolu' && !simulation) return NextResponse.json({ ok: true, deja: true })
    const proId = orphelin.pro_id as string

    const { data: compte } = await supabaseAdmin
      .from('stripe_comptes').select('account_id').eq('pro_id', proId).maybeSingle()
    if (!compte?.account_id) return refus('compte_introuvable')
    const stripeAccount = compte.account_id as string

    // Une empreinte est un SetupIntent, un acompte un PaymentIntent : deux
    // objets différents chez Stripe.
    const intent = intent_id.startsWith('seti_')
      ? await stripe().setupIntents.retrieve(intent_id, {}, { stripeAccount })
      : await stripe().paymentIntents.retrieve(intent_id, { expand: ['latest_charge'] }, { stripeAccount })

    // ── JAMAIS DE RENDEZ-VOUS SANS ARGENT REÇU (23 oct. 2026) ─────────────────
    // On ne repose que ce que Stripe dit abouti, et pour CETTE pro : un paiement
    // en attente de la banque, échoué ou annulé ne crée rien.
    if (intent.status !== 'succeeded') return refus('paiement_non_abouti', { etat: intent.status })
    if (intent.metadata?.glamia_pro_id && intent.metadata.glamia_pro_id !== proId) return refus('autre_pro')
    if ('amount_received' in intent && !(intent.amount_received > 0)) return refus('paiement_non_abouti', { etat: 'rien_recu' })
    // Un paiement remboursé reste « succeeded » chez Stripe : l'argent est rendu, rien à reposer.
    const charge = ('latest_charge' in intent ? intent.latest_charge : null) as { refunded?: boolean; amount_refunded?: number; disputed?: boolean } | string | null
    if (charge && typeof charge === 'object' && (charge.refunded || (charge.amount_refunded ?? 0) > 0)) return refus('rembourse')
    if (charge && typeof charge === 'object' && charge.disputed) return refus('litige')

    let r: Reservation
    try { r = JSON.parse(intent.metadata?.glamia_resa ?? '') } catch { r = {} }
    // Les paiements d'avant le 24 août 2026 ne portent rien : irréparables.
    if (!r.d || !r.h) return refus('sans_reservation')
    // Un créneau déjà passé ne se repose pas : il n'y a plus rien à honorer,
    // il y a de l'argent à rendre (GGLOW, 31 août, rejoué en simulation).
    const aParis = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date()).replace(' ', 'T')
    if (`${r.d}T${r.h}` <= aParis) return refus('date_passee')

    // ── LA CLIENTE ────────────────────────────────────────────────────────────
    if (!r.te) return refus('sans_telephone')
    const repCliente = await fetch(`${req.nextUrl.origin}/api/cliente/identifier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pro_id: proId, telephone: r.te, creer: !simulation,
        prenom: r.pr ?? '', nom: r.no ?? '', email: r.em ?? '',
      }),
    })
    const cliente = (await repCliente.json())?.cliente
    if (!cliente?.id && simulation) {
      return NextResponse.json({ ok: true, simulation: true, ferait: { cliente: 'nouvelle', jour: r.d, heure: r.h, prestation: r.t ?? null } })
    }
    if (!cliente?.id) return refus('cliente_impossible')

    // ── PAS DE DOUBLON (23 oct. 2026) ─────────────────────────────────────────
    // La cliente a peut-être déjà réessayé et repayé (Sophie, 23 oct. ; Melissa,
    // 3 sept.) : son rendez-vous existe, c'est CE paiement-ci qu'il faut lui
    // rendre, pas un second rendez-vous qu'il faut créer.
    const { data: dejaLa } = await supabaseAdmin.from('rendez_vous').select('id')
      .eq('pro_id', proId).eq('cliente_id', cliente.id).neq('statut', 'annule')
      .gte('date', `${r.d}T${r.h}:00+00:00`).lte('date', `${r.d}T${r.h}:00+00:00`).limit(1)
    if ((dejaLa ?? []).length) {
      const existant = dejaLa![0].id as string
      // Le rendez-vous a-t-il déjà son paiement ? Oui : celui-ci est un second
      // paiement, à rendre. Non : la page a créé le rendez-vous mais n'a pas eu
      // le temps de rattacher l'argent — on le rattache, on ne crée rien.
      const { data: sesPaiements } = await supabaseAdmin.from('paiements').select('id').eq('rdv_id', existant).limit(1)
      if ((sesPaiements ?? []).length) return refus('doublon', { rdv_id: existant })
      if (simulation) return NextResponse.json({ ok: true, simulation: true, ferait: { rattacher_a: existant } })
      const repLien = await fetch(`${req.nextUrl.origin}/api/propay/lier`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pro_id: proId, rdv_id: existant, intent_id }),
      })
      if (!repLien.ok) return refus('paiement_non_rattachable', { detail: (await repLien.json().catch(() => ({})))?.error ?? null })
      await supabaseAdmin.from('paiements_orphelins')
        .update({ statut: 'resolu', rdv_id: existant, resolu_le: new Date().toISOString() })
        .eq('id', orphelin.id)
      return NextResponse.json({ ok: true, rdv_id: existant, rattache: true })
    }

    if (simulation) {
      return NextResponse.json({ ok: true, simulation: true, ferait: { cliente: cliente.id, jour: r.d, heure: r.h, prestation: r.t ?? null } })
    }

    // ── LE RENDEZ-VOUS ────────────────────────────────────────────────────────
    // `rdv/creer` refuse un créneau pris entre-temps : deux clientes à la même
    // heure serait pire que le problème qu'on répare.
    const repRdv = await fetch(`${req.nextUrl.origin}/api/rdv/creer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pro_id: proId, cliente_id: cliente.id,
        date: r.d, heure: r.h, duree: Number(r.m) || 60,
        specialite: r.s ?? null, technique: r.t ?? null,
        prix: Number(r.p) || null,
      }),
    })
    const rdv = await repRdv.json()
    if (!repRdv.ok || !rdv?.id) return refus('creneau_indisponible', { detail: rdv?.raison ?? null })

    // ── L'ENCAISSEMENT ────────────────────────────────────────────────────────
    const repLien = await fetch(`${req.nextUrl.origin}/api/propay/lier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pro_id: proId, rdv_id: rdv.id, intent_id }),
    })
    if (!repLien.ok) {
      // On défait ce qu'on vient de poser : on ne laisse pas un rendez-vous
      // sans son acompte en face.
      await supabaseAdmin.from('rendez_vous').delete().eq('id', rdv.id)
      const detail = await repLien.json().catch(() => ({}))
      console.error('[propay/reparer-orphelin] encaissement non rattaché', intent_id, detail)
      return refus('paiement_non_rattachable', { detail: detail?.error ?? null })
    }

    // ── ON PRÉVIENT LA CLIENTE ────────────────────────────────────────────────
    // Elle a payé et n'a jamais rien reçu. Non bloquant : le rendez-vous existe
    // et l'argent est rattaché, c'est l'essentiel.
    if (r.em) {
      try {
        const { data: pro } = await supabaseAdmin
          .from('profiles').select('pseudo, prenom, nom, adresse, adresse_moment, devise, pays')
          .eq('id', proId).maybeSingle()
        await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co'}/functions/v1/confirmation-booking`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              rdv_id: rdv.id,
              cliente_email: r.em,
              cliente_prenom: r.pr ?? '',
              pro_nom: pro?.pseudo || `${pro?.prenom ?? ''} ${pro?.nom ?? ''}`.trim(),
              pays: pro?.pays ?? null,
              date: r.d, heure: r.h,
              prix_total: Number(r.p) || 0,
              devise: pro?.devise ?? 'EUR',
              adresse: adressePourEtape(pro?.adresse as string | null, (pro as any)?.adresse_moment, 'reservation') ?? '',
            }),
          },
        )
      } catch (e) {
        console.error('[propay/reparer-orphelin] confirmation non envoyée', e)
      }
    }

    // ── ON PRÉVIENT LA PRO, COMME POUR UNE RÉSERVATION NORMALE ─────────────────
    // C'est la page qui envoyait cette notification ; elle était morte.
    try {
      const { data: proL } = await supabaseAdmin.from('profiles').select('langue').eq('id', proId).maybeSingle()
      const langue = (proL?.langue as string | null) ?? 'fr'
      const jour = new Date(`${r.d}T12:00:00Z`).toLocaleDateString(langue === 'en' ? 'en-GB' : langue === 'es' ? 'es-ES' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
      await fetch(`${req.nextUrl.origin}/api/push-notify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proId,
          title: traduireDans(langue, 'notif.nouveauRdvTitre'),
          body: traduireDans(langue, 'notif.nouveauRdv', { prenom: r.pr ?? '', prestations: r.t ?? '', date: jour, heure: r.h, appel: '' }),
        }),
      })
    } catch (e) {
      console.error('[propay/reparer-orphelin] notification pro non envoyée', e)
    }

    await supabaseAdmin.from('paiements_orphelins')
      .update({
        statut: 'resolu', rdv_id: rdv.id,
        resolu_le: new Date().toISOString(), verifie_le: new Date().toISOString(),
      })
      .eq('id', orphelin.id)

    console.log(`[propay/reparer-orphelin] ✓ ${intent_id} → rendez-vous ${rdv.id}`)
    return NextResponse.json({ ok: true, rdv_id: rdv.id })
  } catch (e) {
    console.error('[propay/reparer-orphelin]', e)
    return NextResponse.json({ ok: false, raison: 'erreur_interne' }, { status: 500 })
  }
}
