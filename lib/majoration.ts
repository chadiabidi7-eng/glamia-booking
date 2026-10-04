// ─────────────────────────────────────────────────────────────────────────────
// LES MAJORATIONS SUR LA PAGE DE RÉSERVATION (3.0, 4 octobre 2026)
//
// La pro les règle dans l'app (écran Majorations, formule Ultra) : jours
// fériés, après une heure, avant une heure, certains jours, une période. Ici,
// la même règle que l'app (lib/majoration.ts côté app) :
//   - UNE SEULE MAJORATION PAR RENDEZ-VOUS, LA PLUS FORTE — jamais de cumul ;
//   - appliquée au prix des prestations (offre comprise), AVANT la fidélité et
//     la réduction de la cliente.
//
// Les jours fériés ne se calculent pas dans le navigateur : la bibliothèque
// pèse lourd. Le serveur les résout en dates (`dates`) avant d'envoyer la
// configuration (voir lib/majoration-serveur.ts) ; ce fichier-ci ne fait que
// comparer, il sert aussi bien à la page qu'au serveur.
// Pas de « dernière minute » : refusée par Chadi le 4 oct. 2026.
// ─────────────────────────────────────────────────────────────────────────────

export type TypeMajoration = 'ferie' | 'apres' | 'avant' | 'jours' | 'periode'

/** Une règle telle que la page la reçoit : les fériés déjà résolus en dates. */
export type RegleResolue = {
  type: TypeMajoration
  pourcentage: number
  heure?: string
  jours?: number[]
  debut?: string
  fin?: string
  /** Jours fériés : les dates « AAAA-MM-JJ » concernées (cette année et la suivante). */
  dates?: string[]
}
export type MajorationsResolues = { regles: RegleResolue[] } | null
export type MajorationAppliquee = { pourcentage: number; libelle: string }

const minutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0) }

/** Une règle s'applique-t-elle à ce créneau (date « AAAA-MM-JJ », heure de début « HH:MM ») ? */
export function regleSApplique(r: RegleResolue, date: string, heure: string): boolean {
  switch (r.type) {
    case 'ferie': return !!r.dates?.includes(date)
    case 'apres': return !!r.heure && !!heure && minutes(heure) >= minutes(r.heure)
    case 'avant': return !!r.heure && !!heure && minutes(heure) < minutes(r.heure)
    case 'jours': return !!r.jours?.includes(new Date(`${date}T12:00:00Z`).getUTCDay())
    case 'periode': return !!r.debut && !!r.fin && date >= r.debut && date <= r.fin
    default: return false
  }
}

/** La règle la plus forte qui s'applique à ce créneau, ou null. */
export function regleDuCreneau(config: MajorationsResolues | undefined, date: string, heure: string): RegleResolue | null {
  if (!config?.regles?.length || !date || !heure) return null
  let meilleure: RegleResolue | null = null
  for (const r of config.regles) {
    if (typeof r?.pourcentage !== 'number' || r.pourcentage <= 0) continue
    if (regleSApplique(r, date, heure) && (!meilleure || r.pourcentage > meilleure.pourcentage)) meilleure = r
  }
  return meilleure
}

/** Le pourcentage de majoration de ce créneau (0 s'il n'y en a pas). */
export const pourcentageDuCreneau = (config: MajorationsResolues | undefined, date: string, heure: string) =>
  regleDuCreneau(config, date, heure)?.pourcentage ?? 0

/** Même arrondi que l'app : au centime. */
export const majorer = (prix: number, pourcentage: number) =>
  pourcentage > 0 ? Math.round(prix * (1 + pourcentage / 100) * 100) / 100 : prix
