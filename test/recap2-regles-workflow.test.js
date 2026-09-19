'use strict';
// ============================================================================
//  REMARQUES RECAP 2 DE BOUT EN BOUT (vrai serveur, base isolée) :
//  dépôt du contrôle avec contentieux et code SEPA, deux ventes d'une même
//  personne (remarques, personnalisation par règle, copies), réintégration
//  recalculée immédiatement, identité VNI validée explicitement, droits,
//  persistance après redémarrage, aucune écriture vers Deciplus / Vendor.
//  DONNÉES ENTIÈREMENT FICTIVES.
// ============================================================================

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const S = require('../lib/recap2Store.js');
const RR = require('../public/recap2-remarques.js');
const G = require('../public/recap2-regles.js');

const BAC = fs.mkdtempSync(path.join(os.tmpdir(), 'recap2-regles-'));
const PORT = 3981;
const BASE = 'http://127.0.0.1:' + PORT;
const CLE = 'cle-de-test-tres-longue-regles-0123456789';
const PIN = 'pin-test-regles';
const PIN_AUTRE = 'pin-test-regles-consultant';
let serveur, jeton, jetonAutre;

const MARVIN = '1648915791594x308726414827915651';
const JEAN = '1785603935735x742971674554943210', ALICE = '1785603935735x742971674554943211';
const V = (o) => Object.assign({ client: 'DUPONT Marie', date: '12/08/2026', prestation: 'Challenge 12 mois', commercial: 'Marvin R.', commercialId: MARVIN,
  annulee: false, dateAnnulation: '', retrouve: true, site: 'My Coach Lille', dateVente: '12/08/2026', idClient: '90001', encaisse: true }, o);
const vni = (o) => Object.assign({ contactId: JEAN, idClient: '', client: 'PETIT Jean', dateVenue: '14/08/2026', venues: 1, commercial: 'Marvin R.', commercialId: MARVIN, statutVendor: 'Visiteur' }, o);
const studio = (nom) => Object.assign({
  studio: nom,
  nonReconduction: { base: 0, nonReconduits: 0, taux: null, tauxPct: null, liste: [] },
  clientsRetrouves: nom === 'Lille' ? { ventesSignees: 3, annulees: 1, ventesActives: 2, ventesValides: 2, signataires: 2, retrouves: 2, taux: 1, tauxPct: 100, liste: [
    V({}), V({ date: '26/08/2026', prestation: 'Flex', dateVente: '26/08/2026' }),
    V({ client: 'MARTIN Luc', date: '20/08/2026', annulee: true, dateAnnulation: '25/08/2026', retrouve: false, site: '', dateVente: '', idClient: '', encaisse: false }),
  ] } : { ventesSignees: 0, annulees: 0, ventesActives: 0, ventesValides: 0, signataires: 0, retrouves: 0, taux: null, tauxPct: null, liste: [] },
  avertissements: [], controleBloquant: { ok: true, detail: {} },
}, { vni: nom === 'Lille' ? { visiteurs: 2, tuileVisiteurs: 2, venus: 2, transformes: 0, liste: [vni({}), vni({ contactId: ALICE, client: 'ROUX Alice' })] }
  : { visiteurs: 0, tuileVisiteurs: 0, venus: 0, transformes: 0, liste: [] } });
const rapport = () => ({ businessVersion: 2, genere: new Date().toISOString(), mois: '2026-08', m1: '2026-07', source: { fitnessBooster: {} },
  studios: Object.fromEntries(S.LABELS.map((s) => [s, studio(s)])), journal: [], erreurs: [] });
const res = (o) => Object.assign({ studio: 'Lille', client: 'DUPONT Marie', date: '12/08/2026', idDeciplus: '90001', prelevement: 'ok', reservation: 'ko', resilie: 'ko',
  alertes: [], regles: [], contrat: null, raison: '', controleLe: '2026-09-18T08:44' }, o);
const controleAuto = { controleLe: '2026-09-18T08:44', resultats: [
  res({ alertes: [G.ALERTES_MOTEUR.REJET], regles: ['R9'], details: { codesRejet: [{ code: 'MD01', date: '2026-09-15' }] } }),
  res({ date: '26/08/2026', reservation: 'ok' }),
  res({ client: 'MARTIN Luc', date: '20/08/2026', idDeciplus: '90002', prelevement: 'ko', reservation: 'ko', resilie: 'ok', alertes: [G.ALERTES_MOTEUR.ANNULEE_JAMAIS_CREE], regles: ['R21'] }),
] };

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
const cle = { 'Content-Type': 'application/json', 'X-Recap2-Key': CLE };
const post = (url, corps, h = auth()) => fetch(BASE + url, { method: 'POST', headers: h, body: JSON.stringify(corps) });
const lire = async () => { const r = await fetch(BASE + '/api/recap2/2026-08', { headers: auth() }); assert.equal(r.status, 200); return r.json(); };
const ventes = (r) => r.studios.Lille.clientsRetrouves.liste;
const remarques = (l, r) => G.evaluerVente(l, G.contexteRapport(r));
const fichier = () => fs.readFileSync(path.join(BAC, 'recap2', 'recap2-2026-08.json'), 'utf8');
let FICHIER0;

before(async () => {
  await demarrer();
  const d0 = await post('/api/recap2/2026-08', rapport(), cle); assert.equal(d0.status, 200, JSON.stringify(await d0.clone().json()));
  FICHIER0 = fichier();
  const d1 = await post('/api/recap2/automatique/2026-08', controleAuto, cle); assert.equal(d1.status, 200, JSON.stringify(await d1.clone().json()));
  assert.equal((await post('/api/recap2/flex/2026-08', { mois: '2026-08', controleLe: '2026-09-18T13:54', resultats: [
    { studio: 'Lille', contactId: JEAN, client: 'PETIT Jean', statut: 'À vérifier', preuves: [] },
    { studio: 'Lille', contactId: ALICE, client: 'ROUX Alice', statut: 'Flex à proposer', preuves: [] }] }, cle)).status, 200);
});
after(async () => { await arreter(); try { fs.rmSync(BAC, { recursive: true, force: true }); } catch (_) {} });

test('dépôt : code SEPA et contentieux transmis ; détails invalides refusés', async () => {
  const r = await lire();
  const marie = ventes(r)[0];
  assert.deepEqual(marie.automatique.details, { codesRejet: [{ code: 'MD01', date: '2026-09-15' }] });
  const it = remarques(marie, r);
  assert.deepEqual(it.map((x) => x.regle), ['VENTE-REGULARISER', 'VENTE-CODE-REJET', 'VENTE-SEANCES']);
  assert.equal((await post('/api/recap2/automatique/2026-08', { controleLe: '2026-09-18T08:44', resultats: [res({ details: [] })] }, cle)).status, 422);
});

test('contentieux confirmé sur une vente : aucune remarque (dépôt suivant, même clé)', async () => {
  const c = JSON.parse(JSON.stringify(controleAuto));
  c.resultats[1] = res({ date: '26/08/2026', prelevement: 'ko', reservation: 'ko', resilie: 'ok', alertes: [G.ALERTES_MOTEUR.INTERROMPU], regles: ['R15'],
    details: { contentieux: true, contentieuxSource: 'catégorie Deciplus « Contentieux »' } });
  assert.equal((await post('/api/recap2/automatique/2026-08', c, cle)).status, 200);
  const r = await lire();
  assert.deepEqual(remarques(ventes(r)[1], r), []);
  assert.equal((await post('/api/recap2/automatique/2026-08', controleAuto, cle)).status, 200, 'retour à l’état de départ');
});

test('vente annulée jamais créée : rien ; réintégrée : « Vérifie et complète la vente » immédiatement', async () => {
  let r = await lire();
  assert.deepEqual(remarques(ventes(r)[2], r), []);
  assert.ok(!/MARTIN|Luc Martin/.test(RR.remarquesClub(r, 'Lille').texte));
  assert.equal((await post('/api/recap2/reintegration', { mois: '2026-08', studio: 'Lille', client: 'MARTIN Luc', date: '20/08/2026', decision: 'reintegrer' })).status, 200);
  r = await lire();
  const luc = ventes(r)[2];
  assert.equal(luc.annulee, false);
  assert.deepEqual([luc.operationnel.resilie, luc.automatique.alertes], ['ko', [G.ALERTES_MOTEUR.JAMAIS_CREE]], 'R21 requalifiée R20');
  const it = remarques(luc, r).map((x) => G.enAction(x.texte));
  assert.deepEqual(it, ['À faire : Vérifie et complète la vente dans Deciplus.']);
  assert.match(RR.remarquesClub(r, 'Lille').texte, /Luc Martin — vente du 20\/08\/2026 · Challenge 12 mois\nÀ faire : Vérifie et complète la vente dans Deciplus\./);
  assert.equal((await post('/api/recap2/reintegration', { mois: '2026-08', studio: 'Lille', client: 'MARTIN Luc', date: '20/08/2026', decision: 'maintenir' })).status, 200);
  assert.deepEqual(remarques(ventes(await lire())[2], r), [], 'remise en annulée : plus rien');
});

test('deux ventes d’une même personne : personnalisation sur UNE vente (clé règle), copies club et commercial complètes', async () => {
  const corps = { mois: '2026-08', studio: 'Lille', type: 'vente', client: 'DUPONT Marie', idClient: '90001', date: '12/08/2026', regle: 'VENTE-SEANCES', texte: 'Planifier ses 3 séances de septembre.' };
  assert.equal((await post('/api/recap2/remarque-auto', corps, auth(jetonAutre))).status, 403, 'création réservée à l’admin');
  assert.equal((await post('/api/recap2/remarque-auto', Object.assign({}, corps, { regle: 'VENTE-RESILIATION' }))).status, 409, 'règle non produite');
  assert.equal((await post('/api/recap2/remarque-auto', Object.assign({}, corps, { regle: 'VENTE-CODE-REJET' }))).status, 409, 'alerte technique : jamais personnalisable');
  assert.equal((await post('/api/recap2/remarque-auto', corps)).status, 200);
  const r = await lire();
  assert.deepEqual(ventes(r)[0].remarquesPerso['VENTE-SEANCES'].texte, 'Planifier ses 3 séances de septembre.');
  assert.equal(ventes(r)[1].remarquesPerso, undefined, 'l’autre vente n’en hérite pas');
  const club = RR.remarquesClub(r, 'Lille').texte;
  assert.ok(club.includes('Marie Dupont — vente du 12/08/2026 · Challenge 12 mois\nÀ faire : Contacte le client pour régulariser son prélèvement.\nÀ faire : Planifier ses 3 séances de septembre.'));
  assert.ok(!/MD01|Rejet de prélèvement/.test(club), 'le code SEPA reste une alerte administrateur');
  const com = RR.remarquesCommercial(r, 'id:' + MARVIN, 'Marvin R.').texte;
  assert.match(com, /Planifier ses 3 séances de septembre\./);
});

test('VNI : une décision commerciale ne masque pas l’identité ; seule la validation explicite la retire ; droits ; historique', async () => {
  assert.equal((await post('/api/recap2/flex-decision', { mois: '2026-08', studio: 'Lille', contactId: JEAN, valeur: 'non_interesse' })).status, 200);
  let r = await lire();
  const jean = () => r.studios.Lille.vni.liste.find((l) => l.contactId === JEAN);
  assert.deepEqual(G.evaluerVni(jean()).map((x) => x.regle), ['VNI-IDENTITE']);
  const id = { mois: '2026-08', studio: 'Lille', contactId: JEAN, valeur: 'validee' };
  assert.equal((await post('/api/recap2/vni-identite', id, auth(jetonAutre))).status, 403);
  assert.equal((await post('/api/recap2/vni-identite', Object.assign({}, id, { contactId: ALICE }))).status, 409, 'identité non à vérifier');
  assert.equal((await post('/api/recap2/vni-identite', id)).status, 200);
  r = await lire();
  assert.equal(jean().identiteVni.validee, true);
  assert.deepEqual(G.evaluerVni(jean()), [], 'identité validée + décision (preuve de proposition) : aucune action');
  const h = await (await fetch(BASE + '/api/recap2/historique/2026-08', { headers: auth() })).json();
  assert.ok(h.flex.some((x) => x.avant === 'identite:a_verifier' && x.apres === 'identite:validee'));
});

test('persistance après redémarrage : personnalisation, identité validée ; JSON mensuel jamais réécrit', async () => {
  await arreter(); await demarrer();
  const r = await lire();
  assert.equal(ventes(r)[0].remarquesPerso['VENTE-SEANCES'].texte, 'Planifier ses 3 séances de septembre.');
  assert.equal(r.studios.Lille.vni.liste.find((l) => l.contactId === JEAN).identiteVni.validee, true);
  assert.equal(fichier(), FICHIER0);
  assert.equal((await post('/api/recap2/remarque-auto', { mois: '2026-08', studio: 'Lille', type: 'vente', client: 'DUPONT Marie', idClient: '90001', date: '12/08/2026', regle: 'VENTE-SEANCES', texte: '' })).status, 200);
  assert.equal(ventes(await lire())[0].remarquesPerso, undefined, 'revenir à la version automatique');
});

test('aucune écriture vers Deciplus ou Vendor dans les routes des remarques', () => {
  const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  for (const route of ["app.post('/api/recap2/remarque-auto'", "app.post('/api/recap2/vni-identite'", "app.post('/api/recap2/automatique/"]) {
    const i = srv.indexOf(route); assert.ok(i > -1, route);
    const bloc = srv.slice(i, srv.indexOf('\n});', i));
    assert.ok(!/deciplus\.pro|fitness-booster|fetch\(|playwright/i.test(bloc), route);
  }
  ['public/recap2-regles.js', 'public/recap2-referentiel.js', 'lib/recap2RemarquesAuto.js'].forEach((f) => {
    assert.ok(!/fetch\(|XMLHttpRequest|deciplus\.pro|fitness-booster/.test(fs.readFileSync(path.join(__dirname, '..', f), 'utf8')), f + ' : aucun appel réseau');
  });
});
