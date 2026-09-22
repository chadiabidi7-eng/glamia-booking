import type { Metadata } from 'next'
import { cache } from 'react'
import { createClient } from '@supabase/supabase-js'
import { libelleCategorie } from '@/lib/categorie-autre'
import { traduireDans } from '@/lib/i18n'
import LangueDeLaPro from './LangueDeLaPro'

// Clé service role et non clé publique : ce fichier ne s'exécute QUE sur le
// serveur, pour composer le titre de la page. Avec la clé publique il aurait
// cessé de fonctionner le jour où la lecture anonyme des profils a été fermée
// — et le titre serait devenu « Réservation » pour toutes les pros, sans que
// rien d'autre ne signale le problème.
const supabaseServer = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Le profil public, lu une seule fois par affichage.
 *
 * Le titre de la page et la langue de l'écran d'attente le réclament tous les
 * deux. `cache` fait que la question n'est posée à la base qu'une fois : sans
 * lui, chaque page de réservation coûterait deux lectures au lieu d'une.
 *
 * ON LIT AUSSI SON CATALOGUE, et ça ne coûte rien : la jointure passe par deux
 * index (mesuré à 0,15 ms le 22 septembre 2026). C'est ce catalogue qui permet
 * d'écrire ce que la pro fait VRAIMENT, au lieu de la phrase passe-partout que
 * les 1 146 pages se partageaient.
 */
const profilDuSlug = cache(async (slug: string) => {
  const { data } = await supabaseServer
    .from('profiles')
    .select('prenom, nom, pseudo, langue, specialite, adresse_publique, categorie_autre_nom, prestations(data)')
    .eq('slug', slug)
    .order('created_at', { ascending: true })
    .limit(1)
  return data?.[0] ?? null
})

/** Le nom que la cliente voit sur la page : le pseudo d'abord, le prénom sinon. */
// LE MÊME QUE SUR LA PAGE, ET C'EST TOUT L'ENJEU. Le titre annonçait
// « prénom nom » quand la page affichait le pseudo : une pro qui travaille
// sous « Studio Lashes » se voyait proposée dans Google sous son état civil.
function nomPublic(pro: { pseudo?: unknown; prenom?: unknown; nom?: unknown }): string {
  const pseudo = typeof pro.pseudo === 'string' ? pro.pseudo.trim() : ''
  if (pseudo) return pseudo
  const prenom = typeof pro.prenom === 'string' ? pro.prenom.trim() : ''
  const nom = typeof pro.nom === 'string' ? pro.nom.trim() : ''
  return `${prenom} ${nom}`.trim()
}

/**
 * Les prestations qu'elle propose vraiment, les plus parlantes d'abord.
 *
 * ON NE GARDE QUE CE QU'ELLE A ALLUMÉ. Un catalogue contient les prestations
 * proposées par Glamia à l'installation, éteintes par défaut : la moitié des
 * lignes ne correspondent à rien de ce qu'elle fait. Les annoncer à Google
 * reviendrait à la référencer sur des soins qu'elle ne pratique pas.
 *
 * QUATRE AU MAXIMUM, ET 90 SIGNES EN TOUT. Une description est coupée vers
 * 160 signes dans les résultats, et le nom de la pro doit tenir après. Compter
 * les prestations ne suffisait pas : une pro annonce « Pack complet signature
 * (browlift + restructuration avec épilation + Teinture) », et quatre lignes
 * comme celle-là faisaient 197 signes — coupés net chez Google.
 *
 * ET ON ÉCARTE LES DÉPOSES ET LES RETOUCHES. « Dépose gel », « Remplissage
 * 2 semaines » sont des actes de suivi, tapés par des clientes qui ont DÉJÀ
 * une praticienne. Ce qu'on cherche ici, ce sont les recherches qui amènent
 * quelqu'un de nouveau.
 */
const SUIVI = /^(d[ée]pose|remplissage|retouche|retirada|relleno|removal|refill)/i

/** Deux noms sont les mêmes si seules la casse et les espaces les séparent. */
const empreinte = (nom: string) => nom.toLowerCase().replace(/\s+/g, ' ').trim()

function prestationsPhares(data: unknown, max = 4, signes = 90): string[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return []
  const noms: string[] = []
  // LE MÊME NOM DANS DEUX CATÉGORIES, C'EST UN SEUL NOM. « Vernis
  // semi-permanent » figure chez certaines pros en Manucure ET en Pédicure :
  // la description annonçait deux fois la même chose, et perdait une place.
  const vus = new Set<string>()
  let longueur = 0
  for (const liste of Object.values(data as Record<string, unknown>)) {
    if (!Array.isArray(liste)) continue
    for (const item of liste) {
      if (noms.length >= max) return noms
      if (!item || typeof item !== 'object') continue
      const p = item as { nom?: unknown; active?: unknown }
      if (p.active !== true) continue
      const nom = typeof p.nom === 'string' ? p.nom.trim() : ''
      if (!nom || SUIVI.test(nom)) continue
      const cle = empreinte(nom)
      if (vus.has(cle)) continue
      // La virgule et l'espace qui la suivront comptent aussi.
      const cout = nom.length + (noms.length > 0 ? 2 : 0)
      if (longueur + cout > signes) continue
      vus.add(cle)
      noms.push(nom)
      longueur += cout
    }
  }
  return noms
}

/**
 * Ses métiers, tels que la cliente les lit sur sa page.
 *
 * `specialite` les porte déjà séparés par « · », dans la langue de la pro.
 * `libelleCategorie` n'intervient que sur « Autre », pour rendre le nom que la
 * pro lui a donné — une réflexologue ne doit pas être annoncée sous « Autre ».
 */
function metiers(specialite: unknown, perso: unknown, max = 3): string {
  if (typeof specialite !== 'string' || !specialite.trim()) return ''
  const nomPerso = typeof perso === 'string' ? perso : null
  return specialite
    .split('·')
    .map(s => libelleCategorie(s.trim(), nomPerso))
    .filter(Boolean)
    .slice(0, max)
    .join(', ')
}

/**
 * Sa ville, quand elle en a donné une d'exploitable.
 *
 * LE CHAMP EST LIBRE AUJOURD'HUI, et il contient de tout : « Denain », mais
 * aussi « Domicile 78/92/91 » ou « L'adresse vous sera envoyée ». On écarte
 * donc ce qui ne ressemble pas à un nom de lieu — mieux vaut pas de ville du
 * tout qu'une ville inventée dans un résultat de recherche.
 *
 * Ce garde-fou disparaîtra le jour où la ville se choisira dans une liste.
 */
function villeLisible(brut: unknown): string {
  if (typeof brut !== 'string') return ''
  const v = brut.trim()
  if (v.length < 2 || v.length > 40) return ''
  if (/\d{3}/.test(v)) return ''            // un code postal collé, une liste de départements
  if (/[/@]|https?:/i.test(v)) return ''    // « 78/92/91 », une adresse web
  if (v.split(/\s+/).length > 4) return ''  // une phrase, pas un lieu
  return v
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params

  const fallback: Metadata = {
    title: 'Glamia',
    description: traduireDans('fr', 'meta.siteDescription'),
  }

  try {
    // Même logique que la page : slug exact, created_at ASC pour gérer les doublons
    const pro = await profilDuSlug(slug)
    if (!pro) return fallback

    // LE TITRE ET L'APERÇU SUIVENT LA PRO. C'est ce qui s'affiche quand elle
    // colle son lien dans sa bio Instagram ou l'envoie par message : une pro
    // de Londres ne veut pas d'un aperçu en français sous son nom.
    const langue = (pro as { langue?: string }).langue
    const nom = nomPublic(pro)
    const ville = villeLisible((pro as { adresse_publique?: unknown }).adresse_publique)

    // ── CE QU'ELLE FAIT, ET OÙ ────────────────────────────────────────────
    // Les 1 146 pages annonçaient toutes « Réservez votre rendez-vous beauté
    // en ligne ». Un moteur ne peut rien faire d'une phrase identique partout :
    // rien ne distingue une poseuse de cils lyonnaise d'une coiffeuse afro.
    //
    // Le catalogue peut être vide — une pro qui vient de s'inscrire, une autre
    // qui n'a rien allumé. On retombe alors sur l'ancienne phrase, qui ne dit
    // pas grand-chose mais ne ment pas.
    const catalogue = (pro as { prestations?: { data?: unknown } | { data?: unknown }[] }).prestations
    const bloc = Array.isArray(catalogue) ? catalogue[0]?.data : catalogue?.data
    const phares = prestationsPhares(bloc)
    const listeMetiers = metiers(
      (pro as { specialite?: unknown }).specialite,
      (pro as { categorie_autre_nom?: unknown }).categorie_autre_nom,
    )

    const title = listeMetiers
      ? traduireDans(langue, ville ? 'meta.titreProVille' : 'meta.titrePro',
          { pro: nom, metiers: listeMetiers, ville })
      : `${nom} — Glamia`

    const description = phares.length > 0
      ? traduireDans(langue, ville ? 'meta.descriptionProVille' : 'meta.descriptionPro',
          { prestations: phares.join(', '), pro: nom, ville })
      : traduireDans(langue, 'meta.reserveDescription')

    return {
      title,
      description,
      // L'ADRESSE OFFICIELLE DE LA PAGE. Sans elle, une même page atteinte par
      // deux chemins compte pour deux aux yeux du moteur, qui partage alors sa
      // confiance entre les deux au lieu de la donner à une seule.
      alternates: { canonical: `/reserve/${slug}` },
      openGraph: {
        type: 'website',
        siteName: 'Glamia',
        title,
        description,
        url: `/reserve/${slug}`,
        locale: langue === 'en' ? 'en_GB' : langue === 'es' ? 'es_ES' : 'fr_FR',
        images: [
          {
            url: '/og-image.png',
            width: 1024,
            height: 1024,
            alt: 'Glamia',
          },
        ],
      },
      twitter: {
        card: 'summary',
        title,
        description,
        images: ['/og-image.png'],
      },
    }
  } catch {
    return fallback
  }
}

export default async function ReserveLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  // LA LANGUE PART AVEC LE HTML, pas après. La page va chercher la pro
  // elle-même depuis le navigateur ; le temps de cet aller-retour, son écran
  // d'attente n'avait aucune langue et affichait le français. Le serveur, lui,
  // connaît déjà la pro — il vient de lire son profil pour le titre.
  const { slug } = await params
  let langue: string | null = null
  try {
    langue = ((await profilDuSlug(slug))?.langue as string | null) ?? null
  } catch {
    // Une base qui ne répond pas ne doit pas empêcher la page de s'ouvrir :
    // on repart sur le français, comme avant.
  }
  return <LangueDeLaPro langue={langue}>{children}</LangueDeLaPro>
}
