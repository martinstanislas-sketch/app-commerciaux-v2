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
    migrateCommercialTargetDefault();
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

  // superset_group for paired exercises (agonist/antagonist)
  const teCols = db.prepare("PRAGMA table_info(perso_template_exercises)").all();
  if (!teCols.find(c => c.name === 'superset_group')) {
    db.exec("ALTER TABLE perso_template_exercises ADD COLUMN superset_group TEXT DEFAULT NULL");
  }
  if (!perfCols.find(c => c.name === 'superset_group')) {
    db.exec("ALTER TABLE perso_performances ADD COLUMN superset_group TEXT DEFAULT NULL");
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

  // ─── App settings (key-value store) ─────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
  `);
  // Seed admin_pin if missing (uses env var as initial value, default 'ginkgo')
  const adminPinRow = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('admin_pin');
  if (!adminPinRow) {
    const initialPin = process.env.ADMIN_PIN || 'ginkgo';
    db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run('admin_pin', initialPin);
  }

  // ─── Task Vault: Kanban board ───────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_columns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#6366F1',
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      column_id INTEGER NOT NULL REFERENCES task_columns(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      highlighted INTEGER NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_column ON tasks(column_id, position);
  `);
  // Migration: add parent_id column to tasks if missing (for sub-tasks)
  const taskCols = db.prepare("PRAGMA table_info(tasks)").all().map(c => c.name);
  if (!taskCols.includes('parent_id')) {
    db.exec(`ALTER TABLE tasks ADD COLUMN parent_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE;`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id, position);`);
  }
  // Migration: Phase 2 fields (due, description, tags)
  if (!taskCols.includes('due')) {
    db.exec(`ALTER TABLE tasks ADD COLUMN due TEXT;`);
  }
  if (!taskCols.includes('description')) {
    db.exec(`ALTER TABLE tasks ADD COLUMN description TEXT;`);
  }
  if (!taskCols.includes('tags')) {
    db.exec(`ALTER TABLE tasks ADD COLUMN tags TEXT;`); // JSON array string
  }
  // Migration: ownership fields (created_by, assigned_to)
  // Format: "admin" for admin user, "rep:<id>" for sales rep
  if (!taskCols.includes('created_by')) {
    db.exec(`ALTER TABLE tasks ADD COLUMN created_by TEXT;`);
    // Set existing tasks to admin (they were created before isolation existed)
    db.exec(`UPDATE tasks SET created_by = 'admin' WHERE created_by IS NULL;`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by);`);
  }
  if (!taskCols.includes('assigned_to')) {
    db.exec(`ALTER TABLE tasks ADD COLUMN assigned_to TEXT;`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);`);
  }
  // Same scoping for task_columns (each user has their own columns)
  const colCols2 = db.prepare("PRAGMA table_info(task_columns)").all().map(c => c.name);
  if (!colCols2.includes('created_by')) {
    db.exec(`ALTER TABLE task_columns ADD COLUMN created_by TEXT;`);
    db.exec(`UPDATE task_columns SET created_by = 'admin' WHERE created_by IS NULL;`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_cols_created_by ON task_columns(created_by);`);
  }
  // Seed default columns if empty
  const colCount = db.prepare('SELECT COUNT(*) AS c FROM task_columns').get().c;
  if (colCount === 0) {
    const insertCol = db.prepare('INSERT INTO task_columns (name, color, position) VALUES (?, ?, ?)');
    insertCol.run('Demain', '#6366F1', 0);
    insertCol.run('En attente', '#EC4899', 1);
  }

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
    'Marvin': 'Marvin Boulligny',
    'Nathan': 'Nathan Tours',
    'Barnabé': 'Barnabé Caen',
    'Rachael Silva': 'Raphael Silva'
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
    'Raphael Silva': 6,
    'Luca Roeloff': 6,
    'Tony Caen': 17,
    'Hervé Paris': 30,
    'Nathan Tours': 24,
    'Barnabé Caen': 17
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
/**
 * One-time migration: switch commercial weekly settings from old default 250 → 300
 * Only runs once (marked via a flag in a no-op table).
 */
function migrateCommercialTargetDefault() {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS _migrations (key TEXT PRIMARY KEY, applied_at TEXT)`);
    const done = db.prepare("SELECT 1 FROM _migrations WHERE key = ?").get('commercial_target_300');
    if (done) return;
    const r = db.prepare(`
      UPDATE weekly_settings
      SET target_per_hour = 300
      WHERE target_per_hour = 250
        AND sales_rep_id IN (SELECT id FROM sales_reps WHERE role = 'commercial')
    `).run();
    db.prepare("INSERT INTO _migrations (key, applied_at) VALUES (?, datetime('now'))").run('commercial_target_300');
    console.log(`Migration commercial_target_300: ${r.changes} ligne(s) mises à jour`);
  } catch (e) {
    console.error('Migration commercial_target_300 échec:', e.message);
  }
}

function ensureWeeklySettings(weekStart) {
  const reps = db.prepare("SELECT id, start_week, default_hours, role FROM sales_reps WHERE role != 'phoneur'").all();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO weekly_settings (sales_rep_id, week_start, hours_worked, target_per_hour)
    VALUES (?, ?, ?, ?)
  `);
  for (const rep of reps) {
    // Only include reps whose start_week is <= this week (or no start_week = always included)
    if (rep.start_week && rep.start_week > weekStart) continue;
    // Commercial role: default hours=0 and target=300
    const hours = rep.role === 'commercial' ? 0 : (rep.default_hours || 0);
    const target = rep.role === 'commercial' ? 300 : 250;
    insert.run(rep.id, weekStart, hours, target);
  }
}

// ═══════════════════════════════════════════════════════════════
// MODULE COACH — schéma des tables importées de l'app coaching
// Préfixes appliqués où conflit avec les tables Commerciaux:
//   COACH.daily_action_values → coach_daily_action_values
//   COACH.admin_notes         → coach_admin_notes
//   COACH.sessions            → coach_sessions (en plus de la session en mémoire)
// ═══════════════════════════════════════════════════════════════
function initCoachSchema() {
  const d = getDb();
  d.exec(`
    -- Coaches (utilisateurs côté coaching)
    CREATE TABLE IF NOT EXISTS coaches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      pin TEXT DEFAULT NULL,
      role TEXT NOT NULL DEFAULT 'coach',
      studio TEXT DEFAULT '',
      start_month TEXT DEFAULT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      is_leader INTEGER NOT NULL DEFAULT 0,
      in_accompagnement INTEGER NOT NULL DEFAULT 0
    );

    -- Sessions persistantes côté coaching (en plus du Map mémoire admin)
    CREATE TABLE IF NOT EXISTS coach_sessions (
      token TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      name TEXT NOT NULL,
      coach_id INTEGER,
      is_leader INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- Données mensuelles par coach
    CREATE TABLE IF NOT EXISTS monthly_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coach_id INTEGER NOT NULL REFERENCES coaches(id),
      month TEXT NOT NULL,
      taux_resiliation REAL DEFAULT NULL,
      taux_non_frequentants REAL DEFAULT NULL,
      nb_adherents INTEGER DEFAULT NULL,
      commentaire_manager TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      chiffre_affaires REAL DEFAULT NULL,
      nouveaux_clients INTEGER DEFAULT NULL,
      taux_occupation REAL DEFAULT NULL,
      taux_contribution REAL DEFAULT NULL,
      depenses REAL DEFAULT NULL,
      les_sa TEXT DEFAULT '',
      UNIQUE(coach_id, month)
    );

    -- Membres résiliés
    CREATE TABLE IF NOT EXISTS resiliation_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coach_id INTEGER NOT NULL REFERENCES coaches(id),
      month TEXT NOT NULL,
      member_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Membres non-fréquentants
    CREATE TABLE IF NOT EXISTS non_frequentant_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coach_id INTEGER NOT NULL REFERENCES coaches(id),
      month TEXT NOT NULL,
      member_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Nouveaux clients
    CREATE TABLE IF NOT EXISTS nouveaux_clients_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coach_id INTEGER NOT NULL REFERENCES coaches(id),
      month TEXT NOT NULL,
      member_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Compteurs journaliers côté coach (renommé pour éviter conflit avec daily_action_values commerciaux)
    CREATE TABLE IF NOT EXISTS coach_daily_action_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coach_id INTEGER NOT NULL REFERENCES coaches(id),
      action_key TEXT NOT NULL,
      date TEXT NOT NULL,
      value REAL NOT NULL DEFAULT 0,
      text_value TEXT DEFAULT '',
      UNIQUE(coach_id, action_key, date)
    );
    CREATE INDEX IF NOT EXISTS idx_coach_daily_values_coach_date ON coach_daily_action_values(coach_id, date);

    -- Messages communauté
    CREATE TABLE IF NOT EXISTS community_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coach_id INTEGER NOT NULL REFERENCES coaches(id),
      type TEXT NOT NULL DEFAULT 'text',
      content TEXT DEFAULT '',
      audio_data TEXT DEFAULT NULL,
      audio_duration REAL DEFAULT NULL,
      is_cr INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      target_club TEXT DEFAULT NULL,
      is_system INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_community_created ON community_messages(created_at DESC);

    -- Likes
    CREATE TABLE IF NOT EXISTS message_likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      coach_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      UNIQUE(message_id, coach_id)
    );
    CREATE INDEX IF NOT EXISTS idx_likes_message ON message_likes(message_id);

    -- Formations
    CREATE TABLE IF NOT EXISTS formations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'onboarding',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      description TEXT DEFAULT '',
      video_url TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0
    );

    -- Validations formations
    CREATE TABLE IF NOT EXISTS formation_validations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      formation_id INTEGER NOT NULL,
      coach_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      validated_at TEXT DEFAULT NULL,
      comment TEXT DEFAULT NULL,
      UNIQUE(formation_id, coach_id)
    );

    -- Calendrier formations
    CREATE TABLE IF NOT EXISTS formation_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      event_date TEXT NOT NULL,
      studio TEXT DEFAULT NULL,
      notes TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_formation_events_date ON formation_events(event_date);

    -- Quiz
    CREATE TABLE IF NOT EXISTS quiz_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      formation_id INTEGER NOT NULL,
      question TEXT NOT NULL,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      option_c TEXT NOT NULL,
      option_d TEXT NOT NULL,
      correct_answer TEXT NOT NULL DEFAULT 'a',
      explanation TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS quiz_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      formation_id INTEGER NOT NULL,
      coach_id INTEGER NOT NULL,
      score INTEGER NOT NULL,
      total INTEGER NOT NULL,
      passed INTEGER NOT NULL DEFAULT 0,
      taken_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Objectifs CA
    CREATE TABLE IF NOT EXISTS ca_objectifs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      club TEXT NOT NULL,
      month TEXT NOT NULL,
      objectif REAL NOT NULL,
      objectif_min REAL DEFAULT NULL,
      UNIQUE(club, month)
    );

    -- Action quotidienne par studio
    CREATE TABLE IF NOT EXISTS club_daily_action (
      studio TEXT PRIMARY KEY,
      action_text TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- XP & Gamification
    CREATE TABLE IF NOT EXISTS xp_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coach_id INTEGER NOT NULL REFERENCES coaches(id),
      amount INTEGER NOT NULL,
      reason TEXT NOT NULL,
      ref_id INTEGER DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_xp_coach ON xp_log(coach_id);

    CREATE TABLE IF NOT EXISTS coach_badges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coach_id INTEGER NOT NULL REFERENCES coaches(id),
      badge_key TEXT NOT NULL,
      unlocked_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      UNIQUE(coach_id, badge_key)
    );

    CREATE TABLE IF NOT EXISTS coach_streaks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coach_id INTEGER NOT NULL UNIQUE REFERENCES coaches(id),
      current_streak INTEGER NOT NULL DEFAULT 0,
      best_streak INTEGER NOT NULL DEFAULT 0,
      last_validation_week TEXT DEFAULT NULL
    );

    -- Évaluations E.L.I.T.E.S des leaders
    CREATE TABLE IF NOT EXISTS leader_evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coach_id INTEGER NOT NULL REFERENCES coaches(id),
      month TEXT NOT NULL,
      score INTEGER DEFAULT NULL,
      points_forts TEXT DEFAULT '',
      points_ameliorer TEXT DEFAULT '',
      plan_action TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      score_engagement INTEGER DEFAULT NULL,
      score_loyal INTEGER DEFAULT NULL,
      score_infos INTEGER DEFAULT NULL,
      score_team INTEGER DEFAULT NULL,
      score_eclat INTEGER DEFAULT NULL,
      score_succes INTEGER DEFAULT NULL,
      comment_engagement TEXT DEFAULT '',
      comment_loyal TEXT DEFAULT '',
      comment_infos TEXT DEFAULT '',
      comment_team TEXT DEFAULT '',
      comment_eclat TEXT DEFAULT '',
      comment_succes TEXT DEFAULT '',
      global_comment TEXT DEFAULT '',
      eval_data TEXT DEFAULT '{}',
      remarques TEXT DEFAULT '',
      UNIQUE(coach_id, month)
    );
    CREATE INDEX IF NOT EXISTS idx_leader_eval_month ON leader_evaluations(month);

    -- Revues studio (E.L.I.T.E.S complète) — schéma souple, on copie depuis COACH
    CREATE TABLE IF NOT EXISTS studio_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coach_id INTEGER NOT NULL REFERENCES coaches(id),
      studio TEXT NOT NULL,
      month TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      contribution REAL, taux_resiliation REAL, taux_non_freq REAL,
      avis_google INTEGER, temoignages INTEGER, references_count INTEGER,
      surpack REAL, score_audit REAL,
      obj_resiliation REAL, comment_engagement TEXT DEFAULT '', comment_loyaute TEXT DEFAULT '',
      fichier_client TEXT, pesees TEXT, welcome_calls TEXT,
      resilies_commentes TEXT, comment_infos TEXT DEFAULT '',
      nb_remontees INTEGER, coachs_observes TEXT, cr_quotidiens TEXT,
      ponctualite TEXT, comment_team TEXT DEFAULT '',
      stories TEXT, presence_reseaux TEXT, standard_image TEXT, comment_eclat TEXT DEFAULT '',
      nb_events INTEGER, nb_partenaires INTEGER, petit_plus TEXT, comment_succes TEXT DEFAULT '',
      plan_sujet TEXT, plan_action TEXT, plan_echeance TEXT,
      dr_comment TEXT,
      submitted_at TEXT, validated_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      UNIQUE(studio, month)
    );
    CREATE INDEX IF NOT EXISTS idx_studio_reviews_month ON studio_reviews(month);

    -- Rapports DR hebdo
    CREATE TABLE IF NOT EXISTS dr_weekly_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week TEXT NOT NULL UNIQUE,
      top_leader_1 TEXT DEFAULT '', top_leader_1_comment TEXT DEFAULT '',
      top_leader_2 TEXT DEFAULT '', top_leader_2_comment TEXT DEFAULT '',
      flop_leader_1 TEXT DEFAULT '', flop_leader_1_comment TEXT DEFAULT '',
      flop_leader_2 TEXT DEFAULT '', flop_leader_2_comment TEXT DEFAULT '',
      top_club_1 TEXT DEFAULT '', top_club_1_comment TEXT DEFAULT '',
      top_club_2 TEXT DEFAULT '', top_club_2_comment TEXT DEFAULT '',
      flop_club_1 TEXT DEFAULT '', flop_club_1_comment TEXT DEFAULT '',
      flop_club_2 TEXT DEFAULT '', flop_club_2_comment TEXT DEFAULT '',
      priority_1 TEXT DEFAULT '', priority_2 TEXT DEFAULT '', priority_3 TEXT DEFAULT '',
      arbitrage TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_dr_weekly_week ON dr_weekly_reports(week DESC);

    -- Notes admin côté coach (renommé)
    CREATE TABLE IF NOT EXISTS coach_admin_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Focus mensuel
    CREATE TABLE IF NOT EXISTS monthly_focus (
      month TEXT PRIMARY KEY,
      content TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Ressources (vidéos YouTube)
    CREATE TABLE IF NOT EXISTS ressources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      youtube_url TEXT NOT NULL,
      video_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'vision',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
  `);
}

// Exécute la création des tables coach au démarrage
const _origGetDb = getDb;
let _coachInitDone = false;
function getDbWithCoach() {
  const result = _origGetDb();
  if (!_coachInitDone) {
    _coachInitDone = true;
    try { initCoachSchema(); } catch (e) { console.error('initCoachSchema:', e.message); }
  }
  return result;
}
// Remplace l'export getDb par la version qui inclut coach
module.exports = { getDb: getDbWithCoach, ensureWeeklySettings, generatePin, initCoachSchema };
