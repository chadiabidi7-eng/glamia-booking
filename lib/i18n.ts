// ─────────────────────────────────────────────
// i18n du site de réservation — la langue affichée est celle de la PRO
// (profiles.langue en base : 'fr' ou 'en'), jamais celle du navigateur.
//
// ⚠️ Pas de fonction nommée `t` : la page réservation utilise massivement
// `t` comme variable de boucle (techniques) — collision garantie.
// ─────────────────────────────────────────────
import fr from '@/locales/fr.json'
import en from '@/locales/en.json'

export type Langue = 'fr' | 'en'

type Vars = Record<string, string | number>

const dicos: Record<Langue, unknown> = { fr, en }

function lookup(dico: unknown, cle: string): unknown {
  return cle.split('.').reduce<unknown>(
    (obj, k) => (obj !== null && typeof obj === 'object' ? (obj as Record<string, unknown>)[k] : undefined),
    dico,
  )
}

function interpoler(texte: string, vars?: Vars): string {
  if (!vars) return texte
  return texte.replace(/\{\{(\w+)\}\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m))
}

/**
 * Traduit une clé `a.b.c` dans la langue demandée.
 * - Repli sur le français si la clé est absente en anglais.
 * - Interpolation `{{var}}` via `vars`.
 * - Pluriels : valeur objet `{ one, other }` choisie par `vars.count` (=1 → one).
 */
export function tr(langue: Langue, cle: string, vars?: Vars): string {
  let valeur = lookup(dicos[langue], cle)
  if (valeur === undefined && langue !== 'fr') valeur = lookup(dicos.fr, cle)
  if (valeur !== null && typeof valeur === 'object' && !Array.isArray(valeur)) {
    const pluriel = valeur as { one?: string; other?: string }
    if (pluriel.one !== undefined || pluriel.other !== undefined) {
      valeur = Number(vars?.count) === 1 ? (pluriel.one ?? pluriel.other) : (pluriel.other ?? pluriel.one)
    }
  }
  if (typeof valeur !== 'string') return cle
  return interpoler(valeur, vars)
}

/** Retourne un traducteur lié à une langue : `const trad = creerTr(langue)`. */
export function creerTr(langue: Langue) {
  return (cle: string, vars?: Vars) => tr(langue, cle, vars)
}

function tableauLoc(langue: Langue, cle: string): string[] {
  const valeur = lookup(dicos[langue], cle) ?? lookup(dicos.fr, cle)
  return Array.isArray(valeur) ? (valeur as string[]) : []
}

/** Mois capitalisés (Janvier / January). */
export function moisLoc(langue: Langue): string[] {
  return tableauLoc(langue, 'calendrier.mois')
}

/** Mois en minuscules FR (janvier) / capitalisés EN (January). */
export function moisMinLoc(langue: Langue): string[] {
  return tableauLoc(langue, 'calendrier.moisMin')
}

/** Jours abrégés, semaine commençant lundi (Lun / Mon). */
export function joursCourtLoc(langue: Langue): string[] {
  return tableauLoc(langue, 'calendrier.joursCourt')
}

/** Jours longs indexés par Date.getDay() — dimanche en premier. */
export function joursLongsLoc(langue: Langue): string[] {
  return tableauLoc(langue, 'calendrier.joursLongs')
}

/** Tag de locale pour toLocaleDateString & co. */
export function localeTag(langue: Langue): 'fr-FR' | 'en-GB' {
  return langue === 'en' ? 'en-GB' : 'fr-FR'
}
