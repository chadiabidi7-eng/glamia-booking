// ─────────────────────────────────────────────────────────────────────────────
// LA CLIENTE REVIENT DE LA PAGE DE PAIEMENT DE MOLLIE (3.3.0, 18 nov. 2026)
//
// GET ?paiement=<numéro Glamia> → où en est son acompte et son rendez-vous :
//   attente  : Mollie n'a pas encore tranché (on relit chez Mollie à chaque appel) ;
//   confirme : payé et rendez-vous créé (avec le récapitulatif) ;
//   echec    : pas payé (abandon, refus de la carte, délai dépassé) ;
//   refuse   : payé, mais le créneau est parti entre-temps → remboursée en entier.
//
// Si l'écoute de Mollie tarde, c'est ce suivi qui fait avancer les choses :
// il relit le paiement chez Mollie, puis demande la création du rendez-vous.
// Le numéro Glamia est impossible à deviner ; on ne rend que le strict récapitulatif.
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'
import { SECRET_MOLLIE, SUPABASE, supabaseAdmin } from '@/lib/mollie-reservation'
import { ENTETES_INTERNES } from '@/lib/rdv-depuis-copie'

export const maxDuration = 60

const lire = (id: string) => supabaseAdmin.from('mollie_paiements')
  .select('mollie_paiement_id, type, statut, rdv_id, montant, frais_reservation, total_cliente, devise').eq('id', id).maybeSingle()

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('paiement') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'paiement' }, { status: 400 })
  let { data: p } = await lire(id)
  if (!p?.mollie_paiement_id) return NextResponse.json({ etat: 'echec' })

  // Pas encore tranché chez nous : on demande à l'écoute de relire chez Mollie.
  if (p.statut === 'cree') {
    await fetch(`${SUPABASE}/functions/v1/mollie-ecoute`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id: p.mollie_paiement_id as string }).toString(),
      signal: AbortSignal.timeout(50_000),
    }).catch(() => null)
    p = (await lire(id)).data
  }
  // Payé mais sans rendez-vous : on le demande (sans effet s'il est en cours ailleurs).
  if (p?.statut === 'paye' && !p.rdv_id && SECRET_MOLLIE) {
    await fetch(`${req.nextUrl.origin}/api/mollie/rdv`, {
      method: 'POST', headers: { ...ENTETES_INTERNES, Authorization: `Bearer ${SECRET_MOLLIE}` },
      body: JSON.stringify({ paiement: id }),
      signal: AbortSignal.timeout(50_000),
    }).catch(() => null)
    p = (await lire(id)).data
  }
  if (!p) return NextResponse.json({ etat: 'echec' })

  const { data: copie } = await supabaseAdmin.from('reservations_en_attente')
    .select('statut, corps').eq('intent_id', p.mollie_paiement_id).maybeSingle()
  const creation = ((copie?.corps as { creation?: Record<string, unknown> } | null)?.creation ?? {}) as Record<string, unknown>
  // Le lien du jour n'a pas de copie : le récapitulatif vient du rendez-vous lui-même.
  let date = (creation.date as string | undefined) ?? null
  let heure = (creation.heure as string | undefined) ?? null
  let prestations = (creation.technique as string | undefined) ?? null
  if (!date && p.rdv_id) {
    const { data: r } = await supabaseAdmin.from('rendez_vous').select('date, technique').eq('id', p.rdv_id).maybeSingle()
    if (r?.date) { date = String(r.date).slice(0, 10); heure = String(r.date).slice(11, 16) }
    prestations = (r?.technique as string | null) ?? prestations
  }
  const recap = {
    type: p.type, date, heure, prestations,
    acompte: p.montant, frais: p.frais_reservation, total: p.total_cliente, devise: p.devise,
  }

  if (['echoue', 'expire', 'annule'].includes(p.statut as string)) return NextResponse.json({ etat: 'echec' })
  if (p.statut === 'paye' && p.rdv_id) return NextResponse.json({ etat: 'confirme', recap })
  if (copie?.statut === 'refuse' || ['rembourse', 'rembourse_partiel'].includes(p.statut as string)) return NextResponse.json({ etat: p.type === 'jour' ? 'confirme' : 'refuse', recap })
  return NextResponse.json({ etat: 'attente' })
}
