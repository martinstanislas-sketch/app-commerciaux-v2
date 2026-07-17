'use strict';
// Tests du catalogue de la boutique dépensable (source de vérité des cadeaux + prix).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const boutique = require('../lib/boutique');

test('boutique : 14 cadeaux, prix croissants attendus', () => {
  const cat = boutique.catalogue();
  assert.equal(cat.length, 14);
  assert.deepEqual(cat.map((c) => c.prix),
    [300, 450, 600, 800, 1000, 1200, 1350, 1500, 1800, 2000, 2500, 3000, 3500, 4000],
    'les prix, triés croissants');
  // Le plus cher = le massage à 4000 (atteignable pile au max de Punch : 2395 + 1700 bonus).
  assert.equal(cat[cat.length - 1].id, 'massage');
  assert.equal(cat[cat.length - 1].prix, 4000);
});

test('boutique : ids uniques, chaque cadeau a label/nature/prix', () => {
  const ids = new Set();
  boutique.CADEAUX_BOUTIQUE.forEach((c) => {
    assert.ok(c.id && !ids.has(c.id), 'id unique : ' + c.id); ids.add(c.id);
    assert.ok(c.label, 'label pour ' + c.id);
    assert.ok(c.prix > 0, 'prix > 0 pour ' + c.id);
    assert.ok(['physique', 'digital'].includes(c.nature), 'nature valide pour ' + c.id);
  });
});

test('boutique : prixDe / estPhysique / cadeau', () => {
  assert.equal(boutique.prixDe('massage'), 4000);
  assert.equal(boutique.prixDe('badge_or'), 1350);
  assert.equal(boutique.prixDe('inconnu'), null);
  assert.equal(boutique.estPhysique('massage'), true, 'le massage se retire au studio');
  assert.equal(boutique.estPhysique('badge_or'), false, 'un badge est digital');
  assert.equal(boutique.cadeau('bilan_proche').label, 'Bilan forme offert à un proche');
});

test('boutique : meilleurTier renvoie le liseré le plus prestigieux possédé', () => {
  assert.equal(boutique.meilleurTier([]), '');
  assert.equal(boutique.meilleurTier(['badge_argent']), 'argent');
  assert.equal(boutique.meilleurTier(['badge_argent', 'badge_platine', 'badge_or']), 'platine');
  assert.equal(boutique.meilleurTier(['massage', 'coaching_individuel']), '', 'aucun badge -> pas de liseré');
});
