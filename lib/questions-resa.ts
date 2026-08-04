// ─────────────────────────────────────────────────────────────────────────────
// LES QUESTIONS QUE LA PRO POSE À SA CLIENTE PENDANT LA RÉSERVATION.
//
// Les clientes oublient la dépose — l'étape qui retire les ongles posés avant
// d'en mettre de nouveaux. La pro se retrouve avec un rendez-vous trop court et
// une prestation qu'elle ne facturera pas.
//
// Les mêmes règles que dans l'app, volontairement recopiées ici plutôt
// qu'importées : les deux mondes ne partagent pas de code, et une règle
// divergente se verrait tout de suite — la question s'affiche, ou elle ne
// s'affiche pas.
// ─────────────────────────────────────────────────────────────────────────────

export type EffetReponse = 'rien' | 'prestation' | 'message'

export type ReponseQuestion = {
  id: string
  texte: string
  effet: EffetReponse
  prestation?: { nom: string; prix: number; duree: number; categorie?: string }
  message?: string
}

export type QuestionResa = {
  id: string
  texte: string
  actif: boolean
  categories: string[]
  prestations: string[]
  reponses: ReponseQuestion[]
}

export function questionsDepuisProfil(brut: unknown): QuestionResa[] {
  if (!Array.isArray(brut)) return []
  return brut.filter(q => q && typeof q === 'object' && Array.isArray((q as QuestionResa).reponses)) as QuestionResa[]
}

/**
 * Les questions à poser pour un panier donné.
 *
 * DEUX RÈGLES, ET LA SECONDE EST CELLE QU'ON OUBLIE.
 *
 * Le déclencheur d'abord : la question ne sort que si le panier touche sa
 * catégorie, ou l'une des prestations qu'elle désigne.
 *
 * ENSUITE — ON NE POSE PAS LA QUESTION SI LA RÉPONSE EST DÉJÀ DANS LE PANIER.
 * Une cliente qui a coché Pose capsule ET Dépose se verrait demander si elle a
 * besoin d'une dépose : celle qu'elle vient de choisir. La question sert à
 * rattraper un OUBLI — s'il n'y a pas d'oubli, il n'y a rien à demander.
 *
 * Les prestations ajoutées PAR une question ne comptent pas dans ce test :
 * sinon la question disparaîtrait à l'instant où on y répond, emportant avec
 * elle la possibilité de changer d'avis.
 */
export function questionsAPoser(
  questions: QuestionResa[],
  panier: { nom: string; categorie?: string; ajouteeParQuestion?: string }[],
): QuestionResa[] {
  const choisiesParLaCliente = panier.filter(t => !t.ajouteeParQuestion)
  const noms = new Set(choisiesParLaCliente.map(t => t.nom))
  const categories = new Set(choisiesParLaCliente.map(t => t.categorie).filter(Boolean) as string[])

  return questions.filter(q => {
    if (!q.actif) return false
    const declenchee =
      q.categories.some(c => categories.has(c)) ||
      q.prestations.some(p => noms.has(p))
    if (!declenchee) return false

    const dejaRepondu = q.reponses.some(
      r => r.effet === 'prestation' && r.prestation && noms.has(r.prestation.nom),
    )
    return !dejaRepondu
  })
}
