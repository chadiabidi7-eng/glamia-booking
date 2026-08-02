// ─────────────────────────────────────────────────────────────────────────────
// Le calcul des créneaux, en un seul endroit.
//
// Ces fonctions vivaient dans la page de réservation, donc hors de portée du
// serveur. Conséquence, constatée le 2 août 2026 : le contrôle de dernière
// minute avant d'enregistrer un rendez-vous ne regardait que les AUTRES
// rendez-vous. Ni les créneaux bloqués, ni les horaires, ni les jours fermés.
// Une page ouverte avant qu'une pro bloque son après-midi gardait son ancienne
// grille, et le serveur ne disait pas non.
//
// Elles sont donc ici, importées par la page ET par le guichet serveur. Deux
// implémentations des mêmes règles finiraient par diverger, et c'est justement
// sur ces règles qu'on ne peut pas se permettre deux avis.
// ─────────────────────────────────────────────────────────────────────────────

export type HorairesJour = { actif?: boolean; active?: boolean; debut: string; fin: string; pause?: { debut: string; fin: string } }
export type HorairesHebdo = Record<number, HorairesJour>

export type CreneauBloque = {
  id: string
  date: string            // YYYY-MM-DD (ou date début pour période)
  date_fin?: string       // YYYY-MM-DD (date fin pour période multi-jours)
  touteLaJournee: boolean
  debut?: string          // "HH:mm" (créneau horaire uniquement)
  fin?: string            // "HH:mm" (créneau horaire uniquement)
  motif?: string
}

export type PlageHoraire = { debut: string; fin: string }
export type JourSpecifique = { actif: boolean; plages: PlageHoraire[] }
export type HorairesSpecifiques = Record<string, JourSpecifique>

export type Slot = { heure: string; disponible: boolean }

/** Pas entre deux créneaux proposés, en minutes. */
export const INTERVAL = 30

export function timeToMin(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function minToTime(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export function isDayWorking(dateStr: string, horaires: HorairesHebdo, horairesSpec?: HorairesSpecifiques, planningVar?: boolean) {
  if (planningVar) {
    const spec = horairesSpec?.[dateStr]
    // En mode variable : dispo uniquement si des plages existent
    return !!(spec?.plages && spec.plages.length > 0)
  }
  const jour = new Date(dateStr + 'T00:00:00').getDay()
  const h = horaires[jour]
  return h?.actif === true || h?.active === true
}

export function isDateInPeriod(dateStr: string, b: CreneauBloque): boolean {
  if (b.date_fin) return dateStr >= b.date && dateStr <= b.date_fin
  return dateStr === b.date
}

export function isDayBlocked(dateStr: string, bloques: CreneauBloque[]) {
  return bloques.some(b => b.touteLaJournee && isDateInPeriod(dateStr, b))
}

export function generateSlots(
  date: string,
  duree: number,
  horaires: HorairesHebdo,
  rdvExistants: { heure: string; duree: number }[],
  bloques: CreneauBloque[] = [],
  horairesSpec?: HorairesSpecifiques,
  planningVar?: boolean,
): Slot[] {
  if (bloques.some(b => b.touteLaJournee && isDateInPeriod(date, b))) return []

  let plages: { start: number; end: number }[]

  if (planningVar) {
    const spec = horairesSpec?.[date]
    if (!spec?.plages || spec.plages.length === 0) return []
    plages = spec.plages.map(p => ({ start: timeToMin(p.debut), end: timeToMin(p.fin) }))
  } else {
    const jour = new Date(date + 'T00:00:00').getDay()
    const h = horaires[jour]
    if (!h?.actif && !h?.active) return []
    if (h.pause) {
      plages = [
        { start: timeToMin(h.debut), end: timeToMin(h.pause.debut) },
        { start: timeToMin(h.pause.fin), end: timeToMin(h.fin) },
      ]
    } else {
      plages = [{ start: timeToMin(h.debut), end: timeToMin(h.fin) }]
    }
  }

  if (plages.length === 0) return []

  const taken = rdvExistants.map(r => ({
    start: timeToMin(r.heure),
    end:   timeToMin(r.heure) + r.duree,
  }))

  const blockedRanges = bloques
    .filter(b => b.date === date && !b.touteLaJournee && b.debut && b.fin)
    .map(b => ({ start: timeToMin(b.debut!), end: timeToMin(b.fin!) }))

  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const limiteMin = date === todayStr ? now.getHours() * 60 + now.getMinutes() + 60 : 0

  const slots: Slot[] = []
  for (const plage of plages) {
    for (let t = plage.start; t + duree <= plage.end; t += INTERVAL) {
      if (limiteMin > 0 && t < limiteMin) continue
      const end = t + duree
      const isTaken = taken.some(r => t < r.end && end > r.start)
      const isBlocked = blockedRanges.some(r => t < r.end && end > r.start)
      slots.push({ heure: minToTime(t), disponible: !isTaken && !isBlocked })
    }
  }
  return slots
}

/**
 * Un créneau précis est-il réservable ? Répond en NOMMANT la cause du refus,
 * parce qu'une cliente devant « ce créneau n'est plus disponible » sans raison
 * recommence et se heurte au même mur.
 *
 * Volontairement bâtie sur `generateSlots` plutôt que sur ses propres tests :
 * ce qui est réservable est exactement ce qui est proposé, par construction.
 */
export function creneauReservable(args: {
  date: string
  heure: string
  duree: number
  horaires: HorairesHebdo
  rdvExistants: { heure: string; duree: number }[]
  bloques?: CreneauBloque[]
  horairesSpec?: HorairesSpecifiques
  planningVar?: boolean
}): { ok: true } | { ok: false; raison: string; message: string } {
  const { date, heure, duree, horaires, rdvExistants, bloques = [], horairesSpec, planningVar } = args

  if (isDayBlocked(date, bloques)) {
    return { ok: false, raison: 'jour_bloque', message: "Cette journée n'est plus disponible. Choisis une autre date." }
  }
  if (!isDayWorking(date, horaires, horairesSpec, planningVar)) {
    return { ok: false, raison: 'jour_ferme', message: "Cette journée n'est plus ouverte à la réservation. Choisis une autre date." }
  }

  const slots = generateSlots(date, duree, horaires, rdvExistants, bloques, horairesSpec, planningVar)
  const slot = slots.find(s => s.heure === heure)

  // Absent de la grille : hors horaires, trop proche, ou durée qui déborde.
  if (!slot) {
    return { ok: false, raison: 'hors_grille', message: "Ce créneau n'est plus proposé. Choisis-en un autre." }
  }
  if (!slot.disponible) {
    return { ok: false, raison: 'occupe', message: "Ce créneau vient d'être pris 😔 Choisis-en un autre." }
  }
  return { ok: true }
}
