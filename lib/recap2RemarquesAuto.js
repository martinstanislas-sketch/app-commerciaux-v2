'use strict';
// ============================================================================
//  RECAP 2 — LES REMARQUES AUTOMATIQUES, MODIFIABLES À LA MAIN.
//
//  Les remarques automatiques (public/recap2-conseils.js) sont CALCULÉES à
//  l'affichage : rien n'est stocké, elles apparaissent et disparaissent avec le
//  problème. Ce module ajoute la seule chose qui doit vivre en base : la
//  VERSION MODIFIÉE qu'un administrateur a écrite à la place d'une remarque
//  automatique.
//
//  ⚠️ LE TEXTE D'ORIGINE EST GARDÉ, ET IL FAIT PARTIE DE LA CLÉ. Une version
//  modifiée remplace une remarque automatique PRÉCISE (« Propose au prospect le
//  Challenge Flex… ») d'une personne précise. Si la règle cesse de produire
//  cette remarque (le point est réglé), la version modifiée cesse de
//  s'afficher, elle aussi : on ne réclame pas une action devenue sans objet.
//
//  ⚠️ RÉVERSIBLE ET HISTORISÉ. « Revenir à la version automatique » supprime la
//  version courante ; chaque modification et chaque retour sont inscrits dans
//  recap2_remarques_auto_historique (avant, après, qui, quand) — jamais effacés.
//
//  ⚠️ SANS EFFET SUR LES CALCULS. `appliquer()` pose `remarquesAuto` sur chaque
//  ligne ; aucun compteur, aucun statut n'est touché.
//
//  ⚠️ LA CLÉ D'UNE PERSONNE : la même que les remarques manuelles
//  (lib/recap2Notes.js) — Id Deciplus, sinon contact Vendor (VNI), sinon
//  identité normalisée. Un homonyme ne récupère jamais la version d'un autre.
// ============================================================================

const { cleIdentite } = require('./recap2Matches.js');

const MOIS_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const ID_RE = /^[0-9]{1,20}$/;
const ID_VENDOR_RE = /^[0-9]{10,16}x[0-9]{10,24}$/;
// Seules les listes qui portent des remarques automatiques.
const TYPES = ['vente', 'vni', 'non_reconduit', 'suspension'];
const LONGUEUR_MAX = 1000;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS recap2_remarques_auto (
    mois          TEXT NOT NULL,
    studio        TEXT NOT NULL,
    type          TEXT NOT NULL,             -- vente | vni | non_reconduit | suspension
    cle_personne  TEXT NOT NULL,             -- id:<Id membre> | vendor:<contact> | nom:<identité>
    id_client     TEXT NOT NULL DEFAULT '',
    cle_nom       TEXT NOT NULL DEFAULT '',
    client        TEXT NOT NULL DEFAULT '',
    texte_auto    TEXT NOT NULL,             -- la remarque d'origine, au mot près
    texte         TEXT NOT NULL,             -- la version modifiée affichée
    modifie_le    TEXT NOT NULL,
    modifie_par   TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (mois, studio, type, cle_personne, texte_auto)
  );
  CREATE INDEX IF NOT EXISTS idx_recap2_remarques_auto_mois ON recap2_remarques_auto (mois);
  CREATE TABLE IF NOT EXISTS recap2_remarques_auto_historique (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    mois          TEXT NOT NULL,
    studio        TEXT NOT NULL,
    type          TEXT NOT NULL,
    cle_personne  TEXT NOT NULL,
    client        TEXT NOT NULL DEFAULT '',
    texte_auto    TEXT NOT NULL,
    avant         TEXT NOT NULL DEFAULT '',  -- '' = la version automatique
    apres         TEXT NOT NULL DEFAULT '',  -- '' = retour à la version automatique
    le            TEXT NOT NULL,
    par           TEXT NOT NULL DEFAULT ''
  );
`;

function creerTable(db) { db.exec(SCHEMA); }

const idDe = (x) => (ID_RE.test(String(x || '')) ? String(x) : '');
const idVendorDe = (x) => (ID_VENDOR_RE.test(String(x || '')) ? String(x) : '');
const nettoyer = (t) => String(t == null ? '' : t).replace(/\r\n?/g, '\n').trim();

function clePersonne(type, ligne) {
  const id = idDe(ligne.idClient);
  const vendor = type === 'vni' ? idVendorDe(ligne.contactId) : '';
  return id ? 'id:' + id : vendor ? 'vendor:' + vendor : 'nom:' + cleIdentite(ligne.client);
}

// ─── ÉCRITURE ───────────────────────────────────────────────────────────────
//  `ligne` vient du RAPPORT (la route la relit), jamais du navigateur.
//  `texte` vide ou identique à l'origine = retour à la version automatique.
function enregistrer(db, { mois, studio, type, ligne, texteAuto, texte, par = '' }, maintenant = new Date().toISOString()) {
  if (!MOIS_RE.test(String(mois || ''))) throw new Error('mois invalide');
  if (TYPES.indexOf(type) < 0) throw new Error('type : ' + TYPES.join(', '));
  const origine = nettoyer(texteAuto);
  if (!origine) throw new Error('remarque automatique d\'origine requise');
  const nouveau = nettoyer(texte);
  if (nouveau.length > LONGUEUR_MAX) throw new Error('remarque trop longue (' + LONGUEUR_MAX + ' caractères maximum)');
  const nom = cleIdentite(ligne && ligne.client);
  if (!nom) throw new Error('personne non identifiable');
  const cle = clePersonne(type, ligne);
  const qui = String(par || '').slice(0, 80);
  const retour = !nouveau || nouveau === origine;

  const ancienne = db.prepare(`SELECT texte FROM recap2_remarques_auto
    WHERE mois = ? AND studio = ? AND type = ? AND cle_personne = ? AND texte_auto = ?`).get(mois, studio, type, cle, origine);
  const avant = ancienne ? ancienne.texte : '';
  const apres = retour ? '' : nouveau;
  if (avant === apres) return versVersion(retour ? null : { texte: apres, modifie_le: maintenant, modifie_par: qui }, origine);

  db.transaction(() => {
    if (retour) {
      db.prepare(`DELETE FROM recap2_remarques_auto
        WHERE mois = ? AND studio = ? AND type = ? AND cle_personne = ? AND texte_auto = ?`).run(mois, studio, type, cle, origine);
    } else {
      db.prepare(`INSERT INTO recap2_remarques_auto
          (mois, studio, type, cle_personne, id_client, cle_nom, client, texte_auto, texte, modifie_le, modifie_par)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(mois, studio, type, cle_personne, texte_auto) DO UPDATE SET
          texte = excluded.texte, client = excluded.client, cle_nom = excluded.cle_nom,
          modifie_le = excluded.modifie_le, modifie_par = excluded.modifie_par`)
        .run(mois, studio, type, cle, idDe(ligne.idClient), nom, String(ligne.client || '').trim(), origine, nouveau, maintenant, qui);
    }
    db.prepare(`INSERT INTO recap2_remarques_auto_historique
        (mois, studio, type, cle_personne, client, texte_auto, avant, apres, le, par) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(mois, studio, type, cle, String(ligne.client || '').trim(), origine, avant, apres, maintenant, qui);
  })();
  return versVersion(retour ? null : { texte: nouveau, modifie_le: maintenant, modifie_par: qui }, origine);
}

function versVersion(r, origine) {
  return r ? { texteAuto: origine, texte: r.texte, modifieLe: r.modifie_le, modifiePar: r.modifie_par }
    : { texteAuto: origine, texte: '', modifieLe: '', modifiePar: '' };
}

function historique(db, mois) {
  return db.prepare('SELECT * FROM recap2_remarques_auto_historique WHERE mois = ? ORDER BY id').all(mois);
}

// ─── LECTURE ────────────────────────────────────────────────────────────────
function versionsDuMois(db, mois) {
  const idx = new Map(); // studio|type|cle_personne -> [lignes]
  // Auteur d'une personnalisation = qui l'a créée (depuis la version automatique).
  const auteurs = new Map();
  db.prepare("SELECT studio, type, cle_personne, texte_auto, par FROM recap2_remarques_auto_historique WHERE mois = ? AND avant = '' ORDER BY id").all(mois)
    .forEach((h) => { auteurs.set(h.studio + '|' + h.type + '|' + h.cle_personne + '|' + h.texte_auto, h.par); });
  db.prepare('SELECT * FROM recap2_remarques_auto WHERE mois = ?').all(mois).forEach((r) => {
    r.auteur = auteurs.get(r.studio + '|' + r.type + '|' + r.cle_personne + '|' + r.texte_auto) || r.modifie_par;
    const k = r.studio + '|' + r.type + '|' + r.cle_personne;
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push(r);
  });
  return idx;
}

// Pose `remarquesAuto` = { <texte d'origine>: { texte, modifieLe, modifiePar } }
// sur chaque ligne concernée. Copie profonde, aucun compteur touché.
function appliquer(rapport, index) {
  if (!rapport || !rapport.studios || !index || !index.size) return rapport;
  const copie = JSON.parse(JSON.stringify(rapport));
  Object.keys(copie.studios).forEach((s) => {
    const b = copie.studios[s] || {};
    [['vente', b.clientsRetrouves], ['vni', b.vni], ['non_reconduit', b.nonReconduction], ['suspension', b.suspensionsControle]].forEach(([type, bloc]) => {
      ((bloc && bloc.liste) || []).forEach((l) => {
        const rows = index.get(s + '|' + type + '|' + clePersonne(type, l));
        if (!rows || !rows.length) return;
        l.remarquesAuto = {};
        rows.forEach((r) => { l.remarquesAuto[r.texte_auto] = { texte: r.texte, modifieLe: r.modifie_le, modifiePar: r.modifie_par, auteur: r.auteur || r.modifie_par }; });
      });
    });
  });
  return copie;
}

module.exports = { SCHEMA, TYPES, LONGUEUR_MAX, creerTable, enregistrer, versionsDuMois, appliquer, historique, clePersonne };
