'use strict';
// ============================================================================
//  MY COACH ACADEMY — routes HTTP (lot 1).
//
//  Trois principes, tous hérités du Boost parce qu'ils y ont déjà fait leurs
//  preuves :
//
//   1. la portée vient du JETON, jamais de l'URL. Aucune route n'accepte
//      d'email : il est structurellement impossible de lire ou de modifier la
//      progression d'un autre collaborateur ;
//   2. le droit d'entrer est relu à CHAQUE requête. Désactiver un collaborateur
//      lui ferme l'Academy à l'appel suivant, sans rien avoir à défaire ;
//   3. être certifié n'est PAS requis. C'est la formation qui doit permettre de
//      le devenir — exiger la certification pour y accéder serait un cercle.
// ============================================================================

const express = require('express');
const path = require('path');
const { enteteContentDisposition } = require('./academyRessources');

function creerRoutesAcademy({ academy, qcm, pratique, certifications, formations, admin, ressources, couvertures, grilles, boost, exigeCompte, exigeAdmin, estAdmin }) {
  const r = express.Router();
  const moi = (req) => String(req.user.email || '').trim().toLowerCase();

  // ==========================================================================
  //  QUI PEUT ÉVALUER ET CERTIFIER — la seule règle de droits ajoutée.
  //
  //  L'ADMINISTRATEUR EST ÉVALUATEUR/CERTIFICATEUR D'OFFICE. C'est un
  //  renversement assumé du parti pris d'origine (« administrer et évaluer sont
  //  deux métiers ») : il obligeait l'administrateur à se désigner lui-même
  //  avant de pouvoir travailler, et cette désignation manquante rendait
  //  l'espace inatteignable sur une base neuve.
  //
  //  CE QUE LE RENVERSEMENT NE COÛTE PAS. On perd l'habilitation explicite d'un
  //  admin ; on ne perd AUCUNE trace de décision : chaque évaluation porte son
  //  `evaluateur`, chaque diplôme son `delivree_par`. Qui a prononcé quoi reste
  //  écrit.
  //
  //  ⚠️ CE QUE LE RENVERSEMENT REND PLUS IMPORTANT, PAS MOINS : les deux refus
  //  d'auto-validation du moteur (on n'évalue pas sa propre pratique, on ne se
  //  délivre pas sa propre certification). Sans eux, « admin d'office » vaudrait
  //  « je me certifie moi-même ». Ils vivent dans academyPratique.verifierCible
  //  et academyCertifications.delivrer, et ce fichier ne les contourne jamais.
  //
  //  La table academy_evaluateurs reste la vérité pour les évaluateurs NON
  //  administrateurs — elle n'a pas changé de rôle, elle a cessé d'être le seul
  //  chemin.
  // ==========================================================================
  const estAdministrateur = (mail) => !!estAdmin && estAdmin(mail);
  const peutEvaluer = (mail) => pratique.estEvaluateur(mail) || estAdministrateur(mail);

  // Le schéma s'applique tout seul à la première requête Academy, comme celui
  // du Boost : aucun ordre d'initialisation à respecter dans server.js.
  r.use('/api/academy', (req, _res, next) => { academy.assurerSchema(); qcm.assurerSchema(); pratique.assurerSchema(); certifications.assurerSchema(); ressources.assurerSchema(); couvertures.assurerSchema(); if (grilles) grilles.assurerSchema(); next(); });

  // Page autonome, servie comme /coach. Un espace de formation et un espace de
  // suivi n'ont ni les mêmes écrans ni le même rythme d'évolution.
  const pageAcademy = (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'academy.html'));
  r.get('/academy', (req, res) => { academy.assurerSchema(); qcm.assurerSchema(); pratique.assurerSchema(); certifications.assurerSchema(); pageAcademy(req, res); });
  r.get('/academy/', (req, res) => { academy.assurerSchema(); qcm.assurerSchema(); pageAcademy(req, res); });

  // Réservé aux collaborateurs actifs. Un client n'a rien à faire ici : le
  // refus le dit franchement plutôt que de lui servir une formation vide.
  // ==========================================================================
  //  LA FORMATION D'UNE REQUÊTE
  //
  //  Elle arrive en `?formation=` (lecture) ou dans le corps (écriture), et
  //  elle est RÉSOLUE PAR LE CATALOGUE : une clé inconnue ou inactive n'est
  //  jamais acceptée, sinon on manipulerait des données Academy rattachées à
  //  un parcours qui n'existe pas.
  //
  //  Absente, on prend la formation par défaut. C'est ce qui laisse tous les
  //  appels historiques fonctionner sans réécriture.
  // ==========================================================================
  const cleDemandee = (req) => (req.query && req.query.formation) || (req.body && req.body.formation) || null;

  function formationDe(req, res) {
    const f = formations.resoudre(cleDemandee(req));
    if (!f) {
      res.status(404).json({ ok: false, formationInconnue: true, error: 'Formation inconnue ou inactive.' });
      return null;
    }
    return f;
  }

  function exigeCollaborateur(req, res, next) {
    if (!academy.peutSeFormer(moi(req))) {
      return res.status(403).json({
        ok: false, nonCollaborateur: true,
        error: 'La formation Coach Nutrition est réservée aux collaborateurs My Coach.',
      });
    }
    next();
  }

  // « Qui suis-je » — appelé avant toute lecture, pour que « cet espace ne
  // t'est pas destiné » soit un écran normal et non l'interprétation d'un 403.
  r.get('/api/academy/moi', exigeCompte, (req, res) => {
    res.json({
      ok: true,
      email: moi(req),
      collaborateur: academy.peutSeFormer(moi(req)),
      // Le droit d'évaluer est INDÉPENDANT du fait d'être collaborateur : un
      // formateur extérieur peut évaluer sans suivre la formation. Ce drapeau
      // répond « puis-je ouvrir Évaluer & certifier ? » — donc désigné OU
      // administrateur, jamais l'appartenance brute à academy_evaluateurs, que
      // seul l'écran de gestion des droits a besoin de connaître.
      evaluateur: peutEvaluer(moi(req)),
      // Administrer est un droit EN PLUS : il ouvre les formations, les
      // contenus, les banques et le retrait d'une certification. Il n'ouvre
      // aucune porte à lui seul — c'est exigeAdmin, côté serveur, qui garde
      // ces routes.
      admin: estAdministrateur(moi(req)),
    });
  });

  // Le catalogue : ce que le collaborateur peut suivre. Le serveur reste seul
  // juge — l'écran n'affiche que ce qu'il reçoit ici.
  //  Le catalogue est lu par TOUS ceux qui entrent dans l'Academy : le
  //  collaborateur qui suit un parcours, l'évaluateur qui doit dire pour quelle
  //  formation il prononce un résultat, l'administrateur qui doit dire pour
  //  laquelle il certifie. Le réserver aux collaborateurs privait les deux
  //  autres de leur sélecteur.
  function exigeEntree(req, res, next) {
    const mail = moi(req);
    if (academy.peutSeFormer(mail) || peutEvaluer(mail)) return next();
    return res.status(403).json({
      ok: false, nonCollaborateur: true,
      error: 'La formation Coach Nutrition est réservée aux collaborateurs My Coach.',
    });
  }

  // LA COUVERTURE VOYAGE AVEC LE CATALOGUE — sa DATE, pas ses octets.
  //
  //  L'écran a besoin de deux choses : « y a-t-il une image ? » (sinon il pose
  //  son visuel de repli) et « de quand date-t-elle ? » (pour ne pas réafficher
  //  celle qu'il garde en mémoire après un remplacement). Les octets, eux, se
  //  demandent image par image — les faire voyager dans le catalogue le
  //  rendrait proportionnel au poids des illustrations.
  //
  //  ⚠️ ENRICHISSEMENT EN LECTURE SEULE. `academyFormations` n'est pas touché :
  //  le catalogue reste ce qu'il était, on lui ajoute un champ ici.
  const avecCouverture = (liste) => {
    const etat = couvertures.etat();
    return liste.map((f) => ({ ...f, couverture: etat.get(f.cle) || null }));
  };

  r.get('/api/academy/formations', exigeCompte, exigeEntree, (req, res) => {
    const liste = avecCouverture(formations.lister());

    // L'AVANCEMENT VOYAGE AVEC LE CATALOGUE.
    //
    //  L'écran d'accueil montre une carte par formation, avec sa barre de
    //  progression. Sans ces trois champs il lui faudrait un appel par
    //  formation — N allers-retours au chargement, sur un téléphone.
    //
    //  C'est un ENRICHISSEMENT EN LECTURE SEULE : aucune règle nouvelle, aucune
    //  écriture, rien qui ne soit déjà calculé par academy.formationPour(). Et
    //  il ne part qu'à qui suit réellement la formation : un évaluateur ou un
    //  administrateur non-collaborateur reçoit le catalogue nu, comme avant.
    //
    //  La progression est celle de L'APPELANT, tirée du jeton : cette route
    //  n'a jamais accepté d'email et ne commence pas aujourd'hui.
    const mail = moi(req);
    const formationsVues = academy.peutSeFormer(mail)
      ? liste.map((f) => {
        const p = academy.formationPour(mail, f.cle);
        return { ...f, total: p.total, termines: p.termines, pourcentage: p.pourcentage, acheve: p.acheve };
      })
      : liste;

    res.json({
      ok: true,
      formations: formationsVues,
      // La formation courante par défaut : la première du catalogue. L'écran
      // n'a pas à la deviner.
      defaut: liste.length ? liste[0].cle : null,
    });
  });

  // On sert le parcours ENRICHI (état du mini et verrou de chaque module) et
  // non l'arbre brut : un écran qui afficherait un module ouvert que le serveur
  // refuse ensuite promet ce qu'il ne peut pas tenir.
  r.get('/api/academy/formation', exigeCompte, exigeCollaborateur, (req, res) => {
    const f = formationDe(req, res);
    if (!f) return;
    res.json({ ok: true, formation: qcm.parcoursPour(moi(req), f.cle), catalogue: f });
  });

  // ==========================================================================
  //  LE VERROU DE MODULE EST TENU ICI, SUR LES TROIS ROUTES DE CONTENU.
  //
  //  Un verrou seulement dessiné à l'écran n'est pas un verrou : il suffirait
  //  d'appeler la route au clavier pour lire, ouvrir ou terminer le contenu d'un
  //  module encore fermé — et donc de traverser la formation sans passer un
  //  seul mini-QCM. Les trois portes sont donc gardées, et par la même
  //  fonction : une règle écrite trois fois finit par diverger.
  // ==========================================================================
  const barrage = (req, res) => {
    const g = qcm.contenuAccessible(moi(req), req.params.id);
    if (!g.body.ok) { res.status(g.status).json(g.body); return null; }
    return g.body.contenu;
  };

  // ==========================================================================
  //  TOUTE RÉPONSE QUI PORTE LE PARCOURS PORTE LE PARCOURS ENRICHI.
  //
  //  `academy.ouvrirContenu` et `terminerContenu` renvoient l'arbre BRUT : ils
  //  vivent dans le moteur de progression, qui ne connaît pas les mini-QCM. Les
  //  servir tels quels donnait à l'écran un parcours amputé de `mini` — donc
  //  sans verrou et sans mini-QCM — dès le premier « Terminer ». L'écran
  //  rouvrait alors tous les modules et enchaînait droit sur une porte fermée.
  //
  //  Le moteur n'a pas à changer : c'est ICI, au point de sortie, qu'on
  //  recompose ce que l'écran doit recevoir. Une seule fonction pour les deux
  //  routes : la dupliquer, c'est se garantir qu'une des copies oubliera.
  // ==========================================================================
  const avecParcours = (req, res, r_) => {
    if (r_.body && r_.body.ok && r_.body.formation) {
      r_.body.formation = qcm.parcoursPour(moi(req), r_.body.formation.formation);
    }
    res.status(r_.status).json(r_.body);
  };

  r.get('/api/academy/contenus/:id', exigeCompte, exigeCollaborateur, (req, res) => {
    const c = barrage(req, res);
    if (!c) return;
    res.json({ ok: true, contenu: c });
  });

  // Ouvrir ≠ terminer. Deux routes distinctes, parce que ce sont deux faits
  // différents et qu'une seule route les confondrait tôt ou tard.
  // REPRENDRE SA FORMATION. La cible n'est pas dans la requête : le serveur la
  // calcule. Un contenu archivé entre l'affichage de la page et le clic ne peut
  // donc plus envoyer le coach nulle part — voir academy.reprendre().
  r.post('/api/academy/reprendre', exigeCompte, exigeCollaborateur, (req, res) => {
    const f = formationDe(req, res);
    if (!f) return;
    const r_ = academy.reprendre(moi(req), f.cle);
    res.status(r_.status).json(r_.body);
  });

  r.post('/api/academy/contenus/:id/ouvrir', exigeCompte, exigeCollaborateur, (req, res) => {
    if (!barrage(req, res)) return;
    avecParcours(req, res, academy.ouvrirContenu(moi(req), req.params.id));
  });

  r.post('/api/academy/contenus/:id/terminer', exigeCompte, exigeCollaborateur, (req, res) => {
    if (!barrage(req, res)) return;
    avecParcours(req, res, academy.terminerContenu(moi(req), req.params.id));
  });


  // ==========================================================================
  //  ÉVALUATION THÉORIQUE (QCM)
  //
  //  Comme le reste de l'Academy, AUCUNE de ces routes n'accepte d'email :
  //  la portée vient du jeton. Et aucune n'accepte de score ni de seuil — le
  //  navigateur envoie des identifiants de choix, rien d'autre. Ce qu'il
  //  pourrait glisser d'autre dans le corps de la requête n'est jamais lu.
  //
  //  Une tentative qui n'appartient pas à l'appelant répond 404 et non 403 :
  //  un 403 confirmerait qu'elle existe, ce qui est déjà une fuite.
  // ==========================================================================

  r.get('/api/academy/qcm', exigeCompte, exigeCollaborateur, (req, res) => {
    const f = formationDe(req, res);
    if (!f) return;
    res.json({ ok: true, qcm: qcm.etatPour(moi(req), f.cle) });
  });

  // `moduleId` dans le corps ouvre le MINI-QCM de ce module ; son absence ouvre
  // le QCM final. La portée vient donc d'un fait explicite, jamais d'un défaut
  // deviné : un corps vide reste le QCM final, comme avant ce lot.
  r.post('/api/academy/qcm/tentatives', exigeCompte, exigeCollaborateur, (req, res) => {
    const f = formationDe(req, res);
    if (!f) return;
    const brut = (req.body || {}).moduleId;
    const moduleId = (brut === undefined || brut === null || brut === '') ? null : Number(brut);
    if (moduleId !== null && !Number.isInteger(moduleId)) {
      return res.status(400).json({ ok: false, error: 'Module invalide.' });
    }
    const r_ = qcm.demarrer(moi(req), f.cle, { moduleId });
    res.status(r_.status).json(r_.body);
  });

  r.get('/api/academy/qcm/tentatives/:id', exigeCompte, exigeCollaborateur, (req, res) => {
    const r_ = qcm.lireTentative(moi(req), req.params.id);
    res.status(r_.status).json(r_.body);
  });

  // Enregistrer une réponse. On lit UNIQUEMENT `choix` : le reste du corps est
  // ignoré, quoi qu'il contienne.
  r.put('/api/academy/qcm/tentatives/:id/reponses/:tqId', exigeCompte, exigeCollaborateur, (req, res) => {
    const choix = (req.body || {}).choix;
    const r_ = qcm.repondre(moi(req), req.params.id, req.params.tqId, choix === undefined ? [] : choix);
    res.status(r_.status).json(r_.body);
  });

  // La correction, le score et le verdict se décident ICI, côté serveur. Le
  // navigateur ne fait que demander la clôture.
  //  ⚠️ SECOND ENDROIT OÙ LA CERTIFICATION PART : une formation SANS pratique
  //  obligatoire n'a plus rien à franchir après un QCM final réussi.
  //
  //  On appelle `delivrerSiComplet` sans se demander de quelle épreuve il
  //  s'agissait — mini ou finale — parce qu'elle relit les prérequis complets
  //  et ne délivre que s'ils sont tous remplis. Un mini réussi ne certifie
  //  donc personne, sans qu'on ait à le vérifier deux fois ici.
  r.post('/api/academy/qcm/tentatives/:id/terminer', exigeCompte, exigeCollaborateur, (req, res) => {
    const r_ = qcm.terminer(moi(req), req.params.id);
    if (!r_.ok || !r_.body.formation) return res.status(r_.status).json(r_.body);
    const auto = certifications.delivrerSiComplet(moi(req), r_.body.formation);
    res.status(r_.status).json(auto.delivree
      ? { ...r_.body, certification: auto.certification, certificationAutomatique: true }
      : r_.body);
  });


  // ==========================================================================
  //  ÉVALUATION PRATIQUE (lot 3)
  //
  //  Deux portes, et elles ne donnent pas sur le même couloir :
  //
  //   - LE COLLABORATEUR lit SON état. Aucune route de ce groupe n'accepte
  //     d'email : la portée vient du jeton, comme partout ailleurs.
  //   - L'ÉVALUATEUR/CERTIFICATEUR lit et écrit les évaluations des AUTRES.
  //     Toutes ses routes passent par exigeEvaluer, et le moteur refuse en plus
  //     qu'il s'évalue lui-même — un droit d'évaluer ne doit jamais valoir
  //     droit de se valider soi-même.
  //
  //  Le prérequis théorique est relu À L'ÉCRITURE, pas seulement à l'affichage :
  //  sinon un appel direct à l'API passerait devant l'écran.
  // ==========================================================================

  function exigeEvaluer(req, res, next) {
    if (!peutEvaluer(moi(req))) {
      return res.status(403).json({
        ok: false, nonEvaluateur: true,
        // Le mot affiché est « certificateur » depuis que le droit s'administre
        // dans Collaborateurs. La clé technique, elle, reste `evaluateur`.
        error: 'Seuls les certificateurs désignés et les administrateurs peuvent évaluer et certifier.',
      });
    }
    next();
  }

  // -- Côté collaborateur ----------------------------------------------------

  r.get('/api/academy/pratique', exigeCompte, exigeCollaborateur, (req, res) => {
    const f = formationDe(req, res);
    if (!f) return;
    res.json({ ok: true, pratique: pratique.etatPour(moi(req), f.cle), catalogue: f });
  });

  // -- Côté évaluateur -------------------------------------------------------

  r.get('/api/academy/evaluateur/collaborateurs', exigeCompte, exigeEvaluer, (req, res) => {
    const f = formationDe(req, res);
    if (!f) return;
    // La formation repart avec la liste : l'évaluateur doit lire à l'écran
    // POUR QUELLE formation il s'apprête à prononcer un résultat.
    res.json({ ok: true, formation: f, formations: formations.lister(),
      collaborateurs: pratique.listerEligibles(f.cle) });
  });

  // LA LISTE UNIFIÉE de l'espace « Évaluer & certifier » : tous les coachs de
  // la formation, à toutes les étapes, avec UN seul statut chacun. Elle remplace
  // à l'écran les deux listes d'avant (éligibles à l'évaluation d'un côté,
  // éligibles à la certification de l'autre) — qui laissaient invisible un
  // coach encore en cours d'apprentissage.
  // « TOUTES LES FORMATIONS ». Un évaluateur qui suit plusieurs parcours doit
  // pouvoir lire sa file de travail entière, sans changer d'onglet cinq fois.
  //
  // L'AGRÉGATION EST ISOLÉE ICI, et volontairement : `listerCoachs` n'est pas
  // touchée, ni `ligneCoach`, ni `statutCoach`, ni `RANG_STATUT`. On appelle la
  // même fonction, une fois par formation publiée, et on marque chaque ligne de
  // la formation d'où elle vient — un dossier est un couple (coach, formation),
  // pas un coach.
  //
  // ⚠️ Le mode mono-formation, lui, ne change en RIEN : c'est la branche du bas,
  // identique à ce qu'elle était.
  const TOUTES = 'toutes';

  r.get('/api/academy/evaluateur/coachs', exigeCompte, exigeEvaluer, (req, res) => {
    if (String(cleDemandee(req) || '').trim().toLowerCase() === TOUTES) {
      const publiees = formations.lister();
      const coachs = [];
      for (const f of publiees) {
        const l = certifications.listerCoachs(f.cle);
        for (const c of l.coachs) {
          coachs.push({ ...c, formation: f.cle, formationLibelle: f.libelle, formationCategorie: f.categorie });
        }
      }
      return res.json({
        ok: true,
        // Pas de formation courante : c'est justement ce que dit « toutes ».
        formation: null,
        toutes: true,
        formations: publiees,
        coachs,
        // Le bento en a besoin, et le serveur est seul à savoir lire
        // `delivree_le`. Champ additif : rien d'autre ne le consomme.
        certifsDuMois: certifications.compterCertifsRecentes(30),
        peutRetirer: estAdministrateur(moi(req)),
      });
    }

    const f = formationDe(req, res);
    if (!f) return;
    const liste = certifications.listerCoachs(f.cle);
    res.json({
      ok: true,
      toutes: false,
      // Chaque ligne porte SA formation, en mono comme en agrégé : l'écran a
      // ainsi une seule façon de lire une ligne, quel que soit le mode.
      coachs: liste.coachs.map((c) => ({ ...c, formation: f.cle, formationLibelle: f.libelle, formationCategorie: f.categorie })),
      // La formation entière, pas seulement sa clé : l'écran doit LIRE pour
      // quel parcours il s'apprête à prononcer, et pouvoir en changer.
      formation: f,
      formations: formations.lister(),
      certificationActive: liste.certificationActive,
      pratiqueObligatoire: liste.pratiqueObligatoire,
      certifsDuMois: certifications.compterCertifsRecentes(30),
      // Le drapeau dit à l'écran s'il doit proposer le retrait d'un diplôme :
      // ce geste-là reste à l'administrateur, et l'écran ne doit pas dessiner
      // un bouton que le serveur refusera.
      peutRetirer: estAdministrateur(moi(req)),
    });
  });

  r.get('/api/academy/evaluateur/collaborateurs/:email', exigeCompte, exigeEvaluer, (req, res) => {
    const f = formationDe(req, res);
    if (!f) return;
    const r_ = pratique.ficheDe(req.params.email, f.cle);
    if (r_.ok) {
      r_.body.formation = f;
      // LA GRILLE DE CETTE FORMATION, servie avec la fiche : l'écran ne la
      // connaît pas, il la reçoit. Une formation sans grille en renvoie une
      // vide — et l'écran retombe alors sur le formulaire libre d'avant.
      r_.body.grille = grilles ? grilles.grillePour(f.cle) : [];
    }
    res.status(r_.status).json(r_.body);
  });

  // Ouvrir une évaluation. Sans résultat : séance ouverte, verdict à venir.
  // Avec résultat : l'évaluateur qui saisit à chaud clôt en une fois.
  //
  //  ⚠️ UN VERDICT PEUT DONC ÊTRE PRONONCÉ ICI AUSSI, et la certification
  //  automatique doit partir des DEUX portes. Elles sont les seules à écrire
  //  `academy_evaluations.resultat` — manquer l'une laisserait un coach tout
  //  validé sans diplôme, précisément l'attente que ce lot supprime.
  //  `delivrerSiComplet` étant idempotente, la brancher deux fois ne risque
  //  rien : au pire elle répond « déjà certifié » et n'écrit pas une ligne.
  r.post('/api/academy/evaluateur/collaborateurs/:email/evaluations', exigeCompte, exigeEvaluer, (req, res) => {
    const f = formationDe(req, res);
    if (!f) return;
    const r_ = pratique.ouvrir(req.params.email, moi(req), { ...(req.body || {}), formation: f.cle });
    if (!r_.ok) return res.status(r_.status).json(r_.body);
    const auto = certifications.delivrerSiComplet(req.params.email, f.cle);
    res.status(r_.status).json(auto.delivree
      ? { ...r_.body, certification: auto.certification, certificationAutomatique: true }
      : r_.body);
  });

  // Prononcer le verdict d'une séance ouverte. Une évaluation close est
  // immuable : on n'y revient pas, on en ouvre une nouvelle.
  //
  //  ⚠️ C'EST ICI QUE LA CERTIFICATION PART, quand le verdict complète le
  //  parcours. Il n'y a plus d'étape « à certifier » entre les deux.
  //
  //  Le couple (coach, formation) est lu sur la séance AVANT le verdict : la
  //  réponse de `enregistrerResultat` ne porte pas l'e-mail, et surtout on ne
  //  le prend jamais dans le corps de la requête — ce serait prononcer sur un
  //  dossier qu'on n'a pas ouvert.
  //
  //  `delivrerSiComplet` est silencieuse : si la pratique est « à repasser »,
  //  ou si la formation ne certifie pas, elle ne fait rien. Un refus de sa
  //  part ne doit JAMAIS transformer un verdict correctement enregistré en
  //  erreur HTTP — le verdict, lui, est déjà écrit.
  r.put('/api/academy/evaluateur/evaluations/:id', exigeCompte, exigeEvaluer, (req, res) => {
    const seance = pratique.lireEvaluation(req.params.id);
    const r_ = pratique.enregistrerResultat(req.params.id, moi(req), req.body || {});
    if (!r_.ok || !seance) return res.status(r_.status).json(r_.body);
    const auto = certifications.delivrerSiComplet(seance.email, seance.formation);
    // L'écran doit pouvoir dire « certifié » plutôt que « validé » dans la
    // foulée : on lui rend le diplôme quand il vient d'être créé.
    res.status(r_.status).json(auto.delivree
      ? { ...r_.body, certification: auto.certification, certificationAutomatique: true }
      : r_.body);
  });

  // -- Administration, réduite au strict nécessaire --------------------------
  //
  //  Désigner un évaluateur, et rien d'autre. L'administration de l'Academy
  //  (banque de questions, contenus, configuration) reste hors de ce lot.
  //  L'administrateur étant évaluateur/certificateur d'office (cf. peutEvaluer
  //  en tête de fichier), aucun amorçage n'est requis pour que le dispositif
  //  fonctionne : cette liste sert à habiliter les évaluateurs QUI NE SONT PAS
  //  administrateurs.

  //  `evaluateurs` = les lignes de droits telles quelles (contrat du lot 3,
  //  inchangé). `comptes` = la vue de l'écran : chaque candidat avec son droit
  //  actuel. Les deux viennent de la MÊME table ; la seconde est un confort
  //  d'affichage, pas une seconde source de vérité.
  r.get('/api/academy/admin/evaluateurs', exigeCompte, exigeAdmin, (_req, res) => {
    res.json({
      ok: true,
      evaluateurs: pratique.listerEvaluateurs(),
      comptes: pratique.listerGestionEvaluateurs(),
    });
  });

  // Désigner ou retirer. La liste à jour repart avec la réponse : l'écran n'a
  // pas à redemander, et ne peut donc pas afficher un droit périmé.
  r.post('/api/academy/admin/evaluateurs', exigeCompte, exigeAdmin, (req, res) => {
    const { email, evaluateur } = req.body || {};
    const r_ = pratique.definirEvaluateur(email, evaluateur !== false, moi(req));
    if (r_.ok) {
      r_.body.comptes = pratique.listerGestionEvaluateurs();
      // LA LISTE DES COLLABORATEURS REPART AVEC LA RÉPONSE : c'est désormais
      // depuis cet écran qu'on bascule le droit, et il ne doit pas avoir à
      // redemander — donc pas de fenêtre où il afficherait un droit périmé.
      r_.body.collaborateurs = listeCollaborateurs();
    }
    res.status(r_.status).json(r_.body);
  });


  // ==========================================================================
  //  CERTIFICATION FINALE (lot 4)
  //
  //  Le collaborateur LIT son parcours ; l'administrateur DÉLIVRE et RETIRE.
  //  Aucune route de lecture collaborateur n'accepte d'email, et aucune route
  //  d'écriture n'accepte de statut, de droit ni d'identité : ce que le
  //  navigateur envoie, c'est une formation, une date et un motif. Le reste —
  //  qui délivre, si les prérequis sont remplis, ce que ça ouvre — se décide
  //  ici.
  // ==========================================================================

  r.get('/api/academy/certification', exigeCompte, exigeCollaborateur, (req, res) => {
    res.json({ ok: true, certifications: certifications.etatCompletPour(moi(req)) });
  });

  // DÉLIVRER EST UN GESTE D'ÉVALUATEUR/CERTIFICATEUR, RETIRER EST UN GESTE
  // D'ADMINISTRATEUR. Les deux ne pèsent pas pareil : délivrer conclut un
  // parcours dont les prérequis sont déjà remplis et relus ici ; retirer ferme
  // des droits ouverts, exige un motif, et se lit comme une sanction. Le chemin
  // d'URL reste sous /admin/ — le renommer casserait des appels existants pour
  // un gain cosmétique ; c'est la GARDE qui dit qui entre, pas le chemin.
  r.get('/api/academy/admin/certifications', exigeCompte, exigeEvaluer, (req, res) => {
    if (!formationDe(req, res)) return;
    res.json({
      ok: true,
      formations: certifications.formations(),
      formation: (formations.resoudre(cleDemandee(req)) || {}),
      ...certifications.listerAdmin(cleDemandee(req)),
    });
  });

  r.post('/api/academy/admin/certifications/:email', exigeCompte, exigeEvaluer, (req, res) => {
    const f = formationDe(req, res);
    if (!f) return;
    const r_ = certifications.delivrer(req.params.email, moi(req), { ...(req.body || {}), formation: f.cle });
    if (r_.ok) r_.body.liste = certifications.listerAdmin(f.cle);
    res.status(r_.status).json(r_.body);
  });

  // Retrait : POST et non DELETE, parce qu'il PORTE UN CORPS — le motif est
  // obligatoire, et un corps sur un DELETE ne traverse pas tous les
  // intermédiaires de façon fiable.
  r.post('/api/academy/admin/certifications/:email/retrait', exigeCompte, exigeAdmin, (req, res) => {
    const f = formationDe(req, res);
    if (!f) return;
    const r_ = certifications.retirer(req.params.email, moi(req), { ...(req.body || {}), formation: f.cle });
    if (r_.ok) r_.body.liste = certifications.listerAdmin(f.cle);
    res.status(r_.status).json(r_.body);
  });


  // ==========================================================================
  //  ADMINISTRATION DES CONTENUS (lot 6)
  //
  //  Ce groupe fait ce que seul le SQL savait faire jusqu'ici : poser une
  //  formation, ses modules, ses vidéos et sa banque de questions.
  //
  //  ⚠️ POINT DE SÉCURITÉ DU LOT. `GET /admin/arbre` est la SEULE route de
  //  toute l'application qui laisse sortir `academy_choix.correct`. Elle est
  //  gardée par exigeAdmin, comme les deux autres routes d'administration, et
  //  aucune route collaborateur n'appelle le module qui la sert. Un
  //  collaborateur — même en pleine tentative — ne reçoit jamais autre chose
  //  que des identifiants de choix : le corrigé de sa tentative est figé dans
  //  academy_tentative_questions, table qu'aucune vue collaborateur ne lit.
  //
  //  LA FORMATION DE CES ROUTES SE RÉSOUT AVEC LES BROUILLONS. C'est la seule
  //  différence avec formationDe(), et c'est tout l'objet du lot : administrer
  //  une formation qui n'est pas encore publiée. Les routes collaborateur, elles,
  //  continuent de répondre 404 sur une formation inactive.
  // ==========================================================================

  function formationAdmin(req, res) {
    const f = formations.resoudre(cleDemandee(req), { inclureInactives: true });
    if (!f) {
      res.status(404).json({ ok: false, formationInconnue: true, error: 'Formation inconnue.' });
      return null;
    }
    return f;
  }

  // Le catalogue COMPLET, brouillons compris. Distinct de
  // /api/academy/formations, qui ne montre que le publié — les deux listes
  // n'ont pas le même public et ne doivent pas se confondre.
  r.get('/api/academy/admin/formations', exigeCompte, exigeAdmin, (_req, res) => {
    const liste = avecCouverture(formations.lister({ toutes: true }));
    res.json({
      ok: true,
      formations: liste.map((f) => ({ ...f, verification: admin.verifier(f.cle) })),
    });
  });

  // Créer. TOUJOURS en brouillon : la route ne lit même pas `actif`.
  r.post('/api/academy/admin/formations', exigeCompte, exigeAdmin, (req, res) => {
    const r_ = admin.creerFormation(req.body || {}, moi(req));
    if (r_.ok) r_.body.verification = admin.verifier(r_.body.formation.cle);
    res.status(r_.status).json(r_.body);
  });

  // Régler. `actif` est ignoré ici aussi : on ne publie pas par effet de bord
  // d'un enregistrement de réglages.
  r.put('/api/academy/admin/formations/:cle', exigeCompte, exigeAdmin, (req, res) => {
    const r_ = admin.reglerFormation({ ...(req.body || {}), cle: req.params.cle }, moi(req));
    if (r_.ok) r_.body.verification = admin.verifier(req.params.cle);
    res.status(r_.status).json(r_.body);
  });

  r.post('/api/academy/admin/formations/:cle/publier', exigeCompte, exigeAdmin, (req, res) => {
    const r_ = admin.publier(req.params.cle, moi(req));
    res.status(r_.status).json(r_.body);
  });

  r.post('/api/academy/admin/formations/:cle/depublier', exigeCompte, exigeAdmin, (req, res) => {
    const r_ = admin.depublier(req.params.cle, moi(req));
    res.status(r_.status).json(r_.body);
  });

  // L'arbre d'administration : modules, contenus, banque, corrigé, inactifs
  // compris, plus l'état de publication.
  r.get('/api/academy/admin/arbre', exigeCompte, exigeAdmin, (req, res) => {
    const f = formationAdmin(req, res);
    if (!f) return;
    res.json({ ok: true, ...arbreDe(f.cle) });
  });

  // ==========================================================================
  //  L'APERÇU DES ÉVALUATIONS PRATIQUES — DEUX ROUTES, EN LECTURE SEULE.
  //
  //  À QUOI ELLES SERVENT. Contrôler ce que verra un certificateur AVANT qu'un
  //  seul coach soit prêt : sans dossier, sans théorie validée, sans
  //  éligibilité. C'est un outil de qualité pédagogique, pas un raccourci.
  //
  //  ⚠️ ELLES N'ÉCRIVENT RIEN, ET NE PEUVENT RIEN ÉCRIRE. Ce sont deux GET qui
  //  composent trois lectures existantes — `formations.lister`,
  //  `pratique.listerCas`, `grilles.grillePour`. Aucune logique métier neuve,
  //  aucune table touchée, aucune notification.
  //
  //  ⚠️ ELLES N'AFFAIBLISSENT AUCUNE GARDE. Les routes du parcours réel gardent
  //  `exigeEvaluer`, `verifierCible` et le refus d'auto-validation ; elles ne
  //  sont pas modifiées d'un caractère. Un aperçu ne « contourne » donc rien :
  //  il n'y a rien à contourner quand on ne peut pas écrire.
  //
  //  ⚠️ `exigeAdmin`, PAS `exigeEvaluer`. Un certificateur ordinaire n'entre
  //  pas : ce mode montre les cas de TOUTES les formations, brouillons compris,
  //  ce qui relève de l'administration du catalogue et non de l'évaluation.
  // ==========================================================================

  //  LE PÉRIMÈTRE : les formations qui ont un référentiel pratique, c'est-à-dire
  //  des cas OU des critères. Une formation qui n'a ni l'un ni l'autre n'a rien
  //  à prévisualiser, et l'afficher ferait une liste de portes fermées.
  //
  //  BROUILLONS COMPRIS (`toutes: true`) : c'est précisément AVANT publication
  //  qu'on veut relire ses cas.
  const formationsAvecPratique = () => formations.lister({ toutes: true })
    .map((f) => {
      const cas = pratique.listerCas(f.cle);
      const grille = grilles ? grilles.grillePour(f.cle) : [];
      return {
        cle: f.cle,
        libelle: f.libelle,
        titre: f.titre || null,
        actif: !!f.actif,
        nbCas: cas.length,
        nbCriteres: grille.reduce((n, a) => n + a.criteres.length, 0),
        nbAxes: grille.length,
      };
    })
    .filter((f) => f.nbCas > 0 || f.nbCriteres > 0);

  r.get('/api/academy/admin/apercu', exigeCompte, exigeAdmin, (_req, res) => {
    res.json({ ok: true, formations: formationsAvecPratique() });
  });

  //  Le contenu d'une formation : ses cas (scénario compris, tel que
  //  `scenarioDe` le sert au certificateur) et sa grille. STRICTEMENT les
  //  mêmes objets que ceux de la fiche réelle — c'est ce qui garantit que
  //  l'aperçu ne peut pas diverger de ce qu'on prévisualise.
  r.get('/api/academy/admin/apercu/:cle', exigeCompte, exigeAdmin, (req, res) => {
    const cle = String(req.params.cle || '').trim().toLowerCase();
    const f = formations.resoudre(cle, { inclureInactives: true });
    if (!f || f.cle !== cle) return res.status(404).json({ ok: false, error: 'Formation inconnue.' });
    res.json({
      ok: true,
      formation: { cle: f.cle, libelle: f.libelle, titre: f.titre || null, actif: !!f.actif },
      cas: pratique.listerCas(f.cle),
      grille: grilles ? grilles.grillePour(f.cle) : [],
    });
  });

  // Une seule route d'écriture par objet : créer et modifier sont le même
  // geste, distingués par la présence d'un identifiant. L'arbre à jour repart
  // avec la réponse — l'écran ne redemande pas, et ne peut donc pas afficher un
  // état périmé.
  // L'ARBRE, ENRICHI DE LA COUVERTURE — EN UN SEUL ENDROIT.
  //
  //  Le panneau de réglages lit la formation de l'ARBRE, pas celle du
  //  catalogue : c'est cette réponse-là qui doit porter la couverture, sinon
  //  l'administrateur voit « aucune image » sur une formation qui en a une. Et
  //  toutes les écritures de contenu renvoient l'arbre à leur tour — enrichir
  //  la seule route GET aurait fait disparaître l'aperçu au premier module
  //  enregistré. On passe donc par une source unique.
  const arbreDe = (cle) => {
    const a = admin.arbre(cle);
    if (!a || !a.formation) return a;
    return { ...a, formation: { ...a.formation, couverture: couvertures.etat().get(cle) || null } };
  };

  const repondreAvecArbre = (res, r_, cle) => {
    if (r_.ok) r_.body.arbre = arbreDe(cle);
    res.status(r_.status).json(r_.body);
  };

  r.post('/api/academy/admin/modules', exigeCompte, exigeAdmin, (req, res) => {
    const f = formationAdmin(req, res);
    if (!f) return;
    repondreAvecArbre(res, admin.definirModule({ ...(req.body || {}), formation: f.cle }), f.cle);
  });

  r.post('/api/academy/admin/contenus', exigeCompte, exigeAdmin, (req, res) => {
    const f = formationAdmin(req, res);
    if (!f) return;
    repondreAvecArbre(res, admin.definirContenu(req.body || {}), f.cle);
  });

  // ==========================================================================
  //  LES COLLABORATEURS — QUI ENTRE DANS L'ACADEMY
  //
  //  CES DEUX ROUTES N'INVENTENT AUCUN DROIT. Elles délèguent à
  //  `boost.listerCollaborateurs` et `boost.definirRole`, c'est-à-dire à la
  //  table `boost_collaborateurs` — la seule que `academy.peutSeFormer`
  //  consulte pour ouvrir sa porte. Un second système de droits, même bien
  //  intentionné, finirait par diverger de celui-ci.
  //
  //  POURQUOI DES ROUTES ACADEMY PLUTÔT QUE D'APPELER /api/boost/ DEPUIS
  //  L'ÉCRAN : l'écran Academy ne touche pas au Boost, et deux tests le
  //  gardent. La frontière tient ; c'est la porte qui se déplace, pas le mur.
  //
  //  ⚠️ definirRole NE CRÉE JAMAIS DE COMPTE et n'écrit jamais dans `users`.
  //  Retirer l'accès vaut `actif = 0` : la ligne reste, et la progression, les
  //  tentatives et les certifications avec elle.
  // ==========================================================================
  // UNE SEULE LISTE, DEUX ORIGINES. Les comptes existants portent leur statut
  // réel (actif / retiré) ; les adresses inscrites d'avance apparaissent EN
  // ATTENTE, sans aucun droit, jusqu'à ce que leur compte soit créé.
  //  LE NOM VIENT DE `users`, PAS D'UNE TABLE ACADEMY. `listerCollaborateurs`
  //  joint déjà `users` pour le prénom ; on y ajoute le nom de famille au même
  //  endroit. Une adresse en attente, elle, porte l'identité que
  //  l'administrateur a saisie — elle n'a pas encore de compte où la ranger.
  //  ⚠️ LE DROIT DE CERTIFIER VOYAGE AVEC LA LISTE, ET CE N'EST PAS UN SECOND
  //  DROIT. C'est `pratique.estEvaluateur` — la table academy_evaluateurs, la
  //  même que consultent `exigeEvaluer` et `peutEvaluer` — servie en lecture
  //  pour que l'écran des collaborateurs puisse l'afficher et le basculer sans
  //  aller le chercher ailleurs. L'écriture, elle, reste la route existante
  //  (/api/academy/admin/evaluateurs), gardée par exigeAdmin.
  //
  //  `certificateurAdmin` dit une chose différente : ce compte a le droit PAR
  //  SON RÔLE d'administrateur (cf. peutEvaluer en tête de fichier). Il n'y a
  //  rien à lui accorder, et l'écran verrouille son interrupteur — lui poser
  //  une ligne dans academy_evaluateurs créerait un second droit pour la même
  //  personne, et une divergence le jour où l'on retire l'un des deux.
  const listeCollaborateurs = () => [
    ...boost.listerCollaborateurs({ tous: true })
      .map((c) => ({ email: c.email, prenom: c.prenom || '', nom: c.nom || '',
        actif: c.actif, majLe: c.majLe, etat: c.actif ? 'actif' : 'retire',
        certificateur: pratique.estEvaluateur(c.email),
        certificateurAdmin: estAdministrateur(c.email) })),
    ...academy.listerPreautorisations()
      .map((p) => ({ email: p.email, prenom: p.prenom || '', nom: p.nom || '',
        actif: false, majLe: p.creeLe, etat: 'en_attente',
        // Une adresse sans compte ne peut porter aucun droit : `definirEvaluateur`
        // la refuserait (404). L'écran n'affiche donc pas d'interrupteur.
        certificateur: false, certificateurAdmin: false })),
  ];

  r.get('/api/academy/admin/collaborateurs', exigeCompte, exigeAdmin, (_req, res) => {
    res.json({ ok: true, collaborateurs: listeCollaborateurs() });
  });

  r.post('/api/academy/admin/collaborateurs', exigeCompte, exigeAdmin, (req, res) => {
    const { email, role, prenom, nom } = req.body || {};
    // Retirer : le compte existe -> on lui retire le droit ; sinon c'est une
    // adresse en attente -> on retire l'intention. Dans les deux cas, RIEN
    // n'est supprimé du compte lui-même.
    if (String(role || '') === 'client') {
      const r_ = boost.lireUtilisateur(email)
        ? boost.definirRole(email, 'client', moi(req))
        : academy.retirerPreautorisation(email);
      if (!r_.ok) return res.status(r_.status).json(r_.body);
      return res.json({ ok: true, collaborateurs: listeCollaborateurs() });
    }
    // Autoriser : prénom et nom sont désormais demandés, au même titre que
    // l'adresse. On refuse AVANT d'écrire quoi que ce soit — un collaborateur
    // à moitié identifié serait une ligne qu'il faudrait retrouver plus tard.
    const p_ = String(prenom || '').trim();
    const n_ = String(nom || '').trim();
    if (!p_) return res.status(400).json({ ok: false, error: 'Le prénom du collaborateur est requis.' });
    if (!n_) return res.status(400).json({ ok: false, error: 'Le nom du collaborateur est requis.' });
    // `preautoriser` tranche selon que le compte existe ou non.
    const r_ = academy.preautoriser(email, moi(req), { prenom: p_, nom: n_ });
    if (!r_.ok) return res.status(r_.status).json(r_.body);
    res.json({ ok: true, enAttente: !!r_.body.enAttente, collaborateurs: listeCollaborateurs() });
  });

  // ==========================================================================
  //  L'IMAGE DE COUVERTURE D'UNE FORMATION
  //
  //  Une illustration administrable. Elle ne change RIEN au parcours : ni la
  //  progression, ni le QCM, ni l'évaluation, ni la certification ne la
  //  regardent. Une formation sans couverture reste une formation entière —
  //  l'écran pose alors son visuel de repli.
  // ==========================================================================

  // Les octets. Gardés comme le catalogue lui-même : une couverture illustre un
  // parcours réservé aux collaborateurs, elle n'a pas à être publique.
  //
  //  ⚠️ ET UN BROUILLON RESTE UN BROUILLON. Une formation non publiée n'existe
  //  pas pour un collaborateur ; sa couverture non plus, sinon une clé devinée
  //  révélerait par l'image un parcours encore en construction. Seul
  //  l'administrateur, qui la prépare, y accède.
  r.get('/api/academy/formations/:cle/couverture', exigeCompte, exigeEntree, (req, res) => {
    const f = formations.resoudre(req.params.cle, { inclureInactives: estAdministrateur(moi(req)) });
    if (!f) return res.status(404).json({ ok: false, error: 'Formation inconnue.' });
    const img = couvertures.lire(f.cle);
    if (!img) return res.status(404).json({ ok: false, error: 'Aucune couverture.' });
    res.set('Content-Type', img.mime);
    res.set('X-Content-Type-Options', 'nosniff');
    // `private` : la réponse a franchi une garde, elle n'a rien à faire dans un
    // cache partagé. La date de mise à jour sert de repère de fraîcheur côté
    // écran, ce qui permet un cache court sans jamais servir l'ancienne image.
    res.set('Cache-Control', 'private, max-age=60');
    res.send(img.data);
  });

  // L'ENVOI, EN CORPS BRUT — même mécanique que les fichiers de la Boîte à
  // outils, et pour la même raison : le base64 gonflerait l'image d'un tiers,
  // et relever la limite JSON de l'app pour un seul écran la relèverait pour
  // tout le monde. `express.raw` est posé ICI, sur cette route et elle seule.
  //
  //  L'écran redimensionne et recomprime AVANT d'envoyer : ce que reçoit cette
  //  route pèse quelques dizaines de Ko, pas les 5 Mo d'une photo d'appareil.
  r.post('/api/academy/admin/formations/:cle/couverture', exigeCompte, exigeAdmin,
    express.raw({ type: '*/*', limit: '6mb' }),
    (req, res) => {
      const r_ = couvertures.enregistrer(req.params.cle, {
        mime: req.headers['content-type'],
        data: Buffer.isBuffer(req.body) ? req.body : null,
      });
      res.status(r_.status).json(r_.body);
    });

  r.delete('/api/academy/admin/formations/:cle/couverture', exigeCompte, exigeAdmin, (req, res) => {
    const r_ = couvertures.supprimer(req.params.cle);
    res.status(r_.status).json(r_.body);
  });

  // ==========================================================================
  //  LA BOÎTE À OUTILS — une bibliothèque, PAS une formation.
  //
  //  Ces routes ne touchent à AUCUN des moteurs de parcours. Elles ne
  //  consultent ni la progression, ni le QCM, ni l'évaluation pratique, ni la
  //  certification, et n'écrivent nulle part ailleurs que dans les trois tables
  //  de lib/academyRessources.js. Consulter un PDF ne fait donc rien avancer —
  //  c'est la promesse du lot, et elle tient par l'absence de code, pas par une
  //  précaution qu'il faudrait se rappeler.
  //
  //  QUI ENTRE : `exigeEntree`, la même porte que le catalogue — collaborateurs
  //  actifs et évaluateurs. Les franchisés viendront quand leur rôle existera ;
  //  d'ici là, personne n'a de droit qui n'existe pas.
  // ==========================================================================

  // La bibliothèque. Les filtres sont appliqués PAR LE SERVEUR : l'écran ne
  // reçoit que ce qu'il affiche, et la recherche ne suppose pas que toute la
  // bibliothèque tient dans le navigateur.
  r.get('/api/academy/ressources', exigeCompte, exigeEntree, (req, res) => {
    const q = req.query || {};
    res.json({
      ok: true,
      categories: ressources.listerCategories(),
      ressources: ressources.lister({ q: q.q, categorie: q.categorie, type: q.type }),
    });
  });

  // LES OCTETS. Gardés par la même porte que la fiche — contrairement aux
  // photos de plats, qui sont publiques : un support interne n'a pas à être
  // lisible par une URL devinée.
  //
  //  `inline` pour consulter, `attachment` (?dl=1) pour télécharger : c'est le
  //  MÊME fichier et la MÊME route, seule l'intention change. Deux routes
  //  auraient fait deux gardes à tenir.
  r.get('/api/academy/ressources/:id/fichier', exigeCompte, exigeEntree, (req, res) => {
    const f = ressources.lireFichierDe(req.params.id);
    if (!f) return res.status(404).json({ ok: false, error: 'Fichier introuvable.' });
    const telecharger = String((req.query || {}).dl || '') === '1';
    res.set('Content-Type', f.mime);
    // ⚠️ LE NOM NE SE POSE PAS TEL QUEL. Un nom venu d'un macOS est en forme
    // décomposée : l'accent de « Séance » y est un caractère hors ISO-8859-1,
    // que Node refuse dans un en-tête — la route répondait 500, et le lecteur
    // comme le téléchargement recevaient une page d'erreur au lieu du PDF.
    // Le moteur construit les deux formes de la RFC 6266 ; voir son commentaire.
    res.set('Content-Disposition', enteteContentDisposition(f.nom, telecharger));
    // Interdire au navigateur de renifler un autre type que celui annoncé : un
    // PDF ne doit jamais être interprété comme du HTML.
    res.set('X-Content-Type-Options', 'nosniff');
    // `private` : la réponse est nominative (elle a franchi une garde), elle
    // n'a rien à faire dans un cache partagé.
    res.set('Cache-Control', 'private, max-age=300');
    res.send(f.data);
  });

  // -- Administration de la bibliothèque -------------------------------------

  // Tout, archivées comprises : c'est l'écran qui gère, il doit voir ce qu'il
  // peut restaurer.
  r.get('/api/academy/admin/ressources', exigeCompte, exigeAdmin, (_req, res) => {
    res.json({
      ok: true,
      categories: ressources.listerCategories({ toutes: true }),
      ressources: ressources.lister({ toutes: true }),
    });
  });

  // L'ENVOI DU FICHIER, EN CORPS BRUT. Pas de base64 dans du JSON : l'encodage
  // gonfle un PDF d'un tiers, et la limite JSON de l'app est à 6 Mo — la
  // relever pour tout le monde afin de faire passer un document serait payer
  // partout le prix d'un seul écran. `express.raw` est posé ICI, sur cette
  // route et elle seule.
  //
  //  L'envoi précède l'enregistrement de la fiche : la réponse porte un
  //  `fichierId` que le formulaire renvoie ensuite. Un fichier envoyé puis
  //  abandonné ne laisse qu'une ligne orpheline, jamais une fiche cassée.
  r.post('/api/academy/admin/ressources/fichier', exigeCompte, exigeAdmin,
    express.raw({ type: '*/*', limit: '25mb' }),
    (req, res) => {
      const r_ = ressources.enregistrerFichier({
        mime: req.headers['content-type'],
        nom: (req.query || {}).nom,
        data: Buffer.isBuffer(req.body) ? req.body : null,
      });
      res.status(r_.status).json(r_.body);
    });

  const repondreAvecBibliotheque = (res, r_) => {
    if (!r_.ok) return res.status(r_.status).json(r_.body);
    res.json({
      ok: true,
      ...r_.body,
      categories: ressources.listerCategories({ toutes: true }),
      ressources: ressources.lister({ toutes: true }),
    });
  };

  // Créer ET modifier : une seule route, distinguées par la présence d'un `id`,
  // comme les modules et les contenus.
  r.post('/api/academy/admin/ressources', exigeCompte, exigeAdmin, (req, res) => {
    repondreAvecBibliotheque(res, ressources.definir(req.body || {}, moi(req)));
  });

  r.post('/api/academy/admin/ressources/archiver', exigeCompte, exigeAdmin, (req, res) => {
    const { id, actif } = req.body || {};
    repondreAvecBibliotheque(res, ressources.basculerActif(id, actif === true));
  });

  // La seule suppression définitive de toute l'Academy, et elle est légitime :
  // rien ne pointe vers une ressource (cf. l'en-tête du moteur). Ailleurs, un
  // DELETE emporterait la progression de quelqu'un.
  r.post('/api/academy/admin/ressources/supprimer', exigeCompte, exigeAdmin, (req, res) => {
    repondreAvecBibliotheque(res, ressources.supprimer((req.body || {}).id));
  });

  r.post('/api/academy/admin/ressources/ordre', exigeCompte, exigeAdmin, (req, res) => {
    repondreAvecBibliotheque(res, ressources.reordonner((req.body || {}).ids));
  });

  // Les catégories : administrables pour qu'elles puissent évoluer sans
  // redéploiement — c'était la demande, et c'est ce qui distingue cette liste
  // des catégories de FORMATIONS, qui restent une liste fermée du code.
  //
  //  ⚠️ CE SONT DEUX CHOSES DIFFÉRENTES, ET ELLES LE RESTENT. Ici : le domaine
  //  d'une ressource (Coaching, Pilotage & KPI…), en base, extensible. Là-bas
  //  (lib/academyFormations.js) : la famille d'un parcours, en constante,
  //  fermée. Les mélanger reviendrait à pouvoir classer une certification dans
  //  une bibliothèque de documents.
  //
  //  Une seule route pour créer ET renommer, distinguées par l'existence de la
  //  clé — même forme que les ressources, les modules et les contenus.
  r.post('/api/academy/admin/ressources/categories', exigeCompte, exigeAdmin, (req, res) => {
    repondreAvecBibliotheque(res, ressources.definirCategorie(req.body || {}));
  });

  // Archiver / réactiver. La réponse porte le nombre de ressources concernées :
  // l'écran doit pouvoir dire ce qui arrive, plutôt que de masquer en silence
  // une catégorie qui en contient douze.
  r.post('/api/academy/admin/ressources/categories/archiver', exigeCompte, exigeAdmin, (req, res) => {
    const { cle, actif } = req.body || {};
    repondreAvecBibliotheque(res, ressources.basculerCategorie(cle, actif === true));
  });

  r.post('/api/academy/admin/ressources/categories/ordre', exigeCompte, exigeAdmin, (req, res) => {
    repondreAvecBibliotheque(res, ressources.reordonnerCategories((req.body || {}).cles));
  });

  // L'IMPORT D'UNE FORMATION COMPLÈTE. Deux usages, une seule route :
  //   { apercu: true }  -> valide et rapporte, SANS ÉCRIRE UNE LIGNE ;
  //   { apercu: false } -> écrit, en une transaction, TOUJOURS en brouillon.
  //
  // L'aperçu est une commodité d'écran, jamais une autorisation : l'écriture
  // rejoue l'analyse complète pour son propre compte.
  r.post('/api/academy/admin/import', exigeCompte, exigeAdmin, (req, res) => {
    const corps = req.body || {};
    const r_ = admin.importer(corps.json, { apercu: !!corps.apercu }, moi(req));
    res.status(r_.status).json(r_.body);
  });

  // Les cas d'évaluation pratique. Même forme que les trois autres écritures :
  // une seule route, créer et modifier distingués par la présence d'un `id`.
  // L'archivage et l'ordre passent par les routes communes, avec `type: 'cas'`.
  r.post('/api/academy/admin/cas', exigeCompte, exigeAdmin, (req, res) => {
    const f = formationAdmin(req, res);
    if (!f) return;
    repondreAvecArbre(res, admin.definirCas({ ...(req.body || {}), formation: f.cle }), f.cle);
  });

  r.post('/api/academy/admin/questions', exigeCompte, exigeAdmin, (req, res) => {
    const f = formationAdmin(req, res);
    if (!f) return;
    repondreAvecArbre(res, admin.definirQuestion({ ...(req.body || {}), formation: f.cle }), f.cle);
  });

  // Archiver et restaurer. Aucun DELETE dans tout ce groupe : supprimer un
  // contenu emporterait en cascade la progression de ceux qui l'ont terminé.
  r.post('/api/academy/admin/archiver', exigeCompte, exigeAdmin, (req, res) => {
    const f = formationAdmin(req, res);
    if (!f) return;
    const { type, id, actif } = req.body || {};
    repondreAvecArbre(res, admin.basculerActif(type, id, actif === true), f.cle);
  });

  r.post('/api/academy/admin/ordre', exigeCompte, exigeAdmin, (req, res) => {
    const f = formationAdmin(req, res);
    if (!f) return;
    const { type, ids } = req.body || {};
    repondreAvecArbre(res, admin.reordonner(type, ids), f.cle);
  });

  return r;
}

module.exports = { creerRoutesAcademy };
