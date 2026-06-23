import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'glamia-admin-2026'

export async function GET(req: NextRequest) {
  const pwd = req.headers.get('x-admin-password')
  if (pwd !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const now = new Date().toISOString()
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()

  // Fetch all profiles with auth data
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id, prenom, nom, email, pseudo, is_pro, trial_ends_at, created_at, specialites, telephone, slug, adresse')
    .order('created_at', { ascending: false })

  // Fetch auth users for last_sign_in_at
  const { data: { users: authUsers } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })

  // Fetch counts per pro
  const { data: clienteCounts } = await supabaseAdmin.rpc('admin_cliente_counts')
  const { data: rdvCounts } = await supabaseAdmin.rpc('admin_rdv_counts')

  // Build auth map
  const authMap = new Map<string, { last_sign_in_at: string | null, email_confirmed_at: string | null }>()
  for (const u of authUsers ?? []) {
    authMap.set(u.id, {
      last_sign_in_at: u.last_sign_in_at ?? null,
      email_confirmed_at: u.email_confirmed_at ?? null,
    })
  }

  // Build count maps
  const clienteMap = new Map<string, number>()
  for (const c of clienteCounts ?? []) clienteMap.set(c.pro_id, Number(c.count))
  const rdvMap = new Map<string, number>()
  for (const r of rdvCounts ?? []) rdvMap.set(r.pro_id, Number(r.count))

  // Exclude test accounts
  const TEST_EMAILS = [
    'chadi.abidi7@gmail.com',
    'review@glamia.app',
    'eden.tiraboschi@gmail.com',
    'aureliiie.c@gmail.com',
  ]

  const users = (profiles ?? [])
    .filter(p => !TEST_EMAILS.includes(p.email ?? ''))
    .map(p => {
      const auth = authMap.get(p.id)
      const trialEnd = p.trial_ends_at ? new Date(p.trial_ends_at) : null
      let statut: 'pro' | 'essai' | 'expire'
      if (p.is_pro && (!trialEnd || trialEnd > new Date('2030-01-01'))) {
        statut = 'pro'
      } else if (trialEnd && new Date(trialEnd) > new Date()) {
        statut = 'essai'
      } else {
        statut = 'expire'
      }

      return {
        id: p.id,
        prenom: p.prenom,
        nom: p.nom,
        email: p.email,
        pseudo: p.pseudo,
        telephone: p.telephone,
        slug: p.slug,
        adresse: p.adresse,
        is_pro: p.is_pro,
        trial_ends_at: p.trial_ends_at,
        created_at: p.created_at,
        last_sign_in_at: auth?.last_sign_in_at ?? null,
        nb_clientes: clienteMap.get(p.id) ?? 0,
        nb_rdv: rdvMap.get(p.id) ?? 0,
        statut,
      }
    })

  // Stats
  const total = users.length
  const newToday = users.filter(u => u.created_at && u.created_at >= todayStart.toISOString()).length
  const newThisWeek = users.filter(u => u.created_at && u.created_at >= weekAgo).length
  const abonnees = users.filter(u => u.statut === 'pro').length
  const enEssai = users.filter(u => u.statut === 'essai').length
  const expirees = users.filter(u => u.statut === 'expire').length
  const totalRdv = users.reduce((s, u) => s + u.nb_rdv, 0)
  const totalClientes = users.reduce((s, u) => s + u.nb_clientes, 0)

  return NextResponse.json({
    stats: { total, newToday, newThisWeek, abonnees, enEssai, expirees, totalRdv, totalClientes },
    users,
  })
}
