// Devises francophones — symbole d'affichage seulement (aucune conversion).
// Convention française : symbole APRÈS, avec espace (« 30 € », « 30 FCFA »).
// La page de résa affiche les prix dans la devise choisie par LA PRO.

const SYMBOLES: Record<string, string> = {
  EUR: '€', CHF: 'CHF', CAD: '$', MAD: 'DH', DZD: 'DA', TND: 'DT',
  XOF: 'FCFA', XAF: 'FCFA', HTG: 'G', CDF: 'FC', MGA: 'Ar',
  MRU: 'UM', GNF: 'FG', RWF: 'FRw', BIF: 'FBu', DJF: 'Fdj', KMF: 'CF',
  SCR: 'SR', MUR: 'Rs', LBP: 'LL', XPF: 'XPF', VUV: 'VT', EGP: 'LE',
  // Ajout du 5 août 2026 — les monnaies des 42 pays où Glamia Pay peut ouvrir
  // une caisse. Sans elles, une cliente britannique voyait « € » sur son
  // acompte en livres.
  GBP: '£', USD: '$', SEK: 'kr', NOK: 'kr', DKK: 'kr', PLN: 'zł', CZK: 'Kč',
  RON: 'lei', AUD: '$', NZD: '$', SGD: '$', HKD: 'HK$', MYR: 'RM', THB: '฿',
  MXN: '$', JPY: '¥', HUF: 'Ft', BGN: 'лв',
};

/** Symbole d'une devise (repli € si code inconnu). */
export function symboleDevise(code: string | null | undefined): string {
  return SYMBOLES[code ?? 'EUR'] ?? '€';
}

/** Formate un montant avec le symbole de la devise (« 30 € »). null → ''. */
export function formatPrix(montant: number | null | undefined, devise: string | null | undefined): string {
  if (montant === null || montant === undefined) return '';
  return `${montant} ${symboleDevise(devise)}`;
}
