import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// ÉQUIPE — de qui est quoi, quand plusieurs personnes travaillent ensemble
// (4 septembre 2026, lot 2).
//
// Jusqu'ici une réservation ne connaissait qu'UNE pro : son agenda, son
// catalogue, son fichier clientes, sa caisse, son salon — tout portait le même
// identifiant. Avec une équipe, ces cinq choses peuvent appartenir à des
// comptes différents :
//
//   • l'AGENDA est toujours celui de la praticienne choisie ;
//   • le SALON (règlement, accueil, adresse, avis, fidélité, règles d'acompte)
//     est celui du pilote pour une collaboratrice, le sien pour une
//     indépendante rattachée ;
//   • le FICHIER CLIENTES est celui du pilote quand elle l'a partagé ;
//   • la CAISSE est celle du pilote quand ses acomptes y vont ;
//   • le CATALOGUE est celui du pilote pour une collaboratrice, avec ses
//     surcharges (ce qu'elle assure, sa durée).
//
// Toutes les routes appellent `contexteDe(praticienne)` et se servent du bon
// identifiant pour chaque chose. Pour une pro seule, les cinq sont égaux :
// rien ne change pour les 800 pros qui n'ont pas d'équipe.
// ─────────────────────────────────────────────────────────────────────────────

export type Droits = { paiement_pilote?: boolean; clientes_partagees?: boolean; visibilite_agenda?: boolean; lien_propre?: boolean }
export type Role = 'collaboratrice' | 'independante' | null

export type Contexte = {
  /** La praticienne : son agenda, ses rendez-vous, ses notifications. */
  id: string
  agendaId: string
  salonId: string
  fichierId: string
  caisseId: string
  catalogueId: string
  /** Les surcharges (assure / durée) à appliquer sur le catalogue, ou null. */
  surchargesDe: string | null
  membre: boolean
  role: Role
  droits: Droits
  piloteId: string | null
  suspendu: boolean
  retire: boolean
}

type LigneProfil = {
  id: string; pilote_id: string | null; role_equipe: string | null; equipe_droits: Droits | null
  equipe_retire_le: string | null; equipe_suspendu_le: string | null
}

export async function contexteDe(admin: SupabaseClient, proId: string): Promise<Contexte> {
  const seule: Contexte = {
    id: proId, agendaId: proId, salonId: proId, fichierId: proId, caisseId: proId, catalogueId: proId,
    surchargesDe: null, membre: false, role: null, droits: {}, piloteId: null, suspendu: false, retire: false,
  }
  const { data } = await admin
    .from('profiles')
    .select('id, pilote_id, role_equipe, equipe_droits, equipe_retire_le, equipe_suspendu_le')
    .eq('id', proId)
    .maybeSingle()
  const p = data as LigneProfil | null
  if (!p || !p.pilote_id || p.equipe_retire_le) return seule

  const droits = (p.equipe_droits ?? {}) as Droits
  const collab = p.role_equipe === 'collaboratrice'
  return {
    id: proId,
    agendaId: proId,
    salonId: collab ? p.pilote_id : proId,
    fichierId: droits.clientes_partagees ? p.pilote_id : proId,
    caisseId: collab && droits.paiement_pilote ? p.pilote_id : proId,
    catalogueId: collab ? p.pilote_id : proId,
    surchargesDe: collab ? proId : null,
    membre: true,
    role: collab ? 'collaboratrice' : 'independante',
    droits,
    piloteId: p.pilote_id,
    suspendu: !!p.equipe_suspendu_le,
    retire: false,
  }
}

type Technique = { id?: string; nom?: string; active?: boolean; prix?: number; duree?: number; [k: string]: unknown }
export type Catalogue = Record<string, Technique[]>

/** Le catalogue effectif de la praticienne : celui de sa source, surchargé. */
export async function catalogueDe(admin: SupabaseClient, ctx: Contexte): Promise<{ data: Catalogue | null; ordre_categories: string[] | null }> {
  const { data: prest } = await admin
    .from('prestations')
    .select('data, ordre_categories')
    .eq('pro_id', ctx.catalogueId)
    .maybeSingle()
  const base = (prest?.data ?? null) as Catalogue | null
  const ordre = (prest?.ordre_categories ?? null) as string[] | null
  if (!base || !ctx.surchargesDe) return { data: base, ordre_categories: ordre }

  const { data: surch } = await admin
    .from('equipe_prestations')
    .select('technique_id, assure, duree')
    .eq('membre_id', ctx.surchargesDe)
  const carte = new Map<string, { assure: boolean; duree: number | null }>()
  for (const s of surch ?? []) carte.set(s.technique_id as string, { assure: s.assure !== false, duree: (s.duree as number | null) ?? null })

  const fusion: Catalogue = {}
  for (const [cat, techs] of Object.entries(base)) {
    fusion[cat] = (Array.isArray(techs) ? techs : []).map(t => {
      const s = t?.id ? carte.get(t.id) : undefined
      if (!s) return t
      return { ...t, active: t.active !== false && s.assure, duree: s.duree ?? t.duree }
    })
  }
  return { data: fusion, ordre_categories: ordre }
}

export type MembreSalon = { id: string; prenom: string; nom: string | null; pseudo: string | null; avatar_url: string | null; role: Role }

/** Les membres actifs d'un salon (sans le pilote). Vide pour une pro seule. */
export async function membresDuSalon(admin: SupabaseClient, piloteId: string): Promise<MembreSalon[]> {
  const { data } = await admin
    .from('profiles')
    .select('id, prenom, nom, pseudo, avatar_url, photo_url, role_equipe')
    .eq('pilote_id', piloteId)
    .is('equipe_retire_le', null)
    .is('equipe_suspendu_le', null)
    .order('created_at', { ascending: true })
  return (data ?? []).map(m => ({
    id: m.id as string, prenom: (m.prenom as string) ?? '', nom: (m.nom as string) ?? null, pseudo: (m.pseudo as string) ?? null,
    avatar_url: ((m.avatar_url ?? m.photo_url) as string) ?? null, role: (m.role_equipe as Role) ?? 'collaboratrice',
  }))
}

/** Les téléphones à prévenir d'un rendez-vous : la praticienne, et son pilote s'il a la visibilité. */
export async function destinatairesPush(admin: SupabaseClient, ctx: Contexte): Promise<string[]> {
  const ids = [ctx.agendaId]
  if (ctx.membre && ctx.piloteId && ctx.droits.visibilite_agenda) ids.push(ctx.piloteId)
  return ids
}
