'use strict';
// ============================================================================
//  BASE DE DONNÉES — SQLite local, propre à cette app.
//
//  Différence de fond avec l'app Protocole 42 : ici il n'y a NI coach, NI groupe,
//  NI cohorte. Un compte n'appartient à personne d'autre qu'à son propriétaire,
//  et aucune table ne relie deux comptes entre eux. C'est ce qui permet de servir
//  le grand public sans jamais avoir à cloisonner des groupes.
//
//  Un seul fichier `.sqlite`, créé au premier démarrage. Le chemin est réglable
//  par NUTRITION_DB (utile pour les tests, qui pointent sur un fichier jetable).
//
//  Les BLOB (photos de progression, photos d'assiette) sont stockés EN BASE et
//  jamais sur disque : une photo corporelle ne doit pas se retrouver dans un
//  dossier statique servi par Express — une URL devinée suffirait à la lire.
// ============================================================================

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

let _db = null;

function dbPath() {
  return process.env.NUTRITION_DB || path.join(__dirname, '..', 'data', 'nutrition.sqlite');
}

// Schéma. Chaque instruction est idempotente : le démarrage rejoue tout le bloc
// sans condition, ce qui fait office de migration tant que le schéma ne fait que
// s'étendre (ajout de table / d'index). Un vrai changement de colonne exigerait
// une migration explicite — il n'y en a pas encore.
const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Comptes. L'email est la clé fonctionnelle (le front l'utilise partout).
CREATE TABLE IF NOT EXISTS users (
  email          TEXT PRIMARY KEY,
  prenom         TEXT NOT NULL DEFAULT '',
  pin_hash       TEXT,
  pin_fails      INTEGER NOT NULL DEFAULT 0,
  bloque         INTEGER NOT NULL DEFAULT 0,
  avatar_config  TEXT,
  profil         TEXT,               -- JSON : réponses de l'onboarding
  preferences    TEXT,               -- JSON : goûts, allergies, contraintes
  plan           TEXT,               -- JSON : dernier plan généré
  plan_maj       TEXT,
  cree_le        TEXT NOT NULL,
  vu_le          TEXT
);

-- Sessions : un jeton opaque par connexion. Pas de JWT — rien à signer, rien à
-- révoquer à distance : supprimer la ligne suffit à déconnecter.
CREATE TABLE IF NOT EXISTS sessions (
  token     TEXT PRIMARY KEY,
  email     TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  cree_le   TEXT NOT NULL,
  expire_le TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_email ON sessions(email);

-- Pesées. Libres : aucune notion de jalon imposé (c'était propre au 6 semaines).
CREATE TABLE IF NOT EXISTS pesees (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  email        TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  date         TEXT NOT NULL,        -- AAAA-MM-JJ
  poids        REAL NOT NULL,
  masse_grasse REAL,
  commentaire  TEXT,
  cree_le      TEXT NOT NULL,
  UNIQUE(email, date)                -- une pesée par jour : la dernière écrase
);
CREATE INDEX IF NOT EXISTS idx_pesees_email_date ON pesees(email, date);

CREATE TABLE IF NOT EXISTS mensurations (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  email    TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  date     TEXT NOT NULL,
  taille   REAL, hanches REAL, poitrine REAL, bras REAL, cuisse REAL,
  cree_le  TEXT NOT NULL,
  UNIQUE(email, date)
);
CREATE INDEX IF NOT EXISTS idx_mensurations_email_date ON mensurations(email, date);

-- Photos de progression : le contenu vit en base (cf. en-tête).
CREATE TABLE IF NOT EXISTS photos (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  email   TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  date    TEXT NOT NULL,
  type    TEXT NOT NULL DEFAULT 'libre',   -- face | profil | dos | libre
  mime    TEXT NOT NULL,
  data    BLOB NOT NULL,
  cree_le TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_photos_email ON photos(email, date);

-- Adhérence : une ligne par jour, écrasée à chaque renvoi (le front est maître).
CREATE TABLE IF NOT EXISTS adherence (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  email   TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  date    TEXT NOT NULL,
  suivi   INTEGER NOT NULL DEFAULT 0,
  adapte  INTEGER NOT NULL DEFAULT 0,
  autre   INTEGER NOT NULL DEFAULT 0,
  saute   INTEGER NOT NULL DEFAULT 0,
  score   INTEGER NOT NULL DEFAULT 0,
  maj_le  TEXT NOT NULL,
  UNIQUE(email, date)
);
CREATE INDEX IF NOT EXISTS idx_adherence_email_date ON adherence(email, date);

-- Historique des produits scannés (code-barres).
CREATE TABLE IF NOT EXISTS scans (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  email    TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  code     TEXT,
  nom      TEXT,
  marque   TEXT,
  produit  TEXT,                     -- JSON complet renvoyé par Open Food Facts
  verdict  TEXT,
  cree_le  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scans_email ON scans(email, cree_le);

-- Analyses d'assiette (photo + estimation IA).
CREATE TABLE IF NOT EXISTS plate_analyses (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  email   TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  analyse TEXT NOT NULL,             -- JSON
  mime    TEXT,
  image   BLOB,
  cree_le TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plate_email ON plate_analyses(email, cree_le);

-- Réponses préenregistrées du coach (base éditable, sert le SOS coach gratuit).
-- La colonne mots_cles est ce sur quoi le moteur de correspondance travaille :
-- une liste de formulations séparées par des virgules, pas un simple mot.
CREATE TABLE IF NOT EXISTS coach_faq (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  question  TEXT NOT NULL,
  reponse   TEXT NOT NULL,
  mots_cles TEXT NOT NULL DEFAULT '',
  categorie TEXT NOT NULL DEFAULT '',
  ordre     INTEGER NOT NULL DEFAULT 0,
  actif     INTEGER NOT NULL DEFAULT 1,
  maj_le    TEXT NOT NULL
);

-- Photos illustrant les recettes. Le catalogue n'en porte pas : elles sont
-- ajoutées ici par l'administrateur. Table vide = recettes sans visuel, et le
-- front retire l'<img> tout seul.
CREATE TABLE IF NOT EXISTS recipe_photos (
  recipe_id  TEXT PRIMARY KEY,
  mime       TEXT NOT NULL,
  data       BLOB NOT NULL,
  updated_at TEXT NOT NULL
);
`;

function getDb() {
  if (_db) return _db;
  const file = dbPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  _db = new Database(file);
  _db.exec(SCHEMA);
  return _db;
}

// Fermeture explicite : les tests ouvrent et referment des bases jetables.
function closeDb() {
  if (_db) { _db.close(); _db = null; }
}

const nowIso = () => new Date().toISOString();

// JSON tolérant : une colonne illisible ne doit jamais faire tomber une route.
function readJson(txt, fallback = null) {
  if (!txt) return fallback;
  try { return JSON.parse(txt); } catch (_) { return fallback; }
}

module.exports = { getDb, closeDb, dbPath, nowIso, readJson };
