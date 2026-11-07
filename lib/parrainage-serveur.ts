import { createClient } from '@supabase/supabase-js'
import { CHAMPS_FORMULE, formuleDe } from '@/lib/formule'

// ─────────────────────────────────────────────────────────────────────────────
// LE PARRAINAGE, CÔTÉ SERVEUR (Ultra, 7 nov. 2026)
//
// Deux cas, jamais les deux à la fois sur un même rendez-vous :
//   · L'AMIE (filleule) : une NOUVELLE cliente entre le code d'une cliente de
//     la pro. Nouvelle = fiche créée à l'instant pour cette réservation, aucun
//     rendez-vous avant, jamais parrainée. Elle a le cadeau réglé par la pro.
//   · L'AMBASSADRICE : sa cagnotte (euros, non expirée) se déduit du prix, ou
//     sa plus ancienne récompense en attente (%, soin offert) s'applique — une
//     par visite.
//
// UNE RÉCOMPENSE NE S'APPLIQUE QU'À LA CRÉATION D'UN RENDEZ-VOUS (Chadi,
// 7 nov. 2026) : un rendez-vous déjà pris garde le prix accepté. Ce qui tombe
// entre-temps attend le rendez-vous suivant.
//
// Le navigateur envoie au plus un code ; tout le reste est relu ici.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export type Gain = { type: 'pourcentage' | 'euros' | 'gratuit' | 'tampon'; valeur: number }
export type ConfigParrainage = { active?: boolean; filleule?: Gain; ambassadrice?: Gain; validite_mois?: number | null }

export type ParrainageApplique =
  | { role: 'filleule'; code: string; ambassadrice_id: string; ambassadrice_prenom: string; gain: Gain; montant: number }
  | { role: 'ambassadrice'; cagnotte: number; parrainage_id: string | null; gain: Gain | null; montant: number }

/** Le réglage de la pro, s'il est allumé ET qu'elle est Ultra. */
export async function configActive(proId: string): Promise<ConfigParrainage | null> {
  const { data } = await supabaseAdmin.from('profiles').select(`parrainage_config, ${CHAMPS_FORMULE}`).eq('id', proId).maybeSingle()
  if (!data || formuleDe(data) !== 'ultra') return null
  const c = (data as { parrainage_config?: ConfigParrainage | null }).parrainage_config
  if (!c?.active || !c.filleule || !c.ambassadrice) return null
  return c
}

export const normaliserCode = (c: unknown) => (typeof c === 'string' ? c.trim().toUpperCase().replace(/\s+/g, '') : '')

/** Le prix après un gain (même calcul que la fidélité). */
export function appliquerGain(prix: number, g: Gain): number {
  if (g.type === 'gratuit') return 0
  if (g.type === 'euros') return Math.max(0, prix - (Number(g.valeur) || 0))
  if (g.type === 'pourcentage') return Math.round(prix * (1 - (Number(g.valeur) || 0) / 100))
  return prix
}

/** La cliente qui porte ce code chez cette pro. */
export async function ambassadriceDuCode(proId: string, code: string) {
  if (!code || code.length > 20) return null
  const { data } = await supabaseAdmin.from('clientes').select('id, prenom')
    .eq('pro_id', proId).ilike('code_parrainage', code.replace(/[%_]/g, '')).limit(1).maybeSingle()
  return data as { id: string; prenom: string | null } | null
}

/**
 * Une vraie nouvelle cliente : fiche toute fraîche, aucun rendez-vous, jamais
 * parrainée. OU une amie déjà parrainée par CE code dont le rendez-vous a été
 * ANNULÉ (pas une absence) et qui n'est jamais venue : elle reprend
 * rendez-vous, son cadeau et le parrainage reviennent (Chadi, 7 nov. 2026).
 */
async function estNouvelle(clienteId: string, ambassadriceId: string): Promise<'nouvelle' | 'reprise' | null> {
  const [{ data: c }, { data: rdvs }, { data: deja }] = await Promise.all([
    supabaseAdmin.from('clientes').select('created_at, parrainee_par').eq('id', clienteId).maybeSingle(),
    supabaseAdmin.from('rendez_vous').select('statut, absente_le').eq('cliente_id', clienteId).limit(50),
    supabaseAdmin.from('parrainages').select('ambassadrice_id, annule_le, recompense_creditee_le').eq('filleule_id', clienteId).limit(1),
  ])
  if (!c) return null
  const liste = (rdvs ?? []) as { statut: string; absente_le: string | null }[]
  const p = ((deja ?? [])[0] ?? null) as { ambassadrice_id: string; annule_le: string | null; recompense_creditee_le: string | null } | null
  if (p) {
    const seulementAnnules = liste.every(r => r.statut === 'annule' && !r.absente_le)
    return p.ambassadrice_id === ambassadriceId && p.annule_le && !p.recompense_creditee_le && seulementAnnules ? 'reprise' : null
  }
  if (c.parrainee_par || liste.length > 0) return null
  return Date.now() - new Date(c.created_at as string).getTime() < 6 * 3600e3 ? 'nouvelle' : null
}

/**
 * Ce que le parrainage retire du prix, pour cette cliente et ce rendez-vous.
 * `prix` est celui qui reste après la fidélité et la réduction personnelle.
 */
export async function remiseParrainage(proId: string, clienteId: string | null, prix: number, codeDemande: unknown): Promise<{ prix: number; parrainage: ParrainageApplique | null }> {
  const rien = { prix, parrainage: null }
  if (!clienteId || prix <= 0) return rien
  const config = await configActive(proId)
  if (!config) return rien

  // ── L'amie, avec un code ──────────────────────────────────────────────────
  const code = normaliserCode(codeDemande)
  if (code) {
    const amb = await ambassadriceDuCode(proId, code)
    if (amb && amb.id !== clienteId && await estNouvelle(clienteId, amb.id)) {
      const gain = config.filleule as Gain
      const apres = appliquerGain(prix, gain)
      return { prix: apres, parrainage: { role: 'filleule', code, ambassadrice_id: amb.id, ambassadrice_prenom: amb.prenom ?? '', gain, montant: prix - apres } }
    }
    return rien
  }

  // ── L'amie qui reprend rendez-vous après une annulation : sans retaper le code ─
  const reprise = await repriseDe(clienteId)
  if (reprise) {
    const gain = config.filleule as Gain
    const apres = appliquerGain(prix, gain)
    return { prix: apres, parrainage: { role: 'filleule', code: reprise.code, ambassadrice_id: reprise.ambassadrice_id, ambassadrice_prenom: reprise.prenom, gain, montant: prix - apres } }
  }

  // ── L'ambassadrice : sa cagnotte, sinon une récompense en attente ─────────
  const { data: c } = await supabaseAdmin.from('clientes').select('cagnotte_parrainage, cagnotte_expire_le').eq('id', clienteId).maybeSingle()
  const cagnotte = Number(c?.cagnotte_parrainage) || 0
  const valable = !c?.cagnotte_expire_le || new Date(`${c.cagnotte_expire_le}T23:59:59`) >= new Date()
  if (cagnotte > 0 && valable) {
    const utilise = Math.min(cagnotte, prix)
    return { prix: prix - utilise, parrainage: { role: 'ambassadrice', cagnotte: utilise, parrainage_id: null, gain: null, montant: utilise } }
  }
  const { data: attente } = await supabaseAdmin.from('parrainages').select('id, recompense')
    .eq('ambassadrice_id', clienteId).not('recompense_creditee_le', 'is', null).is('recompense_utilisee_le', null)
    .in('recompense->>type', ['pourcentage', 'gratuit']).order('recompense_creditee_le', { ascending: true }).limit(1)
  const r = (attente ?? [])[0] as { id: string; recompense: Gain } | undefined
  if (r) {
    const apres = appliquerGain(prix, r.recompense)
    return { prix: apres, parrainage: { role: 'ambassadrice', cagnotte: 0, parrainage_id: r.id, gain: r.recompense, montant: prix - apres } }
  }
  return rien
}

/**
 * Une fois le rendez-vous créé : on enregistre qui a parrainé qui, ou on
 * consomme ce que l'ambassadrice a utilisé. Jamais bloquant pour la cliente.
 */
export async function enregistrerParrainage(proId: string, clienteId: string, rdvId: string, p: ParrainageApplique) {
  try {
    if (p.role === 'filleule') {
      const config = await configActive(proId)
      // Une amie qui reprend rendez-vous après une annulation : on rouvre sa ligne.
      await supabaseAdmin.from('parrainages').upsert({
        pro_id: proId, ambassadrice_id: p.ambassadrice_id, filleule_id: clienteId, rdv_id: rdvId,
        code: p.code, avantage_filleule: p.gain, recompense: config?.ambassadrice ?? null,
        annule_le: null, venue_le: null,
      }, { onConflict: 'filleule_id' })
      await supabaseAdmin.from('clientes').update({ parrainee_par: p.ambassadrice_id }).eq('id', clienteId)
      return
    }
    if (p.cagnotte > 0) {
      await supabaseAdmin.rpc('debiter_cagnotte_parrainage', { p_cliente: clienteId, p_montant: p.cagnotte })
    }
    if (p.parrainage_id) {
      await supabaseAdmin.from('parrainages').update({ recompense_utilisee_le: new Date().toISOString() })
        .eq('id', p.parrainage_id).is('recompense_utilisee_le', null)
    }
  } catch (e) {
    console.error('[parrainage] enregistrement', rdvId, e)
  }
}

/**
 * Ce qu'une cliente connue voit sur la page : son code, ce qu'il rapporte, et
 * ce qui l'attend (cagnotte ou récompense). Rien si le parrainage est éteint.
 */
export async function parrainageDe(proId: string, clienteId: string) {
  const config = await configActive(proId)
  if (!config) return null
  const [{ data: c }, { data: attente }] = await Promise.all([
    supabaseAdmin.from('clientes').select('code_parrainage, cagnotte_parrainage, cagnotte_expire_le').eq('id', clienteId).maybeSingle(),
    supabaseAdmin.from('parrainages').select('recompense').eq('ambassadrice_id', clienteId)
      .not('recompense_creditee_le', 'is', null).is('recompense_utilisee_le', null)
      .in('recompense->>type', ['pourcentage', 'gratuit']).order('recompense_creditee_le', { ascending: true }).limit(1),
  ])
  if (!c?.code_parrainage) return null
  const valable = !c.cagnotte_expire_le || new Date(`${c.cagnotte_expire_le}T23:59:59`) >= new Date()
  const reprise = await repriseDe(clienteId)
  return {
    reprise: reprise ? { prenom: reprise.prenom, gain: config.filleule } : null,
    code: c.code_parrainage as string,
    filleule: config.filleule,
    ambassadrice: config.ambassadrice,
    cagnotte: valable ? Number(c.cagnotte_parrainage) || 0 : 0,
    recompense: ((attente ?? [])[0] as { recompense: Gain } | undefined)?.recompense ?? null,
  }
}

/** Une amie dont le parrainage a été clos par une annulation, et qui revient. */
export async function repriseDe(clienteId: string): Promise<{ code: string; ambassadrice_id: string; prenom: string } | null> {
  const { data } = await supabaseAdmin.from('parrainages').select('code, ambassadrice_id, annule_le, recompense_creditee_le, amb:clientes!parrainages_ambassadrice_id_fkey(prenom)')
    .eq('filleule_id', clienteId).limit(1)
  const p = ((data ?? [])[0] ?? null) as unknown as { code: string; ambassadrice_id: string; annule_le: string | null; recompense_creditee_le: string | null; amb: { prenom: string | null } | null } | null
  if (!p || !p.annule_le || p.recompense_creditee_le) return null
  return (await estNouvelle(clienteId, p.ambassadrice_id)) === 'reprise'
    ? { code: p.code, ambassadrice_id: p.ambassadrice_id, prenom: p.amb?.prenom ?? '' }
    : null
}
