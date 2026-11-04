import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { normaliserTelephone } from '@/lib/telephone'
import { delaiAvant } from '@/lib/heure-pro'
import { jugerDeplacement, personnesDuRdv } from '@/lib/deplacement'
import { messageDecalage, prevenirDuDeplacement } from '@/lib/notif-deplacement'
import { refusDelaiModif } from '@/lib/delai-modif'

// ─────────────────────────────────────────────────────────────────────────────
// Guichet serveur — décalage d'un RDV par la CLIENTE depuis la page de résa.
// Chantier RLS (18 juil. 2026) : remplace l'écriture anonyme directe. Vérifie le
// téléphone de la cliente, applique les gardes (décalage tardif avec paiement
// engagé = C4/M1 ; plafond de 3 décalages = Q1), puis met à jour la date.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)


const SEUIL_TARDIVE_MS = 24 * 3600_000
const MAX_DECALAGES = 3

// Décalage fermé à < 24 h du RDV quand un paiement Glamia Pay est engagé
// (sinon décaler puis annuler > 24 h contournerait la règle tardive).
async function decalageBloque(rdvId: string, dateRdv: string, proId: string): Promise<boolean> {
  // À l'heure de la pro (12 oct. 2026) : lue en heure de Greenwich, la limite
  // tombait 2 h trop tard en France l'été, 4 h trop tôt aux Antilles.
  const { data: pro } = await supabaseAdmin.from('profiles').select('timezone').eq('id', proId).maybeSingle()
  if (delaiAvant(dateRdv, pro?.timezone as string | null) >= SEUIL_TARDIVE_MS) return false
  const { data } = await supabaseAdmin
    .from('paiements').select('id').eq('rdv_id', rdvId)
    .in('statut', ['empreinte_posee', 'acompte_paye', 'paye']).limit(1)
  return (data ?? []).length > 0
}

export async function POST(req: NextRequest) {
  let body: { rdv_id?: unknown; telephone?: unknown; new_date?: unknown; praticienne_id?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }) }

  const rdvId = body.rdv_id
  const telephone = body.telephone
  const newDate = body.new_date
  if (typeof rdvId !== 'string' || !/^[0-9a-f-]{36}$/i.test(rdvId)
    || typeof telephone !== 'string' || telephone.trim().length < 6
    || typeof newDate !== 'string' || !newDate) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
  }

  const { data: rdv } = await supabaseAdmin
    .from('rendez_vous')
    .select('id, date, duree, techniques, praticienne_id, statut, nb_decalages, pro_id, cliente:clientes(telephone, prenom)')
    .eq('id', rdvId)
    .maybeSingle()
  if (!rdv) return NextResponse.json({ error: 'rdv_introuvable' }, { status: 404 })

  // ── VÉRIFICATION DE PROPRIÉTÉ ──
  const telRdv = (rdv as { cliente?: { telephone?: string } }).cliente?.telephone
  if (!telRdv || normaliserTelephone(telRdv) !== normaliserTelephone(telephone)) {
    return NextResponse.json({ error: 'non_autorise' }, { status: 403 })
  }

  if (rdv.statut === 'annule') {
    return NextResponse.json({ error: 'rdv_annule' }, { status: 409 })
  }
  // Le délai choisi par la pro (24, 48 ou 72 h) : passé, plus de décalage en ligne.
  const refusDelai = await refusDelaiModif(supabaseAdmin, rdv.pro_id as string, rdv.date as string)
  if (refusDelai) return NextResponse.json(refusDelai, { status: 403 })
  if (await decalageBloque(rdv.id, rdv.date as string, rdv.pro_id as string)) {
    return NextResponse.json({ error: 'decalage_tardif' }, { status: 403 })
  }
  if (((rdv as { nb_decalages?: number }).nb_decalages ?? 0) >= MAX_DECALAGES) {
    return NextResponse.json({ error: 'decalage_max_atteint' }, { status: 403 })
  }

  // ── ÉQUIPE : même règle qu'à la réservation (29 oct. 2026) ─────────────
  // Chez une pro qui a une assistante, l'heure est revérifiée pour la personne
  // qui la tient (ses heures, ses rendez-vous, sa durée), et le rendez-vous
  // note qui le fait désormais. Pour une pro seule : rien ne change.
  const juge = await jugerDeplacement(supabaseAdmin, {
    proId: rdv.pro_id as string,
    rdvId: rdv.id as string,
    nouvelleDate: newDate,
    personnes: await personnesDuRdv(supabaseAdmin, rdv.pro_id as string, rdv as never),
    praticienneDemandee: body.praticienne_id,
  })
  if (juge.equipe && !juge.ok) {
    return NextResponse.json({ error: juge.error, message: juge.message }, { status: juge.error === 'invalid_params' ? 400 : 409 })
  }
  const equipe = juge.equipe && juge.ok ? { praticienne_id: juge.praticienneId, duree: juge.duree } : {}

  const { error: updErr } = await supabaseAdmin
    .from('rendez_vous')
    .update({
      ...equipe,
      date: newDate,
      statut: 'en_attente',
      nb_decalages: ((rdv as { nb_decalages?: number }).nb_decalages ?? 0) + 1,
      // La trace pour la pro : l'ancienne date est gardée par la base (21 oct. 2026).
      decale_par: 'cliente', decale_le: new Date().toISOString(),
      rappel_envoye_count: 0,
      rappel_envoye_at: null,
    })
    .eq('id', rdvId)
    .neq('statut', 'annule')
  if (updErr) return NextResponse.json({ error: 'update_failed' }, { status: 500 })

  // ── LA PRO EST PRÉVENUE PAR LE SERVEUR (29 oct. 2026) ──────────────────
  // Avant, la notification partait du navigateur de la cliente : une page
  // fermée trop vite et la pro ne savait rien. L'assistante concernée (avant
  // ou après) est prévenue aussi.
  await prevenirDuDeplacement(supabaseAdmin, {
    proId: rdv.pro_id as string,
    rdvId,
    praticiennes: [rdv.praticienne_id as string | null, juge.equipe && juge.ok ? juge.praticienneId : null],
    message: messageDecalage(
      ((rdv as { cliente?: { prenom?: string } }).cliente?.prenom ?? '').trim(),
      rdv.date as string,
      newDate,
    ),
    origine: 'api/rdv/decaler',
  })

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
      body: JSON.stringify({ rdv_id: rdvId, motif: 'decale' }),
    })
  } catch (e) {
    console.error('[api/rdv/decale] mail cliente non envoyé :', rdvId, e)
  }

  return NextResponse.json({ success: true })
}
