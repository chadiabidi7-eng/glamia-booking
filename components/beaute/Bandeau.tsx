import SpecialiteIcon from '@/components/SpecialiteIcon'
import { TEXTES, type Langue, type Metier } from '@/lib/beaute-textes'

// Les spécialités qui défilent seules, comme sur glamia.pro. Deux files
// identiques se suivent : quand la première est sortie, la seconde est à sa
// place, la couture ne se voit pas. Le survol arrête le défilé.

const ORDRE: Metier[] = ['manucure', 'pedicure', 'cils', 'sourcils', 'coiffure', 'epilation', 'soinVisage', 'maquillage', 'maquillageSemi', 'massage', 'soinDentaire', 'bronzage']

export default function Bandeau({ langue }: { langue: Langue }) {
  const T = TEXTES[langue]
  const file = (cachee: boolean) => (
    <div className="bandeau-file" aria-hidden={cachee || undefined}>
      {ORDRE.map(m => (
        <span key={m} className="bandeau-cat">
          <SpecialiteIcon specialite={TEXTES.fr.metiers[m]} size={28} />
          {T.metiers[m]}
        </span>
      ))}
    </div>
  )
  return (
    <div className="bandeau">
      <style>{`
        .bandeau { width: 100%; overflow: hidden; margin-top: 44px;
          mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
          -webkit-mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent); }
        .bandeau-piste { display: flex; width: max-content; animation: bandeau-defile 60s linear infinite; }
        .bandeau:hover .bandeau-piste { animation-play-state: paused; }
        .bandeau-file { display: flex; gap: 12px; padding-right: 12px; }
        .bandeau-cat { flex: none; display: inline-flex; align-items: center; gap: 10px; white-space: nowrap; padding: 9px 18px 9px 10px; border-radius: 999px; background: #fff; border: 1px solid var(--filet); font-size: 15px; font-weight: 600; box-shadow: 0 8px 18px -14px rgba(43,26,36,0.35); }
        @keyframes bandeau-defile { from { transform: translate3d(0, 0, 0) } to { transform: translate3d(-50%, 0, 0) } }
        @media (prefers-reduced-motion: reduce) { .bandeau-piste { animation: none } }
      `}</style>
      <div className="bandeau-piste">{file(false)}{file(true)}</div>
    </div>
  )
}
