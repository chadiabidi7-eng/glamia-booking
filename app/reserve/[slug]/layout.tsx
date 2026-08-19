import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import { traduireDans } from '@/lib/i18n'

// Clé service role et non clé publique : ce fichier ne s'exécute QUE sur le
// serveur, pour composer le titre de la page. Avec la clé publique il aurait
// cessé de fonctionner le jour où la lecture anonyme des profils a été fermée
// — et le titre serait devenu « Réservation » pour toutes les pros, sans que
// rien d'autre ne signale le problème.
const supabaseServer = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
    const { data } = await supabaseServer
      .from('profiles')
      .select('prenom, nom, langue')
      .eq('slug', slug)
      .order('created_at', { ascending: true })
      .limit(1)

    const pro = data?.[0]
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

export default function ReserveLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
