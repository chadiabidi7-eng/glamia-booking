import type { Metadata } from 'next'
import { METIER_SLUG, TEXTES, type Langue, type Metier } from '@/lib/beaute-textes'
import type { DonneesVille, ProTrouvee } from '@/lib/recherche-pros'
import { SITE_RESA, siteRecherche } from '@/lib/site-recherche'

// ─────────────────────────────────────────────────────────────────────────────
// CE QUE GOOGLE LIT DES PAGES DE LA RECHERCHE (13 oct. 2026).
//
// Un titre et une description propres à chaque page, qui ne disent que ce que
// la page montre : le nombre de pros, leurs métiers, et « prix » ou « avis »
// seulement s'il y en a. Une ville sans aucune pro à montrer reste hors de
// Google : une page vide est un mauvais signal pour tout le site.
// ─────────────────────────────────────────────────────────────────────────────

const LOCALE_OG: Record<Langue, string> = { fr: 'fr_FR', en: 'en_GB', es: 'es_ES' }

/** Les métiers les plus présents d'abord. */
function metiersFrequents(pros: ProTrouvee[], max: number): Metier[] {
  const n = new Map<Metier, number>()
  for (const p of pros) for (const m of p.metiers) n.set(m, (n.get(m) ?? 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([m]) => m)
}

/** « Manucure, cils, coiffure » : la première en majuscule, les suivantes en minuscule (en français et en espagnol). */
function listeMetiers(ms: Metier[], langue: Langue): string {
  const noms = ms.map(m => TEXTES[langue].metiers[m])
  return noms.map((n, i) => (i === 0 || langue === 'en' ? n : n.toLowerCase())).join(', ')
}

export const adresseVille = (slug: string, metier?: Metier | null) =>
  `${siteRecherche()}/beaute/${slug}${metier ? `/${METIER_SLUG[metier]}` : ''}`

/** Les pros d'une page (toute la ville, ou celles d'un métier). */
export const prosDeLaPage = (d: NonNullable<DonneesVille>, metier?: Metier | null) =>
  metier ? d.pros.filter(p => p.metiers.includes(metier)) : d.pros

export function metadataVille(d: DonneesVille, langue: Langue, metier?: Metier | null): Metadata {
  if (!d) return { robots: { index: false, follow: false } }
  const S = TEXTES[langue].seo
  const pros = prosDeLaPage(d, metier)
  const dansLaVille = pros.filter(p => !p.prochaine)
  const base = dansLaVille.length ? dansLaVille : pros
  const prix = base.some(p => p.prixMin), avis = base.some(p => p.note !== null)
  const metiersTitre = metier ? S.metiers[metier] : listeMetiers(metiersFrequents(base, 3), langue)
  const title = dansLaVille.length
    ? S.villeTitre(metiersTitre, d.ville.nom, dansLaVille.length, S.plus(prix, avis))
    : S.procheTitre(metiersTitre, d.ville.nom, pros.length)
  const description = S.villeDescription(d.ville.nom,
    metier ? S.metiers[metier] : listeMetiers(metiersFrequents(base, 5), langue), prix, avis)
  const url = adresseVille(d.ville.slug, metier)
  return {
    title,
    description,
    // Au moins une pro à montrer : la page entre dans Google. Sinon, non.
    robots: pros.length ? { index: true, follow: true } : { index: false, follow: true },
    alternates: { canonical: url },
    openGraph: { type: 'website', siteName: 'Glamia', title, description, url, locale: LOCALE_OG[langue], images: [{ url: '/og-image.png', width: 1024, height: 1024, alt: 'Glamia' }] },
    twitter: { card: 'summary', title, description, images: ['/og-image.png'] },
  }
}

export function metadataAccueil(langue: Langue): Metadata {
  const S = TEXTES[langue].seo
  const url = `${siteRecherche()}/beaute`
  return {
    title: S.accueilTitre,
    description: S.accueilDescription,
    robots: { index: true, follow: true },
    alternates: { canonical: url },
    openGraph: { type: 'website', siteName: 'Glamia', title: S.accueilTitre, description: S.accueilDescription, url, locale: LOCALE_OG[langue], images: [{ url: '/og-image.png', width: 1024, height: 1024, alt: 'Glamia' }] },
    twitter: { card: 'summary', title: S.accueilTitre, description: S.accueilDescription, images: ['/og-image.png'] },
  }
}

/** Les données structurées d'une page ville : la liste des pros, et le fil Glamia › Beauté › Ville (› Métier). */
export function donneesStructurees(d: NonNullable<DonneesVille>, langue: Langue, metier?: Metier | null): string {
  const S = TEXTES[langue].seo
  const pros = prosDeLaPage(d, metier)
  const fil = [
    { name: 'Glamia', item: 'https://glamia.pro' },
    { name: S.beaute, item: `${siteRecherche()}/beaute` },
    { name: d.ville.nom, item: adresseVille(d.ville.slug) },
    ...(metier ? [{ name: S.metiers[metier], item: adresseVille(d.ville.slug, metier) }] : []),
  ]
  const graphe = [
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: metier ? `${S.metiers[metier]} — ${d.ville.nom}` : d.ville.nom,
      numberOfItems: pros.length,
      itemListElement: pros.map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'BeautySalon',
          name: p.nom,
          url: `${SITE_RESA}/reserve/${p.slug}`,
          ...(p.photo ? { image: p.photo } : {}),
          ...(p.note !== null && p.nbAvis > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: Math.round(p.note * 10) / 10, reviewCount: p.nbAvis, bestRating: 5, worstRating: 1 } } : {}),
        },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: fil.map((f, i) => ({ '@type': 'ListItem', position: i + 1, name: f.name, item: f.item })),
    },
  ]
  return JSON.stringify(graphe).replace(/</g, '\\u003c')
}
