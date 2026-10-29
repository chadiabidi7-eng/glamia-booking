import type { SupabaseClient } from '@supabase/supabase-js'
import { traduireDans } from '@/lib/i18n'
import { etiquetteDe } from '@/lib/heures-dates'
import { avecCanal } from '@/lib/canal-android'

// ─────────────────────────────────────────────────────────────────────────────
// LA NOTIFICATION D'UN DÉPLACEMENT PART DU SERVEUR (29 oct. 2026).
//
// Quand une cliente décalait son rendez-vous ou changeait ses soins depuis la
// page de résa, la notification à la pro partait de SON navigateur, après
// l'enregistrement. Une page fermée trop vite, un réseau qui lâche : le
// rendez-vous avait bougé et la pro n'en savait rien. Elle part maintenant du
// serveur, juste après l'enregistrement réussi.
//
// Destinataires (même logique que /api/push-notify) : la pro, et l'assistante
// concernée — celle qui recevait la cliente avant, et celle qui la reçoit
// maintenant. Chacune lit le message dans SA langue.
//
// Un échec d'envoi ne remet jamais le déplacement en cause.
// ─────────────────────────────────────────────────────────────────────────────

/** « mercredi 4 novembre 2026 », dans la langue de qui lit. */
export function dateLongue(jour: string, langue: string | null | undefined, pays?: string | null): string {
  return new Date(`${jour}T00:00:00.000Z`).toLocaleDateString(etiquetteDe(langue, pays), {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

export async function prevenirDuDeplacement(admin: SupabaseClient, args: {
  proId: string
  rdvId: string
  /** Les assistantes concernées (avant / après). null = la pro elle-même. */
  praticiennes: (string | null | undefined)[]
  /** Fabrique le titre et le texte dans une langue donnée. */
  message: (langue: string | null, pays: string | null) => { title: string; body: string }
  origine: string
}): Promise<void> {
  try {
    const { data: pro } = await admin.from('profiles').select('push_token, langue, pays').eq('id', args.proId).maybeSingle()
    const envois: Record<string, unknown>[] = []
    const vus = new Set<string>()
    const ajouter = (jeton: unknown, langue: string | null, pays: string | null) => {
      if (typeof jeton !== 'string' || !jeton || vus.has(jeton)) return
      vus.add(jeton)
      const { title, body } = args.message(langue, pays)
      envois.push({ to: jeton, title, body, data: { type: 'rdv', lien: `/rdv/${args.rdvId}` } })
    }
    ajouter(pro?.push_token, (pro?.langue as string | null) ?? null, (pro?.pays as string | null) ?? null)

    const ids = [...new Set(args.praticiennes.filter((p): p is string => typeof p === 'string' && /^[0-9a-f-]{36}$/i.test(p)))]
    if (ids.length > 0) {
      const { data: elles } = await admin
        .from('profiles')
        .select('id, push_token, langue, pays')
        .in('id', ids)
        .eq('pilote_id', args.proId)
        .is('equipe_retire_le', null)
        .limit(5)
      for (const e of elles ?? []) ajouter(e.push_token, (e.langue as string | null) ?? (pro?.langue as string | null) ?? null, (e.pays as string | null) ?? null)
    }

    if (envois.length === 0) {
      console.warn(`[${args.origine}] notification : aucun jeton pour`, args.proId)
      return
    }
    const rep = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(avecCanal(envois.length === 1 ? envois[0] : envois)),
    })
    console.log(`[${args.origine}] notification envoyée :`, rep.status, envois.length, 'destinataire(s)', (await rep.text()).slice(0, 300))
  } catch (e) {
    console.error(`[${args.origine}] notification non envoyée :`, args.rdvId, e)
  }
}

/** Le texte « X a décalé son RDV du … au … ». */
export function messageDecalage(prenomCliente: string, ancienneIso: string, nouvelleIso: string) {
  return (langue: string | null, pays: string | null) => ({
    title: traduireDans(langue, 'notif.rdvDecaleTitre'),
    body: traduireDans(langue, 'notif.rdvDecale', {
      prenom: prenomCliente || traduireDans(langue, 'notif.uneCliente'),
      avant: dateLongue(ancienneIso.slice(0, 10), langue, pays), heureAvant: ancienneIso.slice(11, 16),
      apres: dateLongue(nouvelleIso.slice(0, 10), langue, pays), heure: nouvelleIso.slice(11, 16),
    }),
  })
}

/** Le texte « X a modifié ses prestations du … : … ». */
export function messageModification(prenomCliente: string, dateIso: string, prestations: string) {
  return (langue: string | null, pays: string | null) => ({
    title: traduireDans(langue, 'notif.rdvModifieTitre'),
    body: traduireDans(langue, 'notif.prestationsModifiees', {
      prenom: prenomCliente || traduireDans(langue, 'notif.uneCliente'),
      date: dateLongue(dateIso.slice(0, 10), langue, pays), heure: dateIso.slice(11, 16), prestations,
    }),
  })
}
