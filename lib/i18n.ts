import { I18n } from 'i18n-js';

import en from '@/locales/en.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

// ─────────────────────────────────────────────────────────────────────────────
// LA LANGUE DE LA PAGE DE RÉSERVATION.
//
// ── ELLE SUIT LA PRO, PAS LA CLIENTE. C'EST LE POINT IMPORTANT ──────────────
//
// On aurait pu suivre le navigateur de la cliente : c'est elle qui lit. Ce
// serait une erreur, et une régression pour les 767 pros d'aujourd'hui.
//
// Beaucoup de Françaises ont un téléphone réglé en anglais — un iPhone acheté
// à l'étranger, un compte configuré une fois pour toutes. Suivre le navigateur
// ferait basculer en anglais la page d'une pro parisienne pour une partie de
// ses clientes, du jour au lendemain, sans que personne ne l'ait demandé.
//
// LA PAGE EST LA VITRINE DE LA PRO. Elle est dans SA langue, celle de son
// marché : une pro à Londres a une page anglaise, une pro à Paris garde une
// page française pour tout le monde. Exactement comme aujourd'hui.
//
// ── CE QUI N'EST JAMAIS TRADUIT ─────────────────────────────────────────────
//
// Tout ce que la pro a écrit elle-même : ses noms de prestations, son message
// d'accueil, son règlement, ses questions à la cliente. Ce sont ses mots. On
// les affiche tels quels, dans toutes les langues.
//
// ── LE REPLI VA VERS LE FRANÇAIS ────────────────────────────────────────────
//
// Une phrase absente de en.json affiche le français — jamais l'inverse. Une
// cliente française ne peut donc pas tomber sur de l'anglais, quoi qu'il
// manque.
// ─────────────────────────────────────────────────────────────────────────────

export const LANGUES = ['fr', 'en', 'es'] as const;
export type Langue = (typeof LANGUES)[number];

const i18n = new I18n({ fr, en, es });
i18n.defaultLocale = 'fr';
i18n.enableFallback = true;
i18n.locale = 'fr';

/**
 * Poser la langue de la page, une fois le profil de la pro chargé.
 *
 * Appelé au même endroit que le reste de son profil. Avant ça, la page est en
 * français — c'est le cas de la première fraction de seconde, avant que
 * Supabase ait répondu.
 */
export function poserLangue(langue: string | null | undefined) {
  i18n.locale = (LANGUES as readonly string[]).includes(langue ?? '')
    ? (langue as Langue)
    : 'fr';
}

export function langueActuelle(): Langue {
  return i18n.locale as Langue;
}

/** La phrase, dans la langue de la pro. Même nom que dans l'app mobile. */
export function traduire(cle: string, options?: Record<string, unknown>): string {
  return i18n.t(cle, options);
}

/**
 * LA MÊME PHRASE, MAIS CÔTÉ SERVEUR.
 *
 * Les routes qui envoient une notification ou un mail tournent sur le serveur :
 * elles servent plusieurs pros à la fois, et n'ont pas de « langue en cours ».
 * On la leur passe donc à chaque appel — celle de la pro concernée, lue dans
 * son profil.
 *
 * Sans ça, la langue de la dernière pro servie déciderait pour la suivante.
 */
export function traduireDans(
  langue: string | null | undefined,
  cle: string,
  options?: Record<string, unknown>,
): string {
  const locale = (LANGUES as readonly string[]).includes(langue ?? '') ? langue : 'fr';
  return i18n.t(cle, { ...options, locale });
}

export default i18n;
