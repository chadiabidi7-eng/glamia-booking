'use client'

import { useEffect } from 'react'
import { traduire } from '@/lib/i18n'

// Page relais « refresh » Stripe : le lien d'onboarding a expiré ou la pro
// a interrompu le parcours. Elle repart de l'app, qui régénère un lien frais.
export default function StripeReprise() {
  useEffect(() => {
    window.location.href = 'glamia://pro-pay'
  }, [])

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 14,
      background: '#FDF6F0', padding: 24, textAlign: 'center',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    }}>
      <p style={{ fontSize: 40, margin: 0 }}>⏳</p>
      <h1 style={{ fontSize: 22, color: '#1f2937', margin: 0 }}>{traduire('stripe.reprise')}</h1>
      <p style={{ fontSize: 15, color: '#6b7280', margin: 0, lineHeight: 1.5 }}>
        {traduire('stripe.repriseDetail')}<br />
        {traduire('stripe.repriseDetail2')}
      </p>
      <a
        href="glamia://pro-pay"
        style={{
          marginTop: 10, background: '#C2779E', color: '#fff', textDecoration: 'none',
          padding: '14px 32px', borderRadius: 50, fontWeight: 700, fontSize: 15,
        }}
      >{traduire('stripe.ouvrirGlamia')}</a>
    </div>
  )
}
