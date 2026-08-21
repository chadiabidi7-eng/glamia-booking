// ─────────────────────────────────────────────────────────────────────────────
// L'ICÔNE D'UNE SPÉCIALITÉ, QUELLE QUE SOIT LA LANGUE QUI L'A ÉCRITE.
//
// Un rendez-vous enregistre le nom de la spécialité DANS LA LANGUE DE LA PRO au
// moment où il est créé : « Cils » chez une française, « Lashes » chez une
// anglaise, « Pestañas » chez une espagnole. La table ne connaissait que le
// français : chez une pro anglaise, aucune icône ne s'affichait — repéré le
// 21 août 2026.
//
// ON NE PEUT PAS CHANGER CE QUI EST ENREGISTRÉ. Les rendez-vous déjà pris
// portent le mot de leur langue, et les prochains aussi. C'est donc la table
// qui apprend les trois langues.
//
// LA COMPARAISON IGNORE LES ACCENTS ET LA CASSE. « Pédicure », « pedicure »,
// « PÉDICURE » désignent la même chose, et une pro qui saisit sa catégorie à la
// main ne met pas toujours l'accent.
// ─────────────────────────────────────────────────────────────────────────────

/** Un fichier par spécialité, et tous les noms qui y mènent. */
const NOMS: Record<string, string[]> = {
  'manicure.svg':                  ['Manucure', 'Manicure', 'Manicura'],
  'pedicure.svg':                  ['Pédicure', 'Pedicure', 'Pedicura'],
  'cils.svg':                      ['Cils', 'Lashes', 'Pestañas'],
  'coiffure.svg':                  ['Coiffure', 'Hair', 'Peluquería'],
  'massage.svg':                   ['Massage', 'Masaje'],
  'sourcils.svg':                  ['Sourcils', 'Brows', 'Cejas'],
  'epilation.svg':                 ['Épilation', 'Waxing', 'Depilación'],
  'maquillage.svg':                ['Maquillage', 'Make-up', 'Maquillaje'],
  'maquillage_semi_permanent.svg': ['Maquillage semi-permanent', 'Semi-permanent make-up', 'Micropigmentación'],
  'soin_visage.svg':               ['Soin visage', 'Facials', 'Tratamientos faciales'],
  'bronzage.svg':                  ['Bronzage', 'Tanning', 'Bronceado'],
  'soin_dentaire.svg':             ['Soin dentaire', 'Teeth', 'Estética dental'],
  'autre.svg':                     ['Autre', 'Other', 'Otro'],
};

/** « Pédicure » et « pedicure » doivent tomber sur la même case. */
const aplatir = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const PAR_NOM: Record<string, string> = {};
for (const [fichier, noms] of Object.entries(NOMS)) {
  for (const nom of noms) PAR_NOM[aplatir(nom)] = fichier;
}

type Props = {
  specialite: string;
  size?: number;
  className?: string;
};

export default function SpecialiteIcon({ specialite, size = 32, className }: Props) {
  const file = PAR_NOM[aplatir(specialite ?? '')];
  if (!file) return null;
  return (
    <img
      src={`/icons/specialites/${file}`}
      alt={specialite}
      width={size}
      height={size}
      className={className}
      style={{ display: 'inline-block', flexShrink: 0 }}
    />
  );
}
