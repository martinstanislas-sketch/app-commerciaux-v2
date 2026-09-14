'use strict';
// ============================================================================
//  LECTURE D'UNE LIGNE FITNESS BOOSTER — le bug du 2026-09-14, verrouillé.
//
//  CE QUI S'EST PASSÉ. Le détail d'un studio était lu PAR POSITION :
//    l[1] identité · l[2] prestation · l[3] source · l[4] date | commercial
//  Bubble peint la ligne par morceaux. Sur Marcq, les segments 2 à 4 n'étaient
//  pas encore là : l[2] valait « Voir la fiche du contact », et date comme
//  commercial ressortaient VIDES. Le compteur affiché était pourtant bon — les
//  lignes existaient — donc AUCUN contrôle ne bronchait. Le rapport est parti
//  avec 5 ventes sans commercial.
//
//  Les KPI, eux, étaient restés justes : ils ne dépendent que de l'identité.
//  C'est la vue par commercial qui devenait fausse en silence — le pire cas.
//
//  D'où les deux règles que ces tests tiennent :
//   1. la date se reconnaît à son MOTIF, jamais à son rang ;
//   2. une ligne à moitié peinte est DÉCLARÉE incomplète, pas devinée.
// ============================================================================

const { test } = require('node:test');
const assert = require('node:assert');
const FB = require('../lib/booster.js');

// Une ligne telle que Bubble la rend une fois entièrement peinte.
const COMPLETE = [
  '1',
  'Camille Gremez',
  'CHALLENGE 12MOIS HEURES CREUSES',
  'Publicité',
  '05/08/2026 |  Fabian F.',
  'Voir la fiche du contact',
  'Voir le contrat PDF(05/08/26)',
  'Voir le mandat SEPA (05/08/26)',
].join('\n');

// La MÊME ligne, surprise à moitié peinte : c'est exactement ce qui a produit
// « prestation: Voir la fiche du contact » et un commercial vide.
const MOITIE = ['1', 'Camille Gremez', 'Voir la fiche du contact'].join('\n');

test('ligne complète : chaque champ à sa place', () => {
  const l = FB.analyserLigne(COMPLETE);
  assert.equal(l.identite, 'Camille Gremez');
  assert.equal(l.prestation, 'CHALLENGE 12MOIS HEURES CREUSES');
  assert.equal(l.source, 'Publicité');
  assert.equal(l.date, '05/08/2026');
  assert.equal(l.commercial, 'Fabian F.', 'les espaces après le « | » sont mangés');
  assert.equal(l.annulee, false);
  assert.equal(l.complete, true);
});

test('LE BUG : une ligne à moitié peinte est déclarée incomplète, jamais devinée', () => {
  const l = FB.analyserLigne(MOITIE);
  assert.equal(l.complete, false, 'c\'est CE drapeau qui fait attendre puis échouer');
  assert.notEqual(l.prestation, 'Voir la fiche du contact',
    'un libellé de bouton ne doit JAMAIS passer pour une prestation');
  assert.equal(l.prestation, '');
  assert.equal(l.date, '');
  assert.equal(l.commercial, '');
});

test('« Voir le contrat PDF(05/08/26) » n\'est pas confondu avec la date de signature', () => {
  // Le piège : ce segment CONTIENT une date. Mais sur 2 chiffres d'année, et
  // pas en tête — le motif l'exclut.
  const sansDate = ['1', 'Camille Gremez', 'Challenge', 'Publicité',
    'Voir la fiche du contact', 'Voir le contrat PDF(05/08/26)'].join('\n');
  const l = FB.analyserLigne(sansDate);
  assert.equal(l.date, '', 'aucune date de signature ici');
  assert.equal(l.complete, false);
});

test('la date est trouvée même si son rang change', () => {
  // Un segment en plus avant elle : par position on l'aurait ratée.
  const decale = ['1', 'Camille Gremez', 'Challenge', 'Publicité', 'Mention en plus',
    '05/08/2026 |  Fabian F.', 'Voir la fiche du contact'].join('\n');
  const l = FB.analyserLigne(decale);
  assert.equal(l.date, '05/08/2026');
  assert.equal(l.commercial, 'Fabian F.');
  assert.equal(l.complete, true);
  assert.equal(l.prestation, 'Challenge', 'la prestation reste le 1er segment du milieu');
});

test('une vente annulée reste détectée, et reste une ligne complète', () => {
  const annulee = COMPLETE.replace('Publicité', 'Publicité\nVente annulée');
  const l = FB.analyserLigne(annulee);
  assert.equal(l.annulee, true);
  assert.equal(l.complete, true, 'elle est exclue plus tard, pas ici');
  assert.equal(l.date, '05/08/2026');
});

test('« Pas de commercial » est une valeur, pas une absence', () => {
  // Fitness Booster écrit littéralement cette mention : on la rend telle quelle.
  const l = FB.analyserLigne(COMPLETE.replace('Fabian F.', 'Pas de commercial'));
  assert.equal(l.commercial, 'Pas de commercial');
  assert.equal(l.complete, true);
});

test('une date SANS commercial ne rend pas la ligne incomplète', () => {
  const l = FB.analyserLigne(COMPLETE.replace('05/08/2026 |  Fabian F.', '05/08/2026'));
  assert.equal(l.date, '05/08/2026');
  assert.equal(l.commercial, '', 'le champ est vide parce qu\'il l\'est à l\'écran');
  assert.equal(l.complete, true, 'la date suffit à prouver que la ligne est peinte');
});

test('une identité absente ou remplacée par un bouton -> incomplète', () => {
  assert.equal(FB.analyserLigne(['1'].join('\n')).complete, false);
  assert.equal(FB.analyserLigne(['1', 'Voir la fiche du contact', '05/08/2026 | Fabian F.'].join('\n')).complete, false);
});

test('entrées vides ou biscornues : aucune exception', () => {
  [null, undefined, '', '\n\n', '   '].forEach((t) => {
    const l = FB.analyserLigne(t);
    assert.equal(l.complete, false);
    assert.equal(l.identite, '');
  });
});

test('un commercial dont le nom contient un « | » n\'est pas tronqué à tort', () => {
  // Peu probable, mais la découpe ne doit pas perdre la fin du nom.
  const l = FB.analyserLigne(COMPLETE.replace('Fabian F.', 'Fabian | F.'));
  assert.equal(l.commercial, 'Fabian | F.');
});
