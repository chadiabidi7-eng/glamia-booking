import type { Metadata } from 'next'
import Bandeau from '@/components/beaute/Bandeau'
import ChoixVille from '@/components/beaute/ChoixVille'
import Entete from '@/components/beaute/Entete'
import ProsReferencees from '@/components/beaute/ProsReferencees'
import { langueDuVisiteur } from '@/lib/beaute-langue'
import { metadataAccueil } from '@/lib/beaute-seo'
import { TEXTES } from '@/lib/beaute-textes'
import { villesAvecPros, type VilleAvecPros } from '@/lib/recherche-pros'
import { unstable_cache } from 'next/cache'
import { Suspense } from 'react'

// glamia.pro/beaute — l'entrée : la cliente choisit sa ville, ou « Autour de moi ».
// Dessous, les spécialités défilent. L'entrée des pros est dans l'en-tête.

export async function generateMetadata(): Promise<Metadata> {
  return metadataAccueil(await langueDuVisiteur())
}

// LES GRANDES VILLES EN LIENS (Chadi, 25 oct. 2026) : sous l'écran d'accueil,
// les villes les plus peuplées où il y a des pros. Pour la cliente, un raccourci ;
// pour Google, le chemin vers les pages des villes (il suit les liens d'une page
// bien plus volontiers qu'une liste d'adresses). Lu dans la liste gardée une heure.
const NB_VILLES = 30

// UNE RÉSERVE À PART, PETITE (4 nov. 2026) : la liste complète des villes pèse
// trop lourd pour être gardée, et se refaisait donc à chaque visite (≈ 15 s,
// coupée à 4 s : l'accueil attendait 4 s pour rien et n'affichait jamais la
// liste). Ici on ne garde que les 30 villes montrées.
const grandesVillesEnCache = unstable_cache(async (): Promise<VilleAvecPros[]> => {
  const villes = await villesAvecPros()
  return [...villes].sort((a, b) => b.population - a.population || a.nom.localeCompare(b.nom)).slice(0, NB_VILLES)
    .map(v => ({ ...v, metiers: [] }))
}, ['beaute-grandes-villes-v1'], { revalidate: 3600 })

// La liste arrive APRÈS l'accueil (Suspense) : la cliente n'attend jamais.
async function GrandesVilles({ langue }: { langue: Parameters<typeof Entete>[0]['langue'] }) {
  let villes: VilleAvecPros[] = []
  try { villes = await grandesVillesEnCache() } catch { return null }
  if (!villes.length) return null
  const T = TEXTES[langue]
  // Deux villes du même nom dans la liste : on précise leur région.
  const doublons = new Set(villes.filter((v, i) => villes.findIndex(w => w.nom === v.nom) !== i).map(v => v.nom))
  const enOrdre = [...villes].sort((a, b) => a.nom.localeCompare(b.nom, T.locale))
  return (
    <nav aria-label={T.villesTitre} className="grandes-villes">
          <style>{`
            .grandes-villes { max-width: 920px; margin: 0 auto; padding: 8px 20px 64px; box-sizing: border-box; text-align: center; }
            .grandes-villes h2 { margin: 0 0 18px; font-size: 17px; font-weight: 800; letter-spacing: -0.02em; }
            .grandes-villes ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; justify-content: center; gap: 10px 22px; }
            .grandes-villes a { font-size: 15px; color: var(--encre-douce); text-decoration: none; white-space: nowrap; }
            .grandes-villes a:hover { color: var(--rose-profond); text-decoration: underline; text-underline-offset: 3px; }
          `}</style>
          <h2>{T.villesTitre}</h2>
          <ul>
            {enOrdre.map(v => (
              <li key={v.slug}><a href={`/beaute/${v.slug}`}>{v.nom}{doublons.has(v.nom) && v.zone ? ` (${v.zone})` : ''}</a></li>
            ))}
          </ul>
        </nav>
  )
}

export default async function Beaute() {
  const langue = await langueDuVisiteur()
  const T = TEXTES[langue]
  return (
    <>
      <Entete langue={langue} />
      <main style={{ minHeight: 'calc(100dvh - 73px)', boxSizing: 'border-box', padding: '48px 20px 12vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', background: 'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(194,119,158,0.13), rgba(194,119,158,0) 72%)' }}>
        <h1 className="gros-titre" style={{ fontSize: 'clamp(36px, 6.4vw, 68px)', maxWidth: 820 }}>{T.titre}</h1>
        <p style={{ margin: '14px 0 32px', fontSize: 17, color: 'var(--encre-douce)' }}>{T.sousTitre}</p>
        <ChoixVille langue={langue} />
        <Bandeau langue={langue} />
      </main>
      <Suspense fallback={null}><GrandesVilles langue={langue} /></Suspense>
      <ProsReferencees langue={langue} />
    </>
  )
}
