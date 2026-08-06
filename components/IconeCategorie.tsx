import * as Lucide from 'lucide-react'
import SpecialiteIcon from '@/components/SpecialiteIcon'
import { CATEGORIE_AUTRE } from '@/lib/categorie-autre'
import { FOND_ICONE, TRAIT_ICONE, iconeValide } from '@/lib/icones-categorie'

// ─────────────────────────────────────────────────────────────────────────────
// L'ICÔNE D'UNE CATÉGORIE, côté cliente.
//
// Même règle que dans l'app : les catégories du catalogue gardent leur dessin,
// seule celle que la pro a nommée peut porter l'icône de son choix — rond rose
// Glamia, trait beige, comme les autres.
//
// SANS CHOIX, ON RETOMBE SUR LE DESSIN D'ORIGINE. Jamais de trou dans la page.
// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  categorie: string
  /** Le nom de l'icône choisie par la pro. */
  icone?: string | null
  size?: number
}

export default function IconeCategorie({ categorie, icone, size = 28 }: Props) {
  const choisie = typeof icone === 'string' && iconeValide(icone) ? icone : null
  if (categorie !== CATEGORIE_AUTRE || !choisie) {
    return <SpecialiteIcon specialite={categorie} size={size} />
  }

  // Le nom rangé désigne un composant de la bibliothèque. Il a été vérifié,
  // mais on se garde d'un nom devenu obsolète après une mise à jour : mieux
  // vaut l'ancien dessin qu'une page qui tombe.
  const Trait = (Lucide as unknown as Record<string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>>)[choisie]
  if (!Trait) return <SpecialiteIcon specialite={categorie} size={size} />

  return (
    <span
      style={{
        width: size, height: size, borderRadius: '50%', background: FOND_ICONE,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
      <Trait size={Math.round(size * 0.56)} color={TRAIT_ICONE} strokeWidth={2.2} />
    </span>
  )
}
