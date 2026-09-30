'use strict';
// ============================================================================
//  BASE DE DONNÉES — SQLite local, propre à cette app.
//
//  Le schéma des tables `users`, `sessions` et `recipe_photos` est IDENTIQUE à
//  celui de nutrition-solo : la v2 peut donc être pointée (NUTRITION_DB) sur une
//  base existante sans migration. Les colonnes du code PIN (pin_hash, pin_fails,
//  bloque) sont conservées mais plus utilisées : la connexion se fait par lien
//  magique (table `magic_links`, seule table ajoutée).
// ============================================================================

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

let _db = null;

function dbPath() {
  return process.env.NUTRITION_DB || path.join(__dirname, '..', 'data', 'nutrition.sqlite');
}

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  email          TEXT PRIMARY KEY,
  prenom         TEXT NOT NULL DEFAULT '',
  pin_hash       TEXT,
  pin_fails      INTEGER NOT NULL DEFAULT 0,
  bloque         INTEGER NOT NULL DEFAULT 0,
  avatar_config  TEXT,
  profil         TEXT,               -- JSON : réponses du questionnaire
  preferences    TEXT,               -- JSON : goûts, allergies, contraintes
  plan           TEXT,               -- JSON : dernier plan généré
  plan_maj       TEXT,
  cree_le        TEXT NOT NULL,
  vu_le          TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token     TEXT PRIMARY KEY,
  email     TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  cree_le   TEXT NOT NULL,
  expire_le TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_email ON sessions(email);

-- Liens magiques : on ne stocke QUE l'empreinte SHA-256 du jeton. Une fuite de
-- la base ne permet donc pas de se connecter avec un lien encore valide.
CREATE TABLE IF NOT EXISTS magic_links (
  token_hash TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  cree_le    TEXT NOT NULL,
  expire_le  TEXT NOT NULL,
  utilise_le TEXT
);
CREATE INDEX IF NOT EXISTS idx_magic_email ON magic_links(email, cree_le);

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

function closeDb() {
  if (_db) { _db.close(); _db = null; }
}

const nowIso = () => new Date().toISOString();

function readJson(txt, fallback = null) {
  if (!txt) return fallback;
  try { return JSON.parse(txt); } catch (_) { return fallback; }
}

module.exports = { getDb, closeDb, dbPath, nowIso, readJson };
