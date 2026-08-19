#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// LE CONTRÔLE DES FICHIERS DE LANGUE.
//
//     node scripts/langues.mjs
//
// Il répond à trois questions, et il doit passer avant chaque publication :
//
// 1. LES TROIS FICHIERS PORTENT-ILS LES MÊMES CLÉS ? Une clé oubliée en
//    anglais affiche du français à une pro anglaise. C'est le repli prévu, mais
//    on veut le savoir.
//
// 2. RESTE-T-IL DU TEXTE ÉCRIT EN DUR dans le code ? Tant qu'il en reste, une
//    partie de l'app ne se traduira jamais.
//
// 3. UNE CLÉ EST-ELLE INUTILISÉE ? Elle alourdit les trois fichiers et fait
//    traduire pour rien.
//
// Il ne modifie rien. Il compte, il montre, il sort en erreur si l'anglais ou
// l'espagnol ont pris du retard sur le français.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const RACINE = new URL('..', import.meta.url).pathname;

// L'ÉCRAN FONDATEUR RESTE EN FRANÇAIS. Personne d'autre que Chadi ne l'ouvre :
// le traduire coûterait du temps et n'aiderait aucune pro.
const HORS_COMPTE = [
  '/app/admin/',        // l'écran fondateur, que seul Chadi ouvre
  '/app/layout.tsx',    // la racine du site : elle ne connaît aucune pro
];

// Ce qui n'est pas du texte affiché : une étiquette technique posée sur un
// paiement Stripe, un message de journal. Ni l'un ni l'autre n'est lu par une
// pro ou par une cliente.
const PAS_DU_TEXTE = [
  'consentement à la résa',
  'plus de 100 paiements sur 24h pour au moins un compte — scan possiblement partiel',
];

const LANGUES = ['fr', 'en', 'es'];

const aplatir = (objet, prefixe = '') =>
  Object.entries(objet).flatMap(([cle, valeur]) =>
    valeur && typeof valeur === 'object'
      ? aplatir(valeur, `${prefixe}${cle}.`)
      : [`${prefixe}${cle}`]);

const fichiers = Object.fromEntries(LANGUES.map(l => [
  l, aplatir(JSON.parse(readFileSync(join(RACINE, 'locales', `${l}.json`), 'utf8'))),
]));

// ── 1. Les mêmes clés partout ────────────────────────────────────────────────
//
// SAUF LES PAGES DE DROIT. Les conditions et la confidentialité ne sont pas des
// traductions l'une de l'autre : l'anglaise nomme quatre lois applicables là où
// la française en nomme une, et la section n'a donc pas le même nombre de
// paragraphes. Exiger la parité obligerait à mentir dans l'une des deux.
const PAS_UNE_TRADUCTION = ['cgu.sections', 'confidentialite.sections'];
const compte = c => !PAS_UNE_TRADUCTION.some(p => c.startsWith(p));

const reference = new Set(fichiers.fr.filter(compte));
let manquantes = 0;
for (const langue of ['en', 'es']) {
  const presentes = new Set(fichiers[langue].filter(compte));
  const absentes = [...reference].filter(c => !presentes.has(c));
  const enTrop = [...presentes].filter(c => !reference.has(c));
  console.log(`  ${langue} : ${presentes.size} clés — ${absentes.length} manquante(s), ${enTrop.length} en trop`);
  absentes.slice(0, 8).forEach(c => console.log(`      manque  ${c}`));
  enTrop.slice(0, 8).forEach(c => console.log(`      en trop ${c}`));
  manquantes += absentes.length + enTrop.length;
}

// ── 2. Ce qui reste écrit en dur ─────────────────────────────────────────────
// On cherche le texte visible dans un écran : ce qui est écrit entre les
// balises et que la pro lit.
//
// La première version exigeait deux mots. Elle passait donc à côté de
// « Enregistrer », « Annuler », « Fin » — un tiers de l'app, et justement les
// mots les plus vus. On compte maintenant tout mot d'au moins deux lettres.
const parcourir = (dossier, exts = ['.tsx']) => readdirSync(dossier).flatMap(nom => {
  const chemin = join(dossier, nom);
  if (nom === 'node_modules' || nom.startsWith('.')) return [];
  return statSync(chemin).isDirectory() ? parcourir(chemin, exts)
    : exts.includes(extname(nom)) ? [chemin] : [];
});

const ecrans = [...parcourir(join(RACINE, 'app'), ['.tsx', '.ts']), ...parcourir(join(RACINE, 'components'), ['.tsx'])]
  .filter(f => !HORS_COMPTE.some(h => f.includes(h)));

// Ce qui ne se traduit pas : le nom de la marque, et le coin réservé aux
// essais qu'aucune pro ne voit.
const JAMAIS_TRADUIT = ['GLAMIA', 'Glamia', 'GLAMIA PAY', 'Dev', 'Admin',
  'contact@glamia.pro', 'Stripe', 'Apple', 'Instagram'];

// Le motif n'acceptait que les phrases commençant par une lettre : « ← Retour »
// et « ＋ Ajouter une prestation » passaient donc à travers. On accepte
// maintenant n'importe quel début, du moment qu'il y a des lettres dedans.
// LA PAGE DE RÉSA EST DU WEB, pas du React Native : le texte visible n'est
// pas dans un <Text> mais entre n'importe quelles balises — <p>, <h2>,
// <button>, <span>. On prend donc tout ce qui est écrit entre un « > » et un
// « < », ce qui est exactement la définition du texte affiché.
const PHRASE = /(?:^|>)\s*([^<>{}\n]{2,})\s*</g;
let enDur = 0;
const parEcran = [];
for (const chemin of ecrans) {
  const source = readFileSync(chemin, 'utf8');
  const trouvees = [...source.matchAll(PHRASE)].map(m => m[1].trim())
    .filter(p => /[A-Za-zÀ-ÿ]{2}/.test(p) && !/^[0-9\s€$%.,:-]+$/.test(p))
    .filter(p => !JAMAIS_TRADUIT.includes(p))
    // Prendre « ce qui est entre > et < » attrape aussi des MORCEAUX DE CODE :
    // une expression coupée en deux par un retour à la ligne ressemble à du
    // texte. Aucune phrase affichée ne contient && || => ni ne finit par une
    // parenthèse ouvrante.
    .filter(p => !/(&&|\|\||=>|!==|===|\)\.|\bconst\b|\breturn\b)/.test(p))
    .filter(p => !/[({[]$/.test(p) && !/^[)}\]]/.test(p))
    // Deux derniers morceaux de code qui ressemblent à du texte : un type
    // TypeScript coupé en deux, et une comparaison numérique.
    .filter(p => !/^Promise$/.test(p) && !/^\d+\)/.test(p));
  if (trouvees.length) {
    enDur += trouvees.length;
    parEcran.push([chemin.replace(RACINE, ''), trouvees.length]);
  }
}
parEcran.sort((a, b) => b[1] - a[1]);

console.log(`\n  Texte encore écrit en dur : ${enDur} phrase(s) dans ${parEcran.length} écran(s)`);
parEcran.slice(0, 12).forEach(([f, n]) => console.log(`      ${String(n).padStart(4)}  ${f}`));

// ── 2 bis. LE FRANÇAIS QUI SE CACHE AILLEURS QUE DANS UN TEXTE ──────────────
// Le compte du dessus ne regarde que ce qui est écrit entre deux balises. Une
// phrase peut aussi vivre dans une chaîne assemblée — « Ce RDV chevauche celui
// de ${prenom} » — et celle-là, aucune balise ne la trahit. On la cherche par
// ses mots : un article, un possessif, une préposition française.
const MOTS_FR = /\b(le|la|les|un|une|des|du|de la|ton|ta|tes|mon|ma|mes|son|sa|ses|ce|cette|ces|pour|avec|chez|dans|sur|qui|que|est|sont|pas|plus|tout|toute|aucun|aucune|déjà|encore|jamais)\b/i;
let cachees = 0;
const parEcranCache = [];
for (const chemin of ecrans) {
  // Les messages de console ne sont lus que par nous : ils restent en
  // français, et ils n'ont rien à faire dans ce compte.
  const code = readFileSync(chemin, 'utf8')
    // ON REMPLACE PAR DES ESPACES, PAS PAR RIEN. Effacer un commentaire colle
    // la ligne d'avant à celle d'après, et deux morceaux de code sans rapport
    // finissent par ressembler à une phrase.
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/^\s*\/\/.*$/gm, m => m.replace(/[^\n]/g, ' '))
    // Une ligne de journal tient sur une ligne : on la retire entière. Les rares
    // appels sur plusieurs lignes sont pris par le second motif.
    .replace(/^.*console\.[a-z]+\(.*$/gm, '')
    // Un journal peut tenir sur deux lignes quand il porte plusieurs valeurs.
    .replace(/console\.[a-z]+\([\s\S]{0,300}?\)\s*$/gm, '')
    .replace(/console\.[a-z]+\([\s\S]*?\);/g, '');
  // TROIS MOTIFS, UN PAR SORTE DE GUILLEMET, et c'est nécessaire : le motif
  // unique d'avant interdisait les trois guillemets À L'INTÉRIEUR de la
  // chaîne. Une phrase française sur deux porte une apostrophe — « Une place
  // s'est libérée » — et toutes passaient à travers.
  const trouvees = [
    ...code.matchAll(/`((?:[^`\\\n]|\\.){10,}?)`/g),
    ...code.matchAll(/'((?:[^'\\\n]|\\.){10,}?)'/g),
    ...code.matchAll(/"((?:[^"\\\n]|\\.){10,}?)"/g),
  ]
    .map(m => m[1])
    .filter(t => MOTS_FR.test(t) && /[a-zà-ÿ]{3}/i.test(t))
    .filter(t => !/^[a-z0-9_\-/.@]+$/i.test(t) && !t.includes('://'))
    .filter(t => !PAS_DU_TEXTE.includes(t));
  if (trouvees.length) {
    cachees += trouvees.length;
    parEcranCache.push([chemin.replace(RACINE, ''), trouvees.length, trouvees]);
  }
}
parEcranCache.sort((a, b) => b[1] - a[1]);
console.log(`\n  Français caché dans des phrases assemblées : ${cachees} dans ${parEcranCache.length} écran(s)`);
parEcranCache.slice(0, 10).forEach(([f, n]) => console.log(`      ${String(n).padStart(4)}  ${f}`));

// ── 3. LE CONTRÔLE LE PLUS IMPORTANT : une clé appelée qui n'existe pas ──────
// Là, ce n'est pas du français qui s'affiche à une anglaise : c'est le nom
// technique de la clé, en clair, au milieu de l'écran. Ça ne doit jamais
// arriver, dans aucune langue.
const toutesLesCles = new Set(fichiers.fr);
const appelees = new Set();
const familles = new Set();
for (const chemin of [...ecrans, ...parcourir(join(RACINE, 'lib'), ['.ts', '.tsx'])]) {
  // Les commentaires portent des exemples d'écriture : ce ne sont pas des
  // appels, et ils feraient sonner l'alarme pour rien.
  const code = readFileSync(chemin, 'utf8')
    // ON REMPLACE PAR DES ESPACES, PAS PAR RIEN. Effacer un commentaire colle
    // la ligne d'avant à celle d'après, et deux morceaux de code sans rapport
    // finissent par ressembler à une phrase.
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/^\s*\/\/.*$/gm, m => m.replace(/[^\n]/g, ' '));
  for (const m of code.matchAll(/traduire\(\s*'([a-zA-Z0-9_.]+)'/g)) appelees.add(m[1]);
  // Certaines clés sont fabriquées au vol : traduire(`catalogue.${cle}`). On
  // ne peut pas savoir ce que vaut la variable, mais on sait que TOUTE la
  // famille est appelée — la marquer entière vaut mieux que de faire sonner
  // l'alarme sur 72 lignes qui vont très bien.
  for (const m of code.matchAll(/traduire\(\s*`([a-zA-Z0-9_.]+)\.\$\{/g)) familles.add(m[1]);
  // Les pages de droit lisent leurs clés au vol : i18n.t(`${bloc}.${cle}`),
  // où `bloc` vaut « cgu » ou « confidentialite ».
  for (const m of code.matchAll(/i18n\.t\(\s*`\$\{bloc\}/g)) { familles.add('cgu'); familles.add('confidentialite'); }
}
const racineCle = c => c.replace(/\.(zero|one|two|few|many|other)$/, '');
const cles = new Set([...toutesLesCles].map(racineCle));
const fantomes = [...appelees].filter(c => !cles.has(c));
console.log(`\n  Clés appelées qui n'existent pas : ${fantomes.length}`);
fantomes.forEach(c => console.log(`      ${c}`));

// ── 4. Les clés que personne n'utilise ───────────────────────────────────────
const toutLeCode = ecrans.concat(parcourir(join(RACINE, 'lib'), ['.ts', '.tsx']))
  .map(f => readFileSync(f, 'utf8')).join('\n');
// Les pluriels vivent sous .one / .other : le code appelle la clé parente.
const racine = c => c.replace(/\.(zero|one|two|few|many|other)$/, '');
const jamaisVues = [...new Set(fichiers.fr.map(racine))]
  .filter(c => !toutLeCode.includes(c))
  .filter(c => ![...familles].some(f => c.startsWith(`${f}.`)));
console.log(`\n  Clés jamais utilisées : ${jamaisVues.length}`);
jamaisVues.slice(0, 8).forEach(c => console.log(`      ${c}`));

console.log(`\n  Français : ${fichiers.fr.length} clés.\n`);
process.exit(manquantes + fantomes.length > 0 ? 1 : 0);
