'use strict';
// ============================================================================
//  LE WORKFLOW DE RAPPROCHEMENT, DE BOUT EN BOUT, CONTRE UN VRAI SERVEUR.
//
//  Le scénario Aristide, tel qu'il se joue à l'écran :
//    proposition -> confirmation -> « retrouvé, validé manuellement » -> KPI
//    recalculé -> rechargement -> nouvelle collecte -> toujours reconnu.
//  Puis le refus : la même proposition ne doit jamais revenir.
//
//  Ce qui se joue : les décisions ne vivent PAS dans le JSON mensuel, qui est
//  remplacé à chaque collecte. On le prouve en redéposant le mois entre deux
//  lectures — la validation doit survivre.
// ============================================================================

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const BAC = fs.mkdtempSync(path.join(os.tmpdir(), 'recap2-wf-'));
const PORT = 3973;
const BASE = 'http://127.0.0.1:' + PORT;
const CLE = 'cle-de-test-tres-longue-0123456789';
const PIN = 'pin-de-test-workflow';
let serveur, jeton;

const S = require('../lib/recap2Store.js');

// Un studio réaliste : un retrouvé exact, une PROPOSITION (le cas Aristide),
// un vrai « à vérifier », une annulée.
const ligneProposee = () => ({
  client: 'Aristide Guevonoux', date: '08/07/2026', prestation: 'Challenge', commercial: 'Fabian F.',
  annulee: false, dateAnnulation: '', retrouve: false, site: '', dateVente: '', idClient: '', encaisse: false,
  candidat: 'GUEVENOUX Aristide', candidatScore: 0.941, candidatNiveau: 'forte',
  candidatIndices: ['prénom identique', 'nom similaire à 89 %'],
  candidatSite: 'My Coach Vieux Lille', candidatId: '41856',
});
const studio = (nom) => ({
  studio: nom,
  nonReconduction: { base: 4, nonReconduits: 1, taux: 0.25, tauxPct: 25, liste: [{ client: 'DUPONT Marie', netM1: 60, netM: 0 }] },
  clientsRetrouves: {
    ventesSignees: 4, annulees: 1, ventesActives: 3, signataires: 3, retrouves: 1, taux: 1 / 3, tauxPct: 33.3,
    liste: [
      { client: 'Chloé Le Bossenec', date: '03/07/2026', prestation: 'X', commercial: 'Fabian F.', annulee: false, dateAnnulation: '', retrouve: true, site: 'My Coach Vieux Lille', dateVente: '03/07/2026', idClient: '41800', encaisse: true },
      ligneProposee(),
      { client: 'Makanfing Konate', date: '16/07/2026', prestation: 'X', commercial: 'Luca R.', annulee: false, dateAnnulation: '', retrouve: false, site: '', dateVente: '', idClient: '', encaisse: false },
      { client: 'Lydie Babdor', date: '18/07/2026', prestation: 'X', commercial: 'Luca R.', annulee: true, dateAnnulation: '07/09/2026', retrouve: false, site: '', dateVente: '', idClient: '', encaisse: false },
    ],
  },
  avertissements: [], controleBloquant: { ok: true, detail: {} },
});
const rapport = (mois = '2026-07') => ({
  businessVersion: 2, genere: new Date().toISOString(), mois, m1: S.moisPrecedent(mois),
  source: { fitnessBooster: {} },
  studios: Object.fromEntries(S.LABELS.map((s) => [s, studio(s)])),
  journal: [], erreurs: [],
});

const deposer = (mois, corps) => fetch(BASE + '/api/recap2/' + mois, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Recap2-Key': CLE },
  body: JSON.stringify(corps),
});
const lire = async (mois) => {
  const r = await fetch(BASE + '/api/recap2/' + mois, { headers: { Authorization: 'Bearer ' + jeton } });
  assert.equal(r.status, 200, 'lecture du mois');
  return r.json();
};
const decider = (corps) => fetch(BASE + '/api/recap2/matches', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jeton },
  body: JSON.stringify(corps),
});
const lilleKpi = (r) => r.studios.Lille.clientsRetrouves;
const aristide = (r) => r.studios.Lille.clientsRetrouves.liste.find((l) => l.client === 'Aristide Guevonoux');

before(async () => {
  serveur = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT), DB_DIR: BAC, RECAP2_INGEST_KEY: CLE, ADMIN_PIN: PIN }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serveur.stdout.resume(); serveur.stderr.resume();
  for (let i = 0; i < 100; i++) {
    try { await fetch(BASE + '/api/recap2/2026-07'); break; }
    catch (_) { await new Promise((r) => setTimeout(r, 100)); }
  }
  const r = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: PIN }),
  });
  jeton = (await r.json()).token;
  assert.ok(jeton, 'session admin');
  assert.equal((await deposer('2026-07', rapport())).status, 200, 'dépôt initial');
});
after(() => { if (serveur) serveur.kill(); try { fs.rmSync(BAC, { recursive: true, force: true }); } catch (_) {} });

// ── L'ÉTAT DE DÉPART ────────────────────────────────────────────────────────
test('au départ : 1 retrouvé, 1 rapprochement proposé, 1 à vérifier, 1 annulée', async () => {
  const r = await lire('2026-07');
  const k = lilleKpi(r);
  assert.equal(k.retrouves, 1);
  assert.equal(k.proposes, 1);
  assert.equal(k.aVerifier, 1);
  assert.equal(k.tauxPct, 33.3);
  const a = aristide(r);
  assert.equal(a.candidat, 'GUEVENOUX Aristide');
  assert.equal(a.candidatId, '41856', 'la fiche du candidat est ouvrable');
  assert.equal(a.retrouve, false, 'une proposition n\'est PAS une certitude');
});

// ── CONFIRMER ───────────────────────────────────────────────────────────────
test('ARISTIDE — confirmation : statut validé, KPI recalculé immédiatement', async () => {
  const rep = await decider({ client: 'Aristide Guevonoux', idClient: '41856',
    nomDeciplus: 'GUEVENOUX Aristide', statut: 'confirmed', score: 0.941, methode: 'fuzzy' });
  assert.equal(rep.status, 200);
  assert.equal((await rep.json()).ok, true);

  const r = await lire('2026-07');
  const a = aristide(r);
  assert.equal(a.retrouve, true);
  assert.equal(a.valideManuellement, true, '« Retrouvé — validé manuellement »');
  assert.equal(a.idClient, '41856', 'sa fiche Deciplus reste ouvrable');
  assert.equal(a.candidat, undefined, 'la proposition a fait son office');
  const k = lilleKpi(r);
  assert.equal(k.retrouves, 2, 'le KPI intègre la validation');
  assert.equal(k.valides, 1);
  assert.equal(k.proposes, 0);
  assert.equal(k.tauxPct, 66.7, '33,3 % -> 66,7 %');
});

test('après RECHARGEMENT (nouvelle requête) : toujours validé', async () => {
  const r = await lire('2026-07');
  assert.equal(aristide(r).valideManuellement, true);
  assert.equal(lilleKpi(r).tauxPct, 66.7);
});

test('après une NOUVELLE COLLECTE du mois : toujours reconnu', async () => {
  // Une recollecte redépose un JSON NEUF, qui ignore tout de la décision.
  const frais = rapport();
  assert.equal(aristide(frais).retrouve, false, 'le JSON déposé est bien vierge');
  assert.equal((await deposer('2026-07', frais)).status, 200);

  const r = await lire('2026-07');
  assert.equal(aristide(r).valideManuellement, true, 'la décision survit à la recollecte');
  assert.equal(lilleKpi(r).retrouves, 2);
  assert.equal(lilleKpi(r).tauxPct, 66.7);

  // Et le fichier sur disque, lui, n'a jamais été réécrit pour porter la décision.
  const brut = JSON.parse(fs.readFileSync(path.join(BAC, 'recap2', 'recap2-2026-07.json'), 'utf8'));
  assert.equal(brut.studios.Lille.clientsRetrouves.liste[1].retrouve, false,
    'le JSON historique reste le reflet brut de la collecte');
});

test('la collecte peut lire les décisions avec la clé de dépôt', async () => {
  const r = await fetch(BASE + '/api/recap2/matches', { headers: { 'X-Recap2-Key': CLE } });
  assert.equal(r.status, 200);
  const j = await r.json();
  const e = j.matches.find((m) => m.confirme && m.confirme.idClient === '41856');
  assert.ok(e, 'la confirmation est visible du Mac, AVANT le fuzzy');
});

// ── LA CONFIRMATION VAUT POUR TOUS LES MOIS ─────────────────────────────────
test('une personne confirmée est reconnue sur les AUTRES mois aussi', async () => {
  // Le but même de la persistance : ne pas reconfirmer quelqu'un chaque mois.
  assert.equal((await deposer('2026-08', rapport('2026-08'))).status, 200);
  const r = await lire('2026-08');
  assert.equal(aristide(r).valideManuellement, true, 'août en profite sans rien redemander');
  assert.equal(lilleKpi(r).tauxPct, 66.7);
});

// ── REFUSER ─────────────────────────────────────────────────────────────────
test('REFUS : la proposition disparaît et ne revient pas', async () => {
  // On annule d'abord la confirmation (se tromper doit être réparable), pour
  // retrouver l'état « proposé » et pouvoir le refuser.
  await fetch(BASE + '/api/recap2/matches', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jeton },
    body: JSON.stringify({ client: 'Aristide Guevonoux', idClient: '41856' }),
  });
  let r = await lire('2026-08');
  assert.equal(aristide(r).candidat, 'GUEVENOUX Aristide', 'proposée de nouveau');

  assert.equal((await decider({ client: 'Aristide Guevonoux', idClient: '99999',
    nomDeciplus: 'AUTRE Personne', statut: 'rejected' })).status, 200);
  r = await lire('2026-08');
  assert.equal(aristide(r).candidat, 'GUEVENOUX Aristide',
    'refuser un AUTRE candidat ne retire pas celui-ci');

  assert.equal((await decider({ client: 'Aristide Guevonoux', idClient: '41856',
    nomDeciplus: 'GUEVENOUX Aristide', statut: 'rejected' })).status, 200);
  r = await lire('2026-08');
  const a = aristide(r);
  assert.equal(a.candidat, undefined, 'la proposition refusée est retirée');
  assert.equal(a.refuse, true, 'et le refus est dit, pas silencieux');
  assert.equal(a.retrouve, false);
  assert.equal(lilleKpi(r).proposes, 0);
  assert.equal(lilleKpi(r).aVerifier, 2, 'il repasse à vérifier');
  assert.equal(lilleKpi(r).tauxPct, 33.3, 'le KPI ne bouge pas sur un refus');
});

test('le refus survit au rechargement ET à une nouvelle collecte', async () => {
  assert.equal((await deposer('2026-08', rapport('2026-08'))).status, 200);
  const r = await lire('2026-08');
  assert.equal(aristide(r).candidat, undefined, 'elle ne revient pas');
  assert.equal(aristide(r).refuse, true);
});

// ── LES GARDE-FOUS DE LA ROUTE ──────────────────────────────────────────────
test('la route n\'accepte ni un inconnu, ni n\'importe quoi', async () => {
  const sans = await fetch(BASE + '/api/recap2/matches', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client: 'X Y', idClient: '1', statut: 'confirmed' }),
  });
  assert.equal(sans.status, 401, 'sans session : refusé');

  const mauvais = [
    [{ client: '', idClient: '1', statut: 'confirmed' }, 'client vide'],
    [{ client: 'X Y', idClient: 'DROP TABLE', statut: 'confirmed' }, 'id non numérique'],
    [{ client: 'X Y', idClient: '1', statut: 'peut-etre' }, 'statut inventé'],
    [{ client: 'X Y', idClient: '1', statut: 'confirmed', score: 42 }, 'score hors bornes'],
    [{ client: 'X Y', idClient: '1', statut: 'confirmed', methode: 'magie' }, 'méthode inconnue'],
  ];
  for (const [corps, pourquoi] of mauvais) {
    assert.equal((await decider(corps)).status, 400, pourquoi);
  }
});

test('un refus peut lui aussi être annulé', async () => {
  const r = await fetch(BASE + '/api/recap2/matches', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jeton },
    body: JSON.stringify({ client: 'Aristide Guevonoux', idClient: '41856' }),
  });
  assert.equal(r.status, 200);
  const apres = await lire('2026-08');
  assert.equal(aristide(apres).refuse, undefined, 'le couple redevient proposable');
});
