// ─────────────────────────────────────────────────────────────────────────────
// LES PHOTOS D'INSPIRATION DE LA COPIE DE SECOURS (23 oct. 2026).
//
// Envoyées pendant le paiement, sans le faire attendre, et seulement quand la
// cliente en a mis. Rangées à part (inspirations/attente/<paiement>/) : si la
// page meurt, le serveur les rattache au rendez-vous qu'il crée. Dans la
// réservation normale, la page les envoie comme toujours après la création.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const MAX_PHOTOS = 3
const MAX_OCTETS = 4 * 1024 * 1024

export async function POST(req: NextRequest) {
  try {
    const { intent_id, photos } = await req.json()
    if (typeof intent_id !== 'string' || !/^(seti|pi)_[A-Za-z0-9]+$/.test(intent_id) || !Array.isArray(photos)) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }
    // Seulement pour une copie qui attend encore : rien d'autre ne s'écrit ici.
    const { data: ligne } = await supabaseAdmin.from('reservations_en_attente')
      .select('statut, corps').eq('intent_id', intent_id).maybeSingle()
    if (!ligne || ligne.statut !== 'en_attente') return NextResponse.json({ ok: false })
    const urls: string[] = []
    for (const [i, p] of photos.slice(0, MAX_PHOTOS).entries()) {
      const m = typeof p === 'string' ? p.match(/^data:image\/[a-z0-9.+-]+;base64,(.+)$/i) : null
      if (!m) continue
      const octets = Buffer.from(m[1], 'base64')
      if (octets.length > MAX_OCTETS) continue
      const chemin = `attente/${intent_id}/${i + 1}.jpg`
      const { error } = await supabaseAdmin.storage.from('inspirations')
        .upload(chemin, octets, { contentType: 'image/jpeg', upsert: true })
      if (!error) urls.push(supabaseAdmin.storage.from('inspirations').getPublicUrl(chemin).data.publicUrl)
    }
    await supabaseAdmin.from('reservations_en_attente')
      .update({ corps: { ...(ligne.corps as object), photos: urls }, maj_le: new Date().toISOString() })
      .eq('intent_id', intent_id).eq('statut', 'en_attente')
    return NextResponse.json({ ok: true, photos: urls.length })
  } catch (e) {
    console.error('[propay/reservation-photos]', e)
    return NextResponse.json({ ok: false })
  }
}
