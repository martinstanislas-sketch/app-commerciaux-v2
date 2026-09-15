'use strict';
// ============================================================================
//  PRISES DE RÉFÉRENCE (Vendor) + IDENTIFIANT VENDOR DU COMMERCIAL DES CONTRATS.
//
//  Ce qu'on verrouille :
//   · la définition EXACTE de Vendor : source du club nommée « Prise de
//     référence », contact créé dans le mois — rien d'autre (pas « Parrainage »,
//     pas la source homonyme d'un autre club, pas le 31 juillet à 23 h 59) ;
//   · l'attribution à l'AUTEUR de la saisie (Created By), pas au commercial
//     attribué qui peut changer ensuite ;
//   · les contrôles : exhaustivité, ligne Vendor, club, période ;
//   · le commercial d'un contrat : son identifiant lu sur la vente, jamais
//     déduit du nom — et vide plutôt que douteux.
// ============================================================================

const { test } = require('node:test');
const assert = require('node:assert/strict');
const REF = require('../lib/boosterReferences.js');
const FB = require('../lib/booster.js');

const CLUB = '1699168497349x671115932011593700';     // Neuilly
const AUTRE = '1638281073570x494282387071959040';    // Boulogne
const SRC_REF = '1761161924959x943450260401553400';  // « Prise de référence » de Neuilly
const SRC_REF_AUTRE = '1761161910726x712547696679583700'; // « Prise de référence » de Boulogne
const SRC_PARR = '1699168499378x111111111111111111'; // « Parrainage »
const SRC_FAP = '1723023115490x677180711939604500';
const MARVIN = '1676534557603x269706782936696800';
const BENJAMIN = '1719949036540x783196276006537000';
const L = (id) => '1348695171700984260__LOOKUP__' + id;
const t = (j, m, a, h = 12, mi = 0) => new Date(a, m - 1, j, h, mi).getTime();

const sources = {
  [SRC_REF]: { nom: 'Prise de référence', club: L(CLUB) },
  [SRC_REF_AUTRE]: { nom: 'Prise de référence', club: L(AUTRE) },
  [SRC_PARR]: { nom: 'Parrainage', club: L(CLUB) },
  [SRC_FAP]: { nom: 'FAP', club: L(CLUB) },
};
const users = { [MARVIN]: { prenom: 'Marvin', nom: 'Bxxx' }, [BENJAMIN]: { prenom: 'Benjamin', nom: 'cxxx' } };
const statuts = { echou_s_non_qualifi_s: 'Contact - Abandonné', visiteur___en_r_flexion: 'Visiteur - En réflexion' };
let n = 0;
const contact = (o) => Object.assign({
  id: '17860174337' + String(14 + n++).padStart(2, '0') + 'x189275338672439300', club: L(CLUB), source: L(SRC_REF),
  creeLe: t(6, 8, 2026), createur: L(MARVIN), client: 'Client Test', statut: 'echou_s_non_qualifi_s',
}, o);

const aout = () => [
  contact({ client: 'Réf Un' }),
  contact({ client: 'Réf Deux', creeLe: t(6, 8, 2026, 13, 58) }),
  contact({ client: 'Réf Trois', createur: L(BENJAMIN), creeLe: t(12, 8, 2026, 9, 34), statut: 'visiteur___en_r_flexion' }),
  contact({ client: 'Parrainée', source: L(SRC_PARR) }),                  // Parrainage : EXCLU
  contact({ client: 'FAP', source: L(SRC_FAP) }),                         // autre source
  contact({ client: 'Juillet', creeLe: t(31, 7, 2026, 23, 59) }),         // hors mois
  contact({ client: 'Septembre', creeLe: t(1, 9, 2026, 0, 0) }),          // hors mois
  contact({ client: 'Autre club', club: L(AUTRE), source: L(SRC_REF_AUTRE) }), // autre club
];

test('définition Vendor : source du club « Prise de référence », créé dans le mois — rien d\'autre', () => {
  const r = REF.retenirReferences({ contacts: aout(), sources, users, statuts, clubId: CLUB, ym: '2026-08' });
  assert.deepEqual(r.retenues.map((x) => x.client), ['Réf Un', 'Réf Deux', 'Réf Trois']);
  assert.equal(r.contactsDuMois, 6, 'les contacts d\'août, toutes sources et tous clubs reçus confondus');
  assert.equal(r.parSource.Parrainage, 1, 'Parrainage vu, mais pas retenu');
  assert.deepEqual(r.retenues[0], {
    contactId: r.retenues[0].contactId, client: 'Réf Un', date: '06/08/2026',
    createurId: MARVIN, createur: 'Marvin B.', statut: 'Contact - Abandonné',
  });
  assert.match(r.retenues[0].contactId, /^\d+x\d+$/, 'identifiant nettoyé du préfixe LOOKUP');
});

test('attribution à l\'AUTEUR de la saisie, même si le commercial attribué a changé depuis', () => {
  const c = contact({ createur: L(BENJAMIN), commercial: L(MARVIN) });
  const r = REF.retenirReferences({ contacts: [c], sources, users, statuts, clubId: CLUB, ym: '2026-08' });
  assert.equal(r.retenues[0].createurId, BENJAMIN);
  assert.equal(r.retenues[0].createur, 'Benjamin C.');
});

test('la source homonyme d\'un AUTRE club n\'est jamais retenue, même sur un contact du club', () => {
  const c = contact({ source: L(SRC_REF_AUTRE) });
  assert.equal(REF.retenirReferences({ contacts: [c], sources, users, statuts, clubId: CLUB, ym: '2026-08' }).retenues.length, 0);
});

test('nom de source exact : les espaces sont neutralisés, pas les mots', () => {
  assert.equal(REF.estSourceReference('  Prise   de référence '), true);
  assert.equal(REF.estSourceReference('Prise de références'), false);
  assert.equal(REF.estSourceReference('Parrainage'), false);
  assert.equal(REF.estSourceReference('Référence'), false);
});

test('libellés d\'écran : la case voisine collée au nom de source est détachée', () => {
  const l = REF.rattacherLibelles([
    { source: 'Ventes annulées Prise de référence', contacts: 2, visiteurs: 0, clients: 0 },
    { source: '1 Bouche à oreille', contacts: 1, visiteurs: 1, clients: 1 },
    { source: 'TOTAL Simplybook', contacts: 2, visiteurs: 0, clients: 0 },
  ], ['Prise de référence', 'Bouche à oreille', 'Simplybook']);
  assert.deepEqual(l.map((x) => x.source + '=' + x.contacts), ['Prise de référence=2', 'Bouche à oreille=1', 'Simplybook=2']);
});

const verdict = (o) => {
  const calcul = REF.retenirReferences({ contacts: o.contacts || aout().filter((c) => !/club/.test(c.client)), sources, users, statuts, clubId: CLUB, ym: '2026-08' });
  return REF.controler(Object.assign({
    clubAffiche: 'My Coach - Neuilly-sur-Seine', clubAttendu: REF.CLUBS_STATS.Neuilly, periodeAffichee: ['01/08/26', '31/08/26'],
    ym: '2026-08', tuileContacts: calcul.contactsDuMois, calcul, clubId: CLUB,
    lignesEcran: [{ source: 'Prise de référence', contacts: 3, visiteurs: 0, clients: 0 }, { source: 'Parrainage', contacts: 1, visiteurs: 0, clients: 0 }],
  }, o.surcharge || {}));
};

test('contrôles : tout concorde -> ok', () => {
  const v = verdict({});
  assert.equal(v.ok, true, v.problemes.join(' ; '));
  assert.equal(v.affiche, 3);
});

test('contrôle d\'exhaustivité : contacts reçus ≠ tuile « Contacts » -> échec', () => {
  const v = verdict({ surcharge: { tuileContacts: 146 } });
  assert.equal(v.ok, false);
  assert.match(v.problemes.join(), /exhaustivité/);
});

test('contrôle Vendor : retenues ≠ ligne « Prise de référence » affichée -> échec', () => {
  const v = verdict({ surcharge: { lignesEcran: [{ source: 'Prise de référence', contacts: 2, visiteurs: 0, clients: 0 }] } });
  assert.equal(v.ok, false);
  assert.match(v.problemes.join(), /3 retenue\(s\) pour 2 affichée/);
});

test('ligne absente à l\'écran = 0 affiché (Vendor masque les sources vides)', () => {
  const sansRef = aout().filter((c) => !/^Réf/.test(c.client) && !/club/.test(c.client));
  const v = verdict({ contacts: sansRef, surcharge: { lignesEcran: [] } });
  assert.equal(v.ok, true, v.problemes.join(' ; '));
  assert.equal(v.affiche, 0);
});

test('club ou période affichés faux -> échec', () => {
  assert.equal(verdict({ surcharge: { clubAffiche: 'My Coach - Lille' } }).ok, false);
  assert.equal(verdict({ surcharge: { periodeAffichee: ['01/09/26', '30/09/26'] } }).ok, false);
  assert.deepEqual(REF.periodeAttendue('2026-02'), ['01/02/26', '28/02/26']);
});

test('prise de référence sans identifiant d\'auteur -> échec (jamais attribuée au nom)', () => {
  const contacts = [contact({ createur: 'Marvin B.' })];
  const v = verdict({ contacts, surcharge: { lignesEcran: [{ source: 'Prise de référence', contacts: 1, visiteurs: 0, clients: 0 }] } });
  assert.equal(v.ok, false);
  assert.match(v.problemes.join(), /sans identifiant Vendor d'auteur/);
});

// ── Le commercial d'un contrat, par identifiant ────────────────────────────
const ligneTxt = (nom, date, com) => '1\n' + nom + '\nCOACHING\nFAP\n' + date + ' |  ' + com + '\nVoir la fiche du contact';
const lignes = [FB.analyserLigne(ligneTxt('Anne A', '05/08/2026', 'Marvin B.')), FB.analyserLigne(ligneTxt('Bruno B', '06/08/2026', 'Marvin B.'))];
const liaison = (i, o) => Object.assign({ texte: ligneTxt(i ? 'Bruno B' : 'Anne A', i ? '06/08/2026' : '05/08/2026', 'Marvin B.'),
  type: 'custom.commerciaux_vente', venteId: '178600778666' + i + 'x932731399283819500', commercialId: L(MARVIN) }, o);

test('contrat : identifiant du commercial lu sur la vente liée à la ligne', () => {
  const r = FB.lierCommerciaux(lignes, [liaison(0), liaison(1, { commercialId: L(BENJAMIN) })]);
  assert.equal(r.manquants, 0);
  assert.deepEqual(r.ids.map((x) => x.commercialId), [MARVIN, BENJAMIN], 'deux lignes au même nom affiché, deux identifiants distincts');
});

test('contrat : liaison douteuse -> identifiant VIDE, jamais déduit du nom', () => {
  assert.equal(FB.lierCommerciaux(lignes, [liaison(0)]).manquants, 2, 'nombre de liaisons ≠ lignes : aucune retenue');
  assert.equal(FB.lierCommerciaux(lignes, [liaison(1), liaison(0)]).manquants, 2, 'lignes relues dans un autre ordre');
  assert.equal(FB.lierCommerciaux(lignes, [liaison(0, { type: 'custom.sportif' }), liaison(1)]).ids[0].commercialId, '');
  assert.equal(FB.lierCommerciaux(lignes, [liaison(0, { commercialId: 'Marvin B.' }), liaison(1)]).ids[0].commercialId, '');
  const doublon = FB.lierCommerciaux(lignes, [liaison(0), liaison(1, { venteId: liaison(0).venteId })]);
  assert.deepEqual([doublon.ids[0].commercialId, doublon.ids[1].commercialId, doublon.manquants], [MARVIN, '', 1], 'une vente ne sert pas deux lignes');
  assert.equal(FB.lierCommerciaux(lignes, null).manquants, 2);
});

test('contrat « Pas de commercial » dans Vendor : identifiant vide, compté à part, pas « illisible »', () => {
  const r = FB.lierCommerciaux(lignes, [liaison(0, { commercialId: '' }), liaison(1)]);
  assert.deepEqual([r.ids[0].commercialId, r.manquants, r.sansCommercial], ['', 0, 1]);
});

test('identifiant Bubble : préfixe LOOKUP retiré, toute autre forme refusée', () => {
  assert.equal(FB.idBubble(L(MARVIN)), MARVIN);
  assert.equal(FB.idBubble(MARVIN), MARVIN);
  assert.equal(FB.idBubble('Marvin B.'), '');
  assert.equal(FB.idBubble(''), '');
  assert.equal(FB.idBubble(null), '');
});
