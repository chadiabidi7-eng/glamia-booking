'use client'

// ─────────────────────────────────────────────────────────────────────────────
// « REJOINS GLAMIA » — LA MAIN TENDUE AUX PROS QUI PASSENT PAR LÀ.
//
// Une page de réservation ne circule pas qu'entre clientes : une prothésiste
// voit passer le lien d'une consœur, l'ouvre par curiosité, et repart sans
// qu'on lui ait jamais parlé. C'est notre seule occasion de l'atteindre.
//
// TROIS VARIANTES, POSÉES EN MÊME TEMPS POUR CHOISIR SUR PIÈCE :
//   `haut`  — sous l'en-tête du salon, vue dès l'ouverture puis oubliée
//   `barre` — collée en bas de l'écran, impossible à manquer, toujours là
//   `carte` — un bloc franc, pour les écrans où personne ne réserve
//
// LE BADGE EST CELUI D'APPLE, pas un bouton maison : « Rejoins Glamia » ne dit
// pas où aller, alors que le badge noir se reconnaît sans lire et annonce à la
// fois la boutique et le geste. Il est dessiné ici plutôt que chargé en image :
// une cliente sur un réseau faible verrait un carré vide à la place.
//
// ON COMPTE LE CLIC AVEC `sendBeacon`. Le lien ouvre l'App Store dans la
// foulée : un `fetch` serait annulé par la navigation et raterait justement
// les clics qui aboutissent. Et le comptage ne peut rien bloquer — tout est
// dans un try/catch, le lien reste un `<a href>` ordinaire.
// ─────────────────────────────────────────────────────────────────────────────

import { traduire } from '@/lib/i18n'

const APP_STORE_URL = 'https://apps.apple.com/us/app/glamia-beauty/id6760552102'

type Variante = 'haut' | 'barre' | 'carte'

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
      display: 'inline-flex', alignItems: 'center', gap: 8,
      background: '#000', color: '#fff', borderRadius: hauteur * 0.2,
      padding: `0 ${hauteur * 0.32}px`, height: hauteur,
      textDecoration: 'none', whiteSpace: 'nowrap',
    }}>
      <svg width={hauteur * 0.52} height={hauteur * 0.52} viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
        <path d="M17.05 12.04c-.03-2.8 2.29-4.15 2.39-4.21-1.3-1.9-3.33-2.16-4.05-2.19-1.72-.17-3.36 1.01-4.24 1.01-.87 0-2.22-.99-3.65-.96-1.88.03-3.61 1.09-4.58 2.77-1.95 3.39-.5 8.41 1.4 11.16.93 1.35 2.04 2.86 3.5 2.81 1.4-.06 1.93-.91 3.63-.91 1.69 0 2.17.91 3.65.88 1.51-.03 2.46-1.37 3.38-2.73 1.07-1.57 1.51-3.09 1.53-3.17-.03-.01-2.94-1.13-2.97-4.46zM14.28 3.9c.77-.94 1.29-2.24 1.15-3.54-1.11.05-2.46.74-3.26 1.67-.71.83-1.34 2.16-1.17 3.43 1.24.1 2.5-.63 3.28-1.56z" />
      </svg>
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05, textAlign: 'left' }}>
        <span style={{ fontSize: hauteur * 0.2, opacity: 0.9 }}>{traduire('resa.proBadgeLigne1')}</span>
        <span style={{ fontSize: hauteur * 0.34, fontWeight: 600, letterSpacing: '-0.01em' }}>App Store</span>
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

  // ── EN HAUT : une bande fine, sous l'en-tête ──
  if (variante === 'haut') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        flexWrap: 'wrap', padding: '10px 16px',
        background: '#FDF3F8', borderBottom: '1px solid #F2E2EC',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#6b5560' }}>{traduire('resa.proAccroche')}</span>
        {lien(<BadgeAppStore hauteur={36} />)}
      </div>
    )
  }

  // ── EN BAS, COLLÉE : visible dès l'ouverture et à chaque instant ──
  if (variante === 'barre') {
    return (
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 15,
        background: 'rgba(255,255,255,0.97)', borderTop: '1px solid #F2E2EC',
        boxShadow: '0 -2px 14px rgba(0,0,0,0.06)',
        padding: '8px 16px calc(8px + env(safe-area-inset-bottom))',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#6b5560' }}>{traduire('resa.proAccroche')}</span>
        {lien(<BadgeAppStore hauteur={38} />)}
      </div>
    )
  }

  // ── LA CARTE : là où personne n'est en train de réserver ──
  return (
    <div style={{
      background: '#FDF3F8', border: '1px solid #F2E2EC', borderRadius: 18,
      padding: '20px 18px', textAlign: 'center', marginTop: 20,
    }}>
      <p style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 800, color: '#3f3037' }}>{traduire('resa.proAccroche')}</p>
      {lien(<BadgeAppStore hauteur={46} />)}
    </div>
  )
}
