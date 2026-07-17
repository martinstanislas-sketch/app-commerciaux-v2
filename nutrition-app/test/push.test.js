'use strict';
// Tests du moteur push — relances du soir (repas 20h / série 21h), anti-spam
// (max UNE relance du soir, la plus pertinente), message coach (scénario A),
// déblocage de récompense (notif à l'événement, groupée si multiple), et
// respect des préférences par catégorie.
//
// L'horloge est INJECTÉE (nowFn) : mardi 3 mars 2026, 20h05 à Paris — hors
// heures calmes, pour que rien ne soit différé à 8h pendant les tests.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const initPush = require('../lib/push');
const { createChallengeEngine } = require('../lib/challengePath');

const T0 = new Date('2026-03-03T19:05:00Z'); // 20:05 Paris (CET) — un mardi
const TODAY = '2026-03-03';
const HIER = '2026-03-02';

// Fabrique un moteur push branché sur une DB in-memory complète.
function makePush({ now = T0 } = {}) {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
    CREATE TABLE nutrition_clients (email TEXT PRIMARY KEY, data TEXT, prenom TEXT DEFAULT '', coach_id INTEGER DEFAULT 0);
    CREATE TABLE nutrition_parcours_pesees (client_email TEXT, type TEXT, date TEXT, PRIMARY KEY(client_email, type));
    CREATE TABLE nutrition_client_meta (client_email TEXT PRIMARY KEY, ville TEXT DEFAULT '', challenge_no INTEGER DEFAULT 0, updated_at TEXT DEFAULT '');
    CREATE TABLE nutrition_access_codes (ville TEXT, challenge_no INTEGER, code TEXT, actif INTEGER DEFAULT 1, start_date TEXT NOT NULL DEFAULT '', updated_at TEXT DEFAULT '', PRIMARY KEY (ville, challenge_no));
    CREATE TABLE nutrition_adherence (client_email TEXT, date TEXT, suivi INTEGER DEFAULT 0, adapte INTEGER DEFAULT 0, autre INTEGER DEFAULT 0, saute INTEGER DEFAULT 0);
    CREATE TABLE nutrition_parcours_seances (client_email TEXT, date TEXT);
    CREATE TABLE nutrition_parcours_photos (id INTEGER PRIMARY KEY AUTOINCREMENT, client_email TEXT NOT NULL DEFAULT '',
      jalon TEXT NOT NULL DEFAULT '', type TEXT NOT NULL DEFAULT '', data TEXT NOT NULL DEFAULT '', mime TEXT NOT NULL DEFAULT '',
      auteur_role TEXT NOT NULL DEFAULT '', auteur_id INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT '');
  `);
  const getDb = () => db;
  // Le schéma du Chemin (user_game_stats, user_day_wins, user_unlocks…) + flag ON.
  createChallengeEngine({ getDb }).ensureChallengePathSchema();
  db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('challenge_path_enabled','on','')").run();
  // App/middlewares factices : on ne teste pas les routes HTTP ici.
  const app = { get() {}, post() {} };
  const mw = { requireAuth: (q, r, n) => n(), requireNutritionUse: (q, r, n) => n(), requireCoachOrAdmin: (q, r, n) => n() };
  const push = initPush({ app, getDb, mw, nowFn: () => now });
  return { db, push };
}

// Un client Challenge abonné au push, avec sa série et l'état de sa journée.
// `subscribed:false` -> client SANS abonnement (utile pour tester processQueue
// sans que web-push ne tente un vrai envoi réseau).
function seedClient(db, email, { streak = 0, lastWin = '', dayWon = false, prenom = 'Alex', subscribed = true } = {}) {
  db.prepare('INSERT INTO nutrition_clients (email, data, prenom) VALUES (?,?,?)')
    .run(email, JSON.stringify({ startDate: '2020-01-01', plan: { ok: 1 }, profil: { objectif: 'challenge' } }), prenom);
  if (subscribed) {
    db.prepare("INSERT INTO nutrition_push_subscriptions (client_email, endpoint, p256dh, auth, created_at) VALUES (?,?,'k','a','')")
      .run(email, 'https://push.example/' + email);
  }
  db.prepare('INSERT INTO user_game_stats (client_email, punch, streak_current, last_win_date) VALUES (?,0,?,?)')
    .run(email, streak, lastWin);
  if (dayWon) db.prepare("INSERT INTO user_day_wins (client_email, day_ymd, repas, won_at) VALUES (?,?,2,'')").run(email, TODAY);
}

function queueOf(db, email) {
  return db.prepare("SELECT type, title, body, url, count, status, bypass_cap FROM nutrition_push_queue WHERE client_email=? ORDER BY id").all(email);
}

// ---------------------------------------------------------------------------
//  Relances du soir : éligibilité + anti-spam
// ---------------------------------------------------------------------------
test('streak >= 3 + jour non validé -> alerte série (avec nb de jours), pas de rappel repas', () => {
  const { db, push } = makePush();
  seedClient(db, 'c@c.fr', { streak: 7, lastWin: HIER });
  push._internal.runRappelRepas();
  push._internal.runSerieDanger();
  const q = queueOf(db, 'c@c.fr');
  assert.equal(q.length, 1, 'une seule relance du soir');
  assert.equal(q[0].type, 'serie');
  assert.match(q[0].title, /série de 7 jours/i);
  assert.match(q[0].body, /avant minuit/i);
  assert.equal(q[0].url, '/nutrition/?push=plan');
  assert.equal(q[0].bypass_cap, 1, 'une série en jeu ne saute jamais pour cause de plafond');
});

test('streak 1-2 : alerte série au ton léger (sans pression de minuit)', () => {
  const { db, push } = makePush();
  seedClient(db, 'c@c.fr', { streak: 1, lastWin: HIER, prenom: 'Léa' });
  push._internal.runSerieDanger();
  const q = queueOf(db, 'c@c.fr');
  assert.equal(q.length, 1);
  assert.match(q[0].title, /Léa/);
  assert.doesNotMatch(q[0].title, /en jeu|minuit/i);
});

test('streak 0 + jour non validé -> rappel repas, PAS d\'alerte série', () => {
  const { db, push } = makePush();
  seedClient(db, 'c@c.fr', { streak: 0 });
  push._internal.runRappelRepas();
  push._internal.runSerieDanger();
  const q = queueOf(db, 'c@c.fr');
  assert.equal(q.length, 1, 'une seule relance du soir');
  assert.equal(q[0].type, 'repas');
  assert.equal(q[0].url, '/nutrition/?push=plan');
  // Ton positif, jamais culpabilisant.
  assert.doesNotMatch(q[0].title + q[0].body, /dommage|raté|tu n'as pas|oublié/i);
});

test('série ROMPUE (dernier jour gagné avant-hier) -> traitée comme streak 0 : rappel repas', () => {
  const { db, push } = makePush();
  seedClient(db, 'c@c.fr', { streak: 5, lastWin: '2026-03-01' }); // un jour plein manqué
  push._internal.runRappelRepas();
  push._internal.runSerieDanger();
  const q = queueOf(db, 'c@c.fr');
  assert.equal(q.length, 1);
  assert.equal(q[0].type, 'repas', 'une série déjà perdue ne se « sauve » pas — on encourage, sans mentir');
});

test('jour déjà validé -> aucune relance du soir', () => {
  const { db, push } = makePush();
  seedClient(db, 'c@c.fr', { streak: 4, lastWin: TODAY, dayWon: true });
  push._internal.runRappelRepas();
  push._internal.runSerieDanger();
  assert.equal(queueOf(db, 'c@c.fr').length, 0);
});

test('jamais 2 relances du soir pour un même client, quel que soit son cas', () => {
  const { db, push } = makePush();
  seedClient(db, 'a@a.fr', { streak: 0 });                       // -> repas seul
  seedClient(db, 'b@b.fr', { streak: 3, lastWin: HIER });        // -> série seule
  seedClient(db, 'w@w.fr', { streak: 2, lastWin: TODAY, dayWon: true }); // -> rien
  push._internal.runRappelRepas();
  push._internal.runSerieDanger();
  for (const email of ['a@a.fr', 'b@b.fr', 'w@w.fr']) {
    const n = queueOf(db, email).filter((i) => i.type === 'repas' || i.type === 'serie').length;
    assert.ok(n <= 1, email + ' : ' + n + ' relance(s) du soir');
  }
  assert.equal(queueOf(db, 'a@a.fr')[0].type, 'repas');
  assert.equal(queueOf(db, 'b@b.fr')[0].type, 'serie');
});

test('heures des relances configurables via app_settings (format HH:MM)', () => {
  const { db, push } = makePush();
  assert.deepEqual(push._internal.heureConfig('push_repas_heure', 20, 0), [20, 0], 'défaut sans réglage');
  db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('push_repas_heure','19:30','')").run();
  assert.deepEqual(push._internal.heureConfig('push_repas_heure', 20, 0), [19, 30]);
  db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('push_serie_heure','n8importe','')").run();
  assert.deepEqual(push._internal.heureConfig('push_serie_heure', 21, 0), [21, 0], 'valeur invalide -> défaut');
});

// ---------------------------------------------------------------------------
//  Message coach (scénario A — verrou de non-régression)
// ---------------------------------------------------------------------------
test('message coach -> notif avec deep link vers LA conversation ; rafale regroupée', () => {
  const { db, push } = makePush();
  seedClient(db, 'c@c.fr', {});
  push.notifyCoachMessage('c@c.fr', 'Quentin Coach', 42, 'On se voit demain ?');
  let q = queueOf(db, 'c@c.fr');
  assert.equal(q.length, 1);
  assert.equal(q[0].type, 'messages');
  assert.match(q[0].title, /Quentin t'a écrit/);
  assert.equal(q[0].url, '/nutrition/?push=message&conv=42');
  assert.equal(q[0].bypass_cap, 1, 'un message du coach ne compte pas dans le plafond quotidien');
  // Deuxième message avant l'envoi -> UNE notif groupée, jamais deux.
  push.notifyCoachMessage('c@c.fr', 'Quentin Coach', 42, 'Et pense à ta gourde');
  q = queueOf(db, 'c@c.fr');
  assert.equal(q.length, 1);
  assert.equal(q[0].count, 2);
  assert.match(q[0].title, /2 messages/);
});

// ---------------------------------------------------------------------------
//  Déblocage de récompense (hook onUnlock)
// ---------------------------------------------------------------------------
test('déblocage simple : notif du bon type avec le bon deep link', () => {
  const { db, push } = makePush();
  seedClient(db, 'c@c.fr', {});
  push.notifyUnlocks('c@c.fr', [{ seuil: 100, type: 'video', payload: { lot: 2 } }]);
  let q = queueOf(db, 'c@c.fr');
  assert.match(q[0].title, /🎬 Nouveau lot de séances débloqué/);
  assert.equal(q[0].url, '/nutrition/?push=guides');

  push.notifyUnlocks('e@e.fr', [{ seuil: 250, type: 'ebook', payload: { nombre: 5 } }]);
  q = queueOf(db, 'e@e.fr');
  assert.match(q[0].title, /📚 De nouveaux guides t'attendent/);
  assert.equal(q[0].url, '/nutrition/?push=guides');

  push.notifyUnlocks('g@g.fr', [{ seuil: 2000, type: 'gift', payload: { cadeau: 'massage' } }]);
  q = queueOf(db, 'g@g.fr');
  assert.match(q[0].title, /🎁 Tu viens de débloquer : Un massage sportif/);
  assert.equal(q[0].url, '/nutrition/?push=cadeaux');
});

test('plusieurs déblocages d\'un coup -> UNE notif groupée', () => {
  const { db, push } = makePush();
  push.notifyUnlocks('c@c.fr', [
    { seuil: 800, type: 'ebook', payload: { nombre: 4 } },
    { seuil: 800, type: 'gift', payload: { cadeau: 'ami_semaine' } },
  ]);
  const q = queueOf(db, 'c@c.fr');
  assert.equal(q.length, 1);
  assert.match(q[0].title, /🎉 Tu as débloqué plusieurs récompenses/);
});

test('deux déblocages rapprochés le même jour -> regroupés, deep link vers le Chemin', () => {
  const { db, push } = makePush();
  push.notifyUnlocks('c@c.fr', [{ seuil: 100, type: 'video', payload: {} }]);
  push.notifyUnlocks('c@c.fr', [{ seuil: 250, type: 'ebook', payload: {} }]);
  const q = queueOf(db, 'c@c.fr');
  assert.equal(q.length, 1, 'une seule notif en file');
  assert.equal(q[0].count, 2);
  assert.match(q[0].title, /plusieurs récompenses/);
  assert.equal(q[0].url, '/nutrition/?push=chemin', 'le lien groupé montre TOUT, pas la première récompense');
});

test('le moteur Punch signale ses déblocages au notifier (câblage setUnlockNotifier)', () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
    CREATE TABLE nutrition_clients (email TEXT PRIMARY KEY, data TEXT);
    CREATE TABLE nutrition_parcours_pesees (client_email TEXT, type TEXT, date TEXT, PRIMARY KEY(client_email, type));
    CREATE TABLE nutrition_client_meta (client_email TEXT PRIMARY KEY, ville TEXT DEFAULT '', challenge_no INTEGER DEFAULT 0, updated_at TEXT DEFAULT '');
    CREATE TABLE nutrition_access_codes (ville TEXT, challenge_no INTEGER, code TEXT, actif INTEGER DEFAULT 1, start_date TEXT NOT NULL DEFAULT '', updated_at TEXT DEFAULT '', PRIMARY KEY (ville, challenge_no));
  `);
  const engine = createChallengeEngine({ getDb: () => db });
  engine.ensureChallengePathSchema();
  const recus = [];
  engine.setUnlockNotifier((email, nouveaux) => recus.push({ email, nouveaux }));
  engine.addPunch('c@c.fr', 500, 'test'); // franchit plusieurs seuils d'un coup
  assert.equal(recus.length, 1, 'UN signal par évaluation, pas un par seuil');
  assert.equal(recus[0].email, 'c@c.fr');
  assert.ok(recus[0].nouveaux.length >= 2, 'le lot complet des seuils franchis');
  // Et un notifier qui explose ne casse jamais le gain de Punch.
  engine.setUnlockNotifier(() => { throw new Error('boom'); });
  assert.doesNotThrow(() => engine.addPunch('c@c.fr', 300, 'test'));
});

// ---------------------------------------------------------------------------
//  Préférences par catégorie
// ---------------------------------------------------------------------------
test('les nouvelles catégories existent, ON par défaut (client sans réglage ET client v1 migré)', () => {
  const { db, push } = makePush();
  const p = push.getPrefs('inconnu@x.fr');
  assert.deepEqual([p.serie, p.repas, p.recompenses], [1, 1, 1]);
  // Client d'AVANT la migration : sa ligne n'avait que les 4 colonnes v1.
  db.prepare('INSERT INTO nutrition_push_prefs (client_email, messages, recap, photos, seances) VALUES (?,0,1,0,1)').run('v1@x.fr');
  const p2 = push.getPrefs('v1@x.fr');
  assert.deepEqual([p2.serie, p2.repas, p2.recompenses], [1, 1, 1], 'nouvelles colonnes ON par défaut');
  assert.deepEqual([p2.messages, p2.photos], [0, 0], 'ses anciens réglages ne bougent pas');
});

test('catégorie désactivée -> la notif est abandonnée au traitement, rien n\'est envoyé', async () => {
  const { db, push } = makePush();
  // Client SANS abonnement : processQueue ne tentera aucun envoi réseau.
  seedClient(db, 'c@c.fr', { streak: 5, lastWin: HIER, subscribed: false });
  db.prepare('INSERT INTO nutrition_push_prefs (client_email, serie) VALUES (?, 0)').run('c@c.fr');
  push.enqueue('c@c.fr', 'serie', { title: 'x', body: 'y', url: '/nutrition/?push=plan' }, { bypassCap: true });
  await push._internal.processQueue();
  const q = db.prepare('SELECT status FROM nutrition_push_queue WHERE client_email=?').all('c@c.fr');
  assert.equal(q[0].status, 'skipped_pref');
  const logs = db.prepare('SELECT COUNT(*) n FROM nutrition_push_log WHERE client_email=?').get('c@c.fr');
  assert.equal(logs.n, 0, 'rien dans le journal d\'envoi');
});

test('catégorie active -> la notif part (journalisée), et le plafond 2/jour épargne la série (bypass)', async () => {
  const { db, push } = makePush();
  seedClient(db, 'c@c.fr', { streak: 5, lastWin: HIER, subscribed: false });
  // Deux notifs « bruit » déjà parties aujourd'hui : le plafond quotidien est atteint.
  for (let i = 0; i < 2; i++) {
    db.prepare('INSERT INTO nutrition_push_log (client_email, type, title, body, url, sent_at) VALUES (?,?,?,?,?,?)')
      .run('c@c.fr', 'seances', 't', 'b', '/nutrition/', T0.toISOString());
  }
  push.enqueue('c@c.fr', 'repas', { title: 'repas', body: 'y', url: '/nutrition/?push=plan' });
  // L'alerte série telle que runSerieDanger la pose (bypassCap) — posée directement :
  // l'éligibilité est déjà couverte plus haut, ici on ne teste que le plafond.
  push.enqueue('c@c.fr', 'serie', { title: 'série', body: 'y', url: '/nutrition/?push=plan' }, { bypassCap: true });
  await push._internal.processQueue();
  const statuts = db.prepare('SELECT type, status FROM nutrition_push_queue WHERE client_email=? ORDER BY id').all('c@c.fr');
  assert.deepEqual(statuts.map((s) => s.type + ':' + s.status).sort(),
    ['repas:skipped_cap', 'serie:sent'].sort(),
    'le rappel repas respecte le plafond, l\'alerte série passe toujours');
});
