'use strict';
// ============================================================================
//  MY COACH ACADEMY — banque « Maîtriser les mouvements fondamentaux ».
//
//  DES DONNÉES, RIEN D'AUTRE. Le moteur Academy n'est pas touché : une
//  formation nouvelle est une DONNÉE. Calqué sur les banques voisines.
// ============================================================================

const FORMATION = {
  cle: 'mouvements_fondamentaux',
  libelle: 'Maîtriser les mouvements fondamentaux et savoir les corriger',
  titre: 'Maîtrise des mouvements fondamentaux',
  description: 'Développe ton œil de coach pour observer, corriger et adapter les mouvements fondamentaux. Apprends à identifier les vraies priorités, choisir les bonnes corrections et faire progresser chaque client de manière individualisée.',
  ordre: 4,
  pratiqueObligatoire: true,
  certificationActive: true,
};

const MODULES = [
  {
    ordre: 1, prefixe: 'mf-m01',
    titre: 'Former son œil de coach : savoir quoi regarder',
    description: 'Dans cette vidéo, découvre ce qu’il faut réellement observer avant d’intervenir : appuis, articulations, trajectoire, amplitude, contrôle. L’objectif : distinguer une erreur technique d’une variation individuelle et choisir UNE priorité.',
    youtubeId: 'N5jHrHsGD9w',
    questions: [
      {
        enonce: 'Dans quel ordre la hiérarchie d’observation doit-elle être appliquée ?',
        choix: [
          ['Sécurité, stabilité, mouvement, performance', 1],
          ['Performance, amplitude, stabilité, sécurité', 0],
          ['Mouvement, sécurité, performance, amplitude', 0],
          ['Stabilité, contrôle, sécurité, mouvement', 0],
        ],
      },
      {
        enonce: 'Un client squatte avec un buste plus incliné que les autres, sans douleur ni perte de contrôle. Que fais-tu ?',
        choix: [
          ['Tu corriges sa position pour aligner son buste sur celui du groupe', 0],
          ['Tu arrêtes la série et tu changes aussitôt d’exercice', 0],
          ['Tu considères que c’est une variation individuelle acceptable', 1],
          ['Tu ajoutes une charge pour l’obliger à se redresser', 0],
        ],
      },
      {
        enonce: 'Qu’est-ce qui distingue une compensation d’une variation individuelle ?',
        choix: [
          ['La compensation apparaît quand une contrainte dépasse les capacités du moment', 1],
          ['La compensation concerne le haut du corps, la variation individuelle le bas', 0],
          ['La compensation se voit dès la première répétition d’une série, jamais par la suite', 0],
          ['La compensation ne concerne que les clients les plus débutants', 0],
        ],
      },
      {
        enonce: 'Tu repères quatre choses perfectibles sur une même série. Que fais-tu ?',
        choix: [
          ['Tu les signales toutes pour que le client ait l’information complète', 0],
          ['Tu en corriges deux, puis deux à la série suivante', 0],
          ['Tu n’en corriges aucune et tu observes encore trois séries', 0],
          ['Tu choisis UNE priorité et tu interviens dessus', 1],
        ],
      },
      {
        enonce: 'Quelle est la séquence enseignée dans ce module ?',
        choix: [
          ['Corriger, observer, retester, adapter', 0],
          ['Observer, prioriser, corriger, retester', 1],
          ['Prioriser, corriger, observer, adapter', 0],
          ['Retester, observer, corriger, adapter', 0],
        ],
      },
    ],
  },
  {
    ordre: 2, prefixe: 'mf-m02',
    titre: 'Maîtriser, observer et corriger le squat',
    description: 'Dans cette vidéo, découvre comment observer un squat : appuis, genoux, hanches, tronc, amplitude, contrôle. L’objectif : corriger sans chercher à imposer un modèle identique à tous les clients.',
    youtubeId: 'qT4wh5xwwP8',
    questions: [
      {
        enonce: 'Les genoux d’une cliente dépassent nettement ses pointes de pieds, sans douleur ni perte d’appui. Que fais-tu ?',
        choix: [
          ['Tu recules ses hanches pour ramener les genoux en arrière', 0],
          ['Tu réduis l’amplitude jusqu’à ce que les genoux restent derrière', 0],
          ['Tu laisses faire : ce dépassement n’est pas une erreur en soi', 1],
          ['Tu remplaces le squat par une presse', 0],
        ],
      },
      {
        enonce: 'Un client descend très bas mais perd le contrôle du tronc en fin de descente. Que privilégies-tu ?',
        choix: [
          ['Ajouter de la charge pour renforcer le tronc', 0],
          ['Limiter l’amplitude à la zone qu’il contrôle', 1],
          ['Lui demander de descendre encore plus bas', 0],
          ['Accélérer la descente pour passer la zone difficile', 0],
        ],
      },
      {
        enonce: 'Que dit le module sur la profondeur du squat ?',
        choix: [
          ['Elle doit toujours atteindre la parallèle au minimum', 0],
          ['Plus profond est systématiquement meilleur', 0],
          ['Elle doit être maîtrisée et adaptée au client', 1],
          ['Elle importe peu tant que la charge progresse', 0],
        ],
      },
      {
        enonce: 'Une cliente n’arrive pas à garder ses talons au sol. Quelle intervention correspond à l’esprit du module ?',
        choix: [
          ['Insister verbalement sur les talons à chaque répétition de la série', 0],
          ['Supprimer définitivement le squat de son programme d’entraînement', 0],
          ['Lui dire de descendre plus vite pour compenser le manque de mobilité', 0],
          ['Adapter l’environnement : box squat, goblet, squat assisté', 1],
        ],
      },
      {
        enonce: 'Un buste parfaitement vertical est-il une obligation au squat ?',
        choix: [
          ['Non : l’inclinaison dépend de la morphologie et de la variante', 1],
          ['Oui, sinon le mouvement devient dangereux pour le dos', 0],
          ['Oui, dès qu’il y a une charge posée sur le haut du dos', 0],
          ['Non, mais uniquement pour les clients les plus expérimentés', 0],
        ],
      },
    ],
  },
  {
    ordre: 3, prefixe: 'mf-m03',
    titre: 'Maîtriser, observer et corriger la charnière de hanche',
    description: 'Dans cette vidéo, découvre le pattern de charnière de hanche et son apprentissage : hinge au mur, repère au bâton, RDL, soulevé de terre. L’objectif : enseigner un hinge contrôlé plutôt qu’un squat déguisé.',
    youtubeId: '79IiRTcZ0IU',
    questions: [
      {
        enonce: 'Qu’est-ce qui distingue un hip hinge d’un squat ?',
        choix: [
          ['Le hinge se fait toujours sans charge, alors que le squat se fait avec', 0],
          ['Le hinge repose sur un recul du bassin, avec moins de flexion des genoux', 1],
          ['Le hinge est un mouvement du haut du corps, contrairement au squat', 0],
          ['Le hinge n’autorise aucune flexion de genou, à aucun moment du geste', 0],
        ],
      },
      {
        enonce: 'Un client se penche en avant sans reculer ses hanches. Quel outil d’apprentissage utilises-tu ?',
        choix: [
          ['Une charge plus lourde pour qu’il sente le mouvement', 0],
          ['Le hinge au mur, qui l’oblige à reculer le bassin', 1],
          ['Un tempo plus rapide pour éviter qu’il réfléchisse', 0],
          ['Une amplitude maximale dès la première séance', 0],
        ],
      },
      {
        enonce: 'Pendant un RDL, la barre s’éloigne progressivement des jambes. Pourquoi est-ce à corriger ?',
        choix: [
          ['Parce que la barre doit toucher les jambes en permanence, sans jeu', 0],
          ['Parce que cela ralentit inutilement l’exécution de la série', 0],
          ['Parce que l’éloignement de la charge dégrade le contrôle du mouvement', 1],
          ['Parce que cela empêche de compter correctement les répétitions', 0],
        ],
      },
      {
        enonce: 'Un client force son amplitude pour descendre plus bas au RDL. Que fais-tu ?',
        choix: [
          ['Tu l’encourages : l’amplitude maximale reste l’objectif à viser', 0],
          ['Tu ajoutes de la charge pour l’aider à stabiliser la position basse', 0],
          ['Tu passes directement au soulevé de terre lourd', 0],
          ['Tu arrêtes l’amplitude là où le contrôle du tronc se maintient', 1],
        ],
      },
      {
        enonce: 'Quelle progression le module enseigne-t-il ?',
        choix: [
          ['Charger, apprendre, progresser, individualiser', 0],
          ['Apprendre, charger, consolider, progresser', 1],
          ['Progresser, consolider, adapter, apprendre', 0],
          ['Consolider, progresser, charger, apprendre', 0],
        ],
      },
    ],
  },
  {
    ordre: 4, prefixe: 'mf-m04',
    titre: 'Maîtriser et corriger les fentes et le travail unilatéral',
    description: 'Dans cette vidéo, découvre comment observer fentes, split squats et step-ups : appuis, équilibre, trajectoire du genou, bassin, tronc, contrôle de la descente. L’objectif : simplifier la contrainte sans supprimer l’objectif.',
    youtubeId: 'Bobtlx0qk-M',
    questions: [
      {
        enonce: 'Une cliente est instable en fente et s’appuie sur un support. Comment l’interprètes-tu ?',
        choix: [
          ['Comme un échec : elle n’est pas encore prête pour cet exercice', 0],
          ['Comme une assistance légitime, à réduire progressivement', 1],
          ['Comme un signe qu’il faut alourdir pour la stabiliser', 0],
          ['Comme une raison de supprimer le travail unilatéral', 0],
        ],
      },
      {
        enonce: 'Que dit le module sur la longueur du pas en fente ?',
        choix: [
          ['Elle doit être identique pour tous les clients du groupe', 0],
          ['Elle dépend du client et de l’objectif recherché', 1],
          ['Elle doit toujours être la plus grande possible', 0],
          ['Elle importe peu si le genou ne dépasse pas', 0],
        ],
      },
      {
        enonce: 'Un client oscille légèrement pendant un split squat mais contrôle sa descente. Que conclus-tu ?',
        choix: [
          ['Il faut immobiliser complètement le bassin pendant la série', 0],
          ['Il faut arrêter la série immédiatement, par simple précaution', 0],
          ['Stabilité ne signifie pas immobilité : c’est acceptable', 1],
          ['Il faut passer à un exercice bilatéral, plus stable pour lui', 0],
        ],
      },
      {
        enonce: 'Quelle progression est cohérente avec le module ?',
        choix: [
          ['Ajouter uniquement de la charge, série après série', 0],
          ['Passer directement à la fente sautée sans étape intermédiaire', 0],
          ['Réduire l’assistance, puis l’amplitude, puis la charge', 1],
          ['Supprimer le support dès la première séance de travail', 0],
        ],
      },
      {
        enonce: 'Sur quoi le coach ne doit-il PAS concentrer toute son observation en fente ?',
        choix: [
          ['Uniquement la trajectoire du genou', 1],
          ['Les appuis et l’équilibre général du corps', 0],
          ['Le contrôle de la descente et de la remontée', 0],
          ['La position générale du bassin et du tronc', 0],
        ],
      },
    ],
  },
  {
    ordre: 5, prefixe: 'mf-m05',
    titre: 'Maîtriser et corriger les mouvements de poussée',
    description: 'Dans cette vidéo, découvre l’observation des poussées horizontales et verticales : appuis, coudes, épaules, omoplates, tronc, trajectoire de la charge. L’objectif : adapter la variante plutôt qu’imposer un angle universel.',
    youtubeId: 'IM2mHAd2_Dc',
    questions: [
      {
        enonce: 'Existe-t-il un angle de coude universel en développé ?',
        choix: [
          ['Oui, 45 degrés pour tout le monde et toute variante', 0],
          ['Oui, 90 degrés exactement pour protéger l’épaule', 0],
          ['Non : il dépend du client, de la variante et du contexte', 1],
          ['Oui, mais seulement pour le développé couché avec barre', 0],
        ],
      },
      {
        enonce: 'Un client ne parvient pas à réaliser une pompe complète avec contrôle. Quelle est la meilleure réponse ?',
        choix: [
          ['Lui faire faire des pompes partielles au sol', 0],
          ['Proposer une pompe inclinée, plus adaptée', 1],
          ['Ajouter une charge pour renforcer plus vite', 0],
          ['Supprimer la poussée horizontale de son programme', 0],
        ],
      },
      {
        enonce: 'Que dit le module à propos des omoplates pendant une poussée ?',
        choix: [
          ['Elles doivent rester bloquées en permanence, quelle que soit la charge', 0],
          ['Elles doivent rester totalement libres, sans aucun contrôle du coach', 0],
          ['Elles ne s’observent pas pendant une poussée, seulement au repos', 0],
          ['Elles participent au mouvement : les figer artificiellement est une erreur', 1],
        ],
      },
      {
        enonce: 'Une cliente cambre fortement le bas du dos en développé vertical. Quelle intervention est cohérente ?',
        choix: [
          ['Lui demander de serrer plus fort la barre pendant la répétition', 0],
          ['Réduire l’amplitude ou la charge pour retrouver le contrôle du tronc', 1],
          ['Augmenter la vitesse d’exécution pour passer la zone difficile', 0],
          ['Lui faire tenir la position haute beaucoup plus longtemps', 0],
        ],
      },
      {
        enonce: 'Selon le module, quelle est parfois la meilleure correction ?',
        choix: [
          ['Répéter la consigne plus fermement', 0],
          ['Ajouter une contrainte pour forcer la bonne position', 0],
          ['Choisir une variante mieux adaptée au client', 1],
          ['Attendre que le client corrige seul avec le temps', 0],
        ],
      },
    ],
  },
  {
    ordre: 6, prefixe: 'mf-m06',
    titre: 'Maîtriser les mouvements de tirage',
    description: 'Dans cette vidéo, découvre l’observation des tirages horizontaux et verticaux : appuis, tronc, coudes, épaules, omoplates, trajectoire, retour de la charge. L’objectif : juger la répétition entière, pas seulement la phase de traction.',
    youtubeId: 'SqFSNsszRCY',
    questions: [
      {
        enonce: 'Pourquoi le retour de la charge est-il à observer en rowing ?',
        choix: [
          ['Parce qu’il fait partie de la répétition et révèle le contrôle', 1],
          ['Parce qu’il permet surtout de compter les répétitions réalisées', 0],
          ['Parce qu’il doit être le plus rapide possible pour gagner du temps', 0],
          ['Parce qu’il n’engage aucun muscle du haut du corps', 0],
        ],
      },
      {
        enonce: 'Un client accompagne son tirage d’un léger mouvement de tronc. Que conclus-tu ?',
        choix: [
          ['C’est toujours une erreur à corriger immédiatement et fermement', 0],
          ['Ce n’est pas automatiquement une erreur : cela dépend du contrôle', 1],
          ['Il faut le sangler au banc pour immobiliser son tronc', 0],
          ['Il faut arrêter définitivement le tirage horizontal du programme', 0],
        ],
      },
      {
        enonce: 'Que dit le module sur la consigne « épaules en arrière et bloquées » ?',
        choix: [
          ['C’est la consigne de référence pour tous les tirages, sans exception', 0],
          ['Elle est utile uniquement en tirage vertical', 0],
          ['Elle doit être répétée à chaque répétition de la série', 0],
          ['Elle fige l’omoplate, qui doit au contraire participer', 1],
        ],
      },
      {
        enonce: 'Un client déplace une charge lourde mais sans contrôle sur l’amplitude. Comment le lis-tu ?',
        choix: [
          ['La charge étant déplacée jusqu’au bout, la répétition est réussie', 0],
          ['Déplacer une charge ne signifie pas maîtriser une répétition', 1],
          ['Il faut augmenter encore la charge pour le stabiliser', 0],
          ['Il faut compter la répétition et passer à la suivante', 0],
        ],
      },
      {
        enonce: 'Une cliente n’enchaîne aucune traction complète. Quelle progression est cohérente ?',
        choix: [
          ['Lui faire tenir la position haute de traction jusqu’à l’échec', 0],
          ['Lui faire faire des tractions lestées dès la séance suivante', 0],
          ['Passer à la traction assistée, puis réduire l’assistance', 1],
          ['Supprimer le tirage vertical de son programme d’entraînement', 0],
        ],
      },
    ],
  },
  {
    ordre: 7, prefixe: 'mf-m07',
    titre: 'Maîtriser le gainage et le contrôle du tronc',
    description: 'Dans cette vidéo, découvre le gainage comme capacité à organiser et contrôler son tronc face à une contrainte : planche, anti-extension, anti-rotation, transfert vers les mouvements. L’objectif : stabiliser pour mieux bouger.',
    youtubeId: '6Yxndyl-e3A',
    questions: [
      {
        enonce: 'Quelle définition du gainage le module retient-il ?',
        choix: [
          ['Tenir une planche au sol le plus longtemps possible', 0],
          ['Contracter fort les abdominaux en permanence', 0],
          ['Organiser et contrôler son tronc face à une contrainte', 1],
          ['Immobiliser complètement le bassin et les côtes', 0],
        ],
      },
      {
        enonce: 'Un client tient trois minutes de planche mais son bassin s’affaisse après trente secondes. Que conclus-tu ?',
        choix: [
          ['La durée seule n’est pas un indicateur suffisant', 1],
          ['Il maîtrise parfaitement le gainage, la durée le prouve', 0],
          ['Il faut viser quatre minutes dès la séance suivante', 0],
          ['Il faut ajouter du lest dès la toute prochaine séance', 0],
        ],
      },
      {
        enonce: 'Quel exercice le module associe-t-il à l’anti-rotation ?',
        choix: [
          ['Le dead bug', 0],
          ['La planche latérale statique', 0],
          ['Le relevé de buste', 0],
          ['Le Pallof press', 1],
        ],
      },
      {
        enonce: 'À quoi doit servir le gainage selon le module ?',
        choix: [
          ['À obtenir un ventre plat et une sangle abdominale bien visible', 0],
          ['À servir les mouvements du client : squat, RDL, fentes, poussées, tirages', 1],
          ['À remplacer progressivement les exercices de force dans le programme du client', 0],
          ['À mesurer la motivation et la résistance mentale du client', 0],
        ],
      },
      {
        enonce: 'Quelle progression de gainage est cohérente avec le module ?',
        choix: [
          ['Augmenter uniquement la durée, semaine après semaine', 0],
          ['Ajouter de l’instabilité dès la première séance', 0],
          ['Faire varier durée, leviers, résistance et complexité', 1],
          ['Passer directement aux mouvements asymétriques chargés', 0],
        ],
      },
    ],
  },
  {
    ordre: 8, prefixe: 'mf-m08',
    titre: 'Corriger un client efficacement',
    description: 'Dans cette vidéo, découvre comment transformer une observation technique en intervention utile : une consigne à la fois, un retest immédiat, un changement d’approche si besoin. L’objectif : voir beaucoup ne signifie pas tout dire.',
    youtubeId: 'A7kmITK2nx0',
    questions: [
      {
        enonce: 'Quel est le principe central de ce module ?',
        choix: [
          ['Voir beaucoup ne signifie pas tout dire', 1],
          ['Corriger chaque détail dès qu’il apparaît', 0],
          ['Laisser le client trouver seul ses erreurs', 0],
          ['Donner trois consignes courtes plutôt qu’une longue', 0],
        ],
      },
      {
        enonce: 'Tu donnes une consigne et tu passes à la série suivante sans faire refaire le mouvement. Quel est le problème ?',
        choix: [
          ['Le client risque d’oublier la consigne d’ici la série suivante', 0],
          ['Une correction sans retest est une hypothèse non vérifiée', 1],
          ['La série suivante sera trop fatigante pour appliquer la consigne', 0],
          ['Il n’y a pas de problème si la consigne était claire', 0],
        ],
      },
      {
        enonce: 'Ta consigne verbale ne produit aucun effet après deux essais. Que fais-tu ?',
        choix: [
          ['Tu la répètes plus fermement dès la série suivante', 0],
          ['Tu passes à l’exercice suivant sans insister davantage', 0],
          ['Tu changes de canal : démonstration, repère externe, variante', 1],
          ['Tu ajoutes une deuxième consigne verbale à la première', 0],
        ],
      },
      {
        enonce: 'Un client signale une douleur pendant une série. Quelle est ta priorité ?',
        choix: [
          ['Terminer la série en cours puis en parler ensuite', 0],
          ['Réduire la charge et continuer la série en cours', 0],
          ['Corriger d’abord sa technique d’exécution du mouvement', 0],
          ['La sécurité et la douleur, avant tout le reste', 1],
        ],
      },
      {
        enonce: 'Quels canaux de correction le module propose-t-il ?',
        choix: [
          ['Uniquement le verbal, pour rester rapide et ne pas couper la série', 0],
          ['Verbal, démonstration, environnement, repères, exercice, charge, amplitude', 1],
          ['La charge et l’amplitude uniquement, les autres canaux sont inutiles', 0],
          ['La démonstration uniquement, jugée plus fiable que les mots du coach', 0],
        ],
      },
    ],
  },
  {
    ordre: 9, prefixe: 'mf-m09',
    titre: 'Adapter le niveau de difficulté',
    description: 'Dans cette vidéo, découvre comment décider entre garder, simplifier, changer, consolider ou faire progresser. L’objectif : une régression conserve l’objectif et retire la difficulté qui bloque.',
    youtubeId: 'sIABSGWQrm8',
    questions: [
      {
        enonce: 'Qu’est-ce qu’une bonne régression ?',
        choix: [
          ['Un exercice plus facile, même s’il change complètement l’objectif', 0],
          ['Une version qui conserve l’objectif en retirant la difficulté qui bloque', 1],
          ['Une réduction de la charge uniquement, sans rien changer d’autre', 0],
          ['Un exercice réservé aux débutants et aux clients en reprise', 0],
        ],
      },
      {
        enonce: 'Après trois corrections successives, le mouvement ne s’améliore pas. Que fais-tu ?',
        choix: [
          ['Tu insistes sur la même consigne', 0],
          ['Tu simplifies ou tu changes de variante', 1],
          ['Tu ajoutes de la charge pour créer un déclic', 0],
          ['Tu passes à un autre groupe musculaire', 0],
        ],
      },
      {
        enonce: 'Un client maîtrise le mouvement et la difficulté reste suffisante. Que décides-tu ?',
        choix: [
          ['Tu fais progresser deux paramètres à la fois', 0],
          ['Tu changes de variante pour varier', 0],
          ['Tu consolides à ce niveau', 1],
          ['Tu réduis l’amplitude pour sécuriser', 0],
        ],
      },
      {
        enonce: 'Une progression, selon le module, c’est :',
        choix: [
          ['Ajouter de la charge en priorité, avant tout autre paramètre', 0],
          ['Augmenter le nombre de séances hebdomadaires sans changer les exercices du plan', 0],
          ['Faire évoluer un paramètre : charge, amplitude, tempo, stabilité, variante', 1],
          ['Passer systématiquement au travail unilatéral dès que possible', 0],
        ],
      },
      {
        enonce: 'Dans l’arbre de décision, que fais-tu après avoir fait progresser un paramètre ?',
        choix: [
          ['Tu retestes', 1],
          ['Tu ajoutes un second paramètre', 0],
          ['Tu passes à l’exercice suivant', 0],
          ['Tu notes la charge et tu attends la séance suivante', 0],
        ],
      },
    ],
  },
  {
    ordre: 10, prefixe: 'mf-m10',
    titre: 'À toi de coacher',
    description: 'Dans cette vidéo, découvre la mise en situation complète : observer un client, choisir une priorité, corriger, retester, adapter et décider de la suite. L’objectif : mobiliser tout le parcours dans une séance réelle.',
    youtubeId: 'CpNUyfybV_M',
    questions: [
      {
        enonce: 'Un client réalise un squat. Par quoi commences-tu ?',
        choix: [
          ['Tu corriges les appuis dès la toute première répétition de la série', 0],
          ['Tu lui laisses réaliser plusieurs répétitions et tu observes', 1],
          ['Tu lui demandes d’abord ce qu’il pense de sa technique', 0],
          ['Tu ajoutes une charge pour révéler plus vite les défauts', 0],
        ],
      },
      {
        enonce: 'Tu as choisi une priorité. Que dois-tu être capable de faire ensuite ?',
        choix: [
          ['Justifier ton choix et le faire retester', 1],
          ['Lister les autres défauts au client', 0],
          ['Attendre la séance suivante pour intervenir', 0],
          ['Changer d’exercice pour éviter le problème', 0],
        ],
      },
      {
        enonce: 'Ta correction améliore nettement le mouvement. Que fais-tu ?',
        choix: [
          ['Tu enchaînes sur une deuxième correction immédiatement', 0],
          ['Tu valorises ce qui est réussi et tu poursuis', 1],
          ['Tu augmentes la charge pour tester la limite', 0],
          ['Tu passes à un autre exercice sans commenter', 0],
        ],
      },
      {
        enonce: 'Quelle posture le module décrit-il comme adaptée ?',
        choix: [
          ['Montrer au client tout ce que l’on sait observer sur son mouvement', 0],
          ['Commenter chaque répétition à voix haute pour rester présent en permanence', 0],
          ['Donner une information exploitable et laisser parfois le client bouger sans parler', 1],
          ['Ne rien dire du tout tant que le client ne pose pas lui-même de question', 0],
        ],
      },
      {
        enonce: 'Après ton intervention, le mouvement est maîtrisé mais devenu trop facile. Que décides-tu ?',
        choix: [
          ['Tu régresses le mouvement pour sécuriser la série', 0],
          ['Tu consolides pendant plusieurs séances supplémentaires', 0],
          ['Tu fais progresser un paramètre, puis tu retestes', 1],
          ['Tu passes à un tout autre exercice, sans rapport avec celui-ci', 0],
        ],
      },
    ],
  },
];

// Le QCM final : TRANSVERSAL, rattaché à aucun module.
const FINALE = [
  {
    enonce: 'Une cliente squatte avec une inclinaison de buste plus marquée que la moyenne, sans douleur ni perte de contrôle. Quelle est la meilleure décision ?',
    choix: [
      ['Accepter cette variation individuelle et poursuivre', 1],
      ['Corriger sa position pour uniformiser son exécution', 0],
      ['Réduire fortement l’amplitude du squat par prudence', 0],
      ['Remplacer le squat libre par une machine guidée', 0],
    ],
  },
  {
    enonce: 'Tu observes cinq points perfectibles sur une série. Combien en corriges-tu ?',
    choix: [
      ['Tous, pour que le client ait l’information', 0],
      ['Un seul, celui qui compte le plus', 1],
      ['Trois, pour équilibrer', 0],
      ['Aucun, tu attends la séance suivante', 0],
    ],
  },
  {
    enonce: 'Dans quel ordre la hiérarchie d’intervention doit-elle être respectée ?',
    choix: [
      ['Performance, mouvement, contrôle, puis sécurité et douleur', 0],
      ['Contrôle, performance, sécurité, douleur, puis mouvement', 0],
      ['Sécurité et douleur, contrôle, mouvement, performance', 1],
      ['Mouvement, contrôle, performance, sécurité, puis douleur', 0],
    ],
  },
  {
    enonce: 'Quelle affirmation correspond à l’esprit de la formation ?',
    choix: [
      ['Tous les clients doivent viser exactement la même exécution', 0],
      ['Une exécution différente du modèle est une exécution incorrecte', 0],
      ['La performance prime dès l’instant où le client ne souffre pas', 0],
      ['Un mouvement adapté, contrôlé et reproductible prime sur un modèle unique', 1],
    ],
  },
  {
    enonce: 'Un client oscille légèrement en split squat tout en contrôlant sa descente. Que conclus-tu ?',
    choix: [
      ['Stabilité ne signifie pas immobilité : c’est acceptable', 1],
      ['Il faut immobiliser totalement son bassin pendant la descente', 0],
      ['Il faut supprimer le travail unilatéral de son programme', 0],
      ['Il faut alourdir la charge pour le stabiliser', 0],
    ],
  },
  {
    enonce: 'Tu proposes une pompe inclinée à un client qui échoue au sol. Comment le présentes-tu ?',
    choix: [
      ['Comme un échec temporaire à surmonter le plus vite possible', 0],
      ['Comme une variante adaptée qui conserve l’objectif', 1],
      ['Comme un exercice réservé aux clients les plus débutants', 0],
      ['Comme une solution provisoire et sans réel intérêt', 0],
    ],
  },
  {
    enonce: 'Une correction verbale reste sans effet après deux tentatives. Que fais-tu ?',
    choix: [
      ['Tu la répètes plus fort et beaucoup plus lentement', 0],
      ['Tu abandonnes cette correction pour le reste de la séance', 0],
      ['Tu changes de canal : démonstration, repère, variante', 1],
      ['Tu ajoutes une seconde consigne à la première', 0],
    ],
  },
  {
    enonce: 'Pourquoi le retest est-il indispensable ?',
    choix: [
      ['Pour occuper utilement le client entre deux séries de travail', 0],
      ['Pour augmenter le volume total de la séance d’entraînement', 0],
      ['Pour vérifier que le client a bien écouté et retenu la consigne', 0],
      ['Parce qu’une correction sans retest reste une hypothèse non vérifiée', 1],
    ],
  },
  {
    enonce: 'Un client force son amplitude au RDL et perd le contrôle du tronc en fin de descente. Que fais-tu ?',
    choix: [
      ['Tu limites l’amplitude à la zone contrôlée', 1],
      ['Tu ajoutes de la charge pour mieux le stabiliser', 0],
      ['Tu accélères le tempo de la descente et de la montée', 0],
      ['Tu passes tout de suite au soulevé de terre lourd', 0],
    ],
  },
  {
    enonce: 'Quelle progression est cohérente avec la formation ?',
    choix: [
      ['Ajouter de la charge à chaque nouvelle séance de travail', 0],
      ['Faire évoluer un seul paramètre, puis retester', 1],
      ['Augmenter la charge et l’amplitude simultanément', 0],
      ['Changer d’exercice dès que le client semble progresser', 0],
    ],
  },
  {
    enonce: 'Un client transforme systématiquement son hinge en squat. Quelle intervention choisis-tu ?',
    choix: [
      ['Ajouter une charge pour qu’il sente la différence', 0],
      ['Passer directement au soulevé de terre', 0],
      ['Le hinge au mur, qui impose le recul du bassin', 1],
      ['Augmenter le nombre de répétitions', 0],
    ],
  },
  {
    enonce: 'Que signifie « stabiliser pour mieux bouger » ?',
    choix: [
      ['Il faut gainer avant chaque série', 0],
      ['La planche doit précéder tout entraînement', 0],
      ['Le tronc doit rester immobile en toutes circonstances', 0],
      ['Le gainage doit servir les mouvements du client', 1],
    ],
  },
  {
    enonce: 'Un client déplace une charge lourde en rowing mais sans contrôler le retour. Comment le juges-tu ?',
    choix: [
      ['La répétition n’est pas maîtrisée : le retour en fait partie', 1],
      ['La répétition est valide, puisque la charge a été déplacée', 0],
      ['Il faut augmenter la charge pour l’obliger à contrôler', 0],
      ['Il faut compter la série et passer directement à la suite', 0],
    ],
  },
  {
    enonce: 'Quand une régression est-elle justifiée ?',
    choix: [
      ['Quand le client se dit fatigué en début de séance', 0],
      ['Quand plusieurs corrections sont restées sans effet', 1],
      ['Quand le client demande simplement un exercice plus facile', 0],
      ['Quand la séance dure vraiment trop longtemps', 0],
    ],
  },
  {
    enonce: 'Un client maîtrise son mouvement et la difficulté reste suffisante. Que décides-tu ?',
    choix: [
      ['Tu fais progresser immédiatement', 0],
      ['Tu régresses pour sécuriser', 0],
      ['Tu consolides à ce niveau', 1],
      ['Tu changes de variante', 0],
    ],
  },
  {
    enonce: 'Que dit la formation sur les angles articulaires en poussée ?',
    choix: [
      ['Il existe un angle de coude optimal, valable pour tous les clients', 0],
      ['L’angle doit toujours être de 45 degrés exactement', 0],
      ['L’angle n’a aucune importance pour la sécurité', 0],
      ['L’angle dépend du client, de la variante et du contexte', 1],
    ],
  },
  {
    enonce: 'Une cliente signale une gêne à l’épaule pendant un développé vertical. Quelle est ta première décision ?',
    choix: [
      ['Arrêter l’exercice et traiter la douleur en priorité', 1],
      ['Terminer la série en cours puis adapter la suite', 0],
      ['Réduire l’amplitude du mouvement et poursuivre', 0],
      ['Changer la prise à la barre et continuer la série en cours', 0],
    ],
  },
  {
    enonce: 'Quelle posture de coach la formation valorise-t-elle ?',
    choix: [
      ['Commenter chaque répétition pour bien montrer sa vigilance', 0],
      ['Donner une information exploitable, et savoir se taire', 1],
      ['Corriger d’abord, expliquer seulement ensuite au client', 0],
      ['Laisser le client s’auto-corriger, sans jamais intervenir', 0],
    ],
  },
  {
    enonce: 'Un client débutant est instable en fente et s’appuie sur un support. Comment le traites-tu ?',
    choix: [
      ['Comme un échec qui justifie de retirer l’exercice du programme', 0],
      ['Comme un signe qu’il faut charger davantage', 0],
      ['Comme une assistance légitime à réduire progressivement', 1],
      ['Comme une raison de passer au bilatéral définitivement', 0],
    ],
  },
  {
    enonce: 'Quelle est la séquence complète enseignée par la formation ?',
    choix: [
      ['Corriger, observer, prioriser, individualiser, retester, consolider, progresser', 0],
      ['Prioriser, corriger, consolider, observer, adapter, progresser', 0],
      ['Retester, corriger, observer, adapter, prioriser, consolider', 0],
      ['Observer, prioriser, corriger, retester, adapter, consolider, progresser', 1],
    ],
  },
];

// Le référentiel de cas pratiques. « À REPASSER NOTAMMENT SI » n'est JAMAIS
// interprété par le moteur : c'est un référentiel de lecture pour l'évaluateur.
const CAS = [
  {
    cle: 'mf-cas-1', ordre: 1,
    titre: 'Observer sans surcorriger',
    consignes: `SITUATION PRÉSENTÉE AU COACH
Un client réalise une série de squats au poids du corps. Son exécution est globalement fonctionnelle : appuis stables, pas de douleur. Deux ou trois détails sont perfectibles.
Consigne donnée au coach : « Fais-lui réaliser cette série et dis-moi ce que tu observes. »

CE QUE L’ÉVALUATEUR OBSERVE
Le coach laisse-t-il le mouvement se dérouler avant d’intervenir, ou coupe-t-il dès la première répétition ? Distingue-t-il ce qui mérite une correction d’une variation individuelle ?

COMPORTEMENT ATTENDU
Le coach laisse plusieurs répétitions se dérouler.
Il observe le mouvement globalement : appuis, articulations, trajectoire, amplitude, contrôle.
Il nomme ce qu’il voit sans tout transformer en erreur, et applique la hiérarchie sécurité → stabilité → mouvement → performance.
Il conclut qu’aucune correction urgente ne s’impose, ou en retient une seule.

VALIDATION
Le coach :
- observe avant d’intervenir ;
- regarde le mouvement dans son ensemble ;
- distingue erreur, compensation et variation individuelle ;
- n’invente pas un problème là où il n’y en a pas.

À REPASSER NOTAMMENT SI
- il corrige dès la première répétition ;
- il énumère tous les défauts observés ;
- il traite une variation morphologique comme une erreur ;
- il cherche à obtenir une exécution identique à un modèle ;
- il n’observe qu’une articulation isolée.`,
  },
  {
    cle: 'mf-cas-2', ordre: 2,
    titre: 'Prioriser une correction',
    consignes: `SITUATION PRÉSENTÉE AU COACH
Une cliente réalise un RDL. Le coach peut observer simultanément : des appuis un peu instables, une charge qui s’éloigne des jambes, une amplitude forcée en fin de descente, et un regard qui cherche le miroir.
Consigne donnée au coach : « Tu ne peux donner qu’UNE consigne. Laquelle, et pourquoi ? »

CE QUE L’ÉVALUATEUR OBSERVE
Le coach sait-il choisir une priorité et la justifier, ou empile-t-il les remarques ?

COMPORTEMENT ATTENDU
Le coach identifie la difficulté principale plutôt que le détail le plus visible.
Il s’appuie sur la hiérarchie : ce qui touche la sécurité et le contrôle passe avant le reste.
Il formule sa priorité et l’explique à l’évaluateur en une phrase.
Il assume de laisser les autres points de côté pour l’instant.

VALIDATION
Le coach :
- retient une seule priorité ;
- sait dire pourquoi celle-là plutôt qu’une autre ;
- s’appuie sur la hiérarchie d’intervention ;
- ne corrige pas tous les détails simultanément.

À REPASSER NOTAMMENT SI
- il donne deux ou trois consignes « rapides » ;
- il choisit le détail le plus visible sans le justifier ;
- il traite la performance avant le contrôle ;
- il est incapable d’expliquer son choix ;
- il refuse de trancher et renvoie la décision à la cliente.`,
  },
  {
    cle: 'mf-cas-3', ordre: 3,
    titre: 'Choisir une correction efficace',
    consignes: `SITUATION PRÉSENTÉE AU COACH
Un client ne parvient pas à garder ses talons au sol en squat. La priorité est identifiée ; il s’agit maintenant d’intervenir.
Consigne donnée au coach : « Corrige-le. »

CE QUE L’ÉVALUATEUR OBSERVE
La consigne est-elle courte, compréhensible et adaptée au vocabulaire du client ? Le coach mobilise-t-il autre chose que la parole quand c’est utile ?

COMPORTEMENT ATTENDU
Le coach donne UNE consigne courte, dans des mots que le client comprend.
Il choisit le canal le plus efficace : parole, démonstration, repère externe, modification de l’environnement, de la charge ou de l’amplitude.
Il évite le jargon anatomique et les explications longues.
Il vérifie que le client a compris avant de relancer.

VALIDATION
Le coach :
- donne une consigne courte et exploitable ;
- adapte son vocabulaire au client ;
- utilise démonstration ou repère si la parole ne suffit pas ;
- ne noie pas l’information dans une explication technique.

À REPASSER NOTAMMENT SI
- il enchaîne une explication longue et théorique ;
- il emploie un vocabulaire que le client ne peut pas suivre ;
- il donne plusieurs consignes en une phrase ;
- il corrige sans s’assurer d’avoir été compris ;
- il modifie l’exercice sans jamais essayer une consigne simple.`,
  },
  {
    cle: 'mf-cas-4', ordre: 4,
    titre: 'Retester et changer d’approche',
    consignes: `SITUATION PRÉSENTÉE AU COACH
Le coach vient de donner une consigne à un client sur une poussée. Le mouvement suivant est identique : la consigne n’a produit aucun effet.
Consigne donnée au coach : « Continue. »

CE QUE L’ÉVALUATEUR OBSERVE
Le coach fait-il immédiatement retester ? Constate-t-il objectivement l’absence d’effet ? Change-t-il d’approche plutôt que de répéter ?

COMPORTEMENT ATTENDU
Le coach fait refaire le mouvement tout de suite après sa consigne.
Il évalue si son intervention a changé quelque chose, sans se contenter d’une impression.
Constatant l’absence d’effet, il change de canal ou de levier : démonstration, repère externe, variante, amplitude, charge.
Il ne répète pas la même consigne plus fort.

VALIDATION
Le coach :
- reteste immédiatement après sa correction ;
- juge l’effet sur ce qu’il observe ;
- change d’approche quand la première n’a rien donné ;
- reste calme et ne met pas l’échec sur le compte du client.

À REPASSER NOTAMMENT SI
- il passe à la série suivante sans faire retester ;
- il répète la même consigne, plus fort ou plus lentement ;
- il conclut que le client « ne comprend pas » ;
- il empile une deuxième consigne sur la première ;
- il déclare la correction réussie sans l’avoir vérifiée.`,
  },
  {
    cle: 'mf-cas-5', ordre: 5,
    titre: 'Régresser / adapter',
    consignes: `SITUATION PRÉSENTÉE AU COACH
Une cliente doit réaliser des pompes au sol. Elle n’en réussit aucune avec un contrôle correct : le bassin s’affaisse dès la première répétition. Deux corrections successives n’ont rien changé.
Consigne donnée au coach : « Que fais-tu maintenant ? »

CE QUE L’ÉVALUATEUR OBSERVE
Le coach sait-il régresser sans présenter cela comme un échec, et en conservant l’objectif de l’exercice ?

COMPORTEMENT ATTENDU
Le coach décide de simplifier : pompe inclinée, amplitude réduite, ou variante mieux adaptée.
Il conserve l’objectif — une poussée horizontale contrôlée — et retire la difficulté qui bloque.
Il présente cette adaptation comme une étape normale, pas comme une sanction.
Il annonce ce qui permettra de revenir vers la version complète.

VALIDATION
Le coach :
- régresse après des corrections restées sans effet ;
- choisit une variante qui conserve l’objectif ;
- formule l’adaptation sans dévaloriser la cliente ;
- sait dire ce qui déclenchera le retour vers la version initiale.

À REPASSER NOTAMMENT SI
- il maintient l’exercice en l’état en espérant que ça vienne ;
- il supprime la poussée horizontale du programme ;
- il présente la régression comme un échec ;
- il change d’exercice sans conserver l’objectif ;
- il ajoute de la charge ou du volume pour « renforcer ».`,
  },
  {
    cle: 'mf-cas-6', ordre: 6,
    titre: 'Consolider ou progresser',
    consignes: `SITUATION PRÉSENTÉE AU COACH
Un client réalise un goblet squat propre : amplitude contrôlée, appuis stables, aucune compensation. Il exécute ses répétitions sans difficulté apparente.
Consigne donnée au coach : « Que décides-tu pour la suite ? »

CE QUE L’ÉVALUATEUR OBSERVE
Le coach sait-il trancher entre consolider et progresser, et fait-il progresser un seul paramètre à la fois ?

COMPORTEMENT ATTENDU
Le coach constate que le mouvement est maîtrisé, puis se demande si la difficulté reste suffisante.
S’il juge que oui, il consolide à ce niveau et l’assume.
S’il juge que non, il fait évoluer UN paramètre — charge, amplitude, tempo, stabilité, variante, travail unilatéral — puis fait retester.
Il ne cherche pas systématiquement à durcir l’exercice.

VALIDATION
Le coach :
- distingue « maîtrisé » de « trop facile » ;
- choisit consciemment entre consolider et progresser ;
- ne fait évoluer qu’un paramètre à la fois ;
- reteste après avoir modifié la difficulté.

À REPASSER NOTAMMENT SI
- il ajoute charge et amplitude en même temps ;
- il durcit l’exercice par réflexe, sans évaluer la difficulté actuelle ;
- il ne pense qu’à la charge comme levier de progression ;
- il ne reteste pas après la modification ;
- il consolide indéfiniment sans jamais se poser la question.`,
  },
];

// ⚠️ SEUIL À 90 %, propre à CETTE formation. Les autres gardent le leur.
const REGLAGES = { qcmNbQuestions: 20, qcmSeuilPct: 90, miniNbQuestions: 5, miniSeuilPct: 90 };

const MARQUEUR = 'banque_mouvements_fondamentaux_v1';
const MARQUEUR_CAS = 'cas_mouvements_fondamentaux_v1';
const MARQUEUR_CONSIGNES = 'cas_mouvements_fondamentaux_consignes_v1';

module.exports = {
  FORMATION, MODULES, FINALE, CAS, REGLAGES,
  MARQUEUR, MARQUEUR_CAS, MARQUEUR_CONSIGNES,
};
