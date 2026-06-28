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

// ─── Sessions (persistantes : cache memoire + SQLite) ───────
// Stockees en base (table `sessions`) pour SURVIVRE aux redeploiements (le
// process redemarre et viderait une Map memoire -> "Session expiree"). On garde
// un cache memoire pour la vitesse, avec ecriture immediate en base (write-through)
// et rehydratation au demarrage. Interface compatible Map (get/set/delete).

const sessions = (() => {
  const cache = new Map();
  let ready = false;
  function db() { try { return getDb(); } catch (_) { return null; } }
  function ensure() {
    if (ready) return;
    const d = db();
    if (!d) return; // base pas encore prete : on reessaiera au prochain appel
    try {
      d.exec('CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, data TEXT NOT NULL, created_at INTEGER NOT NULL)');
      d.prepare('DELETE FROM sessions WHERE created_at < ?').run(Date.now() - 90 * 86400000); // purge > 90 j
      for (const row of d.prepare('SELECT token, data FROM sessions').all()) {
        try { cache.set(row.token, JSON.parse(row.data)); } catch (_) { /* ligne corrompue ignoree */ }
      }
      ready = true;
    } catch (_) { /* on reessaiera au prochain appel */ }
  }
  return {
    get(token) { ensure(); return cache.get(token); },
    has(token) { ensure(); return cache.has(token); },
    set(token, data) {
      ensure();
      cache.set(token, data);
      const d = db();
      if (d) { try { d.prepare('INSERT OR REPLACE INTO sessions (token, data, created_at) VALUES (?, ?, ?)').run(token, JSON.stringify(data), Date.now()); } catch (_) {} }
      return this;
    },
    delete(token) {
      ensure();
      cache.delete(token);
      const d = db();
      if (d) { try { d.prepare('DELETE FROM sessions WHERE token = ?').run(token); } catch (_) {} }
      return true;
    },
  };
})();

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

// ─── Module Nutrition (My Coach Nutrition) ──────────────────
// Monté sous /nutrition. Réservé à l'administrateur principal.
//  - Les PAGES (/nutrition/...) sont servies en statique ; le blocage d'accès
//    se fait côté page (script qui vérifie le rôle admin via la session locale).
//  - Les DONNÉES/API (/nutrition/api/*) sont protégées côté serveur par
//    requireAuth + requireAdmin (token Bearer admin obligatoire).
// Permission évolutive : aujourd'hui = rôle 'admin' ; ouvrable plus tard à
// d'autres profils via une permission 'can_access_nutrition_module'.
// Accès au module nutrition : admin OU permission can_access_nutrition_module
// (évolutif : aujourd'hui seul l'admin a un compte avec accès, mais le jour où
// les sessions porteront des permissions, un client/coach pourra soumettre).
function requireNutritionAccess(req, res, next) {
  const s = req.session;
  const perms = (s && s.permissions) || [];
  if (s && (s.role === 'admin' || (Array.isArray(perms) && perms.includes('can_access_nutrition_module')))) return next();
  return res.status(403).json({ error: 'Accès réservé au module nutrition' });
}

// Tables du module nutrition : demandes d'aide + scans produits + avis coach.
function ensureNutritionHelpTable() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS nutrition_help_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      difficultes TEXT NOT NULL DEFAULT '[]',
      message TEXT NOT NULL DEFAULT '',
      statut TEXT NOT NULL DEFAULT 'a_traiter'
    );
    CREATE TABLE IF NOT EXISTS nutrition_scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      barcode TEXT NOT NULL DEFAULT '',
      product_name TEXT NOT NULL DEFAULT '',
      brand TEXT NOT NULL DEFAULT '',
      nutriscore TEXT NOT NULL DEFAULT '',
      coherence TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS nutrition_scan_advice (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      barcode TEXT NOT NULL DEFAULT '',
      product_name TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      statut TEXT NOT NULL DEFAULT 'a_traiter'
    );
    CREATE TABLE IF NOT EXISTS nutrition_adherence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_name TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      suivi INTEGER NOT NULL DEFAULT 0,
      adapte INTEGER NOT NULL DEFAULT 0,
      autre INTEGER NOT NULL DEFAULT 0,
      saute INTEGER NOT NULL DEFAULT 0,
      score INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_nutrition_adherence_client_date ON nutrition_adherence(client_name, date);
    CREATE TABLE IF NOT EXISTS nutrition_demo (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      code TEXT NOT NULL DEFAULT '2026',
      enabled INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT DEFAULT NULL,
      uses INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS nutrition_demo_access (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      accessed_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS nutrition_plate_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      meal_label TEXT NOT NULL DEFAULT '',
      precision_txt TEXT NOT NULL DEFAULT '',
      aliments TEXT NOT NULL DEFAULT '[]',
      kcal INTEGER NOT NULL DEFAULT 0,
      proteines INTEGER NOT NULL DEFAULT 0,
      glucides INTEGER NOT NULL DEFAULT 0,
      lipides INTEGER NOT NULL DEFAULT 0,
      coherence TEXT NOT NULL DEFAULT '',
      ia_comment TEXT NOT NULL DEFAULT '{}',
      thumb TEXT NOT NULL DEFAULT '',
      client_message TEXT NOT NULL DEFAULT '',
      advice_statut TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS nutrition_google_token (
      client_name TEXT PRIMARY KEY,
      access_token TEXT NOT NULL DEFAULT '',
      refresh_token TEXT NOT NULL DEFAULT '',
      expiry INTEGER NOT NULL DEFAULT 0,
      calendar_id TEXT NOT NULL DEFAULT '',
      calendar_name TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS nutrition_clients (
      email TEXT PRIMARY KEY,
      prenom TEXT NOT NULL DEFAULT '',
      nom TEXT NOT NULL DEFAULT '',
      data TEXT,
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS nutrition_community_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'message',
      created_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS nutrition_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_email TEXT NOT NULL,
      coach_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT '',
      last_message_at TEXT NOT NULL DEFAULT '',
      statut TEXT NOT NULL DEFAULT 'active',
      UNIQUE(client_email, coach_id)
    );
    CREATE TABLE IF NOT EXISTS nutrition_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      sender_role TEXT NOT NULL,
      sender_label TEXT NOT NULL DEFAULT '',
      contenu TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT '',
      lu INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS nutrition_recipe_photos (
      recipe_id TEXT PRIMARY KEY,
      data TEXT NOT NULL DEFAULT '',
      mime TEXT NOT NULL DEFAULT '',
      auteur_role TEXT NOT NULL DEFAULT '',
      auteur_id INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT ''
    );
  `);
  // Migration : attribution d'un coach sportif à un client nutrition (socle des espaces par rôle).
  try {
    const ncCols = getDb().prepare('PRAGMA table_info(nutrition_clients)').all();
    if (!ncCols.some((c) => c.name === 'coach_id')) {
      getDb().exec('ALTER TABLE nutrition_clients ADD COLUMN coach_id INTEGER DEFAULT NULL');
    }
  } catch (e) { console.error('Migration nutrition_clients.coach_id :', e && e.message); }
  // Migration : unification de l'identité client sur l'email. Les tables historiques
  // (aide/scans/avis/adhérence/assiettes) lient un client par `client_name` (texte libre
  // = nom de session) ≠ email -> impossible à scoper proprement par coach. On ajoute une
  // colonne `client_email` (remplie en avant par les routes), puis on backfill sans risque :
  // uniquement quand le nom correspond à UN SEUL client (sinon on laisse vide).
  try {
    const legacyTables = ['nutrition_help_requests', 'nutrition_scans', 'nutrition_scan_advice', 'nutrition_adherence', 'nutrition_plate_analysis'];
    legacyTables.forEach((t) => {
      const cols = getDb().prepare('PRAGMA table_info(' + t + ')').all();
      if (!cols.some((c) => c.name === 'client_email')) {
        getDb().exec("ALTER TABLE " + t + " ADD COLUMN client_email TEXT NOT NULL DEFAULT ''");
      }
    });
    // Carte nom -> email, en marquant les noms ambigus (plusieurs clients) comme non résolubles.
    const nameToEmail = {};
    const ambiguous = new Set();
    const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
    getDb().prepare("SELECT email, prenom, nom FROM nutrition_clients").all().forEach((c) => {
      const keys = [norm((c.prenom || '') + ' ' + (c.nom || '')), norm(c.prenom)];
      keys.forEach((k) => {
        if (!k) return;
        if (ambiguous.has(k)) return;
        if (nameToEmail[k] && nameToEmail[k] !== c.email) { ambiguous.add(k); delete nameToEmail[k]; }
        else nameToEmail[k] = c.email;
      });
    });
    legacyTables.forEach((t) => {
      const rows = getDb().prepare("SELECT DISTINCT client_name FROM " + t + " WHERE client_email = '' AND client_name != ''").all();
      const upd = getDb().prepare("UPDATE " + t + " SET client_email = ? WHERE client_name = ? AND client_email = ''");
      rows.forEach((r) => { const e2 = nameToEmail[norm(r.client_name)]; if (e2) upd.run(e2, r.client_name); });
    });
  } catch (e) { console.error('Migration unification client_email :', e && e.message); }
  // Seed config démo (une seule ligne).
  getDb().prepare("INSERT OR IGNORE INTO nutrition_demo (id, code, enabled) VALUES (1, '2026', 1)").run();
  // Migration : bascule l'ancien code par défaut vers '2026' (sans écraser un code personnalisé saisi par l'admin).
  getDb().prepare("UPDATE nutrition_demo SET code = '2026' WHERE id = 1 AND code = 'MYCOACH-DEMO-CLIENT-2026'").run();
}
function getDemoConfig() {
  return getDb().prepare('SELECT code, enabled, expires_at, uses FROM nutrition_demo WHERE id = 1').get()
    || { code: '2026', enabled: 1, expires_at: null, uses: 0 };
}
// Accès au module nutrition pour USAGE client (admin OU session démo).
// Les routes coach restent en requireAdmin (declarees avant le catch-all).
function requireNutritionUse(req, res, next) {
  const s = req.session;
  const perms = (s && s.permissions) || [];
  if (s && (s.role === 'admin' || s.role === 'nutrition_demo' || (Array.isArray(perms) && perms.includes('can_access_nutrition_module')))) return next();
  return res.status(403).json({ error: 'Accès réservé au module nutrition' });
}

// Coach sportif OU admin (pour les vues coach de la nutrition). Expose le
// périmètre dans req.nutritionScope : { isAdmin, coachId } -> les requêtes
// filtrent ensuite par coachId (un coach ne voit QUE ses clients ; admin = tout).
function requireCoachOrAdmin(req, res, next) {
  const s = req.session;
  if (!s) return res.status(401).json({ error: 'Non connecté' });
  if (s.role === 'admin') { req.nutritionScope = { isAdmin: true, coachId: null }; return next(); }
  if ((s.role === 'coach' || s.role === 'coach-leader') && s.coach_id) {
    req.nutritionScope = { isAdmin: false, coachId: s.coach_id };
    return next();
  }
  return res.status(403).json({ error: 'Accès réservé aux coachs et administrateurs' });
}

// ─── Google Agenda (OAuth + synchronisation) ────────────────
// Scope minimal : calendar.app.created -> l'app ne gere QUE son propre calendrier
// "My Coach Nutrition", sans acceder a l'agenda personnel du client.
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
function googleCfg() { return { id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET, redirect: process.env.GOOGLE_REDIRECT_URI }; }
function googleConfigured() { const c = googleCfg(); return !!(c.id && c.secret && c.redirect); }
function googleClientKey(req) { return (req.session && req.session.name) || 'Client'; }
function gPad(n) { return String(n).padStart(2, '0'); }
function isoLocal(d) {
  const off = -d.getTimezoneOffset(); const sign = off >= 0 ? '+' : '-';
  return d.getFullYear() + '-' + gPad(d.getMonth() + 1) + '-' + gPad(d.getDate()) + 'T' + gPad(d.getHours()) + ':' + gPad(d.getMinutes()) + ':00' + sign + gPad(Math.floor(Math.abs(off) / 60)) + ':' + gPad(Math.abs(off) % 60);
}
function signState(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.GOOGLE_CLIENT_SECRET || 'mcn-secret').update(data).digest('base64url');
  return data + '.' + sig;
}
function verifyState(state) {
  const parts = String(state || '').split('.'); if (parts.length !== 2) return null;
  const exp = crypto.createHmac('sha256', process.env.GOOGLE_CLIENT_SECRET || 'mcn-secret').update(parts[0]).digest('base64url');
  if (exp !== parts[1]) return null;
  try { return JSON.parse(Buffer.from(parts[0], 'base64url').toString()); } catch (_) { return null; }
}
async function googleTokenRequest(params) {
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
  return r.json();
}
// Renvoie une ligne token a jour (rafraichit si expire), ou null.
async function googleValidToken(clientName) {
  const row = getDb().prepare('SELECT * FROM nutrition_google_token WHERE client_name = ?').get(clientName);
  if (!row) return null;
  if (Date.now() < row.expiry - 60000 && row.access_token) return row;
  const c = googleCfg();
  const tok = await googleTokenRequest({ client_id: c.id, client_secret: c.secret, refresh_token: row.refresh_token, grant_type: 'refresh_token' });
  if (!tok.access_token) return null;
  const expiry = Date.now() + (tok.expires_in || 3600) * 1000;
  getDb().prepare('UPDATE nutrition_google_token SET access_token = ?, expiry = ?, updated_at = ? WHERE client_name = ?').run(tok.access_token, expiry, new Date().toISOString(), clientName);
  row.access_token = tok.access_token; row.expiry = expiry;
  return row;
}
async function gcal(token, method, path, body) {
  const r = await fetch('https://www.googleapis.com/calendar/v3' + path, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  let json = {}; try { json = await r.json(); } catch (_) { /* no body */ }
  return { status: r.status, json };
}
// Construit les evenements Google a partir du plan (anti-doublon par id deterministe).
const GHEURES = { 'petit-dejeuner': [8, 0, 30], dejeuner: [12, 30, 45], collation: [16, 0, 15], diner: [19, 30, 45] };
function buildPlanEvents(plan, scope, planId, dinerTard) {
  if (!plan || !Array.isArray(plan.jours)) return [];
  const base = new Date(); base.setHours(0, 0, 0, 0);
  const jours = scope === 'jour' ? plan.jours.slice(0, 1) : plan.jours;
  const out = [];
  jours.forEach((jour, di) => {
    (jour.repas || []).forEach((repas) => {
      const r = repas.recette; if (!r) return;
      if (scope === 'rappels' && repas.creneau === 'collation') return; // rappels = repas principaux
      const [hh, mm, dur] = (repas.creneau === 'diner' && dinerTard) ? [21, 0, 45] : (GHEURES[repas.creneau] || [12, 0, 30]);
      const start = new Date(base); start.setDate(base.getDate() + di); start.setHours(hh, mm, 0, 0);
      const end = new Date(start); end.setMinutes(start.getMinutes() + dur);
      const dateKey = start.getFullYear() + gPad(start.getMonth() + 1) + gPad(start.getDate());
      const id = 'mcn' + crypto.createHash('sha1').update(String(planId) + dateKey + repas.creneau).digest('hex').slice(0, 26);
      const ingr = (r.ingredients || []).slice(0, 5).map((i) => i.nom).join(', ');
      const desc = `${r.nom}\n${r.kcal} kcal · ${r.proteines} g proteines\nIngredients : ${ingr}\n\nMy Coach Nutrition`;
      out.push({ id, summary: `My Coach Nutrition · ${repas.label}`, description: desc, start: { dateTime: isoLocal(start) }, end: { dateTime: isoLocal(end) } });
    });
  });
  return out;
}

try {
  const nutritionApp = require('./nutrition-app/server');
  ensureNutritionHelpTable();

  // --- Demandes d'aide alimentaire ---
  // Soumission : tout utilisateur ayant accès au module (client inclus à terme).
  app.post('/nutrition/api/help-request', requireAuth, requireNutritionAccess, (req, res) => {
    try {
      const { clientName, difficultes, message } = req.body || {};
      const nom = String(clientName || req.session.name || 'Client').slice(0, 120);
      const diffs = Array.isArray(difficultes) ? difficultes.map(d => String(d).slice(0, 120)).slice(0, 20) : [];
      const msg = String(message || '').slice(0, 2000);
      if (!diffs.length && !msg.trim()) {
        return res.status(400).json({ ok: false, error: 'Indiquez au moins une difficulté ou un message.' });
      }
      const info = getDb().prepare(
        'INSERT INTO nutrition_help_requests (client_name, client_email, created_at, difficultes, message, statut) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(nom, (req.session && req.session.email) || '', new Date().toISOString(), JSON.stringify(diffs), msg, 'a_traiter');
      res.json({ ok: true, id: info.lastInsertRowid });
    } catch (e) {
      console.error('Erreur help-request POST :', e);
      res.status(500).json({ ok: false, error: 'Enregistrement impossible.' });
    }
  });

  // Vue coach : liste des demandes (admin uniquement pour l'instant).
  app.get('/nutrition/api/help-requests', requireAuth, requireAdmin, (req, res) => {
    try {
      const rows = getDb().prepare('SELECT * FROM nutrition_help_requests ORDER BY id DESC').all();
      const demandes = rows.map(r => ({
        id: r.id, clientName: r.client_name, createdAt: r.created_at,
        difficultes: (() => { try { return JSON.parse(r.difficultes); } catch (_) { return []; } })(),
        message: r.message, statut: r.statut,
      }));
      res.json({ ok: true, demandes });
    } catch (e) {
      console.error('Erreur help-requests GET :', e);
      res.status(500).json({ ok: false, error: 'Lecture impossible.' });
    }
  });

  // Changement de statut (admin/coach).
  app.patch('/nutrition/api/help-requests/:id', requireAuth, requireAdmin, (req, res) => {
    try {
      const statut = String((req.body || {}).statut || '');
      if (!['a_traiter', 'en_cours', 'traite'].includes(statut)) {
        return res.status(400).json({ ok: false, error: 'Statut invalide.' });
      }
      const info = getDb().prepare('UPDATE nutrition_help_requests SET statut = ? WHERE id = ?').run(statut, Number(req.params.id));
      res.json({ ok: info.changes > 0 });
    } catch (e) {
      console.error('Erreur help-requests PATCH :', e);
      res.status(500).json({ ok: false, error: 'Mise à jour impossible.' });
    }
  });

  // --- Mur collectif de la communauté (challenge) ---
  // Derniers messages du groupe + taille du groupe (clients inscrits).
  app.get('/nutrition/api/community/messages', requireAuth, requireNutritionUse, (req, res) => {
    try {
      const me = (req.session && req.session.email) || '';
      const limit = Math.min(Math.max(Number(req.query.limit) || 40, 1), 100);
      const rows = getDb().prepare(
        'SELECT id, email, author, message, kind, created_at FROM nutrition_community_messages ORDER BY id DESC LIMIT ?'
      ).all(limit);
      const messages = rows.map((r) => ({
        id: r.id, who: r.author || 'Client', when: r.created_at,
        text: r.message, kind: r.kind || 'message', mine: !!me && r.email === me,
      }));
      let members = 0;
      try { members = getDb().prepare('SELECT COUNT(*) AS n FROM nutrition_clients').get().n; } catch (_) { /* ignore */ }
      res.json({ ok: true, messages, members });
    } catch (e) {
      console.error('Erreur community/messages GET :', e);
      res.status(500).json({ ok: false, error: 'Lecture impossible.' });
    }
  });

  // Publier un message sur le mur collectif (client / coach / démo connecté).
  app.post('/nutrition/api/community/messages', requireAuth, requireNutritionUse, (req, res) => {
    try {
      const author = String((req.session && req.session.name) || 'Client').slice(0, 80);
      const email = (req.session && req.session.email) || '';
      const kind = ((req.body || {}).kind === 'partage') ? 'partage' : 'message';
      const msg = String((req.body || {}).message || '').slice(0, 500).trim();
      if (!msg) return res.status(400).json({ ok: false, error: 'Message vide.' });
      const now = new Date().toISOString();
      const info = getDb().prepare(
        'INSERT INTO nutrition_community_messages (email, author, message, kind, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(email, author, msg, kind, now);
      res.json({ ok: true, message: { id: info.lastInsertRowid, who: author, when: now, text: msg, kind, mine: true } });
    } catch (e) {
      console.error('Erreur community/messages POST :', e);
      res.status(500).json({ ok: false, error: 'Publication impossible.' });
    }
  });

  // ====== Messagerie privée client <-> coach (jamais client <-> client) ======
  // Helpers : résout le coach attribué d'un client (par email).
  function coachOf(email) {
    if (!email) return null;
    const cli = getDb().prepare('SELECT coach_id FROM nutrition_clients WHERE email = ?').get(email);
    if (!cli || !cli.coach_id) return null;
    return getDb().prepare('SELECT id, name FROM coaches WHERE id = ? AND archived = 0').get(cli.coach_id) || null;
  }

  // CLIENT : sa conversation avec SON coach (le destinataire n'est jamais choisi par le client).
  app.get('/nutrition/api/messages/coach', requireAuth, requireNutritionUse, (req, res) => {
    try {
      const email = req.session && req.session.email;
      if (!email) return res.json({ ok: true, coach: null, conversationId: null, messages: [] });
      const coach = coachOf(email);
      if (!coach) return res.json({ ok: true, coach: null, conversationId: null, messages: [] });
      const conv = getDb().prepare('SELECT id FROM nutrition_conversations WHERE client_email = ? AND coach_id = ?').get(email, coach.id);
      let messages = [];
      if (conv) {
        messages = getDb().prepare('SELECT id, sender_role, sender_label, contenu, created_at FROM nutrition_messages WHERE conversation_id = ? ORDER BY id ASC LIMIT 300').all(conv.id)
          .map((m) => ({ id: m.id, role: m.sender_role, who: m.sender_label, text: m.contenu, when: m.created_at, mine: m.sender_role === 'client' }));
        getDb().prepare("UPDATE nutrition_messages SET lu = 1 WHERE conversation_id = ? AND sender_role != 'client' AND lu = 0").run(conv.id);
      }
      res.json({ ok: true, coach: { id: coach.id, name: coach.name }, conversationId: conv ? conv.id : null, messages });
    } catch (e) { console.error('messages/coach GET :', e); res.status(500).json({ ok: false, error: 'Lecture impossible.' }); }
  });

  // CLIENT : envoyer un message à SON coach (crée la conversation au besoin).
  app.post('/nutrition/api/messages/coach', requireAuth, requireNutritionUse, (req, res) => {
    try {
      const email = req.session && req.session.email;
      if (!email) return res.status(403).json({ ok: false, error: 'Compte client requis.' });
      const coach = coachOf(email);
      if (!coach) return res.status(409).json({ ok: false, error: 'no_coach' });
      const msg = String((req.body || {}).message || '').slice(0, 2000).trim();
      if (!msg) return res.status(400).json({ ok: false, error: 'Message vide.' });
      const now = new Date().toISOString();
      let conv = getDb().prepare('SELECT id FROM nutrition_conversations WHERE client_email = ? AND coach_id = ?').get(email, coach.id);
      if (!conv) {
        const info = getDb().prepare('INSERT INTO nutrition_conversations (client_email, coach_id, created_at, last_message_at, statut) VALUES (?,?,?,?,?)').run(email, coach.id, now, now, 'active');
        conv = { id: info.lastInsertRowid };
      }
      const label = String((req.session && req.session.name) || 'Client').slice(0, 80);
      const info = getDb().prepare('INSERT INTO nutrition_messages (conversation_id, sender_role, sender_label, contenu, created_at, lu) VALUES (?,?,?,?,?,0)').run(conv.id, 'client', label, msg, now);
      getDb().prepare('UPDATE nutrition_conversations SET last_message_at = ? WHERE id = ?').run(now, conv.id);
      res.json({ ok: true, message: { id: info.lastInsertRowid, role: 'client', who: label, text: msg, when: now, mine: true } });
    } catch (e) { console.error('messages/coach POST :', e); res.status(500).json({ ok: false, error: 'Envoi impossible.' }); }
  });

  // COACH/ADMIN : liste des conversations (scopée par coach_id ; admin = toutes).
  app.get('/nutrition/api/coach/conversations', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const sc = req.nutritionScope;
      const base = `SELECT c.id, c.client_email, c.coach_id, c.last_message_at,
        (SELECT contenu FROM nutrition_messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_text,
        (SELECT sender_role FROM nutrition_messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_role,
        (SELECT COUNT(*) FROM nutrition_messages m WHERE m.conversation_id = c.id AND m.sender_role = 'client' AND m.lu = 0) AS unread
        FROM nutrition_conversations c`;
      const rows = sc.isAdmin
        ? getDb().prepare(base + ' ORDER BY c.last_message_at DESC').all()
        : getDb().prepare(base + ' WHERE c.coach_id = ? ORDER BY c.last_message_at DESC').all(sc.coachId);
      const conversations = rows.map((r) => {
        const cli = getDb().prepare('SELECT prenom, nom FROM nutrition_clients WHERE email = ?').get(r.client_email);
        const clientName = cli ? ([cli.prenom, cli.nom].filter(Boolean).join(' ') || r.client_email) : r.client_email;
        return { id: r.id, clientEmail: r.client_email, clientName, coachId: r.coach_id, lastText: r.last_text || '', lastRole: r.last_role || '', lastAt: r.last_message_at, unread: r.unread };
      });
      res.json({ ok: true, scope: sc.isAdmin ? 'admin' : 'coach', conversations });
    } catch (e) { console.error('coach/conversations GET :', e); res.status(500).json({ ok: false, error: 'Lecture impossible.' }); }
  });

  // COACH/ADMIN : messages d'une conversation (uniquement la sienne ; admin = support).
  app.get('/nutrition/api/coach/conversations/:id/messages', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const sc = req.nutritionScope;
      const conv = getDb().prepare('SELECT id, client_email, coach_id FROM nutrition_conversations WHERE id = ?').get(Number(req.params.id));
      if (!conv) return res.status(404).json({ ok: false, error: 'Conversation introuvable.' });
      if (!sc.isAdmin && conv.coach_id !== sc.coachId) return res.status(403).json({ ok: false, error: 'Hors de votre périmètre.' });
      const messages = getDb().prepare('SELECT id, sender_role, sender_label, contenu, created_at FROM nutrition_messages WHERE conversation_id = ? ORDER BY id ASC LIMIT 400').all(conv.id)
        .map((m) => ({ id: m.id, role: m.sender_role, who: m.sender_label, text: m.contenu, when: m.created_at, mine: m.sender_role !== 'client' }));
      if (!sc.isAdmin) getDb().prepare("UPDATE nutrition_messages SET lu = 1 WHERE conversation_id = ? AND sender_role = 'client' AND lu = 0").run(conv.id);
      const cli = getDb().prepare('SELECT prenom, nom FROM nutrition_clients WHERE email = ?').get(conv.client_email);
      res.json({ ok: true, clientEmail: conv.client_email, clientName: cli ? ([cli.prenom, cli.nom].filter(Boolean).join(' ') || conv.client_email) : conv.client_email, messages });
    } catch (e) { console.error('coach conv messages GET :', e); res.status(500).json({ ok: false, error: 'Lecture impossible.' }); }
  });

  // COACH/ADMIN : répondre dans une conversation (uniquement la sienne ; admin = support).
  app.post('/nutrition/api/coach/conversations/:id/reply', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const sc = req.nutritionScope;
      const conv = getDb().prepare('SELECT id, coach_id FROM nutrition_conversations WHERE id = ?').get(Number(req.params.id));
      if (!conv) return res.status(404).json({ ok: false, error: 'Conversation introuvable.' });
      if (!sc.isAdmin && conv.coach_id !== sc.coachId) return res.status(403).json({ ok: false, error: 'Hors de votre périmètre.' });
      const msg = String((req.body || {}).message || '').slice(0, 2000).trim();
      if (!msg) return res.status(400).json({ ok: false, error: 'Message vide.' });
      const now = new Date().toISOString();
      const label = String((req.session && req.session.name) || 'Coach').slice(0, 80);
      const role = (sc.isAdmin && conv.coach_id !== sc.coachId) ? 'super_admin' : 'coach';
      const info = getDb().prepare('INSERT INTO nutrition_messages (conversation_id, sender_role, sender_label, contenu, created_at, lu) VALUES (?,?,?,?,?,0)').run(conv.id, role, label, msg, now);
      getDb().prepare('UPDATE nutrition_conversations SET last_message_at = ? WHERE id = ?').run(now, conv.id);
      res.json({ ok: true, message: { id: info.lastInsertRowid, role, who: label, text: msg, when: now, mine: true } });
    } catch (e) { console.error('coach reply POST :', e); res.status(500).json({ ok: false, error: 'Envoi impossible.' }); }
  });

  // COACH/ADMIN : ouvrir (ou créer) la conversation avec un client attribué.
  app.post('/nutrition/api/coach/conversations', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const sc = req.nutritionScope;
      const email = String((req.body || {}).client_email || '').trim();
      if (!email) return res.status(400).json({ ok: false, error: 'Client manquant.' });
      const cli = getDb().prepare('SELECT coach_id FROM nutrition_clients WHERE email = ?').get(email);
      if (!cli) return res.status(404).json({ ok: false, error: 'Client introuvable.' });
      if (!sc.isAdmin && cli.coach_id !== sc.coachId) return res.status(403).json({ ok: false, error: 'Hors de votre périmètre.' });
      const coachId = sc.isAdmin ? cli.coach_id : sc.coachId;
      if (!coachId) return res.status(409).json({ ok: false, error: 'Ce client n’a pas de coach attribué.' });
      const now = new Date().toISOString();
      let conv = getDb().prepare('SELECT id FROM nutrition_conversations WHERE client_email = ? AND coach_id = ?').get(email, coachId);
      if (!conv) { const i = getDb().prepare('INSERT INTO nutrition_conversations (client_email, coach_id, created_at, last_message_at, statut) VALUES (?,?,?,?,?)').run(email, coachId, now, now, 'active'); conv = { id: i.lastInsertRowid }; }
      res.json({ ok: true, conversationId: conv.id });
    } catch (e) { console.error('coach conv create POST :', e); res.status(500).json({ ok: false, error: 'Impossible.' }); }
  });

  // ====== Photos de plats (admin/coach ajoutent ; clients voient) ======
  function getRecipesCatalogue() { try { return require('./nutrition-app/lib/recipes-v2').RECIPES || []; } catch (_) { return []; } }

  // Index des plats AYANT une photo (public) -> le front n'affiche l'<img> que pour ceux-là.
  app.get('/nutrition/api/recipe-photos-index', (req, res) => {
    try {
      const photos = {};
      getDb().prepare('SELECT recipe_id, updated_at FROM nutrition_recipe_photos').all().forEach((r) => { photos[r.recipe_id] = r.updated_at || '1'; });
      res.set('Cache-Control', 'no-cache');
      res.json({ ok: true, photos });
    } catch (e) { res.json({ ok: true, photos: {} }); }
  });

  // Sert la photo d'un plat (PUBLIC : un <img> n'envoie pas de token).
  app.get('/nutrition/api/recipe-photo/:id', (req, res) => {
    try {
      const row = getDb().prepare('SELECT data FROM nutrition_recipe_photos WHERE recipe_id = ?').get(String(req.params.id));
      const m = row && row.data && /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(row.data);
      if (!m) return res.status(404).end();
      res.set('Content-Type', m[1]);
      res.set('Cache-Control', 'public, max-age=300');
      res.send(Buffer.from(m[2], 'base64'));
    } catch (e) { res.status(404).end(); }
  });

  // Liste des plats avec statut photo (gestion admin/coach).
  app.get('/nutrition/api/recipes-list', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const withPhoto = new Set(getDb().prepare('SELECT recipe_id FROM nutrition_recipe_photos').all().map((r) => r.recipe_id));
      const recipes = getRecipesCatalogue().map((r) => ({ id: r.id, nom: r.nom, type: r.type, cuisines: r.cuisines || [], hasPhoto: withPhoto.has(r.id) }));
      res.json({ ok: true, total: recipes.length, recipes });
    } catch (e) { console.error('recipes-list GET :', e); res.status(500).json({ ok: false, error: 'Lecture impossible.' }); }
  });

  // Ajoute/remplace la photo d'un plat. Coach : seulement si le plat n'a PAS de photo. Admin : toujours.
  app.post('/nutrition/api/recipes/:id/photo', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const id = String(req.params.id);
      if (!getRecipesCatalogue().some((r) => r.id === id)) return res.status(404).json({ ok: false, error: 'Plat inconnu.' });
      const url = String((req.body || {}).imageDataUrl || '');
      if (url.length > 3000000) return res.status(413).json({ ok: false, error: 'Image trop lourde (compresse-la).' });
      const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(url);
      if (!m) return res.status(400).json({ ok: false, error: 'Format non supporté (jpg, png, webp).' });
      const sc = req.nutritionScope;
      const existing = getDb().prepare('SELECT recipe_id FROM nutrition_recipe_photos WHERE recipe_id = ?').get(id);
      if (existing && !sc.isAdmin) return res.status(403).json({ ok: false, error: 'Ce plat a déjà une photo — seul un admin peut la remplacer.' });
      const now = new Date().toISOString();
      getDb().prepare('INSERT INTO nutrition_recipe_photos (recipe_id, data, mime, auteur_role, auteur_id, updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(recipe_id) DO UPDATE SET data=excluded.data, mime=excluded.mime, auteur_role=excluded.auteur_role, auteur_id=excluded.auteur_id, updated_at=excluded.updated_at')
        .run(id, url, m[1], sc.isAdmin ? 'super_admin' : 'coach', (req.session && req.session.coach_id) || 0, now);
      res.json({ ok: true, updatedAt: now });
    } catch (e) { console.error('recipe photo POST :', e); res.status(500).json({ ok: false, error: 'Enregistrement impossible.' }); }
  });

  // Supprime la photo d'un plat (admin seulement).
  app.delete('/nutrition/api/recipes/:id/photo', requireAuth, requireAdmin, (req, res) => {
    try {
      getDb().prepare('DELETE FROM nutrition_recipe_photos WHERE recipe_id = ?').run(String(req.params.id));
      res.json({ ok: true });
    } catch (e) { console.error('recipe photo DELETE :', e); res.status(500).json({ ok: false, error: 'Suppression impossible.' }); }
  });

  // --- Scan de produits (code-barres -> Open Food Facts) ---
  // Journalise un scan (pour les stats coach "produits les plus scannés").
  app.post('/nutrition/api/scan', requireAuth, requireNutritionAccess, (req, res) => {
    try {
      const { clientName, barcode, productName, brand, nutriscore, coherence } = req.body || {};
      const coh = ['compatible', 'moderation', 'a_eviter'].includes(coherence) ? coherence : '';
      getDb().prepare(
        'INSERT INTO nutrition_scans (client_name, client_email, created_at, barcode, product_name, brand, nutriscore, coherence) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        String(clientName || req.session.name || 'Client').slice(0, 120), (req.session && req.session.email) || '', new Date().toISOString(),
        String(barcode || '').slice(0, 40), String(productName || '').slice(0, 200),
        String(brand || '').slice(0, 120), String(nutriscore || '').slice(0, 2), coh
      );
      res.json({ ok: true });
    } catch (e) {
      console.error('Erreur scan POST :', e);
      res.status(500).json({ ok: false, error: 'Enregistrement impossible.' });
    }
  });

  // Demande d'avis du coach sur un produit scanné.
  app.post('/nutrition/api/scan-advice', requireAuth, requireNutritionAccess, (req, res) => {
    try {
      const { clientName, barcode, productName, message } = req.body || {};
      const info = getDb().prepare(
        'INSERT INTO nutrition_scan_advice (client_name, client_email, created_at, barcode, product_name, message, statut) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(
        String(clientName || req.session.name || 'Client').slice(0, 120), (req.session && req.session.email) || '', new Date().toISOString(),
        String(barcode || '').slice(0, 40), String(productName || '').slice(0, 200),
        String(message || '').slice(0, 2000), 'a_traiter'
      );
      res.json({ ok: true, id: info.lastInsertRowid });
    } catch (e) {
      console.error('Erreur scan-advice POST :', e);
      res.status(500).json({ ok: false, error: 'Enregistrement impossible.' });
    }
  });

  // Vue coach : demandes d'avis + produits les plus scannés + scans récents.
  app.get('/nutrition/api/scans', requireAuth, requireAdmin, (req, res) => {
    try {
      const db = getDb();
      const advice = db.prepare('SELECT * FROM nutrition_scan_advice ORDER BY id DESC').all().map(r => ({
        id: r.id, clientName: r.client_name, createdAt: r.created_at,
        barcode: r.barcode, productName: r.product_name, message: r.message, statut: r.statut,
      }));
      const topProducts = db.prepare(`
        SELECT barcode, product_name AS productName, COUNT(*) AS count,
               MAX(coherence) AS coherence
        FROM nutrition_scans WHERE barcode != ''
        GROUP BY barcode ORDER BY count DESC, MAX(id) DESC LIMIT 20
      `).all();
      const recent = db.prepare('SELECT * FROM nutrition_scans ORDER BY id DESC LIMIT 40').all().map(r => ({
        id: r.id, clientName: r.client_name, createdAt: r.created_at, barcode: r.barcode,
        productName: r.product_name, brand: r.brand, nutriscore: r.nutriscore, coherence: r.coherence,
      }));
      res.json({ ok: true, advice, topProducts, recent });
    } catch (e) {
      console.error('Erreur scans GET :', e);
      res.status(500).json({ ok: false, error: 'Lecture impossible.' });
    }
  });

  // Changement de statut d'une demande d'avis (admin/coach).
  app.patch('/nutrition/api/scan-advice/:id', requireAuth, requireAdmin, (req, res) => {
    try {
      const statut = String((req.body || {}).statut || '');
      if (!['a_traiter', 'en_cours', 'traite'].includes(statut)) {
        return res.status(400).json({ ok: false, error: 'Statut invalide.' });
      }
      const info = getDb().prepare('UPDATE nutrition_scan_advice SET statut = ? WHERE id = ?').run(statut, Number(req.params.id));
      res.json({ ok: info.changes > 0 });
    } catch (e) {
      console.error('Erreur scan-advice PATCH :', e);
      res.status(500).json({ ok: false, error: 'Mise à jour impossible.' });
    }
  });

  // --- Suivi d'adherence au plan (resume quotidien par client) ---
  // Enregistrement (upsert) du resume d'une journee.
  app.post('/nutrition/api/adherence', requireAuth, requireNutritionAccess, (req, res) => {
    try {
      const { clientName, date, suivi, adapte, autre, saute, score } = req.body || {};
      const d = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? date : new Date().toISOString().slice(0, 10);
      const nom = String(clientName || req.session.name || 'Client').slice(0, 120);
      const n = (v) => Math.max(0, Math.min(50, parseInt(v, 10) || 0));
      const sc = Math.max(0, Math.min(100, parseInt(score, 10) || 0));
      getDb().prepare(`INSERT INTO nutrition_adherence (client_name, client_email, date, suivi, adapte, autre, saute, score, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(client_name, date) DO UPDATE SET
          client_email = excluded.client_email, suivi = excluded.suivi, adapte = excluded.adapte, autre = excluded.autre,
          saute = excluded.saute, score = excluded.score, updated_at = excluded.updated_at`)
        .run(nom, (req.session && req.session.email) || '', d, n(suivi), n(adapte), n(autre), n(saute), sc, new Date().toISOString());
      res.json({ ok: true });
    } catch (e) {
      console.error('Erreur adherence POST :', e);
      res.status(500).json({ ok: false, error: 'Enregistrement impossible.' });
    }
  });

  // Vue coach : adherence des clients sur 7 jours + alertes (admin).
  app.get('/nutrition/api/adherence/coach', requireAuth, requireAdmin, (req, res) => {
    try {
      const db = getDb();
      const today = new Date().toISOString().slice(0, 10);
      const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
      const rows = db.prepare('SELECT * FROM nutrition_adherence WHERE date >= ? ORDER BY date DESC').all(since);
      const helps = db.prepare("SELECT client_name, created_at, difficultes, statut FROM nutrition_help_requests WHERE created_at >= ?").all(since + 'T00:00:00.000Z');
      const byClient = {};
      rows.forEach((r) => {
        const c = byClient[r.client_name] || (byClient[r.client_name] = { clientName: r.client_name, suivi: 0, adapte: 0, autre: 0, saute: 0, days: 0, scoreSum: 0, lastDate: '' });
        c.suivi += r.suivi; c.adapte += r.adapte; c.autre += r.autre; c.saute += r.saute; c.days += 1; c.scoreSum += r.score;
        if (r.date > c.lastDate) c.lastDate = r.date;
      });
      const helpByClient = {};
      helps.forEach((h) => { (helpByClient[h.client_name] || (helpByClient[h.client_name] = [])).push(h); });
      const parseDiff = (h) => { try { return JSON.parse(h.difficultes); } catch (_) { return []; } };
      const build = (c) => {
        const help = helpByClient[c.clientName] || [];
        const aTraiter = help.some((h) => h.statut === 'a_traiter');
        const score = c.days ? Math.round(c.scoreSum / c.days) : 0;
        const daysSince = c.lastDate ? Math.round((Date.parse(today) - Date.parse(c.lastDate)) / 864e5) : 99;
        const alerts = [];
        if (aTraiter) alerts.push("Demande d'aide en attente");
        if (c.days && score < 50) alerts.push('Adherence faible (< 50%)');
        if ((c.autre + c.saute) >= 3) alerts.push('Plusieurs repas a reprendre');
        if (c.days && daysSince >= 3) alerts.push('Aucun suivi depuis ' + daysSince + ' j');
        if (!c.days && !aTraiter) alerts.push('Aucun suivi cette semaine');
        const statut = aTraiter ? 'besoin_aide' : (alerts.length ? 'a_surveiller' : 'ok');
        const lastHelp = help[0] ? { difficultes: parseDiff(help[0]), createdAt: help[0].created_at, statut: help[0].statut } : null;
        return { clientName: c.clientName, suivi: c.suivi, adapte: c.adapte, autre: c.autre, saute: c.saute, days: c.days, score, lastDate: c.lastDate, alerts, statut, lastHelp };
      };
      const clients = Object.values(byClient).map(build);
      Object.keys(helpByClient).forEach((name) => {
        if (!byClient[name]) clients.push(build({ clientName: name, suivi: 0, adapte: 0, autre: 0, saute: 0, days: 0, scoreSum: 0, lastDate: '' }));
      });
      const rank = { besoin_aide: 0, a_surveiller: 1, ok: 2 };
      clients.sort((a, b) => (rank[a.statut] - rank[b.statut]) || (a.score - b.score));
      res.json({ ok: true, clients });
    } catch (e) {
      console.error('Erreur adherence coach GET :', e);
      res.status(500).json({ ok: false, error: 'Lecture impossible.' });
    }
  });

  // --- Mode démonstration client ---
  // Démarrage d'une session démo via le code unique (PUBLIC, sans auth).
  app.post('/nutrition/demo/start', (req, res) => {
    try {
      const code = String((req.body || {}).code || '').trim();
      const cfg = getDemoConfig();
      if (!cfg.enabled) return res.json({ ok: false, reason: 'disabled' });
      if (cfg.expires_at && Date.now() > Date.parse(cfg.expires_at + 'T23:59:59')) return res.json({ ok: false, reason: 'expired' });
      if (!code || code.toLowerCase() !== String(cfg.code).toLowerCase()) return res.json({ ok: false, reason: 'invalid' });
      const token = crypto.randomUUID();
      const until = Date.now() + 4 * 3600 * 1000; // session démo de 4 h
      sessions.set(token, { role: 'nutrition_demo', name: 'Démo', demo: true });
      getDb().prepare('UPDATE nutrition_demo SET uses = uses + 1 WHERE id = 1').run();
      getDb().prepare('INSERT INTO nutrition_demo_access (accessed_at) VALUES (?)').run(new Date().toISOString());
      res.json({ ok: true, token, until });
    } catch (e) {
      console.error('Erreur demo/start :', e);
      res.status(500).json({ ok: false, reason: 'error' });
    }
  });

  // --- Comptes clients (inscription simple : email + prenom + nom) ---
  // PUBLIC : cree OU identifie un client et ouvre une session "usage nutrition"
  // (meme niveau d'acces que la demo -> reutilise toute la plomberie cliente).
  // Pas de mot de passe : identification simple, comme demande.
  app.post('/nutrition/account/login', (req, res) => {
    try {
      const email = String((req.body || {}).email || '').trim().toLowerCase().slice(0, 160);
      const prenom = String((req.body || {}).prenom || '').trim().slice(0, 80);
      const nom = String((req.body || {}).nom || '').trim().slice(0, 80);
      if (!email || email.indexOf('@') < 1 || !prenom || !nom) {
        return res.status(400).json({ ok: false, error: 'Email, prénom et nom requis.' });
      }
      const now = new Date().toISOString();
      const row = getDb().prepare('SELECT * FROM nutrition_clients WHERE email = ?').get(email);
      let data = null, isNew = true;
      if (row) {
        getDb().prepare('UPDATE nutrition_clients SET prenom = ?, nom = ?, updated_at = ? WHERE email = ?').run(prenom, nom, now, email);
        try { data = row.data ? JSON.parse(row.data) : null; } catch (_) { data = null; }
        isNew = !data; // "nouveau" = pas encore de plan/profil enregistre -> onboarding
      } else {
        getDb().prepare('INSERT INTO nutrition_clients (email, prenom, nom, data, created_at, updated_at) VALUES (?,?,?,?,?,?)').run(email, prenom, nom, null, now, now);
      }
      const token = crypto.randomUUID();
      const until = Date.now() + 30 * 24 * 3600 * 1000; // session 30 jours
      sessions.set(token, { role: 'nutrition_demo', name: prenom, demo: true, client: true, email });
      res.json({ ok: true, isNew, token, until, prenom, nom, data });
    } catch (e) {
      console.error('Erreur /nutrition/account/login :', e);
      res.status(500).json({ ok: false, error: 'Connexion impossible.' });
    }
  });

  // Sauvegarde des donnees du client connecte (profil + plan + suivi).
  // Protege par le token de session client (requireAuth).
  app.post('/nutrition/account/save', requireAuth, (req, res) => {
    try {
      const email = req.session && req.session.email;
      if (!email || !req.session.client) return res.status(403).json({ ok: false, error: 'Session client requise.' });
      let dataStr = '';
      try { dataStr = JSON.stringify((req.body || {}).data || {}); } catch (_) { return res.status(400).json({ ok: false, error: 'Données invalides.' }); }
      if (dataStr.length > 2000000) return res.status(413).json({ ok: false, error: 'Trop volumineux.' });
      const now = new Date().toISOString();
      const upd = getDb().prepare('UPDATE nutrition_clients SET data = ?, updated_at = ? WHERE email = ?').run(dataStr, now, email);
      if (!upd.changes) {
        getDb().prepare('INSERT OR IGNORE INTO nutrition_clients (email, prenom, nom, data, created_at, updated_at) VALUES (?,?,?,?,?,?)').run(email, req.session.name || '', '', dataStr, now, now);
      }
      res.json({ ok: true });
    } catch (e) {
      console.error('Erreur /nutrition/account/save :', e);
      res.status(500).json({ ok: false, error: 'Sauvegarde impossible.' });
    }
  });

  // Liste des clients inscrits (administrateur principal).
  app.get('/nutrition/api/clients', requireAuth, requireAdmin, (req, res) => {
    try {
      const rows = getDb().prepare("SELECT email, prenom, nom, data, coach_id, created_at, updated_at FROM nutrition_clients ORDER BY datetime(CASE WHEN updated_at != '' THEN updated_at ELSE created_at END) DESC").all();
      const coachMap = {};
      try { getDb().prepare('SELECT id, name FROM coaches WHERE archived = 0').all().forEach((c) => { coachMap[c.id] = c.name; }); } catch (_) { /* table absente */ }
      const clients = rows.map((r) => {
        let objectif = '', hasPlan = false, savedAt = '';
        try {
          const d = r.data ? JSON.parse(r.data) : null;
          if (d) {
            hasPlan = !!d.plan;
            objectif = (d.profil && (d.profil.objectif || d.profil.but)) || '';
            savedAt = d.savedAt || '';
          }
        } catch (_) { /* données illisibles -> ignorées */ }
        return { email: r.email, prenom: r.prenom, nom: r.nom, createdAt: r.created_at, updatedAt: r.updated_at, objectif, hasPlan, savedAt, coachId: r.coach_id || null, coachName: (r.coach_id && coachMap[r.coach_id]) || null };
      });
      res.json({ ok: true, total: clients.length, clients });
    } catch (e) {
      console.error('Erreur /nutrition/api/clients :', e);
      res.status(500).json({ ok: false, error: 'Lecture impossible.' });
    }
  });

  // Liste des coachs sportifs (pour l'attribution coach -> client). Admin seulement.
  app.get('/nutrition/api/coaches', requireAuth, requireAdmin, (req, res) => {
    try {
      const rows = getDb().prepare('SELECT id, name, studio FROM coaches WHERE archived = 0 ORDER BY name COLLATE NOCASE').all();
      res.json({ ok: true, coaches: rows });
    } catch (e) {
      console.error('Erreur /nutrition/api/coaches :', e);
      res.status(500).json({ ok: false, error: 'Lecture impossible.' });
    }
  });

  // Attribue (ou retire avec coach_id=null) le coach sportif d'un client nutrition. Admin seulement.
  app.post('/nutrition/api/clients/:email/coach', requireAuth, requireAdmin, (req, res) => {
    try {
      const email = String(req.params.email || '').trim();
      if (!email) return res.status(400).json({ ok: false, error: 'Email manquant.' });
      let coachId = (req.body || {}).coach_id;
      coachId = (coachId === null || coachId === '' || coachId === undefined) ? null : Number(coachId);
      if (coachId !== null) {
        if (!Number.isInteger(coachId)) return res.status(400).json({ ok: false, error: 'Coach invalide.' });
        const exists = getDb().prepare('SELECT id FROM coaches WHERE id = ? AND archived = 0').get(coachId);
        if (!exists) return res.status(400).json({ ok: false, error: 'Coach inconnu.' });
      }
      const upd = getDb().prepare('UPDATE nutrition_clients SET coach_id = ? WHERE email = ?').run(coachId, email);
      if (!upd.changes) return res.status(404).json({ ok: false, error: 'Client introuvable.' });
      res.json({ ok: true, coachId });
    } catch (e) {
      console.error('Erreur attribution coach :', e);
      res.status(500).json({ ok: false, error: 'Attribution impossible.' });
    }
  });

  // Clients du coach connecté (admin = tous). Scopé par coach_id côté serveur.
  app.get('/nutrition/api/coach/clients', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const sc = req.nutritionScope;
      const order = " ORDER BY datetime(CASE WHEN updated_at != '' THEN updated_at ELSE created_at END) DESC";
      const cols = 'SELECT email, prenom, nom, data, coach_id, created_at, updated_at FROM nutrition_clients';
      const rows = sc.isAdmin
        ? getDb().prepare(cols + order).all()
        : getDb().prepare(cols + ' WHERE coach_id = ?' + order).all(sc.coachId);
      const coachMap = {};
      try { getDb().prepare('SELECT id, name FROM coaches WHERE archived = 0').all().forEach((c) => { coachMap[c.id] = c.name; }); } catch (_) { /* ignore */ }
      const clients = rows.map((r) => {
        let objectif = '', hasPlan = false, savedAt = '';
        try {
          const d = r.data ? JSON.parse(r.data) : null;
          if (d) { hasPlan = !!d.plan; objectif = (d.profil && (d.profil.objectif || d.profil.but)) || ''; savedAt = d.savedAt || ''; }
        } catch (_) { /* illisible */ }
        return { email: r.email, prenom: r.prenom, nom: r.nom, createdAt: r.created_at, updatedAt: r.updated_at, objectif, hasPlan, savedAt, coachId: r.coach_id || null, coachName: (r.coach_id && coachMap[r.coach_id]) || null };
      });
      res.json({ ok: true, total: clients.length, scope: sc.isAdmin ? 'admin' : 'coach', clients });
    } catch (e) {
      console.error('Erreur /nutrition/api/coach/clients :', e);
      res.status(500).json({ ok: false, error: 'Lecture impossible.' });
    }
  });

  // Fiche détaillée d'un client (coach = uniquement SES clients ; admin = tous). Identité
  // par email : profil/objectif/pesées viennent du blob `data` (clé email, propre) ; le suivi
  // récent (adhérence/aide) est scopé via `client_email` désormais rempli sur les tables legacy.
  app.get('/nutrition/api/coach/clients/:email', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const sc = req.nutritionScope;
      const email = String(req.params.email || '').trim();
      if (!email) return res.status(400).json({ ok: false, error: 'Email manquant.' });
      const row = getDb().prepare('SELECT email, prenom, nom, data, coach_id, created_at, updated_at FROM nutrition_clients WHERE email = ?').get(email);
      if (!row) return res.status(404).json({ ok: false, error: 'Client introuvable.' });
      if (!sc.isAdmin && row.coach_id !== sc.coachId) return res.status(403).json({ ok: false, error: 'Client non attribué.' });

      let profil = {}, objectif = '', hasPlan = false, planJours = 0, savedAt = '', startDate = '';
      let pesees = [];
      try {
        const d = row.data ? JSON.parse(row.data) : null;
        if (d) {
          profil = d.profil || {};
          objectif = (profil.objectif || profil.but) || '';
          hasPlan = !!d.plan;
          planJours = (d.plan && Array.isArray(d.plan.jours) && d.plan.jours.length) || 0;
          savedAt = d.savedAt || '';
          startDate = d.startDate || '';
          pesees = Array.isArray(d.pesees) ? d.pesees.slice(-12).map((p) => ({ ts: p.ts || 0, poids: p.poids, masse_musculaire: p.masse_musculaire, fatigue: p.fatigue })) : [];
        }
      } catch (_) { /* data illisible -> fiche minimale */ }

      // Profil épuré (on ne renvoie que des champs d'affichage, pas tout le blob).
      const profilPublic = {
        sexe: profil.sexe || '', age: profil.age || '', taille: profil.taille || '',
        poidsDepart: profil.poids || profil.poids_depart || '', poidsCible: profil.poids_cible || profil.objectif_poids || '',
        activite: profil.activite || '', allergies: Array.isArray(profil.allergies) ? profil.allergies : [],
        regimes: Array.isArray(profil.regimes) ? profil.regimes : (Array.isArray(profil.regime) ? profil.regime : []),
        ajustementKcal: Math.round(Number(profil.ajustementKcal) || 0),
      };

      const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
      let adherence = [], help = [], scansCount = 0;
      try {
        adherence = getDb().prepare("SELECT date, suivi, adapte, autre, saute, score FROM nutrition_adherence WHERE client_email = ? AND date >= ? ORDER BY date DESC LIMIT 14").all(email, since);
      } catch (_) { /* ignore */ }
      try {
        help = getDb().prepare("SELECT created_at, difficultes, message, statut FROM nutrition_help_requests WHERE client_email = ? ORDER BY id DESC LIMIT 5").all(email)
          .map((h) => ({ createdAt: h.created_at, statut: h.statut, message: h.message, difficultes: (() => { try { return JSON.parse(h.difficultes); } catch (_) { return []; } })() }));
      } catch (_) { /* ignore */ }
      try { scansCount = getDb().prepare("SELECT COUNT(*) AS n FROM nutrition_scans WHERE client_email = ?").get(email).n; } catch (_) { /* ignore */ }

      const adhDays = adherence.length;
      const adhScore = adhDays ? Math.round(adherence.reduce((s, a) => s + (a.score || 0), 0) / adhDays) : null;

      res.json({
        ok: true,
        client: {
          email: row.email, prenom: row.prenom, nom: row.nom, coachId: row.coach_id || null,
          createdAt: row.created_at, updatedAt: row.updated_at,
          objectif, hasPlan, planJours, savedAt, startDate,
          profil: profilPublic, pesees, adherence, adhScore, adhDays,
          help, scansCount,
        },
      });
    } catch (e) {
      console.error('Erreur fiche client :', e);
      res.status(500).json({ ok: false, error: 'Lecture impossible.' });
    }
  });

  // Gestion du code démo (administrateur principal).
  app.get('/nutrition/api/demo-config', requireAuth, requireAdmin, (req, res) => {
    const cfg = getDemoConfig();
    const accesses = getDb().prepare('SELECT accessed_at FROM nutrition_demo_access ORDER BY id DESC LIMIT 10').all().map((r) => r.accessed_at);
    res.json({ ok: true, code: cfg.code, enabled: !!cfg.enabled, expiresAt: cfg.expires_at, uses: cfg.uses, accesses });
  });
  app.post('/nutrition/api/demo-config', requireAuth, requireAdmin, (req, res) => {
    try {
      const b = req.body || {};
      const cur = getDemoConfig();
      const code = b.code != null ? String(b.code).trim().slice(0, 60) : cur.code;
      if (!code) return res.status(400).json({ ok: false, error: 'Code requis.' });
      const enabled = b.enabled != null ? (b.enabled ? 1 : 0) : cur.enabled;
      const expires = ('expiresAt' in b) ? (b.expiresAt ? String(b.expiresAt).slice(0, 10) : null) : cur.expires_at;
      getDb().prepare('UPDATE nutrition_demo SET code = ?, enabled = ?, expires_at = ? WHERE id = 1').run(code, enabled, expires || null);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ ok: false, error: 'Mise à jour impossible.' }); }
  });
  app.post('/nutrition/api/demo-reset', requireAuth, requireAdmin, (req, res) => {
    getDb().prepare('UPDATE nutrition_demo SET uses = 0 WHERE id = 1').run();
    getDb().prepare('DELETE FROM nutrition_demo_access').run();
    res.json({ ok: true });
  });

  // --- Analyse d'assiette en photo : sauvegarde + vue coach ---
  app.post('/nutrition/api/plate-save', requireAuth, requireNutritionAccess, (req, res) => {
    try {
      const b = req.body || {};
      const n = (v) => { const x = Math.round(Number(v)); return (isFinite(x) && x >= 0) ? x : 0; };
      const coh = ['coherent', 'correct', 'reprendre'].includes(b.coherence) ? b.coherence : '';
      const thumb = (typeof b.thumb === 'string' && b.thumb.startsWith('data:image')) ? b.thumb.slice(0, 400000) : '';
      const info = getDb().prepare(`INSERT INTO nutrition_plate_analysis
        (client_name, client_email, created_at, meal_label, precision_txt, aliments, kcal, proteines, glucides, lipides, coherence, ia_comment, thumb, client_message, advice_statut)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        String(b.clientName || req.session.name || 'Client').slice(0, 120), (req.session && req.session.email) || '', new Date().toISOString(),
        String(b.mealLabel || '').slice(0, 80), String(b.precision || '').slice(0, 300),
        JSON.stringify(Array.isArray(b.aliments) ? b.aliments.slice(0, 12) : []),
        n(b.kcal), n(b.proteines), n(b.glucides), n(b.lipides), coh,
        JSON.stringify({ pointPositif: String(b.pointPositif || '').slice(0, 240), axe: String(b.axe || '').slice(0, 240), action: String(b.action || '').slice(0, 240), coherencePlan: String(b.coherencePlan || '').slice(0, 240) }),
        thumb, String(b.clientMessage || '').slice(0, 500), b.askCoach ? 'a_traiter' : ''
      );
      res.json({ ok: true, id: info.lastInsertRowid });
    } catch (e) { console.error('Erreur plate-save :', e); res.status(500).json({ ok: false, error: 'Enregistrement impossible.' }); }
  });
  app.get('/nutrition/api/plate-analyses', requireAuth, requireAdmin, (req, res) => {
    try {
      const rows = getDb().prepare('SELECT * FROM nutrition_plate_analysis ORDER BY id DESC LIMIT 100').all();
      const items = rows.map((r) => ({
        id: r.id, clientName: r.client_name, createdAt: r.created_at, mealLabel: r.meal_label,
        precision: r.precision_txt, aliments: (() => { try { return JSON.parse(r.aliments); } catch (_) { return []; } })(),
        kcal: r.kcal, proteines: r.proteines, glucides: r.glucides, lipides: r.lipides, coherence: r.coherence,
        iaComment: (() => { try { return JSON.parse(r.ia_comment); } catch (_) { return {}; } })(),
        thumb: r.thumb, clientMessage: r.client_message, adviceStatut: r.advice_statut,
      }));
      res.json({ ok: true, items });
    } catch (e) { console.error('Erreur plate-analyses :', e); res.status(500).json({ ok: false, error: 'Lecture impossible.' }); }
  });
  app.patch('/nutrition/api/plate-advice/:id', requireAuth, requireAdmin, (req, res) => {
    try {
      const statut = String((req.body || {}).statut || '');
      if (!['a_traiter', 'en_cours', 'traite'].includes(statut)) return res.status(400).json({ ok: false, error: 'Statut invalide.' });
      const info = getDb().prepare('UPDATE nutrition_plate_analysis SET advice_statut = ? WHERE id = ?').run(statut, Number(req.params.id));
      res.json({ ok: info.changes > 0 });
    } catch (e) { res.status(500).json({ ok: false, error: 'Mise à jour impossible.' }); }
  });

  // --- Google Agenda : statut / connexion OAuth / sync / deconnexion ---
  app.get('/nutrition/api/google/status', requireAuth, requireNutritionUse, (req, res) => {
    const row = getDb().prepare('SELECT calendar_name FROM nutrition_google_token WHERE client_name = ?').get(googleClientKey(req));
    res.json({ ok: true, configured: googleConfigured(), connected: !!row, calendarName: row ? row.calendar_name : '' });
  });
  app.get('/nutrition/api/google/connect', requireAuth, requireNutritionUse, (req, res) => {
    if (!googleConfigured()) return res.json({ ok: false, configured: false });
    const c = googleCfg();
    const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
      client_id: c.id, redirect_uri: c.redirect, response_type: 'code', scope: GOOGLE_SCOPE,
      access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true',
      state: signState({ n: googleClientKey(req), t: Date.now() }),
    });
    res.json({ ok: true, configured: true, url });
  });
  // Retour OAuth (navigation navigateur -> pas de Bearer). Page qui se referme.
  app.get('/nutrition/api/google/callback', async (req, res) => {
    const page = (msg, ok) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:Inter,system-ui,sans-serif;background:#F7F3EC;color:#1F2328;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;margin:0"><div style="max-width:320px;padding:24px"><div style="width:60px;height:60px;border-radius:50%;margin:0 auto 14px;background:${ok ? '#E7F7EE' : '#FDECEC'};display:flex;align-items:center;justify-content:center;font-size:28px">${ok ? '✓' : '×'}</div><h2 style="margin:0 0 6px;font-size:19px">${msg}</h2><p style="color:#6B7280;font-size:14px;margin:0">Vous pouvez fermer cette fenetre.</p></div><script>try{if(window.opener)window.opener.postMessage('mcn-google-${ok ? 'connected' : 'error'}','*')}catch(e){}setTimeout(function(){window.close()},1400)</script></body></html>`;
    try {
      if (req.query.error || !req.query.code) return res.send(page('Connexion annulee.', false));
      const st = verifyState(req.query.state); if (!st) return res.send(page('Lien invalide ou expire.', false));
      const c = googleCfg();
      const tok = await googleTokenRequest({ code: req.query.code, client_id: c.id, client_secret: c.secret, redirect_uri: c.redirect, grant_type: 'authorization_code' });
      if (!tok.access_token) return res.send(page('La connexion a echoue.', false));
      const expiry = Date.now() + (tok.expires_in || 3600) * 1000;
      let calId = '', calName = 'My Coach Nutrition';
      try { const cr = await gcal(tok.access_token, 'POST', '/calendars', { summary: 'My Coach Nutrition' }); if (cr.status < 300 && cr.json.id) { calId = cr.json.id; calName = cr.json.summary || calName; } } catch (_) { /* fallback */ }
      if (!calId) { calId = 'primary'; calName = 'Agenda principal'; }
      getDb().prepare(`INSERT INTO nutrition_google_token (client_name, access_token, refresh_token, expiry, calendar_id, calendar_name, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(client_name) DO UPDATE SET access_token = excluded.access_token,
          refresh_token = CASE WHEN excluded.refresh_token != '' THEN excluded.refresh_token ELSE nutrition_google_token.refresh_token END,
          expiry = excluded.expiry, calendar_id = excluded.calendar_id, calendar_name = excluded.calendar_name, updated_at = excluded.updated_at`)
        .run(st.n, tok.access_token, tok.refresh_token || '', expiry, calId, calName, new Date().toISOString());
      res.send(page('Google Agenda connecte !', true));
    } catch (e) { console.error('google callback :', e); res.send(page('Erreur de connexion.', false)); }
  });
  app.post('/nutrition/api/google/sync', requireAuth, requireNutritionUse, async (req, res) => {
    try {
      const { scope = 'semaine', plan, planId, dinerTard } = req.body || {};
      const tokRow = await googleValidToken(googleClientKey(req));
      if (!tokRow) return res.json({ ok: false, error: 'not_connected' });
      const events = buildPlanEvents(plan, scope, planId || 'plan', !!dinerTard);
      if (!events.length) return res.json({ ok: false, error: 'empty' });
      let count = 0, fail = 0;
      for (const ev of events) {
        const calPath = '/calendars/' + encodeURIComponent(tokRow.calendar_id) + '/events';
        const ins = await gcal(tokRow.access_token, 'POST', calPath, ev);
        if (ins.status === 409) { const up = await gcal(tokRow.access_token, 'PUT', calPath + '/' + ev.id, ev); if (up.status < 300) count++; else fail++; }
        else if (ins.status < 300) count++; else fail++;
      }
      res.json({ ok: count > 0, count, fail, calendarName: tokRow.calendar_name });
    } catch (e) { console.error('google sync :', e); res.status(500).json({ ok: false, error: 'sync' }); }
  });
  app.post('/nutrition/api/google/disconnect', requireAuth, requireNutritionUse, (req, res) => {
    getDb().prepare('DELETE FROM nutrition_google_token WHERE client_name = ?').run(googleClientKey(req));
    res.json({ ok: true });
  });

  // Génération / lecture du module : admin OU session démo (les routes coach
  // ci-dessus restent en requireAdmin). Les écritures client (help/scan/adherence)
  // sont en requireNutritionAccess et ne sont jamais appelées en mode démo.
  app.use('/nutrition/api', requireAuth, requireNutritionUse);
  app.use('/nutrition', nutritionApp);                  // sert le module (pages + statique)
} catch (e) {
  console.warn('Module Nutrition non chargé :', e.message);
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

  // Check Standards admin PINs : superviseurs métier en lecture seule sur
  // TOUS les studios et TOUS les jours. Aucun pouvoir de modification.
  const STANDARDS_VIEWER_PINS = {
    [process.env.STANDARDS_ADMIN_PIN_1 || 'marvindr']: 'Marvin',
    [process.env.STANDARDS_ADMIN_PIN_2 || 'quentinamc']: 'Quentin',
  };
  const stdViewerName = STANDARDS_VIEWER_PINS[pin.trim()];
  if (stdViewerName) {
    const token = crypto.randomUUID();
    sessions.set(token, { role: 'standards_admin', name: stdViewerName, sales_rep_id: null });
    return res.json({ token, role: 'standards_admin', name: stdViewerName, sales_rep_id: null });
  }

  // Check commercial / phoneur PIN
  const rep = db.prepare('SELECT id, name, role FROM sales_reps WHERE pin = ? AND archived = 0').get(pin.trim());
  if (rep) {
    const token = crypto.randomUUID();
    const role = rep.role || 'commercial';
    sessions.set(token, { role, name: rep.name, sales_rep_id: rep.id });
    return res.json({ token, role, name: rep.name, sales_rep_id: rep.id });
  }

  // Check coach LEADER PIN (table coach_leaders dédiée) — rôle : 'coach_leader'
  // can_view_history : 1 = leader complet (voit tout), 0 = assistant (today only)
  // coach_slot : NULL = voit tout, 1 ou 2 = ne voit que sa rangée
  const cl = db.prepare('SELECT id, name, studio, can_view_history, coach_slot FROM coach_leaders WHERE pin = ? AND archived = 0').get(pin.trim());
  if (cl) {
    const token = crypto.randomUUID();
    const canViewHistory = !!cl.can_view_history;
    const coachSlot = cl.coach_slot || null;
    sessions.set(token, { role: 'coach_leader', name: cl.name, coach_leader_id: cl.id, studio: cl.studio, can_view_history: canViewHistory, coach_slot: coachSlot, sales_rep_id: null });
    return res.json({ token, role: 'coach_leader', name: cl.name, coach_leader_id: cl.id, studio: cl.studio, can_view_history: canViewHistory, coach_slot: coachSlot, sales_rep_id: null });
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

  // Code Guest : reconnu mais pas de token immédiat. Le front affichera
  // un sous-formulaire pour saisir studio + prénom, puis appellera
  // /api/auth/guest-login pour finaliser.
  const guestCodeCheck = process.env.GUEST_CODE || 'guest';
  if (pin.trim() === guestCodeCheck) {
    return res.json({ guest_pending: true });
  }

  return res.status(401).json({ error: 'Code incorrect' });
});

// ─── Guest login ─────────────────────────────────────────────
// Personne extérieure qui passe occasionnellement dans un studio.
// Code partagé (env GUEST_CODE, défaut "guest"). À la connexion, on
// demande le studio + le prénom pour identifier le guest.
// Le guest a les mêmes droits qu'un assistant studio : photos
// quotidiennes seulement, modification du jour courant uniquement.
app.post('/api/auth/guest-login', (req, res) => {
  const pin = String((req.body && req.body.pin) || '').trim();
  const studio = String((req.body && req.body.studio) || '').trim();
  const name = String((req.body && req.body.name) || '').trim();
  const guestCode = process.env.GUEST_CODE || 'guest';
  if (!pin) return res.status(400).json({ error: 'Code requis' });
  if (pin !== guestCode) return res.status(401).json({ error: 'Code guest incorrect' });
  if (!studio) return res.status(400).json({ error: 'Studio requis' });
  if (!name || name.length < 2) return res.status(400).json({ error: 'Prénom requis (2 caractères min)' });
  // coach_slot optionnel : si fourni (1 ou 2) → guest filtré sur cette rangée
  let coachSlot = null;
  if (req.body && req.body.coach_slot != null) {
    const n = parseInt(req.body.coach_slot, 10);
    if (n === 1 || n === 2) coachSlot = n;
  }
  const token = crypto.randomUUID();
  const safeName = name.replace(/[<>"'`]/g, '').slice(0, 40);
  sessions.set(token, {
    role: 'guest',
    name: safeName,
    studio,
    can_view_history: false,
    coach_slot: coachSlot,
    sales_rep_id: null,
  });
  res.json({ token, role: 'guest', name: safeName, studio, can_view_history: false, coach_slot: coachSlot, sales_rep_id: null });
});

// ─── Change PIN ──────────────────────────────────────────────
// Le salarié connecté peut changer son propre code PIN. Le nouveau PIN
// doit être unique sur l'ensemble des tables (sales_reps, coaches,
// coach_leaders, admin) — l'admin garde la main car l'update va
// directement dans la même ligne qu'il gère côté admin.
//
// Rôles autorisés : admin, commercial, phoneur, coach, coach-leader,
// coach_leader. Rôles hardcodés (consultant, academy, director,
// standards_admin) ou éphémères (guest) ne peuvent pas changer leur PIN.
app.post('/api/auth/change-pin', requireAuth, (req, res) => {
  const current = String((req.body && req.body.current_pin) || '').trim();
  const next = String((req.body && req.body.new_pin) || '').trim();
  if (!current || !next) return res.status(400).json({ error: 'Code actuel et nouveau code requis' });
  if (next.length < 4) return res.status(400).json({ error: 'Le nouveau code doit faire au moins 4 caractères' });
  if (next.length > 32) return res.status(400).json({ error: 'Code trop long (32 caractères max)' });
  if (current === next) return res.status(400).json({ error: 'Le nouveau code doit être différent de l\'ancien' });

  const db = getDb();
  const role = req.session.role;
  const session = req.session;

  // Trouve la ligne du salarié + vérifie son code actuel
  let table, idCol, currentRow;
  if (role === 'admin') {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('admin_pin');
    const adminPin = (row && row.value) || process.env.ADMIN_PIN || 'ginkgo';
    if (current !== adminPin) return res.status(401).json({ error: 'Code actuel incorrect' });
    table = 'admin'; // marqueur spécial
  } else if (['commercial', 'phoneur'].includes(role) && session.sales_rep_id) {
    table = 'sales_reps'; idCol = session.sales_rep_id;
    currentRow = db.prepare('SELECT pin FROM sales_reps WHERE id = ? AND archived = 0').get(idCol);
  } else if (['coach', 'coach-leader'].includes(role) && session.coach_id) {
    table = 'coaches'; idCol = session.coach_id;
    currentRow = db.prepare('SELECT pin FROM coaches WHERE id = ? AND archived = 0').get(idCol);
  } else if (role === 'coach_leader' && session.coach_leader_id) {
    table = 'coach_leaders'; idCol = session.coach_leader_id;
    currentRow = db.prepare('SELECT pin FROM coach_leaders WHERE id = ? AND archived = 0').get(idCol);
  } else {
    return res.status(403).json({ error: 'Ton type de compte ne permet pas de changer le code en autonomie. Demande à l\'admin.' });
  }
  if (table !== 'admin') {
    if (!currentRow) return res.status(404).json({ error: 'Compte introuvable' });
    if (currentRow.pin !== current) return res.status(401).json({ error: 'Code actuel incorrect' });
  }

  // Unicité du nouveau code sur l'ensemble des tables (hors propre ligne)
  const adminRow = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('admin_pin');
  const adminPinActuel = (adminRow && adminRow.value) || process.env.ADMIN_PIN || 'ginkgo';
  if (table !== 'admin' && next === adminPinActuel) {
    return res.status(409).json({ error: 'Ce code est déjà utilisé' });
  }
  const takenSr = db.prepare('SELECT id FROM sales_reps WHERE pin = ? AND archived = 0' + (table === 'sales_reps' ? ' AND id != ?' : '')).get(...(table === 'sales_reps' ? [next, idCol] : [next]));
  const takenC  = db.prepare('SELECT id FROM coaches WHERE pin = ? AND archived = 0'    + (table === 'coaches'    ? ' AND id != ?' : '')).get(...(table === 'coaches'    ? [next, idCol] : [next]));
  const takenCl = db.prepare('SELECT id FROM coach_leaders WHERE pin = ? AND archived = 0' + (table === 'coach_leaders' ? ' AND id != ?' : '')).get(...(table === 'coach_leaders' ? [next, idCol] : [next]));
  if (takenSr || takenC || takenCl) return res.status(409).json({ error: 'Ce code est déjà utilisé' });

  // Update
  if (table === 'admin') {
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run('admin_pin', next);
  } else if (table === 'sales_reps') {
    db.prepare('UPDATE sales_reps SET pin = ? WHERE id = ?').run(next, idCol);
  } else if (table === 'coaches') {
    db.prepare('UPDATE coaches SET pin = ? WHERE id = ?').run(next, idCol);
  } else if (table === 'coach_leaders') {
    db.prepare('UPDATE coach_leaders SET pin = ? WHERE id = ?').run(next, idCol);
  }
  res.json({ ok: true });
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
  const { filename, rows, target_slot } = req.body || {};
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'rows array non vide requis' });
  }
  const targetSlot = ['cur', 'prev'].includes(String(target_slot || '').toLowerCase())
    ? String(target_slot).toLowerCase()
    : null;
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

  // Si l'upload cible un slot, on l'assigne automatiquement à la semaine
  // la plus représentée dans le fichier (en pratique : la semaine principale
  // du fichier — la majorité des lignes y tombent).
  let assignedSlot = null;
  let assignedWeek = null;
  if (targetSlot) {
    // Trouve la semaine majoritaire dans les rows insérés
    const weekCounts = {};
    for (const r of rows) {
      if (r && r.week_start) weekCounts[r.week_start] = (weekCounts[r.week_start] || 0) + 1;
    }
    const sortedWeeks = Object.entries(weekCounts).sort((a, b) => b[1] - a[1]);
    if (sortedWeeks.length > 0) {
      assignedWeek = sortedWeeks[0][0];
      prelSetSlot(db, targetSlot, assignedWeek);
      assignedSlot = targetSlot;
    }
  }

  res.json({
    ok: true,
    upload_id: uploadId,
    rows_count: rows.length,
    replaced_count: replacedCount,
    week_start_min: minWeek,
    week_start_max: maxWeek,
    clubs: Array.from(clubs),
    assigned_slot: assignedSlot,
    assigned_week: assignedWeek,
  });
});

// Ventes de la semaine — utilisé dans la vue P.R.E.L pour donner le
// contexte business à côté des perdus / nouveaux contrats.
app.get('/api/prel/sales-week', requireAuth, requireAdmin, (req, res) => {
  const week = String(req.query.week || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return res.status(400).json({ error: 'week=YYYY-MM-DD requis' });
  const db = getDb();
  const totals = db.prepare(`
    SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
    FROM sales WHERE week_start = ?
  `).get(week);
  const byRep = db.prepare(`
    SELECT s.sales_rep_id AS rep_id, r.name AS rep_name,
           COUNT(*) AS count, COALESCE(SUM(s.amount), 0) AS amount
    FROM sales s
    LEFT JOIN sales_reps r ON r.id = s.sales_rep_id
    WHERE s.week_start = ?
    GROUP BY s.sales_rep_id, r.name
    ORDER BY amount DESC, r.name ASC
  `).all(week);
  res.json({
    week_start: week,
    total_count: totals.count || 0,
    total_amount: totals.total || 0,
    by_rep: byRep,
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

// Suivi hebdomadaire des prélèvements — vue de pilotage dirigeant.
// Lit les données DÉJÀ stockées dans prel_rows (aucune donnée bancaire n'y est
// persistée) et les agrège par club + statut pour une semaine donnée.
// Aucune ré-importation : on relit simplement l'existant.
app.get('/api/prel/suivi', requireAuth, requireAdmin, (req, res) => {
  const week = String(req.query.week || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return res.status(400).json({ error: 'week=YYYY-MM-DD requis' });
  const db = getDb();
  const rows = db.prepare(`
    SELECT club, membre, prestation, ttc, echeance, etat, vendeur, raison
    FROM prel_rows
    WHERE week_start = ?
    ORDER BY club ASC, membre ASC
  `).all(week);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const normEtat = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  function classify(etat, echeance) {
    const e = normEtat(etat);
    let overdue = false;
    if (echeance && /^\d{4}-\d{2}-\d{2}$/.test(echeance)) {
      overdue = new Date(echeance + 'T00:00:00') < today;
    }
    if (e.includes('encaiss') || e === 'ok') return { code: 'paye', label: 'Payé' };
    if (e.includes('impay')) return { code: 'impaye', label: 'Impayé' };
    if (e.includes('suspend')) return { code: 'suspendu', label: 'Suspendu' };
    // Envoyé / A faire / état inconnu / vide → à contrôler
    if (overdue) return { code: 'controle', label: 'À contrôler', anomaly: true };
    return { code: 'controle', label: 'En attente' };
  }

  const clubsMap = {};
  const totals = { attendu: 0, paye: 0, impaye: 0, suspendu: 0, controle: 0, count: 0 };
  for (const r of rows) {
    const st = classify(r.etat, r.echeance);
    const ttc = (typeof r.ttc === 'number' && !Number.isNaN(r.ttc)) ? r.ttc : 0;
    const club = r.club || 'Studio non précisé';
    if (!clubsMap[club]) clubsMap[club] = { club, lines: [], attendu: 0, paye: 0, impaye: 0, suspendu: 0, controle: 0, count: 0 };
    const c = clubsMap[club];
    c.lines.push({
      membre: r.membre || '—',
      prestation: r.prestation || '—',
      ttc,
      echeance: r.echeance || null,
      etat: r.etat || '',
      status: st.code,
      statusLabel: st.label,
      anomaly: !!st.anomaly,
      vendeur: r.vendeur || '—',
      raison: r.raison || '',
    });
    c.count++; c.attendu += ttc; totals.count++; totals.attendu += ttc;
    if (st.code === 'paye') { c.paye += ttc; totals.paye += ttc; }
    else if (st.code === 'impaye') { c.impaye += ttc; totals.impaye += ttc; }
    else if (st.code === 'suspendu') { c.suspendu += ttc; totals.suspendu += ttc; }
    else { c.controle += ttc; totals.controle += ttc; }
  }
  const clubs = Object.values(clubsMap).sort((a, b) => a.club.localeCompare(b.club));
  clubs.forEach(c => { c.taux = c.attendu > 0 ? c.paye / c.attendu : 0; });
  totals.taux = totals.attendu > 0 ? totals.paye / totals.attendu : 0;
  res.json({ week_start: week, totals, clubs });
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

// ─────────────────────────────────────────────────────────────────────────
// SLOTS S-1 / S : système figé d'emplacements pour la comparaison.
//
// Plutôt que d'auto-détecter les 2 semaines les plus volumineuses
// (qui peut tomber sur d'anciennes données de test), l'utilisateur définit
// explicitement quelle semaine est S et quelle semaine est S-1.
//
// Stockage : 2 clés dans app_settings
//   • prel_slot_cur_week  → semaine S (la plus récente)
//   • prel_slot_prev_week → semaine S-1 (la précédente)
//
// Endpoints :
//   GET  /api/prel/slots          → état actuel des 2 slots + métadata
//   POST /api/prel/slots/set      → { slot: 'cur'|'prev', week_start }
//   POST /api/prel/slots/clear    → { slot: 'cur'|'prev' }
//   POST /api/prel/slots/rotate   → S devient S-1, S est vidée
//   POST /api/prel/slots/cleanup  → supprime toutes les semaines hors slots
// ─────────────────────────────────────────────────────────────────────────

const PREL_SLOT_KEYS = { cur: 'prel_slot_cur_week', prev: 'prel_slot_prev_week' };
function prelGetSlot(db, slot) {
  const key = PREL_SLOT_KEYS[slot];
  if (!key) return null;
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(key);
  return row && row.value ? String(row.value) : null;
}
function prelSetSlot(db, slot, value) {
  const key = PREL_SLOT_KEYS[slot];
  if (!key) return;
  if (value == null) {
    db.prepare(`DELETE FROM app_settings WHERE key = ?`).run(key);
  } else {
    db.prepare(`
      INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now','localtime'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now','localtime')
    `).run(key, String(value));
  }
}
function prelWeekMeta(db, week) {
  if (!week) return null;
  const r = db.prepare(`
    SELECT COUNT(*) AS rows_count, COUNT(DISTINCT club) AS clubs_count
    FROM prel_rows WHERE week_start = ?
  `).get(week);
  // Dernier upload contenant cette semaine
  const up = db.prepare(`
    SELECT filename, uploaded_at FROM prel_uploads
    WHERE week_start_min <= ? AND week_start_max >= ?
    ORDER BY uploaded_at DESC LIMIT 1
  `).get(week, week);
  return {
    week_start: week,
    rows_count: r ? r.rows_count : 0,
    clubs_count: r ? r.clubs_count : 0,
    filename: up ? up.filename : null,
    uploaded_at: up ? up.uploaded_at : null,
  };
}

app.get('/api/prel/slots', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const curWeek = prelGetSlot(db, 'cur');
  const prevWeek = prelGetSlot(db, 'prev');
  res.json({
    cur: prelWeekMeta(db, curWeek),
    prev: prelWeekMeta(db, prevWeek),
  });
});

app.post('/api/prel/slots/set', requireAuth, requireAdmin, (req, res) => {
  const slot = String((req.body && req.body.slot) || '').toLowerCase();
  const weekStart = String((req.body && req.body.week_start) || '').trim();
  if (!['cur', 'prev'].includes(slot)) return res.status(400).json({ error: 'slot doit être cur ou prev' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return res.status(400).json({ error: 'week_start invalide (YYYY-MM-DD)' });
  const db = getDb();
  // Vérifie que la semaine existe en base
  const exists = db.prepare(`SELECT 1 FROM prel_rows WHERE week_start = ? LIMIT 1`).get(weekStart);
  if (!exists) return res.status(400).json({ error: `Aucune donnée pour la semaine ${weekStart}` });
  prelSetSlot(db, slot, weekStart);
  res.json({ ok: true, slot, week_start: weekStart });
});

app.post('/api/prel/slots/clear', requireAuth, requireAdmin, (req, res) => {
  const slot = String((req.body && req.body.slot) || '').toLowerCase();
  if (!['cur', 'prev'].includes(slot)) return res.status(400).json({ error: 'slot doit être cur ou prev' });
  const db = getDb();
  prelSetSlot(db, slot, null);
  res.json({ ok: true });
});

app.post('/api/prel/slots/rotate', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const curWeek = prelGetSlot(db, 'cur');
  // Rotation atomique : S devient S-1, S est vidée
  const tx = db.transaction(() => {
    prelSetSlot(db, 'prev', curWeek);
    prelSetSlot(db, 'cur', null);
  });
  tx();
  res.json({ ok: true, prev_week: curWeek, cur_week: null });
});

// Nettoyage : supprime toutes les lignes pour les semaines qui NE sont PAS
// dans les slots (utile pour purger les anciennes données de test).
app.post('/api/prel/slots/cleanup', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const curWeek = prelGetSlot(db, 'cur');
  const prevWeek = prelGetSlot(db, 'prev');
  const keep = [curWeek, prevWeek].filter(Boolean);
  if (keep.length === 0) {
    return res.status(400).json({ error: 'Aucun slot défini — refuse de tout supprimer.' });
  }
  // Liste les semaines qui vont être supprimées (pour info)
  const toDelete = db.prepare(`
    SELECT week_start, COUNT(*) AS rows_count
    FROM prel_rows
    WHERE week_start NOT IN (${keep.map(() => '?').join(',')})
    GROUP BY week_start
  `).all(...keep);
  const totalRows = toDelete.reduce((s, w) => s + w.rows_count, 0);
  const totalWeeks = toDelete.length;
  if (totalRows === 0) {
    return res.json({ ok: true, deleted_rows: 0, deleted_weeks: 0, message: 'Aucune donnée hors slots à supprimer.' });
  }
  db.prepare(`DELETE FROM prel_rows WHERE week_start NOT IN (${keep.map(() => '?').join(',')})`).run(...keep);
  res.json({
    ok: true,
    deleted_rows: totalRows,
    deleted_weeks: totalWeeks,
    weeks: toDelete.map(w => w.week_start),
    kept: keep,
  });
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
  const includeArchived = String(req.query.include_archived || '').trim() === '1';
  const db = getDb();
  // Détermination de S-1 :
  //   1. Si ?prev= est fourni dans l'URL → on l'utilise
  //   2. Sinon, si un slot prev existe ET que `week` matche le slot cur → on prend le slot prev
  //   3. Sinon, fallback : S - 7 jours
  let prevWeek = String(req.query.prev || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(prevWeek)) {
    const slotCur = prelGetSlot(db, 'cur');
    const slotPrev = prelGetSlot(db, 'prev');
    if (slotCur === week && slotPrev) {
      prevWeek = slotPrev;
    } else {
      const [y, m, d] = week.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() - 7);
      prevWeek = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2,'0')}-${String(dt.getUTCDate()).padStart(2,'0')}`;
    }
  }
  const clubs = db.prepare(`
    SELECT DISTINCT club FROM prel_rows
    WHERE week_start = ? OR week_start = ?
    ORDER BY club ASC
  `).all(week, prevWeek).map(r => r.club);
  // Pré-charge les archivés de la semaine S (par club, par id_client)
  const archivedAll = db.prepare(`SELECT * FROM prel_archived WHERE week_start = ?`).all(week);
  const archivedByClub = {};
  archivedAll.forEach(a => {
    archivedByClub[a.club] = archivedByClub[a.club] || new Map();
    archivedByClub[a.club].set(a.id_client, a);
  });
  // ───────────────────────────────────────────────────────────────────────
  // Détection « TTC en centimes » au runtime (pas de modif des données stockées) :
  // Les exports Vendor / Déciplus stockent souvent les montants en entiers
  // (6900 = 69,00 €). Si l'import historique n'a pas converti, on corrige
  // ICI à la volée, à chaque comparaison.
  // Heuristique GLOBALE (toutes lignes S-1 confondues) :
  //   médiane > 500 ET ≥ 90% des valeurs sont des entiers
  // ───────────────────────────────────────────────────────────────────────
  const globalPrevTtc = db.prepare(`
    SELECT ttc FROM prel_rows
    WHERE week_start = ? AND ttc IS NOT NULL
  `).all(prevWeek).map(r => Number(r.ttc)).filter(v => !Number.isNaN(v));
  let ttcDivisor = 1;
  if (globalPrevTtc.length >= 5) {
    const sorted = [...globalPrevTtc].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    const intRatio = globalPrevTtc.filter(v => Number.isInteger(v)).length / globalPrevTtc.length;
    if (med > 500 && intRatio > 0.9) {
      ttcDivisor = 100;
      console.log(`[prel/comparison] TTC en centimes détecté pour semaine ${prevWeek} (médiane ${med}, ${(intRatio * 100).toFixed(0)}% entiers) → ÷ 100 à la volée`);
    }
  }

  const result = clubs.map(club => {
    const prevAll = db.prepare(`
      SELECT id, id_client, id_prestation, membre, etat, echeance, ttc, vendeur, prestation, raison, tel, email
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
    // Regroupe les prestations PAR CLIENT (pour sommer le TTC total perdu)
    // Dédup : si la même (id_prestation, echeance) revient plusieurs fois pour
    // un même client (artefact d'import ou Excel avec lignes répétées), on ne
    // la compte qu'une seule fois. Fallback : (echeance, ttc) si id_prestation
    // est null.
    const byClient = new Map(); // id_client → { ...firstRow, ttc_total, prestations:[] }
    for (const r of prev) {
      if (curOkClients.has(r.id_client)) continue; // pas perdu → on saute
      const key = r.id_client != null ? r.id_client : `mb:${(r.membre || '').toLowerCase().trim()}`;
      if (!byClient.has(key)) {
        byClient.set(key, {
          id_client: r.id_client,
          membre: r.membre,
          email: r.email,
          tel: r.tel,
          ttc_total: 0,
          prestations: [],
          _seen: new Set(), // pour dédup interne
        });
      }
      const entry = byClient.get(key);
      const dedupKey = (r.id_prestation != null)
        ? `p:${r.id_prestation}|${r.echeance || ''}`
        : `f:${r.echeance || ''}|${r.ttc != null ? r.ttc : ''}|${r.prestation || ''}`;
      if (entry._seen.has(dedupKey)) continue; // doublon déjà comptabilisé
      entry._seen.add(dedupKey);
      const ttc = (Number(r.ttc) || 0) / ttcDivisor;
      entry.ttc_total += ttc;
      entry.prestations.push({
        prestation: r.prestation,
        ttc,
        echeance: r.echeance,
        vendeur: r.vendeur,
        raison: r.raison,
      });
    }
    // Nettoie le set interne avant la sérialisation
    for (const e of byClient.values()) { delete e._seen; }
    // Sépare archivés vs actifs
    const archivedMap = archivedByClub[club] || new Map();
    const perdusActifs = [];
    const perdusArchives = [];
    for (const entry of byClient.values()) {
      const archived = entry.id_client != null && archivedMap.get(entry.id_client);
      if (archived) {
        perdusArchives.push({ ...entry, archived: true, archived_note: archived.note, archived_at: archived.archived_at });
      } else {
        perdusActifs.push(entry);
      }
    }
    const perdus = includeArchived ? [...perdusActifs, ...perdusArchives] : perdusActifs;
    // Montant total perdu = somme cumulée des TTC S-1 (toutes prestations
    // des clients NON archivés). Si includeArchived=1 on inclut tout.
    const montant_total = perdusActifs.reduce((s, p) => s + (p.ttc_total || 0), 0);
    const prevClientsUniq = new Set();
    prev.forEach(r => { if (r.id_client != null) prevClientsUniq.add(r.id_client); });
    return {
      club,
      week_prev: prevWeek,
      week_cur: week,
      prev_count: prevClientsUniq.size,
      cur_ok_count: curOkClients.size,
      perdus_count: perdusActifs.length,
      archived_count: perdusArchives.length,
      montant_total,
      perdus,
    };
  });
  res.json({
    week_cur: week,
    week_prev: prevWeek,
    clubs: result,
    include_archived: includeArchived,
    ttc_divisor_applied: ttcDivisor,
  });
});

// Archive un client comme « sous contrôle » pour une semaine donnée.
// Body : { club, week_start, id_client, membre?, note? }
app.post('/api/prel/archive', requireAuth, requireAdmin, (req, res) => {
  const { club, week_start, id_client, membre, note } = req.body || {};
  if (!club || !week_start || id_client == null) {
    return res.status(400).json({ error: 'club, week_start, id_client requis' });
  }
  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO prel_archived (club, week_start, id_client, membre, note, archived_by)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(club, week_start, id_client) DO UPDATE SET
        membre = COALESCE(excluded.membre, prel_archived.membre),
        note = COALESCE(excluded.note, prel_archived.note),
        archived_at = datetime('now','localtime')
    `).run(String(club), String(week_start), parseInt(id_client, 10),
           membre || null, note || null, req.session.name || 'admin');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Désarchive (retour dans la liste des perdus)
app.delete('/api/prel/archive', requireAuth, requireAdmin, (req, res) => {
  const { club, week_start, id_client } = req.body || {};
  if (!club || !week_start || id_client == null) {
    return res.status(400).json({ error: 'club, week_start, id_client requis' });
  }
  const db = getDb();
  db.prepare(`DELETE FROM prel_archived WHERE club = ? AND week_start = ? AND id_client = ?`)
    .run(String(club), String(week_start), parseInt(id_client, 10));
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────
// Diagnostic + correction des TTC stockés en CENTIMES dans prel_rows.
// Les exports Vendor / Déciplus stockent souvent les montants en entiers
// (6900 = 69,00 €). Si l'import historique n'a pas fait la conversion,
// les cumuls deviennent absurdes (×100).
//
// GET  /api/prel/ttc-diagnostic       → médiane, min, max, ratio entiers
// POST /api/prel/fix-ttc-units        → divise par 100 les valeurs détectées
//                                       comme centimes (apply=1 pour exécuter)
// ─────────────────────────────────────────────────────────────────────────
app.get('/api/prel/ttc-diagnostic', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const week = String(req.query.week || '').trim();
  const params = [];
  let where = `ttc IS NOT NULL`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    where += ` AND week_start = ?`;
    params.push(week);
  }
  const rows = db.prepare(`SELECT ttc FROM prel_rows WHERE ${where}`).all(...params);
  if (rows.length === 0) {
    return res.json({ ok: true, count: 0, message: 'Aucune ligne avec TTC' });
  }
  const vals = rows.map(r => Number(r.ttc)).filter(v => !Number.isNaN(v)).sort((a, b) => a - b);
  const median = vals[Math.floor(vals.length / 2)];
  const intCount = vals.filter(v => Number.isInteger(v)).length;
  const intRatio = intCount / vals.length;
  const probableCents = median > 500 && intRatio > 0.9;
  // Échantillon de quelques valeurs
  const sample = vals.slice(0, 5).concat(vals.slice(-5));
  res.json({
    ok: true,
    count: vals.length,
    median,
    min: vals[0],
    max: vals[vals.length - 1],
    int_ratio: intRatio,
    probable_cents: probableCents,
    sample,
    week_filter: /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : null,
  });
});

app.post('/api/prel/fix-ttc-units', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const week = String((req.body && req.body.week) || '').trim();
  const apply = !!(req.body && req.body.apply);
  const params = [];
  let where = `ttc IS NOT NULL`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    where += ` AND week_start = ?`;
    params.push(week);
  }
  const rows = db.prepare(`SELECT id, ttc FROM prel_rows WHERE ${where}`).all(...params);
  if (rows.length === 0) {
    return res.json({ ok: true, count: 0, message: 'Aucune ligne avec TTC' });
  }
  const vals = rows.map(r => Number(r.ttc)).filter(v => !Number.isNaN(v)).sort((a, b) => a - b);
  const median = vals[Math.floor(vals.length / 2)];
  const intRatio = vals.filter(v => Number.isInteger(v)).length / vals.length;
  const probableCents = median > 500 && intRatio > 0.9;
  if (!probableCents) {
    return res.json({
      ok: true,
      applied: false,
      count: rows.length,
      median,
      int_ratio: intRatio,
      message: 'Les TTC ne ressemblent pas à des centimes (médiane ≤ 500 ou trop peu d\'entiers). Aucune correction appliquée.',
    });
  }
  if (!apply) {
    return res.json({
      ok: true,
      applied: false,
      dry_run: true,
      count: rows.length,
      median,
      int_ratio: intRatio,
      preview: `${rows.length} lignes seraient divisées par 100. Médiane ${median} → ${median / 100} €. Re-poste avec apply=true.`,
    });
  }
  const upd = db.prepare(`UPDATE prel_rows SET ttc = ttc / 100.0 WHERE id = ?`);
  const tx = db.transaction(() => {
    let n = 0;
    for (const r of rows) { upd.run(r.id); n++; }
    return n;
  });
  const updated = tx();
  res.json({
    ok: true,
    applied: true,
    updated,
    median_before: median,
    median_after: median / 100,
    message: `${updated} lignes corrigées (÷ 100).`,
  });
});

// Liste des archivés pour une semaine (toutes clubs confondus)
app.get('/api/prel/archived', requireAuth, requireAdmin, (req, res) => {
  const week = String(req.query.week || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return res.status(400).json({ error: 'week=YYYY-MM-DD requis' });
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM prel_archived WHERE week_start = ? ORDER BY club, membre
  `).all(week);
  res.json({ archived: rows });
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

  // Board ne montre que les colonnes ACTIVES (non archivées).
  const columns = db.prepare('SELECT id, name, color, position FROM task_columns WHERE created_by = ? AND COALESCE(archived, 0) = 0 ORDER BY position ASC, id ASC').all(userKey);

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
  const { name, color, archived } = req.body;
  const fields = [];
  const values = [];
  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (color !== undefined) { fields.push('color = ?'); values.push(color); }
  if (archived !== undefined) {
    const v = archived ? 1 : 0;
    fields.push('archived = ?'); values.push(v);
    if (v === 1) { fields.push("archived_at = datetime('now','localtime')"); }
    else        { fields.push('archived_at = NULL'); }
  }
  if (fields.length === 0) return res.json({ ok: true });
  values.push(req.params.id);
  db.prepare(`UPDATE task_columns SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  res.json({ ok: true });
});

// Liste des colonnes ARCHIVÉES pour l'utilisateur courant (ou un autre via ?as=).
// Renvoie nom, couleur, position, archived_at + count des tâches dans chaque colonne.
app.get('/api/tasks/columns/archived', requireAuth, (req, res) => {
  const db = getDb();
  let userKey = getUserKey(req.session);
  if (req.session.role === 'admin' && req.query.as) userKey = String(req.query.as);
  if (!userKey) return res.status(400).json({ error: 'User key indisponible' });
  const cols = db.prepare(`
    SELECT c.id, c.name, c.color, c.position, c.archived_at,
           (SELECT COUNT(*) FROM tasks t WHERE t.column_id = c.id) AS task_count
    FROM task_columns c
    WHERE c.created_by = ? AND COALESCE(c.archived, 0) = 1
    ORDER BY c.archived_at DESC, c.id DESC
  `).all(userKey);
  res.json({ columns: cols });
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

// ─── NEWS (admin uniquement) ────────────────────────────────
// Liste, création, modification, suppression et épinglage de posts
// chronologiques. L'onglet est caché aux non-admins côté front, et
// chaque endpoint enforce `requireAdmin` côté back.

function newsRowToJson(r) {
  let tags = [];
  if (r.tags) {
    try { tags = JSON.parse(r.tags); } catch (_) { tags = []; }
    if (!Array.isArray(tags)) tags = [];
  }
  return {
    id: r.id,
    title: r.title,
    body: r.body || '',
    tags,
    pinned: !!r.pinned,
    author: r.author || null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

app.get('/api/news', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const tag = (req.query.tag || '').toString().trim();
  let rows;
  if (tag) {
    // Filtre simple : on cherche le tag exact dans le JSON
    const pattern = `%"${tag.replace(/[%_]/g, '')}"%`;
    rows = db.prepare(`
      SELECT * FROM news_posts
      WHERE tags LIKE ?
      ORDER BY pinned DESC, created_at DESC
    `).all(pattern);
  } else {
    rows = db.prepare(`
      SELECT * FROM news_posts
      ORDER BY pinned DESC, created_at DESC
    `).all();
  }
  // Aggrège la liste de tous les tags pour le filtre
  const allTags = new Set();
  db.prepare(`SELECT tags FROM news_posts WHERE tags IS NOT NULL`).all().forEach(r => {
    try {
      const arr = JSON.parse(r.tags);
      if (Array.isArray(arr)) arr.forEach(t => { if (t) allTags.add(String(t)); });
    } catch (_) {}
  });
  res.json({
    posts: rows.map(newsRowToJson),
    all_tags: Array.from(allTags).sort(),
  });
});

app.post('/api/news', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const title = String((req.body && req.body.title) || '').trim();
  const body = String((req.body && req.body.body) || '').trim();
  if (!title) return res.status(400).json({ error: 'Titre requis' });
  if (title.length > 200) return res.status(400).json({ error: 'Titre trop long (max 200)' });
  if (body.length > 20000) return res.status(400).json({ error: 'Corps trop long (max 20000)' });
  let tags = [];
  if (Array.isArray(req.body && req.body.tags)) {
    tags = req.body.tags.map(t => String(t).trim()).filter(Boolean).slice(0, 10);
  }
  const pinned = req.body && req.body.pinned ? 1 : 0;
  const info = db.prepare(`
    INSERT INTO news_posts (title, body, tags, pinned, author)
    VALUES (?, ?, ?, ?, ?)
  `).run(title, body, JSON.stringify(tags), pinned, req.session.name || 'admin');
  const row = db.prepare(`SELECT * FROM news_posts WHERE id = ?`).get(info.lastInsertRowid);
  res.json(newsRowToJson(row));
});

app.put('/api/news/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide' });
  const existing = db.prepare(`SELECT * FROM news_posts WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: 'Post introuvable' });
  const fields = [];
  const values = [];
  if (req.body.title !== undefined) {
    const t = String(req.body.title).trim();
    if (!t) return res.status(400).json({ error: 'Titre vide' });
    if (t.length > 200) return res.status(400).json({ error: 'Titre trop long' });
    fields.push('title = ?'); values.push(t);
  }
  if (req.body.body !== undefined) {
    const b = String(req.body.body).trim();
    if (b.length > 20000) return res.status(400).json({ error: 'Corps trop long' });
    fields.push('body = ?'); values.push(b);
  }
  if (req.body.tags !== undefined) {
    let tags = [];
    if (Array.isArray(req.body.tags)) {
      tags = req.body.tags.map(t => String(t).trim()).filter(Boolean).slice(0, 10);
    }
    fields.push('tags = ?'); values.push(JSON.stringify(tags));
  }
  if (req.body.pinned !== undefined) {
    fields.push('pinned = ?'); values.push(req.body.pinned ? 1 : 0);
  }
  if (fields.length === 0) return res.json(newsRowToJson(existing));
  fields.push(`updated_at = datetime('now','localtime')`);
  values.push(id);
  db.prepare(`UPDATE news_posts SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  const row = db.prepare(`SELECT * FROM news_posts WHERE id = ?`).get(id);
  res.json(newsRowToJson(row));
});

app.delete('/api/news/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide' });
  db.prepare(`DELETE FROM news_posts WHERE id = ?`).run(id);
  res.json({ ok: true });
});

// ─── CONTRATS signés (admin uniquement) ──────────────────────
// Stockage des PDF de contrats avec analyse croisée vs P.R.E.L :
// détecte les clients signés en S-1 mais non prélevés (Encaisse) en S.

// Mapping studio brut (extrait du filename) → club canonique (cohérent avec P.R.E.L).
const CONTRACT_STUDIO_MAP = {
  'my coach lille':                 'Lille',
  'my coach vieux lille':           'Lille',
  'my coach boulogne':              'Boulogne-Billancourt',
  'my coach boulogne billancourt':  'Boulogne-Billancourt',
  'my coach levallois':             'Levallois-Perret',
  'my coach levallois perret':      'Levallois-Perret',
  'my coach marcq':                 'Marcq-en-Barœul',
  'my coach marcq en baroeul':      'Marcq-en-Barœul',
  'my coach neuilly':               'Neuilly-sur-Seine',
  'my coach neuilly sur seine':     'Neuilly-sur-Seine',
  'my coach wasquehal':             'Wasquehal',
};
function contractResolveStudio(raw) {
  if (!raw) return null;
  const norm = String(raw).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (CONTRACT_STUDIO_MAP[norm]) return CONTRACT_STUDIO_MAP[norm];
  for (const [k, v] of Object.entries(CONTRACT_STUDIO_MAP)) {
    if (norm.includes(k)) return v;
  }
  return null;
}

// Normalise un nom pour stockage / affichage :
// lowercase, sans accents, espaces simples, trim. Garde l'ordre original.
function contractNormalizeName(...parts) {
  return parts
    .filter(Boolean)
    .map(s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))
    .join(' ')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Clé de matching robuste aux inversions « Prénom Nom » ↔ « NOM Prénom ».
// Vendor exporte typiquement "PELLIEUX Sylvain" alors que les contrats
// arrivent en "Liam Savey". On trie les tokens alphabétiquement pour
// rendre la comparaison commutative.
function contractMatchKey(...parts) {
  const norm = contractNormalizeName(...parts);
  if (!norm) return '';
  return norm.split(/\s+/).filter(Boolean).sort().join(' ');
}

// Capitalise chaque mot d'une chaîne : "liam savey" → "Liam Savey", "de la cruz" → "De La Cruz".
// Gère les particules courantes (de, du, da, etc.) en conservant la casse pour les
// noms composés (Jean-Pierre → Jean-Pierre, jean-pierre → Jean-Pierre).
function contractTitleCase(s) {
  if (!s) return s;
  return String(s)
    .toLowerCase()
    .split(/(\s+|-+)/) // garde les séparateurs
    .map(part => {
      if (!part || /^\s+$|^-+$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join('');
}

// Parse le filename : YYMMDDX-prenom-nom-contrat-Studio.pdf
//   → { signed_date, first_name, last_name, raw_studio, club }
function contractParseFilename(filename) {
  const name = String(filename || '').replace(/\.pdf$/i, '');
  // Capture les 6 premiers chiffres (date) + index optionnel + reste
  const m = /^(\d{2})(\d{2})(\d{2})\d*[-_](.+?)[-_]contrat[-_](.+)$/i.exec(name);
  if (!m) return null;
  const [, yy, mm, dd, namePart, studioPart] = m;
  const year = 2000 + parseInt(yy, 10);
  const day = parseInt(dd, 10);
  const month = parseInt(mm, 10);
  if (year < 2020 || year > 2099 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const signedDate = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const nameTokens = namePart.split(/[-_]+/).filter(Boolean);
  const firstName = contractTitleCase(nameTokens[0] || '');
  const lastName = contractTitleCase(nameTokens.slice(1).join(' '));
  const rawStudio = studioPart.replace(/[-_]+/g, ' ').trim();
  const club = contractResolveStudio(rawStudio);
  return {
    signed_date: signedDate,
    first_name: firstName,
    last_name: lastName,
    raw_studio: rawStudio,
    club,
  };
}

// Lundi ISO de la semaine d'une date YYYY-MM-DD
function contractMondayOf(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0=dim, 1=lun, …, 6=sam
  const offset = (dow === 0 ? -6 : 1 - dow);
  dt.setUTCDate(dt.getUTCDate() + offset);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}-${String(dt.getUTCDate()).padStart(2,'0')}`;
}

// Construit un index { club: Map<matchKey, id_client> } à partir de prel_rows.
// Permet de retrouver le id_client d'un contrat → URL Déciplus.
function buildPrelIdClientIndex(db) {
  const rows = db.prepare(`
    SELECT DISTINCT club, membre, id_client
    FROM prel_rows
    WHERE id_client IS NOT NULL AND membre IS NOT NULL
  `).all();
  const idx = {};
  for (const r of rows) {
    const key = contractMatchKey(r.membre);
    if (!key || !r.club) continue;
    if (!idx[r.club]) idx[r.club] = new Map();
    // Si plusieurs id_client pour le même nom (rare), on garde le 1er
    if (!idx[r.club].has(key)) idx[r.club].set(key, r.id_client);
  }
  return idx;
}
function lookupIdClient(idx, club, contractMatchKeyStr) {
  if (!club || !contractMatchKeyStr || !idx[club]) return null;
  return idx[club].get(contractMatchKeyStr) || null;
}

function contractRowToJson(r, { includeBlob = false } = {}) {
  return {
    id: r.id,
    filename: r.filename,
    signed_date: r.signed_date,
    week_start: r.week_start,
    member_first_name: r.member_first_name,
    member_last_name: r.member_last_name,
    member_normalized: r.member_normalized,
    club: r.club,
    raw_studio: r.raw_studio,
    pdf_size: r.pdf_size,
    uploaded_at: r.uploaded_at,
    uploaded_by: r.uploaded_by,
    has_pdf: !!(r.pdf_blob && r.pdf_size > 0),
  };
}

// POST /api/contracts/upload
// body: { items: [{ filename, pdf_base64 }] }
// Parse chaque filename → insère un contrat. Ignore les filenames non
// reconnus. Si un contrat existe déjà (même filename), on remplace son
// PDF (idempotent).
app.post('/api/contracts/upload', requireAuth, requireAdmin, (req, res) => {
  const items = (req.body && req.body.items) || [];
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items requis (array non vide)' });
  }
  const db = getDb();
  const results = { inserted: 0, replaced: 0, skipped: 0, errors: [] };
  const insStmt = db.prepare(`
    INSERT INTO contracts (filename, signed_date, week_start, member_first_name,
      member_last_name, member_normalized, club, raw_studio, pdf_blob, pdf_size, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updStmt = db.prepare(`
    UPDATE contracts SET pdf_blob = ?, pdf_size = ?, uploaded_at = datetime('now','localtime'), uploaded_by = ?
    WHERE filename = ?
  `);
  const findStmt = db.prepare(`SELECT id FROM contracts WHERE filename = ?`);
  const tx = db.transaction(() => {
    for (const item of items) {
      const filename = String(item.filename || '').trim();
      const base64 = String(item.pdf_base64 || '');
      if (!filename) { results.skipped++; results.errors.push({ filename, reason: 'filename vide' }); continue; }
      const parsed = contractParseFilename(filename);
      if (!parsed) { results.skipped++; results.errors.push({ filename, reason: 'filename non reconnu (format attendu YYMMDDX-prenom-nom-contrat-Studio.pdf)' }); continue; }
      if (!parsed.club) { results.skipped++; results.errors.push({ filename, reason: `studio non reconnu : "${parsed.raw_studio}"` }); continue; }
      let pdfBuf = null;
      let pdfSize = 0;
      if (base64) {
        try {
          // Retire un éventuel préfixe data:application/pdf;base64,
          const clean = base64.replace(/^data:[^,]*,/, '');
          pdfBuf = Buffer.from(clean, 'base64');
          pdfSize = pdfBuf.length;
        } catch (e) {
          results.errors.push({ filename, reason: 'base64 invalide' });
        }
      }
      const memberNorm = contractNormalizeName(parsed.first_name, parsed.last_name);
      const weekStart = contractMondayOf(parsed.signed_date);
      const existing = findStmt.get(filename);
      if (existing) {
        updStmt.run(pdfBuf, pdfSize, req.session.name || 'admin', filename);
        results.replaced++;
      } else {
        insStmt.run(
          filename,
          parsed.signed_date,
          weekStart,
          parsed.first_name,
          parsed.last_name,
          memberNorm,
          parsed.club,
          parsed.raw_studio,
          pdfBuf,
          pdfSize,
          req.session.name || 'admin',
        );
        results.inserted++;
      }
    }
  });
  tx();
  res.json({ ok: true, ...results });
});

// GET /api/contracts — liste avec filtres optionnels
//   ?club=Lille       → uniquement un club
//   ?week=YYYY-MM-DD  → uniquement une semaine (lundi)
app.get('/api/contracts', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const where = [];
  const params = [];
  if (req.query.club) { where.push('club = ?'); params.push(String(req.query.club)); }
  if (req.query.week) { where.push('week_start = ?'); params.push(String(req.query.week)); }
  const sql = `
    SELECT id, filename, signed_date, week_start, member_first_name, member_last_name,
           member_normalized, club, raw_studio, pdf_size, uploaded_at, uploaded_by,
           (pdf_blob IS NOT NULL AND pdf_size > 0) AS has_pdf_flag
    FROM contracts
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY signed_date DESC, id DESC
  `;
  const rows = db.prepare(sql).all(...params);
  // Index id_client basé sur prel_rows (pour le bouton « Fiche » Déciplus)
  // Fallback uniquement si pas de id_client manuel sur le contrat.
  const idClientIdx = buildPrelIdClientIndex(db);
  // Liste des semaines + clubs distincts pour les filtres
  const weeks = db.prepare(`SELECT DISTINCT week_start FROM contracts ORDER BY week_start DESC`).all().map(r => r.week_start);
  const clubs = db.prepare(`SELECT DISTINCT club FROM contracts WHERE club IS NOT NULL ORDER BY club ASC`).all().map(r => r.club);
  res.json({
    contracts: rows.map(r => {
      const matchKey = contractMatchKey(r.member_first_name, r.member_last_name);
      const idClient = (r.id_client != null && Number.isInteger(r.id_client))
        ? r.id_client
        : lookupIdClient(idClientIdx, r.club, matchKey);
      return {
        id: r.id, filename: r.filename, signed_date: r.signed_date, week_start: r.week_start,
        member_first_name: r.member_first_name, member_last_name: r.member_last_name,
        member_normalized: r.member_normalized, club: r.club, raw_studio: r.raw_studio,
        pdf_size: r.pdf_size, uploaded_at: r.uploaded_at, uploaded_by: r.uploaded_by,
        has_pdf: !!r.has_pdf_flag,
        id_client: idClient,
        id_client_manual: r.id_client, // pour distinguer manuel vs deviné
      };
    }),
    weeks, clubs,
  });
});

// PUT /api/contracts/:id — mettre à jour des champs (id_client manuel,
// éventuellement d'autres plus tard). Permet de lier un contrat à sa
// fiche Déciplus quand l'auto-détection ne suffit pas.
app.put('/api/contracts/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide' });
  const existing = db.prepare(`SELECT id FROM contracts WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: 'Contrat introuvable' });
  const fields = [];
  const values = [];
  if (req.body && req.body.id_client !== undefined) {
    const v = req.body.id_client;
    if (v === null || v === '') {
      fields.push('id_client = NULL');
    } else {
      const n = parseInt(v, 10);
      if (!Number.isInteger(n) || n < 1) return res.status(400).json({ error: 'id_client doit être un entier positif' });
      fields.push('id_client = ?'); values.push(n);
    }
  }
  if (fields.length === 0) return res.json({ ok: true });
  values.push(id);
  db.prepare(`UPDATE contracts SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  res.json({ ok: true });
});

// GET /api/contracts/:id/pdf — stream du PDF stocké en blob
app.get('/api/contracts/:id/pdf', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide' });
  const row = db.prepare(`SELECT filename, pdf_blob, pdf_size FROM contracts WHERE id = ?`).get(id);
  if (!row || !row.pdf_blob) return res.status(404).json({ error: 'PDF introuvable' });
  res.setHeader('Content-Type', 'application/pdf');
  // inline pour ouverture dans le navigateur; pour forcer download, mettre 'attachment'
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(row.filename)}"`);
  res.setHeader('Content-Length', String(row.pdf_size || row.pdf_blob.length));
  res.send(row.pdf_blob);
});

app.delete('/api/contracts/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide' });
  db.prepare(`DELETE FROM contracts WHERE id = ?`).run(id);
  res.json({ ok: true });
});

// GET /api/contracts/analysis
// Analyse croisée S-1 (signature) → S (prélèvement attendu).
// Renvoie pour chaque contrat signé en S-1 :
//   • match: 'paid' | 'missing' | 'no_data'
//   • si missing : le contrat est dans la liste rouge à relancer
// Le matching se fait par nom normalisé (prénom + nom) vs prel_rows.membre.
// Détection « paid » = au moins 1 ligne prel_rows pour ce membre dans la
// semaine S avec état dans PREL_ETATS_OK (Encaisse / OK / Encaissé).
app.get('/api/contracts/analysis', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  // Détermine S et S-1 :
  //   • ?week= explicite → on l'utilise comme S
  //   • sinon → slot cur, sinon lundi du serveur
  //   • S-1 = ?prev= si fourni, sinon slot prev si week == slot cur, sinon S-7 jours
  let weekS = String(req.query.week || '').trim();
  let weekPrev = String(req.query.prev || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekS)) {
    const slotCur = prelGetSlot(db, 'cur');
    if (slotCur) {
      weekS = slotCur;
    } else {
      const today = new Date();
      const dow = today.getDay();
      const offset = (dow === 0 ? -6 : 1 - dow);
      today.setDate(today.getDate() + offset);
      weekS = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekPrev)) {
    const slotCur = prelGetSlot(db, 'cur');
    const slotPrev = prelGetSlot(db, 'prev');
    if (slotCur === weekS && slotPrev) {
      weekPrev = slotPrev;
    } else {
      // S-1 = S - 7 jours (calcul arithmétique)
      const [y, m, d] = weekS.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() - 7);
      weekPrev = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}-${String(dt.getUTCDate()).padStart(2,'0')}`;
    }
  }
  // Charge les contrats signés en S-1 (avec id_client manuel s'il existe)
  const contracts = db.prepare(`
    SELECT id, filename, signed_date, week_start, member_first_name, member_last_name,
           member_normalized, club, pdf_size, id_client AS id_client_manual,
           (pdf_blob IS NOT NULL AND pdf_size > 0) AS has_pdf_flag
    FROM contracts
    WHERE week_start = ?
    ORDER BY club, member_last_name, member_first_name
  `).all(weekPrev);
  // Charge les prélèvements de S, indexés par (club, matchKey)
  const prelRows = db.prepare(`
    SELECT membre, club, etat, id_client FROM prel_rows WHERE week_start = ?
  `).all(weekS);
  const prelHasData = prelRows.length > 0;
  // Index : club → Map<matchKey, { id_client, isOk }>
  // matchKey trie les tokens du nom alphabétiquement → résout l'inversion
  // « Prénom Nom » (contrat) ↔ « NOM Prénom » (Vendor / prel_rows)
  const indexByClub = {};
  for (const r of prelRows) {
    const key = contractMatchKey(r.membre);
    if (!key || !r.club) continue;
    if (!indexByClub[r.club]) indexByClub[r.club] = new Map();
    const cur = indexByClub[r.club].get(key) || { id_client: null, isOk: false };
    if (prelIsOk(r.etat)) cur.isOk = true;
    if (r.id_client != null && cur.id_client == null) cur.id_client = r.id_client;
    indexByClub[r.club].set(key, cur);
  }
  // Index id_client toutes semaines confondues (fallback : si le client
  // n'est pas dans S mais a été vu une fois, on peut quand même générer
  // l'URL Déciplus pour le bouton « Fiche »)
  const fallbackIdClientIdx = buildPrelIdClientIndex(db);
  // Pour chaque contrat, détermine le statut + id_client.
  // Priorité id_client : manuel (contracts.id_client) > PREL S match > fallback global.
  const enriched = contracts.map(c => {
    const matchKey = contractMatchKey(c.member_first_name, c.member_last_name);
    let match = 'no_data';
    let idClient = (c.id_client_manual != null && Number.isInteger(c.id_client_manual))
      ? c.id_client_manual
      : null;
    if (prelHasData) {
      const idx = indexByClub[c.club];
      const entry = idx && idx.get(matchKey);
      if (entry) {
        if (idClient == null) idClient = entry.id_client;
        match = entry.isOk ? 'paid' : 'present_not_paid';
      } else {
        match = 'missing';
      }
    }
    // Si pas trouvé dans S et toujours pas d'id, tente l'index global
    if (idClient == null) {
      idClient = lookupIdClient(fallbackIdClientIdx, c.club, matchKey);
    }
    return {
      id: c.id, filename: c.filename, signed_date: c.signed_date, week_start: c.week_start,
      member_first_name: c.member_first_name, member_last_name: c.member_last_name,
      member_normalized: c.member_normalized || contractNormalizeName(c.member_first_name, c.member_last_name),
      club: c.club, pdf_size: c.pdf_size,
      has_pdf: !!c.has_pdf_flag,
      match,
      id_client: idClient,
      id_client_manual: c.id_client_manual || null,
    };
  });
  // Agrégats par club
  const byClub = {};
  for (const c of enriched) {
    if (!byClub[c.club]) byClub[c.club] = { club: c.club, total: 0, paid: 0, missing: 0, present_not_paid: 0, no_data: 0, contracts: [] };
    byClub[c.club].total++;
    byClub[c.club][c.match]++;
    byClub[c.club].contracts.push(c);
  }
  res.json({
    week_signed: weekPrev,
    week_payment: weekS,
    prel_has_data: prelHasData,
    total_contracts: enriched.length,
    counts: {
      paid: enriched.filter(c => c.match === 'paid').length,
      missing: enriched.filter(c => c.match === 'missing').length,
      present_not_paid: enriched.filter(c => c.match === 'present_not_paid').length,
      no_data: enriched.filter(c => c.match === 'no_data').length,
    },
    clubs: Object.values(byClub).sort((a, b) => a.club.localeCompare(b.club)),
    contracts: enriched,
  });
});

// ─── COCKPIT : suivi mensuel KPIs par club ──────────────────
// Liste de clubs (à éditer ici pour reconfigurer le tableau de bord).
const COCKPIT_CLUBS = [
  'Boulogne-Billancourt',
  'Lille',
  'Levallois-Perret',
  'Marcq-en-Barœul',
  'Neuilly-sur-Seine',
  'Wasquehal',
];

function isValidIsoMonth(s) {
  return /^\d{4}-\d{2}-01$/.test(String(s || ''));
}

// Calcule le même mois de l'année précédente (N-1) à partir d'un YYYY-MM-01.
// Ex: 2026-06-01 → 2025-06-01.
function cockpitPreviousYearSameMonth(iso) {
  const [y, m] = iso.split('-').map(Number);
  return `${y - 1}-${String(m).padStart(2, '0')}-01`;
}

// KPI dont l'objectif est calculé automatiquement à partir de la valeur
// du même mois en N-1 (pas saisissable côté UI). Doit rester cohérent
// avec la flag `autoObjective: 'previous_year_same_month'` côté front.
const COCKPIT_AUTO_OBJECTIVE_N_MINUS_1 = new Set(['meta_ads']);

app.get('/api/cockpit/clubs', requireAuth, requireAdmin, (req, res) => {
  res.json({ clubs: COCKPIT_CLUBS });
});

// GET /api/cockpit/data?club=X&month=YYYY-MM-01
// → { objectifs: { kpi_id: val }, valeurs: { kpi_id: val } } pour ce club+mois.
app.get('/api/cockpit/data', requireAuth, requireAdmin, (req, res) => {
  const club = String(req.query.club || '').trim();
  const month = String(req.query.month || '').trim();
  if (!club) return res.status(400).json({ error: 'club requis' });
  if (!isValidIsoMonth(month)) return res.status(400).json({ error: 'month requis (YYYY-MM-01)' });
  const db = getDb();
  const objs = db.prepare(`SELECT kpi_id, objectif FROM kpi_objectives WHERE club = ?`).all(club);
  const vals = db.prepare(`SELECT kpi_id, valeur FROM kpi_values WHERE club = ? AND month = ?`).all(club, month);
  const objectifs = {};
  objs.forEach(r => { objectifs[r.kpi_id] = r.objectif; });
  const valeurs = {};
  vals.forEach(r => { valeurs[r.kpi_id] = r.valeur; });

  // Objectifs auto-calculés : pour chaque KPI marqué N-1, l'objectif =
  // valeur du même mois de l'année précédente pour ce même club.
  // Écrase toute saisie manuelle (la cellule est lecture seule côté UI).
  if (COCKPIT_AUTO_OBJECTIVE_N_MINUS_1.size > 0) {
    const prevYearMonth = cockpitPreviousYearSameMonth(month);
    const autoIds = Array.from(COCKPIT_AUTO_OBJECTIVE_N_MINUS_1);
    const prevRows = db.prepare(`
      SELECT kpi_id, valeur FROM kpi_values
      WHERE club = ? AND month = ? AND kpi_id IN (${autoIds.map(() => '?').join(',')})
    `).all(club, prevYearMonth, ...autoIds);
    prevRows.forEach(r => { objectifs[r.kpi_id] = r.valeur; });
    // Si pas de valeur en N-1, on force l'objectif à null
    autoIds.forEach(id => {
      if (!prevRows.find(r => r.kpi_id === id)) objectifs[id] = null;
    });
  }

  res.json({ club, month, objectifs, valeurs });
});

// GET /api/cockpit/average?month=YYYY-MM-01
// → { objectifs: { kpi_id: { avg, n } }, valeurs: { kpi_id: { avg, n } } }
//   Moyenne arithmétique sur les clubs ayant une valeur non null.
//   n = nombre de clubs renseignés (sur COCKPIT_CLUBS.length).
app.get('/api/cockpit/average', requireAuth, requireAdmin, (req, res) => {
  const month = String(req.query.month || '').trim();
  if (!isValidIsoMonth(month)) return res.status(400).json({ error: 'month requis (YYYY-MM-01)' });
  const db = getDb();
  const totalClubs = COCKPIT_CLUBS.length;
  const objs = db.prepare(`
    SELECT kpi_id, AVG(objectif) AS avg, COUNT(*) AS n
    FROM kpi_objectives WHERE objectif IS NOT NULL AND club IN (${COCKPIT_CLUBS.map(() => '?').join(',')})
    GROUP BY kpi_id
  `).all(...COCKPIT_CLUBS);
  const vals = db.prepare(`
    SELECT kpi_id, AVG(valeur) AS avg, COUNT(*) AS n
    FROM kpi_values WHERE month = ? AND valeur IS NOT NULL
      AND club IN (${COCKPIT_CLUBS.map(() => '?').join(',')})
    GROUP BY kpi_id
  `).all(month, ...COCKPIT_CLUBS);
  const objectifs = {};
  objs.forEach(r => { objectifs[r.kpi_id] = { avg: r.avg, n: r.n }; });
  const valeurs = {};
  vals.forEach(r => { valeurs[r.kpi_id] = { avg: r.avg, n: r.n }; });

  // Objectifs auto-calculés en mode moyenne : pour les KPI marqués N-1,
  // moyenne (par club) des valeurs du même mois N-1. Compte les clubs qui
  // ont une valeur en N-1.
  if (COCKPIT_AUTO_OBJECTIVE_N_MINUS_1.size > 0) {
    const prevYearMonth = cockpitPreviousYearSameMonth(month);
    const autoIds = Array.from(COCKPIT_AUTO_OBJECTIVE_N_MINUS_1);
    const prevAvg = db.prepare(`
      SELECT kpi_id, AVG(valeur) AS avg, COUNT(*) AS n
      FROM kpi_values WHERE month = ? AND valeur IS NOT NULL
        AND kpi_id IN (${autoIds.map(() => '?').join(',')})
        AND club IN (${COCKPIT_CLUBS.map(() => '?').join(',')})
      GROUP BY kpi_id
    `).all(prevYearMonth, ...autoIds, ...COCKPIT_CLUBS);
    autoIds.forEach(id => { objectifs[id] = { avg: null, n: 0 }; });
    prevAvg.forEach(r => { objectifs[r.kpi_id] = { avg: r.avg, n: r.n }; });
  }

  res.json({ month, total_clubs: totalClubs, objectifs, valeurs });
});

// PUT /api/cockpit/objectif  body { club, kpi_id, objectif }
app.put('/api/cockpit/objectif', requireAuth, requireAdmin, (req, res) => {
  const { club, kpi_id } = req.body || {};
  const objectif = req.body && req.body.objectif;
  if (!club || !kpi_id) return res.status(400).json({ error: 'club + kpi_id requis' });
  if (!COCKPIT_CLUBS.includes(club)) return res.status(400).json({ error: 'club inconnu' });
  const db = getDb();
  const v = (objectif === null || objectif === '' || objectif === undefined)
    ? null
    : Number(objectif);
  if (v !== null && !Number.isFinite(v)) return res.status(400).json({ error: 'objectif doit être un nombre' });
  if (v === null) {
    db.prepare(`DELETE FROM kpi_objectives WHERE club = ? AND kpi_id = ?`).run(String(club), String(kpi_id));
  } else {
    db.prepare(`
      INSERT INTO kpi_objectives (club, kpi_id, objectif) VALUES (?, ?, ?)
      ON CONFLICT(club, kpi_id) DO UPDATE SET objectif = excluded.objectif
    `).run(String(club), String(kpi_id), v);
  }
  res.json({ ok: true });
});

// PUT /api/cockpit/valeur  body { club, month, kpi_id, valeur }
app.put('/api/cockpit/valeur', requireAuth, requireAdmin, (req, res) => {
  const { club, month, kpi_id } = req.body || {};
  const valeur = req.body && req.body.valeur;
  if (!club || !kpi_id) return res.status(400).json({ error: 'club + kpi_id requis' });
  if (!COCKPIT_CLUBS.includes(club)) return res.status(400).json({ error: 'club inconnu' });
  if (!isValidIsoMonth(month)) return res.status(400).json({ error: 'month requis (YYYY-MM-01)' });
  const db = getDb();
  const v = (valeur === null || valeur === '' || valeur === undefined)
    ? null
    : Number(valeur);
  if (v !== null && !Number.isFinite(v)) return res.status(400).json({ error: 'valeur doit être un nombre' });
  if (v === null) {
    db.prepare(`DELETE FROM kpi_values WHERE club = ? AND month = ? AND kpi_id = ?`)
      .run(String(club), String(month), String(kpi_id));
  } else {
    db.prepare(`
      INSERT INTO kpi_values (club, month, kpi_id, valeur) VALUES (?, ?, ?, ?)
      ON CONFLICT(club, month, kpi_id) DO UPDATE SET valeur = excluded.valeur
    `).run(String(club), String(month), String(kpi_id), v);
  }
  res.json({ ok: true });
});

// ─── COACH LEADERS : gestion par l'admin ────────────────────
app.get('/api/coach-leaders', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, name, pin, studio, can_view_history, coach_slot, archived, created_at
    FROM coach_leaders
    WHERE archived = 0
    ORDER BY studio ASC, name ASC
  `).all();
  res.json({ leaders: rows });
});

// Studios disponibles pour le guest login : agrège les studios des
// coach_leaders + COCKPIT_CLUBS (fallback). Endpoint public (pas d'auth).
app.get('/api/auth/guest-studios', (req, res) => {
  const db = getDb();
  const studios = new Set();
  try {
    db.prepare(`SELECT DISTINCT studio FROM coach_leaders WHERE archived = 0`).all()
      .forEach(r => { if (r.studio) studios.add(r.studio); });
  } catch (_) {}
  // Fallback : si aucun coach leader, on propose la liste des clubs Cockpit
  if (studios.size === 0 && typeof COCKPIT_CLUBS !== 'undefined' && Array.isArray(COCKPIT_CLUBS)) {
    COCKPIT_CLUBS.forEach(c => studios.add(c));
  }
  res.json({ studios: Array.from(studios).sort() });
});

app.post('/api/coach-leaders', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const name = String((req.body && req.body.name) || '').trim();
  const pin = String((req.body && req.body.pin) || '').trim();
  const studio = String((req.body && req.body.studio) || '').trim();
  // Par défaut accès historique = OUI (coach leader complet).
  // Si false → simple assistant studio (today seulement, rangée filtrée).
  const canViewHistory = req.body && req.body.can_view_history === false ? 0 : 1;
  // coach_slot : 1 ou 2 si assistant. NULL si leader complet.
  // (un leader peut tout voir donc on ignore coach_slot pour lui)
  let coachSlot = null;
  if (canViewHistory === 0 && req.body && req.body.coach_slot != null) {
    const n = parseInt(req.body.coach_slot, 10);
    if (n === 1 || n === 2) coachSlot = n;
  }
  if (!name) return res.status(400).json({ error: 'Nom requis' });
  if (!pin || pin.length < 4) return res.status(400).json({ error: 'PIN requis (4 caractères minimum)' });
  if (!studio) return res.status(400).json({ error: 'Studio requis' });
  const taken = db.prepare(`SELECT id FROM coach_leaders WHERE pin = ?`).get(pin)
    || db.prepare(`SELECT id FROM sales_reps WHERE pin = ?`).get(pin)
    || db.prepare(`SELECT id FROM coaches WHERE pin = ?`).get(pin);
  if (taken) return res.status(409).json({ error: 'PIN déjà utilisé par un autre compte' });
  try {
    const info = db.prepare(`
      INSERT INTO coach_leaders (name, pin, studio, can_view_history, coach_slot) VALUES (?, ?, ?, ?, ?)
    `).run(name, pin, studio, canViewHistory, coachSlot);
    res.json({ ok: true, id: info.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/coach-leaders/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide' });
  const existing = db.prepare(`SELECT id FROM coach_leaders WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: 'Coach leader introuvable' });
  const fields = [];
  const values = [];
  if (req.body.name !== undefined) {
    const v = String(req.body.name).trim();
    if (!v) return res.status(400).json({ error: 'Nom vide' });
    fields.push('name = ?'); values.push(v);
  }
  if (req.body.pin !== undefined) {
    const v = String(req.body.pin).trim();
    if (!v || v.length < 4) return res.status(400).json({ error: 'PIN trop court' });
    // Unicité : check sur coach_leaders (autres) + sales_reps + coaches
    const taken = db.prepare(`SELECT id FROM coach_leaders WHERE pin = ? AND id != ?`).get(v, id)
      || db.prepare(`SELECT id FROM sales_reps WHERE pin = ?`).get(v)
      || db.prepare(`SELECT id FROM coaches WHERE pin = ?`).get(v);
    if (taken) return res.status(409).json({ error: 'PIN déjà utilisé par un autre compte' });
    fields.push('pin = ?'); values.push(v);
  }
  if (req.body.studio !== undefined) {
    const v = String(req.body.studio).trim();
    if (!v) return res.status(400).json({ error: 'Studio vide' });
    fields.push('studio = ?'); values.push(v);
  }
  if (req.body.can_view_history !== undefined) {
    const v = req.body.can_view_history === true || req.body.can_view_history === 1 ? 1 : 0;
    fields.push('can_view_history = ?'); values.push(v);
    // Si on repasse en leader, on nettoie coach_slot
    if (v === 1) { fields.push('coach_slot = NULL'); }
  }
  if (req.body.coach_slot !== undefined) {
    const raw = req.body.coach_slot;
    if (raw === null || raw === '' || raw === 'null') {
      fields.push('coach_slot = NULL');
    } else {
      const n = parseInt(raw, 10);
      if (n !== 1 && n !== 2) return res.status(400).json({ error: 'coach_slot doit être 1 ou 2' });
      fields.push('coach_slot = ?'); values.push(n);
    }
  }
  if (fields.length === 0) return res.json({ ok: true });
  values.push(id);
  db.prepare(`UPDATE coach_leaders SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  res.json({ ok: true });
});

app.delete('/api/coach-leaders/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide' });
  // Suppression définitive (le PIN redevient libre pour réutilisation).
  // Les photos déjà uploadées par ce coach leader restent dans
  // standards_daily — leur champ uploaded_by est juste un nom texte.
  db.prepare(`DELETE FROM coach_leaders WHERE id = ?`).run(id);
  res.json({ ok: true });
});

// ─── STANDARDS : checklist d'évaluation par studio + mois ───
// Critères structurés en 4 catégories x 5 critères. Stockés en dur
// côté serveur (envoyés au front via GET /api/standards/criteria),
// modifiables ici sans toucher au front.
const STANDARDS_CRITERIA = [
  { category: 'Personnalisation', items: [
    { id: 'perso_1', label: 'L\'adhérent voit son nom et son programme du jour au tableau' },
  ]},
  { category: 'Accompagnement', items: [
    { id: 'accomp_1', label: 'Le suivi client est bien rempli et sans attente' },
  ]},
  { category: 'Exigence', items: [
    { id: 'exig_1', label: 'Propre, rangé, matériel à sa place — l\'effet « waouh »' },
    { id: 'exig_2', label: 'CHIC du coach' },
  ]},
];

function isValidStandardsMonth(s) { return /^\d{4}-\d{2}-01$/.test(String(s || '')); }

// Helper d'autorisation : admin OK pour tout studio,
// coach_leader / guest OK seulement pour leur propre studio.
function authStandardsStudio(req, studio) {
  if (req.session.role === 'admin') return true;
  if (req.session.role === 'standards_admin') return true; // lecture seule, tous studios
  if (req.session.role === 'coach_leader' && req.session.studio === studio) return true;
  if (req.session.role === 'guest' && req.session.studio === studio) return true;
  return false;
}

// Restriction sur la consultation des jours passés. Coach leader avec
// can_view_history=true peut consulter les jours passés. Tous les autres
// (assistant studio, guest) ne peuvent voir QUE today.
function standardsCanViewDate(req, date) {
  if (req.session.role === 'admin') return true;
  if (req.session.role === 'standards_admin') return true; // historique complet
  if (req.session.role === 'coach_leader' && req.session.can_view_history === true) return true;
  // Tous les autres : today uniquement
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return date === today;
}

app.get('/api/standards/criteria', requireAuth, (req, res) => {
  if (req.session.role !== 'admin' && req.session.role !== 'coach_leader') {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  res.json({ categories: STANDARDS_CRITERIA });
});

app.get('/api/standards/studios', requireAuth, (req, res) => {
  if (req.session.role !== 'admin' && req.session.role !== 'standards_admin') {
    return res.status(403).json({ error: 'Accès réservé aux administrateurs Standards' });
  }
  // Renvoie la liste des studios distincts en base (depuis coach_leaders)
  const db = getDb();
  const rows = db.prepare(`
    SELECT DISTINCT studio FROM coach_leaders WHERE archived = 0 ORDER BY studio ASC
  `).all();
  res.json({ studios: rows.map(r => r.studio) });
});

app.get('/api/standards/evaluations', requireAuth, (req, res) => {
  const studio = String(req.query.studio || '').trim();
  const month = String(req.query.month || '').trim();
  if (!studio) return res.status(400).json({ error: 'studio requis' });
  if (!isValidStandardsMonth(month)) return res.status(400).json({ error: 'month requis (YYYY-MM-01)' });
  if (!authStandardsStudio(req, studio)) return res.status(403).json({ error: 'Accès refusé sur ce studio' });
  const db = getDb();
  const rows = db.prepare(`
    SELECT criterion_id, status, comment, evaluated_by, updated_at, photo_size,
           (photo_blob IS NOT NULL AND photo_size > 0) AS has_photo_flag
    FROM standards_evaluations WHERE studio = ? AND month = ?
  `).all(studio, month);
  const byCriterion = {};
  rows.forEach(r => {
    byCriterion[r.criterion_id] = {
      criterion_id: r.criterion_id,
      status: r.status,
      comment: r.comment,
      evaluated_by: r.evaluated_by,
      updated_at: r.updated_at,
      photo_size: r.photo_size || 0,
      has_photo: !!r.has_photo_flag,
    };
  });
  // Calcule le score : OK / (OK + NOK)
  const flatItems = STANDARDS_CRITERIA.flatMap(c => c.items.map(i => i.id));
  let okCount = 0, nokCount = 0, evalCount = 0;
  for (const id of flatItems) {
    const e = byCriterion[id];
    if (!e || !e.status || e.status === 'na') continue;
    evalCount++;
    if (e.status === 'ok') okCount++;
    if (e.status === 'nok') nokCount++;
  }
  const totalItems = flatItems.length;
  const denom = okCount + nokCount;
  const score = denom > 0 ? Math.round((okCount / denom) * 100) : null;
  res.json({
    studio, month,
    evaluations: byCriterion,
    counts: { ok: okCount, nok: nokCount, na: evalCount === 0 ? 0 : (evalCount - okCount - nokCount), unrated: totalItems - okCount - nokCount },
    total_items: totalItems,
    score_pct: score,
  });
});

app.put('/api/standards/evaluation', requireAuth, (req, res) => {
  const studio = String((req.body && req.body.studio) || '').trim();
  const month = String((req.body && req.body.month) || '').trim();
  const criterion_id = String((req.body && req.body.criterion_id) || '').trim();
  const status = (req.body && req.body.status) || null;
  const comment = (req.body && req.body.comment) || null;
  if (!studio || !criterion_id) return res.status(400).json({ error: 'studio + criterion_id requis' });
  if (!isValidStandardsMonth(month)) return res.status(400).json({ error: 'month requis (YYYY-MM-01)' });
  if (!authStandardsStudio(req, studio)) return res.status(403).json({ error: 'Accès refusé sur ce studio' });
  if (status !== null && !['ok', 'nok', 'na'].includes(String(status))) {
    return res.status(400).json({ error: 'status doit être ok | nok | na | null' });
  }
  // Vérifie que le criterion_id existe dans la structure
  const known = STANDARDS_CRITERIA.flatMap(c => c.items.map(i => i.id));
  if (!known.includes(criterion_id)) return res.status(400).json({ error: 'criterion_id inconnu' });
  const db = getDb();
  // Si tout est vide ET pas de photo associée → supprime la ligne
  const hasPhoto = db.prepare(`
    SELECT 1 FROM standards_evaluations
    WHERE studio = ? AND month = ? AND criterion_id = ? AND photo_blob IS NOT NULL AND photo_size > 0
  `).get(studio, month, criterion_id);
  if (status === null && (comment === null || comment === '') && !hasPhoto) {
    db.prepare(`DELETE FROM standards_evaluations WHERE studio = ? AND month = ? AND criterion_id = ?`)
      .run(studio, month, criterion_id);
  } else {
    db.prepare(`
      INSERT INTO standards_evaluations (studio, month, criterion_id, status, comment, evaluated_by)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(studio, month, criterion_id) DO UPDATE SET
        status = excluded.status,
        comment = excluded.comment,
        evaluated_by = excluded.evaluated_by,
        updated_at = datetime('now','localtime')
    `).run(studio, month, criterion_id, status, comment, req.session.name || 'inconnu');
  }
  res.json({ ok: true });
});

// Upload d'une photo pour un critère donné. Body : { studio, month,
// criterion_id, photo_base64, mime } — base64 avec ou sans préfixe data:.
app.put('/api/standards/evaluation/photo', requireAuth, (req, res) => {
  const studio = String((req.body && req.body.studio) || '').trim();
  const month = String((req.body && req.body.month) || '').trim();
  const criterion_id = String((req.body && req.body.criterion_id) || '').trim();
  const photo_base64 = (req.body && req.body.photo_base64) || '';
  let mime = (req.body && req.body.mime) || 'image/jpeg';
  if (!studio || !criterion_id) return res.status(400).json({ error: 'studio + criterion_id requis' });
  if (!isValidStandardsMonth(month)) return res.status(400).json({ error: 'month requis (YYYY-MM-01)' });
  if (!authStandardsStudio(req, studio)) return res.status(403).json({ error: 'Accès refusé sur ce studio' });
  if (!photo_base64) return res.status(400).json({ error: 'photo_base64 requis' });
  const known = STANDARDS_CRITERIA.flatMap(c => c.items.map(i => i.id));
  if (!known.includes(criterion_id)) return res.status(400).json({ error: 'criterion_id inconnu' });
  // Décode base64 (avec ou sans préfixe data:)
  let buf;
  try {
    const clean = String(photo_base64).replace(/^data:[^,]*,/, '');
    buf = Buffer.from(clean, 'base64');
  } catch (e) {
    return res.status(400).json({ error: 'base64 invalide' });
  }
  if (!buf.length) return res.status(400).json({ error: 'photo vide' });
  if (buf.length > 8 * 1024 * 1024) return res.status(413).json({ error: 'photo trop lourde (max 8 Mo)' });
  // Si mime non précisé, on tente une détection rapide via magic bytes
  if (!/^image\//.test(mime)) mime = 'image/jpeg';
  const db = getDb();
  db.prepare(`
    INSERT INTO standards_evaluations (studio, month, criterion_id, photo_blob, photo_size, photo_mime, evaluated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(studio, month, criterion_id) DO UPDATE SET
      photo_blob = excluded.photo_blob,
      photo_size = excluded.photo_size,
      photo_mime = excluded.photo_mime,
      evaluated_by = excluded.evaluated_by,
      updated_at = datetime('now','localtime')
  `).run(studio, month, criterion_id, buf, buf.length, mime, req.session.name || 'inconnu');
  res.json({ ok: true, size: buf.length, mime });
});

// Récupère la photo (stream binaire avec auth Bearer).
app.get('/api/standards/evaluation/photo', requireAuth, (req, res) => {
  const studio = String(req.query.studio || '').trim();
  const month = String(req.query.month || '').trim();
  const criterion_id = String(req.query.criterion_id || '').trim();
  if (!studio || !criterion_id) return res.status(400).json({ error: 'studio + criterion_id requis' });
  if (!isValidStandardsMonth(month)) return res.status(400).json({ error: 'month requis (YYYY-MM-01)' });
  if (!authStandardsStudio(req, studio)) return res.status(403).json({ error: 'Accès refusé sur ce studio' });
  const db = getDb();
  const row = db.prepare(`
    SELECT photo_blob, photo_size, photo_mime FROM standards_evaluations
    WHERE studio = ? AND month = ? AND criterion_id = ?
  `).get(studio, month, criterion_id);
  if (!row || !row.photo_blob) return res.status(404).json({ error: 'Photo introuvable' });
  res.setHeader('Content-Type', row.photo_mime || 'image/jpeg');
  res.setHeader('Content-Length', String(row.photo_size || row.photo_blob.length));
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.send(row.photo_blob);
});

// ─── STANDARDS daily (matin / après-midi) ───────────────────
// Format quotidien : par studio + jour + créneau, une photo libre.

// Slots fixes — id + label. N'importe quel coach leader du studio
// peut remplir n'importe quel slot (un par jour).
// 6 catégories de base — dupliquées en deux groupes (Coach 1 / Coach 2)
const STANDARDS_DAILY_BASE = [
  { id: 'excel_adherent', label: 'Suivi Adh', icon: '📊' },
  { id: 'tableau_pret', label: 'Tableau prêt', icon: '📋' },
  { id: 'salle_entrainement', label: 'Training 1', icon: '🏋️' },
  { id: 'salle_entrainement_2', label: 'Training 2', icon: '🤸' },
  { id: 'sdb', label: 'SDB', icon: '🚿' },
  { id: 'chic_coach', label: 'Chic', icon: '👔' },
];
// Génère les 12 slots définitifs : c1_<id> et c2_<id> avec le champ
// `coach` (1 ou 2) pour permettre le regroupement côté front.
const STANDARDS_DAILY_SLOTS_DEF = [1, 2].flatMap(coachNum =>
  STANDARDS_DAILY_BASE.map(b => ({
    id: `c${coachNum}_${b.id}`,
    label: b.label,
    icon: b.icon,
    coach: coachNum,
  }))
);
const STANDARDS_DAILY_SLOTS = STANDARDS_DAILY_SLOTS_DEF.map(s => s.id);

app.get('/api/standards/daily/slots', requireAuth, (req, res) => {
  if (!['admin', 'standards_admin', 'coach_leader', 'guest'].includes(req.session.role)) {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  res.json({ slots: STANDARDS_DAILY_SLOTS_DEF });
});

// ─── Check-in quotidien (mood + tâches) ─────────────────────
// Doit être rempli AVANT de pouvoir uploader une photo Standards.
// Une ligne par studio × date × coach_slot (matin/après-midi).
const STANDARDS_MOODS = ['en_feu', 'bien', 'neutre', 'fatigue', 'pas_top'];

function slotToCoachNum(slot) {
  if (slot.startsWith('c1_')) return 1;
  if (slot.startsWith('c2_')) return 2;
  return null;
}

app.get('/api/standards/checkin', requireAuth, (req, res) => {
  const studio = String(req.query.studio || '').trim();
  const date = String(req.query.date || '').trim();
  if (!studio) return res.status(400).json({ error: 'studio requis' });
  if (!isValidStandardsDate(date)) return res.status(400).json({ error: 'date requise (YYYY-MM-DD)' });
  if (!authStandardsStudio(req, studio)) return res.status(403).json({ error: 'Accès refusé sur ce studio' });
  if (!standardsCanViewDate(req, date)) return res.status(403).json({ error: 'Accès refusé sur cette date' });
  const db = getDb();
  const rows = db.prepare(`
    SELECT coach_slot, mood, story_done, report_done, coach_name, updated_at
    FROM standards_daily_checkin WHERE studio = ? AND date = ?
  `).all(studio, date);
  const bySlot = {};
  rows.forEach(r => {
    bySlot[r.coach_slot] = {
      mood: r.mood,
      story_done: !!r.story_done,
      report_done: !!r.report_done,
      coach_name: r.coach_name,
      updated_at: r.updated_at,
    };
  });
  res.json({ studio, date, slots: bySlot });
});

app.put('/api/standards/checkin', requireAuth, (req, res) => {
  const studio = String((req.body && req.body.studio) || '').trim();
  const date = String((req.body && req.body.date) || '').trim();
  const coach_slot = parseInt((req.body && req.body.coach_slot), 10);
  const mood = String((req.body && req.body.mood) || '').trim();
  const story_done = (req.body && req.body.story_done) ? 1 : 0;
  const report_done = (req.body && req.body.report_done) ? 1 : 0;
  if (!studio) return res.status(400).json({ error: 'studio requis' });
  if (!isValidStandardsDate(date)) return res.status(400).json({ error: 'date requise (YYYY-MM-DD)' });
  if (!(coach_slot === 1 || coach_slot === 2)) return res.status(400).json({ error: 'coach_slot doit être 1 ou 2' });
  if (!STANDARDS_MOODS.includes(mood)) return res.status(400).json({ error: 'humeur invalide' });
  if (!authStandardsStudio(req, studio)) return res.status(403).json({ error: 'Accès refusé sur ce studio' });
  if (!standardsCanModify(req, date)) return res.status(403).json({ error: 'Modification uniquement pour le jour en cours' });
  // Les superviseurs (standards_admin) sont en lecture seule
  if (req.session.role === 'standards_admin') return res.status(403).json({ error: 'Lecture seule' });
  // Si le user a un coach_slot fixé (assistant studio / guest), il ne peut
  // remplir que SA rangée
  if ((req.session.coach_slot === 1 || req.session.coach_slot === 2) && req.session.coach_slot !== coach_slot) {
    return res.status(403).json({ error: 'Tu ne peux remplir que ta rangée' });
  }
  const db = getDb();
  db.prepare(`
    INSERT INTO standards_daily_checkin (studio, date, coach_slot, mood, story_done, report_done, coach_name)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(studio, date, coach_slot) DO UPDATE SET
      mood = excluded.mood,
      story_done = excluded.story_done,
      report_done = excluded.report_done,
      coach_name = excluded.coach_name,
      updated_at = datetime('now','localtime')
  `).run(studio, date, coach_slot, mood, story_done, report_done, req.session.name || 'inconnu');
  res.json({ ok: true });
});

// Helper : vérifie qu'un check-in existe pour (studio, date, coach_slot)
function checkinExists(studio, date, coach_slot) {
  const db = getDb();
  const row = db.prepare('SELECT 1 FROM standards_daily_checkin WHERE studio = ? AND date = ? AND coach_slot = ?').get(studio, date, coach_slot);
  return !!row;
}

// ─── Indicateurs du jour (compteurs + action clé) ───────────
// Une ligne par studio × jour. Compteurs (prises_ref, call_non_freq,
// avis_google, temoignages, surpack_eur) modifiables par tous ceux qui
// ont accès au studio aujourd'hui. action_cle uniquement par le coach
// leader complet (can_view_history = true) ou l'admin.
const KPI_COUNTERS = ['prises_ref', 'call_non_freq', 'avis_google', 'temoignages'];
const KPI_DEFAULTS = { prises_ref: 0, call_non_freq: 0, avis_google: 0, temoignages: 0, surpack_eur: 0, action_cle: null };
const KPI_CLUB_OWNER = '__club__';

// Détermine le scope KPI selon le rôle :
//  - guest    → ligne PRIVÉE par guest (clé = `guest:<safeName>`)
//  - autres   → ligne PARTAGÉE du club (`__club__`)
function kpiOwnerKey(session) {
  if (session.role === 'guest') {
    const safe = String(session.name || 'inconnu').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    return `guest:${safe || 'inconnu'}`;
  }
  return KPI_CLUB_OWNER;
}
function canEditKpiCounters(req) {
  if (req.session.role === 'admin') return true;
  if (req.session.role === 'standards_admin') return false; // read-only
  if (['coach_leader', 'guest', 'coach', 'coach-leader'].includes(req.session.role)) return true;
  return false;
}
function canEditKpiActionCle(req) {
  if (req.session.role === 'admin') return true;
  // Coach leader complet → édite l'action clé du club
  if (req.session.role === 'coach_leader' && req.session.can_view_history === true) return true;
  // Guest → édite SA propre action clé (scope guest:NAME)
  if (req.session.role === 'guest') return true;
  return false;
}

app.get('/api/standards/daily/kpi', requireAuth, (req, res) => {
  const studio = String(req.query.studio || '').trim();
  const date = String(req.query.date || '').trim();
  if (!studio) return res.status(400).json({ error: 'studio requis' });
  if (!isValidStandardsDate(date)) return res.status(400).json({ error: 'date requise (YYYY-MM-DD)' });
  if (!authStandardsStudio(req, studio)) return res.status(403).json({ error: 'Accès refusé sur ce studio' });
  if (!standardsCanViewDate(req, date)) return res.status(403).json({ error: 'Accès refusé sur cette date' });
  const db = getDb();
  const owner = kpiOwnerKey(req.session);
  const row = db.prepare(`
    SELECT prises_ref, call_non_freq, avis_google, temoignages, surpack_eur, action_cle, updated_at
    FROM standards_daily_kpi WHERE studio = ? AND date = ? AND owner_key = ?
  `).get(studio, date, owner);
  res.json({ studio, date, kpi: row || { ...KPI_DEFAULTS, updated_at: null } });
});

app.put('/api/standards/daily/kpi', requireAuth, (req, res) => {
  const studio = String((req.body && req.body.studio) || '').trim();
  const date = String((req.body && req.body.date) || '').trim();
  if (!studio) return res.status(400).json({ error: 'studio requis' });
  if (!isValidStandardsDate(date)) return res.status(400).json({ error: 'date requise (YYYY-MM-DD)' });
  if (!authStandardsStudio(req, studio)) return res.status(403).json({ error: 'Accès refusé sur ce studio' });
  if (!standardsCanModify(req, date)) return res.status(403).json({ error: 'Modification uniquement pour le jour en cours' });

  const body = req.body || {};
  const updates = {};
  // Compteurs entiers
  for (const k of KPI_COUNTERS) {
    if (body[k] != null) {
      if (!canEditKpiCounters(req)) return res.status(403).json({ error: 'Tu ne peux pas modifier les compteurs' });
      const n = parseInt(body[k], 10);
      if (!Number.isFinite(n) || n < 0 || n > 9999) return res.status(400).json({ error: `${k} doit être un entier ≥ 0` });
      updates[k] = n;
    }
  }
  // Surpack € : nombre décimal positif
  if (body.surpack_eur != null) {
    if (!canEditKpiCounters(req)) return res.status(403).json({ error: 'Tu ne peux pas modifier les compteurs' });
    const v = parseFloat(body.surpack_eur);
    if (!Number.isFinite(v) || v < 0 || v > 1e7) return res.status(400).json({ error: 'surpack_eur doit être un nombre ≥ 0' });
    updates.surpack_eur = Math.round(v * 100) / 100;
  }
  // Action clé : coach leader complet ou admin uniquement
  if ('action_cle' in body) {
    if (!canEditKpiActionCle(req)) return res.status(403).json({ error: "Seul le coach leader peut renseigner l'action clé du moment" });
    const raw = body.action_cle == null ? null : String(body.action_cle);
    if (raw && raw.length > 500) return res.status(400).json({ error: 'Action clé trop longue (500 caractères max)' });
    updates.action_cle = raw ? raw.trim() : null;
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Aucun champ à mettre à jour' });

  const db = getDb();
  const owner = kpiOwnerKey(req.session);
  // Récupère la ligne existante du scope (ou défauts)
  const existing = db.prepare('SELECT * FROM standards_daily_kpi WHERE studio = ? AND date = ? AND owner_key = ?').get(studio, date, owner) || { ...KPI_DEFAULTS };
  const merged = { ...existing, ...updates };
  db.prepare(`
    INSERT INTO standards_daily_kpi (studio, date, owner_key, prises_ref, call_non_freq, avis_google, temoignages, surpack_eur, action_cle, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
    ON CONFLICT(studio, date, owner_key) DO UPDATE SET
      prises_ref = excluded.prises_ref,
      call_non_freq = excluded.call_non_freq,
      avis_google = excluded.avis_google,
      temoignages = excluded.temoignages,
      surpack_eur = excluded.surpack_eur,
      action_cle = excluded.action_cle,
      updated_at = excluded.updated_at
  `).run(studio, date, owner, merged.prises_ref, merged.call_non_freq, merged.avis_google, merged.temoignages, merged.surpack_eur, merged.action_cle);
  res.json({ ok: true, kpi: merged });
});

function isValidStandardsDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
}

// Modification autorisée :
//   - admin : tout
//   - coach_leader / guest : today uniquement
function standardsCanModify(req, date) {
  if (req.session.role === 'admin') return true;
  if (!['coach_leader', 'guest'].includes(req.session.role)) return false;
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return date === today;
}

app.get('/api/standards/daily', requireAuth, (req, res) => {
  const studio = String(req.query.studio || '').trim();
  const date = String(req.query.date || '').trim();
  if (!studio) return res.status(400).json({ error: 'studio requis' });
  if (!isValidStandardsDate(date)) return res.status(400).json({ error: 'date requise (YYYY-MM-DD)' });
  if (!authStandardsStudio(req, studio)) return res.status(403).json({ error: 'Accès refusé sur ce studio' });
  if (!standardsCanViewDate(req, date)) return res.status(403).json({ error: "Accès refusé : consultation des jours passés non autorisée" });
  const db = getDb();
  const rows = db.prepare(`
    SELECT slot, photo_size, photo_mime, uploaded_by, uploaded_at,
           (photo_blob IS NOT NULL AND photo_size > 0) AS has_photo_flag
    FROM standards_daily WHERE studio = ? AND date = ?
  `).all(studio, date);
  const bySlot = {};
  STANDARDS_DAILY_SLOTS.forEach(id => { bySlot[id] = null; });
  rows.forEach(r => {
    bySlot[r.slot] = {
      has_photo: !!r.has_photo_flag,
      photo_size: r.photo_size || 0,
      photo_mime: r.photo_mime || null,
      uploaded_by: r.uploaded_by || null,
      uploaded_at: r.uploaded_at || null,
    };
  });
  res.json({ studio, date, slots: bySlot });
});

app.put('/api/standards/daily/photo', requireAuth, (req, res) => {
  const studio = String((req.body && req.body.studio) || '').trim();
  const date = String((req.body && req.body.date) || '').trim();
  const slot = String((req.body && req.body.slot) || '').trim();
  const photo_base64 = (req.body && req.body.photo_base64) || '';
  let mime = (req.body && req.body.mime) || 'image/jpeg';
  if (!studio || !slot) return res.status(400).json({ error: 'studio + slot requis' });
  if (!STANDARDS_DAILY_SLOTS.includes(slot)) return res.status(400).json({ error: 'slot inconnu' });
  if (!isValidStandardsDate(date)) return res.status(400).json({ error: 'date requise (YYYY-MM-DD)' });
  if (!authStandardsStudio(req, studio)) return res.status(403).json({ error: 'Accès refusé sur ce studio' });
  if (!standardsCanModify(req, date)) return res.status(403).json({ error: "Modification autorisée uniquement pour le jour en cours" });
  // Plus de gating sur le check-in d'énergie : le rituel est optionnel
  // pour tous les rôles. Le formulaire reste affiché pour celles et ceux
  // qui veulent renseigner leur humeur, mais ne bloque jamais l'upload.
  if (!photo_base64) return res.status(400).json({ error: 'photo_base64 requis' });
  let buf;
  try {
    const clean = String(photo_base64).replace(/^data:[^,]*,/, '');
    buf = Buffer.from(clean, 'base64');
  } catch (e) {
    return res.status(400).json({ error: 'base64 invalide' });
  }
  if (!buf.length) return res.status(400).json({ error: 'photo vide' });
  if (buf.length > 8 * 1024 * 1024) return res.status(413).json({ error: 'photo trop lourde (max 8 Mo)' });
  if (!/^image\//.test(mime)) mime = 'image/jpeg';
  const db = getDb();
  db.prepare(`
    INSERT INTO standards_daily (studio, date, slot, photo_blob, photo_size, photo_mime, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(studio, date, slot) DO UPDATE SET
      photo_blob = excluded.photo_blob,
      photo_size = excluded.photo_size,
      photo_mime = excluded.photo_mime,
      uploaded_by = excluded.uploaded_by,
      uploaded_at = datetime('now','localtime')
  `).run(studio, date, slot, buf, buf.length, mime, req.session.name || 'inconnu');
  res.json({ ok: true, size: buf.length, mime });
});

app.get('/api/standards/daily/photo', requireAuth, (req, res) => {
  const studio = String(req.query.studio || '').trim();
  const date = String(req.query.date || '').trim();
  const slot = String(req.query.slot || '').trim();
  if (!studio || !slot) return res.status(400).json({ error: 'studio + slot requis' });
  if (!isValidStandardsDate(date)) return res.status(400).json({ error: 'date requise (YYYY-MM-DD)' });
  if (!authStandardsStudio(req, studio)) return res.status(403).json({ error: 'Accès refusé sur ce studio' });
  if (!standardsCanViewDate(req, date)) return res.status(403).json({ error: "Accès refusé : consultation des jours passés non autorisée" });
  const db = getDb();
  const row = db.prepare(`
    SELECT photo_blob, photo_size, photo_mime FROM standards_daily
    WHERE studio = ? AND date = ? AND slot = ?
  `).get(studio, date, slot);
  if (!row || !row.photo_blob) return res.status(404).json({ error: 'Photo introuvable' });
  res.setHeader('Content-Type', row.photo_mime || 'image/jpeg');
  res.setHeader('Content-Length', String(row.photo_size || row.photo_blob.length));
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.send(row.photo_blob);
});

app.delete('/api/standards/daily/photo', requireAuth, (req, res) => {
  const studio = String((req.body && req.body.studio) || req.query.studio || '').trim();
  const date = String((req.body && req.body.date) || req.query.date || '').trim();
  const slot = String((req.body && req.body.slot) || req.query.slot || '').trim();
  if (!studio || !slot) return res.status(400).json({ error: 'studio + slot requis' });
  if (!isValidStandardsDate(date)) return res.status(400).json({ error: 'date requise (YYYY-MM-DD)' });
  if (!authStandardsStudio(req, studio)) return res.status(403).json({ error: 'Accès refusé sur ce studio' });
  if (!standardsCanModify(req, date)) return res.status(403).json({ error: "Suppression autorisée uniquement pour le jour en cours" });
  const db = getDb();
  db.prepare(`DELETE FROM standards_daily WHERE studio = ? AND date = ? AND slot = ?`)
    .run(studio, date, slot);
  res.json({ ok: true });
});

// Supprime la photo d'un critère donné.
app.delete('/api/standards/evaluation/photo', requireAuth, (req, res) => {
  const studio = String((req.body && req.body.studio) || req.query.studio || '').trim();
  const month = String((req.body && req.body.month) || req.query.month || '').trim();
  const criterion_id = String((req.body && req.body.criterion_id) || req.query.criterion_id || '').trim();
  if (!studio || !criterion_id) return res.status(400).json({ error: 'studio + criterion_id requis' });
  if (!isValidStandardsMonth(month)) return res.status(400).json({ error: 'month requis (YYYY-MM-01)' });
  if (!authStandardsStudio(req, studio)) return res.status(403).json({ error: 'Accès refusé sur ce studio' });
  const db = getDb();
  const row = db.prepare(`
    SELECT status, comment FROM standards_evaluations
    WHERE studio = ? AND month = ? AND criterion_id = ?
  `).get(studio, month, criterion_id);
  if (!row) return res.json({ ok: true });
  // Si plus rien d'autre, on supprime la ligne ; sinon on vide juste la photo
  if (!row.status && !row.comment) {
    db.prepare(`DELETE FROM standards_evaluations WHERE studio = ? AND month = ? AND criterion_id = ?`)
      .run(studio, month, criterion_id);
  } else {
    db.prepare(`
      UPDATE standards_evaluations SET photo_blob = NULL, photo_size = 0, photo_mime = NULL,
        updated_at = datetime('now','localtime')
      WHERE studio = ? AND month = ? AND criterion_id = ?
    `).run(studio, month, criterion_id);
  }
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
