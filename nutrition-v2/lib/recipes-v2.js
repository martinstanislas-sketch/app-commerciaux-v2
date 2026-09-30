// recipes-v2.js — banque My Coach Nutrition reconstruite (refonte complète).
// 382 recettes validées (92 petits-déj, 63 collations, 227 plats).
// Schéma : id, nom, type, categorie, gout, cuisines[], regime[], budget, allergenes[],
//          kcal/proteines/glucides/lipides, tempsMinutes, motsCles[], ingredients[{nom,quantite,unite,rayon}], etapes[].
// Généré automatiquement depuis les lots validés. Ancienne version : recipes-v2.js.bak-avant-lot-pd-eco

const RECIPES = [
  {
    "id": "pd-skyr-banane-muesli",
    "nom": "Skyr banane muesli",
    "type": "petit-dejeuner",
    "categorie": "bol",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose",
      "gluten"
    ],
    "kcal": 390,
    "proteines": 28,
    "glucides": 52,
    "lipides": 8,
    "tempsMinutes": 3,
    "motsCles": [
      "skyr",
      "banane",
      "muesli"
    ],
    "ingredients": [
      {
        "nom": "skyr nature",
        "quantite": 200,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "muesli",
        "quantite": 40,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Verser le skyr dans un bol.",
      "Ajouter la banane en rondelles.",
      "Ajouter le muesli."
    ]
  },
  {
    "id": "pd-fromage-blanc-pomme-avoine",
    "nom": "Fromage blanc pomme avoine",
    "type": "petit-dejeuner",
    "categorie": "bol",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose",
      "gluten"
    ],
    "kcal": 360,
    "proteines": 24,
    "glucides": 48,
    "lipides": 7,
    "tempsMinutes": 4,
    "motsCles": [
      "fromage blanc",
      "pomme",
      "avoine"
    ],
    "ingredients": [
      {
        "nom": "fromage blanc",
        "quantite": 200,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "pomme",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "flocons d'avoine",
        "quantite": 35,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "miel",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Verser le fromage blanc dans un bol.",
      "Ajouter la pomme coupée.",
      "Ajouter l'avoine et le miel."
    ]
  },
  {
    "id": "pd-fromage-blanc-compote-cereales",
    "nom": "Fromage blanc compote céréales",
    "type": "petit-dejeuner",
    "categorie": "bol",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose",
      "gluten"
    ],
    "kcal": 340,
    "proteines": 23,
    "glucides": 50,
    "lipides": 5,
    "tempsMinutes": 2,
    "motsCles": [
      "fromage blanc",
      "compote",
      "céréales"
    ],
    "ingredients": [
      {
        "nom": "fromage blanc",
        "quantite": 200,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "compote sans sucres ajoutés",
        "quantite": 100,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "céréales complètes",
        "quantite": 35,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Verser le fromage blanc dans un bol.",
      "Ajouter la compote.",
      "Ajouter les céréales."
    ]
  },
  {
    "id": "pd-yaourt-banane-cereales",
    "nom": "Yaourt banane céréales",
    "type": "petit-dejeuner",
    "categorie": "bol",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose",
      "gluten"
    ],
    "kcal": 350,
    "proteines": 17,
    "glucides": 55,
    "lipides": 7,
    "tempsMinutes": 2,
    "motsCles": [
      "yaourt",
      "banane",
      "céréales"
    ],
    "ingredients": [
      {
        "nom": "yaourt nature",
        "quantite": 200,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "céréales complètes",
        "quantite": 35,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Verser le yaourt dans un bol.",
      "Ajouter la banane en rondelles.",
      "Ajouter les céréales."
    ]
  },
  {
    "id": "pd-skyr-pomme-cannelle",
    "nom": "Skyr pomme cannelle",
    "type": "petit-dejeuner",
    "categorie": "bol",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose",
      "gluten"
    ],
    "kcal": 355,
    "proteines": 27,
    "glucides": 46,
    "lipides": 6,
    "tempsMinutes": 4,
    "motsCles": [
      "skyr",
      "pomme",
      "avoine"
    ],
    "ingredients": [
      {
        "nom": "skyr nature",
        "quantite": 200,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "pomme",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "flocons d'avoine",
        "quantite": 30,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "cannelle",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Verser le skyr dans un bol.",
      "Ajouter la pomme coupée.",
      "Ajouter l'avoine et la cannelle."
    ]
  },
  {
    "id": "pd-fromage-blanc-banane-avoine",
    "nom": "Fromage blanc banane avoine",
    "type": "petit-dejeuner",
    "categorie": "bol",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose",
      "gluten"
    ],
    "kcal": 370,
    "proteines": 24,
    "glucides": 55,
    "lipides": 6,
    "tempsMinutes": 3,
    "motsCles": [
      "fromage blanc",
      "banane",
      "avoine"
    ],
    "ingredients": [
      {
        "nom": "fromage blanc",
        "quantite": 200,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "flocons d'avoine",
        "quantite": 35,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Verser le fromage blanc dans un bol.",
      "Ajouter la banane en rondelles.",
      "Ajouter l'avoine."
    ]
  },
  {
    "id": "pd-yaourt-pomme-muesli",
    "nom": "Yaourt pomme muesli",
    "type": "petit-dejeuner",
    "categorie": "bol",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose",
      "gluten"
    ],
    "kcal": 345,
    "proteines": 18,
    "glucides": 50,
    "lipides": 7,
    "tempsMinutes": 3,
    "motsCles": [
      "yaourt",
      "pomme",
      "muesli"
    ],
    "ingredients": [
      {
        "nom": "yaourt nature",
        "quantite": 200,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "pomme",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "muesli",
        "quantite": 35,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Verser le yaourt dans un bol.",
      "Ajouter la pomme coupée.",
      "Ajouter le muesli."
    ]
  },
  {
    "id": "pd-skyr-compote-corn-flakes",
    "nom": "Skyr compote corn flakes",
    "type": "petit-dejeuner",
    "categorie": "bol",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose",
      "gluten"
    ],
    "kcal": 330,
    "proteines": 27,
    "glucides": 49,
    "lipides": 3,
    "tempsMinutes": 2,
    "motsCles": [
      "skyr",
      "compote",
      "corn flakes"
    ],
    "ingredients": [
      {
        "nom": "skyr nature",
        "quantite": 200,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "compote sans sucres ajoutés",
        "quantite": 100,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "corn flakes",
        "quantite": 30,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Verser le skyr dans un bol.",
      "Ajouter la compote.",
      "Ajouter les corn flakes."
    ]
  },
  {
    "id": "pd-fromage-blanc-poire-muesli",
    "nom": "Fromage blanc poire muesli",
    "type": "petit-dejeuner",
    "categorie": "bol",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose",
      "gluten"
    ],
    "kcal": 360,
    "proteines": 24,
    "glucides": 49,
    "lipides": 7,
    "tempsMinutes": 3,
    "motsCles": [
      "fromage blanc",
      "poire",
      "muesli"
    ],
    "ingredients": [
      {
        "nom": "fromage blanc",
        "quantite": 200,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "poire",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "muesli",
        "quantite": 35,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Verser le fromage blanc dans un bol.",
      "Ajouter la poire coupée.",
      "Ajouter le muesli."
    ]
  },
  {
    "id": "pd-yaourt-grec-miel-banane",
    "nom": "Yaourt grec miel banane",
    "type": "petit-dejeuner",
    "categorie": "bol",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose"
    ],
    "kcal": 370,
    "proteines": 22,
    "glucides": 42,
    "lipides": 12,
    "tempsMinutes": 2,
    "motsCles": [
      "yaourt grec",
      "miel",
      "banane"
    ],
    "ingredients": [
      {
        "nom": "yaourt grec",
        "quantite": 200,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "miel",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Verser le yaourt grec dans un bol.",
      "Ajouter la banane en rondelles.",
      "Ajouter le miel."
    ]
  },
  {
    "id": "pd-skyr-fruits-rouges-muesli",
    "nom": "Skyr fruits rouges muesli",
    "type": "petit-dejeuner",
    "categorie": "bol",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose",
      "gluten"
    ],
    "kcal": 370,
    "proteines": 28,
    "glucides": 45,
    "lipides": 7,
    "tempsMinutes": 3,
    "motsCles": [
      "skyr",
      "fruits rouges",
      "muesli"
    ],
    "ingredients": [
      {
        "nom": "skyr nature",
        "quantite": 200,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "fruits rouges",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "muesli",
        "quantite": 35,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Verser le skyr dans un bol.",
      "Ajouter les fruits rouges.",
      "Ajouter le muesli."
    ]
  },
  {
    "id": "pd-fromage-blanc-fraises-cereales",
    "nom": "Fromage blanc fraises céréales",
    "type": "petit-dejeuner",
    "categorie": "bol",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose",
      "gluten"
    ],
    "kcal": 350,
    "proteines": 24,
    "glucides": 45,
    "lipides": 6,
    "tempsMinutes": 3,
    "motsCles": [
      "fromage blanc",
      "fraises",
      "céréales"
    ],
    "ingredients": [
      {
        "nom": "fromage blanc",
        "quantite": 200,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "fraises",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "céréales complètes",
        "quantite": 35,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Verser le fromage blanc dans un bol.",
      "Ajouter les fraises coupées.",
      "Ajouter les céréales."
    ]
  },
  {
    "id": "pd-skyr-kiwi-avoine",
    "nom": "Skyr kiwi avoine",
    "type": "petit-dejeuner",
    "categorie": "bol",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose",
      "gluten"
    ],
    "kcal": 345,
    "proteines": 27,
    "glucides": 43,
    "lipides": 6,
    "tempsMinutes": 4,
    "motsCles": [
      "skyr",
      "kiwi",
      "avoine"
    ],
    "ingredients": [
      {
        "nom": "skyr nature",
        "quantite": 200,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "kiwi",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "flocons d'avoine",
        "quantite": 30,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "miel",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Verser le skyr dans un bol.",
      "Ajouter le kiwi coupé.",
      "Ajouter l'avoine et le miel."
    ]
  },
  {
    "id": "pd-yaourt-grec-peche-muesli",
    "nom": "Yaourt grec pêche muesli",
    "type": "petit-dejeuner",
    "categorie": "bol",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose",
      "gluten"
    ],
    "kcal": 390,
    "proteines": 23,
    "glucides": 46,
    "lipides": 13,
    "tempsMinutes": 3,
    "motsCles": [
      "yaourt grec",
      "pêche",
      "muesli"
    ],
    "ingredients": [
      {
        "nom": "yaourt grec",
        "quantite": 200,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "pêche",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "muesli",
        "quantite": 35,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Verser le yaourt grec dans un bol.",
      "Ajouter la pêche coupée.",
      "Ajouter le muesli."
    ]
  },
  {
    "id": "pd-fromage-blanc-banane-cacahuete",
    "nom": "Fromage blanc banane cacahuète",
    "type": "petit-dejeuner",
    "categorie": "bol",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose",
      "arachide"
    ],
    "kcal": 420,
    "proteines": 26,
    "glucides": 42,
    "lipides": 14,
    "tempsMinutes": 3,
    "motsCles": [
      "fromage blanc",
      "banane",
      "cacahuète"
    ],
    "ingredients": [
      {
        "nom": "fromage blanc",
        "quantite": 200,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "beurre de cacahuète",
        "quantite": 15,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Verser le fromage blanc dans un bol.",
      "Ajouter la banane en rondelles.",
      "Ajouter le beurre de cacahuète."
    ]
  },
  {
    "id": "pd-skyr-clementine-cereales",
    "nom": "Skyr clémentine céréales",
    "type": "petit-dejeuner",
    "categorie": "bol",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose",
      "gluten"
    ],
    "kcal": 340,
    "proteines": 27,
    "glucides": 47,
    "lipides": 4,
    "tempsMinutes": 3,
    "motsCles": [
      "skyr",
      "clémentine",
      "céréales"
    ],
    "ingredients": [
      {
        "nom": "skyr nature",
        "quantite": 200,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "clémentine",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "céréales complètes",
        "quantite": 30,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Verser le skyr dans un bol.",
      "Ajouter les quartiers de clémentine.",
      "Ajouter les céréales."
    ]
  },
  {
    "id": "pd-yaourt-chocolat-banane",
    "nom": "Yaourt chocolat banane",
    "type": "petit-dejeuner",
    "categorie": "bol",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose",
      "gluten"
    ],
    "kcal": 410,
    "proteines": 20,
    "glucides": 52,
    "lipides": 13,
    "tempsMinutes": 4,
    "motsCles": [
      "yaourt",
      "chocolat",
      "banane"
    ],
    "ingredients": [
      {
        "nom": "yaourt nature",
        "quantite": 200,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "flocons d'avoine",
        "quantite": 30,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "chocolat noir",
        "quantite": 10,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Verser le yaourt dans un bol.",
      "Ajouter la banane en rondelles.",
      "Ajouter l'avoine et le chocolat."
    ]
  },
  {
    "id": "pd-fromage-blanc-fruits-rouges",
    "nom": "Fromage blanc fruits rouges",
    "type": "petit-dejeuner",
    "categorie": "bol",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose"
    ],
    "kcal": 350,
    "proteines": 25,
    "glucides": 34,
    "lipides": 12,
    "tempsMinutes": 3,
    "motsCles": [
      "fromage blanc",
      "fruits rouges",
      "chia"
    ],
    "ingredients": [
      {
        "nom": "fromage blanc",
        "quantite": 200,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "fruits rouges",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "graines de chia",
        "quantite": 15,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "miel",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Verser le fromage blanc dans un bol.",
      "Ajouter les fruits rouges.",
      "Ajouter les graines de chia et le miel."
    ]
  },
  {
    "id": "pd-tartines-beurre-confiture",
    "nom": "Tartines beurre confiture",
    "type": "petit-dejeuner",
    "categorie": "tartine",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 330,
    "proteines": 9,
    "glucides": 48,
    "lipides": 11,
    "tempsMinutes": 3,
    "motsCles": [
      "pain",
      "beurre",
      "confiture"
    ],
    "ingredients": [
      {
        "nom": "pain complet",
        "quantite": 2,
        "unite": "tranche",
        "rayon": "Boulangerie"
      },
      {
        "nom": "beurre",
        "quantite": 10,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "confiture",
        "quantite": 20,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Faire griller le pain si souhaité.",
      "Tartiner le beurre.",
      "Ajouter la confiture."
    ]
  },
  {
    "id": "pd-tartines-beurre-de-cacahuete-banane",
    "nom": "Tartines beurre de cacahuète banane",
    "type": "petit-dejeuner",
    "categorie": "tartine",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "arachide"
    ],
    "kcal": 420,
    "proteines": 15,
    "glucides": 55,
    "lipides": 16,
    "tempsMinutes": 4,
    "motsCles": [
      "pain",
      "cacahuète",
      "banane"
    ],
    "ingredients": [
      {
        "nom": "pain complet",
        "quantite": 2,
        "unite": "tranche",
        "rayon": "Boulangerie"
      },
      {
        "nom": "beurre de cacahuète",
        "quantite": 20,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Tartiner le pain avec le beurre de cacahuète.",
      "Couper la banane en rondelles.",
      "Déposer la banane sur les tartines."
    ]
  },
  {
    "id": "pd-toast-fromage-frais-miel",
    "nom": "Toast fromage frais miel",
    "type": "petit-dejeuner",
    "categorie": "tartine",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 310,
    "proteines": 12,
    "glucides": 42,
    "lipides": 9,
    "tempsMinutes": 3,
    "motsCles": [
      "pain",
      "fromage frais",
      "miel"
    ],
    "ingredients": [
      {
        "nom": "pain complet",
        "quantite": 2,
        "unite": "tranche",
        "rayon": "Boulangerie"
      },
      {
        "nom": "fromage frais",
        "quantite": 40,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "miel",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Faire griller le pain.",
      "Tartiner le fromage frais.",
      "Ajouter le miel."
    ]
  },
  {
    "id": "pd-toast-ricotta-fruits-rouges",
    "nom": "Toast ricotta fruits rouges",
    "type": "petit-dejeuner",
    "categorie": "tartine",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 340,
    "proteines": 14,
    "glucides": 45,
    "lipides": 11,
    "tempsMinutes": 5,
    "motsCles": [
      "pain",
      "ricotta",
      "fruits rouges"
    ],
    "ingredients": [
      {
        "nom": "pain complet",
        "quantite": 2,
        "unite": "tranche",
        "rayon": "Boulangerie"
      },
      {
        "nom": "ricotta",
        "quantite": 60,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "fruits rouges",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Faire griller le pain.",
      "Étaler la ricotta.",
      "Ajouter les fruits rouges."
    ]
  },
  {
    "id": "pd-tartines-chocolat-banane",
    "nom": "Tartines chocolat banane",
    "type": "petit-dejeuner",
    "categorie": "tartine",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "kcal": 390,
    "proteines": 9,
    "glucides": 60,
    "lipides": 12,
    "tempsMinutes": 4,
    "motsCles": [
      "pain",
      "chocolat",
      "banane"
    ],
    "ingredients": [
      {
        "nom": "pain complet",
        "quantite": 2,
        "unite": "tranche",
        "rayon": "Boulangerie"
      },
      {
        "nom": "chocolat noir",
        "quantite": 15,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Faire griller le pain.",
      "Ajouter le chocolat noir en copeaux.",
      "Ajouter la banane en rondelles."
    ]
  },
  {
    "id": "pd-tartines-puree-d-amandes-pomme",
    "nom": "Tartines purée d'amandes pomme",
    "type": "petit-dejeuner",
    "categorie": "tartine",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "gluten",
      "fruits-a-coque"
    ],
    "kcal": 405,
    "proteines": 12,
    "glucides": 48,
    "lipides": 18,
    "tempsMinutes": 5,
    "motsCles": [
      "pain",
      "amande",
      "pomme"
    ],
    "ingredients": [
      {
        "nom": "pain complet",
        "quantite": 2,
        "unite": "tranche",
        "rayon": "Boulangerie"
      },
      {
        "nom": "purée d'amandes",
        "quantite": 20,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "pomme",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Tartiner le pain avec la purée d'amandes.",
      "Couper la pomme en fines tranches.",
      "Ajouter la pomme sur les tartines."
    ]
  },
  {
    "id": "pd-toast-avocat-oeuf",
    "nom": "Toast avocat oeuf",
    "type": "petit-dejeuner",
    "categorie": "tartine",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "gluten",
      "oeuf"
    ],
    "kcal": 430,
    "proteines": 18,
    "glucides": 35,
    "lipides": 24,
    "tempsMinutes": 8,
    "motsCles": [
      "pain",
      "avocat",
      "oeuf"
    ],
    "ingredients": [
      {
        "nom": "pain complet",
        "quantite": 2,
        "unite": "tranche",
        "rayon": "Boulangerie"
      },
      {
        "nom": "avocat",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "oeuf",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Faire cuire les oeufs.",
      "Écraser l'avocat sur le pain.",
      "Ajouter les oeufs sur les tartines."
    ]
  },
  {
    "id": "pd-tartines-jambon-fromage",
    "nom": "Tartines jambon fromage",
    "type": "petit-dejeuner",
    "categorie": "tartine",
    "gout": "sale",
    "cuisines": [],
    "regime": [],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 380,
    "proteines": 24,
    "glucides": 36,
    "lipides": 14,
    "tempsMinutes": 4,
    "motsCles": [
      "pain",
      "jambon",
      "fromage"
    ],
    "ingredients": [
      {
        "nom": "pain complet",
        "quantite": 2,
        "unite": "tranche",
        "rayon": "Boulangerie"
      },
      {
        "nom": "jambon blanc",
        "quantite": 1,
        "unite": "tranche",
        "rayon": "Boucherie"
      },
      {
        "nom": "emmental",
        "quantite": 30,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Déposer le jambon sur le pain.",
      "Ajouter l'emmental.",
      "Faire toaster si souhaité."
    ]
  },
  {
    "id": "pd-toast-fromage-frais-tomate",
    "nom": "Toast fromage frais tomate",
    "type": "petit-dejeuner",
    "categorie": "tartine",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 300,
    "proteines": 12,
    "glucides": 38,
    "lipides": 10,
    "tempsMinutes": 4,
    "motsCles": [
      "pain",
      "fromage frais",
      "tomate"
    ],
    "ingredients": [
      {
        "nom": "pain complet",
        "quantite": 2,
        "unite": "tranche",
        "rayon": "Boulangerie"
      },
      {
        "nom": "fromage frais",
        "quantite": 50,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "tomate",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Tartiner le fromage frais sur le pain.",
      "Couper la tomate en rondelles.",
      "Ajouter la tomate sur les tartines."
    ]
  },
  {
    "id": "pd-toast-saumon-fromage-frais",
    "nom": "Toast saumon fromage frais",
    "type": "petit-dejeuner",
    "categorie": "tartine",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "gluten",
      "lactose",
      "poisson"
    ],
    "kcal": 390,
    "proteines": 25,
    "glucides": 34,
    "lipides": 17,
    "tempsMinutes": 4,
    "motsCles": [
      "pain",
      "saumon",
      "fromage frais"
    ],
    "ingredients": [
      {
        "nom": "pain complet",
        "quantite": 2,
        "unite": "tranche",
        "rayon": "Boulangerie"
      },
      {
        "nom": "saumon fumé",
        "quantite": 60,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "fromage frais",
        "quantite": 40,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Tartiner le fromage frais sur le pain.",
      "Ajouter le saumon fumé.",
      "Servir frais."
    ]
  },
  {
    "id": "pd-tartines-dinde-fromage-frais",
    "nom": "Tartines dinde fromage frais",
    "type": "petit-dejeuner",
    "categorie": "tartine",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 340,
    "proteines": 26,
    "glucides": 36,
    "lipides": 10,
    "tempsMinutes": 4,
    "motsCles": [
      "pain",
      "dinde",
      "fromage frais"
    ],
    "ingredients": [
      {
        "nom": "pain complet",
        "quantite": 2,
        "unite": "tranche",
        "rayon": "Boulangerie"
      },
      {
        "nom": "blanc de dinde",
        "quantite": 2,
        "unite": "tranche",
        "rayon": "Boucherie"
      },
      {
        "nom": "fromage frais",
        "quantite": 40,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Tartiner le fromage frais sur le pain.",
      "Ajouter le blanc de dinde.",
      "Refermer ou servir en tartines."
    ]
  },
  {
    "id": "pd-toast-mozzarella-tomate",
    "nom": "Toast mozzarella tomate",
    "type": "petit-dejeuner",
    "categorie": "tartine",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 360,
    "proteines": 18,
    "glucides": 36,
    "lipides": 16,
    "tempsMinutes": 5,
    "motsCles": [
      "pain",
      "mozzarella",
      "tomate"
    ],
    "ingredients": [
      {
        "nom": "pain complet",
        "quantite": 2,
        "unite": "tranche",
        "rayon": "Boulangerie"
      },
      {
        "nom": "mozzarella",
        "quantite": 60,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "tomate",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Couper la tomate et la mozzarella.",
      "Déposer sur le pain.",
      "Faire toaster si souhaité."
    ]
  },
  {
    "id": "pd-toast-oeuf-fromage",
    "nom": "Toast oeuf fromage",
    "type": "petit-dejeuner",
    "categorie": "tartine",
    "gout": "sale",
    "cuisines": [],
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
    "kcal": 400,
    "proteines": 24,
    "glucides": 34,
    "lipides": 18,
    "tempsMinutes": 8,
    "motsCles": [
      "pain",
      "oeuf",
      "fromage"
    ],
    "ingredients": [
      {
        "nom": "pain complet",
        "quantite": 2,
        "unite": "tranche",
        "rayon": "Boulangerie"
      },
      {
        "nom": "oeuf",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "emmental",
        "quantite": 25,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Faire cuire les oeufs.",
      "Déposer les oeufs sur le pain.",
      "Ajouter l'emmental."
    ]
  },
  {
    "id": "pd-tartines-houmous-concombre",
    "nom": "Tartines houmous concombre",
    "type": "petit-dejeuner",
    "categorie": "tartine",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "sesame"
    ],
    "kcal": 340,
    "proteines": 12,
    "glucides": 45,
    "lipides": 12,
    "tempsMinutes": 4,
    "motsCles": [
      "pain",
      "houmous",
      "concombre"
    ],
    "ingredients": [
      {
        "nom": "pain complet",
        "quantite": 2,
        "unite": "tranche",
        "rayon": "Boulangerie"
      },
      {
        "nom": "houmous",
        "quantite": 50,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "concombre",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Tartiner le houmous sur le pain.",
      "Couper le concombre.",
      "Ajouter le concombre sur les tartines."
    ]
  },
  {
    "id": "pd-tartines-thon-fromage-frais",
    "nom": "Tartines thon fromage frais",
    "type": "petit-dejeuner",
    "categorie": "tartine",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "lactose",
      "poisson"
    ],
    "kcal": 360,
    "proteines": 30,
    "glucides": 34,
    "lipides": 10,
    "tempsMinutes": 5,
    "motsCles": [
      "pain",
      "thon",
      "fromage frais"
    ],
    "ingredients": [
      {
        "nom": "pain complet",
        "quantite": 2,
        "unite": "tranche",
        "rayon": "Boulangerie"
      },
      {
        "nom": "thon au naturel",
        "quantite": 80,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "fromage frais",
        "quantite": 40,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Égoutter le thon.",
      "Mélanger avec le fromage frais.",
      "Déposer sur le pain."
    ]
  },
  {
    "id": "pd-toast-avocat-dinde",
    "nom": "Toast avocat dinde",
    "type": "petit-dejeuner",
    "categorie": "tartine",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "gluten"
    ],
    "kcal": 410,
    "proteines": 24,
    "glucides": 35,
    "lipides": 20,
    "tempsMinutes": 5,
    "motsCles": [
      "pain",
      "avocat",
      "dinde"
    ],
    "ingredients": [
      {
        "nom": "pain complet",
        "quantite": 2,
        "unite": "tranche",
        "rayon": "Boulangerie"
      },
      {
        "nom": "avocat",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "blanc de dinde",
        "quantite": 2,
        "unite": "tranche",
        "rayon": "Boucherie"
      }
    ],
    "etapes": [
      "Écraser l'avocat sur le pain.",
      "Ajouter le blanc de dinde.",
      "Servir en tartines."
    ]
  },
  {
    "id": "pd-tartines-chevre-miel",
    "nom": "Tartines chèvre miel",
    "type": "petit-dejeuner",
    "categorie": "tartine",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 370,
    "proteines": 16,
    "glucides": 42,
    "lipides": 15,
    "tempsMinutes": 5,
    "motsCles": [
      "pain",
      "chèvre",
      "miel"
    ],
    "ingredients": [
      {
        "nom": "pain complet",
        "quantite": 2,
        "unite": "tranche",
        "rayon": "Boulangerie"
      },
      {
        "nom": "chèvre frais",
        "quantite": 50,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "miel",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Tartiner le chèvre sur le pain.",
      "Ajouter le miel.",
      "Servir tel quel ou toaster légèrement."
    ]
  },
  {
    "id": "pd-toast-banane-cannelle",
    "nom": "Toast banane cannelle",
    "type": "petit-dejeuner",
    "categorie": "tartine",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "kcal": 310,
    "proteines": 8,
    "glucides": 58,
    "lipides": 5,
    "tempsMinutes": 4,
    "motsCles": [
      "pain",
      "banane",
      "cannelle"
    ],
    "ingredients": [
      {
        "nom": "pain complet",
        "quantite": 2,
        "unite": "tranche",
        "rayon": "Boulangerie"
      },
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "cannelle",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Faire griller le pain.",
      "Écraser ou couper la banane.",
      "Ajouter la cannelle."
    ]
  },
  {
    "id": "pd-ufs-brouilles-pain-complet",
    "nom": "Œufs brouillés pain complet",
    "type": "petit-dejeuner",
    "categorie": "oeufs",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "oeuf",
      "gluten",
      "lactose"
    ],
    "kcal": 390,
    "proteines": 24,
    "glucides": 34,
    "lipides": 17,
    "tempsMinutes": 8,
    "motsCles": [
      "oeuf",
      "pain",
      "beurre"
    ],
    "ingredients": [
      {
        "nom": "oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "pain complet",
        "quantite": 2,
        "unite": "tranche",
        "rayon": "Boulangerie"
      },
      {
        "nom": "beurre",
        "quantite": 10,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Battre les oeufs.",
      "Cuire doucement avec le beurre.",
      "Servir avec le pain complet."
    ]
  },
  {
    "id": "pd-omelette-jambon-fromage",
    "nom": "Omelette jambon fromage",
    "type": "petit-dejeuner",
    "categorie": "oeufs",
    "gout": "sale",
    "cuisines": [],
    "regime": [],
    "budget": "eco",
    "allergenes": [
      "oeuf",
      "lactose"
    ],
    "kcal": 360,
    "proteines": 31,
    "glucides": 2,
    "lipides": 25,
    "tempsMinutes": 8,
    "motsCles": [
      "oeuf",
      "jambon",
      "fromage"
    ],
    "ingredients": [
      {
        "nom": "oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "jambon blanc",
        "quantite": 1,
        "unite": "tranche",
        "rayon": "Boucherie"
      },
      {
        "nom": "emmental",
        "quantite": 30,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Battre les oeufs.",
      "Ajouter le jambon en morceaux.",
      "Cuire avec l'emmental."
    ]
  },
  {
    "id": "pd-ufs-durs-pain-fromage",
    "nom": "Œufs durs pain fromage",
    "type": "petit-dejeuner",
    "categorie": "oeufs",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "oeuf",
      "gluten",
      "lactose"
    ],
    "kcal": 410,
    "proteines": 26,
    "glucides": 35,
    "lipides": 19,
    "tempsMinutes": 10,
    "motsCles": [
      "oeuf",
      "pain",
      "fromage"
    ],
    "ingredients": [
      {
        "nom": "oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "pain complet",
        "quantite": 2,
        "unite": "tranche",
        "rayon": "Boulangerie"
      },
      {
        "nom": "emmental",
        "quantite": 30,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Cuire les oeufs dans l'eau bouillante.",
      "Écaler les oeufs.",
      "Servir avec le pain et l'emmental."
    ]
  },
  {
    "id": "pd-omelette-nature",
    "nom": "Omelette nature",
    "type": "petit-dejeuner",
    "categorie": "oeufs",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "oeuf"
    ],
    "kcal": 260,
    "proteines": 19,
    "glucides": 1,
    "lipides": 20,
    "tempsMinutes": 6,
    "motsCles": [
      "oeuf",
      "huile"
    ],
    "ingredients": [
      {
        "nom": "oeufs",
        "quantite": 3,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Battre les oeufs.",
      "Chauffer l'huile dans une poêle.",
      "Cuire l'omelette quelques minutes."
    ]
  },
  {
    "id": "pd-omelette-champignons",
    "nom": "Omelette champignons",
    "type": "petit-dejeuner",
    "categorie": "oeufs",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "oeuf"
    ],
    "kcal": 290,
    "proteines": 22,
    "glucides": 4,
    "lipides": 21,
    "tempsMinutes": 10,
    "motsCles": [
      "oeuf",
      "champignons"
    ],
    "ingredients": [
      {
        "nom": "oeufs",
        "quantite": 3,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "champignons",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Faire revenir les champignons.",
      "Battre les oeufs.",
      "Verser les oeufs et cuire l'omelette."
    ]
  },
  {
    "id": "pd-ufs-brouilles-tomate",
    "nom": "Œufs brouillés tomate",
    "type": "petit-dejeuner",
    "categorie": "oeufs",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "oeuf",
      "lactose"
    ],
    "kcal": 300,
    "proteines": 22,
    "glucides": 5,
    "lipides": 21,
    "tempsMinutes": 8,
    "motsCles": [
      "oeuf",
      "tomate",
      "fromage frais"
    ],
    "ingredients": [
      {
        "nom": "oeufs",
        "quantite": 3,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "tomate",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "fromage frais",
        "quantite": 30,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Couper la tomate.",
      "Battre les oeufs avec le fromage frais.",
      "Cuire doucement avec la tomate."
    ]
  },
  {
    "id": "pd-omelette-fromage",
    "nom": "Omelette fromage",
    "type": "petit-dejeuner",
    "categorie": "oeufs",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "oeuf",
      "lactose"
    ],
    "kcal": 350,
    "proteines": 27,
    "glucides": 1,
    "lipides": 27,
    "tempsMinutes": 7,
    "motsCles": [
      "oeuf",
      "fromage"
    ],
    "ingredients": [
      {
        "nom": "oeufs",
        "quantite": 3,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "emmental",
        "quantite": 30,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Battre les oeufs.",
      "Verser dans une poêle chaude.",
      "Ajouter l'emmental et cuire."
    ]
  },
  {
    "id": "pd-ufs-au-plat-pain-complet",
    "nom": "Œufs au plat pain complet",
    "type": "petit-dejeuner",
    "categorie": "oeufs",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "oeuf",
      "gluten"
    ],
    "kcal": 360,
    "proteines": 20,
    "glucides": 34,
    "lipides": 16,
    "tempsMinutes": 6,
    "motsCles": [
      "oeuf",
      "pain"
    ],
    "ingredients": [
      {
        "nom": "oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "pain complet",
        "quantite": 2,
        "unite": "tranche",
        "rayon": "Boulangerie"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Chauffer l'huile dans une poêle.",
      "Cuire les oeufs au plat.",
      "Servir avec le pain complet."
    ]
  },
  {
    "id": "pd-omelette-dinde-fromage",
    "nom": "Omelette dinde fromage",
    "type": "petit-dejeuner",
    "categorie": "oeufs",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "oeuf",
      "lactose"
    ],
    "kcal": 365,
    "proteines": 36,
    "glucides": 1,
    "lipides": 23,
    "tempsMinutes": 8,
    "motsCles": [
      "oeuf",
      "dinde",
      "fromage"
    ],
    "ingredients": [
      {
        "nom": "oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "blanc de dinde",
        "quantite": 2,
        "unite": "tranche",
        "rayon": "Boucherie"
      },
      {
        "nom": "emmental",
        "quantite": 30,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Battre les oeufs.",
      "Ajouter la dinde en morceaux.",
      "Cuire avec l'emmental."
    ]
  },
  {
    "id": "pd-ufs-brouilles-avocat",
    "nom": "Œufs brouillés avocat",
    "type": "petit-dejeuner",
    "categorie": "oeufs",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "oeuf",
      "lactose"
    ],
    "kcal": 420,
    "proteines": 22,
    "glucides": 8,
    "lipides": 34,
    "tempsMinutes": 8,
    "motsCles": [
      "oeuf",
      "avocat",
      "fromage frais"
    ],
    "ingredients": [
      {
        "nom": "oeufs",
        "quantite": 3,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "avocat",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "fromage frais",
        "quantite": 30,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Battre les oeufs avec le fromage frais.",
      "Cuire les oeufs brouillés.",
      "Servir avec l'avocat."
    ]
  },
  {
    "id": "pd-omelette-epinards-fromage",
    "nom": "Omelette épinards fromage",
    "type": "petit-dejeuner",
    "categorie": "oeufs",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "oeuf",
      "lactose"
    ],
    "kcal": 340,
    "proteines": 27,
    "glucides": 4,
    "lipides": 24,
    "tempsMinutes": 10,
    "motsCles": [
      "oeuf",
      "épinards",
      "fromage"
    ],
    "ingredients": [
      {
        "nom": "oeufs",
        "quantite": 3,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "épinards",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "emmental",
        "quantite": 25,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Faire revenir les épinards.",
      "Ajouter les oeufs battus.",
      "Ajouter le fromage et cuire."
    ]
  },
  {
    "id": "pd-ufs-durs-avocat",
    "nom": "Œufs durs avocat",
    "type": "petit-dejeuner",
    "categorie": "oeufs",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "oeuf"
    ],
    "kcal": 360,
    "proteines": 18,
    "glucides": 8,
    "lipides": 28,
    "tempsMinutes": 10,
    "motsCles": [
      "oeuf",
      "avocat"
    ],
    "ingredients": [
      {
        "nom": "oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "avocat",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Cuire les oeufs dans l'eau bouillante.",
      "Écaler les oeufs.",
      "Servir avec l'avocat."
    ]
  },
  {
    "id": "pd-porridge-banane",
    "nom": "Porridge banane",
    "type": "petit-dejeuner",
    "categorie": "pancake-porridge",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 385,
    "proteines": 18,
    "glucides": 62,
    "lipides": 8,
    "tempsMinutes": 8,
    "motsCles": [
      "avoine",
      "banane",
      "lait"
    ],
    "ingredients": [
      {
        "nom": "flocons d'avoine",
        "quantite": 50,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "lait demi-écrémé",
        "quantite": 200,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Chauffer le lait avec les flocons d'avoine.",
      "Remuer jusqu'à épaississement.",
      "Ajouter la banane en rondelles."
    ]
  },
  {
    "id": "pd-porridge-pomme-cannelle",
    "nom": "Porridge pomme cannelle",
    "type": "petit-dejeuner",
    "categorie": "pancake-porridge",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 360,
    "proteines": 16,
    "glucides": 58,
    "lipides": 7,
    "tempsMinutes": 10,
    "motsCles": [
      "avoine",
      "pomme",
      "cannelle"
    ],
    "ingredients": [
      {
        "nom": "flocons d'avoine",
        "quantite": 50,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "lait demi-écrémé",
        "quantite": 200,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "pomme",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "cannelle",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Chauffer le lait avec l'avoine.",
      "Ajouter la pomme coupée.",
      "Terminer avec la cannelle."
    ]
  },
  {
    "id": "pd-porridge-chocolat",
    "nom": "Porridge chocolat",
    "type": "petit-dejeuner",
    "categorie": "pancake-porridge",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 390,
    "proteines": 17,
    "glucides": 56,
    "lipides": 11,
    "tempsMinutes": 8,
    "motsCles": [
      "avoine",
      "chocolat",
      "lait"
    ],
    "ingredients": [
      {
        "nom": "flocons d'avoine",
        "quantite": 50,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "lait demi-écrémé",
        "quantite": 200,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "chocolat noir",
        "quantite": 15,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Chauffer le lait avec les flocons d'avoine.",
      "Ajouter le chocolat noir.",
      "Mélanger jusqu'à obtenir une texture crémeuse."
    ]
  },
  {
    "id": "pd-overnight-oats-banane",
    "nom": "Overnight oats banane",
    "type": "petit-dejeuner",
    "categorie": "pancake-porridge",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 410,
    "proteines": 24,
    "glucides": 58,
    "lipides": 9,
    "tempsMinutes": 5,
    "motsCles": [
      "avoine",
      "skyr",
      "banane"
    ],
    "ingredients": [
      {
        "nom": "flocons d'avoine",
        "quantite": 45,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "skyr nature",
        "quantite": 150,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "lait demi-écrémé",
        "quantite": 100,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Mélanger l'avoine, le skyr et le lait.",
      "Ajouter la banane en rondelles.",
      "Laisser au frais idéalement toute la nuit."
    ]
  },
  {
    "id": "pd-overnight-oats-fruits-rouges",
    "nom": "Overnight oats fruits rouges",
    "type": "petit-dejeuner",
    "categorie": "pancake-porridge",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 380,
    "proteines": 24,
    "glucides": 48,
    "lipides": 9,
    "tempsMinutes": 5,
    "motsCles": [
      "avoine",
      "skyr",
      "fruits rouges"
    ],
    "ingredients": [
      {
        "nom": "flocons d'avoine",
        "quantite": 40,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "skyr nature",
        "quantite": 150,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "lait demi-écrémé",
        "quantite": 100,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "fruits rouges",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Mélanger l'avoine, le skyr et le lait.",
      "Ajouter les fruits rouges.",
      "Placer au frais avant de manger."
    ]
  },
  {
    "id": "pd-pancakes-banane",
    "nom": "Pancakes banane",
    "type": "petit-dejeuner",
    "categorie": "pancake-porridge",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "oeuf",
      "lactose"
    ],
    "kcal": 420,
    "proteines": 22,
    "glucides": 58,
    "lipides": 11,
    "tempsMinutes": 15,
    "motsCles": [
      "banane",
      "oeuf",
      "avoine"
    ],
    "ingredients": [
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "flocons d'avoine",
        "quantite": 40,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "fromage blanc",
        "quantite": 100,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Écraser la banane.",
      "Mélanger avec les oeufs et l'avoine.",
      "Cuire en petits pancakes et servir avec le fromage blanc."
    ]
  },
  {
    "id": "pd-pancakes-fromage-blanc",
    "nom": "Pancakes fromage blanc",
    "type": "petit-dejeuner",
    "categorie": "pancake-porridge",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "oeuf",
      "lactose"
    ],
    "kcal": 395,
    "proteines": 26,
    "glucides": 45,
    "lipides": 11,
    "tempsMinutes": 15,
    "motsCles": [
      "oeuf",
      "fromage blanc",
      "avoine"
    ],
    "ingredients": [
      {
        "nom": "oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "fromage blanc",
        "quantite": 150,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "flocons d'avoine",
        "quantite": 40,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "miel",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Mélanger les oeufs, le fromage blanc et l'avoine.",
      "Cuire en petits pancakes.",
      "Ajouter le miel avant de servir."
    ]
  },
  {
    "id": "pd-pancakes-pomme",
    "nom": "Pancakes pomme",
    "type": "petit-dejeuner",
    "categorie": "pancake-porridge",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "oeuf",
      "lactose"
    ],
    "kcal": 405,
    "proteines": 23,
    "glucides": 52,
    "lipides": 11,
    "tempsMinutes": 15,
    "motsCles": [
      "pomme",
      "oeuf",
      "avoine"
    ],
    "ingredients": [
      {
        "nom": "pomme",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "flocons d'avoine",
        "quantite": 40,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "fromage blanc",
        "quantite": 100,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Râper ou couper finement la pomme.",
      "Mélanger avec les oeufs et l'avoine.",
      "Cuire en petits pancakes et servir avec le fromage blanc."
    ]
  },
  {
    "id": "pd-porridge-skyr-miel",
    "nom": "Porridge skyr miel",
    "type": "petit-dejeuner",
    "categorie": "pancake-porridge",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 400,
    "proteines": 28,
    "glucides": 55,
    "lipides": 7,
    "tempsMinutes": 8,
    "motsCles": [
      "avoine",
      "skyr",
      "miel"
    ],
    "ingredients": [
      {
        "nom": "flocons d'avoine",
        "quantite": 50,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "lait demi-écrémé",
        "quantite": 150,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "skyr nature",
        "quantite": 150,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "miel",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire l'avoine avec le lait.",
      "Verser dans un bol.",
      "Ajouter le skyr et le miel."
    ]
  },
  {
    "id": "pd-porridge-beurre-de-cacahuete",
    "nom": "Porridge beurre de cacahuète",
    "type": "petit-dejeuner",
    "categorie": "pancake-porridge",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "lactose",
      "arachide"
    ],
    "kcal": 445,
    "proteines": 21,
    "glucides": 54,
    "lipides": 16,
    "tempsMinutes": 8,
    "motsCles": [
      "avoine",
      "cacahuète",
      "lait"
    ],
    "ingredients": [
      {
        "nom": "flocons d'avoine",
        "quantite": 50,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "lait demi-écrémé",
        "quantite": 200,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "beurre de cacahuète",
        "quantite": 15,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Cuire l'avoine avec le lait.",
      "Ajouter le beurre de cacahuète.",
      "Servir avec la banane en rondelles."
    ]
  },
  {
    "id": "pd-wrap-jambon-fromage",
    "nom": "Wrap jambon fromage",
    "type": "petit-dejeuner",
    "categorie": "emporter",
    "gout": "sale",
    "cuisines": [],
    "regime": [],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 390,
    "proteines": 25,
    "glucides": 42,
    "lipides": 13,
    "tempsMinutes": 5,
    "motsCles": [
      "wrap",
      "jambon",
      "fromage"
    ],
    "ingredients": [
      {
        "nom": "tortilla de blé",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Boulangerie"
      },
      {
        "nom": "jambon blanc",
        "quantite": 1,
        "unite": "tranche",
        "rayon": "Boucherie"
      },
      {
        "nom": "emmental",
        "quantite": 30,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "fromage frais",
        "quantite": 30,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Tartiner la tortilla avec le fromage frais.",
      "Ajouter le jambon et l'emmental.",
      "Rouler le wrap."
    ]
  },
  {
    "id": "pd-wrap-dinde-fromage-frais",
    "nom": "Wrap dinde fromage frais",
    "type": "petit-dejeuner",
    "categorie": "emporter",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 360,
    "proteines": 28,
    "glucides": 40,
    "lipides": 9,
    "tempsMinutes": 5,
    "motsCles": [
      "wrap",
      "dinde",
      "fromage frais"
    ],
    "ingredients": [
      {
        "nom": "tortilla de blé",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Boulangerie"
      },
      {
        "nom": "blanc de dinde",
        "quantite": 2,
        "unite": "tranche",
        "rayon": "Boucherie"
      },
      {
        "nom": "fromage frais",
        "quantite": 40,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "tomate",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Tartiner la tortilla avec le fromage frais.",
      "Ajouter la dinde et la tomate.",
      "Rouler le wrap."
    ]
  },
  {
    "id": "pd-sandwich-oeuf-fromage",
    "nom": "Sandwich oeuf fromage",
    "type": "petit-dejeuner",
    "categorie": "emporter",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "oeuf",
      "lactose"
    ],
    "kcal": 420,
    "proteines": 24,
    "glucides": 42,
    "lipides": 17,
    "tempsMinutes": 10,
    "motsCles": [
      "pain",
      "oeuf",
      "fromage"
    ],
    "ingredients": [
      {
        "nom": "pain complet",
        "quantite": 2,
        "unite": "tranche",
        "rayon": "Boulangerie"
      },
      {
        "nom": "oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "emmental",
        "quantite": 25,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Faire cuire les oeufs.",
      "Déposer les oeufs sur le pain.",
      "Ajouter l'emmental et refermer."
    ]
  },
  {
    "id": "pd-bagel-saumon-fromage-frais",
    "nom": "Bagel saumon fromage frais",
    "type": "petit-dejeuner",
    "categorie": "emporter",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "gluten",
      "lactose",
      "poisson"
    ],
    "kcal": 440,
    "proteines": 27,
    "glucides": 48,
    "lipides": 15,
    "tempsMinutes": 5,
    "motsCles": [
      "bagel",
      "saumon",
      "fromage frais"
    ],
    "ingredients": [
      {
        "nom": "bagel nature",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Boulangerie"
      },
      {
        "nom": "saumon fumé",
        "quantite": 60,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "fromage frais",
        "quantite": 40,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Couper le bagel en deux.",
      "Tartiner le fromage frais.",
      "Ajouter le saumon et refermer."
    ]
  },
  {
    "id": "pd-sandwich-dinde-tomate",
    "nom": "Sandwich dinde tomate",
    "type": "petit-dejeuner",
    "categorie": "emporter",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 370,
    "proteines": 27,
    "glucides": 42,
    "lipides": 10,
    "tempsMinutes": 5,
    "motsCles": [
      "pain",
      "dinde",
      "tomate"
    ],
    "ingredients": [
      {
        "nom": "pain complet",
        "quantite": 2,
        "unite": "tranche",
        "rayon": "Boulangerie"
      },
      {
        "nom": "blanc de dinde",
        "quantite": 2,
        "unite": "tranche",
        "rayon": "Boucherie"
      },
      {
        "nom": "fromage frais",
        "quantite": 30,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "tomate",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Tartiner le pain avec le fromage frais.",
      "Ajouter la dinde et la tomate.",
      "Refermer le sandwich."
    ]
  },
  {
    "id": "pd-wrap-banane-cacahuete",
    "nom": "Wrap banane cacahuète",
    "type": "petit-dejeuner",
    "categorie": "emporter",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "arachide"
    ],
    "kcal": 430,
    "proteines": 13,
    "glucides": 62,
    "lipides": 15,
    "tempsMinutes": 4,
    "motsCles": [
      "wrap",
      "banane",
      "cacahuète"
    ],
    "ingredients": [
      {
        "nom": "tortilla de blé",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Boulangerie"
      },
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "beurre de cacahuète",
        "quantite": 20,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Tartiner la tortilla avec le beurre de cacahuète.",
      "Ajouter la banane.",
      "Rouler le wrap."
    ]
  },
  {
    "id": "pd-sandwich-fromage-frais-miel",
    "nom": "Sandwich fromage frais miel",
    "type": "petit-dejeuner",
    "categorie": "emporter",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 330,
    "proteines": 13,
    "glucides": 46,
    "lipides": 10,
    "tempsMinutes": 4,
    "motsCles": [
      "pain",
      "fromage frais",
      "miel"
    ],
    "ingredients": [
      {
        "nom": "pain complet",
        "quantite": 2,
        "unite": "tranche",
        "rayon": "Boulangerie"
      },
      {
        "nom": "fromage frais",
        "quantite": 50,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "miel",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Tartiner le fromage frais sur le pain.",
      "Ajouter le miel.",
      "Refermer le sandwich."
    ]
  },
  {
    "id": "pd-smoothie-banane",
    "nom": "Smoothie banane",
    "type": "petit-dejeuner",
    "categorie": "smoothie",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose"
    ],
    "kcal": 330,
    "proteines": 18,
    "glucides": 55,
    "lipides": 5,
    "tempsMinutes": 3,
    "motsCles": [
      "banane",
      "lait",
      "skyr"
    ],
    "ingredients": [
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "lait demi-écrémé",
        "quantite": 200,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "skyr nature",
        "quantite": 100,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Mettre la banane dans un blender.",
      "Ajouter le lait et le skyr.",
      "Mixer jusqu'à obtenir une texture lisse."
    ]
  },
  {
    "id": "pd-smoothie-fraise-banane",
    "nom": "Smoothie fraise banane",
    "type": "petit-dejeuner",
    "categorie": "smoothie",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose"
    ],
    "kcal": 350,
    "proteines": 19,
    "glucides": 58,
    "lipides": 5,
    "tempsMinutes": 4,
    "motsCles": [
      "fraise",
      "banane",
      "lait"
    ],
    "ingredients": [
      {
        "nom": "fraises",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "lait demi-écrémé",
        "quantite": 200,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "skyr nature",
        "quantite": 100,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Mettre les fruits dans un blender.",
      "Ajouter le lait et le skyr.",
      "Mixer et servir frais."
    ]
  },
  {
    "id": "pd-shake-chocolat",
    "nom": "Shake chocolat",
    "type": "petit-dejeuner",
    "categorie": "smoothie",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose"
    ],
    "kcal": 360,
    "proteines": 32,
    "glucides": 38,
    "lipides": 8,
    "tempsMinutes": 3,
    "motsCles": [
      "whey",
      "chocolat",
      "banane"
    ],
    "ingredients": [
      {
        "nom": "whey chocolat",
        "quantite": 30,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "lait demi-écrémé",
        "quantite": 250,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Mettre le lait dans un shaker ou blender.",
      "Ajouter la whey et la banane.",
      "Mixer ou secouer."
    ]
  },
  {
    "id": "pd-smoothie-mangue",
    "nom": "Smoothie mangue",
    "type": "petit-dejeuner",
    "categorie": "smoothie",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose"
    ],
    "kcal": 340,
    "proteines": 18,
    "glucides": 54,
    "lipides": 6,
    "tempsMinutes": 4,
    "motsCles": [
      "mangue",
      "lait",
      "skyr"
    ],
    "ingredients": [
      {
        "nom": "mangue",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "lait demi-écrémé",
        "quantite": 200,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "skyr nature",
        "quantite": 100,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Mettre la mangue dans un blender.",
      "Ajouter le lait et le skyr.",
      "Mixer jusqu'à obtenir une texture lisse."
    ]
  },
  {
    "id": "pd-smoothie-pomme-banane",
    "nom": "Smoothie pomme banane",
    "type": "petit-dejeuner",
    "categorie": "smoothie",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose"
    ],
    "kcal": 345,
    "proteines": 18,
    "glucides": 60,
    "lipides": 4,
    "tempsMinutes": 4,
    "motsCles": [
      "pomme",
      "banane",
      "lait"
    ],
    "ingredients": [
      {
        "nom": "pomme",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "lait demi-écrémé",
        "quantite": 200,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "skyr nature",
        "quantite": 100,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Couper la pomme et la banane.",
      "Ajouter le lait et le skyr.",
      "Mixer quelques secondes."
    ]
  },
  {
    "id": "pd-shake-vanille-avoine",
    "nom": "Shake vanille avoine",
    "type": "petit-dejeuner",
    "categorie": "smoothie",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 420,
    "proteines": 34,
    "glucides": 50,
    "lipides": 8,
    "tempsMinutes": 3,
    "motsCles": [
      "whey",
      "avoine",
      "lait"
    ],
    "ingredients": [
      {
        "nom": "whey vanille",
        "quantite": 30,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "lait demi-écrémé",
        "quantite": 250,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "flocons d'avoine",
        "quantite": 35,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Mettre le lait dans un blender.",
      "Ajouter la whey et l'avoine.",
      "Mixer jusqu'à obtenir une texture homogène."
    ]
  },
  {
    "id": "pd-smoothie-fruits-rouges",
    "nom": "Smoothie fruits rouges",
    "type": "petit-dejeuner",
    "categorie": "smoothie",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose"
    ],
    "kcal": 320,
    "proteines": 19,
    "glucides": 42,
    "lipides": 7,
    "tempsMinutes": 4,
    "motsCles": [
      "fruits rouges",
      "skyr",
      "lait"
    ],
    "ingredients": [
      {
        "nom": "fruits rouges",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "skyr nature",
        "quantite": 150,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "lait demi-écrémé",
        "quantite": 150,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "miel",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Mettre les fruits rouges dans un blender.",
      "Ajouter le skyr, le lait et le miel.",
      "Mixer et servir frais."
    ]
  },
  {
    "id": "pd-porridge-sans-gluten-banane",
    "nom": "Porridge sans gluten banane",
    "type": "petit-dejeuner",
    "categorie": "pancake-porridge",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "fruits-a-coque"
    ],
    "kcal": 360,
    "proteines": 10,
    "glucides": 62,
    "lipides": 8,
    "tempsMinutes": 8,
    "motsCles": [
      "avoine sans gluten",
      "banane",
      "lait végétal"
    ],
    "ingredients": [
      {
        "nom": "flocons d'avoine sans gluten",
        "quantite": 50,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "lait d'amande",
        "quantite": 200,
        "unite": "ml",
        "rayon": "Épicerie"
      },
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "cannelle",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Chauffer le lait d'amande avec l'avoine.",
      "Remuer jusqu'à épaississement.",
      "Ajouter la banane et la cannelle."
    ]
  },
  {
    "id": "pd-bol-soja-fruits-rouges",
    "nom": "Bol soja fruits rouges",
    "type": "petit-dejeuner",
    "categorie": "bol",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "soja"
    ],
    "kcal": 320,
    "proteines": 13,
    "glucides": 42,
    "lipides": 10,
    "tempsMinutes": 3,
    "motsCles": [
      "yaourt soja",
      "fruits rouges",
      "chia"
    ],
    "ingredients": [
      {
        "nom": "yaourt soja nature",
        "quantite": 200,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "fruits rouges",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "graines de chia",
        "quantite": 15,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "sirop d'érable",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Verser le yaourt soja dans un bol.",
      "Ajouter les fruits rouges.",
      "Ajouter les graines de chia et le sirop d'érable."
    ]
  },
  {
    "id": "pd-tartines-riz-banane-cacahuete",
    "nom": "Tartines riz banane cacahuète",
    "type": "petit-dejeuner",
    "categorie": "tartine",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "arachide"
    ],
    "kcal": 340,
    "proteines": 9,
    "glucides": 48,
    "lipides": 13,
    "tempsMinutes": 4,
    "motsCles": [
      "galettes de riz",
      "banane",
      "cacahuète"
    ],
    "ingredients": [
      {
        "nom": "galettes de riz",
        "quantite": 4,
        "unite": "piece",
        "rayon": "Boulangerie"
      },
      {
        "nom": "beurre de cacahuète",
        "quantite": 20,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Tartiner les galettes avec le beurre de cacahuète.",
      "Couper la banane en rondelles.",
      "Ajouter la banane sur les galettes."
    ]
  },
  {
    "id": "pd-smoothie-soja-banane",
    "nom": "Smoothie soja banane",
    "type": "petit-dejeuner",
    "categorie": "smoothie",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "soja"
    ],
    "kcal": 310,
    "proteines": 14,
    "glucides": 48,
    "lipides": 7,
    "tempsMinutes": 3,
    "motsCles": [
      "banane",
      "lait de soja",
      "avoine sans gluten"
    ],
    "ingredients": [
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "lait de soja",
        "quantite": 250,
        "unite": "ml",
        "rayon": "Épicerie"
      },
      {
        "nom": "flocons d'avoine sans gluten",
        "quantite": 25,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Mettre les ingrédients dans un blender.",
      "Mixer jusqu'à obtenir une texture lisse.",
      "Servir frais."
    ]
  },
  {
    "id": "pd-bol-soja-pomme-cannelle",
    "nom": "Bol soja pomme cannelle",
    "type": "petit-dejeuner",
    "categorie": "bol",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "soja"
    ],
    "kcal": 300,
    "proteines": 12,
    "glucides": 40,
    "lipides": 9,
    "tempsMinutes": 4,
    "motsCles": [
      "yaourt soja",
      "pomme",
      "chia"
    ],
    "ingredients": [
      {
        "nom": "yaourt soja nature",
        "quantite": 200,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "pomme",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "graines de chia",
        "quantite": 10,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "cannelle",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Verser le yaourt soja dans un bol.",
      "Ajouter la pomme coupée.",
      "Ajouter les graines de chia et la cannelle."
    ]
  },
  {
    "id": "pd-porridge-cacao-vegan",
    "nom": "Porridge cacao vegan",
    "type": "petit-dejeuner",
    "categorie": "pancake-porridge",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "fruits-a-coque"
    ],
    "kcal": 370,
    "proteines": 11,
    "glucides": 58,
    "lipides": 10,
    "tempsMinutes": 8,
    "motsCles": [
      "avoine sans gluten",
      "cacao",
      "banane"
    ],
    "ingredients": [
      {
        "nom": "flocons d'avoine sans gluten",
        "quantite": 50,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "lait d'amande",
        "quantite": 200,
        "unite": "ml",
        "rayon": "Épicerie"
      },
      {
        "nom": "cacao non sucré",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      },
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Chauffer le lait d'amande avec l'avoine.",
      "Ajouter le cacao.",
      "Servir avec la banane en rondelles."
    ]
  },
  {
    "id": "pd-tartines-mais-avocat",
    "nom": "Tartines maïs avocat",
    "type": "petit-dejeuner",
    "categorie": "tartine",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [],
    "kcal": 330,
    "proteines": 7,
    "glucides": 42,
    "lipides": 15,
    "tempsMinutes": 5,
    "motsCles": [
      "galettes de maïs",
      "avocat",
      "tomate"
    ],
    "ingredients": [
      {
        "nom": "galettes de maïs",
        "quantite": 4,
        "unite": "piece",
        "rayon": "Boulangerie"
      },
      {
        "nom": "avocat",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomate",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Écraser l'avocat.",
      "Déposer sur les galettes de maïs.",
      "Ajouter la tomate coupée."
    ]
  },
  {
    "id": "pd-bol-compote-avoine",
    "nom": "Bol compote avoine",
    "type": "petit-dejeuner",
    "categorie": "bol",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 290,
    "proteines": 8,
    "glucides": 52,
    "lipides": 5,
    "tempsMinutes": 3,
    "motsCles": [
      "compote",
      "avoine sans gluten",
      "banane"
    ],
    "ingredients": [
      {
        "nom": "compote sans sucres ajoutés",
        "quantite": 150,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "flocons d'avoine sans gluten",
        "quantite": 40,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Verser la compote dans un bol.",
      "Ajouter l'avoine.",
      "Ajouter la banane en rondelles."
    ]
  },
  {
    "id": "pd-wrap-mais-houmous",
    "nom": "Wrap maïs houmous",
    "type": "petit-dejeuner",
    "categorie": "emporter",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "sesame"
    ],
    "kcal": 360,
    "proteines": 11,
    "glucides": 48,
    "lipides": 13,
    "tempsMinutes": 5,
    "motsCles": [
      "wrap maïs",
      "houmous",
      "concombre"
    ],
    "ingredients": [
      {
        "nom": "wrap de maïs sans gluten",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Boulangerie"
      },
      {
        "nom": "houmous",
        "quantite": 60,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "concombre",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Tartiner le wrap avec le houmous.",
      "Ajouter le concombre coupé.",
      "Rouler le wrap."
    ]
  },
  {
    "id": "pd-smoothie-fruits-rouges-vegan",
    "nom": "Smoothie fruits rouges vegan",
    "type": "petit-dejeuner",
    "categorie": "smoothie",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "fruits-a-coque"
    ],
    "kcal": 300,
    "proteines": 9,
    "glucides": 45,
    "lipides": 8,
    "tempsMinutes": 4,
    "motsCles": [
      "fruits rouges",
      "lait d'amande",
      "banane"
    ],
    "ingredients": [
      {
        "nom": "fruits rouges",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "lait d'amande",
        "quantite": 250,
        "unite": "ml",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Mettre les fruits dans un blender.",
      "Ajouter le lait d'amande.",
      "Mixer et servir frais."
    ]
  },
  {
    "id": "col-skyr-et-amandes",
    "nom": "Skyr et amandes",
    "type": "collation",
    "categorie": "proteinees",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose",
      "fruits-a-coque"
    ],
    "kcal": 230,
    "proteines": 19,
    "glucides": 10,
    "lipides": 12,
    "tempsMinutes": 2,
    "motsCles": [
      "skyr",
      "amandes"
    ],
    "ingredients": [
      {
        "nom": "skyr nature",
        "quantite": 150,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "amandes",
        "quantite": 15,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Verser le skyr dans un bol.",
      "Ajouter les amandes."
    ]
  },
  {
    "id": "col-fromage-blanc-proteine",
    "nom": "Fromage blanc protéiné",
    "type": "collation",
    "categorie": "proteinees",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose"
    ],
    "kcal": 220,
    "proteines": 27,
    "glucides": 14,
    "lipides": 5,
    "tempsMinutes": 2,
    "motsCles": [
      "fromage blanc",
      "whey vanille"
    ],
    "ingredients": [
      {
        "nom": "fromage blanc",
        "quantite": 150,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "whey vanille",
        "quantite": 20,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Verser le fromage blanc dans un bol.",
      "Ajouter la whey.",
      "Mélanger."
    ]
  },
  {
    "id": "col-shake-chocolat",
    "nom": "Shake chocolat",
    "type": "collation",
    "categorie": "proteinees",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose"
    ],
    "kcal": 210,
    "proteines": 27,
    "glucides": 12,
    "lipides": 5,
    "tempsMinutes": 2,
    "motsCles": [
      "whey chocolat",
      "lait demi-écrémé"
    ],
    "ingredients": [
      {
        "nom": "whey chocolat",
        "quantite": 30,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "lait demi-écrémé",
        "quantite": 200,
        "unite": "ml",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Verser le lait dans un shaker.",
      "Ajouter la whey.",
      "Secouer."
    ]
  },
  {
    "id": "col-skyr-banane",
    "nom": "Skyr banane",
    "type": "collation",
    "categorie": "proteinees",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose"
    ],
    "kcal": 225,
    "proteines": 17,
    "glucides": 34,
    "lipides": 1,
    "tempsMinutes": 2,
    "motsCles": [
      "skyr",
      "banane"
    ],
    "ingredients": [
      {
        "nom": "skyr nature",
        "quantite": 150,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Verser le skyr dans un bol.",
      "Ajouter la banane en rondelles."
    ]
  },
  {
    "id": "col-ufs-durs",
    "nom": "Œufs durs",
    "type": "collation",
    "categorie": "proteinees",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "oeuf"
    ],
    "kcal": 210,
    "proteines": 18,
    "glucides": 1,
    "lipides": 15,
    "tempsMinutes": 10,
    "motsCles": [
      "oeufs"
    ],
    "ingredients": [
      {
        "nom": "oeufs",
        "quantite": 3,
        "unite": "piece",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Cuire les oeufs dans l'eau bouillante.",
      "Écaler les oeufs.",
      "Servir froids ou tièdes."
    ]
  },
  {
    "id": "col-fromage-blanc-et-noix",
    "nom": "Fromage blanc et noix",
    "type": "collation",
    "categorie": "proteinees",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose",
      "fruits-a-coque"
    ],
    "kcal": 245,
    "proteines": 16,
    "glucides": 12,
    "lipides": 15,
    "tempsMinutes": 2,
    "motsCles": [
      "fromage blanc",
      "noix"
    ],
    "ingredients": [
      {
        "nom": "fromage blanc",
        "quantite": 150,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "noix",
        "quantite": 15,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Verser le fromage blanc dans un bol.",
      "Ajouter les noix."
    ]
  },
  {
    "id": "col-thon-fromage-frais",
    "nom": "Thon fromage frais",
    "type": "collation",
    "categorie": "proteinees",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "poisson",
      "lactose"
    ],
    "kcal": 190,
    "proteines": 29,
    "glucides": 3,
    "lipides": 7,
    "tempsMinutes": 3,
    "motsCles": [
      "thon",
      "fromage frais"
    ],
    "ingredients": [
      {
        "nom": "thon au naturel",
        "quantite": 80,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "fromage frais",
        "quantite": 40,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Égoutter le thon.",
      "Mélanger avec le fromage frais.",
      "Servir frais."
    ]
  },
  {
    "id": "col-blanc-de-dinde-fromage-frais",
    "nom": "Blanc de dinde fromage frais",
    "type": "collation",
    "categorie": "proteinees",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose"
    ],
    "kcal": 170,
    "proteines": 24,
    "glucides": 3,
    "lipides": 7,
    "tempsMinutes": 2,
    "motsCles": [
      "blanc de dinde",
      "fromage frais"
    ],
    "ingredients": [
      {
        "nom": "blanc de dinde",
        "quantite": 3,
        "unite": "tranche",
        "rayon": "Boucherie"
      },
      {
        "nom": "fromage frais",
        "quantite": 40,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Tartiner le fromage frais sur la dinde.",
      "Rouler les tranches.",
      "Servir frais."
    ]
  },
  {
    "id": "col-shake-banane-vanille",
    "nom": "Shake banane vanille",
    "type": "collation",
    "categorie": "proteinees",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose"
    ],
    "kcal": 310,
    "proteines": 28,
    "glucides": 38,
    "lipides": 5,
    "tempsMinutes": 3,
    "motsCles": [
      "whey vanille",
      "lait demi-écrémé",
      "banane"
    ],
    "ingredients": [
      {
        "nom": "whey vanille",
        "quantite": 30,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "lait demi-écrémé",
        "quantite": 200,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Mettre les ingrédients dans un blender.",
      "Mixer quelques secondes.",
      "Servir frais."
    ]
  },
  {
    "id": "col-skyr-miel",
    "nom": "Skyr miel",
    "type": "collation",
    "categorie": "proteinees",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose"
    ],
    "kcal": 145,
    "proteines": 16,
    "glucides": 17,
    "lipides": 1,
    "tempsMinutes": 1,
    "motsCles": [
      "skyr",
      "miel"
    ],
    "ingredients": [
      {
        "nom": "skyr nature",
        "quantite": 150,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "miel",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Verser le skyr dans un bol.",
      "Ajouter le miel.",
      "Mélanger."
    ]
  },
  {
    "id": "col-yaourt-grec-amandes",
    "nom": "Yaourt grec amandes",
    "type": "collation",
    "categorie": "proteinees",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose",
      "fruits-a-coque"
    ],
    "kcal": 260,
    "proteines": 18,
    "glucides": 10,
    "lipides": 16,
    "tempsMinutes": 2,
    "motsCles": [
      "yaourt grec",
      "amandes"
    ],
    "ingredients": [
      {
        "nom": "yaourt grec",
        "quantite": 150,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "amandes",
        "quantite": 15,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Verser le yaourt grec dans un bol.",
      "Ajouter les amandes."
    ]
  },
  {
    "id": "col-poulet-froid-tomate",
    "nom": "Poulet froid tomate",
    "type": "collation",
    "categorie": "proteinees",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [],
    "kcal": 165,
    "proteines": 24,
    "glucides": 4,
    "lipides": 5,
    "tempsMinutes": 3,
    "motsCles": [
      "poulet",
      "tomate"
    ],
    "ingredients": [
      {
        "nom": "blanc de poulet cuit",
        "quantite": 90,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "tomate",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Couper le poulet.",
      "Ajouter la tomate coupée.",
      "Servir frais."
    ]
  },
  {
    "id": "col-fromage-blanc-cacao",
    "nom": "Fromage blanc cacao",
    "type": "collation",
    "categorie": "proteinees",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose"
    ],
    "kcal": 155,
    "proteines": 15,
    "glucides": 14,
    "lipides": 4,
    "tempsMinutes": 2,
    "motsCles": [
      "fromage blanc",
      "cacao"
    ],
    "ingredients": [
      {
        "nom": "fromage blanc",
        "quantite": 170,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "cacao non sucré",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Verser le fromage blanc dans un bol.",
      "Ajouter le cacao.",
      "Mélanger."
    ]
  },
  {
    "id": "col-skyr-chocolat",
    "nom": "Skyr chocolat",
    "type": "collation",
    "categorie": "proteinees",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose"
    ],
    "kcal": 170,
    "proteines": 16,
    "glucides": 18,
    "lipides": 4,
    "tempsMinutes": 2,
    "motsCles": [
      "skyr",
      "chocolat noir"
    ],
    "ingredients": [
      {
        "nom": "skyr nature",
        "quantite": 150,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "chocolat noir",
        "quantite": 10,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Verser le skyr dans un bol.",
      "Ajouter le chocolat en copeaux.",
      "Mélanger légèrement."
    ]
  },
  {
    "id": "col-whey-a-l-eau",
    "nom": "Whey à l'eau",
    "type": "collation",
    "categorie": "proteinees",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose"
    ],
    "kcal": 120,
    "proteines": 24,
    "glucides": 3,
    "lipides": 2,
    "tempsMinutes": 1,
    "motsCles": [
      "whey",
      "eau"
    ],
    "ingredients": [
      {
        "nom": "whey",
        "quantite": 30,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "eau",
        "quantite": 250,
        "unite": "ml",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Verser l'eau dans un shaker.",
      "Ajouter la whey.",
      "Secouer."
    ]
  },
  {
    "id": "col-galettes-avocat",
    "nom": "Galettes avocat",
    "type": "collation",
    "categorie": "tartines",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [],
    "kcal": 210,
    "proteines": 4,
    "glucides": 28,
    "lipides": 9,
    "tempsMinutes": 4,
    "motsCles": [
      "galettes de riz",
      "avocat"
    ],
    "ingredients": [
      {
        "nom": "galettes de riz",
        "quantite": 3,
        "unite": "piece",
        "rayon": "Boulangerie"
      },
      {
        "nom": "avocat",
        "quantite": 60,
        "unite": "g",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Écraser l'avocat.",
      "Déposer l'avocat sur les galettes.",
      "Servir immédiatement."
    ]
  },
  {
    "id": "col-pain-fromage-frais",
    "nom": "Pain fromage frais",
    "type": "collation",
    "categorie": "tartines",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 190,
    "proteines": 8,
    "glucides": 28,
    "lipides": 5,
    "tempsMinutes": 3,
    "motsCles": [
      "pain complet",
      "fromage frais"
    ],
    "ingredients": [
      {
        "nom": "pain complet",
        "quantite": 1,
        "unite": "tranche",
        "rayon": "Boulangerie"
      },
      {
        "nom": "fromage frais",
        "quantite": 35,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Tartiner le fromage frais sur le pain.",
      "Servir frais."
    ]
  },
  {
    "id": "col-crackers-houmous",
    "nom": "Crackers houmous",
    "type": "collation",
    "categorie": "tartines",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "gluten",
      "sesame"
    ],
    "kcal": 230,
    "proteines": 7,
    "glucides": 30,
    "lipides": 9,
    "tempsMinutes": 2,
    "motsCles": [
      "crackers",
      "houmous"
    ],
    "ingredients": [
      {
        "nom": "crackers de blé",
        "quantite": 35,
        "unite": "g",
        "rayon": "Boulangerie"
      },
      {
        "nom": "houmous",
        "quantite": 50,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Déposer le houmous dans une petite assiette.",
      "Servir avec les crackers."
    ]
  },
  {
    "id": "col-galettes-beurre-de-cacahuete",
    "nom": "Galettes beurre de cacahuète",
    "type": "collation",
    "categorie": "tartines",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "arachide"
    ],
    "kcal": 235,
    "proteines": 7,
    "glucides": 30,
    "lipides": 10,
    "tempsMinutes": 3,
    "motsCles": [
      "galettes de riz",
      "beurre de cacahuète"
    ],
    "ingredients": [
      {
        "nom": "galettes de riz",
        "quantite": 3,
        "unite": "piece",
        "rayon": "Boulangerie"
      },
      {
        "nom": "beurre de cacahuète",
        "quantite": 15,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Tartiner les galettes avec le beurre de cacahuète.",
      "Servir immédiatement."
    ]
  },
  {
    "id": "col-pain-avocat-tomate",
    "nom": "Pain avocat tomate",
    "type": "collation",
    "categorie": "tartines",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "gluten"
    ],
    "kcal": 250,
    "proteines": 7,
    "glucides": 32,
    "lipides": 10,
    "tempsMinutes": 5,
    "motsCles": [
      "pain complet",
      "avocat",
      "tomate"
    ],
    "ingredients": [
      {
        "nom": "pain complet",
        "quantite": 1,
        "unite": "tranche",
        "rayon": "Boulangerie"
      },
      {
        "nom": "avocat",
        "quantite": 60,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomate",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Écraser l'avocat sur le pain.",
      "Couper la tomate.",
      "Ajouter la tomate sur la tartine."
    ]
  },
  {
    "id": "col-galettes-fromage-frais",
    "nom": "Galettes fromage frais",
    "type": "collation",
    "categorie": "tartines",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose"
    ],
    "kcal": 170,
    "proteines": 7,
    "glucides": 24,
    "lipides": 5,
    "tempsMinutes": 3,
    "motsCles": [
      "galettes de riz",
      "fromage frais"
    ],
    "ingredients": [
      {
        "nom": "galettes de riz",
        "quantite": 3,
        "unite": "piece",
        "rayon": "Boulangerie"
      },
      {
        "nom": "fromage frais",
        "quantite": 35,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Tartiner le fromage frais sur les galettes.",
      "Servir immédiatement."
    ]
  },
  {
    "id": "col-pain-chevre-miel",
    "nom": "Pain chèvre miel",
    "type": "collation",
    "categorie": "tartines",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 230,
    "proteines": 9,
    "glucides": 31,
    "lipides": 8,
    "tempsMinutes": 4,
    "motsCles": [
      "pain complet",
      "chèvre frais",
      "miel"
    ],
    "ingredients": [
      {
        "nom": "pain complet",
        "quantite": 1,
        "unite": "tranche",
        "rayon": "Boulangerie"
      },
      {
        "nom": "chèvre frais",
        "quantite": 35,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "miel",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Tartiner le chèvre frais sur le pain.",
      "Ajouter le miel.",
      "Servir."
    ]
  },
  {
    "id": "col-crackers-fromage-frais",
    "nom": "Crackers fromage frais",
    "type": "collation",
    "categorie": "tartines",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 210,
    "proteines": 8,
    "glucides": 28,
    "lipides": 7,
    "tempsMinutes": 3,
    "motsCles": [
      "crackers",
      "fromage frais"
    ],
    "ingredients": [
      {
        "nom": "crackers de blé",
        "quantite": 35,
        "unite": "g",
        "rayon": "Boulangerie"
      },
      {
        "nom": "fromage frais",
        "quantite": 35,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Tartiner le fromage frais sur les crackers.",
      "Servir."
    ]
  },
  {
    "id": "col-galettes-banane-cacahuete",
    "nom": "Galettes banane cacahuète",
    "type": "collation",
    "categorie": "tartines",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "arachide"
    ],
    "kcal": 285,
    "proteines": 8,
    "glucides": 42,
    "lipides": 10,
    "tempsMinutes": 4,
    "motsCles": [
      "galettes de riz",
      "banane",
      "beurre de cacahuète"
    ],
    "ingredients": [
      {
        "nom": "galettes de riz",
        "quantite": 3,
        "unite": "piece",
        "rayon": "Boulangerie"
      },
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "beurre de cacahuète",
        "quantite": 10,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Tartiner les galettes avec le beurre de cacahuète.",
      "Couper la banane.",
      "Ajouter la banane sur les galettes."
    ]
  },
  {
    "id": "col-pain-houmous-concombre",
    "nom": "Pain houmous concombre",
    "type": "collation",
    "categorie": "tartines",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "sesame"
    ],
    "kcal": 240,
    "proteines": 8,
    "glucides": 34,
    "lipides": 8,
    "tempsMinutes": 5,
    "motsCles": [
      "pain complet",
      "houmous",
      "concombre"
    ],
    "ingredients": [
      {
        "nom": "pain complet",
        "quantite": 1,
        "unite": "tranche",
        "rayon": "Boulangerie"
      },
      {
        "nom": "houmous",
        "quantite": 50,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "concombre",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Tartiner le houmous sur le pain.",
      "Couper le concombre.",
      "Ajouter le concombre sur la tartine."
    ]
  },
  {
    "id": "col-amandes",
    "nom": "Amandes",
    "type": "collation",
    "categorie": "oleagineux",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "fruits-a-coque"
    ],
    "kcal": 175,
    "proteines": 6,
    "glucides": 6,
    "lipides": 15,
    "tempsMinutes": 1,
    "motsCles": [
      "amandes"
    ],
    "ingredients": [
      {
        "nom": "amandes",
        "quantite": 30,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Servir les amandes."
    ]
  },
  {
    "id": "col-noix",
    "nom": "Noix",
    "type": "collation",
    "categorie": "oleagineux",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "fruits-a-coque"
    ],
    "kcal": 200,
    "proteines": 5,
    "glucides": 4,
    "lipides": 20,
    "tempsMinutes": 1,
    "motsCles": [
      "noix"
    ],
    "ingredients": [
      {
        "nom": "noix",
        "quantite": 30,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Servir les noix."
    ]
  },
  {
    "id": "col-noisettes",
    "nom": "Noisettes",
    "type": "collation",
    "categorie": "oleagineux",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "fruits-a-coque"
    ],
    "kcal": 190,
    "proteines": 5,
    "glucides": 5,
    "lipides": 18,
    "tempsMinutes": 1,
    "motsCles": [
      "noisettes"
    ],
    "ingredients": [
      {
        "nom": "noisettes",
        "quantite": 30,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Servir les noisettes."
    ]
  },
  {
    "id": "col-melange-de-noix",
    "nom": "Mélange de noix",
    "type": "collation",
    "categorie": "oleagineux",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "fruits-a-coque"
    ],
    "kcal": 190,
    "proteines": 6,
    "glucides": 6,
    "lipides": 17,
    "tempsMinutes": 1,
    "motsCles": [
      "amandes",
      "noix",
      "noisettes"
    ],
    "ingredients": [
      {
        "nom": "amandes",
        "quantite": 10,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "noix",
        "quantite": 10,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "noisettes",
        "quantite": 10,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Mélanger les oléagineux.",
      "Servir."
    ]
  },
  {
    "id": "col-banane-beurre-de-cacahuete",
    "nom": "Banane beurre de cacahuète",
    "type": "collation",
    "categorie": "oleagineux",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "arachide"
    ],
    "kcal": 220,
    "proteines": 6,
    "glucides": 28,
    "lipides": 10,
    "tempsMinutes": 2,
    "motsCles": [
      "banane",
      "beurre de cacahuète"
    ],
    "ingredients": [
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "beurre de cacahuète",
        "quantite": 15,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Éplucher la banane.",
      "Tartiner avec le beurre de cacahuète."
    ]
  },
  {
    "id": "col-pomme-amandes",
    "nom": "Pomme amandes",
    "type": "collation",
    "categorie": "oleagineux",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "fruits-a-coque"
    ],
    "kcal": 190,
    "proteines": 5,
    "glucides": 24,
    "lipides": 10,
    "tempsMinutes": 2,
    "motsCles": [
      "pomme",
      "amandes"
    ],
    "ingredients": [
      {
        "nom": "pomme",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "amandes",
        "quantite": 20,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Couper la pomme.",
      "Servir avec les amandes."
    ]
  },
  {
    "id": "col-poire-noix",
    "nom": "Poire noix",
    "type": "collation",
    "categorie": "oleagineux",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "fruits-a-coque"
    ],
    "kcal": 205,
    "proteines": 5,
    "glucides": 25,
    "lipides": 11,
    "tempsMinutes": 2,
    "motsCles": [
      "poire",
      "noix"
    ],
    "ingredients": [
      {
        "nom": "poire",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "noix",
        "quantite": 20,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Couper la poire.",
      "Servir avec les noix."
    ]
  },
  {
    "id": "col-raisins-secs-et-noix",
    "nom": "Raisins secs et noix",
    "type": "collation",
    "categorie": "oleagineux",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "fruits-a-coque"
    ],
    "kcal": 215,
    "proteines": 5,
    "glucides": 26,
    "lipides": 11,
    "tempsMinutes": 1,
    "motsCles": [
      "raisins secs",
      "noix"
    ],
    "ingredients": [
      {
        "nom": "raisins secs",
        "quantite": 25,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "noix",
        "quantite": 20,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Mélanger les raisins secs et les noix.",
      "Servir."
    ]
  },
  {
    "id": "col-wrap-dinde-fromage-frais",
    "nom": "Wrap dinde fromage frais",
    "type": "collation",
    "categorie": "emporter",
    "gout": "sale",
    "cuisines": [],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 260,
    "proteines": 19,
    "glucides": 28,
    "lipides": 8,
    "tempsMinutes": 5,
    "motsCles": [
      "wrap de blé",
      "blanc de dinde",
      "fromage frais"
    ],
    "ingredients": [
      {
        "nom": "wrap de blé",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Boulangerie"
      },
      {
        "nom": "blanc de dinde",
        "quantite": 2,
        "unite": "tranche",
        "rayon": "Boucherie"
      },
      {
        "nom": "fromage frais",
        "quantite": 30,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Tartiner le wrap avec le fromage frais.",
      "Ajouter le blanc de dinde.",
      "Rouler le wrap."
    ]
  },
  {
    "id": "col-mini-sandwich-jambon",
    "nom": "Mini sandwich jambon",
    "type": "collation",
    "categorie": "emporter",
    "gout": "sale",
    "cuisines": [],
    "regime": [],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 250,
    "proteines": 15,
    "glucides": 30,
    "lipides": 8,
    "tempsMinutes": 4,
    "motsCles": [
      "pain complet",
      "jambon blanc",
      "emmental"
    ],
    "ingredients": [
      {
        "nom": "pain complet",
        "quantite": 1,
        "unite": "tranche",
        "rayon": "Boulangerie"
      },
      {
        "nom": "jambon blanc",
        "quantite": 1,
        "unite": "tranche",
        "rayon": "Boucherie"
      },
      {
        "nom": "emmental",
        "quantite": 20,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Couper la tranche de pain en deux.",
      "Ajouter le jambon et l'emmental.",
      "Refermer le mini sandwich."
    ]
  },
  {
    "id": "col-energy-balls-dattes-cacao",
    "nom": "Energy balls dattes cacao",
    "type": "collation",
    "categorie": "emporter",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "fruits-a-coque"
    ],
    "kcal": 220,
    "proteines": 5,
    "glucides": 28,
    "lipides": 10,
    "tempsMinutes": 10,
    "motsCles": [
      "dattes",
      "amandes",
      "cacao"
    ],
    "ingredients": [
      {
        "nom": "dattes",
        "quantite": 35,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "amandes",
        "quantite": 20,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "cacao non sucré",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Mixer les dattes et les amandes.",
      "Ajouter le cacao.",
      "Former des petites boules."
    ]
  },
  {
    "id": "col-banane-amandes",
    "nom": "Banane amandes",
    "type": "collation",
    "categorie": "emporter",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "fruits-a-coque"
    ],
    "kcal": 220,
    "proteines": 5,
    "glucides": 30,
    "lipides": 10,
    "tempsMinutes": 1,
    "motsCles": [
      "banane",
      "amandes"
    ],
    "ingredients": [
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "amandes",
        "quantite": 20,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Mettre la banane et les amandes dans une boîte.",
      "Emporter tel quel."
    ]
  },
  {
    "id": "col-wrap-banane-cacahuete",
    "nom": "Wrap banane cacahuète",
    "type": "collation",
    "categorie": "emporter",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "arachide"
    ],
    "kcal": 310,
    "proteines": 9,
    "glucides": 44,
    "lipides": 11,
    "tempsMinutes": 4,
    "motsCles": [
      "wrap de blé",
      "banane",
      "beurre de cacahuète"
    ],
    "ingredients": [
      {
        "nom": "wrap de blé",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Boulangerie"
      },
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "beurre de cacahuète",
        "quantite": 15,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Tartiner le wrap avec le beurre de cacahuète.",
      "Ajouter la banane.",
      "Rouler le wrap."
    ]
  },
  {
    "id": "col-skyr-et-pomme",
    "nom": "Skyr et pomme",
    "type": "collation",
    "categorie": "fruits-laitiers",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose"
    ],
    "kcal": 185,
    "proteines": 16,
    "glucides": 28,
    "lipides": 1,
    "tempsMinutes": 2,
    "motsCles": [
      "skyr",
      "pomme"
    ],
    "ingredients": [
      {
        "nom": "skyr nature",
        "quantite": 150,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "pomme",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Verser le skyr dans un bol.",
      "Ajouter la pomme coupée."
    ]
  },
  {
    "id": "col-fromage-blanc-banane",
    "nom": "Fromage blanc banane",
    "type": "collation",
    "categorie": "fruits-laitiers",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose"
    ],
    "kcal": 220,
    "proteines": 14,
    "glucides": 36,
    "lipides": 2,
    "tempsMinutes": 2,
    "motsCles": [
      "fromage blanc",
      "banane"
    ],
    "ingredients": [
      {
        "nom": "fromage blanc",
        "quantite": 150,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Verser le fromage blanc dans un bol.",
      "Ajouter la banane en rondelles."
    ]
  },
  {
    "id": "col-yaourt-et-compote",
    "nom": "Yaourt et compote",
    "type": "collation",
    "categorie": "fruits-laitiers",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose"
    ],
    "kcal": 175,
    "proteines": 8,
    "glucides": 28,
    "lipides": 3,
    "tempsMinutes": 1,
    "motsCles": [
      "yaourt nature",
      "compote sans sucres ajoutés"
    ],
    "ingredients": [
      {
        "nom": "yaourt nature",
        "quantite": 125,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "compote sans sucres ajoutés",
        "quantite": 100,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Verser le yaourt dans un bol.",
      "Ajouter la compote."
    ]
  },
  {
    "id": "col-skyr-fruits-rouges",
    "nom": "Skyr fruits rouges",
    "type": "collation",
    "categorie": "fruits-laitiers",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose"
    ],
    "kcal": 160,
    "proteines": 16,
    "glucides": 20,
    "lipides": 1,
    "tempsMinutes": 2,
    "motsCles": [
      "skyr",
      "fruits rouges"
    ],
    "ingredients": [
      {
        "nom": "skyr nature",
        "quantite": 150,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "fruits rouges",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Verser le skyr dans un bol.",
      "Ajouter les fruits rouges."
    ]
  },
  {
    "id": "col-fromage-blanc-fraises",
    "nom": "Fromage blanc fraises",
    "type": "collation",
    "categorie": "fruits-laitiers",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose"
    ],
    "kcal": 155,
    "proteines": 13,
    "glucides": 19,
    "lipides": 2,
    "tempsMinutes": 2,
    "motsCles": [
      "fromage blanc",
      "fraises"
    ],
    "ingredients": [
      {
        "nom": "fromage blanc",
        "quantite": 150,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "fraises",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Verser le fromage blanc dans un bol.",
      "Ajouter les fraises coupées."
    ]
  },
  {
    "id": "col-yaourt-grec-poire",
    "nom": "Yaourt grec poire",
    "type": "collation",
    "categorie": "fruits-laitiers",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose"
    ],
    "kcal": 230,
    "proteines": 14,
    "glucides": 28,
    "lipides": 7,
    "tempsMinutes": 2,
    "motsCles": [
      "yaourt grec",
      "poire"
    ],
    "ingredients": [
      {
        "nom": "yaourt grec",
        "quantite": 150,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "poire",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Verser le yaourt grec dans un bol.",
      "Ajouter la poire coupée."
    ]
  },
  {
    "id": "col-skyr-et-compote",
    "nom": "Skyr et compote",
    "type": "collation",
    "categorie": "fruits-laitiers",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose"
    ],
    "kcal": 165,
    "proteines": 16,
    "glucides": 22,
    "lipides": 1,
    "tempsMinutes": 1,
    "motsCles": [
      "skyr",
      "compote sans sucres ajoutés"
    ],
    "ingredients": [
      {
        "nom": "skyr nature",
        "quantite": 150,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "compote sans sucres ajoutés",
        "quantite": 100,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Verser le skyr dans un bol.",
      "Ajouter la compote."
    ]
  },
  {
    "id": "col-fromage-blanc-miel",
    "nom": "Fromage blanc miel",
    "type": "collation",
    "categorie": "fruits-laitiers",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose"
    ],
    "kcal": 150,
    "proteines": 13,
    "glucides": 20,
    "lipides": 2,
    "tempsMinutes": 1,
    "motsCles": [
      "fromage blanc",
      "miel"
    ],
    "ingredients": [
      {
        "nom": "fromage blanc",
        "quantite": 150,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "miel",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Verser le fromage blanc dans un bol.",
      "Ajouter le miel."
    ]
  },
  {
    "id": "col-yaourt-soja-pomme",
    "nom": "Yaourt soja pomme",
    "type": "collation",
    "categorie": "fruits-laitiers",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "soja"
    ],
    "kcal": 170,
    "proteines": 7,
    "glucides": 28,
    "lipides": 4,
    "tempsMinutes": 2,
    "motsCles": [
      "yaourt soja",
      "pomme"
    ],
    "ingredients": [
      {
        "nom": "yaourt soja nature",
        "quantite": 125,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "pomme",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Verser le yaourt soja dans un bol.",
      "Ajouter la pomme coupée."
    ]
  },
  {
    "id": "col-compote-et-banane",
    "nom": "Compote et banane",
    "type": "collation",
    "categorie": "fruits-laitiers",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 180,
    "proteines": 1,
    "glucides": 42,
    "lipides": 0,
    "tempsMinutes": 1,
    "motsCles": [
      "compote sans sucres ajoutés",
      "banane"
    ],
    "ingredients": [
      {
        "nom": "compote sans sucres ajoutés",
        "quantite": 100,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Servir la compote.",
      "Ajouter la banane à côté."
    ]
  },
  {
    "id": "col-skyr-ananas",
    "nom": "Skyr ananas",
    "type": "collation",
    "categorie": "fruits-laitiers",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose"
    ],
    "kcal": 170,
    "proteines": 16,
    "glucides": 23,
    "lipides": 1,
    "tempsMinutes": 2,
    "motsCles": [
      "skyr",
      "ananas"
    ],
    "ingredients": [
      {
        "nom": "skyr nature",
        "quantite": 150,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "ananas",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Verser le skyr dans un bol.",
      "Ajouter l'ananas coupé."
    ]
  },
  {
    "id": "col-fromage-blanc-kiwi",
    "nom": "Fromage blanc kiwi",
    "type": "collation",
    "categorie": "fruits-laitiers",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose"
    ],
    "kcal": 145,
    "proteines": 13,
    "glucides": 18,
    "lipides": 2,
    "tempsMinutes": 2,
    "motsCles": [
      "fromage blanc",
      "kiwi"
    ],
    "ingredients": [
      {
        "nom": "fromage blanc",
        "quantite": 150,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "kiwi",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Verser le fromage blanc dans un bol.",
      "Ajouter le kiwi coupé."
    ]
  },
  {
    "id": "col-yaourt-peche",
    "nom": "Yaourt pêche",
    "type": "collation",
    "categorie": "fruits-laitiers",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose"
    ],
    "kcal": 165,
    "proteines": 8,
    "glucides": 25,
    "lipides": 3,
    "tempsMinutes": 2,
    "motsCles": [
      "yaourt nature",
      "pêche"
    ],
    "ingredients": [
      {
        "nom": "yaourt nature",
        "quantite": 125,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "pêche",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Verser le yaourt dans un bol.",
      "Ajouter la pêche coupée."
    ]
  },
  {
    "id": "col-skyr-raisin",
    "nom": "Skyr raisin",
    "type": "collation",
    "categorie": "fruits-laitiers",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose"
    ],
    "kcal": 190,
    "proteines": 16,
    "glucides": 28,
    "lipides": 1,
    "tempsMinutes": 2,
    "motsCles": [
      "skyr",
      "raisin"
    ],
    "ingredients": [
      {
        "nom": "skyr nature",
        "quantite": 150,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "raisin",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Verser le skyr dans un bol.",
      "Ajouter le raisin."
    ]
  },
  {
    "id": "col-fromage-blanc-clementines",
    "nom": "Fromage blanc clémentines",
    "type": "collation",
    "categorie": "fruits-laitiers",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose"
    ],
    "kcal": 160,
    "proteines": 13,
    "glucides": 23,
    "lipides": 2,
    "tempsMinutes": 2,
    "motsCles": [
      "fromage blanc",
      "clémentine"
    ],
    "ingredients": [
      {
        "nom": "fromage blanc",
        "quantite": 150,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "clémentine",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Verser le fromage blanc dans un bol.",
      "Ajouter les quartiers de clémentine."
    ]
  },
  {
    "id": "col-yaourt-soja-fruits-rouges",
    "nom": "Yaourt soja fruits rouges",
    "type": "collation",
    "categorie": "fruits-laitiers",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "soja"
    ],
    "kcal": 145,
    "proteines": 6,
    "glucides": 18,
    "lipides": 4,
    "tempsMinutes": 2,
    "motsCles": [
      "yaourt soja",
      "fruits rouges"
    ],
    "ingredients": [
      {
        "nom": "yaourt soja nature",
        "quantite": 125,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "fruits rouges",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Verser le yaourt soja dans un bol.",
      "Ajouter les fruits rouges."
    ]
  },
  {
    "id": "col-compote-et-poire",
    "nom": "Compote et poire",
    "type": "collation",
    "categorie": "fruits-laitiers",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 155,
    "proteines": 1,
    "glucides": 36,
    "lipides": 0,
    "tempsMinutes": 1,
    "motsCles": [
      "compote sans sucres ajoutés",
      "poire"
    ],
    "ingredients": [
      {
        "nom": "compote sans sucres ajoutés",
        "quantite": 100,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "poire",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Servir la compote.",
      "Ajouter la poire à côté."
    ]
  },
  {
    "id": "col-skyr-mangue",
    "nom": "Skyr mangue",
    "type": "collation",
    "categorie": "fruits-laitiers",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose"
    ],
    "kcal": 185,
    "proteines": 16,
    "glucides": 27,
    "lipides": 1,
    "tempsMinutes": 2,
    "motsCles": [
      "skyr",
      "mangue"
    ],
    "ingredients": [
      {
        "nom": "skyr nature",
        "quantite": 150,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "mangue",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Verser le skyr dans un bol.",
      "Ajouter la mangue coupée."
    ]
  },
  {
    "id": "col-smoothie-banane",
    "nom": "Smoothie banane",
    "type": "collation",
    "categorie": "smoothies",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose"
    ],
    "kcal": 220,
    "proteines": 10,
    "glucides": 36,
    "lipides": 4,
    "tempsMinutes": 3,
    "motsCles": [
      "banane",
      "lait demi-écrémé"
    ],
    "ingredients": [
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "lait demi-écrémé",
        "quantite": 200,
        "unite": "ml",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Mettre la banane dans un blender.",
      "Ajouter le lait.",
      "Mixer et servir frais."
    ]
  },
  {
    "id": "col-smoothie-fraise-banane",
    "nom": "Smoothie fraise banane",
    "type": "collation",
    "categorie": "smoothies",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose"
    ],
    "kcal": 240,
    "proteines": 10,
    "glucides": 42,
    "lipides": 4,
    "tempsMinutes": 4,
    "motsCles": [
      "fraises",
      "banane",
      "lait demi-écrémé"
    ],
    "ingredients": [
      {
        "nom": "fraises",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "lait demi-écrémé",
        "quantite": 150,
        "unite": "ml",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Mettre les fraises et la banane dans un blender.",
      "Ajouter le lait.",
      "Mixer jusqu'à obtenir une texture lisse."
    ]
  },
  {
    "id": "col-shake-chocolat-2",
    "nom": "Shake chocolat",
    "type": "collation",
    "categorie": "smoothies",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose"
    ],
    "kcal": 210,
    "proteines": 27,
    "glucides": 12,
    "lipides": 5,
    "tempsMinutes": 2,
    "motsCles": [
      "whey chocolat",
      "lait demi-écrémé"
    ],
    "ingredients": [
      {
        "nom": "whey chocolat",
        "quantite": 30,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "lait demi-écrémé",
        "quantite": 200,
        "unite": "ml",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Verser le lait dans un shaker.",
      "Ajouter la whey.",
      "Secouer et servir frais."
    ]
  },
  {
    "id": "col-smoothie-pomme-poire",
    "nom": "Smoothie pomme poire",
    "type": "collation",
    "categorie": "smoothies",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 165,
    "proteines": 1,
    "glucides": 38,
    "lipides": 0,
    "tempsMinutes": 4,
    "motsCles": [
      "pomme",
      "poire",
      "eau"
    ],
    "ingredients": [
      {
        "nom": "pomme",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "poire",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "eau",
        "quantite": 150,
        "unite": "ml",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Couper la pomme et la poire.",
      "Ajouter l'eau.",
      "Mixer quelques secondes."
    ]
  },
  {
    "id": "col-smoothie-fruits-rouges",
    "nom": "Smoothie fruits rouges",
    "type": "collation",
    "categorie": "smoothies",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose"
    ],
    "kcal": 190,
    "proteines": 12,
    "glucides": 26,
    "lipides": 3,
    "tempsMinutes": 4,
    "motsCles": [
      "fruits rouges",
      "skyr",
      "lait demi-écrémé"
    ],
    "ingredients": [
      {
        "nom": "fruits rouges",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "skyr nature",
        "quantite": 100,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "lait demi-écrémé",
        "quantite": 100,
        "unite": "ml",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Mettre les fruits rouges dans un blender.",
      "Ajouter le skyr et le lait.",
      "Mixer et servir frais."
    ]
  },
  {
    "id": "col-smoothie-soja-banane",
    "nom": "Smoothie soja banane",
    "type": "collation",
    "categorie": "smoothies",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "soja"
    ],
    "kcal": 210,
    "proteines": 9,
    "glucides": 34,
    "lipides": 5,
    "tempsMinutes": 3,
    "motsCles": [
      "lait de soja",
      "banane"
    ],
    "ingredients": [
      {
        "nom": "lait de soja",
        "quantite": 250,
        "unite": "ml",
        "rayon": "Épicerie"
      },
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Mettre le lait de soja dans un blender.",
      "Ajouter la banane.",
      "Mixer et servir frais."
    ]
  },
  {
    "id": "col-shake-vanille",
    "nom": "Shake vanille",
    "type": "collation",
    "categorie": "smoothies",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose"
    ],
    "kcal": 120,
    "proteines": 24,
    "glucides": 3,
    "lipides": 2,
    "tempsMinutes": 1,
    "motsCles": [
      "whey vanille",
      "eau"
    ],
    "ingredients": [
      {
        "nom": "whey vanille",
        "quantite": 30,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "eau",
        "quantite": 250,
        "unite": "ml",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Verser l'eau dans un shaker.",
      "Ajouter la whey.",
      "Secouer."
    ]
  },
  {
    "id": "plat-poulet-riz-courgettes",
    "nom": "Poulet riz courgettes",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 540,
    "proteines": 42,
    "glucides": 58,
    "lipides": 14,
    "tempsMinutes": 25,
    "motsCles": [
      "poulet",
      "riz",
      "courgettes"
    ],
    "ingredients": [
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "riz cru",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "courgettes",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "sel",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire le riz dans l'eau bouillante.",
      "Couper les courgettes en rondelles.",
      "Cuire le poulet à la poêle avec l'huile.",
      "Ajouter les courgettes et cuire quelques minutes.",
      "Servir avec le riz."
    ]
  },
  {
    "id": "plat-steak-puree-haricots-verts",
    "nom": "Steak purée haricots verts",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose"
    ],
    "kcal": 590,
    "proteines": 36,
    "glucides": 48,
    "lipides": 27,
    "tempsMinutes": 30,
    "motsCles": [
      "steak haché",
      "pommes de terre",
      "haricots verts"
    ],
    "ingredients": [
      {
        "nom": "steak haché 5%",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "pommes de terre",
        "quantite": 250,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "haricots verts",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "lait demi-écrémé",
        "quantite": 50,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "beurre",
        "quantite": 10,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre à l'eau.",
      "Cuire les haricots verts.",
      "Écraser les pommes de terre avec le lait et le beurre.",
      "Cuire le steak à la poêle.",
      "Servir avec la purée et les haricots verts."
    ]
  },
  {
    "id": "plat-saumon-riz-brocolis",
    "nom": "Saumon riz brocolis",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson"
    ],
    "kcal": 620,
    "proteines": 38,
    "glucides": 55,
    "lipides": 28,
    "tempsMinutes": 25,
    "motsCles": [
      "saumon",
      "riz",
      "brocolis"
    ],
    "ingredients": [
      {
        "nom": "filet de saumon",
        "quantite": 140,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "riz cru",
        "quantite": 65,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "brocolis",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      },
      {
        "nom": "citron",
        "quantite": 0.5,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Cuire le riz.",
      "Cuire les brocolis à la vapeur ou à l'eau.",
      "Cuire le saumon à la poêle avec l'huile.",
      "Ajouter le citron.",
      "Servir avec le riz et les brocolis."
    ]
  },
  {
    "id": "plat-cabillaud-pommes-vapeur",
    "nom": "Cabillaud pommes vapeur",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson"
    ],
    "kcal": 480,
    "proteines": 35,
    "glucides": 50,
    "lipides": 14,
    "tempsMinutes": 25,
    "motsCles": [
      "cabillaud",
      "pommes de terre",
      "carottes"
    ],
    "ingredients": [
      {
        "nom": "filet de cabillaud",
        "quantite": 160,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "pommes de terre",
        "quantite": 250,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "carottes",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "citron",
        "quantite": 0.5,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre et les carottes à l'eau.",
      "Cuire le cabillaud à la poêle ou vapeur.",
      "Ajouter l'huile d'olive après cuisson.",
      "Ajouter le citron.",
      "Servir chaud."
    ]
  },
  {
    "id": "plat-omelette-pommes-de-terre-salade",
    "nom": "Omelette pommes de terre salade",
    "type": "plat",
    "categorie": "",
    "gout": "",
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
      "oeuf"
    ],
    "kcal": 520,
    "proteines": 26,
    "glucides": 42,
    "lipides": 28,
    "tempsMinutes": 20,
    "motsCles": [
      "oeufs",
      "pommes de terre",
      "salade"
    ],
    "ingredients": [
      {
        "nom": "oeufs",
        "quantite": 3,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "pommes de terre",
        "quantite": 220,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "salade verte",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "vinaigre",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre en dés.",
      "Battre les oeufs.",
      "Cuire l'omelette avec les pommes de terre.",
      "Préparer la salade avec l'huile et le vinaigre.",
      "Servir ensemble."
    ]
  },
  {
    "id": "plat-dinde-pates-haricots-verts",
    "nom": "Dinde pâtes haricots verts",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "kcal": 560,
    "proteines": 43,
    "glucides": 62,
    "lipides": 13,
    "tempsMinutes": 25,
    "motsCles": [
      "dinde",
      "pâtes",
      "haricots verts"
    ],
    "ingredients": [
      {
        "nom": "escalope de dinde",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "pâtes crues",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "haricots verts",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "ail",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Cuire les pâtes.",
      "Cuire les haricots verts.",
      "Couper la dinde en morceaux.",
      "Cuire la dinde avec l'huile et l'ail.",
      "Servir avec les pâtes et les haricots verts."
    ]
  },
  {
    "id": "plat-lentilles-saucisse-de-volaille",
    "nom": "Lentilles saucisse de volaille",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 610,
    "proteines": 35,
    "glucides": 55,
    "lipides": 26,
    "tempsMinutes": 25,
    "motsCles": [
      "lentilles",
      "saucisse de volaille",
      "carottes"
    ],
    "ingredients": [
      {
        "nom": "lentilles cuites",
        "quantite": 220,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "saucisse de volaille",
        "quantite": 120,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "carottes",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "oignon",
        "quantite": 0.5,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Couper les carottes et l'oignon.",
      "Faire revenir l'oignon avec l'huile.",
      "Ajouter les lentilles et les carottes.",
      "Cuire la saucisse à part.",
      "Servir ensemble."
    ]
  },
  {
    "id": "plat-quiche-jambon-salade",
    "nom": "Quiche jambon salade",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "lactose",
      "oeuf"
    ],
    "kcal": 620,
    "proteines": 30,
    "glucides": 45,
    "lipides": 34,
    "tempsMinutes": 40,
    "motsCles": [
      "pâte brisée",
      "jambon",
      "oeufs"
    ],
    "ingredients": [
      {
        "nom": "pâte brisée",
        "quantite": 80,
        "unite": "g",
        "rayon": "Boulangerie"
      },
      {
        "nom": "jambon blanc",
        "quantite": 1,
        "unite": "tranche",
        "rayon": "Boucherie"
      },
      {
        "nom": "oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "crème légère",
        "quantite": 60,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "salade verte",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Préchauffer le four.",
      "Mélanger les oeufs et la crème.",
      "Ajouter le jambon sur la pâte.",
      "Verser l'appareil et cuire au four.",
      "Servir avec la salade."
    ]
  },
  {
    "id": "plat-gratin-de-pates-au-poulet",
    "nom": "Gratin de pâtes au poulet",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 640,
    "proteines": 42,
    "glucides": 62,
    "lipides": 24,
    "tempsMinutes": 35,
    "motsCles": [
      "pâtes",
      "poulet",
      "emmental"
    ],
    "ingredients": [
      {
        "nom": "pâtes crues",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "blanc de poulet",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "crème légère",
        "quantite": 50,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "emmental",
        "quantite": 30,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "courgettes",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Cuire les pâtes.",
      "Cuire le poulet en morceaux.",
      "Ajouter les courgettes.",
      "Mélanger avec la crème.",
      "Ajouter l'emmental et gratiner au four."
    ]
  },
  {
    "id": "plat-riz-thon-tomates",
    "nom": "Riz thon tomates",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "poisson"
    ],
    "kcal": 520,
    "proteines": 34,
    "glucides": 62,
    "lipides": 14,
    "tempsMinutes": 15,
    "motsCles": [
      "riz",
      "thon",
      "tomates"
    ],
    "ingredients": [
      {
        "nom": "riz cru",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "thon au naturel",
        "quantite": 120,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "tomates",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "maïs",
        "quantite": 60,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire le riz.",
      "Égoutter le thon.",
      "Couper les tomates.",
      "Mélanger le riz, le thon, les tomates et le maïs.",
      "Ajouter l'huile d'olive."
    ]
  },
  {
    "id": "plat-boeuf-pommes-de-terre-carottes",
    "nom": "Boeuf pommes de terre carottes",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [],
    "kcal": 610,
    "proteines": 38,
    "glucides": 48,
    "lipides": 28,
    "tempsMinutes": 30,
    "motsCles": [
      "boeuf",
      "pommes de terre",
      "carottes"
    ],
    "ingredients": [
      {
        "nom": "boeuf haché 5%",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "pommes de terre",
        "quantite": 230,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "carottes",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "oignon",
        "quantite": 0.5,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Couper les pommes de terre et les carottes.",
      "Cuire les légumes à l'eau.",
      "Faire revenir l'oignon.",
      "Ajouter le boeuf haché et cuire.",
      "Servir avec les légumes."
    ]
  },
  {
    "id": "plat-salade-poulet-pommes-de-terre",
    "nom": "Salade poulet pommes de terre",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 540,
    "proteines": 40,
    "glucides": 45,
    "lipides": 22,
    "tempsMinutes": 25,
    "motsCles": [
      "poulet",
      "pommes de terre",
      "salade"
    ],
    "ingredients": [
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "pommes de terre",
        "quantite": 220,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "salade verte",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomate",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre.",
      "Cuire le poulet à la poêle.",
      "Couper la tomate.",
      "Mettre la salade dans une assiette.",
      "Ajouter le poulet, les pommes de terre et l'huile."
    ]
  },
  {
    "id": "plat-galette-oeuf-fromage-salade",
    "nom": "Galette oeuf fromage salade",
    "type": "plat",
    "categorie": "",
    "gout": "",
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
      "oeuf",
      "lactose"
    ],
    "kcal": 560,
    "proteines": 28,
    "glucides": 48,
    "lipides": 28,
    "tempsMinutes": 15,
    "motsCles": [
      "galette de sarrasin",
      "oeuf",
      "emmental"
    ],
    "ingredients": [
      {
        "nom": "galette de sarrasin",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Boulangerie"
      },
      {
        "nom": "oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "emmental",
        "quantite": 35,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "salade verte",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Chauffer la galette dans une poêle.",
      "Ajouter les oeufs et l'emmental.",
      "Replier la galette.",
      "Préparer la salade avec l'huile.",
      "Servir ensemble."
    ]
  },
  {
    "id": "plat-ratatouille-pois-chiches-riz",
    "nom": "Ratatouille pois chiches riz",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 560,
    "proteines": 18,
    "glucides": 82,
    "lipides": 16,
    "tempsMinutes": 25,
    "motsCles": [
      "ratatouille",
      "pois chiches",
      "riz"
    ],
    "ingredients": [
      {
        "nom": "riz cru",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "pois chiches cuits",
        "quantite": 150,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "courgettes",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire le riz.",
      "Couper les légumes.",
      "Faire revenir les légumes avec l'huile.",
      "Ajouter les pois chiches.",
      "Servir avec le riz."
    ]
  },
  {
    "id": "plat-pommes-de-terre-oeufs-salade",
    "nom": "Pommes de terre oeufs salade",
    "type": "plat",
    "categorie": "",
    "gout": "",
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
      "oeuf"
    ],
    "kcal": 520,
    "proteines": 24,
    "glucides": 48,
    "lipides": 26,
    "tempsMinutes": 25,
    "motsCles": [
      "pommes de terre",
      "oeufs",
      "salade"
    ],
    "ingredients": [
      {
        "nom": "pommes de terre",
        "quantite": 250,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "oeufs",
        "quantite": 3,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "salade verte",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomate",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre.",
      "Cuire les oeufs durs.",
      "Couper la tomate.",
      "Assembler avec la salade.",
      "Ajouter l'huile d'olive."
    ]
  },
  {
    "id": "plat-poelee-tofu-pommes-de-terre",
    "nom": "Poêlée tofu pommes de terre",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "soja"
    ],
    "kcal": 570,
    "proteines": 28,
    "glucides": 52,
    "lipides": 26,
    "tempsMinutes": 25,
    "motsCles": [
      "tofu",
      "pommes de terre",
      "courgettes"
    ],
    "ingredients": [
      {
        "nom": "tofu nature",
        "quantite": 160,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "pommes de terre",
        "quantite": 220,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "courgettes",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "herbes de Provence",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Couper les pommes de terre et les courgettes.",
      "Cuire les pommes de terre à l'eau.",
      "Couper le tofu en dés.",
      "Faire revenir le tofu et les courgettes avec l'huile.",
      "Ajouter les pommes de terre et les herbes."
    ]
  },
  {
    "id": "plat-hachis-parmentier-leger",
    "nom": "Hachis parmentier léger",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose"
    ],
    "kcal": 630,
    "proteines": 38,
    "glucides": 52,
    "lipides": 28,
    "tempsMinutes": 40,
    "motsCles": [
      "boeuf haché",
      "pommes de terre",
      "carottes"
    ],
    "ingredients": [
      {
        "nom": "boeuf haché 5%",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "pommes de terre",
        "quantite": 260,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "carottes",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "lait demi-écrémé",
        "quantite": 50,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "emmental",
        "quantite": 25,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre.",
      "Écraser avec le lait.",
      "Cuire le boeuf avec les carottes.",
      "Déposer dans un plat.",
      "Ajouter la purée et l'emmental puis gratiner."
    ]
  },
  {
    "id": "plat-salade-nicoise-simple",
    "nom": "Salade niçoise simple",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson",
      "oeuf"
    ],
    "kcal": 540,
    "proteines": 36,
    "glucides": 35,
    "lipides": 28,
    "tempsMinutes": 20,
    "motsCles": [
      "thon",
      "oeufs",
      "pommes de terre"
    ],
    "ingredients": [
      {
        "nom": "thon au naturel",
        "quantite": 100,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "pommes de terre",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomate",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre.",
      "Cuire les oeufs durs.",
      "Égoutter le thon.",
      "Couper la tomate.",
      "Assembler avec l'huile d'olive."
    ]
  },
  {
    "id": "plat-poulet-coquillettes-legumes",
    "nom": "Poulet coquillettes légumes",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 610,
    "proteines": 42,
    "glucides": 65,
    "lipides": 20,
    "tempsMinutes": 25,
    "motsCles": [
      "poulet",
      "coquillettes",
      "carottes"
    ],
    "ingredients": [
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "coquillettes crues",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "carottes",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "crème légère",
        "quantite": 40,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire les coquillettes.",
      "Couper les carottes.",
      "Cuire le poulet avec l'huile.",
      "Ajouter les carottes et la crème.",
      "Servir avec les coquillettes."
    ]
  },
  {
    "id": "plat-bowl-lentilles-oeuf-feta",
    "nom": "Bowl lentilles oeuf feta",
    "type": "plat",
    "categorie": "",
    "gout": "",
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
      "oeuf",
      "lactose"
    ],
    "kcal": 560,
    "proteines": 30,
    "glucides": 48,
    "lipides": 26,
    "tempsMinutes": 20,
    "motsCles": [
      "lentilles",
      "oeuf",
      "feta"
    ],
    "ingredients": [
      {
        "nom": "lentilles cuites",
        "quantite": 220,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "feta",
        "quantite": 40,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "tomate",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire les oeufs durs.",
      "Réchauffer ou rincer les lentilles.",
      "Couper la tomate.",
      "Ajouter la feta.",
      "Assembler avec l'huile d'olive."
    ]
  },
  {
    "id": "plat-gratin-chou-fleur-dinde",
    "nom": "Gratin chou-fleur dinde",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose"
    ],
    "kcal": 520,
    "proteines": 42,
    "glucides": 30,
    "lipides": 26,
    "tempsMinutes": 35,
    "motsCles": [
      "chou-fleur",
      "dinde",
      "emmental"
    ],
    "ingredients": [
      {
        "nom": "chou-fleur",
        "quantite": 300,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "blanc de dinde",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "crème légère",
        "quantite": 60,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "emmental",
        "quantite": 35,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "pommes de terre",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Cuire le chou-fleur et les pommes de terre.",
      "Cuire la dinde en morceaux.",
      "Mettre dans un plat.",
      "Ajouter la crème et l'emmental.",
      "Gratiner au four."
    ]
  },
  {
    "id": "plat-riz-legumes-oeufs",
    "nom": "Riz légumes oeufs",
    "type": "plat",
    "categorie": "",
    "gout": "",
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
      "oeuf"
    ],
    "kcal": 560,
    "proteines": 24,
    "glucides": 70,
    "lipides": 20,
    "tempsMinutes": 20,
    "motsCles": [
      "riz",
      "oeufs",
      "carottes"
    ],
    "ingredients": [
      {
        "nom": "riz cru",
        "quantite": 80,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "oeufs",
        "quantite": 3,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "carottes",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "petits pois",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire le riz.",
      "Cuire les carottes et petits pois.",
      "Battre les oeufs.",
      "Cuire les oeufs brouillés.",
      "Mélanger avec le riz et les légumes."
    ]
  },
  {
    "id": "plat-poisson-pane-salade-pommes-vapeur",
    "nom": "Poisson pané salade pommes vapeur",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "poisson"
    ],
    "kcal": 570,
    "proteines": 32,
    "glucides": 58,
    "lipides": 22,
    "tempsMinutes": 25,
    "motsCles": [
      "poisson pané",
      "pommes de terre",
      "salade"
    ],
    "ingredients": [
      {
        "nom": "poisson pané",
        "quantite": 140,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "pommes de terre",
        "quantite": 250,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "salade verte",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomate",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre.",
      "Cuire le poisson pané.",
      "Couper la tomate.",
      "Préparer la salade avec l'huile.",
      "Servir ensemble."
    ]
  },
  {
    "id": "plat-boulgour-poulet-carottes",
    "nom": "Boulgour poulet carottes",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "kcal": 560,
    "proteines": 42,
    "glucides": 58,
    "lipides": 16,
    "tempsMinutes": 25,
    "motsCles": [
      "boulgour",
      "poulet",
      "carottes"
    ],
    "ingredients": [
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "boulgour cru",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "carottes",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "oignon",
        "quantite": 0.5,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire le boulgour.",
      "Couper les carottes et l'oignon.",
      "Cuire le poulet avec l'huile.",
      "Ajouter les légumes.",
      "Servir avec le boulgour."
    ]
  },
  {
    "id": "plat-pates-thon-courgettes",
    "nom": "Pâtes thon courgettes",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "poisson"
    ],
    "kcal": 590,
    "proteines": 38,
    "glucides": 68,
    "lipides": 18,
    "tempsMinutes": 20,
    "motsCles": [
      "pâtes",
      "thon",
      "courgettes"
    ],
    "ingredients": [
      {
        "nom": "pâtes crues",
        "quantite": 80,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "thon au naturel",
        "quantite": 120,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "courgettes",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire les pâtes.",
      "Couper les courgettes.",
      "Cuire les courgettes avec l'huile.",
      "Ajouter le thon et les tomates.",
      "Mélanger avec les pâtes."
    ]
  },
  {
    "id": "plat-tofu-ratatouille-riz",
    "nom": "Tofu ratatouille riz",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "soja"
    ],
    "kcal": 590,
    "proteines": 29,
    "glucides": 72,
    "lipides": 20,
    "tempsMinutes": 25,
    "motsCles": [
      "tofu",
      "ratatouille",
      "riz"
    ],
    "ingredients": [
      {
        "nom": "tofu nature",
        "quantite": 180,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "riz cru",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "courgettes",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire le riz.",
      "Couper les légumes.",
      "Faire revenir le tofu avec l'huile.",
      "Ajouter les légumes et cuire.",
      "Servir avec le riz."
    ]
  },
  {
    "id": "plat-poulet-puree-carottes",
    "nom": "Poulet purée carottes",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose"
    ],
    "kcal": 560,
    "proteines": 43,
    "glucides": 46,
    "lipides": 20,
    "tempsMinutes": 30,
    "motsCles": [
      "poulet",
      "pommes de terre",
      "carottes"
    ],
    "ingredients": [
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "pommes de terre",
        "quantite": 230,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "carottes",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "lait demi-écrémé",
        "quantite": 50,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "beurre",
        "quantite": 10,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre et les carottes.",
      "Écraser avec le lait et le beurre.",
      "Cuire le poulet à la poêle.",
      "Assaisonner légèrement.",
      "Servir ensemble."
    ]
  },
  {
    "id": "plat-salade-pates-poulet",
    "nom": "Salade pâtes poulet",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "kcal": 580,
    "proteines": 41,
    "glucides": 60,
    "lipides": 18,
    "tempsMinutes": 20,
    "motsCles": [
      "pâtes",
      "poulet",
      "tomates"
    ],
    "ingredients": [
      {
        "nom": "pâtes crues",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "tomates",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "salade verte",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire les pâtes.",
      "Cuire le poulet.",
      "Couper les tomates.",
      "Mettre la salade dans une assiette.",
      "Ajouter les pâtes, le poulet et l'huile."
    ]
  },
  {
    "id": "plat-pois-chiches-pommes-de-terre",
    "nom": "Pois chiches pommes de terre",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 560,
    "proteines": 19,
    "glucides": 78,
    "lipides": 18,
    "tempsMinutes": 25,
    "motsCles": [
      "pois chiches",
      "pommes de terre",
      "courgettes"
    ],
    "ingredients": [
      {
        "nom": "pois chiches cuits",
        "quantite": 180,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "pommes de terre",
        "quantite": 220,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "courgettes",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre.",
      "Couper les courgettes et tomates.",
      "Faire revenir les légumes avec l'huile.",
      "Ajouter les pois chiches.",
      "Servir avec les pommes de terre."
    ]
  },
  {
    "id": "plat-dinde-riz-champignons",
    "nom": "Dinde riz champignons",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose"
    ],
    "kcal": 570,
    "proteines": 43,
    "glucides": 58,
    "lipides": 18,
    "tempsMinutes": 25,
    "motsCles": [
      "dinde",
      "riz",
      "champignons"
    ],
    "ingredients": [
      {
        "nom": "escalope de dinde",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "riz cru",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "champignons",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "crème légère",
        "quantite": 50,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire le riz.",
      "Couper les champignons.",
      "Cuire la dinde avec l'huile.",
      "Ajouter les champignons et la crème.",
      "Servir avec le riz."
    ]
  },
  {
    "id": "plat-boulettes-boeuf-carottes-riz",
    "nom": "Boulettes boeuf carottes riz",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 620,
    "proteines": 38,
    "glucides": 60,
    "lipides": 26,
    "tempsMinutes": 30,
    "motsCles": [
      "boeuf haché",
      "riz",
      "carottes"
    ],
    "ingredients": [
      {
        "nom": "boeuf haché 5%",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "riz cru",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "carottes",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Former des boulettes avec le boeuf.",
      "Cuire le riz.",
      "Faire revenir les boulettes.",
      "Ajouter les carottes et les tomates.",
      "Servir avec le riz."
    ]
  },
  {
    "id": "plat-poelee-oeufs-legumes-riz",
    "nom": "Poêlée oeufs légumes riz",
    "type": "plat",
    "categorie": "",
    "gout": "",
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
      "oeuf"
    ],
    "kcal": 540,
    "proteines": 24,
    "glucides": 68,
    "lipides": 18,
    "tempsMinutes": 20,
    "motsCles": [
      "oeufs",
      "riz",
      "courgettes"
    ],
    "ingredients": [
      {
        "nom": "riz cru",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "oeufs",
        "quantite": 3,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "courgettes",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire le riz.",
      "Couper les légumes.",
      "Faire revenir les légumes avec l'huile.",
      "Ajouter les oeufs battus.",
      "Servir avec le riz."
    ]
  },
  {
    "id": "plat-filet-de-lieu-riz-epinards",
    "nom": "Filet de lieu riz épinards",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson",
      "lactose"
    ],
    "kcal": 500,
    "proteines": 36,
    "glucides": 55,
    "lipides": 14,
    "tempsMinutes": 25,
    "motsCles": [
      "lieu noir",
      "riz",
      "épinards"
    ],
    "ingredients": [
      {
        "nom": "filet de lieu noir",
        "quantite": 160,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "riz cru",
        "quantite": 65,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "épinards",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "crème légère",
        "quantite": 40,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "citron",
        "quantite": 0.5,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Cuire le riz.",
      "Cuire les épinards.",
      "Cuire le poisson à la poêle.",
      "Ajouter la crème aux épinards.",
      "Servir avec le citron."
    ]
  },
  {
    "id": "plat-poulet-pates-brocolis",
    "nom": "Poulet pâtes brocolis",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 610,
    "proteines": 43,
    "glucides": 66,
    "lipides": 19,
    "tempsMinutes": 25,
    "motsCles": [
      "poulet",
      "pâtes",
      "brocolis"
    ],
    "ingredients": [
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "pâtes crues",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "brocolis",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "crème légère",
        "quantite": 40,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire les pâtes.",
      "Cuire les brocolis.",
      "Couper le poulet en morceaux.",
      "Cuire le poulet avec l'huile.",
      "Ajouter la crème et servir avec les pâtes et brocolis."
    ]
  },
  {
    "id": "plat-steak-riz-ratatouille",
    "nom": "Steak riz ratatouille",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 600,
    "proteines": 36,
    "glucides": 62,
    "lipides": 24,
    "tempsMinutes": 25,
    "motsCles": [
      "steak haché",
      "riz",
      "ratatouille"
    ],
    "ingredients": [
      {
        "nom": "steak haché 5%",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "riz cru",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "courgettes",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire le riz.",
      "Couper les légumes.",
      "Faire revenir les légumes avec l'huile.",
      "Cuire le steak haché.",
      "Servir avec le riz et les légumes."
    ]
  },
  {
    "id": "plat-dinde-pommes-de-terre-epinards",
    "nom": "Dinde pommes de terre épinards",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose"
    ],
    "kcal": 560,
    "proteines": 43,
    "glucides": 48,
    "lipides": 20,
    "tempsMinutes": 25,
    "motsCles": [
      "dinde",
      "pommes de terre",
      "épinards"
    ],
    "ingredients": [
      {
        "nom": "escalope de dinde",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "pommes de terre",
        "quantite": 240,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "épinards",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "crème légère",
        "quantite": 50,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre.",
      "Cuire la dinde avec l'huile.",
      "Faire revenir les épinards.",
      "Ajouter la crème aux épinards.",
      "Servir ensemble."
    ]
  },
  {
    "id": "plat-merlu-riz-carottes",
    "nom": "Merlu riz carottes",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson"
    ],
    "kcal": 500,
    "proteines": 36,
    "glucides": 58,
    "lipides": 12,
    "tempsMinutes": 25,
    "motsCles": [
      "merlu",
      "riz",
      "carottes"
    ],
    "ingredients": [
      {
        "nom": "filet de merlu",
        "quantite": 160,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "riz cru",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "carottes",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      },
      {
        "nom": "citron",
        "quantite": 0.5,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Cuire le riz.",
      "Cuire les carottes à l'eau.",
      "Cuire le merlu à la poêle avec l'huile.",
      "Ajouter le citron.",
      "Servir avec le riz et les carottes."
    ]
  },
  {
    "id": "plat-salade-riz-thon-oeuf",
    "nom": "Salade riz thon oeuf",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "poisson",
      "oeuf"
    ],
    "kcal": 560,
    "proteines": 38,
    "glucides": 58,
    "lipides": 20,
    "tempsMinutes": 20,
    "motsCles": [
      "riz",
      "thon",
      "oeuf"
    ],
    "ingredients": [
      {
        "nom": "riz cru",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "thon au naturel",
        "quantite": 100,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "tomate",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire le riz.",
      "Cuire les oeufs durs.",
      "Égoutter le thon.",
      "Couper la tomate.",
      "Assembler avec l'huile d'olive."
    ]
  },
  {
    "id": "plat-omelette-courgettes-fromage",
    "nom": "Omelette courgettes fromage",
    "type": "plat",
    "categorie": "",
    "gout": "",
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
      "oeuf",
      "lactose"
    ],
    "kcal": 520,
    "proteines": 31,
    "glucides": 30,
    "lipides": 30,
    "tempsMinutes": 20,
    "motsCles": [
      "oeufs",
      "courgettes",
      "emmental"
    ],
    "ingredients": [
      {
        "nom": "oeufs",
        "quantite": 3,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "courgettes",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "emmental",
        "quantite": 35,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "pommes de terre",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre en dés.",
      "Faire revenir les courgettes avec l'huile.",
      "Battre les oeufs.",
      "Ajouter les oeufs et l'emmental.",
      "Servir avec les pommes de terre."
    ]
  },
  {
    "id": "plat-poulet-lentilles-tomates",
    "nom": "Poulet lentilles tomates",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 570,
    "proteines": 48,
    "glucides": 48,
    "lipides": 17,
    "tempsMinutes": 25,
    "motsCles": [
      "poulet",
      "lentilles",
      "tomates"
    ],
    "ingredients": [
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "lentilles cuites",
        "quantite": 220,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomates",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "carottes",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Couper le poulet.",
      "Cuire le poulet avec l'huile.",
      "Ajouter les carottes et tomates.",
      "Ajouter les lentilles.",
      "Laisser chauffer quelques minutes."
    ]
  },
  {
    "id": "plat-boeuf-pates-courgettes",
    "nom": "Boeuf pâtes courgettes",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "kcal": 630,
    "proteines": 39,
    "glucides": 68,
    "lipides": 24,
    "tempsMinutes": 25,
    "motsCles": [
      "boeuf haché",
      "pâtes",
      "courgettes"
    ],
    "ingredients": [
      {
        "nom": "boeuf haché 5%",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "pâtes crues",
        "quantite": 80,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "courgettes",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire les pâtes.",
      "Couper les courgettes.",
      "Cuire le boeuf avec l'huile.",
      "Ajouter les courgettes et les tomates.",
      "Servir avec les pâtes."
    ]
  },
  {
    "id": "plat-colin-puree-brocolis",
    "nom": "Colin purée brocolis",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson",
      "lactose"
    ],
    "kcal": 510,
    "proteines": 36,
    "glucides": 48,
    "lipides": 18,
    "tempsMinutes": 30,
    "motsCles": [
      "colin",
      "pommes de terre",
      "brocolis"
    ],
    "ingredients": [
      {
        "nom": "filet de colin",
        "quantite": 160,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "pommes de terre",
        "quantite": 240,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "brocolis",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "lait demi-écrémé",
        "quantite": 50,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "beurre",
        "quantite": 10,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre.",
      "Cuire les brocolis.",
      "Écraser les pommes de terre avec le lait et le beurre.",
      "Cuire le colin à la poêle.",
      "Servir ensemble."
    ]
  },
  {
    "id": "plat-gratin-pommes-de-terre-thon",
    "nom": "Gratin pommes de terre thon",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "poisson",
      "lactose"
    ],
    "kcal": 620,
    "proteines": 36,
    "glucides": 50,
    "lipides": 30,
    "tempsMinutes": 40,
    "motsCles": [
      "pommes de terre",
      "thon",
      "emmental"
    ],
    "ingredients": [
      {
        "nom": "pommes de terre",
        "quantite": 260,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "thon au naturel",
        "quantite": 120,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "crème légère",
        "quantite": 60,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "emmental",
        "quantite": 35,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "courgettes",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre en rondelles.",
      "Égoutter le thon.",
      "Couper les courgettes.",
      "Mettre le tout dans un plat avec la crème.",
      "Ajouter l'emmental et gratiner."
    ]
  },
  {
    "id": "plat-poelee-pois-chiches-carottes",
    "nom": "Poêlée pois chiches carottes",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 520,
    "proteines": 18,
    "glucides": 70,
    "lipides": 18,
    "tempsMinutes": 25,
    "motsCles": [
      "pois chiches",
      "carottes",
      "pommes de terre"
    ],
    "ingredients": [
      {
        "nom": "pois chiches cuits",
        "quantite": 180,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "pommes de terre",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "carottes",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre.",
      "Couper les carottes.",
      "Faire revenir les carottes avec l'huile.",
      "Ajouter les pois chiches et les tomates.",
      "Servir avec les pommes de terre."
    ]
  },
  {
    "id": "plat-escalope-de-poulet-semoule",
    "nom": "Escalope de poulet semoule",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "kcal": 570,
    "proteines": 42,
    "glucides": 60,
    "lipides": 16,
    "tempsMinutes": 20,
    "motsCles": [
      "poulet",
      "semoule",
      "carottes"
    ],
    "ingredients": [
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "semoule crue",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "carottes",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "courgettes",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Préparer la semoule avec de l'eau chaude.",
      "Couper les légumes.",
      "Cuire le poulet avec l'huile.",
      "Ajouter les légumes.",
      "Servir avec la semoule."
    ]
  },
  {
    "id": "plat-salade-lentilles-poulet",
    "nom": "Salade lentilles poulet",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 560,
    "proteines": 45,
    "glucides": 45,
    "lipides": 22,
    "tempsMinutes": 20,
    "motsCles": [
      "lentilles",
      "poulet",
      "tomates"
    ],
    "ingredients": [
      {
        "nom": "lentilles cuites",
        "quantite": 220,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "tomates",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "salade verte",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire le poulet.",
      "Rincer les lentilles.",
      "Couper les tomates.",
      "Mettre la salade dans une assiette.",
      "Ajouter les lentilles, le poulet et l'huile."
    ]
  },
  {
    "id": "plat-riz-dinde-petits-pois",
    "nom": "Riz dinde petits pois",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 560,
    "proteines": 43,
    "glucides": 64,
    "lipides": 13,
    "tempsMinutes": 20,
    "motsCles": [
      "dinde",
      "riz",
      "petits pois"
    ],
    "ingredients": [
      {
        "nom": "escalope de dinde",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "riz cru",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "petits pois",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "carottes",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire le riz.",
      "Couper la dinde.",
      "Cuire la dinde avec l'huile.",
      "Ajouter les petits pois et les carottes.",
      "Servir avec le riz."
    ]
  },
  {
    "id": "plat-pommes-de-terre-thon-oeuf",
    "nom": "Pommes de terre thon oeuf",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "poisson",
      "oeuf"
    ],
    "kcal": 560,
    "proteines": 39,
    "glucides": 45,
    "lipides": 24,
    "tempsMinutes": 25,
    "motsCles": [
      "pommes de terre",
      "thon",
      "oeufs"
    ],
    "ingredients": [
      {
        "nom": "pommes de terre",
        "quantite": 230,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "thon au naturel",
        "quantite": 100,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "tomate",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre.",
      "Cuire les oeufs durs.",
      "Égoutter le thon.",
      "Couper la tomate.",
      "Assembler avec l'huile."
    ]
  },
  {
    "id": "plat-tofu-lentilles-carottes",
    "nom": "Tofu lentilles carottes",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "soja"
    ],
    "kcal": 580,
    "proteines": 33,
    "glucides": 55,
    "lipides": 24,
    "tempsMinutes": 25,
    "motsCles": [
      "tofu",
      "lentilles",
      "carottes"
    ],
    "ingredients": [
      {
        "nom": "tofu nature",
        "quantite": 160,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "lentilles cuites",
        "quantite": 200,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "carottes",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Couper le tofu en dés.",
      "Couper les carottes.",
      "Faire revenir le tofu avec l'huile.",
      "Ajouter les carottes et les tomates.",
      "Ajouter les lentilles et réchauffer."
    ]
  },
  {
    "id": "plat-pates-poulet-epinards",
    "nom": "Pâtes poulet épinards",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 620,
    "proteines": 44,
    "glucides": 65,
    "lipides": 21,
    "tempsMinutes": 25,
    "motsCles": [
      "poulet",
      "pâtes",
      "épinards"
    ],
    "ingredients": [
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "pâtes crues",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "épinards",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "crème légère",
        "quantite": 50,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire les pâtes.",
      "Cuire le poulet avec l'huile.",
      "Faire revenir les épinards.",
      "Ajouter la crème.",
      "Mélanger avec les pâtes."
    ]
  },
  {
    "id": "plat-boeuf-riz-haricots-verts",
    "nom": "Boeuf riz haricots verts",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 600,
    "proteines": 38,
    "glucides": 60,
    "lipides": 24,
    "tempsMinutes": 25,
    "motsCles": [
      "boeuf haché",
      "riz",
      "haricots verts"
    ],
    "ingredients": [
      {
        "nom": "boeuf haché 5%",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "riz cru",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "haricots verts",
        "quantite": 220,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire le riz.",
      "Cuire les haricots verts.",
      "Cuire le boeuf avec l'huile.",
      "Ajouter les tomates concassées.",
      "Servir ensemble."
    ]
  },
  {
    "id": "plat-tortilla-pommes-de-terre-salade",
    "nom": "Tortilla pommes de terre salade",
    "type": "plat",
    "categorie": "",
    "gout": "",
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
      "oeuf"
    ],
    "kcal": 540,
    "proteines": 25,
    "glucides": 45,
    "lipides": 28,
    "tempsMinutes": 25,
    "motsCles": [
      "oeufs",
      "pommes de terre",
      "salade"
    ],
    "ingredients": [
      {
        "nom": "oeufs",
        "quantite": 3,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "pommes de terre",
        "quantite": 230,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "salade verte",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomate",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre en dés.",
      "Battre les oeufs.",
      "Cuire la tortilla à la poêle.",
      "Préparer la salade et la tomate.",
      "Servir ensemble."
    ]
  },
  {
    "id": "plat-poelee-vegetarienne-riz",
    "nom": "Poêlée végétarienne riz",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 560,
    "proteines": 18,
    "glucides": 82,
    "lipides": 16,
    "tempsMinutes": 25,
    "motsCles": [
      "riz",
      "pois chiches",
      "légumes"
    ],
    "ingredients": [
      {
        "nom": "riz cru",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "pois chiches cuits",
        "quantite": 160,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "courgettes",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "carottes",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire le riz.",
      "Couper les légumes.",
      "Faire revenir les légumes avec l'huile.",
      "Ajouter les pois chiches.",
      "Servir avec le riz."
    ]
  },
  {
    "id": "plat-dinde-puree-brocolis",
    "nom": "Dinde purée brocolis",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose"
    ],
    "kcal": 560,
    "proteines": 43,
    "glucides": 46,
    "lipides": 20,
    "tempsMinutes": 30,
    "motsCles": [
      "dinde",
      "pommes de terre",
      "brocolis"
    ],
    "ingredients": [
      {
        "nom": "escalope de dinde",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "pommes de terre",
        "quantite": 230,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "brocolis",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "lait demi-écrémé",
        "quantite": 50,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "beurre",
        "quantite": 10,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre.",
      "Cuire les brocolis.",
      "Écraser les pommes de terre avec le lait et le beurre.",
      "Cuire la dinde.",
      "Servir ensemble."
    ]
  },
  {
    "id": "plat-salade-quinoa-thon",
    "nom": "Salade quinoa thon",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson"
    ],
    "kcal": 560,
    "proteines": 35,
    "glucides": 55,
    "lipides": 22,
    "tempsMinutes": 20,
    "motsCles": [
      "quinoa",
      "thon",
      "tomates"
    ],
    "ingredients": [
      {
        "nom": "quinoa cru",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "thon au naturel",
        "quantite": 110,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "tomates",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "concombre",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire le quinoa.",
      "Égoutter le thon.",
      "Couper les tomates et le concombre.",
      "Mélanger les ingrédients.",
      "Ajouter l'huile d'olive."
    ]
  },
  {
    "id": "plat-poulet-pommes-de-terre-salade",
    "nom": "Poulet pommes de terre salade",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 570,
    "proteines": 42,
    "glucides": 48,
    "lipides": 22,
    "tempsMinutes": 25,
    "motsCles": [
      "poulet",
      "pommes de terre",
      "salade"
    ],
    "ingredients": [
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "pommes de terre",
        "quantite": 240,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "salade verte",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "concombre",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre.",
      "Cuire le poulet.",
      "Couper le concombre.",
      "Préparer la salade.",
      "Servir avec l'huile d'olive."
    ]
  },
  {
    "id": "plat-dahl-lentilles-carottes",
    "nom": "Dahl lentilles carottes",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 560,
    "proteines": 22,
    "glucides": 78,
    "lipides": 16,
    "tempsMinutes": 30,
    "motsCles": [
      "lentilles corail",
      "riz",
      "carottes"
    ],
    "ingredients": [
      {
        "nom": "lentilles corail crues",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "riz cru",
        "quantite": 55,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "carottes",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire le riz.",
      "Cuire les lentilles corail avec les tomates.",
      "Couper et ajouter les carottes.",
      "Ajouter l'huile.",
      "Servir avec le riz."
    ]
  },
  {
    "id": "plat-veau-riz-courgettes",
    "nom": "Veau riz courgettes",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [],
    "kcal": 590,
    "proteines": 39,
    "glucides": 60,
    "lipides": 22,
    "tempsMinutes": 30,
    "motsCles": [
      "veau",
      "riz",
      "courgettes"
    ],
    "ingredients": [
      {
        "nom": "escalope de veau",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "riz cru",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "courgettes",
        "quantite": 220,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire le riz.",
      "Couper les courgettes.",
      "Cuire le veau avec l'huile.",
      "Ajouter les courgettes et les tomates.",
      "Servir avec le riz."
    ]
  },
  {
    "id": "plat-pates-oeufs-champignons",
    "nom": "Pâtes oeufs champignons",
    "type": "plat",
    "categorie": "",
    "gout": "",
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
      "oeuf",
      "lactose"
    ],
    "kcal": 590,
    "proteines": 29,
    "glucides": 66,
    "lipides": 23,
    "tempsMinutes": 20,
    "motsCles": [
      "pâtes",
      "oeufs",
      "champignons"
    ],
    "ingredients": [
      {
        "nom": "pâtes crues",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "champignons",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "crème légère",
        "quantite": 40,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "emmental",
        "quantite": 20,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Cuire les pâtes.",
      "Faire revenir les champignons.",
      "Cuire les oeufs brouillés.",
      "Ajouter la crème.",
      "Mélanger avec les pâtes et l'emmental."
    ]
  },
  {
    "id": "plat-pois-casses-carottes-oeuf",
    "nom": "Pois cassés carottes oeuf",
    "type": "plat",
    "categorie": "",
    "gout": "",
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
      "oeuf"
    ],
    "kcal": 550,
    "proteines": 30,
    "glucides": 65,
    "lipides": 18,
    "tempsMinutes": 30,
    "motsCles": [
      "pois cassés",
      "carottes",
      "oeufs"
    ],
    "ingredients": [
      {
        "nom": "pois cassés cuits",
        "quantite": 250,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "carottes",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "oignon",
        "quantite": 0.5,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Réchauffer les pois cassés.",
      "Faire revenir l'oignon et les carottes avec l'huile.",
      "Cuire les oeufs durs.",
      "Assembler les pois cassés et les légumes.",
      "Servir avec les oeufs."
    ]
  },
  {
    "id": "plat-filet-de-truite-riz-legumes",
    "nom": "Filet de truite riz légumes",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson"
    ],
    "kcal": 610,
    "proteines": 38,
    "glucides": 55,
    "lipides": 28,
    "tempsMinutes": 25,
    "motsCles": [
      "truite",
      "riz",
      "courgettes"
    ],
    "ingredients": [
      {
        "nom": "filet de truite",
        "quantite": 140,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "riz cru",
        "quantite": 65,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "courgettes",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "carottes",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "citron",
        "quantite": 0.5,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Cuire le riz.",
      "Couper les légumes.",
      "Cuire les légumes à la poêle.",
      "Cuire la truite.",
      "Servir avec le citron."
    ]
  },
  {
    "id": "plat-poulet-haricots-blancs-tomates",
    "nom": "Poulet haricots blancs tomates",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 580,
    "proteines": 48,
    "glucides": 50,
    "lipides": 18,
    "tempsMinutes": 25,
    "motsCles": [
      "poulet",
      "haricots blancs",
      "tomates"
    ],
    "ingredients": [
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "haricots blancs cuits",
        "quantite": 220,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "carottes",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Couper le poulet.",
      "Cuire le poulet avec l'huile.",
      "Ajouter les carottes.",
      "Ajouter les tomates et les haricots blancs.",
      "Laisser mijoter quelques minutes."
    ]
  },
  {
    "id": "plat-croque-salade",
    "nom": "Croque salade",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 590,
    "proteines": 31,
    "glucides": 52,
    "lipides": 28,
    "tempsMinutes": 15,
    "motsCles": [
      "pain complet",
      "jambon",
      "emmental"
    ],
    "ingredients": [
      {
        "nom": "pain complet",
        "quantite": 3,
        "unite": "tranche",
        "rayon": "Boulangerie"
      },
      {
        "nom": "jambon blanc",
        "quantite": 2,
        "unite": "tranche",
        "rayon": "Boucherie"
      },
      {
        "nom": "emmental",
        "quantite": 40,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "salade verte",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomate",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Monter le croque avec le pain, le jambon et l'emmental.",
      "Faire toaster à la poêle ou au four.",
      "Couper la tomate.",
      "Préparer la salade.",
      "Servir ensemble."
    ]
  },
  {
    "id": "plat-riz-oeufs-thon-legumes",
    "nom": "Riz oeufs thon légumes",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "oeuf",
      "poisson"
    ],
    "kcal": 590,
    "proteines": 42,
    "glucides": 62,
    "lipides": 20,
    "tempsMinutes": 20,
    "motsCles": [
      "riz",
      "oeufs",
      "thon"
    ],
    "ingredients": [
      {
        "nom": "riz cru",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "thon au naturel",
        "quantite": 100,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "petits pois",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "carottes",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Cuire le riz.",
      "Cuire les oeufs brouillés.",
      "Égoutter le thon.",
      "Cuire les petits pois et carottes.",
      "Mélanger le tout."
    ]
  },
  {
    "id": "plat-salade-pois-chiches-feta",
    "nom": "Salade pois chiches feta",
    "type": "plat",
    "categorie": "",
    "gout": "",
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
    "kcal": 560,
    "proteines": 22,
    "glucides": 55,
    "lipides": 28,
    "tempsMinutes": 10,
    "motsCles": [
      "pois chiches",
      "feta",
      "tomates"
    ],
    "ingredients": [
      {
        "nom": "pois chiches cuits",
        "quantite": 220,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "feta",
        "quantite": 60,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "tomates",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "concombre",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Rincer les pois chiches.",
      "Couper les tomates et le concombre.",
      "Ajouter la feta.",
      "Ajouter l'huile d'olive.",
      "Mélanger et servir."
    ]
  },
  {
    "id": "plat-dinde-quinoa-tomates",
    "nom": "Dinde quinoa tomates",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [],
    "kcal": 580,
    "proteines": 43,
    "glucides": 55,
    "lipides": 20,
    "tempsMinutes": 25,
    "motsCles": [
      "dinde",
      "quinoa",
      "tomates"
    ],
    "ingredients": [
      {
        "nom": "escalope de dinde",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "quinoa cru",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomates",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "courgettes",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire le quinoa.",
      "Couper la dinde et les légumes.",
      "Cuire la dinde avec l'huile.",
      "Ajouter les légumes.",
      "Servir avec le quinoa."
    ]
  },
  {
    "id": "plat-poulet-riz-epinards",
    "nom": "Poulet riz épinards",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose"
    ],
    "kcal": 570,
    "proteines": 43,
    "glucides": 58,
    "lipides": 18,
    "tempsMinutes": 25,
    "motsCles": [
      "poulet",
      "riz",
      "épinards"
    ],
    "ingredients": [
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "riz cru",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "épinards",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "crème légère",
        "quantite": 50,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire le riz.",
      "Cuire le poulet avec l'huile.",
      "Faire revenir les épinards.",
      "Ajouter la crème aux épinards.",
      "Servir avec le riz."
    ]
  },
  {
    "id": "plat-steak-pommes-de-terre-salade",
    "nom": "Steak pommes de terre salade",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 590,
    "proteines": 36,
    "glucides": 46,
    "lipides": 28,
    "tempsMinutes": 25,
    "motsCles": [
      "steak haché",
      "pommes de terre",
      "salade"
    ],
    "ingredients": [
      {
        "nom": "steak haché 5%",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "pommes de terre",
        "quantite": 240,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "salade verte",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomate",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre.",
      "Cuire le steak haché.",
      "Couper la tomate.",
      "Préparer la salade avec l'huile.",
      "Servir ensemble."
    ]
  },
  {
    "id": "plat-dinde-lentilles-carottes",
    "nom": "Dinde lentilles carottes",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 560,
    "proteines": 45,
    "glucides": 46,
    "lipides": 18,
    "tempsMinutes": 25,
    "motsCles": [
      "dinde",
      "lentilles",
      "carottes"
    ],
    "ingredients": [
      {
        "nom": "escalope de dinde",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "lentilles cuites",
        "quantite": 220,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "carottes",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Couper la dinde.",
      "Cuire la dinde avec l'huile.",
      "Ajouter les carottes et les tomates.",
      "Ajouter les lentilles.",
      "Réchauffer quelques minutes."
    ]
  },
  {
    "id": "plat-colin-riz-haricots-verts",
    "nom": "Colin riz haricots verts",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson"
    ],
    "kcal": 500,
    "proteines": 36,
    "glucides": 58,
    "lipides": 12,
    "tempsMinutes": 25,
    "motsCles": [
      "colin",
      "riz",
      "haricots verts"
    ],
    "ingredients": [
      {
        "nom": "filet de colin",
        "quantite": 160,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "riz cru",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "haricots verts",
        "quantite": 220,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      },
      {
        "nom": "citron",
        "quantite": 0.5,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Cuire le riz.",
      "Cuire les haricots verts.",
      "Cuire le colin à la poêle avec l'huile.",
      "Ajouter le citron.",
      "Servir ensemble."
    ]
  },
  {
    "id": "plat-salade-pates-thon-oeuf",
    "nom": "Salade pâtes thon oeuf",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "poisson",
      "oeuf"
    ],
    "kcal": 610,
    "proteines": 41,
    "glucides": 65,
    "lipides": 22,
    "tempsMinutes": 20,
    "motsCles": [
      "pâtes",
      "thon",
      "oeuf"
    ],
    "ingredients": [
      {
        "nom": "pâtes crues",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "thon au naturel",
        "quantite": 100,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "tomates",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire les pâtes.",
      "Cuire les oeufs durs.",
      "Égoutter le thon.",
      "Couper les tomates.",
      "Mélanger avec l'huile."
    ]
  },
  {
    "id": "plat-omelette-epinards-pommes-de-terre",
    "nom": "Omelette épinards pommes de terre",
    "type": "plat",
    "categorie": "",
    "gout": "",
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
      "oeuf"
    ],
    "kcal": 520,
    "proteines": 25,
    "glucides": 42,
    "lipides": 28,
    "tempsMinutes": 25,
    "motsCles": [
      "oeufs",
      "épinards",
      "pommes de terre"
    ],
    "ingredients": [
      {
        "nom": "oeufs",
        "quantite": 3,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "épinards",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "pommes de terre",
        "quantite": 220,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomate",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre.",
      "Faire revenir les épinards avec l'huile.",
      "Battre les oeufs.",
      "Cuire l'omelette avec les épinards.",
      "Servir avec les pommes de terre et la tomate."
    ]
  },
  {
    "id": "plat-poulet-haricots-rouges-riz",
    "nom": "Poulet haricots rouges riz",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 590,
    "proteines": 45,
    "glucides": 65,
    "lipides": 15,
    "tempsMinutes": 25,
    "motsCles": [
      "poulet",
      "haricots rouges",
      "riz"
    ],
    "ingredients": [
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "haricots rouges cuits",
        "quantite": 150,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "riz cru",
        "quantite": 60,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire le riz.",
      "Cuire le poulet avec l'huile.",
      "Ajouter les haricots rouges.",
      "Ajouter les tomates concassées.",
      "Servir avec le riz."
    ]
  },
  {
    "id": "plat-boeuf-puree-brocolis",
    "nom": "Boeuf purée brocolis",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose"
    ],
    "kcal": 610,
    "proteines": 38,
    "glucides": 48,
    "lipides": 29,
    "tempsMinutes": 30,
    "motsCles": [
      "boeuf haché",
      "pommes de terre",
      "brocolis"
    ],
    "ingredients": [
      {
        "nom": "boeuf haché 5%",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "pommes de terre",
        "quantite": 240,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "brocolis",
        "quantite": 220,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "lait demi-écrémé",
        "quantite": 50,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "beurre",
        "quantite": 10,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre.",
      "Cuire les brocolis.",
      "Écraser les pommes de terre avec le lait et le beurre.",
      "Cuire le boeuf.",
      "Servir ensemble."
    ]
  },
  {
    "id": "plat-merlu-pates-courgettes",
    "nom": "Merlu pâtes courgettes",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "gluten",
      "poisson"
    ],
    "kcal": 570,
    "proteines": 38,
    "glucides": 68,
    "lipides": 14,
    "tempsMinutes": 25,
    "motsCles": [
      "merlu",
      "pâtes",
      "courgettes"
    ],
    "ingredients": [
      {
        "nom": "filet de merlu",
        "quantite": 160,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "pâtes crues",
        "quantite": 80,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "courgettes",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire les pâtes.",
      "Cuire le merlu à la poêle.",
      "Faire revenir les courgettes avec l'huile.",
      "Ajouter les tomates.",
      "Servir avec les pâtes."
    ]
  },
  {
    "id": "plat-gratin-courgettes-boeuf",
    "nom": "Gratin courgettes boeuf",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose"
    ],
    "kcal": 600,
    "proteines": 39,
    "glucides": 38,
    "lipides": 33,
    "tempsMinutes": 35,
    "motsCles": [
      "boeuf haché",
      "courgettes",
      "pommes de terre"
    ],
    "ingredients": [
      {
        "nom": "boeuf haché 5%",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "courgettes",
        "quantite": 250,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "pommes de terre",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "crème légère",
        "quantite": 50,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "emmental",
        "quantite": 30,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre.",
      "Cuire le boeuf.",
      "Couper les courgettes.",
      "Mettre le tout dans un plat avec la crème.",
      "Ajouter l'emmental et gratiner."
    ]
  },
  {
    "id": "plat-poelee-haricots-blancs-legumes",
    "nom": "Poêlée haricots blancs légumes",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 540,
    "proteines": 19,
    "glucides": 72,
    "lipides": 18,
    "tempsMinutes": 25,
    "motsCles": [
      "haricots blancs",
      "pommes de terre",
      "courgettes"
    ],
    "ingredients": [
      {
        "nom": "haricots blancs cuits",
        "quantite": 220,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "pommes de terre",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "courgettes",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre.",
      "Couper les courgettes.",
      "Faire revenir les courgettes avec l'huile.",
      "Ajouter les haricots blancs et les tomates.",
      "Servir avec les pommes de terre."
    ]
  },
  {
    "id": "plat-dinde-pates-tomates",
    "nom": "Dinde pâtes tomates",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "kcal": 580,
    "proteines": 43,
    "glucides": 68,
    "lipides": 13,
    "tempsMinutes": 20,
    "motsCles": [
      "dinde",
      "pâtes",
      "tomates"
    ],
    "ingredients": [
      {
        "nom": "escalope de dinde",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "pâtes crues",
        "quantite": 80,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "courgettes",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire les pâtes.",
      "Couper la dinde et les courgettes.",
      "Cuire la dinde avec l'huile.",
      "Ajouter les courgettes et les tomates.",
      "Servir avec les pâtes."
    ]
  },
  {
    "id": "plat-salade-riz-poulet-mais",
    "nom": "Salade riz poulet maïs",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 570,
    "proteines": 41,
    "glucides": 65,
    "lipides": 17,
    "tempsMinutes": 20,
    "motsCles": [
      "riz",
      "poulet",
      "maïs"
    ],
    "ingredients": [
      {
        "nom": "riz cru",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "maïs",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomate",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire le riz.",
      "Cuire le poulet.",
      "Couper la tomate.",
      "Mélanger avec le maïs.",
      "Ajouter l'huile d'olive."
    ]
  },
  {
    "id": "plat-oeufs-brouilles-riz-legumes",
    "nom": "Oeufs brouillés riz légumes",
    "type": "plat",
    "categorie": "",
    "gout": "",
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
      "oeuf",
      "lactose"
    ],
    "kcal": 560,
    "proteines": 26,
    "glucides": 66,
    "lipides": 22,
    "tempsMinutes": 20,
    "motsCles": [
      "oeufs",
      "riz",
      "petits pois"
    ],
    "ingredients": [
      {
        "nom": "riz cru",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "oeufs",
        "quantite": 3,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "petits pois",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "carottes",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "crème légère",
        "quantite": 30,
        "unite": "ml",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Cuire le riz.",
      "Cuire les petits pois et carottes.",
      "Battre les oeufs avec la crème.",
      "Cuire les oeufs brouillés.",
      "Servir avec le riz et les légumes."
    ]
  },
  {
    "id": "plat-tofu-haricots-rouges-riz",
    "nom": "Tofu haricots rouges riz",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "soja"
    ],
    "kcal": 590,
    "proteines": 31,
    "glucides": 75,
    "lipides": 19,
    "tempsMinutes": 25,
    "motsCles": [
      "tofu",
      "haricots rouges",
      "riz"
    ],
    "ingredients": [
      {
        "nom": "tofu nature",
        "quantite": 160,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "haricots rouges cuits",
        "quantite": 150,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "riz cru",
        "quantite": 60,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire le riz.",
      "Couper le tofu en dés.",
      "Cuire le tofu avec l'huile.",
      "Ajouter les haricots rouges et les tomates.",
      "Servir avec le riz."
    ]
  },
  {
    "id": "plat-poulet-quinoa-brocolis",
    "nom": "Poulet quinoa brocolis",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [],
    "kcal": 580,
    "proteines": 44,
    "glucides": 55,
    "lipides": 20,
    "tempsMinutes": 25,
    "motsCles": [
      "poulet",
      "quinoa",
      "brocolis"
    ],
    "ingredients": [
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "quinoa cru",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "brocolis",
        "quantite": 220,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "citron",
        "quantite": 0.5,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Cuire le quinoa.",
      "Cuire les brocolis.",
      "Cuire le poulet avec l'huile.",
      "Ajouter le citron.",
      "Servir ensemble."
    ]
  },
  {
    "id": "plat-boeuf-lentilles-tomates",
    "nom": "Boeuf lentilles tomates",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 590,
    "proteines": 43,
    "glucides": 48,
    "lipides": 25,
    "tempsMinutes": 25,
    "motsCles": [
      "boeuf haché",
      "lentilles",
      "tomates"
    ],
    "ingredients": [
      {
        "nom": "boeuf haché 5%",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "lentilles cuites",
        "quantite": 220,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "carottes",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire le boeuf avec l'huile.",
      "Ajouter les carottes.",
      "Ajouter les tomates concassées.",
      "Ajouter les lentilles.",
      "Réchauffer quelques minutes."
    ]
  },
  {
    "id": "plat-cabillaud-quinoa-courgettes",
    "nom": "Cabillaud quinoa courgettes",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson"
    ],
    "kcal": 520,
    "proteines": 37,
    "glucides": 55,
    "lipides": 16,
    "tempsMinutes": 25,
    "motsCles": [
      "cabillaud",
      "quinoa",
      "courgettes"
    ],
    "ingredients": [
      {
        "nom": "filet de cabillaud",
        "quantite": 160,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "quinoa cru",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "courgettes",
        "quantite": 220,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire le quinoa.",
      "Cuire le cabillaud.",
      "Couper les courgettes et tomates.",
      "Faire revenir les légumes avec l'huile.",
      "Servir ensemble."
    ]
  },
  {
    "id": "plat-salade-pommes-de-terre-dinde",
    "nom": "Salade pommes de terre dinde",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 560,
    "proteines": 43,
    "glucides": 48,
    "lipides": 22,
    "tempsMinutes": 25,
    "motsCles": [
      "pommes de terre",
      "dinde",
      "salade"
    ],
    "ingredients": [
      {
        "nom": "pommes de terre",
        "quantite": 240,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "escalope de dinde",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "salade verte",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "concombre",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre.",
      "Cuire la dinde.",
      "Couper le concombre.",
      "Préparer la salade.",
      "Assembler avec l'huile d'olive."
    ]
  },
  {
    "id": "plat-gratin-riz-courgettes-thon",
    "nom": "Gratin riz courgettes thon",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "poisson",
      "lactose"
    ],
    "kcal": 620,
    "proteines": 38,
    "glucides": 60,
    "lipides": 26,
    "tempsMinutes": 35,
    "motsCles": [
      "riz",
      "courgettes",
      "thon"
    ],
    "ingredients": [
      {
        "nom": "riz cru",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "thon au naturel",
        "quantite": 120,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "courgettes",
        "quantite": 220,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "crème légère",
        "quantite": 60,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "emmental",
        "quantite": 30,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Cuire le riz.",
      "Égoutter le thon.",
      "Couper les courgettes.",
      "Mélanger avec la crème.",
      "Ajouter l'emmental et gratiner."
    ]
  },
  {
    "id": "plat-pois-chiches-riz-epinards",
    "nom": "Pois chiches riz épinards",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 550,
    "proteines": 19,
    "glucides": 78,
    "lipides": 17,
    "tempsMinutes": 25,
    "motsCles": [
      "pois chiches",
      "riz",
      "épinards"
    ],
    "ingredients": [
      {
        "nom": "pois chiches cuits",
        "quantite": 180,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "riz cru",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "épinards",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire le riz.",
      "Faire revenir les épinards avec l'huile.",
      "Ajouter les tomates concassées.",
      "Ajouter les pois chiches.",
      "Servir avec le riz."
    ]
  },
  {
    "id": "plat-poulet-carottes-petits-pois-riz",
    "nom": "Poulet carottes petits pois riz",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 570,
    "proteines": 43,
    "glucides": 64,
    "lipides": 14,
    "tempsMinutes": 25,
    "motsCles": [
      "poulet",
      "carottes",
      "petits pois"
    ],
    "ingredients": [
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "riz cru",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "carottes",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "petits pois",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire le riz.",
      "Couper le poulet et les carottes.",
      "Cuire le poulet avec l'huile.",
      "Ajouter les légumes.",
      "Servir avec le riz."
    ]
  },
  {
    "id": "plat-veau-pommes-de-terre-carottes",
    "nom": "Veau pommes de terre carottes",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [],
    "kcal": 590,
    "proteines": 39,
    "glucides": 48,
    "lipides": 26,
    "tempsMinutes": 30,
    "motsCles": [
      "veau",
      "pommes de terre",
      "carottes"
    ],
    "ingredients": [
      {
        "nom": "escalope de veau",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "pommes de terre",
        "quantite": 240,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "carottes",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "oignon",
        "quantite": 0.5,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre et les carottes.",
      "Émincer l'oignon.",
      "Cuire le veau avec l'huile.",
      "Ajouter l'oignon.",
      "Servir avec les légumes."
    ]
  },
  {
    "id": "plat-riz-tofu-legumes",
    "nom": "Riz tofu légumes",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "soja"
    ],
    "kcal": 570,
    "proteines": 29,
    "glucides": 72,
    "lipides": 18,
    "tempsMinutes": 25,
    "motsCles": [
      "tofu",
      "riz",
      "légumes"
    ],
    "ingredients": [
      {
        "nom": "tofu nature",
        "quantite": 160,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "riz cru",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "courgettes",
        "quantite": 160,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "carottes",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire le riz.",
      "Couper le tofu et les légumes.",
      "Faire revenir le tofu avec l'huile.",
      "Ajouter les légumes.",
      "Servir avec le riz."
    ]
  },
  {
    "id": "plat-saumon-pommes-de-terre-salade",
    "nom": "Saumon pommes de terre salade",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson"
    ],
    "kcal": 620,
    "proteines": 38,
    "glucides": 45,
    "lipides": 32,
    "tempsMinutes": 25,
    "motsCles": [
      "saumon",
      "pommes de terre",
      "salade"
    ],
    "ingredients": [
      {
        "nom": "filet de saumon",
        "quantite": 140,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "pommes de terre",
        "quantite": 230,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "salade verte",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "concombre",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "citron",
        "quantite": 0.5,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre.",
      "Cuire le saumon.",
      "Couper le concombre.",
      "Préparer la salade.",
      "Servir avec le citron."
    ]
  },
  {
    "id": "plat-pates-dinde-champignons",
    "nom": "Pâtes dinde champignons",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 620,
    "proteines": 44,
    "glucides": 66,
    "lipides": 20,
    "tempsMinutes": 25,
    "motsCles": [
      "dinde",
      "pâtes",
      "champignons"
    ],
    "ingredients": [
      {
        "nom": "escalope de dinde",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "pâtes crues",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "champignons",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "crème légère",
        "quantite": 50,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire les pâtes.",
      "Couper la dinde et les champignons.",
      "Cuire la dinde avec l'huile.",
      "Ajouter les champignons et la crème.",
      "Servir avec les pâtes."
    ]
  },
  {
    "id": "plat-haricots-rouges-riz-legumes",
    "nom": "Haricots rouges riz légumes",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 540,
    "proteines": 18,
    "glucides": 82,
    "lipides": 14,
    "tempsMinutes": 25,
    "motsCles": [
      "haricots rouges",
      "riz",
      "courgettes"
    ],
    "ingredients": [
      {
        "nom": "haricots rouges cuits",
        "quantite": 200,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "riz cru",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "courgettes",
        "quantite": 160,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire le riz.",
      "Faire revenir les courgettes avec l'huile.",
      "Ajouter les tomates concassées.",
      "Ajouter les haricots rouges.",
      "Servir avec le riz."
    ]
  },
  {
    "id": "plat-poulet-gratin-chou-fleur",
    "nom": "Poulet gratin chou-fleur",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose"
    ],
    "kcal": 570,
    "proteines": 45,
    "glucides": 32,
    "lipides": 28,
    "tempsMinutes": 35,
    "motsCles": [
      "poulet",
      "chou-fleur",
      "emmental"
    ],
    "ingredients": [
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "chou-fleur",
        "quantite": 300,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "pommes de terre",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "crème légère",
        "quantite": 50,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "emmental",
        "quantite": 30,
        "unite": "g",
        "rayon": "Crèmerie"
      }
    ],
    "etapes": [
      "Cuire le chou-fleur et les pommes de terre.",
      "Cuire le poulet en morceaux.",
      "Mettre le tout dans un plat.",
      "Ajouter la crème et l'emmental.",
      "Gratiner au four."
    ]
  },
  {
    "id": "plat-truite-pommes-vapeur-brocolis",
    "nom": "Truite pommes vapeur brocolis",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson"
    ],
    "kcal": 590,
    "proteines": 38,
    "glucides": 45,
    "lipides": 28,
    "tempsMinutes": 25,
    "motsCles": [
      "truite",
      "pommes de terre",
      "brocolis"
    ],
    "ingredients": [
      {
        "nom": "filet de truite",
        "quantite": 140,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "pommes de terre",
        "quantite": 230,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "brocolis",
        "quantite": 220,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      },
      {
        "nom": "citron",
        "quantite": 0.5,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre.",
      "Cuire les brocolis.",
      "Cuire la truite.",
      "Ajouter l'huile et le citron.",
      "Servir ensemble."
    ]
  },
  {
    "id": "plat-boulettes-dinde-riz-tomates",
    "nom": "Boulettes dinde riz tomates",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 580,
    "proteines": 43,
    "glucides": 62,
    "lipides": 16,
    "tempsMinutes": 30,
    "motsCles": [
      "dinde",
      "riz",
      "tomates"
    ],
    "ingredients": [
      {
        "nom": "dinde hachée",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "riz cru",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "carottes",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Former des boulettes avec la dinde.",
      "Cuire le riz.",
      "Cuire les boulettes avec l'huile.",
      "Ajouter les tomates et carottes.",
      "Servir avec le riz."
    ]
  },
  {
    "id": "plat-lentilles-feta-tomates",
    "nom": "Lentilles feta tomates",
    "type": "plat",
    "categorie": "",
    "gout": "",
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
    "kcal": 560,
    "proteines": 25,
    "glucides": 55,
    "lipides": 26,
    "tempsMinutes": 10,
    "motsCles": [
      "lentilles",
      "feta",
      "tomates"
    ],
    "ingredients": [
      {
        "nom": "lentilles cuites",
        "quantite": 240,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "feta",
        "quantite": 60,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "tomates",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "concombre",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Rincer les lentilles.",
      "Couper les tomates et le concombre.",
      "Ajouter la feta.",
      "Ajouter l'huile d'olive.",
      "Mélanger et servir."
    ]
  },
  {
    "id": "plat-dinde-haricots-verts-pommes-de-terre",
    "nom": "Dinde haricots verts pommes de terre",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 540,
    "proteines": 43,
    "glucides": 46,
    "lipides": 18,
    "tempsMinutes": 25,
    "motsCles": [
      "dinde",
      "haricots verts",
      "pommes de terre"
    ],
    "ingredients": [
      {
        "nom": "escalope de dinde",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "haricots verts",
        "quantite": 220,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "pommes de terre",
        "quantite": 220,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomate",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire les pommes de terre.",
      "Cuire les haricots verts.",
      "Cuire la dinde avec l'huile.",
      "Couper la tomate.",
      "Servir ensemble."
    ]
  },
  {
    "id": "plat-riz-pois-casses-legumes",
    "nom": "Riz pois cassés légumes",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "francaise"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 540,
    "proteines": 21,
    "glucides": 82,
    "lipides": 13,
    "tempsMinutes": 30,
    "motsCles": [
      "pois cassés",
      "riz",
      "carottes"
    ],
    "ingredients": [
      {
        "nom": "pois cassés cuits",
        "quantite": 220,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "riz cru",
        "quantite": 60,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "carottes",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "courgettes",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Cuire le riz.",
      "Réchauffer les pois cassés.",
      "Couper les légumes.",
      "Faire revenir les légumes avec l'huile.",
      "Assembler et servir."
    ]
  },
  {
    "id": "plat-poulet-riz-brocoli",
    "nom": "Poulet riz brocoli",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "soja"
    ],
    "kcal": 585,
    "proteines": 43,
    "glucides": 68,
    "lipides": 16,
    "tempsMinutes": 25,
    "motsCles": [
      "poulet",
      "riz",
      "brocoli",
      "tamari",
      "huile de colza"
    ],
    "ingredients": [
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "riz",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "brocoli",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tamari",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "huile de colza",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "ail",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Coupe le poulet en morceaux.",
      "Fais revenir l'ail et le poulet avec l'huile.",
      "Ajoute le brocoli en petits bouquets.",
      "Verse le tamari et sers avec le riz."
    ]
  },
  {
    "id": "plat-boeuf-riz-poivrons",
    "nom": "Boeuf riz poivrons",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "soja"
    ],
    "kcal": 620,
    "proteines": 39,
    "glucides": 70,
    "lipides": 21,
    "tempsMinutes": 25,
    "motsCles": [
      "boeuf",
      "riz",
      "poivron",
      "carotte",
      "tamari"
    ],
    "ingredients": [
      {
        "nom": "boeuf émincé",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "riz",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "poivron",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "carotte",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tamari",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "huile de colza",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Coupe le poivron et la carotte.",
      "Fais revenir le boeuf avec l'huile.",
      "Ajoute les légumes et laisse cuire.",
      "Ajoute le tamari et sers avec le riz."
    ]
  },
  {
    "id": "plat-crevettes-nouilles-riz",
    "nom": "Crevettes nouilles riz",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "crustaces",
      "soja"
    ],
    "kcal": 570,
    "proteines": 36,
    "glucides": 76,
    "lipides": 14,
    "tempsMinutes": 20,
    "motsCles": [
      "crevettes",
      "nouilles de riz",
      "courgette",
      "carotte",
      "tamari"
    ],
    "ingredients": [
      {
        "nom": "crevettes",
        "quantite": 150,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "nouilles de riz",
        "quantite": 80,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "courgette",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "carotte",
        "quantite": 90,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tamari",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "huile de colza",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire les nouilles de riz.",
      "Coupe la courgette et la carotte.",
      "Fais revenir les légumes avec l'huile.",
      "Ajoute les crevettes.",
      "Mélange avec les nouilles et le tamari."
    ]
  },
  {
    "id": "plat-saumon-riz-concombre",
    "nom": "Saumon riz concombre",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson",
      "soja",
      "sesame"
    ],
    "kcal": 635,
    "proteines": 36,
    "glucides": 62,
    "lipides": 28,
    "tempsMinutes": 20,
    "motsCles": [
      "saumon",
      "riz",
      "concombre",
      "tamari",
      "graines de sésame"
    ],
    "ingredients": [
      {
        "nom": "saumon",
        "quantite": 130,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "riz",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "concombre",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tamari",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "graines de sésame",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      },
      {
        "nom": "jus de citron",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Fais cuire le saumon à la poêle.",
      "Coupe le concombre en dés.",
      "Mélange le tamari avec le citron.",
      "Sers le riz avec le saumon, le concombre et le sésame."
    ]
  },
  {
    "id": "plat-dinde-nouilles-legumes",
    "nom": "Dinde nouilles légumes",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "soja"
    ],
    "kcal": 590,
    "proteines": 43,
    "glucides": 74,
    "lipides": 14,
    "tempsMinutes": 25,
    "motsCles": [
      "dinde",
      "nouilles de riz",
      "brocoli",
      "poivron",
      "tamari"
    ],
    "ingredients": [
      {
        "nom": "escalope de dinde",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "nouilles de riz",
        "quantite": 80,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "brocoli",
        "quantite": 140,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "poivron",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tamari",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "huile de colza",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire les nouilles de riz.",
      "Coupe la dinde et les légumes.",
      "Fais revenir la dinde avec l'huile.",
      "Ajoute les légumes.",
      "Mélange avec les nouilles et le tamari."
    ]
  },
  {
    "id": "plat-riz-saute-tofu-edamame",
    "nom": "Riz sauté tofu edamame",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "soja"
    ],
    "kcal": 610,
    "proteines": 32,
    "glucides": 72,
    "lipides": 21,
    "tempsMinutes": 20,
    "motsCles": [
      "riz",
      "tofu ferme",
      "edamame",
      "carotte",
      "tamari"
    ],
    "ingredients": [
      {
        "nom": "riz cuit",
        "quantite": 200,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tofu ferme",
        "quantite": 150,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "edamame",
        "quantite": 90,
        "unite": "g",
        "rayon": "Surgelés"
      },
      {
        "nom": "carotte",
        "quantite": 90,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tamari",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "huile de colza",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Coupe le tofu en dés.",
      "Fais dorer le tofu avec l'huile.",
      "Ajoute la carotte râpée et les edamame.",
      "Ajoute le riz cuit.",
      "Verse le tamari et mélange."
    ]
  },
  {
    "id": "plat-wok-tofu-brocoli",
    "nom": "Wok tofu brocoli",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "soja",
      "sesame"
    ],
    "kcal": 575,
    "proteines": 31,
    "glucides": 59,
    "lipides": 24,
    "tempsMinutes": 25,
    "motsCles": [
      "tofu ferme",
      "riz",
      "brocoli",
      "tamari",
      "graines de sésame"
    ],
    "ingredients": [
      {
        "nom": "tofu ferme",
        "quantite": 170,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "brocoli",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tamari",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "graines de sésame",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "huile de colza",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Coupe le tofu en cubes.",
      "Fais dorer le tofu avec l'huile.",
      "Ajoute le brocoli en petits bouquets.",
      "Ajoute le tamari et les graines de sésame."
    ]
  },
  {
    "id": "plat-nouilles-tofu-cacahuete",
    "nom": "Nouilles tofu cacahuète",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "soja",
      "arachide"
    ],
    "kcal": 645,
    "proteines": 31,
    "glucides": 70,
    "lipides": 28,
    "tempsMinutes": 20,
    "motsCles": [
      "nouilles de riz",
      "tofu ferme",
      "beurre de cacahuète",
      "tamari",
      "carotte"
    ],
    "ingredients": [
      {
        "nom": "nouilles de riz",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tofu ferme",
        "quantite": 160,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "carotte",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "beurre de cacahuète",
        "quantite": 20,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tamari",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "jus de citron",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Fais cuire les nouilles de riz.",
      "Fais dorer le tofu en dés.",
      "Ajoute la carotte râpée.",
      "Mélange le beurre de cacahuète avec le tamari et le citron.",
      "Mélange les nouilles avec le tofu et la sauce."
    ]
  },
  {
    "id": "plat-tofu-coco-riz",
    "nom": "Tofu coco riz",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "soja"
    ],
    "kcal": 625,
    "proteines": 30,
    "glucides": 66,
    "lipides": 27,
    "tempsMinutes": 25,
    "motsCles": [
      "tofu ferme",
      "lait de coco",
      "riz",
      "courgette",
      "curry"
    ],
    "ingredients": [
      {
        "nom": "tofu ferme",
        "quantite": 180,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "riz",
        "quantite": 65,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "lait de coco",
        "quantite": 100,
        "unite": "ml",
        "rayon": "Épicerie"
      },
      {
        "nom": "courgette",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "épinards",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "curry",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Coupe le tofu et la courgette.",
      "Fais revenir le tofu à la poêle.",
      "Ajoute la courgette, les épinards, le lait de coco et le curry.",
      "Laisse mijoter et sers avec le riz."
    ]
  },
  {
    "id": "plat-oeufs-riz-legumes",
    "nom": "Oeufs riz légumes",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "oeuf",
      "soja"
    ],
    "kcal": 560,
    "proteines": 27,
    "glucides": 68,
    "lipides": 20,
    "tempsMinutes": 20,
    "motsCles": [
      "oeufs",
      "riz",
      "petits pois",
      "carotte",
      "tamari"
    ],
    "ingredients": [
      {
        "nom": "oeufs",
        "quantite": 3,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "riz cuit",
        "quantite": 200,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "petits pois",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "carotte",
        "quantite": 90,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tamari",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "huile de colza",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Bats les oeufs dans un bol.",
      "Fais revenir la carotte et les petits pois avec l'huile.",
      "Ajoute le riz cuit.",
      "Verse les oeufs et mélange jusqu'à cuisson.",
      "Ajoute le tamari avant de servir."
    ]
  },
  {
    "id": "plat-poulet-nouilles-soja",
    "nom": "Poulet nouilles soja",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "soja"
    ],
    "kcal": 610,
    "proteines": 43,
    "glucides": 76,
    "lipides": 15,
    "tempsMinutes": 25,
    "motsCles": [
      "poulet",
      "nouilles de blé",
      "sauce soja",
      "carotte",
      "brocoli"
    ],
    "ingredients": [
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "nouilles de blé",
        "quantite": 80,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "brocoli",
        "quantite": 140,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "carotte",
        "quantite": 90,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "sauce soja",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "huile de colza",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire les nouilles de blé.",
      "Coupe le poulet et les légumes.",
      "Fais revenir le poulet avec l'huile.",
      "Ajoute le brocoli et la carotte.",
      "Mélange avec les nouilles et la sauce soja."
    ]
  },
  {
    "id": "plat-cabillaud-riz-coco",
    "nom": "Cabillaud riz coco",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson"
    ],
    "kcal": 575,
    "proteines": 38,
    "glucides": 66,
    "lipides": 18,
    "tempsMinutes": 25,
    "motsCles": [
      "cabillaud",
      "riz",
      "lait de coco",
      "épinards",
      "curry"
    ],
    "ingredients": [
      {
        "nom": "cabillaud",
        "quantite": 170,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "riz",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "lait de coco",
        "quantite": 80,
        "unite": "ml",
        "rayon": "Épicerie"
      },
      {
        "nom": "épinards",
        "quantite": 140,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "curry",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      },
      {
        "nom": "jus de citron",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Chauffe le lait de coco avec le curry.",
      "Ajoute les épinards.",
      "Ajoute le cabillaud en morceaux et laisse cuire.",
      "Termine avec le citron et sers avec le riz."
    ]
  },
  {
    "id": "plat-boeuf-nouilles-riz",
    "nom": "Boeuf nouilles riz",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "soja",
      "sesame"
    ],
    "kcal": 640,
    "proteines": 38,
    "glucides": 78,
    "lipides": 20,
    "tempsMinutes": 20,
    "motsCles": [
      "boeuf",
      "nouilles de riz",
      "courgette",
      "tamari",
      "graines de sésame"
    ],
    "ingredients": [
      {
        "nom": "boeuf émincé",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "nouilles de riz",
        "quantite": 85,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "courgette",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tamari",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "graines de sésame",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "huile de colza",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire les nouilles de riz.",
      "Coupe la courgette en bâtonnets.",
      "Fais revenir le boeuf avec l'huile.",
      "Ajoute la courgette et le tamari.",
      "Mélange avec les nouilles et le sésame."
    ]
  },
  {
    "id": "plat-dinde-riz-edamame",
    "nom": "Dinde riz edamame",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "soja"
    ],
    "kcal": 600,
    "proteines": 45,
    "glucides": 67,
    "lipides": 16,
    "tempsMinutes": 20,
    "motsCles": [
      "dinde",
      "riz",
      "edamame",
      "carotte",
      "tamari"
    ],
    "ingredients": [
      {
        "nom": "escalope de dinde",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "riz",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "edamame",
        "quantite": 80,
        "unite": "g",
        "rayon": "Surgelés"
      },
      {
        "nom": "carotte",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tamari",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "huile de colza",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Coupe la dinde en morceaux.",
      "Fais revenir la dinde avec l'huile.",
      "Ajoute la carotte et les edamame.",
      "Ajoute le tamari et sers avec le riz."
    ]
  },
  {
    "id": "plat-tempeh-riz-legumes",
    "nom": "Tempeh riz légumes",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "soja"
    ],
    "kcal": 620,
    "proteines": 34,
    "glucides": 70,
    "lipides": 23,
    "tempsMinutes": 25,
    "motsCles": [
      "tempeh",
      "riz",
      "brocoli",
      "poivron",
      "tamari"
    ],
    "ingredients": [
      {
        "nom": "tempeh",
        "quantite": 150,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "riz",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "brocoli",
        "quantite": 140,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "poivron",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tamari",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "huile de colza",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Coupe le tempeh en dés.",
      "Fais dorer le tempeh avec l'huile.",
      "Ajoute le brocoli et le poivron.",
      "Verse le tamari et sers avec le riz."
    ]
  },
  {
    "id": "plat-riz-tofu-ananas",
    "nom": "Riz tofu ananas",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "asiatique"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "soja"
    ],
    "kcal": 590,
    "proteines": 29,
    "glucides": 79,
    "lipides": 18,
    "tempsMinutes": 20,
    "motsCles": [
      "riz",
      "tofu ferme",
      "ananas",
      "poivron",
      "tamari"
    ],
    "ingredients": [
      {
        "nom": "riz cuit",
        "quantite": 210,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tofu ferme",
        "quantite": 170,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "ananas",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "poivron",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tamari",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "huile de colza",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Coupe le tofu, l'ananas et le poivron.",
      "Fais dorer le tofu avec l'huile.",
      "Ajoute le poivron.",
      "Ajoute le riz cuit et l'ananas.",
      "Verse le tamari et mélange."
    ]
  },
  {
    "id": "plat-poulet-citron-riz",
    "nom": "Poulet citron riz",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 585,
    "proteines": 43,
    "glucides": 66,
    "lipides": 17,
    "tempsMinutes": 25,
    "motsCles": [
      "poulet",
      "riz",
      "courgette",
      "citron",
      "huile d'olive"
    ],
    "ingredients": [
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "riz",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "courgette",
        "quantite": 160,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "jus de citron",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "herbes de Provence",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Coupe le poulet et la courgette.",
      "Fais revenir le poulet avec l'huile d'olive.",
      "Ajoute la courgette et les herbes.",
      "Termine avec le jus de citron et sers avec le riz."
    ]
  },
  {
    "id": "plat-poulet-ratatouille-riz",
    "nom": "Poulet ratatouille riz",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 610,
    "proteines": 44,
    "glucides": 68,
    "lipides": 18,
    "tempsMinutes": 30,
    "motsCles": [
      "poulet",
      "riz",
      "ratatouille",
      "tomate",
      "aubergine"
    ],
    "ingredients": [
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "riz",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "aubergine",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "courgette",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 160,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Coupe le poulet et les légumes.",
      "Fais dorer le poulet avec l'huile.",
      "Ajoute les légumes et les tomates concassées.",
      "Laisse mijoter et sers avec le riz."
    ]
  },
  {
    "id": "plat-dinde-pois-chiches-tomate",
    "nom": "Dinde pois chiches tomate",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 570,
    "proteines": 45,
    "glucides": 52,
    "lipides": 18,
    "tempsMinutes": 25,
    "motsCles": [
      "dinde",
      "pois chiches",
      "tomate",
      "poivron",
      "huile d'olive"
    ],
    "ingredients": [
      {
        "nom": "escalope de dinde",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "pois chiches cuits",
        "quantite": 160,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 160,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "poivron",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "paprika",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Coupe la dinde et le poivron.",
      "Fais revenir la dinde avec l'huile.",
      "Ajoute le poivron et le paprika.",
      "Ajoute les pois chiches et la tomate.",
      "Laisse mijoter quelques minutes."
    ]
  },
  {
    "id": "plat-boulettes-boeuf-riz",
    "nom": "Boulettes boeuf riz",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "oeuf"
    ],
    "kcal": 630,
    "proteines": 40,
    "glucides": 66,
    "lipides": 22,
    "tempsMinutes": 30,
    "motsCles": [
      "boeuf haché",
      "riz",
      "oeuf",
      "tomate",
      "courgette"
    ],
    "ingredients": [
      {
        "nom": "boeuf haché 5%",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "riz",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "oeuf",
        "quantite": 0.5,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 170,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "courgette",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Mélange le boeuf avec l'oeuf.",
      "Forme des boulettes.",
      "Fais cuire les boulettes avec la tomate et la courgette.",
      "Sers avec le riz."
    ]
  },
  {
    "id": "plat-kefta-boeuf-semoule",
    "nom": "Kefta boeuf semoule",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "gluten"
    ],
    "kcal": 640,
    "proteines": 39,
    "glucides": 72,
    "lipides": 21,
    "tempsMinutes": 25,
    "motsCles": [
      "boeuf haché",
      "semoule",
      "tomate",
      "concombre",
      "menthe"
    ],
    "ingredients": [
      {
        "nom": "boeuf haché 5%",
        "quantite": 140,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "semoule",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "concombre",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "menthe",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Prépare la semoule avec de l'eau chaude.",
      "Forme des petites keftas avec le boeuf.",
      "Fais cuire les keftas à la poêle.",
      "Coupe la tomate et le concombre.",
      "Sers avec la semoule et les légumes."
    ]
  },
  {
    "id": "plat-poulet-boulgour-legumes",
    "nom": "Poulet boulgour légumes",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "kcal": 600,
    "proteines": 43,
    "glucides": 67,
    "lipides": 17,
    "tempsMinutes": 25,
    "motsCles": [
      "poulet",
      "boulgour",
      "poivron",
      "courgette",
      "citron"
    ],
    "ingredients": [
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "boulgour",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "poivron",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "courgette",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "jus de citron",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le boulgour.",
      "Coupe le poulet et les légumes.",
      "Fais revenir le poulet avec l'huile.",
      "Ajoute les légumes.",
      "Ajoute le citron et sers avec le boulgour."
    ]
  },
  {
    "id": "plat-agneau-riz-aubergine",
    "nom": "Agneau riz aubergine",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [],
    "kcal": 645,
    "proteines": 35,
    "glucides": 64,
    "lipides": 27,
    "tempsMinutes": 30,
    "motsCles": [
      "agneau",
      "riz",
      "aubergine",
      "tomate",
      "huile d'olive"
    ],
    "ingredients": [
      {
        "nom": "agneau haché",
        "quantite": 120,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "riz",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "aubergine",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 160,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "oignon",
        "quantite": 50,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Fais revenir l'oignon et l'agneau.",
      "Ajoute l'aubergine en dés.",
      "Verse les tomates concassées.",
      "Laisse mijoter et sers avec le riz."
    ]
  },
  {
    "id": "plat-saumon-pois-chiches",
    "nom": "Saumon pois chiches",
    "type": "plat",
    "categorie": "",
    "gout": "",
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
    "kcal": 640,
    "proteines": 39,
    "glucides": 45,
    "lipides": 34,
    "tempsMinutes": 25,
    "motsCles": [
      "saumon",
      "pois chiches",
      "épinards",
      "citron",
      "tomate"
    ],
    "ingredients": [
      {
        "nom": "saumon",
        "quantite": 130,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "pois chiches cuits",
        "quantite": 150,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "épinards",
        "quantite": 140,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates cerises",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "jus de citron",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le saumon à la poêle.",
      "Fais revenir les pois chiches.",
      "Ajoute les épinards et les tomates.",
      "Verse le jus de citron.",
      "Sers avec le saumon."
    ]
  },
  {
    "id": "plat-cabillaud-pommes-olives",
    "nom": "Cabillaud pommes olives",
    "type": "plat",
    "categorie": "",
    "gout": "",
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
    "kcal": 520,
    "proteines": 40,
    "glucides": 55,
    "lipides": 16,
    "tempsMinutes": 25,
    "motsCles": [
      "cabillaud",
      "pommes de terre",
      "olives",
      "tomate",
      "haricots verts"
    ],
    "ingredients": [
      {
        "nom": "cabillaud",
        "quantite": 170,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "pommes de terre",
        "quantite": 220,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "haricots verts",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 140,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "olives noires",
        "quantite": 25,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire les pommes de terre.",
      "Fais cuire les haricots verts.",
      "Chauffe la tomate avec les olives.",
      "Fais cuire le cabillaud à la poêle.",
      "Sers avec les pommes de terre et les légumes."
    ]
  },
  {
    "id": "plat-thon-patate-salade",
    "nom": "Thon patate salade",
    "type": "plat",
    "categorie": "",
    "gout": "",
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
    "kcal": 560,
    "proteines": 37,
    "glucides": 62,
    "lipides": 18,
    "tempsMinutes": 20,
    "motsCles": [
      "thon",
      "pommes de terre",
      "tomate",
      "concombre",
      "huile d'olive"
    ],
    "ingredients": [
      {
        "nom": "thon au naturel",
        "quantite": 130,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "pommes de terre",
        "quantite": 250,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomate",
        "quantite": 130,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "concombre",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "olives noires",
        "quantite": 20,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire les pommes de terre.",
      "Égoutte le thon.",
      "Coupe la tomate et le concombre.",
      "Mélange avec les pommes de terre.",
      "Ajoute le thon, les olives et l'huile."
    ]
  },
  {
    "id": "plat-crevettes-riz-courgettes",
    "nom": "Crevettes riz courgettes",
    "type": "plat",
    "categorie": "",
    "gout": "",
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
    "kcal": 555,
    "proteines": 36,
    "glucides": 68,
    "lipides": 15,
    "tempsMinutes": 20,
    "motsCles": [
      "crevettes",
      "riz",
      "courgette",
      "citron",
      "ail"
    ],
    "ingredients": [
      {
        "nom": "crevettes",
        "quantite": 150,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "riz",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "courgette",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "ail",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "jus de citron",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Coupe la courgette en dés.",
      "Fais revenir l'ail et la courgette.",
      "Ajoute les crevettes.",
      "Ajoute le citron et sers avec le riz."
    ]
  },
  {
    "id": "plat-sardines-riz-tomate",
    "nom": "Sardines riz tomate",
    "type": "plat",
    "categorie": "",
    "gout": "",
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
    "kcal": 590,
    "proteines": 35,
    "glucides": 65,
    "lipides": 21,
    "tempsMinutes": 20,
    "motsCles": [
      "sardines",
      "riz",
      "tomate",
      "poivron",
      "citron"
    ],
    "ingredients": [
      {
        "nom": "sardines au naturel",
        "quantite": 120,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "riz",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomate",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "poivron",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "jus de citron",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Coupe la tomate et le poivron.",
      "Égoutte les sardines.",
      "Mélange le riz avec les légumes.",
      "Ajoute les sardines, le citron et l'huile."
    ]
  },
  {
    "id": "plat-merlu-lentilles-tomate",
    "nom": "Merlu lentilles tomate",
    "type": "plat",
    "categorie": "",
    "gout": "",
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
    "kcal": 525,
    "proteines": 43,
    "glucides": 46,
    "lipides": 16,
    "tempsMinutes": 25,
    "motsCles": [
      "merlu",
      "lentilles",
      "tomate",
      "épinards",
      "huile d'olive"
    ],
    "ingredients": [
      {
        "nom": "merlu",
        "quantite": 170,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "lentilles cuites",
        "quantite": 180,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 160,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "épinards",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "ail",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Fais revenir l'ail avec l'huile.",
      "Ajoute les lentilles et la tomate.",
      "Ajoute les épinards.",
      "Fais cuire le merlu à la poêle.",
      "Sers le poisson avec les lentilles."
    ]
  },
  {
    "id": "plat-shakshuka-pois-chiches",
    "nom": "Shakshuka pois chiches",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "oeuf"
    ],
    "kcal": 520,
    "proteines": 28,
    "glucides": 54,
    "lipides": 22,
    "tempsMinutes": 25,
    "motsCles": [
      "oeufs",
      "pois chiches",
      "tomate",
      "poivron",
      "paprika"
    ],
    "ingredients": [
      {
        "nom": "oeufs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "pois chiches cuits",
        "quantite": 170,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "poivron",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "paprika",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais revenir le poivron avec l'huile.",
      "Ajoute la tomate et les pois chiches.",
      "Assaisonne avec le paprika.",
      "Casse les oeufs dans la sauce.",
      "Couvre jusqu'à cuisson des oeufs."
    ]
  },
  {
    "id": "plat-omelette-feta-courgette",
    "nom": "Omelette feta courgette",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "oeuf",
      "lactose"
    ],
    "kcal": 540,
    "proteines": 31,
    "glucides": 40,
    "lipides": 30,
    "tempsMinutes": 20,
    "motsCles": [
      "oeufs",
      "feta",
      "courgette",
      "pommes de terre",
      "huile d'olive"
    ],
    "ingredients": [
      {
        "nom": "oeufs",
        "quantite": 3,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "feta",
        "quantite": 50,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "courgette",
        "quantite": 160,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "pommes de terre",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      },
      {
        "nom": "persil",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Fais cuire les pommes de terre en dés.",
      "Fais revenir la courgette.",
      "Bats les oeufs avec la feta.",
      "Verse dans la poêle avec les légumes.",
      "Cuis à feu doux et ajoute le persil."
    ]
  },
  {
    "id": "plat-salade-lentilles-feta",
    "nom": "Salade lentilles feta",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "oeuf",
      "lactose"
    ],
    "kcal": 560,
    "proteines": 31,
    "glucides": 54,
    "lipides": 24,
    "tempsMinutes": 15,
    "motsCles": [
      "lentilles",
      "feta",
      "oeuf",
      "tomate",
      "concombre"
    ],
    "ingredients": [
      {
        "nom": "lentilles cuites",
        "quantite": 220,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "oeuf",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "feta",
        "quantite": 50,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "tomate",
        "quantite": 130,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "concombre",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire l'oeuf.",
      "Rince les lentilles.",
      "Coupe la tomate et le concombre.",
      "Mélange les lentilles avec les légumes.",
      "Ajoute l'oeuf, la feta et l'huile."
    ]
  },
  {
    "id": "plat-quinoa-feta-pois-chiches",
    "nom": "Quinoa feta pois chiches",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose"
    ],
    "kcal": 610,
    "proteines": 28,
    "glucides": 72,
    "lipides": 24,
    "tempsMinutes": 20,
    "motsCles": [
      "quinoa",
      "feta",
      "pois chiches",
      "tomates cerises",
      "concombre"
    ],
    "ingredients": [
      {
        "nom": "quinoa",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "pois chiches cuits",
        "quantite": 150,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "feta",
        "quantite": 50,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "tomates cerises",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "concombre",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le quinoa.",
      "Rince les pois chiches.",
      "Coupe les tomates et le concombre.",
      "Mélange le quinoa avec les légumes.",
      "Ajoute la feta et l'huile d'olive."
    ]
  },
  {
    "id": "plat-riz-halloumi-legumes",
    "nom": "Riz halloumi légumes",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose"
    ],
    "kcal": 640,
    "proteines": 27,
    "glucides": 65,
    "lipides": 30,
    "tempsMinutes": 25,
    "motsCles": [
      "riz",
      "halloumi",
      "courgette",
      "poivron",
      "tomate"
    ],
    "ingredients": [
      {
        "nom": "riz",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "halloumi",
        "quantite": 80,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "courgette",
        "quantite": 140,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "poivron",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Coupe les légumes.",
      "Fais revenir les légumes avec l'huile.",
      "Fais dorer le halloumi en tranches.",
      "Sers le riz avec les légumes et le halloumi."
    ]
  },
  {
    "id": "plat-aubergine-lentilles-feta",
    "nom": "Aubergine lentilles feta",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
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
    "kcal": 555,
    "proteines": 27,
    "glucides": 55,
    "lipides": 25,
    "tempsMinutes": 30,
    "motsCles": [
      "aubergine",
      "lentilles",
      "feta",
      "tomate",
      "huile d'olive"
    ],
    "ingredients": [
      {
        "nom": "aubergine",
        "quantite": 220,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "lentilles cuites",
        "quantite": 210,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "feta",
        "quantite": 50,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 160,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "persil",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Coupe l'aubergine en dés.",
      "Fais revenir l'aubergine avec l'huile.",
      "Ajoute les lentilles et la tomate.",
      "Laisse mijoter quelques minutes.",
      "Ajoute la feta et le persil."
    ]
  },
  {
    "id": "plat-wrap-falafel-feta",
    "nom": "Wrap falafel feta",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "gluten",
      "lactose",
      "sesame"
    ],
    "kcal": 620,
    "proteines": 26,
    "glucides": 76,
    "lipides": 24,
    "tempsMinutes": 20,
    "motsCles": [
      "wrap",
      "falafels",
      "feta",
      "tahini",
      "crudités"
    ],
    "ingredients": [
      {
        "nom": "wrap de blé",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Boulangerie"
      },
      {
        "nom": "falafels",
        "quantite": 120,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "feta",
        "quantite": 40,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "tomate",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "concombre",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tahini",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Réchauffe les falafels.",
      "Coupe la tomate et le concombre.",
      "Garnis le wrap avec les crudités.",
      "Ajoute les falafels et la feta.",
      "Ajoute le tahini et roule le wrap."
    ]
  },
  {
    "id": "plat-falafels-riz-salade",
    "nom": "Falafels riz salade",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "sesame"
    ],
    "kcal": 590,
    "proteines": 25,
    "glucides": 78,
    "lipides": 20,
    "tempsMinutes": 25,
    "motsCles": [
      "falafels",
      "riz",
      "tomate",
      "concombre",
      "tahini"
    ],
    "ingredients": [
      {
        "nom": "falafels sans gluten",
        "quantite": 130,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "riz",
        "quantite": 65,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "concombre",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tahini",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "jus de citron",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Réchauffe les falafels.",
      "Coupe la tomate et le concombre.",
      "Mélange le tahini avec le citron.",
      "Sers le tout avec la sauce."
    ]
  },
  {
    "id": "plat-pois-chiches-quinoa",
    "nom": "Pois chiches quinoa",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [],
    "kcal": 575,
    "proteines": 25,
    "glucides": 82,
    "lipides": 17,
    "tempsMinutes": 20,
    "motsCles": [
      "pois chiches",
      "quinoa",
      "courgette",
      "tomates cerises",
      "citron"
    ],
    "ingredients": [
      {
        "nom": "quinoa",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "pois chiches cuits",
        "quantite": 190,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "courgette",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates cerises",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "jus de citron",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le quinoa.",
      "Fais revenir la courgette en dés.",
      "Ajoute les pois chiches.",
      "Ajoute les tomates cerises.",
      "Mélange avec le quinoa, le citron et l'huile."
    ]
  },
  {
    "id": "plat-lentilles-riz-legumes",
    "nom": "Lentilles riz légumes",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 545,
    "proteines": 25,
    "glucides": 87,
    "lipides": 11,
    "tempsMinutes": 25,
    "motsCles": [
      "lentilles",
      "riz",
      "carotte",
      "tomate",
      "épinards"
    ],
    "ingredients": [
      {
        "nom": "lentilles cuites",
        "quantite": 220,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "riz",
        "quantite": 55,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "carotte",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "épinards",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Fais revenir la carotte avec l'huile.",
      "Ajoute les lentilles et la tomate.",
      "Ajoute les épinards.",
      "Sers avec le riz."
    ]
  },
  {
    "id": "plat-haricots-blancs-tomate",
    "nom": "Haricots blancs tomate",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 520,
    "proteines": 27,
    "glucides": 76,
    "lipides": 12,
    "tempsMinutes": 20,
    "motsCles": [
      "haricots blancs",
      "tomate",
      "épinards",
      "pommes de terre",
      "huile d'olive"
    ],
    "ingredients": [
      {
        "nom": "haricots blancs cuits",
        "quantite": 240,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "pommes de terre",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 170,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "épinards",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "ail",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Fais cuire les pommes de terre.",
      "Fais revenir l'ail avec l'huile.",
      "Ajoute les haricots blancs et la tomate.",
      "Ajoute les épinards.",
      "Sers avec les pommes de terre."
    ]
  },
  {
    "id": "plat-pois-chiches-aubergine",
    "nom": "Pois chiches aubergine",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 550,
    "proteines": 25,
    "glucides": 70,
    "lipides": 19,
    "tempsMinutes": 25,
    "motsCles": [
      "pois chiches",
      "aubergine",
      "riz",
      "tomate",
      "paprika"
    ],
    "ingredients": [
      {
        "nom": "pois chiches cuits",
        "quantite": 200,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "aubergine",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "riz",
        "quantite": 50,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 160,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "paprika",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Coupe l'aubergine en dés.",
      "Fais revenir l'aubergine avec l'huile.",
      "Ajoute les pois chiches, la tomate et le paprika.",
      "Sers avec le riz."
    ]
  },
  {
    "id": "plat-ragout-lentilles-courgette",
    "nom": "Ragoût lentilles courgette",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 500,
    "proteines": 25,
    "glucides": 72,
    "lipides": 12,
    "tempsMinutes": 25,
    "motsCles": [
      "lentilles",
      "courgette",
      "patate douce",
      "tomate",
      "huile d'olive"
    ],
    "ingredients": [
      {
        "nom": "lentilles cuites",
        "quantite": 240,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "courgette",
        "quantite": 160,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "patate douce",
        "quantite": 130,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 160,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      },
      {
        "nom": "cumin",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Coupe la courgette et la patate douce.",
      "Fais revenir les légumes avec l'huile.",
      "Ajoute les lentilles et la tomate.",
      "Assaisonne avec le cumin.",
      "Laisse mijoter jusqu'à cuisson tendre."
    ]
  },
  {
    "id": "plat-taboule-quinoa-pois-chiches",
    "nom": "Taboulé quinoa pois chiches",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [],
    "kcal": 560,
    "proteines": 25,
    "glucides": 80,
    "lipides": 17,
    "tempsMinutes": 20,
    "motsCles": [
      "quinoa",
      "pois chiches",
      "tomate",
      "concombre",
      "menthe"
    ],
    "ingredients": [
      {
        "nom": "quinoa",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "pois chiches cuits",
        "quantite": 180,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomate",
        "quantite": 130,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "concombre",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "menthe",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Fais cuire le quinoa.",
      "Rince les pois chiches.",
      "Coupe la tomate et le concombre.",
      "Mélange tous les ingrédients.",
      "Ajoute l'huile et la menthe."
    ]
  },
  {
    "id": "plat-boulgour-lentilles-tomate",
    "nom": "Boulgour lentilles tomate",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "kcal": 570,
    "proteines": 26,
    "glucides": 89,
    "lipides": 13,
    "tempsMinutes": 25,
    "motsCles": [
      "boulgour",
      "lentilles",
      "tomate",
      "poivron",
      "persil"
    ],
    "ingredients": [
      {
        "nom": "boulgour",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "lentilles cuites",
        "quantite": 190,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 160,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "poivron",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "persil",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Fais cuire le boulgour.",
      "Fais revenir le poivron avec l'huile.",
      "Ajoute les lentilles et la tomate.",
      "Laisse mijoter quelques minutes.",
      "Sers avec le boulgour et le persil."
    ]
  },
  {
    "id": "plat-couscous-pois-chiches",
    "nom": "Couscous pois chiches",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "kcal": 590,
    "proteines": 25,
    "glucides": 93,
    "lipides": 14,
    "tempsMinutes": 25,
    "motsCles": [
      "semoule",
      "pois chiches",
      "carotte",
      "courgette",
      "tomate"
    ],
    "ingredients": [
      {
        "nom": "semoule",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "pois chiches cuits",
        "quantite": 190,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "carotte",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "courgette",
        "quantite": 130,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Prépare la semoule avec de l'eau chaude.",
      "Coupe la carotte et la courgette.",
      "Fais mijoter les légumes avec la tomate.",
      "Ajoute les pois chiches.",
      "Sers avec la semoule."
    ]
  },
  {
    "id": "plat-riz-pois-chiches-epinards",
    "nom": "Riz pois chiches épinards",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 540,
    "proteines": 25,
    "glucides": 82,
    "lipides": 13,
    "tempsMinutes": 20,
    "motsCles": [
      "riz",
      "pois chiches",
      "épinards",
      "tomate",
      "ail"
    ],
    "ingredients": [
      {
        "nom": "riz",
        "quantite": 65,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "pois chiches cuits",
        "quantite": 200,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "épinards",
        "quantite": 140,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 140,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      },
      {
        "nom": "ail",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Fais revenir l'ail avec l'huile.",
      "Ajoute les pois chiches et la tomate.",
      "Ajoute les épinards.",
      "Sers avec le riz."
    ]
  },
  {
    "id": "plat-patates-pois-chiches",
    "nom": "Patates pois chiches",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 560,
    "proteines": 25,
    "glucides": 80,
    "lipides": 17,
    "tempsMinutes": 25,
    "motsCles": [
      "pommes de terre",
      "pois chiches",
      "poivron",
      "tomate",
      "huile d'olive"
    ],
    "ingredients": [
      {
        "nom": "pommes de terre",
        "quantite": 250,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "pois chiches cuits",
        "quantite": 190,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "poivron",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "paprika",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire les pommes de terre en dés.",
      "Fais revenir le poivron avec l'huile.",
      "Ajoute les pois chiches et la tomate.",
      "Assaisonne avec le paprika.",
      "Mélange avec les pommes de terre."
    ]
  },
  {
    "id": "plat-pates-aubergine-pois-chiches",
    "nom": "Pâtes aubergine pois chiches",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "kcal": 620,
    "proteines": 25,
    "glucides": 94,
    "lipides": 17,
    "tempsMinutes": 25,
    "motsCles": [
      "pâtes",
      "aubergine",
      "pois chiches",
      "tomate",
      "huile d'olive"
    ],
    "ingredients": [
      {
        "nom": "pâtes",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "pois chiches cuits",
        "quantite": 170,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "aubergine",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 170,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "basilic",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Fais cuire les pâtes.",
      "Coupe l'aubergine en dés.",
      "Fais revenir l'aubergine avec l'huile.",
      "Ajoute les pois chiches et la tomate.",
      "Mélange avec les pâtes et le basilic."
    ]
  },
  {
    "id": "plat-salade-haricots-quinoa",
    "nom": "Salade haricots quinoa",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [],
    "kcal": 555,
    "proteines": 26,
    "glucides": 78,
    "lipides": 16,
    "tempsMinutes": 20,
    "motsCles": [
      "haricots rouges",
      "quinoa",
      "tomate",
      "concombre",
      "citron"
    ],
    "ingredients": [
      {
        "nom": "haricots rouges cuits",
        "quantite": 210,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "quinoa",
        "quantite": 65,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "concombre",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "jus de citron",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le quinoa.",
      "Rince les haricots rouges.",
      "Coupe la tomate et le concombre.",
      "Mélange tous les ingrédients.",
      "Ajoute le citron et l'huile."
    ]
  },
  {
    "id": "plat-mijote-haricots-poivron",
    "nom": "Mijoté haricots poivron",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 515,
    "proteines": 26,
    "glucides": 72,
    "lipides": 14,
    "tempsMinutes": 25,
    "motsCles": [
      "haricots blancs",
      "poivron",
      "riz",
      "tomate",
      "oignon"
    ],
    "ingredients": [
      {
        "nom": "haricots blancs cuits",
        "quantite": 230,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "riz",
        "quantite": 50,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "poivron",
        "quantite": 130,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 160,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "oignon",
        "quantite": 50,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Fais revenir l'oignon et le poivron.",
      "Ajoute les haricots blancs.",
      "Verse les tomates concassées.",
      "Sers chaud avec le riz."
    ]
  },
  {
    "id": "plat-riz-lentilles-olives",
    "nom": "Riz lentilles olives",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 535,
    "proteines": 25,
    "glucides": 83,
    "lipides": 13,
    "tempsMinutes": 20,
    "motsCles": [
      "riz",
      "lentilles",
      "olives",
      "tomate",
      "courgette"
    ],
    "ingredients": [
      {
        "nom": "riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "lentilles cuites",
        "quantite": 220,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "courgette",
        "quantite": 140,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomate",
        "quantite": 130,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "olives noires",
        "quantite": 25,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Fais revenir la courgette.",
      "Ajoute les lentilles.",
      "Ajoute la tomate et les olives.",
      "Mélange avec le riz."
    ]
  },
  {
    "id": "plat-pita-poulet-crudites",
    "nom": "Pita poulet crudités",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 610,
    "proteines": 44,
    "glucides": 58,
    "lipides": 22,
    "tempsMinutes": 20,
    "motsCles": [
      "pain pita",
      "poulet",
      "yaourt grec",
      "tomate",
      "concombre"
    ],
    "ingredients": [
      {
        "nom": "pain pita",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Boulangerie"
      },
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "yaourt grec",
        "quantite": 60,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "tomate",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "concombre",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le poulet en morceaux.",
      "Coupe la tomate et le concombre.",
      "Mélange le yaourt avec un peu d'herbes.",
      "Garnis le pain pita avec le poulet.",
      "Ajoute les crudités et la sauce."
    ]
  },
  {
    "id": "plat-bowl-poulet-houmous",
    "nom": "Bowl poulet houmous",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "sesame"
    ],
    "kcal": 640,
    "proteines": 43,
    "glucides": 55,
    "lipides": 28,
    "tempsMinutes": 20,
    "motsCles": [
      "poulet",
      "houmous",
      "riz",
      "tomate",
      "concombre"
    ],
    "ingredients": [
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "riz",
        "quantite": 55,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "houmous",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "concombre",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "jus de citron",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Fais cuire le poulet en morceaux.",
      "Coupe la tomate et le concombre.",
      "Dépose le riz dans un bol.",
      "Ajoute le poulet, le houmous et les crudités."
    ]
  },
  {
    "id": "plat-dinde-patate-douce",
    "nom": "Dinde patate douce",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 585,
    "proteines": 43,
    "glucides": 61,
    "lipides": 18,
    "tempsMinutes": 25,
    "motsCles": [
      "dinde",
      "patate douce",
      "poivron",
      "tomate",
      "huile d'olive"
    ],
    "ingredients": [
      {
        "nom": "escalope de dinde",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "patate douce",
        "quantite": 230,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "poivron",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 130,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "paprika",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Coupe la patate douce en dés.",
      "Fais cuire la patate douce à la poêle.",
      "Ajoute la dinde en morceaux.",
      "Ajoute le poivron et la tomate.",
      "Assaisonne avec le paprika."
    ]
  },
  {
    "id": "plat-poulet-lentilles-citron",
    "nom": "Poulet lentilles citron",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 575,
    "proteines": 45,
    "glucides": 48,
    "lipides": 21,
    "tempsMinutes": 20,
    "motsCles": [
      "poulet",
      "lentilles",
      "tomate",
      "citron",
      "roquette"
    ],
    "ingredients": [
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "lentilles cuites",
        "quantite": 190,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomate",
        "quantite": 130,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "roquette",
        "quantite": 40,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "jus de citron",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le poulet en morceaux.",
      "Rince les lentilles.",
      "Coupe la tomate.",
      "Mélange les lentilles avec la tomate et la roquette.",
      "Ajoute le poulet, le citron et l'huile."
    ]
  },
  {
    "id": "plat-semoule-thon-legumes",
    "nom": "Semoule thon légumes",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "poisson"
    ],
    "kcal": 560,
    "proteines": 36,
    "glucides": 74,
    "lipides": 13,
    "tempsMinutes": 15,
    "motsCles": [
      "semoule",
      "thon",
      "tomate",
      "concombre",
      "citron"
    ],
    "ingredients": [
      {
        "nom": "semoule",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "thon au naturel",
        "quantite": 120,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "tomate",
        "quantite": 130,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "concombre",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "jus de citron",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Prépare la semoule avec de l'eau chaude.",
      "Égoutte le thon.",
      "Coupe la tomate et le concombre.",
      "Mélange la semoule avec les légumes.",
      "Ajoute le thon, le citron et l'huile."
    ]
  },
  {
    "id": "plat-riz-saumon-concombre",
    "nom": "Riz saumon concombre",
    "type": "plat",
    "categorie": "",
    "gout": "",
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
      "lactose"
    ],
    "kcal": 630,
    "proteines": 36,
    "glucides": 59,
    "lipides": 29,
    "tempsMinutes": 20,
    "motsCles": [
      "saumon",
      "riz",
      "concombre",
      "yaourt grec",
      "citron"
    ],
    "ingredients": [
      {
        "nom": "saumon",
        "quantite": 130,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "riz",
        "quantite": 65,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "concombre",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "yaourt grec",
        "quantite": 60,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "jus de citron",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "aneth",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Fais cuire le saumon à la poêle.",
      "Coupe le concombre.",
      "Mélange le yaourt avec le citron et l'aneth.",
      "Sers le saumon avec le riz, le concombre et la sauce."
    ]
  },
  {
    "id": "plat-oeufs-pommes-tomate",
    "nom": "Oeufs pommes tomate",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "oeuf"
    ],
    "kcal": 500,
    "proteines": 26,
    "glucides": 52,
    "lipides": 21,
    "tempsMinutes": 25,
    "motsCles": [
      "oeufs",
      "pommes de terre",
      "tomate",
      "épinards",
      "huile d'olive"
    ],
    "ingredients": [
      {
        "nom": "oeufs",
        "quantite": 3,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "pommes de terre",
        "quantite": 220,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "épinards",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      },
      {
        "nom": "paprika",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire les pommes de terre en dés.",
      "Ajoute la tomate et les épinards.",
      "Assaisonne avec le paprika.",
      "Casse les oeufs dans la poêle.",
      "Couvre jusqu'à cuisson des oeufs."
    ]
  },
  {
    "id": "plat-pates-dinde-courgette",
    "nom": "Pâtes dinde courgette",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mediterraneenne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 625,
    "proteines": 43,
    "glucides": 74,
    "lipides": 18,
    "tempsMinutes": 25,
    "motsCles": [
      "pâtes",
      "dinde",
      "courgette",
      "feta",
      "citron"
    ],
    "ingredients": [
      {
        "nom": "pâtes",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "escalope de dinde",
        "quantite": 140,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "courgette",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "feta",
        "quantite": 35,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "jus de citron",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire les pâtes.",
      "Coupe la dinde et la courgette.",
      "Fais revenir la dinde avec l'huile.",
      "Ajoute la courgette.",
      "Mélange avec les pâtes, la feta et le citron."
    ]
  },
  {
    "id": "plat-riz-crevettes-pois-chiches",
    "nom": "Riz crevettes pois chiches",
    "type": "plat",
    "categorie": "",
    "gout": "",
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
    "kcal": 600,
    "proteines": 39,
    "glucides": 75,
    "lipides": 16,
    "tempsMinutes": 25,
    "motsCles": [
      "crevettes",
      "riz",
      "pois chiches",
      "tomate",
      "poivron"
    ],
    "ingredients": [
      {
        "nom": "crevettes",
        "quantite": 140,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "riz",
        "quantite": 65,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "pois chiches cuits",
        "quantite": 120,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "poivron",
        "quantite": 110,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Fais revenir le poivron avec l'huile.",
      "Ajoute les pois chiches et la tomate.",
      "Ajoute les crevettes.",
      "Sers avec le riz."
    ]
  },
  {
    "id": "plat-bowl-thon-houmous",
    "nom": "Bowl thon houmous",
    "type": "plat",
    "categorie": "",
    "gout": "",
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
    "kcal": 610,
    "proteines": 39,
    "glucides": 55,
    "lipides": 28,
    "tempsMinutes": 15,
    "motsCles": [
      "thon",
      "houmous",
      "riz",
      "tomate",
      "concombre"
    ],
    "ingredients": [
      {
        "nom": "thon au naturel",
        "quantite": 130,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "riz cuit",
        "quantite": 160,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "houmous",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "concombre",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "jus de citron",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Égoutte le thon.",
      "Coupe la tomate et le concombre.",
      "Dépose le riz dans un bol.",
      "Ajoute le thon et les crudités.",
      "Ajoute le houmous et le citron."
    ]
  },
  {
    "id": "plat-poulet-curry-riz",
    "nom": "Poulet curry riz",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "indienne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 610,
    "proteines": 43,
    "glucides": 68,
    "lipides": 19,
    "tempsMinutes": 25,
    "motsCles": [
      "poulet",
      "riz",
      "lait de coco",
      "curry",
      "épinards"
    ],
    "ingredients": [
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "riz",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "lait de coco",
        "quantite": 100,
        "unite": "ml",
        "rayon": "Épicerie"
      },
      {
        "nom": "épinards",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "curry",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Coupe le poulet en morceaux.",
      "Fais revenir le poulet à la poêle.",
      "Ajoute la tomate, le lait de coco, le curry et les épinards.",
      "Laisse mijoter puis sers avec le riz."
    ]
  },
  {
    "id": "plat-dal-lentilles-riz",
    "nom": "Dal lentilles riz",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "indienne"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 555,
    "proteines": 27,
    "glucides": 88,
    "lipides": 11,
    "tempsMinutes": 25,
    "motsCles": [
      "lentilles corail",
      "riz",
      "tomate",
      "lait de coco",
      "curry"
    ],
    "ingredients": [
      {
        "nom": "lentilles corail",
        "quantite": 80,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "riz",
        "quantite": 55,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 160,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "lait de coco",
        "quantite": 80,
        "unite": "ml",
        "rayon": "Épicerie"
      },
      {
        "nom": "épinards",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "curry",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Rince les lentilles corail.",
      "Fais cuire les lentilles avec la tomate et le curry.",
      "Ajoute le lait de coco et les épinards.",
      "Sers le dal avec le riz."
    ]
  },
  {
    "id": "plat-pois-chiches-curry",
    "nom": "Pois chiches curry",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "indienne"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 570,
    "proteines": 25,
    "glucides": 82,
    "lipides": 17,
    "tempsMinutes": 25,
    "motsCles": [
      "pois chiches",
      "riz",
      "tomate",
      "épinards",
      "curry"
    ],
    "ingredients": [
      {
        "nom": "pois chiches cuits",
        "quantite": 220,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "riz",
        "quantite": 55,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 170,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "épinards",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile de colza",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "curry",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Fais chauffer l'huile avec le curry.",
      "Ajoute les pois chiches et la tomate.",
      "Ajoute les épinards.",
      "Laisse mijoter et sers avec le riz."
    ]
  },
  {
    "id": "plat-tofu-tikka-riz",
    "nom": "Tofu tikka riz",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "indienne"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "soja"
    ],
    "kcal": 620,
    "proteines": 32,
    "glucides": 67,
    "lipides": 25,
    "tempsMinutes": 25,
    "motsCles": [
      "tofu ferme",
      "riz",
      "tomate",
      "lait de coco",
      "curry"
    ],
    "ingredients": [
      {
        "nom": "tofu ferme",
        "quantite": 180,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "riz",
        "quantite": 65,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 160,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "lait de coco",
        "quantite": 90,
        "unite": "ml",
        "rayon": "Épicerie"
      },
      {
        "nom": "courgette",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "curry",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Coupe le tofu en dés.",
      "Fais dorer le tofu à la poêle.",
      "Ajoute la courgette, la tomate, le lait de coco et le curry.",
      "Laisse mijoter puis sers avec le riz."
    ]
  },
  {
    "id": "plat-dinde-curry-patate",
    "nom": "Dinde curry patate",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "indienne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 590,
    "proteines": 43,
    "glucides": 60,
    "lipides": 19,
    "tempsMinutes": 25,
    "motsCles": [
      "dinde",
      "patate douce",
      "lait de coco",
      "épinards",
      "curry"
    ],
    "ingredients": [
      {
        "nom": "escalope de dinde",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "patate douce",
        "quantite": 230,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "lait de coco",
        "quantite": 90,
        "unite": "ml",
        "rayon": "Épicerie"
      },
      {
        "nom": "épinards",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "curry",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Coupe la dinde et la patate douce.",
      "Fais cuire la patate douce en dés.",
      "Ajoute la dinde et fais dorer.",
      "Ajoute la tomate, le lait de coco, les épinards et le curry.",
      "Laisse mijoter quelques minutes."
    ]
  },
  {
    "id": "plat-chili-boeuf-riz",
    "nom": "Chili boeuf riz",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mexicaine"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 630,
    "proteines": 40,
    "glucides": 77,
    "lipides": 18,
    "tempsMinutes": 30,
    "motsCles": [
      "boeuf haché",
      "riz",
      "haricots rouges",
      "tomate",
      "maïs"
    ],
    "ingredients": [
      {
        "nom": "boeuf haché 5%",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "haricots rouges cuits",
        "quantite": 130,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 160,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "maïs",
        "quantite": 60,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "paprika",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Fais revenir le boeuf haché.",
      "Ajoute les haricots rouges, le maïs et la tomate.",
      "Assaisonne avec le paprika.",
      "Laisse mijoter puis sers avec le riz."
    ]
  },
  {
    "id": "plat-chili-sin-carne",
    "nom": "Chili sin carne",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mexicaine"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 560,
    "proteines": 26,
    "glucides": 91,
    "lipides": 11,
    "tempsMinutes": 25,
    "motsCles": [
      "haricots rouges",
      "riz",
      "maïs",
      "tomate",
      "poivron"
    ],
    "ingredients": [
      {
        "nom": "haricots rouges cuits",
        "quantite": 230,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "riz",
        "quantite": 55,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "maïs",
        "quantite": 70,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 170,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "poivron",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "paprika",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Coupe le poivron en dés.",
      "Fais mijoter la tomate avec le poivron.",
      "Ajoute les haricots rouges, le maïs et le paprika.",
      "Sers le chili avec le riz."
    ]
  },
  {
    "id": "plat-bowl-poulet-mexicain",
    "nom": "Bowl poulet mexicain",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mexicaine"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 610,
    "proteines": 44,
    "glucides": 70,
    "lipides": 18,
    "tempsMinutes": 25,
    "motsCles": [
      "poulet",
      "riz",
      "haricots rouges",
      "maïs",
      "avocat"
    ],
    "ingredients": [
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "haricots rouges cuits",
        "quantite": 120,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "maïs",
        "quantite": 60,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "avocat",
        "quantite": 50,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "jus de citron",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Fais cuire le poulet en morceaux.",
      "Rince les haricots rouges.",
      "Mélange le riz avec le maïs et les haricots.",
      "Ajoute le poulet, l'avocat et le citron."
    ]
  },
  {
    "id": "plat-tacos-dinde-haricots",
    "nom": "Tacos dinde haricots",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mexicaine"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [],
    "kcal": 600,
    "proteines": 42,
    "glucides": 62,
    "lipides": 21,
    "tempsMinutes": 20,
    "motsCles": [
      "tortillas de maïs",
      "dinde",
      "haricots rouges",
      "tomate",
      "avocat"
    ],
    "ingredients": [
      {
        "nom": "tortillas de maïs",
        "quantite": 2,
        "unite": "piece",
        "rayon": "Boulangerie"
      },
      {
        "nom": "escalope de dinde",
        "quantite": 140,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "haricots rouges cuits",
        "quantite": 120,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "avocat",
        "quantite": 50,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "paprika",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Coupe la dinde en petits morceaux.",
      "Fais revenir la dinde avec le paprika.",
      "Réchauffe les tortillas de maïs.",
      "Ajoute les haricots, la tomate et l'avocat.",
      "Garnis les tortillas avec la dinde."
    ]
  },
  {
    "id": "plat-burrito-bowl-tofu",
    "nom": "Burrito bowl tofu",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "mexicaine"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "soja"
    ],
    "kcal": 620,
    "proteines": 33,
    "glucides": 74,
    "lipides": 22,
    "tempsMinutes": 20,
    "motsCles": [
      "tofu ferme",
      "riz",
      "haricots rouges",
      "maïs",
      "tomate"
    ],
    "ingredients": [
      {
        "nom": "tofu ferme",
        "quantite": 170,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "riz",
        "quantite": 65,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "haricots rouges cuits",
        "quantite": 130,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "maïs",
        "quantite": 60,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "paprika",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Coupe le tofu en dés.",
      "Fais dorer le tofu avec le paprika.",
      "Mélange le riz avec les haricots, le maïs et la tomate.",
      "Ajoute le tofu par-dessus."
    ]
  },
  {
    "id": "plat-poulet-shawarma-riz",
    "nom": "Poulet shawarma riz",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "orientale"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose"
    ],
    "kcal": 610,
    "proteines": 45,
    "glucides": 62,
    "lipides": 22,
    "tempsMinutes": 25,
    "motsCles": [
      "poulet",
      "riz",
      "yaourt grec",
      "concombre",
      "tomate"
    ],
    "ingredients": [
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "riz",
        "quantite": 65,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "yaourt grec",
        "quantite": 70,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "concombre",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "cumin",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Coupe le poulet en morceaux.",
      "Fais revenir le poulet avec le cumin.",
      "Coupe la tomate et le concombre.",
      "Sers avec le riz, les crudités et le yaourt."
    ]
  },
  {
    "id": "plat-kefta-riz-tomate",
    "nom": "Kefta riz tomate",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "orientale"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "oeuf"
    ],
    "kcal": 630,
    "proteines": 40,
    "glucides": 66,
    "lipides": 22,
    "tempsMinutes": 30,
    "motsCles": [
      "boeuf haché",
      "riz",
      "oeuf",
      "tomate",
      "courgette"
    ],
    "ingredients": [
      {
        "nom": "boeuf haché 5%",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "riz",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "oeuf",
        "quantite": 0.5,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 170,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "courgette",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "cumin",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Mélange le boeuf avec l'oeuf et le cumin.",
      "Forme des petites keftas.",
      "Fais cuire les keftas avec la tomate et la courgette.",
      "Sers avec le riz."
    ]
  },
  {
    "id": "plat-falafels-houmous-riz",
    "nom": "Falafels houmous riz",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "orientale"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "sesame"
    ],
    "kcal": 610,
    "proteines": 25,
    "glucides": 78,
    "lipides": 23,
    "tempsMinutes": 20,
    "motsCles": [
      "falafels sans gluten",
      "houmous",
      "riz",
      "tomate",
      "concombre"
    ],
    "ingredients": [
      {
        "nom": "falafels sans gluten",
        "quantite": 130,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "houmous",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "concombre",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "jus de citron",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Réchauffe les falafels.",
      "Coupe la tomate et le concombre.",
      "Dépose le riz dans une assiette.",
      "Ajoute les falafels, le houmous et les crudités."
    ]
  },
  {
    "id": "plat-tajine-poulet-pois-chiches",
    "nom": "Tajine poulet pois chiches",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "orientale"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 590,
    "proteines": 44,
    "glucides": 55,
    "lipides": 21,
    "tempsMinutes": 30,
    "motsCles": [
      "poulet",
      "pois chiches",
      "carotte",
      "courgette",
      "tomate"
    ],
    "ingredients": [
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "pois chiches cuits",
        "quantite": 150,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "carotte",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "courgette",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Coupe le poulet et les légumes.",
      "Fais dorer le poulet avec l'huile.",
      "Ajoute la carotte et la courgette.",
      "Ajoute les pois chiches et la tomate.",
      "Laisse mijoter jusqu'à cuisson tendre."
    ]
  },
  {
    "id": "plat-mujadara-lentilles-riz",
    "nom": "Mujadara lentilles riz",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "orientale"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 540,
    "proteines": 25,
    "glucides": 86,
    "lipides": 12,
    "tempsMinutes": 25,
    "motsCles": [
      "lentilles",
      "riz",
      "oignon",
      "tomate",
      "concombre"
    ],
    "ingredients": [
      {
        "nom": "lentilles cuites",
        "quantite": 230,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "oignon",
        "quantite": 70,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomate",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "concombre",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Fais revenir l'oignon avec l'huile.",
      "Ajoute les lentilles et le riz.",
      "Mélange quelques minutes à feu doux.",
      "Sers avec la tomate et le concombre."
    ]
  },
  {
    "id": "plat-poulet-coco-thai",
    "nom": "Poulet coco thaï",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "thailandaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [],
    "kcal": 620,
    "proteines": 43,
    "glucides": 64,
    "lipides": 23,
    "tempsMinutes": 25,
    "motsCles": [
      "poulet",
      "riz",
      "lait de coco",
      "courgette",
      "curry"
    ],
    "ingredients": [
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "riz",
        "quantite": 65,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "lait de coco",
        "quantite": 110,
        "unite": "ml",
        "rayon": "Épicerie"
      },
      {
        "nom": "courgette",
        "quantite": 140,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "poivron",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "curry",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Coupe le poulet et les légumes.",
      "Fais revenir le poulet.",
      "Ajoute les légumes, le lait de coco et le curry.",
      "Laisse mijoter puis sers avec le riz."
    ]
  },
  {
    "id": "plat-tofu-coco-thai",
    "nom": "Tofu coco thaï",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "thailandaise"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "soja"
    ],
    "kcal": 625,
    "proteines": 31,
    "glucides": 66,
    "lipides": 27,
    "tempsMinutes": 25,
    "motsCles": [
      "tofu ferme",
      "riz",
      "lait de coco",
      "brocoli",
      "curry"
    ],
    "ingredients": [
      {
        "nom": "tofu ferme",
        "quantite": 180,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "riz",
        "quantite": 65,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "lait de coco",
        "quantite": 100,
        "unite": "ml",
        "rayon": "Épicerie"
      },
      {
        "nom": "brocoli",
        "quantite": 160,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "carotte",
        "quantite": 90,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "curry",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Coupe le tofu et les légumes.",
      "Fais dorer le tofu à la poêle.",
      "Ajoute les légumes, le lait de coco et le curry.",
      "Laisse mijoter puis sers avec le riz."
    ]
  },
  {
    "id": "plat-pad-thai-crevettes",
    "nom": "Pad thaï crevettes",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "thailandaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "crustaces",
      "oeuf",
      "soja",
      "arachide"
    ],
    "kcal": 640,
    "proteines": 38,
    "glucides": 75,
    "lipides": 22,
    "tempsMinutes": 25,
    "motsCles": [
      "crevettes",
      "nouilles de riz",
      "oeuf",
      "tamari",
      "cacahuètes"
    ],
    "ingredients": [
      {
        "nom": "crevettes",
        "quantite": 150,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "nouilles de riz",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "oeuf",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "carotte",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tamari",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "cacahuètes",
        "quantite": 15,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire les nouilles de riz.",
      "Fais revenir les crevettes et la carotte.",
      "Ajoute l'oeuf battu et mélange.",
      "Ajoute les nouilles et le tamari.",
      "Termine avec les cacahuètes."
    ]
  },
  {
    "id": "plat-boeuf-basilic-riz",
    "nom": "Boeuf basilic riz",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "thailandaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "soja"
    ],
    "kcal": 620,
    "proteines": 40,
    "glucides": 70,
    "lipides": 20,
    "tempsMinutes": 20,
    "motsCles": [
      "boeuf émincé",
      "riz",
      "poivron",
      "tamari",
      "basilic"
    ],
    "ingredients": [
      {
        "nom": "boeuf émincé",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "riz",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "poivron",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "courgette",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tamari",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "basilic",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Coupe les légumes.",
      "Fais revenir le boeuf à feu vif.",
      "Ajoute les légumes et le tamari.",
      "Ajoute le basilic et sers avec le riz."
    ]
  },
  {
    "id": "plat-saumon-teriyaki-riz",
    "nom": "Saumon teriyaki riz",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "japonaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson",
      "soja",
      "sesame"
    ],
    "kcal": 640,
    "proteines": 36,
    "glucides": 64,
    "lipides": 29,
    "tempsMinutes": 20,
    "motsCles": [
      "saumon",
      "riz",
      "tamari",
      "brocoli",
      "graines de sésame"
    ],
    "ingredients": [
      {
        "nom": "saumon",
        "quantite": 130,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "riz",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "brocoli",
        "quantite": 160,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tamari",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "graines de sésame",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      },
      {
        "nom": "jus de citron",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Fais cuire le brocoli.",
      "Fais dorer le saumon à la poêle.",
      "Ajoute le tamari et le citron.",
      "Sers avec le riz, le brocoli et le sésame."
    ]
  },
  {
    "id": "plat-poulet-donburi",
    "nom": "Poulet donburi",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "japonaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "oeuf",
      "soja"
    ],
    "kcal": 610,
    "proteines": 45,
    "glucides": 68,
    "lipides": 17,
    "tempsMinutes": 20,
    "motsCles": [
      "poulet",
      "riz",
      "oeuf",
      "tamari",
      "courgette"
    ],
    "ingredients": [
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "riz",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "oeuf",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "courgette",
        "quantite": 140,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tamari",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "huile de colza",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Coupe le poulet et la courgette.",
      "Fais revenir le poulet avec l'huile.",
      "Ajoute la courgette et le tamari.",
      "Ajoute l'oeuf battu et sers sur le riz."
    ]
  },
  {
    "id": "plat-tofu-edamame-riz",
    "nom": "Tofu edamame riz",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "japonaise"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "soja"
    ],
    "kcal": 600,
    "proteines": 33,
    "glucides": 72,
    "lipides": 20,
    "tempsMinutes": 20,
    "motsCles": [
      "tofu ferme",
      "edamame",
      "riz",
      "tamari",
      "concombre"
    ],
    "ingredients": [
      {
        "nom": "tofu ferme",
        "quantite": 160,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "edamame",
        "quantite": 90,
        "unite": "g",
        "rayon": "Surgelés"
      },
      {
        "nom": "riz",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "concombre",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tamari",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "huile de colza",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Coupe le tofu en dés.",
      "Fais dorer le tofu avec l'huile.",
      "Ajoute les edamame et le tamari.",
      "Sers avec le riz et le concombre."
    ]
  },
  {
    "id": "plat-thon-riz-avocat",
    "nom": "Thon riz avocat",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "japonaise"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson",
      "soja",
      "sesame"
    ],
    "kcal": 610,
    "proteines": 39,
    "glucides": 62,
    "lipides": 25,
    "tempsMinutes": 15,
    "motsCles": [
      "thon",
      "riz",
      "avocat",
      "tamari",
      "graines de sésame"
    ],
    "ingredients": [
      {
        "nom": "thon au naturel",
        "quantite": 130,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "riz cuit",
        "quantite": 200,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "avocat",
        "quantite": 70,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "concombre",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tamari",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "graines de sésame",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Égoutte le thon.",
      "Coupe l'avocat et le concombre.",
      "Dépose le riz cuit dans un bol.",
      "Ajoute le thon, l'avocat et le concombre.",
      "Ajoute le tamari et les graines de sésame."
    ]
  },
  {
    "id": "plat-burger-boeuf-patate",
    "nom": "Burger boeuf patate",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "americaine"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose"
    ],
    "kcal": 650,
    "proteines": 40,
    "glucides": 58,
    "lipides": 28,
    "tempsMinutes": 30,
    "motsCles": [
      "boeuf haché",
      "pommes de terre",
      "cheddar",
      "tomate",
      "salade"
    ],
    "ingredients": [
      {
        "nom": "boeuf haché 5%",
        "quantite": 140,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "pommes de terre",
        "quantite": 250,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "cheddar",
        "quantite": 25,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "tomate",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "salade",
        "quantite": 40,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile de colza",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Coupe les pommes de terre en quartiers.",
      "Fais cuire les pommes de terre à la poêle.",
      "Forme un steak avec le boeuf.",
      "Fais cuire le steak et ajoute le cheddar.",
      "Sers avec la tomate, la salade et les pommes de terre."
    ]
  },
  {
    "id": "plat-pates-poulet-tomate",
    "nom": "Pâtes poulet tomate",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 610,
    "proteines": 43,
    "glucides": 72,
    "lipides": 17,
    "tempsMinutes": 25,
    "motsCles": [
      "pâtes",
      "poulet",
      "tomate",
      "parmesan",
      "courgette"
    ],
    "ingredients": [
      {
        "nom": "pâtes",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "blanc de poulet",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 160,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "courgette",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "parmesan",
        "quantite": 15,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire les pâtes.",
      "Coupe le poulet et la courgette.",
      "Fais revenir le poulet avec l'huile d'olive.",
      "Ajoute la courgette et les tomates concassées.",
      "Mélange avec les pâtes et ajoute le parmesan."
    ]
  },
  {
    "id": "plat-risotto-poulet-champignons",
    "nom": "Risotto poulet champignons",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose"
    ],
    "kcal": 620,
    "proteines": 42,
    "glucides": 69,
    "lipides": 18,
    "tempsMinutes": 30,
    "motsCles": [
      "riz arborio",
      "poulet",
      "champignons",
      "parmesan",
      "bouillon de légumes"
    ],
    "ingredients": [
      {
        "nom": "riz arborio",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "blanc de poulet",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "champignons",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "bouillon de légumes",
        "quantite": 300,
        "unite": "ml",
        "rayon": "Épicerie"
      },
      {
        "nom": "parmesan",
        "quantite": 20,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais revenir le poulet en morceaux.",
      "Ajoute les champignons émincés.",
      "Verse le riz et mélange une minute.",
      "Ajoute le bouillon petit à petit.",
      "Termine avec le parmesan."
    ]
  },
  {
    "id": "plat-pates-thon-tomate",
    "nom": "Pâtes thon tomate",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "poisson"
    ],
    "kcal": 560,
    "proteines": 36,
    "glucides": 75,
    "lipides": 12,
    "tempsMinutes": 20,
    "motsCles": [
      "pâtes",
      "thon",
      "tomate",
      "olives",
      "basilic"
    ],
    "ingredients": [
      {
        "nom": "pâtes",
        "quantite": 80,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "thon au naturel",
        "quantite": 120,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "olives noires",
        "quantite": 25,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      },
      {
        "nom": "basilic",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Fais cuire les pâtes.",
      "Chauffe les tomates concassées.",
      "Ajoute le thon égoutté et les olives.",
      "Mélange la sauce avec les pâtes.",
      "Ajoute le basilic avant de servir."
    ]
  },
  {
    "id": "plat-bolognaise-boeuf",
    "nom": "Bolognaise boeuf",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "gluten"
    ],
    "kcal": 640,
    "proteines": 40,
    "glucides": 73,
    "lipides": 18,
    "tempsMinutes": 30,
    "motsCles": [
      "spaghetti",
      "boeuf haché",
      "tomate",
      "carotte",
      "oignon"
    ],
    "ingredients": [
      {
        "nom": "spaghetti",
        "quantite": 80,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "boeuf haché 5%",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "carotte",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "oignon",
        "quantite": 50,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire les spaghetti.",
      "Fais revenir l'oignon et la carotte.",
      "Ajoute le boeuf haché.",
      "Verse les tomates concassées.",
      "Laisse mijoter puis mélange avec les pâtes."
    ]
  },
  {
    "id": "plat-pates-boulettes-tomate",
    "nom": "Pâtes boulettes tomate",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "gluten",
      "oeuf"
    ],
    "kcal": 650,
    "proteines": 41,
    "glucides": 74,
    "lipides": 19,
    "tempsMinutes": 30,
    "motsCles": [
      "pâtes",
      "boeuf haché",
      "oeuf",
      "tomate",
      "persil"
    ],
    "ingredients": [
      {
        "nom": "pâtes",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "boeuf haché 5%",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "oeuf",
        "quantite": 0.5,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "oignon",
        "quantite": 40,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Mélange le boeuf avec l'oeuf et forme des boulettes.",
      "Fais dorer les boulettes à la poêle.",
      "Ajoute l'oignon et les tomates concassées.",
      "Fais cuire les pâtes.",
      "Mélange les pâtes avec la sauce et les boulettes."
    ]
  },
  {
    "id": "plat-escalope-tomate-mozzarella",
    "nom": "Escalope tomate mozzarella",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose"
    ],
    "kcal": 570,
    "proteines": 45,
    "glucides": 48,
    "lipides": 21,
    "tempsMinutes": 25,
    "motsCles": [
      "poulet",
      "mozzarella",
      "tomate",
      "riz",
      "basilic"
    ],
    "ingredients": [
      {
        "nom": "escalope de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "mozzarella",
        "quantite": 50,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "tomate",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      },
      {
        "nom": "basilic",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Fais dorer le poulet à la poêle.",
      "Ajoute la tomate en dés.",
      "Dépose la mozzarella sur le poulet.",
      "Couvre quelques minutes et sers avec le riz."
    ]
  },
  {
    "id": "plat-risotto-crevettes-courgettes",
    "nom": "Risotto crevettes courgettes",
    "type": "plat",
    "categorie": "",
    "gout": "",
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
      "lactose"
    ],
    "kcal": 595,
    "proteines": 36,
    "glucides": 70,
    "lipides": 17,
    "tempsMinutes": 30,
    "motsCles": [
      "riz arborio",
      "crevettes",
      "courgette",
      "parmesan",
      "citron"
    ],
    "ingredients": [
      {
        "nom": "riz arborio",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "crevettes",
        "quantite": 140,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "courgette",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "bouillon de légumes",
        "quantite": 300,
        "unite": "ml",
        "rayon": "Épicerie"
      },
      {
        "nom": "parmesan",
        "quantite": 15,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais revenir la courgette en dés.",
      "Ajoute le riz et mélange.",
      "Verse le bouillon petit à petit.",
      "Ajoute les crevettes en fin de cuisson.",
      "Termine avec le parmesan."
    ]
  },
  {
    "id": "plat-saumon-pesto-riz",
    "nom": "Saumon pesto riz",
    "type": "plat",
    "categorie": "",
    "gout": "",
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
    "kcal": 640,
    "proteines": 35,
    "glucides": 50,
    "lipides": 32,
    "tempsMinutes": 25,
    "motsCles": [
      "saumon",
      "pesto",
      "riz",
      "haricots verts",
      "parmesan"
    ],
    "ingredients": [
      {
        "nom": "saumon",
        "quantite": 130,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "riz",
        "quantite": 60,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "haricots verts",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "pesto",
        "quantite": 20,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "jus de citron",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz et les haricots verts.",
      "Fais cuire le saumon à la poêle.",
      "Ajoute le jus de citron.",
      "Mélange le riz avec le pesto.",
      "Sers avec le saumon et les haricots verts."
    ]
  },
  {
    "id": "plat-cabillaud-polenta-tomate",
    "nom": "Cabillaud polenta tomate",
    "type": "plat",
    "categorie": "",
    "gout": "",
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
      "lactose"
    ],
    "kcal": 530,
    "proteines": 38,
    "glucides": 58,
    "lipides": 15,
    "tempsMinutes": 25,
    "motsCles": [
      "cabillaud",
      "polenta",
      "tomate",
      "parmesan",
      "épinards"
    ],
    "ingredients": [
      {
        "nom": "cabillaud",
        "quantite": 160,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "polenta",
        "quantite": 65,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 170,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "épinards",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "parmesan",
        "quantite": 15,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire la polenta.",
      "Ajoute le parmesan dans la polenta.",
      "Fais cuire le cabillaud à la poêle.",
      "Chauffe les tomates avec les épinards.",
      "Sers le cabillaud avec la polenta et la sauce."
    ]
  },
  {
    "id": "plat-dinde-arrabbiata-riz",
    "nom": "Dinde arrabbiata riz",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 555,
    "proteines": 42,
    "glucides": 64,
    "lipides": 14,
    "tempsMinutes": 25,
    "motsCles": [
      "dinde",
      "riz",
      "tomate",
      "piment",
      "courgette"
    ],
    "ingredients": [
      {
        "nom": "escalope de dinde",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "riz",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "courgette",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "piment doux",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Coupe la dinde et la courgette.",
      "Fais revenir la dinde avec l'huile.",
      "Ajoute la courgette, la tomate et le piment.",
      "Sers la sauce avec le riz."
    ]
  },
  {
    "id": "plat-pates-poulet-pesto",
    "nom": "Pâtes poulet pesto",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "gluten",
      "lactose",
      "fruits-a-coque"
    ],
    "kcal": 650,
    "proteines": 43,
    "glucides": 68,
    "lipides": 23,
    "tempsMinutes": 20,
    "motsCles": [
      "pâtes",
      "poulet",
      "pesto",
      "tomates cerises",
      "roquette"
    ],
    "ingredients": [
      {
        "nom": "pâtes",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "blanc de poulet",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "pesto",
        "quantite": 25,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomates cerises",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "roquette",
        "quantite": 30,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire les pâtes.",
      "Fais dorer le poulet en morceaux.",
      "Coupe les tomates cerises.",
      "Mélange les pâtes avec le pesto.",
      "Ajoute le poulet, les tomates et la roquette."
    ]
  },
  {
    "id": "plat-lasagnes-courgette-boeuf",
    "nom": "Lasagnes courgette boeuf",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 645,
    "proteines": 42,
    "glucides": 58,
    "lipides": 25,
    "tempsMinutes": 30,
    "motsCles": [
      "feuilles de lasagne",
      "boeuf haché",
      "courgette",
      "tomate",
      "mozzarella"
    ],
    "ingredients": [
      {
        "nom": "feuilles de lasagne",
        "quantite": 50,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "boeuf haché 5%",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "courgette",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "mozzarella",
        "quantite": 45,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais revenir le boeuf avec la courgette.",
      "Ajoute les tomates concassées.",
      "Monte les lasagnes dans un petit plat.",
      "Ajoute la mozzarella dessus.",
      "Fais gratiner au four."
    ]
  },
  {
    "id": "plat-frittata-legumes-ricotta",
    "nom": "Frittata légumes ricotta",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "oeuf",
      "lactose"
    ],
    "kcal": 510,
    "proteines": 30,
    "glucides": 42,
    "lipides": 24,
    "tempsMinutes": 20,
    "motsCles": [
      "oeufs",
      "ricotta",
      "pommes de terre",
      "épinards",
      "tomates cerises"
    ],
    "ingredients": [
      {
        "nom": "oeufs",
        "quantite": 3,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "ricotta",
        "quantite": 70,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "pommes de terre",
        "quantite": 160,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "épinards",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates cerises",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire les pommes de terre en dés.",
      "Fais revenir les épinards et les tomates.",
      "Bats les oeufs avec la ricotta.",
      "Verse dans la poêle avec les légumes.",
      "Cuis à feu doux jusqu'à prise."
    ]
  },
  {
    "id": "plat-risotto-epinards-ricotta",
    "nom": "Risotto épinards ricotta",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
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
    "kcal": 590,
    "proteines": 25,
    "glucides": 76,
    "lipides": 20,
    "tempsMinutes": 30,
    "motsCles": [
      "riz arborio",
      "épinards",
      "ricotta",
      "parmesan",
      "bouillon de légumes"
    ],
    "ingredients": [
      {
        "nom": "riz arborio",
        "quantite": 80,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "épinards",
        "quantite": 160,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "ricotta",
        "quantite": 90,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "parmesan",
        "quantite": 15,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "bouillon de légumes",
        "quantite": 320,
        "unite": "ml",
        "rayon": "Épicerie"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais revenir le riz avec l'huile.",
      "Ajoute le bouillon petit à petit.",
      "Ajoute les épinards en fin de cuisson.",
      "Incorpore la ricotta.",
      "Termine avec le parmesan."
    ]
  },
  {
    "id": "plat-pates-lentilles-tomate",
    "nom": "Pâtes lentilles tomate",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten"
    ],
    "kcal": 580,
    "proteines": 27,
    "glucides": 92,
    "lipides": 10,
    "tempsMinutes": 25,
    "motsCles": [
      "pâtes",
      "lentilles",
      "tomate",
      "carotte",
      "oignon"
    ],
    "ingredients": [
      {
        "nom": "pâtes",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "lentilles cuites",
        "quantite": 160,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "carotte",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "oignon",
        "quantite": 50,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire les pâtes.",
      "Fais revenir l'oignon et la carotte.",
      "Ajoute les lentilles et la tomate.",
      "Laisse mijoter quelques minutes.",
      "Mélange avec les pâtes."
    ]
  },
  {
    "id": "plat-polenta-pois-chiches-tomate",
    "nom": "Polenta pois chiches tomate",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 550,
    "proteines": 25,
    "glucides": 82,
    "lipides": 14,
    "tempsMinutes": 25,
    "motsCles": [
      "polenta",
      "pois chiches",
      "tomate",
      "épinards",
      "huile d'olive"
    ],
    "ingredients": [
      {
        "nom": "polenta",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "pois chiches cuits",
        "quantite": 180,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "épinards",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "ail",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Fais cuire la polenta.",
      "Fais revenir l'ail avec l'huile.",
      "Ajoute les pois chiches et la tomate.",
      "Ajoute les épinards.",
      "Sers la sauce sur la polenta."
    ]
  },
  {
    "id": "plat-riz-facon-caponata",
    "nom": "Riz façon caponata",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 545,
    "proteines": 25,
    "glucides": 86,
    "lipides": 13,
    "tempsMinutes": 25,
    "motsCles": [
      "riz",
      "aubergine",
      "pois chiches",
      "tomate",
      "olives"
    ],
    "ingredients": [
      {
        "nom": "riz",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "pois chiches cuits",
        "quantite": 170,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "aubergine",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "olives vertes",
        "quantite": 25,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Coupe l'aubergine en dés.",
      "Fais revenir l'aubergine avec l'huile.",
      "Ajoute les pois chiches, la tomate et les olives.",
      "Sers avec le riz."
    ]
  },
  {
    "id": "plat-pates-ricotta-epinards",
    "nom": "Pâtes ricotta épinards",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 610,
    "proteines": 30,
    "glucides": 80,
    "lipides": 18,
    "tempsMinutes": 20,
    "motsCles": [
      "pâtes",
      "ricotta",
      "épinards",
      "tomates cerises",
      "parmesan"
    ],
    "ingredients": [
      {
        "nom": "pâtes",
        "quantite": 85,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "ricotta",
        "quantite": 100,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "épinards",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates cerises",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "parmesan",
        "quantite": 15,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire les pâtes.",
      "Fais tomber les épinards à la poêle.",
      "Ajoute la ricotta et un peu d'eau de cuisson.",
      "Mélange avec les pâtes.",
      "Ajoute les tomates et le parmesan."
    ]
  },
  {
    "id": "plat-pates-pois-chiches-pesto",
    "nom": "Pâtes pois chiches pesto",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
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
    "kcal": 650,
    "proteines": 26,
    "glucides": 87,
    "lipides": 22,
    "tempsMinutes": 20,
    "motsCles": [
      "pâtes",
      "pois chiches",
      "pesto",
      "courgette",
      "tomates cerises"
    ],
    "ingredients": [
      {
        "nom": "pâtes",
        "quantite": 80,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "pois chiches cuits",
        "quantite": 140,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "pesto",
        "quantite": 25,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "courgette",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates cerises",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire les pâtes.",
      "Fais revenir la courgette.",
      "Ajoute les pois chiches.",
      "Mélange les pâtes avec le pesto.",
      "Ajoute les tomates cerises."
    ]
  },
  {
    "id": "plat-risotto-tomates-mozzarella",
    "nom": "Risotto tomates mozzarella",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose"
    ],
    "kcal": 600,
    "proteines": 25,
    "glucides": 73,
    "lipides": 23,
    "tempsMinutes": 30,
    "motsCles": [
      "riz arborio",
      "mozzarella",
      "tomates cerises",
      "basilic",
      "bouillon de légumes"
    ],
    "ingredients": [
      {
        "nom": "riz arborio",
        "quantite": 80,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "mozzarella",
        "quantite": 80,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "tomates cerises",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "bouillon de légumes",
        "quantite": 320,
        "unite": "ml",
        "rayon": "Épicerie"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      },
      {
        "nom": "basilic",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Fais revenir le riz avec l'huile.",
      "Ajoute le bouillon petit à petit.",
      "Ajoute les tomates cerises coupées.",
      "Incorpore la mozzarella en morceaux.",
      "Ajoute le basilic avant de servir."
    ]
  },
  {
    "id": "plat-aubergine-lentilles-mozzarella",
    "nom": "Aubergine lentilles mozzarella",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
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
    "kcal": 560,
    "proteines": 28,
    "glucides": 55,
    "lipides": 24,
    "tempsMinutes": 30,
    "motsCles": [
      "aubergine",
      "lentilles",
      "mozzarella",
      "tomate",
      "riz"
    ],
    "ingredients": [
      {
        "nom": "aubergine",
        "quantite": 220,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "lentilles cuites",
        "quantite": 170,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "mozzarella",
        "quantite": 60,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 160,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "riz",
        "quantite": 45,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Fais revenir l'aubergine en dés.",
      "Ajoute les lentilles et la tomate.",
      "Dépose la mozzarella dessus.",
      "Couvre pour faire fondre et sers avec le riz."
    ]
  },
  {
    "id": "plat-pates-sans-gluten-ricotta",
    "nom": "Pâtes sans gluten ricotta",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "vegetarien",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose"
    ],
    "kcal": 600,
    "proteines": 26,
    "glucides": 78,
    "lipides": 19,
    "tempsMinutes": 20,
    "motsCles": [
      "pâtes sans gluten",
      "ricotta",
      "brocoli",
      "parmesan",
      "citron"
    ],
    "ingredients": [
      {
        "nom": "pâtes sans gluten",
        "quantite": 85,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "ricotta",
        "quantite": 100,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "brocoli",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "parmesan",
        "quantite": 15,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "jus de citron",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire les pâtes sans gluten.",
      "Fais cuire le brocoli.",
      "Mélange la ricotta avec le citron.",
      "Ajoute les pâtes et le brocoli.",
      "Termine avec le parmesan."
    ]
  },
  {
    "id": "plat-pizza-wrap-vegetarienne",
    "nom": "Pizza wrap végétarienne",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "vegetarien",
      "sans-porc"
    ],
    "budget": "eco",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 540,
    "proteines": 27,
    "glucides": 56,
    "lipides": 22,
    "tempsMinutes": 15,
    "motsCles": [
      "wrap",
      "mozzarella",
      "tomate",
      "champignons",
      "poivron"
    ],
    "ingredients": [
      {
        "nom": "wrap de blé",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Boulangerie"
      },
      {
        "nom": "mozzarella",
        "quantite": 80,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "champignons",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "poivron",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "roquette",
        "quantite": 30,
        "unite": "g",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Étale la tomate sur le wrap.",
      "Ajoute les champignons et le poivron.",
      "Ajoute la mozzarella.",
      "Passe au four jusqu'à ce que le fromage fonde.",
      "Ajoute la roquette avant de servir."
    ]
  },
  {
    "id": "plat-minestrone-haricots-riz",
    "nom": "Minestrone haricots riz",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 500,
    "proteines": 25,
    "glucides": 83,
    "lipides": 9,
    "tempsMinutes": 25,
    "motsCles": [
      "haricots rouges",
      "riz",
      "courgette",
      "carotte",
      "tomate"
    ],
    "ingredients": [
      {
        "nom": "haricots rouges cuits",
        "quantite": 200,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "riz",
        "quantite": 55,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "courgette",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "carotte",
        "quantite": 90,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 160,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "bouillon de légumes",
        "quantite": 250,
        "unite": "ml",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Coupe les légumes en petits dés.",
      "Chauffe le bouillon avec la tomate.",
      "Ajoute les légumes et les haricots.",
      "Ajoute le riz au moment de servir."
    ]
  },
  {
    "id": "plat-pates-sans-gluten-thon",
    "nom": "Pâtes sans gluten thon",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "poisson"
    ],
    "kcal": 565,
    "proteines": 36,
    "glucides": 76,
    "lipides": 12,
    "tempsMinutes": 20,
    "motsCles": [
      "pâtes sans gluten",
      "thon",
      "tomate",
      "courgette",
      "olives"
    ],
    "ingredients": [
      {
        "nom": "pâtes sans gluten",
        "quantite": 85,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "thon au naturel",
        "quantite": 120,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 170,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "courgette",
        "quantite": 130,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "olives noires",
        "quantite": 20,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire les pâtes sans gluten.",
      "Fais revenir la courgette.",
      "Ajoute la tomate et le thon.",
      "Ajoute les olives.",
      "Mélange avec les pâtes."
    ]
  },
  {
    "id": "plat-pates-saumon-epinards",
    "nom": "Pâtes saumon épinards",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "gluten",
      "poisson",
      "lactose"
    ],
    "kcal": 645,
    "proteines": 39,
    "glucides": 68,
    "lipides": 24,
    "tempsMinutes": 25,
    "motsCles": [
      "pâtes",
      "saumon",
      "épinards",
      "crème légère",
      "citron"
    ],
    "ingredients": [
      {
        "nom": "pâtes",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "saumon",
        "quantite": 120,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "épinards",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "crème légère",
        "quantite": 50,
        "unite": "ml",
        "rayon": "Crèmerie"
      },
      {
        "nom": "jus de citron",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire les pâtes.",
      "Fais cuire le saumon à la poêle.",
      "Ajoute les épinards.",
      "Verse la crème légère et le citron.",
      "Mélange avec les pâtes."
    ]
  },
  {
    "id": "plat-poulet-polenta-parmesan",
    "nom": "Poulet polenta parmesan",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "lactose"
    ],
    "kcal": 585,
    "proteines": 43,
    "glucides": 57,
    "lipides": 19,
    "tempsMinutes": 25,
    "motsCles": [
      "poulet",
      "polenta",
      "parmesan",
      "tomate",
      "brocoli"
    ],
    "ingredients": [
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "polenta",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "brocoli",
        "quantite": 160,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 130,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "parmesan",
        "quantite": 20,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire la polenta.",
      "Ajoute le parmesan dans la polenta.",
      "Fais cuire le brocoli.",
      "Fais dorer le poulet avec la tomate.",
      "Sers le poulet avec la polenta et le brocoli."
    ]
  },
  {
    "id": "plat-gnocchi-poulet-tomate",
    "nom": "Gnocchi poulet tomate",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "gluten",
      "lactose"
    ],
    "kcal": 625,
    "proteines": 41,
    "glucides": 78,
    "lipides": 16,
    "tempsMinutes": 20,
    "motsCles": [
      "gnocchi",
      "poulet",
      "tomate",
      "mozzarella",
      "épinards"
    ],
    "ingredients": [
      {
        "nom": "gnocchi",
        "quantite": 180,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "blanc de poulet",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "mozzarella",
        "quantite": 40,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "épinards",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire les gnocchi.",
      "Fais dorer le poulet en morceaux.",
      "Ajoute la tomate et les épinards.",
      "Mélange avec les gnocchi.",
      "Ajoute la mozzarella et laisse fondre."
    ]
  },
  {
    "id": "plat-pates-crevettes-ail",
    "nom": "Pâtes crevettes ail",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc"
    ],
    "budget": "normal",
    "allergenes": [
      "gluten",
      "crustaces"
    ],
    "kcal": 570,
    "proteines": 35,
    "glucides": 76,
    "lipides": 13,
    "tempsMinutes": 20,
    "motsCles": [
      "pâtes",
      "crevettes",
      "ail",
      "tomates cerises",
      "courgette"
    ],
    "ingredients": [
      {
        "nom": "pâtes",
        "quantite": 80,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "crevettes",
        "quantite": 140,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "tomates cerises",
        "quantite": 130,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "courgette",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "ail",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire les pâtes.",
      "Fais revenir l'ail avec l'huile.",
      "Ajoute les crevettes.",
      "Ajoute la courgette et les tomates.",
      "Mélange avec les pâtes."
    ]
  },
  {
    "id": "plat-riz-boulettes-tomate",
    "nom": "Riz boulettes tomate",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "oeuf"
    ],
    "kcal": 620,
    "proteines": 39,
    "glucides": 66,
    "lipides": 21,
    "tempsMinutes": 30,
    "motsCles": [
      "riz",
      "boeuf haché",
      "oeuf",
      "tomate",
      "courgette"
    ],
    "ingredients": [
      {
        "nom": "riz",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "boeuf haché 5%",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "oeuf",
        "quantite": 0.5,
        "unite": "piece",
        "rayon": "Crèmerie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "courgette",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Mélange le boeuf avec l'oeuf.",
      "Forme des boulettes.",
      "Fais cuire les boulettes avec la tomate et la courgette.",
      "Sers avec le riz."
    ]
  },
  {
    "id": "plat-riz-poulet-cacciatore",
    "nom": "Riz poulet cacciatore",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 595,
    "proteines": 43,
    "glucides": 66,
    "lipides": 16,
    "tempsMinutes": 30,
    "motsCles": [
      "poulet",
      "riz",
      "tomate",
      "poivron",
      "champignons"
    ],
    "ingredients": [
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "riz",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 170,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "poivron",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "champignons",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Coupe le poulet et les légumes.",
      "Fais dorer le poulet avec l'huile.",
      "Ajoute les légumes et la tomate.",
      "Laisse mijoter puis sers avec le riz."
    ]
  },
  {
    "id": "plat-polenta-tofu-tomate",
    "nom": "Polenta tofu tomate",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "soja"
    ],
    "kcal": 555,
    "proteines": 31,
    "glucides": 58,
    "lipides": 21,
    "tempsMinutes": 25,
    "motsCles": [
      "polenta",
      "tofu",
      "tomate",
      "courgette",
      "basilic"
    ],
    "ingredients": [
      {
        "nom": "polenta",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tofu ferme",
        "quantite": 160,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 170,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "courgette",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "basilic",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Fais cuire la polenta.",
      "Coupe le tofu en dés.",
      "Fais dorer le tofu avec l'huile.",
      "Ajoute la courgette et la tomate.",
      "Sers avec la polenta et le basilic."
    ]
  },
  {
    "id": "plat-pates-sans-gluten-tofu",
    "nom": "Pâtes sans gluten tofu",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "soja"
    ],
    "kcal": 590,
    "proteines": 32,
    "glucides": 74,
    "lipides": 18,
    "tempsMinutes": 20,
    "motsCles": [
      "pâtes sans gluten",
      "tofu",
      "tomate",
      "épinards",
      "ail"
    ],
    "ingredients": [
      {
        "nom": "pâtes sans gluten",
        "quantite": 85,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tofu ferme",
        "quantite": 160,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 170,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "épinards",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "ail",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire les pâtes sans gluten.",
      "Fais dorer le tofu en dés.",
      "Ajoute l'ail, la tomate et les épinards.",
      "Laisse mijoter quelques minutes.",
      "Mélange avec les pâtes."
    ]
  },
  {
    "id": "plat-risotto-pois-chiches-citron",
    "nom": "Risotto pois chiches citron",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 570,
    "proteines": 25,
    "glucides": 89,
    "lipides": 13,
    "tempsMinutes": 30,
    "motsCles": [
      "riz arborio",
      "pois chiches",
      "courgette",
      "citron",
      "bouillon de légumes"
    ],
    "ingredients": [
      {
        "nom": "riz arborio",
        "quantite": 75,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "pois chiches cuits",
        "quantite": 170,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "courgette",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "bouillon de légumes",
        "quantite": 320,
        "unite": "ml",
        "rayon": "Épicerie"
      },
      {
        "nom": "jus de citron",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais revenir le riz avec l'huile.",
      "Ajoute le bouillon petit à petit.",
      "Ajoute la courgette en dés.",
      "Ajoute les pois chiches.",
      "Termine avec le jus de citron."
    ]
  },
  {
    "id": "plat-chili-blanc-italien",
    "nom": "Chili blanc italien",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 520,
    "proteines": 26,
    "glucides": 78,
    "lipides": 11,
    "tempsMinutes": 25,
    "motsCles": [
      "haricots blancs",
      "riz",
      "tomate",
      "épinards",
      "carotte"
    ],
    "ingredients": [
      {
        "nom": "haricots blancs cuits",
        "quantite": 220,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "riz",
        "quantite": 50,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "épinards",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "carotte",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Fais revenir la carotte avec l'huile.",
      "Ajoute les haricots blancs et la tomate.",
      "Ajoute les épinards.",
      "Sers le tout avec le riz."
    ]
  },
  {
    "id": "plat-salade-riz-mozzarella-thon",
    "nom": "Salade riz mozzarella thon",
    "type": "plat",
    "categorie": "",
    "gout": "",
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
      "lactose"
    ],
    "kcal": 600,
    "proteines": 37,
    "glucides": 60,
    "lipides": 22,
    "tempsMinutes": 20,
    "motsCles": [
      "riz",
      "thon",
      "mozzarella",
      "tomates cerises",
      "roquette"
    ],
    "ingredients": [
      {
        "nom": "riz",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "thon au naturel",
        "quantite": 110,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "mozzarella",
        "quantite": 60,
        "unite": "g",
        "rayon": "Crèmerie"
      },
      {
        "nom": "tomates cerises",
        "quantite": 130,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "roquette",
        "quantite": 40,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz puis laisse tiédir.",
      "Égoutte le thon.",
      "Coupe les tomates et la mozzarella.",
      "Mélange le riz avec tous les ingrédients.",
      "Ajoute l'huile d'olive avant de servir."
    ]
  },
  {
    "id": "plat-salade-pois-chiches-antipasti",
    "nom": "Salade pois chiches antipasti",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 545,
    "proteines": 25,
    "glucides": 69,
    "lipides": 19,
    "tempsMinutes": 15,
    "motsCles": [
      "pois chiches",
      "riz",
      "poivron",
      "tomates cerises",
      "olives"
    ],
    "ingredients": [
      {
        "nom": "pois chiches cuits",
        "quantite": 210,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "riz cuit",
        "quantite": 120,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "poivron",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates cerises",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "olives noires",
        "quantite": 25,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Rince les pois chiches.",
      "Coupe le poivron et les tomates.",
      "Mélange le riz avec les pois chiches.",
      "Ajoute les légumes et les olives.",
      "Assaisonne avec l'huile d'olive."
    ]
  },
  {
    "id": "plat-aubergine-tofu-tomate",
    "nom": "Aubergine tofu tomate",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "soja"
    ],
    "kcal": 535,
    "proteines": 30,
    "glucides": 52,
    "lipides": 22,
    "tempsMinutes": 25,
    "motsCles": [
      "aubergine",
      "tofu",
      "riz",
      "tomate",
      "basilic"
    ],
    "ingredients": [
      {
        "nom": "tofu ferme",
        "quantite": 170,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "aubergine",
        "quantite": 200,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "riz",
        "quantite": 55,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 170,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "basilic",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Coupe l'aubergine et le tofu en dés.",
      "Fais dorer le tofu avec l'huile.",
      "Ajoute l'aubergine et la tomate.",
      "Sers avec le riz et le basilic."
    ]
  },
  {
    "id": "plat-pates-sans-gluten-boeuf",
    "nom": "Pâtes sans gluten boeuf",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [],
    "kcal": 625,
    "proteines": 40,
    "glucides": 78,
    "lipides": 16,
    "tempsMinutes": 25,
    "motsCles": [
      "pâtes sans gluten",
      "boeuf haché",
      "tomate",
      "carotte",
      "champignons"
    ],
    "ingredients": [
      {
        "nom": "pâtes sans gluten",
        "quantite": 85,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "boeuf haché 5%",
        "quantite": 130,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 180,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "carotte",
        "quantite": 80,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "champignons",
        "quantite": 100,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire les pâtes sans gluten.",
      "Fais revenir le boeuf haché.",
      "Ajoute la carotte et les champignons.",
      "Verse les tomates concassées.",
      "Mélange la sauce avec les pâtes."
    ]
  },
  {
    "id": "plat-risotto-thon-tomate",
    "nom": "Risotto thon tomate",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "poisson"
    ],
    "kcal": 570,
    "proteines": 36,
    "glucides": 77,
    "lipides": 11,
    "tempsMinutes": 30,
    "motsCles": [
      "riz arborio",
      "thon",
      "tomate",
      "courgette",
      "bouillon de légumes"
    ],
    "ingredients": [
      {
        "nom": "riz arborio",
        "quantite": 80,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "thon au naturel",
        "quantite": 120,
        "unite": "g",
        "rayon": "Poissonnerie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 160,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "courgette",
        "quantite": 140,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "bouillon de légumes",
        "quantite": 320,
        "unite": "ml",
        "rayon": "Épicerie"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais revenir le riz avec l'huile.",
      "Ajoute le bouillon petit à petit.",
      "Ajoute la courgette et la tomate.",
      "Ajoute le thon égoutté.",
      "Mélange et sers chaud."
    ]
  },
  {
    "id": "plat-poulet-haricots-blancs",
    "nom": "Poulet haricots blancs",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 560,
    "proteines": 44,
    "glucides": 52,
    "lipides": 17,
    "tempsMinutes": 25,
    "motsCles": [
      "poulet",
      "haricots blancs",
      "tomate",
      "épinards",
      "huile d'olive"
    ],
    "ingredients": [
      {
        "nom": "blanc de poulet",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "haricots blancs cuits",
        "quantite": 190,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "tomates concassées",
        "quantite": 160,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "épinards",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "ail",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Coupe le poulet en morceaux.",
      "Fais revenir l'ail et le poulet.",
      "Ajoute les haricots blancs et la tomate.",
      "Ajoute les épinards.",
      "Laisse mijoter quelques minutes."
    ]
  },
  {
    "id": "plat-riz-dinde-pesto-rouge",
    "nom": "Riz dinde pesto rouge",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "normal",
    "allergenes": [
      "lactose",
      "fruits-a-coque"
    ],
    "kcal": 610,
    "proteines": 43,
    "glucides": 63,
    "lipides": 20,
    "tempsMinutes": 20,
    "motsCles": [
      "riz",
      "dinde",
      "pesto rouge",
      "courgette",
      "tomates cerises"
    ],
    "ingredients": [
      {
        "nom": "riz",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "escalope de dinde",
        "quantite": 150,
        "unite": "g",
        "rayon": "Boucherie"
      },
      {
        "nom": "pesto rouge",
        "quantite": 25,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "courgette",
        "quantite": 140,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates cerises",
        "quantite": 120,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais cuire le riz.",
      "Fais revenir la dinde en morceaux.",
      "Ajoute la courgette et les tomates.",
      "Mélange le riz avec le pesto rouge.",
      "Sers avec la dinde et les légumes."
    ]
  },
  {
    "id": "plat-polenta-lentilles-champignons",
    "nom": "Polenta lentilles champignons",
    "type": "plat",
    "categorie": "",
    "gout": "",
    "cuisines": [
      "italienne"
    ],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 540,
    "proteines": 26,
    "glucides": 76,
    "lipides": 14,
    "tempsMinutes": 25,
    "motsCles": [
      "polenta",
      "lentilles",
      "champignons",
      "tomate",
      "persil"
    ],
    "ingredients": [
      {
        "nom": "polenta",
        "quantite": 70,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "lentilles cuites",
        "quantite": 190,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "champignons",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "tomates concassées",
        "quantite": 150,
        "unite": "g",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "huile d'olive",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "persil",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Fruits & légumes"
      }
    ],
    "etapes": [
      "Fais cuire la polenta.",
      "Fais revenir les champignons avec l'huile.",
      "Ajoute les lentilles et la tomate.",
      "Laisse mijoter quelques minutes.",
      "Sers sur la polenta avec le persil."
    ]
  },
  {
    "id": "pd-porridge-banane-cannelle",
    "nom": "Porridge banane cannelle",
    "type": "petit-dejeuner",
    "categorie": "pancake-porridge",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 385,
    "proteines": 10,
    "glucides": 68,
    "lipides": 8,
    "tempsMinutes": 8,
    "motsCles": [
      "flocons d'avoine sans gluten",
      "lait de riz",
      "banane",
      "cannelle"
    ],
    "ingredients": [
      {
        "nom": "flocons d'avoine sans gluten",
        "quantite": 50,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "lait de riz",
        "quantite": 180,
        "unite": "ml",
        "rayon": "Épicerie"
      },
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "compote de pomme sans sucre ajouté",
        "quantite": 60,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "cannelle",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Verse les flocons d'avoine sans gluten et le lait de riz dans une casserole.",
      "Fais chauffer à feu doux en mélangeant.",
      "Ajoute la compote et la cannelle.",
      "Coupe la banane en rondelles.",
      "Sers le porridge avec la banane."
    ]
  },
  {
    "id": "pd-chia-pomme-cannelle",
    "nom": "Chia pomme cannelle",
    "type": "petit-dejeuner",
    "categorie": "chia-pudding",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 365,
    "proteines": 9,
    "glucides": 52,
    "lipides": 13,
    "tempsMinutes": 8,
    "motsCles": [
      "graines de chia",
      "lait de riz",
      "pomme",
      "sirop d'agave"
    ],
    "ingredients": [
      {
        "nom": "graines de chia",
        "quantite": 30,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "lait de riz",
        "quantite": 200,
        "unite": "ml",
        "rayon": "Épicerie"
      },
      {
        "nom": "pomme",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "sirop d'agave",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      },
      {
        "nom": "cannelle",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Mélange les graines de chia avec le lait de riz.",
      "Ajoute le sirop d'agave et la cannelle.",
      "Laisse épaissir quelques minutes ou toute la nuit.",
      "Coupe la pomme en petits dés.",
      "Ajoute la pomme avant de servir."
    ]
  },
  {
    "id": "pd-pancakes-banane-avoine",
    "nom": "Pancakes banane avoine",
    "type": "petit-dejeuner",
    "categorie": "pancake-porridge",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 410,
    "proteines": 11,
    "glucides": 72,
    "lipides": 9,
    "tempsMinutes": 15,
    "motsCles": [
      "flocons d'avoine sans gluten",
      "banane",
      "lait de riz",
      "fécule de maïs"
    ],
    "ingredients": [
      {
        "nom": "flocons d'avoine sans gluten",
        "quantite": 55,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "lait de riz",
        "quantite": 100,
        "unite": "ml",
        "rayon": "Épicerie"
      },
      {
        "nom": "fécule de maïs",
        "quantite": 15,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "levure chimique sans gluten",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Écrase la banane dans un bol.",
      "Ajoute les flocons d'avoine sans gluten, la fécule et la levure.",
      "Verse le lait de riz et mélange.",
      "Cuis des petits pancakes dans une poêle chaude.",
      "Retourne-les quand des bulles apparaissent."
    ]
  },
  {
    "id": "pd-tartines-compote-chia",
    "nom": "Tartines compote chia",
    "type": "petit-dejeuner",
    "categorie": "tartine",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 355,
    "proteines": 8,
    "glucides": 62,
    "lipides": 8,
    "tempsMinutes": 5,
    "motsCles": [
      "pain sans gluten",
      "compote de pomme",
      "graines de chia",
      "banane"
    ],
    "ingredients": [
      {
        "nom": "pain sans gluten",
        "quantite": 2,
        "unite": "tranche",
        "rayon": "Boulangerie"
      },
      {
        "nom": "compote de pomme sans sucre ajouté",
        "quantite": 100,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "graines de chia",
        "quantite": 12,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "banane",
        "quantite": 0.5,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "cannelle",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais griller les tranches de pain sans gluten.",
      "Étale la compote sur les tartines.",
      "Ajoute les graines de chia.",
      "Coupe la banane en rondelles.",
      "Ajoute la banane et la cannelle."
    ]
  },
  {
    "id": "pd-bowl-riz-souffle-pomme",
    "nom": "Bowl riz soufflé pomme",
    "type": "petit-dejeuner",
    "categorie": "bowl",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 370,
    "proteines": 8,
    "glucides": 74,
    "lipides": 6,
    "tempsMinutes": 5,
    "motsCles": [
      "riz soufflé",
      "lait de riz",
      "pomme",
      "graines de chia"
    ],
    "ingredients": [
      {
        "nom": "riz soufflé nature",
        "quantite": 45,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "lait de riz",
        "quantite": 220,
        "unite": "ml",
        "rayon": "Épicerie"
      },
      {
        "nom": "pomme",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "graines de chia",
        "quantite": 10,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "cannelle",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Verse le riz soufflé dans un bol.",
      "Ajoute le lait de riz.",
      "Coupe la pomme en dés.",
      "Ajoute la pomme et les graines de chia.",
      "Termine avec la cannelle."
    ]
  },
  {
    "id": "pd-smoothie-bowl-banane-coco",
    "nom": "Smoothie bowl banane coco",
    "type": "petit-dejeuner",
    "categorie": "smoothie",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [],
    "kcal": 390,
    "proteines": 9,
    "glucides": 66,
    "lipides": 11,
    "tempsMinutes": 7,
    "motsCles": [
      "banane",
      "lait de coco",
      "flocons d'avoine sans gluten",
      "compote de pomme"
    ],
    "ingredients": [
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "lait de coco",
        "quantite": 120,
        "unite": "ml",
        "rayon": "Épicerie"
      },
      {
        "nom": "flocons d'avoine sans gluten",
        "quantite": 35,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "compote de pomme sans sucre ajouté",
        "quantite": 80,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "graines de chia",
        "quantite": 10,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Mix la banane avec le lait de coco et la compote.",
      "Verse dans un bol.",
      "Ajoute les flocons d'avoine sans gluten.",
      "Ajoute les graines de chia.",
      "Laisse reposer quelques minutes avant de manger."
    ]
  },
  {
    "id": "pd-overnight-avoine-cacahuete",
    "nom": "Overnight avoine cacahuète",
    "type": "petit-dejeuner",
    "categorie": "overnight-oats",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "arachide"
    ],
    "kcal": 430,
    "proteines": 14,
    "glucides": 62,
    "lipides": 15,
    "tempsMinutes": 6,
    "motsCles": [
      "flocons d'avoine sans gluten",
      "lait de riz",
      "beurre de cacahuète",
      "banane"
    ],
    "ingredients": [
      {
        "nom": "flocons d'avoine sans gluten",
        "quantite": 50,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "lait de riz",
        "quantite": 170,
        "unite": "ml",
        "rayon": "Épicerie"
      },
      {
        "nom": "beurre de cacahuète",
        "quantite": 18,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "banane",
        "quantite": 0.5,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "cannelle",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Mélange les flocons d'avoine sans gluten avec le lait de riz.",
      "Ajoute le beurre de cacahuète.",
      "Mélange jusqu'à obtenir une texture homogène.",
      "Laisse reposer au frais quelques heures.",
      "Ajoute la banane en rondelles avant de servir."
    ]
  },
  {
    "id": "pd-tartines-cacahuete-banane",
    "nom": "Tartines cacahuète banane",
    "type": "petit-dejeuner",
    "categorie": "tartine",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "arachide"
    ],
    "kcal": 420,
    "proteines": 13,
    "glucides": 57,
    "lipides": 16,
    "tempsMinutes": 5,
    "motsCles": [
      "pain sans gluten",
      "beurre de cacahuète",
      "banane",
      "cannelle"
    ],
    "ingredients": [
      {
        "nom": "pain sans gluten",
        "quantite": 2,
        "unite": "tranche",
        "rayon": "Boulangerie"
      },
      {
        "nom": "beurre de cacahuète",
        "quantite": 22,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "cannelle",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Fais griller les tranches de pain sans gluten.",
      "Étale le beurre de cacahuète.",
      "Coupe la banane en rondelles.",
      "Dépose la banane sur les tartines.",
      "Ajoute une pincée de cannelle."
    ]
  },
  {
    "id": "pd-creme-tofu-choco-banane",
    "nom": "Crème tofu choco banane",
    "type": "petit-dejeuner",
    "categorie": "creme",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "soja"
    ],
    "kcal": 360,
    "proteines": 16,
    "glucides": 49,
    "lipides": 11,
    "tempsMinutes": 6,
    "motsCles": [
      "tofu soyeux",
      "banane",
      "cacao",
      "sirop d'agave"
    ],
    "ingredients": [
      {
        "nom": "tofu soyeux",
        "quantite": 180,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "banane",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "cacao non sucré",
        "quantite": 1,
        "unite": "c. à soupe",
        "rayon": "Épicerie"
      },
      {
        "nom": "sirop d'agave",
        "quantite": 1,
        "unite": "c. à café",
        "rayon": "Épicerie"
      },
      {
        "nom": "flocons d'avoine sans gluten",
        "quantite": 20,
        "unite": "g",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Mix le tofu soyeux avec la banane.",
      "Ajoute le cacao et le sirop d'agave.",
      "Mix jusqu'à obtenir une crème lisse.",
      "Verse dans un bol.",
      "Ajoute les flocons d'avoine sans gluten dessus."
    ]
  },
  {
    "id": "pd-porridge-soja-pomme",
    "nom": "Porridge soja pomme",
    "type": "petit-dejeuner",
    "categorie": "pancake-porridge",
    "gout": "sucre",
    "cuisines": [],
    "regime": [
      "vegetarien",
      "vegan",
      "sans-porc",
      "sans-gluten"
    ],
    "budget": "eco",
    "allergenes": [
      "soja"
    ],
    "kcal": 390,
    "proteines": 15,
    "glucides": 58,
    "lipides": 10,
    "tempsMinutes": 8,
    "motsCles": [
      "flocons d'avoine sans gluten",
      "lait de soja",
      "pomme",
      "cannelle"
    ],
    "ingredients": [
      {
        "nom": "flocons d'avoine sans gluten",
        "quantite": 50,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "lait de soja",
        "quantite": 200,
        "unite": "ml",
        "rayon": "Épicerie"
      },
      {
        "nom": "pomme",
        "quantite": 1,
        "unite": "piece",
        "rayon": "Fruits & légumes"
      },
      {
        "nom": "compote de pomme sans sucre ajouté",
        "quantite": 50,
        "unite": "g",
        "rayon": "Épicerie"
      },
      {
        "nom": "cannelle",
        "quantite": 1,
        "unite": "pincée",
        "rayon": "Épicerie"
      }
    ],
    "etapes": [
      "Verse les flocons d'avoine sans gluten et le lait de soja dans une casserole.",
      "Fais chauffer en mélangeant.",
      "Ajoute la compote et la cannelle.",
      "Coupe la pomme en petits dés.",
      "Ajoute la pomme au moment de servir."
    ]
  }
];

module.exports = { RECIPES };
