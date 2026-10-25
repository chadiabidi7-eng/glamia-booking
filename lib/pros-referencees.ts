import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { nomSpecialiteAffiche } from '@/lib/catalogue-affiche'
import { SITE_RESA } from '@/lib/site-recherche'

// ─────────────────────────────────────────────────────────────────────────────
// LES PROS QUI ONT PAYÉ POUR ÊTRE SUR GOOGLE (25 oct. 2026).
//
// Le référencement Google est une fonction Ultra. Google avait lu leurs pages
// et n'en gardait aucune : une page que personne ne cite ne compte pas pour
// lui. Cette liste sert à les citer depuis les pages qu'il connaît déjà —
// l'accueil de la recherche (glamia.fr/beaute) et le pied de glamia.pro —
// avec un lien qui dit ce qu'elle fait et où : « Nom — Cils à Marseille ».
//
// MÊME RÈGLE QUE LE PLAN DU SITE : Ultra, interrupteur allumé, abonnement ou
// essai en cours, jamais un compte de démonstration. Lue une fois par heure,
// pas à chaque visite : la base n'a que 60 places de connexion.
// ─────────────────────────────────────────────────────────────────────────────

export type ProReferencee = { nom: string; metier: string; ville: string; url: string }

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

/** « istres 13800 », « Paris, Nanterre » → « Istres », « Paris ». Rien plutôt qu'une phrase. */
function villeCourte(brut: unknown): string {
  if (typeof brut !== 'string') return ''
  const v = brut.trim().replace(/\s+[-—–]\s+/g, '|').split(/[|—–,/(]/)[0].replace(/\b\d{4,6}\b/g, '').replace(/\s+/g, ' ').trim()
  if (v.length < 2 || v.length > 40 || v.split(' ').length > 4 || /^\d+$/.test(v)) return ''
  return v.charAt(0).toUpperCase() + v.slice(1)
}

export const prosReferencees = unstable_cache(async (): Promise<ProReferencee[]> => {
  const maintenant = new Date().toISOString()
  const { data, error } = await admin
    .from('profiles')
    .select('slug, pseudo, prenom, nom, specialite, categorie_autre_nom, ville, ville_affichee, adresse_publique, langue')
    .not('slug', 'is', null)
    .neq('compte_test', true)
    .eq('referencement_google', true)
    .eq('pro_pay_actif', true)
    .or(`abonnement_actif.eq.true,trial_ends_at.gt.${maintenant}`)
    .limit(500)
  if (error || !data) return []
  return data
    .filter(p => typeof p.slug === 'string' && p.slug)
    .map(p => {
      const nom = (typeof p.pseudo === 'string' && p.pseudo.trim()) || `${p.prenom ?? ''} ${p.nom ?? ''}`.trim()
      const premier = typeof p.specialite === 'string' ? p.specialite.split('·')[0].trim() : ''
      const metier = premier ? nomSpecialiteAffiche(premier, p.categorie_autre_nom ?? null, p.langue ?? null) : ''
      const ville = villeCourte(p.ville_affichee) || villeCourte(p.ville) || villeCourte(p.adresse_publique)
      return { nom, metier, ville, url: `${SITE_RESA}/reserve/${p.slug}` }
    })
    .filter(p => p.nom)
    .sort((a, b) => a.ville.localeCompare(b.ville, 'fr') || a.nom.localeCompare(b.nom, 'fr'))
}, ['pros-referencees'], { revalidate: 3600 })

/** « Cils à Marseille » dans la langue de la page. */
export function libellePro(p: ProReferencee, langue: string): string {
  const a = langue === 'en' ? 'in' : langue === 'es' ? 'en' : langue === 'it' ? 'a' : 'à'
  const quoi = [p.metier, p.ville ? `${a} ${p.ville}` : ''].filter(Boolean).join(' ')
  return quoi ? `${p.nom} — ${quoi}` : p.nom
}
