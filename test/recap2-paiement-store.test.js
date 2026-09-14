'use strict';
// ============================================================================
//  LE MAGASIN ET LES DEUX NOUVEAUX CHAMPS D'UNE LIGNE :
//   · `paiement` (fenêtre de 31 jours) — seulement sur une vente retrouvée ;
//   · `ficheId/ficheNom/ficheSite` — seulement sur un « à vérifier » sans piste.
//  Et la preuve qu'ils ne changent AUCUN compteur.
// ============================================================================

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'recap2-pai-'));
const S = require('../lib/recap2Store.js');
const Mat = require('../lib/recap2Matches.js');

const muriel = () => ({ client: 'Muriel Darmon', date: '28/08/2026', prestation: 'Challenge 12 mois', commercial: 'Fabian F.',
  annulee: false, dateAnnulation: '', retrouve: true, site: 'My Coach Vieux Lille', dateVente: '28/08/2026', idClient: '42321', encaisse: true,
  paiement: { etat: 'encaisse', premier: '02/09/2026', finFenetre: '28/09/2026', couvertJusquau: '13/09/2026' } });
const esther = () => ({ client: 'Esther Jhureea', date: '24/08/2026', prestation: 'Challenge', commercial: 'Magali G.',
  annulee: false, dateAnnulation: '', retrouve: false, site: '', dateVente: '', idClient: '', encaisse: false,
  ficheId: '42350', ficheNom: 'JHUREEA Esther', ficheSite: 'My Coach Wasquehal' });
const studio = (nom, liste) => ({
  studio: nom,
  nonReconduction: { base: 4, nonReconduits: 1, taux: 0.25, tauxPct: 25, liste: [{ client: 'DUPONT Marie', netM1: 60, netM: 0 }] },
  clientsRetrouves: {
    ventesSignees: liste.length, annulees: 0, annulesExclus: 0, ventesActives: liste.length, ventesValides: liste.length,
    signataires: liste.length, retrouves: liste.filter((l) => l.retrouve).length,
    taux: liste.filter((l) => l.retrouve).length / liste.length, tauxPct: +(100 * liste.filter((l) => l.retrouve).length / liste.length).toFixed(1),
    paiements: { encaisse: 1, attendu: 0, aucun: 0, indetermine: 0 },
    liste,
  },
  avertissements: [], controleBloquant: { ok: true, detail: {} },
});
const rapport = (liste = [muriel(), esther()]) => ({
  businessVersion: 2, genere: '2026-09-14T10:00:00.000Z', mois: '2026-08', m1: '2026-07',
  source: { fitnessBooster: {}, paiements: { fenetreJours: 31, moisLus: ['2026-08', '2026-09'], couvertDu: '01/08/2026', couvertJusquau: '13/09/2026' } },
  studios: Object.fromEntries(S.LABELS.map((s) => [s, studio(s, liste.map((l) => JSON.parse(JSON.stringify(l))))])),
  journal: [], erreurs: [],
});
const problemes = (r) => S.valider(r, '2026-08').problemes.join(' | ');

test('un rapport avec paiement et fiche trouvée passe la validation', () => {
  assert.deepEqual(S.valider(rapport(), '2026-08').problemes, []);
});

test('paiement refusé ailleurs que sur une vente retrouvée, ou incohérent', () => {
  let r = rapport(); r.studios.Lille.clientsRetrouves.liste[1].paiement = { etat: 'attendu', premier: '', finFenetre: '24/09/2026', couvertJusquau: '' };
  assert.match(problemes(r), /n'a de sens que sur une vente retrouvée/);
  r = rapport(); r.studios.Lille.clientsRetrouves.liste[0].paiement.etat = 'peut-etre';
  assert.match(problemes(r), /paiement\.etat/);
  r = rapport(); r.studios.Lille.clientsRetrouves.liste[0].encaisse = false;
  assert.match(problemes(r), /contredit le statut de paiement/);
  r = rapport(); r.studios.Lille.clientsRetrouves.liste[0].paiement.premier = '';
  assert.match(problemes(r), /premier encaissement attendue/);
});

test('fiche trouvée refusée sur un client retrouvé, un candidat, ou avec un id bricolé', () => {
  let r = rapport(); Object.assign(r.studios.Lille.clientsRetrouves.liste[0], { ficheId: '1' });
  assert.match(problemes(r), /une fiche trouvée n'a de sens/);
  r = rapport(); r.studios.Lille.clientsRetrouves.liste[1].ficheId = '42350; DROP';
  assert.match(problemes(r), /n'est pas un Id_client/);
});

test('nettoyer : garde paiement et fiche là où ils ont un sens, les efface ailleurs', () => {
  const r = rapport();
  const intrus = r.studios.Lille.clientsRetrouves.liste[1];
  intrus.paiement = { etat: 'aucun', premier: '', finFenetre: '', couvertJusquau: '' };   // sur un « à vérifier »
  r.studios.Lille.clientsRetrouves.liste[0].ficheId = '999';                               // sur un retrouvé
  const n = S.nettoyer(r).studios.Lille.clientsRetrouves.liste;
  assert.deepEqual(n[0].paiement, { etat: 'encaisse', premier: '02/09/2026', finFenetre: '28/09/2026', couvertJusquau: '13/09/2026' });
  assert.equal(n[0].ficheId, undefined, 'pas de fiche « trouvée » sur un client retrouvé');
  assert.equal(n[1].paiement, undefined, 'pas de paiement sur un « à vérifier »');
  assert.equal(n[1].ficheId, '42350');
  assert.equal(n[1].retrouve, false, 'la fiche trouvée ne change pas le statut');
  assert.deepEqual(S.nettoyer(r).studios.Lille.clientsRetrouves.paiements, { encaisse: 1, attendu: 0, aucun: 0, indetermine: 0 });
});

test('AUCUN compteur ne dépend du paiement ni de la fiche', () => {
  const avec = rapport();
  const sans = rapport([Object.assign(muriel(), { paiement: undefined }), Object.assign(esther(), { ficheId: undefined, ficheNom: undefined, ficheSite: undefined })]);
  ['signataires', 'retrouves', 'taux', 'tauxPct', 'ventesSignees', 'ventesActives'].forEach((k) => {
    assert.equal(avec.studios.Lille.clientsRetrouves[k], sans.studios.Lille.clientsRetrouves[k], k);
  });
});

test('une confirmation de rapprochement efface une fiche trouvée devenue sans objet', () => {
  const r = rapport();
  const d = new Map([[Mat.cleDe({ client: 'Esther Jhureea' }), { confirme: { id_client: '42350', nom_deciplus: 'JHUREEA Esther', decide_le: 'x' }, refuses: [] }]]);
  const l = Mat.appliquer(r, d).studios.Lille.clientsRetrouves.liste[1];
  assert.equal(l.retrouve, true);
  assert.equal(l.ficheId, undefined);
});
