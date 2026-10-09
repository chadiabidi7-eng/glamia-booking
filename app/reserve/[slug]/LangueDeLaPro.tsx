'use client'

import { poserLangue } from '@/lib/i18n'
import { poserCouleurInitiale } from '@/lib/couleur-initiale'

// ─────────────────────────────────────────────────────────────────────────────
// LA LANGUE EST POSÉE AVANT QUE LE PREMIER MOT S'AFFICHE.
//
// La page de réservation va chercher la pro elle-même, depuis le navigateur :
// pendant cette seconde-là elle n'a aucune langue, et son écran d'attente
// disait « Chargement… » en français à la cliente d'une pro anglaise. Lui
// faire suivre la langue du navigateur ne réglait rien — c'est la vitrine de
// la pro, pas celle de qui regarde.
//
// LE SERVEUR, LUI, SAIT DÉJÀ. Le layout lit le profil pour composer le titre
// de la page ; il en connaît donc la langue avant même que le HTML parte. On
// la pose ici, dans un composant qui ENVELOPPE la page : React rend toujours
// le parent avant l'enfant, donc l'appel a lieu avant le premier rendu de
// l'écran d'attente.
//
// PAS D'EFFET, UN APPEL DIRECT. Un effet ne s'exécute qu'APRÈS le premier
// rendu — c'est-à-dire trop tard, une fois le mot français déjà à l'écran.
// ─────────────────────────────────────────────────────────────────────────────

export default function LangueDeLaPro({
  langue,
  couleur = null,
  children,
}: {
  langue: string | null
  /** La couleur de la page de la pro (Pro ou Ultra), posée avant le premier rendu : l'écran d'attente la prend. */
  couleur?: string | null
  children: React.ReactNode
}) {
  poserLangue(langue)
  poserCouleurInitiale(couleur)
  return <>{children}</>
}
