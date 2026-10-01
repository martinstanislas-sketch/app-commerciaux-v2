'use strict';
// ============================================================================
//  RECETTES VÉGÉTALES RICHES EN PROTÉINES — ajout v2 (01/10/2026).
//
//  Pourquoi : avec le catalogue d'origine, un plan végétarien manquait d'environ
//  20 % de protéines et un plan vegan d'environ 40 %.
//
//  ⚠️ À FAIRE VALIDER PAR UN COACH NUTRITION avant l'ouverture au public.
//
//  Les valeurs nutritionnelles ne sont PAS saisies à la main : elles sont
//  calculées depuis la table TABLE ci-dessous (valeurs moyennes pour 100 g,
//  ordre de grandeur Ciqual), avec kcal = 4×P + 4×G + 9×L. Corriger une valeur
//  dans la table corrige automatiquement toutes les recettes qui l'utilisent.
// ============================================================================

// Pour 100 g (ou 100 ml) : [protéines, glucides, lipides]
const TABLE = {
  'tofu ferme': [14, 2, 8],
  'tofu soyeux': [5.5, 2, 3],
  'lentilles cuites': [9, 16, 0.5],
  'lentilles corail crues': [24, 50, 1.5],
  'pois chiches cuits': [8, 17, 2.5],
  'haricots rouges cuits': [8.5, 14, 0.5],
  'haricots blancs cuits': [7.5, 14, 0.5],
  'quinoa cru': [14, 60, 6],
  'riz cru': [7, 78, 1],
  'boulgour cru': [12, 70, 1.5],
  'pâtes crues': [12, 71, 1.5],
  'nouilles de riz': [6, 80, 0.5],
  "flocons d'avoine": [13, 60, 7],
  'pain complet': [9, 43, 3],
  'lait de soja': [3.3, 1, 1.9],
  'yaourt soja nature': [4, 2, 2.3],
  'skyr nature': [10.5, 4, 0.2],
  'fromage blanc': [7, 4, 3],
  oeufs: [12.5, 0.5, 10],
  'graines de chia': [17, 8, 31],
  'graines de sésame': [18, 10, 50],
  'épinards': [3, 1.5, 0.4],
  brocoli: [3, 4, 0.4],
  courgette: [1.2, 2.5, 0.3],
  poivron: [1, 5, 0.3],
  carottes: [0.8, 7.5, 0.2],
  'tomates concassées': [1.2, 4, 0.2],
  tomates: [0.8, 3, 0.2],
  'tomates cerises': [0.9, 3.5, 0.3],
  concombre: [0.6, 2, 0.1],
  oignon: [1.2, 8, 0.1],
  'patate douce': [1.6, 18, 0.1],
  'petits pois': [5.5, 11, 0.4],
  'maïs': [3, 16, 1.2],
  'salade verte': [1.3, 1.5, 0.2],
  'fruits rouges': [1, 8, 0.3],
  banane: [1.1, 20, 0.3],
  "huile d'olive": [0, 0, 100],
  'huile de colza': [0, 0, 100],
  'sauce soja': [9, 6, 0],
  'jus de citron': [0.4, 2, 0],
  ail: [6, 30, 0.5],
  curry: [0, 0, 0], cumin: [0, 0, 0], paprika: [0, 0, 0], 'herbes de Provence': [0, 0, 0],
};
// Conversion des unités de recette en grammes.
const GRAMMES = {
  piece: { oeufs: 55, banane: 120, ail: 5 },
  tranche: { 'pain complet': 35 },
  'c. à soupe': { "huile d'olive": 10, 'huile de colza': 10, 'sauce soja': 15, 'jus de citron': 15 },
  'c. à café': { "huile d'olive": 4.5, 'huile de colza': 4.5, 'graines de sésame': 3, curry: 2, cumin: 2, paprika: 2 },
  'pincée': { 'herbes de Provence': 0.5, paprika: 0.5, cumin: 0.5 },
};

// Rayons repris À L'IDENTIQUE du catalogue existant (liste de courses).
const RAYON = {
  'tofu ferme': 'Épicerie', 'tofu soyeux': 'Épicerie', 'lentilles cuites': 'Épicerie', 'lentilles corail crues': 'Épicerie',
  'pois chiches cuits': 'Épicerie', 'haricots rouges cuits': 'Épicerie', 'haricots blancs cuits': 'Épicerie', 'quinoa cru': 'Épicerie',
  'riz cru': 'Épicerie', 'boulgour cru': 'Épicerie', 'pâtes crues': 'Épicerie', 'nouilles de riz': 'Épicerie', "flocons d'avoine": 'Épicerie',
  'pain complet': 'Boulangerie', 'lait de soja': 'Épicerie', 'yaourt soja nature': 'Crèmerie', 'skyr nature': 'Crèmerie', 'fromage blanc': 'Crèmerie',
  oeufs: 'Crèmerie', 'graines de chia': 'Épicerie', 'graines de sésame': 'Épicerie', "huile d'olive": 'Épicerie', 'huile de colza': 'Épicerie',
  'sauce soja': 'Épicerie', curry: 'Épicerie', cumin: 'Épicerie', paprika: 'Épicerie', 'herbes de Provence': 'Épicerie',
};
const rayonDe = (nom) => RAYON[nom] || 'Fruits & légumes';

function grammes(nom, q, unite) {
  if (unite === 'g' || unite === 'ml') return q;
  const g = (GRAMMES[unite] || {})[nom];
  if (g === undefined) throw new Error(`Conversion inconnue : ${q} ${unite} de ${nom}`);
  return q * g;
}

// [nom, quantité, unité]
function recette(def) {
  let P = 0, G = 0, L = 0;
  const ingredients = def.ing.map(([nom, quantite, unite]) => {
    const t = TABLE[nom];
    if (!t) throw new Error(`Ingrédient absent de la table : ${nom}`);
    const f = grammes(nom, quantite, unite) / 100;
    P += t[0] * f; G += t[1] * f; L += t[2] * f;
    return { nom, quantite, unite, rayon: rayonDe(nom) };
  });
  const proteines = Math.round(P), glucides = Math.round(G), lipides = Math.round(L);
  return {
    id: def.id, nom: def.nom, type: def.type, categorie: def.categorie || '', gout: def.gout || '',
    cuisines: def.cuisines || [], regime: def.regime, budget: def.budget || 'eco', allergenes: def.allergenes || [],
    kcal: Math.round(4 * P + 4 * G + 9 * L), proteines, glucides, lipides,
    tempsMinutes: def.temps, motsCles: def.motsCles, ingredients, etapes: def.etapes,
  };
}

const VEGAN = ['vegetarien', 'vegan', 'sans-porc', 'sans-gluten'];
const VEGAN_GLUTEN = ['vegetarien', 'vegan', 'sans-porc'];
const VEGE = ['vegetarien', 'sans-porc', 'sans-gluten'];
const VEGE_GLUTEN = ['vegetarien', 'sans-porc'];

const DEFS = [
  // ---------------- Plats vegan ----------------
  { id: 'plat-vp-tofu-saute-brocoli-riz', nom: 'Tofu sauté brocoli riz', type: 'plat', cuisines: ['asiatique'], regime: VEGAN, budget: 'normal', allergenes: ['soja'], temps: 20,
    motsCles: ['tofu', 'brocoli', 'riz'],
    ing: [['tofu ferme', 180, 'g'], ['brocoli', 150, 'g'], ['riz cru', 60, 'g'], ['sauce soja', 1, 'c. à soupe'], ['huile de colza', 1, 'c. à café'], ['ail', 1, 'piece']],
    etapes: ['Cuire le riz.', 'Couper le tofu en cubes et le faire dorer 6 min dans l\'huile.', 'Ajouter le brocoli en petits bouquets et l\'ail haché, cuire 5 min.', 'Verser la sauce soja, mélanger et servir sur le riz.'] },
  { id: 'plat-vp-curry-lentilles-corail-epinards', nom: 'Curry de lentilles corail aux épinards', type: 'plat', cuisines: ['indienne'], regime: VEGAN, temps: 25,
    motsCles: ['lentilles corail', 'épinards', 'curry'],
    ing: [['lentilles corail crues', 90, 'g'], ['épinards', 120, 'g'], ['tomates concassées', 150, 'g'], ['oignon', 60, 'g'], ['curry', 1, 'c. à café'], ["huile d'olive", 1, 'c. à café']],
    etapes: ['Faire revenir l\'oignon émincé dans l\'huile avec le curry.', 'Ajouter les lentilles rincées, les tomates et 250 ml d\'eau.', 'Laisser mijoter 15 min.', 'Ajouter les épinards 2 min avant la fin et servir.'] },
  { id: 'plat-vp-chili-sin-carne-riz', nom: 'Chili sin carne et riz', type: 'plat', cuisines: ['mexicaine'], regime: VEGAN, temps: 25,
    motsCles: ['haricots rouges', 'poivron', 'riz'],
    ing: [['haricots rouges cuits', 200, 'g'], ['tomates concassées', 150, 'g'], ['poivron', 100, 'g'], ['oignon', 50, 'g'], ['riz cru', 50, 'g'], ['cumin', 1, 'c. à café'], ['paprika', 1, 'c. à café'], ["huile d'olive", 1, 'c. à café']],
    etapes: ['Cuire le riz.', 'Faire revenir l\'oignon et le poivron dans l\'huile 5 min.', 'Ajouter les épices, les tomates et les haricots rincés, mijoter 10 min.', 'Servir avec le riz.'] },
  { id: 'plat-vp-bowl-quinoa-tofu-legumes', nom: 'Bowl quinoa tofu légumes rôtis', type: 'plat', cuisines: ['mediterraneenne'], regime: VEGAN, budget: 'normal', allergenes: ['soja'], temps: 25,
    motsCles: ['quinoa', 'tofu', 'courgette', 'poivron'],
    ing: [['quinoa cru', 60, 'g'], ['tofu ferme', 150, 'g'], ['courgette', 120, 'g'], ['poivron', 100, 'g'], ["huile d'olive", 1, 'c. à café'], ['jus de citron', 1, 'c. à soupe']],
    etapes: ['Cuire le quinoa.', 'Rôtir le tofu en cubes et les légumes coupés 15 min à 200 °C avec l\'huile.', 'Disposer le tout dans un bol et arroser de citron.'] },
  { id: 'plat-vp-pois-chiches-tofu-epinards-tomate', nom: 'Pois chiches et tofu aux épinards, sauce tomate', type: 'plat', cuisines: ['mediterraneenne'], regime: VEGAN, budget: 'normal', allergenes: ['soja'], temps: 20,
    motsCles: ['pois chiches', 'tofu', 'épinards'],
    ing: [['pois chiches cuits', 150, 'g'], ['tofu ferme', 100, 'g'], ['épinards', 120, 'g'], ['tomates concassées', 150, 'g'], ['ail', 1, 'piece'], ["huile d'olive", 1, 'c. à café']],
    etapes: ['Faire dorer le tofu en cubes et l\'ail dans l\'huile.', 'Ajouter les tomates et les pois chiches rincés, mijoter 8 min.', 'Ajouter les épinards, laisser tomber 2 min et servir.'] },
  { id: 'plat-vp-lentilles-tofu-carottes', nom: 'Lentilles mijotées tofu carottes', type: 'plat', cuisines: ['francaise'], regime: VEGAN, allergenes: ['soja'], temps: 20,
    motsCles: ['lentilles', 'tofu', 'carottes'],
    ing: [['lentilles cuites', 200, 'g'], ['tofu ferme', 100, 'g'], ['carottes', 120, 'g'], ['oignon', 50, 'g'], ['herbes de Provence', 1, 'pincée'], ["huile d'olive", 1, 'c. à café']],
    etapes: ['Faire revenir l\'oignon et les carottes en rondelles dans l\'huile 8 min.', 'Ajouter le tofu en dés et les herbes, dorer 3 min.', 'Ajouter les lentilles, réchauffer 5 min et servir.'] },
  { id: 'plat-vp-bolognaise-lentilles-pates', nom: 'Pâtes bolognaise de lentilles', type: 'plat', cuisines: ['italienne'], regime: VEGAN_GLUTEN, allergenes: ['gluten'], temps: 25,
    motsCles: ['pâtes', 'lentilles corail', 'tomate'],
    ing: [['pâtes crues', 70, 'g'], ['lentilles corail crues', 50, 'g'], ['tomates concassées', 200, 'g'], ['oignon', 50, 'g'], ['carottes', 60, 'g'], ["huile d'olive", 1, 'c. à café']],
    etapes: ['Faire revenir l\'oignon et la carotte râpée dans l\'huile.', 'Ajouter les lentilles, les tomates et 150 ml d\'eau, mijoter 15 min.', 'Cuire les pâtes et les servir avec la sauce.'] },
  { id: 'plat-vp-tofu-brouille-patate-douce', nom: 'Tofu brouillé, patate douce et épinards', type: 'plat', cuisines: ['francaise'], regime: VEGAN, budget: 'normal', allergenes: ['soja'], temps: 25,
    motsCles: ['tofu', 'patate douce', 'épinards'],
    ing: [['tofu ferme', 180, 'g'], ['patate douce', 150, 'g'], ['épinards', 100, 'g'], ['cumin', 1, 'c. à café'], ["huile d'olive", 1, 'c. à café']],
    etapes: ['Cuire la patate douce en cubes à la vapeur 12 min.', 'Émietter le tofu et le faire revenir dans l\'huile avec le cumin 5 min.', 'Ajouter les épinards et la patate douce, mélanger 2 min et servir.'] },
  { id: 'plat-vp-salade-lentilles-tofu', nom: 'Salade de lentilles, tofu et crudités', type: 'plat', cuisines: ['francaise'], regime: VEGAN, allergenes: ['soja'], temps: 10,
    motsCles: ['lentilles', 'tofu', 'concombre', 'tomates cerises'],
    ing: [['lentilles cuites', 180, 'g'], ['tofu ferme', 100, 'g'], ['concombre', 120, 'g'], ['tomates cerises', 100, 'g'], ['jus de citron', 1, 'c. à soupe'], ["huile d'olive", 1, 'c. à café']],
    etapes: ['Couper le tofu, le concombre et les tomates.', 'Mélanger avec les lentilles.', 'Assaisonner avec le citron et l\'huile.'] },
  { id: 'plat-vp-nouilles-riz-tofu-legumes', nom: 'Nouilles de riz sautées au tofu', type: 'plat', cuisines: ['asiatique'], regime: VEGAN, budget: 'normal', allergenes: ['soja', 'sesame'], temps: 20,
    motsCles: ['nouilles de riz', 'tofu', 'poivron', 'carottes'],
    ing: [['nouilles de riz', 60, 'g'], ['tofu ferme', 160, 'g'], ['poivron', 100, 'g'], ['carottes', 80, 'g'], ['sauce soja', 1, 'c. à soupe'], ['graines de sésame', 1, 'c. à café'], ['huile de colza', 1, 'c. à café']],
    etapes: ['Réhydrater les nouilles dans l\'eau chaude.', 'Faire sauter le tofu en cubes et les légumes en lanières 6 min dans l\'huile.', 'Ajouter les nouilles et la sauce soja, mélanger.', 'Parsemer de sésame et servir.'] },
  { id: 'plat-vp-haricots-blancs-tofu-tomate', nom: 'Haricots blancs, tofu et courgette à la tomate', type: 'plat', cuisines: ['francaise'], regime: VEGAN, allergenes: ['soja'], temps: 20,
    motsCles: ['haricots blancs', 'tofu', 'courgette'],
    ing: [['haricots blancs cuits', 180, 'g'], ['tofu ferme', 120, 'g'], ['tomates concassées', 150, 'g'], ['courgette', 120, 'g'], ['ail', 1, 'piece'], ['herbes de Provence', 1, 'pincée'], ["huile d'olive", 1, 'c. à café']],
    etapes: ['Faire revenir la courgette en dés et l\'ail dans l\'huile 5 min.', 'Ajouter le tofu, les tomates, les haricots rincés et les herbes.', 'Mijoter 10 min et servir.'] },
  { id: 'plat-vp-taboule-pois-chiches-tofu', nom: 'Taboulé de boulgour, pois chiches et tofu', type: 'plat', cuisines: ['orientale'], regime: VEGAN_GLUTEN, allergenes: ['gluten', 'soja'], temps: 15,
    motsCles: ['boulgour', 'pois chiches', 'tofu', 'concombre'],
    ing: [['boulgour cru', 50, 'g'], ['pois chiches cuits', 120, 'g'], ['tofu ferme', 100, 'g'], ['tomates', 120, 'g'], ['concombre', 100, 'g'], ['jus de citron', 1, 'c. à soupe'], ["huile d'olive", 1, 'c. à café']],
    etapes: ['Cuire le boulgour et le laisser tiédir.', 'Couper le tofu, les tomates et le concombre en dés.', 'Mélanger le tout avec les pois chiches, le citron et l\'huile.'] },
  // ---------------- Plats végétariens ----------------
  { id: 'plat-vp-omelette-lentilles-epinards', nom: 'Omelette aux épinards et lentilles', type: 'plat', cuisines: ['francaise'], regime: VEGE, allergenes: ['oeuf'], temps: 15,
    motsCles: ['oeufs', 'lentilles', 'épinards'],
    ing: [['oeufs', 3, 'piece'], ['lentilles cuites', 150, 'g'], ['épinards', 100, 'g'], ["huile d'olive", 1, 'c. à café']],
    etapes: ['Faire tomber les épinards dans l\'huile 2 min.', 'Battre les œufs et les verser dans la poêle.', 'Cuire 4 min et servir avec les lentilles réchauffées.'] },
  { id: 'plat-vp-riz-saute-oeufs-tofu-petits-pois', nom: 'Riz sauté œufs, tofu et petits pois', type: 'plat', cuisines: ['asiatique'], regime: VEGE, budget: 'normal', allergenes: ['oeuf', 'soja'], temps: 20,
    motsCles: ['riz', 'oeufs', 'tofu', 'petits pois'],
    ing: [['riz cru', 50, 'g'], ['oeufs', 2, 'piece'], ['tofu ferme', 100, 'g'], ['petits pois', 100, 'g'], ['sauce soja', 1, 'c. à soupe'], ['huile de colza', 1, 'c. à café']],
    etapes: ['Cuire le riz.', 'Faire dorer le tofu en dés dans l\'huile, ajouter les petits pois 3 min.', 'Pousser sur le côté, brouiller les œufs dans la poêle.', 'Ajouter le riz et la sauce soja, mélanger et servir.'] },
  { id: 'plat-vp-salade-haricots-rouges-oeufs', nom: 'Salade haricots rouges, œufs et maïs', type: 'plat', cuisines: ['mexicaine'], regime: VEGE, allergenes: ['oeuf'], temps: 15,
    motsCles: ['haricots rouges', 'oeufs', 'maïs'],
    ing: [['haricots rouges cuits', 150, 'g'], ['oeufs', 2, 'piece'], ['maïs', 60, 'g'], ['tomates', 120, 'g'], ['salade verte', 50, 'g'], ["huile d'olive", 1, 'c. à café']],
    etapes: ['Cuire les œufs 9 min, les écaler et les couper.', 'Mélanger les haricots rincés, le maïs, les tomates et la salade.', 'Ajouter les œufs et l\'huile, servir.'] },
  // ---------------- Petits-déjeuners ----------------
  { id: 'pd-vp-porridge-soja-chia-fruits-rouges', nom: 'Porridge au lait de soja, chia et fruits rouges', type: 'petit-dejeuner', categorie: 'pancake-porridge', gout: 'sucre', regime: VEGAN_GLUTEN, allergenes: ['gluten', 'soja'], temps: 8,
    motsCles: ['avoine', 'lait de soja', 'chia', 'fruits rouges'],
    ing: [["flocons d'avoine", 50, 'g'], ['lait de soja', 250, 'ml'], ['graines de chia', 10, 'g'], ['fruits rouges', 80, 'g']],
    etapes: ['Chauffer les flocons dans le lait de soja 5 min en remuant.', 'Ajouter le chia et laisser épaissir 2 min.', 'Servir avec les fruits rouges.'] },
  { id: 'pd-vp-tofu-brouille-tartines', nom: 'Tofu brouillé sur tartines', type: 'petit-dejeuner', categorie: 'tartine', gout: 'sale', regime: VEGAN_GLUTEN, budget: 'normal', allergenes: ['gluten', 'soja'], temps: 10,
    motsCles: ['tofu', 'pain complet', 'tomates cerises'],
    ing: [['tofu ferme', 150, 'g'], ['pain complet', 2, 'tranche'], ['tomates cerises', 80, 'g'], ["huile d'olive", 1, 'c. à café']],
    etapes: ['Émietter le tofu et le faire revenir 5 min dans l\'huile.', 'Griller le pain.', 'Servir le tofu sur les tartines avec les tomates cerises.'] },
  { id: 'pd-vp-bol-yaourt-soja-chia', nom: 'Bol yaourt soja, chia et fruits rouges', type: 'petit-dejeuner', categorie: 'bol', gout: 'sucre', regime: VEGAN_GLUTEN, allergenes: ['gluten', 'soja'], temps: 5,
    motsCles: ['yaourt soja', 'chia', 'fruits rouges', 'avoine'],
    ing: [['yaourt soja nature', 250, 'g'], ['graines de chia', 15, 'g'], ['fruits rouges', 100, 'g'], ["flocons d'avoine", 20, 'g']],
    etapes: ['Verser le yaourt dans un bol.', 'Ajouter le chia, les flocons et les fruits rouges.'] },
  { id: 'pd-vp-skyr-avoine-fruits-rouges', nom: 'Skyr, avoine et fruits rouges', type: 'petit-dejeuner', categorie: 'bol', gout: 'sucre', regime: VEGE_GLUTEN, allergenes: ['gluten', 'lactose'], temps: 3,
    motsCles: ['skyr', 'avoine', 'fruits rouges'],
    ing: [['skyr nature', 200, 'g'], ["flocons d'avoine", 40, 'g'], ['fruits rouges', 100, 'g']],
    etapes: ['Verser le skyr dans un bol.', 'Ajouter les flocons et les fruits rouges.'] },
  // ---------------- Collations ----------------
  { id: 'col-vp-skyr-fruits-rouges', nom: 'Skyr et fruits rouges', type: 'collation', categorie: 'proteinees', gout: 'sucre', regime: VEGE, allergenes: ['lactose'], temps: 2,
    motsCles: ['skyr', 'fruits rouges'],
    ing: [['skyr nature', 170, 'g'], ['fruits rouges', 100, 'g']],
    etapes: ['Verser le skyr dans un bol et ajouter les fruits rouges.'] },
  { id: 'col-vp-fromage-blanc-chia', nom: 'Fromage blanc, chia et fruits rouges', type: 'collation', categorie: 'proteinees', gout: 'sucre', regime: VEGE, allergenes: ['lactose'], temps: 2,
    motsCles: ['fromage blanc', 'chia', 'fruits rouges'],
    ing: [['fromage blanc', 200, 'g'], ['graines de chia', 10, 'g'], ['fruits rouges', 80, 'g']],
    etapes: ['Mélanger le fromage blanc et le chia.', 'Ajouter les fruits rouges.'] },
  { id: 'col-vp-pois-chiches-grilles-paprika', nom: 'Pois chiches grillés au paprika', type: 'collation', categorie: 'proteinees', gout: 'sale', regime: VEGAN, temps: 25,
    motsCles: ['pois chiches', 'paprika'],
    ing: [['pois chiches cuits', 130, 'g'], ["huile d'olive", 1, 'c. à café'], ['paprika', 1, 'c. à café']],
    etapes: ['Rincer et sécher les pois chiches.', 'Les mélanger avec l\'huile et le paprika.', 'Cuire 20 min à 200 °C jusqu\'à ce qu\'ils soient croustillants.'] },
  { id: 'col-vp-creme-tofu-soyeux-fruits-rouges', nom: 'Crème de tofu soyeux aux fruits rouges', type: 'collation', categorie: 'proteinees', gout: 'sucre', regime: VEGAN, allergenes: ['soja'], temps: 5,
    motsCles: ['tofu soyeux', 'fruits rouges', 'banane'],
    ing: [['tofu soyeux', 200, 'g'], ['fruits rouges', 100, 'g'], ['banane', 0.5, 'piece']],
    etapes: ['Mixer le tofu soyeux avec la banane.', 'Servir avec les fruits rouges.'] },
];

const RECETTES = DEFS.map(recette);

module.exports = { RECETTES, TABLE };
