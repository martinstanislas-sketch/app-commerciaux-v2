// ─── Routes API « Projets » ─────────────────────────────────
// Montées sous /api/projets/*. Pas d'authentification (usage perso).

const { getDb } = require('./projets-db');

const STATUSES = ['todo', 'doing', 'done'];
const PRIORITIES = ['low', 'medium', 'high'];

function touch(db, projectId) {
  db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(projectId);
}

function tasksOf(db, projectId) {
  return db.prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY done ASC, position ASC, id ASC').all(projectId);
}

function withTasks(db, project) {
  const tasks = tasksOf(db, project.id);
  const total = tasks.length;
  const done = tasks.filter(t => t.done).length;
  return { ...project, tasks, taskCount: total, taskDone: done };
}

function mountProjetsRoutes(app) {
  const db = getDb();

  // ─── Projets ──────────────────────────────────────────────

  // Liste (groupée par statut côté client). ?archived=1 pour voir les archivés.
  app.get('/api/projets', (req, res) => {
    const archived = req.query.archived === '1' ? 1 : 0;
    const projects = db.prepare(
      'SELECT * FROM projects WHERE archived = ? ORDER BY position ASC, id ASC'
    ).all(archived);
    res.json(projects.map(p => withTasks(db, p)));
  });

  // Détail
  app.get('/api/projets/:id', (req, res) => {
    const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!p) return res.status(404).json({ error: 'Projet introuvable' });
    res.json(withTasks(db, p));
  });

  // Création
  app.post('/api/projets', (req, res) => {
    const { title, description, status, priority, color, due_date } = req.body || {};
    if (!title || !title.trim()) return res.status(400).json({ error: 'Titre requis' });
    const st = STATUSES.includes(status) ? status : 'todo';
    const pr = PRIORITIES.includes(priority) ? priority : 'medium';
    const maxPos = db.prepare('SELECT COALESCE(MAX(position), 0) AS m FROM projects WHERE status = ?').get(st).m;
    const info = db.prepare(`
      INSERT INTO projects (title, description, status, priority, color, due_date, position)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      title.trim(),
      (description || '').trim(),
      st, pr,
      color || '#6366f1',
      due_date || null,
      maxPos + 1
    );
    const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(withTasks(db, p));
  });

  // Mise à jour (champs partiels)
  app.patch('/api/projets/:id', (req, res) => {
    const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!p) return res.status(404).json({ error: 'Projet introuvable' });
    const b = req.body || {};
    const fields = {};
    if (typeof b.title === 'string' && b.title.trim()) fields.title = b.title.trim();
    if (typeof b.description === 'string') fields.description = b.description.trim();
    if (STATUSES.includes(b.status)) fields.status = b.status;
    if (PRIORITIES.includes(b.priority)) fields.priority = b.priority;
    if (typeof b.color === 'string') fields.color = b.color;
    if ('due_date' in b) fields.due_date = b.due_date || null;
    if ('archived' in b) fields.archived = b.archived ? 1 : 0;
    if ('position' in b && Number.isFinite(+b.position)) fields.position = +b.position;

    const keys = Object.keys(fields);
    if (keys.length) {
      const setSql = keys.map(k => `${k} = @${k}`).join(', ');
      db.prepare(`UPDATE projects SET ${setSql}, updated_at = datetime('now') WHERE id = @id`)
        .run({ ...fields, id: p.id });
    }
    const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(p.id);
    res.json(withTasks(db, updated));
  });

  // Réordonnancement / déplacement entre colonnes (drag & drop).
  // Body : { order: [{ id, status, position }, ...] }
  app.post('/api/projets/reorder', (req, res) => {
    const order = (req.body && req.body.order) || [];
    const stmt = db.prepare('UPDATE projects SET status = ?, position = ?, updated_at = datetime(\'now\') WHERE id = ?');
    const tx = db.transaction((rows) => {
      for (const r of rows) {
        if (!STATUSES.includes(r.status)) continue;
        stmt.run(r.status, +r.position || 0, r.id);
      }
    });
    tx(order);
    res.json({ ok: true });
  });

  // Suppression
  app.delete('/api/projets/:id', (req, res) => {
    const info = db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Projet introuvable' });
    res.json({ ok: true });
  });

  // ─── Tâches ───────────────────────────────────────────────

  app.post('/api/projets/:id/taches', (req, res) => {
    const p = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id);
    if (!p) return res.status(404).json({ error: 'Projet introuvable' });
    const { title, due_date } = req.body || {};
    if (!title || !title.trim()) return res.status(400).json({ error: 'Titre requis' });
    const maxPos = db.prepare('SELECT COALESCE(MAX(position), 0) AS m FROM tasks WHERE project_id = ?').get(p.id).m;
    const info = db.prepare('INSERT INTO tasks (project_id, title, due_date, position) VALUES (?, ?, ?, ?)')
      .run(p.id, title.trim(), due_date || null, maxPos + 1);
    touch(db, p.id);
    res.status(201).json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid));
  });

  app.patch('/api/taches/:id', (req, res) => {
    const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!t) return res.status(404).json({ error: 'Tâche introuvable' });
    const b = req.body || {};
    const fields = {};
    if (typeof b.title === 'string' && b.title.trim()) fields.title = b.title.trim();
    if ('done' in b) fields.done = b.done ? 1 : 0;
    if ('due_date' in b) fields.due_date = b.due_date || null;
    const keys = Object.keys(fields);
    if (keys.length) {
      const setSql = keys.map(k => `${k} = @${k}`).join(', ');
      db.prepare(`UPDATE tasks SET ${setSql} WHERE id = @id`).run({ ...fields, id: t.id });
      touch(db, t.project_id);
    }
    res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(t.id));
  });

  app.delete('/api/taches/:id', (req, res) => {
    const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!t) return res.status(404).json({ error: 'Tâche introuvable' });
    db.prepare('DELETE FROM tasks WHERE id = ?').run(t.id);
    touch(db, t.project_id);
    res.json({ ok: true });
  });

  // ─── Statistiques (bandeau du haut) ───────────────────────
  app.get('/api/projets-stats', (req, res) => {
    const rows = db.prepare("SELECT status, COUNT(*) AS n FROM projects WHERE archived = 0 GROUP BY status").all();
    const byStatus = { todo: 0, doing: 0, done: 0 };
    for (const r of rows) byStatus[r.status] = r.n;
    const overdue = db.prepare(
      "SELECT COUNT(*) AS n FROM projects WHERE archived = 0 AND status != 'done' AND due_date IS NOT NULL AND due_date < date('now')"
    ).get().n;
    res.json({ byStatus, total: byStatus.todo + byStatus.doing + byStatus.done, overdue });
  });
}

module.exports = mountProjetsRoutes;
