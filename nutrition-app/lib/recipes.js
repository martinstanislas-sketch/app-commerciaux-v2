// recipes.js
// Banque de recettes pour le MODE DEMO (sans appel IA).
// Chaque recette est taguee pour permettre un filtrage strict :
//   - type        : petit-dejeuner | plat (dejeuner/diner) | collation
//   - cuisines    : pour matcher les gouts (francaise, italienne, asiatique...)
//   - regime      : regimes COMPATIBLES (vegetarien, vegan, sans-porc, sans-gluten...)
//   - budget      : eco | normal  (eco passe partout, normal seulement si budget normal)
//   - allergenes  : familles d'allergenes presentes (gluten, lactose, oeuf, arachide,
//                   fruits-a-coque, poisson, crustaces, soja, sesame)
//   - motsCles    : aliments principaux, pour filtrer les "detestes" / matcher les "aimes"
// kcal/proteines/glucides/lipides : estimations par portion. tempsMinutes : preparation.
//
// Les quantites des ingredients sont pour 1 portion ; le plan les multiplie au besoin.
// Les etapes sont detaillees (feu, temps, repere de cuisson) pour cuisiner sans deviner.

const RECIPES = [
  // ---------------- PETIT-DEJEUNER ----------------
  {
    id: 'pd-flocons-banane',
    nom: 'Flocons d\'avoine, banane et miel',
    type: 'petit-dejeuner',
    cuisines: ['francaise', 'americaine'],
    regime: ['vegetarien', 'sans-porc'],
    budget: 'eco',
    allergenes: ['gluten', 'lactose'],
    motsCles: ['avoine', 'banane', 'miel', 'lait'],
    kcal: 360,
    proteines: 12,
    glucides: 58,
    lipides: 8,
    tempsMinutes: 5,
    ingredients: [
      { nom: 'Flocons d\'avoine', quantite: 50, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Lait demi-ecreme', quantite: 200, unite: 'ml', rayon: 'Cremerie' },
      { nom: 'Banane', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Miel', quantite: 1, unite: 'c. a cafe', rayon: 'Epicerie' },
    ],
    etapes: [
      'Verser les 200 ml de lait dans une petite casserole et chauffer a feu moyen jusqu\'aux premiers fremissements (sans faire bouillir).',
      'Ajouter les 50 g de flocons d\'avoine, baisser sur feu doux et cuire 4 a 5 minutes en remuant souvent, jusqu\'a une texture cremeuse.',
      'Verser dans un bol et laisser tiedir 1 minute : le porridge epaissit en refroidissant.',
      'Couper la banane en rondelles, les disposer dessus et napper de la cuillere a cafe de miel.',
    ],
  },
  {
    id: 'pd-yaourt-granola',
    nom: 'Yaourt grec, granola et fruits rouges',
    type: 'petit-dejeuner',
    cuisines: ['mediterraneenne', 'francaise'],
    regime: ['vegetarien', 'sans-porc'],
    budget: 'normal',
    allergenes: ['gluten', 'lactose', 'fruits-a-coque'],
    motsCles: ['yaourt', 'granola', 'fruits rouges', 'amande'],
    kcal: 340,
    proteines: 18,
    glucides: 40,
    lipides: 12,
    tempsMinutes: 5,
    ingredients: [
      { nom: 'Yaourt grec', quantite: 150, unite: 'g', rayon: 'Cremerie' },
      { nom: 'Granola', quantite: 40, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Fruits rouges surgeles', quantite: 80, unite: 'g', rayon: 'Surgeles' },
    ],
    etapes: [
      'Sortir les 80 g de fruits rouges 10 minutes a l\'avance, ou les passer 30 secondes au micro-ondes pour les attendrir.',
      'Verser les 150 g de yaourt grec au fond d\'un bol ou d\'un verre.',
      'Repartir les 40 g de granola par-dessus, puis ajouter les fruits rouges et leur jus.',
      'Servir aussitot pour garder le granola croquant.',
    ],
  },
  {
    id: 'pd-oeufs-brouilles',
    nom: 'Oeufs brouilles et pain complet',
    type: 'petit-dejeuner',
    cuisines: ['francaise', 'americaine'],
    regime: ['vegetarien', 'sans-porc'],
    budget: 'eco',
    allergenes: ['gluten', 'oeuf', 'lactose'],
    motsCles: ['oeuf', 'pain', 'beurre'],
    kcal: 380,
    proteines: 22,
    glucides: 30,
    lipides: 18,
    tempsMinutes: 10,
    ingredients: [
      { nom: 'Oeufs', quantite: 2, unite: 'piece', rayon: 'Cremerie' },
      { nom: 'Pain complet', quantite: 60, unite: 'g', rayon: 'Boulangerie' },
      { nom: 'Beurre', quantite: 10, unite: 'g', rayon: 'Cremerie' },
    ],
    etapes: [
      'Battre les 2 oeufs dans un bol avec une pincee de sel et un tour de moulin a poivre.',
      'Faire fondre les 10 g de beurre dans une poele a feu doux, sans le laisser colorer.',
      'Verser les oeufs et remuer sans arret a la spatule 2 a 3 minutes : retirer du feu quand ils sont encore brillants et un peu baveux (ils finissent de cuire hors du feu).',
      'Griller les 60 g de pain complet et servir aussitot avec les oeufs.',
    ],
  },
  {
    id: 'pd-smoothie-vegan',
    nom: 'Smoothie banane, epinards et beurre de cacahuete',
    type: 'petit-dejeuner',
    cuisines: ['americaine'],
    regime: ['vegetarien', 'vegan', 'sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: ['arachide'],
    motsCles: ['banane', 'epinard', 'cacahuete', 'boisson vegetale'],
    kcal: 330,
    proteines: 11,
    glucides: 45,
    lipides: 13,
    tempsMinutes: 5,
    ingredients: [
      { nom: 'Banane', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Epinards frais', quantite: 30, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Beurre de cacahuete', quantite: 20, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Boisson vegetale (avoine)', quantite: 200, unite: 'ml', rayon: 'Epicerie' },
    ],
    etapes: [
      'Rincer les 30 g d\'epinards et eplucher la banane (la couper en troncons pour faciliter le mixage).',
      'Mettre dans le blender la boisson vegetale, la banane, les epinards et les 20 g de beurre de cacahuete.',
      'Mixer 45 a 60 secondes jusqu\'a une texture parfaitement lisse, sans morceaux d\'epinard.',
      'Verser dans un grand verre ; ajouter un glacon si vous l\'aimez bien frais.',
    ],
  },
  {
    id: 'pd-pancakes-proteines',
    nom: 'Pancakes proteines a la banane',
    type: 'petit-dejeuner',
    cuisines: ['americaine'],
    regime: ['vegetarien', 'sans-porc'],
    budget: 'eco',
    allergenes: ['oeuf', 'gluten'],
    motsCles: ['banane', 'oeuf', 'flocons', 'pancake'],
    kcal: 400,
    proteines: 24,
    glucides: 44,
    lipides: 12,
    tempsMinutes: 15,
    ingredients: [
      { nom: 'Banane', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Oeufs', quantite: 2, unite: 'piece', rayon: 'Cremerie' },
      { nom: 'Flocons d\'avoine', quantite: 40, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Mixer les 40 g de flocons d\'avoine quelques secondes pour obtenir une farine grossiere.',
      'Ecraser la banane a la fourchette, ajouter les 2 oeufs et la farine d\'avoine, melanger jusqu\'a une pate homogene. Laisser reposer 5 minutes.',
      'Chauffer une poele anti-adhesive a feu moyen (a peine huilee).',
      'Verser de petites louches de pate, cuire 1 a 2 minutes : retourner quand des bulles apparaissent en surface, puis cuire 1 minute de l\'autre cote.',
      'Reserver au chaud et repeter jusqu\'a epuisement de la pate (3 a 4 pancakes).',
    ],
  },
  {
    id: 'pd-tartines-avocat',
    nom: 'Tartines d\'avocat et tomate',
    type: 'petit-dejeuner',
    cuisines: ['mediterraneenne'],
    regime: ['vegetarien', 'vegan', 'sans-porc'],
    budget: 'normal',
    allergenes: ['gluten'],
    motsCles: ['avocat', 'tomate', 'pain'],
    kcal: 350,
    proteines: 9,
    glucides: 38,
    lipides: 18,
    tempsMinutes: 8,
    ingredients: [
      { nom: 'Pain complet', quantite: 70, unite: 'g', rayon: 'Boulangerie' },
      { nom: 'Avocat', quantite: 0.5, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Tomate', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'Griller les 70 g de pain complet jusqu\'a ce qu\'il soit bien dore et croustillant.',
      'Ecraser la demi-avocat a la fourchette avec une pincee de sel et quelques gouttes de citron, puis l\'etaler sur le pain.',
      'Couper la tomate en fines rondelles, les disposer sur l\'avocat.',
      'Saler, poivrer et, si vous voulez, ajouter un filet d\'huile d\'olive avant de servir.',
    ],
  },

  // ---------------- DEJEUNER / DINER (plats principaux) ----------------
  {
    id: 'plat-poulet-riz-curry',
    nom: 'Poulet au curry et riz basmati',
    type: 'plat',
    cuisines: ['asiatique', 'indienne'],
    regime: ['sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: ['lactose'],
    motsCles: ['poulet', 'riz', 'curry', 'creme'],
    kcal: 560,
    proteines: 38,
    glucides: 60,
    lipides: 16,
    tempsMinutes: 25,
    ingredients: [
      { nom: 'Filet de poulet', quantite: 130, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Riz basmati', quantite: 70, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Creme de coco', quantite: 50, unite: 'ml', rayon: 'Epicerie' },
      { nom: 'Curry en poudre', quantite: 1, unite: 'c. a cafe', rayon: 'Epicerie' },
      { nom: 'Oignon', quantite: 0.5, unite: 'piece', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'Rincer les 70 g de riz basmati, puis le cuire dans 1,5 volume d\'eau salee 10 a 11 minutes a couvert ; laisser reposer hors du feu.',
      'Emincer le demi-oignon et couper le filet de poulet en des de 2 cm.',
      'Faire revenir l\'oignon 2 minutes a feu moyen dans un filet d\'huile, ajouter le poulet et saisir 4 a 5 minutes jusqu\'a coloration.',
      'Saupoudrer la cuillere a cafe de curry, melanger 30 secondes, puis verser les 50 ml de creme de coco.',
      'Mijoter 8 a 10 minutes a feu doux jusqu\'a ce que la sauce nappe et que le poulet soit cuit a coeur. Saler et servir avec le riz.',
    ],
  },
  {
    id: 'plat-saumon-quinoa',
    nom: 'Pave de saumon, quinoa et brocoli',
    type: 'plat',
    cuisines: ['mediterraneenne', 'francaise'],
    regime: ['sans-porc', 'sans-gluten'],
    budget: 'normal',
    allergenes: ['poisson'],
    motsCles: ['saumon', 'quinoa', 'brocoli', 'poisson'],
    kcal: 540,
    proteines: 36,
    glucides: 42,
    lipides: 22,
    tempsMinutes: 25,
    ingredients: [
      { nom: 'Pave de saumon', quantite: 130, unite: 'g', rayon: 'Poissonnerie' },
      { nom: 'Quinoa', quantite: 60, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Brocoli', quantite: 150, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Huile d\'olive', quantite: 1, unite: 'c. a soupe', rayon: 'Epicerie' },
    ],
    etapes: [
      'Rincer les 60 g de quinoa, le cuire dans 2 volumes d\'eau salee 12 a 14 minutes jusqu\'a ce que les germes se detachent ; egoutter.',
      'Detailler le brocoli en petits bouquets et le cuire 6 a 8 minutes a la vapeur (il doit rester croquant).',
      'Eponger le pave de saumon, le poeler cote peau 4 minutes a feu moyen-vif, puis 2 a 3 minutes de l\'autre cote.',
      'Dresser quinoa, brocoli et saumon, arroser de la cuillere a soupe d\'huile d\'olive, saler, poivrer et ajouter quelques gouttes de citron.',
    ],
  },
  {
    id: 'plat-boeuf-pates',
    nom: 'Bolognaise de boeuf et pates completes',
    type: 'plat',
    cuisines: ['italienne'],
    regime: ['sans-porc'],
    budget: 'eco',
    allergenes: ['gluten'],
    motsCles: ['boeuf', 'pates', 'tomate', 'viande hachee'],
    kcal: 580,
    proteines: 34,
    glucides: 64,
    lipides: 18,
    tempsMinutes: 25,
    ingredients: [
      { nom: 'Boeuf hache 5%', quantite: 120, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Pates completes', quantite: 80, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Sauce tomate', quantite: 120, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Oignon', quantite: 0.5, unite: 'piece', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'Emincer finement le demi-oignon et le faire suer 3 minutes a feu moyen dans un filet d\'huile.',
      'Ajouter les 120 g de boeuf hache, l\'emietter a la spatule et le saisir 4 a 5 minutes jusqu\'a ce qu\'il ne soit plus rose.',
      'Verser les 120 g de sauce tomate, saler, poivrer, ajouter une pincee d\'herbes ; mijoter 12 a 15 minutes a feu doux.',
      'Pendant ce temps, cuire les 80 g de pates dans l\'eau bouillante salee selon le temps du paquet (al dente).',
      'Egoutter les pates, les napper de bolognaise et servir.',
    ],
  },
  {
    id: 'plat-buddha-pois-chiches',
    nom: 'Buddha bowl pois chiches et patate douce',
    type: 'plat',
    cuisines: ['mediterraneenne', 'vegetale'],
    regime: ['vegetarien', 'vegan', 'sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: ['sesame'],
    motsCles: ['pois chiche', 'patate douce', 'avocat', 'tahin'],
    kcal: 520,
    proteines: 18,
    glucides: 68,
    lipides: 18,
    tempsMinutes: 30,
    ingredients: [
      { nom: 'Pois chiches cuits', quantite: 150, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Patate douce', quantite: 180, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Avocat', quantite: 0.5, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Tahin (puree de sesame)', quantite: 1, unite: 'c. a soupe', rayon: 'Epicerie' },
    ],
    etapes: [
      'Prechauffer le four a 200 C. Couper la patate douce en des de 2 cm, les melanger avec un filet d\'huile, du sel et du paprika.',
      'Enfourner 20 a 25 minutes en remuant a mi-cuisson, jusqu\'a ce que les des soient tendres et caramelises.',
      'Rincer et egoutter les 150 g de pois chiches ; les ajouter sur la plaque les 8 dernieres minutes pour les rendre croustillants.',
      'Preparer la sauce : delayer la cuillere a soupe de tahin avec un peu d\'eau, du jus de citron et une pincee de sel jusqu\'a consistance nappante.',
      'Dresser dans un bol patate douce, pois chiches et avocat en lamelles, puis napper de sauce tahin.',
    ],
  },
  {
    id: 'plat-tofu-saute',
    nom: 'Saute de tofu et legumes croquants',
    type: 'plat',
    cuisines: ['asiatique'],
    regime: ['vegetarien', 'vegan', 'sans-porc'],
    budget: 'eco',
    allergenes: ['soja', 'gluten', 'sesame'],
    motsCles: ['tofu', 'soja', 'poivron', 'sauce soja'],
    kcal: 470,
    proteines: 24,
    glucides: 52,
    lipides: 16,
    tempsMinutes: 20,
    ingredients: [
      { nom: 'Tofu ferme', quantite: 150, unite: 'g', rayon: 'Rayon vegetal' },
      { nom: 'Riz', quantite: 60, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Poivron', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Sauce soja', quantite: 2, unite: 'c. a soupe', rayon: 'Epicerie' },
    ],
    etapes: [
      'Cuire les 60 g de riz dans l\'eau bouillante salee selon le paquet, puis l\'egoutter.',
      'Eponger le tofu dans un linge pour retirer l\'eau, puis le couper en cubes de 2 cm.',
      'Saisir le tofu 5 a 6 minutes a feu vif dans un filet d\'huile, en le retournant, jusqu\'a ce qu\'il soit dore sur toutes les faces ; reserver.',
      'Emincer le poivron, le faire sauter 3 a 4 minutes dans la meme poele (il doit rester croquant).',
      'Remettre le tofu, verser les 2 cuilleres a soupe de sauce soja, melanger 1 minute et servir sur le riz.',
    ],
  },
  {
    id: 'plat-dinde-legumes',
    nom: 'Escalope de dinde et legumes rotis',
    type: 'plat',
    cuisines: ['francaise', 'mediterraneenne'],
    regime: ['sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: [],
    motsCles: ['dinde', 'courgette', 'poivron', 'volaille'],
    kcal: 480,
    proteines: 40,
    glucides: 38,
    lipides: 16,
    tempsMinutes: 30,
    ingredients: [
      { nom: 'Escalope de dinde', quantite: 130, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Courgette', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Poivron', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Pomme de terre', quantite: 150, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Huile d\'olive', quantite: 1, unite: 'c. a soupe', rayon: 'Epicerie' },
    ],
    etapes: [
      'Prechauffer le four a 200 C. Couper courgette, poivron et pomme de terre en morceaux reguliers de 2 cm.',
      'Les disposer sur une plaque, arroser de la cuillere a soupe d\'huile, saler, poivrer, ajouter du thym ; enfourner 25 minutes en remuant a mi-cuisson.',
      'Saler et poivrer l\'escalope, la poeler a feu moyen-vif 4 minutes par face jusqu\'a ce qu\'elle soit doree et cuite a coeur.',
      'Laisser reposer la dinde 2 minutes, la trancher et la servir avec les legumes rotis.',
    ],
  },
  {
    id: 'plat-omelette-salade',
    nom: 'Omelette aux champignons et salade verte',
    type: 'plat',
    cuisines: ['francaise'],
    regime: ['vegetarien', 'sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: ['oeuf', 'lactose'],
    motsCles: ['oeuf', 'champignon', 'salade', 'fromage'],
    kcal: 450,
    proteines: 28,
    glucides: 16,
    lipides: 30,
    tempsMinutes: 15,
    ingredients: [
      { nom: 'Oeufs', quantite: 3, unite: 'piece', rayon: 'Cremerie' },
      { nom: 'Champignons de Paris', quantite: 120, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Salade verte', quantite: 60, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Fromage rape', quantite: 20, unite: 'g', rayon: 'Cremerie' },
    ],
    etapes: [
      'Nettoyer et emincer les 120 g de champignons, les faire revenir 5 a 6 minutes a feu vif jusqu\'a evaporation de l\'eau ; saler.',
      'Battre les 3 oeufs avec sel et poivre, les verser sur les champignons et baisser a feu moyen.',
      'Quand les bords prennent, parsemer les 20 g de fromage rape, puis plier l\'omelette en deux ; elle doit rester moelleuse au centre.',
      'Assaisonner les 60 g de salade d\'un filet d\'huile et de vinaigre, et servir a cote.',
    ],
  },
  {
    id: 'plat-cabillaud-patate',
    nom: 'Cabillaud, ecrase de pommes de terre et haricots',
    type: 'plat',
    cuisines: ['francaise'],
    regime: ['sans-porc', 'sans-gluten'],
    budget: 'normal',
    allergenes: ['poisson', 'lactose'],
    motsCles: ['cabillaud', 'pomme de terre', 'haricot', 'poisson'],
    kcal: 500,
    proteines: 38,
    glucides: 50,
    lipides: 14,
    tempsMinutes: 30,
    ingredients: [
      { nom: 'Dos de cabillaud', quantite: 140, unite: 'g', rayon: 'Poissonnerie' },
      { nom: 'Pomme de terre', quantite: 200, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Haricots verts', quantite: 120, unite: 'g', rayon: 'Surgeles' },
      { nom: 'Beurre', quantite: 10, unite: 'g', rayon: 'Cremerie' },
    ],
    etapes: [
      'Eplucher et couper les pommes de terre en morceaux, les cuire 18 a 20 minutes dans l\'eau salee jusqu\'a ce qu\'elles s\'ecrasent facilement.',
      'Prechauffer le four a 190 C. Egoutter les pommes de terre, les ecraser avec les 10 g de beurre, sel et poivre.',
      'Cuire les 120 g de haricots verts 8 a 10 minutes a la vapeur ou a l\'eau bouillante.',
      'Poser le dos de cabillaud sur une plaque, saler, poivrer, ajouter un filet d\'huile ; enfourner 12 minutes (la chair doit s\'effeuiller).',
      'Servir le cabillaud avec l\'ecrase et les haricots.',
    ],
  },
  {
    id: 'plat-chili-vegetarien',
    nom: 'Chili sin carne haricots rouges',
    type: 'plat',
    cuisines: ['mexicaine', 'vegetale'],
    regime: ['vegetarien', 'vegan', 'sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: [],
    motsCles: ['haricot rouge', 'mais', 'tomate', 'epices'],
    kcal: 490,
    proteines: 20,
    glucides: 78,
    lipides: 9,
    tempsMinutes: 25,
    ingredients: [
      { nom: 'Haricots rouges cuits', quantite: 150, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Mais', quantite: 80, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Sauce tomate', quantite: 120, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Riz', quantite: 60, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Epices chili', quantite: 1, unite: 'c. a cafe', rayon: 'Epicerie' },
    ],
    etapes: [
      'Cuire les 60 g de riz dans l\'eau bouillante salee selon le paquet ; reserver au chaud.',
      'Rincer et egoutter les haricots rouges et le mais.',
      'Dans une casserole, verser la sauce tomate, les haricots, le mais et la cuillere a cafe d\'epices chili ; saler.',
      'Mijoter 15 minutes a feu doux en remuant de temps en temps, jusqu\'a ce que la sauce epaississe.',
      'Servir le chili sur le riz.',
    ],
  },
  {
    id: 'plat-risotto-champignons',
    nom: 'Risotto cremeux aux champignons',
    type: 'plat',
    cuisines: ['italienne'],
    regime: ['vegetarien', 'sans-porc', 'sans-gluten'],
    budget: 'normal',
    allergenes: ['lactose'],
    motsCles: ['riz', 'champignon', 'parmesan'],
    kcal: 540,
    proteines: 16,
    glucides: 78,
    lipides: 16,
    tempsMinutes: 30,
    ingredients: [
      { nom: 'Riz a risotto', quantite: 80, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Champignons de Paris', quantite: 150, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Parmesan', quantite: 20, unite: 'g', rayon: 'Cremerie' },
      { nom: 'Bouillon de legumes', quantite: 300, unite: 'ml', rayon: 'Epicerie' },
    ],
    etapes: [
      'Garder les 300 ml de bouillon chaud dans une casserole a cote. Emincer et poeler les champignons 5 minutes a feu vif ; reserver.',
      'Faire nacrer les 80 g de riz 1 a 2 minutes dans un filet d\'huile, jusqu\'a ce qu\'il devienne translucide sur les bords.',
      'Ajouter le bouillon une louche a la fois, en remuant, et n\'ajouter la suivante que lorsque le liquide est absorbe (environ 18 minutes).',
      'Quand le riz est cremeux et juste ferme, incorporer les champignons et les 20 g de parmesan rape hors du feu.',
      'Rectifier le sel, poivrer et servir aussitot.',
    ],
  },
  {
    id: 'plat-wrap-poulet',
    nom: 'Wrap poulet, crudites et yaourt citronne',
    type: 'plat',
    cuisines: ['mediterraneenne', 'americaine'],
    regime: ['sans-porc'],
    budget: 'eco',
    allergenes: ['gluten', 'lactose'],
    motsCles: ['poulet', 'tortilla', 'salade', 'yaourt'],
    kcal: 510,
    proteines: 34,
    glucides: 52,
    lipides: 16,
    tempsMinutes: 15,
    ingredients: [
      { nom: 'Filet de poulet', quantite: 110, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Tortilla de ble', quantite: 1, unite: 'piece', rayon: 'Epicerie' },
      { nom: 'Salade verte', quantite: 40, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Tomate', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Yaourt nature', quantite: 40, unite: 'g', rayon: 'Cremerie' },
    ],
    etapes: [
      'Couper le poulet en lanieres, saler, poivrer et le poeler 5 a 6 minutes a feu moyen-vif jusqu\'a ce qu\'il soit dore et cuit a coeur.',
      'Melanger les 40 g de yaourt avec du jus de citron, du sel et du poivre pour la sauce.',
      'Tiedir la tortilla 20 secondes a la poele pour l\'assouplir.',
      'Etaler la sauce, garnir de salade, de rondelles de tomate et de poulet, sans surcharger le centre.',
      'Rabattre les cotes, rouler le wrap bien serre et le couper en deux en biais.',
    ],
  },
  {
    id: 'plat-lentilles-corail',
    nom: 'Dahl de lentilles corail au lait de coco',
    type: 'plat',
    cuisines: ['indienne', 'vegetale'],
    regime: ['vegetarien', 'vegan', 'sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: [],
    motsCles: ['lentille', 'coco', 'curcuma', 'riz'],
    kcal: 510,
    proteines: 20,
    glucides: 72,
    lipides: 14,
    tempsMinutes: 25,
    ingredients: [
      { nom: 'Lentilles corail', quantite: 80, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Lait de coco', quantite: 80, unite: 'ml', rayon: 'Epicerie' },
      { nom: 'Tomate', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Riz', quantite: 50, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Curcuma et cumin', quantite: 1, unite: 'c. a cafe', rayon: 'Epicerie' },
    ],
    etapes: [
      'Rincer les 80 g de lentilles corail a l\'eau claire. Couper la tomate en des.',
      'Dans une casserole, faire revenir 30 secondes la cuillere a cafe de curcuma-cumin dans un filet d\'huile pour liberer les aromes.',
      'Ajouter les lentilles, la tomate, les 80 ml de lait de coco et 250 ml d\'eau ; saler.',
      'Mijoter 18 a 20 minutes a feu doux en remuant, jusqu\'a ce que les lentilles soient fondantes et la texture cremeuse.',
      'Pendant ce temps, cuire les 50 g de riz et le servir avec le dahl.',
    ],
  },
  {
    id: 'plat-steak-haricots',
    nom: 'Steak de boeuf et poelee de haricots',
    type: 'plat',
    cuisines: ['francaise'],
    regime: ['sans-porc', 'sans-gluten'],
    budget: 'normal',
    allergenes: [],
    motsCles: ['boeuf', 'steak', 'haricot', 'viande'],
    kcal: 470,
    proteines: 42,
    glucides: 26,
    lipides: 22,
    tempsMinutes: 20,
    ingredients: [
      { nom: 'Steak de boeuf', quantite: 130, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Haricots verts', quantite: 180, unite: 'g', rayon: 'Surgeles' },
      { nom: 'Pomme de terre', quantite: 120, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Huile d\'olive', quantite: 1, unite: 'c. a soupe', rayon: 'Epicerie' },
    ],
    etapes: [
      'Couper les pommes de terre en des et les cuire 15 minutes a l\'eau salee, puis les rissoler 3 minutes a la poele.',
      'Cuire les 180 g de haricots verts 8 a 10 minutes, puis les sauter 2 minutes dans un filet d\'huile, sel et poivre.',
      'Sortir le steak 10 minutes a l\'avance. Le saisir dans une poele bien chaude : environ 1 min 30 par face pour saignant, 2 min 30 pour a point.',
      'Laisser reposer le steak 2 minutes sous une feuille d\'alu avant de servir avec la poelee.',
    ],
  },
  {
    id: 'plat-pates-pesto',
    nom: 'Pates au pesto et tomates cerises',
    type: 'plat',
    cuisines: ['italienne'],
    regime: ['vegetarien', 'sans-porc'],
    budget: 'eco',
    allergenes: ['gluten', 'lactose', 'fruits-a-coque'],
    motsCles: ['pates', 'pesto', 'tomate', 'pignon', 'parmesan'],
    kcal: 530,
    proteines: 16,
    glucides: 72,
    lipides: 20,
    tempsMinutes: 15,
    ingredients: [
      { nom: 'Pates', quantite: 90, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Pesto', quantite: 30, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Tomates cerises', quantite: 100, unite: 'g', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'Cuire les 90 g de pates dans un grand volume d\'eau bouillante salee, al dente (temps du paquet).',
      'Couper les tomates cerises en deux et les faire revenir 2 minutes a la poele pour les attendrir.',
      'Avant d\'egoutter, prelever une louche d\'eau de cuisson.',
      'Egoutter les pates, les remettre hors du feu avec les 30 g de pesto et un peu d\'eau de cuisson pour bien enrober.',
      'Ajouter les tomates cerises, poivrer et servir.',
    ],
  },
  {
    id: 'plat-soupe-poulet-nouilles',
    nom: 'Soupe asiatique poulet et nouilles',
    type: 'plat',
    cuisines: ['asiatique'],
    regime: ['sans-porc'],
    budget: 'eco',
    allergenes: ['gluten', 'soja'],
    motsCles: ['poulet', 'nouilles', 'bouillon', 'gingembre'],
    kcal: 460,
    proteines: 32,
    glucides: 56,
    lipides: 10,
    tempsMinutes: 20,
    ingredients: [
      { nom: 'Filet de poulet', quantite: 100, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Nouilles de ble', quantite: 70, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Bouillon de volaille', quantite: 400, unite: 'ml', rayon: 'Epicerie' },
      { nom: 'Carotte', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Gingembre frais', quantite: 5, unite: 'g', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'Porter les 400 ml de bouillon a fremissement avec le gingembre rape et un trait de sauce soja.',
      'Y pocher le filet de poulet entier 10 a 12 minutes, puis le sortir et l\'effilocher.',
      'Tailler la carotte en fines rondelles, les ajouter au bouillon avec les 70 g de nouilles et cuire 5 a 6 minutes.',
      'Remettre le poulet effiloche, rectifier l\'assaisonnement et servir bien chaud.',
    ],
  },

  // ---------------- COLLATIONS ----------------
  {
    id: 'col-pomme-amandes',
    nom: 'Pomme et poignee d\'amandes',
    type: 'collation',
    cuisines: ['francaise'],
    regime: ['vegetarien', 'vegan', 'sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: ['fruits-a-coque'],
    motsCles: ['pomme', 'amande'],
    kcal: 200,
    proteines: 5,
    glucides: 24,
    lipides: 10,
    tempsMinutes: 2,
    ingredients: [
      { nom: 'Pomme', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Amandes', quantite: 20, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Laver la pomme et la couper en quartiers en retirant le coeur.',
      'Compter une petite poignee d\'amandes (environ 20 g) et deguster les deux ensemble.',
    ],
  },
  {
    id: 'col-yaourt-miel',
    nom: 'Yaourt nature et miel',
    type: 'collation',
    cuisines: ['francaise'],
    regime: ['vegetarien', 'sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: ['lactose'],
    motsCles: ['yaourt', 'miel'],
    kcal: 180,
    proteines: 9,
    glucides: 24,
    lipides: 5,
    tempsMinutes: 2,
    ingredients: [
      { nom: 'Yaourt nature', quantite: 150, unite: 'g', rayon: 'Cremerie' },
      { nom: 'Miel', quantite: 1, unite: 'c. a cafe', rayon: 'Epicerie' },
    ],
    etapes: [
      'Verser les 150 g de yaourt dans un bol.',
      'Ajouter la cuillere a cafe de miel et melanger ; pour plus de gourmandise, ajouter quelques flocons ou fruits secs.',
    ],
  },
  {
    id: 'col-houmous-carottes',
    nom: 'Houmous et batonnets de carotte',
    type: 'collation',
    cuisines: ['mediterraneenne'],
    regime: ['vegetarien', 'vegan', 'sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: ['sesame'],
    motsCles: ['houmous', 'pois chiche', 'carotte'],
    kcal: 190,
    proteines: 6,
    glucides: 20,
    lipides: 10,
    tempsMinutes: 3,
    ingredients: [
      { nom: 'Houmous', quantite: 60, unite: 'g', rayon: 'Rayon frais' },
      { nom: 'Carotte', quantite: 2, unite: 'piece', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'Eplucher les 2 carottes et les tailler en batonnets de la taille d\'un doigt.',
      'Presenter les 60 g de houmous dans un petit bol et y tremper les batonnets.',
    ],
  },
  {
    id: 'col-banane-chocolat',
    nom: 'Banane et carre de chocolat noir',
    type: 'collation',
    cuisines: ['francaise'],
    regime: ['vegetarien', 'vegan', 'sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: [],
    motsCles: ['banane', 'chocolat'],
    kcal: 170,
    proteines: 3,
    glucides: 30,
    lipides: 5,
    tempsMinutes: 1,
    ingredients: [
      { nom: 'Banane', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Chocolat noir', quantite: 15, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Eplucher la banane.',
      'La deguster en alternant avec les 15 g (2 a 3 carres) de chocolat noir.',
    ],
  },
  {
    id: 'col-fromage-blanc-fruits',
    nom: 'Fromage blanc et fruits frais',
    type: 'collation',
    cuisines: ['francaise'],
    regime: ['vegetarien', 'sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: ['lactose'],
    motsCles: ['fromage blanc', 'fruits'],
    kcal: 160,
    proteines: 12,
    glucides: 18,
    lipides: 3,
    tempsMinutes: 2,
    ingredients: [
      { nom: 'Fromage blanc', quantite: 150, unite: 'g', rayon: 'Cremerie' },
      { nom: 'Fruits de saison', quantite: 100, unite: 'g', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'Laver et couper les 100 g de fruits de saison en des.',
      'Les melanger aux 150 g de fromage blanc ; sucrer eventuellement d\'un peu de miel.',
    ],
  },
  {
    id: 'col-galettes-riz',
    nom: 'Galettes de riz et beurre de cacahuete',
    type: 'collation',
    cuisines: ['americaine'],
    regime: ['vegetarien', 'vegan', 'sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: ['arachide'],
    motsCles: ['galette de riz', 'cacahuete'],
    kcal: 210,
    proteines: 7,
    glucides: 24,
    lipides: 10,
    tempsMinutes: 2,
    ingredients: [
      { nom: 'Galettes de riz', quantite: 2, unite: 'piece', rayon: 'Epicerie' },
      { nom: 'Beurre de cacahuete', quantite: 20, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Repartir les 20 g de beurre de cacahuete sur les 2 galettes de riz.',
      'Pour plus de gourmandise, ajouter quelques rondelles de banane par-dessus.',
    ],
  },

  // ======================================================================
  // ENRICHISSEMENT : recettes plus caloriques + plus de variete par combo
  // regime/cuisine, pour mieux atteindre les cibles meme avec filtres stricts.
  // ======================================================================

  // ---------- PETITS-DEJEUNERS riches (dont sans lactose) ----------
  {
    id: 'pd-porridge-cacahuete',
    nom: 'Porridge avoine, beurre de cacahuete et banane',
    type: 'petit-dejeuner',
    cuisines: ['americaine', 'francaise'],
    regime: ['vegetarien', 'vegan', 'sans-porc'],
    budget: 'eco',
    allergenes: ['gluten', 'arachide'],
    motsCles: ['avoine', 'cacahuete', 'banane', 'boisson vegetale'],
    kcal: 520,
    proteines: 17,
    glucides: 66,
    lipides: 19,
    tempsMinutes: 8,
    ingredients: [
      { nom: 'Flocons d\'avoine', quantite: 70, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Boisson vegetale (avoine)', quantite: 250, unite: 'ml', rayon: 'Epicerie' },
      { nom: 'Beurre de cacahuete', quantite: 20, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Banane', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'Verser les 250 ml de boisson vegetale et les 70 g de flocons dans une casserole.',
      'Cuire 4 a 5 minutes a feu doux en remuant, jusqu\'a ce que le melange epaississe et devienne cremeux.',
      'Hors du feu, incorporer les 20 g de beurre de cacahuete jusqu\'a ce qu\'il fonde dans le porridge.',
      'Verser dans un bol et garnir de rondelles de banane.',
    ],
  },
  {
    id: 'pd-tartines-cacahuete',
    nom: 'Tartines pain complet, beurre de cacahuete et banane',
    type: 'petit-dejeuner',
    cuisines: ['americaine'],
    regime: ['vegetarien', 'vegan', 'sans-porc'],
    budget: 'eco',
    allergenes: ['gluten', 'arachide'],
    motsCles: ['pain', 'cacahuete', 'banane'],
    kcal: 470,
    proteines: 15,
    glucides: 60,
    lipides: 17,
    tempsMinutes: 5,
    ingredients: [
      { nom: 'Pain complet', quantite: 80, unite: 'g', rayon: 'Boulangerie' },
      { nom: 'Beurre de cacahuete', quantite: 25, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Banane', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'Griller les 80 g de pain complet jusqu\'a ce qu\'il soit dore.',
      'Tartiner les 25 g de beurre de cacahuete sur le pain encore tiede pour qu\'il s\'etale facilement.',
      'Couper la banane en rondelles et la disposer dessus ; un filet de miel est optionnel.',
    ],
  },
  {
    id: 'pd-oeufs-avocat',
    nom: 'Oeufs au plat, avocat et pain complet',
    type: 'petit-dejeuner',
    cuisines: ['francaise', 'americaine'],
    regime: ['vegetarien', 'sans-porc'],
    budget: 'normal',
    allergenes: ['oeuf', 'gluten'],
    motsCles: ['oeuf', 'avocat', 'pain'],
    kcal: 540,
    proteines: 24,
    glucides: 36,
    lipides: 32,
    tempsMinutes: 10,
    ingredients: [
      { nom: 'Oeufs', quantite: 2, unite: 'piece', rayon: 'Cremerie' },
      { nom: 'Avocat', quantite: 0.5, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Pain complet', quantite: 70, unite: 'g', rayon: 'Boulangerie' },
      { nom: 'Huile d\'olive', quantite: 1, unite: 'c. a cafe', rayon: 'Epicerie' },
    ],
    etapes: [
      'Chauffer la cuillere a cafe d\'huile dans une poele a feu moyen et y casser les 2 oeufs.',
      'Cuire 3 a 4 minutes : le blanc doit etre pris et le jaune encore coulant ; saler, poivrer.',
      'Griller le pain, ecraser la demi-avocat dessus avec une pincee de sel et un filet de citron.',
      'Deposer les oeufs au plat sur les tartines d\'avocat et servir aussitot.',
    ],
  },
  {
    id: 'pd-shakshuka',
    nom: 'Shakshuka oeufs, tomate et pois chiches',
    type: 'petit-dejeuner',
    cuisines: ['mediterraneenne'],
    regime: ['vegetarien', 'sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: ['oeuf'],
    motsCles: ['oeuf', 'tomate', 'pois chiche', 'poivron'],
    kcal: 440,
    proteines: 22,
    glucides: 38,
    lipides: 20,
    tempsMinutes: 20,
    ingredients: [
      { nom: 'Oeufs', quantite: 2, unite: 'piece', rayon: 'Cremerie' },
      { nom: 'Sauce tomate', quantite: 150, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Pois chiches cuits', quantite: 80, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Poivron', quantite: 0.5, unite: 'piece', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'Emincer le demi-poivron et le faire revenir 4 minutes a feu moyen dans un filet d\'huile.',
      'Ajouter les 150 g de sauce tomate et les 80 g de pois chiches egouttes ; assaisonner (cumin, paprika, sel). Mijoter 8 minutes.',
      'Creuser 2 puits dans la sauce et y casser les oeufs.',
      'Couvrir et cuire 5 a 6 minutes a feu doux, jusqu\'a ce que le blanc soit pris et le jaune encore tremblotant. Servir dans la poele.',
    ],
  },
  {
    id: 'pd-muesli-vegetal',
    nom: 'Muesli, boisson vegetale et fruits secs',
    type: 'petit-dejeuner',
    cuisines: ['francaise'],
    regime: ['vegetarien', 'vegan', 'sans-porc'],
    budget: 'normal',
    allergenes: ['gluten', 'fruits-a-coque'],
    motsCles: ['muesli', 'noix', 'boisson vegetale', 'fruits secs'],
    kcal: 480,
    proteines: 13,
    glucides: 68,
    lipides: 16,
    tempsMinutes: 3,
    ingredients: [
      { nom: 'Muesli', quantite: 70, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Boisson vegetale (amande)', quantite: 220, unite: 'ml', rayon: 'Epicerie' },
      { nom: 'Noix', quantite: 20, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Verser les 70 g de muesli dans un bol.',
      'Ajouter les 220 ml de boisson vegetale a l\'amande.',
      'Concasser grossierement les 20 g de noix et les parsemer dessus. Pour une version plus moelleuse, laisser reposer 5 minutes.',
    ],
  },
  {
    id: 'pd-skyr-bowl',
    nom: 'Bowl skyr, granola et noix',
    type: 'petit-dejeuner',
    cuisines: ['francaise', 'mediterraneenne'],
    regime: ['vegetarien', 'sans-porc'],
    budget: 'normal',
    allergenes: ['lactose', 'gluten', 'fruits-a-coque'],
    motsCles: ['skyr', 'granola', 'noix', 'fruits'],
    kcal: 500,
    proteines: 30,
    glucides: 56,
    lipides: 14,
    tempsMinutes: 4,
    ingredients: [
      { nom: 'Skyr', quantite: 200, unite: 'g', rayon: 'Cremerie' },
      { nom: 'Granola', quantite: 50, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Noix', quantite: 15, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Fruits de saison', quantite: 80, unite: 'g', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'Lisser les 200 g de skyr au fond d\'un bol.',
      'Couper les 80 g de fruits en morceaux et les disposer sur une moitie.',
      'Repartir les 50 g de granola et les 15 g de noix concassees sur l\'autre moitie pour garder le croquant. Servir aussitot.',
    ],
  },
  {
    id: 'pd-burrito-oeuf',
    nom: 'Burrito du matin oeufs et haricots',
    type: 'petit-dejeuner',
    cuisines: ['mexicaine', 'americaine'],
    regime: ['vegetarien', 'sans-porc'],
    budget: 'eco',
    allergenes: ['gluten', 'oeuf', 'lactose'],
    motsCles: ['oeuf', 'tortilla', 'haricot rouge', 'fromage'],
    kcal: 520,
    proteines: 25,
    glucides: 52,
    lipides: 22,
    tempsMinutes: 12,
    ingredients: [
      { nom: 'Tortilla de ble', quantite: 1, unite: 'piece', rayon: 'Epicerie' },
      { nom: 'Oeufs', quantite: 2, unite: 'piece', rayon: 'Cremerie' },
      { nom: 'Haricots rouges cuits', quantite: 80, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Fromage rape', quantite: 20, unite: 'g', rayon: 'Cremerie' },
    ],
    etapes: [
      'Rincer les 80 g de haricots rouges et les rechauffer 2 minutes a la poele avec une pincee de cumin.',
      'Battre les 2 oeufs, les cuire en brouillade 2 a 3 minutes a feu doux ; saler, poivrer.',
      'Tiedir la tortilla 20 secondes pour l\'assouplir.',
      'Garnir le centre d\'oeufs, de haricots et des 20 g de fromage rape.',
      'Replier les deux bords, rouler serre et faire dorer 1 minute par face a la poele (soudure dessous).',
    ],
  },

  // ---------- PLATS riches (600-780 kcal) ----------
  {
    id: 'plat-poulet-patate-douce',
    nom: 'Poulet roti, patate douce et riz',
    type: 'plat',
    cuisines: ['americaine', 'francaise'],
    regime: ['sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: [],
    motsCles: ['poulet', 'patate douce', 'riz', 'volaille'],
    kcal: 680,
    proteines: 45,
    glucides: 78,
    lipides: 18,
    tempsMinutes: 30,
    ingredients: [
      { nom: 'Filet de poulet', quantite: 150, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Patate douce', quantite: 180, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Riz', quantite: 60, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Huile d\'olive', quantite: 1, unite: 'c. a soupe', rayon: 'Epicerie' },
    ],
    etapes: [
      'Prechauffer le four a 200 C. Couper la patate douce en des de 2 cm, les enrober de la moitie de l\'huile, sel et paprika.',
      'Enfourner 25 minutes en remuant a mi-cuisson, jusqu\'a ce que les des soient tendres et dores.',
      'Cuire les 60 g de riz dans l\'eau bouillante salee selon le paquet.',
      'Saler, poivrer le filet de poulet et le poeler dans le reste d\'huile 5 a 6 minutes par face, jusqu\'a ce qu\'il soit dore et cuit a coeur.',
      'Laisser reposer le poulet 2 minutes, le trancher et dresser avec riz et patate douce.',
    ],
  },
  {
    id: 'plat-saumon-teriyaki',
    nom: 'Saumon teriyaki, riz et edamame',
    type: 'plat',
    cuisines: ['asiatique', 'japonaise'],
    regime: ['sans-porc'],
    budget: 'normal',
    allergenes: ['poisson', 'soja', 'gluten', 'sesame'],
    motsCles: ['saumon', 'teriyaki', 'riz', 'edamame', 'soja'],
    kcal: 660,
    proteines: 40,
    glucides: 70,
    lipides: 22,
    tempsMinutes: 25,
    ingredients: [
      { nom: 'Pave de saumon', quantite: 140, unite: 'g', rayon: 'Poissonnerie' },
      { nom: 'Riz', quantite: 70, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Edamame', quantite: 80, unite: 'g', rayon: 'Surgeles' },
      { nom: 'Sauce teriyaki', quantite: 2, unite: 'c. a soupe', rayon: 'Epicerie' },
    ],
    etapes: [
      'Cuire les 70 g de riz selon le paquet. Cuire les 80 g d\'edamame 4 a 5 minutes a l\'eau bouillante salee.',
      'Eponger le pave de saumon et le couper en deux si besoin.',
      'Le saisir cote chair 3 minutes a feu moyen-vif, retourner et cuire 2 a 3 minutes.',
      'Verser les 2 cuilleres a soupe de teriyaki, laisser caramelier 1 a 2 minutes en arrosant le poisson.',
      'Dresser le saumon laque sur le riz, avec les edamame ; parsemer de graines de sesame.',
    ],
  },
  {
    id: 'plat-burrito-boeuf',
    nom: 'Burrito boeuf, riz et haricots rouges',
    type: 'plat',
    cuisines: ['mexicaine'],
    regime: ['sans-porc'],
    budget: 'eco',
    allergenes: ['gluten', 'lactose'],
    motsCles: ['boeuf', 'tortilla', 'riz', 'haricot rouge', 'fromage'],
    kcal: 720,
    proteines: 38,
    glucides: 80,
    lipides: 26,
    tempsMinutes: 25,
    ingredients: [
      { nom: 'Boeuf hache 5%', quantite: 120, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Grande tortilla de ble', quantite: 1, unite: 'piece', rayon: 'Epicerie' },
      { nom: 'Riz', quantite: 60, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Haricots rouges cuits', quantite: 100, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Fromage rape', quantite: 25, unite: 'g', rayon: 'Cremerie' },
    ],
    etapes: [
      'Cuire les 60 g de riz selon le paquet. Rincer et egoutter les 100 g de haricots rouges.',
      'Saisir le boeuf hache 5 minutes a feu vif en l\'emiettant, assaisonner de cumin, paprika, sel.',
      'Tiedir la grande tortilla pour l\'assouplir, puis disposer au centre riz, boeuf, haricots et les 25 g de fromage.',
      'Replier les bords lateraux, puis rouler serre en partant du bas.',
      'Faire dorer le burrito 2 minutes par face a la poele, soudure dessous, et couper en deux.',
    ],
  },
  {
    id: 'plat-curry-pois-chiches',
    nom: 'Curry de pois chiches au lait de coco et riz',
    type: 'plat',
    cuisines: ['indienne', 'vegetale'],
    regime: ['vegetarien', 'vegan', 'sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: [],
    motsCles: ['pois chiche', 'coco', 'curry', 'riz', 'epinard'],
    kcal: 640,
    proteines: 20,
    glucides: 92,
    lipides: 20,
    tempsMinutes: 25,
    ingredients: [
      { nom: 'Pois chiches cuits', quantite: 160, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Lait de coco', quantite: 100, unite: 'ml', rayon: 'Epicerie' },
      { nom: 'Epinards frais', quantite: 60, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Riz basmati', quantite: 70, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Curry en poudre', quantite: 1, unite: 'c. a soupe', rayon: 'Epicerie' },
    ],
    etapes: [
      'Cuire les 70 g de riz basmati selon le paquet.',
      'Faire revenir la cuillere a soupe de curry 30 secondes dans un filet d\'huile pour reveiller les epices.',
      'Ajouter les 160 g de pois chiches egouttes et les 100 ml de lait de coco ; mijoter 10 a 12 minutes a feu doux.',
      'Incorporer les 60 g d\'epinards en fin de cuisson et laisser fondre 1 a 2 minutes. Saler.',
      'Servir le curry sur le riz basmati.',
    ],
  },
  {
    id: 'plat-boeuf-nouilles-saute',
    nom: 'Boeuf saute aux nouilles et legumes',
    type: 'plat',
    cuisines: ['asiatique'],
    regime: ['sans-porc'],
    budget: 'normal',
    allergenes: ['gluten', 'soja', 'sesame'],
    motsCles: ['boeuf', 'nouilles', 'soja', 'poivron', 'wok'],
    kcal: 660,
    proteines: 36,
    glucides: 72,
    lipides: 22,
    tempsMinutes: 20,
    ingredients: [
      { nom: 'Boeuf a griller emince', quantite: 120, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Nouilles de ble', quantite: 80, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Poivron', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Sauce soja', quantite: 2, unite: 'c. a soupe', rayon: 'Epicerie' },
    ],
    etapes: [
      'Cuire les 80 g de nouilles selon le paquet, les egoutter et les huiler legerement pour eviter qu\'elles collent.',
      'Emincer le poivron. Faire chauffer un wok (ou grande poele) tres chaud avec un filet d\'huile.',
      'Saisir le boeuf emince 2 minutes a feu vif, juste coloré, puis le reserver.',
      'Sauter le poivron 3 minutes (il reste croquant), remettre le boeuf et les nouilles.',
      'Verser les 2 cuilleres a soupe de sauce soja, melanger 1 minute a feu vif et servir.',
    ],
  },
  {
    id: 'plat-poke-saumon',
    nom: 'Poke bowl saumon, riz et avocat',
    type: 'plat',
    cuisines: ['asiatique', 'japonaise'],
    regime: ['sans-porc'],
    budget: 'normal',
    allergenes: ['poisson', 'soja', 'sesame', 'gluten'],
    motsCles: ['saumon', 'riz', 'avocat', 'soja', 'edamame'],
    kcal: 620,
    proteines: 34,
    glucides: 66,
    lipides: 24,
    tempsMinutes: 20,
    ingredients: [
      { nom: 'Saumon cru (qualite sushi)', quantite: 120, unite: 'g', rayon: 'Poissonnerie' },
      { nom: 'Riz', quantite: 70, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Avocat', quantite: 0.5, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Edamame', quantite: 60, unite: 'g', rayon: 'Surgeles' },
      { nom: 'Sauce soja', quantite: 1, unite: 'c. a soupe', rayon: 'Epicerie' },
    ],
    etapes: [
      'Cuire les 70 g de riz, puis l\'etaler pour le faire tiedir (un filet de vinaigre de riz le rend plus authentique).',
      'Cuire les 60 g d\'edamame 4 minutes a l\'eau bouillante et les egoutter.',
      'Couper le saumon tres frais en des de 1,5 cm et les enrober de la cuillere a soupe de sauce soja.',
      'Detailler la demi-avocat en lamelles.',
      'Dans un bol, disposer le riz tiede, puis saumon, avocat et edamame en secteurs ; parsemer de sesame.',
    ],
  },
  {
    id: 'plat-couscous-poulet',
    nom: 'Couscous poulet et legumes',
    type: 'plat',
    cuisines: ['mediterraneenne'],
    regime: ['sans-porc'],
    budget: 'eco',
    allergenes: ['gluten'],
    motsCles: ['poulet', 'semoule', 'courgette', 'carotte', 'pois chiche'],
    kcal: 650,
    proteines: 40,
    glucides: 84,
    lipides: 14,
    tempsMinutes: 30,
    ingredients: [
      { nom: 'Filet de poulet', quantite: 130, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Semoule', quantite: 80, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Courgette', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Carotte', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Pois chiches cuits', quantite: 80, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Couper poulet, courgette et carotte en morceaux. Saisir le poulet 4 minutes dans un filet d\'huile, puis le reserver.',
      'Dans la meme cocotte, faire revenir les legumes 5 minutes, ajouter les pois chiches, des epices a couscous (ras-el-hanout), du sel et 300 ml d\'eau.',
      'Remettre le poulet et mijoter 15 minutes a couvert jusqu\'a ce que les legumes soient tendres.',
      'Verser les 80 g de semoule dans un saladier, couvrir d\'eau bouillante salee a hauteur, couvrir 5 minutes puis l\'aerer a la fourchette.',
      'Servir la semoule avec le poulet, les legumes et un peu de bouillon.',
    ],
  },
  {
    id: 'plat-pad-thai-poulet',
    nom: 'Pad thai poulet',
    type: 'plat',
    cuisines: ['asiatique', 'thailandaise'],
    regime: ['sans-porc', 'sans-gluten'],
    budget: 'normal',
    allergenes: ['oeuf', 'arachide', 'soja', 'poisson'],
    motsCles: ['poulet', 'nouilles de riz', 'cacahuete', 'oeuf', 'pad thai'],
    kcal: 680,
    proteines: 36,
    glucides: 78,
    lipides: 22,
    tempsMinutes: 25,
    ingredients: [
      { nom: 'Filet de poulet', quantite: 120, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Nouilles de riz', quantite: 80, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Oeuf', quantite: 1, unite: 'piece', rayon: 'Cremerie' },
      { nom: 'Cacahuetes', quantite: 20, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Sauce nuoc-mam', quantite: 1, unite: 'c. a soupe', rayon: 'Epicerie' },
    ],
    etapes: [
      'Faire tremper les 80 g de nouilles de riz 10 minutes dans l\'eau chaude, puis les egoutter.',
      'Couper le poulet en lanieres et le saisir 4 a 5 minutes a feu vif dans un wok huile.',
      'Pousser le poulet sur un cote, casser l\'oeuf dans le wok et le brouiller rapidement.',
      'Ajouter les nouilles egouttees et la cuillere a soupe de nuoc-mam (avec un peu de jus de citron vert et de sucre), sauter 2 minutes.',
      'Servir parseme des 20 g de cacahuetes concassees.',
    ],
  },
  {
    id: 'plat-tofu-general-tao',
    nom: 'Tofu croustillant facon general tao et riz',
    type: 'plat',
    cuisines: ['asiatique'],
    regime: ['vegetarien', 'vegan', 'sans-porc'],
    budget: 'eco',
    allergenes: ['soja', 'gluten', 'sesame'],
    motsCles: ['tofu', 'soja', 'riz', 'sauce', 'sesame'],
    kcal: 650,
    proteines: 26,
    glucides: 82,
    lipides: 20,
    tempsMinutes: 25,
    ingredients: [
      { nom: 'Tofu ferme', quantite: 160, unite: 'g', rayon: 'Rayon vegetal' },
      { nom: 'Riz', quantite: 70, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Sauce soja', quantite: 2, unite: 'c. a soupe', rayon: 'Epicerie' },
      { nom: 'Fecule de mais', quantite: 1, unite: 'c. a soupe', rayon: 'Epicerie' },
      { nom: 'Graines de sesame', quantite: 1, unite: 'c. a cafe', rayon: 'Epicerie' },
    ],
    etapes: [
      'Cuire les 70 g de riz selon le paquet.',
      'Eponger le tofu, le couper en cubes et les rouler dans la cuillere a soupe de fecule.',
      'Faire dorer les cubes 6 a 8 minutes a la poele dans un peu d\'huile, en les retournant, jusqu\'a ce qu\'ils soient croustillants.',
      'Melanger les 2 cuilleres a soupe de sauce soja avec un peu de sucre et d\'eau, verser sur le tofu et laisser caramelier 1 a 2 minutes.',
      'Parsemer de la cuillere a cafe de sesame et servir sur le riz.',
    ],
  },
  {
    id: 'plat-falafel-pita',
    nom: 'Falafels, pita et houmous',
    type: 'plat',
    cuisines: ['mediterraneenne'],
    regime: ['vegetarien', 'vegan', 'sans-porc'],
    budget: 'eco',
    allergenes: ['gluten', 'sesame'],
    motsCles: ['falafel', 'pois chiche', 'pita', 'houmous', 'crudites'],
    kcal: 620,
    proteines: 20,
    glucides: 84,
    lipides: 22,
    tempsMinutes: 20,
    ingredients: [
      { nom: 'Falafels', quantite: 5, unite: 'piece', rayon: 'Rayon frais' },
      { nom: 'Pain pita', quantite: 1, unite: 'piece', rayon: 'Boulangerie' },
      { nom: 'Houmous', quantite: 50, unite: 'g', rayon: 'Rayon frais' },
      { nom: 'Salade verte', quantite: 40, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Tomate', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'Rechauffer les 5 falafels 8 a 10 minutes au four a 180 C (ou 4 minutes a la poele) jusqu\'a ce qu\'ils soient chauds et croustillants.',
      'Tiedir le pain pita et l\'ouvrir en poche.',
      'Tartiner l\'interieur des 50 g de houmous.',
      'Garnir de salade, de des de tomate et des falafels, eventuellement un filet de sauce yaourt-citron.',
    ],
  },
  {
    id: 'plat-steak-frites',
    nom: 'Steak, frites maison et salade',
    type: 'plat',
    cuisines: ['francaise'],
    regime: ['sans-porc', 'sans-gluten'],
    budget: 'normal',
    allergenes: [],
    motsCles: ['boeuf', 'steak', 'pomme de terre', 'frites', 'salade'],
    kcal: 700,
    proteines: 42,
    glucides: 62,
    lipides: 30,
    tempsMinutes: 30,
    ingredients: [
      { nom: 'Steak de boeuf', quantite: 130, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Pomme de terre', quantite: 250, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Salade verte', quantite: 50, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Huile d\'olive', quantite: 1, unite: 'c. a soupe', rayon: 'Epicerie' },
    ],
    etapes: [
      'Prechauffer le four a 210 C. Tailler les pommes de terre en frites, les enrober de la cuillere a soupe d\'huile et de sel.',
      'Enfourner 25 a 30 minutes en les retournant a mi-cuisson, jusqu\'a ce qu\'elles soient dorees.',
      'Sortir le steak 10 minutes a l\'avance. Le saisir dans une poele bien chaude 1 min 30 par face (saignant) a 2 min 30 (a point).',
      'Laisser reposer le steak 2 minutes sous une feuille d\'alu.',
      'Assaisonner la salade et servir avec le steak et les frites.',
    ],
  },
  {
    id: 'plat-lasagnes-boeuf',
    nom: 'Lasagnes au boeuf',
    type: 'plat',
    cuisines: ['italienne'],
    regime: ['sans-porc'],
    budget: 'normal',
    allergenes: ['gluten', 'lactose'],
    motsCles: ['boeuf', 'lasagne', 'tomate', 'bechamel', 'fromage'],
    kcal: 720,
    proteines: 38,
    glucides: 66,
    lipides: 32,
    tempsMinutes: 40,
    ingredients: [
      { nom: 'Boeuf hache 5%', quantite: 120, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Plaques de lasagne', quantite: 90, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Sauce tomate', quantite: 150, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Bechamel', quantite: 120, unite: 'g', rayon: 'Rayon frais' },
      { nom: 'Fromage rape', quantite: 30, unite: 'g', rayon: 'Cremerie' },
    ],
    etapes: [
      'Prechauffer le four a 190 C. Saisir le boeuf hache 5 minutes, ajouter les 150 g de sauce tomate, sel, herbes ; mijoter 10 minutes.',
      'Dans un petit plat, etaler un peu de bechamel, puis alterner plaques de lasagne, bolognaise et bechamel.',
      'Terminer par une couche de bechamel et les 30 g de fromage rape.',
      'Enfourner 25 a 30 minutes jusqu\'a ce que le dessus soit gratine et qu\'un couteau traverse les plaques sans resistance.',
      'Laisser reposer 5 minutes avant de servir pour que les couches se tiennent.',
    ],
  },
  {
    id: 'plat-parmentier',
    nom: 'Hachis parmentier',
    type: 'plat',
    cuisines: ['francaise'],
    regime: ['sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: ['lactose'],
    motsCles: ['boeuf', 'pomme de terre', 'puree', 'gratin'],
    kcal: 680,
    proteines: 36,
    glucides: 64,
    lipides: 30,
    tempsMinutes: 35,
    ingredients: [
      { nom: 'Boeuf hache 5%', quantite: 120, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Pomme de terre', quantite: 250, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Lait demi-ecreme', quantite: 60, unite: 'ml', rayon: 'Cremerie' },
      { nom: 'Beurre', quantite: 10, unite: 'g', rayon: 'Cremerie' },
    ],
    etapes: [
      'Eplucher et cuire les pommes de terre 20 minutes a l\'eau salee, jusqu\'a ce qu\'elles soient fondantes.',
      'Les ecraser avec les 60 ml de lait chaud et les 10 g de beurre pour une puree lisse ; saler.',
      'Prechauffer le four a 200 C. Saisir le boeuf hache 5 minutes a la poele avec un oignon emince si vous en avez ; assaisonner.',
      'Dans un plat, etaler la viande puis recouvrir de puree, strier la surface a la fourchette.',
      'Gratiner 15 minutes au four jusqu\'a ce que le dessus soit dore.',
    ],
  },
  {
    id: 'plat-poulet-pesto-pates',
    nom: 'Pates, poulet et pesto',
    type: 'plat',
    cuisines: ['italienne'],
    regime: ['sans-porc'],
    budget: 'eco',
    allergenes: ['gluten', 'lactose', 'fruits-a-coque'],
    motsCles: ['poulet', 'pates', 'pesto', 'parmesan'],
    kcal: 700,
    proteines: 42,
    glucides: 74,
    lipides: 24,
    tempsMinutes: 20,
    ingredients: [
      { nom: 'Filet de poulet', quantite: 130, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Pates', quantite: 90, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Pesto', quantite: 30, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Tomates cerises', quantite: 80, unite: 'g', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'Cuire les 90 g de pates al dente dans l\'eau bouillante salee ; reserver une louche d\'eau de cuisson avant d\'egoutter.',
      'Couper le poulet en des, le poeler 6 minutes a feu moyen-vif jusqu\'a ce qu\'il soit dore et cuit a coeur ; saler.',
      'Couper les tomates cerises en deux et les ajouter 1 minute au poulet.',
      'Hors du feu, melanger pates, poulet, tomates et les 30 g de pesto, en detendant avec un peu d\'eau de cuisson.',
      'Poivrer et servir aussitot.',
    ],
  },
  {
    id: 'plat-chili-boeuf',
    nom: 'Chili con carne et riz',
    type: 'plat',
    cuisines: ['mexicaine'],
    regime: ['sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: [],
    motsCles: ['boeuf', 'haricot rouge', 'mais', 'tomate', 'riz'],
    kcal: 650,
    proteines: 38,
    glucides: 78,
    lipides: 18,
    tempsMinutes: 30,
    ingredients: [
      { nom: 'Boeuf hache 5%', quantite: 120, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Haricots rouges cuits', quantite: 120, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Mais', quantite: 60, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Sauce tomate', quantite: 120, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Riz', quantite: 60, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Cuire les 60 g de riz selon le paquet ; reserver au chaud.',
      'Saisir le boeuf hache 5 minutes a feu vif en l\'emiettant.',
      'Ajouter les haricots rinces, le mais, les 120 g de sauce tomate et des epices (cumin, paprika, chili), saler.',
      'Mijoter 15 minutes a feu doux en remuant, jusqu\'a ce que la sauce nappe.',
      'Servir le chili sur le riz.',
    ],
  },
  {
    id: 'plat-gnocchi-tomate',
    nom: 'Gnocchi sauce tomate et mozzarella',
    type: 'plat',
    cuisines: ['italienne'],
    regime: ['vegetarien', 'sans-porc'],
    budget: 'eco',
    allergenes: ['gluten', 'lactose'],
    motsCles: ['gnocchi', 'tomate', 'mozzarella', 'basilic'],
    kcal: 600,
    proteines: 20,
    glucides: 88,
    lipides: 18,
    tempsMinutes: 15,
    ingredients: [
      { nom: 'Gnocchi', quantite: 200, unite: 'g', rayon: 'Rayon frais' },
      { nom: 'Sauce tomate', quantite: 150, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Mozzarella', quantite: 60, unite: 'g', rayon: 'Cremerie' },
    ],
    etapes: [
      'Plonger les 200 g de gnocchi dans l\'eau bouillante salee : ils sont cuits quand ils remontent a la surface (2 a 3 minutes).',
      'Chauffer les 150 g de sauce tomate dans une poele avec sel, poivre et un peu de basilic.',
      'Egoutter les gnocchi et les melanger a la sauce.',
      'Ajouter la mozzarella en des, couvrir 2 minutes (ou passer 3 minutes sous le gril) pour qu\'elle file. Servir aussitot.',
    ],
  },

  // ---------- COLLATIONS supplementaires ----------
  {
    id: 'col-skyr-granola',
    nom: 'Skyr et granola',
    type: 'collation',
    cuisines: ['francaise'],
    regime: ['vegetarien', 'sans-porc'],
    budget: 'normal',
    allergenes: ['lactose', 'gluten'],
    motsCles: ['skyr', 'granola'],
    kcal: 230,
    proteines: 18,
    glucides: 28,
    lipides: 5,
    tempsMinutes: 2,
    ingredients: [
      { nom: 'Skyr', quantite: 150, unite: 'g', rayon: 'Cremerie' },
      { nom: 'Granola', quantite: 30, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Verser les 150 g de skyr dans un bol.',
      'Couvrir des 30 g de granola juste avant de manger pour garder le croquant.',
    ],
  },
  {
    id: 'col-toast-cacahuete',
    nom: 'Toast au beurre de cacahuete',
    type: 'collation',
    cuisines: ['americaine'],
    regime: ['vegetarien', 'vegan', 'sans-porc'],
    budget: 'eco',
    allergenes: ['gluten', 'arachide'],
    motsCles: ['pain', 'cacahuete'],
    kcal: 250,
    proteines: 9,
    glucides: 28,
    lipides: 12,
    tempsMinutes: 3,
    ingredients: [
      { nom: 'Pain complet', quantite: 40, unite: 'g', rayon: 'Boulangerie' },
      { nom: 'Beurre de cacahuete', quantite: 20, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Griller la tranche de pain complet.',
      'Tartiner les 20 g de beurre de cacahuete sur le pain encore chaud pour qu\'il s\'etale bien.',
    ],
  },
  {
    id: 'col-mix-fruits-secs',
    nom: 'Melange noix et chocolat noir',
    type: 'collation',
    cuisines: ['francaise'],
    regime: ['vegetarien', 'vegan', 'sans-porc', 'sans-gluten'],
    budget: 'normal',
    allergenes: ['fruits-a-coque'],
    motsCles: ['noix', 'noisette', 'chocolat', 'fruits secs'],
    kcal: 240,
    proteines: 6,
    glucides: 18,
    lipides: 16,
    tempsMinutes: 1,
    ingredients: [
      { nom: 'Melange de noix', quantite: 25, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Chocolat noir', quantite: 15, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Casser les 15 g de chocolat noir en petits morceaux.',
      'Les melanger aux 25 g de noix dans une petite coupelle et deguster.',
    ],
  },
  {
    id: 'col-oeuf-dur',
    nom: 'Oeuf dur et pain complet',
    type: 'collation',
    cuisines: ['francaise'],
    regime: ['vegetarien', 'sans-porc'],
    budget: 'eco',
    allergenes: ['oeuf', 'gluten'],
    motsCles: ['oeuf', 'pain'],
    kcal: 220,
    proteines: 14,
    glucides: 18,
    lipides: 10,
    tempsMinutes: 10,
    ingredients: [
      { nom: 'Oeufs', quantite: 1, unite: 'piece', rayon: 'Cremerie' },
      { nom: 'Pain complet', quantite: 40, unite: 'g', rayon: 'Boulangerie' },
    ],
    etapes: [
      'Plonger l\'oeuf dans l\'eau bouillante et cuire 9 minutes pour un jaune bien ferme.',
      'Le refroidir sous l\'eau froide, l\'ecaler, le saler et le servir avec la tranche de pain complet.',
    ],
  },
  {
    id: 'col-smoothie-proteine',
    nom: 'Smoothie banane et fromage blanc',
    type: 'collation',
    cuisines: ['americaine'],
    regime: ['vegetarien', 'sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: ['lactose'],
    motsCles: ['banane', 'fromage blanc', 'boisson'],
    kcal: 250,
    proteines: 18,
    glucides: 34,
    lipides: 4,
    tempsMinutes: 4,
    ingredients: [
      { nom: 'Banane', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Fromage blanc', quantite: 150, unite: 'g', rayon: 'Cremerie' },
      { nom: 'Lait demi-ecreme', quantite: 100, unite: 'ml', rayon: 'Cremerie' },
    ],
    etapes: [
      'Eplucher la banane et la couper en troncons.',
      'Mettre la banane, les 150 g de fromage blanc et les 100 ml de lait dans un blender.',
      'Mixer 30 a 40 secondes jusqu\'a une texture lisse et mousseuse ; servir frais.',
    ],
  },
  {
    id: 'col-compote-amandes',
    nom: 'Compote de pomme et amandes',
    type: 'collation',
    cuisines: ['francaise'],
    regime: ['vegetarien', 'vegan', 'sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: ['fruits-a-coque'],
    motsCles: ['compote', 'pomme', 'amande'],
    kcal: 190,
    proteines: 4,
    glucides: 28,
    lipides: 8,
    tempsMinutes: 1,
    ingredients: [
      { nom: 'Compote de pomme sans sucre', quantite: 100, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Amandes', quantite: 15, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Verser les 100 g de compote dans une coupelle.',
      'Concasser grossierement les 15 g d\'amandes et les parsemer dessus pour le croquant.',
    ],
  },

  // ======================================================================
  // EXTENSION 2 : petits-dejeuners varies + plats "perte de poids"
  // ======================================================================

  // ---------- PETITS-DEJEUNERS ----------
  {
    id: 'pd-bowlcake-chocolat',
    nom: 'Bowl cake chocolat',
    type: 'petit-dejeuner',
    cuisines: ['americaine'],
    regime: ['vegetarien', 'sans-porc'],
    budget: 'eco',
    allergenes: ['oeuf', 'gluten', 'lactose'],
    motsCles: ['flocons', 'oeuf', 'chocolat', 'cacao', 'bowl cake'],
    kcal: 380, proteines: 26, glucides: 42, lipides: 12, tempsMinutes: 6,
    ingredients: [
      { nom: 'Flocons d\'avoine', quantite: 40, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Oeuf', quantite: 1, unite: 'piece', rayon: 'Cremerie' },
      { nom: 'Cacao non sucre', quantite: 1, unite: 'c. a soupe', rayon: 'Epicerie' },
      { nom: 'Lait demi-ecreme', quantite: 80, unite: 'ml', rayon: 'Cremerie' },
    ],
    etapes: [
      'Mixer les flocons en farine grossiere, puis melanger avec l\'oeuf, le cacao et le lait jusqu\'a une pate lisse.',
      'Verser dans un bol ou un grand mug allant au micro-ondes.',
      'Cuire 2 minutes a 800 W : le bowl cake doit etre gonfle et tout juste pris au centre.',
      'Laisser tiedir 1 minute, garnir de quelques fruits ou d\'un filet de miel.',
    ],
  },
  {
    id: 'pd-overnight-oats',
    nom: 'Overnight oats',
    type: 'petit-dejeuner',
    cuisines: ['americaine', 'francaise'],
    regime: ['vegetarien', 'sans-porc'],
    budget: 'eco',
    allergenes: ['gluten', 'lactose'],
    motsCles: ['avoine', 'flocons', 'yaourt', 'chia', 'fruits'],
    kcal: 370, proteines: 16, glucides: 54, lipides: 9, tempsMinutes: 5,
    ingredients: [
      { nom: 'Flocons d\'avoine', quantite: 50, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Yaourt nature', quantite: 100, unite: 'g', rayon: 'Cremerie' },
      { nom: 'Lait demi-ecreme', quantite: 80, unite: 'ml', rayon: 'Cremerie' },
      { nom: 'Graines de chia', quantite: 1, unite: 'c. a soupe', rayon: 'Epicerie' },
      { nom: 'Fruits de saison', quantite: 80, unite: 'g', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'La veille, melanger flocons, yaourt, lait et graines de chia dans un bocal.',
      'Couvrir et laisser au refrigerateur toute la nuit : les flocons gonflent et deviennent cremeux.',
      'Le matin, garnir des fruits coupes et deguster froid.',
    ],
  },
  {
    id: 'pd-porridge-pomme-cannelle',
    nom: 'Porridge pomme cannelle',
    type: 'petit-dejeuner',
    cuisines: ['francaise', 'americaine'],
    regime: ['vegetarien', 'vegan', 'sans-porc'],
    budget: 'eco',
    allergenes: ['gluten'],
    motsCles: ['avoine', 'pomme', 'cannelle', 'boisson vegetale'],
    kcal: 350, proteines: 10, glucides: 62, lipides: 7, tempsMinutes: 8,
    ingredients: [
      { nom: 'Flocons d\'avoine', quantite: 50, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Boisson vegetale (avoine)', quantite: 220, unite: 'ml', rayon: 'Epicerie' },
      { nom: 'Pomme', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Cannelle', quantite: 1, unite: 'c. a cafe', rayon: 'Epicerie' },
    ],
    etapes: [
      'Couper la pomme en petits des. Chauffer la boisson vegetale avec la cannelle.',
      'Ajouter les flocons et la moitie des des de pomme, cuire 4 a 5 minutes a feu doux en remuant.',
      'Verser dans un bol et garnir du reste de pomme fraiche pour le croquant.',
    ],
  },
  {
    id: 'pd-pain-perdu-proteine',
    nom: 'Pain perdu proteine',
    type: 'petit-dejeuner',
    cuisines: ['francaise'],
    regime: ['vegetarien', 'sans-porc'],
    budget: 'eco',
    allergenes: ['gluten', 'oeuf', 'lactose'],
    motsCles: ['pain', 'oeuf', 'lait', 'cannelle'],
    kcal: 420, proteines: 24, glucides: 46, lipides: 14, tempsMinutes: 12,
    ingredients: [
      { nom: 'Pain complet', quantite: 80, unite: 'g', rayon: 'Boulangerie' },
      { nom: 'Oeufs', quantite: 2, unite: 'piece', rayon: 'Cremerie' },
      { nom: 'Lait demi-ecreme', quantite: 80, unite: 'ml', rayon: 'Cremerie' },
      { nom: 'Cannelle', quantite: 1, unite: 'c. a cafe', rayon: 'Epicerie' },
    ],
    etapes: [
      'Battre les oeufs avec le lait et la cannelle dans une assiette creuse.',
      'Tremper les tranches de pain 30 secondes par face pour qu\'elles s\'impregnent.',
      'Dorer 2 a 3 minutes par face dans une poele anti-adhesive a peine huilee.',
      'Servir tiede, eventuellement avec quelques fruits frais.',
    ],
  },
  {
    id: 'pd-muffins-proteines',
    nom: 'Muffins proteines a la banane',
    type: 'petit-dejeuner',
    cuisines: ['americaine'],
    regime: ['vegetarien', 'sans-porc'],
    budget: 'eco',
    allergenes: ['gluten', 'oeuf'],
    motsCles: ['muffin', 'banane', 'oeuf', 'flocons'],
    kcal: 380, proteines: 22, glucides: 44, lipides: 12, tempsMinutes: 25,
    ingredients: [
      { nom: 'Flocons d\'avoine', quantite: 60, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Oeufs', quantite: 2, unite: 'piece', rayon: 'Cremerie' },
      { nom: 'Banane', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Levure chimique', quantite: 1, unite: 'c. a cafe', rayon: 'Epicerie' },
    ],
    etapes: [
      'Prechauffer le four a 180 C. Mixer les flocons en farine.',
      'Ecraser la banane, ajouter les oeufs, la farine d\'avoine et la levure ; melanger.',
      'Repartir dans des moules a muffins et enfourner 18 a 20 minutes (la pointe d\'un couteau ressort seche).',
      'Laisser tiedir avant de demouler. Se conserve 2 a 3 jours.',
    ],
  },
  {
    id: 'pd-granola-maison',
    nom: 'Granola maison et yaourt',
    type: 'petit-dejeuner',
    cuisines: ['americaine'],
    regime: ['vegetarien', 'sans-porc'],
    budget: 'normal',
    allergenes: ['gluten', 'fruits-a-coque', 'lactose'],
    motsCles: ['granola', 'avoine', 'noix', 'miel', 'yaourt'],
    kcal: 410, proteines: 16, glucides: 50, lipides: 16, tempsMinutes: 30,
    ingredients: [
      { nom: 'Flocons d\'avoine', quantite: 50, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Noix', quantite: 15, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Miel', quantite: 1, unite: 'c. a soupe', rayon: 'Epicerie' },
      { nom: 'Huile (neutre)', quantite: 1, unite: 'c. a cafe', rayon: 'Epicerie' },
      { nom: 'Yaourt nature', quantite: 150, unite: 'g', rayon: 'Cremerie' },
    ],
    etapes: [
      'Prechauffer le four a 160 C. Melanger flocons, noix concassees, miel et huile.',
      'Etaler sur une plaque et cuire 15 a 18 minutes en remuant a mi-cuisson, jusqu\'a ce que le granola soit dore.',
      'Laisser refroidir (il devient croustillant), puis servir sur le yaourt.',
    ],
  },
  {
    id: 'pd-smoothie-bowl',
    nom: 'Smoothie bowl',
    type: 'petit-dejeuner',
    cuisines: ['americaine'],
    regime: ['vegetarien', 'vegan', 'sans-porc'],
    budget: 'normal',
    allergenes: ['gluten'],
    motsCles: ['smoothie', 'banane', 'fruits rouges', 'granola', 'bowl'],
    kcal: 340, proteines: 9, glucides: 58, lipides: 8, tempsMinutes: 6,
    ingredients: [
      { nom: 'Banane', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Fruits rouges surgeles', quantite: 100, unite: 'g', rayon: 'Surgeles' },
      { nom: 'Boisson vegetale (avoine)', quantite: 100, unite: 'ml', rayon: 'Epicerie' },
      { nom: 'Granola', quantite: 20, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Mixer la banane, les fruits rouges et la boisson vegetale jusqu\'a une texture epaisse (comme une glace).',
      'Verser dans un bol.',
      'Garnir du granola et de quelques fruits frais en surface. Deguster aussitot.',
    ],
  },
  {
    id: 'pd-chia-pudding',
    nom: 'Chia pudding',
    type: 'petit-dejeuner',
    cuisines: ['americaine'],
    regime: ['vegetarien', 'vegan', 'sans-porc', 'sans-gluten'],
    budget: 'normal',
    allergenes: [],
    motsCles: ['chia', 'boisson vegetale', 'fruits', 'pudding'],
    kcal: 320, proteines: 10, glucides: 34, lipides: 16, tempsMinutes: 5,
    ingredients: [
      { nom: 'Graines de chia', quantite: 30, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Boisson vegetale (amande)', quantite: 200, unite: 'ml', rayon: 'Epicerie' },
      { nom: 'Fruits de saison', quantite: 80, unite: 'g', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'Melanger les graines de chia et la boisson vegetale dans un bocal.',
      'Remuer, attendre 5 minutes, remuer a nouveau pour eviter les grumeaux.',
      'Couvrir et reserver au frais au moins 3 heures (ideal une nuit), jusqu\'a une texture de pudding.',
      'Garnir de fruits frais avant de servir.',
    ],
  },
  {
    id: 'pd-toast-avocat-saumon',
    nom: 'Toast avocat et saumon',
    type: 'petit-dejeuner',
    cuisines: ['mediterraneenne', 'americaine'],
    regime: ['sans-porc'],
    budget: 'normal',
    allergenes: ['gluten', 'poisson'],
    motsCles: ['pain', 'avocat', 'saumon', 'toast'],
    kcal: 370, proteines: 22, glucides: 30, lipides: 18, tempsMinutes: 6,
    ingredients: [
      { nom: 'Pain complet', quantite: 60, unite: 'g', rayon: 'Boulangerie' },
      { nom: 'Avocat', quantite: 0.5, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Saumon fume', quantite: 50, unite: 'g', rayon: 'Poissonnerie' },
    ],
    etapes: [
      'Griller le pain complet.',
      'Ecraser l\'avocat avec un filet de citron, du sel et du poivre, puis l\'etaler sur le pain.',
      'Disposer les tranches de saumon fume dessus ; un tour de poivre et c\'est pret.',
    ],
  },
  {
    id: 'pd-toast-avocat-oeuf',
    nom: 'Toast avocat et oeuf',
    type: 'petit-dejeuner',
    cuisines: ['mediterraneenne', 'americaine'],
    regime: ['vegetarien', 'sans-porc'],
    budget: 'eco',
    allergenes: ['gluten', 'oeuf'],
    motsCles: ['pain', 'avocat', 'oeuf', 'toast'],
    kcal: 350, proteines: 16, glucides: 30, lipides: 18, tempsMinutes: 8,
    ingredients: [
      { nom: 'Pain complet', quantite: 60, unite: 'g', rayon: 'Boulangerie' },
      { nom: 'Avocat', quantite: 0.5, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Oeuf', quantite: 1, unite: 'piece', rayon: 'Cremerie' },
    ],
    etapes: [
      'Cuire l\'oeuf au plat ou poche (3 a 4 minutes, jaune coulant).',
      'Griller le pain et y ecraser l\'avocat assaisonne de sel, poivre et citron.',
      'Poser l\'oeuf dessus et servir aussitot.',
    ],
  },
  {
    id: 'pd-skyr-fruits-rouges',
    nom: 'Skyr fruits rouges',
    type: 'petit-dejeuner',
    cuisines: ['francaise', 'mediterraneenne'],
    regime: ['vegetarien', 'sans-porc', 'sans-gluten'],
    budget: 'normal',
    allergenes: ['lactose'],
    motsCles: ['skyr', 'fruits rouges', 'miel'],
    kcal: 280, proteines: 28, glucides: 34, lipides: 3, tempsMinutes: 4,
    ingredients: [
      { nom: 'Skyr', quantite: 200, unite: 'g', rayon: 'Cremerie' },
      { nom: 'Fruits rouges surgeles', quantite: 80, unite: 'g', rayon: 'Surgeles' },
      { nom: 'Miel', quantite: 1, unite: 'c. a cafe', rayon: 'Epicerie' },
    ],
    etapes: [
      'Sortir les fruits rouges 10 minutes a l\'avance pour les attendrir.',
      'Verser le skyr dans un bol, ajouter les fruits et leur jus.',
      'Napper d\'un filet de miel et melanger legerement.',
    ],
  },
  {
    id: 'pd-yaourt-grec-noix-miel',
    nom: 'Yaourt grec, noix et miel',
    type: 'petit-dejeuner',
    cuisines: ['mediterraneenne', 'francaise'],
    regime: ['vegetarien', 'sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: ['lactose', 'fruits-a-coque'],
    motsCles: ['yaourt', 'noix', 'miel'],
    kcal: 340, proteines: 16, glucides: 26, lipides: 18, tempsMinutes: 4,
    ingredients: [
      { nom: 'Yaourt grec', quantite: 150, unite: 'g', rayon: 'Cremerie' },
      { nom: 'Noix', quantite: 20, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Miel', quantite: 1, unite: 'c. a cafe', rayon: 'Epicerie' },
    ],
    etapes: [
      'Verser le yaourt grec dans un bol.',
      'Concasser les noix et les parsemer dessus.',
      'Terminer par un filet de miel.',
    ],
  },
  {
    id: 'pd-crepes-proteines',
    nom: 'Crepes proteines',
    type: 'petit-dejeuner',
    cuisines: ['francaise'],
    regime: ['vegetarien', 'sans-porc'],
    budget: 'eco',
    allergenes: ['gluten', 'oeuf', 'lactose'],
    motsCles: ['crepe', 'oeuf', 'farine', 'lait'],
    kcal: 380, proteines: 22, glucides: 44, lipides: 12, tempsMinutes: 15,
    ingredients: [
      { nom: 'Farine complete', quantite: 50, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Oeufs', quantite: 2, unite: 'piece', rayon: 'Cremerie' },
      { nom: 'Lait demi-ecreme', quantite: 120, unite: 'ml', rayon: 'Cremerie' },
    ],
    etapes: [
      'Fouetter la farine, les oeufs et le lait jusqu\'a une pate lisse et fluide ; laisser reposer 10 minutes.',
      'Chauffer une poele a peine huilee a feu moyen.',
      'Verser une fine louche, cuire 1 minute, retourner quand les bords se decollent, puis 30 secondes.',
      'Garnir selon l\'envie (banane, fruits rouges, un peu de miel).',
    ],
  },

  // ---------- PLATS PERTE DE POIDS : POULET ----------
  {
    id: 'plat-poulet-curry-coco-leger',
    nom: 'Poulet curry coco leger',
    type: 'plat',
    cuisines: ['asiatique', 'indienne'],
    regime: ['sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: [],
    motsCles: ['poulet', 'curry', 'coco', 'courgette', 'riz'],
    kcal: 470, proteines: 38, glucides: 44, lipides: 14, tempsMinutes: 25,
    ingredients: [
      { nom: 'Filet de poulet', quantite: 130, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Lait de coco allege', quantite: 60, unite: 'ml', rayon: 'Epicerie' },
      { nom: 'Curry en poudre', quantite: 1, unite: 'c. a cafe', rayon: 'Epicerie' },
      { nom: 'Courgette', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Riz basmati', quantite: 50, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Cuire le riz selon le paquet. Couper poulet et courgette en des.',
      'Saisir le poulet 4 minutes, ajouter la courgette et le curry, melanger 1 minute.',
      'Verser le lait de coco allege, mijoter 8 a 10 minutes jusqu\'a ce que la sauce nappe legerement.',
      'Saler et servir avec le riz.',
    ],
  },
  {
    id: 'plat-poulet-citron-romarin',
    nom: 'Poulet citron romarin',
    type: 'plat',
    cuisines: ['mediterraneenne', 'francaise'],
    regime: ['sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: [],
    motsCles: ['poulet', 'citron', 'romarin', 'pomme de terre', 'haricot'],
    kcal: 460, proteines: 40, glucides: 38, lipides: 12, tempsMinutes: 30,
    ingredients: [
      { nom: 'Filet de poulet', quantite: 140, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Citron', quantite: 0.5, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Pomme de terre', quantite: 150, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Haricots verts', quantite: 120, unite: 'g', rayon: 'Surgeles' },
      { nom: 'Romarin', quantite: 1, unite: 'c. a cafe', rayon: 'Epicerie' },
    ],
    etapes: [
      'Cuire les pommes de terre 15 a 18 minutes et les haricots verts a la vapeur.',
      'Assaisonner le poulet de sel, poivre, romarin et jus de citron.',
      'Le poeler 5 a 6 minutes par face jusqu\'a ce qu\'il soit dore et cuit a coeur.',
      'Servir avec les legumes et un trait de citron.',
    ],
  },
  {
    id: 'plat-poulet-paprika',
    nom: 'Poulet paprika et poivrons',
    type: 'plat',
    cuisines: ['mediterraneenne'],
    regime: ['sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: [],
    motsCles: ['poulet', 'paprika', 'poivron', 'oignon', 'riz'],
    kcal: 470, proteines: 38, glucides: 46, lipides: 12, tempsMinutes: 25,
    ingredients: [
      { nom: 'Filet de poulet', quantite: 140, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Poivron', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Oignon', quantite: 0.5, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Paprika', quantite: 1, unite: 'c. a cafe', rayon: 'Epicerie' },
      { nom: 'Riz', quantite: 50, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Cuire le riz. Emincer oignon et poivron.',
      'Faire revenir l\'oignon 2 minutes, ajouter le poulet en des et saisir 4 minutes.',
      'Ajouter le poivron et le paprika, cuire 6 a 8 minutes a feu moyen.',
      'Saler et servir avec le riz.',
    ],
  },
  {
    id: 'plat-poulet-tikka',
    nom: 'Poulet tikka et riz',
    type: 'plat',
    cuisines: ['indienne'],
    regime: ['sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: ['lactose'],
    motsCles: ['poulet', 'tikka', 'yaourt', 'epices', 'riz'],
    kcal: 480, proteines: 38, glucides: 46, lipides: 13, tempsMinutes: 30,
    ingredients: [
      { nom: 'Filet de poulet', quantite: 130, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Yaourt nature', quantite: 50, unite: 'g', rayon: 'Cremerie' },
      { nom: 'Epices tikka massala', quantite: 1, unite: 'c. a soupe', rayon: 'Epicerie' },
      { nom: 'Riz basmati', quantite: 50, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Couper le poulet en des, le mariner 15 minutes dans le yaourt et les epices tikka.',
      'Cuire le riz pendant ce temps.',
      'Saisir le poulet marine 8 a 10 minutes a feu moyen-vif jusqu\'a une belle coloration.',
      'Servir avec le riz et un peu de coriandre.',
    ],
  },
  {
    id: 'plat-poulet-satay',
    nom: 'Poulet satay (sauce cacahuete)',
    type: 'plat',
    cuisines: ['asiatique', 'thailandaise'],
    regime: ['sans-porc'],
    budget: 'normal',
    allergenes: ['arachide', 'soja', 'gluten'],
    motsCles: ['poulet', 'cacahuete', 'satay', 'soja', 'riz'],
    kcal: 510, proteines: 38, glucides: 42, lipides: 18, tempsMinutes: 25,
    ingredients: [
      { nom: 'Filet de poulet', quantite: 130, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Beurre de cacahuete', quantite: 15, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Sauce soja', quantite: 1, unite: 'c. a soupe', rayon: 'Epicerie' },
      { nom: 'Riz', quantite: 50, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Cuire le riz. Couper le poulet en lanieres.',
      'Saisir le poulet 5 a 6 minutes a feu vif.',
      'Delayer le beurre de cacahuete avec la sauce soja et un peu d\'eau chaude pour une sauce nappante.',
      'Napper le poulet de sauce satay et servir sur le riz.',
    ],
  },
  {
    id: 'plat-poulet-mediterraneen',
    nom: 'Poulet mediterraneen et quinoa',
    type: 'plat',
    cuisines: ['mediterraneenne'],
    regime: ['sans-porc', 'sans-gluten'],
    budget: 'normal',
    allergenes: ['lactose'],
    motsCles: ['poulet', 'tomate', 'courgette', 'feta', 'olive', 'quinoa'],
    kcal: 480, proteines: 36, glucides: 40, lipides: 18, tempsMinutes: 30,
    ingredients: [
      { nom: 'Filet de poulet', quantite: 130, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Quinoa', quantite: 50, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Tomates cerises', quantite: 100, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Courgette', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Feta', quantite: 30, unite: 'g', rayon: 'Cremerie' },
    ],
    etapes: [
      'Cuire le quinoa 12 a 14 minutes. Couper poulet et courgette.',
      'Saisir le poulet 4 minutes, ajouter la courgette et les tomates cerises, cuire 6 minutes.',
      'Assaisonner d\'herbes (origan), melanger au quinoa.',
      'Emietter la feta par-dessus et servir.',
    ],
  },
  {
    id: 'plat-poulet-teriyaki-leger',
    nom: 'Poulet teriyaki et brocoli',
    type: 'plat',
    cuisines: ['asiatique', 'japonaise'],
    regime: ['sans-porc'],
    budget: 'eco',
    allergenes: ['soja', 'gluten', 'sesame'],
    motsCles: ['poulet', 'teriyaki', 'soja', 'brocoli', 'riz'],
    kcal: 500, proteines: 38, glucides: 54, lipides: 10, tempsMinutes: 25,
    ingredients: [
      { nom: 'Filet de poulet', quantite: 130, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Sauce teriyaki', quantite: 2, unite: 'c. a soupe', rayon: 'Epicerie' },
      { nom: 'Brocoli', quantite: 150, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Riz', quantite: 60, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Cuire le riz et la vapeur de brocoli (6 a 8 minutes, croquant).',
      'Couper le poulet en des, le saisir 5 a 6 minutes.',
      'Verser la sauce teriyaki, laisser caramelier 2 minutes en enrobant le poulet.',
      'Servir avec le riz et le brocoli, parsemer de sesame.',
    ],
  },

  // ---------- PLATS PERTE DE POIDS : BOEUF ----------
  {
    id: 'plat-steak-poivre-leger',
    nom: 'Steak sauce poivre legere',
    type: 'plat',
    cuisines: ['francaise'],
    regime: ['sans-porc', 'sans-gluten'],
    budget: 'normal',
    allergenes: ['lactose'],
    motsCles: ['boeuf', 'steak', 'poivre', 'creme', 'haricot'],
    kcal: 480, proteines: 40, glucides: 30, lipides: 20, tempsMinutes: 20,
    ingredients: [
      { nom: 'Steak de boeuf', quantite: 130, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Creme legere', quantite: 40, unite: 'ml', rayon: 'Cremerie' },
      { nom: 'Poivre concasse', quantite: 1, unite: 'c. a cafe', rayon: 'Epicerie' },
      { nom: 'Haricots verts', quantite: 150, unite: 'g', rayon: 'Surgeles' },
      { nom: 'Pomme de terre', quantite: 120, unite: 'g', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'Cuire pommes de terre et haricots verts.',
      'Saisir le steak dans une poele bien chaude (1 min 30 a 2 min 30 par face selon cuisson) ; reserver.',
      'Deglacer la poele avec la creme legere et le poivre concasse, reduire 2 minutes.',
      'Napper le steak de sauce et servir avec les legumes.',
    ],
  },
  {
    id: 'plat-boulettes-tomate-basilic',
    nom: 'Boulettes de boeuf tomate basilic',
    type: 'plat',
    cuisines: ['italienne'],
    regime: ['sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: [],
    motsCles: ['boeuf', 'boulette', 'tomate', 'basilic', 'courgette'],
    kcal: 430, proteines: 34, glucides: 24, lipides: 20, tempsMinutes: 30,
    ingredients: [
      { nom: 'Boeuf hache 5%', quantite: 120, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Sauce tomate', quantite: 120, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Courgette', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Basilic', quantite: 1, unite: 'c. a soupe', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'Faconner des boulettes avec le boeuf hache assaisonne.',
      'Les dorer 5 minutes a la poele, ajouter la sauce tomate, mijoter 12 minutes avec le basilic.',
      'Tailler la courgette en tagliatelles (econome) et la poeler 3 a 4 minutes.',
      'Servir les boulettes et leur sauce sur les courgettes.',
    ],
  },
  {
    id: 'plat-boeuf-thai',
    nom: 'Boeuf thai au basilic',
    type: 'plat',
    cuisines: ['asiatique', 'thailandaise'],
    regime: ['sans-porc'],
    budget: 'normal',
    allergenes: ['soja', 'gluten', 'poisson'],
    motsCles: ['boeuf', 'basilic', 'soja', 'poivron', 'riz'],
    kcal: 490, proteines: 34, glucides: 46, lipides: 18, tempsMinutes: 20,
    ingredients: [
      { nom: 'Boeuf a griller emince', quantite: 120, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Poivron', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Sauce soja', quantite: 1, unite: 'c. a soupe', rayon: 'Epicerie' },
      { nom: 'Sauce nuoc-mam', quantite: 1, unite: 'c. a cafe', rayon: 'Epicerie' },
      { nom: 'Riz', quantite: 50, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Cuire le riz. Emincer le poivron.',
      'Saisir le boeuf 2 minutes a feu vif dans un wok, reserver.',
      'Sauter le poivron 3 minutes, remettre le boeuf, deglacer soja + nuoc-mam.',
      'Hors du feu, ajouter du basilic frais et servir sur le riz.',
    ],
  },
  {
    id: 'plat-boeuf-wok-legumes',
    nom: 'Boeuf au wok et legumes',
    type: 'plat',
    cuisines: ['asiatique'],
    regime: ['sans-porc'],
    budget: 'normal',
    allergenes: ['soja', 'gluten', 'sesame'],
    motsCles: ['boeuf', 'wok', 'brocoli', 'carotte', 'soja', 'riz'],
    kcal: 450, proteines: 34, glucides: 38, lipides: 18, tempsMinutes: 20,
    ingredients: [
      { nom: 'Boeuf a griller emince', quantite: 120, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Brocoli', quantite: 120, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Carotte', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Sauce soja', quantite: 2, unite: 'c. a soupe', rayon: 'Epicerie' },
      { nom: 'Riz', quantite: 40, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Cuire le riz. Detailler brocoli et carotte en petits morceaux.',
      'Saisir le boeuf 2 minutes au wok tres chaud, reserver.',
      'Sauter les legumes 4 a 5 minutes (ils restent croquants), remettre le boeuf.',
      'Deglacer a la sauce soja, parsemer de sesame et servir sur le riz.',
    ],
  },

  // ---------- PLATS PERTE DE POIDS : POISSON ----------
  {
    id: 'plat-saumon-miel-moutarde',
    nom: 'Saumon miel moutarde',
    type: 'plat',
    cuisines: ['francaise', 'mediterraneenne'],
    regime: ['sans-porc', 'sans-gluten'],
    budget: 'normal',
    allergenes: ['poisson'],
    motsCles: ['saumon', 'miel', 'moutarde', 'brocoli', 'riz'],
    kcal: 500, proteines: 36, glucides: 36, lipides: 22, tempsMinutes: 25,
    ingredients: [
      { nom: 'Pave de saumon', quantite: 130, unite: 'g', rayon: 'Poissonnerie' },
      { nom: 'Miel', quantite: 1, unite: 'c. a cafe', rayon: 'Epicerie' },
      { nom: 'Moutarde', quantite: 1, unite: 'c. a cafe', rayon: 'Epicerie' },
      { nom: 'Brocoli', quantite: 150, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Riz', quantite: 50, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Cuire le riz et la vapeur de brocoli. Prechauffer le four a 190 C.',
      'Melanger miel et moutarde, en badigeonner le pave de saumon.',
      'Enfourner 12 a 14 minutes (la chair s\'effeuille).',
      'Servir avec le riz et le brocoli.',
    ],
  },
  {
    id: 'plat-cabillaud-citron',
    nom: 'Cabillaud citron et legumes',
    type: 'plat',
    cuisines: ['francaise', 'mediterraneenne'],
    regime: ['sans-porc', 'sans-gluten'],
    budget: 'normal',
    allergenes: ['poisson'],
    motsCles: ['cabillaud', 'citron', 'courgette', 'pomme de terre'],
    kcal: 420, proteines: 38, glucides: 40, lipides: 8, tempsMinutes: 25,
    ingredients: [
      { nom: 'Dos de cabillaud', quantite: 140, unite: 'g', rayon: 'Poissonnerie' },
      { nom: 'Citron', quantite: 0.5, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Courgette', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Pomme de terre', quantite: 150, unite: 'g', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'Cuire les pommes de terre 15 a 18 minutes. Tailler la courgette en rondelles et la poeler 5 minutes.',
      'Poser le cabillaud dans une poele avec un filet d\'huile, du sel et des rondelles de citron.',
      'Cuire 4 minutes par face a feu moyen, jusqu\'a ce que la chair soit nacree.',
      'Servir avec les legumes et un trait de citron.',
    ],
  },
  {
    id: 'plat-fish-tacos',
    nom: 'Fish tacos',
    type: 'plat',
    cuisines: ['mexicaine'],
    regime: ['sans-porc'],
    budget: 'normal',
    allergenes: ['poisson', 'gluten', 'lactose'],
    motsCles: ['cabillaud', 'tortilla', 'chou', 'yaourt', 'avocat'],
    kcal: 500, proteines: 32, glucides: 50, lipides: 18, tempsMinutes: 25,
    ingredients: [
      { nom: 'Dos de cabillaud', quantite: 120, unite: 'g', rayon: 'Poissonnerie' },
      { nom: 'Petites tortillas', quantite: 2, unite: 'piece', rayon: 'Epicerie' },
      { nom: 'Chou blanc', quantite: 60, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Yaourt nature', quantite: 40, unite: 'g', rayon: 'Cremerie' },
      { nom: 'Avocat', quantite: 0.5, unite: 'piece', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'Couper le cabillaud en morceaux, l\'assaisonner (paprika, cumin) et le poeler 5 a 6 minutes.',
      'Melanger le yaourt avec du jus de citron pour la sauce ; emincer le chou.',
      'Tiedir les tortillas.',
      'Garnir de chou, poisson, lamelles d\'avocat et sauce yaourt. Replier et servir.',
    ],
  },
  {
    id: 'plat-thon-mediterraneen',
    nom: 'Salade de thon mediterraneenne',
    type: 'plat',
    cuisines: ['mediterraneenne'],
    regime: ['sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: ['poisson'],
    motsCles: ['thon', 'haricot blanc', 'tomate', 'olive', 'oignon'],
    kcal: 440, proteines: 34, glucides: 42, lipides: 12, tempsMinutes: 10,
    ingredients: [
      { nom: 'Thon au naturel', quantite: 100, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Haricots blancs cuits', quantite: 100, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Tomate', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Olives', quantite: 20, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Oignon rouge', quantite: 0.25, unite: 'piece', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'Rincer et egoutter les haricots blancs. Couper la tomate en des et l\'oignon en fines lamelles.',
      'Melanger thon emiette, haricots, tomate, oignon et olives.',
      'Assaisonner d\'huile d\'olive, citron, sel et poivre. Servir frais.',
    ],
  },

  // ---------- PLATS PERTE DE POIDS : VEGETARIEN & EXPRESS ----------
  {
    id: 'plat-bowl-quinoa-legumes',
    nom: 'Bowl quinoa et legumes rotis',
    type: 'plat',
    cuisines: ['mediterraneenne', 'vegetale'],
    regime: ['vegetarien', 'vegan', 'sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: [],
    motsCles: ['quinoa', 'pois chiche', 'courgette', 'poivron', 'avocat'],
    kcal: 480, proteines: 16, glucides: 64, lipides: 16, tempsMinutes: 30,
    ingredients: [
      { nom: 'Quinoa', quantite: 70, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Pois chiches cuits', quantite: 80, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Courgette', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Poivron', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Avocat', quantite: 0.5, unite: 'piece', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'Prechauffer le four a 200 C. Couper courgette et poivron en morceaux, les rotir 20 minutes avec un filet d\'huile.',
      'Cuire le quinoa 12 a 14 minutes ; rincer et egoutter les pois chiches.',
      'Assembler dans un bol quinoa, legumes rotis, pois chiches et lamelles d\'avocat.',
      'Assaisonner d\'huile d\'olive, citron et sel.',
    ],
  },
  {
    id: 'plat-omelette-legumes',
    nom: 'Omelette aux legumes',
    type: 'plat',
    cuisines: ['francaise'],
    regime: ['vegetarien', 'sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: ['oeuf'],
    motsCles: ['oeuf', 'courgette', 'poivron', 'tomate', 'omelette'],
    kcal: 360, proteines: 24, glucides: 14, lipides: 22, tempsMinutes: 15,
    ingredients: [
      { nom: 'Oeufs', quantite: 3, unite: 'piece', rayon: 'Cremerie' },
      { nom: 'Courgette', quantite: 0.5, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Poivron', quantite: 0.5, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Tomate', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'Couper les legumes en petits des et les faire revenir 6 a 7 minutes a feu moyen ; saler.',
      'Battre les oeufs avec sel et poivre, les verser sur les legumes.',
      'Cuire a feu moyen, replier l\'omelette quand elle est prise mais encore moelleuse.',
    ],
  },
  {
    id: 'plat-salade-thon-avocat',
    nom: 'Salade thon avocat',
    type: 'plat',
    cuisines: ['americaine', 'mediterraneenne'],
    regime: ['sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: ['poisson'],
    motsCles: ['thon', 'avocat', 'salade', 'tomate', 'mais'],
    kcal: 420, proteines: 32, glucides: 24, lipides: 22, tempsMinutes: 8,
    ingredients: [
      { nom: 'Thon au naturel', quantite: 100, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Avocat', quantite: 0.5, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Salade verte', quantite: 60, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Tomate', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Mais', quantite: 40, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Disposer la salade au fond d\'un bol.',
      'Ajouter le thon emiette, les des de tomate, le mais et l\'avocat en lamelles.',
      'Assaisonner d\'huile d\'olive, citron, sel et poivre.',
    ],
  },
  {
    id: 'plat-sandwich-proteine',
    nom: 'Sandwich proteine poulet',
    type: 'plat',
    cuisines: ['americaine'],
    regime: ['sans-porc'],
    budget: 'eco',
    allergenes: ['gluten', 'lactose'],
    motsCles: ['pain', 'poulet', 'crudites', 'fromage frais', 'sandwich'],
    kcal: 450, proteines: 34, glucides: 44, lipides: 14, tempsMinutes: 8,
    ingredients: [
      { nom: 'Pain complet', quantite: 80, unite: 'g', rayon: 'Boulangerie' },
      { nom: 'Filet de poulet', quantite: 80, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Fromage frais allege', quantite: 30, unite: 'g', rayon: 'Cremerie' },
      { nom: 'Salade verte', quantite: 30, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Tomate', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'Poeler le poulet en lanieres 5 a 6 minutes (ou utiliser un reste de poulet froid).',
      'Tartiner le pain de fromage frais.',
      'Garnir de salade, tomate et poulet, refermer et presser legerement.',
    ],
  },
  {
    id: 'plat-riz-poulet-express',
    nom: 'Riz express et poulet (micro-ondes)',
    type: 'plat',
    cuisines: ['asiatique', 'francaise'],
    regime: ['sans-porc'],
    budget: 'eco',
    allergenes: ['soja', 'gluten'],
    motsCles: ['riz', 'poulet', 'legumes', 'soja', 'express'],
    kcal: 470, proteines: 36, glucides: 52, lipides: 10, tempsMinutes: 12,
    ingredients: [
      { nom: 'Riz express (sachet)', quantite: 125, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Filet de poulet', quantite: 120, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Legumes surgeles (poelee)', quantite: 120, unite: 'g', rayon: 'Surgeles' },
      { nom: 'Sauce soja', quantite: 1, unite: 'c. a soupe', rayon: 'Epicerie' },
    ],
    etapes: [
      'Rechauffer le riz express au micro-ondes (2 minutes).',
      'Poeler le poulet en des 6 minutes, ajouter les legumes surgeles et cuire 4 minutes.',
      'Ajouter le riz et la sauce soja, melanger 1 minute a feu vif et servir.',
    ],
  },

  // ======================================================================
  // EXTENSION 3 : objectifs 40 petits-dejeuners / 80 plats
  // ======================================================================

  // ---------- PETITS-DEJEUNERS (suite) ----------
  {
    id: 'pd-gaufres-proteines',
    nom: 'Gaufres proteines',
    type: 'petit-dejeuner',
    cuisines: ['americaine'],
    regime: ['vegetarien', 'sans-porc'],
    budget: 'eco',
    allergenes: ['gluten', 'oeuf', 'lactose'],
    motsCles: ['gaufre', 'oeuf', 'farine', 'lait'],
    kcal: 400, proteines: 24, glucides: 46, lipides: 12, tempsMinutes: 15,
    ingredients: [
      { nom: 'Farine complete', quantite: 50, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Oeufs', quantite: 2, unite: 'piece', rayon: 'Cremerie' },
      { nom: 'Lait demi-ecreme', quantite: 100, unite: 'ml', rayon: 'Cremerie' },
      { nom: 'Levure chimique', quantite: 0.5, unite: 'c. a cafe', rayon: 'Epicerie' },
    ],
    etapes: [
      'Fouetter farine, oeufs, lait et levure jusqu\'a une pate lisse.',
      'Chauffer le gaufrier et le huiler legerement.',
      'Cuire chaque gaufre 3 a 4 minutes jusqu\'a ce qu\'elle soit doree.',
      'Servir avec quelques fruits frais.',
    ],
  },
  {
    id: 'pd-chia-chocolat',
    nom: 'Chia pudding chocolat',
    type: 'petit-dejeuner',
    cuisines: ['americaine'],
    regime: ['vegetarien', 'vegan', 'sans-porc', 'sans-gluten'],
    budget: 'normal',
    allergenes: [],
    motsCles: ['chia', 'cacao', 'chocolat', 'boisson vegetale'],
    kcal: 340, proteines: 11, glucides: 36, lipides: 16, tempsMinutes: 5,
    ingredients: [
      { nom: 'Graines de chia', quantite: 30, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Boisson vegetale (avoine)', quantite: 200, unite: 'ml', rayon: 'Epicerie' },
      { nom: 'Cacao non sucre', quantite: 1, unite: 'c. a soupe', rayon: 'Epicerie' },
      { nom: 'Banane', quantite: 0.5, unite: 'piece', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'Melanger chia, boisson vegetale et cacao ; remuer 2 fois a 5 minutes d\'intervalle.',
      'Reserver au frais au moins 3 heures (ideal une nuit).',
      'Garnir de rondelles de banane avant de servir.',
    ],
  },
  {
    id: 'pd-oeufs-cocotte',
    nom: 'Oeufs cocotte',
    type: 'petit-dejeuner',
    cuisines: ['francaise'],
    regime: ['vegetarien', 'sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: ['oeuf', 'lactose'],
    motsCles: ['oeuf', 'creme', 'epinard', 'cocotte'],
    kcal: 320, proteines: 20, glucides: 8, lipides: 24, tempsMinutes: 15,
    ingredients: [
      { nom: 'Oeufs', quantite: 2, unite: 'piece', rayon: 'Cremerie' },
      { nom: 'Creme legere', quantite: 30, unite: 'ml', rayon: 'Cremerie' },
      { nom: 'Epinards frais', quantite: 40, unite: 'g', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'Prechauffer le four a 180 C. Faire tomber les epinards 2 minutes a la poele.',
      'Repartir epinards et creme dans deux ramequins, casser un oeuf dans chacun ; saler, poivrer.',
      'Cuire au bain-marie au four 10 a 12 minutes (blanc pris, jaune coulant).',
    ],
  },
  {
    id: 'pd-tartine-fromage-concombre',
    nom: 'Tartine fromage frais et concombre',
    type: 'petit-dejeuner',
    cuisines: ['francaise', 'mediterraneenne'],
    regime: ['vegetarien', 'sans-porc'],
    budget: 'eco',
    allergenes: ['gluten', 'lactose'],
    motsCles: ['pain', 'fromage frais', 'concombre'],
    kcal: 300, proteines: 14, glucides: 36, lipides: 10, tempsMinutes: 5,
    ingredients: [
      { nom: 'Pain complet', quantite: 70, unite: 'g', rayon: 'Boulangerie' },
      { nom: 'Fromage frais allege', quantite: 50, unite: 'g', rayon: 'Cremerie' },
      { nom: 'Concombre', quantite: 0.3, unite: 'piece', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'Griller le pain complet.',
      'Tartiner de fromage frais, saler et poivrer.',
      'Disposer de fines rondelles de concombre dessus ; quelques herbes (ciboulette) en finition.',
    ],
  },
  {
    id: 'pd-banana-bread',
    nom: 'Banana bread (tranche)',
    type: 'petit-dejeuner',
    cuisines: ['americaine'],
    regime: ['vegetarien', 'sans-porc'],
    budget: 'normal',
    allergenes: ['gluten', 'oeuf'],
    motsCles: ['banane', 'cake', 'farine', 'oeuf'],
    kcal: 360, proteines: 12, glucides: 52, lipides: 11, tempsMinutes: 35,
    ingredients: [
      { nom: 'Banane', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Farine complete', quantite: 50, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Oeuf', quantite: 1, unite: 'piece', rayon: 'Cremerie' },
      { nom: 'Levure chimique', quantite: 0.5, unite: 'c. a cafe', rayon: 'Epicerie' },
    ],
    etapes: [
      'Prechauffer le four a 175 C. Ecraser la banane, ajouter oeuf, farine et levure.',
      'Verser dans un petit moule a cake chemise.',
      'Cuire 25 a 30 minutes (la pointe d\'un couteau ressort seche).',
      'Laisser tiedir, trancher. Se conserve 3 jours.',
    ],
  },
  {
    id: 'pd-smoothie-vert',
    nom: 'Smoothie vert',
    type: 'petit-dejeuner',
    cuisines: ['americaine'],
    regime: ['vegetarien', 'vegan', 'sans-porc', 'sans-gluten'],
    budget: 'normal',
    allergenes: [],
    motsCles: ['epinard', 'banane', 'ananas', 'smoothie', 'boisson vegetale'],
    kcal: 290, proteines: 7, glucides: 56, lipides: 4, tempsMinutes: 5,
    ingredients: [
      { nom: 'Epinards frais', quantite: 40, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Banane', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Ananas', quantite: 80, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Boisson vegetale (amande)', quantite: 200, unite: 'ml', rayon: 'Epicerie' },
    ],
    etapes: [
      'Rincer les epinards. Eplucher la banane.',
      'Mettre tous les ingredients dans le blender.',
      'Mixer 1 minute jusqu\'a une texture parfaitement lisse. Servir frais.',
    ],
  },
  {
    id: 'pd-porridge-choco-banane',
    nom: 'Porridge proteine chocolat banane',
    type: 'petit-dejeuner',
    cuisines: ['americaine'],
    regime: ['vegetarien', 'sans-porc'],
    budget: 'eco',
    allergenes: ['gluten', 'lactose'],
    motsCles: ['avoine', 'cacao', 'banane', 'lait', 'porridge'],
    kcal: 410, proteines: 20, glucides: 62, lipides: 10, tempsMinutes: 8,
    ingredients: [
      { nom: 'Flocons d\'avoine', quantite: 60, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Lait demi-ecreme', quantite: 220, unite: 'ml', rayon: 'Cremerie' },
      { nom: 'Cacao non sucre', quantite: 1, unite: 'c. a soupe', rayon: 'Epicerie' },
      { nom: 'Banane', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'Chauffer le lait avec le cacao, ajouter les flocons.',
      'Cuire 4 a 5 minutes a feu doux en remuant jusqu\'a une texture cremeuse.',
      'Verser dans un bol, garnir de rondelles de banane.',
    ],
  },
  {
    id: 'pd-cottage-fruits',
    nom: 'Cottage cheese et fruits',
    type: 'petit-dejeuner',
    cuisines: ['americaine'],
    regime: ['vegetarien', 'sans-porc', 'sans-gluten'],
    budget: 'normal',
    allergenes: ['lactose'],
    motsCles: ['cottage', 'fromage', 'fruits', 'miel'],
    kcal: 290, proteines: 24, glucides: 28, lipides: 7, tempsMinutes: 4,
    ingredients: [
      { nom: 'Cottage cheese', quantite: 180, unite: 'g', rayon: 'Cremerie' },
      { nom: 'Fruits de saison', quantite: 100, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Miel', quantite: 1, unite: 'c. a cafe', rayon: 'Epicerie' },
    ],
    etapes: [
      'Verser le cottage cheese dans un bol.',
      'Couper les fruits en des et les ajouter.',
      'Napper d\'un filet de miel.',
    ],
  },
  {
    id: 'pd-galette-sarrasin-oeuf',
    nom: 'Galette de sarrasin a l\'oeuf',
    type: 'petit-dejeuner',
    cuisines: ['francaise'],
    regime: ['vegetarien', 'sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: ['oeuf'],
    motsCles: ['sarrasin', 'galette', 'oeuf', 'fromage'],
    kcal: 350, proteines: 18, glucides: 40, lipides: 14, tempsMinutes: 12,
    ingredients: [
      { nom: 'Farine de sarrasin', quantite: 40, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Oeuf', quantite: 1, unite: 'piece', rayon: 'Cremerie' },
      { nom: 'Fromage rape', quantite: 20, unite: 'g', rayon: 'Cremerie' },
    ],
    etapes: [
      'Melanger la farine de sarrasin avec 90 ml d\'eau et une pincee de sel pour une pate fluide.',
      'Verser une louche dans une poele chaude, etaler en galette fine.',
      'Casser l\'oeuf au centre, parsemer de fromage, replier les bords. Cuire 3 a 4 minutes.',
    ],
  },
  {
    id: 'pd-bircher',
    nom: 'Bircher muesli pomme',
    type: 'petit-dejeuner',
    cuisines: ['francaise'],
    regime: ['vegetarien', 'sans-porc'],
    budget: 'eco',
    allergenes: ['gluten', 'lactose', 'fruits-a-coque'],
    motsCles: ['avoine', 'pomme', 'yaourt', 'noix', 'muesli'],
    kcal: 380, proteines: 14, glucides: 56, lipides: 12, tempsMinutes: 6,
    ingredients: [
      { nom: 'Flocons d\'avoine', quantite: 50, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Yaourt nature', quantite: 100, unite: 'g', rayon: 'Cremerie' },
      { nom: 'Pomme', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Noix', quantite: 15, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Raper la pomme. Melanger flocons, yaourt, pomme rapee et un peu d\'eau.',
      'Reserver 10 minutes (ou une nuit) pour que les flocons s\'attendrissent.',
      'Parsemer de noix concassees avant de servir.',
    ],
  },
  {
    id: 'pd-tartine-amande-fruits',
    nom: 'Tartine puree d\'amande et fruits',
    type: 'petit-dejeuner',
    cuisines: ['francaise'],
    regime: ['vegetarien', 'vegan', 'sans-porc'],
    budget: 'normal',
    allergenes: ['gluten', 'fruits-a-coque'],
    motsCles: ['pain', 'amande', 'fruits', 'tartine'],
    kcal: 380, proteines: 12, glucides: 50, lipides: 15, tempsMinutes: 5,
    ingredients: [
      { nom: 'Pain complet', quantite: 70, unite: 'g', rayon: 'Boulangerie' },
      { nom: 'Puree d\'amande', quantite: 20, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Fruits de saison', quantite: 80, unite: 'g', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'Griller le pain complet.',
      'Tartiner de puree d\'amande.',
      'Garnir de fruits coupes (pomme, poire ou fruits rouges).',
    ],
  },
  {
    id: 'pd-frittata-legumes',
    nom: 'Mini frittata legumes',
    type: 'petit-dejeuner',
    cuisines: ['italienne'],
    regime: ['vegetarien', 'sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: ['oeuf', 'lactose'],
    motsCles: ['oeuf', 'courgette', 'poivron', 'fromage', 'frittata'],
    kcal: 340, proteines: 22, glucides: 12, lipides: 22, tempsMinutes: 18,
    ingredients: [
      { nom: 'Oeufs', quantite: 3, unite: 'piece', rayon: 'Cremerie' },
      { nom: 'Courgette', quantite: 0.5, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Poivron', quantite: 0.5, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Fromage rape', quantite: 20, unite: 'g', rayon: 'Cremerie' },
    ],
    etapes: [
      'Prechauffer le four a 180 C. Couper les legumes en petits des et les revenir 5 minutes.',
      'Battre les oeufs avec le fromage, sel et poivre, verser sur les legumes.',
      'Cuire 2 minutes a la poele puis 8 minutes au four jusqu\'a ce que la frittata soit prise.',
    ],
  },
  {
    id: 'pd-smoothie-mangue',
    nom: 'Smoothie proteine mangue',
    type: 'petit-dejeuner',
    cuisines: ['americaine'],
    regime: ['vegetarien', 'sans-porc', 'sans-gluten'],
    budget: 'normal',
    allergenes: ['lactose'],
    motsCles: ['mangue', 'fromage blanc', 'banane', 'smoothie'],
    kcal: 320, proteines: 20, glucides: 50, lipides: 4, tempsMinutes: 5,
    ingredients: [
      { nom: 'Mangue', quantite: 120, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Fromage blanc', quantite: 150, unite: 'g', rayon: 'Cremerie' },
      { nom: 'Banane', quantite: 0.5, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Lait demi-ecreme', quantite: 80, unite: 'ml', rayon: 'Cremerie' },
    ],
    etapes: [
      'Eplucher et couper la mangue et la banane.',
      'Mettre tous les ingredients dans le blender.',
      'Mixer 40 secondes jusqu\'a une texture onctueuse. Servir frais.',
    ],
  },
  {
    id: 'pd-ricotta-miel-toast',
    nom: 'Toast ricotta, miel et noix',
    type: 'petit-dejeuner',
    cuisines: ['italienne', 'mediterraneenne'],
    regime: ['vegetarien', 'sans-porc'],
    budget: 'normal',
    allergenes: ['gluten', 'lactose', 'fruits-a-coque'],
    motsCles: ['pain', 'ricotta', 'miel', 'noix', 'toast'],
    kcal: 380, proteines: 16, glucides: 44, lipides: 16, tempsMinutes: 5,
    ingredients: [
      { nom: 'Pain complet', quantite: 70, unite: 'g', rayon: 'Boulangerie' },
      { nom: 'Ricotta', quantite: 60, unite: 'g', rayon: 'Cremerie' },
      { nom: 'Miel', quantite: 1, unite: 'c. a cafe', rayon: 'Epicerie' },
      { nom: 'Noix', quantite: 12, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Griller le pain complet.',
      'Etaler la ricotta dessus.',
      'Napper de miel et parsemer de noix concassees.',
    ],
  },

  // ---------- PLATS (suite) : volaille ----------
  {
    id: 'plat-poulet-basquaise',
    nom: 'Poulet basquaise',
    type: 'plat',
    cuisines: ['francaise', 'mediterraneenne'],
    regime: ['sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: [],
    motsCles: ['poulet', 'poivron', 'tomate', 'oignon', 'riz'],
    kcal: 480, proteines: 38, glucides: 46, lipides: 14, tempsMinutes: 30,
    ingredients: [
      { nom: 'Filet de poulet', quantite: 140, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Poivron', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Sauce tomate', quantite: 120, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Oignon', quantite: 0.5, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Riz', quantite: 50, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Cuire le riz. Emincer oignon et poivron.',
      'Dorer le poulet 4 minutes, reserver. Faire suer oignon et poivron 6 minutes.',
      'Ajouter la sauce tomate et le poulet, mijoter 12 minutes a feu doux ; assaisonner (piment d\'Espelette).',
      'Servir avec le riz.',
    ],
  },
  {
    id: 'plat-poulet-champignons-creme',
    nom: 'Poulet aux champignons, creme legere',
    type: 'plat',
    cuisines: ['francaise'],
    regime: ['sans-porc', 'sans-gluten'],
    budget: 'normal',
    allergenes: ['lactose'],
    motsCles: ['poulet', 'champignon', 'creme', 'riz'],
    kcal: 490, proteines: 40, glucides: 40, lipides: 16, tempsMinutes: 25,
    ingredients: [
      { nom: 'Filet de poulet', quantite: 140, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Champignons de Paris', quantite: 150, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Creme legere', quantite: 40, unite: 'ml', rayon: 'Cremerie' },
      { nom: 'Riz', quantite: 50, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Cuire le riz. Emincer les champignons.',
      'Dorer le poulet en des 5 minutes, reserver. Poeler les champignons 5 a 6 minutes.',
      'Remettre le poulet, ajouter la creme legere, mijoter 4 minutes ; saler, poivrer.',
      'Servir avec le riz.',
    ],
  },
  {
    id: 'plat-poulet-brochettes',
    nom: 'Brochettes de poulet et legumes',
    type: 'plat',
    cuisines: ['mediterraneenne'],
    regime: ['sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: [],
    motsCles: ['poulet', 'brochette', 'poivron', 'courgette', 'semoule'],
    kcal: 470, proteines: 40, glucides: 44, lipides: 12, tempsMinutes: 30,
    ingredients: [
      { nom: 'Filet de poulet', quantite: 140, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Poivron', quantite: 0.5, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Courgette', quantite: 0.5, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Semoule', quantite: 50, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Couper poulet et legumes en cubes, les enfiler en alternance sur des pics.',
      'Assaisonner d\'huile, herbes, sel ; cuire 12 a 15 minutes au four (210 C) ou a la poele en les tournant.',
      'Hydrater la semoule a l\'eau bouillante salee, l\'aerer a la fourchette.',
      'Servir les brochettes sur la semoule.',
    ],
  },
  {
    id: 'plat-poulet-souvlaki',
    nom: 'Poulet grec, sauce yaourt',
    type: 'plat',
    cuisines: ['mediterraneenne'],
    regime: ['sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: ['lactose'],
    motsCles: ['poulet', 'yaourt', 'concombre', 'tzatziki', 'riz'],
    kcal: 470, proteines: 40, glucides: 42, lipides: 14, tempsMinutes: 25,
    ingredients: [
      { nom: 'Filet de poulet', quantite: 140, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Yaourt grec', quantite: 60, unite: 'g', rayon: 'Cremerie' },
      { nom: 'Concombre', quantite: 0.3, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Riz', quantite: 50, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Cuire le riz. Mariner le poulet en des dans un peu de yaourt, origan, citron et ail.',
      'Saisir le poulet 8 a 10 minutes a feu moyen-vif.',
      'Preparer la sauce : melanger le reste de yaourt avec le concombre rape, sel et menthe.',
      'Servir le poulet sur le riz, nappe de sauce.',
    ],
  },
  {
    id: 'plat-poulet-pane-four',
    nom: 'Poulet pane au four et salade',
    type: 'plat',
    cuisines: ['americaine', 'francaise'],
    regime: ['sans-porc'],
    budget: 'eco',
    allergenes: ['gluten', 'oeuf'],
    motsCles: ['poulet', 'chapelure', 'pane', 'salade'],
    kcal: 480, proteines: 40, glucides: 38, lipides: 16, tempsMinutes: 30,
    ingredients: [
      { nom: 'Filet de poulet', quantite: 140, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Chapelure', quantite: 30, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Oeuf', quantite: 1, unite: 'piece', rayon: 'Cremerie' },
      { nom: 'Salade verte', quantite: 60, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Pomme de terre', quantite: 120, unite: 'g', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'Prechauffer le four a 200 C. Passer le poulet dans l\'oeuf battu puis la chapelure.',
      'Le poser sur une plaque avec les pommes de terre en quartiers ; cuire 22 a 25 minutes.',
      'Assaisonner la salade et servir avec le poulet pane croustillant.',
    ],
  },
  {
    id: 'plat-cesar-poulet',
    nom: 'Salade Cesar au poulet (legere)',
    type: 'plat',
    cuisines: ['americaine'],
    regime: ['sans-porc'],
    budget: 'normal',
    allergenes: ['gluten', 'lactose', 'oeuf', 'poisson'],
    motsCles: ['poulet', 'salade', 'parmesan', 'croutons', 'cesar'],
    kcal: 460, proteines: 38, glucides: 30, lipides: 20, tempsMinutes: 15,
    ingredients: [
      { nom: 'Filet de poulet', quantite: 130, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Salade romaine', quantite: 80, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Parmesan', quantite: 15, unite: 'g', rayon: 'Cremerie' },
      { nom: 'Croutons', quantite: 25, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Sauce cesar allegee', quantite: 20, unite: 'g', rayon: 'Rayon frais' },
    ],
    etapes: [
      'Poeler le poulet en lanieres 6 minutes ; saler, poivrer.',
      'Couper la romaine, la melanger a la sauce cesar.',
      'Ajouter le poulet, les croutons et des copeaux de parmesan.',
    ],
  },
  {
    id: 'plat-curry-vert-poulet',
    nom: 'Curry vert thai au poulet',
    type: 'plat',
    cuisines: ['asiatique', 'thailandaise'],
    regime: ['sans-porc', 'sans-gluten'],
    budget: 'normal',
    allergenes: ['poisson'],
    motsCles: ['poulet', 'curry vert', 'coco', 'courgette', 'riz'],
    kcal: 500, proteines: 36, glucides: 46, lipides: 18, tempsMinutes: 25,
    ingredients: [
      { nom: 'Filet de poulet', quantite: 130, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Pate de curry vert', quantite: 1, unite: 'c. a soupe', rayon: 'Epicerie' },
      { nom: 'Lait de coco', quantite: 80, unite: 'ml', rayon: 'Epicerie' },
      { nom: 'Courgette', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Riz', quantite: 50, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Cuire le riz. Couper poulet et courgette.',
      'Faire revenir la pate de curry vert 30 secondes, ajouter le poulet et saisir 4 minutes.',
      'Verser le lait de coco, ajouter la courgette, mijoter 10 minutes.',
      'Parfumer d\'un trait de nuoc-mam et servir sur le riz.',
    ],
  },
  {
    id: 'plat-riz-cantonais',
    nom: 'Riz cantonais au poulet',
    type: 'plat',
    cuisines: ['asiatique'],
    regime: ['sans-porc'],
    budget: 'eco',
    allergenes: ['oeuf', 'soja', 'gluten'],
    motsCles: ['riz', 'poulet', 'oeuf', 'petits pois', 'soja'],
    kcal: 500, proteines: 32, glucides: 60, lipides: 12, tempsMinutes: 20,
    ingredients: [
      { nom: 'Riz', quantite: 70, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Filet de poulet', quantite: 100, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Oeuf', quantite: 1, unite: 'piece', rayon: 'Cremerie' },
      { nom: 'Petits pois', quantite: 60, unite: 'g', rayon: 'Surgeles' },
      { nom: 'Sauce soja', quantite: 1, unite: 'c. a soupe', rayon: 'Epicerie' },
    ],
    etapes: [
      'Cuire le riz a l\'avance et le laisser refroidir (ideal : riz de la veille).',
      'Saisir le poulet en des, reserver. Brouiller l\'oeuf dans le wok.',
      'Ajouter riz, petits pois et poulet, sauter 3 minutes a feu vif.',
      'Deglacer a la sauce soja et servir.',
    ],
  },
  {
    id: 'plat-dinde-creme-champignons',
    nom: 'Emince de dinde, creme et champignons',
    type: 'plat',
    cuisines: ['francaise'],
    regime: ['sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: ['lactose'],
    motsCles: ['dinde', 'champignon', 'creme', 'tagliatelles', 'riz'],
    kcal: 480, proteines: 40, glucides: 42, lipides: 14, tempsMinutes: 25,
    ingredients: [
      { nom: 'Emince de dinde', quantite: 140, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Champignons de Paris', quantite: 120, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Creme legere', quantite: 40, unite: 'ml', rayon: 'Cremerie' },
      { nom: 'Riz', quantite: 50, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Cuire le riz. Emincer les champignons.',
      'Saisir l\'emince de dinde 5 minutes, reserver. Poeler les champignons 5 minutes.',
      'Remettre la dinde, ajouter la creme, mijoter 4 minutes ; assaisonner.',
      'Servir avec le riz.',
    ],
  },
  {
    id: 'plat-boulettes-dinde',
    nom: 'Boulettes de dinde, sauce tomate',
    type: 'plat',
    cuisines: ['italienne'],
    regime: ['sans-porc'],
    budget: 'eco',
    allergenes: ['gluten'],
    motsCles: ['dinde', 'boulette', 'tomate', 'pates'],
    kcal: 460, proteines: 38, glucides: 48, lipides: 12, tempsMinutes: 30,
    ingredients: [
      { nom: 'Dinde hachee', quantite: 130, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Sauce tomate', quantite: 120, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Pates', quantite: 70, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Faconner des boulettes avec la dinde hachee assaisonnee (herbes, sel, poivre).',
      'Les dorer 5 minutes, ajouter la sauce tomate, mijoter 12 minutes.',
      'Cuire les pates al dente et les servir nappees des boulettes et de la sauce.',
    ],
  },

  // ---------- PLATS (suite) : boeuf ----------
  {
    id: 'plat-boeuf-bourguignon-leger',
    nom: 'Boeuf bourguignon leger',
    type: 'plat',
    cuisines: ['francaise'],
    regime: ['sans-porc', 'sans-gluten'],
    budget: 'normal',
    allergenes: [],
    motsCles: ['boeuf', 'carotte', 'champignon', 'mijote', 'pomme de terre'],
    kcal: 500, proteines: 40, glucides: 40, lipides: 18, tempsMinutes: 40,
    ingredients: [
      { nom: 'Boeuf a mijoter', quantite: 130, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Carotte', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Champignons de Paris', quantite: 100, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Bouillon de boeuf', quantite: 200, unite: 'ml', rayon: 'Epicerie' },
      { nom: 'Pomme de terre', quantite: 150, unite: 'g', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'Saisir le boeuf en morceaux sur toutes les faces, reserver.',
      'Faire revenir carotte et champignons, remettre le boeuf, mouiller au bouillon.',
      'Mijoter a couvert 30 a 35 minutes jusqu\'a ce que la viande soit fondante.',
      'Servir avec les pommes de terre vapeur.',
    ],
  },
  {
    id: 'plat-tacos-boeuf',
    nom: 'Tacos de boeuf',
    type: 'plat',
    cuisines: ['mexicaine'],
    regime: ['sans-porc'],
    budget: 'eco',
    allergenes: ['gluten', 'lactose'],
    motsCles: ['boeuf', 'tortilla', 'salade', 'tomate', 'fromage'],
    kcal: 540, proteines: 36, glucides: 50, lipides: 20, tempsMinutes: 20,
    ingredients: [
      { nom: 'Boeuf hache 5%', quantite: 120, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Petites tortillas', quantite: 2, unite: 'piece', rayon: 'Epicerie' },
      { nom: 'Salade verte', quantite: 40, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Tomate', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Fromage rape', quantite: 20, unite: 'g', rayon: 'Cremerie' },
    ],
    etapes: [
      'Saisir le boeuf hache 5 minutes avec des epices (cumin, paprika).',
      'Tiedir les tortillas.',
      'Garnir de boeuf, salade, des de tomate et fromage. Replier et servir.',
    ],
  },
  {
    id: 'plat-boeuf-carottes',
    nom: 'Boeuf carottes',
    type: 'plat',
    cuisines: ['francaise'],
    regime: ['sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: [],
    motsCles: ['boeuf', 'carotte', 'oignon', 'mijote', 'riz'],
    kcal: 470, proteines: 38, glucides: 44, lipides: 14, tempsMinutes: 40,
    ingredients: [
      { nom: 'Boeuf a mijoter', quantite: 130, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Carotte', quantite: 2, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Oignon', quantite: 0.5, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Bouillon de boeuf', quantite: 200, unite: 'ml', rayon: 'Epicerie' },
      { nom: 'Riz', quantite: 40, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Saisir le boeuf, ajouter oignon et carottes en rondelles.',
      'Mouiller au bouillon, mijoter 30 a 35 minutes a couvert.',
      'Cuire le riz et servir avec le boeuf carottes fondant.',
    ],
  },
  {
    id: 'plat-salade-thai-boeuf',
    nom: 'Salade thai de boeuf',
    type: 'plat',
    cuisines: ['asiatique', 'thailandaise'],
    regime: ['sans-porc'],
    budget: 'normal',
    allergenes: ['poisson', 'soja', 'arachide'],
    motsCles: ['boeuf', 'salade', 'concombre', 'menthe', 'cacahuete'],
    kcal: 420, proteines: 34, glucides: 26, lipides: 18, tempsMinutes: 18,
    ingredients: [
      { nom: 'Boeuf a griller', quantite: 130, unite: 'g', rayon: 'Boucherie' },
      { nom: 'Salade verte', quantite: 60, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Concombre', quantite: 0.3, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Sauce nuoc-mam', quantite: 1, unite: 'c. a soupe', rayon: 'Epicerie' },
      { nom: 'Cacahuetes', quantite: 15, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Saisir le boeuf 2 minutes par face (saignant), laisser reposer puis emincer.',
      'Preparer la sauce : nuoc-mam, jus de citron vert, un peu de sucre et de piment.',
      'Dresser salade, concombre, boeuf, arroser de sauce et parsemer de cacahuetes et menthe.',
    ],
  },

  // ---------- PLATS (suite) : poisson & fruits de mer ----------
  {
    id: 'plat-crevettes-ail',
    nom: 'Crevettes a l\'ail et riz',
    type: 'plat',
    cuisines: ['mediterraneenne'],
    regime: ['sans-porc'],
    budget: 'normal',
    allergenes: ['crustaces'],
    motsCles: ['crevette', 'ail', 'persil', 'riz', 'citron'],
    kcal: 440, proteines: 34, glucides: 52, lipides: 10, tempsMinutes: 20,
    ingredients: [
      { nom: 'Crevettes decortiquees', quantite: 130, unite: 'g', rayon: 'Poissonnerie' },
      { nom: 'Ail', quantite: 1, unite: 'gousse', rayon: 'Fruits & legumes' },
      { nom: 'Persil', quantite: 1, unite: 'c. a soupe', rayon: 'Fruits & legumes' },
      { nom: 'Riz', quantite: 60, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Citron', quantite: 0.5, unite: 'piece', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'Cuire le riz. Hacher l\'ail et le persil.',
      'Saisir les crevettes 2 a 3 minutes a feu vif avec l\'ail dans un filet d\'huile.',
      'Ajouter le persil et un trait de citron hors du feu.',
      'Servir aussitot avec le riz.',
    ],
  },
  {
    id: 'plat-colin-sauce-vierge',
    nom: 'Colin, sauce vierge',
    type: 'plat',
    cuisines: ['mediterraneenne', 'francaise'],
    regime: ['sans-porc', 'sans-gluten'],
    budget: 'normal',
    allergenes: ['poisson'],
    motsCles: ['colin', 'tomate', 'olive', 'pomme de terre'],
    kcal: 430, proteines: 36, glucides: 40, lipides: 12, tempsMinutes: 25,
    ingredients: [
      { nom: 'Dos de colin', quantite: 140, unite: 'g', rayon: 'Poissonnerie' },
      { nom: 'Tomate', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Olives', quantite: 15, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Pomme de terre', quantite: 150, unite: 'g', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'Cuire les pommes de terre vapeur. Preparer la sauce vierge : tomate en des, olives, huile d\'olive, citron, herbes.',
      'Cuire le colin 4 minutes par face a la poele (ou 10 min au four a 190 C).',
      'Napper le poisson de sauce vierge tiede et servir avec les pommes de terre.',
    ],
  },
  {
    id: 'plat-truite-citron',
    nom: 'Truite citron et legumes',
    type: 'plat',
    cuisines: ['francaise'],
    regime: ['sans-porc', 'sans-gluten'],
    budget: 'normal',
    allergenes: ['poisson'],
    motsCles: ['truite', 'citron', 'courgette', 'riz'],
    kcal: 470, proteines: 36, glucides: 42, lipides: 16, tempsMinutes: 25,
    ingredients: [
      { nom: 'Filet de truite', quantite: 130, unite: 'g', rayon: 'Poissonnerie' },
      { nom: 'Citron', quantite: 0.5, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Courgette', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Riz', quantite: 50, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Cuire le riz. Poeler la courgette en rondelles 5 a 6 minutes.',
      'Cuire la truite cote peau 3 a 4 minutes, retourner 2 minutes.',
      'Arroser de jus de citron, saler et servir avec riz et courgettes.',
    ],
  },
  {
    id: 'plat-gambas-coco',
    nom: 'Gambas au curry coco',
    type: 'plat',
    cuisines: ['asiatique', 'indienne'],
    regime: ['sans-porc', 'sans-gluten'],
    budget: 'normal',
    allergenes: ['crustaces'],
    motsCles: ['gambas', 'curry', 'coco', 'riz'],
    kcal: 480, proteines: 32, glucides: 46, lipides: 16, tempsMinutes: 20,
    ingredients: [
      { nom: 'Gambas decortiquees', quantite: 130, unite: 'g', rayon: 'Poissonnerie' },
      { nom: 'Lait de coco', quantite: 80, unite: 'ml', rayon: 'Epicerie' },
      { nom: 'Curry en poudre', quantite: 1, unite: 'c. a cafe', rayon: 'Epicerie' },
      { nom: 'Riz basmati', quantite: 55, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Cuire le riz. Faire revenir le curry 30 secondes dans un filet d\'huile.',
      'Ajouter le lait de coco, porter a fremissement.',
      'Pocher les gambas 3 a 4 minutes dans la sauce jusqu\'a ce qu\'elles soient roses.',
      'Servir sur le riz.',
    ],
  },
  {
    id: 'plat-sardines-salade',
    nom: 'Sardines grillees et salade',
    type: 'plat',
    cuisines: ['mediterraneenne'],
    regime: ['sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: ['poisson'],
    motsCles: ['sardine', 'salade', 'tomate', 'pomme de terre'],
    kcal: 450, proteines: 34, glucides: 36, lipides: 18, tempsMinutes: 20,
    ingredients: [
      { nom: 'Sardines fraiches', quantite: 150, unite: 'g', rayon: 'Poissonnerie' },
      { nom: 'Salade verte', quantite: 60, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Tomate', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Pomme de terre', quantite: 120, unite: 'g', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'Cuire les pommes de terre. Griller les sardines 3 minutes par face.',
      'Assaisonner salade et tomate d\'huile d\'olive et citron.',
      'Servir les sardines avec la salade et les pommes de terre tiedes.',
    ],
  },

  // ---------- PLATS (suite) : vegetarien ----------
  {
    id: 'plat-curry-legumes',
    nom: 'Curry de legumes au lait de coco',
    type: 'plat',
    cuisines: ['indienne', 'vegetale'],
    regime: ['vegetarien', 'vegan', 'sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: [],
    motsCles: ['legumes', 'curry', 'coco', 'pois chiche', 'riz'],
    kcal: 470, proteines: 14, glucides: 72, lipides: 14, tempsMinutes: 25,
    ingredients: [
      { nom: 'Legumes varies (chou-fleur, carotte)', quantite: 200, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Pois chiches cuits', quantite: 80, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Lait de coco', quantite: 80, unite: 'ml', rayon: 'Epicerie' },
      { nom: 'Curry en poudre', quantite: 1, unite: 'c. a soupe', rayon: 'Epicerie' },
      { nom: 'Riz basmati', quantite: 55, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Cuire le riz. Faire revenir le curry 30 secondes.',
      'Ajouter les legumes en morceaux et les pois chiches, melanger.',
      'Verser le lait de coco et 100 ml d\'eau, mijoter 15 minutes jusqu\'a ce que les legumes soient tendres.',
      'Servir avec le riz basmati.',
    ],
  },
  {
    id: 'plat-lasagnes-legumes',
    nom: 'Lasagnes de courgettes vegetariennes',
    type: 'plat',
    cuisines: ['italienne'],
    regime: ['vegetarien', 'sans-porc'],
    budget: 'normal',
    allergenes: ['gluten', 'lactose'],
    motsCles: ['courgette', 'lasagne', 'tomate', 'ricotta', 'fromage'],
    kcal: 470, proteines: 22, glucides: 50, lipides: 18, tempsMinutes: 40,
    ingredients: [
      { nom: 'Plaques de lasagne', quantite: 80, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Courgette', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Sauce tomate', quantite: 150, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Ricotta', quantite: 80, unite: 'g', rayon: 'Cremerie' },
      { nom: 'Fromage rape', quantite: 25, unite: 'g', rayon: 'Cremerie' },
    ],
    etapes: [
      'Prechauffer le four a 190 C. Poeler la courgette en des 5 minutes, melanger a la sauce tomate.',
      'Alterner plaques, melange tomate-courgette et ricotta dans un plat.',
      'Terminer par le fromage rape et enfourner 25 a 30 minutes jusqu\'a gratiner.',
      'Laisser reposer 5 minutes avant de servir.',
    ],
  },
  {
    id: 'plat-risotto-petits-pois',
    nom: 'Risotto aux petits pois',
    type: 'plat',
    cuisines: ['italienne'],
    regime: ['vegetarien', 'sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: ['lactose'],
    motsCles: ['riz', 'petits pois', 'parmesan', 'risotto'],
    kcal: 500, proteines: 16, glucides: 78, lipides: 14, tempsMinutes: 30,
    ingredients: [
      { nom: 'Riz a risotto', quantite: 80, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Petits pois', quantite: 100, unite: 'g', rayon: 'Surgeles' },
      { nom: 'Parmesan', quantite: 20, unite: 'g', rayon: 'Cremerie' },
      { nom: 'Bouillon de legumes', quantite: 300, unite: 'ml', rayon: 'Epicerie' },
    ],
    etapes: [
      'Garder le bouillon chaud. Nacrer le riz 1 a 2 minutes dans un filet d\'huile.',
      'Ajouter le bouillon louche par louche en remuant (18 minutes environ).',
      'Incorporer les petits pois 5 minutes avant la fin.',
      'Hors du feu, ajouter le parmesan, rectifier le sel et servir cremeux.',
    ],
  },
  {
    id: 'plat-galettes-pois-chiches',
    nom: 'Galettes de pois chiches et salade',
    type: 'plat',
    cuisines: ['mediterraneenne', 'vegetale'],
    regime: ['vegetarien', 'vegan', 'sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: [],
    motsCles: ['pois chiche', 'galette', 'cumin', 'salade'],
    kcal: 450, proteines: 18, glucides: 60, lipides: 14, tempsMinutes: 25,
    ingredients: [
      { nom: 'Pois chiches cuits', quantite: 180, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Farine de pois chiche', quantite: 20, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Cumin', quantite: 1, unite: 'c. a cafe', rayon: 'Epicerie' },
      { nom: 'Salade verte', quantite: 60, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Tomate', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'Ecraser les pois chiches a la fourchette, ajouter la farine, le cumin, sel et un peu d\'eau.',
      'Faconner des galettes et les dorer 3 a 4 minutes par face a la poele.',
      'Servir avec la salade et la tomate assaisonnees.',
    ],
  },
  {
    id: 'plat-tofu-grille',
    nom: 'Tofu marine grille et legumes',
    type: 'plat',
    cuisines: ['asiatique', 'vegetale'],
    regime: ['vegetarien', 'vegan', 'sans-porc'],
    budget: 'eco',
    allergenes: ['soja', 'gluten', 'sesame'],
    motsCles: ['tofu', 'soja', 'brocoli', 'riz', 'marine'],
    kcal: 460, proteines: 24, glucides: 48, lipides: 16, tempsMinutes: 25,
    ingredients: [
      { nom: 'Tofu ferme', quantite: 150, unite: 'g', rayon: 'Rayon vegetal' },
      { nom: 'Sauce soja', quantite: 2, unite: 'c. a soupe', rayon: 'Epicerie' },
      { nom: 'Brocoli', quantite: 150, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Riz', quantite: 55, unite: 'g', rayon: 'Epicerie' },
    ],
    etapes: [
      'Couper le tofu en tranches, le mariner 15 minutes dans la sauce soja (+ ail, gingembre).',
      'Cuire le riz et la vapeur de brocoli.',
      'Griller le tofu 3 a 4 minutes par face jusqu\'a ce qu\'il soit dore.',
      'Servir avec riz et brocoli, parsemer de sesame.',
    ],
  },
  {
    id: 'plat-minestrone',
    nom: 'Soupe minestrone',
    type: 'plat',
    cuisines: ['italienne', 'vegetale'],
    regime: ['vegetarien', 'vegan', 'sans-porc'],
    budget: 'eco',
    allergenes: ['gluten'],
    motsCles: ['soupe', 'legumes', 'haricot', 'pates', 'tomate'],
    kcal: 400, proteines: 16, glucides: 66, lipides: 7, tempsMinutes: 30,
    ingredients: [
      { nom: 'Legumes varies (carotte, celeri, courgette)', quantite: 200, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Haricots blancs cuits', quantite: 100, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Petites pates', quantite: 40, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Sauce tomate', quantite: 100, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Bouillon de legumes', quantite: 400, unite: 'ml', rayon: 'Epicerie' },
    ],
    etapes: [
      'Couper les legumes en petits des, les faire revenir 5 minutes.',
      'Ajouter sauce tomate, bouillon et haricots, mijoter 15 minutes.',
      'Ajouter les pates et cuire 8 a 10 minutes de plus.',
      'Rectifier l\'assaisonnement, servir bien chaud.',
    ],
  },
  {
    id: 'plat-gratin-courgettes',
    nom: 'Gratin de courgettes',
    type: 'plat',
    cuisines: ['francaise'],
    regime: ['vegetarien', 'sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: ['oeuf', 'lactose'],
    motsCles: ['courgette', 'oeuf', 'fromage', 'gratin'],
    kcal: 420, proteines: 24, glucides: 22, lipides: 26, tempsMinutes: 35,
    ingredients: [
      { nom: 'Courgette', quantite: 2, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Oeufs', quantite: 2, unite: 'piece', rayon: 'Cremerie' },
      { nom: 'Fromage rape', quantite: 40, unite: 'g', rayon: 'Cremerie' },
      { nom: 'Creme legere', quantite: 40, unite: 'ml', rayon: 'Cremerie' },
    ],
    etapes: [
      'Prechauffer le four a 190 C. Poeler les courgettes en rondelles 6 a 8 minutes.',
      'Battre les oeufs avec la creme, la moitie du fromage, sel et poivre.',
      'Disposer les courgettes dans un plat, verser l\'appareil, couvrir du reste de fromage.',
      'Gratiner 20 a 25 minutes jusqu\'a ce que le dessus soit dore.',
    ],
  },
  {
    id: 'plat-tortilla-espagnole',
    nom: 'Tortilla espagnole (omelette pommes de terre)',
    type: 'plat',
    cuisines: ['mediterraneenne'],
    regime: ['vegetarien', 'sans-porc', 'sans-gluten'],
    budget: 'eco',
    allergenes: ['oeuf'],
    motsCles: ['oeuf', 'pomme de terre', 'oignon', 'tortilla'],
    kcal: 440, proteines: 22, glucides: 38, lipides: 22, tempsMinutes: 30,
    ingredients: [
      { nom: 'Oeufs', quantite: 3, unite: 'piece', rayon: 'Cremerie' },
      { nom: 'Pomme de terre', quantite: 180, unite: 'g', rayon: 'Fruits & legumes' },
      { nom: 'Oignon', quantite: 0.5, unite: 'piece', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'Couper pommes de terre et oignon en fines tranches, les cuire doucement 12 a 15 minutes a la poele.',
      'Battre les oeufs, y melanger les pommes de terre tiedies ; saler.',
      'Verser dans la poele, cuire 5 minutes a feu doux, retourner a l\'aide d\'une assiette, cuire 4 minutes.',
      'Laisser tiedir : la tortilla doit etre moelleuse au centre.',
    ],
  },
  {
    id: 'plat-pates-courgette-ricotta',
    nom: 'Pates courgette et ricotta',
    type: 'plat',
    cuisines: ['italienne'],
    regime: ['vegetarien', 'sans-porc'],
    budget: 'eco',
    allergenes: ['gluten', 'lactose'],
    motsCles: ['pates', 'courgette', 'ricotta', 'citron'],
    kcal: 480, proteines: 18, glucides: 68, lipides: 14, tempsMinutes: 18,
    ingredients: [
      { nom: 'Pates', quantite: 80, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Courgette', quantite: 1, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Ricotta', quantite: 60, unite: 'g', rayon: 'Cremerie' },
      { nom: 'Citron', quantite: 0.25, unite: 'piece', rayon: 'Fruits & legumes' },
    ],
    etapes: [
      'Cuire les pates al dente ; reserver un peu d\'eau de cuisson.',
      'Poeler la courgette en des 6 minutes.',
      'Hors du feu, melanger pates, courgette, ricotta, zeste de citron et un peu d\'eau de cuisson.',
      'Poivrer et servir.',
    ],
  },
  {
    id: 'plat-buddha-tofu',
    nom: 'Buddha bowl tofu',
    type: 'plat',
    cuisines: ['vegetale', 'asiatique'],
    regime: ['vegetarien', 'vegan', 'sans-porc'],
    budget: 'normal',
    allergenes: ['soja', 'sesame'],
    motsCles: ['tofu', 'quinoa', 'avocat', 'edamame', 'bowl'],
    kcal: 500, proteines: 26, glucides: 56, lipides: 18, tempsMinutes: 25,
    ingredients: [
      { nom: 'Tofu ferme', quantite: 120, unite: 'g', rayon: 'Rayon vegetal' },
      { nom: 'Quinoa', quantite: 60, unite: 'g', rayon: 'Epicerie' },
      { nom: 'Avocat', quantite: 0.5, unite: 'piece', rayon: 'Fruits & legumes' },
      { nom: 'Edamame', quantite: 60, unite: 'g', rayon: 'Surgeles' },
      { nom: 'Graines de sesame', quantite: 1, unite: 'c. a cafe', rayon: 'Epicerie' },
    ],
    etapes: [
      'Cuire le quinoa et les edamame. Couper le tofu en des et le dorer 6 minutes.',
      'Dresser dans un bol quinoa, tofu, edamame et avocat en lamelles.',
      'Assaisonner (sauce soja-citron), parsemer de sesame.',
    ],
  },

  // ---- Recettes generees par IA (lot du 2026-06-24) ----
  {
    "id": "pd-tartine-beurre-et-confiture-sur-brioche",
    "nom": "Tartine beurre et confiture sur brioche",
    "type": "petit-dejeuner",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "lactose",
      "oeuf"
    ],
    "motsCles": [
      "brioche",
      "beurre",
      "confiture"
    ],
    "kcal": 320,
    "proteines": 6,
    "glucides": 42,
    "lipides": 13,
    "tempsMinutes": 3,
    "ingredients": [
      {
        "nom": "brioche tranchee",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Boulangerie"
      },
      {
        "nom": "beurre doux",
        "quantite": 15,
        "unite": "g",
        "rayon": "Cremerie"
      },
      {
        "nom": "confiture de fraises",
        "quantite": 30,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Sortir 2 tranches de brioche et les disposer sur une assiette ou directement dans un sachet de transport.",
      "A temperature ambiante, etaler 15 g de beurre doux generalement sur chaque tranche a l'aide d'un couteau, en couvrant bien jusqu'aux bords.",
      "Ajouter 30 g de confiture de fraises par-dessus le beurre et l'etaler uniformement.",
      "Refermer les deux tranches l'une contre l'autre pour former un sandwich facile a emporter, ou les glisser dans du papier sulfurise.",
      "Envelopper dans du papier aluminium ou une serviette pour le transport. La brioche doit etre moelleuse et la confiture brillante."
    ]
  },
  {
    "id": "pd-fromage-blanc-et-compote-de-pommes-a-emp",
    "nom": "Fromage blanc et compote de pommes a emporter",
    "type": "petit-dejeuner",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose"
    ],
    "motsCles": [
      "fromage blanc",
      "compote",
      "pomme"
    ],
    "kcal": 210,
    "proteines": 14,
    "glucides": 28,
    "lipides": 3,
    "tempsMinutes": 2,
    "ingredients": [
      {
        "nom": "fromage blanc 0%",
        "quantite": 150,
        "unite": "g",
        "rayon": "Cremerie"
      },
      {
        "nom": "compote de pommes sans sucre ajouté",
        "quantite": 100,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "miel",
        "quantite": 10,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "cannelle moulue",
        "quantite": 1,
        "unite": "c. a cafe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Prendre un pot ou une boite hermetique propre et verser 150 g de fromage blanc directement au fond.",
      "Ajouter par-dessus 100 g de compote de pommes sans sucre ajouté en formant une couche reguliere.",
      "Drizzler 10 g de miel en filet sur la compote pour apporter une touche de douceur naturelle.",
      "Saupoudrer d'une pincee de cannelle moulue pour le parfum. L'ensemble doit presenter des couches bien distinctes et appetissantes.",
      "Fermer hermetiquement le pot et le placer dans le sac. Melanger au moment de la degustation. Se conserve 2 h a temperature ambiante."
    ]
  },
  {
    "id": "pd-wrap-jambon-fromage-express",
    "nom": "Wrap jambon-fromage express",
    "type": "petit-dejeuner",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "motsCles": [
      "wrap",
      "jambon",
      "fromage",
      "tortilla"
    ],
    "kcal": 380,
    "proteines": 22,
    "glucides": 35,
    "lipides": 15,
    "tempsMinutes": 4,
    "ingredients": [
      {
        "nom": "tortilla de ble",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Epicerie"
      },
      {
        "nom": "jambon blanc",
        "quantite": 60,
        "unite": "g",
        "rayon": "Rayon frais"
      },
      {
        "nom": "emmental rape",
        "quantite": 30,
        "unite": "g",
        "rayon": "Cremerie"
      },
      {
        "nom": "fromage frais type Saint-Moret",
        "quantite": 20,
        "unite": "g",
        "rayon": "Cremerie"
      },
      {
        "nom": "cornichons",
        "quantite": 3,
        "unite": "piece",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Poser la tortilla a plat sur le plan de travail ou une assiette. Etaler 20 g de fromage frais au centre en laissant 3 cm de bordure tout autour.",
      "Disposer les tranches de jambon blanc sur le fromage frais en les superposant legerement pour couvrir toute la surface.",
      "Ajouter 30 g d'emmental rape uniformement sur le jambon, puis trancher les cornichons en rondelles et les disposer par-dessus.",
      "Replier les cotes gauche et droit de la tortilla vers le centre, puis rouler fermement depuis le bas vers le haut pour former un wrap serré.",
      "Couper le wrap en deux en diagonale a l'aide d'un couteau. Envelopper dans du papier aluminium pour maintenir la forme durant le transport."
    ]
  },
  {
    "id": "pd-pain-au-chocolat-et-jus-d-orange-presse",
    "nom": "Pain au chocolat et jus d'orange presse",
    "type": "petit-dejeuner",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "motsCles": [
      "pain au chocolat",
      "jus d'orange",
      "viennoiserie"
    ],
    "kcal": 430,
    "proteines": 7,
    "glucides": 58,
    "lipides": 19,
    "tempsMinutes": 2,
    "ingredients": [
      {
        "nom": "pain au chocolat",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Boulangerie"
      },
      {
        "nom": "oranges a jus",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      }
    ],
    "etapes": [
      "Recuperer le pain au chocolat dans sa poche ou son emballage et le deposer dans un sachet de transport propre.",
      "Couper les 2 oranges en deux sur une planche a decouper a l'aide d'un couteau bien tranche.",
      "Presser chaque demi-orange manuellement au-dessus d'un verre ou directement dans une bouteille hermétique pour recueillir le jus.",
      "Filtrer eventuellement les pepins avec les doigts ou une petite passoire. Le jus doit etre d'un beau orange vif et leger en mousse.",
      "Fermer la bouteille hermetiquement et placer pain au chocolat et jus dans le sac. Consommer dans l'heure pour profiter de la fraicheur du jus."
    ]
  },
  {
    "id": "pd-bol-de-cereales-muesli-et-lait",
    "nom": "Bol de cereales muesli et lait",
    "type": "petit-dejeuner",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "lactose",
      "fruits-a-coque"
    ],
    "motsCles": [
      "muesli",
      "lait",
      "cereales",
      "noisettes"
    ],
    "kcal": 370,
    "proteines": 11,
    "glucides": 55,
    "lipides": 11,
    "tempsMinutes": 2,
    "ingredients": [
      {
        "nom": "muesli croustillant aux noisettes",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "lait demi-ecreme",
        "quantite": 150,
        "unite": "ml",
        "rayon": "Cremerie"
      },
      {
        "nom": "raisins secs",
        "quantite": 15,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Verser 60 g de muesli croustillant directement dans un pot ou un contenant hermetique a large ouverture.",
      "Ajouter 15 g de raisins secs par-dessus le muesli pour apporter de la douceur naturelle et du moelleux.",
      "Verser 150 ml de lait demi-ecreme froid sur l'ensemble. Le lait doit juste couvrir les cereales sans les noyer.",
      "Fermer le contenant avec son couvercle si les cereales doivent etre emportees, ou consommer immediatement dans un bol pour un resultat plus croustillant.",
      "Deguster sans tarder pour conserver le croustillant du muesli, ou laisser le lait s'imbiber 2 minutes si vous preferez une texture plus fondante."
    ]
  },
  {
    "id": "pd-creme-de-marrons-et-ricotta-sur-baguette",
    "nom": "Creme de marrons et ricotta sur baguette",
    "type": "petit-dejeuner",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "motsCles": [
      "creme de marrons",
      "ricotta",
      "baguette",
      "chataigne"
    ],
    "kcal": 345,
    "proteines": 10,
    "glucides": 48,
    "lipides": 11,
    "tempsMinutes": 3,
    "ingredients": [
      {
        "nom": "baguette tradition",
        "quantite": 80,
        "unite": "g",
        "rayon": "Boulangerie"
      },
      {
        "nom": "ricotta",
        "quantite": 40,
        "unite": "g",
        "rayon": "Cremerie"
      },
      {
        "nom": "creme de marrons",
        "quantite": 30,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Couper 80 g de baguette tradition (environ un tiers de baguette) en deux dans le sens de la longueur pour obtenir deux demi-baguettes.",
      "A l'aide d'un couteau, etaler 40 g de ricotta en couche genereux sur les deux faces coupees. La ricotta doit couvrir toute la surface de facon homogene.",
      "Deposer 30 g de creme de marrons par-dessus la ricotta a la cuillere, en repartissant bien sur chaque moitie de pain.",
      "Refermer les deux moitiés l'une sur l'autre pour former un sandwich ou les laisser ouvertes selon la preference. La creme de marrons doit contraster joliment avec le blanc de la ricotta.",
      "Envelopper dans du papier cuisson ou du papier aluminium pour le transport. Le sandwich se deguste dans les 2 heures pour que la baguette reste croustillante."
    ]
  },

  // ---- Bowls generes par combinaison (lot du 2026-06-24) ----
  {
    "id": "plat-bowl-poulet-riz-brocoli-huile-d-olive-citron",
    "nom": "Bowl poulet-riz, brocoli & huile d'olive & citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "motsCles": [
      "poulet",
      "riz",
      "brocoli"
    ],
    "kcal": 555,
    "proteines": 46,
    "glucides": 54,
    "lipides": 17,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Filet de poulet",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Brocoli",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Huile d'olive",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le riz dans l'eau bouillante salee selon le paquet, puis l'egoutter.",
      "Couper le filet de poulet en des et le poeler 6 a 7 minutes a feu moyen-vif, jusqu'a ce qu'il soit dore et cuit a coeur.",
      "Cuire le brocoli 7 minutes a la vapeur (il reste croquant).",
      "Dresser dans un bol : riz, poulet et brocoli. Assaisonner d'huile d'olive, de jus de citron, de sel et de poivre."
    ]
  },
  {
    "id": "plat-bowl-dinde-pates-completes-tomates-cerises-s",
    "nom": "Bowl dinde-pates completes, tomates cerises & sauce tomate",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "motsCles": [
      "dinde",
      "pates",
      "tomate"
    ],
    "kcal": 515,
    "proteines": 48,
    "glucides": 70,
    "lipides": 6,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Escalope de dinde",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Pates completes",
        "quantite": 80,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Tomates cerises",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pates completes al dente dans l'eau bouillante salee.",
      "Poeler l'escalope de dinde 4 minutes par face, puis l'emincer.",
      "Couper les tomates cerises en deux.",
      "Dresser dans un bol : pates completes, dinde et tomates cerises. Napper de sauce tomate mijotee avec des herbes."
    ]
  },
  {
    "id": "plat-bowl-boeuf-pommes-de-terre-courgette-sauce-s",
    "nom": "Bowl boeuf-pommes de terre, courgette & sauce soja & sesame",
    "type": "plat",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "soja",
      "gluten",
      "sesame"
    ],
    "motsCles": [
      "boeuf",
      "pomme de terre",
      "courgette"
    ],
    "kcal": 410,
    "proteines": 38,
    "glucides": 46,
    "lipides": 8,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Boeuf hache 5%",
        "quantite": 120,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Pomme de terre",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Courgette",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce soja",
        "quantite": 2,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre 18 minutes a l'eau salee.",
      "Saisir le boeuf hache 5 minutes a feu vif en l'emiettant ; assaisonner.",
      "Poeler la courgette en rondelles 5 a 6 minutes.",
      "Dresser dans un bol : pommes de terre, boeuf et courgette. Napper de sauce soja et parsemer de graines de sesame."
    ]
  },
  {
    "id": "plat-bowl-saumon-semoule-champignons-yaourt-citro",
    "nom": "Bowl saumon-semoule, champignons & yaourt citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson",
      "lactose",
      "gluten"
    ],
    "motsCles": [
      "saumon",
      "semoule",
      "champignon"
    ],
    "kcal": 525,
    "proteines": 45,
    "glucides": 50,
    "lipides": 16,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Pave de saumon",
        "quantite": 130,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Semoule",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Champignons de Paris",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Yaourt nature",
        "quantite": 40,
        "unite": "g",
        "rayon": "Cremerie"
      }
    ],
    "etapes": [
      "Couvrir la semoule d'eau bouillante salee a hauteur, laisser gonfler 5 minutes et l'aerer.",
      "Poeler le saumon 4 minutes cote peau puis 2 a 3 minutes de l'autre cote.",
      "Poeler les champignons eminces 5 minutes a feu vif.",
      "Dresser dans un bol : semoule, saumon et champignons. Servir avec une sauce yaourt-citron (yaourt, citron, sel)."
    ]
  },
  {
    "id": "plat-bowl-cabillaud-boulgour-poivrons-curry-coco",
    "nom": "Bowl cabillaud-boulgour, poivrons & curry coco",
    "type": "plat",
    "cuisines": [
      "indienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson",
      "gluten"
    ],
    "motsCles": [
      "cabillaud",
      "boulgour",
      "poivron"
    ],
    "kcal": 465,
    "proteines": 37,
    "glucides": 54,
    "lipides": 12,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Dos de cabillaud",
        "quantite": 140,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Boulgour",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Poivron",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Lait de coco",
        "quantite": 60,
        "unite": "ml",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le boulgour 12 minutes dans l'eau salee, puis l'egoutter.",
      "Cuire le cabillaud 4 minutes par face a feu moyen (la chair s'effeuille).",
      "Faire revenir le poivron emince 4 a 5 minutes.",
      "Dresser dans un bol : boulgour, cabillaud et poivrons. Mijoter 5 minutes avec le lait de coco et une cuillere de curry."
    ]
  },
  {
    "id": "plat-bowl-thon-quinoa-carottes-tahin-citron",
    "nom": "Bowl thon-quinoa, carottes & tahin citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "poisson",
      "sesame"
    ],
    "motsCles": [
      "thon",
      "quinoa",
      "carotte"
    ],
    "kcal": 460,
    "proteines": 38,
    "glucides": 51,
    "lipides": 13,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Thon au naturel",
        "quantite": 100,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Quinoa",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Carotte",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Tahin (puree de sesame)",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le quinoa 12 a 14 minutes dans 2 volumes d'eau salee.",
      "Egoutter le thon et l'emietter.",
      "Rapper ou cuire la carotte en rondelles.",
      "Dresser dans un bol : quinoa, thon et carottes. Napper de sauce tahin-citron (tahin, citron, un peu d'eau)."
    ]
  },
  {
    "id": "plat-bowl-crevettes-patate-douce-epinards-pesto",
    "nom": "Bowl crevettes-patate douce, epinards & pesto",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "crustaces",
      "lactose",
      "fruits-a-coque"
    ],
    "motsCles": [
      "crevette",
      "patate douce",
      "epinard"
    ],
    "kcal": 435,
    "proteines": 30,
    "glucides": 46,
    "lipides": 14,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Crevettes decortiquees",
        "quantite": 120,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Patate douce",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Epinards frais",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Pesto",
        "quantite": 25,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Couper la patate douce en des et la rotir 20 a 25 minutes au four a 200 C.",
      "Saisir les crevettes 2 a 3 minutes a feu vif jusqu'a ce qu'elles soient roses.",
      "Faire tomber les epinards 2 minutes a la poele.",
      "Dresser dans un bol : patate douce, crevettes et epinards. Melanger avec le pesto hors du feu."
    ]
  },
  {
    "id": "plat-bowl-oeufs-riz-salade-huile-d-olive-citron",
    "nom": "Bowl oeufs-riz, salade & huile d'olive & citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "oeuf"
    ],
    "motsCles": [
      "oeuf",
      "riz",
      "salade"
    ],
    "kcal": 470,
    "proteines": 18,
    "glucides": 50,
    "lipides": 21,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Cremerie"
      },
      {
        "nom": "Riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Salade verte",
        "quantite": 60,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Huile d'olive",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le riz dans l'eau bouillante salee selon le paquet, puis l'egoutter.",
      "Cuire les 2 oeufs (au plat ou durs, 9 minutes).",
      "Laver la salade et la couper.",
      "Dresser dans un bol : riz, oeufs et salade. Assaisonner d'huile d'olive, de jus de citron, de sel et de poivre."
    ]
  },
  {
    "id": "plat-bowl-tofu-pates-completes-haricots-verts-sau",
    "nom": "Bowl tofu-pates completes, haricots verts & sauce tomate",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan"
    ],
    "budget": "eco",
    "allergenes": [
      "soja",
      "gluten"
    ],
    "motsCles": [
      "tofu",
      "pates",
      "haricot"
    ],
    "kcal": 555,
    "proteines": 34,
    "glucides": 77,
    "lipides": 14,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Tofu ferme",
        "quantite": 150,
        "unite": "g",
        "rayon": "Rayon vegetal"
      },
      {
        "nom": "Pates completes",
        "quantite": 80,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Haricots verts",
        "quantite": 150,
        "unite": "g",
        "rayon": "Surgeles"
      },
      {
        "nom": "Sauce tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pates completes al dente dans l'eau bouillante salee.",
      "Eponger le tofu, le couper en des et le dorer 6 minutes en le retournant.",
      "Cuire les haricots verts 8 a 10 minutes.",
      "Dresser dans un bol : pates completes, tofu et haricots verts. Napper de sauce tomate mijotee avec des herbes."
    ]
  },
  {
    "id": "plat-bowl-pois-chiches-pommes-de-terre-brocoli-sa",
    "nom": "Bowl pois chiches-pommes de terre, brocoli & sauce soja & sesame",
    "type": "plat",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan"
    ],
    "budget": "eco",
    "allergenes": [
      "soja",
      "gluten",
      "sesame"
    ],
    "motsCles": [
      "pois chiche",
      "pomme de terre",
      "brocoli"
    ],
    "kcal": 475,
    "proteines": 22,
    "glucides": 82,
    "lipides": 6,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Pois chiches cuits",
        "quantite": 150,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Pomme de terre",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Brocoli",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce soja",
        "quantite": 2,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre 18 minutes a l'eau salee.",
      "Rincer et rechauffer les pois chiches 3 minutes avec une pincee d'epices.",
      "Cuire le brocoli 7 minutes a la vapeur (il reste croquant).",
      "Dresser dans un bol : pommes de terre, pois chiches et brocoli. Napper de sauce soja et parsemer de graines de sesame."
    ]
  },
  {
    "id": "plat-bowl-lentilles-semoule-tomates-cerises-yaour",
    "nom": "Bowl lentilles-semoule, tomates cerises & yaourt citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose",
      "gluten"
    ],
    "motsCles": [
      "lentille",
      "semoule",
      "tomate"
    ],
    "kcal": 445,
    "proteines": 23,
    "glucides": 82,
    "lipides": 3,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Lentilles cuites",
        "quantite": 150,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Semoule",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Tomates cerises",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Yaourt nature",
        "quantite": 40,
        "unite": "g",
        "rayon": "Cremerie"
      }
    ],
    "etapes": [
      "Couvrir la semoule d'eau bouillante salee a hauteur, laisser gonfler 5 minutes et l'aerer.",
      "Rincer et rechauffer les lentilles 3 minutes.",
      "Couper les tomates cerises en deux.",
      "Dresser dans un bol : semoule, lentilles et tomates cerises. Servir avec une sauce yaourt-citron (yaourt, citron, sel)."
    ]
  },
  {
    "id": "plat-bowl-feta-boulgour-courgette-curry-coco",
    "nom": "Bowl feta-boulgour, courgette & curry coco",
    "type": "plat",
    "cuisines": [
      "indienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose",
      "gluten"
    ],
    "motsCles": [
      "feta",
      "boulgour",
      "courgette"
    ],
    "kcal": 485,
    "proteines": 17,
    "glucides": 54,
    "lipides": 22,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Feta",
        "quantite": 50,
        "unite": "g",
        "rayon": "Cremerie"
      },
      {
        "nom": "Boulgour",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Courgette",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Lait de coco",
        "quantite": 60,
        "unite": "ml",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le boulgour 12 minutes dans l'eau salee, puis l'egoutter.",
      "Emietter la feta sur le plat.",
      "Poeler la courgette en rondelles 5 a 6 minutes.",
      "Dresser dans un bol : boulgour, feta et courgette. Mijoter 5 minutes avec le lait de coco et une cuillere de curry."
    ]
  },
  {
    "id": "plat-bowl-poulet-quinoa-champignons-tahin-citron",
    "nom": "Bowl poulet-quinoa, champignons & tahin citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "sesame"
    ],
    "motsCles": [
      "poulet",
      "quinoa",
      "champignon"
    ],
    "kcal": 540,
    "proteines": 52,
    "glucides": 45,
    "lipides": 17,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Filet de poulet",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Quinoa",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Champignons de Paris",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Tahin (puree de sesame)",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le quinoa 12 a 14 minutes dans 2 volumes d'eau salee.",
      "Couper le filet de poulet en des et le poeler 6 a 7 minutes a feu moyen-vif, jusqu'a ce qu'il soit dore et cuit a coeur.",
      "Poeler les champignons eminces 5 minutes a feu vif.",
      "Dresser dans un bol : quinoa, poulet et champignons. Napper de sauce tahin-citron (tahin, citron, un peu d'eau)."
    ]
  },
  {
    "id": "plat-bowl-dinde-patate-douce-poivrons-pesto",
    "nom": "Bowl dinde-patate douce, poivrons & pesto",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose",
      "fruits-a-coque"
    ],
    "motsCles": [
      "dinde",
      "patate douce",
      "poivron"
    ],
    "kcal": 505,
    "proteines": 40,
    "glucides": 51,
    "lipides": 16,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Escalope de dinde",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Patate douce",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Poivron",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Pesto",
        "quantite": 25,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Couper la patate douce en des et la rotir 20 a 25 minutes au four a 200 C.",
      "Poeler l'escalope de dinde 4 minutes par face, puis l'emincer.",
      "Faire revenir le poivron emince 4 a 5 minutes.",
      "Dresser dans un bol : patate douce, dinde et poivrons. Melanger avec le pesto hors du feu."
    ]
  },
  {
    "id": "plat-bowl-boeuf-riz-carottes-huile-d-olive-citron",
    "nom": "Bowl boeuf-riz, carottes & huile d'olive & citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "motsCles": [
      "boeuf",
      "riz",
      "carotte"
    ],
    "kcal": 525,
    "proteines": 35,
    "glucides": 56,
    "lipides": 18,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Boeuf hache 5%",
        "quantite": 120,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Carotte",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Huile d'olive",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le riz dans l'eau bouillante salee selon le paquet, puis l'egoutter.",
      "Saisir le boeuf hache 5 minutes a feu vif en l'emiettant ; assaisonner.",
      "Rapper ou cuire la carotte en rondelles.",
      "Dresser dans un bol : riz, boeuf et carottes. Assaisonner d'huile d'olive, de jus de citron, de sel et de poivre."
    ]
  },
  {
    "id": "plat-bowl-saumon-pates-completes-epinards-sauce-t",
    "nom": "Bowl saumon-pates completes, epinards & sauce tomate",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson",
      "gluten"
    ],
    "motsCles": [
      "saumon",
      "pates",
      "epinard"
    ],
    "kcal": 605,
    "proteines": 48,
    "glucides": 67,
    "lipides": 17,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Pave de saumon",
        "quantite": 130,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Pates completes",
        "quantite": 80,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Epinards frais",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pates completes al dente dans l'eau bouillante salee.",
      "Poeler le saumon 4 minutes cote peau puis 2 a 3 minutes de l'autre cote.",
      "Faire tomber les epinards 2 minutes a la poele.",
      "Dresser dans un bol : pates completes, saumon et epinards. Napper de sauce tomate mijotee avec des herbes."
    ]
  },
  {
    "id": "plat-bowl-thon-semoule-haricots-verts-yaourt-citr",
    "nom": "Bowl thon-semoule, haricots verts & yaourt citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "poisson",
      "lactose",
      "gluten"
    ],
    "motsCles": [
      "thon",
      "semoule",
      "haricot"
    ],
    "kcal": 400,
    "proteines": 39,
    "glucides": 55,
    "lipides": 3,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Thon au naturel",
        "quantite": 100,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Semoule",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Haricots verts",
        "quantite": 150,
        "unite": "g",
        "rayon": "Surgeles"
      },
      {
        "nom": "Yaourt nature",
        "quantite": 40,
        "unite": "g",
        "rayon": "Cremerie"
      }
    ],
    "etapes": [
      "Couvrir la semoule d'eau bouillante salee a hauteur, laisser gonfler 5 minutes et l'aerer.",
      "Egoutter le thon et l'emietter.",
      "Cuire les haricots verts 8 a 10 minutes.",
      "Dresser dans un bol : semoule, thon et haricots verts. Servir avec une sauce yaourt-citron (yaourt, citron, sel)."
    ]
  },
  {
    "id": "plat-bowl-crevettes-boulgour-brocoli-curry-coco",
    "nom": "Bowl crevettes-boulgour, brocoli & curry coco",
    "type": "plat",
    "cuisines": [
      "indienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "crustaces",
      "gluten"
    ],
    "motsCles": [
      "crevette",
      "boulgour",
      "brocoli"
    ],
    "kcal": 470,
    "proteines": 34,
    "glucides": 54,
    "lipides": 13,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Crevettes decortiquees",
        "quantite": 120,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Boulgour",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Brocoli",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Lait de coco",
        "quantite": 60,
        "unite": "ml",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le boulgour 12 minutes dans l'eau salee, puis l'egoutter.",
      "Saisir les crevettes 2 a 3 minutes a feu vif jusqu'a ce qu'elles soient roses.",
      "Cuire le brocoli 7 minutes a la vapeur (il reste croquant).",
      "Dresser dans un bol : boulgour, crevettes et brocoli. Mijoter 5 minutes avec le lait de coco et une cuillere de curry."
    ]
  },
  {
    "id": "plat-bowl-oeufs-quinoa-tomates-cerises-tahin-citr",
    "nom": "Bowl oeufs-quinoa, tomates cerises & tahin citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "oeuf",
      "sesame"
    ],
    "motsCles": [
      "oeuf",
      "quinoa",
      "tomate"
    ],
    "kcal": 485,
    "proteines": 25,
    "glucides": 48,
    "lipides": 22,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Cremerie"
      },
      {
        "nom": "Quinoa",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Tomates cerises",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Tahin (puree de sesame)",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le quinoa 12 a 14 minutes dans 2 volumes d'eau salee.",
      "Cuire les 2 oeufs (au plat ou durs, 9 minutes).",
      "Couper les tomates cerises en deux.",
      "Dresser dans un bol : quinoa, oeufs et tomates cerises. Napper de sauce tahin-citron (tahin, citron, un peu d'eau)."
    ]
  },
  {
    "id": "plat-bowl-tofu-patate-douce-courgette-pesto",
    "nom": "Bowl tofu-patate douce, courgette & pesto",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "soja",
      "lactose",
      "fruits-a-coque"
    ],
    "motsCles": [
      "tofu",
      "patate douce",
      "courgette"
    ],
    "kcal": 525,
    "proteines": 25,
    "glucides": 54,
    "lipides": 24,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Tofu ferme",
        "quantite": 150,
        "unite": "g",
        "rayon": "Rayon vegetal"
      },
      {
        "nom": "Patate douce",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Courgette",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Pesto",
        "quantite": 25,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Couper la patate douce en des et la rotir 20 a 25 minutes au four a 200 C.",
      "Eponger le tofu, le couper en des et le dorer 6 minutes en le retournant.",
      "Poeler la courgette en rondelles 5 a 6 minutes.",
      "Dresser dans un bol : patate douce, tofu et courgette. Melanger avec le pesto hors du feu."
    ]
  },
  {
    "id": "plat-bowl-pois-chiches-riz-champignons-huile-d-ol",
    "nom": "Bowl pois chiches-riz, champignons & huile d'olive & citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "motsCles": [
      "pois chiche",
      "riz",
      "champignon"
    ],
    "kcal": 565,
    "proteines": 19,
    "glucides": 85,
    "lipides": 15,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Pois chiches cuits",
        "quantite": 150,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Champignons de Paris",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Huile d'olive",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le riz dans l'eau bouillante salee selon le paquet, puis l'egoutter.",
      "Rincer et rechauffer les pois chiches 3 minutes avec une pincee d'epices.",
      "Poeler les champignons eminces 5 minutes a feu vif.",
      "Dresser dans un bol : riz, pois chiches et champignons. Assaisonner d'huile d'olive, de jus de citron, de sel et de poivre."
    ]
  },
  {
    "id": "plat-bowl-lentilles-pates-completes-poivrons-sauc",
    "nom": "Bowl lentilles-pates completes, poivrons & sauce tomate",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "motsCles": [
      "lentille",
      "pates",
      "poivron"
    ],
    "kcal": 540,
    "proteines": 26,
    "glucides": 102,
    "lipides": 4,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Lentilles cuites",
        "quantite": 150,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Pates completes",
        "quantite": 80,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Poivron",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pates completes al dente dans l'eau bouillante salee.",
      "Rincer et rechauffer les lentilles 3 minutes.",
      "Faire revenir le poivron emince 4 a 5 minutes.",
      "Dresser dans un bol : pates completes, lentilles et poivrons. Napper de sauce tomate mijotee avec des herbes."
    ]
  },
  {
    "id": "plat-bowl-feta-pommes-de-terre-carottes-sauce-soj",
    "nom": "Bowl feta-pommes de terre, carottes & sauce soja & sesame",
    "type": "plat",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "sans-porc",
      "vegetarien"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose",
      "soja",
      "gluten",
      "sesame"
    ],
    "motsCles": [
      "feta",
      "pomme de terre",
      "carotte"
    ],
    "kcal": 365,
    "proteines": 14,
    "glucides": 50,
    "lipides": 12,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Feta",
        "quantite": 50,
        "unite": "g",
        "rayon": "Cremerie"
      },
      {
        "nom": "Pomme de terre",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Carotte",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce soja",
        "quantite": 2,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre 18 minutes a l'eau salee.",
      "Emietter la feta sur le plat.",
      "Rapper ou cuire la carotte en rondelles.",
      "Dresser dans un bol : pommes de terre, feta et carottes. Napper de sauce soja et parsemer de graines de sesame."
    ]
  },
  {
    "id": "plat-bowl-poulet-semoule-epinards-yaourt-citron",
    "nom": "Bowl poulet-semoule, epinards & yaourt citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose",
      "gluten"
    ],
    "motsCles": [
      "poulet",
      "semoule",
      "epinard"
    ],
    "kcal": 470,
    "proteines": 51,
    "glucides": 49,
    "lipides": 7,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Filet de poulet",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Semoule",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Epinards frais",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Yaourt nature",
        "quantite": 40,
        "unite": "g",
        "rayon": "Cremerie"
      }
    ],
    "etapes": [
      "Couvrir la semoule d'eau bouillante salee a hauteur, laisser gonfler 5 minutes et l'aerer.",
      "Couper le filet de poulet en des et le poeler 6 a 7 minutes a feu moyen-vif, jusqu'a ce qu'il soit dore et cuit a coeur.",
      "Faire tomber les epinards 2 minutes a la poele.",
      "Dresser dans un bol : semoule, poulet et epinards. Servir avec une sauce yaourt-citron (yaourt, citron, sel)."
    ]
  },
  {
    "id": "plat-bowl-dinde-boulgour-salade-curry-coco",
    "nom": "Bowl dinde-boulgour, salade & curry coco",
    "type": "plat",
    "cuisines": [
      "indienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "motsCles": [
      "dinde",
      "boulgour",
      "salade"
    ],
    "kcal": 495,
    "proteines": 43,
    "glucides": 49,
    "lipides": 14,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Escalope de dinde",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Boulgour",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Salade verte",
        "quantite": 60,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Lait de coco",
        "quantite": 60,
        "unite": "ml",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le boulgour 12 minutes dans l'eau salee, puis l'egoutter.",
      "Poeler l'escalope de dinde 4 minutes par face, puis l'emincer.",
      "Laver la salade et la couper.",
      "Dresser dans un bol : boulgour, dinde et salade. Mijoter 5 minutes avec le lait de coco et une cuillere de curry."
    ]
  },
  {
    "id": "plat-bowl-boeuf-quinoa-haricots-verts-tahin-citro",
    "nom": "Bowl boeuf-quinoa, haricots verts & tahin citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "sesame"
    ],
    "motsCles": [
      "boeuf",
      "quinoa",
      "haricot"
    ],
    "kcal": 535,
    "proteines": 44,
    "glucides": 50,
    "lipides": 19,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Boeuf hache 5%",
        "quantite": 120,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Quinoa",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Haricots verts",
        "quantite": 150,
        "unite": "g",
        "rayon": "Surgeles"
      },
      {
        "nom": "Tahin (puree de sesame)",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le quinoa 12 a 14 minutes dans 2 volumes d'eau salee.",
      "Saisir le boeuf hache 5 minutes a feu vif en l'emiettant ; assaisonner.",
      "Cuire les haricots verts 8 a 10 minutes.",
      "Dresser dans un bol : quinoa, boeuf et haricots verts. Napper de sauce tahin-citron (tahin, citron, un peu d'eau)."
    ]
  },
  {
    "id": "plat-bowl-saumon-patate-douce-brocoli-pesto",
    "nom": "Bowl saumon-patate douce, brocoli & pesto",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson",
      "lactose",
      "fruits-a-coque"
    ],
    "motsCles": [
      "saumon",
      "patate douce",
      "brocoli"
    ],
    "kcal": 610,
    "proteines": 41,
    "glucides": 51,
    "lipides": 28,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Pave de saumon",
        "quantite": 130,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Patate douce",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Brocoli",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Pesto",
        "quantite": 25,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Couper la patate douce en des et la rotir 20 a 25 minutes au four a 200 C.",
      "Poeler le saumon 4 minutes cote peau puis 2 a 3 minutes de l'autre cote.",
      "Cuire le brocoli 7 minutes a la vapeur (il reste croquant).",
      "Dresser dans un bol : patate douce, saumon et brocoli. Melanger avec le pesto hors du feu."
    ]
  },
  {
    "id": "plat-bowl-cabillaud-riz-tomates-cerises-huile-d-o",
    "nom": "Bowl cabillaud-riz, tomates cerises & huile d'olive & citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson"
    ],
    "motsCles": [
      "cabillaud",
      "riz",
      "tomate"
    ],
    "kcal": 440,
    "proteines": 33,
    "glucides": 52,
    "lipides": 12,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Dos de cabillaud",
        "quantite": 140,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Tomates cerises",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Huile d'olive",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le riz dans l'eau bouillante salee selon le paquet, puis l'egoutter.",
      "Cuire le cabillaud 4 minutes par face a feu moyen (la chair s'effeuille).",
      "Couper les tomates cerises en deux.",
      "Dresser dans un bol : riz, cabillaud et tomates cerises. Assaisonner d'huile d'olive, de jus de citron, de sel et de poivre."
    ]
  },
  {
    "id": "plat-bowl-thon-pates-completes-courgette-sauce-to",
    "nom": "Bowl thon-pates completes, courgette & sauce tomate",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "poisson",
      "gluten"
    ],
    "motsCles": [
      "thon",
      "pates",
      "courgette"
    ],
    "kcal": 475,
    "proteines": 41,
    "glucides": 71,
    "lipides": 4,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Thon au naturel",
        "quantite": 100,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Pates completes",
        "quantite": 80,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Courgette",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pates completes al dente dans l'eau bouillante salee.",
      "Egoutter le thon et l'emietter.",
      "Poeler la courgette en rondelles 5 a 6 minutes.",
      "Dresser dans un bol : pates completes, thon et courgette. Napper de sauce tomate mijotee avec des herbes."
    ]
  },
  {
    "id": "plat-bowl-oeufs-semoule-poivrons-yaourt-citron",
    "nom": "Bowl oeufs-semoule, poivrons & yaourt citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien"
    ],
    "budget": "eco",
    "allergenes": [
      "oeuf",
      "lactose",
      "gluten"
    ],
    "motsCles": [
      "oeuf",
      "semoule",
      "poivron"
    ],
    "kcal": 430,
    "proteines": 24,
    "glucides": 55,
    "lipides": 12,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Cremerie"
      },
      {
        "nom": "Semoule",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Poivron",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Yaourt nature",
        "quantite": 40,
        "unite": "g",
        "rayon": "Cremerie"
      }
    ],
    "etapes": [
      "Couvrir la semoule d'eau bouillante salee a hauteur, laisser gonfler 5 minutes et l'aerer.",
      "Cuire les 2 oeufs (au plat ou durs, 9 minutes).",
      "Faire revenir le poivron emince 4 a 5 minutes.",
      "Dresser dans un bol : semoule, oeufs et poivrons. Servir avec une sauce yaourt-citron (yaourt, citron, sel)."
    ]
  },
  {
    "id": "plat-bowl-tofu-boulgour-carottes-curry-coco",
    "nom": "Bowl tofu-boulgour, carottes & curry coco",
    "type": "plat",
    "cuisines": [
      "indienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan"
    ],
    "budget": "eco",
    "allergenes": [
      "soja",
      "gluten"
    ],
    "motsCles": [
      "tofu",
      "boulgour",
      "carotte"
    ],
    "kcal": 540,
    "proteines": 27,
    "glucides": 60,
    "lipides": 22,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Tofu ferme",
        "quantite": 150,
        "unite": "g",
        "rayon": "Rayon vegetal"
      },
      {
        "nom": "Boulgour",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Carotte",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Lait de coco",
        "quantite": 60,
        "unite": "ml",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le boulgour 12 minutes dans l'eau salee, puis l'egoutter.",
      "Eponger le tofu, le couper en des et le dorer 6 minutes en le retournant.",
      "Rapper ou cuire la carotte en rondelles.",
      "Dresser dans un bol : boulgour, tofu et carottes. Mijoter 5 minutes avec le lait de coco et une cuillere de curry."
    ]
  },
  {
    "id": "plat-bowl-pois-chiches-quinoa-epinards-tahin-citr",
    "nom": "Bowl pois chiches-quinoa, epinards & tahin citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "sesame"
    ],
    "motsCles": [
      "pois chiche",
      "quinoa",
      "epinard"
    ],
    "kcal": 565,
    "proteines": 26,
    "glucides": 79,
    "lipides": 16,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Pois chiches cuits",
        "quantite": 150,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Quinoa",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Epinards frais",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Tahin (puree de sesame)",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le quinoa 12 a 14 minutes dans 2 volumes d'eau salee.",
      "Rincer et rechauffer les pois chiches 3 minutes avec une pincee d'epices.",
      "Faire tomber les epinards 2 minutes a la poele.",
      "Dresser dans un bol : quinoa, pois chiches et epinards. Napper de sauce tahin-citron (tahin, citron, un peu d'eau)."
    ]
  },
  {
    "id": "plat-bowl-lentilles-patate-douce-salade-pesto",
    "nom": "Bowl lentilles-patate douce, salade & pesto",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose",
      "fruits-a-coque"
    ],
    "motsCles": [
      "lentille",
      "patate douce",
      "salade"
    ],
    "kcal": 500,
    "proteines": 18,
    "glucides": 76,
    "lipides": 14,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Lentilles cuites",
        "quantite": 150,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Patate douce",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Salade verte",
        "quantite": 60,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Pesto",
        "quantite": 25,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Couper la patate douce en des et la rotir 20 a 25 minutes au four a 200 C.",
      "Rincer et rechauffer les lentilles 3 minutes.",
      "Laver la salade et la couper.",
      "Dresser dans un bol : patate douce, lentilles et salade. Melanger avec le pesto hors du feu."
    ]
  },
  {
    "id": "plat-bowl-feta-riz-haricots-verts-huile-d-olive-c",
    "nom": "Bowl feta-riz, haricots verts & huile d'olive & citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose"
    ],
    "motsCles": [
      "feta",
      "riz",
      "haricot"
    ],
    "kcal": 480,
    "proteines": 14,
    "glucides": 56,
    "lipides": 22,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Feta",
        "quantite": 50,
        "unite": "g",
        "rayon": "Cremerie"
      },
      {
        "nom": "Riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Haricots verts",
        "quantite": 150,
        "unite": "g",
        "rayon": "Surgeles"
      },
      {
        "nom": "Huile d'olive",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le riz dans l'eau bouillante salee selon le paquet, puis l'egoutter.",
      "Emietter la feta sur le plat.",
      "Cuire les haricots verts 8 a 10 minutes.",
      "Dresser dans un bol : riz, feta et haricots verts. Assaisonner d'huile d'olive, de jus de citron, de sel et de poivre."
    ]
  },
  {
    "id": "plat-bowl-poulet-pates-completes-brocoli-sauce-to",
    "nom": "Bowl poulet-pates completes, brocoli & sauce tomate",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "motsCles": [
      "poulet",
      "pates",
      "brocoli"
    ],
    "kcal": 580,
    "proteines": 55,
    "glucides": 72,
    "lipides": 9,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Filet de poulet",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Pates completes",
        "quantite": 80,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Brocoli",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pates completes al dente dans l'eau bouillante salee.",
      "Couper le filet de poulet en des et le poeler 6 a 7 minutes a feu moyen-vif, jusqu'a ce qu'il soit dore et cuit a coeur.",
      "Cuire le brocoli 7 minutes a la vapeur (il reste croquant).",
      "Dresser dans un bol : pates completes, poulet et brocoli. Napper de sauce tomate mijotee avec des herbes."
    ]
  },
  {
    "id": "plat-bowl-dinde-pommes-de-terre-tomates-cerises-s",
    "nom": "Bowl dinde-pommes de terre, tomates cerises & sauce soja & sesame",
    "type": "plat",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "soja",
      "gluten",
      "sesame"
    ],
    "motsCles": [
      "dinde",
      "pomme de terre",
      "tomate"
    ],
    "kcal": 380,
    "proteines": 41,
    "glucides": 45,
    "lipides": 4,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Escalope de dinde",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Pomme de terre",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Tomates cerises",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce soja",
        "quantite": 2,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre 18 minutes a l'eau salee.",
      "Poeler l'escalope de dinde 4 minutes par face, puis l'emincer.",
      "Couper les tomates cerises en deux.",
      "Dresser dans un bol : pommes de terre, dinde et tomates cerises. Napper de sauce soja et parsemer de graines de sesame."
    ]
  },
  {
    "id": "plat-bowl-boeuf-semoule-courgette-yaourt-citron",
    "nom": "Bowl boeuf-semoule, courgette & yaourt citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose",
      "gluten"
    ],
    "motsCles": [
      "boeuf",
      "semoule",
      "courgette"
    ],
    "kcal": 460,
    "proteines": 42,
    "glucides": 53,
    "lipides": 9,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Boeuf hache 5%",
        "quantite": 120,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Semoule",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Courgette",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Yaourt nature",
        "quantite": 40,
        "unite": "g",
        "rayon": "Cremerie"
      }
    ],
    "etapes": [
      "Couvrir la semoule d'eau bouillante salee a hauteur, laisser gonfler 5 minutes et l'aerer.",
      "Saisir le boeuf hache 5 minutes a feu vif en l'emiettant ; assaisonner.",
      "Poeler la courgette en rondelles 5 a 6 minutes.",
      "Dresser dans un bol : semoule, boeuf et courgette. Servir avec une sauce yaourt-citron (yaourt, citron, sel)."
    ]
  },
  {
    "id": "plat-bowl-saumon-boulgour-champignons-curry-coco",
    "nom": "Bowl saumon-boulgour, champignons & curry coco",
    "type": "plat",
    "cuisines": [
      "indienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson",
      "gluten"
    ],
    "motsCles": [
      "saumon",
      "boulgour",
      "champignon"
    ],
    "kcal": 600,
    "proteines": 43,
    "glucides": 50,
    "lipides": 25,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Pave de saumon",
        "quantite": 130,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Boulgour",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Champignons de Paris",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Lait de coco",
        "quantite": 60,
        "unite": "ml",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le boulgour 12 minutes dans l'eau salee, puis l'egoutter.",
      "Poeler le saumon 4 minutes cote peau puis 2 a 3 minutes de l'autre cote.",
      "Poeler les champignons eminces 5 minutes a feu vif.",
      "Dresser dans un bol : boulgour, saumon et champignons. Mijoter 5 minutes avec le lait de coco et une cuillere de curry."
    ]
  },
  {
    "id": "plat-bowl-cabillaud-quinoa-poivrons-tahin-citron",
    "nom": "Bowl cabillaud-quinoa, poivrons & tahin citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson",
      "sesame"
    ],
    "motsCles": [
      "cabillaud",
      "quinoa",
      "poivron"
    ],
    "kcal": 455,
    "proteines": 40,
    "glucides": 49,
    "lipides": 13,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Dos de cabillaud",
        "quantite": 140,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Quinoa",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Poivron",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Tahin (puree de sesame)",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le quinoa 12 a 14 minutes dans 2 volumes d'eau salee.",
      "Cuire le cabillaud 4 minutes par face a feu moyen (la chair s'effeuille).",
      "Faire revenir le poivron emince 4 a 5 minutes.",
      "Dresser dans un bol : quinoa, cabillaud et poivrons. Napper de sauce tahin-citron (tahin, citron, un peu d'eau)."
    ]
  },
  {
    "id": "plat-bowl-thon-patate-douce-carottes-pesto",
    "nom": "Bowl thon-patate douce, carottes & pesto",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "poisson",
      "lactose",
      "fruits-a-coque"
    ],
    "motsCles": [
      "thon",
      "patate douce",
      "carotte"
    ],
    "kcal": 460,
    "proteines": 32,
    "glucides": 53,
    "lipides": 14,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Thon au naturel",
        "quantite": 100,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Patate douce",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Carotte",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Pesto",
        "quantite": 25,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Couper la patate douce en des et la rotir 20 a 25 minutes au four a 200 C.",
      "Egoutter le thon et l'emietter.",
      "Rapper ou cuire la carotte en rondelles.",
      "Dresser dans un bol : patate douce, thon et carottes. Melanger avec le pesto hors du feu."
    ]
  },
  {
    "id": "plat-bowl-crevettes-riz-epinards-huile-d-olive-ci",
    "nom": "Bowl crevettes-riz, epinards & huile d'olive & citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "crustaces"
    ],
    "motsCles": [
      "crevette",
      "riz",
      "epinard"
    ],
    "kcal": 430,
    "proteines": 29,
    "glucides": 49,
    "lipides": 12,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Crevettes decortiquees",
        "quantite": 120,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Epinards frais",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Huile d'olive",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le riz dans l'eau bouillante salee selon le paquet, puis l'egoutter.",
      "Saisir les crevettes 2 a 3 minutes a feu vif jusqu'a ce qu'elles soient roses.",
      "Faire tomber les epinards 2 minutes a la poele.",
      "Dresser dans un bol : riz, crevettes et epinards. Assaisonner d'huile d'olive, de jus de citron, de sel et de poivre."
    ]
  },
  {
    "id": "plat-bowl-oeufs-pates-completes-salade-sauce-toma",
    "nom": "Bowl oeufs-pates completes, salade & sauce tomate",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien"
    ],
    "budget": "eco",
    "allergenes": [
      "oeuf",
      "gluten"
    ],
    "motsCles": [
      "oeuf",
      "pates",
      "salade"
    ],
    "kcal": 495,
    "proteines": 27,
    "glucides": 68,
    "lipides": 13,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Cremerie"
      },
      {
        "nom": "Pates completes",
        "quantite": 80,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Salade verte",
        "quantite": 60,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pates completes al dente dans l'eau bouillante salee.",
      "Cuire les 2 oeufs (au plat ou durs, 9 minutes).",
      "Laver la salade et la couper.",
      "Dresser dans un bol : pates completes, oeufs et salade. Napper de sauce tomate mijotee avec des herbes."
    ]
  },
  {
    "id": "plat-bowl-tofu-pommes-de-terre-haricots-verts-sau",
    "nom": "Bowl tofu-pommes de terre, haricots verts & sauce soja & sesame",
    "type": "plat",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan"
    ],
    "budget": "eco",
    "allergenes": [
      "soja",
      "gluten",
      "sesame"
    ],
    "motsCles": [
      "tofu",
      "pomme de terre",
      "haricot"
    ],
    "kcal": 420,
    "proteines": 27,
    "glucides": 52,
    "lipides": 12,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Tofu ferme",
        "quantite": 150,
        "unite": "g",
        "rayon": "Rayon vegetal"
      },
      {
        "nom": "Pomme de terre",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Haricots verts",
        "quantite": 150,
        "unite": "g",
        "rayon": "Surgeles"
      },
      {
        "nom": "Sauce soja",
        "quantite": 2,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre 18 minutes a l'eau salee.",
      "Eponger le tofu, le couper en des et le dorer 6 minutes en le retournant.",
      "Cuire les haricots verts 8 a 10 minutes.",
      "Dresser dans un bol : pommes de terre, tofu et haricots verts. Napper de sauce soja et parsemer de graines de sesame."
    ]
  },
  {
    "id": "plat-bowl-pois-chiches-semoule-brocoli-yaourt-cit",
    "nom": "Bowl pois chiches-semoule, brocoli & yaourt citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose",
      "gluten"
    ],
    "motsCles": [
      "pois chiche",
      "semoule",
      "brocoli"
    ],
    "kcal": 525,
    "proteines": 26,
    "glucides": 89,
    "lipides": 7,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Pois chiches cuits",
        "quantite": 150,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Semoule",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Brocoli",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Yaourt nature",
        "quantite": 40,
        "unite": "g",
        "rayon": "Cremerie"
      }
    ],
    "etapes": [
      "Couvrir la semoule d'eau bouillante salee a hauteur, laisser gonfler 5 minutes et l'aerer.",
      "Rincer et rechauffer les pois chiches 3 minutes avec une pincee d'epices.",
      "Cuire le brocoli 7 minutes a la vapeur (il reste croquant).",
      "Dresser dans un bol : semoule, pois chiches et brocoli. Servir avec une sauce yaourt-citron (yaourt, citron, sel)."
    ]
  },
  {
    "id": "plat-bowl-lentilles-boulgour-tomates-cerises-curr",
    "nom": "Bowl lentilles-boulgour, tomates cerises & curry coco",
    "type": "plat",
    "cuisines": [
      "indienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "motsCles": [
      "lentille",
      "boulgour",
      "tomate"
    ],
    "kcal": 520,
    "proteines": 21,
    "glucides": 82,
    "lipides": 12,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Lentilles cuites",
        "quantite": 150,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Boulgour",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Tomates cerises",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Lait de coco",
        "quantite": 60,
        "unite": "ml",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le boulgour 12 minutes dans l'eau salee, puis l'egoutter.",
      "Rincer et rechauffer les lentilles 3 minutes.",
      "Couper les tomates cerises en deux.",
      "Dresser dans un bol : boulgour, lentilles et tomates cerises. Mijoter 5 minutes avec le lait de coco et une cuillere de curry."
    ]
  },
  {
    "id": "plat-bowl-feta-quinoa-courgette-tahin-citron",
    "nom": "Bowl feta-quinoa, courgette & tahin citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose",
      "sesame"
    ],
    "motsCles": [
      "feta",
      "quinoa",
      "courgette"
    ],
    "kcal": 475,
    "proteines": 20,
    "glucides": 49,
    "lipides": 23,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Feta",
        "quantite": 50,
        "unite": "g",
        "rayon": "Cremerie"
      },
      {
        "nom": "Quinoa",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Courgette",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Tahin (puree de sesame)",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le quinoa 12 a 14 minutes dans 2 volumes d'eau salee.",
      "Emietter la feta sur le plat.",
      "Poeler la courgette en rondelles 5 a 6 minutes.",
      "Dresser dans un bol : quinoa, feta et courgette. Napper de sauce tahin-citron (tahin, citron, un peu d'eau)."
    ]
  },
  {
    "id": "plat-bowl-poulet-patate-douce-champignons-pesto",
    "nom": "Bowl poulet-patate douce, champignons & pesto",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose",
      "fruits-a-coque"
    ],
    "motsCles": [
      "poulet",
      "patate douce",
      "champignon"
    ],
    "kcal": 540,
    "proteines": 46,
    "glucides": 47,
    "lipides": 18,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Filet de poulet",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Patate douce",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Champignons de Paris",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Pesto",
        "quantite": 25,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Couper la patate douce en des et la rotir 20 a 25 minutes au four a 200 C.",
      "Couper le filet de poulet en des et le poeler 6 a 7 minutes a feu moyen-vif, jusqu'a ce qu'il soit dore et cuit a coeur.",
      "Poeler les champignons eminces 5 minutes a feu vif.",
      "Dresser dans un bol : patate douce, poulet et champignons. Melanger avec le pesto hors du feu."
    ]
  },
  {
    "id": "plat-bowl-dinde-riz-poivrons-huile-d-olive-citron",
    "nom": "Bowl dinde-riz, poivrons & huile d'olive & citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "motsCles": [
      "dinde",
      "riz",
      "poivron"
    ],
    "kcal": 500,
    "proteines": 39,
    "glucides": 54,
    "lipides": 14,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Escalope de dinde",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Poivron",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Huile d'olive",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le riz dans l'eau bouillante salee selon le paquet, puis l'egoutter.",
      "Poeler l'escalope de dinde 4 minutes par face, puis l'emincer.",
      "Faire revenir le poivron emince 4 a 5 minutes.",
      "Dresser dans un bol : riz, dinde et poivrons. Assaisonner d'huile d'olive, de jus de citron, de sel et de poivre."
    ]
  },
  {
    "id": "plat-bowl-boeuf-pates-completes-carottes-sauce-to",
    "nom": "Bowl boeuf-pates completes, carottes & sauce tomate",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "motsCles": [
      "boeuf",
      "pates",
      "carotte"
    ],
    "kcal": 550,
    "proteines": 44,
    "glucides": 74,
    "lipides": 10,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Boeuf hache 5%",
        "quantite": 120,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Pates completes",
        "quantite": 80,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Carotte",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pates completes al dente dans l'eau bouillante salee.",
      "Saisir le boeuf hache 5 minutes a feu vif en l'emiettant ; assaisonner.",
      "Rapper ou cuire la carotte en rondelles.",
      "Dresser dans un bol : pates completes, boeuf et carottes. Napper de sauce tomate mijotee avec des herbes."
    ]
  },
  {
    "id": "plat-bowl-saumon-pommes-de-terre-epinards-sauce-s",
    "nom": "Bowl saumon-pommes de terre, epinards & sauce soja & sesame",
    "type": "plat",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson",
      "soja",
      "gluten",
      "sesame"
    ],
    "motsCles": [
      "saumon",
      "pomme de terre",
      "epinard"
    ],
    "kcal": 470,
    "proteines": 41,
    "glucides": 42,
    "lipides": 15,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Pave de saumon",
        "quantite": 130,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Pomme de terre",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Epinards frais",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce soja",
        "quantite": 2,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre 18 minutes a l'eau salee.",
      "Poeler le saumon 4 minutes cote peau puis 2 a 3 minutes de l'autre cote.",
      "Faire tomber les epinards 2 minutes a la poele.",
      "Dresser dans un bol : pommes de terre, saumon et epinards. Napper de sauce soja et parsemer de graines de sesame."
    ]
  },
  {
    "id": "plat-bowl-cabillaud-semoule-salade-yaourt-citron",
    "nom": "Bowl cabillaud-semoule, salade & yaourt citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson",
      "lactose",
      "gluten"
    ],
    "motsCles": [
      "cabillaud",
      "semoule",
      "salade"
    ],
    "kcal": 370,
    "proteines": 39,
    "glucides": 49,
    "lipides": 3,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Dos de cabillaud",
        "quantite": 140,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Semoule",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Salade verte",
        "quantite": 60,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Yaourt nature",
        "quantite": 40,
        "unite": "g",
        "rayon": "Cremerie"
      }
    ],
    "etapes": [
      "Couvrir la semoule d'eau bouillante salee a hauteur, laisser gonfler 5 minutes et l'aerer.",
      "Cuire le cabillaud 4 minutes par face a feu moyen (la chair s'effeuille).",
      "Laver la salade et la couper.",
      "Dresser dans un bol : semoule, cabillaud et salade. Servir avec une sauce yaourt-citron (yaourt, citron, sel)."
    ]
  },
  {
    "id": "plat-bowl-thon-boulgour-haricots-verts-curry-coco",
    "nom": "Bowl thon-boulgour, haricots verts & curry coco",
    "type": "plat",
    "cuisines": [
      "indienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "poisson",
      "gluten"
    ],
    "motsCles": [
      "thon",
      "boulgour",
      "haricot"
    ],
    "kcal": 475,
    "proteines": 37,
    "glucides": 55,
    "lipides": 12,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Thon au naturel",
        "quantite": 100,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Boulgour",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Haricots verts",
        "quantite": 150,
        "unite": "g",
        "rayon": "Surgeles"
      },
      {
        "nom": "Lait de coco",
        "quantite": 60,
        "unite": "ml",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le boulgour 12 minutes dans l'eau salee, puis l'egoutter.",
      "Egoutter le thon et l'emietter.",
      "Cuire les haricots verts 8 a 10 minutes.",
      "Dresser dans un bol : boulgour, thon et haricots verts. Mijoter 5 minutes avec le lait de coco et une cuillere de curry."
    ]
  },
  {
    "id": "plat-bowl-crevettes-quinoa-brocoli-tahin-citron",
    "nom": "Bowl crevettes-quinoa, brocoli & tahin citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "crustaces",
      "sesame"
    ],
    "motsCles": [
      "crevette",
      "quinoa",
      "brocoli"
    ],
    "kcal": 460,
    "proteines": 37,
    "glucides": 49,
    "lipides": 14,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Crevettes decortiquees",
        "quantite": 120,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Quinoa",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Brocoli",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Tahin (puree de sesame)",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le quinoa 12 a 14 minutes dans 2 volumes d'eau salee.",
      "Saisir les crevettes 2 a 3 minutes a feu vif jusqu'a ce qu'elles soient roses.",
      "Cuire le brocoli 7 minutes a la vapeur (il reste croquant).",
      "Dresser dans un bol : quinoa, crevettes et brocoli. Napper de sauce tahin-citron (tahin, citron, un peu d'eau)."
    ]
  },
  {
    "id": "plat-bowl-oeufs-patate-douce-tomates-cerises-pest",
    "nom": "Bowl oeufs-patate douce, tomates cerises & pesto",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "oeuf",
      "lactose",
      "fruits-a-coque"
    ],
    "motsCles": [
      "oeuf",
      "patate douce",
      "tomate"
    ],
    "kcal": 485,
    "proteines": 19,
    "glucides": 50,
    "lipides": 23,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Cremerie"
      },
      {
        "nom": "Patate douce",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Tomates cerises",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Pesto",
        "quantite": 25,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Couper la patate douce en des et la rotir 20 a 25 minutes au four a 200 C.",
      "Cuire les 2 oeufs (au plat ou durs, 9 minutes).",
      "Couper les tomates cerises en deux.",
      "Dresser dans un bol : patate douce, oeufs et tomates cerises. Melanger avec le pesto hors du feu."
    ]
  },
  {
    "id": "plat-bowl-tofu-riz-courgette-huile-d-olive-citron",
    "nom": "Bowl tofu-riz, courgette & huile d'olive & citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "soja"
    ],
    "motsCles": [
      "tofu",
      "riz",
      "courgette"
    ],
    "kcal": 520,
    "proteines": 24,
    "glucides": 57,
    "lipides": 22,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Tofu ferme",
        "quantite": 150,
        "unite": "g",
        "rayon": "Rayon vegetal"
      },
      {
        "nom": "Riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Courgette",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Huile d'olive",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le riz dans l'eau bouillante salee selon le paquet, puis l'egoutter.",
      "Eponger le tofu, le couper en des et le dorer 6 minutes en le retournant.",
      "Poeler la courgette en rondelles 5 a 6 minutes.",
      "Dresser dans un bol : riz, tofu et courgette. Assaisonner d'huile d'olive, de jus de citron, de sel et de poivre."
    ]
  },
  {
    "id": "plat-bowl-pois-chiches-pates-completes-champignon",
    "nom": "Bowl pois chiches-pates completes, champignons & sauce tomate",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "motsCles": [
      "pois chiche",
      "pates",
      "champignon"
    ],
    "kcal": 590,
    "proteines": 28,
    "glucides": 103,
    "lipides": 7,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Pois chiches cuits",
        "quantite": 150,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Pates completes",
        "quantite": 80,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Champignons de Paris",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pates completes al dente dans l'eau bouillante salee.",
      "Rincer et rechauffer les pois chiches 3 minutes avec une pincee d'epices.",
      "Poeler les champignons eminces 5 minutes a feu vif.",
      "Dresser dans un bol : pates completes, pois chiches et champignons. Napper de sauce tomate mijotee avec des herbes."
    ]
  },
  {
    "id": "plat-bowl-lentilles-pommes-de-terre-poivrons-sauc",
    "nom": "Bowl lentilles-pommes de terre, poivrons & sauce soja & sesame",
    "type": "plat",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan"
    ],
    "budget": "eco",
    "allergenes": [
      "soja",
      "gluten",
      "sesame"
    ],
    "motsCles": [
      "lentille",
      "pomme de terre",
      "poivron"
    ],
    "kcal": 405,
    "proteines": 19,
    "glucides": 77,
    "lipides": 2,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Lentilles cuites",
        "quantite": 150,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Pomme de terre",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Poivron",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce soja",
        "quantite": 2,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre 18 minutes a l'eau salee.",
      "Rincer et rechauffer les lentilles 3 minutes.",
      "Faire revenir le poivron emince 4 a 5 minutes.",
      "Dresser dans un bol : pommes de terre, lentilles et poivrons. Napper de sauce soja et parsemer de graines de sesame."
    ]
  },
  {
    "id": "plat-bowl-feta-semoule-carottes-yaourt-citron",
    "nom": "Bowl feta-semoule, carottes & yaourt citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose",
      "gluten"
    ],
    "motsCles": [
      "feta",
      "semoule",
      "carotte"
    ],
    "kcal": 415,
    "proteines": 18,
    "glucides": 57,
    "lipides": 13,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Feta",
        "quantite": 50,
        "unite": "g",
        "rayon": "Cremerie"
      },
      {
        "nom": "Semoule",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Carotte",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Yaourt nature",
        "quantite": 40,
        "unite": "g",
        "rayon": "Cremerie"
      }
    ],
    "etapes": [
      "Couvrir la semoule d'eau bouillante salee a hauteur, laisser gonfler 5 minutes et l'aerer.",
      "Emietter la feta sur le plat.",
      "Rapper ou cuire la carotte en rondelles.",
      "Dresser dans un bol : semoule, feta et carottes. Servir avec une sauce yaourt-citron (yaourt, citron, sel)."
    ]
  },
  {
    "id": "plat-bowl-poulet-boulgour-epinards-curry-coco",
    "nom": "Bowl poulet-boulgour, epinards & curry coco",
    "type": "plat",
    "cuisines": [
      "indienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "motsCles": [
      "poulet",
      "boulgour",
      "epinard"
    ],
    "kcal": 545,
    "proteines": 49,
    "glucides": 49,
    "lipides": 16,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Filet de poulet",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Boulgour",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Epinards frais",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Lait de coco",
        "quantite": 60,
        "unite": "ml",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le boulgour 12 minutes dans l'eau salee, puis l'egoutter.",
      "Couper le filet de poulet en des et le poeler 6 a 7 minutes a feu moyen-vif, jusqu'a ce qu'il soit dore et cuit a coeur.",
      "Faire tomber les epinards 2 minutes a la poele.",
      "Dresser dans un bol : boulgour, poulet et epinards. Mijoter 5 minutes avec le lait de coco et une cuillere de curry."
    ]
  },
  {
    "id": "plat-bowl-dinde-quinoa-salade-tahin-citron",
    "nom": "Bowl dinde-quinoa, salade & tahin citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "sesame"
    ],
    "motsCles": [
      "dinde",
      "quinoa",
      "salade"
    ],
    "kcal": 485,
    "proteines": 46,
    "glucides": 44,
    "lipides": 15,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Escalope de dinde",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Quinoa",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Salade verte",
        "quantite": 60,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Tahin (puree de sesame)",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le quinoa 12 a 14 minutes dans 2 volumes d'eau salee.",
      "Poeler l'escalope de dinde 4 minutes par face, puis l'emincer.",
      "Laver la salade et la couper.",
      "Dresser dans un bol : quinoa, dinde et salade. Napper de sauce tahin-citron (tahin, citron, un peu d'eau)."
    ]
  },
  {
    "id": "plat-bowl-boeuf-patate-douce-haricots-verts-pesto",
    "nom": "Bowl boeuf-patate douce, haricots verts & pesto",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose",
      "fruits-a-coque"
    ],
    "motsCles": [
      "boeuf",
      "patate douce",
      "haricot"
    ],
    "kcal": 535,
    "proteines": 38,
    "glucides": 52,
    "lipides": 20,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Boeuf hache 5%",
        "quantite": 120,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Patate douce",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Haricots verts",
        "quantite": 150,
        "unite": "g",
        "rayon": "Surgeles"
      },
      {
        "nom": "Pesto",
        "quantite": 25,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Couper la patate douce en des et la rotir 20 a 25 minutes au four a 200 C.",
      "Saisir le boeuf hache 5 minutes a feu vif en l'emiettant ; assaisonner.",
      "Cuire les haricots verts 8 a 10 minutes.",
      "Dresser dans un bol : patate douce, boeuf et haricots verts. Melanger avec le pesto hors du feu."
    ]
  },
  {
    "id": "plat-bowl-saumon-riz-brocoli-huile-d-olive-citron",
    "nom": "Bowl saumon-riz, brocoli & huile d'olive & citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson"
    ],
    "motsCles": [
      "saumon",
      "riz",
      "brocoli"
    ],
    "kcal": 605,
    "proteines": 40,
    "glucides": 54,
    "lipides": 26,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Pave de saumon",
        "quantite": 130,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Brocoli",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Huile d'olive",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le riz dans l'eau bouillante salee selon le paquet, puis l'egoutter.",
      "Poeler le saumon 4 minutes cote peau puis 2 a 3 minutes de l'autre cote.",
      "Cuire le brocoli 7 minutes a la vapeur (il reste croquant).",
      "Dresser dans un bol : riz, saumon et brocoli. Assaisonner d'huile d'olive, de jus de citron, de sel et de poivre."
    ]
  },
  {
    "id": "plat-bowl-cabillaud-pates-completes-tomates-ceris",
    "nom": "Bowl cabillaud-pates completes, tomates cerises & sauce tomate",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson",
      "gluten"
    ],
    "motsCles": [
      "cabillaud",
      "pates",
      "tomate"
    ],
    "kcal": 465,
    "proteines": 42,
    "glucides": 70,
    "lipides": 4,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Dos de cabillaud",
        "quantite": 140,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Pates completes",
        "quantite": 80,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Tomates cerises",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pates completes al dente dans l'eau bouillante salee.",
      "Cuire le cabillaud 4 minutes par face a feu moyen (la chair s'effeuille).",
      "Couper les tomates cerises en deux.",
      "Dresser dans un bol : pates completes, cabillaud et tomates cerises. Napper de sauce tomate mijotee avec des herbes."
    ]
  },
  {
    "id": "plat-bowl-crevettes-semoule-champignons-yaourt-ci",
    "nom": "Bowl crevettes-semoule, champignons & yaourt citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "crustaces",
      "lactose",
      "gluten"
    ],
    "motsCles": [
      "crevette",
      "semoule",
      "champignon"
    ],
    "kcal": 375,
    "proteines": 35,
    "glucides": 50,
    "lipides": 3,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Crevettes decortiquees",
        "quantite": 120,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Semoule",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Champignons de Paris",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Yaourt nature",
        "quantite": 40,
        "unite": "g",
        "rayon": "Cremerie"
      }
    ],
    "etapes": [
      "Couvrir la semoule d'eau bouillante salee a hauteur, laisser gonfler 5 minutes et l'aerer.",
      "Saisir les crevettes 2 a 3 minutes a feu vif jusqu'a ce qu'elles soient roses.",
      "Poeler les champignons eminces 5 minutes a feu vif.",
      "Dresser dans un bol : semoule, crevettes et champignons. Servir avec une sauce yaourt-citron (yaourt, citron, sel)."
    ]
  },
  {
    "id": "plat-bowl-oeufs-boulgour-poivrons-curry-coco",
    "nom": "Bowl oeufs-boulgour, poivrons & curry coco",
    "type": "plat",
    "cuisines": [
      "indienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien"
    ],
    "budget": "eco",
    "allergenes": [
      "oeuf",
      "gluten"
    ],
    "motsCles": [
      "oeuf",
      "boulgour",
      "poivron"
    ],
    "kcal": 505,
    "proteines": 22,
    "glucides": 55,
    "lipides": 21,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Cremerie"
      },
      {
        "nom": "Boulgour",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Poivron",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Lait de coco",
        "quantite": 60,
        "unite": "ml",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le boulgour 12 minutes dans l'eau salee, puis l'egoutter.",
      "Cuire les 2 oeufs (au plat ou durs, 9 minutes).",
      "Faire revenir le poivron emince 4 a 5 minutes.",
      "Dresser dans un bol : boulgour, oeufs et poivrons. Mijoter 5 minutes avec le lait de coco et une cuillere de curry."
    ]
  },
  {
    "id": "plat-bowl-tofu-quinoa-carottes-tahin-citron",
    "nom": "Bowl tofu-quinoa, carottes & tahin citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "soja",
      "sesame"
    ],
    "motsCles": [
      "tofu",
      "quinoa",
      "carotte"
    ],
    "kcal": 530,
    "proteines": 30,
    "glucides": 55,
    "lipides": 23,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Tofu ferme",
        "quantite": 150,
        "unite": "g",
        "rayon": "Rayon vegetal"
      },
      {
        "nom": "Quinoa",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Carotte",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Tahin (puree de sesame)",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le quinoa 12 a 14 minutes dans 2 volumes d'eau salee.",
      "Eponger le tofu, le couper en des et le dorer 6 minutes en le retournant.",
      "Rapper ou cuire la carotte en rondelles.",
      "Dresser dans un bol : quinoa, tofu et carottes. Napper de sauce tahin-citron (tahin, citron, un peu d'eau)."
    ]
  },
  {
    "id": "plat-bowl-pois-chiches-patate-douce-epinards-pest",
    "nom": "Bowl pois chiches-patate douce, epinards & pesto",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose",
      "fruits-a-coque"
    ],
    "motsCles": [
      "pois chiche",
      "patate douce",
      "epinard"
    ],
    "kcal": 565,
    "proteines": 20,
    "glucides": 81,
    "lipides": 17,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Pois chiches cuits",
        "quantite": 150,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Patate douce",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Epinards frais",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Pesto",
        "quantite": 25,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Couper la patate douce en des et la rotir 20 a 25 minutes au four a 200 C.",
      "Rincer et rechauffer les pois chiches 3 minutes avec une pincee d'epices.",
      "Faire tomber les epinards 2 minutes a la poele.",
      "Dresser dans un bol : patate douce, pois chiches et epinards. Melanger avec le pesto hors du feu."
    ]
  },
  {
    "id": "plat-bowl-lentilles-riz-salade-huile-d-olive-citr",
    "nom": "Bowl lentilles-riz, salade & huile d'olive & citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "motsCles": [
      "lentille",
      "riz",
      "salade"
    ],
    "kcal": 495,
    "proteines": 17,
    "glucides": 79,
    "lipides": 12,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Lentilles cuites",
        "quantite": 150,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Salade verte",
        "quantite": 60,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Huile d'olive",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le riz dans l'eau bouillante salee selon le paquet, puis l'egoutter.",
      "Rincer et rechauffer les lentilles 3 minutes.",
      "Laver la salade et la couper.",
      "Dresser dans un bol : riz, lentilles et salade. Assaisonner d'huile d'olive, de jus de citron, de sel et de poivre."
    ]
  },
  {
    "id": "plat-bowl-feta-pates-completes-haricots-verts-sau",
    "nom": "Bowl feta-pates completes, haricots verts & sauce tomate",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose",
      "gluten"
    ],
    "motsCles": [
      "feta",
      "pates",
      "haricot"
    ],
    "kcal": 505,
    "proteines": 23,
    "glucides": 74,
    "lipides": 14,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Feta",
        "quantite": 50,
        "unite": "g",
        "rayon": "Cremerie"
      },
      {
        "nom": "Pates completes",
        "quantite": 80,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Haricots verts",
        "quantite": 150,
        "unite": "g",
        "rayon": "Surgeles"
      },
      {
        "nom": "Sauce tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pates completes al dente dans l'eau bouillante salee.",
      "Emietter la feta sur le plat.",
      "Cuire les haricots verts 8 a 10 minutes.",
      "Dresser dans un bol : pates completes, feta et haricots verts. Napper de sauce tomate mijotee avec des herbes."
    ]
  },
  {
    "id": "plat-bowl-poulet-pommes-de-terre-brocoli-sauce-so",
    "nom": "Bowl poulet-pommes de terre, brocoli & sauce soja & sesame",
    "type": "plat",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "soja",
      "gluten",
      "sesame"
    ],
    "motsCles": [
      "poulet",
      "pomme de terre",
      "brocoli"
    ],
    "kcal": 445,
    "proteines": 48,
    "glucides": 47,
    "lipides": 7,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Filet de poulet",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Pomme de terre",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Brocoli",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce soja",
        "quantite": 2,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre 18 minutes a l'eau salee.",
      "Couper le filet de poulet en des et le poeler 6 a 7 minutes a feu moyen-vif, jusqu'a ce qu'il soit dore et cuit a coeur.",
      "Cuire le brocoli 7 minutes a la vapeur (il reste croquant).",
      "Dresser dans un bol : pommes de terre, poulet et brocoli. Napper de sauce soja et parsemer de graines de sesame."
    ]
  },
  {
    "id": "plat-bowl-dinde-semoule-tomates-cerises-yaourt-ci",
    "nom": "Bowl dinde-semoule, tomates cerises & yaourt citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose",
      "gluten"
    ],
    "motsCles": [
      "dinde",
      "semoule",
      "tomate"
    ],
    "kcal": 430,
    "proteines": 45,
    "glucides": 52,
    "lipides": 5,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Escalope de dinde",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Semoule",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Tomates cerises",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Yaourt nature",
        "quantite": 40,
        "unite": "g",
        "rayon": "Cremerie"
      }
    ],
    "etapes": [
      "Couvrir la semoule d'eau bouillante salee a hauteur, laisser gonfler 5 minutes et l'aerer.",
      "Poeler l'escalope de dinde 4 minutes par face, puis l'emincer.",
      "Couper les tomates cerises en deux.",
      "Dresser dans un bol : semoule, dinde et tomates cerises. Servir avec une sauce yaourt-citron (yaourt, citron, sel)."
    ]
  },
  {
    "id": "plat-bowl-boeuf-boulgour-courgette-curry-coco",
    "nom": "Bowl boeuf-boulgour, courgette & curry coco",
    "type": "plat",
    "cuisines": [
      "indienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "motsCles": [
      "boeuf",
      "boulgour",
      "courgette"
    ],
    "kcal": 535,
    "proteines": 40,
    "glucides": 53,
    "lipides": 18,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Boeuf hache 5%",
        "quantite": 120,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Boulgour",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Courgette",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Lait de coco",
        "quantite": 60,
        "unite": "ml",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le boulgour 12 minutes dans l'eau salee, puis l'egoutter.",
      "Saisir le boeuf hache 5 minutes a feu vif en l'emiettant ; assaisonner.",
      "Poeler la courgette en rondelles 5 a 6 minutes.",
      "Dresser dans un bol : boulgour, boeuf et courgette. Mijoter 5 minutes avec le lait de coco et une cuillere de curry."
    ]
  },
  {
    "id": "plat-bowl-saumon-quinoa-champignons-tahin-citron",
    "nom": "Bowl saumon-quinoa, champignons & tahin citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson",
      "sesame"
    ],
    "motsCles": [
      "saumon",
      "quinoa",
      "champignon"
    ],
    "kcal": 590,
    "proteines": 46,
    "glucides": 45,
    "lipides": 26,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Pave de saumon",
        "quantite": 130,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Quinoa",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Champignons de Paris",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Tahin (puree de sesame)",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le quinoa 12 a 14 minutes dans 2 volumes d'eau salee.",
      "Poeler le saumon 4 minutes cote peau puis 2 a 3 minutes de l'autre cote.",
      "Poeler les champignons eminces 5 minutes a feu vif.",
      "Dresser dans un bol : quinoa, saumon et champignons. Napper de sauce tahin-citron (tahin, citron, un peu d'eau)."
    ]
  },
  {
    "id": "plat-bowl-cabillaud-patate-douce-poivrons-pesto",
    "nom": "Bowl cabillaud-patate douce, poivrons & pesto",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson",
      "lactose",
      "fruits-a-coque"
    ],
    "motsCles": [
      "cabillaud",
      "patate douce",
      "poivron"
    ],
    "kcal": 455,
    "proteines": 34,
    "glucides": 51,
    "lipides": 14,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Dos de cabillaud",
        "quantite": 140,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Patate douce",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Poivron",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Pesto",
        "quantite": 25,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Couper la patate douce en des et la rotir 20 a 25 minutes au four a 200 C.",
      "Cuire le cabillaud 4 minutes par face a feu moyen (la chair s'effeuille).",
      "Faire revenir le poivron emince 4 a 5 minutes.",
      "Dresser dans un bol : patate douce, cabillaud et poivrons. Melanger avec le pesto hors du feu."
    ]
  },
  {
    "id": "plat-bowl-thon-riz-carottes-huile-d-olive-citron",
    "nom": "Bowl thon-riz, carottes & huile d'olive & citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "poisson"
    ],
    "motsCles": [
      "thon",
      "riz",
      "carotte"
    ],
    "kcal": 455,
    "proteines": 31,
    "glucides": 56,
    "lipides": 12,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Thon au naturel",
        "quantite": 100,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Carotte",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Huile d'olive",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le riz dans l'eau bouillante salee selon le paquet, puis l'egoutter.",
      "Egoutter le thon et l'emietter.",
      "Rapper ou cuire la carotte en rondelles.",
      "Dresser dans un bol : riz, thon et carottes. Assaisonner d'huile d'olive, de jus de citron, de sel et de poivre."
    ]
  },
  {
    "id": "plat-bowl-crevettes-pates-completes-epinards-sauc",
    "nom": "Bowl crevettes-pates completes, epinards & sauce tomate",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "crustaces",
      "gluten"
    ],
    "motsCles": [
      "crevette",
      "pates",
      "epinard"
    ],
    "kcal": 455,
    "proteines": 38,
    "glucides": 67,
    "lipides": 4,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Crevettes decortiquees",
        "quantite": 120,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Pates completes",
        "quantite": 80,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Epinards frais",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pates completes al dente dans l'eau bouillante salee.",
      "Saisir les crevettes 2 a 3 minutes a feu vif jusqu'a ce qu'elles soient roses.",
      "Faire tomber les epinards 2 minutes a la poele.",
      "Dresser dans un bol : pates completes, crevettes et epinards. Napper de sauce tomate mijotee avec des herbes."
    ]
  },
  {
    "id": "plat-bowl-oeufs-pommes-de-terre-salade-sauce-soja",
    "nom": "Bowl oeufs-pommes de terre, salade & sauce soja & sesame",
    "type": "plat",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "sans-porc",
      "vegetarien"
    ],
    "budget": "eco",
    "allergenes": [
      "oeuf",
      "soja",
      "gluten",
      "sesame"
    ],
    "motsCles": [
      "oeuf",
      "pomme de terre",
      "salade"
    ],
    "kcal": 360,
    "proteines": 20,
    "glucides": 43,
    "lipides": 11,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Cremerie"
      },
      {
        "nom": "Pomme de terre",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Salade verte",
        "quantite": 60,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce soja",
        "quantite": 2,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre 18 minutes a l'eau salee.",
      "Cuire les 2 oeufs (au plat ou durs, 9 minutes).",
      "Laver la salade et la couper.",
      "Dresser dans un bol : pommes de terre, oeufs et salade. Napper de sauce soja et parsemer de graines de sesame."
    ]
  },
  {
    "id": "plat-bowl-tofu-semoule-haricots-verts-yaourt-citr",
    "nom": "Bowl tofu-semoule, haricots verts & yaourt citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien"
    ],
    "budget": "eco",
    "allergenes": [
      "soja",
      "lactose",
      "gluten"
    ],
    "motsCles": [
      "tofu",
      "semoule",
      "haricot"
    ],
    "kcal": 470,
    "proteines": 31,
    "glucides": 59,
    "lipides": 13,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Tofu ferme",
        "quantite": 150,
        "unite": "g",
        "rayon": "Rayon vegetal"
      },
      {
        "nom": "Semoule",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Haricots verts",
        "quantite": 150,
        "unite": "g",
        "rayon": "Surgeles"
      },
      {
        "nom": "Yaourt nature",
        "quantite": 40,
        "unite": "g",
        "rayon": "Cremerie"
      }
    ],
    "etapes": [
      "Couvrir la semoule d'eau bouillante salee a hauteur, laisser gonfler 5 minutes et l'aerer.",
      "Eponger le tofu, le couper en des et le dorer 6 minutes en le retournant.",
      "Cuire les haricots verts 8 a 10 minutes.",
      "Dresser dans un bol : semoule, tofu et haricots verts. Servir avec une sauce yaourt-citron (yaourt, citron, sel)."
    ]
  },
  {
    "id": "plat-bowl-pois-chiches-boulgour-brocoli-curry-coc",
    "nom": "Bowl pois chiches-boulgour, brocoli & curry coco",
    "type": "plat",
    "cuisines": [
      "indienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "motsCles": [
      "pois chiche",
      "boulgour",
      "brocoli"
    ],
    "kcal": 600,
    "proteines": 24,
    "glucides": 89,
    "lipides": 16,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Pois chiches cuits",
        "quantite": 150,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Boulgour",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Brocoli",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Lait de coco",
        "quantite": 60,
        "unite": "ml",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le boulgour 12 minutes dans l'eau salee, puis l'egoutter.",
      "Rincer et rechauffer les pois chiches 3 minutes avec une pincee d'epices.",
      "Cuire le brocoli 7 minutes a la vapeur (il reste croquant).",
      "Dresser dans un bol : boulgour, pois chiches et brocoli. Mijoter 5 minutes avec le lait de coco et une cuillere de curry."
    ]
  },
  {
    "id": "plat-bowl-lentilles-quinoa-tomates-cerises-tahin-",
    "nom": "Bowl lentilles-quinoa, tomates cerises & tahin citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "sesame"
    ],
    "motsCles": [
      "lentille",
      "quinoa",
      "tomate"
    ],
    "kcal": 510,
    "proteines": 24,
    "glucides": 77,
    "lipides": 13,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Lentilles cuites",
        "quantite": 150,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Quinoa",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Tomates cerises",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Tahin (puree de sesame)",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le quinoa 12 a 14 minutes dans 2 volumes d'eau salee.",
      "Rincer et rechauffer les lentilles 3 minutes.",
      "Couper les tomates cerises en deux.",
      "Dresser dans un bol : quinoa, lentilles et tomates cerises. Napper de sauce tahin-citron (tahin, citron, un peu d'eau)."
    ]
  },
  {
    "id": "plat-bowl-feta-patate-douce-courgette-pesto",
    "nom": "Bowl feta-patate douce, courgette & pesto",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose",
      "fruits-a-coque"
    ],
    "motsCles": [
      "feta",
      "patate douce",
      "courgette"
    ],
    "kcal": 475,
    "proteines": 14,
    "glucides": 51,
    "lipides": 24,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Feta",
        "quantite": 50,
        "unite": "g",
        "rayon": "Cremerie"
      },
      {
        "nom": "Patate douce",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Courgette",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Pesto",
        "quantite": 25,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Couper la patate douce en des et la rotir 20 a 25 minutes au four a 200 C.",
      "Emietter la feta sur le plat.",
      "Poeler la courgette en rondelles 5 a 6 minutes.",
      "Dresser dans un bol : patate douce, feta et courgette. Melanger avec le pesto hors du feu."
    ]
  },
  {
    "id": "plat-bowl-poulet-riz-champignons-huile-d-olive-ci",
    "nom": "Bowl poulet-riz, champignons & huile d'olive & citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "motsCles": [
      "poulet",
      "riz",
      "champignon"
    ],
    "kcal": 535,
    "proteines": 45,
    "glucides": 50,
    "lipides": 16,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Filet de poulet",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Champignons de Paris",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Huile d'olive",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le riz dans l'eau bouillante salee selon le paquet, puis l'egoutter.",
      "Couper le filet de poulet en des et le poeler 6 a 7 minutes a feu moyen-vif, jusqu'a ce qu'il soit dore et cuit a coeur.",
      "Poeler les champignons eminces 5 minutes a feu vif.",
      "Dresser dans un bol : riz, poulet et champignons. Assaisonner d'huile d'olive, de jus de citron, de sel et de poivre."
    ]
  },
  {
    "id": "plat-bowl-dinde-pates-completes-poivrons-sauce-to",
    "nom": "Bowl dinde-pates completes, poivrons & sauce tomate",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "motsCles": [
      "dinde",
      "pates",
      "poivron"
    ],
    "kcal": 525,
    "proteines": 48,
    "glucides": 72,
    "lipides": 6,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Escalope de dinde",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Pates completes",
        "quantite": 80,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Poivron",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pates completes al dente dans l'eau bouillante salee.",
      "Poeler l'escalope de dinde 4 minutes par face, puis l'emincer.",
      "Faire revenir le poivron emince 4 a 5 minutes.",
      "Dresser dans un bol : pates completes, dinde et poivrons. Napper de sauce tomate mijotee avec des herbes."
    ]
  },
  {
    "id": "plat-bowl-boeuf-pommes-de-terre-carottes-sauce-so",
    "nom": "Bowl boeuf-pommes de terre, carottes & sauce soja & sesame",
    "type": "plat",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "soja",
      "gluten",
      "sesame"
    ],
    "motsCles": [
      "boeuf",
      "pomme de terre",
      "carotte"
    ],
    "kcal": 415,
    "proteines": 37,
    "glucides": 49,
    "lipides": 8,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Boeuf hache 5%",
        "quantite": 120,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Pomme de terre",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Carotte",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce soja",
        "quantite": 2,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre 18 minutes a l'eau salee.",
      "Saisir le boeuf hache 5 minutes a feu vif en l'emiettant ; assaisonner.",
      "Rapper ou cuire la carotte en rondelles.",
      "Dresser dans un bol : pommes de terre, boeuf et carottes. Napper de sauce soja et parsemer de graines de sesame."
    ]
  },
  {
    "id": "plat-bowl-saumon-semoule-epinards-yaourt-citron",
    "nom": "Bowl saumon-semoule, epinards & yaourt citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson",
      "lactose",
      "gluten"
    ],
    "motsCles": [
      "saumon",
      "semoule",
      "epinard"
    ],
    "kcal": 520,
    "proteines": 45,
    "glucides": 49,
    "lipides": 16,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Pave de saumon",
        "quantite": 130,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Semoule",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Epinards frais",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Yaourt nature",
        "quantite": 40,
        "unite": "g",
        "rayon": "Cremerie"
      }
    ],
    "etapes": [
      "Couvrir la semoule d'eau bouillante salee a hauteur, laisser gonfler 5 minutes et l'aerer.",
      "Poeler le saumon 4 minutes cote peau puis 2 a 3 minutes de l'autre cote.",
      "Faire tomber les epinards 2 minutes a la poele.",
      "Dresser dans un bol : semoule, saumon et epinards. Servir avec une sauce yaourt-citron (yaourt, citron, sel)."
    ]
  },
  {
    "id": "plat-bowl-cabillaud-boulgour-salade-curry-coco",
    "nom": "Bowl cabillaud-boulgour, salade & curry coco",
    "type": "plat",
    "cuisines": [
      "indienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson",
      "gluten"
    ],
    "motsCles": [
      "cabillaud",
      "boulgour",
      "salade"
    ],
    "kcal": 445,
    "proteines": 37,
    "glucides": 49,
    "lipides": 12,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Dos de cabillaud",
        "quantite": 140,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Boulgour",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Salade verte",
        "quantite": 60,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Lait de coco",
        "quantite": 60,
        "unite": "ml",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le boulgour 12 minutes dans l'eau salee, puis l'egoutter.",
      "Cuire le cabillaud 4 minutes par face a feu moyen (la chair s'effeuille).",
      "Laver la salade et la couper.",
      "Dresser dans un bol : boulgour, cabillaud et salade. Mijoter 5 minutes avec le lait de coco et une cuillere de curry."
    ]
  },
  {
    "id": "plat-bowl-thon-quinoa-haricots-verts-tahin-citron",
    "nom": "Bowl thon-quinoa, haricots verts & tahin citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "poisson",
      "sesame"
    ],
    "motsCles": [
      "thon",
      "quinoa",
      "haricot"
    ],
    "kcal": 465,
    "proteines": 40,
    "glucides": 50,
    "lipides": 13,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Thon au naturel",
        "quantite": 100,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Quinoa",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Haricots verts",
        "quantite": 150,
        "unite": "g",
        "rayon": "Surgeles"
      },
      {
        "nom": "Tahin (puree de sesame)",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le quinoa 12 a 14 minutes dans 2 volumes d'eau salee.",
      "Egoutter le thon et l'emietter.",
      "Cuire les haricots verts 8 a 10 minutes.",
      "Dresser dans un bol : quinoa, thon et haricots verts. Napper de sauce tahin-citron (tahin, citron, un peu d'eau)."
    ]
  },
  {
    "id": "plat-bowl-crevettes-patate-douce-brocoli-pesto",
    "nom": "Bowl crevettes-patate douce, brocoli & pesto",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "crustaces",
      "lactose",
      "fruits-a-coque"
    ],
    "motsCles": [
      "crevette",
      "patate douce",
      "brocoli"
    ],
    "kcal": 460,
    "proteines": 31,
    "glucides": 51,
    "lipides": 15,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Crevettes decortiquees",
        "quantite": 120,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Patate douce",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Brocoli",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Pesto",
        "quantite": 25,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Couper la patate douce en des et la rotir 20 a 25 minutes au four a 200 C.",
      "Saisir les crevettes 2 a 3 minutes a feu vif jusqu'a ce qu'elles soient roses.",
      "Cuire le brocoli 7 minutes a la vapeur (il reste croquant).",
      "Dresser dans un bol : patate douce, crevettes et brocoli. Melanger avec le pesto hors du feu."
    ]
  },
  {
    "id": "plat-bowl-oeufs-riz-tomates-cerises-huile-d-olive",
    "nom": "Bowl oeufs-riz, tomates cerises & huile d'olive & citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "oeuf"
    ],
    "motsCles": [
      "oeuf",
      "riz",
      "tomate"
    ],
    "kcal": 480,
    "proteines": 18,
    "glucides": 53,
    "lipides": 21,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Cremerie"
      },
      {
        "nom": "Riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Tomates cerises",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Huile d'olive",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le riz dans l'eau bouillante salee selon le paquet, puis l'egoutter.",
      "Cuire les 2 oeufs (au plat ou durs, 9 minutes).",
      "Couper les tomates cerises en deux.",
      "Dresser dans un bol : riz, oeufs et tomates cerises. Assaisonner d'huile d'olive, de jus de citron, de sel et de poivre."
    ]
  },
  {
    "id": "plat-bowl-tofu-pates-completes-courgette-sauce-to",
    "nom": "Bowl tofu-pates completes, courgette & sauce tomate",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan"
    ],
    "budget": "eco",
    "allergenes": [
      "soja",
      "gluten"
    ],
    "motsCles": [
      "tofu",
      "pates",
      "courgette"
    ],
    "kcal": 545,
    "proteines": 33,
    "glucides": 75,
    "lipides": 14,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Tofu ferme",
        "quantite": 150,
        "unite": "g",
        "rayon": "Rayon vegetal"
      },
      {
        "nom": "Pates completes",
        "quantite": 80,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Courgette",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pates completes al dente dans l'eau bouillante salee.",
      "Eponger le tofu, le couper en des et le dorer 6 minutes en le retournant.",
      "Poeler la courgette en rondelles 5 a 6 minutes.",
      "Dresser dans un bol : pates completes, tofu et courgette. Napper de sauce tomate mijotee avec des herbes."
    ]
  },
  {
    "id": "plat-bowl-pois-chiches-pommes-de-terre-champignon",
    "nom": "Bowl pois chiches-pommes de terre, champignons & sauce soja & sesame",
    "type": "plat",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan"
    ],
    "budget": "eco",
    "allergenes": [
      "soja",
      "gluten",
      "sesame"
    ],
    "motsCles": [
      "pois chiche",
      "pomme de terre",
      "champignon"
    ],
    "kcal": 455,
    "proteines": 21,
    "glucides": 78,
    "lipides": 5,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Pois chiches cuits",
        "quantite": 150,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Pomme de terre",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Champignons de Paris",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce soja",
        "quantite": 2,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre 18 minutes a l'eau salee.",
      "Rincer et rechauffer les pois chiches 3 minutes avec une pincee d'epices.",
      "Poeler les champignons eminces 5 minutes a feu vif.",
      "Dresser dans un bol : pommes de terre, pois chiches et champignons. Napper de sauce soja et parsemer de graines de sesame."
    ]
  },
  {
    "id": "plat-bowl-lentilles-semoule-poivrons-yaourt-citro",
    "nom": "Bowl lentilles-semoule, poivrons & yaourt citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose",
      "gluten"
    ],
    "motsCles": [
      "lentille",
      "semoule",
      "poivron"
    ],
    "kcal": 455,
    "proteines": 23,
    "glucides": 84,
    "lipides": 3,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Lentilles cuites",
        "quantite": 150,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Semoule",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Poivron",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Yaourt nature",
        "quantite": 40,
        "unite": "g",
        "rayon": "Cremerie"
      }
    ],
    "etapes": [
      "Couvrir la semoule d'eau bouillante salee a hauteur, laisser gonfler 5 minutes et l'aerer.",
      "Rincer et rechauffer les lentilles 3 minutes.",
      "Faire revenir le poivron emince 4 a 5 minutes.",
      "Dresser dans un bol : semoule, lentilles et poivrons. Servir avec une sauce yaourt-citron (yaourt, citron, sel)."
    ]
  },
  {
    "id": "plat-bowl-feta-boulgour-carottes-curry-coco",
    "nom": "Bowl feta-boulgour, carottes & curry coco",
    "type": "plat",
    "cuisines": [
      "indienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose",
      "gluten"
    ],
    "motsCles": [
      "feta",
      "boulgour",
      "carotte"
    ],
    "kcal": 490,
    "proteines": 16,
    "glucides": 57,
    "lipides": 22,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Feta",
        "quantite": 50,
        "unite": "g",
        "rayon": "Cremerie"
      },
      {
        "nom": "Boulgour",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Carotte",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Lait de coco",
        "quantite": 60,
        "unite": "ml",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le boulgour 12 minutes dans l'eau salee, puis l'egoutter.",
      "Emietter la feta sur le plat.",
      "Rapper ou cuire la carotte en rondelles.",
      "Dresser dans un bol : boulgour, feta et carottes. Mijoter 5 minutes avec le lait de coco et une cuillere de curry."
    ]
  },
  {
    "id": "plat-bowl-poulet-quinoa-epinards-tahin-citron",
    "nom": "Bowl poulet-quinoa, epinards & tahin citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "sesame"
    ],
    "motsCles": [
      "poulet",
      "quinoa",
      "epinard"
    ],
    "kcal": 535,
    "proteines": 52,
    "glucides": 44,
    "lipides": 17,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Filet de poulet",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Quinoa",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Epinards frais",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Tahin (puree de sesame)",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le quinoa 12 a 14 minutes dans 2 volumes d'eau salee.",
      "Couper le filet de poulet en des et le poeler 6 a 7 minutes a feu moyen-vif, jusqu'a ce qu'il soit dore et cuit a coeur.",
      "Faire tomber les epinards 2 minutes a la poele.",
      "Dresser dans un bol : quinoa, poulet et epinards. Napper de sauce tahin-citron (tahin, citron, un peu d'eau)."
    ]
  },
  {
    "id": "plat-bowl-dinde-patate-douce-salade-pesto",
    "nom": "Bowl dinde-patate douce, salade & pesto",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose",
      "fruits-a-coque"
    ],
    "motsCles": [
      "dinde",
      "patate douce",
      "salade"
    ],
    "kcal": 485,
    "proteines": 40,
    "glucides": 46,
    "lipides": 16,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Escalope de dinde",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Patate douce",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Salade verte",
        "quantite": 60,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Pesto",
        "quantite": 25,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Couper la patate douce en des et la rotir 20 a 25 minutes au four a 200 C.",
      "Poeler l'escalope de dinde 4 minutes par face, puis l'emincer.",
      "Laver la salade et la couper.",
      "Dresser dans un bol : patate douce, dinde et salade. Melanger avec le pesto hors du feu."
    ]
  },
  {
    "id": "plat-bowl-boeuf-riz-haricots-verts-huile-d-olive-",
    "nom": "Bowl boeuf-riz, haricots verts & huile d'olive & citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "motsCles": [
      "boeuf",
      "riz",
      "haricot"
    ],
    "kcal": 530,
    "proteines": 37,
    "glucides": 55,
    "lipides": 18,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Boeuf hache 5%",
        "quantite": 120,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Haricots verts",
        "quantite": 150,
        "unite": "g",
        "rayon": "Surgeles"
      },
      {
        "nom": "Huile d'olive",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le riz dans l'eau bouillante salee selon le paquet, puis l'egoutter.",
      "Saisir le boeuf hache 5 minutes a feu vif en l'emiettant ; assaisonner.",
      "Cuire les haricots verts 8 a 10 minutes.",
      "Dresser dans un bol : riz, boeuf et haricots verts. Assaisonner d'huile d'olive, de jus de citron, de sel et de poivre."
    ]
  },
  {
    "id": "plat-bowl-saumon-pates-completes-brocoli-sauce-to",
    "nom": "Bowl saumon-pates completes, brocoli & sauce tomate",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson",
      "gluten"
    ],
    "motsCles": [
      "saumon",
      "pates",
      "brocoli"
    ],
    "kcal": 630,
    "proteines": 49,
    "glucides": 72,
    "lipides": 18,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Pave de saumon",
        "quantite": 130,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Pates completes",
        "quantite": 80,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Brocoli",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pates completes al dente dans l'eau bouillante salee.",
      "Poeler le saumon 4 minutes cote peau puis 2 a 3 minutes de l'autre cote.",
      "Cuire le brocoli 7 minutes a la vapeur (il reste croquant).",
      "Dresser dans un bol : pates completes, saumon et brocoli. Napper de sauce tomate mijotee avec des herbes."
    ]
  },
  {
    "id": "plat-bowl-thon-semoule-courgette-yaourt-citron",
    "nom": "Bowl thon-semoule, courgette & yaourt citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "poisson",
      "lactose",
      "gluten"
    ],
    "motsCles": [
      "thon",
      "semoule",
      "courgette"
    ],
    "kcal": 390,
    "proteines": 38,
    "glucides": 53,
    "lipides": 3,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Thon au naturel",
        "quantite": 100,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Semoule",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Courgette",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Yaourt nature",
        "quantite": 40,
        "unite": "g",
        "rayon": "Cremerie"
      }
    ],
    "etapes": [
      "Couvrir la semoule d'eau bouillante salee a hauteur, laisser gonfler 5 minutes et l'aerer.",
      "Egoutter le thon et l'emietter.",
      "Poeler la courgette en rondelles 5 a 6 minutes.",
      "Dresser dans un bol : semoule, thon et courgette. Servir avec une sauce yaourt-citron (yaourt, citron, sel)."
    ]
  },
  {
    "id": "plat-bowl-crevettes-boulgour-champignons-curry-co",
    "nom": "Bowl crevettes-boulgour, champignons & curry coco",
    "type": "plat",
    "cuisines": [
      "indienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "crustaces",
      "gluten"
    ],
    "motsCles": [
      "crevette",
      "boulgour",
      "champignon"
    ],
    "kcal": 450,
    "proteines": 33,
    "glucides": 50,
    "lipides": 12,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Crevettes decortiquees",
        "quantite": 120,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Boulgour",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Champignons de Paris",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Lait de coco",
        "quantite": 60,
        "unite": "ml",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le boulgour 12 minutes dans l'eau salee, puis l'egoutter.",
      "Saisir les crevettes 2 a 3 minutes a feu vif jusqu'a ce qu'elles soient roses.",
      "Poeler les champignons eminces 5 minutes a feu vif.",
      "Dresser dans un bol : boulgour, crevettes et champignons. Mijoter 5 minutes avec le lait de coco et une cuillere de curry."
    ]
  },
  {
    "id": "plat-bowl-oeufs-quinoa-poivrons-tahin-citron",
    "nom": "Bowl oeufs-quinoa, poivrons & tahin citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "oeuf",
      "sesame"
    ],
    "motsCles": [
      "oeuf",
      "quinoa",
      "poivron"
    ],
    "kcal": 495,
    "proteines": 25,
    "glucides": 50,
    "lipides": 22,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Cremerie"
      },
      {
        "nom": "Quinoa",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Poivron",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Tahin (puree de sesame)",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le quinoa 12 a 14 minutes dans 2 volumes d'eau salee.",
      "Cuire les 2 oeufs (au plat ou durs, 9 minutes).",
      "Faire revenir le poivron emince 4 a 5 minutes.",
      "Dresser dans un bol : quinoa, oeufs et poivrons. Napper de sauce tahin-citron (tahin, citron, un peu d'eau)."
    ]
  },
  {
    "id": "plat-bowl-tofu-patate-douce-carottes-pesto",
    "nom": "Bowl tofu-patate douce, carottes & pesto",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "soja",
      "lactose",
      "fruits-a-coque"
    ],
    "motsCles": [
      "tofu",
      "patate douce",
      "carotte"
    ],
    "kcal": 530,
    "proteines": 24,
    "glucides": 57,
    "lipides": 24,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Tofu ferme",
        "quantite": 150,
        "unite": "g",
        "rayon": "Rayon vegetal"
      },
      {
        "nom": "Patate douce",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Carotte",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Pesto",
        "quantite": 25,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Couper la patate douce en des et la rotir 20 a 25 minutes au four a 200 C.",
      "Eponger le tofu, le couper en des et le dorer 6 minutes en le retournant.",
      "Rapper ou cuire la carotte en rondelles.",
      "Dresser dans un bol : patate douce, tofu et carottes. Melanger avec le pesto hors du feu."
    ]
  },
  {
    "id": "plat-bowl-pois-chiches-riz-epinards-huile-d-olive",
    "nom": "Bowl pois chiches-riz, epinards & huile d'olive & citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "motsCles": [
      "pois chiche",
      "riz",
      "epinard"
    ],
    "kcal": 560,
    "proteines": 19,
    "glucides": 84,
    "lipides": 15,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Pois chiches cuits",
        "quantite": 150,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Epinards frais",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Huile d'olive",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le riz dans l'eau bouillante salee selon le paquet, puis l'egoutter.",
      "Rincer et rechauffer les pois chiches 3 minutes avec une pincee d'epices.",
      "Faire tomber les epinards 2 minutes a la poele.",
      "Dresser dans un bol : riz, pois chiches et epinards. Assaisonner d'huile d'olive, de jus de citron, de sel et de poivre."
    ]
  },
  {
    "id": "plat-bowl-lentilles-pates-completes-salade-sauce-",
    "nom": "Bowl lentilles-pates completes, salade & sauce tomate",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "motsCles": [
      "lentille",
      "pates",
      "salade"
    ],
    "kcal": 520,
    "proteines": 26,
    "glucides": 97,
    "lipides": 4,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Lentilles cuites",
        "quantite": 150,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Pates completes",
        "quantite": 80,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Salade verte",
        "quantite": 60,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pates completes al dente dans l'eau bouillante salee.",
      "Rincer et rechauffer les lentilles 3 minutes.",
      "Laver la salade et la couper.",
      "Dresser dans un bol : pates completes, lentilles et salade. Napper de sauce tomate mijotee avec des herbes."
    ]
  },
  {
    "id": "plat-bowl-feta-pommes-de-terre-haricots-verts-sau",
    "nom": "Bowl feta-pommes de terre, haricots verts & sauce soja & sesame",
    "type": "plat",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "sans-porc",
      "vegetarien"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose",
      "soja",
      "gluten",
      "sesame"
    ],
    "motsCles": [
      "feta",
      "pomme de terre",
      "haricot"
    ],
    "kcal": 370,
    "proteines": 16,
    "glucides": 49,
    "lipides": 12,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Feta",
        "quantite": 50,
        "unite": "g",
        "rayon": "Cremerie"
      },
      {
        "nom": "Pomme de terre",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Haricots verts",
        "quantite": 150,
        "unite": "g",
        "rayon": "Surgeles"
      },
      {
        "nom": "Sauce soja",
        "quantite": 2,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre 18 minutes a l'eau salee.",
      "Emietter la feta sur le plat.",
      "Cuire les haricots verts 8 a 10 minutes.",
      "Dresser dans un bol : pommes de terre, feta et haricots verts. Napper de sauce soja et parsemer de graines de sesame."
    ]
  },
  {
    "id": "plat-bowl-poulet-semoule-brocoli-yaourt-citron",
    "nom": "Bowl poulet-semoule, brocoli & yaourt citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose",
      "gluten"
    ],
    "motsCles": [
      "poulet",
      "semoule",
      "brocoli"
    ],
    "kcal": 495,
    "proteines": 52,
    "glucides": 54,
    "lipides": 8,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Filet de poulet",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Semoule",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Brocoli",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Yaourt nature",
        "quantite": 40,
        "unite": "g",
        "rayon": "Cremerie"
      }
    ],
    "etapes": [
      "Couvrir la semoule d'eau bouillante salee a hauteur, laisser gonfler 5 minutes et l'aerer.",
      "Couper le filet de poulet en des et le poeler 6 a 7 minutes a feu moyen-vif, jusqu'a ce qu'il soit dore et cuit a coeur.",
      "Cuire le brocoli 7 minutes a la vapeur (il reste croquant).",
      "Dresser dans un bol : semoule, poulet et brocoli. Servir avec une sauce yaourt-citron (yaourt, citron, sel)."
    ]
  },
  {
    "id": "plat-bowl-dinde-boulgour-tomates-cerises-curry-co",
    "nom": "Bowl dinde-boulgour, tomates cerises & curry coco",
    "type": "plat",
    "cuisines": [
      "indienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "motsCles": [
      "dinde",
      "boulgour",
      "tomate"
    ],
    "kcal": 505,
    "proteines": 43,
    "glucides": 52,
    "lipides": 14,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Escalope de dinde",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Boulgour",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Tomates cerises",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Lait de coco",
        "quantite": 60,
        "unite": "ml",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le boulgour 12 minutes dans l'eau salee, puis l'egoutter.",
      "Poeler l'escalope de dinde 4 minutes par face, puis l'emincer.",
      "Couper les tomates cerises en deux.",
      "Dresser dans un bol : boulgour, dinde et tomates cerises. Mijoter 5 minutes avec le lait de coco et une cuillere de curry."
    ]
  },
  {
    "id": "plat-bowl-boeuf-quinoa-courgette-tahin-citron",
    "nom": "Bowl boeuf-quinoa, courgette & tahin citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "sesame"
    ],
    "motsCles": [
      "boeuf",
      "quinoa",
      "courgette"
    ],
    "kcal": 525,
    "proteines": 43,
    "glucides": 48,
    "lipides": 19,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Boeuf hache 5%",
        "quantite": 120,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Quinoa",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Courgette",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Tahin (puree de sesame)",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le quinoa 12 a 14 minutes dans 2 volumes d'eau salee.",
      "Saisir le boeuf hache 5 minutes a feu vif en l'emiettant ; assaisonner.",
      "Poeler la courgette en rondelles 5 a 6 minutes.",
      "Dresser dans un bol : quinoa, boeuf et courgette. Napper de sauce tahin-citron (tahin, citron, un peu d'eau)."
    ]
  },
  {
    "id": "plat-bowl-saumon-patate-douce-champignons-pesto",
    "nom": "Bowl saumon-patate douce, champignons & pesto",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson",
      "lactose",
      "fruits-a-coque"
    ],
    "motsCles": [
      "saumon",
      "patate douce",
      "champignon"
    ],
    "kcal": 590,
    "proteines": 40,
    "glucides": 47,
    "lipides": 27,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Pave de saumon",
        "quantite": 130,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Patate douce",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Champignons de Paris",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Pesto",
        "quantite": 25,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Couper la patate douce en des et la rotir 20 a 25 minutes au four a 200 C.",
      "Poeler le saumon 4 minutes cote peau puis 2 a 3 minutes de l'autre cote.",
      "Poeler les champignons eminces 5 minutes a feu vif.",
      "Dresser dans un bol : patate douce, saumon et champignons. Melanger avec le pesto hors du feu."
    ]
  },
  {
    "id": "plat-bowl-cabillaud-riz-poivrons-huile-d-olive-ci",
    "nom": "Bowl cabillaud-riz, poivrons & huile d'olive & citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson"
    ],
    "motsCles": [
      "cabillaud",
      "riz",
      "poivron"
    ],
    "kcal": 450,
    "proteines": 33,
    "glucides": 54,
    "lipides": 12,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Dos de cabillaud",
        "quantite": 140,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Poivron",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Huile d'olive",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le riz dans l'eau bouillante salee selon le paquet, puis l'egoutter.",
      "Cuire le cabillaud 4 minutes par face a feu moyen (la chair s'effeuille).",
      "Faire revenir le poivron emince 4 a 5 minutes.",
      "Dresser dans un bol : riz, cabillaud et poivrons. Assaisonner d'huile d'olive, de jus de citron, de sel et de poivre."
    ]
  },
  {
    "id": "plat-bowl-thon-pates-completes-carottes-sauce-tom",
    "nom": "Bowl thon-pates completes, carottes & sauce tomate",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "poisson",
      "gluten"
    ],
    "motsCles": [
      "thon",
      "pates",
      "carotte"
    ],
    "kcal": 480,
    "proteines": 40,
    "glucides": 74,
    "lipides": 4,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Thon au naturel",
        "quantite": 100,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Pates completes",
        "quantite": 80,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Carotte",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pates completes al dente dans l'eau bouillante salee.",
      "Egoutter le thon et l'emietter.",
      "Rapper ou cuire la carotte en rondelles.",
      "Dresser dans un bol : pates completes, thon et carottes. Napper de sauce tomate mijotee avec des herbes."
    ]
  },
  {
    "id": "plat-bowl-oeufs-semoule-salade-yaourt-citron",
    "nom": "Bowl oeufs-semoule, salade & yaourt citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien"
    ],
    "budget": "eco",
    "allergenes": [
      "oeuf",
      "lactose",
      "gluten"
    ],
    "motsCles": [
      "oeuf",
      "semoule",
      "salade"
    ],
    "kcal": 410,
    "proteines": 24,
    "glucides": 50,
    "lipides": 12,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Cremerie"
      },
      {
        "nom": "Semoule",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Salade verte",
        "quantite": 60,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Yaourt nature",
        "quantite": 40,
        "unite": "g",
        "rayon": "Cremerie"
      }
    ],
    "etapes": [
      "Couvrir la semoule d'eau bouillante salee a hauteur, laisser gonfler 5 minutes et l'aerer.",
      "Cuire les 2 oeufs (au plat ou durs, 9 minutes).",
      "Laver la salade et la couper.",
      "Dresser dans un bol : semoule, oeufs et salade. Servir avec une sauce yaourt-citron (yaourt, citron, sel)."
    ]
  },
  {
    "id": "plat-bowl-tofu-boulgour-haricots-verts-curry-coco",
    "nom": "Bowl tofu-boulgour, haricots verts & curry coco",
    "type": "plat",
    "cuisines": [
      "indienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan"
    ],
    "budget": "eco",
    "allergenes": [
      "soja",
      "gluten"
    ],
    "motsCles": [
      "tofu",
      "boulgour",
      "haricot"
    ],
    "kcal": 545,
    "proteines": 29,
    "glucides": 59,
    "lipides": 22,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Tofu ferme",
        "quantite": 150,
        "unite": "g",
        "rayon": "Rayon vegetal"
      },
      {
        "nom": "Boulgour",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Haricots verts",
        "quantite": 150,
        "unite": "g",
        "rayon": "Surgeles"
      },
      {
        "nom": "Lait de coco",
        "quantite": 60,
        "unite": "ml",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le boulgour 12 minutes dans l'eau salee, puis l'egoutter.",
      "Eponger le tofu, le couper en des et le dorer 6 minutes en le retournant.",
      "Cuire les haricots verts 8 a 10 minutes.",
      "Dresser dans un bol : boulgour, tofu et haricots verts. Mijoter 5 minutes avec le lait de coco et une cuillere de curry."
    ]
  },
  {
    "id": "plat-bowl-pois-chiches-quinoa-brocoli-tahin-citro",
    "nom": "Bowl pois chiches-quinoa, brocoli & tahin citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "sesame"
    ],
    "motsCles": [
      "pois chiche",
      "quinoa",
      "brocoli"
    ],
    "kcal": 590,
    "proteines": 27,
    "glucides": 84,
    "lipides": 17,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Pois chiches cuits",
        "quantite": 150,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Quinoa",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Brocoli",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Tahin (puree de sesame)",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le quinoa 12 a 14 minutes dans 2 volumes d'eau salee.",
      "Rincer et rechauffer les pois chiches 3 minutes avec une pincee d'epices.",
      "Cuire le brocoli 7 minutes a la vapeur (il reste croquant).",
      "Dresser dans un bol : quinoa, pois chiches et brocoli. Napper de sauce tahin-citron (tahin, citron, un peu d'eau)."
    ]
  },
  {
    "id": "plat-bowl-lentilles-patate-douce-tomates-cerises-",
    "nom": "Bowl lentilles-patate douce, tomates cerises & pesto",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose",
      "fruits-a-coque"
    ],
    "motsCles": [
      "lentille",
      "patate douce",
      "tomate"
    ],
    "kcal": 510,
    "proteines": 18,
    "glucides": 79,
    "lipides": 14,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Lentilles cuites",
        "quantite": 150,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Patate douce",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Tomates cerises",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Pesto",
        "quantite": 25,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Couper la patate douce en des et la rotir 20 a 25 minutes au four a 200 C.",
      "Rincer et rechauffer les lentilles 3 minutes.",
      "Couper les tomates cerises en deux.",
      "Dresser dans un bol : patate douce, lentilles et tomates cerises. Melanger avec le pesto hors du feu."
    ]
  },
  {
    "id": "plat-bowl-feta-riz-courgette-huile-d-olive-citron",
    "nom": "Bowl feta-riz, courgette & huile d'olive & citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose"
    ],
    "motsCles": [
      "feta",
      "riz",
      "courgette"
    ],
    "kcal": 470,
    "proteines": 13,
    "glucides": 54,
    "lipides": 22,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Feta",
        "quantite": 50,
        "unite": "g",
        "rayon": "Cremerie"
      },
      {
        "nom": "Riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Courgette",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Huile d'olive",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le riz dans l'eau bouillante salee selon le paquet, puis l'egoutter.",
      "Emietter la feta sur le plat.",
      "Poeler la courgette en rondelles 5 a 6 minutes.",
      "Dresser dans un bol : riz, feta et courgette. Assaisonner d'huile d'olive, de jus de citron, de sel et de poivre."
    ]
  },
  {
    "id": "plat-bowl-poulet-pates-completes-champignons-sauc",
    "nom": "Bowl poulet-pates completes, champignons & sauce tomate",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "motsCles": [
      "poulet",
      "pates",
      "champignon"
    ],
    "kcal": 560,
    "proteines": 54,
    "glucides": 68,
    "lipides": 8,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Filet de poulet",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Pates completes",
        "quantite": 80,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Champignons de Paris",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pates completes al dente dans l'eau bouillante salee.",
      "Couper le filet de poulet en des et le poeler 6 a 7 minutes a feu moyen-vif, jusqu'a ce qu'il soit dore et cuit a coeur.",
      "Poeler les champignons eminces 5 minutes a feu vif.",
      "Dresser dans un bol : pates completes, poulet et champignons. Napper de sauce tomate mijotee avec des herbes."
    ]
  },
  {
    "id": "plat-bowl-dinde-pommes-de-terre-poivrons-sauce-so",
    "nom": "Bowl dinde-pommes de terre, poivrons & sauce soja & sesame",
    "type": "plat",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "soja",
      "gluten",
      "sesame"
    ],
    "motsCles": [
      "dinde",
      "pomme de terre",
      "poivron"
    ],
    "kcal": 390,
    "proteines": 41,
    "glucides": 47,
    "lipides": 4,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Escalope de dinde",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Pomme de terre",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Poivron",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce soja",
        "quantite": 2,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre 18 minutes a l'eau salee.",
      "Poeler l'escalope de dinde 4 minutes par face, puis l'emincer.",
      "Faire revenir le poivron emince 4 a 5 minutes.",
      "Dresser dans un bol : pommes de terre, dinde et poivrons. Napper de sauce soja et parsemer de graines de sesame."
    ]
  },
  {
    "id": "plat-bowl-boeuf-semoule-carottes-yaourt-citron",
    "nom": "Bowl boeuf-semoule, carottes & yaourt citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose",
      "gluten"
    ],
    "motsCles": [
      "boeuf",
      "semoule",
      "carotte"
    ],
    "kcal": 465,
    "proteines": 41,
    "glucides": 56,
    "lipides": 9,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Boeuf hache 5%",
        "quantite": 120,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Semoule",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Carotte",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Yaourt nature",
        "quantite": 40,
        "unite": "g",
        "rayon": "Cremerie"
      }
    ],
    "etapes": [
      "Couvrir la semoule d'eau bouillante salee a hauteur, laisser gonfler 5 minutes et l'aerer.",
      "Saisir le boeuf hache 5 minutes a feu vif en l'emiettant ; assaisonner.",
      "Rapper ou cuire la carotte en rondelles.",
      "Dresser dans un bol : semoule, boeuf et carottes. Servir avec une sauce yaourt-citron (yaourt, citron, sel)."
    ]
  },
  {
    "id": "plat-bowl-saumon-boulgour-epinards-curry-coco",
    "nom": "Bowl saumon-boulgour, epinards & curry coco",
    "type": "plat",
    "cuisines": [
      "indienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson",
      "gluten"
    ],
    "motsCles": [
      "saumon",
      "boulgour",
      "epinard"
    ],
    "kcal": 595,
    "proteines": 43,
    "glucides": 49,
    "lipides": 25,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Pave de saumon",
        "quantite": 130,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Boulgour",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Epinards frais",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Lait de coco",
        "quantite": 60,
        "unite": "ml",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le boulgour 12 minutes dans l'eau salee, puis l'egoutter.",
      "Poeler le saumon 4 minutes cote peau puis 2 a 3 minutes de l'autre cote.",
      "Faire tomber les epinards 2 minutes a la poele.",
      "Dresser dans un bol : boulgour, saumon et epinards. Mijoter 5 minutes avec le lait de coco et une cuillere de curry."
    ]
  },
  {
    "id": "plat-bowl-cabillaud-quinoa-salade-tahin-citron",
    "nom": "Bowl cabillaud-quinoa, salade & tahin citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson",
      "sesame"
    ],
    "motsCles": [
      "cabillaud",
      "quinoa",
      "salade"
    ],
    "kcal": 435,
    "proteines": 40,
    "glucides": 44,
    "lipides": 13,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Dos de cabillaud",
        "quantite": 140,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Quinoa",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Salade verte",
        "quantite": 60,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Tahin (puree de sesame)",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le quinoa 12 a 14 minutes dans 2 volumes d'eau salee.",
      "Cuire le cabillaud 4 minutes par face a feu moyen (la chair s'effeuille).",
      "Laver la salade et la couper.",
      "Dresser dans un bol : quinoa, cabillaud et salade. Napper de sauce tahin-citron (tahin, citron, un peu d'eau)."
    ]
  },
  {
    "id": "plat-bowl-thon-patate-douce-haricots-verts-pesto",
    "nom": "Bowl thon-patate douce, haricots verts & pesto",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "poisson",
      "lactose",
      "fruits-a-coque"
    ],
    "motsCles": [
      "thon",
      "patate douce",
      "haricot"
    ],
    "kcal": 465,
    "proteines": 34,
    "glucides": 52,
    "lipides": 14,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Thon au naturel",
        "quantite": 100,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Patate douce",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Haricots verts",
        "quantite": 150,
        "unite": "g",
        "rayon": "Surgeles"
      },
      {
        "nom": "Pesto",
        "quantite": 25,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Couper la patate douce en des et la rotir 20 a 25 minutes au four a 200 C.",
      "Egoutter le thon et l'emietter.",
      "Cuire les haricots verts 8 a 10 minutes.",
      "Dresser dans un bol : patate douce, thon et haricots verts. Melanger avec le pesto hors du feu."
    ]
  },
  {
    "id": "plat-bowl-crevettes-riz-brocoli-huile-d-olive-cit",
    "nom": "Bowl crevettes-riz, brocoli & huile d'olive & citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "crustaces"
    ],
    "motsCles": [
      "crevette",
      "riz",
      "brocoli"
    ],
    "kcal": 455,
    "proteines": 30,
    "glucides": 54,
    "lipides": 13,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Crevettes decortiquees",
        "quantite": 120,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Brocoli",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Huile d'olive",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le riz dans l'eau bouillante salee selon le paquet, puis l'egoutter.",
      "Saisir les crevettes 2 a 3 minutes a feu vif jusqu'a ce qu'elles soient roses.",
      "Cuire le brocoli 7 minutes a la vapeur (il reste croquant).",
      "Dresser dans un bol : riz, crevettes et brocoli. Assaisonner d'huile d'olive, de jus de citron, de sel et de poivre."
    ]
  },
  {
    "id": "plat-bowl-oeufs-pates-completes-tomates-cerises-s",
    "nom": "Bowl oeufs-pates completes, tomates cerises & sauce tomate",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien"
    ],
    "budget": "eco",
    "allergenes": [
      "oeuf",
      "gluten"
    ],
    "motsCles": [
      "oeuf",
      "pates",
      "tomate"
    ],
    "kcal": 505,
    "proteines": 27,
    "glucides": 71,
    "lipides": 13,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Cremerie"
      },
      {
        "nom": "Pates completes",
        "quantite": 80,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Tomates cerises",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pates completes al dente dans l'eau bouillante salee.",
      "Cuire les 2 oeufs (au plat ou durs, 9 minutes).",
      "Couper les tomates cerises en deux.",
      "Dresser dans un bol : pates completes, oeufs et tomates cerises. Napper de sauce tomate mijotee avec des herbes."
    ]
  },
  {
    "id": "plat-bowl-tofu-pommes-de-terre-courgette-sauce-so",
    "nom": "Bowl tofu-pommes de terre, courgette & sauce soja & sesame",
    "type": "plat",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan"
    ],
    "budget": "eco",
    "allergenes": [
      "soja",
      "gluten",
      "sesame"
    ],
    "motsCles": [
      "tofu",
      "pomme de terre",
      "courgette"
    ],
    "kcal": 410,
    "proteines": 26,
    "glucides": 50,
    "lipides": 12,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Tofu ferme",
        "quantite": 150,
        "unite": "g",
        "rayon": "Rayon vegetal"
      },
      {
        "nom": "Pomme de terre",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Courgette",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce soja",
        "quantite": 2,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre 18 minutes a l'eau salee.",
      "Eponger le tofu, le couper en des et le dorer 6 minutes en le retournant.",
      "Poeler la courgette en rondelles 5 a 6 minutes.",
      "Dresser dans un bol : pommes de terre, tofu et courgette. Napper de sauce soja et parsemer de graines de sesame."
    ]
  },
  {
    "id": "plat-bowl-pois-chiches-semoule-champignons-yaourt",
    "nom": "Bowl pois chiches-semoule, champignons & yaourt citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose",
      "gluten"
    ],
    "motsCles": [
      "pois chiche",
      "semoule",
      "champignon"
    ],
    "kcal": 505,
    "proteines": 25,
    "glucides": 85,
    "lipides": 6,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Pois chiches cuits",
        "quantite": 150,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Semoule",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Champignons de Paris",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Yaourt nature",
        "quantite": 40,
        "unite": "g",
        "rayon": "Cremerie"
      }
    ],
    "etapes": [
      "Couvrir la semoule d'eau bouillante salee a hauteur, laisser gonfler 5 minutes et l'aerer.",
      "Rincer et rechauffer les pois chiches 3 minutes avec une pincee d'epices.",
      "Poeler les champignons eminces 5 minutes a feu vif.",
      "Dresser dans un bol : semoule, pois chiches et champignons. Servir avec une sauce yaourt-citron (yaourt, citron, sel)."
    ]
  },
  {
    "id": "plat-bowl-lentilles-boulgour-poivrons-curry-coco",
    "nom": "Bowl lentilles-boulgour, poivrons & curry coco",
    "type": "plat",
    "cuisines": [
      "indienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "motsCles": [
      "lentille",
      "boulgour",
      "poivron"
    ],
    "kcal": 530,
    "proteines": 21,
    "glucides": 84,
    "lipides": 12,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Lentilles cuites",
        "quantite": 150,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Boulgour",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Poivron",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Lait de coco",
        "quantite": 60,
        "unite": "ml",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le boulgour 12 minutes dans l'eau salee, puis l'egoutter.",
      "Rincer et rechauffer les lentilles 3 minutes.",
      "Faire revenir le poivron emince 4 a 5 minutes.",
      "Dresser dans un bol : boulgour, lentilles et poivrons. Mijoter 5 minutes avec le lait de coco et une cuillere de curry."
    ]
  },
  {
    "id": "plat-bowl-feta-quinoa-carottes-tahin-citron",
    "nom": "Bowl feta-quinoa, carottes & tahin citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose",
      "sesame"
    ],
    "motsCles": [
      "feta",
      "quinoa",
      "carotte"
    ],
    "kcal": 480,
    "proteines": 19,
    "glucides": 52,
    "lipides": 23,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Feta",
        "quantite": 50,
        "unite": "g",
        "rayon": "Cremerie"
      },
      {
        "nom": "Quinoa",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Carotte",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Tahin (puree de sesame)",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le quinoa 12 a 14 minutes dans 2 volumes d'eau salee.",
      "Emietter la feta sur le plat.",
      "Rapper ou cuire la carotte en rondelles.",
      "Dresser dans un bol : quinoa, feta et carottes. Napper de sauce tahin-citron (tahin, citron, un peu d'eau)."
    ]
  },
  {
    "id": "plat-bowl-poulet-patate-douce-epinards-pesto",
    "nom": "Bowl poulet-patate douce, epinards & pesto",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose",
      "fruits-a-coque"
    ],
    "motsCles": [
      "poulet",
      "patate douce",
      "epinard"
    ],
    "kcal": 535,
    "proteines": 46,
    "glucides": 46,
    "lipides": 18,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Filet de poulet",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Patate douce",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Epinards frais",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Pesto",
        "quantite": 25,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Couper la patate douce en des et la rotir 20 a 25 minutes au four a 200 C.",
      "Couper le filet de poulet en des et le poeler 6 a 7 minutes a feu moyen-vif, jusqu'a ce qu'il soit dore et cuit a coeur.",
      "Faire tomber les epinards 2 minutes a la poele.",
      "Dresser dans un bol : patate douce, poulet et epinards. Melanger avec le pesto hors du feu."
    ]
  },
  {
    "id": "plat-bowl-dinde-riz-salade-huile-d-olive-citron",
    "nom": "Bowl dinde-riz, salade & huile d'olive & citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "motsCles": [
      "dinde",
      "riz",
      "salade"
    ],
    "kcal": 480,
    "proteines": 39,
    "glucides": 49,
    "lipides": 14,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Escalope de dinde",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Salade verte",
        "quantite": 60,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Huile d'olive",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le riz dans l'eau bouillante salee selon le paquet, puis l'egoutter.",
      "Poeler l'escalope de dinde 4 minutes par face, puis l'emincer.",
      "Laver la salade et la couper.",
      "Dresser dans un bol : riz, dinde et salade. Assaisonner d'huile d'olive, de jus de citron, de sel et de poivre."
    ]
  },
  {
    "id": "plat-bowl-boeuf-pates-completes-haricots-verts-sa",
    "nom": "Bowl boeuf-pates completes, haricots verts & sauce tomate",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "motsCles": [
      "boeuf",
      "pates",
      "haricot"
    ],
    "kcal": 555,
    "proteines": 46,
    "glucides": 73,
    "lipides": 10,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Boeuf hache 5%",
        "quantite": 120,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Pates completes",
        "quantite": 80,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Haricots verts",
        "quantite": 150,
        "unite": "g",
        "rayon": "Surgeles"
      },
      {
        "nom": "Sauce tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pates completes al dente dans l'eau bouillante salee.",
      "Saisir le boeuf hache 5 minutes a feu vif en l'emiettant ; assaisonner.",
      "Cuire les haricots verts 8 a 10 minutes.",
      "Dresser dans un bol : pates completes, boeuf et haricots verts. Napper de sauce tomate mijotee avec des herbes."
    ]
  },
  {
    "id": "plat-bowl-saumon-pommes-de-terre-brocoli-sauce-so",
    "nom": "Bowl saumon-pommes de terre, brocoli & sauce soja & sesame",
    "type": "plat",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson",
      "soja",
      "gluten",
      "sesame"
    ],
    "motsCles": [
      "saumon",
      "pomme de terre",
      "brocoli"
    ],
    "kcal": 495,
    "proteines": 42,
    "glucides": 47,
    "lipides": 16,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Pave de saumon",
        "quantite": 130,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Pomme de terre",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Brocoli",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce soja",
        "quantite": 2,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre 18 minutes a l'eau salee.",
      "Poeler le saumon 4 minutes cote peau puis 2 a 3 minutes de l'autre cote.",
      "Cuire le brocoli 7 minutes a la vapeur (il reste croquant).",
      "Dresser dans un bol : pommes de terre, saumon et brocoli. Napper de sauce soja et parsemer de graines de sesame."
    ]
  },
  {
    "id": "plat-bowl-cabillaud-semoule-tomates-cerises-yaour",
    "nom": "Bowl cabillaud-semoule, tomates cerises & yaourt citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson",
      "lactose",
      "gluten"
    ],
    "motsCles": [
      "cabillaud",
      "semoule",
      "tomate"
    ],
    "kcal": 380,
    "proteines": 39,
    "glucides": 52,
    "lipides": 3,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Dos de cabillaud",
        "quantite": 140,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Semoule",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Tomates cerises",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Yaourt nature",
        "quantite": 40,
        "unite": "g",
        "rayon": "Cremerie"
      }
    ],
    "etapes": [
      "Couvrir la semoule d'eau bouillante salee a hauteur, laisser gonfler 5 minutes et l'aerer.",
      "Cuire le cabillaud 4 minutes par face a feu moyen (la chair s'effeuille).",
      "Couper les tomates cerises en deux.",
      "Dresser dans un bol : semoule, cabillaud et tomates cerises. Servir avec une sauce yaourt-citron (yaourt, citron, sel)."
    ]
  },
  {
    "id": "plat-bowl-thon-boulgour-courgette-curry-coco",
    "nom": "Bowl thon-boulgour, courgette & curry coco",
    "type": "plat",
    "cuisines": [
      "indienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "poisson",
      "gluten"
    ],
    "motsCles": [
      "thon",
      "boulgour",
      "courgette"
    ],
    "kcal": 465,
    "proteines": 36,
    "glucides": 53,
    "lipides": 12,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Thon au naturel",
        "quantite": 100,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Boulgour",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Courgette",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Lait de coco",
        "quantite": 60,
        "unite": "ml",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le boulgour 12 minutes dans l'eau salee, puis l'egoutter.",
      "Egoutter le thon et l'emietter.",
      "Poeler la courgette en rondelles 5 a 6 minutes.",
      "Dresser dans un bol : boulgour, thon et courgette. Mijoter 5 minutes avec le lait de coco et une cuillere de curry."
    ]
  },
  {
    "id": "plat-bowl-crevettes-quinoa-champignons-tahin-citr",
    "nom": "Bowl crevettes-quinoa, champignons & tahin citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "crustaces",
      "sesame"
    ],
    "motsCles": [
      "crevette",
      "quinoa",
      "champignon"
    ],
    "kcal": 440,
    "proteines": 36,
    "glucides": 45,
    "lipides": 13,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Crevettes decortiquees",
        "quantite": 120,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Quinoa",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Champignons de Paris",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Tahin (puree de sesame)",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le quinoa 12 a 14 minutes dans 2 volumes d'eau salee.",
      "Saisir les crevettes 2 a 3 minutes a feu vif jusqu'a ce qu'elles soient roses.",
      "Poeler les champignons eminces 5 minutes a feu vif.",
      "Dresser dans un bol : quinoa, crevettes et champignons. Napper de sauce tahin-citron (tahin, citron, un peu d'eau)."
    ]
  },
  {
    "id": "plat-bowl-oeufs-patate-douce-poivrons-pesto",
    "nom": "Bowl oeufs-patate douce, poivrons & pesto",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "oeuf",
      "lactose",
      "fruits-a-coque"
    ],
    "motsCles": [
      "oeuf",
      "patate douce",
      "poivron"
    ],
    "kcal": 495,
    "proteines": 19,
    "glucides": 52,
    "lipides": 23,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Cremerie"
      },
      {
        "nom": "Patate douce",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Poivron",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Pesto",
        "quantite": 25,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Couper la patate douce en des et la rotir 20 a 25 minutes au four a 200 C.",
      "Cuire les 2 oeufs (au plat ou durs, 9 minutes).",
      "Faire revenir le poivron emince 4 a 5 minutes.",
      "Dresser dans un bol : patate douce, oeufs et poivrons. Melanger avec le pesto hors du feu."
    ]
  },
  {
    "id": "plat-bowl-tofu-riz-carottes-huile-d-olive-citron",
    "nom": "Bowl tofu-riz, carottes & huile d'olive & citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "soja"
    ],
    "motsCles": [
      "tofu",
      "riz",
      "carotte"
    ],
    "kcal": 525,
    "proteines": 23,
    "glucides": 60,
    "lipides": 22,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Tofu ferme",
        "quantite": 150,
        "unite": "g",
        "rayon": "Rayon vegetal"
      },
      {
        "nom": "Riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Carotte",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Huile d'olive",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le riz dans l'eau bouillante salee selon le paquet, puis l'egoutter.",
      "Eponger le tofu, le couper en des et le dorer 6 minutes en le retournant.",
      "Rapper ou cuire la carotte en rondelles.",
      "Dresser dans un bol : riz, tofu et carottes. Assaisonner d'huile d'olive, de jus de citron, de sel et de poivre."
    ]
  },
  {
    "id": "plat-bowl-pois-chiches-pates-completes-epinards-s",
    "nom": "Bowl pois chiches-pates completes, epinards & sauce tomate",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "motsCles": [
      "pois chiche",
      "pates",
      "epinard"
    ],
    "kcal": 585,
    "proteines": 28,
    "glucides": 102,
    "lipides": 7,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Pois chiches cuits",
        "quantite": 150,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Pates completes",
        "quantite": 80,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Epinards frais",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pates completes al dente dans l'eau bouillante salee.",
      "Rincer et rechauffer les pois chiches 3 minutes avec une pincee d'epices.",
      "Faire tomber les epinards 2 minutes a la poele.",
      "Dresser dans un bol : pates completes, pois chiches et epinards. Napper de sauce tomate mijotee avec des herbes."
    ]
  },
  {
    "id": "plat-bowl-lentilles-pommes-de-terre-salade-sauce-",
    "nom": "Bowl lentilles-pommes de terre, salade & sauce soja & sesame",
    "type": "plat",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan"
    ],
    "budget": "eco",
    "allergenes": [
      "soja",
      "gluten",
      "sesame"
    ],
    "motsCles": [
      "lentille",
      "pomme de terre",
      "salade"
    ],
    "kcal": 385,
    "proteines": 19,
    "glucides": 72,
    "lipides": 2,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Lentilles cuites",
        "quantite": 150,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Pomme de terre",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Salade verte",
        "quantite": 60,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce soja",
        "quantite": 2,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre 18 minutes a l'eau salee.",
      "Rincer et rechauffer les lentilles 3 minutes.",
      "Laver la salade et la couper.",
      "Dresser dans un bol : pommes de terre, lentilles et salade. Napper de sauce soja et parsemer de graines de sesame."
    ]
  },
  {
    "id": "plat-bowl-feta-semoule-haricots-verts-yaourt-citr",
    "nom": "Bowl feta-semoule, haricots verts & yaourt citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose",
      "gluten"
    ],
    "motsCles": [
      "feta",
      "semoule",
      "haricot"
    ],
    "kcal": 420,
    "proteines": 20,
    "glucides": 56,
    "lipides": 13,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Feta",
        "quantite": 50,
        "unite": "g",
        "rayon": "Cremerie"
      },
      {
        "nom": "Semoule",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Haricots verts",
        "quantite": 150,
        "unite": "g",
        "rayon": "Surgeles"
      },
      {
        "nom": "Yaourt nature",
        "quantite": 40,
        "unite": "g",
        "rayon": "Cremerie"
      }
    ],
    "etapes": [
      "Couvrir la semoule d'eau bouillante salee a hauteur, laisser gonfler 5 minutes et l'aerer.",
      "Emietter la feta sur le plat.",
      "Cuire les haricots verts 8 a 10 minutes.",
      "Dresser dans un bol : semoule, feta et haricots verts. Servir avec une sauce yaourt-citron (yaourt, citron, sel)."
    ]
  },
  {
    "id": "plat-bowl-poulet-boulgour-brocoli-curry-coco",
    "nom": "Bowl poulet-boulgour, brocoli & curry coco",
    "type": "plat",
    "cuisines": [
      "indienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "motsCles": [
      "poulet",
      "boulgour",
      "brocoli"
    ],
    "kcal": 570,
    "proteines": 50,
    "glucides": 54,
    "lipides": 17,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Filet de poulet",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Boulgour",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Brocoli",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Lait de coco",
        "quantite": 60,
        "unite": "ml",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le boulgour 12 minutes dans l'eau salee, puis l'egoutter.",
      "Couper le filet de poulet en des et le poeler 6 a 7 minutes a feu moyen-vif, jusqu'a ce qu'il soit dore et cuit a coeur.",
      "Cuire le brocoli 7 minutes a la vapeur (il reste croquant).",
      "Dresser dans un bol : boulgour, poulet et brocoli. Mijoter 5 minutes avec le lait de coco et une cuillere de curry."
    ]
  },
  {
    "id": "plat-bowl-dinde-quinoa-tomates-cerises-tahin-citr",
    "nom": "Bowl dinde-quinoa, tomates cerises & tahin citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "sesame"
    ],
    "motsCles": [
      "dinde",
      "quinoa",
      "tomate"
    ],
    "kcal": 495,
    "proteines": 46,
    "glucides": 47,
    "lipides": 15,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Escalope de dinde",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Quinoa",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Tomates cerises",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Tahin (puree de sesame)",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le quinoa 12 a 14 minutes dans 2 volumes d'eau salee.",
      "Poeler l'escalope de dinde 4 minutes par face, puis l'emincer.",
      "Couper les tomates cerises en deux.",
      "Dresser dans un bol : quinoa, dinde et tomates cerises. Napper de sauce tahin-citron (tahin, citron, un peu d'eau)."
    ]
  },
  {
    "id": "plat-bowl-boeuf-patate-douce-courgette-pesto",
    "nom": "Bowl boeuf-patate douce, courgette & pesto",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose",
      "fruits-a-coque"
    ],
    "motsCles": [
      "boeuf",
      "patate douce",
      "courgette"
    ],
    "kcal": 525,
    "proteines": 37,
    "glucides": 50,
    "lipides": 20,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Boeuf hache 5%",
        "quantite": 120,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Patate douce",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Courgette",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Pesto",
        "quantite": 25,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Couper la patate douce en des et la rotir 20 a 25 minutes au four a 200 C.",
      "Saisir le boeuf hache 5 minutes a feu vif en l'emiettant ; assaisonner.",
      "Poeler la courgette en rondelles 5 a 6 minutes.",
      "Dresser dans un bol : patate douce, boeuf et courgette. Melanger avec le pesto hors du feu."
    ]
  },
  {
    "id": "plat-bowl-saumon-riz-champignons-huile-d-olive-ci",
    "nom": "Bowl saumon-riz, champignons & huile d'olive & citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson"
    ],
    "motsCles": [
      "saumon",
      "riz",
      "champignon"
    ],
    "kcal": 585,
    "proteines": 39,
    "glucides": 50,
    "lipides": 25,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Pave de saumon",
        "quantite": 130,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Champignons de Paris",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Huile d'olive",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le riz dans l'eau bouillante salee selon le paquet, puis l'egoutter.",
      "Poeler le saumon 4 minutes cote peau puis 2 a 3 minutes de l'autre cote.",
      "Poeler les champignons eminces 5 minutes a feu vif.",
      "Dresser dans un bol : riz, saumon et champignons. Assaisonner d'huile d'olive, de jus de citron, de sel et de poivre."
    ]
  },
  {
    "id": "plat-bowl-cabillaud-pates-completes-poivrons-sauc",
    "nom": "Bowl cabillaud-pates completes, poivrons & sauce tomate",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson",
      "gluten"
    ],
    "motsCles": [
      "cabillaud",
      "pates",
      "poivron"
    ],
    "kcal": 475,
    "proteines": 42,
    "glucides": 72,
    "lipides": 4,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Dos de cabillaud",
        "quantite": 140,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Pates completes",
        "quantite": 80,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Poivron",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pates completes al dente dans l'eau bouillante salee.",
      "Cuire le cabillaud 4 minutes par face a feu moyen (la chair s'effeuille).",
      "Faire revenir le poivron emince 4 a 5 minutes.",
      "Dresser dans un bol : pates completes, cabillaud et poivrons. Napper de sauce tomate mijotee avec des herbes."
    ]
  },
  {
    "id": "plat-bowl-crevettes-semoule-epinards-yaourt-citro",
    "nom": "Bowl crevettes-semoule, epinards & yaourt citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "crustaces",
      "lactose",
      "gluten"
    ],
    "motsCles": [
      "crevette",
      "semoule",
      "epinard"
    ],
    "kcal": 370,
    "proteines": 35,
    "glucides": 49,
    "lipides": 3,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Crevettes decortiquees",
        "quantite": 120,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Semoule",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Epinards frais",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Yaourt nature",
        "quantite": 40,
        "unite": "g",
        "rayon": "Cremerie"
      }
    ],
    "etapes": [
      "Couvrir la semoule d'eau bouillante salee a hauteur, laisser gonfler 5 minutes et l'aerer.",
      "Saisir les crevettes 2 a 3 minutes a feu vif jusqu'a ce qu'elles soient roses.",
      "Faire tomber les epinards 2 minutes a la poele.",
      "Dresser dans un bol : semoule, crevettes et epinards. Servir avec une sauce yaourt-citron (yaourt, citron, sel)."
    ]
  },
  {
    "id": "plat-bowl-oeufs-boulgour-salade-curry-coco",
    "nom": "Bowl oeufs-boulgour, salade & curry coco",
    "type": "plat",
    "cuisines": [
      "indienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien"
    ],
    "budget": "eco",
    "allergenes": [
      "oeuf",
      "gluten"
    ],
    "motsCles": [
      "oeuf",
      "boulgour",
      "salade"
    ],
    "kcal": 485,
    "proteines": 22,
    "glucides": 50,
    "lipides": 21,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Cremerie"
      },
      {
        "nom": "Boulgour",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Salade verte",
        "quantite": 60,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Lait de coco",
        "quantite": 60,
        "unite": "ml",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le boulgour 12 minutes dans l'eau salee, puis l'egoutter.",
      "Cuire les 2 oeufs (au plat ou durs, 9 minutes).",
      "Laver la salade et la couper.",
      "Dresser dans un bol : boulgour, oeufs et salade. Mijoter 5 minutes avec le lait de coco et une cuillere de curry."
    ]
  },
  {
    "id": "plat-bowl-tofu-quinoa-haricots-verts-tahin-citron",
    "nom": "Bowl tofu-quinoa, haricots verts & tahin citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "soja",
      "sesame"
    ],
    "motsCles": [
      "tofu",
      "quinoa",
      "haricot"
    ],
    "kcal": 535,
    "proteines": 32,
    "glucides": 54,
    "lipides": 23,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Tofu ferme",
        "quantite": 150,
        "unite": "g",
        "rayon": "Rayon vegetal"
      },
      {
        "nom": "Quinoa",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Haricots verts",
        "quantite": 150,
        "unite": "g",
        "rayon": "Surgeles"
      },
      {
        "nom": "Tahin (puree de sesame)",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le quinoa 12 a 14 minutes dans 2 volumes d'eau salee.",
      "Eponger le tofu, le couper en des et le dorer 6 minutes en le retournant.",
      "Cuire les haricots verts 8 a 10 minutes.",
      "Dresser dans un bol : quinoa, tofu et haricots verts. Napper de sauce tahin-citron (tahin, citron, un peu d'eau)."
    ]
  },
  {
    "id": "plat-bowl-pois-chiches-patate-douce-brocoli-pesto",
    "nom": "Bowl pois chiches-patate douce, brocoli & pesto",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose",
      "fruits-a-coque"
    ],
    "motsCles": [
      "pois chiche",
      "patate douce",
      "brocoli"
    ],
    "kcal": 590,
    "proteines": 21,
    "glucides": 86,
    "lipides": 18,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Pois chiches cuits",
        "quantite": 150,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Patate douce",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Brocoli",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Pesto",
        "quantite": 25,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Couper la patate douce en des et la rotir 20 a 25 minutes au four a 200 C.",
      "Rincer et rechauffer les pois chiches 3 minutes avec une pincee d'epices.",
      "Cuire le brocoli 7 minutes a la vapeur (il reste croquant).",
      "Dresser dans un bol : patate douce, pois chiches et brocoli. Melanger avec le pesto hors du feu."
    ]
  },
  {
    "id": "plat-bowl-lentilles-riz-tomates-cerises-huile-d-o",
    "nom": "Bowl lentilles-riz, tomates cerises & huile d'olive & citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "motsCles": [
      "lentille",
      "riz",
      "tomate"
    ],
    "kcal": 505,
    "proteines": 17,
    "glucides": 82,
    "lipides": 12,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Lentilles cuites",
        "quantite": 150,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Tomates cerises",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Huile d'olive",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le riz dans l'eau bouillante salee selon le paquet, puis l'egoutter.",
      "Rincer et rechauffer les lentilles 3 minutes.",
      "Couper les tomates cerises en deux.",
      "Dresser dans un bol : riz, lentilles et tomates cerises. Assaisonner d'huile d'olive, de jus de citron, de sel et de poivre."
    ]
  },
  {
    "id": "plat-bowl-feta-pates-completes-courgette-sauce-to",
    "nom": "Bowl feta-pates completes, courgette & sauce tomate",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose",
      "gluten"
    ],
    "motsCles": [
      "feta",
      "pates",
      "courgette"
    ],
    "kcal": 495,
    "proteines": 22,
    "glucides": 72,
    "lipides": 14,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Feta",
        "quantite": 50,
        "unite": "g",
        "rayon": "Cremerie"
      },
      {
        "nom": "Pates completes",
        "quantite": 80,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Courgette",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pates completes al dente dans l'eau bouillante salee.",
      "Emietter la feta sur le plat.",
      "Poeler la courgette en rondelles 5 a 6 minutes.",
      "Dresser dans un bol : pates completes, feta et courgette. Napper de sauce tomate mijotee avec des herbes."
    ]
  },
  {
    "id": "plat-bowl-poulet-pommes-de-terre-champignons-sauc",
    "nom": "Bowl poulet-pommes de terre, champignons & sauce soja & sesame",
    "type": "plat",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "soja",
      "gluten",
      "sesame"
    ],
    "motsCles": [
      "poulet",
      "pomme de terre",
      "champignon"
    ],
    "kcal": 425,
    "proteines": 47,
    "glucides": 43,
    "lipides": 6,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Filet de poulet",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Pomme de terre",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Champignons de Paris",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce soja",
        "quantite": 2,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre 18 minutes a l'eau salee.",
      "Couper le filet de poulet en des et le poeler 6 a 7 minutes a feu moyen-vif, jusqu'a ce qu'il soit dore et cuit a coeur.",
      "Poeler les champignons eminces 5 minutes a feu vif.",
      "Dresser dans un bol : pommes de terre, poulet et champignons. Napper de sauce soja et parsemer de graines de sesame."
    ]
  },
  {
    "id": "plat-bowl-dinde-semoule-poivrons-yaourt-citron",
    "nom": "Bowl dinde-semoule, poivrons & yaourt citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose",
      "gluten"
    ],
    "motsCles": [
      "dinde",
      "semoule",
      "poivron"
    ],
    "kcal": 440,
    "proteines": 45,
    "glucides": 54,
    "lipides": 5,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Escalope de dinde",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Semoule",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Poivron",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Yaourt nature",
        "quantite": 40,
        "unite": "g",
        "rayon": "Cremerie"
      }
    ],
    "etapes": [
      "Couvrir la semoule d'eau bouillante salee a hauteur, laisser gonfler 5 minutes et l'aerer.",
      "Poeler l'escalope de dinde 4 minutes par face, puis l'emincer.",
      "Faire revenir le poivron emince 4 a 5 minutes.",
      "Dresser dans un bol : semoule, dinde et poivrons. Servir avec une sauce yaourt-citron (yaourt, citron, sel)."
    ]
  },
  {
    "id": "plat-bowl-boeuf-boulgour-carottes-curry-coco",
    "nom": "Bowl boeuf-boulgour, carottes & curry coco",
    "type": "plat",
    "cuisines": [
      "indienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "motsCles": [
      "boeuf",
      "boulgour",
      "carotte"
    ],
    "kcal": 540,
    "proteines": 39,
    "glucides": 56,
    "lipides": 18,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Boeuf hache 5%",
        "quantite": 120,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Boulgour",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Carotte",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Lait de coco",
        "quantite": 60,
        "unite": "ml",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le boulgour 12 minutes dans l'eau salee, puis l'egoutter.",
      "Saisir le boeuf hache 5 minutes a feu vif en l'emiettant ; assaisonner.",
      "Rapper ou cuire la carotte en rondelles.",
      "Dresser dans un bol : boulgour, boeuf et carottes. Mijoter 5 minutes avec le lait de coco et une cuillere de curry."
    ]
  },
  {
    "id": "plat-bowl-saumon-quinoa-epinards-tahin-citron",
    "nom": "Bowl saumon-quinoa, epinards & tahin citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson",
      "sesame"
    ],
    "motsCles": [
      "saumon",
      "quinoa",
      "epinard"
    ],
    "kcal": 585,
    "proteines": 46,
    "glucides": 44,
    "lipides": 26,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Pave de saumon",
        "quantite": 130,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Quinoa",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Epinards frais",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Tahin (puree de sesame)",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le quinoa 12 a 14 minutes dans 2 volumes d'eau salee.",
      "Poeler le saumon 4 minutes cote peau puis 2 a 3 minutes de l'autre cote.",
      "Faire tomber les epinards 2 minutes a la poele.",
      "Dresser dans un bol : quinoa, saumon et epinards. Napper de sauce tahin-citron (tahin, citron, un peu d'eau)."
    ]
  },
  {
    "id": "plat-bowl-cabillaud-patate-douce-salade-pesto",
    "nom": "Bowl cabillaud-patate douce, salade & pesto",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson",
      "lactose",
      "fruits-a-coque"
    ],
    "motsCles": [
      "cabillaud",
      "patate douce",
      "salade"
    ],
    "kcal": 435,
    "proteines": 34,
    "glucides": 46,
    "lipides": 14,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Dos de cabillaud",
        "quantite": 140,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Patate douce",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Salade verte",
        "quantite": 60,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Pesto",
        "quantite": 25,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Couper la patate douce en des et la rotir 20 a 25 minutes au four a 200 C.",
      "Cuire le cabillaud 4 minutes par face a feu moyen (la chair s'effeuille).",
      "Laver la salade et la couper.",
      "Dresser dans un bol : patate douce, cabillaud et salade. Melanger avec le pesto hors du feu."
    ]
  },
  {
    "id": "plat-bowl-thon-riz-haricots-verts-huile-d-olive-c",
    "nom": "Bowl thon-riz, haricots verts & huile d'olive & citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "poisson"
    ],
    "motsCles": [
      "thon",
      "riz",
      "haricot"
    ],
    "kcal": 460,
    "proteines": 33,
    "glucides": 55,
    "lipides": 12,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Thon au naturel",
        "quantite": 100,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Haricots verts",
        "quantite": 150,
        "unite": "g",
        "rayon": "Surgeles"
      },
      {
        "nom": "Huile d'olive",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le riz dans l'eau bouillante salee selon le paquet, puis l'egoutter.",
      "Egoutter le thon et l'emietter.",
      "Cuire les haricots verts 8 a 10 minutes.",
      "Dresser dans un bol : riz, thon et haricots verts. Assaisonner d'huile d'olive, de jus de citron, de sel et de poivre."
    ]
  },
  {
    "id": "plat-bowl-crevettes-pates-completes-brocoli-sauce",
    "nom": "Bowl crevettes-pates completes, brocoli & sauce tomate",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "crustaces",
      "gluten"
    ],
    "motsCles": [
      "crevette",
      "pates",
      "brocoli"
    ],
    "kcal": 480,
    "proteines": 39,
    "glucides": 72,
    "lipides": 5,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Crevettes decortiquees",
        "quantite": 120,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Pates completes",
        "quantite": 80,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Brocoli",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pates completes al dente dans l'eau bouillante salee.",
      "Saisir les crevettes 2 a 3 minutes a feu vif jusqu'a ce qu'elles soient roses.",
      "Cuire le brocoli 7 minutes a la vapeur (il reste croquant).",
      "Dresser dans un bol : pates completes, crevettes et brocoli. Napper de sauce tomate mijotee avec des herbes."
    ]
  },
  {
    "id": "plat-bowl-oeufs-pommes-de-terre-tomates-cerises-s",
    "nom": "Bowl oeufs-pommes de terre, tomates cerises & sauce soja & sesame",
    "type": "plat",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "sans-porc",
      "vegetarien"
    ],
    "budget": "eco",
    "allergenes": [
      "oeuf",
      "soja",
      "gluten",
      "sesame"
    ],
    "motsCles": [
      "oeuf",
      "pomme de terre",
      "tomate"
    ],
    "kcal": 370,
    "proteines": 20,
    "glucides": 46,
    "lipides": 11,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Cremerie"
      },
      {
        "nom": "Pomme de terre",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Tomates cerises",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce soja",
        "quantite": 2,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre 18 minutes a l'eau salee.",
      "Cuire les 2 oeufs (au plat ou durs, 9 minutes).",
      "Couper les tomates cerises en deux.",
      "Dresser dans un bol : pommes de terre, oeufs et tomates cerises. Napper de sauce soja et parsemer de graines de sesame."
    ]
  },
  {
    "id": "plat-bowl-tofu-semoule-courgette-yaourt-citron",
    "nom": "Bowl tofu-semoule, courgette & yaourt citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien"
    ],
    "budget": "eco",
    "allergenes": [
      "soja",
      "lactose",
      "gluten"
    ],
    "motsCles": [
      "tofu",
      "semoule",
      "courgette"
    ],
    "kcal": 460,
    "proteines": 30,
    "glucides": 57,
    "lipides": 13,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Tofu ferme",
        "quantite": 150,
        "unite": "g",
        "rayon": "Rayon vegetal"
      },
      {
        "nom": "Semoule",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Courgette",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Yaourt nature",
        "quantite": 40,
        "unite": "g",
        "rayon": "Cremerie"
      }
    ],
    "etapes": [
      "Couvrir la semoule d'eau bouillante salee a hauteur, laisser gonfler 5 minutes et l'aerer.",
      "Eponger le tofu, le couper en des et le dorer 6 minutes en le retournant.",
      "Poeler la courgette en rondelles 5 a 6 minutes.",
      "Dresser dans un bol : semoule, tofu et courgette. Servir avec une sauce yaourt-citron (yaourt, citron, sel)."
    ]
  },
  {
    "id": "plat-bowl-pois-chiches-boulgour-champignons-curry",
    "nom": "Bowl pois chiches-boulgour, champignons & curry coco",
    "type": "plat",
    "cuisines": [
      "indienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "motsCles": [
      "pois chiche",
      "boulgour",
      "champignon"
    ],
    "kcal": 580,
    "proteines": 23,
    "glucides": 85,
    "lipides": 15,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Pois chiches cuits",
        "quantite": 150,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Boulgour",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Champignons de Paris",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Lait de coco",
        "quantite": 60,
        "unite": "ml",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le boulgour 12 minutes dans l'eau salee, puis l'egoutter.",
      "Rincer et rechauffer les pois chiches 3 minutes avec une pincee d'epices.",
      "Poeler les champignons eminces 5 minutes a feu vif.",
      "Dresser dans un bol : boulgour, pois chiches et champignons. Mijoter 5 minutes avec le lait de coco et une cuillere de curry."
    ]
  },
  {
    "id": "plat-bowl-lentilles-quinoa-poivrons-tahin-citron",
    "nom": "Bowl lentilles-quinoa, poivrons & tahin citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "sesame"
    ],
    "motsCles": [
      "lentille",
      "quinoa",
      "poivron"
    ],
    "kcal": 520,
    "proteines": 24,
    "glucides": 79,
    "lipides": 13,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Lentilles cuites",
        "quantite": 150,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Quinoa",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Poivron",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Tahin (puree de sesame)",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le quinoa 12 a 14 minutes dans 2 volumes d'eau salee.",
      "Rincer et rechauffer les lentilles 3 minutes.",
      "Faire revenir le poivron emince 4 a 5 minutes.",
      "Dresser dans un bol : quinoa, lentilles et poivrons. Napper de sauce tahin-citron (tahin, citron, un peu d'eau)."
    ]
  },
  {
    "id": "plat-bowl-feta-patate-douce-carottes-pesto",
    "nom": "Bowl feta-patate douce, carottes & pesto",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose",
      "fruits-a-coque"
    ],
    "motsCles": [
      "feta",
      "patate douce",
      "carotte"
    ],
    "kcal": 480,
    "proteines": 13,
    "glucides": 54,
    "lipides": 24,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Feta",
        "quantite": 50,
        "unite": "g",
        "rayon": "Cremerie"
      },
      {
        "nom": "Patate douce",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Carotte",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Pesto",
        "quantite": 25,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Couper la patate douce en des et la rotir 20 a 25 minutes au four a 200 C.",
      "Emietter la feta sur le plat.",
      "Rapper ou cuire la carotte en rondelles.",
      "Dresser dans un bol : patate douce, feta et carottes. Melanger avec le pesto hors du feu."
    ]
  },
  {
    "id": "plat-bowl-poulet-riz-epinards-huile-d-olive-citro",
    "nom": "Bowl poulet-riz, epinards & huile d'olive & citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "motsCles": [
      "poulet",
      "riz",
      "epinard"
    ],
    "kcal": 530,
    "proteines": 45,
    "glucides": 49,
    "lipides": 16,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Filet de poulet",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Epinards frais",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Huile d'olive",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le riz dans l'eau bouillante salee selon le paquet, puis l'egoutter.",
      "Couper le filet de poulet en des et le poeler 6 a 7 minutes a feu moyen-vif, jusqu'a ce qu'il soit dore et cuit a coeur.",
      "Faire tomber les epinards 2 minutes a la poele.",
      "Dresser dans un bol : riz, poulet et epinards. Assaisonner d'huile d'olive, de jus de citron, de sel et de poivre."
    ]
  },
  {
    "id": "plat-bowl-dinde-pates-completes-salade-sauce-toma",
    "nom": "Bowl dinde-pates completes, salade & sauce tomate",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "motsCles": [
      "dinde",
      "pates",
      "salade"
    ],
    "kcal": 505,
    "proteines": 48,
    "glucides": 67,
    "lipides": 6,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Escalope de dinde",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Pates completes",
        "quantite": 80,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Salade verte",
        "quantite": 60,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pates completes al dente dans l'eau bouillante salee.",
      "Poeler l'escalope de dinde 4 minutes par face, puis l'emincer.",
      "Laver la salade et la couper.",
      "Dresser dans un bol : pates completes, dinde et salade. Napper de sauce tomate mijotee avec des herbes."
    ]
  },
  {
    "id": "plat-bowl-boeuf-pommes-de-terre-haricots-verts-sa",
    "nom": "Bowl boeuf-pommes de terre, haricots verts & sauce soja & sesame",
    "type": "plat",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "soja",
      "gluten",
      "sesame"
    ],
    "motsCles": [
      "boeuf",
      "pomme de terre",
      "haricot"
    ],
    "kcal": 420,
    "proteines": 39,
    "glucides": 48,
    "lipides": 8,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Boeuf hache 5%",
        "quantite": 120,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Pomme de terre",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Haricots verts",
        "quantite": 150,
        "unite": "g",
        "rayon": "Surgeles"
      },
      {
        "nom": "Sauce soja",
        "quantite": 2,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre 18 minutes a l'eau salee.",
      "Saisir le boeuf hache 5 minutes a feu vif en l'emiettant ; assaisonner.",
      "Cuire les haricots verts 8 a 10 minutes.",
      "Dresser dans un bol : pommes de terre, boeuf et haricots verts. Napper de sauce soja et parsemer de graines de sesame."
    ]
  },
  {
    "id": "plat-bowl-saumon-semoule-brocoli-yaourt-citron",
    "nom": "Bowl saumon-semoule, brocoli & yaourt citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson",
      "lactose",
      "gluten"
    ],
    "motsCles": [
      "saumon",
      "semoule",
      "brocoli"
    ],
    "kcal": 545,
    "proteines": 46,
    "glucides": 54,
    "lipides": 17,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Pave de saumon",
        "quantite": 130,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Semoule",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Brocoli",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Yaourt nature",
        "quantite": 40,
        "unite": "g",
        "rayon": "Cremerie"
      }
    ],
    "etapes": [
      "Couvrir la semoule d'eau bouillante salee a hauteur, laisser gonfler 5 minutes et l'aerer.",
      "Poeler le saumon 4 minutes cote peau puis 2 a 3 minutes de l'autre cote.",
      "Cuire le brocoli 7 minutes a la vapeur (il reste croquant).",
      "Dresser dans un bol : semoule, saumon et brocoli. Servir avec une sauce yaourt-citron (yaourt, citron, sel)."
    ]
  },
  {
    "id": "plat-bowl-cabillaud-boulgour-tomates-cerises-curr",
    "nom": "Bowl cabillaud-boulgour, tomates cerises & curry coco",
    "type": "plat",
    "cuisines": [
      "indienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson",
      "gluten"
    ],
    "motsCles": [
      "cabillaud",
      "boulgour",
      "tomate"
    ],
    "kcal": 455,
    "proteines": 37,
    "glucides": 52,
    "lipides": 12,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Dos de cabillaud",
        "quantite": 140,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Boulgour",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Tomates cerises",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Lait de coco",
        "quantite": 60,
        "unite": "ml",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le boulgour 12 minutes dans l'eau salee, puis l'egoutter.",
      "Cuire le cabillaud 4 minutes par face a feu moyen (la chair s'effeuille).",
      "Couper les tomates cerises en deux.",
      "Dresser dans un bol : boulgour, cabillaud et tomates cerises. Mijoter 5 minutes avec le lait de coco et une cuillere de curry."
    ]
  },
  {
    "id": "plat-bowl-thon-quinoa-courgette-tahin-citron",
    "nom": "Bowl thon-quinoa, courgette & tahin citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "poisson",
      "sesame"
    ],
    "motsCles": [
      "thon",
      "quinoa",
      "courgette"
    ],
    "kcal": 455,
    "proteines": 39,
    "glucides": 48,
    "lipides": 13,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Thon au naturel",
        "quantite": 100,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Quinoa",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Courgette",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Tahin (puree de sesame)",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le quinoa 12 a 14 minutes dans 2 volumes d'eau salee.",
      "Egoutter le thon et l'emietter.",
      "Poeler la courgette en rondelles 5 a 6 minutes.",
      "Dresser dans un bol : quinoa, thon et courgette. Napper de sauce tahin-citron (tahin, citron, un peu d'eau)."
    ]
  },
  {
    "id": "plat-bowl-crevettes-patate-douce-champignons-pest",
    "nom": "Bowl crevettes-patate douce, champignons & pesto",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "crustaces",
      "lactose",
      "fruits-a-coque"
    ],
    "motsCles": [
      "crevette",
      "patate douce",
      "champignon"
    ],
    "kcal": 440,
    "proteines": 30,
    "glucides": 47,
    "lipides": 14,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Crevettes decortiquees",
        "quantite": 120,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Patate douce",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Champignons de Paris",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Pesto",
        "quantite": 25,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Couper la patate douce en des et la rotir 20 a 25 minutes au four a 200 C.",
      "Saisir les crevettes 2 a 3 minutes a feu vif jusqu'a ce qu'elles soient roses.",
      "Poeler les champignons eminces 5 minutes a feu vif.",
      "Dresser dans un bol : patate douce, crevettes et champignons. Melanger avec le pesto hors du feu."
    ]
  },
  {
    "id": "plat-bowl-oeufs-riz-poivrons-huile-d-olive-citron",
    "nom": "Bowl oeufs-riz, poivrons & huile d'olive & citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "oeuf"
    ],
    "motsCles": [
      "oeuf",
      "riz",
      "poivron"
    ],
    "kcal": 490,
    "proteines": 18,
    "glucides": 55,
    "lipides": 21,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Cremerie"
      },
      {
        "nom": "Riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Poivron",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Huile d'olive",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le riz dans l'eau bouillante salee selon le paquet, puis l'egoutter.",
      "Cuire les 2 oeufs (au plat ou durs, 9 minutes).",
      "Faire revenir le poivron emince 4 a 5 minutes.",
      "Dresser dans un bol : riz, oeufs et poivrons. Assaisonner d'huile d'olive, de jus de citron, de sel et de poivre."
    ]
  },
  {
    "id": "plat-bowl-tofu-pates-completes-carottes-sauce-tom",
    "nom": "Bowl tofu-pates completes, carottes & sauce tomate",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan"
    ],
    "budget": "eco",
    "allergenes": [
      "soja",
      "gluten"
    ],
    "motsCles": [
      "tofu",
      "pates",
      "carotte"
    ],
    "kcal": 550,
    "proteines": 32,
    "glucides": 78,
    "lipides": 14,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Tofu ferme",
        "quantite": 150,
        "unite": "g",
        "rayon": "Rayon vegetal"
      },
      {
        "nom": "Pates completes",
        "quantite": 80,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Carotte",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pates completes al dente dans l'eau bouillante salee.",
      "Eponger le tofu, le couper en des et le dorer 6 minutes en le retournant.",
      "Rapper ou cuire la carotte en rondelles.",
      "Dresser dans un bol : pates completes, tofu et carottes. Napper de sauce tomate mijotee avec des herbes."
    ]
  },
  {
    "id": "plat-bowl-pois-chiches-pommes-de-terre-epinards-s",
    "nom": "Bowl pois chiches-pommes de terre, epinards & sauce soja & sesame",
    "type": "plat",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan"
    ],
    "budget": "eco",
    "allergenes": [
      "soja",
      "gluten",
      "sesame"
    ],
    "motsCles": [
      "pois chiche",
      "pomme de terre",
      "epinard"
    ],
    "kcal": 450,
    "proteines": 21,
    "glucides": 77,
    "lipides": 5,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Pois chiches cuits",
        "quantite": 150,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Pomme de terre",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Epinards frais",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce soja",
        "quantite": 2,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre 18 minutes a l'eau salee.",
      "Rincer et rechauffer les pois chiches 3 minutes avec une pincee d'epices.",
      "Faire tomber les epinards 2 minutes a la poele.",
      "Dresser dans un bol : pommes de terre, pois chiches et epinards. Napper de sauce soja et parsemer de graines de sesame."
    ]
  },
  {
    "id": "plat-bowl-lentilles-semoule-salade-yaourt-citron",
    "nom": "Bowl lentilles-semoule, salade & yaourt citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose",
      "gluten"
    ],
    "motsCles": [
      "lentille",
      "semoule",
      "salade"
    ],
    "kcal": 435,
    "proteines": 23,
    "glucides": 79,
    "lipides": 3,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Lentilles cuites",
        "quantite": 150,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Semoule",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Salade verte",
        "quantite": 60,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Yaourt nature",
        "quantite": 40,
        "unite": "g",
        "rayon": "Cremerie"
      }
    ],
    "etapes": [
      "Couvrir la semoule d'eau bouillante salee a hauteur, laisser gonfler 5 minutes et l'aerer.",
      "Rincer et rechauffer les lentilles 3 minutes.",
      "Laver la salade et la couper.",
      "Dresser dans un bol : semoule, lentilles et salade. Servir avec une sauce yaourt-citron (yaourt, citron, sel)."
    ]
  },
  {
    "id": "plat-bowl-feta-boulgour-haricots-verts-curry-coco",
    "nom": "Bowl feta-boulgour, haricots verts & curry coco",
    "type": "plat",
    "cuisines": [
      "indienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose",
      "gluten"
    ],
    "motsCles": [
      "feta",
      "boulgour",
      "haricot"
    ],
    "kcal": 495,
    "proteines": 18,
    "glucides": 56,
    "lipides": 22,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Feta",
        "quantite": 50,
        "unite": "g",
        "rayon": "Cremerie"
      },
      {
        "nom": "Boulgour",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Haricots verts",
        "quantite": 150,
        "unite": "g",
        "rayon": "Surgeles"
      },
      {
        "nom": "Lait de coco",
        "quantite": 60,
        "unite": "ml",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le boulgour 12 minutes dans l'eau salee, puis l'egoutter.",
      "Emietter la feta sur le plat.",
      "Cuire les haricots verts 8 a 10 minutes.",
      "Dresser dans un bol : boulgour, feta et haricots verts. Mijoter 5 minutes avec le lait de coco et une cuillere de curry."
    ]
  },
  {
    "id": "plat-bowl-poulet-quinoa-brocoli-tahin-citron",
    "nom": "Bowl poulet-quinoa, brocoli & tahin citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "sesame"
    ],
    "motsCles": [
      "poulet",
      "quinoa",
      "brocoli"
    ],
    "kcal": 560,
    "proteines": 53,
    "glucides": 49,
    "lipides": 18,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Filet de poulet",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Quinoa",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Brocoli",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Tahin (puree de sesame)",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le quinoa 12 a 14 minutes dans 2 volumes d'eau salee.",
      "Couper le filet de poulet en des et le poeler 6 a 7 minutes a feu moyen-vif, jusqu'a ce qu'il soit dore et cuit a coeur.",
      "Cuire le brocoli 7 minutes a la vapeur (il reste croquant).",
      "Dresser dans un bol : quinoa, poulet et brocoli. Napper de sauce tahin-citron (tahin, citron, un peu d'eau)."
    ]
  },
  {
    "id": "plat-bowl-dinde-patate-douce-tomates-cerises-pest",
    "nom": "Bowl dinde-patate douce, tomates cerises & pesto",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose",
      "fruits-a-coque"
    ],
    "motsCles": [
      "dinde",
      "patate douce",
      "tomate"
    ],
    "kcal": 495,
    "proteines": 40,
    "glucides": 49,
    "lipides": 16,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Escalope de dinde",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Patate douce",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Tomates cerises",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Pesto",
        "quantite": 25,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Couper la patate douce en des et la rotir 20 a 25 minutes au four a 200 C.",
      "Poeler l'escalope de dinde 4 minutes par face, puis l'emincer.",
      "Couper les tomates cerises en deux.",
      "Dresser dans un bol : patate douce, dinde et tomates cerises. Melanger avec le pesto hors du feu."
    ]
  },
  {
    "id": "plat-bowl-boeuf-riz-courgette-huile-d-olive-citro",
    "nom": "Bowl boeuf-riz, courgette & huile d'olive & citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "motsCles": [
      "boeuf",
      "riz",
      "courgette"
    ],
    "kcal": 520,
    "proteines": 36,
    "glucides": 53,
    "lipides": 18,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Boeuf hache 5%",
        "quantite": 120,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Courgette",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Huile d'olive",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le riz dans l'eau bouillante salee selon le paquet, puis l'egoutter.",
      "Saisir le boeuf hache 5 minutes a feu vif en l'emiettant ; assaisonner.",
      "Poeler la courgette en rondelles 5 a 6 minutes.",
      "Dresser dans un bol : riz, boeuf et courgette. Assaisonner d'huile d'olive, de jus de citron, de sel et de poivre."
    ]
  },
  {
    "id": "plat-bowl-saumon-pates-completes-champignons-sauc",
    "nom": "Bowl saumon-pates completes, champignons & sauce tomate",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson",
      "gluten"
    ],
    "motsCles": [
      "saumon",
      "pates",
      "champignon"
    ],
    "kcal": 610,
    "proteines": 48,
    "glucides": 68,
    "lipides": 17,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Pave de saumon",
        "quantite": 130,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Pates completes",
        "quantite": 80,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Champignons de Paris",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pates completes al dente dans l'eau bouillante salee.",
      "Poeler le saumon 4 minutes cote peau puis 2 a 3 minutes de l'autre cote.",
      "Poeler les champignons eminces 5 minutes a feu vif.",
      "Dresser dans un bol : pates completes, saumon et champignons. Napper de sauce tomate mijotee avec des herbes."
    ]
  },
  {
    "id": "plat-bowl-thon-semoule-carottes-yaourt-citron",
    "nom": "Bowl thon-semoule, carottes & yaourt citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "poisson",
      "lactose",
      "gluten"
    ],
    "motsCles": [
      "thon",
      "semoule",
      "carotte"
    ],
    "kcal": 395,
    "proteines": 37,
    "glucides": 56,
    "lipides": 3,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Thon au naturel",
        "quantite": 100,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Semoule",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Carotte",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Yaourt nature",
        "quantite": 40,
        "unite": "g",
        "rayon": "Cremerie"
      }
    ],
    "etapes": [
      "Couvrir la semoule d'eau bouillante salee a hauteur, laisser gonfler 5 minutes et l'aerer.",
      "Egoutter le thon et l'emietter.",
      "Rapper ou cuire la carotte en rondelles.",
      "Dresser dans un bol : semoule, thon et carottes. Servir avec une sauce yaourt-citron (yaourt, citron, sel)."
    ]
  },
  {
    "id": "plat-bowl-crevettes-boulgour-epinards-curry-coco",
    "nom": "Bowl crevettes-boulgour, epinards & curry coco",
    "type": "plat",
    "cuisines": [
      "indienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "crustaces",
      "gluten"
    ],
    "motsCles": [
      "crevette",
      "boulgour",
      "epinard"
    ],
    "kcal": 445,
    "proteines": 33,
    "glucides": 49,
    "lipides": 12,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Crevettes decortiquees",
        "quantite": 120,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Boulgour",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Epinards frais",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Lait de coco",
        "quantite": 60,
        "unite": "ml",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le boulgour 12 minutes dans l'eau salee, puis l'egoutter.",
      "Saisir les crevettes 2 a 3 minutes a feu vif jusqu'a ce qu'elles soient roses.",
      "Faire tomber les epinards 2 minutes a la poele.",
      "Dresser dans un bol : boulgour, crevettes et epinards. Mijoter 5 minutes avec le lait de coco et une cuillere de curry."
    ]
  },
  {
    "id": "plat-bowl-oeufs-quinoa-salade-tahin-citron",
    "nom": "Bowl oeufs-quinoa, salade & tahin citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "oeuf",
      "sesame"
    ],
    "motsCles": [
      "oeuf",
      "quinoa",
      "salade"
    ],
    "kcal": 475,
    "proteines": 25,
    "glucides": 45,
    "lipides": 22,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Cremerie"
      },
      {
        "nom": "Quinoa",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Salade verte",
        "quantite": 60,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Tahin (puree de sesame)",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le quinoa 12 a 14 minutes dans 2 volumes d'eau salee.",
      "Cuire les 2 oeufs (au plat ou durs, 9 minutes).",
      "Laver la salade et la couper.",
      "Dresser dans un bol : quinoa, oeufs et salade. Napper de sauce tahin-citron (tahin, citron, un peu d'eau)."
    ]
  },
  {
    "id": "plat-bowl-tofu-patate-douce-haricots-verts-pesto",
    "nom": "Bowl tofu-patate douce, haricots verts & pesto",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "soja",
      "lactose",
      "fruits-a-coque"
    ],
    "motsCles": [
      "tofu",
      "patate douce",
      "haricot"
    ],
    "kcal": 535,
    "proteines": 26,
    "glucides": 56,
    "lipides": 24,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Tofu ferme",
        "quantite": 150,
        "unite": "g",
        "rayon": "Rayon vegetal"
      },
      {
        "nom": "Patate douce",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Haricots verts",
        "quantite": 150,
        "unite": "g",
        "rayon": "Surgeles"
      },
      {
        "nom": "Pesto",
        "quantite": 25,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Couper la patate douce en des et la rotir 20 a 25 minutes au four a 200 C.",
      "Eponger le tofu, le couper en des et le dorer 6 minutes en le retournant.",
      "Cuire les haricots verts 8 a 10 minutes.",
      "Dresser dans un bol : patate douce, tofu et haricots verts. Melanger avec le pesto hors du feu."
    ]
  },
  {
    "id": "plat-bowl-pois-chiches-riz-brocoli-huile-d-olive-",
    "nom": "Bowl pois chiches-riz, brocoli & huile d'olive & citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "motsCles": [
      "pois chiche",
      "riz",
      "brocoli"
    ],
    "kcal": 585,
    "proteines": 20,
    "glucides": 89,
    "lipides": 16,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Pois chiches cuits",
        "quantite": 150,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Brocoli",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Huile d'olive",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le riz dans l'eau bouillante salee selon le paquet, puis l'egoutter.",
      "Rincer et rechauffer les pois chiches 3 minutes avec une pincee d'epices.",
      "Cuire le brocoli 7 minutes a la vapeur (il reste croquant).",
      "Dresser dans un bol : riz, pois chiches et brocoli. Assaisonner d'huile d'olive, de jus de citron, de sel et de poivre."
    ]
  },
  {
    "id": "plat-bowl-lentilles-pates-completes-tomates-ceris",
    "nom": "Bowl lentilles-pates completes, tomates cerises & sauce tomate",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "motsCles": [
      "lentille",
      "pates",
      "tomate"
    ],
    "kcal": 530,
    "proteines": 26,
    "glucides": 100,
    "lipides": 4,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Lentilles cuites",
        "quantite": 150,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Pates completes",
        "quantite": 80,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Tomates cerises",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pates completes al dente dans l'eau bouillante salee.",
      "Rincer et rechauffer les lentilles 3 minutes.",
      "Couper les tomates cerises en deux.",
      "Dresser dans un bol : pates completes, lentilles et tomates cerises. Napper de sauce tomate mijotee avec des herbes."
    ]
  },
  {
    "id": "plat-bowl-feta-pommes-de-terre-courgette-sauce-so",
    "nom": "Bowl feta-pommes de terre, courgette & sauce soja & sesame",
    "type": "plat",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "sans-porc",
      "vegetarien"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose",
      "soja",
      "gluten",
      "sesame"
    ],
    "motsCles": [
      "feta",
      "pomme de terre",
      "courgette"
    ],
    "kcal": 360,
    "proteines": 15,
    "glucides": 47,
    "lipides": 12,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Feta",
        "quantite": 50,
        "unite": "g",
        "rayon": "Cremerie"
      },
      {
        "nom": "Pomme de terre",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Courgette",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce soja",
        "quantite": 2,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre 18 minutes a l'eau salee.",
      "Emietter la feta sur le plat.",
      "Poeler la courgette en rondelles 5 a 6 minutes.",
      "Dresser dans un bol : pommes de terre, feta et courgette. Napper de sauce soja et parsemer de graines de sesame."
    ]
  },
  {
    "id": "plat-bowl-poulet-semoule-champignons-yaourt-citro",
    "nom": "Bowl poulet-semoule, champignons & yaourt citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose",
      "gluten"
    ],
    "motsCles": [
      "poulet",
      "semoule",
      "champignon"
    ],
    "kcal": 475,
    "proteines": 51,
    "glucides": 50,
    "lipides": 7,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Filet de poulet",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Semoule",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Champignons de Paris",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Yaourt nature",
        "quantite": 40,
        "unite": "g",
        "rayon": "Cremerie"
      }
    ],
    "etapes": [
      "Couvrir la semoule d'eau bouillante salee a hauteur, laisser gonfler 5 minutes et l'aerer.",
      "Couper le filet de poulet en des et le poeler 6 a 7 minutes a feu moyen-vif, jusqu'a ce qu'il soit dore et cuit a coeur.",
      "Poeler les champignons eminces 5 minutes a feu vif.",
      "Dresser dans un bol : semoule, poulet et champignons. Servir avec une sauce yaourt-citron (yaourt, citron, sel)."
    ]
  },
  {
    "id": "plat-bowl-dinde-boulgour-poivrons-curry-coco",
    "nom": "Bowl dinde-boulgour, poivrons & curry coco",
    "type": "plat",
    "cuisines": [
      "indienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "motsCles": [
      "dinde",
      "boulgour",
      "poivron"
    ],
    "kcal": 515,
    "proteines": 43,
    "glucides": 54,
    "lipides": 14,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Escalope de dinde",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Boulgour",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Poivron",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Lait de coco",
        "quantite": 60,
        "unite": "ml",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le boulgour 12 minutes dans l'eau salee, puis l'egoutter.",
      "Poeler l'escalope de dinde 4 minutes par face, puis l'emincer.",
      "Faire revenir le poivron emince 4 a 5 minutes.",
      "Dresser dans un bol : boulgour, dinde et poivrons. Mijoter 5 minutes avec le lait de coco et une cuillere de curry."
    ]
  },
  {
    "id": "plat-bowl-boeuf-quinoa-carottes-tahin-citron",
    "nom": "Bowl boeuf-quinoa, carottes & tahin citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "sesame"
    ],
    "motsCles": [
      "boeuf",
      "quinoa",
      "carotte"
    ],
    "kcal": 530,
    "proteines": 42,
    "glucides": 51,
    "lipides": 19,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Boeuf hache 5%",
        "quantite": 120,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Quinoa",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Carotte",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Tahin (puree de sesame)",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le quinoa 12 a 14 minutes dans 2 volumes d'eau salee.",
      "Saisir le boeuf hache 5 minutes a feu vif en l'emiettant ; assaisonner.",
      "Rapper ou cuire la carotte en rondelles.",
      "Dresser dans un bol : quinoa, boeuf et carottes. Napper de sauce tahin-citron (tahin, citron, un peu d'eau)."
    ]
  },
  {
    "id": "plat-bowl-saumon-patate-douce-epinards-pesto",
    "nom": "Bowl saumon-patate douce, epinards & pesto",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson",
      "lactose",
      "fruits-a-coque"
    ],
    "motsCles": [
      "saumon",
      "patate douce",
      "epinard"
    ],
    "kcal": 585,
    "proteines": 40,
    "glucides": 46,
    "lipides": 27,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Pave de saumon",
        "quantite": 130,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Patate douce",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Epinards frais",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Pesto",
        "quantite": 25,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Couper la patate douce en des et la rotir 20 a 25 minutes au four a 200 C.",
      "Poeler le saumon 4 minutes cote peau puis 2 a 3 minutes de l'autre cote.",
      "Faire tomber les epinards 2 minutes a la poele.",
      "Dresser dans un bol : patate douce, saumon et epinards. Melanger avec le pesto hors du feu."
    ]
  },
  {
    "id": "plat-bowl-cabillaud-riz-salade-huile-d-olive-citr",
    "nom": "Bowl cabillaud-riz, salade & huile d'olive & citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson"
    ],
    "motsCles": [
      "cabillaud",
      "riz",
      "salade"
    ],
    "kcal": 430,
    "proteines": 33,
    "glucides": 49,
    "lipides": 12,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Dos de cabillaud",
        "quantite": 140,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Salade verte",
        "quantite": 60,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Huile d'olive",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le riz dans l'eau bouillante salee selon le paquet, puis l'egoutter.",
      "Cuire le cabillaud 4 minutes par face a feu moyen (la chair s'effeuille).",
      "Laver la salade et la couper.",
      "Dresser dans un bol : riz, cabillaud et salade. Assaisonner d'huile d'olive, de jus de citron, de sel et de poivre."
    ]
  },
  {
    "id": "plat-bowl-thon-pates-completes-haricots-verts-sau",
    "nom": "Bowl thon-pates completes, haricots verts & sauce tomate",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "poisson",
      "gluten"
    ],
    "motsCles": [
      "thon",
      "pates",
      "haricot"
    ],
    "kcal": 485,
    "proteines": 42,
    "glucides": 73,
    "lipides": 4,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Thon au naturel",
        "quantite": 100,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Pates completes",
        "quantite": 80,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Haricots verts",
        "quantite": 150,
        "unite": "g",
        "rayon": "Surgeles"
      },
      {
        "nom": "Sauce tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pates completes al dente dans l'eau bouillante salee.",
      "Egoutter le thon et l'emietter.",
      "Cuire les haricots verts 8 a 10 minutes.",
      "Dresser dans un bol : pates completes, thon et haricots verts. Napper de sauce tomate mijotee avec des herbes."
    ]
  },
  {
    "id": "plat-bowl-oeufs-semoule-tomates-cerises-yaourt-ci",
    "nom": "Bowl oeufs-semoule, tomates cerises & yaourt citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien"
    ],
    "budget": "eco",
    "allergenes": [
      "oeuf",
      "lactose",
      "gluten"
    ],
    "motsCles": [
      "oeuf",
      "semoule",
      "tomate"
    ],
    "kcal": 420,
    "proteines": 24,
    "glucides": 53,
    "lipides": 12,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Cremerie"
      },
      {
        "nom": "Semoule",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Tomates cerises",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Yaourt nature",
        "quantite": 40,
        "unite": "g",
        "rayon": "Cremerie"
      }
    ],
    "etapes": [
      "Couvrir la semoule d'eau bouillante salee a hauteur, laisser gonfler 5 minutes et l'aerer.",
      "Cuire les 2 oeufs (au plat ou durs, 9 minutes).",
      "Couper les tomates cerises en deux.",
      "Dresser dans un bol : semoule, oeufs et tomates cerises. Servir avec une sauce yaourt-citron (yaourt, citron, sel)."
    ]
  },
  {
    "id": "plat-bowl-tofu-boulgour-courgette-curry-coco",
    "nom": "Bowl tofu-boulgour, courgette & curry coco",
    "type": "plat",
    "cuisines": [
      "indienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan"
    ],
    "budget": "eco",
    "allergenes": [
      "soja",
      "gluten"
    ],
    "motsCles": [
      "tofu",
      "boulgour",
      "courgette"
    ],
    "kcal": 535,
    "proteines": 28,
    "glucides": 57,
    "lipides": 22,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Tofu ferme",
        "quantite": 150,
        "unite": "g",
        "rayon": "Rayon vegetal"
      },
      {
        "nom": "Boulgour",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Courgette",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Lait de coco",
        "quantite": 60,
        "unite": "ml",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le boulgour 12 minutes dans l'eau salee, puis l'egoutter.",
      "Eponger le tofu, le couper en des et le dorer 6 minutes en le retournant.",
      "Poeler la courgette en rondelles 5 a 6 minutes.",
      "Dresser dans un bol : boulgour, tofu et courgette. Mijoter 5 minutes avec le lait de coco et une cuillere de curry."
    ]
  },
  {
    "id": "plat-bowl-pois-chiches-quinoa-champignons-tahin-c",
    "nom": "Bowl pois chiches-quinoa, champignons & tahin citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "vegan",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "sesame"
    ],
    "motsCles": [
      "pois chiche",
      "quinoa",
      "champignon"
    ],
    "kcal": 570,
    "proteines": 26,
    "glucides": 80,
    "lipides": 16,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Pois chiches cuits",
        "quantite": 150,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Quinoa",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Champignons de Paris",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Tahin (puree de sesame)",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le quinoa 12 a 14 minutes dans 2 volumes d'eau salee.",
      "Rincer et rechauffer les pois chiches 3 minutes avec une pincee d'epices.",
      "Poeler les champignons eminces 5 minutes a feu vif.",
      "Dresser dans un bol : quinoa, pois chiches et champignons. Napper de sauce tahin-citron (tahin, citron, un peu d'eau)."
    ]
  },
  {
    "id": "plat-bowl-lentilles-patate-douce-poivrons-pesto",
    "nom": "Bowl lentilles-patate douce, poivrons & pesto",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose",
      "fruits-a-coque"
    ],
    "motsCles": [
      "lentille",
      "patate douce",
      "poivron"
    ],
    "kcal": 520,
    "proteines": 18,
    "glucides": 81,
    "lipides": 14,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Lentilles cuites",
        "quantite": 150,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Patate douce",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Poivron",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Pesto",
        "quantite": 25,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Couper la patate douce en des et la rotir 20 a 25 minutes au four a 200 C.",
      "Rincer et rechauffer les lentilles 3 minutes.",
      "Faire revenir le poivron emince 4 a 5 minutes.",
      "Dresser dans un bol : patate douce, lentilles et poivrons. Melanger avec le pesto hors du feu."
    ]
  },
  {
    "id": "plat-bowl-feta-riz-carottes-huile-d-olive-citron",
    "nom": "Bowl feta-riz, carottes & huile d'olive & citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "vegetarien",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose"
    ],
    "motsCles": [
      "feta",
      "riz",
      "carotte"
    ],
    "kcal": 475,
    "proteines": 12,
    "glucides": 57,
    "lipides": 22,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Feta",
        "quantite": 50,
        "unite": "g",
        "rayon": "Cremerie"
      },
      {
        "nom": "Riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Carotte",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Huile d'olive",
        "quantite": 1,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le riz dans l'eau bouillante salee selon le paquet, puis l'egoutter.",
      "Emietter la feta sur le plat.",
      "Rapper ou cuire la carotte en rondelles.",
      "Dresser dans un bol : riz, feta et carottes. Assaisonner d'huile d'olive, de jus de citron, de sel et de poivre."
    ]
  },
  {
    "id": "plat-bowl-poulet-pates-completes-epinards-sauce-t",
    "nom": "Bowl poulet-pates completes, epinards & sauce tomate",
    "type": "plat",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "motsCles": [
      "poulet",
      "pates",
      "epinard"
    ],
    "kcal": 555,
    "proteines": 54,
    "glucides": 67,
    "lipides": 8,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Filet de poulet",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Pates completes",
        "quantite": 80,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Epinards frais",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pates completes al dente dans l'eau bouillante salee.",
      "Couper le filet de poulet en des et le poeler 6 a 7 minutes a feu moyen-vif, jusqu'a ce qu'il soit dore et cuit a coeur.",
      "Faire tomber les epinards 2 minutes a la poele.",
      "Dresser dans un bol : pates completes, poulet et epinards. Napper de sauce tomate mijotee avec des herbes."
    ]
  },
  {
    "id": "plat-bowl-dinde-pommes-de-terre-salade-sauce-soja",
    "nom": "Bowl dinde-pommes de terre, salade & sauce soja & sesame",
    "type": "plat",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "soja",
      "gluten",
      "sesame"
    ],
    "motsCles": [
      "dinde",
      "pomme de terre",
      "salade"
    ],
    "kcal": 370,
    "proteines": 41,
    "glucides": 42,
    "lipides": 4,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Escalope de dinde",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Pomme de terre",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Salade verte",
        "quantite": 60,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Sauce soja",
        "quantite": 2,
        "unite": "c. a soupe",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre 18 minutes a l'eau salee.",
      "Poeler l'escalope de dinde 4 minutes par face, puis l'emincer.",
      "Laver la salade et la couper.",
      "Dresser dans un bol : pommes de terre, dinde et salade. Napper de sauce soja et parsemer de graines de sesame."
    ]
  },
  {
    "id": "plat-bowl-boeuf-semoule-haricots-verts-yaourt-cit",
    "nom": "Bowl boeuf-semoule, haricots verts & yaourt citron",
    "type": "plat",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose",
      "gluten"
    ],
    "motsCles": [
      "boeuf",
      "semoule",
      "haricot"
    ],
    "kcal": 470,
    "proteines": 43,
    "glucides": 55,
    "lipides": 9,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Boeuf hache 5%",
        "quantite": 120,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "Semoule",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Haricots verts",
        "quantite": 150,
        "unite": "g",
        "rayon": "Surgeles"
      },
      {
        "nom": "Yaourt nature",
        "quantite": 40,
        "unite": "g",
        "rayon": "Cremerie"
      }
    ],
    "etapes": [
      "Couvrir la semoule d'eau bouillante salee a hauteur, laisser gonfler 5 minutes et l'aerer.",
      "Saisir le boeuf hache 5 minutes a feu vif en l'emiettant ; assaisonner.",
      "Cuire les haricots verts 8 a 10 minutes.",
      "Dresser dans un bol : semoule, boeuf et haricots verts. Servir avec une sauce yaourt-citron (yaourt, citron, sel)."
    ]
  },
  {
    "id": "plat-bowl-saumon-boulgour-brocoli-curry-coco",
    "nom": "Bowl saumon-boulgour, brocoli & curry coco",
    "type": "plat",
    "cuisines": [
      "indienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson",
      "gluten"
    ],
    "motsCles": [
      "saumon",
      "boulgour",
      "brocoli"
    ],
    "kcal": 620,
    "proteines": 44,
    "glucides": 54,
    "lipides": 26,
    "tempsMinutes": 25,
    "ingredients": [
      {
        "nom": "Pave de saumon",
        "quantite": 130,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "Boulgour",
        "quantite": 60,
        "unite": "g",
        "rayon": "Epicerie"
      },
      {
        "nom": "Brocoli",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & legumes"
      },
      {
        "nom": "Lait de coco",
        "quantite": 60,
        "unite": "ml",
        "rayon": "Epicerie"
      }
    ],
    "etapes": [
      "Cuire le boulgour 12 minutes dans l'eau salee, puis l'egoutter.",
      "Poeler le saumon 4 minutes cote peau puis 2 a 3 minutes de l'autre cote.",
      "Cuire le brocoli 7 minutes a la vapeur (il reste croquant).",
      "Dresser dans un bol : boulgour, saumon et brocoli. Mijoter 5 minutes avec le lait de coco et une cuillere de curry."
    ]
  },
];

module.exports = { RECIPES };
