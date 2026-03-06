const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data.db');

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
      target_per_hour REAL NOT NULL DEFAULT 200,
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
}

function seed() {
  const reps = ['Marvin', 'Magali', 'Fabian'];
  const insertRep = db.prepare('INSERT OR IGNORE INTO sales_reps (name) VALUES (?)');
  for (const name of reps) {
    insertRep.run(name);
  }

  // Seed default PINs if not already set
  const defaultPins = { 'Marvin': '1111', 'Magali': '2222', 'Fabian': '3333' };
  const updatePin = db.prepare('UPDATE sales_reps SET pin = ? WHERE name = ? AND (pin IS NULL OR pin = \'\')');
  for (const [name, pin] of Object.entries(defaultPins)) {
    updatePin.run(pin, name);
  }
}

/**
 * Ensure weekly_settings rows exist for a given week_start for all reps.
 */
function ensureWeeklySettings(weekStart) {
  const reps = db.prepare('SELECT id FROM sales_reps').all();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO weekly_settings (sales_rep_id, week_start, hours_worked, target_per_hour)
    VALUES (?, ?, 0, 200)
  `);
  for (const rep of reps) {
    insert.run(rep.id, weekStart);
  }
}

module.exports = { getDb, ensureWeeklySettings };
