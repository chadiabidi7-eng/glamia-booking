import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { contexteDe, catalogueDe, membresDuSalon, destinatairesPush } from '@/lib/equipe'

import { generateSlots, minToTime, delaiEntreClientes } from '@/lib/creneaux'

// ─────────────────────────────────────────────────────────────────────────────
// LA PROCHAINE DISPONIBILITÉ, DÈS L'OUVERTURE DE LA PAGE.
//
// Une cliente qui arrive ne sait pas si la pro est prise pour trois semaines ou
// libre demain. Elle doit choisir une prestation, puis ouvrir le calendrier,
// puis chercher — trois écrans avant la seule information qui décide de tout.
// On la lui donne tout de suite : « Prochaine dispo le 18 août à 14h00 ».
//
// LE CALCUL SE FAIT ICI, PAS DANS SON NAVIGATEUR. Balayer quatre-vingt-dix
// jours de créneaux depuis le téléphone, c'est envoyer des milliers d'heures
// pour n'en garder qu'une. Le serveur cherche et ne renvoie que la réponse.
//
// LA DURÉE EST CELLE DE LA PRESTATION LA PLUS COURTE. C'est la seule qui
// réponde vraiment à « est-ce qu'il reste quelque chose ». Prendre une durée
// moyenne annoncerait « complet » à une cliente qui aurait pu obtenir une pose
// simple, et une pro perdrait un rendez-vous pour un calcul.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** Au-delà, on ne dit plus rien : « dans quatre mois » n'aide personne. */
const HORIZON_JOURS = 90

/** Repli quand le catalogue ne dit rien d'utilisable. */
const DUREE_PAR_DEFAUT = 30

export async function POST(req: NextRequest) {
  try {
    const { pro_id } = await req.json() as { pro_id?: string }
    if (!pro_id || !/^[0-9a-f-]{36}$/i.test(pro_id)) {
      return NextResponse.json({ error: 'pro_invalide' }, { status: 400 })
    }

    const [{ data: pro }, { data: catalogue }] = await Promise.all([
      supabaseAdmin
        .from('profiles')
        .select('horaires, horaires_specifiques, creneaux_bloques, planning_variable, creneaux_a_la_suite, temps_preparation, temps_preparation_habituel, timezone')
        .eq('id', pro_id)
        .maybeSingle(),
      contexteDe(supabaseAdmin, pro_id).then(ctx => catalogueDe(supabaseAdmin, ctx)),
    ])
    if (!pro) return NextResponse.json({ error: 'pro_introuvable' }, { status: 404 })

    // ── LA PLUS COURTE DE SES PRESTATIONS ──
    let duree = DUREE_PAR_DEFAUT
    const data = (catalogue?.data ?? {}) as Record<string, unknown>
    const durees: number[] = []
    for (const liste of Object.values(data)) {
      if (!Array.isArray(liste)) continue
      for (const t of liste) {
        const item = t as { duree?: unknown; active?: unknown }
        if (item?.active === false) continue
        const d = Number(item?.duree)
        if (Number.isFinite(d) && d > 0) durees.push(d)
      }
    }
    if (durees.length) duree = Math.min(...durees)

    // ── LES JOURS À BALAYER ──
    // On part d'aujourd'hui CHEZ LA PRO : à 23 h en Guadeloupe, le serveur est
    // déjà demain, et on lui ferait sauter une journée entière.
    const fuseau = (pro.timezone as string) || 'Europe/Paris'
    const aujourdhui = new Date(
      new Intl.DateTimeFormat('en-CA', { timeZone: fuseau }).format(new Date()) + 'T00:00:00Z',
    )
    const jours: string[] = []
    for (let i = 0; i < HORIZON_JOURS; i++) {
      jours.push(new Date(aujourdhui.getTime() + i * 86400000).toISOString().slice(0, 10))
    }

    const { data: rdvs } = await supabaseAdmin
      .from('rendez_vous')
      .select('date, duree')
      .eq('pro_id', pro_id)
      .neq('statut', 'annule')
      .gte('date', `${jours[0]}T00:00:00.000Z`)
      .lte('date', `${jours[jours.length - 1]}T23:59:59.999Z`)

    const parJour = new Map<string, { heure: string; duree: number }[]>()
    for (const r of rdvs ?? []) {
      const iso = r.date as string
      const d = new Date(iso)
      const jour = iso.slice(0, 10)
      const liste = parJour.get(jour) ?? []
      liste.push({ heure: minToTime(d.getUTCHours() * 60 + d.getUTCMinutes()), duree: (r.duree as number) ?? 0 })
      parJour.set(jour, liste)
    }

    // On s'arrête au PREMIER créneau trouvé : inutile de calculer la suite.
    for (const jour of jours) {
      const slots = generateSlots(
        jour,
        duree,
        (pro.horaires ?? {}) as never,
        parJour.get(jour) ?? [],
        Array.isArray(pro.creneaux_bloques) ? pro.creneaux_bloques : [],
        (pro.horaires_specifiques ?? {}) as never,
        pro.planning_variable === true,
        pro.timezone ?? undefined,
        pro.creneaux_a_la_suite === true,
        delaiEntreClientes(pro),
      )
      const premier = slots.find(s => s.disponible)
      if (premier) {
        return NextResponse.json({ date: jour, heure: premier.heure, duree })
      }
    }

    // Rien dans les trois mois : on ne dit rien plutôt que d'annoncer un vide.
    return NextResponse.json({ date: null, heure: null })
  } catch (e) {
    console.error('[api/pro/prochaine-dispo]', e)
    return NextResponse.json({ error: 'erreur_interne' }, { status: 500 })
  }
}
