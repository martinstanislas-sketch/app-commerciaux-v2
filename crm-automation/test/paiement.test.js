'use strict';
// ============================================================================
//  PAIEMENT SUR 31 JOURS — le faux positif de Muriel Darmon, verrouillé.
//
//  Signée le 28/08, premier prélèvement le 02/09 : RECAP 2 la disait « pas
//  encore encaissée » parce qu'il ne lisait que les encaissements d'août, dans
//  son studio, par le nom. Règle validée : par Id_client, tous sites, de la
//  signature à signature + 31 jours, net positif, trois états métier.
// ============================================================================

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const P = require('../lib/paiement.js');

const enc = (idMembre, date, montant, o = {}) => Object.assign({ idMembre, date, montant, decaissement: false, site: 'My Coach Vieux Lille', adherent: 'X' }, o);
const plage = (du, au, exporteLe) => ({ periode: { du, au }, exporteLe });
// Couverture « août complet + septembre exporté le 14/09 » (connu jusqu'au 13/09).
const COUV_14_09 = P.couverture([plage('2026-08-01', '2026-08-31', '2026-09-14T07:38:00'), plage('2026-09-01', '2026-09-30', '2026-09-14T07:40:00')]);
const statut = (o) => P.statutPaiement(Object.assign({ couvert: COUV_14_09, aujourdhui: new Date(2026, 8, 14) }, o));

test('MURIEL DARMON : signée le 28/08, prélevée le 02/09 -> encaissée (mois suivant)', () => {
  const parId = P.indexerParId([enc('42321', '02/09/2026', 69), enc('42321', '09/09/2026', 69)]);
  const s = statut({ idClient: '42321', dateSignature: '28/08/2026', parId });
  assert.equal(s.etat, 'encaisse');
  assert.equal(s.premier, '02/09/2026');
  assert.equal(s.finFenetre, '28/09/2026');
});

test('fenêtre : signature incluse, signature + 31 jours incluse, J+32 exclu, veille exclue', () => {
  const s = (date) => statut({ idClient: '1', dateSignature: '10/08/2026', parId: P.indexerParId([enc('1', date, 50)]), aujourdhui: new Date(2026, 9, 1) });
  assert.equal(s('10/08/2026').etat, 'encaisse', 'le jour même');
  assert.equal(s('10/09/2026').etat, 'encaisse', 'J+31');
  assert.notEqual(s('11/09/2026').etat, 'encaisse', 'J+32 : hors fenêtre');
  assert.notEqual(s('09/08/2026').etat, 'encaisse', 'avant la signature : ne compte pas');
});

test('fin de mois : la fenêtre DÉBORDE sur M+2 — signée le 31/08, fenêtre jusqu\'au 01/10', () => {
  const parId = P.indexerParId([enc('7', '01/10/2026', 45)]);
  const couvOct = P.couverture([plage('2026-08-01', '2026-08-31', '2026-10-05'), plage('2026-09-01', '2026-09-30', '2026-10-05'), plage('2026-10-01', '2026-10-31', '2026-10-05')]);
  const s = P.statutPaiement({ idClient: '7', dateSignature: '31/08/2026', parId, couvert: couvOct, aujourdhui: new Date(2026, 9, 5) });
  assert.equal(s.finFenetre, '01/10/2026');
  assert.equal(s.etat, 'encaisse', 'l\'encaissement du 01/10 est dans la fenêtre');
  // Sans octobre, la fenêtre n'est PAS couverte : on ne conclut pas « aucun ».
  const couvSansOct = P.couverture([plage('2026-08-01', '2026-08-31', '2026-10-05'), plage('2026-09-01', '2026-09-30', '2026-10-05')]);
  const s2 = P.statutPaiement({ idClient: '7', dateSignature: '31/08/2026', parId: new Map(), couvert: couvSansOct, aujourdhui: new Date(2026, 9, 5) });
  assert.equal(s2.etat, 'indetermine', 'fenêtre écoulée mais octobre absent : non vérifiable, jamais « aucun »');
});

test('AUTRE SITE Deciplus : payé ailleurs = payé (rapprochement par Id_client)', () => {
  const parId = P.indexerParId([enc('41950', '19/08/2026', 69, { site: 'Ginkgo Sport' })]);
  assert.equal(statut({ idClient: '41950', dateSignature: '12/08/2026', parId }).etat, 'encaisse');
});

test('HOMONYME : un autre Id_client au même nom ne paie jamais pour elle', () => {
  const parId = P.indexerParId([enc('39834', '02/09/2026', 31, { adherent: 'DARMON Ursula' })]);
  assert.notEqual(statut({ idClient: '42321', dateSignature: '28/08/2026', parId }).etat, 'encaisse');
});

test('REJET : prélèvement puis rejet dans la fenêtre -> net nul -> jamais « encaissé »', () => {
  // Cas réel (Daouda Sy) : +79 +199 le 01/09, puis −79 −199 le 08/09.
  const parId = P.indexerParId([
    enc('9', '01/09/2026', 79), enc('9', '01/09/2026', 199),
    enc('9', '08/09/2026', -79, { decaissement: true }), enc('9', '08/09/2026', -199, { decaissement: true }),
  ]);
  const s = statut({ idClient: '9', dateSignature: '19/08/2026', parId });
  assert.notEqual(s.etat, 'encaisse');
  assert.equal(s.etat, 'attendu', 'fenêtre jusqu\'au 19/09, pas encore écoulée au 14/09');
});

test('REMBOURSEMENT partiel : net encore positif -> encaissé', () => {
  const parId = P.indexerParId([enc('9', '01/09/2026', 199), enc('9', '05/09/2026', -79, { decaissement: true })]);
  assert.equal(statut({ idClient: '9', dateSignature: '19/08/2026', parId }).etat, 'encaisse');
});

test('uniquement des lignes négatives -> jamais encaissé', () => {
  const parId = P.indexerParId([enc('9', '20/08/2026', -79)]);
  assert.notEqual(statut({ idClient: '9', dateSignature: '19/08/2026', parId }).etat, 'encaisse');
});

test('AUCUN : 31 jours écoulés ET données couvrant toute la fenêtre -> seule vraie anomalie', () => {
  const s = statut({ idClient: '5', dateSignature: '07/08/2026', parId: new Map() });
  assert.equal(s.finFenetre, '07/09/2026');
  assert.equal(s.couvertJusquau, '13/09/2026', 'septembre exporté le 14 : connu jusqu\'à la veille');
  assert.equal(s.etat, 'aucun');
});

test('ATTENDU : rien encore et les 31 jours ne sont pas écoulés -> neutre', () => {
  const s = statut({ idClient: '5', dateSignature: '29/08/2026', parId: new Map() });
  assert.equal(s.finFenetre, '29/09/2026');
  assert.equal(s.etat, 'attendu');
});

test('INDÉTERMINÉ : fenêtre écoulée, mais un mois manque -> on ne conclut pas', () => {
  // Août seul, collecte le 20/09 : la fenêtre du 07/08 (→ 07/09) n'est pas couverte.
  const couv = P.couverture([plage('2026-08-01', '2026-08-31', '2026-09-20')]);
  const s = P.statutPaiement({ idClient: '5', dateSignature: '07/08/2026', parId: new Map(), couvert: couv, aujourdhui: new Date(2026, 8, 20) });
  assert.equal(s.etat, 'indetermine');
});

test('couverture : un mois en cours n\'est connu que jusqu\'à la veille de son export ; un trou l\'arrête', () => {
  const c = P.couverture([plage('2026-08-01', '2026-08-31', '2026-09-14T07:38:00'), plage('2026-09-01', '2026-09-30', '2026-09-14T07:40:00')]);
  assert.equal(P.texte(c.du), '01/08/2026');
  assert.equal(P.texte(c.au), '13/09/2026');
  const trou = P.couverture([plage('2026-08-01', '2026-08-31', '2026-11-02'), plage('2026-10-01', '2026-10-31', '2026-11-02')]);
  assert.equal(P.texte(trou.au), '31/08/2026', 'septembre manquant : on ne saute pas à octobre');
  assert.equal(P.couverture([]), null);
});

test('moisNecessaires : de M au mois où déborde la dernière fenêtre, sans dépasser le mois en cours', () => {
  assert.deepEqual(P.moisNecessaires('2026-08', new Date(2026, 8, 14)), ['2026-08', '2026-09'], 'le 14/09 : octobre n\'existe pas encore');
  assert.deepEqual(P.moisNecessaires('2026-08', new Date(2026, 10, 3)), ['2026-08', '2026-09', '2026-10'], '31/08 + 31 j = 01/10 : M+2');
  assert.deepEqual(P.moisNecessaires('2026-02', new Date(2026, 5, 1)), ['2026-02', '2026-03'], 'février : 28/02 + 31 j = 31/03');
});

test('sans Id_client ou date illisible : pas de statut (jamais un faux « aucun »)', () => {
  assert.equal(statut({ idClient: '', dateSignature: '28/08/2026', parId: new Map() }), null);
  assert.equal(statut({ idClient: '42321', dateSignature: '31/02/2026', parId: new Map() }), null);
});

// ── AOÛT RÉEL ──────────────────────────────────────────────────────────────
const EXP = path.join(__dirname, '..', '.session', 'exports');
const RAP = path.join(__dirname, '..', '.session', 'controle', 'recap2-2026-08.json');
const dispo = ['encaissements-2026-08.csv', 'encaissements-2026-09.csv'].every((f) => fs.existsSync(path.join(EXP, f))) && fs.existsSync(RAP);

test('août réel : Muriel encaissée, Teir et Tifaou payés sur un autre site, Daouda jamais encaissé',
  { skip: !dispo && 'données locales absentes' }, () => {
    const C = require('../lib/csvEncaissements.js');
    const M = require('../../public/recap2-metrics.js');
    const fichiers = ['2026-08', '2026-09'].map((m) => path.join(EXP, 'encaissements-' + m + '.csv'));
    const parses = fichiers.map((f) => C.parser(fs.readFileSync(f, 'utf8')));
    const parId = P.indexerParId(parses.flatMap((p) => p.lignes));
    const couvert = P.couverture(parses.map((p, i) => ({ periode: p.periode, exporteLe: fs.statSync(fichiers[i]).mtime })));
    const ventes = M.ventesDuRapport(JSON.parse(fs.readFileSync(RAP, 'utf8'))).filter((v) => v.retrouve && !v.annulee);
    const etat = (client) => {
      const v = ventes.find((x) => x.client === client);
      return v ? P.statutPaiement({ idClient: v.idClient, dateSignature: v.date, parId, couvert }).etat : null;
    };
    if (!ventes.some((v) => v.client === 'Muriel Darmon')) return;
    assert.equal(etat('Muriel Darmon'), 'encaisse');
    assert.equal(etat('Mustapha Teir'), 'encaisse');
    assert.equal(etat('Philippe Tifaou'), 'encaisse');
    assert.notEqual(etat('Daouda Sy'), 'encaisse');
  });
