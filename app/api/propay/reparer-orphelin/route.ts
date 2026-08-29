import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe-serveur'
import { adressePourEtape } from '@/lib/adresse-due'

// ─────────────────────────────────────────────────────────────────────────────
// UN PAIEMENT SANS RENDEZ-VOUS SE REPOSE TOUT SEUL.
//
// LE 24 AOÛT 2026, une cliente d'Ilana Douceur a payé 2,80 € et son
// rendez-vous n'a jamais existé : la connexion est morte entre l'encaissement
// et l'écriture. Il restait un numéro de paiement, et rien d'autre.
//
// Depuis, le paiement emporte la réservation avec lui : le créneau, la
// prestation, le nom et le téléphone sont posés SUR le paiement avant qu'il
// parte. Tout ce qu'il faut pour reposer le rendez-vous est donc là.
//
// LA RÉPARATION NE RECOPIE AUCUNE RÈGLE. Elle rappelle les guichets qui les
// portent déjà : `cliente/identifier` reconnaît la cliente, `rdv/creer` vérifie
// que le créneau est libre et recalcule le prix depuis le catalogue,
// `propay/lier` vérifie le montant chez Stripe et écrit l'encaissement. Une
// réparation suit donc exactement le chemin d'une réservation normale — c'est
// la seule façon qu'elle ne fabrique pas des rendez-vous qu'une vraie
// réservation aurait refusés.
//
// SI L'ENCAISSEMENT NE SE RATTACHE PAS, ON DÉFAIT. Un rendez-vous dans
// l'agenda sans l'acompte en face est pire que pas de rendez-vous du tout : la
// pro le redemanderait à une cliente qui a déjà payé.
//
// Appelée par le vérificateur d'orphelins, toutes les minutes.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** Ce que le paiement a emporté avec lui. Champs courts : Stripe plafonne à 500 caractères. */
type Reservation = {
  d?: string; h?: string; m?: number
  s?: string; t?: string; p?: number
  pr?: string; no?: string; te?: string; em?: string
}

const refus = (raison: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: false, raison, ...extra })

export async function POST(req: NextRequest) {
  // Réservée au service : elle crée des rendez-vous et lit des données de clientes.
  if (req.headers.get('Authorization') !== `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`) {
    return NextResponse.json({ error: 'non_autorise' }, { status: 401 })
  }

  try {
    const { intent_id } = await req.json()
    if (typeof intent_id !== 'string' || !/^(seti|pi)_[A-Za-z0-9]+$/.test(intent_id)) {
      return NextResponse.json({ error: 'intent_invalide' }, { status: 400 })
    }

    const { data: orphelin } = await supabaseAdmin
      .from('paiements_orphelins')
      .select('id, pro_id, statut')
      .eq('stripe_intent_id', intent_id)
      .maybeSingle()
    if (!orphelin?.pro_id) return refus('paiement_inconnu')
    if (orphelin.statut === 'resolu') return NextResponse.json({ ok: true, deja: true })
    const proId = orphelin.pro_id as string

    const { data: compte } = await supabaseAdmin
      .from('stripe_comptes').select('account_id').eq('pro_id', proId).maybeSingle()
    if (!compte?.account_id) return refus('compte_introuvable')
    const stripeAccount = compte.account_id as string

    // Une empreinte est un SetupIntent, un acompte un PaymentIntent : deux
    // objets différents chez Stripe.
    const intent = intent_id.startsWith('seti_')
      ? await stripe().setupIntents.retrieve(intent_id, {}, { stripeAccount })
      : await stripe().paymentIntents.retrieve(intent_id, {}, { stripeAccount })

    let r: Reservation
    try { r = JSON.parse(intent.metadata?.glamia_resa ?? '') } catch { r = {} }
    // Les paiements d'avant le 24 août 2026 ne portent rien : irréparables.
    if (!r.d || !r.h) return refus('sans_reservation')

    // ── LA CLIENTE ────────────────────────────────────────────────────────────
    if (!r.te) return refus('sans_telephone')
    const repCliente = await fetch(`${req.nextUrl.origin}/api/cliente/identifier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pro_id: proId, telephone: r.te, creer: true,
        prenom: r.pr ?? '', nom: r.no ?? '', email: r.em ?? '',
      }),
    })
    const cliente = (await repCliente.json())?.cliente
    if (!cliente?.id) return refus('cliente_impossible')

    // ── LE RENDEZ-VOUS ────────────────────────────────────────────────────────
    // `rdv/creer` refuse un créneau pris entre-temps : deux clientes à la même
    // heure serait pire que le problème qu'on répare.
    const repRdv = await fetch(`${req.nextUrl.origin}/api/rdv/creer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pro_id: proId, cliente_id: cliente.id,
        date: r.d, heure: r.h, duree: Number(r.m) || 60,
        specialite: r.s ?? null, technique: r.t ?? null,
        prix: Number(r.p) || null,
      }),
    })
    const rdv = await repRdv.json()
    if (!repRdv.ok || !rdv?.id) return refus('creneau_indisponible', { detail: rdv?.raison ?? null })

    // ── L'ENCAISSEMENT ────────────────────────────────────────────────────────
    const repLien = await fetch(`${req.nextUrl.origin}/api/propay/lier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pro_id: proId, rdv_id: rdv.id, intent_id }),
    })
    if (!repLien.ok) {
      // On défait ce qu'on vient de poser : on ne laisse pas un rendez-vous
      // sans son acompte en face.
      await supabaseAdmin.from('rendez_vous').delete().eq('id', rdv.id)
      const detail = await repLien.json().catch(() => ({}))
      console.error('[propay/reparer-orphelin] encaissement non rattaché', intent_id, detail)
      return refus('paiement_non_rattachable', { detail: detail?.error ?? null })
    }

    // ── ON PRÉVIENT LA CLIENTE ────────────────────────────────────────────────
    // Elle a payé et n'a jamais rien reçu. Non bloquant : le rendez-vous existe
    // et l'argent est rattaché, c'est l'essentiel.
    if (r.em) {
      try {
        const { data: pro } = await supabaseAdmin
          .from('profiles').select('pseudo, prenom, nom, adresse, adresse_moment, devise, pays')
          .eq('id', proId).maybeSingle()
        await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co'}/functions/v1/confirmation-booking`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
              cliente_email: r.em,
              cliente_prenom: r.pr ?? '',
              pro_nom: pro?.pseudo || `${pro?.prenom ?? ''} ${pro?.nom ?? ''}`.trim(),
              pays: pro?.pays ?? null,
              date: r.d, heure: r.h,
              prix_total: Number(r.p) || 0,
              devise: pro?.devise ?? 'EUR',
              adresse: adressePourEtape(pro?.adresse as string | null, (pro as any)?.adresse_moment, 'reservation') ?? '',
            }),
          },
        )
      } catch (e) {
        console.error('[propay/reparer-orphelin] confirmation non envoyée', e)
      }
    }

    await supabaseAdmin.from('paiements_orphelins')
      .update({
        statut: 'resolu', rdv_id: rdv.id,
        resolu_le: new Date().toISOString(), verifie_le: new Date().toISOString(),
      })
      .eq('id', orphelin.id)

    console.log(`[propay/reparer-orphelin] ✓ ${intent_id} → rendez-vous ${rdv.id}`)
    return NextResponse.json({ ok: true, rdv_id: rdv.id })
  } catch (e) {
    console.error('[propay/reparer-orphelin]', e)
    return NextResponse.json({ ok: false, raison: 'erreur_interne' }, { status: 500 })
  }
}
