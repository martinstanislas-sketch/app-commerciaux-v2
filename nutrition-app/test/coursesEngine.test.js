'use strict';
// Tests du MOTEUR de liste de courses (public/coursesEngine.js) sur les
// fixtures des tickets T1-T7 : agrégation pure par canonique, arrondis d'achat,
// unités d'achat, split frais/placard, rayons, rendu texte.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../public/coursesEngine.js');

// Un plan minimal : chaque entrée = un ingrédient d'une recette.
const plan = (ings) => ({ jours: [{ repas: ings.map((i) => ({ recette: { ingredients: [i] } })) }] });
const ing = (nom, quantite, unite, rayon) => ({ nom, quantite, unite, rayon });
const tous = (liste) => [...liste.frais, ...liste.placard];
const trouve = (liste, nom) => tous(liste).find((i) => i.nom === nom);

// --- T2 : agrégation par canonique, jamais par libellé ----------------------
test('T2 — aggregate : total par canonique en unité de base', () => {
  const { canoniques, warnings } = E.agreger(plan([
    ing('pommes de terre', 500, 'g'), ing('pomme de terre', 555, 'g'), ing('pommes de terre', 500, 'g'),
    ing('riz', 60, 'g'), ing('riz cru', 75, 'g'),
  ]), 1);
  assert.equal(canoniques.get('pommes_de_terre').qty, 1555, 'fixture : 1555 g, la somme réelle');
  assert.equal(canoniques.get('riz_cru').qty, 135, 'riz + riz cru = un seul canonique');
  assert.equal(warnings.length, 0);
});

test('T2 — cuillères converties en interne (cs ≈ 13, cc ≈ 5)', () => {
  const { canoniques } = E.agreger(plan([
    ing("huile d'olive", 3, 'c. à soupe'), ing("huile d'olive", 5, 'c. à café'),
  ]), 1);
  assert.equal(canoniques.get('huile_olive').qty, 3 * 13 + 5 * 5);
});

// --- T1 : doublons fusionnés -------------------------------------------------
test('T1 — tortilla + wrap = une seule ligne wraps_ble', () => {
  const liste = E.construireListe(plan([ing('tortilla de blé', 1, 'piece'), ing('wrap de blé', 1, 'piece')]), 1);
  const wraps = tous(liste).filter((i) => i.id === 'wraps_ble');
  assert.equal(wraps.length, 1);
  assert.equal(wraps[0].besoin_reel.quantite, 2);
  assert.equal(wraps[0].quantite_achat, '2');
});

test('T1 — les 4 poissons blancs = une ligne « au choix » avec les variétés', () => {
  const liste = E.construireListe(plan([
    ing('filet de cabillaud', 170, 'g'), ing('filet de colin', 160, 'g'),
    ing('filet de lieu noir', 160, 'g'), ing('filet de merlu', 170, 'g'),
  ]), 1);
  const lignes = tous(liste).filter((i) => i.nom.includes('poisson blanc'));
  assert.equal(lignes.length, 1, 'une seule ligne pour les 4 variétés');
  assert.equal(lignes[0].besoin_reel.quantite, 660);
  assert.equal(lignes[0].quantite_achat, '~700 g', 'multiple de 50 g supérieur');
  ['cabillaud', 'colin', 'lieu noir', 'merlu'].forEach((v) => assert.ok(lignes[0].sousTitre.includes(v), 'variété listée : ' + v));
});

test('T1 — dinde : au plus 2 lignes (tranches vs poids, unités d’achat réellement différentes)', () => {
  const liste = E.construireListe(plan([
    ing('blanc de dinde tranche', 2.5, 'tranche'), ing('blanc de dinde', 140, 'g'), ing('escalope de dinde', 160, 'g'),
  ]), 1);
  const dinde = tous(liste).filter((i) => i.nom.toLowerCase().includes('dinde'));
  assert.equal(dinde.length, 2);
  const poids = dinde.find((i) => i.id === 'escalope_dinde');
  assert.equal(poids.besoin_reel.quantite, 300, 'blanc (g) + escalope fusionnés');
  assert.equal(poids.quantite_achat, '~300 g');
  const tranches = dinde.find((i) => i.id === 'blanc_dinde_tranches');
  assert.equal(tranches.quantite_achat, '3', '2,5 tranches -> 3 (entier supérieur)');
});

test('T1 — alias inconnu : warning + repli, jamais de crash ni de doublon silencieux', () => {
  const liste = E.construireListe(plan([
    ing('fruit du dragon', 2, 'piece', 'Fruits & légumes'), ing('fruit du dragon', 1, 'piece', 'Fruits & légumes'),
    ing('poudre mystère', 20, 'g'),
  ]), 1);
  assert.equal(liste.warnings.length, 2, 'un warning par ingrédient inconnu');
  const dragon = trouve(liste, 'fruit du dragon');
  assert.equal(dragon.besoin_reel.quantite, 3, 'agrégé, pas dupliqué');
  assert.equal(dragon.rayon, 'Fruits & légumes', 'garde le rayon de la recette');
  assert.equal(trouve(liste, 'poudre mystère').rayon, E.RAYON_A_VERIFIER, 'sans rayon -> À vérifier');
});

// --- T3 : arrondis d'achat, zéro décimale ------------------------------------
test('T3 — arrondis : 9,5 œufs -> 10 · 1,5 citron -> 2 · 290 g poulet -> 300 g', () => {
  const liste = E.construireListe(plan([
    ing('oeufs', 9.5, 'piece'), ing('citron', 1.5, 'piece'), ing('blanc de poulet', 290, 'g'),
    ing('emmental', 243, 'g'),
  ]), 1);
  assert.equal(trouve(liste, 'œufs').quantite_achat, '1 boîte (12)', 'conditionnement au-dessus de 10');
  assert.equal(trouve(liste, 'œufs').besoin_reel.quantite, 9.5, 'besoin réel exact conservé');
  assert.equal(trouve(liste, 'citron').quantite_achat, '2');
  assert.equal(trouve(liste, 'blanc de poulet').quantite_achat, '~300 g', 'viande : multiple de 50 g supérieur');
  assert.equal(trouve(liste, 'emmental').quantite_achat, '250 g', 'autres poids : multiple de 10 supérieur');
  tous(liste).forEach((i) => assert.ok(!/\d[.,]\d/.test(i.quantite_achat), 'aucune décimale dans ' + i.quantite_achat));
});

// --- T4 : unités d'achat ------------------------------------------------------
test('T4 — unités d’achat lisibles en magasin, jamais de cuillères', () => {
  const liste = E.construireListe(plan([
    ing('lait demi-écrémé', 270, 'ml'), ing("huile d'olive", 3, 'c. à soupe'), ing("huile d'olive", 5, 'c. à café'),
    ing('whey vanille', 30, 'g'), ing('flocons d\'avoine', 40, 'g'), ing('tomates concassées', 335, 'g'),
  ]), 1);
  assert.equal(trouve(liste, 'lait demi-écrémé').quantite_achat, '1 brique (1 L)');
  assert.equal(trouve(liste, 'huile d’olive').quantite_achat, '1 bouteille');
  assert.ok(trouve(liste, 'huile d’olive').sousTitre.includes('besoin 64 ml'), 'le besoin réel reste lisible');
  assert.equal(trouve(liste, 'whey vanille').quantite_achat, '1 pot');
  assert.equal(trouve(liste, 'tomates concassées').quantite_achat, '1 boîte (400 g)');
  const texte = E.rendreTexte(liste, { jours: 7, personnes: 1 });
  assert.ok(!/c\. à (soupe|café)/.test(texte), 'aucune cuillère sur la liste finale');
});

test('T4 — conditionnements multiples quand le besoin dépasse le pack', () => {
  const liste = E.construireListe(plan([ing('tomates concassées', 700, 'g'), ing('lait', 1200, 'ml')]), 1);
  assert.equal(trouve(liste, 'tomates concassées').quantite_achat, '2 × boîte (400 g)');
  assert.equal(trouve(liste, 'lait demi-écrémé').quantite_achat, '2 × brique (1 L)');
});

// --- T5 : split placard / frais ----------------------------------------------
test('T5 — staples au placard, frais dans la semaine, rien de perdu', () => {
  const liste = E.construireListe(plan([
    ing('whey vanille', 30, 'g'), ing('riz', 135, 'g'), ing("huile d'olive", 2, 'c. à soupe'),
    ing('thon au naturel', 120, 'g'), ing('tomates concassées', 335, 'g'),
    ing('blanc de poulet', 300, 'g'), ing('courgettes', 800, 'g'), ing('pain complet', 2, 'piece'),
  ]), 1);
  const placardNoms = liste.placard.map((i) => i.id).sort();
  assert.deepEqual(placardNoms, ['huile_olive', 'riz_cru', 'thon_naturel', 'tomates_concassees', 'whey_vanille']);
  liste.placard.forEach((i) => assert.equal(i.probablement_deja_en_stock, true));
  ['blanc_poulet', 'courgettes', 'pain_complet'].forEach((id) => assert.ok(liste.frais.some((i) => i.id === id), id + ' au frais'));
  assert.equal(tous(liste).length, 8, 'le split ne perd aucun article');
});

// --- T6 : rayons du référentiel ----------------------------------------------
test('T6 — rayons corrects, jamais déduits du nom', () => {
  const liste = E.construireListe(plan([
    ing('tomates concassées', 335, 'g', 'Fruits & légumes'),   // la recette se trompe : le référentiel gagne
    ing('thon au naturel', 120, 'g', 'Poissonnerie'),
    ing('jambon blanc', 2, 'piece', 'Boucherie'),
    ing('saumon fumé', 60, 'g', 'Poissonnerie'),
  ]), 1);
  assert.equal(trouve(liste, 'tomates concassées').rayon, 'Épicerie');
  assert.equal(trouve(liste, 'thon au naturel').rayon, 'Épicerie');
  assert.equal(trouve(liste, 'jambon blanc').rayon, 'Charcuterie / Traiteur');
  assert.equal(trouve(liste, 'saumon fumé').rayon, 'Charcuterie / Traiteur');
});

// --- T7 : sérialisation fiable ------------------------------------------------
test('T7 — un article = une ligne, jamais deux items collés', () => {
  const liste = E.construireListe(plan([
    ing('mozzarella', 75, 'g'), ing('oeufs', 10, 'piece'), ing('boeuf haché 5%', 150, 'g'),
    ing('courgettes', 800, 'g'), ing('riz', 135, 'g'), ing('banane', 3, 'piece'),
  ]), 1);
  const texte = E.rendreTexte(liste, { jours: 7, personnes: 1 });
  const lignes = texte.split('\n');
  const items = lignes.filter((l) => l.startsWith('- '));
  assert.equal(items.length, 6, 'six articles, six lignes');
  items.forEach((l) => assert.equal((l.match(/ — /g) || []).length, 1, 'un seul article par ligne : ' + l));
  assert.ok(!/\d\s?g[a-zà-ÿ]/.test(texte), 'pas de « 75 goeufs » : une unité jamais collée à l’article suivant');
  // Snapshot de structure : en-tête, rayons en capitales, bloc placard replié à la fin.
  assert.ok(lignes[0].startsWith('Liste de courses'));
  assert.ok(texte.includes('PLACARD — tu l’as sûrement déjà'));
});

test('portions : les quantités suivent le nombre de personnes', () => {
  const { canoniques } = E.agreger(plan([ing('courgettes', 100, 'g')]), 2.5);
  assert.equal(canoniques.get('courgettes').qty, 250);
});
