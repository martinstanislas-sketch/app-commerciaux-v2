'use strict';
// ============================================================================
//  RECAP 2 — LES REMARQUES MANUELLES PAR PERSONNE, MOIS PAR MOIS.
//
//  Une remarque libre, saisie à la main, sur une personne affichée dans RECAP 2 :
//    · type « vente »         — une ligne des ventes signées du mois
//                               (`clientsRetrouves.liste`) ;
//    · type « non_reconduit » — une ligne des clients non reconduits
//                               (`nonReconduction.liste`).
//  Le type fait partie de la clé : la même personne peut être à la fois
//  signataire et non reconduite, ses deux remarques ne se mélangent pas.
//
//  ⚠️ LIÉE AU MOIS ANALYSÉ. La clé contient le mois : une remarque d'août 2026
//  n'apparaît jamais sur le rapport de septembre 2026.
//
//  ⚠️ SANS AUCUN EFFET SUR LES CALCULS. `appliquer()` ajoute un champ `note` à
//  chaque ligne ; aucun compteur, aucun statut, aucun champ source n'est touché.
//
//  ⚠️ EN BASE, JAMAIS DANS LE JSON MENSUEL, qui est REMPLACÉ à chaque collecte
//  (même principe que lib/recap2Checks.js) : la remarque survit donc à la
//  recollecte, à l'actualisation et au redéploiement (volume Railway).
//
//  ⚠️ LA CLÉ D'UNE PERSONNE : mois · studio · type · personne, où la personne
//  est l'Id membre Deciplus (`idClient`) quand la ligne le porte, sinon son
//  identité normalisée (accents, casse, ordre des mots neutralisés). Les deux
//  sont gardées en base. À la lecture : l'id d'abord, puis l'identité — jamais
//  sur une ligne dont l'id CONTREDIT celui de la remarque (un homonyme ne
//  récupère pas la remarque d'un autre). Une remarque posée avant qu'une vente
//  soit retrouvée (donc sans id) la suit une fois l'id connu, et inversement.
//
//  Supprimer = remarque vide. La ligne reste en base (qui a supprimé, quand) ;
//  une remarque vide ne s'affiche pas et ne se copie pas.
// ============================================================================

const { cleIdentite } = require('./recap2Matches.js');

const MOIS_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const ID_RE = /^[0-9]{1,20}$/;
const TYPES = ['vente', 'non_reconduit', 'vni'];
// Un identifiant de contact Vendor : clé d'un VNI sans Id Deciplus.
const ID_VENDOR_RE = /^[0-9]{10,16}x[0-9]{10,24}$/;
const idVendorDe = (x) => (ID_VENDOR_RE.test(String(x || '')) ? String(x) : '');
const LONGUEUR_MAX = 2000;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS recap2_notes (
    mois          TEXT NOT NULL,             -- AAAA-MM, mois analysé (M)
    studio        TEXT NOT NULL,             -- studio du rapport
    type          TEXT NOT NULL,             -- vente | non_reconduit
    cle_personne  TEXT NOT NULL,             -- « id:<Id membre> » ou « nom:<identité triée> »
    id_client     TEXT NOT NULL DEFAULT '',  -- Id membre Deciplus si connu
    cle_nom       TEXT NOT NULL DEFAULT '',  -- identité normalisée, toujours renseignée
    client        TEXT NOT NULL DEFAULT '',  -- nom affiché au moment de la saisie
    remarque      TEXT NOT NULL DEFAULT '',  -- '' = supprimée
    modifie_le    TEXT NOT NULL,             -- ISO
    modifie_par   TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (mois, studio, type, cle_personne)
  );
  CREATE INDEX IF NOT EXISTS idx_recap2_notes_mois ON recap2_notes (mois);
`;

// Création sûre au démarrage : idempotente, sans toucher aux données.
function creerTable(db) {
  db.exec(SCHEMA);
}

const idDe = (x) => (ID_RE.test(String(x || '')) ? String(x) : '');
// Normalisation du texte : fins de ligne unifiées, espaces de bord retirés.
const nettoyerTexte = (t) => String(t == null ? '' : t).replace(/\r\n?/g, '\n').trim();

// La liste d'un type dans le bloc d'un studio.
function listeDe(rapport, studio, type) {
  const b = rapport && rapport.studios && rapport.studios[studio];
  // `vni` : la liste ACTIVE (le serveur a déjà retiré les transformés).
  const bloc = b && (type === 'vente' ? b.clientsRetrouves : type === 'vni' ? b.vni : b.nonReconduction);
  return (bloc && Array.isArray(bloc.liste)) ? bloc.liste : null;
}

// ─── ÉCRITURE ───────────────────────────────────────────────────────────────
//  `client` et `idClient` viennent de la LIGNE DU RAPPORT (la route les relit),
//  jamais directement du navigateur.
function enregistrer(db, { mois, studio, type, client, idClient = '', idVendor = '', remarque, par = '', maintenant = new Date() } = {}) {
  if (!MOIS_RE.test(String(mois || ''))) throw new Error('mois invalide');
  const s = String(studio || '').trim();
  if (!s) throw new Error('studio requis');
  if (TYPES.indexOf(type) < 0) throw new Error('type : vente ou non_reconduit');
  const texte = nettoyerTexte(remarque);
  if (texte.length > LONGUEUR_MAX) throw new Error('remarque trop longue (' + LONGUEUR_MAX + ' caractères maximum)');
  const nom = cleIdentite(client);
  if (!nom) throw new Error('personne non identifiable');
  const id = idDe(idClient);
  // Priorité : Id Deciplus, puis contact Vendor (VNI), puis identité normalisée.
  const vendor = idVendorDe(idVendor);
  const cle = id ? 'id:' + id : vendor ? 'vendor:' + vendor : 'nom:' + nom;

  db.prepare(`INSERT INTO recap2_notes
      (mois, studio, type, cle_personne, id_client, cle_nom, client, remarque, modifie_le, modifie_par)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(mois, studio, type, cle_personne) DO UPDATE SET
      remarque = excluded.remarque, cle_nom = excluded.cle_nom, client = excluded.client,
      modifie_le = excluded.modifie_le, modifie_par = excluded.modifie_par`)
    .run(mois, s, type, cle, id, nom, String(client || '').trim(), texte, maintenant.toISOString(), String(par || ''));
  return versNote(db.prepare('SELECT * FROM recap2_notes WHERE mois = ? AND studio = ? AND type = ? AND cle_personne = ?')
    .get(mois, s, type, cle));
}

function versNote(r) {
  return { remarque: (r && r.remarque) || '', modifieLe: (r && r.modifie_le) || '', modifiePar: (r && r.modifie_par) || '' };
}

// ─── LECTURE ────────────────────────────────────────────────────────────────
//  Les remarques d'un mois, indexées par id et par identité (la plus récente
//  d'abord : une remarque posée sans id puis réécrite avec id -> la dernière).
function notesDuMois(db, mois) {
  const parId = new Map();
  const parNom = new Map();
  const parVendor = new Map();
  db.prepare('SELECT * FROM recap2_notes WHERE mois = ? ORDER BY modifie_le DESC').all(mois).forEach((r) => {
    if (r.id_client) {
      const k = r.studio + '|' + r.type + '|' + r.id_client;
      if (!parId.has(k)) parId.set(k, r);
    }
    if (String(r.cle_personne).indexOf('vendor:') === 0) {
      const kv = r.studio + '|' + r.type + '|' + r.cle_personne.slice(7);
      if (!parVendor.has(kv)) parVendor.set(kv, r);
    }
    const k = r.studio + '|' + r.type + '|' + r.cle_nom;
    if (!parNom.has(k)) parNom.set(k, []);
    parNom.get(k).push(r);
  });
  return { parId, parNom, parVendor };
}

function noteDe(index, studio, type, ligne) {
  const id = idDe(ligne.idClient);
  if (id && index.parId.has(studio + '|' + type + '|' + id)) return index.parId.get(studio + '|' + type + '|' + id);
  const vendor = idVendorDe(ligne.contactId);
  if (vendor && index.parVendor && index.parVendor.has(studio + '|' + type + '|' + vendor)) return index.parVendor.get(studio + '|' + type + '|' + vendor);
  const candidates = index.parNom.get(studio + '|' + type + '|' + cleIdentite(ligne.client)) || [];
  // Une remarque posée sur un autre Id membre appartient à un homonyme : ignorée.
  // Une remarque posée sur un autre contact Vendor (VNI homonyme) : ignorée aussi.
  return candidates.find((r) => (!r.id_client || !id || r.id_client === id)
    && !(vendor && String(r.cle_personne).indexOf('vendor:') === 0 && r.cle_personne.slice(7) !== vendor)) || null;
}

// ─── APPLICATION À LA LECTURE ───────────────────────────────────────────────
//  Pose `note` sur chaque ligne des deux listes. Copie profonde : le rapport
//  lu sur disque n'est jamais modifié, et AUCUN compteur n'est touché.
function appliquer(rapport, index) {
  if (!rapport || !rapport.studios) return rapport;
  const copie = JSON.parse(JSON.stringify(rapport));
  Object.keys(copie.studios).forEach((s) => {
    TYPES.forEach((type) => {
      const liste = listeDe(copie, s, type);
      if (!liste) return;
      liste.forEach((l) => { l.note = versNote(noteDe(index, s, type, l)); });
    });
  });
  return copie;
}

// La ligne d'une personne dans le rapport (déjà enrichi des décisions), ou null.
//  Par Id membre si fourni ET présent ; sinon par identité. Plusieurs lignes à
//  la même identité (deux ventes d'une même personne) : acceptées si elles ne
//  portent pas deux Id membres différents — sinon ce sont des homonymes, et on
//  refuse plutôt que d'écrire sur le mauvais.
function ligneDe(rapport, { studio, type, client, idClient, idVendor }) {
  const liste = listeDe(rapport, studio, type);
  if (!liste) return null;
  const vendor = idVendorDe(idVendor);
  if (vendor) {
    const lv = liste.find((x) => x.contactId === vendor);
    if (lv) return lv;
  }
  const id = idDe(idClient);
  if (id) {
    const l = liste.find((x) => idDe(x.idClient) === id);
    if (l) return l;
  }
  const nom = cleIdentite(client);
  if (!nom) return null;
  const memes = liste.filter((x) => cleIdentite(x.client) === nom && (!id || !idDe(x.idClient) || idDe(x.idClient) === id));
  if (!memes.length) return null;
  const ids = new Set(memes.map((x) => idDe(x.idClient)).filter(Boolean));
  if (ids.size > 1) return null;
  // VNI : un contact par ligne — deux lignes au même nom sont deux personnes.
  if (new Set(memes.map((x) => idVendorDe(x.contactId)).filter(Boolean)).size > 1) return null;
  // Une ligne portant l'id d'abord : c'est la clé la plus stable.
  return memes.find((x) => idDe(x.idClient)) || memes[0];
}

module.exports = { SCHEMA, TYPES, LONGUEUR_MAX, creerTable, enregistrer, notesDuMois, appliquer, ligneDe };
