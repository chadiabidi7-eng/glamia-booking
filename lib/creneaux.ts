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

/** Le délai minimum entre l'instant présent et un rendez-vous réservable. */
const DELAI_MINIMUM_MIN = 60

/** Le fuseau de repli : la quasi-totalité des pros sont en France. */
export const FUSEAU_DEFAUT = 'Europe/Paris'

/**
 * L'heure qu'il est CHEZ LA PRO, pas sur le serveur.
 *
 * Vercel tourne en temps universel. `new Date().getHours()` y renvoyait donc
 * 8 quand il est 10 h à Paris, et le délai d'une heure était calculé à partir
 * de 8 h : à 10 h 09, la page proposait encore 9 h 30. Chadi l'a constaté en
 * essayant de réserver chez lui le 4 août 2026.
 *
 * En hiver l'écart n'est que d'une heure, l'été de deux — le défaut changeait
 * d'ampleur avec la saison, ce qui le rendait d'autant plus difficile à voir.
 */
export function maintenantChezLaPro(fuseau: string = FUSEAU_DEFAUT): { date: string; minutes: number } {
  let zone = fuseau || FUSEAU_DEFAUT
  let parts: Record<string, string>
  try {
    parts = lire(zone)
  } catch {
    // Un fuseau inconnu ne doit pas faire tomber la page de réservation.
    parts = lire(FUSEAU_DEFAUT)
  }
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  }
}

function lire(zone: string): Record<string, string> {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
  return Object.fromEntries(fmt.formatToParts(new Date()).map(x => [x.type, x.value]))
}

export function generateSlots(
  date: string,
  duree: number,
  horaires: HorairesHebdo,
  rdvExistants: { heure: string; duree: number }[],
  bloques: CreneauBloque[] = [],
  horairesSpec?: HorairesSpecifiques,
  planningVar?: boolean,
  fuseau?: string,
  aLaSuite?: boolean,
  preparation = 0,
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

  const maintenant = maintenantChezLaPro(fuseau)
  // Une date déjà passée n'a plus aucun créneau. Sans ça, elle repassait par la
  // branche « ce n'est pas aujourd'hui » et rouvrait toute la journée : la
  // grille l'interdit à l'écran, mais le contrôle serveur l'aurait acceptée.
  if (date < maintenant.date) return []
  const limiteMin = date === maintenant.date ? maintenant.minutes + DELAI_MINIMUM_MIN : 0

  // ── LE TEMPS DE PRÉPARATION ENTRE DEUX CLIENTES ──────────────────────────
  // La pro ne passe pas d'une cliente à l'autre sans respirer : ranger,
  // désinfecter, préparer le poste. On élargit donc chaque rendez-vous existant
  // de ce délai, des deux côtés — un nouveau rendez-vous ne peut ni finir juste
  // avant, ni commencer juste après.
  //
  // Le délai ne vaut QU'ENTRE DEUX RENDEZ-VOUS. Il ne mord ni sur le début ni
  // sur la fin de sa plage : ouvrir à 18h veut dire recevoir à 18h. Et il ne
  // s'applique pas aux évènements de son calendrier — un déjeuner n'est pas une
  // cliente à préparer.
  const prep = Math.max(0, preparation)
  const libre = (t: number) => {
    const end = t + duree
    return !taken.some(r => t < r.end + prep && end + prep > r.start)
        && !blockedRanges.some(r => t < r.end && end > r.start)
  }

  // ── « JOURNÉE PLEINE » : LES RENDEZ-VOUS SE POSENT BOUT À BOUT ────────────
  //
  // Remonté par une pro le 9 août 2026. Elle ouvre sa soirée de 18h à 22h30
  // pour travailler d'affilée ; la grille y proposait huit départs. Il suffit
  // qu'une cliente prenne une heure à 21h pour couper la soirée en deux — et le
  // trou de 18h à 21h ne se remplit plus. Elle attend chez elle.
  //
  // ON NE PROPOSE PLUS QU'UNE HEURE À LA FOIS : le début de la plage, puis la
  // fin du dernier rendez-vous pris. Sa plage n'affiche que 18h. Si la première
  // cliente ne reste qu'une heure, le créneau suivant devient 19h — et
  // seulement 19h. La soirée se remplit d'affilée, ou s'arrête, mais elle n'est
  // jamais éparpillée.
  //
  // POURQUOI PAS UNE LISTE D'HEURES CHOISIES À LA MAIN, ce qu'elle demandait :
  // des heures fixes ne garantissent rien. Avec 18h et 20h affichés, une
  // cliente prend 20h pour une heure, une autre 18h pour une heure, et la
  // soirée est trouée exactement comme avant.
  //
  // ON NE MONTRE QUE CE QUI EST RÉSERVABLE. Ailleurs la grille affiche aussi
  // les heures occupées, en grisé ; ici l'intérêt est justement la liste
  // courte — une heure grisée n'apprendrait rien et ferait douter.
  if (aLaSuite) {
    const slots: Slot[] = []
    for (const plage of plages) {
      // Le premier départ possible. Si la plage a déjà commencé, on repart de
      // maintenant plutôt que de ne rien proposer du tout : sinon une pro dont
      // la soirée démarre à 18h n'aurait plus aucun créneau passé 18h01.
      const debut = limiteMin > plage.start
        ? Math.ceil(limiteMin / INTERVAL) * INTERVAL
        : plage.start

      // Les points d'accroche : le début, et la fin de ce qui occupe déjà la
      // plage — rendez-vous comme évènements du calendrier.
      // On repart de la fin du rendez-vous précédent, temps de préparation
      // compris : c'est l'heure à laquelle elle peut vraiment recevoir.
      const bornes = new Set<number>([debut])
      for (const r of taken) {
        if (r.end + prep > debut && r.end + prep < plage.end) bornes.add(r.end + prep)
      }
      for (const r of blockedRanges) {
        if (r.end > debut && r.end < plage.end) bornes.add(r.end)
      }

      for (const t of [...bornes].sort((a, b) => a - b)) {
        if (t + duree > plage.end) continue
        if (!libre(t)) continue
        slots.push({ heure: minToTime(t), disponible: true })
      }
    }
    return slots
  }

  const slots: Slot[] = []
  for (const plage of plages) {
    for (let t = plage.start; t + duree <= plage.end; t += INTERVAL) {
      if (limiteMin > 0 && t < limiteMin) continue
      slots.push({ heure: minToTime(t), disponible: libre(t) })
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
  fuseau?: string
  aLaSuite?: boolean
  preparation?: number
}): { ok: true } | { ok: false; raison: string; message: string } {
  const { date, heure, duree, horaires, rdvExistants, bloques = [], horairesSpec, planningVar, fuseau, aLaSuite, preparation } = args

  if (isDayBlocked(date, bloques)) {
    return { ok: false, raison: 'jour_bloque', message: "Cette journée n'est plus disponible. Choisis une autre date." }
  }
  if (!isDayWorking(date, horaires, horairesSpec, planningVar)) {
    return { ok: false, raison: 'jour_ferme', message: "Cette journée n'est plus ouverte à la réservation. Choisis une autre date." }
  }

  const slots = generateSlots(date, duree, horaires, rdvExistants, bloques, horairesSpec, planningVar, fuseau, aLaSuite, preparation)
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
