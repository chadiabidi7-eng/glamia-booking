import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { traduireDans } from '@/lib/i18n'

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

// Le mail porte l'identifiant de l'inscription. La page s'en sert pour savoir
// QUI arrive, et lui éviter de retaper ce qu'elle a déjà donné. L'identifiant
// est un UUID : impossible à deviner, comme les liens de confirmation de RDV.
export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!estId(id)) return NextResponse.json({ error: 'id_invalide' }, { status: 400 })

  const { data: attente } = await supabaseAdmin
    .from('liste_attente')
    .select('pro_id, jour, prenom, telephone, email')
    .eq('id', id)
    .maybeSingle()

  if (!attente) return NextResponse.json({ error: 'inscription_introuvable' }, { status: 404 })

  // Le nom de famille n'est pas demandé à l'inscription, mais la réservation en
  // a besoin. On le retrouve sur sa fiche si elle est déjà venue.
  const { data: cliente } = await supabaseAdmin
    .from('clientes')
    .select('prenom, nom, email')
    .eq('pro_id', attente.pro_id)
    .eq('telephone', attente.telephone)
    .maybeSingle()

  return NextResponse.json({
    prenom: cliente?.prenom || attente.prenom,
    nom: cliente?.nom ?? null,
    telephone: attente.telephone,
    email: attente.email || cliente?.email || null,
  })
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'corps_invalide' }, { status: 400 }) }

  const { pro_id, jour, duree_min, prenom, nom, telephone, email, prestations } = body

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
  const nomNet = typeof nom === 'string' ? nom.trim().slice(0, 80) : ''
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
      nom: nomNet || null,
      telephone: telNet,
      email: (email as string).trim().toLowerCase(),
      prestations: Array.isArray(prestations) ? prestations.slice(0, 20) : null,
      prevenue_le: null,
    }, { onConflict: 'pro_id,jour,telephone' })

  if (error) {
    console.error('[liste-attente] insertion', error.message)
    return NextResponse.json({ error: 'enregistrement_impossible' }, { status: 500 })
  }

  // Push à la pro. Une inscription est un signal commercial : quelqu'un veut
  // venir et ne peut pas. Elle peut ouvrir une heure ou rappeler directement.
  // L'échec de la notification n'invalide jamais l'inscription, qui est déjà
  // enregistrée : on log et on renvoie ok.
  try {
    const { data: pro } = await supabaseAdmin
      .from('profiles').select('push_token, langue').eq('id', pro_id).maybeSingle()

    if (pro?.push_token) {
      const [a, m, j] = (jour as string).split('-').map(Number)
      const jourLisible = new Date(Date.UTC(a, m - 1, j)).toLocaleDateString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
      })
      const h = Math.floor(duree / 60)
      const min = Math.round(duree) % 60
      const dureeLisible = h === 0 ? `${min} min` : min === 0 ? `${h}h` : `${h}h${String(min).padStart(2, '0')}`

      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: pro.push_token,
          title: traduireDans(pro?.langue, 'notif.attenteTitre'),
          body: traduireDans(pro?.langue, 'notif.attente', { nom: [prenomNet, nomNet].filter(Boolean).join(' '), jour: jourLisible, duree: dureeLisible }),
        }),
      })
    }
  } catch (e) {
    console.error('[liste-attente] push', e)
  }

  return NextResponse.json({ ok: true })
}
