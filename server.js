require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const Anthropic = require('@anthropic-ai/sdk').default;
const { getDb, ensureWeeklySettings, generatePin } = require('./db');
const { sendEmail, verifyConnection } = require('./email');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' })); // 10mb pour audio messages communauté
app.use(express.static(path.join(__dirname, 'public')));

// Static serving for COACH app at /coach
app.use('/coach', express.static(path.join(__dirname, 'public', 'coach')));

// ─── Sessions (in-memory) ───────────────────────────────────

const sessions = new Map();

// ─── Auth Middleware ────────────────────────────────────────

function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non connecté' });
  }
  const token = authHeader.slice(7);
  const session = sessions.get(token);
  if (!session) {
    return res.status(401).json({ error: 'Session expirée' });
  }
  req.session = session;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  }
  next();
}

// ─── Week-Month Majority Helper ─────────────────────────────
// A week (Mon-Sun) belongs to the month where the majority of its 7 days fall.
// e.g. March 30 → April 5 = 2 days in March, 5 in April → counts as April.
// Uses pure arithmetic (no Date objects) to avoid timezone/DST issues.
const _pad2 = n => String(n).padStart(2, '0');

// Days in a given month (1-indexed)
function _daysInMonth(year, month) {
  // month is 1-12
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// Day of week for a date (0=Sun, 1=Mon, ... 6=Sat) — Zeller-like via UTC
function _dayOfWeek(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Add days to a {y,m,d} date, returns {y,m,d}
function _addDays(y, m, d, n) {
  const ms = Date.UTC(y, m - 1, d) + n * 86400000;
  const dt = new Date(ms);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function _dateStr(y, m, d) {
  return `${y}-${_pad2(m)}-${_pad2(d)}`;
}

function getWeekStartsForMonth(month) {
  const year = parseInt(month.split('-')[0]);
  const mon = parseInt(month.split('-')[1]);
  const lastDayNum = _daysInMonth(year, mon);

  // Find Monday on or before (firstOfMonth - 6 days) to catch overlapping weeks
  let s = _addDays(year, mon, 1, -6);
  while (_dayOfWeek(s.y, s.m, s.d) !== 1) {
    s = _addDays(s.y, s.m, s.d, -1);
  }

  const result = [];
  let cur = { ...s };
  // Loop while cur <= last day of month
  while (cur.y < year || (cur.y === year && cur.m < mon) || (cur.y === year && cur.m === mon && cur.d <= lastDayNum)) {
    let daysInMonth = 0;
    for (let i = 0; i < 7; i++) {
      const dd = _addDays(cur.y, cur.m, cur.d, i);
      if (dd.y === year && dd.m === mon) daysInMonth++;
    }
    if (daysInMonth >= 4) result.push(_dateStr(cur.y, cur.m, cur.d));
    cur = _addDays(cur.y, cur.m, cur.d, 7);
  }
  return result;
}

// Returns the date range covered by a set of week_starts (each week = 7 days)
function getDateRangeFromWeeks(weekStarts) {
  if (!weekStarts.length) return { from: '9999-12-31', to: '0000-01-01' };
  const first = weekStarts[0];
  const last = weekStarts[weekStarts.length - 1];
  const [ly, lm, ld] = last.split('-').map(Number);
  const end = _addDays(ly, lm, ld, 6);
  return { from: first, to: _dateStr(end.y, end.m, end.d) };
}

// ─── Auth Routes ────────────────────────────────────────────

app.post('/api/auth/login', (req, res) => {
  const { pin } = req.body;
  if (!pin || typeof pin !== 'string' || !pin.trim()) {
    return res.status(400).json({ error: 'Code PIN requis' });
  }

  const db = getDb();
  // Lecture du PIN admin depuis la DB (fallback env var)
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('admin_pin');
  const adminPin = (row && row.value) || process.env.ADMIN_PIN || 'ginkgo';

  // Check admin PIN
  if (pin.trim() === adminPin) {
    const token = crypto.randomUUID();
    sessions.set(token, { role: 'admin', name: 'Stan', sales_rep_id: null });
    return res.json({ token, role: 'admin', name: 'Stan', sales_rep_id: null });
  }

  // Check consultant code (accès Pilotage en lecture seule + commentaires)
  // Code en dur (peut être surchargé par PILOTAGE_CONSULTANT_PIN dans .env).
  // Nom affiché à l'écran et utilisé comme auteur des commentaires = « Mathieu ».
  const consultantPin = process.env.PILOTAGE_CONSULTANT_PIN || 'MJJ#MCG';
  if (pin.trim() === consultantPin) {
    const token = crypto.randomUUID();
    sessions.set(token, { role: 'consultant', name: 'Mathieu', sales_rep_id: null });
    return res.json({ token, role: 'consultant', name: 'Mathieu', sales_rep_id: null });
  }

  // Check commercial / phoneur PIN
  const rep = db.prepare('SELECT id, name, role FROM sales_reps WHERE pin = ? AND archived = 0').get(pin.trim());
  if (rep) {
    const token = crypto.randomUUID();
    const role = rep.role || 'commercial';
    sessions.set(token, { role, name: rep.name, sales_rep_id: rep.id });
    return res.json({ token, role, name: rep.name, sales_rep_id: rep.id });
  }

  // Check coach PIN (table coaches)
  const coach = db.prepare('SELECT id, name, role, studio, is_leader FROM coaches WHERE pin = ? AND archived = 0').get(pin.trim());
  if (coach) {
    const token = crypto.randomUUID();
    const role = coach.is_leader ? 'coach-leader' : (coach.role || 'coach');
    sessions.set(token, {
      role,
      name: coach.name,
      sales_rep_id: null,
      coach_id: coach.id,
      is_leader: !!coach.is_leader,
      studio: coach.studio
    });
    return res.json({
      token, role, name: coach.name, sales_rep_id: null,
      coach_id: coach.id, is_leader: !!coach.is_leader, studio: coach.studio
    });
  }

  // Check special role PINs from env (academy, director)
  const academyPin = process.env.ACADEMY_PIN;
  if (academyPin && pin.trim() === academyPin) {
    const token = crypto.randomUUID();
    sessions.set(token, { role: 'academy', name: 'Academy', sales_rep_id: null });
    return res.json({ token, role: 'academy', name: 'Academy', sales_rep_id: null });
  }
  const directorPin = process.env.DIRECTOR_PIN;
  if (directorPin && pin.trim() === directorPin) {
    const token = crypto.randomUUID();
    sessions.set(token, { role: 'director', name: 'Directeur', sales_rep_id: null });
    return res.json({ token, role: 'director', name: 'Directeur', sales_rep_id: null });
  }

  return res.status(401).json({ error: 'Code incorrect' });
});

app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non connecté' });
  }
  const token = authHeader.slice(7);
  const session = sessions.get(token);
  if (!session) {
    return res.status(401).json({ error: 'Session expirée' });
  }
  res.json(session);
});

app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    sessions.delete(authHeader.slice(7));
  }
  res.json({ success: true });
});

// ─── P.R.E.L : uploads hebdomadaires + diff S vs S-1 ────────────
// Routes admin uniquement. Le parsing XLSX est fait côté client
// (SheetJS déjà chargé), le serveur reçoit du JSON normalisé.

app.post('/api/prel/upload', requireAuth, requireAdmin, (req, res) => {
  const { filename, rows } = req.body || {};
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'rows array non vide requis' });
  }
  const db = getDb();
  // Calcule les couples (club × week_start) présents dans le nouveau fichier
  // pour REMPLACER les anciennes données de ces semaines (évite l'accumulation
  // si on ré-uploade le même fichier ou un fichier qui chevauche).
  const combos = new Set();
  for (const r of rows) {
    if (r && r.club && r.week_start) combos.add(`${r.club}|||${r.week_start}`);
  }
  const ins = db.prepare(`INSERT INTO prel_uploads (filename, rows_count) VALUES (?, 0)`).run(String(filename || 'inconnu'));
  const uploadId = ins.lastInsertRowid;
  const stmt = db.prepare(`
    INSERT INTO prel_rows (upload_id, club, week_start, id_client, id_prestation, membre, etat, echeance, ttc, vendeur, prestation, raison, tel, email)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const delStmt = db.prepare(`DELETE FROM prel_rows WHERE club = ? AND week_start = ?`);
  const clubs = new Set();
  let minWeek = null, maxWeek = null;
  let replacedCount = 0;
  const tx = db.transaction(() => {
    // 1. Purge les anciennes lignes pour chaque couple (club, week_start) ré-uploadé
    for (const combo of combos) {
      const [club, week] = combo.split('|||');
      const before = db.prepare(`SELECT COUNT(*) AS c FROM prel_rows WHERE club = ? AND week_start = ?`).get(club, week).c;
      delStmt.run(club, week);
      replacedCount += before;
    }
    // 2. Insère les nouvelles lignes
    for (const r of rows) {
      if (!r || !r.club || !r.week_start) continue;
      stmt.run(
        uploadId,
        String(r.club),
        String(r.week_start),
        Number.isInteger(r.id_client) ? r.id_client : null,
        Number.isInteger(r.id_prestation) ? r.id_prestation : null,
        r.membre || null,
        r.etat || null,
        r.echeance || null,
        (typeof r.ttc === 'number' && !Number.isNaN(r.ttc)) ? r.ttc : null,
        r.vendeur || null,
        r.prestation || null,
        r.raison || null,
        r.tel || null,
        r.email || null,
      );
      clubs.add(r.club);
      if (minWeek === null || r.week_start < minWeek) minWeek = r.week_start;
      if (maxWeek === null || r.week_start > maxWeek) maxWeek = r.week_start;
    }
    db.prepare(`UPDATE prel_uploads SET rows_count = ?, week_start_min = ?, week_start_max = ?, clubs_csv = ? WHERE id = ?`)
      .run(rows.length, minWeek, maxWeek, Array.from(clubs).join(','), uploadId);
  });
  tx();
  res.json({
    ok: true,
    upload_id: uploadId,
    rows_count: rows.length,
    replaced_count: replacedCount,
    week_start_min: minWeek,
    week_start_max: maxWeek,
    clubs: Array.from(clubs),
  });
});

app.get('/api/prel/weeks', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT week_start, COUNT(*) AS rows_count, COUNT(DISTINCT club) AS clubs_count
    FROM prel_rows
    GROUP BY week_start
    ORDER BY week_start DESC
  `).all();
  res.json({ weeks: rows });
});

app.get('/api/prel/uploads', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM prel_uploads ORDER BY uploaded_at DESC LIMIT 100`).all();
  res.json({ uploads: rows });
});

app.delete('/api/prel/uploads/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide' });
  const db = getDb();
  db.prepare(`DELETE FROM prel_uploads WHERE id = ?`).run(id);
  res.json({ ok: true });
});

// Comparaison S vs S-1 : pour chaque club, retourne la liste des clients
// présents en S-1 (état « prélevé / réussi ») mais absents OU non-prélevés
// en S. Définition d'un prélèvement réussi (cf. format Vendor du client) :
//   - « Encaisse »  (encaissé / réussi — état dominant dans les exports)
//   - « OK »        (fallback pour d'autres formats éventuels)
//   - « Encaissé »  (variante avec accent)
// Tous les autres états — Suspendu, Impayé, A faire, Envoyé, etc. —
// comptent comme NON-prélevé.
const PREL_ETATS_OK = ['OK', 'ENCAISSE', 'ENCAISSÉ'];
function prelIsOk(etat) {
  return PREL_ETATS_OK.includes(String(etat || '').toUpperCase().trim());
}

app.get('/api/prel/comparison', requireAuth, requireAdmin, (req, res) => {
  const week = String(req.query.week || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return res.status(400).json({ error: 'week=YYYY-MM-DD requis' });
  // Calcule la semaine précédente (lundi - 7 jours) en arithmétique pure
  const [y, m, d] = week.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 7);
  const prevWeek = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2,'0')}-${String(dt.getUTCDate()).padStart(2,'0')}`;
  const db = getDb();
  const clubs = db.prepare(`
    SELECT DISTINCT club FROM prel_rows
    WHERE week_start = ? OR week_start = ?
    ORDER BY club ASC
  `).all(week, prevWeek).map(r => r.club);
  const result = clubs.map(club => {
    // Toutes les lignes de S-1 (filtrage OK fait en JS pour gérer les variantes)
    const prevAll = db.prepare(`
      SELECT id_client, id_prestation, membre, etat, echeance, ttc, vendeur, prestation, raison, tel, email
      FROM prel_rows
      WHERE club = ? AND week_start = ?
    `).all(club, prevWeek);
    const prev = prevAll.filter(r => prelIsOk(r.etat));
    const cur = db.prepare(`
      SELECT id_client, id_prestation, etat
      FROM prel_rows
      WHERE club = ? AND week_start = ?
    `).all(club, week);
    const curOkClients = new Set();
    cur.forEach(r => { if (prelIsOk(r.etat)) curOkClients.add(r.id_client); });
    const perdusRaw = prev.filter(r => !curOkClients.has(r.id_client));
    // Déduplique par id_client (un client peut avoir plusieurs prestations
    // → plusieurs lignes pour la même semaine, on ne le compte qu'une fois).
    const seen = new Set();
    const perdus = [];
    for (const p of perdusRaw) {
      const key = p.id_client != null ? `id:${p.id_client}` : `mb:${(p.membre || '').toLowerCase().trim()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      perdus.push(p);
    }
    // Compteurs en clients UNIQUES (pas en lignes — un même client peut
    // avoir plusieurs prestations / échéances dans la même semaine).
    const prevClientsUniq = new Set();
    prev.forEach(r => { if (r.id_client != null) prevClientsUniq.add(r.id_client); });
    return {
      club,
      week_prev: prevWeek,
      week_cur: week,
      prev_count: prevClientsUniq.size,
      cur_ok_count: curOkClients.size,
      perdus_count: perdus.length,
      perdus,
    };
  });
  res.json({ week_cur: week, week_prev: prevWeek, clubs: result });
});

// ─── Pilotage : Commentaires (laissés par consultants) ───────────
// Tout utilisateur authentifié peut POST un commentaire.
// Seul l'admin peut LIRE / MARQUER COMME LU.

app.post('/api/pilotage/comments', requireAuth, (req, res) => {
  const { target_label, comment_text, context_json } = req.body || {};
  const text = (comment_text || '').toString().trim();
  if (!text) return res.status(400).json({ error: 'comment_text requis' });
  if (text.length > 5000) return res.status(400).json({ error: 'Commentaire trop long (max 5000 caractères)' });
  const label = (target_label || '').toString().trim().slice(0, 200);
  let ctxJson = null;
  if (context_json) {
    try { ctxJson = typeof context_json === 'string' ? context_json : JSON.stringify(context_json); }
    catch (_) { ctxJson = null; }
    if (ctxJson && ctxJson.length > 4000) ctxJson = null;
  }
  const db = getDb();
  const result = db.prepare(
    `INSERT INTO pilotage_comments (target_label, comment_text, author_name, author_role, context_json)
     VALUES (?, ?, ?, ?, ?)`
  ).run(label, text, req.session.name || 'Inconnu', req.session.role || 'unknown', ctxJson);
  res.json({ success: true, id: result.lastInsertRowid });
});

app.get('/api/pilotage/comments', requireAuth, requireAdmin, (req, res) => {
  const onlyUnread = String(req.query.unread || '').trim() === '1';
  const db = getDb();
  const rows = onlyUnread
    ? db.prepare(`SELECT * FROM pilotage_comments WHERE read_at IS NULL ORDER BY created_at DESC LIMIT 200`).all()
    : db.prepare(`SELECT * FROM pilotage_comments ORDER BY created_at DESC LIMIT 200`).all();
  const unreadCount = db.prepare(`SELECT COUNT(*) AS c FROM pilotage_comments WHERE read_at IS NULL`).get().c;
  res.json({ comments: rows, unread_count: unreadCount });
});

app.post('/api/pilotage/comments/:id/read', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide' });
  const db = getDb();
  db.prepare(`UPDATE pilotage_comments SET read_at = datetime('now','localtime') WHERE id = ?`).run(id);
  res.json({ success: true });
});

app.delete('/api/pilotage/comments/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide' });
  const db = getDb();
  db.prepare(`DELETE FROM pilotage_comments WHERE id = ?`).run(id);
  res.json({ success: true });
});

// ─── Feature Status ─────────────────────────────────────────

app.get('/api/status', (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const smtpOk = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  res.json({
    ai: !!(apiKey && apiKey !== 'votre_cle_api_ici'),
    email: smtpOk,
    webhook: !!process.env.WEBHOOK_API_KEY,
  });
});

// ─── Webhook Auth Middleware ─────────────────────────────────

function webhookAuth(req, res, next) {
  const apiKey = process.env.WEBHOOK_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'WEBHOOK_API_KEY non configurée sur le serveur' });
  }
  const authHeader = req.headers['authorization'];
  if (!authHeader || authHeader !== `Bearer ${apiKey}`) {
    return res.status(401).json({ error: 'Non autorisé : clé API manquante ou invalide' });
  }
  next();
}

// ─── Webhook Validation ─────────────────────────────────────

const VALID_RIB_STATUSES = ['Reçu', 'En attente', 'Non fourni'];

function validateSalePayload(sale, db) {
  const errors = [];

  if (!sale.date) errors.push('date est requis');
  if (sale.amount === undefined || sale.amount === null) errors.push('amount est requis');
  if (!sale.commercial_name && !sale.external_id && !sale.sales_rep_id) {
    errors.push('Un de commercial_name, external_id ou sales_rep_id est requis');
  }

  if (sale.date && !/^\d{4}-\d{2}-\d{2}$/.test(sale.date)) {
    errors.push('date doit être au format YYYY-MM-DD');
  }

  if (sale.amount !== undefined && (typeof sale.amount !== 'number' || sale.amount < 0)) {
    errors.push('amount doit être un nombre positif');
  }

  if (sale.rib_status && !VALID_RIB_STATUSES.includes(sale.rib_status)) {
    errors.push(`rib_status doit être : ${VALID_RIB_STATUSES.join(', ')}`);
  }

  let resolvedRepId = sale.sales_rep_id || null;

  if (!resolvedRepId && sale.external_id) {
    const rep = db.prepare('SELECT id FROM sales_reps WHERE external_id = ?').get(sale.external_id);
    if (!rep) errors.push(`Aucun commercial avec external_id "${sale.external_id}"`);
    else resolvedRepId = rep.id;
  }

  if (!resolvedRepId && sale.commercial_name) {
    const rep = db.prepare('SELECT id FROM sales_reps WHERE LOWER(name) = LOWER(?)').get(sale.commercial_name);
    if (!rep) errors.push(`Aucun commercial avec le nom "${sale.commercial_name}"`);
    else resolvedRepId = rep.id;
  }

  return { errors, resolvedRepId };
}

// ─── Helpers ────────────────────────────────────────────────

function escapeCsvField(value) {
  const str = String(value ?? '');
  // Neutralize Excel formula injection
  if (/^[=+\-@]/.test(str)) {
    return `"'${str.replace(/"/g, '""')}"`;
  }
  // Quote if contains delimiter, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function isValidDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function getMonday(dateStr) {
  // Parse as local date parts to avoid timezone issues
  const [y, m, dd] = dateStr.split('-').map(Number);
  const d = new Date(y, m - 1, dd);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  const ry = d.getFullYear();
  const rm = String(d.getMonth() + 1).padStart(2, '0');
  const rd = String(d.getDate()).padStart(2, '0');
  return `${ry}-${rm}-${rd}`;
}

// ─── GET /api/sales-reps ────────────────────────────────────

app.get('/api/sales-reps', requireAuth, (req, res) => {
  const db = getDb();
  const reps = db.prepare('SELECT * FROM sales_reps WHERE archived = 0 ORDER BY id').all();
  res.json(reps);
});

// ─── POST /api/sales-reps (admin only) ──────────────────────

app.post('/api/sales-reps', requireAuth, requireAdmin, (req, res) => {
  const { name, start_week, role } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Le nom est requis' });
  }
  const trimmedName = name.trim();
  const repRole = (role === 'phoneur') ? 'phoneur' : 'commercial';
  const db = getDb();

  // Compute start_week
  let startWeek = null;
  if (start_week) startWeek = getMonday(start_week);

  // Check if name already exists (any archived status)
  const existing = db.prepare('SELECT id, archived FROM sales_reps WHERE LOWER(name) = LOWER(?)').get(trimmedName);
  if (existing) {
    if (existing.archived) {
      // Un-archive: réactiver le commercial existant en préservant son historique (PIN, ventes, settings)
      db.prepare('UPDATE sales_reps SET archived = 0, role = ?, start_week = ? WHERE id = ?').run(repRole, startWeek, existing.id);
      const restored = db.prepare('SELECT * FROM sales_reps WHERE id = ?').get(existing.id);
      return res.status(200).json(restored);
    }
    return res.status(409).json({ error: 'Ce nom existe déjà' });
  }

  // Generate PIN for new rep
  const allPins = db.prepare('SELECT pin FROM sales_reps WHERE pin IS NOT NULL').all().map(r => r.pin);
  const pin = generatePin(trimmedName, allPins);

  // Insert with role
  const result = db.prepare('INSERT INTO sales_reps (name, pin, start_week, role) VALUES (?, ?, ?, ?)').run(trimmedName, pin, startWeek, repRole);
  const newRep = db.prepare('SELECT * FROM sales_reps WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(newRep);
});

// ─── DELETE /api/sales-reps/:id (admin only) — soft delete ──

app.delete('/api/sales-reps/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const repId = parseInt(req.params.id);

  const rep = db.prepare('SELECT * FROM sales_reps WHERE id = ?').get(repId);
  if (!rep) return res.status(404).json({ error: 'Commercial non trouvé' });

  // Soft delete: archive the rep (keeps all historical data intact)
  db.prepare('UPDATE sales_reps SET archived = 1 WHERE id = ?').run(repId);
  res.json({ ok: true, archived: true });
});

// ─── PUT /api/sales-reps/:id/pin (admin only) ───────────────

app.put('/api/sales-reps/:id/pin', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const repId = parseInt(req.params.id);
  const { pin } = req.body;

  if (!pin || typeof pin !== 'string' || pin.trim().length < 2) {
    return res.status(400).json({ error: 'PIN requis (min 2 caractères)' });
  }

  const rep = db.prepare('SELECT * FROM sales_reps WHERE id = ?').get(repId);
  if (!rep) return res.status(404).json({ error: 'Commercial non trouvé' });

  // Check PIN not already used by another rep
  const existing = db.prepare('SELECT id FROM sales_reps WHERE pin = ? AND id != ? AND archived = 0').get(pin.trim(), repId);
  if (existing) return res.status(409).json({ error: 'Ce PIN est déjà utilisé par un autre commercial' });

  db.prepare('UPDATE sales_reps SET pin = ? WHERE id = ?').run(pin.trim(), repId);
  res.json({ ok: true, pin: pin.trim() });
});

// ─── GET /api/weeks/:week_start/dashboard ───────────────────

app.get('/api/weeks/:week_start/dashboard', requireAuth, (req, res) => {
  const db = getDb();
  const weekStart = req.params.week_start;

  ensureWeeklySettings(weekStart);

  const reps = db.prepare("SELECT * FROM sales_reps WHERE role != 'phoneur' AND archived = 0 ORDER BY id").all();

  const settings = db.prepare(`
    SELECT ws.*, sr.name as rep_name, sr.role as rep_role
    FROM weekly_settings ws
    JOIN sales_reps sr ON sr.id = ws.sales_rep_id
    WHERE ws.week_start = ? AND sr.role != 'phoneur' AND sr.archived = 0
    ORDER BY ws.sales_rep_id
  `).all(weekStart);
  // Valeurs gérées via les défauts à la création de la semaine (hours=0, target=300 pour commercial)
  // mais entièrement éditables ensuite

  const salesByRep = db.prepare(`
    SELECT sales_rep_id,
           COALESCE(SUM(amount), 0) as total_ca,
           COUNT(*) as nb_ventes
    FROM sales
    WHERE week_start = ? AND validated = 1
    GROUP BY sales_rep_id
  `).all(weekStart);

  const salesMap = {};
  for (const s of salesByRep) {
    salesMap[s.sales_rep_id] = s;
  }

  // Count missing RIBs per rep for this week (only validated sales)
  const ribManquants = db.prepare(`
    SELECT sales_rep_id, COUNT(*) as count
    FROM sales
    WHERE week_start = ? AND rib_status != 'Reçu' AND validated = 1
    GROUP BY sales_rep_id
  `).all(weekStart);
  const ribMap = {};
  for (const r of ribManquants) { ribMap[r.sales_rep_id] = r.count; }

  const dashboard = settings.map(s => {
    const salesData = salesMap[s.sales_rep_id] || { total_ca: 0, nb_ventes: 0 };
    const ca = salesData.total_ca;
    const nbVentes = salesData.nb_ventes;
    const panierMoyen = nbVentes > 0 ? ca / nbVentes : 0;
    const ratio = s.hours_worked > 0 ? ca / s.hours_worked : 0;
    const objectifAtteint = ratio >= s.target_per_hour;

    return {
      sales_rep_id: s.sales_rep_id,
      rep_name: s.rep_name,
      rep_role: s.rep_role,
      hours_worked: s.hours_worked,
      target_per_hour: s.target_per_hour,
      locked: s.locked,
      transcript: s.transcript || '',
      ca,
      nb_ventes: nbVentes,
      panier_moyen: panierMoyen,
      ratio,
      objectif_atteint: objectifAtteint,
      rib_manquants: ribMap[s.sales_rep_id] || 0
    };
  });

  // Rankings
  const classementCA = [...dashboard].sort((a, b) => b.ca - a.ca);
  const classementRatio = [...dashboard].sort((a, b) => b.ratio - a.ratio);
  const classementPanier = [...dashboard].sort((a, b) => b.panier_moyen - a.panier_moyen);

  res.json({
    week_start: weekStart,
    commerciaux: dashboard,
    classement_ca: classementCA.map((c, i) => ({ rang: i + 1, name: c.rep_name, value: c.ca })),
    classement_ratio: classementRatio.map((c, i) => ({ rang: i + 1, name: c.rep_name, value: c.ratio })),
    classement_panier: classementPanier.map((c, i) => ({ rang: i + 1, name: c.rep_name, value: c.panier_moyen }))
  });
});

// ─── PUT /api/weeks/:week_start/settings/:sales_rep_id ──────

app.put('/api/weeks/:week_start/settings/:sales_rep_id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { week_start, sales_rep_id } = req.params;
  let { hours_worked, target_per_hour } = req.body;

  ensureWeeklySettings(week_start);

  // Heures et target éditables pour tous les rôles (defaults gérés à la création de la semaine)

  // Check lock
  const existing = db.prepare(
    'SELECT locked FROM weekly_settings WHERE week_start = ? AND sales_rep_id = ?'
  ).get(week_start, sales_rep_id);

  if (existing && existing.locked) {
    return res.status(403).json({ error: 'Semaine verrouillée' });
  }

  db.prepare(`
    UPDATE weekly_settings
    SET hours_worked = ?, target_per_hour = ?
    WHERE week_start = ? AND sales_rep_id = ?
  `).run(hours_worked, target_per_hour, week_start, sales_rep_id);

  res.json({ success: true });
});

// ─── PUT /api/weeks/:week_start/lock ────────────────────────

app.put('/api/weeks/:week_start/lock', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { week_start } = req.params;
  const { locked } = req.body;

  db.prepare(`
    UPDATE weekly_settings SET locked = ? WHERE week_start = ?
  `).run(locked ? 1 : 0, week_start);

  res.json({ success: true });
});

// ─── POST /api/sales ────────────────────────────────────────

app.post('/api/sales', requireAuth, (req, res) => {
  const db = getDb();
  const { sales_rep_id, date, amount, client_first_name, client_last_name, rib_status, client_email, remark } = req.body;

  if (!isValidDate(date)) {
    return res.status(400).json({ error: 'Date invalide (format attendu : YYYY-MM-DD)' });
  }

  const weekStart = getMonday(date);

  // Check lock
  const setting = db.prepare(
    'SELECT locked FROM weekly_settings WHERE week_start = ? AND sales_rep_id = ?'
  ).get(weekStart, sales_rep_id);

  if (setting && setting.locked) {
    return res.status(403).json({ error: 'Semaine verrouillée' });
  }

  // Sales added by commercial are not validated (need admin validation)
  // Sales added by admin are auto-validated
  const session = sessions.get(req.headers.authorization?.replace('Bearer ', ''));
  const isAdminUser = session && session.role === 'admin';
  const validated = isAdminUser ? 1 : 0;

  const result = db.prepare(`
    INSERT INTO sales (sales_rep_id, date, amount, client_first_name, client_last_name, week_start, rib_status, client_email, remark, validated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(sales_rep_id, date, amount, client_first_name || '', client_last_name || '', weekStart, rib_status || 'Non fourni', client_email || '', remark || '', validated);

  res.json({ id: result.lastInsertRowid, validated });
});

// ─── POST /api/sales/:id/validate (admin only) ────────────────

app.post('/api/sales/:id/validate', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(id);
  if (!sale) return res.status(404).json({ error: 'Vente non trouvée' });

  db.prepare('UPDATE sales SET validated = 1 WHERE id = ?').run(id);
  res.json({ success: true });
});

// ─── POST /api/sales/:id/unvalidate (admin only) ──────────────

app.post('/api/sales/:id/unvalidate', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(id);
  if (!sale) return res.status(404).json({ error: 'Vente non trouvée' });

  db.prepare('UPDATE sales SET validated = 0 WHERE id = ?').run(id);
  res.json({ success: true });
});

// ─── PUT /api/sales/:id ─────────────────────────────────────

app.put('/api/sales/:id', requireAuth, (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const { sales_rep_id, date, amount, client_first_name, client_last_name, rib_status, client_email, remark } = req.body;

  if (!isValidDate(date)) {
    return res.status(400).json({ error: 'Date invalide (format attendu : YYYY-MM-DD)' });
  }

  const weekStart = getMonday(date);

  const existing = db.prepare('SELECT * FROM sales WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Vente non trouvée' });

  // Check lock on original week
  const setting = db.prepare(
    'SELECT locked FROM weekly_settings WHERE week_start = ? AND sales_rep_id = ?'
  ).get(existing.week_start, existing.sales_rep_id);

  if (setting && setting.locked) {
    return res.status(403).json({ error: 'Semaine verrouillée' });
  }

  db.prepare(`
    UPDATE sales SET sales_rep_id = ?, date = ?, amount = ?, client_first_name = ?, client_last_name = ?, week_start = ?, rib_status = ?, client_email = ?, remark = ?
    WHERE id = ?
  `).run(sales_rep_id, date, amount, client_first_name || '', client_last_name || '', weekStart, rib_status || 'Non fourni', client_email || '', remark || '', id);

  res.json({ success: true });
});

// ─── DELETE /api/sales/:id ──────────────────────────────────

app.delete('/api/sales/:id', requireAuth, (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const existing = db.prepare('SELECT * FROM sales WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Vente non trouvée' });

  const setting = db.prepare(
    'SELECT locked FROM weekly_settings WHERE week_start = ? AND sales_rep_id = ?'
  ).get(existing.week_start, existing.sales_rep_id);

  if (setting && setting.locked) {
    return res.status(403).json({ error: 'Semaine verrouillée' });
  }

  db.prepare('DELETE FROM sales WHERE id = ?').run(id);
  res.json({ success: true });
});

// ─── POST /api/sales/:id/validate-rib ───────────────────────

app.post('/api/sales/:id/validate-rib', requireAuth, (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(id);
  if (!sale) return res.status(404).json({ error: 'Vente non trouvée' });

  // Validate RIB and assign to current week (when button was clicked)
  const today = new Date();
  const day = today.getDay(); // 0=Sun
  const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(today.setDate(diff));
  const currentWeekStart = monday.toISOString().slice(0, 10);

  db.prepare('UPDATE sales SET rib_status = ?, week_start = ? WHERE id = ?').run('Reçu', currentWeekStart, id);
  res.json({ success: true });
});

// ─── POST /api/sales/:id/relance ────────────────────────────

app.post('/api/sales/:id/relance', requireAuth, async (req, res) => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return res.status(503).json({ error: 'Email non configuré. Les relances nécessitent SMTP_HOST, SMTP_USER et SMTP_PASS dans .env', feature: 'email' });
  }

  const db = getDb();
  const { id } = req.params;
  const { level } = req.body; // 1, 2 or 3

  if (![1, 2, 3].includes(level)) {
    return res.status(400).json({ error: 'level doit être 1, 2 ou 3' });
  }

  const sale = db.prepare(`
    SELECT s.*, sr.name as rep_name
    FROM sales s JOIN sales_reps sr ON sr.id = s.sales_rep_id
    WHERE s.id = ?
  `).get(id);

  if (!sale) return res.status(404).json({ error: 'Vente non trouvée' });
  if (sale.rib_status === 'Reçu') return res.status(400).json({ error: 'RIB déjà reçu' });

  // Check sequential: R2 needs R1, R3 needs R2
  if (level === 2 && !sale.r1_sent) return res.status(400).json({ error: 'R1 doit être envoyée avant R2' });
  if (level === 3 && !sale.r2_sent) return res.status(400).json({ error: 'R2 doit être envoyée avant R3' });

  // Check not already sent
  const col = `r${level}_sent`;
  if (sale[col]) return res.status(400).json({ error: `R${level} déjà envoyée le ${sale[col]}` });

  if (!sale.client_email) {
    return res.status(400).json({ error: 'Email client manquant. Modifiez la vente pour ajouter un email.' });
  }

  const clientName = `${sale.client_first_name} ${sale.client_last_name}`.trim() || 'Client';
  const now = new Date().toISOString().slice(0, 10);

  // Email templates
  const templates = {
    1: {
      subject: 'Rappel — RIB en attente pour votre dossier',
      html: `<p>Bonjour ${clientName},</p>
<p>Nous vous rappelons que nous n'avons pas encore reçu votre RIB concernant votre dossier du ${new Date(sale.date).toLocaleDateString('fr-FR')} d'un montant de ${sale.amount} €.</p>
<p>Merci de nous le transmettre dans les meilleurs délais.</p>
<p>Cordialement,<br>L'équipe My Coach Ginkgo</p>`
    },
    2: {
      subject: '2ème relance — RIB toujours manquant',
      html: `<p>Bonjour ${clientName},</p>
<p>Malgré notre précédente relance, nous n'avons toujours pas reçu votre RIB concernant votre dossier du ${new Date(sale.date).toLocaleDateString('fr-FR')} d'un montant de ${sale.amount} €.</p>
<p><strong>Sans réponse de votre part sous 48h, nous serons dans l'obligation d'engager une procédure de recouvrement.</strong></p>
<p>Cordialement,<br>L'équipe My Coach Ginkgo</p>`
    },
    3: {
      subject: 'Mise en contentieux — RIB non fourni',
      html: `<p>Bonjour ${clientName},</p>
<p>Suite à nos relances restées sans réponse concernant votre dossier du ${new Date(sale.date).toLocaleDateString('fr-FR')} d'un montant de ${sale.amount} €, <strong>votre dossier est transmis au service contentieux</strong>.</p>
<p>Cordialement,<br>L'équipe My Coach Ginkgo</p>`
    }
  };

  const template = templates[level];

  try {
    // Send email to client
    await sendEmail({
      to: sale.client_email,
      subject: template.subject,
      html: template.html
    });

    // R3: also send dossier to Fabian (contentieux)
    if (level === 3) {
      const CONTENTIEUX_EMAIL = process.env.CONTENTIEUX_EMAIL || 'fabianfernez@gmail.com';
      await sendEmail({
        to: CONTENTIEUX_EMAIL,
        subject: `[Contentieux] Dossier ${clientName} — RIB non fourni`,
        html: `<h3>Dossier transmis au contentieux</h3>
<table style="border-collapse:collapse;">
<tr><td style="padding:4px 12px;font-weight:bold;">Client</td><td style="padding:4px 12px;">${clientName}</td></tr>
<tr><td style="padding:4px 12px;font-weight:bold;">Email</td><td style="padding:4px 12px;">${sale.client_email}</td></tr>
<tr><td style="padding:4px 12px;font-weight:bold;">Montant</td><td style="padding:4px 12px;">${sale.amount} €</td></tr>
<tr><td style="padding:4px 12px;font-weight:bold;">Date vente</td><td style="padding:4px 12px;">${new Date(sale.date).toLocaleDateString('fr-FR')}</td></tr>
<tr><td style="padding:4px 12px;font-weight:bold;">Commercial</td><td style="padding:4px 12px;">${sale.rep_name}</td></tr>
<tr><td style="padding:4px 12px;font-weight:bold;">R1 envoyée</td><td style="padding:4px 12px;">${sale.r1_sent || '—'}</td></tr>
<tr><td style="padding:4px 12px;font-weight:bold;">R2 envoyée</td><td style="padding:4px 12px;">${sale.r2_sent || '—'}</td></tr>
<tr><td style="padding:4px 12px;font-weight:bold;">R3 envoyée</td><td style="padding:4px 12px;">${now}</td></tr>
</table>`
      });
    }

    // Update DB
    db.prepare(`UPDATE sales SET ${col} = ? WHERE id = ?`).run(now, id);

    res.json({ success: true, level, sent_date: now });
  } catch (err) {
    console.error(`Erreur envoi relance R${level}:`, err.message);
    res.status(500).json({ error: `Erreur d'envoi email: ${err.message}` });
  }
});

// ─── GET /api/weeks/:week_start/sales ───────────────────────

app.get('/api/weeks/:week_start/sales', requireAuth, (req, res) => {
  const db = getDb();
  const { week_start } = req.params;
  const { sales_rep_id } = req.query;

  let query = `
    SELECT s.*, sr.name as rep_name
    FROM sales s
    JOIN sales_reps sr ON sr.id = s.sales_rep_id
    WHERE s.week_start = ?
  `;
  const params = [week_start];

  if (sales_rep_id) {
    query += ' AND s.sales_rep_id = ?';
    params.push(sales_rep_id);
  }

  query += ' ORDER BY s.date DESC, s.id DESC';

  const sales = db.prepare(query).all(...params);
  res.json(sales);
});

// ─── GET /api/months/:yyyy-mm/summary ───────────────────────

app.get('/api/months/:month/summary', requireAuth, (req, res) => {
  const db = getDb();
  const month = req.params.month; // "2025-02"

  const year = parseInt(month.split('-')[0]);
  const mon = parseInt(month.split('-')[1]);
  const lastDay = new Date(year, mon, 0).toISOString().slice(0, 10);

  // Week-month majority rule: only include weeks where ≥4 of 7 days fall in this month
  const monthWeeks = getWeekStartsForMonth(month);
  const { from: dateFrom, to: dateTo } = getDateRangeFromWeeks(monthWeeks);

  const reps = db.prepare("SELECT * FROM sales_reps WHERE role != 'phoneur' AND archived = 0 AND (start_week IS NULL OR start_week <= ?) ORDER BY id").all(lastDay);

  // Get all validated sales from weeks attributed to this month
  const placeholders = monthWeeks.map(() => '?').join(',');
  const allSales = monthWeeks.length > 0 ? db.prepare(`
    SELECT s.*, sr.name as rep_name
    FROM sales s
    JOIN sales_reps sr ON sr.id = s.sales_rep_id
    WHERE s.week_start IN (${placeholders}) AND s.validated = 1
    ORDER BY s.amount DESC
  `).all(...monthWeeks) : [];

  // Total hours per rep across attributed weeks
  const weeklySettings = monthWeeks.length > 0 ? db.prepare(`
    SELECT ws.*, sr.name as rep_name
    FROM weekly_settings ws
    JOIN sales_reps sr ON sr.id = ws.sales_rep_id
    WHERE ws.week_start IN (${placeholders})
  `).all(...monthWeeks) : [];

  // Per-rep stats with cumulated monthly ratio + best single sale
  // Only count sales with RIB received in the recap
  const repStats = reps.map(rep => {
    const repSales = allSales.filter(s => s.sales_rep_id === rep.id && s.rib_status === 'Reçu');
    const ca = repSales.reduce((sum, s) => sum + s.amount, 0);
    const nbVentes = repSales.length;
    const panierMoyen = nbVentes > 0 ? ca / nbVentes : 0;

    const repWeeks = weeklySettings.filter(ws => ws.sales_rep_id === rep.id);
    const totalHours = repWeeks.reduce((sum, ws) => sum + ws.hours_worked, 0);
    const ratioMensuel = totalHours > 0 ? ca / totalHours : 0;
    const objectifCA = repWeeks.reduce((sum, ws) => sum + ws.hours_worked * ws.target_per_hour, 0);

    // Best single sale for this rep
    const bestSale = repSales.length > 0 ? repSales[0].amount : 0; // already sorted DESC

    return {
      sales_rep_id: rep.id,
      name: rep.name,
      ca,
      nb_ventes: nbVentes,
      panier_moyen: panierMoyen,
      total_hours: totalHours,
      ratio_mensuel: ratioMensuel,
      best_sale: bestSale,
      objectif_ca: objectifCA
    };
  });

  // Global
  const globalCA = repStats.reduce((s, r) => s + r.ca, 0);
  const globalNbVentes = repStats.reduce((s, r) => s + r.nb_ventes, 0);
  const globalPanierMoyen = globalNbVentes > 0 ? globalCA / globalNbVentes : 0;

  // Best sale(s) — deduplicated: one per commercial at max amount
  let bestSales = [];
  if (allSales.length > 0) {
    const maxAmount = allSales[0].amount;
    const tiedSales = allSales.filter(s => s.amount === maxAmount);
    // Keep one per commercial
    const seen = new Set();
    for (const s of tiedSales) {
      if (!seen.has(s.sales_rep_id)) {
        seen.add(s.sales_rep_id);
        bestSales.push({
          amount: s.amount,
          rep_name: s.rep_name,
          client: `${s.client_first_name} ${s.client_last_name}`.trim(),
          date: s.date
        });
      }
    }
  }

  res.json({
    month,
    rep_stats: repStats,
    global: {
      ca: globalCA,
      nb_ventes: globalNbVentes,
      panier_moyen: globalPanierMoyen
    },
    best_sales: bestSales
  });
});

// ─── GET /api/months/:month/analysis-data ─────────────────────
// Returns per-rep data needed for individual analysis:
// - monthly counters (HS, references, rdv_fixes, entretien_premier_mois, contact_entreprise)
// - sales without RIB count
// - commercial days worked (distinct days with daily_action_values)
// - days with ALL predefined actions completed vs total commercial days

app.get('/api/months/:month/analysis-data', requireAuth, (req, res) => {
  const db = getDb();
  const month = req.params.month;
  const year = parseInt(month.split('-')[0]);
  const mon = parseInt(month.split('-')[1]);
  const lastDay = new Date(year, mon, 0).toISOString().slice(0, 10);

  // Week-month majority rule
  const monthWeeks = getWeekStartsForMonth(month);
  const { from: dateFrom, to: dateTo } = getDateRangeFromWeeks(monthWeeks);

  const reps = db.prepare("SELECT * FROM sales_reps WHERE role != 'phoneur' AND archived = 0 AND (start_week IS NULL OR start_week <= ?) ORDER BY id").all(lastDay);

  // Total predefined actions count (yesno + counters)
  const PREDEFINED_ACTION_COUNT = 9; // 5 yesno + 4 counters

  const placeholdersA = monthWeeks.map(() => '?').join(',');

  const result = reps.map(rep => {
    // 1. Monthly counters — combine predefined: and club2: (normalize to predefined:)
    const counters = db.prepare(`
      SELECT
        CASE WHEN action_key LIKE 'club2:%' THEN 'predefined:' || SUBSTR(action_key, 7) ELSE action_key END as norm_key,
        SUM(value) as total
      FROM daily_action_values
      WHERE sales_rep_id = ? AND date >= ? AND date <= ? AND (action_key LIKE 'predefined:%' OR action_key LIKE 'club2:%')
      GROUP BY norm_key
    `).all(rep.id, dateFrom, dateTo);

    const totals = {};
    counters.forEach(c => { totals[c.norm_key.replace('predefined:', '')] = c.total; });

    // 2. Sales without RIB for this rep (from weeks attributed to this month, validated only)
    const salesNoRib = monthWeeks.length > 0 ? db.prepare(`
      SELECT COUNT(*) as count FROM sales
      WHERE sales_rep_id = ? AND week_start IN (${placeholdersA}) AND rib_status != 'Reçu' AND validated = 1
    `).get(rep.id, ...monthWeeks) : { count: 0 };

    // 3. Total sales count (validated only) for reference comparison
    const totalSalesAll = monthWeeks.length > 0 ? db.prepare(`
      SELECT COUNT(*) as count FROM sales
      WHERE sales_rep_id = ? AND week_start IN (${placeholdersA}) AND validated = 1
    `).get(rep.id, ...monthWeeks) : { count: 0 };

    // 4. Commercial days = distinct days with at least one action value > 0 (either club)
    const commercialDays = db.prepare(`
      SELECT COUNT(DISTINCT date) as count
      FROM daily_action_values
      WHERE sales_rep_id = ? AND date >= ? AND date <= ? AND (action_key LIKE 'predefined:%' OR action_key LIKE 'club2:%') AND value > 0
    `).get(rep.id, dateFrom, dateTo);

    // 5. Days with ALL actions completed per used club
    const dayDetails = db.prepare(`
      SELECT date,
        CASE WHEN action_key LIKE 'predefined:%' THEN 'c1' ELSE 'c2' END as club,
        COUNT(DISTINCT CASE WHEN action_key LIKE 'club2:%' THEN 'predefined:' || SUBSTR(action_key, 7) ELSE action_key END) as actions_done
      FROM daily_action_values
      WHERE sales_rep_id = ? AND date >= ? AND date <= ? AND (action_key LIKE 'predefined:%' OR action_key LIKE 'club2:%') AND value > 0
      GROUP BY date, club
    `).all(rep.id, dateFrom, dateTo);

    // Group by date
    const dayMap = {};
    dayDetails.forEach(d => {
      if (!dayMap[d.date]) dayMap[d.date] = {};
      dayMap[d.date][d.club] = d.actions_done;
    });
    let completeDaysCount = 0;
    for (const [, clubs] of Object.entries(dayMap)) {
      let allComplete = true;
      for (const [, count] of Object.entries(clubs)) {
        if (count < PREDEFINED_ACTION_COUNT) allComplete = false;
      }
      if (allComplete) completeDaysCount++;
    }

    // 6. RDV objectif per day = 2 (10 per week / 5 days)
    const rdvObjectifParJour = 2;

    return {
      sales_rep_id: rep.id,
      name: rep.name,
      counters: totals,
      sales_no_rib: salesNoRib?.count || 0,
      total_sales_all: totalSalesAll?.count || 0,
      commercial_days: commercialDays?.count || 0,
      complete_days: completeDaysCount,
      rdv_objectif_par_jour: rdvObjectifParJour
    };
  });

  res.json({ month, reps: result });
});

// ─── GET /api/months/:month/weekly-breakdown ─────────────────

app.get('/api/months/:month/weekly-breakdown', requireAuth, (req, res) => {
  const db = getDb();
  const month = req.params.month;
  const year = parseInt(month.split('-')[0]);
  const mon = parseInt(month.split('-')[1]);
  const lastDay = new Date(year, mon, 0).toISOString().slice(0, 10);

  // Week-month majority rule
  const monthWeeks = getWeekStartsForMonth(month);

  const reps = db.prepare("SELECT * FROM sales_reps WHERE role != 'phoneur' AND archived = 0 AND (start_week IS NULL OR start_week <= ?) ORDER BY id").all(lastDay);

  const weeklyData = monthWeeks.map(ws => {
    const [wy, wm, wd] = ws.split('-').map(Number);
    const weekEndDate = new Date(wy, wm - 1, wd + 6);

    const startDate = new Date(wy, wm - 1, wd);
    const startLabel = startDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    const endLabel = weekEndDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

    const repData = reps.filter(rep => !rep.start_week || rep.start_week <= ws).map(rep => {
      // All validated sales for this rep in this week
      const salesRow = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as ca, COUNT(*) as nb_ventes
        FROM sales
        WHERE sales_rep_id = ? AND week_start = ? AND rib_status = 'Reçu' AND validated = 1
      `).get(rep.id, ws);

      const settings = db.prepare(`
        SELECT hours_worked, target_per_hour
        FROM weekly_settings
        WHERE week_start = ? AND sales_rep_id = ?
      `).get(ws, rep.id);

      const ca = salesRow.ca;
      const nbVentes = salesRow.nb_ventes;
      const panierMoyen = nbVentes > 0 ? ca / nbVentes : 0;
      const hours = settings ? settings.hours_worked : 0;
      const ratio = hours > 0 ? ca / hours : 0;

      return {
        sales_rep_id: rep.id,
        name: rep.name,
        ca,
        nb_ventes: nbVentes,
        panier_moyen: panierMoyen,
        hours_worked: hours,
        ratio
      };
    });

    return {
      week_start: ws,
      label: `${startLabel} - ${endLabel}`,
      reps: repData
    };
  });

  res.json({ month, weeks: weeklyData });
});

// ─── Transcript ─────────────────────────────────────────────

app.get('/api/weeks/:week_start/transcript/:sales_rep_id', requireAuth, (req, res) => {
  const db = getDb();
  const { week_start, sales_rep_id } = req.params;
  ensureWeeklySettings(week_start);

  const row = db.prepare(
    'SELECT transcript FROM weekly_settings WHERE week_start = ? AND sales_rep_id = ?'
  ).get(week_start, sales_rep_id);

  res.json({ transcript: row?.transcript || '' });
});

app.put('/api/weeks/:week_start/transcript/:sales_rep_id', requireAuth, (req, res) => {
  const db = getDb();
  const { week_start, sales_rep_id } = req.params;
  const { transcript } = req.body;

  ensureWeeklySettings(week_start);

  db.prepare(
    'UPDATE weekly_settings SET transcript = ? WHERE week_start = ? AND sales_rep_id = ?'
  ).run(transcript || '', week_start, sales_rep_id);

  res.json({ success: true });
});

// ─── Chat Messages ──────────────────────────────────────────

app.get('/api/weeks/:week_start/messages/:sales_rep_id', requireAuth, (req, res) => {
  const db = getDb();
  const { week_start, sales_rep_id } = req.params;

  const messages = db.prepare(
    'SELECT * FROM transcript_messages WHERE week_start = ? AND sales_rep_id = ? ORDER BY created_at ASC'
  ).all(week_start, sales_rep_id);

  // Also return legacy transcript if any
  const legacy = db.prepare(
    'SELECT transcript FROM weekly_settings WHERE week_start = ? AND sales_rep_id = ?'
  ).get(week_start, sales_rep_id);

  res.json({ messages, legacy_transcript: legacy?.transcript || '' });
});

app.post('/api/weeks/:week_start/messages/:sales_rep_id', requireAuth, (req, res) => {
  const db = getDb();
  const { week_start, sales_rep_id } = req.params;
  const { message } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message vide' });
  }

  const result = db.prepare(
    'INSERT INTO transcript_messages (sales_rep_id, week_start, message) VALUES (?, ?, ?)'
  ).run(sales_rep_id, week_start, message.trim());

  const created = db.prepare('SELECT * FROM transcript_messages WHERE id = ?').get(result.lastInsertRowid);
  res.json(created);
});

app.delete('/api/messages/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const existing = db.prepare('SELECT * FROM transcript_messages WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Message non trouvé' });

  db.prepare('DELETE FROM transcript_messages WHERE id = ?').run(id);
  res.json({ success: true });
});

// ─── Transcript Analysis (AI) ────────────────────────────────

app.post('/api/analyze-transcript', requireAuth, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'votre_cle_api_ici') {
    return res.status(503).json({ error: 'Analyse IA non configurée. Définissez ANTHROPIC_API_KEY dans .env', feature: 'ai' });
  }

  const { transcript, rep_name, week_start, hours_worked, target_per_hour, ca, nb_ventes, panier_moyen, ratio } = req.body;

  if (!transcript || !transcript.trim()) {
    return res.status(400).json({ error: 'Transcript vide' });
  }

  try {
    const client = new Anthropic({ apiKey });

    const weekEnd = (() => {
      const [y, m, d] = week_start.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      dt.setDate(dt.getDate() + 6);
      return dt.toLocaleDateString('fr-FR');
    })();
    const weekStartFR = (() => {
      const [y, m, d] = week_start.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString('fr-FR');
    })();

    const contextInfo = `
Contexte du conseiller commercial : ${rep_name}
Semaine du ${weekStartFR} au ${weekEnd}
- Heures travaillées : ${hours_worked}h
- Objectif : ${target_per_hour} €/h
- CA réalisé : ${ca} €
- Nombre de ventes : ${nb_ventes}
- Panier moyen : ${panier_moyen.toFixed(0)} €
- Ratio CA/h : ${ratio.toFixed(2)} €/h
- Objectif atteint : ${ratio >= target_per_hour ? 'Oui' : 'Non'}
`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Tu es un manager commercial expert. Analyse le transcript suivant d'un échange avec un conseiller commercial et produis une synthèse structurée en bullet points.

${contextInfo}

TRANSCRIPT DE L'ÉCHANGE :
${transcript}

Produis une synthèse en français avec ces 3 sections, chacune sous forme de bullet points concis :

**Points clés de l'échange**
- Les idées principales discutées, les constats sur la performance, les points forts et axes d'amélioration identifiés

**Plan d'action pour la semaine prochaine**
- Comment le conseiller va atteindre son objectif la semaine suivante, les actions concrètes prévues

**Éléments complémentaires**
- Tout autre élément pertinent (état d'esprit, besoins de formation, alertes, etc.)

Sois synthétique et direct. Utilise des bullet points courts et percutants.`
        }
      ]
    });

    const analysis = message.content[0].text;
    res.json({ analysis });
  } catch (e) {
    console.error('Erreur analyse transcript:', e.message);
    if (e.message?.includes('API key') || e.message?.includes('authentication') || e.status === 401) {
      return res.status(500).json({ error: 'Clé API Anthropic manquante ou invalide. Définissez ANTHROPIC_API_KEY dans vos variables d\'environnement.' });
    }
    res.status(500).json({ error: 'Erreur lors de l\'analyse: ' + e.message });
  }
});

// ─── CSV Exports ────────────────────────────────────────────

app.get('/api/export/week/:week_start', requireAuth, (req, res) => {
  const db = getDb();
  const { week_start } = req.params;

  const sales = db.prepare(`
    SELECT s.date, sr.name as commercial, s.amount, s.client_first_name, s.client_last_name, s.rib_status
    FROM sales s
    JOIN sales_reps sr ON sr.id = s.sales_rep_id
    WHERE s.week_start = ?
    ORDER BY s.date, sr.name
  `).all(week_start);

  let csv = 'Date,Commercial,Montant,Prénom Client,Nom Client,Statut RIB\n';
  for (const s of sales) {
    csv += `${escapeCsvField(s.date)},${escapeCsvField(s.commercial)},${s.amount},${escapeCsvField(s.client_first_name)},${escapeCsvField(s.client_last_name)},${escapeCsvField(s.rib_status || 'Non fourni')}\n`;
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=ventes-semaine-${week_start}.csv`);
  res.send('\uFEFF' + csv); // BOM for Excel
});

app.get('/api/export/month/:month', requireAuth, (req, res) => {
  const db = getDb();
  const month = req.params.month;
  const year = parseInt(month.split('-')[0]);
  const mon = parseInt(month.split('-')[1]);
  const firstDay = `${month}-01`;
  const lastDay = new Date(year, mon, 0).toISOString().slice(0, 10);

  const sales = db.prepare(`
    SELECT s.date, sr.name as commercial, s.amount, s.client_first_name, s.client_last_name, s.rib_status
    FROM sales s
    JOIN sales_reps sr ON sr.id = s.sales_rep_id
    WHERE s.date >= ? AND s.date <= ?
    ORDER BY s.date, sr.name
  `).all(firstDay, lastDay);

  let csv = 'Date,Commercial,Montant,Prénom Client,Nom Client,Statut RIB\n';
  for (const s of sales) {
    csv += `${escapeCsvField(s.date)},${escapeCsvField(s.commercial)},${s.amount},${escapeCsvField(s.client_first_name)},${escapeCsvField(s.client_last_name)},${escapeCsvField(s.rib_status || 'Non fourni')}\n`;
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=ventes-mois-${month}.csv`);
  res.send('\uFEFF' + csv);
});

// ─── Daily Actions: Types CRUD ──────────────────────────────

app.get('/api/daily-actions/types/:sales_rep_id', requireAuth, (req, res) => {
  const db = getDb();
  const types = db.prepare(
    'SELECT * FROM daily_action_types WHERE sales_rep_id = ? ORDER BY sort_order, id'
  ).all(req.params.sales_rep_id);
  res.json(types);
});

app.post('/api/daily-actions/types/:sales_rep_id', requireAuth, (req, res) => {
  const db = getDb();
  const { name, type } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nom requis' });
  if (!['counter', 'yesno'].includes(type)) return res.status(400).json({ error: 'Type invalide' });

  const maxOrder = db.prepare(
    'SELECT MAX(sort_order) as m FROM daily_action_types WHERE sales_rep_id = ?'
  ).get(req.params.sales_rep_id);

  const result = db.prepare(
    'INSERT INTO daily_action_types (sales_rep_id, name, type, sort_order) VALUES (?, ?, ?, ?)'
  ).run(req.params.sales_rep_id, name.trim(), type, (maxOrder?.m || 0) + 1);

  const newType = db.prepare('SELECT * FROM daily_action_types WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(newType);
});

app.delete('/api/daily-actions/types/:id', requireAuth, (req, res) => {
  const db = getDb();
  const typeId = parseInt(req.params.id);
  // Delete associated values
  db.prepare("DELETE FROM daily_action_values WHERE action_key = 'custom:' || ?").run(typeId);
  const result = db.prepare('DELETE FROM daily_action_types WHERE id = ?').run(typeId);
  if (result.changes === 0) return res.status(404).json({ error: 'Type non trouvé' });
  res.json({ ok: true });
});

// ─── Daily Actions: Values ──────────────────────────────────

// ─── Admin: All actions for all commercials for a week ────────
app.get('/api/admin/actions/:weekStart', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const weekStart = req.params.weekStart;

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }

  const reps = db.prepare("SELECT id, name FROM sales_reps WHERE role != 'phoneur' AND archived = 0 ORDER BY name").all();

  const result = reps.map(rep => {
    const rows = db.prepare(`
      SELECT action_key, date, value
      FROM daily_action_values
      WHERE sales_rep_id = ? AND date >= ? AND date <= ? AND (action_key LIKE 'predefined:%' OR action_key LIKE 'club2:%')
    `).all(rep.id, days[0], days[6]);

    // Build per-day map
    const byDay = {};
    days.forEach(d => { byDay[d] = {}; });
    rows.forEach(r => {
      if (!byDay[r.date]) byDay[r.date] = {};
      byDay[r.date][r.action_key] = r.value;
    });

    return {
      sales_rep_id: rep.id,
      name: rep.name,
      days: byDay
    };
  });

  res.json({ week_start: weekStart, days, reps: result });
});

// ─── Admin: Actions summary for a month (comparison table) ───
app.get('/api/admin/actions-summary/:month', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const month = req.params.month;
  const firstDay = month + '-01';
  const year = parseInt(month.split('-')[0]);
  const mon = parseInt(month.split('-')[1]);
  const lastDay = new Date(year, mon, 0).toISOString().slice(0, 10);

  const reps = db.prepare("SELECT id, name FROM sales_reps WHERE role != 'phoneur' AND archived = 0 ORDER BY name").all();

  const result = reps.map(rep => {
    // Hours from weekly_settings
    const hoursRow = db.prepare(`
      SELECT COALESCE(SUM(hours_worked), 0) as total_hours
      FROM weekly_settings
      WHERE sales_rep_id = ? AND week_start >= date(?, '-6 days') AND week_start <= ?
    `).get(rep.id, firstDay, lastDay);

    // Action counters (predefined + club2 summed)
    const actions = db.prepare(`
      SELECT action_key, SUM(value) as total
      FROM daily_action_values
      WHERE sales_rep_id = ? AND date >= ? AND date <= ? AND (action_key LIKE 'predefined:%' OR action_key LIKE 'club2:%')
      GROUP BY action_key
    `).all(rep.id, firstDay, lastDay);

    const totals = {};
    actions.forEach(a => {
      // Normalize key: 'predefined:references' and 'club2:references' both → 'references'
      const key = a.action_key.replace('predefined:', '').replace('club2:', '');
      totals[key] = (totals[key] || 0) + a.total;
    });

    // Count days with all yesno actions done (both clubs if used)
    const daysWorked = db.prepare(`
      SELECT COUNT(DISTINCT date) as count
      FROM daily_action_values
      WHERE sales_rep_id = ? AND date >= ? AND date <= ? AND (action_key LIKE 'predefined:%' OR action_key LIKE 'club2:%') AND value > 0
    `).get(rep.id, firstDay, lastDay);

    return {
      sales_rep_id: rep.id,
      name: rep.name,
      total_hours: hoursRow.total_hours,
      days_active: daysWorked?.count || 0,
      totals
    };
  });

  res.json({ month, reps: result });
});

app.get('/api/daily-actions/values/:sales_rep_id/:date', requireAuth, (req, res) => {
  const db = getDb();
  const values = db.prepare(
    'SELECT * FROM daily_action_values WHERE sales_rep_id = ? AND date = ?'
  ).all(req.params.sales_rep_id, req.params.date);
  res.json(values);
});

app.put('/api/daily-actions/values/:sales_rep_id/:date', requireAuth, (req, res) => {
  const db = getDb();
  const { action_key, value } = req.body;
  if (!action_key) return res.status(400).json({ error: 'action_key requis' });

  db.prepare(`
    INSERT INTO daily_action_values (sales_rep_id, action_key, date, value)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(sales_rep_id, action_key, date) DO UPDATE SET value = excluded.value
  `).run(req.params.sales_rep_id, action_key, req.params.date, value || 0);

  res.json({ ok: true });
});

// ─── Admin: Energy levels per week ───────────────────────────

app.get('/api/admin/energy/:weekStart', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const weekStart = req.params.weekStart; // format: 2026-03-09 (Monday)

  // Build 7 days from weekStart
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }

  const reps = db.prepare("SELECT id, name FROM sales_reps WHERE role != 'phoneur' AND archived = 0 ORDER BY name").all();

  const result = reps.map(rep => {
    // Get energy from both clubs and average per day
    const rows = db.prepare(`
      SELECT date, AVG(value) as value FROM daily_action_values
      WHERE sales_rep_id = ? AND (action_key = 'predefined:energie' OR action_key = 'club2:energie') AND date >= ? AND date <= ? AND value > 0
      GROUP BY date
    `).all(rep.id, days[0], days[6]);

    const byDate = {};
    rows.forEach(r => { byDate[r.date] = Math.round(r.value); });

    const values = days.map(d => byDate[d] || null);
    const filled = values.filter(v => v !== null);
    const avg = filled.length > 0 ? Math.round((filled.reduce((s, v) => s + v, 0) / filled.length) * 10) / 10 : null;

    return {
      sales_rep_id: rep.id,
      name: rep.name,
      days: values,
      avg,
      count: filled.length
    };
  });

  res.json({ week_start: weekStart, days, reps: result });
});

// ─── Monthly aggregation of daily action counters ────────────

app.get('/api/daily-actions/monthly/:month', requireAuth, (req, res) => {
  const db = getDb();
  const month = req.params.month; // format: 2026-03
  const startDate = month + '-01';
  const endDate = month + '-31';

  // Combine predefined: and club2: counters by normalizing keys to predefined:
  const rows = db.prepare(`
    SELECT sales_rep_id,
      CASE WHEN action_key LIKE 'club2:%' THEN 'predefined:' || SUBSTR(action_key, 7) ELSE action_key END as action_key,
      SUM(value) as total
    FROM daily_action_values
    WHERE date >= ? AND date <= ? AND (action_key LIKE 'predefined:%' OR action_key LIKE 'club2:%')
    GROUP BY sales_rep_id, CASE WHEN action_key LIKE 'club2:%' THEN 'predefined:' || SUBSTR(action_key, 7) ELSE action_key END
  `).all(startDate, endDate);

  res.json(rows);
});

// ─── Discipline badge: count non-zero actions per rep for a month ──
app.get('/api/daily-actions/discipline/:month', requireAuth, (req, res) => {
  const db = getDb();
  const month = req.params.month;
  const startDate = month + '-01';
  const endDate = month + '-31';

  const rows = db.prepare(`
    SELECT sales_rep_id, COUNT(*) as total_actions
    FROM daily_action_values
    WHERE date >= ? AND date <= ? AND value > 0 AND (action_key LIKE 'predefined:%' OR action_key LIKE 'club2:%')
    GROUP BY sales_rep_id
  `).all(startDate, endDate);

  res.json(rows);
});

// ─── Phoning: monthly aggregation for a phoneur ─────────────
app.get('/api/phoning/monthly/:sales_rep_id/:month', requireAuth, (req, res) => {
  const db = getDb();
  const repId = parseInt(req.params.sales_rep_id);
  const month = req.params.month;
  const startDate = month + '-01';
  const endDate = month + '-31';

  // Aggregate all phoning: values for this rep/month
  const rows = db.prepare(`
    SELECT action_key, SUM(value) as total
    FROM daily_action_values
    WHERE sales_rep_id = ? AND date >= ? AND date <= ? AND action_key LIKE 'phoning:%'
    GROUP BY action_key
  `).all(repId, startDate, endDate);

  // Count distinct days worked (at least one phoning value > 0)
  const daysWorked = db.prepare(`
    SELECT COUNT(DISTINCT date) as count
    FROM daily_action_values
    WHERE sales_rep_id = ? AND date >= ? AND date <= ? AND action_key LIKE 'phoning:%' AND value > 0
  `).get(repId, startDate, endDate);

  res.json({ totals: rows, days_worked: daysWorked?.count || 0 });
});

// ─── Phoning: all phoneurs monthly summary (admin) ───────────
app.get('/api/phoning/all-monthly/:month', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const month = req.params.month;
  const startDate = month + '-01';
  const endDate = month + '-31';

  // Get all phoneurs
  const phoneurs = db.prepare("SELECT id, name FROM sales_reps WHERE role = 'phoneur' AND archived = 0 ORDER BY name").all();

  const results = phoneurs.map(p => {
    const rows = db.prepare(`
      SELECT action_key, SUM(value) as total
      FROM daily_action_values
      WHERE sales_rep_id = ? AND date >= ? AND date <= ? AND action_key LIKE 'phoning:%'
      GROUP BY action_key
    `).all(p.id, startDate, endDate);

    const daysWorked = db.prepare(`
      SELECT COUNT(DISTINCT date) as count
      FROM daily_action_values
      WHERE sales_rep_id = ? AND date >= ? AND date <= ? AND action_key LIKE 'phoning:%' AND value > 0
    `).get(p.id, startDate, endDate);

    const totals = {};
    rows.forEach(r => { totals[r.action_key.replace('phoning:', '')] = r.total; });

    return {
      sales_rep_id: p.id,
      name: p.name,
      days_worked: daysWorked?.count || 0,
      totals
    };
  });

  res.json({ month, phoneurs: results });
});

// ─── Admin: Control tab data ─────────────────────────────────

app.get('/api/control/:sales_rep_id/:week_start', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const repId = parseInt(req.params.sales_rep_id);
  const weekStart = req.params.week_start;

  // 1. CA de la semaine (only validated sales count)
  const caRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as ca, COUNT(*) as nb_ventes
    FROM sales WHERE sales_rep_id = ? AND week_start = ? AND validated = 1
  `).get(repId, weekStart);

  // 2. Ventes de la semaine avec détails (show all, including non-validated)
  const sales = db.prepare(`
    SELECT id, date, amount, client_first_name, client_last_name, rib_status, controlled, sales_rep_id, validated
    FROM sales WHERE sales_rep_id = ? AND week_start = ?
    ORDER BY date DESC, id DESC
  `).all(repId, weekStart);

  // 3. Heures et objectif de la semaine
  const settings = db.prepare(`
    SELECT hours_worked, target_per_hour, hours_controlled
    FROM weekly_settings WHERE week_start = ? AND sales_rep_id = ?
  `).get(weekStart, repId);

  // 4. Badges du mois (besoin du mois en cours basé sur la semaine)
  const month = weekStart.slice(0, 7);

  res.json({
    ca: caRow.ca,
    nb_ventes: caRow.nb_ventes,
    sales,
    hours_worked: settings?.hours_worked || 0,
    target_per_hour: settings?.target_per_hour || 250,
    hours_controlled: settings?.hours_controlled || 0,
    month
  });
});

// ─── Admin: Toggle sale controlled ───────────────────────────

app.put('/api/sales/:id/controlled', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const saleId = parseInt(req.params.id);
  const { controlled } = req.body;
  const val = controlled ? 1 : 0;
  db.prepare('UPDATE sales SET controlled = ? WHERE id = ?').run(val, saleId);
  res.json({ ok: true, controlled: val });
});

// ─── Admin: Control hours (validate + update) ───────────────

app.put('/api/control/:sales_rep_id/:week_start/hours', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const repId = parseInt(req.params.sales_rep_id);
  const weekStart = req.params.week_start;
  const { hours_worked, hours_controlled } = req.body;

  ensureWeeklySettings(weekStart);

  if (hours_worked !== undefined) {
    db.prepare('UPDATE weekly_settings SET hours_worked = ? WHERE week_start = ? AND sales_rep_id = ?')
      .run(hours_worked, weekStart, repId);
  }
  if (hours_controlled !== undefined) {
    db.prepare('UPDATE weekly_settings SET hours_controlled = ? WHERE week_start = ? AND sales_rep_id = ?')
      .run(hours_controlled ? 1 : 0, weekStart, repId);
  }

  res.json({ ok: true });
});

// ─── Admin: Remove rep from a specific week ─────────────────

app.delete('/api/weeks/:week_start/rep/:sales_rep_id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const weekStart = req.params.week_start;
  const repId = parseInt(req.params.sales_rep_id);

  // Get week end date (Sunday)
  const startD = new Date(weekStart + 'T00:00:00');
  const endD = new Date(startD);
  endD.setDate(endD.getDate() + 6);
  const weekEnd = endD.toISOString().slice(0, 10);

  // Delete weekly_settings for this rep/week
  db.prepare('DELETE FROM weekly_settings WHERE week_start = ? AND sales_rep_id = ?').run(weekStart, repId);

  // Delete sales for this rep/week
  db.prepare('DELETE FROM sales WHERE week_start = ? AND sales_rep_id = ?').run(weekStart, repId);

  // Delete daily action values for this rep in this week's date range
  db.prepare('DELETE FROM daily_action_values WHERE sales_rep_id = ? AND date >= ? AND date <= ?').run(repId, weekStart, weekEnd);

  // Delete transcript messages for this rep/week
  db.prepare('DELETE FROM transcript_messages WHERE sales_rep_id = ? AND week_start = ?').run(repId, weekStart);

  res.json({ ok: true });
});

// ─── Webhook: POST /api/webhook/sales (single) ──────────────

app.post('/api/webhook/sales', webhookAuth, (req, res) => {
  const db = getDb();
  const sale = req.body;

  const { errors, resolvedRepId } = validateSalePayload(sale, db);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation échouée', details: errors });
  }

  const weekStart = getMonday(sale.date);
  ensureWeeklySettings(weekStart);

  const setting = db.prepare(
    'SELECT locked FROM weekly_settings WHERE week_start = ? AND sales_rep_id = ?'
  ).get(weekStart, resolvedRepId);

  if (setting && setting.locked) {
    return res.status(403).json({ error: 'Semaine verrouillée', week_start: weekStart });
  }

  const ribStatus = sale.rib_status || 'Non fourni';

  const result = db.prepare(`
    INSERT INTO sales (sales_rep_id, date, amount, client_first_name, client_last_name, week_start, rib_status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    resolvedRepId,
    sale.date,
    sale.amount,
    sale.client_first_name || '',
    sale.client_last_name || '',
    weekStart,
    ribStatus
  );

  res.status(201).json({
    success: true,
    id: Number(result.lastInsertRowid),
    week_start: weekStart,
    sales_rep_id: resolvedRepId,
    rib_status: ribStatus
  });
});

// ─── Webhook: POST /api/webhook/sales/bulk ───────────────────

app.post('/api/webhook/sales/bulk', webhookAuth, (req, res) => {
  const db = getDb();
  const { sales } = req.body;

  if (!Array.isArray(sales) || sales.length === 0) {
    return res.status(400).json({ error: 'Le body doit contenir un tableau "sales" non vide' });
  }

  if (sales.length > 100) {
    return res.status(400).json({ error: 'Maximum 100 ventes par requête bulk' });
  }

  const results = [];
  const insertStmt = db.prepare(`
    INSERT INTO sales (sales_rep_id, date, amount, client_first_name, client_last_name, week_start, rib_status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAll = db.transaction(() => {
    for (let i = 0; i < sales.length; i++) {
      const sale = sales[i];
      const { errors, resolvedRepId } = validateSalePayload(sale, db);

      if (errors.length > 0) {
        results.push({ index: i, success: false, errors });
        continue;
      }

      const weekStart = getMonday(sale.date);
      ensureWeeklySettings(weekStart);

      const setting = db.prepare(
        'SELECT locked FROM weekly_settings WHERE week_start = ? AND sales_rep_id = ?'
      ).get(weekStart, resolvedRepId);

      if (setting && setting.locked) {
        results.push({ index: i, success: false, errors: ['Semaine verrouillée : ' + weekStart] });
        continue;
      }

      const ribStatus = sale.rib_status || 'Non fourni';

      const result = insertStmt.run(
        resolvedRepId,
        sale.date,
        sale.amount,
        sale.client_first_name || '',
        sale.client_last_name || '',
        weekStart,
        ribStatus
      );

      results.push({
        index: i,
        success: true,
        id: Number(result.lastInsertRowid),
        week_start: weekStart
      });
    }
  });

  try {
    insertAll();
  } catch (e) {
    return res.status(500).json({ error: 'Erreur bulk insert : ' + e.message });
  }

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  res.status(successCount > 0 ? 201 : 400).json({
    total: sales.length,
    success: successCount,
    failed: failCount,
    results
  });
});

// ─── Webhook: GET /api/webhook/sales-reps ────────────────────

app.get('/api/webhook/sales-reps', webhookAuth, (req, res) => {
  const db = getDb();
  const reps = db.prepare('SELECT id, name, external_id FROM sales_reps ORDER BY id').all();
  res.json(reps);
});

// ─── Webhook: PUT /api/webhook/sales-reps/:id ────────────────

app.put('/api/webhook/sales-reps/:id', webhookAuth, (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const { external_id } = req.body;

  const rep = db.prepare('SELECT * FROM sales_reps WHERE id = ?').get(id);
  if (!rep) return res.status(404).json({ error: 'Commercial non trouvé' });

  if (external_id) {
    const existing = db.prepare('SELECT id FROM sales_reps WHERE external_id = ? AND id != ?').get(external_id, id);
    if (existing) {
      return res.status(409).json({ error: `external_id "${external_id}" est déjà assigné à un autre commercial` });
    }
  }

  db.prepare('UPDATE sales_reps SET external_id = ? WHERE id = ?').run(external_id || null, id);
  res.json({ success: true, id: Number(id), external_id: external_id || null });
});

// ─── Email ──────────────────────────────────────────────────

app.post('/api/email/test', requireAuth, requireAdmin, async (req, res) => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return res.status(503).json({ error: 'Email non configuré. Définissez SMTP_HOST, SMTP_USER et SMTP_PASS dans .env', feature: 'email' });
  }
  const testTo = process.env.SMTP_FROM || process.env.SMTP_USER;
  if (!testTo) {
    return res.status(503).json({ error: 'SMTP_FROM ou SMTP_USER manquant dans .env', feature: 'email' });
  }

  try {
    await verifyConnection();
    const info = await sendEmail({
      to: testTo,
      subject: 'Test Email - App Commerciaux',
      html: '<h2>Test réussi</h2><p>L\'envoi d\'email fonctionne correctement depuis l\'application.</p>',
      text: 'Test réussi. L\'envoi d\'email fonctionne correctement depuis l\'application.',
    });
    console.log('Email de test envoyé:', info.messageId);
    res.json({ success: true, messageId: info.messageId });
  } catch (e) {
    console.error('Erreur envoi email test:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/email/send', requireAuth, requireAdmin, async (req, res) => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return res.status(503).json({ error: 'Email non configuré. Définissez SMTP_HOST, SMTP_USER et SMTP_PASS dans .env', feature: 'email' });
  }

  const { to, subject, html, text } = req.body;

  // Validation
  const errors = [];
  if (!to || typeof to !== 'string' || !to.includes('@')) {
    errors.push('Destinataire (to) invalide');
  }
  if (!subject || typeof subject !== 'string' || !subject.trim()) {
    errors.push('Sujet (subject) requis');
  }
  if (!html && !text) {
    errors.push('Corps du message (html ou text) requis');
  }
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation échouée', details: errors });
  }

  try {
    const info = await sendEmail({ to: to.trim(), subject: subject.trim(), html, text });
    console.log('Email envoyé à', to, ':', info.messageId);
    res.json({ success: true, messageId: info.messageId });
  } catch (e) {
    console.error('Erreur envoi email:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Admin Notes (Remarques) ────────────────────────────────

app.get('/api/notes', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const notes = db.prepare('SELECT * FROM admin_notes ORDER BY updated_at DESC').all();
  res.json(notes);
});

app.post('/api/notes', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Contenu requis' });
  const result = db.prepare('INSERT INTO admin_notes (content) VALUES (?)').run(content.trim());
  const note = db.prepare('SELECT * FROM admin_notes WHERE id = ?').get(result.lastInsertRowid);
  res.json(note);
});

app.put('/api/notes/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Contenu requis' });
  db.prepare("UPDATE admin_notes SET content = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(content.trim(), req.params.id);
  const note = db.prepare('SELECT * FROM admin_notes WHERE id = ?').get(req.params.id);
  if (!note) return res.status(404).json({ error: 'Note introuvable' });
  res.json(note);
});

app.delete('/api/notes/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM admin_notes WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Note introuvable' });
  res.json({ success: true });
});

// ─── Action Day Remarks ────────────────────────────────────
app.get('/api/action-remarks/:weekStart', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const weekStart = req.params.weekStart;
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }
  const rows = db.prepare(`
    SELECT sales_rep_id, date, remark FROM action_day_remarks
    WHERE date >= ? AND date <= ?
  `).all(days[0], days[6]);
  // Return as { "repId:date": remark }
  const map = {};
  rows.forEach(r => { map[`${r.sales_rep_id}:${r.date}`] = r.remark; });
  res.json(map);
});

app.put('/api/action-remarks/:sales_rep_id/:date', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { sales_rep_id, date } = req.params;
  const { remark } = req.body;
  db.prepare(`
    INSERT INTO action_day_remarks (sales_rep_id, date, remark)
    VALUES (?, ?, ?)
    ON CONFLICT(sales_rep_id, date) DO UPDATE SET remark = excluded.remark
  `).run(parseInt(sales_rep_id), date, remark || '');
  res.json({ ok: true });
});

// ─── PERSO: Workout tracking V2 (admin only) ────────────────

// ═══ Helper: compute 1RM Epley ═══
function estimated1RM(weight, reps) {
  if (!weight || !reps || reps <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

// ═══ Helper: check & update PRs after a set is completed ═══
function checkAndUpdatePRs(db, exerciseId, sessionId, setLogId, weight, reps) {
  const prs = [];
  if (!weight || weight <= 0 || !reps || reps <= 0) return prs;

  // max_weight
  const curMaxWeight = db.prepare("SELECT * FROM personal_records WHERE exercise_id = ? AND record_type = 'max_weight'").get(exerciseId);
  if (!curMaxWeight || weight > curMaxWeight.value) {
    db.prepare("DELETE FROM personal_records WHERE exercise_id = ? AND record_type = 'max_weight'").run(exerciseId);
    db.prepare("INSERT INTO personal_records (exercise_id, record_type, value, unit, session_id, set_log_id, previous_value) VALUES (?, 'max_weight', ?, 'kg', ?, ?, ?)").run(exerciseId, weight, sessionId, setLogId, curMaxWeight?.value || null);
    prs.push({ type: 'max_weight', value: weight, prev: curMaxWeight?.value, unit: 'kg' });
  }

  // estimated_1rm (only if reps <= 12 for formula reliability)
  if (reps <= 12) {
    const e1rm = Math.round(estimated1RM(weight, reps) * 10) / 10;
    const curE1rm = db.prepare("SELECT * FROM personal_records WHERE exercise_id = ? AND record_type = 'estimated_1rm'").get(exerciseId);
    if (!curE1rm || e1rm > curE1rm.value) {
      db.prepare("DELETE FROM personal_records WHERE exercise_id = ? AND record_type = 'estimated_1rm'").run(exerciseId);
      db.prepare("INSERT INTO personal_records (exercise_id, record_type, value, unit, session_id, set_log_id, previous_value) VALUES (?, 'estimated_1rm', ?, 'kg', ?, ?, ?)").run(exerciseId, e1rm, sessionId, setLogId, curE1rm?.value || null);
      prs.push({ type: 'estimated_1rm', value: e1rm, prev: curE1rm?.value, unit: 'kg' });
    }
  }

  // max_volume_set (weight * reps for single set)
  const vol = weight * reps;
  const curMaxVol = db.prepare("SELECT * FROM personal_records WHERE exercise_id = ? AND record_type = 'max_volume_set'").get(exerciseId);
  if (!curMaxVol || vol > curMaxVol.value) {
    db.prepare("DELETE FROM personal_records WHERE exercise_id = ? AND record_type = 'max_volume_set'").run(exerciseId);
    db.prepare("INSERT INTO personal_records (exercise_id, record_type, value, unit, session_id, set_log_id, previous_value) VALUES (?, 'max_volume_set', ?, 'kg', ?, ?, ?)").run(exerciseId, vol, sessionId, setLogId, curMaxVol?.value || null);
    prs.push({ type: 'max_volume_set', value: vol, prev: curMaxVol?.value, unit: 'kg' });
  }

  // Mark set_log is_pr
  if (prs.length > 0) {
    db.prepare("UPDATE perso_set_logs SET is_pr = 1 WHERE id = ?").run(setLogId);
  }

  return prs;
}

// ═══ Helper: progressive overload suggestion ═══
function getProgressionSuggestion(db, exerciseId, energyLevel) {
  // Find last completed exercise log with set_logs
  const lastPerf = db.prepare(`
    SELECT p.id, p.session_id, p.date, e.body_part, e.target_reps, e.target_sets
    FROM perso_performances p
    JOIN perso_exercises e ON e.id = p.exercise_id
    JOIN perso_sessions s ON s.id = p.session_id
    WHERE p.exercise_id = ? AND s.status = 'completed'
    ORDER BY p.date DESC, p.id DESC LIMIT 1
  `).get(exerciseId);

  if (!lastPerf) return null;

  const lastSets = db.prepare(`
    SELECT * FROM perso_set_logs
    WHERE performance_id = ? AND is_warmup = 0 AND completed = 1
    ORDER BY set_number
  `).all(lastPerf.id);

  if (lastSets.length === 0) return null;

  const targetReps = lastPerf.target_reps || 10;
  const allHitTarget = lastSets.every(s => s.reps >= targetReps);
  const increment = lastPerf.body_part === 'lower' ? 5 : 2.5;

  let suggestedWeight = lastSets[0]?.weight_kg || 0;
  let suggestedReps = targetReps;
  let message = '';

  if (allHitTarget) {
    suggestedWeight = suggestedWeight + increment;
    message = `Toutes les séries à ${targetReps} reps atteintes. +${increment} kg`;
  } else {
    message = `Reps incomplètes. Même charge, vise ${targetReps} reps partout`;
  }

  // Low energy adjustment
  if (energyLevel && energyLevel <= 2) {
    suggestedWeight = Math.round((suggestedWeight * 0.95) * 2) / 2; // round to 0.5
    message += ' (énergie basse: -5%)';
  }

  return {
    lastDate: lastPerf.date,
    lastSets: lastSets.map(s => ({ weight_kg: s.weight_kg, reps: s.reps })),
    suggestedWeight: Math.round(suggestedWeight * 2) / 2, // round to 0.5
    suggestedReps,
    suggestedSets: lastPerf.target_sets || lastSets.length || 3,
    message
  };
}

// ═══ Exercises ═══════════════════════════════════════════════

app.get('/api/perso/exercises', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { q } = req.query;
  let rows;
  if (q && q.trim()) {
    rows = db.prepare("SELECT * FROM perso_exercises WHERE LOWER(name) LIKE ? ORDER BY name LIMIT 20").all('%' + q.trim().toLowerCase() + '%');
  } else {
    rows = db.prepare('SELECT * FROM perso_exercises ORDER BY name').all();
  }
  res.json(rows);
});

app.get('/api/perso/exercises/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const ex = db.prepare('SELECT * FROM perso_exercises WHERE id = ?').get(id);
  if (!ex) return res.status(404).json({ error: 'Exercice introuvable' });

  // Personal records
  ex.records = db.prepare("SELECT * FROM personal_records WHERE exercise_id = ? ORDER BY record_type").all(id);

  // Last completed performance with sets
  const lastPerf = db.prepare(`
    SELECT p.id, p.date FROM perso_performances p
    JOIN perso_sessions s ON s.id = p.session_id
    WHERE p.exercise_id = ? AND s.status = 'completed'
    ORDER BY p.date DESC, p.id DESC LIMIT 1
  `).get(id);
  if (lastPerf) {
    ex.last = {
      date: lastPerf.date,
      sets: db.prepare("SELECT weight_kg, reps FROM perso_set_logs WHERE performance_id = ? AND is_warmup = 0 AND completed = 1 ORDER BY set_number").all(lastPerf.id)
    };
  }

  // Backward compat: old-style last for display
  const oldLast = db.prepare("SELECT * FROM perso_performances WHERE exercise_id = ? AND (charge > 0 OR reps > 0) ORDER BY date DESC, id DESC LIMIT 1").get(id);
  ex.lastLegacy = oldLast;

  res.json(ex);
});

app.post('/api/perso/exercises', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { name, muscle_group, goal_charge, body_part, exercise_type, target_sets, target_reps, default_rest_seconds, video_url } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nom requis' });
  const trimmed = name.trim();
  let ex = db.prepare('SELECT * FROM perso_exercises WHERE LOWER(name) = LOWER(?)').get(trimmed);
  if (!ex) {
    const result = db.prepare(`
      INSERT INTO perso_exercises (name, muscle_group, goal_charge, body_part, exercise_type, target_sets, target_reps, default_rest_seconds, video_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(trimmed, muscle_group || '', goal_charge || null, body_part || 'upper', exercise_type || 'compound', target_sets || 3, target_reps || 10, default_rest_seconds || 120, video_url || null);
    ex = db.prepare('SELECT * FROM perso_exercises WHERE id = ?').get(result.lastInsertRowid);
  }
  res.json(ex);
});

app.put('/api/perso/exercises/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const { muscle_group, goal_charge, body_part, exercise_type, target_sets, target_reps, default_rest_seconds, video_url } = req.body;
  const fields = [];
  const vals = [];
  if (muscle_group !== undefined) { fields.push('muscle_group = ?'); vals.push(muscle_group); }
  if (goal_charge !== undefined) { fields.push('goal_charge = ?'); vals.push(goal_charge); }
  if (body_part !== undefined) { fields.push('body_part = ?'); vals.push(body_part); }
  if (exercise_type !== undefined) { fields.push('exercise_type = ?'); vals.push(exercise_type); }
  if (target_sets !== undefined) { fields.push('target_sets = ?'); vals.push(target_sets); }
  if (target_reps !== undefined) { fields.push('target_reps = ?'); vals.push(target_reps); }
  if (default_rest_seconds !== undefined) { fields.push('default_rest_seconds = ?'); vals.push(default_rest_seconds); }
  if (video_url !== undefined) { fields.push('video_url = ?'); vals.push(video_url || null); }
  if (fields.length > 0) {
    vals.push(id);
    db.prepare(`UPDATE perso_exercises SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  }
  res.json({ ok: true });
});

app.delete('/api/perso/exercises/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM perso_exercises WHERE id = ?').run(parseInt(req.params.id));
  res.json({ ok: true });
});

// Exercise history V2 (aggregated per session)
app.get('/api/perso/exercises/:id/history', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const exId = parseInt(req.params.id);
  const { period } = req.query; // '1m', '3m', '6m', '1y', 'all'
  let dateFilter = '';
  if (period && period !== 'all') {
    const months = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 }[period] || 3;
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    dateFilter = ` AND p.date >= '${d.toISOString().slice(0, 10)}'`;
  }
  const rows = db.prepare(`
    SELECT p.id, p.date, p.feeling,
           e.name as exercise_name
    FROM perso_performances p
    JOIN perso_exercises e ON e.id = p.exercise_id
    WHERE p.exercise_id = ?${dateFilter}
    ORDER BY p.date ASC, p.id ASC
  `).all(exId);

  const getSetLogs = db.prepare("SELECT * FROM perso_set_logs WHERE performance_id = ? AND is_warmup = 0 AND completed = 1 ORDER BY set_number");

  const history = rows.map(r => {
    const sets = getSetLogs.all(r.id);
    const maxWeight = sets.reduce((m, s) => Math.max(m, s.weight_kg || 0), 0);
    const totalVolume = sets.reduce((v, s) => v + (s.weight_kg || 0) * (s.reps || 0), 0);
    const best1RM = sets.filter(s => s.reps <= 12).reduce((m, s) => Math.max(m, estimated1RM(s.weight_kg || 0, s.reps || 0)), 0);
    return {
      date: r.date,
      feeling: r.feeling,
      sets: sets.map(s => ({ weight_kg: s.weight_kg, reps: s.reps, is_pr: !!s.is_pr })),
      maxWeight,
      totalVolume,
      estimated1RM: Math.round(best1RM * 10) / 10
    };
  });
  res.json(history);
});

// Exercise records
app.get('/api/perso/exercises/:id/records', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const records = db.prepare("SELECT * FROM personal_records WHERE exercise_id = ? ORDER BY record_type").all(parseInt(req.params.id));
  res.json(records);
});

// ═══ Templates ═══════════════════════════════════════════════

app.get('/api/perso/templates', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const templates = db.prepare('SELECT * FROM perso_templates ORDER BY favorite DESC, name').all();
  const getExercises = db.prepare(`
    SELECT te.sort_order, te.target_sets, te.target_reps, te.superset_group,
           e.id, e.name, e.muscle_group, e.body_part, e.exercise_type, e.goal_charge,
           e.default_rest_seconds, e.target_sets as ex_target_sets, e.target_reps as ex_target_reps, e.video_url
    FROM perso_template_exercises te
    JOIN perso_exercises e ON e.id = te.exercise_id
    WHERE te.template_id = ?
    ORDER BY te.sort_order, te.id
  `);
  const getLastUsed = db.prepare(
    'SELECT MAX(date) AS last_used FROM perso_sessions WHERE template_id = ?'
  );
  templates.forEach(t => {
    t.exercises = getExercises.all(t.id);
    t.last_used = getLastUsed.get(t.id)?.last_used || null;
  });
  res.json(templates);
});

app.post('/api/perso/templates', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { name, exercise_ids, superset_groups } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nom requis' });
  const result = db.prepare('INSERT INTO perso_templates (name) VALUES (?)').run(name.trim());
  const tid = result.lastInsertRowid;
  if (Array.isArray(exercise_ids)) {
    const insert = db.prepare('INSERT INTO perso_template_exercises (template_id, exercise_id, sort_order, superset_group) VALUES (?, ?, ?, ?)');
    exercise_ids.forEach((eid, i) => insert.run(tid, eid, i, superset_groups?.[i] || null));
  }
  res.json({ id: tid });
});

app.put('/api/perso/templates/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const { name, favorite, exercise_ids, superset_groups } = req.body;
  if (name !== undefined) db.prepare('UPDATE perso_templates SET name = ? WHERE id = ?').run(name.trim(), id);
  if (favorite !== undefined) db.prepare('UPDATE perso_templates SET favorite = ? WHERE id = ?').run(favorite ? 1 : 0, id);
  if (Array.isArray(exercise_ids)) {
    db.prepare('DELETE FROM perso_template_exercises WHERE template_id = ?').run(id);
    const insert = db.prepare('INSERT INTO perso_template_exercises (template_id, exercise_id, sort_order, superset_group) VALUES (?, ?, ?, ?)');
    exercise_ids.forEach((eid, i) => insert.run(id, eid, i, superset_groups?.[i] || null));
  }
  res.json({ ok: true });
});

app.delete('/api/perso/templates/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM perso_templates WHERE id = ?').run(parseInt(req.params.id));
  res.json({ ok: true });
});

// ═══ Sessions & Performances V2 ═════════════════════════════

// Get session by date (with full set_logs + suggestions)
// Sessions range (for calendar)
app.get('/api/perso/sessions/range', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });
  const rows = db.prepare(`
    SELECT id, date, status, name, template_id, started_at, ended_at
    FROM perso_sessions
    WHERE date >= ? AND date <= ?
    ORDER BY date ASC
  `).all(from, to);
  // Include performances for volume calculation
  const perfStmt = db.prepare(`SELECT p.id, p.exercise_id, e.name as exercise_name,
    (SELECT json_group_array(json_object('id', sl.id, 'weight_kg', sl.weight_kg, 'reps', sl.reps, 'completed', sl.completed, 'is_warmup', sl.is_warmup))
     FROM perso_set_logs sl WHERE sl.performance_id = p.id) as set_logs_json
    FROM perso_performances p JOIN perso_exercises e ON e.id = p.exercise_id WHERE p.session_id = ?`);
  rows.forEach(r => {
    const perfs = perfStmt.all(r.id);
    r.performances = perfs.map(p => ({ ...p, set_logs: JSON.parse(p.set_logs_json || '[]') }));
  });
  res.json(rows);
});

// Recent PRs
app.get('/api/perso/records/recent', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const limit = parseInt(req.query.limit) || 5;
  const rows = db.prepare(`
    SELECT r.*, e.name as exercise_name
    FROM personal_records r
    JOIN perso_exercises e ON e.id = r.exercise_id
    ORDER BY r.achieved_at DESC, r.id DESC
    LIMIT ?
  `).all(limit);
  res.json(rows);
});

app.get('/api/perso/sessions/:date', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { date } = req.params;
  let session = db.prepare('SELECT * FROM perso_sessions WHERE date = ? ORDER BY id DESC LIMIT 1').get(date);
  if (!session) return res.json(null);

  // Get daily energy for progressive overload suggestions
  const daily = db.prepare('SELECT energy FROM perso_daily WHERE date = ?').get(date);
  const energyLevel = daily?.energy || null;

  const performances = db.prepare(`
    SELECT p.*, e.name as exercise_name, e.muscle_group, e.goal_charge,
           e.body_part, e.exercise_type, e.target_sets as ex_target_sets,
           e.target_reps as ex_target_reps, e.default_rest_seconds, e.video_url
    FROM perso_performances p
    JOIN perso_exercises e ON e.id = p.exercise_id
    WHERE p.session_id = ?
    ORDER BY p.sort_order, p.id
  `).all(session.id);

  const getSetLogs = db.prepare("SELECT * FROM perso_set_logs WHERE performance_id = ? ORDER BY set_number");

  performances.forEach(p => {
    p.set_logs = getSetLogs.all(p.id);
    // Progressive overload suggestion
    p.suggestion = getProgressionSuggestion(db, p.exercise_id, energyLevel);
    // Records for this exercise
    p.records = db.prepare("SELECT record_type, value, unit FROM personal_records WHERE exercise_id = ?").all(p.exercise_id);
  });

  session.performances = performances;
  session.energy_level = session.energy_level || energyLevel;
  res.json(session);
});

// List sessions for a month (for calendar)
app.get('/api/perso/sessions', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { month } = req.query; // 'YYYY-MM'
  if (!month) return res.status(400).json({ error: 'month requis' });
  const rows = db.prepare(`
    SELECT id, date, status, name, template_id, started_at, ended_at
    FROM perso_sessions
    WHERE date LIKE ?
    ORDER BY date ASC
  `).all(month + '%');
  res.json(rows);
});

// Create session
app.post('/api/perso/sessions', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { date, template_id } = req.body;
  if (!date) return res.status(400).json({ error: 'Date requise' });

  let sessionName = 'Séance libre';
  if (template_id) {
    const tpl = db.prepare('SELECT name FROM perso_templates WHERE id = ?').get(template_id);
    if (tpl) sessionName = tpl.name;
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const result = db.prepare(`
    INSERT INTO perso_sessions (date, template_id, name, started_at, status) VALUES (?, ?, ?, ?, 'in_progress')
  `).run(date, template_id || null, sessionName, now);
  const sid = result.lastInsertRowid;

  // If template, pre-create performances with set_logs pre-filled from suggestion
  if (template_id) {
    const exs = db.prepare(`
      SELECT te.exercise_id, te.sort_order, te.target_sets, te.target_reps, te.superset_group,
             e.target_sets as ex_target_sets, e.target_reps as ex_target_reps
      FROM perso_template_exercises te
      JOIN perso_exercises e ON e.id = te.exercise_id
      WHERE te.template_id = ? ORDER BY te.sort_order
    `).all(template_id);

    const daily = db.prepare('SELECT energy FROM perso_daily WHERE date = ?').get(date);
    const energy = daily?.energy || null;

    const insertPerf = db.prepare("INSERT INTO perso_performances (session_id, exercise_id, charge, sets, reps, feeling, date, sort_order, superset_group) VALUES (?, ?, 0, 0, 0, 'moyen', ?, ?, ?)");
    const insertSet = db.prepare("INSERT INTO perso_set_logs (performance_id, set_number, weight_kg, reps, completed) VALUES (?, ?, ?, ?, 0)");

    exs.forEach(e => {
      const perfResult = insertPerf.run(sid, e.exercise_id, date, e.sort_order, e.superset_group || null);
      const perfId = perfResult.lastInsertRowid;
      const suggestion = getProgressionSuggestion(db, e.exercise_id, energy);
      const nSets = e.target_sets || e.ex_target_sets || 3;
      const targetReps = e.target_reps || e.ex_target_reps || 10;
      for (let i = 0; i < nSets; i++) {
        insertSet.run(perfId, i + 1, suggestion?.suggestedWeight || 0, suggestion?.suggestedReps || targetReps);
      }
    });
  }

  res.json({ id: sid });
});

// Update session (status, notes, end)
app.put('/api/perso/sessions/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const { status, notes, body_weight_kg, energy_level, name } = req.body;
  const fields = [];
  const vals = [];
  if (status !== undefined) {
    fields.push('status = ?'); vals.push(status);
    if (status === 'completed') {
      fields.push('ended_at = ?'); vals.push(new Date().toISOString().replace('T', ' ').slice(0, 19));
      // Recalculate max_total_tonnage PR for each exercise in this session
      const perfs = db.prepare("SELECT id, exercise_id FROM perso_performances WHERE session_id = ?").all(id);
      const session = db.prepare("SELECT id FROM perso_sessions WHERE id = ?").get(id);
      for (const p of perfs) {
        const sets = db.prepare("SELECT weight_kg, reps FROM perso_set_logs WHERE performance_id = ? AND is_warmup = 0 AND completed = 1").all(p.id);
        const tonnage = sets.reduce((s, x) => s + (x.weight_kg || 0) * (x.reps || 0), 0);
        if (tonnage > 0) {
          const cur = db.prepare("SELECT * FROM personal_records WHERE exercise_id = ? AND record_type = 'max_total_tonnage'").get(p.exercise_id);
          if (!cur || tonnage > cur.value) {
            db.prepare("DELETE FROM personal_records WHERE exercise_id = ? AND record_type = 'max_total_tonnage'").run(p.exercise_id);
            db.prepare("INSERT INTO personal_records (exercise_id, record_type, value, unit, session_id, previous_value) VALUES (?, 'max_total_tonnage', ?, 'kg', ?, ?)").run(p.exercise_id, tonnage, id, cur?.value || null);
          }
        }
      }
    }
  }
  if (notes !== undefined) { fields.push('notes = ?'); vals.push(notes); }
  if (body_weight_kg !== undefined) { fields.push('body_weight_kg = ?'); vals.push(body_weight_kg); }
  if (energy_level !== undefined) { fields.push('energy_level = ?'); vals.push(energy_level); }
  if (name !== undefined) { fields.push('name = ?'); vals.push(name); }
  if (fields.length > 0) {
    vals.push(id);
    db.prepare(`UPDATE perso_sessions SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  }
  res.json({ ok: true });
});

app.delete('/api/perso/sessions/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM perso_sessions WHERE id = ?').run(parseInt(req.params.id));
  res.json({ ok: true });
});

// Add performance (exercise_log) to session
app.post('/api/perso/sessions/:id/performances', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const session_id = parseInt(req.params.id);
  const { exercise_id, date } = req.body;
  if (!exercise_id) return res.status(400).json({ error: 'Exercice requis' });
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 as n FROM perso_performances WHERE session_id = ?').get(session_id).n;
  const result = db.prepare("INSERT INTO perso_performances (session_id, exercise_id, charge, sets, reps, feeling, date, sort_order) VALUES (?, ?, 0, 0, 0, 'moyen', ?, ?)").run(session_id, exercise_id, date, maxOrder);
  const perfId = result.lastInsertRowid;

  // Pre-create set_logs with suggestion
  const session = db.prepare('SELECT * FROM perso_sessions WHERE id = ?').get(session_id);
  const daily = db.prepare('SELECT energy FROM perso_daily WHERE date = ?').get(session?.date || date);
  const ex = db.prepare('SELECT * FROM perso_exercises WHERE id = ?').get(exercise_id);
  const suggestion = getProgressionSuggestion(db, exercise_id, daily?.energy || null);
  const nSets = ex?.target_sets || 3;
  const targetReps = ex?.target_reps || 10;
  const insertSet = db.prepare("INSERT INTO perso_set_logs (performance_id, set_number, weight_kg, reps, completed) VALUES (?, ?, ?, ?, 0)");
  for (let i = 0; i < nSets; i++) {
    insertSet.run(perfId, i + 1, suggestion?.suggestedWeight || 0, suggestion?.suggestedReps || targetReps);
  }

  res.json({ id: perfId });
});

// Update performance feeling/notes
app.put('/api/perso/performances/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const { feeling, notes } = req.body;
  const fields = [];
  const vals = [];
  if (feeling !== undefined) { fields.push('feeling = ?'); vals.push(feeling); }
  if (notes !== undefined) { fields.push('notes = ?'); vals.push(notes); }
  if (fields.length > 0) {
    vals.push(id);
    db.prepare(`UPDATE perso_performances SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  }
  res.json({ ok: true });
});

app.delete('/api/perso/performances/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM perso_performances WHERE id = ?').run(parseInt(req.params.id));
  res.json({ ok: true });
});

// ═══ Set Logs ════════════════════════════════════════════════

// Add a set to a performance
app.post('/api/perso/performances/:id/sets', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const perfId = parseInt(req.params.id);
  const { weight_kg, reps, is_warmup } = req.body;
  const maxNum = db.prepare('SELECT COALESCE(MAX(set_number), 0) + 1 as n FROM perso_set_logs WHERE performance_id = ?').get(perfId).n;
  const result = db.prepare("INSERT INTO perso_set_logs (performance_id, set_number, weight_kg, reps, is_warmup, completed) VALUES (?, ?, ?, ?, ?, 0)").run(perfId, maxNum, weight_kg || 0, reps || 0, is_warmup ? 1 : 0);
  res.json({ id: result.lastInsertRowid, set_number: maxNum });
});

// Update a set (weight, reps, rpe, rir, completed)
app.put('/api/perso/set-logs/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const { weight_kg, reps, rpe, rir, is_warmup, completed, rest_seconds } = req.body;

  const fields = [];
  const vals = [];
  if (weight_kg !== undefined) { fields.push('weight_kg = ?'); vals.push(weight_kg); }
  if (reps !== undefined) { fields.push('reps = ?'); vals.push(reps); }
  if (rpe !== undefined) { fields.push('rpe = ?'); vals.push(rpe); }
  if (rir !== undefined) { fields.push('rir = ?'); vals.push(rir); }
  if (is_warmup !== undefined) { fields.push('is_warmup = ?'); vals.push(is_warmup ? 1 : 0); }
  if (rest_seconds !== undefined) { fields.push('rest_seconds = ?'); vals.push(rest_seconds); }
  if (completed !== undefined) { fields.push('completed = ?'); vals.push(completed ? 1 : 0); }

  if (fields.length > 0) {
    vals.push(id);
    db.prepare(`UPDATE perso_set_logs SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  }

  // PR check when completing a set
  let prs = [];
  if (completed) {
    const setLog = db.prepare("SELECT sl.*, p.exercise_id, p.session_id FROM perso_set_logs sl JOIN perso_performances p ON p.id = sl.performance_id WHERE sl.id = ?").get(id);
    if (setLog && !setLog.is_warmup) {
      prs = checkAndUpdatePRs(db, setLog.exercise_id, setLog.session_id, id, setLog.weight_kg, setLog.reps);
    }
  }

  res.json({ ok: true, prs });
});

// Delete a set
app.delete('/api/perso/set-logs/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM perso_set_logs WHERE id = ?').run(parseInt(req.params.id));
  res.json({ ok: true });
});

// ═══ Daily tracking (weight, energy) ════════════════════════

app.get('/api/perso/daily/:date', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM perso_daily WHERE date = ?').get(req.params.date);
  res.json(row || { date: req.params.date, weight: null, energy: null });
});

app.put('/api/perso/daily/:date', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { date } = req.params;
  const { weight, energy } = req.body;
  db.prepare(`
    INSERT INTO perso_daily (date, weight, energy) VALUES (?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      weight = COALESCE(excluded.weight, perso_daily.weight),
      energy = COALESCE(excluded.energy, perso_daily.energy)
  `).run(date, weight !== undefined ? weight : null, energy !== undefined ? energy : null);
  res.json({ ok: true });
});

// ─── Task Vault (Kanban board) ──────────────────────────────

// Resolve current user's key string ("admin" or "rep:<id>")
function getUserKey(session) {
  if (!session) return null;
  if (session.role === 'admin') return 'admin';
  return session.sales_rep_id ? `rep:${session.sales_rep_id}` : null;
}

// Display name for a userKey
function userKeyToName(db, userKey) {
  if (!userKey) return '';
  if (userKey === 'admin') return 'Stan';
  const m = userKey.match(/^rep:(\d+)$/);
  if (m) {
    const row = db.prepare('SELECT name FROM sales_reps WHERE id = ?').get(parseInt(m[1], 10));
    return row?.name || 'Inconnu';
  }
  return userKey;
}

// Ensure a user has at least the default columns; if zero, seed.
function ensureUserColumns(db, userKey) {
  const count = db.prepare('SELECT COUNT(*) AS c FROM task_columns WHERE created_by = ?').get(userKey).c;
  if (count === 0) {
    const ins = db.prepare('INSERT INTO task_columns (name, color, position, created_by) VALUES (?, ?, ?, ?)');
    ins.run('Demain', '#6366F1', 0, userKey);
    ins.run('En attente', '#EC4899', 1, userKey);
  }
}

// Verify ownership before any write: throws 403 if not creator nor admin
function assertOwnTaskOrAdmin(req, taskId) {
  const db = getDb();
  const row = db.prepare('SELECT created_by FROM tasks WHERE id = ?').get(taskId);
  if (!row) return { ok: false, code: 404, msg: 'Tâche introuvable' };
  const userKey = getUserKey(req.session);
  if (req.session.role === 'admin') return { ok: true, row };
  if (row.created_by === userKey) return { ok: true, row };
  return { ok: false, code: 403, msg: 'Tâche non autorisée' };
}

function assertOwnColumnOrAdmin(req, colId) {
  const db = getDb();
  const row = db.prepare('SELECT created_by FROM task_columns WHERE id = ?').get(colId);
  if (!row) return { ok: false, code: 404, msg: 'Colonne introuvable' };
  const userKey = getUserKey(req.session);
  if (req.session.role === 'admin') return { ok: true, row };
  if (row.created_by === userKey) return { ok: true, row };
  return { ok: false, code: 403, msg: 'Colonne non autorisée' };
}

// List of all users (for admin: pick a board to view OR pick an assignee)
app.get('/api/tasks/users', requireAuth, (req, res) => {
  const db = getDb();
  const reps = db.prepare('SELECT id, name, role FROM sales_reps WHERE archived = 0 ORDER BY name ASC').all();
  const users = [
    { key: 'admin', name: 'Stan', role: 'admin' },
    ...reps.map(r => ({ key: `rep:${r.id}`, name: r.name, role: r.role || 'commercial' }))
  ];
  res.json(users);
});

// GET all columns with their tasks (scoped to current user, or to ?as=<userKey> for admin)
app.get('/api/tasks/board', requireAuth, (req, res) => {
  const db = getDb();
  let userKey = getUserKey(req.session);
  // Admin can view another user's board with ?as=<userKey>
  if (req.session.role === 'admin' && req.query.as) {
    userKey = String(req.query.as);
  }
  if (!userKey) return res.status(400).json({ error: 'User key indisponible' });

  ensureUserColumns(db, userKey);

  const columns = db.prepare('SELECT id, name, color, position FROM task_columns WHERE created_by = ? ORDER BY position ASC, id ASC').all(userKey);

  // Own tasks: created_by = userKey AND column belongs to userKey
  const ownTasks = db.prepare(`
    SELECT id, column_id, parent_id, text, highlighted, completed, position, due, description, tags, created_by, assigned_to, created_at
    FROM tasks
    WHERE created_by = ? AND column_id IN (SELECT id FROM task_columns WHERE created_by = ?)
    ORDER BY position ASC, id ASC
  `).all(userKey, userKey);

  // Assigned tasks: assigned_to = userKey AND created by someone else
  // These will be displayed in a virtual column "📌 Assignées à moi"
  const assignedTasks = db.prepare(`
    SELECT id, column_id, parent_id, text, highlighted, completed, position, due, description, tags, created_by, assigned_to, created_at
    FROM tasks
    WHERE assigned_to = ? AND created_by != ?
    ORDER BY position ASC, id ASC
  `).all(userKey, userKey);

  const enrich = (t) => {
    try { t.tags = t.tags ? JSON.parse(t.tags) : []; } catch { t.tags = []; }
    t.created_by_name = userKeyToName(db, t.created_by);
    t.assigned_to_name = t.assigned_to ? userKeyToName(db, t.assigned_to) : null;
  };
  ownTasks.forEach(enrich);
  assignedTasks.forEach(enrich);

  // Build the board: real columns first
  const byCol = {};
  columns.forEach(c => { byCol[c.id] = { ...c, tasks: [] }; });
  ownTasks.forEach(t => { if (byCol[t.column_id]) byCol[t.column_id].tasks.push(t); });

  const result = Object.values(byCol);

  // Add virtual "Assignées à moi" column if there are any assigned tasks
  if (assignedTasks.length > 0) {
    // Re-assign column_id to virtual id (-1) so the front-end can render them
    assignedTasks.forEach(t => { t.column_id = -1; t.parent_id = null; });
    result.unshift({
      id: -1,
      name: 'Assignées à moi',
      color: '#F59E0B',
      position: -1,
      is_virtual: true,
      tasks: assignedTasks
    });
  }

  res.json({
    board: result,
    viewing_user_key: userKey,
    viewing_user_name: userKeyToName(db, userKey),
    is_viewing_other: userKey !== getUserKey(req.session)
  });
});

// Create a column (scoped to current user, or admin acting "as" a user)
app.post('/api/tasks/columns', requireAuth, (req, res) => {
  const db = getDb();
  const { name, color } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nom requis' });
  let userKey = getUserKey(req.session);
  if (req.session.role === 'admin' && req.body.as) userKey = String(req.body.as);
  if (!userKey) return res.status(400).json({ error: 'User key indisponible' });
  const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) AS p FROM task_columns WHERE created_by = ?').get(userKey).p;
  const info = db.prepare('INSERT INTO task_columns (name, color, position, created_by) VALUES (?, ?, ?, ?)').run(name.trim(), color || '#6366F1', maxPos + 1, userKey);
  res.json({ id: info.lastInsertRowid, name: name.trim(), color: color || '#6366F1', position: maxPos + 1, tasks: [], created_by: userKey });
});

// Update a column (only owner or admin)
app.put('/api/tasks/columns/:id', requireAuth, (req, res) => {
  const check = assertOwnColumnOrAdmin(req, req.params.id);
  if (!check.ok) return res.status(check.code).json({ error: check.msg });
  const db = getDb();
  const { name, color } = req.body;
  const fields = [];
  const values = [];
  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (color !== undefined) { fields.push('color = ?'); values.push(color); }
  if (fields.length === 0) return res.json({ ok: true });
  values.push(req.params.id);
  db.prepare(`UPDATE task_columns SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  res.json({ ok: true });
});

// Delete a column (only owner or admin)
app.delete('/api/tasks/columns/:id', requireAuth, (req, res) => {
  const check = assertOwnColumnOrAdmin(req, req.params.id);
  if (!check.ok) return res.status(check.code).json({ error: check.msg });
  const db = getDb();
  db.prepare('DELETE FROM task_columns WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Create a task (created_by = current user, or admin acting "as" someone)
app.post('/api/tasks', requireAuth, (req, res) => {
  const db = getDb();
  const { column_id, text, parent_id, assigned_to } = req.body;
  if (!column_id || !text || !text.trim()) return res.status(400).json({ error: 'column_id et text requis' });
  // Resolve creator: by default the current user; admin can override with ?as=
  let createdBy = getUserKey(req.session);
  if (req.session.role === 'admin' && req.body.as) createdBy = String(req.body.as);
  if (!createdBy) return res.status(400).json({ error: 'User key indisponible' });
  // Verify column belongs to creator (or admin acting on another user's board)
  const col = db.prepare('SELECT created_by FROM task_columns WHERE id = ?').get(column_id);
  if (!col) return res.status(404).json({ error: 'Colonne introuvable' });
  if (req.session.role !== 'admin' && col.created_by !== createdBy) {
    return res.status(403).json({ error: 'Colonne non autorisée' });
  }
  const maxPos = db.prepare(
    parent_id
      ? 'SELECT COALESCE(MAX(position), -1) AS p FROM tasks WHERE parent_id = ?'
      : 'SELECT COALESCE(MAX(position), -1) AS p FROM tasks WHERE column_id = ? AND parent_id IS NULL'
  ).get(parent_id || column_id).p;
  const info = db.prepare('INSERT INTO tasks (column_id, parent_id, text, position, created_by, assigned_to) VALUES (?, ?, ?, ?, ?, ?)').run(
    column_id, parent_id || null, text.trim(), maxPos + 1, createdBy, assigned_to || null
  );
  res.json({
    id: info.lastInsertRowid,
    column_id, parent_id: parent_id || null,
    text: text.trim(), highlighted: 0, completed: 0, position: maxPos + 1,
    created_by: createdBy, assigned_to: assigned_to || null,
    created_by_name: userKeyToName(db, createdBy),
    assigned_to_name: assigned_to ? userKeyToName(db, assigned_to) : null
  });
});

// Update a task (only owner, assignee or admin)
app.put('/api/tasks/:id', requireAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT created_by, assigned_to FROM tasks WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Tâche introuvable' });
  const userKey = getUserKey(req.session);
  const canEdit = req.session.role === 'admin' || row.created_by === userKey || row.assigned_to === userKey;
  if (!canEdit) return res.status(403).json({ error: 'Tâche non autorisée' });

  const { text, highlighted, completed, column_id, position, parent_id, due, description, tags, assigned_to } = req.body;
  const fields = [];
  const values = [];
  if (text !== undefined) { fields.push('text = ?'); values.push(text); }
  if (highlighted !== undefined) { fields.push('highlighted = ?'); values.push(highlighted ? 1 : 0); }
  if (completed !== undefined) { fields.push('completed = ?'); values.push(completed ? 1 : 0); }
  if (column_id !== undefined) { fields.push('column_id = ?'); values.push(column_id); }
  if (position !== undefined) { fields.push('position = ?'); values.push(position); }
  if (parent_id !== undefined) { fields.push('parent_id = ?'); values.push(parent_id || null); }
  if (due !== undefined) { fields.push('due = ?'); values.push(due || null); }
  if (description !== undefined) { fields.push('description = ?'); values.push(description || null); }
  if (tags !== undefined) { fields.push('tags = ?'); values.push(Array.isArray(tags) ? JSON.stringify(tags) : null); }
  if (assigned_to !== undefined) { fields.push('assigned_to = ?'); values.push(assigned_to || null); }
  if (fields.length === 0) return res.json({ ok: true });
  values.push(req.params.id);
  db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  res.json({ ok: true });
});

// Delete a task (only creator or admin)
app.delete('/api/tasks/:id', requireAuth, (req, res) => {
  const check = assertOwnTaskOrAdmin(req, req.params.id);
  if (!check.ok) return res.status(check.code).json({ error: check.msg });
  const db = getDb();
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Bulk reorder/move tasks (drag & drop)
// Body: { updates: [{ id, column_id, parent_id, position }, ...] }
app.post('/api/tasks/reorder', requireAuth, (req, res) => {
  const db = getDb();
  const { updates } = req.body;
  if (!Array.isArray(updates)) return res.status(400).json({ error: 'updates array required' });
  // Ownership check: all tasks must belong to the current user (or admin can move anything)
  if (req.session.role !== 'admin') {
    const userKey = getUserKey(req.session);
    const checkStmt = db.prepare('SELECT created_by, assigned_to FROM tasks WHERE id = ?');
    for (const u of updates) {
      const r = checkStmt.get(u.id);
      if (!r) return res.status(404).json({ error: `Tâche ${u.id} introuvable` });
      if (r.created_by !== userKey && r.assigned_to !== userKey) {
        return res.status(403).json({ error: `Tâche ${u.id} non autorisée` });
      }
    }
  }
  const stmt = db.prepare('UPDATE tasks SET column_id = ?, parent_id = ?, position = ? WHERE id = ?');
  const tx = db.transaction((updates) => {
    for (const u of updates) stmt.run(u.column_id, u.parent_id || null, u.position, u.id);
  });
  tx(updates);
  res.json({ ok: true });
});

// Restore a deleted task (undo) — preserves created_by/assigned_to from payload
app.post('/api/tasks/restore', requireAuth, (req, res) => {
  const db = getDb();
  const { task, subtasks } = req.body;
  if (!task) return res.status(400).json({ error: 'task required' });
  const userKey = getUserKey(req.session);
  // Only the original creator or admin can restore
  if (req.session.role !== 'admin' && task.created_by !== userKey) {
    return res.status(403).json({ error: 'Tâche non autorisée' });
  }
  const insertTask = db.prepare('INSERT INTO tasks (id, column_id, parent_id, text, highlighted, completed, position, due, description, tags, created_by, assigned_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const tagsToJson = (tags) => Array.isArray(tags) ? JSON.stringify(tags) : (tags || null);
  const tx = db.transaction(() => {
    insertTask.run(task.id, task.column_id, task.parent_id || null, task.text, task.highlighted ? 1 : 0, task.completed ? 1 : 0, task.position, task.due || null, task.description || null, tagsToJson(task.tags), task.created_by || userKey, task.assigned_to || null);
    if (Array.isArray(subtasks)) {
      for (const s of subtasks) {
        insertTask.run(s.id, s.column_id, s.parent_id || null, s.text, s.highlighted ? 1 : 0, s.completed ? 1 : 0, s.position, s.due || null, s.description || null, tagsToJson(s.tags), s.created_by || userKey, s.assigned_to || null);
      }
    }
  });
  try { tx(); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Reorder columns: receives { order: [colId1, colId2, ...] }
app.post('/api/tasks/columns/reorder', requireAuth, (req, res) => {
  const db = getDb();
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' });
  // Verify all columns belong to current user (or admin)
  if (req.session.role !== 'admin') {
    const userKey = getUserKey(req.session);
    const checkStmt = db.prepare('SELECT created_by FROM task_columns WHERE id = ?');
    for (const id of order) {
      const r = checkStmt.get(id);
      if (!r) return res.status(404).json({ error: `Colonne ${id} introuvable` });
      if (r.created_by !== userKey) return res.status(403).json({ error: `Colonne ${id} non autorisée` });
    }
  }
  const stmt = db.prepare('UPDATE task_columns SET position = ? WHERE id = ?');
  const tx = db.transaction(() => {
    order.forEach((id, idx) => stmt.run(idx, id));
  });
  tx();
  res.json({ ok: true });
});

// ─── Admin PIN: change endpoint ─────────────────────────────

app.put('/api/admin/pin', requireAuth, requireAdmin, (req, res) => {
  const { currentPin, newPin } = req.body;
  if (!newPin || typeof newPin !== 'string' || newPin.trim().length < 4) {
    return res.status(400).json({ error: 'Le nouveau PIN doit faire au moins 4 caractères' });
  }
  const db = getDb();
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('admin_pin');
  const stored = (row && row.value) || process.env.ADMIN_PIN || 'ginkgo';
  if (!currentPin || currentPin !== stored) {
    return res.status(403).json({ error: 'PIN actuel incorrect' });
  }
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at) VALUES ('admin_pin', ?, datetime('now','localtime'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(newPin.trim());
  res.json({ ok: true });
});

// ─── Mount COACH routes under /api/coach/* ──────────────────

try {
  const mountCoachRoutes = require('./coach-routes');
  mountCoachRoutes(app, getDb, sessions, { requireAuth, requireAdmin });
  console.log('✓ Routes coaching montées sous /api/coach/*');
} catch (e) {
  console.error('✗ Erreur chargement coach-routes:', e.message);
}

// ─── Start ──────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
  getDb(); // Init DB on startup
});
