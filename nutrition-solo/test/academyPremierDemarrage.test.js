'use strict';
// ============================================================================
//  MY COACH ACADEMY — premier démarrage sur une base VIERGE.
//
//  CE FICHIER EXISTE PARCE QUE TOUTES LES AUTRES SUITES MENTAIENT PAR OMISSION.
//
//  Chaque suite Academy appelle `app.boost.assurerSchema()` dans son
//  `test.before`, et chaque suite E2E sème un collaborateur via
//  POST /api/boost/admin/collaborateurs avant d'ouvrir /academy. Les deux
//  traversent donc le Boost AVANT l'Academy, et aucune n'atteignait jamais
//  l'état réel d'un déploiement neuf : une base vide dont la PREMIÈRE page
//  ouverte est /academy.
//
//  Dans cet état, GET /api/academy/moi répondait 500 :
//
//      SqliteError: no such table: boost_collaborateurs
//        at collaborateurActif    lib/boost.js
//        at boost.lireUtilisateur lib/boost.js
//        at academy.peutSeFormer  lib/academy.js
//        at                       lib/academyRoutes.js   <- /api/academy/moi
//
//  ...et l'écran affichait « Espace indisponible ». Le défaut datait du lot 1 :
//  l'Academy DÉPEND du schéma Boost sans jamais le déclencher, chaque module
//  posant le sien sur son seul préfixe de routes.
//
//  ⚠️ RÈGLE ABSOLUE DE CE FICHIER : il ne doit JAMAIS appeler
//  `boost.assurerSchema()` ni une route /api/boost. C'est tout son intérêt, et
//  un test le vérifie sur son propre code source — sans quoi il redeviendrait
//  silencieusement inutile à la première ligne d'amorçage ajoutée par confort.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DB = path.join(os.tmpdir(), `nutri-academy-neuve-test-${process.pid}.sqlite`);
process.env.NUTRITION_DB = DB;
process.env.ADMIN_EMAIL = 'patron@exemple.fr';

const app = require('../server');
let srv, base;

const ADMIN = 'patron@exemple.fr';
const MOI = path.join(__dirname, 'academyPremierDemarrage.test.js');

async function api(methode, route, corps, jeton) {
  const res = await fetch(base + route, {
    method: methode,
    headers: { 'Content-Type': 'application/json', ...(jeton ? { Authorization: 'Bearer ' + jeton } : {}) },
    body: corps === undefined || corps === null ? undefined : JSON.stringify(corps),
  });
  const txt = await res.text();
  let json = null;
  try { json = JSON.parse(txt); } catch (_) { /* une erreur Express sort en HTML */ }
  return { status: res.status, body: json, txt };
}

const dbq = () => require('../lib/db').getDb();
const tables = () => dbq().prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
const tableExiste = (nom) => tables().includes(nom);

// ⚠️ AUCUN amorçage ici. Pas de boost.assurerSchema(), pas de route Boost :
// c'est exactement ce que ce fichier doit prouver.
test.before(async () => {
  await new Promise((r) => { srv = app.listen(0, r); });
  base = `http://127.0.0.1:${srv.address().port}`;
});

test.after(() => {
  if (srv) srv.close();
  require('../lib/db').closeDb();
  ['', '-wal', '-shm'].forEach((s) => { try { fs.unlinkSync(DB + s); } catch (_) {} });
});

// ===========================================================================
//  1. LA BASE EST RÉELLEMENT VIERGE CÔTÉ BOOST ET ACADEMY
// ===========================================================================

test('au démarrage, ni le Boost ni l\'Academy n\'ont posé leur schéma', () => {
  // Le socle du compte existe (users, sessions : ils sont posés au boot), mais
  // rien du Boost ni de l'Academy. Si cette assertion tombait, le test ne
  // reproduirait plus la situation qu'il est censé défendre.
  assert.ok(tableExiste('users'), 'le socle du compte est bien là');
  assert.ok(!tableExiste('boost_collaborateurs'), 'la base de test n\'est pas vierge côté Boost');
  assert.ok(!tableExiste('academy_modules'), 'la base de test n\'est pas vierge côté Academy');
});

// ===========================================================================
//  2. LA RECETTE RÉELLE : on ouvre /academy en PREMIER
// ===========================================================================

test('la toute première requête est GET /academy, et elle répond', async () => {
  const r = await api('GET', '/academy');
  assert.strictEqual(r.status, 200);
  assert.ok(r.txt.includes('My Coach Academy'), 'la page servie n\'est pas celle de l\'Academy');
});

test('ouvrir /academy pose le schéma du Boost dont l\'Academy dépend', () => {
  // C'EST LA CORRECTION. Avant elle, seules les tables academy_* étaient
  // créées ici, et la première route de la page tombait sur une table absente.
  assert.ok(tableExiste('academy_modules'), 'le schéma Academy manque');
  assert.ok(tableExiste('academy_formations'), 'le catalogue manque');
  assert.ok(tableExiste('boost_collaborateurs'),
    'l\'Academy lit boost_collaborateurs mais ne déclenche pas le schéma du Boost');
});

test('connexion puis /api/academy/moi : 200, et non 500', async () => {
  const co = await api('POST', '/account/login', { email: ADMIN, prenom: 'Stan', pin: '7777' });
  assert.strictEqual(co.status, 200, co.txt.slice(0, 200));
  const jeton = co.body.token;
  assert.ok(jeton, 'pas de jeton de session');

  const moi = await api('GET', '/api/academy/moi', null, jeton);

  // Le message d'écran « Espace indisponible » venait précisément d'ici : la
  // réponse n'était pas du JSON mais la page d'erreur HTML d'Express.
  assert.strictEqual(moi.status, 200, 'réponse : ' + moi.txt.slice(0, 300));
  assert.ok(moi.body, 'la réponse n\'est pas du JSON : ' + moi.txt.slice(0, 200));
  assert.strictEqual(moi.body.ok, true);
  assert.strictEqual(moi.body.email, ADMIN);
  assert.strictEqual(moi.body.admin, true, 'l\'administrateur doit être reconnu');
  assert.strictEqual(moi.body.collaborateur, false, 'personne n\'est collaborateur sur une base neuve');
  assert.ok(!/no such table/.test(moi.txt), 'une table manque toujours');
});

test('le catalogue et l\'administration répondent aussi, toujours sans Boost', async () => {
  const jeton = (await api('POST', '/account/login', { email: ADMIN, pin: '7777' })).body.token;

  // Le catalogue : la formation amorcée doit être là, sur une base neuve.
  const cat = await api('GET', '/api/academy/formations', null, jeton);
  assert.strictEqual(cat.status, 200, cat.txt.slice(0, 200));
  assert.ok(cat.body.formations.length >= 1, 'le catalogue est vide au premier démarrage');

  // Et l'administration des contenus du lot 6, atteinte elle aussi en premier.
  const arbre = await api('GET', '/api/academy/admin/arbre', null, jeton);
  assert.strictEqual(arbre.status, 200, arbre.txt.slice(0, 200));
  assert.ok(arbre.body.modules.length >= 1, 'l\'arbre d\'administration est vide');
  assert.ok(arbre.body.verification, 'la vérification de publication manque');
});

// ===========================================================================
//  3. LE FILET : ce fichier ne doit jamais amorcer le Boost
// ===========================================================================

test('ce fichier n\'amorce jamais le Boost — sinon il ne prouve plus rien', () => {
  const source = fs.readFileSync(MOI, 'utf8');
  // Commentaires retirés : ils PARLENT du Boost, c'est leur rôle.
  const code = source.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
  // On cherche un APPEL — une instruction — et non une occurrence de texte :
  // le test suivant cite `boost.assurerSchema()` dans une expression
  // régulière, ce qui n'amorce évidemment rien.
  assert.ok(!/^\s*[\w.]*assurerSchema\(\)\s*;/m.test(code),
    'ce fichier amorce un schéma à la main : il ne reproduit plus un démarrage réel');
  assert.ok(!/\/api\/boost/.test(code),
    'ce fichier appelle une route Boost : le schéma serait posé par elle, pas par l\'Academy');
});

test('la dépendance est déclarée dans le moteur, pas dans une route', () => {
  // Elle doit vivre dans academy.assurerSchema() : c'est le seul endroit que
  // TOUS les chemins d'entrée traversent — la page, les routes d'API, et
  // l'usage direct du moteur par les tests. La poser dans un middleware de
  // routes laisserait les autres chemins découverts.
  const moteur = fs.readFileSync(path.join(__dirname, '..', 'lib', 'academy.js'), 'utf8');
  const bloc = moteur.slice(moteur.indexOf('function assurerSchema'), moteur.indexOf('function migrerVersMultiFormation'));
  assert.ok(/boost\.assurerSchema\(\)/.test(bloc),
    'academy.assurerSchema() ne déclenche pas le schéma du Boost dont il dépend');
  // Et AVANT le garde-fou : sinon une base dont le schéma Academy est déjà posé
  // ne repasserait jamais par là.
  assert.ok(bloc.indexOf('boost.assurerSchema()') < bloc.indexOf('basesMigrees.has(d)'),
    'l\'appel est derrière le garde-fou : il serait sauté sur une base déjà migrée');
});
