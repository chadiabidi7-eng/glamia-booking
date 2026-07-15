'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import SpecialiteIcon from '@/components/SpecialiteIcon'
import { User, Calendar, Clock, CreditCard, MapPin, CheckCircle, AlertCircle, Gift, Sparkles, Search, Camera, ChevronDown, ImagePlus, X } from 'lucide-react'
import { loadStripe, type Stripe as StripeJs } from '@stripe/stripe-js'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type HorairesJour = { actif?: boolean; active?: boolean; debut: string; fin: string; pause?: { debut: string; fin: string } }
type HorairesHebdo = Record<number, HorairesJour>
type Technique = { id: string; nom: string; active: boolean; prix: number; duree: number; description?: string; photos?: string[]; prix_type?: 'fixe' | 'a_partir_de' }
type CataloguePrestations = Record<string, Technique[]>

// Technique sélectionnée avec catégorie embarquée
type TechSelec = { categorie: string; nom: string; prix: number; duree: number; prix_type?: 'fixe' | 'a_partir_de' }

type CreneauBloque = {
  id: string
  date: string            // YYYY-MM-DD (ou date début pour période)
  date_fin?: string       // YYYY-MM-DD (date fin pour période multi-jours)
  touteLaJournee: boolean
  debut?: string          // "HH:mm" (créneau horaire uniquement)
  fin?: string            // "HH:mm" (créneau horaire uniquement)
  motif?: string
}

type PlageHoraire = { debut: string; fin: string }
type JourSpecifique = { actif: boolean; plages: PlageHoraire[] }
type HorairesSpecifiques = Record<string, JourSpecifique>

type Offre = {
  id: string
  pro_id: string
  type: 'prix_fixe' | 'pack'
  nom: string
  prestations_ids: string[]
  prix_promo: number
  cible: 'toutes' | 'nouvelles' | 'existantes'
  date_debut?: string | null
  date_fin?: string | null
  utilisations_max?: number | null
  utilisations_actuelles: number
  active: boolean
  archived_at?: string | null
  created_at: string
}

type ProInfo = {
  id: string
  prenom: string
  nom: string
  pseudo?: string
  photo_url?: string
  horaires: HorairesHebdo
  creneaux_bloques: CreneauBloque[]
  horaires_specifiques: HorairesSpecifiques
  planning_variable: boolean
  instagram?: string
  tiktok?: string
  snapchat?: string
  message_accueil?: string
  adresse?: string
  is_pro?: boolean
}

type RdvAVenir = {
  id: string
  date: string
  specialite: string
  technique: string
  duree: number
  prix: number | null
  statut: string
  fidelite_appliquee: { type: string; valeur: number } | null
  reduction_appliquee: { type: string; valeur: number; limitee: boolean } | null
  techniques: { nom: string; prix: number; duree: number; categorie?: string }[] | null
  offre_id: string | null
  inspirations: string[] | null
}

type Slot = { heure: string; disponible: boolean }

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const PINK = '#C2779E'
const PINK_LIGHT = '#F9EEF4'

// ─── Glamia Pay (acomptes / empreintes à la résa) ────────────────────────────
type PropayInfo = {
  actif: boolean
  mode?: 'empreinte' | 'acompte' | 'total'
  acompte?: number        // centimes
  frais?: number          // centimes (frais de réservation, mode acompte)
  total_cliente?: number  // centimes
  client_secret?: string
  stripe_account?: string
  intent_id?: string
}

type PropayHandle = { confirmer: () => Promise<{ ok: boolean; intentId?: string; erreur?: string }> }

const STRIPE_PK = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''
// Une promesse Stripe par compte connecté (le Payment Element vit sur le
// compte de la PRO, pas sur la plateforme)
const stripePromises: Record<string, Promise<StripeJs | null>> = {}
function getStripePromise(compte: string) {
  if (!stripePromises[compte]) stripePromises[compte] = loadStripe(STRIPE_PK, { stripeAccount: compte })
  return stripePromises[compte]
}

const fmtCentimes = (c: number) => `${(c / 100).toFixed(2).replace('.', ',').replace(',00', '')} €`

const DEFAULT_HORAIRES: HorairesHebdo = {
  0: { actif: false, debut: '09:00', fin: '18:00' },
  1: { actif: false, debut: '09:00', fin: '18:00' },
  2: { actif: false, debut: '09:00', fin: '18:00' },
  3: { actif: false, debut: '09:00', fin: '18:00' },
  4: { actif: false, debut: '09:00', fin: '18:00' },
  5: { actif: false, debut: '09:00', fin: '18:00' },
  6: { actif: false, debut: '09:00', fin: '18:00' },
}

const GLAMIA_PINK = '#D4537E'

const MOIS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

const JOURS_COURT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

// 5 étapes : Techniques fusionnées en une seule étape accordéon
const STEP_LABELS = ['Identification', 'Techniques', 'Date', 'Heure', 'Confirmation']

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
// Compression d'image côté navigateur : max 1280 px, JPEG qualité 0.8 → data URL
async function compresserImage(file: File): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Lecture du fichier impossible'))
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

function normalizeStr(str: string) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function normalizePhone(tel: string): string {
  let n = tel.replace(/[\s\-\.\(\)]/g, '')
  if (n.startsWith('+33')) n = '0' + n.slice(3)
  if (n.startsWith('0033')) n = '0' + n.slice(4)
  return n
}

function timeToMin(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function minToTime(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function formatDuree(min: number) {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

function formatDateLong(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function formatRdvDate(isoStr: string) {
  const d = new Date(isoStr)
  const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  return formatDateLong(dateStr)
}

function formatRdvHeure(isoStr: string) {
  const d = new Date(isoStr)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

async function envoyerPushNotif(proId: string, title: string, body: string) {
  try {
    const res = await fetch('/api/push-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proId, title, body }),
    })
    const data = await res.json()
    console.log('[envoyerPushNotif] Résultat:', data)
  } catch (e) {
    console.error('[envoyerPushNotif] Erreur:', e)
  }
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfWeek(year: number, month: number) {
  return (new Date(year, month, 1).getDay() + 6) % 7
}

function buildDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function isDayWorking(dateStr: string, horaires: HorairesHebdo, horairesSpec?: HorairesSpecifiques, planningVar?: boolean) {
  if (planningVar) {
    const spec = horairesSpec?.[dateStr]
    // En mode variable : dispo uniquement si des plages existent
    return !!(spec?.plages && spec.plages.length > 0)
  }
  const jour = new Date(dateStr + 'T00:00:00').getDay()
  const h = horaires[jour]
  return h?.actif === true || h?.active === true
}

function isDateInPeriod(dateStr: string, b: CreneauBloque): boolean {
  if (b.date_fin) return dateStr >= b.date && dateStr <= b.date_fin
  return dateStr === b.date
}

function isDayBlocked(dateStr: string, bloques: CreneauBloque[]) {
  return bloques.some(b => b.touteLaJournee && isDateInPeriod(dateStr, b))
}

function generateSlots(
  date: string,
  duree: number,
  horaires: HorairesHebdo,
  rdvExistants: { heure: string; duree: number }[],
  bloques: CreneauBloque[] = [],
  horairesSpec?: HorairesSpecifiques,
  planningVar?: boolean,
): Slot[] {
  if (bloques.some(b => b.touteLaJournee && isDateInPeriod(date, b))) return []

  let plages: { start: number; end: number }[]

  if (planningVar) {
    const spec = horairesSpec?.[date]
    if (!spec?.plages || spec.plages.length === 0) return []
    plages = spec.plages.map(p => ({ start: timeToMin(p.debut), end: timeToMin(p.fin) }))
  } else {
    const jour = new Date(date + 'T00:00:00').getDay()
    const h = horaires[jour]
    if (!h?.actif && !h?.active) return []
    if (h.pause) {
      plages = [
        { start: timeToMin(h.debut), end: timeToMin(h.pause.debut) },
        { start: timeToMin(h.pause.fin), end: timeToMin(h.fin) },
      ]
    } else {
      plages = [{ start: timeToMin(h.debut), end: timeToMin(h.fin) }]
    }
  }

  if (plages.length === 0) return []

  const INTERVAL = 30

  const taken = rdvExistants.map(r => ({
    start: timeToMin(r.heure),
    end:   timeToMin(r.heure) + r.duree,
  }))

  const blockedRanges = bloques
    .filter(b => b.date === date && !b.touteLaJournee && b.debut && b.fin)
    .map(b => ({ start: timeToMin(b.debut!), end: timeToMin(b.fin!) }))

  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const limiteMin = date === todayStr ? now.getHours() * 60 + now.getMinutes() + 60 : 0

  const slots: Slot[] = []
  for (const plage of plages) {
    for (let t = plage.start; t + duree <= plage.end; t += INTERVAL) {
      if (limiteMin > 0 && t < limiteMin) continue
      const end = t + duree
      const isTaken = taken.some(r => t < r.end && end > r.start)
      const isBlocked = blockedRanges.some(r => t < r.end && end > r.start)
      slots.push({ heure: minToTime(t), disponible: !isTaken && !isBlocked })
    }
  }
  return slots
}

// ─────────────────────────────────────────────
// Social icons (inline SVG)
// ─────────────────────────────────────────────
function IconInstagram({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#E1306C" aria-label="Instagram">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
    </svg>
  )
}

function IconTikTok({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#333333" aria-label="TikTok">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  )
}

function IconSnapchat({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#E8C100" aria-label="Snapchat">
      <path d="M5.332 14.1c-.05 0-.12-.01-.21-.03-1.18-.3-1.95-.55-2.29-.76-.16-.1-.27-.28-.24-.48.02-.16.14-.3.3-.35.83-.26 1.43-.74 1.76-1.44.06-.13.06-.29-.01-.42-.22-.4-.34-.83-.34-1.29 0-.15.09-.28.23-.34.13-.05.27-.03.38.06.24.19.5.29.76.29.14 0 .27-.03.39-.08 0-.42-.02-.85-.04-1.27-.06-1.22-.05-2.5.42-3.64C7.54 1.82 9.94.5 12 .5s4.46 1.32 5.77 4.35c.47 1.14.48 2.42.42 3.64-.02.42-.04.85-.04 1.27.12.05.25.08.39.08.26 0 .52-.1.76-.29.11-.09.25-.11.38-.06.14.06.23.19.23.34 0 .46-.12.89-.34 1.29-.07.13-.07.29-.01.42.33.7.93 1.18 1.76 1.44.16.05.28.19.3.35.03.2-.08.38-.24.48-.34.21-1.11.46-2.29.76-.09.02-.16.03-.21.03-.06.14-.09.44.03.83.06.19.01.4-.13.54-.2.19-.57.35-1.38.35-.41 0-.91-.07-1.51-.25-.48-.14-.98-.22-1.5-.22-.52 0-1.02.08-1.5.22-.6.18-1.1.25-1.51.25-.81 0-1.18-.16-1.38-.35-.14-.14-.19-.35-.13-.54.12-.39.09-.69.03-.83z" />
    </svg>
  )
}

function SocialLink({ reseau, pseudo, size = 18 }: { reseau: 'instagram' | 'tiktok' | 'snapchat'; pseudo: string; size?: number }) {
  const config = {
    instagram: { icon: <IconInstagram size={size} />, url: `https://instagram.com/${pseudo}`,    label: `Instagram : @${pseudo}` },
    tiktok:    { icon: <IconTikTok    size={size} />, url: `https://tiktok.com/@${pseudo}`,      label: `TikTok : @${pseudo}` },
    snapchat:  { icon: <IconSnapchat  size={size} />, url: `https://snapchat.com/add/${pseudo}`, label: `Snapchat : ${pseudo}` },
  }[reseau]

  const boxSize = size + 12
  const radius  = size >= 28 ? 14 : 8

  return (
    <a
      href={config.url}
      target="_blank"
      rel="noopener noreferrer"
      title={config.label}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: boxSize, height: boxSize, borderRadius: radius,
        background: '#f3f4f6', textDecoration: 'none', flexShrink: 0,
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = '#e5e7eb')}
      onMouseLeave={e => (e.currentTarget.style.background = '#f3f4f6')}
    >
      {config.icon}
    </a>
  )
}

// ─────────────────────────────────────────────
// Offres Section
// ─────────────────────────────────────────────

function getTechInfo(pid: string, catalogue: CataloguePrestations): { nom: string; categorie: string; duree: number; prix: number } | null {
  for (const [cat, techs] of Object.entries(catalogue)) {
    const t = techs.find(x => x.id === pid)
    if (t) return { nom: t.nom, categorie: cat, duree: t.duree, prix: t.prix }
  }
  return null
}

function OffresSection({
  offres, offreAppliquee, catalogue, techniquesSelectionnees, onApply, onRemove,
}: {
  offres: Offre[]
  offreAppliquee: Offre | null
  catalogue: CataloguePrestations
  techniquesSelectionnees: TechSelec[]
  onApply: (o: Offre) => void
  onRemove: (o: Offre) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? offres : offres.slice(0, 3)

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ background: PINK_LIGHT, borderRadius: 16, padding: 16, border: `1.5px solid ${PINK}` }}>
        <p style={{ margin: '0 0 10px', fontWeight: 700, fontSize: 15, color: PINK, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={16} color={PINK} /> Offres en cours
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visible.map(o => {
            const isApplied = offreAppliquee?.id === o.id
            const techInfos = o.prestations_ids.map(pid => getTechInfo(pid, catalogue)).filter(Boolean) as { nom: string; categorie: string; duree: number; prix: number }[]
            const prixOrig = techInfos.reduce((s, t) => s + t.prix, 0)
            const dureeTotal = techInfos.reduce((s, t) => s + t.duree, 0)

            return (
              <button
                key={o.id}
                onClick={() => isApplied ? onRemove(o) : onApply(o)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                  border: isApplied ? `2px solid ${PINK}` : '1.5px solid #e5e7eb',
                  background: isApplied ? PINK_LIGHT : '#fff',
                }}
              >
                <div style={{
                  width: 20, height: 20, borderRadius: 5, flexShrink: 0, marginTop: 2,
                  border: `2px solid ${isApplied ? PINK : '#d1d5db'}`,
                  background: isApplied ? PINK : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {isApplied && <CheckCircle size={14} color="#fff" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{
                      background: o.type === 'prix_fixe' ? PINK : '#7B1FA2',
                      color: '#fff', borderRadius: 4, fontSize: 9, fontWeight: 700,
                      padding: '1px 5px', flexShrink: 0,
                    }}>
                      {o.type === 'prix_fixe' ? 'PROMO' : 'PACK'}
                    </span>
                    <span style={{ fontWeight: 600, fontSize: 14, color: '#1f2937' }}>{o.nom}</span>
                  </div>
                  {/* Prestations — une par ligne avec icône spécialité */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {techInfos.map((t, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <SpecialiteIcon specialite={t.categorie} size={18} />
                        <span style={{ fontSize: 12, color: '#6b7280' }}>{t.nom}</span>
                      </div>
                    ))}
                  </div>
                  {/* Durée totale */}
                  {dureeTotal > 0 && (
                    <p style={{ margin: '4px 0 0', fontSize: 11, color: '#9ca3af' }}>
                      {dureeTotal} min au total
                    </p>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {prixOrig > 0 && prixOrig !== o.prix_promo && (
                    <div style={{ fontSize: 12, color: '#9ca3af', textDecoration: 'line-through' }}>{prixOrig} €</div>
                  )}
                  <div style={{ fontWeight: 700, fontSize: 15, color: PINK }}>{o.prix_promo} €</div>
                </div>
              </button>
            )
          })}
        </div>
        {offres.length > 3 && !showAll && (
          <button
            onClick={() => setShowAll(true)}
            style={{
              width: '100%', marginTop: 8, padding: '8px 0',
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, color: PINK,
            }}
          >
            Voir les {offres.length - 3} autres offres
          </button>
        )}
        {showAll && offres.length > 3 && (
          <button
            onClick={() => setShowAll(false)}
            style={{
              width: '100%', marginTop: 8, padding: '8px 0',
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, color: PINK,
            }}
          >
            Voir moins
          </button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────
export default function ReservationPage() {
  const params  = useParams()
  const slug    = params.slug as string
  const todayJs = new Date()

  // ── Pro & catalogue ──────────────────────────
  const [pro,        setPro]        = useState<ProInfo | null>(null)
  const [catalogue,  setCatalogue]  = useState<CataloguePrestations>({})
  // Ordre des spécialités choisi par la pro dans l'app (tri via « Trier »)
  const [ordreCategories, setOrdreCategories] = useState<string[]>([])
  const [pageState,  setPageState]  = useState<'loading' | 'ready' | 'notfound' | 'confirmed' | 'blocked'>('loading')
  const [submitting, setSubmitting] = useState(false)

  // ── Glamia Pay : empreinte/acompte à la confirmation ──
  const [propay, setPropay] = useState<PropayInfo | null>(null)
  const [propayConsent, setPropayConsent] = useState(false)
  const propayRef = useRef<PropayHandle>(null)

  // ── Navigation ───────────────────────────────
  const [step, setStep] = useState(1)

  // Changement d'étape → remonter en haut (l'étape 5 gère son propre scroll vers le récap)
  useEffect(() => {
    if (step !== 5) window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [step])

  // ── Step 1 : Identification ──────────────────
  const [telephone,     setTelephone]     = useState('')
  const [clientePrenom, setClientePrenom] = useState('')
  const [clienteNom,    setClienteNom]    = useState('')
  const [clienteEmail,  setClienteEmail]  = useState('')
  const [clienteId,     setClienteId]     = useState<string | null>(null)
  const [phoneStatus,   setPhoneStatus]   = useState<'idle' | 'checking' | 'known' | 'unknown'>('idle')
  const [rdvsAVenir,        setRdvsAVenir]        = useState<RdvAVenir[]>([])
  const [loadingRdvs,       setLoadingRdvs]       = useState(false)

  // ── Inspirations sur un RDV existant (bouton « Mes inspirations ») ──
  const [inspiRdvId,        setInspiRdvId]        = useState<string | null>(null)
  const [inspiNouvelles,    setInspiNouvelles]    = useState<string[]>([])   // data URLs en attente d'envoi
  const [inspiCompression,  setInspiCompression]  = useState(false)
  const [inspiEnvoi,        setInspiEnvoi]        = useState(false)
  const [inspiDone,         setInspiDone]         = useState<string | null>(null)
  const [annulationEnCours, setAnnulationEnCours] = useState<string | null>(null)

  // ── Reprogrammer un RDV ─────────────────────
  const [reprogRdvId, setReprogRdvId]       = useState<string | null>(null)
  const [reprogDate, setReprogDate]         = useState('')
  const [reprogHeure, setReprogHeure]       = useState('')
  const [reprogSlots, setReprogSlots]       = useState<Slot[]>([])

  // ── Modification des prestations d'un RDV à venir ──
  const [modifRdvId, setModifRdvId]           = useState<string | null>(null)
  const [modifSelection, setModifSelection]   = useState<TechSelec[]>([])
  const [modifSections, setModifSections]     = useState<Set<string>>(new Set())
  const [modifSaving, setModifSaving]         = useState(false)
  const [modifDone, setModifDone]             = useState<string | null>(null)
  // Prestations en attente quand la nouvelle durée impose un autre créneau
  const [modifPendingTechs, setModifPendingTechs] = useState<TechSelec[] | null>(null)
  const [reprogLoadingSlots, setReprogLoadingSlots] = useState(false)
  const [reprogCalYear, setReprogCalYear]   = useState(todayJs.getFullYear())
  const [reprogCalMonth, setReprogCalMonth] = useState(todayJs.getMonth())
  const [reprogSaving, setReprogSaving]     = useState(false)
  const [reprogDone, setReprogDone]         = useState<string | null>(null) // rdvId once done

  // ── Offres ──────────────────────────────────
  const [offresEligibles, setOffresEligibles] = useState<Offre[]>([])
  const [offreAppliquee, setOffreAppliquee] = useState<Offre | null>(null)

  // ── Fidélité ─────────────────────────────────
  const [fideliteConfig, setFideliteConfig] = useState<{ active: boolean; nb_ronds: number; paliers: { position: number; type: string; valeur: number }[] } | null>(null)
  // Réduction personnelle de la cliente (cumulable avec la fidélité)
  // restants : null = illimitée, sinon nombre de RDV restants (0 = épuisée, non chargée)
  const [reductionCliente, setReductionCliente] = useState<{ type: string; valeur: number; restants: number | null } | null>(null)
  const [fideliteFiche, setFideliteFiche] = useState<{ tampons: number; cartes_completees: number; recompense_disponible: { type: string; valeur: number } | null } | null>(null)

  // ── Step 2 : Multi-select techniques ─────────
  const [techniquesSelectionnees, setTechniquesSelectionnees] = useState<TechSelec[]>([])
  const [sectionsOuvertes, setSectionsOuvertes] = useState<Set<string>>(new Set())
  // Accordéon détails technique (une seule dépliée à la fois) + visionneuse photo plein écran
  const [techniqueDepliee, setTechniqueDepliee] = useState<string | null>(null)
  // Visionneuse plein écran : toutes les photos de la technique + index affiché
  const [photoOverlay, setPhotoOverlay] = useState<{ photos: string[]; index: number } | null>(null)

  // ── Step 3 : Calendrier ──────────────────────
  const [date,     setDate]     = useState('')
  const [calYear,  setCalYear]  = useState(todayJs.getFullYear())
  const [calMonth, setCalMonth] = useState(todayJs.getMonth())

  // ── Step 4 : Heure ───────────────────────────
  const [slots,        setSlots]        = useState<Slot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [heure,        setHeure]        = useState('')
  // Incrémenté par le realtime quand l'agenda de la pro change → recharge les créneaux
  const [rdvVersion,   setRdvVersion]   = useState(0)

  // ── Step 5 : Confirmation ────────────────────
  const [commentaire, setCommentaire] = useState('')
  const [rappel,      setRappel]      = useState(false)
  // Photos d'inspiration de la cliente (data URLs compressées, max 3)
  const [inspirations, setInspirations] = useState<string[]>([])
  const [inspirationsStatut, setInspirationsStatut] = useState<'aucune' | 'envoyees' | 'echec'>('aucune')
  const [compressionEnCours, setCompressionEnCours] = useState(false)
  const step5Ref = useRef<HTMLDivElement>(null)

  // ── Glissements d'écran automatiques (fluidité du parcours) ──
  const modifPanelRef = useRef<HTMLDivElement>(null)
  const reprogPanelRef = useRef<HTMLDivElement>(null)
  const reprogSlotsRef = useRef<HTMLDivElement>(null)
  const reprogConfirmRef = useRef<HTMLButtonElement>(null)
  const confirmationRef = useRef<HTMLDivElement>(null)

  const scrollVers = (ref: React.RefObject<HTMLElement | null>, block: ScrollLogicalPosition = 'start') => {
    setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block }), 90)
  }

  // ── Premier créneau disponible ─────────────
  const [premierCreneau, setPremierCreneau] = useState<{ date: string; heure: string } | null>(null)
  const [loadingPremierCreneau, setLoadingPremierCreneau] = useState(false)

  // ── Totaux calculés (toutes spécialités) ─────
  const dureeTotal = techniquesSelectionnees.reduce((s, t) => s + t.duree, 0)
  const prixTotalBrut = techniquesSelectionnees.reduce((s, t) => s + t.prix, 0)
  const prixTotal = offreAppliquee
    ? offreAppliquee.prix_promo + techniquesSelectionnees.reduce((s, t) => {
        // Trouver si cette technique fait partie de l'offre
        const estDansOffre = Object.entries(catalogue).some(([cat, techs]) =>
          cat === t.categorie && techs.some(x => offreAppliquee.prestations_ids.includes(x.id) && x.nom === t.nom)
        )
        return s + (estDansOffre ? 0 : t.prix)
      }, 0)
    : prixTotalBrut

  // Récompense fidélité : existante OU proactive (palier atteint par ce RDV)
  const recompenseExistante = fideliteFiche?.recompense_disponible ?? null
  const prochainTampon = (fideliteFiche?.tampons ?? 0) + 1
  const palierProchain = fideliteConfig?.active ? fideliteConfig.paliers.find((p: any) => p.position === prochainTampon) : null
  const recompenseFidelite = fideliteConfig?.active
    ? (recompenseExistante ?? (palierProchain ? { type: palierProchain.type, valeur: palierProchain.valeur } : null))
    : null
  const prixApresFidelite = recompenseFidelite
    ? recompenseFidelite.type === 'gratuit'
      ? 0
      : recompenseFidelite.type === 'euros'
        ? Math.max(0, prixTotal - recompenseFidelite.valeur)
        : Math.round(prixTotal * (1 - recompenseFidelite.valeur / 100))
    : prixTotal
  // Réduction personnelle : appliquée après la fidélité (cumul)
  const prixFinal = reductionCliente && prixApresFidelite > 0
    ? reductionCliente.type === 'euros'
      ? Math.max(0, prixApresFidelite - reductionCliente.valeur)
      : Math.round(prixApresFidelite * (1 - reductionCliente.valeur / 100))
    : prixApresFidelite

  // ── Load pro ─────────────────────────────────
  useEffect(() => { loadPro() }, [slug])

  // ── Realtime : sync horaires dès que la pro les modifie dans Glamia ──
  useEffect(() => {
    if (!pro?.id) return
    const channel = supabase
      .channel(`horaires-${pro.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${pro.id}` },
        (payload) => {
          if (payload.new?.horaires || payload.new?.creneaux_bloques !== undefined || payload.new?.horaires_specifiques !== undefined || payload.new?.planning_variable !== undefined) {
            console.log('[Realtime] profil mis à jour')
            setPro(prev => {
              if (!prev) return prev
              return {
                ...prev,
                ...(payload.new?.horaires ? { horaires: payload.new.horaires } : {}),
                creneaux_bloques: Array.isArray(payload.new?.creneaux_bloques) ? payload.new.creneaux_bloques : prev.creneaux_bloques,
                ...(payload.new?.horaires_specifiques !== undefined ? { horaires_specifiques: payload.new.horaires_specifiques ?? {} } : {}),
                ...(payload.new?.planning_variable !== undefined ? { planning_variable: payload.new.planning_variable === true } : {}),
              }
            })
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rendez_vous', filter: `pro_id=eq.${pro.id}` },
        () => {
          console.log('[Realtime] agenda mis à jour')
          setRdvVersion(v => v + 1)
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [pro?.id])

  async function loadPro() {
    setPageState('loading')
    try {
      // 1. Chercher par colonne slug (order by created_at pour prendre le profil original si doublons)
      const { data: bySlugArr, error: errSlug } = await supabase
        .from('profiles')
        .select('*')
        .eq('slug', slug)
        .order('created_at', { ascending: true })
        .limit(1)

      if (errSlug) throw errSlug
      let found: any = bySlugArr?.[0] ?? null

      // 2. Fallback : matching par slug normalisé (prenom-nom ou pseudo-nom)
      if (!found) {
        const { data: profiles, error } = await supabase
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: true })

        if (error) throw error

        const normalized = normalizeStr(slug)
        found = profiles?.find(p => {
          const fromPrenom = normalizeStr(`${p.prenom}-${p.nom}`)
          const fromPseudo = p.pseudo ? normalizeStr(`${p.pseudo}-${p.nom}`) : null
          return fromPrenom === normalized || fromPseudo === normalized
        })
      }

      if (!found) {
        setPageState('notfound'); return
      }

      setPro({
        id:               found.id,
        prenom:           found.prenom,
        nom:              found.nom,
        pseudo:           found.pseudo ?? undefined,
        photo_url:        found.avatar_url ?? found.photo_url ?? undefined,
        horaires:              found.horaires ?? DEFAULT_HORAIRES,
        creneaux_bloques:      Array.isArray(found.creneaux_bloques) ? found.creneaux_bloques : [],
        horaires_specifiques:  (found.horaires_specifiques && typeof found.horaires_specifiques === 'object') ? found.horaires_specifiques : {},
        planning_variable:     found.planning_variable === true,
        instagram:             found.instagram ?? undefined,
        tiktok:           found.tiktok ?? undefined,
        snapchat:         found.snapchat ?? undefined,
        message_accueil:  found.message_accueil ?? undefined,
        adresse:          found.adresse ?? undefined,
        is_pro:           found.is_pro ?? false,
      })

      // Accès temps réel : abonnement actif OU essai en cours. Ne jamais se
      // fier à is_pro seul — il n'est synchronisé qu'au lancement de l'app,
      // les expirées jamais revenues le gardent à true (page ouverte à tort).
      const accesActif = found.abonnement_actif === true
        || (found.trial_ends_at && new Date(found.trial_ends_at) > new Date())
      if (!accesActif) { setPageState('blocked'); return }

      const { data: prestData } = await supabase
        .from('prestations')
        .select('data, ordre_categories')
        .eq('pro_id', found.id)
        .single()

      if (prestData?.data) setCatalogue(prestData.data as CataloguePrestations)
      if (prestData?.ordre_categories) setOrdreCategories(prestData.ordre_categories as string[])
      setPageState('ready')
    } catch (e) {
      console.error(e)
      setPageState('notfound')
    }
  }

  // ── Step 1 : Check phone ─────────────────────
  async function handleCheckPhone() {
    if (!pro) return
    const normalized = normalizePhone(telephone)
    if (normalized.length < 8) return

    setPhoneStatus('checking')

    try {
      const { data: clientes, error } = await supabase
        .from('clientes')
        .select('id, prenom, nom, telephone, email, reduction_type, reduction_valeur, reduction_rdv_restants')
        .eq('pro_id', pro.id)

      if (error) throw error

      const found = clientes?.find(c => normalizePhone(c.telephone) === normalized)

      if (found) {
        setClienteId(found.id)
        setClientePrenom(found.prenom)
        setClienteNom(found.nom)
        if (found.email) setClienteEmail(found.email)
        setReductionCliente(
          found.reduction_type && found.reduction_valeur && found.reduction_rdv_restants !== 0
            ? { type: found.reduction_type, valeur: Number(found.reduction_valeur), restants: found.reduction_rdv_restants ?? null }
            : null
        )
        setPhoneStatus('known')
        chargerRdvsAVenir(found.id, pro.id)
        chargerFidelite(pro.id, found.id)
      } else {
        setClienteId(null)
        setClientePrenom('')
        setClienteNom('')
        setClienteEmail('')
        setReductionCliente(null)
        setPhoneStatus('unknown')
        setFideliteFiche(null)
        chargerFideliteConfig(pro.id)
      }

      // Charger les offres éligibles pour ce téléphone
      chargerOffresEligibles(pro.id, normalized)

    } catch (e) {
      console.error('[handleCheckPhone] Erreur:', e)
      setPhoneStatus('unknown')
    }
  }

  // ── Offres éligibles ────────────────────────
  async function chargerOffresEligibles(proId: string, tel: string) {
    try {
      const { data, error } = await supabase.rpc('get_eligible_offers', {
        p_pro_id: proId,
        p_telephone: tel,
      })
      if (error) { console.error('[chargerOffresEligibles]', error); return }
      setOffresEligibles((data ?? []).map((o: any) => ({
        ...o,
        prestations_ids: Array.isArray(o.prestations_ids) ? o.prestations_ids : [],
      })))
    } catch (e) {
      console.error('[chargerOffresEligibles]', e)
    }
  }

  // ── Fidélité ────────────────────────────────
  async function chargerFideliteConfig(proId: string) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('fidelite_config')
        .eq('id', proId)
        .single()
      setFideliteConfig(profile?.fidelite_config as any ?? null)
    } catch (e) {
      console.error('[chargerFideliteConfig]', e)
    }
  }

  async function chargerFidelite(proId: string, clienteId: string) {
    try {
      // Config pro
      const { data: profile } = await supabase
        .from('profiles')
        .select('fidelite_config')
        .eq('id', proId)
        .single()
      if (profile?.fidelite_config) {
        setFideliteConfig(profile.fidelite_config as any)
      } else {
        setFideliteConfig(null)
        return
      }
      // Fiche cliente
      const { data: fiche } = await supabase
        .from('fidelite_clientes')
        .select('tampons, cartes_completees, recompense_disponible')
        .eq('pro_id', proId)
        .eq('cliente_id', clienteId)
        .single()
      setFideliteFiche(fiche as any ?? null)
    } catch (e) {
      console.error('[chargerFidelite]', e)
    }
  }

  // ── RDVs à venir ─────────────────────────────
  async function chargerRdvsAVenir(cId: string, proId: string) {
    setLoadingRdvs(true)
    try {
      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from('rendez_vous')
        .select('id, date, specialite, technique, duree, prix, statut, fidelite_appliquee, reduction_appliquee, techniques, offre_id, inspirations')
        .eq('cliente_id', cId)
        .eq('pro_id', proId)
        .gte('date', now)
        .neq('statut', 'annule')
        .order('date', { ascending: true })

      if (error) throw error
      setRdvsAVenir(data ?? [])
    } catch (e) {
      console.error('[chargerRdvsAVenir] Erreur:', e)
    } finally {
      setLoadingRdvs(false)
    }
  }

  // ── Inspirations sur un RDV existant ─────────
  function toggleInspis(rdvId: string) {
    setInspiNouvelles([])
    setInspiDone(null)
    setInspiRdvId(prev => (prev === rdvId ? null : rdvId))
  }

  async function ajouterInspiFichiers(e: React.ChangeEvent<HTMLInputElement>, rdv: RdvAVenir) {
    const fichiers = Array.from(e.target.files ?? [])
    e.target.value = ''
    const restant = 3 - (rdv.inspirations?.length ?? 0) - inspiNouvelles.length
    if (fichiers.length === 0 || restant <= 0 || inspiCompression) return
    const aTraiter = fichiers.slice(0, restant)
    if (fichiers.length > restant) {
      alert(`3 photos maximum : ${restant === 1 ? 'seule la première a été gardée' : `seules les ${restant} premières ont été gardées`}.`)
    }
    setInspiCompression(true)
    try {
      for (const f of aTraiter) {
        const dataUrl = await compresserImage(f)
        setInspiNouvelles(prev => [...prev, dataUrl])
      }
    } catch (err) {
      console.error('[inspirations] Erreur compression:', err)
      alert("Cette photo n'a pas pu être ajoutée. Réessaie avec une autre image.")
    } finally {
      setInspiCompression(false)
    }
  }

  async function validerInspis(rdv: RdvAVenir) {
    if (!pro || inspiNouvelles.length === 0 || inspiEnvoi) return
    setInspiEnvoi(true)
    try {
      const res = await fetch('/api/inspirations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rdv_id: rdv.id, pro_id: pro.id, telephone, photos: inspiNouvelles }),
      })
      const json = await res.json()
      if (!res.ok || !json.inspirations) throw new Error(json.error ?? 'upload_failed')
      setRdvsAVenir(prev => prev.map(r => (r.id === rdv.id ? { ...r, inspirations: json.inspirations } : r)))
      setInspiNouvelles([])
      setInspiDone(rdv.id)
    } catch (err) {
      console.error('[inspirations] Erreur envoi:', err)
      alert("Tes photos n'ont pas pu être envoyées. Réessaie.")
    } finally {
      setInspiEnvoi(false)
    }
  }

  async function handleAnnulerRdv(rdvId: string) {
    setAnnulationEnCours(rdvId)
    try {
      const rdv = rdvsAVenir.find(r => r.id === rdvId)

      const { error } = await supabase
        .from('rendez_vous')
        // notif_annulation_vue: annulation par la CLIENTE → notification
        // in-app sur l'écran Accueil de la pro
        .update({ statut: 'annule', notif_annulation_vue: false })
        .eq('id', rdvId)

      if (error) throw error
      setRdvsAVenir(prev => prev.filter(r => r.id !== rdvId))

      // Glamia Pay : libération / remboursement / prélèvement tardif automatique
      // (échec non bloquant — l'annulation du RDV reste acquise)
      fetch('/api/propay/annulation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rdv_id: rdvId }),
      }).catch(e => console.error('[glamia-pay] annulation:', e))

      // Restaurer la carte fidélité
      if (rdv && pro && clienteId && fideliteConfig?.active) {
        try {
          const { data: ficheFraiche } = await supabase
            .from('fidelite_clientes')
            .select('*')
            .eq('pro_id', pro.id)
            .eq('cliente_id', clienteId)
            .maybeSingle()

          if (ficheFraiche) {
            const update: Record<string, unknown> = {
              updated_at: new Date().toISOString(),
            }

            if (rdv.fidelite_appliquee) {
              // Le RDV avait consommé une récompense → défaire le reset + retirer le tampon
              const wasCardReset = ficheFraiche.tampons === 0 && ficheFraiche.cartes_completees > 0
              if (wasCardReset) {
                update.tampons = fideliteConfig.nb_ronds - 1
                update.cartes_completees = ficheFraiche.cartes_completees - 1
              } else {
                update.tampons = Math.max(0, ficheFraiche.tampons - 1)
              }
            } else if (ficheFraiche.tampons > 0) {
              // RDV sans récompense → juste retirer un tampon
              update.tampons = ficheFraiche.tampons - 1
              // Ne retirer la récompense que si elle correspond au palier actuel
              const palierActuel = fideliteConfig.paliers.find((p: any) => p.position === ficheFraiche.tampons)
              if (palierActuel && ficheFraiche.recompense_disponible) {
                update.recompense_disponible = null
              }
            }

            await supabase.from('fidelite_clientes').update(update).eq('id', ficheFraiche.id)
          }
        } catch (e) {
          console.error('[handleAnnulerRdv] Erreur retrait tampon fidélité:', e)
        }
      }

      // Rendre son utilisation de réduction limitée à la cliente
      if (rdv?.reduction_appliquee?.limitee && clienteId) {
        try {
          const { error: reducError } = await supabase.rpc('restaurer_reduction_cliente', {
            p_cliente_id: clienteId,
            p_type: rdv.reduction_appliquee.type,
            p_valeur: rdv.reduction_appliquee.valeur,
          })
          if (reducError) throw reducError
          setReductionCliente(prev => prev
            ? { ...prev, restants: prev.restants != null ? prev.restants + 1 : null }
            : { type: rdv.reduction_appliquee!.type, valeur: rdv.reduction_appliquee!.valeur, restants: 1 })
        } catch (e) {
          console.error('[handleAnnulerRdv] Erreur restauration réduction:', e)
        }
      }

      if (rdv && pro) {
        envoyerPushNotif(
          pro.id,
          '❌ RDV annulé',
          `${clientePrenom} a annulé son RDV du ${formatRdvDate(rdv.date)} à ${formatRdvHeure(rdv.date)}`
        )
      }
    } catch (e) {
      console.error('[handleAnnulerRdv] Erreur:', e)
      alert('Impossible d\'annuler ce rendez-vous.')
    } finally {
      setAnnulationEnCours(null)
    }
  }

  // Confirmation intégrée au bouton (deux taps) : window.confirm est
  // silencieusement ignoré sur iOS dans certains contextes (page en plein
  // écran, dialogues bloqués) → le bouton semblait mort (fix 14 juil. 2026)
  const [annulationAConfirmer, setAnnulationAConfirmer] = useState<string | null>(null)
  const annulationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  function confirmerAnnulation(rdv: RdvAVenir) {
    if (annulationAConfirmer === rdv.id) {
      if (annulationTimerRef.current) clearTimeout(annulationTimerRef.current)
      setAnnulationAConfirmer(null)
      handleAnnulerRdv(rdv.id)
      return
    }
    setAnnulationAConfirmer(rdv.id)
    if (annulationTimerRef.current) clearTimeout(annulationTimerRef.current)
    // Sans second tap sous 5 s, le bouton redevient « Annuler »
    annulationTimerRef.current = setTimeout(() => setAnnulationAConfirmer(null), 5000)
  }

  // ── Reprogrammer : ouvrir le sélecteur ───────
  function ouvrirReprog(rdvId: string) {
    setReprogRdvId(rdvId)
    setReprogDate('')
    setReprogHeure('')
    setReprogSlots([])
    setReprogDone(null)
    setReprogCalYear(todayJs.getFullYear())
    setReprogCalMonth(todayJs.getMonth())
    // Une reprogrammation classique annule toute modification de prestations en attente
    setModifPendingTechs(null)
    scrollVers(reprogPanelRef)
  }

  function fermerReprog() {
    setReprogRdvId(null)
    setReprogDate('')
    setReprogHeure('')
    setReprogSlots([])
    setModifPendingTechs(null)
  }

  // ── Modification des prestations d'un RDV à venir ─────────────────
  // (indisponible sur les RDV liés à une offre : le prix promo est
  // attaché à une composition précise de prestations)

  // Ré-appliquer au nouveau total les réductions déjà accordées à ce RDV
  function prixApresReducsRdv(base: number, rdv: RdvAVenir) {
    let p = base
    const f = rdv.fidelite_appliquee
    if (f) {
      p = f.type === 'gratuit' ? 0
        : f.type === 'euros' ? Math.max(0, p - f.valeur)
        : Math.round(p * (1 - f.valeur / 100))
    }
    const r = rdv.reduction_appliquee
    if (r && p > 0) {
      p = r.type === 'euros' ? Math.max(0, p - r.valeur)
        : Math.round(p * (1 - r.valeur / 100))
    }
    return p
  }

  function ouvrirModifPresta(rdv: RdvAVenir) {
    fermerReprog()
    setModifDone(null)
    setModifRdvId(rdv.id)
    setModifSelection((rdv.techniques ?? []).map(t => ({
      categorie: t.categorie ?? rdv.specialite,
      nom: t.nom,
      prix: t.prix,
      duree: t.duree,
    })))
    // Cartes repliées à l'ouverture — les spécialités déjà choisies restent
    // repérables grâce à l'en-tête rose + badge ✓ n
    setModifSections(new Set())
    scrollVers(modifPanelRef)
  }

  function toggleModifSection(nom: string) {
    setModifSections(prev => {
      const next = new Set(prev)
      if (next.has(nom)) next.delete(nom)
      else next.add(nom)
      return next
    })
  }

  function fermerModifPresta() {
    setModifRdvId(null)
    setModifSelection([])
  }

  function toggleModifTech(t: { id?: string; nom: string; prix: number; duree: number }, categorie: string) {
    setModifSelection(prev => {
      const dedans = prev.some(s => s.nom === t.nom && s.categorie === categorie)
      return dedans
        ? prev.filter(s => !(s.nom === t.nom && s.categorie === categorie))
        : [...prev, { categorie, nom: t.nom, prix: t.prix, duree: t.duree }]
    })
  }

  // Applique la modification (et éventuellement une nouvelle date/heure)
  async function appliquerModifPresta(rdv: RdvAVenir, techs: TechSelec[], newDate: string | null, newHeure: string | null) {
    if (!pro) return
    const duree = techs.reduce((s, t) => s + t.duree, 0)
    const base = techs.reduce((s, t) => s + t.prix, 0)
    const prix = prixApresReducsRdv(base, rdv)
    const labels = techs.map(t => t.nom).join(', ')
    const specs = [...new Set(techs.map(t => t.categorie))].join(', ')
    const dateISO = newDate && newHeure ? `${newDate}T${newHeure}:00.000Z` : rdv.date
    const dateAffichee = newDate ? formatDateLong(newDate) : formatRdvDate(rdv.date)
    const heureAffichee = newHeure ?? formatRdvHeure(rdv.date)

    const patch: Record<string, unknown> = {
      techniques: techs,
      technique: labels,
      specialite: specs,
      duree,
      prix: prix > 0 ? prix : null,
    }
    if (newDate && newHeure) {
      patch.date = dateISO
      patch.statut = 'en_attente'
      patch.rappel_envoye_count = 0
      patch.rappel_envoye_at = null
    }

    const { error } = await supabase.from('rendez_vous').update(patch).eq('id', rdv.id)
    if (error) throw error

    // Push à la pro
    envoyerPushNotif(
      pro.id,
      '🌸 RDV modifié',
      `${clientePrenom} a modifié ses prestations du ${dateAffichee} à ${heureAffichee} : ${labels}`
    )

    // Email de confirmation à jour pour la cliente
    if (clienteEmail.trim()) {
      try {
        await fetch(
          'https://gdgfgbxoapgmrbttdyac.supabase.co/functions/v1/confirmation-booking',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              cliente_email: clienteEmail.trim(),
              cliente_prenom: clientePrenom.trim(),
              pro_nom: pro.pseudo || `${pro.prenom} ${pro.nom}`,
              date: dateAffichee,
              heure: heureAffichee,
              duree: formatDuree(duree),
              prix_total: prix,
              adresse: pro.adresse || '',
              techniques: techs.map(t => ({
                nom: t.nom,
                specialite: t.categorie,
                prix: t.prix,
                duree_minutes: t.duree,
              })),
            }),
          },
        )
      } catch (e) {
        console.error('[appliquerModifPresta] Erreur envoi email:', e)
      }
    }

    // Mise à jour locale
    setRdvsAVenir(prev => prev.map(r =>
      r.id === rdv.id
        ? { ...r, date: dateISO, technique: labels, specialite: specs, duree, prix: prix > 0 ? prix : null, techniques: techs, ...(newDate ? { statut: 'en_attente' } : {}) }
        : r
    ))
    setModifDone(rdv.id)
    fermerModifPresta()
    setModifPendingTechs(null)
    setReprogRdvId(null)
    scrollVers(confirmationRef, 'center')
  }

  // Confirmer depuis le panneau prestations : vérifie que la nouvelle
  // durée tient dans le créneau actuel, sinon bascule sur le choix d'horaire
  async function confirmerModifPresta(rdv: RdvAVenir) {
    if (!pro || modifSelection.length === 0) return
    setModifSaving(true)
    try {
      const nouvelleDuree = modifSelection.reduce((s, t) => s + t.duree, 0)
      if (nouvelleDuree > rdv.duree) {
        const dateStr = (rdv.date as string).slice(0, 10)
        const heureActuelle = formatRdvHeure(rdv.date)
        const { data: rdvs } = await supabase
          .from('rendez_vous')
          .select('id, date, duree, statut')
          .eq('pro_id', pro.id)
          .gte('date', `${dateStr}T00:00:00.000Z`)
          .lte('date', `${dateStr}T23:59:59.999Z`)
          .neq('statut', 'annule')
        const autres = (rdvs ?? []).filter(r => r.id !== rdv.id).map(r => {
          const d = new Date(r.date)
          return {
            heure: `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`,
            duree: r.duree,
          }
        })
        const slots = generateSlots(dateStr, nouvelleDuree, pro.horaires, autres, pro.creneaux_bloques, pro.horaires_specifiques, pro.planning_variable)
        const tient = slots.some(s => s.heure === heureActuelle && s.disponible)
        if (!tient) {
          // Le créneau actuel ne suffit plus → choix d'un nouvel horaire
          // (ouvrirReprog d'abord : il réinitialise modifPendingTechs)
          const enAttente = modifSelection
          fermerModifPresta()
          ouvrirReprog(rdv.id)
          setModifPendingTechs(enAttente)
          return
        }
      }
      await appliquerModifPresta(rdv, modifSelection, null, null)
    } catch (e) {
      console.error('[confirmerModifPresta] Erreur:', e)
      alert('Impossible de modifier ce rendez-vous.')
    } finally {
      setModifSaving(false)
    }
  }

  function reprogPrevMonth() {
    const isAtCurrent = reprogCalYear === todayJs.getFullYear() && reprogCalMonth === todayJs.getMonth()
    if (isAtCurrent) return
    if (reprogCalMonth === 0) { setReprogCalMonth(11); setReprogCalYear(y => y - 1) }
    else setReprogCalMonth(m => m - 1)
  }

  function reprogNextMonth() {
    if (reprogCalMonth === 11) { setReprogCalMonth(0); setReprogCalYear(y => y + 1) }
    else setReprogCalMonth(m => m + 1)
  }

  async function reprogSelectDate(dateStr: string) {
    setReprogDate(dateStr)
    setReprogHeure('')
    if (!pro || !reprogRdvId) return

    const rdv = rdvsAVenir.find(r => r.id === reprogRdvId)
    if (!rdv) return

    setReprogLoadingSlots(true)
    setReprogSlots([])
    try {
      const { data: rdvs } = await supabase
        .from('rendez_vous')
        .select('id, date, duree, statut')
        .eq('pro_id', pro.id)
        .gte('date', `${dateStr}T00:00:00.000Z`)
        .lte('date', `${dateStr}T23:59:59.999Z`)
        .neq('statut', 'annule')

      // Exclure le RDV en cours de modification : son propre créneau ne doit pas le bloquer
      const rdvExistants = (rdvs ?? []).filter(r => r.id !== reprogRdvId).map(r => {
        const d = new Date(r.date)
        return {
          heure: `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`,
          duree: r.duree,
        }
      })

      // Durée effective : celle des nouvelles prestations si une modification est en cours
      const dureeEffective = modifPendingTechs
        ? modifPendingTechs.reduce((s, t) => s + t.duree, 0)
        : rdv.duree

      setReprogSlots(generateSlots(dateStr, dureeEffective, pro.horaires, rdvExistants, pro.creneaux_bloques, pro.horaires_specifiques, pro.planning_variable))
      // 'start' et non 'center' : sur petit iPhone la grille dépasse l'écran,
      // un centrage couperait la date et le haut des créneaux
      scrollVers(reprogSlotsRef, 'start')
    } catch (e) {
      console.error('[reprogSelectDate] Erreur:', e)
    } finally {
      setReprogLoadingSlots(false)
    }
  }

  async function handleReprogrammer() {
    if (!pro || !reprogRdvId || !reprogDate || !reprogHeure) return
    setReprogSaving(true)
    try {
      // Modification de prestations en attente → tout appliquer d'un coup
      if (modifPendingTechs) {
        const rdvCible = rdvsAVenir.find(r => r.id === reprogRdvId)
        if (rdvCible) {
          await appliquerModifPresta(rdvCible, modifPendingTechs, reprogDate, reprogHeure)
          setReprogDate('')
          setReprogHeure('')
          setReprogSlots([])
          return
        }
      }

      const newDateISO = `${reprogDate}T${reprogHeure}:00.000Z`

      const { error } = await supabase
        .from('rendez_vous')
        .update({
          date: newDateISO,
          statut: 'en_attente',
          rappel_envoye_count: 0,
          rappel_envoye_at: null,
        })
        .eq('id', reprogRdvId)

      if (error) throw error

      // Push notification
      envoyerPushNotif(
        pro.id,
        '📅 RDV reprogrammé',
        `${clientePrenom} a reprogrammé son RDV au ${formatDateLong(reprogDate)} à ${reprogHeure}`
      )

      // Mettre à jour la liste locale
      setRdvsAVenir(prev => prev.map(r =>
        r.id === reprogRdvId
          ? { ...r, date: newDateISO, statut: 'en_attente' }
          : r
      ))

      // Email de confirmation reprogrammation
      const rdvReprog = rdvsAVenir.find(r => r.id === reprogRdvId)
      if (clienteEmail.trim() && rdvReprog) {
        try {
          const proNomComplet = pro.pseudo || `${pro.prenom} ${pro.nom}`
          await fetch(
            'https://gdgfgbxoapgmrbttdyac.supabase.co/functions/v1/confirmation-booking',
            {
              method: 'POST',
              // Authorization requis : la gateway Supabase (verify_jwt) rejette
              // les appels sans clé — l'email partait en 401 silencieux
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
              },
              body: JSON.stringify({
                cliente_email: clienteEmail.trim(),
                cliente_prenom: clientePrenom.trim(),
                pro_nom: proNomComplet,
                date: formatDateLong(reprogDate),
                heure: reprogHeure,
                duree: formatDuree(rdvReprog.duree),
                prix_total: rdvReprog.prix ?? 0,
                adresse: pro.adresse || '',
                techniques: [{
                  nom: rdvReprog.technique,
                  specialite: rdvReprog.specialite,
                  prix: rdvReprog.prix ?? 0,
                  duree_minutes: rdvReprog.duree,
                }],
              }),
            },
          )
          console.log('[handleReprogrammer] Email confirmation envoyé')
        } catch (e) {
          console.error('[handleReprogrammer] Erreur envoi email:', e)
        }
      }

      setReprogDone(reprogRdvId)
      setReprogRdvId(null)
      scrollVers(confirmationRef, 'center')
    } catch (e) {
      console.error('[handleReprogrammer] Erreur:', e)
      alert('Impossible de reprogrammer ce rendez-vous.')
    } finally {
      setReprogSaving(false)
    }
  }

  // ── Step 2 : Accordion techniques ────────────
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  function toggleSection(cat: string) {
    setSectionsOuvertes(prev => {
      const next = new Set(prev)
      if (next.has(cat)) {
        next.delete(cat)
      } else {
        next.add(cat)
        // Scroll vers la section après ouverture (délai pour laisser le DOM se mettre à jour)
        setTimeout(() => {
          sectionRefs.current[cat]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }, 60)
      }
      return next
    })
  }

  function toggleTechnique(t: Technique, cat: string) {
    setTechniquesSelectionnees(prev => {
      const exists = prev.find(s => s.nom === t.nom && s.categorie === cat)
      if (exists) return prev.filter(s => !(s.nom === t.nom && s.categorie === cat))
      return [...prev, { nom: t.nom, prix: t.prix, duree: t.duree, categorie: cat, prix_type: t.prix_type }]
    })
    // Réinitialiser date/heure (la durée change → les créneaux doivent être recalculés)
    setDate('')
    setHeure('')
    // Si on décoche une prestation incluse dans l'offre, retirer l'offre
    if (offreAppliquee && offreAppliquee.prestations_ids.includes(t.id)) {
      const exists = techniquesSelectionnees.find(s => s.nom === t.nom && s.categorie === cat)
      if (exists) setOffreAppliquee(null) // on décoche → retirer l'offre
    }
  }

  // ── Step 4 : Load slots ───────────────────────
  // Dépend du step + date (dureeTotal est stable quand on arrive à step 4)
  useEffect(() => {
    if (step === 4 && date && dureeTotal > 0 && pro) loadSlots()
  }, [step, date, rdvVersion])

  async function loadSlots() {
    if (!pro || dureeTotal === 0 || !date) return
    setLoadingSlots(true)
    setSlots([])
    try {
      const { data: rdvs, error: rdvsErr } = await supabase
        .from('rendez_vous')
        .select('date, duree, statut')
        .eq('pro_id', pro.id)
        .gte('date', `${date}T00:00:00.000Z`)
        .lte('date', `${date}T23:59:59.999Z`)
        .neq('statut', 'annule')

      // Lecture impossible → on ne propose RIEN plutôt que d'afficher
      // tous les créneaux libres (risque de double réservation)
      if (rdvsErr) {
        console.error('[loadSlots] Lecture RDV impossible:', rdvsErr)
        return
      }

      const rdvExistants = (rdvs ?? []).map(r => {
        const d = new Date(r.date)
        return {
          heure: `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`,
          duree: r.duree,
        }
      })

      setSlots(generateSlots(date, dureeTotal, pro.horaires, rdvExistants, pro.creneaux_bloques, pro.horaires_specifiques, pro.planning_variable))
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingSlots(false)
    }
  }

  // ── Premier créneau : recherche automatique ──
  useEffect(() => {
    if (step === 3 && pro && dureeTotal > 0) findPremierCreneau()
  }, [step, pro, dureeTotal])

  async function findPremierCreneau() {
    if (!pro || dureeTotal === 0) return
    setLoadingPremierCreneau(true)
    setPremierCreneau(null)

    try {
      const now = new Date()
      const maxDate = new Date(now)
      maxDate.setDate(maxDate.getDate() + 30)

      const fromStr = buildDateStr(now.getFullYear(), now.getMonth(), now.getDate())
      const toStr = buildDateStr(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate())

      const { data: rdvs } = await supabase
        .from('rendez_vous')
        .select('date, duree, statut')
        .eq('pro_id', pro.id)
        .gte('date', `${fromStr}T00:00:00.000Z`)
        .lte('date', `${toStr}T23:59:59.999Z`)
        .neq('statut', 'annule')

      const rdvsByDate: Record<string, { heure: string; duree: number }[]> = {}
      for (const r of rdvs ?? []) {
        const d = new Date(r.date)
        const key = buildDateStr(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
        if (!rdvsByDate[key]) rdvsByDate[key] = []
        rdvsByDate[key].push({
          heure: `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`,
          duree: r.duree,
        })
      }

      for (let i = 0; i <= 30; i++) {
        const d = new Date(now)
        d.setDate(d.getDate() + i)
        const dateStr = buildDateStr(d.getFullYear(), d.getMonth(), d.getDate())

        if (!isDayWorking(dateStr, pro.horaires, pro.horaires_specifiques, pro.planning_variable)) continue
        if (isDayBlocked(dateStr, pro.creneaux_bloques)) continue

        const daySlots = generateSlots(dateStr, dureeTotal, pro.horaires, rdvsByDate[dateStr] ?? [], pro.creneaux_bloques, pro.horaires_specifiques, pro.planning_variable)
        const available = daySlots.find(s => s.disponible)
        console.log('[firstAvailable] now:', new Date().toISOString(), 'day:', dateStr, 'slots dispo:', daySlots.filter(s => s.disponible).map(s => s.heure), 'candidate:', available?.heure ?? 'none')

        if (available) {
          setPremierCreneau({ date: dateStr, heure: available.heure })
          break
        }
      }
    } catch (e) {
      console.error('[findPremierCreneau] Erreur:', e)
    } finally {
      setLoadingPremierCreneau(false)
    }
  }

  // ── Step 5 : Confirm ──────────────────────────
  // ── Step 5 : ajout de photos d'inspiration (sélection multiple, 3 max) ──
  async function handleAjoutInspiration(e: React.ChangeEvent<HTMLInputElement>) {
    const fichiers = Array.from(e.target.files ?? [])
    e.target.value = '' // permet de re-sélectionner la même photo après suppression
    if (fichiers.length === 0 || inspirations.length >= 3) return
    const restant = 3 - inspirations.length
    const aTraiter = fichiers.slice(0, restant)
    if (fichiers.length > restant) {
      alert(`3 photos maximum : ${restant === 1 ? 'seule la première a été gardée' : `seules les ${restant} premières ont été gardées`}.`)
    }
    setCompressionEnCours(true)
    let echecs = 0
    for (const fichier of aTraiter) {
      try {
        const dataUrl = await compresserImage(fichier)
        setInspirations(prev => (prev.length >= 3 ? prev : [...prev, dataUrl]))
      } catch (err) {
        echecs++
        console.error('[inspirations] Erreur compression:', err)
      }
    }
    setCompressionEnCours(false)
    if (echecs > 0) alert(echecs === 1 ? "Une photo n'a pas pu être ajoutée. Réessaie avec une autre image." : `${echecs} photos n'ont pas pu être ajoutées. Réessaie avec d'autres images.`)
  }

  // ── Glamia Pay : préparer l'empreinte/acompte en arrivant à la confirmation ──
  useEffect(() => {
    if (step !== 5 || !pro) { setPropay(null); setPropayConsent(false); return }
    setPropay(null)
    setPropayConsent(false)
    // prixFinal = prix APRÈS fidélité et réduction : un 10e RDV offert
    // (prixFinal = 0) ne demande AUCUNE carte (l'API renvoie actif:false
    // sous 1 €) — l'ancien repli sur prixTotal exigeait une empreinte au
    // prix plein sur un RDV gratuit (fix 15 juil. 2026)
    const total = Math.max(0, prixFinal)
    fetch('/api/propay/intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pro_id: pro.id, total }),
    })
      .then(r => r.json())
      .then((d: PropayInfo) => setPropay(d))
      .catch(() => setPropay({ actif: false }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  async function handleConfirm() {
    if (!pro || techniquesSelectionnees.length === 0 || !date || !heure) return
    setSubmitting(true)

    const categories    = [...new Set(techniquesSelectionnees.map(t => t.categorie))]
    const categoriesStr = categories.join(', ')
    const techniquesStr = techniquesSelectionnees.map(t => t.nom).join(', ')

    try {
      // Re-vérification de dernière seconde : le créneau choisi est-il
      // toujours libre ? (la grille peut dater de plusieurs minutes)
      const { data: rdvsJour, error: verifErr } = await supabase
        .from('rendez_vous')
        .select('date, duree')
        .eq('pro_id', pro.id)
        .gte('date', `${date}T00:00:00.000Z`)
        .lte('date', `${date}T23:59:59.999Z`)
        .neq('statut', 'annule')
      if (verifErr) {
        alert('Impossible de vérifier la disponibilité du créneau. Réessaie dans un instant.')
        return
      }
      const debutMin = timeToMin(heure)
      const finMin = debutMin + dureeTotal
      const conflit = (rdvsJour ?? []).some(r => {
        const d = new Date(r.date)
        const debutR = d.getUTCHours() * 60 + d.getUTCMinutes()
        return debutMin < debutR + (r.duree ?? 0) && finMin > debutR
      })
      if (conflit) {
        alert('Ce créneau vient d\'être réservé 😔 Choisis-en un autre.')
        setHeure('')
        setStep(4)
        setRdvVersion(v => v + 1)
        return
      }

      // ── Glamia Pay : valider la carte AVANT de créer quoi que ce soit ──
      let propayIntentId: string | null = null
      if (propay?.actif) {
        if (!propayConsent) {
          alert(propay.mode === 'acompte'
            ? "Coche la case d'acceptation de l'acompte pour réserver."
            : "Coche la case d'autorisation d'empreinte bancaire pour réserver.")
          return
        }
        const resultat = await propayRef.current?.confirmer()
        if (!resultat?.ok) {
          if (resultat?.erreur) alert(resultat.erreur)
          return
        }
        propayIntentId = resultat.intentId ?? null
      }

      let cId = clienteId
      let nouvelleCliente = false
      const telNormalized = normalizePhone(telephone)

      if (!cId) {
        const { data: allClientes, error: fetchErr } = await supabase
          .from('clientes')
          .select('id, telephone')
          .eq('pro_id', pro.id)

        if (!fetchErr && allClientes) {
          const fc = allClientes.find(c => normalizePhone(c.telephone) === telNormalized)
          if (fc) cId = fc.id
        }

        if (!cId) {
          const { data: created, error: createErr } = await supabase
            .from('clientes')
            .insert({
              pro_id:    pro.id,
              prenom:    clientePrenom.trim(),
              nom:       clienteNom.trim(),
              telephone: telNormalized,
              email:     clienteEmail.trim() || null,
              source:    'booking',
            })
            .select('id')
            .single()

          if (createErr) throw createErr
          cId = created!.id
          nouvelleCliente = true
        }
      }

      const dateRdvISO = `${date}T${heure}:00.000Z`
      const { data: nouveau, error: rdvErr } = await supabase
        .from('rendez_vous')
        .insert({
          pro_id:     pro.id,
          cliente_id: cId,
          date:       dateRdvISO,
          duree:      dureeTotal,
          specialite: categoriesStr,
          technique:  techniquesStr,
          techniques: techniquesSelectionnees,
          prix:       prixFinal > 0 ? prixFinal : null,
          statut:     'en_attente',
          notes:      commentaire.trim() || null,
          demande_rappel: rappel,
          fidelite_appliquee: recompenseFidelite ?? null,
          reduction_appliquee: reductionCliente
            ? { type: reductionCliente.type, valeur: reductionCliente.valeur, limitee: reductionCliente.restants != null }
            : null,
          source:     'booking',
        })
        .select('id')
        .single()

      if (rdvErr) throw rdvErr

      // ── Glamia Pay : lier l'empreinte/acompte validé au RDV (journal paiements) ──
      if (propayIntentId && nouveau?.id) {
        try {
          await fetch('/api/propay/lier', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pro_id: pro.id, rdv_id: nouveau.id, intent_id: propayIntentId }),
          })
        } catch (e) {
          console.error('[glamia-pay] liaison au RDV:', e)
        }
      }

      // Fidélité : consommer récompense existante, ajouter tampon, consommer si palier proactif
      if (cId && fideliteConfig?.active) {
        try {
          const { data: ficheFraiche } = await supabase
            .from('fidelite_clientes')
            .select('*')
            .eq('pro_id', pro.id)
            .eq('cliente_id', cId)
            .maybeSingle()

          // Consommer la récompense existante si elle a été appliquée au prix
          if (ficheFraiche?.recompense_disponible && recompenseExistante) {
            const consumeUpdate: Record<string, unknown> = {
              recompense_disponible: null,
              updated_at: new Date().toISOString(),
            }
            if (ficheFraiche.tampons >= fideliteConfig.nb_ronds) {
              consumeUpdate.tampons = 0
              consumeUpdate.cartes_completees = ficheFraiche.cartes_completees + 1
            }
            await supabase.from('fidelite_clientes').update(consumeUpdate).eq('id', ficheFraiche.id)
          }

          // Re-lire la fiche après consommation éventuelle
          const { data: ficheApres } = await supabase
            .from('fidelite_clientes')
            .select('*')
            .eq('pro_id', pro.id)
            .eq('cliente_id', cId)
            .maybeSingle()

          if (!ficheApres) {
            // Créer la fiche
            const palierUn = fideliteConfig.paliers.find((p: any) => p.position === 1)
            const insertData: Record<string, unknown> = {
              pro_id: pro.id,
              cliente_id: cId,
              tampons: 1,
            }
            if (palierUn) {
              insertData.recompense_disponible = { type: palierUn.type, valeur: palierUn.valeur }
            }
            await supabase.from('fidelite_clientes').insert(insertData)
            // Si palier 1 atteint proactivement, consommer immédiatement
            if (palierUn && !recompenseExistante) {
              const { data: ficheNew } = await supabase
                .from('fidelite_clientes')
                .select('id, tampons, cartes_completees')
                .eq('pro_id', pro.id)
                .eq('cliente_id', cId)
                .maybeSingle()
              if (ficheNew) {
                const consumeUpdate: Record<string, unknown> = { recompense_disponible: null, updated_at: new Date().toISOString() }
                if (ficheNew.tampons >= fideliteConfig.nb_ronds) {
                  consumeUpdate.tampons = 0
                  consumeUpdate.cartes_completees = ficheNew.cartes_completees + 1
                }
                await supabase.from('fidelite_clientes').update(consumeUpdate).eq('id', ficheNew.id)
              }
            }
          } else {
            const nouveauTampons = ficheApres.tampons + 1
            const palierAtteint = [...fideliteConfig.paliers]
              .sort((a: any, b: any) => b.position - a.position)
              .find((p: any) => p.position === nouveauTampons)

            const update: Record<string, unknown> = {
              tampons: nouveauTampons,
              updated_at: new Date().toISOString(),
            }
            if (palierAtteint) {
              update.recompense_disponible = { type: palierAtteint.type, valeur: palierAtteint.valeur }
            }
            await supabase.from('fidelite_clientes').update(update).eq('id', ficheApres.id)

            // Si palier atteint proactivement, consommer immédiatement + reset carte si pleine
            if (palierAtteint && !recompenseExistante) {
              const consumeUpdate: Record<string, unknown> = { recompense_disponible: null, updated_at: new Date().toISOString() }
              if (nouveauTampons >= fideliteConfig.nb_ronds) {
                consumeUpdate.tampons = 0
                consumeUpdate.cartes_completees = ficheApres.cartes_completees + 1
              }
              await supabase.from('fidelite_clientes').update(consumeUpdate).eq('id', ficheApres.id)
            }
          }
        } catch (e) {
          console.error('[handleConfirm] Erreur fidélité:', e)
        }
      }

      // Réduction limitée : décompter une utilisation via la RPC sécurisée
      // (les RLS interdisent — à raison — l'update direct de clientes en anonyme)
      if (cId && reductionCliente && reductionCliente.restants != null) {
        try {
          const { error: reducError } = await supabase.rpc('consommer_reduction_cliente', { p_cliente_id: cId })
          if (reducError) throw reducError
          const restants = reductionCliente.restants - 1
          setReductionCliente(restants <= 0 ? null : { ...reductionCliente, restants })
        } catch (e) {
          console.error('[handleConfirm] Erreur décompte réduction:', e)
        }
      }

      // Appliquer l'offre si sélectionnée
      if (nouveau?.id && offreAppliquee) {
        try {
          const result = await supabase.rpc('apply_offer_to_rdv', {
            p_offre_id: offreAppliquee.id,
            p_rdv_id: nouveau.id,
            p_telephone: telNormalized,
          })
          if (result.error) {
            console.error('[handleConfirm] Erreur application offre:', result.error)
          } else {
            const res = result.data as { success: boolean; error?: string }
            if (!res.success) {
              console.warn('[handleConfirm] Offre non appliquée:', res.error)
              // Recalculer le prix sans offre
              const prixSansOffre = prixTotalBrut > 0 ? prixTotalBrut : null
              await supabase.from('rendez_vous').update({ prix: prixSansOffre, offre_id: null }).eq('id', nouveau.id)
            }
          }
        } catch (e) {
          console.error('[handleConfirm] Exception application offre:', e)
        }
      }

      setPageState('confirmed')

      // Photos d'inspiration → upload via l'API (un échec ne bloque JAMAIS la réservation)
      if (nouveau?.id && inspirations.length > 0) {
        try {
          const res = await fetch('/api/inspirations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rdv_id: nouveau.id, photos: inspirations }),
          })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          setInspirationsStatut('envoyees')
        } catch (e) {
          console.error('[handleConfirm] Erreur envoi inspirations (non bloquante):', e)
          setInspirationsStatut('echec')
        }
      }

      // Email de confirmation à la cliente (non bloquant)
      if (!clienteEmail.trim()) {
        console.warn('[handleConfirm] Cliente sans email, confirmation non envoyée')
      } else {
        try {
          const proNomComplet = pro.pseudo || `${pro.prenom} ${pro.nom}`
          const rdvDateTime = new Date(`${date}T${heure}:00`)
          const dansMotins24h = (rdvDateTime.getTime() - Date.now()) < 24 * 60 * 60 * 1000
          const emailBody = {
            cliente_email: clienteEmail.trim(),
            cliente_prenom: clientePrenom.trim(),
            pro_nom: proNomComplet,
            date: formatDateLong(date),
            heure,
            duree: formatDuree(dureeTotal),
            prix_total: prixFinal,
            adresse: pro.adresse || '',
            skip_rappel_notice: dansMotins24h,
            techniques: techniquesSelectionnees.map(t => ({
              nom: t.nom,
              specialite: t.categorie,
              prix: t.prix,
              duree_minutes: t.duree,
            })),
          }
          console.log('[handleConfirm] Données envoyées:', emailBody)
          console.log('[handleConfirm] Appel Edge Function confirmation-booking...')
          const res = await fetch(
            'https://gdgfgbxoapgmrbttdyac.supabase.co/functions/v1/confirmation-booking',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
              },
              body: JSON.stringify(emailBody),
            },
          )
          const resData = await res.json()
          console.log('[handleConfirm] Résultat:', res.status, resData)
          if (!res.ok) console.error('[handleConfirm] Erreur Edge Function:', resData)
        } catch (e) {
          console.error('[handleConfirm] Erreur envoi email confirmation:', e)
        }
      }

      // Envoi automatique rappel-confirmation si RDV < 24h
      // Sauf si le RDV est pris pour le jour même (même règle que le mobile)
      if (nouveau?.id) {
        const heuresAvant = (new Date(dateRdvISO).getTime() - Date.now()) / (60 * 60 * 1000)
        const estAujourdhui = date === new Date().toISOString().slice(0, 10)
        if (heuresAvant > 0 && heuresAvant <= 24 && !estAujourdhui) {
          try {
            await fetch(
              'https://gdgfgbxoapgmrbttdyac.supabase.co/functions/v1/rappel-confirmation',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
                },
                body: JSON.stringify({ rdv_id: nouveau.id }),
              },
            )
            console.log('[handleConfirm] Rappel confirmation envoyé (RDV < 24h)')
          } catch (e) {
            console.error('[handleConfirm] Erreur envoi rappel:', e)
          }
        }
      }

      // Demande d'appel : mention bien visible dans la notification
      const mentionAppel = rappel ? `\n📞 ${clientePrenom} souhaite être rappelée !` : ''
      if (nouvelleCliente) {
        envoyerPushNotif(
          pro.id,
          rappel ? '🌸 Nouvelle cliente · 📞 À rappeler' : '🌸 Nouvelle cliente !',
          `${clientePrenom} ${clienteNom} a pris RDV pour ${techniquesStr} le ${formatDateLong(date)} à ${heure}${mentionAppel}`
        )
      } else {
        envoyerPushNotif(
          pro.id,
          rappel ? '🌸 Nouveau RDV · 📞 À rappeler' : '🌸 Nouveau RDV',
          `${clientePrenom} a pris RDV pour ${techniquesStr} le ${formatDateLong(date)} à ${heure}${mentionAppel}`
        )
      }
    } catch (e) {
      console.error('[handleConfirm] Erreur globale:', e)
      alert('Une erreur est survenue. Ouvre la console (F12) pour voir le détail.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Derived ───────────────────────────────────
  // Spécialités dans l'ordre choisi par la pro (celles hors ordre_categories en fin,
  // ordre JSONB conservé entre elles — sort stable)
  const rangCategorie = (nom: string) => {
    const i = ordreCategories.indexOf(nom)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  const specialitesActives = Object.entries(catalogue)
    .filter(([, techs]) => techs.some(t => t.active))
    .map(([nom, techs]) => ({
      nom,
      techniques: techs.filter(t => t.active),
    }))
    .sort((a, b) => rangCategorie(a.nom) - rangCategorie(b.nom))

  const today0 = new Date(todayJs.getFullYear(), todayJs.getMonth(), todayJs.getDate())

  function isAtCurrentMonth() {
    return calYear === todayJs.getFullYear() && calMonth === todayJs.getMonth()
  }

  function prevMonth() {
    if (isAtCurrentMonth()) return
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) }
    else setCalMonth(m => m - 1)
  }

  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) }
    else setCalMonth(m => m + 1)
  }

  const hasSocials = pro?.instagram || pro?.tiktok || pro?.snapchat

  // ─────────────────────────────────────────────
  // Render states
  // ─────────────────────────────────────────────
  if (pageState === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
        <div style={{ textAlign: 'center' }}>
          <Sparkles size={48} color={GLAMIA_PINK} style={{ marginBottom: 16 }} />
          <p style={{ color: PINK, fontWeight: 600, fontSize: 16 }}>Chargement...</p>
        </div>
      </div>
    )
  }

  if (pageState === 'notfound') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#fff' }}>
        <div style={{ textAlign: 'center', maxWidth: 320 }}>
          <Search size={56} color="#9ca3af" style={{ marginBottom: 16 }} />
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1f2937', marginBottom: 8 }}>Page introuvable</h1>
          <p style={{ color: '#6b7280', fontSize: 15 }}>Ce lien de réservation n'existe pas ou a été désactivé.</p>
        </div>
      </div>
    )
  }

  if (pageState === 'blocked') {
    const nomAffiche = pro?.pseudo || pro?.prenom || ''
    const socials = [
      pro?.instagram && { label: 'Instagram', href: `https://instagram.com/${pro.instagram}`, icon: 'Instagram' },
      pro?.tiktok    && { label: 'TikTok',    href: `https://tiktok.com/@${pro.tiktok}`,     icon: 'TikTok' },
      pro?.snapchat  && { label: 'Snapchat',  href: `https://snapchat.com/add/${pro.snapchat}`, icon: 'Snapchat' },
    ].filter(Boolean) as { label: string; href: string; icon: string }[]

    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: PINK_LIGHT }}>
        <div style={{ textAlign: 'center', maxWidth: 360, width: '100%', background: '#fff', borderRadius: 24, padding: 32, boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
          {pro?.photo_url ? (
            <img src={pro.photo_url} alt={nomAffiche} style={{ width: 72, height: 72, borderRadius: 36, objectFit: 'cover', border: `3px solid ${PINK}`, marginBottom: 16 }} />
          ) : (
            <div style={{ width: 72, height: 72, borderRadius: 36, background: PINK_LIGHT, color: PINK, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 28, margin: '0 auto 16px' }}>
              {pro?.prenom?.[0]?.toUpperCase() ?? '?'}
            </div>
          )}
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1f2937', marginBottom: 12 }}>
            La prise de rendez-vous en ligne est indisponible pour le moment.
          </h1>
          <p style={{ fontSize: 15, color: '#6b7280', marginBottom: socials.length > 0 ? 24 : 0, lineHeight: 1.6 }}>
            Contactez <strong style={{ color: '#1f2937' }}>{nomAffiche}</strong> sur ses réseaux sociaux.
          </p>
          {socials.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {socials.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: PINK_LIGHT, color: PINK, borderRadius: 12, padding: '12px 16px', fontWeight: 600, fontSize: 15, textDecoration: 'none' }}
                >
                  <span>{s.icon}</span>
                  <span>{s.label}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (pageState === 'confirmed') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: PINK_LIGHT }}>
        <div style={{ textAlign: 'center', maxWidth: 380, width: '100%', background: '#fff', borderRadius: 24, padding: 32, boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
          <div style={{ width: 80, height: 80, borderRadius: 40, background: PINK_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <CheckCircle size={40} color={GLAMIA_PINK} />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1f2937', marginBottom: 8 }}>Votre RDV est bien enregistré</h1>

          {/* Infos générales */}
          <div style={{ background: PINK_LIGHT, borderRadius: 16, padding: 16, textAlign: 'left', marginBottom: 16 }}>
            {[
              { icon: <User size={18} color={GLAMIA_PINK} />, label: `${clientePrenom} ${clienteNom}` },
              { icon: <Calendar size={18} color={GLAMIA_PINK} />, label: formatDateLong(date) },
              { icon: <Clock size={18} color={GLAMIA_PINK} />, label: `${heure} · ${formatDuree(dureeTotal)}` },
              ...(prixFinal > 0 || prixTotal > 0 ? [{ icon: <CreditCard size={18} color={GLAMIA_PINK} />, label: prixFinal !== prixTotal ? `${prixFinal} €` : `${prixTotal} €` }] : []),
            ].map((row, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{row.icon}</span>
                <span style={{ fontSize: 14, color: '#374151' }}>{row.label}</span>
              </div>
            ))}
          </div>

          {/* Techniques sélectionnées */}
          <div style={{ background: '#f9f9f9', borderRadius: 12, padding: 12, textAlign: 'left', marginBottom: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Prestations
            </p>
            {techniquesSelectionnees.map((t, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '6px 0', borderBottom: i < techniquesSelectionnees.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, color: '#1f2937', fontWeight: 500, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}><SpecialiteIcon specialite={t.categorie} size={16} />{t.nom}</p>
                  <p style={{ fontSize: 11, color: '#888888', margin: '2px 0 0' }}>{t.categorie}</p>
                </div>
                <span style={{ fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap', marginLeft: 8, paddingTop: 2 }}>
                  {t.prix_type === 'a_partir_de' ? `A partir de ${t.prix} €` : (t.prix > 0 ? `${t.prix} €` : '—')} · {formatDuree(t.duree)}
                </span>
              </div>
            ))}
            {/* Fidélité appliquée */}
            {recompenseFidelite && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ background: PINK, color: '#fff', borderRadius: 4, fontSize: 9, fontWeight: 700, padding: '1px 5px' }}>FIDÉLITÉ</span>
                <span style={{ fontSize: 13, color: PINK, fontWeight: 600 }}>
                  {recompenseFidelite.type === 'gratuit' ? 'Offert' : recompenseFidelite.type === 'euros' ? `-${recompenseFidelite.valeur} €` : `-${recompenseFidelite.valeur}%`}
                </span>
              </div>
            )}
            {/* Ligne total */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1.5px solid #e5e7eb', marginTop: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: PINK }}>Total</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: PINK }}>
                {prixFinal !== prixTotal ? (
                  <><span style={{ textDecoration: 'line-through', color: '#9ca3af', fontWeight: 400, marginRight: 4 }}>{prixTotal} €</span>{prixFinal > 0 ? `${prixFinal} €` : 'Offert'} · {formatDuree(dureeTotal)}</>
                ) : (
                  <>{prixTotal > 0 ? `${prixTotal} €` : '—'} · {formatDuree(dureeTotal)}</>
                )}
              </span>
            </div>
          </div>

          {/* Adresse — uniquement sur la page de confirmation, style discret */}
          {pro?.adresse && (
            <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 12px', lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: 4 }}>
              <MapPin size={14} color={GLAMIA_PINK} />{pro.adresse}
            </p>
          )}

          {/* Statut d'envoi des photos d'inspiration */}
          {inspirationsStatut === 'envoyees' && (
            <p style={{ fontSize: 13, color: PINK, fontWeight: 600, margin: '0 0 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <CheckCircle size={15} color={PINK} />
              {inspirations.length > 1
                ? `Tes ${inspirations.length} photos d'inspiration ont été transmises`
                : "Ta photo d'inspiration a été transmise"}
            </p>
          )}
          {inspirationsStatut === 'echec' && (
            <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 12px' }}>
              Tes photos d'inspiration n'ont pas pu être envoyées.
            </p>
          )}

          {/* Note rappel email */}
          <div style={{ background: PINK_LIGHT, borderRadius: 12, padding: 14, marginBottom: 16, textAlign: 'left' }}>
            <p style={{ fontSize: 13, color: '#6b7280', margin: 0, lineHeight: 1.5 }}>
              Vous recevrez un email de confirmation 24h avant votre rendez-vous pour confirmer votre présence.
            </p>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: '8px 0 0', lineHeight: 1.5 }}>
              Si vous ne recevez pas l'email, pensez à vérifier vos spams.
            </p>
          </div>

          <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 32 }}>À bientôt !</p>

          {/* Logo Glamia + slogan */}
          <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 24 }}>
            <p style={{ fontSize: 28, fontWeight: 800, color: PINK, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Glamia</p>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>L'app des professionnelles de la beauté</p>
          </div>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────
  // Main booking UI
  // ─────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f9f9f9', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* ── Header ── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: '1px solid #f3f4f6' }}>
        <div style={{ maxWidth: 480, margin: '0 auto', padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
            {pro?.photo_url ? (
              <img
                src={pro.photo_url}
                alt={pro.prenom}
                style={{ width: 36, height: 36, borderRadius: 18, objectFit: 'cover', border: `2px solid ${PINK}`, flexShrink: 0 }}
              />
            ) : (
              <div style={{ width: 36, height: 36, borderRadius: 18, background: PINK_LIGHT, color: PINK, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, flexShrink: 0 }}>
                {pro?.prenom?.[0]?.toUpperCase()}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              {pro?.pseudo ? (
                <>
                  <p style={{ fontWeight: 700, color: '#1f2937', fontSize: 14, margin: 0 }}>{pro.pseudo}</p>
                  <p style={{ fontSize: 12, color: PINK, margin: '2px 0 0' }}>{pro.prenom}</p>
                </>
              ) : (
                <>
                  <p style={{ fontWeight: 700, color: '#1f2937', fontSize: 14, margin: 0 }}>{pro?.prenom}</p>
                  <p style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0 0' }}>Réservation en ligne</p>
                </>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            {STEP_LABELS.map((_, i) => (
              <div
                key={i}
                style={{
                  flex: 1, height: 4, borderRadius: 2,
                  background: i < step ? PINK : '#e5e7eb',
                  transition: 'background 0.3s',
                }}
              />
            ))}
          </div>
          <p style={{ fontSize: 11, color: PINK, fontWeight: 600, margin: 0 }}>
            Étape {step}/{STEP_LABELS.length} — {STEP_LABELS[step - 1]}
          </p>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth: 480, margin: '0 auto', padding: `24px 16px ${step === 2 ? '220px' : '80px'}` }}>

        {/* ── Bannière pro ── */}
        {(pro?.message_accueil || hasSocials) && (
          <div style={{ textAlign: 'center', marginBottom: 28, paddingBottom: 28, borderBottom: '1px solid #f3f4f6' }}>
            {pro?.message_accueil && (
              <p style={{ fontSize: 16, color: PINK, fontStyle: 'italic', margin: hasSocials ? '0 0 20px' : '0', lineHeight: 1.6 }}>
                {pro.message_accueil}
              </p>
            )}
            {hasSocials && (
              <div>
                <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 12px', fontWeight: 500 }}>Retrouvez-moi sur les réseaux</p>
                <div style={{ display: 'flex', gap: 14, justifyContent: 'center' }}>
                  {pro?.instagram && <SocialLink reseau="instagram" pseudo={pro.instagram} size={36} />}
                  {pro?.tiktok    && <SocialLink reseau="tiktok"    pseudo={pro.tiktok}    size={36} />}
                  {pro?.snapchat  && <SocialLink reseau="snapchat"  pseudo={pro.snapchat}  size={36} />}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ────────────────────────────────────────
            STEP 1 — Identification
        ──────────────────────────────────────── */}
        {step === 1 && (
          <div>
            <h2 style={S.h2}>Bonjour !</h2>
            <p style={S.sub}>Entrez votre numéro pour commencer.</p>

            <label style={S.label}>Téléphone</label>
            <input
              type="tel"
              value={telephone}
              onChange={e => { setTelephone(e.target.value); setPhoneStatus('idle') }}
              placeholder="06 12 34 56 78"
              style={S.input}
              onKeyDown={e => e.key === 'Enter' && handleCheckPhone()}
            />

            {phoneStatus === 'idle' && (
              <button
                onClick={handleCheckPhone}
                disabled={telephone.replace(/\s/g, '').length < 8}
                style={{ ...S.btn, opacity: telephone.replace(/\s/g, '').length < 8 ? 0.5 : 1 }}
              >
                Continuer →
              </button>
            )}

            {phoneStatus === 'checking' && (
              <button style={{ ...S.btn, opacity: 0.7 }} disabled>Vérification...</button>
            )}

            {phoneStatus === 'known' && (
              <div>
                <div style={{ ...S.infoBox, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <User size={28} color={GLAMIA_PINK} />
                  <div>
                    <p style={{ fontWeight: 600, color: '#1f2937', margin: 0 }}>Bonjour {clientePrenom} !</p>
                    <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Vous êtes bien reconnue.</p>
                  </div>
                </div>

                {/* Réduction personnelle accordée par la pro */}
                {reductionCliente && pro && (
                  <div style={{
                    background: 'linear-gradient(135deg, #FFF0F6 0%, #FFF9FB 100%)',
                    border: '1.5px solid #F3D5E4', borderRadius: 16,
                    padding: '14px 16px', marginBottom: 20,
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: 19, background: '#fff',
                      border: `1.5px solid ${PINK}`, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', flexShrink: 0,
                    }}>
                      <Gift size={19} color={PINK} />
                    </div>
                    <p style={{ margin: 0, fontSize: 14, color: '#1f2937', lineHeight: 1.5 }}>
                      <strong>{pro.pseudo || `${pro.prenom} ${pro.nom}`}</strong> vous fait bénéficier
                      d'une réduction personnelle de{' '}
                      <strong style={{ color: PINK }}>
                        −{reductionCliente.valeur}{reductionCliente.type === 'euros' ? ' €' : ' %'}
                      </strong>
                      {reductionCliente.restants == null
                        ? ', appliquée automatiquement à tous vos rendez-vous.'
                        : reductionCliente.restants === 1
                          ? ', appliquée automatiquement à votre prochain rendez-vous.'
                          : `, appliquée automatiquement à vos ${reductionCliente.restants} prochains rendez-vous.`}
                    </p>
                  </div>
                )}

                {/* Carte de fidélité */}
                {fideliteConfig?.active && (
                  <div style={{
                    background: '#FFF9FB', borderRadius: 16, border: '1.5px solid #F4C0D1',
                    padding: 16, marginBottom: 20,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill={PINK} stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                      <span style={{ fontSize: 14, fontWeight: 700, color: PINK }}>Carte de fidélité</span>
                      {/* Récompense du prochain RDV : existante ou palier atteint
                          par le prochain passage — même logique que le prix */}
                      {(() => {
                        const tampons = fideliteFiche?.tampons ?? 0
                        const prochaine = fideliteFiche?.recompense_disponible
                          ?? fideliteConfig.paliers.find(p => p.position === tampons + 1)
                          ?? null
                        if (!prochaine) return null
                        const label = prochaine.type === 'gratuit' ? 'Offert' : `-${prochaine.valeur}${prochaine.type === 'euros' ? '€' : '%'}`
                        return (
                          <span style={{
                            background: PINK, color: '#fff', borderRadius: 10,
                            padding: '2px 8px', fontSize: 10, fontWeight: 700, marginLeft: 'auto',
                          }}>
                            {label} au prochain RDV
                          </span>
                        )
                      })()}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
                      {Array.from({ length: fideliteConfig.nb_ronds }, (_, i) => {
                        const pos = i + 1
                        const tampons = fideliteFiche?.tampons ?? 0
                        const estTamponné = pos <= tampons
                        const palier = fideliteConfig.paliers.find(p => p.position === pos)
                        const palierLabel = palier ? (palier.type === 'gratuit' ? 'Offert' : palier.type === 'euros' ? `-${palier.valeur}€` : `-${palier.valeur}%`) : ''
                        return (
                          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                            <div style={{
                              width: 36, height: 36, borderRadius: 18,
                              border: `${palier ? '2.5px' : '2px'} solid ${estTamponné || palier ? PINK : '#e0d6cf'}`,
                              background: estTamponné ? PINK : '#fff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {estTamponné && (
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="#fff" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                              )}
                            </div>
                            {palier ? (
                              <span style={{ fontSize: 10, fontWeight: 700, color: PINK }}>{palierLabel}</span>
                            ) : (
                              <span style={{ fontSize: 10, color: '#aaa', fontWeight: 600 }}>{pos}</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    {(() => {
                      const tampons = fideliteFiche?.tampons ?? 0
                      const prochainPalier = fideliteConfig.paliers.filter(p => p.position > tampons).sort((a, b) => a.position - b.position)[0]
                      if (!prochainPalier) return null
                      const label = prochainPalier.type === 'gratuit' ? 'offert' : prochainPalier.type === 'euros' ? `-${prochainPalier.valeur}€` : `-${prochainPalier.valeur}%`
                      return (
                        <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 10, marginBottom: 0 }}>
                          Encore {prochainPalier.position - tampons} RDV avant {label}
                        </p>
                      )
                    })()}
                    {fideliteFiche && fideliteFiche.cartes_completees > 0 && (
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#C2779E', backgroundColor: '#FFF0F5', borderRadius: 10, padding: '2px 8px', textAlign: 'center', marginTop: 6, marginBottom: 0, display: 'inline-block' }}>
                        {fideliteFiche.cartes_completees} carte{fideliteFiche.cartes_completees > 1 ? 's' : ''} complétée{fideliteFiche.cartes_completees > 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                )}

                {loadingRdvs ? (
                  <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 14, marginBottom: 16 }}>
                    Chargement de vos rendez-vous...
                  </p>
                ) : rdvsAVenir.length > 0 ? (
                  <div style={{ marginBottom: 20 }}>
                    <p style={{ fontWeight: 700, color: '#1f2937', fontSize: 15, marginBottom: 12 }}>Vos rendez-vous à venir</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {rdvsAVenir.map(rdv => (
                        <div key={rdv.id} style={{ ...S.card }}>
                          {/* Confirmation visuelle reprog */}
                          {reprogDone === rdv.id && (
                            <div ref={confirmationRef} style={{ background: '#ecfdf5', borderRadius: 12, padding: 12, marginBottom: 12, border: '1.5px solid #6ee7b7', textAlign: 'center', scrollMarginTop: 12 }}>
                              <p style={{ margin: 0, fontWeight: 600, color: '#059669', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><CheckCircle size={16} color="#059669" />RDV reprogrammé !</p>
                              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280', textTransform: 'capitalize' }}>
                                {formatRdvDate(rdv.date)} · {formatRdvHeure(rdv.date)}
                              </p>
                            </div>
                          )}

                          {/* Confirmation visuelle modification des prestations */}
                          {modifDone === rdv.id && (
                            <div ref={confirmationRef} style={{ background: '#ecfdf5', borderRadius: 12, padding: 12, marginBottom: 12, border: '1.5px solid #6ee7b7', textAlign: 'center', scrollMarginTop: 12 }}>
                              <p style={{ margin: 0, fontWeight: 600, color: '#059669', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><CheckCircle size={16} color="#059669" />Prestations modifiées !</p>
                              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280' }}>
                                {rdv.technique}{rdv.prix && rdv.prix > 0 ? ` · ${rdv.prix} €` : ''} — un email de confirmation à jour vous a été envoyé
                              </p>
                            </div>
                          )}

                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 12, background: PINK_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <SpecialiteIcon specialite={rdv.specialite} size={20} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ margin: 0, fontWeight: 600, color: '#1f2937', fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {rdv.technique}
                              </p>
                              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280', textTransform: 'capitalize' }}>
                                {formatRdvDate(rdv.date)} · {formatRdvHeure(rdv.date)}{rdv.prix && rdv.prix > 0 ? ` · ${rdv.prix} €` : ''}
                              </p>
                            </div>
                          </div>
                          {/* Modifier les prestations — indisponible sur les RDV liés à une offre */}
                          {!rdv.offre_id && (
                            <button
                              onClick={() => modifRdvId === rdv.id ? fermerModifPresta() : ouvrirModifPresta(rdv)}
                              style={{
                                width: '100%', marginTop: 10, padding: '8px 0', borderRadius: 10,
                                border: `1.5px solid ${PINK}`, background: modifRdvId === rdv.id ? PINK_LIGHT : '#fff',
                                color: PINK, fontSize: 13, fontWeight: 600,
                                cursor: 'pointer', transition: 'all 0.15s',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                              }}
                            >
                              <Sparkles size={14} color={PINK} />
                              Modifier les prestations
                            </button>
                          )}

                          {/* Ajouter / voir ses inspirations */}
                          <button
                            onClick={() => toggleInspis(rdv.id)}
                            style={{
                              width: '100%', marginTop: 10, padding: '8px 0', borderRadius: 10,
                              border: `1.5px solid ${PINK}`, background: inspiRdvId === rdv.id ? PINK_LIGHT : '#fff',
                              color: PINK, fontSize: 13, fontWeight: 600,
                              cursor: 'pointer', transition: 'all 0.15s',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            }}
                          >
                            <Camera size={14} color={PINK} />
                            {(rdv.inspirations?.length ?? 0) >= 3
                              ? 'Mes inspirations (3/3)'
                              : 'Ajouter mes inspirations'}
                          </button>

                          {/* ── Panneau inspirations ── */}
                          {inspiRdvId === rdv.id && (
                            <div style={{
                              background: 'linear-gradient(135deg, #FDF3F8 0%, #FFFFFF 70%)',
                              border: `1.5px solid ${PINK}55`, borderRadius: 12,
                              padding: 12, marginTop: 10,
                            }}>
                              {inspiDone === rdv.id ? (
                                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#059669', display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <CheckCircle size={15} color="#059669" />
                                  Inspirations envoyées ! {pro?.prenom || 'Ta praticienne'} a été prévenue 💅
                                </p>
                              ) : (
                                <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#6b7280', lineHeight: 1.4 }}>
                                  {(rdv.inspirations?.length ?? 0) >= 3
                                    ? 'Tes 3 photos ont bien été transmises 💅'
                                    : `Montre à ${pro?.prenom || 'ta praticienne'} ce que tu as en tête — elle recevra une notification.`}
                                </p>
                              )}
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: inspiDone === rdv.id ? 10 : 0 }}>
                                {(rdv.inspirations ?? []).map((src, i) => (
                                  <img
                                    key={`e${i}`}
                                    src={src}
                                    alt={`Inspiration ${i + 1}`}
                                    style={{ width: 64, height: 64, borderRadius: 10, objectFit: 'cover', border: '1.5px solid #e5e7eb', display: 'block', flexShrink: 0 }}
                                  />
                                ))}
                                {inspiNouvelles.map((src, i) => (
                                  <div key={`n${i}`} style={{ position: 'relative', width: 64, height: 64, flexShrink: 0 }}>
                                    <img
                                      src={src}
                                      alt="Nouvelle inspiration"
                                      style={{ width: 64, height: 64, borderRadius: 10, objectFit: 'cover', border: `1.5px solid ${PINK}`, display: 'block' }}
                                    />
                                    <button
                                      onClick={() => setInspiNouvelles(prev => prev.filter((_, j) => j !== i))}
                                      aria-label="Retirer cette photo"
                                      style={{
                                        position: 'absolute', top: -6, right: -6, width: 20, height: 20,
                                        borderRadius: 10, border: '2px solid #fff', background: '#1f2937',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer', padding: 0,
                                      }}
                                    >
                                      <X size={11} color="#fff" />
                                    </button>
                                  </div>
                                ))}
                                {(rdv.inspirations?.length ?? 0) + inspiNouvelles.length < 3 && (
                                  <>
                                    {/* Importer (le sélecteur mobile propose aussi l'appareil photo) */}
                                    <label style={{
                                      width: 64, height: 64, borderRadius: 10, border: '1.5px dashed #d1d5db',
                                      background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center',
                                      justifyContent: 'center', gap: 2, cursor: inspiCompression ? 'default' : 'pointer',
                                      flexShrink: 0, opacity: inspiCompression ? 0.5 : 1, boxSizing: 'border-box',
                                    }}>
                                      <ImagePlus size={16} color={PINK} />
                                      <span style={{ fontSize: 9, color: '#9ca3af', fontWeight: 600 }}>{inspiCompression ? 'Un instant…' : 'Importer'}</span>
                                      <input type="file" accept="image/*" multiple onChange={e => ajouterInspiFichiers(e, rdv)} disabled={inspiCompression} style={{ display: 'none' }} />
                                    </label>
                                  </>
                                )}
                              </div>
                              {inspiNouvelles.length > 0 && (
                                <button
                                  onClick={() => validerInspis(rdv)}
                                  disabled={inspiEnvoi}
                                  style={{
                                    width: '100%', marginTop: 12, padding: '10px 0', borderRadius: 10,
                                    border: 'none', background: PINK, color: '#fff',
                                    fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
                                    opacity: inspiEnvoi ? 0.6 : 1,
                                  }}
                                >
                                  {inspiEnvoi ? 'Envoi en cours…' : `Valider ${inspiNouvelles.length > 1 ? `mes ${inspiNouvelles.length} photos` : 'ma photo'}`}
                                </button>
                              )}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                            <button
                              onClick={() => ouvrirReprog(rdv.id)}
                              style={{
                                flex: 1, padding: '8px 0', borderRadius: 10,
                                border: `1.5px solid ${PINK}`, background: '#fff',
                                color: PINK, fontSize: 13, fontWeight: 600,
                                cursor: 'pointer', transition: 'all 0.15s',
                              }}
                            >
                              Reprogrammer
                            </button>
                            <button
                              onClick={() => confirmerAnnulation(rdv)}
                              disabled={annulationEnCours === rdv.id}
                              style={{
                                flex: 1, padding: '8px 0', borderRadius: 10,
                                border: '1.5px solid #fca5a5',
                                background: annulationAConfirmer === rdv.id ? '#ef4444' : '#fff',
                                color: annulationAConfirmer === rdv.id ? '#fff' : '#ef4444',
                                fontSize: 13, fontWeight: 600,
                                cursor: 'pointer', opacity: annulationEnCours === rdv.id ? 0.5 : 1,
                                transition: 'all 0.15s',
                              }}
                            >
                              {annulationEnCours === rdv.id ? '...' : annulationAConfirmer === rdv.id ? 'Confirmer ?' : 'Annuler'}
                            </button>
                          </div>

                          {/* ── Panneau modification des prestations ── */}
                          {modifRdvId === rdv.id && (
                            <div ref={modifPanelRef} style={{ marginTop: 16, borderTop: '1px solid #f3f4f6', paddingTop: 16, scrollMarginTop: 12 }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                <p style={{ fontWeight: 700, color: '#1f2937', fontSize: 15, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <Sparkles size={18} color={GLAMIA_PINK} />Vos prestations
                                </p>
                                <button onClick={fermerModifPresta} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 13, fontWeight: 600 }}>
                                  ✕ Fermer
                                </button>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {specialitesActives.map(s => {
                                  const ouvert = modifSections.has(s.nom)
                                  const nbSelec = modifSelection.filter(sel => sel.categorie === s.nom).length
                                  return (
                                    <div key={s.nom} style={{ borderRadius: 14, overflow: 'hidden', border: `1.5px solid ${nbSelec > 0 ? PINK : '#e5e7eb'}`, background: '#fff' }}>
                                      {/* En-tête spécialité — rose + badge ✓ si des techniques y sont choisies */}
                                      <button
                                        onClick={() => toggleModifSection(s.nom)}
                                        style={{
                                          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                                          padding: '11px 12px', background: nbSelec > 0 ? PINK_LIGHT : '#fff',
                                          border: 'none', cursor: 'pointer', textAlign: 'left',
                                        }}>
                                        <SpecialiteIcon specialite={s.nom} size={20} />
                                        <span style={{ flex: 1, fontWeight: 600, fontSize: 14, color: nbSelec > 0 ? PINK : '#1f2937' }}>
                                          {s.nom}
                                        </span>
                                        {nbSelec > 0 && (
                                          <span style={{
                                            background: PINK, color: '#fff', borderRadius: 12,
                                            fontSize: 11, fontWeight: 700, padding: '2px 8px', flexShrink: 0,
                                          }}>
                                            ✓ {nbSelec}
                                          </span>
                                        )}
                                        <span style={{ fontSize: 16, color: nbSelec > 0 ? PINK : '#9ca3af', flexShrink: 0 }}>
                                          {ouvert ? '▾' : '›'}
                                        </span>
                                      </button>
                                      {ouvert && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px 10px', borderTop: '1px solid #f3f4f6' }}>
                                          {s.techniques.map(t => {
                                            const selected = modifSelection.some(sel => sel.nom === t.nom && sel.categorie === s.nom)
                                            return (
                                              <button
                                                key={t.id ?? t.nom}
                                                onClick={() => toggleModifTech(t, s.nom)}
                                                style={{
                                                  display: 'flex', alignItems: 'center', gap: 10,
                                                  padding: '9px 12px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                                                  border: `1.5px solid ${selected ? PINK : '#e5e7eb'}`,
                                                  background: selected ? PINK_LIGHT : '#fff',
                                                }}>
                                                <span style={{
                                                  width: 18, height: 18, borderRadius: 9, flexShrink: 0,
                                                  border: `1.5px solid ${selected ? PINK : '#d1d5db'}`,
                                                  background: selected ? PINK : '#fff',
                                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                  color: '#fff', fontSize: 11, fontWeight: 700,
                                                }}>{selected ? '✓' : ''}</span>
                                                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#1f2937' }}>{t.nom}</span>
                                                <span style={{ fontSize: 12, color: '#6b7280' }}>
                                                  {t.prix > 0 ? `${t.prix} €` : ''}{t.prix > 0 ? ' · ' : ''}{formatDuree(t.duree)}
                                                </span>
                                              </button>
                                            )
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                              {/* Récap + confirmation */}
                              {(() => {
                                const base = modifSelection.reduce((s, t) => s + t.prix, 0)
                                const total = prixApresReducsRdv(base, rdv)
                                const duree = modifSelection.reduce((s, t) => s + t.duree, 0)
                                return (
                                  <div style={{ marginTop: 14 }}>
                                    <p style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: '#1f2937', textAlign: 'center' }}>
                                      {modifSelection.length === 0 ? 'Sélectionnez au moins une prestation' : (
                                        <>
                                          {total !== base && <span style={{ textDecoration: 'line-through', color: '#9ca3af', fontWeight: 400, marginRight: 6 }}>{base} €</span>}
                                          {total > 0 ? `${total} €` : 'Offert'} · {formatDuree(duree)}
                                        </>
                                      )}
                                    </p>
                                    <button
                                      onClick={() => confirmerModifPresta(rdv)}
                                      disabled={modifSaving || modifSelection.length === 0}
                                      style={{
                                        width: '100%', padding: '11px 0', borderRadius: 12, border: 'none',
                                        background: PINK, color: '#fff', fontSize: 14, fontWeight: 700,
                                        cursor: 'pointer', opacity: (modifSaving || modifSelection.length === 0) ? 0.5 : 1,
                                      }}>
                                      {modifSaving ? 'Modification...' : 'Confirmer la modification'}
                                    </button>
                                  </div>
                                )
                              })()}
                            </div>
                          )}

                          {/* ── Sélecteur reprogrammation ── */}
                          {reprogRdvId === rdv.id && (
                            <div ref={reprogPanelRef} style={{ marginTop: 16, borderTop: '1px solid #f3f4f6', paddingTop: 16, scrollMarginTop: 12 }}>
                              {modifPendingTechs && (
                                <div style={{ background: '#FFF8E1', border: '1.5px solid #F5C27A', borderRadius: 12, padding: '10px 12px', marginBottom: 12 }}>
                                  <p style={{ margin: 0, fontSize: 12, color: '#92400E', lineHeight: 1.5 }}>
                                    Vos nouvelles prestations durent plus longtemps ({formatDuree(modifPendingTechs.reduce((s, t) => s + t.duree, 0))})
                                    et ne rentrent plus dans votre créneau actuel. Choisissez un nouvel horaire :
                                  </p>
                                </div>
                              )}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <p style={{ fontWeight: 700, color: '#1f2937', fontSize: 15, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}><Calendar size={18} color={GLAMIA_PINK} />Nouvelle date</p>
                                <button onClick={fermerReprog} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 13, fontWeight: 600 }}>
                                  ✕ Fermer
                                </button>
                              </div>

                              {/* Calendrier reprog */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                <button
                                  onClick={reprogPrevMonth}
                                  disabled={reprogCalYear === todayJs.getFullYear() && reprogCalMonth === todayJs.getMonth()}
                                  style={{ ...S.navBtn, opacity: (reprogCalYear === todayJs.getFullYear() && reprogCalMonth === todayJs.getMonth()) ? 0.3 : 1 }}
                                >‹</button>
                                <span style={{ fontWeight: 600, color: '#1f2937', fontSize: 15, textTransform: 'capitalize' }}>
                                  {MOIS[reprogCalMonth]} {reprogCalYear}
                                </span>
                                <button onClick={reprogNextMonth} style={S.navBtn}>›</button>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
                                {JOURS_COURT.map(j => (
                                  <div key={j} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '3px 0' }}>{j}</div>
                                ))}
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                                {Array.from({ length: getFirstDayOfWeek(reprogCalYear, reprogCalMonth) }).map((_, i) => (
                                  <div key={`re-${i}`} />
                                ))}
                                {Array.from({ length: getDaysInMonth(reprogCalYear, reprogCalMonth) }).map((_, i) => {
                                  const day = i + 1
                                  const dateStr = buildDateStr(reprogCalYear, reprogCalMonth, day)
                                  const dayDate = new Date(reprogCalYear, reprogCalMonth, day)
                                  const isPast = dayDate < today0
                                  const isOff = !isDayWorking(dateStr, pro!.horaires, pro!.horaires_specifiques, pro!.planning_variable) || isDayBlocked(dateStr, pro!.creneaux_bloques)
                                  const isDisabled = isPast || isOff
                                  const isSelected = reprogDate === dateStr

                                  return (
                                    <button
                                      key={day}
                                      onClick={() => { if (!isDisabled) reprogSelectDate(dateStr) }}
                                      disabled={isDisabled}
                                      style={{
                                        aspectRatio: '1', borderRadius: '50%', border: 'none',
                                        background: isSelected ? PINK : isOff && !isPast ? '#E3F2FD' : 'transparent',
                                        color: isSelected ? '#fff' : isPast ? '#d1d5db' : isOff ? '#90CAF9' : '#374151',
                                        fontWeight: 500, fontSize: 13,
                                        cursor: isDisabled ? 'default' : 'pointer',
                                        transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      }}
                                    >
                                      {day}
                                    </button>
                                  )
                                })}
                              </div>

                              {/* Créneaux reprog */}
                              {reprogDate && (
                                <div ref={reprogSlotsRef} style={{ marginTop: 16, scrollMarginTop: 12 }}>
                                  <p style={{ fontWeight: 600, color: '#1f2937', fontSize: 14, margin: '0 0 10px', textTransform: 'capitalize' }}>
                                    <Clock size={14} color={GLAMIA_PINK} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />{formatDateLong(reprogDate)}
                                  </p>
                                  {reprogLoadingSlots ? (
                                    <p style={{ textAlign: 'center', color: PINK, fontSize: 14, fontWeight: 600 }}>Chargement...</p>
                                  ) : reprogSlots.filter(s => s.disponible).length === 0 ? (
                                    <p style={{ textAlign: 'center', color: '#6b7280', fontSize: 14 }}>
                                      Aucun créneau de {formatDuree(rdv.duree)} disponible ce jour.
                                    </p>
                                  ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                                      {reprogSlots.map(s => (
                                        <button
                                          key={s.heure}
                                          disabled={!s.disponible}
                                          onClick={() => { if (s.disponible) { setReprogHeure(s.heure); scrollVers(reprogConfirmRef, 'center') } }}
                                          style={{
                                            padding: '10px 0', borderRadius: 10,
                                            border: `1.5px solid ${!s.disponible ? '#e5e7eb' : reprogHeure === s.heure ? PINK : '#e5e7eb'}`,
                                            background: !s.disponible ? '#f9f9f9' : reprogHeure === s.heure ? PINK : '#fff',
                                            color: !s.disponible ? '#d1d5db' : reprogHeure === s.heure ? '#fff' : '#374151',
                                            fontWeight: 600, fontSize: 13,
                                            cursor: s.disponible ? 'pointer' : 'default',
                                            textDecoration: !s.disponible ? 'line-through' : 'none',
                                            transition: 'all 0.15s',
                                          }}
                                        >
                                          {s.heure}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Bouton confirmer reprog */}
                              {reprogDate && reprogHeure && (
                                <button
                                  ref={reprogConfirmRef}
                                  onClick={handleReprogrammer}
                                  disabled={reprogSaving}
                                  style={{
                                    width: '100%', padding: 14, borderRadius: 12, border: 'none',
                                    background: PINK, color: '#fff', fontWeight: 700, fontSize: 15,
                                    cursor: 'pointer', marginTop: 16,
                                    opacity: reprogSaving ? 0.7 : 1, transition: 'opacity 0.15s',
                                  }}
                                >
                                  {reprogSaving ? (modifPendingTechs ? 'Modification...' : 'Reprogrammation...') : `${modifPendingTechs ? 'Confirmer pour le' : 'Reprogrammer au'} ${formatDateLong(reprogDate)} à ${reprogHeure}`}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ ...S.card, textAlign: 'center', marginBottom: 20, color: '#9ca3af', fontSize: 14 }}>
                    Aucun rendez-vous à venir.
                  </div>
                )}

                {/* Masqué pendant une reprogrammation ou une modification de
                    prestations : ces panneaux ont leur propre bouton de confirmation */}
                {!reprogRdvId && !modifRdvId && (
                  <button onClick={() => setStep(2)} style={S.btn}>
                    + Prendre un nouveau rendez-vous
                  </button>
                )}
              </div>
            )}

            {phoneStatus === 'unknown' && (
              <div>
                <div style={{ ...S.card, marginBottom: 16 }}>
                  <p style={{ fontWeight: 600, color: '#374151', marginBottom: 16, fontSize: 15 }}>
                    Première visite ? Enchanté(e) !
                  </p>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label style={S.label}>Prénom</label>
                      <input type="text" value={clientePrenom} onChange={e => setClientePrenom(e.target.value)} placeholder="Sophie" style={S.input} autoCapitalize="words" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={S.label}>Nom</label>
                      <input type="text" value={clienteNom} onChange={e => setClienteNom(e.target.value)} placeholder="Martin" style={S.input} autoCapitalize="words" />
                    </div>
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <label style={S.label}>Email</label>
                    <input type="email" value={clienteEmail} onChange={e => setClienteEmail(e.target.value)} placeholder="votre@email.com" style={S.input} autoCapitalize="none" />
                    <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0' }}>Pour recevoir votre confirmation de RDV</p>
                  </div>
                </div>

                {/* Carte de fidélité vierge pour nouvelle cliente */}
                {fideliteConfig?.active && (
                  <div style={{
                    background: '#FFF9FB', borderRadius: 16, border: '1.5px solid #F4C0D1',
                    padding: 16, marginBottom: 16,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill={PINK} stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                      <span style={{ fontSize: 14, fontWeight: 700, color: PINK }}>Carte de fidélité</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
                      {Array.from({ length: fideliteConfig.nb_ronds }, (_, i) => {
                        const pos = i + 1
                        const palier = fideliteConfig.paliers.find(p => p.position === pos)
                        const palierLabel = palier ? (palier.type === 'gratuit' ? 'Offert' : palier.type === 'euros' ? `-${palier.valeur}€` : `-${palier.valeur}%`) : ''
                        return (
                          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                            <div style={{
                              width: 36, height: 36, borderRadius: 18,
                              border: `${palier ? '2.5px' : '2px'} solid ${palier ? PINK : '#e0d6cf'}`,
                              background: '#fff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }} />
                            {palier ? (
                              <span style={{ fontSize: 10, fontWeight: 700, color: PINK }}>{palierLabel}</span>
                            ) : (
                              <span style={{ fontSize: 10, color: '#aaa', fontWeight: 600 }}>{pos}</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    {fideliteConfig.paliers.length > 0 && (
                      <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 10, marginBottom: 0 }}>
                        Cumulez des tampons à chaque RDV et profitez de réductions !
                      </p>
                    )}
                  </div>
                )}

                <button
                  onClick={() => { if (clientePrenom.trim() && clienteNom.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clienteEmail.trim())) setStep(2) }}
                  disabled={!clientePrenom.trim() || !clienteNom.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clienteEmail.trim())}
                  style={{ ...S.btn, opacity: (!clientePrenom.trim() || !clienteNom.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clienteEmail.trim())) ? 0.5 : 1 }}
                >
                  Continuer →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ────────────────────────────────────────
            STEP 2 — Techniques multi-select
            (sections accordéon, toutes spécialités)
        ──────────────────────────────────────── */}
        {step === 2 && (
          <div>
            <BackBtn onClick={() => setStep(1)} />

            {/* Offres en cours */}
            {offresEligibles.length > 0 && (
              <OffresSection
                offres={offresEligibles}
                offreAppliquee={offreAppliquee}
                catalogue={catalogue}
                techniquesSelectionnees={techniquesSelectionnees}
                onApply={(o) => {
                  setOffreAppliquee(o)
                  if (o.type === 'pack') {
                    const newTechs: TechSelec[] = []
                    for (const [cat, techs] of Object.entries(catalogue)) {
                      for (const t of techs) {
                        if (o.prestations_ids.includes(t.id)) {
                          newTechs.push({ categorie: cat, nom: t.nom, prix: t.prix, duree: t.duree, prix_type: t.prix_type })
                        }
                      }
                    }
                    setTechniquesSelectionnees(newTechs)
                  }
                  if (o.type === 'prix_fixe') {
                    for (const [cat, techs] of Object.entries(catalogue)) {
                      for (const t of techs) {
                        if (o.prestations_ids.includes(t.id)) {
                          const already = techniquesSelectionnees.some(s => s.nom === t.nom && s.categorie === cat)
                          if (!already) {
                            setTechniquesSelectionnees(prev => [...prev, { categorie: cat, nom: t.nom, prix: t.prix, duree: t.duree, prix_type: t.prix_type }])
                          }
                        }
                      }
                    }
                  }
                  setDate('')
                  setHeure('')
                }}
                onRemove={(o) => {
                  setOffreAppliquee(null)
                  if (o.type === 'pack') {
                    setTechniquesSelectionnees(prev => prev.filter(t => {
                      for (const [cat, techs] of Object.entries(catalogue)) {
                        const match = techs.find(x => o.prestations_ids.includes(x.id) && x.nom === t.nom && cat === t.categorie)
                        if (match) return false
                      }
                      return true
                    }))
                  }
                }}
              />
            )}

            <h2 style={S.h2}>Quelles prestations ?</h2>
            <p style={S.sub}>Sélectionnez une ou plusieurs techniques.</p>

            {specialitesActives.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af' }}>
                Aucune prestation disponible pour le moment.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {specialitesActives.map(s => {
                  const ouvert  = sectionsOuvertes.has(s.nom)
                  const nbSelec = techniquesSelectionnees.filter(t => t.categorie === s.nom).length
                  return (
                    <div key={s.nom} ref={el => { sectionRefs.current[s.nom] = el }} style={{ borderRadius: 16, overflow: 'hidden', border: `1.5px solid ${nbSelec > 0 ? PINK : '#e5e7eb'}`, background: '#fff' }}>
                      {/* En-tête section */}
                      <button
                        onClick={() => toggleSection(s.nom)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                          padding: '14px 16px', background: nbSelec > 0 ? PINK_LIGHT : '#fff',
                          border: 'none', cursor: 'pointer', textAlign: 'left',
                        }}
                      >
                        <SpecialiteIcon specialite={s.nom} size={24} />
                        <span style={{ flex: 1, fontWeight: 600, fontSize: 15, color: nbSelec > 0 ? PINK : '#1f2937' }}>
                          {s.nom}
                        </span>
                        {nbSelec > 0 && (
                          <span style={{
                            background: PINK, color: '#fff', borderRadius: 12,
                            fontSize: 11, fontWeight: 700, padding: '2px 8px', flexShrink: 0,
                          }}>
                            {nbSelec}
                          </span>
                        )}
                        <span style={{ fontSize: 18, color: nbSelec > 0 ? PINK : '#9ca3af', flexShrink: 0 }}>
                          {ouvert ? '▾' : '›'}
                        </span>
                      </button>

                      {/* Techniques dépliées */}
                      {ouvert && (
                        <div style={{ padding: '8px 12px 12px', borderTop: '1px solid #f3f4f6' }}>
                          {s.techniques.map(t => {
                            const selected = techniquesSelectionnees.some(
                              sel => sel.nom === t.nom && sel.categorie === s.nom
                            )
                            // Détails optionnels configurés par la pro (photos / description)
                            const photosTech = (t.photos ?? []).filter(u => typeof u === 'string' && u.trim() !== '').slice(0, 3)
                            const descTech = (t.description ?? '').trim()
                            const aDetails = photosTech.length > 0 || descTech !== ''
                            const depliee = aDetails && techniqueDepliee === t.id
                            return (
                              <div key={t.id} style={{ marginBottom: 6 }}>
                                <button
                                  onClick={() => toggleTechnique(t, s.nom)}
                                  style={{
                                    width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                                    padding: '11px 12px', borderRadius: 12,
                                    border: `1.5px solid ${selected ? PINK : '#e5e7eb'}`,
                                    background: selected ? PINK_LIGHT : '#fafafa',
                                    cursor: 'pointer', textAlign: 'left',
                                  }}
                                >
                                  {/* Checkbox */}
                                  <div style={{
                                    width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                                    border: `2px solid ${selected ? PINK : '#d1d5db'}`,
                                    background: selected ? PINK : 'transparent',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  }}>
                                    {selected && <CheckCircle size={14} color="#fff" />}
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: selected ? PINK : '#1f2937' }}>
                                      {t.nom}
                                    </p>
                                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9ca3af' }}>
                                      {(() => {
                                        // Vérifier si une offre prix_fixe couvre cette technique
                                        const promoOffre = offresEligibles.find(o => o.type === 'prix_fixe' && o.prestations_ids.includes(t.id))
                                        if (promoOffre) {
                                          return (
                                            <>
                                              <span style={{ textDecoration: 'line-through', marginRight: 4 }}>{t.prix} €</span>
                                              <span style={{ color: PINK, fontWeight: 600 }}>{promoOffre.prix_promo} €</span>
                                              {' · '}{formatDuree(t.duree)}
                                            </>
                                          )
                                        }
                                        return <>{t.prix_type === 'a_partir_de' ? `A partir de ${t.prix} €` : (t.prix > 0 ? `${t.prix} €` : 'Gratuit')} · {formatDuree(t.duree)}</>
                                      })()}
                                    </p>
                                    {/* Pastille détails — affordance explicite, tap séparé de la sélection */}
                                    {aDetails && (
                                      <span
                                        onClick={(e) => { e.stopPropagation(); setTechniqueDepliee(prev => (prev === t.id ? null : t.id)) }}
                                        aria-label={depliee ? 'Masquer les détails' : 'Voir les détails'}
                                        style={{
                                          display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8,
                                          padding: photosTech.length > 0 ? '3px 10px 3px 4px' : '3px 10px',
                                          borderRadius: 999,
                                          background: depliee ? PINK_LIGHT : '#fff',
                                          border: `1px solid ${depliee ? PINK : '#e8dce3'}`,
                                          fontSize: 12, fontWeight: 600, color: PINK, cursor: 'pointer',
                                          width: 'fit-content',
                                        }}
                                      >
                                        {photosTech.length > 0 && (
                                          <span style={{ display: 'inline-flex' }}>
                                            {photosTech.map((url, pi) => (
                                              <img
                                                key={pi}
                                                src={url}
                                                alt=""
                                                loading="lazy"
                                                style={{
                                                  width: 22, height: 22, borderRadius: '50%', objectFit: 'cover',
                                                  border: '1.5px solid #fff', marginLeft: pi === 0 ? 0 : -8,
                                                  position: 'relative', zIndex: photosTech.length - pi,
                                                  background: '#f3f4f6',
                                                }}
                                              />
                                            ))}
                                          </span>
                                        )}
                                        En savoir plus
                                        <ChevronDown
                                          size={13}
                                          style={{ transition: 'transform 0.25s ease', transform: depliee ? 'rotate(180deg)' : 'none' }}
                                        />
                                      </span>
                                    )}
                                  </div>
                                </button>
                                {/* Détails dépliables : photos + description */}
                                {aDetails && (
                                  <div style={{
                                    maxHeight: depliee ? 420 : 0, opacity: depliee ? 1 : 0,
                                    overflow: 'hidden', transition: 'max-height 0.3s ease, opacity 0.25s ease',
                                  }}>
                                    <div style={{ margin: '4px 0 2px', padding: 12, borderRadius: 12, background: '#fff', border: '1px solid #f3f4f6' }}>
                                      {photosTech.length > 0 && (
                                        <div style={{ display: 'flex', gap: 8, marginBottom: descTech !== '' ? 10 : 0 }}>
                                          {photosTech.map((url, pi) => (
                                            <img
                                              key={pi}
                                              src={url}
                                              alt={`${t.nom} — photo ${pi + 1}`}
                                              loading="lazy"
                                              onClick={() => setPhotoOverlay({ photos: photosTech, index: pi })}
                                              style={{ width: 92, height: 138, borderRadius: 10, objectFit: 'cover', cursor: 'zoom-in', flexShrink: 0, background: '#f3f4f6' }}
                                            />
                                          ))}
                                        </div>
                                      )}
                                      {descTech !== '' && (
                                        <p style={{ margin: 0, fontSize: 13, color: '#555555', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                                          {descTech}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ────────────────────────────────────────
            STEP 3 — Calendrier
        ──────────────────────────────────────── */}
        {step === 3 && (
          <div>
            <BackBtn onClick={() => setStep(2)} />
            <h2 style={{ ...S.h2, display: 'flex', alignItems: 'center', gap: 8 }}><Calendar size={20} color={GLAMIA_PINK} />Choisissez une date</h2>
            <p style={S.sub}>Sélectionnez un jour disponible.</p>

            {/* Carte premier créneau disponible */}
            {loadingPremierCreneau && (
              <div style={{
                background: PINK_LIGHT, borderRadius: 16, padding: 16, marginBottom: 20,
                border: `1.5px solid ${PINK}`, textAlign: 'center',
              }}>
                <p style={{ fontSize: 14, color: PINK, fontWeight: 600, margin: 0 }}>Recherche du prochain créneau...</p>
              </div>
            )}
            {premierCreneau && !loadingPremierCreneau && (
              <div style={{
                background: PINK_LIGHT, borderRadius: 16, padding: 16, marginBottom: 20,
                border: `1.5px solid ${PINK}`,
              }}>
                <p style={{ fontSize: 13, color: PINK, fontWeight: 600, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Prochain créneau disponible
                </p>
                <p style={{ fontSize: 17, fontWeight: 700, color: '#1f2937', margin: '0 0 4px', textTransform: 'capitalize' }}>
                  {formatDateLong(premierCreneau.date)}
                </p>
                <p style={{ fontSize: 17, fontWeight: 700, color: '#1f2937', margin: '0 0 14px' }}>
                  {premierCreneau.heure}
                </p>
                <button
                  onClick={() => {
                    setDate(premierCreneau.date)
                    setHeure(premierCreneau.heure)
                    setStep(5)
                    setTimeout(() => { step5Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, 100)
                  }}
                  style={{
                    width: '100%', padding: '12px', borderRadius: 12, border: 'none',
                    background: PINK, color: '#fff', fontWeight: 700, fontSize: 15,
                    cursor: 'pointer',
                  }}
                >
                  Prendre ce RDV →
                </button>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <button onClick={prevMonth} disabled={isAtCurrentMonth()} style={{ ...S.navBtn, opacity: isAtCurrentMonth() ? 0.3 : 1 }}>‹</button>
              <span style={{ fontWeight: 600, color: '#1f2937', fontSize: 16, textTransform: 'capitalize' }}>
                {MOIS[calMonth]} {calYear}
              </span>
              <button onClick={nextMonth} style={S.navBtn}>›</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
              {JOURS_COURT.map(j => (
                <div key={j} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#9ca3af', padding: '4px 0' }}>{j}</div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
              {Array.from({ length: getFirstDayOfWeek(calYear, calMonth) }).map((_, i) => (
                <div key={`e-${i}`} />
              ))}
              {Array.from({ length: getDaysInMonth(calYear, calMonth) }).map((_, i) => {
                const day     = i + 1
                const dateStr = buildDateStr(calYear, calMonth, day)
                const dayDate = new Date(calYear, calMonth, day)
                const isPast  = dayDate < today0
                const isOff   = !isDayWorking(dateStr, pro!.horaires, pro!.horaires_specifiques, pro!.planning_variable) || isDayBlocked(dateStr, pro!.creneaux_bloques)
                const isDisabled = isPast || isOff
                const isSelected = date === dateStr

                return (
                  <CalendarDay
                    key={day}
                    day={day}
                    isSelected={isSelected}
                    isPast={isPast}
                    isOff={isOff && !isPast}
                    isDisabled={isDisabled}
                    onClick={() => { if (!isDisabled) { setDate(dateStr); setHeure(''); setStep(4) } }}
                  />
                )
              })}
            </div>

            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 12, height: 12, borderRadius: 6, background: PINK }} />
                <span style={{ fontSize: 12, color: '#6b7280' }}>Sélectionné</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 12, height: 12, borderRadius: 6, background: '#E3F2FD' }} />
                <span style={{ fontSize: 12, color: '#6b7280' }}>Jour off</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 12, height: 12, borderRadius: 6, background: '#e5e7eb' }} />
                <span style={{ fontSize: 12, color: '#6b7280' }}>Passé</span>
              </div>
            </div>
          </div>
        )}

        {/* ────────────────────────────────────────
            STEP 4 — Heure
        ──────────────────────────────────────── */}
        {step === 4 && (
          <div>
            <BackBtn onClick={() => setStep(3)} />
            <h2 style={{ ...S.h2, display: 'flex', alignItems: 'center', gap: 8 }}><Clock size={20} color={GLAMIA_PINK} />Choisissez une heure</h2>
            <p style={{ ...S.sub, textTransform: 'capitalize' }}>{formatDateLong(date)}</p>
            <p style={{ fontSize: 13, color: '#9ca3af', marginTop: -16, marginBottom: 20 }}>
              Durée totale : {formatDuree(dureeTotal)}
            </p>

            {loadingSlots ? (
              <div style={{ textAlign: 'center', padding: '48px 0' }}>
                <p style={{ color: PINK, fontWeight: 600 }}>Chargement des créneaux...</p>
              </div>
            ) : slots.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0' }}>
                <Clock size={40} color="#9ca3af" style={{ marginBottom: 12 }} />
                <p style={{ color: '#6b7280', marginBottom: 16 }}>Aucun créneau de {formatDuree(dureeTotal)} disponible ce jour.</p>
                <button onClick={() => setStep(3)} style={{ color: PINK, fontWeight: 600, fontSize: 14, background: 'none', border: 'none', cursor: 'pointer' }}>
                  ← Choisir une autre date
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {slots.map(s => (
                  <button
                    key={s.heure}
                    disabled={!s.disponible}
                    onClick={() => { if (s.disponible) { setHeure(s.heure); setStep(5); setTimeout(() => { step5Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, 100) } }}
                    style={{
                      padding: '12px 0',
                      borderRadius: 12,
                      border: `1.5px solid ${!s.disponible ? '#e5e7eb' : heure === s.heure ? PINK : '#e5e7eb'}`,
                      background: !s.disponible ? '#f9f9f9' : heure === s.heure ? PINK : '#fff',
                      color: !s.disponible ? '#d1d5db' : heure === s.heure ? '#fff' : '#374151',
                      fontWeight: 600,
                      fontSize: 14,
                      cursor: s.disponible ? 'pointer' : 'default',
                      transition: 'all 0.15s',
                      textDecoration: !s.disponible ? 'line-through' : 'none',
                    }}
                  >
                    {s.heure}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ────────────────────────────────────────
            STEP 5 — Confirmation
        ──────────────────────────────────────── */}
        {step === 5 && (
          <div ref={step5Ref}>
            <BackBtn onClick={() => setStep(4)} />
            <h2 style={{ ...S.h2, display: 'flex', alignItems: 'center', gap: 8 }}><CheckCircle size={20} color={GLAMIA_PINK} />Confirmation</h2>
            <p style={S.sub}>Vérifiez les détails de votre rendez-vous.</p>

            <div style={{ ...S.card, marginBottom: 16 }}>
              <p style={{ fontWeight: 700, color: '#1f2937', fontSize: 15, marginBottom: 16 }}>Récapitulatif</p>

              {/* Infos principales */}
              {[
                { icon: <User size={20} color={GLAMIA_PINK} />, label: 'Cliente',  value: `${clientePrenom} ${clienteNom}` },
                { icon: <Calendar size={20} color={GLAMIA_PINK} />, label: 'Date',     value: formatDateLong(date) },
                { icon: <Clock size={20} color={GLAMIA_PINK} />, label: 'Heure',    value: `${heure} · ${formatDuree(dureeTotal)}` },
                ...(prixFinal > 0 || prixTotal > 0 ? [{
                  icon: <CreditCard size={20} color={GLAMIA_PINK} />,
                  label: 'Total',
                  value: prixFinal !== prixTotal
                    ? <><span style={{ textDecoration: 'line-through', color: '#9ca3af', marginRight: 4 }}>{prixTotal} €</span><span style={{ color: PINK, fontWeight: 700 }}>{prixFinal > 0 ? `${prixFinal} €` : 'Offert'}</span></>
                    : offreAppliquee && prixTotalBrut !== prixTotal
                      ? <><span style={{ textDecoration: 'line-through', color: '#9ca3af', marginRight: 4 }}>{prixTotalBrut} €</span><span style={{ color: PINK, fontWeight: 700 }}>{prixTotal} €</span></>
                      : `${prixTotal} €`
                }] : []),
              ].map((row, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0' }}>
                    <span style={{ width: 26, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{row.icon}</span>
                    <div>
                      <p style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>{row.label}</p>
                      <p style={{ fontSize: 15, color: '#1f2937', fontWeight: 500, margin: '2px 0 0' }}>{row.value}</p>
                    </div>
                  </div>
                  <div style={{ height: 1, background: '#f3f4f6' }} />
                </div>
              ))}

              {/* Techniques sélectionnées */}
              <div style={{ padding: '10px 0' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <span style={{ width: 26, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Sparkles size={20} color={GLAMIA_PINK} /></span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>Prestations</p>
                    {techniquesSelectionnees.map((t, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '6px 0', borderBottom: i < techniquesSelectionnees.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 14, color: '#1f2937', fontWeight: 500, margin: 0 }}>{t.nom}</p>
                          <p style={{ fontSize: 11, color: '#888888', margin: '2px 0 0' }}>{t.categorie}</p>
                        </div>
                        <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 8, whiteSpace: 'nowrap', paddingTop: 2 }}>
                          {t.prix > 0 ? `${t.prix} €` : '—'} · {formatDuree(t.duree)}
                        </span>
                      </div>
                    ))}
                    {/* Offre appliquée */}
                    {offreAppliquee && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                        <span style={{ background: offreAppliquee.type === 'prix_fixe' ? PINK : '#7B1FA2', color: '#fff', borderRadius: 4, fontSize: 9, fontWeight: 700, padding: '1px 5px' }}>
                          {offreAppliquee.type === 'prix_fixe' ? 'PROMO' : 'PACK'}
                        </span>
                        <span style={{ fontSize: 13, color: PINK, fontWeight: 600 }}>{offreAppliquee.nom}</span>
                      </div>
                    )}
                    {/* Fidélité appliquée */}
                    {recompenseFidelite && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                        <span style={{ background: PINK, color: '#fff', borderRadius: 4, fontSize: 9, fontWeight: 700, padding: '1px 5px' }}>FIDÉLITÉ</span>
                        <span style={{ fontSize: 13, color: PINK, fontWeight: 600 }}>
                          {recompenseFidelite.type === 'gratuit' ? 'Offert' : recompenseFidelite.type === 'euros' ? `-${recompenseFidelite.valeur} €` : `-${recompenseFidelite.valeur}%`}
                        </span>
                      </div>
                    )}
                    {/* Ligne total */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: `1.5px solid #e5e7eb`, marginTop: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: PINK }}>Total</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: PINK }}>
                        {prixFinal !== prixTotal ? (
                          <><span style={{ textDecoration: 'line-through', color: '#9ca3af', fontWeight: 400, marginRight: 4 }}>{prixTotal} €</span>{prixFinal > 0 ? `${prixFinal} €` : 'Offert'} · {formatDuree(dureeTotal)}</>
                        ) : offreAppliquee && prixTotalBrut !== prixTotal ? (
                          <><span style={{ textDecoration: 'line-through', color: '#9ca3af', fontWeight: 400, marginRight: 4 }}>{prixTotalBrut} €</span>{prixTotal} € · {formatDuree(dureeTotal)}</>
                        ) : (
                          <>{prixTotal > 0 ? `${prixTotal} €` : '—'} · {formatDuree(dureeTotal)}</>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Glamia Pay : empreinte bancaire / acompte ── */}
            {propay?.actif && propay.client_secret && propay.stripe_account && (
              <div style={{
                background: 'linear-gradient(135deg, #FDF3F8 0%, #FFFFFF 60%)',
                border: `1.5px solid ${PINK}`,
                borderRadius: 16, padding: '14px 14px 16px', marginBottom: 20,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CreditCard size={16} color={PINK} />
                  <label style={{ ...S.label, marginBottom: 0, fontSize: 15, fontWeight: 800, color: '#3a2f36', flex: 1 }}>
                    {propay.mode === 'total' ? 'Prestation' : propay.mode === 'acompte' ? 'Acompte' : 'Empreinte bancaire'}
                  </label>
                  <span style={{
                    background: PINK, color: '#fff', borderRadius: 8,
                    padding: '2px 8px', fontSize: 9, fontWeight: 800, letterSpacing: 0.5,
                    whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    GLAMIA PAY
                  </span>
                </div>
                {/* Montant centré sous le titre — jamais coupé */}
                <div style={{ textAlign: 'center', margin: '4px 0 8px' }}>
                  <span style={{ color: PINK, fontSize: 22, fontWeight: 800, whiteSpace: 'nowrap' }}>
                    {fmtCentimes(propay.acompte ?? 0)}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 10px', lineHeight: 1.45 }}>
                  {propay.mode === 'total'
                    ? <>Réglée maintenant (+{fmtCentimes(propay.frais ?? 0)} de frais de réservation), rien à payer sur place.</>
                    : propay.mode === 'acompte'
                      ? <>Payé maintenant (+{fmtCentimes(propay.frais ?? 0)} de frais de réservation), déduit du prix de ta prestation.</>
                      : <>Rien n&apos;est débité aujourd&apos;hui — uniquement en cas d&apos;absence ou d&apos;annulation à moins de 24 h.</>}
                </p>
                {/* Politique d'annulation mise en avant */}
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  background: '#FDF3F8', border: `1px solid ${PINK}44`, borderRadius: 12,
                  padding: '10px 12px', margin: '0 0 12px',
                }}>
                  <AlertCircle size={16} color={PINK} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 12.5, color: '#4b5563', lineHeight: 1.45 }}>
                    {propay.mode === 'empreinte'
                      ? <><strong style={{ color: '#1f2937' }}>Annulation gratuite jusqu&apos;à 24 h avant le RDV</strong> — passé ce délai ou en cas d&apos;absence, {fmtCentimes((propay.acompte ?? 0) + (propay.frais ?? 0))} pourront être prélevés ({fmtCentimes(propay.acompte ?? 0)} d&apos;empreinte + {fmtCentimes(propay.frais ?? 0)} de frais).</>
                      : <><strong style={{ color: '#1f2937' }}>{propay.mode === 'total' ? 'Paiement remboursé' : 'Acompte remboursé'} à 100 % jusqu&apos;à 24 h avant le RDV</strong> — tu changes de plans ? Annule à plus de 24 h et {propay.mode === 'total' ? 'ton paiement' : 'ton acompte'} de {fmtCentimes(propay.acompte ?? 0)} te revient intégralement (les frais de réservation restent acquis). À moins de 24 h, la somme est conservée par la praticienne.</>}
                  </span>
                </div>
                <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 10px', lineHeight: 1.4 }}>
                  Les cartes émises hors zone euro peuvent entraîner des frais plus élevés.
                </p>
                <Elements
                  stripe={getStripePromise(propay.stripe_account)}
                  options={{ clientSecret: propay.client_secret, locale: 'fr' }}
                >
                  <BlocGlamiaPay
                    ref={propayRef}
                    mode={propay.mode ?? 'empreinte'}
                    nom={`${clientePrenom.trim()} ${clienteNom.trim()}`.trim()}
                    email={clienteEmail.trim()}
                  />
                </Elements>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 11, marginTop: 12, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={propayConsent}
                    onChange={e => setPropayConsent(e.target.checked)}
                    style={{ marginTop: 1, width: 22, height: 22, flexShrink: 0, accentColor: PINK }}
                  />
                  <span style={{ fontSize: 12.5, color: '#4b5563', lineHeight: 1.45 }}>
                    {propay.mode === 'empreinte'
                      ? <>J&apos;autorise le prélèvement de {fmtCentimes(propay.acompte ?? 0)} en cas d&apos;absence ou d&apos;annulation à moins de 24 h.</>
                      : <>J&apos;accepte de régler {fmtCentimes(propay.total_cliente ?? 0)} maintenant, conservés si absence ou annulation à moins de 24 h.</>}
                  </span>
                </label>
              </div>
            )}

            {/* Photos d'inspiration (optionnel) — encadré mis en valeur */}
            <div style={{
              background: 'linear-gradient(135deg, #FDF3F8 0%, #FFFFFF 70%)',
              border: `1.5px solid ${PINK}55`,
              borderRadius: 16, padding: '14px 14px 16px', marginBottom: 20,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <span style={{
                  width: 30, height: 30, borderRadius: '50%', background: PINK, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Sparkles size={15} color="#fff" />
                </span>
                <label style={{ ...S.label, marginBottom: 0 }}>Tes inspirations 💅</label>
              </div>
              <p style={{ fontSize: 13, color: '#6b7280', margin: '6px 0 12px', lineHeight: 1.4 }}>
                Montre à {pro?.prenom || 'ta praticienne'} ce que tu as en tête — ajoute jusqu'à 3 photos (optionnel).
                Pas d'inspi sous la main ? Tu pourras aussi les ajouter plus tard, depuis le lien de gestion de ta résa.
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {inspirations.map((src, i) => (
                <div key={i} style={{ position: 'relative', width: 88, height: 88, flexShrink: 0 }}>
                  <img
                    src={src}
                    alt={`Inspiration ${i + 1}`}
                    style={{ width: 88, height: 88, borderRadius: 12, objectFit: 'cover', border: '1.5px solid #e5e7eb', display: 'block' }}
                  />
                  <button
                    onClick={() => setInspirations(prev => prev.filter((_, j) => j !== i))}
                    aria-label="Supprimer cette photo"
                    style={{
                      position: 'absolute', top: -7, right: -7, width: 22, height: 22,
                      borderRadius: 11, border: '2px solid #fff', background: '#1f2937',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', padding: 0,
                    }}
                  >
                    <X size={12} color="#fff" />
                  </button>
                </div>
              ))}
              {inspirations.length < 3 && (
                <>
                  {/* Importer depuis la galerie (le sélecteur mobile propose aussi l'appareil photo) */}
                  <label style={{
                    width: 88, height: 88, borderRadius: 12, border: '1.5px dashed #d1d5db',
                    background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', gap: 4, cursor: compressionEnCours ? 'default' : 'pointer',
                    flexShrink: 0, opacity: compressionEnCours ? 0.5 : 1, boxSizing: 'border-box',
                  }}>
                    <ImagePlus size={20} color={PINK} />
                    <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>
                      {compressionEnCours ? 'Un instant…' : 'Importer'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleAjoutInspiration}
                      disabled={compressionEnCours}
                      style={{ display: 'none' }}
                    />
                  </label>
                </>
              )}
              </div>
            </div>

            <label style={S.label}>Commentaire (optionnel)</label>
            <textarea
              value={commentaire}
              onChange={e => setCommentaire(e.target.value)}
              placeholder="Informations supplémentaires pour votre praticienne..."
              rows={3}
              style={{ ...S.input, resize: 'none', marginBottom: 16 }}
            />

            <label
              style={{
                display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                padding: 16, borderRadius: 16, border: '1.5px solid #e5e7eb',
                background: '#fff', marginBottom: 24,
              }}
              onClick={() => setRappel(r => !r)}
            >
              <div style={{
                width: 22, height: 22, borderRadius: 6, border: `2px solid ${rappel ? PINK : '#d1d5db'}`,
                background: rappel ? PINK : 'transparent', display: 'flex', alignItems: 'center',
                justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s',
              }}>
                {rappel && <CheckCircle size={14} color="#fff" />}
              </div>
              <span style={{ fontSize: 14, color: '#374151', lineHeight: 1.4 }}>
                Souhaitez-vous être rappelée avant votre rendez-vous ?
              </span>
            </label>

            <button
              onClick={handleConfirm}
              disabled={submitting}
              style={{ ...S.btn, opacity: submitting ? 0.7 : 1, boxShadow: `0 4px 20px ${PINK}55` }}
            >
              {submitting ? 'Enregistrement...' : 'Confirmer ma réservation'}
            </button>

            <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', lineHeight: 1.6, marginTop: 16 }}>
              En confirmant, vous acceptez que vos données soient utilisées
              uniquement dans le cadre de votre rendez-vous.{' '}
              <a
                href="https://booking.glamia.pro/confidentialite"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: PINK, textDecoration: 'underline' }}
              >
                Politique de confidentialité
              </a>
            </p>
          </div>
        )}
      </div>

      {/* ── Sticky footer récap techniques (step 2) ── */}
      {step === 2 && techniquesSelectionnees.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 20,
          background: '#fff', borderTop: '1px solid #f3f4f6',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.08)',
          padding: '12px 16px',
        }}>
          <div style={{ maxWidth: 480, margin: '0 auto' }}>
            {/* Liste des techniques sélectionnées */}
            <div style={{ marginBottom: 10 }}>
              {techniquesSelectionnees.map((t, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ minWidth: 0, overflow: 'hidden' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#1f2937', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', display: 'block' }}>
                      {t.nom}
                    </span>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>{t.categorie}</span>
                  </div>
                  <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 8, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {t.prix_type === 'a_partir_de' ? `A partir de ${t.prix} €` : (t.prix > 0 ? `${t.prix} €` : '—')} · {formatDuree(t.duree)}
                  </span>
                </div>
              ))}
            </div>
            {/* Total + Continuer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: PINK }}>
                {prixFinal !== prixTotal ? (
                  <><span style={{ textDecoration: 'line-through', marginRight: 4, fontWeight: 400, color: '#9ca3af' }}>{prixTotal} €</span>{prixFinal > 0 ? `${prixFinal} €` : 'Offert'}</>
                ) : prixTotal > 0 ? `${prixTotal} €` : '—'} · {formatDuree(dureeTotal)}
              </span>
              <button
                onClick={() => setStep(3)}
                style={{
                  background: PINK, color: '#fff', fontWeight: 700, fontSize: 14,
                  padding: '10px 22px', borderRadius: 22, border: 'none', cursor: 'pointer',
                }}
              >
                Continuer →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visionneuse plein écran — carrousel (glisser pour défiler, tap pour fermer) */}
      {photoOverlay && (
        <div
          onClick={() => setPhotoOverlay(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            zIndex: 9999, cursor: 'zoom-out',
          }}
        >
          <style>{`.carrousel-photos::-webkit-scrollbar{display:none}`}</style>
          {photoOverlay.photos.length > 1 && (
            <p style={{
              position: 'absolute', top: 24, left: 0, right: 0, textAlign: 'center',
              color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: 600, margin: 0,
            }}>
              {photoOverlay.index + 1} / {photoOverlay.photos.length}
            </p>
          )}
          <div
            className="carrousel-photos"
            ref={el => {
              // Positionner le carrousel sur la photo tapée, une seule fois à l'ouverture
              if (el && !el.dataset.init) {
                el.dataset.init = '1'
                el.scrollLeft = photoOverlay.index * el.clientWidth
              }
            }}
            onScroll={e => {
              const el = e.currentTarget
              const i = Math.round(el.scrollLeft / el.clientWidth)
              setPhotoOverlay(prev => (prev && i !== prev.index ? { ...prev, index: i } : prev))
            }}
            style={{
              display: 'flex', overflowX: 'auto', width: '100%',
              scrollSnapType: 'x mandatory', scrollbarWidth: 'none',
            }}
          >
            {photoOverlay.photos.map(url => (
              <div
                key={url}
                style={{
                  flex: '0 0 100%', scrollSnapAlign: 'center', boxSizing: 'border-box',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 20, height: '78vh',
                }}
              >
                <img
                  src={url}
                  alt="Photo de la prestation"
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }}
                />
              </div>
            ))}
          </div>
          <div style={{ position: 'absolute', bottom: 32, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            {photoOverlay.photos.length > 1 && (
              <div style={{ display: 'flex', gap: 7 }}>
                {photoOverlay.photos.map((_, i) => (
                  <span
                    key={i}
                    style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: i === photoOverlay.index ? '#fff' : 'rgba(255,255,255,0.35)',
                    }}
                  />
                ))}
              </div>
            )}
            <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, margin: 0 }}>
              {photoOverlay.photos.length > 1 ? 'Glisse pour défiler · touche pour fermer' : 'Touche pour fermer'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────
// ─── Glamia Pay : Payment Element + confirmation exposée au parent ───────────
// Doit vivre SOUS le provider <Elements> ; le parent déclenche confirmer()
// depuis le bouton Réserver (la carte est validée AVANT la création du RDV).
const BlocGlamiaPay = forwardRef<PropayHandle, { mode: 'empreinte' | 'acompte' | 'total'; nom: string; email: string }>(
  function BlocGlamiaPay({ mode, nom, email }, ref) {
    const stripeJs = useStripe()
    const elements = useElements()

    useImperativeHandle(ref, () => ({
      async confirmer() {
        if (!stripeJs || !elements) {
          return { ok: false, erreur: "Le module de paiement n'est pas prêt. Patiente une seconde et réessaie." }
        }
        // Nom + email fournis ici (on ne les collecte pas dans le Payment Element,
        // ce qui retire l'invite Link « enregistre tes infos »).
        const billing_details = { name: nom || undefined, email: email || undefined }
        if (mode === 'empreinte') {
          const { error, setupIntent } = await stripeJs.confirmSetup({
            elements, redirect: 'if_required',
            confirmParams: { payment_method_data: { billing_details } },
          })
          if (error || !setupIntent) return { ok: false, erreur: error?.message ?? "La carte n'a pas pu être validée." }
          return { ok: true, intentId: setupIntent.id }
        }
        const { error, paymentIntent } = await stripeJs.confirmPayment({
          elements, redirect: 'if_required',
          confirmParams: { payment_method_data: { billing_details } },
        })
        if (error || !paymentIntent) return { ok: false, erreur: error?.message ?? "Le paiement n'a pas abouti." }
        return { ok: true, intentId: paymentIntent.id }
      },
    }), [stripeJs, elements, mode, nom, email])

    return <PaymentElement options={{
      layout: 'tabs',
      // On ne collecte pas nom/email dans l'UI (fournis au confirm) → supprime
      // l'invite Link « enregistre tes infos pour tes prochains paiements ».
      fields: { billingDetails: { name: 'never', email: 'never' } },
    }} />
  },
)

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: PINK, fontWeight: 600, fontSize: 14, padding: '0 0 16px', display: 'block',
      }}
    >
      ← Retour
    </button>
  )
}

function CalendarDay({
  day, isSelected, isPast, isOff, isDisabled, onClick,
}: {
  day: number
  isSelected: boolean
  isPast: boolean
  isOff: boolean
  isDisabled: boolean
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)

  const bg = isSelected
    ? PINK
    : isOff
      ? '#E3F2FD'   // jour off : bleu ciel très clair
      : hovered && !isDisabled
        ? '#F9EEF4'
        : 'transparent'

  const color = isSelected
    ? '#fff'
    : isPast
      ? '#d1d5db'   // passé : gris clair
      : isOff
        ? '#90CAF9'  // off : bleu clair (lisible sur fond bleu ciel)
        : hovered
          ? PINK
          : '#374151'

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={isOff ? 'Jour de repos' : undefined}
      style={{
        aspectRatio: '1', borderRadius: '50%', border: 'none',
        background: bg, color, fontWeight: 500, fontSize: 14,
        cursor: isDisabled ? 'default' : 'pointer',
        transition: 'all 0.15s', display: 'flex', alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {day}
    </button>
  )
}

// ─────────────────────────────────────────────
// Shared styles
// ─────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  h2: {
    fontSize: 24, fontWeight: 700, color: '#1f2937', marginBottom: 4,
  },
  sub: {
    fontSize: 15, color: '#6b7280', marginBottom: 24,
  },
  label: {
    display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8,
  },
  input: {
    width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 16,
    padding: '14px 16px', fontSize: 15, color: '#1f2937',
    outline: 'none', boxSizing: 'border-box', marginBottom: 12,
    background: '#fff', fontFamily: 'inherit',
  },
  btn: {
    width: '100%', padding: '16px', borderRadius: 16, border: 'none',
    background: PINK, color: '#fff', fontWeight: 700, fontSize: 16,
    cursor: 'pointer', transition: 'opacity 0.15s', fontFamily: 'inherit',
  },
  card: {
    background: '#fff', borderRadius: 16, padding: 16,
    border: '1.5px solid #e5e7eb', boxSizing: 'border-box' as const,
  },
  infoBox: {
    background: '#F9EEF4', borderRadius: 16, padding: 16,
  },
  navBtn: {
    width: 36, height: 36, borderRadius: 18, border: '1px solid #e5e7eb',
    background: '#fff', cursor: 'pointer', fontSize: 20, color: '#6b7280',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
}
