import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { adressePourEtape, type EtapeParcours } from '@/lib/adresse-due'
import { assistanteValide, avecPrenom } from '@/lib/equipe'

// ─────────────────────────────────────────────────────────────────────────────
// Le mail « Votre RDV est bien enregistré », envoyé depuis le serveur.
//
// POURQUOI CE GUICHET EXISTE. La page appelait la fonction d'envoi directement
// depuis le navigateur, en lui passant l'adresse exacte de la pro. Deux
// conséquences : l'adresse devait donc être chargée dans le navigateur de
// chaque visiteuse — publiée, en somme — et le moment choisi par la pro
// n'était consulté nulle part.
//
// Ici, le navigateur ne dit plus QUELLE adresse envoyer, seulement pour quelle
// pro. Le serveur relit son choix et décide. C'est la même règle que pour le
// prix, recalculé côté serveur depuis le 5 août : ce qui vient du navigateur
// informe, il ne décide pas.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const FONCTION_ENVOI =
  `${process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co'}/functions/v1/confirmation-booking`

type Corps = {
  pro_id?: string
  cliente_email?: string
  cliente_prenom?: string
  date?: string
  heure?: string
  duree?: string
  prix_total?: number
  skip_rappel_notice?: boolean
  techniques?: { nom: string; specialite: string; prix: number; duree_minutes: number }[]
  /** L'étape du parcours d'où part le mail. Par défaut : la réservation. */
  etape?: EtapeParcours
  /** ÉQUIPE : l'assistante qui reçoit, s'il y en a une. */
  praticienne_id?: string | null
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Corps

    const proId = (body.pro_id ?? '').trim()
    const email = (body.cliente_email ?? '').trim()
    if (!proId || !email) {
      return NextResponse.json({ error: 'parametres_invalides' }, { status: 400 })
    }

    // LE NOM, LA LANGUE, LA DEVISE ET L'ADRESSE VIENNENT DE LA BASE, PAS DU
    // NAVIGATEUR. Un mail au nom d'une autre pro, dans une autre devise, ne
    // doit pas pouvoir se fabriquer depuis la page.
    const { data: pro } = await supabaseAdmin
      .from('profiles')
      .select('prenom, nom, pseudo, adresse, adresse_moment, langue, pays, devise, categorie_autre_nom')
      .eq('id', proId)
      .maybeSingle()

    if (!pro) return NextResponse.json({ error: 'pro_introuvable' }, { status: 404 })

    const adresse = adressePourEtape(
      pro.adresse as string | null,
      pro.adresse_moment as string | null,
      body.etape ?? 'reservation',
    )

    // ÉQUIPE : le mail est au nom de la pro, « · avec Sarah » quand c'est
    // l'assistante qui reçoit. Le prénom est relu en base, jamais recopié.
    let nomPro = (pro.pseudo as string) || `${pro.prenom ?? ''} ${pro.nom ?? ''}`.trim()
    if (typeof body.praticienne_id === 'string' && body.praticienne_id) {
      const elle = await assistanteValide(supabaseAdmin, proId, body.praticienne_id)
      if (elle?.prenom) nomPro = `${nomPro} · ${avecPrenom(pro.langue as string | null, elle.prenom)}`
    }

    const rep = await fetch(FONCTION_ENVOI, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        cliente_email: email,
        cliente_prenom: (body.cliente_prenom ?? '').trim(),
        pro_nom: nomPro,
        langue: pro.langue ?? null,
        pays: pro.pays ?? null,
        date: body.date ?? '',
        heure: body.heure ?? '',
        duree: body.duree ?? '',
        prix_total: body.prix_total ?? 0,
        devise: pro.devise ?? 'EUR',
        skip_rappel_notice: body.skip_rappel_notice === true,
        // Vide plutôt qu'absent : la fonction d'envoi masque tout le bloc
        // adresse quand la chaîne est vide.
        adresse: adresse ?? '',
        techniques: Array.isArray(body.techniques) ? body.techniques : [],
      }),
    })

    if (!rep.ok) {
      console.error('[rdv/mail-confirmation] envoi refusé', rep.status)
      return NextResponse.json({ error: 'envoi_refuse' }, { status: 502 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[rdv/mail-confirmation] erreur', e)
    return NextResponse.json({ error: 'erreur_interne' }, { status: 500 })
  }
}
