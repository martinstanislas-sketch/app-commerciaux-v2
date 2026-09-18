'use strict';
// ============================================================================
//  SUIVI DES NON-RECONDUITS — le module, sans serveur.
//
//  Ce qui est verrouillé ici :
//   1. un seul statut par client : écrire remplace, '' retire ;
//   2. cloisonnement par mois ET par studio ;
//   3. rattachement par Id membre d'abord, identité ensuite — jamais sur un
//      homonyme porteur d'un autre Id ;
//   4. appliquer() ajoute `suivi` et ne touche AUCUN compteur ni aucun champ.
// ============================================================================

const { test } = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const N = require('../lib/recap2NrStatuts.js');

const baseNeuve = () => { const d = new Database(':memory:'); N.creerTable(d); return d; };
const nr = (liste) => ({ base: 10, nonReconduits: liste.length, taux: liste.length / 10, tauxPct: liste.length * 10, liste });
const rapport = (avecIds = true) => ({
  businessVersion: 2, mois: '2026-08', m1: '2026-07',
  studios: {
    Lille: { studio: 'Lille', nonReconduction: nr([
      Object.assign({ client: 'MARTINEAU Paulin', netM1: 45, netM: 0 }, avecIds ? { idClient: '1001' } : {}),
      Object.assign({ client: 'BERNARDIN Lucie', netM1: 69, netM: 0 }, avecIds ? { idClient: '1002' } : {}),
    ]) },
    Marcq: { studio: 'Marcq', nonReconduction: nr([
      Object.assign({ client: 'MARTINEAU Paulin', netM1: 30, netM: 0 }, avecIds ? { idClient: '2001' } : {}),
    ]) },
  },
});
const lire = (db, r, s, i) => N.appliquer(r, N.statutsDuMois(db, r.mois)).studios[s].nonReconduction.liste[i].suivi;
const poser = (db, o) => N.enregistrer(db, Object.assign({ mois: '2026-08', studio: 'Lille', client: 'MARTINEAU Paulin', idClient: '1001', par: 'Stan' }, o));

test('un seul statut : cocher remplace, vide retire', () => {
  const db = baseNeuve();
  assert.equal(poser(db, { statut: 'sous_controle' }).statut, 'sous_controle');
  assert.equal(poser(db, { statut: 'resilie' }).statut, 'resilie');
  assert.equal(lire(db, rapport(), 'Lille', 0).statut, 'resilie');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM recap2_nr_statuts').get().n, 1, 'une seule ligne par client');
  const retrait = poser(db, { statut: '' });
  assert.equal(retrait.statut, '');
  assert.ok(retrait.modifieLe && retrait.modifiePar === 'Stan', 'qui a retiré, et quand');
  assert.equal(lire(db, rapport(), 'Lille', 0).statut, '');
});

test('statut inconnu, mois ou client invalides : refusés', () => {
  const db = baseNeuve();
  assert.throws(() => poser(db, { statut: 'annule' }));
  assert.throws(() => poser(db, { statut: 'resilie', mois: '2026-13' }));
  assert.throws(() => poser(db, { statut: 'resilie', client: '  ' }));
});

test('cloisonné par studio et par mois (même nom à Lille et à Marcq)', () => {
  const db = baseNeuve();
  poser(db, { statut: 'a_creuser' });
  const r = rapport();
  assert.equal(lire(db, r, 'Lille', 0).statut, 'a_creuser');
  assert.equal(lire(db, r, 'Marcq', 0).statut, '', 'autre studio');
  assert.equal(lire(db, r, 'Lille', 1).statut, '', 'autre client');
  assert.equal(lire(db, Object.assign(rapport(), { mois: '2026-09' }), 'Lille', 0).statut, '', 'autre mois');
});

test('rattachement : posé sans Id, retrouvé une fois les Id présents — et inversement', () => {
  const db = baseNeuve();
  poser(db, { idClient: '', client: 'Martineau  Paulin', statut: 'sous_controle', maintenant: new Date('2026-09-10T10:00:00Z') });
  assert.equal(lire(db, rapport(false), 'Lille', 0).statut, 'sous_controle', 'rapport sans id, graphie retouchée');
  assert.equal(lire(db, rapport(true), 'Lille', 0).statut, 'sous_controle', 'rapport avec id');
  poser(db, { statut: 'resilie', maintenant: new Date('2026-09-11T10:00:00Z') }); // cette fois avec l'id : la plus récente l'emporte partout
  assert.equal(lire(db, rapport(true), 'Lille', 0).statut, 'resilie');
  assert.equal(lire(db, rapport(false), 'Lille', 0).statut, 'resilie');
});

test('homonyme : une marque posée sur un autre Id membre ne s\'applique pas', () => {
  const db = baseNeuve();
  poser(db, { statut: 'resilie', idClient: '9999' });
  assert.equal(lire(db, rapport(true), 'Lille', 0).statut, '');
});

test('appliquer() : ne touche à rien d\'autre que `suivi`, et ne modifie pas l\'original', () => {
  const db = baseNeuve();
  poser(db, { statut: 'resilie' });
  const r = rapport();
  const avant = JSON.stringify(r);
  const out = N.appliquer(r, N.statutsDuMois(db, r.mois));
  assert.equal(JSON.stringify(r), avant, 'original intact');
  Object.keys(out.studios).forEach((s) => {
    const a = r.studios[s].nonReconduction, b = out.studios[s].nonReconduction;
    assert.deepEqual([b.base, b.nonReconduits, b.taux, b.tauxPct, b.liste.length], [a.base, a.nonReconduits, a.taux, a.tauxPct, a.liste.length]);
    b.liste.forEach((l, i) => { const x = Object.assign({}, l); delete x.suivi; assert.deepEqual(x, a.liste[i]); });
  });
});

test('ligneDe : par Id, sinon par identité unique ; rien d\'inventé', () => {
  const r = rapport();
  assert.equal(N.ligneDe(r, { studio: 'Lille', client: 'n\'importe', idClient: '1002' }).client, 'BERNARDIN Lucie');
  assert.equal(N.ligneDe(rapport(false), { studio: 'Lille', client: 'paulin martineau' }).client, 'MARTINEAU Paulin');
  assert.equal(N.ligneDe(r, { studio: 'Lille', client: 'Personne Inventée' }), null);
  assert.equal(N.ligneDe(r, { studio: 'Lille', client: 'MARTINEAU Paulin', idClient: '2001' }), null, 'id d\'un autre studio / autre personne');
  const doublon = rapport(false);
  doublon.studios.Lille.nonReconduction.liste.push({ client: 'Paulin MARTINEAU', netM1: 10, netM: 0 });
  assert.equal(N.ligneDe(doublon, { studio: 'Lille', client: 'MARTINEAU Paulin' }), null, 'deux homonymes sans id : refus');
});
