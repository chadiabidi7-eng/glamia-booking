import { NextRequest } from 'next/server'

// ─────────────────────────────────────────────────────────────────────────────
// L'EXEMPLE D'UN MAIL, TEL QU'IL PART (29 sept. 2026).
//
// /mail-exemple?type=desistement|fidelite&pro=<slug> — ouvert depuis
// « Campagne & Visibilité » dans l'app. Le mail est construit par la fonction
// qui l'envoie (mode aperçu) : même code, donc même texte, mêmes couleurs.
// On l'affiche comme une boîte de réception : expéditeur, objet, puis le mail.
// Rien n'est écrit, rien ne part.
// ─────────────────────────────────────────────────────────────────────────────

const FONCTIONS: Record<string, string> = { desistement: 'desistement-alerte', fidelite: 'fidelite-rappels' }
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co'

const echapper = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export async function GET(req: NextRequest) {
  const fonction = FONCTIONS[req.nextUrl.searchParams.get('type') ?? '']
  const slug = req.nextUrl.searchParams.get('pro') ?? ''
  if (!fonction || !/^[a-z0-9-]{1,80}$/.test(slug)) return new Response('Introuvable', { status: 404 })

  const r = await fetch(`${SUPABASE_URL}/functions/v1/${fonction}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apercu: true, slug }),
    cache: 'no-store',
  }).catch(() => null)
  const d = r ? await r.json().catch(() => null) as { de?: string; objet?: string; html?: string } | null : null
  if (!d?.html) return new Response('Introuvable', { status: 404 })

  const page = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${echapper(d.objet ?? '')}</title>
<style>
  html,body{margin:0;height:100%;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
  body{display:flex;flex-direction:column}
  .entete{padding:14px 16px;border-bottom:1px solid #eee}
  .de{font-size:13px;color:#8A7480}
  .de b{color:#2B1A24;font-weight:600}
  .objet{font-size:16px;font-weight:700;color:#2B1A24;margin-top:4px;line-height:1.3}
  iframe{flex:1;width:100%;border:0}
</style></head>
<body>
  <div class="entete"><div class="de"><b>${echapper(d.de ?? '')}</b></div><div class="objet">${echapper(d.objet ?? '')}</div></div>
  <iframe srcdoc="${echapper(d.html)}" sandbox></iframe>
</body></html>`
  return new Response(page, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}
