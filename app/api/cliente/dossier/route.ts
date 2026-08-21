import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

import { instantReel } from '@/lib/heure-pro'
import { prestationsLisibles } from '@/lib/nomsPrestations'
import { avisFenetreMs } from '@/lib/reglages'
import { normaliserTelephone } from '@/lib/telephone'

// ─────────────────────────────────────────────────────────────────────────────
// Guichet serveur — ce qui appartient à UNE cliente : ses rendez-vous à venir
// et sa carte de fidélité.
//
// La page lisait `rendez_vous` et `fidelite_clientes` avec la clé publique,
// sous des règles qui autorisaient tout lire : 3 340 rendez-vous et 1 655
// cartes, toutes pros confondues. Dates, prestations, prix.
//
// LE NUMÉRO EST REVÉRIFIÉ ICI. La page envoie un identifiant de cliente, mais
// un identifiant se devine ou se rejoue : sans contrôle, il suffirait d'en
// essayer pour lire les rendez-vous de n'importe qui. On exige donc le
// téléphone, et on vérifie qu'il correspond bien à cette fiche.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)


export async function POST(req: NextRequest) {
  try {
    const { pro_id, cliente_id, telephone } = await req.json() as {
      pro_id?: string; cliente_id?: string; telephone?: string
    }

    if (!pro_id || !cliente_id || !telephone) {
      return NextResponse.json({ error: 'parametres_invalides' }, { status: 400 })
    }

    const { data: fiche } = await supabaseAdmin
      .from('clientes')
      .select('id, telephone')
      .eq('id', cliente_id)
      .eq('pro_id', pro_id)
      .maybeSingle()

    if (!fiche || normaliserTelephone(fiche.telephone as string) !== normaliserTelephone(telephone)) {
      // Même réponse qu'une cliente sans rien : ne pas indiquer si la fiche
      // existe, sinon l'erreur elle-même devient un moyen de deviner.
      return NextResponse.json({ rdvs: [], fidelite: null })
    }

    // Lancé tout de suite, attendu tout à la fin.
    const avisPromis = (async () => {
    // ── CE SUR QUOI ELLE PEUT ENCORE DONNER SON AVIS ───────────────────────
    // Un avis ne se demande pas par courrier : il se propose là où la cliente
    // revient déjà, c'est-à-dire sur la page de sa praticienne, quand elle a
    // donné son numéro. On lui montre ses rendez-vous des trois derniers
    // jours, et rien d'autre.
    //
    // On ne renvoie que ce qu'il faut pour afficher un bouton — la date, la
    // prestation, le jeton. Jamais le prix, jamais un identifiant de paiement.
    // ON PROPOSE L'AVIS MÊME QUAND LA PRO NE L'AFFICHE PAS. Son bouton dit
    // « Afficher sur ma page » : il commande la vitrine, pas la collecte. Elle
    // reçoit les avis dans son app dans tous les cas, et le jour où elle
    // rallume, tout apparaît. On testait `avis_actifs` ici : les quatre pros
    // qui l'avaient éteint perdaient les avis pour de bon, au lieu de les
    // mettre de côté.
      const { data: pro } = await supabaseAdmin
      .from('profiles').select('timezone').eq('id', pro_id).maybeSingle()

      let avisAProposer: { token: string; date: string; prestations: string }[] = []
      {
      // On remonte un peu plus loin que la fenêtre elle-même : un rendez-vous
      // qui COMMENCE en limite de fenêtre se TERMINE après, et il a encore
      // droit à son avis. Deux jours de marge, comme avant.
      const fenetreMs = await avisFenetreMs()
      const remonteeMs = fenetreMs + 2 * 24 * 3600 * 1000
      const { data: passes } = await supabaseAdmin
        .from('rendez_vous')
        .select('id, date, duree, technique, techniques, token_avis')
        .eq('cliente_id', cliente_id)
        .eq('pro_id', pro_id)
        .neq('statut', 'annule')
        .lt('date', new Date().toISOString())
        .gte('date', new Date(Date.now() - remonteeMs).toISOString())
        .order('date', { ascending: false })

      const deja = new Set<string>()
      const idsPasses = (passes ?? []).map(r => r.id as string)
      if (idsPasses.length) {
        const { data: avisExistants } = await supabaseAdmin
          .from('avis_clientes').select('rdv_id').in('rdv_id', idsPasses)
        for (const a of avisExistants ?? []) deja.add(a.rdv_id as string)
      }

      avisAProposer = (passes ?? [])
        .filter(r => {
          if (deja.has(r.id as string)) return false
          // Plus de condition sur le rappel. La clé d'avis existe pour tout
          // rendez-vous : une cliente enregistrée avec son seul numéro n'avait
          // jamais de rappel, donc jamais de bouton.
          if (!r.token_avis) return false
          // La fenêtre est comptée depuis la FIN du rendez-vous, comme côté
          // serveur d'écriture : les deux doivent dire la même chose — y
          // compris sur le fuseau, sans quoi le bouton apparaît ici alors que
          // la page d'avis répond « pas encore passé ».
          const fin = instantReel(r.date as string, pro?.timezone as string | null).getTime()
            + ((r.duree as number) ?? 60) * 60 * 1000
          return Date.now() <= fin + fenetreMs
        })
        .map(r => ({
          token: r.token_avis as string,
          date: r.date as string,
          prestations: prestationsLisibles(r.techniques, r.technique),
        }))
    }

      return avisAProposer
    })()

    const { data: rdvs } = await supabaseAdmin
      .from('rendez_vous')
      .select('id, date, specialite, technique, duree, prix, statut, fidelite_appliquee, reduction_appliquee, techniques, offre_id, inspirations, date_change_pro_le')
      .eq('cliente_id', cliente_id)
      .eq('pro_id', pro_id)
      .gte('date', new Date().toISOString())
      .neq('statut', 'annule')
      .order('date', { ascending: true })

    // ── CE QU'ELLE A DÉJÀ VERSÉ, ET CE QU'ELLE PERDRAIT ─────────────────────
    // La page doit pouvoir la prévenir AVANT qu'elle annule : passé le délai
    // fixé par la pro, son acompte ne lui revient pas. Le lui apprendre après
    // coup, c'est la meilleure façon de se faire détester.
    //
    // On ne renvoie que le strict nécessaire : le montant, ce que c'est, et le
    // délai. Jamais l'identifiant du paiement ni rien qui touche à la carte.
    const idsRdv = (rdvs ?? []).map(r => r.id as string)
    const { data: paiements } = idsRdv.length
      ? await supabaseAdmin
          .from('paiements')
          .select('rdv_id, type, mode, montant, statut')
          .in('rdv_id', idsRdv)
          .in('statut', ['acompte_paye', 'paye', 'empreinte_posee'])
      : { data: [] as { rdv_id: string; type: string; mode: string | null; montant: number; statut: string }[] }

    const { data: reglages } = await supabaseAdmin
      .from('profiles').select('acompte_config').eq('id', pro_id).maybeSingle()
    const delaiAnnulation =
      (reglages?.acompte_config as { delai_annulation?: number } | null)?.delai_annulation === 48 ? 48 : 24

    const parRdv = new Map((paiements ?? []).map(p => [p.rdv_id as string, p]))
    const rdvsAvecPaiement = (rdvs ?? []).map(r => {
      const p = parRdv.get(r.id as string)
      return {
        ...r,
        paiement: p
          ? {
              montant: p.montant as number,
              // « empreinte » = rien n'a été débité, la carte est seulement
              // gardée ; « acompte » ou « total » = l'argent est déjà parti.
              nature: p.statut === 'empreinte_posee' ? 'empreinte' : (p.type as string),
            }
          : null,
      }
    })

    const { data: fidelite } = await supabaseAdmin
      .from('fidelite_clientes')
      .select('tampons, cartes_completees, recompense_disponible')
      .eq('pro_id', pro_id)
      .eq('cliente_id', cliente_id)
      .maybeSingle()

    return NextResponse.json({
      rdvs: rdvsAvecPaiement,
      fidelite: fidelite ?? null,
      delai_annulation: delaiAnnulation,
      avis_a_laisser: await avisPromis,
    })
  } catch (e) {
    console.error('[cliente/dossier] erreur', e)
    return NextResponse.json({ error: 'erreur_interne' }, { status: 500 })
  }
}
