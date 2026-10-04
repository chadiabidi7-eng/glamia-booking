// ─────────────────────────────────────────────────────────────────────────────
// LA FORMULE D'UNE PRO, VUE DE LA PAGE DE RÉSERVATION (3.0, 4 octobre 2026)
//
// Free, Pro ou Ultra — la même répartition que le paywall de l'app
// (Glamia-3.0/lib/formules.ts). Ultra = l'ancien Pro Pay (`pro_pay_actif`) ;
// Pro = abonnée (`abonnement_actif`) ou essai en cours. Une pro qui perd sa
// formule perd ce qu'elle débloque ICI aussi, sans rien effacer : ses réglages
// restent en base et reviennent si elle se réabonne.
//
// Ce que la page vérifie :
//   · Pro  — formulaire de pré-réservation, liste d'attente, planning libre,
//            réductions personnelles, couleur de la page ;
//   · Ultra — (acomptes et empreintes : déjà par `pro_pay_actif`).
// ─────────────────────────────────────────────────────────────────────────────

export type Formule = 'free' | 'pro' | 'ultra'

/** Les colonnes à lire pour connaître la formule. */
export const CHAMPS_FORMULE = 'abonnement_actif, pro_pay_actif, trial_ends_at'

export function formuleDe(p: { abonnement_actif?: unknown; pro_pay_actif?: unknown; trial_ends_at?: unknown } | null | undefined): Formule {
  if (!p) return 'free'
  if (p.pro_pay_actif === true) return 'ultra'
  if (p.abonnement_actif === true) return 'pro'
  if (typeof p.trial_ends_at === 'string' && new Date(p.trial_ends_at) > new Date()) return 'pro'
  return 'free'
}

/** Pro ou Ultra : les fonctions de la formule Pro. */
export const aPro = (f: Formule) => f !== 'free'
