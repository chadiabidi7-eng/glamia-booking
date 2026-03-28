import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

function formatDateFr(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// GET /api/confirmation/[token] — Charger les infos du RDV
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  const { data, error } = await supabaseAdmin
    .from('rendez_vous')
    .select('id, date, technique, specialite, prix, statut, token_expiration, cliente_id, pro_id')
    .eq('token_confirmation', token)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  if (data.token_expiration && new Date(data.token_expiration) < new Date()) {
    return NextResponse.json({ error: 'expired' }, { status: 410 })
  }

  // Récupérer la cliente
  const { data: cliente } = await supabaseAdmin
    .from('clientes')
    .select('prenom')
    .eq('id', data.cliente_id)
    .maybeSingle()

  // Récupérer le profil pro
  const { data: pro } = await supabaseAdmin
    .from('profiles')
    .select('prenom, nom, pseudo, avatar_url, push_token')
    .eq('id', data.pro_id)
    .maybeSingle()

  const dateStr = (data.date as string).slice(0, 10)
  const heureStr = (data.date as string).slice(11, 16)

  return NextResponse.json({
    id: data.id,
    date: dateStr,
    heure: heureStr,
    prestation: data.technique ?? '',
    categorie: data.specialite ?? null,
    prix: data.prix,
    statut: data.statut,
    token_expiration: data.token_expiration,
    cliente_prenom: cliente?.prenom ?? '',
    pro_prenom: pro?.prenom ?? '',
    pro_nom: pro?.nom ?? '',
    pro_pseudo: pro?.pseudo ?? null,
    pro_photo: pro?.avatar_url ?? null,
  })
}

// POST /api/confirmation/[token] — Confirmer ou annuler le RDV
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const body = await req.json()
  const action = body.action as string

  if (action !== 'confirmer' && action !== 'annuler') {
    return NextResponse.json({ error: 'invalid_action' }, { status: 400 })
  }

  // Vérifier que le RDV existe et que le token est valide
  const { data: rdv, error: fetchErr } = await supabaseAdmin
    .from('rendez_vous')
    .select('id, date, statut, token_expiration, cliente_id, pro_id')
    .eq('token_confirmation', token)
    .maybeSingle()

  if (fetchErr || !rdv) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  if (rdv.token_expiration && new Date(rdv.token_expiration) < new Date()) {
    return NextResponse.json({ error: 'expired' }, { status: 410 })
  }

  const newStatut = action === 'confirmer' ? 'confirme' : 'annule'
  const updateData: Record<string, string> = { statut: newStatut }
  if (action === 'confirmer') {
    updateData.rappel_confirme_at = new Date().toISOString()
  }

  const { error: updateErr } = await supabaseAdmin
    .from('rendez_vous')
    .update(updateData)
    .eq('id', rdv.id)

  if (updateErr) {
    console.error('[api/confirmation] Erreur update:', updateErr)
    return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  }

  // ── Envoi push notification à la pro ────────────────────────────────────
  try {
    const { data: pro } = await supabaseAdmin
      .from('profiles')
      .select('push_token')
      .eq('id', rdv.pro_id)
      .maybeSingle()

    const pushToken = pro?.push_token
    if (!pushToken) {
      console.warn('[api/confirmation] Push token absent pour pro_id:', rdv.pro_id)
    } else {
      const { data: cliente } = await supabaseAdmin
        .from('clientes')
        .select('prenom')
        .eq('id', rdv.cliente_id)
        .maybeSingle()

      const clientePrenom = cliente?.prenom ?? 'une cliente'
      const dateStr = (rdv.date as string).slice(0, 10)
      const heureStr = (rdv.date as string).slice(11, 16)
      const dateFr = formatDateFr(dateStr)

      const title = action === 'confirmer' ? '✅ RDV confirmé' : '❌ RDV annulé'
      const body = action === 'confirmer'
        ? `${clientePrenom} a confirmé son RDV du ${dateFr} à ${heureStr}`
        : `${clientePrenom} a annulé son RDV du ${dateFr} à ${heureStr}`

      const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: pushToken, title, body }),
      })

      const pushBody = await pushRes.text()
      console.log('[api/confirmation] Push envoyé:', pushRes.status, pushBody)
    }
  } catch (e) {
    console.error('[api/confirmation] Erreur push (non bloquante):', e)
  }

  return NextResponse.json({ success: true, statut: newStatut })
}
