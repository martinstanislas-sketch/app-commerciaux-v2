'use strict';
// ============================================================================
//  MY COACH ACADEMY — l'onglet « Collaborateurs » de l'administration.
//
//  CE QUE CETTE SUITE GARDE, ET POURQUOI ELLE EXISTE.
//
//  L'écran d'administration a affiché « Route inconnue. » au clic sur
//  « + Ajouter un collaborateur ». Le message ne vient d'aucun module de
//  l'Academy : c'est le filet /api de server.js, celui qui répond quand AUCUNE
//  route n'a reconnu l'appel. Autrement dit, l'écran parlait à un serveur qui
//  n'avait pas ces routes.
//
//  Le premier test ci-dessous est donc écrit à l'envers des autres : il ne
//  vérifie pas un résultat métier, il vérifie que LA ROUTE EXISTE. Une route
//  absente et une route qui refuse ne se ressemblent pas — 404 « Route
//  inconnue. » d'un côté, 401/403 de l'autre — et c'est exactement cette
//  différence qu'il fige.
//
//  Le reste éprouve les deux chemins de `academy_preautorisations`, qui sont
//  les deux seules façons d'entrer dans l'Academy :
//
//   · LE COMPTE EXISTE   -> le droit est accordé TOUT DE SUITE (definirRole) ;
//   · LE COMPTE N'EXISTE PAS -> aucune ligne de droit n'est écrite. On mémorise
//     une intention, et elle se consomme à la création du compte.
//
//  ⚠️ LE POINT QU'IL NE FAUT JAMAIS PERDRE : une adresse « en attente » ne
//  porte AUCUN droit. `boost_collaborateurs` a une clé étrangère vers `users` :
//  la table refuse structurellement une adresse sans compte. On le vérifie en
//  base, pas seulement à l'écran — un statut affiché n'est pas un droit.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DB = path.join(os.tmpdir(), `nutri-academy-collab-test-${process.pid}.sqlite`);
process.env.NUTRITION_DB = DB;
process.env.ADMIN_EMAIL = 'patron@exemple.fr';

const app = require('../server');
let srv, base;

const ADMIN = 'patron@exemple.fr';
const DEJA = 'deja.inscrit@exemple.fr';    // le compte existe AVANT l'ajout
const FUTUR = 'pas.encore@exemple.fr';     // le compte n'existera qu'après
const CURIEUX = 'curieux@exemple.fr';      // un compte ordinaire, non admin
const jetons = {};

async function api(methode, route, corps, jeton) {
  const res = await fetch(base + route, {
    method: methode,
    headers: { 'Content-Type': 'application/json', ...(jeton ? { Authorization: 'Bearer ' + jeton } : {}) },
    body: corps === undefined || corps === null ? undefined : JSON.stringify(corps),
  });
  const txt = await res.text();
  let json = null;
  try { json = JSON.parse(txt); } catch (_) { /* non JSON */ }
  return { status: res.status, body: json, txt };
}

async function connecter(email, pin) {
  const r = await api('POST', '/account/login', { email, prenom: email.split('@')[0], pin });
  jetons[email] = r.body.token;
  return r;
}

const adm = (m, route, corps) => api(m, route, corps, jetons[ADMIN]);
const dbq = () => require('../lib/db').getDb();

// L'état tel que l'écran le lit : une entrée par adresse, avec son statut.
const listeAdmin = async () => (await adm('GET', '/api/academy/admin/collaborateurs')).body.collaborateurs;
const entree = async (mail) => (await listeAdmin()).find((c) => c.email === mail) || null;

// La VÉRITÉ des droits, lue en base et non à l'écran : `boost_collaborateurs`
// est la seule table que `academy.peutSeFormer` consulte.
const ligneDroit = (mail) =>
  dbq().prepare('SELECT email, actif FROM boost_collaborateurs WHERE email = ?').get(mail) || null;
const enAttenteEnBase = (mail) =>
  dbq().prepare('SELECT email FROM academy_preautorisations WHERE email = ?').get(mail) || null;

test.before(async () => {
  await new Promise((r) => { srv = app.listen(0, r); });
  base = `http://127.0.0.1:${srv.address().port}`;
  app.boost.assurerSchema();
  app.academy.assurerSchema();
  // FUTUR n'est volontairement PAS connecté ici : tout l'intérêt du second cas
  // est qu'aucun compte ne porte cette adresse au moment de l'autorisation.
  for (const [e, p] of [[ADMIN, '7777'], [DEJA, '4004'], [CURIEUX, '1001']]) await connecter(e, p);
});

test.after(() => {
  if (srv) srv.close();
  require('../lib/db').closeDb();
  ['', '-wal', '-shm'].forEach((s) => { try { fs.unlinkSync(DB + s); } catch (_) {} });
});

// ===========================================================================
//  0. LA RÉGRESSION ELLE-MÊME : LES ROUTES EXISTENT
// ===========================================================================

test('les deux routes de l\'onglet Collaborateurs sont montées', async () => {
  // Sans jeton : on attend un REFUS (401), pas une absence (404). Le filet
  // /api de server.js répond « Route inconnue. » — c'est le message exact qui
  // s'affichait à l'écran, et c'est lui qu'on interdit ici.
  for (const [m, corps] of [['GET', undefined], ['POST', { email: DEJA, role: 'collaborateur' }]]) {
    const r = await api(m, '/api/academy/admin/collaborateurs', corps);
    assert.notStrictEqual(r.status, 404,
      `${m} /api/academy/admin/collaborateurs n'est pas montée : l'écran affichera « Route inconnue. »`);
    assert.ok(!/Route inconnue/.test(r.txt), 'la requête est tombée dans le filet /api 404 de server.js');
    assert.strictEqual(r.status, 401, 'une route montée refuse un appel sans jeton par 401');
  }
});

test('l\'écran appelle exactement la route que le serveur expose', () => {
  // Le front et le serveur se sont déjà désynchronisés une fois. On compare les
  // deux textes plutôt que de faire confiance à la mémoire.
  const front = fs.readFileSync(path.join(__dirname, '..', 'public', 'academy.js'), 'utf8');
  const routes = fs.readFileSync(path.join(__dirname, '..', 'lib', 'academyRoutes.js'), 'utf8');
  assert.ok(/apiAc\('\/api\/academy\/admin\/collaborateurs', 'POST'/.test(front),
    'l\'écran doit poster sur /api/academy/admin/collaborateurs');
  assert.ok(/r\.post\('\/api\/academy\/admin\/collaborateurs'/.test(routes),
    'le serveur doit exposer POST /api/academy/admin/collaborateurs');
  assert.ok(/r\.get\('\/api\/academy\/admin\/collaborateurs'/.test(routes),
    'le serveur doit exposer GET /api/academy/admin/collaborateurs');
});

test('administrer ces routes est réservé à l\'administrateur', async () => {
  const r = await api('POST', '/api/academy/admin/collaborateurs',
    { email: DEJA, role: 'collaborateur' }, jetons[CURIEUX]);
  assert.strictEqual(r.status, 403, 'un compte ordinaire ne distribue pas les accès à l\'Academy');
  assert.strictEqual(ligneDroit(DEJA), null, 'un refus ne doit écrire aucun droit');
});

// ===========================================================================
//  1. LE COMPTE EXISTE -> COLLABORATEUR ACTIF, IMMÉDIATEMENT
// ===========================================================================

test('adresse dont le compte existe : collaborateur actif tout de suite', async () => {
  const r = await adm('POST', '/api/academy/admin/collaborateurs', { email: DEJA, role: 'collaborateur' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.ok, true);
  assert.strictEqual(r.body.enAttente, false, 'un compte existant n\'attend rien : le droit est accordé');

  // Le droit est écrit là où l'Academy le lit, et nulle part ailleurs.
  assert.deepStrictEqual(ligneDroit(DEJA), { email: DEJA, actif: 1 });
  assert.strictEqual(enAttenteEnBase(DEJA), null, 'aucune file d\'attente pour un compte qui existe');

  // L'écran le voit « actif », sans avoir à recharger : la liste repart avec
  // la réponse du POST.
  const dansLaReponse = (r.body.collaborateurs || []).find((c) => c.email === DEJA);
  assert.ok(dansLaReponse, 'la réponse du POST porte la liste à jour');
  assert.strictEqual(dansLaReponse.etat, 'actif');
  assert.strictEqual((await entree(DEJA)).etat, 'actif', 'et la relecture dit la même chose');

  // Et le droit est RÉEL : l'intéressé entre dans l'Academy.
  const moi = await api('GET', '/api/academy/moi', undefined, jetons[DEJA]);
  assert.strictEqual(moi.body.collaborateur, true);
});

// ===========================================================================
//  2. LE COMPTE N'EXISTE PAS -> EN ATTENTE, SANS AUCUN DROIT
// ===========================================================================

test('adresse sans compte : en attente, et pas une once de droit', async () => {
  const r = await adm('POST', '/api/academy/admin/collaborateurs', { email: FUTUR, role: 'collaborateur' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.ok, true);
  assert.strictEqual(r.body.enAttente, true, 'sans compte, on ne mémorise qu\'une intention');

  assert.ok(enAttenteEnBase(FUTUR), 'l\'intention est enregistrée');
  assert.strictEqual(ligneDroit(FUTUR), null, 'AUCUN droit n\'est écrit pour une adresse sans compte');

  const vue = await entree(FUTUR);
  assert.ok(vue, 'l\'administrateur voit l\'adresse dans sa liste');
  assert.strictEqual(vue.etat, 'en_attente');
  assert.strictEqual(vue.actif, false, 'en attente n\'est pas actif');
});

test('à la création du compte, l\'attente se consomme et le droit s\'accorde', async () => {
  // La personne crée son espace elle-même, avec exactement cette adresse.
  await connecter(FUTUR, '5005');

  assert.deepStrictEqual(ligneDroit(FUTUR), { email: FUTUR, actif: 1 },
    'le compte qui vient de naître devient collaborateur');
  assert.strictEqual(enAttenteEnBase(FUTUR), null,
    'la ligne d\'attente est consommée : un accès retiré plus tard ne doit pas se rétablir seul');

  const vue = await entree(FUTUR);
  assert.strictEqual(vue.etat, 'actif', 'l\'administrateur le voit passer d\'« en attente » à « actif »');

  const moi = await api('GET', '/api/academy/moi', undefined, jetons[FUTUR]);
  assert.strictEqual(moi.body.collaborateur, true, 'et l\'Academy s\'ouvre vraiment');
});

// ===========================================================================
//  3. CE QUE LE RETRAIT FAIT, ET CE QU'IL NE FAIT PAS
// ===========================================================================

test('retirer un accès laisse le compte et ses données intacts', async () => {
  const r = await adm('POST', '/api/academy/admin/collaborateurs', { email: DEJA, role: 'client' });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(ligneDroit(DEJA), { email: DEJA, actif: 0 },
    'la ligne reste, avec actif = 0 : rien n\'est supprimé');
  assert.strictEqual((await entree(DEJA)).etat, 'retire');

  const moi = await api('GET', '/api/academy/moi', undefined, jetons[DEJA]);
  assert.strictEqual(moi.body.collaborateur, false, 'l\'Academy se referme à la requête suivante');

  // On le rend, pour ne rien laisser derrière soi.
  await adm('POST', '/api/academy/admin/collaborateurs', { email: DEJA, role: 'collaborateur' });
  assert.deepStrictEqual(ligneDroit(DEJA), { email: DEJA, actif: 1 });
});

test('retirer une adresse encore en attente efface l\'intention, sans erreur', async () => {
  const EPHEMERE = 'ephemere@exemple.fr';
  await adm('POST', '/api/academy/admin/collaborateurs', { email: EPHEMERE, role: 'collaborateur' });
  assert.ok(enAttenteEnBase(EPHEMERE));

  const r = await adm('POST', '/api/academy/admin/collaborateurs', { email: EPHEMERE, role: 'client' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(enAttenteEnBase(EPHEMERE), null, 'l\'intention est retirée');
  assert.strictEqual(await entree(EPHEMERE), null, 'et l\'adresse quitte la liste');
});

test('une adresse vide est refusée, et n\'entre nulle part', async () => {
  const avant = dbq().prepare('SELECT COUNT(*) AS n FROM academy_preautorisations').get().n;
  const r = await adm('POST', '/api/academy/admin/collaborateurs', { email: '  ', role: 'collaborateur' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.body.ok, false);
  assert.strictEqual(dbq().prepare('SELECT COUNT(*) AS n FROM academy_preautorisations').get().n, avant,
    'un refus n\'ajoute aucune ligne d\'attente');
  assert.ok(!(await listeAdmin()).some((c) => !String(c.email || '').trim()),
    'aucune ligne sans adresse dans la liste');
});
