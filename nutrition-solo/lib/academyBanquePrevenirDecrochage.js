'use strict';
// ============================================================================
//  MY COACH ACADEMY — banque « Prévenir le décrochage et réengager un client ».
//
//  DES DONNÉES, RIEN D'AUTRE. Ce fichier ne contient aucune logique : il décrit
//  une formation, ses modules, ses vidéos, ses deux banques de questions et ses
//  réglages. C'est l'amorçage voisin qui les écrit en base, une seule fois.
//
//  Calqué sur academyBanqueCycleMenstruel.js, à la ligne près. Le moteur
//  Academy n'a pas été touché : une formation nouvelle est une DONNÉE.
// ============================================================================

const FORMATION = {
  cle: 'prevenir_decrochage',
  libelle: 'Prévenir le décrochage et réengager un client',
  // Le titre que porte celui qui l'obtient. Dérivé du libellé, à ajuster d'un
  // mot si tu préfères une autre formulation sur le diplôme.
  titre: 'Prévention du décrochage',
  description: 'Détecter assez tôt les signes de décrochage d’un client, comprendre les vraies causes du désengagement, mener la conversation qui les révèle, transformer cette conversation en engagement concret, et savoir à quel moment alerter le Coach Leader.',
  ordre: 3,
  // Savoir conduire cette conversation ne se mesure pas par un QCM : une
  // évaluation pratique humaine est exigée avant la certification.
  pratiqueObligatoire: true,
  certificationActive: true,
};

// L'identifiant du module 5, fourni après coup : il ne figurait ni dans le
// dépôt ni en base, et n'a donc pas été deviné.
const YOUTUBE_M05 = '8COP26F59Oo';

const MODULES = [
  {
    ordre: 1, prefixe: 'pd-m01',
    titre: 'Détecter un client qui décroche',
    description: 'Dans cette vidéo, découvre les signaux qui précèdent une résiliation : annulations plus fréquentes, régularité qui baisse, rendez-vous déplacés, implication qui s’effrite. L’objectif : repérer le décrochage à la répétition, au changement et à l’accumulation des signaux, pas à un incident isolé.',
    youtubeId: 'RGex8Y-wzvM',
    questions: [
      {
        enonce: 'Un client annule une séance cette semaine, ce qui ne lui arrive jamais. Que fais-tu ?',
        choix: [
          ['Tu alertes immédiatement le Coach Leader', 0],
          ['Tu notes l’information et tu observes si le comportement se répète', 1],
          ['Tu considères qu’il décroche et tu adaptes tout son programme', 0],
          ['Tu ne relèves rien : une annulation n’a jamais de sens', 0],
        ],
      },
      {
        enonce: 'Quels sont les trois critères qui transforment un signal isolé en signe de décrochage ?',
        choix: [
          ['La répétition, le changement et l’accumulation', 1],
          ['La fréquence, le prix et l’ancienneté', 0],
          ['L’âge, l’objectif et la disponibilité', 0],
          ['La motivation, la fatigue et le travail', 0],
        ],
      },
      {
        enonce: 'Que signifie précisément le critère « changement » ?',
        choix: [
          ['Le client a changé d’objectif depuis son inscription', 0],
          ['Le coach a changé sa façon de mener les séances', 0],
          ['Le comportement observé diffère de ce que ce client fait d’habitude', 1],
          ['Le club a changé ses horaires d’ouverture', 0],
        ],
      },
      {
        enonce: 'Dans quel ordre la méthode du module se déroule-t-elle ?',
        choix: [
          ['Agir, puis observer, puis comparer, puis détecter', 0],
          ['Comparer, puis agir, puis observer, puis détecter', 0],
          ['Détecter, puis observer, puis agir, puis comparer', 0],
          ['Observer, puis comparer, puis détecter, puis agir', 1],
        ],
      },
      {
        enonce: 'Thomas vient depuis un an trois fois par semaine. Depuis trois semaines il ne vient plus qu’une fois, déplace ses rendez-vous et parle souvent de son manque de temps. Comment lis-tu la situation ?',
        choix: [
          ['Plusieurs signaux se répètent et s’accumulent : c’est un décrochage qui commence', 1],
          ['C’est une période chargée, il n’y a rien à observer', 0],
          ['Un seul signal suffirait déjà à conclure au décrochage', 0],
          ['Le manque de temps est la cause certaine, il faut alléger ses séances', 0],
        ],
      },
    ],
  },
  {
    ordre: 2, prefixe: 'pd-m02',
    titre: 'Comprendre la vraie cause',
    description: 'Dans cette vidéo, découvre pourquoi le symptôme observé n’est presque jamais la cause : fatigue, travail, horaires devenus incompatibles, résultats non perçus, objectif qui a perdu son sens. L’objectif : questionner et comprendre avant de proposer la moindre solution.',
    youtubeId: '9IFI3X8RZAc',
    questions: [
      {
        enonce: 'Un client espace ses séances. Quelle conclusion le coach doit-il éviter ?',
        choix: [
          ['Se dire qu’il manque de motivation', 1],
          ['Se demander si ses horaires ont changé', 0],
          ['Se demander s’il perçoit ses résultats', 0],
          ['Se demander si ses séances sont devenues monotones', 0],
        ],
      },
      {
        enonce: 'Quelle est la différence entre le symptôme et la cause ?',
        choix: [
          ['Il n’y en a pas : le comportement observé est la cause', 0],
          ['Le symptôme est ce que le coach observe, la cause est ce qui le produit', 1],
          ['Le symptôme concerne le corps, la cause concerne le mental', 0],
          ['Le symptôme vient du client, la cause vient toujours du coach', 0],
        ],
      },
      {
        enonce: 'Un décrochage peut-il avoir plusieurs causes en même temps ?',
        choix: [
          ['Non, il faut toujours identifier la cause unique', 0],
          ['Non, sinon la situation relève du Coach Leader', 0],
          ['Oui, un décrochage est souvent multifactoriel', 1],
          ['Oui, mais seulement chez les clients récents', 0],
        ],
      },
      {
        enonce: 'Dans quel ordre se déroule la méthode de ce module ?',
        choix: [
          ['Questionner, écouter, comprendre, adapter', 1],
          ['Adapter, questionner, écouter, comprendre', 0],
          ['Comprendre, adapter, questionner, écouter', 0],
          ['Écouter, adapter, comprendre, questionner', 0],
        ],
      },
      {
        enonce: 'Une cliente vient moins depuis un mois. Elle t’explique que ses horaires de travail ont changé. Que fais-tu ?',
        choix: [
          ['Tu conclus que la vraie cause est le manque de motivation', 0],
          ['Tu proposes tout de suite un nouveau programme plus intense', 0],
          ['Tu creuses avec elle ce que ce changement d’horaires rend impossible, puis tu adaptes', 1],
          ['Tu attends qu’elle revienne d’elle-même à ses anciens horaires', 0],
        ],
      },
    ],
  },
  {
    ordre: 3, prefixe: 'pd-m03',
    titre: 'Faire parler le client',
    description: 'Dans cette vidéo, découvre comment mener la conversation qui fait émerger la vraie cause : partir de faits observables, poser des questions ouvertes une par une, accepter les silences, reformuler. L’objectif : chercher à comprendre plutôt qu’à convaincre.',
    youtubeId: 'ktar7fx7T9Q',
    questions: [
      {
        enonce: 'Quel est l’objectif de cette conversation ?',
        choix: [
          ['Remotiver le client par un discours convaincant', 0],
          ['Lui rappeler l’objectif qu’il s’était fixé à l’inscription', 0],
          ['Obtenir qu’il reprenne un rythme normal dès la semaine suivante', 0],
          ['Comprendre ce qui se passe réellement pour lui', 1],
        ],
      },
      {
        enonce: 'Comment ouvrir la conversation ?',
        choix: [
          ['En partant d’un fait observable, sans l’interpréter', 1],
          ['En lui disant qu’il semble avoir perdu sa motivation', 0],
          ['En lui demandant s’il compte résilier', 0],
          ['En lui proposant directement une solution', 0],
        ],
      },
      {
        enonce: 'Le client se tait quelques secondes après ta question. Que fais-tu ?',
        choix: [
          ['Tu enchaînes avec une deuxième question pour éviter le blanc', 0],
          ['Tu proposes toi-même une réponse possible', 0],
          ['Tu laisses le silence : il lui laisse le temps de formuler', 1],
          ['Tu changes de sujet pour ne pas le mettre mal à l’aise', 0],
        ],
      },
      {
        enonce: 'À quoi sert la reformulation ?',
        choix: [
          ['À gagner du temps pendant la conversation', 0],
          ['À vérifier que tu as bien compris ce qu’il a voulu dire', 1],
          ['À lui montrer que tu maîtrises le sujet', 0],
          ['À l’amener à changer d’avis sur ce qu’il vient de dire', 0],
        ],
      },
      {
        enonce: 'Un client te dit que les séances ne lui apportent plus grand-chose. Quelle réaction est la bonne ?',
        choix: [
          ['Lui expliquer pourquoi son programme est pourtant bien construit', 0],
          ['Minimiser en lui disant que c’est un passage normal', 0],
          ['Proposer immédiatement de changer toute sa programmation', 0],
          ['Lui demander ce qui a changé pour lui, et écouter sa réponse', 1],
        ],
      },
    ],
  },
  {
    ordre: 4, prefixe: 'pd-m04',
    titre: 'Créer un nouvel engagement',
    description: 'Dans cette vidéo, découvre comment transformer une conversation en action concrète : un engagement réaliste, précis, accepté et planifié, calibré avec l’échelle de confiance. L’objectif : sortir des intentions vagues et obtenir un rendez-vous que le client tiendra vraiment.',
    youtubeId: '8WNrTxTtAGI',
    questions: [
      {
        enonce: 'Quelles sont les quatre qualités d’un bon engagement ?',
        choix: [
          ['Ambitieux, mesurable, écrit et affiché', 0],
          ['Réaliste, précis, accepté par le client et planifié', 1],
          ['Rapide, intense, régulier et contrôlé', 0],
          ['Court, gratuit, renouvelable et sans contrainte', 0],
        ],
      },
      {
        enonce: 'Parmi ces réponses de client, laquelle constitue un véritable engagement ?',
        choix: [
          ['« Je vais essayer de revenir plus souvent »', 0],
          ['« Je vais me remotiver dès la semaine prochaine »', 0],
          ['« Cette semaine je viens mardi à 18 h »', 1],
          ['« Je vais faire un effort, c’est promis »', 0],
        ],
      },
      {
        enonce: 'À quelles questions un engagement doit-il répondre ?',
        choix: [
          ['Pourquoi et pour qui', 0],
          ['Où et avec qui', 0],
          ['Comment et à quel prix', 0],
          ['Quoi, quand, et éventuellement combien', 1],
        ],
      },
      {
        enonce: 'Un client évalue à 4 sur 10 sa confiance dans l’engagement qu’il vient de prendre. Qu’en conclus-tu ?',
        choix: [
          ['L’engagement est trop ambitieux : il faut le revoir à la baisse', 1],
          ['C’est suffisant, il faut le laisser essayer', 0],
          ['Le client manque de volonté, il faut l’encourager davantage', 0],
          ['Il faut au contraire l’augmenter pour créer un défi', 0],
        ],
      },
      {
        enonce: 'Un client très pris ne peut manifestement pas tenir trois séances par semaine. Quelle est la meilleure décision ?',
        choix: [
          ['Maintenir trois séances : baisser reviendrait à renoncer', 0],
          ['Convenir d’une séance par semaine, réellement tenue, et la planifier', 1],
          ['Laisser le client venir quand il le pourra, sans rien fixer', 0],
          ['Suspendre l’accompagnement jusqu’à ce qu’il ait plus de temps', 0],
        ],
      },
    ],
  },
  {
    ordre: 5, prefixe: 'pd-m05',
    titre: 'Ne pas attendre la résiliation',
    description: 'Dans cette vidéo, découvre à quel moment la situation doit remonter au Coach Leader, et ce que contient une alerte utile : ce que tu observes, ce que le client t’a dit, ce que vous avez déjà tenté, ce qui se passe maintenant. L’objectif : alerter à temps sans se décharger du suivi.',
    youtubeId: YOUTUBE_M05,
    questions: [
      {
        enonce: 'Quand faut-il alerter le Coach Leader ?',
        choix: [
          ['À chaque annulation, pour qu’il ait toute l’information', 0],
          ['Uniquement lorsque le client a annoncé sa résiliation', 0],
          ['Lorsque les signaux se répètent ou que le risque persiste malgré une première adaptation', 1],
          ['Jamais : la relation client appartient au coach', 0],
        ],
      },
      {
        enonce: 'Un client évoque pour la première fois l’idée d’arrêter. Que fais-tu ?',
        choix: [
          ['Tu attends de voir s’il en reparle au prochain rendez-vous', 0],
          ['Tu fais circuler l’information : dès que l’idée d’arrêter apparaît clairement, elle doit remonter', 1],
          ['Tu lui proposes une réduction pour le retenir', 0],
          ['Tu n’en parles pas pour ne pas alarmer l’équipe', 0],
        ],
      },
      {
        enonce: 'Qu’est-ce qu’alerter le Coach Leader ne signifie pas ?',
        choix: [
          ['Signaler une situation à risque', 0],
          ['Transmettre ce que le client a exprimé', 0],
          ['Demander un soutien sur une situation difficile', 0],
          ['Se décharger du client et arrêter d’agir', 1],
        ],
      },
      {
        enonce: 'Que contient une alerte utile ?',
        choix: [
          ['Ce que j’observe, ce que le client m’a dit, ce que nous avons tenté, ce qui se passe maintenant', 1],
          ['Le nom du client, son ancienneté et le montant de son abonnement', 0],
          ['Mon avis sur sa motivation et une estimation du risque en pourcentage', 0],
          ['La liste de ses absences depuis son inscription', 0],
        ],
      },
      {
        enonce: 'Après ton alerte, que continues-tu à faire auprès du client ?',
        choix: [
          ['Rien : le Coach Leader reprend la situation à son compte', 0],
          ['Uniquement les séances, sans plus chercher à comprendre', 0],
          ['Tes séances, ton écoute, tes adaptations et ton observation', 1],
          ['Tu attends ses instructions avant tout nouvel échange', 0],
        ],
      },
    ],
  },
];

// Les questions du QCM final : TRANSVERSALES, rattachées à aucun module.
const FINALE = [
  {
    enonce: 'Depuis trois semaines, un client habituellement très régulier annule davantage, semble moins impliqué et évoque souvent son manque de temps. Quelle est la meilleure première réaction ?',
    choix: [
      ['Lui proposer un programme plus motivant', 0],
      ['Attendre qu’il reprenne de lui-même son rythme', 0],
      ['Ouvrir la conversation à partir de ce que tu observes, pour comprendre', 1],
      ['Alerter immédiatement le Coach Leader et suspendre le suivi', 0],
    ],
  },
  {
    enonce: 'Qu’est-ce qui distingue un incident ponctuel d’un début de décrochage ?',
    choix: [
      ['La répétition, le changement par rapport à l’habitude, et l’accumulation de signaux', 1],
      ['La durée du contrat restant à courir', 0],
      ['Le nombre de séances déjà réalisées', 0],
      ['Le fait que le client en parle spontanément', 0],
    ],
  },
  {
    enonce: 'Un client vient de rater deux séances en un mois alors qu’il est d’ordinaire irrégulier. Que conclus-tu ?',
    choix: [
      ['C’est un décrochage certain, il faut réagir vite', 0],
      ['Ce n’est pas un changement par rapport à son habitude : à observer, sans conclure', 1],
      ['Il faut l’alerter qu’il risque de perdre ses résultats', 0],
      ['Il faut prévenir le Coach Leader dès maintenant', 0],
    ],
  },
  {
    enonce: 'Quel réflexe le coach doit-il abandonner face à un client qui s’espace ?',
    choix: [
      ['Comparer son comportement actuel à son comportement habituel', 0],
      ['Conclure d’emblée qu’il manque de motivation', 1],
      ['Chercher ce qui a changé dans sa vie', 0],
      ['Observer plusieurs séances avant de se prononcer', 0],
    ],
  },
  {
    enonce: 'Une cliente explique qu’elle ne voit plus de résultats et que ses horaires ont changé. Comment traites-tu la situation ?',
    choix: [
      ['Tu retiens la cause la plus probable et tu agis dessus', 0],
      ['Tu attends qu’elle précise laquelle des deux compte vraiment', 0],
      ['Tu prends en compte les deux : un décrochage est souvent multifactoriel', 1],
      ['Tu conclus que le problème vient de son programme', 0],
    ],
  },
  {
    enonce: 'Pourquoi comprendre la cause doit-il précéder la proposition de solution ?',
    choix: [
      ['Parce qu’une solution posée sur un symptôme ne traite pas ce qui produit le décrochage', 1],
      ['Parce que le client refuse toujours la première solution proposée', 0],
      ['Parce que le Coach Leader l’exige avant toute adaptation', 0],
      ['Parce que cela permet de gagner du temps sur la séance', 0],
    ],
  },
  {
    enonce: 'Comment ouvrir une conversation sur un décrochage ?',
    choix: [
      ['En annonçant au client qu’il est en train de décrocher', 0],
      ['En lui demandant s’il envisage d’arrêter', 0],
      ['En lui rappelant ce qu’il avait promis à l’inscription', 0],
      ['En énonçant un fait observable, sans l’interpréter', 1],
    ],
  },
  {
    enonce: 'Pendant la conversation, le client raconte longuement sa situation. Quelle est ta priorité ?',
    choix: [
      ['Écouter réellement, puis rebondir sur ce qu’il vient de dire', 1],
      ['Prendre des notes pour l’alerte au Coach Leader', 0],
      ['Chercher l’argument qui le fera revenir', 0],
      ['L’orienter vers la solution que tu as déjà en tête', 0],
    ],
  },
  {
    enonce: 'Quelle attitude ruine une conversation de réengagement ?',
    choix: [
      ['Poser une question ouverte à la fois', 0],
      ['Se défendre lorsque le client exprime une insatisfaction', 1],
      ['Reformuler ce qu’il vient d’expliquer', 0],
      ['Accepter un silence après une question', 0],
    ],
  },
  {
    enonce: 'Un client dit que les séances sont devenues répétitives. Que fais-tu en premier ?',
    choix: [
      ['Tu changes immédiatement toute sa programmation', 0],
      ['Tu lui expliques pourquoi la répétition est nécessaire à la progression', 0],
      ['Tu creuses ce qu’il trouve répétitif exactement, puis tu adaptes', 1],
      ['Tu lui proposes de changer de coach', 0],
    ],
  },
  {
    enonce: 'Une conversation qui a fait émerger la vraie cause mais ne débouche sur rien de concret est :',
    choix: [
      ['Suffisante : le client se sent écouté, il reviendra', 0],
      ['Incomplète : elle doit aboutir à un engagement précis et planifié', 1],
      ['Réussie, à condition d’en informer le Coach Leader', 0],
      ['À recommencer entièrement la semaine suivante', 0],
    ],
  },
  {
    enonce: 'Ton client conclut par « je vais essayer de revenir plus souvent ». Que fais-tu ?',
    choix: [
      ['Tu acceptes : l’intention est là, c’est le principal', 0],
      ['Tu lui demandes de s’engager sur trois séances par semaine', 0],
      ['Tu notes l’échange et tu attends la semaine prochaine', 0],
      ['Tu l’amènes à préciser quoi et quand, pour en faire un engagement réel', 1],
    ],
  },
  {
    enonce: 'À quoi sert l’échelle de confiance de 0 à 10 ?',
    choix: [
      ['À mesurer la satisfaction du client vis-à-vis de son coach', 0],
      ['À vérifier que l’engagement pris est réellement tenable pour lui', 1],
      ['À évaluer le risque de résiliation à transmettre au Coach Leader', 0],
      ['À noter la difficulté de la séance qui vient d’être réalisée', 0],
    ],
  },
  {
    enonce: 'Un client se donne 9 sur 10 sur un engagement modeste, et 4 sur 10 sur un engagement ambitieux. Lequel retiens-tu ?',
    choix: [
      ['Le modeste : mieux vaut temporairement faire moins mais le faire réellement', 1],
      ['L’ambitieux : il tirera le client vers le haut', 0],
      ['Les deux, pour lui laisser le choix au moment venu', 0],
      ['Aucun : il faut d’abord régler la cause du décrochage', 0],
    ],
  },
  {
    enonce: 'Après avoir obtenu un engagement, que reste-t-il à faire ?',
    choix: [
      ['Rien : l’engagement se suffit à lui-même', 0],
      ['Le transmettre au Coach Leader pour validation', 0],
      ['Le planifier, puis en assurer le suivi', 1],
      ['Attendre le prochain signal de décrochage', 0],
    ],
  },
  {
    enonce: 'Tu as adapté l’accompagnement il y a trois semaines, et la régularité continue pourtant de se dégrader. Que fais-tu ?',
    choix: [
      ['Tu laisses encore un mois avant d’en tirer une conclusion', 0],
      ['Tu attends que le client aborde lui-même le sujet', 0],
      ['Tu changes une nouvelle fois de programme sans en parler', 0],
      ['Tu alertes le Coach Leader : le risque persiste malgré une première adaptation', 1],
    ],
  },
  {
    enonce: 'Quelle situation ne justifie pas, à elle seule, une alerte au Coach Leader ?',
    choix: [
      ['Un client qui évoque une pause', 0],
      ['Une annulation isolée sans autre signal', 1],
      ['Une insatisfaction exprimée par le client', 0],
      ['Une tentative de réengagement qui n’a rien changé', 0],
    ],
  },
  {
    enonce: 'Quelle est la bonne façon de formuler une alerte ?',
    choix: [
      ['« Thomas va résilier, il faut faire quelque chose »', 0],
      ['« Thomas n’est plus motivé, je ne sais plus quoi faire »', 0],
      ['« Thomas est passé de trois à une séance, il évoque son travail ; nous avons décalé ses horaires et la régularité ne remonte pas »', 1],
      ['« Thomas pose problème, peux-tu le rappeler ? »', 0],
    ],
  },
  {
    enonce: 'Dans quel ordre la démarche complète se déroule-t-elle ?',
    choix: [
      ['Détecter, discuter, tenter, observer, alerter', 1],
      ['Alerter, détecter, discuter, tenter, observer', 0],
      ['Discuter, alerter, détecter, tenter, observer', 0],
      ['Tenter, observer, détecter, alerter, discuter', 0],
    ],
  },
  {
    enonce: 'Quel est le risque principal d’attendre l’annonce de résiliation pour agir ?',
    choix: [
      ['Le client aura déjà pris sa décision, et l’accompagnement n’aura plus de prise', 1],
      ['Le Coach Leader reprochera au coach son manque de résultats', 0],
      ['Le client demandera un remboursement de ses séances', 0],
      ['L’équipe perdra du temps à traiter le dossier', 0],
    ],
  },
];

// Le référentiel de cas pratiques, validé. Chaque cas porte sa mise en
// situation complète : l'évaluateur mène la séance sans document externe.
//
// ⚠️ « À REPASSER NOTAMMENT SI » N'EST PAS UNE RÈGLE LOGICIELLE. Le moteur
// stocke ce texte et l'affiche ; il ne l'interprète jamais. Le verdict reste
// les deux boutons de l'évaluateur.
//
// Tous les critères sont dérivés du contenu des cinq modules — aucune
// compétence qui n'y soit pas enseignée.
const CAS = [
  {
    cle: 'pd-cas-1', ordre: 1,
    titre: 'Trois signaux en trois semaines',
    consignes: `SITUATION PRÉSENTÉE AU COACH
Thomas vient depuis un an, trois fois par semaine, toujours aux mêmes créneaux. Depuis trois semaines : il a annulé deux fois, déplacé trois rendez-vous, et n’est venu qu’une fois la semaine dernière. En séance, il parle plusieurs fois de son manque de temps.
Le coach doit dire ce qu’il observe et ce qu’il en fait.

CE QUE L’ÉVALUATEUR OBSERVE
Le coach lit-il la situation avec les trois critères du module — la répétition, le changement par rapport à l’habitude de CE client, l’accumulation de plusieurs signaux — ou réagit-il à un signal isolé, ou au contraire ne voit-il rien ?

COMPORTEMENT ATTENDU
Le coach nomme les signaux qu’il observe : annulations, rendez-vous déplacés, régularité en baisse, discours récurrent sur le manque de temps.
Il compare au comportement habituel de Thomas, et non à une norme générale.
Il conclut qu’il ne s’agit pas d’un incident isolé mais d’un début de décrochage.
Il décide d’agir maintenant, en ouvrant la conversation — sans attendre le mois suivant.

VALIDATION
Le coach :
- cite plusieurs signaux, pas un seul ;
- s’appuie sur la répétition, le changement et l’accumulation ;
- compare Thomas à lui-même ;
- enchaîne sur une action : observer, comparer, détecter, agir.

À REPASSER NOTAMMENT SI
- il conclut au décrochage sur un seul signal ;
- il attend l’annonce d’une résiliation pour réagir ;
- il compare Thomas à d’autres clients au lieu de son propre comportement ;
- il désigne d’emblée une cause au lieu de constater des faits ;
- il ne fait rien de son observation.`,
  },
  {
    cle: 'pd-cas-2', ordre: 2,
    titre: '« Je manque de temps »',
    consignes: `SITUATION PRÉSENTÉE AU COACH
Une cliente régulière depuis huit mois vient deux fois moins depuis un mois. Interrogée, elle répond : « En ce moment je manque de temps, c’est compliqué. »
Le coach doit conduire la suite de l’échange.

CE QUE L’ÉVALUATEUR OBSERVE
Le coach s’arrête-t-il au motif avancé, ou cherche-t-il ce qui le produit ? Le module distingue le symptôme observé de sa cause réelle, et interdit le raccourci « elle manque de motivation ».

COMPORTEMENT ATTENDU
Le coach ne prend pas « je manque de temps » pour une explication finale : c’est un point de départ.
Il questionne ce qui a changé — horaires de travail, contraintes familiales, fatigue, créneaux devenus incompatibles, résultats qu’elle ne perçoit plus, objectif qui a perdu son sens, séances devenues monotones.
Il accepte que plusieurs causes se cumulent.
Il ne propose une adaptation qu’après avoir compris.

VALIDATION
Le coach :
- creuse derrière le motif avancé ;
- envisage plusieurs causes possibles sans en imposer une ;
- admet qu’un décrochage peut être multifactoriel ;
- comprend d’abord, adapte ensuite.

À REPASSER NOTAMMENT SI
- il conclut au manque de motivation ;
- il accepte « je manque de temps » comme cause définitive ;
- il propose une solution avant d’avoir compris ;
- il retient une cause unique alors que la cliente en évoque plusieurs ;
- il traite le symptôme en ignorant ce qui le produit.`,
  },
  {
    cle: 'pd-cas-3', ordre: 3,
    titre: 'Le client qui ne dit rien',
    consignes: `SITUATION PRÉSENTÉE AU COACH
Un client dont la régularité baisse répond par phrases courtes. À la question « comment ça va en ce moment ? », il répond « ça va » et se tait.
Le coach doit mener la conversation malgré ce silence.

CE QUE L’ÉVALUATEUR OBSERVE
Le coach cherche-t-il à comprendre, ou à meubler et à convaincre ? Le module pose que l’objectif de la conversation est de comprendre, et que le silence fait partie de la conversation.

COMPORTEMENT ATTENDU
Le coach part d’un fait observable, sans l’interpréter : « tu es venu une fois cette semaine, alors que d’habitude tu viens trois fois ».
Il pose des questions ouvertes, une à la fois.
Il accepte les silences et laisse au client le temps de formuler.
Il rebondit sur ce que le client vient de dire plutôt que de dérouler une liste préparée.
Il reformule pour vérifier qu’il a bien compris.

VALIDATION
Le coach :
- ouvre sur un fait, pas sur une interprétation ;
- pose des questions ouvertes, une par une ;
- laisse les silences exister ;
- écoute et rebondit ;
- reformule avant de conclure.

À REPASSER NOTAMMENT SI
- il enchaîne les questions pour éviter le blanc ;
- il répond à la place du client ;
- il pose plusieurs questions en une seule ;
- il cherche à convaincre ou à remotiver par un discours ;
- il propose une solution avant d’avoir compris.`,
  },
  {
    cle: 'pd-cas-4', ordre: 4,
    titre: '« Les séances ne m’apportent plus rien »',
    consignes: `SITUATION PRÉSENTÉE AU COACH
En fin de séance, un client dit : « Franchement, je ne sais pas si ça sert encore à grand-chose. Les séances ne m’apportent plus rien. »
Le coach doit réagir sur le moment.

CE QUE L’ÉVALUATEUR OBSERVE
Face à une insatisfaction qui le vise, le coach se défend-il, minimise-t-il, corrige-t-il aussitôt le programme — ou cherche-t-il d’abord à comprendre ?

COMPORTEMENT ATTENDU
Le coach ne se justifie pas et n’explique pas pourquoi le programme est pourtant bien construit.
Il ne minimise pas en disant que c’est un passage normal.
Il demande ce qui a changé, ce que le client attendait, ce qu’il ne retrouve plus.
Il écoute la réponse et la reformule.
Il n’ouvre une solution qu’ensuite : cela peut être une adaptation des séances, mais après avoir compris ce qui ne va pas.

VALIDATION
Le coach :
- accueille l’insatisfaction sans se défendre ;
- ne minimise pas le ressenti ;
- questionne pour comprendre ce qui a changé ;
- reformule ;
- ne propose une adaptation qu’après.

À REPASSER NOTAMMENT SI
- il justifie son programme ;
- il répond que c’est normal, que ça arrive à tout le monde ;
- il change toute la programmation immédiatement ;
- il prend la remarque comme une attaque personnelle ;
- il coupe la conversation pour passer à autre chose.`,
  },
  {
    cle: 'pd-cas-5', ordre: 5,
    titre: '« Je vais essayer de revenir plus souvent »',
    consignes: `SITUATION PRÉSENTÉE AU COACH
La conversation a bien fonctionné : le client a expliqué que ses horaires de travail ont changé et qu’il n’arrive plus à venir en fin de journée. Il conclut : « C’est bon, je vais essayer de revenir plus souvent. »
Le coach doit conclure l’échange.

CE QUE L’ÉVALUATEUR OBSERVE
Le coach se satisfait-il d’une intention, ou obtient-il un engagement réel ? Le module pose qu’un engagement doit être réaliste, précis, accepté par le client et planifié.

COMPORTEMENT ATTENDU
Le coach ne se contente pas de « je vais essayer ».
Il amène le client à préciser QUOI, QUAND, et si besoin COMBIEN — par exemple un jour et une heure, ou un nombre de séances par semaine sur une période donnée.
Il tient compte de la contrainte réelle : les horaires ont changé, l’engagement doit tenir dans la nouvelle vie du client.
Il peut utiliser l’échelle de confiance de 0 à 10 : si le client se donne 4 sur 10, l’engagement est trop ambitieux et doit être revu à la baisse ; on vise 8 ou 9.
Il assume qu’il vaut mieux temporairement faire moins mais le faire réellement.
Il planifie, et prévoit un suivi.

VALIDATION
Le coach :
- transforme l’intention en engagement précis et daté ;
- l’ajuste à la contrainte réelle du client ;
- s’assure que le client l’accepte, éventuellement via l’échelle de confiance ;
- planifie et annonce un suivi.

À REPASSER NOTAMMENT SI
- il accepte « je vais essayer » comme conclusion ;
- il fixe l’engagement à la place du client ;
- il maintient un volume que le client ne peut manifestement pas tenir ;
- il conserve un engagement évalué à 4 sur 10 par le client ;
- il obtient un engagement mais ne le planifie pas.`,
  },
  {
    cle: 'pd-cas-6', ordre: 6,
    titre: 'Ça ne remonte pas',
    consignes: `SITUATION PRÉSENTÉE AU COACH
Il y a trois semaines, le coach a repéré le décrochage de Thomas, mené la conversation et convenu avec lui d’une séance par semaine, le mardi. Thomas est venu une fois, puis plus. Il est de plus en plus difficile à reprogrammer et a évoqué « peut-être faire une pause ».
Le coach doit décider de la suite.

CE QUE L’ÉVALUATEUR OBSERVE
Le coach sait-il reconnaître le moment où la situation doit remonter au Coach Leader, et sait-il formuler une alerte utile sans se décharger du suivi ?

COMPORTEMENT ATTENDU
Le coach alerte : le risque persiste malgré une première adaptation, et l’idée d’arrêter a été évoquée clairement.
Son alerte contient les quatre éléments : ce qu’il observe, ce que le client lui a dit, ce qui a déjà été tenté, ce qui se passe maintenant.
Il continue son travail : ses séances, son écoute, ses adaptations, son observation. Le Coach Leader vient en soutien, il ne reprend pas le client.

VALIDATION
Le coach :
- alerte au bon moment, sur la persistance et sur l’évocation d’un arrêt ;
- formule une alerte factuelle et complète, sur les quatre points ;
- distingue alerter et transférer ;
- poursuit son accompagnement après l’alerte.

À REPASSER NOTAMMENT SI
- il attend l’annonce formelle de la résiliation ;
- il alerte sans dire ce qui a déjà été tenté ;
- il transmet un jugement (« il n’est plus motivé ») au lieu de faits ;
- il considère qu’après l’alerte, la situation ne lui appartient plus ;
- il n’alerte pas alors que le client a évoqué une pause.`,
  },
];

const REGLAGES = { qcmNbQuestions: 20, qcmSeuilPct: 80, miniNbQuestions: 5, miniSeuilPct: 80 };

const MARQUEUR = 'banque_prevenir_decrochage_v1';
const MARQUEUR_CAS = 'cas_prevenir_decrochage_v1';
const MARQUEUR_CONSIGNES = 'cas_prevenir_decrochage_consignes_v1';

module.exports = {
  FORMATION, MODULES, FINALE, CAS, REGLAGES,
  MARQUEUR, MARQUEUR_CAS, MARQUEUR_CONSIGNES, YOUTUBE_M05,
};
