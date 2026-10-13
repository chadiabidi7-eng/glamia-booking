import { notFound } from 'next/navigation'
import Recherche from '@/components/beaute/Recherche'
import { baseResa, langueDuVisiteur } from '@/lib/beaute-langue'
import { donneesStructurees } from '@/lib/beaute-seo'
import { aVille, TEXTES, type Metier } from '@/lib/beaute-textes'
import { donneesVille } from '@/lib/recherche-pros'

// La page d'une ville, ou d'une ville pour un métier (/beaute/lyon/cils).
// Les deux lisent la même ville en cache : un métier ne coûte rien de plus à la base.
export default async function PageVille({ slug, metier = null }: { slug: string; metier?: Metier | null }) {
  const [d, langue, base] = await Promise.all([donneesVille(slug), langueDuVisiteur(), baseResa()])
  if (!d) notFound()
  const T = TEXTES[langue]
  // « Cils au » + « Plessis-Robinson » : l'article de la ville se contracte en français.
  let titre = '', chute = d.ville.nom
  if (metier) {
    if (langue === 'fr') {
      const [prep, ...reste] = aVille(d.ville.nom).split(' ')
      titre = `${T.metiers[metier]} ${prep}`; chute = reste.join(' ')
    } else titre = `${T.metiers[metier]} ${T.a}`
  }
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: donneesStructurees(d, langue, metier) }} />
      <Recherche langue={langue} titre={titre} chute={chute} pros={d.pros}
        centre={d.ville.lat !== null && d.ville.lon !== null ? { lat: d.ville.lat, lon: d.ville.lon } : null}
        baseResa={base} villeSlug={d.ville.slug} metierInitial={metier} voisines={d.voisines} />
    </>
  )
}
