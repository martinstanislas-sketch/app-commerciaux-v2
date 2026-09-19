'use strict';
// ============================================================================
//  REMARQUES AUTOMATIQUES PERSONNALISÉES : clé stable dossier · mois · RÈGLE
//  (jamais le texte), version affichée ET copiée, retour à l'automatique,
//  historique, survie à une reformulation du registre.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const A = require('../lib/recap2RemarquesAuto.js');
const G = require('../public/recap2-regles.js');
const RR = require('../public/recap2-remarques.js');

const ID1 = '1700000000001x100000000000000001';
const ID2 = '1700000000002x100000000000000002';
const FLEX = G.PAR_ID['VNI-FLEX'].texte;
const flex = { statut: 'Flex à proposer', statutAuto: 'Flex à proposer', decision: null };
const vente = (o) => Object.assign({ client: 'Daouda Sy', date: '05/08/2026', prestation: 'Challenge', commercial: 'Marvin R.', commercialId: 'c1', retrouve: true,
  automatique: { alertes: [], regles: [] }, operationnel: { prelevement: 'ok', reservation: 'ko', resilie: 'ko', sources: {} } }, o);
const rapport = () => ({
  mois: '2026-08',
  studios: {
    Neuilly: {
      clientsRetrouves: { liste: [vente({}), vente({ date: '20/08/2026', prestation: 'Flex' })] }, nonReconduction: { liste: [] },
      vni: { liste: [
        { client: 'DUPONT Marie', contactId: ID1, commercial: 'Marvin R.', commercialId: 'c1', dateVenue: '12/08/2026', flex: Object.assign({}, flex) },
        { client: 'DUPONT Marie', contactId: ID2, commercial: 'Marvin R.', commercialId: 'c1', dateVenue: '14/08/2026', flex: Object.assign({}, flex) },
      ] },
    },
  },
});
const base = () => { const db = new Database(':memory:'); A.creerTable(db); return db; };
const lu = (db, r) => A.appliquer(r, A.versionsDuMois(db, '2026-08'));
const versionsVni = (l) => G.versions(G.actions(G.evaluerVni(l)), l);
const perso = (db, ligne, o) => A.enregistrer(db, Object.assign({ mois: '2026-08', studio: 'Neuilly', type: 'vni', ligne, regle: 'VNI-FLEX', texteAuto: FLEX, par: 'Stan' }, o));

test('la version personnalisée s’affiche à la place de l’automatique, l’origine reste lisible', () => {
  const db = base(); const r = rapport();
  perso(db, r.studios.Neuilly.vni.liste[0], { texte: 'Rappeler Marie mardi pour le Flex.' });
  const a = lu(db, r);
  const v = versionsVni(a.studios.Neuilly.vni.liste[0]);
  assert.deepEqual([v[0].regle, v[0].texte, v[0].origine, v[0].modifiee, v[0].modifiePar], ['VNI-FLEX', 'Rappeler Marie mardi pour le Flex.', FLEX, true, 'Stan']);
  assert.equal(versionsVni(a.studios.Neuilly.vni.liste[1])[0].texte, FLEX, 'un homonyme (autre contact Vendor) garde la version automatique');
});

test('le préfixe saisi à la main n’est jamais doublé', () => {
  const db = base(); const r = rapport();
  perso(db, r.studios.Neuilly.vni.liste[0], { texte: 'À faire : À faire : Rappeler Marie.' });
  const club = RR.remarquesClub(lu(db, r), 'Neuilly').texte;
  assert.match(club, /\nÀ faire : Rappeler Marie\.\n/);
  assert.equal((club.match(/À faire : À faire/g) || []).length, 0);
});

test('SURVIT À UNE REFORMULATION du registre : la clé est la règle, pas le texte', () => {
  const db = base(); const r = rapport();
  perso(db, r.studios.Neuilly.vni.liste[0], { texte: 'Rappeler Marie mardi.' });
  const ancien = G.PAR_ID['VNI-FLEX'].texte;
  try {
    G.PAR_ID['VNI-FLEX'].texte = 'Nouvelle formulation du registre.';
    const v = versionsVni(lu(db, r).studios.Neuilly.vni.liste[0]);
    assert.deepEqual([v[0].texte, v[0].origine], ['Rappeler Marie mardi.', 'Nouvelle formulation du registre.']);
  } finally { G.PAR_ID['VNI-FLEX'].texte = ancien; }
});

test('une autre règle qui produit la MÊME phrase ne récupère jamais la personnalisation', () => {
  const db = base(); const r = rapport();
  const v1 = r.studios.Neuilly.clientsRetrouves.liste[0];
  // VENTE-INTROUVABLE et VENTE-JAMAIS-CREE ont le même texte : deux règles distinctes.
  v1.retrouve = false;
  A.enregistrer(db, { mois: '2026-08', studio: 'Neuilly', type: 'vente', ligne: v1, regle: 'VENTE-INTROUVABLE', texte: 'Saisir la vente de Daouda.', par: 'Stan' });
  const a = lu(db, r);
  const l = a.studios.Neuilly.clientsRetrouves.liste[0];
  assert.equal(G.versions(G.actions(G.evaluerVente(l, { controle: true })), l)[0].texte, 'Saisir la vente de Daouda.');
  l.retrouve = true; l.automatique.alertes = [G.ALERTES_MOTEUR.JAMAIS_CREE];
  const v = G.versions(G.actions(G.evaluerVente(l, { controle: true })), l);
  assert.deepEqual([v[0].regle, v[0].texte, v[0].modifiee], ['VENTE-JAMAIS-CREE', 'Vérifie et complète la vente dans Deciplus.', false]);
});

test('deux ventes d’une même personne = deux dossiers : la personnalisation ne passe pas de l’une à l’autre, la copie garde les deux', () => {
  const db = base(); const r = rapport();
  A.enregistrer(db, { mois: '2026-08', studio: 'Neuilly', type: 'vente', ligne: r.studios.Neuilly.clientsRetrouves.liste[0], regle: 'VENTE-SEANCES', texte: 'Planifier ses séances du Challenge.', par: 'Stan' });
  const a = lu(db, r);
  const club = RR.remarquesClub(a, 'Neuilly').texte;
  assert.ok(club.includes('Daouda Sy — vente du 05/08/2026 · Challenge\nÀ faire : Planifier ses séances du Challenge.'));
  assert.ok(club.includes('Daouda Sy — vente du 20/08/2026 · Flex\nÀ faire : Contacte le client pour planifier ses prochaines séances.'), 'la deuxième vente n’est pas perdue');
  const com = RR.remarquesCommercial(a, 'id:c1', 'Marvin R.').texte;
  assert.equal((com.match(/Daouda Sy — vente du/g) || []).length, 2, 'copie commercial : les deux ventes');
});

test('les copies du club et du commercial reprennent la version affichée', () => {
  const db = base(); const r = rapport();
  perso(db, r.studios.Neuilly.vni.liste[0], { texte: 'Rappeler Marie mardi.' });
  r.studios.Neuilly.vni.liste[1].client = 'MARTIN Luc';
  const a = lu(db, r);
  const club = RR.remarquesClub(a, 'Neuilly');
  assert.match(club.texte, /Marie Dupont — VNI venu le 12\/08\/2026\nÀ faire : Rappeler Marie mardi\./);
  assert.equal((club.texte.match(/Propose au prospect/g) || []).length, 1, 'l’autre VNI garde la phrase automatique');
  assert.match(RR.remarquesCommercial(a, 'id:c1', 'Marvin R.').texte, /Rappeler Marie mardi\./);
});

test('revenir à la version automatique, et historique complet', () => {
  const db = base(); const r = rapport(); const ligne = r.studios.Neuilly.vni.liste[0];
  const ecrire = (texte, t) => A.enregistrer(db, { mois: '2026-08', studio: 'Neuilly', type: 'vni', ligne, regle: 'VNI-FLEX', texteAuto: FLEX, texte, par: 'Stan' }, t);
  ecrire('Version 1', '2026-09-18T10:00:00Z');
  ecrire('Version 2', '2026-09-18T10:01:00Z');
  assert.equal(ecrire('', '2026-09-18T10:02:00Z').texte, '');
  const v = versionsVni(lu(db, r).studios.Neuilly.vni.liste[0]);
  assert.deepEqual([v[0].texte, v[0].modifiee], [FLEX, false]);
  ecrire(FLEX, '2026-09-18T10:03:00Z'); // identique à l'automatique = rien à garder, rien à historiser
  assert.deepEqual(A.historique(db, '2026-08').map((h) => [h.regle, h.avant, h.apres]),
    [['VNI-FLEX', '', 'Version 1'], ['VNI-FLEX', 'Version 1', 'Version 2'], ['VNI-FLEX', 'Version 2', '']]);
});

test('une remarque que la règle ne produit plus ne s’affiche plus, même personnalisée', () => {
  const db = base(); const r = rapport();
  perso(db, r.studios.Neuilly.vni.liste[0], { texte: 'Rappeler Marie.' });
  const a = lu(db, r);
  a.studios.Neuilly.vni.liste[0].flex = { statut: 'Flex proposé', statutAuto: 'Flex proposé' };
  assert.deepEqual(versionsVni(a.studios.Neuilly.vni.liste[0]), []);
});

test('entrées refusées : mois, type, règle inconnue, alerte non personnalisable, longueur', () => {
  const db = base(); const ligne = rapport().studios.Neuilly.vni.liste[0];
  assert.throws(() => perso(db, ligne, { mois: '2026-13', texte: 'x' }), /mois/);
  assert.throws(() => perso(db, ligne, { type: 'inconnu', texte: 'x' }), /type/);
  assert.throws(() => perso(db, ligne, { regle: 'INVENTEE', texte: 'x' }), /personnalisable/);
  assert.throws(() => perso(db, ligne, { regle: 'FIN-IMPOSSIBLE', texte: 'x' }), /personnalisable/);
  assert.throws(() => perso(db, ligne, { texte: 'x'.repeat(1001) }), /trop longue/);
});
