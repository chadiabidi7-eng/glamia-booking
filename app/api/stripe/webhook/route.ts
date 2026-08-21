import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe-serveur'
import { traduireDans } from '@/lib/i18n'
import { symboleDevise } from '@/lib/devise'

// ─────────────────────────────────────────────────────────────────────────────
// Glamia Pro Pay — webhook Stripe (endpoint « Connect » : événements des
// comptes connectés des pros). Signature vérifiée (STRIPE_WEBHOOK_SECRET).
//
// - account.updated            → statut d'onboarding dans stripe_comptes
// - charge.refunded            → paiements.statut = 'rembourse'
// - charge.dispute.created     → paiements.statut = 'conteste' + push pro
// - payment_intent.payment_failed → journalisé (le prélèvement lapin gère
//   déjà son propre échec, ceci est un filet de sécurité)
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)


// Prestation entièrement réglée → l'empreinte posée à la résa n'a plus lieu
// d'être : libération automatique, trace conservée (« Empreinte libérée »).
// Sans ça, la pro pourrait encaisser PUIS prélever = cliente payée deux fois.
export async function libererEmpreintesRdv(rdvId: string) {
  const { data: empreintes } = await supabaseAdmin.from('paiements')
    .select('id, historique')
    .eq('rdv_id', rdvId)
    .eq('statut', 'empreinte_posee')
  for (const e of empreintes ?? []) {
    const hist = Array.isArray(e.historique) ? e.historique : []
    await supabaseAdmin.from('paiements').update({
      statut: 'libere',
      historique: [...hist, { quand: new Date().toISOString(), evenement: 'libere', detail: 'prestation payée — libération automatique' }],
      updated_at: new Date().toISOString(),
    }).eq('id', e.id).eq('statut', 'empreinte_posee')
  }
}

/**
 * Prévenir une pro, DANS SA LANGUE.
 *
 * On lui passe des clés, pas des phrases : le serveur sert toutes les pros, et
 * c'est ici — au moment où l'on va chercher son jeton — qu'on sait enfin
 * laquelle. Sa langue est lue au même endroit, ça ne coûte rien de plus.
 */
async function pousserNotifPro(
  proId: string,
  cleTitre: string,
  cleCorps: string,
  valeurs?: Record<string, unknown>,
) {
  const { data: pro } = await supabaseAdmin
    .from('profiles').select('push_token, langue, devise').eq('id', proId).maybeSingle()
  if (!pro?.push_token) return
  const langue = (pro as { langue?: string }).langue
  // LES SOMMES SONT DANS LA MONNAIE DE LA PRO. Les phrases portaient un « € »
  // écrit en dur : une pro britannique lisait « 30.00 € » pour un encaissement
  // en livres. Le montant arrive en centimes, il repart avec son symbole.
  const valeursAvecDevise = valeurs?.montantCentimes !== undefined
    ? { ...valeurs, montant: `${(Number(valeurs.montantCentimes) / 100).toFixed(2)} ${symboleDevise((pro as { devise?: string }).devise)}` }
    : valeurs
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: pro.push_token,
      title: traduireDans(langue, cleTitre),
      body: traduireDans(langue, cleCorps, valeursAvecDevise),
    }),
  })
}

/**
 * Note un paiement qui n'a, à cette seconde, aucune fiche en face.
 *
 * On ne retient que les paiements PASSÉS PAR GLAMIA — ceux qui portent notre
 * marque. Un encaissement fait par la pro depuis son tableau de bord Stripe
 * n'est pas un défaut : il ne nous regarde pas, et il n'a rien à faire dans
 * les alertes.
 */
async function noterSiSansRendezVous(intent: Stripe.PaymentIntent) {
  try {
    const proId = intent.metadata?.glamia_pro_id
    if (!proId) return

    const { data: existante } = await supabaseAdmin
      .from('paiements')
      .select('id')
      .eq('stripe_payment_intent_id', intent.id)
      .maybeSingle()
    if (existante) return

    // `ignoreDuplicates` : Stripe rejoue ses avis, on ne veut qu'une ligne par
    // paiement — et donc au plus une alerte.
    await supabaseAdmin.from('paiements_orphelins').upsert(
      {
        stripe_intent_id: intent.id,
        pro_id: proId,
        montant: intent.amount ?? 0,
        devise: (intent.currency ?? 'eur').toLowerCase(),
        cause: 'mort_reseau',
        statut: 'candidat',
        rembourse: false,
        notifie: false,
      },
      { onConflict: 'stripe_intent_id', ignoreDuplicates: true },
    )
  } catch (e) {
    // Un filet qui tombe ne doit jamais empêcher le reste du webhook de faire
    // son travail : l'argent d'une réservation normale passe avant l'alerte.
    console.error('[stripe/webhook] candidat orphelin non noté :', e)
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    console.error('[stripe/webhook] STRIPE_WEBHOOK_SECRET manquant')
    return NextResponse.json({ error: 'non_configure' }, { status: 500 })
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) return NextResponse.json({ error: 'signature_manquante' }, { status: 400 })

  let event: Stripe.Event
  try {
    const brut = await req.text()
    event = stripe().webhooks.constructEvent(brut, signature, secret)
  } catch (e) {
    console.error('[stripe/webhook] Signature invalide:', (e as Error).message)
    return NextResponse.json({ error: 'signature_invalide' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'account.updated': {
        const compte = event.data.object as Stripe.Account
        const nowEnabled = compte.charges_enabled === true
        // État précédent, pour détecter une SUSPENSION (true → false)
        const { data: avant } = await supabaseAdmin
          .from('stripe_comptes')
          .select('pro_id, charges_enabled')
          .eq('account_id', compte.id)
          .maybeSingle()
        await supabaseAdmin
          .from('stripe_comptes')
          .update({
            charges_enabled: nowEnabled,
            details_submitted: compte.details_submitted === true,
            updated_at: new Date().toISOString(),
          })
          .eq('account_id', compte.id)
        // Suspension → prévenir la pro tout de suite. Sans ça elle découvrait
        // le blocage seulement en tentant de prélever, et l'app accusait la
        // cliente (moitié proactive de C19).
        if (avant?.charges_enabled === true && !nowEnabled && avant.pro_id) {
          await pousserNotifPro(
            avant.pro_id,
            'notif.compteBloqueTitre',
            'notif.compteBloque',
          )
        }
        break
      }

      case 'payment_intent.succeeded': {
        // Paiement par lien (page maison) réglé → on crédite + on notifie la pro.
        const intent = event.data.object as Stripe.PaymentIntent

        // ── UN PAIEMENT QUI N'A PAS DE RENDEZ-VOUS ─────────────────────────
        // Le 15 août à 23 h 57, une cliente a payé 38,84 € et sa page s'est
        // rechargée avant que la réservation soit enregistrée. L'argent est
        // arrivé, le rendez-vous n'a jamais existé, et personne ne l'a su
        // pendant douze heures.
        //
        // Cet avis-ci vient de Stripe, de serveur à serveur : il arrive même
        // quand le téléphone de la cliente a lâché. C'est le seul témoin
        // fiable, alors on l'écoute.
        //
        // ON NE SONNE PAS TOUT DE SUITE : dans une réservation normale, la
        // fiche de paiement est écrite deux ou trois secondes APRÈS cet avis.
        // On note un candidat, une vérification repasse une minute plus tard
        // et classe sans bruit s'il a trouvé son rendez-vous entre-temps.
        await noterSiSansRendezVous(intent)

        const { data: paiement } = await supabaseAdmin
          .from('paiements')
          .select('id, pro_id, rdv_id, montant, statut, historique, rdv:rendez_vous(cliente:clientes(prenom, nom))')
          .eq('stripe_payment_intent_id', intent.id)
          .eq('mode', 'lien')
          .maybeSingle()
        if (!paiement || paiement.statut !== 'en_attente') break
        const historique = Array.isArray(paiement.historique) ? paiement.historique : []
        // Bascule conditionnelle : une seule notif même si le polling app passe aussi.
        const { data: maj } = await supabaseAdmin
          .from('paiements')
          .update({
            statut: 'paye',
            historique: [...historique, { quand: new Date().toISOString(), evenement: 'paye', detail: 'lien réglé (webhook)' }],
            updated_at: new Date().toISOString(),
          })
          .eq('id', paiement.id)
          .eq('statut', 'en_attente')
          .select('id')
        if (maj && maj.length) {
          // Prestation réglée → libérer l'empreinte du même RDV (évite un
          // double encaissement de la cliente — 14 juil. 2026)
          if ((paiement as { rdv_id?: string }).rdv_id) {
            await libererEmpreintesRdv((paiement as { rdv_id: string }).rdv_id)
          }
          const cli = (paiement as { rdv?: { cliente?: { prenom?: string; nom?: string } } }).rdv?.cliente
          const nom = cli ? [cli.prenom, cli.nom].filter(Boolean).join(' ') : null
          await pousserNotifPro(
            paiement.pro_id,
            'notif.paiementRecuTitre',
            nom ? 'notif.paiementRecu' : 'notif.paiementRecuSansNom',
            { montantCentimes: paiement.montant, prenom: nom ?? '' },
          )
          // Facture rose à la cliente (edge fn qui a la clé Resend)
          fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co'}/functions/v1/envoyer-facture`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
            body: JSON.stringify({ paiement_id: paiement.id }),
          }).catch(e => console.error('[webhook] facture:', e))
        }
        break
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        const intentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
        if (intentId) {
          // charge.refunded === true seulement si TOUT est remboursé ; l'event
          // arrive aussi pour un remboursement partiel (amount_refunded = cumul)
          await supabaseAdmin
            .from('paiements')
            .update({
              statut: charge.refunded ? 'rembourse' : 'rembourse_partiel',
              montant_rembourse: charge.amount_refunded ?? 0,
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_payment_intent_id', intentId)
            .neq('statut', 'rembourse')
        }
        break
      }

      case 'charge.dispute.created': {
        const litige = event.data.object as Stripe.Dispute
        const intentId = typeof litige.payment_intent === 'string' ? litige.payment_intent : litige.payment_intent?.id
        if (intentId) {
          const { data: paiement } = await supabaseAdmin
            .from('paiements')
            .update({ statut: 'conteste', updated_at: new Date().toISOString() })
            .eq('stripe_payment_intent_id', intentId)
            .select('pro_id, montant')
            .maybeSingle()
          if (paiement) {
            await pousserNotifPro(
              paiement.pro_id,
              'notif.litigeTitre',
              'notif.litige',
              { montantCentimes: paiement.montant },
            )
          }
        }
        break
      }

      // ── LE VIREMENT VERS LE COMPTE EN BANQUE ────────────────────────────
      // Le dernier maillon de la chaîne, et le seul qu'on ne regardait pas.
      // Une pro dont le virement échoue ne l'apprend que devant son relevé —
      // et nous jamais. On enregistre les trois moments : parti, arrivé, ou
      // refusé. Un refus la prévient tout de suite, avec la raison de Stripe.
      case 'payout.created':
      case 'payout.paid':
      case 'payout.failed':
      case 'payout.canceled': {
        const virement = event.data.object as Stripe.Payout
        // Un virement de caisse arrive avec le compte connecté de la pro ;
        // sans lui, c'est notre propre compte et ça ne nous regarde pas ici.
        const compte = event.account
        if (!compte) break

        const { data: lien } = await supabaseAdmin
          .from('stripe_comptes').select('pro_id').eq('account_id', compte).maybeSingle()

        await supabaseAdmin.from('virements').upsert({
          pro_id: lien?.pro_id ?? null,
          account_id: compte,
          payout_id: virement.id,
          montant: virement.amount,
          devise: virement.currency,
          statut: virement.status,
          arrive_le: virement.arrival_date
            ? new Date(virement.arrival_date * 1000).toISOString().slice(0, 10)
            : null,
          motif_echec: virement.failure_message ?? virement.failure_code ?? null,
          maj_le: new Date().toISOString(),
        }, { onConflict: 'payout_id' })

        if (event.type === 'payout.failed' && lien?.pro_id) {
          await pousserNotifPro(
            lien.pro_id,
            'notif.virementRateTitre',
            'notif.virementRate',
          )
        }
        console.log(`[stripe/webhook] virement ${virement.status} — ${(virement.amount / 100).toFixed(2)} ${virement.currency} — ${compte}`)
        break
      }

      case 'payment_intent.payment_failed': {
        const paiement = event.data.object as Stripe.PaymentIntent
        console.warn('[stripe/webhook] Paiement échoué:', paiement.id, paiement.last_payment_error?.code)
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (e) {
    console.error('[stripe/webhook]', event.type, e)
    return NextResponse.json({ error: 'traitement_echoue' }, { status: 500 })
  }
}
