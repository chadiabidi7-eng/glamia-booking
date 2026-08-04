import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { creneauReservable, minToTime } from '@/lib/creneaux'

// ─────────────────────────────────────────────────────────────────────────────
// Guichet serveur — un créneau est-il encore réservable ?
//
// Constaté le 2 août 2026 : le contrôle fait juste avant d'enregistrer ne
// regardait que les AUTRES rendez-vous. Ni les créneaux bloqués, ni les
// horaires, ni les jours fermés. Une pro bloquait son après-midi depuis l'app,
// une page de réservation déjà ouverte gardait son ancienne grille, et la
// cliente réservait pendant qu'elle était chez le dentiste.
//
// Le serveur relit donc l'état RÉEL du profil au moment de confirmer. La grille
// affichée n'est plus qu'une proposition : c'est ici que ça se décide.
//
// À SAVOIR — ce guichet n'est pas un verrou. La création d'un rendez-vous reste
// une écriture anonyme directe, décision assumée du 19 juillet : c'est la seule
// action anonyme légitime. Une requête forgée peut donc encore contourner ce
// contrôle. Fermer cette porte est un autre chantier ; celui-ci règle le cas
// réel, la page périmée.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { pro_id, date, heure, duree, rdv_id } = body as {
      pro_id?: string; date?: string; heure?: string; duree?: number; rdv_id?: string
    }

    if (!pro_id || !date || !heure || typeof duree !== 'number' || duree <= 0) {
      return NextResponse.json({ error: 'parametres_invalides' }, { status: 400 })
    }

    const { data: pro, error: errPro } = await supabaseAdmin
      .from('profiles')
      .select('horaires, horaires_specifiques, creneaux_bloques, planning_variable, timezone')
      .eq('id', pro_id)
      .maybeSingle()

    if (errPro) return NextResponse.json({ error: 'lecture_profil' }, { status: 500 })
    if (!pro) return NextResponse.json({ error: 'pro_introuvable' }, { status: 404 })

    const { data: rdvs, error: errRdv } = await supabaseAdmin
      .from('rendez_vous')
      .select('id, date, duree')
      .eq('pro_id', pro_id)
      .gte('date', `${date}T00:00:00.000Z`)
      .lte('date', `${date}T23:59:59.999Z`)
      .neq('statut', 'annule')

    if (errRdv) return NextResponse.json({ error: 'lecture_rdv' }, { status: 500 })

    // Les heures sont stockées en heure murale posée sur UTC — même lecture que
    // partout ailleurs. Le rendez-vous qu'on est en train de DÉPLACER ne doit
    // pas se bloquer lui-même.
    const rdvExistants = (rdvs ?? [])
      .filter(r => !rdv_id || r.id !== rdv_id)
      .map(r => {
        const d = new Date(r.date as string)
        return { heure: minToTime(d.getUTCHours() * 60 + d.getUTCMinutes()), duree: (r.duree as number) ?? 0 }
      })

    const verdict = creneauReservable({
      date,
      heure,
      duree,
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
      console.log('[verifier-creneau] refus', verdict.raison, pro_id, date, heure)
    }
    return NextResponse.json(verdict)
  } catch (e) {
    console.error('[verifier-creneau] erreur', e)
    return NextResponse.json({ error: 'erreur_interne' }, { status: 500 })
  }
}
