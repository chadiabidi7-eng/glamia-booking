import Recherche from '@/components/beaute/Recherche'
import { langueDuVisiteur } from '@/lib/beaute-langue'
import { TEXTES } from '@/lib/beaute-textes'
import { prosAutour } from '@/lib/recherche-pros'

// glamia.pro/beaute/autour?lat=…&lon=… — les pros à moins de 15 km d'elle.
// La position arrive arrondie au kilomètre près depuis son navigateur.
export default async function Autour({ searchParams }: { searchParams: Promise<{ lat?: string; lon?: string }> }) {
  const { lat, lon } = await searchParams
  const la = Number(lat), lo = Number(lon)
  const [pros, langue] = await Promise.all([prosAutour(la, lo), langueDuVisiteur()])
  const centre = Number.isFinite(la) && Number.isFinite(lo) ? { lat: la, lon: lo } : null
  return <Recherche langue={langue} titre={TEXTES[langue].autourTitre} chute={TEXTES[langue].autourChute} pros={pros} centre={centre} />
}
