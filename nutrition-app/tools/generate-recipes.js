#!/usr/bin/env node
// generate-recipes.js
// Genere des recettes supplementaires via Claude, au FORMAT EXACT de recipes.js,
// les valide, dedoublonne, attribue des ids, et les ajoute a lib/recipes.js.
// A lancer une fois pour faire grossir la banque (puis recuperer les photos
// avec tools/fetch-photos.js).
//
// Prerequis : .env avec ANTHROPIC_API_KEY (et le SDK @anthropic-ai/sdk installe).
//
// Usage :
//   node tools/generate-recipes.js --count 60          # ajoute ~60 recettes
//   node tools/generate-recipes.js --count 12 --dry     # apercu sans ecrire
//   node tools/generate-recipes.js --count 200 --per 8  # 8 recettes par appel

const fs = require('fs');
const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch (_) {}

const { RECIPES } = require('../lib/recipes');

const arg = (name, def) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : def; };
const COUNT = Number(arg('--count', 40));
const PER = Math.min(Math.max(Number(arg('--per', 6)), 1), 10);
const DRY = process.argv.includes('--dry');

let Anthropic;
try { Anthropic = require('@anthropic-ai/sdk'); } catch (_) {
  console.error('\n  @anthropic-ai/sdk manquant. Lancez : npm install @anthropic-ai/sdk dotenv\n'); process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('\n  ANTHROPIC_API_KEY absente (renseignez nutrition-app/.env).\n'); process.exit(1);
}
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

const ALLERGENES = ['gluten', 'lactose', 'oeuf', 'arachide', 'fruits-a-coque', 'poisson', 'crustaces', 'soja', 'sesame'];
const REGIMES = ['vegetarien', 'vegan', 'sans-porc', 'sans-gluten'];
const RAYONS = ['Fruits & legumes', 'Boucherie', 'Poissonnerie', 'Cremerie', 'Boulangerie', 'Epicerie', 'Surgeles', 'Rayon frais', 'Rayon vegetal'];

// Matrice de "briefs" : on tourne dessus pour maximiser la variete.
const BRIEFS = [
  { type: 'petit-dejeuner', theme: 'sucre equilibre (avoine, fruits, laitages)', cuisine: 'francaise' },
  { type: 'petit-dejeuner', theme: 'sale proteine (oeufs, avocat, pain complet)', cuisine: 'americaine' },
  { type: 'petit-dejeuner', theme: 'rapide a emporter (moins de 5 min)', cuisine: 'francaise' },
  { type: 'petit-dejeuner', theme: 'mediterraneen (yaourt, miel, fruits, noix)', cuisine: 'mediterraneenne' },
  { type: 'plat', theme: 'poulet ou dinde, perte de poids', cuisine: 'mediterraneenne' },
  { type: 'plat', theme: 'poulet, saveurs du monde', cuisine: 'asiatique' },
  { type: 'plat', theme: 'boeuf maigre, equilibre', cuisine: 'francaise' },
  { type: 'plat', theme: 'poisson ou fruits de mer', cuisine: 'mediterraneenne' },
  { type: 'plat', theme: 'vegetarien riche en proteines (legumineuses, tofu, oeufs)', cuisine: 'vegetale' },
  { type: 'plat', theme: 'italien leger (pates, risotto, legumes)', cuisine: 'italienne' },
  { type: 'plat', theme: 'plat complet rapide (moins de 20 min)', cuisine: 'francaise' },
  { type: 'plat', theme: 'mexicain ou tex-mex equilibre', cuisine: 'mexicaine' },
  { type: 'plat', theme: 'curry / plat indien', cuisine: 'indienne' },
  { type: 'collation', theme: 'collation proteinee saine', cuisine: 'francaise' },
  { type: 'collation', theme: 'dessert sain et gourmand (controle)', cuisine: 'francaise' },
];

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}
function slug(s) {
  return norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

const existingIds = new Set(RECIPES.map((r) => r.id));
const existingNoms = new Set(RECIPES.map((r) => norm(r.nom)));

function prefixe(type) { return type === 'petit-dejeuner' ? 'pd' : (type === 'collation' ? 'col' : 'plat'); }
function nouvelId(type, nom) {
  let base = prefixe(type) + '-' + slug(nom);
  let id = base, n = 2;
  while (existingIds.has(id)) { id = base + '-' + n++; }
  existingIds.add(id);
  return id;
}

function valide(r, type) {
  if (!r || typeof r.nom !== 'string' || r.nom.length < 3) return null;
  if (existingNoms.has(norm(r.nom))) return null; // doublon
  const nums = ['kcal', 'proteines', 'glucides', 'lipides', 'tempsMinutes'];
  if (!nums.every((k) => typeof r[k] === 'number' && r[k] >= 0)) return null;
  if (!Array.isArray(r.ingredients) || r.ingredients.length < 2) return null;
  if (!Array.isArray(r.etapes) || r.etapes.length < 3) return null;
  const ingredients = r.ingredients.filter((i) => i && typeof i.nom === 'string' && typeof i.quantite === 'number').map((i) => ({
    nom: i.nom, quantite: i.quantite, unite: String(i.unite || 'g'),
    rayon: RAYONS.includes(i.rayon) ? i.rayon : 'Epicerie',
  }));
  if (ingredients.length < 2) return null;
  const clean = {
    id: nouvelId(type, r.nom),
    nom: r.nom.trim(),
    type,
    cuisines: Array.isArray(r.cuisines) && r.cuisines.length ? r.cuisines.map(norm) : ['francaise'],
    regime: (Array.isArray(r.regime) ? r.regime : []).map(norm).filter((x) => REGIMES.includes(x)),
    budget: r.budget === 'normal' ? 'normal' : 'eco',
    allergenes: (Array.isArray(r.allergenes) ? r.allergenes : []).map(norm).filter((x) => ALLERGENES.includes(x)),
    motsCles: (Array.isArray(r.motsCles) ? r.motsCles : []).map((m) => String(m).toLowerCase()).slice(0, 8),
    kcal: Math.round(r.kcal), proteines: Math.round(r.proteines), glucides: Math.round(r.glucides), lipides: Math.round(r.lipides),
    tempsMinutes: Math.round(r.tempsMinutes),
    ingredients,
    etapes: r.etapes.map((s) => String(s)),
  };
  // tout plat carne doit au moins etre sans-porc si non precise (securite)
  existingNoms.add(norm(clean.nom));
  return clean;
}

function prompt(brief, k, evite) {
  return `Tu generes des recettes pour une app de nutrition francophone. Genere ${k} recettes de type "${brief.type}" DIFFERENTES, cuisine ${brief.cuisine}, theme : ${brief.theme}.
Reponds UNIQUEMENT avec un TABLEAU JSON valide (aucun texte autour), chaque element au format EXACT :
{
  "nom": "string court en francais",
  "cuisines": ["${brief.cuisine}"],
  "regime": [],
  "budget": "eco" | "normal",
  "allergenes": [],
  "motsCles": ["aliments principaux"],
  "kcal": 0, "proteines": 0, "glucides": 0, "lipides": 0,
  "tempsMinutes": 0,
  "ingredients": [{"nom":"string","quantite":0,"unite":"g|ml|piece|c. a soupe|c. a cafe|gousse","rayon":"un de: ${RAYONS.join(' / ')}"}],
  "etapes": ["4 a 6 etapes detaillees, debutant : feu (doux/moyen/vif), temps en minutes, repere visuel"]
}
Regles imperatives :
- Quantites des ingredients pour 1 portion. Macros realistes par portion.
- "regime" : liste TOUS les regimes compatibles parmi ${REGIMES.join(', ')} (sans-porc sur tout plat sans porc ; vegetarien/vegan/sans-porc sur un plat vegetal ; sans-gluten si reellement sans gluten).
- "allergenes" : familles REELLEMENT presentes parmi ${ALLERGENES.join(', ')}.
- Pas de doublon avec ces noms deja utilises : ${evite.slice(0, 40).join(' ; ')}.
- Francais, noms appetissants, etapes claires.`;
}

function extraireTableau(texte) {
  const t = String(texte).replace(/```json/gi, '').replace(/```/g, '');
  const a = t.indexOf('['); const b = t.lastIndexOf(']');
  if (a === -1 || b === -1) throw new Error('Pas de tableau JSON');
  let s = t.slice(a, b + 1);
  try { return JSON.parse(s); } catch (_) {
    s = s.replace(/,\s*([\]}])/g, '$1'); // tolere les virgules trainantes
    return JSON.parse(s);
  }
}

async function genererBrief(brief, k) {
  const evite = [...existingNoms];
  const msg = await client.messages.create({
    model: MODEL, max_tokens: 4000,
    messages: [{ role: 'user', content: prompt(brief, k, evite) }],
  });
  const texte = (msg.content || []).map((b) => b.text || '').join('');
  const arr = extraireTableau(texte);
  return arr.map((r) => valide(r, brief.type)).filter(Boolean);
}

// Serialise une recette en litteral JS lisible (valide pour recipes.js).
function serialiser(r) {
  return JSON.stringify(r, null, 2).replace(/^/gm, '  ');
}

// Ecrit un lot DANS recipes.js immediatement (incrementiel : un arret ne perd rien).
function ajouterAuFichier(lot) {
  if (!lot.length) return;
  const file = path.join(__dirname, '..', 'lib', 'recipes.js');
  const src = fs.readFileSync(file, 'utf8');
  const marker = src.lastIndexOf('];');
  if (marker === -1) throw new Error('Marqueur "];" introuvable dans recipes.js');
  const bloc = `\n  // ---- Recettes IA (ajout du ${new Date().toISOString().slice(0, 10)}) ----\n`
    + lot.map(serialiser).join(',\n') + ',\n';
  fs.writeFileSync(file, src.slice(0, marker) + bloc + src.slice(marker));
}

(async () => {
  // Astuce cout : pour des recettes beaucoup moins cheres, mettez dans .env
  //   ANTHROPIC_MODEL=claude-haiku-4-5-20251001
  console.log(`\n  Generation : objectif ~${COUNT} recettes, ${PER}/appel, modele ${MODEL}${DRY ? ' (DRY-RUN)' : ''}.`);
  console.log('  (Ecriture incrementielle : chaque lot est sauvegarde aussitot.)\n');
  let total = 0, bi = 0;
  while (total < COUNT) {
    const brief = BRIEFS[bi % BRIEFS.length]; bi++;
    if (bi > BRIEFS.length * 6) { console.log('  (plus assez de nouveautes, arret)'); break; }
    try {
      const lot = (await genererBrief(brief, PER)).slice(0, COUNT - total);
      if (!DRY) ajouterAuFichier(lot);
      total += lot.length;
      console.log(`  +${lot.length} (${brief.type} / ${brief.cuisine})${DRY ? ' [dry]' : ' [sauvegarde]'} -> total ${total}/${COUNT}`);
    } catch (e) {
      console.log(`  ! ${brief.type}/${brief.cuisine} : ${e.message}`);
      if (/401/.test(e.message)) { console.log('  Cle invalide, arret.'); break; }
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log(`\n  Termine : ${total} recettes ajoutees${DRY ? ' (DRY, rien ecrit)' : ' a lib/recipes.js'}.`);
  if (!DRY && total) console.log('  Ensuite : node tools/fetch-photos.js pour les photos.\n');
})();
