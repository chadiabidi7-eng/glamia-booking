import { langueActuelle } from '@/lib/i18n';

// ─────────────────────────────────────────────────────────────────────────────
// LES HEURES ET LES DATES DE LA PAGE DE RÉSERVATION.
//
// « 14:00 » chez une pro parisienne, « 2:00 PM » chez une pro de Chicago. Aucun
// mot ne change : c'est la façon d'écrire. Elle ne peut donc pas vivre dans les
// fichiers de langue.
//
// LE JUMEAU DE lib/heures-dates.ts DE L'APP MOBILE, avec les mêmes règles et
// les mêmes résultats. Les deux doivent écrire l'heure pareil : la cliente lit
// sur sa page ce que la pro lit dans son agenda, sinon l'une des deux se
// trompe de rendez-vous.
//
// ── LA LANGUE NE SUFFIT PAS ─────────────────────────────────────────────────
//
// Londres et Chicago parlent anglais et n'écrivent pas les dates pareil :
// 19/08/2026 chez l'une, 8/19/2026 chez l'autre. On croise donc la langue de
// la pro et son pays de travail.
//
// ── L'HORLOGE EST CALCULÉE À LA MAIN ────────────────────────────────────────
//
// Les dates passent par le formateur du navigateur. L'heure, non : demander le
// format d'horloge au navigateur, c'est suivre les réglages de la CLIENTE, et
// une cliente au réglage 12 h verrait « 2:00 PM » sur la page d'une pro
// française. La page appartient à la pro.
// ─────────────────────────────────────────────────────────────────────────────

let paysDeLaPro: string | undefined;

/** Appelé en même temps que la langue, une fois le profil de la pro chargé. */
export function poserPays(pays: string | null | undefined) {
  paysDeLaPro = pays ?? undefined;
}

/**
 * L'étiquette de langue quand on la connaît SANS contexte de page.
 *
 * Les routes serveur n'ont pas de « langue courante » : elles traitent la
 * demande d'une pro, dont elles viennent de lire la langue en base. Elles
 * écrivaient donc leurs dates en 'fr-FR' en dur — une notification à une pro
 * anglaise annonçait « mercredi 15 juillet ».
 */
export function etiquetteDe(langue: string | null | undefined, pays?: string | null): string {
  const l = langue === 'en' || langue === 'es' ? langue : 'fr';
  const p = (pays ?? '').toUpperCase();
  if (l === 'fr') return p === 'CA' ? 'fr-CA' : 'fr-FR';
  if (l === 'es') {
    if (p === 'MX') return 'es-MX';
    if (p === 'CO') return 'es-CO';
    if (p === 'AR') return 'es-AR';
    return 'es-ES';
  }
  if (p === 'US') return 'en-US';
  if (p === 'CA') return 'en-CA';
  if (p === 'AU') return 'en-AU';
  return 'en-GB';
}

export function etiquette(): string {
  const langue = langueActuelle();
  const pays = (paysDeLaPro ?? '').toUpperCase();
  if (langue === 'fr') return pays === 'CA' ? 'fr-CA' : 'fr-FR';
  if (langue === 'es') {
    if (pays === 'MX') return 'es-MX';
    if (pays === 'CO') return 'es-CO';
    if (pays === 'AR') return 'es-AR';
    return 'es-ES';
  }
  if (pays === 'US') return 'en-US';
  if (pays === 'CA') return 'en-CA';
  if (pays === 'AU') return 'en-AU';
  if (pays === 'NZ') return 'en-NZ';
  return 'en-GB';
}

/** Vrai quand l'heure s'écrit en AM/PM. Le français jamais. */
/**
 * LE PAYS DÉCIDE, PAS LA LANGUE. Même règle que l'app — décision de Chadi le
 * 21 août 2026. On ne décide plus rien ici : on DEMANDE à l'étiquette ce que
 * son pays fait. Royaume-Uni 24 h, États-Unis 12 h, Espagne 24 h, Mexique
 * 12 h, sans aucune liste à tenir à jour.
 *
 * Le repli est 24 heures : c'est ce que lisent les pros francophones.
 */
export function heure12(): boolean {
  try {
    return new Intl.DateTimeFormat(etiquette(), { hour: 'numeric' })
      .resolvedOptions().hour12 === true;
  } catch {
    return false;
  }
}

/** « 14:30 » reste « 14:30 » en français, devient « 2:30 PM » en anglais. */
export function formatHeure(hhmm: string | null | undefined): string {
  const brut = (hhmm ?? '').trim();
  const [h, m] = brut.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return brut;
  if (!heure12()) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const suffixe = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffixe}` : `${h12}:${String(m).padStart(2, '0')} ${suffixe}`;
}

/** Un intervalle : « 9:00 – 19:00 » ou « 9 AM – 7 PM ». */
export function formatPlage(debut: string | null | undefined, fin: string | null | undefined): string {
  return `${formatHeure(debut)} – ${formatHeure(fin)}`;
}

/**
 * Une durée : « 45 min », « 1h30 » — et « 1h 30m » en anglais.
 *
 * Le « 1h30 » français ne se lit pas en anglais : le h collé au chiffre n'y
 * veut rien dire.
 */
export function formatDuree(minutes: number, options?: { espace?: boolean }): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (minutes < 60) return options?.espace === false ? `${minutes}min` : `${minutes} min`;
  if (m === 0) return `${h}h`;
  return heure12() ? `${h}h ${m}m` : `${h}h${String(m).padStart(2, '0')}`;
}

function ecrire(valeur: Date | string, options: Intl.DateTimeFormatOptions): string {
  const d = valeur instanceof Date ? valeur : new Date(valeur);
  if (isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString(etiquette(), options);
  } catch {
    return d.toLocaleDateString(undefined, options);
  }
}

/** « 19 août » · « 19 Aug » · « Aug 19 ». */
export const dateCourte = (v: Date | string) =>
  ecrire(v, { day: 'numeric', month: 'short' });

/** « 19 août 2026 » en toutes lettres. */
export const dateLongue = (v: Date | string) =>
  ecrire(v, { day: 'numeric', month: 'long', year: 'numeric' });

/** « mercredi 19 août » · « Wednesday 19 August ». */
export const dateAvecJour = (v: Date | string) =>
  ecrire(v, { weekday: 'long', day: 'numeric', month: 'long' });

/** « août 2026 » · « August 2026 ». */
export const moisAnnee = (v: Date | string) =>
  ecrire(v, { month: 'long', year: 'numeric' });

/** Une date écrite dans son fuseau d'origine, sans décalage. */
export const dateUTC = (v: Date | string, options: Intl.DateTimeFormatOptions) =>
  ecrire(v, { ...options, timeZone: 'UTC' });

const majuscule = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function nomsSemaine(style: 'long' | 'short' | 'narrow'): string[] {
  const depart = new Date(2024, 0, 7); // un dimanche
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(depart.getTime() + i * 86400000);
    try {
      return d.toLocaleDateString(etiquette(), { weekday: style });
    } catch {
      return d.toLocaleDateString(undefined, { weekday: style });
    }
  });
}

/** « Dimanche, Lundi… » · « Sunday, Monday… » — dimanche en premier. */
export const joursLongs = () => nomsSemaine('long').map(majuscule);

/** « Dim, Lun… » — dimanche en premier, sans le point. */
export const joursCourts = () =>
  nomsSemaine('short').map(j => majuscule(j.replace(/\.$/, '')));

/** « LUN, MAR… » — lundi en premier, en capitales. */
export const joursCourtsLundi = () => {
  const c = joursCourts().map(j => j.toUpperCase());
  return [...c.slice(1), c[0]];
};

/** « Janvier, Février… » · « January, February… ». */
export function moisLongs(): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(2024, i, 15);
    try {
      return majuscule(d.toLocaleDateString(etiquette(), { month: 'long' }));
    } catch {
      return majuscule(d.toLocaleDateString(undefined, { month: 'long' }));
    }
  });
}
