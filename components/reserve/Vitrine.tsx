'use client'

/* eslint-disable @next/next/no-img-element */
import dynamic from 'next/dynamic'
import { useState, type ReactNode } from 'react'
import { Star } from 'lucide-react'
import { traduire } from '@/lib/i18n'

// ─────────────────────────────────────────────────────────────────────────────
// LA VITRINE DE LA PRO — le haut de sa page de réservation (3.0, 27 sept. 2026)
//
// L'ordre voulu par Chadi, sur le modèle d'IARA, dans la DA Glamia :
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

const ENCRE = '#1C1C1E'
const ENCRE_DOUCE = '#6B6B70'
const ROSE = '#C77A96'
const ROSE_PROFOND = '#A85F7C'
const FILET = '#EDE0E8'

export type SoinVitrine = { cle: string; nom: string; photos: string[]; duree: string; prix: string }
export type CategorieVitrine = { nom: string; libelle: string; soins: SoinVitrine[] }

const SOINS_VISIBLES = 4
const PHOTOS_VISIBLES = 6
const AVIS_VISIBLES = 3

function Bloc({ titre, chute, children }: { titre: string; chute?: string; children: ReactNode }) {
  return (
    <section style={{ background: '#fff', border: `1px solid ${FILET}`, borderRadius: 22, padding: '20px 18px', marginBottom: 12 }}>
      <h2 className="vitrine-titre">{titre}{chute ? <> <em>{chute}</em></> : null}</h2>
      <div style={{ marginTop: 14 }}>{children}</div>
    </section>
  )
}

function Plus({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} style={{ marginTop: 14, border: 0, borderRadius: 12, padding: '10px 16px', background: '#F6F1F3', color: ENCRE, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
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
  position: { lat: number; lon: number } | null
  phraseAdresse: string | null
  conditions: { libelle: string; oui: boolean }[]
  ouvrirPhotos: (photos: string[], index: number) => void
  onReserver: () => void
}) {
  const [categorie, setCategorie] = useState(0)
  const [tousSoins, setTousSoins] = useState(false)
  const [toutesPhotos, setToutesPhotos] = useState(false)
  const [tousAvis, setTousAvis] = useState(false)
  const cat = props.categories[categorie] ?? props.categories[0]
  const nbSoins = props.categories.reduce((n, c) => n + c.soins.length, 0)
  const soins = cat ? (tousSoins ? cat.soins : cat.soins.slice(0, SOINS_VISIBLES)) : []

  return (
    <div className="vitrine">
      <style>{`
        .vitrine { font-family: var(--font-jakarta), -apple-system, system-ui, sans-serif; color: ${ENCRE}; }
        .vitrine .vitrine-titre { font-family: var(--font-fraunces), Georgia, serif; font-weight: 500; font-size: 24px; letter-spacing: -0.02em; line-height: 1.1; margin: 0; }
        .vitrine .vitrine-titre em { font-style: italic; color: ${ROSE}; }
        .vitrine-onglets { display: flex; gap: 22px; overflow-x: auto; scrollbar-width: none; margin: 0 -18px; padding: 0 18px; border-bottom: 1px solid ${FILET}; }
        .vitrine-onglets::-webkit-scrollbar { display: none; }
      `}</style>

      {/* 1. LE PROFIL */}
      <section style={{ background: '#fff', border: `1px solid ${FILET}`, borderRadius: 22, padding: 18, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="vitrine-titre" style={{ fontSize: 30 }}>{props.nom}</h1>
            {props.note !== null && (
              <p style={{ margin: '8px 0 0', display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 600 }}>
                <Star size={16} fill={ROSE} color={ROSE} strokeWidth={0} />
                {props.note.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                <span style={{ color: ENCRE_DOUCE, fontWeight: 500 }}>({props.nbAvis})</span>
              </p>
            )}
            {props.ville && <p style={{ margin: '4px 0 0', color: ENCRE_DOUCE, fontSize: 15 }}>{props.ville}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>{props.reseaux}</div>
          </div>
          <div style={{ width: 92, height: 92, borderRadius: 46, overflow: 'hidden', flexShrink: 0, background: '#FBEEF2', boxShadow: `0 0 0 3px #fff, 0 0 0 4px ${FILET}` }}>
            {props.photoProfil
              ? <img src={props.photoProfil} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-fraunces), serif', fontSize: 34, color: ROSE_PROFOND }}>{props.nom.slice(0, 1).toUpperCase()}</div>}
          </div>
        </div>
        {props.prochaineDispo && (
          <p style={{ margin: '16px 0 0', display: 'flex', alignItems: 'center', gap: 9, fontSize: 15 }}>
            <span style={{ width: 9, height: 9, borderRadius: 5, background: '#3DAA6B', flex: 'none' }} />
            <span>{props.prochaineDispo}</span>
          </p>
        )}
        {props.couverture && (
          <button onClick={() => props.ouvrirPhotos([props.couverture!], 0)} style={{ display: 'block', width: '100%', marginTop: 16, padding: 0, border: 0, borderRadius: 18, overflow: 'hidden', cursor: 'pointer', aspectRatio: '16 / 9', background: '#F6F1F3' }}>
            <img src={props.couverture} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </button>
        )}
      </section>

      {/* 2. LA BIO */}
      {props.bio && (
        <Bloc titre={traduire('resa.bioDe')} chute={props.nom}>
          <p style={{ margin: 0, whiteSpace: 'pre-line', fontSize: 15.5, lineHeight: 1.6, color: '#3B3B40' }}>{props.bio}</p>
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
                    style={{ flexShrink: 0, border: 0, background: 'transparent', padding: '0 0 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: on ? ROSE_PROFOND : ENCRE_DOUCE, borderBottom: `2px solid ${on ? ROSE : 'transparent'}` }}>
                    {c.libelle}
                  </button>
                )
              })}
            </div>
          )}
          <div>
            {soins.map((s, i) => (
              <div key={s.cle} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderTop: i > 0 ? `1px solid #F4EEF1` : 'none' }}>
                {s.photos.length > 0 ? (
                  <button onClick={() => props.ouvrirPhotos(s.photos, 0)} aria-label={s.nom} style={{ width: 64, height: 64, borderRadius: 14, overflow: 'hidden', padding: 0, border: 0, flexShrink: 0, cursor: 'pointer', background: '#FBEEF2' }}>
                    <img src={s.photos[0]} alt="" loading="lazy" style={{ width: 64, height: 64, objectFit: 'cover', display: 'block' }} />
                  </button>
                ) : null}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 15.5, fontWeight: 600 }}>{s.nom}</p>
                  <p style={{ margin: '3px 0 0', fontSize: 14, color: ENCRE_DOUCE }}>{s.duree} · {s.prix}</p>
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
              <button key={ph + i} onClick={() => props.ouvrirPhotos(props.photos, i)} style={{ aspectRatio: '1', padding: 0, border: 0, borderRadius: 14, overflow: 'hidden', cursor: 'pointer', background: '#FBEEF2' }}>
                <img src={ph} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </button>
            ))}
          </div>
          {!toutesPhotos && props.photos.length > PHOTOS_VISIBLES && <Plus onClick={() => setToutesPhotos(true)}>{traduire('resa.voirTout')}</Plus>}
        </Bloc>
      )}

      {/* 5. LES AVIS */}
      {props.avis.length > 0 && (
        <Bloc titre={traduire('resa.avisDeSesClientes')}>
          <div style={{ display: 'grid', gap: 16 }}>
            {(tousAvis ? props.avis : props.avis.slice(0, AVIS_VISIBLES)).map((a, i) => (
              <div key={i} style={{ paddingTop: i > 0 ? 16 : 0, borderTop: i > 0 ? '1px solid #F4EEF1' : 'none' }}>{a}</div>
            ))}
          </div>
          {!tousAvis && props.avis.length > AVIS_VISIBLES && <Plus onClick={() => setTousAvis(true)}>{traduire('resa.voirTousLesAvis')}</Plus>}
        </Bloc>
      )}

      {/* 6. L'EMPLACEMENT */}
      {(props.position || props.ville) && (
        <Bloc titre={traduire('resa.emplacementTitre')}>
          {props.position && <CarteCercle lat={props.position.lat} lon={props.position.lon} />}
          {props.ville && <p style={{ margin: '12px 0 0', fontSize: 15.5, fontWeight: 600 }}>{props.ville}</p>}
          {props.phraseAdresse && <p style={{ margin: '4px 0 0', fontSize: 14, color: ENCRE_DOUCE, lineHeight: 1.5 }}>{props.phraseAdresse}</p>}
        </Bloc>
      )}

      {/* 7. LES CONDITIONS */}
      {props.conditions.length > 0 && (
        <Bloc titre={traduire('resa.conditionsTitre')}>
          <div>
            {props.conditions.map((c, i) => (
              <div key={c.libelle} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 0', borderTop: i > 0 ? '1px solid #F4EEF1' : 'none' }}>
                <span style={{ fontSize: 15.5 }}>{c.libelle}</span>
                <span style={{ width: 9, height: 9, borderRadius: 5, flex: 'none', background: c.oui ? '#3DAA6B' : '#D0736B' }} />
              </div>
            ))}
          </div>
        </Bloc>
      )}

      {/* LE BOUTON, toujours à portée de pouce. */}
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 40, padding: '14px 16px calc(14px + env(safe-area-inset-bottom))', background: 'linear-gradient(to top, #FAF4ED 65%, rgba(250,244,237,0))' }}>
        <button onClick={props.onReserver}
          style={{ display: 'block', width: '100%', maxWidth: 448, margin: '0 auto', height: 56, border: 0, borderRadius: 18, background: '#C2779E', color: '#fff', fontSize: 17, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 10px 24px rgba(194,119,158,0.35)' }}>
          {traduire('resa.reserver')}
        </button>
      </div>
    </div>
  )
}
