'use strict';
// ============================================================================
//  COMMERCIAL RESPONSABLE D'UN CLIENT NON RECONDUIT — règles pures.
//
//  · vendeur d'origine = PREMIÈRE vente Deciplus à vendeur, par Id_client seul ;
//  · passage vendeur Deciplus -> commercial RECAP 2 par table EXACTE ;
//  · le choix manuel l'emporte, « Non attribué » compris ;
//  · « Copier les remarques du commercial » suit l'attribution effective ;
//    « Copier les remarques du club » ne change pas ;
//  · le dépôt accepte et conserve `vendeurOrigine`, rien d'autre.
// ============================================================================

const { test } = require('node:test');
const assert = require('node:assert/strict');
const O = require('../crm-automation/lib/vendeurOrigine.js');
const M = require('../public/recap2-metrics.js');
const RR = require('../public/recap2-remarques.js');
const S = require('../lib/recap2Store.js');

const THIBAULT = '1782814078367x500550143389292000';
const LUCA = '1674481440746x588221726139669400';
const vte = (o) => Object.assign({ numVente: '1', date: '10/03/2025', adherent: 'X', prestation: 'Challenge 12 mois IDF', vendeur: '', site: 'My Coach Levallois Perret', idClient: '100' }, o);

// ── VENDEUR D'ORIGINE ──────────────────────────────────────────────────────
test('fenêtre de 24 mois : de 2024-09 à 2026-08', () => {
  const f = O.moisGlissants('2026-08', 24);
  assert.equal(f.length, 24);
  assert.deepEqual([f[0], f[23]], ['2024-09', '2026-08']);
});

test('première vente À VENDEUR : les lignes sans vendeur sont ignorées, la plus ancienne gagne', () => {
  const index = O.indexer([
    vte({ numVente: '9', date: '02/01/2025', vendeur: '' }),                    // plus ancienne mais sans vendeur
    vte({ numVente: '20', date: '15/06/2026', vendeur: 'Luca ROELOFFZEN' }),     // renouvellement
    vte({ numVente: '12', date: '10/03/2025', vendeur: 'Thibault Preguica' }),   // signature d'origine
  ]);
  assert.deepEqual(O.origineDe(index, '100'), { vendeur: 'Thibault Preguica', date: '10/03/2025', numVente: '12', prestation: 'Challenge 12 mois IDF', site: 'My Coach Levallois Perret' });
});

test('même jour, même vendeur sur plusieurs lignes : la plus petite n° de vente ; vendeurs différents : ambigu', () => {
  const memes = O.indexer([vte({ numVente: '105', vendeur: 'Fabian FERNEZ', prestation: 'Pack' }), vte({ numVente: '104', vendeur: 'Fabian FERNEZ' })]);
  assert.equal(O.origineDe(memes, '100').numVente, '104');
  const deux = O.indexer([vte({ vendeur: 'Fabian FERNEZ' }), vte({ numVente: '2', vendeur: 'Marvin BOULLIGNY' })]);
  assert.deepEqual(O.origineDe(deux, '100'), { ambigu: true, vendeurs: ['Fabian FERNEZ', 'Marvin BOULLIGNY'], date: '10/03/2025' });
});

test('uniquement par Id_client : un homonyme d\'un autre Id ne prête jamais son vendeur', () => {
  const index = O.indexer([vte({ adherent: 'DUPONT Jean', idClient: '200', vendeur: 'Fabian FERNEZ' })]);
  assert.deepEqual(O.origineDe(index, '100'), { introuvable: true });
  assert.deepEqual(O.origineDe(index, ''), { introuvable: true });
});

test('poser() ne touche qu\'au champ vendeurOrigine : compteurs et listes intacts', () => {
  const r = { mois: '2026-08', source: {}, studios: { Levallois: { nonReconduction: { base: 10, nonReconduits: 2, taux: 0.2, tauxPct: 20,
    liste: [{ client: 'A B', idClient: '100', netM1: 50, netM: 0 }, { client: 'C D', netM1: 20, netM: 0 }] } } } };
  const avant = JSON.stringify(r.studios.Levallois.nonReconduction, (k, v) => (k === 'vendeurOrigine' ? undefined : v));
  O.poser(r, O.indexer([vte({ vendeur: 'Thibault Preguica' })]), { du: '2024-09', au: '2026-08', moisLus: 24, manquants: [] });
  const nr = r.studios.Levallois.nonReconduction;
  assert.equal(JSON.stringify(nr, (k, v) => (k === 'vendeurOrigine' ? undefined : v)), avant);
  assert.equal(nr.liste[0].vendeurOrigine.vendeur, 'Thibault Preguica');
  assert.equal(nr.liste[1].vendeurOrigine, undefined, 'sans Id_client : rien de posé');
  assert.equal(r.source.deciplus_ventes_historique.moisLus, 24);
});

// ── TABLE EXPLICITE ET PRIORITÉS ───────────────────────────────────────────
test('table exacte : casse et espaces neutralisés, rien d\'autre', () => {
  assert.equal(M.commercialDuVendeurDeciplus('thibault  PREGUICA').cle, 'id:' + THIBAULT);
  assert.equal(M.commercialDuVendeurDeciplus('Cédric HADDOU').nom, 'Cédric H.');
  for (const v of ['magali', 'Thibault', 'STAN MULTI-SITES', 'STAN', 'Ginkgo', 'Admin Tours', 'Raphael Silva', 'Thibault Preguica-X', 'Cedric HADDOU']) {
    assert.equal(M.commercialDuVendeurDeciplus(v), null, v + ' ne doit pas être attribué');
  }
});

test('attribution : auto par la table, sinon Non attribué avec le vendeur Deciplus en motif', () => {
  const auto = M.attributionNonReconduit({ vendeurOrigine: { vendeur: 'Thibault Preguica', date: '10/03/2025', numVente: '12', prestation: 'Challenge 12 mois IDF' } });
  assert.deepEqual([auto.mode, auto.cle, auto.nom], ['auto', 'id:' + THIBAULT, 'Thibault P.']);
  assert.match(auto.motif, /n°12 du 10\/03\/2025/);
  const hors = M.attributionNonReconduit({ vendeurOrigine: { vendeur: 'STAN MULTI-SITES', date: '01/02/2025' } });
  assert.deepEqual([hors.mode, hors.cle], ['aucun', '']);
  assert.match(hors.motif, /STAN MULTI-SITES.*absent de la table/);
  assert.equal(M.attributionNonReconduit({ vendeurOrigine: { introuvable: true } }).cle, '');
  assert.equal(M.attributionNonReconduit({ vendeurOrigine: { ambigu: true, vendeurs: ['A', 'B'], date: '01/01/2025' } }).cle, '');
  assert.match(M.attributionNonReconduit({ idClient: '100' }).motif, /non collecté/);
  assert.match(M.attributionNonReconduit({}).motif, /ne porte pas l'Id membre Deciplus/, 'rapport ancien sans Id : la cause est dite');
});

test('le choix manuel l\'emporte — un autre commercial comme « Non attribué »', () => {
  const vo = { vendeur: 'Thibault Preguica', date: '10/03/2025' };
  const versLuca = M.attributionNonReconduit({ vendeurOrigine: vo, attribution: { manuel: true, cle: 'id:' + LUCA, nom: 'Luca R.', modifiePar: 'Stan' } });
  assert.deepEqual([versLuca.mode, versLuca.cle, versLuca.nom, versLuca.auto.nom], ['manuel', 'id:' + LUCA, 'Luca R.', 'Thibault P.']);
  const personne = M.attributionNonReconduit({ vendeurOrigine: vo, attribution: { manuel: true, cle: '', nom: '' } });
  assert.deepEqual([personne.mode, personne.cle], ['manuel', '']);
});

test('un commercial responsable seulement de non-reconduits est choisissable', () => {
  const r = { mois: '2026-08', studios: { Levallois: { nonReconduction: { liste: [{ client: 'A B', idClient: '100', netM1: 1, netM: 0, vendeurOrigine: { vendeur: 'Cédric HADDOU', date: '01/01/2025' } }] } } } };
  const c = M.commerciauxDuRapport(r);
  assert.deepEqual(c.map((x) => [x.commercial, x.nonReconduits, x.ventes]), [['Cédric H.', 1, 0]]);
  assert.ok(M.commerciauxAttribuables(r).some((x) => x.nom === 'Luca R.'), 'la table reste proposable');
});

// ── COPIER LES REMARQUES ───────────────────────────────────────────────────
const note = (t) => ({ note: { remarque: t, modifieLe: '2026-09-15T10:00:00Z', modifiePar: 'Stan' } });
const rapportCopie = () => ({
  mois: '2026-08',
  studios: {
    Levallois: {
      clientsRetrouves: { liste: [Object.assign({ client: 'Jean Dupont', commercial: 'Thibault P.', commercialId: THIBAULT, retrouve: true }, note('Vente à suivre.'))] },
      nonReconduction: { liste: [
        Object.assign({ client: 'AMIEL Anais', idClient: '100', netM1: 60, netM: 0, vendeurOrigine: { vendeur: 'Thibault Preguica', date: '10/03/2025', numVente: '12' } }, note('Cliente contactée, retour prévu.')),
        Object.assign({ client: 'SANS Remarque', idClient: '101', netM1: 60, netM: 0, vendeurOrigine: { vendeur: 'Thibault Preguica', date: '10/03/2025' } }),
        Object.assign({ client: 'GENERIQUE Compte', idClient: '102', netM1: 60, netM: 0, vendeurOrigine: { vendeur: 'STAN MULTI-SITES', date: '10/03/2025' } }, note('Non attribuée.')),
      ] },
      vni: { liste: [Object.assign({ contactId: '1785603935735x742971674554943201', client: 'Sophie Martin', commercial: 'Thibault P.', commercialId: THIBAULT }, note('Relance.'))] },
    },
  },
});

test('commercial : « Clients non reconduits » entre les ventes et les VNI, texte exact', () => {
  const r = RR.remarquesCommercial(rapportCopie(), 'id:' + THIBAULT, 'Thibault P.');
  assert.equal(r.texte, [
    'THIBAULT P. — AOÛT 2026', '',
    'LEVALLOIS', '',
    'Ventes signées', '', 'Jean Dupont', 'Vente à suivre.', '',
    'Clients non reconduits', '', 'Anais Amiel', 'Cliente contactée, retour prévu.', '',
    'VNI', '', 'Sophie Martin', 'Relance.', '',
  ].join('\n'));
  assert.ok(!/SANS|Remarque|Generique|GENERIQUE|Non attribuée/.test(r.texte + r.html));
});

test('réattribution Thibault -> Luca : la remarque quitte l\'un et rejoint l\'autre', () => {
  const x = rapportCopie();
  x.studios.Levallois.nonReconduction.liste[0].attribution = { manuel: true, cle: 'id:' + LUCA, nom: 'Luca R.' };
  assert.ok(!/Anais Amiel/.test(RR.remarquesCommercial(x, 'id:' + THIBAULT, 'Thibault P.').texte));
  assert.equal(RR.remarquesCommercial(x, 'id:' + LUCA, 'Luca R.').texte, [
    'LUCA R. — AOÛT 2026', '', 'LEVALLOIS', '', 'Clients non reconduits', '', 'Anais Amiel', 'Cliente contactée, retour prévu.', '',
  ].join('\n'));
});

test('club : inchangé, tous les non-reconduits à remarque quel que soit leur commercial', () => {
  const x = rapportCopie();
  x.studios.Levallois.nonReconduction.liste[0].attribution = { manuel: true, cle: 'id:' + LUCA, nom: 'Luca R.' };
  const t = RR.remarquesClub(x, 'Levallois').texte;
  assert.match(t, /Clients non reconduits\n\nAnais Amiel\nCliente contactée, retour prévu\.\n\nCompte Generique\nNon attribuée\./);
});

// ── DÉPÔT ──────────────────────────────────────────────────────────────────
test('dépôt : vendeurOrigine validé et conservé ; forme inconnue refusée', () => {
  const r = { businessVersion: 2, genere: '2026-09-15T16:43:00Z', mois: '2026-08', m1: '2026-07',
    source: { deciplus_ventes_historique: { du: '2024-09', au: '2026-08', moisLus: 24, manquants: [], lignes: 1, regle: 'premiere_vente_avec_vendeur' } },
    studios: Object.fromEntries(S.LABELS.map((s) => [s, { studio: s,
      nonReconduction: { base: 3, nonReconduits: 3, taux: 1, tauxPct: 100, liste: [
        { client: 'A B', idClient: '1', netM1: 1, netM: 0, vendeurOrigine: { vendeur: 'Thibault Preguica', date: '10/03/2025', numVente: '12', prestation: 'P', site: 'S' } },
        { client: 'C D', idClient: '2', netM1: 1, netM: 0, vendeurOrigine: { introuvable: true } },
        { client: 'E F', idClient: '3', netM1: 1, netM: 0, vendeurOrigine: { ambigu: true, vendeurs: ['X', 'Y'], date: '01/01/2025' } },
      ] },
      clientsRetrouves: { ventesSignees: 0, annulees: 0, ventesActives: 0, ventesValides: 0, signataires: 0, retrouves: 0, taux: null, tauxPct: null, liste: [] },
      avertissements: [], controleBloquant: { ok: true, detail: {} } }])),
    journal: [], erreurs: [] };
  const v = S.valider(r, '2026-08');
  assert.deepEqual(v.problemes, []);
  const propre = S.nettoyer(r);
  assert.deepEqual(propre.studios.Lille.nonReconduction.liste.map((l) => l.vendeurOrigine), r.studios.Lille.nonReconduction.liste.map((l) => l.vendeurOrigine));
  const faux = JSON.parse(JSON.stringify(r));
  faux.studios.Lille.nonReconduction.liste[0].vendeurOrigine.commercial = 'Thibault P.';
  faux.studios.Neuilly.nonReconduction.liste[0].vendeurOrigine = { vendeur: 'X', date: '2025-03-10' };
  const pb = S.valider(faux, '2026-08').problemes.join(' | ');
  assert.match(pb, /vendeurOrigine : clés inattendues : commercial/);
  assert.match(pb, /vendeurOrigine\.date : JJ\/MM\/AAAA attendu/);
});
