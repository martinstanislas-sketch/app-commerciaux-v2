'use strict';
// ============================================================================
//  CHAÎNAGE DÉTERMINISTE : vente Vendor -> contact -> Id Deciplus.
//
//  Décidé par Stan le 2026-09-16 :
//   · `contactIdVendor` conservé sur CHAQUE vente, annulées comprises ;
//   · `idDeciplusVendor` = l'Id Deciplus lu sur la fiche Vendor du contact ;
//   · priorité d'identification : idDeciplusVendor -> idClient -> ficheId ;
//   · deux identifiants fiables DIFFÉRENTS -> « à trancher », jamais de choix ;
//   · aucun rapprochement par nom ;
//   · champs FACULTATIFS (anciens rapports intacts) ;
//   · AUCUN effet sur les KPI (`retrouve`, `idClient`, taux).
//  Identifiants de test fictifs, aucune donnée client réelle.
// ============================================================================

const { test } = require('node:test');
const assert = require('node:assert');

const M = require('../../public/recap2-metrics.js');
const R = require('../../public/retention.js');
const Store = require('../../lib/recap2Store.js');
const FB = require('../lib/booster.js');

const C1 = '1786105770344x918619717421754500';
const C2 = '1786525415620x656559315990347800';
const C3 = '1787577327974x217517879667458050';

// ── 1. LECTURE DES RÉPONSES VENDOR ──────────────────────────────────────────
test('contactsDeciplusDepuis : Id Deciplus des fiches contact, par identifiant de contact', () => {
  // Forme d'une réponse /elasticsearch/ de Bubble : objets imbriqués.
  const reponse = { responses: [{ hits: { hits: [
    { _type: 'custom.sportif', _id: C1, _source: { nom_text: 'A', member_id_deciplus_number: 42350 } },
    { _type: 'custom.sportif', _id: C2, _source: { nom_text: 'A' } },                      // même nom, pas d'Id
    { _type: 'custom.commerciaux_vente', _id: '1786105770999x1', _source: { member_id_deciplus_number: 1 } },
    { _type: 'custom.sportif', _id: 'pas-un-id', _source: { member_id_deciplus_number: 7 } },
    { _type: 'custom.sportif', _id: C3, _source: { member_id_deciplus_number: '12a' } },  // Id illisible
  ] } }] };
  const contacts = FB.contactsDeciplusDepuis(reponse, new Map());
  assert.equal(contacts.get(C1), '42350');
  assert.equal(contacts.get(C2), '', 'fiche reçue sans Id Deciplus : vide, jamais celui d\'un homonyme');
  assert.equal(contacts.get(C3), '', 'un Id non numérique n\'est pas un Id');
  assert.equal(contacts.size, 3, 'ni une vente, ni un identifiant Bubble mal formé');
  // Une réponse partielle ultérieure n'efface pas un Id déjà lu.
  FB.contactsDeciplusDepuis({ _type: 'custom.sportif', _id: C1, _source: {} }, contacts);
  assert.equal(contacts.get(C1), '42350');
});

test('poserIdsDeciplus : rattaché par contactId uniquement, jamais par le nom', () => {
  const contacts = new Map([[C1, '42350'], [C2, '']]);
  const contrats = [
    { identite: 'Esther Test', contactId: C1 },
    { identite: 'Esther Test', contactId: C2 },   // homonyme : autre contact, pas d'Id
    { identite: 'Esther Test', contactId: '' },   // contact illisible
    { identite: 'Autre', contactId: C3 },         // contact non reçu
  ];
  assert.equal(FB.poserIdsDeciplus(contrats, contacts), 1);
  assert.deepEqual(contrats.map((c) => c.idDeciplusVendor), ['42350', '', '', '']);
});

// ── 2. TRANSPORT JUSQU'À LA LIGNE, SANS TOUCHER AUX KPI ─────────────────────
const sig = (identite, o = {}) => Object.assign({ cles: R.clesContrat(identite), prenom: identite, nom: '', date: '05/08/2026', prestation: 'Challenge', commercial: 'X' }, o);
const vueVentes = (noms) => noms.map((n, i) => ({ cle: R.clesContrat(n)[0], site: 'My Coach Lille', date: '06/08/2026', idClient: String(40000 + i) }));

test('clientsRetrouves : les deux champs suivent la vente (annulées comprises), les KPI ne bougent pas', () => {
  const entree = {
    signataires: [sig('Alpha Un', { contactIdVendor: C1, idDeciplusVendor: '42350' }), sig('Beta Deux', { contactIdVendor: C2 })],
    annulees: [{ prenom: 'Gamma Trois', nom: '', date: '19/08/2026', dateAnnulation: '24/08/2026', contactIdVendor: C3, idDeciplusVendor: '42090' }],
    ventesM: vueVentes(['UN Alpha']), encM: [],
  };
  const avec = M.clientsRetrouves(entree);
  const sans = M.clientsRetrouves({
    signataires: entree.signataires.map(({ contactIdVendor, idDeciplusVendor, ...x }) => x),
    annulees: entree.annulees.map(({ contactIdVendor, idDeciplusVendor, ...x }) => x),
    ventesM: entree.ventesM, encM: [],
  });
  assert.deepEqual([avec.total, avec.nbRetrouves, avec.taux], [sans.total, sans.nbRetrouves, sans.taux], 'aucun KPI changé');
  const alpha = avec.clients.find((c) => c.prenom === 'Alpha Un');
  assert.equal(alpha.contactIdVendor, C1);
  assert.equal(alpha.idDeciplusVendor, '42350');
  assert.equal(alpha.idClient, '40000', 'idClient reste celui du journal');
  assert.equal(avec.annules[0].contactIdVendor, C3);
  assert.equal(avec.annules[0].idDeciplusVendor, '42090');
  assert.equal(avec.annules[0].idClient, '', 'une annulée ne porte toujours pas d\'idClient');
  assert.equal(avec.annules[0].retrouve, false);
});

// ── 3. LA RÈGLE DE PRIORITÉ ─────────────────────────────────────────────────
test('identifiantDeciplus : idDeciplusVendor -> idClient -> ficheId', () => {
  const id = (l) => M.identifiantDeciplus(l);
  assert.deepEqual([id({ idDeciplusVendor: '1', retrouve: true, idClient: '1' }).id, id({ idDeciplusVendor: '1', retrouve: true, idClient: '1' }).source], ['1', 'vendor']);
  assert.deepEqual([id({ retrouve: true, idClient: '2' }).id, id({ retrouve: true, idClient: '2' }).source], ['2', 'journal']);
  assert.deepEqual([id({ retrouve: false, ficheId: '3' }).id, id({ retrouve: false, ficheId: '3' }).source], ['3', 'fiche']);
  assert.equal(id({ annulee: true, retrouve: false, idDeciplusVendor: '4' }).id, '4', 'une annulée est identifiable par sa fiche Vendor');
  assert.deepEqual(id({}), { id: '', source: '', aTrancher: false, sources: [] });
});

test('identifiantDeciplus : deux sources fiables différentes -> à trancher, aucun choix', () => {
  const a = M.identifiantDeciplus({ idDeciplusVendor: '42350', retrouve: true, idClient: '41000' });
  assert.equal(a.aTrancher, true);
  assert.equal(a.id, '', 'jamais la source prioritaire par défaut');
  assert.deepEqual(a.sources.map((s) => s.source + ':' + s.id), ['vendor:42350', 'journal:41000']);
  assert.equal(M.identifiantDeciplus({ idDeciplusVendor: '42350', ficheId: '42351' }).aTrancher, true);
  assert.equal(M.identifiantDeciplus({ idDeciplusVendor: '42350', ficheId: '42350' }).aTrancher, false, 'sources concordantes');
});

test('identifiantDeciplus : jamais de quasi-homonyme, jamais d\'id sur un « à vérifier » ni un id bricolé', () => {
  assert.equal(M.identifiantDeciplus({ retrouve: false, candidat: 'X', candidatId: '42000' }).id, '', 'candidatId n\'est pas une source');
  assert.equal(M.identifiantDeciplus({ retrouve: false, idClient: '42000' }).id, '', 'idClient seulement sur une vente retrouvée');
  assert.equal(M.identifiantDeciplus({ annulee: true, retrouve: true, idClient: '42000' }).id, '');
  assert.equal(M.identifiantDeciplus({ idDeciplusVendor: '42 350' }).id, '');
  assert.equal(M.identifiantDeciplus({ ficheId: 'idj=1' }).id, '');
});

// ── 4. LE MAGASIN : FACULTATIFS, VALIDÉS, COMPATIBLES ───────────────────────
function rapportV2() {
  const studios = {};
  M.LABELS.forEach((s) => {
    studios[s] = {
      studio: s,
      nonReconduction: { base: 10, nonReconduits: 2, taux: 0.2, tauxPct: 20, liste: [
        { client: 'P', netM1: 50, netM: 0 }, { client: 'Q', netM1: 60, netM: 0 }] },
      clientsRetrouves: {
        ventesSignees: 3, annulees: 1, ventesActives: 2, signataires: 2, retrouves: 1, taux: 0.5, tauxPct: 50,
        liste: [
          { client: 'Alpha Un', date: '07/08/2026', prestation: 'Challenge', commercial: 'M', annulee: false, dateAnnulation: '', retrouve: true, site: 'My Coach Lille', dateVente: '08/08/2026', idClient: '41718', encaisse: false },
          { client: 'Beta Deux', date: '06/08/2026', prestation: 'Pack', commercial: 'M', annulee: false, dateAnnulation: '', retrouve: false, site: '', dateVente: '', idClient: '', encaisse: false },
          { client: 'Gamma Trois', date: '19/08/2026', prestation: 'Challenge', commercial: 'M', annulee: true, dateAnnulation: '24/08/2026', retrouve: false, site: '', dateVente: '', idClient: '', encaisse: false },
        ],
      },
      avertissements: [], controleBloquant: { ok: true },
    };
  });
  const source = { fitnessBooster: {} };
  M.LABELS.forEach((s) => { source.fitnessBooster[s] = { club: s, periodeDetail: { du: '01/08/26', au: '31/08/26' }, compteur: 3, annulees: 1, echec: null }; });
  ['2026-07', '2026-08'].forEach((m) => {
    source['deciplus_' + m] = { periode: { du: m + '-01', au: m + '-31' }, conforme: true, controleParStudio: {} };
    M.LABELS.forEach((s) => { source['deciplus_' + m].controleParStudio[s] = { ok: true, lignesBrutes: 5, lignesParsees: 5, problemes: [], avertissements: [] }; });
  });
  source['deciplus_ventes_2026-08'] = { periode: { du: '2026-08-01', au: '2026-08-31' }, conforme: true, lignes: 3723 };
  return { businessVersion: 2, genere: new Date().toISOString(), mois: '2026-08', m1: '2026-07', source, studios, journal: [], erreurs: [] };
}

test('magasin : un ancien rapport (sans les champs) reste valide et n\'en reçoit aucun', () => {
  const r = rapportV2();
  assert.deepEqual(Store.valider(r, '2026-08').problemes, []);
  Store.nettoyer(r).studios.Lille.clientsRetrouves.liste.forEach((l) => {
    assert.equal('contactIdVendor' in l, false, 'pas de champ vide ajouté');
    assert.equal('idDeciplusVendor' in l, false);
  });
});

test('magasin : champs admis sur une retrouvée, un « à vérifier » ET une annulée, KPI intacts', () => {
  const r = rapportV2();
  const [a, b, c] = r.studios.Lille.clientsRetrouves.liste;
  Object.assign(a, { contactIdVendor: C1, idDeciplusVendor: '41718' });
  Object.assign(b, { contactIdVendor: C2, idDeciplusVendor: '42090' });
  Object.assign(c, { contactIdVendor: C3, idDeciplusVendor: '42111' });
  assert.deepEqual(Store.valider(r, '2026-08').problemes, []);
  const n = Store.nettoyer(r).studios.Lille.clientsRetrouves;
  assert.deepEqual(n.liste.map((l) => [l.contactIdVendor, l.idDeciplusVendor]), [[C1, '41718'], [C2, '42090'], [C3, '42111']]);
  assert.deepEqual(n.liste.map((l) => [l.retrouve, l.idClient, l.annulee]), [[true, '41718', false], [false, '', false], [false, '', true]],
    'retrouve / idClient / annulee inchangés : un Id Vendor ne rend pas une vente « retrouvée »');
  assert.deepEqual([n.retrouves, n.signataires, n.taux], [1, 2, 0.5]);
});

test('magasin : identifiants mal formés refusés à la validation, effacés au nettoyage', () => {
  const r = rapportV2();
  Object.assign(r.studios.Lille.clientsRetrouves.liste[1], { contactIdVendor: 'Esther', idDeciplusVendor: 'idj=42350' });
  const pb = Store.valider(r, '2026-08').problemes.join(' ');
  assert.match(pb, /contactIdVendor : identifiant Vendor ou vide attendu/);
  assert.match(pb, /idDeciplusVendor : « idj=42350 » n'est pas un Id Deciplus/);
  const l = Store.nettoyer(r).studios.Lille.clientsRetrouves.liste[1];
  assert.equal('contactIdVendor' in l, false);
  assert.equal('idDeciplusVendor' in l, false);
});
