import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// ─────────────────────────────────────────────────────────────────────────────
// Guichet serveur — reconnaître une cliente à son numéro, ou la créer.
//
// Remplace trois lectures directes de la page de réservation. Elles passaient
// par la clé publique, avec une règle qui autorisait TOUT lire : les 3 032
// clientes de toutes les pros, avec leurs téléphones et leurs adresses mail.
// Des personnes qui n'ont jamais rien signé avec Glamia.
//
// Le navigateur envoie un numéro, le serveur répond sur CETTE cliente et rien
// d'autre. Il ne renvoie jamais la liste, et jamais un champ dont la page n'a
// pas besoin.
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
    const body = await req.json()
    const { pro_id, telephone, creer, prenom, nom, email } = body as {
      pro_id?: string; telephone?: string; creer?: boolean
      prenom?: string; nom?: string; email?: string
    }

    if (!pro_id || !telephone) {
      return NextResponse.json({ error: 'parametres_invalides' }, { status: 400 })
    }

    const cible = normalizePhone(telephone)
    // Un numéro trop court reconnaîtrait n'importe qui : on refuse plutôt que
    // de renvoyer une cliente au hasard à quelqu'un qui tâtonne.
    if (cible.length < 9) {
      return NextResponse.json({ cliente: null })
    }

    // La comparaison se fait sur le numéro NORMALISÉ, donc en mémoire : les
    // numéros sont stockés dans des formats variés (espaces, +33, 0033).
    const { data: clientes, error } = await supabaseAdmin
      .from('clientes')
      .select('id, prenom, nom, telephone, email, reduction_type, reduction_valeur, reduction_rdv_restants')
      .eq('pro_id', pro_id)

    if (error) return NextResponse.json({ error: 'lecture' }, { status: 500 })

    const trouvee = (clientes ?? []).find(c => normalizePhone(c.telephone as string) === cible) ?? null
    if (trouvee) return NextResponse.json({ cliente: trouvee, creee: false })

    if (!creer) return NextResponse.json({ cliente: null })

    const { data: creee, error: errCreation } = await supabaseAdmin
      .from('clientes')
      .insert({
        pro_id,
        prenom: (prenom ?? '').trim(),
        nom: (nom ?? '').trim(),
        telephone: cible,
        email: (email ?? '').trim() || null,
        source: 'booking',
      })
      .select('id, prenom, nom, telephone, email, reduction_type, reduction_valeur, reduction_rdv_restants')
      .single()

    if (errCreation) return NextResponse.json({ error: 'creation' }, { status: 500 })
    return NextResponse.json({ cliente: creee, creee: true })
  } catch (e) {
    console.error('[cliente/identifier] erreur', e)
    return NextResponse.json({ error: 'erreur_interne' }, { status: 500 })
  }
}
