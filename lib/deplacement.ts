import type { SupabaseClient } from '@supabase/supabase-js'
import { creneauReservable, delaiDe, delaiEntreClientes } from '@/lib/creneaux'
import { assistantesDe, assistanteValide, creneauxDe, dureeChezAssistante, fusionner, occupationsDe, profilHorairesPour, type SlotQui } from '@/lib/equipe'

// ─────────────────────────────────────────────────────────────────────────────
// DÉPLACER UN RENDEZ-VOUS CHEZ UNE PRO QUI A UNE ASSISTANTE (29 oct. 2026).
//
// À la réservation, la page montre les heures de la pro ET de son assistante,
// chacune avec ses horaires, ses rendez-vous et sa durée ; le serveur revérifie
// pour la personne choisie et note qui reçoit. Les déplacements (« Décaler mon
// RDV », changer ses soins et sa date, le lien du rappel, « Avancer ») ne
// connaissaient que la pro : le mardi, où seule l'assistante travaille, rien ne
// s'affichait ; et un décalage gardait l'assistante d'origine même quand la
// nouvelle heure était tenue par la pro.
//
// Ici, exactement la même règle qu'à la réservation :
//  · qui peut recevoir : la pro, et chaque assistante qui assure TOUS les
//    soins du rendez-vous, avec SA durée ;
//  · au moment d'enregistrer, l'heure est revérifiée pour la personne choisie
//    (ses heures, ses rendez-vous à elle, hors le rendez-vous qu'on déplace) ;
//  · le rendez-vous porte ensuite qui le fait (null = la pro).
//
// Pour une pro seule, `personnesPourDeplacement` rend null et chaque route
// garde son chemin d'avant, inchangé.
// ─────────────────────────────────────────────────────────────────────────────

export type TechniqueRdv = { nom: string; categorie: string; duree: number; quantite: number }
export type Personne = { id: string | null; duree: number }

/** Les soins d'un rendez-vous, sous une forme sûre (ce qui vient de la base ou d'une page). */
export function techniquesPropres(brut: unknown): TechniqueRdv[] {
  if (!Array.isArray(brut)) return []
  return brut
    .filter(t => t && typeof t === 'object' && typeof (t as { nom?: unknown }).nom === 'string')
    .map(t => {
      const x = t as { nom: string; categorie?: unknown; duree?: unknown; quantite?: unknown }
      const q = Number(x.quantite)
      return {
        nom: x.nom.trim(),
        categorie: typeof x.categorie === 'string' ? x.categorie : '',
        duree: Number(x.duree) > 0 ? Number(x.duree) : 0,
        quantite: Number.isFinite(q) && q > 0 ? q : 1,
      }
    })
}

/**
 * Qui peut recevoir ce rendez-vous, et en combien de temps. La pro d'abord
 * (comme à la réservation, elle passe en premier quand les deux sont libres).
 * `null` pour une pro seule : rien ne change pour elle.
 *
 * `actuelle` : qui fait le rendez-vous aujourd'hui. Sa durée enregistrée est
 * gardée telle quelle (la pro a pu l'ajuster dans l'app) ; les autres prennent
 * la leur, calculée sur les soins.
 */
export async function personnesPourDeplacement(
  admin: SupabaseClient, proId: string, techniques: TechniqueRdv[], dureePro: number,
  actuelle?: { id: string | null; duree: number },
): Promise<Personne[] | null> {
  const equipe = await assistantesDe(admin, proId)
  if (equipe.length === 0) return null
  const liste: Personne[] = [{ id: null, duree: dureePro }]
  for (const a of equipe) {
    // Sans soins détaillés (vieux rendez-vous), sa durée est celle du rendez-vous.
    const chezElle = techniques.length > 0 ? await dureeChezAssistante(admin, proId, a.id, techniques) : dureePro
    if (chezElle === null) continue // elle n'assure pas l'un des soins
    const garde = actuelle && actuelle.id === a.id && actuelle.duree > 0 ? actuelle.duree : null
    liste.push({ id: a.id, duree: garde ?? (chezElle > 0 ? chezElle : dureePro) })
  }
  return liste
}

type RdvLu = { techniques?: unknown; duree?: number | null; praticienne_id?: string | null }

/**
 * Les personnes possibles pour un rendez-vous qu'on déplace. Sans `nouveau`,
 * ses soins ne changent pas ; avec, ce sont les nouveaux soins et leur durée
 * catalogue (chemin « changer ses soins »).
 */
export async function personnesDuRdv(
  admin: SupabaseClient, proId: string, rdv: RdvLu,
  nouveau?: { techniques: TechniqueRdv[]; duree: number },
): Promise<Personne[] | null> {
  if (nouveau) return personnesPourDeplacement(admin, proId, nouveau.techniques, nouveau.duree)
  const techniques = techniquesPropres(rdv.techniques)
  const actuelle = { id: rdv.praticienne_id ?? null, duree: rdv.duree ?? 0 }
  const dureePro = actuelle.id === null && actuelle.duree > 0 ? actuelle.duree : dureeChezLaPro(techniques, rdv.duree)
  return personnesPourDeplacement(admin, proId, techniques, dureePro, actuelle)
}

/** L'heure est-elle libre POUR CETTE PERSONNE ? Même juge que la création d'un rendez-vous. */
export async function librePour(
  admin: SupabaseClient, proId: string, praticienneId: string | null,
  date: string, heure: string, duree: number, exclureRdv: string,
): Promise<{ ok: true } | { ok: false; raison: string; message: string }> {
  const profil = await profilHorairesPour(admin, proId, praticienneId)
  if (!profil) return { ok: false, raison: 'introuvable', message: '' }
  const occupations = await occupationsDe(admin, proId, praticienneId, date, date, exclureRdv)
  return creneauReservable({
    date, heure, duree,
    horaires: (profil.horaires ?? {}) as never,
    rdvExistants: occupations.get(date) ?? [],
    bloques: Array.isArray(profil.creneaux_bloques) ? profil.creneaux_bloques : [],
    horairesSpec: (profil.horaires_specifiques ?? {}) as never,
    planningVar: profil.planning_variable === true,
    joursDifferents: (profil.jours_differents ?? {}) as never,
    aLaSuite: profil.creneaux_a_la_suite === true,
    preparation: delaiEntreClientes(profil as never),
    delai: delaiDe(profil as never),
    fuseau: profil.timezone ?? undefined,
  })
}

export type VerdictDeplacement =
  | { equipe: false }
  | { equipe: true; ok: true; praticienneId: string | null; duree: number }
  | { equipe: true; ok: false; error: string; message?: string }

/**
 * Le juge d'un déplacement. `praticienneDemandee` est ce que la page envoie :
 * l'identifiant de l'assistante qui tient l'heure choisie, ou null/absent pour
 * la pro. Un identifiant qui n'est pas une assistante de cette pro, ou une
 * assistante qui n'assure pas ces soins, est refusé (appel forgé).
 */
export async function jugerDeplacement(admin: SupabaseClient, args: {
  proId: string; rdvId: string; nouvelleDate: string
  personnes: Personne[] | null; praticienneDemandee: unknown
}): Promise<VerdictDeplacement> {
  const demandee = typeof args.praticienneDemandee === 'string' && args.praticienneDemandee ? args.praticienneDemandee : null
  const personnes = args.personnes
  if (!personnes) {
    if (demandee) return { equipe: true, ok: false, error: 'assistante_inconnue' }
    return { equipe: false }
  }
  let personne: Personne | undefined = personnes[0]
  if (demandee) {
    if (!(await assistanteValide(admin, args.proId, demandee))) return { equipe: true, ok: false, error: 'assistante_inconnue' }
    personne = personnes.find(p => p.id === demandee)
    if (!personne) return { equipe: true, ok: false, error: 'prestation_inconnue' }
  }
  const jour = args.nouvelleDate.slice(0, 10)
  const heure = args.nouvelleDate.slice(11, 16)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour) || !/^\d{2}:\d{2}$/.test(heure)) return { equipe: true, ok: false, error: 'invalid_params' }
  const verdict = await librePour(admin, args.proId, personne.id, jour, heure, personne.duree, args.rdvId)
  if (!verdict.ok) {
    console.log('[deplacement] refus', verdict.raison, args.proId, args.rdvId, personne.id, args.nouvelleDate)
    return { equipe: true, ok: false, error: 'creneau_indisponible', message: verdict.message || undefined }
  }
  return { equipe: true, ok: true, praticienneId: personne.id, duree: personne.duree }
}

/** Durée du rendez-vous chez la pro : la somme des soins du catalogue, à défaut sa durée enregistrée. */
export function dureeChezLaPro(techniques: TechniqueRdv[], dureeEnregistree: number | null | undefined): number {
  const somme = techniques.reduce((s, t) => s + t.duree * t.quantite, 0)
  return somme > 0 ? somme : (dureeEnregistree ?? 60)
}

/** Le choix « avec qui » de la cliente : « peu_importe » (défaut), « pro », ou l'identifiant d'une assistante. */
export function selonChoix(personnes: Personne[], avec: unknown): Personne[] {
  if (avec === 'pro') return personnes.filter(p => p.id === null)
  if (typeof avec === 'string' && avec && avec !== 'peu_importe') return personnes.filter(p => p.id === avec)
  return personnes
}

/** Les heures de chacune, fusionnées : chaque heure dit qui la tient (la pro d'abord). */
export async function creneauxFusionnes(
  admin: SupabaseClient, proId: string, personnes: Personne[], dates: string[], exclureRdv?: string,
): Promise<Record<string, SlotQui[]>> {
  const parPersonne = await Promise.all(personnes.map(async p => ({
    id: p.id,
    creneaux: await creneauxDe(admin, proId, p.id, p.duree, dates, exclureRdv),
  })))
  return fusionner(dates, parPersonne)
}
