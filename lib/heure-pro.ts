// ─────────────────────────────────────────────────────────────────────────────
// L'HEURE D'UN RENDEZ-VOUS N'EST PAS UN INSTANT.
//
// Un rendez-vous est enregistré à l'heure de la pro, écrite telle quelle : une
// pose à 14 h donne « 14:00 », et c'est bien 14 h qui s'affiche partout — chez
// elle, chez sa cliente, dans le mail. Tant que tout le monde était en France,
// cette convention suffisait.
//
// ELLE CRAQUE DÈS QU'ON SORT DU FUSEAU. « 14 h » ne veut rien dire tant qu'on
// ne sait pas 14 h OÙ. Comparer cette heure à l'instant présent revenait à
// traiter le 14 h d'une pro de Toronto comme un 14 h de Greenwich : six heures
// d'écart. Concrètement, l'app la laissait prélever une cliente six heures
// AVANT que son rendez-vous ait commencé, et lui fermait la porte six heures
// trop tôt. Dans l'autre sens, une pro de La Réunion devait attendre deux
// heures après le rendez-vous pour pouvoir agir.
//
// Et sur le délai d'annulation, c'est la CLIENTE qui payait : à Toronto, la
// limite des 24 h tombait en réalité à 28 h. Quelqu'un qui annulait 26 h à
// l'avance était prélevé alors qu'il était dans les clous.
//
// 32 pros étaient hors de l'heure de Paris le 16 août 2026 : 14 à La Réunion,
// 7 en Guadeloupe, 6 en Guyane, 3 au Canada, 2 en Martinique.
//
// CE FICHIER FAIT LA TRADUCTION, et c'est le seul endroit qui la connaît :
// d'une heure affichée vers un vrai instant, en tenant compte du fuseau de la
// pro et du changement d'heure.
// ─────────────────────────────────────────────────────────────────────────────

/** Quasi toutes les pros sont en France : c'est le repli, jamais une règle. */
export const FUSEAU_DEFAUT = 'Europe/Paris'

/**
 * Le vrai moment d'un rendez-vous.
 *
 * On lui donne l'heure telle qu'elle est enregistrée et le fuseau de la pro ;
 * il rend l'instant réel, comparable à `Date.now()`.
 *
 * Le décalage est mesuré À CETTE DATE-LÀ, pas aujourd'hui : un rendez-vous pris
 * en août pour novembre traverse le changement d'heure, et une heure d'écart
 * suffirait à prélever une cliente qui a annulé dans les temps.
 */
export function instantReel(heureAffichee: string, fuseau?: string | null): Date {
  const commeUtc = new Date(heureAffichee)
  const zone = fuseau || FUSEAU_DEFAUT
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: zone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }).formatToParts(commeUtc).map(p => [p.type, p.value]),
    )
    const commeLocal = Date.UTC(
      +parts.year, +parts.month - 1, +parts.day,
      +parts.hour % 24, +parts.minute, +parts.second,
    )
    const decalage = commeLocal - commeUtc.getTime()
    return new Date(commeUtc.getTime() - decalage)
  } catch {
    // Fuseau inconnu ou mal orthographié : on ne devine pas, on garde l'heure
    // telle quelle. C'est le comportement d'avant, donc jamais une régression.
    return commeUtc
  }
}

/**
 * Dans combien de temps a lieu ce rendez-vous, en millisecondes.
 *
 * Négatif s'il est déjà passé. C'est ce chiffre qui décide si une annulation
 * est tardive, et si une absence peut être prélevée.
 */
export function delaiAvant(heureAffichee: string, fuseau?: string | null): number {
  return instantReel(heureAffichee, fuseau).getTime() - Date.now()
}
