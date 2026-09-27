'use client'

/* eslint-disable @next/next/no-img-element */
import dynamic from 'next/dynamic'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Star, X } from 'lucide-react'
import { traduire } from '@/lib/i18n'

// ─────────────────────────────────────────────────────────────────────────────
// LA VITRINE DE LA PRO — le haut de sa page de réservation (3.0, 27 sept. 2026)
//
// L'ordre voulu par Chadi, sur le modèle d'IARA. MÊME POLICE, MÊMES TAILLES
// ET MÊMES COULEURS que le reste de la page de réservation (Chadi, 27 sept.
// 2026) : la DA du Cockpit est celle des visuels Instagram/TikTok, pas des
// pages. Rien d'écrit gros.
//   1. son profil : pseudo, note, ville, réseaux, photo, prochaine dispo, puis
//      sa photo de couverture ;
//   2. sa bio ;
//   3. ses soins : les catégories en onglets qui défilent, chaque soin avec sa
//      photo, sa durée et son prix ;
//   4. ses photos de réalisations (15 au plus) ;
//   5. les avis de ses clientes ;
//   6. l'emplacement : la carte grise au cercle rose, jamais l'adresse ;
//   7. ses conditions.
// « Réserver » reste toujours visible en bas ; c'est seulement là qu'on passe
// à l'étape suivante (le numéro). Un bloc sans contenu ne s'affiche pas.
// ─────────────────────────────────────────────────────────────────────────────

const CarteCercle = dynamic(() => import('@/components/reserve/CarteCercle'), { ssr: false })

// Les couleurs de la page de réservation.
const ENCRE = '#1f2937'
const ENCRE_DOUCE = '#6b7280'
const ROSE = '#C2779E'
const ROSE_PROFOND = '#8E4E72'
const FILET = '#e5e7eb'

export type SoinVitrine = { cle: string; nom: string; photos: string[]; duree: string; prix: string }
export type CategorieVitrine = { nom: string; libelle: string; soins: SoinVitrine[] }

const SOINS_VISIBLES = 4
const PHOTOS_VISIBLES = 6

function Bloc({ titre, chute, children }: { titre: string; chute?: string; children: ReactNode }) {
  return (
    <section style={{ background: '#fff', border: `1.5px solid ${FILET}`, borderRadius: 16, padding: 16, marginBottom: 12 }}>
      <h2 className="vitrine-titre">{titre}{chute ? <> <span style={{ color: 'var(--accent)' }}>{chute}</span></> : null}</h2>
      <div style={{ marginTop: 12 }}>{children}</div>
    </section>
  )
}

function Plus({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} style={{ marginTop: 12, border: 0, borderRadius: 12, padding: '9px 14px', background: '#f3f4f6', color: ENCRE, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
      {children}
    </button>
  )
}

export default function Vitrine(props: {
  nom: string
  photoProfil: string | null
  note: number | null
  nbAvis: number
  ville: string | null
  reseaux: ReactNode
  prochaineDispo: string | null
  couverture: string | null
  bio: string | null
  categories: CategorieVitrine[]
  photos: string[]
  avis: ReactNode[]
  /** « Voir tout » : les avis, vingt à la fois (rendus par la page). */
  chargerAvis?: (depuis: number) => Promise<{ avis: ReactNode[]; suite: boolean }>
  position: { lat: number; lon: number } | null
  phraseAdresse: string | null
  conditions: { libelle: string; oui: boolean }[]
  ouvrirPhotos: (photos: string[], index: number) => void
  onReserver: () => void
  /** Ultra — « Personnaliser ma page » : la couleur de sa page, et celle et le texte du bouton. */
  couleurPage?: string | null
  couleurBouton?: string | null
  texteBouton?: string | null
}) {
  const ACCENT = props.couleurPage || ROSE
  const BOUTON = props.couleurBouton || ROSE
  const [categorie, setCategorie] = useState(0)
  const [tousSoins, setTousSoins] = useState(false)
  const [toutesPhotos, setToutesPhotos] = useState(false)
  // LES AVIS DÉFILENT UN PAR UN (Chadi) : un toutes les 2 secondes, tout seuls ;
  // dès que la cliente glisse elle-même, le défilement s'arrête pour de bon.
  const [avisIndex, setAvisIndex] = useState(0)
  const [auto, setAuto] = useState(true)
  const depart = useRef<number | null>(null)
  const nbAvisVitrine = props.avis.length
  useEffect(() => {
    if (!auto || nbAvisVitrine < 2) return
    const t = setInterval(() => setAvisIndex(i => (i + 1) % nbAvisVitrine), 2000)
    return () => clearInterval(t)
  }, [auto, nbAvisVitrine])
  const glisser = (sens: number) => { setAuto(false); setAvisIndex(i => (i + sens + nbAvisVitrine) % nbAvisVitrine) }

  // « Voir tout » : la liste complète, dans une fenêtre, chargée vingt par vingt.
  const [liste, setListe] = useState<{ avis: ReactNode[]; suite: boolean; charge: boolean } | null>(null)
  const chargerSuite = async (depuis: number) => {
    if (!props.chargerAvis) return
    setListe(l => ({ avis: l?.avis ?? [], suite: l?.suite ?? false, charge: true }))
    try {
      const r = await props.chargerAvis(depuis)
      setListe(l => ({ avis: [...(depuis === 0 ? [] : l?.avis ?? []), ...r.avis], suite: r.suite, charge: false }))
    } catch { setListe(l => (l ? { ...l, charge: false } : l)) }
  }
  const cat = props.categories[categorie] ?? props.categories[0]
  const nbSoins = props.categories.reduce((n, c) => n + c.soins.length, 0)
  const soins = cat ? (tousSoins ? cat.soins : cat.soins.slice(0, SOINS_VISIBLES)) : []

  return (
    <div className="vitrine" style={{ ['--accent' as string]: ACCENT }}>
      <style>{`
        .vitrine { color: ${ENCRE}; }
        .vitrine .vitrine-titre { font-size: 17px; font-weight: 700; line-height: 1.3; margin: 0; }
        .vitrine-onglets { display: flex; gap: 18px; overflow-x: auto; scrollbar-width: none; margin: 0 -16px; padding: 0 16px; border-bottom: 1px solid #f3f4f6; }
        .vitrine-onglets::-webkit-scrollbar { display: none; }
      `}</style>

      {/* 1. LE PROFIL */}
      <section style={{ background: '#fff', border: `1.5px solid ${FILET}`, borderRadius: 16, padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Le pseudo et la note sur la même ligne (Chadi) : pas de ligne en plus. */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, lineHeight: 1.25, color: props.couleurPage || ENCRE }}>{props.nom}</h1>
              {props.note !== null && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  <Star size={14} fill={ACCENT} color={ACCENT} strokeWidth={0} />
                  {props.note.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                  <span style={{ color: ENCRE_DOUCE, fontWeight: 500 }}>({props.nbAvis})</span>
                </span>
              )}
            </div>
            {props.ville && <p style={{ margin: '3px 0 0', color: ENCRE_DOUCE, fontSize: 14 }}>{props.ville}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>{props.reseaux}</div>
          </div>
          <div style={{ width: 76, height: 76, borderRadius: 38, overflow: 'hidden', flexShrink: 0, background: '#F9EEF4', border: `2px solid ${ACCENT}` }}>
            {props.photoProfil
              ? <img src={props.photoProfil} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: 26, fontWeight: 700, color: ACCENT }}>{props.nom.slice(0, 1).toUpperCase()}</div>}
          </div>
        </div>
        {props.prochaineDispo && (
          <p style={{ margin: '14px 0 0', display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, color: '#4A424C' }}>
            <span style={{ width: 9, height: 9, borderRadius: 5, background: '#4CAF6D', flex: 'none' }} />
            <span>{props.prochaineDispo}</span>
          </p>
        )}
        {props.couverture && (
          <button onClick={() => props.ouvrirPhotos([props.couverture!], 0)} style={{ display: 'block', width: '100%', marginTop: 14, padding: 0, border: 0, borderRadius: 14, overflow: 'hidden', cursor: 'pointer', aspectRatio: '16 / 9', background: '#f3f4f6' }}>
            <img src={props.couverture} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </button>
        )}
      </section>

      {/* 2. LA BIO */}
      {props.bio && (
        <Bloc titre={traduire('resa.bioDe')} chute={props.nom}>
          <p style={{ margin: 0, whiteSpace: 'pre-line', fontSize: 14, lineHeight: 1.55, color: '#4b5563' }}>{props.bio}</p>
        </Bloc>
      )}

      {/* 3. LES SOINS */}
      {nbSoins > 0 && (
        <Bloc titre={`${traduire('resa.lesSoins')} (${nbSoins})`}>
          {props.categories.length > 1 && (
            <div className="vitrine-onglets">
              {props.categories.map((c, i) => {
                const on = i === categorie
                return (
                  <button key={c.nom} onClick={() => { setCategorie(i); setTousSoins(false) }}
                    style={{ flexShrink: 0, border: 0, background: 'transparent', padding: '0 0 10px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: on ? ACCENT : ENCRE_DOUCE, borderBottom: `2px solid ${on ? ACCENT : 'transparent'}` }}>
                    {c.libelle}
                  </button>
                )
              })}
            </div>
          )}
          <div>
            {soins.map((s, i) => (
              <div key={s.cle} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: i > 0 ? `1px solid #f3f4f6` : 'none' }}>
                {s.photos.length > 0 ? (
                  <button onClick={() => props.ouvrirPhotos(s.photos, 0)} aria-label={s.nom} style={{ width: 52, height: 52, borderRadius: 12, overflow: 'hidden', padding: 0, border: 0, flexShrink: 0, cursor: 'pointer', background: '#F9EEF4' }}>
                    <img src={s.photos[0]} alt="" loading="lazy" style={{ width: 52, height: 52, objectFit: 'cover', display: 'block' }} />
                  </button>
                ) : null}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{s.nom}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 13, color: ENCRE_DOUCE }}>{s.duree} · {s.prix}</p>
                </div>
              </div>
            ))}
          </div>
          {cat && !tousSoins && cat.soins.length > SOINS_VISIBLES && <Plus onClick={() => setTousSoins(true)}>{traduire('resa.voirTousLesSoins')}</Plus>}
        </Bloc>
      )}

      {/* 4. SES PHOTOS */}
      {props.photos.length > 0 && (
        <Bloc titre={traduire('resa.photos')}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {(toutesPhotos ? props.photos : props.photos.slice(0, PHOTOS_VISIBLES)).map((ph, i) => (
              <button key={ph + i} onClick={() => props.ouvrirPhotos(props.photos, i)} style={{ aspectRatio: '1', padding: 0, border: 0, borderRadius: 10, overflow: 'hidden', cursor: 'pointer', background: '#F9EEF4' }}>
                <img src={ph} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </button>
            ))}
          </div>
          {!toutesPhotos && props.photos.length > PHOTOS_VISIBLES && <Plus onClick={() => setToutesPhotos(true)}>{traduire('resa.voirTout')}</Plus>}
        </Bloc>
      )}

      {/* 5. LES AVIS — un par un, qui défilent */}
      {props.avis.length > 0 && (
        <Bloc titre={traduire('resa.avisDeMesClientes')}>
          <div style={{ overflow: 'hidden' }}
            onTouchStart={e => { depart.current = e.touches[0].clientX }}
            onTouchEnd={e => {
              if (depart.current === null) return
              const ecart = e.changedTouches[0].clientX - depart.current
              depart.current = null
              if (Math.abs(ecart) > 35) glisser(ecart < 0 ? 1 : -1)
            }}>
            <div style={{ display: 'flex', transform: `translateX(-${avisIndex * 100}%)`, transition: 'transform .45s cubic-bezier(.22,.61,.36,1)' }}>
              {props.avis.map((a, i) => <div key={i} style={{ flex: '0 0 100%', minWidth: 0, boxSizing: 'border-box', paddingRight: 2 }}>{a}</div>)}
            </div>
          </div>
          {props.avis.length > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 12 }}>
              {props.avis.map((_, i) => (
                <button key={i} aria-label={`${i + 1}`} onClick={() => { setAuto(false); setAvisIndex(i) }}
                  style={{ width: i === avisIndex ? 16 : 6, height: 6, borderRadius: 3, border: 0, padding: 0, cursor: 'pointer', background: i === avisIndex ? 'var(--accent)' : '#e5e7eb', transition: 'width .3s, background .3s' }} />
              ))}
            </div>
          )}
          {props.chargerAvis && <Plus onClick={() => { setListe({ avis: [], suite: false, charge: true }); void chargerSuite(0) }}>{traduire('resa.voirTout')}</Plus>}
        </Bloc>
      )}

      {liste && (
        <div onClick={() => setListe(null)} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()}
            onScroll={e => { const el = e.currentTarget; if (liste.suite && !liste.charge && el.scrollTop + el.clientHeight > el.scrollHeight - 200) void chargerSuite(liste.avis.length) }}
            style={{ width: '100%', maxWidth: 480, maxHeight: '86vh', overflowY: 'auto', background: '#fff', borderRadius: '20px 20px 0 0', padding: '18px 16px calc(24px + env(safe-area-inset-bottom))' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 className="vitrine-titre">{traduire('resa.avisDeMesClientes')}</h2>
              <button onClick={() => setListe(null)} aria-label={traduire('resa.fermer')} style={{ width: 34, height: 34, borderRadius: 17, border: 0, background: '#f3f4f6', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <div style={{ display: 'grid', gap: 16 }}>
              {liste.avis.map((a, i) => <div key={i} style={{ paddingTop: i > 0 ? 16 : 0, borderTop: i > 0 ? '1px solid #f3f4f6' : 'none' }}>{a}</div>)}
            </div>
            {liste.charge && <p style={{ textAlign: 'center', color: ENCRE_DOUCE, fontSize: 13, margin: '16px 0 0' }}>…</p>}
          </div>
        </div>
      )}

      {/* 6. L'EMPLACEMENT */}
      {(props.position || props.ville) && (
        <Bloc titre={traduire('resa.emplacementTitre')}>
          {props.position && <CarteCercle lat={props.position.lat} lon={props.position.lon} />}
          {props.ville && <p style={{ margin: '10px 0 0', fontSize: 14, fontWeight: 600 }}>{props.ville}</p>}
          {props.phraseAdresse && <p style={{ margin: '3px 0 0', fontSize: 13, color: ENCRE_DOUCE, lineHeight: 1.5 }}>{props.phraseAdresse}</p>}
        </Bloc>
      )}

      {/* 7. LES CONDITIONS */}
      {props.conditions.length > 0 && (
        <Bloc titre={traduire('resa.conditionsTitre')}>
          <div>
            {props.conditions.map((c, i) => (
              <div key={c.libelle} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '11px 0', borderTop: i > 0 ? '1px solid #f3f4f6' : 'none' }}>
                <span style={{ fontSize: 14, color: '#374151' }}>{c.libelle}</span>
                <span style={{ width: 9, height: 9, borderRadius: 5, flex: 'none', background: c.oui ? '#4CAF6D' : '#D0736B' }} />
              </div>
            ))}
          </div>
        </Bloc>
      )}

      {/* LE BOUTON, toujours à portée de pouce. */}
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 40, padding: '14px 16px calc(14px + env(safe-area-inset-bottom))', background: 'linear-gradient(to top, #f9f9f9 65%, rgba(249,249,249,0))' }}>
        <button onClick={props.onReserver}
          style={{ display: 'block', width: '100%', maxWidth: 448, margin: '0 auto', padding: 16, border: 0, borderRadius: 16, background: BOUTON, color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          {props.texteBouton || traduire('resa.reserver')}
        </button>
      </div>
    </div>
  )
}
