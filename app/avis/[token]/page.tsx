'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { Camera, CheckCircle, ImagePlus, X } from 'lucide-react'
import { preparerPhotoAvis, type PhotoPreparee } from '@/lib/photo-avis'
import { traduire } from '@/lib/i18n'

// ─────────────────────────────────────────────────────────────────────────────
// « Laisse ton avis » — la page que la cliente ouvre après son rendez-vous.
//
// LA NOTE D'ABORD, ET ELLE SUFFIT. Le texte et les photos sont facultatifs :
// une cliente pressée doit pouvoir noter en deux touches et fermer. Exiger un
// commentaire, c'est n'obtenir que les avis des mécontentes — ce sont les
// seules assez motivées pour écrire.
//
// TROIS PHOTOS AU PLUS, recadrées en carré dans son navigateur. Rien ne part
// tant qu'elle n'a pas envoyé : elle peut en retirer une, en reprendre une
// autre, changer d'avis.
//
// LA PAGE NE DÉCIDE DE RIEN. Le droit de déposer, la fenêtre de trois jours,
// l'unicité : tout est jugé par le serveur, avant l'affichage et à nouveau
// avant l'écriture.
// ─────────────────────────────────────────────────────────────────────────────

const ROSE = '#D4537E'
const CREME = '#FDF8F5'
const ENCRE = '#2D2D2D'
const GRIS = '#8A8A9A'
const BORD = '#EDE0E8'

type Etat =
  | { chargement: true }
  | { chargement: false; ouvert: true; pro: string; prestations: string; quand: string }
  | { chargement: false; ouvert: false; raison: string }

// UNE FONCTION, PAS UNE CONSTANTE : lue au chargement du fichier, elle
// resterait dans la langue de départ. Voir scripts/textes-figes.mjs.
const MESSAGES: () => Record<string, { titre: string; texte: string }> = () => ({
  inconnu: { titre: traduire('avis.lienIntrouvable'), texte: traduire('avis.lienInconnu') },
  annule: { titre: traduire('avis.rdvAnnule'), texte: traduire('avis.rdvAnnuleDetail') },
  trop_tot: { titre: traduire('avis.tropTot'), texte: traduire('avis.tropTotDetail') },
  trop_tard: { titre: traduire('avis.delaiPasse'), texte: traduire('avis.delaiPasseDetail') },
  deja: { titre: traduire('avis.dejaEnvoye'), texte: traduire('avis.dejaLaisse') },
  ferme: { titre: traduire('avis.desactivesTitre'), texte: traduire('avis.desactives') },
})

export default function PageAvis() {
  const { token } = useParams<{ token: string }>()

  const [etat, setEtat] = useState<Etat>({ chargement: true })
  const [note, setNote] = useState(0)
  const [survol, setSurvol] = useState(0)
  const [texte, setTexte] = useState('')
  const [photos, setPhotos] = useState<PhotoPreparee[]>([])
  const [prepare, setPrepare] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoye, setEnvoye] = useState(false)

  const champFichier = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/avis/${token}`)
      .then(r => r.json())
      .then(d => setEtat({ chargement: false, ...d }))
      .catch(() => setEtat({ chargement: false, ouvert: false, raison: 'inconnu' }))
  }, [token])

  const ajouterPhotos = async (fichiers: FileList | null) => {
    if (!fichiers?.length) return
    setPrepare(true)
    setErreur(null)
    try {
      const place = 3 - photos.length
      const retenus = Array.from(fichiers).slice(0, place)
      const prets = await Promise.all(retenus.map(preparerPhotoAvis))
      setPhotos(p => [...p, ...prets])
    } catch {
      setErreur(traduire('avis.photoIllisible'))
    } finally {
      setPrepare(false)
      if (champFichier.current) champFichier.current.value = ''
    }
  }

  const envoyer = async () => {
    if (note === 0 || envoi) return
    setEnvoi(true)
    setErreur(null)
    try {
      const r = await fetch(`/api/avis/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note, texte, photos }),
      })
      const d = await r.json()
      if (!r.ok) {
        setErreur(MESSAGES()[d.error]?.texte ?? traduire('avis.envoiRate'))
        return
      }
      setEnvoye(true)
    } catch {
      setErreur(traduire('avis.envoiRateConnexion'))
    } finally {
      setEnvoi(false)
    }
  }

  if (etat.chargement) {
    return <Cadre><p style={S.attente}>{traduire('resa.unInstant')}</p></Cadre>
  }

  if (envoye) {
    return (
      <Cadre>
        <div style={S.centre}>
          <CheckCircle size={42} color={ROSE} />
          <h1 style={S.titre}>{traduire('avis.merci')}</h1>
          <p style={S.texteDoux}>{traduire('avis.merciDetail')}</p>
        </div>
      </Cadre>
    )
  }

  if (!etat.ouvert) {
    const m = MESSAGES()[etat.raison] ?? MESSAGES().inconnu
    return (
      <Cadre>
        <div style={S.centre}>
          <h1 style={S.titre}>{m.titre}</h1>
          <p style={S.texteDoux}>{m.texte}</p>
        </div>
      </Cadre>
    )
  }

  const jour = new Date(etat.quand).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  })

  return (
    <Cadre>
      <h1 style={S.titre}>{traduire('avis.titre')}</h1>
      <p style={S.sousTitre}>
        {etat.prestations ? `${etat.prestations} · ` : ''}{jour}, avec {etat.pro}
      </p>

      {/* ── LA NOTE ── le seul geste obligatoire. */}
      <div style={S.etoiles}>
        {[1, 2, 3, 4, 5].map(i => (
          <button
            key={i}
            type="button"
            aria-label={`${i} étoile${i > 1 ? 's' : ''}`}
            onPointerDown={() => { setNote(i); setSurvol(0) }}
            onPointerEnter={e => { if (e.pointerType === 'mouse') setSurvol(i) }}
            onPointerLeave={() => setSurvol(0)}
            style={{
              ...S.etoile,
              color: i <= (survol || note) ? ROSE : '#E3D8DF',
              transform: i === (survol || note) ? 'scale(1.08)' : 'none',
            }}>
            ★
          </button>
        ))}
      </div>

      <textarea
        value={texte}
        onChange={e => setTexte(e.target.value.slice(0, 1000))}
        placeholder={traduire('avis.placeholder')}
        style={S.champ}
        rows={5}
      />

      {/* ── LES PHOTOS ── */}
      <div style={S.photos}>
        {photos.map((p, i) => (
          <div key={i} style={S.vignette}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.vignette} alt="" style={S.vignetteImage} />
            <button
              type="button"
              aria-label={traduire('resa.retirerPhoto')}
              onClick={() => setPhotos(l => l.filter((_, j) => j !== i))}
              style={S.retirer}>
              <X size={13} color="#fff" />
            </button>
          </div>
        ))}

        {photos.length < 3 && (
          <button
            type="button"
            onClick={() => champFichier.current?.click()}
            disabled={prepare}
            style={S.ajouter}>
            {prepare ? <Camera size={19} color={GRIS} /> : <ImagePlus size={19} color={ROSE} />}
            <span style={S.ajouterTexte}>{prepare ? traduire('resa.unInstant') : traduire('avis.photo')}</span>
          </button>
        )}
      </div>
      <input
        ref={champFichier}
        type="file"
        accept="image/*"
        multiple
        onChange={e => ajouterPhotos(e.target.files)}
        style={{ display: 'none' }}
      />

      {erreur && <p style={S.erreur}>{erreur}</p>}

      <button
        type="button"
        onClick={envoyer}
        disabled={note === 0 || envoi || prepare}
        style={{ ...S.envoyer, opacity: note === 0 || envoi || prepare ? 0.4 : 1 }}>
        {envoi ? 'Envoi…' : traduire('avis.envoyer')}
      </button>

      <p style={S.mention}>{traduire('avis.prenomInitiale')}</p>
    </Cadre>
  )
}

function Cadre({ children }: { children: React.ReactNode }) {
  return (
    <main style={S.page}>
      <div style={S.carte}>{children}</div>
    </main>
  )
}

const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100dvh', backgroundColor: CREME,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18,
  },
  carte: {
    width: '100%', maxWidth: 460, backgroundColor: '#fff', borderRadius: 22,
    border: `1px solid ${BORD}`, padding: 24,
  },
  centre: { textAlign: 'center', display: 'grid', justifyItems: 'center', gap: 10, padding: '18px 0' },
  attente: { textAlign: 'center', color: GRIS, fontSize: 14, padding: '30px 0' },

  titre: { fontSize: 23, fontWeight: 800, color: ENCRE, margin: 0, lineHeight: 1.25 },
  sousTitre: { fontSize: 13.5, color: GRIS, margin: '6px 0 0' },
  texteDoux: { fontSize: 14, color: GRIS, lineHeight: 1.5, margin: 0 },

  etoiles: { display: 'flex', gap: 6, justifyContent: 'center', margin: '26px 0 20px' },
  etoile: {
    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
    fontSize: 40, lineHeight: 1, transition: 'transform .12s, color .12s',
  },

  champ: {
    width: '100%', boxSizing: 'border-box', border: `1px solid ${BORD}`, borderRadius: 15,
    padding: 13, fontSize: 15, lineHeight: 1.5, color: ENCRE, resize: 'vertical',
    fontFamily: 'inherit', outlineColor: ROSE,
  },

  photos: { display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 13 },
  vignette: { position: 'relative', width: 78, height: 78, borderRadius: 13, overflow: 'hidden' },
  vignetteImage: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  retirer: {
    position: 'absolute', top: 4, right: 4, width: 21, height: 21, borderRadius: 11,
    border: 'none', background: 'rgba(20,10,16,0.6)', cursor: 'pointer',
    display: 'grid', placeItems: 'center', padding: 0,
  },
  ajouter: {
    width: 78, height: 78, borderRadius: 13, border: `1px dashed ${BORD}`,
    background: '#FDF8FB', cursor: 'pointer', display: 'grid', placeItems: 'center',
    gap: 3, fontFamily: 'inherit',
  },
  ajouterTexte: { fontSize: 11, fontWeight: 700, color: GRIS },

  erreur: { fontSize: 13, color: '#C0574C', margin: '14px 0 0', lineHeight: 1.4 },

  envoyer: {
    width: '100%', marginTop: 20, padding: '15px 0', borderRadius: 15, border: 'none',
    backgroundColor: ROSE, color: '#fff', fontSize: 15.5, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  mention: { fontSize: 11.5, color: GRIS, textAlign: 'center', margin: '12px 0 0' },
}
