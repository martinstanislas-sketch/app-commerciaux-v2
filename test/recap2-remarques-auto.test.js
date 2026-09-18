'use strict';
// ============================================================================
//  REMARQUES AUTOMATIQUES MODIFIABLES : origine gardée, version affichée ET
//  copiée, retour à l'automatique, historique.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const A = require('../lib/recap2RemarquesAuto.js');
const C = require('../public/recap2-conseils.js');
const RR = require('../public/recap2-remarques.js');

const ID1 = '1700000000001x100000000000000001';
const ID2 = '1700000000002x100000000000000002';
const FLEX = 'Propose au prospect le Challenge Flex à 4 séances par mois.';
const rapport = () => ({
  mois: '2026-08',
  studios: {
    Neuilly: {
      clientsRetrouves: { liste: [] }, nonReconduction: { liste: [] },
      vni: { liste: [
        { client: 'DUPONT Marie', contactId: ID1, commercial: 'Marvin R.', commercialId: 'c1', flex: { statut: 'Flex à proposer' } },
        { client: 'DUPONT Marie', contactId: ID2, commercial: 'Marvin R.', commercialId: 'c1', flex: { statut: 'Flex à proposer' } },
      ] },
    },
  },
});
const base = () => { const db = new Database(':memory:'); A.creerTable(db); return db; };
const lu = (db, r) => A.appliquer(r, A.versionsDuMois(db, '2026-08'));

test('la version modifiée s’affiche à la place de l’origine, qui reste gardée', () => {
  const db = base(); const r = rapport();
  const ligne = r.studios.Neuilly.vni.liste[0];
  A.enregistrer(db, { mois: '2026-08', studio: 'Neuilly', type: 'vni', ligne, texteAuto: FLEX, texte: 'Rappeler Marie mardi pour le Flex.', par: 'Stan' });
  const a = lu(db, r);
  const v = C.versions(C.conseilsVni(a.studios.Neuilly.vni.liste[0]), a.studios.Neuilly.vni.liste[0]);
  assert.equal(v[0].texte, 'Rappeler Marie mardi pour le Flex.');
  assert.equal(v[0].origine, FLEX);
  assert.equal(v[0].modifiee, true);
  assert.equal(v[0].modifiePar, 'Stan');
  const homonyme = C.versions(C.conseilsVni(a.studios.Neuilly.vni.liste[1]), a.studios.Neuilly.vni.liste[1]);
  assert.equal(homonyme[0].texte, FLEX, 'un homonyme (autre contact Vendor) garde la version automatique');
});

test('les copies du club et du commercial reprennent la version affichée', () => {
  const db = base(); const r = rapport();
  A.enregistrer(db, { mois: '2026-08', studio: 'Neuilly', type: 'vni', ligne: r.studios.Neuilly.vni.liste[0], texteAuto: FLEX, texte: 'Rappeler Marie mardi.', par: 'Stan' });
  r.studios.Neuilly.vni.liste[1].client = 'MARTIN Luc';
  const a = lu(db, r);
  const club = RR.remarquesClub(a, 'Neuilly');
  assert.match(club.texte, /Rappeler Marie mardi\./);
  assert.equal((club.texte.match(/Propose au prospect/g) || []).length, 1, 'l’autre VNI garde la phrase automatique');
  const com = RR.remarquesCommercial(a, 'id:c1', 'Marvin R.');
  assert.match(com.texte, /Rappeler Marie mardi\./);
});

test('revenir à la version automatique, et historique complet', () => {
  const db = base(); const r = rapport(); const ligne = r.studios.Neuilly.vni.liste[0];
  const ecrire = (texte, t) => A.enregistrer(db, { mois: '2026-08', studio: 'Neuilly', type: 'vni', ligne, texteAuto: FLEX, texte, par: 'Stan' }, t);
  ecrire('Version 1', '2026-09-18T10:00:00Z');
  ecrire('Version 2', '2026-09-18T10:01:00Z');
  const retour = ecrire('', '2026-09-18T10:02:00Z');
  assert.equal(retour.texte, '');
  const v = C.versions([FLEX], lu(db, r).studios.Neuilly.vni.liste[0]);
  assert.deepEqual([v[0].texte, v[0].modifiee], [FLEX, false]);
  ecrire(FLEX, '2026-09-18T10:03:00Z'); // identique à l'origine = rien à garder, rien à historiser
  assert.deepEqual(A.historique(db, '2026-08').map((h) => [h.avant, h.apres]),
    [['', 'Version 1'], ['Version 1', 'Version 2'], ['Version 2', '']]);
});

test('une remarque que la règle ne produit plus ne s’affiche plus, même modifiée', () => {
  const db = base(); const r = rapport();
  A.enregistrer(db, { mois: '2026-08', studio: 'Neuilly', type: 'vni', ligne: r.studios.Neuilly.vni.liste[0], texteAuto: FLEX, texte: 'Rappeler Marie.', par: 'Stan' });
  const a = lu(db, r);
  a.studios.Neuilly.vni.liste[0].flex = { statut: 'Flex proposé' };
  assert.deepEqual(C.versions(C.conseilsVni(a.studios.Neuilly.vni.liste[0]), a.studios.Neuilly.vni.liste[0]), []);
});

test('entrées refusées', () => {
  const db = base(); const ligne = rapport().studios.Neuilly.vni.liste[0];
  assert.throws(() => A.enregistrer(db, { mois: '2026-13', studio: 'Neuilly', type: 'vni', ligne, texteAuto: FLEX, texte: 'x' }), /mois/);
  assert.throws(() => A.enregistrer(db, { mois: '2026-08', studio: 'Neuilly', type: 'non_reconduit', ligne, texteAuto: FLEX, texte: 'x' }), /type/);
  assert.throws(() => A.enregistrer(db, { mois: '2026-08', studio: 'Neuilly', type: 'vni', ligne, texteAuto: '', texte: 'x' }), /origine/);
  assert.throws(() => A.enregistrer(db, { mois: '2026-08', studio: 'Neuilly', type: 'vni', ligne, texteAuto: FLEX, texte: 'x'.repeat(1001) }), /trop longue/);
});
