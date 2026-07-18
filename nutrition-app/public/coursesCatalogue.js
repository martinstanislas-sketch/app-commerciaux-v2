'use strict';
// ============================================================================
//  RÉFÉRENTIEL CANONIQUE DES INGRÉDIENTS — moteur de la liste de courses.
//
//  Source de vérité pour : le dédoublonnage (un ingrédient de recette est mappé
//  vers un canonique via ses alias), le rayon d'achat, l'unité d'ACHAT (ce que
//  le client lit en magasin — jamais une unité de recette), le statut
//  placard/longue conservation (bloc replié), les groupes d'ingrédients
//  interchangeables, et la conversion cru->cuit (riz, poulet).
//
//  ⚠️ GÉNÉRÉ depuis le référentiel v2 (172 produits) construit sur TOUT le
//  catalogue `lib/recipes-v2.js` (382 recettes) — il couvre 100 % des
//  ingrédients : aucune recette ne doit produire de `warnings`.
//    - display_name : orthographe ACCENTUÉE reprise des recettes (affichée) ;
//    - aliases      : toutes les variantes réelles (pluriel, cru/cuit, « filet de ») ;
//    - category     : dérivée du rayon (le moteur s'en sert pour viande/poisson) ;
//    - pack_*       : conditionnements (arrondi « 3 boîtes ») ;
//    - conversion_cru_cuit : g cuit par g cru — le moteur ramène TOUT au cru.
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
    poisson_blanc: { display_name: 'poisson blanc (au choix)', rayon: 'Poissonnerie', category: 'poisson', note: 'Variétés interchangeables (cabillaud, colin, merlu, lieu noir) — prends celle que tu préfères, au poids total.' },
  };

  // unite_base : 'g' | 'ml' | 'piece' — l'unité de CALCUL pour l'agrégation.
  // purchase_unit : ce que le client achète (affiché en petit sur la ligne).
  const INGREDIENTS = {
    courgette: { display_name: "courgette",aliases: ["courgette","courgettes"],rayon: "Fruits & légumes",category: "legume",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    tomate: { display_name: "tomate",aliases: ["tomate","tomates"],rayon: "Fruits & légumes",category: "legume",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    carottes: { display_name: "carottes",aliases: ["carottes","carotte"],rayon: "Fruits & légumes",category: "legume",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    banane: { display_name: "banane",aliases: ["banane","bananes"],rayon: "Fruits & légumes",category: "fruit",unite_base: "piece",is_staple: false,purchase_unit: "à l'unité",interchangeable_group: null },
    pommes_de_terre: { display_name: "pommes de terre",aliases: ["pommes de terre","pomme de terre"],rayon: "Fruits & légumes",category: "legume",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    epinards: { display_name: "épinards",aliases: ["epinards"],rayon: "Fruits & légumes",category: "legume",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    concombre: { display_name: "concombre",aliases: ["concombre","concombres"],rayon: "Fruits & légumes",category: "legume",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    poivron: { display_name: "poivron",aliases: ["poivron","poivrons"],rayon: "Fruits & légumes",category: "legume",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    brocoli: { display_name: "brocoli",aliases: ["brocoli","brocolis"],rayon: "Fruits & légumes",category: "legume",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    pomme: { display_name: "pomme",aliases: ["pomme"],rayon: "Fruits & légumes",category: "fruit",unite_base: "piece",is_staple: false,purchase_unit: "à l'unité",interchangeable_group: null },
    salade_verte: { display_name: "salade verte",aliases: ["salade verte","salade"],rayon: "Fruits & légumes",category: "legume",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    tomates_cerises: { display_name: "tomates cerises",aliases: ["tomates cerises"],rayon: "Fruits & légumes",category: "legume",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    oignon: { display_name: "oignon",aliases: ["oignon"],rayon: "Fruits & légumes",category: "legume",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    ail: { display_name: "ail",aliases: ["ail"],rayon: "Fruits & légumes",category: "legume",unite_base: "piece",is_staple: false,purchase_unit: "à l'unité",interchangeable_group: null },
    avocat: { display_name: "avocat",aliases: ["avocat"],rayon: "Fruits & légumes",category: "fruit",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    fruits_rouges: { display_name: "fruits rouges",aliases: ["fruits rouges"],rayon: "Fruits & légumes",category: "fruit",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    champignons: { display_name: "champignons",aliases: ["champignons","champignon"],rayon: "Fruits & légumes",category: "legume",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    citron: { display_name: "citron",aliases: ["citron","citrons"],rayon: "Fruits & légumes",category: "fruit",unite_base: "piece",is_staple: false,purchase_unit: "à l'unité",interchangeable_group: null },
    aubergine: { display_name: "aubergine",aliases: ["aubergine"],rayon: "Fruits & légumes",category: "legume",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    basilic: { display_name: "basilic",aliases: ["basilic"],rayon: "Fruits & légumes",category: "legume",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    haricots_verts: { display_name: "haricots verts",aliases: ["haricots verts"],rayon: "Fruits & légumes",category: "legume",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    mais: { display_name: "maïs",aliases: ["mais"],rayon: "Fruits & légumes",category: "legume",unite_base: "g",is_staple: false,purchase_unit: "1 boîte",interchangeable_group: null },
    petits_pois: { display_name: "petits pois",aliases: ["petits pois"],rayon: "Fruits & légumes",category: "legume",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    poire: { display_name: "poire",aliases: ["poire"],rayon: "Fruits & légumes",category: "fruit",unite_base: "piece",is_staple: false,purchase_unit: "à l'unité",interchangeable_group: null },
    fraises: { display_name: "fraises",aliases: ["fraises"],rayon: "Fruits & légumes",category: "fruit",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    persil: { display_name: "persil",aliases: ["persil"],rayon: "Fruits & légumes",category: "legume",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    roquette: { display_name: "roquette",aliases: ["roquette"],rayon: "Fruits & légumes",category: "legume",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    patate_douce: { display_name: "patate douce",aliases: ["patate douce"],rayon: "Fruits & légumes",category: "legume",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    ananas: { display_name: "ananas",aliases: ["ananas"],rayon: "Fruits & légumes",category: "fruit",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    chou_fleur: { display_name: "chou-fleur",aliases: ["chou-fleur","chou fleur"],rayon: "Fruits & légumes",category: "legume",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    clementine: { display_name: "clémentine",aliases: ["clementine"],rayon: "Fruits & légumes",category: "fruit",unite_base: "piece",is_staple: false,purchase_unit: "à l'unité",interchangeable_group: null },
    kiwi: { display_name: "kiwi",aliases: ["kiwi"],rayon: "Fruits & légumes",category: "fruit",unite_base: "piece",is_staple: false,purchase_unit: "à l'unité",interchangeable_group: null },
    mangue: { display_name: "mangue",aliases: ["mangue"],rayon: "Fruits & légumes",category: "fruit",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    menthe: { display_name: "menthe",aliases: ["menthe"],rayon: "Fruits & légumes",category: "legume",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    peche: { display_name: "pêche",aliases: ["peche"],rayon: "Fruits & légumes",category: "fruit",unite_base: "piece",is_staple: false,purchase_unit: "à l'unité",interchangeable_group: null },
    aneth: { display_name: "aneth",aliases: ["aneth"],rayon: "Fruits & légumes",category: "legume",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    piment_doux: { display_name: "piment doux",aliases: ["piment doux"],rayon: "Fruits & légumes",category: "legume",unite_base: "g",is_staple: false,purchase_unit: "1 pot d'épice",interchangeable_group: null },
    raisin: { display_name: "raisin",aliases: ["raisin"],rayon: "Fruits & légumes",category: "fruit",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    raisins_secs: { display_name: "raisins secs",aliases: ["raisins secs"],rayon: "Fruits & légumes",category: "fruit",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    blanc_de_poulet: { display_name: "blanc de poulet",aliases: ["blanc de poulet","blanc de poulet cuit"],rayon: "Boucherie",category: "viande",unite_base: "g",is_staple: false,purchase_unit: "au poids",interchangeable_group: null,conversion_cru_cuit: {g_cuit_par_g_cru: 0.7} },
    escalope_de_dinde: { display_name: "escalope de dinde",aliases: ["escalope de dinde"],rayon: "Boucherie",category: "viande",unite_base: "g",is_staple: false,purchase_unit: "au poids",interchangeable_group: null },
    boeuf_hache_5: { display_name: "boeuf haché 5%",aliases: ["boeuf hache 5%","boeuf haché","bœuf haché"],rayon: "Boucherie",category: "viande",unite_base: "g",is_staple: false,purchase_unit: "au poids",interchangeable_group: null },
    blanc_de_dinde: { display_name: "blanc de dinde",aliases: ["blanc de dinde"],rayon: "Boucherie",category: "viande",unite_base: "g",is_staple: false,purchase_unit: "au poids",interchangeable_group: null },
    boeuf_emince: { display_name: "boeuf émincé",aliases: ["boeuf emince"],rayon: "Boucherie",category: "viande",unite_base: "g",is_staple: false,purchase_unit: "au poids",interchangeable_group: null },
    steak_hache_5: { display_name: "steak haché 5%",aliases: ["steak hache 5%"],rayon: "Boucherie",category: "viande",unite_base: "g",is_staple: false,purchase_unit: "au poids",interchangeable_group: null },
    escalope_de_veau: { display_name: "escalope de veau",aliases: ["escalope de veau"],rayon: "Boucherie",category: "viande",unite_base: "g",is_staple: false,purchase_unit: "au poids",interchangeable_group: null },
    agneau_hache: { display_name: "agneau haché",aliases: ["agneau hache"],rayon: "Boucherie",category: "viande",unite_base: "g",is_staple: false,purchase_unit: "au poids",interchangeable_group: null },
    dinde_hachee: { display_name: "dinde hachée",aliases: ["dinde hachee"],rayon: "Boucherie",category: "viande",unite_base: "g",is_staple: false,purchase_unit: "au poids",interchangeable_group: null },
    escalope_de_poulet: { display_name: "escalope de poulet",aliases: ["escalope de poulet"],rayon: "Boucherie",category: "viande",unite_base: "g",is_staple: false,purchase_unit: "au poids",interchangeable_group: null },
    saucisse_de_volaille: { display_name: "saucisse de volaille",aliases: ["saucisse de volaille"],rayon: "Boucherie",category: "viande",unite_base: "g",is_staple: false,purchase_unit: "au poids",interchangeable_group: null },
    tofu_ferme: { display_name: "tofu ferme",aliases: ["tofu ferme"],rayon: "Charcuterie / Traiteur",category: "charcuterie",unite_base: "g",is_staple: false,purchase_unit: "1 barquette",interchangeable_group: null },
    houmous: { display_name: "houmous",aliases: ["houmous"],rayon: "Charcuterie / Traiteur",category: "charcuterie",unite_base: "g",is_staple: false,purchase_unit: "1 pot",interchangeable_group: null },
    jambon_blanc: { display_name: "jambon blanc",aliases: ["jambon blanc","jambon"],rayon: "Charcuterie / Traiteur",category: "charcuterie",unite_base: "piece",is_staple: false,purchase_unit: "1 barquette",interchangeable_group: null },
    tofu_nature: { display_name: "tofu nature",aliases: ["tofu nature"],rayon: "Charcuterie / Traiteur",category: "charcuterie",unite_base: "g",is_staple: false,purchase_unit: "1 barquette",interchangeable_group: null },
    falafels_sans_gluten: { display_name: "falafels sans gluten",aliases: ["falafels sans gluten"],rayon: "Charcuterie / Traiteur",category: "charcuterie",unite_base: "g",is_staple: false,purchase_unit: "1 barquette",interchangeable_group: null },
    saumon_fume: { display_name: "saumon fumé",aliases: ["saumon fume"],rayon: "Charcuterie / Traiteur",category: "charcuterie",unite_base: "g",is_staple: false,purchase_unit: "1 barquette",interchangeable_group: null },
    falafels: { display_name: "falafels",aliases: ["falafels"],rayon: "Charcuterie / Traiteur",category: "charcuterie",unite_base: "g",is_staple: false,purchase_unit: "1 barquette",interchangeable_group: null },
    tempeh: { display_name: "tempeh",aliases: ["tempeh"],rayon: "Charcuterie / Traiteur",category: "charcuterie",unite_base: "g",is_staple: false,purchase_unit: "1 barquette",interchangeable_group: null },
    tofu_soyeux: { display_name: "tofu soyeux",aliases: ["tofu soyeux"],rayon: "Charcuterie / Traiteur",category: "charcuterie",unite_base: "g",is_staple: false,purchase_unit: "1 barquette",interchangeable_group: null },
    saumon: { display_name: "saumon",aliases: ["saumon","filet de saumon"],rayon: "Poissonnerie",category: "poisson",unite_base: "g",is_staple: false,purchase_unit: "au poids",interchangeable_group: null },
    crevettes: { display_name: "crevettes",aliases: ["crevettes"],rayon: "Poissonnerie",category: "poisson",unite_base: "g",is_staple: false,purchase_unit: "au poids",interchangeable_group: null },
    cabillaud: { display_name: "cabillaud",aliases: ["cabillaud","filet de cabillaud"],rayon: "Poissonnerie",category: "poisson",unite_base: "g",is_staple: false,purchase_unit: "au poids",interchangeable_group: "poisson_blanc" },
    merlu: { display_name: "merlu",aliases: ["merlu","filet de merlu"],rayon: "Poissonnerie",category: "poisson",unite_base: "g",is_staple: false,purchase_unit: "au poids",interchangeable_group: "poisson_blanc" },
    colin: { display_name: "colin",aliases: ["colin","filet de colin"],rayon: "Poissonnerie",category: "poisson",unite_base: "g",is_staple: false,purchase_unit: "au poids",interchangeable_group: "poisson_blanc" },
    truite: { display_name: "truite",aliases: ["truite","filet de truite"],rayon: "Poissonnerie",category: "poisson",unite_base: "g",is_staple: false,purchase_unit: "au poids",interchangeable_group: null },
    lieu_noir: { display_name: "lieu noir",aliases: ["lieu noir","filet de lieu noir"],rayon: "Poissonnerie",category: "poisson",unite_base: "g",is_staple: false,purchase_unit: "au poids",interchangeable_group: "poisson_blanc" },
    oeufs: { display_name: "œufs",aliases: ["oeufs","oeuf"],rayon: "Crèmerie",category: "cremerie",unite_base: "piece",is_staple: false,purchase_unit: "1 boîte (6 ou 12)",interchangeable_group: null,pack_options: [6,12],pack_nom: "boîte" },
    lait_demi_ecreme: { display_name: "lait demi-écrémé",aliases: ["lait demi-ecreme","lait demi ecreme","lait"],rayon: "Crèmerie",category: "cremerie",unite_base: "ml",is_staple: false,purchase_unit: "1 brique (1 L)",interchangeable_group: null,pack_size: 1000 },
    skyr_nature: { display_name: "skyr nature",aliases: ["skyr nature","skyr"],rayon: "Crèmerie",category: "cremerie",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    emmental: { display_name: "emmental",aliases: ["emmental","emmental râpé"],rayon: "Crèmerie",category: "cremerie",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    creme_legere: { display_name: "crème légère",aliases: ["creme legere"],rayon: "Crèmerie",category: "cremerie",unite_base: "ml",is_staple: false,purchase_unit: "1 pot / brique",interchangeable_group: null },
    fromage_blanc: { display_name: "fromage blanc",aliases: ["fromage blanc"],rayon: "Crèmerie",category: "cremerie",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    fromage_frais: { display_name: "fromage frais",aliases: ["fromage frais"],rayon: "Crèmerie",category: "cremerie",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    feta: { display_name: "feta",aliases: ["feta"],rayon: "Crèmerie",category: "cremerie",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    mozzarella: { display_name: "mozzarella",aliases: ["mozzarella"],rayon: "Crèmerie",category: "cremerie",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    parmesan: { display_name: "parmesan",aliases: ["parmesan"],rayon: "Crèmerie",category: "cremerie",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    beurre: { display_name: "beurre",aliases: ["beurre"],rayon: "Crèmerie",category: "cremerie",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    yaourt_grec: { display_name: "yaourt grec",aliases: ["yaourt grec"],rayon: "Crèmerie",category: "cremerie",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    ricotta: { display_name: "ricotta",aliases: ["ricotta"],rayon: "Crèmerie",category: "cremerie",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    yaourt_nature: { display_name: "yaourt nature",aliases: ["yaourt nature"],rayon: "Crèmerie",category: "cremerie",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    yaourt_soja_nature: { display_name: "yaourt soja nature",aliases: ["yaourt soja nature"],rayon: "Crèmerie",category: "cremerie",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    chevre_frais: { display_name: "chèvre frais",aliases: ["chevre frais"],rayon: "Crèmerie",category: "cremerie",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    cheddar: { display_name: "cheddar",aliases: ["cheddar"],rayon: "Crèmerie",category: "cremerie",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    halloumi: { display_name: "halloumi",aliases: ["halloumi"],rayon: "Crèmerie",category: "cremerie",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    pain_complet: { display_name: "pain complet",aliases: ["pain complet"],rayon: "Boulangerie",category: "boulangerie",unite_base: "piece",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    galettes_de_riz: { display_name: "galettes de riz",aliases: ["galettes de riz"],rayon: "Boulangerie",category: "boulangerie",unite_base: "piece",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    // Wrap et tortilla de blé = le même achat en magasin : un seul produit.
    // Les versions maïs / sans gluten restent séparées (enjeu allergène).
    wrap_de_ble: { display_name: "wraps / tortillas de blé",aliases: ["wrap de ble","tortilla de ble","wraps de ble","tortillas de ble","wrap","wraps"],rayon: "Boulangerie",category: "boulangerie",unite_base: "piece",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    crackers_de_ble: { display_name: "crackers de blé",aliases: ["crackers de ble"],rayon: "Boulangerie",category: "boulangerie",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    pain_sans_gluten: { display_name: "pain sans gluten",aliases: ["pain sans gluten"],rayon: "Boulangerie",category: "boulangerie",unite_base: "piece",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    bagel_nature: { display_name: "bagel nature",aliases: ["bagel nature","bagel"],rayon: "Boulangerie",category: "boulangerie",unite_base: "piece",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    galette_de_sarrasin: { display_name: "galette de sarrasin",aliases: ["galette de sarrasin"],rayon: "Boulangerie",category: "boulangerie",unite_base: "piece",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    galettes_de_mais: { display_name: "galettes de maïs",aliases: ["galettes de mais"],rayon: "Boulangerie",category: "boulangerie",unite_base: "piece",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    pain_pita: { display_name: "pain pita",aliases: ["pain pita"],rayon: "Boulangerie",category: "boulangerie",unite_base: "piece",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    pate_brisee: { display_name: "pâte brisée",aliases: ["pate brisee"],rayon: "Boulangerie",category: "boulangerie",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    tortillas_de_mais: { display_name: "tortillas de maïs",aliases: ["tortillas de mais"],rayon: "Boulangerie",category: "boulangerie",unite_base: "piece",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    wrap_de_mais_sans_gluten: { display_name: "wrap de maïs sans gluten",aliases: ["wrap de mais sans gluten"],rayon: "Boulangerie",category: "boulangerie",unite_base: "piece",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    huile_d_olive: { display_name: "huile d’olive",aliases: ["huile d'olive","huile d olive","huile"],rayon: "Épicerie",category: "epicerie",unite_base: "ml",is_staple: true,purchase_unit: "1 bouteille",interchangeable_group: null },
    riz: { display_name: "riz",aliases: ["riz","riz cru","riz cuit"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null,conversion_cru_cuit: {g_cuit_par_g_cru: 2.7} },
    tomates_concassees: { display_name: "tomates concassées",aliases: ["tomates concassees","tomate concassée"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 boîte (400 g)",interchangeable_group: null,pack_size: 400 },
    pois_chiches: { display_name: "pois chiches cuits",aliases: ["pois chiches","pois chiches cuits"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 boîte/bocal (400 g)",interchangeable_group: null },
    jus_de_citron: { display_name: "jus de citron",aliases: ["jus de citron"],rayon: "Épicerie",category: "epicerie",unite_base: "ml",is_staple: true,purchase_unit: "1 flacon",interchangeable_group: null },
    pates: { display_name: "pâtes",aliases: ["pates crues","pates"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    lentilles: { display_name: "lentilles cuites",aliases: ["lentilles","lentilles cuites"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 boîte/bocal (400 g)",interchangeable_group: null },
    thon_au_naturel: { display_name: "thon au naturel",aliases: ["thon au naturel","thon"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 boîte",interchangeable_group: null },
    tamari: { display_name: "tamari",aliases: ["tamari"],rayon: "Épicerie",category: "epicerie",unite_base: "ml",is_staple: true,purchase_unit: "1 bouteille",interchangeable_group: null },
    flocons_d_avoine: { display_name: "flocons d’avoine",aliases: ["flocons d'avoine","flocons d avoine","avoine"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    huile_de_colza: { display_name: "huile de colza",aliases: ["huile de colza"],rayon: "Épicerie",category: "epicerie",unite_base: "ml",is_staple: true,purchase_unit: "1 bouteille",interchangeable_group: null },
    miel: { display_name: "miel",aliases: ["miel"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 pot",interchangeable_group: null },
    beurre_de_cacahuete: { display_name: "beurre de cacahuète",aliases: ["beurre de cacahuete"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 pot",interchangeable_group: null },
    cannelle: { display_name: "cannelle",aliases: ["cannelle"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 pot d'épice",interchangeable_group: null },
    flocons_d_avoine_sans_gluten: { display_name: "flocons d’avoine sans gluten",aliases: ["flocons d'avoine sans gluten"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    haricots_rouges: { display_name: "haricots rouges cuits",aliases: ["haricots rouges","haricots rouges cuits"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 boîte/bocal (400 g)",interchangeable_group: null },
    paprika: { display_name: "paprika",aliases: ["paprika"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 pot d'épice",interchangeable_group: null },
    curry: { display_name: "curry",aliases: ["curry"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 pot d'épice",interchangeable_group: null },
    lait_de_coco: { display_name: "lait de coco",aliases: ["lait de coco"],rayon: "Épicerie",category: "epicerie",unite_base: "ml",is_staple: true,purchase_unit: "1 brique/boîte",interchangeable_group: null },
    quinoa: { display_name: "quinoa",aliases: ["quinoa cru","quinoa"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    amandes: { display_name: "amandes",aliases: ["amandes"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    bouillon_de_legumes: { display_name: "bouillon de légumes",aliases: ["bouillon de legumes"],rayon: "Épicerie",category: "epicerie",unite_base: "ml",is_staple: true,purchase_unit: "1 brique/cube",interchangeable_group: null },
    compote_sans_sucres_ajoutes: { display_name: "compote sans sucres ajoutés",aliases: ["compote sans sucres ajoutes"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    graines_de_chia: { display_name: "graines de chia",aliases: ["graines de chia"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    haricots_blancs: { display_name: "haricots blancs cuits",aliases: ["haricots blancs","haricots blancs cuits"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 boîte/bocal (400 g)",interchangeable_group: null },
    olives_noires: { display_name: "olives noires",aliases: ["olives noires"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    riz_arborio: { display_name: "riz arborio",aliases: ["riz arborio"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    graines_de_sesame: { display_name: "graines de sésame",aliases: ["graines de sesame"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    lait_de_riz: { display_name: "lait de riz",aliases: ["lait de riz"],rayon: "Épicerie",category: "epicerie",unite_base: "ml",is_staple: true,purchase_unit: "1 brique (1 L)",interchangeable_group: null },
    muesli: { display_name: "muesli",aliases: ["muesli"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    noix: { display_name: "noix",aliases: ["noix"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    nouilles_de_riz: { display_name: "nouilles de riz",aliases: ["nouilles de riz"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    polenta: { display_name: "polenta",aliases: ["polenta"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    cacao_non_sucre: { display_name: "cacao non sucré",aliases: ["cacao non sucre"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    cereales_completes: { display_name: "céréales complètes",aliases: ["cereales completes"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    chocolat_noir: { display_name: "chocolat noir",aliases: ["chocolat noir"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    compote_de_pomme_sans_sucre_ajoute: { display_name: "compote de pomme sans sucre ajouté",aliases: ["compote de pomme sans sucre ajoute"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    pates_sans_gluten: { display_name: "pâtes sans gluten",aliases: ["pates sans gluten"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    semoule: { display_name: "semoule",aliases: ["semoule","semoule crue"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    whey_vanille: { display_name: "whey vanille",aliases: ["whey vanille"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    boulgour: { display_name: "boulgour",aliases: ["boulgour","boulgour cru"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    cumin: { display_name: "cumin",aliases: ["cumin"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 pot d'épice",interchangeable_group: null },
    lait_d_amande: { display_name: "lait d’amande",aliases: ["lait d'amande"],rayon: "Épicerie",category: "epicerie",unite_base: "ml",is_staple: true,purchase_unit: "1 brique (1 L)",interchangeable_group: null },
    lait_de_soja: { display_name: "lait de soja",aliases: ["lait de soja"],rayon: "Épicerie",category: "epicerie",unite_base: "ml",is_staple: true,purchase_unit: "1 brique (1 L)",interchangeable_group: null },
    pesto: { display_name: "pesto",aliases: ["pesto"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: false,purchase_unit: "1 pot",interchangeable_group: null },
    whey_chocolat: { display_name: "whey chocolat",aliases: ["whey chocolat"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    herbes_de_provence: { display_name: "herbes de Provence",aliases: ["herbes de Provence"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 pot d'épice",interchangeable_group: null },
    lentilles_corail: { display_name: "lentilles corail",aliases: ["lentilles corail crues","lentilles corail"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    noisettes: { display_name: "noisettes",aliases: ["noisettes"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    pois_casses: { display_name: "pois cassés cuits",aliases: ["pois casses","pois cassés cuits"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 boîte/bocal",interchangeable_group: null },
    sirop_d_agave: { display_name: "sirop d’agave",aliases: ["sirop d'agave"],rayon: "Épicerie",category: "epicerie",unite_base: "ml",is_staple: true,purchase_unit: "1 flacon",interchangeable_group: null },
    tahini: { display_name: "tahini",aliases: ["tahini"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 pot",interchangeable_group: null },
    cacahuetes: { display_name: "cacahuètes",aliases: ["cacahuetes"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    confiture: { display_name: "confiture",aliases: ["confiture"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 pot",interchangeable_group: null },
    coquillettes: { display_name: "coquillettes",aliases: ["coquillettes","coquillettes crues"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    corn_flakes: { display_name: "corn flakes",aliases: ["corn flakes"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    dattes: { display_name: "dattes",aliases: ["dattes"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    fecule_de_mais: { display_name: "fécule de maïs",aliases: ["fecule de mais"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    feuilles_de_lasagne: { display_name: "feuilles de lasagne",aliases: ["feuilles de lasagne"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    gnocchi: { display_name: "gnocchi",aliases: ["gnocchi"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    levure_chimique_sans_gluten: { display_name: "levure chimique sans gluten",aliases: ["levure chimique sans gluten"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 pot d'épice",interchangeable_group: null },
    nouilles_de_ble: { display_name: "nouilles de blé",aliases: ["nouilles de ble"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    olives_vertes: { display_name: "olives vertes",aliases: ["olives vertes"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    pesto_rouge: { display_name: "pesto rouge",aliases: ["pesto rouge"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: false,purchase_unit: "1 pot",interchangeable_group: null },
    puree_d_amandes: { display_name: "purée d’amandes",aliases: ["puree d'amandes"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 pot",interchangeable_group: null },
    riz_souffle_nature: { display_name: "riz soufflé nature",aliases: ["riz souffle nature"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    sauce_soja: { display_name: "sauce soja",aliases: ["sauce soja"],rayon: "Épicerie",category: "epicerie",unite_base: "ml",is_staple: true,purchase_unit: "1 bouteille",interchangeable_group: null },
    sel: { display_name: "sel",aliases: ["sel"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 pot d'épice",interchangeable_group: null },
    sirop_d_erable: { display_name: "sirop d’érable",aliases: ["sirop d'erable"],rayon: "Épicerie",category: "epicerie",unite_base: "ml",is_staple: true,purchase_unit: "1 flacon",interchangeable_group: null },
    spaghetti: { display_name: "spaghetti",aliases: ["spaghetti"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    vinaigre: { display_name: "vinaigre",aliases: ["vinaigre"],rayon: "Épicerie",category: "epicerie",unite_base: "ml",is_staple: true,purchase_unit: "1 bouteille",interchangeable_group: null },
    whey: { display_name: "whey",aliases: ["whey"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 paquet",interchangeable_group: null },
    sardines_au_naturel: { display_name: "sardines au naturel",aliases: ["sardines au naturel"],rayon: "Épicerie",category: "epicerie",unite_base: "g",is_staple: true,purchase_unit: "1 boîte",interchangeable_group: null },
    edamame: { display_name: "edamame",aliases: ["edamame"],rayon: "Surgelés",category: "surgele",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    poisson_pane: { display_name: "poisson pané",aliases: ["poisson pane"],rayon: "Surgelés",category: "surgele",unite_base: "g",is_staple: false,purchase_unit: "1 paquet",interchangeable_group: null },
    eau: { display_name: "eau",aliases: ["eau"],rayon: "Épicerie",category: "epicerie",unite_base: "ml",is_staple: true,purchase_unit: "eau du robinet",interchangeable_group: null },  };

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
