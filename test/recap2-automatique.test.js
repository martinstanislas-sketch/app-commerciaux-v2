'use strict';
// Contrôle automatique : stockage en base, application à la lecture, priorité
// des corrections manuelles, et AUCUN effet sur les KPI ni sur les cases manuelles.
const { test } = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const Auto = require('../lib/recap2Automatique.js');
const Checks = require('../lib/recap2Checks.js');
const OP = require('../lib/recap2Operationnel.js');

const rapport = () => ({ mois: '2026-08', studios: { Lille: { clientsRetrouves: {
  ventesSignees: 2, annulees: 0, signataires: 2, retrouves: 2, taux: 1, tauxPct: 100,
  liste: [
    { client: 'Alpha Un', date: '05/08/2026', retrouve: true, annulee: false, idClient: '1' },
    { client: 'Beta Deux', date: '06/08/2026', retrouve: true, annulee: false, idClient: '2' },
  ] } } } });
const res = (o) => Object.assign({ studio: 'Lille', client: 'Alpha Un', date: '05/08/2026', idDeciplus: '1',
  prelevement: 'ok', reservation: 'ko', resilie: 'ko', alertes: [OP.ALERTES.REJET], regles: ['R9'], contrat: { numero: 'C1' }, raison: '', attribution: null }, o);
const depot = (resultats) => ({ controleLe: '2026-09-17T15:10', resultats });
const base = () => { const db = new Database(':memory:'); Auto.creerTable(db); Checks.creerTable(db); return db; };

test('dépôt validé : forme stricte, vente existante, alertes connues uniquement', () => {
  const r = rapport();
  assert.deepEqual(Auto.valider(depot([res()]), r, Checks.venteExiste), []);
  const pb = Auto.valider(depot([res({ prelevement: 'oui' }), res({ alertes: ['alerte inventée'] }), res({ client: 'Inconnu' })]), r, Checks.venteExiste).join(' | ');
  assert.match(pb, /prelevement : ok \/ ko \/ a_verifier/);
  assert.match(pb, /alertes métier connues/);
  assert.match(pb, /vente absente du rapport/);
  assert.match(Auto.valider({ resultats: [] }, r, Checks.venteExiste).join(), /controleLe/);
});

test('stockage : un dépôt remplace le précédent pour la même vente, avec la date du contrôle', () => {
  const db = base();
  Auto.enregistrer(db, '2026-08', depot([res()]));
  Auto.enregistrer(db, '2026-08', { controleLe: '2026-09-18T09:00', resultats: [res({ reservation: 'ok', controleLe: '2026-09-18T09:00' })] });
  const idx = Auto.resultatsDuMois(db, '2026-08');
  assert.equal(idx.size, 1);
  const a = [...idx.values()][0];
  assert.deepEqual([a.reservation, a.controleLe, a.alertes[0]], ['ok', '2026-09-18T09:00', OP.ALERTES.REJET]);
});

test('lecture : champs séparés, aucun KPI ni case manuelle modifiés', () => {
  const db = base();
  Auto.enregistrer(db, '2026-08', depot([res()]));
  const brut = Checks.appliquer(rapport(), Checks.controlesDuMois(db, '2026-08'));
  const lu = Auto.appliquer(brut, Auto.resultatsDuMois(db, '2026-08'));
  const cr = lu.studios.Lille.clientsRetrouves, avant = brut.studios.Lille.clientsRetrouves;
  ['ventesSignees', 'annulees', 'signataires', 'retrouves', 'taux', 'tauxPct'].forEach((k) => assert.equal(cr[k], avant[k]));
  assert.deepEqual(cr.liste[0].controle, avant.liste[0].controle, 'case manuelle intacte');
  assert.deepEqual(cr.liste[0].resiliation, avant.liste[0].resiliation);
  assert.equal(cr.liste[0].retrouve, true);
  assert.deepEqual([cr.liste[0].operationnel.prelevement, cr.liste[0].operationnel.controleLe], ['ok', '2026-09-17T15:10']);
  assert.equal(cr.liste[1].automatique, undefined, 'vente sans contrôle : rien d\'inventé');
});

test('priorité au manuel : case cochée et résiliation posée l\'emportent, et c\'est dit', () => {
  const db = base();
  Auto.enregistrer(db, '2026-08', depot([res({ reservation: 'ko', resilie: 'ko' })]));
  let r = Checks.appliquer(rapport(), Checks.controlesDuMois(db, '2026-08'));
  r.studios.Lille.clientsRetrouves.liste[0].controle.reservation = true;           // cochée à la main
  r.studios.Lille.clientsRetrouves.liste[0].resiliation = { resilie: true, date: '10/09/2026' };
  const o = Auto.appliquer(r, Auto.resultatsDuMois(db, '2026-08')).studios.Lille.clientsRetrouves.liste[0].operationnel;
  assert.deepEqual([o.prelevement, o.reservation, o.resilie], ['ok', 'ok', 'ok']);
  assert.deepEqual(o.sources, { prelevement: 'auto', reservation: 'manuel', resilie: 'manuel' });
});

// ── FORÇAGE MANUEL À 3 ÉTATS ────────────────────────────────────────────────
const lire = (db, preparer = (r) => r) => {
  const r = preparer(Checks.appliquer(rapport(), Checks.controlesDuMois(db, '2026-08')));
  return Auto.appliquer(r, Auto.resultatsDuMois(db, '2026-08'), Auto.forcagesDuMois(db, '2026-08')).studios.Lille.clientsRetrouves;
};
const forcer = (db, champ, valeur, client = 'Alpha Un', date = '05/08/2026') =>
  Auto.forcer(db, { mois: '2026-08', studio: 'Lille', client, date, champ, valeur, par: 'Stan' }, '2026-09-17T10:00:00.000Z');

test('forçage : automatique ✅ -> manuel ❌', () => {
  const db = base();
  Auto.enregistrer(db, '2026-08', depot([res({ prelevement: 'ok' })]));
  forcer(db, 'prelevement', 'ko');
  const o = lire(db).liste[0].operationnel;
  assert.deepEqual([o.prelevement, o.sources.prelevement, o.forcages.prelevement.valeur], ['ko', 'force', 'ko']);
  assert.equal(lire(db).liste[0].automatique.prelevement, 'ok', 'la valeur automatique reste connue');
});

test('forçage : automatique ❌ -> manuel ✅, puis retour à Automatique', () => {
  const db = base();
  Auto.enregistrer(db, '2026-08', depot([res({ reservation: 'ko' })]));
  forcer(db, 'reservation', 'ok');
  assert.deepEqual([lire(db).liste[0].operationnel.reservation, lire(db).liste[0].operationnel.sources.reservation], ['ok', 'force']);
  forcer(db, 'reservation', 'auto');
  const o = lire(db).liste[0].operationnel;
  assert.deepEqual([o.reservation, o.sources.reservation, o.forcages.reservation], ['ko', 'auto', undefined]);
});

test('forçage persistant : survit à un nouveau contrôle automatique et à une relecture', () => {
  const db = base();
  Auto.enregistrer(db, '2026-08', depot([res({ resilie: 'ko' })]));
  forcer(db, 'resilie', 'ok');
  Auto.enregistrer(db, '2026-08', { controleLe: '2026-09-20T08:00', resultats: [res({ resilie: 'ko', controleLe: '2026-09-20T08:00' })] });
  const o = lire(db).liste[0].operationnel; // relecture complète depuis la base
  assert.deepEqual([o.resilie, o.sources.resilie, o.controleLe], ['ok', 'force', '2026-09-20T08:00']);
});

test('forçage ❌ l\'emporte même sur une case historique cochée, sans toucher la case ni les KPI', () => {
  const db = base();
  Auto.enregistrer(db, '2026-08', depot([res({ prelevement: 'ok' })]));
  forcer(db, 'prelevement', 'ko');
  const cr = lire(db, (r) => { r.studios.Lille.clientsRetrouves.liste[0].controle.prelevement = true; return r; });
  assert.equal(cr.liste[0].operationnel.prelevement, 'ko');
  assert.equal(cr.liste[0].controle.prelevement, true, 'la case historique (compteur « Validés par prélèvement ») est intacte');
  assert.deepEqual([cr.retrouves, cr.signataires, cr.tauxPct], [2, 2, 100]);
});

test('forçage refusé : champ, valeur ou vente invalides', () => {
  const db = base();
  assert.throws(() => forcer(db, 'paiement', 'ok'), /champ/);
  assert.throws(() => forcer(db, 'prelevement', 'oui'), /valeur/);
  assert.throws(() => Auto.forcer(db, { mois: '2026-08', studio: 'Lille', client: '', date: '', champ: 'prelevement', valeur: 'ok' }), /non identifiable/);
});
