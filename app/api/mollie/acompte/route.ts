// ─────────────────────────────────────────────────────────────────────────────
// L'ACOMPTE MOLLIE, DEMANDÉ PAR LA PAGE DE RÉSERVATION (3.3.0, 18 nov. 2026)
//
// POST { action: 'devis', pro_id, date, heure, telephone, techniques, offre_id,
//        fidelite_appliquee, reduction_appliquee }
//   → { actif: false } ou { actif: true, acompte, frais, total_cliente, devise, delai_annulation }
//
// POST { action: 'payer', …les mêmes, cle, prestation, cliente, politique_texte,
//        slug, langue, complet, photos }
//   → { url } : la page de paiement de Mollie. Juste avant, la réservation
//     complète est déposée (reservations_en_attente) sous le numéro du paiement :
//     c'est d'elle que le serveur créera le rendez-vous dès que Mollie confirme.
//
// Le navigateur choisit les prestations, il ne dit jamais ce qu'elles valent.
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'
import { appelerMollieAcompte, prixEtCliente, SECRET_MOLLIE, supabaseAdmin } from '@/lib/mollie-reservation'
import { enregistrerPreuve } from '@/lib/preuve-acceptation'

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!b) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  const proId = b.pro_id
  if (typeof proId !== 'string' || !/^[0-9a-f-]{36}$/i.test(proId)) return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
  // Pas encore branché sur ce site : la page continue comme avant.
  if (!SECRET_MOLLIE) return NextResponse.json({ actif: false })

  const pc = await prixEtCliente(proId, b)
  if (!pc || pc.prix < 100) return NextResponse.json({ actif: false })
  const base = { pro_id: proId, prix: pc.prix, nouvelle: pc.nouvelle, date: b.date, heure: b.heure }

  try {
    if (b.action === 'devis') {
      const { status, d } = await appelerMollieAcompte({ action: 'devis', ...base })
      if (status >= 500) return NextResponse.json({ error: 'mollie' }, { status: 502 })
      return NextResponse.json(d.actif ? d : { actif: false })
    }
    if (b.action !== 'payer') return NextResponse.json({ error: 'action' }, { status: 400 })

    const slug = String(b.slug ?? '')
    const cliente = (b.cliente ?? {}) as Record<string, unknown>
    // L'heure de l'acceptation est celle du serveur, pas celle du téléphone.
    const accepteeLe = new Date().toISOString()

    // ── LE CRÉNEAU EST TENU AVANT DE PARTIR CHEZ MOLLIE (Chadi, 21 nov. 2026) ──
    // « On n'accepte pas un paiement si le créneau n'est plus disponible. » Vérifier puis
    // tenir se fait en un seul geste en base (tenir_creneau, verrou par pro) : deux
    // clientes à la même seconde ne peuvent plus passer toutes les deux.
    const cle = typeof b.cle === 'string' && /^[0-9a-f-]{36}$/i.test(b.cle) ? b.cle : null
    const crea = ((b.complet as { creation?: Record<string, unknown> } | undefined)?.creation) ?? {}
    const dureeTenue = Math.round(Number(crea.duree))
    const praticienne = typeof crea.praticienne_id === 'string' && crea.praticienne_id ? crea.praticienne_id : null
    if (!cle || typeof b.date !== 'string' || typeof b.heure !== 'string' || !Number.isFinite(dureeTenue) || dureeTenue <= 0) {
      return NextResponse.json({ error: 'creneau' }, { status: 400 })
    }
    // Elle réessaie après être revenue de Mollie sans payer : sa tentative précédente
    // ne la bloque pas sur son propre créneau (seulement si ce paiement n'est pas payé).
    if (typeof b.remplace === 'string' && /^[0-9a-f-]{36}$/i.test(b.remplace) && b.remplace !== cle) {
      const { data: ancien } = await supabaseAdmin.from('mollie_paiements').select('mollie_paiement_id, statut')
        .eq('id', b.remplace).eq('pro_id', proId).maybeSingle()
      if (!ancien || ancien.statut === 'cree' || ancien.statut === 'echoue' || ancien.statut === 'expire' || ancien.statut === 'annule') {
        const ids = [`cle:${b.remplace}`, ...(ancien?.mollie_paiement_id ? [ancien.mollie_paiement_id as string] : [])]
        await supabaseAdmin.from('creneaux_tenus').delete().eq('pro_id', proId).in('intent_id', ids)
      }
    }
    const { data: tenu, error: errTenu } = await supabaseAdmin.rpc('tenir_creneau', {
      p_id: `cle:${cle}`, p_pro: proId, p_praticienne: praticienne,
      p_date: `${b.date}T${b.heure}:00.000Z`, p_duree: dureeTenue, p_minutes: 15,
    })
    if (errTenu) {
      console.error('[mollie/acompte] créneau non tenu', errTenu)
      return NextResponse.json({ error: 'mollie' }, { status: 503 })
    }
    if (tenu !== true) return NextResponse.json({ error: 'occupe' }, { status: 409 })

    const { status, d } = await appelerMollieAcompte({
      action: 'payer', ...base,
      cle: b.cle, prestation: b.prestation,
      cliente: { prenom: cliente.prenom, nom: cliente.nom, mail: cliente.mail },
      politique_texte: b.politique_texte,
      politique_acceptee_le: accepteeLe,
      retour: `/reserve/${slug}`,
      langue: b.langue,
      origine: 'booking',
    })
    if (status !== 200 || typeof d.url !== 'string' || typeof d.mollie !== 'string') {
      // Pas de paiement : le créneau est rendu tout de suite.
      await supabaseAdmin.from('creneaux_tenus').delete().eq('intent_id', `cle:${cle}`)
      console.error('[mollie/acompte] paiement refusé', status, d.error)
      return NextResponse.json({ error: String(d.error ?? 'mollie') }, { status: status >= 400 ? status : 502 })
    }

    // ── LA COPIE DE LA RÉSERVATION, SOUS LE NUMÉRO DU PAIEMENT ──────────────
    // Sans elle, aucun rendez-vous ne pourra être créé : on ne part pas chez Mollie.
    const complet = b.complet
    if (!complet || typeof complet !== 'object' || JSON.stringify(complet).length > 60_000) {
      return NextResponse.json({ error: 'copie' }, { status: 400 })
    }
    const photos = Array.isArray(b.photos) ? (b.photos as unknown[]).filter(p => typeof p === 'string').slice(0, 3) : []
    const { data: ligne } = await supabaseAdmin.from('reservations_en_attente').select('statut').eq('intent_id', d.mollie).maybeSingle()
    if (!ligne) {
      const { error } = await supabaseAdmin.from('reservations_en_attente').insert({
        intent_id: d.mollie, pro_id: proId,
        corps: { ...(complet as Record<string, unknown>), photos },
        source: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? null,
        statut: 'en_attente', maj_le: new Date().toISOString(),
      })
      if (error) {
        console.error('[mollie/acompte] copie non déposée', error)
        return NextResponse.json({ error: 'copie' }, { status: 500 })
      }
    }
    // ── LE CRÉNEAU TENU 15 MINUTES PENDANT QU'ELLE PAIE (Chadi, 19 nov. 2026) ──
    // Personne d'autre ne peut le prendre sur la page de réservation. Libéré dès
    // que le rendez-vous existe, que le paiement échoue, ou au bout de 15 minutes.
    // Le créneau tenu avant Mollie prend le numéro du paiement Mollie : c'est sous ce numéro
    // qu'il est libéré (rendez-vous créé, paiement échoué) et ignoré par la création du rendez-vous.
    const { data: renomme } = await supabaseAdmin.from('creneaux_tenus').update({ intent_id: d.mollie })
      .eq('intent_id', `cle:${cle}`).select('intent_id')
    if (!(renomme ?? []).length) console.error('[mollie/acompte] créneau tenu introuvable après Mollie', cle)
    // La preuve d'acceptation : ce qu'elle a vu, d'où, avec quel appareil (21 nov. 2026).
    await enregistrerPreuve(req, { paiementId: d.paiement, page: 'page_reservation', langue: b.langue, encadre: b.encadre, caseTexte: b.politique_texte, accepteeLe })
    return NextResponse.json({ url: d.url, paiement: d.paiement })
  } catch (e) {
    console.error('[mollie/acompte]', e)
    return NextResponse.json({ error: 'mollie' }, { status: 502 })
  }
}
