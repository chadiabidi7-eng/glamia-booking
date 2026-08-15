// ─────────────────────────────────────────────────────────────────────────────
// LA PHOTO D'UN AVIS, PRÉPARÉE DANS LE NAVIGATEUR DE LA CLIENTE.
//
// POURQUOI DEUX FICHIERS. Une photo d'avis est vue de deux façons : en tout
// petit — 72 points de côté dans l'app, une miniature sur la page de
// réservation — et en grand quand on la touche. Envoyer la grande dans les
// deux cas, c'est expédier 400 Ko pour afficher un carré de la taille d'un
// timbre. Sur des milliers de pages ouvertes chaque mois, ça finit par se
// payer, et pour rien : personne ne regarde jamais une vignette en plein
// écran.
//
// CE QU'ON NE SACRIFIE PAS. La grande fait 1440 px de côté. L'écran d'un
// iPhone 15 Pro en fait 1290 : la photo l'occupe donc entièrement, à pleine
// finesse. Au-delà on enverrait des pixels que l'écran ne sait pas afficher.
// C'est déjà plus fin que les photos d'inspiration (1280 px, qualité 0,8) et
// que les photos de prestations (1080 px, qualité 0,7) qui tournent
// aujourd'hui sans que personne s'en plaigne.
//
// LE RECADRAGE EST IMPOSÉ, EN CARRÉ. Deux avis partagés doivent se ressembler :
// c'est le cadre de la carte de story qui commande, pas la photo reçue. La
// cliente choisit ce qu'elle garde dedans, pas la forme du cadre.
// ─────────────────────────────────────────────────────────────────────────────

/** La grande : celle qu'on ouvre. */
const PLEINE_PX = 1440;
const PLEINE_QUALITE = 0.82;

/** La petite : celle qu'on affiche partout ailleurs. */
const VIGNETTE_PX = 400;
const VIGNETTE_QUALITE = 0.72;

/** Le garde-fou : au-delà, c'est que la compression n'a pas eu lieu. */
export const POIDS_MAX_OCTETS = 1_500_000;

export type PhotoPreparee = {
  pleine: string;   // data URL JPEG
  vignette: string; // data URL JPEG
};

/** Lit un fichier choisi par la cliente et le rend affichable. */
function lireFichier(fichier: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onerror = () => reject(new Error('Lecture du fichier impossible'));
    lecteur.onload = () => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Image illisible'));
      image.src = lecteur.result as string;
    };
    lecteur.readAsDataURL(fichier);
  });
}

/**
 * Dessine l'image dans un carré de `cote` pixels, en la RECADRANT par le
 * centre plutôt qu'en la déformant. Une photo d'ongles prise en portrait perd
 * du haut et du bas ; elle ne devient jamais un ovale.
 */
function carre(image: HTMLImageElement, cote: number, qualite: number): string {
  const source = Math.min(image.width, image.height);
  const x = (image.width - source) / 2;
  const y = (image.height - source) / 2;

  // On ne agrandit jamais : une photo plus petite que le cadre garde sa taille.
  const taille = Math.min(cote, source);

  const toile = document.createElement('canvas');
  toile.width = taille;
  toile.height = taille;
  const pinceau = toile.getContext('2d');
  if (!pinceau) throw new Error('Canvas indisponible');

  // Un fond blanc, au cas où la photo d'origine soit transparente : sans lui,
  // le JPEG remplirait les vides en noir.
  pinceau.fillStyle = '#ffffff';
  pinceau.fillRect(0, 0, taille, taille);
  pinceau.imageSmoothingQuality = 'high';
  pinceau.drawImage(image, x, y, source, source, 0, 0, taille, taille);

  return toile.toDataURL('image/jpeg', qualite);
}

/** Prépare la photo choisie par la cliente : la grande et sa vignette. */
export async function preparerPhotoAvis(fichier: File): Promise<PhotoPreparee> {
  const image = await lireFichier(fichier);
  return {
    pleine: carre(image, PLEINE_PX, PLEINE_QUALITE),
    vignette: carre(image, VIGNETTE_PX, VIGNETTE_QUALITE),
  };
}

/** Le poids réel d'une data URL, pour refuser ce qui n'a pas été compressé. */
export function poidsDataUrl(dataUrl: string): number {
  const virgule = dataUrl.indexOf(',');
  if (virgule < 0) return 0;
  const base64 = dataUrl.slice(virgule + 1);
  return Math.floor((base64.length * 3) / 4);
}
