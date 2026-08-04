import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Paiements orphelins Glamia Pay (audit Groupe E + C11).
// Un paiement capturé mais sans réservation en face a été remboursé : on le
// journalise (idempotent, unique par intent) et on prévient l'admin UNE seule
// fois. Deux causes :
//   'doublon'     → 2e onglet (la cliente a déjà son RDV, cas bénin)
//   'mort_reseau' → panne entre le paiement et l'écriture du RDV (créneau perdu)
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'chadi.abidi7@gmail.com'

export async function journaliserOrphelin(opts: {
  admin?: SupabaseClient
  intentId: string
  proId: string | null
  montant: number            // centimes effectivement remboursés
  cause: 'doublon' | 'mort_reseau'
}): Promise<{ nouveau: boolean }> {
  const admin = opts.admin ?? createClient(SUPABASE_URL, SERVICE_KEY)

  // Insert idempotent : un doublon d'intent (déjà traité par l'autre chemin ou
  // par un run précédent) ne renvoie aucune ligne → on ne re-notifie pas.
  const { data, error } = await admin
    .from('paiements_orphelins')
    .upsert(
      { stripe_intent_id: opts.intentId, pro_id: opts.proId, montant: opts.montant, cause: opts.cause, rembourse: true },
      { onConflict: 'stripe_intent_id', ignoreDuplicates: true },
    )
    .select('id')
  if (error) { console.error('[orphelins] journalisation:', error); return { nouveau: false } }
  if (!data || data.length === 0) return { nouveau: false }

  // ── Notifier l'admin (une seule fois, garanti par l'unicité ci-dessus) ──
  try {
    let proNom = opts.proId ?? '—'
    let proEmail = ''
    if (opts.proId) {
      const { data: p } = await admin.from('profiles').select('prenom, nom, email').eq('id', opts.proId).maybeSingle()
      if (p) {
        proNom = `${(p as { prenom?: string }).prenom ?? ''} ${(p as { nom?: string }).nom ?? ''}`.trim() || opts.proId
        proEmail = (p as { email?: string }).email ?? ''
      }
    }
    const euros = (opts.montant / 100).toFixed(2).replace('.', ',')
    const benin = opts.cause === 'doublon'

    const subject = benin
      ? `Glamia Pay — doublon remboursé (${euros} €)`
      : `⚠️ Glamia Pay — paiement orphelin remboursé (${euros} €)`

    const explication = benin
      ? `Une cliente a validé deux fois la même réservation (deux onglets). Sa première réservation est bien enregistrée&nbsp;; le second paiement, en trop, a été <strong>remboursé automatiquement</strong>. Aucune action nécessaire — c'est juste pour ta visibilité.`
      : `Une cliente a payé, mais sa réservation n'a jamais été enregistrée (coupure réseau juste après le paiement). Son argent a été <strong>remboursé automatiquement</strong>, mais <strong>elle a perdu son créneau</strong> et devra re-réserver. Tu peux prévenir la pro pour qu'elle reprenne contact avec la cliente.`

    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#2b2b2b">
        <h2 style="color:${benin ? '#8FB08A' : '#C08A9A'};font-size:18px">${benin ? 'Doublon remboursé' : 'Paiement orphelin remboursé'}</h2>
        <p style="font-size:14px;line-height:1.5">${explication}</p>
        <table style="font-size:13px;border-collapse:collapse;margin-top:12px">
          <tr><td style="padding:4px 12px 4px 0;color:#888">Montant remboursé</td><td><strong>${euros} €</strong></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#888">Pro</td><td>${proNom}${proEmail ? ` — ${proEmail}` : ''}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#888">Cause</td><td>${benin ? 'Double onglet (C11)' : 'Coupure réseau (Groupe E)'}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#888">Réf. paiement</td><td style="font-family:monospace;font-size:11px">${opts.intentId}</td></tr>
        </table>
      </div>`

    await fetch(`${SUPABASE_URL}/functions/v1/envoyer-mail-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ to: ADMIN_EMAIL, subject, html }),
    })
    await admin.from('paiements_orphelins').update({ notifie: true }).eq('stripe_intent_id', opts.intentId)
  } catch (e) {
    console.error('[orphelins] notif admin:', e)
  }
  return { nouveau: true }
}
