import { createClient } from '@supabase/supabase-js'
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
}

export type Ville = { nom: string; slug: string; pays: string; lat: number | null; lon: number | null }

export const versRecherche = (v: string) =>
  v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-')

/** « dijon » → la ville la plus peuplée de ce nom, et son centre. */
export async function villeDepuisSlug(slug: string): Promise<Ville | null> {
  if (!/^[a-z0-9-]{2,80}$/.test(slug)) return null
  const { data } = await admin.from('villes').select('nom, pays').eq('nom_recherche', slug)
    .order('population', { ascending: false, nullsFirst: false }).limit(1).maybeSingle()
  if (!data) return null
  const centre = await centreDe(data.nom as string, data.pays as string)
  return { nom: data.nom as string, slug, pays: data.pays as string, lat: centre?.lat ?? null, lon: centre?.lon ?? null }
}

/** Le centre de la ville, pour mesurer les distances tant que la cliente ne s'est pas localisée. */
async function centreDe(nom: string, pays: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const url = pays === 'FR'
      ? `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(nom)}&type=municipality&limit=1`
      : `https://photon.komoot.io/api/?q=${encodeURIComponent(nom)}&osm_tag=place:city&limit=1`
    const r = await fetch(url, { next: { revalidate: 86400 } })
    if (!r.ok) return null
    const c = (await r.json())?.features?.[0]?.geometry?.coordinates
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
}
const CHAMPS = 'id, slug, pseudo, prenom, avatar_url, photo_url, adresse_lat, adresse_lon, abonnement_actif, pro_pay_actif, trial_ends_at, avis_actifs, sur_glamia, photos_travail, bio, message_accueil'

// 3.0 : toutes les pages sont ouvertes, gratuit compris (4 oct. 2026). Une
// pro apparaît dans la recherche dès qu'elle n'a pas dit non (sur_glamia).
const ouverte = (_p: Profil) => true

/** Les pros d'une ville, prêtes à afficher. */
export async function prosDeLaVille(ville: Ville): Promise<ProTrouvee[]> {
  // 1. Celles qui ont donné leur ville dans la 3.0 (leur fiche fait foi).
  const [{ data: directes }, { data: deduites }] = await Promise.all([
    admin.from('profiles').select(CHAMPS).ilike('ville', ville.nom).not('slug', 'is', null).limit(MAX_PROS * 2),
    admin.from('pros_localisees').select('pro_id, lat, lon').eq('ville_recherche', ville.slug).limit(MAX_PROS * 2),
  ])
  return assembler((directes ?? []) as Profil[], (deduites ?? []) as { pro_id: string; lat: number; lon: number }[])
}

/** « Autour de moi » : les pros à moins de 15 km, où qu'elles soient. */
export async function prosAutour(lat: number, lon: number): Promise<ProTrouvee[]> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return []
  const dLat = 15 / 111.32, dLon = 15 / (111.32 * Math.cos(lat * Math.PI / 180))
  const [{ data: directes }, { data: deduites }] = await Promise.all([
    admin.from('profiles').select(CHAMPS)
      .gte('adresse_lat', lat - dLat).lte('adresse_lat', lat + dLat)
      .gte('adresse_lon', lon - dLon).lte('adresse_lon', lon + dLon)
      .not('slug', 'is', null).limit(MAX_PROS * 2),
    admin.from('pros_localisees').select('pro_id, lat, lon')
      .gte('lat', lat - dLat).lte('lat', lat + dLat).gte('lon', lon - dLon).lte('lon', lon + dLon)
      .limit(MAX_PROS * 2),
  ])
  return assembler((directes ?? []) as Profil[], (deduites ?? []) as { pro_id: string; lat: number; lon: number }[])
}

async function assembler(directes: Profil[], deduites: { pro_id: string; lat: number; lon: number }[]): Promise<ProTrouvee[]> {
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
    for (const d of manquants) if (!position.has(d.pro_id as string)) position.set(d.pro_id as string, { lat: d.lat as number, lon: d.lon as number })
  }

  const retenues = [...profils.values()]
    .filter(p => p.sur_glamia !== false && ouverte(p) && position.has(p.id) && p.slug)
    .slice(0, MAX_PROS)
  if (!retenues.length) return []
  const ids = retenues.map(p => p.id)

  const [{ data: notes }, { data: catalogues }] = await Promise.all([
    admin.from('avis_note_par_pro').select('pro_id, note, nombre').in('pro_id', ids),
    admin.from('prestations').select('pro_id, data').in('pro_id', ids),
  ])
  const noteDe = new Map((notes ?? []).map(n => [n.pro_id as string, n]))
  const metiersDe = new Map<string, Metier[]>()
  for (const c of catalogues ?? []) {
    const ms = new Set<Metier>()
    for (const [cat, liste] of Object.entries((c.data ?? {}) as Record<string, unknown>)) {
      if (!Array.isArray(liste) || !liste.some(t => (t as { active?: boolean })?.active !== false)) continue
      const m = metierDe(cat)
      if (m) ms.add(m)
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
      photos: (Array.isArray(p.photos_travail) ? p.photos_travail : []).filter((u): u is string => typeof u === 'string' && /^https:\/\//.test(u)).slice(0, 4),
    }
  })
    // Celles qui montrent leur travail d'abord (Chadi, 27 sept. 2026), puis la plus tôt disponible.
    .sort((a, b) => Number(b.avecPhotos) - Number(a.avecPhotos)
      || (a.dispo ? `${a.dispo.date}T${a.dispo.heure}` : 'z').localeCompare(b.dispo ? `${b.dispo.date}T${b.dispo.heure}` : 'z'))
}

/** Les villes proposées pendant la frappe : d'abord celles où il y a des pros. */
export async function villesProposees(q: string): Promise<{ nom: string; slug: string; zone: string | null }[]> {
  const s = versRecherche(q.trim())
  if (s.length < 2) return []
  const { data } = await admin.from('villes').select('nom, nom_recherche, zone, pays')
    .ilike('nom_recherche', `${s.replace(/[%_]/g, '')}%`)
    .order('population', { ascending: false, nullsFirst: false }).limit(8)
  const vus = new Set<string>()
  return (data ?? []).filter(v => !vus.has(v.nom_recherche as string) && vus.add(v.nom_recherche as string))
    .map(v => ({ nom: v.nom as string, slug: v.nom_recherche as string, zone: (v.zone as string) ?? null }))
}
