// COPIE VOLONTAIRE du même fichier de l'app. Les deux mondes ne partagent pas
// de code — mais ici on n'utilise QUE `libelleCategorie` : « Ma spécialité »
// est un mot d'atelier, il ne doit jamais atteindre une cliente.
//
// ─────────────────────────────────────────────────────────────────────────────
// « AUTRE », LA CATÉGORIE QUE LA PRO PEUT NOMMER.
//
// Le catalogue de Glamia couvre les métiers les plus courants, jamais tous.
// Une masseuse ayurvédique, une barbière, une praticienne en réflexologie
// rangeaient tout dans « Autre » — et leurs clientes lisaient « Autre » sur la
// page de réservation. C'est le mot le plus froid de l'application, et c'est
// celui que voyaient les métiers les moins bien servis.
//
// ON NE RENOMME PAS LA CATÉGORIE ELLE-MÊME, ON LUI DONNE UN NOM D'AFFICHAGE.
// Ses prestations, les rendez-vous déjà pris, les offres et les questions à la
// cliente la désignent toutes par « Autre ». Renommer la clé casserait ces
// liens et l'historique avec. Le vrai nom reste donc « Autre » dans les
// données ; seul l'écran change.
//
// Conséquence à connaître : le nom personnalisé est un habillage. Si la pro
// l'efface, tout revient à « Autre » sans rien perdre.
// ─────────────────────────────────────────────────────────────────────────────

/** La catégorie fourre-tout, telle qu'elle est nommée dans les données. */
export const CATEGORIE_AUTRE = 'Autre';

/** Longueur maximale d'un nom personnalisé — au-delà, il déborde des cartes. */
export const MAX_NOM_CATEGORIE = 22;

/**
 * Le nom montré à la PRO tant qu'elle n'a rien choisi.
 *
 * « Autre » ne dit pas qu'on peut le changer — il se lit comme un fourre-tout
 * imposé. « Ma spécialité » dit que la case lui appartient, et le crayon à côté
 * fait le reste.
 *
 * CE NOM NE SORT JAMAIS DE L'APP. Sa cliente, elle, continue de lire « Autre »
 * tant que la pro n'a rien saisi : « Ma spécialité » sur une page de
 * réservation ne voudrait rien dire pour elle.
 */
export const NOM_PRO_PAR_DEFAUT = 'Ma spécialité';

/**
 * Le nom à afficher pour une catégorie.
 *
 * `perso` est le nom que la pro a choisi pour « Autre ». Vide ou absent : on
 * garde le nom d'origine. Toute autre catégorie est renvoyée telle quelle.
 */
export function libelleCategorie(nom: string, perso?: string | null): string {
  if (nom !== CATEGORIE_AUTRE) return nom;
  const propre = (perso ?? '').trim();
  return propre.length > 0 ? propre : CATEGORIE_AUTRE;
}

/**
 * Le nom à afficher DANS L'APP, côté pro.
 *
 * Même règle que `libelleCategorie`, avec un repli qui invite à la renommer
 * plutôt qu'un mot qui ferme la porte.
 */
export function libelleCategoriePro(nom: string, perso?: string | null): string {
  if (nom !== CATEGORIE_AUTRE) return nom;
  const propre = (perso ?? '').trim();
  return propre.length > 0 ? propre : NOM_PRO_PAR_DEFAUT;
}

/** La pro a-t-elle donné un nom à sa catégorie « Autre » ? */
export function autreEstNommee(perso?: string | null): boolean {
  return (perso ?? '').trim().length > 0;
}

/**
 * Nettoie un nom saisi par la pro.
 *
 * On refuse le vide (retour à « Autre »), on coupe à la longueur maximale, et
 * on écrase les espaces multiples — un nom avec trois espaces au milieu se lit
 * mal sur une carte et se cherche mal dans une liste.
 */
export function nettoyerNomCategorie(saisi: string): string | null {
  const propre = saisi.replace(/\s+/g, ' ').trim().slice(0, MAX_NOM_CATEGORIE);
  return propre.length > 0 ? propre : null;
}
