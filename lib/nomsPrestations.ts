// ─────────────────────────────────────────────────────────────────────────────
// LES NOMS DES PRESTATIONS D'UN RENDEZ-VOUS, EN UNE LIGNE.
//
// POURQUOI CE FICHIER EXISTE. La liste des prestations d'un rendez-vous a
// changé de forme en cours de route : elle contenait des noms — « Pose gel » —
// et elle contient aujourd'hui la prestation entière, avec son prix, sa durée,
// sa quantité et sa catégorie. Le code qui la collait bout à bout attendait du
// texte : il a écrit « [object Object] · [object Object] » dans des avis
// publiés, sur la page de réservation de quatre professionnelles.
//
// On ne fait donc plus de supposition sur la forme. On demande le nom, quelle
// que soit la façon dont il est rangé, et on ignore ce qui n'en a pas. Les
// anciens rendez-vous restent lisibles, les nouveaux aussi, et le jour où la
// forme rechangera, rien ne se cassera en silence.
// ─────────────────────────────────────────────────────────────────────────────

/** Le nom d'une prestation, qu'elle soit rangée comme du texte ou en entier. */
export function nomPrestation(p: unknown): string {
  if (typeof p === 'string') return p.trim()
  if (p && typeof p === 'object') {
    const nom = (p as { nom?: unknown }).nom
    if (typeof nom === 'string') return nom.trim()
  }
  return ''
}

/**
 * Les prestations d'un rendez-vous, prêtes à être lues : « Pose gel · Nail art ».
 *
 * `techniques` est la liste ; `technique` est le nom seul des rendez-vous plus
 * anciens, qui n'en avaient qu'une. On prend la liste dès qu'elle dit quelque
 * chose, et on retombe sur le nom seul sinon.
 */
export function prestationsLisibles(
  techniques: unknown,
  technique: unknown,
): string {
  const liste = Array.isArray(techniques) ? techniques.map(nomPrestation).filter(Boolean) : []
  if (liste.length > 0) return liste.join(' · ')
  return nomPrestation(technique)
}
