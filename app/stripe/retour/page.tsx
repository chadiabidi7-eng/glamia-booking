'use client'

import { useEffect } from 'react'

// Page relais post-onboarding Stripe : la pro revient ici après avoir terminé
// (ou quitté) le parcours Stripe Express. On tente de rouvrir l'app — le
// statut réel est resynchronisé à la réouverture de l'écran Pro Pay.
export default function StripeRetour() {
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
      <p style={{ fontSize: 40, margin: 0 }}>💜</p>
      <h1 style={{ fontSize: 22, color: '#1f2937', margin: 0 }}>Connexion terminée !</h1>
      <p style={{ fontSize: 15, color: '#6b7280', margin: 0, lineHeight: 1.5 }}>
        Retourne dans l&apos;app Glamia pour finaliser<br />ta configuration des acomptes.
      </p>
      <a
        href="glamia://pro-pay"
        style={{
          marginTop: 10, background: '#7C4DFF', color: '#fff', textDecoration: 'none',
          padding: '14px 32px', borderRadius: 50, fontWeight: 700, fontSize: 15,
        }}
      >
        Ouvrir Glamia
      </a>
    </div>
  )
}
