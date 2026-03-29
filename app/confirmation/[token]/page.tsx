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
  pro_adresse: string | null
  pro_id: string
  horaires: Record<number, { actif?: boolean; active?: boolean; debut: string; fin: string }> | null
  duree: number
}

type PageState = 'loading' | 'expired' | 'already_confirmed' | 'already_cancelled' | 'ready' | 'confirmed' | 'cancelled' | 'rescheduled' | 'error'

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

// ── Helpers décalage ────────────────────────
type HorairesHebdo = Record<number, { actif?: boolean; active?: boolean; debut: string; fin: string }>
type SlotInfo = { heure: string; disponible: boolean }

function timeToMin(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m }
function minToTime(m: number) { return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` }
function isDayWorking(dateStr: string, horaires: HorairesHebdo) {
  const h = horaires[new Date(dateStr + 'T00:00:00').getDay()]
  return h?.actif === true || h?.active === true
}
function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate() }
function getFirstDayOfWeek(y: number, m: number) { return (new Date(y, m, 1).getDay() + 6) % 7 }
function buildDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
function generateSlots(
  date: string, duree: number, horaires: HorairesHebdo,
  rdvExistants: { heure: string; duree: number }[],
): SlotInfo[] {
  const h = horaires[new Date(date + 'T00:00:00').getDay()]
  if (!h?.actif && !h?.active) return []
  const debut = timeToMin(h.debut), fin = timeToMin(h.fin)
  const taken = rdvExistants.map(r => ({ start: timeToMin(r.heure), end: timeToMin(r.heure) + r.duree }))
  const now = new Date()
  const todayStr = buildDateStr(now.getFullYear(), now.getMonth(), now.getDate())
  const limiteMin = date === todayStr ? (now.getHours() * 60 + now.getMinutes() + 30) : 0
  const slots: SlotInfo[] = []
  for (let t = debut; t + duree <= fin; t += 30) {
    if (date === todayStr && t < limiteMin) continue
    const isTaken = taken.some(r => t < r.end && (t + duree) > r.start)
    slots.push({ heure: minToTime(t), disponible: !isTaken })
  }
  return slots
}

const JOURS_COURT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const MOIS_LONG = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

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

  // ── Décalage ──────────────────────────────
  const [showDecaler, setShowDecaler] = useState(false)
  const [decDate, setDecDate] = useState('')
  const [decHeure, setDecHeure] = useState('')
  const [decSlots, setDecSlots] = useState<SlotInfo[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [calYear, setCalYear] = useState(new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(new Date().getMonth())

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
      console.log('[confirmation] POST vers:', `/api/confirmation/${token}`, 'action: confirmer')
      const res = await fetch(`/api/confirmation/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirmer' }),
      })
      console.log('[confirmation] Réponse status:', res.status)

      if (!res.ok) { setState('error'); setActing(false); return }

      const data = await res.json()
      console.log('[confirmation] Succès:', data)
      setState('confirmed')
    } catch (e) {
      console.error('[confirmation] Erreur fetch:', e)
      setState('error')
    }
    setActing(false)
  }

  const handleAnnuler = async () => {
    if (!rdv || acting) return
    setActing(true)

    try {
      console.log('[confirmation] POST vers:', `/api/confirmation/${token}`, 'action: annuler')
      const res = await fetch(`/api/confirmation/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'annuler' }),
      })
      console.log('[confirmation] Réponse status:', res.status)

      if (!res.ok) { setState('error'); setActing(false); return }

      const data = await res.json()
      console.log('[confirmation] Succès:', data)
      setState('cancelled')
    } catch (e) {
      console.error('[confirmation] Erreur fetch:', e)
      setState('error')
    }
    setActing(false)
  }

  // ── Décaler : charger créneaux ────────────────
  const handlePickDate = async (dateStr: string) => {
    if (!rdv) return
    setDecDate(dateStr)
    setDecHeure('')
    setLoadingSlots(true)
    try {
      const res = await fetch(`/api/confirmation/${token}?slots_date=${dateStr}`)
      if (!res.ok) { setDecSlots([]); return }
      const info = await res.json()
      const horaires = rdv.horaires ?? {}
      const slots = generateSlots(dateStr, rdv.duree, horaires as HorairesHebdo, info.rdvs_jour ?? [])
      setDecSlots(slots)
    } catch {
      setDecSlots([])
    } finally {
      setLoadingSlots(false)
    }
  }

  const handleDecaler = async () => {
    if (!rdv || !decDate || !decHeure || acting) return
    setActing(true)
    try {
      const newDateISO = `${decDate}T${decHeure}:00.000Z`
      const res = await fetch(`/api/confirmation/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'decaler', new_date: newDateISO }),
      })
      if (!res.ok) { setState('error'); setActing(false); return }
      setState('rescheduled')
    } catch {
      setState('error')
    }
    setActing(false)
  }

  const today0 = new Date()
  const isAtCurrentMonth = calYear === today0.getFullYear() && calMonth === today0.getMonth()

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
              <button
                className="glamia-btn-cancel"
                onClick={() => setShowDecaler(!showDecaler)}
                disabled={acting}
                style={{ borderColor: PINK, color: PINK }}
              >
                📅 Décaler mon RDV
              </button>
            </div>

            {/* ── Interface de décalage ── */}
            {showDecaler && rdv.horaires && (
              <div style={{ marginTop: 24 }}>
                <p style={{ fontWeight: 700, color: '#1f2937', fontSize: 16, marginBottom: 16, marginTop: 0 }}>Choisissez une nouvelle date</p>

                {/* Navigation mois */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <button
                    onClick={() => { if (!isAtCurrentMonth) { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) } else setCalMonth(m => m - 1) } }}
                    disabled={isAtCurrentMonth}
                    style={{ width: 32, height: 32, borderRadius: 16, border: '1px solid #e5e7eb', background: '#fff', cursor: isAtCurrentMonth ? 'default' : 'pointer', fontSize: 18, color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isAtCurrentMonth ? 0.3 : 1 }}
                  >‹</button>
                  <span style={{ fontWeight: 600, color: '#1f2937', fontSize: 15 }}>
                    {MOIS_LONG[calMonth]} {calYear}
                  </span>
                  <button
                    onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) } else setCalMonth(m => m + 1) }}
                    style={{ width: 32, height: 32, borderRadius: 16, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 18, color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >›</button>
                </div>

                {/* Jours de la semaine */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
                  {JOURS_COURT.map(j => (
                    <div key={j} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#9ca3af', padding: '4px 0' }}>{j}</div>
                  ))}
                </div>

                {/* Grille du mois */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                  {Array.from({ length: getFirstDayOfWeek(calYear, calMonth) }).map((_, i) => <div key={`e-${i}`} />)}
                  {Array.from({ length: getDaysInMonth(calYear, calMonth) }).map((_, i) => {
                    const day = i + 1
                    const dateStr = buildDateStr(calYear, calMonth, day)
                    const dayDate = new Date(calYear, calMonth, day)
                    const today0Date = new Date(today0.getFullYear(), today0.getMonth(), today0.getDate())
                    const isPast = dayDate < today0Date
                    const isOff = !isDayWorking(dateStr, rdv.horaires as HorairesHebdo)
                    const isDisabled = isPast || isOff
                    const isSelected = decDate === dateStr
                    return (
                      <button
                        key={day}
                        disabled={isDisabled}
                        onClick={() => { if (!isDisabled) handlePickDate(dateStr) }}
                        style={{
                          aspectRatio: '1', borderRadius: '50%', border: 'none',
                          background: isSelected ? PINK : isPast ? 'transparent' : isOff ? '#E3F2FD' : 'transparent',
                          color: isSelected ? '#fff' : isPast ? '#d1d5db' : isOff ? '#90CAF9' : '#374151',
                          fontWeight: 500, fontSize: 13, cursor: isDisabled ? 'default' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >{day}</button>
                    )
                  })}
                </div>

                {/* Créneaux */}
                {decDate && (
                  <div style={{ marginTop: 16 }}>
                    <p style={{ fontWeight: 600, color: '#1f2937', fontSize: 14, marginBottom: 10, marginTop: 0, textTransform: 'capitalize' }}>
                      {formatDateFr(decDate)}
                    </p>
                    {loadingSlots ? (
                      <p style={{ color: PINK, fontSize: 14 }}>Chargement des créneaux...</p>
                    ) : decSlots.filter(s => s.disponible).length === 0 ? (
                      <p style={{ color: '#6b7280', fontSize: 14 }}>Aucun créneau disponible ce jour.</p>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                        {decSlots.filter(s => s.disponible).map(s => (
                          <button
                            key={s.heure}
                            onClick={() => setDecHeure(s.heure)}
                            style={{
                              padding: '10px 0', borderRadius: 10,
                              border: `1.5px solid ${decHeure === s.heure ? PINK : '#e5e7eb'}`,
                              background: decHeure === s.heure ? PINK : '#fff',
                              color: decHeure === s.heure ? '#fff' : '#374151',
                              fontWeight: 600, fontSize: 14, cursor: 'pointer',
                            }}
                          >{s.heure}</button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Bouton confirmer le décalage */}
                {decDate && decHeure && (
                  <button
                    className="glamia-btn-confirm"
                    onClick={handleDecaler}
                    disabled={acting}
                    style={{ marginTop: 16 }}
                  >
                    {acting ? 'Décalage en cours...' : `Décaler au ${formatDateFr(decDate)} à ${decHeure}`}
                  </button>
                )}
              </div>
            )}
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
              {rdv.prix != null && rdv.prix > 0 && (
                <p style={{ ...S.infoLineSub, marginTop: 8 }}>💰 {rdv.prix} €</p>
              )}
              {rdv.pro_adresse && (
                <p style={{ ...S.infoLineSub, marginTop: 8 }}>📍 {rdv.pro_adresse}</p>
              )}
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

        {/* Succès décalage */}
        {state === 'rescheduled' && rdv && (
          <div style={S.center}>
            <div style={{ ...S.iconCircle, background: '#E8F5E9' }}>
              <span style={{ fontSize: 44 }}>📅</span>
            </div>
            <h2 style={S.h2}>RDV décalé !</h2>
            <p style={S.grayText}>
              Votre rendez-vous a bien été décalé.
            </p>
            <div style={S.infoBox}>
              <p style={S.infoLine}>{formatDateFr(decDate)} à {decHeure}</p>
              <p style={S.infoLineSub}>{prestationLabel}</p>
            </div>
            <p style={{ ...S.grayText, fontSize: 13, marginTop: 16 }}>
              Vous recevrez un nouvel email de confirmation.
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
