// ─────────────────────────────────────────────────────────────────────────────
// LA CLIENTE ANNULE : SON ACOMPTE MOLLIE (3.3.0, 18 nov. 2026)
//
// Remplace le traitement Stripe (lib/propay.ts, débranché le 18 nov. 2026) :
// le rendez-vous est déjà annulé, on demande au moteur des remboursements
// (fonction « mollie-rembourser ») de faire ce que la règle dit :
//   · à temps : l'acompte revient à la cliente, les frais restent acquis ;
//   · trop tard : l'acompte reste à la pro.
// Ne lève jamais : l'annulation du rendez-vous n'est jamais bloquée par le paiement.
// ─────────────────────────────────────────────────────────────────────────────
import { SECRET_MOLLIE, SUPABASE } from '@/lib/mollie-reservation'

export async function traiterAnnulationCliente(rdvId: string): Promise<{ resultat: string }> {
  if (!SECRET_MOLLIE) return { resultat: 'non_branche' }
  try {
    const r = await fetch(`${SUPABASE}/functions/v1/mollie-rembourser`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET_MOLLIE}` },
      body: JSON.stringify({ action: 'annulation', rdv_id: rdvId, par: 'cliente' }),
      signal: AbortSignal.timeout(20_000),
    })
    const d = await r.json().catch(() => ({})) as { issue?: string }
    return { resultat: d.issue ?? `erreur_${r.status}` }
  } catch (e) {
    console.error('[mollie-annulation]', rdvId, e)
    return { resultat: 'erreur' }
  }
}
