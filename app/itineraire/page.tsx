'use client'

// ─────────────────────────────────────────────────────────────────────────────
// L'ADRESSE DE LA PRO, OUVERTE DANS LA BONNE CARTE (21 oct. 2026, Chadi).
//
// L'iPhone transformait l'adresse en lien vers Plans, alors que la plupart des
// clientes attendent Google Maps. Une page web ne peut pas savoir si Google
// Maps est installé : sur iPhone on propose donc les deux, Google Maps d'abord.
// Sur Android et sur ordinateur, Google Maps s'ouvre directement.
//
// /itineraire?a=<adresse>&l=<fr|en|es>
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'

const TEXTES = {
  fr: { titre: 'Ouvrir l’adresse avec', google: 'Google Maps', plans: 'Plans', retour: 'Retour' },
  en: { titre: 'Open the address with', google: 'Google Maps', plans: 'Apple Maps', retour: 'Back' },
  es: { titre: 'Abrir la dirección con', google: 'Google Maps', plans: 'Mapas', retour: 'Volver' },
} as const

const ROSE = '#D4537E'

export default function Itineraire() {
  const [adresse, setAdresse] = useState('')
  const [langue, setLangue] = useState<keyof typeof TEXTES>('fr')
  const [iphone, setIphone] = useState<boolean | null>(null)

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const a = (p.get('a') ?? '').slice(0, 300)
    const l = p.get('l')
    setAdresse(a)
    if (l === 'en' || l === 'es') setLangue(l)
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      || p.get('appareil') === 'iphone' // pour l'essai depuis un ordinateur
    setIphone(ios)
    if (!ios && a) window.location.replace(lienGoogle(a))
  }, [])

  const T = TEXTES[langue]
  if (!adresse || iphone !== true) return <main style={{ minHeight: '100vh', background: '#FDF6F0' }} />

  const bouton = (plein: boolean): React.CSSProperties => ({
    display: 'block', width: '100%', boxSizing: 'border-box', padding: '16px 20px', borderRadius: 50, textAlign: 'center',
    fontSize: 16, fontWeight: 700, textDecoration: 'none', marginTop: 12,
    background: plein ? ROSE : '#FFFFFF', color: plein ? '#FFFFFF' : ROSE, border: `1.5px solid ${ROSE}`,
  })

  return (
    <main style={{ minHeight: '100vh', background: '#FDF6F0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 380, background: '#FFFFFF', borderRadius: 22, padding: '26px 22px 20px', boxShadow: '0 8px 28px rgba(120,60,90,0.08)' }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, letterSpacing: '0.06em', color: '#9A8A93', textTransform: 'uppercase', textAlign: 'center' }}>{T.titre}</p>
        <p style={{ margin: '10px 0 8px', fontSize: 16, fontWeight: 600, color: '#2B1A24', textAlign: 'center', lineHeight: 1.4, overflowWrap: 'anywhere' }}>{adresse}</p>
        <a href={lienGoogle(adresse)} style={bouton(true)}>{T.google}</a>
        <a href={`https://maps.apple.com/?q=${encodeURIComponent(adresse)}`} style={bouton(false)}>{T.plans}</a>
        <button type="button" onClick={() => history.back()} style={{ display: 'block', margin: '14px auto 0', background: 'none', border: 'none', color: '#9A8A93', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{T.retour}</button>
      </div>
    </main>
  )
}

/** Le lien universel de Google Maps : l'app s'ouvre si elle est installée, sinon le site. */
function lienGoogle(a: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}`
}
