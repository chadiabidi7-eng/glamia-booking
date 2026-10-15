import { NextResponse, type NextRequest } from 'next/server'
import { estGlamiaFr, rechercheSurGlamiaFr } from '@/lib/site-recherche'

// ─────────────────────────────────────────────────────────────────────────────
// QUI SERT QUOI, SELON L'ADRESSE TAPÉE (13 oct. 2026).
//
// glamia.fr ne sert QUE la recherche des clientes (/beaute) et ce dont elle a
// besoin pour s'afficher. Tout le reste de glamia.fr part, comme avant, vers
// glamia.pro au même chemin. www.glamia.fr renvoie vers glamia.fr.
//
// Sur booking.glamia.pro, /beaute ne part vers glamia.fr que lorsque Chadi a
// posé RECHERCHE_SUR_GLAMIA_FR=oui. Sans lui, rien ne change ici : les pages
// de réservation, les créneaux et le paiement ne passent jamais par ces règles.
// ─────────────────────────────────────────────────────────────────────────────

const estRecherche = (chemin: string) => chemin === '/beaute' || chemin.startsWith('/beaute/')

/** Ce que la recherche charge pour s'afficher sur glamia.fr. */
function servieSurGlamiaFr(chemin: string): boolean {
  if (estRecherche(chemin)) return true
  if (chemin.startsWith('/_next/') || chemin.startsWith('/_vercel/')) return true
  if (chemin === '/api/villes') return true          // les villes proposées pendant la frappe
  if (chemin.startsWith('/icons/')) return true       // les dessins des spécialités
  // Le fichier qui prouve à Google Search Console que glamia.fr est à nous (13 oct. 2026).
  if (/^\/google[0-9a-f]+\.html$/.test(chemin)) return true
  // Les fichiers à la racine : logo, fleur, icônes, robots.txt, sitemap.xml.
  return /^\/[\w.-]+\.(png|jpe?g|svg|webp|ico|txt|xml|webmanifest)$/i.test(chemin)
}

/** Les pages du site à la racine (dossiers de app/) : jamais prises pour une pro. */
const PAGES_DU_SITE = new Set([".well-known", "aide", "api", "app", "avancer", "avis", "beaute", "cgu", "confidentialite", "confirmation", "desinscription", "mail-exemple", "ouvrir", "paiement", "payer", "reserve", "stripe", "suppression-compte"])

export function proxy(req: NextRequest) {
  const hote = (req.headers.get('host') ?? '').toLowerCase().split(':')[0]
  const { pathname, search } = req.nextUrl

  if (estGlamiaFr(hote)) {
    if (hote === 'www.glamia.fr') return NextResponse.redirect(`https://glamia.fr${pathname}${search}`, 308)
    if (servieSurGlamiaFr(pathname)) return NextResponse.next()
    return NextResponse.redirect(`https://glamia.pro${pathname}${search}`, 308)
  }

  // LES LIENS SANS « /reserve/ » (15 oct. 2026). Les mails de modification et
  // d'annulation envoyaient « booking.glamia.pro/<page> » : page introuvable.
  // Ils sont corrigés ; ceux déjà partis mènent maintenant à la page de la pro.
  // Un seul mot après « / », qui n'est aucune page du site → sa page de réservation.
  const seul = /^\/([a-z0-9-]+)$/i.exec(pathname)
  if (seul && !PAGES_DU_SITE.has(seul[1].toLowerCase())) {
    return NextResponse.redirect(new URL(`/reserve/${seul[1]}${search}`, req.url), 307)
  }

  if (hote === 'booking.glamia.pro' && estRecherche(pathname) && rechercheSurGlamiaFr()) {
    return NextResponse.redirect(`https://glamia.fr${pathname}${search}`, 308)
  }

  return NextResponse.next()
}
