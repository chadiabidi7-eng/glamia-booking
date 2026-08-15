import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// ─────────────────────────────────────────────────────────────────────────────
// LA VITRINE D'UNE PRO — tout ce que sa page montre avant de réserver.
//
// UNE SEULE REQUÊTE. Les avis, la note, les conditions d'accueil, l'adresse :
// autant d'aller-retours séparés auraient fait une page qui se construit par
// morceaux sous les yeux de la cliente.
//
// LES AVIS NE SE LISENT PAS AVEC LA CLÉ PUBLIQUE : la règle de sécurité les
// réserve à la pro. C'est donc ici, côté serveur, qu'on les sort — et on ne
// renvoie que ce qui s'affiche : le prénom abrégé, la note, le texte, les
// photos, la réponse de la pro. Jamais l'identifiant de la cliente, jamais
// celui du rendez-vous.
//
// LES PHOTOS PARTENT EN VIGNETTE. Une page ouverte cent fois par jour qui
// enverrait la photo pleine à chaque fois, c'est de la bande passante payée
// pour des images affichées grandes comme un timbre. La pleine ne part que si
// la cliente touche pour l'ouvrir.
//
// LA VISITE EST COMPTÉE ICI, une fois par ouverture de page. Le compteur ne
// garde qu'un nombre par jour et par pro : aucune adresse, aucun mouchard,
// rien qui identifie la visiteuse.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** Ce qu'on montre : assez pour convaincre, pas de quoi noyer la page. */
const AVIS_MAX = 6

export async function POST(req: NextRequest) {
  let body: { pro_id?: unknown; compter?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const proId = body.pro_id
  if (typeof proId !== 'string' || !/^[0-9a-f-]{36}$/i.test(proId)) {
    return NextResponse.json({ error: 'pro_invalide' }, { status: 400 })
  }

  const { data: profil } = await supabaseAdmin
    .from('profiles')
    .select('avis_actifs, adresse, adresse_publique, adresse_acces, adresse_moment, accueil, reglement, formulaire, demander_inspirations')
    .eq('id', proId)
    .maybeSingle()

  if (!profil) return NextResponse.json({ error: 'pro_introuvable' }, { status: 404 })

  // ── LA VISITE ──
  // Une seule fois par ouverture, décidée par le navigateur : recharger la
  // page ne doit pas gonfler le chiffre.
  if (body.compter === true) {
    try {
      await supabaseAdmin.rpc('compter_visite', { p_pro: proId })
    } catch (e) {
      // Un compteur qui échoue ne doit jamais empêcher une réservation.
      console.error('[api/pro/vitrine] visite non comptée :', e)
    }
  }

  // ── LES AVIS ──
  const avisActifs = profil.avis_actifs !== false
  let note: number | null = null
  let nbAvis = 0
  let avis: unknown[] = []

  if (avisActifs) {
    const [{ data: moyenne }, { data: derniers }] = await Promise.all([
      supabaseAdmin.from('avis_note_par_pro').select('note, nombre').eq('pro_id', proId).maybeSingle(),
      supabaseAdmin.from('avis_clientes')
        .select('auteur, note, texte, photos, prestations, reponse, cree_le')
        .eq('pro_id', proId).is('retire_le', null)
        .order('cree_le', { ascending: false })
        .limit(AVIS_MAX),
    ])
    note = (moyenne?.note as number) ?? null
    nbAvis = (moyenne?.nombre as number) ?? 0
    avis = (derniers ?? []).map(a => ({
      auteur: a.auteur,
      note: a.note,
      texte: a.texte,
      prestations: a.prestations,
      reponse: a.reponse,
      cree_le: a.cree_le,
      // La vignette pour la page, la pleine pour l'ouverture.
      photos: ((a.photos ?? []) as string[]).map(url => ({
        vignette: url.includes('-pleine.jpg') ? url.replace('-pleine.jpg', '-vignette.jpg') : url,
        pleine: url,
      })),
    }))
  }

  return NextResponse.json({
    avis_actifs: avisActifs,
    note,
    nb_avis: nbAvis,
    avis,
    // L'adresse : on ne renvoie JAMAIS l'exacte à ce stade. Elle n'est due
    // qu'au moment choisi par la pro, et ce moment n'est pas maintenant —
    // sauf si elle a choisi de la rendre publique.
    adresse: {
      moment: (profil.adresse_moment as string) ?? 'reservation',
      ville: (profil.adresse_publique as string) ?? null,
      acces: (profil.adresse_acces as string) ?? null,
      exacte: profil.adresse_moment === 'page' ? ((profil.adresse as string) ?? null) : null,
    },
    accueil: (profil.accueil ?? {}) as Record<string, boolean | null>,
    reglement: (profil.reglement as string) ?? null,
    // Les questions AVEC ce qui bloque et le message de refus : c'est ce qui
    // permet d'arrêter la cliente tout de suite plutôt qu'après cinq étapes.
    // Le serveur revérifiera de toute façon à la création du rendez-vous —
    // l'affichage informe, il ne décide pas.
    formulaire: profil.formulaire ?? { nouvelles: [], connues: [] },
    demander_inspirations: profil.demander_inspirations !== false,
  })
}
