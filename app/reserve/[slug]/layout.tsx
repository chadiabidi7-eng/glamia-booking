import type { Metadata } from 'next'
import { cache } from 'react'
import { createClient } from '@supabase/supabase-js'
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
 */
const profilDuSlug = cache(async (slug: string) => {
  const { data } = await supabaseServer
    .from('profiles')
    .select('prenom, nom, langue')
    .eq('slug', slug)
    .order('created_at', { ascending: true })
    .limit(1)
  return data?.[0] ?? null
})

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
    const title = `${pro.prenom} ${pro.nom} — Glamia`
    const description = traduireDans(langue, 'meta.reserveDescription')

    return {
      title,
      description,
      openGraph: {
        type: 'website',
        siteName: 'Glamia',
        title,
        description,
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
