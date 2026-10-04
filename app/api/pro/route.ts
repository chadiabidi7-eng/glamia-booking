import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { adressePourEtape } from '@/lib/adresse-due'
import { assistantesDe } from '@/lib/equipe'
import { aPro, formuleDe } from '@/lib/formule'
import { resoudreMajorations } from '@/lib/majoration-serveur'

// ─────────────────────────────────────────────────────────────────────────────
// Guichet serveur — la page publique d'une pro : son profil, son catalogue.
//
// La page lisait `profiles` et `prestations` avec la clé publique. La règle
// autorisait tout lire : les 517 profils et les 517 catalogues, d'un coup.
// Et quand le slug ne correspondait à rien, elle TÉLÉCHARGEAIT TOUS LES
// PROFILS pour faire la correspondance dans le navigateur — 611 Ko aujourd'hui,
// près de 6 Mo à 5 000 pros, sur la moindre faute de frappe dans l'adresse.
//
// Le serveur cherche et ne renvoie qu'une pro. Le poids ne dépend plus du
// nombre d'inscrites.
//
// ⚠️ EN CAS D'AMBIGUÏTÉ, ON NE CHOISIT PAS. Le repli reconstitue « prénom-nom »
// ou « pseudo-nom » ; avec la croissance, deux « Marie Martin » finiront par
// exister. L'ancien code prenait la plus ancienne — les clientes de la seconde
// auraient réservé chez la première, sans le moindre message. Se tromper de
// salon est pire que ne rien afficher : on répond « introuvable ».
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Les seuls champs qui sortent. Tout le reste — mail, téléphone, jeton de
// notification, dates d'abonnement — ne quitte pas le serveur.
//
// ⚠️ `adresse` EST LU ICI MAIS NE SORT PAS TEL QUEL. C'est l'adresse exacte :
// pour la plupart des pros, leur domicile. Elle n'est due qu'au moment qu'elles
// ont choisi, et ce guichet répond AVANT toute réservation. Voir le filtre
// juste avant la réponse.
const CHAMPS_PUBLICS = 'id, prenom, nom, pseudo, slug, avatar_url, photo_url, message_accueil, adresse, adresse_moment, instagram, tiktok, snapchat, horaires, horaires_specifiques, creneaux_bloques, planning_variable, fidelite_config, acompte_config, is_pro, devise, langue, pays, timezone, categorie_autre_nom, categorie_autre_icone, categorie_autre_photo, questions_resa'

function normaliser(s: string) {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function POST(req: NextRequest) {
  try {
    const { slug } = await req.json() as { slug?: string }
    if (!slug) return NextResponse.json({ error: 'slug_manquant' }, { status: 400 })

    // 1. Par la colonne slug — indexée, instantanée quel que soit l'effectif.
    const { data: exact } = await supabaseAdmin
      .from('profiles')
      .select(`${CHAMPS_PUBLICS}, abonnement_actif, pro_pay_actif, trial_ends_at, majorations`)
      .eq('slug', slug)
      .order('created_at', { ascending: true })
      .limit(1)

    let pro = exact?.[0] ?? null

    // 2. Repli : reconstitution du slug depuis l'identité. Sert aux liens
    //    partagés avant que la colonne existe, ou sous une autre forme.
    if (!pro) {
      const cible = normaliser(slug)
      const { data: tous } = await supabaseAdmin
        .from('profiles')
        .select(`${CHAMPS_PUBLICS}, abonnement_actif, pro_pay_actif, trial_ends_at, majorations`)
        .order('created_at', { ascending: true })

      const candidats = (tous ?? []).filter(p => {
        const parPrenom = normaliser(`${p.prenom ?? ''}-${p.nom ?? ''}`)
        const parPseudo = p.pseudo ? normaliser(`${p.pseudo}-${p.nom ?? ''}`) : null
        const pseudoSeul = p.pseudo ? normaliser(p.pseudo as string) : null
        return parPrenom === cible || parPseudo === cible || pseudoSeul === cible
      })

      // Deux correspondances : on refuse de trancher.
      if (candidats.length === 1) pro = candidats[0]
      else if (candidats.length > 1) {
        console.warn('[api/pro] ambiguïté sur', slug, '→', candidats.length, 'profils')
      }
    }

    if (!pro) return NextResponse.json({ etat: 'introuvable' })

    // ── LA PAGE EST OUVERTE À TOUTES (3.0, 4 octobre 2026) ──────────────────
    // La 2.x fermait la page des pros sans abonnement ni essai en cours. En 3.0
    // la réservation en ligne fait partie du gratuit, sans limite : la page de
    // chaque pro reste ouverte, abonnée ou non (décision de Chadi).
    //
    // Cette branche du booking ne part en ligne qu'avec l'app 3.0 : tant que
    // la 2.6.1 tourne, `main` continue de fermer les pages en pause.
    const accesActif = true

    // Ces trois champs ne décident plus rien ici, et ne sortent toujours pas.
    const { abonnement_actif: _a, pro_pay_actif: _p, trial_ends_at: _t, ...profil } = pro as Record<string, unknown>
    // La formule sort (pas les trois champs) : la page s'en sert pour la liste
    // d'attente. Le planning libre est une fonction Pro : sans elle, la page
    // retombe sur ses horaires habituels (4 oct. 2026).
    const formule = formuleDe(pro as Record<string, unknown>)
    profil.formule = formule
    if (!aPro(formule)) profil.planning_variable = false
    // Les majorations (Ultra) : fériés résolus en dates, rien si elle n'est pas Ultra.
    profil.majorations = resoudreMajorations(profil.majorations, profil.pays as string | null, formule === 'ultra')

    // L'identifiant sort aussi : le pied de page « Rejoins Glamia » compte les
    // clics par pro, et une page fermée est justement celle qu'une consœur
    // ouvre par curiosité. Il est déjà public dans la réponse normale.
    if (!accesActif) return NextResponse.json({ etat: 'ferme', pro: { id: profil.id, pseudo: profil.pseudo, prenom: profil.prenom, instagram: profil.instagram, tiktok: profil.tiktok, snapchat: profil.snapchat } })

    const { data: prest } = await supabaseAdmin
      .from('prestations')
      .select('data, ordre_categories, categories_perso')
      .eq('pro_id', profil.id as string)
      .maybeSingle()

    // L'ADRESSE EXACTE NE SORT QUE SI LA PRO L'A RENDUE PUBLIQUE.
    //
    // Ce guichet répond à qui ouvre la page, sans rien avoir réservé. Il
    // renvoyait l'adresse exacte à tout le monde, quel que soit le moment
    // choisi — le domicile de 83 pros publié à côté de leurs horaires de
    // présence. Signalé le 29 août 2026 par une pro de Genève.
    //
    // Aux autres moments, la cliente reçoit l'adresse quand elle est due :
    // à la création du rendez-vous (`/api/rdv/creer`) ou la veille, dans le
    // mail de confirmation de présence. Jamais ici.
    profil.adresse = adressePourEtape(profil.adresse as string | null, profil.adresse_moment as string | null, 'page')

    // ÉQUIPE : les assistantes de la pro, avec ce qu'elles font et leurs
    // durées. Vide pour une pro seule — la page ne change alors en rien.
    const equipe = await assistantesDe(supabaseAdmin, profil.id as string)

    return NextResponse.json({
      etat: 'ok',
      pro: profil,
      catalogue: prest?.data ?? null,
      ordreCategories: prest?.ordre_categories ?? null,
      // Les catégories que la pro a créées : leur icône, par nom (3.0).
      categoriesPerso: prest?.categories_perso ?? {},
      equipe,
    })
  } catch (e) {
    console.error('[api/pro] erreur', e)
    return NextResponse.json({ error: 'erreur_interne' }, { status: 500 })
  }
}
