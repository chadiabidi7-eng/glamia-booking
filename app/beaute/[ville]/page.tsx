import { notFound } from 'next/navigation'
import Recherche from '@/components/beaute/Recherche'
import { langueDuVisiteur } from '@/lib/beaute-langue'
import { prosDeLaVille, villeDepuisSlug } from '@/lib/recherche-pros'

// glamia.pro/beaute/dijon — les pros d'une ville. Mise en cache cinq minutes :
// une ville visitée cent fois ne touche la base qu'une fois.
export const revalidate = 300

export default async function PageVille({ params }: { params: Promise<{ ville: string }> }) {
  const { ville: slug } = await params
  const ville = await villeDepuisSlug(slug)
  if (!ville) notFound()
  const [pros, langue] = await Promise.all([prosDeLaVille(ville), langueDuVisiteur()])
  return (
    <Recherche langue={langue} titre="" chute={ville.nom} pros={pros}
      centre={ville.lat !== null && ville.lon !== null ? { lat: ville.lat, lon: ville.lon } : null} />
  )
}
