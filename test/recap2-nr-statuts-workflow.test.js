'use strict';
// ============================================================================
//  SUIVI DES NON-RECONDUITS, DE BOUT EN BOUT, CONTRE UN VRAI SERVEUR.
//
//  Le scénario demandé par Stan :
//    cocher « Sous contrôle » -> cocher « Résilié » (remplace) -> actualisation
//    -> nouvelle collecte (JSON vierge redéposé) -> redémarrage du serveur ->
//    toujours là -> décocher = aucun statut.
//  Et les garde-fous : client absent du détail refusé, statut inconnu refusé,
//  admin seulement, JSON déposé jamais réécrit, AUCUN KPI ne bouge.
// ============================================================================

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const S = require('../lib/recap2Store.js');

const BAC = fs.mkdtempSync(path.join(os.tmpdir(), 'recap2-nrstat-'));
const PORT = 3982;
const BASE = 'http://127.0.0.1:' + PORT;
const CLE = 'cle-de-test-tres-longue-0123456789';
const PIN = 'pin-de-test-suivi-nr';
let serveur, jeton;

const studio = (nom) => ({
  studio: nom,
  nonReconduction: { base: 10, nonReconduits: 3, taux: 0.3, tauxPct: 30, liste: [
    { client: 'CAMACHO Samuel', idClient: '41001', netM1: 45, netM: 0 },
    { client: 'DERAED Maxence', idClient: '41002', netM1: 69, netM: 0 },
    { client: 'SANS Identifiant', netM1: 20, netM: 0 },
  ] },
  clientsRetrouves: { ventesSignees: 0, annulees: 0, ventesActives: 0, ventesValides: 0, signataires: 0, retrouves: 0, taux: null, tauxPct: null, liste: [] },
  avertissements: [], controleBloquant: { ok: true, detail: {} },
});
const rapport = () => ({ businessVersion: 2, genere: new Date().toISOString(), mois: '2026-08', m1: '2026-07', source: { fitnessBooster: {} },
  studios: Object.fromEntries(S.LABELS.map((s) => [s, studio(s)])), journal: [], erreurs: [] });

const demarrer = async () => {
  serveur = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT), DB_DIR: BAC, RECAP2_INGEST_KEY: CLE, ADMIN_PIN: PIN }), stdio: ['ignore', 'pipe', 'pipe'] });
  serveur.stdout.resume(); serveur.stderr.resume();
  for (let i = 0; i < 100; i++) { try { await fetch(BASE + '/api/recap2/2026-08'); break; } catch (_) { await new Promise((r) => setTimeout(r, 100)); } }
  jeton = (await (await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: PIN }) })).json()).token;
  assert.ok(jeton);
};
const arreter = () => new Promise((ok) => { if (!serveur) return ok(); serveur.once('exit', ok); serveur.kill(); });
const deposer = (corps) => fetch(BASE + '/api/recap2/2026-08', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Recap2-Key': CLE }, body: JSON.stringify(corps) });
const auth = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + jeton });
const lire = async () => { const r = await fetch(BASE + '/api/recap2/2026-08', { headers: auth() }); assert.equal(r.status, 200); return r.json(); };
const marquer = (o, h = auth()) => fetch(BASE + '/api/recap2/nr-statut', { method: 'POST', headers: h,
  body: JSON.stringify(Object.assign({ mois: '2026-08', studio: 'Levallois', client: 'CAMACHO Samuel', idClient: '41001', statut: 'sous_controle' }, o)) });
const ligne = (r, client, s = 'Levallois') => r.studios[s].nonReconduction.liste.find((l) => l.client === client);
const kpi = (r) => S.LABELS.map((s) => { const n = r.studios[s].nonReconduction; return [n.base, n.nonReconduits, n.taux, n.tauxPct, n.liste.length].join('/'); }).join(' ');
const fichier = () => fs.readFileSync(path.join(BAC, 'recap2', 'recap2-2026-08.json'), 'utf8');
let KPI0, FICHIER0;

before(async () => {
  await demarrer();
  assert.equal((await deposer(rapport())).status, 200);
  const r = await lire();
  KPI0 = kpi(r);
  FICHIER0 = fichier();
  assert.deepEqual(ligne(r, 'CAMACHO Samuel').suivi, { statut: '', modifieLe: '', modifiePar: '' }, 'non traité par défaut');
});
after(async () => { await arreter(); try { fs.rmSync(BAC, { recursive: true, force: true }); } catch (_) {} });

test('cocher « Sous contrôle », puis « Résilié » : le second REMPLACE le premier', async () => {
  assert.equal((await marquer({})).status, 200);
  assert.equal(ligne(await lire(), 'CAMACHO Samuel').suivi.statut, 'sous_controle');
  const rep = await marquer({ statut: 'resilie' });
  assert.equal(rep.status, 200);
  const j = await rep.json();
  assert.equal(j.suivi.statut, 'resilie');
  assert.ok(j.suivi.modifiePar && j.suivi.modifieLe);
  const r = await lire();
  assert.equal(ligne(r, 'CAMACHO Samuel').suivi.statut, 'resilie');
  assert.equal(ligne(r, 'CAMACHO Samuel', 'Lille').suivi.statut, '', 'autre studio intact');
  assert.equal(ligne(r, 'DERAED Maxence').suivi.statut, '', 'autre client intact');
});

test('client sans Id membre : rattaché par son nom', async () => {
  assert.equal((await marquer({ client: 'SANS Identifiant', idClient: '', statut: 'a_creuser' })).status, 200);
  assert.equal(ligne(await lire(), 'SANS Identifiant').suivi.statut, 'a_creuser');
});

test('garde-fous : client absent, statut inconnu, studio inconnu, sans session', async () => {
  assert.equal((await marquer({ client: 'Personne Inventée', idClient: '' })).status, 404);
  assert.equal((await marquer({ statut: 'annule' })).status, 400);
  assert.equal((await marquer({ studio: 'Paris' })).status, 400);
  assert.equal((await marquer({}, { 'Content-Type': 'application/json' })).status, 401);
  assert.equal(ligne(await lire(), 'CAMACHO Samuel').suivi.statut, 'resilie', 'rien n\'a été écrit');
});

test('le JSON déposé n\'est jamais réécrit, et AUCUN KPI ne bouge', async () => {
  assert.equal(fichier(), FICHIER0);
  assert.equal(kpi(await lire()), KPI0);
});

test('NOUVELLE COLLECTE (JSON vierge redéposé) : les statuts restent', async () => {
  assert.equal((await deposer(rapport())).status, 200);
  const r = await lire();
  assert.equal(ligne(r, 'CAMACHO Samuel').suivi.statut, 'resilie');
  assert.equal(ligne(r, 'SANS Identifiant').suivi.statut, 'a_creuser');
});

test('REDÉMARRAGE du serveur (redéploiement) : toujours là', async () => {
  await arreter();
  await demarrer(); // nouvelle session : équivaut aussi à une reconnexion
  const r = await lire();
  assert.equal(ligne(r, 'CAMACHO Samuel').suivi.statut, 'resilie');
  assert.equal(ligne(r, 'SANS Identifiant').suivi.statut, 'a_creuser');
  assert.equal(kpi(r), KPI0);
});

test('COHABITATION avec les remarques : statut et remarque du même client sont indépendants', async () => {
  const noter = (remarque) => fetch(BASE + '/api/recap2/note', { method: 'POST', headers: auth(),
    body: JSON.stringify({ mois: '2026-08', studio: 'Levallois', type: 'non_reconduit', client: 'DERAED Maxence', idClient: '41002', remarque }) });
  assert.equal((await noter('Relancé par le coach.')).status, 200);
  assert.equal((await marquer({ client: 'DERAED Maxence', idClient: '41002', statut: 'a_creuser' })).status, 200);
  let l = ligne(await lire(), 'DERAED Maxence');
  assert.deepEqual([l.suivi.statut, l.note.remarque], ['a_creuser', 'Relancé par le coach.']);
  assert.equal((await marquer({ client: 'DERAED Maxence', idClient: '41002', statut: 'sous_controle' })).status, 200);
  assert.equal(ligne(await lire(), 'DERAED Maxence').note.remarque, 'Relancé par le coach.', 'changer le statut ne touche pas la remarque');
  assert.equal((await noter('')).status, 200);
  l = ligne(await lire(), 'DERAED Maxence');
  assert.deepEqual([l.suivi.statut, l.note.remarque], ['sous_controle', ''], 'supprimer la remarque ne touche pas le statut');
  assert.equal((await marquer({ client: 'DERAED Maxence', idClient: '41002', statut: '' })).status, 200);
  assert.equal(kpi(await lire()), KPI0);
});

test('DÉCOCHER : retour à aucun statut', async () => {
  assert.equal((await marquer({ statut: '' })).status, 200);
  const r = await lire();
  assert.equal(ligne(r, 'CAMACHO Samuel').suivi.statut, '');
  assert.equal(kpi(r), KPI0);
});
