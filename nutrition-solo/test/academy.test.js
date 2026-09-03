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
const { certifierAncienne } = require('./aideAcademy');
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
  // Certification ANTÉRIEURE à l'Academy, écrite à la main : depuis le lot 4,
  // aucune route ne permet plus de certifier sans le parcours complet — et
  // c'est précisément ce cas hérité qu'on veut éprouver ici.
  certifierAncienne({ db: require('../lib/db').getDb(), email: COACH });
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
  // LE PÉRIMÈTRE EST LA FONCTION, PAS TOUT CE QUI LA SUIT. « …jusqu'à la fin du
  // fichier » attrapait n'importe quel « contrôle » écrit ailleurs — l'aperçu
  // d'administration, par exemple, qui n'a rien à voir avec le lecteur.
  const lecteur = js.slice(js.indexOf('function rendreLecteur'), js.indexOf('function versEtapes'));
  assert.ok(lecteur.length > 300, 'le lecteur doit être délimité');
  assert.ok(!/vérifi(é|ons)|prouv|contrôl/i.test(lecteur),
    'aucune promesse de vérification');
});

test('l\'écran ne prononce aucune certification', () => {
  // Deux frontières sont tombées, chacune à son lot : le QCM au lot 2, puis
  // l'évaluation pratique au lot 3. C'est voulu. LA DERNIÈRE TIENT TOUJOURS —
  // le verdict « Coach Nutrition certifié » ne s'écrit pas dans un navigateur,
  // et l'écran ne touche pas au système qui le porte.
  //
  // On juge sur le CODE, commentaires retirés : ceux-ci parlent du programme,
  // pas au collaborateur. L'écran a bien le droit de DIRE que la certification
  // viendra ensuite — ce qu'il ne doit pas faire, c'est la prononcer.
  const code = js.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.ok(!/\/api\/boost\//.test(code), 'l\'écran ne touche pas au système de certification');
  // L'écran administre désormais les évaluateurs (lot 3), les certifications
  // (lot 4) et les contenus (lot 6). Chacune de ces portes a été ouverte
  // délibérément, et toutes restent gardées par exigeAdmin côté serveur.
  //
  // LA DERNIÈRE FRONTIÈRE TIENT TOUJOURS, et c'est celle que ce test défend :
  // l'écran ne DÉCIDE de rien. Il ne prononce aucune certification, n'écrit
  // aucun statut, et ne touche pas au système du Boost — administrer des
  // contenus n'est pas accorder un droit.
  assert.ok(!/\/api\/boost\//.test(code), 'l\'écran ne touche pas au système du Boost');
  // Le lot 6 administre les contenus, mais PAS la configuration du QCM par une
  // porte dérobée : le nombre de questions et le seuil sont des colonnes de la
  // formation, réglées par sa propre route.
  assert.ok(!/\/api\/academy\/admin\/(choix|config)/.test(code),
    'une route d\'administration non prévue est appelée');
  // Et la publication ne se décide pas non plus dans le navigateur : l'écran
  // demande, le serveur vérifie et tranche.
  assert.ok(code.includes('/publier') || /data-adm="publier"/.test(code), 'la publication passe par le serveur');
  // Ce que l'écran ENVOIE quand il demande une certification : une date, un
  // commentaire, un motif. Jamais un statut, jamais un droit. On le vérifie
  // sur le corps de la fonction concernée plutôt qu'au jugé sur tout le
  // fichier — un libellé « Certifié » à l'écran n'est pas une décision.
  const geste = code.slice(code.indexOf('async function agirSurCertification'));
  const corps = geste.slice(0, geste.indexOf('\n}'));
  assert.ok(corps.includes('/api/academy/admin/certifications'), 'la fonction de délivrance a bien été trouvée');
  for (const interdit of ['statut', 'certifie', 'droit', 'peutSuivre']) {
    assert.ok(!new RegExp('\\b' + interdit + '\\s*:').test(corps),
      'l\'écran envoie « ' + interdit +' » au serveur : ce n\'est pas à lui d\'en décider');
  }
  assert.ok(!/statut\s*[:=]\s*'certifie'/.test(code), 'l\'écran ne prononce aucune certification');
});

test('l\'espace Coach mène à la formation au lieu d\'être une impasse', () => {
  const coachJs = fs.readFileSync(path.join(PUBLIC, 'coach.js'), 'utf8');
  assert.ok(coachJs.includes('href="/academy"'), 'l\'écran d\'attente propose la formation');
  assert.ok(coachJs.includes('Accéder à ma formation'));
});

// ===========================================================================
//  LA CARTE D'UNE FORMATION GARDE SA PROGRESSION DE CONTENUS
//
//  Le rail « Ton parcours » et son anneau de progression globale ont été
//  retirés de l'accueil : ils répétaient le bandeau de KPI. Le pourcentage de
//  CHAQUE CARTE, lui, reste la progression des contenus de cette formation —
//  c'est une autre question, et elle continue de se poser.
// ===========================================================================

test('la carte d\'une formation garde SA progression de contenus', () => {
  // Le « X % complété » de la carte lit f.pourcentage — la progression des
  // contenus — et ne doit pas avoir été remplacé par la progression d'étapes.
  assert.ok(/Number\.isFinite\(f\.pourcentage\) \? f\.pourcentage : 0/.test(js),
    'la carte doit continuer à afficher le pourcentage de contenus');
  assert.ok(/<b>' \+ pct \+ '%<\/b> complété/.test(js), 'le libellé « % complété » de la carte est intact');
});

// ===========================================================================
//  LA BARRE LATÉRALE : UNE SEULE PORTE POUR LE COACH
//
//  « Mes formations » et « Mes certifications » menaient au MÊME écran que
//  « Mon Academy » — même appel, même grille, à un filtre près. Trois entrées
//  pour une destination. Seules les ENTRÉES disparaissent : naviguer() accepte
//  toujours ces destinations, et le bouton « Voir mes certifications » de
//  l'accueil s'en sert encore.
// ===========================================================================

const entreesNav = (() => {
  const debut = js.indexOf('const entrees = [', js.indexOf('function rendreBarreLaterale'));
  const fin = js.indexOf('const nav = $(\'#acSideNav\')');
  assert.ok(debut > 0 && fin > debut, 'le bloc des entrées de navigation doit exister');
  return new Function('moiEval', 'moiAdmin', 'ic',
    js.slice(debut, fin) + '; return entrees.map((e) => e.cle);');
})();
const ic = new Proxy({}, { get: () => '<svg/>' });

test('un coach sans droit voit ses DEUX destinations, et pas une de plus', () => {
  // « Mes formations » et « Mes certifications » ont disparu — elles menaient
  // au même écran que « Mon Academy ». La Boîte à outils, elle, EST un autre
  // écran : un autre contenu, d'autres gestes, aucune progression. C'est une
  // destination, pas un troisième nom pour la grille des formations.
  assert.deepStrictEqual(entreesNav(false, false, ic), ['academy', 'outils'],
    'plus de « Mes formations » ni « Mes certifications » ; la Boîte à outils reste');
});

test('« Évaluer & certifier » n\'apparaît QUE pour qui a le droit d\'évaluer', () => {
  assert.deepStrictEqual(entreesNav(true, false, ic), ['academy', 'outils', 'evaluer']);
  assert.ok(!entreesNav(false, false, ic).includes('evaluer'), 'un coach simple ne la voit pas');
});

test('« Administrer » n\'apparaît QUE pour un administrateur', () => {
  assert.deepStrictEqual(entreesNav(false, true, ic), ['academy', 'outils', 'collaborateurs', 'administrer']);
  assert.deepStrictEqual(entreesNav(true, true, ic),
    ['academy', 'outils', 'evaluer', 'collaborateurs', 'administrer']);
  assert.ok(!entreesNav(true, false, ic).includes('administrer'), 'un évaluateur non admin ne la voit pas');
});

test('L\'ORDRE DE LA BARRE EST CELUI QUI A ÉTÉ DÉCIDÉ', () => {
  // Mon Academy · Boîte à outils · Évaluer & certifier · Collaborateurs · Administrer.
  assert.deepStrictEqual(entreesNav(true, true, ic),
    ['academy', 'outils', 'evaluer', 'collaborateurs', 'administrer']);
});

test('« Collaborateurs » est une DESTINATION, et réservée à l\'administrateur', () => {
  // Elle a quitté les onglets de « Administrer ». Le droit, lui, n'a pas bougé :
  // elle n'apparaît que pour un administrateur, et les routes restent gardées
  // par exigeAdmin côté serveur.
  assert.ok(entreesNav(false, true, ic).includes('collaborateurs'), 'l\'administrateur la voit');
  for (const [ev, adm] of [[false, false], [true, false]]) {
    assert.ok(!entreesNav(ev, adm, ic).includes('collaborateurs'),
      `un compte non administrateur ne doit pas la voir (eval=${ev})`);
  }
  // Et elle mène à son propre écran, pas à un onglet de l'administration.
  assert.ok(/if \(ou === 'collaborateurs'\) \{ await ouvrirCollaborateurs\(\); return; \}/.test(js),
    'la navigation doit ouvrir l\'écran dédié');
  assert.ok(/id="acCollab"/.test(html), 'l\'écran dédié doit exister');
  // Le doublon est retiré : plus d'onglet « Collaborateurs » dans Administrer.
  // La Boîte à outils, puis le droit de certifier, l'ont suivi depuis — il ne
  // reste plus aucun onglet.
  // LA BARRE D'ONGLETS EST REVENUE — avec DEUX sujets, pas cinq : les contenus,
  // et l'aperçu des évaluations pratiques. Ce que ce test protège n'a pas
  // changé : « Collaborateurs » n'y est PAS revenu.
  assert.deepStrictEqual(
    (js.match(/\{ cle: '([a-z]+)', libelle: '[^']*' \}/g) || []).length >= 2, true,
    'les onglets d\'administration doivent être déclarés');
  const onglets = js.slice(js.indexOf('const ONGLETS_ADMIN'), js.indexOf('let admOnglet'));
  assert.ok(/'contenus'/.test(onglets) && /'apercu'/.test(onglets), 'les deux onglets attendus');
  assert.ok(!/collaborateurs|outils|evaluateurs|certifications/.test(onglets),
    'aucun onglet déplacé ne doit être revenu dans Administrer');
});

test('la Boîte à outils est ouverte à TOUS ceux qui entrent dans l\'Academy', () => {
  // Elle ne dépend d'aucun droit supplémentaire : un collaborateur ordinaire y
  // accède, comme l'évaluateur et l'administrateur. Le serveur garde la même
  // porte que le catalogue (exigeEntree) — l'écran ne fait que le suivre.
  for (const [ev, adm] of [[false, false], [true, false], [false, true], [true, true]]) {
    assert.ok(entreesNav(ev, adm, ic).includes('outils'),
      `la Boîte à outils manque pour eval=${ev} admin=${adm}`);
  }
});

test('les DESTINATIONS restent, seules les entrées disparaissent', () => {
  // naviguer() sait toujours traiter ces destinations : les entrées de menu ont
  // disparu, la logique d'aiguillage n'a pas été touchée.
  assert.ok(/accueilFiltre = ou === 'certifications' \? 'certifiantes' : 'toutes'/.test(js),
    'naviguer() sait toujours traiter ces destinations');
});

test('dans une formation, c\'est « Mon Academy » qui reste l\'entrée active', () => {
  // Sans cela, plus aucune entrée ne serait surlignée depuis la suppression
  // de la clé 'formations'.
  assert.ok(!/rendreBarreLaterale\('formations'\)/.test(js),
    'aucun écran ne doit activer une entrée qui n\'existe plus');
});

// ===========================================================================
//  AUCUN TEXTE HÉRITÉ DE COACH NUTRITION DANS UNE AUTRE FORMATION
//
//  ⚠️ LE DÉFAUT QUE CES TESTS FERMENT. Trois phrases promettaient « des clients
//  dans le Boost Nutrition » à quiconque se certifiait — Cycle menstruel
//  comprise, alors qu'elle n'ouvre aucun dossier client. Le catalogue portait
//  déjà refletBoost ; il n'était lu nulle part côté écran.
// ===========================================================================

const ouvreBoostDe = (() => {
  const debut = js.indexOf('const ouvreBoost = (cle) =>');
  const fin = js.indexOf('function statutDe');
  assert.ok(debut > 0 && fin > debut, 'le garde ouvreBoost doit exister');
  return new Function('catalogue', 'cle', js.slice(debut, fin) + '; return ouvreBoost(cle);');
})();

test('ouvreBoost ne dit oui QUE pour une formation à reflet', () => {
  const cat = [{ cle: 'coach_nutrition', refletBoost: true }, { cle: 'cycle_menstruel', refletBoost: false }];
  assert.strictEqual(ouvreBoostDe(cat, 'coach_nutrition'), true);
  assert.strictEqual(ouvreBoostDe(cat, 'cycle_menstruel'), false);
  assert.strictEqual(ouvreBoostDe(cat, 'inconnue'), false, 'une clé inconnue ne promet rien');
  assert.strictEqual(ouvreBoostDe(null, 'coach_nutrition'), false, 'sans catalogue, on ne promet rien');
});

test('les trois phrases « Boost » sont toutes conditionnées', () => {
  // Aucune des trois ne doit être concaténée sans garde.
  const sansGarde = /\+\s*'<p class="ac-qcm-s">Tu peux désormais suivre des clients/;
  assert.ok(!sansGarde.test(js), 'la phrase du coach doit passer par ouvreBoost');
  const avert = js.split('Cette délivrance ouvrira immédiatement');
  assert.strictEqual(avert.length, 3, 'les deux avertissements de délivrance existent toujours');
  for (const bloc of avert.slice(0, 2)) {
    assert.ok(/ouvreBoost\(fCourante\)\s*$|ouvreBoost\(fCourante\)[\s\S]{0,80}$/.test(bloc),
      'chaque avertissement doit être précédé de son garde ouvreBoost');
  }
  assert.ok(/ouvreBoost\(c\.formation\)/.test(js), 'la carte du coach lit le drapeau de SA formation');
});

test('les consignes du cas atteignent l\'écran de l\'évaluateur, mise en forme préservée', () => {
  // Le texte est structuré en sections et en listes : sans pre-wrap, un <p>
  // écraserait ses retours à la ligne en un pavé illisible.
  assert.ok(/\.ac-eval-cas-c:not\(:empty\)\s*\{[^}]*white-space:\s*pre-wrap/.test(css),
    'le bloc des consignes doit préserver les retours à la ligne');
  // Le texte part brut et échappé ; c'est le bloc qui le met en forme.
  assert.ok(/return c && c\.consignes \? echapper\(c\.consignes\) : '';/.test(js),
    'les consignes sont échappées, jamais injectées telles quelles');
  // Et elles suivent le cas choisi.
  assert.ok(/sel\.addEventListener\('change'[\s\S]{0,220}consignesDe\(/.test(js),
    'changer de cas doit rafraîchir ses consignes');
  assert.ok(/consignesDe\(liste, choisi\)/.test(js), 'et le cas déjà retenu les affiche à l\'ouverture');
});

test('le rail « Ton parcours » a bien disparu de l\'accueil', () => {
  for (const trace of ['ac-parcours', 'ac-anneau', 'acVersCertifs', 'rendreAnneau', 'progressionGlobale', 'ac-cols']) {
    assert.ok(!js.includes(trace), `academy.js contient encore « ${trace} »`);
    assert.ok(!css.includes(trace), `academy.css contient encore « ${trace} »`);
  }
  // Et la grille des cartes reprend l'espace libéré.
  assert.ok(/\.ac-fcs \{[^}]*margin-bottom: 40px/.test(css), 'la grille doit occuper toute la largeur');
});

// ===========================================================================
//  LES QUATRE INDICATEURS SONT DES FILTRES
//
//  Le dashboard affiche quatre chiffres. Ils sont désormais cliquables et
//  filtrent la grille. LE POINT DUR N'EST PAS LE CLIC, C'EST LA COHÉRENCE :
//  une tuile qui annonce « 3 » doit en montrer trois. Le code le garantit en
//  faisant lire au compteur et au filtre le MÊME prédicat (KPIS[].garde) ;
//  ces tests le vérifient en exécutant réellement les deux.
// ===========================================================================

// On exécute le vrai code de l'écran, pas une copie : les deux blocs sont
// extraits du fichier servi au navigateur.
const SRC_KPIS = js.slice(js.indexOf('const KPIS = ['), js.indexOf('let accueilTri'));
const SRC_FILTRE = js.slice(js.indexOf('function formationsAffichees'), js.indexOf('async function ouvrirAccueil'));
// Le drapeau de la mosaïque Leader, extrait lui aussi du fichier servi : le
// filtre l'appelle, et on exécute le vrai code plutôt qu'une redite de la règle.
const SRC_MOSAIQUE = js.slice(js.indexOf('const CAT_ELITES'), js.indexOf('function formationsAffichees'));

// Un catalogue de six formations couvrant les quatre statuts.
const CATALOGUE_T = [
  { cle: 'a', libelle: 'A', certificationActive: true, categorie: 'essentiel', pourcentage: 0 },
  { cle: 'b', libelle: 'B', certificationActive: true, categorie: 'essentiel', pourcentage: 40 },
  { cle: 'c', libelle: 'C', certificationActive: true, categorie: 'expertise', pourcentage: 70 },
  { cle: 'd', libelle: 'D', certificationActive: true, categorie: 'expertise', pourcentage: 100 },
  { cle: 'e', libelle: 'E', certificationActive: true, categorie: 'expertise', pourcentage: 100 },
  { cle: 'f', libelle: 'F', certificationActive: false, categorie: 'essentiel', pourcentage: 0 },
];
const STATUT_T = {
  a: 'a_commencer', b: 'en_cours', c: 'en_cours',
  d: 'theorie', e: 'certifie', f: 'a_commencer',
};

// Le filtre tel que l'écran l'applique, pour un statut donné.
function filtrer(statut, extra) {
  const o = extra || {};
  const fn = new Function('catalogue', 'statutDe', 'accueilFiltre', 'accueilCategorie',
    'accueilStatut', 'accueilTri', 'ORDRE_STATUT',
    SRC_KPIS + SRC_MOSAIQUE + SRC_FILTRE + '; return formationsAffichees();');
  return fn(CATALOGUE_T, (f) => STATUT_T[f.cle],
    o.filtre || 'toutes', o.categorie || 'toutes', statut, o.tri || 'statut',
    ['en_cours', 'theorie', 'a_commencer', 'certifie']).map((x) => x.f.cle);
}

// Le compteur tel que la tuile l'affiche.
function compterTuiles() {
  const fn = new Function('SRC', SRC_KPIS + '; return KPIS;');
  const kpis = fn();
  const toutes = CATALOGUE_T.map((f) => ({ f, st: STATUT_T[f.cle] }));
  return kpis.map((k) => [k.cle, k.garde ? toutes.filter((x) => k.garde(x.st)).length : toutes.length]);
}

test('les quatre indicateurs filtrent le statut qu\'ils annoncent', () => {
  // « Formations disponibles » : tout, sans exception.
  assert.deepStrictEqual(filtrer('tous').sort(), ['a', 'b', 'c', 'd', 'e', 'f']);
  // « En cours » : commencées mais pas terminées.
  assert.deepStrictEqual(filtrer('en_cours').sort(), ['b', 'c']);
  // « Théorie validée » : théorie passée — la certification l'ayant exigée,
  // une formation certifiée en fait partie.
  assert.deepStrictEqual(filtrer('theorie').sort(), ['d', 'e']);
  // « Certification obtenue » : le diplôme, et lui seul.
  assert.deepStrictEqual(filtrer('certifie').sort(), ['e']);
});

test('LE CHIFFRE DE LA TUILE EST LE NOMBRE DE CARTES QU\'ELLE OUVRE', () => {
  // L'invariant du lot. Compteur et filtre lisent le même prédicat ; on le
  // vérifie en exécutant les deux et en comparant.
  for (const [cle, n] of compterTuiles()) {
    assert.strictEqual(filtrer(cle).length, n,
      `la tuile « ${cle} » annonce ${n} formation(s) et son filtre en montre ${filtrer(cle).length}`);
  }
});

test('un statut inconnu ne filtre rien plutôt que de vider la grille', () => {
  // kpiDe() se rabat sur la première tuile — « tous ». Une valeur d'état
  // abîmée doit donner le catalogue entier, jamais un écran vide inexplicable.
  assert.deepStrictEqual(filtrer('nimportequoi').sort(), ['a', 'b', 'c', 'd', 'e', 'f']);
});

test('le filtre par statut est ORTHOGONAL aux deux autres', () => {
  // Choisir un statut ne fait sortir ni de « Mes certifications », ni de la
  // catégorie ouverte : les trois filtres se cumulent.
  assert.deepStrictEqual(filtrer('en_cours', { categorie: 'expertise' }), ['c']);
  assert.deepStrictEqual(filtrer('tous', { categorie: 'essentiel' }).sort(), ['a', 'b', 'f']);
  assert.deepStrictEqual(filtrer('tous', { filtre: 'certifiantes' }).sort(), ['a', 'b', 'c', 'd', 'e'],
    'F n\'est pas certifiante');
  assert.deepStrictEqual(filtrer('certifie', { filtre: 'certifiantes', categorie: 'expertise' }), ['e']);
});

test('les indicateurs sont des BOUTONS, atteignables au clavier', () => {
  const bloc = js.slice(js.indexOf('function rendreAccueil'), js.indexOf('function etapesDe'));
  assert.ok(/<button type="button" class="ac-kpi/.test(bloc), 'une tuile doit être un bouton, pas un div');
  assert.ok(/aria-pressed="/.test(bloc), 'l\'état actif doit être annoncé aux lecteurs d\'écran');
  assert.ok(/data-kpi="/.test(bloc), 'chaque tuile porte le statut qu\'elle applique');
  // Les libellés et les compteurs des TUILES se dérivent de KPIS : aucun
  // statut écrit à la main dans le bandeau. On ne regarde que ce bandeau —
  // ailleurs, les cartes comparent légitimement leur propre statut.
  const bandeau = bloc.slice(bloc.indexOf('<nav class="ac-kpis"'), bloc.indexOf("'</nav>'"));
  assert.ok(bandeau.length > 200, 'le bandeau des indicateurs doit être délimité');
  assert.ok(/KPIS\.map/.test(bandeau), 'les tuiles doivent se dériver de KPIS');
  for (const st of ['en_cours', 'theorie', 'certifie']) {
    assert.ok(!new RegExp("'" + st + "'").test(bandeau),
      `« ${st} » est écrit en dur dans le bandeau : il doit venir de KPIS`);
  }
  // Et aucun libellé de tuile n'y est écrit non plus.
  for (const mot of ['En cours', 'Théorie validée', 'Certification obtenue']) {
    assert.ok(!bandeau.includes(mot), `« ${mot} » est écrit en dur dans le bandeau`);
  }
});

test('l\'état actif se voit, et l\'icône garde sa couleur de famille', () => {
  assert.ok(/\.ac-kpi\.on\s*\{/.test(css), 'l\'indicateur actif doit avoir un style');
  assert.ok(/\.ac-kpi:focus-visible/.test(css), 'et un anneau de focus au clavier');
  assert.ok(/\.ac-kpi\s*\{[^}]*cursor:\s*pointer/.test(css), 'la tuile doit se signaler cliquable');
  // La pastille colorée distingue les quatre familles : la repeindre en bleu
  // à l'état actif les rendrait indiscernables.
  assert.ok(!/\.ac-kpi\.on\s+\.ac-kpi-ic/.test(css), 'l\'état actif ne doit pas repeindre l\'icône');
});

test('le clic descend vers la grille, sans remonter en haut au passage', () => {
  const bloc = js.slice(js.indexOf("document.querySelectorAll('#acAccueil [data-kpi]')"),
    js.indexOf('const tri = $(\'#acTri\')'));
  assert.ok(bloc.length > 200, 'le geste doit être délimité');
  assert.ok(/sansRemonter: true/.test(bloc), 'le re-rendu ne doit pas ramener en haut de page');
  assert.ok(/scrollIntoView/.test(bloc) && /smooth/.test(bloc), 'le défilement doit être fluide');
  assert.ok(/prefers-reduced-motion/.test(bloc), 'et respecter « animations réduites »');
  // Le retour à la vue complète : « tous », ou un second clic sur la tuile active.
  assert.ok(/cle === 'tous' \|\| cle === accueilStatut/.test(bloc),
    'un nouveau clic doit ramener à la vue complète');
  // La cible est relue APRÈS le rendu — innerHTML a remplacé le DOM.
  assert.ok(bloc.indexOf('rendreAccueil(') < bloc.indexOf("$('#acGrilleH')"),
    'la cible du défilement doit être relue après le re-rendu');
  assert.ok(/id="acGrilleH"/.test(js), 'la grille doit porter une ancre');
});

// ===========================================================================
//  LA MOSAÏQUE E.L.I.T.E.S — la famille Leader s'affiche en 3 × 2.
//
//  CE QUE CETTE SUITE PROUVE :
//
//   1. LA POSITION PORTE DU SENS. Les six incontournables se lisent
//      E | L | I / T | E | S : leur ordre est celui du catalogue, et AUCUN
//      tri ne le déplace — sans quoi l'acronyme ne tiendrait pas.
//   2. LA MOSAÏQUE NE DÉBORDE PAS. Essentiel et Expertise gardent la grille
//      générique et leur tri.
//   3. RIEN D'AUTRE NE CHANGE : mêmes cartes, mêmes filtres, une classe de
//      plus sur la grille.
// ===========================================================================

// Six formations Leader, dans l'ordre où le serveur les sert (`ordre`, puis
// clé) — et des statuts volontairement mélangés : c'est ce qui ferait bouger
// les cartes si le tri l'emportait.
const ELITES_T = [
  { cle: 'engagement', libelle: 'Engagement', certificationActive: true, categorie: 'management', pourcentage: 100 },
  { cle: 'loyal', libelle: 'Loyal', certificationActive: true, categorie: 'management', pourcentage: 0 },
  { cle: 'infos', libelle: 'Infos', certificationActive: true, categorie: 'management', pourcentage: 40 },
  { cle: 'team', libelle: 'Team', certificationActive: true, categorie: 'management', pourcentage: 0 },
  { cle: 'eclat', libelle: 'Éclat', certificationActive: true, categorie: 'management', pourcentage: 70 },
  { cle: 'succes', libelle: 'Succès', certificationActive: true, categorie: 'management', pourcentage: 0 },
];
const ELITES_ST = {
  engagement: 'certifie', loyal: 'a_commencer', infos: 'en_cours',
  team: 'a_commencer', eclat: 'en_cours', succes: 'a_commencer',
};
const ORDRE_ELITES = ['engagement', 'loyal', 'infos', 'team', 'eclat', 'succes'];

function afficherElites(categorie, tri) {
  const fn = new Function('catalogue', 'statutDe', 'accueilFiltre', 'accueilCategorie',
    'accueilStatut', 'accueilTri', 'ORDRE_STATUT',
    SRC_KPIS + SRC_MOSAIQUE + SRC_FILTRE + '; return formationsAffichees();');
  return fn(ELITES_T, (f) => ELITES_ST[f.cle], 'toutes', categorie, 'tous', tri,
    ['en_cours', 'theorie', 'a_commencer', 'certifie']).map((x) => x.f.cle);
}

test('LA MOSAÏQUE TIENT SON ORDRE E-L-I / T-E-S, quel que soit le tri', () => {
  for (const tri of ['statut', 'progression', 'nom']) {
    assert.deepStrictEqual(afficherElites('management', tri), ORDRE_ELITES,
      `le tri « ${tri} » a déplacé une carte de la mosaïque`);
  }
});

test('HORS de la famille Leader, le tri reprend ses droits', () => {
  // Les mêmes six formations, vues depuis « toutes » : le tri par statut les
  // réordonne, et c'est le comportement d'avant, inchangé.
  const parStatut = afficherElites('toutes', 'statut');
  assert.notDeepStrictEqual(parStatut, ORDRE_ELITES,
    'sans le filtre Leader, le tri par statut doit continuer de réordonner');
  assert.deepStrictEqual([...parStatut].sort(), [...ORDRE_ELITES].sort(),
    'le tri ne doit ni perdre ni ajouter de formation');
  // Et le tri par nom reste le tri par nom.
  assert.deepStrictEqual(afficherElites('toutes', 'nom'),
    ['Éclat', 'Engagement', 'Infos', 'Loyal', 'Succès', 'Team']
      .map((l) => ELITES_T.find((f) => f.libelle === l).cle));
});

test('LA MOSAÏQUE EST UNE CLASSE, PAS UN SECOND RENDU DE CARTE', () => {
  const bloc = js.slice(js.indexOf('function rendreAccueil'), js.indexOf('function etapesDe'));
  // Une seule grille, une classe conditionnelle : les cartes rendues sont les
  // mêmes (image, statut, titre, description, progression, bouton).
  assert.ok(/'<div class="ac-fcs' \+ \(mosaiqueElites\(\) \? ' ac-fcs-elites' : ''\)/.test(bloc),
    'la grille doit porter la classe de mosaïque, sans dupliquer le rendu');
  assert.strictEqual((bloc.match(/liste\.map\(carte\)/g) || []).length, 1,
    'il ne doit exister qu\'UN rendu de cartes');
  // Le tri s'efface là où il n'aurait aucun effet.
  assert.ok(/mosaiqueElites\(\) \? '' :\s*'<label class="ac-tri">/.test(bloc),
    'le sélecteur de tri doit disparaître sur la mosaïque');
});

test('LA MOSAÏQUE VISE LA CLÉ TECHNIQUE, jamais le libellé affiché', () => {
  const bloc = js.slice(js.indexOf('const CAT_ELITES'), js.indexOf('function formationsAffichees'));
  assert.ok(/CAT_ELITES = 'management'/.test(bloc),
    'la mosaïque doit se brancher sur la clé stockée, que « Leader » ne fait qu\'afficher');
  assert.ok(!/Leader/.test(bloc.replace(/\/\/.*$/gm, '')),
    'le libellé ne doit pas servir de test : le renommer casserait la mosaïque');
  const { CATEGORIES } = require('../lib/academyFormations');
  assert.ok(CATEGORIES.includes('management'),
    'la clé de la mosaïque doit être une catégorie que le serveur accepte');
});

test('LES TROIS PALIERS DE LA MOSAÏQUE : 3, puis 2, puis 1 colonne', () => {
  const i = css.indexOf('.ac-fcs.ac-fcs-elites');
  assert.ok(i > 0, 'la mosaïque doit exister en CSS');
  const bloc = css.slice(i);
  assert.ok(/\.ac-fcs\.ac-fcs-elites \{ grid-template-columns: repeat\(3, 1fr\); \}/.test(bloc),
    'trois colonnes fixes sur desktop');
  assert.ok(/max-width: 1040px\).*repeat\(2, 1fr\)/s.test(bloc), 'deux colonnes en tablette');
  assert.ok(/max-width: 620px\).*\.ac-fcs\.ac-fcs-elites \{ grid-template-columns: 1fr/s.test(bloc),
    'une colonne en mobile');
  // Le sélecteur DOUBLE est ce qui empêche la règle mobile de `.ac-fcs` de
  // ramener la mosaïque à une colonne sur tous les écrans.
  assert.ok(!/^\.ac-fcs-elites \{/m.test(bloc),
    'la mosaïque doit rester en sélecteur double, sinon la règle mobile de .ac-fcs l\'emporte');
});
