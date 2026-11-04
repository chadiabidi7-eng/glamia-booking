import { prosReferencees } from '@/lib/pros-referencees'

// La liste des pros référencées, pour le pied de glamia.pro (autre site, même
// règle). Rien de privé : ce sont les noms, métiers et villes que leurs pages
// publiques affichent déjà. Gardée une heure.
export const revalidate = 3600

export async function GET() {
  const pros = await prosReferencees()
  return Response.json({ pros }, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } })
}
