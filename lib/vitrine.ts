// ─────────────────────────────────────────────────────────────────────────────
// CE QUE LA PAGE DE RÉSERVATION MONTRE DE LA PRO.
//
// Les mêmes mots que dans son app. Une pro qui écrit « Enfants acceptés » chez
// elle doit lire « Enfants acceptés » sur sa page — deux formulations pour une
// même ligne, et elle ne reconnaît plus ce qu'elle a réglé.
// ─────────────────────────────────────────────────────────────────────────────

/** Les six conditions, dans un ordre qui ne change jamais d'une pro à l'autre. */
export const CONDITIONS: { cle: string; libelle: string }[] = [
  { cle: 'accompagnant', libelle: 'Accompagnant accepté' },
  { cle: 'enfants',      libelle: 'Enfants acceptés' },
  { cle: 'hommes',       libelle: 'Hommes acceptés' },
  { cle: 'handicap',     libelle: 'Accès handicapé' },
  { cle: 'parking',      libelle: 'Parking à proximité' },
  { cle: 'animaux',      libelle: 'Animaux sur place' },
]

/**
 * Celles qui portent une réponse. Le reste n'existe pas pour la cliente.
 *
 * Les six du catalogue d'abord — l'ordre ne change jamais d'une pro à l'autre,
 * c'est ce qui rend deux pages comparables en trois secondes. Puis celles que
 * la pro a écrites elle-même, dans son ordre à elle : leur libellé voyage avec
 * la réponse, sous une clé préfixée.
 */
const PREFIXE_PERSO = 'perso:'

export function conditionsAffichees(
  accueil: Record<string, boolean | null> | null | undefined,
): { libelle: string; oui: boolean }[] {
  if (!accueil) return []
  const catalogue = CONDITIONS
    .filter(c => typeof accueil[c.cle] === 'boolean')
    .map(c => ({ libelle: c.libelle, oui: accueil[c.cle] === true }))
  const siennes = Object.keys(accueil)
    .filter(cle => cle.startsWith(PREFIXE_PERSO) && typeof accueil[cle] === 'boolean')
    .map(cle => ({ libelle: cle.slice(PREFIXE_PERSO.length), oui: accueil[cle] === true }))
  return [...catalogue, ...siennes]
}

/**
 * Quand la cliente recevra l'adresse exacte.
 *
 * Une page qui montre un quartier et se tait sur le reste laisse croire qu'il
 * n'y aura jamais d'adresse. La phrase fait la différence entre une discrétion
 * voulue et une information qui manque.
 */
export function quandLAdresse(moment: string): string | null {
  switch (moment) {
    case 'reservation':
      return 'L’adresse exacte vous sera communiquée dès votre réservation.'
    case 'presence':
      return 'L’adresse exacte vous sera communiquée à la confirmation de votre présence, la veille.'
    case 'jamais':
      return 'L’adresse exacte vous sera envoyée directement par votre praticienne.'
    default:
      return null
  }
}
