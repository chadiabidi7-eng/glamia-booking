import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { normaliserTelephone } from '@/lib/telephone'

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

    const cible = normaliserTelephone(telephone)
    // Un numéro trop court reconnaîtrait n'importe qui : on refuse plutôt que
    // de renvoyer une cliente au hasard à quelqu'un qui tâtonne.
    if (cible.length < 9) {
      return NextResponse.json({ cliente: null })
    }

    // La comparaison se fait sur le numéro NORMALISÉ, donc en mémoire : les
    // numéros sont stockés dans des formats variés (espaces, +33, 0033).
    const { data: clientes, error } = await supabaseAdmin
      .from('clientes')
      .select('id, prenom, nom, telephone, email, reduction_type, reduction_valeur, reduction_rdv_restants, bloquee_le')
      .eq('pro_id', pro_id)

    if (error) return NextResponse.json({ error: 'lecture' }, { status: 500 })

    const trouvee = (clientes ?? []).find(c => normaliserTelephone(c.telephone as string) === cible) ?? null

    // ── LES DEUX VERROUS DE LA PRO (4 septembre 2026) ─────────────────────────
    // Ils vivent ICI, au guichet, parce que le numéro est la première chose
    // que la page demande : le refus tombe immédiatement, personne ne remplit
    // un parcours pour être refusée à la fin.
    //
    // CLIENTE BLOQUÉE — le refus est DISCRET, et c'est voulu. Le mot
    // « bloquée » n'apparaît nulle part : le but est de protéger la pro, pas
    // de déclencher une confrontation au salon ou en commentaires. On ne
    // renvoie RIEN de sa fiche — pour la page, ce numéro n'a simplement pas
    // accès à la réservation en ligne.
    if (trouvee && trouvee.bloquee_le) {
      return NextResponse.json({ refus: 'indisponible' })
    }
    if (trouvee) {
      const { bloquee_le: _b, ...publique } = trouvee as Record<string, unknown>
      return NextResponse.json({ cliente: publique, creee: false })
    }

    // PAGE RÉSERVÉE AUX CLIENTES — un numéro absent du fichier est refusé,
    // avec le renvoi vers son Instagram : un refus qui recrute au lieu de
    // fermer la porte. Une cliente CONNUE ne passe jamais par ici : pour
    // elle, ce mode n'a aucune existence visible.
    const { data: profil } = await supabaseAdmin
      .from('profiles')
      .select('resa_reservee_aux_clientes, instagram')
      .eq('id', pro_id)
      .maybeSingle()
    if (profil?.resa_reservee_aux_clientes) {
      return NextResponse.json({ refus: 'nouvelles_fermees', instagram: profil.instagram ?? null })
    }

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
