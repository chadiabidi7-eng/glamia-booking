'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useRef, useState } from 'react'
import { List, Map as IconeCarte, Star } from 'lucide-react'
import ChoixVille, { POSITION_CLE } from '@/components/beaute/ChoixVille'
import Entete from '@/components/beaute/Entete'
import SpecialiteIcon from '@/components/SpecialiteIcon'
import { TEXTES, type Langue, type Metier } from '@/lib/beaute-textes'
import type { ProTrouvee } from '@/lib/recherche-pros'

// ─────────────────────────────────────────────────────────────────────────────
// LES RÉSULTATS — la liste à gauche, la carte à droite (3.0, 27 sept. 2026 ;
// refaits le soir même : police du système, logo en grand, vraies spécialités).
//
// Ce que Chadi a demandé, et rien de plus : la photo de profil, le pseudo, la
// prochaine disponibilité, la distance ; la note en haut à droite. Toucher une
// pro ouvre sa page de réservation. Au-dessus, les métiers présents dans la
// ville, pour filtrer. Sur téléphone : la liste, et un bouton « Carte ».
// ─────────────────────────────────────────────────────────────────────────────

const Carte = dynamic(() => import('@/components/beaute/Carte'), { ssr: false })

// Les couleurs de l'app.
const ENCRE = '#2B1A24'
const ENCRE_DOUCE = '#7A6B73'
const ROSE = '#C2779E'
const ROSE_PROFOND = '#A85F7C'
const ROSE_PALE = '#FBF0F5'
const FILET = '#F0E4EA'
const VERT = '#2F9E62'

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
    <div className="beaute-page">
      <style>{`
        .beaute-corps { max-width: 1280px; margin: 0 auto; display: grid; grid-template-columns: minmax(400px, 560px) 1fr; }
        .beaute-liste { padding: 32px 28px 120px; }
        .beaute-carte { position: sticky; top: 73px; height: calc(100dvh - 73px); padding: 20px 20px 20px 0; }
        .beaute-carte-boite { height: 100%; border-radius: 24px; overflow: hidden; border: 1px solid ${FILET}; }
        .beaute-filtres { display: flex; gap: 8px; overflow-x: auto; margin: 22px -28px 4px; padding: 0 28px 6px; scrollbar-width: none; }
        .beaute-filtres::-webkit-scrollbar { display: none; }
        .beaute-filtre { flex-shrink: 0; display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 14px 0 6px; border-radius: 20px; cursor: pointer; font: inherit; font-size: 14px; font-weight: 600; border: 1px solid ${FILET}; background: #fff; color: ${ENCRE}; transition: border-color .15s ease, background .15s ease; }
        .beaute-filtre.sans-icone { padding: 0 16px; }
        .beaute-filtre.on { border-color: ${ENCRE}; background: ${ENCRE}; color: #fff; }
        .beaute-pro { display: flex; gap: 16px; align-items: center; padding: 16px; background: #fff; border: 1px solid ${FILET}; border-radius: 22px; text-decoration: none; color: inherit; box-shadow: 0 1px 2px rgba(43,26,36,0.04); transition: border-color .15s ease, box-shadow .2s ease, transform .15s ease; }
        .beaute-pro:hover, .beaute-pro.actif { border-color: ${ROSE}; box-shadow: 0 10px 28px rgba(43,26,36,0.08); }
        .beaute-pro:active { transform: scale(0.99); }
        .beaute-bascule { display: none; }
        @media (max-width: 860px) {
          .beaute-corps { display: block; }
          .beaute-liste { padding: 22px 16px 120px; }
          .beaute-filtres { margin: 18px -16px 4px; padding: 0 16px 6px; }
          .beaute-carte { position: fixed; inset: 0; top: 0; height: auto; padding: 0; z-index: 35; }
          .beaute-carte-boite { border-radius: 0; border: 0; }
          .beaute-carte.cachee { display: none; }
          .beaute-bascule { display: flex; position: fixed; left: 50%; bottom: calc(24px + env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 50; }
        }
        @media (min-width: 861px) { .beaute-carte.cachee { display: block; } }
      `}</style>

      <Entete langue={langue}><ChoixVille langue={langue} compact /></Entete>

      <div className="beaute-corps">
        <main className="beaute-liste">
          {/* La ville seule, sur une ligne : la cliente sait ce qu'elle cherche. */}
          <h1 className="gros-titre" style={{ fontSize: 'clamp(28px, 4vw, 38px)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titre ? `${titre} ${chute}` : chute}</h1>
          <p style={{ margin: '8px 0 0', fontSize: 15, color: ENCRE_DOUCE }}>{T.pros(visibles.length)}</p>

          {presents.length > 1 && (
            <div className="beaute-filtres">
              {[null, ...presents].map(m => (
                <button key={m ?? 'tout'} onClick={() => setMetier(m)} className={`beaute-filtre${metier === m ? ' on' : ''}${m ? '' : ' sans-icone'}`}>
                  {m && <SpecialiteIcon specialite={TEXTES.fr.metiers[m]} size={28} />}
                  {m ? T.metiers[m] : T.tout}
                </button>
              ))}
            </div>
          )}

          {visibles.length === 0 ? (
            <div style={{ marginTop: 28, padding: '32px 22px', background: 'var(--creme)', borderRadius: 22, textAlign: 'center' }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 17 }}>{T.videTitre}</p>
              <p style={{ margin: '6px 0 0', color: ENCRE_DOUCE, fontSize: 14 }}>{T.videTexte}</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
              {visibles.map(p => (
                <a key={p.slug} href={`${base}/reserve/${p.slug}`}
                  ref={el => { if (el) cartes.current.set(p.slug, el) }}
                  className={`beaute-pro${actif === p.slug ? ' actif' : ''}`}
                  onMouseEnter={() => setActif(p.slug)} onMouseLeave={() => setActif(a => (a === p.slug ? null : a))}>
                  <div style={{ width: 76, height: 76, borderRadius: 38, overflow: 'hidden', flexShrink: 0, background: ROSE_PALE, display: 'grid', placeItems: 'center' }}>
                    {p.photo
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={p.photo} alt="" width={76} height={76} style={{ width: 76, height: 76, objectFit: 'cover' }} loading="lazy" />
                      : <span style={{ color: ROSE_PROFOND, fontWeight: 800, fontSize: 26 }}>{p.nom.slice(0, 1).toUpperCase()}</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 17, letterSpacing: '-0.015em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nom}</span>
                      {p.note !== null && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13.5, fontWeight: 700, flexShrink: 0 }} title={T.avis(p.nbAvis)}>
                          <Star size={14} fill={ROSE} color={ROSE} strokeWidth={0} />
                          {p.note.toLocaleString(T.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                          <span style={{ color: ENCRE_DOUCE, fontWeight: 500 }}>({p.nbAvis})</span>
                        </span>
                      )}
                    </div>
                    {p.metiers.length > 0 && (
                      <div style={{ fontSize: 13.5, color: ENCRE_DOUCE, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.metiers.map(m => T.metiers[m]).join(' · ')}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 10 }}>
                      {p.dispo ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px', borderRadius: 13, background: 'rgba(47,158,98,0.09)', color: VERT, fontWeight: 700 }}>
                          <span style={{ width: 6, height: 6, borderRadius: 3, background: VERT }} />
                          {T.dispo} {quand(p.dispo)}
                        </span>
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
          <div className="beaute-carte-boite">
            <Carte pros={visibles} actif={actif} onChoisir={s => { choisirSurCarte(s); if (window.innerWidth <= 860) setVue('liste') }} centre={origine} />
          </div>
        </aside>
      </div>

      <button className="beaute-bascule" onClick={() => setVue(v => (v === 'liste' ? 'carte' : 'liste'))}
        style={{ alignItems: 'center', gap: 8, height: 48, padding: '0 22px', borderRadius: 24, border: 0, background: ENCRE, color: '#fff', font: 'inherit', fontSize: 15, fontWeight: 700, boxShadow: '0 12px 28px rgba(43,26,36,0.28)', cursor: 'pointer' }}>
        {vue === 'liste' ? <><IconeCarte size={17} strokeWidth={2.2} /> {T.carte}</> : <><List size={17} strokeWidth={2.2} /> {T.liste}</>}
      </button>
    </div>
  )
}
