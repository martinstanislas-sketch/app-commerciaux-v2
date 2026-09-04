'use strict';
// ============================================================================
//  MY COACH ACADEMY — LE SUIVI TERRAIN.
//
//  CE QUE C'EST. Une trace de ce qu'on constate dans les studios : une visite,
//  une très bonne prise en charge, un standard mal respecté, un fait marquant.
//  Une observation = UNE COULEUR + UN TEXTE, et rien d'autre à remplir.
//
//  ⚠️ CE QUE CE N'EST PAS, ET LE CODE LE GARANTIT :
//
//   · PAS UN DOSSIER DISCIPLINAIRE. Un « écart » n'ouvre rien, ne notifie
//     personne, ne change aucun statut. Ce module n'a aucune dépendance vers
//     les certifications, les parcours ou le Boost — il ne pourrait pas
//     déclencher quoi que ce soit même si on le lui demandait.
//   · PAS UNE NOTE. Aucune moyenne, aucun score, aucun classement. `compter`
//     ne fait que dénombrer par niveau — quatre entiers, jamais un indice.
//   · PAS UN WORKFLOW. Aucune colonne d'état, d'échéance ou d'assignation :
//     on constate, on écrit, on enregistre.
//
//  LES QUATRE NIVEAUX SONT DES VALEURS MÉTIER, PAS DES COULEURS. On stocke
//  POSITIVE / TO_CORRECT / ISSUE / OBSERVATION : repeindre l'écran demain ne
//  doit pas demander de migrer une ligne. Le vert, l'orange, le rouge et le
//  bleu vivent dans la feuille de style, et nulle part ici.
//
//  LES IDENTITÉS NE SONT PAS RECOPIÉES. Une observation porte l'e-mail du
//  salarié et celui de l'auteur ; leur prénom et leur nom se lisent dans
//  `users` à l'affichage. Recopier un nom, c'est le figer le jour où il change.
// ============================================================================

const { err, ok } = require('./boost');

// Les quatre niveaux. L'ordre est celui de lecture de l'écran ; il ne porte
// AUCUNE hiérarchie — « Observation » n'est pas un cran entre vert et orange,
// c'est un constat neutre.
const POSITIVE = 'POSITIVE';
const TO_CORRECT = 'TO_CORRECT';
const ISSUE = 'ISSUE';
const OBSERVATION = 'OBSERVATION';
const NIVEAUX = [POSITIVE, TO_CORRECT, ISSUE, OBSERVATION];

const OBS_MAX = 4000;
const NOM_STUDIO_MAX = 80;

const SCHEMA_TERRAIN = `
-- QUI SUIT LE TERRAIN. Calquée sur academy_evaluateurs : une ligne par
-- personne, un drapeau, et la trace de qui l'a posée. Ce n'est pas un rôle de
-- plus dans le Boost — c'est un droit d'Academy, comme celui de certifier, et
-- il s'accorde au même endroit.
CREATE TABLE IF NOT EXISTS academy_terrain_droits (
  email    TEXT PRIMARY KEY,
  actif    INTEGER NOT NULL DEFAULT 1,
  cree_le  TEXT NOT NULL,
  maj_le   TEXT NOT NULL,
  maj_par  TEXT
);

-- LES STUDIOS. Ils n'existaient nulle part dans cette base : ni table, ni
-- colonne, ni rattachement d'un salarié à un lieu. On les crée donc ici, au
-- plus simple — un nom, un drapeau d'activité — et l'administrateur les
-- saisit. Aucun studio n'est écrit d'avance : inventer « Wasquehal » ou
-- « Levallois » serait poser de la donnée de production à la place du client.
CREATE TABLE IF NOT EXISTS academy_studios (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  nom      TEXT NOT NULL,
  actif    INTEGER NOT NULL DEFAULT 1,
  cree_le  TEXT NOT NULL,
  maj_le   TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_academy_studios_nom ON academy_studios(nom);

-- L'OBSERVATION.
--
--  "date_observation" est la date du FAIT ; "cree_le" celle de la saisie. Un
--  passage du 1er noté le 4 se lit au 1er — c'est "date_observation" qui
--  ordonne la chronologie, et "cree_le" ne sert qu'à savoir quand la ligne a
--  été écrite.
--
--  "salarie_email" est NULLABLE, et c'est un choix métier : une visite de
--  studio ne vise personne. L'écran n'affiche alors aucune ligne « salarié ».
--
--  "piece_jointe" existe et reste VIDE en V1 : la colonne est posée pour que
--  l'ajout d'un fichier plus tard soit une route, pas une migration.
CREATE TABLE IF NOT EXISTS academy_observations (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  studio_id         INTEGER NOT NULL REFERENCES academy_studios(id),
  salarie_email     TEXT,
  auteur_email      TEXT NOT NULL,
  niveau            TEXT NOT NULL,
  observation       TEXT NOT NULL,
  date_observation  TEXT NOT NULL,
  piece_jointe      TEXT,
  cree_le           TEXT NOT NULL,
  maj_le            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_academy_obs_date ON academy_observations(date_observation DESC);
CREATE INDEX IF NOT EXISTS idx_academy_obs_studio ON academy_observations(studio_id);
CREATE INDEX IF NOT EXISTS idx_academy_obs_salarie ON academy_observations(salarie_email);
`;

function createAcademyTerrain({ getDb, nowIso, boost }) {
  const db = () => getDb();
  const normMail = (e) => String(e || '').trim().toLowerCase();
  const texte = (v, max) => String(v === null || v === undefined ? '' : v).trim().slice(0, max);
  // Une date ISO courte, et rien d'autre : c'est ce qui ordonne la chronologie.
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  const basesMigrees = new WeakSet();
  function assurerSchema() {
    const d = db();
    if (basesMigrees.has(d)) return true;
    d.exec(SCHEMA_TERRAIN);
    basesMigrees.add(d);
    return true;
  }

  // -- LE DROIT ---------------------------------------------------------------
  //
  //  Relu à CHAQUE requête, comme celui de certifier : retirer le droit ferme
  //  la rubrique à l'appel suivant, sans rien avoir à défaire.
  function aLeDroit(email) {
    assurerSchema();
    const r = db().prepare('SELECT actif FROM academy_terrain_droits WHERE email = ?').get(normMail(email));
    return !!(r && r.actif);
  }

  function definirDroit(email, oui, auteur) {
    assurerSchema();
    const mail = normMail(email);
    // Le compte doit exister — on n'accorde pas un droit à une adresse qui
    // n'a pas d'espace, comme pour le droit de certifier.
    if (!boost.lireUtilisateur(mail)) {
      return err(404, 'Ce compte n\'existe pas encore : la personne doit d\'abord créer son espace.');
    }
    const m = nowIso();
    db().prepare(`INSERT INTO academy_terrain_droits (email, actif, cree_le, maj_le, maj_par)
                  VALUES (?, ?, ?, ?, ?)
                  ON CONFLICT(email) DO UPDATE SET actif = excluded.actif,
                    maj_le = excluded.maj_le, maj_par = excluded.maj_par`)
      .run(mail, oui ? 1 : 0, m, m, normMail(auteur) || null);
    return ok({ terrain: { email: mail, actif: !!oui } });
  }

  const listerDroits = () => {
    assurerSchema();
    return db().prepare('SELECT email, actif FROM academy_terrain_droits WHERE actif = 1').all()
      .map((r) => r.email);
  };

  // -- LES STUDIOS ------------------------------------------------------------

  const vueStudio = (r) => ({ id: r.id, nom: r.nom, actif: !!r.actif });

  function listerStudios({ toutes = false } = {}) {
    assurerSchema();
    return db().prepare(`SELECT * FROM academy_studios ${toutes ? '' : 'WHERE actif = 1'}
                         ORDER BY nom COLLATE NOCASE ASC`).all().map(vueStudio);
  }

  // Créer ou renommer : le même geste, distingué par la présence d'un id —
  // comme partout ailleurs dans l'administration de l'Academy.
  function definirStudio({ id, nom, actif }) {
    assurerSchema();
    const n = texte(nom, NOM_STUDIO_MAX);
    if (!n) return err(400, 'Le nom du studio est requis.');
    const m = nowIso();
    const jumeau = db().prepare('SELECT id FROM academy_studios WHERE nom = ? COLLATE NOCASE').get(n);
    if (jumeau && Number(jumeau.id) !== Number(id)) {
      return err(409, 'Un studio porte déjà ce nom.');
    }
    if (id) {
      const existant = db().prepare('SELECT * FROM academy_studios WHERE id = ?').get(Number(id));
      if (!existant) return err(404, 'Studio introuvable.');
      db().prepare('UPDATE academy_studios SET nom = ?, actif = ?, maj_le = ? WHERE id = ?')
        .run(n, actif === undefined ? existant.actif : (actif ? 1 : 0), m, Number(id));
      return ok({ studio: vueStudio({ ...existant, nom: n, actif: actif === undefined ? existant.actif : actif }) });
    }
    const r = db().prepare('INSERT INTO academy_studios (nom, actif, cree_le, maj_le) VALUES (?, 1, ?, ?)')
      .run(n, m, m);
    return ok({ studio: { id: r.lastInsertRowid, nom: n, actif: true } });
  }

  //  ARCHIVER, JAMAIS SUPPRIMER. Des observations citent ce studio ; effacer la
  //  ligne les rendrait illisibles. Un studio archivé disparaît de la saisie et
  //  reste lisible dans l'historique.
  function archiverStudio(id, archive) {
    assurerSchema();
    const s = db().prepare('SELECT * FROM academy_studios WHERE id = ?').get(Number(id));
    if (!s) return err(404, 'Studio introuvable.');
    db().prepare('UPDATE academy_studios SET actif = ?, maj_le = ? WHERE id = ?')
      .run(archive ? 0 : 1, nowIso(), Number(id));
    return ok({ studio: vueStudio({ ...s, actif: archive ? 0 : 1 }) });
  }

  // -- LES OBSERVATIONS -------------------------------------------------------
  //
  //  LA VUE PORTE LES NOMS, PAS LA TABLE. `users` est joint à l'affichage pour
  //  le salarié et pour l'auteur : un prénom qui change se répercute partout,
  //  et l'historique ne ment jamais.
  const SELECT_OBS = `
    SELECT o.*, s.nom AS studioNom, s.actif AS studioActif,
           us.prenom AS salariePrenom, us.nom AS salarieNom,
           ua.prenom AS auteurPrenom, ua.nom AS auteurNom
    FROM academy_observations o
    JOIN academy_studios s ON s.id = o.studio_id
    LEFT JOIN users us ON us.email = o.salarie_email
    LEFT JOIN users ua ON ua.email = o.auteur_email`;

  const nomDe = (prenom, nom, mail) =>
    [String(prenom || '').trim(), String(nom || '').trim()].filter(Boolean).join(' ') || mail || '';

  const vueObs = (r) => ({
    id: r.id,
    studioId: r.studio_id,
    studio: r.studioNom,
    studioArchive: !r.studioActif,
    // `salarie` est NUL quand l'observation ne vise personne — l'écran
    // n'affiche alors aucune ligne, plutôt qu'un « Salarié : aucun ».
    salarieEmail: r.salarie_email || null,
    salarie: r.salarie_email ? nomDe(r.salariePrenom, r.salarieNom, r.salarie_email) : null,
    auteurEmail: r.auteur_email,
    auteur: nomDe(r.auteurPrenom, r.auteurNom, r.auteur_email),
    niveau: r.niveau,
    observation: r.observation,
    date: r.date_observation,
    pieceJointe: r.piece_jointe || null,
    creeLe: r.cree_le,
    majLe: r.maj_le,
  });

  //  LES FILTRES SE COMPOSENT, et le tri porte sur la date du FAIT.
  //
  //  ⚠️ `cree_le` DÉPARTAGE LES EX ÆQUO, il n'ordonne pas : deux observations
  //  du même jour se lisent dans l'ordre où elles ont été écrites. Trier sur
  //  `cree_le` seul ferait remonter une visite d'il y a trois semaines saisie
  //  ce matin.
  function lister({ studioId, salarie, niveau, depuis, jusqua, q, tri } = {}) {
    assurerSchema();
    const où = []; const p = [];
    if (studioId) { où.push('o.studio_id = ?'); p.push(Number(studioId)); }
    if (salarie) { où.push('o.salarie_email = ?'); p.push(normMail(salarie)); }
    if (niveau && NIVEAUX.includes(niveau)) { où.push('o.niveau = ?'); p.push(niveau); }
    if (DATE_RE.test(String(depuis || ''))) { où.push('o.date_observation >= ?'); p.push(depuis); }
    if (DATE_RE.test(String(jusqua || ''))) { où.push('o.date_observation <= ?'); p.push(jusqua); }
    if (String(q || '').trim()) {
      // La recherche porte sur le TEXTE de l'observation : c'est lui qui dit ce
      // qui s'est passé. Le studio et le salarié ont déjà leur filtre.
      où.push('o.observation LIKE ?'); p.push('%' + String(q).trim() + '%');
    }
    const sens = tri === 'ancien' ? 'ASC' : 'DESC';
    const sql = SELECT_OBS + (où.length ? ' WHERE ' + où.join(' AND ') : '') +
      ` ORDER BY o.date_observation ${sens}, o.cree_le ${sens}, o.id ${sens}`;
    return db().prepare(sql).all(...p).map(vueObs);
  }

  const lire = (id) => {
    assurerSchema();
    const r = db().prepare(SELECT_OBS + ' WHERE o.id = ?').get(Number(id));
    return r ? vueObs(r) : null;
  };

  //  QUATRE ENTIERS, ET RIEN QU'EUX. On dénombre par niveau sur EXACTEMENT la
  //  liste affichée — filtres compris — pour que les compteurs ne racontent
  //  jamais autre chose que ce qu'on a sous les yeux. Aucune moyenne, aucun
  //  indice : ce serait transformer une trace factuelle en note.
  function compter(filtres) {
    const l = lister(filtres);
    const c = Object.fromEntries(NIVEAUX.map((n) => [n, 0]));
    for (const o of l) if (c[o.niveau] !== undefined) c[o.niveau]++;
    return { total: l.length, ...c };
  }

  //  La validation, en un seul endroit : créer et modifier exigent la même
  //  chose, et deux contrôles qui divergent finissent par laisser passer une
  //  ligne que l'autre refuse.
  function verifier(d) {
    const studioId = Number(d.studioId);
    if (!studioId) return 'Choisis un studio.';
    const s = db().prepare('SELECT actif FROM academy_studios WHERE id = ?').get(studioId);
    if (!s) return 'Studio inconnu.';
    if (!NIVEAUX.includes(String(d.niveau || ''))) return 'Choisis un niveau.';
    if (!DATE_RE.test(String(d.date || ''))) return 'La date de l\'observation est requise (AAAA-MM-JJ).';
    if (!texte(d.observation, OBS_MAX)) return 'Décris ce que tu as observé.';
    // Un salarié cité doit exister : sinon l'historique porterait une adresse
    // sans visage, impossible à relier plus tard à une fiche.
    if (d.salarie && !boost.lireUtilisateur(normMail(d.salarie))) return 'Ce salarié est introuvable.';
    return null;
  }

  function creer(donnees, auteur) {
    assurerSchema();
    const d = donnees || {};
    const souci = verifier(d);
    if (souci) return err(400, souci);
    const m = nowIso();
    const r = db().prepare(`INSERT INTO academy_observations
        (studio_id, salarie_email, auteur_email, niveau, observation, date_observation, cree_le, maj_le)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(Number(d.studioId), d.salarie ? normMail(d.salarie) : null, normMail(auteur),
        String(d.niveau), texte(d.observation, OBS_MAX), String(d.date), m, m);
    return ok({ observation: lire(r.lastInsertRowid) });
  }

  //  ⚠️ L'AUTEUR NE CHANGE JAMAIS. Modifier une observation corrige ce qu'on a
  //  écrit, pas qui l'a écrit : `auteur_email` n'est pas dans la mise à jour, et
  //  ne peut donc pas être réattribué par un corps de requête bien tourné.
  function modifier(id, donnees, moi, estAdmin) {
    assurerSchema();
    const actuelle = lire(id);
    if (!actuelle) return err(404, 'Observation introuvable.');
    if (!peutModifier(actuelle, moi, estAdmin)) {
      return err(403, 'Seuls l\'auteur de l\'observation et un administrateur peuvent la modifier.');
    }
    const d = donnees || {};
    const souci = verifier(d);
    if (souci) return err(400, souci);
    db().prepare(`UPDATE academy_observations SET studio_id = ?, salarie_email = ?, niveau = ?,
                    observation = ?, date_observation = ?, maj_le = ? WHERE id = ?`)
      .run(Number(d.studioId), d.salarie ? normMail(d.salarie) : null, String(d.niveau),
        texte(d.observation, OBS_MAX), String(d.date), nowIso(), Number(id));
    return ok({ observation: lire(id) });
  }

  function supprimer(id, moi, estAdmin) {
    assurerSchema();
    const actuelle = lire(id);
    if (!actuelle) return err(404, 'Observation introuvable.');
    if (!peutModifier(actuelle, moi, estAdmin)) {
      return err(403, 'Seuls l\'auteur de l\'observation et un administrateur peuvent la supprimer.');
    }
    db().prepare('DELETE FROM academy_observations WHERE id = ?').run(Number(id));
    return ok({ supprime: Number(id) });
  }

  //  QUI PEUT REPRENDRE UNE OBSERVATION : celui qui l'a écrite, ou un
  //  administrateur. Le droit de suivre le terrain donne celui d'AJOUTER, pas
  //  celui de réécrire le constat d'un autre.
  const peutModifier = (obs, moi, estAdmin) =>
    !!estAdmin || (!!obs && normMail(obs.auteurEmail) === normMail(moi));

  return {
    assurerSchema,
    aLeDroit, definirDroit, listerDroits,
    listerStudios, definirStudio, archiverStudio,
    lister, lire, compter, creer, modifier, supprimer, peutModifier,
  };
}

module.exports = {
  createAcademyTerrain,
  NIVEAUX, POSITIVE, TO_CORRECT, ISSUE, OBSERVATION,
};
