import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe-serveur'
import { calculerAcompte } from '../intent/route'

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
    .select('id, pro_id, prix, statut, praticienne_id')
    .eq('id', rdvId)
    .maybeSingle()
  if (!rdv || rdv.pro_id !== proId) {
    return NextResponse.json({ error: 'rdv_introuvable' }, { status: 404 })
  }
  if (rdv.statut === 'annule') {
    return NextResponse.json({ error: 'rdv_annule' }, { status: 409 })
  }

  // ── Anti-fraude montant (audit 14 juil.) : l'intent a été créé sur un
  // `total` déclaré par le NAVIGATEUR. On recalcule ici le montant attendu
  // depuis le prix réel du RDV et la config de la pro : un intent « payé
  // 1 centime » pour une prestation à 200 € est refusé.
  const { data: profilPro } = await supabaseAdmin
    .from('profiles')
    .select('acompte_config')
    .eq('id', proId)
    .maybeSingle()
  const configPro = (profilPro?.acompte_config ?? {}) as Parameters<typeof calculerAcompte>[1]
  const prixCentimes = Math.round(Number(rdv.prix ?? 0) * 100)
  // Config FIGÉE dans l'intent au moment du paiement (glamia_cfg) : on valide
  // contre elle, pas contre la config courante — sinon un changement de réglage
  // de la pro entre le paiement et la liaison fait rejeter un paiement légitime
  // déjà encaissé (faille C9). Repli sur la config courante si absente (intents
  // antérieurs à ce champ).
  const configDepuisMeta = (meta: Stripe.Metadata | null | undefined): Parameters<typeof calculerAcompte>[1] => {
    const raw = meta?.glamia_cfg
    if (raw) { try { return JSON.parse(raw) } catch { /* config courante */ } }
    return configPro
  }
  const montantAttendu = (type: string, cfg: Parameters<typeof calculerAcompte>[1]) =>
    type === 'total' ? prixCentimes : calculerAcompte(prixCentimes, cfg)
  const verifierMontant = (declare: number, type: string, cfg: Parameters<typeof calculerAcompte>[1]) => {
    // tolérance 2 c (arrondis) ; un montant SUPÉRIEUR à l'attendu n'est pas
    // une fraude contre la pro
    return declare >= montantAttendu(type, cfg) - 2
  }

  const { data: compte } = await supabaseAdmin
    .from('stripe_comptes')
    .select('account_id, devise')
    .eq('pro_id', proId)
    .maybeSingle()
  if (!compte) return NextResponse.json({ error: 'compte_introuvable' }, { status: 404 })
  const stripeAccount = compte.account_id
  // Caisse ouverte avant le 5 août : la colonne est vide, et c'était forcément
  // l'euro à l'époque.
  const devisePro = ((compte.devise as string | null) ?? 'eur').toLowerCase()

  try {
    if (intentId.startsWith('seti_')) {
      // ── Empreinte : SetupIntent réussi ──
      const setup = await stripe().setupIntents.retrieve(intentId, {}, { stripeAccount })
      if (setup.status !== 'succeeded' || setup.metadata?.glamia_pro_id !== proId) {
        return NextResponse.json({ error: 'intent_non_confirme' }, { status: 409 })
      }
      const acompteEmpreinte = parseInt(String(setup.metadata?.glamia_acompte ?? '0'), 10)
      const cfgEmpreinte = configDepuisMeta(setup.metadata)
      if (!verifierMontant(acompteEmpreinte, 'acompte', cfgEmpreinte)) {
        console.warn('[api/propay/lier] montant empreinte incohérent', { rdvId, acompteEmpreinte, attendu: montantAttendu('acompte', cfgEmpreinte) })
        return NextResponse.json({ error: 'montant_incoherent' }, { status: 409 })
      }
      const { error } = await supabaseAdmin.from('paiements').insert({
        rdv_id: rdvId,
        pro_id: proId,
        // ÉQUIPE : qui a fait la prestation — le reçu le dira.
        praticienne_id: (rdv.praticienne_id as string | null) ?? null,
        type: 'acompte',
        mode: 'empreinte',
        statut: 'empreinte_posee',
        montant: parseInt(String(setup.metadata?.glamia_acompte ?? '0'), 10),
        frais_reservation: 0,
        commission_glamia: 0,
        stripe_customer_id: typeof setup.customer === 'string' ? setup.customer : setup.customer?.id ?? null,
        stripe_payment_method_id: typeof setup.payment_method === 'string' ? setup.payment_method : setup.payment_method?.id ?? null,
        stripe_setup_intent_id: setup.id,
        // ── LA MONNAIE VIENT DE LA CAISSE ──────────────────────────────────
        // La colonne valait « euro » par défaut et personne ne l'a jamais
        // remplie : une pro suisse enregistrait ses francs comme des euros. Le
        // mail d'annulation lisait cette colonne et annonçait « 20 € versés »
        // pour 20 CHF. Constaté le 7 août.
        devise: devisePro,
        historique: [{ quand: new Date().toISOString(), evenement: 'empreinte_posee', detail: 'consentement à la résa' }],
      })
      if (error) {
        // 23505 = index unique stripe_setup_intent_id : intent déjà consommé
        // pour un autre RDV (audit 14 juil. — anti-réutilisation)
        if ((error as { code?: string }).code === '23505') {
          return NextResponse.json({ error: 'intent_deja_utilise' }, { status: 409 })
        }
        throw error
      }
      return NextResponse.json({ success: true, statut: 'empreinte_posee' })
    }

    // ── Acompte réel : PaymentIntent réussi ──
    const paiement = await stripe().paymentIntents.retrieve(intentId, {}, { stripeAccount })
    if (paiement.status !== 'succeeded' || paiement.metadata?.glamia_pro_id !== proId) {
      return NextResponse.json({ error: 'intent_non_confirme' }, { status: 409 })
    }
    const estTotal = paiement.metadata?.glamia_type === 'total'
    const montantDeclare = parseInt(String(paiement.metadata?.glamia_acompte ?? '0'), 10)
    const cfgPaiement = configDepuisMeta(paiement.metadata)
    if (!verifierMontant(montantDeclare, estTotal ? 'total' : 'acompte', cfgPaiement)) {
      console.warn('[api/propay/lier] montant incohérent', { rdvId, montantDeclare, attendu: montantAttendu(estTotal ? 'total' : 'acompte', cfgPaiement) })
      // Paiement capturé mais non rattachable → on le rembourse : ne jamais
      // garder d'argent sans ligne de suivi (C7/C8).
      try {
        await stripe().refunds.create(
          { payment_intent: paiement.id },
          { stripeAccount, idempotencyKey: `lier_remb_${paiement.id}` },
        )
      } catch (e) { console.error('[api/propay/lier] remboursement montant incohérent:', e) }
      return NextResponse.json({ error: 'montant_incoherent', rembourse: true }, { status: 409 })
    }
    const { data: ligne, error } = await supabaseAdmin.from('paiements').insert({
      rdv_id: rdvId,
      pro_id: proId,
      // ÉQUIPE : qui a fait la prestation — le reçu le dira.
      praticienne_id: (rdv.praticienne_id as string | null) ?? null,
      type: estTotal ? 'total' : 'acompte',
      mode: estTotal ? 'total' : 'acompte',
      statut: estTotal ? 'paye' : 'acompte_paye',
      montant: parseInt(String(paiement.metadata?.glamia_acompte ?? '0'), 10),
      frais_reservation: parseInt(String(paiement.metadata?.glamia_frais ?? '0'), 10),
      commission_glamia: paiement.application_fee_amount ?? 0,
      stripe_customer_id: typeof paiement.customer === 'string' ? paiement.customer : paiement.customer?.id ?? null,
      stripe_payment_method_id: typeof paiement.payment_method === 'string' ? paiement.payment_method : paiement.payment_method?.id ?? null,
      stripe_payment_intent_id: paiement.id,
      // La monnaie réellement encaissée, annoncée par Stripe lui-même.
      devise: (paiement.currency ?? devisePro).toLowerCase(),
      historique: [{ quand: new Date().toISOString(), evenement: 'acompte_paye', detail: `total cliente ${paiement.amount} c` }],
    }).select('id').single()
    if (error) {
      // 23505 = index unique stripe_payment_intent_id : intent déjà consommé
      // pour un autre RDV (audit 14 juil. — anti-réutilisation)
      if ((error as { code?: string }).code === '23505') {
        return NextResponse.json({ error: 'intent_deja_utilise' }, { status: 409 })
      }
      throw error
    }

    // Facture rose à la cliente (acompte ou prestation réglée à la résa)
    if (ligne?.id) {
      fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co'}/functions/v1/envoyer-facture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ paiement_id: ligne.id }),
      }).catch(e => console.error('[api/propay/lier] facture:', e))
    }
    return NextResponse.json({ success: true, statut: 'acompte_paye' })
  } catch (e) {
    console.error('[api/propay/lier]', e)
    return NextResponse.json({ error: 'stripe_error' }, { status: 500 })
  }
}
