'use strict';
// ============================================================================
//  COPIER LES REMARQUES D'UN COMMERCIAL (public/recap2-remarques.js).
//  commercial + mois > studio > type > personne. Un non-reconduit n'y figure
//  que s'il est ATTRIBUÉ au commercial (voir recap2-nr-commercial.test.js).
// ============================================================================

const { test } = require('node:test');
const assert = require('node:assert/strict');
const RR = require('../public/recap2-remarques.js');

const THIBAULT = '1719949036540x783196276006537000', MARVIN = '1648915791594x308726414827915650';
const note = (t) => ({ note: { remarque: t, modifieLe: '2026-09-15T10:00:00Z', modifiePar: 'Stan' } });
const sansNote = { note: { remarque: '', modifieLe: '', modifiePar: '' } };
const vente = (o) => Object.assign({ client: 'X', date: '05/08/2026', commercial: 'Thibault P.', commercialId: THIBAULT, annulee: false, retrouve: true, idClient: '' }, sansNote, o);
const vni = (o) => Object.assign({ contactId: '1785603935735x7429716745549432' + String(Math.random()).slice(2, 4), idClient: '', client: 'Y', dateVenue: '12/08/2026', venues: 1,
  commercial: 'Thibault P.', commercialId: THIBAULT, statutVendor: 'Visiteur - Refus' }, sansNote, o);
const rapport = () => ({
  mois: '2026-08',
  studios: {
    Lille: { clientsRetrouves: { liste: [vente({ client: 'Autre Commercial', commercial: 'Fabian F.', commercialId: '1638283322062x610405598290114400' }, note('pas pour Thibault'))] },
      vni: { liste: [] }, nonReconduction: { liste: [] } },
    Levallois: {
      clientsRetrouves: { liste: [vente(Object.assign({ client: 'Jean Dupont' }, note('Client à rappeler concernant son démarrage.'))), vente({ client: 'Sans Remarque' })] },
      vni: { liste: [vni(Object.assign({ client: 'Sophie Martin' }, note('Hésite encore sur l\'engagement, relance prévue.'))),
        vni(Object.assign({ client: 'Chez Marvin', commercial: 'Marvin B.', commercialId: MARVIN }, note('pas pour Thibault')))] },
      // Un non-reconduit AU NOM identique à une vente de Thibault, avec remarque : jamais repris.
      nonReconduction: { liste: [Object.assign({ client: 'DUPONT Jean', idClient: '42001', netM1: 60, netM: 0 }, note('NR : ne doit pas sortir'))] },
    },
    Neuilly: {
      clientsRetrouves: { liste: [vente(Object.assign({ client: 'Paul Durand' }, note('Situation à vérifier.')))] },
      vni: { liste: [vni(Object.assign({ client: 'BERNARD Marie' }, note('À rappeler début septembre.')))] },
      nonReconduction: { liste: [] },
    },
  },
});

test('Thibault P. : studios puis types, uniquement les personnes à remarque, texte exact', () => {
  const r = RR.remarquesCommercial(rapport(), 'id:' + THIBAULT, 'Thibault P.');
  assert.equal(r.texte, [
    'THIBAULT P. — AOÛT 2026', '',
    'LEVALLOIS', '',
    'Ventes signées', '', 'Jean Dupont — vente du 05/08/2026', 'Client à rappeler concernant son démarrage.', '',
    'VNI', '', 'Sophie Martin — VNI venu le 12/08/2026', 'Hésite encore sur l\'engagement, relance prévue.', '',
    'NEUILLY', '',
    'Ventes signées', '', 'Paul Durand — vente du 05/08/2026', 'Situation à vérifier.', '',
    'VNI', '', 'Marie Bernard — VNI venu le 12/08/2026', 'À rappeler début septembre.', '',
  ].join('\n'));
  assert.deepEqual([r.nb, r.studios, r.categories], [4, ['Levallois', 'Neuilly'], ['Ventes signées', 'VNI']]);
  assert.ok(!/Sans Remarque|Chez Marvin|Autre Commercial|LILLE/.test(r.texte + r.html));
  assert.match(r.html, /<b><u>LEVALLOIS<\/u><\/b>/);
});

test('non-reconduit NON ATTRIBUÉ jamais inclus, même avec remarque et nom identique à une vente du commercial', () => {
  const r = RR.remarquesCommercial(rapport(), 'id:' + THIBAULT, 'Thibault P.');
  assert.ok(!/Clients non reconduits|NR : ne doit pas sortir/.test(r.texte + r.html));
});

test('une catégorie ou un studio sans remarque n\'apparaît pas', () => {
  const x = rapport();
  x.studios.Neuilly.vni.liste[0].note.remarque = '';
  x.studios.Levallois.clientsRetrouves.liste[0].note.remarque = '';
  x.studios.Levallois.vni.liste[0].note.remarque = '';
  const r = RR.remarquesCommercial(x, 'id:' + THIBAULT, 'Thibault P.');
  assert.equal(r.texte, 'THIBAULT P. — AOÛT 2026\n\nNEUILLY\n\nVentes signées\n\nPaul Durand — vente du 05/08/2026\nSituation à vérifier.\n');
});

test('aucune remarque -> nb 0, rien à copier ; clé vide -> rien', () => {
  assert.deepEqual(RR.remarquesCommercial(rapport(), 'id:1111111111111x2222222222222222', 'Personne').nb, 0);
  assert.deepEqual(RR.remarquesCommercial(rapport(), '', 'Personne'), { nb: 0, texte: '', html: '', studios: [], categories: [] });
});

test('vente sans identifiant Vendor : clé « nom: » exacte, comme la vue commerciale ; jamais un VNI par nom', () => {
  const x = rapport();
  x.studios.Lille.clientsRetrouves.liste.push(vente(Object.assign({ client: 'Hors Vendor', commercial: 'Pas de commercial', commercialId: '' }, note('sans id'))));
  x.studios.Lille.vni.liste.push(vni(Object.assign({ client: 'VNI sans id', commercial: 'Pas de commercial', commercialId: '' }, note('ne sort pas'))));
  const r = RR.remarquesCommercial(x, 'nom:Pas de commercial', 'Pas de commercial');
  assert.equal(r.texte, 'PAS DE COMMERCIAL — AOÛT 2026\n\nLILLE\n\nVentes signées\n\nHors Vendor — vente du 05/08/2026\nsans id\n');
});

test('la copie du club reste inchangée (3 sections)', () => {
  const c = RR.remarquesClub(rapport(), 'Levallois');
  assert.match(c.texte, /Ventes signées[\s\S]*Clients non reconduits[\s\S]*VNI/);
  assert.match(c.texte, /Chez Marvin/);
});
