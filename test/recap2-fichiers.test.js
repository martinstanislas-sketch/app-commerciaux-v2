'use strict';
// ============================================================================
//  TRAÇABILITÉ DES FICHIERS ANALYSÉS — le module, sans serveur.
//
//  Ce qui est verrouillé ici :
//   1. la liste courante se DÉDUIT de `rapport.source` : Deciplus (encaissements,
//      ventes, paiements) et Fitness Booster (lecture écran), avec statut ;
//   2. un rapport d'avant la traçabilité donne des champs null, rien d'inventé ;
//   3. un dépôt qui en remplace un autre fige la liste de l'ancien : ses fichiers
//      ressortent « remplace », sans doublon avec le dépôt en vigueur ;
//   4. renvoyer la même analyse (même `genere`) ne crée aucun « remplacé ».
// ============================================================================

const { test } = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const F = require('../lib/recap2Fichiers.js');

const baseNeuve = () => { const d = new Database(':memory:'); F.creerTable(d); return d; };

const rapport = (genere, exporte) => ({
  mois: '2026-08', m1: '2026-07', genere,
  source: {
    'deciplus_2026-07': { fichier: 'encaissements-2026-07.csv', exporteLe: exporte, conforme: true, problemes: [] },
    'deciplus_2026-08': {
      fichier: 'encaissements-2026-08.csv', exporteLe: exporte, conforme: true, problemes: [],
      controleParStudio: { Lille: { ok: true }, Neuilly: { ok: false } },
    },
    'deciplus_ventes_2026-08': { fichier: 'ventes-2026-08.csv', exporteLe: exporte, conforme: false, problemes: ['période inattendue'] },
    paiements: {
      moisLus: ['2026-08', '2026-09'],
      fichiers: [
        { mois: '2026-09', fichier: 'encaissements-2026-09.csv', exporteLe: exporte, pris: true, motif: '' },
        { mois: '2026-10', fichier: 'encaissements-2026-10.csv', exporteLe: exporte, pris: false, motif: 'illisible : x' },
      ],
    },
    fitnessBooster: { Lille: { echec: null, luLe: exporte }, Marcq: { echec: 'panneau introuvable', luLe: exporte } },
    vni: { avertissements: [], transformations: 0 },
  },
  studios: {},
});

test('la liste courante se déduit du rapport, avec le bon statut', () => {
  const l = F.lister(rapport('2026-09-02T08:00:00.000Z', '2026-09-02T07:50:00.000Z'));
  const par = (nom) => l.find((f) => f.nom === nom);
  assert.strictEqual(l.length, 7);
  assert.strictEqual(par('encaissements-2026-07.csv').statut, 'pris');
  assert.strictEqual(par('encaissements-2026-07.csv').importeLe, '2026-09-02T07:50:00.000Z');
  assert.strictEqual(par('encaissements-2026-07.csv').analyseLe, '2026-09-02T08:00:00.000Z');
  assert.match(par('encaissements-2026-08.csv').motif, /Neuilly/);
  assert.strictEqual(par('ventes-2026-08.csv').statut, 'non_pris');
  assert.strictEqual(par('ventes-2026-08.csv').nature, 'Journal des ventes');
  assert.strictEqual(par('encaissements-2026-10.csv').statut, 'non_pris');
  assert.strictEqual(par('Lecture écran — Contrats Lille').source, 'Fitness Booster');
  assert.strictEqual(par('Lecture écran — Contrats Marcq').statut, 'non_pris');
});

test("un rapport d'avant la traçabilité : champs null, rien d'inventé", () => {
  const ancien = {
    mois: '2026-08', genere: '2026-09-01T08:00:00.000Z',
    source: {
      'deciplus_2026-07': { fichier: 'encaissements-2026-07.csv', conforme: true },
      paiements: { moisLus: ['2026-08', '2026-09'] },
      fitnessBooster: { Lille: { echec: null } },
    },
  };
  const l = F.lister(ancien);
  assert.strictEqual(l.length, 3);
  assert.ok(l.every((f) => f.importeLe === null));
  const pai = l.find((f) => f.mois === '2026-09');
  assert.strictEqual(pai.nom, null);
});

test('un nouveau dépôt fige les fichiers du précédent en « remplacé »', () => {
  const db = baseNeuve();
  const v1 = rapport('2026-09-01T08:00:00.000Z', '2026-09-01T07:50:00.000Z');
  const v2 = rapport('2026-09-02T08:00:00.000Z', '2026-09-02T07:50:00.000Z');
  F.enregistrerDepot(db, '2026-08', v1, '2026-09-01T08:05:00.000Z', null);
  F.enregistrerDepot(db, '2026-08', v2, '2026-09-02T08:05:00.000Z', v1);
  const r = F.fichiersAnalyses(db, '2026-08', v2);
  assert.strictEqual(r.analyseLe, v2.genere);
  const remplaces = r.fichiers.filter((f) => f.statut === 'remplace');
  assert.strictEqual(remplaces.length, 7);
  assert.ok(remplaces.every((f) => f.analyseLe === v1.genere));
  assert.strictEqual(r.fichiers.filter((f) => f.statut !== 'remplace').length, 7);
});

test("le premier dépôt suivi garde trace du rapport d'avant le registre", () => {
  const db = baseNeuve();
  const v1 = rapport('2026-09-01T08:00:00.000Z', '2026-09-01T07:50:00.000Z');
  const v2 = rapport('2026-09-02T08:00:00.000Z', '2026-09-02T07:50:00.000Z');
  F.enregistrerDepot(db, '2026-08', v2, '2026-09-02T08:05:00.000Z', v1); // registre vide
  const r = F.fichiersAnalyses(db, '2026-08', v2);
  assert.strictEqual(r.fichiers.filter((f) => f.statut === 'remplace').length, 7);
});

test('la même analyse renvoyée ne remplace rien', () => {
  const db = baseNeuve();
  const v1 = rapport('2026-09-01T08:00:00.000Z', '2026-09-01T07:50:00.000Z');
  F.enregistrerDepot(db, '2026-08', v1, '2026-09-01T08:05:00.000Z', null);
  F.enregistrerDepot(db, '2026-08', v1, '2026-09-01T09:00:00.000Z', v1);
  const r = F.fichiersAnalyses(db, '2026-08', v1);
  assert.strictEqual(r.fichiers.filter((f) => f.statut === 'remplace').length, 0);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM recap2_depots').get().n, 1);
});

test('un fichier identique dans les deux dépôts ne sort pas en double', () => {
  const db = baseNeuve();
  const memeExport = '2026-09-01T07:50:00.000Z';
  const v1 = rapport('2026-09-01T08:00:00.000Z', memeExport);
  const v2 = rapport('2026-09-02T08:00:00.000Z', memeExport); // --sans-deciplus : mêmes CSV
  F.enregistrerDepot(db, '2026-08', v2, '2026-09-02T08:05:00.000Z', v1);
  const r = F.fichiersAnalyses(db, '2026-08', v2);
  assert.strictEqual(r.fichiers.filter((f) => f.statut === 'remplace').length, 0);
});
