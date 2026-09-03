'use strict';
// ============================================================================
//  BOOST NUTRITION — le catalogue éditorial des 12 Étapes.
//
//  CE FICHIER EST UNE DONNÉE, PAS UNE RÈGLE. Il ne contient aucune logique :
//  ni protocole, ni validation, ni condition. Il transporte douze titres et
//  douze objectifs, rédigés une fois, IDENTIQUES POUR TOUS LES CLIENTS, et
//  rien d'autre. Le moteur ne le lit jamais — seule la vue client s'en sert.
//
//  ⚠️ IL NE DÉCRIT PAS DOUZE PROTOCOLES. Le dispositif n'en connaît que TROIS
//  (lib/boostSeances.js) : découverte à l'Étape 1, suivi de l'Étape 2 à 11,
//  bilan à l'Étape 12 — et le fichier y insiste : « S2 à S11 sont DIX FOIS LE
//  MÊME rendez-vous ». Ces douze textes disent donc OÙ L'ON EN EST dans le
//  parcours, jamais ce que le coach doit faire. Écrire ici un thème par Étape
//  (« l'hydratation », « le restaurant ») inventerait un parcours que le
//  dispositif ne tient pas, et personne ne s'en apercevrait avant un client.
//
//  UNE ÉTAPE EST UNE PÉRIODE, PAS UN RENDEZ-VOUS. C'est ce que dit le moteur :
//  `etapeCourante = etapesValidees + 1`, et valider la séance N valide l'Étape
//  N — à sa fin. L'Étape 1 se clôt par le rendez-vous de découverte, qui pose
//  la première action ; c'est pendant l'Étape 2 qu'on la met en place. Les
//  textes ci-dessous sont écrits dans ce sens-là, et le relire avant d'y
//  toucher évite de les décaler tous d'un cran.
//
//  TROIS RÈGLES DU DISPOSITIF QUE CES TEXTES NE DOIVENT JAMAIS CONTREDIRE :
//   1. UNE SEULE ACTION ACTIVE à la fois (boost_actions, statut `active`) ;
//   2. l'échéance se dit « jusqu'au prochain rendez-vous » — 12 Étapes sur 16
//      semaines ne font pas une semaine chacune, et l'écran coach le dit déjà
//      ainsi ;
//   3. AUCUN JUGEMENT. Les trois résultats d'une action (réalisée, partielle,
//      non réalisée) ne sont pas des notes : « on constate pour adapter la
//      suite, on ne juge pas le client ».
//  Et au bilan, TROIS règles personnelles au maximum (REGLES_AUTONOMIE_MAX).
// ============================================================================

const ETAPES_BOOST = [
  { numero: 1, titre: 'Faire le point',
    objectif: 'Comprendre ta situation actuelle, tes habitudes et définir la première priorité sur laquelle agir.' },
  { numero: 2, titre: 'Passer à l\'action',
    objectif: 'Mettre en place une première action simple et réaliste jusqu\'au prochain rendez-vous.' },
  { numero: 3, titre: 'Installer une première habitude',
    objectif: 'Répéter ce qui fonctionne suffisamment longtemps pour que cela devienne plus naturel.' },
  { numero: 4, titre: 'Observer les premiers changements',
    objectif: 'Faire le point sur ce qui progresse, ce qui reste difficile et ce que tu arrives déjà à faire plus facilement.' },
  { numero: 5, titre: 'Ajuster ce qui bloque',
    objectif: 'Conserver ce qui fonctionne et adapter ce qui est trop difficile à tenir dans ton quotidien.' },
  { numero: 6, titre: 'Faire le bilan à mi-parcours',
    objectif: 'Prendre du recul sur les changements obtenus depuis le début et identifier la priorité pour la suite.' },
  { numero: 7, titre: 'Adapter à ton quotidien',
    objectif: 'Trouver une solution qui fonctionne réellement avec ton travail, ta famille, tes sorties et tes contraintes.' },
  { numero: 8, titre: 'Consolider tes habitudes',
    objectif: 'Continuer à avancer sans multiplier les changements : une priorité à la fois jusqu\'à ce qu\'elle soit suffisamment solide.' },
  { numero: 9, titre: 'Gérer les situations moins faciles',
    objectif: 'Apprendre à conserver tes repères même lorsque ton quotidien change ou que tout ne se passe pas comme prévu.' },
  { numero: 10, titre: 'Construire ton autonomie',
    objectif: 'Commencer à prendre les bonnes décisions sans avoir besoin de suivre parfaitement un plan.' },
  { numero: 11, titre: 'Préparer l\'après-Boost',
    objectif: 'Identifier les habitudes essentielles que tu veux conserver durablement après l\'accompagnement.' },
  { numero: 12, titre: 'Faire ton bilan',
    objectif: 'Mesurer le chemin parcouru, identifier ce que tu as appris et repartir avec trois règles personnelles simples à conserver.' },
];

// Lecture par numéro. Renvoie `null` hors des bornes plutôt qu'un objet vide :
// un appelant qui reçoit `{}` afficherait un titre blanc sans s'en apercevoir.
const etapeDe = (numero) => ETAPES_BOOST.find((e) => e.numero === Number(numero)) || null;

module.exports = { ETAPES_BOOST, etapeDe };
