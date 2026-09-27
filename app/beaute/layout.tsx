import type { Metadata } from 'next'

// ─────────────────────────────────────────────────────────────────────────────
// LA RECHERCHE DES CLIENTES — un site, pas une story : la police du système,
// comme la page de réservation, et les couleurs de l'app (rose, prune, crème).
// La DA du Cockpit (Fraunces, italique rose) reste aux visuels Instagram et
// TikTok (Chadi, 27 sept. 2026).
// ─────────────────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: 'Glamia — Trouve ta pro beauté',
  description: 'Les professionnelles de la beauté près de chez toi. Réserve en ligne en quelques secondes.',
  robots: { index: false, follow: false },   // hors ligne jusqu'à la sortie de la 3.0
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="glamia-site">
      <style>{`
        .glamia-site {
          --fond: #FFFFFF; --creme: #FDF8F5; --rose: #C2779E; --rose-profond: #A85F7C; --rose-pale: #FBF0F5;
          --encre: #2B1A24; --encre-douce: #7A6B73; --filet: #F0E4EA; --vert: #2F9E62;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, 'Segoe UI', Roboto, sans-serif;
          background: var(--fond); color: var(--encre); -webkit-font-smoothing: antialiased;
          min-height: 100dvh;
        }
        .glamia-site a { color: inherit; }
        .glamia-site .gros-titre { font-weight: 800; letter-spacing: -0.035em; line-height: 1.04; margin: 0; }
        .glamia-site .bouton-pro {
          display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 16px; border-radius: 20px;
          border: 1px solid var(--filet); background: #fff; font-size: 14px; font-weight: 600; text-decoration: none;
          white-space: nowrap; transition: border-color .15s ease, background .15s ease;
        }
        .glamia-site .bouton-pro:hover { border-color: var(--rose); background: var(--rose-pale); }
        .glamia-site .bouton-pro:active { transform: scale(0.97); }
      `}</style>
      {children}
    </div>
  )
}
