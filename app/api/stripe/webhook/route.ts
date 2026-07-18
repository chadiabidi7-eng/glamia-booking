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
            'Compte Stripe à régulariser',
            "Ton compte Stripe n'accepte plus les paiements. Régularise-le dans ta Caisse pour continuer à encaisser.",
          )
        }
        break
      }

      case 'payment_intent.succeeded': {
        // Paiement par lien (page maison) réglé → on crédite + on notifie la pro.
        const intent = event.data.object as Stripe.PaymentIntent
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
