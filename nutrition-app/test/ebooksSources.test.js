'use strict';
// Répartition des 35 ebooks : 1 offert + 12 par le Chemin + 22 par les paliers de
// Punch. Ces ids viennent de la PROD et ont été validés un par un : un test qui
// casse ici veut dire qu'un contenu a changé de place sans décision.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EBOOK_INTRO, EBOOK_CHEMIN, EBOOK_PUNCH, sourceEbook, idsRepartis } = require('../lib/ebooksSources');
const { EBOOK_TIERS, PUNCH_MAX_THEORIQUE } = require('../lib/punchSeuils');
const { CHALLENGE_PATH_NODES } = require('../lib/challengePath');

test('contrôle : 1 + 12 + 22 = 35, et chaque ebook n\'a QU\'UNE place', () => {
  const tous = idsRepartis();
  assert.equal(tous.length, 35);
  assert.equal(Object.keys(EBOOK_CHEMIN).length, 12);
  assert.equal(Object.values(EBOOK_PUNCH).flat().length, 22);
  assert.equal(new Set(tous).size, tous.length, 'un ebook rangé à deux endroits');
});

test('Chemin : EXACTEMENT les 12 étapes « Découvre ton guide »', () => {
  const jours = Object.keys(EBOOK_CHEMIN).map(Number).sort((a, b) => a - b);
  assert.deepEqual(jours, [2, 4, 9, 11, 16, 18, 23, 25, 30, 32, 37, 39]);
  // Et ces jours SONT bien les étapes ebook du parcours — pas un jour au hasard.
  const joursEbookDuChemin = CHALLENGE_PATH_NODES.filter((n) => n.type === 'ebook').map((n) => n.day).sort((a, b) => a - b);
  assert.deepEqual(jours, joursEbookDuChemin, 'un ebook est rangé sur une étape qui n\'en est pas une');
});

test('Punch : les paliers collent au barème déclaré (2/3/3/3/3/4/4)', () => {
  Object.keys(EBOOK_TIERS).forEach((seuil) => {
    const ids = EBOOK_PUNCH[seuil];
    assert.ok(ids, `le palier ${seuil} n'a aucun ebook`);
    assert.equal(ids.length, EBOOK_TIERS[seuil], `palier ${seuil} : ${ids.length} ebooks au lieu de ${EBOOK_TIERS[seuil]}`);
  });
  assert.deepEqual(Object.keys(EBOOK_PUNCH).map(Number).sort((a, b) => a - b), Object.keys(EBOOK_TIERS).map(Number).sort((a, b) => a - b));
  // Aucun palier au-dessus du maximum atteignable -> aucun ebook verrouillé à vie.
  Object.keys(EBOOK_PUNCH).forEach((s) => assert.ok(Number(s) <= PUNCH_MAX_THEORIQUE, `palier ${s} inatteignable`));
});

test('sourceEbook : chaque id est rangé dans le bon canal', () => {
  assert.deepEqual(sourceEbook(EBOOK_INTRO), { source: 'intro' });
  assert.deepEqual(sourceEbook(14), { source: 'chemin', jour: 2 });
  assert.deepEqual(sourceEbook(39), { source: 'chemin', jour: 39 });
  assert.deepEqual(sourceEbook(8), { source: 'punch', seuil: 150 });
  assert.deepEqual(sourceEbook(7), { source: 'punch', seuil: 1600 });
  // Un id inconnu -> null : le serveur retombe sur unlock_day, jamais verrouillé à vie.
  assert.equal(sourceEbook(999), null);
  assert.equal(sourceEbook(null), null);
});

test('aucun orphelin : les 35 ids ont tous une source, et une seule', () => {
  idsRepartis().forEach((id) => {
    const s = sourceEbook(id);
    assert.ok(s, `ebook ${id} sans source`);
    assert.ok(['intro', 'chemin', 'punch'].includes(s.source));
  });
});

test('l\'intro n\'est ni dans le Chemin ni dans les paliers', () => {
  assert.ok(!Object.values(EBOOK_CHEMIN).includes(EBOOK_INTRO));
  assert.ok(!Object.values(EBOOK_PUNCH).flat().includes(EBOOK_INTRO));
});

test('le challenge ne distribue plus que 12 ebooks (contre ~34 avant)', () => {
  // Le cœur du ticket : le Chemin se resserre, le reste passe au Punch.
  assert.equal(Object.keys(EBOOK_CHEMIN).length, 12);
  assert.equal(Object.values(EBOOK_PUNCH).flat().length, 22, 'le reste est distribué par le Punch');
});

// ---------------------------------------------------------------------------
//  estVerrouille — LA règle du verrou, partagée par la liste ET les routes de
//  lecture. Verrou du bug corrigé : un ebook du canal Punch doit se LIRE dès son
//  seuil atteint, peu importe le jour du challenge.
// ---------------------------------------------------------------------------
const { estVerrouille } = require('../lib/ebooksSources');

test('canal Punch : débloqué au seuil, le JOUR n\'a aucun mot à dire', () => {
  const id = EBOOK_PUNCH[150][0]; // premier ebook du palier 150
  const eb = { id, type: 'ebook', unlock_day: 40 }; // unlock_day historique tardif : ignoré
  assert.equal(estVerrouille(eb, { day: 1, punch: 150 }), false, 'lisible dès 150 Punch, même au jour 1');
  assert.equal(estVerrouille(eb, { day: 42, punch: 149 }), true, 'sans le Punch, même en fin de challenge : fermé');
});

test('canal Chemin : débloqué au JOUR de son étape, le Punch n\'y change rien', () => {
  const jour = 16; const eb = { id: EBOOK_CHEMIN[jour], type: 'ebook', unlock_day: 1 };
  assert.equal(estVerrouille(eb, { day: 15, punch: 9999 }), true);
  assert.equal(estVerrouille(eb, { day: 16, punch: 0 }), false);
});

test('offert : jamais verrouillé ; hors répartition : règle historique unlock_day', () => {
  assert.equal(estVerrouille({ id: EBOOK_INTRO, type: 'ebook', unlock_day: 99 }, { day: 0, punch: 0 }), false);
  const inconnu = { id: 9999, type: 'ebook', unlock_day: 10 };
  assert.equal(estVerrouille(inconnu, { day: 9, punch: 9999 }), true);
  assert.equal(estVerrouille(inconnu, { day: 10, punch: 0 }), false);
});

test('vidéo : débloquée au Punch de son lot ; lot inconnu -> fermée (jamais ouverte par accident)', () => {
  const { VIDEO_LOTS } = require('../lib/punchSeuils');
  const v = { id: 1, type: 'video', video_lot: 1 };
  assert.equal(estVerrouille(v, { day: 42, punch: VIDEO_LOTS[0] - 1 }), true);
  assert.equal(estVerrouille(v, { day: 0, punch: VIDEO_LOTS[0] }), false);
  assert.equal(estVerrouille({ id: 1, type: 'video', video_lot: 99 }, { day: 42, punch: 99999 }), true);
});
