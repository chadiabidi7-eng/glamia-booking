import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

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
const CHAMPS_PUBLICS = 'id, prenom, nom, pseudo, slug, avatar_url, photo_url, message_accueil, adresse, instagram, tiktok, snapchat, horaires, horaires_specifiques, creneaux_bloques, planning_variable, fidelite_config, acompte_config, is_pro, devise, langue, timezone, categorie_autre_nom'

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
      .select(`${CHAMPS_PUBLICS}, abonnement_actif, pro_pay_actif, trial_ends_at`)
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
        .select(`${CHAMPS_PUBLICS}, abonnement_actif, pro_pay_actif, trial_ends_at`)
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

    // La page ne s'ouvre que si l'abonnement est actif ou l'essai en cours.
    // Ne jamais se fier à `is_pro` seul : il n'est synchronisé qu'au lancement
    // de l'app, les expirées jamais revenues le gardent à true.
    //
    // GLAMIA PRO PAY OUVRE LA PAGE À LUI SEUL. C'est l'abonnement le plus cher —
    // payer 19,99 € ne peut pas donner moins que payer 14,99 €. En théorie le
    // webhook lève `abonnement_actif` en même temps que `pro_pay_actif`, donc
    // cette deuxième condition ne sert jamais. Mais le jour où les deux
    // divergent — resynchro ratée, événement perdu, correction à la main —
    // c'est une abonnée payante dont la page de réservation se ferme, et elle
    // perd des rendez-vous sans comprendre pourquoi. Constaté le 5 août 2026
    // sur le compte de développement : pro_pay_actif à vrai, abonnement_actif
    // à faux. Deux verrous valent mieux qu'un sur la porte qui fait vivre les
    // pros.
    const accesActif = pro.abonnement_actif === true
      || pro.pro_pay_actif === true
      || (pro.trial_ends_at && new Date(pro.trial_ends_at as string) > new Date())

    // Ces trois champs servaient à décider ici : ils ne sortent pas.
    const { abonnement_actif: _a, pro_pay_actif: _p, trial_ends_at: _t, ...profil } = pro as Record<string, unknown>

    if (!accesActif) return NextResponse.json({ etat: 'ferme', pro: { pseudo: profil.pseudo, prenom: profil.prenom, instagram: profil.instagram, tiktok: profil.tiktok, snapchat: profil.snapchat } })

    const { data: prest } = await supabaseAdmin
      .from('prestations')
      .select('data, ordre_categories')
      .eq('pro_id', profil.id as string)
      .maybeSingle()

    return NextResponse.json({
      etat: 'ok',
      pro: profil,
      catalogue: prest?.data ?? null,
      ordreCategories: prest?.ordre_categories ?? null,
    })
  } catch (e) {
    console.error('[api/pro] erreur', e)
    return NextResponse.json({ error: 'erreur_interne' }, { status: 500 })
  }
}
