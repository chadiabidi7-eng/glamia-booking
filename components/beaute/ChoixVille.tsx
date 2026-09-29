'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LocateFixed, MapPin, Navigation, Search } from 'lucide-react'
import { TEXTES, type Langue } from '@/lib/beaute-textes'

// Le champ de recherche (avec propositions) et « Autour de moi ». Sert sur la
// page d'entrée, en grand, et en haut des résultats, en petit.
//
// TROIS FAÇONS DE CHERCHER (Chadi, 27 sept. 2026) : une VILLE mène à la page de
// la ville ; un CODE POSTAL ou une ADRESSE mènent aux pros autour de ce point,
// triées par distance — « à 300 m », « à 1,2 km ». Les adresses viennent de la
// Base Adresse Nationale en France (et l'annuaire des communes pour un code
// postal), de Photon (OpenStreetMap) ailleurs : des services publics, gratuits,
// sans clé, appelés depuis son navigateur.

export const POSITION_CLE = 'glamia_ma_position'

type Ville = { nom: string; slug: string; zone: string | null }
type Lieu = { libelle: string; detail: string | null; lat: number; lon: number }

const BAN = 'https://api-adresse.data.gouv.fr/search/'
const PHOTON = 'https://photon.komoot.io/api/'

/** Code postal, numéro de rue… : dès qu'il y a un chiffre, on cherche aussi des lieux. */
const ressembleAUneAdresse = (q: string) => /\d/.test(q)

async function chercherLieux(q: string, langue: Langue, signal: AbortSignal): Promise<Lieu[]> {
  // UN CODE POSTAL FRANÇAIS SEUL : l'annuaire officiel des communes, la plus
  // peuplée d'abord. La base des adresses, elle, oubliait Aix-en-Provence pour
  // « 13100 » et proposait Le Tholonet.
  if (/^\d{5}$/.test(q.trim())) {
    try {
      const r = await fetch(`https://geo.api.gouv.fr/communes?codePostal=${q.trim()}&fields=nom,centre,population`, { signal })
      const d = await r.json() as { nom: string; population?: number; centre?: { coordinates: [number, number] } }[]
      const communes = d.filter(c => c.centre).sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
        .map(c => ({ libelle: `${q.trim()} ${c.nom}`, detail: null, lat: c.centre!.coordinates[1], lon: c.centre!.coordinates[0] }))
      if (communes.length) return communes.slice(0, 5)
    } catch { if (signal.aborted) return [] }
  }
  try {
    const r = await fetch(`${BAN}?q=${encodeURIComponent(q)}&limit=5&autocomplete=1`, { signal })
    const d = await r.json() as { features?: { properties: { label: string; name: string; city: string; postcode: string; type: string }; geometry: { coordinates: [number, number] } }[] }
    const fr = (d.features ?? []).map(f => {
      const p = f.properties
      // Un code postal seul revient comme une commune : on l'écrit « 13100 Aix-en-Provence ».
      const commune = p.type === 'municipality'
      return {
        libelle: commune ? `${p.postcode} ${p.city}` : p.name,
        detail: commune ? null : `${p.postcode} ${p.city}`,
        lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0],
      }
    })
    if (fr.length) return fr
  } catch { if (signal.aborted) return [] }
  try {
    const r = await fetch(`${PHOTON}?q=${encodeURIComponent(q)}&limit=5&lang=${langue === 'es' ? 'en' : langue}`, { signal })
    const d = await r.json() as { features?: { properties: { name?: string; street?: string; housenumber?: string; postcode?: string; city?: string; country?: string }; geometry: { coordinates: [number, number] } }[] }
    return (d.features ?? []).map(f => {
      const p = f.properties
      const rue = [p.housenumber, p.street ?? p.name].filter(Boolean).join(' ')
      return {
        libelle: rue || [p.postcode, p.city].filter(Boolean).join(' ') || (p.name ?? ''),
        detail: [p.postcode, p.city, p.country].filter(Boolean).join(' ') || null,
        lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0],
      }
    }).filter(l => l.libelle)
  } catch { return [] }
}

export default function ChoixVille({ langue, compact = false }: { langue: Langue; compact?: boolean }) {
  const T = TEXTES[langue]
  const router = useRouter()
  const [q, setQ] = useState('')
  const [villes, setVilles] = useState<Ville[]>([])
  const [lieux, setLieux] = useState<Lieu[]>([])
  const [ouvert, setOuvert] = useState(false)
  const [etat, setEtat] = useState<'repos' | 'localisation' | 'refus'>('repos')
  const enCours = useRef<AbortController | null>(null)

  useEffect(() => {
    const texte = q.trim()
    if (texte.length < 2) { setVilles([]); setLieux([]); return }
    const t = setTimeout(async () => {
      enCours.current?.abort()
      const c = new AbortController(); enCours.current = c
      try {
        const [v, l] = await Promise.all([
          fetch(`/api/villes?q=${encodeURIComponent(texte)}`, { signal: c.signal }).then(r => r.json()).then(d => (d.villes ?? []) as Ville[]).catch(() => []),
          ressembleAUneAdresse(texte) && texte.length >= 3 ? chercherLieux(texte, langue, c.signal) : Promise.resolve([] as Lieu[]),
        ])
        if (c.signal.aborted) return
        setVilles(v); setLieux(l); setOuvert(true)
      } catch { /* frappe suivante */ }
    }, 220)
    return () => clearTimeout(t)
  }, [q, langue])

  /** Un point précis : on s'en souvient pour mesurer les distances, et on y va. */
  const allerAutour = (lat: number, lon: number, libelle?: string) => {
    const la = Math.round(lat * 10000) / 10000, lo = Math.round(lon * 10000) / 10000
    try { sessionStorage.setItem(POSITION_CLE, JSON.stringify({ lat: la, lon: lo })) } catch { /* navigation privée */ }
    router.push(`/beaute/autour?lat=${la}&lon=${lo}${libelle ? `&l=${encodeURIComponent(libelle.slice(0, 80))}` : ''}`)
  }

  const autourDeMoi = () => {
    if (!navigator.geolocation) { setEtat('refus'); return }
    setEtat('localisation')
    navigator.geolocation.getCurrentPosition(
      pos => allerAutour(pos.coords.latitude, pos.coords.longitude),
      () => setEtat('refus'),
      // Une position approchée suffit pour « autour de moi » : elle arrive en une
      // seconde par le wifi, là où le GPS traîne en intérieur jusqu'à expirer.
      // (Sur une adresse en http, le navigateur refuse toujours : https exigé.)
      { timeout: 15000, maximumAge: 600000, enableHighAccuracy: false },
    )
  }

  const valider = () => {
    // Un chiffre tapé : c'est un lieu qu'elle veut. Sinon, la ville.
    if (ressembleAUneAdresse(q) && lieux[0]) return allerAutour(lieux[0].lat, lieux[0].lon, lieux[0].libelle)
    if (villes[0]) return router.push(`/beaute/${villes[0].slug}`)
    if (lieux[0]) allerAutour(lieux[0].lat, lieux[0].lon, lieux[0].libelle)
  }

  const h = compact ? 44 : 56
  const propositions = ressembleAUneAdresse(q) ? { d: 'lieux', lieux, villes } : { d: 'villes', lieux, villes }
  const rien = villes.length === 0 && lieux.length === 0
  return (
    <div style={{ width: '100%', maxWidth: compact ? 460 : 560, position: 'relative' }}>
      {/* Sur téléphone, « Autour de moi » ne garde que son icône : le texte faisait déborder la ligne. */}
      <style>{`@media (max-width: 640px) { .cv-texte { display: none } .cv-autour { padding: 0 !important } }`}</style>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, height: h, padding: '0 16px', background: '#FFFFFF', border: '1px solid #F0E4EA', borderRadius: h / 2, boxShadow: compact ? 'none' : '0 10px 30px rgba(43,26,36,0.07)' }}>
          <Search size={compact ? 16 : 18} color="#7A6B73" strokeWidth={2.2} style={{ flexShrink: 0 }} />
          <input
            value={q}
            onChange={e => setQ(e.target.value.slice(0, 100))}
            onFocus={() => !rien && setOuvert(true)}
            onBlur={() => setTimeout(() => setOuvert(false), 150)}
            onKeyDown={e => { if (e.key === 'Enter') valider() }}
            placeholder={T.villePlaceholder}
            aria-label={T.villePlaceholder}
            enterKeyHint="search"
            style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', fontSize: compact ? 15 : 17, color: '#2B1A24', textOverflow: 'ellipsis' }}
          />
        </div>
        <button onClick={autourDeMoi} aria-label={T.autour} title={T.autour} className="cv-autour"
          style={{ height: h, minWidth: h, justifyContent: 'center', padding: compact ? 0 : '0 20px', borderRadius: h / 2, border: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, background: '#2B1A24', color: '#FFFFFF', fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
          <LocateFixed size={17} strokeWidth={2.2} />
          {!compact && <span className="cv-texte">{etat === 'localisation' ? T.localisation : T.autour}</span>}
        </button>
      </div>
      {ouvert && !rien && (
        <div style={{ position: 'absolute', top: h + 8, left: 0, right: 0, background: '#FFFFFF', border: '1px solid #F0E4EA', borderRadius: 18, boxShadow: '0 18px 40px rgba(43,26,36,0.12)', padding: 6, zIndex: 50, textAlign: 'left' }}>
          {/* Des chiffres tapés : les lieux d'abord ; sinon, les villes d'abord. */}
          {(propositions.d === 'lieux' ? ['lieux', 'villes'] : ['villes', 'lieux']).map(genre => genre === 'villes'
            ? villes.map(v => (
              <button key={`v-${v.slug}`} onMouseDown={() => router.push(`/beaute/${v.slug}`)} style={ligne}>
                <MapPin size={16} color="#C2779E" strokeWidth={2.2} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 15, color: '#2B1A24', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.nom}</span>
                {v.zone && <span style={{ fontSize: 13, color: '#7A6B73', flexShrink: 0 }}>{v.zone}</span>}
              </button>
            ))
            : lieux.map((l, i) => (
              <button key={`l-${i}-${l.libelle}`} onMouseDown={() => allerAutour(l.lat, l.lon, l.libelle)} style={ligne}>
                <Navigation size={15} color="#C2779E" strokeWidth={2.2} style={{ flexShrink: 0 }} />
                <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 15, color: '#2B1A24', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.libelle}</span>
                  {l.detail && <span style={{ fontSize: 12.5, color: '#7A6B73', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.detail}</span>}
                </span>
              </button>
            )))}
        </div>
      )}
      {etat === 'refus' && <p style={{ margin: '10px 4px 0', fontSize: 13, color: '#7A6B73' }}>{T.localisationRefusee}</p>}
    </div>
  )
}

const ligne: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '10px 12px', border: 0, background: 'transparent', borderRadius: 12, cursor: 'pointer', minWidth: 0 }
