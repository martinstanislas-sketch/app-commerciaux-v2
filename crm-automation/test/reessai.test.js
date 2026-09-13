'use strict';
// Le réessai absorbe les à-coups d'affichage. Il ne doit RIEN absorber d'autre.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { avecReessai, tentatives } = require('../lib/reessai.js');

test('réussite du premier coup : une seule tentative, aucune remise', async () => {
  let appels = 0, remises = 0;
  const r = await avecReessai('lecture', 2, () => { appels += 1; return 'ok'; }, { remise: () => { remises += 1; } });
  assert.equal(r, 'ok');
  assert.equal(appels, 1);
  assert.equal(remises, 0, 'rien à ranger quand rien n\'a raté');
});

test('à-coup au premier passage : on remet l\'écran en état, puis on relit', async () => {
  const ordre = [];
  const r = await avecReessai('export Deciplus 2026-07', 2, (n) => {
    ordre.push('lecture' + n);
    if (n === 1) throw new Error("Champ de date introuvable (rang 1) après 20 s d'attente");
    return 'CSV';
  }, { remise: () => { ordre.push('remise'); } });
  assert.equal(r, 'CSV');
  assert.deepEqual(ordre, ['lecture1', 'remise', 'lecture2']);
});

test('échec persistant : la DERNIÈRE erreur remonte, intacte', async () => {
  let appels = 0;
  await assert.rejects(
    () => avecReessai('Fitness Booster Lille', 2, (n) => {
      appels += 1;
      throw new Error('Club affiché « Wasquehal » ≠ attendu « Lille » (essai ' + n + ')');
    }, {}),
    /Club affiché « Wasquehal » ≠ attendu « Lille » \(essai 2\)/,
  );
  assert.equal(appels, 2, 'deux passages, pas trois');
});

test('un contrôle qui reste faux reste un échec — le réessai ne relâche rien', async () => {
  // Le club ne bascule jamais : deux lectures, deux refus, et ça remonte.
  const vus = [];
  await assert.rejects(() => avecReessai('club', 3, () => {
    vus.push('lecture');
    throw new Error('Club affiché « Wasquehal » ≠ attendu « Lille »');
  }, {}), /Club affiché/);
  assert.equal(vus.length, 3);
});

test('une remise qui échoue n\'enterre pas l\'erreur utile', async () => {
  const r = await avecReessai('lecture', 2, (n) => {
    if (n === 1) throw new Error('à-coup');
    return 'ok';
  }, { remise: () => { throw new Error('le panneau ne se referme pas'); } });
  assert.equal(r, 'ok', 'le rangement raté ne doit pas empêcher la seconde lecture');
});

test('tentatives = 1 : réessai désactivé, échec immédiat', async () => {
  let appels = 0;
  await assert.rejects(() => avecReessai('lecture', 1, () => { appels += 1; throw new Error('non'); }, {}), /non/);
  assert.equal(appels, 1);
});

test('le journal dit ce qui est rejoué, et pourquoi', async () => {
  const lignes = [];
  await avecReessai('export Deciplus 2026-07', 2, (n) => { if (n === 1) throw new Error('champ absent'); return 1; },
    { journal: (l) => lignes.push(l) });
  assert.equal(lignes.length, 1);
  assert.match(lignes[0], /export Deciplus 2026-07 — tentative 1\/2 échouée \(champ absent\), on recommence/);
});

test('tentatives() : 2 par défaut, réglable, jamais zéro', () => {
  assert.equal(tentatives({}), 2);
  assert.equal(tentatives({ RECAP2_TENTATIVES: '3' }), 3);
  assert.equal(tentatives({ RECAP2_TENTATIVES: '1' }), 1);
  assert.equal(tentatives({ RECAP2_TENTATIVES: '0' }), 2, 'zéro passage n\'a aucun sens');
  assert.equal(tentatives({ RECAP2_TENTATIVES: 'oui' }), 2);
});
