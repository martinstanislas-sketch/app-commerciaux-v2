const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Store DB outside project dir to survive redeployments
const DB_DIR = process.env.DB_PATH || __dirname;
// Ensure directory exists
if (!fs.existsSync(DB_DIR)) { fs.mkdirSync(DB_DIR, { recursive: true }); }
const DB_PATH = path.join(DB_DIR, 'data.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
    seed();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sales_reps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS weekly_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sales_rep_id INTEGER NOT NULL REFERENCES sales_reps(id),
      week_start TEXT NOT NULL,
      hours_worked REAL NOT NULL DEFAULT 0,
      target_per_hour REAL NOT NULL DEFAULT 250,
      locked INTEGER NOT NULL DEFAULT 0,
      UNIQUE(sales_rep_id, week_start)
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sales_rep_id INTEGER NOT NULL REFERENCES sales_reps(id),
      date TEXT NOT NULL,
      amount REAL NOT NULL,
      client_first_name TEXT NOT NULL DEFAULT '',
      client_last_name TEXT NOT NULL DEFAULT '',
      week_start TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sales_week_rep ON sales(week_start, sales_rep_id);
    CREATE INDEX IF NOT EXISTS idx_weekly_settings_week ON weekly_settings(week_start, sales_rep_id);
  `);

  // Migration: add transcript column if missing
  const cols = db.prepare("PRAGMA table_info(weekly_settings)").all();
  if (!cols.find(c => c.name === 'transcript')) {
    db.exec("ALTER TABLE weekly_settings ADD COLUMN transcript TEXT NOT NULL DEFAULT ''");
  }

  // Migration: add external_id column to sales_reps if missing
  const repCols = db.prepare("PRAGMA table_info(sales_reps)").all();
  if (!repCols.find(c => c.name === 'external_id')) {
    db.exec("ALTER TABLE sales_reps ADD COLUMN external_id TEXT DEFAULT NULL");
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_reps_external_id ON sales_reps(external_id) WHERE external_id IS NOT NULL");
  }

  // Migration: add rib_status column to sales if missing
  const saleCols = db.prepare("PRAGMA table_info(sales)").all();
  if (!saleCols.find(c => c.name === 'rib_status')) {
    db.exec("ALTER TABLE sales ADD COLUMN rib_status TEXT NOT NULL DEFAULT 'Non fourni'");
  }

  // Migration: add pin column to sales_reps if missing
  const repCols2 = db.prepare("PRAGMA table_info(sales_reps)").all();
  if (!repCols2.find(c => c.name === 'pin')) {
    db.exec("ALTER TABLE sales_reps ADD COLUMN pin TEXT DEFAULT NULL");
  }

  // Migration: update default target_per_hour from 200 to 300 (one-time)
  // Only apply for rows that still have the old default AND have no sales data
  const migrationDone = db.prepare("PRAGMA table_info(weekly_settings)").all();
  // Use a flag approach: only run if there are rows with exactly 200
  // This was a one-time migration, keeping as no-op comment for history

  // Migration: add client_email to sales if missing
  const saleCols2 = db.prepare("PRAGMA table_info(sales)").all();
  if (!saleCols2.find(c => c.name === 'client_email')) {
    db.exec("ALTER TABLE sales ADD COLUMN client_email TEXT DEFAULT ''");
  }

  // Migration: add relance tracking columns to sales
  if (!saleCols2.find(c => c.name === 'r1_sent')) {
    db.exec("ALTER TABLE sales ADD COLUMN r1_sent TEXT DEFAULT NULL");
    db.exec("ALTER TABLE sales ADD COLUMN r2_sent TEXT DEFAULT NULL");
    db.exec("ALTER TABLE sales ADD COLUMN r3_sent TEXT DEFAULT NULL");
  }

  // Table for chat-style transcript messages
  db.exec(`
    CREATE TABLE IF NOT EXISTS transcript_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sales_rep_id INTEGER NOT NULL REFERENCES sales_reps(id),
      week_start TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_transcript_messages_week_rep ON transcript_messages(week_start, sales_rep_id);
  `);

  // Tables for daily action tracking ("Aujourd'hui")
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_action_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sales_rep_id INTEGER NOT NULL REFERENCES sales_reps(id),
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('counter', 'yesno')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS daily_action_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sales_rep_id INTEGER NOT NULL REFERENCES sales_reps(id),
      action_key TEXT NOT NULL,
      date TEXT NOT NULL,
      value REAL NOT NULL DEFAULT 0,
      UNIQUE(sales_rep_id, action_key, date)
    );
  `);
}

/**
 * Génère un code PIN à partir du prénom : 4 premières lettres en minuscule.
 * Si doublon, ajoute un chiffre incrémental (ex: marv, marv2, marv3).
 */
function generatePin(name, existingPins) {
  const base = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 4);
  if (!existingPins.includes(base)) return base;
  let i = 2;
  while (existingPins.includes(base + i)) i++;
  return base + i;
}

function seed() {
  // Liste des commerciaux depuis .env (noms uniquement, PINs auto-générés)
  const namesEnv = process.env.COMMERCIAL_NAMES || '';
  const names = namesEnv.split(',').map(n => n.trim()).filter(Boolean);

  if (names.length === 0) {
    console.warn('[SEED] COMMERCIAL_NAMES non défini dans .env — aucun commercial créé');
    return;
  }

  const insertRep = db.prepare('INSERT OR IGNORE INTO sales_reps (name) VALUES (?)');
  const updatePin = db.prepare('UPDATE sales_reps SET pin = ? WHERE name = ?');

  // Insérer les commerciaux
  for (const name of names) {
    insertRep.run(name);
  }

  // Générer et attribuer les PINs uniquement pour les commerciaux qui n'en ont pas
  const allReps = db.prepare('SELECT id, name, pin FROM sales_reps ORDER BY id').all();
  const usedPins = allReps.filter(r => r.pin).map(r => r.pin);

  for (const rep of allReps) {
    if (rep.pin) continue; // Ne pas écraser un PIN existant
    const pin = generatePin(rep.name, usedPins);
    usedPins.push(pin);
    updatePin.run(pin, rep.name);
  }

  // Refresh list to show current PINs
  const finalReps = db.prepare('SELECT name, pin FROM sales_reps ORDER BY id').all();
  console.log(`[SEED] ${finalReps.length} commerciaux — codes: ${finalReps.map(r => r.name + ':' + r.pin).join(', ')}`);
}

/**
 * Ensure weekly_settings rows exist for a given week_start for all reps.
 */
function ensureWeeklySettings(weekStart) {
  const reps = db.prepare('SELECT id FROM sales_reps').all();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO weekly_settings (sales_rep_id, week_start, hours_worked, target_per_hour)
    VALUES (?, ?, 0, 250)
  `);
  for (const rep of reps) {
    insert.run(rep.id, weekStart);
  }
}

module.exports = { getDb, ensureWeeklySettings, generatePin };
