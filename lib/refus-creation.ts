// ─────────────────────────────────────────────────────────────────────────────
// UN REFUS CERTAIN, OU UNE PANNE ? (inquiétude 1 de Chadi, 19 nov. 2026)
//
// Après un acompte payé, le serveur crée le rendez-vous. S'il échoue, deux cas
// très différents :
//   · un REFUS CERTAIN : le créneau est réellement pris, la journée fermée, la
//     prestation n'existe plus, la cliente est bloquée… On ne pourra jamais le
//     créer : la cliente est remboursée en entier (si le solde de la pro le couvre) ;
//   · tout le reste est une PANNE (réseau coupé, base saturée, page trop lente,
//     garde-fou des rafales, réponse illisible) : on ne rembourse JAMAIS, on garde
//     la réservation en attente et on réessaie — Mollie rappelle jusqu'à 10 fois
//     en 26 h. C'est la méthode recommandée par Stripe et Mollie : un échec
//     technique se réessaie, il ne se rembourse pas.
// Aucune dépendance : s'essaie seul (scripts/essai-refus-creation.mjs).
// ─────────────────────────────────────────────────────────────────────────────

/** Les seules raisons pour lesquelles le rendez-vous ne pourra jamais être créé. */
export const REFUS_CERTAINS = ['occupe', 'hors_grille', 'jour_ferme', 'jour_bloque', 'indisponible', 'assistante_inconnue', 'prestation_inconnue'] as const

/** Réponse de la création d'un rendez-vous → refus certain (on rembourse) ou panne (on réessaie). */
export function refusCertain(status: number | null, raison: unknown): boolean {
  if (status !== 409 && status !== 403) return false
  return typeof raison === 'string' && (REFUS_CERTAINS as readonly string[]).includes(raison)
}
