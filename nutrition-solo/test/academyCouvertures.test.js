'use strict';
// ============================================================================
//  MY COACH ACADEMY — L'IMAGE DE COUVERTURE D'UNE FORMATION.
//
//  CE QUE CETTE SUITE GARDE :
//
//   1. UNE COUVERTURE N'EST QU'UNE ILLUSTRATION. Elle ne touche ni au
//      catalogue, ni aux modules, ni au QCM, ni à la progression, ni à la
//      certification. On le vérifie en photographiant l'état avant/après.
//   2. LE CATALOGUE RESTE LÉGER. Il transporte la DATE de l'image, jamais ses
//      octets — sinon chaque lecture de catalogue pèserait le poids des
//      illustrations.
//   3. UN BROUILLON RESTE UN BROUILLON. Sa couverture n'est pas atteignable par
//      un collaborateur qui devinerait la clé ; seul l'administrateur la voit.
//   4. LA GARDE TIENT. Pas de jeton -> 401, pas d'accès Academy -> 403,
//      pas administrateur -> 403 à l'écriture.
//   5. REMPLACER CHANGE LA DATE. Sans ça, l'écran garderait l'ancienne image
//      en mémoire et le remplacement resterait invisible.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DB = path.join(os.tmpdir(), `nutri-academy-couv-test-${process.pid}.sqlite`);
process.env.NUTRITION_DB = DB;
process.env.ADMIN_EMAIL = 'patron@exemple.fr';

const app = require('../server');
let srv, base;

const ADMIN = 'patron@exemple.fr';
const THEO = 'theo.c@exemple.fr';     // collaborateur
const LEA = 'lea.c@exemple.fr';       // cliente : pas d'Academy
const jetons = {};

const PUBLIC = path.join(__dirname, '..', 'public');
const js = fs.readFileSync(path.join(PUBLIC, 'academy.js'), 'utf8');
const css = fs.readFileSync(path.join(PUBLIC, 'academy.css'), 'utf8');
const moteur = fs.readFileSync(path.join(__dirname, '..', 'lib', 'academyCouvertures.js'), 'utf8');

// De vraies images : un PNG et un JPEG minimaux, valides tous les deux.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');

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

// L'envoi de l'image : corps BRUT, comme l'écran le fait après compression.
const envoyer = (cle, mime, buffer, jeton) =>
  fetch(`${base}/api/academy/admin/formations/${encodeURIComponent(cle)}/couverture`, {
    method: 'POST',
    headers: { 'Content-Type': mime, ...(jeton ? { Authorization: 'Bearer ' + jeton } : {}) },
    body: buffer,
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

const lire = (cle, jeton) =>
  fetch(`${base}/api/academy/formations/${encodeURIComponent(cle)}/couverture`,
    { headers: jeton ? { Authorization: 'Bearer ' + jeton } : {} });

const retirer = (cle, jeton) =>
  fetch(`${base}/api/academy/admin/formations/${encodeURIComponent(cle)}/couverture`,
    { method: 'DELETE', headers: jeton ? { Authorization: 'Bearer ' + jeton } : {} })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

async function connecter(email, pin) {
  const r = await api('POST', '/account/login', { email, prenom: email.split('@')[0], pin });
  jetons[email] = r.body.token;
}

const dbq = () => require('../lib/db').getDb();
const adm = (m, route, corps) => api(m, route, corps, jetons[ADMIN]);
const collab = (m, route, corps) => api(m, route, corps, jetons[THEO]);
const ficheDe = async (cle) =>
  (await collab('GET', '/api/academy/formations')).body.formations.find((f) => f.cle === cle);

let CLE;   // la formation publiée sur laquelle on travaille

test.before(async () => {
  await new Promise((r) => { srv = app.listen(0, r); });
  base = `http://127.0.0.1:${srv.address().port}`;
  app.boost.assurerSchema();
  app.academy.assurerSchema();
  app.academyCouvertures.assurerSchema();
  for (const [e, p] of [[ADMIN, '7777'], [THEO, '4004'], [LEA, '1001']]) await connecter(e, p);
  await api('POST', '/api/boost/admin/collaborateurs', { email: THEO, role: 'collaborateur' }, jetons[ADMIN]);
  CLE = (await collab('GET', '/api/academy/formations')).body.formations[0].cle;
});

test.after(() => {
  if (srv) srv.close();
  require('../lib/db').closeDb();
  ['', '-wal', '-shm'].forEach((s) => { try { fs.unlinkSync(DB + s); } catch (_) {} });
});

// ===========================================================================
//  0. LE MOTEUR NE TOUCHE À RIEN D'AUTRE
// ===========================================================================

test('LE MOTEUR NE CONNAÎT AUCUNE TABLE DE PARCOURS', () => {
  const code = moteur.split('\n')
    .filter((l) => { const t = l.trim(); return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('--'); })
    .join('\n');
  for (const t of ['academy_modules', 'academy_contenus', 'academy_questions', 'academy_vus',
    'academy_position', 'academy_tentatives', 'academy_evaluations', 'boost_certifications']) {
    assert.ok(!new RegExp(t).test(code), `le moteur des couvertures nomme ${t}`);
  }
  // Il ne touche pas non plus au catalogue : il le LIT pour refuser une clé
  // inconnue, mais n'écrit jamais dedans.
  assert.ok(!/UPDATE academy_formations|INSERT INTO academy_formations/.test(code),
    'une illustration ne doit jamais écrire dans le catalogue');
});

test('academyFormations n\'a pas été touché : aucune colonne d\'image', () => {
  const colonnes = dbq().prepare('PRAGMA table_info(academy_formations)').all().map((c) => c.name);
  for (const interdite of ['couverture', 'image', 'couverture_id', 'illustration']) {
    assert.ok(!colonnes.includes(interdite),
      'le catalogue a gagné une colonne d\'image : le BLOB voyagerait à chaque lecture');
  }
  // La table dédiée, elle, existe.
  assert.ok(dbq().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get('academy_formation_couvertures'), 'la table dédiée doit exister');
});

// ===========================================================================
//  1. POSER, LIRE, REMPLACER, RETIRER
// ===========================================================================

test('sans couverture : le catalogue le dit, et la route répond 404', async () => {
  assert.strictEqual((await ficheDe(CLE)).couverture, null);
  assert.strictEqual((await lire(CLE, jetons[THEO])).status, 404,
    'pas d\'image ne doit pas être une erreur serveur');
});

test('poser une couverture : les octets reviennent à l\'identique', async () => {
  const r = await envoyer(CLE, 'image/png', PNG, jetons[ADMIN]);
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.mime, 'image/png');
  assert.strictEqual(r.body.taille, PNG.length);

  const res = await lire(CLE, jetons[THEO]);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('content-type'), 'image/png');
  assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(res.headers.get('cache-control'), /private/, 'une réponse gardée n\'entre pas dans un cache partagé');
  assert.ok(Buffer.from(await res.arrayBuffer()).equals(PNG), 'l\'image rendue n\'est pas celle envoyée');
});

test('LE CATALOGUE PORTE LA DATE, JAMAIS LES OCTETS', async () => {
  const fiche = await ficheDe(CLE);
  assert.ok(fiche.couverture, 'la fiche doit annoncer qu\'une image existe');
  assert.match(fiche.couverture, /^\d{4}-\d{2}-\d{2}T/, 'c\'est une date, pas un contenu');
  // Le poids de la fiche est le vrai garde-fou : si les octets s'y glissaient
  // un jour, ce chiffre exploserait.
  assert.ok(JSON.stringify(fiche).length < 2000,
    'la fiche du catalogue s\'est alourdie : des octets d\'image y voyagent ?');
  for (const interdit of ['data', 'image', 'blob', 'base64']) {
    assert.ok(!(interdit in fiche), `la fiche ne doit pas porter « ${interdit} »`);
  }
});

test('REMPLACER change la date — sans quoi l\'écran garderait l\'ancienne', async () => {
  const avant = (await ficheDe(CLE)).couverture;
  await new Promise((r) => setTimeout(r, 15));
  const r = await envoyer(CLE, 'image/jpeg', JPEG, jetons[ADMIN]);
  assert.strictEqual(r.status, 200);

  const apres = (await ficheDe(CLE)).couverture;
  assert.notStrictEqual(apres, avant, 'la date doit changer : c\'est le repère anti-cache de l\'écran');

  const res = await lire(CLE, jetons[THEO]);
  assert.strictEqual(res.headers.get('content-type'), 'image/jpeg', 'le nouveau format doit suivre');
  assert.ok(Buffer.from(await res.arrayBuffer()).equals(JPEG));
  // Une seule ligne : remplacer ne laisse pas l'ancienne image derrière elle.
  assert.strictEqual(
    dbq().prepare('SELECT COUNT(*) AS n FROM academy_formation_couvertures WHERE formation = ?').get(CLE).n, 1);
});

test('RETIRER l\'image ne retire que l\'image', async () => {
  const avant = dbq().prepare('SELECT * FROM academy_formations WHERE cle = ?').get(CLE);
  const r = await retirer(CLE, jetons[ADMIN]);
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await lire(CLE, jetons[THEO])).status, 404);
  assert.strictEqual((await ficheDe(CLE)).couverture, null);
  assert.deepStrictEqual(dbq().prepare('SELECT * FROM academy_formations WHERE cle = ?').get(CLE), avant,
    'la formation elle-même ne devait pas bouger');
  // Retirer deux fois ne casse rien.
  assert.strictEqual((await retirer(CLE, jetons[ADMIN])).status, 200);
});

// ===========================================================================
//  2. CE QUI EST REFUSÉ
// ===========================================================================

test('seuls JPG, PNG et WebP sont acceptés', async () => {
  for (const mime of ['image/svg+xml', 'text/html', 'application/pdf', 'application/octet-stream']) {
    const r = await envoyer(CLE, mime, Buffer.from('<x>'), jetons[ADMIN]);
    assert.strictEqual(r.status, 415, mime);
  }
  assert.strictEqual(dbq().prepare('SELECT COUNT(*) AS n FROM academy_formation_couvertures').get().n, 0,
    'un refus ne doit rien écrire');
});

test('une image vide et une clé inconnue sont refusées', async () => {
  assert.strictEqual((await envoyer(CLE, 'image/png', Buffer.alloc(0), jetons[ADMIN])).status, 400);
  assert.strictEqual((await envoyer('formation_qui_nexiste_pas', 'image/png', PNG, jetons[ADMIN])).status, 404);
});

test('LA GARDE TIENT, en lecture comme en écriture', async () => {
  await envoyer(CLE, 'image/png', PNG, jetons[ADMIN]);
  // Lecture : il faut un compte, ET l'accès à l'Academy.
  assert.strictEqual((await lire(CLE)).status, 401, 'sans jeton : 401');
  assert.strictEqual((await lire(CLE, 'faux-jeton')).status, 401, 'jeton invalide : 401');
  assert.strictEqual((await lire(CLE, jetons[LEA])).status, 403, 'cliente : 403');
  assert.strictEqual((await lire(CLE, jetons[THEO])).status, 200, 'collaborateur : 200');
  // Écriture : administrateur seulement.
  assert.strictEqual((await envoyer(CLE, 'image/png', PNG, jetons[THEO])).status, 403);
  assert.strictEqual((await retirer(CLE, jetons[THEO])).status, 403);
  assert.strictEqual((await envoyer(CLE, 'image/png', PNG)).status, 401);
});

test('UN BROUILLON RESTE UN BROUILLON, son image comprise', async () => {
  const cree = await adm('POST', '/api/academy/admin/formations',
    { cle: 'brouillon_illustre', libelle: 'Brouillon illustré', titre: 'Titre' });
  assert.strictEqual(cree.status, 200, cree.txt.slice(0, 200));
  assert.strictEqual((await envoyer('brouillon_illustre', 'image/png', PNG, jetons[ADMIN])).status, 200,
    'l\'administrateur doit pouvoir illustrer un brouillon');

  assert.strictEqual((await lire('brouillon_illustre', jetons[THEO])).status, 404,
    'une clé devinée ne doit pas révéler par l\'image un parcours en construction');
  assert.strictEqual((await lire('brouillon_illustre', jetons[ADMIN])).status, 200,
    'celui qui le prépare, lui, doit le voir');
});

// ===========================================================================
//  3. LE PARCOURS N'A PAS BOUGÉ
// ===========================================================================

test('ILLUSTRER UNE FORMATION NE TOUCHE À AUCUN PARCOURS', async () => {
  const compte = (t) => dbq().prepare('SELECT COUNT(*) AS n FROM ' + t).get().n;
  const tables = ['academy_formations', 'academy_modules', 'academy_contenus', 'academy_questions',
    'academy_vus', 'academy_position', 'boost_collaborateurs'];
  const avant = Object.fromEntries(tables.map((t) => [t, compte(t)]));
  const catAvant = await collab('GET', '/api/academy/formations');
  const formAvant = await collab('GET', '/api/academy/formation');

  await envoyer(CLE, 'image/png', PNG, jetons[ADMIN]);
  await lire(CLE, jetons[THEO]);
  await retirer(CLE, jetons[ADMIN]);
  await envoyer(CLE, 'image/jpeg', JPEG, jetons[ADMIN]);

  for (const t of tables) assert.strictEqual(compte(t), avant[t], 'la table ' + t + ' a bougé');

  // Et ce que l'API raconte du parcours est identique, à la couverture près.
  const sansImage = (r) => r.body.formations.map(({ couverture, ...reste }) => reste);
  assert.deepStrictEqual(sansImage(await collab('GET', '/api/academy/formations')), sansImage(catAvant),
    'le catalogue a changé au-delà de l\'illustration');
  assert.deepStrictEqual((await collab('GET', '/api/academy/formation')).body.formation,
    formAvant.body.formation, 'la progression a bougé');
});

test('L\'ARBRE D\'ADMINISTRATION PORTE AUSSI LA COUVERTURE', async () => {
  // ⚠️ LE PIÈGE QUE CE TEST FERME. Le panneau de réglages lit la formation de
  // l'ARBRE, pas celle du catalogue. Enrichir le seul catalogue affichait
  // « aucune image » sur une formation qui en avait une — et enrichir la seule
  // route GET aurait fait disparaître l'aperçu au premier module enregistré,
  // puisque toutes les écritures renvoient l'arbre à leur tour.
  await envoyer(CLE, 'image/png', PNG, jetons[ADMIN]);

  const parGet = await adm('GET', `/api/academy/admin/arbre?formation=${CLE}`);
  assert.ok(parGet.body.formation.couverture, 'la lecture de l\'arbre doit porter la couverture');

  // Et après une écriture de contenu, qui renvoie l'arbre elle aussi.
  const ecrit = await adm('POST', '/api/academy/admin/modules',
    { formation: CLE, titre: 'Module de contrôle' });
  assert.strictEqual(ecrit.status, 200, ecrit.txt.slice(0, 200));
  assert.ok(ecrit.body.arbre.formation.couverture,
    'enregistrer un module ne doit pas faire disparaître l\'aperçu de l\'image');

  await retirer(CLE, jetons[ADMIN]);
  const apres = await adm('GET', `/api/academy/admin/arbre?formation=${CLE}`);
  assert.strictEqual(apres.body.formation.couverture, null, 'et le retrait se voit aussi');
});

// ===========================================================================
//  4. L'ÉCRAN
// ===========================================================================

test('la carte porte un cadre d\'image, et un repli quand il n\'y en a pas', () => {
  const bloc = js.slice(js.indexOf('function rendreAccueil'), js.indexOf('function etapesDe'));
  assert.ok(/cadreCouverture\(f\)/.test(bloc), 'la carte doit poser son cadre de couverture');
  assert.ok(/REPLI_COUVERTURE/.test(js), 'un visuel de repli doit exister');
  // Le repli est TOUJOURS dans le cadre : une carte n'est jamais vide.
  const cadre = js.slice(js.indexOf('const cadreCouverture'), js.indexOf("const ORDRE_STATUT"));
  assert.ok(/REPLI_COUVERTURE/.test(cadre), 'le repli doit être posé même quand une image existe');
});

test('MÊME RATIO ET MÊME HAUTEUR POUR TOUTES, sans déformation', () => {
  const bloc = css.slice(css.indexOf('.ac-cv {'), css.indexOf('.ac-cv-repli'));
  assert.ok(/aspect-ratio:\s*16\s*\/\s*9/.test(bloc), 'le cadre doit imposer le ratio');
  assert.ok(!/height:\s*\d/.test(bloc), 'pas de hauteur fixe : le ratio suffit et reste responsive');
  assert.ok(/object-fit:\s*cover/.test(css.slice(css.indexOf('.ac-cv-img'))),
    'l\'image doit être recadrée, jamais déformée');
  // Le champ d'administration montre le MÊME cadrage que la carte : sans quoi
  // l'aperçu mentirait sur le rendu final.
  assert.ok(/\.ac-cvadm-cadre[^}]*aspect-ratio:\s*16\s*\/\s*9/s.test(css),
    'l\'aperçu d\'administration doit avoir le ratio de la carte');
});

test('le jeton ne voyage jamais dans l\'URL d\'une couverture', () => {
  assert.ok(/couvertureUrl/.test(js) && /createObjectURL/.test(js),
    'les images passent par une URL d\'objet, pas par un src direct');
  assert.ok(!/couverture\?token=|couverture\?jeton=/.test(js), 'un jeton passe dans une URL');
});

test('l\'administration comprime AVANT d\'envoyer', () => {
  assert.ok(/comprimerCouverture/.test(js), 'la compression doit exister');
  const fn = js.slice(js.indexOf('async function comprimerCouverture'), js.indexOf('function champCouverture'));
  assert.ok(/canvas/.test(fn) && /toBlob/.test(fn), 'le redimensionnement passe par un canvas');
  assert.ok(/imageOrientation/.test(fn), 'l\'orientation EXIF doit être respectée : sinon les photos sortent couchées');
  assert.ok(/image\/webp/.test(fn) && /image\/jpeg/.test(fn), 'WebP, avec JPEG en repli');
  // Aucune dépendance de traitement d'image n'a été ajoutée au projet.
  const pkg = require('../package.json');
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies });
  for (const lourde of ['sharp', 'jimp', 'canvas', 'gm', 'imagemin']) {
    assert.ok(!deps.includes(lourde), 'une dépendance image a été ajoutée : ' + lourde);
  }
});

test('les trois gestes demandés existent : ajouter, remplacer, supprimer', () => {
  assert.ok(/data-adm="couverture-choisir"/.test(js), 'ajouter / remplacer');
  assert.ok(/data-adm="couverture-retirer"/.test(js), 'supprimer');
  assert.ok(/data-adm="couverture-annuler"/.test(js), 'et revenir en arrière');
  assert.ok(/type="file"[^>]*accept="image\/jpeg,image\/png,image\/webp"/.test(js),
    'le fichier se choisit depuis l\'ordinateur, sans URL à saisir');
  assert.ok(!/placeholder="https?:/.test(js.slice(js.indexOf('function champCouverture'), js.indexOf('async function envoyerCouverture'))),
    'aucune URL à héberger soi-même');
  // Le champ est proposé à la création ET à la modification.
  assert.ok(/champCouverture\(null\)/.test(js), 'à la création');
  assert.ok(/champCouverture\(f\)/.test(js), 'et à la modification');
});
