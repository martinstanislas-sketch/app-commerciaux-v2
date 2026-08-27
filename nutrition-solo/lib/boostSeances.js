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

// Règles de complétude, PAR ÉTAPE. Aujourd'hui seule l'Étape 1 en a : c'est
// délibéré, S2-S11 et S12 viendront ajouter leur entrée ici. Une Étape sans
// règle ne peut pas être validée par la route des séances — mieux vaut refuser
// que de laisser valider un rendez-vous dont le contenu n'existe pas encore.
const REGLES_SEANCE = {
  1: [
    { champ: 'objectif', dit: 'l\'objectif du client' },
    { champ: 'action', dit: 'l\'action de la semaine' },
    { champ: 'journalPhoto', dit: 'la confirmation que le journal photo a été expliqué' },
  ],
};

const SEANCE_BROUILLON = 'brouillon';
const SEANCE_VALIDEE = 'validee';
const ACTION_ACTIVE = 'active';
const ACTION_REMPLACEE = 'remplacee';

// Une Étape « a un contenu métier » dès qu'une règle existe pour elle. C'est ce
// qui permet de fermer la validation générique sans citer S1 en dur : quand S2
// arrivera, elle se fermera d'elle-même.
const aUnContenu = (numero) => !!REGLES_SEANCE[Number(numero)];

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
  cree_par  TEXT NOT NULL
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
  function assurerSchema() {
    const d = db();
    if (basesMigrees.has(d)) return true;
    d.exec(SCHEMA_SEANCES);
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
    return db().prepare('SELECT id, numero, intitule, detail, frequence, statut, cree_le AS creeLe, cree_par AS creePar FROM boost_actions WHERE boost_id = ? AND statut = ? ORDER BY id DESC LIMIT 1')
      .get(Number(boostId), ACTION_ACTIVE) || null;
  }

  function actionsDe(boostId) {
    return db().prepare('SELECT id, numero, intitule, detail, frequence, statut, cree_le AS creeLe, cree_par AS creePar FROM boost_actions WHERE boost_id = ? ORDER BY id ASC')
      .all(Number(boostId));
  }

  function noteCoach(boostId, numero) {
    const r = db().prepare('SELECT texte, auteur, maj_le AS majLe FROM boost_notes_coach WHERE boost_id = ? AND numero = ?')
      .get(Number(boostId), Number(numero));
    return r || null;
  }

  // Vue d'un rendez-vous POUR LE COACH. Le nom le dit : cette forme contient les
  // notes internes, elle n'a le droit de sortir que par une route Coach.
  function seancePourCoach(boostId, numero) {
    const l = ligneSeance(boostId, numero);
    const note = noteCoach(boostId, numero);
    return {
      numero: Number(numero),
      statut: l ? l.statut : SEANCE_BROUILLON,
      existe: !!l,
      donnees: l ? lireJson(l.donnees, {}) : nettoyerDonneesS1({}),
      majLe: l ? l.maj_le : null,
      majPar: l ? l.maj_par : null,
      valideeLe: l ? l.validee_le : null,
      valideePar: l ? l.validee_par : null,
      action: actionActive(boostId),
      actions: actionsDe(boostId),
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

    const donnees = nettoyerDonneesS1((corps || {}).donnees);
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

    const donnees = nettoyerDonneesS1((corps || {}).donnees);
    const action = nettoyerAction((corps || {}).action);
    const manque = manquesS1(donnees, action);
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

        // Une seule action active à la fois : les précédentes sont remplacées.
        d.prepare('UPDATE boost_actions SET statut = ? WHERE boost_id = ? AND statut = ?')
          .run(ACTION_REMPLACEE, b.id, ACTION_ACTIVE);
        d.prepare('INSERT INTO boost_actions (boost_id, numero, intitule, detail, frequence, statut, cree_le, cree_par) VALUES (?,?,?,?,?,?,?,?)')
          .run(b.id, n, action.intitule, action.detail || null, action.frequence || null,
            ACTION_ACTIVE, maintenant, normalise(auteur));

        ecrireNote(d, b.id, n, note, auteur, maintenant);

        // Et seulement là, l'Étape. C'est ELLE qui arme les 16 semaines (n = 1).
        const r = validerEtape(b.id, n, auteur, jour);
        if (!r.ok) { echec = r; throw new Error('ANNULER_VALIDATION'); }
      })();
    } catch (e) {
      if (e && e.message === 'ANNULER_VALIDATION') return echec;
      throw e;
    }

    journaliser(b.id, 'seance_validee', { numero: n, action: action.intitule }, auteur);
    return ok({ boost: lireBoost(b.id, jour), seance: seancePourCoach(b.id, n) });
  }
  return {
    assurerSchema, aUnContenu,
    seancePourCoach, enregistrerSeance, validerSeance,
    actionActive, manquesS1, nettoyerDonneesS1,
  };
}

module.exports = {
  createSeances, aUnContenu,
  SEANCE_BROUILLON, SEANCE_VALIDEE, ACTION_ACTIVE, ACTION_REMPLACEE, REGLES_SEANCE,
};
