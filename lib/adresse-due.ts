// ─────────────────────────────────────────────────────────────────────────────
// L'ADRESSE EXACTE : À QUEL MOMENT ELLE EST DUE.
//
// LE PROBLÈME. La pro choisit dans l'app à partir de quand sa cliente voit son
// adresse exacte — sur sa page, à la réservation, la veille, ou jamais. Ce
// choix n'était lu qu'à un seul endroit du site : l'onglet « Adresse » de la
// page publique. Partout ailleurs — le guichet qui charge la page, l'écran de
// fin de réservation, le mail de confirmation — l'adresse partait sans qu'on se
// demande si c'était le moment.
//
// Résultat, signalé le 29 août 2026 par une pro de Genève : sa cliente recevait
// son adresse exacte dans le mail de réservation, alors qu'elle avait choisi
// « la veille ». La plupart des pros travaillent chez elles ; c'est leur
// domicile qui partait.
//
// UNE SEULE FONCTION, APPELÉE PARTOUT. Le choix ne se relit plus à la main dans
// chaque fichier : chaque endroit dit à quelle étape du parcours il se trouve,
// et la réponse tombe ici.
// ─────────────────────────────────────────────────────────────────────────────

/** Les quatre choix possibles de la pro. */
export type MomentAdresse = 'page' | 'reservation' | 'presence' | 'jamais'

/** Où l'on se trouve dans le parcours de la cliente. */
export type EtapeParcours =
  /** Elle regarde la page, elle n'a rien réservé. */
  | 'page'
  /** Elle vient de réserver : écran de fin et mail de confirmation. */
  | 'reservation'
  /** La veille : mail « vous venez toujours ? » et page de confirmation. */
  | 'presence'

const ORDRE: EtapeParcours[] = ['page', 'reservation', 'presence']

/**
 * À cette étape-là, la cliente a-t-elle droit à l'adresse exacte ?
 *
 * `jamais` ne s'ouvre à aucune étape : la pro l'envoie elle-même.
 * Une valeur absente ou inconnue vaut `reservation` — c'est le réglage par
 * défaut de l'app, et le plus prudent des trois moments possibles après
 * lecture de la page.
 */
export function adresseDue(moment: string | null | undefined, etape: EtapeParcours): boolean {
  if (moment === 'jamais') return false
  const choisi = ORDRE.indexOf(moment as EtapeParcours)
  const ici = ORDRE.indexOf(etape)
  return ici >= (choisi === -1 ? ORDRE.indexOf('reservation') : choisi)
}

/**
 * L'adresse à transmettre, ou `null`.
 *
 * Toujours préférer cette forme à un test écrit sur place : elle évite qu'un
 * appel garde l'adresse « au cas où » dans une variable qui finira dans un
 * mail.
 */
export function adressePourEtape(
  adresse: string | null | undefined,
  moment: string | null | undefined,
  etape: EtapeParcours,
): string | null {
  if (!adresseDue(moment, etape)) return null
  const propre = (adresse ?? '').trim()
  return propre.length > 0 ? propre : null
}
