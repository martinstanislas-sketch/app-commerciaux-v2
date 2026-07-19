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

// Les guides ne tombent plus par paliers groupés mais UN PAR UN : chacun a son
// seuil dans la table des déblocages. Ce qui doit tenir, c'est la BIJECTION —
// 22 guides rangés, 22 lignes « guide », et pas un seuil inatteignable.
test('Punch : un guide = une ligne de la table, et aucun seuil inatteignable', () => {
  const { RANG_GUIDE } = require('../lib/ebooksSources');
  const punchSeuils = require('../lib/punchSeuils');
  const ids = Object.values(EBOOK_PUNCH).flat();
  assert.equal(ids.length, 22, '22 guides passent par le canal Punch');
  assert.equal(RANG_GUIDE.size, 22, 'chaque guide a un rang, et un seul');
  assert.equal(new Set(RANG_GUIDE.values()).size, 22, 'deux guides ne peuvent pas partager un rang');
  assert.equal(punchSeuils.nbDeType('guide'), 22, 'la table déclare autant de guides qu\'il en existe');
  for (let r = 1; r <= 22; r++) {
    const seuil = punchSeuils.seuilGuide(r);
    assert.ok(seuil, `le guide de rang ${r} n'a aucun seuil -> il resterait fermé à vie`);
    assert.ok(seuil <= PUNCH_MAX_THEORIQUE, `guide ${r} : seuil ${seuil} inatteignable`);
  }
});

test('sourceEbook : chaque id est rangé dans le bon canal', () => {
  assert.deepEqual(sourceEbook(EBOOK_INTRO), { source: 'intro' });
  assert.deepEqual(sourceEbook(14), { source: 'chemin', jour: 2 });
  assert.deepEqual(sourceEbook(39), { source: 'chemin', jour: 39 });
  assert.deepEqual(sourceEbook(8), { source: 'punch', seuil: 105 });
  assert.deepEqual(sourceEbook(7), { source: 'punch', seuil: 1325 });
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

test('canal Punch : débloqué à SON seuil, le JOUR n\'a aucun mot à dire', () => {
  const { RANG_GUIDE } = require('../lib/ebooksSources');
  const punchSeuils = require('../lib/punchSeuils');
  const id = Object.values(EBOOK_PUNCH).flat()[0];   // le tout premier guide servi
  const seuil = punchSeuils.seuilGuide(RANG_GUIDE.get(id));
  const eb = { id, type: 'ebook', unlock_day: 40 };  // unlock_day historique tardif : ignoré
  assert.equal(estVerrouille(eb, { day: 1, punch: seuil }), false, `lisible dès ${seuil} Punch, même au jour 1`);
  assert.equal(estVerrouille(eb, { day: 42, punch: seuil - 1 }), true, 'sans le Punch, même en fin de challenge : fermé');
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

test('vidéo : débloquée à SON seuil ; rang inconnu -> fermée (jamais ouverte par accident)', () => {
  const src = require('../lib/ebooksSources');
  const punchSeuils = require('../lib/punchSeuils');
  const s1 = punchSeuils.seuilVideo(1);
  src.setRangVideo((id) => (id === 1 ? 1 : null)); // seule la vidéo 1 est rangée
  const v = { id: 1, type: 'video' };
  assert.equal(estVerrouille(v, { day: 42, punch: s1 - 1 }), true);
  assert.equal(estVerrouille(v, { day: 0, punch: s1 }), false, 'le JOUR n\'a aucun mot à dire sur une vidéo');
  // Rang inconnu -> fermée. On échoue du côté qui ne donne rien par accident.
  assert.equal(estVerrouille({ id: 99, type: 'video' }, { day: 42, punch: 99999 }), true);
  src.setRangVideo(null); // on ne laisse pas de résolveur derrière soi
  assert.equal(estVerrouille(v, { day: 42, punch: 99999 }), true, 'sans résolveur, tout reste fermé');
});
