import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { generateSlots, minToTime, type Slot } from '@/lib/creneaux'

// ─────────────────────────────────────────────────────────────────────────────
// Guichet serveur — les créneaux libres d'une ou plusieurs journées.
//
// La page lisait `rendez_vous` avec la clé publique pour savoir quelles heures
// étaient prises. Elle recevait donc les rendez-vous eux-mêmes, et la règle
// autorisant cette lecture ne distinguait pas une pro d'une autre : 3 340
// rendez-vous lisibles, dates, prestations et prix compris.
//
// Le serveur calcule et ne renvoie QUE des heures libres ou occupées. Il ne
// dit jamais QUI occupe, ni pour quelle prestation, ni à quel prix. Une
// cliente n'a pas à savoir ce que fait celle d'avant.
//
// Plusieurs dates en un appel : la recherche du prochain créneau balaie
// jusqu'à 90 jours. En une requête par jour, c'était 90 allers-retours.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const MAX_DATES = 95

export async function POST(req: NextRequest) {
  try {
    const { pro_id, duree, dates, exclure_rdv } = await req.json() as {
      pro_id?: string; duree?: number; dates?: string[]; exclure_rdv?: string
    }

    if (!pro_id || typeof duree !== 'number' || duree <= 0 || !Array.isArray(dates) || dates.length === 0) {
      return NextResponse.json({ error: 'parametres_invalides' }, { status: 400 })
    }
    if (dates.length > MAX_DATES) {
      return NextResponse.json({ error: 'trop_de_dates' }, { status: 400 })
    }

    const { data: pro } = await supabaseAdmin
      .from('profiles')
      .select('horaires, horaires_specifiques, creneaux_bloques, planning_variable, timezone')
      .eq('id', pro_id)
      .maybeSingle()

    if (!pro) return NextResponse.json({ error: 'pro_introuvable' }, { status: 404 })

    const triees = [...dates].sort()
    const { data: rdvs } = await supabaseAdmin
      .from('rendez_vous')
      .select('id, date, duree')
      .eq('pro_id', pro_id)
      .gte('date', `${triees[0]}T00:00:00.000Z`)
      .lte('date', `${triees[triees.length - 1]}T23:59:59.999Z`)
      .neq('statut', 'annule')

    // Heures murales posées sur UTC — même lecture que partout ailleurs.
    // Le rendez-vous qu'on déplace ne doit pas se bloquer lui-même.
    const parJour = new Map<string, { heure: string; duree: number }[]>()
    for (const r of rdvs ?? []) {
      if (exclure_rdv && r.id === exclure_rdv) continue
      const d = new Date(r.date as string)
      const jour = (r.date as string).slice(0, 10)
      const liste = parJour.get(jour) ?? []
      liste.push({ heure: minToTime(d.getUTCHours() * 60 + d.getUTCMinutes()), duree: (r.duree as number) ?? 0 })
      parJour.set(jour, liste)
    }

    const resultat: Record<string, Slot[]> = {}
    for (const date of dates) {
      resultat[date] = generateSlots(
        date,
        duree,
        (pro.horaires ?? {}) as never,
        parJour.get(date) ?? [],
        Array.isArray(pro.creneaux_bloques) ? pro.creneaux_bloques : [],
        (pro.horaires_specifiques ?? {}) as never,
        pro.planning_variable === true,
        // Idem : c'est l'heure CHEZ LA PRO qui décide, pas celle du serveur.
        pro.timezone ?? undefined,
      )
    }

    return NextResponse.json({ creneaux: resultat })
  } catch (e) {
    console.error('[creneaux] erreur', e)
    return NextResponse.json({ error: 'erreur_interne' }, { status: 500 })
  }
}
