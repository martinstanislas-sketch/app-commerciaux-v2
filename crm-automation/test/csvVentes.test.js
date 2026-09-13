'use strict';
// ============================================================================
//  LE JOURNAL DES VENTES — ce qu'on lui demande de prouver.
//
//  Ce fichier existe pour UNE raison : le journal des encaissements ne sait pas
//  distinguer « ce client n'est pas dans le CRM » de « ce client n'a pas encore
//  payé ». Les tests ci-dessous verrouillent cette distinction.
//
//  Les tests adossés à l'export réel se sautent d'eux-mêmes si le CSV n'est pas
//  là (autre machine, clone neuf) : les CSV vivent dans .session/, jamais dans git.
// ============================================================================

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const V = require('../lib/csvVentes.js');
const R = require('../../public/retention.js');

const EXPORTS = path.join(__dirname, '..', '.session', 'exports');
const csvDe = (ym) => path.join(EXPORTS, 'ventes-' + ym + '.csv');
const dispo = (ym) => fs.existsSync(csvDe(ym));

// ── Un mini-journal de synthèse, à la forme EXACTE de l'export Deciplus ──────
const ENTETE = '"Num. vente";"Date de vente";"Vendeur";"Prestation";"Adhérent";"Catégorie";'
  + '"PU TTC";"quantité";"prix TTC";"TVA";"tx TVA";"Info";"Numéro comptable";"Num. Note";'
  + '"Référence";"Id_prestation";"Num compte tiers";"Site";"Id_client";"Signature"';
function journal(lignes, { du = '2026-08-01', au = '2026-08-31' } = {}) {
  return '﻿;;;;JOURNAL DES VENTES DU;' + du + ';AU;' + au + '\n\n'
    + 'Total des ventes;1000,00\n\n\n' + ENTETE + '\n' + lignes.join('\n') + '\n';
}
// Une vente : on ne renseigne que ce que les tests regardent.
const vente = ({ num = '1', date = '12/08/2026', vendeur = 'Marvin', presta = 'Challenge 12 mois',
  adherent = 'DUPONT Marie', ttc = '150,00', info = '', site = 'My Coach Lille', id = '4242' } = {}) =>
  ['"' + num + '"', '"' + date + '"', '"' + vendeur + '"', '"' + presta + '"', '"' + adherent + '"',
    '"Clients"', '"0"', '"1"', '"' + ttc + '"', '"0"', '"20%"', '"' + info + '"', '""', '""',
    '""', '""', '""', '"' + site + '"', '"' + id + '"', '"sig"'].join(';');

// ── PARSING ─────────────────────────────────────────────────────────────────
test('une vente à 0 € en « paiement différé » est une vente, pas un trou', () => {
  const p = V.parser(journal([vente({ ttc: '0,00', info: 'Paiement différé', adherent: 'CHERIF Sofia' })]));
  assert.equal(p.lignes.length, 1, 'la ligne existe');
  const l = p.lignes[0];
  assert.equal(l.adherent, 'CHERIF Sofia');
  assert.equal(l.ttc, 0, 'aucun euro encaissé…');
  assert.equal(l.info, 'Paiement différé', '…et pourtant la vente est là : c\'est TOUT l\'intérêt de ce journal');
  assert.equal(l.mois, '2026-08');
});

test('la période de l\'en-tête est relue telle quelle', () => {
  const p = V.parser(journal([vente()]));
  assert.deepEqual(p.periode, { du: '2026-08-01', au: '2026-08-31' });
  assert.equal(p.totalAnnonce, 1000);
});

test('une ligne sans adhérent est écartée : elle ne prouve la présence de personne', () => {
  const p = V.parser(journal([vente(), vente({ num: '2', adherent: '' })]));
  assert.equal(p.lignes.length, 1);
});

test('un en-tête absent ou des colonnes manquantes : on lève, on ne devine pas', () => {
  assert.throws(() => V.parser('n\'importe quoi'), /En-têtes du détail introuvables/);
  const ampute = journal([vente()]).replace('"Adhérent";', '');
  assert.throws(() => V.parser(ampute), /Colonnes manquantes/);
});

// ── CONTRÔLE DE CONFORMITÉ ──────────────────────────────────────────────────
test('mauvais mois -> refusé : un journal de juillet relu comme août rendrait des ventes « introuvables »', () => {
  const p = V.parser(journal([vente({ date: '12/07/2026' })], { du: '2026-07-01', au: '2026-07-31' }));
  const v = V.verifier(p, { moisAttendu: '2026-08' });
  assert.equal(v.ok, false);
  assert.match(v.problemes.join(' '), /2026-07-01/);
});

test('une ligne datée hors du mois demandé est un problème', () => {
  const p = V.parser(journal([vente(), vente({ num: '2', date: '03/07/2026' })]));
  const v = V.verifier(p, { moisAttendu: '2026-08' });
  assert.equal(v.ok, false);
  assert.match(v.problemes.join(' '), /hors de 2026-08/);
});

test('un journal conforme passe sans bruit', () => {
  const v = V.verifier(V.parser(journal([vente()])), { moisAttendu: '2026-08' });
  assert.deepEqual(v.problemes, []);
  assert.equal(v.ok, true);
});

test('un studio sans aucune vente ne rend pas le FICHIER fautif', () => {
  // On n'exige PAS les 6 studios ici : un studio peut n'avoir rien vendu. C'est
  // au KPI de dire « 0 / 0 », pas au contrôle de bloquer toute la collecte.
  const v = V.verifier(V.parser(journal([vente({ site: 'My Coach Neuilly' })])), { moisAttendu: '2026-08' });
  assert.equal(v.ok, true);
});

// ── VUE PAR CLÉS ────────────────────────────────────────────────────────────
test('la vue par nom cherche TOUS SITES et garde le site trouvé', () => {
  // Constaté en vrai : une vente portée par Marcq côté Fitness Booster était
  // enregistrée sur Wasquehal dans Deciplus. Restreindre au site du studio
  // l'aurait déclarée introuvable à tort.
  const p = V.parser(journal([vente({ adherent: 'TEIR Mustapha', site: 'My Coach Wasquehal' })]));
  const vue = V.vueParNom(p.lignes, R.clesContrat);
  const cles = vue.map((e) => e.cle);
  assert.ok(cles.includes('TEIR|MUSTAPHA'), 'la personne est trouvable par sa clé');
  assert.equal(vue[0].site, 'My Coach Wasquehal', 'le site est conservé pour pouvoir le DIRE');
});

test('une identité en trois mots donne toutes ses coupes candidates', () => {
  const p = V.parser(journal([vente({ adherent: 'MIQUELARD Marie Estelle' })]));
  const cles = new Set(V.vueParNom(p.lignes, R.clesContrat).map((e) => e.cle));
  assert.ok(cles.size > 1, 'on ne suppose pas où s\'arrête le nom');
  assert.ok([...cles].some((c) => /MIQUELARD/.test(c)));
});

// ── L'EXPORT RÉEL ───────────────────────────────────────────────────────────
test('export réel août 2026 : le journal des ventes est conforme', { skip: !dispo('2026-08') && 'CSV de ventes absent' }, () => {
  const p = V.parser(fs.readFileSync(csvDe('2026-08'), 'utf8'));
  const v = V.verifier(p, { moisAttendu: '2026-08' });
  assert.deepEqual(v.problemes, [], 'aucun problème sur un export réel');
  assert.ok(p.lignes.length > 3000, 'volumétrie plausible (lu : ' + p.lignes.length + ')');
  assert.equal(p.periode.du, '2026-08-01');
  assert.equal(p.periode.au, '2026-08-31');
});

test('export réel : chaque vente porte un numéro unique et un Id_client', { skip: !dispo('2026-08') && 'CSV de ventes absent' }, () => {
  const p = V.parser(fs.readFileSync(csvDe('2026-08'), 'utf8'));
  const nums = new Set(p.lignes.map((l) => l.numVente));
  assert.equal(nums.size, p.lignes.length, 'une ligne = une vente, jamais un éclatement');
  assert.equal(p.lignes.filter((l) => !l.idClient).length, 0, 'Id_client toujours renseigné');
});

test('export réel : des ventes à 0 € existent bel et bien — la preuve du besoin', { skip: !dispo('2026-08') && 'CSV de ventes absent' }, () => {
  const p = V.parser(fs.readFileSync(csvDe('2026-08'), 'utf8'));
  const differees = p.lignes.filter((l) => l.ttc === 0 && /diff/i.test(l.info));
  assert.ok(differees.length > 0,
    'si ce test tombe à zéro, c\'est que Deciplus a changé : ces ventes sont celles '
    + 'qu\'un journal d\'encaissements ne verrait JAMAIS');
});
