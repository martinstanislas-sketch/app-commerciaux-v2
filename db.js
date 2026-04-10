const Database = require('better-sqlite3');
const path = require('path');

// Store DB outside project dir to survive redeployments
const DB_DIR = process.env.DB_DIR || __dirname;
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
  // Migration: add hours_controlled column
  if (!cols.find(c => c.name === 'hours_controlled')) {
    db.exec("ALTER TABLE weekly_settings ADD COLUMN hours_controlled INTEGER NOT NULL DEFAULT 0");
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

  // Migration: add start_week column to sales_reps
  const repCols3 = db.prepare("PRAGMA table_info(sales_reps)").all();
  if (!repCols3.find(c => c.name === 'start_week')) {
    db.exec("ALTER TABLE sales_reps ADD COLUMN start_week TEXT DEFAULT NULL");
  }

  // Migration: add role column to sales_reps
  const repCols4 = db.prepare("PRAGMA table_info(sales_reps)").all();
  if (!repCols4.find(c => c.name === 'role')) {
    db.exec("ALTER TABLE sales_reps ADD COLUMN role TEXT NOT NULL DEFAULT 'commercial'");
  }

  // Migration: add archived column to sales_reps
  if (!repCols4.find(c => c.name === 'archived')) {
    db.exec("ALTER TABLE sales_reps ADD COLUMN archived INTEGER NOT NULL DEFAULT 0");
  }

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

  // Migration: add controlled column to sales
  if (!saleCols2.find(c => c.name === 'controlled')) {
    db.exec("ALTER TABLE sales ADD COLUMN controlled INTEGER NOT NULL DEFAULT 0");
  }

  // Migration: add validated column to sales (admin must validate before it counts in recap/dashboard)
  const saleCols4 = db.prepare("PRAGMA table_info(sales)").all();
  if (!saleCols4.find(c => c.name === 'validated')) {
    db.exec("ALTER TABLE sales ADD COLUMN validated INTEGER NOT NULL DEFAULT 1");
    // Existing sales are considered already validated
  }

  // Migration: add default_hours to sales_reps
  const repCols5 = db.prepare("PRAGMA table_info(sales_reps)").all();
  if (!repCols5.find(c => c.name === 'default_hours')) {
    db.exec("ALTER TABLE sales_reps ADD COLUMN default_hours REAL NOT NULL DEFAULT 0");
    // Set 20h default for Nathan, Hervé, Barnabé
    db.prepare("UPDATE sales_reps SET default_hours = 20 WHERE LOWER(name) IN ('nathan', 'hervé', 'barnabé', 'herve', 'barnabe')").run();
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

  // Table for action day remarks (admin notes per rep/day)
  db.exec(`
    CREATE TABLE IF NOT EXISTS action_day_remarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sales_rep_id INTEGER NOT NULL REFERENCES sales_reps(id),
      date TEXT NOT NULL,
      remark TEXT NOT NULL DEFAULT '',
      UNIQUE(sales_rep_id, date)
    );
  `);

  // Migration: add remark column to sales
  const saleCols3 = db.prepare("PRAGMA table_info(sales)").all();
  if (!saleCols3.find(c => c.name === 'remark')) {
    db.exec("ALTER TABLE sales ADD COLUMN remark TEXT DEFAULT ''");
  }

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

  // Table for admin notes ("Remarques")
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
  `);

  // ─── PERSO: Workout tracking (admin only) ──────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS perso_exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      muscle_group TEXT DEFAULT '',
      goal_charge REAL DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS perso_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      favorite INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS perso_template_exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL REFERENCES perso_templates(id) ON DELETE CASCADE,
      exercise_id INTEGER NOT NULL REFERENCES perso_exercises(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS perso_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      template_id INTEGER DEFAULT NULL REFERENCES perso_templates(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS perso_performances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES perso_sessions(id) ON DELETE CASCADE,
      exercise_id INTEGER NOT NULL REFERENCES perso_exercises(id),
      charge REAL NOT NULL DEFAULT 0,
      sets INTEGER NOT NULL DEFAULT 0,
      reps INTEGER NOT NULL DEFAULT 0,
      feeling TEXT NOT NULL DEFAULT 'moyen' CHECK(feeling IN ('facile','moyen','dur')),
      date TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS perso_daily (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      weight REAL DEFAULT NULL,
      energy INTEGER DEFAULT NULL CHECK(energy IS NULL OR (energy >= 1 AND energy <= 5))
    );

    CREATE INDEX IF NOT EXISTS idx_perso_perf_exercise ON perso_performances(exercise_id, date);
    CREATE INDEX IF NOT EXISTS idx_perso_perf_session ON perso_performances(session_id);
    CREATE INDEX IF NOT EXISTS idx_perso_sessions_date ON perso_sessions(date);
  `);

  // Migration: add sets_detail JSON column (per-set charge/reps support)
  const perfCols = db.prepare("PRAGMA table_info(perso_performances)").all();
  if (!perfCols.find(c => c.name === 'sets_detail')) {
    db.exec("ALTER TABLE perso_performances ADD COLUMN sets_detail TEXT DEFAULT NULL");
  }

  // ─── V2 PERSO MIGRATIONS ─────────────────────────────────────

  // perso_exercises: add body_part, exercise_type, target_sets, target_reps, default_rest_seconds
  const exCols = db.prepare("PRAGMA table_info(perso_exercises)").all();
  if (!exCols.find(c => c.name === 'video_url')) {
    db.exec("ALTER TABLE perso_exercises ADD COLUMN video_url TEXT DEFAULT NULL");
  }
  if (!exCols.find(c => c.name === 'body_part')) {
    db.exec("ALTER TABLE perso_exercises ADD COLUMN body_part TEXT NOT NULL DEFAULT 'upper'");
    db.exec("ALTER TABLE perso_exercises ADD COLUMN exercise_type TEXT NOT NULL DEFAULT 'compound'");
    db.exec("ALTER TABLE perso_exercises ADD COLUMN target_sets INTEGER NOT NULL DEFAULT 3");
    db.exec("ALTER TABLE perso_exercises ADD COLUMN target_reps INTEGER NOT NULL DEFAULT 10");
    db.exec("ALTER TABLE perso_exercises ADD COLUMN default_rest_seconds INTEGER NOT NULL DEFAULT 120");
  }

  // perso_sessions: add started_at, ended_at, status, notes, body_weight_kg, energy_level, name
  const sesCols = db.prepare("PRAGMA table_info(perso_sessions)").all();
  if (!sesCols.find(c => c.name === 'status')) {
    db.exec("ALTER TABLE perso_sessions ADD COLUMN started_at TEXT DEFAULT NULL");
    db.exec("ALTER TABLE perso_sessions ADD COLUMN ended_at TEXT DEFAULT NULL");
    db.exec("ALTER TABLE perso_sessions ADD COLUMN status TEXT NOT NULL DEFAULT 'in_progress'");
    db.exec("ALTER TABLE perso_sessions ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
    db.exec("ALTER TABLE perso_sessions ADD COLUMN body_weight_kg REAL DEFAULT NULL");
    db.exec("ALTER TABLE perso_sessions ADD COLUMN energy_level INTEGER DEFAULT NULL");
    db.exec("ALTER TABLE perso_sessions ADD COLUMN name TEXT NOT NULL DEFAULT ''");
  }

  // perso_performances (exercise_log): add notes
  if (!perfCols.find(c => c.name === 'notes')) {
    db.exec("ALTER TABLE perso_performances ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
  }

  // perso_set_logs: individual set tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS perso_set_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      performance_id INTEGER NOT NULL REFERENCES perso_performances(id) ON DELETE CASCADE,
      set_number INTEGER NOT NULL,
      weight_kg REAL DEFAULT NULL,
      reps INTEGER NOT NULL DEFAULT 0,
      rpe INTEGER DEFAULT NULL,
      rir INTEGER DEFAULT NULL,
      is_warmup INTEGER NOT NULL DEFAULT 0,
      is_pr INTEGER NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      rest_seconds INTEGER DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_set_logs_perf ON perso_set_logs(performance_id);
  `);

  // personal_records
  db.exec(`
    CREATE TABLE IF NOT EXISTS personal_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exercise_id INTEGER NOT NULL REFERENCES perso_exercises(id) ON DELETE CASCADE,
      record_type TEXT NOT NULL,
      value REAL NOT NULL,
      unit TEXT NOT NULL DEFAULT 'kg',
      achieved_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      session_id INTEGER DEFAULT NULL,
      set_log_id INTEGER DEFAULT NULL,
      previous_value REAL DEFAULT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pr_exercise ON personal_records(exercise_id, record_type);
  `);

  // ─── Data migration: convert old perso_performances to set_logs ────
  // If there are performances with data but no set_logs yet, migrate them
  const hasSets = db.prepare("SELECT COUNT(*) as cnt FROM perso_set_logs").get().cnt;
  if (hasSets === 0) {
    const oldPerfs = db.prepare(`
      SELECT id, charge, sets, reps, sets_detail FROM perso_performances
      WHERE charge > 0 OR reps > 0 OR sets_detail IS NOT NULL
    `).all();
    const insertSet = db.prepare(`
      INSERT INTO perso_set_logs (performance_id, set_number, weight_kg, reps, completed)
      VALUES (?, ?, ?, ?, 1)
    `);
    for (const p of oldPerfs) {
      let detail = null;
      if (p.sets_detail) {
        try { detail = JSON.parse(p.sets_detail); } catch {}
      }
      if (detail && Array.isArray(detail)) {
        detail.forEach((s, i) => {
          insertSet.run(p.id, i + 1, s.charge || 0, s.reps || 0);
        });
      } else if (p.sets > 0 || p.reps > 0) {
        const n = Math.max(p.sets || 1, 1);
        for (let i = 0; i < n; i++) {
          insertSet.run(p.id, i + 1, p.charge || 0, p.reps || 0);
        }
      }
    }
    if (oldPerfs.length > 0) {
      console.log(`[MIGRATION] Migrated ${oldPerfs.length} performances → perso_set_logs`);
    }
  }

  // perso_template_exercises: add target_sets, target_reps
  const tplExCols = db.prepare("PRAGMA table_info(perso_template_exercises)").all();
  if (!tplExCols.find(c => c.name === 'target_sets')) {
    db.exec("ALTER TABLE perso_template_exercises ADD COLUMN target_sets INTEGER NOT NULL DEFAULT 3");
    db.exec("ALTER TABLE perso_template_exercises ADD COLUMN target_reps INTEGER NOT NULL DEFAULT 10");
  }
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

  // ── Migration: rename old short names → full names (preserve data) ──
  const renameMap = {
    'Fabian': 'Fabian Fernez',
    'Magali': 'Magali Guyot',
    'Marvin': 'Marvin Boulligny'
  };
  const renameStmt = db.prepare('UPDATE sales_reps SET name = ? WHERE name = ? AND NOT EXISTS (SELECT 1 FROM sales_reps WHERE name = ?)');
  for (const [oldName, newName] of Object.entries(renameMap)) {
    renameStmt.run(newName, oldName, newName);
  }

  const insertRep = db.prepare('INSERT OR IGNORE INTO sales_reps (name) VALUES (?)');
  const updatePin = db.prepare('UPDATE sales_reps SET pin = ? WHERE name = ?');
  const updateRole = db.prepare('UPDATE sales_reps SET role = ? WHERE name = ?');
  const updateHours = db.prepare('UPDATE sales_reps SET default_hours = ? WHERE name = ?');

  // Insérer les commerciaux
  for (const name of names) {
    insertRep.run(name);
    updateRole.run('commercial', name);
  }

  // Phoneurs depuis .env
  const phoneurNamesEnv = process.env.PHONEUR_NAMES || '';
  const phoneurNames = phoneurNamesEnv.split(',').map(n => n.trim()).filter(Boolean);
  for (const name of phoneurNames) {
    insertRep.run(name);
  }
  for (const name of phoneurNames) {
    updateRole.run('phoneur', name);
  }

  // Archiver les anciens commerciaux/phoneurs qui ne sont plus dans la liste
  const allActive = [...names, ...phoneurNames];
  const archiveOld = db.prepare('UPDATE sales_reps SET archived = 1 WHERE name NOT IN (' + allActive.map(() => '?').join(',') + ') AND archived = 0');
  if (allActive.length > 0) archiveOld.run(...allActive);

  // ── Default hours par commercial ──
  const defaultHoursMap = {
    'Fabian Fernez': 27,
    'Cédric Haddou': 25,
    'Magali Guyot': 28,
    'Marvin Boulligny': 28,
    'Tony Carbon': 10,
    'Benjamin Constanty': 9,
    'Rachael Silva': 6,
    'Luca Roeloff': 6,
    'Tony Caen': 17,
    'Hervé Paris': 30,
    'Nathan': 24,
    'Barnabé': 17
  };
  for (const [name, hours] of Object.entries(defaultHoursMap)) {
    updateHours.run(hours, name);
  }

  // Générer et attribuer les PINs uniquement pour ceux qui n'en ont pas
  const allReps = db.prepare('SELECT id, name, pin FROM sales_reps WHERE archived = 0 ORDER BY id').all();
  const usedPins = allReps.filter(r => r.pin).map(r => r.pin);

  for (const rep of allReps) {
    if (rep.pin) continue;
    const pin = generatePin(rep.name, usedPins);
    usedPins.push(pin);
    updatePin.run(pin, rep.name);
  }

  // Refresh list to show current PINs
  const finalReps = db.prepare('SELECT name, pin, role, default_hours FROM sales_reps WHERE archived = 0 ORDER BY id').all();
  console.log(`[SEED] ${finalReps.length} utilisateurs — codes: ${finalReps.map(r => r.name + ':' + r.pin + ' (' + r.role + ', ' + r.default_hours + 'h)').join(', ')}`);
}

/**
 * Ensure weekly_settings rows exist for a given week_start for all reps.
 */
function ensureWeeklySettings(weekStart) {
  const reps = db.prepare("SELECT id, start_week, default_hours FROM sales_reps WHERE role != 'phoneur'").all();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO weekly_settings (sales_rep_id, week_start, hours_worked, target_per_hour)
    VALUES (?, ?, ?, 250)
  `);
  for (const rep of reps) {
    // Only include reps whose start_week is <= this week (or no start_week = always included)
    if (rep.start_week && rep.start_week > weekStart) continue;
    insert.run(rep.id, weekStart, rep.default_hours || 0);
  }
}

module.exports = { getDb, ensureWeeklySettings, generatePin };
