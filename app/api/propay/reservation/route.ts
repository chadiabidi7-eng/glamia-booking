import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe-serveur'

// ─────────────────────────────────────────────────────────────────────────────
// LE PAIEMENT EMPORTE LA RÉSERVATION AVEC LUI.
//
// LE 24 AOÛT 2026, une cliente d'Ilana Douceur a payé 2,80 € et son rendez-vous
// n'a jamais existé : la connexion est morte entre l'encaissement et
// l'écriture. Il restait un numéro de paiement, et rien d'autre — ni nom, ni
// créneau, ni prestation. On a retrouvé son nom chez Stripe ; ce qu'elle
// voulait réserver, personne ne pouvait le dire : sa pro a dix-huit
// prestations au même prix.
//
// LA CAUSE N'EST PAS LE RÉSEAU, C'EST L'ORDRE. On encaisse d'abord, on écrit
// le rendez-vous ensuite, et entre les deux on ne garde rien qui permette de
// le reconstruire. Le réseau tombera toujours ; c'est le trou de mémoire qu'il
// faut boucher.
//
// Cette route pose donc la réservation SUR LE PAIEMENT, juste avant qu'il
// parte. Stripe la garde attachée. Si la connexion meurt ensuite, le
// vérificateur qui repère les paiements sans rendez-vous — toutes les minutes —
// a tout ce qu'il faut pour le recréer sans que personne n'ait rien à faire.
//
// ELLE NE DOIT JAMAIS EMPÊCHER UNE RÉSERVATION. Si elle échoue, le paiement
// part quand même : mieux vaut un rendez-vous pris sans filet qu'une cliente
// bloquée devant un écran.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** Stripe n'accepte que 500 caractères par valeur : on coupe, on ne casse pas. */
const court = (v: unknown, max: number) => String(v ?? '').slice(0, max)

export async function POST(req: NextRequest) {
  try {
    const { pro_id, intent_id, reservation } = await req.json()
    if (typeof pro_id !== 'string' || typeof intent_id !== 'string' || !reservation) {
      return NextResponse.json({ error: 'params' }, { status: 400 })
    }

    const { data: compte } = await supabaseAdmin
      .from('stripe_comptes').select('account_id').eq('pro_id', pro_id).maybeSingle()
    if (!compte?.account_id) return NextResponse.json({ error: 'compte' }, { status: 404 })

    // Le strict nécessaire pour reposer le rendez-vous : quand, quoi, pour qui.
    const resume = JSON.stringify({
      d: court(reservation.date, 10),
      h: court(reservation.heure, 5),
      m: Number(reservation.duree) || 0,
      s: court(reservation.specialite, 80),
      t: court(reservation.technique, 160),
      p: Number(reservation.prix) || 0,
      pr: court(reservation.prenom, 40),
      no: court(reservation.nom, 40),
      te: court(reservation.telephone, 20),
      em: court(reservation.email, 80),
    })

    const majMeta = { glamia_resa: resume.slice(0, 500) }
    // Une empreinte est un SetupIntent, un acompte un PaymentIntent : deux
    // objets différents chez Stripe, et on ne sait pas lequel d'ici.
    if (intent_id.startsWith('seti_')) {
      await stripe().setupIntents.update(intent_id, { metadata: majMeta }, { stripeAccount: compte.account_id })
    } else {
      await stripe().paymentIntents.update(intent_id, { metadata: majMeta }, { stripeAccount: compte.account_id })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    // On ne remonte pas d'erreur bloquante : la réservation doit continuer.
    console.error('[propay/reservation] réservation non posée sur le paiement', e)
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
