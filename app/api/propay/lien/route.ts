import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe-serveur'
import { symboleDevise } from '@/lib/devise'
import { libererEmpreintesRdv } from '../../stripe/webhook/route'

// ─────────────────────────────────────────────────────────────────────────────
// Glamia Pay — page de paiement maison (lien d'encaissement de la fiche RDV).
//
// GET  ?token=<paiement_id>  → détails à afficher + client_secret du PaymentIntent
// POST { token }             → après confirmation carte : vérifie le PI côté
//                              serveur, marque 'paye' et notifie la pro.
//
// Le token = l'id de la ligne `paiements` (uuid). Le client_secret ne permet
// que de régler CE paiement précis — sûr à exposer au porteur du lien.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)


const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Paiement = {
  id: string
  pro_id: string
  rdv_id: string | null
  type: string
  montant: number
  frais_reservation: number | null
  statut: string
  stripe_payment_intent_id: string | null
  rdv: { technique: string | null; cliente: { prenom: string | null; nom: string | null; email: string | null } | null } | null
}

async function chargerContexte(token: string) {
  const { data: paiement } = await supabaseAdmin
    .from('paiements')
    .select('id, pro_id, rdv_id, type, montant, frais_reservation, statut, stripe_payment_intent_id, rdv:rendez_vous(technique, cliente:clientes(prenom, nom, email))')
    .eq('id', token)
    .maybeSingle()
  if (!paiement) return null
  const p = paiement as unknown as Paiement

  const { data: compte } = await supabaseAdmin
    .from('stripe_comptes')
    .select('account_id')
    .eq('pro_id', p.pro_id)
    .maybeSingle()
  if (!compte?.account_id) return null

  // LA PAGE COMPTE DANS LA MONNAIE DE LA PRO. Elle s'ouvre sur un lien nu, sans
  // nom de pro dedans : faute de la lire ici, elle écrivait « € » quoi qu'il
  // arrive. Une cliente suisse lisait « 37,60 € » pour 37,60 francs — le même
  // défaut que la page de réservation, corrigé là-bas le 5 août.
  const { data: pro } = await supabaseAdmin
    .from('profiles')
    .select('devise')
    .eq('id', p.pro_id)
    .maybeSingle()

  return {
    p,
    account: compte.account_id,
    devise: (pro as { devise?: string | null } | null)?.devise ?? 'EUR',
  }
}

// Envoi de la facture rose à la cliente via l'edge function (qui a la clé Resend)
async function envoyerFacture(paiementId: string) {
  try {
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co'}/functions/v1/envoyer-facture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ paiement_id: paiementId }),
    })
  } catch (e) {
    console.error('[api/propay/lien] facture:', e)
  }
}

async function notifierPro(proId: string, title: string, body: string) {
  const { data: pro } = await supabaseAdmin.from('profiles').select('push_token').eq('id', proId).maybeSingle()
  if (!pro?.push_token) return
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: pro.push_token, title, body, sound: 'default', priority: 'high' }),
    })
  } catch (e) {
    console.error('[api/propay/lien] notif:', e)
  }
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? ''
  if (!UUID.test(token)) return NextResponse.json({ error: 'token_invalide' }, { status: 400 })

  try {
    const ctx = await chargerContexte(token)
    if (!ctx) return NextResponse.json({ error: 'introuvable' }, { status: 404 })
    const { p, account, devise } = ctx

    if (p.statut === 'paye') return NextResponse.json({ statut: 'paye', devise })
    if (p.statut !== 'en_attente' || !p.stripe_payment_intent_id) {
      return NextResponse.json({ statut: p.statut, devise })
    }

    const intent = await stripe().paymentIntents.retrieve(p.stripe_payment_intent_id, {}, { stripeAccount: account })
    if (intent.status === 'succeeded') return NextResponse.json({ statut: 'paye', devise })

    const restant = p.montant
    const frais = p.frais_reservation ?? 0
    return NextResponse.json({
      statut: 'a_payer',
      devise,
      stripe_account: account,
      client_secret: intent.client_secret,
      type: p.type,
      prestation: p.rdv?.technique ?? null,
      cliente_prenom: p.rdv?.cliente?.prenom ?? null,
      cliente_nom: [p.rdv?.cliente?.prenom, p.rdv?.cliente?.nom].filter(Boolean).join(' ') || null,
      cliente_email: p.rdv?.cliente?.email ?? null,
      restant,
      frais,
      total: restant + frais,
    })
  } catch (e) {
    console.error('[api/propay/lien] GET', e)
    return NextResponse.json({ error: 'erreur' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  let token = ''
  try {
    token = (await req.json())?.token ?? ''
  } catch { /* body vide */ }
  if (!UUID.test(token)) return NextResponse.json({ error: 'token_invalide' }, { status: 400 })

  try {
    const ctx = await chargerContexte(token)
    if (!ctx) return NextResponse.json({ error: 'introuvable' }, { status: 404 })
    const { p, account, devise } = ctx
    if (p.statut === 'paye') return NextResponse.json({ statut: 'paye' })
    if (!p.stripe_payment_intent_id) return NextResponse.json({ statut: p.statut })

    const intent = await stripe().paymentIntents.retrieve(p.stripe_payment_intent_id, {}, { stripeAccount: account })
    if (intent.status !== 'succeeded') return NextResponse.json({ statut: 'en_attente' })

    // Bascule conditionnelle → une seule notif (idempotent avec verifier_pro / webhook)
    const { data: maj } = await supabaseAdmin
      .from('paiements')
      .update({
        statut: 'paye',
        historique: [{ quand: new Date().toISOString(), evenement: 'paye', detail: 'page maison réglée' }],
        updated_at: new Date().toISOString(),
      })
      .eq('id', p.id)
      .eq('statut', 'en_attente')
      .select('id')

    if (maj && maj.length) {
      // Prestation réglée → libérer l'empreinte du même RDV (évite un double
      // encaissement de la cliente — 14 juil. 2026)
      if (p.rdv_id) await libererEmpreintesRdv(p.rdv_id)
      const prenom = p.rdv?.cliente?.prenom ?? null
      await notifierPro(
        p.pro_id,
        'Paiement reçu 💸',
        `${(p.montant / 100).toFixed(2).replace('.', ',')} ${symboleDevise(devise)}${prenom ? ` de ${prenom}` : ''} — ta caisse est créditée`,
      )
      await envoyerFacture(p.id)
    }
    return NextResponse.json({ statut: 'paye' })
  } catch (e) {
    console.error('[api/propay/lien] POST', e)
    return NextResponse.json({ error: 'erreur' }, { status: 500 })
  }
}
