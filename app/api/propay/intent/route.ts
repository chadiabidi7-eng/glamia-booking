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
// - acompte = % ou fixe (config pro), plafonné à 40 % du total ET 50 €
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

const PLAFOND_POURCENT = 40
const PLAFOND_EUROS_CENTIMES = 50_00
// Commission Glamia — passer à 0 pour la retirer (décision : 1,5 %, 13 juil.)
const COMMISSION_GLAMIA_PCT = 0.015
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
  let body: { pro_id?: unknown; total?: unknown }
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
    supabaseAdmin.from('profiles').select('acompte_config').eq('id', proId).maybeSingle(),
    supabaseAdmin.from('stripe_comptes').select('account_id, charges_enabled').eq('pro_id', proId).maybeSingle(),
  ])

  const config = (profil?.acompte_config ?? {}) as Config
  if (!config.actif || !compte?.charges_enabled) {
    return NextResponse.json({ actif: false })
  }

  const totalCentimes = Math.round(totalEuros * 100)
  const mode: 'empreinte' | 'acompte' | 'total' =
    config.mode === 'acompte' ? 'acompte' : config.mode === 'total' ? 'total' : 'empreinte'
  // Paiement total : la base est le prix complet ; sinon l'acompte plafonné
  const acompte = mode === 'total' ? totalCentimes : calculerAcompte(totalCentimes, config)
  if (acompte < 100) {
    // Moins d'1 € (prestation gratuite/quasi) : pas de carte exigée
    return NextResponse.json({ actif: false })
  }

  const stripeAccount = compte.account_id

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
          metadata: { glamia_pro_id: proId, glamia_type: 'empreinte', glamia_acompte: String(acompte) },
        },
        { stripeAccount },
      )
      return NextResponse.json({
        actif: true, mode, acompte, frais: 0, total_cliente: 0,
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
        metadata: { glamia_pro_id: proId, glamia_type: mode, glamia_acompte: String(acompte), glamia_frais: String(frais) },
      },
      { stripeAccount },
    )
    return NextResponse.json({
      actif: true, mode, acompte, frais, total_cliente: totalCliente,
      client_secret: paiement.client_secret, stripe_account: stripeAccount, intent_id: paiement.id,
    })
  } catch (e) {
    console.error('[api/propay/intent]', e)
    return NextResponse.json({ error: 'stripe_error' }, { status: 500 })
  }
}
