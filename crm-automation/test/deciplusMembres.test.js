'use strict';
// ============================================================================
//  FICHE DECIPLUS D'UN « À VÉRIFIER » — jamais la fiche de quelqu'un d'autre.
//
//  Le cas réel : Esther JHUREEA (Wasquehal), aucune vente saisie, fiche 42350.
//  Une fiche n'est retenue que sur une identité EXACTE et SANS AMBIGUÏTÉ.
// ============================================================================

const { test } = require('node:test');
const assert = require('node:assert');
const Mb = require('../lib/deciplusMembres.js');
const M = require('../../public/recap2-metrics.js');

const j = (idj, nom, prenom, zone) => ({ idj, nom, prenom, nom_zone: zone, date_naissance: '1990-01-01' });

test('ESTHER JHUREEA : fiche exacte et unique -> retenue, avec le seul id / nom / club', () => {
  const f = Mb.choisirFiche('Esther Jhureea', [j(42350, 'JHUREEA', 'Esther', 'My Coach Wasquehal')], 'Wasquehal', M.studioLabel);
  assert.deepEqual(f, { idClient: '42350', nom: 'JHUREEA Esther', site: 'My Coach Wasquehal' });
  assert.equal(JSON.stringify(f).includes('1990'), false, 'la date de naissance n\'est jamais gardée');
});

test('ordre, casse, accents et tirets neutralisés — mais pas la ressemblance', () => {
  assert.ok(Mb.choisirFiche('Jhureea Esther', [j(1, 'JHUREEA', 'Esther', 'X')], 'Wasquehal', M.studioLabel));
  assert.ok(Mb.choisirFiche('Aurélie Fourlin', [j(2, 'FOURLIN', 'Aurelie', 'X')], 'Neuilly', M.studioLabel));
  assert.equal(Mb.choisirFiche('Esther Jhureea', [j(3, 'JUREEA', 'Esther', 'My Coach Wasquehal')], 'Wasquehal', M.studioLabel), null,
    'une lettre de différence : pas de fiche — ce n\'est pas un moteur de ressemblance');
  assert.equal(Mb.choisirFiche('Esther Jhureea', [j(4, 'LEMOINE', 'Esther', 'My coach Levallois Perret')], 'Wasquehal', M.studioLabel), null);
});

test('homonymes : un seul dans le studio de la vente -> retenu ; deux au même endroit -> rien', () => {
  const deux = [j(10, 'MARTIN', 'Julie', 'My Coach Neuilly'), j(11, 'MARTIN', 'Julie', 'My Coach Wasquehal')];
  assert.equal(Mb.choisirFiche('Julie Martin', deux, 'Wasquehal', M.studioLabel).idClient, '11');
  const memeStudio = [j(10, 'MARTIN', 'Julie', 'My Coach Wasquehal'), j(11, 'MARTIN', 'Julie', 'My Coach Wasquehal')];
  assert.equal(Mb.choisirFiche('Julie Martin', memeStudio, 'Wasquehal', M.studioLabel), null, 'ambigu : on ne choisit pas');
  assert.equal(Mb.choisirFiche('Julie Martin', deux, 'Lille', M.studioLabel), null, 'aucun dans le studio : ambigu');
});

test('la même fiche renvoyée par deux recherches ne crée pas une fausse ambiguïté', () => {
  const f = Mb.choisirFiche('Esther Jhureea', [j(42350, 'JHUREEA', 'Esther', 'W'), j(42350, 'JHUREEA', 'Esther', 'W')], 'Wasquehal', M.studioLabel);
  assert.equal(f.idClient, '42350');
});

test('id non numérique ou identité vide : rien', () => {
  assert.equal(Mb.choisirFiche('Esther Jhureea', [j('abc', 'JHUREEA', 'Esther', 'W')], 'Wasquehal', M.studioLabel), null);
  assert.equal(Mb.choisirFiche('', [j(1, 'A', 'B', 'W')], 'Wasquehal', M.studioLabel), null);
});

test('noms à rechercher : chaque découpage prénom/nom, en tête et en queue', () => {
  assert.deepEqual(Mb.nomsARechercher('Esther Jhureea'), ['Jhureea', 'Esther']);
  assert.deepEqual(Mb.nomsARechercher('Shermila Paz Guevonoux'), ['Paz Guevonoux', 'Shermila', 'Guevonoux', 'Shermila Paz']);
  assert.deepEqual(Mb.nomsARechercher(''), []);
});
