import Bandeau from '@/components/beaute/Bandeau'
import ChoixVille from '@/components/beaute/ChoixVille'
import Entete from '@/components/beaute/Entete'
import { langueDuVisiteur } from '@/lib/beaute-langue'
import { TEXTES } from '@/lib/beaute-textes'

// glamia.pro/beaute — l'entrée : la cliente choisit sa ville, ou « Autour de moi ».
// Dessous, les spécialités défilent. L'entrée des pros est dans l'en-tête.

export default async function Beaute() {
  const langue = await langueDuVisiteur()
  const T = TEXTES[langue]
  return (
    <>
      <Entete langue={langue} />
      <main style={{ padding: 'clamp(56px, 12vh, 132px) 20px 64px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', background: 'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(194,119,158,0.13), rgba(194,119,158,0) 72%)' }}>
        <h1 className="gros-titre" style={{ fontSize: 'clamp(36px, 6.4vw, 68px)', maxWidth: 820 }}>{T.titre}</h1>
        <p style={{ margin: '14px 0 32px', fontSize: 17, color: 'var(--encre-douce)' }}>{T.sousTitre}</p>
        <ChoixVille langue={langue} />
        <Bandeau langue={langue} />
      </main>
    </>
  )
}
