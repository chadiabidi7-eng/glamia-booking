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

export type Ville = { nom: string; slug: string; pays: string; lat: number | null; lon: number | null }

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
  for (const slug of essais) {
    // La liste des villes écrit « le plessis-robinson » ou « l'hay-les-roses » : un
    // tiret du lien vaut un tiret, une espace ou une apostrophe (Chadi, 12 oct. 2026).
    const { data } = await admin.from('villes').select('nom, pays').like('nom_recherche', motifVille(slug))
      .order('population', { ascending: false, nullsFirst: false }).limit(1).maybeSingle()
    if (!data) continue
    const centre = await centreDe(data.nom as string, data.pays as string)
    return { nom: data.nom as string, slug, pays: data.pays as string, lat: centre?.lat ?? null, lon: centre?.lon ?? null }
  }
  return null
}

/** Le centre de la ville, pour mesurer les distances tant que la cliente ne s'est pas localisée. */
export async function centreDe(nom: string, pays: string): Promise<{ lat: number; lon: number } | null> {
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
  devise: string | null
}
const CHAMPS = 'id, slug, pseudo, prenom, avatar_url, photo_url, adresse_lat, adresse_lon, abonnement_actif, pro_pay_actif, trial_ends_at, avis_actifs, sur_glamia, photos_travail, bio, message_accueil, ville, pays, ville_affichee, devise'

// 3.0 : toutes les pages sont ouvertes, gratuit compris (4 oct. 2026). Une
// pro apparaît dans la recherche dès qu'elle n'a pas dit non (sur_glamia).
const ouverte = (_p: Profil) => true

/** Les pros d'une ville, prêtes à afficher — puis celles « tout près ». */
export async function prosDeLaVille(ville: Ville): Promise<ProTrouvee[]> {
  // 1. Celles qui ont donné leur ville dans la 3.0 (leur fiche fait foi).
  const [{ data: directes }, { data: deduites }] = await Promise.all([
    // Le début du nom, chaque lettre accentuée ou séparateur valant n'importe
    // quel caractère : « Saint Etienne », « Lyon 3e », « Ixelles — Bruxelles »
    // remontent, puis on ne garde que la même ville (12 oct. 2026).
    // La ville écrite par l'user, ou la ville qu'elle a choisi d'afficher (12 oct. 2026).
    // Aussi « 64340 Boucau » ou « 1700 Fribourg » : quatre ou cinq chiffres et une espace devant (14 oct. 2026).
    admin.from('profiles').select(CHAMPS).or(`ville.ilike.${ville.nom.replace(/[^A-Za-z0-9]/g, '_')}%,ville.ilike.______${ville.nom.replace(/[^A-Za-z0-9]/g, '_')}%,ville.ilike._____${ville.nom.replace(/[^A-Za-z0-9]/g, '_')}%,ville_affichee.ilike.${ville.nom.replace(/[^A-Za-z0-9]/g, '_')}%`).not('slug', 'is', null).limit(MAX_PROS * 2),
    Promise.resolve(AUCUNE_VILLE_DEVINEE),
  ])
  // La ville qu'elle montre : celle qu'elle a choisie, sinon celle de son adresse.
  const memeNom = (p: Profil) => !!(p.ville_affichee || p.ville) && formesDeVille((p.ville_affichee || p.ville)!).includes(ville.slug)
  const tous = await assembler(((directes ?? []) as Profil[]).filter(memeNom), (deduites ?? []) as { pro_id: string; lat: number; lon: number }[],
    undefined, ville.lat !== null && ville.lon !== null ? { lat: ville.lat, lon: ville.lon, pays: ville.pays } : undefined)
  // Une user qui a choisi la ville à montrer n'apparaît que dans celle-là — même si son
  // adresse, ou la ville déduite de son ancienne adresse, est ailleurs (12 oct. 2026).
  const dansLaVille = tous.filter(p => !p.villeChoisie || formesDeVille(p.villeLien ?? '').includes(ville.slug))
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
  const memeVille = (p: ProTrouvee) => !!p.villeLien && formesDeVille(p.villeLien).includes(ville.slug)
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
  if (centreVille) for (const p of directes) if (!position.has(p.id) && (p.pays ?? 'FR').toUpperCase() === centreVille.pays.toUpperCase()) position.set(p.id, centreVille)
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
    .filter(p => p.sur_glamia !== false && ouverte(p) && position.has(p.id) && p.slug)
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
      villeLien: p.ville_affichee || p.ville || undefined,
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
export async function villeConnue(texte: string): Promise<{ nom: string; slug: string } | null> {
  for (const slug of formesDeVille(texte)) {
    const { data } = await admin.from('villes').select('nom').like('nom_recherche', motifVille(slug))
      .order('population', { ascending: false, nullsFirst: false }).limit(1).maybeSingle()
    if (data) return { nom: data.nom as string, slug }
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
  const textes = [...new Set(pros.filter(p => p.prochaine && p.villeLien).map(p => p.villeLien!.trim()))].slice(0, 8)
  const trouvees = await Promise.all(textes.map(t => villeConnue(t).catch(() => null)))
  const vus = new Set<string>([ville.slug])
  const voisines = trouvees.filter((v): v is { nom: string; slug: string } => !!v && !vus.has(v.slug) && !!vus.add(v.slug))
  return { ville, pros, voisines }
}, ['beaute-ville-v2'], { revalidate: 300 })

export const donneesVille = cache((slug: string) => donneesVilleEnCache(slug))

/**
 * POUR LE SITEMAP : les villes qui ont au moins une pro, et leurs métiers
 * (13 oct. 2026). Lu au plus une fois par heure. Les métiers sont lus dans le
 * catalogue, exactement comme la page les montre (ce que la pro a déclaré à
 * l'inscription ne suit pas toujours son catalogue : la page serait vide).
 *
 * Deux lectures bornées pour les pros, leurs catalogues par paquets de 200,
 * puis les villes par paquets de 40 (chaque nom passe par l'index des villes).
 */
export async function villesAvecPros(): Promise<{ slug: string; metiers: Metier[] }[]> {
  const [{ data: profils, error: e1 }, { data: localisees, error: e2 }] = await Promise.all([
    admin.from('profiles').select('id, ville, ville_affichee, sur_glamia').not('slug', 'is', null).limit(5000),
    Promise.resolve(AUCUNE_VILLE_DEVINEE),
  ])
  if (e1 || e2) throw new Error(e1?.message ?? e2?.message)
  const deduite = new Map((localisees ?? []).map(l => [l.pro_id as string, l.ville_recherche as string]))

  // Pour chaque pro visible : le texte de sa ville (ou la ville déduite).
  const visibles: { id: string; textes: string[] }[] = []
  for (const p of profils ?? []) {
    if (p.sur_glamia === false) continue
    const texte = ((p.ville_affichee as string | null) || (p.ville as string | null) || '').trim()
    const textes = texte ? formesDeVille(texte) : deduite.has(p.id as string) ? [deduite.get(p.id as string)!] : []
    if (textes.length) visibles.push({ id: p.id as string, textes })
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
  const pros = visibles.map(v => ({ textes: v.textes, metiers: metiersDe.get(v.id) ?? [] }))

  // Quelles formes correspondent à une ville connue ?
  const formes = [...new Set(pros.flatMap(p => p.textes))]
  const connues = new Set<string>()
  for (let i = 0; i < formes.length; i += 40) {
    const paquet = formes.slice(i, i + 40)
    const { data, error } = await admin.from('villes').select('nom_recherche')
      .or(paquet.map(f => `nom_recherche.like.${motifVille(f)}`).join(',')).limit(2000)
    if (error) throw new Error(error.message)
    const noms = (data ?? []).map(v => String(v.nom_recherche))
    for (const f of paquet) {
      const re = new RegExp(`^${motifVille(f).replace(/_/g, '.')}$`)
      if (noms.some(n => re.test(n))) connues.add(f)
    }
  }

  const parVille = new Map<string, Set<Metier>>()
  for (const p of pros) {
    const slug = p.textes.find(f => connues.has(f))   // la même forme que la page choisit
    if (!slug) continue
    const ms = parVille.get(slug) ?? new Set<Metier>()
    p.metiers.forEach(m => ms.add(m))
    parVille.set(slug, ms)
  }
  return [...parVille.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([slug, ms]) => ({ slug, metiers: METIERS.filter(m => ms.has(m)) }))
}
