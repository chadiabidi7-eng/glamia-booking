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
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  const { data, error } = await supabaseAdmin
    .from('rendez_vous')
    .select('id, date, technique, specialite, prix, statut, token_expiration, cliente_id, pro_id, duree')
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
    .select('prenom, nom, pseudo, avatar_url, push_token, adresse, horaires')
    .eq('id', data.pro_id)
    .maybeSingle()

  const dateStr = (data.date as string).slice(0, 10)
  const heureStr = (data.date as string).slice(11, 16)

  // Créneaux existants pour une date spécifique (pour le décalage)
  const slotsDate = req.nextUrl.searchParams.get('slots_date')
  let rdvsJour: { heure: string; duree: number }[] = []
  if (slotsDate) {
    const { data: rdvs } = await supabaseAdmin
      .from('rendez_vous')
      .select('date, duree')
      .eq('pro_id', data.pro_id)
      .gte('date', `${slotsDate}T00:00:00.000Z`)
      .lte('date', `${slotsDate}T23:59:59.999Z`)
      .neq('statut', 'annule')

    rdvsJour = (rdvs ?? []).map(r => {
      const d = new Date(r.date)
      return {
        heure: `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`,
        duree: r.duree,
      }
    })
  }

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
    pro_adresse: pro?.adresse ?? null,
    pro_id: data.pro_id,
    horaires: (pro as any)?.horaires ?? null,
    duree: data.duree ?? 60,
    rdvs_jour: rdvsJour,
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

  if (action !== 'confirmer' && action !== 'annuler' && action !== 'decaler') {
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

  // ── Action : décaler ──────────────────────────────────────────────────
  if (action === 'decaler') {
    const newDate = body.new_date as string
    if (!newDate) {
      return NextResponse.json({ error: 'new_date_required' }, { status: 400 })
    }

    const oldDateStr = (rdv.date as string).slice(0, 10)
    const oldHeureStr = (rdv.date as string).slice(11, 16)

    const { error: updateErr } = await supabaseAdmin
      .from('rendez_vous')
      .update({
        date: newDate,
        statut: 'en_attente',
        rappel_envoye_count: 0,
        rappel_envoye_at: null,
        token_confirmation: null,
        token_expiration: null,
      })
      .eq('id', rdv.id)

    if (updateErr) {
      console.error('[api/confirmation] Erreur decaler:', updateErr)
      return NextResponse.json({ error: 'update_failed' }, { status: 500 })
    }

    try {
      const { data: proData } = await supabaseAdmin
        .from('profiles')
        .select('push_token')
        .eq('id', rdv.pro_id)
        .maybeSingle()

      const { data: cliente } = await supabaseAdmin
        .from('clientes')
        .select('prenom, email')
        .eq('id', rdv.cliente_id)
        .maybeSingle()

      const clientePrenom = cliente?.prenom ?? 'Une cliente'
      const newDateStr = newDate.slice(0, 10)
      const newHeureStr = newDate.slice(11, 16)

      // Push notification à la pro
      if (proData?.push_token) {
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: proData.push_token,
            title: '📅 RDV décalé',
            body: `${clientePrenom} a décalé son RDV du ${formatDateFr(oldDateStr)} au ${formatDateFr(newDateStr)} à ${newHeureStr}`,
          }),
        })
      }

      // Email de confirmation à la cliente
      if (cliente?.email) {
        const { data: proInfo } = await supabaseAdmin
          .from('profiles')
          .select('prenom, nom, pseudo, adresse')
          .eq('id', rdv.pro_id)
          .maybeSingle()

        const proNom = proInfo?.pseudo || `${proInfo?.prenom ?? ''} ${proInfo?.nom ?? ''}`.trim()

        const { data: rdvFull } = await supabaseAdmin
          .from('rendez_vous')
          .select('technique, specialite, duree, prix')
          .eq('id', rdv.id)
          .maybeSingle()

        await fetch(
          'https://gdgfgbxoapgmrbttdyac.supabase.co/functions/v1/confirmation-booking',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              cliente_email: cliente.email,
              cliente_prenom: clientePrenom,
              pro_nom: proNom,
              date: formatDateFr(newDateStr),
              heure: newHeureStr,
              duree: rdvFull?.duree ? `${rdvFull.duree} min` : '',
              prix_total: rdvFull?.prix ?? 0,
              adresse: proInfo?.adresse || '',
              techniques: rdvFull ? [{
                nom: rdvFull.technique ?? '',
                specialite: rdvFull.specialite ?? '',
                prix: rdvFull.prix ?? 0,
                duree_minutes: rdvFull.duree ?? 60,
              }] : [],
            }),
          },
        )
        console.log('[api/confirmation] Email confirmation décalage envoyé à', cliente.email)
      }
    } catch (e) {
      console.error('[api/confirmation] Erreur push/email decaler:', e)
    }

    return NextResponse.json({ success: true, statut: 'en_attente' })
  }

  // ── Action : confirmer / annuler ──────────────────────────────────────
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
