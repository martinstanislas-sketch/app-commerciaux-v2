// ═══════════════════════════════════════════════════════════════
// Coach Routes Module
//
// Toutes les routes coaching exposées sous /api/coach/*
// Utilise la DB unifiée (table_renames appliqués automatiquement
// dans les requêtes SQL via les références ci-dessous).
//
// Tables renommées (cf db.js):
//   daily_action_values → coach_daily_action_values
//   admin_notes         → coach_admin_notes
//   sessions            → coach_sessions
//
// Export: function mountCoachRoutes(app, getDb, sessions, mw)
//   - app: express app instance
//   - getDb: db getter from db.js
//   - sessions: shared in-memory session Map (auth.js)
//   - mw: { requireAuth, requireAdmin }
// ═══════════════════════════════════════════════════════════════

const path = require('path');

function generatePinFromName(name, existingPins) {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 4);
  if (!existingPins.includes(base)) return base;
  for (let i = 1; i < 100; i++) {
    const candidate = base.slice(0, 3) + i;
    if (!existingPins.includes(candidate)) return candidate;
  }
  return base + Math.floor(Math.random() * 1000);
}

module.exports = function mountCoachRoutes(app, getDb, sessions, mw) {
  const { requireAuth, requireAdmin } = mw;
  const crypto = require('crypto');

  // Helpers réutilisés depuis APP COACH ----------------------------
  function ensureMonthlyData(month) {
    const db = getDb();
    const coaches = db.prepare("SELECT id, start_month FROM coaches WHERE archived = 0 AND role = 'coach'").all();
    const insert = db.prepare('INSERT OR IGNORE INTO monthly_data (coach_id, month) VALUES (?, ?)');
    for (const coach of coaches) {
      if (coach.start_month && coach.start_month > month) continue;
      insert.run(coach.id, month);
    }
  }
  function generatePin(name, existingPins) { return generatePinFromName(name, existingPins); }
  function getCurrentMonth() { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`; }
  function getMonthRange(month) {
    const firstDay = month + '-01';
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(y, m, 0).toISOString().slice(0, 10);
    return { firstDay, lastDay };
  }
  const BELTS = [
    { id: 'white', name: 'Ceinture Blanche', min: 0, color: '#e2e8f0', emoji: '🤍' },
    { id: 'yellow', name: 'Ceinture Jaune', min: 20, color: '#fbbf24', emoji: '💛' },
    { id: 'orange', name: 'Ceinture Orange', min: 40, color: '#f97316', emoji: '🧡' },
    { id: 'green', name: 'Ceinture Verte', min: 60, color: '#22c55e', emoji: '💚' },
    { id: 'blue', name: 'Ceinture Bleue', min: 80, color: '#3b82f6', emoji: '💙' },
    { id: 'black', name: 'Ceinture Noire', min: 100, color: '#1e293b', emoji: '🖤' },
  ];
  function getBelt(pct) { return [...BELTS].reverse().find(b => pct >= b.min) || BELTS[0]; }
  function getISOWeek(date) {
    const d = new Date(date); d.setHours(0,0,0,0);
    d.setDate(d.getDate() + 3 - ((d.getDay()+6)%7));
    const w1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d - w1)/86400000 - 3 + ((w1.getDay()+6)%7))/7);
  }
  const XP_VALUES = { quiz_pass:100, quiz_perfect:50, quiz_fast:25, formation_validated:50, category_complete:200, streak_week:30 };
  function checkAndAwardBadges(db, coachId) {
    const formations = db.prepare('SELECT * FROM formations ORDER BY category').all();
    const validations = db.prepare("SELECT formation_id FROM formation_validations WHERE coach_id = ? AND status = 'validated'").all(coachId);
    const validatedIds = new Set(validations.map(v => v.formation_id));
    const categories = {};
    formations.forEach(f => { if (!categories[f.category]) categories[f.category]={total:0,validated:0}; categories[f.category].total++; if (validatedIds.has(f.id)) categories[f.category].validated++; });
    const newBadges = [];
    for (const [cat, data] of Object.entries(categories)) {
      if (data.total > 0 && data.validated === data.total) {
        const existing = db.prepare('SELECT id FROM coach_badges WHERE coach_id = ? AND badge_key = ?').get(coachId, cat);
        if (!existing) { db.prepare('INSERT INTO coach_badges (coach_id, badge_key) VALUES (?, ?)').run(coachId, cat); newBadges.push(cat); }
      }
    }
    return newBadges;
  }
  function updateStreak(db, coachId) {
    const now = new Date();
    const cw = `${now.getFullYear()}-${String(getISOWeek(now)).padStart(2,'0')}`;
    let s = db.prepare('SELECT * FROM coach_streaks WHERE coach_id = ?').get(coachId);
    if (!s) { db.prepare('INSERT INTO coach_streaks (coach_id, current_streak, best_streak, last_validation_week) VALUES (?, 1, 1, ?)').run(coachId, cw); return {current:1,best:1,isNew:true}; }
    if (s.last_validation_week === cw) return {current:s.current_streak,best:s.best_streak,isNew:false};
    let ns;
    if (s.last_validation_week) {
      const [ly, lw] = s.last_validation_week.split('-').map(Number);
      const [cy, cwn] = cw.split('-').map(Number);
      ns = ((cy===ly && cwn===lw+1) || (cy===ly+1 && lw>=52 && cwn===1)) ? s.current_streak+1 : 1;
    } else ns = 1;
    const best = Math.max(ns, s.best_streak);
    db.prepare('UPDATE coach_streaks SET current_streak=?, best_streak=?, last_validation_week=? WHERE coach_id=?').run(ns, best, cw, coachId);
    return {current:ns, best, isNew:false};
  }
  function addXP(db, coachId, amount, reason, refId) {
    db.prepare('INSERT INTO xp_log (coach_id, amount, reason, ref_id) VALUES (?, ?, ?, ?)').run(coachId, amount, reason, refId || null);
  }
  function sessionGet(t) { return sessions.get(t); }
  function sessionSet(t, d) { sessions.set(t, d); }
  function sessionDel(t) { sessions.delete(t); }

  // Middlewares additionnels ---------------------------------------
  function requireFormationAdmin(req, res, next) {
    if (!req.session || (req.session.role !== 'admin' && req.session.role !== 'academy')) return res.status(403).json({error:'Accès non autorisé'});
    next();
  }
  function requireCalendarManager(req, res, next) {
    const s = req.session;
    if (!s) return res.status(403).json({error:'Accès non autorisé'});
    if (s.role === 'admin' || s.role === 'academy' || s.role === 'director' || s.is_leader) return next();
    return res.status(403).json({error:'Accès non autorisé'});
  }
  function requireFormationView(req, res, next) {
    if (!req.session || !['admin','academy','director'].includes(req.session.role)) return res.status(403).json({error:'Accès non autorisé'});
    next();
  }
  function requireDirectorOrAdmin(req, res, next) {
    if (!req.session || (req.session.role !== 'admin' && req.session.role !== 'director')) return res.status(403).json({error:'Accès non autorisé'});
    next();
  }
  function requireLeaderOrDirector(req, res, next) {
    const s = req.session;
    if (!s) return res.status(403).json({error:'Accès non autorisé'});
    if (s.role === 'admin' || s.role === 'director' || s.is_leader) return next();
    return res.status(403).json({error:'Accès non autorisé'});
  }

// ─── GET /api/coaches ───────────────────────────────────────
app.get('/api/coach/coaches', requireAuth, (req, res) => {
  const db = getDb();
  const coaches = db.prepare('SELECT * FROM coaches WHERE archived = 0 ORDER BY id').all();
  res.json(coaches);
});

// ─── POST /api/coaches (admin only) ─────────────────────────
app.post('/api/coach/coaches', requireAuth, requireAdmin, (req, res) => {
  const { name, studio, start_month, is_leader } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Le nom est requis' });
  }
  const trimmedName = name.trim();
  const db = getDb();

  const existing = db.prepare('SELECT id FROM coaches WHERE LOWER(name) = LOWER(?)').get(trimmedName);
  if (existing) return res.status(409).json({ error: 'Ce nom existe déjà' });

  const allPins = db.prepare('SELECT pin FROM coaches WHERE pin IS NOT NULL').all().map(r => r.pin);
  const pin = generatePin(trimmedName, allPins);

  const result = db.prepare('INSERT INTO coaches (name, pin, studio, start_month, is_leader) VALUES (?, ?, ?, ?, ?)').run(
    trimmedName, pin, studio || '', start_month || null, is_leader ? 1 : 0
  );
  const newCoach = db.prepare('SELECT * FROM coaches WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(newCoach);
});

// ─── PATCH /api/coaches/:id (admin — update coach) ──────────
app.patch('/api/coach/coaches/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const coachId = parseInt(req.params.id);
  const { is_leader, in_accompagnement, studio, name, pin, role } = req.body;

  const coach = db.prepare('SELECT * FROM coaches WHERE id = ?').get(coachId);
  if (!coach) return res.status(404).json({ error: 'Coach introuvable' });

  const sets = [];
  const params = [];

  if (is_leader !== undefined) {
    sets.push('is_leader = ?');
    params.push(is_leader ? 1 : 0);
  }
  if (in_accompagnement !== undefined) {
    sets.push('in_accompagnement = ?');
    params.push(in_accompagnement ? 1 : 0);
  }
  if (studio !== undefined) {
    sets.push('studio = ?');
    params.push(studio);
  }
  if (name !== undefined && name.trim()) {
    sets.push('name = ?');
    params.push(name.trim());
  }
  if (pin !== undefined && pin.trim()) {
    // Check PIN uniqueness
    const existing = db.prepare('SELECT id FROM coaches WHERE pin = ? AND id != ?').get(pin.trim().toLowerCase(), coachId);
    if (existing) return res.status(409).json({ error: 'Ce PIN est déjà utilisé' });
    sets.push('pin = ?');
    params.push(pin.trim().toLowerCase());
  }
  if (role !== undefined && ['coach', 'admin'].includes(role)) {
    sets.push('role = ?');
    params.push(role);
  }

  if (sets.length > 0) {
    params.push(coachId);
    db.prepare(`UPDATE coaches SET ${sets.join(', ')} WHERE id = ?`).run(...params);

    // Update active sessions for this coach
    for (const [token, session] of sessions.entries()) {
      if (session.coach_id === coachId) {
        const updated = db.prepare('SELECT * FROM coaches WHERE id = ?').get(coachId);
        session.name = updated.name;
        session.role = updated.role;
      }
    }
  }

  const updated = db.prepare('SELECT * FROM coaches WHERE id = ?').get(coachId);
  res.json(updated);
});

// ─── DELETE /api/coaches/:id (admin only — soft delete) ─────
app.delete('/api/coach/coaches/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const coachId = parseInt(req.params.id);
  const coach = db.prepare('SELECT * FROM coaches WHERE id = ?').get(coachId);
  if (!coach) return res.status(404).json({ error: 'Coach non trouvé' });

  db.prepare('UPDATE coaches SET archived = 1 WHERE id = ?').run(coachId);
  res.json({ ok: true, archived: true });
});

// ─── Daily Actions: Values ──────────────────────────────────
app.get('/api/coach/daily-actions/values/:coach_id/:date', requireAuth, (req, res) => {
  const db = getDb();
  const values = db.prepare(
    'SELECT * FROM coach_daily_action_values WHERE coach_id = ? AND date = ?'
  ).all(req.params.coach_id, req.params.date);
  res.json(values);
});

app.put('/api/coach/daily-actions/values/:coach_id/:date', requireAuth, (req, res) => {
  const db = getDb();
  const { action_key, value, text_value } = req.body;
  if (!action_key) return res.status(400).json({ error: 'action_key requis' });

  db.prepare(`
    INSERT INTO coach_daily_action_values (coach_id, action_key, date, value, text_value)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(coach_id, action_key, date) DO UPDATE SET value = excluded.value, text_value = excluded.text_value
  `).run(req.params.coach_id, action_key, req.params.date, value || 0, text_value || '');

  res.json({ ok: true });
});

// ─── Monthly Data (Admin KPIs) ──────────────────────────────
app.get('/api/coach/months/:month/data/:coach_id', requireAuth, (req, res) => {
  const db = getDb();
  const { month, coach_id } = req.params;
  ensureMonthlyData(month);

  const data = db.prepare(`
    SELECT md.*, c.name as coach_name, c.studio
    FROM monthly_data md
    JOIN coaches c ON c.id = md.coach_id
    WHERE md.month = ? AND md.coach_id = ?
  `).get(month, coach_id);

  if (!data) return res.status(404).json({ error: 'Données non trouvées' });
  res.json(data);
});

app.put('/api/coach/months/:month/data/:coach_id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { month, coach_id } = req.params;
  const data = req.body;

  ensureMonthlyData(month);

  const allowedFields = [
    'taux_resiliation', 'taux_non_frequentants', 'nb_adherents',
    'chiffre_affaires', 'nouveaux_clients', 'taux_occupation',
    'taux_contribution', 'depenses', 'commentaire_manager'
  ];

  const sets = [];
  const params = [];
  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      sets.push(`${field} = ?`);
      params.push(data[field]);
    }
  }

  if (sets.length === 0) return res.status(400).json({ error: 'Aucun champ à mettre à jour' });

  sets.push("updated_at = datetime('now','localtime')");
  params.push(month, coach_id);

  db.prepare(`UPDATE monthly_data SET ${sets.join(', ')} WHERE month = ? AND coach_id = ?`).run(...params);
  res.json({ success: true });
});

// ─── Director : saisie CA + Dépenses par club ───────────────
app.put('/api/coach/director/studio-data/:month', requireAuth, (req, res) => {
  const s = req.session;
  if (!s || (s.role !== 'admin' && s.role !== 'director')) {
    return res.status(403).json({ error: 'Accès non autorisé' });
  }
  const { month } = req.params;
  const { club, chiffre_affaires, depenses, taux_resiliation, taux_occupation, nb_adherents, taux_non_frequentants, nouveaux_clients, les_sa } = req.body;
  if (!club) return res.status(400).json({ error: 'Club requis' });

  const db = getDb();
  const leader = db.prepare(
    "SELECT id FROM coaches WHERE studio = ? AND is_leader = 1 AND archived = 0 LIMIT 1"
  ).get(club);
  if (!leader) return res.status(404).json({ error: `Aucun leader pour ${club}` });

  ensureMonthlyData(month);

  const sets = [];
  const params = [];
  const ca      = chiffre_affaires       !== undefined ? parseFloat(chiffre_affaires)       : null;
  const dep     = depenses               !== undefined ? parseFloat(depenses)               : null;
  const resil   = taux_resiliation       !== undefined ? parseFloat(taux_resiliation)       : null;
  const occup   = taux_occupation        !== undefined ? parseFloat(taux_occupation)        : null;
  const adher   = nb_adherents           !== undefined ? parseFloat(nb_adherents)           : null;
  const nonFreq = taux_non_frequentants  !== undefined ? parseFloat(taux_non_frequentants)  : null;
  const nv      = nouveaux_clients       !== undefined ? parseFloat(nouveaux_clients)       : null;

  if (ca      !== null && !isNaN(ca))      { sets.push('chiffre_affaires = ?');       params.push(ca); }
  if (dep     !== null && !isNaN(dep))     { sets.push('depenses = ?');               params.push(dep); }
  if (resil   !== null && !isNaN(resil))   { sets.push('taux_resiliation = ?');       params.push(resil); }
  if (occup   !== null && !isNaN(occup))   { sets.push('taux_occupation = ?');        params.push(occup); }
  if (adher   !== null && !isNaN(adher))   { sets.push('nb_adherents = ?');           params.push(adher); }
  if (nonFreq !== null && !isNaN(nonFreq)) { sets.push('taux_non_frequentants = ?');  params.push(nonFreq); }
  if (nv      !== null && !isNaN(nv))      { sets.push('nouveaux_clients = ?');       params.push(nv); }
  if (les_sa !== undefined)               { sets.push('les_sa = ?');                 params.push(String(les_sa || '')); }

  // Recalcul automatique de la contribution
  if (ca !== null && dep !== null && ca > 0) {
    const caHT   = ca / 1.2;
    const contrib = parseFloat(((caHT - dep) / caHT * 100).toFixed(1));
    sets.push('taux_contribution = ?');
    params.push(contrib);
  }

  if (sets.length === 0) return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
  sets.push("updated_at = datetime('now','localtime')");
  params.push(month, leader.id);

  db.prepare(`UPDATE monthly_data SET ${sets.join(', ')} WHERE month = ? AND coach_id = ?`).run(...params);
  res.json({ ok: true });
});

// ─── Club Daily Action (Action clé du jour) ─────────────────
app.get('/api/coach/club-daily-action/:studio', requireAuth, (req, res) => {
  const db = getDb();
  const studio = decodeURIComponent(req.params.studio);
  const row = db.prepare('SELECT action_text, updated_at FROM club_daily_action WHERE studio = ?').get(studio);
  res.json({ action: row?.action_text || null, updated_at: row?.updated_at || null });
});

app.put('/api/coach/club-daily-action/:studio', requireAuth, (req, res) => {
  const s = req.session;
  if (!s) return res.status(401).json({ error: 'Non autorisé' });
  const db = getDb();
  const studio = decodeURIComponent(req.params.studio);
  const { action_text } = req.body;

  // Vérification : leader du club, admin ou director
  if (s.role !== 'admin' && s.role !== 'director') {
    const coach = db.prepare('SELECT is_leader, studio FROM coaches WHERE id = ? AND archived = 0').get(s.coach_id);
    if (!coach || !coach.is_leader || coach.studio !== studio) {
      return res.status(403).json({ error: 'Accès réservé au leader du club' });
    }
  }

  if (!action_text || !action_text.trim()) {
    db.prepare('DELETE FROM club_daily_action WHERE studio = ?').run(studio);
    return res.json({ ok: true, deleted: true });
  }

  db.prepare(`
    INSERT INTO club_daily_action (studio, action_text, updated_at)
    VALUES (?, ?, datetime('now','localtime'))
    ON CONFLICT(studio) DO UPDATE SET action_text = excluded.action_text, updated_at = excluded.updated_at
  `).run(studio, action_text.trim());
  res.json({ ok: true });
});

// ─── Resiliation Members ────────────────────────────────────
app.get('/api/coach/months/:month/resiliations/:coach_id', requireAuth, (req, res) => {
  const db = getDb();
  const { month, coach_id } = req.params;
  const members = db.prepare('SELECT * FROM resiliation_members WHERE month = ? AND coach_id = ? ORDER BY id').all(month, coach_id);
  res.json({ members });
});

app.post('/api/coach/months/:month/resiliations/:coach_id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { month, coach_id } = req.params;
  const { member_name } = req.body;
  if (!member_name || !member_name.trim()) return res.status(400).json({ error: 'Nom requis' });

  const result = db.prepare('INSERT INTO resiliation_members (coach_id, month, member_name) VALUES (?, ?, ?)').run(coach_id, month, member_name.trim());

  // Update count in monthly_data
  const count = db.prepare('SELECT COUNT(*) as c FROM resiliation_members WHERE month = ? AND coach_id = ?').get(month, coach_id);
  ensureMonthlyData(month);
  db.prepare('UPDATE monthly_data SET taux_resiliation = ?, updated_at = datetime(\'now\',\'localtime\') WHERE month = ? AND coach_id = ?').run(count.c, month, coach_id);

  res.json({ id: result.lastInsertRowid, member_name: member_name.trim() });
});

app.delete('/api/coach/months/:month/resiliations/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { month, id } = req.params;

  const member = db.prepare('SELECT * FROM resiliation_members WHERE id = ?').get(id);
  if (!member) return res.status(404).json({ error: 'Non trouvé' });

  db.prepare('DELETE FROM resiliation_members WHERE id = ?').run(id);

  // Update count
  const count = db.prepare('SELECT COUNT(*) as c FROM resiliation_members WHERE month = ? AND coach_id = ?').get(member.month, member.coach_id);
  db.prepare('UPDATE monthly_data SET taux_resiliation = ?, updated_at = datetime(\'now\',\'localtime\') WHERE month = ? AND coach_id = ?').run(count.c, member.month, member.coach_id);

  res.json({ ok: true });
});

// ─── Non Frequentant Members ────────────────────────────────
app.get('/api/coach/months/:month/non-frequentants/:coach_id', requireAuth, (req, res) => {
  const db = getDb();
  const { month, coach_id } = req.params;
  const members = db.prepare('SELECT * FROM non_frequentant_members WHERE month = ? AND coach_id = ? ORDER BY id').all(month, coach_id);
  res.json({ members });
});

app.post('/api/coach/months/:month/non-frequentants/:coach_id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { month, coach_id } = req.params;
  const { member_name } = req.body;
  if (!member_name || !member_name.trim()) return res.status(400).json({ error: 'Nom requis' });

  const result = db.prepare('INSERT INTO non_frequentant_members (coach_id, month, member_name) VALUES (?, ?, ?)').run(coach_id, month, member_name.trim());

  const count = db.prepare('SELECT COUNT(*) as c FROM non_frequentant_members WHERE month = ? AND coach_id = ?').get(month, coach_id);
  ensureMonthlyData(month);
  db.prepare("UPDATE monthly_data SET taux_non_frequentants = ?, updated_at = datetime('now','localtime') WHERE month = ? AND coach_id = ?").run(count.c, month, coach_id);

  res.json({ id: result.lastInsertRowid, member_name: member_name.trim() });
});

app.delete('/api/coach/months/:month/non-frequentants/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { month, id } = req.params;

  const member = db.prepare('SELECT * FROM non_frequentant_members WHERE id = ?').get(id);
  if (!member) return res.status(404).json({ error: 'Non trouvé' });

  db.prepare('DELETE FROM non_frequentant_members WHERE id = ?').run(id);

  const count = db.prepare('SELECT COUNT(*) as c FROM non_frequentant_members WHERE month = ? AND coach_id = ?').get(member.month, member.coach_id);
  db.prepare("UPDATE monthly_data SET taux_non_frequentants = ?, updated_at = datetime('now','localtime') WHERE month = ? AND coach_id = ?").run(count.c, member.month, member.coach_id);

  res.json({ ok: true });
});

// ─── Nouveaux Clients Members ───────────────────────────────
app.get('/api/coach/months/:month/nouveaux-clients/:coach_id', requireAuth, (req, res) => {
  const db = getDb();
  const members = db.prepare('SELECT * FROM nouveaux_clients_members WHERE month = ? AND coach_id = ? ORDER BY id').all(req.params.month, req.params.coach_id);
  res.json({ members });
});

app.post('/api/coach/months/:month/nouveaux-clients/:coach_id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { month, coach_id } = req.params;
  const { member_name } = req.body;
  if (!member_name || !member_name.trim()) return res.status(400).json({ error: 'Nom requis' });

  const result = db.prepare('INSERT INTO nouveaux_clients_members (coach_id, month, member_name) VALUES (?, ?, ?)').run(coach_id, month, member_name.trim());
  const count = db.prepare('SELECT COUNT(*) as c FROM nouveaux_clients_members WHERE month = ? AND coach_id = ?').get(month, coach_id);
  ensureMonthlyData(month);
  db.prepare("UPDATE monthly_data SET nouveaux_clients = ?, updated_at = datetime('now','localtime') WHERE month = ? AND coach_id = ?").run(count.c, month, coach_id);

  res.json({ id: result.lastInsertRowid, member_name: member_name.trim() });
});

app.delete('/api/coach/months/:month/nouveaux-clients/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const member = db.prepare('SELECT * FROM nouveaux_clients_members WHERE id = ?').get(req.params.id);
  if (!member) return res.status(404).json({ error: 'Non trouvé' });

  db.prepare('DELETE FROM nouveaux_clients_members WHERE id = ?').run(req.params.id);
  const count = db.prepare('SELECT COUNT(*) as c FROM nouveaux_clients_members WHERE month = ? AND coach_id = ?').get(member.month, member.coach_id);
  db.prepare("UPDATE monthly_data SET nouveaux_clients = ?, updated_at = datetime('now','localtime') WHERE month = ? AND coach_id = ?").run(count.c, member.month, member.coach_id);

  res.json({ ok: true });
});

// ─── All Studios Summary ────────────────────────────────────
app.get('/api/coach/months/:month/studios-summary', requireAuth, (req, res) => {
  const db = getDb();
  const month = req.params.month;
  const clubs = ['Wasquehal', 'Lille', 'Marcq', 'Boulogne', 'Neuilly', 'Levallois', 'Paris 15', 'Veigné', 'Tours', 'Nice', 'Valence', 'Caen'];

  const summary = clubs.map(club => {
    // Find the leader for this club (or first coach) to get monthly data
    const leader = db.prepare("SELECT id FROM coaches WHERE studio = ? AND is_leader = 1 AND archived = 0 LIMIT 1").get(club);
    const refCoach = leader || db.prepare("SELECT id FROM coaches WHERE studio = ? AND archived = 0 LIMIT 1").get(club);

    if (!refCoach) {
      return { club, chiffre_affaires: null, taux_resiliation: null, nb_adherents: null, taux_occupation: null };
    }

    const md = db.prepare('SELECT chiffre_affaires, taux_occupation, nb_adherents, taux_resiliation FROM monthly_data WHERE month = ? AND coach_id = ?').get(month, refCoach.id);

    return {
      club,
      chiffre_affaires: md?.chiffre_affaires ?? null,
      taux_resiliation: md?.taux_resiliation ?? null,
      nb_adherents: md?.nb_adherents ?? null,
      taux_occupation: md?.taux_occupation ?? null,
    };
  });

  res.json({ studios: summary });
});

// ─── CA Objectifs par club par mois ─────────────────────────
const CA_OBJECTIFS = {
  'Wasquehal':  { '2025-10': 19714, '2025-11': 19952, '2025-12': 18549, '2026-01': 17600, '2026-02': 16147, '2026-03': 16720 },
  'Lille':      { '2025-10': 20510, '2025-11': 22862, '2025-12': 20848, '2026-01': 19800, '2026-02': 17838, '2026-03': 18700 },
  'Boulogne':   { '2025-10': 35842, '2025-11': 37042, '2025-12': 37505, '2026-01': 29150, '2026-02': 26500, '2026-03': 29700 },
  'Marcq':      { '2025-10': 16395, '2025-11': 17164, '2025-12': 18288, '2026-01': 16500, '2026-02': 15566, '2026-03': 16720 },
  'Neuilly':    { '2025-10': 26803, '2025-11': 28526, '2025-12': 26396, '2026-01': 23650, '2026-02': 21116, '2026-03': 23650 },
  'Levallois':  { '2025-10': 26173, '2025-11': 26188, '2025-12': 26982, '2026-01': 24200, '2026-02': 21607, '2026-03': 24750 },
};

// ─── CA Global History (all studios combined, 6 months relative to given month) ───
app.get('/api/coach/ca-history', requireAuth, (req, res) => {
  const db = getDb();
  const baseMonth = req.query.month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const [by, bm] = baseMonth.split('-').map(Number);
  const clubs = ['Wasquehal', 'Lille', 'Marcq', 'Boulogne', 'Neuilly', 'Levallois', 'Paris 15', 'Veigné', 'Tours', 'Nice', 'Valence', 'Caen'];

  // Build 6 months ending at baseMonth
  const monthsList = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(by, bm - 1 - i, 1);
    monthsList.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const history = monthsList.map(m => {
    let totalCA = 0;
    let totalObj = 0;
    let hasData = false;
    let hasObj = false;
    const perClub = {};
    const perClubObj = {};
    // Load DB objectives for this month (overrides hardcoded)
    const dbObjRows = db.prepare('SELECT club, objectif FROM ca_objectifs WHERE month = ?').all(m);
    const dbObjMap = {};
    for (const row of dbObjRows) dbObjMap[row.club] = row.objectif;
    for (const club of clubs) {
      const leader = db.prepare("SELECT id FROM coaches WHERE studio = ? AND is_leader = 1 AND archived = 0 LIMIT 1").get(club);
      const refCoach = leader || db.prepare("SELECT id FROM coaches WHERE studio = ? AND archived = 0 LIMIT 1").get(club);
      if (!refCoach) { perClub[club] = null; perClubObj[club] = null; continue; }
      const md = db.prepare('SELECT chiffre_affaires FROM monthly_data WHERE month = ? AND coach_id = ?').get(m, refCoach.id);
      const ca = md?.chiffre_affaires ?? null;
      perClub[club] = ca;
      if (ca !== null) { totalCA += ca; hasData = true; }
      // Objectif : DB first, then hardcoded fallback
      const obj = dbObjMap[club] !== undefined ? dbObjMap[club] : (CA_OBJECTIFS[club]?.[m] ?? null);
      perClubObj[club] = obj;
      if (obj !== null) { totalObj += obj; hasObj = true; }
    }
    return { month: m, total: hasData ? totalCA : null, totalObjectif: hasObj ? totalObj : null, clubs: perClub, objectifs: perClubObj };
  });

  res.json({ months: history });
});

// ─── CA Objectifs endpoint (for studios table) ─────────────
app.get('/api/coach/ca-objectifs/:month', requireAuth, (req, res) => {
  const db = getDb();
  const month = req.params.month;
  const clubs = ['Wasquehal', 'Lille', 'Marcq', 'Boulogne', 'Neuilly', 'Levallois', 'Paris 15', 'Veigné', 'Tours', 'Nice', 'Valence', 'Caen'];
  const result = {};
  // Lire d'abord la table ca_objectifs, fallback sur CA_OBJECTIFS hardcodé
  const dbRows = db.prepare('SELECT club, objectif FROM ca_objectifs WHERE month = ?').all(month);
  const dbMap = {};
  for (const row of dbRows) dbMap[row.club] = row.objectif;
  for (const club of clubs) {
    result[club] = dbMap[club] !== undefined ? dbMap[club] : (CA_OBJECTIFS[club]?.[month] ?? null);
  }
  res.json({ objectifs: result });
});

app.put('/api/coach/ca-objectifs/:month', requireAuth, (req, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const db = getDb();
  const month = req.params.month;
  const objectifs = req.body;
  // Body can be flat { club: value } (legacy) or { club: { objectif, objectif_min } }
  const upsert = db.prepare(`
    INSERT INTO ca_objectifs (club, month, objectif, objectif_min)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(club, month) DO UPDATE SET
      objectif     = COALESCE(excluded.objectif, objectif),
      objectif_min = COALESCE(excluded.objectif_min, objectif_min)
  `);
  const tx = db.transaction(() => {
    for (const [club, val] of Object.entries(objectifs)) {
      if (val !== null && val !== undefined && val !== '') {
        if (typeof val === 'object') {
          const obj    = (val.objectif     !== '' && val.objectif     != null) ? parseFloat(val.objectif)     : null;
          const objMin = (val.objectif_min !== '' && val.objectif_min != null) ? parseFloat(val.objectif_min) : null;
          if (obj !== null || objMin !== null) upsert.run(club, month, obj, objMin);
        } else {
          upsert.run(club, month, parseFloat(val), null);
        }
      }
    }
  });
  tx();
  res.json({ ok: true });
});

// ─── DATA Tab : full stats for 6 main studios ───────────────
app.get('/api/coach/data-tab/:month', requireAuth, (req, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const db = getDb();
  const month = req.params.month;
  const MAIN_CLUBS = ['Wasquehal', 'Lille', 'Marcq', 'Boulogne', 'Neuilly', 'Levallois'];

  // Load objectifs
  const objRows = db.prepare('SELECT club, objectif, objectif_min FROM ca_objectifs WHERE month = ?').all(month);
  const objMap = {};
  const objMinMap = {};
  for (const row of objRows) { objMap[row.club] = row.objectif; objMinMap[row.club] = row.objectif_min; }

  const studios = MAIN_CLUBS.map(club => {
    const leader = db.prepare("SELECT id FROM coaches WHERE studio = ? AND is_leader = 1 AND archived = 0 LIMIT 1").get(club)
                || db.prepare("SELECT id FROM coaches WHERE studio = ? AND archived = 0 LIMIT 1").get(club);

    const empty = { club, chiffre_affaires: null, depenses: null, taux_resiliation: null,
                    taux_non_frequentants: null, nouveaux_clients: null,
                    nb_adherents: null, taux_occupation: null,
                    objectif: objMap[club] ?? (CA_OBJECTIFS[club]?.[month] ?? null),
                    objectif_min: objMinMap[club] ?? null };
    if (!leader) return empty;

    ensureMonthlyData(month);
    const md = db.prepare(`SELECT chiffre_affaires, depenses, taux_resiliation, taux_non_frequentants,
                            nouveaux_clients, nb_adherents, taux_occupation
                            FROM monthly_data WHERE month = ? AND coach_id = ?`).get(month, leader.id);
    // Nouveaux : lire depuis le slot permanent _nouveaux (pas le mois courant)
    const nvRow = db.prepare('SELECT les_sa FROM monthly_data WHERE coach_id = ? AND month = ?').get(leader.id, NV_MONTH);
    const nvEntries = filterNouveaux30j(parseNouveaux(nvRow?.les_sa));
    return {
      club,
      chiffre_affaires:      md?.chiffre_affaires      ?? null,
      depenses:              md?.depenses              ?? null,
      taux_resiliation:      md?.taux_resiliation      ?? null,
      taux_non_frequentants: md?.taux_non_frequentants ?? null,
      nouveaux_clients:      md?.nouveaux_clients      ?? null,
      nb_adherents:          md?.nb_adherents          ?? null,
      taux_occupation:       md?.taux_occupation       ?? null,
      les_sa:                JSON.stringify(nvEntries),
      objectif:     objMap[club]    ?? (CA_OBJECTIFS[club]?.[month] ?? null),
      objectif_min: objMinMap[club] ?? null,
    };
  });

  res.json({ month, studios });
});

// ─── Club History (6 months) ────────────────────────────────
app.get('/api/coach/club-history/:club', requireAuth, (req, res) => {
  const db = getDb();
  const club = req.params.club;

  // Get leader coach for this club (reference for club data)
  const leader = db.prepare("SELECT id FROM coaches WHERE studio = ? AND is_leader = 1 AND archived = 0 LIMIT 1").get(club);
  const refCoach = leader || db.prepare("SELECT id FROM coaches WHERE studio = ? AND archived = 0 LIMIT 1").get(club);
  if (!refCoach) return res.json({ months: [] });

  // Get last 6 months
  const now = new Date();
  const monthsList = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthsList.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const history = monthsList.map(m => {
    const md = db.prepare('SELECT * FROM monthly_data WHERE month = ? AND coach_id = ?').get(m, refCoach.id);
    const resilCount = db.prepare('SELECT COUNT(*) as c FROM resiliation_members WHERE month = ? AND coach_id = ?').get(m, refCoach.id);
    const nfCount = db.prepare('SELECT COUNT(*) as c FROM non_frequentant_members WHERE month = ? AND coach_id = ?').get(m, refCoach.id);
    const ncCount = db.prepare('SELECT COUNT(*) as c FROM nouveaux_clients_members WHERE month = ? AND coach_id = ?').get(m, refCoach.id);

    return {
      month: m,
      resiliations: resilCount?.c || 0,
      non_frequentants: nfCount?.c || 0,
      nouveaux_clients: ncCount?.c || 0,
      nb_adherents: md?.nb_adherents ?? null,
      chiffre_affaires: md?.chiffre_affaires ?? null,
      taux_occupation: md?.taux_occupation ?? null,
    };
  });

  res.json({ months: history });
});

// ─── Dashboard (Admin) ──────────────────────────────────────
app.get('/api/coach/months/:month/dashboard', requireAuth, (req, res) => {
  const db = getDb();
  const month = req.params.month;
  ensureMonthlyData(month);

  const { firstDay, lastDay } = getMonthRange(month);

  const coaches = db.prepare("SELECT * FROM coaches WHERE archived = 0 AND role = 'coach' ORDER BY id").all();

  const dashboard = coaches.map(coach => {
    const md = db.prepare('SELECT * FROM monthly_data WHERE month = ? AND coach_id = ?').get(month, coach.id);

    // Daily action totals
    const dailyTotals = db.prepare(`
      SELECT action_key, SUM(value) as total, COUNT(DISTINCT date) as days
      FROM coach_daily_action_values
      WHERE coach_id = ? AND date >= ? AND date <= ? AND value > 0
      GROUP BY action_key
    `).all(coach.id, firstDay, lastDay);

    const totals = {};
    const daysCounts = {};
    dailyTotals.forEach(d => {
      totals[d.action_key] = d.total;
      daysCounts[d.action_key] = d.days;
    });

    // Count active days
    const activeDays = db.prepare(`
      SELECT COUNT(DISTINCT date) as count
      FROM coach_daily_action_values
      WHERE coach_id = ? AND date >= ? AND date <= ? AND value > 0
    `).get(coach.id, firstDay, lastDay);

    // Energy average
    const energyAvg = db.prepare(`
      SELECT AVG(value) as avg FROM coach_daily_action_values
      WHERE coach_id = ? AND date >= ? AND date <= ? AND action_key = 'energie' AND value > 0
    `).get(coach.id, firstDay, lastDay);

    return {
      coach_id: coach.id,
      coach_name: coach.name,
      studio: coach.studio,
      is_leader: coach.is_leader ? true : false,
      month,
      taux_resiliation: md?.taux_resiliation ?? null,
      taux_non_frequentants: md?.taux_non_frequentants ?? null,
      nb_adherents: md?.nb_adherents ?? null,
      commentaire_manager: md?.commentaire_manager ?? '',
      totals,
      days: daysCounts,
      energy_avg: energyAvg?.avg ? Math.round(energyAvg.avg * 10) / 10 : null,
      active_days: activeDays?.count || 0,
    };
  });

  res.json({ month, coaches: dashboard });
});

// ─── Pilotage club (leader only) ────────────────────────────
app.get('/api/coach/pilotage/:studio/:month', requireAuth, (req, res) => {
  const db = getDb();
  const studio = decodeURIComponent(req.params.studio);
  const month = req.params.month;
  const { firstDay, lastDay } = getMonthRange(month);

  const coaches = db.prepare(
    "SELECT id, name, is_leader FROM coaches WHERE studio = ? AND archived = 0 AND role = 'coach' ORDER BY is_leader DESC, name ASC"
  ).all(studio);

  if (coaches.length === 0) {
    return res.json({ studio, month, coaches: [], club_totals: {}, club_ess_completion: null,
      total_active_coach_days: 0, expected_coach_days: 0, days_in_month: 30, days_elapsed: 0, days_remaining: 0 });
  }

  // Days info
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const now = new Date();
  const isCurrentMonth = now.getFullYear() === y && (now.getMonth() + 1) === m;
  const daysElapsed = isCurrentMonth ? now.getDate() : daysInMonth;
  const daysRemaining = isCurrentMonth ? daysInMonth - now.getDate() : 0;

  const coachIds = coaches.map(c => c.id);
  const ph = coachIds.map(() => '?').join(',');

  // Club-level totals
  const clubRows = db.prepare(`
    SELECT action_key, SUM(value) as total
    FROM coach_daily_action_values
    WHERE coach_id IN (${ph}) AND date >= ? AND date <= ? AND value > 0
    GROUP BY action_key
  `).all(...coachIds, firstDay, lastDay);

  const club_totals = {};
  clubRows.forEach(r => { club_totals[r.action_key] = r.total; });

  // Per-coach breakdown
  const coachBreakdown = coaches.map(coach => {
    const rows = db.prepare(`
      SELECT action_key, SUM(value) as total
      FROM coach_daily_action_values
      WHERE coach_id = ? AND date >= ? AND date <= ? AND value > 0
      GROUP BY action_key
    `).all(coach.id, firstDay, lastDay);

    const totals = {};
    rows.forEach(r => { totals[r.action_key] = r.total; });

    const activeDays = db.prepare(`
      SELECT COUNT(DISTINCT date) as cnt FROM coach_daily_action_values
      WHERE coach_id = ? AND date >= ? AND date <= ? AND value > 0
    `).get(coach.id, firstDay, lastDay)?.cnt || 0;

    const essChecked = db.prepare(`
      SELECT COUNT(*) as cnt FROM coach_daily_action_values
      WHERE coach_id = ? AND date >= ? AND date <= ?
        AND action_key IN ('check_club','story','fichier_client','cr_journee') AND value > 0
    `).get(coach.id, firstDay, lastDay)?.cnt || 0;

    const ess_completion = activeDays > 0 ? Math.round(essChecked / (activeDays * 4) * 100) : null;

    return { id: coach.id, name: coach.name, is_leader: coach.is_leader, active_days: activeDays, totals, ess_completion };
  });

  // Club ess completion
  const totalActiveDays = coachBreakdown.reduce((s, c) => s + c.active_days, 0);
  const expectedCoachDays = daysElapsed * coaches.length;

  const totalEssChecked = db.prepare(`
    SELECT COUNT(*) as cnt FROM coach_daily_action_values
    WHERE coach_id IN (${ph}) AND date >= ? AND date <= ?
      AND action_key IN ('check_club','story','fichier_client','cr_journee') AND value > 0
  `).get(...coachIds, firstDay, lastDay)?.cnt || 0;

  const club_ess_completion = totalActiveDays > 0 ? Math.round(totalEssChecked / (totalActiveDays * 4) * 100) : null;

  res.json({
    studio, month,
    coaches: coachBreakdown,
    club_totals,
    club_ess_completion,
    total_active_coach_days: totalActiveDays,
    expected_coach_days: expectedCoachDays,
    days_in_month: daysInMonth,
    days_elapsed: daysElapsed,
    days_remaining: daysRemaining,
  });
});

// ─── Academy : taux coachs opérationnels ────────────────────
app.get('/api/coach/academy/operational-rate', requireAuth, (req, res) => {
  const db = getDb();
  const studioFilter = req.query.studio || null;

  // Modules essentiels
  const essModules = db.prepare("SELECT id, name FROM formations WHERE category = 'essentielles' ORDER BY name").all();
  const totalEss = essModules.length;

  if (totalEss === 0) {
    return res.json({ total_coaches: 0, operational_coaches: 0, rate: null, essentielles_count: 0, coaches: [], studios: [], blocking_modules: [] });
  }

  // Coachs actifs
  let coachQuery = "SELECT id, name, studio FROM coaches WHERE archived = 0 AND role = 'coach'";
  const coachParams = [];
  if (studioFilter) { coachQuery += " AND studio = ?"; coachParams.push(studioFilter); }
  coachQuery += " ORDER BY studio, name";
  const coaches = db.prepare(coachQuery).all(...coachParams);

  // Pour chaque coach : statut par module essentiel
  const coachDetails = coaches.map(coach => {
    const validations = db.prepare(
      "SELECT formation_id, status FROM formation_validations WHERE coach_id = ? AND formation_id IN (" + essModules.map(()=>'?').join(',') + ")"
    ).all(coach.id, ...essModules.map(m => m.id));

    const valMap = {};
    validations.forEach(v => { valMap[v.formation_id] = v.status; });

    const missing = [];
    let validatedCount = 0;
    for (const mod of essModules) {
      const st = valMap[mod.id] || null;
      if (st === 'validated') { validatedCount++; }
      else { missing.push({ id: mod.id, name: mod.name, status: st }); }
    }

    return {
      id: coach.id,
      name: coach.name,
      studio: coach.studio || '—',
      validated: validatedCount,
      total: totalEss,
      operational: validatedCount === totalEss,
      missing,
    };
  });

  const operationalCount = coachDetails.filter(c => c.operational).length;
  const rate = coaches.length > 0 ? Math.round(operationalCount / coaches.length * 100) : null;

  // Par studio
  const studioMap = {};
  coachDetails.forEach(c => {
    const s = c.studio;
    if (!studioMap[s]) studioMap[s] = { name: s, total: 0, operational: 0 };
    studioMap[s].total++;
    if (c.operational) studioMap[s].operational++;
  });
  const studios = Object.values(studioMap)
    .map(s => ({ ...s, rate: s.total > 0 ? Math.round(s.operational / s.total * 100) : 0 }))
    .sort((a, b) => a.rate - b.rate);

  // Modules les plus bloquants
  const blockingModules = essModules.map(mod => {
    const vals = db.prepare(
      "SELECT status FROM formation_validations WHERE formation_id = ? AND coach_id IN (" + coaches.map(()=>'?').join(',') + ")"
    ).all(mod.id, ...coaches.map(c => c.id));

    const valStatuses = vals.map(v => v.status);
    const validatedCoaches = valStatuses.filter(s => s === 'validated').length;
    const pendingCoaches   = valStatuses.filter(s => s === 'pending').length;
    const inProgressCoaches = valStatuses.filter(s => s === 'in_progress').length;
    const notStarted = coaches.length - vals.length;
    const blockedTotal = coaches.length - validatedCoaches;

    return {
      id: mod.id, name: mod.name,
      blocked: blockedTotal,
      validated: validatedCoaches,
      pending: pendingCoaches,
      in_progress: inProgressCoaches,
      not_started: notStarted,
    };
  }).sort((a, b) => b.blocked - a.blocked);

  res.json({
    total_coaches: coaches.length,
    operational_coaches: operationalCount,
    rate,
    essentielles_count: totalEss,
    coaches: coachDetails,
    studios,
    blocking_modules: blockingModules,
  });
});

// ─── Cockpit Réseau (Directeur) ──────────────────────────────
app.get('/api/coach/cockpit/:month', requireAuth, (req, res) => {
  const db = getDb();
  const month = req.params.month;
  const prev = (() => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  const { firstDay, lastDay } = getMonthRange(month);
  const { firstDay: prevFirst, lastDay: prevLast } = getMonthRange(prev);

  const clubs = ['Wasquehal', 'Lille', 'Marcq', 'Boulogne', 'Neuilly', 'Levallois', 'Paris 15', 'Veigné', 'Tours', 'Nice', 'Valence', 'Caen'];

  const studios = clubs.map(club => {
    // Find leader or first coach
    const leader = db.prepare("SELECT id, name FROM coaches WHERE studio = ? AND is_leader = 1 AND archived = 0 LIMIT 1").get(club);
    const refCoach = leader || db.prepare("SELECT id, name FROM coaches WHERE studio = ? AND archived = 0 AND role = 'coach' LIMIT 1").get(club);
    if (!refCoach) return { name: club, no_data: true };

    const md = db.prepare('SELECT chiffre_affaires, depenses, taux_resiliation, taux_non_frequentants, nb_adherents, taux_occupation, taux_contribution FROM monthly_data WHERE month = ? AND coach_id = ?').get(month, refCoach.id);
    const mdPrev = db.prepare('SELECT chiffre_affaires, depenses, taux_resiliation, taux_non_frequentants, nb_adherents, taux_occupation, taux_contribution FROM monthly_data WHERE month = ? AND coach_id = ?').get(prev, refCoach.id);

    // CA objectif from DB then fallback
    const objRow = db.prepare("SELECT objectif FROM ca_objectifs WHERE club = ? AND month = ?").get(club, month);
    const objPrevRow = db.prepare("SELECT objectif FROM ca_objectifs WHERE club = ? AND month = ?").get(club, prev);
    const caObjectif = objRow?.objectif ?? null;
    const caPrevObjectif = objPrevRow?.objectif ?? null;

    // Daily stats for all coaches in this club
    const allCoaches = db.prepare("SELECT id FROM coaches WHERE studio = ? AND archived = 0 AND role = 'coach'").all(club);
    let fichier_quality = null, team_quality = null, story_rate = null;
    if (allCoaches.length > 0) {
      const ids = allCoaches.map(c => c.id);
      const ph = ids.map(() => '?').join(',');
      const daily = db.prepare(`
        SELECT
          COUNT(DISTINCT date) as active_days,
          SUM(CASE WHEN action_key='fichier_client' AND value>0 THEN 1 ELSE 0 END) as fichier_c,
          SUM(CASE WHEN action_key='cr_journee' AND value>0 THEN 1 ELSE 0 END) as cr_c,
          SUM(CASE WHEN action_key='story' AND value>0 THEN 1 ELSE 0 END) as story_c,
          SUM(CASE WHEN action_key='check_club' AND value>0 THEN 1 ELSE 0 END) as check_c
        FROM coach_daily_action_values
        WHERE coach_id IN (${ph}) AND date >= ? AND date <= ?
      `).get(...ids, firstDay, lastDay);
      const ad = daily?.active_days || 0;
      if (ad > 0) {
        fichier_quality = Math.round((daily.fichier_c || 0) / ad * 100);
        team_quality = Math.round((daily.cr_c || 0) / ad * 100);
        story_rate = Math.round((daily.story_c || 0) / ad * 100);
      }
    }

    const nfRate = (md?.taux_non_frequentants != null && md?.nb_adherents > 0)
      ? parseFloat((md.taux_non_frequentants / md.nb_adherents * 100).toFixed(1)) : null;
    const nfRatePrev = (mdPrev?.taux_non_frequentants != null && mdPrev?.nb_adherents > 0)
      ? parseFloat((mdPrev.taux_non_frequentants / mdPrev.nb_adherents * 100).toFixed(1)) : null;

    const caAchievement = (md?.chiffre_affaires != null && caObjectif > 0)
      ? parseFloat((md.chiffre_affaires / caObjectif * 100).toFixed(1)) : null;

    // eclat = taux_occupation if available, else (story_rate + check_club rate) / 2
    const eclat = md?.taux_occupation ?? (story_rate !== null ? story_rate : null);

    return {
      name: club,
      leader_id: refCoach.id,
      leader_name: refCoach.name,
      taux_contribution: md?.taux_contribution ?? null,
      ca: md?.chiffre_affaires ?? null,
      depenses: md?.depenses ?? null,
      ca_objectif: caObjectif,
      ca_achievement: caAchievement,
      taux_resiliation: md?.taux_resiliation ?? null,
      nf_count: md?.taux_non_frequentants ?? null,
      nb_adherents: md?.nb_adherents ?? null,
      nf_rate: nfRate,
      taux_occupation: md?.taux_occupation ?? null,
      fichier_quality,
      team_quality,
      eclat_score: eclat,
      prev: {
        taux_contribution: mdPrev?.taux_contribution ?? null,
        ca: mdPrev?.chiffre_affaires ?? null,
        ca_objectif: caPrevObjectif,
        taux_resiliation: mdPrev?.taux_resiliation ?? null,
        nf_rate: nfRatePrev,
        taux_occupation: mdPrev?.taux_occupation ?? null,
      }
    };
  });

  res.json({ month, prev_month: prev, studios });
});

// ─── Badges (comparatifs entre coachs) ──────────────────────
app.get('/api/coach/months/:month/badges', requireAuth, (req, res) => {
  const db = getDb();
  const month = req.params.month;
  const { firstDay, lastDay } = getMonthRange(month);

  const coaches = db.prepare("SELECT id, name FROM coaches WHERE archived = 0 AND role = 'coach' ORDER BY id").all();

  if (coaches.length === 0) return res.json({ badges: [] });

  const stats = coaches.map(coach => {
    const dailyTotals = db.prepare(`
      SELECT action_key, SUM(value) as total, COUNT(DISTINCT date) as days
      FROM coach_daily_action_values
      WHERE coach_id = ? AND date >= ? AND date <= ? AND value > 0
      GROUP BY action_key
    `).all(coach.id, firstDay, lastDay);

    const totals = {};
    const daysCounts = {};
    dailyTotals.forEach(d => {
      totals[d.action_key] = d.total;
      daysCounts[d.action_key] = d.days;
    });

    // Count active days
    const activeDays = db.prepare(`
      SELECT COUNT(DISTINCT date) as count
      FROM coach_daily_action_values
      WHERE coach_id = ? AND date >= ? AND date <= ? AND value > 0
    `).get(coach.id, firstDay, lastDay);

    // Count total expected actions per active day (4 actions: story, check_club, fichier_client, cr_journee)
    const totalExpected = (activeDays?.count || 0) * 4;
    const totalDone = (daysCounts['story'] || 0) + (daysCounts['check_club'] || 0) +
                      (daysCounts['fichier_client'] || 0) + (daysCounts['cr_journee'] || 0);
    const manquements = totalExpected > 0 ? totalExpected - totalDone : 999;

    // Non-fréquentants : get from monthly_data
    const md = db.prepare('SELECT taux_non_frequentants FROM monthly_data WHERE month = ? AND coach_id = ?').get(month, coach.id);

    return {
      coach_id: coach.id,
      coach_name: coach.name,
      references: totals['references'] || 0,
      avis_google: totals['avis_google'] || 0,
      temoignages: totals['temoignages'] || 0,
      surpack: totals['surpack'] || 0,
      taux_non_frequentants: md?.taux_non_frequentants ?? null,
      story_days: daysCounts['story'] || 0,
      manquements,
      active_days: activeDays?.count || 0,
    };
  });

  // Compute badges — always show all 5, with winner or "Aucun"
  const badges = [];

  // 1. Chasseur de Référence
  const bestRef = [...stats].filter(s => s.references > 0).sort((a, b) => b.references - a.references);
  badges.push(bestRef.length > 0
    ? { type: 'referent', icon: '🎯', label: 'Chasseur de Référence', desc: 'Le plus de prises de référence ce mois', coach_id: bestRef[0].coach_id, coach_name: bestRef[0].coach_name, value: bestRef[0].references + ' références' }
    : { type: 'referent', icon: '🎯', label: 'Chasseur de Référence', desc: 'Le plus de prises de référence ce mois', coach_id: null, coach_name: 'Aucun', value: '0 référence' });

  // 2. Star des Avis
  const bestAvis = [...stats].filter(s => s.avis_google > 0).sort((a, b) => b.avis_google - a.avis_google);
  badges.push(bestAvis.length > 0
    ? { type: 'avis', icon: '🌟', label: 'Star des Avis', desc: 'Le record d\'avis Google récoltés ce mois', coach_id: bestAvis[0].coach_id, coach_name: bestAvis[0].coach_name, value: bestAvis[0].avis_google + ' avis' }
    : { type: 'avis', icon: '🌟', label: 'Star des Avis', desc: 'Le record d\'avis Google récoltés ce mois', coach_id: null, coach_name: 'Aucun', value: '0 avis' });

  // 2b. Voix d'Or
  const bestTemo = [...stats].filter(s => s.temoignages > 0).sort((a, b) => b.temoignages - a.temoignages);
  badges.push(bestTemo.length > 0
    ? { type: 'temoignages', icon: '🎙️', label: 'Voix d\'Or', desc: 'Le plus de témoignages membres obtenus ce mois', coach_id: bestTemo[0].coach_id, coach_name: bestTemo[0].coach_name, value: bestTemo[0].temoignages + ' témoignages' }
    : { type: 'temoignages', icon: '🎙️', label: 'Voix d\'Or', desc: 'Le plus de témoignages membres obtenus ce mois', coach_id: null, coach_name: 'Aucun', value: '0 témoignage' });

  // 3. Coach Irréprochable (least manquements, must have active days)
  const bestRigoureux = [...stats].filter(s => s.active_days > 0).sort((a, b) => a.manquements - b.manquements);
  badges.push(bestRigoureux.length > 0
    ? { type: 'rigoureux', icon: '🔥', label: 'Coach Irréprochable', desc: 'Zéro faute sur les actions quotidiennes ce mois', coach_id: bestRigoureux[0].coach_id, coach_name: bestRigoureux[0].coach_name, value: bestRigoureux[0].manquements + ' manquements' }
    : { type: 'rigoureux', icon: '🔥', label: 'Coach Irréprochable', desc: 'Zéro faute sur les actions quotidiennes ce mois', coach_id: null, coach_name: 'Aucun', value: '—' });

  // 4. Roi du Surpack
  const bestSurpack = [...stats].filter(s => s.surpack > 0).sort((a, b) => b.surpack - a.surpack);
  badges.push(bestSurpack.length > 0
    ? { type: 'surpack', icon: '💎', label: 'Roi du Surpack', desc: 'Le plus de chiffre Surpack généré ce mois', coach_id: bestSurpack[0].coach_id, coach_name: bestSurpack[0].coach_name, value: bestSurpack[0].surpack + ' €' }
    : { type: 'surpack', icon: '💎', label: 'Roi du Surpack', desc: 'Le plus de chiffre Surpack généré ce mois', coach_id: null, coach_name: 'Aucun', value: '0 €' });

  // 5. Gardien du Club (le moins de non-fréquentants)
  const bestNF = [...stats].filter(s => s.taux_non_frequentants !== null).sort((a, b) => a.taux_non_frequentants - b.taux_non_frequentants);
  badges.push(bestNF.length > 0
    ? { type: 'nf', icon: '🛡️', label: 'Gardien du Club', desc: 'Le plus faible taux de non-fréquentants ce mois', coach_id: bestNF[0].coach_id, coach_name: bestNF[0].coach_name, value: bestNF[0].taux_non_frequentants + ' NF' }
    : { type: 'nf', icon: '🛡️', label: 'Gardien du Club', desc: 'Le plus faible taux de non-fréquentants ce mois', coach_id: null, coach_name: 'Aucun', value: '—' });

  res.json({ badges, stats });
});

// ─── Recap (Coach view) ────────────────────────────────────
app.get('/api/coach/months/:month/recap/:coach_id', requireAuth, (req, res) => {
  const db = getDb();
  const { month, coach_id } = req.params;
  ensureMonthlyData(month);

  const { firstDay, lastDay } = getMonthRange(month);

  const md = db.prepare(`
    SELECT md.*, c.name as coach_name, c.studio
    FROM monthly_data md
    JOIN coaches c ON c.id = md.coach_id
    WHERE md.month = ? AND md.coach_id = ?
  `).get(month, coach_id);

  const coach = db.prepare('SELECT * FROM coaches WHERE id = ?').get(coach_id);

  // Daily action totals
  const dailyTotals = db.prepare(`
    SELECT action_key, SUM(value) as total, COUNT(DISTINCT date) as days
    FROM coach_daily_action_values
    WHERE coach_id = ? AND date >= ? AND date <= ? AND value > 0
    GROUP BY action_key
  `).all(coach_id, firstDay, lastDay);

  const totals = {};
  const daysCounts = {};
  dailyTotals.forEach(d => {
    totals[d.action_key] = d.total;
    daysCounts[d.action_key] = d.days;
  });

  const activeDays = db.prepare(`
    SELECT COUNT(DISTINCT date) as count
    FROM coach_daily_action_values
    WHERE coach_id = ? AND date >= ? AND date <= ? AND value > 0
  `).get(coach_id, firstDay, lastDay);

  const energyAvg = db.prepare(`
    SELECT AVG(value) as avg FROM coach_daily_action_values
    WHERE coach_id = ? AND date >= ? AND date <= ? AND action_key = 'energie' AND value > 0
  `).get(coach_id, firstDay, lastDay);

  // Comptes réels depuis les tables de noms — agrégés au niveau STUDIO
  // (les données sont stockées sous le coach_id du leader, pas forcément du coach consulté)
  const studioName = coach?.studio;
  function countByStudio(table, m, studio, fallbackCoachId) {
    if (studio) {
      return db.prepare(`
        SELECT COUNT(*) as c FROM ${table} nm
        JOIN coaches cc ON cc.id = nm.coach_id
        WHERE nm.month = ? AND cc.studio = ?
      `).get(m, studio)?.c ?? 0;
    }
    return db.prepare(`SELECT COUNT(*) as c FROM ${table} WHERE month = ? AND coach_id = ?`).get(m, fallbackCoachId)?.c ?? 0;
  }

  const nfCount    = countByStudio('non_frequentant_members',    month, studioName, coach_id);
  const ncCount    = countByStudio('nouveaux_clients_members',   month, studioName, coach_id) || null;
  const resilCount = countByStudio('resiliation_members',        month, studioName, coach_id) || null;

  // ── Mois précédent (M-1) ─────────────────────────────────
  const [y, m] = month.split('-').map(Number);
  const prevDate = new Date(y, m - 2, 1); // m-2 car mois JS est 0-indexed
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

  const mdPrev = db.prepare(
    'SELECT taux_occupation, nb_adherents FROM monthly_data WHERE month = ? AND coach_id = ?'
  ).get(prevMonth, coach_id);

  const nfPrev    = countByStudio('non_frequentant_members',  prevMonth, studioName, coach_id) || null;
  const resilPrev = countByStudio('resiliation_members',       prevMonth, studioName, coach_id) || null;
  const ncPrev    = countByStudio('nouveaux_clients_members',  prevMonth, studioName, coach_id) || null;

  // Objectif CA du mois pour le studio du leader
  const studioForObj = md?.studio || coach?.studio || null;
  const objCaRow = studioForObj
    ? db.prepare('SELECT objectif FROM ca_objectifs WHERE club = ? AND month = ?').get(studioForObj, month)
    : null;
  const objectif_ca = objCaRow?.objectif ?? null;

  res.json({
    coach_name: md?.coach_name || coach?.name || 'Coach',
    studio: md?.studio || coach?.studio || '',
    month,
    is_leader: coach?.is_leader ? true : false,
    taux_resiliation: resilCount !== null ? resilCount : (md?.taux_resiliation ?? null),
    taux_non_frequentants: nfCount,
    nb_adherents: md?.nb_adherents ?? null,
    chiffre_affaires: md?.chiffre_affaires ?? null,
    nouveaux_clients: ncCount !== null ? ncCount : (md?.nouveaux_clients ?? null),
    taux_occupation: md?.taux_occupation ?? null,
    objectif_ca,
    totals,
    days: daysCounts,
    active_days: activeDays?.count || 0,
    energy_avg: energyAvg?.avg ? Math.round(energyAvg.avg * 10) / 10 : null,
    prev: {
      month: prevMonth,
      taux_resiliation: resilPrev,
      taux_non_frequentants: nfPrev,
      nouveaux_clients: ncPrev,
      taux_occupation: mdPrev?.taux_occupation ?? null,
      nb_adherents: mdPrev?.nb_adherents ?? null,
    },
  });
});

// ─── Formations / Validation ────────────────────────────────
app.get('/api/coach/formations', requireAuth, (req, res) => {
  const db = getDb();
  const formations = db.prepare('SELECT * FROM formations ORDER BY sort_order ASC, id ASC').all();
  res.json({ formations });
});

app.post('/api/coach/formations', requireAuth, requireFormationAdmin, (req, res) => {
  const db = getDb();
  const { name, category, description, video_url } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nom requis' });
  const validCats = ['essentielles', 'signature', 'expertise', 'leadership', 'management', 'leader_coach'];
  const cat = validCats.includes(category) ? category : 'essentielles';
  const nextOrder = db.prepare("SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM formations WHERE category=?").get(cat).n;
  const info = db.prepare(
    "INSERT INTO formations (name, category, description, video_url, sort_order, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now','localtime'))"
  ).run(name.trim(), cat, (description||'').trim(), (video_url||'').trim(), nextOrder);
  const formation = db.prepare('SELECT * FROM formations WHERE id = ?').get(info.lastInsertRowid);
  res.json(formation);
});

app.delete('/api/coach/formations/:id', requireAuth, requireFormationAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM formation_validations WHERE formation_id = ?').run(req.params.id);
  db.prepare('DELETE FROM formations WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Update formation content (admin only)
app.patch('/api/coach/formations/:id', requireAuth, requireFormationAdmin, (req, res) => {
  const db = getDb();
  const f = db.prepare('SELECT * FROM formations WHERE id = ?').get(req.params.id);
  if (!f) return res.status(404).json({ error: 'Formation introuvable' });
  const name = req.body.name !== undefined ? req.body.name.trim() : f.name;
  const description = req.body.description !== undefined ? req.body.description : (f.description || '');
  const video_url = req.body.video_url !== undefined ? req.body.video_url.trim() : (f.video_url || '');
  if (!name) return res.status(400).json({ error: 'Nom requis' });
  db.prepare("UPDATE formations SET name = ?, description = ?, video_url = ?, updated_at = datetime('now','localtime') WHERE id = ?")
    .run(name, description, video_url, req.params.id);
  res.json(db.prepare('SELECT * FROM formations WHERE id = ?').get(req.params.id));
});

// Reorder formation (up/down within category) or move to another category
app.patch('/api/coach/formations/:id/reorder', requireAuth, requireFormationAdmin, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const { direction, category: newCategory } = req.body;
  const f = db.prepare('SELECT * FROM formations WHERE id = ?').get(id);
  if (!f) return res.status(404).json({ error: 'Formation introuvable' });

  if (newCategory) {
    // Move to a different category
    const validCats = ['essentielles', 'signature', 'expertise', 'leadership'];
    if (!validCats.includes(newCategory)) return res.status(400).json({ error: 'Catégorie invalide' });
    const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM formations WHERE category=?").get(newCategory).n;
    db.prepare("UPDATE formations SET category = ?, sort_order = ?, updated_at = datetime('now','localtime') WHERE id = ?")
      .run(newCategory, maxOrder, id);
  } else if (direction === 'up' || direction === 'down') {
    // Swap sort_order with adjacent item in same category
    const all = db.prepare('SELECT id, sort_order FROM formations WHERE category = ? ORDER BY sort_order ASC, id ASC').all(f.category);
    const idx = all.findIndex(r => r.id === id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= all.length) return res.json({ ok: true }); // already at edge
    const other = all[swapIdx];
    const tmpOrder = f.sort_order;
    db.prepare("UPDATE formations SET sort_order = ? WHERE id = ?").run(other.sort_order, id);
    db.prepare("UPDATE formations SET sort_order = ? WHERE id = ?").run(tmpOrder, other.id);
  } else {
    return res.status(400).json({ error: 'Paramètre manquant: direction ou category' });
  }
  res.json({ ok: true });
});

// All coaches formation progress (for Parcours tab — admin + academy)
app.get('/api/coach/formations/coaches-progress', requireAuth, requireFormationView, (req, res) => {
  const db = getDb();
  const totalRow = db.prepare('SELECT COUNT(*) as n FROM formations').get();
  const total = totalRow.n;

  const coachList = db.prepare('SELECT * FROM coaches WHERE archived = 0 ORDER BY studio, name').all();

  const result = coachList.map(coach => {
    const validatedCount = db.prepare("SELECT COUNT(*) as n FROM formation_validations fv JOIN formations f ON f.id = fv.formation_id WHERE fv.coach_id = ? AND fv.status = 'validated'").get(coach.id).n;
    const pendingCount   = db.prepare("SELECT COUNT(*) as n FROM formation_validations fv JOIN formations f ON f.id = fv.formation_id WHERE fv.coach_id = ? AND fv.status = 'pending'").get(coach.id).n;
    const quizPassed     = db.prepare("SELECT COUNT(DISTINCT qr.formation_id) as n FROM quiz_results qr JOIN formations f ON f.id = qr.formation_id WHERE qr.coach_id = ? AND qr.passed = 1").get(coach.id).n;
    const pct  = total > 0 ? Math.min(100, Math.round((validatedCount / total) * 100)) : 0;
    const belt = getBelt(pct);
    return { id: coach.id, name: coach.name, studio: coach.studio, is_leader: coach.is_leader === 1,
             validated: validatedCount, pending: pendingCount, quizPassed, total, pct, belt };
  });

  res.json({ coaches: result, total });
});

// All pending validations (admin + academy) — QCM passed but not yet validated
app.get('/api/coach/formations/pending-validations', requireAuth, requireFormationAdmin, (req, res) => {
  const db = getDb();

  const rows = db.prepare(`
    SELECT
      fv.coach_id,
      fv.formation_id,
      c.name  AS coach_name,
      c.studio,
      f.name  AS formation_name,
      f.category,
      ROUND(MAX(CAST(qr.score AS REAL) / CAST(qr.total AS REAL) * 100)) AS best_pct,
      MAX(qr.taken_at) AS last_quiz_at
    FROM formation_validations fv
    JOIN coaches    c  ON c.id = fv.coach_id AND c.archived = 0
    JOIN formations f  ON f.id = fv.formation_id
    JOIN quiz_results qr
         ON qr.formation_id = fv.formation_id
        AND qr.coach_id     = fv.coach_id
        AND qr.passed       = 1
    WHERE fv.status = 'pending'
    GROUP BY fv.coach_id, fv.formation_id
    ORDER BY c.studio, c.name, f.category, f.name
  `).all();

  res.json({ pending: rows });
});

// Studio progress overview (for coach leaders and admins)
app.get('/api/coach/formations/studio-progress/:studio', requireAuth, (req, res) => {
  const db = getDb();
  const studio = req.params.studio;

  // Auth: admin, academy, or leader of this studio
  if (req.session.role !== 'admin' && req.session.role !== 'academy') {
    const requesterId = req.session.coachId;
    const requester = db.prepare('SELECT * FROM coaches WHERE id = ?').get(requesterId);
    if (!requester || !requester.is_leader || requester.studio !== studio) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
  }

  const totalRow = db.prepare('SELECT COUNT(*) as n FROM formations').get();
  const total = totalRow.n;

  const coachList = db.prepare('SELECT * FROM coaches WHERE studio = ? AND archived = 0 ORDER BY is_leader DESC, name').all(studio);

  const result = coachList.map(coach => {
    const validatedCount = db.prepare("SELECT COUNT(*) as n FROM formation_validations fv JOIN formations f ON f.id = fv.formation_id WHERE fv.coach_id = ? AND fv.status = 'validated'").get(coach.id).n;
    const pendingCount = db.prepare("SELECT COUNT(*) as n FROM formation_validations fv JOIN formations f ON f.id = fv.formation_id WHERE fv.coach_id = ? AND fv.status = 'pending'").get(coach.id).n;
    const quizPassedCount = db.prepare("SELECT COUNT(DISTINCT qr.formation_id) as n FROM quiz_results qr JOIN formations f ON f.id = qr.formation_id WHERE qr.coach_id = ? AND qr.passed = 1").get(coach.id).n;
    const pct = total > 0 ? Math.min(100, Math.round((validatedCount / total) * 100)) : 0;
    const belt = getBelt(pct);
    return {
      id: coach.id,
      name: coach.name,
      is_leader: coach.is_leader === 1,
      validated: validatedCount,
      pending: pendingCount,
      quizPassed: quizPassedCount,
      total,
      pct,
      belt,
    };
  });

  res.json({ coaches: result, studio, total });
});

// Get validations for a coach
app.get('/api/coach/formations/validations/:coach_id', requireAuth, (req, res) => {
  const db = getDb();
  const coachId = parseInt(req.params.coach_id);
  const formations = db.prepare('SELECT * FROM formations ORDER BY category, id').all();
  const validations = db.prepare('SELECT * FROM formation_validations WHERE coach_id = ?').all(coachId);
  const valMap = {};
  validations.forEach(v => { valMap[v.formation_id] = v; });

  // Check which formations the coach has passed the quiz for
  const quizPassed = db.prepare('SELECT DISTINCT formation_id FROM quiz_results WHERE coach_id = ? AND passed = 1').all(coachId);
  const quizPassedSet = new Set(quizPassed.map(r => r.formation_id));

  const result = formations.map(f => ({
    ...f,
    status: valMap[f.id]?.status || 'pending',
    validated_at: valMap[f.id]?.validated_at || null,
    comment: valMap[f.id]?.comment || null,
    quiz_passed: quizPassedSet.has(f.id),
  }));

  const total = result.length;
  const validated = result.filter(f => f.status === 'validated').length;
  const pct = total > 0 ? Math.min(100, Math.round((validated / total) * 100)) : 0;
  const belt = getBelt(pct);
  const xpRow = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM xp_log WHERE coach_id = ?').get(coachId);
  const badges = db.prepare('SELECT * FROM coach_badges WHERE coach_id = ? ORDER BY unlocked_at').all(coachId);
  const streakRow = db.prepare('SELECT * FROM coach_streaks WHERE coach_id = ?').get(coachId);
  const bestScores = db.prepare('SELECT formation_id, MAX(CAST(score AS REAL) / CAST(total AS REAL) * 100) as best_pct FROM quiz_results WHERE coach_id = ? AND passed = 1 GROUP BY formation_id').all(coachId);
  const bestScoreMap = {};
  bestScores.forEach(r => { bestScoreMap[r.formation_id] = Math.round(r.best_pct); });

  res.json({
    formations: result,
    pct, total, validated,
    belt,
    xp: xpRow.total,
    badges: badges.map(b => b.badge_key),
    streak: streakRow ? { current: streakRow.current_streak, best: streakRow.best_streak } : { current: 0, best: 0 },
    bestScores: bestScoreMap
  });
});

// Admin / Academy sets validation status for a coach
app.put('/api/coach/formations/validations/:coach_id/:formation_id', requireAuth, requireFormationAdmin, (req, res) => {
  const db = getDb();
  const { coach_id, formation_id } = req.params;
  const { status, comment } = req.body; // 'validated', 'failed', 'pending' + optional comment
  const validStatuses = ['validated', 'failed', 'pending'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Statut invalide' });

  const validatedAt = status === 'validated' ? new Date().toISOString().slice(0, 10) : null;
  const commentVal = (comment && comment.trim()) ? comment.trim() : null;

  db.prepare(`
    INSERT INTO formation_validations (formation_id, coach_id, status, validated_at, comment)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(formation_id, coach_id)
    DO UPDATE SET status = excluded.status, validated_at = excluded.validated_at, comment = excluded.comment
  `).run(parseInt(formation_id), parseInt(coach_id), status, validatedAt, commentVal);

  if (status === 'validated') {
    const cId = parseInt(coach_id);
    const fId = parseInt(formation_id);
    const insertXP = db.prepare('INSERT INTO xp_log (coach_id, amount, reason, ref_id) VALUES (?, ?, ?, ?)');

    // XP for formation validated
    insertXP.run(cId, XP_VALUES.formation_validated, 'formation_validated', fId);

    // Check category complete
    const formation = db.prepare('SELECT category, name FROM formations WHERE id = ?').get(fId);
    if (formation) {
      const catFormations = db.prepare('SELECT id FROM formations WHERE category = ?').all(formation.category);
      const catValidated = db.prepare(`SELECT COUNT(*) as c FROM formation_validations WHERE coach_id = ? AND status = 'validated' AND formation_id IN (${catFormations.map(f => f.id).join(',') || '0'})`).get(cId);
      if (catValidated.c === catFormations.length) {
        insertXP.run(cId, XP_VALUES.category_complete, 'category_complete', fId);
      }
    }

    // Belt check — post message if belt changes
    const allFormations = db.prepare('SELECT id FROM formations').all();
    const allValidated = db.prepare("SELECT COUNT(*) as c FROM formation_validations fv JOIN formations f ON f.id = fv.formation_id WHERE fv.coach_id = ? AND fv.status = 'validated'").get(cId);
    const newPct = allFormations.length > 0 ? Math.min(100, Math.round((allValidated.c / allFormations.length) * 100)) : 0;
    const oldPct = allFormations.length > 0 ? Math.min(100, Math.round(((allValidated.c - 1) / allFormations.length) * 100)) : 0;
    const newBelt = getBelt(newPct);
    const oldBelt = getBelt(oldPct);
    if (newBelt.id !== oldBelt.id) {
      const coach = db.prepare('SELECT name FROM coaches WHERE id = ?').get(cId);
      db.prepare("INSERT INTO community_messages (coach_id, type, content, is_cr, is_system) VALUES (?, 'text', ?, 0, 1)")
        .run(cId, `🥋 ${coach?.name || 'Coach'} passe ${newBelt.name} ! (${newPct}% de formations validées)`);
    }

    // Badges + streak
    const newBadges = checkAndAwardBadges(db, cId);
    if (newBadges.length > 0) {
      const CATEGORY_BADGES = {
        essentielles: { name: 'Fondations', emoji: '🏗️' },
        signature: { name: 'Signature', emoji: '✍️' },
        expertise: { name: 'Expert', emoji: '🧠' },
        leadership: { name: 'Leadership', emoji: '👑' },
        management: { name: 'Management', emoji: '📋' },
        leader_coach: { name: 'Leader Certifié', emoji: '🏅' },
      };
      const coach = db.prepare('SELECT name, studio FROM coaches WHERE id = ?').get(cId);
      const coachStudio = coach?.studio || null;
      for (const badgeKey of newBadges) {
        const badge = CATEGORY_BADGES[badgeKey];
        if (badge) {
          db.prepare("INSERT INTO community_messages (coach_id, type, content, is_cr, is_system, target_club) VALUES (?, 'text', ?, 0, 1, ?)")
            .run(cId, `🏆 ${coach?.name || 'Coach'} débloque le badge ${badge.emoji} ${badge.name} !`, coachStudio);
        }
      }
    }
    updateStreak(db, cId);
  }

  res.json({ ok: true });
});

// ─── Quiz ───────────────────────────────────────────────────
// Get questions for a formation
app.get('/api/coach/quiz/:formation_id/questions', requireAuth, (req, res) => {
  const db = getDb();
  const questions = db.prepare('SELECT * FROM quiz_questions WHERE formation_id = ? ORDER BY id').all(req.params.formation_id);
  res.json({ questions });
});

// Add question (admin + academy)
app.post('/api/coach/quiz/:formation_id/questions', requireAuth, requireFormationAdmin, (req, res) => {
  const db = getDb();
  const { question, option_a, option_b, option_c, option_d, correct_answer, explanation } = req.body;
  if (!question || !option_a || !option_b || !option_c || !option_d) {
    return res.status(400).json({ error: 'Tous les champs sont requis' });
  }
  const valid = ['a', 'b', 'c', 'd'];
  const answer = valid.includes(correct_answer) ? correct_answer : 'a';

  const info = db.prepare(`
    INSERT INTO quiz_questions (formation_id, question, option_a, option_b, option_c, option_d, correct_answer, explanation)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.formation_id, question, option_a, option_b, option_c, option_d, answer, explanation || '');

  const q = db.prepare('SELECT * FROM quiz_questions WHERE id = ?').get(info.lastInsertRowid);
  res.json(q);
});

// Delete question (admin + academy)
app.delete('/api/coach/quiz/questions/:id', requireAuth, requireFormationAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM quiz_questions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Submit quiz (coach)
app.post('/api/coach/quiz/:formation_id/submit', requireAuth, (req, res) => {
  const db = getDb();
  const formationId = parseInt(req.params.formation_id);
  const coachId = req.session.coach_id;
  if (!coachId) return res.status(403).json({ error: 'Coach only' });

  const { answers } = req.body; // { questionId: 'a'|'b'|'c'|'d' }
  const questions = db.prepare('SELECT * FROM quiz_questions WHERE formation_id = ? ORDER BY id').all(formationId);

  if (questions.length === 0) return res.status(400).json({ error: 'Aucune question' });

  let score = 0;
  const results = questions.map(q => {
    const userAnswer = answers[q.id] || '';
    const correct = userAnswer === q.correct_answer;
    if (correct) score++;
    return { id: q.id, correct, userAnswer, correctAnswer: q.correct_answer, explanation: q.explanation };
  });

  const total = questions.length;
  const pct = Math.round((score / total) * 100);
  const passed = pct >= 80 ? 1 : 0;

  // Save result
  db.prepare('INSERT INTO quiz_results (formation_id, coach_id, score, total, passed) VALUES (?, ?, ?, ?, ?)')
    .run(formationId, coachId, score, total, passed);

  // Quiz passed → set to 'pending' (awaiting admin validation), NOT auto-validated
  // Only update if not already validated (admin validation takes priority)
  if (passed) {
    const existing = db.prepare('SELECT status FROM formation_validations WHERE formation_id = ? AND coach_id = ?').get(formationId, coachId);
    if (!existing || existing.status === 'pending') {
      db.prepare(`
        INSERT INTO formation_validations (formation_id, coach_id, status, validated_at)
        VALUES (?, ?, 'pending', NULL)
        ON CONFLICT(formation_id, coach_id)
        DO UPDATE SET status = 'pending', validated_at = NULL
      `).run(formationId, coachId);
    }
  }

  let xpGained = 0;
  let beltUp = null;
  let newBadges = [];
  let streakData = null;

  if (passed) {
    // Award XP for quiz performance only — formation/belt/badges XP comes from admin validation
    const insertXP = db.prepare('INSERT INTO xp_log (coach_id, amount, reason, ref_id) VALUES (?, ?, ?, ?)');
    insertXP.run(coachId, XP_VALUES.quiz_pass, 'quiz_pass', formationId);
    xpGained += XP_VALUES.quiz_pass;

    if (score === total) {
      insertXP.run(coachId, XP_VALUES.quiz_perfect, 'quiz_perfect', formationId);
      xpGained += XP_VALUES.quiz_perfect;
    }

    // Streak update on quiz pass
    streakData = updateStreak(db, coachId);

    // Post system messages for achievements
    const coach = db.prepare('SELECT name FROM coaches WHERE id = ?').get(coachId);
    const coachName = coach?.name || 'Coach';
    const formationObj = db.prepare('SELECT name FROM formations WHERE id = ?').get(formationId);
    const formationName = formationObj?.name || 'Formation';

    if (score === total) {
      const perfectCoachStudio = db.prepare('SELECT studio FROM coaches WHERE id = ?').get(coachId)?.studio || null;
      db.prepare("INSERT INTO community_messages (coach_id, type, content, is_cr, is_system, target_club) VALUES (?, 'text', ?, 0, 1, ?)")
        .run(coachId, `⭐⭐⭐ ${coachName} obtient un score PARFAIT sur "${formationName}" !`, perfectCoachStudio);
    }
  }

  res.json({ score, total, pct, passed, results, xp_gained: xpGained, belt_up: beltUp, new_badges: newBadges, streak: streakData });
});

// Get quiz history for a coach on a formation
app.get('/api/coach/quiz/:formation_id/history/:coach_id', requireAuth, (req, res) => {
  const db = getDb();
  const history = db.prepare(
    'SELECT * FROM quiz_results WHERE formation_id = ? AND coach_id = ? ORDER BY taken_at DESC LIMIT 5'
  ).all(req.params.formation_id, req.params.coach_id);
  res.json({ history });
});

// Get question count per formation
app.get('/api/coach/quiz/counts', requireAuth, (req, res) => {
  const db = getDb();
  const counts = db.prepare('SELECT formation_id, COUNT(*) as count FROM quiz_questions GROUP BY formation_id').all();
  const map = {};
  counts.forEach(c => { map[c.formation_id] = c.count; });
  res.json({ counts: map });
});

// ─── Quiz AI Generation ─────────────────────────────────────
app.post('/api/coach/quiz/:formation_id/generate', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'votre_cle_api_ici') {
    return res.status(400).json({ error: 'Clé API Anthropic non configurée. Ajoutez ANTHROPIC_API_KEY dans le fichier .env' });
  }

  const { transcript, num_questions } = req.body;
  if (!transcript || transcript.trim().length < 50) {
    return res.status(400).json({ error: 'Transcript trop court (min 50 caractères)' });
  }

  const count = Math.min(Math.max(parseInt(num_questions) || 6, 2), 15);

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `Tu es un formateur expert. À partir du transcript suivant, génère exactement ${count} questions QCM pour évaluer la compréhension du contenu.

RÈGLES :
- Chaque question doit avoir exactement 4 options (A, B, C, D)
- Une seule bonne réponse par question
- Les questions doivent tester la compréhension, pas la mémorisation mot à mot
- Ajoute une explication courte pour chaque bonne réponse
- Réponds UNIQUEMENT en JSON valide, sans texte avant ou après

FORMAT JSON attendu :
[
  {
    "question": "...",
    "option_a": "...",
    "option_b": "...",
    "option_c": "...",
    "option_d": "...",
    "correct_answer": "a",
    "explanation": "..."
  }
]

TRANSCRIPT :
${transcript.substring(0, 15000)}`
      }]
    });

    // Parse response
    const text = message.content[0].text;
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Réponse IA invalide — pas de JSON trouvé' });
    }

    const questions = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(500).json({ error: 'Aucune question générée' });
    }

    // Insert questions in DB
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO quiz_questions (formation_id, question, option_a, option_b, option_c, option_d, correct_answer, explanation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const formationId = parseInt(req.params.formation_id);
    const inserted = [];
    for (const q of questions) {
      const valid = ['a', 'b', 'c', 'd'];
      const answer = valid.includes(q.correct_answer) ? q.correct_answer : 'a';
      const info = stmt.run(formationId, q.question, q.option_a, q.option_b, q.option_c, q.option_d, answer, q.explanation || '');
      inserted.push(db.prepare('SELECT * FROM quiz_questions WHERE id = ?').get(info.lastInsertRowid));
    }

    res.json({ questions: inserted, count: inserted.length });
  } catch (err) {
    console.error('Quiz AI error:', err);
    res.json({ error: 'Erreur API : ' + (err.message || 'inconnue') });
  }
});

// ─── XP endpoints ───────────────────────────────────────────
app.get('/api/coach/xp/:coach_id', requireAuth, (req, res) => {
  const db = getDb();
  const total = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM xp_log WHERE coach_id = ?').get(req.params.coach_id);
  const recent = db.prepare('SELECT * FROM xp_log WHERE coach_id = ? ORDER BY created_at DESC LIMIT 10').all(req.params.coach_id);
  res.json({ total: total.total, recent });
});

app.get('/api/coach/xp/leaderboard', requireAuth, (req, res) => {
  const db = getDb();
  const lb = db.prepare(`
    SELECT c.id, c.name, c.studio, COALESCE(SUM(x.amount),0) as total_xp
    FROM coaches c LEFT JOIN xp_log x ON x.coach_id = c.id
    WHERE c.archived = 0 AND c.role = 'coach'
    GROUP BY c.id ORDER BY total_xp DESC
  `).all();
  res.json({ leaderboard: lb });
});

// ─── Formations leaderboard ─────────────────────────────────
app.get('/api/coach/formations/leaderboard', requireAuth, (req, res) => {
  const db = getDb();
  const coachList = db.prepare("SELECT id, name, studio FROM coaches WHERE archived = 0 AND role = 'coach'").all();
  const formations = db.prepare('SELECT id, category FROM formations').all();
  const totalFormations = formations.length;
  const leaderboard = coachList.map(c => {
    const validated = db.prepare("SELECT COUNT(*) as c FROM formation_validations fv JOIN formations f ON f.id = fv.formation_id WHERE fv.coach_id = ? AND fv.status = 'validated'").get(c.id);
    const streak = db.prepare('SELECT current_streak FROM coach_streaks WHERE coach_id = ?').get(c.id);
    const xp = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM xp_log WHERE coach_id = ?').get(c.id);
    const badges = db.prepare('SELECT badge_key FROM coach_badges WHERE coach_id = ?').all(c.id);
    return {
      coach_id: c.id, name: c.name, studio: c.studio,
      validated: validated.c, total: totalFormations,
      pct: totalFormations > 0 ? Math.min(100, Math.round((validated.c / totalFormations) * 100)) : 0,
      streak: streak?.current_streak || 0,
      xp: xp.total,
      badges: badges.map(b => b.badge_key)
    };
  }).sort((a, b) => b.pct - a.pct || b.xp - a.xp);
  res.json({ leaderboard });
});

// ─── Badges endpoint ────────────────────────────────────────
app.get('/api/coach/badges/:coach_id', requireAuth, (req, res) => {
  const db = getDb();
  const badges = db.prepare('SELECT * FROM coach_badges WHERE coach_id = ? ORDER BY unlocked_at').all(req.params.coach_id);
  res.json({ badges });
});

// ─── Ressources (Vidéos YouTube) ────────────────────────────
app.get('/api/coach/ressources', requireAuth, (req, res) => {
  const db = getDb();
  const ressources = db.prepare('SELECT * FROM ressources ORDER BY id DESC').all();
  res.json({ ressources });
});

app.post('/api/coach/ressources', requireAuth, (req, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const db = getDb();
  const { youtube_url, title, category } = req.body;
  if (!youtube_url) return res.status(400).json({ error: 'URL YouTube requise' });

  // Extract video ID from various YouTube URL formats
  let videoId = '';
  try {
    const url = new URL(youtube_url);
    if (url.hostname.includes('youtu.be')) {
      videoId = url.pathname.slice(1);
    } else if (url.hostname.includes('youtube.com')) {
      videoId = url.searchParams.get('v') || '';
      if (!videoId && url.pathname.startsWith('/shorts/')) {
        videoId = url.pathname.replace('/shorts/', '');
      }
    }
  } catch (_) {
    if (/^[a-zA-Z0-9_-]{11}$/.test(youtube_url)) videoId = youtube_url;
  }

  if (!videoId) return res.status(400).json({ error: 'URL YouTube invalide' });

  const validCategories = ['vision', 'discipline', 'progression'];
  const cat = validCategories.includes(category) ? category : 'vision';
  const stmt = db.prepare('INSERT INTO ressources (youtube_url, video_id, title, category) VALUES (?, ?, ?, ?)');
  const info = stmt.run(youtube_url, videoId, title || '', cat);
  const ressource = db.prepare('SELECT * FROM ressources WHERE id = ?').get(info.lastInsertRowid);
  res.json(ressource);
});

app.delete('/api/coach/ressources/:id', requireAuth, (req, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const db = getDb();
  db.prepare('DELETE FROM ressources WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── Community Messages (Vocaux + Texte) ────────────────────
app.get('/api/coach/community/messages', requireAuth, (req, res) => {
  const db = getDb();
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const before = req.query.before;

  const isAdmin = req.session.role === 'admin';
  const clubFilter = req.query.club; // filtre explicite par ville

  let conditions = [];
  const params = [];

  if (before) {
    conditions.push('cm.id < ?');
    params.push(parseInt(before));
  }

  // Filtre par club : on filtre uniquement par le target_club du message
  if (clubFilter) {
    conditions.push('LOWER(cm.target_club) = LOWER(?)');
    params.push(clubFilter);
  }

  const viewerCoachId = req.session.coach_id || null;

  let query = `
    SELECT cm.*, c.name as coach_name, c.studio as coach_studio,
           (SELECT COUNT(*) FROM message_likes ml WHERE ml.message_id = cm.id) AS likes_count
    FROM community_messages cm
    JOIN coaches c ON c.id = cm.coach_id
  `;
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY cm.id DESC LIMIT ?';
  params.push(limit);

  let messages = db.prepare(query).all(...params);

  // Add liked_by_me flag if viewer is a coach
  if (viewerCoachId) {
    const likedSet = new Set(
      db.prepare('SELECT message_id FROM message_likes WHERE coach_id = ?').all(viewerCoachId).map(r => r.message_id)
    );
    messages = messages.map(m => ({ ...m, liked_by_me: likedSet.has(m.id) }));
  }

  res.json({ messages: messages.reverse() });
});

app.post('/api/coach/community/messages', requireAuth, (req, res) => {
  const db = getDb();
  const { type, content, audio_data, audio_duration, is_cr, target_club } = req.body;
  const coachId = req.session.coach_id;

  if (!coachId) {
    return res.status(403).json({ error: 'Seuls les Coachs peuvent poster' });
  }

  if (type === 'audio') {
    if (!audio_data) return res.status(400).json({ error: 'Données audio manquantes' });
    if (audio_data.length > 5 * 1024 * 1024) {
      return res.status(413).json({ error: 'Audio trop volumineux (max 5 Mo)' });
    }
  } else {
    if (!content || !content.trim()) return res.status(400).json({ error: 'Message vide' });
  }

  const result = db.prepare(`
    INSERT INTO community_messages (coach_id, type, content, audio_data, audio_duration, is_cr, target_club)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    coachId,
    type || 'text',
    type === 'audio' ? '' : (content || '').trim(),
    type === 'audio' ? audio_data : null,
    type === 'audio' ? (audio_duration || 0) : null,
    is_cr ? 1 : 0,
    target_club || null
  );

  const msg = db.prepare(`
    SELECT cm.*, c.name as coach_name
    FROM community_messages cm
    JOIN coaches c ON c.id = cm.coach_id
    WHERE cm.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(msg);
});

// Toggle like on a message
app.post('/api/coach/community/messages/:id/like', requireAuth, (req, res) => {
  const db = getDb();
  const msgId = parseInt(req.params.id);
  const coachId = req.session.coach_id;
  if (!coachId) return res.status(403).json({ error: 'Connexion requise' });

  const existing = db.prepare('SELECT id FROM message_likes WHERE message_id = ? AND coach_id = ?').get(msgId, coachId);
  if (existing) {
    db.prepare('DELETE FROM message_likes WHERE message_id = ? AND coach_id = ?').run(msgId, coachId);
  } else {
    db.prepare('INSERT INTO message_likes (message_id, coach_id) VALUES (?, ?)').run(msgId, coachId);
  }
  const likesCount = db.prepare('SELECT COUNT(*) as n FROM message_likes WHERE message_id = ?').get(msgId).n;
  res.json({ liked: !existing, likes_count: likesCount });
});

app.delete('/api/coach/community/messages/:id', requireAuth, (req, res) => {
  const db = getDb();
  const msgId = parseInt(req.params.id);
  const msg = db.prepare('SELECT * FROM community_messages WHERE id = ?').get(msgId);
  if (!msg) return res.status(404).json({ error: 'Message non trouvé' });

  if (req.session.role !== 'admin' && req.session.coach_id !== msg.coach_id) {
    return res.status(403).json({ error: 'Non autorisé' });
  }

  db.prepare('DELETE FROM community_messages WHERE id = ?').run(msgId);
  res.json({ success: true });
});

// ─── Admin Notes (Remarques) ────────────────────────────────
app.get('/api/coach/notes', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const notes = db.prepare('SELECT * FROM coach_admin_notes ORDER BY updated_at DESC').all();
  res.json(notes);
});

app.post('/api/coach/notes', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Contenu requis' });
  const result = db.prepare('INSERT INTO coach_admin_notes (content) VALUES (?)').run(content.trim());
  const note = db.prepare('SELECT * FROM coach_admin_notes WHERE id = ?').get(result.lastInsertRowid);
  res.json(note);
});

app.put('/api/coach/notes/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Contenu requis' });
  db.prepare("UPDATE coach_admin_notes SET content = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(content.trim(), req.params.id);
  const note = db.prepare('SELECT * FROM coach_admin_notes WHERE id = ?').get(req.params.id);
  if (!note) return res.status(404).json({ error: 'Note introuvable' });
  res.json(note);
});

app.delete('/api/coach/notes/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM coach_admin_notes WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Note introuvable' });
  res.json({ success: true });
});

// ─── AI Analysis ────────────────────────────────────────────
app.post('/api/coach/analyze-coach', requireAuth, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'votre_cle_api_ici') {
    return res.status(503).json({ error: 'Analyse IA non configurée. Définissez ANTHROPIC_API_KEY dans .env', feature: 'ai' });
  }

  const { coach_name, month, data } = req.body;
  if (!data) return res.status(400).json({ error: 'Données requises' });

  try {
    const client = new Anthropic({ apiKey });

    const contextInfo = `
Coach : ${coach_name}
Mois : ${month}

KPIs Admin :
- Taux de résiliation : ${data.taux_resiliation ?? 'Non renseigné'}%
- Taux non fréquentants : ${data.taux_non_frequentants ?? 'Non renseigné'}%
- Nombre d'adhérents : ${data.nb_adherents ?? 'Non renseigné'}

Activité quotidienne (${data.active_days} jours actifs) :
- Story publiée : ${data.days?.story || 0} jours
- Tour club validé : ${data.days?.check_club || 0} jours
- Fiches clients à jour : ${data.days?.fichier_client || 0} jours
- CR transmis : ${data.days?.cr_journee || 0} jours
- Prises de référence : ${data.totals?.references || 0} total
- Relances non fréquentants : ${data.totals?.relances_nf || 0} total
- Avis/Témoignages clients : ${data.totals?.avis_temoignages || 0} total
- Énergie moyenne : ${data.energy_avg ?? 'Non renseigné'}
`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Tu es un directeur de réseau de studios de coaching sportif. Analyse les performances de ce Coach et produis une synthèse structurée.

${contextInfo}

Produis une analyse en français avec ces 4 sections, chacune sous forme de bullet points concis :

**Points forts du mois**
- Ce qui fonctionne bien

**Points de vigilance**
- Ce qui doit être amélioré en priorité

**Priorités pour le mois prochain**
- 3 actions concrètes et mesurables

**Appréciation globale**
- Synthèse en 2-3 phrases

Sois direct, concret et constructif.`
      }]
    });

    res.json({ analysis: message.content[0].text });
  } catch (e) {
    console.error('Erreur analyse IA:', e.message);
    res.status(500).json({ error: 'Erreur lors de l\'analyse: ' + e.message });
  }
});

// ─── Admin Actions Summary ──────────────────────────────────
app.get('/api/coach/admin/actions-summary/:month', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const month = req.params.month;
  const { firstDay, lastDay } = getMonthRange(month);

  const coaches = db.prepare("SELECT id, name FROM coaches WHERE role = 'coach' AND archived = 0 ORDER BY name").all();

  const result = coaches.map(coach => {
    const actions = db.prepare(`
      SELECT action_key, SUM(value) as total, COUNT(DISTINCT date) as days
      FROM coach_daily_action_values
      WHERE coach_id = ? AND date >= ? AND date <= ? AND value > 0
      GROUP BY action_key
    `).all(coach.id, firstDay, lastDay);

    const totals = {};
    const days = {};
    actions.forEach(a => {
      totals[a.action_key] = a.total;
      days[a.action_key] = a.days;
    });

    const activeDays = db.prepare(`
      SELECT COUNT(DISTINCT date) as count
      FROM coach_daily_action_values
      WHERE coach_id = ? AND date >= ? AND date <= ? AND value > 0
    `).get(coach.id, firstDay, lastDay);

    return {
      coach_id: coach.id,
      name: coach.name,
      totals,
      days,
      active_days: activeDays?.count || 0
    };
  });

  res.json({ month, coaches: result });
});

// ─── Body Check (MEICET analysis) ─────────────────────────────
app.post('/api/coach/bodycheck/analyze', requireAuth, async (req, res) => {
  const { image, clientName } = req.body;
  if (!image) return res.status(400).json({ error: 'Image requise' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'votre_cle_api_ici') {
    return res.status(500).json({ error: 'Clé API Anthropic non configurée' });
  }

  try {
    const anthropic = new Anthropic({ apiKey });

    const prompt = `Tu es un coach sportif My Coach. Analyse cette photo de bilan MEICET pour le client "${clientName || 'Client'}".

GRILLE DE LECTURE (respecte cet ordre strict) :

1. 📊 SCORE GLOBAL /100 — Quel est le score aperçu ? Donne une appréciation courte (ex: "bon départ", "marge de progression", "solide").

2. ⚖️ COMPOSITION CORPORELLE — Masse musculaire vs masse grasse. Trop de graisse ? Pas assez de muscle ? Regarde les deux ensemble.

3. 📍 LOCALISATION DE LA GRAISSE — La graisse est plutôt au niveau du ventre (tronc) ou en périphérie (bras/jambes) ? Ventre = alerte santé. Périphérie = esthétique.

4. 💪 QUALITÉ MUSCULAIRE /100 — Le score de qualité musculaire. Le muscle est-il fonctionnel ? On peut avoir du volume et un mauvais score.

5. 🎯 OBJECTIF CHIFFRÉ — Combien de kg de graisse à perdre selon la machine ? Quel poids cible ? Donne un horizon réaliste (ex: "en 3-4 mois avec 3 séances/semaine").

FORMAT DE RÉPONSE (STRICT) :

D'abord un TABLEAU avec les chiffres clés au format :
[TABLEAU]
Poids actuel | XX kg
Masse musculaire | XX kg
Masse grasse | XX kg (XX%)
Score global | XX/100
Qualité musculaire | XX/100
Poids cible | XX kg
Graisse à perdre | XX kg
[/TABLEAU]

Puis exactement 3 LIGNES de message coach motivant pour le client (tutoiement, ton My Coach = exigeant mais bienveillant). Pas de nutrition, pas de programme d'entraînement — ça c'est le travail du coach en séance. Maximum 3 phrases courtes et percutantes.

[MESSAGE]
Ligne 1 : constat positif ou encourageant
Ligne 2 : le point clé à travailler
Ligne 3 : l'objectif et la motivation
[/MESSAGE]`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: image.startsWith('data:image/png') ? 'image/png' : 'image/jpeg', data: image.replace(/^data:image\/\w+;base64,/, '') } },
          { type: 'text', text: prompt }
        ]
      }]
    });

    const text = response.content[0].text;
    res.json({ analysis: text, clientName: clientName || 'Client' });
  } catch (err) {
    console.error('[BodyCheck] Erreur analyse:', err.message);
    res.status(500).json({ error: 'Erreur lors de l\'analyse: ' + err.message });
  }
});

// ─── PERSO (admin only) : suivi personnel entraînement ──────
app.get('/api/coach/perso/exercises', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT id, name, muscle_group FROM perso_exercises ORDER BY name COLLATE NOCASE').all();
  res.json({ exercises: rows });
});

app.get('/api/coach/perso/exercises/:id/history', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const ex = db.prepare('SELECT * FROM perso_exercises WHERE id = ?').get(id);
  if (!ex) return res.status(404).json({ error: 'Exercice introuvable' });

  const sets = db.prepare('SELECT * FROM perso_sets WHERE exercise_id = ? ORDER BY date DESC, id DESC').all(id);

  // Last performance (most recent date)
  const last = sets[0] || null;

  // Best performance: highest charge, then highest reps as tiebreak
  const best = [...sets].sort((a, b) => (b.charge - a.charge) || (b.reps - a.reps) || (b.series - a.series))[0] || null;

  res.json({ exercise: ex, sets, last, best });
});

app.post('/api/coach/perso/sets', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { name, muscle_group = '', charge = 0, series = 0, reps = 0, feeling = 'moyen', date } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nom requis' });

  const cleanName = name.trim();
  const today = date || new Date().toISOString().slice(0, 10);

  // Upsert exercise (create if not exists, update muscle_group if provided and empty)
  let ex = db.prepare('SELECT * FROM perso_exercises WHERE name = ? COLLATE NOCASE').get(cleanName);
  if (!ex) {
    const info = db.prepare('INSERT INTO perso_exercises (name, muscle_group) VALUES (?, ?)').run(cleanName, muscle_group.trim());
    ex = db.prepare('SELECT * FROM perso_exercises WHERE id = ?').get(info.lastInsertRowid);
  } else if (muscle_group && muscle_group.trim() && !ex.muscle_group) {
    db.prepare('UPDATE perso_exercises SET muscle_group = ? WHERE id = ?').run(muscle_group.trim(), ex.id);
    ex.muscle_group = muscle_group.trim();
  }

  const info = db.prepare('INSERT INTO perso_sets (exercise_id, date, charge, series, reps, feeling) VALUES (?, ?, ?, ?, ?, ?)')
    .run(ex.id, today, parseFloat(charge) || 0, parseInt(series) || 0, parseInt(reps) || 0, feeling);

  const set = db.prepare('SELECT * FROM perso_sets WHERE id = ?').get(info.lastInsertRowid);
  res.json({ exercise: ex, set });
});

app.delete('/api/coach/perso/sets/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM perso_sets WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/coach/perso/daily/:date', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM perso_daily WHERE date = ?').get(req.params.date);
  res.json(row || { date: req.params.date, poids: null, energie: null });
});

app.put('/api/coach/perso/daily/:date', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { poids = null, energie = null } = req.body || {};
  db.prepare(`
    INSERT INTO perso_daily (date, poids, energie, updated_at)
    VALUES (?, ?, ?, datetime('now','localtime'))
    ON CONFLICT(date) DO UPDATE SET poids = excluded.poids, energie = excluded.energie, updated_at = excluded.updated_at
  `).run(req.params.date, poids, energie);
  res.json(db.prepare('SELECT * FROM perso_daily WHERE date = ?').get(req.params.date));
});

app.get('/api/coach/perso/sets-today/:date', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT s.*, e.name as exercise_name, e.muscle_group, e.objectif_charge
    FROM perso_sets s
    JOIN perso_exercises e ON e.id = s.exercise_id
    WHERE s.date = ?
    ORDER BY s.id DESC
  `).all(req.params.date);
  res.json({ sets: rows });
});

// Update exercise (muscle_group, objectif_charge)
app.patch('/api/coach/perso/exercises/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const ex = db.prepare('SELECT * FROM perso_exercises WHERE id = ?').get(req.params.id);
  if (!ex) return res.status(404).json({ error: 'Exercice introuvable' });
  const muscle_group = req.body.muscle_group !== undefined ? req.body.muscle_group : ex.muscle_group;
  const objectif_charge = req.body.objectif_charge !== undefined
    ? (req.body.objectif_charge === null || req.body.objectif_charge === '' ? null : parseFloat(req.body.objectif_charge))
    : ex.objectif_charge;
  db.prepare('UPDATE perso_exercises SET muscle_group = ?, objectif_charge = ? WHERE id = ?')
    .run(muscle_group, objectif_charge, req.params.id);
  res.json(db.prepare('SELECT * FROM perso_exercises WHERE id = ?').get(req.params.id));
});

// ─── PERSO: Sessions (templates) ────────────────────────────
app.get('/api/coach/perso/sessions', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const sessions = db.prepare('SELECT * FROM perso_sessions ORDER BY is_favorite DESC, name COLLATE NOCASE').all();
  const getExercises = db.prepare(`
    SELECT e.id, e.name, e.muscle_group, e.objectif_charge, se.order_idx
    FROM perso_session_exercises se
    JOIN perso_exercises e ON e.id = se.exercise_id
    WHERE se.session_id = ?
    ORDER BY se.order_idx, se.id
  `);
  const result = sessions.map(s => ({ ...s, exercises: getExercises.all(s.id) }));
  res.json({ sessions: result });
});

app.post('/api/coach/perso/sessions', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { name, exercise_ids = [] } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nom requis' });
  const info = db.prepare('INSERT INTO perso_sessions (name) VALUES (?)').run(name.trim());
  const sessionId = info.lastInsertRowid;
  const ins = db.prepare('INSERT INTO perso_session_exercises (session_id, exercise_id, order_idx) VALUES (?, ?, ?)');
  exercise_ids.forEach((exId, i) => ins.run(sessionId, exId, i));
  res.json(db.prepare('SELECT * FROM perso_sessions WHERE id = ?').get(sessionId));
});

app.patch('/api/coach/perso/sessions/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const s = db.prepare('SELECT * FROM perso_sessions WHERE id = ?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Séance introuvable' });
  const name = req.body.name !== undefined ? req.body.name.trim() : s.name;
  const is_favorite = req.body.is_favorite !== undefined ? (req.body.is_favorite ? 1 : 0) : s.is_favorite;
  db.prepare('UPDATE perso_sessions SET name = ?, is_favorite = ? WHERE id = ?')
    .run(name, is_favorite, req.params.id);
  if (Array.isArray(req.body.exercise_ids)) {
    db.prepare('DELETE FROM perso_session_exercises WHERE session_id = ?').run(req.params.id);
    const ins = db.prepare('INSERT INTO perso_session_exercises (session_id, exercise_id, order_idx) VALUES (?, ?, ?)');
    req.body.exercise_ids.forEach((exId, i) => ins.run(req.params.id, exId, i));
  }
  res.json(db.prepare('SELECT * FROM perso_sessions WHERE id = ?').get(req.params.id));
});

app.delete('/api/coach/perso/sessions/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM perso_sessions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── Focus du mois ──────────────────────────────────────────

// GET — focus du mois courant (tous les users connectés)
app.get('/api/coach/calendar/focus', requireAuth, (req, res) => {
  const db = getDb();
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const row = db.prepare('SELECT * FROM monthly_focus WHERE month = ?').get(month);
  res.json({ month, content: row?.content || '' });
});

// PUT — modifier le focus du mois (admin + academy)
app.put('/api/coach/calendar/focus', requireAuth, requireFormationAdmin, (req, res) => {
  const db = getDb();
  const { month, content } = req.body;
  if (!month) return res.status(400).json({ error: 'Mois requis' });
  db.prepare(`
    INSERT INTO monthly_focus (month, content, updated_at)
    VALUES (?, ?, datetime('now','localtime'))
    ON CONFLICT(month) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at
  `).run(month, content?.trim() || '');
  res.json({ ok: true });
});

// ─── Calendrier Academy ─────────────────────────────────────

// GET — prochaines formations (tous les users connectés)
app.get('/api/coach/calendar/events', requireAuth, (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  const events = db.prepare(
    'SELECT * FROM formation_events WHERE event_date >= ? ORDER BY event_date ASC'
  ).all(today);
  res.json({ events });
});

// GET — toutes les formations passées aussi (pour admin/academy/leader/directeur)
app.get('/api/coach/calendar/events/all', requireAuth, requireCalendarManager, (req, res) => {
  const db = getDb();
  const events = db.prepare('SELECT * FROM formation_events ORDER BY event_date ASC').all();
  res.json({ events });
});

// POST — créer un événement
app.post('/api/coach/calendar/events', requireAuth, requireCalendarManager, (req, res) => {
  const db = getDb();
  const { title, event_date, studio, notes } = req.body;
  if (!title || !event_date) return res.status(400).json({ error: 'Titre et date requis' });
  const result = db.prepare(
    'INSERT INTO formation_events (title, event_date, studio, notes) VALUES (?, ?, ?, ?)'
  ).run(title.trim(), event_date, studio?.trim() || null, notes?.trim() || null);
  const ev = db.prepare('SELECT * FROM formation_events WHERE id = ?').get(result.lastInsertRowid);
  res.json(ev);
});

// PATCH — modifier un événement
app.patch('/api/coach/calendar/events/:id', requireAuth, requireCalendarManager, (req, res) => {
  const db = getDb();
  const { title, event_date, studio, notes } = req.body;
  if (!title || !event_date) return res.status(400).json({ error: 'Titre et date requis' });
  db.prepare(
    'UPDATE formation_events SET title = ?, event_date = ?, studio = ?, notes = ? WHERE id = ?'
  ).run(title.trim(), event_date, studio?.trim() || null, notes?.trim() || null, req.params.id);
  const ev = db.prepare('SELECT * FROM formation_events WHERE id = ?').get(req.params.id);
  res.json(ev);
});

// DELETE — supprimer un événement
app.delete('/api/coach/calendar/events/:id', requireAuth, requireCalendarManager, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM formation_events WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── Accompagnement : évaluations leaders ───────────────────

function requireDirectorOrAdmin(req, res, next) {
  if (!req.session || !['admin', 'director'].includes(req.session.role)) {
    return res.status(403).json({ error: 'Accès réservé au directeur de réseau' });
  }
  next();
}

// GET /api/accompagnement/evaluation/:coach_id/:month — lecture par le coach leader lui-même
// ⚠️ Doit être AVANT /:month pour éviter le conflit de route Express
app.get('/api/coach/accompagnement/evaluation/:coach_id/:month', requireAuth, (req, res) => {
  const db = getDb();
  const { coach_id, month } = req.params;
  const session = req.session;
  const myCoachId = session.coach_id;
  // Un coach ne peut lire que sa propre évaluation ; directeur/admin peuvent tout lire
  if (session.role === 'coach' && myCoachId !== parseInt(coach_id)) {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  const row = db.prepare('SELECT * FROM leader_evaluations WHERE coach_id = ? AND month = ?').get(parseInt(coach_id), month);
  if (row) {
    try { row.eval_data = JSON.parse(row.eval_data || '{}'); } catch(_) { row.eval_data = {}; }
  }
  res.json({ evaluation: row || null });
});

// GET /api/accompagnement/:month — liste les leaders avec leur évaluation du mois
app.get('/api/coach/accompagnement/:month', requireAuth, requireDirectorOrAdmin, (req, res) => {
  const db = getDb();
  const month = req.params.month;
  const leaders = db.prepare("SELECT id, name, studio FROM coaches WHERE in_accompagnement = 1 AND archived = 0 ORDER BY studio, name").all();
  const evals = db.prepare('SELECT * FROM leader_evaluations WHERE month = ?').all(month);
  const evalMap = {};
  for (const e of evals) {
    try { e.eval_data = JSON.parse(e.eval_data || '{}'); } catch(_) { e.eval_data = {}; }
    evalMap[e.coach_id] = e;
  }
  res.json({
    month,
    leaders: leaders.map(l => ({ ...l, evaluation: evalMap[l.id] || null }))
  });
});

// PUT /api/accompagnement/:month/:coach_id — sauvegarder/mettre à jour une évaluation
app.put('/api/coach/accompagnement/:month/:coach_id', requireAuth, requireDirectorOrAdmin, (req, res) => {
  const db = getDb();
  const { month, coach_id } = req.params;
  const { eval_data, remarques } = req.body;
  const evalJson = eval_data ? JSON.stringify(eval_data) : '{}';
  db.prepare(`
    INSERT INTO leader_evaluations (coach_id, month, eval_data, remarques, updated_at)
    VALUES (?, ?, ?, ?, datetime('now','localtime'))
    ON CONFLICT(coach_id, month) DO UPDATE SET
      eval_data  = excluded.eval_data,
      remarques  = excluded.remarques,
      updated_at = excluded.updated_at
  `).run(parseInt(coach_id), month, evalJson, (remarques || '').trim());
  res.json({ ok: true });
});

// ─── Revue mensuelle du studio ──────────────────────────────

// Middleware : coach leader ou director/admin
function requireLeaderOrDirector(req, res, next) {
  const s = req.session;
  if (!s) return res.status(403).json({ error: 'Accès non autorisé' });
  if (s.is_leader || s.role === 'director' || s.role === 'admin') return next();
  return res.status(403).json({ error: 'Réservé aux coach leaders et DR' });
}

// GET /api/studio-review/:studio/:month — charge la revue + préremplissage
app.get('/api/coach/studio-review/:studio/:month', requireAuth, requireLeaderOrDirector, (req, res) => {
  const db = getDb();
  const studio = decodeURIComponent(req.params.studio);
  const month  = req.params.month;
  const { firstDay, lastDay } = getMonthRange(month);

  // Récupérer ou initialiser la revue
  let review = db.prepare('SELECT * FROM studio_reviews WHERE studio = ? AND month = ?').get(studio, month);

  // Préremplissage depuis monthly_data (agrégé sur le studio)
  const mdRows = db.prepare(`
    SELECT md.* FROM monthly_data md
    JOIN coaches c ON c.id = md.coach_id
    WHERE c.studio = ? AND md.month = ? AND c.archived = 0
  `).all(studio, month);

  // Prendre le premier coach leader du studio pour les données KPI (données studio)
  const mdMain = mdRows[0] || {};
  const prefill = {
    taux_resiliation:  mdMain.taux_resiliation ?? null,
    taux_non_freq:     mdMain.taux_non_frequentants ?? null,
    contribution:      mdMain.taux_contribution ?? null,
  };

  // Agréger les coach_daily_action_values sur le studio
  const coachIds = db.prepare(
    "SELECT id FROM coaches WHERE studio = ? AND archived = 0 AND role = 'coach'"
  ).all(studio).map(c => c.id);

  if (coachIds.length > 0) {
    const ph = coachIds.map(() => '?').join(',');
    const daily = db.prepare(`
      SELECT action_key, SUM(value) as total FROM coach_daily_action_values
      WHERE coach_id IN (${ph}) AND date >= ? AND date <= ? AND value > 0
      GROUP BY action_key
    `).all(...coachIds, firstDay, lastDay);
    const dt = {};
    daily.forEach(r => { dt[r.action_key] = r.total; });

    // Additionner studio principal (clé brute) + 2ème studio (préfixe s2_)
    const sum = (key) => {
      const v1 = dt[key] || 0;
      const v2 = dt['s2_' + key] || 0;
      const total = v1 + v2;
      return total > 0 ? Math.round(total) : null;
    };

    prefill.avis_google      = sum('avis_google');
    prefill.temoignages      = sum('temoignages');
    prefill.references_count = sum('references');
    prefill.surpack          = sum('surpack');
  }

  if (!review) {
    // Retourner les données préremplies sans créer d'entrée en DB
    return res.json({ review: null, prefill, studio, month });
  }

  res.json({ review, prefill, studio, month });
});

// PUT /api/studio-review/:studio/:month — sauvegarde (brouillon ou soumission)
app.put('/api/coach/studio-review/:studio/:month', requireAuth, requireLeaderOrDirector, (req, res) => {
  const db = getDb();
  const studio = decodeURIComponent(req.params.studio);
  const month  = req.params.month;
  const s = req.session;
  const body = req.body;

  // Trouver le coach_id du leader pour ce studio
  let coachId = s.coach_id;
  if (!coachId) {
    const leader = db.prepare(
      "SELECT id FROM coaches WHERE studio = ? AND is_leader = 1 AND archived = 0 LIMIT 1"
    ).get(studio);
    if (leader) coachId = leader.id;
  }

  const action = body.action || 'draft'; // 'draft' | 'submit'
  const now = `datetime('now','localtime')`;

  const fields = [
    'contribution','taux_resiliation','taux_non_freq','avis_google','temoignages',
    'references_count','surpack','score_audit','obj_resiliation','comment_engagement',
    'comment_loyaute','fichier_client','pesees','welcome_calls','resilies_commentes',
    'comment_infos','nb_remontees','coachs_observes','cr_quotidiens','ponctualite',
    'comment_team','stories','presence_reseaux','standard_image','comment_eclat',
    'nb_events','nb_partenaires','petit_plus','comment_succes',
    'plan_sujet','plan_action','plan_echeance'
  ];

  // Tous les champs doivent être présents dans vals (null si absent du body)
  const vals = {};
  fields.forEach(f => { vals[f] = body[f] !== undefined ? body[f] : null; });

  const status    = action === 'submit' ? 'submitted' : 'draft';
  const submitted = action === 'submit' ? "datetime('now','localtime')" : null;

  const existing = db.prepare('SELECT id, status FROM studio_reviews WHERE studio = ? AND month = ?').get(studio, month);

  if (existing) {
    if (existing.status === 'validated') {
      return res.status(403).json({ error: 'Revue déjà validée, modification impossible' });
    }
    // Utiliser UNIQUEMENT des paramètres nommés (pas de mix avec ?)
    const setClause = fields.map(f => `${f} = @${f}`).join(', ')
      + `, status = @_status, updated_at = datetime('now','localtime')`
      + (action === 'submit' ? `, submitted_at = datetime('now','localtime')` : '');
    db.prepare(`UPDATE studio_reviews SET ${setClause} WHERE studio = @_studio AND month = @_month`)
      .run({ ...vals, _status: status, _studio: studio, _month: month });
  } else {
    const colNames = ['coach_id','studio','month','status', ...fields].join(', ');
    const colVals  = ['@coach_id','@studio','@month','@status', ...fields.map(f => '@' + f)].join(', ');
    db.prepare(`INSERT INTO studio_reviews (${colNames}) VALUES (${colVals})`)
      .run({ coach_id: coachId, studio, month, status, ...vals });
    if (action === 'submit') {
      db.prepare("UPDATE studio_reviews SET submitted_at = datetime('now','localtime') WHERE studio = @_studio AND month = @_month")
        .run({ _studio: studio, _month: month });
    }
  }

  const review = db.prepare('SELECT * FROM studio_reviews WHERE studio = ? AND month = ?').get(studio, month);
  res.json({ ok: true, review });
});

// POST /api/studio-review/:studio/:month/validate — DR valide la revue
app.post('/api/coach/studio-review/:studio/:month/validate', requireAuth, (req, res) => {
  const db = getDb();
  const s = req.session;
  if (s.role !== 'director' && s.role !== 'admin') {
    return res.status(403).json({ error: 'Réservé au directeur' });
  }
  const studio = decodeURIComponent(req.params.studio);
  const month  = req.params.month;
  const { dr_comment } = req.body;
  db.prepare(`
    UPDATE studio_reviews SET status = 'validated',
      dr_comment = ?, validated_at = datetime('now','localtime'), updated_at = datetime('now','localtime')
    WHERE studio = ? AND month = ?
  `).run((dr_comment || '').trim(), studio, month);
  res.json({ ok: true });
});

// POST /api/studio-review/:studio/:month/reopen — admin réouvre
app.post('/api/coach/studio-review/:studio/:month/reopen', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const studio = decodeURIComponent(req.params.studio);
  const month  = req.params.month;
  db.prepare(`
    UPDATE studio_reviews SET status = 'draft', validated_at = NULL, updated_at = datetime('now','localtime')
    WHERE studio = ? AND month = ?
  `).run(studio, month);
  res.json({ ok: true });
});

// GET /api/studio-reviews/:month — liste toutes les revues du mois (directeur/admin)
app.get('/api/coach/studio-reviews/:month', requireAuth, (req, res) => {
  const db = getDb();
  const s = req.session;
  if (s.role !== 'director' && s.role !== 'admin') {
    return res.status(403).json({ error: 'Accès non autorisé' });
  }
  const reviews = db.prepare('SELECT * FROM studio_reviews WHERE month = ? ORDER BY studio ASC').all(req.params.month);
  res.json({ reviews });
});

// ─── Suivi DR hebdomadaire ───────────────────────────────────

// GET /api/dr-weekly/list — liste des rapports (12 derniers)
app.get('/api/coach/dr-weekly/list', requireAuth, (req, res) => {
  const s = req.session;
  if (s.role !== 'director' && s.role !== 'admin') {
    return res.status(403).json({ error: 'Accès non autorisé' });
  }
  const db = getDb();
  const reports = db.prepare(
    'SELECT * FROM dr_weekly_reports ORDER BY week DESC LIMIT 12'
  ).all();
  res.json({ reports });
});

// GET /api/dr-weekly/:week — rapport d'une semaine précise
app.get('/api/coach/dr-weekly/:week', requireAuth, (req, res) => {
  const s = req.session;
  if (s.role !== 'director' && s.role !== 'admin') {
    return res.status(403).json({ error: 'Accès non autorisé' });
  }
  const db = getDb();
  const report = db.prepare(
    'SELECT * FROM dr_weekly_reports WHERE week = ?'
  ).get(req.params.week) || null;
  res.json({ report });
});

// PUT /api/dr-weekly/:week — enregistrer / mettre à jour un rapport
app.put('/api/coach/dr-weekly/:week', requireAuth, (req, res) => {
  const s = req.session;
  if (s.role !== 'director' && s.role !== 'admin') {
    return res.status(403).json({ error: 'Accès non autorisé' });
  }
  const week = req.params.week;
  if (!/^\d{4}-W\d{2}$/.test(week)) {
    return res.status(400).json({ error: 'Format semaine invalide (YYYY-Www)' });
  }
  const db = getDb();
  const fields = [
    'top_leader_1','top_leader_1_comment','top_leader_2','top_leader_2_comment',
    'flop_leader_1','flop_leader_1_comment','flop_leader_2','flop_leader_2_comment',
    'top_club_1','top_club_1_comment','top_club_2','top_club_2_comment',
    'flop_club_1','flop_club_1_comment','flop_club_2','flop_club_2_comment',
    'priority_1','priority_2','priority_3','arbitrage'
  ];
  const vals = { week };
  for (const f of fields) {
    vals[f] = String(req.body[f] || '').trim().substring(0, 200);
  }
  db.prepare(`
    INSERT INTO dr_weekly_reports (week, ${fields.join(', ')})
    VALUES (@week, ${fields.map(f => '@' + f).join(', ')})
    ON CONFLICT(week) DO UPDATE SET
      ${fields.map(f => `${f} = @${f}`).join(', ')},
      updated_at = datetime('now','localtime')
  `).run(vals);
  const report = db.prepare('SELECT * FROM dr_weekly_reports WHERE week = ?').get(week);
  res.json({ ok: true, report });
});

// ─── Nouveaux — stockage permanent par club (indépendant du mois) ────
// Utilise month = '_nouveaux' comme clé fixe dans monthly_data
const NV_MONTH = '_nouveaux';

function parseNouveaux(raw) {
  if (!raw) return [];
  try { const p = JSON.parse(raw); if (Array.isArray(p)) return p; } catch(e) {}
  // legacy comma-separated
  return raw.split(',').map(n => n.trim()).filter(Boolean)
            .map(name => ({ name, sa: false, leader_ok: false, created_at: new Date().toISOString() }));
}

function getNouveauxLeader(db, club) {
  return db.prepare("SELECT id FROM coaches WHERE studio = ? AND is_leader = 1 AND archived = 0 LIMIT 1").get(club);
}

function filterNouveaux30j(entries) {
  const now = Date.now();
  return entries.filter(e => {
    if (!e.created_at) return true; // pas de date = on garde
    return (now - new Date(e.created_at).getTime()) < 30 * 24 * 60 * 60 * 1000;
  });
}

function saveNouveauxRaw(db, leaderId, entries) {
  db.prepare(`INSERT INTO monthly_data (coach_id, month, les_sa)
    VALUES (?, ?, ?)
    ON CONFLICT(coach_id, month) DO UPDATE SET les_sa = excluded.les_sa,
    updated_at = datetime('now','localtime')`).run(leaderId, NV_MONTH, JSON.stringify(entries));
}

// GET — leader ou admin
app.get('/api/coach/club-nouveaux/:club', requireAuth, (req, res) => {
  const { club } = req.params;
  const db = getDb();
  const leader = getNouveauxLeader(db, club);
  if (!leader) return res.json({ entries: [] });
  const row = db.prepare('SELECT les_sa FROM monthly_data WHERE coach_id = ? AND month = ?').get(leader.id, NV_MONTH);
  const all = parseNouveaux(row?.les_sa);
  const fresh = filterNouveaux30j(all);
  // Auto-clean si des entrées ont expiré
  if (fresh.length < all.length) saveNouveauxRaw(db, leader.id, fresh);
  res.json({ entries: fresh });
});

// PUT — admin : sauvegarde la liste complète
app.put('/api/coach/club-nouveaux/:club', requireAuth, (req, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { club } = req.params;
  const { entries } = req.body;
  const db = getDb();
  const leader = getNouveauxLeader(db, club);
  if (!leader) return res.status(404).json({ error: `Aucun leader pour ${club}` });
  // Récupérer les created_at existants pour les préserver
  const row = db.prepare('SELECT les_sa FROM monthly_data WHERE coach_id = ? AND month = ?').get(leader.id, NV_MONTH);
  const existing = parseNouveaux(row?.les_sa);
  const existingMap = Object.fromEntries(existing.map(e => [e.name, e]));
  const merged = (entries || []).map(e => ({
    ...e,
    created_at: existingMap[e.name]?.created_at || new Date().toISOString(),
  }));
  saveNouveauxRaw(db, leader.id, merged);
  res.json({ ok: true });
});

// PATCH — leader : toggle leader_ok sur un nom
app.patch('/api/coach/club-nouveaux/:club/ok', requireAuth, (req, res) => {
  const { club } = req.params;
  const { name, leader_ok, leader_croix_ok } = req.body;
  const s = req.session;
  const db = getDb();
  if (s.role !== 'admin') {
    if (!s.is_leader || !s.coach_id) return res.status(403).json({ error: 'Non autorisé' });
    const myCoach = db.prepare('SELECT studio FROM coaches WHERE id = ?').get(s.coach_id);
    if (myCoach?.studio !== club) return res.status(403).json({ error: 'Non autorisé' });
  }
  const leader = getNouveauxLeader(db, club);
  if (!leader) return res.status(404).json({ error: 'No leader' });
  const row = db.prepare('SELECT les_sa FROM monthly_data WHERE coach_id = ? AND month = ?').get(leader.id, NV_MONTH);
  const entries = filterNouveaux30j(parseNouveaux(row?.les_sa));
  const patch = {};
  if (leader_ok        !== undefined) patch.leader_ok        = !!leader_ok;
  if (leader_croix_ok  !== undefined) patch.leader_croix_ok  = !!leader_croix_ok;
  const updated = entries.map(e => e.name === name ? { ...e, ...patch } : e);
  saveNouveauxRaw(db, leader.id, updated);
  res.json({ ok: true });
});

// ─── Start ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Serveur Coach démarré sur http://localhost:${PORT}`);
  getDb();
});
}; // end mountCoachRoutes
