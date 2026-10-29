import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { creneauReservable, delaiEntreClientes } from '@/lib/creneaux'
import { normaliserTelephone } from '@/lib/telephone'
import { delaiAvant } from '@/lib/heure-pro'
import { jugerDeplacement, librePour, personnesDuRdv, techniquesPropres } from '@/lib/deplacement'
import { assistanteValide, dureeChezAssistante } from '@/lib/equipe'
import { messageModification, prevenirDuDeplacement } from '@/lib/notif-deplacement'

// ─────────────────────────────────────────────────────────────────────────────
// Guichet serveur — modification des prestations d'un RDV par la CLIENTE.
// Chantier RLS (18 juil. 2026) : remplace l'écriture anonyme directe. Vérifie le
// téléphone de la cliente. Si la modif change aussi la date, applique les gardes
// de décalage (tardif avec paiement engagé, plafond 3).
// NB : le prix reçu est celui calculé par la page (comme avant) ; le recalcul
// autoritaire côté serveur (intégrité prix / C3) reste un raffinement à part,
// non régressif par rapport à l'écriture directe existante.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)


const SEUIL_TARDIVE_MS = 24 * 3600_000
const MAX_DECALAGES = 3

async function decalageBloque(rdvId: string, dateRdv: string, proId: string): Promise<boolean> {
  // À l'heure de la pro (12 oct. 2026) : lue en heure de Greenwich, la limite
  // tombait 2 h trop tard en France l'été, 4 h trop tôt aux Antilles.
  const { data: pro } = await supabaseAdmin.from('profiles').select('timezone').eq('id', proId).maybeSingle()
  if (delaiAvant(dateRdv, pro?.timezone as string | null) >= SEUIL_TARDIVE_MS) return false
  const { data } = await supabaseAdmin
    .from('paiements').select('id').eq('rdv_id', rdvId)
    .in('statut', ['empreinte_posee', 'acompte_paye', 'paye']).limit(1)
  return (data ?? []).length > 0
}

export async function POST(req: NextRequest) {
  let body: {
    rdv_id?: unknown; telephone?: unknown; techniques?: unknown; technique?: unknown
    specialite?: unknown; duree?: unknown; prix?: unknown; new_date?: unknown; praticienne_id?: unknown
  }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }) }

  const rdvId = body.rdv_id
  const telephone = body.telephone
  const newDate = typeof body.new_date === 'string' && body.new_date ? body.new_date : null
  if (typeof rdvId !== 'string' || !/^[0-9a-f-]{36}$/i.test(rdvId)
    || typeof telephone !== 'string' || telephone.trim().length < 6
    || !Array.isArray(body.techniques) || typeof body.technique !== 'string'
    || typeof body.specialite !== 'string' || typeof body.duree !== 'number') {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
  }

  const { data: rdv } = await supabaseAdmin
    .from('rendez_vous')
    .select('id, date, duree, techniques, praticienne_id, statut, nb_decalages, pro_id, cliente:clientes(telephone, prenom)')
    .eq('id', rdvId)
    .maybeSingle()
  if (!rdv) return NextResponse.json({ error: 'rdv_introuvable' }, { status: 404 })

  // ── VÉRIFICATION DE PROPRIÉTÉ ──
  const telRdv = (rdv as { cliente?: { telephone?: string } }).cliente?.telephone
  if (!telRdv || normaliserTelephone(telRdv) !== normaliserTelephone(telephone)) {
    return NextResponse.json({ error: 'non_autorise' }, { status: 403 })
  }
  if (rdv.statut === 'annule') {
    return NextResponse.json({ error: 'rdv_annule' }, { status: 409 })
  }

  const prix = typeof body.prix === 'number' && body.prix > 0 ? body.prix : null
  let praticienneApres: string | null = (rdv.praticienne_id as string | null) ?? null
  const patch: Record<string, unknown> = {
    techniques: body.techniques,
    technique: body.technique,
    specialite: body.specialite,
    duree: body.duree,
    prix,
  }

  // Modif AVEC changement de date → mêmes gardes que le décalage
  if (newDate) {
    if (await decalageBloque(rdv.id, rdv.date as string, rdv.pro_id as string)) {
      return NextResponse.json({ error: 'decalage_tardif' }, { status: 403 })
    }
    if (((rdv as { nb_decalages?: number }).nb_decalages ?? 0) >= MAX_DECALAGES) {
      return NextResponse.json({ error: 'decalage_max_atteint' }, { status: 403 })
    }
    // ── ÉQUIPE : même règle qu'à la réservation (29 oct. 2026) ────────────
    // Les nouveaux soins, chez la personne qui tient l'heure choisie (sa durée
    // à elle), revérifiés pour elle ; le rendez-vous note qui le fait. Une
    // assistante qui n'assure pas ces soins est refusée.
    const juge = await jugerDeplacement(supabaseAdmin, {
      proId: rdv.pro_id as string,
      rdvId: rdv.id as string,
      nouvelleDate: newDate,
      personnes: await personnesDuRdv(supabaseAdmin, rdv.pro_id as string, rdv as never, {
        techniques: techniquesPropres(body.techniques), duree: body.duree as number,
      }),
      praticienneDemandee: body.praticienne_id,
    })
    if (juge.equipe && !juge.ok) {
      return NextResponse.json({ error: juge.error, message: juge.message }, { status: juge.error === 'invalid_params' ? 400 : 409 })
    }
    if (juge.equipe && juge.ok) {
      patch.praticienne_id = juge.praticienneId
      patch.duree = juge.duree
      praticienneApres = juge.praticienneId
    } else {
      // Pro seule : le contrôle d'avant, inchangé.
      // LE CRÉNEAU EST-IL VRAIMENT LIBRE ? Ce guichet posait la nouvelle date
      // sans jamais le demander. La grille affichée le cachait bien, mais elle
      // vieillit dès qu'elle est dessinée : une page laissée ouverte, deux
      // clientes en même temps, et plus rien ne disait non.
      const refus = await creneauIndisponible(
        rdv.pro_id as string,
        rdv.id as string,
        newDate,
        body.duree as number,
      )
      if (refus) {
        return NextResponse.json({ error: 'creneau_indisponible', message: refus }, { status: 409 })
      }
    }

    patch.date = newDate
    patch.statut = 'en_attente'
    patch.nb_decalages = ((rdv as { nb_decalages?: number }).nb_decalages ?? 0) + 1
    // La trace pour la pro : l'ancienne date est gardée par la base (21 oct. 2026).
    patch.decale_par = 'cliente'
    patch.decale_le = new Date().toISOString()
    patch.rappel_envoye_count = 0
    patch.rappel_envoye_at = null
  } else if (rdv.praticienne_id) {
    // ── ÉQUIPE, MÊME HEURE : le rendez-vous reste chez l'assistante ───────
    // Les nouveaux soins prennent SA durée ; si elle ne les assure pas, ou si
    // sa nouvelle durée ne tient plus à cette heure, on refuse (la page fait
    // alors choisir une autre heure).
    const elle = await assistanteValide(supabaseAdmin, rdv.pro_id as string, rdv.praticienne_id as string)
    if (elle) {
      const techs = techniquesPropres(body.techniques)
      const chezElle = techs.length > 0 ? await dureeChezAssistante(supabaseAdmin, rdv.pro_id as string, elle.id, techs) : (body.duree as number)
      if (chezElle === null) return NextResponse.json({ error: 'prestation_inconnue' }, { status: 409 })
      const duree = chezElle > 0 ? chezElle : (body.duree as number)
      if (duree > ((rdv.duree as number) ?? 0)) {
        const iso = rdv.date as string
        const v = await librePour(supabaseAdmin, rdv.pro_id as string, elle.id, iso.slice(0, 10), iso.slice(11, 16), duree, rdv.id as string)
        if (!v.ok) return NextResponse.json({ error: 'creneau_indisponible', message: v.message || undefined }, { status: 409 })
      }
      patch.duree = duree
    }
  }

  const { error: updErr } = await supabaseAdmin
    .from('rendez_vous').update(patch).eq('id', rdvId).neq('statut', 'annule')
  if (updErr) return NextResponse.json({ error: 'update_failed' }, { status: 500 })

  // ── LA PRO EST PRÉVENUE PAR LE SERVEUR (29 oct. 2026) ──────────────────
  // Avant, depuis le navigateur de la cliente. L'assistante concernée aussi.
  await prevenirDuDeplacement(supabaseAdmin, {
    proId: rdv.pro_id as string,
    rdvId,
    praticiennes: [rdv.praticienne_id as string | null, praticienneApres],
    message: messageModification(
      ((rdv as { cliente?: { prenom?: string } }).cliente?.prenom ?? '').trim(),
      newDate ?? (rdv.date as string),
      body.technique as string,
    ),
    origine: 'api/rdv/modifier-prestations',
  })

  return NextResponse.json({ success: true })
}

/**
 * Le créneau visé est-il réellement réservable ? Renvoie le motif du refus, ou
 * `null` si tout va bien. Mêmes règles que pour une réservation neuve :
 * horaires, journées fermées, créneaux bloqués — calendrier iPhone compris —,
 * planning variable, délai minimum, et les autres rendez-vous du jour.
 */
async function creneauIndisponible(
  proId: string, rdvId: string, nouvelleDate: string, duree: number,
): Promise<string | null> {
  const jour = nouvelleDate.slice(0, 10)
  const heure = nouvelleDate.slice(11, 16)

  const { data: pro } = await supabaseAdmin
    .from('profiles')
    .select('horaires, horaires_specifiques, jours_differents, creneaux_bloques, planning_variable, creneaux_a_la_suite, temps_preparation, temps_preparation_habituel, timezone')
    .eq('id', proId)
    .maybeSingle()
  // Profil illisible : on ne bloque pas une cliente sur une panne de lecture.
  if (!pro) return null

  const { data: autres } = await supabaseAdmin
    .from('rendez_vous')
    .select('date, duree')
    .eq('pro_id', proId)
    .gte('date', `${jour}T00:00:00.000Z`)
    .lte('date', `${jour}T23:59:59.999Z`)
    .neq('statut', 'annule')
    // Son propre rendez-vous ne doit pas lui barrer la route.
    .neq('id', rdvId)

  const verdict = creneauReservable({
    date: jour,
    heure,
    duree,
    joursDifferents: (((pro as any) as { jours_differents?: unknown }).jours_differents ?? {}) as never,
    horaires: ((pro as any).horaires ?? {}) as never,
    rdvExistants: (autres ?? []).map(r => {
      const d = new Date(r.date)
      return {
        heure: `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`,
        duree: r.duree,
      }
    }),
    bloques: Array.isArray((pro as any).creneaux_bloques) ? (pro as any).creneaux_bloques : [],
    horairesSpec: ((pro as any).horaires_specifiques ?? {}) as never,
    planningVar: (pro as any).planning_variable === true,
      aLaSuite: (pro as any).creneaux_a_la_suite === true,
      preparation: delaiEntreClientes(pro as any),
    fuseau: (pro as any).timezone ?? undefined,
  })

  return verdict.ok ? null : verdict.message
}
