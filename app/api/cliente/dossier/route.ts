import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

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

function normalizePhone(tel: string): string {
  let n = (tel ?? '').replace(/[\s\-.()]/g, '')
  if (n.startsWith('+33')) n = '0' + n.slice(3)
  if (n.startsWith('0033')) n = '0' + n.slice(4)
  return n
}

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

    if (!fiche || normalizePhone(fiche.telephone as string) !== normalizePhone(telephone)) {
      // Même réponse qu'une cliente sans rien : ne pas indiquer si la fiche
      // existe, sinon l'erreur elle-même devient un moyen de deviner.
      return NextResponse.json({ rdvs: [], fidelite: null })
    }

    const { data: rdvs } = await supabaseAdmin
      .from('rendez_vous')
      .select('id, date, specialite, technique, duree, prix, statut, fidelite_appliquee, reduction_appliquee, techniques, offre_id, inspirations')
      .eq('cliente_id', cliente_id)
      .eq('pro_id', pro_id)
      .gte('date', new Date().toISOString())
      .neq('statut', 'annule')
      .order('date', { ascending: true })

    const { data: fidelite } = await supabaseAdmin
      .from('fidelite_clientes')
      .select('tampons, cartes_completees, recompense_disponible')
      .eq('pro_id', pro_id)
      .eq('cliente_id', cliente_id)
      .maybeSingle()

    return NextResponse.json({ rdvs: rdvs ?? [], fidelite: fidelite ?? null })
  } catch (e) {
    console.error('[cliente/dossier] erreur', e)
    return NextResponse.json({ error: 'erreur_interne' }, { status: 500 })
  }
}
