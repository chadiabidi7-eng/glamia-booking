import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { prochaineDispo } from '@/lib/prochaine-dispo'

// ─────────────────────────────────────────────────────────────────────────────
// LA PROCHAINE DISPONIBILITÉ, DÈS L'OUVERTURE DE LA PAGE.
//
// Une cliente qui arrive ne sait pas si la pro est prise pour trois semaines ou
// libre demain. Elle doit choisir une prestation, puis ouvrir le calendrier,
// puis chercher — trois écrans avant la seule information qui décide de tout.
// On la lui donne tout de suite : « Prochaine dispo le 18 août à 14h00 ».
//
// LE CALCUL SE FAIT ICI, PAS DANS SON NAVIGATEUR. Balayer quatre-vingt-dix
// jours de créneaux depuis le téléphone, c'est envoyer des milliers d'heures
// pour n'en garder qu'une. Le serveur cherche et ne renvoie que la réponse.
//
// LA DURÉE EST CELLE DE LA PRESTATION LA PLUS COURTE. C'est la seule qui
// réponde vraiment à « est-ce qu'il reste quelque chose ». Prendre une durée
// moyenne annoncerait « complet » à une cliente qui aurait pu obtenir une pose
// simple, et une pro perdrait un rendez-vous pour un calcul.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** Au-delà, on ne dit plus rien : « dans quatre mois » n'aide personne. */
const HORIZON_JOURS = 90

export async function POST(req: NextRequest) {
  try {
    const { pro_id } = await req.json() as { pro_id?: string }
    if (!pro_id || !/^[0-9a-f-]{36}$/i.test(pro_id)) {
      return NextResponse.json({ error: 'pro_invalide' }, { status: 400 })
    }

    const r = await prochaineDispo(supabaseAdmin, pro_id, HORIZON_JOURS)
    if (r === undefined) return NextResponse.json({ error: 'pro_introuvable' }, { status: 404 })
    if (r === null) return NextResponse.json({ date: null, heure: null })
    const { qui, ...reste } = r
    return NextResponse.json(qui ? r : reste)

  } catch (e) {
    console.error('[api/pro/prochaine-dispo]', e)
    return NextResponse.json({ error: 'erreur_interne' }, { status: 500 })
  }
}
