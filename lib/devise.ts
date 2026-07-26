// Devises francophones — symbole d'affichage seulement (aucune conversion).
// Convention française : symbole APRÈS, avec espace (« 30 € », « 30 FCFA »).
// La page de résa affiche les prix dans la devise choisie par LA PRO.

const SYMBOLES: Record<string, string> = {
  EUR: '€', CHF: 'CHF', CAD: '$', MAD: 'DH', TND: 'DT', DZD: 'DA',
  XOF: 'FCFA', XAF: 'FCFA', HTG: 'G', CDF: 'FC', MGA: 'Ar',
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
