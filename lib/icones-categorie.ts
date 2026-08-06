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
// CHAQUE ICÔNE PORTE UN MÉTIER, ET C'EST TOUT L'INTÉRÊT. La première version de
// cette liste alignait une goutte d'eau, du feu, une étoile — jolis, mais qui
// ne représentaient rien. La pro cherchait quoi en faire. Celles-ci répondent
// toutes à la même question : quel métier de beauté ou de bien-être notre
// catalogue laisse-t-il de côté ? Réflexologie, épilation laser, tatouage,
// barbier, drainage, sophrologie, soins bébé…
//
// Le métier est écrit sous chaque icône au moment de choisir. Sans lui, on ne
// devine pas qu'une empreinte de pied veut dire réflexologie.
//
// ON RANGE LE NOM DE L'ICÔNE, PAS UN DESSIN : les deux applications savent le
// dessiner, ça pèse quelques octets, et ça se relit dans dix ans.
// ─────────────────────────────────────────────────────────────────────────────

/** Le rond, et le trait posé dessus. Mêmes couleurs que les dessins existants. */
export const FOND_ICONE = '#C2779E';   // rose Glamia
export const TRAIT_ICONE = '#E9C29C';  // le beige des silhouettes

/**
 * Les icônes proposées : nom Lucide, et le métier qu'elles évoquent.
 *
 * Toutes vérifiées présentes dans les deux bibliothèques — celle de l'app et
 * celle du site de réservation. Une icône absente d'un côté ferait un trou dans
 * la page de la cliente.
 */
export const ICONES_CATEGORIE: { nom: string; metier: string }[] = [
  { nom: 'Hand',         metier: 'Massage, modelage' },
  { nom: 'HandHeart',    metier: 'Soins du corps' },
  { nom: 'Footprints',   metier: 'Réflexologie, podologie' },
  { nom: 'Zap',          metier: 'Épilation laser' },
  { nom: 'Snowflake',    metier: 'Cryolipolyse, soin froid' },
  { nom: 'Flame',        metier: 'Pierres chaudes, hammam' },
  { nom: 'Waves',        metier: 'Spa, balnéothérapie' },
  { nom: 'Bath',         metier: 'Sauna, bain' },
  { nom: 'Droplets',     metier: 'Drainage, hydratation' },
  { nom: 'Pipette',      metier: 'Sérums, soins ciblés' },
  { nom: 'Syringe',      metier: 'Mésothérapie' },
  { nom: 'PenTool',      metier: 'Tatouage, dermographe' },
  { nom: 'Gem',          metier: 'Bijoux dentaires, strass' },
  { nom: 'Ear',          metier: 'Perçage d’oreilles' },
  { nom: 'Scissors',     metier: 'Barbier, coupe' },
  { nom: 'Crown',        metier: 'Extensions, perruques' },
  { nom: 'Brush',        metier: 'Maquillage' },
  { nom: 'Palette',      metier: 'Colorimétrie' },
  { nom: 'ScanFace',     metier: 'Diagnostic de peau' },
  { nom: 'Eye',          metier: 'Soins du regard' },
  { nom: 'Leaf',         metier: 'Naturopathie, bio' },
  { nom: 'Sprout',       metier: 'Soins naturels' },
  { nom: 'Flower2',      metier: 'Bien-être' },
  { nom: 'Moon',         metier: 'Sophrologie, relaxation' },
  { nom: 'Brain',        metier: 'Hypnose, coaching' },
  { nom: 'Dumbbell',     metier: 'Coaching sportif' },
  { nom: 'Activity',     metier: 'Kinésithérapie' },
  { nom: 'Bone',         metier: 'Ostéopathie' },
  { nom: 'Stethoscope',  metier: 'Soins paramédicaux' },
  { nom: 'HeartPulse',   metier: 'Massage thérapeutique' },
  { nom: 'Baby',         metier: 'Soins bébé, future maman' },
  { nom: 'Music',        metier: 'Sonothérapie' },
  { nom: 'Shell',        metier: 'Soins marins' },
  { nom: 'Sparkles',     metier: 'Un autre soin' },
];

/** Le nom rangé est-il une icône qu'on sait dessiner ? */
export function iconeValide(nom?: string | null): boolean {
  return !!nom && ICONES_CATEGORIE.some(i => i.nom === nom);
}

/** Le métier associé à une icône, pour l'afficher au moment de choisir. */
export function metierDeLIcone(nom?: string | null): string | null {
  return ICONES_CATEGORIE.find(i => i.nom === nom)?.metier ?? null;
}
