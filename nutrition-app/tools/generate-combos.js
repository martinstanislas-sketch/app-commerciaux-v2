#!/usr/bin/env node
// generate-combos.js
// Genere des "bowls / assiettes composees" en combinant des briques
// (proteine x base x legume x sauce). 100% hors-ligne, GRATUIT (aucune API).
// Macros additionnees, regimes/allergenes deduits, etapes coherentes.
// Ajoute les recettes valides et uniques a lib/recipes.js.
//
// Usage :
//   node tools/generate-combos.js --count 200      # ajoute ~200 bowls
//   node tools/generate-combos.js --count 12 --dry  # apercu sans ecrire
// Puis : node tools/fetch-photos.js (pour les photos).

const fs = require('fs');
const path = require('path');
const { RECIPES } = require('../lib/recipes');

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const COUNT = Number(arg('--count', 200));
const DRY = process.argv.includes('--dry');

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
function slug(s) { return norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 44); }

// Brique = { label, ing:{nom,quantite,unite,rayon}, kcal,p,g,l, allerg:[], veg, vegan, gluten, cook, kw, cuisine? }
const PROTEINES = [
  { label: 'poulet', ing: { nom: 'Filet de poulet', quantite: 130, unite: 'g', rayon: 'Boucherie' }, kcal: 200, p: 38, g: 0, l: 5, allerg: [], veg: false, vegan: false, gluten: false, cook: 'Couper le filet de poulet en des et le poeler 6 a 7 minutes a feu moyen-vif, jusqu\'a ce qu\'il soit dore et cuit a coeur.', kw: 'poulet' },
  { label: 'dinde', ing: { nom: 'Escalope de dinde', quantite: 130, unite: 'g', rayon: 'Boucherie' }, kcal: 160, p: 34, g: 0, l: 3, allerg: [], veg: false, vegan: false, gluten: false, cook: 'Poeler l\'escalope de dinde 4 minutes par face, puis l\'emincer.', kw: 'dinde' },
  { label: 'boeuf', ing: { nom: 'Boeuf hache 5%', quantite: 120, unite: 'g', rayon: 'Boucherie' }, kcal: 180, p: 30, g: 0, l: 7, allerg: [], veg: false, vegan: false, gluten: false, cook: 'Saisir le boeuf hache 5 minutes a feu vif en l\'emiettant ; assaisonner.', kw: 'boeuf' },
  { label: 'saumon', ing: { nom: 'Pave de saumon', quantite: 130, unite: 'g', rayon: 'Poissonnerie' }, kcal: 250, p: 32, g: 0, l: 14, allerg: ['poisson'], veg: false, vegan: false, gluten: false, cook: 'Poeler le saumon 4 minutes cote peau puis 2 a 3 minutes de l\'autre cote.', kw: 'saumon', budget: 'normal' },
  { label: 'cabillaud', ing: { nom: 'Dos de cabillaud', quantite: 140, unite: 'g', rayon: 'Poissonnerie' }, kcal: 110, p: 28, g: 0, l: 1, allerg: ['poisson'], veg: false, vegan: false, gluten: false, cook: 'Cuire le cabillaud 4 minutes par face a feu moyen (la chair s\'effeuille).', kw: 'cabillaud', budget: 'normal' },
  { label: 'thon', ing: { nom: 'Thon au naturel', quantite: 100, unite: 'g', rayon: 'Epicerie' }, kcal: 110, p: 26, g: 0, l: 1, allerg: ['poisson'], veg: false, vegan: false, gluten: false, cook: 'Egoutter le thon et l\'emietter.', kw: 'thon' },
  { label: 'crevettes', ing: { nom: 'Crevettes decortiquees', quantite: 120, unite: 'g', rayon: 'Poissonnerie' }, kcal: 100, p: 22, g: 0, l: 1, allerg: ['crustaces'], veg: false, vegan: false, gluten: false, cook: 'Saisir les crevettes 2 a 3 minutes a feu vif jusqu\'a ce qu\'elles soient roses.', kw: 'crevette', budget: 'normal' },
  { label: 'oeufs', ing: { nom: 'Oeufs', quantite: 2, unite: 'piece', rayon: 'Cremerie' }, kcal: 150, p: 13, g: 1, l: 10, allerg: ['oeuf'], veg: true, vegan: false, gluten: false, cook: 'Cuire les 2 oeufs (au plat ou durs, 9 minutes).', kw: 'oeuf' },
  { label: 'tofu', ing: { nom: 'Tofu ferme', quantite: 150, unite: 'g', rayon: 'Rayon vegetal' }, kcal: 180, p: 18, g: 4, l: 11, allerg: ['soja'], veg: true, vegan: true, gluten: false, cook: 'Eponger le tofu, le couper en des et le dorer 6 minutes en le retournant.', kw: 'tofu' },
  { label: 'pois chiches', ing: { nom: 'Pois chiches cuits', quantite: 150, unite: 'g', rayon: 'Epicerie' }, kcal: 230, p: 12, g: 35, l: 4, allerg: [], veg: true, vegan: true, gluten: false, cook: 'Rincer et rechauffer les pois chiches 3 minutes avec une pincee d\'epices.', kw: 'pois chiche' },
  { label: 'lentilles', ing: { nom: 'Lentilles cuites', quantite: 150, unite: 'g', rayon: 'Epicerie' }, kcal: 175, p: 12, g: 30, l: 1, allerg: [], veg: true, vegan: true, gluten: false, cook: 'Rincer et rechauffer les lentilles 3 minutes.', kw: 'lentille' },
  { label: 'feta', ing: { nom: 'Feta', quantite: 50, unite: 'g', rayon: 'Cremerie' }, kcal: 130, p: 7, g: 1, l: 11, allerg: ['lactose'], veg: true, vegan: false, gluten: false, cook: 'Emietter la feta sur le plat.', kw: 'feta', budget: 'normal' },
];

const BASES = [
  { label: 'riz', ing: { nom: 'Riz', quantite: 60, unite: 'g', rayon: 'Epicerie' }, kcal: 215, p: 4, g: 47, l: 1, gluten: false, cook: 'Cuire le riz dans l\'eau bouillante salee selon le paquet, puis l\'egoutter.', kw: 'riz' },
  { label: 'quinoa', ing: { nom: 'Quinoa', quantite: 60, unite: 'g', rayon: 'Epicerie' }, kcal: 220, p: 8, g: 39, l: 4, gluten: false, cook: 'Cuire le quinoa 12 a 14 minutes dans 2 volumes d\'eau salee.', kw: 'quinoa' },
  { label: 'semoule', ing: { nom: 'Semoule', quantite: 60, unite: 'g', rayon: 'Epicerie' }, kcal: 215, p: 7, g: 44, l: 1, gluten: true, cook: 'Couvrir la semoule d\'eau bouillante salee a hauteur, laisser gonfler 5 minutes et l\'aerer.', kw: 'semoule' },
  { label: 'pates completes', ing: { nom: 'Pates completes', quantite: 80, unite: 'g', rayon: 'Epicerie' }, kcal: 280, p: 11, g: 56, l: 2, gluten: true, cook: 'Cuire les pates completes al dente dans l\'eau bouillante salee.', kw: 'pates' },
  { label: 'patate douce', ing: { nom: 'Patate douce', quantite: 200, unite: 'g', rayon: 'Fruits & legumes' }, kcal: 180, p: 3, g: 42, l: 0, gluten: false, cook: 'Couper la patate douce en des et la rotir 20 a 25 minutes au four a 200 C.', kw: 'patate douce' },
  { label: 'boulgour', ing: { nom: 'Boulgour', quantite: 60, unite: 'g', rayon: 'Epicerie' }, kcal: 210, p: 7, g: 44, l: 1, gluten: true, cook: 'Cuire le boulgour 12 minutes dans l\'eau salee, puis l\'egoutter.', kw: 'boulgour' },
  { label: 'pommes de terre', ing: { nom: 'Pomme de terre', quantite: 200, unite: 'g', rayon: 'Fruits & legumes' }, kcal: 160, p: 4, g: 36, l: 0, gluten: false, cook: 'Cuire les pommes de terre 18 minutes a l\'eau salee.', kw: 'pomme de terre' },
];

const LEGUMES = [
  { label: 'brocoli', ing: { nom: 'Brocoli', quantite: 150, unite: 'g', rayon: 'Fruits & legumes' }, kcal: 50, p: 4, g: 7, l: 1, cook: 'Cuire le brocoli 7 minutes a la vapeur (il reste croquant).', kw: 'brocoli' },
  { label: 'courgette', ing: { nom: 'Courgette', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' }, kcal: 35, p: 2, g: 6, l: 0, cook: 'Poeler la courgette en rondelles 5 a 6 minutes.', kw: 'courgette' },
  { label: 'poivrons', ing: { nom: 'Poivron', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' }, kcal: 35, p: 1, g: 7, l: 0, cook: 'Faire revenir le poivron emince 4 a 5 minutes.', kw: 'poivron' },
  { label: 'epinards', ing: { nom: 'Epinards frais', quantite: 80, unite: 'g', rayon: 'Fruits & legumes' }, kcal: 25, p: 3, g: 2, l: 0, cook: 'Faire tomber les epinards 2 minutes a la poele.', kw: 'epinard' },
  { label: 'haricots verts', ing: { nom: 'Haricots verts', quantite: 150, unite: 'g', rayon: 'Surgeles' }, kcal: 45, p: 3, g: 8, l: 0, cook: 'Cuire les haricots verts 8 a 10 minutes.', kw: 'haricot' },
  { label: 'tomates cerises', ing: { nom: 'Tomates cerises', quantite: 100, unite: 'g', rayon: 'Fruits & legumes' }, kcal: 25, p: 1, g: 5, l: 0, cook: 'Couper les tomates cerises en deux.', kw: 'tomate' },
  { label: 'champignons', ing: { nom: 'Champignons de Paris', quantite: 120, unite: 'g', rayon: 'Fruits & legumes' }, kcal: 30, p: 3, g: 3, l: 0, cook: 'Poeler les champignons eminces 5 minutes a feu vif.', kw: 'champignon' },
  { label: 'carottes', ing: { nom: 'Carotte', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' }, kcal: 40, p: 1, g: 9, l: 0, cook: 'Rapper ou cuire la carotte en rondelles.', kw: 'carotte' },
  { label: 'salade', ing: { nom: 'Salade verte', quantite: 60, unite: 'g', rayon: 'Fruits & legumes' }, kcal: 15, p: 1, g: 2, l: 0, cook: 'Laver la salade et la couper.', kw: 'salade' },
];

const SAUCES = [
  { label: 'huile d\'olive & citron', ing: { nom: 'Huile d\'olive', quantite: 1, unite: 'c. a soupe', rayon: 'Epicerie' }, kcal: 90, p: 0, g: 0, l: 10, allerg: [], vegan: true, gluten: false, cuisine: 'mediterraneenne', text: 'Assaisonner d\'huile d\'olive, de jus de citron, de sel et de poivre.' },
  { label: 'sauce soja & sesame', ing: { nom: 'Sauce soja', quantite: 2, unite: 'c. a soupe', rayon: 'Epicerie' }, kcal: 35, p: 2, g: 4, l: 1, allerg: ['soja', 'gluten', 'sesame'], vegan: true, gluten: true, cuisine: 'asiatique', text: 'Napper de sauce soja et parsemer de graines de sesame.' },
  { label: 'curry coco', ing: { nom: 'Lait de coco', quantite: 60, unite: 'ml', rayon: 'Epicerie' }, kcal: 110, p: 1, g: 3, l: 10, allerg: [], vegan: true, gluten: false, cuisine: 'indienne', text: 'Mijoter 5 minutes avec le lait de coco et une cuillere de curry.' },
  { label: 'pesto', ing: { nom: 'Pesto', quantite: 25, unite: 'g', rayon: 'Epicerie' }, kcal: 130, p: 2, g: 2, l: 13, allerg: ['lactose', 'fruits-a-coque'], vegan: false, gluten: false, cuisine: 'italienne', text: 'Melanger avec le pesto hors du feu.' },
  { label: 'sauce tomate', ing: { nom: 'Sauce tomate', quantite: 120, unite: 'g', rayon: 'Epicerie' }, kcal: 50, p: 2, g: 9, l: 1, allerg: [], vegan: true, gluten: false, cuisine: 'italienne', text: 'Napper de sauce tomate mijotee avec des herbes.' },
  { label: 'yaourt citron', ing: { nom: 'Yaourt nature', quantite: 40, unite: 'g', rayon: 'Cremerie' }, kcal: 30, p: 3, g: 3, l: 1, allerg: ['lactose'], vegan: false, gluten: false, cuisine: 'mediterraneenne', text: 'Servir avec une sauce yaourt-citron (yaourt, citron, sel).' },
  { label: 'tahin citron', ing: { nom: 'Tahin (puree de sesame)', quantite: 1, unite: 'c. a soupe', rayon: 'Epicerie' }, kcal: 90, p: 3, g: 3, l: 8, allerg: ['sesame'], vegan: true, gluten: false, cuisine: 'mediterraneenne', text: 'Napper de sauce tahin-citron (tahin, citron, un peu d\'eau).' },
];

const existingIds = new Set(RECIPES.map((r) => r.id));
const existingNoms = new Set(RECIPES.map((r) => norm(r.nom)));
function nouvelId(nom) {
  let base = 'plat-' + slug(nom), id = base, n = 2;
  while (existingIds.has(id)) id = base + '-' + n++;
  existingIds.add(id);
  return id;
}

function assembler(pr, ba, le, sa) {
  const nom = `Bowl ${pr.label}-${ba.label}, ${le.label} & ${sa.label}`;
  if (existingNoms.has(norm(nom))) return null;
  const kcal = pr.kcal + ba.kcal + le.kcal + sa.kcal;
  if (kcal < 350 || kcal > 820) return null; // garde des plats coherents
  const veg = pr.veg; // bases/legumes/sauces compatibles vegetariens
  const vegan = pr.vegan && sa.vegan;
  const sansGluten = !ba.gluten && !sa.gluten;
  const regime = ['sans-porc'];
  if (veg) regime.push('vegetarien');
  if (vegan) regime.push('vegan');
  if (sansGluten) regime.push('sans-gluten');
  const allergenes = [...new Set([...(pr.allerg || []), ...(sa.allerg || []), ...(ba.gluten ? ['gluten'] : [])])];
  const budget = pr.budget === 'normal' ? 'normal' : 'eco';
  existingNoms.add(norm(nom));
  return {
    id: nouvelId(nom), nom, type: 'plat',
    cuisines: [sa.cuisine || 'francaise'],
    regime, budget, allergenes,
    motsCles: [pr.kw, ba.kw, le.kw],
    kcal, proteines: pr.p + ba.p + le.p + sa.p, glucides: pr.g + ba.g + le.g + sa.g, lipides: pr.l + ba.l + le.l + sa.l,
    tempsMinutes: 25,
    ingredients: [pr.ing, ba.ing, le.ing, sa.ing],
    etapes: [
      ba.cook,
      pr.cook,
      le.cook,
      `Dresser dans un bol : ${ba.label}, ${pr.label} et ${le.label}. ${sa.text}`,
    ],
  };
}

(() => {
  console.log(`\n  Moteur de combinaisons (hors-ligne, gratuit). Objectif : ${COUNT} bowls.${DRY ? ' (DRY-RUN)' : ''}\n`);
  const out = [];
  // Parcours "decale" pour maximiser la variete (pas tous le meme ingredient en bloc).
  const P = PROTEINES.length, B = BASES.length, L = LEGUMES.length, S = SAUCES.length;
  const total = P * B * L * S;
  // Coefficients coprimes aux longueurs -> les 4 dimensions varient independamment.
  for (let i = 0; i < total && out.length < COUNT; i++) {
    const pr = PROTEINES[i % P];
    const ba = BASES[(i * 3) % B];
    const le = LEGUMES[(i * 5) % L];
    const sa = SAUCES[(i * 4) % S];
    const r = assembler(pr, ba, le, sa);
    if (r) out.push(r);
  }
  console.log(`  ${out.length} bowls valides et uniques generes.`);
  if (!out.length) return;
  if (DRY) { console.log('  Exemples :', out.slice(0, 6).map((r) => `${r.nom} (${r.kcal} kcal, ${r.regime.join('/')})`)); return; }

  const file = path.join(__dirname, '..', 'lib', 'recipes.js');
  const src = fs.readFileSync(file, 'utf8');
  const marker = src.lastIndexOf('];');
  const bloc = `\n  // ---- Bowls generes par combinaison (lot du ${new Date().toISOString().slice(0, 10)}) ----\n`
    + out.map((r) => JSON.stringify(r, null, 2).replace(/^/gm, '  ')).join(',\n') + ',\n';
  fs.writeFileSync(file, src.slice(0, marker) + bloc + src.slice(marker));
  console.log(`  Ajoutes a lib/recipes.js. Ensuite : node tools/fetch-photos.js pour les photos.\n`);
})();
