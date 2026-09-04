import { contexteDe, catalogueDe, membresDuSalon, destinatairesPush } from '@/lib/equipe'
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
//
// ── ET LES PACKS ET PROMOTIONS ───────────────────────────────────────────────
// CONSTATÉ LE 11 AOÛT 2026, sur le premier vrai paiement. Une pose à 60 vendue
// 45 en promotion, moins 5 de réduction cliente : la page annonçait 40, la base
// enregistrait 55. Ce calcul-ci repartait du catalogue et n'appliquait que la
// fidélité et la réduction — le tarif de la promotion n'entrait nulle part.
//
// Ce n'est pas un chiffre mal affiché. En paiement intégral, la cliente aurait
// réglé 55 pour une prestation vendue 40 ; en acompte au pourcentage, l'acompte
// se calculait sur 55. Et la pro, elle, lisait « prestation à 55 € » sur sa
// fiche et aurait encaissé le reste dessus.
//
// L'offre est donc relue chez la pro, comme le reste : le navigateur dit
// LAQUELLE il réclame, jamais ce qu'elle vaut. Elle doit être à elle, active,
// non archivée et dans ses dates — sinon on l'ignore et on reste au catalogue.
// Le quota et le « une fois par téléphone » restent à `apply_offer_to_rdv`, qui
// tranche au moment de l'écriture.
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
  id?: string
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
  offreDemandee?: unknown,
): Promise<PrixReel | null> {
  if (!Array.isArray(demandees) || demandees.length === 0) return null

  // ÉQUIPE : le catalogue effectif de la praticienne (celui du salon,
  // surchargé de ses durées), et les offres du salon.
  const ctx = await contexteDe(supabaseAdmin, proId)
  const { data: effectif } = await catalogueDe(supabaseAdmin, ctx)

  const catalogue = (effectif ?? null) as Record<string, PrestationCatalogue[]> | null
  if (!catalogue) return null

  const offre = await offreValide(ctx.catalogueId, offreDemandee)
  /** Cette prestation est-elle couverte par l'offre ? (même test que la page :
      l'offre désigne des identifiants, le panier des noms.) */
  const couverte = (nom: string, categorie: string) =>
    !!offre && (catalogue[categorie] ?? []).some(
      p => (p?.nom ?? '').trim() === nom && !!p?.id && offre.prestations_ids.includes(p.id))

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

  // Le tarif de l'offre REMPLACE celui des prestations qu'elle couvre ; ce qui
  // a été ajouté à côté reste au catalogue. C'est mot pour mot le calcul de la
  // page de réservation, pour que les deux annoncent le même chiffre.
  const prix = offre
    ? offre.prix_promo + retenues.reduce(
        (t, p) => t + (couverte(p.nom, p.categorie) ? 0 : p.prix * p.quantite), 0)
    : retenues.reduce((t, p) => t + p.prix * p.quantite, 0)

  return {
    prix,
    duree: retenues.reduce((t, p) => t + p.duree * p.quantite, 0),
    techniques: retenues,
  }
}

/**
 * L'offre réclamée, si elle est bien à cette pro et utilisable aujourd'hui.
 *
 * On ne vérifie pas ici le quota ni le « une seule fois par téléphone » :
 * `apply_offer_to_rdv` les tranche au moment de l'écriture, sous verrou, et
 * retire l'offre du rendez-vous si elle ne passe pas.
 */
async function offreValide(
  proId: string,
  offreDemandee: unknown,
): Promise<{ prix_promo: number; prestations_ids: string[] } | null> {
  if (typeof offreDemandee !== 'string' || !/^[0-9a-f-]{36}$/i.test(offreDemandee)) return null

  const { data } = await supabaseAdmin
    .from('offres')
    .select('prix_promo, prestations_ids, active, archived_at, date_debut, date_fin')
    .eq('id', offreDemandee)
    .eq('pro_id', proId)
    .maybeSingle()
  if (!data || data.active !== true || data.archived_at) return null

  const aujourdhui = new Date().toISOString().slice(0, 10)
  if (data.date_debut && aujourdhui < String(data.date_debut).slice(0, 10)) return null
  if (data.date_fin && aujourdhui > String(data.date_fin).slice(0, 10)) return null

  const prix = Number(data.prix_promo)
  if (!Number.isFinite(prix) || prix < 0) return null

  return {
    prix_promo: prix,
    prestations_ids: Array.isArray(data.prestations_ids) ? data.prestations_ids.map(String) : [],
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
  // ── UNE CLIENTE INCONNUE A DROIT AU PREMIER PALIER ───────────────────────
  //
  // Le serveur s'arrêtait ici dès qu'il ne trouvait pas de fiche : pas de
  // fiche, pas de remise, prix plein. C'est faux quand la pro offre quelque
  // chose DÈS LE PREMIER TAMPON — 28 pros le font aujourd'hui. La page
  // affichait « -15 € », le rendez-vous s'enregistrait à 60 €, et le paiement
  // en prélevait 75 : la cliente payait quinze euros de plus que ce que disait
  // sa propre fiche, sans que personne ne le voie.
  //
  // Elle n'a pas de fiche parce qu'elle vient pour la première fois — c'est
  // précisément le cas que ce palier vise. On ne lui accorde QUE celui-là :
  // sans tampon, le prochain est forcément le premier. La réduction
  // personnelle, elle, reste refusée — elle est accrochée à une fiche qui
  // n'existe pas encore.
  const veutFidelite = !!fideliteDemandee
  const veutReduction = !!reductionDemandee
  if (!veutFidelite && !veutReduction) {
    return { prix: prixPanier, fidelite: null, reduction: null }
  }

  const ctx = await contexteDe(supabaseAdmin, proId)
  const [{ data: fiche }, { data: cliente }, { data: pro }] = await Promise.all([
    clienteId
      ? supabaseAdmin
          .from('fidelite_clientes')
          .select('recompense_disponible, tampons')
          .eq('pro_id', ctx.fichierId)
          .eq('cliente_id', clienteId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    clienteId
      ? supabaseAdmin
          .from('clientes')
          .select('reduction_type, reduction_valeur, reduction_rdv_restants')
          .eq('id', clienteId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabaseAdmin
      .from('profiles')
      .select('fidelite_config')
      .eq('id', ctx.salonId)
      .maybeSingle(),
  ])

  // ── DEUX FAÇONS D'AVOIR DROIT À SA RÉCOMPENSE ────────────────────────────
  // Je n'en avais vu qu'une, et le rendez-vous offert s'est retrouvé à payer un
  // acompte. Il y a la récompense DÉJÀ ACQUISE (rangée sur sa fiche), et celle
  // que CE rendez-vous fait gagner — le 10e tampon donne droit au 10e
  // rendez-vous, pas au suivant. La page applique les deux ; le serveur n'en
  // vérifiait qu'une, donc il facturait ce qui était offert.
  const config = (pro?.fidelite_config ?? null) as
    { active?: boolean; paliers?: { position?: number; type?: string; valeur?: number }[] } | null
  const prochainTampon = ((fiche?.tampons as number | null) ?? 0) + 1
  const palierAtteint = config?.active
    ? (config.paliers ?? []).find(p => p.position === prochainTampon) ?? null
    : null

  const fidelite: Remise = veutFidelite
    ? ((fiche?.recompense_disponible ?? null) as Remise)
      ?? (palierAtteint ? { type: palierAtteint.type, valeur: palierAtteint.valeur } : null)
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
