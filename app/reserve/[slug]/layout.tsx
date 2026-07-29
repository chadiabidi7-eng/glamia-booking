import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import { tr, type Langue } from '@/lib/i18n'

const supabaseServer = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params

  const fallback: Metadata = {
    title: 'Glamia',
    description: 'Réservation en ligne chez votre professionnelle de beauté',
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

    // Langue de la pro : title/description localisés (fallbacks génériques en FR)
    const langue: Langue = pro.langue === 'en' ? 'en' : 'fr'
    const title = `${pro.prenom} ${pro.nom} — Glamia`
    const description = tr(langue, 'meta.description')

    return {
      title,
      description,
      openGraph: {
        type: 'website',
        siteName: 'Glamia',
        title,
        description,
        locale: langue === 'en' ? 'en_GB' : 'fr_FR',
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
