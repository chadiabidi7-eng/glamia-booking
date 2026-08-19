'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { loadStripe, type Stripe as StripeJs } from '@stripe/stripe-js'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { traduire } from '@/lib/i18n'

// ─────────────────────────────────────────────────────────────────────────────
// Glamia Pay — page de paiement maison (remplace Stripe Checkout).
// Ouverte via le lien d'encaissement : /payer?token=<paiement_id>
// 100 % aux couleurs Glamia, détail prestation + frais toujours visible.
// ─────────────────────────────────────────────────────────────────────────────

const PINK = '#C2779E'
const STRIPE_PK = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''

const fmt = (c: number) => `${(c / 100).toFixed(2).replace('.', ',')} €`

const stripePromises: Record<string, ReturnType<typeof loadStripe>> = {}
function getStripePromise(compte: string) {
  if (!stripePromises[compte]) stripePromises[compte] = loadStripe(STRIPE_PK, { stripeAccount: compte })
  return stripePromises[compte]
}

type Details = {
  statut: string
  stripe_account?: string
  client_secret?: string
  type?: string
  prestation?: string | null
  cliente_prenom?: string | null
  cliente_nom?: string | null
  cliente_email?: string | null
  restant?: number
  frais?: number
  total?: number
}

export default function PayerWrapper() {
  return (
    <Suspense fallback={<Cadre><p style={{ color: '#9ca3af' }}>{traduire('commun.chargement')}</p></Cadre>}>
      <Payer />
    </Suspense>
  )
}

function Cadre({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#FDF6F0', padding: '28px 16px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      fontFamily: "'Poppins', -apple-system, sans-serif",
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Poppins:wght@400;500;600&display=swap');`}</style>
      {children}
    </div>
  )
}

function Payer() {
  const params = useSearchParams()
  const token = params.get('token') ?? ''
  const [d, setD] = useState<Details | null>(null)
  const [erreur, setErreur] = useState(false)

  useEffect(() => {
    if (!token) { setErreur(true); return }
    fetch(`/api/propay/lien?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(j => (j.error ? setErreur(true) : setD(j)))
      .catch(() => setErreur(true))
  }, [token])

  const appearance = useMemo(() => ({
    theme: 'flat' as const,
    variables: {
      colorPrimary: PINK,
      colorText: '#3a2f36',
      colorBackground: '#ffffff',
      fontFamily: "'Poppins', sans-serif",
      borderRadius: '12px',
      spacingUnit: '4px',
    },
  }), [])
  const fonts = useMemo(() => [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap' }], [])

  if (erreur) {
    return (
      <Cadre>
        <p style={{ fontSize: 36, margin: '40px 0 8px' }}>🌸</p>
        <h1 style={{ fontSize: 20, color: '#1f2937', fontFamily: "'Playfair Display', serif" }}>{traduire('payer.lienIndisponible')}</h1>
        <p style={{ fontSize: 14, color: '#6b7280', textAlign: 'center' }}>{traduire('merci.lienExpire')}</p>
      </Cadre>
    )
  }
  if (!d) return <Cadre><p style={{ color: '#9ca3af', marginTop: 60 }}>{traduire('commun.chargement')}</p></Cadre>

  if (d.statut === 'paye') {
    return (
      <Cadre>
        <div style={pastille}><span style={{ color: '#fff', fontSize: 30, fontWeight: 700 }}>✓</span></div>
        <h1 style={{ fontSize: 22, color: '#1f2937', margin: 0, fontFamily: "'Playfair Display', serif" }}>{traduire('payer.dejaRegle')}</h1>
        <p style={{ fontSize: 14, color: '#6b7280', margin: '6px 0 18px' }}>{traduire('payer.dejaRegleDetail')}</p>
        <a href={`/paiement/merci?token=${encodeURIComponent(token)}`} style={boutonLien}>{traduire('payer.voirFacture')}</a>
      </Cadre>
    )
  }

  if (d.statut !== 'a_payer' || !d.client_secret || !d.stripe_account) {
    return (
      <Cadre>
        <p style={{ fontSize: 36, margin: '40px 0 8px' }}>🌸</p>
        <h1 style={{ fontSize: 20, color: '#1f2937', fontFamily: "'Playfair Display', serif" }}>{traduire('payer.indisponible')}</h1>
      </Cadre>
    )
  }

  return (
    <Cadre>
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* En-tête */}
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: PINK, letterSpacing: 0.5, fontFamily: "'Playfair Display', serif" }}>Glamia</div>
          <p style={{ fontSize: 14, color: '#6b7280', margin: '4px 0 0' }}>
            {d.cliente_prenom ? `Bonjour ${d.cliente_prenom}, ` : ''}règle ta prestation en toute sécurité.
          </p>
        </div>

        {/* Détail toujours visible */}
        <div style={carteDetail}>
          <Ligne
            label={`${d.type === 'acompte' ? 'Acompte' : d.type === 'solde' ? 'Solde' : 'Prestation'}${d.prestation ? ` — ${d.prestation}` : ''}`}
            val={fmt(d.restant ?? 0)}
          />
          <Ligne label="Frais de réservation" val={fmt(d.frais ?? 0)} />
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, marginTop: 4, borderTop: `1px solid ${PINK}33` }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: PINK, fontFamily: "'Playfair Display', serif" }}>{traduire('resa.total')}</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: PINK }}>{fmt(d.total ?? 0)}</span>
          </div>
        </div>

        {/* Carte */}
        <Elements
          stripe={getStripePromise(d.stripe_account)}
          options={{ clientSecret: d.client_secret, locale: 'fr', appearance, fonts }}
        >
          <Formulaire token={token} total={d.total ?? 0} nom={d.cliente_nom ?? ''} email={d.cliente_email ?? ''} />
        </Elements>

        <p style={{ fontSize: 11, color: '#9a8f95', textAlign: 'center', marginTop: 12, lineHeight: 1.4 }}>
          {/* « hors zone euro » ne veut rien dire pour la cliente d'une pro
              suisse ou canadienne : sa carte locale est parfaitement normale
              chez elle. Ce qui coûte plus cher, c'est une carte d'un AUTRE pays
              que celui de la praticienne — quel que soit ce pays. */}
          Une carte émise dans un autre pays que celui de ta praticienne peut entraîner des frais plus élevés.
        </p>
        <p style={{ fontSize: 10.5, color: '#b8aeb4', textAlign: 'center', marginTop: 8 }}>{traduire('payer.paiementSecurise')}</p>
      </div>
    </Cadre>
  )
}

function Ligne({ label, val }: { label: string; val: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0' }}>
      <span style={{ fontSize: 13.5, color: '#5b4f56' }}>{label}</span>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: '#3a2f36' }}>{val}</span>
    </div>
  )
}

function Formulaire({ token, total, nom, email }: { token: string; total: number; nom: string; email: string }) {
  const stripe = useStripe()
  const elements = useElements()
  const [enCours, setEnCours] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // On ne retire l'invite Link que si on a l'email à fournir au confirm
  // (Stripe l'exige dès qu'on opte pour ne pas le collecter dans l'UI).
  const retirerLink = !!email

  const payer = async () => {
    if (!stripe || !elements || enCours) return
    setEnCours(true)
    setMsg(null)
    const { error } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
      ...(retirerLink ? { confirmParams: { payment_method_data: { billing_details: { name: nom || undefined, email } } } } : {}),
    })
    if (error) {
      setMsg(error.message ?? traduire('payer.echec'))
      setEnCours(false)
      return
    }
    // Confirme côté serveur (marque payé + notifie la pro), puis facture.
    try {
      await fetch('/api/propay/lien', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
    } catch { /* le webhook / la vérif pro prendront le relais */ }
    window.location.href = `/paiement/merci?token=${encodeURIComponent(token)}`
  }

  return (
    <>
      <PaymentElement options={{
            // Apple Pay / Google Pay selon l'appareil, comme sur la page de résa.
            wallets: { applePay: 'auto', googlePay: 'auto' },
        layout: 'tabs',
        // On ne collecte pas nom/email (fournis au confirm) → supprime l'invite
        // Link. Uniquement si on a l'email, sinon on laisse Stripe collecter.
        ...(retirerLink ? { fields: { billingDetails: { name: 'never', email: 'never' } } } : {}),
      }} />
      <button onClick={payer} disabled={enCours} style={{
        marginTop: 16, width: '100%', background: PINK, color: '#fff', border: 'none',
        padding: '15px', borderRadius: 14, fontWeight: 700, fontSize: 15, cursor: enCours ? 'default' : 'pointer',
        opacity: enCours ? 0.6 : 1, fontFamily: "'Poppins', sans-serif",
      }}>
        {enCours ? 'Paiement…' : `Payer ${fmt(total)}`}
      </button>
      {msg && <p style={{ color: '#c0392b', fontSize: 13, textAlign: 'center', marginTop: 10 }}>{msg}</p>}
    </>
  )
}

const carteDetail: React.CSSProperties = {
  background: '#fff', borderRadius: 16, border: `1.5px solid ${PINK}55`,
  padding: '14px 16px', marginBottom: 16, boxShadow: '0 4px 18px rgba(194,119,158,0.10)',
}
const pastille: React.CSSProperties = {
  width: 64, height: 64, borderRadius: '50%', background: PINK, margin: '8px auto 14px',
  display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 6px 22px ${PINK}66`,
}
const boutonLien: React.CSSProperties = {
  background: PINK, color: '#fff', textDecoration: 'none', padding: '13px 28px',
  borderRadius: 50, fontWeight: 700, fontSize: 14,
}
