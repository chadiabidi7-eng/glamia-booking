// ─────────────────────────────────────────────────────────────────────────────
// LE TIROIR ANDROID DES NOTIFICATIONS (15 oct. 2026).
//
// Sans canal indiqué, Android range nos notifications dans « Divers » au lieu
// du tiroir « Rendez-vous » de l'app. On indique `channelId: 'default'`.
// Sans risque : l'iPhone l'ignore, et les apps Android 2.6 et 3.0 créent ce
// tiroir à chaque ouverture. Un message qui porte déjà un canal le garde.
// ─────────────────────────────────────────────────────────────────────────────

type Message = Record<string, unknown>

export function avecCanal<T extends Message | Message[]>(messages: T): T {
  const poser = (m: Message) => ('channelId' in m ? m : { ...m, channelId: 'default' })
  return (Array.isArray(messages) ? messages.map(poser) : poser(messages as Message)) as T
}
