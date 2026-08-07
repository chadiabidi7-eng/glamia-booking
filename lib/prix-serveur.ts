import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// LE PRIX SE CALCULE ICI, PAS DANS LE NAVIGATEUR.
//
// LE TROU. La page de réservation envoyait le prix du rendez-vous, et le
// serveur l'enregistrait tel quel. Personne ne le confrontait au tarif réel de
// la pro. Quelqu'un qui sait ouvrir l'onglet réseau de son navigateur pouvait
// donc réserver un microblading à 250 en déclarant qu'il en valait 20 :
//   — l'acompte était calculé sur 20, la pro sécurisait 3 au lieu de 40 ;
//   — en mode paiement complet, la cliente réglait 20 et le rendez-vous
//     ressortait « payé » ;
//   — la fiche de la pro affichait 20, elle ne voyait rien avant le jour même.
//
// C'est la même règle que pour les nouvelles clientes, écrite en juillet et
// oubliée ici : LE SERVEUR DÉCIDE, LE NAVIGATEUR TRANSMET. Si la page pouvait
// dire « ça coûte 20 », il suffirait de le dire pour que ce soit vrai.
//
// ── CE QU'ON ACCEPTE DU NAVIGATEUR ───────────────────────────────────────────
// Le CHOIX des prestations, et rien d'autre : leur catégorie, leur nom, leur
// quantité. Le prix vient du catalogue de la pro, relu à chaque appel.
//
// ── CE QU'ON REFUSE ──────────────────────────────────────────────────────────
// Une prestation qui n'existe pas chez cette pro, ou qu'elle a désactivée. Un
// panier vide. Dans ces cas on renvoie `null` : l'appelant décide s'il bloque
// la réservation ou s'il retombe sur le prix annoncé — jamais silencieusement.
//
// ── LES PRIX « À PARTIR DE » ─────────────────────────────────────────────────
// Ils comptent pour leur montant affiché. C'est le prix annoncé à la cliente,
// donc celui sur lequel l'acompte doit se calculer ; la pro ajuste ensuite dans
// sa fiche, comme elle le fait déjà aujourd'hui.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export type TechniqueDemandee = {
  nom?: unknown
  categorie?: unknown
  quantite?: unknown
}

type PrestationCatalogue = {
  nom?: string
  prix?: number
  duree?: number
  active?: boolean
}

export type PrixReel = {
  /** Le prix du panier, en unités (euros, francs…), tel que le catalogue le dit. */
  prix: number
  /** La durée totale, recalculée elle aussi — elle décide du créneau occupé. */
  duree: number
  /** Les prestations retenues, prix et durée corrigés, à enregistrer telles quelles. */
  techniques: { nom: string; categorie: string; prix: number; duree: number; quantite: number }[]
}

/**
 * Recalcule le panier depuis le catalogue de la pro.
 *
 * Renvoie `null` si le panier est vide ou si une prestation demandée n'existe
 * pas chez elle — dans les deux cas, ce que le navigateur raconte ne
 * correspond à rien de réel et ne doit pas servir de base à un paiement.
 */
export async function prixReelDuPanier(
  proId: string,
  demandees: unknown,
): Promise<PrixReel | null> {
  if (!Array.isArray(demandees) || demandees.length === 0) return null

  const { data } = await supabaseAdmin
    .from('prestations')
    .select('data')
    .eq('pro_id', proId)
    .maybeSingle()

  const catalogue = (data?.data ?? null) as Record<string, PrestationCatalogue[]> | null
  if (!catalogue) return null

  const retenues: PrixReel['techniques'] = []
  for (const brute of demandees as TechniqueDemandee[]) {
    const nom = String(brute?.nom ?? '').trim()
    const categorie = String(brute?.categorie ?? '').trim()
    if (!nom || !categorie) return null

    const liste = catalogue[categorie]
    if (!Array.isArray(liste)) return null

    // Une prestation DÉSACTIVÉE n'est plus proposée : la réserver quand même
    // reviendrait à ressusciter un tarif que la pro a retiré exprès.
    const trouvee = liste.find(p => (p?.nom ?? '').trim() === nom && p?.active !== false)
    if (!trouvee) return null

    // La quantité est bornée : sans borne, « 9999 nail arts » ferait un prix
    // absurde, et un acompte du même ordre sur la carte de la cliente.
    const brut = Number(brute?.quantite ?? 1)
    const quantite = Number.isFinite(brut) ? Math.min(Math.max(Math.round(brut), 1), 20) : 1

    retenues.push({
      nom,
      categorie,
      prix: Number(trouvee.prix ?? 0),
      duree: Number(trouvee.duree ?? 0),
      quantite,
    })
  }

  return {
    prix: retenues.reduce((t, p) => t + p.prix * p.quantite, 0),
    duree: retenues.reduce((t, p) => t + p.duree * p.quantite, 0),
    techniques: retenues,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LES REMISES AUSSI VIENNENT DE LA BASE.
//
// Le navigateur annonçait « rendez-vous offert » ou « −30 % », et le serveur
// l'écrivait. La récompense de fidélité était bien vérifiée AVANT d'être
// consommée — ce verrou-là tenait — mais le prix, lui, était déjà tombé.
//
// ON NE FAIT PLUS QUE LIRE LE CLAIM COMME UNE DEMANDE. La cliente peut choisir
// de ne pas se servir de sa récompense : si le navigateur n'en réclame aucune,
// on n'en applique aucune. Mais s'il en réclame une, c'est la valeur enregistrée
// chez la pro qui s'applique, jamais celle qu'il annonce.
//
// L'ORDRE EST CELUI DE L'APP : la fidélité d'abord, la réduction ensuite sur ce
// qui reste. Les deux côtés doivent donner le même chiffre pour le même panier,
// sinon la cliente et la pro ne lisent pas le même prix.
// ─────────────────────────────────────────────────────────────────────────────

type Remise = { type?: string; valeur?: number } | null

export type RemisesVerifiees = {
  prix: number
  fidelite: Remise
  reduction: Remise
}

export async function remisesVerifiees(
  proId: string,
  clienteId: string | null,
  prixPanier: number,
  fideliteDemandee: unknown,
  reductionDemandee: unknown,
): Promise<RemisesVerifiees> {
  if (!clienteId) return { prix: prixPanier, fidelite: null, reduction: null }

  const veutFidelite = !!fideliteDemandee
  const veutReduction = !!reductionDemandee
  if (!veutFidelite && !veutReduction) {
    return { prix: prixPanier, fidelite: null, reduction: null }
  }

  const [{ data: fiche }, { data: cliente }] = await Promise.all([
    supabaseAdmin
      .from('fidelite_clientes')
      .select('recompense_disponible')
      .eq('pro_id', proId)
      .eq('cliente_id', clienteId)
      .maybeSingle(),
    supabaseAdmin
      .from('clientes')
      .select('reduction_type, reduction_valeur, reduction_rdv_restants')
      .eq('id', clienteId)
      .maybeSingle(),
  ])

  const fidelite: Remise = veutFidelite
    ? ((fiche?.recompense_disponible ?? null) as Remise)
    : null

  const reduction: Remise = veutReduction
    && cliente?.reduction_type
    && cliente?.reduction_valeur
    && cliente.reduction_rdv_restants !== 0
    ? { type: cliente.reduction_type as string, valeur: Number(cliente.reduction_valeur) }
    : null

  let prix = prixPanier
  if (fidelite) {
    if (fidelite.type === 'gratuit') prix = 0
    else if (typeof fidelite.valeur === 'number' && fidelite.valeur > 0) {
      prix = fidelite.type === 'euros'
        ? Math.max(0, prix - fidelite.valeur)
        : Math.round(prix * (1 - fidelite.valeur / 100))
    }
  }
  if (reduction && prix > 0 && typeof reduction.valeur === 'number' && reduction.valeur > 0) {
    prix = reduction.type === 'euros'
      ? Math.max(0, prix - reduction.valeur)
      : Math.round(prix * (1 - reduction.valeur / 100))
  }

  return { prix, fidelite, reduction }
}
