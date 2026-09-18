'use strict';
// ============================================================================
//  VNI, DE BOUT EN BOUT, CONTRE UN VRAI SERVEUR — LE RETRAIT RÉTROACTIF DANS LE TEMPS.
//
//  Le scénario demandé par Stan :
//    Sophie est VNI d'août aujourd'hui (remarque posée) -> elle signe en octobre
//    -> la collecte d'OCTOBRE est déposée -> on consulte août : Sophie a disparu,
//    SANS recollecter août -> sa remarque reste en base -> redémarrage : toujours
//    retirée -> une nouvelle collecte d'août ne la fait pas revenir.
//  Et : remarques vni (ajout, modification, suppression), copie du club,
//  AUCUN KPI modifié.
// ============================================================================

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');
const S = require('../lib/recap2Store.js');
const RR = require('../public/recap2-remarques.js');

const BAC = fs.mkdtempSync(path.join(os.tmpdir(), 'recap2-vni-'));
const PORT = 3984;
const BASE = 'http://127.0.0.1:' + PORT;
const CLE = 'cle-de-test-tres-longue-0123456789';
const PIN = 'pin-de-test-vni';
let serveur, jeton;

const SOPHIE = '1785603935735x742971674554943200', PAUL = '1785603935735x742971674554943201';
const FABIAN = '1648915791594x308726414827915650';
const vni = (o) => Object.assign({ contactId: SOPHIE, idClient: '', client: 'Sophie Martin', dateVenue: '12/08/2026', venues: 1,
  commercial: 'Fabian F.', commercialId: FABIAN, statutVendor: 'Visiteur - En réflexion' }, o);
const L = (o) => Object.assign({ client: 'Daouda Sy', date: '05/08/2026', prestation: 'Challenge', commercial: 'Fabian F.',
  annulee: false, dateAnnulation: '', retrouve: true, site: 'My Coach Lille', dateVente: '05/08/2026', idClient: '41001', encaisse: true }, o);
const studio = (nom, mois, avecVni) => Object.assign({
  studio: nom,
  nonReconduction: { base: 10, nonReconduits: 1, taux: 0.1, tauxPct: 10, liste: [{ client: 'AMIEL Anais', idClient: '42001', netM1: 60, netM: 0 }] },
  clientsRetrouves: { ventesSignees: 1, annulees: 0, ventesActives: 1, ventesValides: 1, signataires: 1, retrouves: 1, taux: 1, tauxPct: 100,
    liste: [L({ date: '05/' + mois.slice(5) + '/2026', dateVente: '05/' + mois.slice(5) + '/2026' })] },
  avertissements: [], controleBloquant: { ok: true, detail: {} },
}, avecVni && nom === 'Lille' ? { vni: { visiteurs: 4, tuileVisiteurs: 4, venus: 3, transformes: 1,
  liste: [vni({}), vni({ contactId: PAUL, idClient: '50001', client: 'Paul Durand', dateVenue: '20/08/2026' })] } }
  : avecVni ? { vni: { visiteurs: 0, tuileVisiteurs: 0, venus: 0, transformes: 0, liste: [] } } : {});
const rapport = (mois, { avecVni = false, transformations = [] } = {}) => ({
  businessVersion: 2, genere: new Date().toISOString(), mois, m1: S.moisPrecedent(mois), transformations,
  source: { fitnessBooster: {} }, studios: Object.fromEntries(S.LABELS.map((s) => [s, studio(s, mois, avecVni)])), journal: [], erreurs: [],
});

const demarrer = async () => {
  serveur = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT), DB_DIR: BAC, RECAP2_INGEST_KEY: CLE, ADMIN_PIN: PIN }), stdio: ['ignore', 'pipe', 'pipe'] });
  serveur.stdout.resume(); serveur.stderr.resume();
  for (let i = 0; i < 100; i++) { try { await fetch(BASE + '/api/recap2/2026-08'); break; } catch (_) { await new Promise((r) => setTimeout(r, 100)); } }
  jeton = (await (await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: PIN }) })).json()).token;
  assert.ok(jeton);
};
const arreter = () => new Promise((ok) => { if (!serveur) return ok(); serveur.once('exit', ok); serveur.kill(); });
const deposer = (corps) => fetch(BASE + '/api/recap2/' + corps.mois, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Recap2-Key': CLE }, body: JSON.stringify(corps) });
const auth = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + jeton });
const lire = async (mois = '2026-08') => { const r = await fetch(BASE + '/api/recap2/' + mois, { headers: auth() }); assert.equal(r.status, 200); return r.json(); };
const noter = (o) => fetch(BASE + '/api/recap2/note', { method: 'POST', headers: auth(),
  body: JSON.stringify(Object.assign({ mois: '2026-08', studio: 'Lille', type: 'vni', client: 'Sophie Martin', idClient: '', idVendor: SOPHIE, remarque: 'x' }, o)) });
const vniLille = (r) => r.studios.Lille.vni;
// Toutes les données du rapport SAUF les VNI, les remarques et l'horodatage : les KPI et leurs lignes.
const empreinte = (r) => {
  const c = JSON.parse(JSON.stringify(r.studios));
  Object.values(c).forEach((b) => {
    delete b.vni;
    ['clientsRetrouves', 'nonReconduction'].forEach((k) => (b[k] && b[k].liste || []).forEach((l) => delete l.note));
  });
  return JSON.stringify(c);
};
const remarquesEnBase = () => { const db = new Database(path.join(BAC, 'data.db'), { readonly: true }); try { return db.prepare("SELECT client, remarque FROM recap2_notes WHERE type = 'vni' ORDER BY client").all(); } finally { db.close(); } };
let EMPREINTE0;

before(async () => {
  await demarrer();
  const d = await deposer(rapport('2026-08', { avecVni: true }));
  assert.equal(d.status, 200, 'rapport d\'août avec VNI accepté');
  const r = await lire();
  EMPREINTE0 = empreinte(r);
  assert.deepEqual(vniLille(r).liste.map((l) => l.client), ['Sophie Martin', 'Paul Durand']);
});
after(async () => { await arreter(); try { fs.rmSync(BAC, { recursive: true, force: true }); } catch (_) {} });

test('REMARQUE VNI : ajout, modification, suppression', async () => {
  assert.equal((await noter({ remarque: 'Hésite sur le tarif.' })).status, 200);
  assert.equal((await noter({ remarque: 'Hésite sur le tarif, à rappeler.' })).status, 200);
  assert.equal((await noter({ client: 'Paul Durand', idClient: '50001', idVendor: PAUL, remarque: 'À supprimer' })).status, 200);
  assert.equal((await noter({ client: 'Paul Durand', idClient: '50001', idVendor: PAUL, remarque: '', supprimer: true })).status, 200);
  const l = vniLille(await lire()).liste;
  assert.deepEqual(l.map((x) => x.note.remarque), ['Hésite sur le tarif, à rappeler.', '']);
  assert.equal((await noter({ client: 'Personne Inventée', idVendor: '1785603935735x999999999999999999' })).status, 404);
});

test('COPIE DU CLUB : section VNI avec la seule personne à remarque', async () => {
  const c = RR.remarquesClub(await lire(), 'Lille');
  assert.equal(c.texte, 'LILLE — AOÛT 2026\n\nVNI\n\nSophie Martin\nHésite sur le tarif, à rappeler.\n');
});

test('SOPHIE SIGNE EN OCTOBRE : dépôt de la collecte d\'octobre -> retirée d\'août SANS recollecter août', async () => {
  const oct = rapport('2026-10', { transformations: [{ contactId: SOPHIE, idClient: '', date: '14/10/2026', source: 'fb-contrat' }] });
  assert.equal((await deposer(oct)).status, 200);
  const v = vniLille(await lire());
  assert.deepEqual(v.liste.map((l) => l.client), ['Paul Durand']);
  assert.deepEqual([v.historique, v.retires, v.transformesDepuis[0].transformeLe], [2, 1, '14/10/2026']);
  const fichierAout = JSON.parse(fs.readFileSync(path.join(BAC, 'recap2', 'recap2-2026-08.json'), 'utf8'));
  assert.equal(fichierAout.studios.Lille.vni.liste.length, 2, 'le JSON d\'août n\'a PAS été réécrit');
});

test('SA REMARQUE RESTE EN BASE, elle n\'est simplement plus affichée ni copiée', async () => {
  assert.deepEqual(remarquesEnBase().find((x) => x.client === 'Sophie Martin'), { client: 'Sophie Martin', remarque: 'Hésite sur le tarif, à rappeler.' });
  assert.equal(RR.remarquesClub(await lire(), 'Lille').nb, 0);
  assert.equal((await noter({ remarque: 'nouvelle' })).status, 404, 'plus de remarque sur un VNI retiré');
});

test('REDÉMARRAGE : toujours retirée ; NOUVELLE COLLECTE D\'AOÛT : elle ne revient pas', async () => {
  await arreter();
  await demarrer();
  assert.deepEqual(vniLille(await lire()).liste.map((l) => l.client), ['Paul Durand']);
  assert.equal((await deposer(rapport('2026-08', { avecVni: true }))).status, 200);
  assert.deepEqual(vniLille(await lire()).liste.map((l) => l.client), ['Paul Durand']);
});

test('PAUL signe le 20/08 (connu par la collecte de septembre, par son Id Deciplus) -> retiré aussi', async () => {
  assert.equal((await deposer(rapport('2026-09', { transformations: [{ contactId: '', idClient: '50001', date: '20/08/2026', source: 'deciplus-vente' }] }))).status, 200);
  assert.deepEqual(vniLille(await lire()).liste, []);
});

test('AUCUN KPI MODIFIÉ, à aucune étape', async () => {
  assert.equal(empreinte(await lire()), EMPREINTE0);
});

test('un rapport sans VNI (ancienne collecte) reste lisible et inchangé', async () => {
  const juin = rapport('2026-08');
  juin.mois = '2026-06'; juin.m1 = '2026-05';
  assert.equal((await deposer(juin)).status, 200);
  const r = await lire('2026-06');
  assert.equal(r.studios.Lille.vni, undefined);
});
