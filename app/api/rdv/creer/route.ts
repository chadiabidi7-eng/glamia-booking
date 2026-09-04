import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { creneauReservable, minToTime, delaiEntreClientes } from '@/lib/creneaux'
import { prixReelDuPanier, remisesVerifiees } from '@/lib/prix-serveur'
import { gardeReservation } from '@/lib/garde-reservations'
import { adressePourEtape } from '@/lib/adresse-due'

// ─────────────────────────────────────────────────────────────────────────────
// Guichet serveur — créer une réservation.
//
// La page insérait directement, puis RELISAIT la ligne créée pour récupérer son
// identifiant (`.insert().select('id')`). C'est ce qui a cassé la production le
// 2 août : en retirant le droit de lecture sur `rendez_vous`, la relecture est
// tombée avec. Une écriture qui renvoie une donnée a besoin du droit de lire.
//
// Le serveur crée et renvoie l'identifiant : la page n'a plus rien à lire.
//
// Il vérifie AUSSI que le créneau est libre, dans le même appel. Avant, la
// vérification et l'insertion étaient deux gestes séparés : entre les deux,
// quelqu'un pouvait prendre la place. Et surtout, l'insertion étant ouverte en
// anonyme, une requête forgée sautait simplement la vérification.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { pro_id, cliente_id, date, heure, duree } = body as {
      pro_id?: string; cliente_id?: string; date?: string; heure?: string; duree?: number
    }

    if (!pro_id || !cliente_id || !date || !heure || typeof duree !== 'number' || duree <= 0) {
      return NextResponse.json({ error: 'parametres_invalides' }, { status: 400 })
    }

    // ── LA GARDE CONTRE LES RÉSERVATIONS EN MASSE ───────────────────────────
    // Posée avant toute écriture. La page est publique et sans limite d'appels :
    // rien n'empêchait de remplir la semaine d'une pro de faux rendez-vous, et
    // ses vraies clientes ne trouvaient plus une seule place.
    //
    // Les seuils sont larges — une cliente qui réserve pour elle, sa sœur et sa
    // mère passe sans s'en apercevoir. On ne vise pas l'usage inhabituel, on
    // vise l'automate.
    const garde = await gardeReservation(pro_id, (body as { telephone?: unknown }).telephone, req.headers)
    if (garde.ok === false) {
      console.warn('[rdv/creer] garde :', garde.raison, pro_id)
      return NextResponse.json({ ok: false, raison: garde.raison }, { status: 429 })
    }

    // ── LA CEINTURE DU BLOCAGE (4 septembre 2026) ─────────────────────────────
    // Le guichet d'identification refuse déjà les clientes bloquées à la
    // saisie du numéro — mais la page est publique et un appel direct le
    // contournerait. Le refus de créer est donc redit ici, où le rendez-vous
    // naît. Même message discret : jamais le mot « bloquée ».
    const { data: clienteBloc } = await supabaseAdmin
      .from('clientes')
      .select('bloquee_le')
      .eq('id', cliente_id)
      .eq('pro_id', pro_id)
      .maybeSingle()
    if (clienteBloc?.bloquee_le) {
      console.warn('[rdv/creer] cliente bloquée', pro_id, cliente_id)
      return NextResponse.json({ ok: false, raison: 'indisponible' }, { status: 403 })
    }

    const { data: pro } = await supabaseAdmin
      .from('profiles')
      .select('horaires, horaires_specifiques, creneaux_bloques, planning_variable, creneaux_a_la_suite, temps_preparation, temps_preparation_habituel, timezone, adresse, adresse_moment')
      .eq('id', pro_id)
      .maybeSingle()

    if (!pro) return NextResponse.json({ error: 'pro_introuvable' }, { status: 404 })

    const { data: rdvs } = await supabaseAdmin
      .from('rendez_vous')
      .select('date, duree')
      .eq('pro_id', pro_id)
      .gte('date', `${date}T00:00:00.000Z`)
      .lte('date', `${date}T23:59:59.999Z`)
      .neq('statut', 'annule')

    const rdvExistants = (rdvs ?? []).map(r => {
      const d = new Date(r.date as string)
      return { heure: minToTime(d.getUTCHours() * 60 + d.getUTCMinutes()), duree: (r.duree as number) ?? 0 }
    })

    const verdict = creneauReservable({
      date, heure, duree,
      horaires: (pro.horaires ?? {}) as never,
      rdvExistants,
      bloques: Array.isArray(pro.creneaux_bloques) ? pro.creneaux_bloques : [],
      horairesSpec: (pro.horaires_specifiques ?? {}) as never,
      planningVar: pro.planning_variable === true,
      aLaSuite: (pro as any).creneaux_a_la_suite === true,
      preparation: delaiEntreClientes(pro as any),
      // Le serveur tourne en temps universel : sans ça, le délai minimum se
      // calculerait avec deux heures de retard sur l'heure réelle de la pro.
      fuseau: pro.timezone ?? undefined,
    })

    if (!verdict.ok) {
      console.log('[rdv/creer] refus', verdict.raison, pro_id, date, heure)
      return NextResponse.json({ ...verdict, ok: false }, { status: 409 })
    }

    // ── LE PRIX EST RECALCULÉ, JAMAIS RECOPIÉ ───────────────────────────────
    // Il arrivait du navigateur et s'enregistrait tel quel. Réserver un
    // microblading à 250 en déclarant 20 suffisait à ne payer qu'un acompte de
    // 3 — et la fiche de la pro affichait 20, elle ne voyait rien avant le jour
    // même. Le catalogue de la pro fait foi.
    //
    // Panier introuvable ou prestation désactivée : on refuse. Ce que le
    // navigateur raconte ne correspond alors à rien de réel, et laisser passer
    // reviendrait à accepter n'importe quel prix.
    const reel = await prixReelDuPanier(pro_id, body.techniques, body.offre_id)
    if (Array.isArray(body.techniques) && body.techniques.length > 0 && !reel) {
      console.error('[rdv/creer] panier refusé', pro_id, JSON.stringify(body.techniques).slice(0, 300))
      return NextResponse.json({ ok: false, raison: 'prestation_inconnue' }, { status: 409 })
    }

    // Les remises demandées sont relues chez la pro : le navigateur peut en
    // vouloir une, il ne peut pas en fixer la valeur.
    const remises = reel
      ? await remisesVerifiees(pro_id, cliente_id, reel.prix, body.fidelite_appliquee, body.reduction_appliquee)
      : null

    const { data: cree, error } = await supabaseAdmin
      .from('rendez_vous')
      .insert({
        pro_id,
        cliente_id,
        date: `${date}T${heure}:00.000Z`,
        duree: reel?.duree ?? duree,
        specialite: body.specialite ?? null,
        technique: body.technique ?? null,
        techniques: reel?.techniques ?? body.techniques ?? [],
        prix: remises ? remises.prix : (typeof body.prix === 'number' && body.prix > 0 ? body.prix : null),
        statut: 'en_attente',
        notes: body.notes || null,
        demande_rappel: body.demande_rappel === true,
        fidelite_appliquee: remises ? remises.fidelite : (body.fidelite_appliquee ?? null),
        reponses_questions: Array.isArray(body.reponses_questions) && body.reponses_questions.length > 0
          ? body.reponses_questions
          : null,
        reduction_appliquee: remises ? remises.reduction : (body.reduction_appliquee ?? null),
        source: 'booking',
      })
      .select('id')
      .single()

    if (error) {
      console.error('[rdv/creer] insertion', error.message)
      return NextResponse.json({ error: 'creation' }, { status: 500 })
    }

    // L'ADRESSE EXACTE PART D'ICI, ET SEULEMENT SI ELLE EST DUE MAINTENANT.
    //
    // La page ne la reçoit plus au chargement (voir `/api/pro`). Le rendez-vous
    // vient d'être créé : pour une pro qui la donne « à la réservation », c'est
    // exactement le moment. Pour « la veille » et « je l'envoie moi-même », on
    // ne renvoie rien — l'écran de fin n'a alors aucune adresse à afficher.
    return NextResponse.json({
      ok: true,
      id: cree.id,
      adresse: adressePourEtape(pro.adresse as string | null, pro.adresse_moment as string | null, 'reservation'),
    })
  } catch (e) {
    console.error('[rdv/creer] erreur', e)
    return NextResponse.json({ error: 'erreur_interne' }, { status: 500 })
  }
}
