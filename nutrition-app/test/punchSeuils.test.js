'use strict';
// Fondation du système Punch : la config des seuils (source de vérité unique) et
// le moteur de déblocage. Le compteur est CUMULÉ et ne descend jamais.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const {
  PUNCH_MAX_THEORIQUE, VIDEO_LOTS, EBOOK_TIERS, GIFTS,
  tousLesSeuils, seuilsAtteints, cleSeuil, prochainSeuil,
} = require('../lib/punchSeuils');
const createChallengeEngine = require('../lib/challengePath');

function makeEngine() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
    CREATE TABLE nutrition_parcours_pesees (client_email TEXT, type TEXT, date TEXT, PRIMARY KEY(client_email, type));
    CREATE TABLE nutrition_clients (email TEXT PRIMARY KEY, data TEXT);
    CREATE TABLE nutrition_client_meta (client_email TEXT PRIMARY KEY, ville TEXT DEFAULT '', challenge_no INTEGER DEFAULT 0, updated_at TEXT DEFAULT '');
    CREATE TABLE nutrition_access_codes (ville TEXT, challenge_no INTEGER, code TEXT, actif INTEGER DEFAULT 1, start_date TEXT NOT NULL DEFAULT '', updated_at TEXT DEFAULT '', PRIMARY KEY (ville, challenge_no));
    CREATE TABLE nutrition_parcours_photos (id INTEGER PRIMARY KEY AUTOINCREMENT, client_email TEXT, jalon TEXT, type TEXT, data TEXT, mime TEXT, auteur_role TEXT, auteur_id INTEGER, created_at TEXT);
  `);
  const engine = createChallengeEngine({ getDb: () => db });
  engine.ensureChallengePathSchema();
  db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('challenge_path_enabled','on','')").run();
  db.prepare('INSERT INTO nutrition_clients (email, data) VALUES (?,?)').run('a@a.fr', JSON.stringify({ startDate: '2020-01-01' }));
  return { db, engine, email: 'a@a.fr' };
}
const punchDe = (db, email) => db.prepare('SELECT punch FROM user_game_stats WHERE client_email=?').get(email).punch;

// --- La config : source de vérité unique ------------------------------------
test('seuils : AUCUN ne dépasse le maximum atteignable (4095)', () => {
  const max = Math.max(...tousLesSeuils().map((s) => s.seuil));
  assert.equal(PUNCH_MAX_THEORIQUE, 4305, 'parcours 1180 + série 1215 + missions bonus 1700 + bonus séance 210');
  assert.ok(max <= PUNCH_MAX_THEORIQUE, `seuil ${max} inatteignable (> ${PUNCH_MAX_THEORIQUE})`);
  tousLesSeuils().forEach((s) => assert.ok(s.seuil > 0 && s.seuil <= PUNCH_MAX_THEORIQUE, `seuil ${s.seuil} hors bornes`));
});

test('seuils : un seul objet contient vidéos + ebooks + cadeaux', () => {
  const tous = tousLesSeuils();
  assert.equal(tous.filter((s) => s.type === 'video').length, VIDEO_LOTS.length);
  assert.equal(tous.filter((s) => s.type === 'ebook').length, Object.keys(EBOOK_TIERS).length);
  assert.equal(tous.filter((s) => s.type === 'gift').length, Object.keys(GIFTS).length);
  // Triés par seuil croissant -> l'ordre de déblocage est lisible.
  const seuils = tous.map((s) => s.seuil);
  assert.deepEqual(seuils, [...seuils].sort((a, b) => a - b));
});

test('seuils : un même seuil peut porter DEUX récompenses (1350, 2500)', () => {
  // ⚠️ Les seuils suivent les étapes du parcours : une récompense par action.
  // Les SEULS doublons restants sont les médailles d'avatar, dont la condition
  // est « avoir le badge » — elles tombent avec leur cadeau. Le badge argent
  // (320) a été RETIRÉ, restent l'or (1350) et le platine (2500).
  // L'identité reste (seuil, type), sinon le second déblocage serait avalé.
  assert.deepEqual(tousLesSeuils().filter((s) => s.seuil === 1350).map((s) => s.type).sort(), ['avatar', 'gift']);
  assert.deepEqual(tousLesSeuils().filter((s) => s.seuil === 2500).map((s) => s.type).sort(), ['avatar', 'gift']);
  const cles = tousLesSeuils().map(cleSeuil);
  assert.equal(new Set(cles).size, cles.length, 'chaque (seuil, type) est unique');
});

// ⚠️ Aucun seuil n'est écrit en dur ici : ils vivent dans la TABLE (JSON en
// référence, base en production) et peuvent être ajustés depuis l'admin. Le test
// vérifie donc le CONTRAT, pas des valeurs — sinon il casserait au premier
// réglage légitime, ce qui pousserait à le désactiver.
test('seuilsAtteints : rend ce qui est atteint et pas encore acquis', () => {
  const tous = tousLesSeuils();
  const premier = tous[0];
  assert.deepEqual(seuilsAtteints(premier.seuil - 1, []), [], 'sous le 1er seuil : rien');
  const auPremier = seuilsAtteints(premier.seuil, []).map(cleSeuil);
  assert.deepEqual(auPremier, tous.filter((s) => s.seuil <= premier.seuil).map(cleSeuil));
  assert.deepEqual(seuilsAtteints(premier.seuil, auPremier), [], 'déjà acquis -> plus rien');
  // À un total quelconque : exactement les seuils franchis, ni plus ni moins.
  const T = 620;
  assert.deepEqual(seuilsAtteints(T, []).map(cleSeuil), tous.filter((s) => s.seuil <= T).map(cleSeuil));
  // Idempotence : ce qui est déjà acquis ne ressort jamais.
  const moitie = tous.filter((s) => s.seuil <= T).slice(0, 3).map(cleSeuil);
  const reste = seuilsAtteints(T, moitie).map(cleSeuil);
  assert.equal(reste.filter((c) => moitie.includes(c)).length, 0);
});

test('prochainSeuil : ce qu\'il reste à viser', () => {
  const tous = tousLesSeuils();
  const seuils = [...new Set(tous.map((s) => s.seuil))].sort((a, b) => a - b);
  assert.equal(prochainSeuil(0).seuil, seuils[0], 'le 1er objectif est le plus petit seuil de la table');
  assert.equal(prochainSeuil(seuils[0]).seuil, seuils[1], 'atteint -> on vise le suivant');
  // Au-delà du parcours parfait, il reste du contenu : c'est ce qui donne un
  // sens aux missions bonus.
  const apres2395 = seuils.filter((s) => s > 2395);
  assert.ok(apres2395.length, 'plus rien à viser au-delà de 2395 : les missions bonus ne servent plus à rien');
  assert.equal(prochainSeuil(2395).seuil, apres2395[0]);
  assert.equal(prochainSeuil(PUNCH_MAX_THEORIQUE), null, 'tout est débloqué au maximum');
});

// --- addPunch : le point de passage unique ----------------------------------
test('addPunch : incrémente le total et déclenche les déblocages', () => {
  const { engine, db, email } = makeEngine();
  engine.pathStatsRow(email);
  // Les seuils viennent de la TABLE (ajustable en admin) : on les lit, on ne les
  // récite pas. Ce qui est testé, c'est que addPunch débloque EXACTEMENT ce que
  // le total franchit.
  const attenduA = tousLesSeuils().filter((s) => s.seuil <= 100).map(cleSeuil);
  assert.deepEqual(engine.addPunch(email, 100, 'test').map(cleSeuil), attenduA);
  assert.equal(punchDe(db, email), 100);
  const T = 100 + 25;
  const attenduB = tousLesSeuils().filter((s) => s.seuil > 100 && s.seuil <= T).map(cleSeuil);
  const n = engine.addPunch(email, 25, 'test');
  assert.deepEqual(n.map(cleSeuil), attenduB, 'seulement ce que ce gain-là franchit');
  assert.equal(punchDe(db, email), T);
});

test('addPunch : chaque seuil ne se débloque QU\'UNE fois', () => {
  const { engine, db, email } = makeEngine();
  engine.pathStatsRow(email);
  const T = 105;
  const attendus = tousLesSeuils().filter((s) => s.seuil <= T).length;
  engine.addPunch(email, T, 'test');
  // ⚠️ « repasser au-dessus » : on reste SOUS le seuil suivant, sinon le gain
  // débloquerait légitimement autre chose et le test ne prouverait plus rien.
  const suivant = tousLesSeuils().find((s) => s.seuil > T);
  const marge = Math.max(0, suivant.seuil - T - 1);
  assert.deepEqual(engine.addPunch(email, marge, 'test'), [], 'repasser au-dessus ne redonne rien');
  assert.deepEqual(engine.evaluateUnlocks(email), [], 'ré-évaluer non plus (idempotent)');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM user_unlocks WHERE client_email=?').get(email).c, attendus);
});

test('addPunch : un gros gain débloque TOUT ce qu\'il franchit d\'un coup', () => {
  const { engine, email } = makeEngine();
  engine.pathStatsRow(email);
  const n = engine.addPunch(email, 1350, 'test');
  assert.deepEqual(n.map(cleSeuil), tousLesSeuils().filter((s) => s.seuil <= 1350).map(cleSeuil));
  assert.equal(n.filter((s) => s.seuil === 1350).length, 2, 'les DEUX récompenses du seuil 1350');
  // 1350 porte deux récompenses : le badge OR ET la médaille d'or qu'il
  // conditionne — l'identité (seuil, type) les garde distinctes.
  assert.deepEqual(n.filter((s) => s.seuil === 1350).map((s) => s.type).sort(), ['avatar', 'gift']);
});

test('addPunch : un gain nul ou négatif ne fait rien (le Punch ne descend jamais)', () => {
  const { engine, db, email } = makeEngine();
  engine.pathStatsRow(email);
  engine.addPunch(email, 200, 'test');
  const avant = punchDe(db, email);
  engine.addPunch(email, 0, 'test');
  engine.addPunch(email, -500, 'test');
  assert.equal(punchDe(db, email), avant, 'aucun débit possible');
});

// --- Les sources réelles créditent bien le compteur -------------------------
test('source PARCOURS : valider une étape passe par addPunch et évalue les seuils', () => {
  const { engine, db, email } = makeEngine();
  engine.pathStatsRow(email);
  engine.addPunch(email, 60, 'amorce');
  // L'étape 0 vaut 80 Punch : le total passe à 140, et tout ce qui est en
  // dessous doit être débloqué — quels que soient les seuils de la table.
  ['face', 'profil', 'dos'].forEach((t) => db.prepare("INSERT INTO nutrition_parcours_photos (client_email, jalon, type, data, mime, auteur_role, created_at) VALUES (?,'depart',?,'x','image/jpeg','client','')").run(email, t));
  engine.awardClientEvent(email, 'photo', 'x');
  engine.awardClientEvent(email, 'mensurations', 'x');
  engine.awardClientEvent(email, 'groupe', 'x');
  assert.equal(punchDe(db, email), 140, '60 + 80 (étape Commencer)');
  const acquis = engine.unlockedThresholds(email);
  tousLesSeuils().filter((s) => s.seuil <= 140).forEach((s) => {
    assert.ok(acquis.has(cleSeuil(s)), 'le parcours crédite et débloque ' + cleSeuil(s));
  });
});

test('source SÉRIE : un palier passe par addPunch et évalue les seuils', () => {
  const { engine, db, email } = makeEngine();
  engine.pathStatsRow(email);
  engine.addPunch(email, 100, 'amorce');
  const hier = require('../lib/challengePath').pathYmdMinusDays(require('../lib/challengePath').pathParisYmd(), 1);
  db.prepare("UPDATE user_game_stats SET streak_current=2, last_win_date=? WHERE client_email=?").run(hier, email);
  const r = engine.recordDayWin(email, 2); // 3e jour -> palier +15 -> total 115
  assert.deepEqual(r.palier, { jours: 3, punch: 15 });
  assert.equal(punchDe(db, email), 115);
  // La série passe bien par addPunch : elle débloque ce que 100 -> 115 franchit.
  assert.deepEqual((r.debloques || []).map(cleSeuil),
    tousLesSeuils().filter((s) => s.seuil > 100 && s.seuil <= 115).map(cleSeuil));
});

test('état public : les déblocages et le prochain seuil sont exposés au front', () => {
  const { engine, email } = makeEngine();
  engine.pathStatsRow(email);
  engine.addPunch(email, 280, 'test');
  const st = engine.challengePublicState(email);
  assert.deepEqual(st.unlocks.sort(), tousLesSeuils().filter((s) => s.seuil <= 280).map(cleSeuil).sort());
  const suivant = tousLesSeuils().find((s) => s.seuil > 280);
  assert.equal(st.prochainSeuil.seuil, suivant.seuil, 'le front peut dire « encore X Punch »');
  assert.equal(st.stats.punch, 280);
});

// --- LA TABLE EST UNE DONNÉE : ce qui doit tenir quoi qu'on y écrive ---------
// Les seuils sont désormais éditables depuis l'admin, donc modifiables par
// quelqu'un qui ne lira jamais ce fichier. Ces tests protègent les invariants
// que l'édition pourrait casser sans que rien ne le signale à l'écran.
test('table : la référence du dépôt est complète et exploitable', () => {
  const P = require('../lib/punchSeuils');
  assert.equal(P.nbDeType('video'), 27, '27 séances');
  assert.equal(P.nbDeType('guide'), 22, '22 guides par le canal Punch');
  assert.equal(Object.keys(P.gifts()).length, 9, '9 cadeaux (5 retirés), badges compris');
  assert.equal(P.avatarSeuils().length, 12, '12 accessoires (médaille argent retirée avec son badge)');
  assert.equal(P.tousLesSeuils().length, 70, '70 déblocages au total');
});

test('table : aucune collision (seuil, type) — sinon un déblocage disparaît', () => {
  const P = require('../lib/punchSeuils');
  // C'est la CLÉ PRIMAIRE de user_unlocks : deux lignes de même type au même
  // seuil n'en feraient qu'une, et la seconde ne tomberait jamais.
  assert.deepEqual(P.collisions(), [], 'la référence ne doit contenir aucun doublon');
  const dup = P.collisions([
    { seuil: 500, type: 'video', nom: 'A', rang: 1 },
    { seuil: 500, type: 'video', nom: 'B', rang: 2 },
  ]);
  assert.equal(dup.length, 1, 'deux vidéos au même seuil : refusé');
  // Un badge et sa médaille partagent le seuil : c'est légitime, deux types.
  assert.deepEqual(P.collisions([{ seuil: 320, type: 'badge', nom: 'Argent', ref: 'badge_argent', bonus_accessoire: 'medaille_argent' }]), []);
});

test('table : un badge débloque AUSSI sa médaille, au même seuil', () => {
  const P = require('../lib/punchSeuils');
  const ligne = P.table().find((d) => d.bonus_accessoire);
  assert.ok(ligne, 'la référence déclare au moins un badge avec médaille');
  const acc = P.avatarSeuils().filter((a) => a.seuil === ligne.seuil);
  assert.ok(acc.some((a) => a.payload.accessoire === ligne.bonus_accessoire), 'la médaille tombe avec son badge');
});

test('table : setTable refuse le vide et garde la référence', () => {
  const P = require('../lib/punchSeuils');
  const avant = P.table().length;
  assert.equal(P.setTable([]), false, 'une table vide est refusée');
  assert.equal(P.table().length, avant, 'la table précédente est conservée');
  assert.equal(P.setTable(null), false);
  assert.equal(P.table().length, avant);
  // Une ligne inexploitable est écartée, les autres passent.
  assert.equal(P.setTable([{ seuil: 'abc', type: 'video' }, { seuil: 300, type: 'video', rang: 1, nom: 'V1' }]), true);
  assert.equal(P.table().length, 1);
  assert.equal(P.seuilVideo(1), 300);
  P.setTable(P.tableReference()); // on ne laisse pas la référence altérée derrière soi
  assert.equal(P.table().length, avant);
});

test('table : un rang absent laisse le contenu FERMÉ, jamais ouvert à tous', () => {
  const P = require('../lib/punchSeuils');
  assert.equal(P.seuilVideo(999), null, 'rang inconnu -> pas de seuil');
  assert.equal(P.seuilGuide(0), null);
  assert.equal(P.seuilVideo(null), null);
  assert.equal(P.seuilVideo('abc'), null);
});

// --- Le bonus de séance : aucune action sans récompense ----------------------
test('bonus séance : crédité une fois par jour, et JAMAIS deux fois', () => {
  const { engine, db, email } = makeEngine();
  const P = require('../lib/challengePath');
  engine.pathStatsRow(email);
  const avant = punchDe(db, email);
  const r1 = engine.awardSeanceBonus(email, '2026-07-01');
  assert.ok(r1, 'la 1re séance du jour rapporte');
  assert.equal(r1.punch, P.PUNCH_SEANCE_BONUS);
  assert.equal(punchDe(db, email), avant + P.PUNCH_SEANCE_BONUS);
  // ⚠️ LE garde-fou : la route séance est un TOGGLE. Décocher puis recocher ne
  // doit rien rapporter, sinon le Punch se farme à l'infini.
  assert.equal(engine.awardSeanceBonus(email, '2026-07-01'), null, 'même jour -> rien');
  assert.equal(punchDe(db, email), avant + P.PUNCH_SEANCE_BONUS, 'le total n\'a pas bougé');
  // Un autre jour, en revanche, rapporte de nouveau.
  assert.ok(engine.awardSeanceBonus(email, '2026-07-02'));
  assert.equal(punchDe(db, email), avant + 2 * P.PUNCH_SEANCE_BONUS);
});

test('bonus séance : il passe par addPunch, donc il peut faire tomber un seuil', () => {
  const { engine, db, email } = makeEngine();
  engine.pathStatsRow(email);
  const premier = tousLesSeuils()[0];
  engine.addPunch(email, premier.seuil - 3, 'amorce'); // juste sous le 1er seuil
  const avant = engine.unlockedThresholds(email).size;
  engine.awardSeanceBonus(email, '2026-07-03');        // +5 -> le seuil tombe
  assert.ok(engine.unlockedThresholds(email).size > avant, 'le bonus déclenche bien les déblocages');
});

test('bonus séance : reste petit devant une étape du parcours', () => {
  const P = require('../lib/challengePath');
  assert.ok(P.PUNCH_SEANCE_BONUS > 0, 'un gain nul ne se fêterait pas');
  assert.ok(P.PUNCH_SEANCE_BONUS < 25, 'le parcours doit rester la route principale (une étape séance vaut 25)');
  // Le plafond déclaré doit couvrir ce que le bonus peut ajouter : 42 jours.
  const { PUNCH_MAX_THEORIQUE } = require('../lib/punchSeuils');
  assert.ok(PUNCH_MAX_THEORIQUE >= 4095 + 42 * P.PUNCH_SEANCE_BONUS, 'le plafond n\'intègre pas le bonus');
});
