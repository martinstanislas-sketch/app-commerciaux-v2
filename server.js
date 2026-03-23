require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const Anthropic = require('@anthropic-ai/sdk').default;
const { getDb, ensureWeeklySettings, generatePin } = require('./db');
const { sendEmail, verifyConnection } = require('./email');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

// ─── Auth Routes ────────────────────────────────────────────

app.post('/api/auth/login', (req, res) => {
  const { pin } = req.body;
  if (!pin || typeof pin !== 'string' || !pin.trim()) {
    return res.status(400).json({ error: 'Code PIN requis' });
  }

  const adminPin = process.env.ADMIN_PIN;

  // Check admin PIN
  if (adminPin && pin.trim() === adminPin) {
    const token = crypto.randomUUID();
    sessions.set(token, { role: 'admin', name: 'Admin', sales_rep_id: null });
    return res.json({ token, role: 'admin', name: 'Admin', sales_rep_id: null });
  }

  // Check commercial / phoneur PIN
  const db = getDb();
  const rep = db.prepare('SELECT id, name, role FROM sales_reps WHERE pin = ? AND archived = 0').get(pin.trim());
  if (rep) {
    const token = crypto.randomUUID();
    const role = rep.role || 'commercial';
    sessions.set(token, { role, name: rep.name, sales_rep_id: rep.id });
    return res.json({ token, role, name: rep.name, sales_rep_id: rep.id });
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

  // Check if name already exists
  const existing = db.prepare('SELECT id FROM sales_reps WHERE LOWER(name) = LOWER(?)').get(trimmedName);
  if (existing) {
    return res.status(409).json({ error: 'Ce nom existe déjà' });
  }

  // Generate PIN
  const allPins = db.prepare('SELECT pin FROM sales_reps WHERE pin IS NOT NULL').all().map(r => r.pin);
  const pin = generatePin(trimmedName, allPins);

  // Compute start_week as Monday of the selected date (or null)
  let startWeek = null;
  if (start_week) {
    startWeek = getMonday(start_week);
  }

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

// ─── GET /api/weeks/:week_start/dashboard ───────────────────

app.get('/api/weeks/:week_start/dashboard', requireAuth, (req, res) => {
  const db = getDb();
  const weekStart = req.params.week_start;

  ensureWeeklySettings(weekStart);

  const reps = db.prepare("SELECT * FROM sales_reps WHERE role != 'phoneur' AND archived = 0 ORDER BY id").all();

  const settings = db.prepare(`
    SELECT ws.*, sr.name as rep_name
    FROM weekly_settings ws
    JOIN sales_reps sr ON sr.id = ws.sales_rep_id
    WHERE ws.week_start = ? AND sr.role != 'phoneur' AND sr.archived = 0
    ORDER BY ws.sales_rep_id
  `).all(weekStart);

  const salesByRep = db.prepare(`
    SELECT sales_rep_id,
           COALESCE(SUM(amount), 0) as total_ca,
           COUNT(*) as nb_ventes
    FROM sales
    WHERE week_start = ?
    GROUP BY sales_rep_id
  `).all(weekStart);

  const salesMap = {};
  for (const s of salesByRep) {
    salesMap[s.sales_rep_id] = s;
  }

  // Count missing RIBs per rep for this week
  const ribManquants = db.prepare(`
    SELECT sales_rep_id, COUNT(*) as count
    FROM sales
    WHERE week_start = ? AND rib_status != 'Reçu'
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
  const { hours_worked, target_per_hour } = req.body;

  ensureWeeklySettings(week_start);

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
  const { sales_rep_id, date, amount, client_first_name, client_last_name, rib_status, client_email } = req.body;

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

  const result = db.prepare(`
    INSERT INTO sales (sales_rep_id, date, amount, client_first_name, client_last_name, week_start, rib_status, client_email)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(sales_rep_id, date, amount, client_first_name || '', client_last_name || '', weekStart, rib_status || 'Non fourni', client_email || '');

  res.json({ id: result.lastInsertRowid });
});

// ─── PUT /api/sales/:id ─────────────────────────────────────

app.put('/api/sales/:id', requireAuth, (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const { sales_rep_id, date, amount, client_first_name, client_last_name, rib_status, client_email } = req.body;

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
    UPDATE sales SET sales_rep_id = ?, date = ?, amount = ?, client_first_name = ?, client_last_name = ?, week_start = ?, rib_status = ?, client_email = ?
    WHERE id = ?
  `).run(sales_rep_id, date, amount, client_first_name || '', client_last_name || '', weekStart, rib_status || 'Non fourni', client_email || '', id);

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

  // Find all week_starts that overlap with this month
  const year = parseInt(month.split('-')[0]);
  const mon = parseInt(month.split('-')[1]);
  const firstDay = `${month}-01`;
  const lastDay = new Date(year, mon, 0).toISOString().slice(0, 10);

  // Weeks that have at least one day in this month:
  // week_start <= lastDay AND week_end (week_start + 6 days) >= firstDay
  // Only include commercial reps active during this month (exclude phoneurs)
  const reps = db.prepare("SELECT * FROM sales_reps WHERE role != 'phoneur' AND archived = 0 AND (start_week IS NULL OR start_week <= ?) ORDER BY id").all(lastDay);

  // Get all sales in this month (by date, not week_start)
  const allSales = db.prepare(`
    SELECT s.*, sr.name as rep_name
    FROM sales s
    JOIN sales_reps sr ON sr.id = s.sales_rep_id
    WHERE s.date >= ? AND s.date <= ?
    ORDER BY s.amount DESC
  `).all(firstDay, lastDay);

  // Total hours per rep across all weeks of the month
  const weeklySettings = db.prepare(`
    SELECT ws.*, sr.name as rep_name
    FROM weekly_settings ws
    JOIN sales_reps sr ON sr.id = ws.sales_rep_id
    WHERE ws.week_start >= date(?, '-6 days') AND ws.week_start <= ?
  `).all(firstDay, lastDay);

  // Per-rep stats with cumulated monthly ratio + best single sale
  const repStats = reps.map(rep => {
    const repSales = allSales.filter(s => s.sales_rep_id === rep.id);
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
  const firstDay = `${month}-01`;
  const lastDay = new Date(year, mon, 0).toISOString().slice(0, 10);

  const reps = db.prepare("SELECT * FROM sales_reps WHERE role != 'phoneur' AND archived = 0 AND (start_week IS NULL OR start_week <= ?) ORDER BY id").all(lastDay);

  // Total predefined actions count (yesno + counters)
  const PREDEFINED_ACTION_COUNT = 9; // 5 yesno + 4 counters

  const result = reps.map(rep => {
    // 1. Monthly counters — combine predefined: and club2: (normalize to predefined:)
    const counters = db.prepare(`
      SELECT
        CASE WHEN action_key LIKE 'club2:%' THEN 'predefined:' || SUBSTR(action_key, 7) ELSE action_key END as norm_key,
        SUM(value) as total
      FROM daily_action_values
      WHERE sales_rep_id = ? AND date >= ? AND date <= ? AND (action_key LIKE 'predefined:%' OR action_key LIKE 'club2:%')
      GROUP BY norm_key
    `).all(rep.id, firstDay, lastDay);

    const totals = {};
    counters.forEach(c => { totals[c.norm_key.replace('predefined:', '')] = c.total; });

    // 2. Sales without RIB for this rep in this month
    const salesNoRib = db.prepare(`
      SELECT COUNT(*) as count FROM sales
      WHERE sales_rep_id = ? AND date >= ? AND date <= ? AND rib_status != 'Reçu'
    `).get(rep.id, firstDay, lastDay);

    // 3. Total sales count (all statuses) for reference comparison
    const totalSalesAll = db.prepare(`
      SELECT COUNT(*) as count FROM sales
      WHERE sales_rep_id = ? AND date >= ? AND date <= ?
    `).get(rep.id, firstDay, lastDay);

    // 4. Commercial days = distinct days with at least one action value > 0 (either club)
    const commercialDays = db.prepare(`
      SELECT COUNT(DISTINCT date) as count
      FROM daily_action_values
      WHERE sales_rep_id = ? AND date >= ? AND date <= ? AND (action_key LIKE 'predefined:%' OR action_key LIKE 'club2:%') AND value > 0
    `).get(rep.id, firstDay, lastDay);

    // 5. Days with ALL actions completed per used club
    // A club is "used" on a day if it has at least 1 value > 0
    // A day is "complete" if every used club has PREDEFINED_ACTION_COUNT actions done
    // We check this by: for each day, count used clubs and complete clubs
    const dayDetails = db.prepare(`
      SELECT date,
        CASE WHEN action_key LIKE 'predefined:%' THEN 'c1' ELSE 'c2' END as club,
        COUNT(DISTINCT CASE WHEN action_key LIKE 'club2:%' THEN 'predefined:' || SUBSTR(action_key, 7) ELSE action_key END) as actions_done
      FROM daily_action_values
      WHERE sales_rep_id = ? AND date >= ? AND date <= ? AND (action_key LIKE 'predefined:%' OR action_key LIKE 'club2:%') AND value > 0
      GROUP BY date, club
    `).all(rep.id, firstDay, lastDay);

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
  const firstDay = `${month}-01`;
  const lastDay = new Date(year, mon, 0).toISOString().slice(0, 10);

  const reps = db.prepare("SELECT * FROM sales_reps WHERE role != 'phoneur' AND archived = 0 AND (start_week IS NULL OR start_week <= ?) ORDER BY id").all(lastDay);

  // Find all distinct week_starts that overlap with this month
  const weeks = db.prepare(`
    SELECT DISTINCT ws.week_start
    FROM weekly_settings ws
    WHERE ws.week_start >= date(?, '-6 days') AND ws.week_start <= ?
    ORDER BY ws.week_start
  `).all(firstDay, lastDay);

  const weeklyData = weeks.map(w => {
    const ws = w.week_start;
    // Calculate week end (for filtering sales within the month)
    const [wy, wm, wd] = ws.split('-').map(Number);
    const weekEndDate = new Date(wy, wm - 1, wd);
    weekEndDate.setDate(weekEndDate.getDate() + 6);
    const weekEnd = weekEndDate.toISOString().slice(0, 10);

    // Week label
    const startDate = new Date(wy, wm - 1, wd);
    const startLabel = startDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    const endLabel = weekEndDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

    const repData = reps.filter(rep => !rep.start_week || rep.start_week <= ws).map(rep => {
      // Sales for this rep in this week AND within the month
      const salesRow = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as ca, COUNT(*) as nb_ventes
        FROM sales
        WHERE sales_rep_id = ? AND week_start = ? AND date >= ? AND date <= ?
      `).get(rep.id, ws, firstDay, lastDay);

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

  // 1. CA de la semaine (toutes ventes, pas seulement RIB reçu)
  const caRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as ca, COUNT(*) as nb_ventes
    FROM sales WHERE sales_rep_id = ? AND week_start = ?
  `).get(repId, weekStart);

  // 2. Ventes de la semaine avec détails
  const sales = db.prepare(`
    SELECT id, date, amount, client_first_name, client_last_name, rib_status, controlled, sales_rep_id
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

// ─── Start ──────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
  getDb(); // Init DB on startup
});
