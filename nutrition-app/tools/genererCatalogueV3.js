'use strict';
// ============================================================================
//  GÉNÉRATEUR : ingredients-final-v3.json -> public/coursesCatalogue.js
//
//  Le v3 n'est PAS importé tel quel : il écraserait quatre décisions déjà
//  livrées et validées. Ce script applique donc une COUCHE DE PRÉSERVATION
//  explicite par-dessus le v3 (chaque règle est commentée plus bas).
//
//  Usage :  node nutrition-app/tools/genererCatalogueV3.js <chemin-du-json>
// ============================================================================

const fs = require('fs');
const path = require('path');

const SRC = process.argv[2];
if (!SRC) { console.error('Usage : node genererCatalogueV3.js <ingredients-final-v3.json>'); process.exit(1); }

const RACINE = path.join(__dirname, '..');
const CIBLE = path.join(RACINE, 'public', 'coursesCatalogue.js');
const v3 = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const actuel = require(CIBLE).INGREDIENTS; // référence pour ce qu'on préserve

// ── COUCHE DE PRÉSERVATION ────────────────────────────────────────────────
// 1. `eau` : absente du v3. La retirer casserait 3 ingrédients de recettes
//    (ils tomberaient en « À vérifier »). Décision produit : elle reste au
//    référentiel, mais exclue de l'AFFICHAGE de la liste.
// 2. `blanc_de_dinde_tranches` : absent du v3, alors que le v3 confirme que
//    `blanc_de_dinde` reçoit « tranche » ET « g ». Sans lui, les tranches des
//    collations redeviennent invisibles (bug corrigé en e1dec62).
// 3. `tortilla_de_ble` : le v3 le sépare de `wrap_de_ble` ; la fusion a été
//    livrée en f77eae5 (un seul achat). On garde la fusion.
// 4. Libellés ACCENTUÉS : le v3 fournit des noms sans accents (« epinards »,
//    « creme legere », « oeufs »). On garde l'orthographe actuelle, qui est
//    celle affichée au client.
const A_IGNORER = new Set(['tortilla_de_ble']);          // reste fusionné dans wrap_de_ble
const A_CONSERVER = ['eau', 'blanc_de_dinde_tranches'];  // absents du v3, gardés tels quels
const VARIANTES_PAR_UNITE = { blanc_de_dinde: { tranche: 'blanc_de_dinde_tranches' } };
// 5. LACUNE DU v3 : l'oignon déclare bien `unites_recette: ["piece","g"]` mais
//    n'a pas reçu de `poids_piece_g` — sans lui, sa ligne reste à deux unités
//    (« 50 g + 0,5 piece »). Valeur retenue : 110 g, un oignon moyen.
//    À corriger dans le prochain export si Stan préfère une autre valeur.
const POIDS_PIECE_COMPLEMENT = { oignon: 110 };
// 6. LACUNE DU v3 (bis) : `conditionnement_g` n'est renseigné que sur les 10
//    conserves. La brique de lait a pourtant une contenance connue (1 L) et
//    calculait déjà « 2 × brique (1 L) » — sans ce complément, elle retombe à
//    « 1200 ml », ce qu'aucun rayon ne vend. Exprimé dans l'unité de base.
const CONTENANCE_COMPLEMENT = { lait_demi_ecreme: 1000 };

// La catégorie n'existe pas dans le v3 : le moteur s'en sert pour l'arrondi
// (viande/poisson -> « ~500 g »). On garde celle d'aujourd'hui, sinon on la
// dérive du rayon comme le faisait la génération précédente.
const CAT_PAR_RAYON = {
  'Fruits & légumes': 'legume', Boucherie: 'viande', 'Charcuterie / Traiteur': 'charcuterie',
  Poissonnerie: 'poisson', Crèmerie: 'cremerie', Boulangerie: 'boulangerie',
  'Épicerie': 'epicerie', 'Surgelés': 'surgele',
};

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const lignes = [];
const rapport = { accents: [], packs: [], pieces: [], ignores: [], conserves: [] };

v3.produits.forEach((p) => {
  const id = p.canonical_id;
  if (A_IGNORER.has(id)) { rapport.ignores.push(id); return; }
  const cur = actuel[id] || null;

  // display_name : l'accentué actuel gagne sur le v3 non accentué.
  const display = cur && cur.display_name ? cur.display_name : p.produit;
  if (cur && cur.display_name !== p.produit) rapport.accents.push(id + ' : "' + p.produit + '" -> "' + display + '"');

  // aliases : UNION v3 + actuel. Retirer un alias existant ferait tomber des
  // ingrédients de recettes en « non référencé » — on n'en enlève jamais.
  const aliases = [...new Set([].concat(p.aliases || [], (cur && cur.aliases) || []))];

  const champs = [
    'display_name: "' + esc(display) + '"',
    'aliases: [' + aliases.map((a) => '"' + esc(a) + '"').join(',') + ']',
    'rayon: "' + esc(p.rayon) + '"',
    'category: "' + esc((cur && cur.category) || CAT_PAR_RAYON[p.rayon] || 'epicerie') + '"',
    'unite_base: "' + esc(p.unite_base) + '"',
    'is_staple: ' + (p.is_staple ? 'true' : 'false'),
    'purchase_unit: "' + esc(p.purchase_unit) + '"',
    'interchangeable_group: ' + (p.interchangeable_group ? '"' + esc(p.interchangeable_group) + '"' : 'null'),
  ];
  if (p.conversion_cru_cuit && p.conversion_cru_cuit.g_cuit_par_g_cru) {
    champs.push('conversion_cru_cuit: { g_cuit_par_g_cru: ' + p.conversion_cru_cuit.g_cuit_par_g_cru + ' }');
  }
  // v3 : contenance d'une conserve -> nb de boîtes = ceil(besoin / conditionnement).
  const contenance = p.conditionnement_g > 0 ? p.conditionnement_g : CONTENANCE_COMPLEMENT[id];
  if (contenance > 0) {
    champs.push('conditionnement_g: ' + contenance);
    rapport.packs.push(id + '=' + contenance + ' ' + p.unite_base + (p.conditionnement_g > 0 ? '' : ' (complété, absent du v3)'));
  }
  // v3 : poids moyen d'une pièce -> unifie « 1220 g + 4,5 piece » en une seule unité.
  const poidsPiece = p.poids_piece_g > 0 ? p.poids_piece_g : POIDS_PIECE_COMPLEMENT[id];
  if (poidsPiece > 0) {
    champs.push('poids_piece_g: ' + poidsPiece);
    rapport.pieces.push(id + '=' + poidsPiece + ' g' + (p.poids_piece_g > 0 ? '' : ' (complété, absent du v3)'));
  }
  // Œufs : conditionnements réels (6 ou 12), combinés au plus juste par le moteur.
  if (cur && cur.pack_options) champs.push('pack_options: [' + cur.pack_options.join(',') + '], pack_nom: "' + esc(cur.pack_nom) + '"');
  if (VARIANTES_PAR_UNITE[id]) {
    const v = VARIANTES_PAR_UNITE[id];
    champs.push('variantes_par_unite: { ' + Object.entries(v).map(([u, c]) => u + ': "' + c + '"').join(', ') + ' }');
  }
  lignes.push('    ' + id + ': { ' + champs.join(',') + ' },');
});

// Produits absents du v3 mais volontairement conservés (recopiés à l'identique).
A_CONSERVER.forEach((id) => {
  const d = actuel[id];
  if (!d) { console.error('!! à conserver mais introuvable : ' + id); return; }
  const champs = Object.entries(d).map(([k, v]) => {
    if (typeof v === 'string') return k + ': "' + esc(v) + '"';
    if (Array.isArray(v)) return k + ': [' + v.map((x) => '"' + esc(x) + '"').join(',') + ']';
    if (v && typeof v === 'object') return k + ': ' + JSON.stringify(v);
    return k + ': ' + v;
  });
  lignes.push('    ' + id + ': { ' + champs.join(',') + ' },');
  rapport.conserves.push(id);
});

const entete = `'use strict';
// ============================================================================
//  RÉFÉRENTIEL CANONIQUE DES INGRÉDIENTS — moteur de la liste de courses.
//
//  ⚠️ FICHIER GÉNÉRÉ. Ne pas éditer à la main :
//      node nutrition-app/tools/genererCatalogueV3.js <ingredients-final-v3.json>
//
//  Source : référentiel v3 (${v3.produits.length} produits) construit sur les
//  ${v3._meta.recettes_parcourues} recettes de lib/recipes-v2.js.
//  Le v3 apporte les unités d'achat corrigées ainsi que deux champs exploités
//  par le moteur :
//    - conditionnement_g : contenance d'une conserve -> « N × boîte (X g) » ;
//    - poids_piece_g     : poids moyen d'une pièce -> une seule unité affichée.
//
//  Quatre décisions déjà livrées sont PRÉSERVÉES par le générateur (le v3 les
//  écraserait) : l'eau gardée au référentiel mais hors affichage, le blanc de
//  dinde en tranches (charcuterie) distinct du filet au poids, la fusion
//  wrap/tortilla, et les libellés accentués.
//
//  Fichier UMD : chargé par index.html (window.CoursesCatalogue) ET requis par
//  les tests node (module.exports).
// ============================================================================

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CoursesCatalogue = api;
}(typeof self !== 'undefined' ? self : this, function () {

  // L'ordre des rayons dans la liste — le parcours physique d'un magasin.
  const RAYONS = ['Fruits & légumes', 'Boucherie', 'Charcuterie / Traiteur', 'Poissonnerie', 'Crèmerie', 'Boulangerie', 'Épicerie', 'Surgelés'];

  // Groupes d'ingrédients interchangeables : une seule ligne « au choix ».
  const GROUPES = {
${Object.entries(v3.interchangeable_groups || {}).map(([k, g]) => `    ${k}: { display_name: '${g.display_name}', rayon: '${g.rayon}', category: '${CAT_PAR_RAYON[g.rayon] || 'epicerie'}', note: '${String(g.note).replace(/'/g, "\\'")}' },`).join('\n')}
  };

  // unite_base : 'g' | 'ml' | 'piece' — l'unité de CALCUL pour l'agrégation.
  // purchase_unit : ce que le client achète (affiché en petit sur la ligne).
  const INGREDIENTS = {
${lignes.join('\n')}
  };
`;

// Le bas du fichier (normaliser + INDEX + resoudre) n'est PAS généré : il porte
// la logique de résolution, dont l'aiguillage par unité. On le recopie tel quel.
const pied = fs.readFileSync(CIBLE, 'utf8');
const depart = pied.indexOf('  function normaliser(s) {');
if (depart < 0) { console.error('!! ancrage « function normaliser » introuvable — abandon, rien n\'est écrit.'); process.exit(1); }
fs.writeFileSync(CIBLE, entete + '\n' + pied.slice(depart));

console.log('✅ catalogue régénéré :', lignes.length, 'produits');
console.log('   conditionnement_g :', rapport.packs.length, '->', rapport.packs.join(', '));
console.log('   poids_piece_g     :', rapport.pieces.length, '->', rapport.pieces.join(', '));
console.log('   conservés (hors v3):', rapport.conserves.join(', '));
console.log('   ignorés (fusionnés):', rapport.ignores.join(', '));
console.log('   libellés accentués préservés :', rapport.accents.length);
