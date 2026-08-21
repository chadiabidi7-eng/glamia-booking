import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

import { instantReel } from '@/lib/heure-pro'
import { prestationsLisibles } from '@/lib/nomsPrestations'

// ─────────────────────────────────────────────────────────────────────────────
// L'AVIS D'UNE CLIENTE, DÉPOSÉ DEPUIS SON LIEN DE RENDEZ-VOUS.
//
// TOUT EST VÉRIFIÉ ICI, ET NULLE PART AILLEURS. La page peut être rechargée,
// modifiée, appelée à la main : le navigateur ne décide de rien. Le serveur
// vérifie le jeton, que le rendez-vous a bien eu lieu, qu'il n'est pas annulé,
// que la fenêtre de trois jours n'est pas passée, et qu'aucun avis n'existe
// déjà. La contrainte d'unicité en base ferme la porte même en cas de double
// envoi simultané.
//
// LES PRESTATIONS SONT FIGÉES À L'ÉCRITURE. La pro peut renommer ses
// techniques demain ; l'avis d'hier doit rester lisible avec ce que la cliente
// avait réellement réservé.
//
// LE NOM EST RÉDUIT À « Prénom N. » — ici, pas dans le navigateur. Une cliente
// laisse un avis à sa praticienne, pas au monde entier, et son nom de famille
// n'a rien à faire sur une page publique.
//
// DEUX CLÉS OUVRENT CETTE PAGE, ET C'EST VOULU. `token_avis` est celle de
// chaque rendez-vous, posée à sa création. `token_confirmation` est celle du
// rappel : les mails déjà partis la portent, et ils doivent continuer de
// marcher. On essaie donc les deux.
//
// L'AVIS SE RECUEILLE MÊME QUAND LA PRO NE LES AFFICHE PAS. Le bouton de son
// app dit « Afficher sur ma page » : il commande la VITRINE, pas la collecte.
// Une pro qui l'éteint continue de recevoir les avis dans son app, et le jour
// où elle le rallume, tout apparaît d'un coup. Refuser l'avis à la cliente,
// c'était lui faire perdre son geste pour de bon.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** Trois jours après la fin du rendez-vous. Au-delà, on ne demande plus. */
const FENETRE_MS = 72 * 60 * 60 * 1000
const PHOTOS_MAX = 3
const TEXTE_MAX = 1000
const POIDS_MAX = 1_500_000

/** Une clé d'avis est un UUID ; celle du rappel en est un aussi, mais stockée
 *  en texte. On ne teste `token_avis` que sur une forme valide : comparer du
 *  n'importe-quoi à une colonne uuid fait échouer la requête entière. */
const FORME_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Le rendez-vous désigné par une clé — la sienne, ou celle de son rappel. */
async function rdvDuJeton(token: string, colonnes: string) {
  if (FORME_UUID.test(token)) {
    const { data } = await supabaseAdmin
      .from('rendez_vous').select(colonnes).eq('token_avis', token).maybeSingle()
    if (data) return data
  }
  const { data } = await supabaseAdmin
    .from('rendez_vous').select(colonnes).eq('token_confirmation', token).maybeSingle()
  return data
}

/** « Camille Dupont » devient « Camille D. ». */
function nomCourt(prenom?: string | null, nom?: string | null): string {
  const p = (prenom ?? '').trim()
  const n = (nom ?? '').trim()
  if (!p && !n) return 'Une cliente'
  if (!n) return p
  return `${p} ${n[0].toUpperCase()}.`
}

/** Les dates sont stockées en heure murale : on les lit en UTC. */
/**
 * LA FIN D'UN RENDEZ-VOUS, EN VRAI INSTANT.
 *
 * L'heure est enregistrée telle qu'elle s'affiche : « 13:00 » veut dire 13 h
 * CHEZ LA PRO. La lire comme un instant de Greenwich décalait tout de deux
 * heures en France l'été — et la cliente d'Ilana, le 17 août 2026, s'est vu
 * répondre « le rendez-vous n'est pas encore passé » pendant les deux heures
 * qui ont suivi son rendez-vous de 13 h.
 *
 * Aux Antilles, le décalage joue dans l'autre sens : la porte s'ouvrait quatre
 * heures AVANT la fin du rendez-vous, et se refermait quatre heures trop tôt.
 */
function finDuRdv(heureAffichee: string, dureeMin: number | null, fuseau?: string | null): number {
  return instantReel(heureAffichee, fuseau).getTime() + (dureeMin ?? 60) * 60 * 1000
}

type Etat =
  | { ouvert: true; pro: string; prestations: string; quand: string }
  | { ouvert: false; raison: 'inconnu' | 'annule' | 'trop_tot' | 'trop_tard' | 'deja' }

async function lireEtat(token: string): Promise<Etat> {
  const rdv = await rdvDuJeton(
    token,
    'id, date, duree, statut, technique, techniques, specialite, pro_id, cliente_id',
  ) as {
    id: string; date: string; duree: number | null; statut: string
    technique: unknown; techniques: unknown; specialite: unknown
    pro_id: string; cliente_id: string
  } | null

  if (!rdv) return { ouvert: false, raison: 'inconnu' }
  if (rdv.statut === 'annule') return { ouvert: false, raison: 'annule' }

  // Le fuseau de la pro se lit d'abord : sans lui, l'heure du rendez-vous ne
  // veut rien dire, et c'est elle qu'on s'apprête à comparer à maintenant.
  const { data: pro } = await supabaseAdmin
    .from('profiles').select('pseudo, prenom, timezone').eq('id', rdv.pro_id).maybeSingle()

  const fin = finDuRdv(rdv.date as string, rdv.duree as number | null, pro?.timezone as string | null)
  const maintenant = Date.now()
  if (maintenant < fin) return { ouvert: false, raison: 'trop_tot' }
  if (maintenant > fin + FENETRE_MS) return { ouvert: false, raison: 'trop_tard' }

  const { data: existant } = await supabaseAdmin
    .from('avis_clientes').select('id').eq('rdv_id', rdv.id).maybeSingle()
  if (existant) return { ouvert: false, raison: 'deja' }

  const prestations = prestationsLisibles(rdv.techniques, rdv.technique)

  return {
    ouvert: true,
    pro: (pro?.pseudo || pro?.prenom || 'ta praticienne') as string,
    prestations,
    quand: rdv.date as string,
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!token || token.length < 16) {
    return NextResponse.json({ ouvert: false, raison: 'inconnu' })
  }
  return NextResponse.json(await lireEtat(token))
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  let body: { note?: unknown; texte?: unknown; photos?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const note = Number(body.note)
  if (!Number.isInteger(note) || note < 1 || note > 5) {
    return NextResponse.json({ error: 'note_invalide' }, { status: 400 })
  }

  const texte = typeof body.texte === 'string' ? body.texte.trim().slice(0, TEXTE_MAX) : ''

  // Chaque photo arrive en deux exemplaires : la grande et sa vignette. Elles
  // vont par paire ou pas du tout — une vignette orpheline ferait une image
  // cassée sur la page de réservation.
  const photos = Array.isArray(body.photos) ? body.photos : []
  if (photos.length > PHOTOS_MAX) {
    return NextResponse.json({ error: 'trop_de_photos' }, { status: 400 })
  }
  for (const p of photos) {
    const paire = p as { pleine?: unknown; vignette?: unknown }
    if (typeof paire?.pleine !== 'string' || typeof paire?.vignette !== 'string') {
      return NextResponse.json({ error: 'photos_invalides' }, { status: 400 })
    }
    if (!paire.pleine.startsWith('data:image/jpeg;base64,')) {
      return NextResponse.json({ error: 'photos_invalides' }, { status: 400 })
    }
  }

  // On revérifie TOUT, juste avant d'écrire : entre l'affichage de la page et
  // l'envoi, la fenêtre a pu se fermer ou un avis a pu arriver.
  const etat = await lireEtat(token)
  if (!etat.ouvert) {
    return NextResponse.json({ error: etat.raison }, { status: 409 })
  }

  const rdv = await rdvDuJeton(token, 'id, pro_id, cliente_id') as
    { id: string; pro_id: string; cliente_id: string } | null
  if (!rdv) return NextResponse.json({ error: 'inconnu' }, { status: 404 })

  const { data: cliente } = await supabaseAdmin
    .from('clientes').select('prenom, nom').eq('id', rdv.cliente_id).maybeSingle()

  // ── LES PHOTOS ──
  const aDeposer: { chemin: string; buffer: Buffer }[] = []
  const adresses: string[] = []

  for (let i = 0; i < photos.length; i++) {
    const paire = photos[i] as { pleine: string; vignette: string }
    for (const [suffixe, dataUrl] of [
      ['pleine', paire.pleine], ['vignette', paire.vignette],
    ] as const) {
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
      const buffer = Buffer.from(base64, 'base64')
      if (buffer.byteLength > POIDS_MAX) {
        return NextResponse.json({ error: 'photo_trop_lourde' }, { status: 400 })
      }
      const chemin = `${rdv.pro_id}/${rdv.id}/${i + 1}-${suffixe}.jpg`
      aDeposer.push({ chemin, buffer })
      if (suffixe === 'pleine') {
        adresses.push(supabaseAdmin.storage.from('avis').getPublicUrl(chemin).data.publicUrl)
      }
    }
  }

  if (aDeposer.length > 0) {
    const resultats = await Promise.all(
      aDeposer.map(({ chemin, buffer }) =>
        supabaseAdmin.storage
          .from('avis')
          .upload(chemin, buffer, { contentType: 'image/jpeg', upsert: true })),
    )
    const rate = resultats.findIndex(r => r.error)
    if (rate >= 0) {
      console.error('[api/avis] upload :', aDeposer[rate].chemin, resultats[rate].error)
      return NextResponse.json({ error: 'upload_failed' }, { status: 500 })
    }
  }

  const { error: ecriture } = await supabaseAdmin.from('avis_clientes').insert({
    rdv_id: rdv.id,
    pro_id: rdv.pro_id,
    cliente_id: rdv.cliente_id,
    auteur: nomCourt(cliente?.prenom as string, cliente?.nom as string),
    note,
    texte: texte || null,
    photos: adresses,
    prestations: etat.prestations || null,
  })

  if (ecriture) {
    // 23505 = l'unicité sur le rendez-vous. Deux envois partis en même temps :
    // le second n'est pas une erreur, il arrive juste après.
    if ((ecriture as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'deja' }, { status: 409 })
    }
    console.error('[api/avis] écriture :', ecriture)
    return NextResponse.json({ error: 'ecriture_failed' }, { status: 500 })
  }

  // La pro l'apprend tout de suite. Un avis qu'elle découvre trois jours plus
  // tard, elle ne le partage plus et n'y répond plus : c'est le jour même
  // qu'il vaut quelque chose. L'échec de la notification n'annule rien —
  // l'avis est déjà écrit.
  try {
    const { data: profil } = await supabaseAdmin
      .from('profiles').select('push_token').eq('id', rdv.pro_id).maybeSingle()
    if (profil?.push_token) {
      const etoiles = '★'.repeat(note) + '☆'.repeat(5 - note)
      const auteur = nomCourt(cliente?.prenom as string, cliente?.nom as string)
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: profil.push_token,
          title: `Nouvel avis ${etoiles}`,
          body: etat.prestations
            ? `${auteur} t'a laissé un avis sur ${etat.prestations}.`
            : `${auteur} t'a laissé un avis.`,
          sound: 'default',
          data: { type: 'avis' },
        }),
      })
    }
  } catch (e) {
    console.error('[api/avis] notification :', e)
  }

  return NextResponse.json({ ok: true })
}
