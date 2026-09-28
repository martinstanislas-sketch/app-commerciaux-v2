'use strict';
// ============================================================================
//  ANALYSES LANCÉES DEPUIS L'ÉCRAN — la file, sans serveur ni Mac.
//
//  Ce qui est verrouillé ici :
//   1. une seule analyse à la fois, tous mois confondus ;
//   2. l'agent prend la plus ancienne demande et la passe en cours ;
//   3. étapes, signe de vie et fin sont tracés ; la fin libère la file ;
//   4. une demande jamais prise ou une analyse muette passe en échec, avec la
//      raison — jamais « en cours » pour toujours ;
//   5. l'agent est dit actif ou hors ligne selon son dernier signe de vie.
// ============================================================================

const { test } = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const A = require('../lib/recap2Analyses.js');

const baseNeuve = () => { const d = new Database(':memory:'); A.creerTable(d); return d; };

test('une seule analyse à la fois, tous mois confondus', () => {
  const db = baseNeuve();
  assert.ok(A.demander(db, '2026-08', 'Stan').analyse);
  const r = A.demander(db, '2026-07', 'Stan');
  assert.strictEqual(r.status, 409);
  assert.strictEqual(A.demander(db, '2026-13', 'Stan').status, 400);
});

test("l'agent prend la demande, rend compte des étapes, puis termine", () => {
  const db = baseNeuve();
  const { analyse } = A.demander(db, '2026-08', 'Stan');
  assert.strictEqual(analyse.statut, 'demandee');
  assert.strictEqual(analyse.etapes.length, 3);
  const pris = A.prendre(db);
  assert.strictEqual(pris.id, analyse.id);
  assert.strictEqual(pris.statut, 'en_cours');
  assert.strictEqual(A.prendre(db), null, 'rien d\'autre à prendre');
  A.rendreCompte(db, pris.id, { etape: 'recap2', statut: 'en_cours' });
  A.rendreCompte(db, pris.id, { etape: 'recap2', statut: 'ok' });
  A.rendreCompte(db, pris.id, { vie: true });
  assert.strictEqual(A.rendreCompte(db, pris.id, { etape: 'inconnue', statut: 'ok' }).status, 400);
  const fin = A.rendreCompte(db, pris.id, { fin: true, ok: true, genere: '2026-09-28T10:00:00.000Z' }).analyse;
  assert.strictEqual(fin.statut, 'terminee');
  assert.strictEqual(fin.genere, '2026-09-28T10:00:00.000Z');
  assert.strictEqual(fin.etapes[0].statut, 'ok');
  assert.ok(fin.etapes[0].debut && fin.etapes[0].fin);
  const e = A.etat(db, '2026-08');
  assert.strictEqual(e.active, null, 'la file est libérée');
  assert.strictEqual(e.derniere.statut, 'terminee');
  assert.strictEqual(e.agentActif, true);
  assert.ok(A.demander(db, '2026-07', 'Stan').analyse, 'une nouvelle demande est possible');
});

test("un échec garde la raison et libère la file", () => {
  const db = baseNeuve();
  A.demander(db, '2026-08', 'Stan');
  const pris = A.prendre(db);
  A.rendreCompte(db, pris.id, { etape: 'recap2', statut: 'echec', message: 'Deciplus : la session semble expirée' });
  const fin = A.rendreCompte(db, pris.id, { fin: true, ok: false, erreur: 'Deciplus : la session semble expirée' }).analyse;
  assert.strictEqual(fin.statut, 'echec');
  assert.match(fin.erreur, /session/);
  assert.strictEqual(A.rendreCompte(db, pris.id, { vie: true }).status, 409, 'plus rien à dire sur une analyse finie');
});

test('une demande jamais prise passe en échec après le délai', () => {
  const db = baseNeuve();
  A.demander(db, '2026-08', 'Stan');
  const e = A.etat(db, '2026-08', Date.now() + 16 * 60 * 1000);
  assert.strictEqual(e.active, null);
  assert.strictEqual(e.derniere.statut, 'echec');
  assert.match(e.derniere.erreur, /Mac/);
  assert.strictEqual(e.agentActif, false, 'aucun signe de vie de l\'agent');
});

test('une analyse sans nouvelles passe en échec après le délai', () => {
  const db = baseNeuve();
  A.demander(db, '2026-08', 'Stan');
  A.prendre(db);
  assert.strictEqual(A.etat(db, '2026-08', Date.now() + 10 * 60 * 1000).derniere.statut, 'en_cours');
  const e = A.etat(db, '2026-08', Date.now() + 21 * 60 * 1000);
  assert.strictEqual(e.derniere.statut, 'echec');
  assert.match(e.derniere.erreur, /nouvelle/);
});
