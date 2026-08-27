'use strict';
// ============================================================================
//  BOOST NUTRITION — routes HTTP du socle.
//
//  Routeur Express isolé, monté par server.js AVANT le filet /api 404. Aucune
//  route existante n'est modifiée : tout le Boost vit sous /api/boost.
//
//  LE POINT DUR DE CE FICHIER, C'EST LE CLOISONNEMENT. Trois publics, trois
//  portes, et aucune ne doit ouvrir sur le couloir d'à côté :
//
//    client                  -> SON dossier, et rien d'autre. Il ne passe jamais
//                               d'email en paramètre : on lit celui de son jeton.
//    collaborateur certifié  -> UNIQUEMENT les Boosts qui lui sont attribués.
//                               La certification est relue à chaque requête :
//                               la retirer ferme l'accès immédiatement, sans
//                               avoir à défaire les attributions.
//    collaborateur NON certifié -> AUCUN dossier. Pas « une liste vide » : un
//                               refus franc, pour que le cas se voie.
//    admin                   -> administration (création, attribution,
//                               certification, prolongation, interruption,
//                               journal). Il n'anime PAS le suivi : il ne valide
//                               aucune Étape (arbitrage n°2).
//
//  Règle d'écriture suivie partout : un dossier qui ne vous regarde pas répond
//  404, jamais 403. Un 403 confirmerait l'existence du dossier — c'est déjà une
//  fuite. Le 403 est réservé au « vous n'avez pas ce rôle », qui ne dit rien
//  d'un dossier en particulier.
// ============================================================================

const express = require('express');
const path = require('path');
const { ETAPES_TOTAL } = require('./boost');

// `exigeCompte` et `exigeAdmin` sont injectés par server.js : le routeur ne
// redéfinit AUCUNE règle d'authentification (arbitrage n°9 — un seul système).
function creerRoutesBoost({ boost, seances, exigeCompte, exigeAdmin }) {
  const r = express.Router();
  const moi = (req) => String(req.user.email || '').trim().toLowerCase();

  // Le schéma Boost s'applique tout seul, à la première requête Boost venue
  // (l'appel est mémorisé, cf. lib/boost.js). Conséquence voulue : le socle ne
  // dépend d'aucun ordre d'initialisation dans server.js, et une app qui ne
  // touche jamais au Boost ne crée jamais ses tables.
  r.use('/api/boost', (req, _res, next) => { boost.assurerSchema(); seances.assurerSchema(); next(); });

  // Collaborateur certifié = Coach Nutrition en exercice. Tout le reste est
  // refusé ici, avant d'avoir touché le moindre dossier.
  function exigeCoachCertifie(req, res, next) {
    const u = boost.lireUtilisateur(moi(req));
    if (!boost.estCollaborateur(u)) {
      return res.status(403).json({ ok: false, error: 'Réservé aux Coachs Nutrition.' });
    }
    if (!boost.estCoachCertifie(moi(req))) {
      const cert = boost.lireCertification(moi(req));
      return res.status(403).json({
        ok: false, nonCertifie: true, certification: cert.statut,
        error: 'Certification Coach Nutrition requise pour accéder aux dossiers Boost.',
      });
    }
    next();
  }

  const envoyer = (res, r_) => res.status(r_.status).json(r_.body);

  // =========================================================================
  //  CLIENT — son dossier, uniquement.
  // =========================================================================

  // Aucun paramètre d'email nulle part : impossible de demander celui d'un autre.
  r.get('/api/boost/mien', exigeCompte, (req, res) => {
    const dossier = boost.dossierDuClient(moi(req));
    res.json({ ok: true, ...dossier, etapesTotal: ETAPES_TOTAL });
  });

  // =========================================================================
  //  COACH NUTRITION — ses clients attribués, uniquement.
  // =========================================================================

  // L'espace Coach est une PAGE À PART (public/coach.html), pas un onglet de
  // l'app client : un coach n'a rien à faire dans un espace conçu pour suivre
  // SON propre plan de repas, et l'app client n'a pas à embarquer du
  // back-office. Elles ne partagent que l'authentification et cette API.
  const pageCoach = (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'coach.html'));
  r.get('/coach', pageCoach);
  r.get('/coach/', pageCoach);

  // « Qui suis-je ? » — appelé AVANT toute lecture de dossier. Sans cette route,
  // l'écran devrait déduire l'état du collaborateur d'un 403, c'est-à-dire
  // traiter un refus comme une donnée d'affichage. Or « ta certification n'est
  // pas encore validée » n'est pas une erreur : c'est un état normal, qui mérite
  // un écran normal.
  r.get('/api/boost/coach/moi', exigeCompte, (req, res) => {
    const u = boost.lireUtilisateur(moi(req));
    const collaborateur = boost.estCollaborateur(u);
    const cert = boost.lireCertification(moi(req));
    res.json({
      ok: true,
      email: moi(req),
      prenom: (u && u.prenom) || '',
      collaborateur,
      // Sa propre certification : il peut la lire, il ne peut pas la changer.
      certifie: boost.estCoachCertifie(moi(req)),
      certification: cert,
    });
  });

  r.get('/api/boost/coach/dossiers', exigeCompte, exigeCoachCertifie, (req, res) => {
    res.json({ ok: true, dossiers: boost.boostsDuCoach(moi(req)), etapesTotal: ETAPES_TOTAL });
  });

  r.get('/api/boost/coach/dossiers/:id', exigeCompte, exigeCoachCertifie, (req, res) => {
    const b = boost.lireBoost(req.params.id);
    // Dossier d'un autre coach -> 404, pas 403 (cf. en-tête).
    if (!b || b.coachEmail !== moi(req)) return res.status(404).json({ ok: false, error: 'Dossier introuvable.' });
    res.json({ ok: true, boost: b });
  });

  // L'historique d'un dossier, pour le coach qui l'anime. Même portée que le
  // dossier lui-même : hors de son portefeuille, c'est 404.
  r.get('/api/boost/coach/dossiers/:id/journal', exigeCompte, exigeCoachCertifie, (req, res) => {
    const b = boost.lireBoost(req.params.id);
    if (!b || b.coachEmail !== moi(req)) return res.status(404).json({ ok: false, error: 'Dossier introuvable.' });
    res.json({ ok: true, journal: boost.lireJournal(req.params.id) });
  });

  // ---- Rendez-vous (séances) -------------------------------------------
  //
  //  Portée identique au dossier : hors de son portefeuille, c'est 404. Ces
  //  trois routes sont les SEULES à renvoyer les notes internes du coach — ni
  //  la vue client, ni la vue admin ne les servent (arbitrage n°2).
  //
  //  Le facteur commun est isolé dans `monDossier` : un oubli de contrôle sur
  //  l'une des trois ouvrirait le contenu d'un rendez-vous à un confrère, et ça
  //  ne se verrait pas à l'usage.
  function monDossier(req, res) {
    const b = boost.lireBoost(req.params.id);
    if (!b || b.coachEmail !== moi(req)) {
      res.status(404).json({ ok: false, error: 'Dossier introuvable.' });
      return null;
    }
    return b;
  }

  r.get('/api/boost/coach/dossiers/:id/seances/:numero', exigeCompte, exigeCoachCertifie, (req, res) => {
    const b = monDossier(req, res); if (!b) return;
    const n = Number(req.params.numero);
    if (!Number.isInteger(n) || n < 1 || n > ETAPES_TOTAL) {
      return res.status(400).json({ ok: false, error: 'Numéro d\'étape invalide.' });
    }
    res.json({ ok: true, boost: b, seance: seances.seancePourCoach(b.id, n) });
  });

  // Brouillon : le coach quitte et revient sans rien perdre, et le Boost ne
  // bouge pas tant que le rendez-vous n'est pas validé.
  r.put('/api/boost/coach/dossiers/:id/seances/:numero', exigeCompte, exigeCoachCertifie, (req, res) => {
    const b = monDossier(req, res); if (!b) return;
    envoyer(res, seances.enregistrerSeance(b.id, req.params.numero, req.body || {}, moi(req)));
  });

  // Validation : tout ou rien (contenu + action + Étape dans une transaction).
  // L'auteur vient du jeton, jamais du corps de la requête.
  r.post('/api/boost/coach/dossiers/:id/seances/:numero/valider', exigeCompte, exigeCoachCertifie, (req, res) => {
    const b = monDossier(req, res); if (!b) return;
    envoyer(res, seances.validerSeance(b.id, req.params.numero, req.body || {}, moi(req)));
  });

  // Validation d'une Étape : le Coach Nutrition attribué, et lui seul. Ni
  // l'admin, ni un autre coach certifié.
  r.post('/api/boost/coach/dossiers/:id/etapes/:numero/valider', exigeCompte, exigeCoachCertifie, (req, res) => {
    const b = monDossier(req, res); if (!b) return;
    const n = Number(req.params.numero);
    // Une Étape qui porte un rendez-vous ne se valide QUE par son rendez-vous.
    // Sans ce refus, cette route resterait une porte dérobée : elle validerait
    // l'Étape 1 sans objectif, sans action de la semaine et sans que le journal
    // photo ait été expliqué — c'est-à-dire en contournant toutes les règles que
    // S1 existe pour tenir. Le test porte sur « cette Étape a-t-elle un
    // contenu ? », jamais sur « est-ce S1 ? » : quand S2 arrivera, elle se
    // fermera d'elle-même, sans qu'on ait à repasser ici.
    if (seances.aUnContenu(n)) {
      return res.status(409).json({
        ok: false, seanceRequise: true, numero: n,
        error: `L'Étape ${n}/${ETAPES_TOTAL} se valide depuis son rendez-vous (S${n}), pas directement.`,
      });
    }
    envoyer(res, boost.validerEtape(b.id, n, moi(req)));
  });

  // =========================================================================
  //  ADMIN — administration du dispositif.
  // =========================================================================

  // ?tous=1 inclut les collaborateurs désactivés, pour pouvoir les réactiver.
  r.get('/api/boost/admin/collaborateurs', exigeCompte, exigeAdmin, (req, res) => {
    const tous = ['1', 'true', 'oui'].includes(String(req.query.tous || '').toLowerCase());
    res.json({ ok: true, collaborateurs: boost.listerCollaborateurs({ tous }) });
  });

  // Clients à qui ouvrir un Boost. Réservé à l'admin : c'est un annuaire de
  // comptes, la donnée la plus sensible que renvoie ce routeur.
  r.get('/api/boost/admin/clients', exigeCompte, exigeAdmin, (req, res) => {
    res.json({ ok: true, clients: boost.listerClients({ q: req.query.q, limite: req.query.limite }) });
  });

  // Désigne un compte EXISTANT comme collaborateur (ou le repasse client).
  // On ne crée pas de compte ici : la personne s'inscrit elle-même, email + PIN.
  r.post('/api/boost/admin/collaborateurs', exigeCompte, exigeAdmin, (req, res) => {
    const { email, role } = req.body || {};
    envoyer(res, boost.definirRole(email, String(role || 'collaborateur'), moi(req)));
  });

  // Certification : administrée à la main en V1. Le LMS / Academy est ailleurs,
  // on ne conserve ici que le verdict (statut, date, évaluateur, score, pratique).
  r.get('/api/boost/admin/certification/:email', exigeCompte, exigeAdmin, (req, res) => {
    res.json({ ok: true, certification: boost.lireCertification(req.params.email) });
  });

  r.put('/api/boost/admin/certification/:email', exigeCompte, exigeAdmin, (req, res) => {
    envoyer(res, boost.definirCertification(req.params.email, req.body || {}, moi(req)));
  });

  r.get('/api/boost/admin/dossiers', exigeCompte, exigeAdmin, (req, res) => {
    res.json({ ok: true, dossiers: boost.listerBoosts(), etapesTotal: ETAPES_TOTAL });
  });

  r.get('/api/boost/admin/dossiers/:id', exigeCompte, exigeAdmin, (req, res) => {
    const b = boost.lireBoost(req.params.id);
    if (!b) return res.status(404).json({ ok: false, error: 'Dossier introuvable.' });
    res.json({ ok: true, boost: b });
  });

  // Création manuelle (arbitrage n°5 : aucun paiement branché). `referenceExterne`
  // est accepté dès maintenant pour qu'un branchement futur n'oblige à rien refondre.
  r.post('/api/boost/admin/dossiers', exigeCompte, exigeAdmin, (req, res) => {
    const { clientEmail, coachEmail, referenceExterne } = req.body || {};
    envoyer(res, boost.creerBoostPour({ clientEmail, coachEmail, referenceExterne }, moi(req)));
  });

  r.post('/api/boost/admin/dossiers/:id/coach', exigeCompte, exigeAdmin, (req, res) => {
    envoyer(res, boost.attribuerCoach(req.params.id, (req.body || {}).coachEmail, moi(req)));
  });

  // Prolongation : soit une nouvelle date limite (le geste naturel de l'admin),
  // soit une durée à ajouter. L'auteur et la date sont pris du jeton et de
  // l'horloge — jamais du corps de la requête, qui pourrait mentir.
  r.post('/api/boost/admin/dossiers/:id/prolongation', exigeCompte, exigeAdmin, (req, res) => {
    const { semaines, jours, nouvelleEcheance, motif } = req.body || {};
    envoyer(res, boost.prolonger(req.params.id, { semaines, jours, nouvelleEcheance, motif }, moi(req)));
  });

  r.post('/api/boost/admin/dossiers/:id/interruption', exigeCompte, exigeAdmin, (req, res) => {
    envoyer(res, boost.interrompre(req.params.id, (req.body || {}).motif, moi(req)));
  });

  r.get('/api/boost/admin/dossiers/:id/journal', exigeCompte, exigeAdmin, (req, res) => {
    if (!boost.lireBoost(req.params.id)) return res.status(404).json({ ok: false, error: 'Dossier introuvable.' });
    res.json({ ok: true, journal: boost.lireJournal(req.params.id) });
  });

  return r;
}

module.exports = { creerRoutesBoost };
