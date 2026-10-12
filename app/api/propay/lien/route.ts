import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe-serveur'
import { libererEmpreintesRdv } from '../../stripe/webhook/route'
import { traduireDans } from '@/lib/i18n'
import { symboleDevise } from '@/lib/devise'
import { calculerTotalCliente } from '../intent/route'
import { estLienAcompte, finaliserLienAcompte } from '@/lib/lien-acompte'

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
  mode: string | null
  montant: number
  frais_reservation: number | null
  statut: string
  stripe_payment_intent_id: string | null
  stripe_setup_intent_id: string | null
  rdv: { technique: string | null; cliente: { prenom: string | null; nom: string | null; email: string | null } | null } | null
}

async function chargerContexte(token: string) {
  const { data: paiement } = await supabaseAdmin
    .from('paiements')
    .select('id, pro_id, rdv_id, type, mode, montant, frais_reservation, statut, stripe_payment_intent_id, stripe_setup_intent_id, rdv:rendez_vous(technique, cliente:clientes(prenom, nom, email))')
    .eq('id', token)
    .maybeSingle()
  if (!paiement) return null
  const p = paiement as unknown as Paiement

  const { data: compte } = await supabaseAdmin
    .from('stripe_comptes')
    .select('account_id, pays')
    .eq('pro_id', p.pro_id)
    .maybeSingle()
  if (!compte?.account_id) return null

  // LA PAGE DE PAIEMENT PARLE LA LANGUE DE LA PRO, ET COMPTE DANS SA MONNAIE.
  // Elle s'ouvre sur un lien nu, sans slug : sans ces deux valeurs, elle
  // repartait en français et en euros chez une pro britannique.
  const { data: pro } = await supabaseAdmin
    .from('profiles')
    .select('langue, devise')
    .eq('id', p.pro_id)
    .maybeSingle()

  return {
    p,
    account: compte.account_id,
    pays: (compte as { pays?: string | null }).pays ?? null,
    langue: (pro as { langue?: string | null } | null)?.langue ?? null,
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

/** Prévenir la pro, dans SA langue : on lui passe des clés, pas des phrases. */
async function notifierPro(
  proId: string,
  cleTitre: string,
  cleCorps: string,
  valeurs?: Record<string, unknown>,
) {
  const { data: pro } = await supabaseAdmin
    .from('profiles').select('push_token, langue, devise').eq('id', proId).maybeSingle()
  if (!pro?.push_token) return
  const langue = (pro as { langue?: string }).langue
  // La somme repart dans la monnaie de la pro : la phrase ne porte plus d'euro.
  const valeursAvecDevise = valeurs?.montantCentimes !== undefined
    ? { ...valeurs, montant: `${(Number(valeurs.montantCentimes) / 100).toFixed(2)} ${symboleDevise((pro as { devise?: string }).devise)}` }
    : valeurs
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: pro.push_token,
        title: traduireDans(langue, cleTitre),
        body: traduireDans(langue, cleCorps, valeursAvecDevise),
        sound: 'default',
        priority: 'high',
      }),
    })
  } catch (e) {
    console.error('[api/propay/lien] notif:', e)
  }
}

// Acompte ou empreinte demandés par la pro : voir lib/lien-acompte.ts.
/** Déjà réglé : la page dit « acompte réglé » ou « carte enregistrée ». */
const REGLES: Record<string, string> = { acompte_paye: 'acompte', empreinte_posee: 'empreinte' }

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? ''
  if (!UUID.test(token)) return NextResponse.json({ error: 'token_invalide' }, { status: 400 })

  try {
    const ctx = await chargerContexte(token)
    if (!ctx) return NextResponse.json({ error: 'introuvable' }, { status: 404 })
    const { p, account, langue, devise, pays } = ctx

    // ── Acompte ou empreinte demandés par la pro ──
    if (REGLES[p.statut]) return NextResponse.json({ statut: 'regle', type: REGLES[p.statut], langue, devise })
    if (estLienAcompte(p.mode) && p.statut === 'en_attente') {
      // Réglé entre-temps, ou mort (heure du rendez-vous passée) ?
      const statut = await finaliserLienAcompte(p.id)
      if (statut && REGLES[statut]) return NextResponse.json({ statut: 'regle', type: REGLES[statut], langue, devise })
      if (statut !== 'en_attente') return NextResponse.json({ statut: 'expire', langue, devise })
      const empreinte = p.mode === 'lien_empreinte'
      const intent = empreinte
        ? await stripe().setupIntents.retrieve(p.stripe_setup_intent_id ?? '', {}, { stripeAccount: account })
        : await stripe().paymentIntents.retrieve(p.stripe_payment_intent_id ?? '', {}, { stripeAccount: account })
      return NextResponse.json({
        statut: 'a_payer',
        mode: empreinte ? 'empreinte' : 'acompte',
        langue,
        devise,
        stripe_account: account,
        client_secret: intent.client_secret,
        type: 'acompte',
        prestation: p.rdv?.technique ?? null,
        cliente_prenom: p.rdv?.cliente?.prenom ?? null,
        cliente_nom: [p.rdv?.cliente?.prenom, p.rdv?.cliente?.nom].filter(Boolean).join(' ') || null,
        cliente_email: p.rdv?.cliente?.email ?? null,
        restant: p.montant,
        frais: empreinte ? 0 : (p.frais_reservation ?? 0),
        total: empreinte ? 0 : p.montant + (p.frais_reservation ?? 0),
        // Ce qui pourrait être prélevé en cas d'absence : empreinte + frais.
        prelevable: empreinte ? calculerTotalCliente(p.montant, pays).totalCliente : undefined,
      })
    }

    if (p.statut === 'paye') return NextResponse.json({ statut: 'paye', langue, devise })
    if (p.statut !== 'en_attente' || !p.stripe_payment_intent_id) {
      return NextResponse.json({ statut: p.statut, langue, devise })
    }

    const intent = await stripe().paymentIntents.retrieve(p.stripe_payment_intent_id, {}, { stripeAccount: account })
    if (intent.status === 'succeeded') return NextResponse.json({ statut: 'paye', langue, devise })

    const restant = p.montant
    const frais = p.frais_reservation ?? 0
    return NextResponse.json({
      statut: 'a_payer',
      langue,
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
    if (REGLES[p.statut]) return NextResponse.json({ statut: 'regle' })
    if (estLienAcompte(p.mode)) {
      const statut = await finaliserLienAcompte(p.id)
      return NextResponse.json({ statut: statut && REGLES[statut] ? 'regle' : (statut ?? 'en_attente') })
    }
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
        'notif.paiementRecuTitre',
        prenom ? 'notif.paiementRecu' : 'notif.paiementRecuSansNom',
        { montantCentimes: p.montant, prenom: prenom ?? '' },
      )
      await envoyerFacture(p.id)
    }
    return NextResponse.json({ statut: 'paye' })
  } catch (e) {
    console.error('[api/propay/lien] POST', e)
    return NextResponse.json({ error: 'erreur' }, { status: 500 })
  }
}
