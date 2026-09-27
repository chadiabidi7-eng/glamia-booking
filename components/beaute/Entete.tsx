/* eslint-disable @next/next/no-img-element */
import Link from 'next/link'
import { TEXTES, type Langue } from '@/lib/beaute-textes'

// L'en-tête du site : le logo en grand (on sait où on est), la recherche au
// milieu quand il y en a une, et à droite l'entrée des pros vers glamia.pro.

export const SITE_PRO = 'https://glamia.pro'

export default function Entete({ langue, children }: { langue: Langue; children?: React.ReactNode }) {
  const T = TEXTES[langue]
  return (
    <header className="entete">
      <style>{`
        .entete { position: sticky; top: 0; z-index: 40; background: rgba(255,255,255,0.88); backdrop-filter: saturate(180%) blur(16px); -webkit-backdrop-filter: saturate(180%) blur(16px); border-bottom: 1px solid var(--filet); }
        .entete-rang { max-width: 1280px; margin: 0 auto; display: flex; align-items: center; gap: 20px; padding: 14px 28px; min-height: 72px; box-sizing: border-box; }
        .entete-logo { display: flex; flex-shrink: 0; }
        .entete-logo img { height: 36px; width: auto; }
        .entete-milieu { flex: 1; display: flex; justify-content: center; min-width: 0; }
        @media (max-width: 760px) {
          .entete-rang { flex-wrap: wrap; padding: 12px 16px; gap: 12px; justify-content: space-between; }
          .entete-logo img { height: 28px; }
          .entete-milieu { order: 3; flex-basis: 100%; }
          .entete-vide { display: none; }
        }
      `}</style>
      <div className="entete-rang">
        <Link href="/beaute" className="entete-logo" aria-label="Glamia">
          <img src="/glamia-logo-net.png" alt="Glamia" width={682} height={176} />
        </Link>
        {children ? <div className="entete-milieu">{children}</div> : <div className="entete-vide" style={{ flex: 1 }} />}
        <a className="bouton-pro" href={SITE_PRO}>
          <img src="/glamia-fleur.png" alt="" width={18} height={18} style={{ width: 18, height: 18 }} />
          {T.proQuestion}
        </a>
      </div>
    </header>
  )
}
