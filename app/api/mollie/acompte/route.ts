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
    const { status, d } = await appelerMollieAcompte({
      action: 'payer', ...base,
      cle: b.cle, prestation: b.prestation,
      cliente: { prenom: cliente.prenom, nom: cliente.nom, mail: cliente.mail },
      politique_texte: b.politique_texte,
      // L'heure de l'acceptation est celle du serveur, pas celle du téléphone.
      politique_acceptee_le: new Date().toISOString(),
      retour: `/reserve/${slug}`,
      langue: b.langue,
      origine: 'booking',
    })
    if (status !== 200 || typeof d.url !== 'string' || typeof d.mollie !== 'string') {
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
    return NextResponse.json({ url: d.url, paiement: d.paiement })
  } catch (e) {
    console.error('[mollie/acompte]', e)
    return NextResponse.json({ error: 'mollie' }, { status: 502 })
  }
}
