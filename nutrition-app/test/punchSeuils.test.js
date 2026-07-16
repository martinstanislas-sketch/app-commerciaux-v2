'use strict';
// Fondation du système Punch : la config des seuils (source de vérité unique) et
// le moteur de déblocage. Le compteur est CUMULÉ et ne descend jamais.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const {
  PUNCH_MAX_THEORIQUE, VIDEO_LOTS, EBOOK_TIERS, GIFTS,
  tousLesSeuils, seuilsAtteints, cleSeuil, prochainSeuil,
} = require('../lib/punchSeuils');
const createChallengeEngine = require('../lib/challengePath');

function makeEngine() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
    CREATE TABLE nutrition_parcours_pesees (client_email TEXT, type TEXT, date TEXT, PRIMARY KEY(client_email, type));
    CREATE TABLE nutrition_clients (email TEXT PRIMARY KEY, data TEXT);
    CREATE TABLE nutrition_client_meta (client_email TEXT PRIMARY KEY, ville TEXT DEFAULT '', challenge_no INTEGER DEFAULT 0, updated_at TEXT DEFAULT '');
    CREATE TABLE nutrition_access_codes (ville TEXT, challenge_no INTEGER, code TEXT, actif INTEGER DEFAULT 1, start_date TEXT NOT NULL DEFAULT '', updated_at TEXT DEFAULT '', PRIMARY KEY (ville, challenge_no));
    CREATE TABLE nutrition_parcours_photos (id INTEGER PRIMARY KEY AUTOINCREMENT, client_email TEXT, jalon TEXT, type TEXT, data TEXT, mime TEXT, auteur_role TEXT, auteur_id INTEGER, created_at TEXT);
  `);
  const engine = createChallengeEngine({ getDb: () => db });
  engine.ensureChallengePathSchema();
  db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('challenge_path_enabled','on','')").run();
  db.prepare('INSERT INTO nutrition_clients (email, data) VALUES (?,?)').run('a@a.fr', JSON.stringify({ startDate: '2020-01-01' }));
  return { db, engine, email: 'a@a.fr' };
}
const punchDe = (db, email) => db.prepare('SELECT punch FROM user_game_stats WHERE client_email=?').get(email).punch;

// --- La config : source de vérité unique ------------------------------------
test('seuils : AUCUN ne dépasse le maximum atteignable (2395)', () => {
  const max = Math.max(...tousLesSeuils().map((s) => s.seuil));
  assert.equal(PUNCH_MAX_THEORIQUE, 2395, 'parcours 1180 + série 1215');
  assert.ok(max <= PUNCH_MAX_THEORIQUE, `seuil ${max} inatteignable (> ${PUNCH_MAX_THEORIQUE})`);
  tousLesSeuils().forEach((s) => assert.ok(s.seuil > 0 && s.seuil <= PUNCH_MAX_THEORIQUE, `seuil ${s.seuil} hors bornes`));
});

test('seuils : un seul objet contient vidéos + ebooks + cadeaux', () => {
  const tous = tousLesSeuils();
  assert.equal(tous.filter((s) => s.type === 'video').length, VIDEO_LOTS.length);
  assert.equal(tous.filter((s) => s.type === 'ebook').length, Object.keys(EBOOK_TIERS).length);
  assert.equal(tous.filter((s) => s.type === 'gift').length, Object.keys(GIFTS).length);
  // Triés par seuil croissant -> l'ordre de déblocage est lisible.
  const seuils = tous.map((s) => s.seuil);
  assert.deepEqual(seuils, [...seuils].sort((a, b) => a - b));
});

test('seuils : un même seuil peut porter DEUX récompenses (800, 1050)', () => {
  // 800 = ebooks + cadeau, 1050 = vidéos + ebooks : l'identité est (seuil, type),
  // sinon le second déblocage serait avalé.
  assert.deepEqual(tousLesSeuils().filter((s) => s.seuil === 800).map((s) => s.type).sort(), ['ebook', 'gift']);
  assert.deepEqual(tousLesSeuils().filter((s) => s.seuil === 1050).map((s) => s.type).sort(), ['ebook', 'video']);
  const cles = tousLesSeuils().map(cleSeuil);
  assert.equal(new Set(cles).size, cles.length, 'chaque (seuil, type) est unique');
});

test('seuilsAtteints : rend ce qui est atteint et pas encore acquis', () => {
  assert.deepEqual(seuilsAtteints(100, []), [], 'sous le 1er seuil : rien');
  assert.deepEqual(seuilsAtteints(150, []).map(cleSeuil), ['150:ebook']);
  assert.deepEqual(seuilsAtteints(150, ['150:ebook']), [], 'déjà acquis -> plus rien');
  assert.deepEqual(seuilsAtteints(800, []).map(cleSeuil), ['150:ebook', '250:video', '350:ebook', '450:gift', '550:ebook', '650:video', '800:ebook', '800:gift']);
});

test('prochainSeuil : ce qu\'il reste à viser', () => {
  assert.equal(prochainSeuil(0).seuil, 150);
  assert.equal(prochainSeuil(150).seuil, 250);
  assert.equal(prochainSeuil(2395), null, 'tout est débloqué au maximum');
});

// --- addPunch : le point de passage unique ----------------------------------
test('addPunch : incrémente le total et déclenche les déblocages', () => {
  const { engine, db, email } = makeEngine();
  engine.pathStatsRow(email);
  assert.deepEqual(engine.addPunch(email, 100, 'test'), [], '100 : aucun seuil');
  assert.equal(punchDe(db, email), 100);
  const n = engine.addPunch(email, 50, 'test'); // total 150 -> 1er palier ebook
  assert.deepEqual(n.map(cleSeuil), ['150:ebook']);
  assert.equal(punchDe(db, email), 150);
});

test('addPunch : chaque seuil ne se débloque QU\'UNE fois', () => {
  const { engine, db, email } = makeEngine();
  engine.pathStatsRow(email);
  engine.addPunch(email, 150, 'test');
  assert.deepEqual(engine.addPunch(email, 10, 'test'), [], 'repasser au-dessus ne redonne rien');
  assert.deepEqual(engine.evaluateUnlocks(email), [], 'ré-évaluer non plus (idempotent)');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM user_unlocks WHERE client_email=?').get(email).c, 1);
});

test('addPunch : un gros gain débloque TOUT ce qu\'il franchit d\'un coup', () => {
  const { engine, email } = makeEngine();
  engine.pathStatsRow(email);
  const n = engine.addPunch(email, 800, 'test');
  assert.deepEqual(n.map(cleSeuil), ['150:ebook', '250:video', '350:ebook', '450:gift', '550:ebook', '650:video', '800:ebook', '800:gift']);
  assert.equal(n.filter((s) => s.seuil === 800).length, 2, 'les DEUX récompenses du seuil 800');
});

test('addPunch : un gain nul ou négatif ne fait rien (le Punch ne descend jamais)', () => {
  const { engine, db, email } = makeEngine();
  engine.pathStatsRow(email);
  engine.addPunch(email, 200, 'test');
  const avant = punchDe(db, email);
  engine.addPunch(email, 0, 'test');
  engine.addPunch(email, -500, 'test');
  assert.equal(punchDe(db, email), avant, 'aucun débit possible');
});

// --- Les sources réelles créditent bien le compteur -------------------------
test('source PARCOURS : valider une étape passe par addPunch et évalue les seuils', () => {
  const { engine, db, email } = makeEngine();
  engine.pathStatsRow(email);
  engine.addPunch(email, 100, 'amorce'); // on approche du 1er seuil (150)
  // L'étape 0 vaut 80 Punch : elle doit franchir 150 et débloquer.
  ['face', 'profil', 'dos'].forEach((t) => db.prepare("INSERT INTO nutrition_parcours_photos (client_email, jalon, type, data, mime, auteur_role, created_at) VALUES (?,'depart',?,'x','image/jpeg','client','')").run(email, t));
  engine.awardClientEvent(email, 'photo', 'x');
  engine.awardClientEvent(email, 'mensurations', 'x');
  engine.awardClientEvent(email, 'groupe', 'x');
  assert.equal(punchDe(db, email), 180, '100 + 80 (étape Commencer)');
  assert.ok(engine.unlockedThresholds(email).has('150:ebook'), 'le parcours crédite et débloque');
});

test('source SÉRIE : un palier passe par addPunch et évalue les seuils', () => {
  const { engine, db, email } = makeEngine();
  engine.pathStatsRow(email);
  engine.addPunch(email, 140, 'amorce'); // 140 : juste sous le seuil 150
  const hier = require('../lib/challengePath').pathYmdMinusDays(require('../lib/challengePath').pathParisYmd(), 1);
  db.prepare("UPDATE user_game_stats SET streak_current=2, last_win_date=? WHERE client_email=?").run(hier, email);
  const r = engine.recordDayWin(email, 2); // 3e jour -> palier +15 -> total 155
  assert.deepEqual(r.palier, { jours: 3, punch: 15 });
  assert.equal(punchDe(db, email), 155);
  assert.deepEqual((r.debloques || []).map(cleSeuil), ['150:ebook'], 'le palier a franchi le seuil');
});

test('état public : les déblocages et le prochain seuil sont exposés au front', () => {
  const { engine, email } = makeEngine();
  engine.pathStatsRow(email);
  engine.addPunch(email, 300, 'test');
  const st = engine.challengePublicState(email);
  assert.deepEqual(st.unlocks.sort(), ['150:ebook', '250:video']);
  assert.equal(st.prochainSeuil.seuil, 350, 'le front peut dire « encore 50 Punch »');
  assert.equal(st.stats.punch, 300);
});
