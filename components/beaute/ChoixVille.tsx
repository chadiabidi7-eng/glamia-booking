'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LocateFixed, MapPin, Search } from 'lucide-react'
import { TEXTES, type Langue } from '@/lib/beaute-textes'

// Le champ « Ta ville » (avec propositions) et « Autour de moi ». Sert sur la
// page d'entrée, en grand, et en haut des résultats, en petit.

export const POSITION_CLE = 'glamia_ma_position'

export default function ChoixVille({ langue, compact = false }: { langue: Langue; compact?: boolean }) {
  const T = TEXTES[langue]
  const router = useRouter()
  const [q, setQ] = useState('')
  const [villes, setVilles] = useState<{ nom: string; slug: string; zone: string | null }[]>([])
  const [ouvert, setOuvert] = useState(false)
  const [etat, setEtat] = useState<'repos' | 'localisation' | 'refus'>('repos')
  const enCours = useRef<AbortController | null>(null)

  useEffect(() => {
    if (q.trim().length < 2) { setVilles([]); return }
    const t = setTimeout(async () => {
      enCours.current?.abort()
      const c = new AbortController(); enCours.current = c
      try {
        const r = await fetch(`/api/villes?q=${encodeURIComponent(q)}`, { signal: c.signal })
        const d = await r.json()
        setVilles(d.villes ?? []); setOuvert(true)
      } catch { /* frappe suivante */ }
    }, 200)
    return () => clearTimeout(t)
  }, [q])

  const autourDeMoi = () => {
    if (!navigator.geolocation) { setEtat('refus'); return }
    setEtat('localisation')
    navigator.geolocation.getCurrentPosition(pos => {
      const lat = Math.round(pos.coords.latitude * 1000) / 1000
      const lon = Math.round(pos.coords.longitude * 1000) / 1000
      try { sessionStorage.setItem(POSITION_CLE, JSON.stringify({ lat, lon })) } catch { /* navigation privée */ }
      router.push(`/beaute/autour?lat=${lat}&lon=${lon}`)
    }, () => setEtat('refus'), { timeout: 10000, maximumAge: 600000 })
  }

  const h = compact ? 44 : 56
  return (
    <div style={{ width: '100%', maxWidth: compact ? 380 : 520, position: 'relative' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, height: h, padding: '0 16px', background: '#FFFFFF', border: '1px solid #EFE4EA', borderRadius: h / 2, boxShadow: compact ? 'none' : '0 10px 30px rgba(43,26,36,0.06)' }}>
          <Search size={compact ? 16 : 18} color="#8A7682" strokeWidth={2.2} />
          <input
            value={q}
            onChange={e => setQ(e.target.value.slice(0, 60))}
            onFocus={() => villes.length && setOuvert(true)}
            onBlur={() => setTimeout(() => setOuvert(false), 150)}
            onKeyDown={e => { if (e.key === 'Enter' && villes[0]) router.push(`/beaute/${villes[0].slug}`) }}
            placeholder={T.villePlaceholder}
            aria-label={T.villePlaceholder}
            style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', fontSize: compact ? 15 : 17, color: '#2B1A24' }}
          />
        </div>
        <button onClick={autourDeMoi} aria-label={T.autour} title={T.autour}
          style={{ height: h, padding: compact ? '0 14px' : '0 20px', borderRadius: h / 2, border: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, background: '#2B1A24', color: '#FFFFFF', fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap' }}>
          <LocateFixed size={17} strokeWidth={2.2} />
          {!compact && <span>{etat === 'localisation' ? T.localisation : T.autour}</span>}
        </button>
      </div>
      {ouvert && villes.length > 0 && (
        <div style={{ position: 'absolute', top: h + 8, left: 0, right: compact ? 58 : 0, background: '#FFFFFF', border: '1px solid #EFE4EA', borderRadius: 18, boxShadow: '0 18px 40px rgba(43,26,36,0.12)', padding: 6, zIndex: 50 }}>
          {villes.map(v => (
            <button key={v.slug} onMouseDown={() => router.push(`/beaute/${v.slug}`)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '11px 12px', border: 0, background: 'transparent', borderRadius: 12, cursor: 'pointer' }}>
              <MapPin size={16} color="#A85F7C" strokeWidth={2.2} />
              <span style={{ fontSize: 15, color: '#2B1A24', fontWeight: 600 }}>{v.nom}</span>
              {v.zone && <span style={{ fontSize: 13, color: '#8A7682' }}>{v.zone}</span>}
            </button>
          ))}
        </div>
      )}
      {etat === 'refus' && <p style={{ margin: '10px 4px 0', fontSize: 13, color: '#8A7682' }}>{T.localisationRefusee}</p>}
    </div>
  )
}
