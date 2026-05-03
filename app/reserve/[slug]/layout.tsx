import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'

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
      .select('prenom, nom')
      .eq('slug', slug)
      .order('created_at', { ascending: true })
      .limit(1)

    const pro = data?.[0]
    if (!pro) return fallback

    const title = `${pro.prenom} ${pro.nom} — Glamia`
    const description = `Réservez votre rendez-vous beauté en ligne`

    return {
      title,
      description,
      openGraph: {
        type: 'website',
        siteName: 'Glamia',
        title,
        description,
        locale: 'fr_FR',
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
