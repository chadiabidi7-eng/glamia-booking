import { NextRequest, NextResponse } from 'next/server'
import { villesProposees } from '@/lib/recherche-pros'

// Les villes proposées pendant que la cliente tape (recherche glamia.pro/beaute).
export async function GET(req: NextRequest) {
  const q = (new URL(req.url).searchParams.get('q') ?? '').slice(0, 60)
  const villes = await villesProposees(q)
  return NextResponse.json({ villes }, { headers: { 'Cache-Control': 'public, max-age=3600' } })
}
