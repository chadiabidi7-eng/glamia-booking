'use client'

import { useEffect } from 'react'
import { traduire } from '@/lib/i18n'

// Page relais post-onboarding Stripe : la pro revient ici après avoir terminé
// le parcours Stripe Express. « Compte validé » + redirection vers l'écran
// Caisse de l'app. Le statut réel est resynchronisé à la réouverture de l'écran.
const PINK = '#C2779E'
const CAISSE = 'glamia://pro-pay'

export default function StripeRetour() {
  useEffect(() => {
    const t = setTimeout(() => { window.location.href = CAISSE }, 1200)
    return () => clearTimeout(t)
  }, [])

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 14,
      background: '#FDF6F0', padding: 24, textAlign: 'center',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: '50%', background: PINK,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 6px 24px ${PINK}66`, marginBottom: 4,
      }}>
        <span style={{ color: '#fff', fontSize: 34, fontWeight: 700 }}>✓</span>
      </div>
      <h1 style={{ fontSize: 23, color: '#1f2937', margin: 0 }}>{traduire('stripe.compteValide')}</h1>
      <p style={{ fontSize: 15, color: '#6b7280', margin: 0, lineHeight: 1.5 }}>
        {traduire('stripe.paiementsActifs')}<br />{traduire('stripe.versLaCaisse')}
      </p>
      <a
        href={CAISSE}
        style={{
          marginTop: 10, background: PINK, color: '#fff', textDecoration: 'none',
          padding: '14px 32px', borderRadius: 50, fontWeight: 700, fontSize: 15,
        }}
      >{traduire('stripe.ouvrirMaCaisse')}</a>
    </div>
  )
}
