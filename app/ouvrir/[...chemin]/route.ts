import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// LE SECOURS DES LIENS DES MAILS (10 oct. 2026)
//
// Avec l'app installée sur l'iPhone, un lien /ouvrir/… n'arrive jamais ici :
// iOS ouvre l'app directement. On arrive ici sans l'app, ou depuis un
// ordinateur. On compte le clic (le jeton du mail, rien d'autre), puis on mène
// à l'App Store.
// ─────────────────────────────────────────────────────────────────────────────
const APP_STORE = 'https://apps.apple.com/app/id6760552102'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const jeton = url.searchParams.get('t')
  const ligne = (url.searchParams.get('ligne') ?? '').replace(/[^a-zA-Z_]/g, '').slice(0, 30)
  if (jeton && /^[0-9a-f-]{36}$/.test(jeton)) {
    try {
      const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      await admin.from('bilans_hebdo').update({ clique_le: new Date().toISOString() }).eq('jeton', jeton).is('clique_le', null)
    } catch { /* compter ne doit jamais empêcher d'arriver à l'App Store */ }
  }
  return Response.redirect(`${APP_STORE}${ligne ? `?ct=mail_${ligne}` : ''}`, 302)
}
