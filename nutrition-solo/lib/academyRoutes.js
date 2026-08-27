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

function creerRoutesAcademy({ academy, qcm, pratique, certifications, formations, exigeCompte, exigeAdmin, estAdmin }) {
  const r = express.Router();
  const moi = (req) => String(req.user.email || '').trim().toLowerCase();

  // Le schéma s'applique tout seul à la première requête Academy, comme celui
  // du Boost : aucun ordre d'initialisation à respecter dans server.js.
  r.use('/api/academy', (req, _res, next) => { academy.assurerSchema(); qcm.assurerSchema(); pratique.assurerSchema(); certifications.assurerSchema(); next(); });

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
      // formateur extérieur peut évaluer sans suivre la formation, et
      // l'administrateur évalue d'office. L'écran a besoin des deux pour
      // savoir quoi montrer.
      evaluateur: pratique.estEvaluateur(moi(req)),
      // Administrer et évaluer restent DEUX choses : ce drapeau ne sert qu'à
      // montrer l'écran de gestion des évaluateurs. Il n'ouvre aucune porte —
      // c'est exigeAdmin, côté serveur, qui garde les routes.
      admin: !!estAdmin && estAdmin(moi(req)),
    });
  });

  // Le catalogue : ce que le collaborateur peut suivre. Le serveur reste seul
  // juge — l'écran n'affiche que ce qu'il reçoit ici.
  r.get('/api/academy/formations', exigeCompte, exigeCollaborateur, (req, res) => {
    const liste = formations.lister();
    res.json({
      ok: true,
      formations: liste,
      // La formation courante par défaut : la première du catalogue. L'écran
      // n'a pas à la deviner.
      defaut: liste.length ? liste[0].cle : null,
    });
  });

  r.get('/api/academy/formation', exigeCompte, exigeCollaborateur, (req, res) => {
    const f = formationDe(req, res);
    if (!f) return;
    res.json({ ok: true, formation: academy.formationPour(moi(req), f.cle), catalogue: f });
  });

  r.get('/api/academy/contenus/:id', exigeCompte, exigeCollaborateur, (req, res) => {
    const c = academy.lireContenu(req.params.id);
    if (!c) return res.status(404).json({ ok: false, error: 'Contenu introuvable.' });
    res.json({ ok: true, contenu: c });
  });

  // Ouvrir ≠ terminer. Deux routes distinctes, parce que ce sont deux faits
  // différents et qu'une seule route les confondrait tôt ou tard.
  r.post('/api/academy/contenus/:id/ouvrir', exigeCompte, exigeCollaborateur, (req, res) => {
    const r_ = academy.ouvrirContenu(moi(req), req.params.id);
    res.status(r_.status).json(r_.body);
  });

  r.post('/api/academy/contenus/:id/terminer', exigeCompte, exigeCollaborateur, (req, res) => {
    const r_ = academy.terminerContenu(moi(req), req.params.id);
    res.status(r_.status).json(r_.body);
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

  r.post('/api/academy/qcm/tentatives', exigeCompte, exigeCollaborateur, (req, res) => {
    const f = formationDe(req, res);
    if (!f) return;
    const r_ = qcm.demarrer(moi(req), f.cle);
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
  //   - L'ÉVALUATEUR lit et écrit les évaluations des AUTRES. Toutes ses
  //     routes passent par exigeEvaluateur, et le moteur refuse en plus qu'il
  //     s'évalue lui-même — un droit d'évaluer ne doit jamais valoir droit de
  //     se valider soi-même.
  //
  //  Le prérequis théorique est relu À L'ÉCRITURE, pas seulement à l'affichage :
  //  sinon un appel direct à l'API passerait devant l'écran.
  // ==========================================================================

  function exigeEvaluateur(req, res, next) {
    if (!pratique.estEvaluateur(moi(req))) {
      return res.status(403).json({
        ok: false, nonEvaluateur: true,
        error: 'Seuls les évaluateurs désignés peuvent enregistrer une évaluation pratique.',
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

  r.get('/api/academy/evaluateur/collaborateurs', exigeCompte, exigeEvaluateur, (req, res) => {
    const f = formationDe(req, res);
    if (!f) return;
    // La formation repart avec la liste : l'évaluateur doit lire à l'écran
    // POUR QUELLE formation il s'apprête à prononcer un résultat.
    res.json({ ok: true, formation: f, formations: formations.lister(),
      collaborateurs: pratique.listerEligibles(f.cle) });
  });

  r.get('/api/academy/evaluateur/collaborateurs/:email', exigeCompte, exigeEvaluateur, (req, res) => {
    const f = formationDe(req, res);
    if (!f) return;
    const r_ = pratique.ficheDe(req.params.email, f.cle);
    if (r_.ok) r_.body.formation = f;
    res.status(r_.status).json(r_.body);
  });

  // Ouvrir une évaluation. Sans résultat : séance ouverte, verdict à venir.
  // Avec résultat : l'évaluateur qui saisit à chaud clôt en une fois.
  r.post('/api/academy/evaluateur/collaborateurs/:email/evaluations', exigeCompte, exigeEvaluateur, (req, res) => {
    const f = formationDe(req, res);
    if (!f) return;
    const r_ = pratique.ouvrir(req.params.email, moi(req), { ...(req.body || {}), formation: f.cle });
    res.status(r_.status).json(r_.body);
  });

  // Prononcer le verdict d'une séance ouverte. Une évaluation close est
  // immuable : on n'y revient pas, on en ouvre une nouvelle.
  r.put('/api/academy/evaluateur/evaluations/:id', exigeCompte, exigeEvaluateur, (req, res) => {
    const r_ = pratique.enregistrerResultat(req.params.id, moi(req), req.body || {});
    res.status(r_.status).json(r_.body);
  });

  // -- Administration, réduite au strict nécessaire --------------------------
  //
  //  Désigner un évaluateur, et rien d'autre. L'administration de l'Academy
  //  (banque de questions, contenus, configuration) reste hors de ce lot.
  //  L'administrateur étant évaluateur d'office, aucun amorçage n'est requis
  //  pour que le dispositif fonctionne.

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

  r.get('/api/academy/admin/certifications', exigeCompte, exigeAdmin, (req, res) => {
    if (!formationDe(req, res)) return;
    res.json({
      ok: true,
      formations: certifications.formations(),
      formation: (formations.resoudre(cleDemandee(req)) || {}),
      ...certifications.listerAdmin(cleDemandee(req)),
    });
  });

  r.post('/api/academy/admin/certifications/:email', exigeCompte, exigeAdmin, (req, res) => {
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

  return r;
}

module.exports = { creerRoutesAcademy };
