'use strict';
// Tests d'intégrité de la VRAIE banque de recettes (recipes-v2.js).
// Garantit qu'aucune édition future ne casse la sécurité allergènes/régimes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { RECIPES } = require('../lib/recipes-v2');
const {
  recettesCompatibles, allergenesEffectifs, satisfaitRegime, familiesFromUserAllergies,
} = require('../lib/planGenerator');

test('catalogue : non vide et ids uniques', () => {
  assert.ok(RECIPES.length >= 300, `catalogue trop petit (${RECIPES.length})`);
  const ids = new Set();
  const dup = [];
  RECIPES.forEach((r) => { if (ids.has(r.id)) dup.push(r.id); ids.add(r.id); });
  assert.deepEqual(dup, [], 'ids dupliqués : ' + dup.join(', '));
});

test('catalogue : schéma minimal valide pour chaque recette', () => {
  const types = new Set(['petit-dejeuner', 'collation', 'plat']);
  const mauvaises = RECIPES.filter((r) => !r.id || !r.nom || !types.has(r.type)
    || !Array.isArray(r.ingredients) || !Array.isArray(r.etapes) || !r.etapes.length
    || [r.kcal, r.proteines, r.glucides, r.lipides, r.tempsMinutes].some((n) => typeof n !== 'number'));
  assert.deepEqual(mauvaises.map((r) => r.id), [], 'recettes au schéma invalide');
});

test('INVARIANT SÉCURITÉ : allergènes détectés ⊆ allergènes déclarés (aucun sous-déclaré)', () => {
  const fautifs = [];
  RECIPES.forEach((r) => {
    const decl = new Set(r.allergenes || []);
    const eff = allergenesEffectifs(r);
    for (const a of eff) { if (!decl.has(a)) { fautifs.push(`${r.id} : ${a} détecté mais non déclaré`); break; } }
  });
  assert.deepEqual(fautifs, [], fautifs.join(' | '));
});

test('INVARIANT SÉCURITÉ : chaque régime déclaré est réellement respecté', () => {
  const fautifs = [];
  RECIPES.forEach((r) => {
    (r.regime || []).forEach((rg) => { if (!satisfaitRegime(r, rg)) fautifs.push(`${r.id} : régime "${rg}" contredit`); });
  });
  assert.deepEqual(fautifs, [], fautifs.join(' | '));
});

// Profils durs : aucun ne doit jamais recevoir une recette interdite.
const PROFILS_DURS = [
  { nom: 'vegan + sans-gluten', regime: ['vegan', 'sans-gluten'] },
  { nom: 'allergies gluten+lactose+oeuf', allergies: ['gluten', 'lactose', 'oeuf'] },
  { nom: 'allergies fruits-a-coque+arachide', allergies: ['fruits-a-coque', 'arachide'] },
  { nom: 'allergies poisson+crustaces+mollusques', allergies: ['poisson', 'crustaces', 'mollusques'] },
  { nom: 'vegan+SG+soja+arachide', regime: ['vegan', 'sans-gluten'], allergies: ['soja', 'arachide'] },
  { nom: 'vegetarien + lactose', regime: ['vegetarien'], allergies: ['lactose'] },
];

test('INVARIANT SÉCURITÉ : 0 fuite allergène/régime sur les profils durs', () => {
  const fuites = [];
  for (const pr of PROFILS_DURS) {
    const fams = familiesFromUserAllergies(pr.allergies || []);
    for (const r of recettesCompatibles(RECIPES, pr)) {
      const eff = allergenesEffectifs(r);
      for (const f of fams) { if (eff.has(f)) fuites.push(`${pr.nom} -> ${r.id} contient ${f}`); }
      (pr.regime || []).forEach((rg) => { if (!satisfaitRegime(r, rg)) fuites.push(`${pr.nom} -> ${r.id} viole ${rg}`); });
    }
  }
  assert.deepEqual(fuites, [], fuites.join(' | '));
});

test('couverture : chaque profil dur garde de quoi composer un plan (budget éco)', () => {
  const PD = RECIPES.filter((r) => r.type === 'petit-dejeuner');
  const COL = RECIPES.filter((r) => r.type === 'collation');
  const PLAT = RECIPES.filter((r) => r.type === 'plat');
  // Seuils plancher : assez pour 7 jours sans répétition lourde.
  const SEUIL = { pd: 5, col: 5, plat: 12 };
  const trous = [];
  for (const pr of PROFILS_DURS) {
    const p = { ...pr, budget: 'eco' };
    const nPD = recettesCompatibles(PD, p).length;
    const nCOL = recettesCompatibles(COL, p).length;
    const nPLAT = recettesCompatibles(PLAT, p).length;
    if (nPD < SEUIL.pd) trous.push(`${pr.nom} : ${nPD} petits-déj (<${SEUIL.pd})`);
    if (nCOL < SEUIL.col) trous.push(`${pr.nom} : ${nCOL} collations (<${SEUIL.col})`);
    if (nPLAT < SEUIL.plat) trous.push(`${pr.nom} : ${nPLAT} plats (<${SEUIL.plat})`);
  }
  assert.deepEqual(trous, [], trous.join(' | '));
});
