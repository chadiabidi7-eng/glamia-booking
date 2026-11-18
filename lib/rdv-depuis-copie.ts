// ─────────────────────────────────────────────────────────────────────────────
// LE RENDEZ-VOUS CRÉÉ PAR LE SERVEUR, DEPUIS LA COPIE DE LA RÉSERVATION
//
// Sorti de app/api/rdv/secours (23 oct. 2026) le 18 nov. 2026, sans rien y
// changer, pour servir aussi à Mollie : avec la page de paiement de Mollie, la
// cliente QUITTE la page de réservation pour payer. Le rendez-vous ne peut donc
// plus naître dans sa page : c'est le serveur qui le crée, dès que Mollie
// confirme le paiement, exactement comme la page l'aurait fait.
//
// On refait, dans le même ordre : la cliente, le rendez-vous (réponses,
// commentaire, offre, collaboratrice), le paiement rattaché, la fidélité, la
// réduction, l'offre, les photos, le mail de confirmation, le rappel de la
// veille, la notification à la pro.
//
// L'APPELANT vérifie l'argent AVANT (Stripe ou Mollie) et a déjà PRIS la copie :
// jamais deux rendez-vous pour un paiement.
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js'
import { delaiAvant, jourChezLaPro } from '@/lib/heure-pro'

const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co'

/**
 * Les appels du serveur à lui-même. Sur une adresse d'aperçu, Vercel demande une
 * connexion : la clé de contournement (fournie par Vercel quand elle est activée)
 * laisse passer le serveur. Sans effet sur booking.glamia.pro, qui n'est pas protégé.
 */
export const ENTETES_INTERNES: Record<string, string> = {
  'Content-Type': 'application/json',
  ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {}),
}

export type Copie = {
  creation: Record<string, unknown> & { date: string; heure: string; praticienne_id?: string | null; offre_id?: string | null }
  cliente: { telephone: string; prenom?: string; nom?: string; email?: string }
  fidelite?: { active?: boolean; recompense_existante?: boolean }
  reduction_limitee?: boolean
  prix_brut?: number
  mail?: Record<string, unknown> | null
  notif?: { nouvelle?: { title: string; body: string }; habituee?: { title: string; body: string } }
  photos?: string[]
}

export type Issue =
  | { ok: true; rdvId: string; lie: boolean }
  | { ok: false; raison: string; extra?: Record<string, unknown> }

export async function rdvDepuisCopie(admin: SupabaseClient, p: {
  intentId: string
  proId: string
  copie: Copie
  /** L'adresse de la clé partagée (REPARATION_SECRET) : la création reconnaît le serveur. */
  cle: string
  origine: string
  /** L'adresse d'origine de la cliente : la garde anti-automates compte la cliente, pas le serveur. */
  source: string | null
  /** Rattacher le paiement au rendez-vous créé. Vrai si c'est fait. */
  lier: (rdvId: string) => Promise<boolean>
  /** Le créneau est parti entre-temps : rendre l'argent. */
  rembourser: () => Promise<void>
}): Promise<Issue> {
  const { copie, proId, origine, cle, intentId } = p
  const { date, heure } = copie.creation
  const { data: pro } = await admin.from('profiles').select('timezone').eq('id', proId).maybeSingle()
  if (`${date}T${heure}` <= jourChezLaPro(pro?.timezone) + 'T' + new Intl.DateTimeFormat('fr-FR', { timeZone: pro?.timezone || 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date())) {
    return { ok: false, raison: 'date_passee' }
  }

  // ── LA CLIENTE ─────────────────────────────────────────────────────────
  const repCli = await fetch(`${origine}/api/cliente/identifier`, {
    method: 'POST', headers: ENTETES_INTERNES,
    body: JSON.stringify({ pro_id: proId, telephone: copie.cliente.telephone, creer: true,
      prenom: copie.cliente.prenom ?? '', nom: copie.cliente.nom ?? '', email: copie.cliente.email ?? '' }),
  })
  const { cliente, creee } = await repCli.json().catch(() => ({})) as { cliente?: { id: string }; creee?: boolean }
  if (!cliente?.id) return { ok: false, raison: 'cliente_impossible' }

  // ── LE RENDEZ-VOUS, TEL QUE LA PAGE L'AURAIT ENVOYÉ ─────────────────────
  const repRdv = await fetch(`${origine}/api/rdv/creer`, {
    method: 'POST',
    headers: { ...ENTETES_INTERNES, Authorization: `Bearer ${cle}`, ...(p.source ? { 'x-glamia-source': p.source } : {}) },
    body: JSON.stringify({ ...copie.creation, pro_id: proId, cliente_id: cliente.id, intent_id: intentId }),
  })
  const creation = await repRdv.json().catch(() => ({})) as { ok?: boolean; id?: string; raison?: string }
  if (!repRdv.ok || creation.ok !== true || !creation.id) {
    // Le créneau est parti entre-temps : comme la page, on rend l'argent.
    await p.rembourser().catch(() => null)
    return { ok: false, raison: 'creneau_refuse', extra: { detail: creation.raison ?? null, rembourse: true } }
  }
  const rdvId = creation.id

  // ── LE PAIEMENT RATTACHÉ ────────────────────────────────────────────────
  let lie = false
  for (let i = 0; i < 3 && !lie; i++) lie = await p.lier(rdvId).catch(() => false)

  const tel = copie.cliente.telephone
  // ── FIDÉLITÉ, RÉDUCTION, OFFRE, PHOTOS ─────────────────────────────────
  if (copie.fidelite?.active) {
    await fetch(`${origine}/api/rdv/fidelite`, {
      method: 'POST', headers: ENTETES_INTERNES,
      body: JSON.stringify({ rdv_id: rdvId, telephone: tel, recompense_existante: !!copie.fidelite.recompense_existante }),
    }).catch(e => console.error('[rdv-depuis-copie] fidélité', e))
  }
  if (copie.reduction_limitee) {
    const { error } = await admin.rpc('consommer_reduction_cliente', { p_cliente_id: cliente.id })
    if (error) console.error('[rdv-depuis-copie] réduction', error)
  }
  if (copie.creation.offre_id) {
    const res = await admin.rpc('apply_offer_to_rdv', { p_offre_id: copie.creation.offre_id, p_rdv_id: rdvId, p_telephone: tel })
    const reussi = (res.data as { success?: boolean } | null)?.success
    if (res.error || !reussi) {
      await fetch(`${origine}/api/rdv/retirer-offre`, {
        method: 'POST', headers: ENTETES_INTERNES,
        body: JSON.stringify({ rdv_id: rdvId, telephone: tel, prix: (copie.prix_brut ?? 0) > 0 ? copie.prix_brut : null }),
      }).catch(e => console.error('[rdv-depuis-copie] retirer-offre', e))
    }
  }
  if (Array.isArray(copie.photos) && copie.photos.length) {
    await admin.from('rendez_vous').update({ inspirations: copie.photos.slice(0, 3) }).eq('id', rdvId)
  }

  // ── LE MAIL DE CONFIRMATION À LA CLIENTE ────────────────────────────────
  if (copie.mail && copie.cliente.email) {
    await fetch(`${origine}/api/rdv/mail-confirmation`, {
      method: 'POST', headers: ENTETES_INTERNES,
      body: JSON.stringify(copie.mail),
    }).catch(e => console.error('[rdv-depuis-copie] mail', e))
  }

  // ── LE RAPPEL, SI LE RENDEZ-VOUS EST DANS MOINS DE 24 H (pas le jour même) ─
  const heuresAvant = delaiAvant(`${date}T${heure}:00.000Z`, pro?.timezone) / 3_600_000
  if (heuresAvant > 0 && heuresAvant <= 24 && date !== jourChezLaPro(pro?.timezone)) {
    await fetch(`${SUPABASE}/functions/v1/rappel-confirmation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ rdv_id: rdvId }),
    }).catch(e => console.error('[rdv-depuis-copie] rappel', e))
  }

  // ── LA NOTIFICATION À LA PRO, LA MÊME QUE D'HABITUDE ────────────────────
  const notif = creee ? copie.notif?.nouvelle : copie.notif?.habituee
  if (notif?.title && notif?.body) {
    await fetch(`${origine}/api/push-notify`, {
      method: 'POST', headers: ENTETES_INTERNES,
      body: JSON.stringify({ proId, title: notif.title, body: notif.body, praticienneId: copie.creation.praticienne_id ?? null }),
    }).catch(e => console.error('[rdv-depuis-copie] notification', e))
  }

  return { ok: true, rdvId, lie }
}
