// Les liens universels (10 oct. 2026) : iOS lit ce fichier pour savoir que les
// liens https://booking.glamia.pro/ouvrir/… peuvent ouvrir l'app Glamia
// directement. Rien d'autre du site n'ouvre l'app : les pages de réservation
// restent des pages web.
export const dynamic = 'force-static'

export function GET() {
  return Response.json({
    applinks: {
      // Transfert de l'app vers le compte de Nina (23 nov. 2026) : les deux équipes, le temps que
      // tous les iPhone aient la version construite par l'équipe de Nina (S2YH36B727).
      details: [{ appIDs: ['W46Z5S22LX.com.chadiabidi.glamia', 'S2YH36B727.com.chadiabidi.glamia'], components: [{ '/': '/ouvrir/*' }] }],
    },
  })
}
