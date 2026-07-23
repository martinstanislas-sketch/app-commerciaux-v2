'use strict';
// Le parsing des lignes (transformation) est pur et testable ; les adaptateurs
// XLSX/JSZip sont navigateur seulement. On teste ici la couche pure avec des
// lignes synthétiques imitant les exports Deciplus.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const RP = require('../public/retention-parse.js');

test('parseMontant : formats FR/EN, euros, négatifs', () => {
  assert.equal(RP.parseMontant('69'), 69);
  assert.equal(RP.parseMontant('69,00'), 69);
  assert.equal(RP.parseMontant('69,00 €'), 69);
  assert.equal(RP.parseMontant('1 234,56'), 1234.56);
  assert.equal(RP.parseMontant('-69'), -69);
  assert.equal(RP.parseMontant(''), 0);
  assert.equal(RP.parseMontant(69), 69);
});

test('trouverColonne : tolérant aux accents/casse/espaces + partiel', () => {
  const e = ['Date', 'Description', 'Prix TTC total', 'Nom', 'Prénom', 'Vendeur'];
  assert.equal(RP.trouverColonne(e, ['Prénom']), 'Prénom');
  assert.equal(RP.trouverColonne(e, ['prenom']), 'Prénom', 'sans accent');
  assert.equal(RP.trouverColonne(e, ['Montant', 'Prix TTC total']), 'Prix TTC total');
  assert.equal(RP.trouverColonne(e, ['Inexistant']), null);
});

test('mapEncaissements : échéance = positif, décaissement = négatif + marqueur', () => {
  const rows = [
    { Date: '2026-06-01', Description: 'Encaissement échéance', 'Prix TTC total': '69', Nom: 'Dupont', Prenom: 'Jean', Vendeur: 'X' },
    { Date: '2026-06-08', Description: 'Décaissement (rejet)', 'Prix TTC total': '69', Nom: 'Dupont', Prenom: 'Jean', Vendeur: 'X' },
  ];
  const out = RP.mapEncaissements(rows);
  assert.equal(out[0].montant, 69);
  assert.equal(out[0].decaissement, false);
  assert.equal(out[1].montant, -69, 'le décaissement est forcé négatif');
  assert.equal(out[1].decaissement, true);
  assert.equal(out[0].cle, 'DUPONT|JEAN');
});

test('mapEncaissements : colonnes manquantes -> erreur claire', () => {
  assert.throws(() => RP.mapEncaissements([{ Nom: 'A', Prenom: 'B' }]), /Colonnes manquantes/);
});

test('mapMembres : ne garde QUE Id_client/Nom/Prénom (RGPD), jette le reste', () => {
  const rows = [
    { Id_client: '12345', Nom: 'Dupont', 'Prénom': 'Jean', IBAN: 'FR76...', Email: 'x@y.fr', Telephone: '06...' },
  ];
  const map = RP.mapMembres(rows);
  assert.deepEqual(map, { 'DUPONT|JEAN': '12345' });
  assert.deepEqual(Object.values(map), ['12345'], 'aucune donnée sensible ne ressort');
});

test('mapContrats : par studio, dédup, nom/prénom lisibles', () => {
  const p = RP.mapContrats([
    '2606051-caroline-picquet-contrat-My-coach-lille.pdf',
    '2606051-caroline-picquet-contrat-My-coach-lille.pdf',
    '2606021-saphia-meddah-contrat-My-coach-wasquehal.pdf',
  ]);
  assert.equal(p.Lille.length, 1, 'doublon écarté');
  assert.equal(p.Lille[0].prenom, 'caroline');
  assert.equal(p.Lille[0].nom, 'picquet');
  assert.ok(p.Wasquehal);
});

test('estHTML : détecte un .xls qui est en réalité du HTML', () => {
  const enc = (s) => new TextEncoder().encode(s);
  assert.equal(RP.estHTML(enc('<html><table>')), true);
  assert.equal(RP.estHTML(enc('  <table border=1>')), true);
  assert.equal(RP.estHTML(enc('PKxxxx')), false, 'un vrai xlsx commence par PK');
});
