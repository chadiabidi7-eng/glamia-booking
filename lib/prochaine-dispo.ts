import type { SupabaseClient } from '@supabase/supabase-js'
import { generateSlots, minToTime, delaiEntreClientes, delaiDe } from '@/lib/creneaux'
import { assistantesDe, creneauxDe } from '@/lib/equipe'

// ─────────────────────────────────────────────────────────────────────────────
// LA PROCHAINE DISPONIBILITÉ D'UNE PRO — sortie de /api/pro/prochaine-dispo
// pour servir aussi la recherche des clientes (/beaute/[ville]). Même calcul,
// même règle : la plus courte de ses prestations, à partir d'aujourd'hui chez
// elle, la pro ou son assistante, le premier créneau trouvé.
// ─────────────────────────────────────────────────────────────────────────────

/** Repli quand le catalogue ne dit rien d'utilisable. */
const DUREE_PAR_DEFAUT = 30

export type ProchaineDispo = { date: string; heure: string; qui: string | null; duree: number }

/** `undefined` : pro introuvable. `null` : rien dans l'horizon. */
export async function prochaineDispo(admin: SupabaseClient, pro_id: string, horizon = 90): Promise<ProchaineDispo | null | undefined> {
    const [{ data: pro }, { data: catalogue }] = await Promise.all([
      admin
        .from('profiles')
        .select('horaires, horaires_specifiques, creneaux_bloques, planning_variable, creneaux_a_la_suite, temps_preparation, temps_preparation_habituel, timezone, delai_resa_min, resa_jour_meme')
        .eq('id', pro_id)
        .maybeSingle(),
      admin.from('prestations').select('data').eq('pro_id', pro_id).maybeSingle(),
    ])
    if (!pro) return undefined

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
    for (let i = 0; i < horizon; i++) {
      jours.push(new Date(aujourdhui.getTime() + i * 86400000).toISOString().slice(0, 10))
    }

    // ── ÉQUIPE : la première libre, que ce soit la pro ou son assistante ────
    // Même horizon, même durée ; on prend la plus tôt des deux. La pro seule
    // reprend le chemin d'avant, sans requête de plus.
    const assistantes = await assistantesDe(admin, pro_id)
    if (assistantes.length > 0) {
      const personnes: (string | null)[] = [null, ...assistantes.map(a => a.id)]
      let meilleur: { date: string; heure: string; qui: string | null } | null = null
      for (const qui of personnes) {
        const creneaux = await creneauxDe(admin, pro_id, qui, duree, jours)
        for (const jour of jours) {
          const premier = (creneaux[jour] ?? []).find(s => s.disponible)
          if (!premier) continue
          if (!meilleur || jour < meilleur.date || (jour === meilleur.date && premier.heure < meilleur.heure)) meilleur = { date: jour, heure: premier.heure, qui }
          break
        }
      }
      return meilleur ? { ...meilleur, duree } : null
    }

    const { data: rdvs } = await admin
      .from('rendez_vous')
      .select('date, duree')
      .eq('pro_id', pro_id)
      .is('praticienne_id', null)
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
        delaiDe(pro),
      )
      const premier = slots.find(s => s.disponible)
      if (premier) {
        return { date: jour, heure: premier.heure, qui: null, duree }
      }
    }

  return null
}
