'use strict';
// ============================================================================
//  COMMERCIAL RESPONSABLE D'UN NON-RECONDUIT, DE BOUT EN BOUT, CONTRE UN VRAI SERVEUR.
//
//  auto (vendeur d'origine) -> réattribution manuelle Thibault -> Luca ->
//  actualisation -> nouvelle collecte (JSON redéposé) -> redémarrage ->
//  toujours Luca -> « Non attribué » choisi -> retour à l'automatique.
//  Garde-fous : commercial inventé refusé, client absent refusé, admin seul,
//  JSON déposé jamais réécrit, statut et remarque indépendants, AUCUN KPI ne bouge.
// ============================================================================

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const S = require('../lib/recap2Store.js');
const RR = require('../public/recap2-remarques.js');

const BAC = fs.mkdtempSync(path.join(os.tmpdir(), 'recap2-nrcom-'));
const PORT = 3986;
const BASE = 'http://127.0.0.1:' + PORT;
const CLE = 'cle-de-test-tres-longue-0123456789';
const PIN = 'pin-de-test-commercial-nr';
const THIBAULT = 'id:1782814078367x500550143389292000';
const LUCA = 'id:1674481440746x588221726139669400';
let serveur, jeton;

const studio = (nom) => ({
  studio: nom,
  nonReconduction: { base: 10, nonReconduits: 3, taux: 0.3, tauxPct: 30, liste: [
    { client: 'MARTINEAU Paulin', idClient: '41001', netM1: 45, netM: 0, vendeurOrigine: { vendeur: 'Thibault Preguica', date: '10/03/2025', numVente: '201334', prestation: 'Challenge 12 mois IDF', site: 'My Coach Levallois Perret' } },
    { client: 'BERNARDIN Lucie', idClient: '41002', netM1: 69, netM: 0, vendeurOrigine: { vendeur: 'STAN MULTI-SITES', date: '02/02/2025', numVente: '198000' } },
    { client: 'SANS Identifiant', netM1: 20, netM: 0 },
  ] },
  clientsRetrouves: { ventesSignees: 0, annulees: 0, ventesActives: 0, ventesValides: 0, signataires: 0, retrouves: 0, taux: null, tauxPct: null, liste: [] },
  avertissements: [], controleBloquant: { ok: true, detail: {} },
});
const rapport = () => ({ businessVersion: 2, genere: new Date().toISOString(), mois: '2026-08', m1: '2026-07',
  source: { fitnessBooster: {}, deciplus_ventes_historique: { du: '2024-09', au: '2026-08', moisLus: 24, manquants: [], lignes: 2, regle: 'premiere_vente_avec_vendeur' } },
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
const attribuer = (o, h = auth()) => fetch(BASE + '/api/recap2/nr-commercial', { method: 'POST', headers: h,
  body: JSON.stringify(Object.assign({ mois: '2026-08', studio: 'Levallois', client: 'MARTINEAU Paulin', idClient: '41001', commercial: LUCA }, o)) });
const ligne = (r, client, s = 'Levallois') => r.studios[s].nonReconduction.liste.find((l) => l.client === client);
const M = require('../public/recap2-metrics.js');
const effectif = (r, client, s) => M.attributionNonReconduit(ligne(r, client, s));
const kpi = (r) => S.LABELS.map((s) => { const n = r.studios[s].nonReconduction; return [n.base, n.nonReconduits, n.taux, n.tauxPct, n.liste.length].join('/'); }).join(' ');
const fichier = () => fs.readFileSync(path.join(BAC, 'recap2', 'recap2-2026-08.json'), 'utf8');
let KPI0, FICHIER0;

before(async () => {
  await demarrer();
  assert.equal((await deposer(rapport())).status, 200);
  const r = await lire();
  KPI0 = kpi(r);
  FICHIER0 = fichier();
});
after(async () => { await arreter(); try { fs.rmSync(BAC, { recursive: true, force: true }); } catch (_) {} });

test('au dépôt : vendeur d\'origine conservé, attribution automatique, compte générique Non attribué', async () => {
  const r = await lire();
  assert.equal(ligne(r, 'MARTINEAU Paulin').vendeurOrigine.numVente, '201334');
  assert.deepEqual([effectif(r, 'MARTINEAU Paulin').mode, effectif(r, 'MARTINEAU Paulin').cle], ['auto', THIBAULT]);
  assert.deepEqual([effectif(r, 'BERNARDIN Lucie').mode, effectif(r, 'BERNARDIN Lucie').cle], ['aucun', '']);
  assert.match(effectif(r, 'BERNARDIN Lucie').motif, /STAN MULTI-SITES/);
  assert.equal(effectif(r, 'SANS Identifiant').cle, '');
  assert.equal(ligne(r, 'MARTINEAU Paulin').attribution, undefined, 'aucun choix manuel par défaut');
});

test('réattribution Thibault -> Luca, puis copie commerciale : la remarque change de commercial', async () => {
  const noter = await fetch(BASE + '/api/recap2/note', { method: 'POST', headers: auth(),
    body: JSON.stringify({ mois: '2026-08', studio: 'Levallois', type: 'non_reconduit', client: 'MARTINEAU Paulin', idClient: '41001', remarque: 'Rappel prévu jeudi.' }) });
  assert.equal(noter.status, 200);
  let r = await lire();
  assert.match(RR.remarquesCommercial(r, THIBAULT, 'Thibault P.').texte, /Clients non reconduits\n\nPaulin Martineau — client non reconduit\nRappel prévu jeudi\./);
  const rep = await attribuer({});
  assert.equal(rep.status, 200);
  const j = await rep.json();
  assert.deepEqual([j.attribution.manuel, j.attribution.cle, j.attribution.nom], [true, LUCA, 'Luca R.']);
  r = await lire();
  assert.deepEqual([effectif(r, 'MARTINEAU Paulin').mode, effectif(r, 'MARTINEAU Paulin').nom], ['manuel', 'Luca R.']);
  assert.equal(RR.remarquesCommercial(r, THIBAULT, 'Thibault P.').nb, 0);
  assert.match(RR.remarquesCommercial(r, LUCA, 'Luca R.').texte, /LEVALLOIS\n\nClients non reconduits\n\nPaulin Martineau — client non reconduit\nRappel prévu jeudi\./);
  assert.match(RR.remarquesClub(r, 'Levallois').texte, /Paulin Martineau/, 'le club la garde');
  assert.equal(ligne(r, 'MARTINEAU Paulin', 'Lille').attribution, undefined, 'autre studio intact');
  assert.equal(ligne(r, 'MARTINEAU Paulin').vendeurOrigine.vendeur, 'Thibault Preguica', 'la vente historique ne change pas');
});

test('garde-fous : commercial inventé, client absent, studio inconnu, sans session', async () => {
  assert.equal((await attribuer({ commercial: 'id:999999999999x999' })).status, 400);
  assert.equal((await attribuer({ commercial: 'nom:Pas de commercial' })).status, 400);
  assert.equal((await attribuer({ client: 'Personne Inventée', idClient: '' })).status, 404);
  assert.equal((await attribuer({ studio: 'Paris' })).status, 400);
  assert.equal((await attribuer({}, { 'Content-Type': 'application/json' })).status, 401);
  assert.equal(effectif(await lire(), 'MARTINEAU Paulin').nom, 'Luca R.', 'rien n\'a été écrit');
});

test('« Non attribué » choisi à la main l\'emporte sur un vendeur automatique', async () => {
  assert.equal((await attribuer({ client: 'SANS Identifiant', idClient: '', commercial: THIBAULT })).status, 200);
  assert.equal((await attribuer({ client: 'SANS Identifiant', idClient: '', commercial: '' })).status, 200);
  const r = await lire();
  assert.deepEqual([effectif(r, 'SANS Identifiant').mode, effectif(r, 'SANS Identifiant').cle], ['manuel', '']);
});

test('le JSON déposé n\'est jamais réécrit, et AUCUN KPI ne bouge', async () => {
  assert.equal(fichier(), FICHIER0);
  assert.equal(kpi(await lire()), KPI0);
});

test('NOUVELLE COLLECTE (JSON redéposé, vendeur d\'origine inchangé) : le choix manuel reste', async () => {
  assert.equal((await deposer(rapport())).status, 200);
  const r = await lire();
  assert.equal(effectif(r, 'MARTINEAU Paulin').nom, 'Luca R.');
  assert.equal(effectif(r, 'SANS Identifiant').mode, 'manuel');
});

test('REDÉMARRAGE (redéploiement + reconnexion) : toujours là', async () => {
  await arreter();
  await demarrer();
  const r = await lire();
  assert.equal(effectif(r, 'MARTINEAU Paulin').nom, 'Luca R.');
  assert.equal(kpi(r), KPI0);
});

test('statut de suivi et commercial sont indépendants', async () => {
  const statut = (s) => fetch(BASE + '/api/recap2/nr-statut', { method: 'POST', headers: auth(),
    body: JSON.stringify({ mois: '2026-08', studio: 'Levallois', client: 'MARTINEAU Paulin', idClient: '41001', statut: s }) });
  assert.equal((await statut('a_creuser')).status, 200);
  let l = ligne(await lire(), 'MARTINEAU Paulin');
  assert.deepEqual([l.suivi.statut, l.attribution.nom], ['a_creuser', 'Luca R.']);
  assert.equal((await statut('')).status, 200);
  l = ligne(await lire(), 'MARTINEAU Paulin');
  assert.deepEqual([l.suivi.statut, l.attribution.nom], ['', 'Luca R.']);
});

test('RETOUR À L\'AUTOMATIQUE : le vendeur d\'origine revient', async () => {
  const rep = await attribuer({ commercial: 'auto' });
  assert.equal(rep.status, 200);
  assert.equal((await rep.json()).attribution, null);
  const r = await lire();
  assert.equal(ligne(r, 'MARTINEAU Paulin').attribution, undefined);
  assert.deepEqual([effectif(r, 'MARTINEAU Paulin').mode, effectif(r, 'MARTINEAU Paulin').cle], ['auto', THIBAULT]);
  assert.equal(kpi(r), KPI0);
});
