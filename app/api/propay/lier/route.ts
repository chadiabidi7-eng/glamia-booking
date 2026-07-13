import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

// ─────────────────────────────────────────────────────────────────────────────
// Glamia Pro Pay — lie un intent Stripe confirmé au RDV créé.
//
// POST { pro_id, rdv_id, intent_id }
// Vérifie CÔTÉ SERVEUR (Stripe = source de vérité) que l'intent a réussi,
// puis journalise la ligne `paiements` (empreinte_posee | acompte_paye).
// Appelée par le booking juste après la création du RDV.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
  let body: { pro_id?: unknown; rdv_id?: unknown; intent_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const proId = body.pro_id
  const rdvId = body.rdv_id
  const intentId = body.intent_id
  const uuid = /^[0-9a-f-]{36}$/i
  if (typeof proId !== 'string' || !uuid.test(proId) || typeof rdvId !== 'string' || !uuid.test(rdvId)
    || typeof intentId !== 'string' || !/^(seti|pi)_[A-Za-z0-9]+$/.test(intentId)) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
  }

  // Le RDV doit exister et appartenir à cette pro
  const { data: rdv } = await supabaseAdmin
    .from('rendez_vous')
    .select('id, pro_id')
    .eq('id', rdvId)
    .maybeSingle()
  if (!rdv || rdv.pro_id !== proId) {
    return NextResponse.json({ error: 'rdv_introuvable' }, { status: 404 })
  }

  const { data: compte } = await supabaseAdmin
    .from('stripe_comptes')
    .select('account_id')
    .eq('pro_id', proId)
    .maybeSingle()
  if (!compte) return NextResponse.json({ error: 'compte_introuvable' }, { status: 404 })
  const stripeAccount = compte.account_id

  try {
    if (intentId.startsWith('seti_')) {
      // ── Empreinte : SetupIntent réussi ──
      const setup = await stripe.setupIntents.retrieve(intentId, {}, { stripeAccount })
      if (setup.status !== 'succeeded' || setup.metadata?.glamia_pro_id !== proId) {
        return NextResponse.json({ error: 'intent_non_confirme' }, { status: 409 })
      }
      const { error } = await supabaseAdmin.from('paiements').insert({
        rdv_id: rdvId,
        pro_id: proId,
        type: 'acompte',
        mode: 'empreinte',
        statut: 'empreinte_posee',
        montant: parseInt(String(setup.metadata?.glamia_acompte ?? '0'), 10),
        frais_reservation: 0,
        commission_glamia: 0,
        stripe_customer_id: typeof setup.customer === 'string' ? setup.customer : setup.customer?.id ?? null,
        stripe_payment_method_id: typeof setup.payment_method === 'string' ? setup.payment_method : setup.payment_method?.id ?? null,
        stripe_setup_intent_id: setup.id,
        historique: [{ quand: new Date().toISOString(), evenement: 'empreinte_posee', detail: 'consentement à la résa' }],
      })
      if (error) throw error
      return NextResponse.json({ success: true, statut: 'empreinte_posee' })
    }

    // ── Acompte réel : PaymentIntent réussi ──
    const paiement = await stripe.paymentIntents.retrieve(intentId, {}, { stripeAccount })
    if (paiement.status !== 'succeeded' || paiement.metadata?.glamia_pro_id !== proId) {
      return NextResponse.json({ error: 'intent_non_confirme' }, { status: 409 })
    }
    const estTotal = paiement.metadata?.glamia_type === 'total'
    const { error } = await supabaseAdmin.from('paiements').insert({
      rdv_id: rdvId,
      pro_id: proId,
      type: estTotal ? 'total' : 'acompte',
      mode: estTotal ? 'total' : 'acompte',
      statut: estTotal ? 'paye' : 'acompte_paye',
      montant: parseInt(String(paiement.metadata?.glamia_acompte ?? '0'), 10),
      frais_reservation: parseInt(String(paiement.metadata?.glamia_frais ?? '0'), 10),
      commission_glamia: paiement.application_fee_amount ?? 0,
      stripe_customer_id: typeof paiement.customer === 'string' ? paiement.customer : paiement.customer?.id ?? null,
      stripe_payment_method_id: typeof paiement.payment_method === 'string' ? paiement.payment_method : paiement.payment_method?.id ?? null,
      stripe_payment_intent_id: paiement.id,
      historique: [{ quand: new Date().toISOString(), evenement: 'acompte_paye', detail: `total cliente ${paiement.amount} c` }],
    })
    if (error) throw error
    return NextResponse.json({ success: true, statut: 'acompte_paye' })
  } catch (e) {
    console.error('[api/propay/lier]', e)
    return NextResponse.json({ error: 'stripe_error' }, { status: 500 })
  }
}
