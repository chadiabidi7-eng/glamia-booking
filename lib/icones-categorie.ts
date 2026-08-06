// COPIE VOLONTAIRE du même fichier de l'app : les deux mondes ne partagent pas
// de code, et une liste qui diverge se verrait tout de suite — l'icône choisie
// par la pro manquerait sur la page de sa cliente. Ici on ne se sert que de
// `iconeValide` : le choix se fait dans l'app, la page ne fait que dessiner.
//
// ─────────────────────────────────────────────────────────────────────────────
// LES ICÔNES DE LA CATÉGORIE PERSONNALISÉE.
//
// Les autres catégories ont un dessin fait main. Celle que la pro nomme
// elle-même n'en a pas — on ne peut pas dessiner à l'avance l'icône d'un métier
// qu'on ne connaît pas. Elle choisit donc parmi ces traits, posés dans le MÊME
// habillage que les autres : rond rose Glamia, trait beige. Posée à côté de
// Manucure ou de Cils, sa catégorie ne doit pas avoir l'air rapportée.
//
// CHACUNE RÉPOND À LA MÊME QUESTION : quel métier de beauté ou de bien-être
// notre catalogue laisse-t-il de côté ? La première version alignait une goutte
// d'eau, du feu, une étoile — jolis, mais qui ne représentaient rien, et la pro
// cherchait quoi en faire. Le métier visé est écrit en commentaire de chaque
// ligne : il ne s'affiche pas, il sert à ne pas ajouter d'icône décorative la
// prochaine fois.
//
// PAS DE MASSAGE ICI : c'est une vraie catégorie depuis le 6 août, avec son
// propre dessin. Le proposer deux fois n'aiderait personne.
//
// ON RANGE LE NOM DE L'ICÔNE, PAS UN DESSIN : les deux applications savent le
// dessiner, ça pèse quelques octets, et ça se relit dans dix ans.
// ─────────────────────────────────────────────────────────────────────────────

/** Le rond, et le trait posé dessus. Mêmes couleurs que les dessins existants. */
export const FOND_ICONE = '#C2779E';   // rose Glamia
export const TRAIT_ICONE = '#E9C29C';  // le beige des silhouettes

/**
 * Les icônes proposées, par leur nom Lucide.
 *
 * Toutes vérifiées présentes dans les deux bibliothèques — celle de l'app et
 * celle du site de réservation. Une icône absente d'un côté ferait un trou dans
 * la page de la cliente.
 */
export const ICONES_CATEGORIE: string[] = [
  'HandHeart',    // soins du corps
  'Footprints',   // réflexologie, podologie
  'Zap',          // épilation laser
  'Snowflake',    // cryolipolyse, soin froid
  'Flame',        // hammam, soin chaud
  'Waves',        // spa, balnéothérapie
  'Bath',         // sauna, bain
  'Droplets',     // drainage, hydratation
  'Pipette',      // sérums, soins ciblés
  'Syringe',      // mésothérapie
  'PenTool',      // tatouage, dermographe
  'Gem',          // bijoux dentaires, strass
  'Ear',          // perçage d'oreilles
  'Scissors',     // barbier, coupe
  'Crown',        // extensions, perruques
  'Brush',        // maquillage
  'Palette',      // colorimétrie
  'ScanFace',     // diagnostic de peau
  'Eye',          // soins du regard
  'Leaf',         // naturopathie, bio
  'Sprout',       // soins naturels
  'Flower2',      // bien-être
  'Moon',         // sophrologie, relaxation
  'Brain',        // hypnose, coaching
  'Dumbbell',     // coaching sportif
  'Activity',     // kinésithérapie
  'Bone',         // ostéopathie
  'Stethoscope',  // soins paramédicaux
  'Baby',         // soins bébé, future maman
  'Music',        // sonothérapie
  'Shell',        // soins marins
  'Sparkles',     // un autre soin
];

/** Le nom rangé est-il une icône qu'on sait dessiner ? */
export function iconeValide(nom?: string | null): boolean {
  return !!nom && ICONES_CATEGORIE.includes(nom);
}
