// UNE COULEUR TROP PÂLE EST FONCÉE, PAS REMPLACÉE (Chadi, 29 oct. 2026).
// Sur fond blanc, une pro qui choisit un pêche très clair ou un presque-blanc
// rendait ses mentions et ses icônes invisibles. Sous le seuil, on assombrit
// pas à pas en gardant la teinte, JUSTE ce qu'il faut pour atteindre le
// niveau du jaune #F4C173 (contraste 1,65), jugé lisible : la différence doit
// rester presque invisible. Les couleurs au-dessus restent telles quelles.
// SEULEMENT POUR LES TEXTES : fonds, bordures, icônes gardent sa couleur.
const CONTRASTE_MINIMUM = 1.6
const CONTRASTE_VISE = 1.65
function luminance(r: number, g: number, b: number) {
  const c = [r, g, b].map(v => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
export function lisibleSurBlanc(couleur: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(couleur.trim())
  if (!m) return couleur
  let [r, g, b] = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16))
  const contraste = () => 1.05 / (luminance(r, g, b) + 0.05)
  if (contraste() >= CONTRASTE_MINIMUM) return couleur
  for (let i = 0; i < 40 && contraste() < CONTRASTE_VISE; i++) { r *= 0.95; g *= 0.95; b *= 0.95 }
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
}
