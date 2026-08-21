'use client'

import { Suspense, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Calendar, Camera, Clock, Sparkles, CreditCard, ImagePlus, MapPin, CheckCircle, XCircle, AlertCircle, FileText } from 'lucide-react'
import { formatPrix } from '@/lib/devise'
import { isDayWorking, isDayBlocked, type CreneauBloque, type HorairesSpecifiques } from '@/lib/creneaux'
import { poserLangue, poserLangueSansPro, traduire } from '@/lib/i18n'
import { poserPays } from '@/lib/heures-dates'

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
  pro_devise: string | null
  pro_id: string
  horaires: Record<number, { actif?: boolean; active?: boolean; debut: string; fin: string }> | null
  horaires_specifiques: HorairesSpecifiques | null
  creneaux_bloques: CreneauBloque[]
  planning_variable: boolean
  duree: number
  instructions: string | null
  inspirations: string[]
}

type PageState = 'loading' | 'expired' | 'already_confirmed' | 'already_cancelled' | 'ready' | 'confirmed' | 'cancelled' | 'rescheduled' | 'error'

// Bloc instructions de la pro — affiché avant ET après confirmation
// (c'est surtout après avoir confirmé que la cliente doit les lire)
// Compression d'image côté navigateur : max 1280 px, JPEG qualité 0.8 → data URL
// (même helper que la page de réservation)
async function compresserImage(file: File): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error(traduire('resa.lectureImpossible')))
    reader.readAsDataURL(file)
  })
  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error('Image illisible'))
    i.src = dataUrl
  })
  const MAX = 1280
  const ratio = Math.min(1, MAX / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * ratio))
  const h = Math.max(1, Math.round(img.height * ratio))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponible')
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', 0.8)
}

// Encadré « Tes inspirations » : photos déjà transmises + ajout jusqu'à 3,
// tant que le RDV est à venir (upload authentifié par le token du lien)
function SectionInspirations({
  token,
  rdv,
  onAjout,
}: {
  token: string
  rdv: RdvInfo
  onAjout: (toutes: string[]) => void
}) {
  const [envoi, setEnvoi] = useState(false)
  const photos = rdv.inspirations ?? []
  const rdvFutur = new Date(`${rdv.date}T${rdv.heure}:00`) > new Date()
  if (!rdvFutur && photos.length === 0) return null

  const gererAjout = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fichiers = Array.from(e.target.files ?? [])
    e.target.value = ''
    const restant = 3 - photos.length
    if (fichiers.length === 0 || restant <= 0 || envoi) return
    const aTraiter = fichiers.slice(0, restant)
    if (fichiers.length > restant) {
      alert(traduire('confirmation.troisPhotosMax', { count: restant }))
    }
    setEnvoi(true)
    try {
      const dataUrls: string[] = []
      for (const f of aTraiter) dataUrls.push(await compresserImage(f))
      const res = await fetch('/api/inspirations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, photos: dataUrls }),
      })
      const json = await res.json()
      if (!res.ok || !json.inspirations) throw new Error(json.error ?? 'upload_failed')
      onAjout(json.inspirations)
    } catch (err) {
      console.error('[confirmation] inspirations:', err)
      alert(traduire('resa.photosNonEnvoyees'))
    } finally {
      setEnvoi(false)
    }
  }

  const tuile = (icone: React.ReactNode, texte: string, extraInput: React.InputHTMLAttributes<HTMLInputElement>) => (
    <label style={{
      width: 72, height: 72, borderRadius: 12, border: '1.5px dashed #d1d5db',
      background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 3, cursor: envoi ? 'default' : 'pointer',
      flexShrink: 0, opacity: envoi ? 0.5 : 1, boxSizing: 'border-box',
    }}>
      {icone}
      <span style={{ fontSize: 9.5, color: '#9ca3af', fontWeight: 600 }}>{envoi ? 'Envoi…' : texte}</span>
      <input type="file" accept="image/*" onChange={gererAjout} disabled={envoi} style={{ display: 'none' }} {...extraInput} />
    </label>
  )

  return (
    <div style={{
      background: 'linear-gradient(135deg, #FDF3F8 0%, #FFFFFF 70%)',
      border: `1.5px solid ${PINK}55`,
      borderRadius: 16, padding: '14px 14px 16px', marginTop: 16, textAlign: 'left',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <span style={{
          width: 30, height: 30, borderRadius: '50%', background: PINK, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Sparkles size={15} color="#fff" />
        </span>
        <span style={{ fontWeight: 700, fontSize: 15, color: '#1f2937' }}>{traduire('resa.tesInspirations')}</span>
      </div>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '6px 0 12px', lineHeight: 1.4 }}>
        {photos.length >= 3
          ? 'Tes 3 photos ont bien été transmises.'
          : `Montre ce que tu as en tête — ajoute jusqu'à ${3 - photos.length} photo${3 - photos.length > 1 ? 's' : ''} (optionnel).`}
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {photos.map((src, i) => (
          <img
            key={i}
            src={src}
            alt={`Inspiration ${i + 1}`}
            style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'cover', border: '1.5px solid #e5e7eb', display: 'block', flexShrink: 0 }}
          />
        ))}
        {rdvFutur && photos.length < 3 && (
          <>
            {tuile(<Camera size={18} color={PINK} />, 'Prendre', { capture: 'environment' })}
            {tuile(<ImagePlus size={18} color={PINK} />, 'Importer', { multiple: true })}
          </>
        )}
      </div>
    </div>
  )
}

function InstructionsBox({ instructions }: { instructions: string | null }) {
  if (!instructions) return null
  return (
    <div style={{ background: '#FFF8E1', borderRadius: 16, padding: 16, border: '1.5px solid #F5C27A', marginBottom: 24, textAlign: 'left', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <FileText size={18} color="#E67E22" />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#E67E22', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{traduire('confirmation.instructions')}</span>
      </div>
      <p style={{ fontSize: 14, color: '#1f2937', lineHeight: '1.6', margin: 0, whiteSpace: 'pre-line' }}>{instructions}</p>
    </div>
  )
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const PINK = '#C2779E'
const PINK_LIGHT = '#F9EEF4'
const GLAMIA_PINK = '#D4537E'

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
type SlotInfo = { heure: string; disponible: boolean }

function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate() }
function getFirstDayOfWeek(y: number, m: number) { return (new Date(y, m, 1).getDay() + 6) % 7 }
function buildDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
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
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p>{traduire('commun.chargement')}</p></div>}>
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
  /** Le refus du serveur, dit à la cliente sans la sortir de l'écran. */
  const [decRefus, setDecRefus] = useState<string | null>(null)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [calYear, setCalYear] = useState(new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(new Date().getMonth())

  // ── Chargement initial ──────────────────────
  useEffect(() => {
    poserLangueSansPro();
    if (!token) { setState('error'); return }

    const load = async () => {
      try {
        const res = await fetch(`/api/confirmation/${token}`)

        if (res.status === 410) { setState('expired'); return }
        if (res.status === 404) { setState('expired'); return }
        if (!res.ok) { setState('error'); return }

        const info: RdvInfo = await res.json()
        poserLangue((info as { pro_langue?: string }).pro_langue)
        poserPays((info as { pro_pays?: string }).pro_pays)
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
    setDecRefus(null)
    setLoadingSlots(true)
    try {
      const res = await fetch(`/api/confirmation/${token}?slots_date=${dateStr}`)
      if (!res.ok) { setDecSlots([]); return }
      const info = await res.json()
      // Le serveur a calculé la grille avec TOUTES les règles : horaires,
      // journées fermées, créneaux bloqués, planning variable, délai minimum.
      // La page ne recalcule plus rien — c'était sa copie appauvrie des règles
      // qui laissait proposer des créneaux en plein congé.
      setDecSlots(info.slots ?? [])
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
      if (!res.ok) {
        // Un créneau pris entre-temps, ou une journée fermée depuis que la
        // grille a été dessinée : on le lui DIT et on la laisse là, avec une
        // grille à jour. L'écran d'erreur générique la mettait dehors, sans
        // rien lui expliquer, avec son rendez-vous d'origine intact et aucun
        // moyen de comprendre pourquoi.
        let message = traduire('confirmation.creneauPris')
        try {
          const refus = await res.json()
          if (refus?.message) message = refus.message
        } catch { /* réponse illisible : on garde la phrase générale */ }
        setDecRefus(message)
        setDecHeure('')
        await handlePickDate(decDate)
        setActing(false)
        return
      }
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
import { traduire } from '@/lib/i18n';
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
            <p style={S.grayText}>{traduire('commun.chargement')}</p>
          </div>
        )}

        {/* Token expiré */}
        {state === 'expired' && (
          <div style={S.center}>
            <div style={S.iconCircle}>
              <span style={{ fontSize: 36 }}>🔗</span>
            </div>
            <h2 style={S.h2}>{traduire('confirmation.lienExpire')}</h2>
            <p style={S.grayText}>{traduire('confirmation.lienExpireDetail')}<br />{traduire('confirmation.demanderNouveauLien')}</p>
          </div>
        )}

        {/* Déjà confirmé */}
        {state === 'already_confirmed' && rdv && (
          <div style={S.center}>
            <div style={{ ...S.iconCircle, background: '#E8F5E9' }}>
              <CheckCircle size={36} color={GLAMIA_PINK} />
            </div>
            <h2 style={S.h2}>{traduire('confirmation.dejaConfirme')}</h2>
            <p style={S.grayText}>{traduire('confirmation.votreRdvChez')}<strong>{proDisplayName}</strong>{traduire('confirmation.estDejaConfirme')}</p>
            <div style={S.infoBox}>
              <p style={S.infoLine}>{formatDateFr(rdv.date)} à {rdv.heure}</p>
              <p style={S.infoLineSub}>{prestationLabel}</p>
              {/* Rouvrir ce lien la veille du RDV pour vérifier où aller est
                  l'usage le plus probable de cette page : l'adresse doit y être. */}
              {rdv.pro_adresse && (
                <p style={{ ...S.infoLineSub, marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><MapPin size={14} color={GLAMIA_PINK} />{rdv.pro_adresse}</p>
              )}
            </div>
            <InstructionsBox instructions={rdv.instructions} />
            <SectionInspirations
              token={token}
              rdv={rdv}
              onAjout={toutes => setRdv(prev => (prev ? { ...prev, inspirations: toutes } : prev))}
            />
          </div>
        )}

        {/* Déjà annulé */}
        {state === 'already_cancelled' && rdv && (
          <div style={S.center}>
            <div style={{ ...S.iconCircle, background: '#FFEBEE' }}>
              <XCircle size={36} color="#ef4444" />
            </div>
            <h2 style={S.h2}>{traduire('confirmation.rdvAnnule')}</h2>
            <p style={S.grayText}>{traduire('confirmation.rdvAnnuleDetail')}</p>
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
              <p style={S.cardLabel}>{traduire('confirmation.votreRdv')}</p>
              <div style={S.cardRow}>
                <span style={S.cardIcon}><Calendar size={18} color={GLAMIA_PINK} /></span>
                <span style={S.cardValue}>{formatDateFr(rdv.date)}</span>
              </div>
              <div style={S.cardRow}>
                <span style={S.cardIcon}><Clock size={18} color={GLAMIA_PINK} /></span>
                <span style={S.cardValue}>{rdv.heure}</span>
              </div>
              <div style={S.cardRow}>
                <span style={S.cardIcon}><Sparkles size={18} color={GLAMIA_PINK} /></span>
                <span style={S.cardValue}>{prestationLabel}</span>
              </div>
              {rdv.prix != null && rdv.prix > 0 && (
                <div style={S.cardRow}>
                  <span style={S.cardIcon}><CreditCard size={18} color={GLAMIA_PINK} /></span>
                  <span style={S.cardValue}>{formatPrix(rdv.prix, rdv.pro_devise)}</span>
                </div>
              )}
              {rdv.pro_adresse && (
                <div style={S.cardRow}>
                  <span style={S.cardIcon}><MapPin size={18} color={GLAMIA_PINK} /></span>
                  <span style={S.cardValue}>{rdv.pro_adresse}</span>
                </div>
              )}
            </div>

            {/* Instructions */}
            <InstructionsBox instructions={rdv.instructions} />

            {/* Inspirations : consultables et complétables jusqu'au RDV */}
            <SectionInspirations
              token={token}
              rdv={rdv}
              onAjout={toutes => setRdv(prev => (prev ? { ...prev, inspirations: toutes } : prev))}
            />

            {/* Boutons */}
            <div style={S.actions}>
              <button
                className="glamia-btn-confirm"
                onClick={handleConfirmer}
                disabled={acting}
              >
                {acting ? 'Confirmation...' : traduire('confirmation.confirmerMonRdv')}
              </button>
              <button
                className="glamia-btn-cancel"
                onClick={handleAnnuler}
                disabled={acting}
              >
                {acting ? 'Annulation...' : traduire('confirmation.annulerMonRdv')}
              </button>
              <button
                className="glamia-btn-cancel"
                onClick={() => setShowDecaler(!showDecaler)}
                disabled={acting}
                style={{ borderColor: PINK, color: PINK }}
              >
                <Calendar size={16} color={PINK} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />{traduire('confirmation.decaler')}</button>
            </div>

            {/* ── Interface de décalage ── */}
            {showDecaler && rdv.horaires && (
              <div style={{ marginTop: 24 }}>
                <p style={{ fontWeight: 700, color: '#1f2937', fontSize: 16, marginBottom: 16, marginTop: 0 }}>{traduire('confirmation.choisirNouvelleDate')}</p>

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
                    const isOff =
                      !isDayWorking(dateStr, (rdv.horaires ?? {}) as never, (rdv.horaires_specifiques ?? {}) as never, rdv.planning_variable)
                      || isDayBlocked(dateStr, rdv.creneaux_bloques ?? [])
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
                    {decRefus && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: '#FEF3F2', border: '1px solid #FECDCA', borderRadius: 12, padding: '10px 12px', marginBottom: 12 }}>
                        <AlertCircle size={16} color="#B42318" style={{ flexShrink: 0, marginTop: 1 }} />
                        <p style={{ margin: 0, color: '#B42318', fontSize: 13, lineHeight: 1.45 }}>{decRefus}</p>
                      </div>
                    )}
                    {loadingSlots ? (
                      <p style={{ color: PINK, fontSize: 14 }}>{traduire('resa.chargementCreneaux')}</p>
                    ) : decSlots.filter(s => s.disponible).length === 0 ? (
                      <p style={{ color: '#6b7280', fontSize: 14 }}>{traduire('confirmation.aucunCreneau')}</p>
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
                    {acting ? traduire('resa.decalageEnCours') : `Décaler au ${formatDateFr(decDate)} à ${decHeure}`}
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
              <CheckCircle size={44} color={GLAMIA_PINK} />
            </div>
            <h2 style={S.h2}>{traduire('confirmation.confirme')}</h2>
            <p style={S.grayText}>{traduire('confirmation.votreRdvChez')}<strong>{proDisplayName}</strong>{traduire('confirmation.estConfirme')}</p>
            <div style={S.infoBox}>
              <p style={S.infoLine}>{formatDateFr(rdv.date)} à {rdv.heure}</p>
              <p style={S.infoLineSub}>{prestationLabel}</p>
              {rdv.prix != null && rdv.prix > 0 && (
                <p style={{ ...S.infoLineSub, marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><CreditCard size={14} color={GLAMIA_PINK} />{formatPrix(rdv.prix, rdv.pro_devise)}</p>
              )}
              {rdv.pro_adresse && (
                <p style={{ ...S.infoLineSub, marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><MapPin size={14} color={GLAMIA_PINK} />{rdv.pro_adresse}</p>
              )}
            </div>
            <div style={{ marginTop: 16, width: '100%' }}>
              <InstructionsBox instructions={rdv.instructions} />
            </div>
            <p style={{ ...S.grayText, fontSize: 13 }}>{traduire('confirmation.fermerPage')}</p>
          </div>
        )}

        {/* Succès annulation */}
        {state === 'cancelled' && rdv && (
          <div style={S.center}>
            <div style={{ ...S.iconCircle, background: '#FFEBEE' }}>
              <XCircle size={44} color="#ef4444" />
            </div>
            <h2 style={S.h2}>{traduire('confirmation.rdvAnnule')}</h2>
            <p style={S.grayText}>{traduire('confirmation.bienAnnule')}</p>
            <p style={{ ...S.grayText, fontSize: 13, marginTop: 16 }}>{traduire('confirmation.fermerPage')}</p>
          </div>
        )}

        {/* Succès décalage */}
        {state === 'rescheduled' && rdv && (
          <div style={S.center}>
            <div style={{ ...S.iconCircle, background: '#E8F5E9' }}>
              <Calendar size={44} color={GLAMIA_PINK} />
            </div>
            <h2 style={S.h2}>{traduire('confirmation.decale')}</h2>
            <p style={S.grayText}>{traduire('confirmation.bienDecale')}</p>
            <div style={S.infoBox}>
              <p style={S.infoLine}>{formatDateFr(decDate)} à {decHeure}</p>
              <p style={S.infoLineSub}>{prestationLabel}</p>
              {rdv.pro_adresse && (
                <p style={{ ...S.infoLineSub, marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><MapPin size={14} color={GLAMIA_PINK} />{rdv.pro_adresse}</p>
              )}
            </div>
            <p style={{ ...S.grayText, fontSize: 13, marginTop: 16 }}>{traduire('confirmation.nouvelEmail')}</p>
          </div>
        )}

        {/* Erreur */}
        {state === 'error' && (
          <div style={S.center}>
            <div style={S.iconCircle}>
              <AlertCircle size={36} color="#854F0B" />
            </div>
            <h2 style={S.h2}>{traduire('commun.erreur')}</h2>
            <p style={S.grayText}>{traduire('confirmation.erreurDetail')}</p>
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
