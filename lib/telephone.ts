// ─────────────────────────────────────────────────────────────────────────────
// DEUX ÉCRITURES DU MÊME NUMÉRO DOIVENT SE RECONNAÎTRE.
//
// « 07700 900123 » et « +44 7700 900123 » sont le même téléphone. Le nettoyage
// d'avant ne savait le faire que pour la France : il convertissait +33 et 0033,
// et rien d'autre. Une cliente britannique qui écrivait son numéro au format
// international n'était donc pas reconnue — elle repartait avec une deuxième
// fiche, sans historique, sans carte de fidélité, et sans ses avis.
//
// LA FORME DE RÉFÉRENCE EST LA FORME NATIONALE, celle qui est déjà en base
// chez les 770 pros : « 0612345678 ». On y ramène tout le reste. C'est ce qui
// permet de corriger sans toucher à une seule ligne de données.
//
// LES DEUX CÔTÉS PASSENT TOUJOURS PAR ICI. La comparaison nettoie le numéro
// saisi ET celui enregistré : changer cette fonction ne peut donc pas
// désapparier ce qui s'appariait avant, tant qu'elle reste stable sur les
// numéros déjà écrits en national.
//
// LE PRÉFIXE NATIONAL N'EXISTE PAS PARTOUT. La France, le Royaume-Uni et la
// Suisse mettent un 0 devant ; les États-Unis et le Canada n'en mettent pas.
// « +1 514 555 0123 » devient « 5145550123 », pas « 05145550123 ».
// ─────────────────────────────────────────────────────────────────────────────

/** Indicatif → préfixe national à remettre devant, une fois l'indicatif retiré. */
const INDICATIFS: Record<string, string> = {
  // Europe — préfixe national « 0 »
  '33': '0',   // France et outre-mer
  '32': '0',   // Belgique
  '41': '0',   // Suisse
  '44': '0',   // Royaume-Uni
  '352': '',   // Luxembourg — pas de préfixe national
  '34': '',    // Espagne — pas de préfixe national
  '351': '',   // Portugal — pas de préfixe national
  '39': '',    // Italie — le 0 fait partie du numéro
  '49': '0',   // Allemagne
  '31': '0',   // Pays-Bas
  '353': '0',  // Irlande
  '43': '0',   // Autriche
  '48': '',    // Pologne
  '420': '',   // Tchéquie
  '40': '0',   // Roumanie
  '46': '0',   // Suède
  '47': '',    // Norvège
  '45': '',    // Danemark
  '358': '0',  // Finlande
  '30': '',    // Grèce
  '385': '0',  // Croatie
  '359': '0',  // Bulgarie
  '356': '',   // Malte

  // Afrique du Nord
  '212': '0',  // Maroc
  '213': '0',  // Algérie
  '216': '',   // Tunisie

  // Amériques
  '1': '',     // États-Unis, Canada et Caraïbes
  '52': '',    // Mexique
  '57': '',    // Colombie
  '55': '',    // Brésil

  // Océanie et Asie
  '61': '0',   // Australie
  '64': '0',   // Nouvelle-Zélande
  '65': '',    // Singapour
  '852': '',   // Hong Kong
};

// Du plus long au plus court : sans ça, « 1 » avalerait le début de « 1 » d'un
// indicatif à trois chiffres qui commencerait pareil.
const PAR_LONGUEUR = Object.keys(INDICATIFS).sort((a, b) => b.length - a.length);

/**
 * Le numéro ramené à sa forme de référence, quelle que soit son écriture.
 *
 * Accepte les espaces, tirets, points, parenthèses et espaces insécables — ce
 * que produisent les claviers de téléphone et les copier-coller.
 */
export function normaliserTelephone(tel: string | null | undefined): string {
  let n = (tel ?? '').replace(/[\s  \-.()]/g, '');
  if (!n) return '';

  // « 0033 » est une autre façon d'écrire « +33 ».
  if (n.startsWith('00')) n = '+' + n.slice(2);
  if (!n.startsWith('+')) return n;

  const chiffres = n.slice(1);
  for (const indicatif of PAR_LONGUEUR) {
    if (chiffres.startsWith(indicatif)) {
      return INDICATIFS[indicatif] + chiffres.slice(indicatif.length);
    }
  }
  // Un pays qu'on ne connaît pas : on garde la forme internationale telle
  // quelle plutôt que d'inventer une conversion.
  return n;
}
