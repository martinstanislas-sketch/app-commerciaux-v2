require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const Anthropic = require('@anthropic-ai/sdk').default;
const { getDb, ensureWeeklySettings } = require('./db');
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

  // Check commercial PIN
  const db = getDb();
  const rep = db.prepare('SELECT id, name FROM sales_reps WHERE pin = ?').get(pin.trim());
  if (rep) {
    const token = crypto.randomUUID();
    sessions.set(token, { role: 'commercial', name: rep.name, sales_rep_id: rep.id });
    return res.json({ token, role: 'commercial', name: rep.name, sales_rep_id: rep.id });
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
  const reps = db.prepare('SELECT * FROM sales_reps ORDER BY id').all();
  res.json(reps);
});

// ─── GET /api/weeks/:week_start/dashboard ───────────────────

app.get('/api/weeks/:week_start/dashboard', requireAuth, (req, res) => {
  const db = getDb();
  const weekStart = req.params.week_start;

  ensureWeeklySettings(weekStart);

  const reps = db.prepare('SELECT * FROM sales_reps ORDER BY id').all();

  const settings = db.prepare(`
    SELECT ws.*, sr.name as rep_name
    FROM weekly_settings ws
    JOIN sales_reps sr ON sr.id = ws.sales_rep_id
    WHERE ws.week_start = ?
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
      objectif_atteint: objectifAtteint
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

  db.prepare('UPDATE sales SET rib_status = ? WHERE id = ?').run('Reçu', id);
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
  const reps = db.prepare('SELECT * FROM sales_reps ORDER BY id').all();

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
      best_sale: bestSale
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

// ─── GET /api/months/:month/weekly-breakdown ─────────────────

app.get('/api/months/:month/weekly-breakdown', requireAuth, (req, res) => {
  const db = getDb();
  const month = req.params.month;
  const year = parseInt(month.split('-')[0]);
  const mon = parseInt(month.split('-')[1]);
  const firstDay = `${month}-01`;
  const lastDay = new Date(year, mon, 0).toISOString().slice(0, 10);

  const reps = db.prepare('SELECT * FROM sales_reps ORDER BY id').all();

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

    const repData = reps.map(rep => {
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

// ─── Start ──────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
  getDb(); // Init DB on startup
});
