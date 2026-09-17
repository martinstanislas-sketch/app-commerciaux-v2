'use strict';
// Contrôle opérationnel automatique — les règles R1 → R23 sur des dossiers
// fictifs (aucune donnée client), et la priorité des corrections manuelles.
const { test } = require('node:test');
const assert = require('node:assert');
const OP = require('../lib/recap2Operationnel.js');
const ATTR = require('../lib/recap2Attributions.js');

const AUJ = { aujourdHui: '2026-09-17' };
const ech = (date, statut, o = {}) => Object.assign({ date, montant: 45, statut }, o);
const contrat = (o) => Object.assign({ numero: 'C1', produit: 'CHALLENGE 12 MOIS HEURES CREUSES HDF ', etat: 'ACTIVE', vendu: '05/08/2026',
  resiliation: '', valeurInitiale: 2340, valeur: 2340, paye: 90, restantDu: 2250, historique: [], echeances: [ech('2026-09-10', 'E'), ech('2026-09-24', 'T')] }, o);
const dossier = (o) => Object.assign({ ok: true, contrats: [contrat()], cartes: [], mandat: { rib: true, rum: true }, reservationsFutures: 2, ventesDeciplus: 3 }, o);
const vente = (o) => Object.assign({ prestation: 'CHALLENGE 12 MOIS HEURES CREUSE', date: '05/08/2026', annulee: false }, o);
const cases = (r) => [r.prelevement, r.reservation, r.resilie].join('/');

test('R1 / R11 / R16 : variantes validées seulement', () => {
  assert.ok(OP.memeProduit('CHALLENGE 12MOIS HEURES CREUSES', 'CHALLENGE 12 MOIS HEURES CREUSES IDF '));
  assert.ok(OP.memeProduit('Transformation 12 mois', 'Challenge 12 mois HDF'));
  assert.ok(OP.memeProduit('Pack 4 coaching / mois', '4 coaching / mois'));
  assert.ok(!OP.memeProduit('Transformation 12 mois', 'CHALLENGE TRANSFORMATION 1 (2027)'));
  assert.ok(!OP.memeProduit('Challenge 12 mois', 'CHALLENGE 12 MOIS HEURES CREUSES HDF'));
});

test('cas nominal : échéances futures, réservation -> ✅/✅/❌', () => {
  assert.equal(cases(OP.evaluerVente(vente(), dossier(), AUJ)), 'ok/ok/ko');
});

test('R6 : aucune réservation future -> Réservation ❌', () => {
  assert.equal(OP.evaluerVente(vente(), dossier({ reservationsFutures: 0 }), AUJ).reservation, 'ko');
});

test('R9 : rejet + échéancier futur -> ✅ avec alerte', () => {
  const r = OP.evaluerVente(vente(), dossier({ contrats: [contrat({ echeances: [ech('2026-09-15', 'I', { motifRejet: 'MD01' }), ech('2026-09-29', 'T')] })] }), AUJ);
  assert.equal(r.prelevement, 'ok'); assert.ok(r.alertes.includes(OP.ALERTES.REJET));
});

test('R12 : échéancier sans RIB ni mandat ni prélèvement -> ❌ + alerte', () => {
  const r = OP.evaluerVente(vente(), dossier({ mandat: { rib: false, rum: false }, contrats: [contrat({ paye: 0, echeances: [ech('2026-09-24', 'T')] })] }), AUJ);
  assert.equal(r.prelevement, 'ko'); assert.ok(r.alertes.includes(OP.ALERTES.RIB));
});

test('R8 / R10 / R13 : contrats annulés administratifs ignorés', () => {
  const annule = (o) => contrat(Object.assign({ numero: 'CX', etat: 'CANCELED', paye: 0, echeances: [] }, o));
  const r8 = annule({ historique: [{ date: '2026-08-05T14:32:26+02:00', type: 'CREATED' }, { date: '2026-08-05T14:33:19+02:00', type: 'CANCELED' }] });
  const r10 = annule({ historique: [{ date: '2026-08-05T10:00:00+02:00', type: 'CREATED' }, { date: '2026-08-11T10:00:00+02:00', type: 'CANCELED', annotation: 'errezur' }] });
  const r13 = annule({ vendu: '04/08/2026', historique: [{ date: '2026-08-04T10:00:00+02:00', type: 'CREATED' }, { date: '2026-08-05T15:00:00+02:00', type: 'CANCELED' }] });
  [r8, r10, r13].forEach((a, i) => {
    const r = OP.evaluerVente(vente(), dossier({ contrats: [a, contrat()] }), AUJ);
    assert.equal(cases(r), 'ok/ok/ko'); assert.ok(r.regles.includes(['R8', 'R10', 'R13'][i]));
  });
});

test('R2 : contrat arrêté + remplaçant prélevé -> Résilié ❌', () => {
  const ancien = contrat({ numero: 'A', etat: 'ACTIVE', resiliation: '30/09/2026', echeances: [ech('2026-09-14', 'E')], historique: [{ type: 'UPDATED', raison: 'PRODUCT_CHANGE' }] });
  const nouveau = contrat({ numero: 'B', etat: 'PENDING', vendu: '07/09/2026', echeances: [ech('2026-10-08', 'T')] });
  const r = OP.evaluerVente(vente(), dossier({ contrats: [ancien, nouveau] }), AUJ);
  assert.equal(cases(r), 'ok/ok/ko'); assert.equal(r.contrat.remplacant, 'B');
});

test('R14 / R15 : rétractation, résiliation pour impayés -> ❌/❌/✅', () => {
  const arrete = (raison) => contrat({ etat: 'TERMINATED', resiliation: '03/09/2026', echeances: [ech('2026-09-04', 'E')], historique: [{ type: 'TERMINATED', raison }] });
  const r14 = OP.evaluerVente(vente(), dossier({ reservationsFutures: 0, contrats: [arrete('RETRACTATION')] }), AUJ);
  const r15 = OP.evaluerVente(vente(), dossier({ reservationsFutures: 0, contrats: [arrete('UNPAID')] }), AUJ);
  assert.equal(cases(r14), 'ko/ko/ok'); assert.equal(cases(r15), 'ko/ko/ok'); assert.ok(r15.alertes.includes(OP.ALERTES.INTERROMPU));
});

test('R20 / R21 : aucun contrat Deciplus', () => {
  const vide = dossier({ contrats: [], reservationsFutures: 0, ventesDeciplus: 0 });
  const r20 = OP.evaluerVente(vente(), vide, AUJ), r21 = OP.evaluerVente(vente({ annulee: true }), vide, AUJ);
  assert.equal(cases(r20), 'ko/ko/ko'); assert.ok(r20.alertes.includes(OP.ALERTES.JAMAIS_CREE));
  assert.equal(cases(r21), 'ko/ko/ok'); assert.ok(r21.alertes.includes(OP.ALERTES.ANNULEE_JAMAIS_CREE));
});

test('R3 paiement intégral vs R22 contrat réduit resté actif', () => {
  const paye = contrat({ valeurInitiale: 2548, valeur: 2548, paye: 2548, restantDu: 0, echeances: [ech('2026-08-28', 'E', { montant: 2548 })] });
  assert.equal(cases(OP.evaluerVente(vente(), dossier({ contrats: [paye] }), AUJ)), 'ok/ok/ko');
  const reduit = contrat({ valeurInitiale: 2544, valeur: 49, paye: 49, restantDu: 0, echeances: [ech('2026-09-04', 'E', { montant: 49 })] });
  const r22 = OP.evaluerVente(vente({ annulee: true }), dossier({ reservationsFutures: 0, contrats: [reduit] }), AUJ);
  assert.equal(cases(r22), 'ko/ko/ok'); assert.ok(r22.alertes.includes(OP.ALERTES.A_CLOTURER));
  assert.equal(OP.evaluerVente(vente(), dossier({ reservationsFutures: 0, contrats: [reduit] }), AUJ).prelevement, 'a_verifier', 'non annulée : jamais supposé');
});

test('R19 : vente annulée Vendor mais contrat actif -> reflète Deciplus', () => {
  assert.equal(cases(OP.evaluerVente(vente({ annulee: true }), dossier(), AUJ)), 'ok/ok/ko');
});

test('hors règles -> À vérifier, jamais de supposition', () => {
  assert.equal(OP.evaluerVente(vente(), { ok: false, erreur: 'x' }, AUJ).prelevement, 'a_verifier');
  assert.equal(OP.evaluerVente(vente(), dossier({ contrats: [contrat({ produit: 'CHALLENGE TRANSFORMATION 1 (2027)' })] }), AUJ).prelevement, 'a_verifier');
  assert.equal(OP.evaluerVente(vente(), dossier({ contrats: [contrat({ vendu: '01/03/2026' })] }), AUJ).prelevement, 'a_verifier', 'hors fenêtre de date');
  assert.equal(OP.evaluerVente(vente(), dossier({ contrats: [contrat({ echeances: [ech('2026-09-24', 'Z')] })] }), AUJ).prelevement, 'a_verifier', 'code inconnu');
  const deux = dossier({ contrats: [contrat({ numero: 'A' }), contrat({ numero: 'B' })] });
  assert.equal(OP.evaluerVente(vente(), deux, AUJ).prelevement, 'a_verifier', 'deux contrats prélevés, même date');
});

test('corrections manuelles de RECAP 2 prioritaires', () => {
  const auto = OP.evaluerVente(vente(), dossier({ reservationsFutures: 0 }), AUJ);
  const f = OP.fusionnerManuel(auto, { controle: { reservation: true }, resiliation: { resilie: true } });
  assert.deepEqual([f.prelevement, f.reservation, f.resilie], ['ok', 'ok', 'ok']);
  assert.deepEqual(f.sources, { prelevement: 'auto', reservation: 'manuel', resilie: 'manuel' });
});

test('R17 / R23 : attributions décidées, par Id Deciplus + studio + date', () => {
  assert.equal(ATTR.attributionVente('2026-08', 'Marcq', { date: '12/08/2026' }, '42130').compte, false);
  const w = ATTR.attributionVente('2026-08', 'Wasquehal', { date: '19/08/2026' }, '42130');
  assert.deepEqual([w.compte, w.commercial, w.regle], [true, 'Cédric H.', 'R23']);
  assert.equal(ATTR.attributionVente('2026-08', 'Wasquehal', { date: '19/08/2026' }, '99999'), null, 'jamais par nom ni par date seule');
});
