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
