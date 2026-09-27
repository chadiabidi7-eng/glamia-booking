'use client'

import { useEffect, useRef } from 'react'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Map as CarteMaplibre, Marker } from 'maplibre-gl'
import type { ProTrouvee } from '@/lib/recherche-pros'

// ─────────────────────────────────────────────────────────────────────────────
// LA CARTE DE LA RECHERCHE — une photo ronde par pro, sur un fond gris clair.
//
// Fond OpenFreeMap « Positron » (OpenStreetMap) : gratuit, sans clé, sans
// limite annoncée, et discret — les photos des pros sont la seule couleur.
// (CARTO, essayé d'abord, exige désormais une clé.) MapLibre ne se charge que
// dans le navigateur. La pro survolée dans la liste grandit ici, et toucher une
// photo sélectionne sa carte dans la liste.
// ─────────────────────────────────────────────────────────────────────────────

const ROSE = '#C2779E'
const STYLE = 'https://tiles.openfreemap.org/styles/positron'

/** Seules des adresses d'image https passent, sans guillemet. */
const photoSure = (u: string | null) => (u && /^https:\/\/[^"'<>\s]+$/.test(u) ? u : null)

function initiales(nom: string) {
  return nom.split(/\s+/).filter(Boolean).slice(0, 2).map(m => m[0]?.toUpperCase() ?? '').join('')
}

/** L'épingle : un rond blanc cerclé, la photo dedans (ou ses initiales). */
function fabriquerPin(p: ProTrouvee, onClick: () => void): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = 'width:44px;height:44px;border-radius:50%;overflow:hidden;border:3px solid #fff;box-shadow:0 6px 16px rgba(43,26,36,.22);background:#fff;cursor:pointer;transition:width .18s ease,height .18s ease,border-color .18s ease'
  const photo = photoSure(p.photo)
  if (photo) {
    const img = document.createElement('img')
    img.src = photo; img.alt = ''
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block'
    el.appendChild(img)
  } else {
    const t = document.createElement('div')
    t.textContent = initiales(p.nom)
    t.style.cssText = 'width:100%;height:100%;display:grid;place-items:center;background:#F9EEF4;color:#A85F7C;font:700 14px/1 -apple-system,system-ui,sans-serif'
    el.appendChild(t)
  }
  el.title = p.nom
  el.addEventListener('click', e => { e.stopPropagation(); onClick() })
  return el
}

export default function Carte({ pros, actif, onChoisir, centre }: {
  pros: ProTrouvee[]
  actif: string | null
  onChoisir: (slug: string) => void
  centre: { lat: number; lon: number } | null
}) {
  const boite = useRef<HTMLDivElement>(null)
  const carte = useRef<CarteMaplibre | null>(null)
  const lib = useRef<typeof import('maplibre-gl') | null>(null)
  const pins = useRef(new Map<string, { marker: Marker; el: HTMLDivElement }>())
  const choisir = useRef(onChoisir)
  choisir.current = onChoisir

  function poser() {
    const m = carte.current, ml = lib.current
    if (!m || !ml) return
    pins.current.forEach(p => p.marker.remove()); pins.current.clear()
    for (const p of pros) {
      const el = fabriquerPin(p, () => choisir.current(p.slug))
      const marker = new ml.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(m)
      pins.current.set(p.slug, { marker, el })
    }
    if (pros.length > 1) {
      const b = new ml.LngLatBounds()
      pros.forEach(p => b.extend([p.lon, p.lat]))
      m.fitBounds(b, { padding: 70, maxZoom: 14, duration: 0 })
    } else if (pros.length === 1) m.jumpTo({ center: [pros[0].lon, pros[0].lat], zoom: 14 })
    else if (centre) m.jumpTo({ center: [centre.lon, centre.lat], zoom: 12 })
  }

  // La carte, une fois.
  useEffect(() => {
    let annule = false
    import('maplibre-gl').then(ml => {
      if (annule || !boite.current || carte.current) return
      lib.current = ml
      // Un appareil sans WebGL ne sait pas dessiner la carte : on s'arrête là,
      // sans erreur. La liste des pros, elle, reste entière.
      let m: CarteMaplibre
      try {
        m = new ml.Map({
          container: boite.current, style: STYLE,
          center: centre ? [centre.lon, centre.lat] : [2.35, 46.6], zoom: centre ? 11 : 5,
          attributionControl: { compact: true },
        })
      } catch (e) {
        console.warn('[carte] indisponible sur cet appareil :', (e as Error)?.message)
        return
      }
      m.addControl(new ml.NavigationControl({ showCompass: false }), 'bottom-right')
      carte.current = m
      m.on('load', poser)
    })
    return () => { annule = true; carte.current?.remove(); carte.current = null; pins.current.clear() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // La liste a changé (un filtre) : on repose les photos.
  useEffect(() => { if (carte.current?.loaded()) poser() // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pros])

  // La pro survolée ou choisie : sa photo grandit, se cercle de rose, passe devant.
  useEffect(() => {
    pins.current.forEach(({ el }, slug) => {
      const on = slug === actif
      el.style.width = el.style.height = on ? '56px' : '44px'
      el.style.borderColor = on ? ROSE : '#fff'
      el.style.zIndex = on ? '10' : ''
    })
  }, [actif])

  return <div ref={boite} style={{ width: '100%', height: '100%', background: '#F2EEEC' }} />
}
