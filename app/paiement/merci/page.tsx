'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { traduire, poserLangue, poserLangueSansPro } from '@/lib/i18n'

// ─────────────────────────────────────────────────────────────────────────────
// Glamia Pay — page « Paiement validé » + facture rose, simple et imprimable.
// Atterrissage du lien de paiement (Checkout) : ?session_id=cs_...&acct=acct_...
// ─────────────────────────────────────────────────────────────────────────────

const PINK = '#C2779E'

// La facture n'est plus fabriquée ici : elle arrive toute faite, dans la monnaie
// de la caisse de la pro. L'euro écrit en dur à cet endroit était le défaut.
type Recu = { statut: string; langue?: string | null; html?: string }

export default function MerciWrapper() {
  return (
    <Suspense fallback={<Cadre><p style={{ color: '#9ca3af' }}>{traduire('commun.chargement')}</p></Cadre>}>
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
    // Un lien expiré ou tronqué n'a aucune pro à suivre : le message d'erreur
    // suit alors le navigateur, comme la page d'avis. Le reçu, quand il
    // arrive, repose la langue de la pro par-dessus.
    poserLangueSansPro()
    if (!token) { setErreur(true); return }
    fetch(`/api/propay/recu?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setErreur(true); return }
        // La langue arrive avec le reçu, et doit être posée AVANT le premier
        // rendu : le cadre de la page reste sinon en français autour d'une
        // facture anglaise.
        poserLangue(d.langue)
        setRecu(d)
      })
      .catch(() => setErreur(true))
  }, [token])

  if (erreur) {
    return (
      <Cadre>
        <p style={{ fontSize: 36, margin: '40px 0 8px' }}>🌸</p>
        <h1 style={{ fontSize: 20, color: '#1f2937' }}>{traduire('merci.introuvable')}</h1>
        <p style={{ fontSize: 14, color: '#6b7280' }}>{traduire('merci.lienExpire')}</p>
      </Cadre>
    )
  }

  if (!recu) return <Cadre><p style={{ color: '#9ca3af', marginTop: 60 }}>{traduire('merci.verification')}</p></Cadre>

  if (recu.statut !== 'paye') {
    return (
      <Cadre>
        <p style={{ fontSize: 36, margin: '40px 0 8px' }}>⏳</p>
        <h1 style={{ fontSize: 20, color: '#1f2937' }}>{traduire('merci.enCours')}</h1>
        <p style={{ fontSize: 14, color: '#6b7280' }}>{traduire('merci.recharge')}</p>
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
        <h1 style={{ fontSize: 22, color: '#1f2937', margin: 0 }}>{traduire('merci.valide')}</h1>
        <p style={{ fontSize: 14, color: '#6b7280', margin: '6px 0 0' }}>{traduire('merci.prevenue')}</p>
      </div>

      {/* ── LA FACTURE, CELLE DU MAIL ET AUCUNE AUTRE ────────────────────────
          Cette page en dessinait une deuxième, avec ses propres lignes et
          l'euro écrit en dur : la même prestation réglée en francs s'affichait
          en euros ici et en francs dans le mail reçu juste après. Il manquait
          aussi le détail des prestations et les remises accordées.

          Deux modèles censés dire la même chose finissent toujours par
          diverger. Il n'y en a donc plus qu'un, fabriqué par la fonction qui
          l'envoie par mail, affiché ici tel quel. */}
      <div
        style={{ width: '100%', maxWidth: 560 }}
        dangerouslySetInnerHTML={{ __html: recu.html ?? '' }}
      />

      <button
        className="no-print"
        onClick={() => window.print()}
        style={{
          marginTop: 18, background: PINK, color: '#fff', border: 'none', cursor: 'pointer',
          padding: '13px 30px', borderRadius: 50, fontWeight: 700, fontSize: 14,
        }}>{traduire('merci.facture')}</button>
    </Cadre>
  )
}
