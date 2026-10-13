// ─────────────────────────────────────────────────────────────────────────────
// L'ADRESSE OFFICIELLE DE LA RECHERCHE (Chadi, 13 oct. 2026).
//
// La recherche des clientes (/beaute) déménage sur glamia.fr : plus facile à
// retenir, et elle montre toutes les pros, de tous les pays. Le domaine est
// rattaché à ce projet par Chadi ; tant que l'interrupteur
// RECHERCHE_SUR_GLAMIA_FR=oui n'est pas posé, RIEN NE CHANGE : les adresses
// officielles restent sur booking.glamia.pro et /beaute ne redirige pas.
//
// Les pages de réservation, elles, restent TOUJOURS sur booking.glamia.pro.
// ─────────────────────────────────────────────────────────────────────────────

export const SITE_RESA = 'https://booking.glamia.pro'
export const SITE_GLAMIA_FR = 'https://glamia.fr'

/** L'interrupteur, posé par Chadi après la bascule du domaine. */
export const rechercheSurGlamiaFr = () => process.env.RECHERCHE_SUR_GLAMIA_FR === 'oui'

/** L'hôte officiel des pages /beaute. */
export const siteRecherche = () => (rechercheSurGlamiaFr() ? SITE_GLAMIA_FR : SITE_RESA)

/** glamia.fr ou www.glamia.fr (sans le port). */
export const estGlamiaFr = (hote: string | null | undefined) => {
  const h = (hote ?? '').toLowerCase().split(':')[0]
  return h === 'glamia.fr' || h === 'www.glamia.fr'
}
