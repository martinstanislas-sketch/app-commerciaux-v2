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
test('catalogue : 27 séances, réparties 5/5/5/6/6', () => {
  assert.equal(VIDEOS_SEED.length, 27);
  const parLot = [1, 2, 3, 4, 5].map((l) => VIDEOS_SEED.filter((v) => v.lot === l).length);
  assert.deepEqual(parLot, TAILLE_LOTS);
  assert.equal(parLot.reduce((a, b) => a + b, 0), 27);
});

test('catalogue : chaque lien est exploitable et unique', () => {
  const ids = VIDEOS_SEED.map((v) => extraireYoutubeId(v.url));
  assert.equal(ids.filter((x) => !x).length, 0, 'aucun lien illisible');
  assert.equal(new Set(ids).size, ids.length, 'aucune séance en double');
  VIDEOS_SEED.forEach((v) => {
    assert.ok(v.titre && v.coach, 'titre et coach renseignés');
    assert.ok(v.lot >= 1 && v.lot <= 5, `lot ${v.lot} hors bornes`);
  });
});

test('catalogue : il y a un lot par palier de Punch déclaré', () => {
  assert.equal(TAILLE_LOTS.length, VIDEO_LOTS.length, '5 lots pour 5 seuils');
  assert.deepEqual(VIDEO_LOTS, [250, 650, 1050, 1450, 1750]);
});

test('catalogue : chaque lot mélange les coachs (jamais 5 fois le même)', () => {
  // Un palier doit ouvrir un entraînement varié, pas « 5 séances de biceps ».
  [1, 2, 3, 4, 5].forEach((l) => {
    const lot = VIDEOS_SEED.filter((v) => v.lot === l);
    assert.ok(new Set(lot.map((v) => v.coach)).size >= 3, `lot ${l} : trop peu de variété`);
    assert.equal(new Set(lot.map((v) => v.titre)).size, lot.length, `lot ${l} : deux fois le même titre`);
  });
});
