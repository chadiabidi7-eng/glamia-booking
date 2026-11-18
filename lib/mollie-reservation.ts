// ─────────────────────────────────────────────────────────────────────────────
// MOLLIE, CÔTÉ PAGE DE RÉSERVATION (3.3.0, 18 nov. 2026)
//
// La page de réservation connaît le vrai prix (catalogue, majoration du
// créneau, remises de la cliente) et sait si la cliente est nouvelle. Tout le
// reste — l'interrupteur, le compte Mollie de la pro, l'acompte, les frais, le
// paiement — se décide dans la fonction serveur « mollie-acompte », appelée
// d'ici avec la clé partagée MOLLIE_SECRET_RESERVATION. Jamais du navigateur.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js'
import { prixReelDuPanier, remisesVerifiees } from '@/lib/prix-serveur'
import { majorer } from '@/lib/majoration'
import { majorationDuCreneau } from '@/lib/majoration-serveur'
import { normaliserTelephone } from '@/lib/telephone'

export const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co'
export const SECRET_MOLLIE = process.env.MOLLIE_SECRET_RESERVATION ?? ''

export const supabaseAdmin = createClient(SUPABASE, process.env.SUPABASE_SERVICE_ROLE_KEY!)

/** La fiche de la cliente derrière ce numéro, ou null. */
async function ficheCliente(proId: string, telephone: unknown): Promise<string | null | undefined> {
  if (typeof telephone !== 'string') return undefined
  const cible = normaliserTelephone(telephone)
  if (cible.length < 8) return undefined
  const { data, error } = await supabaseAdmin.from('clientes').select('id, telephone').eq('pro_id', proId)
  if (error) return undefined
  // Numéros stockés dans des formats variés : la comparaison se fait en mémoire.
  return (data ?? []).find(c => normaliserTelephone(c.telephone as string) === cible)?.id ?? null
}

/**
 * Le prix réel, en centimes, et si la cliente est nouvelle (absente du fichier de
 * la pro — règle du 7 août 2026 ; au moindre doute, habituée). null : panier
 * illisible, on ne demande aucun paiement sur un prix qu'on ne connaît pas.
 */
export async function prixEtCliente(proId: string, b: Record<string, unknown>): Promise<{ prix: number; nouvelle: boolean } | null> {
  const panier = await prixReelDuPanier(proId, b.techniques, b.offre_id, b.date)
  if (!panier) return null
  const majoration = await majorationDuCreneau(proId, String(b.date ?? ''), String(b.heure ?? ''))
  const prixMajore = majorer(panier.prix, majoration?.pourcentage ?? 0)
  const fiche = await ficheCliente(proId, b.telephone)
  const remises = await remisesVerifiees(proId, fiche ?? null, prixMajore, b.fidelite_appliquee, b.reduction_appliquee)
  return { prix: Math.round(remises.prix * 100), nouvelle: fiche === null }
}

/** Un appel à la fonction serveur « mollie-acompte ». */
export async function appelerMollieAcompte(corps: Record<string, unknown>): Promise<{ status: number; d: Record<string, unknown> }> {
  const r = await fetch(`${SUPABASE}/functions/v1/mollie-acompte`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET_MOLLIE}` },
    body: JSON.stringify(corps),
    signal: AbortSignal.timeout(20_000),
  })
  return { status: r.status, d: await r.json().catch(() => ({})) as Record<string, unknown> }
}
