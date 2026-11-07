import { NextRequest, NextResponse } from 'next/server'
import { ambassadriceDuCode, configActive, normaliserCode } from '@/lib/parrainage-serveur'

// ─────────────────────────────────────────────────────────────────────────────
// Le code de parrainage qu'une nouvelle cliente vient de taper (7 nov. 2026).
// GET ?pro=… : le programme est-il allumé, et que gagne l'amie ?
// POST {pro_id, code} : le code existe-t-il chez cette pro ? On ne renvoie que
// le prénom de l'ambassadrice (« offert par Sarah ») et le cadeau.
// La vraie remise est recalculée à la création du rendez-vous.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const pro = req.nextUrl.searchParams.get('pro') ?? ''
  if (!pro) return NextResponse.json({ actif: false })
  const c = await configActive(pro)
  return NextResponse.json(c ? { actif: true, filleule: c.filleule, ambassadrice: c.ambassadrice } : { actif: false })
}

export async function POST(req: NextRequest) {
  try {
    const { pro_id, code } = (await req.json()) as { pro_id?: string; code?: string }
    const propre = normaliserCode(code)
    if (!pro_id || propre.length < 4) return NextResponse.json({ ok: false })
    const config = await configActive(pro_id)
    if (!config) return NextResponse.json({ ok: false })
    const amb = await ambassadriceDuCode(pro_id, propre)
    if (!amb) return NextResponse.json({ ok: false })
    return NextResponse.json({ ok: true, code: propre, prenom: amb.prenom ?? '', gain: config.filleule })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
