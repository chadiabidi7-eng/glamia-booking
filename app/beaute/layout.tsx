import type { Metadata } from 'next'
import { Fraunces, Plus_Jakarta_Sans } from 'next/font/google'

// ─────────────────────────────────────────────────────────────────────────────
// LA RECHERCHE DES CLIENTES, DANS LA DIRECTION ARTISTIQUE GLAMIA (Cockpit,
// onglet Design) : Fraunces pour les titres — la fin du titre en italique et en
// rose, c'est la signature — et Plus Jakarta Sans pour tout le reste ; fond
// crème, roses de la marque, encre presque noire. Le reste du site de
// réservation n'est pas touché.
// ─────────────────────────────────────────────────────────────────────────────

const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', weight: ['400', '500'], style: ['normal', 'italic'] })
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta', weight: ['400', '500', '600', '700'] })

export const metadata: Metadata = {
  title: 'Glamia — Trouve ta pro beauté',
  description: 'Les professionnelles de la beauté près de chez toi. Réserve en ligne en quelques secondes.',
  robots: { index: false, follow: false },   // hors ligne jusqu'à la sortie de la 3.0
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${fraunces.variable} ${jakarta.variable}`}>
      <style>{`
        .da-glamia {
          --creme: #FAF4ED; --rose: #C77A96; --rose-profond: #A85F7C; --rose-doux: #F4DCE5; --rose-pale: #FBEEF2;
          --encre: #1C1C1E; --encre-douce: #6B6B70; --filet: #EDE0E8;
          font-family: var(--font-jakarta), -apple-system, system-ui, sans-serif;
          background: var(--creme); color: var(--encre); -webkit-font-smoothing: antialiased;
        }
        .da-glamia .titre { font-family: var(--font-fraunces), Georgia, serif; font-weight: 500; letter-spacing: -0.02em; line-height: 1.02; margin: 0; }
        .da-glamia .titre em { font-style: italic; color: var(--rose); }
        .da-glamia .surtitre { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.12em; color: var(--rose-profond); margin: 0; }
        .da-glamia .sous-titre { font-size: 16px; line-height: 1.45; color: var(--encre-douce); margin: 0; }
      `}</style>
      {children}
    </div>
  )
}
