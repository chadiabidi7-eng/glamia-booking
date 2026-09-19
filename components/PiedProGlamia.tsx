'use client'

// ─────────────────────────────────────────────────────────────────────────────
// LE PIED DE PAGE QUI S'ADRESSE AUX PROS — ET À PERSONNE D'AUTRE.
//
// Une page de réservation ne circule pas qu'entre clientes. Une prothésiste
// voit passer le lien d'une consœur, l'ouvre par curiosité, regarde comment
// c'est fait — et repart sans qu'on lui ait jamais parlé. C'est la seule
// occasion qu'on a de l'atteindre, et elle est gratuite.
//
// IL NE DOIT PAS EXISTER POUR LA CLIENTE. Elle vient prendre un rendez-vous :
// tout ce qui n'est pas ça lui vole du temps et fait ressembler la page de sa
// praticienne à une publicité. D'où une ligne grise, en bas, sous le contenu,
// à la taille d'une mention légale — celle qui vient réserver ne la lira
// jamais, celle qui vient regarder la trouvera.
//
// ON COMPTE LE CLIC AVEC `sendBeacon`, PAS AVEC `fetch`. Le lien ouvre l'App
// Store dans la foulée : un `fetch` serait annulé par la navigation, et on
// perdrait exactement les clics qui aboutissent. `sendBeacon` est fait pour
// ça — le navigateur le poste même en quittant la page.
//
// ET LE COMPTAGE NE PEUT PAS EMPÊCHER LE DÉPART : tout est dans un try/catch,
// le lien reste un `<a href>` ordinaire. Si le comptage échoue, la pro arrive
// quand même sur l'App Store.
// ─────────────────────────────────────────────────────────────────────────────

import { traduire } from '@/lib/i18n'

const APP_STORE_URL = 'https://apps.apple.com/us/app/glamia/id6760552102'

type Props = {
  /** La pro dont la page est visitée : c'est elle qui nous ramène la nouvelle. */
  proId?: string
  slug?: string
  /** « parcours » ou « ferme » — pour savoir lequel des deux écrans convertit. */
  ecran: string
  /** Marge basse, à augmenter quand un bandeau collant occupe le bas. */
  margeBasse?: number
}

export default function PiedProGlamia({ proId, slug, ecran, margeBasse = 24 }: Props) {
  const compter = () => {
    try {
      const corps = JSON.stringify({ pro_id: proId ?? null, slug: slug ?? null, ecran })
      navigator.sendBeacon?.('/api/clic-app', new Blob([corps], { type: 'application/json' }))
    } catch { /* le comptage ne doit jamais retenir la pro */ }
  }

  return (
    <div style={{
      textAlign: 'center',
      padding: `20px 16px ${margeBasse}px`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 8, flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: 12, color: '#b9b0b5' }}>{traduire('resa.proAccroche')}</span>
      <a
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={compter}
        style={{
          fontSize: 12, fontWeight: 700, color: '#C2779E',
          textDecoration: 'none', borderBottom: '1px solid rgba(194,119,158,0.35)',
          paddingBottom: 1,
        }}
      >{traduire('resa.proRejoindre')}</a>
    </div>
  )
}
