import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { creneauReservable, minToTime } from '@/lib/creneaux'

// ─────────────────────────────────────────────────────────────────────────────
// Guichet serveur — créer une réservation.
//
// La page insérait directement, puis RELISAIT la ligne créée pour récupérer son
// identifiant (`.insert().select('id')`). C'est ce qui a cassé la production le
// 2 août : en retirant le droit de lecture sur `rendez_vous`, la relecture est
// tombée avec. Une écriture qui renvoie une donnée a besoin du droit de lire.
//
// Le serveur crée et renvoie l'identifiant : la page n'a plus rien à lire.
//
// Il vérifie AUSSI que le créneau est libre, dans le même appel. Avant, la
// vérification et l'insertion étaient deux gestes séparés : entre les deux,
// quelqu'un pouvait prendre la place. Et surtout, l'insertion étant ouverte en
// anonyme, une requête forgée sautait simplement la vérification.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { pro_id, cliente_id, date, heure, duree } = body as {
      pro_id?: string; cliente_id?: string; date?: string; heure?: string; duree?: number
    }

    if (!pro_id || !cliente_id || !date || !heure || typeof duree !== 'number' || duree <= 0) {
      return NextResponse.json({ error: 'parametres_invalides' }, { status: 400 })
    }

    const { data: pro } = await supabaseAdmin
      .from('profiles')
      .select('horaires, horaires_specifiques, creneaux_bloques, planning_variable, timezone')
      .eq('id', pro_id)
      .maybeSingle()

    if (!pro) return NextResponse.json({ error: 'pro_introuvable' }, { status: 404 })

    const { data: rdvs } = await supabaseAdmin
      .from('rendez_vous')
      .select('date, duree')
      .eq('pro_id', pro_id)
      .gte('date', `${date}T00:00:00.000Z`)
      .lte('date', `${date}T23:59:59.999Z`)
      .neq('statut', 'annule')

    const rdvExistants = (rdvs ?? []).map(r => {
      const d = new Date(r.date as string)
      return { heure: minToTime(d.getUTCHours() * 60 + d.getUTCMinutes()), duree: (r.duree as number) ?? 0 }
    })

    const verdict = creneauReservable({
      date, heure, duree,
      horaires: (pro.horaires ?? {}) as never,
      rdvExistants,
      bloques: Array.isArray(pro.creneaux_bloques) ? pro.creneaux_bloques : [],
      horairesSpec: (pro.horaires_specifiques ?? {}) as never,
      planningVar: pro.planning_variable === true,
      // Le serveur tourne en temps universel : sans ça, le délai minimum se
      // calculerait avec deux heures de retard sur l'heure réelle de la pro.
      fuseau: pro.timezone ?? undefined,
    })

    if (!verdict.ok) {
      console.log('[rdv/creer] refus', verdict.raison, pro_id, date, heure)
      return NextResponse.json({ ...verdict, ok: false }, { status: 409 })
    }

    const { data: cree, error } = await supabaseAdmin
      .from('rendez_vous')
      .insert({
        pro_id,
        cliente_id,
        date: `${date}T${heure}:00.000Z`,
        duree,
        specialite: body.specialite ?? null,
        technique: body.technique ?? null,
        techniques: body.techniques ?? [],
        prix: typeof body.prix === 'number' && body.prix > 0 ? body.prix : null,
        statut: 'en_attente',
        notes: body.notes || null,
        demande_rappel: body.demande_rappel === true,
        fidelite_appliquee: body.fidelite_appliquee ?? null,
        reduction_appliquee: body.reduction_appliquee ?? null,
        source: 'booking',
      })
      .select('id')
      .single()

    if (error) {
      console.error('[rdv/creer] insertion', error.message)
      return NextResponse.json({ error: 'creation' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, id: cree.id })
  } catch (e) {
    console.error('[rdv/creer] erreur', e)
    return NextResponse.json({ error: 'erreur_interne' }, { status: 500 })
  }
}
