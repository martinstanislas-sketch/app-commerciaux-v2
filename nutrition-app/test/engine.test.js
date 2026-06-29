'use strict';
// Tests du moteur de compatibilité allergènes / régimes (sécurité alimentaire).
// Lancé par `node --test`. Aucune dépendance externe.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  familiesFromUserAllergies, allergenesEffectifs, satisfaitRegime, recettesCompatibles,
} = require('../lib/planGenerator');

// Petite fabrique de recette pour les tests unitaires.
function R(over) {
  return Object.assign({
    id: 'r', nom: 'Test', type: 'plat', categorie: '', gout: '', cuisines: [],
    regime: [], budget: 'eco', allergenes: [], kcal: 500, proteines: 30, glucides: 40, lipides: 15,
    tempsMinutes: 20, motsCles: [], ingredients: [], etapes: ['x'],
  }, over);
}

test('familiesFromUserAllergies : correspondance exacte par famille', () => {
  assert.deepEqual([...familiesFromUserAllergies(['gluten'])], ['gluten']);
  assert.deepEqual([...familiesFromUserAllergies(['lactose'])], ['lactose']);
  const multi = familiesFromUserAllergies(['gluten', 'lactose', 'oeuf']);
  assert.ok(multi.has('gluten') && multi.has('lactose') && multi.has('oeuf'));
});

test('REGRESSION faux-ami : "fruits-a-coque" ne doit PAS matcher "mollusques"', () => {
  // Bug historique : le synonyme "coque" (mollusques) capturait "fruits-a-coque".
  const f = familiesFromUserAllergies(['fruits-a-coque']);
  assert.ok(f.has('fruits-a-coque'), 'doit contenir fruits-a-coque');
  assert.ok(!f.has('mollusques'), 'ne doit PAS contenir mollusques');
});

test('allergenesEffectifs : fusionne déclarés + détectés (lait d’amande -> fruits-a-coque)', () => {
  // Allergène présent dans un ingrédient mais NON déclaré -> doit être détecté.
  const r = R({ allergenes: [], ingredients: [{ nom: "lait d'amande", quantite: 200, unite: 'ml', rayon: 'Épicerie' }], motsCles: ["lait d'amande"] });
  assert.ok(allergenesEffectifs(r).has('fruits-a-coque'), 'lait d’amande -> fruits-a-coque détecté');
});

test('allergenesEffectifs : un label "sans gluten" ne crée pas de faux positif gluten', () => {
  const r = R({ allergenes: [], nom: 'Pain sans gluten', ingredients: [{ nom: 'pain sans gluten', quantite: 2, unite: 'tranche', rayon: 'Boulangerie' }], motsCles: ['pain sans gluten'] });
  assert.ok(!allergenesEffectifs(r).has('gluten'), '"sans gluten" ne doit pas déclencher gluten');
});

test('satisfaitRegime : vegan contredit par un ingrédient animal -> false', () => {
  const r = R({ regime: ['vegan'], nom: 'Poulet', ingredients: [{ nom: 'blanc de poulet', quantite: 120, unite: 'g', rayon: 'Boucherie' }], motsCles: ['poulet'] });
  assert.equal(satisfaitRegime(r, 'vegan'), false);
});

test('satisfaitRegime : sans-gluten contredit par "blé" -> false ; vegan réel -> true', () => {
  const ble = R({ regime: ['sans-gluten'], ingredients: [{ nom: 'farine de blé', quantite: 50, unite: 'g', rayon: 'Épicerie' }], motsCles: ['blé'] });
  assert.equal(satisfaitRegime(ble, 'sans-gluten'), false);
  const vg = R({ regime: ['vegetarien', 'vegan', 'sans-porc'], ingredients: [{ nom: 'tofu', quantite: 150, unite: 'g', rayon: 'Épicerie' }], motsCles: ['tofu'] });
  assert.equal(satisfaitRegime(vg, 'vegan'), true);
});

test('satisfaitRegime : régime non déclaré -> false (ceinture + bretelles)', () => {
  const r = R({ regime: [] });
  assert.equal(satisfaitRegime(r, 'vegan'), false);
});

test('recettesCompatibles : exclut une recette contenant un allergène interdit', () => {
  const pool = [
    R({ id: 'ok', allergenes: [] }),
    R({ id: 'gluten', allergenes: ['gluten'] }),
  ];
  const res = recettesCompatibles(pool, { allergies: ['gluten'] });
  assert.deepEqual(res.map((r) => r.id), ['ok']);
});

test('recettesCompatibles : budget éco exclut les recettes budget normal', () => {
  const pool = [R({ id: 'eco', budget: 'eco' }), R({ id: 'normal', budget: 'normal' })];
  assert.deepEqual(recettesCompatibles(pool, { budget: 'eco' }).map((r) => r.id), ['eco']);
  // budget normal -> tout passe
  assert.equal(recettesCompatibles(pool, { budget: 'normal' }).length, 2);
});

test('recettesCompatibles : régime requis non satisfait -> exclu', () => {
  const pool = [
    R({ id: 'vegan', regime: ['vegetarien', 'vegan', 'sans-porc'], ingredients: [{ nom: 'tofu', quantite: 150, unite: 'g', rayon: 'Épicerie' }], motsCles: ['tofu'] }),
    R({ id: 'viande', regime: [], ingredients: [{ nom: 'poulet', quantite: 120, unite: 'g', rayon: 'Boucherie' }], motsCles: ['poulet'] }),
  ];
  assert.deepEqual(recettesCompatibles(pool, { regime: ['vegan'] }).map((r) => r.id), ['vegan']);
});

test('recettesCompatibles : un aliment détesté (hors-famille) est exclu', () => {
  const pool = [R({ id: 'avec', nom: 'Salade de kiwi', motsCles: ['kiwi'], ingredients: [{ nom: 'kiwi', quantite: 1, unite: 'piece', rayon: 'Fruits & légumes' }] }), R({ id: 'sans' })];
  assert.deepEqual(recettesCompatibles(pool, { deteste: ['kiwi'] }).map((r) => r.id), ['sans']);
});
