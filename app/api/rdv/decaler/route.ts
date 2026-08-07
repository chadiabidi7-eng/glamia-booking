import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// ─────────────────────────────────────────────────────────────────────────────
// Guichet serveur — décalage d'un RDV par la CLIENTE depuis la page de résa.
// Chantier RLS (18 juil. 2026) : remplace l'écriture anonyme directe. Vérifie le
// téléphone de la cliente, applique les gardes (décalage tardif avec paiement
// engagé = C4/M1 ; plafond de 3 décalages = Q1), puis met à jour la date.
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

const SEUIL_TARDIVE_MS = 24 * 3600_000
const MAX_DECALAGES = 3

// Décalage fermé à < 24 h du RDV quand un paiement Glamia Pay est engagé
// (sinon décaler puis annuler > 24 h contournerait la règle tardive).
async function decalageBloque(rdvId: string, dateRdv: string): Promise<boolean> {
  if (new Date(dateRdv).getTime() - Date.now() >= SEUIL_TARDIVE_MS) return false
  const { data } = await supabaseAdmin
    .from('paiements').select('id').eq('rdv_id', rdvId)
    .in('statut', ['empreinte_posee', 'acompte_paye', 'paye']).limit(1)
  return (data ?? []).length > 0
}

export async function POST(req: NextRequest) {
  let body: { rdv_id?: unknown; telephone?: unknown; new_date?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }) }

  const rdvId = body.rdv_id
  const telephone = body.telephone
  const newDate = body.new_date
  if (typeof rdvId !== 'string' || !/^[0-9a-f-]{36}$/i.test(rdvId)
    || typeof telephone !== 'string' || telephone.trim().length < 6
    || typeof newDate !== 'string' || !newDate) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
  }

  const { data: rdv } = await supabaseAdmin
    .from('rendez_vous')
    .select('id, date, statut, nb_decalages, cliente:clientes(telephone)')
    .eq('id', rdvId)
    .maybeSingle()
  if (!rdv) return NextResponse.json({ error: 'rdv_introuvable' }, { status: 404 })

  // ── VÉRIFICATION DE PROPRIÉTÉ ──
  const telRdv = (rdv as { cliente?: { telephone?: string } }).cliente?.telephone
  if (!telRdv || normalizePhone(telRdv) !== normalizePhone(telephone)) {
    return NextResponse.json({ error: 'non_autorise' }, { status: 403 })
  }

  if (rdv.statut === 'annule') {
    return NextResponse.json({ error: 'rdv_annule' }, { status: 409 })
  }
  if (await decalageBloque(rdv.id, rdv.date as string)) {
    return NextResponse.json({ error: 'decalage_tardif' }, { status: 403 })
  }
  if (((rdv as { nb_decalages?: number }).nb_decalages ?? 0) >= MAX_DECALAGES) {
    return NextResponse.json({ error: 'decalage_max_atteint' }, { status: 403 })
  }

  const { error: updErr } = await supabaseAdmin
    .from('rendez_vous')
    .update({
      date: newDate,
      statut: 'en_attente',
      nb_decalages: ((rdv as { nb_decalages?: number }).nb_decalages ?? 0) + 1,
      rappel_envoye_count: 0,
      rappel_envoye_at: null,
    })
    .eq('id', rdvId)
    .neq('statut', 'annule')
  if (updErr) return NextResponse.json({ error: 'update_failed' }, { status: 500 })

  // ── 3) LA TRACE ÉCRITE POUR LA CLIENTE ─────────────────────────────────
  // Elle annulait, et ne recevait rien. Aucune preuve que c'était pris en
  // compte, aucun mot sur l'acompte qu'elle avait avancé — donc un message à
  // sa pro pour le demander. Ce mail rend ce message inutile.
  //
  // ENVOYÉ EN DERNIER, une fois le paiement traité : c'est ce qui décide de ce
  // qu'il raconte (remboursé, conservé, ou empreinte libérée). L'envoyer plus
  // tôt le ferait mentir.
  //
  // Un échec d'envoi ne remet rien en cause : l'annulation, elle, a eu lieu.
  try {
    await fetch('https://gdgfgbxoapgmrbttdyac.supabase.co/functions/v1/rdv-cliente-mail', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ rdv_id: rdvId, motif: 'decale' }),
    })
  } catch (e) {
    console.error('[api/rdv/decale] mail cliente non envoyé :', rdvId, e)
  }

  return NextResponse.json({ success: true })
}
