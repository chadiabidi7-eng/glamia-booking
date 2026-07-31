import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// ─────────────────────────────────────────────────────────────────────────────
// Inscription d'une cliente sur la liste d'attente d'une journée complète.
//
// Guichet serveur, comme les cinq autres : la table `liste_attente` est fermée
// à la clé publique. Elle contient des coordonnées de personnes qui ne sont pas
// encore clientes — elle n'a rien à faire à portée du navigateur.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const estId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)
const estJour = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const estEmail = (v: unknown): v is string =>
  typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'corps_invalide' }, { status: 400 }) }

  const { pro_id, jour, duree_min, prenom, telephone, email, prestations } = body

  if (!estId(pro_id)) return NextResponse.json({ error: 'pro_invalide' }, { status: 400 })
  if (!estJour(jour)) return NextResponse.json({ error: 'jour_invalide' }, { status: 400 })

  const duree = Number(duree_min)
  if (!Number.isFinite(duree) || duree < 5 || duree > 600) {
    return NextResponse.json({ error: 'duree_invalide' }, { status: 400 })
  }

  // Le jour ne peut pas être dans le passé : on n'attend pas une place hier.
  const aujourdhui = new Date().toISOString().slice(0, 10)
  if (jour < aujourdhui) return NextResponse.json({ error: 'jour_passe' }, { status: 400 })

  const prenomNet = typeof prenom === 'string' ? prenom.trim().slice(0, 80) : ''
  const telNet = typeof telephone === 'string' ? telephone.replace(/[\s\-.()]/g, '').slice(0, 25) : ''

  if (prenomNet.length < 2) return NextResponse.json({ error: 'prenom_requis' }, { status: 400 })
  if (telNet.length < 6) return NextResponse.json({ error: 'telephone_requis' }, { status: 400 })
  if (!estEmail(email)) return NextResponse.json({ error: 'email_requis' }, { status: 400 })

  // Une seule inscription par personne et par jour : se réinscrire met à jour
  // la durée et les coordonnées plutôt que de créer un doublon qui recevrait
  // deux fois le même mail.
  const { error } = await supabaseAdmin
    .from('liste_attente')
    .upsert({
      pro_id,
      jour,
      duree_min: Math.round(duree),
      prenom: prenomNet,
      telephone: telNet,
      email: (email as string).trim().toLowerCase(),
      prestations: Array.isArray(prestations) ? prestations.slice(0, 20) : null,
      prevenue_le: null,
    }, { onConflict: 'pro_id,jour,telephone' })

  if (error) {
    console.error('[liste-attente] insertion', error.message)
    return NextResponse.json({ error: 'enregistrement_impossible' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
