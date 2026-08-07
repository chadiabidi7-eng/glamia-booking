import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

// ─────────────────────────────────────────────────────────────────────────────
// EMPÊCHER QU'ON REMPLISSE L'AGENDA D'UNE PRO DE FAUX RENDEZ-VOUS.
//
// LE TROU. La page de réservation est publique et sans limite d'appels. Le
// contrôle du créneau empêche deux clientes de prendre la même heure, mais rien
// n'empêchait d'enchaîner des centaines de réservations sous de faux noms. Une
// pro se réveillait avec sa semaine pleine et personne en face — et ses vraies
// clientes ne trouvaient plus une seule place.
//
// DEUX GARDE-FOUS PLUTÔT QU'UN. Le numéro attrape celui qui insiste avec le
// même téléphone ; la provenance attrape celui qui en invente un nouveau à
// chaque appel. Séparément, chacun se contourne ; ensemble, beaucoup moins.
//
// LES SEUILS SONT LARGES, ET C'EST VOULU. Une cliente qui réserve pour elle, sa
// sœur et sa mère dans la même heure doit passer sans s'en apercevoir. On ne
// vise pas l'usage inhabituel, on vise l'automate. Un seuil serré ferait perdre
// de vrais rendez-vous, ce qui coûterait plus cher que le mal qu'on soigne.
//
// ON NE GARDE QUE DES EMPREINTES, jamais le numéro ni l'adresse en clair :
// cette table sert à compter, pas à savoir qui.
//
// EN CAS DE PANNE, ON LAISSE PASSER. Si la lecture échoue, la réservation
// continue : une garde qui tombe ne doit jamais fermer la porte d'une pro à ses
// clientes. Le pire qu'on risque alors est ce qu'on avait déjà avant.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** Un même téléphone : au-delà, c'est qu'on insiste. */
const MAX_PAR_TELEPHONE = 6
/** Une même provenance : couvre le salon qui réserve pour plusieurs clientes. */
const MAX_PAR_SOURCE = 20
/** Une même pro : au-delà, ce n'est plus une journée, c'est une attaque. */
const MAX_PAR_PRO = 40
const FENETRE_MINUTES = 60

const empreinte = (v: string) => createHash('sha256').update(v).digest('hex').slice(0, 32)

export type Verdict = { ok: true } | { ok: false; raison: string }

/**
 * Cette réservation peut-elle passer ?
 *
 * À appeler AVANT d'écrire quoi que ce soit. L'appel enregistre la tentative :
 * une réservation refusée compte quand même, sinon il suffirait d'insister pour
 * ne jamais atteindre le plafond.
 */
export async function gardeReservation(
  proId: string,
  telephone: unknown,
  entetes: Headers,
): Promise<Verdict> {
  try {
    // L'adresse d'origine telle que la voit l'hébergeur. Absente en local, et
    // falsifiable — d'où le second garde-fou sur le téléphone.
    const source = entetes.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? entetes.get('x-real-ip')
      ?? 'inconnue'

    const eTel = typeof telephone === 'string' && telephone.trim()
      ? empreinte(telephone.replace(/\D/g, ''))
      : null
    const eSource = empreinte(source)
    const depuis = new Date(Date.now() - FENETRE_MINUTES * 60_000).toISOString()

    const compter = async (colonne: string, valeur: string, avecPro: boolean) => {
      let q = supabaseAdmin
        .from('garde_reservations')
        .select('id', { count: 'exact', head: true })
        .gte('quand', depuis)
        .eq(colonne, valeur)
      if (avecPro) q = q.eq('pro_id', proId)
      const { count, error } = await q
      if (error) throw error
      return count ?? 0
    }

    const [parTel, parSource, parPro] = await Promise.all([
      eTel ? compter('empreinte_tel', eTel, false) : Promise.resolve(0),
      compter('empreinte_source', eSource, false),
      supabaseAdmin
        .from('garde_reservations')
        .select('id', { count: 'exact', head: true })
        .gte('quand', depuis)
        .eq('pro_id', proId)
        .then(({ count }) => count ?? 0),
    ])

    // La tentative est notée quoi qu'il arrive : sans ça, un refus remettrait
    // le compteur à zéro et il suffirait d'insister.
    await supabaseAdmin.from('garde_reservations').insert({
      pro_id: proId, empreinte_tel: eTel, empreinte_source: eSource,
    })

    if (parTel >= MAX_PAR_TELEPHONE) return { ok: false, raison: 'trop_de_reservations' }
    if (parSource >= MAX_PAR_SOURCE) return { ok: false, raison: 'trop_de_reservations' }
    if (parPro >= MAX_PAR_PRO) return { ok: false, raison: 'trop_de_reservations' }
    return { ok: true }
  } catch (e) {
    // Une garde qui tombe ne ferme jamais la porte d'une pro à ses clientes.
    console.error('[garde-reservations] lecture impossible, on laisse passer :', e)
    return { ok: true }
  }
}
