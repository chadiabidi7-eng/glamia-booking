import type { SupabaseClient } from '@supabase/supabase-js'
import { generateSlots, minToTime, delaiEntreClientes, type Slot } from '@/lib/creneaux'

// ─────────────────────────────────────────────────────────────────────────────
// ÉQUIPE — une pro, une assistante, et une page de réservation qui fusionne
// leurs horaires (5 septembre 2026).
//
// Tout appartient à la pro : le lien, le catalogue, les prix, les clientes, la
// caisse. L'assistante n'apporte que deux choses : SES HORAIRES (son profil)
// et SES DURÉES (equipe_prestations). Un rendez-vous est toujours posé chez la
// pro ; s'il est fait par l'assistante, il porte son identifiant
// (praticienne_id).
//
// La page calcule les créneaux de chaque personne séparément — chacune avec
// ses heures, ses rendez-vous, sa durée pour la prestation — puis les fusionne.
// Quand les deux sont libres à la même heure, la pro passe d'abord.
//
// Pour une pro seule, rien ne change : `assistantesDe` rend une liste vide et
// les routes reprennent leur chemin d'avant.
// ─────────────────────────────────────────────────────────────────────────────

export type Reglage = { assure: boolean; duree: number | null }
export type AssistanteResa = { id: string; prenom: string; prestations: Record<string, Reglage> }
export type SlotQui = Slot & { qui: string | null }

export const CHAMPS_HORAIRES = 'horaires, horaires_specifiques, creneaux_bloques, planning_variable, creneaux_a_la_suite, temps_preparation, temps_preparation_habituel, timezone'

type ProfilHoraires = {
  horaires: unknown; horaires_specifiques: unknown; creneaux_bloques: unknown; planning_variable: boolean | null
  creneaux_a_la_suite: boolean | null; temps_preparation: number | null; temps_preparation_habituel: number | null; timezone: string | null
}

/** Les assistantes actives d'une pro, avec ce qu'elles font et leurs durées. Vide pour une pro seule. */
export async function assistantesDe(admin: SupabaseClient, piloteId: string): Promise<AssistanteResa[]> {
  const { data } = await admin
    .from('profiles')
    .select('id, prenom, pseudo')
    .eq('pilote_id', piloteId)
    .is('equipe_retire_le', null)
    .is('equipe_suspendu_le', null)
    .order('created_at', { ascending: true })
    .limit(5)
  if (!data || data.length === 0) return []
  const ids = data.map(m => m.id as string)
  const { data: regl } = await admin
    .from('equipe_prestations')
    .select('membre_id, technique_id, assure, duree')
    .in('membre_id', ids)
    .limit(2000)
  const parMembre = new Map<string, Record<string, Reglage>>()
  for (const r of regl ?? []) {
    const carte = parMembre.get(r.membre_id as string) ?? {}
    carte[r.technique_id as string] = { assure: r.assure !== false, duree: (r.duree as number | null) ?? null }
    parMembre.set(r.membre_id as string, carte)
  }
  return data.map(m => ({
    id: m.id as string,
    prenom: (m.pseudo as string) || (m.prenom as string) || '',
    prestations: parMembre.get(m.id as string) ?? {},
  }))
}

/** L'assistante existe et travaille bien chez cette pro. */
export async function assistanteValide(admin: SupabaseClient, piloteId: string, praticienneId: string): Promise<{ id: string; prenom: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(praticienneId)) return null
  const { data } = await admin
    .from('profiles')
    .select('id, prenom, pseudo, pilote_id, equipe_retire_le, equipe_suspendu_le')
    .eq('id', praticienneId)
    .maybeSingle()
  if (!data || data.pilote_id !== piloteId || data.equipe_retire_le || data.equipe_suspendu_le) return null
  return { id: data.id as string, prenom: (data.pseudo as string) || (data.prenom as string) || '' }
}

/**
 * Le profil dont les HEURES comptent : celui de l'assistante quand c'est elle,
 * celui de la pro sinon. Le fuseau reste toujours celui de la pro : elles
 * travaillent au même endroit.
 */
export async function profilHorairesPour(admin: SupabaseClient, piloteId: string, praticienneId: string | null): Promise<ProfilHoraires | null> {
  const { data: pro } = await admin.from('profiles').select(CHAMPS_HORAIRES).eq('id', piloteId).maybeSingle()
  if (!pro) return null
  if (!praticienneId) return pro as ProfilHoraires
  const { data: elle } = await admin.from('profiles').select(CHAMPS_HORAIRES).eq('id', praticienneId).eq('pilote_id', piloteId).maybeSingle()
  if (!elle) return null
  return { ...(elle as ProfilHoraires), timezone: (pro as ProfilHoraires).timezone }
}

/** Les rendez-vous qui occupent CETTE personne (la pro : ceux sans assistante), rangés par jour. */
export async function occupationsDe(
  admin: SupabaseClient, piloteId: string, praticienneId: string | null, debut: string, fin: string, exclureRdv?: string,
): Promise<Map<string, { heure: string; duree: number }[]>> {
  let q = admin
    .from('rendez_vous')
    .select('id, date, duree')
    .eq('pro_id', piloteId)
    .gte('date', `${debut}T00:00:00.000Z`)
    .lte('date', `${fin}T23:59:59.999Z`)
    .neq('statut', 'annule')
  q = praticienneId ? q.eq('praticienne_id', praticienneId) : q.is('praticienne_id', null)
  const { data: rdvs } = await q
  const parJour = new Map<string, { heure: string; duree: number }[]>()
  for (const r of rdvs ?? []) {
    if (exclureRdv && r.id === exclureRdv) continue
    const d = new Date(r.date as string)
    const jour = (r.date as string).slice(0, 10)
    const liste = parJour.get(jour) ?? []
    liste.push({ heure: minToTime(d.getUTCHours() * 60 + d.getUTCMinutes()), duree: (r.duree as number) ?? 0 })
    parJour.set(jour, liste)
  }
  return parJour
}

/** Les rendez-vous existants d'une personne pour UN jour — pour le juge de création. */
export async function rdvExistantsDe(admin: SupabaseClient, piloteId: string, praticienneId: string | null, date: string) {
  const m = await occupationsDe(admin, piloteId, praticienneId, date, date)
  return m.get(date) ?? []
}

/** Les créneaux d'une personne sur des dates, avec ses heures et ses rendez-vous. */
export async function creneauxDe(
  admin: SupabaseClient, piloteId: string, praticienneId: string | null, duree: number, dates: string[], exclureRdv?: string,
): Promise<Record<string, Slot[]>> {
  const profil = await profilHorairesPour(admin, piloteId, praticienneId)
  if (!profil) return {}
  const triees = [...dates].sort()
  const parJour = await occupationsDe(admin, piloteId, praticienneId, triees[0], triees[triees.length - 1], exclureRdv)
  const resultat: Record<string, Slot[]> = {}
  for (const date of dates) {
    resultat[date] = generateSlots(
      date,
      duree,
      (profil.horaires ?? {}) as never,
      parJour.get(date) ?? [],
      Array.isArray(profil.creneaux_bloques) ? profil.creneaux_bloques : [],
      (profil.horaires_specifiques ?? {}) as never,
      profil.planning_variable === true,
      profil.timezone ?? undefined,
      profil.creneaux_a_la_suite === true,
      delaiEntreClientes(profil),
    )
  }
  return resultat
}

/**
 * La fusion. Chaque heure proposée par au moins une personne apparaît ; elle
 * est libre si l'une d'elles est libre, et dit QUI la tient : la première
 * libre dans l'ordre reçu (la pro d'abord).
 */
export function fusionner(dates: string[], parPersonne: { id: string | null; creneaux: Record<string, Slot[]> }[]): Record<string, SlotQui[]> {
  const fusion: Record<string, SlotQui[]> = {}
  for (const date of dates) {
    const parHeure = new Map<string, SlotQui>()
    for (const { id, creneaux } of parPersonne) {
      for (const s of creneaux[date] ?? []) {
        const deja = parHeure.get(s.heure)
        if (!deja) { parHeure.set(s.heure, { heure: s.heure, disponible: s.disponible, qui: s.disponible ? id : null }); continue }
        if (!deja.disponible && s.disponible) parHeure.set(s.heure, { heure: s.heure, disponible: true, qui: id })
      }
    }
    fusion[date] = [...parHeure.values()].sort((a, b) => a.heure.localeCompare(b.heure))
  }
  return fusion
}

/**
 * La durée d'un panier chez l'assistante : ses durées à elle, sinon celles du
 * catalogue. `null` si elle n'assure pas l'une des prestations — la page ne
 * l'aurait pas proposée, donc c'est un appel forgé.
 */
export async function dureeChezAssistante(
  admin: SupabaseClient, piloteId: string, praticienneId: string,
  techniques: { nom: string; categorie: string; duree: number; quantite: number }[],
): Promise<number | null> {
  const [{ data: cat }, { data: regl }] = await Promise.all([
    admin.from('prestations').select('data').eq('pro_id', piloteId).maybeSingle(),
    admin.from('equipe_prestations').select('technique_id, assure, duree').eq('membre_id', praticienneId).limit(500),
  ])
  const catalogue = (cat?.data ?? {}) as Record<string, { id?: string; nom?: string }[]>
  const reglages = new Map<string, Reglage>()
  for (const r of regl ?? []) reglages.set(r.technique_id as string, { assure: r.assure !== false, duree: (r.duree as number | null) ?? null })
  let total = 0
  for (const t of techniques) {
    const trouvee = (catalogue[t.categorie] ?? []).find(p => (p?.nom ?? '').trim() === t.nom)
    const reglage = trouvee?.id ? reglages.get(trouvee.id) : undefined
    if (reglage && !reglage.assure) return null
    total += (reglage?.duree ?? t.duree) * t.quantite
  }
  return total
}

/** « avec Sarah », dans la langue de la pro. */
export function avecPrenom(langue: string | null | undefined, prenom: string): string {
  const mot = langue === 'en' ? 'with' : langue === 'es' ? 'con' : 'avec'
  return `${mot} ${prenom}`
}
