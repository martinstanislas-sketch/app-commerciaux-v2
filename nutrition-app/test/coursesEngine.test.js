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
  assert.equal(canoniques.get('riz').qty, 135, 'riz + riz cru = un seul canonique');
  assert.equal(warnings.length, 0);
});

test('T2 — cuillères converties en interne (cs ≈ 13, cc ≈ 5)', () => {
  const { canoniques } = E.agreger(plan([
    ing("huile d'olive", 3, 'c. à soupe'), ing("huile d'olive", 5, 'c. à café'),
  ]), 1);
  assert.equal(canoniques.get('huile_d_olive').qty, 3 * 13 + 5 * 5);
});

// --- T1 : doublons fusionnés -------------------------------------------------
// Référentiel v2 : wrap et tortilla sont deux produits distincts (avant ils
// étaient fusionnés en « wraps_ble »). Chacun s'agrège correctement chez lui.
// ⚠️ À trancher côté produit : en magasin c'est le même achat.
test('T1 — wrap et tortilla : deux produits, chacun agrégé sans doublon', () => {
  const liste = E.construireListe(plan([
    ing('tortilla de blé', 1, 'piece'), ing('tortilla de blé', 2, 'piece'), ing('wrap de blé', 1, 'piece'),
  ]), 1);
  const tortilla = tous(liste).filter((i) => i.id === 'tortilla_de_ble');
  const wrap = tous(liste).filter((i) => i.id === 'wrap_de_ble');
  assert.equal(tortilla.length, 1, 'une seule ligne tortilla');
  assert.equal(tortilla[0].besoin_reel.quantite, 3, 'les 2 mentions de tortilla sont bien sommées');
  assert.equal(wrap.length, 1, 'une seule ligne wrap');
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

// Les 3 libellés « dinde » réellement présents dans les recettes. Le v2 en fait
// 3 produits distincts (coupes différentes) : une ligne chacun, aucune fusion
// hasardeuse, et chaque libellé est bien couvert (zéro warning).
test('T1 — dinde : les 3 coupes réelles = 3 lignes propres, sans doublon', () => {
  const liste = E.construireListe(plan([
    ing('blanc de dinde', 140, 'g'), ing('blanc de dinde', 60, 'g'),
    ing('escalope de dinde', 160, 'g'), ing('dinde hachée', 120, 'g'),
  ]), 1);
  assert.equal(liste.warnings.length, 0, 'les 3 libellés sont couverts par le référentiel');
  const dinde = tous(liste).filter((i) => i.nom.toLowerCase().includes('dinde'));
  assert.equal(dinde.length, 3, 'une ligne par coupe');
  assert.equal(new Set(dinde.map((i) => i.id)).size, 3, 'aucun id en double');
  const blanc = dinde.find((i) => i.id === 'blanc_de_dinde');
  assert.equal(blanc.besoin_reel.quantite, 200, 'les 2 mentions de blanc sont sommées');
  assert.equal(blanc.quantite_achat, '~200 g', 'viande : multiple de 50 g supérieur');
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
  assert.equal(trouve(liste, 'whey vanille').quantite_achat, '1 paquet');
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
    ing('blanc de poulet', 300, 'g'), ing('courgette', 800, 'g'), ing('pain complet', 2, 'piece'),
  ]), 1);
  const placardNoms = liste.placard.map((i) => i.id).sort();
  assert.deepEqual(placardNoms, ['huile_d_olive', 'riz', 'thon_au_naturel', 'tomates_concassees', 'whey_vanille']);
  liste.placard.forEach((i) => assert.equal(i.probablement_deja_en_stock, true));
  ['blanc_de_poulet', 'courgette', 'pain_complet'].forEach((id) => assert.ok(liste.frais.some((i) => i.id === id), id + ' au frais'));
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
    ing('courgette', 800, 'g'), ing('riz', 135, 'g'), ing('banane', 3, 'piece'),
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
  const { canoniques } = E.agreger(plan([ing('courgette', 100, 'g')]), 2.5);
  assert.equal(canoniques.get('courgette').qty, 250);
});

// --- Conversion cru -> cuit ---------------------------------------------------
// On ACHÈTE du cru. Une recette qui parle en cuit doit donc faire monter la
// quantité d'achat, jamais la baisser (poulet 0,7 · riz 2,7).
test('cru/cuit : une recette en « cuit » achète PLUS de cru, jamais moins', () => {
  const { canoniques } = E.agreger(plan([
    ing('blanc de poulet cuit', 100, 'g'), ing('riz cuit', 200, 'g'),
  ]), 1);
  const poulet = canoniques.get('blanc_de_poulet').qty;
  const riz = canoniques.get('riz').qty;
  assert.ok(poulet > 100, `100 g de poulet cuit -> ${Math.round(poulet)} g crus (doit être > 100)`);
  assert.equal(Math.round(poulet), 143, '100 / 0,7 ≈ 143 g crus');
  assert.ok(riz < 200, `200 g de riz cuit -> ${Math.round(riz)} g crus (le riz gonfle)`);
  assert.equal(Math.round(riz), 74, '200 / 2,7 ≈ 74 g crus');
});

test('cru/cuit : un libellé déjà cru n’est jamais reconverti', () => {
  const { canoniques } = E.agreger(plan([ing('blanc de poulet', 100, 'g')]), 1);
  assert.equal(canoniques.get('blanc_de_poulet').qty, 100, 'du cru reste du cru');
});
