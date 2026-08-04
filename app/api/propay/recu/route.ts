import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// ─────────────────────────────────────────────────────────────────────────────
// Glamia Pay — données de la facture (page /paiement/merci).
// GET ?token=<paiement_id>  → détail prestation + frais + total, une fois payé.
// Construit depuis la ligne `paiements` (pas de mention Stripe/Glamia côté frais).
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Paiement = {
  pro_id: string
  type: string
  montant: number
  frais_reservation: number | null
  statut: string
  created_at: string
  rdv: { technique: string | null } | null
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? ''
  if (!UUID.test(token)) return NextResponse.json({ error: 'token_invalide' }, { status: 400 })

  try {
    const { data } = await supabaseAdmin
      .from('paiements')
      .select('pro_id, type, montant, frais_reservation, statut, created_at, rdv:rendez_vous(technique)')
      .eq('id', token)
      .maybeSingle()
    if (!data) return NextResponse.json({ error: 'introuvable' }, { status: 404 })
    const p = data as unknown as Paiement

    if (p.statut !== 'paye') return NextResponse.json({ statut: 'en_attente' })

    const { data: pro } = await supabaseAdmin
      .from('profiles')
      .select('pseudo, prenom, nom')
      .eq('id', p.pro_id)
      .maybeSingle()
    const nomPro = pro?.pseudo || [pro?.prenom, pro?.nom].filter(Boolean).join(' ') || ''

    const restant = p.montant
    const frais = p.frais_reservation ?? 0
    return NextResponse.json({
      statut: 'paye',
      numero: token.slice(-8).toUpperCase(),
      date: p.created_at,
      pro: nomPro,
      lignes: [
        {
          libelle: `${p.type === 'acompte' ? 'Acompte' : p.type === 'solde' ? 'Solde' : 'Prestation'}${p.rdv?.technique ? ` — ${p.rdv.technique}` : ''}`,
          montant: restant,
        },
        // LA LIGNE DE FRAIS NE SORT QUE S'IL Y EN A. Depuis le 5 août 2026, la
        // pro absorbe les frais de carte : le reçu d'un paiement récent ne doit
        // pas afficher « Frais de réservation : 0,00 € », qui laisserait croire
        // qu'on lui en a compté. Les paiements d'avant gardent leur ligne, un
        // reçu doit rester fidèle à ce qui a été payé ce jour-là.
        ...(frais > 0 ? [{ libelle: 'Frais de réservation', montant: frais }] : []),
      ],
      total: restant + frais,
    })
  } catch (e) {
    console.error('[api/propay/recu]', e)
    return NextResponse.json({ error: 'erreur' }, { status: 500 })
  }
}
