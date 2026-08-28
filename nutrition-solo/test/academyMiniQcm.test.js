'use strict';
// ============================================================================
//  MY COACH ACADEMY — les mini-QCM de fin de module.
//
//  CINQ PROPRIÉTÉS, ET LA PREMIÈRE EST LA RAISON D'ÊTRE DE CE FICHIER :
//
//   1. UN MINI-QCM RÉUSSI NE VALIDE PAS LA THÉORIE. C'est la propriété qui se
//      casse le plus silencieusement : il suffirait qu'UNE lecture d'état
//      oublie de filtrer sur la portée pour qu'un exercice de fin de module
//      certifie la théorie d'un collaborateur. Rien à l'écran ne le dirait.
//      On l'attaque donc des deux côtés : l'état du QCM final, et le dossier de
//      certification lui-même.
//
//   2. LE VERROU EST TENU PAR LE SERVEUR. Un module fermé refuse ses contenus
//      en lecture, à l'ouverture et à la validation — pas seulement à l'écran.
//      Sans cela, on traverse la formation au clavier sans passer un mini.
//
//   3. LES DEUX BANQUES NE SE MÉLANGENT JAMAIS. Un mini ne tire que des
//      questions « mini » de SON module ; le QCM final ne tire que des
//      questions « finale ». C'est ce qui permet de donner le corrigé d'un mini
//      sans distribuer celui de la certification.
//
//   4. LE CORRIGÉ NE SORT QUE POUR UN MINI RENDU, et ne révèle la bonne réponse
//      que sur les questions MANQUÉES.
//
//   5. ON NE PUBLIE PAS UN MINI INFRANCHISSABLE. Un module dont la banque mini
//      est plus courte que son tirage bloque la publication — parce qu'il
//      fermerait tout ce qui vient après lui.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');

const DB = path.join(os.tmpdir(), `nutri-academy-mini-test-${process.pid}.sqlite`);
process.env.NUTRITION_DB = DB;
process.env.ADMIN_EMAIL = 'patron@exemple.fr';

const app = require('../server');
let srv, base;

const ADMIN = 'patron@exemple.fr';
const THEO = 'theo.mini@exemple.fr';     // le parcours principal
const NORA = 'nora.mini@exemple.fr';     // le verrou attaqué au clavier
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
}

const dbq = () => require('../lib/db').getDb();

// Le corrigé lu EN BASE, comme dans le lot 2 : aucune route ne le donne avant
// d'avoir rendu la copie, et c'est précisément ce qu'on vérifie.
const corrige = (tentativeId) => new Map(
  dbq().prepare('SELECT id, correct_json AS c FROM academy_tentative_questions WHERE tentative_id = ?')
    .all(tentativeId).map((r) => [r.id, JSON.parse(r.c)]));

const parcours = async (email) =>
  (await api('GET', '/api/academy/formation', null, jetons[email])).body.formation;

const etatQcm = async (email) => (await api('GET', '/api/academy/qcm', null, jetons[email])).body.qcm;

// Cinq questions de mini-QCM pour un module. Volontairement triviales : ce
// fichier éprouve le MÉCANISME, pas la pédagogie.
async function poserMini(moduleId, n) {
  for (let i = 1; i <= n; i++) {
    const r = await api('POST', '/api/academy/admin/questions', {
      moduleId, usage: 'mini', enonce: `Mini module ${moduleId} — question ${i} ?`,
      choix: [
        { texte: `Bonne ${i}`, correct: true },
        { texte: `Mauvaise ${i}a`, correct: false },
        { texte: `Mauvaise ${i}b`, correct: false },
      ],
    }, jetons[ADMIN]);
    assert.strictEqual(r.status, 200, 'création de question mini refusée : ' + r.txt);
  }
}

async function demarrerMini(email, moduleId) {
  const r = await api('POST', '/api/academy/qcm/tentatives', { moduleId }, jetons[email]);
  return r;
}

// Répond à toute une tentative. `juste` décide, question par question, si on
// donne la bonne réponse ou non.
async function repondre(email, t, juste) {
  const k = corrige(t.id);
  for (let i = 0; i < t.questions.length; i++) {
    const q = t.questions[i];
    const bons = k.get(q.id);
    const mauvais = q.choix.map((c) => c.id).filter((id) => !bons.includes(id));
    const choix = juste({ i, bons, mauvais }) ? bons : [mauvais[0]];
    await api('PUT', `/api/academy/qcm/tentatives/${t.id}/reponses/${q.id}`, { choix }, jetons[email]);
  }
  return api('POST', `/api/academy/qcm/tentatives/${t.id}/terminer`, {}, jetons[email]);
}

// Termine tous les contenus d'un module (et rien d'autre).
async function terminerContenus(email, moduleId) {
  const p = await parcours(email);
  const m = p.modules.find((x) => x.id === moduleId);
  for (const c of m.contenus) {
    await api('POST', `/api/academy/contenus/${c.id}/terminer`, {}, jetons[email]);
  }
}

let M1, M2;

test.before(async () => {
  srv = app.listen(0);
  await new Promise((r) => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;

  for (const [email, pin] of [[ADMIN, '7777'], [THEO, '4004'], [NORA, '5005']]) {
    await connecter(email, pin);
  }
  for (const email of [THEO, NORA]) {
    await api('POST', '/api/boost/admin/collaborateurs', { email, role: 'collaborateur' }, jetons[ADMIN]);
    await connecter(email, email === THEO ? '4004' : '5005');
  }

  const p = await parcours(THEO);
  M1 = p.modules[0].id;
  M2 = p.modules[1].id;
  await poserMini(M1, 5);
  await poserMini(M2, 5);
});

test.after(() => { if (srv) srv.close(); });

// ===========================================================================
//  1. UN MINI RÉUSSI NE VALIDE PAS LA THÉORIE
// ===========================================================================

test('un mini-QCM réussi n\'écrit rien dans le dossier de certification', async () => {
  await terminerContenus(THEO, M1);

  const avant = dbq().prepare('SELECT * FROM boost_certifications WHERE email = ?').get(THEO) || null;

  const t = (await demarrerMini(THEO, M1)).body.tentative;
  const fin = await repondre(THEO, t, () => true);
  assert.strictEqual(fin.body.tentative.resultat.reussie, true, 'le mini aurait dû être réussi');

  const apres = dbq().prepare('SELECT * FROM boost_certifications WHERE email = ?').get(THEO) || null;
  assert.deepStrictEqual(apres, avant, 'un mini-QCM a touché au dossier de certification');

  const etat = await etatQcm(THEO);
  assert.strictEqual(etat.theorieValidee, false, 'un mini-QCM a validé la théorie');
  assert.strictEqual(etat.scoreValide, null, 'un mini-QCM a posé un score de théorie');
});

test('un mini réussi n\'apparaît ni dans l\'historique ni dans la dernière tentative du QCM final', async () => {
  const etat = await etatQcm(THEO);
  assert.strictEqual(etat.historique.length, 0, 'une tentative de mini est comptée dans l\'historique du QCM final');
  assert.strictEqual(etat.derniere, null, 'une tentative de mini est prise pour la dernière tentative finale');
  assert.strictEqual(etat.enCours, null, 'une tentative de mini est prise pour une tentative finale en cours');
});

// ===========================================================================
//  2. LE VERROU EST TENU PAR LE SERVEUR
// ===========================================================================

test('tant que le mini du module précédent n\'est pas réussi, le module suivant est fermé', async () => {
  await terminerContenus(NORA, M1);
  const p = await parcours(NORA);
  const m2 = p.modules.find((x) => x.id === M2);
  assert.strictEqual(m2.mini.deverrouille, false, 'le module 2 est ouvert sans mini réussi');

  // Attaque au clavier : les trois portes doivent refuser.
  const cible = m2.contenus[0].id;
  for (const [m, route] of [
    ['GET', `/api/academy/contenus/${cible}`],
    ['POST', `/api/academy/contenus/${cible}/ouvrir`],
    ['POST', `/api/academy/contenus/${cible}/terminer`],
  ]) {
    const r = await api(m, route, m === 'GET' ? null : {}, jetons[NORA]);
    assert.strictEqual(r.status, 409, `${m} ${route} a laissé passer un module verrouillé`);
    assert.strictEqual(r.body.moduleVerrouille, true);
  }

  // Et le mini du module fermé ne s'ouvre pas non plus.
  const r = await demarrerMini(NORA, M2);
  assert.strictEqual(r.status, 409, 'le mini d\'un module verrouillé s\'est ouvert');
});

test('un mini échoué ne déverrouille pas, un mini réussi déverrouille', async () => {
  const t = (await demarrerMini(NORA, M1)).body.tentative;
  // 1 bonne sur 5 = 20 %, sous le seuil de 80 %.
  const fin = await repondre(NORA, t, ({ i }) => i === 0);
  assert.strictEqual(fin.body.tentative.resultat.reussie, false, 'ce mini aurait dû échouer');

  let p = await parcours(NORA);
  assert.strictEqual(p.modules.find((x) => x.id === M2).mini.deverrouille, false,
    'un mini échoué a déverrouillé le module suivant');

  // Tentatives illimitées : on recommence, et cette fois on réussit.
  const t2 = (await demarrerMini(NORA, M1)).body.tentative;
  await repondre(NORA, t2, () => true);

  p = await parcours(NORA);
  assert.strictEqual(p.modules.find((x) => x.id === M2).mini.deverrouille, true,
    'un mini réussi n\'a pas déverrouillé le module suivant');

  const ok = await api('POST', `/api/academy/contenus/${p.modules.find((x) => x.id === M2).contenus[0].id}/ouvrir`,
    {}, jetons[NORA]);
  assert.strictEqual(ok.status, 200, 'le module déverrouillé refuse encore ses contenus');
});

test('le QCM final reste fermé tant qu\'un mini n\'est pas franchi', async () => {
  // THEO a fini le module 1 et son mini, mais pas la suite.
  const r = await api('POST', '/api/academy/qcm/tentatives', {}, jetons[THEO]);
  assert.strictEqual(r.status, 409, 'le QCM final s\'est ouvert sans le parcours complet');
});

// ===========================================================================
//  3. LES DEUX BANQUES NE SE MÉLANGENT PAS
// ===========================================================================

test('un mini ne tire que des questions « mini » de son propre module', async () => {
  const t = (await demarrerMini(THEO, M1)).body.tentative;
  const enonces = t.questions.map((q) => q.enonce);
  assert.strictEqual(enonces.length, 5);
  for (const e of enonces) {
    assert.ok(e.startsWith(`Mini module ${M1} —`), 'une question étrangère est entrée dans le mini : ' + e);
  }
  await api('POST', `/api/academy/qcm/tentatives/${t.id}/terminer`, {}, jetons[THEO]);
});

test('le QCM final ne tire aucune question de mini-QCM', async () => {
  // On ouvre le parcours complet pour NORA, puis on lit le tirage final.
  const p = await parcours(NORA);
  for (const m of p.modules) {
    await terminerContenus(NORA, m.id);
    const mini = (await parcours(NORA)).modules.find((x) => x.id === m.id).mini;
    if (mini.aBanque && !mini.reussi) {
      const t = (await demarrerMini(NORA, m.id)).body.tentative;
      await repondre(NORA, t, () => true);
    }
  }
  const r = await api('POST', '/api/academy/qcm/tentatives', {}, jetons[NORA]);
  assert.strictEqual(r.status, 201, 'le QCM final ne s\'ouvre pas alors que tout est franchi : ' + r.txt);
  for (const q of r.body.tentative.questions) {
    assert.ok(!/^Mini module /.test(q.enonce), 'une question de mini est entrée dans le QCM final : ' + q.enonce);
  }
});

// ===========================================================================
//  4. LE CORRIGÉ
// ===========================================================================

test('le corrigé n\'existe pas tant que le mini n\'est pas rendu', async () => {
  await terminerContenus(THEO, M1);
  const t = (await demarrerMini(THEO, M1)).body.tentative;
  assert.strictEqual(t.corrige, undefined, 'le corrigé sort d\'une tentative en cours');

  const lu = await api('GET', `/api/academy/qcm/tentatives/${t.id}`, null, jetons[THEO]);
  assert.ok(!/"corrige"/.test(lu.txt), 'le corrigé sort d\'une tentative de mini en cours');
  await api('POST', `/api/academy/qcm/tentatives/${t.id}/terminer`, {}, jetons[THEO]);
});

test('le corrigé d\'un mini rendu ne révèle la bonne réponse que sur les questions manquées', async () => {
  const t = (await demarrerMini(THEO, M1)).body.tentative;
  const fin = await repondre(THEO, t, ({ i }) => i % 2 === 0);   // une sur deux
  const c = fin.body.tentative.corrige;
  assert.ok(Array.isArray(c) && c.length === 5, 'le corrigé du mini est absent');

  for (const q of c) {
    if (q.correcte) {
      assert.strictEqual(q.bonnes, null, 'la bonne réponse est révélée sur une question déjà réussie');
    } else {
      assert.ok(Array.isArray(q.bonnes) && q.bonnes.length >= 1, 'la bonne réponse manque sur une question ratée');
    }
  }
  assert.ok(c.some((q) => q.correcte), 'aucune question réussie : le test ne prouve rien');
  assert.ok(c.some((q) => !q.correcte), 'aucune question ratée : le test ne prouve rien');
});

test('le corrigé ne sort JAMAIS d\'une tentative de QCM final', async () => {
  const t = dbq().prepare('SELECT id FROM academy_tentatives WHERE email = ? AND portee = ? ORDER BY id DESC LIMIT 1')
    .get(NORA, 'finale');
  assert.ok(t, 'aucune tentative finale : le test ne prouve rien');
  const r = await api('GET', `/api/academy/qcm/tentatives/${t.id}`, null, jetons[NORA]);
  assert.ok(!/corrige/i.test(r.txt), 'le corrigé fuit sur une tentative de QCM final');
});

// ===========================================================================
//  5. LA PUBLICATION
// ===========================================================================

test('un module dont la banque mini est trop courte bloque la publication', async () => {
  const avant = (await api('GET', '/api/academy/admin/arbre', null, jetons[ADMIN])).body;
  assert.strictEqual(avant.verification.blocages.length, 0, 'blocage inattendu avant le test : '
    + JSON.stringify(avant.verification.blocages));

  // On archive une question du mini du module 1 : il n'en reste que 4 pour 5 tirées.
  const qs = avant.questions.filter((q) => q.usage === 'mini' && q.moduleId === M1);
  await api('POST', '/api/academy/admin/archiver', { type: 'question', id: qs[0].id, actif: false }, jetons[ADMIN]);

  const apres = (await api('GET', '/api/academy/admin/arbre', null, jetons[ADMIN])).body;
  assert.ok(apres.verification.blocages.some((b) => /mini-QCM du module/.test(b)),
    'une banque mini trop courte ne bloque pas la publication : ' + JSON.stringify(apres.verification.blocages));
  assert.strictEqual(apres.verification.publiable, false);

  // On la restaure : le blocage disparaît.
  await api('POST', '/api/academy/admin/archiver', { type: 'question', id: qs[0].id, actif: true }, jetons[ADMIN]);
  const fin = (await api('GET', '/api/academy/admin/arbre', null, jetons[ADMIN])).body;
  assert.strictEqual(fin.verification.blocages.length, 0, 'le blocage persiste après restauration');
});

test('un module SANS aucune question mini ne bloque pas : c\'est le module d\'introduction', async () => {
  const arbre = (await api('GET', '/api/academy/admin/arbre', null, jetons[ADMIN])).body;
  // Un module actif de plus, sans la moindre question mini.
  const r = await api('POST', '/api/academy/admin/modules', { titre: 'Module d\'introduction' }, jetons[ADMIN]);
  assert.strictEqual(r.status, 200);
  const apres = (await api('GET', '/api/academy/admin/arbre', null, jetons[ADMIN])).body;
  assert.ok(!apres.verification.blocages.some((b) => /mini-QCM du module/.test(b)),
    'un module sans mini est pris pour un mini infranchissable');
  assert.ok(apres.modules.length > arbre.modules.length);
});

// ===========================================================================
//  6. LA SAISIE
// ===========================================================================

test('une question de mini sans module est refusée à la saisie', async () => {
  const r = await api('POST', '/api/academy/admin/questions', {
    usage: 'mini', enonce: 'Mini sans module ?',
    choix: [{ texte: 'Oui', correct: true }, { texte: 'Non', correct: false }],
  }, jetons[ADMIN]);
  assert.strictEqual(r.status, 400, 'une question de mini sans module a été acceptée');
  assert.ok(/rattachée à un module/.test(r.body.error));
});

test('un usage inconnu est refusé', async () => {
  const r = await api('POST', '/api/academy/admin/questions', {
    moduleId: M1, usage: 'bidon', enonce: 'Usage inconnu ?',
    choix: [{ texte: 'Oui', correct: true }, { texte: 'Non', correct: false }],
  }, jetons[ADMIN]);
  assert.strictEqual(r.status, 400, 'un usage inconnu a été accepté');
});

test('une question saisie sans usage rejoint la banque finale', async () => {
  const r = await api('POST', '/api/academy/admin/questions', {
    enonce: 'Sans usage précisé ?',
    choix: [{ texte: 'Oui', correct: true }, { texte: 'Non', correct: false }],
  }, jetons[ADMIN]);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.question.usage, 'finale', 'le défaut d\'usage n\'est pas « finale »');
});

// ===========================================================================
//  7. LA MIGRATION D'UNE BASE EXISTANTE
//
//  CE TEST EXISTE À CAUSE D'UN BUG RÉEL, ET IL EST LE SEUL À POUVOIR LE VOIR.
//  Toutes les autres suites partent d'une base vide : le CREATE TABLE y pose
//  déjà les nouvelles colonnes, donc un index qui les cite passe. Sur une base
//  DÉJÀ EN SERVICE, le CREATE TABLE IF NOT EXISTS ne fait rien — l'index
//  s'exécute avant l'ALTER et tombe sur « no such column ». L'Academy entière
//  refusait alors de démarrer.
// ===========================================================================

test('une base d\'avant les mini-QCM se migre sans erreur', () => {
  const Database = require('better-sqlite3');
  const os2 = require('os');
  const fichier = path.join(os2.tmpdir(), `nutri-migration-test-${process.pid}.sqlite`);
  require('fs').rmSync(fichier, { force: true });

  // Le schéma TEL QU'IL ÉTAIT avant ce lot : ni usage, ni portee, ni module_id.
  const d = new Database(fichier);
  d.exec(`
    CREATE TABLE users (email TEXT PRIMARY KEY, prenom TEXT NOT NULL DEFAULT '', cree_le TEXT NOT NULL);
    CREATE TABLE academy_modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT, formation TEXT NOT NULL DEFAULT 'coach_nutrition',
      titre TEXT NOT NULL, description TEXT, ordre INTEGER NOT NULL DEFAULT 0,
      actif INTEGER NOT NULL DEFAULT 1, cle TEXT UNIQUE, cree_le TEXT NOT NULL, maj_le TEXT NOT NULL);
    CREATE TABLE academy_contenus (
      id INTEGER PRIMARY KEY AUTOINCREMENT, module_id INTEGER NOT NULL REFERENCES academy_modules(id) ON DELETE CASCADE,
      type TEXT NOT NULL DEFAULT 'video', titre TEXT NOT NULL, description TEXT, youtube_id TEXT, texte TEXT,
      duree_min INTEGER, ordre INTEGER NOT NULL DEFAULT 0, actif INTEGER NOT NULL DEFAULT 1,
      cle TEXT UNIQUE, cree_le TEXT NOT NULL, maj_le TEXT NOT NULL);
    CREATE TABLE academy_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, formation TEXT NOT NULL DEFAULT 'coach_nutrition',
      module_id INTEGER REFERENCES academy_modules(id) ON DELETE SET NULL, enonce TEXT NOT NULL,
      actif INTEGER NOT NULL DEFAULT 1, ordre INTEGER NOT NULL DEFAULT 0, cle TEXT UNIQUE,
      cree_le TEXT NOT NULL, maj_le TEXT NOT NULL);
    CREATE TABLE academy_tentatives (
      id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, formation TEXT NOT NULL DEFAULT 'coach_nutrition',
      statut TEXT NOT NULL DEFAULT 'en_cours', nb_questions INTEGER NOT NULL, seuil_pct INTEGER NOT NULL,
      ouverte_le TEXT NOT NULL, soumise_le TEXT, score_pct INTEGER, bonnes INTEGER, reussie INTEGER);
  `);
  const now = new Date().toISOString();
  d.prepare('INSERT INTO academy_questions (enonce, cle, cree_le, maj_le) VALUES (?,?,?,?)')
    .run('Une question d\'avant la migration ?', 'ancienne-q1', now, now);
  d.prepare(`INSERT INTO academy_tentatives (email, statut, nb_questions, seuil_pct, ouverte_le, soumise_le, score_pct, bonnes, reussie)
             VALUES ('vieux@exemple.fr','soumise',5,80,?,?,100,5,1)`).run(now, now);
  d.close();

  // On rejoue la migration sur cette base-là, avec les vrais moteurs.
  const { createAcademyFormations } = require('../lib/academyFormations');
  const { createAcademy } = require('../lib/academy');
  const { createAcademyQcm } = require('../lib/academyQcm');
  const { createBoost } = require('../lib/boost');
  const base = new Database(fichier);
  const deps = { getDb: () => base, nowIso: () => new Date().toISOString() };
  const boost = createBoost(deps);
  const formations = createAcademyFormations(deps);
  const academy = createAcademy({ ...deps, boost, formations });
  const qcm = createAcademyQcm({ ...deps, boost, academy, formations });

  assert.doesNotThrow(() => { formations.assurerSchema(); academy.assurerSchema(); qcm.assurerSchema(); },
    'la migration d\'une base existante échoue');

  // L'existant a pris le bon défaut, sans qu'aucune ligne soit réécrite.
  assert.strictEqual(
    base.prepare('SELECT usage FROM academy_questions WHERE cle = ?').get('ancienne-q1').usage, 'finale',
    'une question d\'avant la migration n\'est pas dans la banque finale');
  assert.strictEqual(
    base.prepare('SELECT portee FROM academy_tentatives WHERE email = ?').get('vieux@exemple.fr').portee, 'finale',
    'une tentative d\'avant la migration n\'est pas de portée finale');
  base.close();
  require('fs').rmSync(fichier, { force: true });
});

// ===========================================================================
//  8. LA CHAÎNE COMPLÈTE DE FIN DE MODULE
//
//  CE BLOC EXISTE À CAUSE D'UN BUG TROUVÉ EN RECETTE RÉELLE, et il vise sa
//  cause exacte plutôt que son symptôme.
//
//  Le symptôme : mini-QCM réussi au seuil, et pourtant impossible de poursuivre
//  vers le module suivant.
//
//  La cause : `academy.ouvrirContenu` / `terminerContenu` renvoient l'arbre de
//  progression BRUT — le moteur de progression ignore les mini-QCM. L'écran
//  recevait donc, dès le premier « Terminer », un parcours sans `mini` : plus
//  de verrou, plus de mini, et un enchaînement qui repartait vers le premier
//  contenu du module suivant, fermé. Le serveur refusait, l'écran ne savait
//  dire que « Contenu introuvable ».
//
//  On éprouve les deux bouts : la charge utile des routes de contenu, et la
//  chaîne de bout en bout au seuil EXACT (4/5 = 80 %).
// ===========================================================================

test('les routes de contenu renvoient le parcours ENRICHI, verrou et mini compris', async () => {
  const p = await parcours(THEO);
  const premier = p.modules[0].contenus[0].id;

  for (const route of [`/api/academy/contenus/${premier}/ouvrir`, `/api/academy/contenus/${premier}/terminer`]) {
    const r = await api('POST', route, {}, jetons[THEO]);
    assert.strictEqual(r.status, 200, route + ' a échoué');
    const f = r.body.formation;
    assert.ok(f && Array.isArray(f.modules), route + ' ne renvoie pas de parcours');
    for (const m of f.modules) {
      assert.ok(m.mini, `${route} : le module « ${m.titre} » revient sans son état de mini-QCM`);
      assert.strictEqual(typeof m.mini.deverrouille, 'boolean',
        `${route} : le verrou du module « ${m.titre} » n'est pas renseigné`);
    }
  }
});

test('fin du module N → mini réussi au seuil → module N+1 accessible → 1re vidéo ouvrable', async () => {
  const IRIS = 'iris.mini@exemple.fr';
  await connecter(IRIS, '6006');
  await api('POST', '/api/boost/admin/collaborateurs', { email: IRIS, role: 'collaborateur' }, jetons[ADMIN]);
  await connecter(IRIS, '6006');

  // 1. Le module suivant est bien fermé au départ.
  let p = await parcours(IRIS);
  const m1 = p.modules.find((m) => m.id === M1);
  const m2 = p.modules.find((m) => m.id === M2);
  assert.strictEqual(m2.mini.deverrouille, false, 'le module 2 est ouvert avant même le module 1');

  // 2. On termine les contenus du module N.
  for (const c of m1.contenus) {
    const r = await api('POST', `/api/academy/contenus/${c.id}/terminer`, {}, jetons[IRIS]);
    assert.strictEqual(r.status, 200);
  }
  p = await parcours(IRIS);
  assert.strictEqual(p.modules.find((m) => m.id === M1).mini.disponible, true,
    'le mini ne s\'ouvre pas alors que les contenus du module sont terminés');

  // 3. Le mini, réussi AU SEUIL EXACT : 4 bonnes sur 5 = 80 %, seuil 80 %.
  const t = (await demarrerMini(IRIS, M1)).body.tentative;
  assert.strictEqual(t.questions.length, 5);
  const fin = await repondre(IRIS, t, ({ i }) => i < 4);   // les 4 premières justes
  const res = fin.body.tentative.resultat;
  assert.strictEqual(res.scorePct, 80, 'le score attendu au seuil est 80 %');
  assert.strictEqual(res.seuilPct, 80);
  assert.strictEqual(res.reussie, true, 'un score ÉGAL au seuil doit être une réussite');

  // 4. La réponse de clôture porte DÉJÀ le parcours déverrouillé : aucun
  //    rechargement n'est nécessaire pour poursuivre.
  const parcoursRendu = fin.body.parcours;
  assert.ok(parcoursRendu, 'la clôture d\'un mini ne renvoie pas le parcours');
  assert.strictEqual(parcoursRendu.modules.find((m) => m.id === M2).mini.deverrouille, true,
    'le module suivant n\'est pas déverrouillé dans la réponse de clôture : un rafraîchissement serait nécessaire');

  // 5. Et il l'est réellement côté serveur, pas seulement dans cette réponse.
  p = await parcours(IRIS);
  const m2Apres = p.modules.find((m) => m.id === M2);
  assert.strictEqual(m2Apres.mini.deverrouille, true, 'le module suivant reste verrouillé après un mini réussi');

  // 6. La première vidéo du module N+1 s'ouvre vraiment.
  const premiere = m2Apres.contenus[0];
  const lu = await api('GET', `/api/academy/contenus/${premiere.id}`, null, jetons[IRIS]);
  assert.strictEqual(lu.status, 200, 'la première vidéo du module suivant reste refusée en lecture');
  const ouvert = await api('POST', `/api/academy/contenus/${premiere.id}/ouvrir`, {}, jetons[IRIS]);
  assert.strictEqual(ouvert.status, 200, 'la première vidéo du module suivant ne s\'ouvre pas');
  assert.strictEqual(ouvert.body.contenu.id, premiere.id);

  // 7. Et le mini n'a toujours pas validé la théorie.
  const etat = await etatQcm(IRIS);
  assert.strictEqual(etat.theorieValidee, false, 'le mini a validé la théorie');
});
