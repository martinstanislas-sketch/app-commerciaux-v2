'use strict';
// ============================================================================
//  MY COACH ACADEMY — « Cycle menstruel & entraînement ».
//
//  CE FICHIER EST UNE DONNÉE, PAS UNE RÈGLE. Aucun tirage, aucune correction,
//  aucun seuil appliqué : dix modules, dix vidéos, cinquante questions de
//  mini-QCM et vingt questions finales. Le moteur reste celui de Coach
//  Nutrition, à la lettre.
//
//  DIX BANQUES MINI STRICTEMENT DISTINCTES, une par module, rattachées à leur
//  `module_id`. Le mini du module N ne tire que dans les questions de N : ce
//  n'est pas une convention de nommage mais une colonne, et une colonne se
//  filtre. La banque FINALE, elle, ne porte aucun module — elle est
//  transversale, et `usage='finale'` l'empêche d'entrer dans un mini comme il
//  empêche un mini d'entrer dans la certification.
//
//  ⚠️ CONTRAIREMENT À COACH NUTRITION, TOUS LES MODULES ONT UN MINI-QCM — le
//  dixième compris. Le parcours demandé est M1 → mini M1 → M2 … → M10 → mini
//  M10 → QCM final. Là-bas le dernier module en était dépourvu et se franchissait
//  dès ses contenus terminés ; ici la dernière porte avant la certification
//  théorique est un mini. C'est la séquence qu'éprouve academyCycleMenstruel.test.js.
//
//  ⚠️ CINQ QUESTIONS PAR BANQUE MINI, CINQ TIRÉES. Le tirage est donc total :
//  repasser un mini raté represente les mêmes cinq questions, corrigé affiché
//  juste avant. C'est le comportement de Coach Nutrition, assumé pour cette V1
//  — élargir les banques suffira à y remédier, sans toucher au moteur.
//
//  Les vingt questions finales sont reprises TELLES QUELLES du document source,
//  y compris l'ordre A/B/C/D. L'ordre d'affichage est retiré au hasard par le
//  moteur à chaque tentative ; celui-ci n'est que l'ordre de saisie.
//
//  Chaque question n'admet QU'UNE seule bonne réponse (1 dans le couple). La
//  règle du tout-ou-rien du moteur reste en vigueur, elle ne s'applique
//  simplement à aucune question d'ici.
// ============================================================================

// La formation elle-même. `refletBoost` n'y figure pas : il vaut 0 pour toute
// formation nouvelle et le moteur refuse de l'accorder par une saisie. Être
// certifié ici n'ouvre donc AUCUN dossier client du Boost Nutrition.
const FORMATION = {
  cle: 'cycle_menstruel',
  libelle: 'Cycle menstruel & entraînement : comprendre, démystifier et adapter',
  titre: 'Cycle menstruel & entraînement',
  description: 'Comprendre le cycle menstruel et son impact sur l’entraînement, dépasser les idées reçues et mieux accompagner chaque cliente. L’objectif est de savoir questionner, observer et adapter l’entraînement de façon individualisée, tout en respectant les limites du rôle du coach sportif.',
  ordre: 2,
  // ÉVALUATION PRATIQUE EXIGÉE. Le parcours est contenus -> mini -> QCM final
  // -> Terrain -> certification. Six cas pratiques (voir CAS plus bas) sont
  // proposés à l'évaluateur ; sans ce drapeau, ils ne seraient jamais montrés.
  pratiqueObligatoire: true,
  certificationActive: true,
};

const MODULES = [
  {
    ordre: 1,
    prefixe: 'cm-m01',
    titre: 'Comprendre le cycle menstruel',
    description: 'Acquérir les bases indispensables pour comprendre le cycle menstruel, ses différentes phases, les principales hormones impliquées et la variabilité d’une femme à l’autre.',
    youtubeId: 'oVYDQJH0xMA',
    questions: [
      {
        enonce: 'Deux clientes suivent le même programme et se disent toutes les deux « en début de cycle ». L’une se sent en forme, l’autre est très fatiguée. Comment interpréter cet écart ?',
        choix: [
          ['L’une des deux se trompe sur son cycle', 0],
          ['La variabilité entre les femmes est normale : un même moment du cycle ne se vit pas de la même façon', 1],
          ['Celle qui est fatiguée manque d’entraînement', 0],
          ['Leurs hormones doivent être identiques, l’écart vient donc du sommeil', 0],
        ],
      },
      {
        enonce: 'Une cliente te demande si son cycle « dure forcément 28 jours ». Que lui réponds-tu ?',
        choix: [
          ['Oui, c’est la durée physiologique normale', 0],
          ['Non, la durée varie d’une femme à l’autre et parfois d’un cycle à l’autre', 1],
          ['Oui, sauf en cas de pratique sportive intense', 0],
          ['Non, mais un cycle plus court est toujours un problème', 0],
        ],
      },
      {
        enonce: 'Quelle formulation décrit le mieux le rôle des hormones au cours du cycle, pour un coach sportif ?',
        choix: [
          ['Elles fixent à l’avance le niveau de performance de chaque séance', 0],
          ['Elles varient au cours du cycle et font partie du contexte, sans déterminer à elles seules l’état du jour', 1],
          ['Elles n’ont aucun effet mesurable sur l’organisme', 0],
          ['Elles permettent de calculer la charge d’entraînement optimale', 0],
        ],
      },
      {
        enonce: 'Une cliente t’indique le jour de son cycle. Qu’est-ce que cette seule information te permet de savoir de façon fiable ?',
        choix: [
          ['Son niveau hormonal du moment', 0],
          ['Sa capacité de performance du jour', 0],
          ['Rien de précis à elle seule : elle situe un repère, elle ne décrit pas son état', 1],
          ['Le moment où elle sera le plus à risque de blessure', 0],
        ],
      },
      {
        enonce: 'Pourquoi un coach a-t-il intérêt à connaître les grandes phases du cycle ?',
        choix: [
          ['Pour programmer chaque séance en fonction de la phase', 0],
          ['Pour comprendre ce que sa cliente décrit et poser de meilleures questions', 1],
          ['Pour prévoir les performances des semaines à venir', 0],
          ['Pour déterminer quand il faut réduire les charges', 0],
        ],
      },
    ],
  },

  {
    ordre: 2,
    prefixe: 'cm-m02',
    titre: 'Les grandes idées reçues sur le cycle et le sport',
    description: 'Savoir prendre du recul face aux affirmations simplistes sur le cycle et l’entraînement et distinguer ce qui est faux, ce qui est démontré et ce qui doit être fortement nuancé.',
    youtubeId: 'st33mKVV7A0',
    questions: [
      {
        enonce: 'Un confrère affirme : « Une femme est forcément moins performante pendant ses règles. » Comment situer cette affirmation ?',
        choix: [
          ['Vraie : c’est une règle générale bien établie', 0],
          ['Fausse comme règle générale : certaines femmes le vivent ainsi, beaucoup non', 1],
          ['Vraie uniquement pour les sports de force', 0],
          ['À nuancer : c’est vrai environ une fois sur deux', 0],
        ],
      },
      {
        enonce: 'Une cliente a entendu qu’il « ne faut pas faire de musculation pendant les règles ». Que lui réponds-tu ?',
        choix: [
          ['C’est exact, mieux vaut privilégier le cardio léger', 0],
          ['C’est faux : rien n’impose d’arrêter la musculation, c’est son état du jour qui guide la séance', 1],
          ['C’est exact seulement pour les charges lourdes', 0],
          ['C’est faux, mais il faut tout de même réduire les charges par précaution', 0],
        ],
      },
      {
        enonce: 'Comment situer l’affirmation « il faut programmer systématiquement l’entraînement selon les phases du cycle » ?',
        choix: [
          ['Démontrée : c’est la méthode de référence', 0],
          ['Fortement à nuancer : la programmation par phases ne s’impose pas comme une règle générale', 1],
          ['Fausse : le cycle n’a aucun intérêt pour un coach', 0],
          ['Vraie pour les femmes sous contraception hormonale', 0],
        ],
      },
      {
        enonce: 'On te dit que « le risque de blessure explose à certaines phases du cycle ». Quelle est la position la plus juste ?',
        choix: [
          ['C’est démontré et cela justifie d’alléger ces séances', 0],
          ['Ce n’est pas démontré comme une règle applicable à chaque cliente', 1],
          ['C’est vrai uniquement pendant les règles', 0],
          ['C’est vrai, mais seulement pour les sports collectifs', 0],
        ],
      },
      {
        enonce: 'Une hypothèse biologique paraît logique mais n’a pas été démontrée chez les clientes que tu accompagnes. Comment l’utiliser ?',
        choix: [
          ['Comme une preuve suffisante pour adapter les séances', 0],
          ['Comme une piste de réflexion, en distinguant plausibilité biologique et preuve : le cycle donne du contexte, la cliente guide la décision', 1],
          ['Il faut l’ignorer complètement', 0],
          ['Il faut l’appliquer à toutes les clientes pour observer ce que ça donne', 0],
        ],
      },
    ],
  },

  {
    ordre: 3,
    prefixe: 'cm-m03',
    titre: 'Cycle menstruel, science et performance',
    description: 'Comprendre ce que la recherche permet réellement d’affirmer concernant force, endurance, puissance et récupération et éviter de transformer des moyennes scientifiques en prédictions individuelles.',
    youtubeId: 'OCB0GWxDQ9I',
    questions: [
      {
        enonce: 'Une étude rapporte une baisse moyenne de performance à une phase donnée. Que peux-tu en conclure pour ta cliente ?',
        choix: [
          ['Qu’elle sera moins performante à cette phase', 0],
          ['Rien de certain : une moyenne ne prédit pas la réponse d’une personne en particulier', 1],
          ['Qu’il faut réduire ses charges à cette phase', 0],
          ['Qu’elle devra s’entraîner à une autre période', 0],
        ],
      },
      {
        enonce: 'Comment décrire l’ampleur des différences moyennes de performance observées au cours du cycle ?',
        choix: [
          ['Très importantes et constantes', 0],
          ['Généralement faibles, et variables d’une personne à l’autre', 1],
          ['Nulles : aucune différence n’a jamais été observée', 0],
          ['Importantes en endurance, nulles en force', 0],
        ],
      },
      {
        enonce: 'Une étude portant sur douze sportives conclut à un avantage de performance à une phase donnée. Comment utiliser ce résultat avec tes clientes ?',
        choix: [
          ['L’appliquer : c’est une donnée scientifique publiée', 0],
          ['Avec prudence : un effectif réduit et un protocole particulier ne suffisent pas à en faire une règle transférable à chaque cliente', 1],
          ['L’ignorer : les études sur le cycle n’ont aucune valeur', 0],
          ['L’appliquer uniquement aux clientes ayant un cycle naturel', 0],
        ],
      },
      {
        enonce: 'Une cliente lit un article annonçant « la méthode d’entraînement optimale selon le cycle ». Quelle réaction est la plus professionnelle ?',
        choix: [
          ['Adopter la méthode : elle est fondée scientifiquement', 0],
          ['Expliquer que les données actuelles ne permettent pas d’en faire une règle, et continuer à s’appuyer sur son ressenti et ses performances', 1],
          ['Lui dire que la science ne sert à rien en entraînement', 0],
          ['Tester la méthode sur toutes tes clientes pour comparer', 0],
        ],
      },
      {
        enonce: 'Quelle place la science doit-elle occuper dans ta décision de coach ?',
        choix: [
          ['Elle remplace l’observation de la cliente', 0],
          ['Elle éclaire le contexte ; l’état réel de la cliente reste ce qui décide', 1],
          ['Elle n’a aucune place dans le travail de terrain', 0],
          ['Elle permet de prédire les performances à venir', 0],
        ],
      },
    ],
  },

  {
    ordre: 4,
    prefixe: 'cm-m04',
    titre: 'Questionner et observer avant d’adapter',
    description: 'Savoir recueillir les informations réellement utiles, observer l’échauffement et les premières séries et décider seulement ensuite s’il est nécessaire d’adapter la séance.',
    youtubeId: 'b6p0gpx6wqo',
    questions: [
      {
        enonce: 'Quel est l’ordre de raisonnement enseigné dans ce module ?',
        choix: [
          ['Adapter, puis questionner et observer', 0],
          ['Questionner, observer, tester, comparer, décider', 1],
          ['Décider, tester, puis ajuster si besoin', 0],
          ['Observer, adapter, puis vérifier au prochain rendez-vous', 0],
        ],
      },
      {
        enonce: 'Une cliente arrive et mentionne qu’elle a ses règles. Quelle est la première chose à faire ?',
        choix: [
          ['Modifier la séance avant l’échauffement', 0],
          ['Lui demander comment elle se sent, puis observer l’échauffement', 1],
          ['Lui proposer d’écourter la séance', 0],
          ['Remplacer les exercices lourds par du cardio', 0],
        ],
      },
      {
        enonce: 'À quoi sert précisément l’observation de l’échauffement et des premières séries ?',
        choix: [
          ['À occuper le début de séance pendant que la cliente se motive', 0],
          ['À tester l’état réel du jour avant de décider s’il faut adapter', 1],
          ['À valider que le programme est bon', 0],
          ['À déterminer la phase du cycle', 0],
        ],
      },
      {
        enonce: 'Une cliente annonce qu’elle est fatiguée, mais son échauffement est normal et sa charge habituelle reste maîtrisée. Que fais-tu ?',
        choix: [
          ['Tu réduis les charges puisqu’elle l’a annoncé', 0],
          ['Tu maintiens une séance proche du prévu en continuant d’observer', 1],
          ['Tu arrêtes la séance par précaution', 0],
          ['Tu remplaces la séance par de la mobilité', 0],
        ],
      },
      {
        enonce: 'Que veut dire « comparer » dans cette démarche ?',
        choix: [
          ['Comparer la cliente aux autres clientes du même niveau', 0],
          ['Comparer ce qu’elle fait aujourd’hui à ce qu’elle fait habituellement', 1],
          ['Comparer ses résultats aux moyennes des études', 0],
          ['Comparer ses performances d’un cycle à l’autre uniquement', 0],
        ],
      },
    ],
  },

  {
    ordre: 5,
    prefixe: 'cm-m05',
    titre: 'Adapter l’entraînement selon l’état réel de la cliente',
    description: 'Savoir tenir compte des symptômes réellement vécus : douleur, fatigue, sommeil, maux de tête, inconfort digestif, énergie et état global, sans appliquer de règle automatique basée sur le cycle.',
    youtubeId: 'a4Zy3rTwBOU',
    questions: [
      {
        enonce: 'Sur quoi repose la décision d’adapter une séance ?',
        choix: [
          ['Sur le jour du cycle', 0],
          ['Sur l’état réel de la cliente le jour même : douleur, fatigue, sommeil, énergie, état global', 1],
          ['Sur la moyenne de ses performances du mois', 0],
          ['Sur la phase annoncée par son application de suivi', 0],
        ],
      },
      {
        enonce: 'Une cliente a très mal dormi et se dit vidée, alors qu’elle n’a pas ses règles. Faut-il adapter ?',
        choix: [
          ['Non, puisque ce n’est pas lié au cycle', 0],
          ['Oui : c’est l’état réel qui compte, quelle qu’en soit la cause', 1],
          ['Non, il faut maintenir le programme prévu', 0],
          ['Oui, mais uniquement en réduisant le cardio', 0],
        ],
      },
      {
        enonce: 'Une cliente ressent des crampes qui gênent uniquement un exercice, les autres passent bien. Quelle est l’approche la plus pertinente ?',
        choix: [
          ['Alléger toute la séance', 0],
          ['Adapter ou remplacer cet exercice et conserver ce qui est bien toléré', 1],
          ['Annuler la séance', 0],
          ['Poursuivre sans rien changer', 0],
        ],
      },
      {
        enonce: 'Pourquoi ne pas appliquer une règle automatique du type « règles = séance allégée » ?',
        choix: [
          ['Parce que cela ferait perdre du temps', 0],
          ['Parce que cela décide à la place de la cliente, alors que son état du jour peut être tout à fait normal', 1],
          ['Parce que les règles n’ont aucun effet possible', 0],
          ['Parce qu’il vaut mieux alléger la séance suivante', 0],
        ],
      },
      {
        enonce: 'Une cliente signale un inconfort digestif marqué avant la séance. Quelle attitude est la plus adaptée ?',
        choix: [
          ['Ignorer, ce n’est pas du ressort du coach', 0],
          ['En tenir compte dans le choix des exercices et de l’intensité, puis observer comment elle réagit', 1],
          ['Annuler systématiquement la séance', 0],
          ['Lui proposer un complément alimentaire', 0],
        ],
      },
    ],
  },

  {
    ordre: 6,
    prefixe: 'cm-m06',
    titre: 'Contraception hormonale : ce que le coach doit comprendre',
    description: 'Comprendre qu’un cycle naturel et une contraception hormonale ne doivent pas être interprétés avec le même modèle, sans sortir du champ de compétence du coach.',
    youtubeId: 'V-yvju8fQMk',
    questions: [
      {
        enonce: 'Une cliente sous contraception hormonale te donne « son jour de cycle ». Comment l’interpréter ?',
        choix: [
          ['Comme pour un cycle naturel', 0],
          ['Avec prudence : les deux situations ne s’interprètent pas avec le même modèle', 1],
          ['Comme une information sans aucun intérêt', 0],
          ['Comme une indication fiable de son niveau hormonal', 0],
        ],
      },
      {
        enonce: 'Une cliente dit se sentir plus fatiguée depuis qu’elle a changé de contraception. Quelle réponse correspond à ton rôle ?',
        choix: [
          ['« Cette contraception ne doit pas te convenir. »', 0],
          ['« Arrête-la quelques jours pour voir ce que ça donne. »', 0],
          ['« On va tenir compte de ta fatigue dans l’entraînement et, si cela t’inquiète, tu peux en parler à ton professionnel de santé. »', 1],
          ['« C’est forcément hormonal, ça va passer. »', 0],
        ],
      },
      {
        enonce: 'Sur quoi t’appuies-tu pour ajuster l’entraînement d’une cliente sous contraception hormonale ?',
        choix: [
          ['Sur le calendrier de sa plaquette', 0],
          ['Sur son ressenti et ses performances observées', 1],
          ['Sur le type de contraception qu’elle utilise', 0],
          ['Sur les recommandations générales pour cycle naturel', 0],
        ],
      },
      {
        enonce: 'Une cliente te demande quelle contraception serait la mieux adaptée à sa pratique sportive. Que fais-tu ?',
        choix: [
          ['Tu lui donnes ton avis en te basant sur tes autres clientes', 0],
          ['Tu expliques que cela ne relève pas de ton rôle et l’orientes vers un professionnel de santé', 1],
          ['Tu lui conseilles celle qui perturbe le moins l’entraînement', 0],
          ['Tu lui proposes d’essayer et d’observer les résultats', 0],
        ],
      },
      {
        enonce: 'Quelle erreur ce module invite-t-il à éviter en priorité ?',
        choix: [
          ['Poser des questions sur le ressenti', 0],
          ['Plaquer le modèle du cycle naturel sur une cliente sous contraception hormonale', 1],
          ['Adapter une séance à la fatigue', 0],
          ['Noter les observations d’une séance à l’autre', 0],
        ],
      },
    ],
  },

  {
    ordre: 7,
    prefixe: 'cm-m07',
    titre: 'Poser les bonnes questions sans dépasser son rôle',
    description: 'Savoir parler du cycle naturellement et professionnellement, poser uniquement les questions utiles à l’entraînement, respecter l’intimité de la cliente et ne jamais transformer l’échange en interrogatoire médical.',
    youtubeId: '5k6IFrUHSUI',
    questions: [
      {
        enonce: 'Avant de poser une question qui touche à l’intime, quel critère doit te guider ?',
        choix: [
          ['Obtenir le maximum d’informations sur la cliente', 0],
          ['Se demander si la réponse changera réellement quelque chose à l’accompagnement', 1],
          ['Poser exactement les mêmes questions à toutes les clientes', 0],
          ['Vérifier que la cliente connaît bien son cycle', 0],
        ],
      },
      {
        enonce: 'Quelle question est la plus utile lorsqu’une cliente évoque son cycle ?',
        choix: [
          ['« À quel jour exact de ton cycle es-tu ? »', 0],
          ['« Comment tu te sens aujourd’hui ? »', 1],
          ['« Quelle est la durée exacte de tes règles ? »', 0],
          ['« Quelle contraception utilises-tu ? »', 0],
        ],
      },
      {
        enonce: 'Une cliente ne souhaite pas parler de son cycle. Quelle attitude est la bonne ?',
        choix: [
          ['Insister, car l’information est nécessaire à la programmation', 0],
          ['Respecter son choix et continuer à travailler à partir de son ressenti et de ce que tu observes', 1],
          ['Lui expliquer qu’elle ne pourra pas progresser sans cette information', 0],
          ['Lui demander de le noter dans une application et de te l’envoyer', 0],
        ],
      },
      {
        enonce: 'Comment aborder le sujet pour la première fois avec une cliente ?',
        choix: [
          ['En posant une série de questions détaillées dès le premier rendez-vous', 0],
          ['Naturellement et simplement, en expliquant que c’est pour mieux adapter les séances, sans obligation de répondre', 1],
          ['En attendant qu’elle en parle spontanément, quoi qu’il arrive', 0],
          ['En lui faisant remplir un questionnaire médical', 0],
        ],
      },
      {
        enonce: 'Qu’est-ce qui distingue une question professionnelle d’un interrogatoire médical ?',
        choix: [
          ['La question professionnelle sert la décision d’entraînement ; l’interrogatoire cherche à comprendre une cause médicale', 1],
          ['Il n’y a pas de différence, seul le ton change', 0],
          ['La question professionnelle est posée par écrit', 0],
          ['L’interrogatoire médical est plus complet, donc préférable', 0],
        ],
      },
    ],
  },

  {
    ordre: 8,
    prefixe: 'cm-m08',
    titre: 'Suivre les symptômes et construire des repères',
    description: 'Savoir décider concrètement quoi modifier dans une séance selon l’état du jour, l’objectif, les symptômes et les capacités observées.',
    youtubeId: 'hl9NX5pnoTM',
    questions: [
      {
        enonce: 'Quel enchaînement décrit la bonne pratique une fois une adaptation décidée ?',
        choix: [
          ['Adapter, puis conserver l’adaptation pour les séances suivantes', 0],
          ['Adapter, retester, réévaluer', 1],
          ['Adapter, puis passer à l’exercice suivant', 0],
          ['Adapter, noter, et attendre le prochain cycle', 0],
        ],
      },
      {
        enonce: 'Une cliente réalise correctement ses séries mais récupère moins vite que d’habitude. Quel levier tester en premier ?',
        choix: [
          ['Augmenter les temps de récupération', 1],
          ['Diviser toutes les charges par deux', 0],
          ['Arrêter la séance', 0],
          ['Changer entièrement le programme', 0],
        ],
      },
      {
        enonce: 'Quelle est la différence entre réduire le volume et réduire l’intensité ?',
        choix: [
          ['Il n’y en a aucune en pratique', 0],
          ['Réduire le volume diminue la quantité de travail ; réduire l’intensité diminue notamment la charge ou la difficulté', 1],
          ['Le volume ne concerne que le cardio', 0],
          ['L’intensité correspond au nombre de séries', 0],
        ],
      },
      {
        // La charge est TENUE : l'intensité n'est pas en cause, c'est la
        // quantité de travail qui l'est. Le module demande de choisir LE levier
        // à partir de ce qu'on observe, pas d'en réciter la liste.
        enonce: 'Ta cliente vise la force. Elle maîtrise sa charge habituelle sur les premières séries, mais la qualité d’exécution se dégrade nettement sur les dernières séries prévues. Quel levier est le plus adapté ?',
        choix: [
          ['Réduire l’intensité en baissant la charge dès la première série', 0],
          ['Réduire le volume en retirant les dernières séries et conserver la charge', 1],
          ['Arrêter la séance', 0],
          ['Remplacer l’exercice par un autre mouvement', 0],
        ],
      },
      {
        enonce: 'Une adaptation testée ne donne rien de mieux. Que fais-tu ?',
        choix: [
          ['Tu la conserves quand même, elle finira par fonctionner', 0],
          ['Tu réévalues et tu essaies un autre levier, ou tu arrêtes si l’état ne le permet pas', 1],
          ['Tu reprends la séance initiale sans changement', 0],
          ['Tu reportes toute décision au prochain rendez-vous', 0],
        ],
      },
    ],
  },

  {
    ordre: 9,
    prefixe: 'cm-m09',
    titre: 'Comprendre les tendances individuelles sans créer de règles',
    description: 'Utiliser l’historique de la cliente pour identifier des tendances personnelles sans les transformer en prédictions automatiques.',
    youtubeId: 'V36YDDSBnHQ',
    questions: [
      {
        enonce: 'Quel principe résume l’usage de l’historique d’une cliente ?',
        choix: [
          ['Comparer Julie aux autres clientes du même âge', 0],
          ['Comparer Julie à Julie', 1],
          ['Comparer Julie aux moyennes publiées', 0],
          ['Comparer Julie à son objectif de départ', 0],
        ],
      },
      {
        enonce: 'Une cliente montre régulièrement plus de fatigue au début de ses règles. Comment utiliser cette tendance ?',
        choix: [
          ['Programmer d’office une séance légère à ce moment-là', 0],
          ['Poser une meilleure question à l’arrivée, puis vérifier son état du jour', 1],
          ['Lui annoncer qu’elle sera fatiguée', 0],
          ['Réduire ses charges avant même qu’elle arrive', 0],
        ],
      },
      {
        enonce: 'Comment se répartissent les rôles entre l’historique et l’état du jour ?',
        choix: [
          ['L’historique décide, l’état du jour confirme', 0],
          ['L’historique améliore la question, l’état du jour donne la décision', 1],
          ['L’état du jour ne sert que si l’historique manque', 0],
          ['Les deux se valent et l’on choisit au cas par cas', 0],
        ],
      },
      {
        enonce: 'Après combien d’observations peut-on parler de tendance ?',
        choix: [
          ['Dès la première séance concernée', 0],
          ['Pas après une observation isolée : il faut que le constat se répète', 1],
          ['Après exactement trois cycles', 0],
          ['Dès que la cliente le dit elle-même', 0],
        ],
      },
      {
        enonce: 'Quel risque y a-t-il à transformer une tendance en règle automatique ?',
        choix: [
          ['Aucun, cela fait gagner du temps', 0],
          ['Décider à la place de la cliente et passer à côté d’une journée où elle va très bien', 1],
          ['Rendre le suivi trop précis', 0],
          ['Compliquer inutilement la programmation', 0],
        ],
      },
    ],
  },

  {
    ordre: 10,
    prefixe: 'cm-m10',
    titre: 'Reconnaître les limites de son rôle et savoir orienter',
    description: 'Reconnaître les situations qui dépassent l’adaptation sportive et nécessitent éventuellement l’arrêt de la séance et/ou l’orientation vers un professionnel de santé.',
    youtubeId: 'Ey5h5Mng7K4',
    questions: [
      {
        enonce: 'Parmi ces actions, laquelle un coach sportif ne peut PAS faire ?',
        choix: [
          ['Écouter et observer', 0],
          ['Adapter ou arrêter une séance', 0],
          ['Diagnostiquer la cause d’un symptôme', 1],
          ['Orienter vers un professionnel de santé', 0],
        ],
      },
      {
        enonce: 'Une cliente présente une douleur beaucoup plus forte que d’habitude, qui s’aggrave à l’effort. Quelle attitude est la plus appropriée ?',
        choix: [
          ['Chercher plusieurs exercices de remplacement jusqu’à en trouver un qui passe', 0],
          ['Lui expliquer que les règles peuvent être douloureuses et poursuivre', 0],
          ['Ne pas forcer et envisager une orientation vers un professionnel de santé', 1],
          ['Réduire les charges de 20 % et continuer', 0],
        ],
      },
      {
        enonce: 'Quels signaux doivent alerter et faire envisager une orientation ?',
        choix: [
          ['Un symptôme très important, inhabituel, persistant, en aggravation ou qui limite fortement l’entraînement', 1],
          ['Tout symptôme mentionné par la cliente, quel qu’il soit', 0],
          ['Uniquement une douleur pendant les règles', 0],
          ['Uniquement une baisse de performance sur plusieurs séances', 0],
        ],
      },
      {
        enonce: 'Une cliente explique qu’elle n’a plus ses règles depuis plusieurs mois. Que fais-tu ?',
        choix: [
          ['Tu lui expliques que c’est fréquent quand on fait beaucoup de sport', 0],
          ['Tu cherches à déterminer si elle est en déficit énergétique', 0],
          ['Tu lui conseilles d’en parler à un professionnel de santé, sans chercher à en identifier la cause', 1],
          ['Tu modifies son programme pour que ses règles reviennent', 0],
        ],
      },
      {
        enonce: 'Une cliente te demande si tout va bien pour elle sur le plan médical. Quelle réponse est appropriée ?',
        choix: [
          ['« D’après ce que je vois, oui, tout va bien. »', 0],
          ['« Je ne peux pas te le garantir : ce n’est pas mon rôle. Pour ça, un professionnel de santé est la bonne personne. »', 1],
          ['« Si tu t’entraînes normalement, c’est que tout va bien. »', 0],
          ['« Attendons quelques semaines pour voir si ça passe. »', 0],
        ],
      },
    ],
  },
];

// Les vingt questions de certification, transversales : elles ne sont
// rattachées à aucun module, et `usage='finale'` les tient hors du tirage des
// mini-QCM comme il tient les mini hors de la certification.
const FINALE = [
  {
    enonce: 'Une cliente t’annonce qu’elle a ses règles aujourd’hui. Quelle est ta première réaction ?',
    choix: [
      ['Réduire automatiquement les charges', 0],
      ['Lui demander comment elle se sent aujourd’hui', 1],
      ['Supprimer les exercices de force', 0],
      ['Transformer la séance en cardio', 0],
    ],
  },
  {
    enonce: 'Que permet de connaître précisément le jour du cycle d’une cliente ?',
    choix: [
      ['Son niveau de force', 0],
      ['Son taux hormonal exact', 0],
      ['Son niveau de fatigue', 0],
      ['Aucun de ces éléments avec certitude', 1],
    ],
  },
  {
    enonce: 'Concernant les performances sportives au cours du cycle menstruel, quelle affirmation est la plus juste ?',
    choix: [
      ['Elles sont toujours meilleures en phase folliculaire', 0],
      ['Elles sont toujours moins bonnes pendant les règles', 0],
      ['Les différences moyennes observées sont généralement faibles et variables selon les individus', 1],
      ['Elles suivent exactement les variations hormonales', 0],
    ],
  },
  {
    enonce: 'Une cliente a ses règles, se sent très bien, a bien dormi et réalise un échauffement normal. Que fais-tu ?',
    choix: [
      ['Tu maintiens la séance prévue', 1],
      ['Tu réduis les charges de 20 %', 0],
      ['Tu supprimes les exercices lourds', 0],
      ['Tu raccourcis obligatoirement la séance', 0],
    ],
  },
  {
    enonce: 'Une cliente présente des crampes qui rendent uniquement le squat inconfortable, mais les autres exercices passent normalement. Quelle est l’approche la plus pertinente ?',
    choix: [
      ['Annuler toute la séance', 0],
      ['Alléger toute la séance', 0],
      ['Adapter ou remplacer le squat et conserver ce qui est bien toléré', 1],
      ['Ignorer l’inconfort', 0],
    ],
  },
  {
    enonce: 'Pourquoi une moyenne observée dans une étude ne permet-elle pas de prédire précisément la réponse d’une cliente ?',
    choix: [
      ['Parce que les études scientifiques sont inutiles', 0],
      ['Parce que les réponses individuelles peuvent être très différentes de la moyenne', 1],
      ['Parce que seules les sportives professionnelles ont un cycle', 0],
      ['Parce que les hormones n’ont aucun rôle physiologique', 0],
    ],
  },
  {
    enonce: 'Quelle affirmation concernant l’entraînement pendant les règles est correcte ?',
    choix: [
      ['La musculation doit être évitée', 0],
      ['Les charges doivent toujours être diminuées', 0],
      ['La séance doit être adaptée uniquement si l’état réel de la cliente le justifie', 1],
      ['Seul le cardio est recommandé', 0],
    ],
  },
  {
    enonce: 'Une cliente utilise une contraception hormonale. Quelle attitude est correcte ?',
    choix: [
      ['Appliquer exactement le calendrier d’un cycle naturel', 0],
      ['Déduire son état hormonal à partir de son application', 0],
      ['Comprendre le contexte mais revenir à son ressenti et à ses performances', 1],
      ['Lui conseiller une autre contraception si elle est fatiguée', 0],
    ],
  },
  {
    enonce: 'Une cliente dit : « Depuis que j’ai changé de contraception, je me sens plus fatiguée. » Quelle réponse correspond au rôle du coach ?',
    choix: [
      ['« Cette pilule n’est probablement pas adaptée. »', 0],
      ['« Arrête-la quelques jours pour voir. »', 0],
      ['« On va tenir compte de ta fatigue dans l’entraînement et, si cela t’inquiète, tu peux en parler à ton professionnel de santé. »', 1],
      ['« C’est forcément hormonal. »', 0],
    ],
  },
  {
    enonce: 'Quelle question est la plus pertinente lorsqu’une cliente mentionne son cycle ?',
    choix: [
      ['« À quel jour exact de ton cycle es-tu ? »', 0],
      ['« Quelle est la durée exacte de tes règles ? »', 0],
      ['« Comment tu te sens aujourd’hui ? »', 1],
      ['« Quel est ton moyen de contraception ? »', 0],
    ],
  },
  {
    enonce: 'Avant de poser une question potentiellement intime, quel principe doit guider le coach ?',
    choix: [
      ['Obtenir le maximum d’informations', 0],
      ['Se demander si la réponse modifiera réellement son accompagnement', 1],
      ['Poser les mêmes questions à toutes les clientes', 0],
      ['Connaître précisément le fonctionnement hormonal de la cliente', 0],
    ],
  },
  {
    enonce: 'Une cliente est légèrement fatiguée mais son échauffement est normal et sa charge habituelle reste maîtrisée. Quelle décision est la plus pertinente ?',
    choix: [
      ['Arrêter la séance', 0],
      ['Réduire systématiquement le volume', 0],
      ['Maintenir une séance proche de ce qui était prévu tout en continuant à observer', 1],
      ['Supprimer les exercices de force', 0],
    ],
  },
  {
    enonce: 'Une cliente réalise correctement ses séries mais récupère moins vite que d’habitude. Quel levier peux-tu tester en premier ?',
    choix: [
      ['Augmenter les temps de récupération', 1],
      ['Supprimer immédiatement la séance', 0],
      ['Diviser toutes les charges par deux', 0],
      ['Changer l’ensemble du programme', 0],
    ],
  },
  {
    enonce: 'Une cliente t’explique que ses cycles ne durent pas toujours le même nombre de jours. Que peux-tu en conclure pour ton accompagnement ?',
    choix: [
      ['Qu’elle doit consulter pour régulariser son cycle', 0],
      ['Qu’une variation de durée est fréquente et qu’un calendrier ne suffira pas à anticiper son état', 1],
      ['Qu’il faut recalculer ses phases à chaque cycle pour programmer ses séances', 0],
      ['Qu’elle se trompe probablement dans son suivi', 0],
    ],
  },
  {
    enonce: 'Après avoir adapté un exercice, que doit faire le coach ?',
    choix: [
      ['Considérer que l’adaptation est forcément correcte', 0],
      ['Retester et réévaluer la réponse de la cliente', 1],
      ['Garder cette adaptation pour tous les prochains cycles', 0],
      ['Modifier automatiquement le reste de la séance', 0],
    ],
  },
  {
    enonce: 'Une cliente présente régulièrement davantage de fatigue au début de ses règles. Comment utiliser cette information ?',
    choix: [
      ['Programmer systématiquement une séance légère', 0],
      ['Lui annoncer qu’elle sera fatiguée', 0],
      ['Utiliser l’historique pour poser une meilleure question puis vérifier son état du jour', 1],
      ['Réduire ses charges avant son arrivée', 0],
    ],
  },
  {
    enonce: 'Après une seule mauvaise séance pendant les règles, peut-on conclure que la cliente est toujours moins performante à cette période ?',
    choix: [
      ['Oui', 0],
      ['Oui, si la séance était une séance de force', 0],
      ['Non, une observation isolée ne constitue pas une tendance', 1],
      ['Oui, si elle ressentait également de la fatigue', 0],
    ],
  },
  {
    enonce: 'Une cliente présente une douleur beaucoup plus forte que d’habitude et qui s’aggrave avec l’effort. Quelle attitude est la plus appropriée ?',
    choix: [
      ['Chercher plusieurs exercices de remplacement jusqu’à en trouver un', 0],
      ['Lui expliquer que les règles peuvent être douloureuses', 0],
      ['Ne pas forcer et envisager une orientation vers un professionnel de santé', 1],
      ['Réduire simplement les charges de 20 %', 0],
    ],
  },
  {
    enonce: 'Une cliente explique qu’elle n’a plus ses règles depuis plusieurs mois. Que doit faire le coach ?',
    choix: [
      ['Lui dire que c’est normal lorsqu’on fait beaucoup de sport', 0],
      ['Déterminer si elle est en déficit énergétique', 0],
      ['Lui conseiller d’en parler à un professionnel de santé sans chercher à diagnostiquer la cause', 1],
      ['Modifier son programme pour faire revenir ses règles', 0],
    ],
  },
  {
    enonce: 'Quelle phrase résume le mieux la philosophie de cette formation ?',
    choix: [
      ['Adapter systématiquement l’entraînement aux quatre phases du cycle', 0],
      ['Ignorer le cycle car il n’a aucun intérêt', 0],
      ['Le cycle donne du contexte, mais l’état réel et l’historique de la cliente guident la décision', 1],
      ['Utiliser le calendrier pour anticiper les performances', 0],
    ],
  },
];

// ---------------------------------------------------------------------------
//  LES CAS PRATIQUES DE LA FORMATION.
//
//  Le référentiel que l'évaluateur choisit au moment de prononcer un résultat.
//  Ce sont des DONNÉES, comme les modules et les questions : une formation
//  nouvelle pose les siennes dans son propre fichier, sans toucher au moteur.
//
//  ⚠️ `consignes` est VOLONTAIREMENT VIDE. Seuls les six intitulés ont été
//  définis ; le déroulé de chaque situation ne l'a jamais été. Les inventer ici
//  ferait passer pour un référentiel validé ce qui ne serait qu'une supposition.
//  La colonne existe et attend le texte réel.
// ---------------------------------------------------------------------------
const CAS = [
  { cle: 'cm-cas-1', ordre: 1, titre: 'J’ai mes règles aujourd’hui' },
  { cle: 'cm-cas-2', ordre: 2, titre: 'Cette fois, c’est différent' },
  { cle: 'cm-cas-3', ordre: 3, titre: 'Un seul exercice me gêne' },
  { cle: 'cm-cas-4', ordre: 4, titre: 'Mon application dit phase lutéale' },
  { cle: 'cm-cas-5', ordre: 5, titre: 'Je préfère ne pas en parler' },
  { cle: 'cm-cas-6', ordre: 6, titre: 'Là, il faut passer le relais' },
];

// Son propre repère d'idempotence : les cas arrivent APRÈS la banque, sur des
// bases où le marqueur de celle-ci est déjà posé. Un marqueur partagé les
// aurait rendus impossibles à amorcer sans réécrire la formation entière.
const MARQUEUR_CAS = 'cas_cycle_menstruel_v1';

const REGLAGES = { qcmNbQuestions: 20, qcmSeuilPct: 80, miniNbQuestions: 5, miniSeuilPct: 80 };

// Le repère d'idempotence. Tant que cette clé est posée dans academy_config,
// l'amorçage ne rejoue rien — ni les contenus, ni les questions, ni les
// réglages. C'est ce qui permet de redémarrer le serveur sans écraser une
// question retouchée depuis l'écran d'administration.
const MARQUEUR = 'banque_cycle_menstruel_v1';

module.exports = { FORMATION, MODULES, FINALE, CAS, REGLAGES, MARQUEUR, MARQUEUR_CAS };
