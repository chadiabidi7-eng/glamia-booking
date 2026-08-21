import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// ─────────────────────────────────────────────────────────────────────────────
// Glamia Pay — LA facture de la cliente (page /paiement/merci).
//
// GET ?token=<paiement_id> → { statut, html }
//
// CE FICHIER EN DESSINAIT UNE DEUXIÈME, et c'était l'erreur. Il refaisait ses
// propres lignes, son propre total, avec l'euro écrit en dur : la même
// prestation réglée en francs s'affichait en euros à l'écran et en francs dans
// le mail reçu juste après. Il manquait aussi le détail des prestations et les
// remises accordées, que le mail montrait.
//
// Deux modèles censés dire la même chose finissent toujours par diverger —
// celui-ci était déjà parti. On ne garde donc plus qu'un seul document : celui
// du mail. Cette route va le chercher tel quel et le renvoie à la page, qui
// l'affiche sans rien y ajouter.
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

    // LA PAGE PARLE LA LANGUE DE LA PRO. Elle s'ouvre sur un jeton nu, sans
    // nom de pro dedans : sans cette valeur, son cadre restait en français
    // autour d'une facture anglaise. La facture, elle, va déjà la chercher
    // toute seule.
    const { data: pro } = await supabaseAdmin
      .from('profiles').select('langue').eq('id', p.pro_id).maybeSingle()
    const langue = (pro as { langue?: string | null } | null)?.langue ?? null

    if (p.statut !== 'paye') return NextResponse.json({ statut: 'en_attente', langue })

    // La facture est fabriquée à un seul endroit : la fonction qui l'envoie
    // par mail. On lui demande la même, en HTML, au lieu de la refaire ici.
    const rendu = await fetch(
      'https://gdgfgbxoapgmrbttdyac.supabase.co/functions/v1/envoyer-facture',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ paiement_id: token, action: 'html' }),
      },
    )
    if (!rendu.ok) {
      console.error('[api/propay/recu] facture non rendue', rendu.status, await rendu.text())
      return NextResponse.json({ error: 'facture_indisponible' }, { status: 502 })
    }

    return NextResponse.json({ statut: 'paye', langue, html: await rendu.text() })
  } catch (e) {
    console.error('[api/propay/recu]', e)
    return NextResponse.json({ error: 'erreur' }, { status: 500 })
  }
}
