import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

// ─────────────────────────────────────────────────────────────────────────────
// NE PLUS RECEVOIR LES MAILS DE DÉSISTEMENT.
//
// Le lien du bas de ces mails arrive ici. Ouvrir la page ne suffit PAS à se
// désinscrire : les messageries ouvrent les liens toutes seules pour les
// vérifier, et chaque cliente se retrouverait désinscrite sans l'avoir voulu.
// La page montre un bouton ; c'est lui qui désinscrit. Le bouton « Se
// désabonner » de Gmail passe par le même chemin (appel direct, sans page).
//
// Le lien ne porte que l'identifiant de l'envoi : impossible à deviner, et il
// ne désinscrit que la cliente à qui ce mail a été écrit, chez cette pro.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const estId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)

const TEXTES = {
  fr: { question: (p: string) => `Ne plus être prévenue des places libres chez ${p} ?`, bouton: 'Ne plus recevoir ces messages', fait: (p: string) => `C'est noté : vous ne recevrez plus ces messages de ${p}.`, inconnu: 'Ce lien ne fonctionne plus.' },
  en: { question: (p: string) => `Stop hearing about free slots with ${p}?`, bouton: 'Stop these messages', fait: (p: string) => `Done: you won't receive these messages from ${p} anymore.`, inconnu: 'This link no longer works.' },
  es: { question: (p: string) => `¿Dejar de recibir avisos de huecos libres con ${p}?`, bouton: 'No recibir más estos mensajes', fait: (p: string) => `Hecho: ya no recibirás estos mensajes de ${p}.`, inconnu: 'Este enlace ya no funciona.' },
} as const
type Langue = keyof typeof TEXTES

const echapper = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function page(langue: Langue, contenu: string, statut = 200) {
  return new Response(`<!DOCTYPE html><html lang="${langue}"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><meta name="robots" content="noindex" /><title>Glamia</title></head>
<body style="margin:0;background:#FAF7F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:440px;margin:60px 16px;margin-left:auto;margin-right:auto;padding:28px 24px;background:#fff;border-radius:16px;box-shadow:0 2px 12px rgba(0,0,0,0.06);text-align:center;color:#1f2937;">${contenu}</div>
</body></html>`, { status: statut, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

async function lireEnvoi(id: string | null) {
  if (!estId(id)) return null
  const { data: envoi } = await supabaseAdmin.from('desistement_envois').select('cliente_id, pro_id').eq('id', id).maybeSingle()
  if (!envoi) return null
  const { data: pro } = await supabaseAdmin.from('profiles').select('pseudo, prenom, langue').eq('id', envoi.pro_id).maybeSingle()
  const langue: Langue = pro?.langue === 'en' || pro?.langue === 'es' ? pro.langue : 'fr'
  return { envoi, langue, nomPro: echapper((pro?.pseudo || pro?.prenom || 'Glamia') as string) }
}

export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('e')
  const lu = await lireEnvoi(id)
  if (!lu) return page('fr', `<p>${TEXTES.fr.inconnu}</p>`, 404)
  const L = TEXTES[lu.langue]
  return page(lu.langue, `
    <p style="font-size:16px;line-height:1.6;margin:0 0 20px;">${L.question(lu.nomPro)}</p>
    <form method="POST" action="/desinscription?e=${id}">
      <button type="submit" style="border:0;background:#C2779E;color:#fff;font-size:15px;font-weight:700;padding:13px 26px;border-radius:12px;cursor:pointer;">${L.bouton}</button>
    </form>`)
}

export async function POST(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('e')
  const lu = await lireEnvoi(id)
  if (!lu) return page('fr', `<p>${TEXTES.fr.inconnu}</p>`, 404)
  await supabaseAdmin.from('clientes').update({ desistement_refuse_le: new Date().toISOString() })
    .eq('id', lu.envoi.cliente_id).is('desistement_refuse_le', null)
  return page(lu.langue, `<p style="font-size:16px;line-height:1.6;margin:0;">${TEXTES[lu.langue].fait(lu.nomPro)}</p>`)
}
