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

function creerRoutesAcademy({ academy, qcm, pratique, certifications, formations, admin, ressources, boost, exigeCompte, exigeAdmin, estAdmin }) {
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
  r.use('/api/academy', (req, _res, next) => { academy.assurerSchema(); qcm.assurerSchema(); pratique.assurerSchema(); certifications.assurerSchema(); ressources.assurerSchema(); next(); });

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

  r.get('/api/academy/formations', exigeCompte, exigeEntree, (req, res) => {
    const liste = formations.lister();

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
  r.post('/api/academy/qcm/tentatives/:id/terminer', exigeCompte, exigeCollaborateur, (req, res) => {
    const r_ = qcm.terminer(moi(req), req.params.id);
    res.status(r_.status).json(r_.body);
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
        error: 'Seuls les évaluateurs désignés et les administrateurs peuvent évaluer et certifier.',
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
          coachs.push({ ...c, formation: f.cle, formationLibelle: f.libelle });
        }
      }
      return res.json({
        ok: true,
        // Pas de formation courante : c'est justement ce que dit « toutes ».
        formation: null,
        toutes: true,
        formations: publiees,
        coachs,
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
      coachs: liste.coachs.map((c) => ({ ...c, formation: f.cle, formationLibelle: f.libelle })),
      // La formation entière, pas seulement sa clé : l'écran doit LIRE pour
      // quel parcours il s'apprête à prononcer, et pouvoir en changer.
      formation: f,
      formations: formations.lister(),
      certificationActive: liste.certificationActive,
      pratiqueObligatoire: liste.pratiqueObligatoire,
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
    if (r_.ok) r_.body.formation = f;
    res.status(r_.status).json(r_.body);
  });

  // Ouvrir une évaluation. Sans résultat : séance ouverte, verdict à venir.
  // Avec résultat : l'évaluateur qui saisit à chaud clôt en une fois.
  r.post('/api/academy/evaluateur/collaborateurs/:email/evaluations', exigeCompte, exigeEvaluer, (req, res) => {
    const f = formationDe(req, res);
    if (!f) return;
    const r_ = pratique.ouvrir(req.params.email, moi(req), { ...(req.body || {}), formation: f.cle });
    res.status(r_.status).json(r_.body);
  });

  // Prononcer le verdict d'une séance ouverte. Une évaluation close est
  // immuable : on n'y revient pas, on en ouvre une nouvelle.
  r.put('/api/academy/evaluateur/evaluations/:id', exigeCompte, exigeEvaluer, (req, res) => {
    const r_ = pratique.enregistrerResultat(req.params.id, moi(req), req.body || {});
    res.status(r_.status).json(r_.body);
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
    if (r_.ok) r_.body.comptes = pratique.listerGestionEvaluateurs();
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
    const liste = formations.lister({ toutes: true });
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
    res.json({ ok: true, ...admin.arbre(f.cle) });
  });

  // Une seule route d'écriture par objet : créer et modifier sont le même
  // geste, distingués par la présence d'un identifiant. L'arbre à jour repart
  // avec la réponse — l'écran ne redemande pas, et ne peut donc pas afficher un
  // état périmé.
  const repondreAvecArbre = (res, r_, cle) => {
    if (r_.ok) r_.body.arbre = admin.arbre(cle);
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
  const listeCollaborateurs = () => [
    ...boost.listerCollaborateurs({ tous: true })
      .map((c) => ({ email: c.email, prenom: c.prenom, actif: c.actif, majLe: c.majLe,
        etat: c.actif ? 'actif' : 'retire' })),
    ...academy.listerPreautorisations()
      .map((p) => ({ email: p.email, prenom: '', actif: false, majLe: p.creeLe, etat: 'en_attente' })),
  ];

  r.get('/api/academy/admin/collaborateurs', exigeCompte, exigeAdmin, (_req, res) => {
    res.json({ ok: true, collaborateurs: listeCollaborateurs() });
  });

  r.post('/api/academy/admin/collaborateurs', exigeCompte, exigeAdmin, (req, res) => {
    const { email, role } = req.body || {};
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
    // Autoriser : `preautoriser` tranche selon que le compte existe ou non.
    const r_ = academy.preautoriser(email, moi(req));
    if (!r_.ok) return res.status(r_.status).json(r_.body);
    res.json({ ok: true, enAttente: !!r_.body.enAttente, collaborateurs: listeCollaborateurs() });
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
    // Le nom est déjà nettoyé à l'enregistrement (nomPropre) ; on ne le
    // reconstruit pas ici, on le repasse tel quel.
    res.set('Content-Disposition', `${telecharger ? 'attachment' : 'inline'}; filename="${f.nom}"`);
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
