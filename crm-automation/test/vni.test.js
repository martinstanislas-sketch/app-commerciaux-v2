'use strict';
// ============================================================================
//  VNI — LE CALCUL À LA COLLECTE (lib/boosterVni.js), sans navigateur.
//  Les cas validés par Stan le 2026-09-15, un par un.
// ============================================================================

const { test } = require('node:test');
const assert = require('node:assert/strict');
const VNI = require('../lib/boosterVni.js');
const R = require('../../lib/recap2Vni.js');

const STATUTS = {
  vni_walk_in: 'Visiteur - Présent', client: 'Client - Avec Abonnement', s_ance: 'Client - Sans Abonnement',
  essai_programm_: 'RDV - Programmé', vni_offre_48h: 'Visiteur - Refus',
};
let seq = 0;
const id = () => '17856' + String(10000000 + (seq++)) + 'x' + String(210560903725276480 + seq).slice(0, 18);
const CLUB = { Lille: id(), Marcq: id(), Neuilly: id() };
const FABIAN = id(), MAGALI = id(), MARVIN = id();
const USERS = { [FABIAN]: { prenom: 'Fabian', nom: 'Fontaine' }, [MAGALI]: { prenom: 'Magali', nom: 'Garcia' }, [MARVIN]: { prenom: 'Marvin', nom: 'Bernard' } };
const L = (x) => '1348695171700984260__LOOKUP__' + x; // les références arrivent préfixées
const t = (j, m, h = 11) => new Date(Date.UTC(2026, m - 1, j, h - 2)).getTime(); // heure de Paris (été)

const contact = (o) => Object.assign({ id: id(), club: L(CLUB.Lille), prenom: 'Sophie', nom: 'Martin', deciplusId: '', statut: 'vni_offre_48h', statutChangeLe: null }, o);
const present = (c, quand, commercial = FABIAN, club = CLUB.Lille) => ({ id: id(), club: L(club), contact: L(c.id), statut: 'vni_walk_in', creeLe: quand, commercial: L(commercial), createur: L(commercial) });
const devientClient = (c, quand, statut = 'client', club = CLUB.Lille) => ({ id: id(), club: L(club), contact: L(c.id), statut, creeLe: quand, commercial: '', createur: '' });

// Une lecture de studio, avec la tuile Vendor calculée comme Vendor le fait
// (sauf si on la force pour tester le contrôle).
function lecture(club, { contacts = [], evenements = [], ventes = [], tuile } = {}) {
  const duMois = evenements.filter((e) => e.club === L(club) && R.dateParis(e.creeLe).slice(3) === '08/2026');
  const pres = new Set(duMois.filter((e) => e.statut === 'vni_walk_in').map((e) => e.contact));
  const dir = new Set(duMois.filter((e) => ['client', 's_ance'].includes(e.statut)).map((e) => e.contact).filter((c) => !pres.has(c)));
  return { ok: true, vni: { clubId: club, tuileVisiteurs: tuile == null ? pres.size + dir.size : tuile, statuts: STATUTS, ecranOk: true, contacts, evenements, ventes, users: USERS } };
}
const calculer = (lectures, extra = {}) => VNI.calculer(Object.assign({ ym: '2026-08', studios: Object.keys(lectures), lectures, contratsFB: {}, ventesDeciplus: [] }, extra));
const noms = (r, s) => r.studios[s].liste.map((l) => l.client);

test('venu en août, aucune signature -> VNI, avec date, commercial et identifiants', () => {
  const sophie = contact({ deciplusId: '50001' });
  const r = calculer({ Lille: lecture(CLUB.Lille, { contacts: [sophie], evenements: [present(sophie, t(5, 8))] }) });
  const b = r.studios.Lille;
  assert.deepEqual([b.visiteurs, b.tuileVisiteurs, b.venus, b.transformes], [1, 1, 1, 0]);
  assert.deepEqual(b.liste, [{ contactId: sophie.id, idClient: '50001', client: 'Sophie Martin', dateVenue: '05/08/2026', venues: 1,
    commercial: 'Fabian F.', commercialId: FABIAN, statutVendor: 'Visiteur - Refus' }]);
});

test('venu le 05/08, client le 20/08 -> pas VNI', () => {
  const c = contact({});
  const r = calculer({ Lille: lecture(CLUB.Lille, { contacts: [c], evenements: [present(c, t(5, 8)), devientClient(c, t(20, 8))] }) });
  assert.deepEqual([r.studios.Lille.venus, r.studios.Lille.transformes, r.studios.Lille.liste.length], [1, 1, 0]);
});

test('venu en août, client en septembre ou en octobre -> pas VNI d\'août', () => {
  const sept = contact({ prenom: 'Clara' }), oct = contact({ prenom: 'Octave' });
  const r = calculer({ Lille: lecture(CLUB.Lille, { contacts: [sept, oct],
    evenements: [present(sept, t(11, 8)), present(oct, t(12, 8)), devientClient(sept, t(4, 9)), devientClient(oct, t(15, 10))] }) });
  assert.deepEqual(noms(r, 'Lille'), []);
  assert.equal(r.studios.Lille.transformes, 2);
});

test('signé puis annulé -> pas VNI ; achat sans abonnement -> pas VNI', () => {
  const annule = contact({ prenom: 'Lydie' }), sansAbo = contact({ prenom: 'David' });
  const r = calculer({ Lille: lecture(CLUB.Lille, { contacts: [annule, sansAbo],
    evenements: [present(annule, t(18, 8)), present(sansAbo, t(14, 8)), devientClient(sansAbo, t(10, 9), 's_ance')],
    ventes: [{ id: id(), contact: L(annule.id), creeLe: t(18, 8, 12), annuleeLe: t(7, 9) }] }) });
  assert.deepEqual(noms(r, 'Lille'), []);
});

test('contrat Fitness Booster annulé, lié par identifiant de contact -> pas VNI', () => {
  const dei = contact({ prenom: 'Dei', nom: 'Muteba' });
  const r = calculer({ Lille: lecture(CLUB.Lille, { contacts: [dei], evenements: [present(dei, t(19, 8))] }) },
    { contratsFB: { Lille: { contrats: [{ date: '19/08/2026', annulee: true, contactId: dei.id }] } } });
  assert.deepEqual(noms(r, 'Lille'), []);
});

test('plusieurs RDV dans le mois, deux commerciaux -> une seule ligne, le DERNIER', () => {
  const isaac = contact({ prenom: 'Isaac' });
  const r = calculer({ Lille: lecture(CLUB.Lille, { contacts: [isaac], evenements: [present(isaac, t(19, 8, 8), MAGALI), present(isaac, t(19, 8, 11), FABIAN)] }) });
  const l = r.studios.Lille.liste;
  assert.equal(l.length, 1);
  assert.deepEqual([l[0].commercial, l[0].commercialId, l[0].venues], ['Fabian F.', FABIAN, 2]);
});

test('plusieurs studios (deux fiches, même Id Deciplus) -> studio du dernier RDV venu', () => {
  const lille = contact({ prenom: 'Paul', deciplusId: '42001' });
  const marcq = contact({ prenom: 'Paul', deciplusId: '42001', club: L(CLUB.Marcq) });
  const r = calculer({
    Lille: lecture(CLUB.Lille, { contacts: [lille], evenements: [present(lille, t(3, 8))] }),
    Marcq: lecture(CLUB.Marcq, { contacts: [marcq], evenements: [present(marcq, t(25, 8), MAGALI, CLUB.Marcq)] }),
  });
  assert.deepEqual([r.studios.Lille.liste.length, r.studios.Marcq.liste.length], [0, 1]);
  assert.deepEqual([r.studios.Marcq.liste[0].dateVenue, r.studios.Marcq.liste[0].commercial, r.studios.Marcq.liste[0].venues], ['25/08/2026', 'Magali G.', 2]);
  assert.equal(r.studios.Lille.visiteurs, 1, 'le contrôle Vendor du studio compte toujours sa venue');
});

test('signature sur l\'AUTRE fiche du même Id Deciplus -> pas VNI', () => {
  const lille = contact({ prenom: 'Philippe', deciplusId: '42130' });
  const wasq = contact({ prenom: 'Philippe', deciplusId: '42130', club: L(CLUB.Neuilly), statut: 'client' });
  const r = calculer({ Lille: lecture(CLUB.Lille, { contacts: [lille, wasq], evenements: [present(lille, t(12, 8)), devientClient(wasq, t(19, 8), 'client', CLUB.Neuilly)] }) });
  assert.deepEqual(noms(r, 'Lille'), []);
});

test('homonyme signé (autre identifiant) -> le VNI reste : jamais de rapprochement par nom', () => {
  const vni = contact({}), homonyme = contact({ statut: 'client' });
  const r = calculer({ Lille: lecture(CLUB.Lille, { contacts: [vni, homonyme], evenements: [present(vni, t(5, 8)), devientClient(homonyme, t(20, 8))] }) },
    { contratsFB: { Lille: { contrats: [{ date: '20/08/2026', annulee: false, contactId: '' }] } } });
  assert.deepEqual(noms(r, 'Lille'), ['Sophie Martin']);
  assert.match(r.avertissements.join(), /sans identifiant de contact/);
});

test('Deciplus : vente après la venue -> pas VNI ; vente AVANT la venue -> reste VNI', () => {
  const apres = contact({ prenom: 'Anne', deciplusId: '60001' }), avant = contact({ prenom: 'Bruno', deciplusId: '60002' });
  const r = calculer({ Lille: lecture(CLUB.Lille, { contacts: [apres, avant], evenements: [present(apres, t(10, 8)), present(avant, t(10, 8))] }) },
    { ventesDeciplus: [{ idClient: '60001', date: '28/08/2026' }, { idClient: '60002', date: '02/08/2026' }] });
  assert.deepEqual(noms(r, 'Lille'), ['Bruno Martin']);
});

test('statut ACTUEL client (dernier changement après la venue) -> pas VNI (filet de sécurité)', () => {
  const c = contact({ statut: 'client', statutChangeLe: t(3, 11) });
  const r = calculer({ Lille: lecture(CLUB.Lille, { contacts: [c], evenements: [present(c, t(6, 8))] }) });
  assert.deepEqual(noms(r, 'Lille'), []);
  assert.ok(r.transformations.some((x) => x.contactId === c.id && x.source === 'vendor-statut-actuel' && x.date === '03/11/2026'));
});

test('transformations : identifiants et dates seulement, compactées (une par personne, la plus récente)', () => {
  const c = contact({ deciplusId: '70001' });
  const r = calculer({ Lille: lecture(CLUB.Lille, { contacts: [c], evenements: [present(c, t(6, 8)), devientClient(c, t(7, 8)), devientClient(c, t(9, 8))] }) },
    { ventesDeciplus: [{ idClient: '70001', date: '08/08/2026' }, { idClient: '99999', date: '01/08/2026' }] });
  r.transformations.forEach((x) => assert.deepEqual(Object.keys(x).sort(), ['contactId', 'date', 'idClient', 'source']));
  const de = r.transformations.filter((x) => x.contactId === c.id);
  assert.equal(de.length, 1);
  assert.equal(de[0].date, '09/08/2026');
});

test('visiteurs Vendor = présents distincts + passés directement « Client » (contrôle)', () => {
  const venu = contact({ prenom: 'A' }), direct = contact({ prenom: 'B' });
  const r = calculer({ Lille: lecture(CLUB.Lille, { contacts: [venu, direct], evenements: [present(venu, t(5, 8)), present(venu, t(6, 8)), devientClient(direct, t(7, 8))] }) });
  assert.deepEqual([r.studios.Lille.visiteurs, r.studios.Lille.venus, r.studios.Lille.liste.length], [2, 1, 1]);
});

test('contrôle en échec (tuile Visiteurs ≠ reconstitués) -> VNI indisponibles pour CE studio seulement', () => {
  const a = contact({}), b = contact({ club: L(CLUB.Marcq) });
  const r = calculer({
    Lille: lecture(CLUB.Lille, { contacts: [a], evenements: [present(a, t(5, 8))], tuile: 3 }),
    Marcq: lecture(CLUB.Marcq, { contacts: [b], evenements: [present(b, t(5, 8), MAGALI, CLUB.Marcq)] }),
  });
  assert.match(r.studios.Lille.echec, /exhaustivité : 1 visiteur\(s\) reconstitué\(s\) pour 3/);
  assert.equal(r.studios.Lille.liste, undefined);
  assert.equal(r.studios.Marcq.liste.length, 1);
});

test('venue sans identifiant de commercial, écran non conforme, lecture absente -> échec dit', () => {
  const a = contact({});
  const sansCo = present(a, t(5, 8)); sansCo.commercial = ''; sansCo.createur = '';
  const l1 = lecture(CLUB.Lille, { contacts: [a], evenements: [sansCo] });
  assert.match(calculer({ Lille: l1 }).studios.Lille.echec, /sans identifiant Vendor de commercial/);
  const l2 = lecture(CLUB.Lille, { contacts: [a], evenements: [present(a, t(5, 8))] }); l2.vni.ecranOk = false;
  assert.match(calculer({ Lille: l2 }).studios.Lille.echec, /club ou période/);
  assert.match(calculer({ Lille: { ok: false, problemes: ['onglet perdu'] } }).studios.Lille.echec, /lecture Vendor indisponible \(onglet perdu\)/);
});

test('une venue de juillet ou de septembre n\'est pas une venue d\'août', () => {
  const juil = contact({ prenom: 'Juillet' }), sept = contact({ prenom: 'Septembre' });
  const r = calculer({ Lille: lecture(CLUB.Lille, { contacts: [juil, sept], evenements: [present(juil, t(31, 7, 23)), present(sept, t(1, 9, 1))] }) });
  assert.deepEqual(noms(r, 'Lille'), []);
});
