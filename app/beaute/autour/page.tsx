import Recherche from '@/components/beaute/Recherche'
import { langueDuVisiteur } from '@/lib/beaute-langue'
import { TEXTES } from '@/lib/beaute-textes'
import { prosAutour } from '@/lib/recherche-pros'

// glamia.pro/beaute/autour?lat=…&lon=…[&l=…] — les pros à moins de 15 km d'un
// point : sa position (« Autour de moi »), ou l'adresse / le code postal qu'elle
// a tapés, dont le nom arrive dans « l » et sert de titre.
export default async function Autour({ searchParams }: { searchParams: Promise<{ lat?: string; lon?: string; l?: string }> }) {
  const { lat, lon, l } = await searchParams
  const la = Number(lat), lo = Number(lon)
  const [pros, langue] = await Promise.all([prosAutour(la, lo), langueDuVisiteur()])
  const centre = Number.isFinite(la) && Number.isFinite(lo) ? { lat: la, lon: lo } : null
  const libelle = (l ?? '').trim().slice(0, 80)
  return libelle
    ? <Recherche langue={langue} titre="" chute={libelle} pros={pros} centre={centre} autourDuPoint />
    : <Recherche langue={langue} titre={TEXTES[langue].autourTitre} chute={TEXTES[langue].autourChute} pros={pros} centre={centre} autourDuPoint />
}
