import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const MAX_PHOTOS = 3
const MAX_OCTETS = 4 * 1024 * 1024      // 4 Mo max par photo (décodée)
const DELAI_MAX_MS = 15 * 60 * 1000     // le RDV doit avoir été créé il y a moins de 15 min (anti-abus)

// POST /api/inspirations — Photos d'inspiration de la cliente pour un RDV
// Body : { rdv_id: string, photos: string[] }  → juste après la création (fenêtre 15 min)
//   ou : { token: string, photos: string[] }   → plus tard, via le lien de gestion du RDV
// (data URLs base64 image/jpeg ; 3 photos max au total, ajouts cumulés)
export async function POST(req: NextRequest) {
  let body: { rdv_id?: unknown; token?: unknown; photos?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const rdvId = body.rdv_id
  const token = body.token
  const photos = body.photos

  const parRdvId = typeof rdvId === 'string' && /^[0-9a-f-]{36}$/i.test(rdvId)
  const parToken = typeof token === 'string' && token.length >= 16 && token.length <= 128
  if (!parRdvId && !parToken) {
    return NextResponse.json({ error: 'invalid_rdv_id' }, { status: 400 })
  }
  if (!Array.isArray(photos) || photos.length === 0 || photos.length > MAX_PHOTOS) {
    return NextResponse.json({ error: 'invalid_photos' }, { status: 400 })
  }

  // Décoder + valider chaque photo AVANT tout upload
  const buffers: Buffer[] = []
  for (const p of photos) {
    if (typeof p !== 'string' || p.length === 0) {
      return NextResponse.json({ error: 'invalid_photo' }, { status: 400 })
    }
    const match = p.match(/^data:image\/[a-z0-9.+-]+;base64,(.+)$/i)
    const b64 = match ? match[1] : p
    let buf: Buffer
    try {
      buf = Buffer.from(b64, 'base64')
    } catch {
      return NextResponse.json({ error: 'invalid_photo' }, { status: 400 })
    }
    if (buf.byteLength === 0) {
      return NextResponse.json({ error: 'invalid_photo' }, { status: 400 })
    }
    if (buf.byteLength > MAX_OCTETS) {
      return NextResponse.json({ error: 'photo_too_large' }, { status: 400 })
    }
    buffers.push(buf)
  }

  // Vérifier le RDV : existe, non annulé, dans le futur.
  // Par rdv_id (juste après création) : fenêtre anti-abus de 15 min.
  // Par token (lien de gestion) : le token authentifie, ajout possible jusqu'au RDV.
  const requete = supabaseAdmin
    .from('rendez_vous')
    .select('id, date, statut, created_at, inspirations, token_expiration')
  const { data: rdv, error: rdvErr } = parRdvId
    ? await requete.eq('id', rdvId as string).maybeSingle()
    : await requete.eq('token_confirmation', token as string).maybeSingle()

  if (rdvErr || !rdv) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  if (rdv.statut === 'annule') {
    return NextResponse.json({ error: 'rdv_annule' }, { status: 403 })
  }
  if (new Date(rdv.date) <= new Date()) {
    return NextResponse.json({ error: 'rdv_passe' }, { status: 403 })
  }
  if (parRdvId && (!rdv.created_at || Date.now() - new Date(rdv.created_at).getTime() > DELAI_MAX_MS)) {
    return NextResponse.json({ error: 'too_late' }, { status: 403 })
  }
  if (parToken && rdv.token_expiration && new Date(rdv.token_expiration) < new Date()) {
    return NextResponse.json({ error: 'expired' }, { status: 410 })
  }

  // 3 photos max au total (existantes + nouvelles)
  const existantes: string[] = Array.isArray(rdv.inspirations) ? rdv.inspirations : []
  if (existantes.length + buffers.length > MAX_PHOTOS) {
    return NextResponse.json(
      { error: 'limit_reached', restant: Math.max(0, MAX_PHOTOS - existantes.length) },
      { status: 400 },
    )
  }

  // Upload dans le bucket public : inspirations/{rdv_id}/{1..3}.jpg
  // (numérotation continue après les photos déjà en place)
  const urls: string[] = []
  for (let i = 0; i < buffers.length; i++) {
    const path = `${rdv.id}/${existantes.length + i + 1}.jpg`
    const { error: upErr } = await supabaseAdmin.storage
      .from('inspirations')
      .upload(path, buffers[i], { contentType: 'image/jpeg', upsert: true })

    if (upErr) {
      console.error('[api/inspirations] Erreur upload:', path, upErr)
      return NextResponse.json({ error: 'upload_failed' }, { status: 500 })
    }
    urls.push(supabaseAdmin.storage.from('inspirations').getPublicUrl(path).data.publicUrl)
  }

  const toutes = [...existantes, ...urls]
  const { error: updateErr } = await supabaseAdmin
    .from('rendez_vous')
    .update({ inspirations: toutes })
    .eq('id', rdv.id)

  if (updateErr) {
    console.error('[api/inspirations] Erreur update rendez_vous:', updateErr)
    return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  }

  return NextResponse.json({ success: true, urls, inspirations: toutes })
}
