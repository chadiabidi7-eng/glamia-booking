import * as Lucide from 'lucide-react'
import SpecialiteIcon, { aUnDessin } from '@/components/SpecialiteIcon'
import { CATEGORIE_AUTRE } from '@/lib/categorie-autre'
import { FOND_ICONE, OMBRE_ICONE, TRAIT_ICONE, iconeValide } from '@/lib/icones-categorie'

// ─────────────────────────────────────────────────────────────────────────────
// L'ICÔNE D'UNE CATÉGORIE, TELLE QUE LA CLIENTE LA VOIT
//
// Trois cas :
//   - une catégorie du catalogue (Manucure, Cils…) : son dessin (SpecialiteIcon) ;
//   - « Autre », ou une catégorie que la pro a créée : l'icône qu'elle a
//     choisie, dessinée « construite » — trait épais beige, ombre prune, disque
//     rose qui reçoit la lumière — pour ressembler aux dessins d'à côté et non
//     à une icône de bibliothèque (3.0, 24 septembre 2026) ;
//   - une catégorie sans icône : son initiale, dans le même disque.
// ─────────────────────────────────────────────────────────────────────────────

type Trait = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>
const traitLucide = (nom: string): Trait | undefined =>
  (Lucide as unknown as Record<string, Trait>)[nom]

type Props = {
  categorie: string
  /** L'icône choisie par la pro pour « Autre ». */
  icone?: string | null
  /** Les icônes de ses catégories à elle, par nom. */
  perso?: Record<string, string | null>
  size?: number
}

function IconeLibre({ icone, initiale, size }: { icone: string | null; initiale: string; size: number }) {
  const Dessin = icone ? traitLucide(icone) : undefined
  const taille = Math.round(size * 0.6)
  const dx = size * 0.035, dy = size * 0.045
  return (
    <span
      style={{
        position: 'relative', width: size, height: size, borderRadius: '50%', background: FOND_ICONE,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden',
      }}>
      <span style={{ position: 'absolute', width: size * 0.86, height: size * 0.86, borderRadius: '50%', top: size * 0.03, left: size * 0.03, background: 'rgba(255,255,255,0.11)' }} />
      {Dessin ? (
        <>
          <span style={{ position: 'absolute', display: 'inline-flex', transform: `translate(${dx}px, ${dy}px)` }}>
            <Dessin size={taille} color={OMBRE_ICONE} strokeWidth={2.8} />
          </span>
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            <Dessin size={taille} color={TRAIT_ICONE} strokeWidth={2.8} />
          </span>
        </>
      ) : (
        <>
          <span style={{ position: 'absolute', fontSize: size * 0.46, fontWeight: 800, color: OMBRE_ICONE, lineHeight: 1, transform: `translate(${dx}px, ${dy}px)` }}>{initiale}</span>
          <span style={{ position: 'relative', fontSize: size * 0.46, fontWeight: 800, color: TRAIT_ICONE, lineHeight: 1 }}>{initiale}</span>
        </>
      )}
    </span>
  )
}

export default function IconeCategorie({ categorie, icone, perso, size = 28 }: Props) {
  const initiale = (categorie ?? '').trim().charAt(0).toUpperCase() || '·'

  if (categorie === CATEGORIE_AUTRE) {
    const choisie = typeof icone === 'string' && iconeValide(icone) ? icone : null
    if (choisie) return <IconeLibre icone={choisie} initiale={initiale} size={size} />
    return <SpecialiteIcon specialite={categorie} size={size} />
  }
  if (perso && categorie in perso) {
    const choisie = perso[categorie]
    return <IconeLibre icone={iconeValide(choisie) ? choisie : null} initiale={initiale} size={size} />
  }
  // Le catalogue a son dessin ; un nom inconnu a son initiale.
  return aUnDessin(categorie)
    ? <SpecialiteIcon specialite={categorie} size={size} />
    : <IconeLibre icone={null} initiale={initiale} size={size} />
}
