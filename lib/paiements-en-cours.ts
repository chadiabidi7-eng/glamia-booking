import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// LA PORTE DES QUINZE MINUTES.
//
// LE 21 SEPTEMBRE 2026, une cliente d'Afro Permanent Paris a commencé à payer à
// 19h49 et n'a validé le code de sa banque qu'à 21h10 — une heure vingt et une
// plus tard. Sa page était morte depuis longtemps.
//
// LE PAIEMENT, LUI, A ABOUTI TOUT SEUL. La banque parle directement à Stripe ;
// le téléphone de la cliente ne sert à rien. Le rendez-vous, si : c'est la page
// qui le crée, et seulement APRÈS le paiement. 52,29 € encaissés, aucun
// rendez-vous, et personne prévenu avant le lendemain.
//
// ── POURQUOI ON TIENT CETTE LISTE NOUS-MÊMES ────────────────────────────────
// Parce qu'on ne peut pas demander à Stripe « quels paiements attendent encore
// la banque ? » : son API ne sait pas filtrer par état. Il faudrait relire les
// paiements récents des quarante-trois caisses, chaque minute.
//
// On note donc ceux qu'on ouvre, puisque c'est nous qui les ouvrons. Dans une
// réservation normale la ligne vit trente secondes : posée quand la cliente
// arrive au paiement, effacée dès que le rendez-vous existe. Celles qui restent
// sont exactement les paiements en souffrance, et il y en a une poignée.
//
// La tâche `orphelins-verifier`, qui passe déjà chaque minute, annule chez
// Stripe celles de plus de quinze minutes — AVANT que l'argent parte. Ce n'est
// pas un remboursement : rien n'est jamais encaissé puis rendu.
//
// ── RIEN ICI NE DOIT JAMAIS BLOQUER UNE RÉSERVATION ─────────────────────────
// Une note qui ne s'écrit pas laisse la porte entrouverte pour CE paiement-là.
// Une cliente bloquée devant son écran, c'est un rendez-vous perdu à coup sûr.
// Les deux fonctions avalent donc leurs erreurs, comme le filet des métadonnées
// posé juste à côté.
// ─────────────────────────────────────────────────────────────────────────────

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

/**
 * Un paiement vient de s'ouvrir : on le surveille jusqu'à son rendez-vous.
 *
 * `intentId` porte son propre type : `pi_…` pour un acompte, `seti_…` pour une
 * empreinte. Les deux ont exactement le même défaut, les deux sont surveillés.
 */
export async function noterPaiementEnCours(
  intentId: string,
  proId: string,
  accountId: string,
): Promise<void> {
  try {
    await admin()
      .from('paiements_en_cours')
      .upsert({ intent_id: intentId, pro_id: proId, account_id: accountId }, { onConflict: 'intent_id' })
  } catch (e) {
    console.error('[paiements-en-cours] note non posée', intentId, e)
  }
}

/**
 * Le rendez-vous existe et le paiement lui est rattaché : plus rien à
 * surveiller. C'est le cas de l'immense majorité des réservations.
 */
export async function oublierPaiementEnCours(intentId: string): Promise<void> {
  try {
    await admin().from('paiements_en_cours').delete().eq('intent_id', intentId)
  } catch (e) {
    console.error('[paiements-en-cours] note non effacée', intentId, e)
  }
}
