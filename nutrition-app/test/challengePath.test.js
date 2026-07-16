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
    CREATE TABLE nutrition_client_meta (client_email TEXT PRIMARY KEY, ville TEXT DEFAULT '', challenge_no INTEGER DEFAULT 0, updated_at TEXT DEFAULT '');
    CREATE TABLE nutrition_access_codes (ville TEXT, challenge_no INTEGER, code TEXT, actif INTEGER DEFAULT 1, start_date TEXT NOT NULL DEFAULT '', updated_at TEXT DEFAULT '', PRIMARY KEY (ville, challenge_no));
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
    if (active === null) break; // === null : l'étape 0 est falsy
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

test('activeDayFromDone : première étape non validée (séquentiel strict, 0-based)', () => {
  assert.equal(activeDayFromDone(new Set(), 43), 0);
  assert.equal(activeDayFromDone(new Set([0, 1, 2]), 43), 3);
  assert.equal(activeDayFromDone(new Set(Array.from({ length: 43 }, (_, i) => i)), 43), null);
  // PIÈGE : l'étape 0 est falsy. « étape 0 » et « terminé » ne doivent JAMAIS
  // se confondre — tout appelant doit tester === null.
  assert.notEqual(activeDayFromDone(new Set(), 43), null, 'l\'étape 0 n\'est pas « terminé »');
});

// --- DATE DE DÉBUT DE LA COHORTE (lance le parcours pour tout le groupe) ------
// Rattache un client à un groupe daté (ville + n° de challenge + start_date).
function seedCohorte(db, email, startDate, { ville = 'Lyon', no = 3 } = {}) {
  db.prepare('INSERT OR REPLACE INTO nutrition_client_meta (client_email, ville, challenge_no) VALUES (?,?,?)').run(email, ville, no);
  db.prepare('INSERT OR REPLACE INTO nutrition_access_codes (ville, challenge_no, code, actif, start_date) VALUES (?,?,?,1,?)').run(ville, no, '482100', startDate);
}

test('cohorte : la date du groupe PRIME sur la pesée de départ individuelle', () => {
  const { db, engine, email } = makeEngine({ startDate: '2020-01-01' });
  db.prepare("INSERT INTO nutrition_parcours_pesees (client_email, type, date) VALUES (?,'depart','2020-06-01')").run(email);
  assert.equal(engine.pathStartYmd(email), '2020-06-01', 'sans cohorte : la pesée de départ fait foi');
  seedCohorte(db, email, '2020-03-15');
  assert.equal(engine.pathStartYmd(email), '2020-03-15', 'avec cohorte datée : c\'est elle qui fait foi');
});

test('cohorte : sans date posée, on retombe sur le comportement individuel', () => {
  const { db, engine, email } = makeEngine({ startDate: '2020-01-01' });
  seedCohorte(db, email, ''); // groupe SANS date -> aucune régression
  db.prepare("INSERT INTO nutrition_parcours_pesees (client_email, type, date) VALUES (?,'depart','2020-06-01')").run(email);
  assert.equal(engine.pathStartYmd(email), '2020-06-01');
  assert.equal(engine.cohortStartYmd(email), '');
});

test('cohorte : une date FUTURE tient le chemin verrouillé jusqu\'au jour J', () => {
  const { db, engine, email } = makeEngine();
  const demain = pathYmdMinusDays(pathParisYmd(), -1); // +1 jour
  seedCohorte(db, email, demain);
  assert.ok(engine.pathCurrentDay(email) <= 0, 'le parcours ne doit pas être démarré');
  // Aucun événement ne peut valider quoi que ce soit avant le jour J.
  assert.equal(engine.awardClientEvent(email, 'photo', 'x'), null);
  assert.equal(engine.pathActiveDay(email), 0, 'l\'étape 0 reste intacte');
  const st = engine.challengePublicState(email);
  assert.equal(st.started, false);
  assert.equal(st.startsOn, demain, 'le front doit pouvoir annoncer la date');
});

test('cohorte : le jour J, le parcours s\'ouvre et les étapes se valident', () => {
  const { db, engine, email } = makeEngine();
  seedCohorte(db, email, pathParisYmd()); // démarre aujourd'hui
  assert.equal(engine.pathCurrentDay(email), 1);
  const r = engine.awardClientEvent(email, 'photo', 'x');
  assert.ok(r, 'l\'étape 0 doit être validable le jour J');
  assert.equal(r.day, 0);
  assert.equal(engine.challengePublicState(email).started, true);
});

test('cohorte : tout le groupe partage le même jour de parcours', () => {
  const { db, engine } = makeEngine({ startDate: null });
  const j5 = pathYmdMinusDays(pathParisYmd(), 4); // démarré il y a 4 jours -> jour 5
  ['a1@a.fr', 'a2@a.fr'].forEach((e) => seedCohorte(db, e, j5));
  assert.equal(engine.pathCurrentDay('a1@a.fr'), 5);
  assert.equal(engine.pathCurrentDay('a2@a.fr'), 5, 'même cohorte = même jour, quel que soit le client');
});

// --- Seed ------------------------------------------------------------------
test('seed : 43 étapes (0→42), aucune pesée, 4 jalons ★, 6 semaines bien bornées', () => {
  const { db } = makeEngine();
  const rows = db.prepare('SELECT * FROM path_nodes ORDER BY day').all();
  assert.equal(rows.length, 43);
  assert.deepEqual(rows.map((r) => r.day), Array.from({ length: 43 }, (_, i) => i), 'index 0→42 contigus');
  assert.equal(rows.filter((r) => r.type === 'pesee').length, 0, 'la pesée ne fait plus partie du parcours');
  // ★ = les 3 jalons (debut/mi/fin) + le bilan final.
  assert.deepEqual(rows.filter((r) => r.is_milestone).map((r) => r.day), [0, 21, 41, 42]);
  assert.deepEqual(rows.filter((r) => r.meta).map((r) => r.day + ':' + r.meta), ['0:debut', '21:mi', '41:fin']);
  // Découpage : S1 0–7 (8 étapes), puis 7 par semaine.
  const bornes = { 1: [0, 7], 2: [8, 14], 3: [15, 21], 4: [22, 28], 5: [29, 35], 6: [36, 42] };
  rows.forEach((r) => {
    const [a, b] = bornes[r.week];
    assert.ok(r.day >= a && r.day <= b, `étape ${r.day} hors de la semaine ${r.week}`);
  });
  assert.deepEqual(Object.keys(bornes).map((w) => rows.filter((r) => r.week === Number(w)).length), [8, 7, 7, 7, 7, 7]);
});

test('seed : types et titres conformes à la table de vérité', () => {
  const { db } = makeEngine();
  const byDay = {};
  db.prepare('SELECT * FROM path_nodes').all().forEach((r) => { byDay[r.day] = r; });
  assert.equal(byDay[0].type, 'commencer');
  assert.equal(byDay[0].title, 'Commencer');
  assert.equal(byDay[7].title, 'Bilan de la semaine');
  assert.equal(byDay[13].title, "Photo d'assiette");
  assert.equal(byDay[21].type, 'check');
  assert.equal(byDay[21].title, 'Point mi-parcours');
  assert.equal(byDay[34].title, 'Communauté');
  assert.equal(byDay[41].title, 'Point final');
  assert.equal(byDay[42].type, 'final');
  assert.equal(byDay[42].title, 'Bilan final');
  // Répartition des types sur l'ensemble.
  const n = (t) => Object.values(byDay).filter((r) => r.type === t).length;
  assert.deepEqual([n('seance'), n('ebook'), n('special'), n('bilan'), n('check')], [18, 12, 5, 4, 2]);
});

test('étapes composites : flow + jalon présents dans la donnée exposée', () => {
  const { engine, email } = makeEngine();
  const nodes = engine.challengePublicState(email).nodes;
  const at = (d) => nodes.find((n) => n.day === d);
  assert.deepEqual(at(0).flow, ['photos', 'mensurations', 'groupe']);
  assert.equal(at(0).jalon, 'debut');
  assert.deepEqual(at(21).flow, ['photos', 'mensurations']);
  assert.equal(at(21).jalon, 'mi');
  assert.deepEqual(at(41).flow, ['photos', 'mensurations']);
  assert.equal(at(41).jalon, 'fin');
  // Les étapes simples n'ont pas de flow.
  assert.equal(at(1).flow, null);
  assert.equal(at(1).jalon, '');
  // L'action (libellé du bouton) est exposée pour la Phase 2.
  assert.equal(at(1).action, 'Valider la séance');
  assert.equal(at(0).action, 'Photos + mensurations + présente-toi au groupe');
});

// --- Moteur : déblocage séquentiel -----------------------------------------
test('déblocage séquentiel : bon événement valide + avance ; mauvais événement ignoré', () => {
  const { engine, email } = makeEngine();
  assert.equal(engine.pathActiveDay(email), 0, 'on démarre à l\'étape 0 « Commencer »');
  // étape active = Commencer (photo) ; une séance ne doit RIEN valider
  assert.equal(engine.awardClientEvent(email, 'seance', 1), null);
  assert.equal(engine.pathActiveDay(email), 0);
  const r = engine.awardClientEvent(email, 'photo', 'x');
  assert.ok(r);
  assert.equal(r.day, 0);
  assert.equal(r.xp, 30);
  assert.equal(r.gems, 50);
  assert.equal(r.nextDay, 1);
  assert.equal(engine.pathActiveDay(email), 1);
});

test('composite : l\'étape 0 se valide dès la 1re sous-étape (photo) — jamais de gel', () => {
  const { engine, email } = makeEngine();
  // Décision Phase 1 : le flow est de la donnée ; la validation se fait sur la
  // 1re sous-étape pour que le parcours ne soit jamais bloqué au départ.
  assert.equal(engine.awardClientEvent(email, 'mensurations', 'x'), null, 'mensurations seules ne valident pas');
  assert.equal(engine.awardClientEvent(email, 'groupe', 'x'), null, 'un post groupe seul ne valide pas');
  assert.ok(engine.awardClientEvent(email, 'photo', 'x'), 'la photo (1re du flow) valide');
  assert.equal(engine.pathActiveDay(email), 1);
});

test('flag OFF : aucun événement ne valide', () => {
  const { engine, email } = makeEngine({ enabled: false });
  assert.equal(engine.awardClientEvent(email, 'photo', 'x'), null);
  assert.equal(engine.pathActiveDay(email), 0);
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

test('idempotence fine : revalider une étape déjà faite n\'ajoute pas d\'XP', () => {
  const { engine, email, db } = makeEngine();
  engine.awardClientEvent(email, 'photo', 'x'); // étape 0 -> done
  // La PK (client_email, node_day) bloque tout double-crédit, y compris sur l'étape 0.
  const dup = db.prepare("INSERT OR IGNORE INTO user_node_progress (client_email, node_day, completed_at) VALUES (?,?,?)").run(email, 0, 'x');
  assert.equal(dup.changes, 0); // déjà présent -> ignoré
});

test('jokers : +1 par semaine complète (S1 = 8 étapes), plafonné à 3', () => {
  const { engine, email, db } = makeEngine();
  // Compléter S1 (étapes 0..7 : 8 étapes, pas 7)
  for (let d = 0; d <= 7; d++) engine.awardClientEvent(email, eventFor(d), 'ref' + d);
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
