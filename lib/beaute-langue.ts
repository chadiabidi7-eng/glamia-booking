import { headers } from 'next/headers'
import type { Langue } from '@/lib/beaute-textes'

/** La langue du navigateur de la cliente : français par défaut. */
export async function langueDuVisiteur(): Promise<Langue> {
  const h = (await headers()).get('accept-language') ?? ''
  const l = h.slice(0, 2).toLowerCase()
  return l === 'en' || l === 'es' ? l : 'fr'
}
