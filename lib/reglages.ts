import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// LES RÉGLAGES QUI SE CHANGENT SANS DÉPLOYER.
//
// Certains nombres doivent pouvoir bouger le jour où on le décide, pas le jour
// où une mise en ligne passe. La fenêtre des avis est le premier : on veut
// pouvoir la rouvrir sur deux mois le temps de rattraper les avis jamais
// demandés, puis la refermer — à la main, quand c'est fini.
//
// EN BASE, PAS DANS UNE VARIABLE D'ENVIRONNEMENT. Une variable Vercel demande
// un redéploiement pour changer, et un redéploiement de la page de résa n'est
// jamais anodin : c'est le gagne-pain des pros. Ici, une ligne de SQL suffit,
// et rien ne bouge dans le code.
//
// ON GARDE LA VALEUR TRENTE SECONDES. La page de résa lit ce réglage à chaque
// affichage de dossier : sans cache, c'est une requête de plus par cliente,
// pour un nombre qui change trois fois par an. Trente secondes, c'est assez
// court pour que la fermeture soit immédiate à l'échelle humaine.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** Le réglage normal. C'est aussi le repli si la base ne répond pas : mieux
 *  vaut refuser un avis trop vieux qu'ouvrir la porte en grand par accident. */
const AVIS_JOURS_DEFAUT = 3

/** Bornes de bon sens. Une valeur aberrante en base — un zéro, un 100000 posé
 *  par erreur — ne doit pas fermer les avis à tout le monde ni les ouvrir sur
 *  toute l'histoire de l'app. */
const AVIS_JOURS_MIN = 1
const AVIS_JOURS_MAX = 180

const CACHE_MS = 30_000

let enCache: { valeur: number; jusqua: number } | null = null

/** Combien de jours une cliente a pour donner son avis, depuis la FIN du RDV. */
export async function avisFenetreJours(): Promise<number> {
  if (enCache && Date.now() < enCache.jusqua) return enCache.valeur

  const { data, error } = await supabaseAdmin
    .from('reglages_glamia')
    .select('valeur')
    .eq('cle', 'avis_fenetre_jours')
    .maybeSingle()

  let jours = AVIS_JOURS_DEFAUT
  if (error) {
    console.error('[reglages] lecture avis_fenetre_jours :', error.message)
  } else {
    const brut = Number(data?.valeur)
    if (Number.isFinite(brut)) {
      jours = Math.min(AVIS_JOURS_MAX, Math.max(AVIS_JOURS_MIN, Math.round(brut)))
    }
  }

  enCache = { valeur: jours, jusqua: Date.now() + CACHE_MS }
  return jours
}

/** La même chose en millisecondes — c'est sous cette forme qu'on l'utilise. */
export async function avisFenetreMs(): Promise<number> {
  return (await avisFenetreJours()) * 24 * 60 * 60 * 1000
}
