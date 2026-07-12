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
// Body : { rdv_id: string, photos: string[] } (data URLs base64 image/jpeg, max 3)
export async function POST(req: NextRequest) {
  let body: { rdv_id?: unknown; photos?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const rdvId = body.rdv_id
  const photos = body.photos

  if (typeof rdvId !== 'string' || !/^[0-9a-f-]{36}$/i.test(rdvId)) {
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

  // Vérifier le RDV : existe, non annulé, dans le futur, créé il y a moins de 15 min
  const { data: rdv, error: rdvErr } = await supabaseAdmin
    .from('rendez_vous')
    .select('id, date, statut, created_at')
    .eq('id', rdvId)
    .maybeSingle()

  if (rdvErr || !rdv) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  if (rdv.statut === 'annule') {
    return NextResponse.json({ error: 'rdv_annule' }, { status: 403 })
  }
  if (new Date(rdv.date) <= new Date()) {
    return NextResponse.json({ error: 'rdv_passe' }, { status: 403 })
  }
  if (!rdv.created_at || Date.now() - new Date(rdv.created_at).getTime() > DELAI_MAX_MS) {
    return NextResponse.json({ error: 'too_late' }, { status: 403 })
  }

  // Upload dans le bucket public : inspirations/{rdv_id}/{1..3}.jpg
  const urls: string[] = []
  for (let i = 0; i < buffers.length; i++) {
    const path = `${rdvId}/${i + 1}.jpg`
    const { error: upErr } = await supabaseAdmin.storage
      .from('inspirations')
      .upload(path, buffers[i], { contentType: 'image/jpeg', upsert: true })

    if (upErr) {
      console.error('[api/inspirations] Erreur upload:', path, upErr)
      return NextResponse.json({ error: 'upload_failed' }, { status: 500 })
    }
    urls.push(supabaseAdmin.storage.from('inspirations').getPublicUrl(path).data.publicUrl)
  }

  const { error: updateErr } = await supabaseAdmin
    .from('rendez_vous')
    .update({ inspirations: urls })
    .eq('id', rdvId)

  if (updateErr) {
    console.error('[api/inspirations] Erreur update rendez_vous:', updateErr)
    return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  }

  return NextResponse.json({ success: true, urls })
}
