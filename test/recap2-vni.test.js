'use strict';
// ============================================================================
//  VNI — LA RÈGLE RÉTROACTIVE (lib/recap2Vni.js), LE VALIDATEUR DU RAPPORT,
//  LES REMARQUES DE TYPE vni et LA COPIE DU CLUB. Sans serveur.
// ============================================================================

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const V = require('../lib/recap2Vni.js');
const S = require('../lib/recap2Store.js');
const N = require('../lib/recap2Notes.js');
const RR = require('../public/recap2-remarques.js');
const MM = require('../public/recap2-metrics.js');

const SOPHIE = '1785603935735x742971674554943200', PAUL = '1785603935735x742971674554943201', HOMONYME = '1785603935735x742971674554943202';
const FABIAN = '1648915791594x308726414827915650';
const ligne = (o) => Object.assign({ contactId: SOPHIE, idClient: '', client: 'Sophie Martin', dateVenue: '12/08/2026', venues: 1,
  commercial: 'Fabian F.', commercialId: FABIAN, statutVendor: 'Visiteur - En réflexion' }, o);
const rapport = (liste = [ligne({}), ligne({ contactId: PAUL, idClient: '42001', client: 'Paul Durand', dateVenue: '20/08/2026' })], transformations = []) => ({
  businessVersion: 2, genere: '2026-09-15T10:00:00.000Z', mois: '2026-08', m1: '2026-07', transformations,
  studios: { Lille: { studio: 'Lille', nonReconduction: { base: 10, nonReconduits: 1, taux: 0.1, tauxPct: 10, liste: [] },
    vni: { visiteurs: 5, tuileVisiteurs: 5, venus: 4, transformes: 4 - liste.length, liste } } },
});

// ── LA RÈGLE ────────────────────────────────────────────────────────────────
test('Sophie, VNI d\'août, signe en octobre -> elle disparaît d\'août, Paul reste', () => {
  const aout = rapport();
  const octobre = { genere: '2026-11-02T09:00:00.000Z', transformations: [{ contactId: SOPHIE, idClient: '', date: '14/10/2026', source: 'fb-contrat' }] };
  const connues = V.lireTous({ lister: () => ['2026-08', '2026-10'], lire: (m) => (m === '2026-08' ? aout : octobre) });
  const affiche = V.appliquer(aout, connues.index, { connuesJusquau: connues.connuesJusquau });
  const v = affiche.studios.Lille.vni;
  assert.deepEqual(v.liste.map((l) => l.client), ['Paul Durand']);
  assert.deepEqual([v.historique, v.retires, v.transformesDepuis[0].transformeLe, v.transformesDepuis[0].source], [2, 1, '14/10/2026', 'fb-contrat']);
  assert.equal(v.transformationsConnuesJusquau, '02/11/2026');
  assert.equal(aout.studios.Lille.vni.liste.length, 2, 'le rapport d\'août lui-même n\'est jamais modifié');
});

test('par Id Deciplus aussi (autre fiche, autre club) ; une transformation AVANT la venue ne compte pas', () => {
  const idx = V.indexer([{ contactId: '', idClient: '42001', date: '21/08/2026', source: 'deciplus-vente' },
    { contactId: SOPHIE, idClient: '', date: '11/08/2026', source: 'vendor-statut-actuel' }]);
  const v = V.appliquer(rapport(), idx).studios.Lille.vni;
  assert.deepEqual(v.liste.map((l) => l.client), ['Sophie Martin'], 'Paul retiré par son Id Deciplus ; Sophie reste (11/08 < venue du 12/08)');
});

test('le même jour que la venue = après ; un homonyme (autre identifiant) ne retire personne', () => {
  const idx = V.indexer([{ contactId: HOMONYME, idClient: '', date: '30/08/2026', source: 'vendor-statut' },
    { contactId: PAUL, idClient: '', date: '20/08/2026', source: 'vendor-vente' }]);
  assert.deepEqual(V.appliquer(rapport(), idx).studios.Lille.vni.liste.map((l) => l.client), ['Sophie Martin']);
});

test('compacter : une entrée par identifiant (la plus récente), sources et formats contrôlés, historique borné', () => {
  const c = V.compacter([
    { contactId: SOPHIE, idClient: '', date: '01/09/2026', source: 'vendor-statut' },
    { contactId: SOPHIE, idClient: '', date: '03/10/2026', source: 'fb-contrat' },
    { contactId: 'Sophie Martin', idClient: '', date: '03/10/2026', source: 'fb-contrat' },
    { contactId: '', idClient: '42001', date: '31/02/2026', source: 'deciplus-vente' },
    { contactId: '', idClient: '42002', date: '05/09/2026', source: 'inventee' },
    { contactId: '', idClient: '42003', date: '05/01/2025', source: 'deciplus-vente' },
  ], { depuis: '01/08/2025' });
  assert.deepEqual(c, [{ contactId: SOPHIE, idClient: '', date: '03/10/2026', source: 'fb-contrat' }]);
});

test('appliquer ne touche QUE le bloc vni ; un rapport sans vni passe tel quel', () => {
  const r = rapport();
  const avant = JSON.parse(JSON.stringify(r));
  const out = V.appliquer(r, V.indexer([{ contactId: SOPHIE, idClient: '', date: '01/09/2026', source: 'vendor-statut' }]));
  delete out.studios.Lille.vni; delete avant.studios.Lille.vni;
  assert.deepEqual(out, avant);
  const sansVni = { mois: '2026-06', studios: { Lille: { studio: 'Lille' } } };
  assert.deepEqual(V.appliquer(sansVni, new Map()), sansVni);
});

// ── LE VALIDATEUR DU RAPPORT ───────────────────────────────────────────────
const erreurs = (r) => { const v = S.valider(r, '2026-08'); return v.problemes.filter((p) => /vni|transformations/.test(p)); };
const complet = () => {
  const r = rapport();
  S.LABELS.forEach((s) => { if (!r.studios[s]) r.studios[s] = { studio: s, vni: { echec: 'lecture Vendor indisponible' } }; });
  r.transformations = [{ contactId: SOPHIE, idClient: '', date: '14/10/2026', source: 'fb-contrat' }, { contactId: '', idClient: '42001', date: '21/08/2026', source: 'deciplus-vente' }];
  return r;
};
test('validateur : bloc vni et transformations conformes acceptés', () => {
  assert.deepEqual(erreurs(complet()), []);
});
test('validateur : refuse clé inattendue, nom dans une transformation, source inconnue, incohérence de comptes', () => {
  const r = complet();
  r.transformations.push({ contactId: SOPHIE, idClient: '', date: '14/10/2026', source: 'fb-contrat', client: 'Sophie Martin' });
  r.transformations.push({ contactId: '', idClient: '', date: '14/10/2026', source: 'fb-contrat' });
  r.transformations.push({ contactId: SOPHIE, idClient: '', date: '14/10/2026', source: 'au-pif' });
  r.studios.Lille.vni.liste[0].email = 'x@y.z';
  r.studios.Lille.vni.venus = 9;
  r.studios.Lille.vni.tuileVisiteurs = 4;
  const e = erreurs(r).join(' | ');
  assert.match(e, /transformations\[2\] : clés inattendues : client/);
  assert.match(e, /transformations\[3\] : identifiant Vendor ou Deciplus attendu/);
  assert.match(e, /transformations\[4\]\.source : inconnue/);
  assert.match(e, /liste\[0\] : clés inattendues : email/);
  assert.match(e, /2 VNI pour 9 venus/);
  assert.match(e, /visiteurs reconstitués ≠ tuile Vendor/);
});
test('nettoyer : ne garde que les champs connus', () => {
  const r = complet();
  r.transformations[0].client = 'Sophie Martin';
  r.studios.Lille.vni.liste[0].email = 'x@y.z';
  const p = S.nettoyer(r);
  assert.equal(p.transformations[0].client, undefined);
  assert.equal(p.studios.Lille.vni.liste[0].email, undefined);
  assert.equal(p.studios.Lille.vni.liste[0].venues, 1);
});

// ── LES REMARQUES vni ──────────────────────────────────────────────────────
const baseNeuve = () => { const d = new Database(':memory:'); N.creerTable(d); return d; };
const poser = (db, o) => N.enregistrer(db, Object.assign({ mois: '2026-08', studio: 'Lille', type: 'vni', client: 'Sophie Martin', idClient: '', idVendor: SOPHIE, par: 'Stan' }, o));
const lireNotes = (db, r) => N.appliquer(r, N.notesDuMois(db, r.mois));

test('remarque vni : clé contact Vendor, homonyme non concerné, conservée en base après disparition', () => {
  const db = baseNeuve();
  poser(db, { remarque: 'Hésite sur le tarif, à rappeler.' });
  const avecHomonyme = rapport([ligne({}), ligne({ contactId: HOMONYME })]);
  const l = lireNotes(db, avecHomonyme).studios.Lille.vni.liste;
  assert.deepEqual(l.map((x) => x.note.remarque), ['Hésite sur le tarif, à rappeler.', ''], 'l\'homonyme n\'hérite pas de la remarque');
  assert.equal(db.prepare("SELECT cle_personne FROM recap2_notes").get().cle_personne, 'vendor:' + SOPHIE);
  // Sophie signe : elle disparaît de la liste active… mais sa remarque reste en base.
  const actif = V.appliquer(rapport(), V.indexer([{ contactId: SOPHIE, idClient: '', date: '14/10/2026', source: 'fb-contrat' }]));
  assert.equal(lireNotes(db, actif).studios.Lille.vni.liste.some((x) => x.contactId === SOPHIE), false);
  assert.equal(db.prepare("SELECT remarque FROM recap2_notes WHERE type = 'vni'").get().remarque, 'Hésite sur le tarif, à rappeler.');
  assert.equal(N.ligneDe(actif, { studio: 'Lille', type: 'vni', client: 'Sophie Martin', idVendor: SOPHIE }), null, 'plus de remarque possible sur un VNI retiré');
});

test('remarque vni : Id Deciplus prioritaire ; types séparés (même personne en non-reconduit)', () => {
  const db = baseNeuve();
  poser(db, { client: 'Paul Durand', idClient: '42001', idVendor: PAUL, remarque: 'VNI' });
  const r = rapport();
  r.studios.Lille.nonReconduction.liste = [{ client: 'DURAND Paul', idClient: '42001', netM1: 50, netM: 0 }];
  const out = lireNotes(db, r).studios.Lille;
  assert.equal(out.vni.liste.find((x) => x.contactId === PAUL).note.remarque, 'VNI');
  assert.equal(out.nonReconduction.liste[0].note.remarque, '', 'le type sépare les contextes');
});

test('copie du club : section « VNI » après les deux autres, seulement les personnes à remarque', () => {
  const db = baseNeuve();
  poser(db, { remarque: 'Hésite sur le tarif, à rappeler.' });
  const r = lireNotes(db, rapport());
  const c = RR.remarquesClub(r, 'Lille');
  assert.equal(c.texte, 'LILLE — AOÛT 2026\n\nVNI\n\nSophie Martin\nHésite sur le tarif, à rappeler.\n');
  assert.ok(!/Paul/.test(c.texte + c.html));
});

// ── LA VUE PAR COMMERCIAL ──────────────────────────────────────────────────
test('consolidation : VNI du commercial par identifiant, studios, sélecteur', () => {
  const r = rapport();
  r.studios.Marcq = { studio: 'Marcq', vni: { visiteurs: 1, tuileVisiteurs: 1, venus: 1, transformes: 0, liste: [ligne({ contactId: HOMONYME, client: 'Jean Dupont' })] } };
  r.studios.Neuilly = { studio: 'Neuilly', vni: { echec: 'tuile illisible' } };
  const d = MM.consoliderCommercial(r, 'id:' + FABIAN);
  assert.deepEqual([d.vni.length, d.vniPresents, d.studios.join(','), d.vniIndisponibles.map((x) => x.studio).join()], [3, true, 'Lille,Marcq', 'Neuilly']);
  const sel = MM.commerciauxDuRapport(r).find((c) => c.cle === 'id:' + FABIAN);
  assert.deepEqual([sel.vni, sel.commercial], [3, 'Fabian F.']);
});
