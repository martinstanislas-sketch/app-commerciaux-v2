'use strict';
// ============================================================================
//  RECAP 2 — 2e KPI « CONTRATS VALIDÉS ».
//  Validée = retrouvée automatiquement OU rapprochement confirmé OU Prélèvement
//  coché. Une seule fois par vente. Réservation ne valide rien, les annulées
//  restent exclues. La validation manuelle complète l'automatisation, elle ne
//  la remplace jamais : on le prouve avec le VRAI stockage des cases et une
//  recollecte (JSON redéposé) où la vente est enfin retrouvée.
// ============================================================================

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const C = require('../lib/recap2Checks.js');
const M = require('../public/recap2-metrics.js');

const vente = (client, o) => Object.assign({ client, date: '05/08/2026', prestation: 'COACHING', commercial: 'Magali G.',
  annulee: false, dateAnnulation: '', retrouve: true, site: 'My Coach Wasquehal', idClient: '4200' + client.length }, o);
// Wasquehal : 8 signataires, 7 retrouvés, Esther « à vérifier ».
const wasquehal = (estherRetrouvee = false) => ({
  mois: '2026-08',
  studios: { Wasquehal: { clientsRetrouves: { signataires: 8, retrouves: estherRetrouvee ? 8 : 7, liste: [
    ...['Anne', 'Bruno', 'Chloé', 'David', 'Emma', 'Fanny', 'Gaël'].map((c) => vente(c)),
    vente('Esther Jhureea', estherRetrouvee ? { date: '24/08/2026' } : { date: '24/08/2026', retrouve: false, idClient: '' }),
  ] } } },
});
const lire = (db, rapport) => C.appliquer(rapport, C.controlesDuMois(db, '2026-08')).studios.Wasquehal.clientsRetrouves;
const cocher = (db, champ, valeur) => C.enregistrer(db, { mois: '2026-08', studio: 'Wasquehal', client: 'Esther Jhureea', date: '24/08/2026', champ, valeur, par: 'Stan' });
const esther = (cr) => cr.liste.find((l) => l.client === 'Esther Jhureea');

test('vente non retrouvée + Prélèvement décoché -> non validée (7/8 = 87,5 %)', () => {
  const db = new Database(':memory:'); C.creerTable(db);
  const cv = M.contratsValides(lire(db, wasquehal()).liste);
  assert.deepEqual([cv.valides, cv.actives, +(cv.taux * 100).toFixed(1)], [7, 8, 87.5]);
  assert.equal(M.motifValidation(esther(lire(db, wasquehal()))), '');
});

test('même vente + Prélèvement coché -> validée immédiatement (8/8 = 100 %)', () => {
  const db = new Database(':memory:'); C.creerTable(db);
  cocher(db, 'prelevement', true);
  const cr = lire(db, wasquehal());
  assert.deepEqual([M.contratsValides(cr.liste).valides, M.contratsValides(cr.liste).taux], [8, 1]);
  assert.equal(M.motifValidation(esther(cr)), 'prelevement');
  assert.equal(esther(cr).retrouve, false, 'la donnée de la collecte n\'est pas touchée');
  assert.equal(cr.retrouves, 7, 'le compteur automatique reste celui de la collecte');
});

test('décocher Prélèvement -> la vente ressort du KPI (toujours pas retrouvée)', () => {
  const db = new Database(':memory:'); C.creerTable(db);
  cocher(db, 'prelevement', true);
  cocher(db, 'prelevement', false);
  assert.equal(M.contratsValides(lire(db, wasquehal()).liste).valides, 7);
});

test('Réservation seule ne valide rien', () => {
  const db = new Database(':memory:'); C.creerTable(db);
  cocher(db, 'reservation', true);
  assert.equal(M.contratsValides(lire(db, wasquehal()).liste).valides, 7);
});

test('retrouvée automatiquement + Prélèvement coché -> comptée UNE seule fois', () => {
  const db = new Database(':memory:'); C.creerTable(db);
  cocher(db, 'prelevement', true);
  const cr = lire(db, wasquehal(true));
  assert.deepEqual([M.contratsValides(cr.liste).valides, M.contratsValides(cr.liste).actives], [8, 8]);
  assert.equal(M.motifValidation(esther(cr)), 'automatique');
});

test('RECOLLECTE : la recherche automatique continue ; retrouvée plus tard, elle reste validée, case conservée', () => {
  const db = new Database(':memory:'); C.creerTable(db);
  cocher(db, 'prelevement', true);
  assert.equal(M.motifValidation(esther(lire(db, wasquehal(false)))), 'prelevement', 'avant : validée par prélèvement');
  // La collecte suivante redépose un JSON où Esther est enfin retrouvée dans Deciplus.
  const apres = lire(db, wasquehal(true));
  assert.equal(esther(apres).retrouve, true, 'la recherche automatique a continué et l\'a retrouvée');
  assert.equal(M.motifValidation(esther(apres)), 'automatique', 'le motif affiché devient « retrouvée »');
  assert.equal(esther(apres).controle.prelevement, true, 'la case Prélèvement reste cochée');
  assert.equal(M.contratsValides(apres.liste).valides, 8, 'toujours comptée une seule fois');
});

test('annulée + Prélèvement coché -> reste exclue ; rapprochement confirmé -> motif « rapprochement »', () => {
  const liste = [vente('A', { annulee: true, retrouve: false, controle: { prelevement: true } }), vente('B', { valideManuellement: true })];
  assert.deepEqual(M.contratsValides(liste), { actives: 1, valides: 1, parPrelevement: 0, taux: 1 });
  assert.equal(M.motifValidation(liste[1]), 'rapprochement');
});

test('vue commerciale : même règle que la carte studio', () => {
  const db = new Database(':memory:'); C.creerTable(db);
  cocher(db, 'prelevement', true);
  const r = C.appliquer(wasquehal(), C.controlesDuMois(db, '2026-08'));
  r.businessVersion = 2;
  const d = M.consoliderCommercial(r, 'Magali G.');
  assert.deepEqual([d.valides, d.tauxValides, d.retrouves], [8, 1, 7], 'le taux validé suit la case, les retrouvés restent automatiques');
});

test('écran : carte « CONTRATS VALIDÉS », « x / y contrats validés », statut prélèvement', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'recap2.js'), 'utf8');
  assert.match(src, /estV2\(\) \? 'CONTRATS VALIDÉS'/);
  const carte = src.slice(src.indexOf('function carteCrm'), src.indexOf('// ── NOM CLIQUABLE'));
  assert.match(carte, /contratsValides\(d\.liste\)/);
  assert.match(carte, /' contrat' \+ \(n > 1 \? 's' : ''\) \+ ' validé'/);
  assert.match(carte, /pct\(cv\.taux\)/);
  assert.match(src, /Validée manuellement — prélèvement vérifié/);
  assert.doesNotMatch(carte, /signataire/);
});
