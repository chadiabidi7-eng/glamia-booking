import type { Metadata } from 'next'
import { Fraunces } from 'next/font/google'

// La recherche des clientes (3.0) : sa propre police de titre, le Fraunces des
// visuels Glamia. Le reste du site n'est pas touché.
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', weight: ['400', '500', '600'] })

export const metadata: Metadata = {
  title: 'Glamia — Trouve ta pro beauté',
  description: 'Les professionnelles de la beauté près de chez toi. Réserve en ligne en quelques secondes.',
  robots: { index: false, follow: false },   // hors ligne jusqu'à la sortie de la 3.0
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className={fraunces.variable}>{children}</div>
}
