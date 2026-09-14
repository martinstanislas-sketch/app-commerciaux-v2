'use strict';
// ============================================================================
//  CASES DE CONTRÔLE MANUEL — le module, sans serveur.
//
//  Ce qui est verrouillé ici :
//   1. la clé d'une vente résiste aux retouches de graphie, pas aux changements
//      de personne ou de date ;
//   2. les deux cases sont indépendantes : écrire l'une n'efface jamais l'autre ;
//   3. les contrôles sont cloisonnés par mois ET par studio ;
//   4. appliquer() ajoute une information et ne touche AUCUN compteur.
// ============================================================================

const { test } = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const C = require('../lib/recap2Checks.js');

const baseNeuve = () => { const d = new Database(':memory:'); C.creerTable(d); return d; };
const vente = (o) => Object.assign({ client: 'Camille Gremez', date: '05/08/2026', prestation: 'X', commercial: 'Fabian F.',
  annulee: false, dateAnnulation: '', retrouve: true, site: 'My Coach Marcq', dateVente: '25/08/2026', idClient: '41', encaisse: true }, o);
const rapport = () => ({
  businessVersion: 2, mois: '2026-08', m1: '2026-07',
  studios: {
    Marcq: { studio: 'Marcq', clientsRetrouves: { ventesSignees: 3, annulees: 1, ventesActives: 2, signataires: 2, retrouves: 1, taux: 0.5, tauxPct: 50,
      liste: [vente({}), vente({ client: 'Ritha Konzo', date: '06/08/2026', retrouve: false, idClient: '', site: '' }),
        vente({ client: 'Dei Muteba', date: '10/08/2026', annulee: true, retrouve: false })] } },
    Lille: { studio: 'Lille', clientsRetrouves: { ventesSignees: 1, annulees: 0, ventesActives: 1, signataires: 1, retrouves: 1, taux: 1, tauxPct: 100,
      liste: [vente({})] } },
  },
});
const ecrire = (db, o) => C.enregistrer(db, Object.assign({ mois: '2026-08', studio: 'Marcq', client: 'Camille Gremez', date: '05/08/2026', par: 'Stan' }, o));

test('clé de vente : graphie retouchée = même vente ; autre personne ou autre date = autre vente', () => {
  const k = C.cleVente({ client: 'Camille Gremez', date: '05/08/2026' });
  assert.ok(k);
  assert.equal(C.cleVente({ client: 'GREMEZ  Camille', date: '05/08/2026' }), k, 'ordre et casse');
  assert.equal(C.cleVente({ client: 'Camille Grémez', date: '05/08/2026' }), k, 'accent');
  assert.notEqual(C.cleVente({ client: 'Camille Gremez', date: '06/08/2026' }), k, 'deux ventes du même client');
  assert.notEqual(C.cleVente({ client: 'Camille Gremet', date: '05/08/2026' }), k);
  assert.equal(C.cleVente({ client: '', date: '05/08/2026' }), '', 'sans identité : non identifiable');
  assert.equal(C.cleVente({ client: 'Camille Gremez', date: '' }), '', 'sans date : non identifiable');
});

test('les deux cases sont INDÉPENDANTES : écrire l\'une ne touche jamais l\'autre', () => {
  const db = baseNeuve();
  let c = ecrire(db, { champ: 'prelevement', valeur: true });
  assert.deepEqual([c.prelevement, c.reservation], [true, false]);
  c = ecrire(db, { champ: 'reservation', valeur: true });
  assert.deepEqual([c.prelevement, c.reservation], [true, true], 'réservation cochée, prélèvement conservé');
  c = ecrire(db, { champ: 'prelevement', valeur: false });
  assert.deepEqual([c.prelevement, c.reservation], [false, true], 'décocher le prélèvement laisse la réservation');
  assert.equal(c.modifiePar, 'Stan');
  assert.ok(c.modifieLe);
});

test('cloisonné par mois et par studio', () => {
  const db = baseNeuve();
  ecrire(db, { champ: 'prelevement', valeur: true });
  assert.equal(C.controlesDuMois(db, '2026-07').size, 0, 'un autre mois ne voit rien');
  const r = C.appliquer(rapport(), C.controlesDuMois(db, '2026-08'));
  assert.equal(r.studios.Marcq.clientsRetrouves.liste[0].controle.prelevement, true);
  assert.equal(r.studios.Lille.clientsRetrouves.liste[0].controle.prelevement, false,
    'même client, même date, AUTRE studio : case distincte');
});

test('appliquer() : pose `controle` partout, ne touche AUCUN compteur ni le rapport source', () => {
  const db = baseNeuve();
  ecrire(db, { champ: 'prelevement', valeur: true });
  ecrire(db, { client: 'Ritha Konzo', date: '06/08/2026', champ: 'reservation', valeur: true });
  const source = rapport();
  const avant = JSON.stringify(source);
  const r = C.appliquer(source, C.controlesDuMois(db, '2026-08'));
  assert.equal(JSON.stringify(source), avant, 'le rapport source n\'est pas modifié');
  ['ventesSignees', 'annulees', 'ventesActives', 'signataires', 'retrouves', 'taux', 'tauxPct'].forEach((k) => {
    assert.equal(r.studios.Marcq.clientsRetrouves[k], source.studios.Marcq.clientsRetrouves[k], k + ' inchangé');
  });
  const [a, b, annulee] = r.studios.Marcq.clientsRetrouves.liste;
  assert.deepEqual([a.controle.prelevement, a.controle.reservation], [true, false]);
  assert.deepEqual([b.controle.prelevement, b.controle.reservation], [false, true], 'un « à vérifier » se contrôle aussi');
  assert.deepEqual([annulee.controle.prelevement, annulee.controle.reservation], [false, false], 'jamais coché : deux cases vides');
  assert.equal(a.retrouve, true);
  assert.equal(b.retrouve, false, 'une case ne change jamais un statut');
});

test('une graphie retouchée par la recollecte retrouve ses cases', () => {
  const db = baseNeuve();
  ecrire(db, { champ: 'reservation', valeur: true });
  const recollecte = rapport();
  recollecte.studios.Marcq.clientsRetrouves.liste[0].client = 'GREMEZ Camille';
  const r = C.appliquer(recollecte, C.controlesDuMois(db, '2026-08'));
  assert.equal(r.studios.Marcq.clientsRetrouves.liste[0].controle.reservation, true);
});

test('venteExiste : refuse une vente absente, un autre studio, une vente non identifiable', () => {
  const r = rapport();
  assert.equal(C.venteExiste(r, { studio: 'Marcq', client: 'Camille Gremez', date: '05/08/2026' }), true);
  assert.equal(C.venteExiste(r, { studio: 'Marcq', client: 'Inconnu Total', date: '05/08/2026' }), false);
  assert.equal(C.venteExiste(r, { studio: 'Neuilly', client: 'Camille Gremez', date: '05/08/2026' }), false);
  assert.equal(C.venteExiste(r, { studio: 'Marcq', client: 'Camille Gremez', date: '' }), false);
});

test('entrées refusées : mois, studio, champ, valeur non booléenne, vente non identifiable', () => {
  const db = baseNeuve();
  assert.throws(() => ecrire(db, { mois: '2026-13', champ: 'prelevement', valeur: true }), /mois/);
  assert.throws(() => ecrire(db, { studio: '', champ: 'prelevement', valeur: true }), /studio/);
  assert.throws(() => ecrire(db, { champ: 'prelevement; DROP TABLE x', valeur: true }), /contrôle inconnu/);
  assert.throws(() => ecrire(db, { champ: 'prelevement', valeur: 'true' }), /vrai ou faux/);
  assert.throws(() => ecrire(db, { date: '5 août', champ: 'prelevement', valeur: true }), /non identifiable/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM recap2_manual_checks').get().n, 0, 'rien n\'a été écrit');
});

test('creerTable est idempotente', () => {
  const db = baseNeuve();
  ecrire(db, { champ: 'prelevement', valeur: true });
  C.creerTable(db);
  assert.equal(C.controlesDuMois(db, '2026-08').size, 1, 'les données existantes survivent');
});
