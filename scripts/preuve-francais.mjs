#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// LA PREUVE QUE RIEN N'A BOUGÉ POUR UNE PRO FRANÇAISE.
//
//     node scripts/preuve-francais.mjs
//
// Sortir les phrases du code vers un fichier, c'est un déplacement. Une pro
// française doit voir EXACTEMENT la même chose qu'avant, au caractère près.
//
// Ce contrôle compare chaque phrase française déplacée au code d'origine —
// celui d'avant le chantier, relu directement dans l'historique git. Si un mot
// a changé, une majuscule, un accent, une apostrophe, il le dit.
//
// Il ne regarde que le français. L'anglais et l'espagnol sont des traductions :
// ils ont le droit d'être différents. Le français, non.
// ─────────────────────────────────────────────────────────────────────────────

import { execSync } from 'child_process';
import { readFileSync } from 'fs';

// Le dernier état AVANT le début du chantier des langues : le 19 août 2026,
// juste avant que la première phrase ne bouge. C'est la référence.
// LE DERNIER COMMIT AVANT LE CHANTIER DES LANGUES. Par défaut c'était HEAD,
// c'est-à-dire le code d'AUJOURD'HUI — où les phrases ont justement quitté le
// code pour les fichiers de langue. La preuve ne retrouvait donc presque rien
// et affichait 371 écarts qui n'en étaient pas. Le bon point de comparaison,
// c'est la veille : 9391c92, « Les virements vers les banques sont enfin
// suivis », dernier état de la page avant qu'on y touche.
const AVANT = process.argv[2] ?? '9391c92';

const fr = JSON.parse(readFileSync(new URL('../locales/fr.json', import.meta.url), 'utf8'));

const aplatir = (o, p = '') =>
  Object.entries(o).flatMap(([c, v]) =>
    v && typeof v === 'object' ? aplatir(v, `${p}${c}.`) : [[`${p}${c}`, v]]);

// Le texte d'origine de toute l'app, tel qu'il était avant.
const origine = execSync(
  `git grep -h "" ${AVANT} -- 'app/*' 'components/*' 'lib/*' || true`,
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
);

// On normalise ce qui ne se voit pas à l'écran : les retours à la ligne du
// code, les espaces multiples, et les deux façons d'écrire une apostrophe
// dans du code — &apos; en JSX, \' dans une chaîne. À l'écran, les trois
// donnent la même apostrophe.
const nettoyer = s => s
  .replace(/&apos;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/\\'/g, "'")
  .replace(/\\"/g, '"')
  // Un retour à la ligne s'écrit \n dans le code et se voit comme un vrai
  // retour à la ligne à l'écran ; une apostrophe courbe s'écrit parfois
  // \u2019. Les deux doivent se lire comme ce qu'elles affichent.
  .replace(/\\n/g, ' ')
  .replace(/\\u([0-9a-fA-F]{4})/g, (_, c) => String.fromCharCode(parseInt(c, 16)))
  .replace(/\s+/g, ' ')
  .trim();

const source = nettoyer(origine);

let verifiees = 0;
const introuvables = [];
for (const [cle, valeur] of aplatir(fr)) {
  if (typeof valeur !== 'string') continue;
  // Les phrases à trous portent %{...} : on ne compare que leurs morceaux
  // fixes, le trou étant rempli à l'exécution.
  const morceaux = nettoyer(valeur).split(/%\{[^}]+\}/).filter(m => m.length > 3);
  const toutTrouve = morceaux.every(m => source.includes(m));
  if (toutTrouve) verifiees++;
  else introuvables.push([cle, valeur]);
}

console.log(`\n  ${verifiees} phrase(s) française(s) retrouvées à l'identique dans le code d'avant.`);
if (introuvables.length) {
  console.log(`  ${introuvables.length} à regarder :\n`);
  introuvables.forEach(([c, v]) => console.log(`      ${c}\n        « ${v} »`));
  console.log('\n  Une phrase absente veut dire l\'une de ces trois choses :');
  console.log('    — elle a changé, et il faut la remettre comme avant ;');
  console.log('    — elle est neuve ;');
  console.log('    — elle était ASSEMBLÉE EN MORCEAUX dans le code (un pluriel');
  console.log('      collé bout à bout, par exemple). Le rendu est identique,');
  console.log('      mais la phrase entière n\'existait nulle part : à relire à');
  console.log('      l\'œil, une fois.\n');
} else {
  console.log('  Aucune différence. Une pro française voit exactement la même app.\n');
}
process.exit(introuvables.length > 0 ? 1 : 0);
