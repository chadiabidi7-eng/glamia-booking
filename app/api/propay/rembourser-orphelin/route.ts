import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe-serveur'
import { journaliserOrphelin } from '@/lib/orphelins'
import { normaliserTelephone } from '@/lib/telephone'

// ─────────────────────────────────────────────────────────────────────────────
// Glamia Pro Pay — rembourse un paiement ORPHELIN (audit C11).
//
// POST { pro_id, intent_id }
// Cas d'usage : deux onglets réservent le même créneau. Le 2e onglet confirme
// son paiement PUIS échoue à créer le RDV (verrou anti-doublon rdv_booking_
// creneau_unique → 23505). Comme la ligne `paiements` n'est écrite que par
// `lier` (jamais appelé si l'insert RDV échoue), ce paiement est capturé SANS
// aucune trace en base — invisible pour la réconciliation. On le rembourse ici.
//
// Sécurité : on vérifie que l'intent porte bien le metadata glamia_pro_id de la
// pro (comme `lier`) avant de rembourser — un appelant ne peut pas rembourser un
// intent arbitraire. Remboursement idempotent (idempotencyKey) → un retour /
// double appel ne rembourse jamais deux fois.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)


export async function POST(req: NextRequest) {
  let body: { pro_id?: unknown; intent_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const proId = body.pro_id
  const intentId = body.intent_id
  const uuid = /^[0-9a-f-]{36}$/i
  if (typeof proId !== 'string' || !uuid.test(proId)
    || typeof intentId !== 'string' || !/^(seti|pi)_[A-Za-z0-9]+$/.test(intentId)) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
  }

  const { data: compte } = await supabaseAdmin
    .from('stripe_comptes')
    .select('account_id')
    .eq('pro_id', proId)
    .maybeSingle()
  if (!compte) return NextResponse.json({ error: 'compte_introuvable' }, { status: 404 })
  const stripeAccount = compte.account_id

  try {
    // Empreinte (SetupIntent) : aucune somme capturée → rien à rembourser.
    // Le consentement carte reste enregistré mais inoffensif (pas de RDV, pas
    // de prélèvement possible).
    if (intentId.startsWith('seti_')) {
      const setup = await stripe().setupIntents.retrieve(intentId, {}, { stripeAccount })
      if (setup.metadata?.glamia_pro_id !== proId) {
        return NextResponse.json({ error: 'non_autorise' }, { status: 403 })
      }
      return NextResponse.json({ success: true, rembourse: false })
    }

    // Acompte / total (PaymentIntent) : rembourser si capturé.
    const paiement = await stripe().paymentIntents.retrieve(intentId, {}, { stripeAccount })
    if (paiement.metadata?.glamia_pro_id !== proId) {
      return NextResponse.json({ error: 'non_autorise' }, { status: 403 })
    }
    if (paiement.status !== 'succeeded') {
      // Rien n'a été capturé (paiement non abouti) → rien à rembourser.
      return NextResponse.json({ success: true, rembourse: false })
    }

    // ── LE SERVEUR A PEUT-ÊTRE DÉJÀ POSÉ SON RENDEZ-VOUS (23 oct. 2026) ──────
    // Quand la page se réveille tard (validation dans l'app de la banque), le
    // serveur a pu créer le rendez-vous à sa place. Son « créneau pris » est
    // alors SON créneau : rembourser laisserait un rendez-vous sans paiement et
    // lui dirait qu'il n'existe pas. On ne rend l'argent que si rien n'est posé.
    const { data: rattache } = await supabaseAdmin.from('paiements')
      .select('rdv_id').eq('stripe_payment_intent_id', paiement.id).limit(1)
    if ((rattache ?? []).length) {
      return NextResponse.json({ success: true, rembourse: false, deja_pose: true, rdv_id: rattache![0].rdv_id })
    }
    let resa: { d?: string; h?: string; te?: string } = {}
    try { resa = JSON.parse(paiement.metadata?.glamia_resa ?? '{}') } catch { /* rien */ }
    if (resa.d && resa.h && resa.te) {
      const { data: memeCreneau } = await supabaseAdmin.from('rendez_vous')
        .select('id, clientes(telephone)')
        .eq('pro_id', proId).neq('statut', 'annule')
        .eq('date', `${resa.d}T${resa.h}:00+00:00`)
        .gte('created_at', new Date((paiement.created - 60) * 1000).toISOString())
        .limit(5)
      const cible = normaliserTelephone(resa.te)
      const sien = (memeCreneau ?? []).find(r => {
        const c = r.clientes as { telephone?: string } | { telephone?: string }[] | null
        const tel = Array.isArray(c) ? c[0]?.telephone : c?.telephone
        return !!cible && normaliserTelephone(tel ?? '') === cible
      })
      if (sien) return NextResponse.json({ success: true, rembourse: false, deja_pose: true, rdv_id: sien.id })
    }
    // La cliente récupère tout, frais de service Glamia compris — et la pro ne
    // paie pas ce geste de sa poche : Glamia rend sa part en même temps.
    // (Décision de Chadi, 7 septembre 2026, sur le cas Sun.naaiils.)
    await stripe().refunds.create(
      { payment_intent: paiement.id, refund_application_fee: true },
      { stripeAccount, idempotencyKey: `orphelin_remb_${paiement.id}` },
    )
    // Journal + notif admin (une seule fois, idempotent). Cause 'doublon' : la
    // cliente a bien sa 1re réservation, c'est le 2e paiement en trop qu'on rend.
    await journaliserOrphelin({
      admin: supabaseAdmin,
      intentId: paiement.id,
      proId,
      montant: paiement.amount,
      cause: 'doublon',
    })
    return NextResponse.json({ success: true, rembourse: true })
  } catch (e) {
    console.error('[api/propay/rembourser-orphelin]', e)
    return NextResponse.json({ error: 'stripe_error' }, { status: 500 })
  }
}
