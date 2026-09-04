import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { contexteDe, catalogueDe, membresDuSalon, destinatairesPush } from '@/lib/equipe'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  const { proId, title, body } = await req.json()

  if (!proId || !title || !body) {
    return NextResponse.json({ error: 'proId, title et body requis' }, { status: 400 })
  }

  // ÉQUIPE : la praticienne est prévenue, et son pilote aussi quand il a la
  // visibilité sur son agenda. Une pro seule : elle, comme avant.
  const ctx = await contexteDe(supabaseAdmin, proId)
  const ids = await destinatairesPush(supabaseAdmin, ctx)
  const { data: lignes, error } = await supabaseAdmin
    .from('profiles')
    .select('id, push_token')
    .in('id', ids)

  if (error) {
    console.error('[api/push-notify] Erreur lecture profil:', error)
    return NextResponse.json({ error: 'profile_read_failed' }, { status: 500 })
  }

  const jetons = (lignes ?? []).map(l => l.push_token as string | null).filter((j): j is string => !!j)
  if (jetons.length === 0) {
    console.warn('[api/push-notify] Push token absent pour pro_id:', proId)
    return NextResponse.json({ sent: false, reason: 'no_push_token' })
  }

  try {
    const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jetons.map(to => ({ to, title, body }))),
    })

    const pushBody = await pushRes.text()
    console.log('[api/push-notify] Push envoyé:', pushRes.status, pushBody)

    // ── LE JOURNAL DES ENVOIS ──────────────────────────────────────────────
    // Une ligne par notification partie. Sans elle, impossible de vérifier
    // qu'à chaque rendez-vous correspond bien une notification à la pro — et
    // c'est exactement ce contrôle qui a manqué huit jours sur les cartes
    // refusées. L'écriture ne doit JAMAIS faire échouer l'envoi : une
    // notification partie et non notée vaut mieux qu'une notification bloquée
    // par sa comptabilité.
    // Un refus de la base ne LÈVE PAS d'erreur, il la RENVOIE : sans cette
    // lecture, un journal qui n'enregistre plus rien passerait inaperçu — et
    // un registre auquel on ne peut pas se fier est pire que pas de registre.
    if (pushRes.ok) {
      try {
        const { error: erreurJournal } = await supabaseAdmin.from('envois_journal')
          .insert({ pro_id: proId, type: 'notif_nouveau_rdv' })
        if (erreurJournal) console.error('[api/push-notify] envoi non noté', erreurJournal.message)
      } catch (e) {
        console.error('[api/push-notify] envoi non noté', e)
      }
    }

    return NextResponse.json({ sent: true, status: pushRes.status })
  } catch (e) {
    console.error('[api/push-notify] Erreur push:', e)
    return NextResponse.json({ sent: false, reason: 'push_failed' }, { status: 500 })
  }
}
