import donnees from '@/lib/catalogue-noms.json'
import { CATEGORIE_AUTRE } from '@/lib/categorie-autre'
import { langueActuelle } from '@/lib/i18n'

// ─────────────────────────────────────────────────────────────────────────────
// LES NOMS DU CATALOGUE DE GLAMIA, DANS LA LANGUE DE LA PAGE (23 oct. 2026).
//
// Une pro inscrite en français a « Manucure » dans son compte ; si sa page
// passe en italien, sa cliente doit LIRE « Manicure ». Mais rien ne change dans
// ses données : « Manucure » relie ses questions, ses offres, l'ordre de ses
// spécialités, ses rendez-vous et le contrôle des prix à la réservation.
//
// C'EST DE L'AFFICHAGE PUR. Ces fonctions ne servent qu'au moment d'écrire à
// l'écran ; tout ce qui part au serveur ou se compare garde le nom enregistré.
//
// ON NE TRADUIT QUE CE QUE GLAMIA A PROPOSÉ : une spécialité du catalogue, ou
// un soin du catalogue que la pro n'a pas renommé (nom identique, à la lettre,
// à celui du catalogue dans l'une des quatre langues). Tout ce qu'elle a écrit
// elle-même s'affiche tel quel.
//
// Les noms viennent de l'app (catalogue-noms.json, généré depuis Glamia-3.0 :
// constants/prestations.ts et la clé « catalogue » des fichiers de langue), et
// la logique est la même que lib/catalogue.ts de l'app.
// ─────────────────────────────────────────────────────────────────────────────

type Noms = Record<string, string>
type Technique = { cle: string; origine: string; noms: Noms }
type Categorie = { cle: string; origine: string; noms: Noms; techniques: Technique[] }

const CATEGORIES = (donnees as { categories: Categorie[] }).categories

const langueDe = (langue?: string | null) => langue ?? langueActuelle()
const nomDans = (noms: Noms, origine: string, langue: string) => noms[langue] || noms.fr || origine

function categorieDe(nomEnregistre: string | null | undefined): Categorie | undefined {
  const nom = (nomEnregistre ?? '').trim()
  if (!nom) return undefined
  return CATEGORIES.find(c => c.origine === nom) ?? CATEGORIES.find(c => Object.values(c.noms).includes(nom))
}

/**
 * Le nom à AFFICHER pour une spécialité enregistrée (jamais à envoyer).
 *
 * « Autre » garde sa logique : le nom que la pro lui a donné s'il existe, sinon
 * le mot « Autre » du catalogue dans la langue de la page.
 */
export function nomSpecialiteAffiche(nomEnregistre: string, perso?: string | null, langue?: string | null): string {
  const l = langueDe(langue)
  if (nomEnregistre === CATEGORIE_AUTRE) {
    const propre = (perso ?? '').trim()
    if (propre) return propre
  }
  const cat = categorieDe(nomEnregistre)
  return cat ? nomDans(cat.noms, cat.origine, l) : nomEnregistre
}

/**
 * Le nom à AFFICHER pour un soin enregistré : traduit seulement s'il vient du
 * catalogue tel quel, dans n'importe quelle langue. Sinon, son nom à elle.
 *
 * Sans spécialité connue, on cherche dans tout le catalogue ; si deux soins
 * différents portent ce nom et se traduisent différemment, on n'invente rien.
 */
export function nomSoinAffiche(nomEnregistre: string, categorieEnregistree?: string | null, langue?: string | null): string {
  const nom = (nomEnregistre ?? '').trim()
  if (!nom) return nomEnregistre
  const l = langueDe(langue)
  const connue = categorieEnregistree ? categorieDe(categorieEnregistree) : undefined
  const cats = connue ? [connue] : CATEGORIES
  const trouves = new Set<string>()
  for (const cat of cats) {
    for (const t of cat.techniques) {
      if (t.origine === nom || Object.values(t.noms).includes(nom)) trouves.add(nomDans(t.noms, t.origine, l))
    }
  }
  return trouves.size === 1 ? [...trouves][0] : nomEnregistre
}

/**
 * Une liste de soins déjà écrite en une ligne (« Manucure simple ×2, Dépose »,
 * ou « Pose gel · Nail art ») : chaque morceau est traduit s'il vient du
 * catalogue, le reste — séparateurs, quantités, noms à elle — ne bouge pas.
 */
export function soinsAffiches(texte: string | null | undefined, langue?: string | null): string {
  if (!texte) return texte ?? ''
  return texte.split(/(, | · )/).map(morceau => {
    if (morceau === ', ' || morceau === ' · ') return morceau
    const m = morceau.match(/^(.*?)( ×\d+)?$/)
    if (!m) return morceau
    return nomSoinAffiche(m[1], undefined, langue) + (m[2] ?? '')
  }).join('')
}
