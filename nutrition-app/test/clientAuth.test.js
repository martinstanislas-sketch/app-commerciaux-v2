'use strict';
// Verrouille l'AUTHENTIFICATION client nutrition (données sensibles : poids,
// photos corporelles, messages coach). Toute modification des règles doit faire
// tomber un test ici — sinon c'est que le test manque.
//
// Règles couvertes :
//  - compte AVEC PIN            -> PIN obligatoire et vérifié
//  - compte PRÉ-CRÉÉ par coach  -> code de cohorte EXIGÉ + pose du PIN
//  - compte HÉRITÉ sans PIN     -> pose du PIN, AUCUN code (rétro-compat)
//  - email INCONNU              -> invitation par lien obligatoire (secours)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const {
  createClientAuth, PIN_RE, hashPin, verifyPin, genAccessCode,
} = require('../lib/clientAuth');

function makeAuth() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE nutrition_clients (
      email TEXT PRIMARY KEY, prenom TEXT DEFAULT '', nom TEXT DEFAULT '', data TEXT,
      pin_hash TEXT NOT NULL DEFAULT '', coach_id INTEGER, pre_created INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT '', updated_at TEXT DEFAULT ''
    );
    CREATE TABLE nutrition_client_meta (client_email TEXT PRIMARY KEY, ville TEXT DEFAULT '', challenge_no INTEGER DEFAULT 0, updated_at TEXT DEFAULT '');
    CREATE TABLE nutrition_access_codes (ville TEXT, challenge_no INTEGER, code TEXT, actif INTEGER DEFAULT 1, updated_at TEXT DEFAULT '', PRIMARY KEY (ville, challenge_no));
    CREATE TABLE nutrition_invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT UNIQUE, email TEXT DEFAULT '', prenom TEXT DEFAULT '', nom TEXT DEFAULT '',
      coach_id INTEGER, coach_name TEXT DEFAULT '', created_at TEXT DEFAULT '', expires_at TEXT DEFAULT '', used_at TEXT DEFAULT '', used_email TEXT DEFAULT ''
    );
  `);
  const auth = createClientAuth({ getDb: () => db, defaultCoachId: () => 42 });
  return { db, auth };
}
// Client pré-créé par un coach, rattaché à un groupe doté d'un code actif.
function seedPreCree(db, { email = 'pre@a.fr', ville = 'Lyon', no = 3, code = '482100', actif = 1 } = {}) {
  db.prepare("INSERT INTO nutrition_clients (email,prenom,nom,pin_hash,coach_id,pre_created) VALUES (?,?,?,'',1,1)").run(email, 'Alice', 'Pre');
  db.prepare('INSERT INTO nutrition_client_meta (client_email,ville,challenge_no) VALUES (?,?,?)').run(email, ville, no);
  db.prepare('INSERT INTO nutrition_access_codes (ville,challenge_no,code,actif) VALUES (?,?,?,?)').run(ville, no, code, actif);
}

// --- Helpers PIN (purs) ----------------------------------------------------
test('PIN_RE : accepte 4 à 6 chiffres, rien d\'autre', () => {
  ['1234', '12345', '123456'].forEach((p) => assert.ok(PIN_RE.test(p), p));
  ['123', '1234567', 'abcd', '12a4', '', '12 34'].forEach((p) => assert.ok(!PIN_RE.test(p), p));
});

test('hashPin/verifyPin : aller-retour, sel unique, rejet du mauvais PIN', () => {
  const h = hashPin('1234');
  assert.ok(verifyPin('1234', h));
  assert.ok(!verifyPin('9999', h));
  assert.notEqual(hashPin('1234'), hashPin('1234')); // sel aléatoire
  assert.ok(!h.includes('1234'));                     // le PIN clair n'est jamais stocké
});

test('verifyPin : rejette un stockage vide ou malformé', () => {
  assert.ok(!verifyPin('1234', ''));
  assert.ok(!verifyPin('1234', 'nimportequoi'));
  assert.ok(!verifyPin('', hashPin('1234')));
});

test('genAccessCode : 6 chiffres', () => {
  for (let i = 0; i < 20; i++) assert.match(genAccessCode(), /^\d{6}$/);
});

// --- validateAccessCode ----------------------------------------------------
test('validateAccessCode : code manquant / groupe absent / code inactif / mauvais / bon', () => {
  const { db, auth } = makeAuth();
  seedPreCree(db);
  assert.equal(auth.validateAccessCode('pre@a.fr', '').ok, false);
  assert.equal(auth.validateAccessCode('sansgroupe@a.fr', '482100').ok, false);
  assert.equal(auth.validateAccessCode('pre@a.fr', '999999').ok, false);
  assert.equal(auth.validateAccessCode('pre@a.fr', '482100').ok, true);
  db.prepare('UPDATE nutrition_access_codes SET actif = 0').run();
  assert.equal(auth.validateAccessCode('pre@a.fr', '482100').ok, false); // désactivé
});

test('validateAccessCode : tolère espaces et casse', () => {
  const { db, auth } = makeAuth();
  seedPreCree(db, { code: 'ab12' });
  assert.equal(auth.validateAccessCode('pre@a.fr', '  AB12 ').ok, true);
});

// --- validateInvite --------------------------------------------------------
test('validateInvite : sans jeton -> message « demande à ton coach »', () => {
  const { auth } = makeAuth();
  const r = auth.validateInvite('', 'x@a.fr');
  assert.equal(r.ok, false);
  assert.match(r.error, /coach/i);
});

test('validateInvite : inconnu / utilisé / expiré / mauvais email / valide', () => {
  const { db, auth } = makeAuth();
  const ins = db.prepare('INSERT INTO nutrition_invites (token,email,expires_at,used_at) VALUES (?,?,?,?)');
  ins.run('bon', '', '', '');
  ins.run('use', '', '', '2020-01-01T00:00:00Z');
  ins.run('exp', '', '2020-01-01T00:00:00Z', '');
  ins.run('lie', 'autre@a.fr', '', '');
  assert.equal(auth.validateInvite('nexistepas', 'x@a.fr').ok, false);
  assert.equal(auth.validateInvite('use', 'x@a.fr').ok, false);
  assert.equal(auth.validateInvite('exp', 'x@a.fr').ok, false);
  assert.equal(auth.validateInvite('lie', 'x@a.fr').ok, false);       // lié à un autre email
  assert.equal(auth.validateInvite('lie', 'autre@a.fr').ok, true);    // le bon email passe
  assert.equal(auth.validateInvite('bon', 'x@a.fr').ok, true);
});

// --- loginClient : garde-fous ---------------------------------------------
test('loginClient : champs manquants -> 400', () => {
  const { auth } = makeAuth();
  assert.equal(auth.loginClient({ email: '', prenom: '', nom: '', pin: '1234' }).status, 400);
  assert.equal(auth.loginClient({ email: 'pasdemail', prenom: 'A', nom: 'B', pin: '1234' }).status, 400);
  assert.equal(auth.loginClient({ email: 'a@a.fr', prenom: '', nom: 'B', pin: '1234' }).status, 400);
});

// --- loginClient : compte AVEC PIN ----------------------------------------
test('loginClient : compte avec PIN -> PIN obligatoire, vérifié, et suffisant', () => {
  const { db, auth } = makeAuth();
  db.prepare("INSERT INTO nutrition_clients (email,prenom,nom,pin_hash,pre_created) VALUES ('a@a.fr','A','B',?,0)").run(hashPin('1234'));
  const sansPin = auth.loginClient({ email: 'a@a.fr', prenom: 'A', nom: 'B', pin: '' });
  assert.equal(sansPin.status, 401);
  assert.equal(sansPin.body.needPin, true);
  const mauvais = auth.loginClient({ email: 'a@a.fr', prenom: 'A', nom: 'B', pin: '9999' });
  assert.equal(mauvais.status, 401);
  assert.equal(mauvais.body.error, 'Code PIN incorrect.');
  const bon = auth.loginClient({ email: 'a@a.fr', prenom: 'A', nom: 'B', pin: '1234' });
  assert.equal(bon.ok, true);
  assert.equal(bon.body.email, 'a@a.fr');
});

// --- loginClient : compte PRÉ-CRÉÉ (le cœur de la connexion simplifiée) ----
test('loginClient : pré-créé SANS code -> 403 needCode (aucun PIN posé)', () => {
  const { db, auth } = makeAuth();
  seedPreCree(db);
  const r = auth.loginClient({ email: 'pre@a.fr', prenom: 'Alice', nom: 'Pre', pin: '1234' });
  assert.equal(r.status, 403);
  assert.equal(r.body.needCode, true);
  assert.equal(db.prepare("SELECT pin_hash FROM nutrition_clients WHERE email='pre@a.fr'").get().pin_hash, '');
});

test('loginClient : pré-créé MAUVAIS code -> 403, le PIN n\'est pas posé', () => {
  const { db, auth } = makeAuth();
  seedPreCree(db);
  const r = auth.loginClient({ email: 'pre@a.fr', prenom: 'Alice', nom: 'Pre', pin: '1234', code: '000000' });
  assert.equal(r.status, 403);
  assert.equal(db.prepare("SELECT pin_hash FROM nutrition_clients WHERE email='pre@a.fr'").get().pin_hash, '');
});

test('loginClient : pré-créé BON code mais PIN invalide -> 400 setPin + needCode', () => {
  const { db, auth } = makeAuth();
  seedPreCree(db);
  const r = auth.loginClient({ email: 'pre@a.fr', prenom: 'Alice', nom: 'Pre', pin: '12', code: '482100' });
  assert.equal(r.status, 400);
  assert.equal(r.body.setPin, true);
  assert.equal(r.body.needCode, true); // le front doit garder le champ code affiché
});

test('loginClient : pré-créé BON code + PIN -> connecté, pre_created repasse à 0', () => {
  const { db, auth } = makeAuth();
  seedPreCree(db);
  const r = auth.loginClient({ email: 'pre@a.fr', prenom: 'Alice', nom: 'Pre', pin: '1234', code: '482100' });
  assert.equal(r.ok, true);
  const row = db.prepare("SELECT pre_created, pin_hash FROM nutrition_clients WHERE email='pre@a.fr'").get();
  assert.equal(row.pre_created, 0);
  assert.ok(verifyPin('1234', row.pin_hash));
  // Espace réclamé : le code n'est plus demandé, le PIN seul suffit.
  assert.equal(auth.loginClient({ email: 'pre@a.fr', prenom: 'Alice', nom: 'Pre', pin: '1234' }).ok, true);
});

// --- loginClient : NON-RÉGRESSION des comptes hérités ---------------------
test('RÉTRO-COMPAT : compte hérité sans PIN -> aucun code exigé', () => {
  const { db, auth } = makeAuth();
  db.prepare("INSERT INTO nutrition_clients (email,prenom,nom,pin_hash,pre_created) VALUES ('old@a.fr','Bob','Ancien','',0)").run();
  const r = auth.loginClient({ email: 'old@a.fr', prenom: 'Bob', nom: 'Ancien', pin: '4321' });
  assert.equal(r.ok, true, 'un compte hérité ne doit JAMAIS être bloqué par le code de cohorte');
  assert.ok(verifyPin('4321', db.prepare("SELECT pin_hash FROM nutrition_clients WHERE email='old@a.fr'").get().pin_hash));
});

// --- loginClient : email inconnu -> invitation (secours) ------------------
test('loginClient : email inconnu sans invitation -> 403 needInvite, aucun compte créé', () => {
  const { db, auth } = makeAuth();
  const r = auth.loginClient({ email: 'x@a.fr', prenom: 'X', nom: 'Y', pin: '1234' });
  assert.equal(r.status, 403);
  assert.equal(r.body.needInvite, true);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM nutrition_clients').get().c, 0);
});

test('loginClient : email inconnu avec invitation valide -> compte créé + invitation consommée', () => {
  const { db, auth } = makeAuth();
  db.prepare("INSERT INTO nutrition_invites (token,email,coach_id) VALUES ('tok','',7)").run();
  const r = auth.loginClient({ email: 'x@a.fr', prenom: 'X', nom: 'Y', pin: '1234', invite: 'tok' });
  assert.equal(r.ok, true);
  const row = db.prepare("SELECT coach_id, pin_hash FROM nutrition_clients WHERE email='x@a.fr'").get();
  assert.equal(row.coach_id, 7);
  assert.ok(verifyPin('1234', row.pin_hash));
  const inv = db.prepare("SELECT used_at, used_email FROM nutrition_invites WHERE token='tok'").get();
  assert.notEqual(inv.used_at, '');
  assert.equal(inv.used_email, 'x@a.fr');
  // Rejouer la même invitation doit échouer (usage unique).
  assert.equal(auth.loginClient({ email: 'z@a.fr', prenom: 'Z', nom: 'Z', pin: '1234', invite: 'tok' }).ok, false);
});

test('loginClient : invitation sans coach -> coach par défaut', () => {
  const { db, auth } = makeAuth();
  db.prepare("INSERT INTO nutrition_invites (token,email,coach_id) VALUES ('t2','',NULL)").run();
  auth.loginClient({ email: 'y@a.fr', prenom: 'Y', nom: 'Y', pin: '1234', invite: 't2' });
  assert.equal(db.prepare("SELECT coach_id FROM nutrition_clients WHERE email='y@a.fr'").get().coach_id, 42);
});

// --- Normalisation ---------------------------------------------------------
test('loginClient : email normalisé (casse + espaces)', () => {
  const { db, auth } = makeAuth();
  db.prepare("INSERT INTO nutrition_clients (email,prenom,nom,pin_hash,pre_created) VALUES ('a@a.fr','A','B',?,0)").run(hashPin('1234'));
  const r = auth.loginClient({ email: '  A@A.FR  ', prenom: 'A', nom: 'B', pin: '1234' });
  assert.equal(r.ok, true);
  assert.equal(r.body.email, 'a@a.fr');
});
