'use strict';
// ============================================================================
//  MY COACH ACADEMY — évaluation théorique (lot 2).
//
//  QUATRE PROPRIÉTÉS SE CASSENT SANS BRUIT, ET SONT ATTAQUÉES ICI :
//
//   1. LE CORRIGÉ NE SORT PAS. Aucune route ne le renvoie, aucune réponse ne le
//      laisse deviner. On le lit DIRECTEMENT EN BASE dans ces tests — et c'est
//      exactement le propos : s'il avait fallu passer par l'API pour connaître
//      les bonnes réponses, c'est qu'elles auraient fui.
//   2. UNE TENTATIVE EST FIGÉE. On modifie la banque et la configuration SOUS
//      une tentative ouverte, puis on vérifie qu'elle n'a pas bougé d'un mot.
//      Une tentative qui change en cours de route est un questionnaire truqué.
//   3. LE NAVIGATEUR NE CORRIGE RIEN. On lui fait poster un score, un seuil,
//      une question étrangère, un choix étranger. Rien ne mord.
//   4. RÉUSSIR NE CERTIFIE PAS. La réussite écrit « théorie validée » dans le
//      système de certification existant, et s'arrête là. Un coach déjà
//      certifié n'est jamais rétrogradé par un QCM.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DB = path.join(os.tmpdir(), `nutri-academy-qcm-test-${process.pid}.sqlite`);
process.env.NUTRITION_DB = DB;
process.env.ADMIN_EMAIL = 'patron@exemple.fr';

const app = require('../server');
const { certifierAncienne } = require('./aideAcademy');
const Q = require('../lib/academyQcm');
let srv, base;

const ADMIN = 'patron@exemple.fr';
const THEO = 'theo.q@exemple.fr';        // collaborateur non certifié : le parcours principal
const SOPHIE = 'sophie.q@exemple.fr';    // collaborateur : correction des choix multiples
const QUENTIN = 'quentin.q@exemple.fr';  // collaborateur DÉJÀ CERTIFIÉ : non-rétrogradation
const TIRAGE = 'tirage.q@exemple.fr';    // collaborateur : aléa du tirage
const LEA = 'lea.q@exemple.fr';          // client : ne doit jamais entrer
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

const dbq = () => require('../lib/db').getDb();

// LE CORRIGÉ, LU EN BASE. Volontairement : il n'existe aucune route pour
// l'obtenir, et c'est la propriété n°1 de ce fichier.
const corrige = (tentativeId) => new Map(
  dbq().prepare('SELECT id, correct_json AS c FROM academy_tentative_questions WHERE tentative_id = ?')
    .all(tentativeId).map((r) => [r.id, JSON.parse(r.c)]));

const etatDe = async (email) => (await api('GET', '/api/academy/qcm', null, jetons[email])).body.qcm;

async function terminerFormation(email) {
  const f = (await api('GET', '/api/academy/formation', null, jetons[email])).body.formation;
  for (const c of f.modules.flatMap((m) => m.contenus)) {
    await api('POST', `/api/academy/contenus/${c.id}/terminer`, {}, jetons[email]);
  }
}

async function demarrer(email) {
  const r = await api('POST', '/api/academy/qcm/tentatives', {}, jetons[email]);
  return r.body.tentative;
}

// Répond à toute une tentative. `choisir` reçoit, pour chaque question, la liste
// des bons et des mauvais identifiants : c'est le test qui décide de la stratégie.
async function repondreTout(email, t, choisir) {
  const k = corrige(t.id);
  for (let i = 0; i < t.questions.length; i++) {
    const q = t.questions[i];
    const bons = k.get(q.id);
    const mauvais = q.choix.map((c) => c.id).filter((id) => !bons.includes(id));
    const choix = choisir({ q, i, bons, mauvais });
    await api('PUT', `/api/academy/qcm/tentatives/${t.id}/reponses/${q.id}`, { choix }, jetons[email]);
  }
}

const rendre = async (email, t) =>
  (await api('POST', `/api/academy/qcm/tentatives/${t.id}/terminer`, {}, jetons[email])).body;

test.before(async () => {
  await new Promise((r) => { srv = app.listen(0, r); });
  base = `http://127.0.0.1:${srv.address().port}`;
  app.boost.assurerSchema();
  app.academy.assurerSchema();
  app.academyQcm.assurerSchema();
  for (const [e, p] of [[ADMIN, '7777'], [THEO, '4004'], [SOPHIE, '3003'], [QUENTIN, '2002'], [TIRAGE, '5005'], [LEA, '1001']]) {
    await connecter(e, p);
  }
  for (const e of [THEO, SOPHIE, QUENTIN, TIRAGE]) {
    await api('POST', '/api/boost/admin/collaborateurs', { email: e, role: 'collaborateur' }, jetons[ADMIN]);
  }
  // Sophie sert aux corrections : sa formation est achevée d'emblée. Théo, lui,
  // part formation incomplète — c'est LUI qui éprouve le verrou.
  await terminerFormation(SOPHIE);
  // Quentin est certifié AVANT tout QCM : c'est le cas qui ne doit jamais
  // régresser quand l'Academy se met à écrire dans la certification.
  // Certification ANTÉRIEURE à l'Academy, écrite à la main : depuis le lot 4,
  // aucune route ne permet plus de certifier sans le parcours complet — et
  // c'est précisément ce cas hérité qu'on veut éprouver ici.
  certifierAncienne({ db: require('../lib/db').getDb(), email: QUENTIN });
});

test.after(() => {
  if (srv) srv.close();
  require('../lib/db').closeDb();
  ['', '-wal', '-shm'].forEach((s) => { try { fs.unlinkSync(DB + s); } catch (_) {} });
});

// ===========================================================================
//  1. QUI PEUT PASSER LE QCM
// ===========================================================================

test('sans jeton, aucune route de QCM ne répond', async () => {
  for (const [m, route] of [['GET', '/api/academy/qcm'], ['POST', '/api/academy/qcm/tentatives'],
    ['GET', '/api/academy/qcm/tentatives/1'], ['POST', '/api/academy/qcm/tentatives/1/terminer']]) {
    assert.strictEqual((await api(m, route, m === 'POST' ? {} : null)).status, 401, `${m} ${route}`);
  }
});

test('un client est refusé sur TOUTES les routes de QCM', async () => {
  for (const [m, route] of [['GET', '/api/academy/qcm'], ['POST', '/api/academy/qcm/tentatives'],
    ['GET', '/api/academy/qcm/tentatives/1'],
    ['PUT', '/api/academy/qcm/tentatives/1/reponses/1'],
    ['POST', '/api/academy/qcm/tentatives/1/terminer']]) {
    const r = await api(m, route, m === 'GET' ? null : {}, jetons[LEA]);
    assert.strictEqual(r.status, 403, `${m} ${route}`);
    assert.strictEqual(r.body.nonCollaborateur, true);
  }
});

test('le QCM est VERROUILLÉ tant que la formation n\'est pas terminée', async () => {
  const e = await etatDe(THEO);
  assert.strictEqual(e.etat, 'formation_en_cours');
  assert.strictEqual(e.disponible, false);
  assert.strictEqual(e.theorieValidee, false);
  assert.ok(e.formation.total > 0 && e.formation.termines < e.formation.total);

  const r = await api('POST', '/api/academy/qcm/tentatives', {}, jetons[THEO]);
  assert.strictEqual(r.status, 409, 'on ne démarre pas une évaluation avant la fin de la formation');
  assert.strictEqual(r.body.formationIncomplete, true);
  assert.ok(/termine/i.test(r.body.error), 'le refus dit quoi faire : ' + r.body.error);
});

test('terminer un seul contenu ne suffit pas à ouvrir le QCM', async () => {
  const f = (await api('GET', '/api/academy/formation', null, jetons[THEO])).body.formation;
  const premier = f.modules[0].contenus[0];
  await api('POST', `/api/academy/contenus/${premier.id}/terminer`, {}, jetons[THEO]);
  const e = await etatDe(THEO);
  assert.strictEqual(e.disponible, false);
  assert.strictEqual((await api('POST', '/api/academy/qcm/tentatives', {}, jetons[THEO])).status, 409);
});

test('terminer TOUTE la formation déverrouille le QCM', async () => {
  await terminerFormation(THEO);
  const e = await etatDe(THEO);
  assert.strictEqual(e.formation.acheve, true);
  assert.strictEqual(e.disponible, true);
  assert.strictEqual(e.etat, 'qcm_disponible');
  assert.strictEqual(e.enCours, null);
  assert.strictEqual(e.derniere, null);
});

test('un collaborateur désactivé perd le QCM à l\'appel suivant', async () => {
  await terminerFormation(TIRAGE);
  assert.strictEqual((await api('GET', '/api/academy/qcm', null, jetons[TIRAGE])).status, 200);

  await api('POST', '/api/boost/admin/collaborateurs', { email: TIRAGE, role: 'client' }, jetons[ADMIN]);
  // Le jeton est toujours valide : c'est bien le rôle, relu à chaque requête, qui ferme.
  const r = await api('POST', '/api/academy/qcm/tentatives', {}, jetons[TIRAGE]);
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.body.nonCollaborateur, true);

  await api('POST', '/api/boost/admin/collaborateurs', { email: TIRAGE, role: 'collaborateur' }, jetons[ADMIN]);
  assert.strictEqual((await api('GET', '/api/academy/qcm', null, jetons[TIRAGE])).status, 200);
});

// ===========================================================================
//  2. CONFIGURATION EN DONNÉES
// ===========================================================================

test('le nombre de questions et le seuil viennent de la BASE, pas du code', async () => {
  const cfg = app.academyQcm.lireConfig();
  const lignes = dbq().prepare('SELECT cle, valeur FROM academy_config ORDER BY cle').all();
  assert.deepStrictEqual(lignes.map((l) => l.cle).sort(), ['qcm_nb_questions', 'qcm_seuil_pct']);
  assert.strictEqual(cfg.nbQuestions, Number(lignes.find((l) => l.cle === 'qcm_nb_questions').valeur));
  assert.strictEqual(cfg.seuilPct, Number(lignes.find((l) => l.cle === 'qcm_seuil_pct').valeur));
  // L'état renvoyé à l'écran annonce la configuration courante.
  assert.deepStrictEqual((await etatDe(THEO)).config, cfg);
});

test('la configuration se modifie, et refuse les valeurs absurdes', () => {
  const avant = app.academyQcm.lireConfig();
  assert.strictEqual(app.academyQcm.definirConfig({ nbQuestions: 0 }).status, 400);
  assert.strictEqual(app.academyQcm.definirConfig({ seuilPct: 140 }).status, 400);
  assert.strictEqual(app.academyQcm.definirConfig({ seuilPct: -1 }).status, 400);

  assert.strictEqual(app.academyQcm.definirConfig({ nbQuestions: 3, seuilPct: 60 }, ADMIN).status, 200);
  assert.deepStrictEqual(app.academyQcm.lireConfig(), { nbQuestions: 3, seuilPct: 60 });

  app.academyQcm.definirConfig(avant, ADMIN);
  assert.deepStrictEqual(app.academyQcm.lireConfig(), avant);
});

test('une valeur de configuration abîmée retombe sur l\'amorçage plutôt que de casser', () => {
  const avant = app.academyQcm.lireConfig();
  dbq().prepare('UPDATE academy_config SET valeur = ? WHERE cle = ?').run('n\'importe quoi', 'qcm_nb_questions');
  assert.strictEqual(app.academyQcm.lireConfig().nbQuestions, Q.DEFAUTS.nbQuestions);
  app.academyQcm.definirConfig(avant, ADMIN);
});

test('l\'amorçage du QCM est idempotent', () => {
  const avant = dbq().prepare('SELECT COUNT(*) AS n FROM academy_questions').get().n;
  const avantC = dbq().prepare('SELECT COUNT(*) AS n FROM academy_choix').get().n;
  app.academyQcm.amorcer();
  app.academyQcm.amorcer();
  assert.strictEqual(dbq().prepare('SELECT COUNT(*) AS n FROM academy_questions').get().n, avant);
  assert.strictEqual(dbq().prepare('SELECT COUNT(*) AS n FROM academy_choix').get().n, avantC);
});

test('les questions amorcées sont des questions de DÉMONSTRATION, désactivables', () => {
  const qs = dbq().prepare('SELECT cle, actif FROM academy_questions').all();
  assert.ok(qs.length >= 8, 'la banque de démonstration est peuplée');
  assert.ok(qs.every((q) => /^demo-/.test(q.cle)), 'toutes repérées par une clé « demo- »');
  assert.ok(qs.every((q) => q.actif === 1));
  // Elles portent plusieurs bonnes réponses pour au moins l'une d'entre elles :
  // le modèle doit être éprouvé, pas seulement prévu.
  const multiples = dbq().prepare(`SELECT question_id FROM academy_choix WHERE correct = 1
                                   GROUP BY question_id HAVING COUNT(*) > 1`).all();
  assert.ok(multiples.length >= 2, 'au moins deux questions à réponses multiples');
});

// ===========================================================================
//  3. DÉMARRAGE ET TIRAGE
// ===========================================================================

let t1;

test('démarrer crée une tentative, tire N questions et fige son seuil', async () => {
  const cfg = app.academyQcm.lireConfig();
  const r = await api('POST', '/api/academy/qcm/tentatives', {}, jetons[THEO]);
  assert.strictEqual(r.status, 201);
  t1 = r.body.tentative;
  assert.strictEqual(r.body.reprise, false);
  assert.strictEqual(t1.statut, 'en_cours');
  assert.strictEqual(t1.nbQuestions, cfg.nbQuestions);
  assert.strictEqual(t1.seuilPct, cfg.seuilPct);
  assert.strictEqual(t1.questions.length, cfg.nbQuestions);
  assert.strictEqual(t1.repondues, 0);
  assert.strictEqual(t1.resultat, null);
  assert.ok(t1.ouverteLe);
});

test('le tirage ne contient aucun doublon, et chaque question a ses choix', () => {
  const enonces = t1.questions.map((q) => q.enonce);
  assert.strictEqual(new Set(enonces).size, enonces.length, 'aucune question tirée deux fois');
  const ids = dbq().prepare('SELECT question_id FROM academy_tentative_questions WHERE tentative_id = ?').all(t1.id)
    .map((r) => r.question_id);
  assert.strictEqual(new Set(ids).size, ids.length, 'aucune question de la banque tirée deux fois');
  for (const q of t1.questions) {
    assert.ok(q.choix.length >= 2, 'au moins deux choix : ' + q.enonce);
    assert.strictEqual(new Set(q.choix.map((c) => c.id)).size, q.choix.length);
    assert.deepStrictEqual(q.choix.map((c) => c.texte).filter(Boolean).length, q.choix.length);
  }
  const positions = t1.questions.map((q) => q.position);
  assert.deepStrictEqual(positions, [...positions].sort((a, b) => a - b), 'les questions sortent dans leur ordre figé');
});

test('cliquer deux fois sur « commencer » REPREND la tentative, il n\'y en a pas deux', async () => {
  const r = await api('POST', '/api/academy/qcm/tentatives', {}, jetons[THEO]);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.reprise, true);
  assert.strictEqual(r.body.tentative.id, t1.id);
  const n = dbq().prepare('SELECT COUNT(*) AS n FROM academy_tentatives WHERE email = ? AND statut = ?')
    .get(THEO, 'en_cours').n;
  assert.strictEqual(n, 1);
});

test('le tirage et l\'ordre varient d\'une tentative à l\'autre', async () => {
  const signatures = new Set();
  for (let i = 0; i < 12; i++) {
    const t = await demarrer(TIRAGE);
    signatures.add(t.questions.map((q) => q.enonce + '::' + q.choix.map((c) => c.texte).join('|')).join('##'));
    await rendre(TIRAGE, t);   // rendue sans réponse : 0 %, elle libère la place
  }
  assert.ok(signatures.size > 1, 'douze tentatives identiques : le tirage n\'est pas aléatoire');
});

// ===========================================================================
//  4. LE CORRIGÉ NE SORT PAS
// ===========================================================================

test('aucune réponse HTTP ne laisse filtrer le corrigé', async () => {
  const routes = [
    ['GET', '/api/academy/qcm', null],
    ['GET', `/api/academy/qcm/tentatives/${t1.id}`, null],
    ['POST', '/api/academy/qcm/tentatives', {}],
  ];
  for (const [m, route, corps] of routes) {
    const r = await api(m, route, corps, jetons[THEO]);
    assert.ok(!/"correct"|correct_json|correctJson|bonne_reponse|bonneReponse|solution|corrige/i.test(r.txt),
      'le corrigé fuit sur ' + m + ' ' + route);
  }
  // Et dans la structure elle-même : un choix ne porte QUE son identifiant et son texte.
  const t = (await api('GET', `/api/academy/qcm/tentatives/${t1.id}`, null, jetons[THEO])).body.tentative;
  for (const q of t.questions) {
    for (const c of q.choix) {
      assert.deepStrictEqual(Object.keys(c).sort(), ['id', 'texte']);
    }
  }
});

test('la table des choix figés ne contient AUCUNE marque de correction', () => {
  // C'est la table que l'écran voit. Un « SELECT * » dessus ne doit rien
  // divulguer : le corrigé vit ailleurs, sur la question.
  const cols = dbq().prepare('PRAGMA table_info(academy_tentative_choix)').all().map((c) => c.name);
  assert.ok(!cols.includes('correct'), 'colonnes : ' + cols.join(', '));
});

test('la vue d\'une tentative ne dit jamais quelles questions sont justes', async () => {
  const t = (await api('GET', `/api/academy/qcm/tentatives/${t1.id}`, null, jetons[THEO])).body.tentative;
  for (const q of t.questions) {
    assert.ok(!('correcte' in q) && !('correct' in q), 'la question expose son verdict : ' + JSON.stringify(Object.keys(q)));
  }
});

// ===========================================================================
//  5. RÉPONDRE, MODIFIER, REPRENDRE
// ===========================================================================

test('une réponse est enregistrée côté serveur', async () => {
  const q = t1.questions[0];
  const r = await api('PUT', `/api/academy/qcm/tentatives/${t1.id}/reponses/${q.id}`,
    { choix: [q.choix[0].id] }, jetons[THEO]);
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.tentative.questions[0].reponse, [q.choix[0].id]);
  assert.strictEqual(r.body.tentative.repondues, 1);
});

test('une réponse se modifie tant que la tentative n\'est pas rendue', async () => {
  const q = t1.questions[0];
  await api('PUT', `/api/academy/qcm/tentatives/${t1.id}/reponses/${q.id}`, { choix: [q.choix[1].id] }, jetons[THEO]);
  const t = (await api('GET', `/api/academy/qcm/tentatives/${t1.id}`, null, jetons[THEO])).body.tentative;
  assert.deepStrictEqual(t.questions[0].reponse, [q.choix[1].id], 'la dernière réponse fait foi');
  assert.strictEqual(t.repondues, 1, 'et ne compte qu\'une fois');
});

test('une déconnexion en plein questionnaire ne fait rien perdre', async () => {
  await api('POST', '/account/logout', {}, jetons[THEO]);
  assert.strictEqual((await api('GET', '/api/academy/qcm', null, jetons[THEO])).status, 401);

  await connecter(THEO, '4004');
  const e = await etatDe(THEO);
  assert.strictEqual(e.etat, 'evaluation_en_cours');
  assert.strictEqual(e.enCours.id, t1.id);

  const t = (await api('GET', `/api/academy/qcm/tentatives/${t1.id}`, null, jetons[THEO])).body.tentative;
  assert.deepStrictEqual(t.questions.map((q) => q.enonce), t1.questions.map((q) => q.enonce), 'mêmes questions');
  assert.deepStrictEqual(t.questions.map((q) => q.choix.map((c) => c.texte)),
    t1.questions.map((q) => q.choix.map((c) => c.texte)), 'mêmes choix, dans le même ordre');
  assert.deepStrictEqual(t.questions[0].reponse, [t1.questions[0].choix[1].id], 'la réponse déjà saisie est là');
});

test('une question à réponse unique refuse deux réponses', async () => {
  const q = t1.questions.find((x) => !x.multiple);
  const r = await api('PUT', `/api/academy/qcm/tentatives/${t1.id}/reponses/${q.id}`,
    { choix: [q.choix[0].id, q.choix[1].id] }, jetons[THEO]);
  assert.strictEqual(r.status, 400);
  assert.ok(/une seule réponse/i.test(r.body.error));
});

// ===========================================================================
//  6. LE GEL
// ===========================================================================

test('modifier la BANQUE ne change rien à une tentative ouverte', async () => {
  const avant = (await api('GET', `/api/academy/qcm/tentatives/${t1.id}`, null, jetons[THEO])).body.tentative;
  const origine = dbq().prepare('SELECT question_id AS qid FROM academy_tentative_questions WHERE tentative_id = ? ORDER BY position LIMIT 1')
    .get(t1.id).qid;
  const enonceOriginal = dbq().prepare('SELECT enonce FROM academy_questions WHERE id = ?').get(origine).enonce;

  // On réécrit l'énoncé, on renomme un choix, et on désactive la question.
  dbq().prepare('UPDATE academy_questions SET enonce = ? WHERE id = ?').run('ÉNONCÉ RÉÉCRIT APRÈS COUP', origine);
  dbq().prepare('UPDATE academy_choix SET texte = ? WHERE question_id = ?').run('CHOIX RÉÉCRIT', origine);
  dbq().prepare('UPDATE academy_questions SET actif = 0 WHERE id = ?').run(origine);

  const apres = (await api('GET', `/api/academy/qcm/tentatives/${t1.id}`, null, jetons[THEO])).body.tentative;
  assert.deepStrictEqual(apres.questions.map((q) => q.enonce), avant.questions.map((q) => q.enonce));
  assert.deepStrictEqual(apres.questions.map((q) => q.choix.map((c) => c.texte)),
    avant.questions.map((q) => q.choix.map((c) => c.texte)));
  assert.ok(!apres.questions.some((q) => /RÉÉCRIT/.test(q.enonce)), 'la réécriture a rattrapé la tentative');
  assert.strictEqual(apres.nbQuestions, avant.nbQuestions);

  // On remet la banque en état pour la suite.
  dbq().prepare('UPDATE academy_questions SET enonce = ?, actif = 1 WHERE id = ?').run(enonceOriginal, origine);
  const cle = dbq().prepare('SELECT cle FROM academy_questions WHERE id = ?').get(origine).cle;
  const source = Q.AMORCE_QUESTIONS.find((x) => x.cle === cle);
  source.choix.forEach(([texte], i) => {
    dbq().prepare('UPDATE academy_choix SET texte = ? WHERE cle = ?').run(texte, `${cle}-c${i + 1}`);
  });
});

test('changer la CONFIGURATION ne change rien à une tentative ouverte', async () => {
  const avant = (await api('GET', `/api/academy/qcm/tentatives/${t1.id}`, null, jetons[THEO])).body.tentative;
  const cfgAvant = app.academyQcm.lireConfig();

  app.academyQcm.definirConfig({ nbQuestions: 2, seuilPct: 10 }, ADMIN);
  const apres = (await api('GET', `/api/academy/qcm/tentatives/${t1.id}`, null, jetons[THEO])).body.tentative;
  assert.strictEqual(apres.nbQuestions, avant.nbQuestions, 'le nombre de questions est figé');
  assert.strictEqual(apres.seuilPct, avant.seuilPct, 'le seuil est figé');
  assert.strictEqual(apres.questions.length, avant.questions.length);

  // Et l'état ANNONCE bien la nouvelle configuration pour la prochaine tentative :
  // ce sont deux choses différentes, et l'écran doit pouvoir les distinguer.
  const e = await etatDe(THEO);
  assert.deepStrictEqual(e.config, { nbQuestions: 2, seuilPct: 10 });
  assert.strictEqual(e.enCours.seuilPct, avant.seuilPct);

  app.academyQcm.definirConfig(cfgAvant, ADMIN);
});

// ===========================================================================
//  7. LA CORRECTION EST AU SERVEUR
// ===========================================================================

test('le navigateur ne choisit ni son score ni son seuil', async () => {
  // On répond juste à 2 questions sur 5, puis on rend en réclamant 100 %.
  await repondreTout(THEO, t1, ({ i, bons, mauvais }) => (i < 2 ? bons : [mauvais[0]]));
  const r = await api('POST', `/api/academy/qcm/tentatives/${t1.id}/terminer`,
    { score: 100, scorePct: 100, seuil: 0, seuilPct: 0, reussie: true, bonnes: 5 }, jetons[THEO]);
  assert.strictEqual(r.status, 200);
  const res = r.body.tentative.resultat;
  assert.strictEqual(res.bonnes, 2, 'le serveur a compté, pas le navigateur');
  assert.strictEqual(res.scorePct, 40);
  assert.strictEqual(res.seuilPct, t1.seuilPct, 'le seuil réclamé a été ignoré');
  assert.strictEqual(res.reussie, false);
});

test('sous le seuil, la théorie n\'est PAS validée — et on peut recommencer', async () => {
  const e = await etatDe(THEO);
  assert.strictEqual(e.etat, 'theorie_non_validee');
  assert.strictEqual(e.theorieValidee, false);
  assert.strictEqual(e.eligiblePratique, false);
  assert.strictEqual(e.derniere.scorePct, 40);
  assert.strictEqual(e.enCours, null, 'la tentative est clôturée');
  // La certification n'a rien reçu : un échec ne s'inscrit nulle part.
  assert.strictEqual((await api('GET', `/api/boost/admin/collaborateurs`, null, jetons[ADMIN])).body
    .collaborateurs.find((c) => c.email === THEO).certification.statut, 'non_certifie');
});

test('une tentative rendue n\'est plus modifiable, ni re-rendue', async () => {
  const q = t1.questions[0];
  const r1 = await api('PUT', `/api/academy/qcm/tentatives/${t1.id}/reponses/${q.id}`,
    { choix: [q.choix[0].id] }, jetons[THEO]);
  assert.strictEqual(r1.status, 409);
  assert.ok(/terminée|rendue/i.test(r1.body.error));

  const r2 = await api('POST', `/api/academy/qcm/tentatives/${t1.id}/terminer`, {}, jetons[THEO]);
  assert.strictEqual(r2.status, 409);

  // Le score en base n'a pas bougé.
  const t = dbq().prepare('SELECT score_pct AS s, bonnes AS b FROM academy_tentatives WHERE id = ?').get(t1.id);
  assert.deepStrictEqual(t, { s: 40, b: 2 });
});

test('une question laissée sans réponse est comptée fausse', async () => {
  const t = await demarrer(SOPHIE);
  await repondreTout(SOPHIE, t, ({ i, bons }) => (i === 0 ? bons : []));
  const res = (await rendre(SOPHIE, t)).tentative.resultat;
  assert.strictEqual(res.bonnes, 1);
  assert.strictEqual(res.scorePct, Math.round((1 / t.nbQuestions) * 100));
});

// ===========================================================================
//  8. CHOIX MULTIPLES — l'ensemble EXACT, sans demi-point
// ===========================================================================

// Ces trois tests tirent TOUTE la banque pour être sûrs d'y trouver des
// questions à réponses multiples : un tirage aléatoire ne les garantit pas.
async function tentativeComplete(email) {
  const avant = app.academyQcm.lireConfig();
  app.academyQcm.definirConfig({ nbQuestions: 200 }, ADMIN);
  const t = await demarrer(email);
  app.academyQcm.definirConfig(avant, ADMIN);
  return t;
}

test('choix multiples : une réponse PARTIELLE est fausse', async () => {
  const t = await tentativeComplete(SOPHIE);
  const multiples = t.questions.filter((q) => q.multiple).length;
  assert.ok(multiples >= 2, 'la banque doit contenir des questions à réponses multiples');

  // Tout juste, SAUF sur les multiples où l'on ne coche qu'UNE bonne réponse.
  await repondreTout(SOPHIE, t, ({ q, bons }) => (q.multiple ? [bons[0]] : bons));
  const res = (await rendre(SOPHIE, t)).tentative.resultat;
  assert.strictEqual(res.bonnes, t.nbQuestions - multiples, 'A seul, quand il faut A + C, est faux');
});

test('choix multiples : une réponse EXCÉDENTAIRE est fausse', async () => {
  const t = await tentativeComplete(SOPHIE);
  const multiples = t.questions.filter((q) => q.multiple).length;
  // Tout juste, SAUF sur les multiples où l'on ajoute une mauvaise réponse.
  await repondreTout(SOPHIE, t, ({ q, bons, mauvais }) => (q.multiple ? [...bons, mauvais[0]] : bons));
  const res = (await rendre(SOPHIE, t)).tentative.resultat;
  assert.strictEqual(res.bonnes, t.nbQuestions - multiples, 'A + B + C, quand il faut A + C, est faux');
});

test('choix multiples : l\'ensemble EXACT est juste — et donne 100 %', async () => {
  const t = await tentativeComplete(SOPHIE);
  await repondreTout(SOPHIE, t, ({ bons }) => bons);
  const res = (await rendre(SOPHIE, t)).tentative.resultat;
  assert.strictEqual(res.bonnes, t.nbQuestions);
  assert.strictEqual(res.scorePct, 100);
  assert.strictEqual(res.reussie, true);
});

// ===========================================================================
//  9. SEUIL : EXACTEMENT AU SEUIL, ET JUSTE EN DESSOUS
// ===========================================================================

test('réussir EXACTEMENT au seuil suffit', async () => {
  // 5 questions, seuil 80 % : 4 bonnes réponses = 80 %, pile le seuil.
  app.academyQcm.definirConfig({ nbQuestions: 5, seuilPct: 80 }, ADMIN);
  const t = await demarrer(THEO);
  assert.strictEqual(t.seuilPct, 80);
  await repondreTout(THEO, t, ({ i, bons, mauvais }) => (i < 4 ? bons : [mauvais[0]]));
  const res = (await rendre(THEO, t)).tentative.resultat;
  assert.strictEqual(res.scorePct, 80);
  assert.strictEqual(res.reussie, true, '« au moins le seuil » et non « au-dessus »');
});

test('un point sous le seuil échoue', async () => {
  const t = await demarrer(SOPHIE);
  await repondreTout(SOPHIE, t, ({ i, bons, mauvais }) => (i < 3 ? bons : [mauvais[0]]));
  const res = (await rendre(SOPHIE, t)).tentative.resultat;
  assert.strictEqual(res.scorePct, 60);
  assert.strictEqual(res.reussie, false);
});

// ===========================================================================
//  10. CE QUE LA RÉUSSITE OUVRE — ET CE QU'ELLE N'OUVRE PAS
// ===========================================================================

test('la théorie est validée, et le score arrive dans boost_certifications', async () => {
  const e = await etatDe(THEO);
  assert.strictEqual(e.etat, 'theorie_validee');
  assert.strictEqual(e.theorieValidee, true);
  assert.strictEqual(e.scoreValide, 80);
  assert.ok(e.valideeLe);

  const cert = app.boost.lireCertification(THEO);
  assert.strictEqual(cert.scoreQcm, 80, 'le score est inscrit dans le système de certification EXISTANT');
  assert.strictEqual(cert.statut, 'en_cours', 'théorie validée, parcours pratique ouvert');
});

test('RÉUSSIR LE QCM NE CERTIFIE PAS : éligible à la pratique, pas Coach Nutrition', async () => {
  const e = await etatDe(THEO);
  assert.strictEqual(e.eligiblePratique, true, 'éligible à l\'évaluation pratique');
  assert.strictEqual(e.certifie, false, 'PAS certifié Coach Nutrition');
  assert.strictEqual(e.certification, 'en_cours');

  // Et le contrôle d'accès du Boost le confirme : pas de dossier client.
  assert.strictEqual(app.boost.estCoachCertifie(THEO), false);
  const r = await api('GET', '/api/boost/coach/dossiers', null, jetons[THEO]);
  assert.strictEqual(r.status, 403, 'un collaborateur qui a réussi le QCM n\'accède pas aux dossiers');
  assert.strictEqual(r.body.nonCertifie, true);

  // Le résultat pratique et l'évaluateur restent vides : personne n'a rien prononcé.
  const cert = app.boost.lireCertification(THEO);
  assert.strictEqual(cert.resultatPratique, null);
  assert.strictEqual(cert.evaluateur, null);
  assert.strictEqual(cert.dateCertification, null);
});

test('une nouvelle tentative ratée NE retire PAS une théorie déjà validée', async () => {
  const t = await demarrer(THEO);
  await repondreTout(THEO, t, ({ mauvais }) => [mauvais[0]]);
  const res = (await rendre(THEO, t)).tentative.resultat;
  assert.strictEqual(res.reussie, false);

  const e = await etatDe(THEO);
  assert.strictEqual(e.theorieValidee, true, 'la réussite est ACQUISE');
  assert.strictEqual(e.etat, 'theorie_validee');
  assert.strictEqual(e.scoreValide, 80, 'le score validé reste celui de la tentative réussie');
  assert.strictEqual(app.boost.lireCertification(THEO).scoreQcm, 80, 'le score inscrit ne baisse pas');
  assert.strictEqual(app.boost.lireCertification(THEO).statut, 'en_cours');
});

test('l\'historique conserve toutes les tentatives, réussies comme ratées', async () => {
  const e = await etatDe(THEO);
  assert.ok(e.historique.length >= 3, 'trois tentatives au moins : ' + e.historique.length);
  assert.ok(e.historique.every((t) => t.statut === 'soumise'));
  assert.ok(e.historique.some((t) => t.reussie), 'la réussie est conservée');
  assert.ok(e.historique.some((t) => !t.reussie), 'les ratées aussi');
  // Chaque tentative garde SON seuil et SON nombre de questions.
  assert.ok(e.historique.every((t) => Number.isInteger(t.seuilPct) && Number.isInteger(t.nbQuestions)));
  // Trié du plus récent au plus ancien.
  const ids = e.historique.map((t) => t.id);
  assert.deepStrictEqual(ids, [...ids].sort((a, b) => b - a));
});

test('un Coach DÉJÀ CERTIFIÉ n\'est jamais rétrogradé par un QCM', async () => {
  const avant = app.boost.lireCertification(QUENTIN);
  assert.strictEqual(avant.statut, 'certifie');
  assert.strictEqual(avant.scoreQcm, 88);

  await terminerFormation(QUENTIN);
  app.academyQcm.definirConfig({ nbQuestions: 5, seuilPct: 80 }, ADMIN);
  const t = await demarrer(QUENTIN);
  await repondreTout(QUENTIN, t, ({ i, bons, mauvais }) => (i < 4 ? bons : [mauvais[0]]));
  const res = (await rendre(QUENTIN, t)).tentative.resultat;
  assert.strictEqual(res.scorePct, 80);
  assert.strictEqual(res.reussie, true);

  const apres = app.boost.lireCertification(QUENTIN);
  assert.strictEqual(apres.statut, 'certifie', 'la certification n\'est pas repassée « en cours »');
  assert.strictEqual(apres.scoreQcm, 88, 'un score plus bas n\'écrase pas la trace existante');
  assert.strictEqual(apres.evaluateur, avant.evaluateur, 'l\'évaluateur est intact');
  assert.strictEqual(apres.dateCertification, avant.dateCertification, 'la date est intacte');
  assert.strictEqual(apres.resultatPratique, avant.resultatPratique);
  assert.strictEqual(app.boost.estCoachCertifie(QUENTIN), true, 'il garde ses dossiers');

  const e = await etatDe(QUENTIN);
  assert.strictEqual(e.certifie, true);
  assert.strictEqual(e.theorieValidee, true);
  assert.strictEqual(e.eligiblePratique, false, 'déjà certifié : la pratique est derrière lui');
});

test('un meilleur score met la trace à jour, un moins bon jamais', async () => {
  const t = await tentativeComplete(QUENTIN);
  await repondreTout(QUENTIN, t, ({ bons }) => bons);
  assert.strictEqual((await rendre(QUENTIN, t)).tentative.resultat.scorePct, 100);
  const cert = app.boost.lireCertification(QUENTIN);
  assert.strictEqual(cert.scoreQcm, 100);
  assert.strictEqual(cert.statut, 'certifie');
});

test('une SUSPENSION n\'est pas levée par une réussite au QCM', async () => {
  await api('PUT', `/api/boost/admin/certification/${SOPHIE}`,
    { statut: 'suspendu', commentaire: 'suspension de test' }, jetons[ADMIN]);
  const t = await tentativeComplete(SOPHIE);
  await repondreTout(SOPHIE, t, ({ bons }) => bons);
  assert.strictEqual((await rendre(SOPHIE, t)).tentative.resultat.reussie, true);

  const cert = app.boost.lireCertification(SOPHIE);
  assert.strictEqual(cert.statut, 'suspendu', 'une décision d\'administration ne se défait pas toute seule');
  assert.strictEqual(cert.scoreQcm, 100, 'le score est quand même enregistré');
  assert.strictEqual((await etatDe(SOPHIE)).theorieValidee, true);
});

// ===========================================================================
//  11. CLOISONNEMENT ENTRE COLLABORATEURS
// ===========================================================================

test('on ne LIT pas la tentative d\'un autre — et on ne sait même pas qu\'elle existe', async () => {
  const t = await demarrer(THEO);
  const r = await api('GET', `/api/academy/qcm/tentatives/${t.id}`, null, jetons[SOPHIE]);
  assert.strictEqual(r.status, 404, '404 et non 403 : un 403 confirmerait qu\'elle existe');
  assert.ok(!r.txt.includes(t.questions[0].enonce), 'aucun énoncé n\'a fuité');
});

test('on ne RÉPOND pas dans la tentative d\'un autre', async () => {
  const t = (await api('GET', '/api/academy/qcm', null, jetons[THEO])).body.qcm.enCours;
  const complete = (await api('GET', `/api/academy/qcm/tentatives/${t.id}`, null, jetons[THEO])).body.tentative;
  const q = complete.questions[0];

  const r = await api('PUT', `/api/academy/qcm/tentatives/${t.id}/reponses/${q.id}`,
    { choix: [q.choix[0].id] }, jetons[SOPHIE]);
  assert.strictEqual(r.status, 404);

  const apres = (await api('GET', `/api/academy/qcm/tentatives/${t.id}`, null, jetons[THEO])).body.tentative;
  assert.deepStrictEqual(apres.questions[0].reponse, [], 'la tentative n\'a pas bougé');
});

test('on ne SOUMET pas la tentative d\'un autre', async () => {
  const t = (await api('GET', '/api/academy/qcm', null, jetons[THEO])).body.qcm.enCours;
  assert.strictEqual((await api('POST', `/api/academy/qcm/tentatives/${t.id}/terminer`, {}, jetons[SOPHIE])).status, 404);
  assert.strictEqual((await api('GET', '/api/academy/qcm', null, jetons[THEO])).body.qcm.enCours.id, t.id,
    'elle est toujours en cours pour son propriétaire');
});

test('on n\'injecte pas une question étrangère dans sa tentative', async () => {
  const mienne = (await api('GET', '/api/academy/qcm', null, jetons[THEO])).body.qcm.enCours;
  // Une question figée qui appartient à une AUTRE tentative.
  const etrangere = dbq().prepare(`SELECT id FROM academy_tentative_questions
                                   WHERE tentative_id <> ? ORDER BY id DESC LIMIT 1`).get(mienne.id).id;
  const r = await api('PUT', `/api/academy/qcm/tentatives/${mienne.id}/reponses/${etrangere}`,
    { choix: [] }, jetons[THEO]);
  assert.strictEqual(r.status, 404);
  assert.ok(/question introuvable/i.test(r.body.error));
});

test('on n\'injecte pas un choix étranger dans sa réponse', async () => {
  const mienne = (await api('GET', '/api/academy/qcm', null, jetons[THEO])).body.qcm.enCours;
  const t = (await api('GET', `/api/academy/qcm/tentatives/${mienne.id}`, null, jetons[THEO])).body.tentative;
  const q = t.questions[0];
  const siens = q.choix.map((c) => c.id);
  const etranger = dbq().prepare('SELECT id FROM academy_tentative_choix WHERE tq_id <> ? ORDER BY id DESC LIMIT 1')
    .get(q.id).id;

  for (const choix of [[etranger], [siens[0], etranger], [999999], ['abc']]) {
    const r = await api('PUT', `/api/academy/qcm/tentatives/${mienne.id}/reponses/${q.id}`, { choix }, jetons[THEO]);
    assert.strictEqual(r.status, 400, JSON.stringify(choix));
  }
  const apres = (await api('GET', `/api/academy/qcm/tentatives/${mienne.id}`, null, jetons[THEO])).body.tentative;
  assert.deepStrictEqual(apres.questions[0].reponse, [], 'aucune de ces tentatives n\'a laissé de trace');
});

test('un identifiant de tentative inexistant ou fantaisiste répond 404', async () => {
  for (const id of [999999, 'abc', '1 OR 1=1']) {
    assert.strictEqual((await api('GET', `/api/academy/qcm/tentatives/${encodeURIComponent(id)}`, null, jetons[THEO])).status,
      404, String(id));
  }
});

test('l\'historique d\'un collaborateur ne contient que le sien', async () => {
  const deTheo = (await etatDe(THEO)).historique.map((t) => t.id);
  const deSophie = (await etatDe(SOPHIE)).historique.map((t) => t.id);
  assert.ok(deTheo.length && deSophie.length);
  assert.strictEqual(deTheo.filter((id) => deSophie.includes(id)).length, 0, 'aucun croisement');
});

// ===========================================================================
//  12. TIRAGE : CE QUI EST ÉCARTÉ
// ===========================================================================

test('une question sans bonne réponse est écartée du tirage : elle est incorrigeable', () => {
  const maintenant = new Date().toISOString();
  const info = dbq().prepare('INSERT INTO academy_questions (module_id, enonce, actif, ordre, cle, cree_le, maj_le) VALUES (NULL,?,1,99,?,?,?)')
    .run('Question sans corrigé', 'test-sans-corrige', maintenant, maintenant);
  const qid = Number(info.lastInsertRowid);
  for (const texte of ['A', 'B']) {
    dbq().prepare('INSERT INTO academy_choix (question_id, texte, correct, actif, ordre, cree_le, maj_le) VALUES (?,?,0,1,1,?,?)')
      .run(qid, texte, maintenant, maintenant);
  }
  assert.ok(!app.academyQcm.questionsEligibles().some((q) => q.id === qid), 'elle ne doit pas être tirable');

  // Une question dont TOUS les choix sont bons ne l'est pas davantage.
  dbq().prepare('UPDATE academy_choix SET correct = 1 WHERE question_id = ?').run(qid);
  assert.ok(!app.academyQcm.questionsEligibles().some((q) => q.id === qid));

  dbq().prepare('DELETE FROM academy_questions WHERE id = ?').run(qid);
});

test('désactiver une question la retire du tirage sans toucher à l\'historique', async () => {
  const cible = dbq().prepare('SELECT id FROM academy_questions WHERE cle = ?').get('demo-q1').id;
  const avant = app.academyQcm.questionsEligibles().length;
  dbq().prepare('UPDATE academy_questions SET actif = 0 WHERE id = ?').run(cible);
  assert.strictEqual(app.academyQcm.questionsEligibles().length, avant - 1);
  // Les tentatives passées la contiennent toujours : rien n'a été supprimé.
  const encore = dbq().prepare('SELECT COUNT(*) AS n FROM academy_tentative_questions WHERE question_id = ?').get(cible).n;
  assert.ok(encore > 0, 'l\'historique conserve la question désactivée');
  dbq().prepare('UPDATE academy_questions SET actif = 1 WHERE id = ?').run(cible);
});

test('désactiver un MODULE retire ses questions du tirage', () => {
  const m = dbq().prepare('SELECT id FROM academy_modules WHERE cle = ?').get('demo-m2').id;
  const avant = app.academyQcm.questionsEligibles();
  dbq().prepare('UPDATE academy_modules SET actif = 0 WHERE id = ?').run(m);
  const apres = app.academyQcm.questionsEligibles();
  assert.ok(apres.length < avant.length);
  assert.ok(!apres.some((q) => q.moduleId === m), 'plus aucune question du module désactivé');
  dbq().prepare('UPDATE academy_modules SET actif = 1 WHERE id = ?').run(m);
});

test('si la banque est plus courte que la configuration, on tire ce qui existe', async () => {
  const avant = app.academyQcm.lireConfig();
  app.academyQcm.definirConfig({ nbQuestions: 200 }, ADMIN);
  const dispo = app.academyQcm.questionsEligibles().length;
  const t = await demarrer(TIRAGE);
  assert.strictEqual(t.nbQuestions, dispo, 'le score se calcule sur les questions RÉELLEMENT posées');
  assert.strictEqual(t.questions.length, dispo);
  await rendre(TIRAGE, t);
  app.academyQcm.definirConfig(avant, ADMIN);
});

// ===========================================================================
//  13. L'ÉCRAN
// ===========================================================================

test('l\'écran ne reçoit ni ne manipule le corrigé', () => {
  const code = js.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  // Bornes de mot : l'écran a le droit de dire « à corriger » ailleurs (les
  // écarts Academy/Boost du lot 4), ce qu'il ne doit pas manipuler c'est LE
  // corrigé.
  for (const interdit of ['correct_json', 'correctJson', 'bonneReponse', 'bonne_reponse', 'estJuste']) {
    assert.ok(!new RegExp(interdit, 'i').test(code), 'l\'écran manipule « ' + interdit + ' »');
  }
  assert.ok(!/\bcorrig[ée]s?\b/i.test(code), 'l\'écran manipule un corrigé');
  // Il ne recalcule ni score ni verdict : les deux viennent du serveur.
  assert.ok(!/scorePct\s*=\s*Math\./.test(code), 'aucun calcul de score dans l\'écran');
  assert.ok(!/reussie\s*=\s*[^=]/.test(code), 'l\'écran ne décide pas de la réussite');
});

test('l\'écran présente les six états attendus', () => {
  for (const etat of ['formation_en_cours', 'qcm_disponible', 'evaluation_en_cours',
    'theorie_non_validee', 'theorie_validee']) {
    assert.ok(js.includes(etat), 'état manquant : ' + etat);
  }
  assert.ok(/Formation en cours/.test(js));
  assert.ok(/Formation terminée — QCM disponible/.test(js));
  assert.ok(/Évaluation théorique en cours/.test(js));
  assert.ok(/Théorie non validée/.test(js));
  assert.ok(/Théorie validée/.test(js));
  assert.ok(/Prochaine étape : évaluation pratique/.test(js));
});

test('l\'écran dit franchement que réussir le QCM ne certifie pas', () => {
  // Le titre vient du catalogue depuis le lot 5 : la phrase se construit.
  assert.ok(/n\\?'es pas encore ' \+ echapper\(titreCourant\(\)\)/.test(js),
    'le collaborateur doit lire noir sur blanc qu\'il n\'est pas certifié');
  assert.ok(/évaluation pratique/.test(js));
  assert.ok(/Formation théorique validée/.test(js) && /Formation théorique non validée/.test(js));
});

test('l\'écran affiche « Question X / N » et permet de revenir sur ses réponses', () => {
  assert.ok(/Question ' \+ \(iQuestion \+ 1\) \+ ' \/ '/.test(js), 'la position dans le questionnaire est affichée');
  assert.ok(js.includes('Terminer mon évaluation'));
  assert.ok(js.includes('acQPrec') && js.includes('acQSuiv'), 'navigation entre les questions');
  assert.ok(js.includes('ac-q-dot'), 'progression cliquable');
  assert.ok(/revenir sur tes réponses/.test(js));
  for (const cls of ['.ac-q-dot', '.ac-choix', '.ac-res-score', '.ac-qcm-carte']) {
    assert.ok(css.includes(cls), 'style manquant : ' + cls);
  }
});

test('la page charge la section d\'évaluation, et rien de plus', () => {
  assert.ok(html.includes('id="acQcm"'));
  assert.ok(!html.includes('app.js') && !html.includes('coach.js'));
});

test('l\'écran n\'appelle que les routes de QCM prévues', () => {
  for (const route of ['/api/academy/qcm', '/api/academy/qcm/tentatives', '/terminer', '/reponses/']) {
    assert.ok(js.includes(route), 'appelle ' + route);
  }
  assert.ok(!/\/api\/academy\/qcm\/(questions|choix|config)/.test(js),
    'l\'écran n\'administre pas la banque : ce sera l\'affaire de l\'administration');
});
