'use strict';
// ============================================================================
//  RÉSILIATION MANUELLE, DE BOUT EN BOUT, CONTRE UN VRAI SERVEUR.
//
//  Le scénario validé par Stan :
//    marquer une vente retrouvée « Résiliée » avec une date obligatoire ->
//    actualisation -> nouvelle collecte (JSON vierge redéposé) -> redémarrage
//    du serveur -> toujours là -> retrait possible.
//  Et les garde-fous : jamais sur un « à vérifier », une fiche trouvée sans
//  vente ou une annulée ; oui sur « Retrouvé — validé manuellement » ; date
//  ni avant la signature, ni dans le futur. AUCUN KPI ne bouge.
// ============================================================================

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const S = require('../lib/recap2Store.js');

const BAC = fs.mkdtempSync(path.join(os.tmpdir(), 'recap2-resil-'));
const PORT = 3978;
const BASE = 'http://127.0.0.1:' + PORT;
const CLE = 'cle-de-test-tres-longue-0123456789';
const PIN = 'pin-de-test-resiliation';
let serveur, jeton;

const L = (o) => Object.assign({ client: 'X', date: '05/08/2026', prestation: 'Challenge', commercial: 'Fabian F.',
  annulee: false, dateAnnulation: '', retrouve: true, site: 'My Coach Marcq', dateVente: '05/08/2026', idClient: '41000', encaisse: true,
  paiement: { etat: 'encaisse', premier: '06/08/2026', finFenetre: '05/09/2026', couvertJusquau: '13/09/2026' } }, o);
const aVerifier = (o) => Object.assign(L(o), { retrouve: false, site: '', dateVente: '', idClient: '', encaisse: false, paiement: undefined });
const studio = (nom) => {
  const liste = [
    L({ client: 'Camille Gremez', date: '05/08/2026' }),
    // Proposition réelle, confirmée plus bas -> « Retrouvé — validé manuellement ».
    Object.assign(aVerifier({ client: 'Aristide Guevonoux', date: '08/08/2026' }), {
      candidat: 'GUEVENOUX Aristide', candidatScore: 0.94, candidatNiveau: 'forte', candidatIndices: ['prénom identique'], candidatSite: '', candidatId: '41856' }),
    aVerifier({ client: 'Makanfing Konate', date: '16/08/2026' }),
    Object.assign(aVerifier({ client: 'Esther Jhureea', date: '24/08/2026' }), { ficheId: '42350', ficheNom: 'JHUREEA Esther', ficheSite: 'My Coach Wasquehal' }),
    // Cas réel : annulée dans Fitness Booster, mais signée puis résiliée en réalité.
    Object.assign(aVerifier({ client: 'Dei Muteba', date: '19/08/2026' }), { annulee: true, dateAnnulation: '24/08/2026' }),
  ].map((l) => JSON.parse(JSON.stringify(l)));
  return {
    studio: nom,
    nonReconduction: { base: 4, nonReconduits: 1, taux: 0.25, tauxPct: 25, liste: [{ client: 'DUPONT Marie', netM1: 60, netM: 0 }] },
    clientsRetrouves: { ventesSignees: 5, annulees: 1, ventesActives: 4, ventesValides: 4, signataires: 4, retrouves: 1, taux: 0.25, tauxPct: 25,
      paiements: { encaisse: 1, attendu: 0, aucun: 0, indetermine: 0 }, liste },
    avertissements: [], controleBloquant: { ok: true, detail: {} },
  };
};
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
const resilier = (o) => fetch(BASE + '/api/recap2/resiliation', { method: 'POST', headers: auth(),
  body: JSON.stringify(Object.assign({ mois: '2026-08', studio: 'Marcq', client: 'Camille Gremez', date: '05/08/2026', resilie: true, dateResiliation: '10/09/2026' }, o)) });
const ligne = (r, client, s = 'Marcq') => r.studios[s].clientsRetrouves.liste.find((l) => l.client === client);
const kpi = (r) => S.LABELS.map((s) => { const c = r.studios[s].clientsRetrouves; return [c.ventesSignees, c.ventesActives, c.annulees, c.signataires, c.retrouves, c.tauxPct].join('/'); }).join(' ');
let KPI0;

before(async () => {
  await demarrer();
  assert.equal((await deposer(rapport())).status, 200);
  KPI0 = kpi(await lire());
});
after(async () => { await arreter(); try { fs.rmSync(BAC, { recursive: true, force: true }); } catch (_) {} });

test('vente retrouvée : résiliée le 10/09/2026, avec délai et auteur', async () => {
  const rep = await resilier({});
  assert.equal(rep.status, 200);
  const j = await rep.json();
  assert.deepEqual([j.resiliation.resilie, j.resiliation.date, j.resiliation.delaiJours], [true, '10/09/2026', 36]);
  assert.ok(j.resiliation.modifiePar);
  assert.ok(j.resiliation.modifieLe);
});

test('ACTUALISATION : toujours résiliée, et toujours « retrouvée » avec son paiement', async () => {
  const r = await lire();
  assert.equal(kpi(r), KPI0, 'ventes signées, actives, annulées, signataires, retrouvés et taux : STRICTEMENT identiques');
  const l = ligne(r, 'Camille Gremez');
  assert.equal(l.resiliation.resilie, true);
  assert.equal(l.resiliation.date, '10/09/2026');
  assert.equal(l.retrouve, true, 'Résilié ≠ Annulé : la vente reste retrouvée');
  assert.equal(l.annulee, false);
  assert.equal(l.paiement.etat, 'encaisse', 'le statut de paiement n\'est pas masqué');
});

test('date : obligatoire, ni avant la signature, ni dans le futur — rien n\'est écrit', async () => {
  const autre = { client: 'Camille Gremez', studio: 'Lille' };
  assert.equal((await resilier(Object.assign({ dateResiliation: '' }, autre))).status, 400);
  assert.equal((await resilier(Object.assign({ dateResiliation: '04/08/2026' }, autre))).status, 400);
  assert.equal((await resilier(Object.assign({ dateResiliation: '01/01/2099' }, autre))).status, 400);
  assert.equal(ligne(await lire(), 'Camille Gremez', 'Lille').resiliation.resilie, false);
});

test('refusée sur un « à vérifier » et sur une fiche trouvée sans vente', async () => {
  assert.equal((await resilier({ client: 'Makanfing Konate', date: '16/08/2026' })).status, 409);
  assert.equal((await resilier({ client: 'Esther Jhureea', date: '24/08/2026' })).status, 409);
  assert.equal((await resilier({ client: 'Personne Inventée' })).status, 404);
});

// ── DEI MUTEBA : ANNULÉE DANS FITNESS BOOSTER, RÉSILIÉE EN RÉALITÉ ──────────
test('DEI MUTEBA — vente annulée : date obligatoire et bornée par SA signature (19/08)', async () => {
  const dei = { client: 'Dei Muteba', date: '19/08/2026' };
  assert.equal((await resilier(Object.assign({ dateResiliation: '' }, dei))).status, 400, 'date obligatoire');
  assert.equal((await resilier(Object.assign({ dateResiliation: '18/08/2026' }, dei))).status, 400, 'avant la signature');
  assert.equal((await resilier(Object.assign({ dateResiliation: '01/01/2099' }, dei))).status, 400, 'dans le futur');
  assert.equal(ligne(await lire(), 'Dei Muteba').resiliation.resilie, false, 'rien n\'a été écrit');
});

test('DEI MUTEBA — vente annulée -> résiliée le 24/08/2026 : badge, source intacte, KPI identiques', async () => {
  const avant = await lire();
  const rep = await resilier({ client: 'Dei Muteba', date: '19/08/2026', dateResiliation: '24/08/2026' });
  assert.equal(rep.status, 200);
  const j = await rep.json();
  assert.deepEqual([j.resiliation.resilie, j.resiliation.date, j.resiliation.delaiJours], [true, '24/08/2026', 5]);
  const apres = await lire();
  const l = ligne(apres, 'Dei Muteba');
  assert.equal(l.resiliation.resilie, true);
  assert.equal(l.resiliation.date, '24/08/2026');
  assert.equal(l.annulee, true, 'la donnée source `annulee` de Fitness Booster n\'est pas modifiée');
  assert.equal(l.dateAnnulation, '24/08/2026');
  assert.equal(l.retrouve, false);
  assert.equal(kpi(apres), kpi(avant), 'une annulée reste traitée comme annulée dans TOUS les calculs');
});

test('DEI MUTEBA — ACTUALISATION : toujours « Résilié le 24/08/2026 », toujours annulée en source', async () => {
  const l = ligne(await lire(), 'Dei Muteba');
  assert.deepEqual([l.resiliation.resilie, l.resiliation.date, l.annulee], [true, '24/08/2026', true]);
});

test('ACCEPTÉE sur « Retrouvé — validé manuellement »', async () => {
  // Refusée tant que la proposition n'est pas confirmée…
  assert.equal((await resilier({ client: 'Aristide Guevonoux', date: '08/08/2026' })).status, 409);
  const conf = await fetch(BASE + '/api/recap2/matches', { method: 'POST', headers: auth(),
    body: JSON.stringify({ client: 'Aristide Guevonoux', idClient: '41856', nomDeciplus: 'GUEVENOUX Aristide', statut: 'confirmed' }) });
  assert.equal(conf.status, 200);
  // … acceptée une fois la vente retrouvée par décision humaine.
  assert.equal((await resilier({ client: 'Aristide Guevonoux', date: '08/08/2026', dateResiliation: '12/09/2026' })).status, 200);
  const l = ligne(await lire(), 'Aristide Guevonoux');
  assert.equal(l.valideManuellement, true);
  assert.equal(l.resiliation.date, '12/09/2026');
});

test('Prélèvement / Réservation ne sont pas touchés, et ne touchent pas la résiliation', async () => {
  assert.equal((await fetch(BASE + '/api/recap2/checks', { method: 'POST', headers: auth(),
    body: JSON.stringify({ mois: '2026-08', studio: 'Marcq', client: 'Camille Gremez', date: '05/08/2026', champ: 'reservation', valeur: true }) })).status, 200);
  const l = ligne(await lire(), 'Camille Gremez');
  assert.deepEqual([l.controle.prelevement, l.controle.reservation, l.resiliation.resilie, l.resiliation.date], [false, true, true, '10/09/2026']);
});

test('NOUVELLE COLLECTE (JSON vierge redéposé) : les résiliations restent', async () => {
  assert.equal((await deposer(rapport())).status, 200);
  const r = await lire();
  assert.equal(ligne(r, 'Camille Gremez').resiliation.date, '10/09/2026');
  assert.equal(ligne(r, 'Aristide Guevonoux').resiliation.date, '12/09/2026');
  assert.deepEqual([ligne(r, 'Dei Muteba').resiliation.date, ligne(r, 'Dei Muteba').annulee], ['24/08/2026', true],
    'Dei Muteba : résiliation gardée, et toujours annulée en source après recollecte');
});

test('REDÉMARRAGE du serveur (redéploiement) : toujours là', async () => {
  await arreter();
  await demarrer();
  const r = await lire();
  assert.equal(ligne(r, 'Camille Gremez').resiliation.resilie, true);
  assert.equal(ligne(r, 'Aristide Guevonoux').resiliation.resilie, true);
  assert.equal(ligne(r, 'Dei Muteba').resiliation.resilie, true);
});

test('RETRAIT en cas d\'erreur : le statut disparaît, l\'auteur du retrait est gardé', async () => {
  const rep = await resilier({ resilie: false, dateResiliation: '' });
  assert.equal(rep.status, 200);
  const l = ligne(await lire(), 'Camille Gremez');
  assert.deepEqual([l.resiliation.resilie, l.resiliation.date], [false, '']);
  assert.ok(l.resiliation.modifieLe);
});

test('DEI MUTEBA — RETRAIT : redevient une simple vente annulée, source intacte', async () => {
  assert.equal((await resilier({ client: 'Dei Muteba', date: '19/08/2026', resilie: false, dateResiliation: '' })).status, 200);
  const l = ligne(await lire(), 'Dei Muteba');
  assert.deepEqual([l.resiliation.resilie, l.resiliation.date, l.annulee, l.dateAnnulation], [false, '', true, '24/08/2026']);
});

test('AUCUN KPI ne bouge, à aucune étape (hors la validation manuelle d\'Aristide, qui est un rapprochement)', async () => {
  const r = await lire();
  // La confirmation d'Aristide change « retrouvés » : c'est la règle des rapprochements,
  // pas la résiliation. On compare donc les ventes et on isole son effet.
  S.LABELS.forEach((s) => {
    const c = r.studios[s].clientsRetrouves;
    assert.equal(c.ventesSignees, 5, s + ' ventes signées');
    assert.equal(c.ventesActives, 4, s + ' ventes actives : une résiliée reste active');
    assert.equal(c.annulees, 1, s + ' annulées');
    assert.equal(c.signataires, 4, s + ' signataires');
  });
  assert.equal(r.studios.Lille.clientsRetrouves.retrouves, 2, '1 retrouvé + Aristide validé à la main, résiliations sans effet');
});
