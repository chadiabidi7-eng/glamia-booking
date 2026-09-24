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
export const OMBRE_ICONE = '#8E4E72';  // le prune sous le trait : du relief, comme les dessins

/**
 * Les icônes proposées, par leur nom Lucide.
 *
 * Toutes vérifiées présentes dans les deux bibliothèques — celle de l'app et
 * celle du site de réservation. Une icône absente d'un côté ferait un trou dans
 * la page de la cliente.
 */
export const ICONES_CATEGORIE: string[] = [
  // Mains, visage, regard
  'HandHeart',    // soins du corps
  'Hand',         // massage des mains, réflexologie palmaire
  'Smile',        // soins du sourire
  'ScanFace',     // diagnostic de peau
  'Eye',          // soins du regard
  'Ear',          // perçage d'oreilles
  'Brush',        // maquillage
  'Paintbrush',   // nail art, body painting
  'Palette',      // colorimétrie
  'SprayCan',     // bronzage en cabine, spray
  'Pipette',      // sérums, soins ciblés
  'Droplets',     // drainage, hydratation
  'Droplet',      // huiles, gouttes
  'Bubbles',      // gommage, mousse
  'Sparkle',      // éclat, glow
  'Gem',          // bijoux dentaires, strass
  'Diamond',      // luxe, pierres
  'Crown',        // extensions, perruques
  'Ribbon',       // nœuds, cérémonie
  'Scissors',     // barbier, coupe
  'Feather',      // légèreté, plumes
  'Wind',         // brushing, séchage
  // Corps, pieds, mouvement
  'Footprints',   // réflexologie, podologie
  'PersonStanding', // posture, silhouette
  'Accessibility',  // mobilité, adaptation
  'Dumbbell',     // coaching sportif
  'Activity',     // kinésithérapie
  'Bike',         // sport, cardio
  'HeartPulse',   // cardio, bien-être
  'Bone',         // ostéopathie
  'Brain',        // hypnose, coaching
  'Dna',          // génétique, cellulaire
  'Baby',         // soins bébé, future maman
  // Chaud, froid, eau
  'Zap',          // épilation laser
  'Flame',        // hammam, soin chaud
  'Snowflake',    // cryolipolyse, soin froid
  'Waves',        // spa, balnéothérapie
  'Bath',         // sauna, bain
  'ShowerHead',   // douche, hydrothérapie
  'Shell',        // soins marins
  'Sun',          // solarium, bronzage
  'Sunrise',      // réveil, matin
  'Moon',         // sophrologie, relaxation
  'Cloud',        // douceur, apaisement
  'Rainbow',      // couleurs, chromothérapie
  // Nature, plantes, nourriture
  'Leaf',         // naturopathie, bio
  'Sprout',       // soins naturels
  'Flower',       // fleurs
  'Flower2',      // bien-être
  'Clover',       // chance, nature
  'TreePalm',     // exotique, vacances
  'Trees',        // forêt, nature
  'Apple',        // nutrition
  'Salad',        // diététique
  'Carrot',       // alimentation
  'Cherry',       // gourmandise
  'Citrus',       // vitamines, fraîcheur
  'Grape',        // vinothérapie
  'Wheat',        // céréales, grains
  'Coffee',       // pause, café
  'Cake',         // pâtisserie, anniversaire
  'Candy',        // douceurs
  'Utensils',     // cuisine, traiteur
  // Santé
  'Stethoscope',  // soins paramédicaux
  'Syringe',      // mésothérapie
  'Pill',         // compléments
  'Thermometer',  // fièvre, température
  'Bandage',      // pansement, soin
  'Microscope',   // analyse
  'TestTube',     // laboratoire
  'FlaskConical', // chimie, formulation
  'Atom',         // science, énergie
  // Animaux
  'PawPrint',     // toilettage
  'Dog',          // chiens
  'Cat',          // chats
  'Bird',         // oiseaux
  'Fish',         // aquarium
  'Rabbit',       // petits animaux
  // Arts, musique, création
  'Music',        // sonothérapie
  'Headphones',   // écoute, podcast
  'Mic',          // voix, chant
  'Guitar',       // musique
  'Piano',        // piano
  'Camera',       // photographie
  'Video',        // vidéo
  'Film',         // cinéma
  'Clapperboard', // tournage
  'Drama',        // théâtre
  'PenTool',      // tatouage, dermographe
  'Pen',          // écriture, calligraphie
  'Pencil',       // dessin
  'Highlighter',  // surlignage
  'Origami',      // papier, création
  'Stamp',        // tampon, papeterie
  'Puzzle',       // jeux, casse-tête
  'Dices',        // jeux
  'Gamepad2',     // jeux vidéo
  // Maison, objets, métiers
  'Shirt',        // couture, stylisme
  'Glasses',      // opticien, lunettes
  'Watch',        // horlogerie
  'Ruler',        // mesure, patron
  'Wrench',       // réparation
  'Hammer',       // bricolage
  'Key',          // clés, conciergerie
  'House',        // à domicile
  'Store',        // boutique
  'Hotel',        // hôtellerie
  'Building',     // immeuble, bureau
  'Bed',          // literie, sommeil
  'Sofa',         // salon, détente
  'Armchair',     // fauteuil
  'Lamp',         // luminaire, ambiance
  'Car',          // voiture
  'Bus',          // transport
  'Plane',        // voyage
  'Ship',         // croisière
  'Sailboat',     // voile
  'Anchor',       // marine
  'Mountain',     // montagne, randonnée
  'Tent',         // camping
  'Compass',      // orientation
  'MapPin',       // lieu
  'Globe',        // international
  'Umbrella',     // pluie, protection
  // Symboles
  'Sparkles',     // un autre soin
  'Star',         // étoile
  'Heart',        // amour, cœur
  'HeartHandshake', // entraide
  'Handshake',    // accord, partenariat
  'ThumbsUp',     // approbation
  'Award',        // récompense
  'Trophy',       // trophée
  'Medal',        // médaille
  'Target',       // objectif
  'Rocket',       // lancement
  'Lightbulb',    // idée
  'Magnet',       // attraction
  'Infinity',     // infini
  'Hourglass',    // temps
  'Timer',        // minuteur
  'Clock',        // horaire
  'Bell',         // rappel
  'Gift',         // cadeau
  'ShoppingBag',  // boutique, achats
  'Tag',          // étiquette, promo
  'Package',      // colis, pack
  'Layers',       // couches, empilement
  'Users',        // groupe, équipe
  'User',         // personne
  'GraduationCap', // formation, cours
  'Book',         // livre
  'BookOpen',     // lecture
  'Laptop',       // en ligne, visio
  'Phone',        // téléphone
  'MessageCircle', // conversation
  'Mail',         // courrier
];

/** Le nom rangé est-il une icône qu'on sait dessiner ? */
export function iconeValide(nom?: string | null): boolean {
  return !!nom && ICONES_CATEGORIE.includes(nom);
}
