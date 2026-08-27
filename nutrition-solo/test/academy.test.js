'use strict';
// ============================================================================
//  MY COACH ACADEMY — socle (lot 1).
//
//  Deux propriétés se cassent sans bruit et sont testées de près :
//
//   1. OUVRIR N'EST PAS TERMINER. Si les deux se confondaient, une formation
//      serait validée en cliquant sur des titres. Rien ne le signalerait, et la
//      progression cesserait de vouloir dire quoi que ce soit.
//   2. LA PROGRESSION EST INDIVIDUELLE. Aucune route n'accepte d'email : la
//      portée vient du jeton. On tente quand même d'y toucher depuis un autre
//      compte, parce qu'un cloisonnement qu'on n'attaque pas n'est pas testé.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DB = path.join(os.tmpdir(), `nutri-academy-test-${process.pid}.sqlite`);
process.env.NUTRITION_DB = DB;
process.env.ADMIN_EMAIL = 'patron@exemple.fr';

const app = require('../server');
const A = require('../lib/academy');
let srv, base;

const ADMIN = 'patron@exemple.fr';
const COLLAB = 'theo@exemple.fr';       // collaborateur actif, NON certifié
const COACH = 'quentin@exemple.fr';     // collaborateur actif, certifié
const AUTRE = 'sophie@exemple.fr';      // autre collaborateur : cloisonnement
const CLIENT = 'lea@exemple.fr';        // client : ne doit pas entrer
const jetons = {};

const PUBLIC = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUBLIC, 'academy.html'), 'utf8');
const js = fs.readFileSync(path.join(PUBLIC, 'academy.js'), 'utf8');
const css = fs.readFileSync(path.join(PUBLIC, 'academy.css'), 'utf8');

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
}

const formationDe = async (email) => (await api('GET', '/api/academy/formation', null, jetons[email])).body.formation;

test.before(async () => {
  await new Promise((r) => { srv = app.listen(0, r); });
  base = `http://127.0.0.1:${srv.address().port}`;
  app.boost.assurerSchema();
  app.academy.assurerSchema();
  for (const [e, p] of [[ADMIN, '7777'], [COLLAB, '4004'], [COACH, '2002'], [AUTRE, '3003'], [CLIENT, '1001']]) {
    await connecter(e, p);
  }
  for (const e of [COLLAB, COACH, AUTRE]) {
    await api('POST', '/api/boost/admin/collaborateurs', { email: e, role: 'collaborateur' }, jetons[ADMIN]);
  }
  await api('PUT', `/api/boost/admin/certification/${COACH}`,
    { statut: 'certifie', evaluateur: 'Stan Martin', dateCertification: '2026-07-15', scoreQcm: 88, resultatPratique: 'valide' }, jetons[ADMIN]);
});

test.after(() => {
  if (srv) srv.close();
  require('../lib/db').closeDb();
  ['', '-wal', '-shm'].forEach((s) => { try { fs.unlinkSync(DB + s); } catch (_) {} });
});

// ===========================================================================
//  1. QUI PEUT SE FORMER
// ===========================================================================

test('la page /academy est servie, sans exiger de session', async () => {
  const r = await api('GET', '/academy');
  assert.strictEqual(r.status, 200);
  assert.ok(r.txt.includes('id="acLogin"'), 'l\'écran de connexion est dans la page');
  assert.ok(r.txt.includes('academy.js'));
});

test('sans jeton, aucune route Academy ne répond', async () => {
  for (const route of ['/api/academy/moi', '/api/academy/formation', '/api/academy/contenus/1']) {
    assert.strictEqual((await api('GET', route)).status, 401, route);
  }
});

test('un collaborateur NON certifié accède à la formation', async () => {
  // C'est le cœur du dispositif : la certification n'est pas un prérequis, elle
  // est le RÉSULTAT. L'exiger pour entrer serait un cercle.
  const moi = await api('GET', '/api/academy/moi', null, jetons[COLLAB]);
  assert.strictEqual(moi.status, 200);
  assert.strictEqual(moi.body.collaborateur, true);

  const f = await api('GET', '/api/academy/formation', null, jetons[COLLAB]);
  assert.strictEqual(f.status, 200);
  assert.ok(f.body.formation.modules.length > 0);
});

test('un collaborateur certifié y accède aussi', async () => {
  assert.strictEqual((await api('GET', '/api/academy/formation', null, jetons[COACH])).status, 200);
});

test('un client est refusé', async () => {
  const moi = await api('GET', '/api/academy/moi', null, jetons[CLIENT]);
  assert.strictEqual(moi.status, 200, 'il peut savoir qu\'il n\'est pas collaborateur');
  assert.strictEqual(moi.body.collaborateur, false);

  for (const [m, route] of [['GET', '/api/academy/formation'], ['POST', '/api/academy/contenus/1/ouvrir'],
    ['POST', '/api/academy/contenus/1/terminer']]) {
    const r = await api(m, route, m === 'POST' ? {} : null, jetons[CLIENT]);
    assert.strictEqual(r.status, 403, `${m} ${route}`);
    assert.strictEqual(r.body.nonCollaborateur, true);
  }
});

test('désactiver un collaborateur lui ferme l\'Academy à l\'appel suivant', async () => {
  await api('POST', '/api/boost/admin/collaborateurs', { email: AUTRE, role: 'client' }, jetons[ADMIN]);
  // Le jeton est toujours valide : c'est bien le rôle qui décide.
  const r = await api('GET', '/api/academy/formation', null, jetons[AUTRE]);
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.body.nonCollaborateur, true);

  await api('POST', '/api/boost/admin/collaborateurs', { email: AUTRE, role: 'collaborateur' }, jetons[ADMIN]);
  assert.strictEqual((await api('GET', '/api/academy/formation', null, jetons[AUTRE])).status, 200);
});

// ===========================================================================
//  2. CONTENU ET ORDRE
// ===========================================================================

test('les modules et leurs contenus sortent dans l\'ordre', async () => {
  const f = await formationDe(COLLAB);
  assert.ok(f.modules.length >= 2, 'au moins deux modules de démonstration');
  const ordres = f.modules.map((m) => m.ordre);
  assert.deepStrictEqual(ordres, [...ordres].sort((a, b) => a - b), 'modules ordonnés');
  for (const m of f.modules) {
    const o = m.contenus.map((c) => c.ordre);
    assert.deepStrictEqual(o, [...o].sort((a, b) => a - b), `contenus du module « ${m.titre} » ordonnés`);
    assert.ok(m.contenus.length > 0);
  }
});

test('les contenus de démonstration sont identifiés comme tels', async () => {
  const f = await formationDe(COLLAB);
  assert.ok(f.modules.every((m) => /démonstration/i.test(m.titre)),
    'personne ne doit prendre l\'amorçage pour la vraie formation');
});

test('seul l\'identifiant YouTube est stocké, jamais de vidéo ni d\'URL', async () => {
  const f = await formationDe(COLLAB);
  const contenus = f.modules.flatMap((m) => m.contenus);
  for (const c of contenus) {
    assert.ok(A.idYoutubeValide(c.youtubeId), 'identifiant valide : ' + c.youtubeId);
    assert.ok(!/https?:|youtube\.com|<iframe/i.test(c.youtubeId), 'ni URL ni balise en base');
  }
  // Et rien qui ressemble à un fichier vidéo dans la réponse.
  const brut = (await api('GET', '/api/academy/formation', null, jetons[COLLAB])).txt;
  assert.ok(!/\.mp4|\.webm|base64/i.test(brut));
});

test('un identifiant YouTube abîmé ne part pas dans un attribut src', () => {
  assert.strictEqual(A.idYoutubeValide('DEMOaaaa001'), true);
  for (const faux of ['', null, 'trop-court', '"><script>alert(1)</script>', 'https://youtu.be/abc']) {
    assert.strictEqual(A.idYoutubeValide(faux), false, String(faux));
  }
});

test('l\'amorçage est idempotent : rejouer ne duplique rien', () => {
  const db = require('../lib/db').getDb();
  const avant = db.prepare('SELECT COUNT(*) AS n FROM academy_contenus').get().n;
  app.academy.amorcer();
  app.academy.amorcer();
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM academy_contenus').get().n, avant);
});

// ===========================================================================
//  3. OUVRIR N'EST PAS TERMINER
// ===========================================================================

let premier, deuxieme;

test('au départ, rien n\'est commencé et la progression est à zéro', async () => {
  const f = await formationDe(COLLAB);
  premier = f.modules[0].contenus[0];
  deuxieme = f.modules[0].contenus[1];
  assert.strictEqual(f.termines, 0);
  assert.strictEqual(f.pourcentage, 0);
  assert.strictEqual(f.dernierConsulte, null);
  assert.strictEqual(f.reprise, premier.id, 'on reprend par le premier contenu');
  assert.ok(f.modules.every((m) => m.contenus.every((c) => !c.commence && !c.termine)));
});

test('ouvrir un contenu le marque commencé — et surtout PAS terminé', async () => {
  const r = await api('POST', `/api/academy/contenus/${premier.id}/ouvrir`, {}, jetons[COLLAB]);
  assert.strictEqual(r.status, 200);

  const f = r.body.formation;
  const c = f.modules[0].contenus[0];
  assert.strictEqual(c.commence, true);
  assert.strictEqual(c.termine, false, 'ouvrir une page n\'est pas avoir regardé une vidéo');
  assert.ok(c.ouvertLe, 'la date d\'ouverture est enregistrée');
  assert.strictEqual(c.termineLe, null);
  // La progression n'a pas bougé d'un point.
  assert.strictEqual(f.termines, 0);
  assert.strictEqual(f.pourcentage, 0);
  assert.strictEqual(f.dernierConsulte, premier.id);
});

test('terminer un contenu le compte, et date la complétion', async () => {
  const r = await api('POST', `/api/academy/contenus/${premier.id}/terminer`, {}, jetons[COLLAB]);
  assert.strictEqual(r.status, 200);
  const c = r.body.formation.modules[0].contenus[0];
  assert.strictEqual(c.termine, true);
  assert.ok(c.termineLe, 'la date de complétion est enregistrée');
  assert.strictEqual(r.body.formation.termines, 1);
});

test('terminer deux fois ne change pas la date de complétion', async () => {
  const avant = (await formationDe(COLLAB)).modules[0].contenus[0].termineLe;
  await api('POST', `/api/academy/contenus/${premier.id}/terminer`, {}, jetons[COLLAB]);
  const apres = (await formationDe(COLLAB)).modules[0].contenus[0];
  assert.strictEqual(apres.termineLe, avant, 'la première complétion fait foi');
  assert.strictEqual((await formationDe(COLLAB)).termines, 1, 'et ne compte pas deux fois');
});

test('rouvrir un contenu déjà terminé ne le dé-termine pas', async () => {
  await api('POST', `/api/academy/contenus/${premier.id}/ouvrir`, {}, jetons[COLLAB]);
  const c = (await formationDe(COLLAB)).modules[0].contenus[0];
  assert.strictEqual(c.termine, true);
});

test('un contenu inexistant ou inactif répond 404', async () => {
  for (const id of [999999, 'abc']) {
    assert.strictEqual((await api('POST', `/api/academy/contenus/${id}/ouvrir`, {}, jetons[COLLAB])).status, 404, String(id));
    assert.strictEqual((await api('POST', `/api/academy/contenus/${id}/terminer`, {}, jetons[COLLAB])).status, 404, String(id));
  }
});

// ===========================================================================
//  4. PROGRESSION, MODULE ET GLOBALE
// ===========================================================================

test('la progression du module et la globale sont justes', async () => {
  await api('POST', `/api/academy/contenus/${deuxieme.id}/terminer`, {}, jetons[COLLAB]);
  const f = await formationDe(COLLAB);
  const m1 = f.modules[0];

  assert.strictEqual(m1.termines, 2);
  assert.strictEqual(m1.pourcentage, Math.round((2 / m1.total) * 100));
  assert.strictEqual(m1.acheve, m1.termines === m1.total);

  assert.strictEqual(f.termines, 2);
  assert.strictEqual(f.pourcentage, Math.round((2 / f.total) * 100));
  assert.strictEqual(f.acheve, false, 'la formation n\'est pas finie');
});

test('un module devient achevé quand tous ses contenus le sont', async () => {
  const f0 = await formationDe(COLLAB);
  for (const c of f0.modules[0].contenus) {
    await api('POST', `/api/academy/contenus/${c.id}/terminer`, {}, jetons[COLLAB]);
  }
  const f = await formationDe(COLLAB);
  assert.strictEqual(f.modules[0].acheve, true);
  assert.strictEqual(f.modules[0].pourcentage, 100);
  assert.strictEqual(f.modules[1].acheve, false, 'le module suivant n\'a pas bougé');
  assert.ok(f.pourcentage > 0 && f.pourcentage < 100);
});

test('tout terminer met la formation à 100 %', async () => {
  const f0 = await formationDe(COLLAB);
  for (const c of f0.modules.flatMap((m) => m.contenus)) {
    await api('POST', `/api/academy/contenus/${c.id}/terminer`, {}, jetons[COLLAB]);
  }
  const f = await formationDe(COLLAB);
  assert.strictEqual(f.pourcentage, 100);
  assert.strictEqual(f.acheve, true);
  assert.strictEqual(f.termines, f.total);
  assert.strictEqual(f.reprise, null, 'plus rien à reprendre');
});

// ===========================================================================
//  5. REPRISE
// ===========================================================================

test('la reprise pointe le dernier contenu consulté, s\'il n\'est pas terminé', async () => {
  const f0 = await formationDe(COACH);
  const tous = f0.modules.flatMap((m) => m.contenus);
  await api('POST', `/api/academy/contenus/${tous[0].id}/terminer`, {}, jetons[COACH]);
  await api('POST', `/api/academy/contenus/${tous[2].id}/ouvrir`, {}, jetons[COACH]);

  const f = await formationDe(COACH);
  assert.strictEqual(f.dernierConsulte, tous[2].id);
  assert.strictEqual(f.reprise, tous[2].id, 'on reprend là où on s\'est arrêté, pas au premier trou');
});

test('si le dernier consulté a été terminé, la reprise passe au premier contenu restant', async () => {
  const f0 = await formationDe(COACH);
  const tous = f0.modules.flatMap((m) => m.contenus);
  await api('POST', `/api/academy/contenus/${tous[2].id}/terminer`, {}, jetons[COACH]);
  const f = await formationDe(COACH);
  assert.strictEqual(f.dernierConsulte, tous[2].id, 'le dernier consulté ne bouge pas');
  assert.strictEqual(f.reprise, tous[1].id, 'mais la reprise pointe le premier contenu non terminé');
});

test('la reprise survit à une déconnexion et une reconnexion', async () => {
  const avant = await formationDe(COACH);
  await api('POST', '/account/logout', {}, jetons[COACH]);
  assert.strictEqual((await api('GET', '/api/academy/formation', null, jetons[COACH])).status, 401);

  await connecter(COACH, '2002');
  const apres = await formationDe(COACH);
  assert.strictEqual(apres.reprise, avant.reprise, 'la progression vit côté serveur, pas dans le navigateur');
  assert.strictEqual(apres.termines, avant.termines);
  assert.strictEqual(apres.dernierConsulte, avant.dernierConsulte);
});

// ===========================================================================
//  6. CLOISONNEMENT
// ===========================================================================

test('la progression est strictement individuelle', async () => {
  const duCoach = await formationDe(COACH);
  const deLAutre = await formationDe(AUTRE);
  assert.ok(duCoach.termines > 0);
  assert.strictEqual(deLAutre.termines, 0, 'un autre collaborateur part de zéro');
  assert.strictEqual(deLAutre.dernierConsulte, null);
});

test('aucune route n\'accepte d\'email : on ne touche pas à la progression d\'un autre', async () => {
  const f = await formationDe(COACH);
  const cible = f.modules[0].contenus[0].id;

  // On tente de faire progresser quelqu'un d'autre, de toutes les façons
  // qu'offre l'API. Aucune ne mord : la portée vient du jeton.
  await api('POST', `/api/academy/contenus/${cible}/terminer?email=${encodeURIComponent(COACH)}`, {}, jetons[AUTRE]);
  await api('POST', `/api/academy/contenus/${cible}/terminer`, { email: COACH }, jetons[AUTRE]);

  const apres = await formationDe(AUTRE);
  assert.strictEqual(apres.termines, 1, 'c\'est SA progression qui a bougé, pas celle du coach');
  const duCoach = await formationDe(COACH);
  assert.strictEqual(duCoach.termines, f.termines, 'la progression du coach est intacte');
});

// ===========================================================================
//  7. LA PAGE
// ===========================================================================

test('la page est autonome et n\'emprunte que la palette', () => {
  assert.ok(!html.includes('app.js'), 'l\'app cliente n\'est pas chargée');
  assert.ok(!html.includes('coach.js'), 'ni l\'espace Coach');
  assert.ok(html.includes('coach.css'), 'mais la palette est partagée : une seule source');
  assert.ok(html.includes('academy.css') && html.includes('academy.js'));
  assert.ok(/name="robots"[^>]*noindex/.test(html));
  assert.ok(js.includes("'mc-academy-session'"), 'session dédiée');
  assert.ok(!js.includes('mc-coach-session') && !js.includes('nutri-compte'),
    'elle ne touche pas aux sessions des autres espaces');
});

test('le script n\'appelle que les routes Academy', () => {
  assert.ok(!js.includes('/api/boost/'), 'aucune route Boost');
  for (const route of ['/api/academy/moi', '/api/academy/formation', '/ouvrir', '/terminer']) {
    assert.ok(js.includes(route), 'appelle ' + route);
  }
  // La progression n'est jamais recalculée côté écran : elle vient du serveur.
  assert.ok(!/pourcentage\s*=\s*Math\./.test(js), 'aucun calcul de progression dans l\'écran');
});

test('la vidéo est intégrée sans cookie, et l\'identifiant est encodé', () => {
  assert.ok(js.includes('youtube-nocookie.com/embed/'), 'lecteur sans cookie');
  assert.ok(/encodeURIComponent\(c\.youtubeId\)/.test(js), 'l\'identifiant est encodé dans l\'URL');
  assert.ok(js.includes('allowfullscreen'));
  // Le ratio est tenu par le CSS : une iframe sans hauteur s'effondrerait.
  assert.ok(/\.ac-video\s*\{[^}]*padding-top:\s*56\.25%/.test(css));
});

test('l\'écran distingue les trois états d\'un contenu', () => {
  assert.ok(/ac-fait/.test(js) && /ac-encours/.test(js) && /ac-avenir/.test(js));
  for (const cls of ['.ac-fait', '.ac-encours', '.ac-avenir']) {
    assert.ok(css.includes(cls), 'style manquant : ' + cls);
  }
});

test('l\'écran dit franchement que « terminer » est une déclaration', () => {
  // On ne peut pas prouver qu'une vidéo a été regardée. Le texte ne doit pas
  // laisser croire le contraire.
  assert.ok(/quand tu as regardé/i.test(js), 'la confirmation est demandée explicitement');
  assert.ok(!/vérifi(é|ons)|prouv|contrôl/i.test(js.slice(js.indexOf('function rendreLecteur'))),
    'aucune promesse de vérification');
});

test('le lot 1 ne construit ni QCM ni certification', () => {
  // On juge sur le CODE, commentaires retirés : ceux-ci parlent du programme,
  // pas au collaborateur. Et l'écran a bien le droit de dire à quoi mène la
  // formation (« devenir Coach Nutrition certifié ») — ce qu'il ne doit pas
  // faire, c'est en construire la mécanique.
  const code = js.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  for (const interdit of ['qcm', 'question', 'tentative', 'bonne réponse', 'seuil']) {
    assert.ok(!new RegExp(interdit, 'i').test(code), 'l\'écran construit du « ' + interdit + ' » : hors périmètre du lot');
  }
  assert.ok(!/\/api\/academy\/(qcm|tentatives|questions)/.test(js), 'aucune route de QCM appelée');
});

test('l\'espace Coach mène à la formation au lieu d\'être une impasse', () => {
  const coachJs = fs.readFileSync(path.join(PUBLIC, 'coach.js'), 'utf8');
  assert.ok(coachJs.includes('href="/academy"'), 'l\'écran d\'attente propose la formation');
  assert.ok(coachJs.includes('Accéder à ma formation'));
});
