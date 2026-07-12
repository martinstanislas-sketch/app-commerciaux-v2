// ─── Base de données « Projets » ────────────────────────────
// App interne de gestion de projets, indépendante du reste.
// Base SQLite dédiée (projets.db) pour ne rien mélanger avec data.db.

const Database = require('better-sqlite3');
const path = require('path');

// Même logique que db.js : stocker hors du dossier projet si DB_DIR est fourni,
// pour survivre aux redéploiements.
const DB_DIR = process.env.DB_DIR || __dirname;
const DB_PATH = path.join(DB_DIR, 'projets.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'todo',       -- todo | doing | done
      priority TEXT NOT NULL DEFAULT 'medium',   -- low | medium | high
      color TEXT NOT NULL DEFAULT '#6366f1',
      due_date TEXT,                             -- YYYY-MM-DD ou NULL
      position INTEGER NOT NULL DEFAULT 0,       -- ordre dans la colonne
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      due_date TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status, archived);
  `);
}

module.exports = { getDb };
