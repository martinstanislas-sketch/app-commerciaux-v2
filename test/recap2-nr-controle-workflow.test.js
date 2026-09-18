'use strict';
// ============================================================================
//  CONTRÔLE DES NON-RECONDUITS, DE BOUT EN BOUT, CONTRE UN VRAI SERVEUR.
//  Dépôt (clé), garde-fous, application à la lecture, décision manuelle
//  prioritaire et historisée, remarques automatiques modifiables et
//  restaurables, remarque manuelle historisée, copies, cohorte figée,
//  suggestion « Récupéré », droits, persistance (rechargement, nouvelle
//  collecte, redémarrage), et AUCUN impact sur les KPI.  DONNÉES FICTIVES.
// ============================================================================

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const S = require('../lib/recap2Store.js');
const RR = require('../public/recap2-remarques.js');
const M = require('../public/recap2-metrics.js');
const T = require('../public/recap2-conseils.js').TEXTES_NR;

const BAC = fs.mkdtempSync(path.join(os.tmpdir(), 'recap2-nrctl-'));
const PORT = 3979;
const BASE = 'http://127.0.0.1:' + PORT;
const CLE = 'cle-de-test-tres-longue-nr-0123456789';
const PIN = 'pin-de-test-nr-controle';
const PIN_CONSEILLER = 'pin-conseiller-test';
let serveur, jeton, jetonConseiller;

const studio = (nom) => ({
  studio: nom,
  nonReconduction: { base: 10, nonReconduits: 3, taux: 0.3, tauxPct: 30, liste: [
    { client: 'DUPONT Marie', idClient: '90001', netM1: 180, netM: 0, vendeurOrigine: { vendeur: 'Marvin', date: '02/03/2026', numVente: '1', prestation: 'Challenge', site: 'x' } },
    { client: 'MARTIN Luc', idClient: '90002', netM1: 69, netM: 0 },
    { client: 'LEROY Anne', idClient: '90003', netM1: 45, netM: 0 },
  ] },
  clientsRetrouves: { ventesSignees: 0, annulees: 0, ventesActives: 0, ventesValides: 0, signataires: 0, retrouves: 0, taux: null, tauxPct: null, liste: [] },
  avertissements: [], controleBloquant: { ok: true, detail: {} },
});
const rapport = () => ({ businessVersion: 2, genere: new Date().toISOString(), mois: '2026-08', m1: '2026-07', source: { fitnessBooster: {} },
  studios: Object.fromEntries(S.LABELS.map((s) => [s, studio(s)])), journal: [], erreurs: [] });
const analyse = (o) => Object.assign({ statut: 'a_traiter', contentieux: false, irrecuperable: false, cause: { code: 'prix', libelle: 'Prix', certitude: 'Confirmée', indice: 'note Message accueil du 12/07/2026' },
  indication: 'Cause probable : Prix (Confirmée)', suspension: null, finance: null, remarques: [T.PRIX], motifExclusion: '' }, o);
const controle = (resultats, quand = '2026-09-18T10:00') => ({ mois: '2026-08', controleLe: quand, resultats, limites: ['avoirs non lisibles'] });
const r1 = (o = {}) => Object.assign({ type: 'nr', studio: 'Lille', idClient: '90001', client: 'DUPONT Marie', analyse: analyse() }, o);

const demarrer = async () => {
  serveur = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT), DB_DIR: BAC, RECAP2_INGEST_KEY: CLE, ADMIN_PIN: PIN, PILOTAGE_CONSULTANT_PIN: PIN_CONSEILLER }), stdio: ['ignore', 'pipe', 'pipe'] });
  serveur.stdout.resume(); serveur.stderr.resume();
  for (let i = 0; i < 100; i++) { try { await fetch(BASE + '/api/recap2/2026-08'); break; } catch (_) { await new Promise((r) => setTimeout(r, 100)); } }
  const login = async (pin) => (await (await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) })).json()).token;
  jeton = await login(PIN); jetonConseiller = await login(PIN_CONSEILLER);
  assert.ok(jeton && jetonConseiller);
};
const arreter = () => new Promise((ok) => { if (!serveur) return ok(); serveur.once('exit', ok); serveur.kill(); });
const post = (chemin, corps, h) => fetch(BASE + chemin, { method: 'POST', headers: h || auth(), body: JSON.stringify(corps) });
const auth = (j = jeton) => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + j });
const cle = { 'Content-Type': 'application/json', 'X-Recap2-Key': CLE };
const deposerRapport = () => post('/api/recap2/2026-08', rapport(), cle);
const deposerControle = (c) => post('/api/recap2/nr-controle/2026-08', c, cle);
const lire = async () => { const r = await fetch(BASE + '/api/recap2/2026-08', { headers: auth() }); assert.equal(r.status, 200); return r.json(); };
const ligne = (r, client = 'DUPONT Marie', s = 'Lille') => r.studios[s].nonReconduction.liste.find((l) => l.client === client);
const kpi = (r) => S.LABELS.map((s) => { const n = r.studios[s].nonReconduction; return [n.base, n.nonReconduits, n.taux, n.tauxPct, n.liste.length].join('/'); }).join(' ');
const fichier = () => fs.readFileSync(path.join(BAC, 'recap2', 'recap2-2026-08.json'), 'utf8');
let KPI0, FICHIER0;

before(async () => {
  await demarrer();
  assert.equal((await deposerRapport()).status, 200);
  const r = await lire();
  KPI0 = kpi(r); FICHIER0 = fichier();
  assert.equal(ligne(r).analyse, undefined, 'mois non contrôlé : aucune analyse');
});
after(async () => { await arreter(); try { fs.rmSync(BAC, { recursive: true, force: true }); } catch (_) {} });

test('dépôt : sans clé 401 ; non-reconduit absent, remarque hors gabarit, statut inconnu : 422', async () => {
  assert.equal((await post('/api/recap2/nr-controle/2026-08', controle([r1()]), { 'Content-Type': 'application/json' })).status, 401);
  assert.equal((await deposerControle(controle([r1({ idClient: '99999' })]))).status, 422);
  assert.equal((await deposerControle(controle([r1({ analyse: analyse({ remarques: ['Rembourse 50 € au client.'] }) })]))).status, 422);
  assert.equal((await deposerControle(controle([r1({ analyse: analyse({ statut: 'perdu' }) })]))).status, 422);
});

test('dépôt accepté : analyse posée, remarque affichée, KPI et JSON intacts, coordonnées masquées', async () => {
  const d = await deposerControle(controle([
    r1({ analyse: analyse({ indication: 'Cause probable : Prix — tel 06 11 22 33 44' }) }),
    r1({ idClient: '90002', client: 'MARTIN Luc', analyse: analyse({ statut: 'resilie', contentieux: true, remarques: [], motifExclusion: 'contentieux', cause: null, indication: 'Contentieux confirmé' }) }),
    r1({ idClient: '90003', client: 'LEROY Anne', analyse: analyse({ statut: 'toujours_actif', remarques: [], motifExclusion: 'toujours actif', indication: 'contrat toujours actif', reconduction: { produit: 'X', debut: '2026-01-01', mensuel: 195 } }) }),
    { type: 'suspension', studio: 'Lille', idClient: '90010', client: 'PETIT Jean', analyse: analyse({ statut: 'suspendu', remarques: [T.SUSP_RAISON], cause: null, indication: 'suspension sans raison renseignée' }) },
  ]));
  assert.equal(d.status, 200);
  const r = await lire();
  assert.equal(ligne(r).analyse.statut, 'a_traiter');
  assert.ok(!/06 11/.test(ligne(r).analyse.indication), 'téléphone masqué');
  assert.equal(r.studios.Lille.suspensionsControle.liste.length, 1);
  assert.equal(kpi(r), KPI0, 'taux de non-reconduction inchangé');
  assert.equal(fichier(), FICHIER0, 'JSON mensuel jamais réécrit');
  const k = M.indicateursNR(r.studios.Lille.nonReconduction.liste);
  assert.equal(k.detectees, 3); assert.equal(k.veritables, 2); assert.equal(k.contentieux, 1); assert.equal(k.aRecuperer, 1);
  assert.equal(Object.values(k.parStatut).reduce((a, b) => a + b, 0), k.detectees, 'aucun double compte');
});

test('copies du club et du commercial : remarques automatiques avec « À faire : », suspensions dans la copie du club', async () => {
  const r = await lire();
  const club = RR.remarquesClub(r, 'Lille').texte;
  assert.match(club, /Clients non reconduits\n\nMarie Dupont\nÀ faire : Contacte le client et propose-lui l’abonnement Flex\./);
  assert.match(club, /Suspensions à contrôler\n\nJean Petit\nÀ faire : Renseigne dans Deciplus la raison de la suspension du client\./);
  assert.ok(!/Luc Martin/.test(club), 'contentieux : aucune remarque, absent de la copie');
  const com = M.commerciauxAttribuables(r)[0];
  assert.ok(com, 'au moins un commercial attribuable');
  assert.equal((await post('/api/recap2/nr-commercial', { mois: '2026-08', studio: 'Lille', client: 'DUPONT Marie', idClient: '90001', commercial: com.cle })).status, 200);
  const r2 = await lire();
  assert.match(RR.remarquesCommercial(r2, com.cle, com.nom).texte, /Clients non reconduits\n\nMarie Dupont\nÀ faire : Contacte le client et propose-lui l’abonnement Flex\./);
});

test('décision manuelle : prioritaire, fait taire la remarque, réversible, historisée ; droits admin', async () => {
  const corps = { mois: '2026-08', studio: 'Lille', client: 'DUPONT Marie', idClient: '90001', statut: 'sous_controle' };
  assert.equal((await post('/api/recap2/nr-statut', corps, { 'Content-Type': 'application/json' })).status, 401, 'sans session');
  assert.equal((await post('/api/recap2/nr-statut', corps, auth(jetonConseiller))).status, 403, 'rôle non administrateur');
  assert.equal((await post('/api/recap2/nr-statut', corps)).status, 200);
  let r = await lire();
  assert.equal(ligne(r).suivi.statut, 'sous_controle');
  assert.ok(!RR.remarquesClub(r, 'Lille').texte.includes('abonnement Flex'), 'action faite : remarque éteinte');
  assert.equal((await post('/api/recap2/nr-statut', Object.assign({}, corps, { statut: '' }))).status, 200);
  r = await lire();
  assert.equal(ligne(r).suivi.statut, ''); assert.ok(RR.remarquesClub(r, 'Lille').texte.includes('abonnement Flex'), 'retour à l’automatique');
  const h = await (await fetch(BASE + '/api/recap2/historique/2026-08', { headers: auth() })).json();
  assert.deepEqual(h.statutsNonReconduits.map((x) => x.avant + '→' + x.apres), ['→sous_controle', 'sous_controle→']);
  assert.equal((await fetch(BASE + '/api/recap2/historique/2026-08', { headers: auth(jetonConseiller) })).status, 403);
});

test('remarque automatique : modifier, copier la version affichée, revenir à l’automatique ; historisé', async () => {
  const base = { mois: '2026-08', studio: 'Lille', type: 'non_reconduit', client: 'DUPONT Marie', idClient: '90001', texteAuto: T.PRIX };
  assert.equal((await post('/api/recap2/remarque-auto', Object.assign({}, base, { texte: 'Rappeler Marie mardi pour le Flex.' }))).status, 200);
  let r = await lire();
  assert.match(RR.remarquesClub(r, 'Lille').texte, /À faire : Rappeler Marie mardi pour le Flex\./);
  assert.equal((await post('/api/recap2/remarque-auto', Object.assign({}, base, { texteAuto: 'Une phrase inventée.', texte: 'x' }))).status, 409);
  assert.equal((await post('/api/recap2/remarque-auto', Object.assign({}, base, { texte: '' }))).status, 200);
  r = await lire();
  assert.ok(RR.remarquesClub(r, 'Lille').texte.includes(T.PRIX));
  const h = await (await fetch(BASE + '/api/recap2/historique/2026-08', { headers: auth() })).json();
  assert.equal(h.remarquesAuto.filter((x) => x.type === 'non_reconduit').length, 2);
});

test('remarque manuelle : modification puis suppression historisées', async () => {
  const n = { mois: '2026-08', studio: 'Lille', type: 'non_reconduit', client: 'DUPONT Marie', idClient: '90001' };
  assert.equal((await post('/api/recap2/note', Object.assign({}, n, { remarque: 'Appelée le 20/09.' }))).status, 200);
  assert.equal((await post('/api/recap2/note', Object.assign({}, n, { remarque: 'Appelée le 20/09, rappel le 25.' }))).status, 200);
  assert.equal((await post('/api/recap2/note', Object.assign({}, n, { remarque: '', supprimer: true }))).status, 200);
  const h = await (await fetch(BASE + '/api/recap2/historique/2026-08', { headers: auth() })).json();
  assert.deepEqual(h.remarques.map((x) => [x.avant, x.apres]), [['', 'Appelée le 20/09.'], ['Appelée le 20/09.', 'Appelée le 20/09, rappel le 25.'], ['Appelée le 20/09, rappel le 25.', '']]);
});

test('cohorte figée au premier contrôle ; nouvelle prestation ensuite = SUGGESTION « Récupéré », jamais posée', async () => {
  let r = await lire();
  assert.deepEqual([ligne(r).cohorte.eligible, ligne(r, 'MARTIN Luc').cohorte.eligible, ligne(r, 'MARTIN Luc').cohorte.motifExclusion], [true, false, 'contentieux']);
  // Contrôle suivant : le client a repris un contrat.
  assert.equal((await deposerControle(controle([r1({ analyse: analyse({ statut: 'reconduit_autrement', remarques: [], motifExclusion: 'reconduit autrement', reconduction: { produit: 'Challenge Flex', debut: '2026-09-25', mensuel: 180 } }) })], '2026-09-30T10:00'))).status, 200);
  r = await lire();
  assert.equal(ligne(r).cohorte.eligible, true, 'éligibilité figée');
  assert.equal(ligne(r).suggestion, 'recupere');
  assert.equal(ligne(r).suivi.statut, '', 'jamais posé automatiquement');
  let k = M.indicateursNR(r.studios.Lille.nonReconduction.liste);
  assert.deepEqual([k.cohorte.eligibles, k.cohorte.recuperes, k.cohorte.taux], [1, 0, 0]);
  await post('/api/recap2/nr-statut', { mois: '2026-08', studio: 'Lille', client: 'DUPONT Marie', idClient: '90001', statut: 'recupere' });
  r = await lire();
  k = M.indicateursNR(r.studios.Lille.nonReconduction.liste);
  assert.deepEqual([k.cohorte.eligibles, k.cohorte.recuperes, k.cohorte.taux, k.chiffreMensuelRecupere], [1, 1, 1, 180]);
  // Un contentieux passé à la main en « Récupéré » ne gonfle pas le taux : hors cohorte.
  await post('/api/recap2/nr-statut', { mois: '2026-08', studio: 'Lille', client: 'MARTIN Luc', idClient: '90002', statut: 'recupere' });
  r = await lire();
  k = M.indicateursNR(r.studios.Lille.nonReconduction.liste);
  assert.deepEqual([k.cohorte.eligibles, k.cohorte.recuperes], [1, 1]);
});

test('persistance après nouvelle collecte et redémarrage ; KPI toujours intacts', async () => {
  assert.equal((await deposerRapport()).status, 200);
  await arreter(); await demarrer();
  const r = await lire();
  assert.equal(ligne(r).analyse.statut, 'reconduit_autrement');
  assert.equal(ligne(r).suivi.statut, 'recupere');
  assert.equal(ligne(r).cohorte.eligible, true);
  assert.equal(kpi(r), KPI0);
});
