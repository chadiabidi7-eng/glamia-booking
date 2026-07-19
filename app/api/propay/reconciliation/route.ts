import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { traiterAnnulationPropay } from '@/lib/propay'
import { journaliserOrphelin } from '@/lib/orphelins'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

// ─────────────────────────────────────────────────────────────────────────────
// Glamia Pay — filet de réconciliation (18 juil. 2026).
// Rattrape les remboursements d'annulation qui ont échoué ou ne se sont jamais
// faits, pour qu'une cliente ayant annulé dans les règles revoie TOUJOURS son
// argent — sans intervention SQL manuelle. Complète le durcissement de
// lib/propay.ts (plus de ligne figée en 'annulation_en_cours').
//
// Portée VOLONTAIREMENT limitée au sens REMBOURSEMENT (argent qui revient à la
// cliente). Le sens PRÉLÈVEMENT d'empreinte reste une action manuelle de la pro
// pour ne JAMAIS débiter une cliente par automatisme (cf. faille C16 de l'audit).
//
// Appelé chaque heure par pg_cron : Authorization: Bearer <CRON_SECRET>.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const SEUIL_MS = 24 * 3600_000      // remboursement dû si annulation > 24 h avant le RDV
const AGE_MIN_MS = 10 * 60_000      // ne pas toucher une annulation de moins de 10 min (peut être en cours)
const ORPH_GRACE_MS = 30 * 60_000   // orphelin : ignorer un paiement de < 30 min (liaison peut être en cours)
const ORPH_FENETRE_MS = 24 * 3600_000 // fenêtre de scan Stripe : paiements des dernières 24 h

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'non_autorise' }, { status: 401 })
  }

  const maintenant = Date.now()

  // 1) Débloquer les paiements figés en 'annulation_en_cours' depuis > 10 min :
  //    remettre un statut rejouable. payment_intent présent = acompte/paye
  //    (remboursement retenté en étape 2) ; sinon empreinte → empreinte_posee
  //    (revue manuelle, jamais de prélèvement automatique).
  let debloques = 0
  const { data: figes } = await supabaseAdmin
    .from('paiements')
    .select('id, stripe_payment_intent_id, updated_at')
    .eq('statut', 'annulation_en_cours')
  for (const p of figes ?? []) {
    if (maintenant - new Date(p.updated_at as string).getTime() < AGE_MIN_MS) continue
    const cible = p.stripe_payment_intent_id ? 'acompte_paye' : 'empreinte_posee'
    const { error } = await supabaseAdmin
      .from('paiements')
      .update({ statut: cible, updated_at: new Date().toISOString() })
      .eq('id', p.id)
      .eq('statut', 'annulation_en_cours')
    if (!error) debloques++
  }

  // 2) Rembourser les acomptes dus mais jamais rendus : RDV annulé encore à
  //    plus de 24 h, acompte toujours détenu. On relance le moteur d'annulation
  //    (idempotent via les clés Stripe annul_*, donc aucun double remboursement).
  const seuil = new Date(maintenant + SEUIL_MS).toISOString()
  const resultats: Record<string, string> = {}
  const { data: rdvs } = await supabaseAdmin
    .from('rendez_vous')
    .select('id')
    .eq('statut', 'annule')
    .gt('date', seuil)
    .limit(300)
  const ids = (rdvs ?? []).map(r => r.id)
  if (ids.length) {
    const { data: paies } = await supabaseAdmin
      .from('paiements')
      .select('rdv_id')
      .in('rdv_id', ids)
      .in('statut', ['acompte_paye', 'paye'])
    const rdvIds = [...new Set((paies ?? []).map(p => p.rdv_id as string))]
    for (const rid of rdvIds) {
      try {
        const { resultat } = await traiterAnnulationPropay(rid)
        resultats[rid] = resultat
      } catch (e) {
        resultats[rid] = (e as Error).message ?? 'erreur'
      }
      await new Promise(r => setTimeout(r, 120))
    }
  }

  // 3) Filet Groupe E : paiements CAPTURÉS mais SANS réservation (« mort réseau »
  //    — coupure pile entre le paiement et l'écriture du RDV). Ces intents n'ont
  //    AUCUNE ligne `paiements` (lier n'a jamais tourné) → invisibles pour les
  //    passes 1-2 : on scanne donc Stripe directement, par compte connecté.
  //    Correspondance par NUMÉRO D'INTENT EXACT (pas de devinette). Garde-fous :
  //    délai de grâce 30 min (une liaison légitime a largement fini) + on ignore
  //    ce qui a déjà une ligne paiements OU un journal orphelin (idempotent).
  let orphelins = 0
  let orphelinsPageMax = false
  const debutFenetre = Math.floor((maintenant - ORPH_FENETRE_MS) / 1000)
  const { data: comptes } = await supabaseAdmin.from('stripe_comptes').select('pro_id, account_id')
  for (const c of comptes ?? []) {
    const account_id = c.account_id as string
    const pro_id = c.pro_id as string
    try {
      const list = await stripe.paymentIntents.list(
        { limit: 100, created: { gte: debutFenetre } },
        { stripeAccount: account_id },
      )
      if (list.has_more) orphelinsPageMax = true // volume anormal : à surveiller
      const candidats = list.data.filter(pi =>
        pi.status === 'succeeded'
        && pi.metadata?.glamia_pro_id === pro_id
        && (maintenant - pi.created * 1000) >= ORPH_GRACE_MS)
      if (!candidats.length) continue

      const ids = candidats.map(pi => pi.id)
      const { data: lignes } = await supabaseAdmin
        .from('paiements').select('stripe_payment_intent_id').in('stripe_payment_intent_id', ids)
      const connus = new Set((lignes ?? []).map(l => l.stripe_payment_intent_id as string))
      const { data: dejaVus } = await supabaseAdmin
        .from('paiements_orphelins').select('stripe_intent_id').in('stripe_intent_id', ids)
      const vus = new Set((dejaVus ?? []).map(o => o.stripe_intent_id as string))

      for (const pi of candidats) {
        if (connus.has(pi.id) || vus.has(pi.id)) continue // résa normale OU déjà traité
        // Déjà remboursé (par le guichet C11 ou un run précédent) ? On ne re-rembourse pas.
        let dejaRembourse = false
        try {
          const chargeId = typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id
          if (chargeId) {
            const ch = await stripe.charges.retrieve(chargeId, {}, { stripeAccount: account_id })
            dejaRembourse = (ch.amount_refunded ?? 0) > 0
          }
        } catch (e) { console.error('[reconciliation] charge', pi.id, e) }
        if (!dejaRembourse) {
          await stripe.refunds.create(
            { payment_intent: pi.id },
            { stripeAccount: account_id, idempotencyKey: `orphelin_remb_${pi.id}` },
          )
        }
        await journaliserOrphelin({ admin: supabaseAdmin, intentId: pi.id, proId: pro_id, montant: pi.amount, cause: 'mort_reseau' })
        orphelins++
        await new Promise(r => setTimeout(r, 120))
      }
    } catch (e) {
      console.error('[reconciliation] scan compte', account_id, e)
    }
  }

  const bilan = {
    debloques,
    remboursements_relances: Object.keys(resultats).length,
    resultats,
    orphelins_rembourses: orphelins,
    ...(orphelinsPageMax ? { alerte: 'plus de 100 paiements sur 24h pour au moins un compte — scan possiblement partiel' } : {}),
  }
  console.log('[reconciliation-paiements]', JSON.stringify(bilan))
  return NextResponse.json(bilan)
}
