import { headers } from 'next/headers'
import type { Langue } from '@/lib/beaute-textes'
import { estGlamiaFr, SITE_RESA } from '@/lib/site-recherche'

/** La langue du navigateur de la cliente : français par défaut. */
export async function langueDuVisiteur(): Promise<Langue> {
  const h = (await headers()).get('accept-language') ?? ''
  const l = h.slice(0, 2).toLowerCase()
  return l === 'en' || l === 'es' || l === 'it' ? l : 'fr'
}

/** Servie depuis glamia.fr, la recherche envoie vers les pages de réservation de booking.glamia.pro. */
export async function baseResa(): Promise<string> {
  const h = (await headers()).get('host') ?? ''
  return estGlamiaFr(h) ? SITE_RESA : ''
}
