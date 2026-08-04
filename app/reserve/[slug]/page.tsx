'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { loadStripe, type Stripe as StripeJs } from '@stripe/stripe-js'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { supabase } from '@/lib/supabase'
import SpecialiteIcon from '@/components/SpecialiteIcon'
import { formatPrix, symboleDevise } from '@/lib/devise';
import {
  generateSlots, isDayBlocked, isDayWorking, timeToMin, minToTime,
  type CreneauBloque, type HorairesHebdo, type HorairesSpecifiques, type Slot,
} from '@/lib/creneaux';
import { User, Calendar, Clock, CreditCard, Lock, MapPin, CheckCircle, AlertCircle, Gift, Sparkles, Search, Camera, ChevronDown, ImagePlus, X } from 'lucide-react'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type Technique = { id: string; nom: string; active: boolean; prix: number; duree: number; description?: string; photos?: string[]; prix_type?: 'fixe' | 'a_partir_de'; quantifiable?: boolean }
type CataloguePrestations = Record<string, Technique[]>

// Technique sélectionnée avec catégorie embarquée (prix/duree unitaires ; quantite = nb d'exemplaires)
type TechSelec = { categorie: string; nom: string; prix: number; duree: number; prix_type?: 'fixe' | 'a_partir_de'; quantifiable?: boolean; quantite?: number }


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

// Les seules colonnes de `profiles` que cette page a le droit de lire.
//
// Elle interroge la base avec la CLÉ PUBLIQUE, celle qui est dans le code du
// site et que tout le monde peut extraire. Un `select('*')` exposait donc, pour
// les 537 profils, les adresses mail, les téléphones, les jetons de
// notification et les dates d'abonnement — à qui savait les demander.
//
// Cette liste est le pendant, côté code, des droits accordés au rôle anonyme
// en base. Les deux doivent rester d'accord : ajouter un champ ici sans
// l'autoriser en base fait échouer TOUTE la requête, page blanche à la clé.
// D'un seul tenant, sans tableau ni concaténation : le client Supabase déduit
// la forme du résultat en LISANT ce texte. Un `join()` ou un `+` lui rendraient
// un `string` quelconque dont il ne peut plus rien tirer, et tous les champs
// deviendraient inconnus à la compilation.
//
// `abonnement_actif` et `trial_ends_at` servent à savoir si la page s'ouvre.
const COLONNES_PUBLIQUES = 'id, prenom, nom, pseudo, slug, created_at, avatar_url, photo_url, message_accueil, adresse, instagram, tiktok, snapchat, horaires, horaires_specifiques, creneaux_bloques, planning_variable, fidelite_config, is_pro, devise, langue, timezone, abonnement_actif, trial_ends_at'

/**
 * Les créneaux d'une ou plusieurs journées, calculés par le serveur.
 *
 * La page ne lit plus les rendez-vous : elle demande des heures libres et n'en
 * apprend pas davantage. Ni qui occupe, ni pour quoi, ni à quel prix.
 */
async function creneauxServeur(
  proId: string, duree: number, dates: string[], exclureRdv?: string,
): Promise<Record<string, Slot[]>> {
  const rep = await fetch('/api/creneaux', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pro_id: proId, duree, dates, exclure_rdv: exclureRdv }),
  })
  if (!rep.ok) throw new Error('creneaux')
  const { creneaux } = await rep.json()
  return (creneaux ?? {}) as Record<string, Slot[]>
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
  devise?: string
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
  techniques: { nom: string; prix: number; duree: number; categorie?: string; quantite?: number }[] | null
  offre_id: string | null
  inspirations: string[] | null
}


// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
// ─── Glamia Pay (acomptes / empreintes à la résa) ────────────────────────────
type PropayInfo = {
  actif: boolean
  mode?: 'empreinte' | 'acompte' | 'total'
  acompte?: number        // centimes
  frais?: number          // toujours 0 depuis le 5 août : la pro absorbe les frais de carte
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

/** Centimes → « 24 € » ou « 24,50 € ». Les montants Stripe sont en centimes. */
const fmtCentimes = (c: number) => `${(c / 100).toFixed(2).replace('.', ',').replace(',00', '')} €`

const PINK = '#C2779E'
const PINK_LIGHT = '#F9EEF4'

// Profondeur de la recherche du prochain créneau libre, en jours. À 30, une
// pro complète jusqu'à début septembre ne renvoyait rien et la carte
// disparaissait sans explication.
const HORIZON_PREMIER_CRENEAU = 90

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
  offres, offreAppliquee, catalogue, techniquesSelectionnees, onApply, onRemove, devise,
}: {
  offres: Offre[]
  offreAppliquee: Offre | null
  catalogue: CataloguePrestations
  techniquesSelectionnees: TechSelec[]
  onApply: (o: Offre) => void
  onRemove: (o: Offre) => void
  devise?: string
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
                    <div style={{ fontSize: 12, color: '#9ca3af', textDecoration: 'line-through' }}>{formatPrix(prixOrig, devise)}</div>
                  )}
                  <div style={{ fontWeight: 700, fontSize: 15, color: PINK }}>{formatPrix(o.prix_promo, devise)}</div>
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
const champAttente: React.CSSProperties = {
  width: '100%', padding: '11px 13px', marginBottom: 10, borderRadius: 10,
  border: '1px solid #e5e7eb', fontSize: 15, outline: 'none', boxSizing: 'border-box',
}

export default function ReservationPage() {
  const params  = useParams()
  const rechercheUrl = useSearchParams()
  const slug    = params.slug as string
  const todayJs = new Date()

  // ── Pro & catalogue ──────────────────────────
  const [pro,        setPro]        = useState<ProInfo | null>(null)
  const [catalogue,  setCatalogue]  = useState<CataloguePrestations>({})
  // Ordre des spécialités choisi par la pro dans l'app (tri via « Trier »)
  const [ordreCategories, setOrdreCategories] = useState<string[]>([])
  const [pageState,  setPageState]  = useState<'loading' | 'ready' | 'notfound' | 'confirmed' | 'blocked'>('loading')
  const [submitting, setSubmitting] = useState(false)

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
  // Liste d'attente, proposée quand la journée choisie est complète.
  const [attenteOuverte, setAttenteOuverte] = useState(false)
  const [attentePrenom, setAttentePrenom] = useState('')
  const [attenteNom, setAttenteNom] = useState('')
  const [attenteTel, setAttenteTel] = useState('')
  const [attenteEmail, setAttenteEmail] = useState('')
  const [attenteEtat, setAttenteEtat] = useState<'repos' | 'envoi' | 'inscrite' | 'erreur'>('repos')

  // Arrivée depuis le bouton du mail : le jour, l'heure et les prestations sont
  // dans le lien. On les repose pour qu'il ne reste que le téléphone à donner —
  // sans ça la cliente refait tout le parcours pour une place qui part vite.
  const repriseFaite = useRef(false)
  const [repriseAttente, setRepriseAttente] = useState(false)

  useEffect(() => {
    if (repriseFaite.current || !pro || Object.keys(catalogue).length === 0) return

    const jourUrl = rechercheUrl.get('jour')
    const heureUrl = rechercheUrl.get('heure')
    if (!jourUrl || !heureUrl) return

    let voulues: { categorie?: string; nom?: string }[] = []
    try { voulues = JSON.parse(rechercheUrl.get('presta') || '[]') } catch { voulues = [] }

    // On retrouve les prestations dans le catalogue de la pro : les prix et les
    // durées viennent de LÀ, jamais du lien, qui pourrait être bricolé.
    const retrouvees: TechSelec[] = []
    for (const v of voulues) {
      for (const [cat, techs] of Object.entries(catalogue)) {
        const t = techs.find(x => x.nom === v?.nom && (!v?.categorie || cat === v.categorie))
        if (t) {
          retrouvees.push({
            categorie: cat, nom: t.nom, prix: t.prix, duree: t.duree,
            prix_type: t.prix_type, quantifiable: t.quantifiable,
          })
          break
        }
      }
    }

    if (retrouvees.length > 0) setTechniquesSelectionnees(retrouvees)
    setDate(jourUrl)
    setHeure(heureUrl)
    setRepriseAttente(retrouvees.length > 0)
    repriseFaite.current = true

    // Le lien porte aussi l'inscription : on récupère son identité pour
    // l'emmener directement à la confirmation. Redemander un téléphone qu'elle
    // vient de donner, pour une place qui part à la première, c'est la perdre.
    const attenteId = rechercheUrl.get('att')
    if (attenteId && retrouvees.length > 0) {
      fetch(`/api/liste-attente?id=${attenteId}`)
        .then(r => (r.ok ? r.json() : null))
        .then(d => {
          if (!d?.telephone) return
          setTelephone(d.telephone)
          if (d.prenom) setClientePrenom(d.prenom)
          if (d.nom) setClienteNom(d.nom)
          if (d.email) setClienteEmail(d.email)
          // Sans nom de famille, la réservation est incomplète : on la laisse
          // à la première étape, où il ne lui manquera que ça.
          if (d.nom && d.email) setStep(5)
        })
        .catch(() => { /* on reste au parcours normal */ })
    }
  }, [pro, catalogue, rechercheUrl])

  const inscrireListeAttente = async () => {
    if (!pro || !date) return
    setAttenteEtat('envoi')
    try {
      const r = await fetch('/api/liste-attente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pro_id: pro.id,
          jour: date,
          duree_min: dureeTotal,
          prenom: attentePrenom,
          nom: attenteNom,
          telephone: attenteTel,
          email: attenteEmail,
          prestations: techniquesSelectionnees.map(t => ({ categorie: t.categorie, nom: t.nom })),
        }),
      })
      if (!r.ok) throw new Error()
      setAttenteEtat('inscrite')
    } catch {
      setAttenteEtat('erreur')
    }
  }

  // Seuls les créneaux réellement réservables sont montrés. Avant, les heures
  // prises restaient affichées en gris pâle : une pro a cru que le site les
  // proposait encore après un rendez-vous. Un mur d'heures inutilisables
  // n'aide personne à choisir. `slots` garde tout, il sert aux calculs.
  const slotsLibres = slots.filter(s => s.disponible)
  // ── Glamia Pay : empreinte/acompte à la confirmation ──
  const [propay, setPropay] = useState<PropayInfo | null>(null)
  const [propayConsent, setPropayConsent] = useState(false)
  const propayRef = useRef<PropayHandle>(null)
  // La pro demande-t-elle un acompte ? Sert à n'afficher l'avertissement
  // d'annulation à moins de 24 h que si un paiement a pu être engagé.
  const [acompteActif, setAcompteActif] = useState(false)

  const [loadingSlots, setLoadingSlots] = useState(false)
  /** L'heure qu'elle avait choisie et qui vient de lui passer sous le nez. */
  const [creneauPerdu, setCreneauPerdu] = useState<string | null>(null)
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
  const [aucunCreneauProche, setAucunCreneauProche] = useState(false)
  // Jours du mois affiché n'ayant AUCUN créneau libre pour la durée choisie.
  const [joursComplets, setJoursComplets] = useState<Set<string>>(new Set())
  const [loadingJoursComplets, setLoadingJoursComplets] = useState(false)

  // ── Totaux calculés (toutes spécialités) ─────
  const dureeTotal = techniquesSelectionnees.reduce((s, t) => s + t.duree * (t.quantite ?? 1), 0)
  const prixTotalBrut = techniquesSelectionnees.reduce((s, t) => s + t.prix * (t.quantite ?? 1), 0)
  const prixTotal = offreAppliquee
    ? offreAppliquee.prix_promo + techniquesSelectionnees.reduce((s, t) => {
        // Trouver si cette technique fait partie de l'offre
        const estDansOffre = Object.entries(catalogue).some(([cat, techs]) =>
          cat === t.categorie && techs.some(x => offreAppliquee.prestations_ids.includes(x.id) && x.nom === t.nom)
        )
        return s + (estDansOffre ? 0 : t.prix * (t.quantite ?? 1))
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

  // ── Rafraîchissement : relire régulièrement plutôt qu'écouter ─────────────
  //
  // La page écoutait les changements en direct (`postgres_changes`) sur le
  // profil et les rendez-vous. Cette écoute exige le droit de LIRE ces tables
  // avec la clé publique — exactement ce qu'on a fermé. Elle était donc déjà
  // muette côté rendez-vous.
  //
  // On relit à la place, mais SEULEMENT là où ça sert :
  //
  // - EN BOUCLE, toutes les 10 secondes, quand la cliente est devant la grille
  //   des créneaux. C'est le seul endroit où une place peut lui passer sous le
  //   nez pendant qu'elle hésite.
  // - UNE FOIS à chaque changement d'étape. Inutile d'y revenir en boucle : le
  //   calcul des créneaux et la vue mois se refont déjà d'eux-mêmes quand
  //   l'étape change.
  // - UNE FOIS au retour sur l'onglet.
  //
  // Rien ne tourne quand la page n'est pas visible. Moins direct qu'une écoute
  // en continu, mais ça ne demande aucun droit de lecture — et la vraie sûreté
  // est ailleurs : le guichet de création refuse un créneau devenu
  // indisponible, même si la grille affichée date.
  //
  // Rien ne tourne quand l'onglet est en arrière-plan : une page de résa
  // laissée ouverte trois jours ne doit pas interroger le serveur pour rien.
  const premierPassage = useRef(true)
  useEffect(() => {
    if (!pro?.id) return

    const rafraichir = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const rep = await fetch('/api/pro', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug }),
        })
        if (!rep.ok) return
        const d = await rep.json()
        if (d.etat !== 'ok' || !d.pro) return
        setPro(prev => prev ? {
          ...prev,
          horaires: d.pro.horaires ?? prev.horaires,
          creneaux_bloques: Array.isArray(d.pro.creneaux_bloques) ? d.pro.creneaux_bloques : prev.creneaux_bloques,
          horaires_specifiques: (d.pro.horaires_specifiques && typeof d.pro.horaires_specifiques === 'object') ? d.pro.horaires_specifiques : prev.horaires_specifiques,
          planning_variable: d.pro.planning_variable === true,
        } : prev)
        // Force le recalcul des créneaux : un RDV a pu être pris entretemps.
        setRdvVersion(v => v + 1)
      } catch { /* réseau : on retentera au tour suivant */ }
    }

    // Une relecture au changement d'étape — sauf tout au début, où la page
    // vient déjà de charger le profil.
    //
    // ET SAUF EN ARRIVANT SUR LA GRILLE DES CRÉNEAUX. Là, le calcul des
    // créneaux vient DÉJÀ d'interroger le serveur avec l'état frais du profil.
    // Relire par-dessus recréait l'objet profil, ce qui relançait le calcul une
    // seconde fois : la cliente voyait la grille se dessiner, disparaître, et
    // se redessiner. C'est ce que Chadi a constaté le 4 août en ouvrant un jour.
    if (premierPassage.current) premierPassage.current = false
    else if (step !== 4) rafraichir()

    // CINQ SECONDES. C'était vingt, pour espacer un clignotement — la grille
    // s'effaçait avant chaque relecture. Ce défaut est corrigé : les créneaux
    // restent affichés pendant le recalcul. La raison de ralentir a disparu,
    // et l'attente entre le moment où la pro bloque un créneau et celui où sa
    // cliente le voit disparaître passe de vingt secondes à cinq.
    //
    // SUR LES DEUX ÉCRANS, pas seulement sur les heures. La boucle ne tournait
    // que devant la grille des créneaux : une pro qui bloquait ou rouvrait une
    // JOURNÉE ENTIÈRE ne voyait pas la case changer de couleur dans le
    // calendrier, qui ne se relisait qu'au changement d'étape. Les deux écrans
    // vivent des mêmes données, ils doivent se rafraîchir tous les deux.
    const minuteur = (step === 3 || step === 4) ? window.setInterval(rafraichir, 5_000) : null
    // `visibilitychange` se déclenche AUSSI quand on quitte la page : sans ce
    // test, on relisait une fois de trop, d'où l'impression de double
    // rafraîchissement.
    const auRetour = () => { if (document.visibilityState === 'visible') rafraichir() }
    document.addEventListener('visibilitychange', auRetour)
    return () => {
      if (minuteur) window.clearInterval(minuteur)
      document.removeEventListener('visibilitychange', auRetour)
    }
  }, [pro?.id, slug, step])

  /** Prévient le téléphone de la pro, sans jamais faire attendre la cliente. */
  function reveillerLaPro(slugPro: string) {
    try {
      fetch('https://gdgfgbxoapgmrbttdyac.supabase.co/functions/v1/reveiller-calendrier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: slugPro }),
        keepalive: true,
      }).catch(() => { /* le réveil est un bonus, jamais une condition */ })
    } catch { /* idem */ }
  }

  async function loadPro() {
    setPageState('loading')
    try {
      // Un seul appel. Le serveur cherche par slug, applique le repli si
      // besoin, refuse de trancher en cas d'ambiguïté, et ne renvoie qu'une
      // pro. La page ne voit plus jamais les autres.
      const rep = await fetch('/api/pro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      })
      if (!rep.ok) throw new Error('api/pro')
      const d = await rep.json()

      if (d.etat === 'introuvable') { setPageState('notfound'); return }

      if (d.etat === 'ferme') {
        // Page fermée (abonnement expiré) : on garde de quoi afficher son nom
        // et ses réseaux, rien de plus.
        setPro({
          id: '', prenom: d.pro?.prenom ?? '', nom: '',
          pseudo: d.pro?.pseudo ?? undefined,
          horaires: DEFAULT_HORAIRES, creneaux_bloques: [], horaires_specifiques: {},
          planning_variable: false,
          instagram: d.pro?.instagram ?? undefined,
          tiktok: d.pro?.tiktok ?? undefined,
          snapchat: d.pro?.snapchat ?? undefined,
        })
        setPageState('blocked')
        return
      }

      const found = d.pro
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
        devise:           found.devise ?? 'EUR',
      })
      if (found.fidelite_config) setFideliteConfig(found.fidelite_config)
      // La pro demande-t-elle un acompte ou une empreinte ? On ne s'en sert que
      // pour dire à la cliente, AVANT qu'elle réserve, ce qui se passe si elle
      // annule à moins de 24 h. Le montant, lui, est décidé par le serveur.
      setAcompteActif(((found.acompte_config as { actif?: boolean } | null)?.actif) === true)

      if (d.catalogue) setCatalogue(d.catalogue as CataloguePrestations)
      if (d.ordreCategories) setOrdreCategories(d.ordreCategories as string[])
      setPageState('ready')

      // ON PRÉVIENT LE TÉLÉPHONE DE LA PRO qu'une cliente est là, pour qu'il
      // relise son calendrier iPhone. Elle peut avoir bloqué son jeudi sans
      // rouvrir Glamia depuis : sans ce signal, la grille affichée ici
      // ignorerait ce blocage jusqu'à ce qu'elle ouvre son app.
      //
      // Le serveur ne réveille QUE cette pro-là, seulement si elle a relié son
      // calendrier, et au plus une fois toutes les cinq minutes. On ne regarde
      // même pas la réponse : la page de résa ne doit jamais dépendre de ça.
      reveillerLaPro(slug)
    } catch (e) {
      console.error('[loadPro]', e)
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
      // Le serveur reconnaît la cliente et ne renvoie qu'ELLE. La page ne voit
      // plus jamais le fichier clientes de la pro.
      const rep = await fetch('/api/cliente/identifier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pro_id: pro.id, telephone: normalized }),
      })
      if (!rep.ok) throw new Error('identification')
      const { cliente: found } = await rep.json()

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
        // ON ATTEND SON DOSSIER AVANT DE L'AFFICHER. Sinon la carte de fidélité
        // se dessinait vide — zéro tampon, puisque la fiche n'était pas encore
        // arrivée — puis se remplissait d'un coup. Court, mais elle voyait sa
        // carte remise à zéro sous ses yeux. Le temps d'attente, lui, ne change
        // pas : c'est le même aller-retour, simplement attendu.
        await chargerDossier(pro.id, found.id)
        setPhoneStatus('known')
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
  // La configuration fidélité arrive désormais AVEC le profil, en un seul
  // appel au guichet. Plus rien à recharger ici : la fonction est gardée
  // parce que ses appelants n'ont plus rien à faire non plus.
  async function chargerFideliteConfig(_proId: string) { /* déjà chargée */ }

  /**
   * Sa fiche de fidélité ET ses rendez-vous à venir, en UN seul aller-retour.
   *
   * C'étaient deux appels au même guichet, avec exactement le même contenu :
   * deux fois le même travail côté serveur, et deux réponses qui arrivaient
   * l'une après l'autre — d'où l'affichage en deux temps.
   */
  async function chargerDossier(proId: string, clienteId: string) {
    setLoadingRdvs(true)
    try {
      // Le guichet revérifie que le téléphone correspond bien à la fiche.
      const rep = await fetch('/api/cliente/dossier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pro_id: proId, cliente_id: clienteId, telephone }),
      })
      if (!rep.ok) throw new Error('dossier')
      const { fidelite, rdvs } = await rep.json()
      setFideliteFiche(fidelite ?? null)
      setRdvsAVenir(rdvs ?? [])
    } catch (e) {
      // Une panne du dossier ne doit pas empêcher de réserver : on la reconnaît
      // quand même, simplement sans sa carte ni ses rendez-vous.
      console.error('[chargerDossier]', e)
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

      // Guichet serveur (chantier RLS) : vérifie que le téléphone fourni est
      // bien celui de la cliente du RDV, PUIS annule et traite fidélité et
      // réduction en service role. Remplace l'écriture anonyme directe, qui
      // laissait annuler le RDV de n'importe qui avec la clé publique.
      const res = await fetch('/api/rdv/annuler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rdv_id: rdvId, telephone }),
      })
      if (!res.ok) throw new Error('annulation_echouee')
      setRdvsAVenir(prev => prev.filter(r => r.id !== rdvId))

      // Carte de fidélité et réduction limitée : entièrement traitées par le
      // guichet ci-dessus. Ne reste ici que la mise à jour de l'AFFICHAGE.
      if (rdv?.reduction_appliquee?.limitee) {
        setReductionCliente(prev => prev
          ? { ...prev, restants: prev.restants != null ? prev.restants + 1 : null }
          : { type: rdv.reduction_appliquee!.type, valeur: rdv.reduction_appliquee!.valeur, restants: 1 })
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

  function confirmerAnnulation(rdv: RdvAVenir) {
    const dateLabel  = formatRdvDate(rdv.date)
    const heureLabel = formatRdvHeure(rdv.date)
    if (window.confirm(`Annuler votre RDV du ${dateLabel} à ${heureLabel} (${rdv.technique}) ?`)) {
      handleAnnulerRdv(rdv.id)
    }
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
      quantite: t.quantite ?? 1,
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

  function toggleModifTech(t: { id?: string; nom: string; prix: number; duree: number; quantifiable?: boolean }, categorie: string) {
    setModifSelection(prev => {
      const dedans = prev.some(s => s.nom === t.nom && s.categorie === categorie)
      return dedans
        ? prev.filter(s => !(s.nom === t.nom && s.categorie === categorie))
        : [...prev, { categorie, nom: t.nom, prix: t.prix, duree: t.duree, quantifiable: t.quantifiable, quantite: 1 }]
    })
  }

  // Choix multiple (modif) : ajuster la quantité d'une prestation (1 à 20)
  function ajusterModifQuantite(nom: string, categorie: string, delta: number) {
    setModifSelection(prev => prev.map(s =>
      s.nom === nom && s.categorie === categorie
        ? { ...s, quantite: Math.min(20, Math.max(1, (s.quantite ?? 1) + delta)) }
        : s
    ))
  }

  // Applique la modification (et éventuellement une nouvelle date/heure)
  async function appliquerModifPresta(rdv: RdvAVenir, techs: TechSelec[], newDate: string | null, newHeure: string | null) {
    if (!pro) return
    const duree = techs.reduce((s, t) => s + t.duree * (t.quantite ?? 1), 0)
    const base = techs.reduce((s, t) => s + t.prix * (t.quantite ?? 1), 0)
    const prix = prixApresReducsRdv(base, rdv)
    const labels = techs.map(t => (t.quantite ?? 1) > 1 ? `${t.nom} ×${t.quantite}` : t.nom).join(', ')
    const specs = [...new Set(techs.map(t => t.categorie))].join(', ')
    const dateISO = newDate && newHeure ? `${newDate}T${newHeure}:00.000Z` : rdv.date
    const dateAffichee = newDate ? formatDateLong(newDate) : formatRdvDate(rdv.date)
    const heureAffichee = newHeure ?? formatRdvHeure(rdv.date)

    // Guichet serveur (chantier RLS) : vérifie le téléphone de la cliente, puis
    // applique la modification. Remplace l'écriture anonyme directe, qui
    // laissait modifier le RDV de n'importe qui avec la clé publique.
    const res = await fetch('/api/rdv/modifier-prestations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rdv_id: rdv.id,
        telephone,
        techniques: techs,
        technique: labels,
        specialite: specs,
        duree,
        prix: prix > 0 ? prix : null,
        new_date: (newDate && newHeure) ? dateISO : undefined,
      }),
    })
    if (!res.ok) throw new Error('modif_echouee')

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
              devise: pro.devise ?? 'EUR',
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
      const nouvelleDuree = modifSelection.reduce((s, t) => s + t.duree * (t.quantite ?? 1), 0)
      if (nouvelleDuree > rdv.duree) {
        const dateStr = (rdv.date as string).slice(0, 10)
        const heureActuelle = formatRdvHeure(rdv.date)
        const creneaux = await creneauxServeur(pro.id, nouvelleDuree, [dateStr], rdv.id)
        const tient = (creneaux[dateStr] ?? []).some(s => s.heure === heureActuelle && s.disponible)
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
      // Durée effective : celle des nouvelles prestations si une modification est en cours
      const dureeEffective = modifPendingTechs
        ? modifPendingTechs.reduce((s, t) => s + t.duree, 0)
        : rdv.duree

      // Le RDV qu'on déplace est exclu côté serveur : son propre créneau ne
      // doit pas se bloquer lui-même.
      const creneaux = await creneauxServeur(pro.id, dureeEffective, [dateStr], reprogRdvId ?? undefined)
      setReprogSlots(creneaux[dateStr] ?? [])
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

      // Guichet serveur (chantier RLS) : vérifie le téléphone de la cliente,
      // puis décale. Remplace l'écriture anonyme directe, qui laissait déplacer
      // le RDV de n'importe qui avec la clé publique.
      const res = await fetch('/api/rdv/decaler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rdv_id: reprogRdvId, telephone, new_date: newDateISO }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        alert(
          d?.error === 'decalage_max_atteint'
            ? 'Ce rendez-vous a déjà été décalé 3 fois. Pour un nouveau changement, contacte directement ta praticienne.'
            : d?.error === 'decalage_tardif'
              ? 'À moins de 24 h du rendez-vous, le décalage en ligne n\'est plus possible. Contacte directement ta praticienne.'
              : 'Impossible de reprogrammer ce rendez-vous.',
        )
        setReprogSaving(false)
        return
      }

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
                devise: pro.devise ?? 'EUR',
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
      return [...prev, { nom: t.nom, prix: t.prix, duree: t.duree, categorie: cat, prix_type: t.prix_type, quantifiable: t.quantifiable, quantite: 1 }]
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

  // Choix multiple : ajuster la quantité d'une prestation sélectionnée (1 à 20)
  function ajusterQuantite(nom: string, cat: string, delta: number) {
    setTechniquesSelectionnees(prev => prev.map(s =>
      s.nom === nom && s.categorie === cat
        ? { ...s, quantite: Math.min(20, Math.max(1, (s.quantite ?? 1) + delta)) }
        : s
    ))
    setDate('')
    setHeure('')
  }

  // ── Step 4 : Load slots ───────────────────────
  // Dépend du step + date (dureeTotal est stable quand on arrive à step 4).
  //
  // `pro` fait AUSSI partie des dépendances, et c'est indispensable : la grille
  // se construit à partir de ses horaires et de ses créneaux bloqués. Sans lui,
  // le message temps réel mettait bien le profil à jour, mais la grille restait
  // celle d'avant — il fallait passer à l'étape suivante et revenir pour la voir
  // changer. Le rafraîchissement automatique ne servait donc à rien.
  //
  // `pro` est un objet recréé à chaque mise à jour, y compris temps réel : c'est
  // exactement le signal qu'on veut. Une lecture des RDV de plus par changement
  // de profil, autant dire jamais.
  useEffect(() => {
    if (step === 4 && date && dureeTotal > 0 && pro) loadSlots()
  }, [step, date, rdvVersion, pro])

  // Le jour auquel appartient la grille affichée. Sert à distinguer un vrai
  // changement de jour d'un simple recalcul.
  const jourDesSlots = useRef<string>('')

  async function loadSlots() {
    if (!pro || dureeTotal === 0 || !date) return
    // ON NE VIDE QUE SI ON CHANGE DE JOUR. Toutes les vingt secondes, le
    // recalcul effaçait la grille avant de la refaire : la cliente voyait ses
    // créneaux disparaître sous ses yeux pendant qu'elle hésitait. Ils restent
    // maintenant affichés pendant qu'on recalcule.
    const nouveauJour = jourDesSlots.current !== date
    if (nouveauJour) {
      setLoadingSlots(true)
      setSlots([])
    }
    try {
      // Appel impossible → on ne propose RIEN plutôt que d'afficher tous les
      // créneaux libres (risque de double réservation). Le catch s'en charge.
      const creneaux = await creneauxServeur(pro.id, dureeTotal, [date])
      const frais = creneaux[date] ?? []
      setSlots(frais)
      jourDesSlots.current = date

      // SON CRÉNEAU VIENT-IL DE PARTIR ? Elle a choisi 14 h 30, une autre
      // cliente l'a pris, ou la pro l'a bloqué. Sans ce contrôle, elle ne
      // l'apprenait qu'à la confirmation, après avoir rempli tout le reste.
      // On la ramène sur la grille et on lui dit, tant qu'il est tôt.
      if (heure && !frais.some(c => c.heure === heure && c.disponible)) {
        setHeure('')
        setCreneauPerdu(heure)
        setStep(4)
      }
    } catch (e) {
      console.error('[loadSlots]', e)
    } finally {
      setLoadingSlots(false)
    }
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
    // total_plein = prix avant la récompense fidélité (Q2) : un RDV OFFERT
    // garde quand même une empreinte basée sur la vraie valeur de la prestation.
    const totalPlein = Math.max(0, prixTotal)
    fetch('/api/propay/intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pro_id: pro.id, total, total_plein: totalPlein }),
    })
      .then(r => r.json())
      .then((d: PropayInfo) => setPropay(d))
      .catch(() => setPropay({ actif: false }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // ── Premier créneau : recherche automatique ──
  useEffect(() => {
    if (step === 3 && pro && dureeTotal > 0) findPremierCreneau()
  }, [step, pro, dureeTotal])

  // ── Jours complets du mois affiché ────────────────────────────────────────
  // Le calendrier ne connaissait que « passé » et « jour off » : un jour plein
  // restait blanc et cliquable, et la cliente arrivait sur une liste de
  // créneaux vide. On charge les RDV du mois en une requête, puis on rejoue
  // localement le MÊME generateSlots que l'écran des heures — deux logiques
  // séparées finiraient tôt ou tard par se contredire.
  //
  // Le résultat dépend de la durée choisie : un jour peut être complet pour
  // une pose de 2 h et libre pour une retouche de 15 min. C'est voulu, et
  // c'est ce que la ligne d'explication sous le titre annonce à la cliente.
  useEffect(() => {
    if (step !== 3 || !pro || dureeTotal === 0) return
    let annule = false

    ;(async () => {
      setLoadingJoursComplets(true)
      try {
        const nbJours = getDaysInMonth(calYear, calMonth)
        const debut = buildDateStr(calYear, calMonth, 1)
        const fin = buildDateStr(calYear, calMonth, nbJours)

        // Les jours off et passés ont déjà leur propre état : les marquer
        // « complet » en plus brouillerait la légende. On ne les demande donc
        // même pas au serveur.
        const maintenant = new Date()
        const debutDuJour = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate())
        const aTester: string[] = []
        for (let jour = 1; jour <= nbJours; jour++) {
          const dateStr = buildDateStr(calYear, calMonth, jour)
          if (new Date(calYear, calMonth, jour) < debutDuJour) continue
          if (!isDayWorking(dateStr, pro.horaires, pro.horaires_specifiques, pro.planning_variable)) continue
          if (isDayBlocked(dateStr, pro.creneaux_bloques)) continue
          aTester.push(dateStr)
        }
        if (annule || aTester.length === 0) return

        // Appel impossible : on ne marque RIEN comme complet. Griser à tort
        // fermerait la porte à des clientes qui pouvaient réserver. Le catch
        // laisse donc l'ensemble vide.
        const creneaux = await creneauxServeur(pro.id, dureeTotal, aTester)
        if (annule) return

        const complets = new Set<string>()
        for (const dateStr of aTester) {
          if (!(creneaux[dateStr] ?? []).some(s => s.disponible)) complets.add(dateStr)
        }
        if (!annule) setJoursComplets(complets)
      } catch (e) {
        console.error('[joursComplets]', e)
      } finally {
        if (!annule) setLoadingJoursComplets(false)
      }
    })()

    return () => { annule = true }
  }, [step, pro, dureeTotal, calYear, calMonth, rdvVersion])

  async function findPremierCreneau() {
    if (!pro || dureeTotal === 0) return
    // On n'affiche « Recherche… » qu'à la PREMIÈRE fois. Sur un
    // rafraîchissement, vider la carte la faisait disparaître puis
    // réapparaître : la cliente voit clignoter, et croit à un bogue. On garde
    // donc le résultat affiché pendant qu'on recalcule.
    if (!premierCreneau && !aucunCreneauProche) setLoadingPremierCreneau(true)

    try {
      const now = new Date()
      const maxDate = new Date(now)
      // 90 jours et non 30 : une pro complète jusqu'à début septembre n'avait
      // AUCUN créneau dans l'ancienne fenêtre, et la carte disparaissait sans
      // un mot — alors que c'est précisément chez les pros très demandées que
      // « prendre le prochain créneau » rend le plus service.
      maxDate.setDate(maxDate.getDate() + HORIZON_PREMIER_CRENEAU)

      // On n'interroge que les jours travaillés et non bloqués : sur 90 jours,
      // ça évite de demander au serveur de calculer des dimanches fermés.
      const aTester: string[] = []
      for (let i = 0; i <= HORIZON_PREMIER_CRENEAU; i++) {
        const d = new Date(now)
        d.setDate(d.getDate() + i)
        const dateStr = buildDateStr(d.getFullYear(), d.getMonth(), d.getDate())
        if (!isDayWorking(dateStr, pro.horaires, pro.horaires_specifiques, pro.planning_variable)) continue
        if (isDayBlocked(dateStr, pro.creneaux_bloques)) continue
        aTester.push(dateStr)
      }

      const creneaux = aTester.length ? await creneauxServeur(pro.id, dureeTotal, aTester) : {}

      let trouve = false
      for (const dateStr of aTester) {
        const available = (creneaux[dateStr] ?? []).find(s => s.disponible)
        if (available) {
          setPremierCreneau({ date: dateStr, heure: available.heure })
          trouve = true
          break
        }
      }
      // Rien trouvé : on le DIT, au lieu de faire disparaître la carte.
      if (!trouve) setPremierCreneau(null)
      setAucunCreneauProche(!trouve)
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

  async function handleConfirm() {
    if (!pro || techniquesSelectionnees.length === 0 || !date || !heure) return
    setSubmitting(true)

    const categories    = [...new Set(techniquesSelectionnees.map(t => t.categorie))]
    const categoriesStr = categories.join(', ')
    const techniquesStr = techniquesSelectionnees.map(t => (t.quantite ?? 1) > 1 ? `${t.nom} ×${t.quantite}` : t.nom).join(', ')

    try {
      // La disponibilité du créneau n'est plus vérifiée ici : le guichet de
      // création la contrôle lui-même, juste avant d'écrire. En deux appels
      // séparés, quelqu'un pouvait prendre la place entre la vérification et
      // l'insertion.
      // ── Glamia Pay : valider la carte AVANT de créer quoi que ce soit ──
      // Dans cet ordre, et pas l'inverse : un rendez-vous créé puis une carte
      // refusée laisserait un créneau pris sans paiement, et la pro devrait
      // faire le ménage à la main.
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
        // Un seul appel : le serveur retrouve la cliente à son numéro, ou la
        // crée. Deux gestes séparés laissaient passer un doublon quand deux
        // réservations partaient en même temps avec le même téléphone.
        const rep = await fetch('/api/cliente/identifier', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pro_id: pro.id, telephone: telNormalized, creer: true,
            prenom: clientePrenom, nom: clienteNom, email: clienteEmail,
          }),
        })
        if (!rep.ok) throw new Error('identification cliente')
        const { cliente: fiche, creee } = await rep.json()

        if (fiche) {
          cId = fiche.id
          nouvelleCliente = creee === true
        }
      }

      // Le serveur crée le rendez-vous et renvoie son identifiant. La page
      // n'insère plus elle-même : l'insertion se terminait par une relecture
      // de la ligne créée, et cette relecture exigeait le droit de lire toute
      // la table.
      const repCreation = await fetch('/api/rdv/creer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pro_id: pro.id,
          cliente_id: cId,
          date, heure, duree: dureeTotal,
          specialite: categoriesStr,
          technique: techniquesStr,
          techniques: techniquesSelectionnees,
          prix: prixFinal,
          notes: commentaire.trim(),
          demande_rappel: rappel,
          fidelite_appliquee: recompenseFidelite ?? null,
          reduction_appliquee: reductionCliente
            ? { type: reductionCliente.type, valeur: reductionCliente.valeur, limitee: reductionCliente.restants != null }
            : null,
        }),
      })
      const creation = await repCreation.json()

      // Créneau devenu indisponible entre l'affichage et la confirmation : on
      // renvoie au choix de l'horaire, avec la raison.
      if (!repCreation.ok || creation?.ok !== true) {
        // SA CARTE A DÉJÀ ÉTÉ VALIDÉE. Le créneau est parti entre-temps — deux
        // clientes au même instant, ou la pro qui vient de le bloquer. On lui
        // rend son argent tout de suite : un paiement sans rendez-vous en face
        // est invisible pour tout le monde, et c'est le pire des cas.
        if (propayIntentId) {
          try {
            await fetch('/api/propay/rembourser-orphelin', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pro_id: pro.id, intent_id: propayIntentId }),
            })
          } catch (e) { console.error('[glamia-pay] remboursement du créneau perdu :', e) }
        }
        alert(propayIntentId
          ? (creation?.message ? `${creation.message} Ton paiement vient d'être annulé.` : "Ce créneau n'est plus disponible. Ton paiement vient d'être annulé — choisis un autre horaire.")
          : (creation?.message || "Ce créneau n'est plus disponible. Choisis-en un autre."))
        setHeure('')
        setStep(4)
        setRdvVersion(v => v + 1)
        return
      }
      const nouveau = { id: creation.id as string }

      // ── Glamia Pay : rattacher le paiement au rendez-vous ──
      // ON INSISTE, jusqu'à trois fois. Un simple hoquet de réseau ici laisserait
      // un paiement encaissé sans aucune trace : de l'argent pris à une cliente
      // que personne ne pourrait relier à quoi que ce soit. Un refus définitif
      // (409) s'arrête net — le serveur a déjà remboursé ce qu'il ne pouvait pas
      // rattacher. L'opération se répète sans dommage : la base refuse le double.
      if (propayIntentId && nouveau?.id) {
        for (let tentative = 0; tentative < 3; tentative++) {
          try {
            const r = await fetch('/api/propay/lier', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pro_id: pro.id, rdv_id: nouveau.id, intent_id: propayIntentId }),
            })
            const d = await r.json().catch(() => ({}))
            if ((r.ok && d?.success) || r.status === 409) break
          } catch (e) {
            console.error(`[glamia-pay] rattachement au RDV (tentative ${tentative + 1}) :`, e)
          }
          await new Promise(res => setTimeout(res, 800))
        }
      }

      // Fidélité — guichet serveur (chantier RLS) : vérifie le téléphone de la
      // cliente, puis applique TOUTE la logique tampon côté serveur (récompense
      // consommée, tampon ajouté, palier atteint). Remplace une dizaine
      // d'écritures anonymes directes sur fidelite_clientes.
      if (cId && fideliteConfig?.active && nouveau?.id) {
        try {
          await fetch('/api/rdv/fidelite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rdv_id: nouveau.id, telephone, recompense_existante: !!recompenseExistante }),
          })
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
              // Recalculer le prix sans offre — guichet serveur (chantier RLS),
              // dernier UPDATE anonyme direct résiduel sur rendez_vous
              await fetch('/api/rdv/retirer-offre', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rdv_id: nouveau.id, telephone, prix: prixTotalBrut > 0 ? prixTotalBrut : null }),
              }).catch(e => console.error('[handleConfirm] retirer-offre:', e))
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
            devise: pro.devise ?? 'EUR',
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
        const heuresAvant = (new Date(`${date}T${heure}:00.000Z`).getTime() - Date.now()) / (60 * 60 * 1000)
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

      // Demande de contact : mention bien visible dans la notification. Le mot
      // suit celui de la case cochée par la cliente — elle a demandé à être
      // « contactée », la pro doit lire la même chose, pas « rappelée ».
      const mentionAppel = rappel ? `\n📞 ${clientePrenom} souhaite être contactée !` : ''
      if (nouvelleCliente) {
        envoyerPushNotif(
          pro.id,
          rappel ? '🌸 Nouvelle cliente · 📞 À contacter' : '🌸 Nouvelle cliente !',
          `${clientePrenom} ${clienteNom} a pris RDV pour ${techniquesStr} le ${formatDateLong(date)} à ${heure}${mentionAppel}`
        )
      } else {
        envoyerPushNotif(
          pro.id,
          rappel ? '🌸 Nouveau RDV · 📞 À contacter' : '🌸 Nouveau RDV',
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
  const todayStr = buildDateStr(todayJs.getFullYear(), todayJs.getMonth(), todayJs.getDate())

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
              ...(prixFinal > 0 || prixTotal > 0 ? [{ icon: <CreditCard size={18} color={GLAMIA_PINK} />, label: prixFinal !== prixTotal ? formatPrix(prixFinal, pro?.devise) : formatPrix(prixTotal, pro?.devise) }] : []),
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
                  <p style={{ fontSize: 14, color: '#1f2937', fontWeight: 500, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}><SpecialiteIcon specialite={t.categorie} size={16} />{t.nom}{(t.quantite ?? 1) > 1 ? ` ×${t.quantite}` : ''}</p>
                  <p style={{ fontSize: 11, color: '#888888', margin: '2px 0 0' }}>{t.categorie}</p>
                </div>
                <span style={{ fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap', marginLeft: 8, paddingTop: 2 }}>
                  {t.prix_type === 'a_partir_de' ? `A partir de ${formatPrix(t.prix * (t.quantite ?? 1), pro?.devise)}` : (t.prix > 0 ? formatPrix(t.prix * (t.quantite ?? 1), pro?.devise) : '—')} · {formatDuree(t.duree * (t.quantite ?? 1))}
                </span>
              </div>
            ))}
            {/* Fidélité appliquée */}
            {recompenseFidelite && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ background: PINK, color: '#fff', borderRadius: 4, fontSize: 9, fontWeight: 700, padding: '1px 5px' }}>FIDÉLITÉ</span>
                <span style={{ fontSize: 13, color: PINK, fontWeight: 600 }}>
                  {recompenseFidelite.type === 'gratuit' ? 'Offert' : recompenseFidelite.type === 'euros' ? `-${formatPrix(recompenseFidelite.valeur, pro?.devise)}` : `-${recompenseFidelite.valeur}%`}
                </span>
              </div>
            )}
            {/* Réduction personnelle (badge cliente) — vert émeraude, distinct du rose fidélité */}
            {reductionCliente && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ background: '#0E9E6E', color: '#fff', borderRadius: 4, fontSize: 9, fontWeight: 700, padding: '1px 5px' }}>RÉDUCTION</span>
                <span style={{ fontSize: 13, color: '#0E9E6E', fontWeight: 600 }}>
                  {reductionCliente.type === 'euros' ? `-${formatPrix(reductionCliente.valeur, pro?.devise)}` : `-${reductionCliente.valeur}%`}
                </span>
              </div>
            )}
            {/* Ligne total */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1.5px solid #e5e7eb', marginTop: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: PINK }}>Total</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: PINK }}>
                {prixFinal !== prixTotal ? (
                  <><span style={{ textDecoration: 'line-through', color: '#9ca3af', fontWeight: 400, marginRight: 4 }}>{formatPrix(prixTotal, pro?.devise)}</span>{prixFinal > 0 ? formatPrix(prixFinal, pro?.devise) : 'Offert'} · {formatDuree(dureeTotal)}</>
                ) : (
                  <>{prixTotal > 0 ? formatPrix(prixTotal, pro?.devise) : '—'} · {formatDuree(dureeTotal)}</>
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
                        −{reductionCliente.valeur}{reductionCliente.type === 'euros' ? ` ${symboleDevise(pro?.devise)}` : ' %'}
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
                        const label = prochaine.type === 'gratuit' ? 'Offert' : prochaine.type === 'euros' ? `-${formatPrix(prochaine.valeur, pro?.devise)}` : `-${prochaine.valeur}%`
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
                        const palierLabel = palier ? (palier.type === 'gratuit' ? 'Offert' : palier.type === 'euros' ? `-${formatPrix(palier.valeur, pro?.devise)}` : `-${palier.valeur}%`) : ''
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
                      const label = prochainPalier.type === 'gratuit' ? 'offert' : prochainPalier.type === 'euros' ? `-${formatPrix(prochainPalier.valeur, pro?.devise)}` : `-${prochainPalier.valeur}%`
                      // « Encore 2 RDV avant -10 € » laissait croire que la
                      // réduction tombait au rendez-vous SUIVANT le palier.
                      // Elle tombe sur celui-là. On nomme donc le rendez-vous
                      // concerné au lieu de compter ce qui reste avant.
                      //
                      // Même formulation que dans l'app, corrigée le matin
                      // même : les deux écrans montrent la même carte à la
                      // même personne, ils doivent dire la même chose.
                      const n = prochainPalier.position - tampons
                      return (
                        <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 10, marginBottom: 0 }}>
                          {n === 1 ? `Prochain RDV : ${label}` : `${label} sur ton ${n}e RDV`}
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
                                {rdv.technique}{rdv.prix && rdv.prix > 0 ? ` · ${formatPrix(rdv.prix, pro?.devise)}` : ''} — un email de confirmation à jour vous a été envoyé
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
                                {formatRdvDate(rdv.date)} · {formatRdvHeure(rdv.date)}{rdv.prix && rdv.prix > 0 ? ` · ${formatPrix(rdv.prix, pro?.devise)}` : ''}
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
                                    <label style={{
                                      width: 64, height: 64, borderRadius: 10, border: '1.5px dashed #d1d5db',
                                      background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center',
                                      justifyContent: 'center', gap: 2, cursor: inspiCompression ? 'default' : 'pointer',
                                      flexShrink: 0, opacity: inspiCompression ? 0.5 : 1, boxSizing: 'border-box',
                                    }}>
                                      <Camera size={16} color={PINK} />
                                      <span style={{ fontSize: 9, color: '#9ca3af', fontWeight: 600 }}>Prendre</span>
                                      <input type="file" accept="image/*" capture="environment" onChange={e => ajouterInspiFichiers(e, rdv)} disabled={inspiCompression} style={{ display: 'none' }} />
                                    </label>
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
                                border: '1.5px solid #fca5a5', background: '#fff',
                                color: '#ef4444', fontSize: 13, fontWeight: 600,
                                cursor: 'pointer', opacity: annulationEnCours === rdv.id ? 0.5 : 1,
                                transition: 'all 0.15s',
                              }}
                            >
                              {annulationEnCours === rdv.id ? '...' : 'Annuler'}
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
                                            const selM = modifSelection.find(sel => sel.nom === t.nom && sel.categorie === s.nom)
                                            const selected = selM !== undefined
                                            const quantite = selM?.quantite ?? 1
                                            return (
                                              <div key={t.id ?? t.nom}>
                                              <button
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
                                                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#1f2937' }}>{t.nom}{selected && t.quantifiable && quantite > 1 ? ` ×${quantite}` : ''}</span>
                                                <span style={{ fontSize: 12, color: '#6b7280' }}>
                                                  {t.prix > 0 ? formatPrix(t.prix * quantite, pro?.devise) : ''}{t.prix > 0 ? ' · ' : ''}{formatDuree(t.duree * quantite)}
                                                </span>
                                              </button>
                                              {selected && t.quantifiable && (
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '6px 12px 2px', background: PINK_LIGHT, borderRadius: 10, marginTop: 4 }}>
                                                  <button type="button" onClick={() => ajusterModifQuantite(t.nom, s.nom, -1)} disabled={quantite <= 1}
                                                    style={{ width: 26, height: 26, border: 'none', background: 'transparent', fontSize: 19, fontWeight: 700, color: quantite <= 1 ? '#d6c2ce' : PINK, cursor: quantite <= 1 ? 'default' : 'pointer', lineHeight: 1 }}>−</button>
                                                  <span style={{ minWidth: 18, textAlign: 'center', fontWeight: 700, fontSize: 14, color: '#1f2937' }}>{quantite}</span>
                                                  <button type="button" onClick={() => ajusterModifQuantite(t.nom, s.nom, 1)} disabled={quantite >= 20}
                                                    style={{ width: 26, height: 26, border: 'none', background: 'transparent', fontSize: 19, fontWeight: 700, color: quantite >= 20 ? '#d6c2ce' : PINK, cursor: quantite >= 20 ? 'default' : 'pointer', lineHeight: 1 }}>+</button>
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
                              {/* Récap + confirmation */}
                              {(() => {
                                const base = modifSelection.reduce((s, t) => s + t.prix * (t.quantite ?? 1), 0)
                                const total = prixApresReducsRdv(base, rdv)
                                const duree = modifSelection.reduce((s, t) => s + t.duree * (t.quantite ?? 1), 0)
                                return (
                                  <div style={{ marginTop: 14 }}>
                                    <p style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: '#1f2937', textAlign: 'center' }}>
                                      {modifSelection.length === 0 ? 'Sélectionnez au moins une prestation' : (
                                        <>
                                          {total !== base && <span style={{ textDecoration: 'line-through', color: '#9ca3af', fontWeight: 400, marginRight: 6 }}>{formatPrix(base, pro?.devise)}</span>}
                                          {total > 0 ? formatPrix(total, pro?.devise) : 'Offert'} · {formatDuree(duree)}
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
                                        aspectRatio: '1', borderRadius: '50%', boxSizing: 'border-box',
                                        border: `1.5px solid ${dateStr === todayStr && !isSelected ? PINK : 'transparent'}`,
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
                                      {reprogSlots.filter(s => s.disponible).map(s => (
                                        <button
                                          key={s.heure}
                                          onClick={() => { setReprogHeure(s.heure); scrollVers(reprogConfirmRef, 'center') }}
                                          style={{
                                            padding: '10px 0', borderRadius: 10,
                                            border: `1.5px solid ${reprogHeure === s.heure ? PINK : '#e5e7eb'}`,
                                            background: reprogHeure === s.heure ? PINK : '#fff',
                                            color: reprogHeure === s.heure ? '#fff' : '#374151',
                                            fontWeight: 600, fontSize: 13,
                                            cursor: 'pointer',
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
                  <button onClick={() => setStep(repriseAttente ? 5 : 2)} style={S.btn}>
                    {repriseAttente ? 'Confirmer cette place' : '+ Prendre un nouveau rendez-vous'}
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
                        const palierLabel = palier ? (palier.type === 'gratuit' ? 'Offert' : palier.type === 'euros' ? `-${formatPrix(palier.valeur, pro?.devise)}` : `-${palier.valeur}%`) : ''
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
                  onClick={() => { if (clientePrenom.trim() && clienteNom.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clienteEmail.trim())) setStep(repriseAttente ? 5 : 2) }}
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
                devise={pro?.devise}
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
                            const selT = techniquesSelectionnees.find(
                              sel => sel.nom === t.nom && sel.categorie === s.nom
                            )
                            const selected = selT !== undefined
                            const quantite = selT?.quantite ?? 1
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
                                              <span style={{ textDecoration: 'line-through', marginRight: 4 }}>{formatPrix(t.prix, pro?.devise)}</span>
                                              <span style={{ color: PINK, fontWeight: 600 }}>{formatPrix(promoOffre.prix_promo, pro?.devise)}</span>
                                              {' · '}{formatDuree(t.duree)}
                                            </>
                                          )
                                        }
                                        return <>{t.prix_type === 'a_partir_de' ? `A partir de ${formatPrix(t.prix, pro?.devise)}` : (t.prix > 0 ? formatPrix(t.prix, pro?.devise) : 'Gratuit')} · {formatDuree(t.duree)}</>
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
                                {selected && t.quantifiable && (
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 12px 2px 44px' }}>
                                    <span style={{ fontSize: 13, color: '#6b7280' }}>
                                      Quantité · {formatPrix(t.prix * quantite, pro?.devise)} · {formatDuree(t.duree * quantite)}
                                    </span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: PINK_LIGHT, borderRadius: 10, padding: '2px 6px' }}>
                                      <button type="button" onClick={() => ajusterQuantite(t.nom, s.nom, -1)} disabled={quantite <= 1}
                                        style={{ width: 28, height: 28, border: 'none', background: 'transparent', fontSize: 20, fontWeight: 700, color: quantite <= 1 ? '#d6c2ce' : PINK, cursor: quantite <= 1 ? 'default' : 'pointer', lineHeight: 1 }}>−</button>
                                      <span style={{ minWidth: 18, textAlign: 'center', fontWeight: 700, fontSize: 15, color: '#1f2937' }}>{quantite}</span>
                                      <button type="button" onClick={() => ajusterQuantite(t.nom, s.nom, 1)} disabled={quantite >= 20}
                                        style={{ width: 28, height: 28, border: 'none', background: 'transparent', fontSize: 20, fontWeight: 700, color: quantite >= 20 ? '#d6c2ce' : PINK, cursor: quantite >= 20 ? 'default' : 'pointer', lineHeight: 1 }}>+</button>
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
            {/* La durée est rappelée ici en permanence : c'est elle qui décide
                quels jours sont complets. Sans ce rappel, une cliente qui
                revient changer sa prestation verrait le calendrier se
                remplir ou se vider sans comprendre pourquoi. */}
            <p style={S.sub}>
              Disponibilités pour une durée de {formatDuree(dureeTotal)}.
              {loadingJoursComplets && ' Vérification des jours complets…'}
            </p>

            {/* Carte premier créneau disponible */}
            {loadingPremierCreneau && (
              <div style={{
                background: PINK_LIGHT, borderRadius: 16, padding: 16, marginBottom: 20,
                border: `1.5px solid ${PINK}`, textAlign: 'center',
              }}>
                <p style={{ fontSize: 14, color: PINK, fontWeight: 600, margin: 0 }}>Recherche du prochain créneau...</p>
              </div>
            )}
            {aucunCreneauProche && !loadingPremierCreneau && (
              <div style={{
                background: '#FFF8E7', borderRadius: 16, padding: 16, marginBottom: 20,
                border: '1.5px solid #f0e0b8',
              }}>
                <p style={{ fontSize: 14, color: '#8a6d3b', fontWeight: 600, margin: 0, lineHeight: 1.5 }}>
                  Aucun créneau disponible dans les 3 prochains mois pour cette durée.
                  Parcourez le calendrier ou contactez-la directement.
                </p>
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
                const isComplet = joursComplets.has(dateStr)
                // Un jour complet reste CLIQUABLE : c'est justement là qu'on
                // propose la liste d'attente. Il garde son apparence « complet »
                // pour ne pas faire espérer un créneau, mais la porte est ouverte.
                const isDisabled = isPast || isOff
                const isSelected = date === dateStr

                return (
                  <CalendarDay
                    key={day}
                    day={day}
                    isSelected={isSelected}
                    isToday={dateStr === todayStr}
                    isPast={isPast}
                    isOff={isOff && !isPast}
                    isComplet={isComplet}
                    isDisabled={isDisabled}
                    onClick={() => { if (!isDisabled) { setDate(dateStr); setHeure(''); setAttenteOuverte(false); setAttenteEtat('repos'); setStep(4) } }}
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
              {/* « Complet » disait seulement de renoncer. Il faut qu'il dise
                  aussi qu'on peut y faire quelque chose, sinon personne ne
                  cliquera jamais sur un jour rose. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 12, height: 12, borderRadius: 6, background: '#F3E4EC' }} />
                <span style={{ fontSize: 12, color: '#6b7280' }}>
                  Complet — <span style={{ color: PINK, fontWeight: 600 }}>cliquez pour être prévenue</span>
                </span>
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

            {creneauPerdu && (
              <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: '#FEF3F2', border: '1px solid #FECDCA', borderRadius: 12, padding: '11px 13px', marginBottom: 16, textAlign: 'left' }}>
                <AlertCircle size={17} color="#B42318" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ margin: 0, color: '#B42318', fontSize: 13.5, lineHeight: 1.45 }}>
                  Le créneau de {creneauPerdu} vient d&apos;être pris. Choisissez-en un autre.
                </p>
              </div>
            )}

            {loadingSlots ? (
              <div style={{ textAlign: 'center', padding: '48px 0' }}>
                <p style={{ color: PINK, fontWeight: 600 }}>Chargement des créneaux...</p>
              </div>
            ) : slotsLibres.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <Clock size={40} color="#9ca3af" style={{ marginBottom: 12 }} />
                <p style={{ color: '#6b7280', marginBottom: 20 }}>Aucun créneau de {formatDuree(dureeTotal)} disponible ce jour.</p>

                {/* Journée complète : plutôt que de la renvoyer chercher ailleurs,
                    on lui propose d'être prévenue si une place se libère. */}
                {attenteEtat === 'inscrite' ? (
                  <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 14, padding: '18px 20px', maxWidth: 420, margin: '0 auto 18px' }}>
                    <p style={{ margin: 0, fontWeight: 700, color: '#166534', fontSize: 15 }}>C&apos;est noté</p>
                    <p style={{ margin: '6px 0 0', color: '#15803d', fontSize: 14, lineHeight: 1.5 }}>
                      Vous recevrez un e-mail si une place se libère ce jour-là. La place part à la première qui réserve.
                    </p>
                  </div>
                ) : attenteOuverte ? (
                  <div style={{ background: '#fff', border: `1.5px solid ${PINK}`, borderRadius: 14, padding: 18, maxWidth: 420, margin: '0 auto 18px', textAlign: 'left' }}>
                    <p style={{ margin: '0 0 4px', fontWeight: 700, color: '#1f2937', fontSize: 15 }}>
                      Être prévenue si une place se libère
                    </p>
                    <p style={{ margin: '0 0 14px', color: '#9ca3af', fontSize: 13, lineHeight: 1.5 }}>
                      {attentePrenom && attenteNom && attenteEmail
                        ? 'Vérifiez vos coordonnées et validez.'
                        : 'Laissez vos coordonnées, on vous écrit dès qu\'une place se libère.'}
                    </p>
                    <input value={attentePrenom} onChange={e => setAttentePrenom(e.target.value)} placeholder="Prénom"
                      style={champAttente} />
                    <input value={attenteNom} onChange={e => setAttenteNom(e.target.value)} placeholder="Nom"
                      style={champAttente} />
                    <input value={attenteTel} onChange={e => setAttenteTel(e.target.value)} placeholder="Téléphone" inputMode="tel"
                      style={champAttente} />
                    <input value={attenteEmail} onChange={e => setAttenteEmail(e.target.value)} placeholder="E-mail" inputMode="email"
                      style={champAttente} />
                    {attenteEtat === 'erreur' && (
                      <p style={{ color: '#c62828', fontSize: 13, margin: '0 0 10px' }}>
                        Vérifiez le prénom, le téléphone et l&apos;e-mail, puis réessayez.
                      </p>
                    )}
                    <button
                      onClick={inscrireListeAttente}
                      disabled={attenteEtat === 'envoi'}
                      style={{
                        width: '100%', padding: '13px 0', borderRadius: 12, border: 'none',
                        background: PINK, color: '#fff', fontWeight: 700, fontSize: 15,
                        cursor: attenteEtat === 'envoi' ? 'default' : 'pointer', opacity: attenteEtat === 'envoi' ? 0.6 : 1,
                      }}>
                      {attenteEtat === 'envoi' ? 'Enregistrement…' : 'Me prévenir'}
                    </button>
                    <p style={{ margin: '10px 0 0', color: '#9ca3af', fontSize: 12, lineHeight: 1.5 }}>
                      Vos coordonnées servent uniquement à vous prévenir pour ce jour-là, et sont effacées ensuite.
                    </p>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      // On ne redemande pas ce qu'on sait déjà : la fiche cliente
                      // si elle est connue, sinon ce qu'elle vient de saisir.
                      setAttenteOuverte(true)
                      setAttenteTel(prev => prev || telephone)
                      setAttentePrenom(prev => prev || clientePrenom)
                      setAttenteNom(prev => prev || clienteNom)
                      setAttenteEmail(prev => prev || clienteEmail)
                    }}
                    style={{
                      display: 'block', margin: '0 auto 18px', padding: '13px 24px', borderRadius: 12,
                      border: `1.5px solid ${PINK}`, background: '#fff', color: PINK,
                      fontWeight: 700, fontSize: 15, cursor: 'pointer',
                    }}>
                    Me prévenir si une place se libère
                  </button>
                )}

                <button onClick={() => setStep(3)} style={{ color: PINK, fontWeight: 600, fontSize: 14, background: 'none', border: 'none', cursor: 'pointer' }}>
                  ← Choisir une autre date
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {slotsLibres.map(s => (
                  <button
                    key={s.heure}
                    onClick={() => { setCreneauPerdu(null); setHeure(s.heure); setStep(5); setTimeout(() => { step5Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, 100) }}
                    style={{
                      padding: '12px 0',
                      borderRadius: 12,
                      border: `1.5px solid ${heure === s.heure ? PINK : '#e5e7eb'}`,
                      background: heure === s.heure ? PINK : '#fff',
                      color: heure === s.heure ? '#fff' : '#374151',
                      fontWeight: 600,
                      fontSize: 14,
                      cursor: 'pointer',
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
                    ? <><span style={{ textDecoration: 'line-through', color: '#9ca3af', marginRight: 4 }}>{formatPrix(prixTotal, pro?.devise)}</span><span style={{ color: PINK, fontWeight: 700 }}>{prixFinal > 0 ? formatPrix(prixFinal, pro?.devise) : 'Offert'}</span></>
                    : offreAppliquee && prixTotalBrut !== prixTotal
                      ? <><span style={{ textDecoration: 'line-through', color: '#9ca3af', marginRight: 4 }}>{formatPrix(prixTotalBrut, pro?.devise)}</span><span style={{ color: PINK, fontWeight: 700 }}>{formatPrix(prixTotal, pro?.devise)}</span></>
                      : formatPrix(prixTotal, pro?.devise)
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
                          <p style={{ fontSize: 14, color: '#1f2937', fontWeight: 500, margin: 0 }}>{t.nom}{(t.quantite ?? 1) > 1 ? ` ×${t.quantite}` : ''}</p>
                          <p style={{ fontSize: 11, color: '#888888', margin: '2px 0 0' }}>{t.categorie}</p>
                        </div>
                        <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 8, whiteSpace: 'nowrap', paddingTop: 2 }}>
                          {t.prix > 0 ? formatPrix(t.prix * (t.quantite ?? 1), pro?.devise) : '—'} · {formatDuree(t.duree * (t.quantite ?? 1))}
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
                          {recompenseFidelite.type === 'gratuit' ? 'Offert' : recompenseFidelite.type === 'euros' ? `-${formatPrix(recompenseFidelite.valeur, pro?.devise)}` : `-${recompenseFidelite.valeur}%`}
                        </span>
                      </div>
                    )}
                    {/* Ligne total */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: `1.5px solid #e5e7eb`, marginTop: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: PINK }}>Total</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: PINK }}>
                        {prixFinal !== prixTotal ? (
                          <><span style={{ textDecoration: 'line-through', color: '#9ca3af', fontWeight: 400, marginRight: 4 }}>{formatPrix(prixTotal, pro?.devise)}</span>{prixFinal > 0 ? formatPrix(prixFinal, pro?.devise) : 'Offert'} · {formatDuree(dureeTotal)}</>
                        ) : offreAppliquee && prixTotalBrut !== prixTotal ? (
                          <><span style={{ textDecoration: 'line-through', color: '#9ca3af', fontWeight: 400, marginRight: 4 }}>{formatPrix(prixTotalBrut, pro?.devise)}</span>{formatPrix(prixTotal, pro?.devise)} · {formatDuree(dureeTotal)}</>
                        ) : (
                          <>{prixTotal > 0 ? formatPrix(prixTotal, pro?.devise) : '—'} · {formatDuree(dureeTotal)}</>
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
                  {/* PLUS AUCUN FRAIS AJOUTÉ. Elle paie le montant affiché, à
                      l'euro près : les frais de carte sont retenus sur le
                      versement de la pro, comme partout ailleurs. Un montant
                      qui surprend au moment de réserver, la cliente ne
                      l'attribue pas à Stripe — elle l'attribue à sa pro. */}
                  {propay.mode === 'total'
                    ? <>Réglée maintenant, rien à payer sur place.</>
                    : propay.mode === 'acompte'
                      ? <>Payé maintenant, déduit du prix de ta prestation.</>
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
                      ? <><strong style={{ color: '#1f2937' }}>Annulation gratuite jusqu&apos;à 24 h avant le RDV</strong> — passé ce délai ou en cas d&apos;absence, {fmtCentimes(propay.acompte ?? 0)} pourront être prélevés.</>
                      : <><strong style={{ color: '#1f2937' }}>{propay.mode === 'total' ? 'Paiement remboursé' : 'Acompte remboursé'} à 100 % jusqu&apos;à 24 h avant le RDV</strong> — tu changes de plans ? Annule à plus de 24 h et {propay.mode === 'total' ? 'ton paiement' : 'ton acompte'} de {fmtCentimes(propay.acompte ?? 0)} te revient intégralement. À moins de 24 h, la somme est conservée par la praticienne.</>}
                  </span>
                </div>
                <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#6b7280', margin: '0 0 6px', lineHeight: 1.45 }}>
                  <Lock size={12} color="#9ca3af" style={{ flexShrink: 0 }} />
                  <span>Paiement sécurisé par Stripe — l&apos;argent va directement à ta professionnelle, Glamia ne détient jamais les fonds.</span>
                </p>
                <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 10px', lineHeight: 1.4 }}>
                  Les cartes émises hors zone euro peuvent entraîner des frais plus élevés. En réglant, tu acceptes les{' '}
                  <a href="https://booking.glamia.pro/cgu" target="_blank" rel="noopener noreferrer" style={{ color: '#9ca3af', textDecoration: 'underline' }}>conditions d&apos;utilisation</a>.
                </p>
                <Elements
                  // key = client_secret : si la cliente revient en arrière et
                  // change le montant, un nouvel intent est créé et le composant
                  // se REMONTE dessus. Sans ça, Stripe garde l'ancien secret et
                  // la cliente pourrait valider un montant différent de l'affiché
                  // (faille C10).
                  key={propay.client_secret}
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
                  {/* Prendre une photo — ouvre directement l'appareil photo */}
                  <label style={{
                    width: 88, height: 88, borderRadius: 12, border: '1.5px dashed #d1d5db',
                    background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', gap: 4, cursor: compressionEnCours ? 'default' : 'pointer',
                    flexShrink: 0, opacity: compressionEnCours ? 0.5 : 1, boxSizing: 'border-box',
                  }}>
                    <Camera size={20} color={PINK} />
                    <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>
                      {compressionEnCours ? 'Un instant…' : 'Prendre'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleAjoutInspiration}
                      disabled={compressionEnCours}
                      style={{ display: 'none' }}
                    />
                  </label>
                  {/* Importer depuis la galerie (sélection multiple) */}
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
                {/* « Être rappelée » laissait entendre un appel téléphonique, et
                    sans dire par qui. On nomme la pro : la cliente sait qui la
                    contactera, et par quel moyen reste ouvert. Repli sans le nom
                    si le profil n'a ni pseudo ni prénom. */}
                {(() => {
                  const nomPro = pro?.pseudo || pro?.prenom
                  return nomPro
                    ? `Souhaitez-vous être contactée par ${nomPro} avant votre rendez-vous ?`
                    : 'Souhaitez-vous être contactée avant votre rendez-vous ?'
                })()}
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
                      {t.nom}{(t.quantite ?? 1) > 1 ? ` ×${t.quantite}` : ''}
                    </span>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>{t.categorie}</span>
                  </div>
                  <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 8, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {t.prix_type === 'a_partir_de' ? `A partir de ${formatPrix(t.prix * (t.quantite ?? 1), pro?.devise)}` : (t.prix > 0 ? formatPrix(t.prix * (t.quantite ?? 1), pro?.devise) : '—')} · {formatDuree(t.duree * (t.quantite ?? 1))}
                  </span>
                </div>
              ))}
            </div>
            {/* Total + Continuer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: PINK }}>
                {prixFinal !== prixTotal ? (
                  <><span style={{ textDecoration: 'line-through', marginRight: 4, fontWeight: 400, color: '#9ca3af' }}>{formatPrix(prixTotal, pro?.devise)}</span>{prixFinal > 0 ? formatPrix(prixFinal, pro?.devise) : 'Offert'}</>
                ) : prixTotal > 0 ? formatPrix(prixTotal, pro?.devise) : '—'} · {formatDuree(dureeTotal)}
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
  day, isSelected, isToday, isPast, isOff, isComplet, isDisabled, onClick,
}: {
  day: number
  isSelected: boolean
  /** Aujourd'hui. Même repère que l'agenda de l'app : un cadre, rien de plus. */
  isToday: boolean
  isPast: boolean
  isOff: boolean
  /** La pro travaille ce jour-là, mais plus une seule place pour cette durée. */
  isComplet?: boolean
  isDisabled: boolean
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)

  const bg = isSelected
    ? PINK
    : isOff
      ? '#E3F2FD'   // jour off : bleu ciel très clair
      : isComplet
        ? '#F3E4EC' // complet : rose grisé, distinct du jour off
        : hovered && !isDisabled
          ? '#F9EEF4'
          : 'transparent'

  const color = isSelected
    ? '#fff'
    : isPast
      ? '#d1d5db'   // passé : gris clair
      : isOff
        ? '#90CAF9'  // off : bleu clair (lisible sur fond bleu ciel)
        : isComplet
          ? '#C49BB4' // complet : rose éteint — cliquable, mais ne promet rien
          : hovered
            ? PINK
            : '#374151'

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={isOff ? 'Jour de repos' : isComplet ? 'Complet — être prévenue si une place se libère' : undefined}
      style={{
        aspectRatio: '1', borderRadius: '50%', boxSizing: 'border-box',
        // Le cadre est toujours là, transparent la plupart du temps : sinon la
        // case d'aujourd'hui serait la seule à porter une bordure, et elle
        // sauterait de 3 pixels par rapport à ses voisines.
        border: `1.5px solid ${isToday && !isSelected ? PINK : 'transparent'}`,
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
