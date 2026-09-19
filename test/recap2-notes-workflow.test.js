'use strict';
// ============================================================================
//  REMARQUES PAR PERSONNE, DE BOUT EN BOUT, CONTRE UN VRAI SERVEUR.
//
//  Le scénario demandé par Stan :
//    remarque sur une vente + sur un non-reconduit -> modification ->
//    actualisation -> nouvelle collecte (JSON vierge redéposé) -> redémarrage
//    -> août ≠ septembre -> copie du club (deux sections, rien d'autre) ->
//    suppression. Et : AUCUN KPI modifié, le JSON déposé jamais réécrit.
// ============================================================================

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const S = require('../lib/recap2Store.js');
const RR = require('../public/recap2-remarques.js');

const BAC = fs.mkdtempSync(path.join(os.tmpdir(), 'recap2-notes-'));
const PORT = 3983;
const BASE = 'http://127.0.0.1:' + PORT;
const CLE = 'cle-de-test-tres-longue-0123456789';
const PIN = 'pin-de-test-remarques';
let serveur, jeton;

const L = (o) => Object.assign({ client: 'X', date: '05/08/2026', prestation: 'Challenge', commercial: 'Fabian F.',
  annulee: false, dateAnnulation: '', retrouve: true, site: 'My Coach Neuilly', dateVente: '05/08/2026', idClient: '41000', encaisse: true }, o);
const studio = (nom, mois) => ({
  studio: nom,
  nonReconduction: { base: 10, nonReconduits: 3, taux: 0.3, tauxPct: 30, liste: [
    { client: 'AMIEL Anais', idClient: '42001', netM1: 60, netM: 0 },
    { client: 'BASSIN Robin', idClient: '42002', netM1: 45, netM: 0 },
    { client: 'SANS Remarque', idClient: '42003', netM1: 30, netM: 0 },
  ] },
  clientsRetrouves: { ventesSignees: 3, annulees: 0, ventesActives: 3, ventesValides: 3, signataires: 3, retrouves: 2, taux: 2 / 3, tauxPct: 66.7, liste: [
    L({ client: 'Daouda Sy', idClient: '41001', date: '05/' + mois.slice(5) + '/2026', dateVente: '05/' + mois.slice(5) + '/2026' }),
    L({ client: 'Aurélie Fourlin', idClient: '', retrouve: false, site: '', dateVente: '', encaisse: false, date: '08/' + mois.slice(5) + '/2026' }),
    L({ client: 'Personne Tranquille', idClient: '41003', date: '10/' + mois.slice(5) + '/2026', dateVente: '10/' + mois.slice(5) + '/2026' }),
  ] },
  avertissements: [], controleBloquant: { ok: true, detail: {} },
});
const rapport = (mois = '2026-08') => ({ businessVersion: 2, genere: new Date().toISOString(), mois, m1: mois === '2026-08' ? '2026-07' : '2026-08',
  source: { fitnessBooster: {} }, studios: Object.fromEntries(S.LABELS.map((s) => [s, studio(s, mois)])), journal: [], erreurs: [] });

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
const noter = (o, h = auth()) => fetch(BASE + '/api/recap2/note', { method: 'POST', headers: h,
  body: JSON.stringify(Object.assign({ mois: '2026-08', studio: 'Neuilly', type: 'vente', client: 'Daouda Sy', idClient: '41001', remarque: 'x' }, o)) });
const vente = (r, client, s = 'Neuilly') => r.studios[s].clientsRetrouves.liste.find((l) => l.client === client);
const nr = (r, client, s = 'Neuilly') => r.studios[s].nonReconduction.liste.find((l) => l.client === client);
// Tous les compteurs ET tous les champs source des lignes, notes retirées.
const empreinte = (r) => {
  const c = JSON.parse(JSON.stringify(r));
  delete c.genere;
  Object.values(c.studios).forEach((b) => {
    b.clientsRetrouves.liste.forEach((l) => delete l.note);
    b.nonReconduction.liste.forEach((l) => delete l.note);
  });
  return JSON.stringify(c.studios);
};
const fichier = (mois = '2026-08') => fs.readFileSync(path.join(BAC, 'recap2', 'recap2-' + mois + '.json'), 'utf8');
let EMPREINTE0, FICHIER0;

before(async () => {
  await demarrer();
  assert.equal((await deposer(rapport('2026-08'))).status, 200);
  assert.equal((await deposer(rapport('2026-09'))).status, 200);
  const r = await lire();
  EMPREINTE0 = empreinte(r);
  FICHIER0 = fichier();
  assert.deepEqual(vente(r, 'Daouda Sy').note, { remarque: '', modifieLe: '', modifiePar: '' }, 'aucune remarque par défaut');
});
after(async () => { await arreter(); try { fs.rmSync(BAC, { recursive: true, force: true }); } catch (_) {} });

test('AJOUT sur une vente signée', async () => {
  const rep = await noter({ remarque: 'A demandé à résilier.' });
  assert.equal(rep.status, 200);
  const j = await rep.json();
  assert.equal(j.note.remarque, 'A demandé à résilier.');
  assert.ok(j.note.modifiePar && j.note.modifieLe);
  assert.equal((await noter({ client: 'Aurélie Fourlin', idClient: '', remarque: 'Aucun encaissement depuis la signature, à contacter.' })).status, 200,
    'vente « à vérifier », sans Id membre : rattachée par le nom');
});

test('AJOUT sur un client non reconduit', async () => {
  assert.equal((await noter({ type: 'non_reconduit', client: 'AMIEL Anais', idClient: '42001', remarque: 'Cliente contactée, situation sous contrôle.' })).status, 200);
  assert.equal((await noter({ type: 'non_reconduit', client: 'BASSIN Robin', idClient: '42002', remarque: 'À creuser avec le coach.' })).status, 200);
});

test('MODIFICATION', async () => {
  assert.equal((await noter({ remarque: 'A demandé à résilier, à revoir avec le coach leader.' })).status, 200);
});

test('ACTUALISATION : tout est là, au bon type', async () => {
  const r = await lire();
  assert.equal(vente(r, 'Daouda Sy').note.remarque, 'A demandé à résilier, à revoir avec le coach leader.');
  assert.equal(vente(r, 'Aurélie Fourlin').note.remarque, 'Aucun encaissement depuis la signature, à contacter.');
  assert.equal(nr(r, 'AMIEL Anais').note.remarque, 'Cliente contactée, situation sous contrôle.');
  assert.equal(vente(r, 'Personne Tranquille').note.remarque, '');
  assert.equal(nr(r, 'SANS Remarque').note.remarque, '');
  assert.equal(vente(r, 'Daouda Sy', 'Lille').note.remarque, '', 'autre studio');
});

test('garde-fous : personne absente, mauvais type, type inconnu, remarque manquante, sans session', async () => {
  assert.equal((await noter({ client: 'Personne Inventée', idClient: '' })).status, 404);
  assert.equal((await noter({ type: 'non_reconduit', client: 'Daouda Sy', idClient: '41001' })).status, 404, 'Daouda Sy n\'est pas non reconduit');
  assert.equal((await noter({ type: 'client' })).status, 400);
  assert.equal((await noter({ remarque: null })).status, 400);
  assert.equal((await noter({ remarque: 'x'.repeat(2001) })).status, 400);
  assert.equal((await noter({}, { 'Content-Type': 'application/json' })).status, 401);
  assert.equal(vente(await lire(), 'Daouda Sy').note.remarque, 'A demandé à résilier, à revoir avec le coach leader.', 'rien n\'a été écrit');
});

test('AOÛT ≠ SEPTEMBRE : les mêmes personnes en septembre n\'ont aucune remarque', async () => {
  const sept = await lire('2026-09');
  assert.equal(vente(sept, 'Daouda Sy').note.remarque, '');
  assert.equal(nr(sept, 'AMIEL Anais').note.remarque, '');
  assert.equal(RR.remarquesClub(sept, 'Neuilly').nb, 0);
  assert.equal((await noter({ mois: '2026-09', remarque: 'septembre' })).status, 200);
  assert.equal(vente(await lire(), 'Daouda Sy').note.remarque, 'A demandé à résilier, à revoir avec le coach leader.', 'août intact');
});

test('NOUVELLE COLLECTE (JSON vierge redéposé) : les remarques restent', async () => {
  assert.equal((await deposer(rapport('2026-08'))).status, 200);
  const r = await lire();
  assert.equal(vente(r, 'Daouda Sy').note.remarque, 'A demandé à résilier, à revoir avec le coach leader.');
  assert.equal(nr(r, 'BASSIN Robin').note.remarque, 'À creuser avec le coach.');
});

test('REDÉMARRAGE du serveur (redéploiement, reconnexion) : toujours là', async () => {
  await arreter();
  await demarrer();
  const r = await lire();
  assert.equal(vente(r, 'Aurélie Fourlin').note.remarque, 'Aucun encaissement depuis la signature, à contacter.');
  assert.equal(nr(r, 'AMIEL Anais').note.remarque, 'Cliente contactée, situation sous contrôle.');
});

test('COPIE DU CLUB : deux sections, uniquement les personnes à remarque', async () => {
  const r = RR.remarquesClub(await lire(), 'Neuilly');
  assert.equal(r.nb, 4);
  assert.equal(r.texte, [
    'NEUILLY — AOÛT 2026', '',
    'Ventes signées', '',
    'Daouda Sy — vente du 05/08/2026 · Challenge', 'A demandé à résilier, à revoir avec le coach leader.', '',
    'Aurélie Fourlin — vente du 08/08/2026 · Challenge', 'Aucun encaissement depuis la signature, à contacter.', '',
    'Clients non reconduits', '',
    'Anais Amiel — client non reconduit', 'Cliente contactée, situation sous contrôle.', '',
    'Robin Bassin — client non reconduit', 'À creuser avec le coach.', '',
  ].join('\n'));
  assert.ok(!/Personne Tranquille|SANS Remarque/i.test(r.texte + r.html), 'aucune personne sans remarque');
  assert.equal(RR.remarquesClub(await lire(), 'Lille').nb, 0, 'club sans remarque : rien à copier');
});

test('SUPPRESSION : la remarque disparaît de l\'écran et de la copie', async () => {
  const rep = await noter({ type: 'non_reconduit', client: 'BASSIN Robin', idClient: '42002', remarque: '', supprimer: true });
  assert.equal(rep.status, 200);
  assert.equal((await rep.json()).note.remarque, '');
  const r = await lire();
  assert.equal(nr(r, 'BASSIN Robin').note.remarque, '');
  const copie = RR.remarquesClub(r, 'Neuilly');
  assert.equal(copie.nb, 3);
  assert.ok(!/BASSIN/i.test(copie.texte + copie.html));
});

test('AUCUN KPI modifié, JSON déposé jamais réécrit par une remarque', async () => {
  assert.equal(empreinte(await lire()), EMPREINTE0, 'compteurs, taux et champs source de toutes les lignes identiques');
  // Le fichier a été redéposé par la « nouvelle collecte » : on compare son contenu utile, sans l'horodatage.
  const sansGenere = (t) => { const j = JSON.parse(t); delete j.genere; return JSON.stringify(j); };
  assert.equal(sansGenere(fichier()), sansGenere(FICHIER0));
  assert.ok(fichier().indexOf('"note"') < 0, 'aucune remarque dans le JSON source');
});
