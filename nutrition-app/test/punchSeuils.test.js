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
test('seuils : AUCUN ne dépasse le maximum atteignable (4095)', () => {
  const max = Math.max(...tousLesSeuils().map((s) => s.seuil));
  assert.equal(PUNCH_MAX_THEORIQUE, 4095, 'parcours 1180 + série 1215 + missions bonus 1700');
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

test('seuils : un même seuil peut porter DEUX récompenses (320, 1350)', () => {
  // ⚠️ Les seuils suivent désormais les étapes du parcours : une récompense par
  // action. Les SEULS doublons restants sont les médailles d'avatar, dont la
  // condition est « avoir le badge » — elles tombent donc avec leur cadeau.
  // L'identité reste (seuil, type),
  // sinon le second déblocage serait avalé.
  assert.deepEqual(tousLesSeuils().filter((s) => s.seuil === 320).map((s) => s.type).sort(), ['avatar', 'gift']);
  assert.deepEqual(tousLesSeuils().filter((s) => s.seuil === 1350).map((s) => s.type).sort(), ['avatar', 'gift']);
  const cles = tousLesSeuils().map(cleSeuil);
  assert.equal(new Set(cles).size, cles.length, 'chaque (seuil, type) est unique');
});

test('seuilsAtteints : rend ce qui est atteint et pas encore acquis', () => {
  assert.deepEqual(seuilsAtteints(50, []), [], 'sous le 1er seuil : rien');
  // Le 1er palier est désormais un ACCESSOIRE d'avatar à 100 Punch : une
  // récompense très tôt, dès la 1re étape (80).
  assert.deepEqual(seuilsAtteints(80, []).map(cleSeuil), ['80:avatar']);
  assert.deepEqual(seuilsAtteints(105, ['80:avatar']).map(cleSeuil), ['105:ebook']);
  assert.deepEqual(seuilsAtteints(105, ['80:avatar', '105:ebook']), [], 'déjà acquis -> plus rien');
  assert.deepEqual(seuilsAtteints(620, []).map(cleSeuil), ['80:avatar', '105:ebook', '135:avatar', '160:ebook', '175:video', '200:gift', '260:ebook', '280:avatar', '305:video', '320:avatar', '320:gift', '345:ebook', '360:video', '385:avatar', '495:ebook', '515:gift', '540:video', '555:avatar', '580:ebook', '595:ebook', '620:gift']);
});

test('prochainSeuil : ce qu\'il reste à viser', () => {
  assert.equal(prochainSeuil(0).seuil, 80, 'le 1er objectif est un accessoire d\'avatar');
  assert.equal(prochainSeuil(105).seuil, 135);
  assert.equal(prochainSeuil(2395).seuil, 2500, 'au-delà de 2395 — le maximum du parcours — il reste le haut de gamme, réservé aux missions bonus');
  assert.equal(prochainSeuil(4095), null, 'tout est débloqué au maximum');
});

// --- addPunch : le point de passage unique ----------------------------------
test('addPunch : incrémente le total et déclenche les déblocages', () => {
  const { engine, db, email } = makeEngine();
  engine.pathStatsRow(email);
  assert.deepEqual(engine.addPunch(email, 100, 'test').map(cleSeuil), ['80:avatar'], '100 : 1er accessoire');
  assert.equal(punchDe(db, email), 100);
  const n = engine.addPunch(email, 5, 'test'); // total 105 -> 1er palier ebook
  assert.deepEqual(n.map(cleSeuil), ['105:ebook']);
  assert.equal(punchDe(db, email), 105);
});

test('addPunch : chaque seuil ne se débloque QU\'UNE fois', () => {
  const { engine, db, email } = makeEngine();
  engine.pathStatsRow(email);
  engine.addPunch(email, 105, 'test');   // 80:avatar + 105:ebook
  assert.deepEqual(engine.addPunch(email, 10, 'test'), [], 'repasser au-dessus ne redonne rien');
  assert.deepEqual(engine.evaluateUnlocks(email), [], 'ré-évaluer non plus (idempotent)');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM user_unlocks WHERE client_email=?').get(email).c, 2);
});

test('addPunch : un gros gain débloque TOUT ce qu\'il franchit d\'un coup', () => {
  const { engine, email } = makeEngine();
  engine.pathStatsRow(email);
  const n = engine.addPunch(email, 620, 'test');
  assert.deepEqual(n.map(cleSeuil), ['80:avatar', '105:ebook', '135:avatar', '160:ebook', '175:video', '200:gift', '260:ebook', '280:avatar', '305:video', '320:avatar', '320:gift', '345:ebook', '360:video', '385:avatar', '495:ebook', '515:gift', '540:video', '555:avatar', '580:ebook', '595:ebook', '620:gift']);
  assert.equal(n.filter((s) => s.seuil === 320).length, 2, 'les DEUX récompenses du seuil 320');
  // 320 porte deux récompenses : le cadeau ET la médaille d'argent qui en dépend
  // qu'il conditionne — l'identité (seuil, type) les garde distinctes.
  assert.deepEqual(n.filter((s) => s.seuil === 320).map((s) => s.type).sort(), ['avatar', 'gift']);
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
  engine.addPunch(email, 60, 'amorce'); // on approche du 1er palier de guides (105)
  // L'étape 0 vaut 80 Punch : elle doit franchir 105 et débloquer.
  ['face', 'profil', 'dos'].forEach((t) => db.prepare("INSERT INTO nutrition_parcours_photos (client_email, jalon, type, data, mime, auteur_role, created_at) VALUES (?,'depart',?,'x','image/jpeg','client','')").run(email, t));
  engine.awardClientEvent(email, 'photo', 'x');
  engine.awardClientEvent(email, 'mensurations', 'x');
  engine.awardClientEvent(email, 'groupe', 'x');
  assert.equal(punchDe(db, email), 140, '60 + 80 (étape Commencer)');
  assert.ok(engine.unlockedThresholds(email).has('105:ebook'), 'le parcours crédite et débloque');
});

test('source SÉRIE : un palier passe par addPunch et évalue les seuils', () => {
  const { engine, db, email } = makeEngine();
  engine.pathStatsRow(email);
  engine.addPunch(email, 100, 'amorce'); // 100 : juste sous le 1er palier de guides (105)
  const hier = require('../lib/challengePath').pathYmdMinusDays(require('../lib/challengePath').pathParisYmd(), 1);
  db.prepare("UPDATE user_game_stats SET streak_current=2, last_win_date=? WHERE client_email=?").run(hier, email);
  const r = engine.recordDayWin(email, 2); // 3e jour -> palier +15 -> total 115
  assert.deepEqual(r.palier, { jours: 3, punch: 15 });
  assert.equal(punchDe(db, email), 115);
  assert.deepEqual((r.debloques || []).map(cleSeuil), ['105:ebook'], 'le palier a franchi le seuil');
});

test('état public : les déblocages et le prochain seuil sont exposés au front', () => {
  const { engine, email } = makeEngine();
  engine.pathStatsRow(email);
  engine.addPunch(email, 280, 'test');
  const st = engine.challengePublicState(email);
  assert.deepEqual(st.unlocks.sort(), ['105:ebook', '135:avatar', '160:ebook', '175:video', '200:gift', '260:ebook', '280:avatar', '80:avatar']);
  assert.equal(st.prochainSeuil.seuil, 305, 'le front peut dire « encore 25 Punch »');
  assert.equal(st.stats.punch, 280);
});
