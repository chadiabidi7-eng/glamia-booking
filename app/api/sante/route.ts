import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// LE CONTRÔLE DE SANTÉ DU BOOKING.
//
// Il ne rejoue pas un scénario écrit d'avance : il LIT LA CONFIGURATION DU
// SALON et en déduit ce qu'il y a à essayer. Un pack créé dans l'app apparaît
// ici au prochain appel, avec ses vraies prestations et son vrai prix. La
// fidélité désactivée devient un scénario « sans objet » au lieu d'un échec.
// Rien n'est figé, parce qu'une vérification figée finit toujours par tester
// un produit qui n'existe plus.
//
// Chaque scénario emprunte LES MÊMES GUICHETS que la page de réservation, dans
// le même ordre, avec les mêmes corps de requête. Si `/api/rdv/creer` casse, ce
// contrôle casse. C'est toute sa raison d'être : une vérification qui emprunte
// un chemin parallèle passe au vert pendant que la vraie réservation est morte,
// et ça vaut moins que rien.
//
// CE QU'IL NE COUVRE PAS, et il faut le savoir
//   La page elle-même : si son JavaScript casse, ce contrôle reste vert.
//   Le paiement réel : on va jusqu'à l'intention — le montant que Stripe
//   réclame, empreinte ou acompte — jamais jusqu'au débit d'une carte.
//   Les notifications, volontairement : voir plus bas.
//
// POURQUOI IL PEUT ÉCRIRE SANS QUE PERSONNE NE REÇOIVE RIEN
//   `/api/rdv/creer` n'envoie aucune notification. C'est la page qui les
//   déclenche ensuite, par des appels séparés à `/api/push-notify` et
//   `/api/rdv/mail-confirmation`. On ne les appelle pas.
//
// SUR QUI IL TRAVAILLE
//   Uniquement un salon marqué `compte_test`. Le contrôle le vérifie lui-même
//   et refuse d'écrire sinon : c'est la même colonne qui exempte le compte de
//   la garde anti-abus, donc le seul endroit où réserver en boucle est sans
//   conséquence. Les rendez-vous sont posés loin devant et supprimés à la fin,
//   y compris quand une étape échoue en cours de route.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** Le salon d'essai. Sa colonne `compte_test` est revérifiée à chaque appel. */
const SLUG_TEST = 'lila-nails-beauty-nails'
/** Une cliente de démonstration qui existe déjà chez elle. */
const TEL_CONNUE = '0600000099'
/** Un numéro qui n'est chez personne : sert à l'essai « nouvelle cliente ». */
const TEL_INCONNUE = '0600000404'
/** À combien de jours on pose les rendez-vous d'essai. */
const JOURS_DEVANT = 120
/** Sur combien de jours chercher un créneau libre avant d'abandonner. */
const JOURS_FOUILLES = 14

type Etat = 'ok' | 'échec' | 'sans objet'
type Scenario = { scenario: string; etat: Etat; ms: number; detail?: string }
/** Une prestation du catalogue, aplatie avec sa catégorie. */
type Presta = { id: string; nom: string; categorie: string; prix: number; duree: number }
/** Ce que le panier envoie aux guichets : des noms, pas des identifiants. */
type Ligne = { nom: string; categorie: string; quantite: number }
type Offre = { id: string; nom: string; type: string; prix_promo: number; prestations_ids: string[] }

export async function GET(req: NextRequest) {
  // Sans jeton, n'importe qui déclencherait des écritures. Il vit dans les
  // variables d'environnement Vercel.
  const attendu = process.env.SANTE_TOKEN
  const donne = req.headers.get('x-sante-token') ?? req.nextUrl.searchParams.get('token')
  if (!attendu || donne !== attendu) {
    return NextResponse.json({ error: 'non_autorise' }, { status: 401 })
  }

  const p = req.nextUrl.searchParams
  // `ecrire=0` s'arrête avant toute réservation : de quoi surveiller en continu
  // sans jamais rien poser en base.
  const ecrire = p.get('ecrire') !== '0'
  // `paiement=1` va jusqu'à demander une intention à Stripe, puis l'annule.
  // Hors de ce drapeau on n'en crée aucune : un objet Stripe, même jamais
  // confirmé, reste une trace dans un compte de production.
  const paiement = p.get('paiement') === '1'
  // `seulement=pack,fidelite` restreint aux scénarios nommés.
  const filtre = (p.get('seulement') ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const slug = p.get('slug') ?? SLUG_TEST

  const base = req.nextUrl.origin
  const scenarios: Scenario[] = []
  const aSupprimer: string[] = []

  // Sur un aperçu protégé, les guichets exigent le même laissez-passer que
  // celui qui nous a appelés : notre requête serveur vers serveur n'en a
  // aucun. On repasse simplement celui qu'on a reçu. En production, où rien
  // n'est protégé, ces en-têtes sont absents et cela ne change rien.
  const laissezPasser: Record<string, string> = { 'Content-Type': 'application/json' }
  for (const cle of ['cookie', 'x-vercel-protection-bypass']) {
    const valeur = req.headers.get(cle)
    if (valeur) laissezPasser[cle] = valeur
  }

  /** Appelle un guichet du booking, exactement comme le ferait la page. */
  const appeler = async (chemin: string, corps: unknown): Promise<Record<string, unknown>> => {
    const rep = await fetch(`${base}${chemin}`, {
      method: 'POST',
      headers: laissezPasser,
      body: JSON.stringify(corps),
      cache: 'no-store',
    })
    const texte = await rep.text()
    let donnees: Record<string, unknown> = {}
    try { donnees = JSON.parse(texte) } catch { /* réponse non JSON */ }
    if (!rep.ok) throw new Error(`${chemin} → HTTP ${rep.status} · ${texte.slice(0, 160)}`)
    return donnees
  }

  /** Enveloppe un scénario : chronomètre, attrape l'échec, n'interrompt rien. */
  const jouer = async (nom: string, corps: () => Promise<string | null>) => {
    if (filtre.length && !filtre.includes(nom)) return
    const depart = Date.now()
    try {
      const saute = await corps()
      scenarios.push(saute
        ? { scenario: nom, etat: 'sans objet', ms: Date.now() - depart, detail: saute }
        : { scenario: nom, etat: 'ok', ms: Date.now() - depart })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      scenarios.push({ scenario: nom, etat: 'échec', ms: Date.now() - depart, detail: message.slice(0, 260) })
    }
  }

  // ── LE GARDE-FOU : JAMAIS SUR UNE VRAIE PRO ──────────────────────────
  // Avant de lire quoi que ce soit. `compte_test` est la colonne qui exempte
  // déjà ce compte de la garde anti-abus : c'est exactement le périmètre où
  // réserver en boucle ne coûte rien à personne.
  // `pro_pay_actif` se lit ici et pas dans `/api/pro` : ce guichet le retire
  // exprès de sa réponse. Sans lui, le contrôle annoncerait « Glamia Pay
  // inactif » sur un salon qui l'a — un faux « sans objet », c'est-à-dire un
  // scénario qu'on croit couvert et qui ne l'est pas.
  const { data: marque } = await supabaseAdmin
    .from('profiles').select('id, compte_test, pro_pay_actif').eq('slug', slug).maybeSingle()
  if (!marque) {
    return NextResponse.json({ ok: false, verdict: `aucun salon au slug « ${slug} »`, scenarios: [] }, { status: 503 })
  }
  if (marque.compte_test !== true && ecrire) {
    return NextResponse.json({
      ok: false,
      verdict: `« ${slug} » n’est pas un compte de test : le contrôle refuse d’y écrire. Relancer avec ecrire=0 pour une vérification en lecture seule.`,
      scenarios: [],
    }, { status: 400 })
  }

  // ── LA CONFIGURATION VIVANTE DU SALON ────────────────────────────────
  // Tout ce qui suit en découle. On ne devine rien, on ne code en dur ni une
  // prestation, ni un prix, ni une durée.
  const accueil = await appeler('/api/pro', { slug }).catch((e: Error) => ({ erreur: e.message }))
  if ('erreur' in accueil) {
    return NextResponse.json({ ok: false, verdict: `le guichet d’accueil ne répond pas : ${accueil.erreur}`, scenarios: [] }, { status: 503 })
  }
  if (accueil.etat !== 'ok') {
    return NextResponse.json({
      ok: false,
      verdict: `la page de ce salon est fermée (état « ${accueil.etat} ») — abonnement expiré ou formulaire désactivé`,
      scenarios: [],
    }, { status: 503 })
  }

  const fiche = accueil.pro as Record<string, unknown>
  const proId = fiche.id as string
  const prestations = aplatirCatalogue(accueil.catalogue)
  const equipe = Array.isArray(accueil.equipe)
    ? accueil.equipe as { id: string; prenom?: string; prestations?: Record<string, { assure?: boolean; duree?: number | null }> }[]
    : []

  const fideliteConfig = fiche.fidelite_config as { active?: boolean; nb_ronds?: number } | null
  const acompteConfig = fiche.acompte_config as { actif?: boolean; mode?: string } | null
  const proPay = marque.pro_pay_actif === true
  const questions = Array.isArray(fiche.questions_resa) ? fiche.questions_resa as Record<string, unknown>[] : []

  // Les offres passent par la même fonction que la page — pas par un guichet.
  const { data: brutes } = await supabase.rpc('get_eligible_offers', { p_pro_id: proId, p_telephone: TEL_CONNUE })
  const offres: Offre[] = (brutes ?? []).map((o: Record<string, unknown>) => ({
    id: String(o.id), nom: String(o.nom ?? ''), type: String(o.type ?? ''),
    prix_promo: Number(o.prix_promo ?? 0),
    prestations_ids: Array.isArray(o.prestations_ids) ? o.prestations_ids as string[] : [],
  }))
  const packs = offres.filter(o => o.type === 'pack')
  const promos = offres.filter(o => o.type === 'prix_fixe')

  // Les journées d'essai, loin devant, hors de toute vue courante.
  const jours = Array.from({ length: JOURS_FOUILLES }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + JOURS_DEVANT + i)
    return d.toISOString().slice(0, 10)
  })

  /** Le premier créneau libre pour cette durée, sur la fenêtre fouillée. */
  const premierLibre = async (duree: number, praticienne: string | null = null) => {
    const corps: Record<string, unknown> = { pro_id: proId, duree, dates: jours }
    if (praticienne) corps.personnes = [{ id: praticienne, duree }]
    const rep = await appeler('/api/creneaux', corps)
    const parJour = (rep.creneaux ?? {}) as Record<string, { heure: string; disponible: boolean }[]>
    for (const date of jours) {
      const libre = (parJour[date] ?? []).find(c => c?.disponible)
      if (libre) return { date, heure: libre.heure }
    }
    return null
  }

  /** Le parcours complet, jusqu'à la ligne créée en base. */
  const reserver = async (o: {
    clienteId: string; date: string; heure: string; duree: number
    lignes: Ligne[]; offreId?: string | null; prix: number
    praticienneId?: string | null; fidelite?: unknown
  }) => {
    // Le même juge que la page consulte avant de laisser payer.
    const verdict = await appeler('/api/creneaux/verifier', {
      pro_id: proId, date: o.date, heure: o.heure, duree: o.duree,
      praticienne_id: o.praticienneId ?? null,
    })
    if (verdict.ok === false) throw new Error(`créneau refusé avant paiement : ${verdict.raison ?? 'sans raison'}`)

    const creation = await appeler('/api/rdv/creer', {
      pro_id: proId,
      cliente_id: o.clienteId,
      telephone: TEL_CONNUE,
      date: o.date, heure: o.heure, duree: o.duree,
      praticienne_id: o.praticienneId ?? null,
      specialite: o.lignes[0]?.categorie ?? null,
      technique: o.lignes.map(l => l.nom).join(' + '),
      techniques: o.lignes,
      offre_id: o.offreId ?? null,
      prix: o.prix,
      notes: 'CONTRÔLE DE SANTÉ — supprimé automatiquement',
      demande_rappel: false,
      fidelite_appliquee: o.fidelite ?? null,
      reponses_questions: reponsesBidon(questions),
    })
    if (creation.ok !== true || typeof creation.id !== 'string') {
      throw new Error(`réservation refusée : ${creation.raison ?? creation.error ?? 'sans raison'}`)
    }
    aSupprimer.push(creation.id)
    return creation.id
  }

  /** Les lignes de panier correspondant aux prestations d'une offre. */
  const lignesDe = (offre: Offre): Ligne[] =>
    prestations.filter(x => offre.prestations_ids.includes(x.id))
      .map(x => ({ nom: x.nom, categorie: x.categorie, quantite: 1 }))

  const dureeDe = (lignes: Ligne[]) =>
    lignes.reduce((t, l) => t + (prestations.find(x => x.nom === l.nom && x.categorie === l.categorie)?.duree ?? 0) * l.quantite, 0)

  // ── LES SCÉNARIOS ────────────────────────────────────────────────────

  await jouer('vitrine', async () => {
    const v = await appeler('/api/pro/vitrine', { pro_id: proId, compter: true })
    if (v.error) throw new Error(String(v.error))
    return null
  })

  await jouer('prochaine-dispo', async () => {
    const d = await appeler('/api/pro/prochaine-dispo', { pro_id: proId })
    if (!d.date) return 'aucune disponibilité annoncée — planning plein, ou fermé'
    return null
  })

  let clienteId: string | null = null

  await jouer('cliente-connue', async () => {
    const c = await appeler('/api/cliente/identifier', { pro_id: proId, telephone: TEL_CONNUE })
    if (c.refus) throw new Error(`la cliente d’essai est refusée : ${c.refus}`)
    clienteId = (c.cliente as { id?: string } | null)?.id ?? null
    if (!clienteId) throw new Error('la cliente d’essai n’est pas reconnue à son numéro')
    return null
  })

  await jouer('cliente-nouvelle', async () => {
    const c = await appeler('/api/cliente/identifier', { pro_id: proId, telephone: TEL_INCONNUE })
    if ((c.cliente as { id?: string } | null)?.id) {
      throw new Error('un numéro inconnu a été reconnu comme une cliente existante')
    }
    return null
  })

  await jouer('dossier', async () => {
    if (!clienteId) return 'la cliente n’a pas été identifiée'
    const d = await appeler('/api/cliente/dossier', { pro_id: proId, cliente_id: clienteId, telephone: TEL_CONNUE })
    if (d.error) throw new Error(String(d.error))
    if (!Array.isArray(d.rdvs)) throw new Error('le dossier ne renvoie pas la liste des rendez-vous')
    return null
  })

  await jouer('prestation-simple', async () => {
    if (!ecrire) return 'écriture désactivée'
    if (!clienteId) return 'la cliente n’a pas été identifiée'
    const presta = prestations[0]
    if (!presta) return 'aucune prestation active au catalogue'
    const quand = await premierLibre(presta.duree)
    if (!quand) return `aucun créneau de ${presta.duree} min sur ${JOURS_FOUILLES} jours`
    await reserver({
      clienteId, ...quand, duree: presta.duree, prix: presta.prix,
      lignes: [{ nom: presta.nom, categorie: presta.categorie, quantite: 1 }],
    })
    return null
  })

  await jouer('plusieurs-prestations', async () => {
    if (!ecrire) return 'écriture désactivée'
    if (!clienteId) return 'la cliente n’a pas été identifiée'
    if (prestations.length < 2) return 'moins de deux prestations au catalogue'
    const lignes = prestations.slice(0, 2).map(x => ({ nom: x.nom, categorie: x.categorie, quantite: 1 }))
    const duree = dureeDe(lignes)
    const quand = await premierLibre(duree)
    if (!quand) return `aucun créneau de ${duree} min sur ${JOURS_FOUILLES} jours`
    await reserver({
      clienteId, ...quand, duree, lignes,
      prix: prestations.slice(0, 2).reduce((t, x) => t + x.prix, 0),
    })
    return null
  })

  await jouer('pack', async () => {
    if (!packs.length) return 'aucun pack actif — rien à essayer'
    if (!ecrire) return 'écriture désactivée'
    if (!clienteId) return 'la cliente n’a pas été identifiée'
    const pack = packs[0]
    const lignes = lignesDe(pack)
    if (!lignes.length) throw new Error(`le pack « ${pack.nom} » ne désigne aucune prestation du catalogue`)
    const duree = dureeDe(lignes)
    const quand = await premierLibre(duree)
    if (!quand) return `aucun créneau de ${duree} min sur ${JOURS_FOUILLES} jours`
    await reserver({ clienteId, ...quand, duree, lignes, offreId: pack.id, prix: pack.prix_promo })
    return null
  })

  await jouer('promo', async () => {
    if (!promos.length) return 'aucune promo active — rien à essayer'
    if (!ecrire) return 'écriture désactivée'
    if (!clienteId) return 'la cliente n’a pas été identifiée'
    const promo = promos[0]
    const lignes = lignesDe(promo)
    if (!lignes.length) throw new Error(`la promo « ${promo.nom} » ne désigne aucune prestation du catalogue`)
    const duree = dureeDe(lignes)
    const quand = await premierLibre(duree)
    if (!quand) return `aucun créneau de ${duree} min sur ${JOURS_FOUILLES} jours`
    await reserver({ clienteId, ...quand, duree, lignes, offreId: promo.id, prix: promo.prix_promo })
    return null
  })

  // Chez l'assistante, la prestation ne peut pas être prise au hasard : elle a
  // sa propre liste et sa propre durée, et `/api/rdv/creer` refuse ce qu'elle
  // n'assure pas. On choisit donc dans SA liste, avec SA durée.
  await jouer('equipe', async () => {
    if (!equipe.length) return 'aucune assistante déclarée dans l’app'
    const assistante = equipe[0]
    const nom = assistante.prenom ?? 'l’assistante'
    const sienne = prestations
      .map(x => ({ presta: x, reglage: assistante.prestations?.[x.id] }))
      .find(x => x.reglage && x.reglage.assure !== false)
    if (!sienne) return `${nom} n’assure aucune prestation du catalogue`
    if (!ecrire) return 'écriture désactivée'
    if (!clienteId) return 'la cliente n’a pas été identifiée'
    const duree = sienne.reglage?.duree ?? sienne.presta.duree
    const quand = await premierLibre(duree, assistante.id)
    if (!quand) return `aucun créneau de ${duree} min chez ${nom} sur ${JOURS_FOUILLES} jours`
    await reserver({
      clienteId, ...quand, duree, prix: sienne.presta.prix,
      praticienneId: assistante.id,
      lignes: [{ nom: sienne.presta.nom, categorie: sienne.presta.categorie, quantite: 1 }],
    })
    return null
  })

  // La fidélité s'observe : on relève le compteur avant, on réserve, on
  // applique, on relit. Un tampon de plus, c'est que la chaîne tient.
  await jouer('fidelite', async () => {
    if (!fideliteConfig?.active) return 'la carte de fidélité est désactivée dans l’app'
    if (!ecrire) return 'écriture désactivée'
    if (!clienteId) return 'la cliente n’a pas été identifiée'
    const presta = prestations[0]
    if (!presta) return 'aucune prestation active au catalogue'

    const avant = await tamponsDe(proId, clienteId)
    const quand = await premierLibre(presta.duree)
    if (!quand) return `aucun créneau de ${presta.duree} min sur ${JOURS_FOUILLES} jours`
    const rdvId = await reserver({
      clienteId, ...quand, duree: presta.duree, prix: presta.prix,
      lignes: [{ nom: presta.nom, categorie: presta.categorie, quantite: 1 }],
    })
    const f = await appeler('/api/rdv/fidelite', { rdv_id: rdvId, telephone: TEL_CONNUE, recompense_existante: false })
    if (f.error) throw new Error(`fidélité : ${f.error}`)
    if (f.skipped) return `la carte n’a pas bougé : ${f.skipped}`

    const apres = await tamponsDe(proId, clienteId)
    // La carte pleine repart à zéro : les deux issues sont saines.
    const nbRonds = fideliteConfig.nb_ronds ?? 10
    const monte = apres === avant + 1
    const boucle = avant + 1 >= nbRonds && apres <= 1
    if (!monte && !boucle) throw new Error(`tampons inchangés : ${avant} avant, ${apres} après (carte de ${nbRonds})`)
    return null
  })

  // L'acompte et l'empreinte : on va jusqu'au montant que Stripe réclamerait,
  // puis on annule l'intention. Aucune carte n'est jamais débitée — un
  // contrôle automatique n'encaisse pas.
  await jouer('acompte-empreinte', async () => {
    if (!proPay) return 'Glamia Pay n’est pas actif sur ce salon'
    if (!acompteConfig?.actif) return 'ni acompte ni empreinte configurés dans l’app'
    if (!paiement) return 'désactivé par défaut — ajouter paiement=1 pour interroger Stripe'
    const presta = prestations[0]
    if (!presta) return 'aucune prestation active au catalogue'

    const intent = await appeler('/api/propay/intent', {
      pro_id: proId,
      total: presta.prix,
      techniques: [{ nom: presta.nom, categorie: presta.categorie, quantite: 1 }],
    })
    if (intent.error) throw new Error(`intention refusée : ${intent.error}`)
    if (intent.actif !== true) {
      return `Stripe ne réclame rien pour ${presta.prix} € (compte non prêt, ou montant sous le seuil d’1 €)`
    }
    const mode = String(intent.mode ?? '')
    if (!['empreinte', 'acompte', 'total'].includes(mode)) throw new Error(`mode inattendu : « ${mode} »`)
    if (!intent.client_secret) throw new Error('aucune intention renvoyée par Stripe')
    // Le mode annoncé doit être celui réglé dans l'app.
    const regle = acompteConfig.mode ?? 'empreinte'
    const attenduIci = regle === 'acompte' || regle === 'total' ? regle : 'empreinte'
    if (mode !== attenduIci) throw new Error(`l’app est réglée sur « ${regle} », Stripe répond « ${mode} »`)
    await annulerIntention(String(intent.intent_id ?? ''), String(intent.stripe_account ?? ''), mode)
    return null
  })

  // ── LE MÉNAGE, TOUJOURS ──────────────────────────────────────────────
  // Un contrôle qui laisse des rendez-vous derrière lui pollue l'agenda qu'il
  // surveille.
  let menage: 'sans objet' | 'fait' | 'ÉCHOUÉ' = 'sans objet'
  if (aSupprimer.length) {
    const { error } = await supabaseAdmin.from('rendez_vous').delete().in('id', aSupprimer)
    menage = error ? 'ÉCHOUÉ' : 'fait'
  }

  const rates = scenarios.filter(s => s.etat === 'échec')
  const ok = rates.length === 0 && menage !== 'ÉCHOUÉ'

  return NextResponse.json({
    ok,
    verdict: menage === 'ÉCHOUÉ'
      ? `des rendez-vous d’essai n’ont pas pu être supprimés : ${aSupprimer.join(', ')}`
      : ok
        ? 'le booking répond sur tout ce qui est configuré'
        : `${rates.length} scénario(s) en échec : ${rates.map(r => r.scenario).join(', ')}`,
    salon: fiche.pseudo ?? fiche.prenom ?? slug,
    configuration_lue: {
      prestations_actives: prestations.length,
      packs_actifs: packs.length,
      promos_actives: promos.length,
      assistantes: equipe.length,
      questions_resa: questions.length,
      fidelite: fideliteConfig?.active ? `active, carte de ${fideliteConfig.nb_ronds ?? 10}` : 'désactivée',
      glamia_pay: proPay ? 'actif' : 'inactif',
      acompte: acompteConfig?.actif ? `actif, mode « ${acompteConfig.mode ?? 'empreinte'} »` : 'inactif',
    },
    rdv_essai_crees: aSupprimer.length,
    menage,
    total_ms: scenarios.reduce((s, e) => s + e.ms, 0),
    scenarios,
    a_savoir: 'ne couvre ni la page elle-même, ni le débit réel d’une carte, ni les notifications',
  }, { status: ok ? 200 : 503 })
}

/** Le catalogue est rangé par catégorie : on l'aplatit en gardant l'actif. */
function aplatirCatalogue(data: unknown): Presta[] {
  if (!data || typeof data !== 'object') return []
  const sortie: Presta[] = []
  for (const [categorie, liste] of Object.entries(data as Record<string, unknown>)) {
    if (!Array.isArray(liste)) continue
    for (const brute of liste) {
      const q = brute as { id?: string; nom?: string; prix?: number; duree?: number; active?: boolean }
      if (q.active === false || !q.id || !q.nom) continue
      const duree = Number(q.duree ?? 0)
      if (duree <= 0) continue
      sortie.push({ id: q.id, nom: q.nom.trim(), categorie, prix: Number(q.prix ?? 0), duree })
    }
  }
  return sortie
}

/** Les questions de la pro reçoivent une réponse quelconque : on éprouve le
 *  passage du questionnaire, pas son contenu. */
function reponsesBidon(questions: Record<string, unknown>[]) {
  if (!questions.length) return []
  return questions.slice(0, 10).map(q => ({
    question: String(q.libelle ?? q.question ?? q.texte ?? 'question'),
    reponse: Array.isArray(q.choix) && q.choix.length ? String(q.choix[0]) : 'contrôle de santé',
  }))
}

/** Le nombre de tampons de la cliente, ou 0 si la carte n'existe pas encore. */
async function tamponsDe(proId: string, clienteId: string) {
  const { data } = await supabaseAdmin
    .from('fidelite_clientes').select('tampons')
    .eq('pro_id', proId).eq('cliente_id', clienteId).maybeSingle()
  return Number(data?.tampons ?? 0)
}

/** On annule l'intention qu'on vient de faire naître : rien ne traîne dans le
 *  Stripe de la pro. Un échec ici n'est pas grave — Stripe expire seul les
 *  intentions jamais confirmées — donc il ne fait pas tomber le scénario. */
async function annulerIntention(id: string, compte: string, mode: string) {
  if (!id || !compte) return
  try {
    const { stripe } = await import('@/lib/stripe-serveur')
    if (mode === 'empreinte') await stripe().setupIntents.cancel(id, {}, { stripeAccount: compte })
    else await stripe().paymentIntents.cancel(id, {}, { stripeAccount: compte })
  } catch (e) {
    console.warn('[sante] intention non annulée', id, e instanceof Error ? e.message : e)
  }
}
