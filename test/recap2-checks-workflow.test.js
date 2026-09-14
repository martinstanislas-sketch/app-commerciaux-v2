'use strict';
// ============================================================================
//  CASES DE CONTRÔLE MANUEL, DE BOUT EN BOUT, CONTRE UN VRAI SERVEUR.
//
//  Le scénario demandé, tel qu'il se joue à l'écran :
//    coche prélèvement -> rechargement -> toujours coché -> coche réservation
//    (depuis la vue commercial : même API, même vente) -> visible côté studio
//    -> NOUVELLE COLLECTE (JSON vierge redéposé) -> les deux restent
//    -> REDÉMARRAGE du serveur sur la même base (= redéploiement) -> idem.
//  Et à chaque étape : les KPI ne bougent pas d'un chiffre.
// ============================================================================

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const S = require('../lib/recap2Store.js');

const BAC = fs.mkdtempSync(path.join(os.tmpdir(), 'recap2-ctl-'));
const PORT = 3977;
const BASE = 'http://127.0.0.1:' + PORT;
const CLE = 'cle-de-test-tres-longue-0123456789';
const PIN = 'pin-de-test-controles';
let serveur, jeton;

const ligne = (o) => Object.assign({ client: 'X', date: '05/08/2026', prestation: 'Challenge', commercial: 'Cédric H.',
  annulee: false, dateAnnulation: '', retrouve: true, site: 'My Coach Wasquehal', dateVente: '27/08/2026', idClient: '42131', encaisse: false }, o);
const studio = (nom) => ({
  studio: nom,
  nonReconduction: { base: 4, nonReconduits: 1, taux: 0.25, tauxPct: 25, liste: [{ client: 'DUPONT Marie', netM1: 60, netM: 0 }] },
  clientsRetrouves: {
    ventesSignees: 3, annulees: 1, ventesActives: 2, signataires: 2, retrouves: 1, taux: 0.5, tauxPct: 50,
    liste: [
      ligne({ client: 'Mustapha Teir', date: '12/08/2026' }),
      ligne({ client: 'Ritha Konzo', date: '06/08/2026', retrouve: false, site: '', dateVente: '', idClient: '', commercial: 'Fabian F.' }),
      ligne({ client: 'Dei Muteba', date: '10/08/2026', annulee: true, dateAnnulation: '24/08/2026', retrouve: false, site: '', dateVente: '', idClient: '' }),
    ],
  },
  avertissements: [], controleBloquant: { ok: true, detail: {} },
});
const rapport = () => ({
  businessVersion: 2, genere: new Date().toISOString(), mois: '2026-08', m1: '2026-07', source: { fitnessBooster: {} },
  studios: Object.fromEntries(S.LABELS.map((s) => [s, studio(s)])), journal: [], erreurs: [],
});

const demarrer = async () => {
  serveur = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT), DB_DIR: BAC, RECAP2_INGEST_KEY: CLE, ADMIN_PIN: PIN }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serveur.stdout.resume(); serveur.stderr.resume();
  for (let i = 0; i < 100; i++) {
    try { await fetch(BASE + '/api/recap2/2026-08'); break; } catch (_) { await new Promise((r) => setTimeout(r, 100)); }
  }
  const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: PIN }) });
  jeton = (await r.json()).token;
  assert.ok(jeton, 'session admin');
};
const arreter = () => new Promise((ok) => { if (!serveur) return ok(); serveur.once('exit', ok); serveur.kill(); });
const deposer = (corps) => fetch(BASE + '/api/recap2/2026-08', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Recap2-Key': CLE }, body: JSON.stringify(corps) });
const lire = async () => {
  const r = await fetch(BASE + '/api/recap2/2026-08', { headers: { Authorization: 'Bearer ' + jeton } });
  assert.equal(r.status, 200);
  return r.json();
};
const cocher = (o, auth = true) => fetch(BASE + '/api/recap2/checks', {
  method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth ? { Authorization: 'Bearer ' + jeton } : {}),
  body: JSON.stringify(Object.assign({ mois: '2026-08', studio: 'Marcq', client: 'Mustapha Teir', date: '12/08/2026' }, o)),
});
const teir = (r, s = 'Marcq') => r.studios[s].clientsRetrouves.liste.find((l) => l.client === 'Mustapha Teir');
const kpi = (r) => S.LABELS.map((s) => { const c = r.studios[s].clientsRetrouves; return [c.signataires, c.retrouves, c.taux, c.tauxPct].join('/'); }).join(' ');
let KPI0;

before(async () => {
  await demarrer();
  assert.equal((await deposer(rapport())).status, 200, 'dépôt initial');
  KPI0 = kpi(await lire());
});
after(async () => { await arreter(); try { fs.rmSync(BAC, { recursive: true, force: true }); } catch (_) {} });

test('au départ : deux cases vides sur chaque vente', async () => {
  const r = await lire();
  assert.deepEqual([teir(r).controle.prelevement, teir(r).controle.reservation], [false, false]);
});

test('coche PRÉLÈVEMENT (vue studio) -> enregistré, avec l\'utilisateur', async () => {
  const rep = await cocher({ champ: 'prelevement', valeur: true });
  assert.equal(rep.status, 200);
  const j = await rep.json();
  assert.equal(j.controle.prelevement, true);
  assert.equal(j.controle.reservation, false);
  assert.ok(j.controle.modifieLe);
});

test('REFRESH : toujours coché', async () => {
  const r = await lire();
  assert.equal(teir(r).controle.prelevement, true);
  assert.equal(teir(r).controle.reservation, false);
});

test('coche RÉSERVATION depuis la vue commercial -> visible côté studio, prélèvement conservé', async () => {
  // La vue commercial envoie la même vente (studio d'origine porté par la ligne).
  assert.equal((await cocher({ champ: 'reservation', valeur: true })).status, 200);
  const r = await lire();
  assert.deepEqual([teir(r).controle.prelevement, teir(r).controle.reservation], [true, true]);
  assert.deepEqual([teir(r, 'Lille').controle.prelevement, teir(r, 'Lille').controle.reservation], [false, false],
    'le même nom dans un autre studio garde ses propres cases');
});

test('NOUVELLE COLLECTE (JSON vierge redéposé) : les deux contrôles restent', async () => {
  const frais = rapport();
  assert.equal(frais.studios.Marcq.clientsRetrouves.liste[0].controle, undefined, 'le JSON déposé ignore tout des cases');
  assert.equal((await deposer(frais)).status, 200);
  const r = await lire();
  assert.deepEqual([teir(r).controle.prelevement, teir(r).controle.reservation], [true, true]);
  const brut = JSON.parse(fs.readFileSync(path.join(BAC, 'recap2', 'recap2-2026-08.json'), 'utf8'));
  assert.equal(brut.studios.Marcq.clientsRetrouves.liste[0].controle, undefined, 'le fichier sur disque reste brut');
});

test('REDÉMARRAGE du serveur sur la même base (redéploiement) : toujours là', async () => {
  await arreter();
  await demarrer();   // nouvelle session : équivaut aussi à une reconnexion
  const r = await lire();
  assert.deepEqual([teir(r).controle.prelevement, teir(r).controle.reservation], [true, true]);
});

test('décocher une case n\'efface pas l\'autre', async () => {
  assert.equal((await cocher({ champ: 'prelevement', valeur: false })).status, 200);
  const r = await lire();
  assert.deepEqual([teir(r).controle.prelevement, teir(r).controle.reservation], [false, true]);
});

test('AUCUN KPI ne bouge, à aucune étape', async () => {
  assert.equal(kpi(await lire()), KPI0);
});

test('refus : sans session, champ inconnu, valeur non booléenne, vente absente, studio inconnu', async () => {
  assert.equal((await cocher({ champ: 'prelevement', valeur: true }, false)).status, 401);
  assert.equal((await cocher({ champ: 'paiement', valeur: true })).status, 400);
  assert.equal((await cocher({ champ: 'prelevement', valeur: 'oui' })).status, 400);
  assert.equal((await cocher({ champ: 'prelevement', valeur: true, client: 'Personne Inventée' })).status, 404);
  assert.equal((await cocher({ champ: 'prelevement', valeur: true, studio: 'Caen' })).status, 400);
  assert.equal((await cocher({ champ: 'prelevement', valeur: true, mois: '2026-11' })).status, 404, 'mois sans rapport');
});
