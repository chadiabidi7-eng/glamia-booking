import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { normaliserTelephone } from '@/lib/telephone'

// ─────────────────────────────────────────────────────────────────────────────
// Guichet serveur — mise à jour de la carte de fidélité lors d'une NOUVELLE
// réservation. Chantier RLS (18 juil. 2026) : remplace les écritures anonymes
// directes sur fidelite_clientes. Vérifie le téléphone de la cliente, puis
// applique la logique tampon (consommer récompense existante, ajouter un
// tampon, consommer un palier proactif, réinitialiser la carte pleine).
// Réplique fidèlement l'ancien bloc de handleConfirm.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)


type Palier = { position: number; type: string; valeur: number }
type Config = { active?: boolean; nb_ronds?: number; paliers?: Palier[] }

export async function POST(req: NextRequest) {
  let body: { rdv_id?: unknown; telephone?: unknown; recompense_existante?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }) }

  const rdvId = body.rdv_id
  const telephone = body.telephone
  const recompenseExistante = body.recompense_existante === true
  if (typeof rdvId !== 'string' || !/^[0-9a-f-]{36}$/i.test(rdvId)
    || typeof telephone !== 'string' || telephone.trim().length < 6) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
  }

  const { data: rdv } = await supabaseAdmin
    .from('rendez_vous')
    .select('id, pro_id, cliente_id, cliente:clientes(telephone)')
    .eq('id', rdvId)
    .maybeSingle()
  if (!rdv) return NextResponse.json({ error: 'rdv_introuvable' }, { status: 404 })

  // ── VÉRIFICATION DE PROPRIÉTÉ ──
  const telRdv = (rdv as { cliente?: { telephone?: string } }).cliente?.telephone
  if (!telRdv || normaliserTelephone(telRdv) !== normaliserTelephone(telephone)) {
    return NextResponse.json({ error: 'non_autorise' }, { status: 403 })
  }

  const cId = rdv.cliente_id as string | null
  const proId = rdv.pro_id as string
  if (!cId) return NextResponse.json({ success: true, skipped: 'sans_cliente' })

  const { data: profil } = await supabaseAdmin
    .from('profiles').select('fidelite_config').eq('id', proId).maybeSingle()
  const config = (profil?.fidelite_config ?? {}) as Config
  if (!config.active) return NextResponse.json({ success: true, skipped: 'inactif' })
  const nbRonds = config.nb_ronds ?? 10
  const paliers = config.paliers ?? []
  const now = () => new Date().toISOString()

  try {
    const { data: ficheFraiche } = await supabaseAdmin
      .from('fidelite_clientes').select('*').eq('pro_id', proId).eq('cliente_id', cId).maybeSingle()

    // Consommer la récompense existante si elle a été appliquée au prix
    if (ficheFraiche?.recompense_disponible && recompenseExistante) {
      const consumeUpdate: Record<string, unknown> = { recompense_disponible: null, updated_at: now() }
      if (ficheFraiche.tampons >= nbRonds) {
        consumeUpdate.tampons = 0
        consumeUpdate.cartes_completees = ficheFraiche.cartes_completees + 1
      }
      await supabaseAdmin.from('fidelite_clientes').update(consumeUpdate).eq('id', ficheFraiche.id)
    }

    // Re-lire après consommation éventuelle
    const { data: ficheApres } = await supabaseAdmin
      .from('fidelite_clientes').select('*').eq('pro_id', proId).eq('cliente_id', cId).maybeSingle()

    if (!ficheApres) {
      const palierUn = paliers.find(p => p.position === 1)
      const insertData: Record<string, unknown> = { pro_id: proId, cliente_id: cId, tampons: 1 }
      if (palierUn) insertData.recompense_disponible = { type: palierUn.type, valeur: palierUn.valeur }
      await supabaseAdmin.from('fidelite_clientes').insert(insertData)
      if (palierUn && !recompenseExistante) {
        const { data: ficheNew } = await supabaseAdmin
          .from('fidelite_clientes').select('id, tampons, cartes_completees')
          .eq('pro_id', proId).eq('cliente_id', cId).maybeSingle()
        if (ficheNew) {
          const consumeUpdate: Record<string, unknown> = { recompense_disponible: null, updated_at: now() }
          if (ficheNew.tampons >= nbRonds) {
            consumeUpdate.tampons = 0
            consumeUpdate.cartes_completees = ficheNew.cartes_completees + 1
          }
          await supabaseAdmin.from('fidelite_clientes').update(consumeUpdate).eq('id', ficheNew.id)
        }
      }
    } else {
      const nouveauTampons = ficheApres.tampons + 1
      const palierAtteint = [...paliers].sort((a, b) => b.position - a.position).find(p => p.position === nouveauTampons)
      const update: Record<string, unknown> = { tampons: nouveauTampons, updated_at: now() }
      if (palierAtteint) {
        update.recompense_disponible = { type: palierAtteint.type, valeur: palierAtteint.valeur }
      } else if (nouveauTampons >= nbRonds) {
        // Carte pleine SANS palier au dernier rond → nouvelle carte (cf. fix 18 juil.)
        update.tampons = nouveauTampons % nbRonds
        update.cartes_completees = ficheApres.cartes_completees + 1
      }
      await supabaseAdmin.from('fidelite_clientes').update(update).eq('id', ficheApres.id)

      if (palierAtteint && !recompenseExistante) {
        const consumeUpdate: Record<string, unknown> = { recompense_disponible: null, updated_at: now() }
        if (nouveauTampons >= nbRonds) {
          consumeUpdate.tampons = 0
          consumeUpdate.cartes_completees = ficheApres.cartes_completees + 1
        }
        await supabaseAdmin.from('fidelite_clientes').update(consumeUpdate).eq('id', ficheApres.id)
      }
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[rdv/fidelite]', e)
    return NextResponse.json({ error: 'fidelite_echec' }, { status: 500 })
  }
}
