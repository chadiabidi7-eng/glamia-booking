import Stripe from 'stripe'

// ─────────────────────────────────────────────────────────────────────────────
// LE CLIENT STRIPE, CONSTRUIT AU PREMIER APPEL ET PAS AVANT.
//
// Chaque guichet de paiement faisait `new Stripe(process.env.STRIPE_SECRET_KEY!)`
// à l'ouverture du fichier. Or Stripe refuse d'être construit sans clé — et la
// mise en production du 9 août 2026 a échoué là-dessus : la clé n'existait que
// sur les environnements d'essai, et la CONSTRUCTION DU SITE ENTIER s'est
// arrêtée sur « Neither apiKey nor config.authenticator provided ».
//
// C'est une dépendance qu'on ne peut pas se permettre. La page de réservation
// fait vivre 300 professionnelles ; elle ne doit pas cesser d'exister parce
// qu'une clé de paiement manque. Glamia Pay peut être indisponible — le reste
// doit tenir debout.
//
// Le client est donc fabriqué au premier appel réel. Sans clé, seul l'appel
// échoue, et les pages qui s'en servent savent déjà retomber sur « pas
// d'acompte » : la cliente réserve normalement.
// ─────────────────────────────────────────────────────────────────────────────

let client: Stripe | null = null

export function stripe(): Stripe {
  if (!client) {
    const cle = process.env.STRIPE_SECRET_KEY
    if (!cle) throw new Error('stripe_non_configure')
    client = new Stripe(cle)
  }
  return client
}
