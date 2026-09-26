/* eslint-disable @next/next/no-img-element */
import ChoixVille from '@/components/beaute/ChoixVille'
import { langueDuVisiteur } from '@/lib/beaute-langue'
import { TEXTES } from '@/lib/beaute-textes'

// glamia.pro/beaute — l'entrée : la cliente choisit sa ville, ou « Autour de moi ».
export default async function Beaute() {
  const langue = await langueDuVisiteur()
  const T = TEXTES[langue]
  return (
    <main className="da-glamia" style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 20px' }}>
      <img src="/glamia-logo.png" alt="Glamia" width={150} height={54} style={{ width: 150, height: 'auto' }} />
      <p className="surtitre" style={{ marginTop: 34 }}>{T.surtitre}</p>
      <h1 className="titre" style={{ fontSize: 'clamp(44px, 7.5vw, 76px)', textAlign: 'center', margin: '14px 0 16px' }}>
        {T.titre} <em>{T.titreChute}</em>
      </h1>
      <p className="sous-titre" style={{ textAlign: 'center', maxWidth: 340, marginBottom: 34 }}>{T.sousTitre}</p>
      <ChoixVille langue={langue} />
    </main>
  )
}
