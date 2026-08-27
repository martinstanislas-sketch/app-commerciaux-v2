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

function creerRoutesAcademy({ academy, qcm, exigeCompte }) {
  const r = express.Router();
  const moi = (req) => String(req.user.email || '').trim().toLowerCase();

  // Le schéma s'applique tout seul à la première requête Academy, comme celui
  // du Boost : aucun ordre d'initialisation à respecter dans server.js.
  r.use('/api/academy', (req, _res, next) => { academy.assurerSchema(); qcm.assurerSchema(); next(); });

  // Page autonome, servie comme /coach. Un espace de formation et un espace de
  // suivi n'ont ni les mêmes écrans ni le même rythme d'évolution.
  const pageAcademy = (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'academy.html'));
  r.get('/academy', (req, res) => { academy.assurerSchema(); qcm.assurerSchema(); pageAcademy(req, res); });
  r.get('/academy/', (req, res) => { academy.assurerSchema(); qcm.assurerSchema(); pageAcademy(req, res); });

  // Réservé aux collaborateurs actifs. Un client n'a rien à faire ici : le
  // refus le dit franchement plutôt que de lui servir une formation vide.
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
    });
  });

  r.get('/api/academy/formation', exigeCompte, exigeCollaborateur, (req, res) => {
    res.json({ ok: true, formation: academy.formationPour(moi(req)) });
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
    res.json({ ok: true, qcm: qcm.etatPour(moi(req)) });
  });

  r.post('/api/academy/qcm/tentatives', exigeCompte, exigeCollaborateur, (req, res) => {
    const r_ = qcm.demarrer(moi(req));
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

  return r;
}

module.exports = { creerRoutesAcademy };
