import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import { creneauReservable, delaiDe, delaiEntreClientes, minToTime } from '@/lib/creneaux'
import { etiquetteDe } from '@/lib/heures-dates'
import { traduireDans } from '@/lib/i18n'
import { avecCanal } from '@/lib/canal-android'

// ─────────────────────────────────────────────────────────────────────────────
// AVANCER SON RENDEZ-VOUS SUR UNE PLACE LIBÉRÉE (désistement, 11 oct. 2026).
//
// Le mail « Une place plus tôt s'est libérée » arrive ici. Comme pour la
// désinscription, ouvrir la page ne fait RIEN : les messageries ouvrent les
// liens toutes seules. La page montre les deux dates et un bouton ; c'est lui
// qui déplace le rendez-vous. Avant de déplacer, on revérifie que la place est
// encore libre (horaires, blocages, autres rendez-vous, délai) — la place part
// à la première. Ensuite : mail de confirmation à la cliente, notification à la
// pro, et l'envoi est marqué « pris ». Une seule fois par envoi.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const estId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)

const TEXTES = {
  fr: {
    titre: 'Avancer votre rendez-vous',
    actuel: (pro: string, q: string) => `Votre rendez-vous chez ${pro} est prévu le <strong>${q}</strong>.`,
    nouveau: (q: string) => `Une place plus tôt s'est libérée : <strong>${q}</strong>.`,
    question: 'Voulez-vous l’avancer à cette date ?', bouton: 'J’avance mon rendez-vous', garder: 'Je garde ma date',
    fait: (q: string) => `C'est fait : votre rendez-vous est avancé au <strong>${q}</strong>. Vous recevez un mail de confirmation.`,
    deja: 'Ce rendez-vous a déjà été avancé.', prise: 'Cette place vient d’être prise. Votre rendez-vous n’a pas bougé.',
    annule: 'Ce rendez-vous a été annulé.', inconnu: 'Ce lien ne fonctionne plus.',
  },
  en: {
    titre: 'Move your appointment earlier',
    actuel: (pro: string, q: string) => `Your appointment with ${pro} is on <strong>${q}</strong>.`,
    nouveau: (q: string) => `An earlier slot has opened up: <strong>${q}</strong>.`,
    question: 'Move it to this date?', bouton: 'Move my appointment', garder: 'Keep my date',
    fait: (q: string) => `Done: your appointment is now on <strong>${q}</strong>. A confirmation email is on its way.`,
    deja: 'This appointment has already been moved.', prise: 'This slot has just been taken. Your appointment hasn’t changed.',
    annule: 'This appointment was cancelled.', inconnu: 'This link no longer works.',
  },
  es: {
    titre: 'Adelantar tu cita',
    actuel: (pro: string, q: string) => `Tu cita con ${pro} es el <strong>${q}</strong>.`,
    nouveau: (q: string) => `Se ha liberado un hueco antes: <strong>${q}</strong>.`,
    question: '¿Quieres adelantarla a esta fecha?', bouton: 'Adelanto mi cita', garder: 'Mantengo mi fecha',
    fait: (q: string) => `Hecho: tu cita queda el <strong>${q}</strong>. Recibirás un email de confirmación.`,
    deja: 'Esta cita ya se ha adelantado.', prise: 'Este hueco acaba de ocuparse. Tu cita no ha cambiado.',
    annule: 'Esta cita se ha cancelado.', inconnu: 'Este enlace ya no funciona.',
  },
} as const
type Langue = keyof typeof TEXTES

const echapper = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function page(langue: Langue, contenu: string, statut = 200) {
  return new Response(`<!DOCTYPE html><html lang="${langue}"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><meta name="robots" content="noindex" /><title>Glamia</title></head>
<body style="margin:0;background:#FAF7F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:440px;margin:60px 16px;margin-left:auto;margin-right:auto;padding:28px 24px;background:#fff;border-radius:16px;box-shadow:0 2px 12px rgba(0,0,0,0.06);text-align:center;color:#1f2937;">${contenu}</div>
</body></html>`, { status: statut, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

/** « jeudi 15 octobre à 14:00 » — heure murale posée sur UTC, comme partout. */
function quand(iso: string, langue: Langue, pays: string | null): string {
  const d = new Date(iso)
  const jour = d.toLocaleDateString(etiquetteDe(langue, pays), { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
  const heure = d.toLocaleTimeString(etiquetteDe(langue, pays), { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
  return `${jour} ${langue === 'fr' ? 'à' : langue === 'es' ? 'a las' : 'at'} ${heure}`
}

async function lire(url: URL) {
  const e = url.searchParams.get('e')
  if (!estId(e)) return null
  const { data: envoi } = await supabaseAdmin.from('desistement_envois').select('id, cliente_id, pro_id, rdv_id, place_id, genre, pris_le').eq('id', e).maybeSingle()
  if (!envoi || envoi.genre !== 'avancer' || !envoi.rdv_id) return null
  const { data: pro } = await supabaseAdmin.from('profiles')
    .select('pseudo, prenom, langue, pays, timezone, push_token, horaires, horaires_specifiques, jours_differents, creneaux_bloques, planning_variable, creneaux_a_la_suite, temps_preparation, temps_preparation_habituel, delai_resa_min, resa_jour_meme')
    .eq('id', envoi.pro_id).maybeSingle()
  const { data: place } = await supabaseAdmin.from('desistement_places').select('jour, debut_min').eq('id', envoi.place_id).maybeSingle()
  const { data: rdv } = await supabaseAdmin.from('rendez_vous').select('id, date, duree, statut, nb_decalages, cliente_id').eq('id', envoi.rdv_id).maybeSingle()
  if (!pro || !place || !rdv) return null
  const langue: Langue = pro.langue === 'en' || pro.langue === 'es' ? pro.langue : 'fr'
  const nouvelle = `${place.jour}T${minToTime(place.debut_min)}:00.000Z`
  return { envoi, pro, place, rdv, langue, pays: (pro.pays as string | null) ?? null, nomPro: echapper((pro.pseudo || pro.prenom || 'Glamia') as string), nouvelle, requete: url.search }
}

/** La place est-elle encore libre pour SON rendez-vous (sa durée, hors lui-même) ? */
async function encoreLibre(lu: NonNullable<Awaited<ReturnType<typeof lire>>>): Promise<boolean> {
  const { data: rdvs } = await supabaseAdmin.from('rendez_vous').select('id, date, duree')
    .eq('pro_id', lu.envoi.pro_id).neq('statut', 'annule')
    .gte('date', `${lu.place.jour}T00:00:00.000Z`).lte('date', `${lu.place.jour}T23:59:59.999Z`)
  const pro = lu.pro as Record<string, unknown>
  const verdict = creneauReservable({
    date: lu.place.jour, heure: minToTime(lu.place.debut_min), duree: (lu.rdv.duree as number) ?? 60,
    joursDifferents: ((pro as { jours_differents?: unknown }).jours_differents ?? {}) as never,
    horaires: (pro.horaires ?? {}) as never,
    rdvExistants: (rdvs ?? []).filter(r => r.id !== lu.rdv.id).map(r => { const d = new Date(r.date as string); return { heure: minToTime(d.getUTCHours() * 60 + d.getUTCMinutes()), duree: (r.duree as number) ?? 0 } }),
    bloques: Array.isArray(pro.creneaux_bloques) ? (pro.creneaux_bloques as never) : [],
    horairesSpec: (pro.horaires_specifiques ?? {}) as never,
    planningVar: pro.planning_variable === true,
    aLaSuite: pro.creneaux_a_la_suite === true,
    preparation: delaiEntreClientes(pro as never),
    delai: delaiDe(pro as never),
    fuseau: (pro.timezone as string | undefined) ?? undefined,
  })
  return verdict.ok
}

export async function GET(req: NextRequest) {
  const lu = await lire(new URL(req.url))
  if (!lu) return page('fr', `<p>${TEXTES.fr.inconnu}</p>`, 404)
  const L = TEXTES[lu.langue]
  if (lu.envoi.pris_le) return page(lu.langue, `<p style="font-size:16px;line-height:1.6;margin:0;">${L.deja}</p>`)
  if (lu.rdv.statut === 'annule') return page(lu.langue, `<p style="font-size:16px;line-height:1.6;margin:0;">${L.annule}</p>`)
  if (!(await encoreLibre(lu))) return page(lu.langue, `<p style="font-size:16px;line-height:1.6;margin:0;">${L.prise}</p>`)
  return page(lu.langue, `
    <p style="font-size:20px;font-weight:700;margin:0 0 18px;">${L.titre}</p>
    <p style="font-size:16px;line-height:1.6;margin:0 0 8px;">${L.actuel(lu.nomPro, quand(lu.rdv.date as string, lu.langue, lu.pays))}</p>
    <p style="font-size:16px;line-height:1.6;margin:0 0 18px;">${L.nouveau(quand(lu.nouvelle, lu.langue, lu.pays))}</p>
    <p style="font-size:15px;color:#6b7280;margin:0 0 18px;">${L.question}</p>
    <form method="POST" action="/avancer${echapper(lu.requete)}">
      <button type="submit" style="border:0;background:#C2779E;color:#fff;font-size:15px;font-weight:700;padding:13px 26px;border-radius:12px;cursor:pointer;">${L.bouton}</button>
    </form>
    <p style="font-size:13px;color:#9ca3af;margin:16px 0 0;">${L.garder}</p>`)
}

export async function POST(req: NextRequest) {
  const lu = await lire(new URL(req.url))
  if (!lu) return page('fr', `<p>${TEXTES.fr.inconnu}</p>`, 404)
  const L = TEXTES[lu.langue]
  if (lu.envoi.pris_le) return page(lu.langue, `<p style="font-size:16px;line-height:1.6;margin:0;">${L.deja}</p>`)
  if (lu.rdv.statut === 'annule') return page(lu.langue, `<p style="font-size:16px;line-height:1.6;margin:0;">${L.annule}</p>`)
  if (!(await encoreLibre(lu))) return page(lu.langue, `<p style="font-size:16px;line-height:1.6;margin:0;">${L.prise}</p>`)

  const ancienne = lu.rdv.date as string
  // Même geste que « Décaler mon RDV » depuis la page de confirmation : la pro
  // revalide (en_attente), le compteur de décalages avance, les rappels repartent de zéro.
  const { error } = await supabaseAdmin.from('rendez_vous').update({
    date: lu.nouvelle, statut: 'en_attente', nb_decalages: ((lu.rdv.nb_decalages as number) ?? 0) + 1,
    rappel_envoye_count: 0, rappel_envoye_at: null, notif_vue: false,
    decale_par: 'cliente', decale_le: new Date().toISOString(),
  }).eq('id', lu.rdv.id).neq('statut', 'annule')
  if (error) return page(lu.langue, `<p style="font-size:16px;line-height:1.6;margin:0;">${L.prise}</p>`, 500)
  await supabaseAdmin.from('desistement_envois').update({ pris_le: new Date().toISOString() }).eq('id', lu.envoi.id)

  // La pro est prévenue, et la cliente reçoit sa confirmation. Ni l'un ni l'autre ne remet le déplacement en cause.
  try {
    const { data: cliente } = await supabaseAdmin.from('clientes').select('prenom').eq('id', lu.rdv.cliente_id).maybeSingle()
    const prenom = (cliente?.prenom as string | null) ?? ''
    if (lu.pro.push_token) {
      const fmt = (iso: string) => new Date(iso).toLocaleDateString(etiquetteDe(lu.langue), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(avecCanal({
          to: lu.pro.push_token,
          title: traduireDans(lu.langue, 'notif.rdvDecaleTitre'),
          body: traduireDans(lu.langue, 'notif.rdvDecale', { prenom, avant: fmt(ancienne), heureAvant: ancienne.slice(11, 16), apres: fmt(lu.nouvelle), heure: minToTime(lu.place.debut_min) }),
          data: { type: 'rdv', lien: `/rdv/${lu.rdv.id}` },
        })),
      })
    }
    await fetch('https://gdgfgbxoapgmrbttdyac.supabase.co/functions/v1/rdv-cliente-mail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ rdv_id: lu.rdv.id, motif: 'decale' }),
    })
  } catch (e) {
    console.error('[avancer] notification ou mail non envoyé :', lu.rdv.id, e)
  }
  return page(lu.langue, `<p style="font-size:16px;line-height:1.6;margin:0;">${L.fait(quand(lu.nouvelle, lu.langue, lu.pays))}</p>`)
}
