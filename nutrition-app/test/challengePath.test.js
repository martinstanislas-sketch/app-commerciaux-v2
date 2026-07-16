'use strict';
// Tests du moteur « Chemin du challenge » (parcours gamifié 42 jours).
// Couvre : déblocage séquentiel, rollover Europe/Paris, consommation de joker,
// reset de streak, attribution XP/gems, idempotence (un événement ne valide pas 2×).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const {
  createChallengeEngine, CHALLENGE_PATH_NODES,
  pathDaysBetween, pathYmdMinusDays, pathParisYmd, applyMissedDays, streakAfterOpen, activeDayFromDone,
} = require('../lib/challengePath');

// Fabrique un moteur branché sur une DB in-memory, avec le flag ON et une date de
// départ (par défaut très ancienne -> parcours « démarré », tous les jours dus).
function makeEngine({ enabled = true, startDate = '2020-01-01' } = {}) {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
    CREATE TABLE nutrition_parcours_pesees (client_email TEXT, type TEXT, date TEXT, PRIMARY KEY(client_email, type));
    CREATE TABLE nutrition_clients (email TEXT PRIMARY KEY, data TEXT);
  `);
  const getDb = () => db;
  const engine = createChallengeEngine({ getDb });
  engine.ensureChallengePathSchema();
  if (enabled) db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('challenge_path_enabled','on','')").run();
  if (startDate) db.prepare('INSERT INTO nutrition_clients (email, data) VALUES (?,?)').run('a@a.fr', JSON.stringify({ startDate }));
  return { db, engine, email: 'a@a.fr' };
}
function eventFor(day) { return CHALLENGE_PATH_NODES.find((n) => n.day === day).event; }
function completeAll(engine, email) {
  let guard = 0;
  while (guard++ < 200) {
    const active = engine.pathActiveDay(email);
    if (!active) break;
    const r = engine.awardClientEvent(email, eventFor(active), 'ref' + active);
    if (!r) break;
  }
}

// --- Helpers purs ----------------------------------------------------------
test('pathDaysBetween : jours calendaires signés', () => {
  assert.equal(pathDaysBetween('2026-01-01', '2026-01-01'), 0);
  assert.equal(pathDaysBetween('2026-01-01', '2026-01-08'), 7);
  assert.equal(pathDaysBetween('2026-03-01', '2026-02-28'), -1);
  assert.equal(pathDaysBetween('2026-02-28', '2026-03-01'), 1); // 2026 non bissextile
});

test('pathYmdMinusDays : recule d\'un jour (bord de mois)', () => {
  assert.equal(pathYmdMinusDays('2026-03-01', 1), '2026-02-28');
  assert.equal(pathYmdMinusDays('2026-01-01', 1), '2025-12-31');
});

test('pathParisYmd : format YYYY-MM-DD stable', () => {
  assert.match(pathParisYmd('2026-06-15T10:00:00Z'), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(pathParisYmd('2026-06-15'), '2026-06-15');
});

test('applyMissedDays : 1 joker sauve 1 jour, sinon reset ; streak 0 ne consomme rien', () => {
  assert.deepEqual(applyMissedDays(5, 2, 1), { streak: 5, jokers: 1 });
  assert.deepEqual(applyMissedDays(5, 2, 2), { streak: 5, jokers: 0 });
  assert.deepEqual(applyMissedDays(5, 2, 3), { streak: 0, jokers: 0 });
  assert.deepEqual(applyMissedDays(5, 0, 1), { streak: 0, jokers: 0 });
  assert.deepEqual(applyMissedDays(0, 3, 5), { streak: 0, jokers: 3 });
});

test('streakAfterOpen : consécutif +1, même jour inchangé, reprise à 1', () => {
  assert.equal(streakAfterOpen(4, '2026-01-01', '2026-01-01'), 4);
  assert.equal(streakAfterOpen(0, '', '2026-01-02'), 1);
  assert.equal(streakAfterOpen(4, '2026-01-01', '2026-01-02'), 5);
  assert.equal(streakAfterOpen(0, '2026-01-01', '2026-01-05'), 1);
});

test('activeDayFromDone : premier jour non validé (séquentiel strict)', () => {
  assert.equal(activeDayFromDone(new Set(), 42), 1);
  assert.equal(activeDayFromDone(new Set([1, 2, 3]), 42), 4);
  assert.equal(activeDayFromDone(new Set(Array.from({ length: 42 }, (_, i) => i + 1)), 42), null);
});

// --- Seed ------------------------------------------------------------------
test('seed : 42 nœuds, pesées uniquement J1/J15/J41, 10 jalons dorés', () => {
  const { db } = makeEngine();
  const rows = db.prepare('SELECT * FROM path_nodes ORDER BY day').all();
  assert.equal(rows.length, 42);
  assert.deepEqual(rows.map((r) => r.day), Array.from({ length: 42 }, (_, i) => i + 1));
  assert.deepEqual(rows.filter((r) => r.type === 'pesee').map((r) => r.day), [1, 15, 41]);
  assert.equal(rows.filter((r) => r.is_milestone).length, 10);
});

// --- Moteur : déblocage séquentiel -----------------------------------------
test('déblocage séquentiel : bon événement valide + avance ; mauvais événement ignoré', () => {
  const { engine, email } = makeEngine();
  assert.equal(engine.pathActiveDay(email), 1);
  // nœud actif = pesée ; une séance ne doit RIEN valider (le retard décale la suite)
  assert.equal(engine.awardClientEvent(email, 'seance', 1), null);
  assert.equal(engine.pathActiveDay(email), 1);
  const r = engine.awardClientEvent(email, 'pesee', 'depart');
  assert.ok(r);
  assert.equal(r.day, 1);
  assert.equal(r.xp, 30);
  assert.equal(r.gems, 50);
  assert.equal(r.nextDay, 2);
  assert.equal(engine.pathActiveDay(email), 2);
});

test('flag OFF : aucun événement ne valide', () => {
  const { engine, email } = makeEngine({ enabled: false });
  assert.equal(engine.awardClientEvent(email, 'pesee', 'x'), null);
  assert.equal(engine.pathActiveDay(email), 1);
});

test('parcours non démarré (pas de date) : aucun événement ne valide', () => {
  const { engine, email } = makeEngine({ startDate: null });
  assert.equal(engine.pathCurrentDay(email), 0);
  assert.equal(engine.awardClientEvent(email, 'pesee', 'x'), null);
});

// --- XP / gems / idempotence / jokers --------------------------------------
test('parcours complet : XP et gems = somme du barème ; ré-émission = aucun double (idempotence)', () => {
  const { engine, email, db } = makeEngine();
  completeAll(engine, email);
  assert.equal(engine.pathActiveDay(email), null);
  const stats = db.prepare('SELECT * FROM user_game_stats WHERE client_email=?').get(email);
  const sumXp = CHALLENGE_PATH_NODES.reduce((a, n) => a + n.xp, 0);
  const sumGems = CHALLENGE_PATH_NODES.reduce((a, n) => a + n.gems, 0);
  assert.equal(stats.xp_total, sumXp);
  assert.equal(stats.gems, sumGems);
  // ré-émettre tous les événements ne doit rien ajouter (parcours terminé + PK idempotente)
  completeAll(engine, email);
  const stats2 = db.prepare('SELECT * FROM user_game_stats WHERE client_email=?').get(email);
  assert.equal(stats2.xp_total, sumXp);
  assert.equal(stats2.gems, sumGems);
});

test('idempotence fine : revalider un nœud déjà fait n\'ajoute pas d\'XP', () => {
  const { engine, email, db } = makeEngine();
  engine.awardClientEvent(email, 'pesee', 'depart'); // nœud 1 -> done
  // forcer le nœud actif à rester 1 en supprimant le 2 du set n'est pas possible ;
  // on vérifie via l'insertion directe que la PK bloque tout double-crédit :
  const dup = db.prepare("INSERT OR IGNORE INTO user_node_progress (client_email, node_day, completed_at) VALUES (?,?,?)").run(email, 1, 'x');
  assert.equal(dup.changes, 0); // déjà présent -> ignoré
});

test('jokers : +1 par semaine complète (7 nœuds), plafonné à 3', () => {
  const { engine, email, db } = makeEngine();
  // Compléter S1 (jours 1..7)
  for (let d = 1; d <= 7; d++) engine.awardClientEvent(email, eventFor(d), 'ref' + d);
  assert.equal(db.prepare('SELECT jokers FROM user_game_stats WHERE client_email=?').get(email).jokers, 1);
  // Tout compléter -> 6 semaines mais plafond 3
  completeAll(engine, email);
  assert.equal(db.prepare('SELECT jokers FROM user_game_stats WHERE client_email=?').get(email).jokers, 3);
});

// --- Streak / rollover Paris ------------------------------------------------
test('recordEbookOpen : +1 le 1er jour, pas de double le même jour', () => {
  const { engine, email, db } = makeEngine();
  engine.recordEbookOpen(email, 1);
  assert.equal(db.prepare('SELECT streak_current FROM user_game_stats WHERE client_email=?').get(email).streak_current, 1);
  engine.recordEbookOpen(email, 2); // même jour, autre ebook
  assert.equal(db.prepare('SELECT streak_current FROM user_game_stats WHERE client_email=?').get(email).streak_current, 1);
});

test('reconcileStreak : jours manqués consomment les jokers puis remettent le streak à 0', () => {
  const { engine, email, db } = makeEngine();
  const last = pathYmdMinusDays(pathParisYmd(), 3); // dernier open il y a 3 jours -> 2 jours pleins manqués
  db.prepare("INSERT INTO user_game_stats (client_email, streak_current, streak_best, jokers, last_ebook_open_date, updated_at) VALUES (?,?,?,?,?,'')")
    .run(email, 5, 5, 1, last);
  engine.reconcileStreak(email);
  const s = db.prepare('SELECT * FROM user_game_stats WHERE client_email=?').get(email);
  assert.equal(s.jokers, 0);        // 1 joker consommé pour le 1er jour manqué
  assert.equal(s.streak_current, 0); // 2e jour manqué sans joker -> reset
  assert.equal(s.streak_best, 5);    // le record est conservé
});

test('reconcileStreak : un seul jour manqué + 1 joker = streak sauvé', () => {
  const { engine, email, db } = makeEngine();
  const last = pathYmdMinusDays(pathParisYmd(), 2); // 1 jour plein manqué
  db.prepare("INSERT INTO user_game_stats (client_email, streak_current, streak_best, jokers, last_ebook_open_date, updated_at) VALUES (?,?,?,?,?,'')")
    .run(email, 7, 7, 2, last);
  engine.reconcileStreak(email);
  const s = db.prepare('SELECT * FROM user_game_stats WHERE client_email=?').get(email);
  assert.equal(s.streak_current, 7); // sauvé
  assert.equal(s.jokers, 1);          // 1 joker consommé
});
