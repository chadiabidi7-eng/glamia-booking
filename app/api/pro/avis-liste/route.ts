import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// ─────────────────────────────────────────────────────────────────────────────
// TOUS LES AVIS D'UNE PRO, PAR PAQUETS DE 20 (3.0 — « Voir tout » de la vitrine)
//
// La vitrine n'en reçoit que quelques-uns (ils défilent un par un). « Voir
// tout » vient ici, vingt à la fois : une pro à cent avis ne fait pas charger
// cent avis d'un coup. Mêmes règles que la vitrine : rien si elle a masqué ses
// avis, et seulement ce qui s'affiche — jamais qui est la cliente.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const PAQUET = 20

export async function POST(req: NextRequest) {
  let body: { pro_id?: unknown; depuis?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }) }
  const proId = body.pro_id
  if (typeof proId !== 'string' || !/^[0-9a-f-]{36}$/i.test(proId)) return NextResponse.json({ error: 'pro_invalide' }, { status: 400 })
  const depuis = Math.max(0, Math.min(5000, Number(body.depuis) || 0))

  const { data: profil } = await supabaseAdmin.from('profiles').select('avis_actifs').eq('id', proId).maybeSingle()
  if (!profil || profil.avis_actifs === false) return NextResponse.json({ avis: [], suite: false })

  const { data } = await supabaseAdmin.from('avis_clientes')
    .select('auteur, note, texte, photos, prestations, reponse, cree_le, source')
    .eq('pro_id', proId).is('retire_le', null)
    .order('cree_le', { ascending: false })
    .range(depuis, depuis + PAQUET)

  const lignes = data ?? []
  return NextResponse.json({
    suite: lignes.length > PAQUET,
    avis: lignes.slice(0, PAQUET).map(a => ({
      auteur: a.auteur, note: a.note, texte: a.texte, prestations: a.prestations, reponse: a.reponse,
      cree_le: a.cree_le, importe: !!a.source,
      photos: ((a.photos ?? []) as string[]).map(url => ({
        vignette: url.includes('-pleine.jpg') ? url.replace('-pleine.jpg', '-vignette.jpg') : url,
        pleine: url,
      })),
    })),
  })
}
