// ─────────────────────────────────────────────────────────────────────────────
// LA COULEUR DE LA PRO, CONNUE AVANT LE PREMIER RENDU (Chadi, 9 oct. 2026).
//
// La page va chercher la vitrine depuis le navigateur ; le temps de cet
// aller-retour, son écran d'attente était rose Glamia chez une pro qui a
// choisi sa couleur. Le layout, côté serveur, lit le profil avant que le HTML
// parte : il pose la couleur ici, et l'écran d'attente la prend tout de suite.
// Même mécanique que la langue (LangueDeLaPro).
// ─────────────────────────────────────────────────────────────────────────────
let couleur: string | null = null

export function poserCouleurInitiale(c: string | null) {
  couleur = c
}

export function couleurInitiale(): string | null {
  return couleur
}
