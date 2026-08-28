'use strict';
// ============================================================================
//  MY COACH ACADEMY — la banque de questions réelle de Coach Nutrition.
//
//  CE FICHIER EST UNE DONNÉE, PAS UNE RÈGLE. Il ne contient aucune logique :
//  ni tirage, ni correction, ni seuil. Il transporte 60 questions telles
//  qu'elles ont été rédigées, et rien d'autre.
//
//  DEUX BANQUES, STRICTEMENT SÉPARÉES :
//
//   - MINI    : 40 questions, 5 par module, pour les mini-QCM de fin de module.
//               Pédagogiques et bloquantes — il faut les réussir pour poursuivre
//               le parcours — mais elles ne valident jamais la théorie.
//   - FINALE  : 20 questions transversales, pour le QCM final de certification
//               théorique.
//
//  Une question d'une banque n'entre JAMAIS dans le tirage de l'autre. C'est la
//  colonne `usage` de academy_questions qui le garantit, pas une convention de
//  nommage : une convention se contourne par mégarde, une colonne se filtre.
//
//  ⚠️ LE RATTACHEMENT SE FAIT PAR `ordre`, PAS PAR TITRE. Les titres des
//  modules en base emploient l'apostrophe ASCII là où le document source emploie
//  l'apostrophe typographique : comparer les deux chaînes échouerait sur
//  « Conduire l'entretien et faire adhérer ». Le champ `titre` ci-dessous n'est
//  donc pas une clé mais un GARDE-FOU — l'amorçage refuse d'écrire si le module
//  trouvé à cet ordre ne porte pas ce titre, à l'apostrophe près. Rattacher
//  quarante questions au mauvais module est le genre d'erreur qu'on ne voit pas
//  passer et qu'on découvre par un collaborateur bloqué.
//
//  ⚠️ LE PREMIER MODULE DE LA FORMATION — « Devenir Coach Nutrition My Coach »,
//  ordre 1 — N'A VOLONTAIREMENT PAS DE MINI-QCM. C'est un module d'introduction :
//  ses contenus terminés, on passe directement au suivant. Cette exception est
//  explicite et assumée ; elle n'est pas un oubli de rédaction.
//
//  ⚠️ LES 20 QUESTIONS FINALES NE SONT RATTACHÉES À AUCUN MODULE. Elles sont
//  transversales par construction. Conséquence assumée : l'écran de résultat du
//  QCM final range ce qu'il faut revoir sous « Formation générale » au lieu de
//  nommer des modules. Leur donner un module demanderait d'inventer un
//  rattachement que le document source ne fournit pas.
//
//  Aucun texte n'est reformulé, ni ici ni à l'écriture en base.
// ============================================================================

// Chaque question : un énoncé, puis ses choix dans l'ordre du document source
// (A, B, C, D) avec 1 pour la bonne réponse. L'ordre d'affichage est retiré au
// hasard à chaque tentative par le moteur : celui-ci n'est que l'ordre de saisie.
//
// Les 60 questions n'admettent qu'UNE seule bonne réponse. La règle du
// tout-ou-rien reste en vigueur dans le moteur, elle ne s'applique simplement à
// aucune question de cette banque.

const MINI = [
  {
    ordre: 2,
    titre: 'Les fondamentaux de la nutrition',
    prefixe: 'cn-mini-m1',
    questions: [
      {
        enonce: 'Un client réduit ses portions depuis deux semaines. Son poids moyen reste stable, son activité physique est similaire et les mesures sont suffisamment régulières. Quelle hypothèse mérite d’être examinée en priorité ?',
        choix: [
          ['Son apport réel reste proche de sa dépense énergétique', 1],
          ['Son métabolisme s’est adapté à ses nouvelles portions', 0],
          ['Sa répartition des macronutriments freine sa progression', 0],
          ['Son organisme retient davantage les calories consommées', 0],
        ],
      },
      {
        enonce: 'Un client veut augmenter fortement ses protéines pour perdre davantage de masse grasse. Son apport protéique est déjà adapté. Quelle explication est la plus pertinente ?',
        choix: [
          ['Augmenter les protéines permet surtout de réduire l’apport en lipides', 0],
          ['Augmenter les protéines améliore surtout la dépense liée à la digestion', 0],
          ['Les protéines sont utiles, mais l’équilibre énergétique reste déterminant', 1],
          ['Les protéines deviennent prioritaires lorsque la perte de poids ralentit', 0],
        ],
      },
      {
        enonce: 'Un client retire presque toutes les huiles, noix et poissons gras afin de réduire ses calories. Quel point mérite le plus d’attention ?',
        choix: [
          ['La diminution de ses apports en fibres alimentaires', 0],
          ['La diminution de certains lipides utiles à l’organisme', 1],
          ['La diminution de ses réserves musculaires de glycogène', 0],
          ['La diminution de la digestion de ses protéines alimentaires', 0],
        ],
      },
      {
        enonce: 'Deux déjeuners apportent une quantité d’énergie comparable. Le premier contient peu de protéines et de fibres, le second en contient davantage. Quelle différence est la plus pertinente pour l’accompagnement ?',
        choix: [
          ['Le second entraînera nécessairement une perte de poids supérieure', 0],
          ['Le premier sera mieux utilisé lors d’un entraînement le soir', 0],
          ['Le premier permettra une digestion plus lente dans l’après-midi', 0],
          ['Le second peut favoriser davantage la satiété et l’équilibre du repas', 1],
        ],
      },
      {
        enonce: 'Un client mange équilibré à chaque repas mais ses portions sont très importantes. Quelle conclusion est la plus pertinente ?',
        choix: [
          ['La qualité des aliments compense en partie la taille des portions', 0],
          ['Les portions comptent même lorsque les aliments sont de bonne qualité', 1],
          ['L’équilibre des repas suffit si les aliments transformés restent limités', 0],
          ['Les portions deviennent secondaires lorsque les repas sont faits maison', 0],
        ],
      },
    ],
  },
  {
    ordre: 3,
    titre: 'Comprendre la perte de graisse et le poids',
    prefixe: 'cn-mini-m2',
    questions: [
      {
        enonce: 'Une cliente perd régulièrement du poids pendant trois semaines puis affiche +800 g en deux jours sans changement notable de ses habitudes. Quelle analyse est la plus pertinente ?',
        choix: [
          ['Son déficit énergétique est probablement devenu insuffisant', 0],
          ['Son métabolisme commence probablement à ralentir', 0],
          ['Cette variation est trop courte pour conclure à une reprise de graisse', 1],
          ['Ses portions doivent être réévaluées à partir de cette nouvelle mesure', 0],
        ],
      },
      {
        enonce: 'Un client est en déficit énergétique mais sa consommation de protéines est faible et il ne fait presque aucun renforcement musculaire. Quel risque est particulièrement pertinent ?',
        choix: [
          ['Une partie du poids perdu peut provenir de la masse musculaire', 1],
          ['La perte de graisse risque de s’arrêter malgré le déficit énergétique', 0],
          ['Le poids peut diminuer sans modification de sa composition corporelle', 0],
          ['Son organisme peut cesser d’utiliser ses réserves de masse grasse', 0],
        ],
      },
      {
        enonce: 'Le poids moyen d’un client ne bouge plus depuis plusieurs semaines. Avant de réduire son alimentation, que faut-il prioritairement vérifier ?',
        choix: [
          ['S’il consomme davantage de glucides les jours d’entraînement', 0],
          ['Si son poids actuel correspond désormais à son poids d’équilibre', 0],
          ['Si ses apports en protéines sont répartis sur plusieurs repas', 0],
          ['Si l’adhérence réelle au plan correspond encore à ce qui était prévu', 1],
        ],
      },
      {
        enonce: 'Une cliente perd seulement 1 kg mais son tour de taille diminue, ses vêtements deviennent plus amples et ses performances progressent. Quelle lecture est la plus pertinente ?',
        choix: [
          ['Sa perte de graisse reste insuffisante puisque son poids évolue peu', 0],
          ['Plusieurs indicateurs suggèrent une évolution corporelle favorable', 1],
          ['Ses performances expliquent probablement la baisse du tour de taille', 0],
          ['Il faut attendre une baisse nette du poids avant d’évaluer les résultats', 0],
        ],
      },
      {
        enonce: 'Deux pesées espacées d’une semaine affichent exactement le même poids. Quelle information permettrait le mieux d’interpréter la situation ?',
        choix: [
          ['La quantité de glucides consommée la veille de la seconde pesée', 0],
          ['Le nombre d’entraînements réalisés entre les deux mesures', 0],
          ['L’évolution de plusieurs mesures prises dans des conditions comparables', 1],
          ['La quantité d’eau consommée le matin de la seconde pesée', 0],
        ],
      },
    ],
  },
  {
    ordre: 4,
    titre: 'Analyser et décider',
    prefixe: 'cn-mini-m3',
    questions: [
      {
        enonce: 'Les photos d’une semaine montrent peu de légumes, des portions importantes le soir et trois grignotages. Quelle est la meilleure première démarche ?',
        choix: [
          ['Corriger le dîner puisqu’il représente le repas le plus important', 0],
          ['Supprimer les grignotages puisqu’ils apparaissent plusieurs fois', 0],
          ['Augmenter les légumes afin de réduire naturellement les portions', 0],
          ['Questionner le client pour comprendre ce qui explique ces observations', 1],
        ],
      },
      {
        enonce: 'Un client grignote presque chaque soir vers 18 h. Il déjeune à 12 h et dîne vers 21 h. Quelle première question apporte le plus de valeur ?',
        choix: [
          ['« Est-ce que tu pourrais avancer ton dîner certains jours ? »', 0],
          ['« Qu’est-ce que tu ressens généralement au moment du grignotage ? »', 1],
          ['« Quelle quantité de protéines consommes-tu chaque matin ? »', 0],
          ['« Est-ce que tu serais prêt à supprimer ce grignotage cette semaine ? »', 0],
        ],
      },
      {
        enonce: 'Tu identifies cinq axes d’amélioration chez un client. Comment choisir la première action ?',
        choix: [
          ['Prendre celle qui produit théoriquement la plus grande baisse calorique', 0],
          ['Commencer par celle qui demande le moins de changement au quotidien', 0],
          ['Croiser son impact potentiel avec la capacité du client à la réaliser', 1],
          ['Laisser le client sélectionner librement celle qu’il préfère travailler', 0],
        ],
      },
      {
        enonce: 'Les photos alimentaires semblent montrer des portions adaptées, mais le poids évolue différemment de ce qui était attendu. Quelle attitude est la plus pertinente ?',
        choix: [
          ['Confronter les observations aux autres données avant de conclure', 1],
          ['Considérer les photos comme plus fiables que les variations de poids', 0],
          ['Réduire légèrement les portions pour observer la réaction suivante', 0],
          ['Demander des photos plus précises avant de poursuivre le programme', 0],
        ],
      },
      {
        enonce: 'Quelle action est la plus exploitable lors du rendez-vous suivant ?',
        choix: [
          ['Faire davantage attention aux portions servies pendant la semaine', 0],
          ['Améliorer progressivement la qualité générale des repas du soir', 0],
          ['Essayer de manger moins lorsque la journée a été moins active', 0],
          ['Servir le dîner dans une seule assiette, cinq soirs cette semaine', 1],
        ],
      },
    ],
  },
  {
    ordre: 5,
    titre: 'Conduire l’entretien et faire adhérer',
    prefixe: 'cn-mini-m4',
    questions: [
      {
        enonce: 'Un client n’a réalisé son action que deux jours sur sept. Quelle ouverture d’échange est la plus utile ?',
        choix: [
          ['« Qu’est-ce qui t’a permis de la faire ces deux jours-là ? »', 1],
          ['« Pourquoi n’as-tu pas respecté ce qu’on avait prévu ensemble ? »', 0],
          ['« Est-ce que l’objectif était finalement trop ambitieux pour toi ? »', 0],
          ['« Tu préfères qu’on choisisse une action différente cette semaine ? »', 0],
        ],
      },
      {
        enonce: 'Un client répond à toutes tes propositions par « oui, je vais essayer », mais semble peu convaincu. Quelle démarche est la plus pertinente ?',
        choix: [
          ['Reformuler davantage les bénéfices attendus de l’action proposée', 0],
          ['Réduire l’objectif pour augmenter ses chances de le mettre en œuvre', 0],
          ['Explorer ce qu’il pense réellement de l’action et de sa faisabilité', 1],
          ['Lui demander de s’engager sur un nombre précis de jours cette semaine', 0],
        ],
      },
      {
        enonce: 'Un client explique avoir « complètement raté sa semaine ». Ses photos montrent pourtant quatre journées cohérentes et trois plus difficiles. Quelle réponse est la plus pertinente ?',
        choix: [
          ['Lui rappeler que trois mauvaises journées peuvent ralentir ses résultats', 0],
          ['Revenir sur les quatre journées réussies puis analyser les trois autres', 1],
          ['Lui proposer une semaine plus stricte afin de retrouver une dynamique', 0],
          ['Se concentrer sur les trois journées difficiles puisqu’elles posent problème', 0],
        ],
      },
      {
        enonce: 'Une action paraît pertinente au coach, mais le client lui donne une confiance de 4/10 pour réussir. Que privilégier ?',
        choix: [
          ['Maintenir l’action et renforcer l’explication de son intérêt', 0],
          ['Tester l’action pendant quelques jours avant de décider de la suite', 0],
          ['Ajouter un suivi intermédiaire afin d’augmenter son engagement', 0],
          ['Adapter l’action jusqu’à obtenir un niveau de confiance plus élevé', 1],
        ],
      },
      {
        enonce: 'Un client sait parfaitement ce qu’il devrait faire mais ne le fait pas régulièrement. Quel travail devient prioritaire ?',
        choix: [
          ['Approfondir ses connaissances sur les conséquences de ses choix', 0],
          ['Comprendre les obstacles entre son intention et son comportement', 1],
          ['Renforcer la précision des recommandations données à chaque séance', 0],
          ['Mesurer plus régulièrement ses résultats pour entretenir sa motivation', 0],
        ],
      },
    ],
  },
  {
    ordre: 6,
    titre: 'Nutrition et entraînement',
    prefixe: 'cn-mini-m5',
    questions: [
      {
        enonce: 'Un client s’entraîne à 18 h et arrive régulièrement sans énergie après un déjeuner pris à midi. Quel axe paraît le plus pertinent ?',
        choix: [
          ['Examiner l’organisation de ses apports dans les heures précédentes', 1],
          ['Augmenter la quantité de protéines consommée après l’entraînement', 0],
          ['Réduire son déjeuner afin de faciliter la digestion avant la séance', 0],
          ['Augmenter son hydratation pendant la séance avant de changer ses repas', 0],
        ],
      },
      {
        enonce: 'Un client veut perdre de la graisse et pense que manger après sa séance ralentira ses résultats. Quelle notion faut-il prioritairement lui faire comprendre ?',
        choix: [
          ['Le repas post-entraînement doit être plus léger les jours de déficit', 0],
          ['La récupération dépend principalement du délai avant le repas suivant', 0],
          ['L’organisation autour de l’entraînement s’intègre au bilan alimentaire global', 1],
          ['Les calories consommées après l’entraînement sont utilisées différemment', 0],
        ],
      },
      {
        enonce: 'Un client souhaite prendre du muscle mais son poids, ses mensurations et ses performances stagnent. Quel élément nutritionnel mérite notamment d’être vérifié ?',
        choix: [
          ['La quantité d’aliments consommés autour de chaque entraînement', 0],
          ['L’adéquation de ses apports énergétiques et protéiques avec son objectif', 1],
          ['La proportion exacte de glucides consommée au repas post-entraînement', 0],
          ['Le nombre de repas réalisés dans les trois heures suivant ses séances', 0],
        ],
      },
      {
        enonce: 'Un client demande quel complément acheter pour améliorer sa récupération. Quelle démarche est la plus pertinente ?',
        choix: [
          ['Identifier d’abord si les bases de récupération et d’alimentation sont maîtrisées', 1],
          ['Comparer les compléments selon leur intérêt pour son type d’entraînement', 0],
          ['Choisir le complément dont les effets correspondent le mieux à son objectif', 0],
          ['Attendre que sa progression ralentisse avant d’envisager une supplémentation', 0],
        ],
      },
      {
        enonce: 'Un client réduit fortement ses glucides alors que son volume d’entraînement augmente. Il rapporte une baisse d’énergie. Quelle analyse mérite d’être explorée ?',
        choix: [
          ['Son apport protéique peut être insuffisant pour soutenir la récupération', 0],
          ['Son apport en lipides peut être trop élevé avant ses entraînements', 0],
          ['Son organisation glucidique peut être inadaptée à ses besoins actuels', 1],
          ['Son déficit hydrique peut expliquer l’essentiel de sa baisse d’énergie', 0],
        ],
      },
    ],
  },
  {
    ordre: 7,
    titre: 'Limites, santé et orientation',
    prefixe: 'cn-mini-m6',
    questions: [
      {
        enonce: 'Un client décrit des douleurs digestives récurrentes après plusieurs repas et te demande quel aliment supprimer. Quelle conduite est la plus adaptée ?',
        choix: [
          ['Analyser ses photos pour identifier les aliments les plus souvent associés', 0],
          ['Lui proposer de retirer temporairement l’aliment qu’il suspecte lui-même', 0],
          ['Continuer le suivi comportemental et l’orienter pour le problème digestif', 1],
          ['Modifier la composition de ses repas afin de réduire les symptômes observés', 0],
        ],
      },
      {
        enonce: 'Une cliente présente une relation très anxieuse avec la nourriture et décrit plusieurs comportements pouvant évoquer un TCA. Quel est ton rôle ?',
        choix: [
          ['Simplifier ses objectifs alimentaires pour réduire la pression ressentie', 0],
          ['Identifier le signal d’alerte et l’orienter vers un professionnel adapté', 1],
          ['Suspendre les objectifs de perte de poids tout en poursuivant le suivi', 0],
          ['Travailler uniquement sur des habitudes sans évoquer les quantités consommées', 0],
        ],
      },
      {
        enonce: 'Un client suivi médicalement te demande de modifier son alimentation pour agir sur sa pathologie. Quelle frontière professionnelle doit guider ta réponse ?',
        choix: [
          ['Adapter uniquement les habitudes qui n’interfèrent pas avec son traitement', 0],
          ['Donner des conseils généraux puis demander une validation à son médecin', 0],
          ['Utiliser les principes de la formation sans commenter son traitement médical', 0],
          ['Distinguer l’accompagnement comportemental de la prise en charge thérapeutique', 1],
        ],
      },
      {
        enonce: 'Un client te demande ton avis sur une analyse biologique qu’il vient de recevoir. Quelle réponse est la plus appropriée ?',
        choix: [
          ['L’aider à comprendre les valeurs liées directement à son alimentation', 0],
          ['Comparer ses résultats aux valeurs de référence indiquées sur le document', 0],
          ['L’orienter vers le professionnel habilité à interpréter ces résultats', 1],
          ['Identifier les habitudes alimentaires susceptibles d’expliquer les valeurs', 0],
        ],
      },
      {
        enonce: 'Pourquoi savoir orienter fait-il partie de la compétence du Coach Nutrition ?',
        choix: [
          ['Parce qu’il doit reconnaître quand une situation dépasse son périmètre', 1],
          ['Parce qu’il doit partager la responsabilité du suivi avec un spécialiste', 0],
          ['Parce qu’il doit obtenir un avis médical avant toute adaptation importante', 0],
          ['Parce qu’il doit distinguer les recommandations nutritionnelles autorisées', 0],
        ],
      },
    ],
  },
  {
    ordre: 8,
    titre: 'La vie réelle : contraintes et organisation',
    prefixe: 'cn-mini-m7',
    questions: [
      {
        enonce: 'Un client mange au restaurant quatre midis par semaine pour son travail. Quelle stratégie paraît la plus durable ?',
        choix: [
          ['Compenser les déjeuners professionnels par des dîners plus légers', 0],
          ['Définir des repères applicables aux restaurants qu’il fréquente réellement', 1],
          ['Préparer ses repas les jours où aucun déjeuner professionnel n’est prévu', 0],
          ['Réserver les plats plus riches aux journées comportant un entraînement', 0],
        ],
      },
      {
        enonce: 'Une cliente a deux enfants, peu de temps pour cuisiner et un budget serré. Quelle approche est la plus pertinente ?',
        choix: [
          ['Construire des repas simples compatibles avec ses contraintes réelles', 1],
          ['Prioriser le fait maison pour maîtriser davantage la qualité nutritionnelle', 0],
          ['Organiser une préparation hebdomadaire afin de limiter les repas improvisés', 0],
          ['Réduire la variété des aliments afin de mieux maîtriser son budget mensuel', 0],
        ],
      },
      {
        enonce: 'Un client part dix jours en vacances et craint de « perdre tous ses résultats ». Quel objectif est le plus pertinent ?',
        choix: [
          ['Maintenir les mêmes portions que chez lui en adaptant seulement les aliments', 0],
          ['Prévoir quelques journées plus flexibles puis revenir au cadre habituel', 0],
          ['Définir quelques repères essentiels compatibles avec ses vacances', 1],
          ['Réduire légèrement ses apports avant le départ pour créer une marge', 0],
        ],
      },
      {
        enonce: 'Une cliente manque régulièrement son petit-déjeuner faute de temps mais ne ressent pas de faim et ses autres repas sont cohérents. Quelle attitude est la plus pertinente ?',
        choix: [
          ['Ajouter un petit-déjeuner rapide pour améliorer la répartition des apports', 0],
          ['Vérifier si cette organisation pose réellement un problème avant de la modifier', 1],
          ['Déplacer une partie de son déjeuner vers le matin pour équilibrer la journée', 0],
          ['Introduire une collation matinale afin d’éviter un intervalle trop long sans manger', 0],
        ],
      },
      {
        enonce: 'Un client boit de l’alcool chaque samedi avec ses amis et ne souhaite pas supprimer ce moment. Quelle approche correspond le mieux à un accompagnement durable ?',
        choix: [
          ['Travailler avec lui sur une stratégie compatible avec ce moment social', 1],
          ['Réserver l’alcool aux semaines où son évolution pondérale est satisfaisante', 0],
          ['Compenser les calories consommées en réduisant le dîner du même jour', 0],
          ['Fixer une quantité maximale calculée selon son objectif énergétique hebdomadaire', 0],
        ],
      },
    ],
  },
  {
    ordre: 9,
    titre: 'Le protocole Boost Nutrition',
    prefixe: 'cn-mini-m8',
    questions: [
      {
        enonce: 'Lors de S1, le coach identifie plusieurs problèmes dans les habitudes du client. Quel résultat doit prioritairement produire ce premier rendez-vous ?',
        choix: [
          ['Une liste hiérarchisée des changements à réaliser pendant les 12 semaines', 0],
          ['Une compréhension du client et une première action adaptée à sa situation', 1],
          ['Un plan alimentaire permettant de structurer les premières semaines du Boost', 0],
          ['Une estimation précise des écarts entre ses habitudes et ses besoins théoriques', 0],
        ],
      },
      {
        enonce: 'En S5, l’action définie en S4 n’a été réalisée que partiellement. Quelle séquence correspond le mieux au protocole ?',
        choix: [
          ['Évaluer le résultat, comprendre l’adhésion puis décider de la suite', 1],
          ['Reprendre l’action, réduire son niveau puis programmer une nouvelle mesure', 0],
          ['Analyser la semaine, identifier un nouveau problème puis changer l’action', 0],
          ['Conserver l’action une semaine supplémentaire afin d’obtenir plus de données', 0],
        ],
      },
      {
        enonce: 'Un coach constate pendant S7 qu’une action est désormais bien intégrée. Quelle décision est la plus pertinente ?',
        choix: [
          ['La conserver comme action active jusqu’au prochain bilan intermédiaire', 0],
          ['Ajouter une seconde action tout en maintenant la première comme objectif', 0],
          ['Constater son résultat puis choisir la prochaine priorité avec le client', 1],
          ['Augmenter son niveau d’exigence afin de consolider davantage l’habitude', 0],
        ],
      },
      {
        enonce: 'Quelle différence fondamentale distingue S12 des rendez-vous S2 à S11 ?',
        choix: [
          ['S12 analyse davantage les résultats corporels obtenus pendant le Boost', 0],
          ['S12 ferme le cycle et construit l’autonomie sans créer une nouvelle action', 1],
          ['S12 reprend l’ensemble des actions afin de déterminer celles qui ont fonctionné', 0],
          ['S12 définit les habitudes que le client devra poursuivre après l’accompagnement', 0],
        ],
      },
      {
        enonce: 'À S12, le client a progressé mais reste fragile sur certaines situations. Quel résultat final est le plus pertinent ?',
        choix: [
          ['Un plan d’autonomie avec quelques règles personnelles et points de vigilance', 1],
          ['Une liste des actions réussies et celles qui doivent encore être travaillées', 0],
          ['Un programme alimentaire simplifié qu’il peut appliquer sans suivi du coach', 0],
          ['Une nouvelle série d’objectifs permettant de maintenir les progrès obtenus', 0],
        ],
      },
    ],
  },
];

// Les 20 questions transversales du QCM final. Aucun module de rattachement :
// elles traversent le parcours par construction (cf. en-tête).
const FINALE = [
  {
    enonce: 'Un client perd du poids depuis six semaines mais ses performances diminuent, sa faim augmente et son alimentation est devenue très restrictive. Quelle priorité paraît la plus pertinente ?',
    choix: [
      ['Maintenir l’approche puisque l’objectif de perte de poids fonctionne', 0],
      ['Examiner si la stratégie actuelle reste adaptée au-delà du poids perdu', 1],
      ['Augmenter les protéines afin d’améliorer satiété et récupération musculaire', 0],
      ['Introduire un repas plus libre chaque semaine pour améliorer son adhésion', 0],
    ],
  },
  {
    enonce: 'Une cliente dit ne pas comprendre pourquoi son poids a augmenté de 700 g alors qu’elle a suivi ses actions. Quelle réponse démontre le meilleur raisonnement ?',
    choix: [
      ['Vérifier d’abord si cette variation s’inscrit dans une tendance plus longue', 1],
      ['Comparer ses calories des derniers jours avec celles de la semaine précédente', 0],
      ['Contrôler ses portions afin d’identifier une éventuelle dérive alimentaire', 0],
      ['Attendre la semaine suivante avant de commenter cette nouvelle mesure', 0],
    ],
  },
  {
    enonce: 'Un client mange peu de protéines, très peu de légumes et grignote chaque soir. Il est prêt à travailler sur une seule chose. Comment décider ?',
    choix: [
      ['Commencer par les protéines car elles favorisent le maintien musculaire', 0],
      ['Commencer par les légumes car ils améliorent la qualité globale des repas', 0],
      ['Supprimer le grignotage car il peut augmenter son apport énergétique', 0],
      ['Identifier avec lui l’action ayant le meilleur rapport impact/faisabilité', 1],
    ],
  },
  {
    enonce: 'Un client respecte son action 6 jours sur 7 mais considère sa semaine comme un échec. Quelle intervention est la plus pertinente ?',
    choix: [
      ['Explorer le jour non réussi afin d’éviter que la situation se reproduise', 0],
      ['Objectiver d’abord ce qui a été réussi avant d’analyser la difficulté restante', 1],
      ['Conserver la même action jusqu’à ce qu’elle soit réalisée tous les jours', 0],
      ['Passer à une nouvelle action puisque le niveau d’adhésion est déjà élevé', 0],
    ],
  },
  {
    enonce: 'Un client veut supprimer les féculents le soir pour accélérer sa perte de graisse. Quel élément doit guider la réponse du coach ?',
    choix: [
      ['L’horaire du repas influence moins le résultat que l’équilibre alimentaire global', 1],
      ['Les féculents du soir sont intéressants surtout après une séance d’entraînement', 0],
      ['La quantité consommée au dîner doit dépendre de l’activité réalisée dans la journée', 0],
      ['Réduire les féculents peut être pertinent si le déjeuner en contient suffisamment', 0],
    ],
  },
  {
    enonce: 'Les photos alimentaires semblent cohérentes, mais l’évolution observée ne correspond pas aux attentes. Que fait un bon Coach Nutrition ?',
    choix: [
      ['Il considère les photos comme l’indicateur principal puisqu’elles montrent les repas', 0],
      ['Il ajuste légèrement les portions pour vérifier si l’évolution reprend ensuite', 0],
      ['Il croise les données et questionne avant de modifier l’accompagnement', 1],
      ['Il augmente la fréquence des photos afin d’obtenir davantage d’informations', 0],
    ],
  },
  {
    enonce: 'Un client n’a pas réalisé son action parce qu’il finit son travail plus tard que prévu chaque soir. Quelle décision est la plus pertinente ?',
    choix: [
      ['Renforcer son engagement en lui demandant de prévoir davantage ses journées', 0],
      ['Adapter l’action à la contrainte qui empêche concrètement sa réalisation', 1],
      ['Conserver l’action afin de vérifier si cette difficulté se répète une semaine', 0],
      ['Choisir une action différente qui demande moins d’organisation personnelle', 0],
    ],
  },
  {
    enonce: 'Un client en perte de graisse augmente son volume d’entraînement et réduit simultanément fortement ses apports. Quel point mérite une vigilance particulière ?',
    choix: [
      ['La vitesse de perte et sa capacité à préserver récupération et masse musculaire', 1],
      ['La quantité de glucides consommée pendant les journées sans entraînement', 0],
      ['La répartition des protéines entre le déjeuner et le repas post-entraînement', 0],
      ['Le délai entre son dernier repas et le début de chacune de ses séances', 0],
    ],
  },
  {
    enonce: 'Une cliente demande au coach d’interpréter ses analyses sanguines pour adapter son alimentation. Quelle réponse correspond à son rôle ?',
    choix: [
      ['Expliquer les marqueurs directement liés aux habitudes alimentaires observées', 0],
      ['Proposer des ajustements généraux puis vérifier leur effet au prochain bilan', 0],
      ['Demander l’avis de son médecin avant de proposer les adaptations alimentaires', 0],
      ['Orienter l’interprétation médicale tout en poursuivant son accompagnement adapté', 1],
    ],
  },
  {
    enonce: 'Un client mange au restaurant trois fois par semaine et progresse malgré tout. Quelle attitude est la plus pertinente ?',
    choix: [
      ['Conserver cette organisation tant qu’elle reste compatible avec ses objectifs', 1],
      ['Réduire progressivement les restaurants afin de faciliter la suite du programme', 0],
      ['Introduire des règles spécifiques pour limiter l’impact calorique de ces repas', 0],
      ['Utiliser ces repas comme variable d’ajustement si sa progression ralentit ensuite', 0],
    ],
  },
  {
    enonce: 'À S6, un client maîtrise son action actuelle depuis deux semaines. Quelle suite correspond le mieux au protocole ?',
    choix: [
      ['Maintenir l’action jusqu’à ce qu’elle devienne complètement automatique', 0],
      ['Constater le résultat puis déterminer la prochaine priorité pertinente', 1],
      ['Ajouter une nouvelle action tout en continuant à mesurer l’action précédente', 0],
      ['Augmenter la difficulté de l’action afin de poursuivre sa progression', 0],
    ],
  },
  {
    enonce: 'Un client te dit : « Dis-moi simplement exactement ce que je dois manger. » Quelle réponse est la plus cohérente avec l’approche My Coach ?',
    choix: [
      ['Proposer une journée type puis lui apprendre progressivement à l’adapter', 0],
      ['Donner des portions précises pendant quelques semaines pour créer ses repères', 0],
      ['Construire avec lui des repères qu’il pourra comprendre et utiliser seul', 1],
      ['Établir une structure alimentaire qu’il pourra ensuite personnaliser lui-même', 0],
    ],
  },
  {
    enonce: 'Une cliente progresse sur ses mensurations et sa force mais son poids évolue peu. Quelle conclusion est la plus pertinente ?',
    choix: [
      ['Son déficit énergétique est probablement devenu trop faible', 0],
      ['Sa progression doit être évaluée avec plusieurs indicateurs complémentaires', 1],
      ['Ses gains musculaires compensent probablement exactement sa perte de graisse', 0],
      ['Son poids deviendra plus pertinent lorsque ses performances se stabiliseront', 0],
    ],
  },
  {
    enonce: 'Un client affirme manquer de volonté parce qu’il craque chaque soir. Quelle démarche est la plus pertinente ?',
    choix: [
      ['Travailler sur sa motivation afin qu’il résiste mieux au moment critique', 0],
      ['Fixer une règle claire pour limiter les décisions prises en fin de journée', 0],
      ['Explorer les facteurs qui rendent ce comportement probable chaque soir', 1],
      ['Prévoir une collation structurée pour remplacer le comportement actuel', 0],
    ],
  },
  {
    enonce: 'Un client te signale des comportements alimentaires préoccupants associés à une forte anxiété corporelle. Quelle compétence est évaluée ici ?',
    choix: [
      ['Savoir simplifier suffisamment l’accompagnement pour réduire sa pression', 0],
      ['Savoir reconnaître une limite professionnelle et organiser une orientation', 1],
      ['Savoir distinguer une difficulté d’adhésion d’un comportement alimentaire fragile', 0],
      ['Savoir suspendre les objectifs corporels en conservant le suivi nutritionnel', 0],
    ],
  },
  {
    enonce: 'Quelle situation représente le mieux une action correctement individualisée ?',
    choix: [
      ['Une recommandation nutritionnelle efficace adaptée à l’objectif du client', 0],
      ['Une habitude simple que le client estime pouvoir appliquer régulièrement', 0],
      ['Une action combinant impact attendu, contexte du client et faisabilité réelle', 1],
      ['Une modification mesurable permettant au coach d’évaluer son efficacité', 0],
    ],
  },
  {
    enonce: 'À S10, le coach remarque qu’il décide encore lui-même de chaque action et que le client attend systématiquement ses consignes. Quel risque cela révèle-t-il ?',
    choix: [
      ['Le client risque de moins bien respecter ses actions pendant les dernières semaines', 0],
      ['Le coach risque de manquer de nouvelles priorités nutritionnelles avant S12', 0],
      ['Le client risque de terminer le Boost sans savoir décider seul après le suivi', 1],
      ['Le coach risque de ne pas disposer d’assez de temps pour préparer le bilan final', 0],
    ],
  },
  {
    enonce: 'Un client demande quel complément utiliser alors que sommeil, alimentation et récupération sont irréguliers. Quelle hiérarchie est la plus pertinente ?',
    choix: [
      ['Choisir un complément pertinent puis travailler progressivement sur les bases', 0],
      ['Stabiliser les fondamentaux avant de chercher une optimisation supplémentaire', 1],
      ['Corriger l’alimentation puis évaluer séparément l’intérêt d’un complément', 0],
      ['Identifier le facteur de récupération le plus faible et agir uniquement dessus', 0],
    ],
  },
  {
    enonce: 'À S12, quelle situation indique le mieux que le Boost a rempli son objectif ?',
    choix: [
      ['Le client connaît les principales règles nutritionnelles correspondant à son objectif', 0],
      ['Le client a atteint son objectif de poids et sait quels aliments il doit privilégier', 0],
      ['Le client respecte encore les actions mises en place pendant les dernières semaines', 0],
      ['Le client dispose de repères personnels et sait réagir aux situations courantes', 1],
    ],
  },
  {
    enonce: 'Deux Coachs Nutrition analysent le même client et proposent deux actions différentes, toutes deux cohérentes. Comment déterminer laquelle est la meilleure ?',
    choix: [
      ['Choisir celle dont l’impact nutritionnel théorique est le plus important', 0],
      ['Choisir celle qui correspond le mieux à la priorité et au contexte du client', 1],
      ['Choisir celle dont l’efficacité pourra être mesurée le plus facilement ensuite', 0],
      ['Choisir celle qui demande le moins d’effort pour favoriser une première réussite', 0],
    ],
  },
];

// Les réglages que cette banque suppose. Ils sont appliqués UNE SEULE FOIS, à
// l'import, et deviennent ensuite modifiables depuis l'administration comme
// n'importe quel réglage de formation.
const REGLAGES = { qcmNbQuestions: 20, qcmSeuilPct: 90, miniNbQuestions: 5, miniSeuilPct: 80 };

// Le repère d'idempotence. Tant que cette clé est posée dans academy_config,
// l'import ne rejoue rien : ni les questions, ni les réglages. C'est ce qui
// permet de redémarrer le serveur sans réécraser une question retouchée depuis
// l'écran d'administration.
const MARQUEUR = 'banque_coach_nutrition_v1';

module.exports = { MINI, FINALE, REGLAGES, MARQUEUR };
