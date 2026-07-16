// ============================================================================
// Web Push — moteur de notifications (nutrition & sport)
// Infrastructure : VAPID + abonnements en base + file d'attente anti-spam + logs.
// Phase 1 : infra + moteur + préférences + scénario A (message privé du coach).
// (Phases suivantes : récap hebdo, photos S3/S6, rappels de séance — via le tick.)
// ============================================================================
const webpush = require('web-push');

module.exports = function initPush({ app, getDb, mw }) {
  const { requireAuth, requireNutritionUse, requireCoachOrAdmin } = mw;
  // Moteur du Chemin du challenge (lecture seule ici) : nœud actif + date Paris.
  const challengeEngine = require('./challengePath')({ getDb });
  const { pathParisYmd: challengeYmd } = require('./challengePath');

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
      CREATE TABLE IF NOT EXISTS nutrition_push_flags (
        client_email TEXT NOT NULL,
        flag TEXT NOT NULL,
        ts TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (client_email, flag)
      );
      CREATE TABLE IF NOT EXISTS nutrition_push_coach_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        coach_id INTEGER NOT NULL DEFAULT 0,
        client_email TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT '',
        message TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT '',
        seen INTEGER NOT NULL DEFAULT 0
      );
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
  // ======================= Phase 2 : scénarios planifiés (crons) =======================
  const WEEKDAY_NUM = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  function parisYmd(d = new Date()) { return parisParts(d).ymd; }
  function getFlag(email, flag) { const r = getDb().prepare('SELECT ts FROM nutrition_push_flags WHERE client_email=? AND flag=?').get(email, flag); return r ? r.ts : null; }
  function setFlag(email, flag) { getDb().prepare('INSERT INTO nutrition_push_flags (client_email, flag, ts) VALUES (?,?,?) ON CONFLICT(client_email,flag) DO UPDATE SET ts=excluded.ts').run(email, flag, new Date().toISOString()); }
  // Job "quotidien" dû : passé l'heure cible (Paris) ce jour-là, exécuté UNE seule fois (rattrapage inclus).
  function cronDue(job, targetHour, targetMin, weekdays) {
    const p = parisParts();
    if (weekdays && !weekdays.includes(p.weekday)) return false;
    const past = p.hour > targetHour || (p.hour === targetHour && p.minute >= targetMin);
    if (!past) return false;
    const key = 'pushcron:' + job;
    const row = getDb().prepare('SELECT value FROM app_settings WHERE key=?').get(key);
    if (row && row.value === p.ymd) return false;
    getDb().prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?,?,datetime('now','localtime')) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, p.ymd);
    return true;
  }
  // Clients ABONNÉS (>=1 subscription) + en Challenge avec un plan.
  function subscribedChallengeClients() {
    const emails = getDb().prepare('SELECT DISTINCT client_email FROM nutrition_push_subscriptions').all().map((r) => r.client_email);
    const out = [];
    for (const email of emails) {
      const row = getDb().prepare('SELECT data, prenom, coach_id FROM nutrition_clients WHERE email=?').get(email);
      if (!row) continue;
      let d = {}; try { d = row.data ? JSON.parse(row.data) : {}; } catch (_) { d = {}; }
      const objectif = d.profil && (d.profil.objectif || d.profil.but);
      if (objectif !== 'challenge' || !d.plan) continue;
      const depart = getDb().prepare("SELECT date FROM nutrition_parcours_pesees WHERE client_email=? AND type='depart'").get(email);
      out.push({ email, prenom: String(row.prenom || (d.profil && d.profil.prenom) || '').split(' ')[0], coachId: row.coach_id || 0, startDate: (depart && depart.date) || d.startDate || '' });
    }
    return out;
  }
  function challengeDay(startDate) { if (!startDate) return null; const s = Date.parse(startDate); if (isNaN(s)) return null; return Math.floor((Date.now() - s) / 86400000); }
  function mondayYmdParis() { const n = WEEKDAY_NUM[parisParts().weekday]; const back = (n + 6) % 7; return parisYmd(new Date(Date.now() - back * 86400000)); }
  function weekState(email) {
    const weekStart = mondayYmdParis();
    let suivi = 0, tot = 0, seances = 0;
    try { getDb().prepare('SELECT suivi, adapte, autre, saute FROM nutrition_adherence WHERE client_email=? AND date>=?').all(email, weekStart).forEach((r) => { suivi += r.suivi; tot += r.suivi + r.adapte + r.autre + r.saute; }); } catch (_) { /* ignore */ }
    try { seances = getDb().prepare('SELECT COUNT(*) n FROM nutrition_parcours_seances WHERE client_email=? AND date>=?').get(email, weekStart).n; } catch (_) { /* ignore */ }
    if (tot === 0 && seances === 0) return 'decroche';
    const pct = tot ? suivi / tot : 0;
    if (pct >= 0.7) return 'bien';
    if (pct >= 0.4) return 'moyen';
    return 'decroche';
  }
  // B : récap dimanche 18h.
  function runRecap() {
    for (const c of subscribedChallengeClients()) {
      const p = c.prenom || 'toi'; const st = weekState(c.email);
      const m = st === 'bien' ? { title: '🔥 ' + p + ', ton récap de la semaine est prêt', body: 'Il est beau — viens le voir !' }
        : st === 'moyen' ? { title: '📊 ' + p + ', ta semaine en chiffres t\'attend', body: 'Un coup d\'œil rapide sur ton récap.' }
        : { title: '🌱 ' + p + ', ton récap est là', body: 'On repart ensemble lundi 💪' };
      enqueue(c.email, 'recap', { title: m.title, body: m.body, url: '/nutrition/?push=recap' });
    }
  }
  // B relance : lundi 12h30 si récap non ouvert.
  function runRecapRelance() {
    const since = new Date(Date.now() - 3 * 86400000).toISOString();
    for (const c of subscribedChallengeClients()) {
      const rec = getDb().prepare("SELECT opened_at FROM nutrition_push_log WHERE client_email=? AND type='recap' AND sent_at>=? ORDER BY id DESC LIMIT 1").get(c.email, since);
      if (rec && !rec.opened_at) enqueue(c.email, 'recap', { title: 'Tu n\'as pas encore vu ta semaine 👀', body: 'Ton récap t\'attend.', url: '/nutrition/?push=recap' });
    }
  }
  // C : photos S3/S6 (+ relance 48h -> sinon alerte coach).
  function photosCountJalon(email, jalon) { try { return getDb().prepare('SELECT COUNT(*) n FROM nutrition_parcours_photos WHERE client_email=? AND jalon=?').get(email, jalon).n; } catch (_) { return 0; } }
  function runPhotos() {
    const H48 = 48 * 3600000;
    const JAL = [{ j: 's3', start: 14, end: 20, T: (p) => '📸 ' + p + ', c\'est la semaine du bilan mi-parcours !', B: 'Pense à tes photos avant ta pesée avec ton coach.' },
                 { j: 's6', start: 35, end: 41, T: (p) => '📸 Dernière ligne droite ' + p + ' !', B: 'Tes photos de fin de parcours pour voir le chemin parcouru.' }];
    for (const c of subscribedChallengeClients()) {
      const day = challengeDay(c.startDate); if (day == null) continue;
      const p = c.prenom || 'toi';
      for (const J of JAL) {
        const notifFlag = 'photo:' + J.j + ':notif', relFlag = 'photo:' + J.j + ':relance', alertFlag = 'photo:' + J.j + ':alert';
        const hasPhotos = photosCountJalon(c.email, J.j) > 0;
        const notifTs = getFlag(c.email, notifFlag);
        if (!notifTs) {
          if (day >= J.start && day <= J.end && !hasPhotos) { enqueue(c.email, 'photos', { title: J.T(p), body: J.B, url: '/nutrition/?push=photos&jalon=' + J.j }); setFlag(c.email, notifFlag); }
        } else if (!hasPhotos) {
          const relTs = getFlag(c.email, relFlag);
          if (!relTs) { if (Date.now() - Date.parse(notifTs) >= H48) { enqueue(c.email, 'photos', { title: 'Tes photos t\'attendent 📸', body: '2 minutes et c\'est fait.', url: '/nutrition/?push=photos&jalon=' + J.j }); setFlag(c.email, relFlag); } }
          else if (!getFlag(c.email, alertFlag)) {
            if (Date.now() - Date.parse(relTs) >= H48) {
              try { getDb().prepare('INSERT INTO nutrition_push_coach_alerts (coach_id, client_email, type, message, created_at) VALUES (?,?,?,?,?)').run(c.coachId, c.email, 'photos_' + J.j, (c.prenom || 'Ton client') + ' n\'a pas ajouté ses photos ' + (J.j === 's3' ? 'de mi-parcours' : 'de fin de parcours') + '.', new Date().toISOString()); } catch (_) { /* ignore */ }
              setFlag(c.email, alertFlag);
            }
          }
        }
      }
    }
  }
  // D : rappels de séance L/M/V 20h (rotation, si non validée, stop à 3/semaine).
  const SEANCE_VARIANTS = [
    (p) => ({ title: '💪 ' + (p || 'Hey') + ', ta séance d\'aujourd\'hui est faite ?', body: 'Valide-la dans l\'app !' }),
    () => ({ title: '🏋️ Pas encore bougé aujourd\'hui ?', body: 'Il n\'est pas trop tard.' }),
    (p) => ({ title: '✅ 2 minutes pour valider ta séance du jour' + (p ? ', ' + p : ''), body: 'On y va ?' }),
  ];
  function runSeanceReminders() {
    const todayYmd = parisYmd(); const weekStart = mondayYmdParis();
    for (const c of subscribedChallengeClients()) {
      let today = 0, week = 0;
      try { today = getDb().prepare('SELECT COUNT(*) n FROM nutrition_parcours_seances WHERE client_email=? AND date=?').get(c.email, todayYmd).n; } catch (_) { /* ignore */ }
      if (today > 0) continue;
      try { week = getDb().prepare('SELECT COUNT(*) n FROM nutrition_parcours_seances WHERE client_email=? AND date>=?').get(c.email, weekStart).n; } catch (_) { /* ignore */ }
      if (week >= 3) continue;
      let idx = 0;
      try { idx = getDb().prepare("SELECT COUNT(*) n FROM nutrition_push_log WHERE client_email=? AND type='seances'").get(c.email).n % SEANCE_VARIANTS.length; } catch (_) { /* ignore */ }
      const m = SEANCE_VARIANTS[idx](c.prenom);
      enqueue(c.email, 'seances', { title: m.title, body: m.body, url: '/nutrition/?push=seance' });
    }
  }
  // ---- Chemin du challenge : rappel MATIN (nœud actif) + rappel SOIR (flamme) ----
  // Ton bienveillant, jamais culpabilisant. Inertes si le flag challenge_path est OFF.
  function challengeActiveNode(email) {
    try {
      if (!challengeEngine.pathFeatureEnabled()) return null;
      if (challengeEngine.pathCurrentDay(email) <= 0) return null;
      const day = challengeEngine.pathActiveDay(email);
      if (day === null) return null; // === null : l'étape 0 (« Commencer ») est falsy
      const n = getDb().prepare('SELECT title FROM path_nodes WHERE day=?').get(day);
      return n ? { day, title: n.title } : null;
    } catch (_) { return null; }
  }
  // Matin 8h30 : rappel de l'étape du jour, formulé sur l'action.
  function runNoeudMatin() {
    for (const c of subscribedChallengeClients()) {
      const n = challengeActiveNode(c.email); if (!n) continue;
      const p = c.prenom || 'toi';
      enqueue(c.email, 'chemin', { title: '🎯 ' + p + ', ton étape du jour t\'attend', body: n.title, url: '/nutrition/?push=chemin' });
    }
  }
  // Soir 20h : si l'ebook du jour n'est pas ouvert -> « sauve ta flamme » (streak-critical -> bypassCap).
  function runFlammeSoir() {
    let today = ''; try { today = challengeYmd(); } catch (_) { today = parisParts().ymd; }
    for (const c of subscribedChallengeClients()) {
      try {
        if (!challengeEngine.pathFeatureEnabled()) break;
        const day = challengeEngine.pathCurrentDay(c.email); if (day <= 0) continue;
        const hasEbook = getDb().prepare('SELECT COUNT(*) n FROM nutrition_ebooks WHERE active=1 AND unlock_day<=?').get(day - 1).n;
        if (!hasEbook) continue; // aucun guide encore débloqué -> on ne culpabilise pas
        const opened = getDb().prepare('SELECT COUNT(*) n FROM user_ebook_opens WHERE client_email=? AND day_ymd=?').get(c.email, today).n;
        if (opened > 0) continue; // déjà lu aujourd'hui
        const p = c.prenom || 'toi';
        enqueue(c.email, 'chemin', { title: '🔥 Sauve ta flamme, ' + p, body: '2 min de lecture suffisent pour garder ta série.', url: '/nutrition/?push=chemin' }, { bypassCap: true });
      } catch (_) { /* client suivant */ }
    }
  }

  function runCrons() {
    try { if (cronDue('cheminMatin', 8, 30, null)) runNoeudMatin(); } catch (e) { console.warn('cron cheminMatin:', e && e.message); }
    try { if (cronDue('cheminFlamme', 20, 0, null)) runFlammeSoir(); } catch (e) { console.warn('cron cheminFlamme:', e && e.message); }
    try { if (cronDue('recap', 18, 0, ['Sun'])) runRecap(); } catch (e) { console.warn('cron recap:', e && e.message); }
    try { if (cronDue('recapRelance', 12, 30, ['Mon'])) runRecapRelance(); } catch (e) { console.warn('cron recapRelance:', e && e.message); }
    try { if (cronDue('photos', 9, 0, null)) runPhotos(); } catch (e) { console.warn('cron photos:', e && e.message); }
    try { if (cronDue('seances', 20, 0, ['Mon', 'Wed', 'Fri'])) runSeanceReminders(); } catch (e) { console.warn('cron seances:', e && e.message); }
  }

  let _tickBusy = false;
  async function tick() {
    if (_tickBusy) return; _tickBusy = true;
    try { runCrons(); await processQueue(); }
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

  return { notifyCoachMessage, enqueue, tick, getPrefs, isQuietHours, parisParts,
    _internal: { processQueue, next8h, runRecap, runRecapRelance, runPhotos, runSeanceReminders, weekState, subscribedChallengeClients, cronDue, getFlag, setFlag } };
};
