const SVG_MAP: Record<string, string> = {
  'Manucure': 'manicure.svg',
  'Pédicure': 'pedicure.svg',
  'Cils': 'cils.svg',
  'Sourcils': 'sourcils.svg',
  'Épilation cire': 'epilation.svg',
  'Maquillage': 'maquillage.svg',
  'Maquillage semi-permanent': 'maquillage_semi_permanent.svg',
  'Soin visage': 'soin_visage.svg',
  'Bronzage': 'bronzage.svg',
  'Soin dentaire': 'soin_dentaire.svg',
  'Autre': 'autre.svg',
};

type Props = {
  specialite: string;
  size?: number;
  className?: string;
};

export default function SpecialiteIcon({ specialite, size = 32, className }: Props) {
  const file = SVG_MAP[specialite];
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
