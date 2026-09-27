// ─────────────────────────────────────────────────────────────────────────────
// LA COULEUR DE LA PRO, DÉCLINÉE (3.0, 27 sept. 2026).
//
// Une pro Ultra choisit UNE couleur pour sa page (Chadi : « une seule couleur,
// la même partout, bouton inclus »). Elle habille la vitrine et toutes les
// étapes de la réservation, jusqu'à la confirmation. On en tire une teinte très
// pâle (fonds) et une plus sombre (textes sur fond pâle). Seul le pied « Glamia
// pour les pros » garde le rose de Glamia : il est à nous, pas à elle.
// ─────────────────────────────────────────────────────────────────────────────

/** Une couleur « #RRGGBB » exploitable, ou null. */
export function couleurValide(c: unknown): string | null {
  return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c.toUpperCase() : null
}

function melanger(hex: string, vers: [number, number, number], part: number): string {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v, i) => Math.round(v + (vers[i] - v) * part))
  return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

/** Très pâle : les fonds (sa couleur à 10 %, le reste en blanc). */
export const pale = (hex: string, part = 0.9) => melanger(hex, [255, 255, 255], part)
/** Plus sombre : les textes et pastilles posés sur un fond pâle. */
export const fonce = (hex: string, part = 0.28) => melanger(hex, [0, 0, 0], part)
