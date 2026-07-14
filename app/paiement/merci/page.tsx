'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

// ─────────────────────────────────────────────────────────────────────────────
// Glamia Pay — page « Paiement validé » + facture rose, simple et imprimable.
// Atterrissage du lien de paiement (Checkout) : ?session_id=cs_...&acct=acct_...
// ─────────────────────────────────────────────────────────────────────────────

const PINK = '#C2779E'

const fmt = (c: number) => `${(c / 100).toFixed(2).replace('.', ',')} €`

type Recu = {
  statut: string
  numero?: string
  date?: string
  pro?: string
  lignes?: { libelle: string; montant: number }[]
  total?: number
}

export default function MerciWrapper() {
  return (
    <Suspense fallback={<Cadre><p style={{ color: '#9ca3af' }}>Chargement…</p></Cadre>}>
      <PageMerci />
    </Suspense>
  )
}

function Cadre({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#FDF6F0', padding: '32px 16px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    }}>
      {children}
    </div>
  )
}

function PageMerci() {
  const params = useSearchParams()
  const token = params.get('token')
  const [recu, setRecu] = useState<Recu | null>(null)
  const [erreur, setErreur] = useState(false)

  useEffect(() => {
    if (!token) { setErreur(true); return }
    fetch(`/api/propay/recu?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => (d.error ? setErreur(true) : setRecu(d)))
      .catch(() => setErreur(true))
  }, [token])

  if (erreur) {
    return (
      <Cadre>
        <p style={{ fontSize: 36, margin: '40px 0 8px' }}>🌸</p>
        <h1 style={{ fontSize: 20, color: '#1f2937' }}>Paiement introuvable</h1>
        <p style={{ fontSize: 14, color: '#6b7280' }}>Le lien a peut-être expiré. Rapproche-toi de ta praticienne.</p>
      </Cadre>
    )
  }

  if (!recu) return <Cadre><p style={{ color: '#9ca3af', marginTop: 60 }}>Vérification du paiement…</p></Cadre>

  if (recu.statut !== 'paye') {
    return (
      <Cadre>
        <p style={{ fontSize: 36, margin: '40px 0 8px' }}>⏳</p>
        <h1 style={{ fontSize: 20, color: '#1f2937' }}>Paiement en cours</h1>
        <p style={{ fontSize: 14, color: '#6b7280' }}>Recharge cette page dans quelques secondes.</p>
      </Cadre>
    )
  }

  return (
    <Cadre>
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff !important; } }`}</style>

      {/* Confirmation */}
      <div className="no-print" style={{ textAlign: 'center', marginBottom: 22 }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', background: PINK, margin: '8px auto 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 6px 22px ${PINK}66`,
        }}>
          <span style={{ color: '#fff', fontSize: 30, fontWeight: 700 }}>✓</span>
        </div>
        <h1 style={{ fontSize: 22, color: '#1f2937', margin: 0 }}>Paiement validé</h1>
        <p style={{ fontSize: 14, color: '#6b7280', margin: '6px 0 0' }}>
          Merci ! Ta praticienne a été prévenue 💅
        </p>
      </div>

      {/* Facture */}
      <div style={{
        width: '100%', maxWidth: 420, background: '#fff', borderRadius: 18,
        border: `1.5px solid ${PINK}55`, padding: '22px 22px 18px',
        boxShadow: '0 4px 20px rgba(194,119,158,0.12)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: PINK, letterSpacing: 0.6 }}>Glamia</span>
          <span style={{ fontSize: 11, color: '#9ca3af' }}>Facture n° {recu.numero}</span>
        </div>
        <p style={{ fontSize: 12.5, color: '#6b7280', margin: '0 0 14px' }}>
          {recu.pro ? <>{recu.pro} · </> : null}
          {recu.date ? new Date(recu.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
        </p>

        <div style={{ borderTop: '1px solid #F3E8EF' }}>
          {(recu.lignes ?? []).map((l, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #F3E8EF' }}>
              <span style={{ fontSize: 13.5, color: '#374151' }}>{l.libelle}</span>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: '#374151' }}>{fmt(l.montant)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 2px' }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: PINK }}>Total payé</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: PINK }}>{fmt(recu.total ?? 0)}</span>
          </div>
        </div>

        <p style={{ fontSize: 10.5, color: '#b8aeb4', margin: '14px 0 0', textAlign: 'center' }}>
          Paiement sécurisé · Glamia Pay
        </p>
      </div>

      <button
        className="no-print"
        onClick={() => window.print()}
        style={{
          marginTop: 18, background: PINK, color: '#fff', border: 'none', cursor: 'pointer',
          padding: '13px 30px', borderRadius: 50, fontWeight: 700, fontSize: 14,
        }}>
        Enregistrer ma facture (PDF)
      </button>
    </Cadre>
  )
}
