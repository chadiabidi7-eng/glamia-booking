import type { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// LA LISTE DES PAGES, POUR GOOGLE ET POUR PERSONNE D'AUTRE.
//
// Aucune pro, aucune cliente ne verra jamais ce fichier. Il sert à une seule
// chose : quand Google passe, il y lit d'un coup l'adresse de toutes les pages
// de réservation qui existent.
//
// SANS LUI, IL NE LES TROUVE PAS. Une page de réservation n'est liée nulle part
// ailleurs que dans la bio Instagram de sa pro — et Google ne lit pas les bios
// Instagram. Les 1 146 pages existaient donc sans que le moteur sache
// seulement qu'elles étaient là.
//
// ── ON NE LISTE QUE LES PAGES VIVANTES ──────────────────────────────────────
//
// Une pro dont l'essai est fini et qui ne s'est pas abonnée a une page qui
// répond « fermé » : la cliente arrive sur une porte close. Envoyer Google
// dessus ne serait pas seulement inutile, ce serait NUISIBLE — un moteur juge
// un site dans son ensemble, et quelques centaines de pages mortes abîment le
// classement de celles qui vivent.
//
// Le critère est exactement celui du produit (`app/api/pro/route.ts`) : est
// vivante la page d'une pro abonnée, ou dont l'essai court encore. On ne
// réinvente pas la règle ici, on la suit — sinon les deux finiraient par dire
// deux choses différentes.
//
// ── ET IL SE MET À JOUR TOUT SEUL ───────────────────────────────────────────
//
// Rien n'est figé : la liste se fabrique à la demande, depuis la base. Une pro
// inscrite ce matin y figure ce matin. Une pro dont l'essai expire cette nuit
// en sort demain. Personne n'a jamais à y toucher.
//
// Relu au plus une fois par heure (`revalidate`) : Google ne passe pas toutes
// les minutes, et cette liste n'a pas besoin d'être à la seconde près.
// ─────────────────────────────────────────────────────────────────────────────

/** Une heure. Assez frais pour Google, assez rare pour la base. */
export const revalidate = 3600

const SITE = 'https://booking.glamia.pro'

// CLÉ DE SERVICE, comme partout ailleurs sur le serveur : la lecture anonyme
// des profils est fermée depuis le 30 juillet 2026, et la clé publique ne
// rendrait plus rien — la liste serait vide sans que rien ne le signale.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Les pages qu'on montre toujours, quoi qu'il arrive en base.
  const fixes: MetadataRoute.Sitemap = [
    { url: SITE, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  ]

  try {
    const maintenant = new Date().toISOString()

    // VIVANTE = ABONNÉE, OU ESSAI EN COURS. Même règle que le guichet qui sert
    // la page, et `compte_test` sort d'office : les comptes de démonstration
    // n'ont rien à faire dans un moteur de recherche.
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('slug, updated_at, abonnement_actif, trial_ends_at')
      .not('slug', 'is', null)
      .neq('compte_test', true)
      .or(`abonnement_actif.eq.true,trial_ends_at.gt.${maintenant}`)
      .limit(5000)

    if (error || !data) {
      console.error('[sitemap] liste non lue :', error?.message)
      return fixes
    }

    const pages: MetadataRoute.Sitemap = data
      .filter(p => typeof p.slug === 'string' && p.slug.length > 0)
      .map(p => ({
        url: `${SITE}/reserve/${p.slug}`,
        // `updated_at` dit à Google si quelque chose a bougé depuis son
        // dernier passage. Absente, on ne ment pas : on met aujourd'hui.
        lastModified: p.updated_at ? new Date(p.updated_at as string) : new Date(),
        // Une pro change ses horaires et ses prix souvent : on invite le
        // moteur à repasser régulièrement.
        changeFrequency: 'weekly' as const,
        // Plus haute que l'accueil : ce sont ces pages-là qui doivent sortir
        // dans les résultats, pas la racine du site.
        priority: 0.8,
      }))

    return [...fixes, ...pages]
  } catch (e) {
    // UNE BASE QUI NE RÉPOND PAS NE DOIT PAS RENDRE UNE PAGE D'ERREUR À GOOGLE.
    // Mieux vaut une liste réduite à l'accueil qu'un code 500, qu'il retiendrait
    // contre le site entier.
    console.error('[sitemap] erreur inattendue :', e)
    return fixes
  }
}
