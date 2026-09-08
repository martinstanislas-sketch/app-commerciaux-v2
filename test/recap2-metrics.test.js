'use strict';
// RECAP 2 — les deux métriques doivent rester BRUTES et sans surprise :
// clients uniques, net signé, dédup des signataires, et jamais de faux 0 %.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../public/retention.js');
const M = require('../public/recap2-metrics.js');

// Fabriques : une ligne d'encaissement, un signataire de contrat.
const P = (nom, prenom, montant, dec = false) => ({ cle: R.cleClient(nom, prenom), montant, decaissement: dec, nom, prenom });
const C = (nomComplet) => {
  const parts = nomComplet.split(' ');
  return { cles: R.clesContrat(nomComplet), prenom: parts[0] || '', nom: parts.slice(1).join(' '), date: '2026-07-03' };
};

// --- 1. NON-RECONDUCTION standard -------------------------------------------
test('non-reconduction : M-1 = A,B,C et M = A,C -> 1/3', () => {
  const r = M.nonReconduction({
    encM1: [P('Alpha', 'Anne', 60), P('Beta', 'Bruno', 60), P('Gamma', 'Chloe', 60)],
    encM: [P('Alpha', 'Anne', 60), P('Gamma', 'Chloe', 60)],
  });
  assert.equal(r.base, 3);
  assert.equal(r.nb, 1);
  assert.equal(r.taux, 1 / 3);
  assert.equal(r.nonReconduits[0].nom, 'Beta');
  assert.equal(r.nonReconduits[0].prenom, 'Bruno');
});

// --- 2. CLIENTS UNIQUES ------------------------------------------------------
test('non-reconduction : un client prélevé 5 fois ne compte qu\'une fois', () => {
  const r = M.nonReconduction({
    // Bruno a 5 échéances hebdo en M-1 (mois à 5 semaines) : 1 seul client.
    encM1: [P('Alpha', 'Anne', 60), P('Beta', 'Bruno', 15), P('Beta', 'Bruno', 15), P('Beta', 'Bruno', 15), P('Beta', 'Bruno', 15), P('Beta', 'Bruno', 15)],
    encM: [P('Alpha', 'Anne', 60), P('Alpha', 'Anne', 60)],
  });
  assert.equal(r.base, 2, 'la base compte des clients, pas des lignes');
  assert.equal(r.nb, 1);
  assert.equal(r.taux, 0.5);
});

// --- 3. NET <= 0 EN M --------------------------------------------------------
test('non-reconduction : net M annulé par un rejet -> non reconduit', () => {
  const r = M.nonReconduction({
    encM1: [P('Beta', 'Bruno', 60)],
    // Prélèvement 60 puis décaissement -60 : le net vaut 0 -> il ne paie plus.
    encM: [P('Beta', 'Bruno', 60), P('Beta', 'Bruno', -60, true)],
  });
  assert.equal(r.base, 1);
  assert.equal(r.nb, 1);
  assert.equal(r.taux, 1);
  assert.equal(r.nonReconduits[0].netM, 0);
  assert.equal(r.nonReconduits[0].netM1, 60);
});

test('non-reconduction : net M-1 nul -> le client n\'entre même pas dans la base', () => {
  const r = M.nonReconduction({
    encM1: [P('Alpha', 'Anne', 60), P('Beta', 'Bruno', 40), P('Beta', 'Bruno', -40, true)],
    encM: [P('Alpha', 'Anne', 60)],
  });
  assert.equal(r.base, 1, 'seule Anne a réellement payé en M-1');
  assert.equal(r.nb, 0);
  assert.equal(r.taux, 0);
});

test('non-reconduction : aucun client en M-1 -> taux null, jamais NaN', () => {
  const r = M.nonReconduction({ encM1: [], encM: [P('Alpha', 'Anne', 60)] });
  assert.equal(r.base, 0);
  assert.equal(r.nb, 0);
  assert.equal(r.taux, null);
});

// --- 4. COMPLÉTION standard --------------------------------------------------
test('complétion : 3 contrats M-1, 2 payés en M -> 2/3', () => {
  const r = M.completion({
    contratsM1: [C('anne alpha'), C('bruno beta'), C('chloe gamma')],
    encM: [P('Alpha', 'Anne', 60), P('Gamma', 'Chloe', 60)],
  });
  assert.equal(r.total, 3);
  assert.equal(r.nbPayes, 2);
  assert.equal(r.taux, 2 / 3);
  const bruno = r.contrats.find((c) => c.nom === 'Beta');
  assert.equal(bruno.paye, false);
  assert.equal(bruno.prenom, 'Bruno', 'le nom du fichier est remis en Title Case');
});

// --- 5. DOUBLONS DE CONTRATS -------------------------------------------------
test('complétion : le même contrat déposé deux fois ne compte qu\'une fois', () => {
  const r = M.completion({
    contratsM1: [C('anne alpha'), C('anne alpha'), C('bruno beta')],
    encM: [P('Alpha', 'Anne', 60)],
  });
  assert.equal(r.total, 2, 'dédup des signataires (mêmes clés candidates)');
  assert.equal(r.nbPayes, 1);
  assert.equal(r.taux, 0.5);
});

test('complétion : un nom composé est payé si UNE clé candidate correspond', () => {
  // Le nom de fichier ne dit pas où s'arrête le prénom : « jean marie dupont »
  // produit plusieurs coupes. L'encaissement est au nom DUPONT|JEAN MARIE.
  const r = M.completion({
    contratsM1: [C('jean marie dupont')],
    encM: [P('Dupont', 'Jean Marie', 90)],
  });
  assert.equal(r.total, 1);
  assert.equal(r.nbPayes, 1, 'une seule clé candidate suffit');
  assert.equal(r.taux, 1);
});

// --- 6. CONTRAT SANS PAIEMENT ------------------------------------------------
test('complétion : contrat sans aucun paiement en M -> non payé', () => {
  const r = M.completion({ contratsM1: [C('bruno beta')], encM: [P('Alpha', 'Anne', 60)] });
  assert.equal(r.total, 1);
  assert.equal(r.nbPayes, 0);
  assert.equal(r.taux, 0);
  assert.equal(r.contrats[0].paye, false);
});

test('complétion : un net M annulé par un rejet ne vaut pas paiement', () => {
  const r = M.completion({
    contratsM1: [C('bruno beta')],
    encM: [P('Beta', 'Bruno', 60), P('Beta', 'Bruno', -60, true)],
  });
  assert.equal(r.nbPayes, 0, 'net = 0 -> pas de paiement');
});

// --- 7. AUCUN NOUVEAU CONTRAT ------------------------------------------------
test('complétion : aucun contrat signé -> taux null (affichage « — »), jamais 0 % ni NaN', () => {
  const r = M.completion({ contratsM1: [], encM: [P('Alpha', 'Anne', 60)] });
  assert.equal(r.total, 0);
  assert.equal(r.nbPayes, 0);
  assert.equal(r.taux, null);
  assert.ok(!Number.isNaN(r.taux) && r.taux !== Infinity);
});

// --- 8. DONNÉES MANQUANTES ---------------------------------------------------
test('analyserStudio : import absent -> état explicite, jamais un faux 0 %', () => {
  // null = rien n'a jamais été déposé ; [] = déposé mais vide (nuance conservée).
  const a = M.analyserStudio({ encM1: null, encM: [P('Alpha', 'Anne', 60)], contratsM1: [] });
  assert.equal(a.nonReconduction.dispo, false);
  assert.deepEqual(a.nonReconduction.manque, ['encM1']);
  assert.equal(a.nonReconduction.taux, undefined, 'aucun taux inventé');
  assert.equal(a.completion.dispo, true);
  assert.equal(a.completion.taux, null, '0 contrat déposé -> pas de dénominateur');

  const b = M.analyserStudio({ encM1: null, encM: null, contratsM1: null });
  assert.deepEqual(b.nonReconduction.manque, ['encM1', 'encM']);
  assert.deepEqual(b.completion.manque, ['contratsM1', 'encM']);

  const c = M.analyserStudio({ encM1: [P('Alpha', 'Anne', 60)], encM: [], contratsM1: [C('anne alpha')] });
  assert.equal(c.nonReconduction.dispo, true, 'encaissements M vides = information, pas absence');
  assert.equal(c.nonReconduction.taux, 1, 'plus personne ne paie en M -> 100 % de non-reconduction');
  assert.equal(c.completion.taux, 0);
});

// --- STUDIOS : mapping explicite, sans rapprochement approximatif ------------
test('studioLabel : les variantes connues tombent sur le libellé simple', () => {
  assert.equal(M.studioLabel('Lille'), 'Lille');
  assert.equal(M.studioLabel('Vieux-Lille'), 'Lille');
  assert.equal(M.studioLabel('Marcq-en-Baroeul'), 'Marcq');
  assert.equal(M.studioLabel('Marcq-en-Barœul'), 'Marcq');
  assert.equal(M.studioLabel('Boulogne-Billancourt'), 'Boulogne');
  assert.equal(M.studioLabel('  neuilly sur seine '), 'Neuilly');
  assert.equal(M.studioLabel('Levallois-Perret'), 'Levallois');
  assert.equal(M.studioLabel('My Coach Wasquehal'), 'Wasquehal');
});

test('studioLabel : tout ce qui n\'est pas un studio en propre est ignoré', () => {
  ['Ginkgo Sport', 'Caen', 'Tours', 'Veigné', 'Paris 15', 'Franchise', '', null, 'Lilloise']
    .forEach((s) => assert.equal(M.studioLabel(s), null, 'inconnu -> null : ' + s));
});

test('LABELS : les 6 studios, toujours dans le même ordre', () => {
  assert.deepEqual(M.LABELS, ['Lille', 'Wasquehal', 'Marcq', 'Boulogne', 'Levallois', 'Neuilly']);
});
