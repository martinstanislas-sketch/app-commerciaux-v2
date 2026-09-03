'use strict';
// ============================================================================
//  MY COACH ACADEMY — le droit de CERTIFIER, administré dans Collaborateurs.
//
//  CE QUI A CHANGÉ : l'écran « Administrer > Évaluateurs » a disparu. Le droit
//  se bascule désormais depuis la ligne du collaborateur qu'il concerne.
//
//  CE QUI N'A PAS CHANGÉ, ET C'EST TOUT L'ENJEU : le droit lui-même. Même
//  table (academy_evaluateurs), même lecture (estEvaluateur), même route
//  d'écriture gardée par exigeAdmin. Ces tests le prouvent des deux côtés —
//  ce que l'écran affiche, et ce que le serveur autorise.
//
//  SIX PROPRIÉTÉS :
//
//   1. AUCUN DROIT N'EST PERDU. Un évaluateur d'avant apparaît certificateur,
//      sans qu'aucune donnée n'ait été réécrite : c'est la même ligne, lue
//      autrement. C'est la propriété qui se casse le plus cher.
//   2. LE DROIT S'ACCORDE ET SE RETIRE, et l'accès à « Évaluer & certifier »
//      suit immédiatement — dans les deux sens.
//   3. L'ADMINISTRATEUR L'A PAR SON RÔLE. On le dit, on ne le lui accorde pas :
//      lui poser une ligne de droit en plus ferait deux droits pour un.
//   4. UN NON-ADMINISTRATEUR NE PEUT PAS SE L'ATTRIBUER. La garde est SERVEUR,
//      pas un interrupteur masqué à l'écran.
//   5. RIEN D'AUTRE NE BOUGE : évaluations prononcées, certifications
//      délivrées, progressions et QCM sont intacts après une bascule.
//   6. L'ANCIEN ÉCRAN N'EXISTE PLUS, et son panneau non plus.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DB = path.join(os.tmpdir(), `nutri-academy-certif-test-${process.pid}.sqlite`);
process.env.NUTRITION_DB = DB;
process.env.ADMIN_EMAIL = 'patron@exemple.fr';

const app = require('../server');
const PUBLIC = path.join(__dirname, '..', 'public');
const js = fs.readFileSync(path.join(PUBLIC, 'academy.js'), 'utf8');

const ADMIN = 'patron@exemple.fr';
const EVA = 'eva.ct@exemple.fr';     // évaluatrice AVANT le changement
const THEO = 'theo.ct@exemple.fr';   // collaborateur ordinaire
const jetons = {};
let srv, base;

const dbq = () => require('../lib/db').getDb();

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
const connecter = async (email, pin) => {
  const r = await api('POST', '/account/login', { email, prenom: email.split('@')[0], pin });
  jetons[email] = r.body.token;
};

const collaborateurs = async (jeton) =>
  (await api('GET', '/api/academy/admin/collaborateurs', null, jeton || jetons[ADMIN])).body.collaborateurs;
const ligneDe = async (email, jeton) => (await collaborateurs(jeton)).find((c) => c.email === email);
const basculer = (email, oui, jeton) =>
  api('POST', '/api/academy/admin/evaluateurs', { email, evaluateur: oui }, jeton || jetons[ADMIN]);
const accedeAEvaluer = async (email) =>
  (await api('GET', '/api/academy/evaluateur/coachs?formation=toutes', null, jetons[email])).status;

test.before(async () => {
  srv = app.listen(0);
  await new Promise((r) => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;

  for (const [email, pin] of [[ADMIN, '7777'], [EVA, '5005'], [THEO, '4004']]) await connecter(email, pin);
  for (const email of [EVA, THEO]) {
    await api('POST', '/api/boost/admin/collaborateurs', { email, role: 'collaborateur' }, jetons[ADMIN]);
    await connecter(email, email === EVA ? '5005' : '4004');
  }

  // L'ÉTAT D'AVANT : Eva est désignée évaluatrice par l'ancien mécanisme, écrit
  // directement dans la table. On ne passe pas par la nouvelle route — on veut
  // exactement une ligne telle qu'elle existe déjà en base chez toi.
  const maintenant = new Date().toISOString();
  app.academyPratique.assurerSchema();
  dbq().prepare(`INSERT INTO academy_evaluateurs (email, actif, cree_le, maj_le, maj_par)
                 VALUES (?, 1, ?, ?, ?)
                 ON CONFLICT(email) DO UPDATE SET actif = 1`).run(EVA, maintenant, maintenant, ADMIN);
});

test.after(() => {
  if (srv) srv.close();
  require('../lib/db').closeDb();
  ['', '-wal', '-shm'].forEach((s) => { try { fs.unlinkSync(DB + s); } catch (_) {} });
});

// ===========================================================================
//  1. AUCUN DROIT N'EST PERDU
// ===========================================================================

test('un évaluateur d\'avant apparaît CERTIFICATEUR, sans qu\'on ait rien réécrit', async () => {
  const avant = dbq().prepare('SELECT * FROM academy_evaluateurs WHERE email = ?').get(EVA);

  const eva = await ligneDe(EVA);
  assert.ok(eva, 'l\'évaluatrice doit figurer parmi les collaborateurs');
  assert.strictEqual(eva.certificateur, true, 'son droit doit apparaître activé');
  assert.strictEqual(eva.certificateurAdmin, false, 'elle n\'est pas administratrice');

  // LA LIGNE EN BASE N'A PAS BOUGÉ : on l'a LUE, pas migrée.
  const apres = dbq().prepare('SELECT * FROM academy_evaluateurs WHERE email = ?').get(EVA);
  assert.deepStrictEqual(apres, avant, 'la ligne de droit a été réécrite : ce n\'était pas demandé');

  // Et le droit fonctionne toujours, du même côté serveur qu'avant.
  assert.strictEqual(app.academyPratique.estEvaluateur(EVA), true);
  assert.strictEqual(await accedeAEvaluer(EVA), 200, 'elle doit toujours accéder à « Évaluer & certifier »');
});

test('un collaborateur ordinaire est certificateur : NON, et la porte est fermée', async () => {
  const theo = await ligneDe(THEO);
  assert.strictEqual(theo.certificateur, false);
  assert.strictEqual(theo.certificateurAdmin, false);
  assert.strictEqual(await accedeAEvaluer(THEO), 403, 'sans le droit, l\'espace reste fermé');
});

// ===========================================================================
//  2. LA BASCULE, DANS LES DEUX SENS
// ===========================================================================

test('activer le droit ouvre « Évaluer & certifier » immédiatement', async () => {
  const r = await basculer(THEO, true);
  assert.strictEqual(r.status, 200, r.txt);
  // La liste à jour repart avec la réponse : l'écran n'a rien à deviner.
  const dansLaReponse = (r.body.collaborateurs || []).find((c) => c.email === THEO);
  assert.strictEqual(dansLaReponse.certificateur, true, 'la réponse doit porter le nouvel état');

  assert.strictEqual((await ligneDe(THEO)).certificateur, true);
  assert.strictEqual(await accedeAEvaluer(THEO), 200, 'l\'accès doit être ouvert');
});

test('retirer le droit referme l\'accès, sans rien effacer', async () => {
  const r = await basculer(THEO, false);
  assert.strictEqual(r.status, 200, r.txt);
  assert.strictEqual((await ligneDe(THEO)).certificateur, false);
  assert.strictEqual(await accedeAEvaluer(THEO), 403, 'l\'accès doit être refermé');
  // La ligne reste en base, à `actif = 0` : on désactive, on ne supprime pas.
  const ligne = dbq().prepare('SELECT actif FROM academy_evaluateurs WHERE email = ?').get(THEO);
  assert.ok(ligne, 'la ligne de droit doit rester, désactivée');
  assert.strictEqual(ligne.actif, 0);
});

// ===========================================================================
//  3. L'ADMINISTRATEUR L'A PAR SON RÔLE
// ===========================================================================

test('l\'administrateur est certificateur d\'office, et RIEN ne lui est accordé', async () => {
  const admin = (await collaborateurs()).find((c) => c.email === ADMIN);
  if (admin) {
    assert.strictEqual(admin.certificateurAdmin, true, 'son droit vient de son rôle');
  }
  // Il évalue sans aucune ligne dans la table des droits.
  const ligne = dbq().prepare('SELECT * FROM academy_evaluateurs WHERE email = ?').get(ADMIN);
  assert.ok(!ligne || !ligne.actif, 'aucun droit ne doit lui avoir été posé en base');
  assert.strictEqual(await accedeAEvaluer(ADMIN), 200, 'il accède d\'office');
});

// ===========================================================================
//  4. LA GARDE EST SERVEUR
// ===========================================================================

test('UN NON-ADMINISTRATEUR NE PEUT PAS S\'ATTRIBUER LE DROIT', async () => {
  const avant = app.academyPratique.estEvaluateur(THEO);
  const r = await basculer(THEO, true, jetons[THEO]);
  assert.strictEqual(r.status, 403, 'la route doit refuser : ' + r.txt.slice(0, 120));
  assert.strictEqual(app.academyPratique.estEvaluateur(THEO), avant, 'rien ne doit avoir été écrit');
  assert.strictEqual(await accedeAEvaluer(THEO), 403);
});

test('une CERTIFICATRICE non administratrice ne peut pas en désigner une autre', async () => {
  // Eva a le droit d'évaluer ; elle n'a pas celui d'administrer les droits.
  const r = await basculer(THEO, true, jetons[EVA]);
  assert.strictEqual(r.status, 403, 'évaluer n\'est pas administrer : ' + r.txt.slice(0, 120));
  assert.strictEqual(app.academyPratique.estEvaluateur(THEO), false);
});

test('la liste des collaborateurs elle-même reste réservée à l\'administrateur', async () => {
  for (const email of [THEO, EVA]) {
    const r = await api('GET', '/api/academy/admin/collaborateurs', null, jetons[email]);
    assert.strictEqual(r.status, 403, 'la liste ne doit pas s\'ouvrir à ' + email);
  }
});

// ===========================================================================
//  5. RIEN D'AUTRE NE BOUGE
// ===========================================================================

test('une bascule ne touche NI aux évaluations, NI aux certifications, NI aux parcours', async () => {
  const compter = () => ['academy_evaluations', 'academy_certifications', 'academy_progression',
    'academy_tentatives', 'academy_modules', 'academy_contenus']
    .reduce((o, t) => {
      try { return { ...o, [t]: dbq().prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n }; }
      catch (_) { return o; }
    }, {});

  const avant = compter();
  await basculer(THEO, true);
  await basculer(THEO, false);
  await basculer(EVA, false);
  await basculer(EVA, true);
  assert.deepStrictEqual(compter(), avant, 'une bascule de droit a écrit ailleurs');

  // Et le parcours du collaborateur est intact.
  const f = await api('GET', '/api/academy/formation', null, jetons[THEO]);
  assert.strictEqual(f.status, 200, 'son parcours doit rester accessible');
  assert.ok(f.body.formation, 'et complet');
});

// ===========================================================================
//  6. L'ANCIEN ÉCRAN N'EXISTE PLUS
// ===========================================================================

test('l\'écran « Administrer > Évaluateurs » a disparu, et son panneau avec lui', () => {
  assert.ok(!/function rendrePanneauEvaluateurs/.test(js), 'le panneau subsiste');
  assert.ok(!/function ligneCompte/.test(js), 'la ligne de l\'ancien écran subsiste');
  assert.ok(!/function agirSurCompte/.test(js), 'le geste de l\'ancien écran subsiste');
  assert.ok(!/Désigner comme évaluateur/.test(js), 'le libellé de l\'ancien écran subsiste');
  // La barre d'onglets existe de nouveau (contenus / aperçu), mais AUCUN onglet
  // « Évaluateurs » n'y est revenu — c'est cela que ce test protège.
  const onglets = js.slice(js.indexOf('const ONGLETS_ADMIN'), js.indexOf('let admOnglet'));
  assert.ok(!/evaluateur/i.test(onglets), 'un onglet Évaluateurs est réapparu dans l\'administration');
  // La route, elle, RESTE : c'est celle que l'interrupteur appelle.
  assert.ok(js.includes('/api/academy/admin/evaluateurs'),
    'la route d\'écriture existante doit être réutilisée, pas remplacée');
});

test('LES CLÉS TECHNIQUES N\'ONT PAS ÉTÉ RENOMMÉES', () => {
  // Le mot « certificateur » est un mot d'écran. La table, la colonne, la route
  // et le drapeau serveur gardent leur nom : les renommer déplacerait un droit
  // en base pour un gain de vocabulaire.
  const moteur = fs.readFileSync(path.join(__dirname, '..', 'lib', 'academyPratique.js'), 'utf8');
  assert.ok(/academy_evaluateurs/.test(moteur), 'la table doit garder son nom');
  assert.ok(/function estEvaluateur/.test(moteur), 'la lecture du droit doit garder son nom');
  assert.ok(/function definirEvaluateur/.test(moteur), 'l\'écriture du droit doit garder son nom');
  assert.ok(/evaluateur: /.test(js), 'le corps envoyé au serveur garde la clé `evaluateur`');
});
