import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import { prochaineDispo } from '@/lib/prochaine-dispo'

// ─────────────────────────────────────────────────────────────────────────────
// LA RECHERCHE DES CLIENTES — glamia.pro/beaute/[ville] (3.0, 27 sept. 2026)
//
// Qui y figure : toute pro dont la page de réservation est ouverte, qui n'a pas
// demandé à en sortir (profiles.sur_glamia), et dont on connaît la ville —
// celle qu'elle a donnée dans la 3.0, ou à défaut celle déduite de l'adresse
// qu'elle avait écrite avant (table pros_localisees, remplie une fois pour
// essayer la recherche avant la sortie).
//
// CE QUI NE SORT JAMAIS D'ICI : son adresse. Sur la carte, sa photo est posée à
// quelques centaines de mètres de chez elle, toujours au même endroit pour une
// même pro (sinon elle « bougerait » d'une visite à l'autre et on pourrait
// deviner le vrai point en moyennant). Beaucoup travaillent à leur domicile.
//
// LA BASE EST PROTÉGÉE : une ville = quelques requêtes bornées, et la page est
// mise en cache cinq minutes. La prochaine disponibilité est cherchée sur trente
// jours, quatre pros à la fois, pas plus de soixante pros par ville.
// ─────────────────────────────────────────────────────────────────────────────

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const MAX_PROS = 60

// ON NE DEVINE PLUS AUCUNE ADRESSE (Chadi, 14 oct. 2026, ferme) : les villes
// déduites le 26 septembre de l'ancienne adresse (table pros_localisees) ne
// servent plus nulle part. Une user n'apparaît que dans la ville qu'elle a
// donnée elle-même. La table reste en base, rien n'est supprimé.
const AUCUNE_VILLE_DEVINEE = { data: [] as { pro_id: string; lat: number; lon: number; ville_recherche?: string }[], error: null as { message: string } | null }
const HORIZON_DISPO = 30

import type { Metier } from '@/lib/beaute-textes'
export type { Metier }
/** Dans l'ordre où les pros les pratiquent le plus. */
export const METIERS: Metier[] = ['manucure', 'pedicure', 'cils', 'sourcils', 'coiffure', 'epilation', 'soinVisage', 'maquillage', 'maquillageSemi', 'massage', 'soinDentaire', 'bronzage']

const aplatir = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

/** Les noms des spécialités du catalogue, dans les trois langues de l'app. */
const NOMS: Record<Metier, string[]> = {
  manucure: ['Manucure', 'Manicure', 'Manicura'],
  pedicure: ['Pédicure', 'Pedicure', 'Pedicura'],
  cils: ['Cils', 'Lashes', 'Pestañas'],
  sourcils: ['Sourcils', 'Brows', 'Cejas'],
  coiffure: ['Coiffure', 'Hair', 'Peluquería'],
  epilation: ['Épilation', 'Waxing', 'Depilación'],
  soinVisage: ['Soin visage', 'Facials', 'Tratamientos faciales'],
  maquillage: ['Maquillage', 'Make-up', 'Maquillaje'],
  maquillageSemi: ['Maquillage semi-permanent', 'Semi-permanent make-up', 'Micropigmentación'],
  massage: ['Massage', 'Masaje'],
  soinDentaire: ['Soin dentaire', 'Teeth', 'Estética dental'],
  bronzage: ['Bronzage', 'Tanning', 'Bronceado'],
}
const PAR_NOM = new Map<string, Metier>()
for (const [m, noms] of Object.entries(NOMS) as [Metier, string[]][]) for (const n of noms) PAR_NOM.set(aplatir(n), m)

/** Une catégorie de son catalogue → sa spécialité. Une catégorie qu'elle a nommée elle-même n'en a pas. */
const metierDe = (categorie: string): Metier | null => PAR_NOM.get(aplatir(categorie)) ?? null

export type ProTrouvee = {
  /** Ultra : mise en avant — en tête de la liste, les Ultra tournant entre elles chaque jour (Chadi, 9 oct. 2026). */
  enAvant: boolean
  /** Le rang du jour parmi les mises en avant (stable 24 h, différent chaque jour). */
  rangDuJour: number
  slug: string
  nom: string
  photo: string | null
  lat: number
  lon: number
  note: number | null
  nbAvis: number
  metiers: Metier[]
  dispo: { date: string; heure: string } | null
  /** Au moins 3 photos de réalisation : elle passe en tête (un conseil, pas une règle). */
  avecPhotos: boolean
  /** Sa phrase d'accroche (la bio de sa page), coupée à 160 caractères. */
  accroche: string | null
  /** Ses quatre premières photos de réalisation. */
  photos: string[]
  /** Son prix le plus bas parmi ce qu'elle propose vraiment (« à partir de »), dans sa monnaie. */
  prixMin: { montant: number; devise: string } | null
  /** Page d'une ville : elle n'est pas dans la ville mais à moins de 10 km de son centre (« Tout près »). */
  prochaine?: boolean
  /** Elle a choisi la ville à montrer : on ne la range que dans celle-là. */
  villeChoisie?: boolean
  /** La ville qu'elle a écrite (« Lyon 3e ») : sert à la ranger dans sa ville. */
  villeLien?: string
}

/**
 * `base` : le nom seul (« valence ») ; `slug` : l'adresse de la page, qui porte
 * aussi la région quand une autre ville du même nom est plus peuplée
 * (« valence-tarn-et-garonne »). Voir `homonymes` (25 oct. 2026).
 */
export type Ville = { nom: string; slug: string; base?: string; zone?: string | null; population?: number; pays: string; lat: number | null; lon: number | null }

// ─────────────────────────────────────────────────────────────────────────────
// LES VILLES DU MÊME NOM (25 oct. 2026).
//
// « Valence » est dans la Drôme ET dans le Tarn-et-Garonne ; « Saint-Louis » à
// La Réunion ET en Alsace ; « Houston » en Écosse ET au Texas. Avant, une page
// prenait toujours la plus peuplée : la pro de Valence (82) était rangée sur la
// page de Valence (26), à 300 km de chez elle — où elle n'apparaissait donc pas,
// et la page restait vide.
//
// Maintenant chaque ville a sa page. La plus peuplée garde l'adresse simple
// (/beaute/valence) ; les autres portent leur région (/beaute/valence-tarn-et-garonne).
// Une pro est rangée dans la ville de ce nom de SON pays, la plus proche de
// chez elle — ou, sans position, la plus peuplée de son pays.
// ─────────────────────────────────────────────────────────────────────────────

/** L'outre-mer a son propre code dans la liste des villes, mais c'est la France. */
const OUTRE_MER = new Set(['RE', 'GP', 'MQ', 'GF', 'YT', 'PM', 'BL', 'MF', 'NC', 'PF', 'WF'])
const famillePays = (p: string | null | undefined) => { const x = (p || 'FR').toUpperCase(); return OUTRE_MER.has(x) ? 'FR' : x }
export const memePays = (a: string | null | undefined, b: string | null | undefined) => famillePays(a) === famillePays(b)

export type Homonyme = { nom: string; pays: string; zone: string | null; population: number; slug: string; base: string }
type LigneVille = { id?: number; nom: string; pays: string; zone: string | null; population: number | null }

const nettoyer = (t: string) => versRecherche(t).replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')

/** Les villes d'un même nom, la plus peuplée d'abord : elle garde l'adresse simple, les autres prennent leur région. */
function nommerHomonymes(base: string, lignes: LigneVille[]): Homonyme[] {
  const vus = new Set<string>()
  const sortie: Homonyme[] = []
  lignes.forEach((l, i) => {
    const slug = i === 0 ? base : `${base}-${nettoyer(l.zone || l.pays) || l.pays.toLowerCase()}`
    if (vus.has(slug)) return   // deux hameaux du même nom dans la même région : le plus peuplé
    vus.add(slug)
    sortie.push({ nom: l.nom, pays: l.pays, zone: l.zone, population: l.population ?? 0, slug, base })
  })
  return sortie
}

/** « valence » → toutes les villes de ce nom. Une lecture, sur l'index des noms. */
async function homonymes(base: string): Promise<Homonyme[]> {
  const { data } = await admin.from('villes').select('id, nom, pays, zone, population').like('nom_recherche', motifVille(base))
    .order('population', { ascending: false, nullsFirst: false }).order('id', { ascending: true }).limit(100)
  return nommerHomonymes(base, (data ?? []) as LigneVille[])
}

/**
 * La ville où ranger une pro, parmi celles du nom qu'elle a écrit : dans son
 * pays (quand on le connaît), la plus proche de chez elle ; sans position, la
 * plus peuplée. Aucune ville de ce nom dans son pays et pas de position : null.
 */
export async function choisirHomonyme(homs: Homonyme[], pro: { pays?: string | null; lat?: number | null; lon?: number | null }): Promise<Homonyme | null> {
  if (!homs.length) return null
  const aPosition = typeof pro.lat === 'number' && typeof pro.lon === 'number'
  const paysConnu = pro.pays !== undefined
  const siens = paysConnu ? homs.filter(h => memePays(h.pays, pro.pays)) : homs
  const parmi = siens.length ? siens : aPosition ? homs : []
  if (!parmi.length) return null
  if (parmi.length === 1 || !aPosition) return parmi[0]
  // Plusieurs villes de ce nom : la plus proche de chez elle (huit au plus, les plus peuplées).
  const centres = await Promise.all(parmi.slice(0, 8).map(h => centreDe(h.nom, h.pays, { zone: h.zone, population: h.population, principale: h.slug === h.base }).catch(() => null)))
  let meilleure: Homonyme = parmi[0], distance = Infinity
  centres.forEach((c, i) => {
    if (!c) return
    const d = kmEntre({ lat: pro.lat!, lon: pro.lon! }, c)
    if (d < distance) { distance = d; meilleure = parmi[i] }
  })
  return meilleure
}

export const versRecherche = (v: string) =>
  v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-')

/** La ville écrite par la pro, sous les formes d'un lien : entière, avant un séparateur, sans numéro final. */
export function formesDeVille(texte: string): string[] {
  const propre = (t: string) => versRecherche(t).replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  const st = (t: string) => t.replace(/^st-/, 'saint-').replace(/^ste-/, 'sainte-')
  return [...new Set([
    propre(texte),
    // « 64340 Boucau » : le code postal devant le nom (14 oct. 2026).
    propre(texte.replace(/^\s*\d{4,5}\s+/, '')),
    propre(texte.split(/[—–(,/]| - /)[0] ?? ''),
    propre(texte).replace(/(-\d+[a-z]{0,3})+$/, ''),
  ].map(st))].filter(t => /^[a-z0-9-]{2,80}$/.test(t))
}

/** « le-plessis-robinson » → le motif qui retrouve « le plessis-robinson » dans la liste. */
const motifVille = (slug: string) => slug.replace(/[%_]/g, '').replace(/-/g, '_')

/** « dijon » → la ville la plus peuplée de ce nom, et son centre. */
export async function villeDepuisSlug(brut: string): Promise<Ville | null> {
  let texte = brut
  try { texte = decodeURIComponent(brut) } catch { /* lien abîmé */ }
  // Le lien vient parfois de la ville tapée par la pro (« Ixelles — Bruxelles »,
  // « Lyon 3e », « Saint-Étienne (42) ») : on essaie la ville entière, puis ce
  // qui précède le premier séparateur, puis sans le numéro final (12 oct. 2026).
  const essais = formesDeVille(texte)
  const trouver = async (): Promise<Homonyme | null> => {
    for (const slug of essais) {
      // La liste des villes écrit « le plessis-robinson » ou « l'hay-les-roses » : un
      // tiret du lien vaut un tiret, une espace ou une apostrophe (Chadi, 12 oct. 2026).
      const homs = await homonymes(slug)
      if (homs.length) return homs[0]
    }
    // Pas de ville de ce nom : peut-être une ville et sa région (« valence-tarn-et-garonne »).
    const parts = (essais[0] ?? '').split('-')
    if (parts.length < 2 || parts.length > 10) return null
    for (let i = parts.length - 1; i >= 1; i--) {
      const homs = await homonymes(parts.slice(0, i).join('-'))
      const h = homs.find(x => x.slug === essais[0])
      if (h) return h
    }
    return null
  }
  const h = await trouver()
  if (!h) return null
  const centre = await centreDe(h.nom, h.pays, { zone: h.zone, population: h.population, principale: h.slug === h.base })
  return { nom: h.nom, slug: h.slug, base: h.base, zone: h.zone, population: h.population, pays: h.pays, lat: centre?.lat ?? null, lon: centre?.lon ?? null }
}

const OPEN_METEO = 'https://geocoding-api.open-meteo.com/v1/search'

/**
 * Le centre de la ville, pour mesurer les distances tant que la cliente ne s'est pas localisée.
 *
 * Avec `indice` (la région et la population de la liste des villes), on trouve
 * LA bonne ville parmi celles du même nom (25 oct. 2026) : la Base Adresse
 * nationale pour la France et l'outre-mer (La Réunion, la Guadeloupe… que
 * l'ancien service ne trouvait pas), et pour les autres pays le service
 * Open-Meteo, tiré de la même liste mondiale que la nôtre (Cadix, Houston).
 * Sans indice, rien ne change pour la page de réservation.
 */
export async function centreDe(nom: string, pays: string, indice?: { zone: string | null; population: number; principale?: boolean }): Promise<{ lat: number; lon: number } | null> {
  if (indice) {
    const trouve = await centreParRegion(nom, pays, indice)
    // Pas trouvée avec sa région : pour la ville principale du nom (l'adresse
    // simple), on garde l'ancienne recherche, comme avant le 25 octobre.
    if (trouve || !indice.principale) return trouve
  }
  return centreSimple(nom, pays)
}

async function centreParRegion(nom: string, pays: string, indice: { zone: string | null; population: number }): Promise<{ lat: number; lon: number } | null> {
  {
    try {
      if (famillePays(pays) === 'FR') {
        const r = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(nom)}&type=municipality&limit=20`, { next: { revalidate: 86400 } })
        if (!r.ok) return null
        const features = ((await r.json())?.features ?? []) as { geometry?: { coordinates?: number[] }; properties?: { name?: string; context?: string } }[]
        const memeNom = features.filter(f => aplatir(f.properties?.name ?? '').replace(/[^a-z0-9]/g, '') === aplatir(nom).replace(/[^a-z0-9]/g, ''))
        const z = aplatir(indice.zone ?? '')
        // Plusieurs villes de ce nom et aucune dans sa région : on ne devine pas.
        const f = (z ? memeNom.find(x => aplatir(x.properties?.context ?? '').includes(z)) : null) ?? (memeNom.length === 1 ? memeNom[0] : undefined)
        const c = f?.geometry?.coordinates
        return Array.isArray(c) ? { lon: c[0], lat: c[1] } : null
      }
      const r = await fetch(`${OPEN_METEO}?name=${encodeURIComponent(nom)}&count=20&language=fr`, { next: { revalidate: 86400 } })
      if (!r.ok) return null
      const res = ((await r.json())?.results ?? []) as { latitude: number; longitude: number; country_code?: string; population?: number; admin1?: string; admin2?: string }[]
      const siens = res.filter(x => (x.country_code ?? '').toUpperCase() === pays.toUpperCase())
      const z = aplatir(indice.zone ?? '')
      const f = (indice.population > 0 ? siens.find(x => x.population === indice.population) : undefined)
        ?? (z ? siens.find(x => [x.admin1, x.admin2].some(a => a && (z.includes(aplatir(a)) || aplatir(a).includes(z)))) : undefined)
        ?? (siens.length === 1 ? siens[0] : undefined)
      return f ? { lat: f.latitude, lon: f.longitude } : null
    } catch { return null }
  }
}

/** L'ancienne recherche : la première ville de ce nom (France), ou la première du bon pays (ailleurs). */
async function centreSimple(nom: string, pays: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const url = pays === 'FR'
      ? `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(nom)}&type=municipality&limit=1`
      // Toute sorte de lieu (Ixelles est une « town », pas une « city »), mais dans
      // le bon pays : le premier résultat du même pays (12 oct. 2026).
      : `https://photon.komoot.io/api/?q=${encodeURIComponent(nom)}&osm_tag=place&limit=5`
    const r = await fetch(url, { next: { revalidate: 86400 } })
    if (!r.ok) return null
    const features = ((await r.json())?.features ?? []) as { geometry?: { coordinates?: number[] }; properties?: { countrycode?: string } }[]
    const f = pays === 'FR' ? features[0] : features.find(x => (x.properties?.countrycode ?? '').toUpperCase() === pays.toUpperCase())
    const c = f?.geometry?.coordinates
    return Array.isArray(c) ? { lon: c[0], lat: c[1] } : null
  } catch { return null }
}

/** Un décalage de 150 à 400 m, toujours le même pour une même pro. */
function flouter(id: string, lat: number, lon: number): { lat: number; lon: number } {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) }
  const angle = ((h >>> 0) % 360) * Math.PI / 180
  const metres = 150 + ((h >>> 9) % 250)
  const dLat = (metres * Math.cos(angle)) / 111320
  const dLon = (metres * Math.sin(angle)) / (111320 * Math.cos(lat * Math.PI / 180))
  return { lat: Math.round((lat + dLat) * 1e5) / 1e5, lon: Math.round((lon + dLon) * 1e5) / 1e5 }
}

type Profil = {
  id: string; slug: string | null; pseudo: string | null; prenom: string | null
  avatar_url: string | null; photo_url: string | null
  adresse_lat: number | null; adresse_lon: number | null
  abonnement_actif: boolean | null; pro_pay_actif: boolean | null; trial_ends_at: string | null
  avis_actifs: boolean | null; sur_glamia: boolean | null
  photos_travail: unknown
  bio: string | null; message_accueil: string | null
  ville: string | null
  pays: string | null
  ville_affichee: string | null
  /** La ville LUE dans le texte d'adresse qu'elle a écrit (« 64340 Boucau », « Marseille ») — jamais devinée (14 oct. 2026). */
  ville_lue: string | null
  devise: string | null
  compte_test: boolean | null
}
const CHAMPS = 'id, slug, pseudo, prenom, avatar_url, photo_url, adresse_lat, adresse_lon, abonnement_actif, pro_pay_actif, trial_ends_at, avis_actifs, sur_glamia, photos_travail, bio, message_accueil, ville, pays, ville_affichee, devise, ville_lue, compte_test'

// LES COMPTES D'ESSAI N'ONT RIEN À FAIRE DEVANT LES CLIENTES (25 oct. 2026).
// Les comptes marqués « test » sortent d'office. Lindsay (lindsaytest), le
// compte d'essai de la 3.0, ne peut pas être marqué ainsi (ça le passerait en
// Ultra dans l'app) : il est écarté ici, par son adresse, sans toucher à sa fiche.
const COMPTES_CACHES = new Set(['lindsaytest'])
export const compteCache = (p: { slug?: string | null; compte_test?: boolean | null }) =>
  p.compte_test === true || COMPTES_CACHES.has((p.slug ?? '').toLowerCase())

// 3.0 : toutes les pages sont ouvertes, gratuit compris (4 oct. 2026). Une
// pro apparaît dans la recherche dès qu'elle n'a pas dit non (sur_glamia).
const ouverte = (_p: Profil) => true

/** Les pros d'une ville, prêtes à afficher — puis celles « tout près ». */
export async function prosDeLaVille(ville: Ville): Promise<ProTrouvee[]> {
  // 1. Celles qui ont donné leur ville dans la 3.0 (leur fiche fait foi).
  const base = ville.base ?? ville.slug
  // Même motif, voyelles et lettres accentuables comprises : « Alcalá de Guadaíra »
  // écrit par la pro, « Alcalá de Guadaira » dans la liste (25 oct. 2026).
  const souple = ville.nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]|[aeiouyAEIOUY]/g, '_')
  const [{ data: directes }, { data: deduites }, { data: souples }, homs] = await Promise.all([
    // Le début du nom, chaque lettre accentuée ou séparateur valant n'importe
    // quel caractère : « Saint Etienne », « Lyon 3e », « Ixelles — Bruxelles »
    // remontent, puis on ne garde que la même ville (12 oct. 2026).
    // La ville écrite par l'user, ou la ville qu'elle a choisi d'afficher (12 oct. 2026).
    // Aussi « 64340 Boucau » ou « 1700 Fribourg » : quatre ou cinq chiffres et une espace devant (14 oct. 2026).
    admin.from('profiles').select(CHAMPS).or(`ville.ilike.${ville.nom.replace(/[^A-Za-z0-9]/g, '_')}%,ville.ilike.______${ville.nom.replace(/[^A-Za-z0-9]/g, '_')}%,ville.ilike._____${ville.nom.replace(/[^A-Za-z0-9]/g, '_')}%,ville_affichee.ilike.${ville.nom.replace(/[^A-Za-z0-9]/g, '_')}%,ville_lue.ilike.${ville.nom.replace(/[^A-Za-z0-9]/g, '_')}%`).not('slug', 'is', null).limit(MAX_PROS * 2),
    Promise.resolve(AUCUNE_VILLE_DEVINEE),
    admin.from('profiles').select(CHAMPS).or(`ville.ilike.${souple}%,ville_affichee.ilike.${souple}%,ville_lue.ilike.${souple}%`).not('slug', 'is', null).limit(MAX_PROS * 2),
    homonymes(base),
  ])
  const candidates = new Map<string, Profil>()
  for (const p of [...((directes ?? []) as Profil[]), ...((souples ?? []) as Profil[])]) candidates.set(p.id, p)
  // La ville qu'elle montre : celle qu'elle a choisie, sinon celle de son adresse.
  const memeNom = (p: Profil) => !!(p.ville_affichee || p.ville || p.ville_lue) && formesDeVille((p.ville_affichee || p.ville || p.ville_lue)!).includes(base)
  // Parmi les villes de ce nom, est-ce bien celle-ci ? (Valence 26 ou Valence 82.)
  const choix = await Promise.all([...candidates.values()].filter(memeNom).map(async p => {
    const h = await choisirHomonyme(homs, { pays: p.pays, lat: p.adresse_lat, lon: p.adresse_lon })
    return h && h.slug === ville.slug ? p : null
  }))
  const tous = await assembler(choix.filter((p): p is Profil => !!p), (deduites ?? []) as { pro_id: string; lat: number; lon: number }[],
    undefined, ville.lat !== null && ville.lon !== null ? { lat: ville.lat, lon: ville.lon, pays: ville.pays } : undefined)
  // Une user qui a choisi la ville à montrer n'apparaît que dans celle-là — même si son
  // adresse, ou la ville déduite de son ancienne adresse, est ailleurs (12 oct. 2026).
  const dansLaVille = tous.filter(p => !p.villeChoisie || formesDeVille(p.villeLien ?? '').includes(base))
  if (ville.lat === null || ville.lon === null) return dansLaVille

  // 2. TOUT PRÈS (Chadi, 12 oct. 2026) : une cliente du Plessis-Robinson réserve
  // volontiers à Clamart. Sous les pros de la ville, celles à moins de 10 km du
  // centre, de la plus proche à la plus loin. Une pro qui a mal écrit sa ville
  // (« Saint Etienne », « Lyon 3e ») réapparaît ici, par sa position.
  const deja = new Set(dansLaVille.map(p => p.slug))
  const centre = { lat: ville.lat, lon: ville.lon }
  const place = Math.max(0, MAX_PROS - dansLaVille.length)
  if (!place) return dansLaVille
  const autour = await prosDansLeRayon(ville.lat, ville.lon, RAYON_TOUT_PRES_KM,
    { exclure: deja, centre, km: RAYON_TOUT_PRES_KM, limite: place })
  // Elle a écrit sa ville autrement (« Lyon 3e », « Saint Etienne ») mais c'est
  // bien la même : elle rejoint la ville, pas « Tout près ».
  const memeVille = (p: ProTrouvee) => !!p.villeLien && formesDeVille(p.villeLien).includes(base)
  const rejointes = autour.filter(memeVille)
  const proches = autour.filter(p => !memeVille(p))
    .map(p => ({ ...p, prochaine: true }))
    // La mise en avant tient aussi ici : les Ultra d'abord, puis la plus proche.
    .sort((a, b) => Number(b.enAvant) - Number(a.enAvant)
      || (a.enAvant && b.enAvant ? a.rangDuJour - b.rangDuJour : 0)
      || kmEntre(centre, a) - kmEntre(centre, b))
    .slice(0, place)
  return [...[...dansLaVille, ...rejointes].sort(ordreVille), ...proches]
}

const RAYON_TOUT_PRES_KM = 10

/** Les actes de suivi : pas un prix d'appel. */
const SUIVI = /^(d[ée]pose|retrait|remplissage|retouche|retirada|relleno|removal|refill)/i
/** Les options qu'on ajoute à une prestation (nail art, réparation, supplément…) : pas une prestation à elles seules. */
const OPTION = /(nail ?art|r[ée]paration|suppl[ée]ment|d[ée]co|longueur|french|option|strass|ajout|add-?on|extra|reparaci[oó]n|repair)/i

/** Distance à vol d'oiseau, en km (positions déjà floutées de 150 à 400 m : à quelques centaines de mètres près). */
function kmEntre(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180
  const x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r)
  const y = (b.lat - a.lat) * r
  return Math.sqrt(x * x + y * y) * 6371
}

/** « Autour de moi » : les pros à moins de 15 km, où qu'elles soient. */
export async function prosAutour(lat: number, lon: number): Promise<ProTrouvee[]> {
  return prosDansLeRayon(lat, lon, 15)
}

async function prosDansLeRayon(lat: number, lon: number, km: number, choix?: Choix): Promise<ProTrouvee[]> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return []
  const dLat = km / 111.32, dLon = km / (111.32 * Math.cos(lat * Math.PI / 180))
  const [{ data: directes }, { data: deduites }] = await Promise.all([
    admin.from('profiles').select(CHAMPS)
      .gte('adresse_lat', lat - dLat).lte('adresse_lat', lat + dLat)
      .gte('adresse_lon', lon - dLon).lte('adresse_lon', lon + dLon)
      .not('slug', 'is', null).limit(MAX_PROS * 2),
    Promise.resolve(AUCUNE_VILLE_DEVINEE),
  ])
  return assembler((directes ?? []) as Profil[], (deduites ?? []) as { pro_id: string; lat: number; lon: number }[], choix)
}

/** Pour « Tout près » : écarter celles déjà montrées, garder les plus proches du centre, AVANT de calculer leurs dispos. */
type Choix = { exclure: Set<string>; centre: { lat: number; lon: number }; km: number; limite: number }

async function assembler(directes: Profil[], deduites: { pro_id: string; lat: number; lon: number }[], choix?: Choix,
  centreVille?: { lat: number; lon: number; pays: string }): Promise<ProTrouvee[]> {
  const position = new Map<string, { lat: number; lon: number }>()
  const profils = new Map<string, Profil>()
  for (const p of directes) {
    if (typeof p.adresse_lat === 'number' && typeof p.adresse_lon === 'number') position.set(p.id, { lat: p.adresse_lat, lon: p.adresse_lon })
    profils.set(p.id, p)
  }
  // 2. Celles dont la ville a été déduite de leur ancienne adresse.
  const manquants = deduites.filter(d => !profils.has(d.pro_id))
  if (manquants.length) {
    const { data } = await admin.from('profiles').select(CHAMPS).in('id', manquants.map(d => d.pro_id as string)).not('slug', 'is', null)
    for (const p of (data ?? []) as Profil[]) profils.set(p.id, p)
    // ELLE A DONNÉ SA VILLE (3.0) : la ville devinée le 26 septembre ne compte
    // plus. NailsBeauty, à Boucau, sortait à Bordeaux (14 oct. 2026).
    for (const d of manquants) {
      const p = profils.get(d.pro_id as string)
      if (p && ((p.ville ?? '').trim() || (p.ville_affichee ?? '').trim())) { profils.delete(d.pro_id as string); continue }
      if (!position.has(d.pro_id as string)) position.set(d.pro_id as string, { lat: d.lat as number, lon: d.lon as number })
    }
  }

  // Elle a donné sa ville mais pas de position : sur la page de SA ville, on la
  // pose au centre (flouté comme les autres) plutôt que de la cacher (12 oct. 2026).
  if (centreVille) for (const p of directes) if (!position.has(p.id) && memePays(p.pays, centreVille.pays)) position.set(p.id, centreVille)
  // ELLE A CHOISI UNE AUTRE VILLE À MONTRER (son village → la ville voisine, 12 oct. 2026) :
  // son point se pose au centre de cette ville, jamais près de son adresse exacte.
  for (const p of profils.values()) {
    const choisie = (p.ville_affichee ?? '').trim()
    if (!choisie || choisie.toLowerCase() === (p.ville ?? '').trim().toLowerCase()) continue
    const c = await centreDe(choisie, (p.pays ?? 'FR').toUpperCase())
    if (c) position.set(p.id, c)
  }
  // Même nom, autre ville (Saint-Denis de La Réunion sur la page de Saint-Denis
  // en Seine-Saint-Denis) : à plus de 40 km du centre, ce n'est pas elle.
  if (centreVille) for (const [id, pos] of position) if (kmEntre(centreVille, pos) > 40) position.delete(id)
  let retenues = [...profils.values()]
    .filter(p => p.sur_glamia !== false && !compteCache(p) && ouverte(p) && position.has(p.id) && p.slug)
  if (choix) {
    const km = (p: Profil) => kmEntre(choix.centre, position.get(p.id)!)
    retenues = retenues.filter(p => !choix.exclure.has(p.slug!) && km(p) <= choix.km)
      .sort((a, b) => Number(b.pro_pay_actif === true) - Number(a.pro_pay_actif === true) || km(a) - km(b))
      .slice(0, choix.limite)
  } else retenues = retenues.slice(0, MAX_PROS)
  if (!retenues.length) return []
  const ids = retenues.map(p => p.id)

  const [{ data: notes }, { data: catalogues }] = await Promise.all([
    admin.from('avis_note_par_pro').select('pro_id, note, nombre').in('pro_id', ids),
    admin.from('prestations').select('pro_id, data').in('pro_id', ids),
  ])
  const noteDe = new Map((notes ?? []).map(n => [n.pro_id as string, n]))
  const metiersDe = new Map<string, Metier[]>()
  const prixDe = new Map<string, number>()
  for (const c of catalogues ?? []) {
    const ms = new Set<Metier>()
    for (const [cat, liste] of Object.entries((c.data ?? {}) as Record<string, unknown>)) {
      if (!Array.isArray(liste) || !liste.some(t => (t as { active?: boolean })?.active !== false)) continue
      const m = metierDe(cat)
      if (m) ms.add(m)
      // « À PARTIR DE » (13 oct. 2026) : le plus petit prix de ce qu'elle a
      // allumé, hors déposes et retouches (des actes de suivi, pas une première visite).
      for (const t of liste) {
        const it = t as { active?: unknown; prix?: unknown; nom?: unknown; duree?: unknown }
        if (it?.active !== true || typeof it.prix !== 'number' || !(it.prix > 0)) continue
        if (typeof it.nom === 'string' && (SUIVI.test(it.nom.trim()) || OPTION.test(it.nom))) continue
        if (typeof it.duree === 'number' && it.duree < 10) continue
        const avant = prixDe.get(c.pro_id as string)
        if (avant === undefined || it.prix < avant) prixDe.set(c.pro_id as string, it.prix)
      }
    }
    metiersDe.set(c.pro_id as string, METIERS.filter(m => ms.has(m)))
  }

  // La prochaine disponibilité, quatre pros à la fois.
  const dispos = new Map<string, { date: string; heure: string } | null>()
  for (let i = 0; i < retenues.length; i += 4) {
    await Promise.all(retenues.slice(i, i + 4).map(async p => {
      try {
        const d = await prochaineDispo(admin, p.id, HORIZON_DISPO)
        dispos.set(p.id, d ? { date: d.date, heure: d.heure } : null)
      } catch { dispos.set(p.id, null) }
    }))
  }

  return retenues.map(p => {
    const n = noteDe.get(p.id)
    const pos = flouter(p.id, position.get(p.id)!.lat, position.get(p.id)!.lon)
    const avisVisibles = p.avis_actifs !== false && n && Number(n.nombre) > 0
    return {
      slug: p.slug!,
      nom: (p.pseudo || p.prenom || 'Glamia').trim(),
      photo: p.avatar_url || p.photo_url || null,
      lat: pos.lat, lon: pos.lon,
      note: avisVisibles ? Number(n!.note) : null,
      nbAvis: avisVisibles ? Number(n!.nombre) : 0,
      metiers: metiersDe.get(p.id) ?? [],
      dispo: dispos.get(p.id) ?? null,
      avecPhotos: Array.isArray(p.photos_travail) && p.photos_travail.length >= 3,
      accroche: ((p.bio ?? p.message_accueil ?? '').replace(/\s+/g, ' ').trim().slice(0, 160)) || null,
      prixMin: prixDe.has(p.id) ? { montant: prixDe.get(p.id)!, devise: (p.devise || 'EUR').toUpperCase() } : null,
      photos: (Array.isArray(p.photos_travail) ? p.photos_travail : []).filter((u): u is string => typeof u === 'string' && /^https:\/\//.test(u)).slice(0, 4),
      enAvant: p.pro_pay_actif === true,
      rangDuJour: rangDuJour(p.id),
      villeLien: p.ville_affichee || p.ville || p.ville_lue || undefined,
      villeChoisie: !!(p.ville_affichee ?? '').trim(),
    }
  })
    // LA MISE EN AVANT (Chadi, 9 oct. 2026) : les Ultra d'abord — c'est la
    // promesse de l'abonnement, « parmi les premières dans ta ville ». Entre
    // elles, l'ordre change chaque jour pour que chacune ait sa place en tête.
    // Puis, comme avant : celles qui montrent leur travail (27 sept. 2026),
    // puis la plus tôt disponible.
    .sort(ordreVille)
}

const ordreVille = (a: ProTrouvee, b: ProTrouvee) => Number(b.enAvant) - Number(a.enAvant)
  || (a.enAvant && b.enAvant ? a.rangDuJour - b.rangDuJour : 0)
  || Number(b.avecPhotos) - Number(a.avecPhotos)
  || (a.dispo ? `${a.dispo.date}T${a.dispo.heure}` : 'z').localeCompare(b.dispo ? `${b.dispo.date}T${b.dispo.heure}` : 'z')

/** Un rang stable sur la journée, différent d'un jour à l'autre : l'identifiant et la date, hachés. */
function rangDuJour(id: string): number {
  const cle = `${id}:${new Date().toISOString().slice(0, 10)}`
  let h = 0
  for (let i = 0; i < cle.length; i++) h = (h * 31 + cle.charCodeAt(i)) >>> 0
  return h % 100000
}

/** Les villes proposées pendant la frappe : d'abord celles où il y a des pros. */
export async function villesProposees(q: string): Promise<{ nom: string; slug: string; zone: string | null }[]> {
  const s = versRecherche(q.trim())
  if (s.length < 2) return []
  const { data } = await admin.from('villes').select('nom, nom_recherche, zone, pays')
    .like('nom_recherche', `${motifVille(s)}%`)
    .order('population', { ascending: false, nullsFirst: false }).limit(8)
  const vus = new Set<string>()
  return (data ?? []).filter(v => !vus.has(v.nom_recherche as string) && vus.add(v.nom_recherche as string))
    .map(v => ({ nom: v.nom as string, slug: versRecherche(v.nom_recherche as string), zone: (v.zone as string) ?? null }))
}

/**
 * Une ville écrite par une pro (« Lyon 3e », « Beauvais (60000) ») → la page
 * qui existe pour elle, sans chercher son centre : une seule lecture bornée
 * par forme essayée. Sert aux liens (villes proches, fiche de la pro, sitemap).
 */
export async function villeConnue(texte: string, pro?: { pays?: string | null; lat?: number | null; lon?: number | null }): Promise<{ nom: string; slug: string } | null> {
  for (const slug of formesDeVille(texte)) {
    const homs = await homonymes(slug)
    if (!homs.length) continue
    // Plusieurs villes de ce nom : celle de la pro, quand on sait d'où elle est (25 oct. 2026).
    const h = pro ? await choisirHomonyme(homs, pro) : homs[0]
    return h ? { nom: h.nom, slug: h.slug } : null
  }
  return null
}

export type DonneesVille = { ville: Ville; pros: ProTrouvee[]; voisines: { nom: string; slug: string }[] } | null

/**
 * UNE VILLE, LUE AU PLUS UNE FOIS TOUTES LES CINQ MINUTES (13 oct. 2026).
 *
 * La page lisait la langue du navigateur, ce qui la rendait recalculée à
 * chaque visite : le « cache cinq minutes » annoncé n'agissait pas, et chaque
 * passage refaisait la ville, les notes, les catalogues et les dispos de
 * soixante pros. Avec Google qui passe sur toutes les villes, ce n'était plus
 * tenable pour une base à 60 connexions. Les données sont maintenant gardées
 * cinq minutes par ville, quelle que soit la langue ; la page de la ville, son
 * titre et ses pages par métier partagent la même lecture.
 */
const donneesVilleEnCache = unstable_cache(async (slug: string): Promise<DonneesVille> => {
  const ville = await villeDepuisSlug(slug)
  if (!ville) return null
  const pros = await prosDeLaVille(ville)
  // VILLES PROCHES : celles des pros « Tout près », quand elles ont leur page.
  const parTexte = new Map<string, ProTrouvee>()
  for (const p of pros) if (p.prochaine && p.villeLien && !parTexte.has(p.villeLien.trim())) parTexte.set(p.villeLien.trim(), p)
  // Sa position (floutée) suffit à choisir la bonne ville parmi celles du même nom.
  const trouvees = await Promise.all([...parTexte.entries()].slice(0, 8).map(([t, p]) => villeConnue(t, { lat: p.lat, lon: p.lon }).catch(() => null)))
  const vus = new Set<string>([ville.slug])
  const voisines = trouvees.filter((v): v is { nom: string; slug: string } => !!v && !vus.has(v.slug) && !!vus.add(v.slug))
  return { ville, pros, voisines }
}, ['beaute-ville-v3'], { revalidate: 300 })

export const donneesVille = cache((slug: string) => donneesVilleEnCache(slug))

/**
 * POUR LE SITEMAP ET L'ACCUEIL : les villes qui ont au moins une pro, et leurs
 * métiers (13 oct. 2026). Lu au plus une fois par heure. Les métiers sont lus
 * dans le catalogue, exactement comme la page les montre (ce que la pro a
 * déclaré à l'inscription ne suit pas toujours son catalogue : la page serait vide).
 *
 * AUCUNE PAGE VIDE DANS LA LISTE (25 oct. 2026) : on refait ici le tri de la
 * page — la bonne ville parmi celles du même nom, son pays, sa position ou à
 * défaut le centre de la ville, à moins de 40 km. Le 25 octobre, 31 adresses
 * sur 1 025 envoyées à Google montraient une page vide (Valence, Saint-Louis,
 * Houston, Cadix…).
 *
 * Deux lectures bornées pour les pros, leurs catalogues par paquets de 200,
 * puis les villes par paquets de 20 (chaque nom passe par l'index des villes).
 */
export type VilleAvecPros = { slug: string; nom: string; pays: string; zone: string | null; population: number; metiers: Metier[] }

export async function villesAvecPros(): Promise<VilleAvecPros[]> {
  // PAR PAGES DE 1 000 (25 oct. 2026) : la base ne rend jamais plus de 1 000
  // lignes d'un coup, et les pros sont plus nombreuses. Avant, celles d'après
  // la millième n'entraient jamais dans la liste (Bellecourt, entre autres).
  const profils: Record<string, unknown>[] = []
  for (let page = 0; page < 10; page++) {
    const { data, error } = await admin.from('profiles')
      .select('id, slug, ville, ville_affichee, ville_lue, sur_glamia, compte_test, pays, adresse_lat, adresse_lon')
      .not('slug', 'is', null).or('ville.not.is.null,ville_affichee.not.is.null,ville_lue.not.is.null')
      .order('id', { ascending: true }).range(page * 1000, page * 1000 + 999)
    if (error) throw new Error(error.message)
    profils.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }

  type Visible = { id: string; textes: string[]; pays: string | null; lat: number | null; lon: number | null; ailleurs: boolean }
  const visibles: Visible[] = []
  for (const p of profils) {
    if (p.sur_glamia === false || compteCache(p as { slug: string | null; compte_test: boolean | null })) continue
    const texte = ((p.ville_affichee as string | null) || (p.ville as string | null) || (p.ville_lue as string | null) || '').trim()
    if (!texte) continue
    const affichee = ((p.ville_affichee as string | null) ?? '').trim()
    visibles.push({
      id: p.id as string, textes: formesDeVille(texte), pays: (p.pays as string | null) ?? null,
      lat: typeof p.adresse_lat === 'number' ? p.adresse_lat : null, lon: typeof p.adresse_lon === 'number' ? p.adresse_lon : null,
      // Elle montre une autre ville que la sienne : la page la pose au centre de celle-ci.
      ailleurs: !!affichee && affichee.toLowerCase() !== ((p.ville as string | null) ?? '').trim().toLowerCase(),
    })
  }
  // Ses métiers : les catégories de son catalogue où au moins une prestation est allumée (comme la page).
  const metiersDe = new Map<string, Metier[]>()
  for (let i = 0; i < visibles.length; i += 200) {
    const { data, error } = await admin.from('prestations').select('pro_id, data').in('pro_id', visibles.slice(i, i + 200).map(v => v.id)).limit(400)
    if (error) throw new Error(error.message)
    for (const c of data ?? []) {
      const ms = new Set<Metier>()
      for (const [cat, liste] of Object.entries((c.data ?? {}) as Record<string, unknown>)) {
        if (!Array.isArray(liste) || !liste.some(t => (t as { active?: boolean })?.active !== false)) continue
        const m = metierDe(cat)
        if (m) ms.add(m)
      }
      metiersDe.set(c.pro_id as string, METIERS.filter(m => ms.has(m)))
    }
  }

  // Les villes de chaque nom écrit, la plus peuplée d'abord (même ordre que la page).
  const formes = [...new Set(visibles.flatMap(p => p.textes))]
  const homsDe = new Map<string, Homonyme[]>()
  // La base ne rend jamais plus de 1 000 lignes d'un coup : un paquet qui les
  // atteint (des noms très répandus, « Saint-Martin »…) est relu nom par nom,
  // sinon les plus petites villes manqueraient (Bellecourt, 25 oct. 2026).
  const PLAFOND = 1000
  for (let i = 0; i < formes.length; i += 20) {
    const paquet = formes.slice(i, i + 20)
    const { data, error } = await admin.from('villes').select('id, nom, nom_recherche, pays, zone, population')
      .or(paquet.map(f => `nom_recherche.like.${motifVille(f)}`).join(','))
      .order('population', { ascending: false, nullsFirst: false }).order('id', { ascending: true }).limit(PLAFOND)
    if (error) throw new Error(error.message)
    if ((data ?? []).length >= PLAFOND) {
      for (const f of paquet) { const homs = await homonymes(f); if (homs.length) homsDe.set(f, homs) }
      continue
    }
    const lignes = (data ?? []) as (LigneVille & { nom_recherche: string })[]
    for (const f of paquet) {
      const re = new RegExp(`^${motifVille(f).replace(/_/g, '.')}$`)
      const homs = nommerHomonymes(f, lignes.filter(l => re.test(String(l.nom_recherche))))
      if (homs.length) homsDe.set(f, homs)
    }
  }

  // Chaque pro dans sa ville.
  const parVille = new Map<string, { h: Homonyme; pros: Visible[] }>()
  for (let i = 0; i < visibles.length; i += 8) {
    await Promise.all(visibles.slice(i, i + 8).map(async p => {
      const forme = p.textes.find(f => homsDe.has(f))   // la même forme que la page choisit
      if (!forme) return
      const h = await choisirHomonyme(homsDe.get(forme)!, { pays: p.pays, lat: p.lat, lon: p.lon }).catch(() => null)
      if (!h) return
      const v = parVille.get(h.slug) ?? { h, pros: [] }
      v.pros.push(p)
      parVille.set(h.slug, v)
    }))
  }

  // La page la montrera-t-elle ? Une position à moins de 40 km du centre, ou le centre lui-même.
  const sortie: VilleAvecPros[] = []
  const entrees = [...parVille.values()]
  for (let i = 0; i < entrees.length; i += 16) {
    await Promise.all(entrees.slice(i, i + 16).map(async ({ h, pros }) => {
      const centre = await centreDe(h.nom, h.pays, { zone: h.zone, population: h.population, principale: h.slug === h.base }).catch(() => null)
      const montrees = pros.filter(p => {
        if (p.ailleurs) return !!centre
        if (p.lat !== null && p.lon !== null) return !centre || kmEntre(centre, { lat: p.lat, lon: p.lon }) <= 40
        return !!centre && memePays(p.pays, h.pays)
      })
      if (!montrees.length) return
      const ms = new Set<Metier>()
      for (const p of montrees) (metiersDe.get(p.id) ?? []).forEach(m => ms.add(m))
      sortie.push({ slug: h.slug, nom: h.nom, pays: h.pays, zone: h.zone, population: h.population, metiers: METIERS.filter(m => ms.has(m)) })
    }))
  }
  return sortie.sort((a, b) => a.slug.localeCompare(b.slug))
}

/** Les mêmes villes, gardées une heure : le sitemap et l'accueil de la recherche les partagent. */
export const villesAvecProsEnCache = unstable_cache(villesAvecPros, ['beaute-villes-avec-pros-v1'], { revalidate: 3600 })
