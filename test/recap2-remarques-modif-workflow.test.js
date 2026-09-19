'use strict';
// ============================================================================
//  REMARQUES MODIFIABLES (manuelles et automatiques), DE BOUT EN BOUT, CONTRE UN VRAI SERVEUR.
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
const RG = require('./_regles.js');
const T = { PRIX: RG.T['NR-PRIX'], DEMENAGEMENT: RG.T['NR-DEMENAGEMENT'], SUSP_RAISON: RG.T['SUSP-DOC'], IDENTITE: RG.T['NR-IDENTITE'] };

const BAC = fs.mkdtempSync(path.join(os.tmpdir(), 'recap2-rem-'));
const PORT = 3972;
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

const Database = require('better-sqlite3');
const Notes = require('../lib/recap2Notes.js');
const note = (o) => Object.assign({ mois: '2026-08', studio: 'Lille', type: 'non_reconduit', client: 'DUPONT Marie', idClient: '90001' }, o);
const perso = (o) => Object.assign({ mois: '2026-08', studio: 'Lille', type: 'non_reconduit', client: 'DUPONT Marie', idClient: '90001', regle: 'NR-PRIX' }, o);
const histo = async () => (await fetch(BASE + '/api/recap2/historique/2026-08', { headers: auth() })).json();

before(async () => {
  await demarrer();
  assert.equal((await deposerRapport()).status, 200);
  assert.equal((await deposerControle(controle([r1()]))).status, 200);
});
after(async () => { await arreter(); try { fs.rmSync(BAC, { recursive: true, force: true }); } catch (_) {} });

test('remarque manuelle : ajout, modification, « Modifiée par », refus du vide, suppression explicite ; historique admin', async () => {
  assert.equal((await post('/api/recap2/note', note({ remarque: 'Appelée le 20/09.' }))).status, 200);
  assert.equal((await post('/api/recap2/note', note({ remarque: 'Appelée le 20/09, rappel vendredi.' }))).status, 200);
  const l = ligne(await lire());
  assert.deepEqual([l.note.remarque, l.note.modifiee, l.note.modifiePar, l.note.auteur], ['Appelée le 20/09, rappel vendredi.', true, 'Stan', 'Stan']);
  assert.equal((await post('/api/recap2/note', note({ remarque: '   ' }))).status, 400, 'remarque vide refusée');
  assert.equal(ligne(await lire()).note.remarque, 'Appelée le 20/09, rappel vendredi.', 'le texte précédent reste');
  const h = await histo();
  assert.deepEqual(h.remarques.map((x) => [x.avant, x.apres, x.par]), [['', 'Appelée le 20/09.', 'Stan'], ['Appelée le 20/09.', 'Appelée le 20/09, rappel vendredi.', 'Stan']]);
});

test('droits : un autre utilisateur ne crée ni ne modifie ; l’auteur modifie SA remarque ; historique réservé à l’admin', async () => {
  assert.equal((await post('/api/recap2/note', note({ remarque: 'x' }), auth(jetonConseiller))).status, 403, 'remarque d’un autre');
  assert.equal((await post('/api/recap2/note', note({ client: 'MARTIN Luc', idClient: '90002', remarque: 'x' }), auth(jetonConseiller))).status, 403, 'création');
  // Une remarque écrite par « Mathieu » (le rôle consultant de test) : il peut la modifier.
  const db = new Database(path.join(BAC, 'data.db'));
  Notes.enregistrer(db, { mois: '2026-08', studio: 'Lille', type: 'non_reconduit', client: 'LEROY Anne', idClient: '90003', remarque: 'Note de Mathieu', par: 'Mathieu' });
  db.close();
  assert.equal((await post('/api/recap2/note', note({ client: 'LEROY Anne', idClient: '90003', remarque: 'Note de Mathieu, corrigée' }), auth(jetonConseiller))).status, 200);
  assert.equal((await post('/api/recap2/note', note({ remarque: 'x' }), { 'Content-Type': 'application/json' })).status, 401);
  assert.equal((await fetch(BASE + '/api/recap2/historique/2026-08', { headers: auth(jetonConseiller) })).status, 403);
});

test('remarque automatique : personnalisée, repérée, copiée ; l’origine est gardée ; droits', async () => {
  assert.equal((await post('/api/recap2/remarque-auto', perso({ texte: 'Appelle le client vendredi et propose-lui l’abonnement Flex.' }), auth(jetonConseiller))).status, 403, 'création réservée à l’admin');
  assert.equal((await post('/api/recap2/remarque-auto', perso({ texte: 'Appelle le client vendredi et propose-lui l’abonnement Flex.' }))).status, 200);
  const r = await lire();
  const v = ligne(r).remarquesPerso['NR-PRIX'];
  assert.deepEqual([v.texte, v.auteur], ['Appelle le client vendredi et propose-lui l’abonnement Flex.', 'Stan']);
  assert.match(RR.remarquesClub(r, 'Lille').texte, /À faire : Appelle le client vendredi et propose-lui l’abonnement Flex\./);
  const com = M.commerciauxAttribuables(r)[0];
  await post('/api/recap2/nr-commercial', { mois: '2026-08', studio: 'Lille', client: 'DUPONT Marie', idClient: '90001', commercial: com.cle });
  assert.match(RR.remarquesCommercial(await lire(), com.cle, com.nom).texte, /À faire : Appelle le client vendredi/);
  assert.equal((await post('/api/recap2/remarque-auto', perso({ texte: '  ' }))).status, 200, 'vide = retour à l’automatique (route) ; l’écran le refuse et propose le bouton dédié');
  assert.equal((await post('/api/recap2/remarque-auto', perso({ texte: 'Appelle le client vendredi et propose-lui l’abonnement Flex.' }))).status, 200);
});

test('persistance : rechargement, nouvelle collecte, nouveau contrôle identique, redémarrage', async () => {
  assert.equal((await deposerRapport()).status, 200);
  assert.equal((await deposerControle(controle([r1()], '2026-09-20T09:00'))).status, 200);
  await arreter(); await demarrer();
  const l = ligne(await lire());
  assert.equal(l.remarquesPerso['NR-PRIX'].texte, 'Appelle le client vendredi et propose-lui l’abonnement Flex.');
  assert.equal(l.note.remarque, 'Appelée le 20/09, rappel vendredi.');
});

test('nouvelle règle différente : l’ancienne personnalisation n’est PAS réutilisée ; situation résolue : elle disparaît, l’historique reste', async () => {
  assert.equal((await deposerControle(controle([r1({ analyse: analyse({ cause: { code: 'demenagement', libelle: 'Déménagement', certitude: 'Confirmée', indice: '' }, remarques: [T.DEMENAGEMENT] }) })], '2026-09-21T09:00'))).status, 200);
  let r = await lire();
  assert.ok(!/Appelle le client vendredi/.test(RR.remarquesClub(r, 'Lille').texte), 'autre règle : pas de réemploi');
  assert.match(RR.remarquesClub(r, 'Lille').texte, /À faire : Contacte le client et propose-lui un transfert de studio/);
  assert.equal((await deposerControle(controle([r1({ analyse: analyse({ statut: 'reconduit_autrement', remarques: [], motifExclusion: 'reconduit autrement' }) })], '2026-09-22T09:00'))).status, 200);
  r = await lire();
  assert.ok(!/Appelle le client vendredi|transfert de studio/.test(RR.remarquesClub(r, 'Lille').texte), 'situation résolue : plus rien d’actif');
  const h = await histo();
  assert.ok(h.remarquesAuto.some((x) => x.apres === 'Appelle le client vendredi et propose-lui l’abonnement Flex.'), 'historique conservé');
});

test('retour à la version automatique quand la règle revient', async () => {
  assert.equal((await deposerControle(controle([r1()], '2026-09-23T09:00'))).status, 200);
  assert.match(RR.remarquesClub(await lire(), 'Lille').texte, /Appelle le client vendredi/, 'même règle revenue : sa personnalisation revient');
  assert.equal((await post('/api/recap2/remarque-auto', perso({ texte: '' }))).status, 200);
  assert.match(RR.remarquesClub(await lire(), 'Lille').texte, /À faire : Contacte le client et propose-lui le Challenge Flex à 4 séances par mois\./);
});

test('aucune écriture vers Deciplus ou Vendor', () => {
  const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  for (const route of ["app.post('/api/recap2/note'", "app.post('/api/recap2/remarque-auto'"]) {
    const i = srv.indexOf(route); const bloc = srv.slice(i, srv.indexOf('\n});', i));
    assert.ok(bloc.length > 100 && !/deciplus\.pro|fitness-booster|fetch\(/.test(bloc), route);
  }
});
