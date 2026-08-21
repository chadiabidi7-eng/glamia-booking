import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { prixReelDuPanier, remisesVerifiees } from '@/lib/prix-serveur'
import { normaliserTelephone } from '@/lib/telephone'

// ─────────────────────────────────────────────────────────────────────────────
// Guichet serveur — repli quand une offre (pack) n'a pas pu s'appliquer à une
// résa : on retire l'offre et on remet le prix plein sur le RDV. Chantier RLS
// (18 juil. 2026) : remplace la dernière écriture anonyme directe restante sur
// rendez_vous (hors INSERT de création). Vérifie le téléphone de la cliente.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)


export async function POST(req: NextRequest) {
  let body: { rdv_id?: unknown; telephone?: unknown; prix?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }) }

  const rdvId = body.rdv_id
  const telephone = body.telephone
  if (typeof rdvId !== 'string' || !/^[0-9a-f-]{36}$/i.test(rdvId)
    || typeof telephone !== 'string' || telephone.trim().length < 6) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
  }
  const prix = typeof body.prix === 'number' && body.prix > 0 ? body.prix : null

  const { data: rdv } = await supabaseAdmin
    .from('rendez_vous')
    .select('id, pro_id, cliente_id, techniques, fidelite_appliquee, reduction_appliquee, cliente:clientes(telephone)')
    .eq('id', rdvId).maybeSingle()
  if (!rdv) return NextResponse.json({ error: 'rdv_introuvable' }, { status: 404 })

  const telRdv = (rdv as { cliente?: { telephone?: string } }).cliente?.telephone
  if (!telRdv || normaliserTelephone(telRdv) !== normaliserTelephone(telephone)) {
    return NextResponse.json({ error: 'non_autorise' }, { status: 403 })
  }

  // LE PRIX DE REPLI SE RECALCULE ICI AUSSI. Le navigateur envoyait la somme
  // brute du catalogue : la fidélité et la réduction de la cliente sautaient
  // avec la promotion, alors qu'elles n'y sont pour rien. Elle perdait ses
  // remises parce qu'un quota d'offre était atteint.
  const reel = await prixReelDuPanier(rdv.pro_id, rdv.techniques)
  const remises = reel
    ? await remisesVerifiees(
        rdv.pro_id, rdv.cliente_id, reel.prix, rdv.fidelite_appliquee, rdv.reduction_appliquee)
    : null
  const prixRepli = remises ? remises.prix : prix

  const { error: updErr } = await supabaseAdmin
    .from('rendez_vous').update({ prix: prixRepli, offre_id: null }).eq('id', rdvId)
  if (updErr) return NextResponse.json({ error: 'update_failed' }, { status: 500 })

  return NextResponse.json({ success: true })
}
