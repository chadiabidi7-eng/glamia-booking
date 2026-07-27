import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

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

function normalizePhone(tel: string): string {
  let n = tel.replace(/[\s\-.()]/g, '')
  if (n.startsWith('+33')) n = '0' + n.slice(3)
  if (n.startsWith('0033')) n = '0' + n.slice(4)
  return n
}

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
    .from('rendez_vous').select('id, cliente:clientes(telephone)').eq('id', rdvId).maybeSingle()
  if (!rdv) return NextResponse.json({ error: 'rdv_introuvable' }, { status: 404 })

  const telRdv = (rdv as { cliente?: { telephone?: string } }).cliente?.telephone
  if (!telRdv || normalizePhone(telRdv) !== normalizePhone(telephone)) {
    return NextResponse.json({ error: 'non_autorise' }, { status: 403 })
  }

  const { error: updErr } = await supabaseAdmin
    .from('rendez_vous').update({ prix, offre_id: null }).eq('id', rdvId)
  if (updErr) return NextResponse.json({ error: 'update_failed' }, { status: 500 })

  return NextResponse.json({ success: true })
}
