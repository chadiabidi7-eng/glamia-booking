import { createClient } from '@supabase/supabase-js'
import { formuleDe } from '@/lib/formule'
import { traduireDans } from '@/lib/i18n'
import { regleDuCreneau, type MajorationAppliquee, type MajorationsResolues, type RegleResolue, type TypeMajoration } from '@/lib/majoration'

// ─────────────────────────────────────────────────────────────────────────────
// LES MAJORATIONS, CÔTÉ SERVEUR (3.0, 4 octobre 2026)
//
// Deux rôles :
//   1. RÉSOUDRE la configuration de la pro pour la page : les jours fériés
//      deviennent des dates (cette année et la suivante), calculés par la même
//      bibliothèque que l'app, avec sa région et les jours qu'elle a décochés ;
//   2. FIXER la majoration d'un rendez-vous au moment où il se crée ou se
//      paie. Le navigateur ne la déclare jamais : comme le prix, elle est
//      relue chez la pro.
//
// FORMULE ULTRA SEULEMENT. Une pro qui n'est plus Ultra garde ses règles
// (rien n'est effacé) mais elles ne s'appliquent plus.
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Holidays = require('date-holidays')

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type RegleBrute = {
  type?: TypeMajoration; pourcentage?: number; heure?: string; jours?: number[]
  debut?: string; fin?: string; region?: string; exclus?: string[]
}

function datesFeriees(pays: string | null | undefined, region: string | undefined, exclus: string[]): string[] {
  const code = (pays || 'FR').toUpperCase()
  const annee = new Date().getUTCFullYear()
  try {
    const h = region ? new Holidays(code, region, { types: ['public'] }) : new Holidays(code, { types: ['public'] })
    const dates = new Set<string>()
    for (const a of [annee, annee + 1]) {
      for (const x of h.getHolidays(a) as { date: string; rule: string }[]) {
        if (!exclus.includes(x.rule)) dates.add(x.date.slice(0, 10))
      }
    }
    return [...dates]
  } catch {
    return []
  }
}

/** La configuration prête pour la page, ou null si rien ne s'applique (éteinte, vide, pas Ultra). */
export function resoudreMajorations(brut: unknown, pays: string | null | undefined, ultra: boolean): MajorationsResolues {
  if (!ultra || !brut || typeof brut !== 'object') return null
  const c = brut as { actif?: boolean; regles?: RegleBrute[] }
  if (!c.actif || !Array.isArray(c.regles)) return null
  const regles: RegleResolue[] = c.regles
    .filter(r => r && typeof r.pourcentage === 'number' && r.pourcentage > 0 && r.type)
    .map(r => ({
      type: r.type as TypeMajoration,
      pourcentage: Math.min(100, r.pourcentage as number),
      ...(r.heure ? { heure: r.heure } : {}),
      ...(Array.isArray(r.jours) ? { jours: r.jours } : {}),
      ...(r.debut ? { debut: r.debut } : {}),
      ...(r.fin ? { fin: r.fin } : {}),
      ...(r.type === 'ferie' ? { dates: datesFeriees(pays, r.region, r.exclus ?? []) } : {}),
    }))
  return regles.length ? { regles } : null
}

/** Le libellé enregistré sur le rendez-vous, dans la langue de la pro. */
function libelle(r: RegleResolue, langue: string | null | undefined): string {
  switch (r.type) {
    case 'ferie': return traduireDans(langue, 'majoration.ferie')
    case 'apres': return traduireDans(langue, 'majoration.apresH', { heure: r.heure })
    case 'avant': return traduireDans(langue, 'majoration.avantH', { heure: r.heure })
    case 'jours': return traduireDans(langue, 'majoration.jours')
    case 'periode': return traduireDans(langue, 'majoration.periode')
  }
}

/**
 * La majoration de ce créneau chez cette pro, relue dans la base.
 * `date` « AAAA-MM-JJ », `heure` « HH:MM » (l'heure de la pro).
 */
export async function majorationDuCreneau(proId: string, date: string, heure: string): Promise<MajorationAppliquee | null> {
  if (!proId || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || !/^\d{2}:\d{2}$/.test(heure ?? '')) return null
  const { data: p } = await supabaseAdmin
    .from('profiles')
    .select('majorations, pays, langue, abonnement_actif, pro_pay_actif, trial_ends_at')
    .eq('id', proId)
    .maybeSingle()
  if (!p) return null
  const config = resoudreMajorations(p.majorations, p.pays as string | null, formuleDe(p) === 'ultra')
  const r = regleDuCreneau(config, date, heure)
  return r ? { pourcentage: r.pourcentage, libelle: libelle(r, p.langue as string | null) } : null
}
