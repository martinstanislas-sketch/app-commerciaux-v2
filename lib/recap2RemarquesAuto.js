'use strict';
// ============================================================================
//  RECAP 2 — LES REMARQUES AUTOMATIQUES PERSONNALISÉES À LA MAIN.
//
//  Les remarques automatiques (public/recap2-regles.js) sont CALCULÉES à la
//  lecture : rien n'est stocké, elles apparaissent et disparaissent avec le
//  problème. Ce module garde la seule chose qui doit vivre en base : la
//  VERSION PERSONNALISÉE qu'un administrateur a écrite à la place d'une
//  remarque automatique.
//
//  ⚠️ CLÉ STABLE (arbitrage du 18/09/2026) : mois (période analysée) · studio ·
//  type · DOSSIER (Recap2Regles.cleDossier : une vente = client + date de
//  signature ; un VNI = contact Vendor ; un non-reconduit = Id Deciplus) ·
//  IDENTIFIANT DE LA RÈGLE. Jamais le texte : une reformulation du registre ne
//  fait pas perdre la personnalisation, et une autre règle qui produirait la
//  même phrase ne la récupère pas. Si la règle cesse de s'appliquer (le point
//  est réglé), la version personnalisée cesse de s'afficher avec elle.
//
//  ⚠️ RÉVERSIBLE ET HISTORISÉ. « Revenir à la version automatique » supprime la
//  version courante ; chaque modification et chaque retour sont inscrits dans
//  recap2_remarques_perso_historique (avant, après, qui, quand) — jamais effacés.
//
//  L'ancienne table (recap2_remarques_auto, clé = texte) reste créée pour
//  l'historique : elle était vide en production au 18/09/2026, rien n'y est lu.
//
//  ⚠️ SANS EFFET SUR LES CALCULS : `appliquer()` pose `remarquesPerso` sur les
//  lignes ; aucun compteur, aucun statut n'est touché.
// ============================================================================

const Regles = require('../public/recap2-regles.js');

const MOIS_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
// Les listes qui portent des remarques automatiques, et leur bloc dans le rapport.
const TYPES = ['vente', 'vni', 'non_reconduit', 'suspension'];
const BLOCS = { vente: 'clientsRetrouves', vni: 'vni', non_reconduit: 'nonReconduction', suspension: 'suspensionsControle' };
const LONGUEUR_MAX = 1000;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS recap2_remarques_auto (
    mois TEXT NOT NULL, studio TEXT NOT NULL, type TEXT NOT NULL, cle_personne TEXT NOT NULL,
    id_client TEXT NOT NULL DEFAULT '', cle_nom TEXT NOT NULL DEFAULT '', client TEXT NOT NULL DEFAULT '',
    texte_auto TEXT NOT NULL, texte TEXT NOT NULL, modifie_le TEXT NOT NULL, modifie_par TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (mois, studio, type, cle_personne, texte_auto)
  );
  CREATE TABLE IF NOT EXISTS recap2_remarques_auto_historique (
    id INTEGER PRIMARY KEY AUTOINCREMENT, mois TEXT NOT NULL, studio TEXT NOT NULL, type TEXT NOT NULL,
    cle_personne TEXT NOT NULL, client TEXT NOT NULL DEFAULT '', texte_auto TEXT NOT NULL,
    avant TEXT NOT NULL DEFAULT '', apres TEXT NOT NULL DEFAULT '', le TEXT NOT NULL, par TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS recap2_remarques_perso (
    mois          TEXT NOT NULL,             -- période analysée
    studio        TEXT NOT NULL,
    type          TEXT NOT NULL,             -- vente | vni | non_reconduit | suspension
    cle_dossier   TEXT NOT NULL,             -- Recap2Regles.cleDossier
    regle         TEXT NOT NULL,             -- identifiant stable de la règle (registre)
    client        TEXT NOT NULL DEFAULT '',
    texte_auto    TEXT NOT NULL DEFAULT '',  -- la remarque automatique au moment de la personnalisation (information)
    texte         TEXT NOT NULL,             -- la version personnalisée affichée
    modifie_le    TEXT NOT NULL,
    modifie_par   TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (mois, studio, type, cle_dossier, regle)
  );
  CREATE INDEX IF NOT EXISTS idx_recap2_remarques_perso_mois ON recap2_remarques_perso (mois);
  CREATE TABLE IF NOT EXISTS recap2_remarques_perso_historique (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    mois          TEXT NOT NULL,
    studio        TEXT NOT NULL,
    type          TEXT NOT NULL,
    cle_dossier   TEXT NOT NULL,
    regle         TEXT NOT NULL,
    client        TEXT NOT NULL DEFAULT '',
    texte_auto    TEXT NOT NULL DEFAULT '',
    avant         TEXT NOT NULL DEFAULT '',  -- '' = la version automatique
    apres         TEXT NOT NULL DEFAULT '',  -- '' = retour à la version automatique
    le            TEXT NOT NULL,
    par           TEXT NOT NULL DEFAULT ''
  );
`;

function creerTable(db) { db.exec(SCHEMA); }

// Le texte enregistré ne porte jamais le préfixe : l'écran et les copies
// l'ajoutent exactement une fois (Recap2Regles.enAction).
const nettoyer = (t) => Regles.sansPrefixe(String(t == null ? '' : t).replace(/\r\n?/g, '\n'));

// ─── ÉCRITURE ───────────────────────────────────────────────────────────────
//  `ligne` vient du RAPPORT servi (la route la relit), jamais du navigateur.
//  `texte` vide ou identique à la version automatique = retour à l'automatique.
function enregistrer(db, { mois, studio, type, ligne, regle, texteAuto = '', texte, par = '' }, maintenant = new Date().toISOString()) {
  if (!MOIS_RE.test(String(mois || ''))) throw new Error('mois invalide');
  if (TYPES.indexOf(type) < 0) throw new Error('type : ' + TYPES.join(', '));
  const r = Regles.PAR_ID[regle];
  if (!r || r.nature !== 'action' || !r.modifiable) throw new Error('règle non personnalisable');
  const nouveau = nettoyer(texte);
  if (nouveau.length > LONGUEUR_MAX) throw new Error('remarque trop longue (' + LONGUEUR_MAX + ' caractères maximum)');
  const cle = Regles.cleDossier(type, ligne || {});
  if (!Regles.cleIdentite(ligne && ligne.client)) throw new Error('personne non identifiable');
  const origine = nettoyer(texteAuto);
  const qui = String(par || '').slice(0, 80);
  const retour = !nouveau || nouveau === origine;

  const ancienne = db.prepare(`SELECT texte FROM recap2_remarques_perso
    WHERE mois = ? AND studio = ? AND type = ? AND cle_dossier = ? AND regle = ?`).get(mois, studio, type, cle, regle);
  const avant = ancienne ? ancienne.texte : '';
  const apres = retour ? '' : nouveau;
  if (avant === apres) return versVersion(retour ? null : { texte: apres, modifie_le: maintenant, modifie_par: qui }, regle);

  db.transaction(() => {
    if (retour) {
      db.prepare(`DELETE FROM recap2_remarques_perso
        WHERE mois = ? AND studio = ? AND type = ? AND cle_dossier = ? AND regle = ?`).run(mois, studio, type, cle, regle);
    } else {
      db.prepare(`INSERT INTO recap2_remarques_perso
          (mois, studio, type, cle_dossier, regle, client, texte_auto, texte, modifie_le, modifie_par)
          VALUES (?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(mois, studio, type, cle_dossier, regle) DO UPDATE SET
          texte = excluded.texte, client = excluded.client, texte_auto = excluded.texte_auto,
          modifie_le = excluded.modifie_le, modifie_par = excluded.modifie_par`)
        .run(mois, studio, type, cle, regle, String(ligne.client || '').trim(), origine, nouveau, maintenant, qui);
    }
    db.prepare(`INSERT INTO recap2_remarques_perso_historique
        (mois, studio, type, cle_dossier, regle, client, texte_auto, avant, apres, le, par) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(mois, studio, type, cle, regle, String(ligne.client || '').trim(), origine, avant, apres, maintenant, qui);
  })();
  return versVersion(retour ? null : { texte: nouveau, modifie_le: maintenant, modifie_par: qui }, regle);
}

function versVersion(r, regle) {
  return r ? { regle, texte: r.texte, modifieLe: r.modifie_le, modifiePar: r.modifie_par }
    : { regle, texte: '', modifieLe: '', modifiePar: '' };
}

function historique(db, mois) {
  return db.prepare('SELECT * FROM recap2_remarques_perso_historique WHERE mois = ? ORDER BY id').all(mois);
}

// ─── LECTURE ────────────────────────────────────────────────────────────────
function versionsDuMois(db, mois) {
  const idx = new Map(); // studio|type|cle_dossier -> { regle: {...} }
  // Auteur = qui a créé la personnalisation (depuis la version automatique).
  const auteurs = new Map();
  db.prepare("SELECT studio, type, cle_dossier, regle, par FROM recap2_remarques_perso_historique WHERE mois = ? AND avant = '' ORDER BY id").all(mois)
    .forEach((h) => { auteurs.set([h.studio, h.type, h.cle_dossier, h.regle].join('|'), h.par); });
  db.prepare('SELECT * FROM recap2_remarques_perso WHERE mois = ?').all(mois).forEach((r) => {
    const k = [r.studio, r.type, r.cle_dossier].join('|');
    if (!idx.has(k)) idx.set(k, {});
    idx.get(k)[r.regle] = { texte: r.texte, modifieLe: r.modifie_le, modifiePar: r.modifie_par,
      auteur: auteurs.get([r.studio, r.type, r.cle_dossier, r.regle].join('|')) || r.modifie_par };
  });
  return idx;
}

// Pose `remarquesPerso` = { <id de règle>: { texte, modifieLe, modifiePar, auteur } }
// sur chaque ligne concernée. Copie profonde, aucun compteur touché.
function appliquer(rapport, index) {
  if (!rapport || !rapport.studios || !index || !index.size) return rapport;
  const copie = JSON.parse(JSON.stringify(rapport));
  Object.keys(copie.studios).forEach((s) => {
    const b = copie.studios[s] || {};
    TYPES.forEach((type) => {
      ((b[BLOCS[type]] && b[BLOCS[type]].liste) || []).forEach((l) => {
        const v = index.get([s, type, Regles.cleDossier(type, l)].join('|'));
        if (v) l.remarquesPerso = Object.assign({}, v);
      });
    });
  });
  return copie;
}

module.exports = { SCHEMA, TYPES, BLOCS, LONGUEUR_MAX, creerTable, enregistrer, versionsDuMois, appliquer, historique };
