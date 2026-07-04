// ============================================================================
// Web Push — moteur de notifications (nutrition & sport)
// Infrastructure : VAPID + abonnements en base + file d'attente anti-spam + logs.
// Phase 1 : infra + moteur + préférences + scénario A (message privé du coach).
// (Phases suivantes : récap hebdo, photos S3/S6, rappels de séance — via le tick.)
// ============================================================================
const webpush = require('web-push');

module.exports = function initPush({ app, getDb, mw }) {
  const { requireAuth, requireNutritionUse, requireCoachOrAdmin } = mw;

  // ---- Types de notifications + priorités (1 = plus prioritaire) ----
  // message coach > photos > séance > récap
  const PRIORITY = { messages: 1, photos: 2, seances: 3, recap: 4 };
  const PREF_TYPES = ['messages', 'recap', 'photos', 'seances'];

  // ---- Schéma ----
  function ensureSchema() {
    getDb().exec(`
      CREATE TABLE IF NOT EXISTS nutrition_push_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_email TEXT NOT NULL,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_agent TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_push_subs_email ON nutrition_push_subscriptions(client_email);
      CREATE TABLE IF NOT EXISTS nutrition_push_prefs (
        client_email TEXT PRIMARY KEY,
        messages INTEGER NOT NULL DEFAULT 1,
        recap INTEGER NOT NULL DEFAULT 1,
        photos INTEGER NOT NULL DEFAULT 1,
        seances INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS nutrition_push_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_email TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        url TEXT NOT NULL DEFAULT '',
        priority INTEGER NOT NULL DEFAULT 5,
        not_before TEXT NOT NULL DEFAULT '',
        bypass_cap INTEGER NOT NULL DEFAULT 0,
        dedup_key TEXT NOT NULL DEFAULT '',
        count INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_push_queue_status ON nutrition_push_queue(status, not_before);
      CREATE TABLE IF NOT EXISTS nutrition_push_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_email TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        url TEXT NOT NULL DEFAULT '',
        sent_at TEXT NOT NULL DEFAULT '',
        opened_at TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_push_log_email ON nutrition_push_log(client_email, sent_at);
    `);
  }

  // ---- VAPID : variables d'env sinon auto-généré et persisté (stable) ----
  let vapidPublic = null, vapidReady = false;
  function ensureVapid() {
    if (vapidReady) return vapidPublic;
    const db = getDb();
    let pub = process.env.VAPID_PUBLIC_KEY || '';
    let priv = process.env.VAPID_PRIVATE_KEY || '';
    if (!pub || !priv) {
      const rp = db.prepare("SELECT value FROM app_settings WHERE key='vapid_public'").get();
      const rk = db.prepare("SELECT value FROM app_settings WHERE key='vapid_private'").get();
      if (rp && rk && rp.value && rk.value) { pub = rp.value; priv = rk.value; }
      else {
        const keys = webpush.generateVAPIDKeys();
        pub = keys.publicKey; priv = keys.privateKey;
        const up = db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?,?,datetime('now','localtime')) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
        up.run('vapid_public', pub); up.run('vapid_private', priv);
      }
    }
    const subject = process.env.VAPID_SUBJECT || 'mailto:contact@stanmartinapp.cloud';
    webpush.setVapidDetails(subject, pub, priv);
    vapidPublic = pub; vapidReady = true;
    return pub;
  }

  // ---- Heure de Paris (fuseau Europe/Paris, DST géré) ----
  function parisParts(d = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour12: false,
      weekday: 'short', hour: '2-digit', minute: '2-digit', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
    const g = (t) => (parts.find((p) => p.type === t) || {}).value;
    return { weekday: g('weekday'), hour: Number(g('hour')) % 24, minute: Number(g('minute')), ymd: g('year') + '-' + g('month') + '-' + g('day') };
  }
  function isQuietHours(d = new Date()) { const { hour, minute } = parisParts(d); return hour < 8 || hour > 21 || (hour === 21 && minute >= 30); }
  // Prochaine échéance à 8h00 (Paris) : now + delta jusqu'à 8h. Approx via ISO (suffisant ici).
  function next8h(d = new Date()) {
    const { hour, minute } = parisParts(d);
    let addH = (8 - hour); let addM = (0 - minute);
    let deltaMin = addH * 60 + addM;
    if (deltaMin <= 0) deltaMin += 24 * 60; // demain 8h
    return new Date(d.getTime() + deltaMin * 60000).toISOString();
  }

  // ---- Préférences ----
  function getPrefs(email) {
    const row = getDb().prepare('SELECT messages, recap, photos, seances FROM nutrition_push_prefs WHERE client_email=?').get(email);
    if (!row) return { messages: 1, recap: 1, photos: 1, seances: 1 };
    return row;
  }
  function prefEnabled(email, type) { const p = getPrefs(email); return p[type] !== 0; }

  // ---- Envoi effectif à tous les abonnements d'un client ----
  async function sendToSubscriptions(email, payload) {
    const subs = getDb().prepare('SELECT id, endpoint, p256dh, auth FROM nutrition_push_subscriptions WHERE client_email=?').all(email);
    if (!subs.length) return { sent: 0 };
    ensureVapid();
    let sent = 0;
    for (const s of subs) {
      const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
      try {
        await webpush.sendNotification(subscription, JSON.stringify(payload));
        sent += 1;
      } catch (e) {
        // 404/410 : abonnement expiré -> on le supprime.
        if (e && (e.statusCode === 404 || e.statusCode === 410)) {
          try { getDb().prepare('DELETE FROM nutrition_push_subscriptions WHERE id=?').run(s.id); } catch (_) { /* ignore */ }
        } else { console.warn('push send err:', e && e.message); }
      }
    }
    return { sent };
  }

  // Envoie MAINTENANT (respecte la préférence de type) + journalise.
  async function deliver(email, type, { title, body, url }, logId) {
    if (!prefEnabled(email, type)) return { sent: 0, skipped: 'pref' };
    const res = await sendToSubscriptions(email, { title, body, url: url || '/nutrition/', logId });
    return res;
  }

  // ---- File d'attente : ajout ----
  function enqueue(email, type, { title, body, url }, opts = {}) {
    const now = new Date();
    const priority = PRIORITY[type] || 5;
    const bypassCap = opts.bypassCap ? 1 : 0;
    let notBefore = opts.notBefore || now.toISOString();
    // Heures calmes : on repousse à 8h (sauf bypass explicite, ex : jamais pour du bruit nocturne).
    if (isQuietHours(new Date(notBefore))) notBefore = next8h(new Date(notBefore));
    const dedup = opts.dedupKey || '';
    // Regroupement : s'il existe déjà un item PENDING avec la même dedup_key, on incrémente.
    if (dedup) {
      const existing = getDb().prepare("SELECT id, count FROM nutrition_push_queue WHERE dedup_key=? AND status='pending'").get(dedup);
      if (existing) {
        const n = (existing.count || 1) + 1;
        getDb().prepare('UPDATE nutrition_push_queue SET count=?, title=?, body=? WHERE id=?')
          .run(n, opts.groupedTitle ? opts.groupedTitle(n) : title, opts.groupedBody ? opts.groupedBody(n) : body, existing.id);
        return existing.id;
      }
    }
    const info = getDb().prepare(`INSERT INTO nutrition_push_queue
      (client_email, type, title, body, url, priority, not_before, bypass_cap, dedup_key, count, status, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,1,'pending',?)`)
      .run(email, type, title, body, url || '/nutrition/', priority, notBefore, bypassCap, dedup, now.toISOString());
    return info.lastInsertRowid;
  }

  // ---- Traitement de la file (appelé chaque minute) ----
  function countTodayNonMessage(email) {
    const day = parisParts().ymd;
    // Journalisés aujourd'hui (Paris) hors 'messages'.
    const rows = getDb().prepare("SELECT sent_at, type FROM nutrition_push_log WHERE client_email=? AND type!='messages'").all(email);
    return rows.filter((r) => { try { return parisParts(new Date(r.sent_at)).ymd === day; } catch (_) { return false; } }).length;
  }
  async function processQueue() {
    ensureVapid();
    const nowIso = new Date().toISOString();
    // Dûs, triés par priorité puis ancienneté.
    const due = getDb().prepare("SELECT * FROM nutrition_push_queue WHERE status='pending' AND not_before<=? ORDER BY priority ASC, id ASC").all(nowIso);
    for (const item of due) {
      // Heures calmes : on repousse.
      if (isQuietHours()) { getDb().prepare('UPDATE nutrition_push_queue SET not_before=? WHERE id=?').run(next8h(), item.id); continue; }
      // Plafond 2/jour (hors messages coach / bypass).
      if (!item.bypass_cap && item.type !== 'messages') {
        if (countTodayNonMessage(item.client_email) >= 2) { getDb().prepare("UPDATE nutrition_push_queue SET status='skipped_cap' WHERE id=?").run(item.id); continue; }
      }
      // Préférence désactivée -> on abandonne.
      if (!prefEnabled(item.client_email, item.type)) { getDb().prepare("UPDATE nutrition_push_queue SET status='skipped_pref' WHERE id=?").run(item.id); continue; }
      // Journalise (avant envoi, pour le compteur + le suivi d'ouverture).
      const log = getDb().prepare('INSERT INTO nutrition_push_log (client_email, type, title, body, url, sent_at) VALUES (?,?,?,?,?,?)')
        .run(item.client_email, item.type, item.title, item.body, item.url, new Date().toISOString());
      getDb().prepare("UPDATE nutrition_push_queue SET status='sent' WHERE id=?").run(item.id);
      try { await sendToSubscriptions(item.client_email, { title: item.title, body: item.body, url: item.url, type: item.type, logId: log.lastInsertRowid }); }
      catch (e) { console.warn('processQueue send:', e && e.message); }
    }
  }

  // ---- Scheduler : tick chaque minute ----
  let _tickBusy = false;
  async function tick() {
    if (_tickBusy) return; _tickBusy = true;
    try { await processQueue(); /* Phase 2 : cron récap / photos / séances ici */ }
    catch (e) { console.error('push tick:', e && e.message); }
    finally { _tickBusy = false; }
  }

  // ---- Scénario A : message privé du coach (immédiat + regroupement 5 min) ----
  function notifyCoachMessage(clientEmail, coachPrenom, convId, text) {
    if (!clientEmail) return;
    const preview = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const prenom = String(coachPrenom || 'Ton coach').trim().split(' ')[0] || 'Ton coach';
    enqueue(clientEmail, 'messages', {
      title: '💬 ' + prenom + ' t\'a écrit',
      body: preview,
      url: '/nutrition/?push=message&conv=' + convId,
    }, {
      bypassCap: true,                // les messages coach ne comptent pas dans le plafond
      notBefore: new Date(Date.now() + 20000).toISOString(), // léger délai (20 s) pour regrouper les rafales
      dedupKey: 'coachmsg:' + clientEmail + ':' + convId,
      groupedTitle: (n) => '💬 ' + prenom + ' t\'a envoyé ' + n + ' messages',
      groupedBody: () => 'Ouvre la conversation pour lire.',
    });
  }

  // ---- Routes ----
  app.get('/nutrition/api/push/vapid-public', (req, res) => {
    try { res.json({ ok: true, key: ensureVapid() }); } catch (e) { res.status(500).json({ ok: false }); }
  });
  app.post('/nutrition/api/push/subscribe', requireAuth, requireNutritionUse, (req, res) => {
    try {
      const email = (req.session && req.session.email) || '';
      const sub = (req.body || {}).subscription || req.body || {};
      const ep = sub.endpoint; const p = sub.keys && sub.keys.p256dh; const a = sub.keys && sub.keys.auth;
      if (!email || !ep || !p || !a) return res.status(400).json({ ok: false, error: 'Abonnement invalide.' });
      getDb().prepare(`INSERT INTO nutrition_push_subscriptions (client_email, endpoint, p256dh, auth, user_agent, created_at)
        VALUES (?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET client_email=excluded.client_email, p256dh=excluded.p256dh, auth=excluded.auth`)
        .run(email, ep, p, a, String(req.headers['user-agent'] || '').slice(0, 200), new Date().toISOString());
      // Préférences par défaut (toutes activées) si absentes.
      getDb().prepare('INSERT OR IGNORE INTO nutrition_push_prefs (client_email) VALUES (?)').run(email);
      res.json({ ok: true });
    } catch (e) { console.error('push subscribe:', e); res.status(500).json({ ok: false }); }
  });
  app.post('/nutrition/api/push/unsubscribe', requireAuth, requireNutritionUse, (req, res) => {
    try {
      const ep = (req.body || {}).endpoint || '';
      if (ep) getDb().prepare('DELETE FROM nutrition_push_subscriptions WHERE endpoint=?').run(ep);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ ok: false }); }
  });
  app.get('/nutrition/api/push/prefs', requireAuth, requireNutritionUse, (req, res) => {
    try { const email = (req.session && req.session.email) || ''; res.json({ ok: true, prefs: getPrefs(email) }); }
    catch (e) { res.status(500).json({ ok: false }); }
  });
  app.post('/nutrition/api/push/prefs', requireAuth, requireNutritionUse, (req, res) => {
    try {
      const email = (req.session && req.session.email) || '';
      if (!email) return res.status(403).json({ ok: false });
      const b = req.body || {};
      const cur = getPrefs(email);
      const val = (k) => (k in b ? (b[k] ? 1 : 0) : cur[k]);
      getDb().prepare(`INSERT INTO nutrition_push_prefs (client_email, messages, recap, photos, seances) VALUES (?,?,?,?,?)
        ON CONFLICT(client_email) DO UPDATE SET messages=excluded.messages, recap=excluded.recap, photos=excluded.photos, seances=excluded.seances`)
        .run(email, val('messages'), val('recap'), val('photos'), val('seances'));
      res.json({ ok: true, prefs: getPrefs(email) });
    } catch (e) { console.error('push prefs:', e); res.status(500).json({ ok: false }); }
  });
  // Marque une notification comme ouverte (deep link / SW).
  app.post('/nutrition/api/push/opened', requireAuth, requireNutritionUse, (req, res) => {
    try {
      const email = (req.session && req.session.email) || '';
      const logId = Number((req.body || {}).logId || 0);
      if (logId) getDb().prepare("UPDATE nutrition_push_log SET opened_at=? WHERE id=? AND client_email=? AND opened_at=''").run(new Date().toISOString(), logId, email);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ ok: false }); }
  });
  // Test manuel (client connecté) : s'envoie une notif à lui-même.
  app.post('/nutrition/api/push/test', requireAuth, requireNutritionUse, async (req, res) => {
    try {
      const email = (req.session && req.session.email) || '';
      if (!email) return res.status(403).json({ ok: false });
      const r = await sendToSubscriptions(email, { title: '🔔 Test', body: 'Tes notifications sont bien activées.', url: '/nutrition/' });
      res.json({ ok: true, sent: r.sent });
    } catch (e) { res.status(500).json({ ok: false }); }
  });

  // ---- Init ----
  try { ensureSchema(); } catch (e) { console.error('push schema:', e && e.message); }
  try { ensureVapid(); } catch (e) { console.warn('push vapid init:', e && e.message); }
  const _timer = setInterval(() => { tick().catch(() => {}); }, 60000);
  if (_timer.unref) _timer.unref();

  return { notifyCoachMessage, enqueue, tick, getPrefs, isQuietHours, parisParts, _internal: { processQueue, next8h } };
};
