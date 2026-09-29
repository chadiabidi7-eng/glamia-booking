import { NextRequest } from 'next/server'

// ─────────────────────────────────────────────────────────────────────────────
// L'EXEMPLE D'UN MAIL, TEL QU'IL PART (29 sept. 2026).
//
// /mail-exemple?type=desistement|fidelite&pro=<slug>, ou ?type=campagne&c=<id> — ouvert depuis
// « Campagne & Visibilité » dans l'app. Le mail est construit par la fonction
// qui l'envoie (mode aperçu) : même code, donc même texte, mêmes couleurs.
// Comme dans Gmail : l'objet, puis le mail. Rien d'autre.
// Rien n'est écrit, rien ne part.
// ─────────────────────────────────────────────────────────────────────────────

const FONCTIONS: Record<string, string> = { desistement: 'desistement-alerte', fidelite: 'fidelite-rappels' }
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co'

const echapper = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') ?? ''
  const slug = req.nextUrl.searchParams.get('pro') ?? ''
  const campagne = req.nextUrl.searchParams.get('c') ?? ''
  // Une campagne de la pro : son brouillon, tel qu'il partira.
  const demande = type === 'campagne'
    ? (/^[0-9a-f-]{36}$/i.test(campagne) ? { fonction: 'campagnes', corps: { action: 'apercu', campagne_id: campagne } } : null)
    : (FONCTIONS[type] && /^[a-z0-9-]{1,80}$/.test(slug) ? { fonction: FONCTIONS[type], corps: { apercu: true, slug } } : null)
  if (!demande) return new Response('Introuvable', { status: 404 })

  const r = await fetch(`${SUPABASE_URL}/functions/v1/${demande.fonction}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(demande.corps),
    cache: 'no-store',
  }).catch(() => null)
  const d = r ? await r.json().catch(() => null) as { de?: string; objet?: string; html?: string } | null : null
  if (!d?.html) return new Response('Introuvable', { status: 404 })

  const page = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${echapper(d.objet ?? '')}</title>
<style>
  html,body{margin:0;height:100%;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
  body{display:flex;flex-direction:column}
  .objet{padding:18px 16px 14px;font-size:20px;font-weight:400;color:#1f1f1f;line-height:1.35}
  iframe{flex:1;width:100%;border:0}
</style></head>
<body>
  <div class="objet">${echapper(d.objet ?? '')}</div>
  <iframe srcdoc="${echapper(d.html)}" sandbox></iframe>
</body></html>`
  return new Response(page, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}
