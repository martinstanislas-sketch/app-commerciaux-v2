// valider-recettes.js
// Controle qualite des recettes AVANT de les ajouter au catalogue.
// Reutilise les MEMES detecteurs que les filtres de l'app (planGenerator) :
// si une recette passe ce validateur, l'app la traitera correctement
// (allergenes, regimes, macros, liste de courses).
//
// Usage :
//   node tools/valider-recettes.js                 -> valide lib/recipes.js
//   node tools/valider-recettes.js lib/recipes-v2.js
//   node tools/valider-recettes.js --strict        -> les avertissements deviennent bloquants
//
// Sortie : rapport lisible + code de sortie 1 si au moins une ERREUR (utile en CI).

const path = require('path');
const { allergenesEffectifs, regimeContredit, norm } = require('../lib/planGenerator');

// ---- Reference (enums acceptes) -------------------------------------------
const TYPES = ['petit-dejeuner', 'plat', 'collation'];
const BUDGETS = ['eco', 'normal'];
const GOUTS = ['sucre', 'sale']; // facultatif (catalogue v2)
const OBJECTIFS = ['perte', 'maintien', 'muscle', 'energie'];
const REGIMES = ['vegetarien', 'vegan', 'sans-porc', 'sans-gluten', 'sans-lactose'];
const ALLERGENES = ['gluten', 'lactose', 'oeuf', 'arachide', 'fruits-a-coque', 'poisson', 'crustaces', 'soja', 'sesame'];
const UNITES = ['g', 'ml', 'piece', 'c. a cafe', 'c. a soupe', 'gousse', 'pincee', 'tranche', 'poignee'];
const RAYONS = ['Fruits & legumes', 'Boucherie', 'Poissonnerie', 'Cremerie', 'Boulangerie', 'Epicerie', 'Surgeles', 'Rayon frais', 'Rayon vegetal'];
// Comparaison insensible aux accents/casse (ex. "Épicerie" == "Epicerie").
const UNITES_N = new Set(UNITES.map(norm));
const RAYONS_N = new Set(RAYONS.map(norm));

// ---- Regles ----------------------------------------------------------------
// Valide UNE recette. Renvoie { erreurs:[], avertissements:[] }.
// idsVus : Set des ids deja rencontres (pour detecter les doublons).
function validerRecette(r, idsVus) {
  const E = []; // erreurs bloquantes
  const W = []; // avertissements
  const id = r && r.id ? r.id : '(sans id)';

  // 1) Champs obligatoires & types
  if (!r.id || typeof r.id !== 'string') E.push('id manquant ou invalide');
  else if (idsVus && idsVus.has(r.id)) E.push(`id en doublon : "${r.id}"`);
  if (!r.nom || typeof r.nom !== 'string') E.push('nom manquant');
  if (!TYPES.includes(r.type)) E.push(`type invalide : "${r.type}" (attendu : ${TYPES.join(' | ')})`);
  if (!BUDGETS.includes(r.budget)) E.push(`budget invalide : "${r.budget}" (attendu : ${BUDGETS.join(' | ')})`);

  for (const k of ['kcal', 'proteines', 'glucides', 'lipides']) {
    if (typeof r[k] !== 'number' || !(r[k] >= 0)) E.push(`${k} doit etre un nombre >= 0`);
  }
  if (typeof r.tempsMinutes !== 'number' || r.tempsMinutes <= 0) W.push('tempsMinutes manquant ou <= 0');
  if (!Array.isArray(r.cuisines) || r.cuisines.length === 0) W.push('cuisines vide (recommande pour le matching gouts)');
  if (!Array.isArray(r.motsCles) || r.motsCles.length === 0) W.push('motsCles vide (recommande pour le filtrage aime/deteste)');
  if (!Array.isArray(r.ingredients) || r.ingredients.length === 0) E.push('ingredients vide');
  if (!Array.isArray(r.etapes) || r.etapes.length === 0) E.push('etapes vide');
  if (!Array.isArray(r.regime)) W.push('regime absent (mets au moins ["sans-porc"] si applicable)');
  if (!Array.isArray(r.allergenes)) E.push('allergenes absent (mets [] si aucun, jamais omettre)');

  // 2) Ingredients bien formes
  (r.ingredients || []).forEach((i, idx) => {
    const pre = `ingredient #${idx + 1}`;
    if (!i || typeof i.nom !== 'string' || !i.nom.trim()) E.push(`${pre} : nom manquant`);
    if (typeof i.quantite !== 'number' || !(i.quantite > 0)) W.push(`${pre} ("${i && i.nom}") : quantite manquante ou <= 0`);
    if (!i || !UNITES_N.has(norm(i.unite))) W.push(`${pre} ("${i && i.nom}") : unite inhabituelle "${i && i.unite}"`);
    if (!i || !RAYONS_N.has(norm(i.rayon))) W.push(`${pre} ("${i && i.nom}") : rayon inhabituel "${i && i.rayon}"`);
  });

  // 3) Enums regimes / allergenes / gout / objectifs
  (r.regime || []).forEach((x) => { if (!REGIMES.includes(x)) W.push(`regime inconnu : "${x}"`); });
  (r.allergenes || []).forEach((x) => { if (!ALLERGENES.includes(x)) W.push(`allergene inconnu : "${x}"`); });
  if (r.gout !== undefined && !GOUTS.includes(r.gout)) W.push(`gout invalide : "${r.gout}"`);
  (r.objectifs || []).forEach((x) => { if (!OBJECTIFS.includes(x)) W.push(`objectif inconnu : "${x}"`); });

  // 4) SECURITE ALLERGENES : un allergene present dans les ingredients DOIT etre declare.
  //    On compare les allergenes DETECTES (sans tenir compte des declares) aux declares.
  const declares = new Set(r.allergenes || []);
  const detectes = allergenesEffectifs({ ...r, allergenes: [] }); // pur "detecte"
  const manquants = [...detectes].filter((a) => !declares.has(a));
  if (manquants.length) {
    E.push(`allergene(s) detecte(s) dans les ingredients mais NON declare(s) : ${manquants.join(', ')} -> ajoute-les a "allergenes" (ou corrige l'ingredient)`);
  }

  // 5) COHERENCE REGIME : un regime declare ne doit pas etre contredit par un ingredient.
  (r.regime || []).forEach((reg) => {
    if (REGIMES.includes(reg) && regimeContredit(r, reg)) {
      E.push(`regime "${reg}" declare mais CONTREDIT par un ingredient (ex. viande/poisson/gluten selon le regime)`);
    }
  });

  // 6) COHERENCE MACROS : kcal ≈ 4*prot + 4*gluc + 9*lip.
  if (typeof r.kcal === 'number' && r.kcal > 0) {
    const calc = 4 * (r.proteines || 0) + 4 * (r.glucides || 0) + 9 * (r.lipides || 0);
    const ecart = Math.abs(calc - r.kcal) / r.kcal;
    if (ecart > 0.30) E.push(`macros incoherentes : kcal declare ${r.kcal}, calcule ${Math.round(calc)} (ecart ${Math.round(ecart * 100)}%)`);
    else if (ecart > 0.15) W.push(`macros a verifier : kcal declare ${r.kcal}, calcule ${Math.round(calc)} (ecart ${Math.round(ecart * 100)}%)`);
  }

  return { id, nom: r && r.nom, erreurs: E, avertissements: W };
}

// Valide tout un tableau de recettes.
function validerCatalogue(recettes) {
  const idsVus = new Set();
  const resultats = recettes.map((r) => {
    const res = validerRecette(r, idsVus);
    if (r && r.id) idsVus.add(r.id);
    return res;
  });
  return resultats;
}

module.exports = { validerRecette, validerCatalogue, TYPES, BUDGETS, REGIMES, ALLERGENES, UNITES, RAYONS };

// ---- Execution en ligne de commande ---------------------------------------
if (require.main === module) {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict');
  const file = args.find((a) => !a.startsWith('--')) || 'lib/recipes.js';
  const abs = path.resolve(process.cwd(), file);
  const { RECIPES } = require(abs);

  const resultats = validerCatalogue(RECIPES);
  let nbErr = 0, nbWarn = 0;
  const C = { red: '\x1b[31m', yel: '\x1b[33m', grn: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' };

  resultats.forEach((res) => {
    if (!res.erreurs.length && !res.avertissements.length) return;
    const tag = res.erreurs.length ? `${C.red}ERREUR${C.off}` : `${C.yel}AVERTISSEMENT${C.off}`;
    console.log(`\n[${tag}] ${res.id} — ${res.nom}`);
    res.erreurs.forEach((e) => { console.log(`   ${C.red}x${C.off} ${e}`); nbErr++; });
    res.avertissements.forEach((w) => { console.log(`   ${C.yel}!${C.off} ${w}`); nbWarn++; });
  });

  console.log(`\n${C.dim}------------------------------------------------------------${C.off}`);
  console.log(`Fichier : ${file}  |  ${RECIPES.length} recettes`);
  console.log(`${nbErr ? C.red : C.grn}Erreurs : ${nbErr}${C.off}   ${C.yel}Avertissements : ${nbWarn}${C.off}`);
  const bloque = nbErr > 0 || (strict && nbWarn > 0);
  console.log(bloque ? `${C.red}=> NON valide${C.off}` : `${C.grn}=> Catalogue valide${C.off}`);
  process.exit(bloque ? 1 : 0);
}
