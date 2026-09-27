'use client'

import { useEffect, useRef } from 'react'
import 'maplibre-gl/dist/maplibre-gl.css'

// La carte « Emplacement » de la vitrine : la même que dans l'app — fond gris,
// un cercle rose sur le quartier, jamais un point. Immobile : on la regarde,
// on ne la manipule pas. La position reçue est déjà floutée par le serveur.

const RAYON_M = 350

function cercle(lat: number, lon: number, rayon: number): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI
    pts.push([lon + (rayon * Math.sin(a)) / (111320 * Math.cos(lat * Math.PI / 180)), lat + (rayon * Math.cos(a)) / 111320])
  }
  return pts
}

export default function CarteCercle({ lat, lon, couleur = '#C77A96' }: { lat: number; lon: number; couleur?: string }) {
  const boite = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let carte: import('maplibre-gl').Map | null = null
    let annule = false
    import('maplibre-gl').then(ml => {
      if (annule || !boite.current) return
      carte = new ml.Map({
        container: boite.current, style: 'https://tiles.openfreemap.org/styles/positron',
        center: [lon, lat], zoom: 14.2, interactive: false, attributionControl: { compact: true },
      })
      carte.on('load', () => {
        carte!.addSource('zone', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [cercle(lat, lon, RAYON_M)] } } })
        carte!.addLayer({ id: 'zone-fond', type: 'fill', source: 'zone', paint: { 'fill-color': couleur, 'fill-opacity': 0.22 } })
        carte!.addLayer({ id: 'zone-bord', type: 'line', source: 'zone', paint: { 'line-color': couleur, 'line-width': 1.5 } })
      })
    })
    return () => { annule = true; carte?.remove() }
  }, [lat, lon, couleur])
  return <div ref={boite} style={{ width: '100%', height: 200, borderRadius: 16, overflow: 'hidden', background: '#F2EEEC' }} />
}
