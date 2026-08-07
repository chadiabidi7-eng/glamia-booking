// ─────────────────────────────────────────────────────────────────────────────
// CE QUI EST ÉCRIT MAIS PAS ENCORE OUVERT AUX CLIENTES.
//
// Un chantier terminé n'est pas forcément un chantier à publier. Plutôt que de
// retirer le code — et de devoir le réécrire, le retester, le redécouvrir dans
// six semaines — on l'éteint ici, d'un mot.
//
// LE CODE RESTE EN PLACE, ENTIER ET COMPILÉ. Il ne peut donc pas pourrir dans
// son coin : chaque changement de l'app le traverse, et une rupture se voit tout
// de suite au lieu d'attendre le jour de la publication.
//
// POUR RALLUMER : passer le drapeau à `true`, essayer, publier. Rien d'autre.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Les questions posées à la cliente au moment de réserver.
 *
 * Écrit et fonctionnel — la pro compose ses questions, la page de réservation
 * les pose, les réponses arrivent sur la fiche du rendez-vous et ajoutent la
 * prestation qui va avec (la dépose, par exemple).
 *
 * ÉTEINT LE 7 AOÛT 2026, décision de Chadi : la 2.5 part avec Glamia Pay et
 * rien d'autre. Les questions suivront dans une mise à jour à part, pour
 * qu'elles aient leur propre passage d'essai plutôt que d'être noyées.
 *
 * Éteindre ferme les DEUX portes : la pro ne peut plus les composer, et la page
 * de réservation ne les pose plus — y compris à celles qui en ont déjà
 * enregistré. Rien n'est effacé : leurs questions les attendent.
 */
export const QUESTIONS_RESA_ACTIVES = false;

// ⚠️ CE FICHIER EXISTE EN DEUX EXEMPLAIRES — ici et dans l'app mobile. Les deux
// doivent dire la même chose : la pro qui compose ses questions et la cliente à
// qui on les pose sont les deux bouts du même chantier. Rallumer d'un seul côté
// donnerait une pro qui prépare des questions que personne ne voit, ou une
// cliente à qui on demande des choses que sa pro ne peut plus modifier.
