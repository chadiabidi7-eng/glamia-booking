import type { Metadata } from 'next'
import PageVille from '@/components/beaute/PageVille'
import { langueDuVisiteur } from '@/lib/beaute-langue'
import { metadataVille } from '@/lib/beaute-seo'
import { donneesVille } from '@/lib/recherche-pros'

// glamia.pro/beaute/dijon — les pros d'une ville. Les données de la ville sont
// gardées cinq minutes (donneesVille) : une ville visitée cent fois ne touche
// la base qu'une fois.
export const revalidate = 300

export async function generateMetadata({ params }: { params: Promise<{ ville: string }> }): Promise<Metadata> {
  const { ville } = await params
  const [d, langue] = await Promise.all([donneesVille(ville), langueDuVisiteur()])
  return metadataVille(d, langue)
}

export default async function Page({ params }: { params: Promise<{ ville: string }> }) {
  const { ville } = await params
  return <PageVille slug={ville} />
}
