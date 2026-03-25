import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  const { proId, title, body } = await req.json()

  if (!proId || !title || !body) {
    return NextResponse.json({ error: 'proId, title et body requis' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('push_token')
    .eq('id', proId)
    .maybeSingle()

  if (error) {
    console.error('[api/push-notify] Erreur lecture profil:', error)
    return NextResponse.json({ error: 'profile_read_failed' }, { status: 500 })
  }

  const pushToken = data?.push_token
  if (!pushToken) {
    console.warn('[api/push-notify] Push token absent pour pro_id:', proId)
    return NextResponse.json({ sent: false, reason: 'no_push_token' })
  }

  try {
    const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: pushToken, title, body }),
    })

    const pushBody = await pushRes.text()
    console.log('[api/push-notify] Push envoyé:', pushRes.status, pushBody)

    return NextResponse.json({ sent: true, status: pushRes.status })
  } catch (e) {
    console.error('[api/push-notify] Erreur push:', e)
    return NextResponse.json({ sent: false, reason: 'push_failed' }, { status: 500 })
  }
}
