'use strict';
// Tests des calculs nutritionnels + génération de plan bout-en-bout (sécurité).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calculerBesoins } = require('../lib/nutrition');
const { genererPlanDemo, allergenesEffectifs, satisfaitRegime, familiesFromUserAllergies } = require('../lib/planGenerator');
const { RECIPES } = require('../lib/recipes-v2');
// Les recettes du plan sont "formatées" (sans regime/allergenes) -> on retrouve la
// recette BRUTE du catalogue par id pour vérifier les contraintes de sécurité.
const PAR_ID = new Map(RECIPES.map((r) => [r.id, r]));

test('calculerBesoins : maintien -> kcalCible cohérent et macros présentes', () => {
  const b = calculerBesoins({ sexe: 'femme', age: 30, taille_cm: 165, poids_kg: 70, objectif: 'maintien' });
  assert.ok(b.kcalCible > 1000 && b.kcalCible < 4000, 'kcalCible dans une plage réaliste');
  assert.ok(Math.abs(b.kcalCible - b.maintenance) <= 50, 'maintien ≈ maintenance');
  assert.ok(b.macros && ['proteines', 'glucides', 'lipides'].every((k) => typeof b.macros[k] === 'number'), 'macros présentes');
  // Cohérence Atwater approximative (tolérance large).
  const calc = b.macros.proteines * 4 + b.macros.glucides * 4 + b.macros.lipides * 9;
  assert.ok(Math.abs(calc - b.kcalCible) < 200, `macros ~ kcalCible (calc ${calc} vs ${b.kcalCible})`);
});

test('calculerBesoins : challenge applique un déficit et respecte les planchers', () => {
  const f = calculerBesoins({ sexe: 'femme', age: 30, taille_cm: 165, poids_kg: 84, objectif: 'challenge', perte_objectif_kg: 6, deficit_cible: 650 });
  assert.ok(f.kcalCible < f.maintenance, 'challenge = déficit (kcalCible < maintenance)');
  assert.ok(f.kcalCible >= 1350, 'plancher femme 1350 respecté');
  assert.equal(f.poidsCible, 78, 'poids cible = poids - perte (84-6)');
  const h = calculerBesoins({ sexe: 'homme', age: 30, taille_cm: 180, poids_kg: 95, objectif: 'challenge', perte_objectif_kg: 6, deficit_cible: 750 });
  assert.ok(h.kcalCible >= 1650, 'plancher homme 1650 respecté');
});

test('calculerBesoins : la cible DÉCROÎT quand le poids baisse (jamais d\'inversion)', () => {
  const base = { sexe: 'femme', age: 40, taille_cm: 165, objectif: 'challenge', activite: 'modere', perte_objectif_kg: 6 };
  let prev = Infinity;
  for (const poids of [100, 99, 98, 97, 96]) {
    const b = calculerBesoins({ ...base, poids_kg: poids });
    assert.ok(b.kcalCible <= prev, `baisser le poids ne doit jamais monter la cible (${poids}kg -> ${b.kcalCible} > ${prev})`);
    prev = b.kcalCible;
  }
});

test('calculerBesoins : ajustementKcal (suivi pesée) ne remonte plus la cible', () => {
  // Regression : un ajustement positif (ex-règle « perte rapide -> +125 ») faisait
  // remonter la cible et inversait le sens. La cible ne dépend QUE du profil actuel.
  const base = { sexe: 'femme', age: 40, taille_cm: 165, objectif: 'challenge', poids_kg: 90 };
  const sans = calculerBesoins({ ...base });
  const avecPlus = calculerBesoins({ ...base, ajustementKcal: 400 });
  const avecMoins = calculerBesoins({ ...base, ajustementKcal: -400 });
  assert.equal(avecPlus.kcalCible, sans.kcalCible, 'un ajustement positif ne change pas la cible');
  assert.equal(avecMoins.kcalCible, sans.kcalCible, 'un ajustement négatif non plus');
});

// Génération bout-en-bout : aucun plan généré ne doit contenir un aliment interdit.
const PROFILS = [
  { profil: { sexe: 'femme', age: 30, taille_cm: 165, poids_kg: 70, objectif: 'perte' }, prefs: { regime: ['vegan', 'sans-gluten'], allergies: [] } },
  { profil: { sexe: 'homme', age: 40, taille_cm: 178, poids_kg: 82, objectif: 'maintien' }, prefs: { regime: [], allergies: ['gluten', 'lactose', 'oeuf'] } },
  { profil: { sexe: 'femme', age: 35, taille_cm: 168, poids_kg: 75, objectif: 'muscle' }, prefs: { regime: ['vegetarien'], allergies: ['fruits-a-coque', 'arachide'] } },
  { profil: { sexe: 'homme', age: 28, taille_cm: 182, poids_kg: 90, objectif: 'challenge', perte_objectif_kg: 6 }, prefs: { regime: [], allergies: ['poisson', 'crustaces', 'mollusques'] } },
];

test('genererPlanDemo : aucun plan ne contient un allergène/régime interdit (bout-en-bout)', () => {
  const fuites = [];
  PROFILS.forEach(({ profil, prefs }, i) => {
    const fams = familiesFromUserAllergies(prefs.allergies || []);
    const plan = genererPlanDemo(profil, prefs, 1000 + i);
    assert.ok(plan && Array.isArray(plan.jours) && plan.jours.length, `profil ${i} : plan généré`);
    plan.jours.forEach((j) => (j.repas || []).forEach((rp) => {
      if (!rp.recette) return;
      const r = PAR_ID.get(rp.recette.id); // recette brute (avec regime/allergenes)
      if (!r) { fuites.push(`profil ${i} : recette inconnue du catalogue (${rp.recette.id})`); return; }
      const eff = allergenesEffectifs(r);
      for (const f of fams) { if (eff.has(f)) fuites.push(`profil ${i} : ${r.id} contient ${f}`); }
      (prefs.regime || []).forEach((rg) => { if (!satisfaitRegime(r, rg)) fuites.push(`profil ${i} : ${r.id} viole ${rg}`); });
    }));
  });
  assert.deepEqual(fuites, [], fuites.join(' | '));
});

test('genererPlanDemo : déterministe à seed égal', () => {
  const profil = { sexe: 'femme', age: 30, taille_cm: 165, poids_kg: 70, objectif: 'maintien' };
  const ids = (p) => p.jours.flatMap((j) => (j.repas || []).map((rp) => rp.recette && rp.recette.id));
  assert.deepEqual(ids(genererPlanDemo(profil, {}, 42)), ids(genererPlanDemo(profil, {}, 42)), 'même seed -> même plan');
});
