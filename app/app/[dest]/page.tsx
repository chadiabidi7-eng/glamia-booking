'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { traduire } from '@/lib/i18n'

const APP_STORE_URL = 'https://apps.apple.com/us/app/glamia/id6760552102'

// Destinations autorisées → écrans de l'app (deep link glamia://)
const DESTINATIONS: Record<string, string> = {
  parametres: 'parametres',   // partage du lien de réservation
  abonnement: 'abonnement',   // page d'abonnement Pro
  accueil: '',                // ouverture simple
}

// Lien intelligent utilisé dans les emails : tente d'ouvrir l'écran précis
// de l'app (scheme glamia://), et bascule sur l'App Store si l'app n'est
// pas installée. Ex : booking.glamia.pro/app/abonnement
export default function OuvrirApp() {
  const params = useParams<{ dest: string }>()

  useEffect(() => {
    const dest = DESTINATIONS[params.dest ?? ''] ?? ''
    window.location.href = `glamia://${dest}`
    const t = setTimeout(() => {
      window.location.href = APP_STORE_URL
    }, 1600)
    return () => clearTimeout(t)
  }, [params.dest])

  return (
    <main style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 14, background: '#FFF9FB', padding: 24,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.png" alt="Glamia" width={72} height={72} style={{ borderRadius: 20 }} />
      <p style={{ fontSize: 16, fontWeight: 700, color: '#1f2937', margin: 0 }}>{traduire('stripe.ouvertureGlamia')}</p>
      <p style={{ fontSize: 13, color: '#9ca3af', margin: 0, textAlign: 'center' }}>
        Si rien ne se passe,{' '}
        <a href={APP_STORE_URL} style={{ color: '#C2779E', fontWeight: 600 }}>{traduire('stripe.telechargerApp')}</a>.
      </p>
    </main>
  )
}
