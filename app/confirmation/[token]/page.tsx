'use client'

import { Suspense, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type RdvInfo = {
  id: string
  date: string
  heure: string
  prestation: string
  categorie: string | null
  prix: number | null
  statut: string
  cliente_prenom: string
  pro_prenom: string
  pro_nom: string
  pro_pseudo: string | null
  pro_photo: string | null
}

type PageState = 'loading' | 'expired' | 'already_confirmed' | 'already_cancelled' | 'ready' | 'confirmed' | 'cancelled' | 'error'

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const PINK = '#C2779E'
const PINK_LIGHT = '#F9EEF4'

const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function formatDateFr(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  const jour = JOURS[d.getDay()]
  return `${jour} ${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
export default function ConfirmationPageWrapper() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p>Chargement...</p></div>}>
      <ConfirmationPage />
    </Suspense>
  )
}

function ConfirmationPage() {
  const { token } = useParams<{ token: string }>()
  const searchParams = useSearchParams()
  const actionParam = searchParams.get('action')

  const [state, setState] = useState<PageState>('loading')
  const [rdv, setRdv] = useState<RdvInfo | null>(null)
  const [acting, setActing] = useState(false)

  // ── Chargement initial ──────────────────────
  useEffect(() => {
    if (!token) { setState('error'); return }

    const load = async () => {
      try {
        const res = await fetch(`/api/confirmation/${token}`)

        if (res.status === 410) { setState('expired'); return }
        if (res.status === 404) { setState('expired'); return }
        if (!res.ok) { setState('error'); return }

        const info: RdvInfo = await res.json()
        setRdv(info)
        console.log('[confirmation] RDV chargé:', info.id, 'statut:', info.statut)

        if (info.statut === 'confirme') { setState('already_confirmed'); return }
        if (info.statut === 'annule') { setState('already_cancelled'); return }

        setState('ready')
      } catch (e) {
        console.error('[confirmation] Erreur inattendue:', e)
        setState('error')
      }
    }

    load()
  }, [token])

  // ── Auto-action depuis le lien email ────────
  useEffect(() => {
    if (state !== 'ready' || !rdv || !actionParam) return
    if (actionParam === 'confirmer') handleConfirmer()
    else if (actionParam === 'annuler') handleAnnuler()
  }, [state, rdv, actionParam])

  // ── Actions ─────────────────────────────────
  const handleConfirmer = async () => {
    if (!rdv || acting) return
    setActing(true)

    try {
      const res = await fetch(`/api/confirmation/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirmer' }),
      })

      if (!res.ok) { setState('error'); setActing(false); return }

      setState('confirmed')
    } catch (e) {
      console.error('[confirmation] Erreur confirmer:', e)
      setState('error')
    }
    setActing(false)
  }

  const handleAnnuler = async () => {
    if (!rdv || acting) return
    setActing(true)

    try {
      const res = await fetch(`/api/confirmation/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'annuler' }),
      })

      if (!res.ok) { setState('error'); setActing(false); return }

      setState('cancelled')
    } catch (e) {
      console.error('[confirmation] Erreur annuler:', e)
      setState('error')
    }
    setActing(false)
  }

  // ── Rendu ───────────────────────────────────
  const proDisplayName = rdv?.pro_pseudo || `${rdv?.pro_prenom ?? ''} ${rdv?.pro_nom ?? ''}`.trim()
  const prestationLabel = rdv?.categorie ? `${rdv.categorie} · ${rdv.prestation}` : rdv?.prestation

  return (
    <div style={S.page}>
      <style>{`
        .glamia-btn-confirm {
          width: 100%;
          padding: 16px;
          border-radius: 16px;
          border: none;
          background: ${PINK};
          color: #fff;
          font-weight: 700;
          font-size: 16px;
          cursor: pointer;
          transition: opacity 0.15s, transform 0.1s;
          font-family: inherit;
        }
        .glamia-btn-confirm:hover { opacity: 0.85; transform: scale(1.01); }
        .glamia-btn-confirm:active { opacity: 0.7; transform: scale(0.98); }
        .glamia-btn-confirm:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .glamia-btn-cancel {
          width: 100%;
          padding: 16px;
          border-radius: 16px;
          border: 1.5px solid #d1d5db;
          background: transparent;
          color: #6b7280;
          font-weight: 600;
          font-size: 15px;
          cursor: pointer;
          transition: opacity 0.15s, transform 0.1s, background 0.15s;
          font-family: inherit;
        }
        .glamia-btn-cancel:hover { background: #f3f4f6; transform: scale(1.01); }
        .glamia-btn-cancel:active { opacity: 0.7; transform: scale(0.98); }
        .glamia-btn-cancel:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
      <div style={S.container}>
        {/* Logo */}
        <div style={S.logoWrap}>
          <span style={S.logoText}>Glamia</span>
        </div>

        {/* Loading */}
        {state === 'loading' && (
          <div style={S.center}>
            <div style={S.spinner} />
            <p style={S.grayText}>Chargement...</p>
          </div>
        )}

        {/* Token expiré */}
        {state === 'expired' && (
          <div style={S.center}>
            <div style={S.iconCircle}>
              <span style={{ fontSize: 36 }}>🔗</span>
            </div>
            <h2 style={S.h2}>Lien expiré</h2>
            <p style={S.grayText}>
              Ce lien de confirmation n&apos;est plus valide.<br />
              Contactez votre professionnelle pour un nouveau lien.
            </p>
          </div>
        )}

        {/* Déjà confirmé */}
        {state === 'already_confirmed' && rdv && (
          <div style={S.center}>
            <div style={{ ...S.iconCircle, background: '#E8F5E9' }}>
              <span style={{ fontSize: 36 }}>✅</span>
            </div>
            <h2 style={S.h2}>RDV déjà confirmé</h2>
            <p style={S.grayText}>
              Votre rendez-vous chez <strong>{proDisplayName}</strong> est déjà confirmé.
            </p>
            <div style={S.infoBox}>
              <p style={S.infoLine}>{formatDateFr(rdv.date)} à {rdv.heure}</p>
              <p style={S.infoLineSub}>{prestationLabel}</p>
            </div>
          </div>
        )}

        {/* Déjà annulé */}
        {state === 'already_cancelled' && rdv && (
          <div style={S.center}>
            <div style={{ ...S.iconCircle, background: '#FFEBEE' }}>
              <span style={{ fontSize: 36 }}>❌</span>
            </div>
            <h2 style={S.h2}>RDV annulé</h2>
            <p style={S.grayText}>
              Ce rendez-vous a été annulé.
            </p>
          </div>
        )}

        {/* Prêt → affichage RDV + boutons */}
        {state === 'ready' && rdv && (
          <>
            {/* Avatar + nom pro */}
            <div style={S.proSection}>
              {rdv.pro_photo ? (
                <img src={rdv.pro_photo} alt={proDisplayName} style={S.avatar} />
              ) : (
                <div style={S.avatarPlaceholder}>
                  <span style={{ fontSize: 24, fontWeight: 700, color: PINK }}>
                    {(rdv.pro_prenom[0] ?? '') + (rdv.pro_nom[0] ?? '')}
                  </span>
                </div>
              )}
              <h2 style={{ ...S.h2, marginBottom: 0 }}>{proDisplayName}</h2>
            </div>

            {/* Infos RDV */}
            <div style={S.card}>
              <p style={S.cardLabel}>Votre rendez-vous</p>
              <div style={S.cardRow}>
                <span style={S.cardIcon}>📅</span>
                <span style={S.cardValue}>{formatDateFr(rdv.date)}</span>
              </div>
              <div style={S.cardRow}>
                <span style={S.cardIcon}>🕐</span>
                <span style={S.cardValue}>{rdv.heure}</span>
              </div>
              <div style={S.cardRow}>
                <span style={S.cardIcon}>✨</span>
                <span style={S.cardValue}>{prestationLabel}</span>
              </div>
              {rdv.prix != null && rdv.prix > 0 && (
                <div style={S.cardRow}>
                  <span style={S.cardIcon}>💰</span>
                  <span style={S.cardValue}>{rdv.prix} €</span>
                </div>
              )}
            </div>

            {/* Boutons */}
            <div style={S.actions}>
              <button
                className="glamia-btn-confirm"
                onClick={handleConfirmer}
                disabled={acting}
              >
                {acting ? 'Confirmation...' : 'Confirmer mon RDV'}
              </button>
              <button
                className="glamia-btn-cancel"
                onClick={handleAnnuler}
                disabled={acting}
              >
                {acting ? 'Annulation...' : 'Annuler mon RDV'}
              </button>
            </div>
          </>
        )}

        {/* Succès confirmation */}
        {state === 'confirmed' && rdv && (
          <div style={S.center}>
            <div style={{ ...S.iconCircle, background: '#E8F5E9' }}>
              <span style={{ fontSize: 44 }}>✅</span>
            </div>
            <h2 style={S.h2}>RDV confirmé !</h2>
            <p style={S.grayText}>
              Votre rendez-vous chez <strong>{proDisplayName}</strong> est confirmé.
            </p>
            <div style={S.infoBox}>
              <p style={S.infoLine}>{formatDateFr(rdv.date)} à {rdv.heure}</p>
              <p style={S.infoLineSub}>{prestationLabel}</p>
            </div>
            <p style={{ ...S.grayText, fontSize: 13, marginTop: 16 }}>
              Vous pouvez fermer cette page.
            </p>
          </div>
        )}

        {/* Succès annulation */}
        {state === 'cancelled' && rdv && (
          <div style={S.center}>
            <div style={{ ...S.iconCircle, background: '#FFEBEE' }}>
              <span style={{ fontSize: 44 }}>❌</span>
            </div>
            <h2 style={S.h2}>RDV annulé</h2>
            <p style={S.grayText}>
              Votre rendez-vous a bien été annulé.
            </p>
            <p style={{ ...S.grayText, fontSize: 13, marginTop: 16 }}>
              Vous pouvez fermer cette page.
            </p>
          </div>
        )}

        {/* Erreur */}
        {state === 'error' && (
          <div style={S.center}>
            <div style={S.iconCircle}>
              <span style={{ fontSize: 36 }}>⚠️</span>
            </div>
            <h2 style={S.h2}>Erreur</h2>
            <p style={S.grayText}>
              Une erreur est survenue. Veuillez réessayer ou contacter votre professionnelle.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f9fafb',
    display: 'flex',
    justifyContent: 'center',
    padding: '24px 16px',
    fontFamily: 'inherit',
  },
  container: {
    width: '100%',
    maxWidth: 480,
    margin: '0 auto',
  },
  logoWrap: {
    textAlign: 'center',
    marginBottom: 32,
  },
  logoText: {
    fontSize: 28,
    fontWeight: 800,
    color: PINK,
    letterSpacing: '-0.02em',
  },
  center: {
    textAlign: 'center',
    padding: '32px 0',
  },
  h2: {
    fontSize: 24,
    fontWeight: 700,
    color: '#1f2937',
    marginBottom: 8,
    marginTop: 0,
  },
  grayText: {
    fontSize: 15,
    color: '#6b7280',
    lineHeight: '1.6',
    margin: '0 0 8px',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: '50%',
    background: PINK_LIGHT,
    display: 'flex' as const,
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 20px',
  },
  spinner: {
    width: 32,
    height: 32,
    border: `3px solid #e5e7eb`,
    borderTopColor: PINK,
    borderRadius: '50%',
    margin: '0 auto 16px',
    animation: 'spin 0.8s linear infinite',
  },
  // Pro section
  proSection: {
    textAlign: 'center',
    marginBottom: 24,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: '50%',
    objectFit: 'cover' as const,
    border: `3px solid ${PINK}`,
    marginBottom: 12,
  },
  avatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: '50%',
    background: PINK_LIGHT,
    display: 'inline-flex' as const,
    alignItems: 'center',
    justifyContent: 'center',
    border: `2px solid ${PINK}`,
    marginBottom: 12,
  },
  // Card
  card: {
    background: '#fff',
    borderRadius: 16,
    padding: 20,
    border: '1.5px solid #e5e7eb',
    marginBottom: 24,
    boxSizing: 'border-box' as const,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: 16,
    marginTop: 0,
  },
  cardRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  cardIcon: {
    fontSize: 18,
    width: 24,
    textAlign: 'center' as const,
  },
  cardValue: {
    fontSize: 15,
    color: '#1f2937',
    fontWeight: 500,
  },
  // Info box (résultat)
  infoBox: {
    background: PINK_LIGHT,
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
    display: 'inline-block' as const,
  },
  infoLine: {
    fontSize: 15,
    fontWeight: 600,
    color: '#1f2937',
    margin: '0 0 4px',
    textTransform: 'capitalize' as const,
  },
  infoLineSub: {
    fontSize: 14,
    color: PINK,
    fontWeight: 500,
    margin: 0,
  },
  // Buttons
  actions: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },
  btn: {
    width: '100%',
    padding: 16,
    borderRadius: 16,
    border: 'none',
    background: PINK,
    color: '#fff',
    fontWeight: 700,
    fontSize: 16,
    cursor: 'pointer',
    transition: 'opacity 0.15s',
    fontFamily: 'inherit',
  },
  btnOutline: {
    width: '100%',
    padding: 16,
    borderRadius: 16,
    border: '1.5px solid #d1d5db',
    background: 'transparent',
    color: '#6b7280',
    fontWeight: 600,
    fontSize: 15,
    cursor: 'pointer',
    transition: 'opacity 0.15s',
    fontFamily: 'inherit',
  },
}
