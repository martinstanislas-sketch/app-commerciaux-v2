'use strict';
// Verrouille l'ACCÈS COACH du Protocole 42 : invitations, mots de passe,
// révocation. Un coach voit les données de santé de tous les clients : toute
// régression ici est une fuite potentielle.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const {
  createCoachAccess, ensureTables, hashPassword, verifyPassword, passwordError, hashToken, INVITE_TTL_MS,
} = require('../lib/coachAccess');

function make({ at = Date.parse('2026-09-21T10:00:00Z') } = {}) {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE coaches (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, pin TEXT DEFAULT NULL,
    role TEXT NOT NULL DEFAULT 'coach', studio TEXT DEFAULT '', archived INTEGER NOT NULL DEFAULT 0,
    is_leader INTEGER NOT NULL DEFAULT 0)`);
  ensureTables(db);
  const clock = { t: at };
  const ca = createCoachAccess({ getDb: () => db, now: () => new Date(clock.t) });
  return { db, ca, clock };
}
const PW = 'motdepasse42';

test('mot de passe : haché (scrypt salé), vérifié, règles minimales', () => {
  const h = hashPassword(PW);
  assert.ok(h.startsWith('scrypt$') && !h.includes(PW));
  assert.notEqual(h, hashPassword(PW)); // sel différent
  assert.ok(verifyPassword(PW, h));
  assert.ok(!verifyPassword('autre1234', h));
  assert.ok(!verifyPassword(PW, 'nimportequoi'));
  assert.ok(passwordError('court1'));
  assert.ok(passwordError('seulementdeslettres'));
  assert.ok(passwordError('123456789'));
  assert.equal(passwordError(PW), '');
});

test('invitation -> acceptation : compte coach créé, rôle coach, connexion OK', () => {
  const { db, ca } = make();
  const inv = ca.createInvite({ name: 'Julie', email: ' Julie@Club.FR ', createdBy: 'Stan' });
  assert.ok(inv.ok);
  assert.equal(inv.email, 'julie@club.fr');
  // Le jeton n'est stocké que haché.
  const row = db.prepare('SELECT token_hash FROM coach_invites WHERE id = ?').get(inv.id);
  assert.equal(row.token_hash, hashToken(inv.token));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM coach_invites WHERE token_hash = ?').get(inv.token).n, 0);

  assert.deepEqual(ca.checkInvite(inv.token), { ok: true, name: 'Julie', email: 'julie@club.fr' });
  const acc = ca.acceptInvite({ token: inv.token, password: PW });
  assert.ok(acc.ok);
  assert.equal(acc.coach.email, 'julie@club.fr');
  const c = db.prepare('SELECT role, pin FROM coaches WHERE id = ?').get(acc.coach.id);
  assert.equal(c.role, 'coach');
  assert.equal(c.pin, null);

  const lg = ca.login({ email: 'JULIE@club.fr', password: PW });
  assert.ok(lg.ok);
  assert.equal(lg.coach.id, acc.coach.id);
  assert.ok(ca.hasAccess(acc.coach.id));
});

test('invitation : usage unique, expiration, annulation, jeton inconnu', () => {
  const { ca, clock } = make();
  const a = ca.createInvite({ name: 'A', email: 'a@x.fr' });
  assert.ok(ca.acceptInvite({ token: a.token, password: PW }).ok);
  assert.equal(ca.acceptInvite({ token: a.token, password: PW }).ok, false); // déjà utilisée

  const b = ca.createInvite({ name: 'B', email: 'b@x.fr' });
  clock.t += INVITE_TTL_MS + 1000;
  const r = ca.acceptInvite({ token: b.token, password: PW });
  assert.equal(r.ok, false);
  assert.match(r.error, /expiré/);

  const c = ca.createInvite({ name: 'C', email: 'c@x.fr' });
  assert.ok(ca.cancelInvite(c.id).ok);
  assert.match(ca.acceptInvite({ token: c.token, password: PW }).error, /annulée/);

  assert.equal(ca.checkInvite('x'.repeat(43)).ok, false);
  assert.equal(ca.checkInvite('').ok, false);
});

test('invitation : une nouvelle invitation annule la précédente pour le même email', () => {
  const { ca } = make();
  const a = ca.createInvite({ name: 'Paul', email: 'p@x.fr' });
  const b = ca.createInvite({ name: 'Paul', email: 'p@x.fr' });
  assert.equal(ca.checkInvite(a.token).ok, false);
  assert.ok(ca.checkInvite(b.token).ok);
});

test('invitation : liée à SON email — impossible de choisir un autre email ou un rôle', () => {
  const { db, ca } = make();
  const inv = ca.createInvite({ name: 'Léa', email: 'lea@x.fr' });
  // Des champs parasites sont ignorés : seule l'invitation fait foi.
  const r = ca.acceptInvite({ token: inv.token, password: PW, email: 'pirate@x.fr', role: 'admin' });
  assert.ok(r.ok);
  assert.equal(r.coach.email, 'lea@x.fr');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM coach_accounts WHERE email = ?').get('pirate@x.fr').n, 0);
  assert.equal(db.prepare('SELECT role FROM coaches WHERE id = ?').get(r.coach.id).role, 'coach');
});

test('invitation : refus des doublons (email déjà pris, nom de coach existant)', () => {
  const { db, ca } = make();
  const a = ca.createInvite({ name: 'Marc', email: 'marc@x.fr' });
  ca.acceptInvite({ token: a.token, password: PW });
  assert.equal(ca.createInvite({ name: 'Autre', email: 'marc@x.fr' }).status, 409);
  db.prepare("INSERT INTO coaches (name, pin) VALUES ('Quentin', 'quen')").run();
  assert.equal(ca.createInvite({ name: 'quentin', email: 'q@x.fr' }).status, 409);
  assert.equal(ca.createInvite({ name: '', email: 'q@x.fr' }).status, 400);
  assert.equal(ca.createInvite({ name: 'Q', email: 'pas-un-email' }).status, 400);
});

test('invitation liée à un coach existant (PIN) : le compte se rattache au même coach_id', () => {
  const { db, ca } = make();
  const id = Number(db.prepare("INSERT INTO coaches (name, pin) VALUES ('Quentin', 'quen')").run().lastInsertRowid);
  const inv = ca.createInvite({ name: 'Quentin', email: 'quentin@x.fr', coachId: id });
  assert.ok(inv.ok);
  const r = ca.acceptInvite({ token: inv.token, password: PW });
  assert.equal(r.coach.id, id);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM coaches').get().n, 1); // pas de doublon
  assert.equal(ca.createInvite({ name: 'Quentin', email: 'autre@x.fr', coachId: id }).status, 409);
  assert.equal(ca.createInvite({ name: 'X', email: 'x@x.fr', coachId: 999 }).status, 400);
});

test('connexion : message identique email inconnu / mot de passe faux', () => {
  const { ca } = make();
  const inv = ca.createInvite({ name: 'Nina', email: 'nina@x.fr' });
  ca.acceptInvite({ token: inv.token, password: PW });
  const a = ca.login({ email: 'nina@x.fr', password: 'mauvais123' });
  const b = ca.login({ email: 'inconnu@x.fr', password: 'mauvais123' });
  assert.equal(a.status, 401);
  assert.deepEqual(a, b);
  assert.equal(ca.login({ email: '', password: '' }).ok, false);
});

test('révocation : accès coupé, coach sans compte révocable, puis réactivation', () => {
  const { db, ca } = make();
  const inv = ca.createInvite({ name: 'Tom', email: 'tom@x.fr' });
  const id = ca.acceptInvite({ token: inv.token, password: PW }).coach.id;
  assert.ok(ca.setAccess(id, false).ok);
  assert.equal(ca.hasAccess(id), false);
  const lg = ca.login({ email: 'tom@x.fr', password: PW });
  assert.equal(lg.ok, false);
  assert.equal(lg.status, 403);
  assert.ok(ca.setAccess(id, true).ok);
  assert.ok(ca.login({ email: 'tom@x.fr', password: PW }).ok);

  // Coach sans compte (historique) : non révoqué par défaut, révocable.
  const pinId = Number(db.prepare("INSERT INTO coaches (name, pin) VALUES ('Old', 'oldp')").run().lastInsertRowid);
  assert.ok(ca.hasAccess(pinId));
  ca.setAccess(pinId, false);
  assert.equal(ca.hasAccess(pinId), false);
  // Coach archivé : jamais autorisé.
  db.prepare('UPDATE coaches SET archived = 1 WHERE id = ?').run(id);
  assert.equal(ca.hasAccess(id), false);
  assert.equal(ca.hasAccess(0), false);
  assert.equal(ca.hasAccess('abc'), false);
  assert.equal(ca.setAccess(999, false).status, 404);
});

test('liste admin : ne contient ni mot de passe ni jeton', () => {
  const { ca } = make();
  const inv = ca.createInvite({ name: 'Eva', email: 'eva@x.fr' });
  ca.acceptInvite({ token: inv.token, password: PW });
  ca.createInvite({ name: 'Zoé', email: 'zoe@x.fr' });
  const l = ca.listForAdmin();
  const json = JSON.stringify(l);
  assert.ok(!/scrypt|password_hash|token/.test(json));
  assert.equal(l.coaches.find((c) => c.name === 'Eva').hasPassword, true);
  assert.deepEqual(l.invites.map((i) => i.status).sort(), ['en_attente', 'utilisee']);
});

test('ancien PIN coach : ne permet aucune connexion (seul email + mot de passe)', () => {
  const { db, ca } = make();
  db.prepare("INSERT INTO coaches (name, pin) VALUES ('Ancien', 'anci')").run();
  assert.equal(ca.login({ email: 'anci', password: 'anci' }).ok, false);
  assert.equal(ca.login({ email: 'Ancien', password: 'anci' }).ok, false);
});
