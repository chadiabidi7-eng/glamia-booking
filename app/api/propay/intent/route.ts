import { createClient } from '@supabase/supabase-js'
import { prixReelDuPanier, remisesVerifiees } from '@/lib/prix-serveur'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe-serveur'
import { reglagesPay } from '@/lib/pays-stripe'
import { normaliserTelephone } from '@/lib/telephone'

// ─────────────────────────────────────────────────────────────────────────────
// Glamia Pro Pay — création de l'intent à l'étape de confirmation de la résa.
//
// POST { pro_id, total }  (total = prix des prestations sélectionnées, en €)
// → { actif: false }  si la pro n'a pas d'acomptes actifs (résa classique)
// → { actif: true, mode, acompte, frais, total_cliente, client_secret,
//     stripe_account, intent_id }
//
// Montants en CENTIMES côté Stripe. Spec (13 juil. 2026) :
// - acompte = % ou fixe (config pro), plafonné à 50 % du total ET 50 €
// - mode empreinte : SetupIntent (0 € prélevé, carte enregistrée avec 3DS)
// - mode acompte : PaymentIntent — la cliente paie acompte + frais de
//   réservation (gross-up : frais Stripe + commission Glamia 1,5 %), la pro
//   touche l'acompte plein. Commission via application_fee_amount.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)


const PLAFOND_POURCENT = 50
const PLAFOND_EUROS_CENTIMES = 50_00
// Commission Glamia — passer à 0 pour la retirer (décision : 1,5 %, 13 juil.)
// LA COMMISSION GLAMIA EST À ZÉRO. Décision de Chadi, 5 août 2026.
//
// Elle rapportait 30 centimes sur un acompte de 20 € — il aurait fallu 66 000 €
// encaissés par mois pour en tirer 1 000. Surtout, elle contredisait la
// promesse écrite sur le paywall : « de sa carte au tien, Glamia n'y touche
// jamais ». Le modèle, c'est l'abonnement : 19,99 € par mois, clair et
// prévisible. Empiler une commission dessus, c'est le début d'une facture qu'on
// ne comprend plus.
//
// LES FRAIS DE RÉSERVATION RESTENT, EUX, À LA CHARGE DE LA CLIENTE : ce sont
// des frais de SERVICE — rappels automatiques, décalage en autonomie, photos
// d'inspiration, carte de fidélité — et non le coût de la carte bancaire. La
// page de réservation les détaille derrière un « i ».
//
// La constante reste plutôt que d'être supprimée : elle nomme l'endroit où la
// règle vit, et le jour où elle changera, il n'y aura qu'un fichier à ouvrir.
const COMMISSION_GLAMIA_PCT = 0
// LES FRAIS NE SONT PLUS LES MÊMES PARTOUT. Ils dépendent du pays de la caisse
// de la pro : 1,5 % + 0,25 € en zone euro (mesuré), 2,9 % + 0,30 au Canada et en
// Suisse (tarif publié). Voir lib/pays-stripe.ts.
//
// Ces deux constantes restent comme REPLI, et rien d'autre : une caisse ouverte
// avant le 5 août 2026 n'a pas de pays enregistré, et elle est forcément
// française — c'était écrit en dur.
const STRIPE_PCT = 0.015
const STRIPE_FIXE_CENTIMES = 25

// ─────────────────────────────────────────────────────────────────────────────
// LES FRAIS DE SERVICE GLAMIA — 0,25 € + 2 %, PLAFONNÉS À 1,50 €.
//
// POURQUOI ILS EXISTENT (27 août 2026). Le solde de la plateforme partait dans
// le négatif, un peu plus chaque jour, sans que rien ne l'alimente. Stripe
// facture à Glamia, et à personne d'autre : 2 € par mois et par pro qui se
// verse, plus 0,10 € et 0,25 % à chaque virement. En août : 115 paiements,
// 20 pros, environ 52 € de frais — soit 45 centimes par réservation payée.
//
// POURQUOI UN MONTANT FIXE ET NON UN POURCENTAGE. Ces coûts sont fixes. Une
// cliente qui règle 150 € coûte exactement la même chose qu'une cliente qui
// règle 15 €. Un pourcentage ferait payer la première pour la seconde.
//
// CE N'EST PAS LE COÛT DE LA CARTE BANCAIRE, et ça ne doit jamais être présenté
// comme tel : la loi française interdit de facturer une cliente parce qu'elle
// paie par carte. Ce sont des frais de SERVICE — rappels automatiques, décalage
// en autonomie, photos d'inspiration, carte de fidélité — dus quel que soit le
// moyen de paiement. La page de réservation les détaille derrière un « i ».
//
// CE QUE LA PRO TOUCHE NE CHANGE PAS D'UN CENTIME. La majoration est calculée
// pour qu'elle reçoive son prix plein, frais Stripe déduits, exactement comme
// avant. « De sa carte au tien, Glamia n'y touche jamais » reste vrai : ces
// frais sont payés par la cliente EN PLUS, jamais prélevés sur elle.
//
// ── UN MONTANT FIXE A ÉTÉ ESSAYÉ LE MATIN MÊME, ET IL ÉTAIT MAUVAIS ─────────
//
// 0,50 € par paiement. Deux défauts, tous deux mesurés le jour même.
//
// IL NE COUVRAIT PAS : 49 paiements réels sur le mois × 0,50 € = 24,50 €, pour
// une trentaine d'euros de frais. Le solde aurait continué à descendre, plus
// lentement. (Les 115 paiements que j'avais comptés d'abord incluaient les
// EMPREINTES, où aucun argent ne bouge — ni frais pour Glamia, ni frais pour
// la cliente. Compter une empreinte comme un paiement double la recette
// imaginaire.)
//
// SURTOUT, IL FRAPPAIT LES PETITS ACOMPTES. Sur un acompte de 5 €, les frais
// atteignaient 17 % du montant, contre 3 % sur un paiement de 60 €. La pro qui
// demande peu POUR NE PAS EFFRAYER SA CLIENTE se retrouvait avec la page qui
// paraît la plus chère. Exactement l'inverse de son intention.
//
// Le barème actuel est plat : la part Glamia va de 7 % sur un acompte de 5 € à
// 2,4 % sur un paiement de 60 €, au lieu de 10 % à 0,8 %.
//
// LE PLAFOND N'EST PAS DÉCORATIF : sans lui, une pro qui fait payer 300 €
// d'avance afficherait 6 € de frais sur sa page de réservation.
//
// LES AUTRES MONNAIES sont les équivalents arrondis d'environ 0,25 € et 1,50 €.
// Aujourd'hui seuls l'euro (23 caisses) et le franc suisse (3) servent.
const BAREME_SERVICE: Record<string, { fixe: number; plafond: number }> = {
  eur: { fixe: 25, plafond: 150 },      chf: { fixe: 25, plafond: 150 },
  gbp: { fixe: 20, plafond: 130 },      usd: { fixe: 30, plafond: 180 },
  cad: { fixe: 35, plafond: 210 },      aud: { fixe: 40, plafond: 240 },
  nzd: { fixe: 45, plafond: 270 },      sgd: { fixe: 35, plafond: 210 },
  dkk: { fixe: 175, plafond: 1100 },    sek: { fixe: 275, plafond: 1650 },
  nok: { fixe: 275, plafond: 1650 },    pln: { fixe: 100, plafond: 600 },
  czk: { fixe: 600, plafond: 3600 },    ron: { fixe: 125, plafond: 750 },
  huf: { fixe: 10000, plafond: 60000 }, hkd: { fixe: 200, plafond: 1200 },
  myr: { fixe: 125, plafond: 750 },     thb: { fixe: 900, plafond: 5400 },
  mxn: { fixe: 500, plafond: 3000 },
}
const PART_VARIABLE = 0.02

/** Ce que Glamia prélève sur un paiement, dans la monnaie de la caisse. */
const fraisService = (montant: number, devise?: string | null): number => {
  const b = BAREME_SERVICE[(devise ?? 'eur').toLowerCase()] ?? BAREME_SERVICE.eur
  return Math.min(b.fixe + Math.round(montant * PART_VARIABLE), b.plafond)
}


type Reglage = { mode?: 'empreinte' | 'acompte' | 'total'; type?: 'pourcent' | 'fixe'; valeur?: number }
type Config = Reglage & { actif?: boolean; nouvelles?: Reglage | null }


/**
 * Cette cliente est-elle déjà venue chez cette pro ?
 *
 * LA QUESTION SE POSE AU SERVEUR, JAMAIS AU NAVIGATEUR. Si la page envoyait
 * « je suis une habituée », il suffirait de le dire pour éviter l'acompte.
 * Le navigateur n'envoie qu'un numéro ; c'est ici qu'on décide.
 *
 * EST HABITUÉE CELLE QUI EST DÉJÀ VENUE — un rendez-vous passé, non annulé.
 * Pas celle qui en a simplement un de prévu : tant qu'elle n'est pas venue,
 * rien ne dit qu'elle viendra, et c'est précisément ce que l'acompte couvre.
 *
 * AU MOINDRE DOUTE, ON LA TRAITE EN HABITUÉE : numéro absent, panne de
 * lecture, numéro trop court. Le réglage « nouvelles » est toujours le plus
 * exigeant des deux — se tromper dans ce sens demande trop d'argent à une
 * fidèle, l'inverse en demande simplement moins à une inconnue.
 */
/** L'identifiant de la cliente derrière ce numéro, pour relire ses remises. */
async function ficheClienteParTelephone(proId: string, telephone: unknown): Promise<string | null> {
  if (typeof telephone !== 'string') return null
  const cible = normaliserTelephone(telephone)
  if (cible.length < 9) return null
  const { data: clientes } = await supabaseAdmin
    .from('clientes').select('id, telephone').eq('pro_id', proId)
  // Numéros stockés dans des formats variés : la comparaison se fait en mémoire.
  return (clientes ?? []).find(c => normaliserTelephone(c.telephone as string) === cible)?.id ?? null
}

async function estUneNouvelleCliente(proId: string, telephone: unknown): Promise<boolean> {
  // ── EST NOUVELLE CELLE QUE LA PAGE NE RECONNAÎT PAS ─────────────────────────
  // La règle regardait si elle était DÉJÀ VENUE — un rendez-vous passé, non
  // annulé. Vue de la cliente, ça ne correspondait à rien : elle tape son
  // numéro, la page la reconnaît et pré-remplit tout, et on lui demandait
  // quand même le tarif des inconnues.
  //
  // La règle est donc celle qu'elle vit : présente dans le fichier de la pro,
  // c'est une habituée ; absente, elle doit saisir nom, prénom et adresse, et
  // c'est une nouvelle. Décision de Chadi, 7 août 2026.
  //
  // CE QU'ON PERD, ET C'EST ASSUMÉ : une cliente qui a réservé une fois puis
  // n'est jamais venue est désormais traitée en habituée. C'était précisément
  // ce que l'ancienne règle couvrait.
  //
  // AU MOINDRE DOUTE, HABITUÉE. Numéro absent, illisible, panne de lecture : le
  // tarif des nouvelles est toujours le plus exigeant des deux, et se tromper
  // dans ce sens demanderait trop d'argent à une fidèle.
  if (typeof telephone !== 'string') return false
  const cible = normaliserTelephone(telephone)
  if (cible.length < 9) return false
  try {
    const { data: clientes, error } = await supabaseAdmin
      .from('clientes').select('id, telephone').eq('pro_id', proId)
    if (error) return false
    // Numéros stockés dans des formats variés : la comparaison se fait en mémoire.
    return !(clientes ?? []).some(c => normaliserTelephone(c.telephone as string) === cible)
  } catch {
    return false
  }
}

// Acompte plafonné, en centimes
export function calculerAcompte(totalCentimes: number, config: Reglage): number {
  const brut = config.type === 'fixe'
    ? Math.round((config.valeur ?? 0) * 100)
    : Math.round(totalCentimes * (config.valeur ?? 0) / 100)
  return Math.max(0, Math.min(brut, Math.round(totalCentimes * PLAFOND_POURCENT / 100), PLAFOND_EUROS_CENTIMES))
}

// Majoration : la cliente paie `totalCliente` pour que la pro touche l'acompte
// PLEIN une fois les frais retirés. total × (1 − pct) = acompte + fixe.
//
// Le taux dépend du pays de la caisse. `pays` absent → tarif européen, qui était
// le seul appliqué jusqu'au 5 août 2026.
export function calculerTotalCliente(
  acompteCentimes: number,
  pays?: string | null,
): { commission: number; totalCliente: number; frais: number } {
  const { fraisPct, fraisFixe, devise } = pays
    ? reglagesPay(pays)
    : { fraisPct: STRIPE_PCT, fraisFixe: STRIPE_FIXE_CENTIMES, devise: 'eur' }
  // La commission de plateforme, c'est CE QUI REVIENT À GLAMIA. Gonfler le
  // total sans la déclarer ici ferait atterrir les 50 centimes chez la pro, et
  // les frais Stripe resteraient à la charge de Glamia — l'inverse du but.
  const commission = Math.round(acompteCentimes * COMMISSION_GLAMIA_PCT) + fraisService(acompteCentimes, devise)
  const totalCliente = Math.ceil((acompteCentimes + fraisFixe + commission) / (1 - fraisPct))
  return { commission, totalCliente, frais: totalCliente - acompteCentimes }
}

export async function POST(req: NextRequest) {
  let body: {
    pro_id?: unknown; total?: unknown; total_plein?: unknown; telephone?: unknown
    techniques?: unknown; offre_id?: unknown
    fidelite_appliquee?: unknown; reduction_appliquee?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const proId = body.pro_id
  const totalEuros = Number(body.total)
  if (typeof proId !== 'string' || !/^[0-9a-f-]{36}$/i.test(proId) || !isFinite(totalEuros) || totalEuros < 0) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
  }

  // Config + compte Stripe de la pro
  const [{ data: profil }, { data: compte }] = await Promise.all([
    supabaseAdmin.from('profiles').select('acompte_config, pro_pay_actif').eq('id', proId).maybeSingle(),
    supabaseAdmin.from('stripe_comptes').select('account_id, charges_enabled, pays, devise').eq('pro_id', proId).maybeSingle(),
  ])

  // Glamia Pay = abonnement Glamia Pro Pay, et lui seul. Ni l'essai gratuit
  // (décision de Chadi, 9 août 2026 : l'essai donne Glamia Pro, pas la caisse),
  // ni l'abonnement Pro à 14,99 n'ouvrent l'acompte à la réservation.
  //
  // VERROU SERVEUR, ET C'EST LE SEUL QUI COMPTE : la page de réservation est
  // publique, personne n'y est connecté, et l'app de la pro ne peut rien y
  // interdire. Sans ce refus ici, l'acompte continuerait d'être demandé à ses
  // clientes après la fin de son abonnement.
  const config = (profil?.acompte_config ?? {}) as Config
  if (!profil?.pro_pay_actif || !config.actif || !compte?.charges_enabled) {
    return NextResponse.json({ actif: false })
  }

  // ── LE RÉGLAGE DES NOUVELLES CLIENTES ──────────────────────────────────────
  // La pro peut demander davantage à qui ne connaît pas encore son salon : une
  // simple empreinte à ses fidèles, un acompte à une inconnue. Quand elle n'a
  // rien réglé de particulier (`nouvelles` absent), tout le monde a la même
  // règle et on ne va même pas lire le fichier clientes.
  const nouvelle = config.nouvelles ? await estUneNouvelleCliente(proId, body.telephone) : false
  const regle: Reglage = nouvelle && config.nouvelles ? config.nouvelles : config

  // ── L'ACOMPTE SE CALCULE SUR LE VRAI PRIX ────────────────────────────────
  // Il se calculait sur le total envoyé par le navigateur. Déclarer 20 pour un
  // microblading à 250 suffisait à ne verser qu'un acompte de 3 : la pro
  // sécurisait presque rien, et en mode paiement complet la cliente réglait 20
  // pour une prestation à 250.
  //
  // On recalcule donc le panier depuis le catalogue de la pro, et les remises
  // depuis sa fiche cliente. Le navigateur choisit les prestations, il ne dit
  // plus ce qu'elles valent.
  //
  // SANS PANIER LISIBLE, on retombe sur le total annoncé : les anciennes
  // versions de la page n'envoient pas le détail, et une pro dont l'acompte
  // cesserait de s'afficher perdrait des réservations pour un chantier de
  // sécurité. La création du rendez-vous, elle, refuse — c'est là que l'argent
  // s'engage vraiment.
  const panier = await prixReelDuPanier(proId, body.techniques, body.offre_id)
  let prixServeur: number | null = panier?.prix ?? null
  if (panier) {
    const fiche = await ficheClienteParTelephone(proId, body.telephone)
    const remises = await remisesVerifiees(
      proId, fiche, panier.prix, body.fidelite_appliquee, body.reduction_appliquee,
    )
    prixServeur = remises.prix
  }

  const totalCentimes = Math.round((prixServeur ?? totalEuros) * 100)
  const totalPleinCentimes = panier
    ? Math.round(panier.prix * 100)
    : Math.round(Math.max(totalEuros, Number(body.total_plein) || 0) * 100)
  const mode: 'empreinte' | 'acompte' | 'total' =
    regle.mode === 'acompte' ? 'acompte' : regle.mode === 'total' ? 'total' : 'empreinte'
  // RDV OFFERT par la fidélité (prix ~0) — décision Chadi 18 juil. (Q2) :
  // - mode EMPREINTE : on pose quand même une empreinte, calculée sur le prix
  //   PLEIN (dédommagement no-show réel), pas sur le prix offert.
  // - mode ACOMPTE/TOTAL : rien (on ne pré-paie pas un RDV offert).
  const rdvOffert = totalCentimes < 100
  const baseCalcul = (mode === 'empreinte' && rdvOffert) ? totalPleinCentimes : totalCentimes
  // Paiement total : la base est le prix complet ; sinon l'acompte plafonné
  const acompte = mode === 'total' ? totalCentimes : calculerAcompte(baseCalcul, regle)
  if (acompte < 100) {
    // Moins d'1 € (prestation gratuite/quasi, ou acompte sur RDV offert) : pas de carte
    return NextResponse.json({ actif: false })
  }

  const stripeAccount = compte.account_id
  // LE PAYS ET LA MONNAIE DE LA CAISSE. Une pro suisse encaisse des francs, une
  // Canadienne des dollars — et leurs frais ne sont pas ceux de la zone euro.
  // Caisse ouverte avant le 5 août 2026 : les colonnes sont vides, on retombe
  // sur la France et l'euro, ce qui était le seul cas possible à l'époque.
  const paysCaisse = (compte.pays as string | null) ?? 'FR'
  const devise = ((compte.devise as string | null) ?? 'eur').toLowerCase()

  // Config figée dans l'intent : la vérification anti-fraude de /lier doit
  // recalculer l'acompte attendu avec le réglage EN VIGUEUR AU PAIEMENT, pas
  // celui du moment de la liaison — sinon une pro qui change sa config entre
  // les deux fait rejeter un paiement légitime déjà encaissé (faille C9).
  //
  // C'EST LA RÈGLE EFFECTIVEMENT APPLIQUÉE qu'on fige, pas celle des habituées :
  // sinon un acompte de nouvelle cliente serait recalculé au tarif des fidèles
  // et rejeté comme frauduleux alors qu'il vient d'être encaissé.
  const glamiaCfg = JSON.stringify({ type: regle.type ?? 'pourcent', valeur: regle.valeur ?? 0 })

  try {
    if (mode === 'empreinte') {
      // Carte enregistrée avec 3DS, prélèvement futur possible hors session
      const customer = await stripe().customers.create(
        { metadata: { glamia_pro_id: proId } },
        { stripeAccount },
      )
      const setup = await stripe().setupIntents.create(
        {
          customer: customer.id,
          usage: 'off_session',
          // Carte uniquement (Apple Pay/Google Pay passent par 'card' en wallet)
          // — pas de Bancontact/Klarna/iDEAL
          // ── POURQUOI PLUS DE LISTE FIGÉE ────────────────────────────────
          // Avec `payment_method_types: ['card']`, le composant Stripe n'affiche
          // que le formulaire de carte : Apple Pay et Google Pay ne sortent pas.
          // C'est ce qui manquait le 7 août — le domaine était déclaré, le
          // fichier en place, et rien n'apparaissait.
          //
          // `allow_redirects: 'never'` garde le comportement actuel : seuls les
          // moyens qui se règlent SANS quitter la page. Pas de virement, pas de
          // paiement en trois fois qui emmènerait la cliente ailleurs au milieu
          // de sa réservation — juste la carte et les portefeuilles du
          // téléphone.
          automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
          metadata: { glamia_pro_id: proId, glamia_type: 'empreinte', glamia_acompte: String(acompte), glamia_cfg: glamiaCfg },
        },
        { stripeAccount },
      )
      // frais = frais PROJETÉS du prélèvement (lapin/annulation tardive) — rien
      // n'est débité aujourd'hui, mais la cliente doit savoir que l'empreinte
      // serait prélevée majorée de ces frais (transparence, même formule que
      // stripe-acompte action prelever). total_cliente reste 0 : rien maintenant.
      const { frais: fraisPrelevement } = calculerTotalCliente(acompte, paysCaisse)
      return NextResponse.json({
        actif: true, mode, acompte, frais: fraisPrelevement, total_cliente: 0, devise,
        delai_annulation: (config as { delai_annulation?: number }).delai_annulation === 48 ? 48 : 24,
        client_secret: setup.client_secret, stripe_account: stripeAccount, intent_id: setup.id,
      })
    }

    // Acompte réel OU prestation complète : payé maintenant + frais de résa
    const { commission, totalCliente, frais } = calculerTotalCliente(acompte, paysCaisse)
    const customer = await stripe().customers.create(
      { metadata: { glamia_pro_id: proId } },
      { stripeAccount },
    )
    const paiement = await stripe().paymentIntents.create(
      {
        amount: totalCliente,
        currency: devise,
        customer: customer.id,
        setup_future_usage: 'off_session',
        // Carte uniquement (Apple Pay/Google Pay inclus via wallet 'card')
        // Même raison que pour l'empreinte : une liste figée sur « card »
        // empêche Apple Pay et Google Pay d'apparaître.
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        application_fee_amount: commission,
        metadata: { glamia_pro_id: proId, glamia_type: mode, glamia_acompte: String(acompte), glamia_frais: String(frais), glamia_cfg: glamiaCfg },
      },
      { stripeAccount },
    )
    return NextResponse.json({
      actif: true, mode, acompte, frais, total_cliente: totalCliente, devise,
      // Le délai choisi par la pro — la cliente doit le lire AVANT de réserver.
      delai_annulation: (config as { delai_annulation?: number }).delai_annulation === 48 ? 48 : 24,
      client_secret: paiement.client_secret, stripe_account: stripeAccount, intent_id: paiement.id,
    })
  } catch (e) {
    console.error('[api/propay/intent]', e)
    return NextResponse.json({ error: 'stripe_error' }, { status: 500 })
  }
}
