#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// TOUTE PHRASE FRANÇAISE ENCORE ÉCRITE DANS LE CODE, OÙ QU'ELLE SOIT.
//
//     node scripts/francais-partout.mjs
//
// Le contrôle des langues cherche aux endroits qu'il connaît : le texte entre
// balises, les propriétés, les alertes. Celui-ci ne cherche nulle part en
// particulier — il lit TOUTES les chaînes entre guillemets et signale celles
// qui ressemblent à du français.
//
// C'est ce qui a rattrapé « ☰ Trier » et « Valider », cachés dans une
// condition entre accolades — une forme qu'aucun des autres ne regardait.
// ─────────────────────────────────────────────────────────────────────────────
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const RACINE = new URL('..', import.meta.url).pathname;
const DOSSIERS = ['app', 'components', 'lib'];

// Ce qui reste volontairement en français, et pourquoi :
//   • les listes sources de pays et de monnaies — repères de lecture, elles
//     passent par nomPays() et nomDevise() avant d'arriver à l'écran ;
//   • les jetons du message de rappel — (prénom), (délai) : des repères
//     techniques que la pro voit sous forme d'étiquettes, pas du texte ;
//   • les noms des langues elles-mêmes — « Français » s'écrit en français ;
//   • les alertes internes qui vont à Chadi.
//   • les jetons du message de rappel, côté éditeur comme côté envoi.
// L'écran d'administration n'est vu que par Chadi : il reste en français.
const EXEMPTS = ['app/admin/page.tsx', 'lib/orphelins.ts', 'lib/devise.ts', 'lib/pays-travail.ts', 'lib/rappel.ts', 'lib/i18n.ts',
  'lib/pays-stripe.ts', 'components/EditeurRappel.tsx'];

// La liste s'allonge à chaque trouvaille. « Sauver » et « Trier » sont passés
// au travers parce qu'ils n'y étaient pas : un mot qui manque ici, c'est un
// bouton français chez une pro anglaise. Dans le doute, on ajoute.
const MOTS = ['valider', 'annuler', 'supprimer', 'modifier', 'enregistrer', 'ajouter',
  'fermer', 'trier', 'sauver', 'sauvegarder', 'envoyer', 'envoi', 'partager', 'copier',
  'coller', 'publier', 'activer', 'désactiver', 'choisir', 'quitter', 'revenir',
  'confirmer', 'refuser', 'accepter', 'appliquer', 'créer', 'création', 'chercher',
  'rechercher', 'ouvrir', 'connexion', 'déconnexion', 'chargement', 'renommage',
  'blocage', 'planning', 'promo', 'photo', 'maximum', 'manquant', 'manquants',
  'requis', 'incorrect', 'indisponible', 'atteint', 'pause', 'aucun', 'aucune',
  'nouvelle', 'nouveau', 'prix', 'votre', 'vos', 'ton', 'ta', 'tes', 'une', 'des',
  'est', 'sont', 'pour', 'avec', 'dans', 'sans', 'cette', 'merci', 'bonjour',
  'impossible', 'erreur', 'réessaie', 'cliente', 'prestation', 'créneau', 'acompte',
  'rendez-vous', 'aujourd', 'demain', 'hier', 'semaine', 'heure', 'minute', 'jour', 'mois', 'année', 'annee',
  'dernier', 'dernière', 'prochain', 'prochaine', 'total', 'depuis', 'jusqu',
  'avant', 'après', 'pendant', 'encore', 'déjà', 'toujours', 'jamais', 'continuer',
  'suivant', 'retour', 'terminé', 'compte', 'facture', 'devise', 'pays', 'ville',
  'email', 'mot de passe', 'bienvenue', 'question', 'rien', 'plus tard', 'animaux'];
const FRANCAIS = new RegExp(`\\b(${MOTS.join('|')})\\b|[éèêàùôîç]`, 'i');
const BRUIT = /^email-address$|^glamia\.\w+$|^[a-z_-]+$|^\$\{|^\/|^@|^http|^\d|^[A-Z_]+$/;

const fichiers = (d) => readdirSync(d).flatMap(n => {
  const c = join(d, n);
  if (n === 'node_modules' || n.startsWith('.')) return [];
  if (statSync(c).isDirectory()) return fichiers(c);
  return /\.tsx?$/.test(n) ? [c] : [];
});

const sansCommentaires = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, m => '\n'.repeat((m.match(/\n/g) || []).length))
  .split('\n').map(l => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');

const sansTraduire = (s) => {
  let out = '', i = 0;
  for (;;) {
    const j = s.indexOf('traduire(', i);
    if (j < 0) { out += s.slice(i); break; }
    out += s.slice(i, j);
    let k = j + 9, prof = 1;
    while (k < s.length && prof) { prof += (s[k] === '(') - (s[k] === ')'); k++; }
    out += '«T»' + '\n'.repeat((s.slice(j, k).match(/\n/g) || []).length);
    i = k;
  }
  return out;
};

const LIT = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g;
const trouvailles = [];
for (const dossier of DOSSIERS) {
  for (const chemin of fichiers(join(RACINE, dossier))) {
    const relatif = chemin.replace(RACINE, '');
    if (EXEMPTS.some(e => relatif.endsWith(e))) continue;
    const src = sansTraduire(sansCommentaires(readFileSync(chemin, 'utf8')));
    let dansJournal = false;
    src.split('\n').forEach((ligne, i) => {
      if (dansJournal) { if (ligne.includes(');')) dansJournal = false; return; }
      if (/console\.\w+\(/.test(ligne) && !ligne.includes(');')) dansJournal = true;
      // Ce qui n'arrive jamais sous les yeux d'une pro : les journaux, les
      // requêtes, et les erreurs internes qu'on lance pour nous-mêmes.
      if (/console\.|from\s+['"]|\.select\(|\.eq\(|require\(|Platform\.OS|AsyncStorage\.|supabase\.|new Error\(|throw /.test(ligne)) return;
      // DU TEXTE MÊLÉ À UNE VARIABLE, dans la même balise :
      //     <Text>RDV du {dateCourte}</Text>
      // Les mots hors des accolades sont bien affichés, mais aucun contrôle ne
      // les voyait : celui des langues cherche du texte SANS accolades, et
      // celui-ci ne lisait que les chaînes entre guillemets. « RDV du 21
      // August » est passé par ce trou.
      for (const m of ligne.matchAll(/>([^<>]*\{[^<>]*)</g)) {
        // On vide les accolades, y compris imbriquées, avant de regarder les
        // mots qui restent : un gabarit `${a} · ${b}` n'est pas du texte.
        let mots = m[1];
        for (let n = 0; n < 4; n++) mots = mots.replace(/\{[^{}]*\}/g, ' ');
        mots = mots.replace(/[`$]/g, ' ').trim();
        if (mots.length >= 3 && FRANCAIS.test(mots) && !/^[\d\s·—–:,.%€$]+$/.test(mots)) {
          trouvailles.push([relatif, i + 1, mots.slice(0, 60)]);
        }
      }
      for (const m of ligne.matchAll(LIT)) {
        const v = (m[1] || m[2] || '').trim();
        // Une liste de colonnes (« id, rdv_id, statut ») n'est pas une phrase.
        if (/^[a-z_]+(,\s*[a-z_():]+)+$/.test(v)) continue;
        if (v.length < 4 || BRUIT.test(v) || v.includes('«T»')) continue;
        if (FRANCAIS.test(v)) trouvailles.push([relatif, i + 1, v.slice(0, 80)]);
      }
    });
  }
}

console.log(`\n  Phrases françaises encore dans le code : ${trouvailles.length}`);
for (const [f, l, v] of trouvailles) console.log(`      ${f}:${l}  « ${v} »`);
console.log('');
process.exit(trouvailles.length > 0 ? 1 : 0);
