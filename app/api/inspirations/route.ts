import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { tr, type Langue } from '@/lib/i18n'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const MAX_PHOTOS = 3
const MAX_OCTETS = 4 * 1024 * 1024      // 4 Mo max par photo (décodée)
const DELAI_MAX_MS = 15 * 60 * 1000     // le RDV doit avoir été créé il y a moins de 15 min (anti-abus)

function normalizePhone(tel: string): string {
  let n = tel.replace(/[\s\-\.\(\)]/g, '')
  if (n.startsWith('+33')) n = '0' + n.slice(3)
  if (n.startsWith('0033')) n = '0' + n.slice(4)
  return n
}

// Date et heure du RDV dans la langue de la pro — « mercredi 15 juillet » / « Wednesday 15 July »
// + « 14:30 » / « 2:30 PM » (les dates RDV sont stockées en heure murale, lues en UTC)
function dateHeureRdv(iso: string, langue: Langue): { date: string; heure: string } {
  const d = new Date(iso)
  const date = d.toLocaleDateString(langue === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
  const h = d.getUTCHours()
  const mn = String(d.getUTCMinutes()).padStart(2, '0')
  const heure = langue === 'en'
    ? `${h % 12 || 12}:${mn} ${h < 12 ? 'AM' : 'PM'}`
    : `${String(h).padStart(2, '0')}:${mn}`
  return { date, heure }
}

// POST /api/inspirations — Photos d'inspiration de la cliente pour un RDV
// Body : { rdv_id, photos }                       → juste après la création (fenêtre 15 min)
//   ou : { token, photos }                        → via le lien de gestion du RDV
//   ou : { rdv_id, pro_id, telephone, photos }    → via « Ajouter mes inspirations » (page de résa)
// (data URLs base64 image/jpeg ; 3 photos max au total, ajouts cumulés)
// Les deux derniers cas déclenchent une push à la pro.
export async function POST(req: NextRequest) {
  let body: { rdv_id?: unknown; token?: unknown; pro_id?: unknown; telephone?: unknown; photos?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const rdvId = body.rdv_id
  const token = body.token
  const proId = body.pro_id
  const telephone = body.telephone
  const photos = body.photos

  const rdvIdValide = typeof rdvId === 'string' && /^[0-9a-f-]{36}$/i.test(rdvId)
  const parToken = typeof token === 'string' && token.length >= 16 && token.length <= 128
  const parTelephone = rdvIdValide
    && typeof proId === 'string' && /^[0-9a-f-]{36}$/i.test(proId)
    && typeof telephone === 'string' && telephone.replace(/\s/g, '').length >= 8
  const parRdvId = rdvIdValide && !parTelephone
  if (!parRdvId && !parToken && !parTelephone) {
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
  // Par téléphone (page de résa) : le numéro doit correspondre à la cliente du RDV.
  const requete = supabaseAdmin
    .from('rendez_vous')
    .select('id, date, statut, created_at, inspirations, token_expiration, pro_id, cliente_id')
  const { data: rdv, error: rdvErr } = parToken
    ? await requete.eq('token_confirmation', token as string).maybeSingle()
    : await requete.eq('id', rdvId as string).maybeSingle()

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
  if (parTelephone) {
    if (rdv.pro_id !== proId) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    const { data: cliente } = await supabaseAdmin
      .from('clientes')
      .select('telephone')
      .eq('id', rdv.cliente_id)
      .maybeSingle()
    if (!cliente?.telephone || normalizePhone(cliente.telephone) !== normalizePhone(telephone as string)) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
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

  // Ajout après coup (token ou téléphone) → prévenir la pro par push.
  // Échec non bloquant : les photos sont déjà enregistrées.
  if (parToken || parTelephone) {
    try {
      const [{ data: pro }, { data: cli }] = await Promise.all([
        supabaseAdmin.from('profiles').select('push_token, langue').eq('id', rdv.pro_id).maybeSingle(),
        supabaseAdmin.from('clientes').select('prenom, nom').eq('id', rdv.cliente_id).maybeSingle(),
      ])
      if (pro?.push_token) {
        // Push dans la langue de la PRO (même logique que les mails)
        const langue: Langue = pro.langue === 'en' ? 'en' : 'fr'
        const nomCliente = [cli?.prenom, cli?.nom].filter(Boolean).join(' ') || tr(langue, 'inspi.taCliente')
        const { date, heure } = dateHeureRdv(rdv.date, langue)
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: pro.push_token,
            title: tr(langue, 'inspi.pushTitre'),
            body: tr(langue, 'inspi.pushCorps', { nom: nomCliente, count: urls.length, date, heure }),
          }),
        })
      }
    } catch (e) {
      console.error('[api/inspirations] Push pro non envoyée:', e)
    }
  }

  return NextResponse.json({ success: true, urls, inspirations: toutes })
}
