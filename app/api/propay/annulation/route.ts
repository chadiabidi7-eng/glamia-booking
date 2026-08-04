import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { traiterAnnulationPropay } from '@/lib/propay'

// ─────────────────────────────────────────────────────────────────────────────
// Glamia Pay — annulation d'un RDV depuis la page de résa (numéro reconnu).
// Le RDV doit DÉJÀ être annulé (statut 'annule') : cette route ne fait que
// traiter le volet paiement (libération / remboursement / prélèvement tardif).
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  let body: { rdv_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const rdvId = body.rdv_id
  if (typeof rdvId !== 'string' || !/^[0-9a-f-]{36}$/i.test(rdvId)) {
    return NextResponse.json({ error: 'invalid_rdv_id' }, { status: 400 })
  }

  // Garde-fou : on ne traite le paiement que d'un RDV réellement annulé
  const { data: rdv } = await supabaseAdmin
    .from('rendez_vous')
    .select('statut')
    .eq('id', rdvId)
    .maybeSingle()
  if (rdv?.statut !== 'annule') {
    return NextResponse.json({ error: 'rdv_non_annule' }, { status: 409 })
  }

  const { resultat } = await traiterAnnulationPropay(rdvId)
  return NextResponse.json({ resultat })
}
