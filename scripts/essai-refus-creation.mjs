// node --experimental-strip-types scripts/essai-refus-creation.mjs
import { refusCertain } from '../lib/refus-creation.ts'
let rates = 0
const voir = (quoi, obtenu, attendu) => {
  const bon = obtenu === attendu; if (!bon) rates++
  console.log(`${bon ? 'OK  ' : 'RATÉ'} ${quoi}`)
}
voir('créneau pris → rembourser', refusCertain(409, 'occupe'), true)
voir('heure retirée de la grille → rembourser', refusCertain(409, 'hors_grille'), true)
voir('cliente bloquée → rembourser', refusCertain(403, 'indisponible'), true)
voir('base en panne (500) → réessayer', refusCertain(500, undefined), false)
voir('réseau coupé (aucune réponse) → réessayer', refusCertain(null, undefined), false)
voir('garde-fou des rafales (429) → réessayer', refusCertain(429, 'trop_de_reservations'), false)
voir('réponse illisible sur un 409 → réessayer', refusCertain(409, undefined), false)
voir('raison inconnue sur un 409 → réessayer', refusCertain(409, 'autre_chose'), false)
voir('pro introuvable (404) → réessayer', refusCertain(404, undefined), false)
if (rates) { console.error(`${rates} cas ratés`); process.exit(1) }
