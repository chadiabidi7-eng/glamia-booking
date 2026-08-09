import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { creneauReservable } from '@/lib/creneaux'

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

function normalizePhone(tel: string): string {
  let n = tel.replace(/[\s\-.()]/g, '')
  if (n.startsWith('+33')) n = '0' + n.slice(3)
  if (n.startsWith('0033')) n = '0' + n.slice(4)
  return n
}

const SEUIL_TARDIVE_MS = 24 * 3600_000
const MAX_DECALAGES = 3

async function decalageBloque(rdvId: string, dateRdv: string): Promise<boolean> {
  if (new Date(dateRdv).getTime() - Date.now() >= SEUIL_TARDIVE_MS) return false
  const { data } = await supabaseAdmin
    .from('paiements').select('id').eq('rdv_id', rdvId)
    .in('statut', ['empreinte_posee', 'acompte_paye', 'paye']).limit(1)
  return (data ?? []).length > 0
}

export async function POST(req: NextRequest) {
  let body: {
    rdv_id?: unknown; telephone?: unknown; techniques?: unknown; technique?: unknown
    specialite?: unknown; duree?: unknown; prix?: unknown; new_date?: unknown
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
    .select('id, date, statut, nb_decalages, pro_id, cliente:clientes(telephone)')
    .eq('id', rdvId)
    .maybeSingle()
  if (!rdv) return NextResponse.json({ error: 'rdv_introuvable' }, { status: 404 })

  // ── VÉRIFICATION DE PROPRIÉTÉ ──
  const telRdv = (rdv as { cliente?: { telephone?: string } }).cliente?.telephone
  if (!telRdv || normalizePhone(telRdv) !== normalizePhone(telephone)) {
    return NextResponse.json({ error: 'non_autorise' }, { status: 403 })
  }
  if (rdv.statut === 'annule') {
    return NextResponse.json({ error: 'rdv_annule' }, { status: 409 })
  }

  const prix = typeof body.prix === 'number' && body.prix > 0 ? body.prix : null
  const patch: Record<string, unknown> = {
    techniques: body.techniques,
    technique: body.technique,
    specialite: body.specialite,
    duree: body.duree,
    prix,
  }

  // Modif AVEC changement de date → mêmes gardes que le décalage
  if (newDate) {
    if (await decalageBloque(rdv.id, rdv.date as string)) {
      return NextResponse.json({ error: 'decalage_tardif' }, { status: 403 })
    }
    if (((rdv as { nb_decalages?: number }).nb_decalages ?? 0) >= MAX_DECALAGES) {
      return NextResponse.json({ error: 'decalage_max_atteint' }, { status: 403 })
    }
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

    patch.date = newDate
    patch.statut = 'en_attente'
    patch.nb_decalages = ((rdv as { nb_decalages?: number }).nb_decalages ?? 0) + 1
    patch.rappel_envoye_count = 0
    patch.rappel_envoye_at = null
  }

  const { error: updErr } = await supabaseAdmin
    .from('rendez_vous').update(patch).eq('id', rdvId).neq('statut', 'annule')
  if (updErr) return NextResponse.json({ error: 'update_failed' }, { status: 500 })

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
    .select('horaires, horaires_specifiques, creneaux_bloques, planning_variable, creneaux_a_la_suite, temps_preparation, timezone')
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
      preparation: (pro as any).temps_preparation ?? 0,
    fuseau: (pro as any).timezone ?? undefined,
  })

  return verdict.ok ? null : verdict.message
}
