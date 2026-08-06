// COPIE VOLONTAIRE du même fichier de l'app : les deux mondes ne partagent pas
// de code, et une liste qui diverge se verrait tout de suite — l'icône choisie
// par la pro manquerait sur la page de sa cliente.
//
// ─────────────────────────────────────────────────────────────────────────────
// LA BANQUE D'ICÔNES DE LA CATÉGORIE PERSONNALISÉE.
//
// Les autres catégories ont un dessin fait main : un rond rose Glamia, une
// silhouette beige. Celle que la pro nomme elle-même n'en a pas — on ne peut
// pas dessiner à l'avance l'icône d'un métier qu'on ne connaît pas.
//
// Elle choisit donc parmi ces trente-quatre traits, posés dans le MÊME
// habillage : rond rose, trait beige. À l'écran, rien ne distingue son icône
// des autres — c'est tout l'intérêt, sa catégorie ne doit pas avoir l'air
// rapportée.
//
// ON RANGE LE NOM DE L'ICÔNE, PAS UN DESSIN. Les deux applications savent le
// dessiner, un nom pèse quelques octets, et il se relit dans dix ans.
//
// La liste est délibérément courte. Trois cents icônes ne l'aideraient pas à
// choisir : celles-ci couvrent les métiers que notre catalogue laisse de côté —
// massage, réflexologie, soins du corps, bien-être, coiffure masculine.
// ─────────────────────────────────────────────────────────────────────────────

/** Le rond, et le trait posé dessus. Mêmes couleurs que les dessins existants. */
export const FOND_ICONE = '#C2779E';   // rose Glamia
export const TRAIT_ICONE = '#E9C29C';  // le beige des silhouettes

/**
 * Les icônes proposées, par leur nom Lucide.
 *
 * Toutes vérifiées présentes dans les deux bibliothèques — celle de l'app et
 * celle du site de réservation. Une icône absente d'un côté ferait un trou dans
 * la page, ou pire, une erreur au chargement.
 */
export const ICONES_CATEGORIE = [
  'Sparkles', 'Flower', 'Flower2', 'Leaf', 'Sprout', 'Feather',
  'Heart', 'HeartPulse', 'Star', 'Gem', 'Crown', 'Ribbon',
  'Hand', 'Footprints', 'Bone', 'Smile', 'Eye', 'Baby',
  'Droplet', 'Droplets', 'Waves', 'Wind', 'Flame', 'Sun',
  'Moon', 'Bath', 'Shell', 'Scissors', 'Brush', 'Palette',
  'Dumbbell', 'Stethoscope', 'Syringe', 'Music',
] as const;

export type IconeCategorie = (typeof ICONES_CATEGORIE)[number];

/** Le nom rangé est-il une icône qu'on sait dessiner ? */
export function iconeValide(nom?: string | null): nom is IconeCategorie {
  return !!nom && (ICONES_CATEGORIE as readonly string[]).includes(nom);
}
