'use strict';
/* ============================================================================
   My Coach Nutrition v2 — guides PDF de l'onglet « Bonus ».
   Fichiers : PDF dans data/guides/<slug>.pdf (servis par /api/guides, code
   studio exigé), couverture dans public/guides/<slug>.jpg.

   AJOUTER UN GUIDE :
     1. déposer le PDF dans data/guides/ et sa couverture (1re page, ~640 px de
        large) dans public/guides/, sous le même nom (slug) ;
     2. ajouter une ligne ci-dessous.
   category : mindset | nutrition | coaching
   day : jour conseillé du challenge, sert uniquement à l'ordre d'affichage
   (tous les guides sont accessibles dès le départ).
   ========================================================================== */

const GUIDES = [
  { slug: "mon-carnet-de-victoires-6-semaines-de-preuves", title: "Mon carnet de victoires", subtitle: "Mon carnet de victoires - 6 semaines de preuves", category: 'mindset', day: 1, pages: 8 },
  { slug: "3-seances-de-40-min-suffisent", title: "« Je n'ai pas le temps »", subtitle: "3 séances de 40 min suffisent", category: 'mindset', day: 1, pages: 7 },
  { slug: "1-h-le-dimanche-4-repas-prets", title: "Le batch cooking du dimanche", subtitle: "1 h le dimanche, 4 repas prêts", category: 'nutrition', day: 1, pages: 7 },
  { slug: "reprendre-le-sport-sans-peur-ni-blessure", title: "Je reprends le sport après longtemps", subtitle: "Reprendre le sport sans peur ni blessure", category: 'coaching', day: 3, pages: 7 },
  { slug: "dejouer-les-pieges-du-supermarche", title: "Les courses malignes", subtitle: "Déjouer les pièges du supermarché", category: 'nutrition', day: 5, pages: 7 },
  { slug: "l-eau-ton-carburant-oublie", title: "Le guide hydratation & énergie", subtitle: "L'eau, ton carburant oublié", category: 'nutrition', day: 7, pages: 7 },
  { slug: "le-corps-suit-la-tete", title: "Le mindset de ceux qui réussissent", subtitle: "Le corps suit la tête", category: 'mindset', day: 9, pages: 7 },
  { slug: "ta-main-est-ta-balance", title: "Le guide des portions sans balance", subtitle: "Ta main est ta balance", category: 'nutrition', day: 11, pages: 7 },
  { slug: "la-marche-l-outil-le-plus-sous-cote", title: "Marcher pour maigrir", subtitle: "La marche, l'outil le plus sous-coté", category: 'coaching', day: 13, pages: 7 },
  { slug: "le-recto-vend-le-verso-dit-vrai", title: "Lire les étiquettes sans se faire avoir", subtitle: "Le recto vend, le verso dit vrai", category: 'nutrition', day: 15, pages: 7 },
  { slug: "pourquoi-le-poids-bouge-et-c-est-normal", title: "La balance : comprendre sans paniquer", subtitle: "Pourquoi le poids bouge (et c'est normal)", category: 'coaching', day: 17, pages: 7 },
  { slug: "garder-l-apero-changer-le-verre", title: "L'apéro intelligent", subtitle: "Garder l'apéro, changer le verre", category: 'nutrition', day: 19, pages: 7 },
  { slug: "commander-malin-au-resto", title: "Manger au resto sans dérailler", subtitle: "Commander malin au resto", category: 'nutrition', day: 21, pages: 7 },
  { slug: "special-femmes-comprendre-ton-cycle", title: "Spécial femmes : cycle, poids & énergie", subtitle: "Spécial femmes - comprendre ton cycle", category: 'coaching', day: 23, pages: 7 },
  { slug: "l-action-cree-l-envie", title: "La motivation : tenir quand on n'a pas envie", subtitle: "L'action crée l'envie", category: 'mindset', day: 25, pages: 7 },
  { slug: "decrocher-du-sucre-en-douceur", title: "Moins de sucre sans frustration", subtitle: "Décrocher du sucre en douceur", category: 'nutrition', day: 27, pages: 7 },
  { slug: "renfo-maison-le-salon-suffit", title: "Le renfo à la maison sans matériel", subtitle: "Renfo maison - le salon suffit", category: 'coaching', day: 29, pages: 7 },
  { slug: "le-plateau-signe-que-ca-travaille", title: "Je stagne, quoi faire ?", subtitle: "Le plateau, signe que ça travaille", category: 'coaching', day: 31, pages: 7 },
  { slug: "un-ecart-n-est-pas-un-echec-rebondir-en-24-h", title: "« J'ai craqué, et alors ? »", subtitle: "Un écart n'est pas un échec - rebondir en 24 h", category: 'mindset', day: 33, pages: 7 },
  { slug: "fast-food-600-kcal-au-lieu-de-1-800", title: "Fast-food & livraison décodés", subtitle: "Fast-food - 600 kcal au lieu de 1 800", category: 'nutrition', day: 35, pages: 7 },
  { slug: "sommeil-et-stress-le-levier-invisible", title: "Sommeil, stress & perte de poids", subtitle: "Sommeil et stress, le levier invisible", category: 'mindset', day: 37, pages: 7 },
  { slug: "alcool-moins-de-verres-mieux-savoures", title: "L'alcool & ta transformation", subtitle: "Alcool - moins de verres, mieux savourés", category: 'nutrition', day: 39, pages: 7 },
  { slug: "ventre-plus-plat-le-plan-sur-4-fronts", title: "Objectif ventre plus plat", subtitle: "Ventre plus plat - le plan sur 4 fronts", category: 'coaching', day: 41, pages: 7 },
  { slug: "apres-le-challenge-transformer-l-essai", title: "Après le challenge : maintenir", subtitle: "Après le challenge - transformer l'essai", category: 'mindset', day: 42, pages: 7 },
];
