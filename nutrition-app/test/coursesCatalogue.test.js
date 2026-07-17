'use strict';
// Tests du RÉFÉRENTIEL des ingrédients (public/coursesCatalogue.js) : résolution
// par alias, unicité, rayons valides, groupes interchangeables, et couverture
// des ingrédients les plus fréquents du catalogue de recettes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const cat = require('../public/coursesCatalogue.js');

test('référentiel : chaque alias résout vers son canonique, sans collision', () => {
  const vus = {};
  Object.entries(cat.INGREDIENTS).forEach(([id, def]) => {
    def.aliases.forEach((a) => {
      const n = cat.normaliser(a);
      assert.ok(!(n in vus) || vus[n] === id, `alias « ${a} » revendiqué par ${vus[n]} ET ${id}`);
      vus[n] = id;
      const r = cat.resoudre(a);
      assert.ok(r, `alias « ${a} » ne résout pas`);
      assert.equal(r.id, id, `alias « ${a} » -> ${r.id}, attendu ${id}`);
    });
  });
});

test('référentiel : résolution insensible à la casse, aux accents et à œ', () => {
  assert.equal(cat.resoudre('Épinards').id, 'epinards');
  assert.equal(cat.resoudre('EPINARDS').id, 'epinards');
  assert.equal(cat.resoudre('Œufs').id, 'oeufs');
  assert.equal(cat.resoudre("huile d'olive").id, 'huile_olive');
  assert.equal(cat.resoudre('huile d’olive').id, 'huile_olive', 'apostrophe typographique acceptée');
  assert.equal(cat.resoudre('  tomates  ').id, 'tomate');
  assert.equal(cat.resoudre('ingrédient inconnu du référentiel'), null, 'inconnu -> null, jamais de crash');
});

test('référentiel : rayons et unités de base valides partout', () => {
  Object.entries(cat.INGREDIENTS).forEach(([id, def]) => {
    assert.ok(cat.RAYONS.includes(def.rayon), `${id} : rayon « ${def.rayon} » hors liste`);
    assert.ok(['g', 'ml', 'piece'].includes(def.unite_base), `${id} : unite_base invalide`);
    assert.ok(def.display_name && def.purchase_unit, `${id} : display_name et purchase_unit requis`);
    assert.equal(typeof def.is_staple, 'boolean', `${id} : is_staple booléen`);
    if (def.interchangeable_group) assert.ok(cat.GROUPES[def.interchangeable_group], `${id} : groupe inconnu`);
  });
});

test('groupe poisson_blanc : les 4 variétés, jamais le pané ni le fumé', () => {
  const membres = Object.entries(cat.INGREDIENTS).filter(([, d]) => d.interchangeable_group === 'poisson_blanc').map(([id]) => id).sort();
  assert.deepEqual(membres, ['cabillaud', 'colin', 'lieu_noir', 'merlu']);
  assert.equal(cat.INGREDIENTS.poisson_pane.interchangeable_group, null);
  assert.equal(cat.INGREDIENTS.saumon_fume.interchangeable_group, null);
  assert.equal(cat.resoudre('filet de cabillaud').def.interchangeable_group, 'poisson_blanc');
});

test('référentiel : les ingrédients les plus fréquents des recettes résolvent', () => {
  // Le top du catalogue de recettes (recipes-v2) : le référentiel de départ doit
  // au minimum couvrir ceux-là — c'est eux qui font le volume de la liste.
  ['huile d\'olive', 'tomates concassées', 'riz', 'riz cru', 'tomate', 'tomates', 'banane',
    'blanc de poulet', 'pommes de terre', 'oeufs', 'courgette', 'courgettes', 'pain complet',
    'épinards', 'carottes', 'carotte', 'concombre', 'lait demi-écrémé', 'skyr nature',
    'emmental', 'thon au naturel', 'escalope de dinde', 'poivron', 'fromage frais',
    'crème légère', 'boeuf haché 5%', 'flocons d\'avoine', 'salade verte',
    'beurre de cacahuète', 'pâtes crues'].forEach((nom) => {
    assert.ok(cat.resoudre(nom), `« ${nom} » devrait être couvert par le référentiel`);
  });
});

test('staples : le placard est bien du longue conservation', () => {
  const staples = Object.entries(cat.INGREDIENTS).filter(([, d]) => d.is_staple).map(([id]) => id).sort();
  assert.deepEqual(staples, ['beurre_cacahuete', 'flocons_avoine', 'huile_olive', 'muesli', 'pates_crues', 'riz_cru', 'thon_naturel', 'tomates_concassees', 'whey_vanille']);
});
