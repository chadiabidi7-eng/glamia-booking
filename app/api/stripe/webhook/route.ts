import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

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

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

async function pousserNotifPro(proId: string, title: string, body: string) {
  const { data: pro } = await supabaseAdmin.from('profiles').select('push_token').eq('id', proId).maybeSingle()
  if (!pro?.push_token) return
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: pro.push_token, title, body }),
  })
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
    event = stripe.webhooks.constructEvent(brut, signature, secret)
  } catch (e) {
    console.error('[stripe/webhook] Signature invalide:', (e as Error).message)
    return NextResponse.json({ error: 'signature_invalide' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'account.updated': {
        const compte = event.data.object as Stripe.Account
        await supabaseAdmin
          .from('stripe_comptes')
          .update({
            charges_enabled: compte.charges_enabled === true,
            details_submitted: compte.details_submitted === true,
            updated_at: new Date().toISOString(),
          })
          .eq('account_id', compte.id)
        break
      }

      case 'payment_intent.succeeded': {
        // Paiement par lien (page maison) réglé → on crédite + on notifie la pro.
        const intent = event.data.object as Stripe.PaymentIntent
        const { data: paiement } = await supabaseAdmin
          .from('paiements')
          .select('id, pro_id, montant, statut, historique, rdv:rendez_vous(cliente:clientes(prenom, nom))')
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
          const cli = (paiement as { rdv?: { cliente?: { prenom?: string; nom?: string } } }).rdv?.cliente
          const nom = cli ? [cli.prenom, cli.nom].filter(Boolean).join(' ') : null
          await pousserNotifPro(
            paiement.pro_id,
            'Paiement reçu 💸',
            `${(paiement.montant / 100).toFixed(2).replace('.', ',')} €${nom ? ` de ${nom}` : ''} — ta caisse est créditée`,
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
          await supabaseAdmin
            .from('paiements')
            .update({ statut: 'rembourse', updated_at: new Date().toISOString() })
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
              'Acompte contesté ⚠️',
              `Une cliente conteste un prélèvement de ${(paiement.montant / 100).toFixed(2).replace('.', ',')} €. Consulte ton espace Stripe pour répondre au litige.`,
            )
          }
        }
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
