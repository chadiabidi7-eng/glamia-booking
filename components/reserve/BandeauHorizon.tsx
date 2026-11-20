'use client'
// ─────────────────────────────────────────────────────────────────────────────
// LA LIMITE DE RÉSERVATION, DITE EN CLAIR (Chadi, 20 nov. 2026)
//
// Une pro peut n'ouvrir ses rendez-vous que 2 semaines (… 1 an) à l'avance.
// Au-delà, les jours n'étaient pas « fermés » mais dessinés comme des jours de
// repos : une cliente voyait décembre entier en « Jour off » et croyait la pro
// absente. Désormais ces jours ne sont plus dessinés du tout, et ce bandeau dit
// pourquoi : « Zafyr Nail's prend ses rendez-vous jusqu'à 2 semaines à
// l'avance, pas plus : dates ouvertes jusqu'au jeudi 4 décembre. »
// Montré seulement quand le mois affiché atteint la limite.
// ─────────────────────────────────────────────────────────────────────────────
import { Info } from 'lucide-react'
import { langueActuelle, traduire } from '@/lib/i18n'

const LOCALES: Record<string, string> = { fr: 'fr-FR', en: 'en-GB', es: 'es-ES', it: 'it-IT' }

/** Le mois affiché (année, mois 0-11) contient-il des jours après la limite ? */
export function moisAtteintLimite(annee: number, mois: number, dernier: string | null): boolean {
  if (!dernier) return false
  const fin = new Date(Date.UTC(annee, mois + 1, 0)).toISOString().slice(0, 10)
  return fin > dernier
}

export default function BandeauHorizon({ pro, horizon, dernier }: { pro: string | null | undefined; horizon: number | null; dernier: string | null }) {
  if (!horizon || !dernier) return null
  const date = new Date(dernier + 'T00:00:00').toLocaleDateString(LOCALES[langueActuelle()] ?? 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const texte = traduire('resa.horizonMessage', {
    pro: pro?.trim() || traduire('resa.horizonPro'),
    duree: traduire(`resa.horizonDuree.${horizon}`),
    date,
  })
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#F5F3F4', borderRadius: 12, padding: '12px 14px', margin: '0 0 14px' }}>
      <Info size={16} color="#6b7280" strokeWidth={2} style={{ flexShrink: 0, marginTop: 2 }} />
      <p style={{ margin: 0, color: '#374151', fontSize: 13.5, lineHeight: 1.45, textWrap: 'pretty' }}>{texte}</p>
    </div>
  )
}
