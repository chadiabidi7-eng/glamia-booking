import { createClient } from '@supabase/supabase-js'
import { libelleCategorie } from '@/lib/categorie-autre'
import { NextRequest, NextResponse } from 'next/server'
import { generateSlots, creneauReservable, isDayWorking, isDayBlocked, type Slot } from '@/lib/creneaux'

const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

function formatDateFr(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// GET /api/confirmation/[token] — Charger les infos du RDV
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  const { data, error } = await supabaseAdmin
    .from('rendez_vous')
    .select('id, date, technique, specialite, prix, statut, token_expiration, cliente_id, pro_id, duree, instructions, inspirations')
    .eq('token_confirmation', token)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  if (data.token_expiration && new Date(data.token_expiration) < new Date()) {
    return NextResponse.json({ error: 'expired' }, { status: 410 })
  }

  // Récupérer la cliente
  const { data: cliente } = await supabaseAdmin
    .from('clientes')
    .select('prenom')
    .eq('id', data.cliente_id)
    .maybeSingle()

  // Récupérer le profil pro
  const { data: pro } = await supabaseAdmin
    .from('profiles')
    .select('prenom, nom, pseudo, avatar_url, push_token, adresse, horaires, devise, horaires_specifiques, creneaux_bloques, planning_variable, timezone')
    .eq('id', data.pro_id)
    .maybeSingle()

  const dateStr = (data.date as string).slice(0, 10)
  const heureStr = (data.date as string).slice(11, 16)

  // Créneaux existants pour une date spécifique (pour le décalage)
  // LA GRILLE DU DÉCALAGE SE CALCULE ICI, plus dans le navigateur.
  //
  // La page en gardait sa propre version, qui ne connaissait que les horaires
  // de la semaine et les autres rendez-vous. Elle ignorait donc les créneaux
  // bloqués, les journées fermées, le planning variable et les évènements du
  // calendrier iPhone : une cliente pouvait se décaler en plein congé.
  const slotsDate = req.nextUrl.searchParams.get('slots_date')
  let slots: Slot[] = []
  if (slotsDate) {
    const { data: rdvs } = await supabaseAdmin
      .from('rendez_vous')
      .select('date, duree')
      .eq('pro_id', data.pro_id)
      .gte('date', `${slotsDate}T00:00:00.000Z`)
      .lte('date', `${slotsDate}T23:59:59.999Z`)
      .neq('statut', 'annule')
      // Sans ça, SON PROPRE rendez-vous occuperait la place : elle ne pourrait
      // plus reprendre son heure, ni celle d'à côté.
      .neq('id', data.id)

    const rdvsJour = (rdvs ?? []).map(r => {
      const d = new Date(r.date)
      return {
        heure: `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`,
        duree: r.duree,
      }
    })

    slots = generateSlots(
      slotsDate,
      data.duree ?? 60,
      ((pro as any)?.horaires ?? {}) as never,
      rdvsJour,
      Array.isArray((pro as any)?.creneaux_bloques) ? (pro as any).creneaux_bloques : [],
      ((pro as any)?.horaires_specifiques ?? {}) as never,
      (pro as any)?.planning_variable === true,
      (pro as any)?.timezone ?? undefined,
    )
  }

  return NextResponse.json({
    id: data.id,
    date: dateStr,
    heure: heureStr,
    prestation: data.technique ?? '',
    categorie: data.specialite ?? null,
    prix: data.prix,
    statut: data.statut,
    token_expiration: data.token_expiration,
    cliente_prenom: cliente?.prenom ?? '',
    pro_prenom: pro?.prenom ?? '',
    pro_nom: pro?.nom ?? '',
    pro_pseudo: pro?.pseudo ?? null,
    pro_photo: pro?.avatar_url ?? null,
    pro_adresse: pro?.adresse ?? null,
    pro_devise: (pro as any)?.devise ?? 'EUR',
    pro_id: data.pro_id,
    horaires: (pro as any)?.horaires ?? null,
    duree: data.duree ?? 60,
    instructions: data.instructions ?? null,
    inspirations: (data.inspirations as string[] | null) ?? [],
    slots,
    // Ce qu'il faut au petit calendrier pour griser les bonnes journées.
    horaires_specifiques: (pro as any)?.horaires_specifiques ?? null,
    creneaux_bloques: Array.isArray((pro as any)?.creneaux_bloques) ? (pro as any).creneaux_bloques : [],
    planning_variable: (pro as any)?.planning_variable === true,
  })
}

// POST /api/confirmation/[token] — Confirmer ou annuler le RDV
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const body = await req.json()
  const action = body.action as string

  if (action !== 'confirmer' && action !== 'annuler' && action !== 'decaler') {
    return NextResponse.json({ error: 'invalid_action' }, { status: 400 })
  }

  // Vérifier que le RDV existe et que le token est valide
  const { data: rdv, error: fetchErr } = await supabaseAdmin
    .from('rendez_vous')
    .select('id, date, duree, statut, token_expiration, cliente_id, pro_id')
    .eq('token_confirmation', token)
    .maybeSingle()

  if (fetchErr || !rdv) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  if (rdv.token_expiration && new Date(rdv.token_expiration) < new Date()) {
    return NextResponse.json({ error: 'expired' }, { status: 410 })
  }

  // ── Action : décaler ──────────────────────────────────────────────────
  if (action === 'decaler') {
    const newDate = body.new_date as string
    if (!newDate) {
      return NextResponse.json({ error: 'new_date_required' }, { status: 400 })
    }

    const oldDateStr = (rdv.date as string).slice(0, 10)
    const oldHeureStr = (rdv.date as string).slice(11, 16)

    // ── LE VERROU ────────────────────────────────────────────────────────
    //
    // Jusqu'ici, décaler écrivait la nouvelle date TELLE QUELLE. Aucun
    // contrôle : ni les horaires, ni les journées fermées, ni les créneaux
    // bloqués, ni le délai minimum. La grille affichée les cachait bien, mais
    // une grille est une PROPOSITION — elle vieillit dès qu'elle est dessinée.
    // Une page laissée ouverte une heure, deux clientes qui s'y prennent en
    // même temps, et plus rien ne disait non.
    //
    // C'est le même verrou que pour une réservation neuve, et il lit l'état
    // RÉEL du profil au moment où elle valide.
    const nouvelleDate = (newDate as string).slice(0, 10)
    const nouvelleHeure = (newDate as string).slice(11, 16)

    const { data: proRegles } = await supabaseAdmin
      .from('profiles')
      .select('horaires, horaires_specifiques, creneaux_bloques, planning_variable, timezone')
      .eq('id', rdv.pro_id)
      .maybeSingle()

    if (proRegles) {
      const { data: autresRdvs } = await supabaseAdmin
        .from('rendez_vous')
        .select('date, duree')
        .eq('pro_id', rdv.pro_id)
        .gte('date', `${nouvelleDate}T00:00:00.000Z`)
        .lte('date', `${nouvelleDate}T23:59:59.999Z`)
        .neq('statut', 'annule')
        .neq('id', rdv.id)

      const verdict = creneauReservable({
        date: nouvelleDate,
        heure: nouvelleHeure,
        duree: (rdv.duree as number) ?? 60,
        horaires: ((proRegles as any).horaires ?? {}) as never,
        rdvExistants: (autresRdvs ?? []).map(r => {
          const d = new Date(r.date)
          return {
            heure: `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`,
            duree: r.duree,
          }
        }),
        bloques: Array.isArray((proRegles as any).creneaux_bloques) ? (proRegles as any).creneaux_bloques : [],
        horairesSpec: ((proRegles as any).horaires_specifiques ?? {}) as never,
        planningVar: (proRegles as any).planning_variable === true,
        fuseau: (proRegles as any).timezone ?? undefined,
      })

      if (!verdict.ok) {
        return NextResponse.json(
          { error: 'creneau_indisponible', raison: verdict.raison, message: verdict.message },
          { status: 409 },
        )
      }
    }

    const { error: updateErr } = await supabaseAdmin
      .from('rendez_vous')
      .update({
        date: newDate,
        statut: 'en_attente',
        rappel_envoye_count: 0,
        rappel_envoye_at: null,
        token_confirmation: null,
        token_expiration: null,
      })
      .eq('id', rdv.id)

    if (updateErr) {
      console.error('[api/confirmation] Erreur decaler:', updateErr)
      return NextResponse.json({ error: 'update_failed' }, { status: 500 })
    }

    try {
      const { data: proData } = await supabaseAdmin
        .from('profiles')
        .select('push_token')
        .eq('id', rdv.pro_id)
        .maybeSingle()

      const { data: cliente } = await supabaseAdmin
        .from('clientes')
        .select('prenom, email')
        .eq('id', rdv.cliente_id)
        .maybeSingle()

      const clientePrenom = cliente?.prenom ?? 'Une cliente'
      const newDateStr = newDate.slice(0, 10)
      const newHeureStr = newDate.slice(11, 16)

      // Push notification à la pro
      if (proData?.push_token) {
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: proData.push_token,
            title: '📅 RDV décalé',
            body: `${clientePrenom} a décalé son RDV du ${formatDateFr(oldDateStr)} au ${formatDateFr(newDateStr)} à ${newHeureStr}`,
          }),
        })
      }

      // Email de confirmation à la cliente
      if (cliente?.email) {
        const { data: proInfo } = await supabaseAdmin
          .from('profiles')
          .select('prenom, nom, pseudo, adresse, devise, categorie_autre_nom')
          .eq('id', rdv.pro_id)
          .maybeSingle()

        const proNom = proInfo?.pseudo || `${proInfo?.prenom ?? ''} ${proInfo?.nom ?? ''}`.trim()

        const { data: rdvFull } = await supabaseAdmin
          .from('rendez_vous')
          .select('technique, specialite, duree, prix')
          .eq('id', rdv.id)
          .maybeSingle()

        await fetch(
          'https://gdgfgbxoapgmrbttdyac.supabase.co/functions/v1/confirmation-booking',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              cliente_email: cliente.email,
              cliente_prenom: clientePrenom,
              pro_nom: proNom,
              date: formatDateFr(newDateStr),
              heure: newHeureStr,
              duree: rdvFull?.duree ? `${rdvFull.duree} min` : '',
              prix_total: rdvFull?.prix ?? 0,
              devise: (proInfo as any)?.devise ?? 'EUR',
              adresse: proInfo?.adresse || '',
              techniques: rdvFull ? [{
                nom: rdvFull.technique ?? '',
                // Le nom que la pro a donné à sa catégorie. Sans ça, sa
                // cliente lit « Autre » dans le mail de son rendez-vous décalé.
                specialite: libelleCategorie(rdvFull.specialite ?? '', (proInfo as { categorie_autre_nom?: string | null } | null)?.categorie_autre_nom),
                prix: rdvFull.prix ?? 0,
                duree_minutes: rdvFull.duree ?? 60,
              }] : [],
            }),
          },
        )
        console.log('[api/confirmation] Email confirmation décalage envoyé à', cliente.email)
      }
    } catch (e) {
      console.error('[api/confirmation] Erreur push/email decaler:', e)
    }

    return NextResponse.json({ success: true, statut: 'en_attente' })
  }

  // ── Action : confirmer / annuler ──────────────────────────────────────
  const newStatut = action === 'confirmer' ? 'confirme' : 'annule'
  const updateData: Record<string, string | boolean> = { statut: newStatut }
  if (action === 'confirmer') {
    updateData.rappel_confirme_at = new Date().toISOString()
  }
  if (action === 'annuler') {
    // Annulation par la cliente → notification in-app pour la pro
    updateData.notif_annulation_vue = false
  }

  const { error: updateErr } = await supabaseAdmin
    .from('rendez_vous')
    .update(updateData)
    .eq('id', rdv.id)

  if (updateErr) {
    console.error('[api/confirmation] Erreur update:', updateErr)
    return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  }

  // ── Envoi push notification à la pro ────────────────────────────────────
  try {
    const { data: pro } = await supabaseAdmin
      .from('profiles')
      .select('push_token')
      .eq('id', rdv.pro_id)
      .maybeSingle()

    const pushToken = pro?.push_token
    if (!pushToken) {
      console.warn('[api/confirmation] Push token absent pour pro_id:', rdv.pro_id)
    } else {
      const { data: cliente } = await supabaseAdmin
        .from('clientes')
        .select('prenom')
        .eq('id', rdv.cliente_id)
        .maybeSingle()

      const clientePrenom = cliente?.prenom ?? 'une cliente'
      const dateStr = (rdv.date as string).slice(0, 10)
      const heureStr = (rdv.date as string).slice(11, 16)
      const dateFr = formatDateFr(dateStr)

      const title = action === 'confirmer' ? '✅ RDV confirmé' : '❌ RDV annulé'
      const body = action === 'confirmer'
        ? `${clientePrenom} a confirmé son RDV du ${dateFr} à ${heureStr}`
        : `${clientePrenom} a annulé son RDV du ${dateFr} à ${heureStr}`

      const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: pushToken, title, body }),
      })

      const pushBody = await pushRes.text()
      console.log('[api/confirmation] Push envoyé:', pushRes.status, pushBody)
    }
  } catch (e) {
    console.error('[api/confirmation] Erreur push (non bloquante):', e)
  }

  return NextResponse.json({ success: true, statut: newStatut })
}
