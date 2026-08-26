import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// ─────────────────────────────────────────────────────────────────────────────
// CE QUI A CASSÉ CHEZ LA CLIENTE.
//
// LE 26 AOÛT 2026, deux clientes de Crazynails sont arrivées au bout de leur
// réservation et ont reçu « Une erreur est survenue. Ouvre la console (F12)
// pour voir le détail. » — sur un téléphone Android, où la touche F12 n'existe
// pas. Elles sont reparties sans rendez-vous.
//
// ON N'A RIEN PU EN FAIRE. Aucune erreur serveur de notre côté : 6 210
// réponses correctes ce jour-là, pas un seul 500. La panne était dans leur
// navigateur, et la vraie erreur est partie dans une console que personne ne
// reverra. Deux clientes perdues, et pas la moindre piste.
//
// Cette route recueille l'erreur réelle au moment où elle se produit. Elle ne
// remplace pas le message montré à la cliente : celui-là doit lui parler à
// elle. Celui-ci parle à nous.
//
// ELLE NE PEUT RIEN CASSER : appelée sans attendre sa réponse, elle avale tout
// et répond toujours oui. Une réservation ne doit jamais échouer parce que
// son signalement d'erreur a échoué.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const court = (v: unknown, max: number) => (v == null ? null : String(v).slice(0, max))

export async function POST(req: NextRequest) {
  try {
    const c = await req.json()
    await supabaseAdmin.from('erreurs_resa').insert({
      pro_id: typeof c.pro_id === 'string' && /^[0-9a-f-]{36}$/i.test(c.pro_id) ? c.pro_id : null,
      slug: court(c.slug, 80),
      etape: court(c.etape, 60),
      message: court(c.message, 500),
      // La pile dit la ligne exacte. Tronquée : au-delà, c'est du bruit.
      pile: court(c.pile, 2000),
      navigateur: court(req.headers.get('user-agent'), 300),
      url: court(c.url, 300),
    })
  } catch (e) {
    console.error('[erreur-resa] signalement non enregistré', e)
  }
  return NextResponse.json({ ok: true })
}
