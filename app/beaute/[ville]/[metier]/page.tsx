import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import PageVille from '@/components/beaute/PageVille'
import { langueDuVisiteur } from '@/lib/beaute-langue'
import { metadataVille } from '@/lib/beaute-seo'
import { metierDuSlug } from '@/lib/beaute-textes'
import { donneesVille } from '@/lib/recherche-pros'

// glamia.fr/beaute/lyon/cils — les pros d'une ville pour un métier (13 oct. 2026).
// Même liste que la page de la ville, filtrée sur le métier dès l'arrivée ; la
// cliente peut revenir à « Tout » d'un geste. Sans aucune pro du métier, la
// page reste hors de Google.
export const revalidate = 300

export async function generateMetadata({ params }: { params: Promise<{ ville: string; metier: string }> }): Promise<Metadata> {
  const { ville, metier } = await params
  const m = metierDuSlug(metier)
  if (!m) return { robots: { index: false, follow: false } }
  const [d, langue] = await Promise.all([donneesVille(ville), langueDuVisiteur()])
  return metadataVille(d, langue, m)
}

export default async function Page({ params }: { params: Promise<{ ville: string; metier: string }> }) {
  const { ville, metier } = await params
  const m = metierDuSlug(metier)
  if (!m) notFound()
  return <PageVille slug={ville} metier={m} />
}
