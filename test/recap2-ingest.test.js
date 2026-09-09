'use strict';
// RECAP 2 — le DÉPÔT, de bout en bout, contre un vrai serveur.
//
// Ce qui se joue ici tient en une phrase : le JSON contient des noms de clients,
// donc une seule clé ouvre l'écriture, une seule session ouvre la lecture, et
// rien d'autre n'entre. On boote server.js sur un DB_DIR jetable — aucune base
// de production n'est touchée, et aucune écriture SQL n'est faite par RECAP 2.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const BAC = fs.mkdtempSync(path.join(os.tmpdir(), 'recap2-ingest-'));
const PORT = 3971;
const BASE = 'http://127.0.0.1:' + PORT;
const CLE = 'cle-de-test-tres-longue-0123456789';
const PIN = 'pin-de-test-recap2';
let serveur, jetonAdmin;

const S = require('../lib/recap2Store.js'); // seulement pour LABELS / moisPrecedent

const studio = (nom) => ({
  studio: nom,
  nonReconduction: { base: 4, nonReconduits: 1, taux: 0.25, tauxPct: 25, liste: [{ client: 'DUPONT Marie', netM1: 60, netM: 0 }] },
  completion: { contratsSouscrits: 2, annulesExclus: 0, contratsValides: 2, ontPaye: 1, taux: 0.5, tauxPct: 50, liste: [{ contrat: 'Léa Martin', date: '06/06/2026', paye: true }, { contrat: 'Paul Durand', date: '07/06/2026', paye: false }] },
  avertissements: [], controleBloquant: { ok: true, detail: {} },
});
const rapport = (mois = '2026-07') => ({
  genere: '2026-09-09T06:41:37.896Z', mois, m1: S.moisPrecedent(mois),
  source: { fitnessBooster: {} },
  studios: Object.fromEntries(S.LABELS.map((s) => [s, studio(s)])),
  journal: [], erreurs: [],
});

const poster = (mois, corps, cle) => fetch(BASE + '/api/recap2/' + mois, {
  method: 'POST',
  headers: Object.assign({ 'Content-Type': 'application/json' }, cle ? { 'X-Recap2-Key': cle } : {}),
  body: typeof corps === 'string' ? corps : JSON.stringify(corps),
});
const lire = (mois, jeton) => fetch(BASE + '/api/recap2/' + mois, {
  headers: jeton ? { Authorization: 'Bearer ' + jeton } : {},
});

before(async () => {
  serveur = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: Object.assign({}, process.env, {
      PORT: String(PORT), DB_DIR: BAC, RECAP2_INGEST_KEY: CLE, ADMIN_PIN: PIN,
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serveur.stdout.resume(); serveur.stderr.resume();
  // On attend que le port réponde plutôt qu'un délai arbitraire.
  for (let i = 0; i < 100; i++) {
    try { await fetch(BASE + '/api/recap2/2026-07'); break; }
    catch (_) { await new Promise((r) => setTimeout(r, 100)); }
  }
  const r = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: PIN }),
  });
  jetonAdmin = (await r.json()).token;
  assert.ok(jetonAdmin, 'connexion admin de test');
});

after(() => { if (serveur) serveur.kill(); });

// ── LE DÉPÔT EST FERMÉ PAR DÉFAUT ───────────────────────────────────────────
test('POST sans clé : refusé', async () => {
  const r = await poster('2026-07', rapport());
  assert.equal(r.status, 401);
});

test('POST avec une mauvaise clé : refusé', async () => {
  const r = await poster('2026-07', rapport(), CLE + 'x');
  assert.equal(r.status, 401);
  assert.equal(fs.existsSync(path.join(BAC, 'recap2', 'recap2-2026-07.json')), false, 'rien n\'a été écrit');
});

// ── VALIDATION AVANT ÉCRITURE ───────────────────────────────────────────────
test('POST d\'un rapport mal formé : refusé, et rien sur le disque', async () => {
  const mauvais = rapport(); mauvais.studios.Lille.nonReconduction.taux = 0.99;
  const r = await poster('2026-07', mauvais, CLE);
  assert.equal(r.status, 422);
  const j = await r.json();
  assert.match(j.problemes.join(' '), /taux : incohérent/);
  assert.equal(fs.existsSync(path.join(BAC, 'recap2', 'recap2-2026-07.json')), false);
});

test('POST d\'un mois qui n\'est pas celui du fichier : refusé', async () => {
  const r = await poster('2026-08', rapport('2026-07'), CLE);
  assert.equal(r.status, 422);
});

test('POST d\'un mois hors format : refusé', async () => {
  assert.equal((await poster('2026-13', rapport(), CLE)).status, 400);
});

// ── LE CHEMIN NOMINAL ───────────────────────────────────────────────────────
test('POST valide : écrit dans DB_DIR/recap2, sans résidu ni écriture SQL', async () => {
  const avantBase = fs.statSync(path.join(BAC, 'data.db')).mtimeMs;
  const r = await poster('2026-07', rapport(), CLE);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.studios, 6);
  assert.equal(JSON.stringify(j).includes('DUPONT'), false, 'l\'accusé ne renvoie aucun nom');
  const dossier = path.join(BAC, 'recap2');
  assert.deepEqual(fs.readdirSync(dossier), ['recap2-2026-07.json'], 'un fichier, pas de .tmp ni de .bak');
  assert.equal(fs.statSync(path.join(BAC, 'data.db')).mtimeMs, avantBase, 'la base n\'a pas bougé');
});

test('POST deux fois : le mois est remplacé, jamais dupliqué', async () => {
  const r2 = rapport(); r2.genere = '2026-09-10T09:00:00.000Z';
  assert.equal((await poster('2026-07', r2, CLE)).status, 200);
  assert.deepEqual(fs.readdirSync(path.join(BAC, 'recap2')), ['recap2-2026-07.json']);
  const stocke = JSON.parse(fs.readFileSync(path.join(BAC, 'recap2', 'recap2-2026-07.json'), 'utf8'));
  assert.equal(stocke.genere, '2026-09-10T09:00:00.000Z');
});

// ── LA LECTURE RESTE ADMIN ──────────────────────────────────────────────────
test('GET sans session : refusé (le fichier n\'est jamais public)', async () => {
  assert.equal((await lire('2026-07')).status, 401);
});

test('GET admin : sert le rapport déposé, détail nominatif compris', async () => {
  const r = await lire('2026-07', jetonAdmin);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.mois, '2026-07');
  assert.equal(j.m1, '2026-06');
  assert.equal(Object.keys(j.studios).length, 6);
  assert.equal(j.studios.Wasquehal.nonReconduction.liste[0].client, 'DUPONT Marie');
  assert.equal(j.studios.Wasquehal.completion.liste[1].contrat, 'Paul Durand');
});

test('GET d\'un mois non déposé : 404 explicite', async () => {
  const r = await lire('2026-01', jetonAdmin);
  assert.equal(r.status, 404);
  assert.match((await r.json()).fichierAttendu, /recap2-2026-01\.json/);
});
