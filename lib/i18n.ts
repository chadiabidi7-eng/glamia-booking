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

/**
 * Formate un montant dans la devise de la PRO (profiles.devise, ISO 4217).
 * 30 → « 30 € » (fr) / « £30 » / « $30 » — symbole placé selon la locale.
 * Affichage uniquement : AUCUNE conversion de montant.
 */
export function formatPrix(montant: number, devise: string, langue: Langue): string {
  try {
    return new Intl.NumberFormat(localeTag(langue), {
      style: 'currency',
      currency: devise || 'EUR',
      minimumFractionDigits: Number.isInteger(montant) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(montant)
  } catch {
    return `${montant} €`
  }
}

/**
 * Formate une heure "HH:mm" selon la locale du NAVIGATEUR de la cliente :
 * "14:30" → "14:30" (fr-FR) ou "2:30 PM" (en-US).
 * ⚠️ Côté serveur (navigator absent) : repli fr-FR → "14:30". À n'utiliser
 * que dans des rendus effectués après hydratation (données chargées en
 * useEffect) pour éviter tout hydration mismatch.
 */
export function formatHeure(hhmm: string): string {
  try {
    const [h, m] = hhmm.split(':').map(Number)
    if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm
    const locale = typeof navigator !== 'undefined' ? navigator.language : 'fr-FR'
    return new Date(2000, 0, 1, h, m).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
  } catch {
    return hhmm
  }
}
