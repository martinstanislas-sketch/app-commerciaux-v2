'use strict';
// ============================================================================
//  BASCULE DE CLUB FITNESS BOOSTER — la panne de juillet, verrouillée.
//
//  CE QUI S'EST PASSÉ (collecte de juillet, 2026-09-14). Le menu des clubs est
//  une liste défilante ; les entrées sous son pli étaient visées à un point où
//  l'élément du dessus était la barre latérale. Le clic refermait le menu sans
//  changer de club, le journal disait « club sélectionné », et c'est la page de
//  stats qui constatait « Lille » pour 5 studios sur 6.
//
//  Ce que ces tests tiennent, sans navigateur :
//   1. un club n'est déclaré sélectionné qu'une fois LU et IDENTIQUE ;
//   2. un clic sans effet est rejoué, dans une limite ;
//   3. un club resté faux après la limite est un ÉCHEC — jamais un succès ;
//   4. une entrée non cliquable n'est jamais cliquée « au hasard ».
// ============================================================================

const { test } = require('node:test');
const assert = require('node:assert');
const FB = require('../lib/booster.js');

// Un faux Fitness Booster. `effets` dit, clic par clic, quel club devient actif
// (null = le clic tombe à côté : rien ne change, comme en juillet).
function fauxFB({ actif = 'Lille', effets = [], entreeKo = 0 } = {}) {
  const etat = { actif, clics: 0, ouvertures: 0, amenees: 0 };
  const ops = {
    fermerMenu: async () => {},
    clubAffiche: async () => etat.actif,
    ouvrirMenu: async () => { etat.ouvertures += 1; },
    amenerEntree: async (libelle) => {
      etat.amenees += 1;
      if (etat.amenees <= entreeKo) throw new Error('« ' + libelle + ' » : entrée hors de la zone cliquable du menu');
      return { x: 127, y: 180 };
    },
    cliquer: async () => {
      const e = effets[etat.clics];
      etat.clics += 1;
      if (e) etat.actif = e;
    },
    attendreClub: async () => etat.actif,
  };
  return { ops, etat };
}

test('les 6 studios ont un libellé attendu exact', () => {
  assert.deepEqual(['Lille', 'Wasquehal', 'Marcq', 'Boulogne', 'Levallois', 'Neuilly'].map(FB.clubAttendu),
    ['Lille', 'Wasquehal', 'Marcq-en-Barœul', 'Boulogne-Billancourt', 'Levallois-Perret', 'Neuilly-sur-Seine']);
});

test('verifierClub : égalité exacte, espaces seuls neutralisés', () => {
  assert.equal(FB.verifierClub('Marcq-en-Barœul', 'Marcq'), true);
  assert.equal(FB.verifierClub('  Marcq-en-Barœul ', 'Marcq'), true);
  assert.equal(FB.verifierClub('Marcq', 'Marcq'), false, 'un nom tronqué n\'est pas le bon club');
  assert.equal(FB.verifierClub('Lille', 'Wasquehal'), false);
  assert.equal(FB.verifierClub('', 'Lille'), false, 'menu ouvert / rien lu : jamais un succès');
  assert.equal(FB.verifierClub('Lille', 'Inconnu'), false);
});

test('bascule réussie : le club est lu et vérifié, un seul clic', async () => {
  const { ops, etat } = fauxFB({ effets: ['Wasquehal'] });
  const journal = [];
  const club = await FB.basculerClub(ops, 'Wasquehal', { journal: (l) => journal.push(l) });
  assert.equal(club, 'Wasquehal');
  assert.equal(etat.clics, 1);
  assert.ok(journal.some((l) => /sélectionné et vérifié/.test(l)));
});

test('club déjà actif : vérifié, aucun clic', async () => {
  const { ops, etat } = fauxFB({ actif: 'Lille' });
  assert.equal(await FB.basculerClub(ops, 'Lille'), 'Lille');
  assert.equal(etat.clics, 0);
  assert.equal(etat.ouvertures, 0);
});

test('LA PANNE DE JUILLET : clic sans effet, puis réussite au 2e passage', async () => {
  const { ops, etat } = fauxFB({ effets: [null, 'Marcq-en-Barœul'] });
  const journal = [];
  const club = await FB.basculerClub(ops, 'Marcq', { journal: (l) => journal.push(l) });
  assert.equal(club, 'Marcq-en-Barœul');
  assert.equal(etat.clics, 2);
  assert.ok(journal.some((l) => /↻ bascule vers Marcq-en-Barœul — tentative 1\/3 : Club affiché « Lille »/.test(l)),
    'le rejeu est dit, avec ce qui était affiché');
});

test('LA PANNE DE JUILLET, persistante : ÉCHEC après la limite, jamais un succès', async () => {
  const { ops, etat } = fauxFB({ effets: [null, null, null, null] });
  await assert.rejects(FB.basculerClub(ops, 'Neuilly', { tentatives: 3 }),
    /Bascule vers « Neuilly-sur-Seine » impossible après 3 tentative\(s\) — Club affiché « Lille » ≠ attendu « Neuilly-sur-Seine »/);
  assert.equal(etat.clics, 3, 'exactement la limite, pas un clic de plus');
});

test('un club différent de celui demandé n\'est pas accepté', async () => {
  // Le clic atterrit sur la mauvaise entrée (voisine) : Wasquehal au lieu de Marcq.
  const { ops } = fauxFB({ effets: ['Wasquehal', 'Wasquehal', 'Wasquehal'] });
  await assert.rejects(FB.basculerClub(ops, 'Marcq'), /Club affiché « Wasquehal » ≠ attendu « Marcq-en-Barœul »/);
});

test('entrée non cliquable : jamais cliquée, rejouée, puis échec explicite', async () => {
  const { ops, etat } = fauxFB({ entreeKo: 99 });
  await assert.rejects(FB.basculerClub(ops, 'Levallois'), /hors de la zone cliquable/);
  assert.equal(etat.clics, 0, 'on ne clique pas à un endroit dont on n\'est pas sûr');
  assert.equal(etat.amenees, FB.TENTATIVES_BASCULE);
});

test('entrée non cliquable une fois, puis cliquable : réussite', async () => {
  const { ops, etat } = fauxFB({ entreeKo: 1, effets: ['Boulogne-Billancourt'] });
  assert.equal(await FB.basculerClub(ops, 'Boulogne'), 'Boulogne-Billancourt');
  assert.equal(etat.clics, 1);
});

test('page rechargée en pleine lecture : passage rejoué, puis club vérifié', async () => {
  // Le vrai Fitness Booster RECHARGE la page quand on change de club : une
  // lecture surprise à ce moment lève. Ce n'est ni un succès ni un abandon.
  const { ops, etat } = fauxFB({ effets: ['Neuilly-sur-Seine'] });
  let piege = true;
  const attendre = ops.attendreClub;
  ops.attendreClub = async (a) => {
    if (piege) { piege = false; throw new Error('page.evaluate: Execution context was destroyed'); }
    return attendre(a);
  };
  const journal = [];
  assert.equal(await FB.basculerClub(ops, 'Neuilly', { journal: (l) => journal.push(l) }), 'Neuilly-sur-Seine');
  assert.ok(journal.some((l) => /tentative 1\/3 : page.evaluate: Execution context was destroyed/.test(l)));
  assert.equal(etat.clics, 1, '2e passage : le club est déjà le bon, vérifié sans recliquer');
});

test('rechargements en boucle : échec bloquant après la limite', async () => {
  const { ops } = fauxFB();
  ops.clubAffiche = async () => { throw new Error('Execution context was destroyed'); };
  await assert.rejects(FB.basculerClub(ops, 'Marcq'), /impossible après 3 tentative\(s\) — Execution context was destroyed/);
});

test('studio inconnu : refusé avant tout clic', async () => {
  const { ops, etat } = fauxFB();
  await assert.rejects(FB.basculerClub(ops, 'Caen'), /Studio inconnu/);
  assert.equal(etat.clics, 0);
});

test('les 6 studios basculent à la suite, chacun vérifié', async () => {
  const studios = ['Lille', 'Wasquehal', 'Marcq', 'Boulogne', 'Levallois', 'Neuilly'];
  const { ops } = fauxFB({ actif: 'Lille', effets: studios.slice(1).map(FB.clubAttendu) });
  for (const s of studios) assert.equal(await FB.basculerClub(ops, s), FB.clubAttendu(s));
});

// ============================================================================
//  LA PANNE DU 2026-09-16 : Vendor rouvert sur « MyCoach by GINKGO Valence ».
//  Le texte « My Coach … » n'existait plus en haut de la barre latérale : le
//  bloc à cliquer n'était pas trouvé et le club actif ne se lisait plus. Les
//  descripteurs ci-dessous reprennent la STRUCTURE relevée ce jour-là (aucune
//  donnée client : uniquement des noms de clubs).
// ============================================================================
const bloc = (lignes, haut, { dansListe = false, gauche = 24, droite = 215, hauteur = 37, surface = 191 * 37, index = 0 } = {}) =>
  ({ index, lignes, haut, bas: haut + hauteur, gauche, droite, surface, dansListe });
const FERME_VALENCE = { multi: false, blocs: [
  bloc(['M', 'MyCoach by GINKGO Valence', 'Valence'], 20, { index: 0 }),
  bloc(['Accueil'], 71, { index: 1 }),
  bloc(['Relances', '0'], 151, { index: 2 }),
] };
const OUVERT = { multi: false, blocs: [
  ...FERME_VALENCE.blocs,
  bloc(['G', 'Ginkgo Sport', 'Tourcoing'], 71, { dansListe: true, index: 10 }),
  bloc(['M', 'My Coach', 'Lille'], 293, { dansListe: true, index: 11 }),
  bloc(['My Coach', 'Lille'], 295, { dansListe: true, hauteur: 34, surface: 140 * 34, index: 12 }),
  bloc(['M', 'My Coach', 'Wasquehal', 'Club désactivé'], 367, { dansListe: true, index: 13 }),
  bloc(['M', 'My Coach', 'Marcq-en-Barœul'], 508, { dansListe: true, index: 14 }),
  bloc(['M', 'MyCoach by GINKGO Valence', 'Valence'], 619, { dansListe: true, index: 15 }),
] };

test('club actif lu par sa STRUCTURE, quelle que soit son écriture (Valence)', () => {
  assert.equal(FB.menuEstOuvert(FERME_VALENCE), false);
  assert.equal(FB.villeClubActif(FERME_VALENCE), 'Valence');
  assert.equal(FB.blocClubActif(FERME_VALENCE).index, 0, 'le bloc tout en haut, pas « Accueil » ni « Relances »');
  const lille = { multi: false, blocs: [bloc(['M', 'My Coach', 'Lille'], 20)] };
  assert.equal(FB.villeClubActif(lille), 'Lille');
  assert.equal(FB.verifierClub(FB.villeClubActif(lille), 'Lille'), true);
});

test('menu ouvert : détecté sans en-tête, et le club actif devient « inconnu »', () => {
  assert.equal(FB.menuEstOuvert(OUVERT), true);
  assert.equal(FB.villeClubActif(OUVERT), '', 'menu ouvert : jamais un faux positif');
  assert.equal(FB.menuEstOuvert({ multi: true, blocs: [] }), true, 'en-tête Multi-sites');
  assert.equal(FB.menuEstOuvert({ multi: false, blocs: [bloc(['M', 'My Coach', 'Lille'], 293, { dansListe: true })] }), false,
    'une seule entrée ne suffit pas');
  assert.equal(FB.villeClubActif({ multi: false, blocs: [] }), '', 'rien de reconnu : inconnu');
});

test('entrée du menu : libellé exact, casse / espaces / retours à la ligne neutralisés', () => {
  assert.equal(FB.entreeCorrespond(['M', 'My Coach', 'Wasquehal', 'Club désactivé'], 'My Coach Wasquehal'), true);
  assert.equal(FB.entreeCorrespond(['M', 'MyCoach by GINKGO Valence', 'Valence'], FB.libelleClub('Valence')), true);
  assert.equal(FB.entreeCorrespond(['G', 'Ginkgo Sport', 'Tourcoing'], FB.libelleClub('Ginkgo Sport')), true);
  assert.equal(FB.entreeCorrespond(['M', 'My Coach', 'Marcq-en-Barœul'], 'My Coach Marcq-en-Barœul'), true);
  assert.equal(FB.entreeCorrespond(['M', 'My Coach', 'Marcq-en-Barœul'], 'My Coach Marcq'), false, 'jamais « à peu près »');
  assert.equal(FB.entreeCorrespond(['M', 'My Coach', 'Lille'], 'My Coach Lesquin'), false);
});

test('choix de l\'entrée : la ligne entière, jamais une ambiguïté', () => {
  assert.equal(FB.choisirEntree(OUVERT, 'My Coach Lille').entree.index, 11, 'éléments imbriqués : la plus grande surface');
  assert.equal(FB.choisirEntree(OUVERT, 'My Coach Wasquehal').entree.index, 13);
  assert.equal(FB.choisirEntree(OUVERT, FB.libelleClub('Valence')).entree.index, 15, 'l\'entrée de liste, pas le bloc actif');
  assert.match(FB.choisirEntree(OUVERT, 'My Coach Neuilly-sur-Seine').erreur, /absente du sélecteur/);
  const double = { multi: false, blocs: [...OUVERT.blocs, bloc(['M', 'My Coach', 'Lille'], 700, { dansListe: true, index: 20 })] };
  assert.match(FB.choisirEntree(double, 'My Coach Lille').erreur, /plusieurs fois/);
});

test('clubs hors RECAP (vérification seulement) : Valence et Ginkgo Sport, les studios inchangés', async () => {
  assert.equal(FB.clubAttendu('Valence'), 'Valence');
  assert.equal(FB.clubAttendu('Ginkgo Sport'), 'Tourcoing');
  assert.equal(FB.libelleClub('Wasquehal'), 'My Coach Wasquehal');
  assert.deepEqual(Object.keys(FB.CLUBS_FB), ['Lille', 'Wasquehal', 'Marcq', 'Boulogne', 'Levallois', 'Neuilly'],
    'aucun club ajouté à la liste des studios collectés');
  // Départ Valence -> les 6 studios -> Ginkgo Sport, chacun vérifié.
  const suite = ['Lille', 'Wasquehal', 'Marcq', 'Boulogne', 'Levallois', 'Neuilly', 'Ginkgo Sport'];
  const { ops } = fauxFB({ actif: 'Valence', effets: suite.map(FB.clubAttendu) });
  for (const s of suite) assert.equal(await FB.basculerClub(ops, s), FB.clubAttendu(s));
});

test('Levallois (28 relances) : les listes du tableau de bord ne sont ni le menu ni le club actif', () => {
  // Relevé réel : lignes de relances cliquables à 2-3 lignes, x = 312 → 468 px,
  // et un grand conteneur de contenu qui démarre en haut (y = 0).
  const relances = [0, 1, 2, 3, 4].map((i) => bloc(['Relance ' + i, '12/09/2026', 'À traiter'], 180 + i * 40,
    { dansListe: true, gauche: 312, droite: 468, index: 30 + i }));
  const contenu = bloc(['Créer un contact', '1 Stan .'], 0, { gauche: 240, droite: 1580, surface: 1340 * 900, index: 40 });
  const ferme = { multi: false, blocs: [bloc(['M', 'My Coach', 'Levallois-Perret'], 20, { index: 0 }), contenu, ...relances] };
  assert.equal(FB.menuEstOuvert(ferme), false, 'des relances ne sont pas le menu des clubs');
  assert.equal(FB.villeClubActif(ferme), 'Levallois-Perret');
  assert.equal(FB.verifierClub(FB.villeClubActif(ferme), 'Levallois'), true);
  const ouvert = { multi: false, blocs: [...ferme.blocs,
    bloc(['M', 'My Coach', 'Neuilly-sur-Seine'], 330, { dansListe: true, gauche: 25, droite: 213, index: 50 }),
    bloc(['M', 'My Coach', 'Marcq-en-Barœul'], 508, { dansListe: true, gauche: 25, droite: 213, index: 51 })] };
  assert.equal(FB.menuEstOuvert(ouvert), true);
  assert.equal(FB.choisirEntree(ouvert, 'My Coach Neuilly-sur-Seine').entree.index, 50);
  assert.match(FB.choisirEntree(ferme, 'My Coach Neuilly-sur-Seine').erreur, /absente/, 'menu fermé : aucune entrée prise dans les relances');
});
