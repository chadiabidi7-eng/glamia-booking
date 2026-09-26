import ChoixVille from '@/components/beaute/ChoixVille'
import { langueDuVisiteur } from '@/lib/beaute-langue'
import { TEXTES } from '@/lib/beaute-textes'

// glamia.pro/beaute — l'entrée : la cliente choisit sa ville, ou « Autour de moi ».
export default async function Beaute() {
  const langue = await langueDuVisiteur()
  const T = TEXTES[langue]
  return (
    <main style={{ minHeight: '100dvh', background: '#FDF8F5', color: '#2B1A24', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 20px', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      <p style={{ margin: 0, fontWeight: 700, letterSpacing: '0.22em', fontSize: 14 }}>GLAMIA</p>
      <h1 style={{ fontFamily: 'var(--font-fraunces), Georgia, serif', fontWeight: 500, fontSize: 'clamp(34px, 6vw, 56px)', letterSpacing: '-0.025em', lineHeight: 1.05, textAlign: 'center', margin: '28px 0 12px' }}>{T.titre}</h1>
      <p style={{ margin: '0 0 32px', color: '#8A7682', fontSize: 16, textAlign: 'center', maxWidth: 420, lineHeight: 1.5 }}>{T.sousTitre}</p>
      <ChoixVille langue={langue} />
    </main>
  )
}
