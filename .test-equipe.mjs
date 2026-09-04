import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
const URL = 'https://gdgfgbxoapgmrbttdyac.supabase.co'
const cles = JSON.parse(execSync('npx --no-install supabase projects api-keys --project-ref gdgfgbxoapgmrbttdyac --reveal -o json', { cwd: '/Users/chadiabidi/Desktop/Developer/Glamia-2.6', encoding: 'utf8' }))
const SERVICE = cles.find(k => /service_role|secret/i.test(k.name) && /^sb_secret_|^eyJ/.test(k.api_key))?.api_key
const ANON = cles.find(k => /anon|publishable/i.test(k.name))?.api_key
if (!SERVICE || !ANON) { console.log('cles introuvables', cles.map(k => k.name)); process.exit(1) }
const admin = createClient(URL, SERVICE)

async function sessionDe(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error) throw new Error('generateLink ' + error.message)
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const { data: s, error: e2 } = await client.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'magiclink' })
  if (e2) throw new Error('verifyOtp ' + e2.message)
  return { client, token: s.session.access_token, id: s.user.id }
}

const action = process.argv[2]
const LILA = 'demo.google@glamia.pro'  // compte test Lila Nails
const lila = await sessionDe(LILA)
console.log('pilote :', lila.id)

async function appel(token, body) {
  const r = await fetch(`${URL}/functions/v1/equipe-membre`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', apikey: ANON }, body: JSON.stringify(body) })
  return { status: r.status, body: await r.json().catch(() => null) }
}

if (action === 'creer') {
  const email = process.argv[3]
  console.log(await appel(lila.token, { action: 'creer', prenom: 'Sarah', nom: 'Essai', email, role: process.argv[4] ?? 'collaboratrice' }))
} else if (action === 'etat') {
  const { data } = await admin.from('profiles').select('id, prenom, email, slug, pilote_id, role_equipe, equipe_droits, trial_ends_at, is_pro, equipe_invite_le, equipe_retire_le').eq('pilote_id', lila.id)
  console.log(JSON.stringify(data, null, 1))
  const { data: seq } = await admin.from('sequence_onboarding').select('pro_id').in('pro_id', (data ?? []).map(m => m.id))
  console.log('enrolees dans la sequence :', seq?.length ?? 0)
} else if (action === 'rls') {
  const membreEmail = process.argv[3]
  const m = await sessionDe(membreEmail)
  console.log('membre :', m.id)
  // Le pilote lit les rdv du membre, et le profil du membre
  const a = await lila.client.from('profiles').select('id, prenom, role_equipe').eq('id', m.id)
  console.log('pilote voit le profil du membre :', a.data?.length, a.error?.message ?? '')
  const b = await lila.client.rpc('comptes_agenda'); console.log('comptes_agenda du pilote :', b.data, b.error?.message ?? '')
  // Le membre lit le fichier clientes du pilote (partage), pas ses rdv
  const c = await m.client.from('clientes').select('id').eq('pro_id', lila.id).limit(3)
  console.log('membre voit les clientes du pilote :', c.data?.length, c.error?.message ?? '')
  const d = await m.client.from('rendez_vous').select('id').eq('pro_id', lila.id).limit(3)
  console.log('membre voit les rdv du pilote (attendu 0) :', d.data?.length, d.error?.message ?? '')
  const e = await m.client.from('prestations').select('pro_id').eq('pro_id', lila.id)
  console.log('membre lit le catalogue du pilote :', e.data?.length, e.error?.message ?? '')
  const f = await m.client.rpc('statut_equipe'); console.log('statut_equipe du membre :', JSON.stringify(f.data), f.error?.message ?? '')
  // Le membre ne peut pas ecrire le catalogue du pilote
  const g = await m.client.from('prestations').update({ ordre_categories: ['x'] }).eq('pro_id', lila.id).select('pro_id')
  console.log('membre ecrit le catalogue du pilote (attendu 0) :', g.data?.length, g.error?.message ?? '')
  // Le pilote ecrit un rdv sur l agenda du membre
  const h = await lila.client.from('rendez_vous').insert({ pro_id: m.id, date: '2026-12-01T10:00:00.000Z', duree: 30, statut: 'en_attente', prix: 10, techniques: [] }).select('id')
  console.log('pilote pose un rdv chez le membre :', h.data?.length, h.error?.message ?? '')
  if (h.data?.[0]) await admin.from('rendez_vous').delete().eq('id', h.data[0].id)
} else if (action === 'retirer') {
  console.log(await appel(lila.token, { action: 'retirer', membre_id: process.argv[3] }))
} else if (action === 'nettoyer') {
  const { data } = await admin.from('profiles').select('id, email').or(`pilote_id.eq.${lila.id},email.ilike.%+equipe%`)
  for (const m of data ?? []) { await admin.auth.admin.deleteUser(m.id); console.log('supprime', m.email) }
}
