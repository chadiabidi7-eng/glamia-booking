'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { List, Map as IconeCarte, Star } from 'lucide-react'
import ChoixVille, { POSITION_CLE } from '@/components/beaute/ChoixVille'
import { TEXTES, type Langue, type Metier } from '@/lib/beaute-textes'
import type { ProTrouvee } from '@/lib/recherche-pros'

// ─────────────────────────────────────────────────────────────────────────────
// LES RÉSULTATS — la liste à gauche, la carte à droite (3.0, 27 sept. 2026).
//
// Ce que Chadi a demandé, et rien de plus : la photo de profil, le pseudo, la
// prochaine disponibilité, la distance ; la note en haut à droite. Toucher une
// pro ouvre sa page de réservation. Au-dessus, les métiers présents dans la
// ville, pour filtrer. Sur téléphone : la liste, et un bouton « Carte ».
// ─────────────────────────────────────────────────────────────────────────────

const Carte = dynamic(() => import('@/components/beaute/Carte'), { ssr: false })

// La palette du Cockpit (onglet Design).
const ENCRE = '#1C1C1E'
const ENCRE_DOUCE = '#6B6B70'
const ROSE = '#C77A96'
const ROSE_PROFOND = '#A85F7C'
const ROSE_PALE = '#FBEEF2'
const FILET = '#EDE0E8'

type Point = { lat: number; lon: number }

function distanceM(a: Point, b: Point) {
  const R = 6371000, r = Math.PI / 180
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}
function distanceLisible(m: number, locale: string) {
  if (m < 1000) return `${Math.max(100, Math.round(m / 50) * 50)} m`
  return `${(m / 1000).toLocaleString(locale, { maximumFractionDigits: m < 10000 ? 1 : 0 })} km`
}


export default function Recherche({ langue, titre, chute, pros, centre }: {
  langue: Langue
  titre: string
  chute: string
  pros: ProTrouvee[]
  centre: Point | null
}) {
  const T = TEXTES[langue]
  const [metier, setMetier] = useState<Metier | null>(null)
  const [actif, setActif] = useState<string | null>(null)
  const [vue, setVue] = useState<'liste' | 'carte'>('liste')
  const [moi, setMoi] = useState<Point | null>(null)
  const cartes = useRef(new Map<string, HTMLAnchorElement>())
  // Servie depuis glamia.pro, la page renvoie au site de réservation.
  const [base, setBase] = useState('')
  useEffect(() => {
    const h = window.location.host
    if (h.endsWith('glamia.pro') && h !== 'booking.glamia.pro') setBase('https://booking.glamia.pro')
  }, [])

  // Localisée depuis « Autour de moi » : les distances partent d'elle.
  useEffect(() => {
    try { const p = JSON.parse(sessionStorage.getItem(POSITION_CLE) ?? 'null'); if (p?.lat) setMoi(p) } catch { /* rien */ }
  }, [])
  const origine = moi ?? centre

  const presents = useMemo(() => {
    const s = new Set<Metier>(); pros.forEach(p => p.metiers.forEach(m => s.add(m)))
    return (Object.keys(T.metiers) as Metier[]).filter(m => s.has(m))
  }, [pros, T.metiers])
  const visibles = useMemo(() => (metier ? pros.filter(p => p.metiers.includes(metier)) : pros), [pros, metier])

  const choisirSurCarte = (slug: string) => {
    setActif(slug)
    cartes.current.get(slug)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const quand = (d: { date: string; heure: string }) => {
    const auj = new Date(); const jour = new Date(`${d.date}T12:00:00`)
    const ecart = Math.round((jour.getTime() - new Date(auj.toDateString()).getTime() - 12 * 3600000) / 86400000)
    const date = ecart === 0 ? T.aujourdhui : ecart === 1 ? T.demain
      : jour.toLocaleDateString(T.locale, { weekday: 'short', day: 'numeric', month: 'short' })
    return `${date} · ${d.heure.slice(0, 5)}`
  }

  return (
    <div className="beaute-page da-glamia">
      <style>{`
        .beaute-page { min-height: 100dvh; }
        .beaute-tete { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 24px; background: rgba(250,244,237,0.9); backdrop-filter: blur(12px); border-bottom: 1px solid ${FILET}; }
        .beaute-corps { display: grid; grid-template-columns: minmax(380px, 520px) 1fr; }
        .beaute-liste { padding: 24px 24px 120px; }
        .beaute-carte { position: sticky; top: 73px; height: calc(100dvh - 73px); border-left: 1px solid ${FILET}; }
        .beaute-pro { display: flex; gap: 14px; align-items: center; padding: 14px; background: #fff; border: 1px solid ${FILET}; border-radius: 20px; text-decoration: none; color: inherit; transition: border-color .15s ease, transform .15s ease; }
        .beaute-pro:hover, .beaute-pro.actif { border-color: ${ROSE}; }
        .beaute-pro:active { transform: scale(0.99); }
        .beaute-bascule { display: none; }
        @media (max-width: 860px) {
          .beaute-tete { padding: 12px 16px; }
          .beaute-corps { display: block; }
          .beaute-liste { padding: 18px 16px 120px; }
          .beaute-carte { position: fixed; inset: 69px 0 0 0; top: 69px; height: auto; border: 0; z-index: 10; }
          .beaute-carte.cachee { display: none; }
          .beaute-bascule { display: flex; position: fixed; left: 50%; bottom: calc(24px + env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 30; }
          .beaute-marque-long { display: none; }
        }
        @media (min-width: 861px) { .beaute-carte.cachee { display: block; } }
      `}</style>

      <header className="beaute-tete">
        <Link href="/beaute" aria-label="Glamia" style={{ display: 'flex' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/glamia-logo.png" alt="Glamia" width={104} height={38} style={{ width: 104, height: 'auto' }} />
        </Link>
        <ChoixVille langue={langue} compact />
      </header>

      <div className="beaute-corps">
        <main className="beaute-liste">
          <p className="surtitre">{T.pros(visibles.length)}</p>
          <h1 className="titre" style={{ fontSize: 40, margin: '10px 0 0' }}>{titre} <em>{chute}</em></h1>

          {presents.length > 1 && (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '18px -4px 6px', padding: '0 4px 4px', scrollbarWidth: 'none' }}>
              {[null, ...presents].map(m => {
                const on = metier === m
                return (
                  <button key={m ?? 'tout'} onClick={() => setMetier(m)}
                    style={{ flexShrink: 0, height: 36, padding: '0 16px', borderRadius: 18, cursor: 'pointer', fontSize: 14, fontWeight: 600, border: `1px solid ${on ? ROSE : FILET}`, background: on ? ROSE_PALE : '#fff', color: on ? ROSE_PROFOND : ENCRE }}>
                    {m ? T.metiers[m] : T.tout}
                  </button>
                )
              })}
            </div>
          )}

          {visibles.length === 0 ? (
            <div style={{ marginTop: 28, padding: '28px 22px', background: '#fff', border: `1px solid ${FILET}`, borderRadius: 20, textAlign: 'center' }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>{T.videTitre}</p>
              <p style={{ margin: '6px 0 0', color: ENCRE_DOUCE, fontSize: 14 }}>{T.videTexte}</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
              {visibles.map(p => (
                <a key={p.slug} href={`${base}/reserve/${p.slug}`}
                  ref={el => { if (el) cartes.current.set(p.slug, el) }}
                  className={`beaute-pro${actif === p.slug ? ' actif' : ''}`}
                  onMouseEnter={() => setActif(p.slug)} onMouseLeave={() => setActif(a => (a === p.slug ? null : a))}>
                  <div style={{ width: 64, height: 64, borderRadius: 32, overflow: 'hidden', flexShrink: 0, background: ROSE_PALE, display: 'grid', placeItems: 'center', boxShadow: `0 0 0 2px #fff, 0 0 0 3px ${FILET}` }}>
                    {p.photo
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={p.photo} alt="" width={64} height={64} style={{ width: 64, height: 64, objectFit: 'cover' }} loading="lazy" />
                      : <span style={{ color: ROSE_PROFOND, fontWeight: 700, fontFamily: 'var(--font-fraunces), serif', fontSize: 22 }}>{p.nom.slice(0, 1).toUpperCase()}</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 16.5, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nom}</span>
                      {p.note !== null && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 700, flexShrink: 0 }} title={T.avis(p.nbAvis)}>
                          <Star size={13} fill={ROSE} color={ROSE} strokeWidth={0} />
                          {p.note.toLocaleString(T.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                          <span style={{ color: ENCRE_DOUCE, fontWeight: 500 }}>({p.nbAvis})</span>
                        </span>
                      )}
                    </div>
                    {p.metiers.length > 0 && (
                      <div style={{ fontSize: 13, color: ENCRE_DOUCE, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.metiers.map(m => T.metiers[m]).join(' · ')}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginTop: 6 }}>
                      {p.dispo ? (
                        <>
                          <span style={{ width: 7, height: 7, borderRadius: 4, background: '#3DAA6B', flexShrink: 0 }} />
                          <span style={{ fontWeight: 600 }}>{T.dispo} {quand(p.dispo)}</span>
                        </>
                      ) : <span style={{ color: ENCRE_DOUCE }}>{T.pasDeDispo}</span>}
                      {origine && <span style={{ marginLeft: 'auto', color: ENCRE_DOUCE, flexShrink: 0 }}>{distanceLisible(distanceM(origine, p), T.locale)}</span>}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </main>

        <aside className={`beaute-carte${vue === 'liste' ? ' cachee' : ''}`}>
          <Carte pros={visibles} actif={actif} onChoisir={s => { choisirSurCarte(s); if (window.innerWidth <= 860) setVue('liste') }} centre={origine} />
        </aside>
      </div>

      <button className="beaute-bascule" onClick={() => setVue(v => (v === 'liste' ? 'carte' : 'liste'))}
        style={{ alignItems: 'center', gap: 8, height: 46, padding: '0 20px', borderRadius: 23, border: 0, background: ENCRE, color: '#fff', fontSize: 15, fontWeight: 600, boxShadow: '0 10px 24px rgba(43,26,36,0.25)', cursor: 'pointer' }}>
        {vue === 'liste' ? <><IconeCarte size={17} strokeWidth={2.2} /> {T.carte}</> : <><List size={17} strokeWidth={2.2} /> {T.liste}</>}
      </button>
    </div>
  )
}
