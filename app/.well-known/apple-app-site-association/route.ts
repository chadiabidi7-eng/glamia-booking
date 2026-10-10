// Les liens universels (10 oct. 2026) : iOS lit ce fichier pour savoir que les
// liens https://booking.glamia.pro/ouvrir/… peuvent ouvrir l'app Glamia
// directement. Rien d'autre du site n'ouvre l'app : les pages de réservation
// restent des pages web.
export const dynamic = 'force-static'

export function GET() {
  return Response.json({
    applinks: {
      details: [{ appIDs: ['W46Z5S22LX.com.chadiabidi.glamia'], components: [{ '/': '/ouvrir/*' }] }],
    },
  })
}
