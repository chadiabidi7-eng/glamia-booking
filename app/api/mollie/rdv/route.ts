// ─────────────────────────────────────────────────────────────────────────────
// LE RENDEZ-VOUS D'UN ACOMPTE MOLLIE PAYÉ (3.3.0, 18 nov. 2026)
//
// Appelée par le serveur seulement (clé MOLLIE_SECRET_RESERVATION) : par
// l'écoute de Mollie dès qu'un paiement est confirmé, et par le suivi du retour
// de la cliente (/api/mollie/etat), au cas où l'écoute tarde.
//
// Jamais sans argent reçu : le paiement doit être « payé » dans notre trace,
// relue chez Mollie par l'écoute. Jamais deux fois : la copie se prend d'un coup.
// Créneau parti entre-temps : la cliente est remboursée en entier.
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'
import { rdvDepuisCopie, type Copie } from '@/lib/rdv-depuis-copie'
import { appelerMollieAcompte, SECRET_MOLLIE, supabaseAdmin } from '@/lib/mollie-reservation'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const cle = process.env.REPARATION_SECRET
  if (!SECRET_MOLLIE || !cle || req.headers.get('authorization') !== `Bearer ${SECRET_MOLLIE}`) {
    return NextResponse.json({ error: 'non_autorise' }, { status: 401 })
  }
  const { paiement } = await req.json().catch(() => ({})) as { paiement?: string }
  if (typeof paiement !== 'string' || !/^[0-9a-f-]{36}$/i.test(paiement)) return NextResponse.json({ error: 'paiement' }, { status: 400 })

  const { data: p } = await supabaseAdmin.from('mollie_paiements')
    .select('pro_id, mollie_paiement_id, statut, rdv_id').eq('id', paiement).maybeSingle()
  if (!p?.mollie_paiement_id) return NextResponse.json({ ok: false, raison: 'paiement_inconnu' })
  if (p.rdv_id) return NextResponse.json({ ok: true, rdv_id: p.rdv_id, deja: true })
  if (p.statut !== 'paye') return NextResponse.json({ ok: false, raison: 'pas_paye', statut: p.statut })
  const intentId = p.mollie_paiement_id as string
  const proId = p.pro_id as string

  // ── ON PREND LA COPIE, D'UN COUP ─────────────────────────────────────────
  const { data: prises } = await supabaseAdmin.from('reservations_en_attente')
    .update({ statut: 'serveur', maj_le: new Date().toISOString() })
    .eq('intent_id', intentId).eq('statut', 'en_attente')
    .select('pro_id, corps, source')
  const prise = (prises ?? [])[0]
  if (!prise) {
    const { data: l } = await supabaseAdmin.from('reservations_en_attente').select('statut, rdv_id, resultat').eq('intent_id', intentId).maybeSingle()
    if (l?.statut === 'cree' && l.rdv_id) {
      await supabaseAdmin.from('mollie_paiements').update({ rdv_id: l.rdv_id, maj_le: new Date().toISOString() }).eq('id', paiement)
      return NextResponse.json({ ok: true, rdv_id: l.rdv_id, deja: true })
    }
    // Déjà prise par l'autre appel, ou refusée : rien à refaire.
    return NextResponse.json({ ok: false, raison: l?.statut === 'refuse' ? 'refuse' : 'copie_absente_ou_prise' })
  }
  if (prise.pro_id !== proId) {
    await supabaseAdmin.from('reservations_en_attente').update({ statut: 'refuse', resultat: { raison: 'autre_pro' } }).eq('intent_id', intentId)
    return NextResponse.json({ ok: false, raison: 'autre_pro' })
  }

  // Issue définitive (rendez-vous créé, ou refusé) : le créneau tenu pendant le paiement est libéré.
  const finir = async (statut: string, resultat: Record<string, unknown>, rdvId: string | null = null) => {
    await supabaseAdmin.from('reservations_en_attente')
      .update({ statut, resultat, rdv_id: rdvId, maj_le: new Date().toISOString() })
      .eq('intent_id', intentId)
    await supabaseAdmin.from('creneaux_tenus').delete().eq('intent_id', intentId)
  }

  try {
    const issue = await rdvDepuisCopie(supabaseAdmin, {
      intentId, proId, copie: prise.corps as Copie, cle, origine: req.nextUrl.origin,
      source: (prise.source as string | null) ?? null,
      lier: async (rdvId) => {
        const { error } = await supabaseAdmin.from('mollie_paiements').update({ rdv_id: rdvId, maj_le: new Date().toISOString() }).eq('id', paiement)
        return !error
      },
      rembourser: async () => {
        await appelerMollieAcompte({ action: 'rendre', paiement, motif: 'creneau_parti' })
      },
    })
    if (!issue.ok) {
      await finir('refuse', { raison: issue.raison, ...(issue.extra ?? {}) })
      return NextResponse.json({ ok: false, raison: issue.raison })
    }
    await finir('cree', { lie: issue.lie }, issue.rdvId)
    return NextResponse.json({ ok: true, rdv_id: issue.rdvId })
  } catch (e) {
    console.error('[mollie/rdv]', paiement, e)
    // La copie est rendue : l'écoute de Mollie rappellera.
    await supabaseAdmin.from('reservations_en_attente').update({ statut: 'en_attente', maj_le: new Date().toISOString() }).eq('intent_id', intentId).eq('statut', 'serveur')
    return NextResponse.json({ ok: false, raison: 'erreur_interne' }, { status: 500 })
  }
}
