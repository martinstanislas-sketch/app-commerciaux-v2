'use strict';
// ============================================================================
//  RECAP 2 — LE SUIVI DES CLIENTS NON RECONDUITS.
//
//  Trois statuts posés à la main, EXCLUSIFS, sur une ligne du détail
//  « clients non reconduits » :
//    · sous_controle — « Sous contrôle » : on sait pourquoi, c'est suivi ;
//    · resilie       — « Résilié »       : le client est parti ;
//    · a_creuser     — « À creuser »     : il faut aller voir.
//  Un seul à la fois. Cocher en remplace un autre ; décocher = aucun statut
//  (statut '' en base : la ligne reste, avec qui l'a retiré et quand).
//
//  ⚠️ SANS AUCUN EFFET SUR LA NON-RECONDUCTION NI SUR AUCUN KPI. Ce sont des
//  marques de suivi, jamais des données de calcul : `appliquer()` ajoute un
//  champ `suivi` à chaque ligne et ne touche à aucun compteur.
//
//  ⚠️ EN BASE, JAMAIS DANS LE JSON MENSUEL. Le JSON est REMPLACÉ à chaque
//  collecte : y écrire un statut, ce serait le perdre. Même principe que les
//  contrôles de vente (lib/recap2Checks.js) : table dédiée dans le volume
//  Railway, posée à la lecture.
//
//  ⚠️ LA CLÉ D'UN CLIENT : mois · studio · client.
//    · l'Id membre Deciplus (`idClient`) quand le rapport le porte — stable
//      d'un mois à l'autre et insensible à une graphie retouchée ;
//    · sinon l'identité normalisée (accents, casse, ordre des mots neutralisés).
//  Les deux sont gardées en base. À la lecture, l'id est cherché d'abord ; à
//  défaut, l'identité — mais jamais sur une ligne dont l'id CONTREDIT celui de
//  la marque (deux homonymes ne partagent pas un statut). Un statut posé sur un
//  rapport sans id retrouve donc sa ligne une fois les id présents, et
//  inversement.
// ============================================================================

const { cleIdentite } = require('./recap2Matches.js');

const MOIS_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const ID_RE = /^[0-9]{1,20}$/;
// Les trois statuts historiques d'abord (valeurs en base inchangées), puis ceux
// du suivi complet des non-reconductions (2026-09-18). Tous se posent à la main ;
// sans décision, c'est le statut AUTOMATIQUE du contrôle (lib/recap2NrAnalyse.js)
// qui s'affiche. `recupere` et `depart_confirme` ne sont JAMAIS automatiques.
const STATUTS = ['sous_controle', 'resilie', 'a_creuser',
  'a_traiter', 'reconduit_autrement', 'toujours_actif', 'suspendu', 'recupere', 'depart_confirme'];
const LIBELLES = {
  a_traiter: 'À traiter', sous_controle: 'Sous contrôle', resilie: 'Résilié', reconduit_autrement: 'Reconduit autrement',
  toujours_actif: 'Toujours actif', suspendu: 'Suspendu temporairement', recupere: 'Récupéré',
  depart_confirme: 'Départ confirmé', a_creuser: 'À creuser',
};

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS recap2_nr_statuts (
    mois         TEXT NOT NULL,             -- AAAA-MM, mois du rapport (M)
    studio       TEXT NOT NULL,             -- studio du détail non-reconduits
    cle_client   TEXT NOT NULL,             -- « id:<Id membre> » ou « nom:<identité triée> »
    id_client    TEXT NOT NULL DEFAULT '',  -- Id membre Deciplus si connu
    cle_nom      TEXT NOT NULL DEFAULT '',  -- identité normalisée, toujours renseignée
    client       TEXT NOT NULL DEFAULT '',  -- graphie du rapport au moment du choix
    statut       TEXT NOT NULL DEFAULT '',  -- sous_controle | resilie | a_creuser | '' (aucun)
    modifie_le   TEXT NOT NULL,             -- ISO
    modifie_par  TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (mois, studio, cle_client)
  );
  CREATE INDEX IF NOT EXISTS idx_recap2_nr_statuts_mois ON recap2_nr_statuts (mois);
  CREATE TABLE IF NOT EXISTS recap2_nr_statuts_historique (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    mois         TEXT NOT NULL,
    studio       TEXT NOT NULL,
    cle_client   TEXT NOT NULL,
    client       TEXT NOT NULL DEFAULT '',
    avant        TEXT NOT NULL DEFAULT '',  -- '' = automatique
    apres        TEXT NOT NULL DEFAULT '',
    le           TEXT NOT NULL,
    par          TEXT NOT NULL DEFAULT ''
  );
`;

// Création sûre au démarrage : idempotente, sans toucher aux données.
function creerTable(db) {
  db.exec(SCHEMA);
}

// ─── ÉCRITURE ───────────────────────────────────────────────────────────────
//  `client` et `idClient` viennent de la LIGNE DU RAPPORT (la route les relit),
//  jamais directement du navigateur.
function enregistrer(db, { mois, studio, client, idClient = '', statut, par = '', maintenant = new Date() } = {}) {
  if (!MOIS_RE.test(String(mois || ''))) throw new Error('mois invalide');
  const s = String(studio || '').trim();
  if (!s) throw new Error('studio requis');
  const st = String(statut == null ? '' : statut);
  if (st !== '' && STATUTS.indexOf(st) < 0) throw new Error('statut inconnu : ' + st);
  const nom = cleIdentite(client);
  if (!nom) throw new Error('client non identifiable');
  const id = ID_RE.test(String(idClient || '')) ? String(idClient) : '';
  const cle = id ? 'id:' + id : 'nom:' + nom;

  const ancien = db.prepare('SELECT statut FROM recap2_nr_statuts WHERE mois = ? AND studio = ? AND cle_client = ?').get(mois, s, cle);
  const avant = ancien ? String(ancien.statut || '') : '';
  if (avant !== st) {
    db.prepare(`INSERT INTO recap2_nr_statuts_historique (mois, studio, cle_client, client, avant, apres, le, par)
      VALUES (?,?,?,?,?,?,?,?)`).run(mois, s, cle, String(client || '').trim(), avant, st, maintenant.toISOString(), String(par || '').slice(0, 80));
  }
  db.prepare(`INSERT INTO recap2_nr_statuts
      (mois, studio, cle_client, id_client, cle_nom, client, statut, modifie_le, modifie_par)
      VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(mois, studio, cle_client) DO UPDATE SET
      statut = excluded.statut, cle_nom = excluded.cle_nom, client = excluded.client,
      modifie_le = excluded.modifie_le, modifie_par = excluded.modifie_par`)
    .run(mois, s, cle, id, nom, String(client || '').trim(), st, maintenant.toISOString(), String(par || ''));
  return versSuivi(db.prepare('SELECT * FROM recap2_nr_statuts WHERE mois = ? AND studio = ? AND cle_client = ?').get(mois, s, cle));
}

function versSuivi(r) {
  return {
    statut: (r && STATUTS.indexOf(r.statut) >= 0) ? r.statut : '',
    modifieLe: (r && r.modifie_le) || '',
    modifiePar: (r && r.modifie_par) || '',
  };
}
const SUIVI_VIDE = () => ({ statut: '', modifieLe: '', modifiePar: '' });

// ─── LECTURE ────────────────────────────────────────────────────────────────
//  Les marques d'un mois, indexées deux fois : par id et par identité.
//  Sur l'identité, plusieurs marques possibles (posée sans id, puis avec) :
//  on les garde toutes, la plus récente d'abord.
function statutsDuMois(db, mois) {
  const parId = new Map();
  const parNom = new Map();
  db.prepare('SELECT * FROM recap2_nr_statuts WHERE mois = ? ORDER BY modifie_le DESC').all(mois).forEach((r) => {
    if (r.id_client) {
      const k = r.studio + '|' + r.id_client;
      if (!parId.has(k)) parId.set(k, r);
    }
    const k = r.studio + '|' + r.cle_nom;
    if (!parNom.has(k)) parNom.set(k, []);
    parNom.get(k).push(r);
  });
  return { parId, parNom };
}

// La marque d'une ligne du rapport, ou null.
function marqueDe(index, studio, ligne) {
  const id = ID_RE.test(String(ligne.idClient || '')) ? String(ligne.idClient) : '';
  if (id && index.parId.has(studio + '|' + id)) return index.parId.get(studio + '|' + id);
  const candidates = index.parNom.get(studio + '|' + cleIdentite(ligne.client)) || [];
  // Une marque posée sur un autre Id membre appartient à un homonyme : ignorée.
  return candidates.find((r) => !r.id_client || !id || r.id_client === id) || null;
}

// ─── APPLICATION À LA LECTURE ───────────────────────────────────────────────
//  Pose `suivi` sur chaque ligne de `nonReconduction.liste`. Copie profonde :
//  le rapport lu sur disque n'est jamais modifié, et AUCUN compteur n'est touché.
function appliquer(rapport, index) {
  if (!rapport || !rapport.studios) return rapport;
  const copie = JSON.parse(JSON.stringify(rapport));
  Object.keys(copie.studios).forEach((s) => {
    const nr = copie.studios[s] && copie.studios[s].nonReconduction;
    if (!nr || !Array.isArray(nr.liste)) return;
    nr.liste.forEach((l) => {
      const r = marqueDe(index, s, l);
      l.suivi = r ? versSuivi(r) : SUIVI_VIDE();
    });
  });
  return copie;
}

// La ligne d'un non-reconduit dans le rapport, ou null. Par Id membre si
// l'appelant en fournit un ET que le rapport le porte ; sinon par identité,
// à condition qu'elle soit UNIQUE dans le studio (deux homonymes sans id :
// on refuse plutôt que de marquer le mauvais).
function ligneDe(rapport, { studio, client, idClient }) {
  const nr = rapport && rapport.studios && rapport.studios[studio] && rapport.studios[studio].nonReconduction;
  if (!nr || !Array.isArray(nr.liste)) return null;
  const id = ID_RE.test(String(idClient || '')) ? String(idClient) : '';
  if (id) {
    const l = nr.liste.find((x) => String(x.idClient || '') === id);
    if (l) return l;
  }
  const nom = cleIdentite(client);
  if (!nom) return null;
  const memes = nr.liste.filter((x) => cleIdentite(x.client) === nom && (!id || !x.idClient || String(x.idClient) === id));
  return memes.length === 1 ? memes[0] : null;
}

function historique(db, mois) {
  return db.prepare('SELECT * FROM recap2_nr_statuts_historique WHERE mois = ? ORDER BY id').all(mois);
}

module.exports = { SCHEMA, STATUTS, LIBELLES, creerTable, enregistrer, statutsDuMois, appliquer, ligneDe, historique };
