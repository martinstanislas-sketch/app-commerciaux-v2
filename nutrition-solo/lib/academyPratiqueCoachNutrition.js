'use strict';
// ============================================================================
//  MY COACH ACADEMY — ÉVALUATION PRATIQUE DE « NUTRITION CERTIFIÉ ».
//
//  CE FICHIER NE CONTIENT QUE DES DONNÉES : neuf critères et six cas. Aucune
//  ligne de moteur. Le moteur qui les pose est générique et vit dans
//  academyGrilles.js — il ne connaît ni la nutrition ni aucune autre formation.
//
//  POURQUOI SIX CAS ET PAS UN SEUL. Le certificateur ne prépare rien : il lit,
//  il joue, il répond, il coche. Chaque cas porte donc TOUT ce qu'il aura à
//  dire, y compris ses refus et ses relances. S'il doit inventer une phrase,
//  le cas est raté.
//
//  ⚠️ LA RUBRIQUE « SANTÉ » EST DANS LES SIX, ET C'EST VOULU. Le neuvième
//  critère se coche à chaque évaluation ; il doit donc être observable à
//  chaque évaluation. Dans cinq cas elle FERME la porte (« rien qui nécessite
//  une orientation ») ; dans le sixième elle l'OUVRE. Le certificateur ne
//  décide jamais lui-même si une situation est médicale — l'Academy le lui
//  dit, en toutes lettres, dans le bloc `observer`.
//
//  ⚠️ CE QUI EST ENSEIGNÉ, RIEN DE PLUS. Les six situations sont dérivées des
//  neuf modules actifs de la formation. En particulier, sur les compléments
//  alimentaires (cas 4), la formation n'enseigne PAS qu'ils sortent du rôle du
//  coach : elle enseigne qu'on regarde d'abord si les bases de récupération et
//  d'alimentation sont maîtrisées. Le cas mesure cela, et pas une limite
//  professionnelle qui n'existe pas dans le cours.
// ============================================================================

const COACH_NUTRITION = 'coach_nutrition';

// Les marqueurs portent leur VERSION. Corriger un libellé de critère ou une
// réplique de scénario se fait en modifiant le texte ci-dessous ET en bumpant
// la version : l'amorçage rejoue alors sa mise à jour, une seule fois.
const MARQUEUR_GRILLE_NUTRITION = 'grille_coach_nutrition_v1';
const MARQUEUR_CAS_NUTRITION = 'cas_coach_nutrition_v1';

// ---------------------------------------------------------------------------
//  LA GRILLE — trois axes, trois critères, tels qu'ils ont été arbitrés.
// ---------------------------------------------------------------------------
const GRILLE_COACH_NUTRITION = [
  {
    axe: 1,
    titre: 'Questionnement & compréhension',
    criteres: [
      { cle: 'cn-c1', titre: 'Exploration',
        enonce: 'Pose des questions pertinentes pour comprendre les habitudes alimentaires, l’organisation et les principales difficultés du client.' },
      { cle: 'cn-c2', titre: 'Compréhension',
        enonce: 'Identifie les éléments réellement importants de la situation sans tirer de conclusion à partir d’une seule habitude.' },
      { cle: 'cn-c3', titre: 'Priorisation',
        enonce: 'Identifie un ou plusieurs axes prioritaires d’amélioration au lieu de vouloir tout modifier simultanément.' },
    ],
  },
  {
    axe: 2,
    titre: 'Accompagnement nutritionnel',
    criteres: [
      { cle: 'cn-c4', titre: 'Pertinence des recommandations',
        enonce: 'Propose des recommandations cohérentes avec la situation, l’objectif et les habitudes réellement décrites par le client.' },
      { cle: 'cn-c5', titre: 'Applicabilité',
        enonce: 'Transforme ses recommandations en actions simples, réalistes et applicables dans le quotidien du client.' },
      { cle: 'cn-c6', titre: 'Individualisation & suivi',
        enonce: 'Vérifie que les actions proposées conviennent au client et prévoit de réévaluer leur mise en place et leurs effets.' },
    ],
  },
  {
    axe: 3,
    titre: 'Cadre & limites du coach',
    criteres: [
      { cle: 'cn-c7', titre: 'Posture professionnelle',
        enonce: 'Accompagne sans culpabiliser, moraliser ou présenter les aliments comme intrinsèquement « bons » ou « mauvais ».' },
      { cle: 'cn-c8', titre: 'Limites professionnelles',
        enonce: 'Ne pose pas de diagnostic, ne prescrit pas de prise en charge thérapeutique et reste dans le champ de compétence défini par la formation.' },
      // ⚠️ LE NEUVIÈME CRITÈRE SE LIT DANS LES DEUX SENS, et c'est ce qui le
      // rend observable dans les six cas : orienter quand il le faut, et ne
      // pas médicaliser quand rien ne le demande. Un énoncé qui ne dirait que
      // la première moitié rendrait le critère incochable dans les cas 1 à 5.
      { cle: 'cn-c9', titre: 'Orientation / recours approprié',
        enonce: 'Oriente vers un professionnel adapté lorsque la situation dépasse son champ de compétence, et s’abstient de médicaliser une situation qui n’en relève pas.' },
    ],
  },
];

// ---------------------------------------------------------------------------
//  LES SIX CAS.
//
//  `jouer` = ce que le certificateur dit SPONTANÉMENT, et rien de plus. Tout
//  le reste attend une question du coach : c'est cette frontière, et elle
//  seule, qui rend le questionnement évaluable.
// ---------------------------------------------------------------------------
const SANTE_FERMEE = 'Aucune orientation n’est attendue dans ce scénario : rien de ce que dit le client '
  + 'ne dépasse le cadre du coach. Un coach qui invente une orientation ou pose une explication médicale '
  + 'sort de son rôle autant que celui qui manque une orientation nécessaire.';

const CAS_COACH_NUTRITION = [
  {
    cle: 'cn-cas-1', ordre: 1,
    titre: 'Journée désorganisée et faim de fin d’après-midi',
    scenario: {
      lire: 'J’aimerais perdre du poids. J’ai l’impression de manger plutôt correctement, '
        + 'mais je ne sais pas ce que je devrais changer.',
      role: 'Tu veux perdre du poids ; ta journée de travail est peu structurée et tu as très faim en fin d’après-midi.',
      jouer: [
        '« Globalement je pense que je mange bien. Le soir je cuisine, c’est plutôt correct. »',
        'N’ajoute rien d’autre : attends ses questions.',
      ],
      sections: [
        {
          titre: 'Si le coach te questionne',
          lignes: [
            { cle: 'Objectif', valeur: '« Perdre du poids. J’ai pris 6 ou 7 kg en deux ans. »' },
            { cle: 'Matin', valeur: '« Je ne prends pas de petit-déjeuner, je n’ai pas le temps. »' },
            { cle: 'Midi', valeur: '« Je mange vite au bureau, souvent un sandwich acheté à côté. »' },
            { cle: 'Après-midi', valeur: '« Vers 17 h j’ai très faim et je grignote ce que je trouve. »' },
            { cle: 'Soir', valeur: '« Un vrai repas à la maison. Et je me ressers souvent. »' },
            { cle: 'Boissons', valeur: '« De l’eau, deux cafés. Un soda le midi. »' },
            { cle: 'Week-end', valeur: '« Plus décousu. On mange dehors le samedi. »' },
            { cle: 'Faim', valeur: '« Pas faim le matin. À 17 h, c’est irrésistible. »' },
            { cle: 'Difficulté principale', valeur: '« Anticiper ce que je vais manger au travail. »' },
            { cle: 'Contraintes', valeur: '« Journées à rallonge, pas de cuisine au bureau, je ne sais jamais à quelle heure je finis. »' },
            { cle: 'Santé', valeur: '« Non, rien de particulier, aucun traitement. »' },
          ],
        },
        {
          titre: 'Si le coach propose…',
          lignes: [
            { cle: 'Action réaliste', valeur: '« Oui, ça je pourrais le faire. »' },
            { cle: 'Cuisiner à l’avance', valeur: '« Compliqué. Mes semaines ne se ressemblent pas. »' },
            { cle: 'Trop de changements', valeur: '« Ça fait beaucoup. Par quoi je commence ? »' },
            { cle: 'Supprimer le grignotage', valeur: '« Et je fais quoi quand j’ai faim ? »' },
            { cle: 'Le plus facile ?', valeur: '« Prévoir quelque chose pour 17 h, ça oui. »' },
            { cle: 'Revoir plus tard', valeur: '« D’accord, ça me va. »' },
          ],
        },
      ],
      attendu: 'Comprendre la journée avant de conseiller. Voir que la faim de 17 h est une conséquence possible '
        + 'de la journée (matin sauté, déjeuner expédié) et non un manque de volonté. Retenir UNE première action '
        + 'réaliste malgré la contrainte de travail. Plusieurs solutions sont recevables : il n’y a pas une seule bonne réponse.',
      observer: SANTE_FERMEE,
      evalue: 'exploration · compréhension · priorisation · applicabilité',
    },
  },

  {
    cle: 'cn-cas-2', ordre: 2,
    titre: '« Je mange bien mais je ne perds plus »',
    scenario: {
      lire: 'Ça fait trois semaines que je ne perds plus rien. Pourtant j’ai supprimé le pain et je fais attention.',
      role: 'Tu stagnes, et tu es convaincu que le coupable est « le pain » ou « le gras » — alors que tes portions du soir sont très importantes.',
      jouer: [
        '« J’ai supprimé le pain il y a un mois. Je pense que c’est le gras qui me bloque, non ? »',
      ],
      sections: [
        {
          titre: 'Si le coach te questionne',
          lignes: [
            { cle: 'Objectif', valeur: '« Perdre encore 5 kg. J’en ai perdu 4 au début, puis plus rien. »' },
            { cle: 'Pesée', valeur: '« Tous les jours. Ça monte, ça descend, ça me stresse. »' },
            { cle: 'Repas', valeur: '« Matin : café, fromage blanc. Midi : salade et poulet. Soir : pâtes ou riz avec de la viande. »' },
            { cle: 'Portions', valeur: '« Le soir je me sers largement, et souvent je me ressers. Je ne pèse rien. »' },
            { cle: 'Ce qui a changé', valeur: '« Depuis un mois je fais moins attention le week-end. »' },
            { cle: 'Grignotage', valeur: '« Presque pas… sauf le soir devant la télé. Quelques carrés de chocolat. Enfin, la tablette y passe parfois. »' },
            { cle: 'Sport', valeur: '« Deux séances par semaine, comme avant. »' },
            { cle: 'Autres repères', valeur: '« Mon pantalon est un peu plus large qu’au début, oui. »' },
            { cle: 'Santé', valeur: '« Non, rien de particulier, aucun traitement. »' },
          ],
        },
        {
          titre: 'Si le coach propose…',
          lignes: [
            { cle: 'Supprimer un aliment', valeur: '« D’accord… mais j’ai déjà enlevé le pain et ça n’a rien changé. »' },
            { cle: 'Vérifier d’abord', valeur: '« C’est vrai que je n’y avais pas pensé comme ça. »' },
            { cle: 'Portion du soir', valeur: '« Ça, je peux essayer. »' },
            { cle: 'Balayer le pain', valeur: '« Alors qu’est-ce que je fais ? »' },
            { cle: 'Moins te peser', valeur: '« Ok, mais comment je sais que ça marche, alors ? »' },
            { cle: 'Autres repères', valeur: '« Ah, ça je n’y pensais pas. »' },
          ],
        },
      ],
      attendu: 'Ne pas conclure à partir de l’aliment que le client accuse. Vérifier l’adhérence réelle, les quantités, '
        + 'la régularité et le week-end AVANT de retirer quoi que ce soit. Replacer les fluctuations du poids et les autres '
        + 'indicateurs. Le coach ne doit pas ajouter une restriction de plus.',
      observer: SANTE_FERMEE,
      evalue: 'compréhension · pertinence · posture professionnelle',
    },
  },

  {
    cle: 'cn-cas-3', ordre: 3,
    titre: 'Restaurant tous les midis, deux enfants, budget serré',
    scenario: {
      lire: 'Je mange presque tous les midis au restaurant pour le travail, et le soir je gère les enfants. '
        + 'Je n’arrive pas à faire ce qu’on me conseille.',
      role: 'Tu es sur la route : quatre déjeuners par semaine au restaurant, deux enfants le soir, peu de temps, budget serré.',
      jouer: [
        '« On m’a déjà dit de préparer mes repas à l’avance, mais ce n’est pas possible pour moi. »',
      ],
      sections: [
        {
          titre: 'Si le coach te questionne',
          lignes: [
            { cle: 'Objectif', valeur: '« Perdre un peu de ventre et avoir plus d’énergie. »' },
            { cle: 'Organisation', valeur: '« Je déjeune avec des clients ou seul, toujours au restaurant. »' },
            { cle: 'Midi', valeur: '« Entrée-plat, souvent une viande en sauce avec des frites, du pain, un dessert. »' },
            { cle: 'Soir', valeur: '« Je rentre à 19 h 30, je mange la même chose que les enfants — pâtes, plats rapides. »' },
            { cle: 'Matin', valeur: '« Café et une viennoiserie prise en route. »' },
            { cle: 'Budget', valeur: '« On fait attention. Je ne peux pas acheter des produits chers. »' },
            { cle: 'Temps', valeur: '« Cuisiner le dimanche pour la semaine, je ne le ferai pas, honnêtement. »' },
            { cle: 'Faim', valeur: '« Un coup de barre l’après-midi, dans la voiture. »' },
            { cle: 'Boissons', valeur: '« Beaucoup de café. De l’eau, pas tellement. »' },
            { cle: 'Santé', valeur: '« Non, rien de particulier, aucun traitement. »' },
          ],
        },
        {
          titre: 'Si le coach propose…',
          lignes: [
            { cle: 'Batch cooking', valeur: '« Je ne le ferai pas, je suis honnête avec toi. »' },
            { cle: 'Repères au restaurant', valeur: '« Ça oui, je peux le faire à chaque déjeuner. »' },
            { cle: 'Repas du soir simples', valeur: '« Ça m’arrangerait. »' },
            { cle: 'Le plus facile ?', valeur: '« Le midi, parce que c’est tous les jours pareil. »' },
            { cle: 'Menus à cuisiner', valeur: '« Mais je ne cuisine pas le midi, je te l’ai dit. »' },
            { cle: 'Revoir dans 15 jours', valeur: '« Oui, ça me va. »' },
          ],
        },
      ],
      attendu: 'Travailler AVEC la contrainte, pas contre elle : des repères applicables aux restaurants réellement '
        + 'fréquentés, des repas du soir compatibles avec le budget, la famille et le temps. Une action bien choisie '
        + 'vaut mieux qu’un plan complet intenable.',
      observer: SANTE_FERMEE,
      evalue: 'applicabilité · individualisation & suivi · priorisation',
    },
  },

  {
    cle: 'cn-cas-4', ordre: 4,
    titre: 'Coup de barre à l’entraînement et demande de compléments',
    scenario: {
      lire: 'Je m’entraîne le soir mais je n’ai plus d’énergie à la séance. '
        + 'Et je voulais savoir quel complément je devrais prendre.',
      role: 'Tu t’entraînes à 18 h sans rien manger depuis midi, et tu crois que manger après la séance annule tes efforts.',
      jouer: [
        '« Je pense qu’il me manque quelque chose. Un ami m’a parlé de créatine. »',
      ],
      sections: [
        {
          titre: 'Si le coach te questionne',
          lignes: [
            { cle: 'Objectif', valeur: '« Perdre de la graisse et gagner un peu de muscle. »' },
            { cle: 'Entraînement', valeur: '« Trois fois par semaine, 18 h, musculation. »' },
            { cle: 'Avant la séance', valeur: '« Rien depuis midi. J’évite, je me dis que c’est mieux pour brûler. »' },
            { cle: 'Après la séance', valeur: '« Je rentre à 20 h 30 et je ne mange presque rien : j’ai peur que ça annule ma séance. »' },
            { cle: 'Midi', valeur: '« Un plat correct, pas énorme. »' },
            { cle: 'Matin', valeur: '« Café. Parfois rien. »' },
            { cle: 'Glucides', valeur: '« J’ai réduit les féculents, c’est ce qu’on m’a dit pour sécher. »' },
            { cle: 'Sensations', valeur: '« À plat dès la deuxième série. Et je dors mal. »' },
            { cle: 'Sommeil / récupération', valeur: '« 6 h par nuit environ. Beaucoup de travail en ce moment. »' },
            { cle: 'Santé', valeur: '« Non, rien de particulier, aucun traitement. »' },
          ],
        },
        {
          titre: 'Si le coach propose…',
          lignes: [
            { cle: 'Manger avant la séance', valeur: '« Ok, mais ça ne va pas me faire prendre du poids ? »' },
            { cle: 'Le bilan de la journée', valeur: '« Ah. Donc je peux manger après ma séance ? »' },
            { cle: 'Les bases d’abord', valeur: '« C’est vrai que je ne dors pas beaucoup. »' },
            { cle: 'Un complément d’emblée', valeur: '« Donc j’en achète un et c’est réglé ? »' },
            { cle: 'Compléments plus tard', valeur: '« D’accord, ça me paraît logique. »' },
            { cle: 'Trop de changements', valeur: '« Ça fait beaucoup. Je commence par quoi ? »' },
          ],
        },
      ],
      attendu: 'Relier le manque d’énergie à l’organisation des apports autour de la séance, et corriger la croyance '
        + '(« manger après annule la séance ») sans moraliser. Sur les compléments, ce que la formation enseigne est '
        + 'd’IDENTIFIER D’ABORD si les bases de récupération et d’alimentation sont maîtrisées — pas que le sujet lui '
        + 'soit interdit. Un coach qui répond par un produit sans avoir regardé les bases inverse cette démarche ; '
        + 'un coach qui aborde les compléments après avoir traité les bases reste dans ce qui est enseigné.',
      observer: SANTE_FERMEE + ' Le sommeil court est un élément d’accompagnement, pas un motif médical.',
      // ⚠️ PAS « limites professionnelles » ICI. La formation n'enseigne pas que
      // les compléments sortent du rôle du coach : elle enseigne qu'on regarde
      // les bases d'abord. Annoncer une limite inventée orienterait le
      // certificateur vers un critère que le cas ne teste pas.
      evalue: 'pertinence des recommandations · posture professionnelle · applicabilité',
    },
  },

  {
    cle: 'cn-cas-5', ordre: 5,
    titre: 'La semaine « ratée » et le samedi soir',
    scenario: {
      lire: 'J’ai complètement raté ma semaine. Je crois que je ne suis pas fait pour ça.',
      role: 'Tu culpabilises, alors que ta semaine a été correcte quatre jours sur sept — et tu ne renonceras pas à ton samedi entre amis.',
      jouer: [
        '« J’ai tout raté. Samedi j’ai craqué, j’ai bu et j’ai mangé n’importe quoi. »',
      ],
      sections: [
        {
          titre: 'Si le coach te questionne',
          lignes: [
            { cle: 'Ce qui s’est passé', valeur: '« Apéro chez des amis samedi, puis restaurant. Dimanche j’ai fini les restes. »' },
            { cle: 'Le reste de la semaine', valeur: '« Du lundi au jeudi ça allait, j’ai fait ce qu’on avait dit. »' },
            { cle: 'L’action de la semaine', valeur: '« On avait dit des légumes le soir. Je l’ai fait quatre soirs. »' },
            { cle: 'Pourquoi ces quatre jours', valeur: '« Parce que j’avais fait les courses le lundi. »' },
            { cle: 'Alcool', valeur: '« Le samedi c’est mon moment avec mes amis. Je ne veux pas le supprimer. »' },
            { cle: 'Fréquence', valeur: '« Tous les samedis, oui. »' },
            { cle: 'Poids', valeur: '« Je n’ose plus me peser. »' },
            { cle: 'Ressenti', valeur: '« Je sais ce que je devrais faire, mais je n’y arrive pas. »' },
            { cle: 'Santé', valeur: '« Non. Le reste du temps je mange normalement, je ne me prive pas. »' },
          ],
        },
        {
          titre: 'Si le coach propose…',
          lignes: [
            { cle: 'Les 4 jours réussis', valeur: '« C’est vrai, dit comme ça… »' },
            { cle: 'Supprimer le samedi', valeur: '« Alors je ne vais pas tenir. C’est mon seul moment avec mes amis. »' },
            { cle: 'Garder le samedi', valeur: '« Ça, je pourrais le faire. »' },
            { cle: 'Il te culpabilise', valeur: 'Tais-toi un instant, puis : « Oui… je sais. » — et note-le.' },
            { cle: 'Ce qui a marché', valeur: '« Les courses du lundi. »' },
            { cle: 'Action tenable', valeur: '« Là oui, je suis sûr de le faire. »' },
          ],
        },
      ],
      attendu: 'Repartir de ce qui a marché avant d’analyser ce qui a échoué. Ne pas transformer un écart en échec, '
        + 'ni les aliments du samedi en fautes. Construire une stratégie qui GARDE le samedi. L’action retenue doit être '
        + 'une action à laquelle le client se sent capable de tenir.',
      observer: SANTE_FERMEE,
      evalue: 'posture professionnelle · individualisation & suivi · applicabilité',
    },
  },

  {
    cle: 'cn-cas-6', ordre: 6,
    titre: 'Douleurs digestives et régime trouvé sur internet',
    scenario: {
      lire: 'J’ai souvent mal au ventre après les repas. J’ai commencé à supprimer des aliments — '
        + 'tu peux me dire lesquels enlever ?',
      role: 'Tu as des douleurs digestives depuis six mois, tu supprimes des aliments un par un, et tu n’as consulté personne.',
      jouer: [
        '« J’ai déjà arrêté le lait et le gluten. Dis-moi ce que je dois supprimer d’autre. »',
      ],
      sections: [
        {
          titre: 'Si le coach te questionne',
          lignes: [
            { cle: 'Depuis quand', valeur: '« Six mois environ, plusieurs fois par semaine. »' },
            { cle: 'Ce que tu as fait', valeur: '« J’ai supprimé les produits laitiers, puis le gluten. Ça n’a rien changé. »' },
            { cle: 'Médecin', valeur: '« Non, je n’en ai parlé à personne. J’ai lu des choses sur internet. »' },
            { cle: 'Ce que tu manges', valeur: '« Peu varié maintenant. Riz, poulet, quelques légumes. »' },
            { cle: 'Poids', valeur: '« J’ai perdu 4 kg sans le vouloir ces derniers mois. »' },
            { cle: 'Objectif de départ', valeur: '« Je voulais juste manger mieux. »' },
            { cle: 'Autres signes', valeur: '« Je suis fatigué, oui. »' },
            { cle: 'S’il ne se prononce pas', valeur: 'Insiste une fois : « Mais toi, tu me dirais d’enlever quoi ? »' },
          ],
        },
        {
          titre: 'Si le coach propose…',
          lignes: [
            { cle: 'Liste d’évictions', valeur: '« D’accord, je fais ça alors. » — et note qu’il a pris la situation en charge.' },
            { cle: 'Il t’oriente', valeur: '« Tu penses vraiment ? Je croyais que c’était juste alimentaire. »' },
            { cle: 'Il oriente et reste', valeur: '« Ok, ça me rassure. »' },
            { cle: 'Il se retire', valeur: 'Ne réagis pas, laisse-le finir.' },
            { cle: 'Il pose un diagnostic', valeur: '« Donc c’est ça ? »' },
            { cle: 'Revoir après avis', valeur: '« Oui, je te dirai. »' },
          ],
        },
      ],
      attendu: 'Deux choses, et elles vont ensemble : reconnaître que la situation relève d’un professionnel de santé '
        + 'et orienter clairement ; ET rester présent sur ce qui reste de son ressort, sans diagnostic ni liste d’éviction. '
        + 'On n’attend pas du coach qu’il nomme une pathologie : ce n’est pas son rôle. Orienter n’est pas abandonner.',
      observer: 'Cette situation dépasse le cadre d’accompagnement nutritionnel attendu du coach : douleurs digestives '
        + 'récurrentes depuis six mois, perte de poids involontaire, exclusions alimentaires successives sans avis médical. '
        + 'Le coach doit le reconnaître et orienter vers un professionnel adapté. Tu n’as rien à interpréter : constate '
        + 'seulement s’il reste dans son rôle ou s’il cherche à prendre en charge la situation lui-même.',
      evalue: 'limites professionnelles · orientation · posture professionnelle',
    },
  },
];

module.exports = {
  COACH_NUTRITION,
  GRILLE_COACH_NUTRITION, MARQUEUR_GRILLE_NUTRITION,
  CAS_COACH_NUTRITION, MARQUEUR_CAS_NUTRITION,
};
