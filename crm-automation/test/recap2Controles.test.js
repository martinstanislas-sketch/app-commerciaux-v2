'use strict';
// RECAP 2 — la frontière bloquant / non bloquant. Elle décide de l'envoi : elle
// doit être ennuyeusement prévisible.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const CTRL = require('../lib/recap2Controles.js');
const M = require('../../public/recap2-metrics.js');

// Un rapport sain, minimal mais complet : 6 studios, 2 KPI chacun.
function rapportSain() {
  const studios = {};
  M.LABELS.forEach((s) => {
    studios[s] = {
      studio: s,
      nonReconduction: { base: 10, nonReconduits: 2, taux: 0.2, tauxPct: 20, liste: [
        { client: 'A', netM1: 60, netM: 0 }, { client: 'B', netM1: 60, netM: 0 }] },
      completion: { contratsSouscrits: 4, annulesExclus: 0, contratsValides: 4, ontPaye: 3,
        taux: 0.75, tauxPct: 75, liste: [
          { contrat: 'C', date: '01/06/26', paye: true }, { contrat: 'D', date: '02/06/26', paye: true },
          { contrat: 'E', date: '03/06/26', paye: true }, { contrat: 'F', date: '04/06/26', paye: false }] },
      avertissements: [],
      controleBloquant: { ok: true, detail: {} },
    };
  });
  const controleParStudio = {};
  M.LABELS.forEach((s) => { controleParStudio[s] = { ok: true, problemes: [], lignesBrutes: 100, lignesParsees: 100, avertissements: [] }; });
  const fitnessBooster = {};
  M.LABELS.forEach((s) => { fitnessBooster[s] = { club: s, periodeDetail: { du: '01/06/26', au: '30/06/26' }, compteur: 4, annulees: 0, echec: null }; });
  return {
    genere: new Date().toISOString(), mois: '2026-07', m1: '2026-06',
    source: {
      'deciplus_2026-06': { periode: { du: '2026-06-01', au: '2026-06-30' }, conforme: true, problemes: [], avertissements: [], controleParStudio },
      'deciplus_2026-07': { periode: { du: '2026-07-01', au: '2026-07-31' }, conforme: true, problemes: [], avertissements: [], controleParStudio },
      fitnessBooster,
    },
    studios, journal: [], erreurs: [],
  };
}
const codes = (b) => b.bloquants.map((c) => c.code).sort();

test('rapport sain : rien ne bloque, rien à signaler, envoi autorisé', () => {
  const b = CTRL.analyser(rapportSain(), '2026-07');
  assert.deepEqual(codes(b), [], JSON.stringify(b.bloquants, null, 1));
  assert.equal(b.alertes.length, 0);
  assert.equal(b.peutEnvoyer, true);
});

// ─── CE QUI DOIT BLOQUER ────────────────────────────────────────────────────
test('incohérence de période : le fichier ne parle pas du mois demandé -> BLOQUE', () => {
  const r = rapportSain();
  r.source['deciplus_2026-07'].periode = { du: '2026-08-01', au: '2026-08-31' };
  const b = CTRL.analyser(r, '2026-07');
  assert.ok(codes(b).includes('periode'));
  assert.equal(b.peutEnvoyer, false);
});

test('mois déposé ≠ mois demandé -> BLOQUE', () => {
  const b = CTRL.analyser(rapportSain(), '2026-08');
  assert.equal(b.peutEnvoyer, false);
  assert.ok(codes(b).includes('periode'));
});

test('studio manquant -> BLOQUE', () => {
  const r = rapportSain();
  delete r.studios.Neuilly;
  const b = CTRL.analyser(r, '2026-07');
  assert.ok(codes(b).includes('studios'));
  assert.equal(b.peutEnvoyer, false);
});

test('studio privé de KPI par son contrôle de conformité -> BLOQUE', () => {
  const r = rapportSain();
  r.studios.Marcq.controleBloquant = { ok: false, raisons: ['2026-07 : studio absent du fichier'] };
  r.studios.Marcq.nonReconduction = null;
  r.studios.Marcq.completion = null;
  const b = CTRL.analyser(r, '2026-07');
  assert.ok(codes(b).includes('studios'));
  assert.equal(b.peutEnvoyer, false);
});

test('KPI impossible : plus de non-reconduits que de base -> BLOQUE', () => {
  const r = rapportSain();
  r.studios.Lille.nonReconduction = { base: 10, nonReconduits: 12, taux: 1.2, tauxPct: 120, liste: [] };
  const b = CTRL.analyser(r, '2026-07');
  assert.ok(codes(b).includes('kpi'));
  assert.equal(b.peutEnvoyer, false);
});

test('KPI impossible : taux qui ne colle pas à son rapport -> BLOQUE', () => {
  const r = rapportSain();
  r.studios.Lille.completion.taux = 0.9; // annoncé 90 %, calculé 3/4
  const b = CTRL.analyser(r, '2026-07');
  assert.ok(codes(b).includes('kpi'));
});

test('nombre de lignes incohérent : le parseur a perdu des lignes -> BLOQUE', () => {
  const r = rapportSain();
  r.source['deciplus_2026-07'].controleParStudio.Boulogne = {
    ok: false, problemes: ['lignes perdues au parsing : 120 brutes -> 118 parsées'],
    lignesBrutes: 120, lignesParsees: 118, avertissements: [],
  };
  const b = CTRL.analyser(r, '2026-07');
  assert.ok(codes(b).includes('lignes'));
  assert.equal(b.peutEnvoyer, false);
});

test('authentification : une session perdue est nommée pour ce qu\'elle est -> BLOQUE', () => {
  const r = rapportSain();
  r.erreurs = ['Deciplus : Aucun onglet Deciplus ouvert (lance open-crm.js)'];
  const b = CTRL.analyser(r, '2026-07');
  assert.ok(codes(b).includes('acces'));
  assert.equal(b.peutEnvoyer, false);
});

test('Fitness Booster en échec sur un studio -> BLOQUE', () => {
  const r = rapportSain();
  r.source.fitnessBooster.Levallois = { club: null, periodeDetail: null, compteur: null, annulees: null, echec: 'Tuile CONTRATS SOUSCRITS introuvable' };
  const b = CTRL.analyser(r, '2026-07');
  assert.ok(codes(b).includes('studios'));
});

// ─── CE QUI NE DOIT PAS BLOQUER ─────────────────────────────────────────────
test('doublons de contrat et encaissements sans adhérent : signalés, JAMAIS bloquants', () => {
  const r = rapportSain();
  r.studios.Lille.avertissements = ['7 encaissements sans adhérent (225 €) écartés du calcul'];
  r.studios.Wasquehal.avertissements = [CTRL.messageDoublons(14, 13)];
  r.studios.Wasquehal.completion.contratsBruts = 14;
  r.studios.Wasquehal.completion.doublonsSignataire = 1;
  const b = CTRL.analyser(r, '2026-07');
  assert.deepEqual(codes(b), []);
  assert.equal(b.peutEnvoyer, true, 'l\'envoi doit partir : les chiffres sont justes');
  assert.equal(b.alertes.length, 2);
});

test('0 nouveau contrat : complétion à « — », ce n\'est pas une anomalie', () => {
  const r = rapportSain();
  r.studios.Neuilly.completion = { contratsSouscrits: 0, annulesExclus: 0, contratsValides: 0, ontPaye: 0, taux: null, tauxPct: null, liste: [] };
  const b = CTRL.analyser(r, '2026-07');
  assert.deepEqual(codes(b), []);
  assert.equal(b.peutEnvoyer, true);
});

// ─── Détails ────────────────────────────────────────────────────────────────
test('messageDoublons : singulier, pluriel, et silence quand il n\'y en a pas', () => {
  assert.equal(CTRL.messageDoublons(14, 13), '1 doublon de contrat détecté, calcul effectué sur 13 signataires uniques');
  assert.equal(CTRL.messageDoublons(9, 6), '3 doublons de contrat détectés, calcul effectué sur 6 signataires uniques');
  assert.equal(CTRL.messageDoublons(2, 1), '1 doublon de contrat détecté, calcul effectué sur 1 signataire unique');
  assert.equal(CTRL.messageDoublons(5, 5), null);
});

test('moisDeDate : Deciplus écrit AAAA-MM-JJ, Fitness Booster JJ/MM/AA', () => {
  assert.equal(CTRL.moisDeDate('2026-07-31'), '2026-07');
  assert.equal(CTRL.moisDeDate('01/06/26'), '2026-06');
  assert.equal(CTRL.moisDeDate('30/06/2026'), '2026-06');
  assert.equal(CTRL.moisDeDate('n\'importe quoi'), null);
});

test('alertes() compte exactement ce que l\'écran affichera', () => {
  const r = rapportSain();
  r.studios.Lille.avertissements = ['a'];
  r.source['deciplus_2026-06'].avertissements = ['b'];
  const l = CTRL.alertes(r);
  assert.deepEqual(l, [{ studio: 'Lille', texte: 'a' }, { studio: 'deciplus_2026-06', texte: 'b' }]);
});
