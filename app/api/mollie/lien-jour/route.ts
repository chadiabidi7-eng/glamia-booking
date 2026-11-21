// ─────────────────────────────────────────────────────────────────────────────
// LE LIEN DE PAIEMENT DU JOUR ENVOYÉ PAR LA PRO (3.3.0, 21 nov. 2026)
//
// La page /regler/<jeton> passe par ici, jamais directement par le serveur
// Mollie : la clé partagée ne quitte pas le serveur du site.
//   (page Glamia du lien du jour, même chemin que le lien d'acompte — Chadi, 21 nov. 2026)
//   POST { action: 'lire', jeton } → ce que la page affiche (+ la couleur de la pro)
//   POST { action: 'payer', jeton, cle, politique_texte, langue } → { url } de Mollie
// L'heure d'acceptation de la politique est celle du serveur, pas du téléphone.
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'
import { SECRET_MOLLIE, SUPABASE, supabaseAdmin } from '@/lib/mollie-reservation'
import { couleurValide } from '@/lib/teinte'
import { enregistrerPreuve } from '@/lib/preuve-acceptation'

async function appeler(corps: Record<string, unknown>) {
  const r = await fetch(`${SUPABASE}/functions/v1/mollie-lien-jour`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET_MOLLIE}` },
    body: JSON.stringify(corps),
    signal: AbortSignal.timeout(25_000),
  })
  return { status: r.status, d: await r.json().catch(() => ({})) as Record<string, unknown> }
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!b || typeof b.jeton !== 'string' || !/^[A-Za-z0-9]{32,64}$/.test(b.jeton)) return NextResponse.json({ error: 'inconnu' }, { status: 404 })
  if (!SECRET_MOLLIE) return NextResponse.json({ error: 'ferme' }, { status: 503 })
  try {
    if (b.action === 'lire') {
      const { status, d } = await appeler({ action: 'lire', jeton: b.jeton })
      if (status !== 200) return NextResponse.json({ error: d.error ?? 'inconnu' }, { status })
      let couleur: string | null = null
      if (typeof d.slug === 'string') {
        const { data } = await supabaseAdmin.from('profiles').select('page_couleur').eq('slug', d.slug).maybeSingle()
        couleur = couleurValide((data as { page_couleur?: unknown } | null)?.page_couleur)
      }
      return NextResponse.json({ ...d, couleur })
    }
    if (b.action === 'payer') {
      const accepteeLe = new Date().toISOString()
      const { status, d } = await appeler({
        action: 'payer', jeton: b.jeton, cle: b.cle, langue: b.langue,
        politique_texte: b.politique_texte, politique_acceptee_le: accepteeLe,
      })
      if (status !== 200 || typeof d.url !== 'string') return NextResponse.json({ error: String(d.error ?? 'mollie') }, { status: status >= 400 ? status : 502 })
      // La preuve d'acceptation : ce qu'elle a vu, d'où, avec quel appareil (21 nov. 2026).
      await enregistrerPreuve(req, { paiementId: d.paiement, page: 'lien_jour', langue: b.langue, encadre: b.encadre, caseTexte: b.politique_texte, accepteeLe })
      return NextResponse.json({ url: d.url })
    }
    return NextResponse.json({ error: 'action' }, { status: 400 })
  } catch (e) {
    console.error('[mollie/lien-jour]', e)
    return NextResponse.json({ error: 'mollie' }, { status: 502 })
  }
}
