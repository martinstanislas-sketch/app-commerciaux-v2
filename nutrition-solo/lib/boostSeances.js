'use strict';
// ============================================================================
//  BOOST NUTRITION — CONTENU DES RENDEZ-VOUS (séances).
//
//  Extrait de lib/boost.js sans changer une ligne de comportement. La raison du
//  découpage n'est pas la taille du fichier, c'est qu'il mélangeait deux choses
//  de nature différente :
//
//   - lib/boost.js  : le CYCLE DE VIE d'un Boost — statuts, 12 Étapes,
//     16 semaines, prolongation, certification, attribution. Socle stable,
//     validé, auquel on ne touche plus.
//   - ce fichier    : le CONTENU des rendez-vous — ce qui se dit en S1, puis en
//     S2-S11, puis en S12. La partie qui va grossir à chaque lot.
//
//  Les garder ensemble obligeait à rouvrir le fichier du socle à chaque ajout de
//  séance : c'est exactement la situation où une régression se glisse dans du
//  code validé pour une raison qui n'a rien à voir avec lui.
//
//  ⚠️ L'ATOMICITÉ EST LE POINT SENSIBLE DU DÉCOUPAGE. Valider une séance écrit
//  son contenu, son action ET valide l'Étape — cette dernière vivant dans
//  lib/boost.js. Les deux modules partagent la MÊME connexion SQLite (getDb),
//  donc la transaction ouverte ici englobe bien l'appel à boost.validerEtape().
//  Si un jour les deux modules ouvraient deux connexions, l'atomicité tomberait
//  sans que rien ne le signale : c'est ce que garde le test « si l'Étape ne peut
//  pas être validée, rien n'est écrit ».
// ============================================================================

const {
  ETAPES_TOTAL, STATUT_A_DEMARRER, STATUT_EN_COURS,
  jourValide, aujourdhui, lireJson, err, ok,
} = require('./boost');

// LES DEUX PROTOCOLES DE RENDEZ-VOUS.
//
// S1 est le rendez-vous fondateur : on découvre le client. S2 à S11 sont DIX
// FOIS LE MÊME rendez-vous de suivi : on regarde l'action précédente, on décide
// de la suite, on en pose une nouvelle. Ce ne sont donc pas dix protocoles mais
// UN SEUL, paramétré par le numéro d'Étape — écrire dix variantes garantirait
// qu'elles divergent au premier correctif.
//
// S12 n'a pas encore de protocole : sa validation est refusée franchement,
// plutôt que de laisser valider un rendez-vous dont le contenu n'existe pas.
const PROTOCOLE_DECOUVERTE = 'decouverte';   // S1
const PROTOCOLE_SUIVI = 'suivi';             // S2 à S11
const PROTOCOLE_BILAN = 'bilan';             // S12

const REGLES_SEANCE = { 1: PROTOCOLE_DECOUVERTE, 12: PROTOCOLE_BILAN };
for (let n = 2; n <= 11; n++) REGLES_SEANCE[n] = PROTOCOLE_SUIVI;

// Nombre de règles personnelles qu'on emporte après le Boost. Le plafond n'est
// pas décoratif : trois règles se retiennent, dix ne se retiennent pas — et un
// plan qu'on ne retient pas n'est pas un plan.
const REGLES_AUTONOMIE_MAX = 3;

// Résultat de l'action de la période écoulée. Trois états, et AUCUN n'est une
// note : on constate pour adapter la suite, on ne juge pas le client.
const RESULTAT_REALISEE = 'realisee';
const RESULTAT_PARTIELLE = 'partielle';
const RESULTAT_NON = 'non_realisee';
const RESULTATS = [RESULTAT_REALISEE, RESULTAT_PARTIELLE, RESULTAT_NON];

// Ce qu'on décide de l'action précédente.
const DECISIONS = ['continuer', 'ajuster', 'changer'];

const SEANCE_BROUILLON = 'brouillon';
const SEANCE_VALIDEE = 'validee';
const ACTION_ACTIVE = 'active';
const ACTION_REMPLACEE = 'remplacee';

// Une Étape « a un contenu métier » dès qu'un protocole existe pour elle. C'est
// ce qui ferme la validation générique sans citer aucune Étape en dur : ajouter
// S12 au tableau ci-dessus la fermera d'elle-même.
const aUnContenu = (numero) => !!REGLES_SEANCE[Number(numero)];
const protocoleDe = (numero) => REGLES_SEANCE[Number(numero)] || null;

const SCHEMA_SEANCES = `
-- Contenu d'un rendez-vous. UNE ligne par Étape et par Boost, quelle que soit
-- l'Étape : S1 aujourd'hui, S2-S11 et S12 plus tard viendront s'y ranger sans
-- nouvelle table. Le contenu propre à chaque Étape vit en JSON (colonne donnees),
-- parce qu'il diffère d'une Étape à l'autre et qu'une colonne par champ
-- figerait le formulaire dans le schéma.
CREATE TABLE IF NOT EXISTS boost_seances (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  boost_id    INTEGER NOT NULL REFERENCES boosts(id) ON DELETE CASCADE,
  numero      INTEGER NOT NULL,
  donnees     TEXT NOT NULL DEFAULT '{}',
  statut      TEXT NOT NULL DEFAULT 'brouillon',   -- brouillon | validee
  maj_le      TEXT NOT NULL,
  maj_par     TEXT,
  validee_le  TEXT,
  validee_par TEXT,
  UNIQUE(boost_id, numero)
);
CREATE INDEX IF NOT EXISTS idx_boost_seances ON boost_seances(boost_id, numero);

-- L'action de la semaine. Table DÉDIÉE et non un champ de la séance, pour deux
-- raisons : l'invariant « une seule action active » doit pouvoir se tenir
-- (les précédentes passent en 'remplacee'), et S2-S11 devront relire l'action
-- précédente sans avoir à ouvrir le JSON de la séance d'avant.
CREATE TABLE IF NOT EXISTS boost_actions (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  boost_id  INTEGER NOT NULL REFERENCES boosts(id) ON DELETE CASCADE,
  numero    INTEGER NOT NULL,            -- l'Étape qui l'a décidée
  intitule  TEXT NOT NULL,
  detail    TEXT,
  frequence TEXT,
  statut    TEXT NOT NULL DEFAULT 'active',  -- active | remplacee
  cree_le   TEXT NOT NULL,
  cree_par  TEXT NOT NULL,
  -- Note d'adhésion (1 à 10) donnée par le client AU MOMENT où l'action est
  -- décidée. Elle sert au coach à vérifier que l'action est réellement
  -- acceptée ; elle ne produit aucun score et ne bloque aucune validation.
  adhesion             INTEGER,
  -- Le résultat est écrit par le rendez-vous SUIVANT, pas par celui qui a créé
  -- l'action : on ne sait ce qu'une action a donné qu'une fois la période
  -- écoulée. D'où les colonnes d'évaluation séparées de celles de création.
  resultat             TEXT,             -- realisee | partielle | non_realisee
  commentaire_resultat TEXT,
  evaluee_le           TEXT,
  evaluee_par          TEXT,
  evaluee_a_etape      INTEGER
);
CREATE INDEX IF NOT EXISTS idx_boost_actions ON boost_actions(boost_id, id);

-- Notes internes du Coach Nutrition. Table SÉPARÉE des données de séance, et
-- c'est structurel, pas cosmétique : ces notes ne doivent jamais partir dans
-- une réponse destinée au client ni à l'administrateur (arbitrage n°2 —
-- l'admin administre le dispositif, il n'anime pas le suivi). Les ranger à
-- part rend l'oubli impossible plutôt qu'improbable : aucune route ne peut les
-- inclure par accident en sérialisant une séance.
CREATE TABLE IF NOT EXISTS boost_notes_coach (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  boost_id INTEGER NOT NULL REFERENCES boosts(id) ON DELETE CASCADE,
  numero   INTEGER NOT NULL,
  texte    TEXT NOT NULL,
  auteur   TEXT NOT NULL,
  cree_le  TEXT NOT NULL,
  maj_le   TEXT NOT NULL,
  UNIQUE(boost_id, numero)
);
`;

function createSeances({ getDb, nowIso, boost }) {
  const db = () => getDb();
  const normalise = (e) => String(e || '').trim().toLowerCase();

  // Même mémorisation par base ouverte que le socle : le routeur l'appelle en
  // tête de chaque requête Boost, il ne faut pas rejouer le DDL à chaque fois.
  const basesMigrees = new WeakSet();
  // Colonnes ajoutées à boost_actions après sa création (lot S2-S11). CREATE
  // TABLE IF NOT EXISTS ne les poserait pas sur une base déjà créée au lot S1,
  // d'où cet ajout conditionnel. Périmètre strict : une table du Boost, jamais
  // une table du socle nutrition.
  const COLONNES_ACTIONS = [
    ['adhesion', 'INTEGER'],
    ['resultat', 'TEXT'],
    ['commentaire_resultat', 'TEXT'],
    ['evaluee_le', 'TEXT'],
    ['evaluee_par', 'TEXT'],
    ['evaluee_a_etape', 'INTEGER'],
  ];
  function assurerSchema() {
    const d = db();
    if (basesMigrees.has(d)) return true;
    d.exec(SCHEMA_SEANCES);
    const presentes = d.prepare('PRAGMA table_info(boost_actions)').all().map((c) => c.name);
    for (const [nom, type] of COLONNES_ACTIONS) {
      if (!presentes.includes(nom)) d.exec(`ALTER TABLE boost_actions ADD COLUMN ${nom} ${type}`);
    }
    basesMigrees.add(d);
    return true;
  }

  // Les trois collaborateurs empruntés au socle. Nommés ici pour que le reste du
  // fichier se lise comme avant l'extraction.
  const ligneBoost = (id) => boost.ligneBoost(id);
  const rafraichirExpiration = (row, jour) => boost.rafraichirExpiration(row, jour);
  const journaliser = (id, action, detail, auteur) => boost.journaliser(id, action, detail, auteur);
  const lireBoost = (id, jour) => boost.lireBoost(id, jour);
  const validerEtape = (id, n, auteur, jour) => boost.validerEtape(id, n, auteur, jour);


  const texteCourt = (v, max) => String(v === null || v === undefined ? '' : v).trim().slice(0, max);

  // Ce qu'on accepte de stocker. On ne recopie PAS le corps de la requête tel
  // quel : un champ inattendu envoyé par un client bricolé finirait en base et
  // ressortirait à l'affichage. On reconstruit donc l'objet, champ par champ.
  function nettoyerDonneesS1(d) {
    const src = d && typeof d === 'object' ? d : {};
    const obj = src.objectif && typeof src.objectif === 'object' ? src.objectif : {};
    const hab = src.habitudes && typeof src.habitudes === 'object' ? src.habitudes : {};
    const dif = src.difficultes && typeof src.difficultes === 'object' ? src.difficultes : {};
    const liste = (v) => (Array.isArray(v) ? v : []).map((x) => texteCourt(x, 40)).filter(Boolean).slice(0, 20);
    return {
      objectif: { choix: texteCourt(obj.choix, 40), texte: texteCourt(obj.texte, 2000) },
      habitudes: ['organisation', 'petitDejeuner', 'dejeuner', 'diner', 'collations', 'boissons', 'exterieur', 'preparation']
        .reduce((acc, k) => { acc[k] = texteCourt(hab[k], 1000); return acc; }, {}),
      difficultes: { choix: liste(dif.choix), precision: texteCourt(dif.precision, 2000) },
      journalPhotoExplique: !!src.journalPhotoExplique,
    };
  }

  // --- Protocole de SUIVI (S2 à S11) --------------------------------------
  // Le contenu d'un rendez-vous de suivi : ce qu'a donné l'action précédente,
  // le bilan de la période, et la décision prise sur cette action.
  function nettoyerDonneesSuivi(d) {
    const src = d && typeof d === 'object' ? d : {};
    const prec = src.actionPrecedente && typeof src.actionPrecedente === 'object' ? src.actionPrecedente : {};
    const bil = src.bilan && typeof src.bilan === 'object' ? src.bilan : {};
    const resultat = texteCourt(prec.resultat, 20);
    const decision = texteCourt(src.decision, 20);
    const note = Number(src.adhesion);
    return {
      actionPrecedente: {
        // Une valeur hors liste est effacée plutôt que stockée : elle
        // ressortirait telle quelle à l'affichage et dans l'historique.
        resultat: RESULTATS.includes(resultat) ? resultat : '',
        commentaire: texteCourt(prec.commentaire, 2000),
      },
      bilan: ['reussites', 'difficultes', 'observations']
        .reduce((acc, k) => { acc[k] = texteCourt(bil[k], 1000); return acc; }, {}),
      decision: DECISIONS.includes(decision) ? decision : '',
      // L'adhésion voyage avec la séance tant que l'action n'est pas créée ;
      // à la validation elle est portée par la ligne d'action.
      adhesion: Number.isInteger(note) && note >= 1 && note <= 10 ? note : null,
    };
  }

  function manquesSuivi(donnees, action) {
    const m = [];
    const d = donnees || {};
    if (!(d.actionPrecedente && d.actionPrecedente.resultat)) m.push('le résultat de l\'action précédente');
    if (!d.decision) m.push('la décision sur cette action (continuer, ajuster ou changer)');
    if (!(action && action.intitule)) m.push('l\'action jusqu\'au prochain rendez-vous');
    if (!d.adhesion) m.push('la note d\'adhésion du client (1 à 10)');
    return m;
  }

  // --- Protocole de BILAN (S12) -------------------------------------------
  // Le dernier rendez-vous ne crée AUCUNE action de semaine : il fait le bilan
  // des 12 Étapes et transforme ce qui a marché en règles personnelles que le
  // client emporte. C'est un protocole à part, pas un suivi de plus.
  function nettoyerDonneesBilan(d) {
    const src = d && typeof d === 'object' ? d : {};
    const bil = src.bilan && typeof src.bilan === 'object' ? src.bilan : {};
    const prec = src.actionPrecedente && typeof src.actionPrecedente === 'object' ? src.actionPrecedente : {};
    const resultat = texteCourt(prec.resultat, 20);
    const note = Number(src.confiance);
    return {
      // Le bilan constate LUI AUSSI l'action de la période écoulée — celle
      // décidée à S11. Sans ce constat, la dernière action du Boost serait la
      // seule à finir sans verdict, alors que c'est justement celle sur
      // laquelle le client vient de travailler.
      actionPrecedente: {
        resultat: RESULTATS.includes(resultat) ? resultat : '',
        commentaire: texteCourt(prec.commentaire, 2000),
      },
      bilan: ['progres', 'plusFacile', 'appris']
        .reduce((acc, k) => { acc[k] = texteCourt(bil[k], 2000); return acc; }, {}),
      // Les règles vides sont retirées ici : une case laissée blanche au milieu
      // du formulaire ne doit pas devenir une règle vide dans le plan final.
      regles: (Array.isArray(src.regles) ? src.regles : [])
        .map((r) => texteCourt(r, 300)).filter(Boolean).slice(0, REGLES_AUTONOMIE_MAX),
      fragiles: texteCourt(src.fragiles, 2000),
      confiance: Number.isInteger(note) && note >= 1 && note <= 10 ? note : null,
    };
  }

  function manquesBilan(donnees) {
    const m = [];
    const d = donnees || {};
    const bil = d.bilan || {};
    if (!(d.actionPrecedente && d.actionPrecedente.resultat)) m.push('le résultat de l\'action précédente');
    if (!(bil.progres || bil.plusFacile || bil.appris)) m.push('le bilan de ce qui a changé');
    if (!(d.regles || []).length) m.push('au moins une règle personnelle à conserver');
    if (!d.confiance) m.push('la note de confiance pour continuer seul (1 à 10)');
    return m;
  }

  // Aiguillage par Étape. C'est LE point qui empêche les données d'un protocole
  // d'être silencieusement effacées par le nettoyage d'un autre : sans lui,
  // enregistrer un brouillon de S2 le ferait passer par le nettoyage de S1, qui
  // ne connaît aucun de ses champs et les jetterait tous.
  function nettoyerDonnees(numero, d) {
    const p = protocoleDe(numero);
    if (p === PROTOCOLE_DECOUVERTE) return nettoyerDonneesS1(d);
    if (p === PROTOCOLE_SUIVI) return nettoyerDonneesSuivi(d);
    if (p === PROTOCOLE_BILAN) return nettoyerDonneesBilan(d);
    return {};
  }

  function manquesDe(numero, donnees, action) {
    const p = protocoleDe(numero);
    if (p === PROTOCOLE_DECOUVERTE) return manquesS1(donnees, action);
    if (p === PROTOCOLE_SUIVI) return manquesSuivi(donnees, action);
    if (p === PROTOCOLE_BILAN) return manquesBilan(donnees);
    return ['un protocole de rendez-vous pour cette Étape'];
  }

  function nettoyerAction(a) {
    const src = a && typeof a === 'object' ? a : {};
    return {
      intitule: texteCourt(src.intitule, 300),
      detail: texteCourt(src.detail, 1000),
      frequence: texteCourt(src.frequence, 80),
    };
  }

  // Ce qui manque pour valider. Renvoie une LISTE : dire « incomplet » sans dire
  // quoi obligerait le coach à chercher, en rendez-vous, devant son client.
  function manquesS1(donnees, action) {
    const m = [];
    const d = donnees || {};
    if (!(d.objectif && (d.objectif.choix || d.objectif.texte))) m.push('l\'objectif du client');
    if (!(action && action.intitule)) m.push('l\'action de la semaine');
    if (!d.journalPhotoExplique) m.push('la confirmation que le journal photo a été expliqué');
    return m;
  }

  function ligneSeance(boostId, numero) {
    return db().prepare('SELECT * FROM boost_seances WHERE boost_id = ? AND numero = ?')
      .get(Number(boostId), Number(numero)) || null;
  }

  function actionActive(boostId) {
    return db().prepare('SELECT id, numero, intitule, detail, frequence, statut, adhesion, resultat, commentaire_resultat AS commentaireResultat, evaluee_le AS evalueeLe, evaluee_par AS evalueePar, evaluee_a_etape AS evalueeAEtape, cree_le AS creeLe, cree_par AS creePar FROM boost_actions WHERE boost_id = ? AND statut = ? ORDER BY id DESC LIMIT 1')
      .get(Number(boostId), ACTION_ACTIVE) || null;
  }

  function actionsDe(boostId) {
    return db().prepare('SELECT id, numero, intitule, detail, frequence, statut, adhesion, resultat, commentaire_resultat AS commentaireResultat, evaluee_le AS evalueeLe, evaluee_par AS evalueePar, evaluee_a_etape AS evalueeAEtape, cree_le AS creeLe, cree_par AS creePar FROM boost_actions WHERE boost_id = ? ORDER BY id ASC')
      .all(Number(boostId));
  }

  function noteCoach(boostId, numero) {
    const r = db().prepare('SELECT texte, auteur, maj_le AS majLe FROM boost_notes_coach WHERE boost_id = ? AND numero = ?')
      .get(Number(boostId), Number(numero));
    return r || null;
  }

  // Vue d'un rendez-vous POUR LE COACH. Le nom le dit : cette forme contient les
  // notes internes, elle n'a le droit de sortir que par une route Coach.
  // Historique des rendez-vous validés. Il n'est PAS stocké : il se reconstitue
  // à partir des séances et des actions. Une action porte le numéro de l'Étape
  // qui l'a décidée, donc l'action suivie pendant l'Étape n est celle créée à
  // l'Étape n-1 — c'est tout ce qu'il faut pour relire le fil de l'accompagnement.
  function historiqueDe(boostId) {
    const validees = db().prepare('SELECT numero, donnees, validee_le AS valideeLe FROM boost_seances WHERE boost_id = ? AND statut = ? ORDER BY numero ASC')
      .all(Number(boostId), SEANCE_VALIDEE);
    const parEtape = new Map(actionsDe(boostId).map((a) => [a.numero, a]));
    return validees.map((v) => {
      const d = lireJson(v.donnees, {});
      const suivie = parEtape.get(v.numero - 1) || null;
      const decidee = parEtape.get(v.numero) || null;
      return {
        numero: v.numero,
        valideeLe: v.valideeLe,
        // S1 n'a ni action suivie ni décision : son apport à l'historique, c'est
        // l'objectif du client. Sans lui, la première ligne serait presque vide.
        objectif: d.objectif && (d.objectif.texte || d.objectif.choix) ? d.objectif : null,
        // Le bilan n'a pas décidé d'action mais des règles à emporter : sans
        // elles, sa ligne d'historique serait vide.
        regles: Array.isArray(d.regles) && d.regles.length ? d.regles : null,
        confiance: d.confiance || null,
        actionSuivie: suivie ? suivie.intitule : null,
        resultat: suivie ? suivie.resultat : null,
        commentaireResultat: suivie ? suivie.commentaireResultat : null,
        decision: d.decision || null,
        actionDecidee: decidee ? decidee.intitule : null,
        adhesion: decidee ? decidee.adhesion : null,
      };
    });
  }

  // Ce que le rendez-vous précédent a laissé d'utile à celui qui s'ouvre. Le
  // coach doit le retrouver SANS avoir rien préparé : c'est toute la promesse
  // de l'écran.
  function contextePrecedent(boostId, numero) {
    const n = Number(numero);
    if (n <= 1) return null;
    const l = ligneSeance(boostId, n - 1);
    if (!l || l.statut !== SEANCE_VALIDEE) return null;
    const d = lireJson(l.donnees, {});
    return {
      numero: n - 1,
      valideeLe: l.validee_le,
      // S1 laisse l'objectif et les difficultés ; un suivi laisse son bilan.
      objectif: d.objectif || null,
      difficultes: d.difficultes || null,
      bilan: d.bilan || null,
      decision: d.decision || null,
    };
  }

  // Le point de départ, tel que S1 l'a enregistré. Le bilan s'ouvre avec, pour
  // que le coach n'ait rien à ressaisir ni à retrouver ailleurs.
  function departDe(boostId) {
    const l = ligneSeance(boostId, 1);
    if (!l || l.statut !== SEANCE_VALIDEE) return null;
    const d = lireJson(l.donnees, {});
    return {
      valideeLe: l.validee_le,
      objectif: d.objectif || null,
      difficultes: d.difficultes || null,
      habitudes: d.habitudes || null,
    };
  }

  // Le chemin parcouru : une ligne par action travaillée. La décision prise sur
  // une action n'est pas écrite sur elle — elle appartient au rendez-vous qui
  // l'a prise, c'est-à-dire le suivant. On les rapproche ici plutôt que de
  // dupliquer l'information en base.
  function syntheseDe(boostId) {
    const historique = historiqueDe(boostId);
    const decisions = new Map(historique.map((h) => [h.numero, h.decision]));
    return actionsDe(boostId).map((a) => ({
      numero: a.numero,
      intitule: a.intitule,
      detail: a.detail,
      frequence: a.frequence,
      resultat: a.resultat,                       // null pour la dernière : jamais évaluée
      commentaireResultat: a.commentaireResultat,
      adhesion: a.adhesion,
      decision: decisions.get(a.numero + 1) || null,
    }));
  }

  function seancePourCoach(boostId, numero) {
    const l = ligneSeance(boostId, numero);
    const note = noteCoach(boostId, numero);
    const n = Number(numero);
    return {
      numero: n,
      protocole: protocoleDe(n),
      statut: l ? l.statut : SEANCE_BROUILLON,
      existe: !!l,
      donnees: l ? lireJson(l.donnees, {}) : nettoyerDonnees(n, {}),
      majLe: l ? l.maj_le : null,
      majPar: l ? l.maj_par : null,
      valideeLe: l ? l.validee_le : null,
      valideePar: l ? l.validee_par : null,
      action: actionActive(boostId),
      actions: actionsDe(boostId),
      precedent: contextePrecedent(boostId, n),
      historique: historiqueDe(boostId),
      // Réservés au bilan : les calculer pour chaque rendez-vous coûterait deux
      // requêtes de plus à chaque ouverture, sans servir à rien.
      depart: protocoleDe(n) === PROTOCOLE_BILAN ? departDe(boostId) : null,
      synthese: protocoleDe(n) === PROTOCOLE_BILAN ? syntheseDe(boostId) : null,
      noteCoach: note ? note.texte : '',
      noteCoachMajLe: note ? note.majLe : null,
    };
  }

  // Enregistrement d'un brouillon. Ne touche NI au statut du Boost, NI aux
  // Étapes : c'est tout l'intérêt du brouillon.
  function enregistrerSeance(boostId, numero, corps, auteur, jour) {
    const n = Number(numero);
    if (!Number.isInteger(n) || n < 1 || n > ETAPES_TOTAL) return err(400, 'Numéro d\'étape invalide.');
    const row = ligneBoost(boostId);
    if (!row) return err(404, 'Boost introuvable.');
    const b = rafraichirExpiration(row, jour);
    if (![STATUT_A_DEMARRER, STATUT_EN_COURS].includes(b.statut)) {
      return err(409, 'Ce Boost n\'est plus actif : son contenu n\'est plus modifiable.', { statut: b.statut });
    }
    const deja = ligneSeance(b.id, n);
    // Un rendez-vous validé se relit, il ne se réécrit pas : sinon l'historique
    // dirait autre chose que ce qui a été décidé le jour du rendez-vous.
    if (deja && deja.statut === SEANCE_VALIDEE) {
      return err(409, `L'Étape ${n}/${ETAPES_TOTAL} est déjà validée : son contenu n'est plus modifiable.`);
    }

    const donnees = nettoyerDonnees(n, (corps || {}).donnees);
    const action = nettoyerAction((corps || {}).action);
    const note = texteCourt((corps || {}).noteCoach, 5000);
    const maintenant = nowIso();
    const d = db();
    d.transaction(() => {
      // L'action en cours de discussion voyage dans le brouillon : elle ne
      // devient une vraie ligne d'action qu'à la validation.
      const brouillon = { ...donnees, actionBrouillon: action };
      d.prepare(`INSERT INTO boost_seances (boost_id, numero, donnees, statut, maj_le, maj_par)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON CONFLICT(boost_id, numero) DO UPDATE SET donnees = excluded.donnees,
                   maj_le = excluded.maj_le, maj_par = excluded.maj_par`)
        .run(b.id, n, JSON.stringify(brouillon), SEANCE_BROUILLON, maintenant, normalise(auteur) || null);
      ecrireNote(d, b.id, n, note, auteur, maintenant);
    })();
    return ok({ seance: seancePourCoach(b.id, n), brouillon: true });
  }

  function ecrireNote(d, boostId, numero, texte, auteur, maintenant) {
    if (!texte) {
      d.prepare('DELETE FROM boost_notes_coach WHERE boost_id = ? AND numero = ?').run(boostId, numero);
      return;
    }
    d.prepare(`INSERT INTO boost_notes_coach (boost_id, numero, texte, auteur, cree_le, maj_le)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(boost_id, numero) DO UPDATE SET texte = excluded.texte,
                 auteur = excluded.auteur, maj_le = excluded.maj_le`)
      .run(boostId, numero, texte, normalise(auteur) || '', maintenant, maintenant);
  }

  // Validation d'un rendez-vous. TOUT OU RIEN : le contenu, l'action et la
  // validation de l'Étape sont écrits dans une seule transaction. On ne doit
  // jamais pouvoir se retrouver avec « Étape 1 validée » d'un côté et un
  // rendez-vous vide de l'autre — c'est la panne qu'on ne saurait pas réparer.
  function validerSeance(boostId, numero, corps, auteur, jour) {
    const n = Number(numero);
    if (!Number.isInteger(n) || n < 1 || n > ETAPES_TOTAL) return err(400, 'Numéro d\'étape invalide.');
    if (!REGLES_SEANCE[n]) {
      return err(409, `Le contenu de l'Étape ${n}/${ETAPES_TOTAL} n'est pas encore construit.`);
    }
    if (!auteur) return err(400, 'Auteur manquant.');

    const row = ligneBoost(boostId);
    if (!row) return err(404, 'Boost introuvable.');
    const b = rafraichirExpiration(row, jour);
    const deja = ligneSeance(b.id, n);
    if (deja && deja.statut === SEANCE_VALIDEE) {
      return err(409, `L'Étape ${n}/${ETAPES_TOTAL} a déjà été validée.`, { statut: deja.statut });
    }

    const protocole = protocoleDe(n);
    const donnees = nettoyerDonnees(n, (corps || {}).donnees);
    const action = nettoyerAction((corps || {}).action);
    const manque = manquesDe(n, donnees, action);
    if (manque.length) {
      return err(400, 'Il manque ' + manque.join(', ') + '.', { manque });
    }

    const note = texteCourt((corps || {}).noteCoach, 5000);
    const maintenant = nowIso();
    const quand = jourValide(jour) ? jour : aujourdhui();
    const d = db();
    let echec = null;
    try {
      d.transaction(() => {
        // Le contenu d'abord : si la validation de l'Étape échoue ensuite, tout
        // est annulé ensemble et le brouillon d'origine reste intact.
        d.prepare(`INSERT INTO boost_seances (boost_id, numero, donnees, statut, maj_le, maj_par, validee_le, validee_par)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(boost_id, numero) DO UPDATE SET donnees = excluded.donnees,
                     statut = excluded.statut, maj_le = excluded.maj_le, maj_par = excluded.maj_par,
                     validee_le = excluded.validee_le, validee_par = excluded.validee_par`)
          .run(b.id, n, JSON.stringify(donnees), SEANCE_VALIDEE, maintenant,
            normalise(auteur), quand, normalise(auteur));

        // Le verdict sur l'action de la période écoulée, AVANT de la remplacer :
        // il s'écrit sur la ligne de l'action elle-même, pas dans la séance.
        // C'est ce qui permet de relire l'historique par action et non en
        // ouvrant le JSON de chaque rendez-vous.
        const prec = donnees.actionPrecedente;
        if (prec && prec.resultat) {
          d.prepare(`UPDATE boost_actions SET resultat = ?, commentaire_resultat = ?,
                       evaluee_le = ?, evaluee_par = ?, evaluee_a_etape = ?
                     WHERE boost_id = ? AND statut = ?`)
            .run(prec.resultat, prec.commentaire || null, quand, normalise(auteur), n, b.id, ACTION_ACTIVE);
        }

        // L'action en cours est close, quel que soit le protocole.
        d.prepare('UPDATE boost_actions SET statut = ? WHERE boost_id = ? AND statut = ?')
          .run(ACTION_REMPLACEE, b.id, ACTION_ACTIVE);

        // LE BILAN NE CRÉE AUCUNE ACTION. Le Boost se termine : laisser une
        // action active voudrait dire qu'une consigne hebdomadaire court encore
        // alors que l'accompagnement est fini. Ce que le client emporte, ce sont
        // des règles personnelles — elles vivent dans le contenu de la séance,
        // pas dans la table des actions de semaine.
        if (protocole !== PROTOCOLE_BILAN) {
          // Même quand la décision est « continuer », une NOUVELLE ligne est
          // créée : sans elle, l'historique ne dirait pas qu'une décision a été
          // prise à cette Étape, et le fil de l'accompagnement aurait un trou.
          d.prepare('INSERT INTO boost_actions (boost_id, numero, intitule, detail, frequence, statut, adhesion, cree_le, cree_par) VALUES (?,?,?,?,?,?,?,?,?)')
            .run(b.id, n, action.intitule, action.detail || null, action.frequence || null,
              ACTION_ACTIVE, donnees.adhesion || null, maintenant, normalise(auteur));
        }

        ecrireNote(d, b.id, n, note, auteur, maintenant);

        // Et seulement là, l'Étape. C'est ELLE qui arme les 16 semaines (n = 1).
        const r = validerEtape(b.id, n, auteur, jour);
        if (!r.ok) { echec = r; throw new Error('ANNULER_VALIDATION'); }
      })();
    } catch (e) {
      if (e && e.message === 'ANNULER_VALIDATION') return echec;
      throw e;
    }

    journaliser(b.id, 'seance_validee', {
      numero: n, action: protocole === PROTOCOLE_BILAN ? null : action.intitule,
      regles: protocole === PROTOCOLE_BILAN ? donnees.regles : undefined,
      resultatPrecedent: (donnees.actionPrecedente && donnees.actionPrecedente.resultat) || null,
      decision: donnees.decision || null,
    }, auteur);
    return ok({ boost: lireBoost(b.id, jour), seance: seancePourCoach(b.id, n) });
  }
  return {
    assurerSchema, aUnContenu,
    seancePourCoach, enregistrerSeance, validerSeance,
    actionActive, historiqueDe, contextePrecedent, departDe, syntheseDe,
    manquesS1, manquesSuivi, manquesBilan, manquesDe,
    nettoyerDonneesS1, nettoyerDonneesSuivi, nettoyerDonneesBilan, nettoyerDonnees,
  };
}

module.exports = {
  createSeances, aUnContenu, protocoleDe,
  SEANCE_BROUILLON, SEANCE_VALIDEE, ACTION_ACTIVE, ACTION_REMPLACEE, REGLES_SEANCE,
  PROTOCOLE_DECOUVERTE, PROTOCOLE_SUIVI, PROTOCOLE_BILAN, REGLES_AUTONOMIE_MAX,
  RESULTAT_REALISEE, RESULTAT_PARTIELLE, RESULTAT_NON, RESULTATS, DECISIONS,
};
