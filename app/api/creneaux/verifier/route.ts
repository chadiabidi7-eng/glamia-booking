import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { creneauReservable, minToTime, delaiEntreClientes } from '@/lib/creneaux'

// ─────────────────────────────────────────────────────────────────────────────
// CE CRÉNEAU EST-IL ENCORE LIBRE ? — À DEMANDER AVANT DE DÉBITER LA CARTE.
//
// LE 3 SEPTEMBRE 2026 À MINUIT, une cliente de Lmk Beautyroom a payé
// 21,58 CHF pour un rendez-vous à midi. Le serveur a refusé le créneau : la pro
// ne travaillait ce jour-là que de 17 h à 19 h. On lui a rendu son argent, elle
// a recommencé, payé de nouveau, refusé de nouveau. Trois fois en une minute.
//
// À chaque tour, la cliente était débitée puis remboursée — et les frais, eux,
// ne reviennent jamais. La pro s'est retrouvée à payer 4,74 CHF de frais pour
// trois transactions qu'elle n'avait pas demandées, sans le moindre rendez-vous
// en face. La cliente, elle, est repartie sans créneau.
//
// LA CAUSE N'EST PAS LE REFUS, C'EST L'ORDRE. On encaissait d'abord, on
// vérifiait ensuite. Cette route inverse les deux : la page la consulte juste
// avant de présenter la carte, et n'encaisse rien si le créneau a bougé.
//
// ELLE NE FAIT QUE LIRE, et elle répond vite : c'est une cliente qui attend
// devant son bouton de paiement.
//
// ⚠️ ELLE NE REMPLACE PAS LE CONTRÔLE DE `rdv/creer`. Entre cette vérification
// et l'écriture du rendez-vous, quelques secondes passent encore, et une autre
// cliente peut prendre la place. Le dernier mot reste à la création — celui-ci
// évite seulement de faire payer pour rien dans l'immense majorité des cas.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  let body: { pro_id?: unknown; date?: unknown; heure?: unknown; duree?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, raison: 'invalid_body' }, { status: 400 })
  }

  const proId = body.pro_id
  const date = body.date
  const heure = body.heure
  const duree = Number(body.duree)

  if (typeof proId !== 'string' || !/^[0-9a-f-]{36}$/i.test(proId)
    || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || typeof heure !== 'string' || !/^\d{2}:\d{2}$/.test(heure)
    || !Number.isFinite(duree) || duree <= 0) {
    return NextResponse.json({ ok: false, raison: 'invalid_params' }, { status: 400 })
  }

  try {
    const { data: pro } = await supabaseAdmin
      .from('profiles')
      .select('horaires, horaires_specifiques, creneaux_bloques, planning_variable, creneaux_a_la_suite, temps_preparation, temps_preparation_habituel, timezone')
      .eq('id', proId)
      .maybeSingle()

    if (!pro) return NextResponse.json({ ok: false, raison: 'pro_introuvable' }, { status: 404 })

    const { data: rdvs } = await supabaseAdmin
      .from('rendez_vous')
      .select('date, duree')
      .eq('pro_id', proId)
      .gte('date', `${date}T00:00:00.000Z`)
      .lte('date', `${date}T23:59:59.999Z`)
      .neq('statut', 'annule')

    const rdvExistants = (rdvs ?? []).map(r => {
      const d = new Date(r.date as string)
      return { heure: minToTime(d.getUTCHours() * 60 + d.getUTCMinutes()), duree: (r.duree as number) ?? 0 }
    })

    // Exactement le même juge que `rdv/creer`, avec exactement les mêmes
    // données. Deux règles différentes rouvriraient le défaut d'un autre côté :
    // une page qui laisse payer ce que la création refusera.
    const verdict = creneauReservable({
      date, heure, duree,
      horaires: (pro.horaires ?? {}) as never,
      rdvExistants,
      bloques: Array.isArray(pro.creneaux_bloques) ? pro.creneaux_bloques : [],
      horairesSpec: (pro.horaires_specifiques ?? {}) as never,
      planningVar: pro.planning_variable === true,
      aLaSuite: (pro as { creneaux_a_la_suite?: boolean }).creneaux_a_la_suite === true,
      preparation: delaiEntreClientes(pro as never),
      // Le serveur tourne en temps universel : sans le fuseau de la pro, le
      // délai minimum se calculerait avec des heures de décalage.
      fuseau: pro.timezone ?? undefined,
    })

    if (!verdict.ok) console.log('[creneaux/verifier] refus avant paiement', verdict.raison, proId, date, heure)
    return NextResponse.json(verdict)
  } catch (e) {
    // ── UNE PANNE ICI NE DOIT PAS BLOQUER UNE RÉSERVATION ────────────────────
    // Ce contrôle est un filet, pas un portier. S'il tombe, on répond « libre »
    // et on laisse le parcours continuer : la création vérifiera de toute
    // façon, et refusera si besoin. Refuser sur une panne de notre côté
    // empêcherait de vraies réservations d'aboutir.
    console.error('[creneaux/verifier]', e)
    return NextResponse.json({ ok: true, indisponible: true })
  }
}
