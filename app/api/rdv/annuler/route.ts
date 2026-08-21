import { createClient } from '@supabase/supabase-js'
import { traiterAnnulationPropay } from '@/lib/propay'
import { NextRequest, NextResponse } from 'next/server'
import { normaliserTelephone } from '@/lib/telephone'

// ─────────────────────────────────────────────────────────────────────────────
// Guichet serveur — annulation d'un RDV par la CLIENTE depuis la page de résa.
// Chantier RLS (18 juil. 2026) : remplace l'écriture anonyme directe. VÉRIFIE
// que le téléphone fourni est bien celui de la cliente du RDV AVANT d'agir —
// sans ça, la clé anonyme publique permettait d'annuler le RDV de n'importe qui.
// Tout le travail (statut, paiement, fidélité, réduction) est fait ici en
// service role, après la vérification de propriété.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)


export async function POST(req: NextRequest) {
  let body: { rdv_id?: unknown; telephone?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }) }

  const rdvId = body.rdv_id
  const telephone = body.telephone
  if (typeof rdvId !== 'string' || !/^[0-9a-f-]{36}$/i.test(rdvId)
    || typeof telephone !== 'string' || telephone.trim().length < 6) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
  }

  const { data: rdv } = await supabaseAdmin
    .from('rendez_vous')
    .select('id, pro_id, cliente_id, statut, fidelite_appliquee, reduction_appliquee, cliente:clientes(telephone)')
    .eq('id', rdvId)
    .maybeSingle()
  if (!rdv) return NextResponse.json({ error: 'rdv_introuvable' }, { status: 404 })

  // ── VÉRIFICATION DE PROPRIÉTÉ : le téléphone doit être celui de la cliente ──
  const telRdv = (rdv as { cliente?: { telephone?: string } }).cliente?.telephone
  if (!telRdv || normaliserTelephone(telRdv) !== normaliserTelephone(telephone)) {
    return NextResponse.json({ error: 'non_autorise' }, { status: 403 })
  }

  if (rdv.statut === 'annule') {
    return NextResponse.json({ success: true, deja: true })
  }

  // 1) Annuler le RDV (origine cliente → traitement paiement normal, garde C16)
  const { error: updErr } = await supabaseAdmin
    .from('rendez_vous')
    .update({ statut: 'annule', notif_annulation_vue: false, annule_par: 'cliente' })
    .eq('id', rdvId)
    .neq('statut', 'annule')
  if (updErr) return NextResponse.json({ error: 'update_failed' }, { status: 500 })

  // ── 2) LE VOLET PAIEMENT ───────────────────────────────────────────────
  // Il était absent, et c'est ce qui manquait le plus. Ce fichier vient de la
  // ligne 2.3, celle SANS Glamia Pay : un commentaire disait de le
  // réintroduire à la fusion, et personne ne l'a fait. Résultat, une cliente
  // qui annulait depuis sa page de réservation n'était JAMAIS remboursée —
  // même en annulant une semaine à l'avance. Son argent restait chez la pro
  // sans que ni l'une ni l'autre ne le sache. Constaté par Chadi le 7 août
  // 2026 sur deux annulations d'essai.
  //
  // On ne bloque pas l'annulation là-dessus : le rendez-vous est déjà annulé
  // au-dessus, et il doit le rester même si le remboursement échoue. Le cron
  // de réconciliation rattrapera ce qui n'a pas abouti.
  try {
    const { resultat } = await traiterAnnulationPropay(rdvId)
    console.log('[api/rdv/annuler] paiement :', rdvId, resultat)
  } catch (e) {
    console.error('[api/rdv/annuler] paiement non traité :', rdvId, e)
  }

  // 3) Restaurer la carte de fidélité (défaire le tampon / la récompense de ce RDV)
  try {
    const { data: profil } = await supabaseAdmin
      .from('profiles').select('fidelite_config').eq('id', rdv.pro_id).maybeSingle()
    const cfg = profil?.fidelite_config as
      { active?: boolean; nb_ronds?: number; paliers?: { position: number }[] } | null
    if (cfg?.active && rdv.cliente_id) {
      const { data: fiche } = await supabaseAdmin
        .from('fidelite_clientes').select('*')
        .eq('pro_id', rdv.pro_id).eq('cliente_id', rdv.cliente_id).maybeSingle()
      if (fiche) {
        const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
        const fidAppliquee = rdv.fidelite_appliquee as { type: string; valeur: number } | null
        if (fidAppliquee) {
          const wasCardReset = fiche.tampons === 0 && fiche.cartes_completees > 0
          if (wasCardReset) {
            update.tampons = (cfg.nb_ronds ?? 10) - 1
            update.cartes_completees = fiche.cartes_completees - 1
          } else {
            update.tampons = Math.max(0, fiche.tampons - 1)
          }
        } else if (fiche.tampons > 0) {
          update.tampons = fiche.tampons - 1
          const palierActuel = (cfg.paliers ?? []).find(p => p.position === fiche.tampons)
          if (palierActuel && fiche.recompense_disponible) update.recompense_disponible = null
        }
        await supabaseAdmin.from('fidelite_clientes').update(update).eq('id', fiche.id)
      }
    }
  } catch (e) { console.error('[rdv/annuler] fidélité:', e) }

  // 4) Rendre l'utilisation d'une réduction limitée à la cliente
  const reduc = rdv.reduction_appliquee as { type: string; valeur: number; limitee?: boolean } | null
  if (reduc?.limitee && rdv.cliente_id) {
    try {
      await supabaseAdmin.rpc('restaurer_reduction_cliente', {
        p_cliente_id: rdv.cliente_id, p_type: reduc.type, p_valeur: reduc.valeur,
      })
    } catch (e) { console.error('[rdv/annuler] réduction:', e) }
  }

    // ── 3) LA TRACE ÉCRITE POUR LA CLIENTE ─────────────────────────────────
  // Elle annulait, et ne recevait rien. Aucune preuve que c'était pris en
  // compte, aucun mot sur l'acompte qu'elle avait avancé — donc un message à
  // sa pro pour le demander. Ce mail rend ce message inutile.
  //
  // ENVOYÉ EN DERNIER, une fois le paiement traité : c'est ce qui décide de ce
  // qu'il raconte (remboursé, conservé, ou empreinte libérée). L'envoyer plus
  // tôt le ferait mentir.
  //
  // Un échec d'envoi ne remet rien en cause : l'annulation, elle, a eu lieu.
  try {
    await fetch('https://gdgfgbxoapgmrbttdyac.supabase.co/functions/v1/rdv-cliente-mail', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ rdv_id: rdvId, motif: 'annule' }),
    })
  } catch (e) {
    console.error('[api/rdv/annule] mail cliente non envoyé :', rdvId, e)
  }

  return NextResponse.json({ success: true })
}
