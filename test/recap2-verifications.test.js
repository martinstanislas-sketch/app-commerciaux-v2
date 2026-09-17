'use strict';
// ============================================================================
//  VÉRIFICATION MANUELLE D'UNE VENTE « À VÉRIFIER », DE BOUT EN BOUT.
//
//  Le scénario demandé, tel qu'il se joue à l'écran :
//    vente non retrouvée -> un administrateur la valide à la main -> statut
//    « Vérifiée » (et non « Retrouvée »), comptée dans « Contrats validés »
//    -> rechargement -> NOUVELLE COLLECTE -> NOUVEAU CONTRÔLE AUTOMATIQUE
//    -> REDÉMARRAGE du serveur -> la décision tient à chaque fois
//    -> annulation -> la vente redevient « À vérifier ».
//  Et à chaque étape : `retrouve` intact, KPI intacts, aucun accès Deciplus.
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

const BAC = fs.mkdtempSync(path.join(os.tmpdir(), 'recap2-verif-'));
const PORT = 3987;
const BASE = 'http://127.0.0.1:' + PORT;
const CLE = 'cle-de-test-tres-longue-0123456789';
const PIN = 'pin-de-test-verifications';
let serveur, jeton;

const ligne = (o) => Object.assign({ client: 'X', date: '05/08/2026', prestation: 'Challenge', commercial: 'Cédric H.',
  annulee: false, dateAnnulation: '', retrouve: true, site: 'My Coach Wasquehal', dateVente: '27/08/2026', idClient: '40003', encaisse: false }, o);
const studio = (nom) => ({
  studio: nom,
  nonReconduction: { base: 4, nonReconduits: 1, taux: 0.25, tauxPct: 25, liste: [{ client: 'DUPONT Marie', netM1: 60, netM: 0 }] },
  clientsRetrouves: {
    ventesSignees: 3, annulees: 0, ventesActives: 3, signataires: 3, retrouves: 2, taux: 0.667, tauxPct: 66.7,
    liste: [
      ligne({ client: 'Julien Berger', date: '12/08/2026' }),
      // Retrouvée, mais sur le site Deciplus d'un AUTRE studio : écart de site.
      ligne({ client: 'Sophie Marchand', date: '12/08/2026', site: 'My Coach Marcq', idClient: '40002' }),
      // La vente « à vérifier » : fiche Deciplus trouvée, aucune vente saisie.
      ligne({ client: 'Camille Renard', date: '24/08/2026', retrouve: false, site: '', dateVente: '', idClient: '', ficheId: '40001' }),
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
const verifier = (o, auth = true) => fetch(BASE + '/api/recap2/verification', {
  method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth ? { Authorization: 'Bearer ' + jeton } : {}),
  body: JSON.stringify(Object.assign({ mois: '2026-08', studio: 'Wasquehal', client: 'Camille Renard', date: '24/08/2026', valeur: 'verifiee' }, o)),
});
const camille = (r, s = 'Wasquehal') => r.studios[s].clientsRetrouves.liste.find((l) => l.client === 'Camille Renard');
const kpi = (r) => S.LABELS.map((s) => { const c = r.studios[s].clientsRetrouves; return [c.signataires, c.retrouves, c.taux, c.tauxPct].join('/'); }).join(' ');
let KPI0;

before(async () => {
  await demarrer();
  assert.equal((await deposer(rapport())).status, 200, 'dépôt initial');
  KPI0 = kpi(await lire());
});
after(async () => { await arreter(); try { fs.rmSync(BAC, { recursive: true, force: true }); } catch (_) {} });

test('au départ : la vente est « à vérifier », 1/2 contrat validé', async () => {
  const r = await lire();
  assert.equal(camille(r).retrouve, false);
  assert.equal(camille(r).verification, undefined);
  const cv = M.contratsValides(r.studios.Wasquehal.clientsRetrouves.liste);
  assert.deepEqual([cv.valides, cv.actives], [2, 3]);
});

test('sans session : refusé ; la vérification est réservée aux administrateurs', async () => {
  assert.equal((await verifier({}, false)).status, 401);
  const r = await lire();
  assert.equal(camille(r).verification, undefined);
});

test('VALIDER : la vente devient « vérifiée », avec l\'utilisateur, la date et l\'heure', async () => {
  const rep = await verifier({});
  assert.equal(rep.status, 200);
  const j = await rep.json();
  assert.equal(j.verification.verifiee, true);
  assert.ok(j.verification.modifiePar, 'qui a validé');
  assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(j.verification.modifieLe), 'quand');
});

test('le pourcentage passe à 2/2, sans que « retrouvée » ne bouge', async () => {
  const r = await lire();
  assert.equal(camille(r).verification.verifiee, true);
  assert.equal(camille(r).retrouve, false, 'la recherche automatique reste intacte — traçabilité');
  assert.equal(M.motifValidation(camille(r)), 'verification', 'jamais « automatique » ni « rapprochement »');
  const cv = M.contratsValides(r.studios.Wasquehal.clientsRetrouves.liste);
  assert.deepEqual([cv.valides, cv.actives, cv.taux], [3, 3, 1], '3/3 = 100 %');
  assert.equal(camille(r).ficheId, '40001', 'le lien vers la fiche Deciplus reste possible');
});

test('aucun KPI du rapport ne bouge, et le fichier sur disque reste brut', async () => {
  assert.equal(kpi(await lire()), KPI0);
  const brut = JSON.parse(fs.readFileSync(path.join(BAC, 'recap2', 'recap2-2026-08.json'), 'utf8'));
  const e = brut.studios.Wasquehal.clientsRetrouves.liste.find((l) => l.client === 'Camille Renard');
  assert.equal(e.verification, undefined, 'rien n\'est écrit dans le rapport mensuel');
  assert.equal(e.retrouve, false);
});

test('la vente vérifiée n\'est plus une anomalie à traiter dans les remarques', async () => {
  const r = await lire();
  const e = camille(r);
  e.automatique = { alertes: [] };
  e.operationnel = { prelevement: 'ok', reservation: 'ok', resilie: 'ko', sources: {} };
  assert.deepEqual(C.conseilsVente(e), [], 'plus de « Vérifie et complète la vente dans Deciplus »');
  e.operationnel.reservation = 'ko';
  assert.deepEqual(C.conseilsVente(e), [C.TEXTES.SEANCES], 'les autres actions restent');
});

test('un autre studio, même nom : sa vente reste à vérifier', async () => {
  const r = await lire();
  assert.equal(camille(r, 'Lille').verification, undefined);
});

test('une vente DÉJÀ retrouvée ne peut pas être vérifiée à la main', async () => {
  const rep = await verifier({ client: 'Julien Berger', date: '12/08/2026' });
  assert.equal(rep.status, 409);
});

test('une vente absente du rapport est refusée', async () => {
  assert.equal((await verifier({ client: 'Personne Inconnue', date: '01/08/2026' })).status, 404);
});

test('NOUVELLE COLLECTE (JSON vierge redéposé) : la vérification tient', async () => {
  assert.equal((await deposer(rapport())).status, 200);
  const r = await lire();
  assert.equal(camille(r).verification.verifiee, true);
  assert.equal(kpi(r), KPI0);
});

test('NOUVEAU CONTRÔLE AUTOMATIQUE déposé : la vérification tient', async () => {
  const depot = { controleLe: '2026-09-17T18:30', resultats: [
    { studio: 'Wasquehal', client: 'Camille Renard', date: '24/08/2026', idDeciplus: '40001',
      prelevement: 'ok', reservation: 'ko', resilie: 'ko', alertes: [], regles: ['R3'], contrat: null, raison: '', attribution: null },
  ] };
  const rep = await fetch(BASE + '/api/recap2/automatique/2026-08', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Recap2-Key': CLE }, body: JSON.stringify(depot) });
  assert.equal(rep.status, 200);
  const r = await lire();
  assert.equal(camille(r).verification.verifiee, true);
  assert.equal(camille(r).operationnel.prelevement, 'ok');
  assert.equal(kpi(r), KPI0);
});

test('REDÉMARRAGE du serveur (= redéploiement) : la vérification tient', async () => {
  await arreter();
  await demarrer();
  const r = await lire();
  assert.equal(camille(r).verification.verifiee, true);
});

test('ANNULER : la vente redevient « à vérifier » et sort du pourcentage', async () => {
  const rep = await verifier({ valeur: 'a_verifier' });
  assert.equal(rep.status, 200);
  assert.equal((await rep.json()).verification.verifiee, false);
  const r = await lire();
  assert.equal(camille(r).verification, undefined);
  assert.equal(M.motifValidation(camille(r)), '');
  assert.equal(M.contratsValides(r.studios.Wasquehal.clientsRetrouves.liste).valides, 2);
  assert.equal(kpi(r), KPI0);
});

test('une valeur inconnue est refusée', async () => {
  assert.equal((await verifier({ valeur: 'peut-etre' })).status, 400);
});

// ── ACQUITTEMENT D'UN ÉCART DE SITE DECIPLUS ────────────────────────────────
//  Sophie Marchand est retrouvée à Wasquehal, mais sur le site Deciplus de
//  Marcq. L'écart est une ALERTE : un administrateur peut la marquer vérifiée.
const sophie = (r, s = 'Wasquehal') => r.studios[s].clientsRetrouves.liste.find((l) => l.client === 'Sophie Marchand');
const acquitter = (o, auth = true) => fetch(BASE + '/api/recap2/verification', {
  method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth ? { Authorization: 'Bearer ' + jeton } : {}),
  body: JSON.stringify(Object.assign({ mois: '2026-08', studio: 'Wasquehal', client: 'Sophie Marchand', date: '12/08/2026',
    valeur: 'verifiee', type: 'site' }, o)),
});

test('au départ : l\'écart de site est une alerte à traiter', async () => {
  const r = await lire();
  assert.deepEqual(M.siteDivergent(sophie(r), 'Wasquehal'), { attendu: 'Wasquehal', site: 'My Coach Marcq' });
  assert.equal(sophie(r).ecartSite, undefined);
});

test('sans session : l\'acquittement est refusé', async () => {
  assert.equal((await acquitter({}, false)).status, 401);
});

test('MARQUER COMME VÉRIFIÉ : tracé, sans toucher au site ni à l\'attribution', async () => {
  const rep = await acquitter({});
  assert.equal(rep.status, 200);
  const j = await rep.json();
  assert.equal(j.verification.type, 'site');
  assert.equal(j.verification.verifiee, true);
  assert.ok(j.verification.modifiePar && j.verification.modifieLe, 'qui et quand');
  const r = await lire();
  assert.equal(sophie(r).ecartSite.verifiee, true);
  assert.equal(sophie(r).site, 'My Coach Marcq', 'le site Deciplus trouvé reste inchangé — traçabilité');
  assert.equal(sophie(r).studio, undefined, 'aucune réattribution de la vente');
  assert.deepEqual(M.siteDivergent(sophie(r), 'Wasquehal'), { attendu: 'Wasquehal', site: 'My Coach Marcq' },
    'l\'écart automatique reste calculable — c\'est l\'écran qui cesse de l\'alerter');
  assert.equal(kpi(r), KPI0, 'aucun KPI ne bouge');
});

test('l\'acquittement d\'un écart ne vaut pas validation de vente', async () => {
  const r = await lire();
  assert.equal(sophie(r).verification, undefined);
  assert.equal(M.motifValidation(sophie(r)), 'automatique', 'elle était déjà retrouvée');
});

test('une vente SANS écart de site ne peut pas être acquittée', async () => {
  assert.equal((await acquitter({ client: 'Julien Berger', date: '12/08/2026' })).status, 409);
});

test('une vente NON retrouvée ne peut pas porter un écart de site', async () => {
  assert.equal((await acquitter({ client: 'Camille Renard', date: '24/08/2026' })).status, 409);
});

test('un type inconnu est refusé', async () => {
  assert.equal((await acquitter({ type: 'autre' })).status, 400);
});

test('l\'acquittement tient après une nouvelle collecte et un redémarrage', async () => {
  assert.equal((await deposer(rapport())).status, 200);
  assert.equal(sophie(await lire()).ecartSite.verifiee, true);
  await arreter(); await demarrer();
  assert.equal(sophie(await lire()).ecartSite.verifiee, true);
});

test('ANNULER : l\'écart redevient une alerte à traiter', async () => {
  const rep = await acquitter({ valeur: 'a_verifier' });
  assert.equal(rep.status, 200);
  assert.equal((await rep.json()).verification.verifiee, false);
  const r = await lire();
  assert.equal(sophie(r).ecartSite, undefined);
  assert.equal(kpi(r), KPI0);
});
