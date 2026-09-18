'use strict';
// ============================================================================
//  RÉINTÉGRATION MANUELLE D'UNE VENTE « ANNULÉE », DE BOUT EN BOUT.
//  Nombre de ventes, filtre « Annulées », contrats validés, CA, remarques,
//  persistance (nouvelle collecte, redémarrage), retour en annulée, droits,
//  aucune écriture vers Deciplus / Vendor ni dans le JSON brut. DONNÉES FICTIVES.
// ============================================================================

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const S = require('../lib/recap2Store.js');
const M = require('../public/recap2-metrics.js');
const C = require('../public/recap2-conseils.js');

const BAC = fs.mkdtempSync(path.join(os.tmpdir(), 'recap2-reint-'));
const PORT = 3974;
const BASE = 'http://127.0.0.1:' + PORT;
const CLE = 'cle-de-test-tres-longue-reint-0123456789';
const PIN = 'pin-test-reintegration';
const PIN_AUTRE = 'pin-test-consultant';
let serveur, jeton, jetonAutre;

const vente = (o) => Object.assign({ client: 'DUPONT Marie', date: '12/08/2026', prestation: 'Challenge 12 mois', commercial: 'Marvin R.', commercialId: '',
  annulee: false, dateAnnulation: '', retrouve: true, site: 'My Coach Lille', dateVente: '12/08/2026', idClient: '90001', encaisse: true }, o);
const studio = (nom, annuleeEncore = true) => ({
  studio: nom,
  nonReconduction: { base: 0, nonReconduits: 0, taux: null, tauxPct: null, liste: [] },
  clientsRetrouves: { ventesSignees: 2, annulees: annuleeEncore ? 1 : 0, ventesActives: annuleeEncore ? 1 : 2, ventesValides: annuleeEncore ? 1 : 2, signataires: annuleeEncore ? 1 : 2,
    retrouves: 1, taux: annuleeEncore ? 1 : 0.5, tauxPct: annuleeEncore ? 100 : 50, liste: [
      vente({}),
      annuleeEncore
        ? vente({ client: 'MARTIN Luc', date: '20/08/2026', annulee: true, dateAnnulation: '25/08/2026', retrouve: false, site: '', dateVente: '', idClient: '', encaisse: false })
        : vente({ client: 'MARTIN Luc', date: '20/08/2026', retrouve: false, site: '', dateVente: '', idClient: '', encaisse: false }),
    ] },
  avertissements: [], controleBloquant: { ok: true, detail: {} },
});
const rapport = (annuleeEncore = true) => ({ businessVersion: 2, genere: new Date().toISOString(), mois: '2026-08', m1: '2026-07', source: { fitnessBooster: {} },
  studios: Object.fromEntries(S.LABELS.map((s) => [s, studio(s, annuleeEncore)])), journal: [], erreurs: [] });

const demarrer = async () => {
  serveur = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT), DB_DIR: BAC, RECAP2_INGEST_KEY: CLE, ADMIN_PIN: PIN, PILOTAGE_CONSULTANT_PIN: PIN_AUTRE }), stdio: ['ignore', 'pipe', 'pipe'] });
  serveur.stdout.resume(); serveur.stderr.resume();
  for (let i = 0; i < 100; i++) { try { await fetch(BASE + '/api/recap2/2026-08'); break; } catch (_) { await new Promise((r) => setTimeout(r, 100)); } }
  const login = async (pin) => (await (await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) })).json()).token;
  jeton = await login(PIN); jetonAutre = await login(PIN_AUTRE);
};
const arreter = () => new Promise((ok) => { if (!serveur) return ok(); serveur.once('exit', ok); serveur.kill(); });
const auth = (j = jeton) => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + j });
const deposer = (r) => fetch(BASE + '/api/recap2/2026-08', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Recap2-Key': CLE }, body: JSON.stringify(r) });
const decider = (decision, h = auth(), client = 'MARTIN Luc') => fetch(BASE + '/api/recap2/reintegration', { method: 'POST', headers: h,
  body: JSON.stringify({ mois: '2026-08', studio: 'Lille', client, date: client === 'MARTIN Luc' ? '20/08/2026' : '12/08/2026', decision }) });
const lire = async () => (await fetch(BASE + '/api/recap2/2026-08', { headers: auth() })).json();
const liste = (r) => r.studios.Lille.clientsRetrouves.liste;
const luc = (r) => liste(r).find((v) => v.client === 'MARTIN Luc');
const fichier = () => fs.readFileSync(path.join(BAC, 'recap2', 'recap2-2026-08.json'), 'utf8');
let FICHIER0;

before(async () => { await demarrer(); assert.equal((await deposer(rapport())).status, 200); FICHIER0 = fichier(); });
after(async () => { await arreter(); try { fs.rmSync(BAC, { recursive: true, force: true }); } catch (_) {} });

test('droits : sans session 401, rôle non administrateur 403, vente non annulée 409', async () => {
  assert.equal((await decider('reintegrer', { 'Content-Type': 'application/json' })).status, 401);
  assert.equal((await decider('reintegrer', auth(jetonAutre))).status, 403);
  assert.equal((await decider('reintegrer', auth(), 'DUPONT Marie')).status, 409);
});

test('avant : la vente annulée est hors du nombre de ventes et hors du taux de contrats validés', async () => {
  const r = await lire();
  assert.equal(luc(r).annulee, true);
  assert.deepEqual(M.contratsValides(liste(r)), { actives: 1, valides: 1, parPrelevement: 0, parVerification: 0, taux: 1 });
});

test('réintégrer : comptée dans les ventes, sortie des annulées, dans le taux validé, contrôles et remarque actifs ; CA inchangé', async () => {
  const caAvant = M.caNetStudio(await lire(), 'Lille');
  assert.equal((await decider('reintegrer')).status, 200);
  const r = await lire(); const v = luc(r);
  assert.equal(v.annulee, false, 'vente active');
  assert.equal(v.reintegration.decision, 'reintegree'); assert.equal(v.reintegration.statutFinal, 'Vente comptabilisée');
  assert.equal(v.reintegration.modifiePar, 'Stan'); assert.ok(v.reintegration.modifieLe);
  assert.equal(v.annulationAuto.dateAnnulation, '25/08/2026', 'l’origine reste dite');
  assert.equal(liste(r).filter((x) => x.annulee).length, 0, 'sortie du filtre « Annulées »');
  const cr = r.studios.Lille.clientsRetrouves;
  assert.deepEqual([cr.annulees, cr.ventesActives, cr.signataires, cr.taux], [0, 2, 2, 0.5], 'compteurs servis cohérents (aucun blocage de cohérence)');
  const cv = M.contratsValides(liste(r));
  assert.equal(cv.actives, 2, 'comptée dans le nombre de ventes');
  assert.equal(cv.taux, 0.5, 'entre dans le calcul des contrats validés (à valider)');
  assert.deepEqual(C.conseilsVente(v, { controle: true }), [C.TEXTES.DECIPLUS], 'la remarque de sa situation réapparaît');
  assert.deepEqual(M.caNetStudio(r, 'Lille'), caAvant, 'le CA (encaissements) n’a jamais exclu une annulée : inchangé');
  assert.equal(fichier(), FICHIER0, 'JSON brut jamais réécrit');
});

test('les contrôles s’appliquent normalement : case Prélèvement cochée = contrat validé', async () => {
  const c = await fetch(BASE + '/api/recap2/checks', { method: 'POST', headers: auth(),
    body: JSON.stringify({ mois: '2026-08', studio: 'Lille', client: 'MARTIN Luc', date: '20/08/2026', champ: 'prelevement', valeur: true }) });
  assert.equal(c.status, 200);
  const r = await lire();
  assert.equal(M.contratsValides(liste(r)).taux, 1);
});

test('persistance après nouvelle collecte et redémarrage', async () => {
  assert.equal((await deposer(rapport())).status, 200);
  await arreter(); await demarrer();
  const r = await lire();
  assert.equal(luc(r).annulee, false); assert.equal(luc(r).reintegration.decision, 'reintegree');
});

test('« Remettre en annulée » : réversible et historisé', async () => {
  assert.equal((await decider('maintenir')).status, 200);
  const r = await lire();
  assert.equal(luc(r).annulee, true); assert.equal(M.contratsValides(liste(r)).actives, 1);
  const h = await (await fetch(BASE + '/api/recap2/historique/2026-08', { headers: auth() })).json();
  assert.deepEqual(h.reintegrations.map((x) => x.avant + '→' + x.apres), ['→reintegree', 'reintegree→maintenue']);
});

test('la vente n’est plus annulée à la collecte suivante : forçage signalé comme plus nécessaire, historique conservé', async () => {
  assert.equal((await decider('reintegrer')).status, 200);
  assert.equal((await deposer(rapport(false))).status, 200);
  const r = await lire();
  assert.equal(luc(r).reintegration.plusNecessaire, true);
  const h = await (await fetch(BASE + '/api/recap2/historique/2026-08', { headers: auth() })).json();
  assert.equal(h.reintegrations.length, 3);
});

test('aucune écriture vers Deciplus ou Vendor : le module et la route n’ont aucun accès externe', () => {
  const lib = fs.readFileSync(path.join(__dirname, '..', 'lib', 'recap2Reintegrations.js'), 'utf8');
  assert.ok(!/deciplus\.pro|fitness-booster|fetch\(|playwright|require\('https?'\)/.test(lib));
  const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const route = srv.slice(srv.indexOf("app.post('/api/recap2/reintegration'"), srv.indexOf("app.post('/api/recap2/note'"));
  assert.ok(route.length > 100 && !/deciplus\.pro|fitness-booster|fetch\(/.test(route));
});
