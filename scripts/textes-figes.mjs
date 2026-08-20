#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// LES TEXTES FIGÉS AU DÉMARRAGE.
//
//     node scripts/textes-figes.mjs
//
// Une phrase traduite dans une CONSTANTE de fichier est lue une seule fois, au
// chargement du fichier — c'est-à-dire au démarrage de l'app, avant qu'on sache
// quelle pro se connecte. Elle reste donc en français toute la session, quoi
// que la pro choisisse.
//
// Le piège s'est refermé QUATRE FOIS : les messages de rappel, les modèles de
// formulaire, les listes de pays et de monnaies, puis la carte du parcours de
// démarrage — celle-là repérée par Chadi sur son téléphone, pas par un contrôle.
//
// La règle : une phrase traduite s'appelle, elle ne se lit pas. `const X = () =>`
// et non `const X =`.
// ─────────────────────────────────────────────────────────────────────────────
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const RACINE = new URL('..', import.meta.url).pathname;
const DOSSIERS = ['app', 'components', 'lib'];

const fichiers = (d) => readdirSync(d).flatMap(n => {
  const c = join(d, n);
  if (n === 'node_modules' || n.startsWith('.')) return [];
  if (statSync(c).isDirectory()) return fichiers(c);
  return /\.tsx?$/.test(n) ? [c] : [];
});

const trouvailles = [];
for (const dossier of DOSSIERS) {
  for (const chemin of fichiers(join(RACINE, dossier))) {
    const lignes = readFileSync(chemin, 'utf8').split('\n');
    let dansDeclaration = null;
    lignes.forEach((ligne, i) => {
      // Une déclaration de premier niveau : elle commence en colonne 0.
      // Le « = » de l'affectation, pas celui d'une flèche « => » qui peut se
      // trouver DANS le type : « const X: () => T = () => … ». La première
      // version s'arrêtait à la flèche et croyait la constante figée.
      const m = ligne.match(/^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::.*?)?(?<![=!<>])=(?!>)\s*(.*)$/);
      if (m) {
        const suite = m[2].trim();
        // Une fonction est sûre : elle s'exécute quand on l'appelle.
        const estFonction = /^(\(|async|function|\w+\s*=>)/.test(suite) || /=>\s*$/.test(suite);
        dansDeclaration = estFonction ? null : { nom: m[1], ligne: i + 1 };
      } else if (/^\S/.test(ligne) && !/^\s/.test(ligne) && ligne.trim() !== '') {
        // Une nouvelle instruction de premier niveau ferme la précédente.
        if (!/^[)\]}]/.test(ligne.trim())) dansDeclaration = null;
      }
      // Une flèche ou un `function` rencontré AVANT le texte veut dire qu'on
      // est déjà dans un corps de fonction — donc que rien n'est figé. C'est le
      // cas des composants écrits `const X = forwardRef(...)` ou `memo(...)`.
      if (dansDeclaration && /=>|\bfunction\b/.test(ligne)) dansDeclaration = null;
      if (dansDeclaration && /\btraduire\s*\(/.test(ligne)) {
        trouvailles.push([chemin.replace(RACINE, ''), dansDeclaration.nom, dansDeclaration.ligne]);
        dansDeclaration = null;
      }
    });
  }
}

const parNom = [...new Map(trouvailles.map(t => [`${t[0]}${t[1]}`, t])).values()];
console.log(`\n  Textes figés au démarrage : ${parNom.length}`);
for (const [f, nom, l] of parNom) console.log(`      ${f}:${l}  —  ${nom}`);
if (parNom.length) {
  console.log(`\n  Chacun doit devenir une FONCTION : « const ${parNom[0][1]} = () => … ».\n`);
}
process.exit(parNom.length > 0 ? 1 : 0);
