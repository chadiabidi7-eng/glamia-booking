'use client'

// ─────────────────────────────────────────────────────────────────────────────
// « GLAMIA — L'APPLI DES INDÉPENDANTES BEAUTÉ »
//
// Une page de réservation ne circule pas qu'entre clientes : une prothésiste
// voit passer le lien d'une consœur, l'ouvre par curiosité, et repart sans
// qu'on lui ait jamais parlé. C'est notre seule occasion de l'atteindre.
//
// DEUX ENDROITS, DEUX TONS :
//   `barre` — sur une page vivante. Elle doit être TROUVABLE, pas voyante :
//             la cliente est chez sa praticienne, pas chez nous.
//   `carte` — sur une page fermée, où plus personne ne réserve. Là on peut
//             prendre de la place et parler franchement.
//
// POURQUOI UNE PILULE ET NON UNE BARRE PLEINE LARGEUR : collée bord à bord,
// elle se lit comme un bandeau système — la barre d'adresse, un message de
// cookies, quelque chose qu'on chasse du regard. Détachée des bords et
// arrondie sur ses quatre angles, elle devient un objet posé sur la page :
// on la voit, mais elle n'interrompt rien.
//
// LE BEIGE TRANSLUCIDE ET LE FLOU laissent deviner la page derrière. C'est ce
// qui l'empêche de peser : un aplat opaque coupe l'écran en deux, un verre
// dépoli le prolonge.
//
// LE BADGE EST CELUI D'APPLE, dessiné ici plutôt que chargé en image — sur un
// réseau faible, une image distante laisserait un carré vide. (Et
// `public/icon.png`, que référence /app/[dest], n'existe même pas.)
//
// ON COMPTE LE CLIC AVEC `sendBeacon` : le lien ouvre l'App Store dans la
// foulée, et un `fetch` serait annulé par la navigation — on raterait
// justement les clics qui aboutissent.
// ─────────────────────────────────────────────────────────────────────────────

import { traduire } from '@/lib/i18n'

const APP_STORE_URL = 'https://apps.apple.com/us/app/glamia-beauty/id6760552102'
const ROSE = '#C2779E'

type Variante = 'barre' | 'carte'

type Props = {
  /** La pro dont la page est visitée : c'est elle qui nous amène la nouvelle. */
  proId?: string
  slug?: string
  variante: Variante
}

/** Le badge noir d'Apple, dessiné : pomme + « Télécharger dans l'App Store ». */
function BadgeAppStore({ hauteur = 44 }: { hauteur?: number }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: '#000', color: '#fff', borderRadius: hauteur * 0.22,
      padding: `0 ${hauteur * 0.28}px`, height: hauteur,
      textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      <svg width={hauteur * 0.5} height={hauteur * 0.5} viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
        <path d="M17.05 12.04c-.03-2.8 2.29-4.15 2.39-4.21-1.3-1.9-3.33-2.16-4.05-2.19-1.72-.17-3.36 1.01-4.24 1.01-.87 0-2.22-.99-3.65-.96-1.88.03-3.61 1.09-4.58 2.77-1.95 3.39-.5 8.41 1.4 11.16.93 1.35 2.04 2.86 3.5 2.81 1.4-.06 1.93-.91 3.63-.91 1.69 0 2.17.91 3.65.88 1.51-.03 2.46-1.37 3.38-2.73 1.07-1.57 1.51-3.09 1.53-3.17-.03-.01-2.94-1.13-2.97-4.46zM14.28 3.9c.77-.94 1.29-2.24 1.15-3.54-1.11.05-2.46.74-3.26 1.67-.71.83-1.34 2.16-1.17 3.43 1.24.1 2.5-.63 3.28-1.56z" />
      </svg>
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05, textAlign: 'left' }}>
        <span style={{ fontSize: hauteur * 0.19, opacity: 0.9 }}>{traduire('resa.proBadgeLigne1')}</span>
        <span style={{ fontSize: hauteur * 0.33, fontWeight: 600, letterSpacing: '-0.01em' }}>App Store</span>
      </span>
    </span>
  )
}

export default function PiedProGlamia({ proId, slug, variante }: Props) {
  const compter = () => {
    try {
      const corps = JSON.stringify({ pro_id: proId ?? null, slug: slug ?? null, ecran: variante })
      navigator.sendBeacon?.('/api/clic-app', new Blob([corps], { type: 'application/json' }))
    } catch { /* le comptage ne doit jamais retenir la pro */ }
  }

  const lien = (enfants: React.ReactNode, style?: React.CSSProperties) => (
    <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" onClick={compter}
       style={{ textDecoration: 'none', display: 'inline-flex', ...style }}>{enfants}</a>
  )

  // ── LA PILULE DU BAS ──
  if (variante === 'barre') {
    return (
      <div style={{
        position: 'fixed', zIndex: 15,
        left: 12, right: 12, bottom: 'calc(12px + env(safe-area-inset-bottom))',
        maxWidth: 456, margin: '0 auto',
        // Le verre dépoli : beige de la maison, laissé translucide pour qu'on
        // devine la page en dessous.
        background: 'rgba(253,246,240,0.82)',
        backdropFilter: 'saturate(180%) blur(16px)',
        WebkitBackdropFilter: 'saturate(180%) blur(16px)',
        border: '1px solid rgba(194,119,158,0.22)',
        borderRadius: 18,
        boxShadow: '0 8px 26px rgba(122,62,95,0.13), inset 0 1px 0 rgba(255,255,255,0.65)',
        padding: '8px 10px 8px 15px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div style={{ minWidth: 0 }}>
          {/* Le nom porte l'interlettrage d'un logotype : c'est ce qui le fait
              lire comme une marque et non comme un mot dans une phrase. */}
          <p style={{
            margin: 0, fontSize: 13, fontWeight: 800, color: ROSE,
            letterSpacing: '0.14em', lineHeight: 1.2,
          }}>GLAMIA</p>
          <p style={{
            margin: '2px 0 0', fontSize: 9, fontWeight: 600,
            color: 'rgba(194,119,158,0.78)', textTransform: 'uppercase',
            letterSpacing: '0.07em', lineHeight: 1.25,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{traduire('resa.proBaseline')}</p>
        </div>
        {lien(<BadgeAppStore hauteur={32} />)}
      </div>
    )
  }

  // ── LA CARTE : là où personne n'est en train de réserver ──
  return (
    <div style={{
      background: 'linear-gradient(160deg, #FFF1F7 0%, #FCE7F1 55%, #F7DCEC 100%)',
      border: '1px solid #F4D3E4', borderRadius: 20,
      padding: '22px 18px 20px', textAlign: 'center', marginTop: 20,
      boxShadow: '0 6px 18px rgba(194,119,158,0.10)',
    }}>
      <p style={{ margin: '0 0 6px', fontSize: 16.5, fontWeight: 800, color: '#7A3E5F', lineHeight: 1.3 }}>
        {traduire('resa.proAccroche')}
      </p>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: '#9A6A82', lineHeight: 1.5 }}>
        {traduire('resa.proBaseline')}
      </p>
      {lien(<BadgeAppStore hauteur={46} />)}
    </div>
  )
}
