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
  // Les fichiers à la racine : logo, fleur, icônes, robots.txt, sitemap.xml.
  return /^\/[\w.-]+\.(png|jpe?g|svg|webp|ico|txt|xml|webmanifest)$/i.test(chemin)
}

export function proxy(req: NextRequest) {
  const hote = (req.headers.get('host') ?? '').toLowerCase().split(':')[0]
  const { pathname, search } = req.nextUrl

  if (estGlamiaFr(hote)) {
    if (hote === 'www.glamia.fr') return NextResponse.redirect(`https://glamia.fr${pathname}${search}`, 308)
    if (servieSurGlamiaFr(pathname)) return NextResponse.next()
    return NextResponse.redirect(`https://glamia.pro${pathname}${search}`, 308)
  }

  if (hote === 'booking.glamia.pro' && estRecherche(pathname) && rechercheSurGlamiaFr()) {
    return NextResponse.redirect(`https://glamia.fr${pathname}${search}`, 308)
  }

  return NextResponse.next()
}
