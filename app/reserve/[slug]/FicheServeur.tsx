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

type Prestation = { nom: string; prix: number | null; duree: number | null; aPartir: boolean }

const SUIVI = /^(d[ée]pose|retrait|retirada|removal)$/i

function prestations(data: unknown, max = 30): Prestation[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return []
  const vus = new Set<string>()
  const liste: Prestation[] = []
  for (const items of Object.values(data as Record<string, unknown>)) {
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
      liste.push({ nom, prix, duree, aPartir: typeof p.prix_type === 'string' && p.prix_type !== 'fixe' })
    }
  }
  return liste
}

const MOTS = {
  fr: { prestations: 'Prestations', avis: 'avis', aPartir: 'à partir de', min: 'min', reserver: 'Réserver en ligne', ville: 'Toutes les pros beauté à' },
  en: { prestations: 'Services', avis: 'reviews', aPartir: 'from', min: 'min', reserver: 'Book online', ville: 'All beauty pros in' },
  es: { prestations: 'Servicios', avis: 'reseñas', aPartir: 'desde', min: 'min', reserver: 'Reservar en línea', ville: 'Todas las profesionales de belleza en' },
} as const

export default function FicheServeur({ slug, nom, langue, metiers, ville, pays, devise, bio, image, catalogue, note, lienVille = null }: {
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
  /** La page de sa ville dans la recherche, quand elle existe (13 oct. 2026). */
  lienVille?: { nom: string; url: string } | null
}) {
  const L = langue === 'en' || langue === 'es' ? langue : 'fr'
  const M = MOTS[L]
  const liste = prestations(catalogue)
  const monnaie = (devise || 'EUR').toUpperCase()
  const format = new Intl.NumberFormat(L === 'en' ? 'en-GB' : L === 'es' ? 'es-ES' : 'fr-FR', { style: 'currency', currency: monnaie, maximumFractionDigits: 2 })
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
      <p style={{ margin: '20px 0 0' }}><a href={url}>{M.reserver}</a></p>
      {lienVille && <p style={{ margin: '8px 0 0' }}><a href={lienVille.url}>{M.ville} {lienVille.nom}</a></p>}
    </section>
  )
}
