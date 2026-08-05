// COPIE VOLONTAIRE du même fichier de l'app. Les deux mondes ne partagent pas
// de code : une règle qui diverge se verrait tout de suite — la caisse s'ouvre
// dans un pays, le paiement se fait dans un autre.
//
// ─────────────────────────────────────────────────────────────────────────────
// OÙ GLAMIA PAY PEUT OUVRIR UNE CAISSE, ET DANS QUELLE MONNAIE.
//
// Jusqu'ici, tout partait en France et en euros — écrit en dur. Une pro suisse
// se voyait réclamer une pièce d'identité française ; une Canadienne encaissait
// des euros auprès de clientes qui paient en dollars.
//
// LA LISTE N'EST PAS RECOPIÉE D'UNE DOCUMENTATION. Elle a été établie le 5 août
// 2026 en essayant d'ouvrir un compte dans chacun des 45 pays que Stripe
// annonce, depuis la vraie plateforme de Glamia. 42 ont été acceptés, 3 refusés.
// Les comptes d'essai ont été supprimés dans la foulée.
//
// TROIS PAYS REFUSENT, ET IL N'Y A PAS DE CONTOURNEMENT :
//   Brésil et Inde — « les comptes de ce pays ne peuvent pas être créés par une
//   plateforme française ». Émirats — le statut d'indépendante n'y existe pas.
// Tous les autres pays du monde (Maroc, Sénégal, Algérie, Tunisie…) ne sont pas
// proposés par Stripe du tout, pour personne.
// ─────────────────────────────────────────────────────────────────────────────

export type PaysPay = {
  /** La monnaie dans laquelle la pro encaisse et se fait virer. */
  devise: string;
  /** Ce que Stripe prélève : un pourcentage, plus une somme fixe en centimes. */
  fraisPct: number;
  fraisFixe: number;
  /**
   * MESURÉ ou PUBLIÉ — et la différence compte.
   *
   * « mesuré » : un vrai paiement est passé, on a lu ce que Stripe a réellement
   * pris. C'est le cas de l'euro (5 août 2026 : sur 12,44 €, Stripe a prélevé
   * 44 centimes, la pro a touché 12,00 € pile).
   *
   * « publié » : c'est le tarif annoncé par Stripe, jamais vérifié chez nous.
   * Une plateforme française ne peut pas fabriquer un compte de test étranger
   * déjà validé — il faut une vraie pro. Le premier paiement dans ce pays
   * mesurera le vrai chiffre (voir `ecartFrais` plus bas).
   */
  source: 'mesuré' | 'publié';
};

/**
 * L'outre-mer, c'est la France.
 *
 * Stripe ne connaît ni la Réunion ni la Guadeloupe : pour lui, une pro de
 * Saint-Denis est une pro française, avec un compte français, en euros, et les
 * frais européens. Rien à faire de spécial — mais il faut le dire ici, sinon on
 * chercherait « RE » dans la liste et on ne le trouverait pas.
 */
const OUTRE_MER_FRANCAIS = ['GP', 'MQ', 'GF', 'RE', 'YT', 'BL', 'MF', 'PM'];

/** Zone euro : mêmes frais partout — 1,5 % + 0,25 €, mesurés. */
const EURO: PaysPay = { devise: 'eur', fraisPct: 0.015, fraisFixe: 25, source: 'mesuré' };

export const PAYS_PAY: Record<string, PaysPay> = {
  // ── Zone euro ──
  AT: EURO, BE: EURO, BG: EURO, CY: EURO, DE: EURO, EE: EURO, ES: EURO,
  FI: EURO, FR: EURO, GR: EURO, HR: EURO, IE: EURO, IT: EURO, LT: EURO,
  LU: EURO, LV: EURO, MT: EURO, NL: EURO, PT: EURO, SI: EURO, SK: EURO,

  // ── Europe hors euro ──
  GB: { devise: 'gbp', fraisPct: 0.015, fraisFixe: 20, source: 'publié' },
  GI: { devise: 'gbp', fraisPct: 0.015, fraisFixe: 20, source: 'publié' },
  CH: { devise: 'chf', fraisPct: 0.029, fraisFixe: 30, source: 'publié' },
  LI: { devise: 'chf', fraisPct: 0.029, fraisFixe: 30, source: 'publié' },
  DK: { devise: 'dkk', fraisPct: 0.014, fraisFixe: 180, source: 'publié' },
  SE: { devise: 'sek', fraisPct: 0.014, fraisFixe: 180, source: 'publié' },
  NO: { devise: 'nok', fraisPct: 0.014, fraisFixe: 200, source: 'publié' },
  PL: { devise: 'pln', fraisPct: 0.015, fraisFixe: 100, source: 'publié' },
  CZ: { devise: 'czk', fraisPct: 0.014, fraisFixe: 600, source: 'publié' },
  RO: { devise: 'ron', fraisPct: 0.015, fraisFixe: 100, source: 'publié' },

  // ── Amérique du Nord ──
  US: { devise: 'usd', fraisPct: 0.029, fraisFixe: 30, source: 'publié' },
  CA: { devise: 'cad', fraisPct: 0.029, fraisFixe: 30, source: 'publié' },
  MX: { devise: 'mxn', fraisPct: 0.036, fraisFixe: 300, source: 'publié' },

  // ── Asie-Pacifique ──
  AU: { devise: 'aud', fraisPct: 0.0175, fraisFixe: 30, source: 'publié' },
  NZ: { devise: 'nzd', fraisPct: 0.027, fraisFixe: 30, source: 'publié' },
  SG: { devise: 'sgd', fraisPct: 0.034, fraisFixe: 50, source: 'publié' },
  HK: { devise: 'hkd', fraisPct: 0.034, fraisFixe: 235, source: 'publié' },
  MY: { devise: 'myr', fraisPct: 0.03, fraisFixe: 100, source: 'publié' },
  TH: { devise: 'thb', fraisPct: 0.0365, fraisFixe: 1000, source: 'publié' },
};

// ─────────────────────────────────────────────────────────────────────────────
// DEUX PAYS ACCEPTÉS PAR STRIPE ET VOLONTAIREMENT LAISSÉS DE CÔTÉ.
//
// Le Japon (yen) et la Hongrie (forint) comptent leur monnaie autrement : le yen
// n'a pas de centimes, le forint impose des montants ronds. Toute la chaîne de
// Glamia raisonne en centimes — un acompte de 20 yens deviendrait 2 000 yens.
//
// Aucune pro n'y travaille aujourd'hui. Plutôt que d'écrire un calcul qu'on ne
// pourrait pas essayer, on les refuse proprement : mieux vaut dire « pas encore
// disponible chez toi » que prélever cent fois trop.
// ─────────────────────────────────────────────────────────────────────────────
export const PAYS_REMIS_A_PLUS_TARD = ['JP', 'HU'];

/** Ramène un pays à celui que Stripe connaît (l'outre-mer devient la France). */
export function paysStripe(pays: string | null | undefined): string | null {
  if (!pays) return null;
  const p = pays.toUpperCase();
  return OUTRE_MER_FRANCAIS.includes(p) ? 'FR' : p;
}

/** Glamia Pay peut-il ouvrir une caisse pour une pro de ce pays ? */
export function paysAccepte(pays: string | null | undefined): boolean {
  const p = paysStripe(pays);
  return !!p && p in PAYS_PAY;
}

/**
 * Les réglages d'un pays. Repli sur la France quand on ne sait pas.
 *
 * Le repli n'est pas un pari : une pro dont le pays n'est pas renseigné est
 * française neuf fois sur dix, et l'euro est le seul tarif qu'on ait mesuré.
 * C'est le comportement d'avant, exactement — donc rien ne peut empirer.
 */
export function reglagesPay(pays: string | null | undefined): PaysPay & { code: string } {
  const p = paysStripe(pays);
  if (p && PAYS_PAY[p]) return { ...PAYS_PAY[p], code: p };
  return { ...PAYS_PAY.FR, code: 'FR' };
}

/**
 * Pourquoi Glamia Pay n'est pas disponible chez elle — en une phrase qu'on peut
 * lui montrer. `null` si tout va bien.
 */
export function raisonIndisponible(pays: string | null | undefined): string | null {
  const p = paysStripe(pays);
  if (!p) return null; // pays inconnu → on ne bloque pas, repli France
  if (PAYS_PAY[p]) return null;
  if (PAYS_REMIS_A_PLUS_TARD.includes(p)) {
    return 'Glamia Pay n’est pas encore disponible dans ton pays. On y travaille.';
  }
  if (p === 'BR' || p === 'IN') {
    return 'Notre partenaire de paiement n’autorise pas encore les comptes de ton pays depuis la France.';
  }
  return 'Notre partenaire de paiement ne propose pas encore de compte dans ton pays.';
}

/** Les monnaies qui n'ont pas de centimes (montants déjà en unités entières). */
export function centimesParUnite(devise: string): number {
  return ['jpy', 'krw', 'vnd', 'xof', 'xaf', 'xpf', 'clp'].includes(devise.toLowerCase()) ? 1 : 100;
}
