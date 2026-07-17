'use strict';
// Tests des MISSIONS BONUS (facultatives) : déclaration sur parole, une seule
// réponse par mission, décision finale du coach, Punch crédité SEULEMENT à la
// validation — et jamais aucun effet sur l'avancement du parcours.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createChallengeEngine } = require('../lib/challengePath');

function makeEngine() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
    CREATE TABLE nutrition_parcours_pesees (client_email TEXT, type TEXT, date TEXT, PRIMARY KEY(client_email, type));
    CREATE TABLE nutrition_clients (email TEXT PRIMARY KEY, prenom TEXT DEFAULT '', nom TEXT DEFAULT '', data TEXT);
    CREATE TABLE nutrition_client_meta (client_email TEXT PRIMARY KEY, ville TEXT DEFAULT '', challenge_no INTEGER DEFAULT 0, updated_at TEXT DEFAULT '');
    CREATE TABLE nutrition_access_codes (ville TEXT, challenge_no INTEGER, code TEXT, actif INTEGER DEFAULT 1, start_date TEXT NOT NULL DEFAULT '', updated_at TEXT DEFAULT '', PRIMARY KEY (ville, challenge_no));
    CREATE TABLE nutrition_parcours_photos (id INTEGER PRIMARY KEY AUTOINCREMENT, client_email TEXT NOT NULL DEFAULT '',
      jalon TEXT NOT NULL DEFAULT '', type TEXT NOT NULL DEFAULT '', data TEXT NOT NULL DEFAULT '', mime TEXT NOT NULL DEFAULT '',
      auteur_role TEXT NOT NULL DEFAULT '', auteur_id INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT '');
  `);
  const engine = createChallengeEngine({ getDb: () => db });
  engine.ensureChallengePathSchema();
  db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('challenge_path_enabled','on','')").run();
  db.prepare('INSERT INTO nutrition_clients (email, prenom, nom, data) VALUES (?,?,?,?)')
    .run('a@a.fr', 'Alice', 'Martin', JSON.stringify({ startDate: '2020-01-01' }));
  return { db, engine, email: 'a@a.fr' };
}

test('mission bonus : semaine 1 au départ, sans statut', () => {
  const { engine, email } = makeEngine();
  const m = engine.missionBonusEtat(email);
  assert.equal(m.week, 1);
  assert.equal(m.titre, 'Donne ton avis');
  assert.ok(m.punch > 0);
  assert.equal(m.statut, '');
});

test('mission bonus : exposée dans l’état public du parcours', () => {
  const { engine, email } = makeEngine();
  const st = engine.challengePublicState(email);
  assert.ok(st.missionBonus);
  assert.equal(st.missionBonus.week, 1);
});

test('déclaration : une seule réponse par mission, texte requis', () => {
  const { engine, email } = makeEngine();
  assert.ok(engine.declarerMissionBonus(email, '   ').error, 'texte vide -> refusé');
  assert.equal(engine.declarerMissionBonus(email, "J'ai laissé un avis Google.").ok, true);
  assert.equal(engine.missionBonusEtat(email).statut, 'declaree');
  assert.ok(engine.declarerMissionBonus(email, 'Encore !').error, 'pas de second envoi');
});

test('coach : la liste porte le client, la semaine, la mission, le texte, la date', () => {
  const { engine, email } = makeEngine();
  engine.declarerMissionBonus(email, "J'ai laissé un avis Google.");
  const rows = engine.missionsBonusDeclarees();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].client_email, email);
  assert.equal(rows[0].prenom, 'Alice');
  assert.equal(rows[0].week, 1);
  assert.equal(rows[0].mission, 'Donne ton avis');
  assert.equal(rows[0].texte, "J'ai laissé un avis Google.");
  assert.ok(rows[0].created_at);
});

test('valider crédite le Punch (une seule fois), refuser jamais', () => {
  const { engine, email } = makeEngine();
  engine.declarerMissionBonus(email, 'Fait !');
  const id = engine.missionsBonusDeclarees()[0].id;
  const avant = engine.pathStatsRow(email).punch || 0;
  const r = engine.deciderMissionBonus(id, 'valider', 'coach@mycoach.fr');
  assert.equal(r.statut, 'validee');
  assert.equal(engine.pathStatsRow(email).punch, avant + r.punch);
  assert.ok(engine.deciderMissionBonus(id, 'valider').error, 'décision finale : pas de double crédit');
  assert.equal(engine.pathStatsRow(email).punch, avant + r.punch);
  assert.equal(engine.missionBonusEtat(email).statut, 'validee');
});

test('refuser : statut refusee et zéro Punch', () => {
  const { engine, email } = makeEngine();
  engine.declarerMissionBonus(email, 'Fait !');
  const id = engine.missionsBonusDeclarees()[0].id;
  const avant = engine.pathStatsRow(email).punch || 0;
  const r = engine.deciderMissionBonus(id, 'refuser', 'coach@mycoach.fr');
  assert.equal(r.statut, 'refusee');
  assert.equal(engine.pathStatsRow(email).punch, avant);
  assert.equal(engine.missionBonusEtat(email).statut, 'refusee');
});

test('la mission ne touche pas au parcours : l’étape active ne bouge pas', () => {
  const { engine, email } = makeEngine();
  const avant = engine.pathActiveDay(email);
  engine.declarerMissionBonus(email, 'Fait !');
  const id = engine.missionsBonusDeclarees()[0].id;
  engine.deciderMissionBonus(id, 'valider');
  assert.equal(engine.pathActiveDay(email), avant);
});
