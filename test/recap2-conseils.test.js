'use strict';
// Les remarques automatiques adressées au conseiller (public/recap2-conseils.js).
// Elles sont CALCULÉES : rien en base, donc pas de doublon possible et
// disparition dès que l'état affiché change.

const test = require('node:test');
const assert = require('node:assert');
const C = require('../public/recap2-conseils.js');
const OP = require('../lib/recap2Operationnel.js');

const T = C.TEXTES;
const vente = (operationnel, alertes) => ({
  client: 'X', operationnel, automatique: { alertes: alertes || [], controleLe: '2026-09-17T08:44' },
});
const etat = (p, r, x) => ({ prelevement: p, reservation: r, resilie: x, sources: { prelevement: 'auto', reservation: 'auto', resilie: 'auto' } });

test('les textes sont ceux validés, au mot près', () => {
  assert.equal(T.SEANCES, 'Contacte le client pour planifier ses prochaines séances.');
  assert.equal(T.PRELEVEMENT, 'Vérifie le contrat et lance le prélèvement du client.');
  assert.equal(T.REGULARISER, 'Contacte le client pour régulariser son prélèvement.');
  assert.equal(T.RESILIATION, 'Contacte le client pour comprendre sa résiliation et tenter de le conserver.');
  assert.equal(T.DECIPLUS, 'Vérifie et complète la vente dans Deciplus.');
});

test('une vente saine ne reçoit aucune remarque', () => {
  assert.deepEqual(C.conseilsVente(vente(etat('ok', 'ok', 'ko'))), []);
});

test('aucune réservation : planifier les séances', () => {
  assert.deepEqual(C.conseilsVente(vente(etat('ok', 'ko', 'ko'))), [T.SEANCES]);
});

test('aucun prélèvement lancé : vérifier le contrat', () => {
  assert.deepEqual(C.conseilsVente(vente(etat('ko', 'ok', 'ko'))), [T.PRELEVEMENT]);
});

test('prélèvement rejeté : régulariser, et jamais « lance le prélèvement »', () => {
  assert.deepEqual(C.conseilsVente(vente(etat('ok', 'ok', 'ko'), [OP.ALERTES.REJET])), [T.REGULARISER]);
  assert.deepEqual(C.conseilsVente(vente(etat('ko', 'ok', 'ko'), [OP.ALERTES.RIB])), [T.PRELEVEMENT]);
});

test('client résilié : comprendre la résiliation, sans séances ni prélèvement', () => {
  assert.deepEqual(C.conseilsVente(vente(etat('ko', 'ko', 'ok'))), [T.RESILIATION]);
});

test('résilié pour impayés : régulariser ET comprendre la résiliation', () => {
  assert.deepEqual(C.conseilsVente(vente(etat('ko', 'ko', 'ok'), [OP.ALERTES.INTERROMPU])), [T.REGULARISER, T.RESILIATION]);
});

test('cumul dans l’ordre : réservation puis prélèvement', () => {
  assert.deepEqual(C.conseilsVente(vente(etat('ko', 'ko', 'ko'))), [T.SEANCES, T.PRELEVEMENT]);
});

test('vente incomplète : uniquement « compléter dans Deciplus »', () => {
  const cas = [
    vente(etat('a_verifier', 'ok', 'ko')),
    vente(etat('ok', 'ok', 'a_verifier')),
    vente(etat('ko', 'ko', 'ko'), [OP.ALERTES.JAMAIS_CREE]),
    vente(etat('ko', 'ko', 'ok'), [OP.ALERTES.ANNULEE_JAMAIS_CREE]),
    vente(etat('ko', 'ko', 'ok'), [OP.ALERTES.A_CLOTURER]),
    { client: 'X' },                                   // vente jamais contrôlée
    { client: 'X', operationnel: etat(null, null, null) }, // forçage seul, sans moteur
  ];
  cas.forEach((v, i) => assert.deepEqual(C.conseilsVente(v), [T.DECIPLUS], 'cas ' + i));
});

test('vente absente du journal Deciplus : à compléter, même si le contrôle est bon', () => {
  const v = Object.assign(vente(etat('ok', 'ko', 'ko')), { retrouve: false });
  assert.deepEqual(C.conseilsVente(v), [T.DECIPLUS]);
  // Validée à la main : la décision humaine fait foi, on ne réclame plus rien.
  assert.deepEqual(C.conseilsVente(Object.assign({}, v, { valideManuellement: true })), [T.SEANCES]);
  // Vente annulée : c'est le moteur (et ses alertes) qui décide, pas ce test.
  assert.deepEqual(C.conseilsVente(Object.assign({}, v, { annulee: true })), [T.SEANCES]);
  // Vente retrouvée : inchangé.
  assert.deepEqual(C.conseilsVente(Object.assign({}, v, { retrouve: true })), [T.SEANCES]);
});

test('un forçage manuel change la remarque, dans les deux sens', () => {
  const forceOk = { prelevement: 'ok', reservation: 'ok', resilie: 'ko', sources: { prelevement: 'force', reservation: 'force', resilie: 'auto' } };
  assert.deepEqual(C.conseilsVente({ operationnel: forceOk, automatique: { alertes: [] } }), []);
  const forceKo = { prelevement: 'ok', reservation: 'ko', resilie: 'ko', sources: { prelevement: 'auto', reservation: 'force', resilie: 'auto' } };
  assert.deepEqual(C.conseilsVente({ operationnel: forceKo, automatique: { alertes: [] } }), [T.SEANCES]);
});

test('la fusion moteur + manuel alimente bien les remarques', () => {
  const auto = { prelevement: OP.OK, reservation: OP.KO, resilie: OP.KO, alertes: [] };
  const f = OP.fusionnerManuel(auto, { controle: { reservation: true } });
  assert.deepEqual(C.conseilsVente({ operationnel: f, automatique: auto }), []);
});

test('mois jamais contrôlé : aucune remarque automatique', () => {
  const rapport = { mois: '2026-07', studios: { Lille: { clientsRetrouves: { liste: [{ client: 'A' }, { client: 'B' }] } } } };
  assert.equal(C.moisControle(rapport), false);
  assert.deepEqual(C.conseilsVente({ client: 'A' }, { controle: false }), []);
});

test('mois contrôlé : une vente sans contrôle reste à compléter', () => {
  const rapport = { mois: '2026-08', studios: { Lille: { clientsRetrouves: { liste: [
    { client: 'A', automatique: { alertes: [] }, operationnel: etat('ok', 'ok', 'ko') },
    { client: 'B' },
  ] } } } };
  assert.equal(C.moisControle(rapport), true);
  assert.deepEqual(C.conseilsVente(rapport.studios.Lille.clientsRetrouves.liste[1]), [T.DECIPLUS]);
});

// ── REPRISE DANS « COPIER LES REMARQUES » (club et commercial) ──────────────
const RR = require('../public/recap2-remarques.js');

const rapportCopie = () => ({
  mois: '2026-08',
  studios: {
    Neuilly: {
      clientsRetrouves: { liste: [
        { client: 'DUPONT Marie', idClient: '10', commercialId: 'c1', commercial: 'Marvin R.',
          automatique: { alertes: [] }, operationnel: etat('ok', 'ko', 'ko'),
          note: { remarque: 'Vue en séance, rappelle lundi.' } },
        { client: 'MARTIN Luc', idClient: '11', commercialId: 'c1', commercial: 'Marvin R.',
          automatique: { alertes: [] }, operationnel: etat('ok', 'ok', 'ko') },
        { client: 'PETIT Jean', idClient: '12', commercialId: 'c2', commercial: 'Magali T.',
          automatique: { alertes: [] }, operationnel: etat('ko', 'ok', 'ko') },
      ] },
      nonReconduction: { liste: [{ client: 'AMIEL Anais', idClient: '20', note: { remarque: 'Contactée.' } }] },
      vni: { liste: [] },
    },
  },
});

test('copie du club : la remarque automatique précède la manuelle, sans marque', () => {
  const r = RR.remarquesClub(rapportCopie(), 'Neuilly');
  assert.equal(r.nb, 3, 'Marie (auto + manuelle), Jean (auto), Anais (manuelle) — Luc n’a rien');
  assert.ok(r.texte.includes('Marie Dupont\n' + T.SEANCES + '\nVue en séance, rappelle lundi.'));
  assert.ok(r.texte.includes('Jean Petit\n' + T.PRELEVEMENT));
  assert.ok(!/Luc Martin/.test(r.texte), 'une vente saine n’apparaît pas');
  assert.ok(!/Anais Amiel\n.*Deciplus/.test(r.texte), 'aucune remarque automatique sur les non-reconduits');
  assert.ok(r.html.includes('<b>Marie Dupont</b><br>' + T.SEANCES + '<br>Vue en séance, rappelle lundi.'));
});

test('copie du commercial : mêmes remarques, limitées à ses ventes', () => {
  const r = RR.remarquesCommercial(rapportCopie(), 'id:c1', 'Marvin R.');
  assert.equal(r.nb, 1);
  assert.ok(r.texte.includes('Marie Dupont\n' + T.SEANCES + '\nVue en séance, rappelle lundi.'));
  assert.ok(!/Jean Petit/.test(r.texte), 'les ventes d’un autre commercial ne sortent pas');
});

test('la remarque automatique disparaît dès que le problème est résolu', () => {
  const r = rapportCopie();
  r.studios.Neuilly.clientsRetrouves.liste[0].operationnel = etat('ok', 'ok', 'ko');
  const c = RR.remarquesClub(r, 'Neuilly');
  assert.ok(c.texte.includes('Marie Dupont\nVue en séance, rappelle lundi.'));
  assert.ok(!c.texte.includes(T.SEANCES));
});

test('deux ventes de la même personne : une seule fois, sans doublon de remarque', () => {
  const r = rapportCopie();
  const l = r.studios.Neuilly.clientsRetrouves.liste;
  l.push(Object.assign({}, l[2], { date: '20/08/2026' }));
  const c = RR.remarquesClub(r, 'Neuilly');
  assert.equal(c.texte.match(/Jean Petit/g).length, 1);
  assert.equal(c.texte.match(new RegExp(T.PRELEVEMENT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')).length, 1);
});

test('mois jamais contrôlé : la copie ne contient que les remarques manuelles', () => {
  const r = rapportCopie();
  r.studios.Neuilly.clientsRetrouves.liste.forEach((l) => { delete l.automatique; delete l.operationnel; });
  const c = RR.remarquesClub(r, 'Neuilly');
  assert.equal(c.nb, 2, 'Marie et Anais, par leurs remarques manuelles');
  assert.ok(!c.texte.includes(T.DECIPLUS));
});
