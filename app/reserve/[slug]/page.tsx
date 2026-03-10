'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type HorairesJour = { actif: boolean; debut: string; fin: string }
type HorairesHebdo = Record<number, HorairesJour>
type Technique = { id: string; nom: string; active: boolean; prix: number; duree: number }
type CataloguePrestations = Record<string, Technique[]>

type ProInfo = {
  id: string
  prenom: string
  nom: string
  photo_url?: string
  horaires: HorairesHebdo
  instagram?: string
  tiktok?: string
  snapchat?: string
  message_accueil?: string
}

type RdvAVenir = {
  id: string
  date: string
  specialite: string
  technique: string
  duree: number
  prix: number | null
  statut: string
}

type Slot = { heure: string; disponible: boolean }

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const PINK = '#C2779E'
const PINK_LIGHT = '#F9EEF4'

const DEFAULT_HORAIRES: HorairesHebdo = {
  0: { actif: false, debut: '09:00', fin: '18:00' },
  1: { actif: true,  debut: '09:00', fin: '18:00' },
  2: { actif: true,  debut: '09:00', fin: '18:00' },
  3: { actif: true,  debut: '09:00', fin: '18:00' },
  4: { actif: true,  debut: '09:00', fin: '18:00' },
  5: { actif: true,  debut: '09:00', fin: '18:00' },
  6: { actif: true,  debut: '09:00', fin: '14:00' },
}

const EMOJI_MAP: Record<string, string> = {
  'Ongles': '💅', 'Cils': '👁️', 'Sourcils': '✨',
  'Lèvres': '💋', 'Épilation': '🌸', 'Maquillage': '💄',
  'Soins visage': '🌿', 'Autre': '⭐',
}

const MOIS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

const JOURS_COURT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

const STEP_LABELS = ['Identification', 'Prestation', 'Technique', 'Date', 'Heure', 'Confirmation']

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
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

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfWeek(year: number, month: number) {
  return (new Date(year, month, 1).getDay() + 6) % 7
}

function buildDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function isDayWorking(dateStr: string, horaires: HorairesHebdo) {
  const jour = new Date(dateStr + 'T00:00:00').getDay()
  const h = horaires[jour]
  return h?.actif === true
}

function generateSlots(
  date: string,
  duree: number,
  horaires: HorairesHebdo,
  rdvExistants: { heure: string; duree: number }[],
): Slot[] {
  const jour = new Date(date + 'T00:00:00').getDay()
  const h = horaires[jour]
  if (!h?.actif) return []

  const debut = timeToMin(h.debut)
  const fin   = timeToMin(h.fin)
  const INTERVAL = 30

  const taken = rdvExistants.map(r => ({
    start: timeToMin(r.heure),
    end:   timeToMin(r.heure) + r.duree,
  }))

  const slots: Slot[] = []
  for (let t = debut; t + duree <= fin; t += INTERVAL) {
    const end = t + duree
    const isTaken = taken.some(r => t < r.end && end > r.start)
    slots.push({ heure: minToTime(t), disponible: !isTaken })
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
// Main Component
// ─────────────────────────────────────────────
export default function ReservationPage() {
  const params  = useParams()
  const slug    = params.slug as string
  const todayJs = new Date()

  // ── Pro & catalogue ──────────────────────────
  const [pro,        setPro]        = useState<ProInfo | null>(null)
  const [catalogue,  setCatalogue]  = useState<CataloguePrestations>({})
  const [pageState,  setPageState]  = useState<'loading' | 'ready' | 'notfound' | 'confirmed'>('loading')
  const [submitting, setSubmitting] = useState(false)

  // ── Booking state ────────────────────────────
  const [step, setStep] = useState(1)

  // Step 1
  const [telephone,     setTelephone]     = useState('')
  const [clientePrenom, setClientePrenom] = useState('')
  const [clienteNom,    setClienteNom]    = useState('')
  const [clienteId,     setClienteId]     = useState<string | null>(null)
  const [phoneStatus,   setPhoneStatus]   = useState<'idle' | 'checking' | 'known' | 'unknown'>('idle')

  // RDVs à venir (cliente connue)
  const [rdvsAVenir,        setRdvsAVenir]        = useState<RdvAVenir[]>([])
  const [loadingRdvs,       setLoadingRdvs]       = useState(false)
  const [annulationEnCours, setAnnulationEnCours] = useState<string | null>(null)

  // Step 2
  const [specialite, setSpecialite] = useState('')

  // Step 3
  const [technique, setTechnique] = useState<Technique | null>(null)

  // Step 4
  const [date,     setDate]     = useState('')
  const [calYear,  setCalYear]  = useState(todayJs.getFullYear())
  const [calMonth, setCalMonth] = useState(todayJs.getMonth())

  // Step 5
  const [slots,        setSlots]        = useState<Slot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [heure,        setHeure]        = useState('')

  // Step 6
  const [commentaire, setCommentaire] = useState('')
  const [rappel,      setRappel]      = useState(false)

  // ── Load pro ─────────────────────────────────
  useEffect(() => { loadPro() }, [slug])

  async function loadPro() {
    setPageState('loading')
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, prenom, nom, photo_url, horaires, instagram, tiktok, snapchat, message_accueil')

      if (error) throw error

      const found = profiles?.find(p =>
        normalizeStr(`${p.prenom}-${p.nom}`) === normalizeStr(slug)
      )

      if (!found) { setPageState('notfound'); return }

      setPro({
        id:              found.id,
        prenom:          found.prenom,
        nom:             found.nom,
        photo_url:       found.photo_url ?? undefined,
        horaires:        found.horaires ?? DEFAULT_HORAIRES,
        instagram:       found.instagram ?? undefined,
        tiktok:          found.tiktok ?? undefined,
        snapchat:        found.snapchat ?? undefined,
        message_accueil: found.message_accueil ?? undefined,
      })

      const { data: prestData } = await supabase
        .from('prestations')
        .select('data')
        .eq('pro_id', found.id)
        .single()

      if (prestData?.data) setCatalogue(prestData.data as CataloguePrestations)
      setPageState('ready')
    } catch (e) {
      console.error(e)
      setPageState('notfound')
    }
  }

  // ── Step 1: Check phone ───────────────────────
  async function handleCheckPhone() {
    if (!pro) return
    const normalized = normalizePhone(telephone)
    if (normalized.length < 8) return

    setPhoneStatus('checking')

    try {
      const { data: clientes, error } = await supabase
        .from('clientes')
        .select('id, prenom, nom, telephone')
        .eq('pro_id', pro.id)

      if (error) throw error

      const found = clientes?.find(c => normalizePhone(c.telephone) === normalized)

      if (found) {
        setClienteId(found.id)
        setClientePrenom(found.prenom)
        setClienteNom(found.nom)
        setPhoneStatus('known')
        chargerRdvsAVenir(found.id, pro.id)
      } else {
        setPhoneStatus('unknown')
      }
    } catch (e) {
      console.error('[handleCheckPhone] Erreur:', e)
      setPhoneStatus('unknown')
    }
  }

  // ── RDVs à venir ─────────────────────────────
  async function chargerRdvsAVenir(cId: string, proId: string) {
    setLoadingRdvs(true)
    try {
      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from('rendez_vous')
        .select('id, date, specialite, technique, duree, prix, statut')
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

  async function handleAnnulerRdv(rdvId: string) {
    setAnnulationEnCours(rdvId)
    try {
      const { error } = await supabase
        .from('rendez_vous')
        .update({ statut: 'annule' })
        .eq('id', rdvId)

      if (error) throw error
      setRdvsAVenir(prev => prev.filter(r => r.id !== rdvId))
    } catch (e) {
      console.error('[handleAnnulerRdv] Erreur:', e)
      alert('Impossible d\'annuler ce rendez-vous.')
    } finally {
      setAnnulationEnCours(null)
    }
  }

  function confirmerAnnulation(rdv: RdvAVenir) {
    const dateLabel = formatRdvDate(rdv.date)
    const heureLabel = formatRdvHeure(rdv.date)
    if (window.confirm(`Annuler votre RDV du ${dateLabel} à ${heureLabel} (${rdv.technique}) ?`)) {
      handleAnnulerRdv(rdv.id)
    }
  }

  // ── Step 5: Load slots ────────────────────────
  useEffect(() => {
    if (step === 5 && date && technique && pro) loadSlots()
  }, [step, date])

  async function loadSlots() {
    if (!pro || !technique || !date) return
    setLoadingSlots(true)
    setSlots([])
    try {
      const { data: rdvs } = await supabase
        .from('rendez_vous')
        .select('date, duree, statut')
        .eq('pro_id', pro.id)
        .gte('date', `${date}T00:00:00.000Z`)
        .lte('date', `${date}T23:59:59.999Z`)
        .neq('statut', 'annule')

      const rdvExistants = (rdvs ?? []).map(r => {
        const d = new Date(r.date)
        return {
          heure: `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`,
          duree: r.duree,
        }
      })

      setSlots(generateSlots(date, technique.duree, pro.horaires, rdvExistants))
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingSlots(false)
    }
  }

  // ── Step 6: Confirm ───────────────────────────
  async function handleConfirm() {
    if (!pro || !technique || !date || !heure) return
    setSubmitting(true)

    try {
      let cId = clienteId
      const telNormalized = normalizePhone(telephone)

      if (!cId) {
        const { data: allClientes, error: fetchErr } = await supabase
          .from('clientes')
          .select('id, telephone')
          .eq('pro_id', pro.id)

        if (!fetchErr && allClientes) {
          const found = allClientes.find(c => normalizePhone(c.telephone) === telNormalized)
          if (found) cId = found.id
        }

        if (!cId) {
          const { data: created, error: createErr } = await supabase
            .from('clientes')
            .insert({
              pro_id:    pro.id,
              prenom:    clientePrenom.trim(),
              nom:       clienteNom.trim(),
              telephone: telNormalized,
            })
            .select('id')
            .single()

          if (createErr) throw createErr
          cId = created!.id
        }
      }

      const { error: rdvErr } = await supabase
        .from('rendez_vous')
        .insert({
          pro_id:     pro.id,
          cliente_id: cId,
          date:       `${date}T${heure}:00.000Z`,
          duree:      technique.duree,
          specialite: specialite,
          technique:  technique.nom,
          prix:       technique.prix > 0 ? technique.prix : null,
          statut:     'en_attente',
          notes:      commentaire.trim() || null,
        })

      if (rdvErr) throw rdvErr
      setPageState('confirmed')
    } catch (e) {
      console.error('[handleConfirm] Erreur globale:', e)
      alert('Une erreur est survenue. Ouvre la console (F12) pour voir le détail.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Derived ───────────────────────────────────
  const specialitesActives = Object.entries(catalogue)
    .filter(([, techs]) => techs.some(t => t.active))
    .map(([nom, techs]) => ({
      nom,
      emoji:      EMOJI_MAP[nom] ?? '✨',
      techniques: techs.filter(t => t.active),
    }))

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
          <div style={{ fontSize: 48, marginBottom: 16 }}>✨</div>
          <p style={{ color: PINK, fontWeight: 600, fontSize: 16 }}>Chargement...</p>
        </div>
      </div>
    )
  }

  if (pageState === 'notfound') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#fff' }}>
        <div style={{ textAlign: 'center', maxWidth: 320 }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🔍</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1f2937', marginBottom: 8 }}>Page introuvable</h1>
          <p style={{ color: '#6b7280', fontSize: 15 }}>Ce lien de réservation n'existe pas ou a été désactivé.</p>
        </div>
      </div>
    )
  }

  if (pageState === 'confirmed') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: PINK_LIGHT }}>
        <div style={{ textAlign: 'center', maxWidth: 360, width: '100%', background: '#fff', borderRadius: 24, padding: 32, boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
          <div style={{ width: 80, height: 80, borderRadius: 40, background: PINK_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 36 }}>
            ✅
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1f2937', marginBottom: 8 }}>RDV enregistré !</h1>
          <p style={{ color: '#6b7280', marginBottom: 24, fontSize: 15 }}>
            Votre demande est en attente de confirmation par {pro?.prenom}.
          </p>
          <div style={{ background: PINK_LIGHT, borderRadius: 16, padding: 16, textAlign: 'left', marginBottom: 20 }}>
            {[
              { emoji: '👤', label: `${clientePrenom} ${clienteNom}` },
              { emoji: EMOJI_MAP[specialite] ?? '✨', label: `${specialite} · ${technique?.nom}` },
              { emoji: '📅', label: formatDateLong(date) },
              { emoji: '🕐', label: `${heure} · ${formatDuree(technique!.duree)}` },
              ...(technique!.prix > 0 ? [{ emoji: '💶', label: `${technique!.prix} €` }] : []),
            ].map((row, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: i < 4 ? 8 : 0 }}>
                <span style={{ fontSize: 18, width: 24 }}>{row.emoji}</span>
                <span style={{ fontSize: 14, color: '#374151' }}>{row.label}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: '#9ca3af' }}>Vous serez contacté(e) pour confirmation.</p>
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
              <p style={{ fontWeight: 600, color: '#1f2937', fontSize: 14, margin: 0 }}>{pro?.prenom} {pro?.nom}</p>
              {pro?.message_accueil && (
                <p style={{ fontSize: 12, color: PINK, margin: '2px 0 0', fontStyle: 'italic', lineHeight: 1.4 }}>
                  {pro.message_accueil}
                </p>
              )}
              {hasSocials ? (
                <div style={{ marginTop: 8 }}>
                  <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 8px', fontWeight: 500 }}>
                    Retrouvez-moi sur les réseaux
                  </p>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {pro?.instagram && <SocialLink reseau="instagram" pseudo={pro.instagram} size={32} />}
                    {pro?.tiktok    && <SocialLink reseau="tiktok"    pseudo={pro.tiktok}    size={32} />}
                    {pro?.snapchat  && <SocialLink reseau="snapchat"  pseudo={pro.snapchat}  size={32} />}
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0' }}>Réservation en ligne</p>
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
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 16px 48px' }}>

        {/* ────────────────────────────────────────
            STEP 1 — Identification
        ──────────────────────────────────────── */}
        {step === 1 && (
          <div>
            <h2 style={S.h2}>Bonjour ! 👋</h2>
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
                {/* Accueil cliente connue — message pro + réseaux, ou fallback générique */}
                {(pro?.message_accueil || hasSocials) ? (
                  <div style={{ ...S.infoBox, marginBottom: 20 }}>
                    {pro?.message_accueil && (
                      <p style={{ fontWeight: 600, color: '#1f2937', fontSize: 15, margin: 0, marginBottom: hasSocials ? 12 : 0, lineHeight: 1.5 }}>
                        {pro.message_accueil}
                      </p>
                    )}
                    {hasSocials && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        {pro?.instagram && <SocialLink reseau="instagram" pseudo={pro.instagram} size={28} />}
                        {pro?.tiktok    && <SocialLink reseau="tiktok"    pseudo={pro.tiktok}    size={28} />}
                        {pro?.snapchat  && <SocialLink reseau="snapchat"  pseudo={pro.snapchat}  size={28} />}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ ...S.infoBox, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 28 }}>👋</span>
                    <div>
                      <p style={{ fontWeight: 600, color: '#1f2937', margin: 0 }}>Bonjour {clientePrenom} !</p>
                      <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Nous vous avons reconnue.</p>
                    </div>
                  </div>
                )}

                {/* RDVs à venir */}
                {loadingRdvs ? (
                  <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 14, marginBottom: 16 }}>
                    Chargement de vos rendez-vous...
                  </p>
                ) : rdvsAVenir.length > 0 ? (
                  <div style={{ marginBottom: 20 }}>
                    <p style={{ fontWeight: 700, color: '#1f2937', fontSize: 15, marginBottom: 12 }}>
                      Vos rendez-vous à venir
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {rdvsAVenir.map(rdv => (
                        <div
                          key={rdv.id}
                          style={{
                            ...S.card,
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontWeight: 600, color: '#1f2937', fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {EMOJI_MAP[rdv.specialite] ?? '✨'} {rdv.technique}
                            </p>
                            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#6b7280', textTransform: 'capitalize' }}>
                              {formatRdvDate(rdv.date)} · {formatRdvHeure(rdv.date)}
                            </p>
                            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                              <span style={{
                                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                                background: rdv.statut === 'confirme' ? '#d1fae5' : PINK_LIGHT,
                                color: rdv.statut === 'confirme' ? '#065f46' : PINK,
                              }}>
                                {rdv.statut === 'confirme' ? '✓ Confirmé' : rdv.statut === 'en_attente' ? '⏳ En attente' : rdv.statut}
                              </span>
                              {rdv.prix && rdv.prix > 0 && (
                                <span style={{ fontSize: 11, color: '#9ca3af' }}>{rdv.prix} €</span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => confirmerAnnulation(rdv)}
                            disabled={annulationEnCours === rdv.id}
                            style={{
                              flexShrink: 0, padding: '7px 12px', borderRadius: 10,
                              border: '1.5px solid #fca5a5', background: '#fff',
                              color: '#ef4444', fontSize: 13, fontWeight: 600,
                              cursor: 'pointer', opacity: annulationEnCours === rdv.id ? 0.5 : 1,
                              transition: 'all 0.15s',
                            }}
                          >
                            {annulationEnCours === rdv.id ? '...' : 'Annuler'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ ...S.card, textAlign: 'center', marginBottom: 20, color: '#9ca3af', fontSize: 14 }}>
                    Aucun rendez-vous à venir.
                  </div>
                )}

                {/* Prendre un nouveau RDV */}
                <button onClick={() => setStep(2)} style={S.btn}>
                  + Prendre un nouveau rendez-vous
                </button>
              </div>
            )}

            {phoneStatus === 'unknown' && (
              <div>
                <div style={{ ...S.card, marginBottom: 16 }}>
                  <p style={{ fontWeight: 600, color: '#374151', marginBottom: 16, fontSize: 15 }}>
                    Première visite ? Enchanté(e) ! 🌸
                  </p>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label style={S.label}>Prénom</label>
                      <input
                        type="text"
                        value={clientePrenom}
                        onChange={e => setClientePrenom(e.target.value)}
                        placeholder="Sophie"
                        style={S.input}
                        autoCapitalize="words"
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={S.label}>Nom</label>
                      <input
                        type="text"
                        value={clienteNom}
                        onChange={e => setClienteNom(e.target.value)}
                        placeholder="Martin"
                        style={S.input}
                        autoCapitalize="words"
                      />
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => { if (clientePrenom.trim() && clienteNom.trim()) setStep(2) }}
                  disabled={!clientePrenom.trim() || !clienteNom.trim()}
                  style={{ ...S.btn, opacity: (!clientePrenom.trim() || !clienteNom.trim()) ? 0.5 : 1 }}
                >
                  Continuer →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ────────────────────────────────────────
            STEP 2 — Spécialité
        ──────────────────────────────────────── */}
        {step === 2 && (
          <div>
            <BackBtn onClick={() => setStep(1)} />
            <h2 style={S.h2}>Quelle prestation ?</h2>
            <p style={S.sub}>Choisissez votre type de soin.</p>

            {specialitesActives.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af' }}>
                Aucune prestation disponible pour le moment.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {specialitesActives.map(s => (
                  <button
                    key={s.nom}
                    onClick={() => { setSpecialite(s.nom); setTechnique(null); setStep(3) }}
                    style={{
                      ...S.card,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      gap: 8, padding: '20px 12px', cursor: 'pointer',
                      borderColor: specialite === s.nom ? PINK : '#e5e7eb',
                      background: specialite === s.nom ? PINK_LIGHT : '#fff',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ fontSize: 32 }}>{s.emoji}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', textAlign: 'center' }}>{s.nom}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ────────────────────────────────────────
            STEP 3 — Technique
        ──────────────────────────────────────── */}
        {step === 3 && (
          <div>
            <BackBtn onClick={() => setStep(2)} />
            <h2 style={S.h2}>{EMOJI_MAP[specialite] ?? '✨'} {specialite}</h2>
            <p style={S.sub}>Choisissez votre technique.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(catalogue[specialite] ?? []).filter(t => t.active).map(t => (
                <button
                  key={t.id}
                  onClick={() => { setTechnique(t); setDate(''); setHeure(''); setStep(4) }}
                  style={{
                    ...S.card,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 16px', cursor: 'pointer', textAlign: 'left',
                    borderColor: technique?.id === t.id ? PINK : '#e5e7eb',
                    background: technique?.id === t.id ? PINK_LIGHT : '#fff',
                    transition: 'all 0.15s',
                  }}
                >
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, color: '#1f2937', fontSize: 15 }}>{t.nom}</p>
                    <p style={{ margin: '3px 0 0', fontSize: 13, color: '#9ca3af' }}>{formatDuree(t.duree)}</p>
                  </div>
                  {t.prix > 0 && (
                    <span style={{ fontWeight: 700, color: '#374151', fontSize: 16, marginLeft: 12, whiteSpace: 'nowrap' }}>
                      {t.prix} €
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ────────────────────────────────────────
            STEP 4 — Calendrier
        ──────────────────────────────────────── */}
        {step === 4 && (
          <div>
            <BackBtn onClick={() => setStep(3)} />
            <h2 style={S.h2}>📅 Choisissez une date</h2>
            <p style={S.sub}>Sélectionnez un jour disponible.</p>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <button
                onClick={prevMonth}
                disabled={isAtCurrentMonth()}
                style={{ ...S.navBtn, opacity: isAtCurrentMonth() ? 0.3 : 1 }}
              >
                ‹
              </button>
              <span style={{ fontWeight: 600, color: '#1f2937', fontSize: 16, textTransform: 'capitalize' }}>
                {MOIS[calMonth]} {calYear}
              </span>
              <button onClick={nextMonth} style={S.navBtn}>›</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
              {JOURS_COURT.map(j => (
                <div key={j} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#9ca3af', padding: '4px 0' }}>
                  {j}
                </div>
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
                const isOff   = !isDayWorking(dateStr, pro!.horaires)
                const isDisabled = isPast || isOff
                const isSelected = date === dateStr

                return (
                  <CalendarDay
                    key={day}
                    day={day}
                    isSelected={isSelected}
                    isDisabled={isDisabled}
                    onClick={() => { if (!isDisabled) { setDate(dateStr); setHeure(''); setStep(5) } }}
                  />
                )
              })}
            </div>

            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 12, height: 12, borderRadius: 6, background: PINK }} />
                <span style={{ fontSize: 12, color: '#6b7280' }}>Sélectionné</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 12, height: 12, borderRadius: 6, background: '#e5e7eb' }} />
                <span style={{ fontSize: 12, color: '#6b7280' }}>Indisponible</span>
              </div>
            </div>
          </div>
        )}

        {/* ────────────────────────────────────────
            STEP 5 — Heure
        ──────────────────────────────────────── */}
        {step === 5 && (
          <div>
            <BackBtn onClick={() => setStep(4)} />
            <h2 style={S.h2}>🕐 Choisissez une heure</h2>
            <p style={{ ...S.sub, textTransform: 'capitalize' }}>{formatDateLong(date)}</p>

            {loadingSlots ? (
              <div style={{ textAlign: 'center', padding: '48px 0' }}>
                <p style={{ color: PINK, fontWeight: 600 }}>Chargement des créneaux...</p>
              </div>
            ) : slots.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>😔</div>
                <p style={{ color: '#6b7280', marginBottom: 16 }}>Aucun créneau disponible ce jour.</p>
                <button onClick={() => setStep(4)} style={{ color: PINK, fontWeight: 600, fontSize: 14, background: 'none', border: 'none', cursor: 'pointer' }}>
                  ← Choisir une autre date
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {slots.map(s => (
                  <button
                    key={s.heure}
                    disabled={!s.disponible}
                    onClick={() => { if (s.disponible) { setHeure(s.heure); setStep(6) } }}
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
            STEP 6 — Confirmation
        ──────────────────────────────────────── */}
        {step === 6 && (
          <div>
            <BackBtn onClick={() => setStep(5)} />
            <h2 style={S.h2}>Confirmation 🌸</h2>
            <p style={S.sub}>Vérifiez les détails de votre rendez-vous.</p>

            <div style={{ ...S.card, marginBottom: 20 }}>
              <p style={{ fontWeight: 700, color: '#1f2937', fontSize: 15, marginBottom: 16 }}>Récapitulatif</p>
              {[
                { emoji: '👤', label: 'Cliente',    value: `${clientePrenom} ${clienteNom}` },
                { emoji: EMOJI_MAP[specialite] ?? '✨', label: 'Prestation', value: `${specialite} · ${technique?.nom}` },
                { emoji: '📅', label: 'Date',       value: formatDateLong(date) },
                { emoji: '🕐', label: 'Heure',      value: `${heure} · ${formatDuree(technique!.duree)}` },
                ...(technique!.prix > 0 ? [{ emoji: '💶', label: 'Prix', value: `${technique!.prix} €` }] : []),
              ].map((row, i, arr) => (
                <div key={i}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0' }}>
                    <span style={{ fontSize: 20, width: 26, flexShrink: 0 }}>{row.emoji}</span>
                    <div>
                      <p style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>{row.label}</p>
                      <p style={{ fontSize: 15, color: '#1f2937', fontWeight: 500, margin: '2px 0 0', textTransform: 'capitalize' }}>{row.value}</p>
                    </div>
                  </div>
                  {i < arr.length - 1 && <div style={{ height: 1, background: '#f3f4f6' }} />}
                </div>
              ))}
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
                {rappel && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>✓</span>}
              </div>
              <span style={{ fontSize: 14, color: '#374151', lineHeight: 1.4 }}>
                Souhaitez-vous être rappelée avant votre rendez-vous ?
              </span>
            </label>

            <button
              onClick={handleConfirm}
              disabled={submitting}
              style={{
                ...S.btn,
                opacity: submitting ? 0.7 : 1,
                boxShadow: `0 4px 20px ${PINK}55`,
              }}
            >
              {submitting ? 'Enregistrement...' : '✓ Confirmer ma réservation'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────
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
  day, isSelected, isDisabled, onClick,
}: { day: number; isSelected: boolean; isDisabled: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)

  const bg = isSelected
    ? PINK
    : hovered && !isDisabled
      ? PINK_LIGHT
      : 'transparent'

  const color = isSelected
    ? '#fff'
    : isDisabled
      ? '#d1d5db'
      : hovered
        ? PINK
        : '#374151'

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
    background: PINK_LIGHT, borderRadius: 16, padding: 16,
  },
  navBtn: {
    width: 36, height: 36, borderRadius: 18, border: '1px solid #e5e7eb',
    background: '#fff', cursor: 'pointer', fontSize: 20, color: '#6b7280',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
}
