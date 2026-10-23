// ─────────────────────────────────────────────────────────────────────────────
// LA COPIE DE LA RÉSERVATION, DÉPOSÉE JUSTE AVANT LE PAIEMENT (23 oct. 2026).
//
// Dans la réservation normale, rien ne change : la page crée le rendez-vous,
// comme toujours. La copie ne sert QUE si la page meurt après l'encaissement
// (validation dans l'app de la banque, Apple Pay, page rechargée) : 17 fois
// entre le 24 août et le 23 octobre 2026, 17 paiements sans rendez-vous.
//
// UN SEUL CRÉATEUR. Le premier qui commence — la page ou le serveur — prend la
// copie ; l'autre s'arrête. Jamais deux rendez-vous pour un paiement.
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js'

export type PriseDeCopie =
  | { libre: true }
  | { libre: false; rdvId: string | null; refuse?: string }

const pause = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * La page commence à créer : elle prend la copie, si le serveur ne l'a pas
 * déjà fait. Si le serveur est EN TRAIN de vérifier, elle attend son verdict
 * (25 s au plus) au lieu de conclure trop vite.
 */
export async function prendreLaCopiePourLaPage(admin: SupabaseClient, intentId: string): Promise<PriseDeCopie> {
  for (let tour = 0; tour < 25; tour++) {
    const { data: prise } = await admin.from('reservations_en_attente')
      .update({ statut: 'page', maj_le: new Date().toISOString() })
      .eq('intent_id', intentId).eq('statut', 'en_attente')
      .select('intent_id')
    if ((prise ?? []).length) return { libre: true }
    const { data: ligne } = await admin.from('reservations_en_attente')
      .select('statut, rdv_id, resultat').eq('intent_id', intentId).maybeSingle()
    // Pas de copie (dépôt raté), déjà à la page, ou abandonnée : comme d'habitude.
    if (!ligne || ligne.statut === 'page' || ligne.statut === 'abandonne') return { libre: true }
    if (ligne.statut === 'cree') return { libre: false, rdvId: (ligne.rdv_id as string | null) ?? null }
    if (ligne.statut === 'refuse') {
      return { libre: false, rdvId: null, refuse: ((ligne.resultat as { raison?: string } | null)?.raison) ?? 'refuse' }
    }
    if (ligne.statut === 'en_attente') continue
    await pause(1000) // 'serveur' : il vérifie, on attend
  }
  return { libre: false, rdvId: null }
}
