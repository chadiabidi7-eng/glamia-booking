import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { reglagesPay } from './pays-stripe'

// ─────────────────────────────────────────────────────────────────────────────
// Glamia Pay — traitement automatique d'une ANNULATION de RDV côté cliente.
//
// Règle (spec 13 juil. 2026, seuil 24 h) :
//   > 24 h avant le RDV : empreinte → libérée ; acompte/total payé → remboursé
//   < 24 h avant le RDV : empreinte → PRÉLEVÉE (motif annulation_tardive) ;
//                         acompte/total payé → conservé par la pro
//
// Appelée par /api/propay/annulation (annulation depuis la page de résa) et
// par l'API du lien de gestion (action 'annuler'). Ne lève jamais : les échecs
// sont journalisés, l'annulation du RDV n'est jamais bloquée par le paiement.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

/**
 * Le délai en dessous duquel une annulation n'est plus remboursée.
 *
 * C'EST LA PRO QUI LE CHOISIT — 24 ou 48 heures. 48 h convient aux prestations
 * longues : une pose complète qui saute la veille au soir ne se remplace pas,
 * alors qu'un rendez-vous d'une demi-heure se recase.
 *
 * Repli sur 24 h quand rien n'est réglé : c'est la règle historique, et aucune
 * pro ne doit voir son seuil changer sous ses pieds.
 */
function seuilTardiveMs(config: unknown): number {
  const heures = (config as { delai_annulation?: number } | null)?.delai_annulation
  return (heures === 48 ? 48 : 24) * 3600_000
}
// LA COMMISSION GLAMIA EST À ZÉRO. Décision de Chadi, 5 août 2026.
//
// Elle rapportait 30 centimes sur un acompte de 20 € — il aurait fallu 66 000 €
// encaissés par mois pour en tirer 1 000. Surtout, elle contredisait la
// promesse écrite sur le paywall : « de sa carte au tien, Glamia n'y touche
// jamais ». Le modèle, c'est l'abonnement : 19,99 € par mois, clair et
// prévisible. Empiler une commission dessus, c'est le début d'une facture qu'on
// ne comprend plus.
//
// LES FRAIS DE RÉSERVATION RESTENT, EUX, À LA CHARGE DE LA CLIENTE : ce sont
// des frais de SERVICE — rappels automatiques, décalage en autonomie, photos
// d'inspiration, carte de fidélité — et non le coût de la carte bancaire. La
// page de réservation les détaille derrière un « i ».
//
// La constante reste plutôt que d'être supprimée : elle nomme l'endroit où la
// règle vit, et le jour où elle changera, il n'y aura qu'un fichier à ouvrir.
const COMMISSION_GLAMIA_PCT = 0
// Repli seul : les vrais taux viennent du pays de la caisse (lib/pays-stripe.ts).
// Une caisse ouverte avant le 5 août 2026 n'a pas de pays enregistré — elle est
// forcément française, c'était écrit en dur.
const STRIPE_PCT = 0.015
const STRIPE_FIXE_CENTIMES = 25

export async function traiterAnnulationPropay(rdvId: string): Promise<{ resultat: string }> {
  // Suivi du verrou : si une erreur inattendue survient APRÈS le claim, on
  // restaure le statut d'origine dans le catch — jamais de ligne figée en
  // 'annulation_en_cours' (qui serait invisible à tout rejeu → argent perdu).
  let claimId: string | null = null
  let statutAvantClaim: string | null = null
  try {
    const { data: paiement } = await supabaseAdmin
      .from('paiements')
      .select('*')
      .eq('rdv_id', rdvId)
      // rembourse_partiel inclus : un geste commercial a rendu une part, mais
      // il reste un solde à rembourser si la cliente annule > 24 h (faille C17).
      .in('statut', ['empreinte_posee', 'acompte_paye', 'paye', 'rembourse_partiel'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!paiement) return { resultat: 'aucun_paiement' }

    const { data: rdv } = await supabaseAdmin
      .from('rendez_vous')
      .select('date, annule_par, date_change_pro_le')
      .eq('id', rdvId)
      .maybeSingle()
    if (!rdv?.date) return { resultat: 'rdv_introuvable' }

    // Annulation décidée par la PRO : le volet paiement est géré par l'app
    // (empreinte libérée + choix de remboursement de l'acompte). La route
    // publique ne doit RIEN faire — sinon, dans la fenêtre entre le passage
    // du RDV en 'annule' et la libération, elle prélèverait la cliente pour
    // une annulation qu'elle n'a pas décidée (faille C16).
    if ((rdv as { annule_par?: string | null }).annule_par === 'pro') {
      return { resultat: 'annule_par_pro' }
    }

    const { data: compte } = await supabaseAdmin
      .from('stripe_comptes')
      .select('account_id, pays, devise')
      .eq('pro_id', paiement.pro_id)
      .maybeSingle()
    if (!compte) return { resultat: 'compte_introuvable' }
    const stripeAccount = compte.account_id
    // Le prélèvement d'un lapin se fait dans la monnaie de la caisse, majoré au
    // taux du pays — sinon une pro suisse verrait partir des euros, et la
    // majoration calculée à 1,5 % ne couvrirait pas les 2,9 % réellement pris.
    const devise = ((compte.devise as string | null) ?? 'eur').toLowerCase()
    const taux = compte.pays
      ? reglagesPay(compte.pays as string)
      : { fraisPct: STRIPE_PCT, fraisFixe: STRIPE_FIXE_CENTIMES }

    // Le seuil est celui que LA PRO a réglé — 24 ou 48 heures.
    const { data: reglages } = await supabaseAdmin
      .from('profiles').select('acompte_config').eq('id', paiement.pro_id).maybeSingle()
    const SEUIL_TARDIVE_MS = seuilTardiveMs((reglages as { acompte_config?: unknown } | null)?.acompte_config)

    // Grâce C5 : si la PRO a déplacé le RDV dans les dernières 24 h, l'annulation
    // de la cliente n'est PAS tardive — elle ne doit pas être prélevée pour un
    // déplacement qu'elle n'a pas décidé (même si le nouveau créneau est < 24 h).
    const changeProRecent = (rdv as { date_change_pro_le?: string | null }).date_change_pro_le
      ? Date.now() - new Date((rdv as { date_change_pro_le: string }).date_change_pro_le).getTime() < SEUIL_TARDIVE_MS
      : false
    const tardive = !changeProRecent && new Date(rdv.date).getTime() - Date.now() < SEUIL_TARDIVE_MS
    const historique = Array.isArray(paiement.historique) ? paiement.historique : []
    const maintenant = new Date().toISOString()

    // ── Claim atomique (audit 14 juil.) : deux appels concurrents (route
    // annulation + lien de gestion, ou simple rejeu) liraient tous deux le
    // même statut et rembourseraient/prélèveraient DEUX fois. Seul l'appel
    // qui bascule réellement la ligne continue.
    const { data: claim } = await supabaseAdmin.from('paiements')
      .update({ statut: 'annulation_en_cours', updated_at: maintenant })
      .eq('id', paiement.id)
      .eq('statut', paiement.statut)
      .select('id')
    if (!claim || claim.length === 0) return { resultat: 'deja_traite' }
    claimId = paiement.id
    statutAvantClaim = paiement.statut

    // ── Empreinte ──
    if (paiement.statut === 'empreinte_posee') {
      if (!tardive) {
        await supabaseAdmin.from('paiements').update({
          statut: 'libere',
          historique: [...historique, { quand: maintenant, evenement: 'libere', detail: 'annulation > 24 h — automatique' }],
          updated_at: maintenant,
        }).eq('id', paiement.id)
        return { resultat: 'libere' }
      }
      // Annulation tardive → prélèvement automatique (gross-up)
      if (!paiement.stripe_customer_id || !paiement.stripe_payment_method_id) {
        // rendre la ligne réutilisable (pas d'action d'argent effectuée)
        await supabaseAdmin.from('paiements').update({ statut: paiement.statut, updated_at: maintenant }).eq('id', paiement.id)
        return { resultat: 'carte_manquante' }
      }
      const acompte = paiement.montant
      const commission = Math.round(acompte * COMMISSION_GLAMIA_PCT)
      const totalCliente = Math.ceil((acompte + taux.fraisFixe + commission) / (1 - taux.fraisPct))
      try {
        const intent = await stripe.paymentIntents.create(
          {
            amount: totalCliente,
            currency: devise,
            customer: paiement.stripe_customer_id,
            payment_method: paiement.stripe_payment_method_id,
            off_session: true,
            confirm: true,
            application_fee_amount: commission,
            metadata: { glamia_type: 'prelevement_annulation_tardive', glamia_paiement_id: paiement.id },
          },
          // idempotencyKey : un rejeu identique ne crée pas un 2e débit
          { stripeAccount, idempotencyKey: `annul_prelev_${paiement.id}` },
        )
        await supabaseAdmin.from('paiements').update({
          statut: 'preleve',
          motif_prelevement: 'annulation_tardive',
          stripe_payment_intent_id: intent.id,
          frais_reservation: totalCliente - acompte,
          commission_glamia: commission,
          historique: [...historique, { quand: maintenant, evenement: 'preleve', detail: 'annulation < 24 h — automatique' }],
          updated_at: maintenant,
        }).eq('id', paiement.id)
        return { resultat: 'preleve' }
      } catch (e) {
        const erreur = e as { code?: string; message?: string }
        await supabaseAdmin.from('paiements').update({
          statut: 'echec_prelevement',
          motif_prelevement: 'annulation_tardive',
          historique: [...historique, { quand: maintenant, evenement: 'echec_prelevement', detail: erreur.code ?? erreur.message }],
          updated_at: maintenant,
        }).eq('id', paiement.id)
        return { resultat: 'echec_prelevement' }
      }
    }

    // ── Acompte réel ou prestation payée ──
    if (!tardive) {
      if (!paiement.stripe_payment_intent_id) {
        await supabaseAdmin.from('paiements').update({ statut: paiement.statut, updated_at: maintenant }).eq('id', paiement.id)
        return { resultat: 'paiement_stripe_manquant' }
      }
      // Frais de réservation CONSERVÉS (modèle plateforme, décision 15 juil.) :
      // seul le montant de la prestation revient à la cliente. La commission
      // n'est pas rendue (couverte par les frais) → la pro reste à ~0 net.
      // idempotencyKey : un rejeu identique ne crée pas un 2e remboursement.
      // Si Stripe échoue (lenteur, coupure), on RESTAURE le statut d'origine
      // au lieu de laisser la ligne coincée en 'annulation_en_cours' à vie
      // (le filtre d'entrée l'exclurait de tout rejeu → argent jamais rendu
      // sans SQL manuel). Statut d'origine = récupérable : rejouable par le
      // cron de réconciliation ou un remboursement manuel de la pro.
      // Reste à rembourser = montant − déjà remboursé (cas rembourse_partiel :
      // un geste commercial a déjà rendu une part ; on ne rembourse que le
      // solde, sinon Stripe rejette un montant supérieur au restant).
      const dejaRembourse = paiement.montant_rembourse ?? 0
      const resteARembourser = paiement.montant - dejaRembourse
      if (resteARembourser > 0) {
        try {
          await stripe.refunds.create(
            { payment_intent: paiement.stripe_payment_intent_id, amount: resteARembourser, refund_application_fee: false },
            { stripeAccount, idempotencyKey: `annul_remb_${paiement.id}_${dejaRembourse}` },
          )
        } catch (e) {
          const erreur = e as { code?: string; message?: string }
          await supabaseAdmin.from('paiements').update({
            statut: paiement.statut,
            historique: [...historique, { quand: maintenant, evenement: 'echec_remboursement', detail: erreur.code ?? erreur.message }],
            updated_at: maintenant,
          }).eq('id', paiement.id)
          return { resultat: 'echec_remboursement' }
        }
      }
      await supabaseAdmin.from('paiements').update({
        statut: 'rembourse',
        montant_rembourse: paiement.montant,
        historique: [...historique, { quand: maintenant, evenement: 'rembourse', detail: 'annulation > 24 h — automatique, frais de réservation conservés' }],
        updated_at: maintenant,
      }).eq('id', paiement.id)
      return { resultat: 'rembourse' }
    }
    // Tardive : la pro conserve la somme — simple trace (statut d'origine
    // restauré : le claim l'avait basculé en annulation_en_cours)
    await supabaseAdmin.from('paiements').update({
      statut: paiement.statut,
      motif_prelevement: 'annulation_tardive',
      historique: [...historique, { quand: maintenant, evenement: 'conserve', detail: 'annulation < 24 h — somme conservée' }],
      updated_at: maintenant,
    }).eq('id', paiement.id)
    return { resultat: 'conserve' }
  } catch (e) {
    console.error('[propay] annulation:', rdvId, e)
    // Ne jamais laisser la ligne coincée : restaurer le statut d'origine
    // (récupérable ; le rejeu Stripe est idempotent via les clés annul_*).
    if (claimId && statutAvantClaim) {
      try {
        await supabaseAdmin.from('paiements')
          .update({ statut: statutAvantClaim, updated_at: new Date().toISOString() })
          .eq('id', claimId)
          .eq('statut', 'annulation_en_cours')
      } catch { /* best-effort */ }
    }
    return { resultat: 'erreur' }
  }
}
