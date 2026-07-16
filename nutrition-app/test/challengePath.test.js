'use strict';
// Tests du moteur « Chemin du challenge » (parcours gamifié 42 jours).
// Couvre : déblocage séquentiel, rollover Europe/Paris, reset de streak,
// attribution du Punch, idempotence (un événement ne valide pas 2×).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const {
  createChallengeEngine, CHALLENGE_PATH_NODES, FLOW_STEP_EVENT,
  pathDaysBetween, pathYmdMinusDays, pathParisYmd, streakAfterOpen, streakAffiche, activeDayFromDone,
} = require('../lib/challengePath');

// Fabrique un moteur branché sur une DB in-memory, avec le flag ON et une date de
// départ (par défaut très ancienne -> parcours « démarré », tous les jours dus).
function makeEngine({ enabled = true, startDate = '2020-01-01' } = {}) {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
    CREATE TABLE nutrition_parcours_pesees (client_email TEXT, type TEXT, date TEXT, PRIMARY KEY(client_email, type));
    CREATE TABLE nutrition_clients (email TEXT PRIMARY KEY, data TEXT);
    CREATE TABLE nutrition_client_meta (client_email TEXT PRIMARY KEY, ville TEXT DEFAULT '', challenge_no INTEGER DEFAULT 0, updated_at TEXT DEFAULT '');
    CREATE TABLE nutrition_access_codes (ville TEXT, challenge_no INTEGER, code TEXT, actif INTEGER DEFAULT 1, start_date TEXT NOT NULL DEFAULT '', updated_at TEXT DEFAULT '', PRIMARY KEY (ville, challenge_no));
    CREATE TABLE nutrition_parcours_photos (id INTEGER PRIMARY KEY AUTOINCREMENT, client_email TEXT NOT NULL DEFAULT '',
      jalon TEXT NOT NULL DEFAULT '', type TEXT NOT NULL DEFAULT '', data TEXT NOT NULL DEFAULT '', mime TEXT NOT NULL DEFAULT '',
      auteur_role TEXT NOT NULL DEFAULT '', auteur_id INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT '');
  `);
  const getDb = () => db;
  const engine = createChallengeEngine({ getDb });
  engine.ensureChallengePathSchema();
  if (enabled) db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('challenge_path_enabled','on','')").run();
  if (startDate) db.prepare('INSERT INTO nutrition_clients (email, data) VALUES (?,?)').run('a@a.fr', JSON.stringify({ startDate }));
  return { db, engine, email: 'a@a.fr' };
}
function eventFor(day) { return CHALLENGE_PATH_NODES.find((n) => n.day === day).event; }
// Le Chemin nomme ses jalons debut/mi/fin, Mon Parcours depart/s3/s6.
const JALON_PARCOURS = { debut: 'depart', mi: 's3', fin: 's6' };
// Dépose une photo réelle (comme le ferait l'upload) pour le jalon d'une étape.
function ajouterPhoto(db, email, jalonChemin, type) {
  db.prepare("INSERT INTO nutrition_parcours_photos (client_email, jalon, type, data, mime, auteur_role, created_at) VALUES (?,?,?,'x','image/jpeg','client','')")
    .run(email, JALON_PARCOURS[jalonChemin] || jalonChemin, type);
}
// Réalise une étape : pour une étape COMPOSITE, joue toutes ses sous-étapes.
// Les photos exigent les 3 prises : on les dépose avant d'émettre l'événement.
function doNode(engine, email, day, db) {
  const n = CHALLENGE_PATH_NODES.find((x) => x.day === day);
  if (n.flow) {
    n.flow.forEach((s) => {
      if (s === 'photos' && db) ['face', 'profil', 'dos'].forEach((t) => ajouterPhoto(db, email, n.jalon, t));
      engine.awardClientEvent(email, FLOW_STEP_EVENT[s], 'ref' + day);
    });
    return;
  }
  engine.awardClientEvent(email, n.event, 'ref' + day);
}
function completeAll(engine, email, db) {
  let guard = 0;
  while (guard++ < 200) {
    const active = engine.pathActiveDay(email);
    if (active === null) break; // === null : l'étape 0 est falsy
    doNode(engine, email, active, db);
    if (engine.pathActiveDay(email) === active) break; // bloqué -> on sort
  }
}

// --- MIGRATION XP + gems -> Punch -------------------------------------------
// Reproduit une base à l'ANCIEN schéma (comptes en cours) et vérifie que la
// bascule additionne les deux compteurs — et qu'elle ne les additionne qu'une fois.
function makeVieilleBase() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
    CREATE TABLE nutrition_parcours_pesees (client_email TEXT, type TEXT, date TEXT, PRIMARY KEY(client_email, type));
    CREATE TABLE nutrition_clients (email TEXT PRIMARY KEY, data TEXT);
    CREATE TABLE nutrition_client_meta (client_email TEXT PRIMARY KEY, ville TEXT DEFAULT '', challenge_no INTEGER DEFAULT 0, updated_at TEXT DEFAULT '');
    CREATE TABLE nutrition_access_codes (ville TEXT, challenge_no INTEGER, code TEXT, actif INTEGER DEFAULT 1, start_date TEXT NOT NULL DEFAULT '', updated_at TEXT DEFAULT '', PRIMARY KEY (ville, challenge_no));
    CREATE TABLE path_nodes (day INTEGER PRIMARY KEY, week INTEGER NOT NULL, type TEXT NOT NULL, validation_event TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '', xp INTEGER NOT NULL DEFAULT 0, gems INTEGER NOT NULL DEFAULT 0,
      is_milestone INTEGER NOT NULL DEFAULT 0, meta TEXT NOT NULL DEFAULT '');
    CREATE TABLE user_node_progress (client_email TEXT NOT NULL, node_day INTEGER NOT NULL, completed_at TEXT NOT NULL DEFAULT '',
      xp_awarded INTEGER NOT NULL DEFAULT 0, gems_awarded INTEGER NOT NULL DEFAULT 0, ref_id TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (client_email, node_day));
    CREATE TABLE user_game_stats (client_email TEXT PRIMARY KEY, xp_total INTEGER NOT NULL DEFAULT 0, gems INTEGER NOT NULL DEFAULT 0,
      streak_current INTEGER NOT NULL DEFAULT 0, streak_best INTEGER NOT NULL DEFAULT 0, jokers INTEGER NOT NULL DEFAULT 0,
      last_ebook_open_date TEXT NOT NULL DEFAULT '', last_win_date TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '');
  `);
  return db;
}

test('migration : le Punch d\'un compte en cours = ancien XP + anciens gems', () => {
  const db = makeVieilleBase();
  db.prepare("INSERT INTO user_game_stats (client_email, xp_total, gems, streak_current, streak_best, jokers) VALUES ('a@a.fr', 240, 100, 5, 9, 2)").run();
  db.prepare("INSERT INTO user_game_stats (client_email, xp_total, gems) VALUES ('zero@a.fr', 0, 0)").run();
  createChallengeEngine({ getDb: () => db }).ensureChallengePathSchema();
  const a = db.prepare("SELECT * FROM user_game_stats WHERE client_email='a@a.fr'").get();
  assert.equal(a.punch, 340, '240 XP + 100 gems');
  assert.equal(a.streak_current, 5, 'la série en cours est intacte');
  assert.equal(a.streak_best, 9, 'le record est intact');
  assert.equal(db.prepare("SELECT punch FROM user_game_stats WHERE client_email='zero@a.fr'").get().punch, 0);
});

test('migration : rejouée au redémarrage, elle ne double PAS les compteurs', () => {
  const db = makeVieilleBase();
  db.prepare("INSERT INTO user_game_stats (client_email, xp_total, gems) VALUES ('a@a.fr', 240, 100)").run();
  const engine = createChallengeEngine({ getDb: () => db });
  engine.ensureChallengePathSchema();
  engine.ensureChallengePathSchema(); // redémarrage du serveur
  engine.ensureChallengePathSchema();
  assert.equal(db.prepare("SELECT punch FROM user_game_stats WHERE client_email='a@a.fr'").get().punch, 340);
});

test('migration : le Punch gagné APRÈS la bascule n\'est pas réécrasé par la somme', () => {
  const db = makeVieilleBase();
  db.prepare("INSERT INTO user_game_stats (client_email, xp_total, gems) VALUES ('a@a.fr', 240, 100)").run();
  const engine = createChallengeEngine({ getDb: () => db });
  engine.ensureChallengePathSchema();
  db.prepare("UPDATE user_game_stats SET punch = punch + 25 WHERE client_email='a@a.fr'").run(); // une séance validée
  engine.ensureChallengePathSchema(); // redémarrage : la somme ne doit pas revenir à 340
  assert.equal(db.prepare("SELECT punch FROM user_game_stats WHERE client_email='a@a.fr'").get().punch, 365);
});

test('migration : le seed v3 réécrit les étapes avec leur Punch', () => {
  const db = makeVieilleBase();
  createChallengeEngine({ getDb: () => db }).ensureChallengePathSchema();
  const rows = db.prepare('SELECT * FROM path_nodes ORDER BY day').all();
  assert.equal(rows.length, 43);
  assert.equal(rows.find((r) => r.day === 0).punch, 80);
  assert.equal(rows.find((r) => r.day === 1).punch, 25);
  assert.equal(rows.reduce((a, r) => a + r.punch, 0), CHALLENGE_PATH_NODES.reduce((a, n) => a + n.punch, 0));
});

// --- Helpers purs ----------------------------------------------------------
test('pathDaysBetween : jours calendaires signés', () => {
  assert.equal(pathDaysBetween('2026-01-01', '2026-01-01'), 0);
  assert.equal(pathDaysBetween('2026-01-01', '2026-01-08'), 7);
  assert.equal(pathDaysBetween('2026-03-01', '2026-02-28'), -1);
  assert.equal(pathDaysBetween('2026-02-28', '2026-03-01'), 1); // 2026 non bissextile
});

test('pathYmdMinusDays : recule d\'un jour (bord de mois)', () => {
  assert.equal(pathYmdMinusDays('2026-03-01', 1), '2026-02-28');
  assert.equal(pathYmdMinusDays('2026-01-01', 1), '2025-12-31');
});

test('pathParisYmd : format YYYY-MM-DD stable', () => {
  assert.match(pathParisYmd('2026-06-15T10:00:00Z'), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(pathParisYmd('2026-06-15'), '2026-06-15');
});

test('streakAfterOpen : consécutif +1, même jour inchangé, reprise à 1', () => {
  assert.equal(streakAfterOpen(4, '2026-01-01', '2026-01-01'), 4);
  assert.equal(streakAfterOpen(0, '', '2026-01-02'), 1);
  assert.equal(streakAfterOpen(4, '2026-01-01', '2026-01-02'), 5);
  assert.equal(streakAfterOpen(0, '2026-01-01', '2026-01-05'), 1);
});

test('activeDayFromDone : première étape non validée (séquentiel strict, 0-based)', () => {
  assert.equal(activeDayFromDone(new Set(), 43), 0);
  assert.equal(activeDayFromDone(new Set([0, 1, 2]), 43), 3);
  assert.equal(activeDayFromDone(new Set(Array.from({ length: 43 }, (_, i) => i)), 43), null);
  // PIÈGE : l'étape 0 est falsy. « étape 0 » et « terminé » ne doivent JAMAIS
  // se confondre — tout appelant doit tester === null.
  assert.notEqual(activeDayFromDone(new Set(), 43), null, 'l\'étape 0 n\'est pas « terminé »');
});

// --- DATE DE DÉBUT DE LA COHORTE (lance le parcours pour tout le groupe) ------
// Rattache un client à un groupe daté (ville + n° de challenge + start_date).
function seedCohorte(db, email, startDate, { ville = 'Lyon', no = 3 } = {}) {
  db.prepare('INSERT OR REPLACE INTO nutrition_client_meta (client_email, ville, challenge_no) VALUES (?,?,?)').run(email, ville, no);
  db.prepare('INSERT OR REPLACE INTO nutrition_access_codes (ville, challenge_no, code, actif, start_date) VALUES (?,?,?,1,?)').run(ville, no, '482100', startDate);
}

test('cohorte : la date du groupe PRIME sur la pesée de départ individuelle', () => {
  const { db, engine, email } = makeEngine({ startDate: '2020-01-01' });
  db.prepare("INSERT INTO nutrition_parcours_pesees (client_email, type, date) VALUES (?,'depart','2020-06-01')").run(email);
  assert.equal(engine.pathStartYmd(email), '2020-06-01', 'sans cohorte : la pesée de départ fait foi');
  seedCohorte(db, email, '2020-03-15');
  assert.equal(engine.pathStartYmd(email), '2020-03-15', 'avec cohorte datée : c\'est elle qui fait foi');
});

test('cohorte : sans date posée, on retombe sur le comportement individuel', () => {
  const { db, engine, email } = makeEngine({ startDate: '2020-01-01' });
  seedCohorte(db, email, ''); // groupe SANS date -> aucune régression
  db.prepare("INSERT INTO nutrition_parcours_pesees (client_email, type, date) VALUES (?,'depart','2020-06-01')").run(email);
  assert.equal(engine.pathStartYmd(email), '2020-06-01');
  assert.equal(engine.cohortStartYmd(email), '');
});

test('cohorte : une date FUTURE tient le chemin verrouillé jusqu\'au jour J', () => {
  const { db, engine, email } = makeEngine();
  const demain = pathYmdMinusDays(pathParisYmd(), -1); // +1 jour
  seedCohorte(db, email, demain);
  assert.ok(engine.pathCurrentDay(email) <= 0, 'le parcours ne doit pas être démarré');
  // Aucun événement ne peut valider quoi que ce soit avant le jour J.
  assert.equal(engine.awardClientEvent(email, 'photo', 'x'), null);
  assert.equal(engine.pathActiveDay(email), 0, 'l\'étape 0 reste intacte');
  const st = engine.challengePublicState(email);
  assert.equal(st.started, false);
  assert.equal(st.startsOn, demain, 'le front doit pouvoir annoncer la date');
});

test('cohorte : le jour J, le parcours s\'ouvre et les étapes se valident', () => {
  const { db, engine, email } = makeEngine();
  seedCohorte(db, email, pathParisYmd()); // démarre aujourd'hui
  assert.equal(engine.pathCurrentDay(email), 1);
  ['face', 'profil', 'dos'].forEach((t) => ajouterPhoto(db, email, 'debut', t));
  engine.awardClientEvent(email, 'photo', 'x');
  engine.awardClientEvent(email, 'mensurations', 'x');
  const r = engine.awardClientEvent(email, 'groupe', 'x'); // flow complet
  assert.ok(r, 'l\'étape 0 doit être validable le jour J');
  assert.equal(r.day, 0);
  assert.equal(engine.challengePublicState(email).started, true);
});

test('cohorte : tout le groupe partage le même jour de parcours', () => {
  const { db, engine } = makeEngine({ startDate: null });
  const j5 = pathYmdMinusDays(pathParisYmd(), 4); // démarré il y a 4 jours -> jour 5
  ['a1@a.fr', 'a2@a.fr'].forEach((e) => seedCohorte(db, e, j5));
  assert.equal(engine.pathCurrentDay('a1@a.fr'), 5);
  assert.equal(engine.pathCurrentDay('a2@a.fr'), 5, 'même cohorte = même jour, quel que soit le client');
});

// --- Seed ------------------------------------------------------------------
test('seed : 43 étapes (0→42), aucune pesée, 4 jalons ★, 6 semaines bien bornées', () => {
  const { db } = makeEngine();
  const rows = db.prepare('SELECT * FROM path_nodes ORDER BY day').all();
  assert.equal(rows.length, 43);
  assert.deepEqual(rows.map((r) => r.day), Array.from({ length: 43 }, (_, i) => i), 'index 0→42 contigus');
  assert.equal(rows.filter((r) => r.type === 'pesee').length, 0, 'la pesée ne fait plus partie du parcours');
  // ★ = les 3 jalons (debut/mi/fin) + le bilan final.
  assert.deepEqual(rows.filter((r) => r.is_milestone).map((r) => r.day), [0, 21, 41, 42]);
  assert.deepEqual(rows.filter((r) => r.meta).map((r) => r.day + ':' + r.meta), ['0:debut', '21:mi', '41:fin']);
  // Découpage : S1 0–7 (8 étapes), puis 7 par semaine.
  const bornes = { 1: [0, 7], 2: [8, 14], 3: [15, 21], 4: [22, 28], 5: [29, 35], 6: [36, 42] };
  rows.forEach((r) => {
    const [a, b] = bornes[r.week];
    assert.ok(r.day >= a && r.day <= b, `étape ${r.day} hors de la semaine ${r.week}`);
  });
  assert.deepEqual(Object.keys(bornes).map((w) => rows.filter((r) => r.week === Number(w)).length), [8, 7, 7, 7, 7, 7]);
});

test('seed : types et titres conformes à la table de vérité', () => {
  const { db } = makeEngine();
  const byDay = {};
  db.prepare('SELECT * FROM path_nodes').all().forEach((r) => { byDay[r.day] = r; });
  assert.equal(byDay[0].type, 'commencer');
  assert.equal(byDay[0].title, 'Commencer');
  assert.equal(byDay[7].title, 'Bilan de la semaine');
  assert.equal(byDay[13].title, "Photo d'assiette");
  assert.equal(byDay[21].type, 'check');
  assert.equal(byDay[21].title, 'Point mi-parcours');
  assert.equal(byDay[34].title, 'Communauté');
  assert.equal(byDay[41].title, 'Point final');
  assert.equal(byDay[42].type, 'final');
  assert.equal(byDay[42].title, 'Bilan final');
  // Répartition des types sur l'ensemble.
  const n = (t) => Object.values(byDay).filter((r) => r.type === t).length;
  assert.deepEqual([n('seance'), n('ebook'), n('special'), n('bilan'), n('check')], [18, 12, 5, 4, 2]);
});

test('étapes composites : flow + jalon présents dans la donnée exposée', () => {
  const { engine, email } = makeEngine();
  const nodes = engine.challengePublicState(email).nodes;
  const at = (d) => nodes.find((n) => n.day === d);
  assert.deepEqual(at(0).flow, ['photos', 'mensurations', 'groupe']);
  assert.equal(at(0).jalon, 'debut');
  assert.deepEqual(at(21).flow, ['photos', 'mensurations']);
  assert.equal(at(21).jalon, 'mi');
  assert.deepEqual(at(41).flow, ['photos', 'mensurations']);
  assert.equal(at(41).jalon, 'fin');
  // Les étapes simples n'ont pas de flow.
  assert.equal(at(1).flow, null);
  assert.equal(at(1).jalon, '');
  // L'action (libellé du bouton) est exposée pour la Phase 2.
  assert.equal(at(1).action, 'Valider la séance');
  assert.equal(at(0).action, 'Photos + mensurations + présente-toi au groupe');
});

// --- Moteur : déblocage séquentiel -----------------------------------------
test('déblocage séquentiel : bon événement valide + avance ; mauvais événement ignoré', () => {
  const { engine, email, db } = makeEngine();
  assert.equal(engine.pathActiveDay(email), 0, 'on démarre à l\'étape 0 « Commencer »');
  // étape active = Commencer (composite) ; une séance ne doit RIEN valider
  assert.equal(engine.awardClientEvent(email, 'seance', 1), null);
  assert.equal(engine.pathActiveDay(email), 0);
  doNode(engine, email, 0, db); // flow complet -> validée
  assert.equal(engine.pathActiveDay(email), 1, 'on avance à l\'étape 1 (Séance)');
  // étape active = Séance ; un ebook ne doit RIEN valider (le retard décale la suite)
  assert.equal(engine.awardClientEvent(email, 'ebook', 'x'), null);
  assert.equal(engine.pathActiveDay(email), 1);
  const r = engine.awardClientEvent(email, 'seance', 'x');
  assert.ok(r);
  assert.equal(r.day, 1);
  assert.equal(r.punch, 25);
  assert.equal(r.nextDay, 2);
  assert.equal(engine.pathActiveDay(email), 2);
});

// --- ÉTAPE 13 : une photo POSTÉE AU GROUPE ----------------------------------
// L'événement 'groupe_photo' n'est émis que par un post communautaire CONTENANT une
// image (cf. POST /api/community/messages) — jamais à l'ouverture de la communauté.
test('étape 13 : un post PHOTO la valide', () => {
  const { engine, email, db } = makeEngine();
  for (let d = 0; d < 13; d++) doNode(engine, email, d, db);
  assert.equal(engine.pathActiveDay(email), 13);
  const r = engine.awardClientEvent(email, 'groupe_photo', 'post1');
  assert.ok(r, 'la photo postée valide l\'étape');
  assert.equal(r.day, 13);
  assert.equal(r.punch, 20);
  assert.equal(engine.pathActiveDay(email), 14);
});

test('étape 13 : un post TEXTE (sans photo) ne la valide PAS', () => {
  const { engine, email, db } = makeEngine();
  for (let d = 0; d < 13; d++) doNode(engine, email, d, db);
  assert.equal(engine.awardClientEvent(email, 'groupe', 'post-texte'), null, 'un post sans photo ne suffit pas');
  assert.equal(engine.pathActiveDay(email), 13, 'l\'étape reste active');
});

test('étape 13 : ouvrir la communauté ne valide rien', () => {
  const { engine, email, db } = makeEngine();
  for (let d = 0; d < 13; d++) doNode(engine, email, d, db);
  // Ouvrir n'émet aucun événement : rien ne bouge.
  assert.equal(engine.pathActiveDay(email), 13);
  assert.equal(engine.challengePublicState(email).nodes.find((n) => n.day === 13).status, 'active');
});

test('étape 13 : re-poster une photo ne double PAS la validation', () => {
  const { engine, email, db } = makeEngine();
  for (let d = 0; d < 13; d++) doNode(engine, email, d, db);
  engine.awardClientEvent(email, 'groupe_photo', 'post1');
  const punch = engine.pathStatsRow(email).punch;
  const r2 = engine.awardClientEvent(email, 'groupe_photo', 'post2');
  assert.equal(r2, null, 'aucune seconde validation');
  assert.equal(engine.pathStatsRow(email).punch, punch, 'aucun Punch en double');
});

test('étape 13 : l\'ancien événement « plate » ne la valide plus', () => {
  const { engine, email, db } = makeEngine();
  for (let d = 0; d < 13; d++) doNode(engine, email, d, db);
  assert.equal(engine.awardClientEvent(email, 'plate', 'x'), null, 'l\'écran d\'analyse ne valide plus l\'étape 13');
  assert.equal(engine.pathActiveDay(email), 13);
  // Plus aucune étape du parcours n'attend « plate ».
  assert.equal(CHALLENGE_PATH_NODES.filter((n) => n.event === 'plate').length, 0);
});

test('étapes « groupe » (27/34) : une photo reste un post et les valide', () => {
  // Le serveur tente groupe_photo puis groupe : une photo ne doit pas bloquer une
  // étape qui demande simplement de poster.
  const { engine, email, db } = makeEngine();
  for (let d = 0; d < 27; d++) doNode(engine, email, d, db);
  assert.equal(engine.pathActiveDay(email), 27);
  assert.equal(engine.awardClientEvent(email, 'groupe_photo', 'p'), null, '27 n\'attend pas une photo');
  const r = engine.awardClientEvent(email, 'groupe', 'p'); // le repli du serveur
  assert.ok(r, 'le post valide bien l\'étape 27');
  assert.equal(r.day, 27);
});

// --- MESSAGE COACH : étapes 6 et 20 -----------------------------------------
// Ces étapes se valident sur l'ENVOI réel d'un message (l'événement 'coach' n'est
// émis que par POST /api/messages/coach) — jamais à l'ouverture de la conversation.
function allerJusqua(engine, email, db, cible) {
  for (let d = 0; d < cible; d++) doNode(engine, email, d, db);
}
[6, 20].forEach((jour) => {
  test('étape ' + jour + ' : un message coach envoyé la valide', () => {
    const { engine, email, db } = makeEngine();
    allerJusqua(engine, email, db, jour);
    assert.equal(engine.pathActiveDay(email), jour);
    const r = engine.awardClientEvent(email, 'coach', 'msg1');
    assert.ok(r, 'l\'envoi valide l\'étape');
    assert.equal(r.day, jour);
    assert.equal(engine.pathActiveDay(email), jour + 1, 'le parcours avance');
  });

  test('étape ' + jour + ' : idempotence — un 2e message ne re-valide pas', () => {
    const { engine, email, db } = makeEngine();
    allerJusqua(engine, email, db, jour);
    const punchApres1 = (engine.awardClientEvent(email, 'coach', 'msg1') || {}).punch;
    const avant = engine.pathStatsRow(email).punch;
    const r2 = engine.awardClientEvent(email, 'coach', 'msg2');
    assert.equal(r2, null, 'aucune seconde validation');
    assert.equal(engine.pathStatsRow(email).punch, avant, 'aucun Punch en double');
    assert.equal(punchApres1, 20);
  });
});

test('message coach : ouvrir la conversation ne valide rien (seul l\'envoi compte)', () => {
  const { engine, email, db } = makeEngine();
  allerJusqua(engine, email, db, 6);
  // Ouvrir la conversation n'émet AUCUN événement : le moteur ne voit rien passer.
  assert.equal(engine.pathActiveDay(email), 6, 'l\'étape 6 reste active tant que rien n\'est envoyé');
  assert.equal(engine.pathStatsRow(email).punch, CHALLENGE_PATH_NODES.filter((n) => n.day < 6).reduce((a, n) => a + n.punch, 0));
});

// --- PHOTOS : la sous-étape exige les 3 prises (face / profil / dos) ---------
test('photos : 2/3 -> sous-étape NON cochée ; 3/3 -> cochée', () => {
  const { engine, email, db } = makeEngine();
  ajouterPhoto(db, email, 'debut', 'face');
  assert.equal(engine.awardClientEvent(email, 'photo', 'p1'), null);
  assert.equal(engine.flowDone(email, 0).has('photos'), false, '1 photo : rien de coché');
  ajouterPhoto(db, email, 'debut', 'profil');
  engine.awardClientEvent(email, 'photo', 'p2');
  assert.equal(engine.flowDone(email, 0).has('photos'), false, '2 photos : toujours rien');
  ajouterPhoto(db, email, 'debut', 'dos');
  engine.awardClientEvent(email, 'photo', 'p3');
  assert.equal(engine.flowDone(email, 0).has('photos'), true, '3 photos : la sous-étape est cochée');
  assert.equal(engine.pathActiveDay(email), 0, 'l\'étape reste active : mensurations et groupe manquent');
});

test('photos : le compteur exposé au front suit les dépôts (2/3 puis 3/3)', () => {
  const { engine, email, db } = makeEngine();
  const compteur = () => engine.challengePublicState(email).nodes.find((n) => n.day === 0).photos;
  assert.deepEqual(compteur(), { fait: 0, requis: 3 });
  ajouterPhoto(db, email, 'debut', 'face');
  ajouterPhoto(db, email, 'debut', 'profil');
  assert.deepEqual(compteur(), { fait: 2, requis: 3 }, 'le front affiche « 2/3 photos ajoutées »');
  ajouterPhoto(db, email, 'debut', 'dos');
  assert.deepEqual(compteur(), { fait: 3, requis: 3 });
  // Une étape sans photos dans son flow n'expose pas de compteur.
  assert.equal(engine.challengePublicState(email).nodes.find((n) => n.day === 1).photos, null);
});

test('photos : la 4e photo « libre » ne compte pas dans les 3 exigées', () => {
  const { engine, email, db } = makeEngine();
  ['face', 'profil', 'libre'].forEach((t) => ajouterPhoto(db, email, 'debut', t));
  assert.equal(engine.awardClientEvent(email, 'photo', 'x'), null, 'libre ne remplace pas « dos »');
  assert.equal(engine.flowDone(email, 0).has('photos'), false);
  assert.deepEqual(engine.challengePublicState(email).nodes.find((n) => n.day === 0).photos, { fait: 2, requis: 3 });
});

test('photos : 3 fois la MÊME prise ne vaut pas 3 photos', () => {
  const { engine, email, db } = makeEngine();
  ['face', 'face', 'face'].forEach((t) => ajouterPhoto(db, email, 'debut', t));
  assert.equal(engine.awardClientEvent(email, 'photo', 'x'), null, 'trois fois « face » = 1 seule prise');
  assert.equal(engine.flowDone(email, 0).has('photos'), false);
});

test('photos : les photos d\'un AUTRE jalon ne valident pas l\'étape en cours', () => {
  const { engine, email, db } = makeEngine();
  // Photos du point final déposées en avance : elles ne doivent rien débloquer à l'étape 0.
  ['face', 'profil', 'dos'].forEach((t) => ajouterPhoto(db, email, 'fin', t));
  assert.equal(engine.awardClientEvent(email, 'photo', 'x'), null);
  assert.equal(engine.flowDone(email, 0).has('photos'), false, 'le jalon « debut » n\'a aucune photo');
});

// --- PHASE 2 : étapes composites, le flow doit être COMPLET ------------------
test('composite : l\'étape 0 ne se valide QUE si tout son flow est fait', () => {
  const { engine, email, db } = makeEngine();
  // photos + mensurations + groupe requis : chaque sous-étape seule ne suffit pas.
  ['face', 'profil', 'dos'].forEach((t) => ajouterPhoto(db, email, 'debut', t));
  assert.equal(engine.awardClientEvent(email, 'photo', 'x'), null, 'photos seules ne valident pas');
  assert.equal(engine.pathActiveDay(email), 0, 'on reste sur l\'étape 0');
  assert.equal(engine.awardClientEvent(email, 'mensurations', 'x'), null, 'photo+mensurations ne suffisent pas');
  assert.equal(engine.pathActiveDay(email), 0);
  const r = engine.awardClientEvent(email, 'groupe', 'x'); // la 3e complète le flow
  assert.ok(r, 'le flow complet valide l\'étape');
  assert.equal(r.day, 0);
  assert.equal(r.punch, 80); // 30 XP + 50 gems fusionnés
  assert.equal(engine.pathActiveDay(email), 1);
});

test('composite : ordre LIBRE — groupe puis mensurations puis photos valide aussi', () => {
  const { engine, email, db } = makeEngine();
  assert.equal(engine.awardClientEvent(email, 'groupe', 'x'), null);
  assert.equal(engine.awardClientEvent(email, 'mensurations', 'x'), null);
  ['face', 'profil', 'dos'].forEach((t) => ajouterPhoto(db, email, 'debut', t));
  assert.ok(engine.awardClientEvent(email, 'photo', 'x'), 'l\'ordre ne doit pas compter');
  assert.equal(engine.pathActiveDay(email), 1);
});

test('composite : un événement hors du flow est ignoré et ne coche rien', () => {
  const { engine, email, db } = makeEngine();
  assert.equal(engine.awardClientEvent(email, 'seance', 'x'), null);
  assert.equal(engine.awardClientEvent(email, 'ebook', 'x'), null);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM user_node_flow WHERE client_email=?').get(email).c, 0);
  assert.equal(engine.pathActiveDay(email), 0);
});

test('composite : répéter la même sous-étape ne fait pas avancer le flow', () => {
  const { engine, email, db } = makeEngine();
  ['face', 'profil', 'dos'].forEach((t) => ajouterPhoto(db, email, 'debut', t));
  engine.awardClientEvent(email, 'photo', 'a');
  engine.awardClientEvent(email, 'photo', 'b');
  engine.awardClientEvent(email, 'photo', 'c');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM user_node_flow WHERE client_email=?').get(email).c, 1, 'une seule sous-étape cochée');
  assert.equal(engine.pathActiveDay(email), 0, 'l\'étape n\'est toujours pas validée');
});

test('composite : le Point mi-parcours (21) ne demande que photos + mensurations', () => {
  const { engine, email, db } = makeEngine();
  // On amène le parcours jusqu'à l'étape 21.
  for (let d = 0; d <= 20; d++) doNode(engine, email, d, db);
  assert.equal(engine.pathActiveDay(email), 21);
  ['face', 'profil', 'dos'].forEach((t) => ajouterPhoto(db, email, 'mi', t)); // jalon 'mi' -> photos rangées sous 's3'
  assert.equal(engine.awardClientEvent(email, 'photo', 'x'), null);
  const r = engine.awardClientEvent(email, 'mensurations', 'x'); // pas de 'groupe' attendu ici
  assert.ok(r, 'photos + mensurations suffisent pour le point mi-parcours');
  assert.equal(r.day, 21);
});

test('composite : l\'avancement du flow est exposé au front (flowDone)', () => {
  const { engine, email } = makeEngine();
  engine.awardClientEvent(email, 'groupe', 'x');
  const n0 = engine.challengePublicState(email).nodes.find((n) => n.day === 0);
  assert.deepEqual(n0.flow, ['photos', 'mensurations', 'groupe']);
  assert.deepEqual(n0.flowDone, ['groupe'], 'le front doit pouvoir cocher les sous-étapes faites');
  assert.equal(n0.status, 'active', 'l\'étape reste active tant que le flow est incomplet');
  // Les étapes simples n'exposent pas de flow.
  assert.equal(engine.challengePublicState(email).nodes.find((n) => n.day === 1).flowDone, null);
});

test('flag OFF : aucun événement ne valide', () => {
  const { engine, email } = makeEngine({ enabled: false });
  assert.equal(engine.awardClientEvent(email, 'photo', 'x'), null);
  assert.equal(engine.pathActiveDay(email), 0);
});

test('parcours non démarré (pas de date) : aucun événement ne valide', () => {
  const { engine, email } = makeEngine({ startDate: null });
  assert.equal(engine.pathCurrentDay(email), 0);
  assert.equal(engine.awardClientEvent(email, 'pesee', 'x'), null);
});

// --- PUNCH (monnaie unique) / idempotence -----------------------------------
test('parcours complet : Punch = somme du barème ; ré-émission = aucun double (idempotence)', () => {
  const { engine, email, db } = makeEngine();
  completeAll(engine, email, db);
  assert.equal(engine.pathActiveDay(email), null);
  const sumPunch = CHALLENGE_PATH_NODES.reduce((a, n) => a + n.punch, 0);
  assert.equal(db.prepare('SELECT * FROM user_game_stats WHERE client_email=?').get(email).punch, sumPunch);
  // ré-émettre tous les événements ne doit rien ajouter (parcours terminé + PK idempotente)
  completeAll(engine, email, db);
  assert.equal(db.prepare('SELECT * FROM user_game_stats WHERE client_email=?').get(email).punch, sumPunch);
});

test('barème : chaque étape vaut l\'ancien XP + les anciens gems (aucune valeur perdue)', () => {
  // Le total du parcours doit rester identique à l'avant-fusion : 43 étapes,
  // séance 25 / ebook 15 / spécial-bilan 20, jalons 80 / 90 / 100 / 100.
  const parType = {};
  CHALLENGE_PATH_NODES.forEach((n) => { (parType[n.type] = parType[n.type] || new Set()).add(n.punch); });
  assert.deepEqual([...parType.seance], [25]);
  assert.deepEqual([...parType.ebook], [15]);
  assert.deepEqual([...parType.special], [20]);
  assert.deepEqual([...parType.bilan], [20]);
  assert.equal(CHALLENGE_PATH_NODES.find((n) => n.day === 0).punch, 80, 'Commencer : 30 XP + 50 gems');
  assert.equal(CHALLENGE_PATH_NODES.find((n) => n.day === 21).punch, 90, 'mi-parcours : 40 + 50');
  assert.equal(CHALLENGE_PATH_NODES.find((n) => n.day === 41).punch, 100, 'point final : 50 + 50');
  assert.equal(CHALLENGE_PATH_NODES.find((n) => n.day === 42).punch, 100, 'bilan final : 50 + 50');
  // Plus aucune étape ne porte d'ancien champ xp/gems.
  CHALLENGE_PATH_NODES.forEach((n) => {
    assert.equal(n.xp, undefined, `étape ${n.day} : le champ xp doit avoir disparu`);
    assert.equal(n.gems, undefined, `étape ${n.day} : le champ gems doit avoir disparu`);
  });
});

test('idempotence fine : revalider une étape déjà faite n\'ajoute pas de Punch', () => {
  const { engine, email, db } = makeEngine();
  doNode(engine, email, 0, db); // étape 0 -> done
  // La PK (client_email, node_day) bloque tout double-crédit, y compris sur l'étape 0.
  const dup = db.prepare("INSERT OR IGNORE INTO user_node_progress (client_email, node_day, completed_at) VALUES (?,?,?)").run(email, 0, 'x');
  assert.equal(dup.changes, 0); // déjà présent -> ignoré
});

test('RÉGRESSION : compléter une semaine n\'accorde plus rien d\'autre que le Punch', () => {
  const { engine, email, db } = makeEngine();
  for (let d = 0; d <= 7; d++) doNode(engine, email, d, db); // S1 complète (étapes 0..7)
  const cols = db.prepare('PRAGMA table_info(user_game_stats)').all().map((c) => c.name);
  assert.ok(!cols.includes('jokers'), 'la colonne jokers ne doit plus exister');
  const attendu = CHALLENGE_PATH_NODES.filter((n) => n.week === 1).reduce((a, n) => a + n.punch, 0);
  assert.equal(db.prepare('SELECT punch FROM user_game_stats WHERE client_email=?').get(email).punch, attendu);
});

// --- Streak / rollover Paris ------------------------------------------------
// --- SÉRIE 🔥 alimentée par les REPAS (règles produit 1-2-3) -----------------
const streakDe = (db, email) => db.prepare('SELECT * FROM user_game_stats WHERE client_email=?').get(email);

test('série : un jour gagné (2 repas) monte la série, en direct', () => {
  const { engine, email, db } = makeEngine();
  const r = engine.recordDayWin(email, 2);
  assert.equal(r.gagne, true);
  assert.equal(r.nouveau, true, 'la série vient de monter');
  const s = streakDe(db, email);
  assert.equal(s.streak_current, 1);
  assert.equal(s.streak_best, 1);
  assert.equal(s.last_win_date, pathParisYmd());
});

test('série : IDEMPOTENT — le même jour ne peut ajouter qu\'une fois', () => {
  const { engine, email, db } = makeEngine();
  engine.recordDayWin(email, 2);
  const r2 = engine.recordDayWin(email, 3); // 3e repas renseigné le même jour
  assert.equal(r2.gagne, true);
  assert.equal(r2.nouveau, false, 'la série ne remonte pas une 2e fois');
  assert.equal(streakDe(db, email).streak_current, 1);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM user_day_wins WHERE client_email=?').get(email).c, 1);
});

test('série : jours consécutifs -> +1 par jour', () => {
  const { engine, email, db } = makeEngine();
  const hier = pathYmdMinusDays(pathParisYmd(), 1);
  // On simule un jour gagné hier (série à 4).
  db.prepare("INSERT INTO user_game_stats (client_email, streak_current, streak_best, last_win_date, updated_at) VALUES (?,4,4,?,'')").run(email, hier);
  db.prepare('INSERT INTO user_day_wins (client_email, day_ymd, repas, won_at) VALUES (?,?,2,\'\')').run(email, hier);
  engine.recordDayWin(email, 2);
  const s = streakDe(db, email);
  assert.equal(s.streak_current, 5);
  assert.equal(s.streak_best, 5);
});

test('série : UN SEUL jour manqué casse la chaîne (plus aucune protection)', () => {
  const { engine, email, db } = makeEngine();
  const avantHier = pathYmdMinusDays(pathParisYmd(), 2); // 1 jour plein manqué (hier)
  db.prepare("INSERT INTO user_game_stats (client_email, streak_current, streak_best, last_win_date, updated_at) VALUES (?,6,6,?,'')").run(email, avantHier);
  engine.recordDayWin(email, 2);
  const s = streakDe(db, email);
  assert.equal(s.streak_current, 1, 'la série repart à 1, elle n\'est plus sauvée');
  assert.equal(s.streak_best, 6, 'le record est conservé');
});

test('série : plusieurs jours manqués -> la série repart à 1 au prochain jour gagné', () => {
  const { engine, email, db } = makeEngine();
  const vieux = pathYmdMinusDays(pathParisYmd(), 4); // 3 jours pleins manqués
  db.prepare("INSERT INTO user_game_stats (client_email, streak_current, streak_best, last_win_date, updated_at) VALUES (?,9,9,?,'')").run(email, vieux);
  engine.recordDayWin(email, 2);
  const s = streakDe(db, email);
  assert.equal(s.streak_current, 1, 'la série repart à 1');
  assert.equal(s.streak_best, 9, 'le record est conservé');
});

test('série : flag OFF -> aucun gain', () => {
  const { engine, email, db } = makeEngine({ enabled: false });
  const r = engine.recordDayWin(email, 3);
  assert.equal(r.gagne, false);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM user_day_wins WHERE client_email=?').get(email).c, 0);
});

test('série : dayWon dit si la journée est déjà gagnée (notif du soir)', () => {
  const { engine, email } = makeEngine();
  assert.equal(engine.dayWon(email, pathParisYmd()), false);
  engine.recordDayWin(email, 2);
  assert.equal(engine.dayWon(email, pathParisYmd()), true);
  assert.equal(engine.dayWon(email, pathYmdMinusDays(pathParisYmd(), 1)), false);
});

// --- (d) Réconciliation à l'OUVERTURE : filet de sécurité, sans consommation ---
test('streakAffiche : projection pure (aucun effet de bord)', () => {
  const t = '2026-07-16';
  assert.equal(streakAffiche(5, '2026-07-16', t), 5, 'gagné aujourd\'hui : intacte');
  assert.equal(streakAffiche(5, '2026-07-15', t), 5, 'gagné hier : intacte');
  assert.equal(streakAffiche(5, '2026-07-14', t), 0, '1 jour manqué : ROMPUE');
  assert.equal(streakAffiche(5, '2026-07-12', t), 0, '3 jours manqués : ROMPUE');
  assert.equal(streakAffiche(0, '2026-07-01', t), 0, 'série déjà à 0');
  assert.equal(streakAffiche(4, '', t), 4, 'aucun jour gagné connu');
});

test('ouverture : lire l\'état n\'écrit RIEN (règle d)', () => {
  const { engine, email, db } = makeEngine();
  const vieux = pathYmdMinusDays(pathParisYmd(), 3); // 2 jours pleins manqués
  db.prepare("INSERT INTO user_game_stats (client_email, streak_current, streak_best, last_win_date, updated_at) VALUES (?,8,8,?,'')").run(email, vieux);
  // Le client ouvre son app plusieurs fois sans rien renseigner.
  engine.challengePublicState(email);
  engine.challengePublicState(email);
  const s = db.prepare('SELECT * FROM user_game_stats WHERE client_email=?').get(email);
  assert.equal(s.streak_current, 8, 'la série stockée n\'est pas touchée par une lecture');
  assert.equal(s.last_win_date, vieux, 'le dernier jour gagné n\'est pas déplacé');
  // …mais l'affichage annonce déjà la chaîne rompue (1 jour manqué suffit).
  assert.equal(engine.challengePublicState(email).stats.streak, 0);
});

test('ouverture : chaîne rompue -> affiche 🔥 0 sans rien écrire', () => {
  const { engine, email, db } = makeEngine();
  const vieux = pathYmdMinusDays(pathParisYmd(), 5); // 4 jours manqués
  db.prepare("INSERT INTO user_game_stats (client_email, streak_current, streak_best, last_win_date, updated_at) VALUES (?,9,9,?,'')").run(email, vieux);
  assert.equal(engine.challengePublicState(email).stats.streak, 0, 'affiche 0');
  const s = db.prepare('SELECT * FROM user_game_stats WHERE client_email=?').get(email);
  assert.equal(s.streak_current, 9, 'la lecture n\'a rien écrit');
  assert.equal(s.streak_best, 9, 'record conservé');
});

test('ouverture : longue absence -> 🔥 0, aucun crash', () => {
  const { engine, email, db } = makeEngine();
  db.prepare("INSERT INTO user_game_stats (client_email, streak_current, streak_best, last_win_date, updated_at) VALUES (?,12,12,'2020-01-01','')").run(email);
  const st = engine.challengePublicState(email);
  assert.equal(st.stats.streak, 0);
  assert.equal(st.stats.streakBest, 12);
  assert.deepEqual(Object.keys(st.stats).sort(), ['punch', 'streak', 'streakBest'], 'l\'état public n\'expose plus ni XP, ni gems, ni jokers');
});

test('RÉGRESSION : l\'ouverture d\'ebook ne fait PLUS monter la série', () => {
  const { engine, email, db } = makeEngine();
  engine.recordEbookOpen(email, 1);
  engine.recordEbookOpen(email, 2);
  assert.equal(engine.pathStatsRow(email).streak_current, 0, 'seuls les repas alimentent la série');
  // …mais l'ouverture reste journalisée (et valide toujours les étapes ebook).
  assert.equal(db.prepare('SELECT COUNT(*) c FROM user_ebook_opens WHERE client_email=?').get(email).c, 2);
});

test('reconcileStreak : des jours manqués remettent le streak à 0', () => {
  const { engine, email, db } = makeEngine();
  const last = pathYmdMinusDays(pathParisYmd(), 3); // dernier jour gagné il y a 3 jours -> 2 jours pleins manqués
  db.prepare("INSERT INTO user_game_stats (client_email, streak_current, streak_best, last_win_date, updated_at) VALUES (?,?,?,?,'')")
    .run(email, 5, 5, last);
  engine.reconcileStreak(email);
  const s = db.prepare('SELECT * FROM user_game_stats WHERE client_email=?').get(email);
  assert.equal(s.streak_current, 0);
  assert.equal(s.streak_best, 5);    // le record est conservé
});

test('reconcileStreak : un seul jour manqué suffit à remettre le streak à 0', () => {
  const { engine, email, db } = makeEngine();
  const last = pathYmdMinusDays(pathParisYmd(), 2); // 1 jour plein manqué
  db.prepare("INSERT INTO user_game_stats (client_email, streak_current, streak_best, last_win_date, updated_at) VALUES (?,?,?,?,'')")
    .run(email, 7, 7, last);
  engine.reconcileStreak(email);
  const s = db.prepare('SELECT * FROM user_game_stats WHERE client_email=?').get(email);
  assert.equal(s.streak_current, 0, 'plus de protection : la chaîne est cassée');
  assert.equal(s.streak_best, 7);
});

test('reconcileStreak : rien manqué (gagné hier) -> la série est intacte', () => {
  const { engine, email, db } = makeEngine();
  const hier = pathYmdMinusDays(pathParisYmd(), 1);
  db.prepare("INSERT INTO user_game_stats (client_email, streak_current, streak_best, last_win_date, updated_at) VALUES (?,?,?,?,'')")
    .run(email, 3, 3, hier);
  engine.reconcileStreak(email);
  assert.equal(db.prepare('SELECT * FROM user_game_stats WHERE client_email=?').get(email).streak_current, 3);
});
