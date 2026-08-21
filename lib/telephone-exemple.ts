// ─────────────────────────────────────────────────────────────────────────────
// LE NUMÉRO D'EXEMPLE SUIT LE PAYS DE LA PRO.
//
// Le champ affichait « 06 12 34 56 78 » partout. C'est un numéro français : une
// cliente suisse, belge ou britannique y lit une forme qui n'existe pas chez
// elle, et se demande si elle doit l'imiter. L'exemple d'un champ n'est pas de
// la décoration — c'est ce qui dit à quoi ressemble une réponse juste.
//
// C'EST LE PAYS DE LA PRO, PAS CELUI DE LA CLIENTE. Une pro suisse reçoit des
// clientes suisses ; c'est son marché qui décide de la forme, pas le téléphone
// de qui regarde.
//
// L'OUTRE-MER, C'EST LA FRANCE. La Réunion, la Guadeloupe et la Martinique
// utilisent les numéros français — 0692 à La Réunion, 0690 en Guadeloupe. On
// donne le vrai préfixe local plutôt qu'un 06 métropolitain, parce que c'est
// celui que la cliente a dans la main.
//
// AUCUN NUMÉRO ATTRIBUÉ. Les exemples reprennent, quand ils existent, les
// plages que chaque pays réserve à la fiction — 07700 900xxx au Royaume-Uni,
// 555 aux États-Unis. Là où il n'y a pas de plage réservée, on choisit une
// forme évidemment factice.
// ─────────────────────────────────────────────────────────────────────────────

const EXEMPLES: Record<string, string> = {
  // France et outre-mer
  FR: '06 12 34 56 78',
  RE: '0692 12 34 56',   // La Réunion
  YT: '0639 12 34 56',   // Mayotte
  GP: '0690 12 34 56',   // Guadeloupe
  MQ: '0696 12 34 56',   // Martinique
  GF: '0694 12 34 56',   // Guyane
  BL: '0690 12 34 56',   // Saint-Barthélemy
  MF: '0690 12 34 56',   // Saint-Martin
  PM: '0508 12 34 56',   // Saint-Pierre-et-Miquelon

  // Europe
  BE: '0470 12 34 56',
  CH: '079 123 45 67',
  LU: '621 123 456',
  ES: '612 34 56 78',
  PT: '912 345 678',
  IT: '312 345 6789',
  DE: '0151 23456789',
  NL: '06 12345678',
  GB: '07700 900123',
  IE: '085 123 4567',
  AT: '0664 123456',
  PL: '512 345 678',
  CZ: '601 123 456',
  RO: '0712 345 678',
  SE: '070 123 45 67',
  NO: '401 23 456',
  DK: '20 12 34 56',
  FI: '040 1234567',
  GR: '691 234 5678',
  HR: '091 234 5678',
  BG: '087 123 4567',

  // Afrique du Nord
  MA: '06 12 34 56 78',
  DZ: '05 12 34 56 78',
  TN: '20 123 456',

  // Amériques
  CA: '514 555 0123',
  US: '(555) 123-4567',
  MX: '55 1234 5678',
  CO: '320 1234567',
  BR: '11 91234-5678',

  // Océanie et Asie
  AU: '0412 345 678',
  NZ: '021 123 4567',
  SG: '8123 4567',
  HK: '5123 4567',
};

/** Le repli est le format français : c'est celui de la quasi-totalité des pros. */
const REPLI = EXEMPLES.FR;

/** À quoi ressemble un numéro de portable chez la pro. */
export function exempleTelephone(pays?: string | null): string {
  return EXEMPLES[(pays ?? '').toUpperCase()] ?? REPLI;
}
