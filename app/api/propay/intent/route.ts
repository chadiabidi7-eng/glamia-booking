import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

// ─────────────────────────────────────────────────────────────────────────────
// Glamia Pro Pay — création de l'intent à l'étape de confirmation de la résa.
//
// POST { pro_id, total }  (total = prix des prestations sélectionnées, en €)
// → { actif: false }  si la pro n'a pas d'acomptes actifs (résa classique)
// → { actif: true, mode, acompte, frais, total_cliente, client_secret,
//     stripe_account, intent_id }
//
// Montants en CENTIMES côté Stripe. Spec (13 juil. 2026) :
// - acompte = % ou fixe (config pro), plafonné à 50 % du total ET 50 €
// - mode empreinte : SetupIntent (0 € prélevé, carte enregistrée avec 3DS)
// - mode acompte : PaymentIntent — la cliente paie acompte + frais de
//   réservation (gross-up : frais Stripe + commission Glamia 1,5 %), la pro
//   touche l'acompte plein. Commission via application_fee_amount.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

const PLAFOND_POURCENT = 50
const PLAFOND_EUROS_CENTIMES = 50_00
// Commission Glamia — passer à 0 pour la retirer (décision : 1,5 %, 13 juil.)
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
// Frais Stripe standard cartes EU : 1,5 % + 0,25 €
const STRIPE_PCT = 0.015
const STRIPE_FIXE_CENTIMES = 25

type Config = { actif?: boolean; mode?: 'empreinte' | 'acompte' | 'total'; type?: 'pourcent' | 'fixe'; valeur?: number }

// Acompte plafonné, en centimes
export function calculerAcompte(totalCentimes: number, config: Config): number {
  const brut = config.type === 'fixe'
    ? Math.round((config.valeur ?? 0) * 100)
    : Math.round(totalCentimes * (config.valeur ?? 0) / 100)
  return Math.max(0, Math.min(brut, Math.round(totalCentimes * PLAFOND_POURCENT / 100), PLAFOND_EUROS_CENTIMES))
}

// Gross-up : la cliente paie total_cliente pour que la pro touche l'acompte
// plein après frais Stripe et commission. total*(1-pct) = acompte + fixe + com
export function calculerTotalCliente(acompteCentimes: number): { commission: number; totalCliente: number; frais: number } {
  const commission = Math.round(acompteCentimes * COMMISSION_GLAMIA_PCT)
  const totalCliente = Math.ceil((acompteCentimes + STRIPE_FIXE_CENTIMES + commission) / (1 - STRIPE_PCT))
  return { commission, totalCliente, frais: totalCliente - acompteCentimes }
}

export async function POST(req: NextRequest) {
  let body: { pro_id?: unknown; total?: unknown; total_plein?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const proId = body.pro_id
  const totalEuros = Number(body.total)
  if (typeof proId !== 'string' || !/^[0-9a-f-]{36}$/i.test(proId) || !isFinite(totalEuros) || totalEuros < 0) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
  }

  // Config + compte Stripe de la pro
  const [{ data: profil }, { data: compte }] = await Promise.all([
    supabaseAdmin.from('profiles').select('acompte_config, pro_pay_actif, trial_ends_at, abonnement_actif').eq('id', proId).maybeSingle(),
    supabaseAdmin.from('stripe_comptes').select('account_id, charges_enabled').eq('pro_id', proId).maybeSingle(),
  ])

  // Glamia Pay = abonnement Glamia Pro Pay OU essai gratuit en cours (l'essai
  // 14 jours donne l'expérience Pro Pay complète — décision 14 juil. 2026).
  // Une abonnée payante Pro 14,99 (abonnement_actif sans pro_pay_actif) reste
  // en résa classique : son trial_ends_at resynchronisé ne vaut pas essai.
  // (verrou serveur — l'app ne suffit pas si l'abonnement expire)
  const essaiActif = !profil?.abonnement_actif
    && !!profil?.trial_ends_at && new Date(profil.trial_ends_at) > new Date()
  const config = (profil?.acompte_config ?? {}) as Config
  if ((!profil?.pro_pay_actif && !essaiActif) || !config.actif || !compte?.charges_enabled) {
    return NextResponse.json({ actif: false })
  }

  const totalCentimes = Math.round(totalEuros * 100)
  const totalPleinCentimes = Math.round(Math.max(totalEuros, Number(body.total_plein) || 0) * 100)
  const mode: 'empreinte' | 'acompte' | 'total' =
    config.mode === 'acompte' ? 'acompte' : config.mode === 'total' ? 'total' : 'empreinte'
  // RDV OFFERT par la fidélité (prix ~0) — décision Chadi 18 juil. (Q2) :
  // - mode EMPREINTE : on pose quand même une empreinte, calculée sur le prix
  //   PLEIN (dédommagement no-show réel), pas sur le prix offert.
  // - mode ACOMPTE/TOTAL : rien (on ne pré-paie pas un RDV offert).
  const rdvOffert = totalCentimes < 100
  const baseCalcul = (mode === 'empreinte' && rdvOffert) ? totalPleinCentimes : totalCentimes
  // Paiement total : la base est le prix complet ; sinon l'acompte plafonné
  const acompte = mode === 'total' ? totalCentimes : calculerAcompte(baseCalcul, config)
  if (acompte < 100) {
    // Moins d'1 € (prestation gratuite/quasi, ou acompte sur RDV offert) : pas de carte
    return NextResponse.json({ actif: false })
  }

  const stripeAccount = compte.account_id

  // Config figée dans l'intent : la vérification anti-fraude de /lier doit
  // recalculer l'acompte attendu avec le réglage EN VIGUEUR AU PAIEMENT, pas
  // celui du moment de la liaison — sinon une pro qui change sa config entre
  // les deux fait rejeter un paiement légitime déjà encaissé (faille C9).
  const glamiaCfg = JSON.stringify({ type: config.type ?? 'pourcent', valeur: config.valeur ?? 0 })

  try {
    if (mode === 'empreinte') {
      // Carte enregistrée avec 3DS, prélèvement futur possible hors session
      const customer = await stripe.customers.create(
        { metadata: { glamia_pro_id: proId } },
        { stripeAccount },
      )
      const setup = await stripe.setupIntents.create(
        {
          customer: customer.id,
          usage: 'off_session',
          // Carte uniquement (Apple Pay/Google Pay passent par 'card' en wallet)
          // — pas de Bancontact/Klarna/iDEAL
          payment_method_types: ['card'],
          metadata: { glamia_pro_id: proId, glamia_type: 'empreinte', glamia_acompte: String(acompte), glamia_cfg: glamiaCfg },
        },
        { stripeAccount },
      )
      // frais = frais PROJETÉS du prélèvement (lapin/annulation tardive) — rien
      // n'est débité aujourd'hui, mais la cliente doit savoir que l'empreinte
      // serait prélevée majorée de ces frais (transparence, même formule que
      // stripe-acompte action prelever). total_cliente reste 0 : rien maintenant.
      const { frais: fraisPrelevement } = calculerTotalCliente(acompte)
      return NextResponse.json({
        actif: true, mode, acompte, frais: fraisPrelevement, total_cliente: 0,
        delai_annulation: (config as { delai_annulation?: number }).delai_annulation === 48 ? 48 : 24,
        client_secret: setup.client_secret, stripe_account: stripeAccount, intent_id: setup.id,
      })
    }

    // Acompte réel OU prestation complète : payé maintenant + frais de résa
    const { commission, totalCliente, frais } = calculerTotalCliente(acompte)
    const customer = await stripe.customers.create(
      { metadata: { glamia_pro_id: proId } },
      { stripeAccount },
    )
    const paiement = await stripe.paymentIntents.create(
      {
        amount: totalCliente,
        currency: 'eur',
        customer: customer.id,
        setup_future_usage: 'off_session',
        // Carte uniquement (Apple Pay/Google Pay inclus via wallet 'card')
        payment_method_types: ['card'],
        application_fee_amount: commission,
        metadata: { glamia_pro_id: proId, glamia_type: mode, glamia_acompte: String(acompte), glamia_frais: String(frais), glamia_cfg: glamiaCfg },
      },
      { stripeAccount },
    )
    return NextResponse.json({
      actif: true, mode, acompte, frais, total_cliente: totalCliente,
      // Le délai choisi par la pro — la cliente doit le lire AVANT de réserver.
      delai_annulation: (config as { delai_annulation?: number }).delai_annulation === 48 ? 48 : 24,
      client_secret: paiement.client_secret, stripe_account: stripeAccount, intent_id: paiement.id,
    })
  } catch (e) {
    console.error('[api/propay/intent]', e)
    return NextResponse.json({ error: 'stripe_error' }, { status: 500 })
  }
}
