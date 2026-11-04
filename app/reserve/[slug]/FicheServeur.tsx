// ─────────────────────────────────────────────────────────────────────────────
// LA FICHE QUE GOOGLE LIT (13 oct. 2026).
//
// La page de réservation se construit dans le navigateur. Le HTML qui partait
// vers Google ne contenait que « Chargement… » : une page vide à ses yeux, donc
// jamais montrée, même chez les Ultra qui ont allumé le référencement.
//
// Ce composant serveur joint au HTML ce que la page affichera de toute façon :
// le nom, le métier, la ville, les prestations avec durée et prix, la note et
// la présentation — plus les mêmes informations en données structurées, la
// forme que Google sait transformer en fiche avec étoiles et prix.
//
// RIEN DE CACHÉ, RIEN D'INVENTÉ. Tout vient de ce que la pro a écrit, et tout
// est aussi sur la page finale. La fiche est rendue sous l'écran d'attente
// (qui occupe tout l'écran) et la page la retire dès qu'elle s'affiche : la
// cliente ne la voit pas. Jamais l'adresse exacte : la ville seulement.
// ─────────────────────────────────────────────────────────────────────────────

import { nomSoinAffiche } from '@/lib/catalogue-affiche'

type Prestation = { nom: string; prix: number | null; duree: number | null; aPartir: boolean }

const SUIVI = /^(d[ée]pose|retrait|retirada|removal|rimozione)$/i

function prestations(data: unknown, langue: string | null, max = 30): Prestation[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return []
  const vus = new Set<string>()
  const liste: Prestation[] = []
  for (const [categorie, items] of Object.entries(data as Record<string, unknown>)) {
    if (!Array.isArray(items)) continue
    for (const item of items) {
      if (liste.length >= max) return liste
      if (!item || typeof item !== 'object') continue
      const p = item as { nom?: unknown; prix?: unknown; duree?: unknown; active?: unknown; prix_type?: unknown }
      if (p.active !== true) continue
      const nom = typeof p.nom === 'string' ? p.nom.trim() : ''
      if (!nom || SUIVI.test(nom)) continue
      const cle = nom.toLowerCase().replace(/\s+/g, ' ')
      if (vus.has(cle)) continue
      vus.add(cle)
      const prix = typeof p.prix === 'number' && p.prix > 0 ? p.prix : null
      const duree = typeof p.duree === 'number' && p.duree > 0 ? p.duree : null
      // Affichage seulement : un soin du catalogue se lit dans la langue de la page.
      liste.push({ nom: nomSoinAffiche(nom, categorie, langue), prix, duree, aPartir: typeof p.prix_type === 'string' && p.prix_type !== 'fixe' })
    }
  }
  return liste
}

const MOTS = {
  fr: { prestations: 'Prestations', avis: 'avis', aPartir: 'à partir de', min: 'min', reserver: 'Réserver en ligne', ville: 'Toutes les pros beauté à', avisTitre: 'Avis des clientes', a: 'à',
    intro: 'Réservez en ligne, à toute heure : choisissez votre prestation et un créneau parmi ses disponibilités.' },
  en: { prestations: 'Services', avis: 'reviews', aPartir: 'from', min: 'min', reserver: 'Book online', ville: 'All beauty pros in', avisTitre: 'Client reviews', a: 'in',
    intro: 'Book online at any time: choose your service and an available slot.' },
  es: { prestations: 'Servicios', avis: 'reseñas', aPartir: 'desde', min: 'min', reserver: 'Reservar en línea', ville: 'Todas las profesionales de belleza en', avisTitre: 'Opiniones de clientas', a: 'en',
    intro: 'Reserva en línea a cualquier hora: elige tu servicio y un horario disponible.' },
  it: { prestations: 'Servizi', avis: 'recensioni', aPartir: 'da', min: 'min', reserver: 'Prenota online', ville: 'Tutte le professioniste della bellezza a', avisTitre: 'Recensioni delle clienti', a: 'a',
    intro: 'Prenota online a qualsiasi ora: scegli il trattamento e un orario disponibile.' },
} as const

type Avis = { auteur: string; note: number; texte: string; date: string; importe: boolean }

export default function FicheServeur({ slug, nom, langue, metiers, ville, pays, devise, bio, image, catalogue, note, avis = [], lienVille = null }: {
  slug: string
  nom: string
  langue: string | null
  metiers: string
  ville: string | null
  pays: string | null
  devise: string
  bio: string | null
  image: string | null
  catalogue: unknown
  note: { note: number; nombre: number } | null
  /** Ses derniers avis écrits (25 oct. 2026) : le seul texte qui n'appartient qu'à elle. */
  avis?: Avis[]
  /** La page de sa ville dans la recherche, quand elle existe (13 oct. 2026). */
  lienVille?: { nom: string; url: string } | null
}) {
  const L = langue === 'en' || langue === 'es' || langue === 'it' ? langue : 'fr'
  const M = MOTS[L]
  const liste = prestations(catalogue, langue)
  const monnaie = (devise || 'EUR').toUpperCase()
  const format = new Intl.NumberFormat(L === 'en' ? 'en-GB' : L === 'es' ? 'es-ES' : L === 'it' ? 'it-IT' : 'fr-FR', { style: 'currency', currency: monnaie, maximumFractionDigits: 2 })
  const url = `https://booking.glamia.pro/reserve/${slug}`

  // Les données structurées : un salon de beauté, sa ville, sa note, ses prestations.
  const donnees: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'BeautySalon',
    name: nom,
    url,
    ...(image ? { image } : {}),
    ...(bio ? { description: bio.slice(0, 500) } : metiers ? { description: metiers } : {}),
    ...(ville || pays ? { address: { '@type': 'PostalAddress', ...(ville ? { addressLocality: ville } : {}), ...(pays ? { addressCountry: pays } : {}) } } : {}),
    ...(note ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: Math.round(note.note * 10) / 10, reviewCount: note.nombre, bestRating: 5, worstRating: 1 } } : {}),
    // Les avis repris d'une autre plateforme restent sur la page, mais pas
    // dans les données structurées : Google n'accepte que ceux recueillis ici.
    ...(avis.some(a => !a.importe) ? {
      review: avis.filter(a => !a.importe).map(a => ({
        '@type': 'Review',
        author: { '@type': 'Person', name: a.auteur || '—' },
        ...(a.date ? { datePublished: a.date.slice(0, 10) } : {}),
        reviewBody: a.texte.slice(0, 600),
        reviewRating: { '@type': 'Rating', ratingValue: a.note, bestRating: 5, worstRating: 1 },
      })),
    } : {}),
    ...(liste.length ? {
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        name: M.prestations,
        itemListElement: liste.map(p => ({
          '@type': 'Offer',
          itemOffered: { '@type': 'Service', name: p.nom },
          ...(p.prix != null ? { price: p.prix, priceCurrency: monnaie } : {}),
        })),
      },
    } : {}),
  }

  return (
    <section id="fiche-serveur" lang={L} style={{ maxWidth: 640, margin: '0 auto', padding: '32px 20px', fontFamily: 'system-ui, sans-serif', color: '#1f2937' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(donnees).replace(/</g, '\\u003c') }} />
      <h1 style={{ fontSize: 22, margin: 0 }}>{nom}</h1>
      {(metiers || ville) && <p style={{ margin: '4px 0 0', color: '#6b7280' }}>{[metiers, ville].filter(Boolean).join(' · ')}</p>}
      {/* UNE PHRASE QUI DIT CE QUE LA CLIENTE CHERCHE (25 oct. 2026) : son
          métier et sa ville en toutes lettres, comme on les tape dans Google. */}
      <p style={{ margin: '10px 0 0' }}>
        {metiers ? `${nom} : ${L === 'en' ? metiers : metiers.toLowerCase()}${ville ? ` ${M.a} ${ville}` : ''}. ` : ''}{M.intro}
      </p>
      {note && <p style={{ margin: '6px 0 0' }}>★ {note.note.toFixed(1).replace('.', L === 'en' ? '.' : ',')} · {note.nombre} {M.avis}</p>}
      {bio && <p style={{ margin: '12px 0 0', whiteSpace: 'pre-line' }}>{bio}</p>}
      {liste.length > 0 && (
        <>
          <h2 style={{ fontSize: 17, margin: '20px 0 8px' }}>{M.prestations}</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {liste.map(p => (
              <li key={p.nom} style={{ padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                {p.nom}
                {(p.duree != null || p.prix != null) && ' — '}
                {p.duree != null && `${p.duree} ${M.min}`}
                {p.duree != null && p.prix != null && ' · '}
                {p.prix != null && `${p.aPartir ? `${M.aPartir} ` : ''}${format.format(p.prix)}`}
              </li>
            ))}
          </ul>
        </>
      )}
      {avis.length > 0 && (
        <>
          <h2 style={{ fontSize: 17, margin: '20px 0 8px' }}>{M.avisTitre}</h2>
          {avis.map((a, i) => (
            <blockquote key={i} style={{ margin: '0 0 10px', padding: 0 }}>
              <p style={{ margin: 0 }}>{'★'.repeat(Math.max(0, Math.min(5, Math.round(a.note))))} {a.texte}</p>
              {a.auteur && <footer style={{ color: '#6b7280', fontSize: 14 }}>— {a.auteur}</footer>}
            </blockquote>
          ))}
        </>
      )}
      <p style={{ margin: '20px 0 0' }}><a href={url}>{M.reserver}</a></p>
      {lienVille && <p style={{ margin: '8px 0 0' }}><a href={lienVille.url}>{M.ville} {lienVille.nom}</a></p>}
    </section>
  )
}
