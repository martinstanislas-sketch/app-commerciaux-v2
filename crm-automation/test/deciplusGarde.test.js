'use strict';
// ============================================================================
//  GARDE-FOU DECIPLUS : aucune écriture, aucune page d'action, même en GET.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const DEC = require('../lib/deciplus.js');

const H = 'https://ginkgo-sport.deciplus.pro/';
const API = 'https://api.deciplus.pro/staff/v1/';

test('pages d’action refusées MÊME en GET (incident du 18/09 : anonymize.php, moveMember.php)', () => {
  ['anonymize.php?idj=1', 'moveMember.php?idj=1', 'black_list.php?idj=1', 'photo_upload.php?idj=1',
    'webcom_shoot.php?idj=1', 'gift_card_activation.php?idj=1', 'imprime_autorisation_prel.php?idj=1',
    'wallet.php?idj=1', 'joueur_mailing.php?idj=1', 'ajax_membreHandler.php', 'pointage.php?idj=1', 'rib.php?idj=1',
    'nextgen/prelevements.php', 'presta_echeance.php?idj=1', 'nextgen/manager/rebilling',
  ].forEach((p) => assert.throws(() => DEC.garde(H + p), /garde-fou/, p));
});

test('verbes d’écriture et pages d’action bloqués pour une page ouverte par nos scripts', () => {
  ['POST', 'PUT', 'PATCH', 'DELETE'].forEach((m) => assert.equal(DEC.decisionRequete(m, API + 'contracts/1?simulate=true').bloquer, true, m));
  assert.equal(DEC.decisionRequete('GET', H + 'anonymize.php?idj=1', 'document').bloquer, true);
  assert.equal(DEC.decisionRequete('GET', H + 'moveMember.php?idj=1', 'xhr').bloquer, true);
  assert.equal(DEC.decisionRequete('GET', API + 'member/1/wallet', 'fetch').bloquer, true);
  assert.equal(DEC.decisionRequete('GET', H + 'check.php?idj=1', 'document').bloquer, false);
  assert.equal(DEC.decisionRequete('POST', 'https://exemple.fr/x').bloquer, false, 'hors Deciplus : non concerné');
});

test('liste blanche : seules les lectures prévues passent', () => {
  [H + 'check.php?idj=42', H + 'reservations.php?idj=42&inner=1&datec1=2026-09-18',
    H + 'presta_ventes.php?idj=42&inner=1&datec1=18/09/2025', H + 'nextgen/home',
    API + 'contracts/9', API + 'contracts/9/history', API + 'contracts/9/paymentScheduler', API + 'contracts/9/visits',
    API + 'member/bank/42',
  ].forEach((u) => assert.equal(DEC.gardeLecture(u), u));
  [H + 'frequentations.php?idj=42', H + 'notes.php?idj=42', H + 'check.php?idj=42&action=x', H + 'joueurs.php',
    API + 'contracts/9/suspend', API + 'member/42', API + 'contracts/9?simulate=true', 'https://autre.fr/check.php?idj=1',
  ].forEach((u) => assert.throws(() => DEC.gardeLecture(u), /liste blanche|garde-fou|hors Deciplus/, u));
});

test('les adresses de la collecte existante restent autorisées', () => {
  ['nextgen/historybeta', 'nextgen/historybeta?history=boxing', 'nextgen/historybeta?history=sales', 'nextgen/legacy?path=select.php']
    .forEach((p) => assert.equal(DEC.garde(H + p), H + p));
});
