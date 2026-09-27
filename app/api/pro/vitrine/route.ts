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
    .select('avis_actifs, adresse, adresse_publique, adresse_acces, adresse_moment, accueil, reglement, formulaire, formulaire_actif, demander_inspirations, ville, adresse_lat, adresse_lon, bio, photo_couverture, photos_travail, page_couleur, bouton_couleur, bouton_texte, pro_pay_actif, abonnement_actif, trial_ends_at')
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
        .select('auteur, note, texte, photos, prestations, reponse, cree_le, source')
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
      // Un avis repris d'une autre plateforme le dit, sans la nommer.
      importe: !!a.source,
      // La vignette pour la page, la pleine pour l'ouverture.
      photos: ((a.photos ?? []) as string[]).map(url => ({
        vignette: url.includes('-pleine.jpg') ? url.replace('-pleine.jpg', '-vignette.jpg') : url,
        pleine: url,
      })),
    }))
  }

  // ── LA POSITION, FLOUTÉE (3.0) ──
  // Pour le cercle de la carte « Emplacement » : jamais le point exact, un
  // décalage de 150 à 400 m toujours le même pour une même pro. À défaut
  // d'adresse donnée dans la 3.0, celle déduite de son ancienne adresse.
  let position: { lat: number; lon: number } | null =
    typeof profil.adresse_lat === 'number' && typeof profil.adresse_lon === 'number'
      ? { lat: profil.adresse_lat as number, lon: profil.adresse_lon as number } : null
  let villeConnue = ((profil.ville as string) || '').trim() || null
  if (!position || !villeConnue) {
    const { data: loc } = await supabaseAdmin.from('pros_localisees').select('lat, lon, ville').eq('pro_id', proId).maybeSingle()
    if (loc) { position ??= { lat: loc.lat as number, lon: loc.lon as number }; villeConnue ??= loc.ville as string }
  }
  if (position) position = flouter(proId, position.lat, position.lon)

  return NextResponse.json({
    // 3.0 : ce que la pro a mis dans « Personnaliser ma page ». Le texte du
    // bouton est à toutes ; la COULEUR demande Pro (ou Ultra, ou l'essai) —
    // une pro qui arrête retrouve le rose (Chadi, 27 sept. 2026).
    style: {
      page: (profil.pro_pay_actif === true || profil.abonnement_actif === true
        || (!!profil.trial_ends_at && new Date(profil.trial_ends_at as string) > new Date()))
        ? ((profil.page_couleur as string) || null) : null,
      bouton: null,
      texte: ((profil.bouton_texte as string) ?? '').trim() || null,
    },
    // 3.0 : ce que la pro a mis dans « Personnaliser ma page ».
    bio: ((profil.bio as string) ?? '').trim() || null,
    couverture: (profil.photo_couverture as string) || null,
    photos: Array.isArray(profil.photos_travail) ? (profil.photos_travail as string[]).filter(u => typeof u === 'string').slice(0, 15) : [],
    ville: villeConnue,
    position,
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
    // Éteint, on ne renvoie RIEN. Envoyer les questions en laissant le
    // navigateur décider de ne pas les poser, c'est publier le formulaire d'une
    // pro qui l'a justement fermé.
    formulaire: profil.formulaire_actif === false
      ? { nouvelles: [], connues: [] }
      : (profil.formulaire ?? { nouvelles: [], connues: [] }),
    demander_inspirations: profil.demander_inspirations !== false,
  })
}

/** Un décalage de 150 à 400 m, toujours le même pour une même pro (même règle que la recherche). */
function flouter(id: string, lat: number, lon: number): { lat: number; lon: number } {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) }
  const angle = ((h >>> 0) % 360) * Math.PI / 180
  const metres = 150 + ((h >>> 9) % 250)
  const dLat = (metres * Math.cos(angle)) / 111320
  const dLon = (metres * Math.sin(angle)) / (111320 * Math.cos(lat * Math.PI / 180))
  return { lat: Math.round((lat + dLat) * 1e5) / 1e5, lon: Math.round((lon + dLon) * 1e5) / 1e5 }
}
