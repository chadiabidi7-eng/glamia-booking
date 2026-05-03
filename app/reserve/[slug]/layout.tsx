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
    title: 'Glamia — Réservation en ligne',
    description: 'Prenez rendez-vous chez votre professionnelle de beauté en quelques clics.',
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

    const title = `Réservez chez ${pro.prenom} ${pro.nom} | Glamia`
    const description = `Prenez rendez-vous en ligne avec ${pro.prenom} ${pro.nom} sur Glamia.`

    return {
      title,
      description,
      openGraph: {
        type: 'website',
        siteName: 'Glamia',
        title,
        description,
        locale: 'fr_FR',
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
      },
    }
  } catch {
    return fallback
  }
}

export default function ReserveLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
