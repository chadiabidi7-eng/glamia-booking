import type { SupabaseClient } from '@supabase/supabase-js'

import { delaiAvant } from '@/lib/heure-pro'
import { traduireDans } from '@/lib/i18n'

// ─────────────────────────────────────────────────────────────────────────────
// JUSQU'À QUAND LA CLIENTE PEUT DÉPLACER OU ANNULER EN LIGNE (29 oct. 2026).
//
// La pro choisit : à tout moment (rien de réglé), 24 h, 48 h ou 72 h avant le
// rendez-vous. Passé ce délai, la cliente ne peut plus ni déplacer ni annuler
// depuis sa page ou le lien du rappel : elle voit les boutons grisés et une
// ligne qui l'envoie vers sa pro (Instagram s'il est renseigné).
//
// Le délai se compte À L'HEURE DE LA PRO, comme tous les autres délais.
// Une pro sans réglage : aucun changement, jamais.
// ─────────────────────────────────────────────────────────────────────────────

const DELAIS_PERMIS = [24, 48, 72]

/** Le délai réglé par la pro, en heures ; 0 = à tout moment. */
export function heuresDelaiModif(valeur: unknown): number {
  const n = typeof valeur === 'number' ? valeur : Number(valeur)
  return DELAIS_PERMIS.includes(n) ? n : 0
}

/** Ce rendez-vous est-il trop proche pour être déplacé ou annulé en ligne ? */
export function delaiModifDepasse(dateRdv: string, fuseau: string | null | undefined, heures: number): boolean {
  if (!heures) return false
  return delaiAvant(dateRdv, fuseau) < heures * 3_600_000
}

/** Ce qu'il faut à une page pour écrire la ligne « contactez … ». */
export type InfosDelaiModif = {
  heures: number
  /** Le nom que voient les clientes : le pseudo, sinon le prénom. */
  contact: string
  /** Le pseudo Instagram, sans @ ; null s'il n'y en a pas. */
  instagram: string | null
}

export const COLONNES_DELAI_MODIF = 'delai_modif_heures, timezone, instagram, prenom, pseudo, langue'

type ProDelai = {
  delai_modif_heures?: unknown
  timezone?: string | null
  instagram?: string | null
  prenom?: string | null
  pseudo?: string | null
  langue?: string | null
}

export function infosDelaiModif(pro: ProDelai | null | undefined): InfosDelaiModif | null {
  const heures = heuresDelaiModif(pro?.delai_modif_heures)
  if (!heures) return null
  const insta = String(pro?.instagram ?? '').trim().replace(/^@/, '')
  return {
    heures,
    contact: String(pro?.pseudo || pro?.prenom || '').trim(),
    instagram: insta || null,
  }
}

/** La ligne affichée à la cliente, dans la langue de la pro. */
export function messageDelaiModif(langue: string | null | undefined, infos: InfosDelaiModif): string {
  return traduireDans(langue, infos.instagram ? 'resa.delaiModifInstagram' : 'resa.delaiModifDirect', {
    heures: infos.heures,
    pro: infos.contact,
  })
}

/**
 * Le refus du serveur, ou null si la cliente peut encore agir.
 *
 * Lit le réglage de la pro au moment de l'action : une page ouverte depuis
 * longtemps ne contourne rien.
 */
export async function refusDelaiModif(
  admin: SupabaseClient,
  proId: string,
  dateRdv: string,
): Promise<{ error: 'delai_modif_depasse'; message: string; delai_modif: InfosDelaiModif } | null> {
  const { data: pro } = await admin.from('profiles').select(COLONNES_DELAI_MODIF).eq('id', proId).maybeSingle()
  const infos = infosDelaiModif(pro as ProDelai | null)
  if (!infos) return null
  if (!delaiModifDepasse(dateRdv, (pro as ProDelai).timezone, infos.heures)) return null
  return {
    error: 'delai_modif_depasse',
    message: messageDelaiModif((pro as ProDelai).langue, infos),
    delai_modif: infos,
  }
}
