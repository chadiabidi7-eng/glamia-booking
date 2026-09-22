import type { MetadataRoute } from 'next'

// ─────────────────────────────────────────────────────────────────────────────
// CE QUE GOOGLE A LE DROIT DE REGARDER.
//
// Jusqu'ici, l'adresse `booking.glamia.pro/robots.txt` renvoyait la page
// « 404 » du site. Ce n'est pas neutre : c'est le tout premier fichier qu'un
// moteur demande, et le trouver absent est un mauvais signal sur la tenue du
// site.
//
// ON OUVRE LES PAGES DE RÉSERVATION, ON FERME LE RESTE. Les guichets internes,
// les écrans de paiement et les pages de confirmation n'ont rien à faire dans
// un moteur de recherche : ils ne veulent rien dire hors de leur contexte, et
// certains portent un jeton dans leur adresse.
//
// C'est ici aussi qu'on indique où trouver la liste des pages.
// ─────────────────────────────────────────────────────────────────────────────

const SITE = 'https://booking.glamia.pro'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          // Les guichets : ils répondent à l'app et à la page, pas au public.
          '/api/',
          // L'administration.
          '/admin',
          // Tout ce qui porte un jeton ou un contexte de paiement : ces
          // adresses n'ont de sens que pour la cliente qui vient de réserver.
          '/paiement',
          '/payer',
          '/confirmation',
          // La page de suppression de compte, exigée par le Play Store : elle
          // s'adresse aux pros, pas aux clientes, et n'a aucune raison de
          // sortir dans une recherche.
          '/suppression-compte',
        ],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
  }
}
