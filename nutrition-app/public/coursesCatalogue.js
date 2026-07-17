'use strict';
// ============================================================================
//  RÉFÉRENTIEL CANONIQUE DES INGRÉDIENTS — moteur de la liste de courses.
//
//  Source de vérité pour : le dédoublonnage (un ingrédient de recette est mappé
//  vers un canonique via ses alias), le rayon d'achat, l'unité d'ACHAT (ce que
//  le client lit en magasin — jamais une unité de recette), le statut
//  placard/longue conservation (bloc replié), et les groupes d'ingrédients
//  interchangeables (fusionnés en une ligne « au choix » au poids total).
//
//  Référentiel de DÉPART (~44 canoniques, bâti sur le plan 7 jours) : il doit
//  GROSSIR au fil des recettes. Un ingrédient sans alias ici ne casse rien —
//  il garde le rayon de sa recette et part dans `warnings` (cf. buildShoppingList)
//  pour être ajouté au référentiel.
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
  // « Placard » (agrégat des is_staple) et « À vérifier » (non référencés sans
  // rayon) ferment la marche.
  const RAYONS = ['Fruits & légumes', 'Boucherie', 'Charcuterie / Traiteur', 'Poissonnerie', 'Crèmerie', 'Boulangerie', 'Épicerie', 'Surgelés'];

  // Groupes d'ingrédients interchangeables : une seule ligne « au choix ».
  const GROUPES = {
    poisson_blanc: { display_name: 'poisson blanc (au choix)', rayon: 'Poissonnerie', note: 'Variétés interchangeables — prends celle que tu préfères, au poids total.' },
  };

  // unite_base : 'g' | 'ml' | 'piece' — l'unité de CALCUL pour l'agrégation.
  // purchase_unit : ce que le client achète (affiché en petit sur la ligne).
  const INGREDIENTS = {
    // --- Fruits & légumes ---------------------------------------------------
    banane: { display_name: 'banane', aliases: ['banane', 'bananes'], rayon: 'Fruits & légumes', unite_base: 'piece', is_staple: false, purchase_unit: 'à l’unité', interchangeable_group: null },
    carottes: { display_name: 'carottes', aliases: ['carottes', 'carotte'], rayon: 'Fruits & légumes', unite_base: 'g', is_staple: false, purchase_unit: 'en vrac ou 1 sachet', interchangeable_group: null },
    champignons: { display_name: 'champignons', aliases: ['champignons', 'champignon'], rayon: 'Fruits & légumes', unite_base: 'g', is_staple: false, purchase_unit: '1 barquette', interchangeable_group: null },
    chou_fleur: { display_name: 'chou-fleur', aliases: ['chou-fleur', 'chou fleur'], rayon: 'Fruits & légumes', unite_base: 'g', is_staple: false, purchase_unit: 'à la pièce', interchangeable_group: null },
    citron: { display_name: 'citron', aliases: ['citron', 'citrons'], rayon: 'Fruits & légumes', unite_base: 'piece', is_staple: false, purchase_unit: 'à l’unité', interchangeable_group: null },
    concombre: { display_name: 'concombre', aliases: ['concombre', 'concombres'], rayon: 'Fruits & légumes', unite_base: 'piece', is_staple: false, purchase_unit: 'à l’unité', interchangeable_group: null },
    courgettes: { display_name: 'courgettes', aliases: ['courgettes', 'courgette'], rayon: 'Fruits & légumes', unite_base: 'g', is_staple: false, purchase_unit: 'en vrac', interchangeable_group: null },
    epinards: { display_name: 'épinards', aliases: ['épinards', 'epinards'], rayon: 'Fruits & légumes', unite_base: 'g', is_staple: false, purchase_unit: '1 sachet (frais ou surgelé)', interchangeable_group: null },
    haricots_verts: { display_name: 'haricots verts', aliases: ['haricots verts'], rayon: 'Fruits & légumes', unite_base: 'g', is_staple: false, purchase_unit: 'en vrac ou 1 sachet', interchangeable_group: null },
    poivron: { display_name: 'poivron', aliases: ['poivron', 'poivrons'], rayon: 'Fruits & légumes', unite_base: 'piece', is_staple: false, purchase_unit: 'à l’unité', interchangeable_group: null },
    pommes_de_terre: { display_name: 'pommes de terre', aliases: ['pommes de terre', 'pomme de terre'], rayon: 'Fruits & légumes', unite_base: 'g', is_staple: false, purchase_unit: '1 filet', interchangeable_group: null },
    roquette: { display_name: 'roquette', aliases: ['roquette'], rayon: 'Fruits & légumes', unite_base: 'g', is_staple: false, purchase_unit: '1 sachet', interchangeable_group: null },
    salade_verte: { display_name: 'salade verte', aliases: ['salade verte', 'salade'], rayon: 'Fruits & légumes', unite_base: 'g', is_staple: false, purchase_unit: '1 sachet ou 1 pièce', interchangeable_group: null },
    tomate: { display_name: 'tomate', aliases: ['tomate', 'tomates'], rayon: 'Fruits & légumes', unite_base: 'piece', is_staple: false, purchase_unit: 'à l’unité', interchangeable_group: null },

    // --- Épicerie (conserves) ----------------------------------------------
    tomates_concassees: { display_name: 'tomates concassées', aliases: ['tomates concassées', 'tomate concassée'], rayon: 'Épicerie', unite_base: 'g', is_staple: true, purchase_unit: '1 boîte (400 g)', interchangeable_group: null },

    // --- Viandes / charcuterie ---------------------------------------------
    // Tranches type charcuterie, mangées telles quelles. Distinct de l'escalope à cuire.
    blanc_dinde_tranches: { display_name: 'blanc de dinde (tranches)', aliases: ['blanc de dinde tranche', 'blanc de dinde (tranche)', 'blanc de dinde tranches'], rayon: 'Charcuterie / Traiteur', unite_base: 'piece', is_staple: false, purchase_unit: '1 barquette', interchangeable_group: null },
    // Dinde crue au poids (escalope + blanc de dinde en grammes), fusionnées.
    escalope_dinde: { display_name: 'escalope / blanc de dinde à cuire', aliases: ['escalope de dinde', 'blanc de dinde', 'blanc de dinde (g)', 'escalopes de dinde'], rayon: 'Boucherie', unite_base: 'g', is_staple: false, purchase_unit: 'au poids (~200 g)', interchangeable_group: null },
    blanc_poulet: { display_name: 'blanc de poulet', aliases: ['blanc de poulet', 'poulet', 'blancs de poulet', 'escalope de poulet'], rayon: 'Boucherie', unite_base: 'g', is_staple: false, purchase_unit: 'au poids', interchangeable_group: null },
    boeuf_hache: { display_name: 'bœuf haché 5%', aliases: ['boeuf haché 5%', 'bœuf haché 5%', 'boeuf haché', 'bœuf haché'], rayon: 'Boucherie', unite_base: 'g', is_staple: false, purchase_unit: '1 barquette', interchangeable_group: null },
    jambon_blanc: { display_name: 'jambon blanc', aliases: ['jambon blanc', 'jambon'], rayon: 'Charcuterie / Traiteur', unite_base: 'piece', is_staple: false, purchase_unit: '1 barquette', interchangeable_group: null },

    // --- Poissons -----------------------------------------------------------
    cabillaud: { display_name: 'cabillaud', aliases: ['filet de cabillaud', 'cabillaud'], rayon: 'Poissonnerie', unite_base: 'g', is_staple: false, purchase_unit: 'au poids', interchangeable_group: 'poisson_blanc' },
    colin: { display_name: 'colin', aliases: ['filet de colin', 'colin'], rayon: 'Poissonnerie', unite_base: 'g', is_staple: false, purchase_unit: 'au poids', interchangeable_group: 'poisson_blanc' },
    lieu_noir: { display_name: 'lieu noir', aliases: ['filet de lieu noir', 'lieu noir'], rayon: 'Poissonnerie', unite_base: 'g', is_staple: false, purchase_unit: 'au poids', interchangeable_group: 'poisson_blanc' },
    merlu: { display_name: 'merlu', aliases: ['filet de merlu', 'merlu'], rayon: 'Poissonnerie', unite_base: 'g', is_staple: false, purchase_unit: 'au poids', interchangeable_group: 'poisson_blanc' },
    // Pané = produit distinct, PAS dans le groupe poisson_blanc.
    poisson_pane: { display_name: 'poisson pané', aliases: ['poisson pané'], rayon: 'Surgelés', unite_base: 'g', is_staple: false, purchase_unit: '1 boîte', interchangeable_group: null },
    // Saumon fumé = rayon frais libre-service, PAS poissonnerie.
    saumon_fume: { display_name: 'saumon fumé', aliases: ['saumon fumé', 'saumon fume'], rayon: 'Charcuterie / Traiteur', unite_base: 'g', is_staple: false, purchase_unit: '1 paquet', interchangeable_group: null },
    // Conserve -> Épicerie, PAS poissonnerie.
    thon_naturel: { display_name: 'thon au naturel', aliases: ['thon au naturel', 'thon'], rayon: 'Épicerie', unite_base: 'g', is_staple: true, purchase_unit: '1 boîte', interchangeable_group: null },

    // --- Crèmerie -----------------------------------------------------------
    creme_legere: { display_name: 'crème légère', aliases: ['crème légère', 'creme legere'], rayon: 'Crèmerie', unite_base: 'ml', is_staple: false, purchase_unit: '1 pot / brique', interchangeable_group: null },
    emmental: { display_name: 'emmental', aliases: ['emmental', 'emmental râpé'], rayon: 'Crèmerie', unite_base: 'g', is_staple: false, purchase_unit: '1 sachet (râpé)', interchangeable_group: null },
    fromage_frais: { display_name: 'fromage frais', aliases: ['fromage frais'], rayon: 'Crèmerie', unite_base: 'g', is_staple: false, purchase_unit: '1 pot', interchangeable_group: null },
    lait_demi_ecreme: { display_name: 'lait demi-écrémé', aliases: ['lait demi-écrémé', 'lait demi ecreme', 'lait'], rayon: 'Crèmerie', unite_base: 'ml', is_staple: false, purchase_unit: '1 brique (1 L)', interchangeable_group: null },
    mozzarella: { display_name: 'mozzarella', aliases: ['mozzarella'], rayon: 'Crèmerie', unite_base: 'g', is_staple: false, purchase_unit: '1 boule', interchangeable_group: null },
    oeufs: { display_name: 'œufs', aliases: ['oeufs', 'œufs', 'oeuf', 'œuf'], rayon: 'Crèmerie', unite_base: 'piece', is_staple: false, purchase_unit: '1 boîte (6 ou 12)', interchangeable_group: null },
    skyr_nature: { display_name: 'skyr nature', aliases: ['skyr nature', 'skyr'], rayon: 'Crèmerie', unite_base: 'g', is_staple: false, purchase_unit: '1 pot', interchangeable_group: null },

    // --- Boulangerie ---------------------------------------------------------
    bagel_nature: { display_name: 'bagel nature', aliases: ['bagel nature', 'bagel'], rayon: 'Boulangerie', unite_base: 'piece', is_staple: false, purchase_unit: '1 sachet', interchangeable_group: null },
    pain_complet: { display_name: 'pain complet', aliases: ['pain complet'], rayon: 'Boulangerie', unite_base: 'piece', is_staple: false, purchase_unit: '1 paquet', interchangeable_group: null },
    // Fusion wrap + tortilla = même produit.
    wraps_ble: { display_name: 'wraps de blé', aliases: ['wrap de blé', 'tortilla de blé', 'wrap', 'tortilla', 'wraps'], rayon: 'Boulangerie', unite_base: 'piece', is_staple: false, purchase_unit: '1 sachet', interchangeable_group: null },

    // --- Épicerie (placard, longue conservation) -----------------------------
    beurre_cacahuete: { display_name: 'beurre de cacahuète', aliases: ['beurre de cacahuète', 'beurre de cacahuete'], rayon: 'Épicerie', unite_base: 'g', is_staple: true, purchase_unit: '1 pot', interchangeable_group: null },
    flocons_avoine: { display_name: 'flocons d’avoine', aliases: ["flocons d'avoine", 'flocons d avoine', 'avoine'], rayon: 'Épicerie', unite_base: 'g', is_staple: true, purchase_unit: '1 paquet', interchangeable_group: null },
    // Cuillères de recette converties en interne (c. à soupe ≈ 13, c. à café ≈ 5).
    // Jamais de cuillère sur la liste.
    huile_olive: { display_name: 'huile d’olive', aliases: ["huile d'olive", 'huile d olive', 'huile'], rayon: 'Épicerie', unite_base: 'ml', is_staple: true, purchase_unit: '1 bouteille', interchangeable_group: null },
    muesli: { display_name: 'muesli', aliases: ['muesli'], rayon: 'Épicerie', unite_base: 'g', is_staple: true, purchase_unit: '1 paquet', interchangeable_group: null },
    pates_crues: { display_name: 'pâtes', aliases: ['pâtes crues', 'pates crues', 'pâtes', 'pates'], rayon: 'Épicerie', unite_base: 'g', is_staple: true, purchase_unit: '1 paquet', interchangeable_group: null },
    riz_cru: { display_name: 'riz', aliases: ['riz cru', 'riz'], rayon: 'Épicerie', unite_base: 'g', is_staple: true, purchase_unit: '1 paquet', interchangeable_group: null },
    whey_vanille: { display_name: 'whey vanille', aliases: ['whey vanille', 'whey'], rayon: 'Épicerie', unite_base: 'g', is_staple: true, purchase_unit: '1 pot', interchangeable_group: null },
  };

  // --- Résolution -----------------------------------------------------------
  // Normalisation volontairement identique pour les alias ET les noms de
  // recettes : minuscules, accents ôtés, œ -> oe, espaces repliés.
  function normaliser(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[’´`]/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Index alias normalisé -> id canonique, construit une fois.
  const INDEX = {};
  Object.entries(INGREDIENTS).forEach(([id, def]) => {
    def.aliases.forEach((a) => {
      const n = normaliser(a);
      // Un alias ne peut appartenir qu'à UN canonique — vérifié par les tests.
      if (!(n in INDEX)) INDEX[n] = id;
    });
  });

  // Le point d'entrée du moteur : nom de recette -> { id, def } ou null.
  function resoudre(nom) {
    const id = INDEX[normaliser(nom)];
    return id ? { id, def: INGREDIENTS[id] } : null;
  }

  return { RAYONS, GROUPES, INGREDIENTS, INDEX, normaliser, resoudre };
}));
