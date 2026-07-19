'use strict';
// Séances vidéo : parsing YouTube (le lien vient d'un copier-coller humain, donc
// sous n'importe quelle forme) et cohérence du catalogue des 27 séances.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extraireYoutubeId, miniatureYoutube, lecteurYoutube, VIDEOS_SEED, TAILLE_LOTS } = require('../lib/videosSeances');
const { VIDEO_LOTS } = require('../lib/punchSeuils');

const ID = 'RmzmZhk4swU';

test('parsing : les 4 formats de lien donnent le même ID', () => {
  assert.equal(extraireYoutubeId('https://youtu.be/' + ID), ID);
  assert.equal(extraireYoutubeId('https://www.youtube.com/watch?v=' + ID), ID);
  assert.equal(extraireYoutubeId('https://www.youtube.com/embed/' + ID), ID);
  assert.equal(extraireYoutubeId('https://youtube.com/shorts/' + ID), ID);
});

test('parsing : les paramètres et variantes ne gênent pas', () => {
  assert.equal(extraireYoutubeId('https://youtu.be/' + ID + '?t=42'), ID, 'partage avec horodatage');
  assert.equal(extraireYoutubeId('https://www.youtube.com/watch?app=desktop&v=' + ID + '&list=PL1'), ID, 'v= au milieu');
  assert.equal(extraireYoutubeId('http://youtube.com/watch?v=' + ID), ID, 'sans https');
  assert.equal(extraireYoutubeId('  https://youtu.be/' + ID + '  '), ID, 'espaces collés au copier-coller');
  assert.equal(extraireYoutubeId(ID), ID, 'ID nu collé tel quel');
});

test('parsing : un lien invalide est REJETÉ (pas d\'enregistrement d\'un lien mort)', () => {
  ['', null, undefined, 'https://vimeo.com/12345', 'https://youtu.be/trop-court', 'coucou',
    'https://example.com/watch?v=' + ID, 'https://youtu.be/'].forEach((mauvais) => {
    assert.equal(extraireYoutubeId(mauvais), '', `« ${mauvais} » aurait dû être rejeté`);
  });
});

test('miniature et lecteur : construits depuis l\'ID', () => {
  assert.equal(miniatureYoutube(ID), 'https://img.youtube.com/vi/' + ID + '/hqdefault.jpg');
  assert.match(lecteurYoutube(ID), /^https:\/\/www\.youtube-nocookie\.com\/embed\/RmzmZhk4swU\?/);
  assert.equal(miniatureYoutube(''), '', 'pas d\'ID -> pas de miniature bidon');
  assert.equal(lecteurYoutube(''), '');
});

// --- Le catalogue -----------------------------------------------------------
test('catalogue : 27 séances, réparties selon TAILLE_LOTS', () => {
  assert.equal(VIDEOS_SEED.length, 27);
  const parLot = TAILLE_LOTS.map((_, i) => VIDEOS_SEED.filter((v) => v.lot === i + 1).length);
  assert.deepEqual(parLot, TAILLE_LOTS);
  assert.equal(parLot.reduce((a, b) => a + b, 0), 27);
});

test('catalogue : chaque lien est exploitable et unique', () => {
  const ids = VIDEOS_SEED.map((v) => extraireYoutubeId(v.url));
  assert.equal(ids.filter((x) => !x).length, 0, 'aucun lien illisible');
  assert.equal(new Set(ids).size, ids.length, 'aucune séance en double');
  VIDEOS_SEED.forEach((v) => {
    assert.ok(v.titre && v.coach, 'titre et coach renseignés');
    assert.ok(v.lot >= 1 && v.lot <= TAILLE_LOTS.length, `lot ${v.lot} hors bornes`);
  });
});

// Les vidéos ne tombent plus par LOTS : chacune a son seuil dans la table des
// déblocages. TAILLE_LOTS ne décrit donc plus des paliers, seulement la
// composition du catalogue semé. Ce qui doit tenir : autant de lignes « video »
// dans la table que de séances réelles, et pas un seuil inatteignable.
test('catalogue : une ligne de la table par séance, aucun seuil inatteignable', () => {
  const punchSeuils = require('../lib/punchSeuils');
  const total = TAILLE_LOTS.reduce((a, b) => a + b, 0);
  assert.equal(total, 27, 'le catalogue compte 27 séances');
  assert.equal(punchSeuils.nbDeType('video'), total, 'une ligne « video » par séance');
  for (let r = 1; r <= total; r++) {
    const seuil = punchSeuils.seuilVideo(r);
    assert.ok(seuil, `la séance de rang ${r} n'a aucun seuil -> elle resterait fermée à vie`);
    assert.ok(seuil <= punchSeuils.PUNCH_MAX_THEORIQUE, `séance ${r} : seuil ${seuil} inatteignable`);
  }
  // Les seuils sont STRICTEMENT croissants : deux séances au même seuil
  // partageraient une clé de déblocage et l'une serait perdue.
  const seuils = Array.from({ length: total }, (_, i) => punchSeuils.seuilVideo(i + 1));
  seuils.forEach((v, i) => { if (i) assert.ok(v > seuils[i - 1], `séances ${i} et ${i + 1} : seuils non croissants`); });
});

test('catalogue : chaque lot mélange les visages (jamais plus de 2 fois le même)', () => {
  // `coach` = la personne SUR la miniature. Un lot doit présenter un maximum de
  // visages différents — pas 4 fois la même tête, ni « 5 séances de biceps ».
  // ⚠️ La variété ne s'exige QUE des lots d'au moins 3 séances : depuis que les
  // récompenses tombent une par étape du parcours, certains lots ne contiennent
  // qu'UNE vidéo (tailles 5/1/1/3/1/4/1/5/1/5). Un lot d'une séance ne peut pas
  // montrer quatre visages — c'est le prix assumé d'un déblocage à chaque action.
  TAILLE_LOTS.forEach((taille, i) => {
    const l = i + 1;
    const lot = VIDEOS_SEED.filter((v) => v.lot === l);
    if (taille >= 3) assert.ok(new Set(lot.map((v) => v.coach)).size >= 3, `lot ${l} : trop peu de visages différents`);
    const parCoach = {};
    lot.forEach((v) => { parCoach[v.coach] = (parCoach[v.coach] || 0) + 1; });
    Object.entries(parCoach).forEach(([c, n]) => assert.ok(n <= 2, `lot ${l} : ${c} apparaît ${n} fois`));
    assert.equal(new Set(lot.map((v) => v.titre)).size, lot.length, `lot ${l} : deux fois le même titre`);
  });
  // Personne n'est étiqueté « Générique » : chaque miniature a un visage nommé.
  assert.equal(VIDEOS_SEED.filter((v) => v.coach === 'Générique').length, 0);
  // Répartition homogène : un coach très présent (Quentin ×10) reste étalé sur
  // l'ensemble du parcours au lieu d'être concentré sur deux lots.
  const lots = (c) => new Set(VIDEOS_SEED.filter((v) => v.coach === c).map((v) => v.lot)).size;
  assert.ok(lots('Quentin') >= 4, 'Quentin étalé sur au moins 4 lots');
  assert.ok(lots('Alexandre') >= 4, 'Alexandre étalé sur au moins 4 lots');
  assert.ok(lots('Gauthier') >= 4, 'Gauthier étalé sur au moins 4 lots');
});
