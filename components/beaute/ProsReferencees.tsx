import { libellePro, prosReferencees } from '@/lib/pros-referencees'
import type { Langue } from '@/lib/beaute-textes'

// Sous l'accueil de la recherche : les pros Ultra qui ont allumé le
// référencement Google, chacune avec un lien qui dit son métier et sa ville.
// Discret, en bas de page (25 oct. 2026).
const TITRE: Record<Langue, string> = {
  fr: 'Réserver directement chez elles',
  en: 'Book directly with them',
  es: 'Reserva directamente con ellas',
  it: 'Prenota direttamente da loro',
}

export default async function ProsReferencees({ langue }: { langue: Langue }) {
  let pros: Awaited<ReturnType<typeof prosReferencees>> = []
  try { pros = await prosReferencees() } catch { return null }
  if (!pros.length) return null
  return (
    <section style={{ maxWidth: 960, margin: '0 auto', padding: '28px 20px 48px', boxSizing: 'border-box' }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: 'var(--encre-douce)' }}>{TITRE[langue]}</h2>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: '6px 18px', fontSize: 14 }}>
        {pros.map(p => (
          <li key={p.url} style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <a href={p.url} style={{ color: 'var(--encre-douce)', textDecoration: 'none' }}>{libellePro(p, langue)}</a>
          </li>
        ))}
      </ul>
    </section>
  )
}
