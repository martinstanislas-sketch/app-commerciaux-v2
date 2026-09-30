'use strict';
const test = require('node:test');
const assert = require('node:assert');
const os = require('os'); const path = require('path'); const fs = require('fs');
const Database = require('better-sqlite3');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nv2imp-'));
process.env.NUTRITION_DB = path.join(dir, 'v2.sqlite');
const { importer } = require('../tools/importer-clients-p42');
const { getDb } = require('../lib/db');

test('import P42 : simulation puis application, sans écraser un compte v2', () => {
  const srcPath = path.join(dir, 'data.db');
  const src = new Database(srcPath);
  src.exec("CREATE TABLE nutrition_clients (email TEXT PRIMARY KEY, prenom TEXT, nom TEXT, data TEXT, created_at TEXT, updated_at TEXT)");
  const plan = { besoins: { kcalCible: 1800, macros: {} }, jours: [{ jour: 'Lundi', repas: [] }] };
  const ins = src.prepare('INSERT INTO nutrition_clients VALUES (?,?,?,?,?,?)');
  ins.run('Julie@Test.fr', 'Julie', '', JSON.stringify({ profil: { objectif: 'challenge', poids_kg: 70 }, preferences: { allergies: ['gluten'] }, plan }), '2026-07-01', '');
  ins.run('marc@test.fr', 'Marc', '', JSON.stringify({ profil: { objectif: 'muscle' } }), '2026-07-02', '');
  ins.run('pasunmail', 'X', '', '{}', '', '');
  ins.run('deja@test.fr', 'Déjà', '', JSON.stringify({ profil: { objectif: 'perte' }, plan }), '', '');
  src.close();
  getDb().prepare("INSERT INTO users (email, prenom, plan, cree_le) VALUES ('deja@test.fr', 'V2', '{\"jours\":[]}', 'x')").run();

  const sim = importer(srcPath, false);
  assert.deepEqual(sim, { total: 4, importes: 2, sansPlan: 1, dejaLa: 1, emailInvalide: 1, objectifConverti: 1 });
  assert.equal(getDb().prepare('SELECT COUNT(*) n FROM users').get().n, 1, 'la simulation n\'écrit rien');

  importer(srcPath, true);
  const julie = getDb().prepare("SELECT * FROM users WHERE email = 'julie@test.fr'").get();
  assert.equal(JSON.parse(julie.profil).objectif, 'perte');
  assert.equal(JSON.parse(julie.plan).besoins.kcalCible, 1800, 'plan conservé tel quel');
  assert.equal(getDb().prepare("SELECT prenom FROM users WHERE email = 'deja@test.fr'").get().prenom, 'V2', 'compte v2 non écrasé');
});
