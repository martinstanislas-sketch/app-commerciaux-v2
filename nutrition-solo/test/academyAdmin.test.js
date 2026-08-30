'use strict';
// ============================================================================
//  MY COACH ACADEMY — administration des contenus (lot 6).
//
//  CE QUE CETTE SUITE ATTAQUE, DANS L'ORDRE :
//
//   1. LE PARCOURS ADMIN COMPLET, PAR L'API SEULE. Nouvelle formation →
//      réglages → modules → vidéos → questions → ordre → publication. Pas une
//      ligne de SQL : si un geste manque une route, le test échoue.
//   2. LE BROUILLON EST INVISIBLE. Une formation non publiée n'existe pour
//      aucun collaborateur — ni au catalogue, ni par sa clé, ni par un
//      identifiant de contenu deviné.
//   3. ON NE PUBLIE PAS L'INFRANCHISSABLE. Chaque incohérence structurelle est
//      éprouvée SÉPARÉMENT, et le refus doit la nommer.
//   4. LE CORRIGÉ NE FUIT PAS. C'est le point de sécurité du lot : on balaie
//      TOUTES les routes accessibles à un collaborateur — y compris en pleine
//      tentative de QCM — et on cherche la marque `correct` dans chaque octet
//      renvoyé.
//   5. LE CLOISONNEMENT TIENT PAR LA PORTE DE L'ADMINISTRATION. On tente de
//      déplacer un contenu d'une formation à l'autre, de rattacher une question
//      au module d'un autre parcours, d'ordonner des éléments étrangers.
//   6. ON N'EFFACE JAMAIS. Archiver un contenu déjà terminé laisse la
//      progression intacte.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DB = path.join(os.tmpdir(), `nutri-academy-admin-test-${process.pid}.sqlite`);
process.env.NUTRITION_DB = DB;
process.env.ADMIN_EMAIL = 'patron@exemple.fr';

const app = require('../server');
const { COACH_NUTRITION } = require('../lib/academyFormations');
let srv, base;

const ADMIN = 'patron@exemple.fr';
const THEO = 'theo.a@exemple.fr';     // collaborateur
const LEA = 'lea.a@exemple.fr';       // cliente : rien à faire ici
const NEUVE = 'formation_neuve';      // la formation créée de bout en bout
const jetons = {};

const PUBLIC = path.join(__dirname, '..', 'public');
const js = fs.readFileSync(path.join(PUBLIC, 'academy.js'), 'utf8');
const html = fs.readFileSync(path.join(PUBLIC, 'academy.html'), 'utf8');
const css = fs.readFileSync(path.join(PUBLIC, 'academy.css'), 'utf8');
const moteur = fs.readFileSync(path.join(__dirname, '..', 'lib', 'academyAdmin.js'), 'utf8');

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

// Les gestes d'administration, tels que l'écran les fera.
const adm = (m, route, corps) => api(m, route, corps, jetons[ADMIN]);
const arbreDe = async (cle) => (await adm('GET', `/api/academy/admin/arbre?formation=${cle}`)).body;
const verifDe = async (cle) => (await arbreDe(cle)).verification;
const publier = (cle) => adm('POST', `/api/academy/admin/formations/${cle}/publier`);

test.before(async () => {
  await new Promise((r) => { srv = app.listen(0, r); });
  base = `http://127.0.0.1:${srv.address().port}`;
  app.boost.assurerSchema();
  app.academyCertifications.assurerSchema();
  for (const [e, p] of [[ADMIN, '7777'], [THEO, '4004'], [LEA, '1001']]) await connecter(e, p);
  await api('POST', '/api/boost/admin/collaborateurs', { email: THEO, role: 'collaborateur' }, jetons[ADMIN]);
});

test.after(() => {
  if (srv) srv.close();
  require('../lib/db').closeDb();
  ['', '-wal', '-shm'].forEach((s) => { try { fs.unlinkSync(DB + s); } catch (_) {} });
});

// ===========================================================================
//  0. LE MOTEUR N'INVENTE RIEN
// ===========================================================================

test('le moteur d\'administration ne nomme aucune formation', () => {
  const code = moteur.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
  assert.ok(!/coach_nutrition|Coach Nutrition/.test(code),
    'l\'administration nomme une formation : elle ne serait pas générique');
});

test('aucun DELETE sur un contenu, un module ou une question', () => {
  // La seule suppression permise est celle des CHOIX d'une question qu'on
  // réécrit : eux ne portent aucune progression. Tout le reste s'archive.
  const suppressions = moteur.match(/DELETE FROM (\w+)/g) || [];
  assert.deepStrictEqual(suppressions, ['DELETE FROM academy_choix'],
    'supprimer un contenu emporterait academy_vus en cascade');
});

// ===========================================================================
//  1. LE PARCOURS ADMIN COMPLET — par l'API seule, sans une ligne de SQL
// ===========================================================================

test('parcours complet : créer, régler, remplir, ordonner, publier', async () => {
  // -- Créer. Le corps demande explicitement actif:true : la route doit
  //    l'ignorer. Une formation naît en brouillon, sans exception.
  const cree = await adm('POST', '/api/academy/admin/formations', {
    cle: NEUVE, libelle: 'Formation neuve', titre: 'Praticien neuf certifié',
    ordre: 9, qcmNbQuestions: 2, qcmSeuilPct: 75, actif: true,
  });
  assert.strictEqual(cree.status, 200, JSON.stringify(cree.body));
  assert.strictEqual(cree.body.formation.actif, false, 'une formation naît TOUJOURS en brouillon');
  assert.strictEqual(cree.body.formation.qcmSeuilPct, 75);

  // La même clé deux fois : refus net, pas d'écrasement silencieux.
  const doublon = await adm('POST', '/api/academy/admin/formations', { cle: NEUVE, libelle: 'Autre', titre: 'X' });
  assert.strictEqual(doublon.status, 409);

  // -- Régler. Là aussi actif:true doit rester sans effet : on ne publie pas
  //    par effet de bord d'un enregistrement de réglages.
  const regle = await adm('PUT', `/api/academy/admin/formations/${NEUVE}`, {
    libelle: 'Formation neuve', titre: 'Praticien neuf certifié',
    qcmNbQuestions: 2, qcmSeuilPct: 70, pratiqueObligatoire: false, certificationActive: true, actif: true,
  });
  assert.strictEqual(regle.status, 200);
  assert.strictEqual(regle.body.formation.actif, false, 'régler ne publie pas');
  assert.strictEqual(regle.body.formation.qcmSeuilPct, 70);
  assert.strictEqual(regle.body.formation.pratiqueObligatoire, false);

  // -- Modules.
  const m1 = await adm('POST', '/api/academy/admin/modules', { formation: NEUVE, titre: 'Module neuf 1' });
  assert.strictEqual(m1.status, 200, JSON.stringify(m1.body));
  const m2 = await adm('POST', '/api/academy/admin/modules', { formation: NEUVE, titre: 'Module neuf 2' });
  const idM1 = m1.body.module.id;
  const idM2 = m2.body.module.id;
  assert.strictEqual(m1.body.module.ordre, 1);
  assert.strictEqual(m2.body.module.ordre, 2, 'deux ajouts ne prennent pas le même rang');

  // -- Contenus. Un identifiant YouTube mal formé est refusé À L'ÉCRITURE :
  //    c'est ce qui part dans un attribut src d'iframe.
  const mauvais = await adm('POST', '/api/academy/admin/contenus',
    { formation: NEUVE, moduleId: idM1, titre: 'Cassée', youtubeId: 'https://youtu.be/abc' });
  assert.strictEqual(mauvais.status, 400);
  assert.match(mauvais.body.error, /YouTube/);

  const c1 = await adm('POST', '/api/academy/admin/contenus',
    { formation: NEUVE, moduleId: idM1, titre: 'Vidéo neuve 1', youtubeId: 'NEUVEaaa001', dureeMin: 7 });
  assert.strictEqual(c1.status, 200, JSON.stringify(c1.body));
  const c2 = await adm('POST', '/api/academy/admin/contenus',
    { formation: NEUVE, moduleId: idM2, titre: 'Vidéo neuve 2', youtubeId: 'NEUVEaaa002' });
  // Un contenu écrit, pour éprouver l'autre type.
  const c3 = await adm('POST', '/api/academy/admin/contenus',
    { formation: NEUVE, moduleId: idM2, type: 'texte', titre: 'Fiche neuve', texte: 'Le contenu de la fiche.' });
  assert.strictEqual(c3.status, 200);
  assert.strictEqual(c3.body.contenu.youtubeId, null, 'un contenu écrit ne porte pas de vidéo');

  // -- Questions. Le nombre tiré est 2 : la banque doit en compter au moins 2.
  const q1 = await adm('POST', '/api/academy/admin/questions', {
    formation: NEUVE, moduleId: idM1, enonce: 'Question neuve 1 ?',
    choix: [{ texte: 'Bonne', correct: true }, { texte: 'Mauvaise', correct: false }],
  });
  assert.strictEqual(q1.status, 200, JSON.stringify(q1.body));
  assert.strictEqual(q1.body.question.choix.length, 2);

  // -- Ordonner. On inverse les deux modules, puis on relit.
  const ordre = await adm('POST', '/api/academy/admin/ordre',
    { formation: NEUVE, type: 'module', ids: [idM2, idM1] });
  assert.strictEqual(ordre.status, 200);
  assert.deepStrictEqual(ordre.body.arbre.modules.map((m) => m.id), [idM2, idM1]);
  await adm('POST', '/api/academy/admin/ordre', { formation: NEUVE, type: 'module', ids: [idM1, idM2] });

  // -- Publier : refusé, il manque une question sur les deux demandées.
  const tot = await publier(NEUVE);
  assert.strictEqual(tot.status, 409);
  assert.match(tot.body.verification.blocages.join(' '), /banque/, JSON.stringify(tot.body.verification));

  const q2 = await adm('POST', '/api/academy/admin/questions', {
    formation: NEUVE, enonce: 'Question neuve 2 ?',
    choix: [{ texte: 'Oui', correct: true }, { texte: 'Non', correct: false }],
  });
  assert.strictEqual(q2.status, 200);

  // -- Publier, pour de bon.
  const pub = await publier(NEUVE);
  assert.strictEqual(pub.status, 200, JSON.stringify(pub.body));
  assert.strictEqual(pub.body.formation.actif, true);
  assert.strictEqual(pub.body.verification.publiable, true);
  assert.deepStrictEqual(pub.body.verification.blocages, []);

  // Et le collaborateur la voit enfin.
  const cat = await api('GET', '/api/academy/formations', null, jetons[THEO]);
  assert.ok(cat.body.formations.some((f) => f.cle === NEUVE), 'publiée, elle entre au catalogue');
});

// ===========================================================================
//  2. LE BROUILLON EST INVISIBLE
// ===========================================================================

test('un brouillon n\'existe pour aucun collaborateur', async () => {
  const BR = 'formation_brouillon';
  await adm('POST', '/api/academy/admin/formations', { cle: BR, libelle: 'En construction', titre: 'T' });
  const m = await adm('POST', '/api/academy/admin/modules', { formation: BR, titre: 'Module secret' });
  const c = await adm('POST', '/api/academy/admin/contenus',
    { formation: BR, moduleId: m.body.module.id, titre: 'Vidéo secrète', youtubeId: 'SECRETaa001' });
  const idContenu = c.body.contenu.id;

  // 1. Pas au catalogue.
  const cat = await api('GET', '/api/academy/formations', null, jetons[THEO]);
  assert.ok(!cat.body.formations.some((f) => f.cle === BR), 'un brouillon ne s\'affiche pas au catalogue');

  // 2. Pas atteignable en nommant sa clé — sur AUCUNE des routes de formation.
  for (const route of ['/api/academy/formation', '/api/academy/qcm', '/api/academy/pratique']) {
    const r = await api('GET', `${route}?formation=${BR}`, null, jetons[THEO]);
    assert.strictEqual(r.status, 404, `${route} laisse entrer dans un brouillon`);
  }
  const dem = await api('POST', '/api/academy/qcm/tentatives', { formation: BR }, jetons[THEO]);
  assert.strictEqual(dem.status, 404, 'on n\'ouvre pas le QCM d\'un brouillon');

  // 3. LA PORTE DÉROBÉE : un identifiant de contenu se devine. Cette route ne
  //    prend aucune clé de formation — c'était le seul chemin restant.
  const direct = await api('GET', `/api/academy/contenus/${idContenu}`, null, jetons[THEO]);
  assert.strictEqual(direct.status, 404, 'un contenu de brouillon reste invisible par son identifiant');
  assert.ok(!direct.txt.includes('SECRETaa001'), 'et sa vidéo ne fuit pas');
  const ouvrir = await api('POST', `/api/academy/contenus/${idContenu}/ouvrir`, {}, jetons[THEO]);
  assert.strictEqual(ouvrir.status, 404);
  const terminer = await api('POST', `/api/academy/contenus/${idContenu}/terminer`, {}, jetons[THEO]);
  assert.strictEqual(terminer.status, 404, 'on ne valide pas un contenu qui n\'existe pas encore');

  // 4. L'administrateur, lui, travaille dessus normalement.
  const vu = await arbreDe(BR);
  assert.strictEqual(vu.formation.cle, BR);
  assert.strictEqual(vu.modules.length, 1);
  assert.strictEqual(vu.verification.publiee, false);
});

test('dépublier retire du catalogue sans rien effacer', async () => {
  // Théo suit la formation neuve, puis elle est dépubliée.
  const f = await api('GET', `/api/academy/formation?formation=${NEUVE}`, null, jetons[THEO]);
  const premier = f.body.formation.modules.flatMap((m) => m.contenus)[0];
  await api('POST', `/api/academy/contenus/${premier.id}/terminer`, {}, jetons[THEO]);

  const dep = await adm('POST', `/api/academy/admin/formations/${NEUVE}/depublier`);
  assert.strictEqual(dep.status, 200);
  const cat = await api('GET', '/api/academy/formations', null, jetons[THEO]);
  assert.ok(!cat.body.formations.some((f_) => f_.cle === NEUVE), 'dépubliée, elle sort du catalogue');

  // Rien n'est perdu : la progression est toujours en base.
  const reste = dbq().prepare('SELECT COUNT(*) AS n FROM academy_vus WHERE email = ? AND contenu_id = ?')
    .get(THEO, premier.id).n;
  assert.strictEqual(reste, 1, 'dépublier n\'efface aucune progression');

  // Et republier la rend telle qu'elle était.
  assert.strictEqual((await publier(NEUVE)).status, 200);
  const apres = await api('GET', `/api/academy/formation?formation=${NEUVE}`, null, jetons[THEO]);
  assert.strictEqual(apres.body.formation.termines, 1, 'la progression retrouvée intacte');
});

// ===========================================================================
//  3. ON NE PUBLIE PAS L'INFRANCHISSABLE
//
//  Chaque incohérence est éprouvée SÉPARÉMENT, sur sa propre formation : un
//  test qui les mélangerait ne dirait pas laquelle est réellement détectée.
// ===========================================================================

// Pose une formation minimale et publiable, puis laisse l'appelant la casser.
let compteur = 0;
async function formationJetable(reglages) {
  const cle = `jetable_${++compteur}`;
  await adm('POST', '/api/academy/admin/formations', {
    cle, libelle: 'Jetable ' + compteur, titre: 'Titre jetable',
    qcmNbQuestions: 1, qcmSeuilPct: 50, pratiqueObligatoire: false, certificationActive: true,
    ...(reglages || {}),
  });
  const m = await adm('POST', '/api/academy/admin/modules', { formation: cle, titre: 'Module jetable' });
  const c = await adm('POST', '/api/academy/admin/contenus',
    { formation: cle, moduleId: m.body.module.id, titre: 'Vidéo jetable', youtubeId: 'JETABLEaa01' });
  const q = await adm('POST', '/api/academy/admin/questions', {
    formation: cle, enonce: 'Question jetable ?',
    choix: [{ texte: 'Oui', correct: true }, { texte: 'Non', correct: false }],
  });
  return { cle, moduleId: m.body.module.id, contenuId: c.body.contenu.id, questionId: q.body.question.id };
}

test('publication refusée : aucun module actif', async () => {
  const f = await formationJetable();
  assert.strictEqual((await publier(f.cle)).status, 200, 'elle était publiable au départ');
  await adm('POST', `/api/academy/admin/formations/${f.cle}/depublier`);
  await adm('POST', '/api/academy/admin/archiver', { formation: f.cle, type: 'module', id: f.moduleId, actif: false });

  const r = await publier(f.cle);
  assert.strictEqual(r.status, 409);
  assert.match(r.body.verification.blocages.join(' '), /Aucun module actif/);
});

test('publication refusée : aucun contenu actif', async () => {
  const f = await formationJetable();
  await adm('POST', '/api/academy/admin/archiver', { formation: f.cle, type: 'contenu', id: f.contenuId, actif: false });
  const r = await publier(f.cle);
  assert.strictEqual(r.status, 409);
  assert.match(r.body.verification.blocages.join(' '), /Aucun contenu actif/);
});

test('publication refusée : une vidéo sans identifiant', async () => {
  const f = await formationJetable();
  const maj = await adm('POST', '/api/academy/admin/contenus',
    { formation: f.cle, id: f.contenuId, titre: 'Vidéo jetable', youtubeId: '' });
  assert.strictEqual(maj.status, 200, 'une vidéo sans lien se SAISIT — elle empêche seulement de publier');
  const r = await publier(f.cle);
  assert.strictEqual(r.status, 409);
  assert.match(r.body.verification.blocages.join(' '), /identifiant YouTube/);
});

test('publication refusée : un contenu écrit vide', async () => {
  const f = await formationJetable();
  await adm('POST', '/api/academy/admin/contenus',
    { formation: f.cle, id: f.contenuId, type: 'texte', titre: 'Fiche vide', texte: '' });
  const r = await publier(f.cle);
  assert.strictEqual(r.status, 409);
  assert.match(r.body.verification.blocages.join(' '), /est vide/);
});

test('publication refusée : la banque est plus courte que le tirage', async () => {
  const f = await formationJetable({ qcmNbQuestions: 5 });
  const r = await publier(f.cle);
  assert.strictEqual(r.status, 409);
  const b = r.body.verification.blocages.join(' ');
  assert.match(b, /5 questions/);
  assert.match(b, /1 d'exploitable/, 'le refus dit CE QUI manque : ' + b);
});

test('publication refusée : une question sans corrigé ne compte pas dans la banque', async () => {
  const f = await formationJetable({ qcmNbQuestions: 2 });
  // Une seconde question DÉSACTIVÉE : elle est en base, elle ne compte pas.
  const q = await adm('POST', '/api/academy/admin/questions', {
    formation: f.cle, enonce: 'Question dormante ?',
    choix: [{ texte: 'A', correct: true }, { texte: 'B', correct: false }],
  });
  await adm('POST', '/api/academy/admin/archiver',
    { formation: f.cle, type: 'question', id: q.body.question.id, actif: false });
  const r = await publier(f.cle);
  assert.strictEqual(r.status, 409, 'une question archivée n\'est pas une question tirable');

  // Réactivée, elle compte — et la formation passe.
  await adm('POST', '/api/academy/admin/archiver',
    { formation: f.cle, type: 'question', id: q.body.question.id, actif: true });
  assert.strictEqual((await publier(f.cle)).status, 200);
});

test('publication refusée : certifie sans porter de titre', async () => {
  // `definir()` refuse déjà de créer une telle formation. On reproduit donc la
  // ligne héritée à la main : c'est exactement le cas que la vérification doit
  // rattraper — une donnée d'avant la règle.
  const f = await formationJetable();
  dbq().prepare('UPDATE academy_formations SET titre_certifie = NULL WHERE cle = ?').run(f.cle);
  const r = await publier(f.cle);
  assert.strictEqual(r.status, 409);
  assert.match(r.body.verification.blocages.join(' '), /titre de certification/);
});

test('une question incorrigeable est refusée à la saisie, pas écartée en silence', async () => {
  const f = await formationJetable();
  const base_ = { formation: f.cle, enonce: 'Question bancale ?' };
  const cas = [
    { choix: [{ texte: 'Seule', correct: true }], attendu: /au moins 2 réponses/ },
    { choix: [{ texte: 'A', correct: false }, { texte: 'B', correct: false }], attendu: /au moins une bonne réponse/ },
    { choix: [{ texte: 'A', correct: true }, { texte: 'B', correct: true }], attendu: /au moins une mauvaise réponse/ },
  ];
  for (const c of cas) {
    const r = await adm('POST', '/api/academy/admin/questions', { ...base_, choix: c.choix });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.match(r.body.error, c.attendu);
  }
  // Rien n'a été écrit : le refus est complet, pas partiel.
  const arbre = await arbreDe(f.cle);
  assert.strictEqual(arbre.questions.length, 1, 'une question refusée ne laisse pas de trace');
});

test('les avertissements ne bloquent pas, et ils sont nommés', async () => {
  const f = await formationJetable({ qcmNbQuestions: 1, pratiqueObligatoire: true });
  const v = await verifDe(f.cle);
  assert.strictEqual(v.publiable, true, 'un avertissement n\'est pas un refus');
  const a = v.avertissements.join(' ');
  assert.match(a, /même questionnaire/, 'banque sans marge : ' + a);
  assert.match(a, /aucun évaluateur/, 'pratique exigée sans évaluateur : ' + a);
  assert.strictEqual((await publier(f.cle)).status, 200);
});

// ===========================================================================
//  4. LE CORRIGÉ NE FUIT PAS — le point de sécurité du lot
// ===========================================================================

// Cherche récursivement une marque de corrigé dans n'importe quelle réponse.
function marquesDeCorrige(valeur, chemin = '$', trouve = []) {
  if (valeur === null || typeof valeur !== 'object') return trouve;
  if (Array.isArray(valeur)) {
    valeur.forEach((v, i) => marquesDeCorrige(v, `${chemin}[${i}]`, trouve));
    return trouve;
  }
  for (const [k, v] of Object.entries(valeur)) {
    if (/^correct/i.test(k) || /correct_json|correctJson/i.test(k)) trouve.push(`${chemin}.${k}`);
    marquesDeCorrige(v, `${chemin}.${k}`, trouve);
  }
  return trouve;
}

test('le corrigé sort de l\'administration, et de là seulement', async () => {
  const arbre = await arbreDe(COACH_NUTRITION);
  const q = arbre.questions.find((x) => x.choix.length);
  assert.ok(q, 'l\'administration voit bien la banque');
  assert.ok(q.choix.some((c) => c.correct === true), 'et elle voit le corrigé — c\'est son travail');
  assert.strictEqual(typeof q.tirable, 'boolean');
});

test('AUCUNE route collaborateur ne laisse passer le corrigé, tentative en cours comprise', async () => {
  // On met Théo dans la position la plus favorable à une fuite : formation
  // achevée, tentative de QCM OUVERTE, une réponse déjà donnée.
  const f = (await api('GET', '/api/academy/formation', null, jetons[THEO])).body.formation;
  for (const c of f.modules.flatMap((m) => m.contenus)) {
    await api('POST', `/api/academy/contenus/${c.id}/terminer`, {}, jetons[THEO]);
  }
  const t = (await api('POST', '/api/academy/qcm/tentatives', {}, jetons[THEO])).body.tentative;
  assert.ok(t && t.questions.length, 'la tentative est bien ouverte');
  await api('PUT', `/api/academy/qcm/tentatives/${t.id}/reponses/${t.questions[0].id}`,
    { choix: [t.questions[0].choix[0].id] }, jetons[THEO]);

  const routes = [
    '/api/academy/moi',
    '/api/academy/formations',
    '/api/academy/formation',
    `/api/academy/contenus/${f.modules[0].contenus[0].id}`,
    '/api/academy/qcm',
    `/api/academy/qcm/tentatives/${t.id}`,
    '/api/academy/pratique',
    '/api/academy/certification',
  ];

  for (const route of routes) {
    const r = await api('GET', route, null, jetons[THEO]);
    assert.strictEqual(r.status, 200, `${route} : ${r.status}`);
    const fuites = marquesDeCorrige(r.body);
    assert.deepStrictEqual(fuites, [], `${route} laisse sortir le corrigé en ${fuites.join(', ')}`);
    // Ceinture et bretelles : on cherche aussi la chaîne brute, au cas où une
    // marque voyagerait sous un autre nom de clé.
    assert.ok(!/"correct"|correct_json/.test(r.txt), `${route} : ${r.txt.slice(0, 300)}`);
  }

  // Et le corrigé figé de SA tentative reste hors de portée. On le juge sur la
  // FORME de ce qui sort, pas sur une recherche de texte : `correct_json` est
  // une liste d'identifiants de choix, et ces identifiants ont toutes les
  // raisons d'apparaître ailleurs — à commencer par la réponse que le
  // collaborateur vient lui-même de donner. Seule la forme est concluante.
  const fige = dbq().prepare('SELECT correct_json AS c FROM academy_tentative_questions WHERE tentative_id = ? LIMIT 1').get(t.id);
  assert.ok(fige && fige.c && fige.c !== '[]', 'le corrigé figé existe bien en base');

  const vue = await api('GET', `/api/academy/qcm/tentatives/${t.id}`, null, jetons[THEO]);
  const CHAMPS_QUESTION = ['id', 'position', 'enonce', 'multiple', 'moduleTitre', 'choix', 'reponse'];
  for (const q of vue.body.tentative.questions) {
    assert.deepStrictEqual(Object.keys(q).sort(), [...CHAMPS_QUESTION].sort(),
      'la vue d\'une question a gagné un champ : est-il inoffensif ?');
    for (const c of q.choix) {
      // UN CHOIX N'EST QU'UN IDENTIFIANT ET UN TEXTE. Tout champ de plus serait
      // à examiner : c'est par là qu'un corrigé sortirait.
      assert.deepStrictEqual(Object.keys(c).sort(), ['id', 'texte'],
        'un choix porte autre chose que son identifiant et son texte');
    }
    // La réponse renvoyée est celle du collaborateur, et rien d'autre : elle ne
    // doit contenir que des identifiants de SES propres choix.
    assert.ok(q.reponse.every((id) => q.choix.some((c) => c.id === id)),
      'la réponse renvoyée déborde des choix de la question');
  }

  // Une tentative SOUMISE non plus : le résultat annonce un score et des
  // modules à revoir, jamais le détail question par question.
  for (const q of vue.body.tentative.questions) {
    await api('PUT', `/api/academy/qcm/tentatives/${t.id}/reponses/${q.id}`,
      { choix: [q.choix[0].id] }, jetons[THEO]);
  }
  const fin = await api('POST', `/api/academy/qcm/tentatives/${t.id}/terminer`, {}, jetons[THEO]);
  assert.strictEqual(fin.status, 200);
  assert.deepStrictEqual(marquesDeCorrige(fin.body), [], 'le corrigé sort à la soumission');
  const relue = await api('GET', `/api/academy/qcm/tentatives/${t.id}`, null, jetons[THEO]);
  assert.deepStrictEqual(marquesDeCorrige(relue.body), [], 'le corrigé sort une fois la tentative close');
  for (const q of relue.body.tentative.questions) {
    assert.ok(!('correcte' in q), 'la vue dit question par question ce qui était juste');
  }
});

test('toutes les routes d\'administration sont fermées à un collaborateur et à une cliente', async () => {
  const gestes = [
    ['GET', '/api/academy/admin/formations', null],
    ['POST', '/api/academy/admin/formations', { cle: 'pirate', libelle: 'Pirate', titre: 'P' }],
    ['PUT', `/api/academy/admin/formations/${COACH_NUTRITION}`, { libelle: 'Détourné' }],
    ['POST', `/api/academy/admin/formations/${COACH_NUTRITION}/publier`, {}],
    ['POST', `/api/academy/admin/formations/${COACH_NUTRITION}/depublier`, {}],
    ['GET', '/api/academy/admin/arbre', null],
    ['POST', '/api/academy/admin/modules', { titre: 'Pirate' }],
    ['POST', '/api/academy/admin/contenus', { titre: 'Pirate' }],
    ['POST', '/api/academy/admin/questions', { enonce: 'Pirate ?', choix: [] }],
    ['POST', '/api/academy/admin/archiver', { type: 'module', id: 1, actif: false }],
    ['POST', '/api/academy/admin/ordre', { type: 'module', ids: [1] }],
  ];
  for (const qui of [THEO, LEA]) {
    for (const [m, route, corps] of gestes) {
      const r = await api(m, route, corps, jetons[qui]);
      assert.strictEqual(r.status, 403, `${m} ${route} ouverte à ${qui} (${r.status})`);
      assert.ok(!/"correct"/.test(r.txt), `${m} ${route} : fuite dans le refus`);
    }
    // Sans jeton du tout non plus.
    const nu = await api('GET', '/api/academy/admin/arbre', null, null);
    assert.ok(nu.status === 401 || nu.status === 403, 'route ouverte sans jeton');
  }
  // Et rien n'a bougé.
  assert.strictEqual(app.academyFormations.lire(COACH_NUTRITION).libelle, 'Coach Nutrition');
});

test('l\'écran d\'administration n\'écrit aucun corrigé dans une vue collaborateur', () => {
  // Le corrigé n'existe côté navigateur que dans l'onglet d'administration.
  // On vérifie que la variable qui le porte n'alimente que lui.
  assert.ok(js.includes('adminArbre'), 'l\'arbre d\'administration a bien son propre état');
  const sommaire = js.slice(js.indexOf('function rendreSommaire'), js.indexOf('function rendreLecteur'));
  assert.ok(!/adminArbre|\.correct\b/.test(sommaire), 'le sommaire du collaborateur touche au corrigé');
  const qcmEcran = js.slice(js.indexOf('function rendreQcm'), js.indexOf('function rendreResultat'));
  assert.ok(!/adminArbre|\.correct\b/.test(qcmEcran), 'l\'écran de QCM touche au corrigé');
});

// ===========================================================================
//  5. LE CLOISONNEMENT TIENT PAR LA PORTE DE L'ADMINISTRATION
// ===========================================================================

test('rien ne traverse une formation', async () => {
  const a = await formationJetable();
  const b = await formationJetable();

  // 1. Déplacer un contenu de A vers un module de B.
  const deplace = await adm('POST', '/api/academy/admin/contenus',
    { formation: a.cle, id: a.contenuId, moduleId: b.moduleId, titre: 'Volée' });
  assert.strictEqual(deplace.status, 400);
  assert.match(deplace.body.error, /autre formation/);

  // 2. Rattacher une question de A au module de B.
  const question = await adm('POST', '/api/academy/admin/questions', {
    formation: a.cle, moduleId: b.moduleId, enonce: 'Question qui traverse ?',
    choix: [{ texte: 'Oui', correct: true }, { texte: 'Non', correct: false }],
  });
  assert.strictEqual(question.status, 400);
  assert.match(question.body.error, /autre formation/);

  // 3. Ordonner ensemble des modules de deux formations.
  const ordre = await adm('POST', '/api/academy/admin/ordre',
    { formation: a.cle, type: 'module', ids: [a.moduleId, b.moduleId] });
  assert.strictEqual(ordre.status, 400);
  assert.match(ordre.body.error, /même ensemble/);

  // 4. Un module ne change pas de formation, même si on le lui demande.
  await adm('POST', '/api/academy/admin/modules',
    { formation: b.cle, id: a.moduleId, titre: 'Module rebaptisé' });
  const arbreA = await arbreDe(a.cle);
  assert.ok(arbreA.modules.some((m) => m.id === a.moduleId && m.titre === 'Module rebaptisé'),
    'le module est renommé...');
  const arbreB = await arbreDe(b.cle);
  assert.ok(!arbreB.modules.some((m) => m.id === a.moduleId), '...mais il n\'a pas déménagé');

  // 5. Les banques restent étanches.
  assert.ok((await arbreDe(a.cle)).questions.every((q) => q.enonce !== 'Question qui traverse ?'));
});

test('une formation inconnue est refusée, même à l\'administrateur', async () => {
  const r = await adm('GET', '/api/academy/admin/arbre?formation=fantome');
  assert.strictEqual(r.status, 404);
  const m = await adm('POST', '/api/academy/admin/modules', { formation: 'fantome', titre: 'X' });
  assert.strictEqual(m.status, 404);
});

// ===========================================================================
//  6. ON N'EFFACE JAMAIS
// ===========================================================================

test('archiver un contenu déjà terminé ne touche pas à la progression', async () => {
  const f = await formationJetable();
  await publier(f.cle);
  await api('POST', `/api/academy/contenus/${f.contenuId}/terminer`, {}, jetons[THEO]);
  const avant = dbq().prepare('SELECT termine_le AS t FROM academy_vus WHERE email = ? AND contenu_id = ?')
    .get(THEO, f.contenuId);
  assert.ok(avant && avant.t, 'le contenu est bien terminé');

  await adm('POST', '/api/academy/admin/archiver',
    { formation: f.cle, type: 'contenu', id: f.contenuId, actif: false });

  const apres = dbq().prepare('SELECT termine_le AS t FROM academy_vus WHERE email = ? AND contenu_id = ?')
    .get(THEO, f.contenuId);
  assert.deepStrictEqual(apres, avant, 'archiver a effacé une progression');

  // Restaurer le remet exactement à sa place.
  await adm('POST', '/api/academy/admin/archiver',
    { formation: f.cle, type: 'contenu', id: f.contenuId, actif: true });
  const vue = await api('GET', `/api/academy/formation?formation=${f.cle}`, null, jetons[THEO]);
  const c = vue.body.formation.modules.flatMap((m) => m.contenus).find((x) => x.id === f.contenuId);
  assert.ok(c && c.termine, 'restauré, il est toujours terminé');
});

test('réécrire une question ne réécrit aucune tentative passée', async () => {
  const f = await formationJetable();
  await publier(f.cle);
  const vue = await api('GET', `/api/academy/formation?formation=${f.cle}`, null, jetons[THEO]);
  for (const c of vue.body.formation.modules.flatMap((m) => m.contenus)) {
    await api('POST', `/api/academy/contenus/${c.id}/terminer`, {}, jetons[THEO]);
  }
  const t = (await api('POST', '/api/academy/qcm/tentatives', { formation: f.cle }, jetons[THEO])).body.tentative;
  const enonceFige = t.questions[0].enonce;

  // L'administrateur change tout : énoncé et corrigé.
  const maj = await adm('POST', '/api/academy/admin/questions', {
    formation: f.cle, id: f.questionId, enonce: 'Énoncé entièrement réécrit ?',
    choix: [{ texte: 'Nouvelle bonne', correct: true }, { texte: 'Nouvelle mauvaise', correct: false }],
  });
  assert.strictEqual(maj.status, 200);

  const relue = await api('GET', `/api/academy/qcm/tentatives/${t.id}`, null, jetons[THEO]);
  assert.strictEqual(relue.body.tentative.questions[0].enonce, enonceFige,
    'la tentative en cours a suivi la banque : elle devait rester figée');
});

// ===========================================================================
//  7. L'ÉCRAN
// ===========================================================================

test('l\'onglet Contenus rejoint les deux autres, sans page de plus', () => {
  // LOT 7 : l'onglet Certifications a quitté l'administration pour rejoindre
  // « Évaluer & certifier », auprès de l'évaluation qu'il conclut. Il en reste
  // deux ici — les droits d'évaluer, et les contenus.
  assert.ok(/'evaluateurs', 'contenus'/.test(js),
    'l\'administration doit porter les deux onglets restants');
  assert.ok(!/'evaluateurs', 'certifications', 'contenus'/.test(js),
    'l\'onglet Certifications ne doit plus être ici');
  // Le lot 6 vit dans #acAdmin et n'ajoute AUCUNE section. Le compte est passé
  // de 5 à 6 avec le lot A, qui a ajouté #acAccueil — une section, et une
  // seule, pour l'écran d'accueil du collaborateur.
  const sections = [...html.matchAll(/<section id="(ac[A-Za-z]+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(sections,
    ['acAccueil', 'acSommaire', 'acLecteur', 'acQcm', 'acEval', 'acAdmin'],
    'la liste des écrans a changé sans décision : ' + sections.join(', '));
  assert.ok(sections.includes('acAdmin') && !sections.some((x) => /contenu/i.test(x)),
    'le lot 6 doit rester dans #acAdmin, sans écran à lui');
  assert.ok(js.includes('rendreAdminContenus'), 'l\'onglet a son rendu');
});

test('l\'écran d\'administration reste lisible à 390 px', () => {
  // La règle mobile doit exister pour les nouveaux blocs, comme pour les
  // listes de l'onglet Évaluateurs.
  assert.ok(css.includes('.ac-adm-arbre'), 'les blocs du lot 6 ont leur style');
  const mobile = css.slice(css.indexOf('@media (max-width: 520px)'));
  assert.ok(/ac-adm-form|ac-adm-arbre|ac-adm-ligne/.test(mobile),
    'aucune règle mobile pour l\'administration des contenus');
});

test('rien ne publie depuis l\'écran sans passer par la route vérifiée', async () => {
  // 1. Sur le CODE : l'écran ne pose jamais `actif` lui-même. Publier est un
  //    geste du serveur, qui vérifie ; le glisser dans un enregistrement de
  //    réglages contournerait la vérification.
  const bloc = js.slice(js.indexOf('// --- Administration : contenus'), js.indexOf('// --- Connexion'));
  assert.ok(bloc.length > 1000, 'le bloc du lot 6 doit être délimité');
  // Les deux seuls endroits qui écrivent la FORMATION : créer et régler. Ni
  // l'un ni l'autre ne doit porter `actif` — c'est par là que la vérification
  // se contournerait. (L'archivage d'un module ou d'une question porte lui
  // aussi un `actif`, mais c'est un tout autre drapeau : celui d'une ligne de
  // contenu, pas celui de la publication.)
  // Commentaires retirés : on juge le code, pas ce qu'il dit de lui-même.
  const sansCommentaires = (t) => t.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  const ecritFormation = sansCommentaires(
    bloc.slice(bloc.indexOf("geste === 'formation-creer'"), bloc.indexOf("geste === 'publier'")));
  assert.ok(ecritFormation.length > 200, 'les deux écritures de formation doivent être délimitées');
  assert.ok(!/\bactif\b/.test(ecritFormation),
    'l\'écran envoie `actif` en créant ou en réglant : il court-circuiterait la vérification');
  assert.ok(/data-adm="publier"/.test(bloc) && /data-adm="depublier"/.test(bloc), 'les deux gestes existent');
  assert.ok(bloc.includes("'/' + geste"), 'et ils passent par leur propre route');

  // 2. Sur le SERVEUR, qui reste seul juge : même en envoyant `actif` à la
  //    main, ni la création ni les réglages ne publient.
  const cle = 'jetable_actif_force';
  const c = await adm('POST', '/api/academy/admin/formations',
    { cle, libelle: 'Forcée', titre: 'T', actif: true, qcmNbQuestions: 1 });
  assert.strictEqual(c.body.formation.actif, false);
  const p = await adm('PUT', `/api/academy/admin/formations/${cle}`, { libelle: 'Forcée', titre: 'T', actif: true });
  assert.strictEqual(p.body.formation.actif, false, 'un réglage ne publie pas, même en le demandant');
});

// ===========================================================================
//  7. LES MINI-QCM SE CONSTITUENT DEPUIS L'ÉCRAN
//
//  Le moteur savait déjà ranger une question dans l'une ou l'autre épreuve :
//  `definirQuestion` accepte `usage`, et la route le passe tel quel. L'ÉCRAN,
//  LUI, NE L'ENVOYAIT PAS. Toute question saisie partait donc en « finale » —
//  et comme le tirage final n'écarte pas les questions rattachées à un module,
//  elle atterrissait dans l'examen. Les mini-QCM étaient inaccessibles sans
//  passer par un fichier d'amorçage : c'est exactement ce que ce lot ferme.
// ===========================================================================

test('une question « mini » se range dans la banque de SON module, jamais dans le QCM final', async () => {
  const f = await formationJetable();
  const r = await adm('POST', '/api/academy/admin/questions', {
    formation: f.cle, usage: 'mini', moduleId: f.moduleId, enonce: 'Mini du module ?',
    choix: [{ texte: 'Oui', correct: true }, { texte: 'Non', correct: false }],
  });
  assert.strictEqual(r.status, 200, r.txt.slice(0, 200));
  assert.strictEqual(r.body.question.usage, 'mini');

  const mini = app.academyQcm.questionsEligibles(f.cle, { usage: 'mini', moduleId: f.moduleId });
  assert.deepStrictEqual(mini.map((q) => q.enonce), ['Mini du module ?']);

  // Et surtout : elle n'a PAS rejoint l'examen.
  const finale = app.academyQcm.questionsEligibles(f.cle, { usage: 'finale' });
  assert.ok(!finale.some((q) => q.enonce === 'Mini du module ?'),
    'une question de mini-QCM ne doit jamais entrer dans le tirage final');
});

test('un mini-QCM sans module est refusé À LA SAISIE, jamais rangé sans être tirable', async () => {
  const f = await formationJetable();
  const r = await adm('POST', '/api/academy/admin/questions', {
    formation: f.cle, usage: 'mini', enonce: 'Mini sans module ?',
    choix: [{ texte: 'Oui', correct: true }, { texte: 'Non', correct: false }],
  });
  assert.strictEqual(r.status, 400);
  assert.match(r.body.error, /module/i);
  // Rien n'a été écrit : une question qui existerait en base sans exister à
  // aucune épreuve serait invisible et indébogable.
  const n = dbq().prepare("SELECT COUNT(*) AS n FROM academy_questions WHERE formation = ? AND usage = 'mini'")
    .get(f.cle).n;
  assert.strictEqual(n, 0);
});

test('une épreuve absente vaut « finale » : une saisie muette ne change pas de sens', async () => {
  const f = await formationJetable();
  const r = await adm('POST', '/api/academy/admin/questions', {
    formation: f.cle, moduleId: f.moduleId, enonce: 'Sans épreuve précisée ?',
    choix: [{ texte: 'Oui', correct: true }, { texte: 'Non', correct: false }],
  });
  assert.strictEqual(r.body.question.usage, 'finale',
    'le défaut du serveur doit rester « finale », écran ou pas');
});

test('basculer une question de finale à mini la RETIRE du tirage final', async () => {
  const f = await formationJetable();
  const avant = app.academyQcm.questionsEligibles(f.cle, { usage: 'finale' }).length;
  assert.ok(avant >= 1, 'la formation jetable naît avec une question finale');

  // L'énoncé se renvoie à chaque écriture : `definirQuestion` l'exige, et
  // l'écran le renvoie toujours puisque son formulaire est prérempli.
  const r = await adm('POST', '/api/academy/admin/questions', {
    formation: f.cle, id: f.questionId, usage: 'mini', moduleId: f.moduleId,
    enonce: 'Question jetable ?',
  });
  assert.strictEqual(r.status, 200, r.txt.slice(0, 200));
  assert.strictEqual(r.body.question.usage, 'mini');

  assert.strictEqual(app.academyQcm.questionsEligibles(f.cle, { usage: 'finale' }).length, avant - 1);
  assert.strictEqual(app.academyQcm.questionsEligibles(f.cle, { usage: 'mini', moduleId: f.moduleId }).length, 1);
  // Le corrigé n'a pas été perdu au passage : changer d'épreuve n'est pas
  // réécrire les réponses.
  const choix = dbq().prepare('SELECT COUNT(*) AS n FROM academy_choix WHERE question_id = ?').get(f.questionId).n;
  assert.strictEqual(choix, 2);
});

test('UNE FORMATION À MINI-QCM SE PUBLIE SANS AUCUN FICHIER, par les seules routes', async () => {
  // Le vrai test du lot : constituer un mini complet à la main, et vérifier
  // que la vérification de publication cesse de le refuser.
  const f = await formationJetable({ qcmNbQuestions: 2, miniNbQuestions: 3 });
  await adm('POST', '/api/academy/admin/questions', {
    formation: f.cle, enonce: 'Deuxième finale ?',
    choix: [{ texte: 'Oui', correct: true }, { texte: 'Non', correct: false }],
  });

  // Deux minis sur trois demandés : la publication doit être REFUSÉE, et le
  // dire en nommant le module.
  for (const n of [1, 2]) {
    await adm('POST', '/api/academy/admin/questions', {
      formation: f.cle, usage: 'mini', moduleId: f.moduleId, enonce: `Mini ${n} ?`,
      choix: [{ texte: 'Oui', correct: true }, { texte: 'Non', correct: false }],
    });
  }
  const court = await verifDe(f.cle);
  assert.strictEqual(court.publiable, false);
  assert.ok(court.blocages.some((b) => /mini-QCM.*Module jetable/i.test(b)),
    'le refus doit nommer le module en défaut : ' + JSON.stringify(court.blocages));

  // La troisième complète la banque : la formation devient publiable.
  await adm('POST', '/api/academy/admin/questions', {
    formation: f.cle, usage: 'mini', moduleId: f.moduleId, enonce: 'Mini 3 ?',
    choix: [{ texte: 'Oui', correct: true }, { texte: 'Non', correct: false }],
  });
  const v = await verifDe(f.cle);
  assert.strictEqual(v.publiable, true, 'blocages restants : ' + JSON.stringify(v.blocages));
  assert.strictEqual(v.chiffres.modulesAvecMini, 1);
  assert.strictEqual(v.chiffres.miniNbQuestions, 3);

  const p = await publier(f.cle);
  assert.strictEqual(p.status, 200, p.txt.slice(0, 200));
  assert.strictEqual(p.body.formation.actif, true);
});

test('l\'ÉCRAN envoie l\'épreuve, et refuse un mini sans module avant d\'écrire', () => {
  // 1. Le champ existe, avec ses deux valeurs et aucune autre.
  assert.ok(/id="acQUsage"/.test(js), 'le formulaire doit porter le choix de l\'épreuve');
  assert.ok(/value="mini"/.test(js) && /value="finale"/.test(js), 'les deux épreuves doivent être proposées');

  // 2. Le geste l'envoie. Sans cette ligne, tout repart en « finale » et le lot
  //    ne sert à rien — c'était précisément l'état d'avant.
  const bloc = js.slice(js.indexOf("geste === 'question-enregistrer'"), js.indexOf("geste === 'basculer'"));
  assert.ok(bloc.length > 100, 'le geste doit être délimité');
  assert.ok(/usage/.test(bloc), 'l\'écran doit envoyer l\'épreuve saisie');
  assert.ok(/'#acQUsage'/.test(bloc), 'et la lire dans le champ');

  // 3. Il garde la règle du serveur au lieu de la découvrir par un refus : un
  //    aller-retour perdrait six réponses déjà tapées.
  assert.ok(/'mini'/.test(bloc) && /module/i.test(bloc),
    'l\'écran doit refuser un mini sans module avant l\'envoi');
});

test('la banque s\'affiche PAR ÉPREUVE : un module à court se voit sans être cherché', () => {
  const bloc = js.slice(js.indexOf('function rendreAdminContenus'), js.indexOf('function lireChoixSaisis'));
  assert.ok(/Mini-QCM, module par module/.test(bloc), 'les minis doivent avoir leur section');
  assert.ok(/QCM final/.test(bloc), 'l\'examen doit avoir la sienne');
  // Le tri se fait sur `usage`, pas sur la présence d'un module : une finale
  // rattachée à un module reste une finale, et doit le rester à l'écran.
  assert.ok(/usage === 'mini'/.test(bloc), 'le tri doit se faire sur l\'épreuve');
  assert.ok(/module d'introduction/.test(bloc),
    'un module sans mini est légitime : l\'écran doit le dire, pas laisser un blanc');
  // Le style du groupe existe, et il survit à 390 px.
  assert.ok(css.includes('.ac-adm-groupe'), 'les groupes ont leur style');
  const mobile = css.slice(css.indexOf('@media (max-width: 520px)'));
  assert.ok(/ac-adm-groupe/.test(mobile), 'aucune règle mobile pour les groupes de banque');
});

// ===========================================================================
//  8. LE RÉFÉRENTIEL D'ÉVALUATION S'ADMINISTRE
//
//  `academy_cas` existait, et l'évaluateur savait s'y référer — mais RIEN ne
//  savait y écrire : `academyPratique` n'exposait que des lectures. Un cas ne
//  pouvait naître que d'un fichier d'amorçage. C'est ce qui s'ouvre ici, avec
//  les deux règles du lot 6 intactes : on n'efface jamais, on ne traverse
//  jamais une formation.
// ===========================================================================

test('un cas se crée, se relit dans l\'arbre, et se modifie', async () => {
  const f = await formationJetable({ pratiqueObligatoire: true });
  const r = await adm('POST', '/api/academy/admin/cas', {
    formation: f.cle, titre: 'Corriger un squat en séance',
    consignes: 'SITUATION : le client compense. ATTENDU : une seule priorité.',
  });
  assert.strictEqual(r.status, 200, r.txt.slice(0, 200));
  assert.strictEqual(r.body.cas.titre, 'Corriger un squat en séance');
  assert.strictEqual(r.body.cas.ordre, 1, 'le premier cas prend le rang 1');
  assert.strictEqual(r.body.cas.actif, true);

  // L'arbre le porte, et l'écran n'a donc rien à redemander.
  const a = await arbreDe(f.cle);
  assert.deepStrictEqual((a.cas || []).map((c) => c.titre), ['Corriger un squat en séance']);

  const m = await adm('POST', '/api/academy/admin/cas', {
    formation: f.cle, id: r.body.cas.id, titre: 'Corriger un hip hinge', consignes: 'Autre consigne.',
  });
  assert.strictEqual(m.body.cas.titre, 'Corriger un hip hinge');
  assert.strictEqual((await arbreDe(f.cle)).cas.length, 1, 'modifier ne duplique pas');
});

test('un cas sans titre est refusé ; ses consignes restent facultatives', async () => {
  const f = await formationJetable({ pratiqueObligatoire: true });
  const vide = await adm('POST', '/api/academy/admin/cas', { formation: f.cle, titre: '   ' });
  assert.strictEqual(vide.status, 400);
  assert.match(vide.body.error, /titre/i);

  // Un intitulé seul suffit : c'est ce que dit le schéma, et l'évaluateur se
  // prononce alors en champ libre.
  const nu = await adm('POST', '/api/academy/admin/cas', { formation: f.cle, titre: 'Cas sans consignes' });
  assert.strictEqual(nu.status, 200);
  assert.strictEqual(nu.body.cas.consignes, null);
});

test('LES CAS S\'ORDONNENT ET S\'ARCHIVENT par les routes communes', async () => {
  const f = await formationJetable({ pratiqueObligatoire: true });
  const ids = [];
  for (const t of ['Premier', 'Deuxième', 'Troisième']) {
    const r = await adm('POST', '/api/academy/admin/cas', { formation: f.cle, titre: t });
    ids.push(r.body.cas.id);
  }
  assert.deepStrictEqual((await arbreDe(f.cle)).cas.map((c) => c.titre), ['Premier', 'Deuxième', 'Troisième']);

  // Réordonner : la liste entière, en une transaction.
  const o = await adm('POST', '/api/academy/admin/ordre', { formation: f.cle, type: 'cas', ids: [ids[2], ids[0], ids[1]] });
  assert.strictEqual(o.status, 200, o.txt.slice(0, 200));
  assert.deepStrictEqual((await arbreDe(f.cle)).cas.map((c) => c.titre), ['Troisième', 'Premier', 'Deuxième']);

  // Archiver : la ligne reste, l'évaluateur ne la voit plus.
  const arc = await adm('POST', '/api/academy/admin/archiver', { formation: f.cle, type: 'cas', id: ids[0], actif: false });
  assert.strictEqual(arc.status, 200, arc.txt.slice(0, 200));
  const apres = await arbreDe(f.cle);
  assert.strictEqual(apres.cas.length, 3, 'RIEN N\'EST EFFACÉ : l\'administration voit toujours les trois');
  assert.strictEqual(apres.cas.find((c) => c.id === ids[0]).actif, false);
  assert.deepStrictEqual(app.academyPratique.listerCas(f.cle).map((c) => c.id), [ids[2], ids[1]],
    'l\'évaluateur ne se voit plus proposer un cas archivé');

  // Et il se restaure.
  await adm('POST', '/api/academy/admin/archiver', { formation: f.cle, type: 'cas', id: ids[0], actif: true });
  assert.strictEqual(app.academyPratique.listerCas(f.cle).length, 3);
});

test('archiver un cas ne touche à AUCUNE évaluation déjà prononcée', async () => {
  const f = await formationJetable({ pratiqueObligatoire: true });
  const c = await adm('POST', '/api/academy/admin/cas', { formation: f.cle, titre: 'Cas évalué' });
  const casId = c.body.cas.id;

  // Pour qu'une évaluation existe, il faut la mériter : la formation doit être
  // PUBLIÉE, et la théorie du collaborateur VALIDÉE — l'évaluation pratique est
  // verrouillée derrière elle. On joue donc le parcours, comme un vrai coach.
  assert.strictEqual((await publier(f.cle)).status, 200);
  const vue = await api('GET', `/api/academy/formation?formation=${f.cle}`, null, jetons[THEO]);
  for (const ct of vue.body.formation.modules.flatMap((m) => m.contenus)) {
    await api('POST', `/api/academy/contenus/${ct.id}/terminer`, {}, jetons[THEO]);
  }
  const t = (await api('POST', '/api/academy/qcm/tentatives', { formation: f.cle }, jetons[THEO])).body.tentative;
  for (const q of t.questions) {
    // Le corrigé ne sort que par l'arbre d'administration : on le lit là, comme
    // seul un administrateur le peut.
    const ref = (await arbreDe(f.cle)).questions.find((x) => x.enonce === q.enonce);
    const bons = ref.choix.filter((c) => c.correct).map((c) => c.texte);
    await api('PUT', `/api/academy/qcm/tentatives/${t.id}/reponses/${q.id}`,
      { choix: q.choix.filter((c) => bons.includes(c.texte)).map((c) => c.id) }, jetons[THEO]);
  }
  const fin = await api('POST', `/api/academy/qcm/tentatives/${t.id}/terminer`, {}, jetons[THEO]);
  assert.strictEqual(fin.body.tentative.resultat.reussie, true, 'la théorie doit être validée');

  const ev = await adm('POST', `/api/academy/evaluateur/collaborateurs/${THEO}/evaluations`,
    { formation: f.cle, casId, resultat: 'valide', commentaire: 'Vu en séance.' });
  assert.strictEqual(ev.status, 201, ev.txt.slice(0, 200));

  const avant = dbq().prepare('SELECT COUNT(*) AS n FROM academy_evaluations WHERE cas_id = ?').get(casId).n;
  await adm('POST', '/api/academy/admin/archiver', { formation: f.cle, type: 'cas', id: casId, actif: false });
  const apres = dbq().prepare('SELECT COUNT(*) AS n FROM academy_evaluations WHERE cas_id = ?').get(casId).n;
  assert.strictEqual(apres, avant, 'archiver un cas a touché aux évaluations');
  assert.strictEqual(app.academyPratique.etatPour(THEO, f.cle).validee, true,
    'la pratique validée le reste, cas archivé ou non');
});

test('UN CAS NE TRAVERSE JAMAIS UNE FORMATION', async () => {
  const a = await formationJetable({ pratiqueObligatoire: true });
  const b = await formationJetable({ pratiqueObligatoire: true });
  const ca = await adm('POST', '/api/academy/admin/cas', { formation: a.cle, titre: 'Cas de A' });

  // Le désigner depuis B doit être refusé — sinon la route écrirait dans A
  // tout en renvoyant l'arbre de B.
  const vol = await adm('POST', '/api/academy/admin/cas',
    { formation: b.cle, id: ca.body.cas.id, titre: 'Volé par B' });
  assert.strictEqual(vol.status, 400);
  assert.match(vol.body.error, /autre formation/i);
  assert.strictEqual((await arbreDe(a.cle)).cas[0].titre, 'Cas de A', 'le cas de A n\'a pas bougé');
  assert.strictEqual((await arbreDe(b.cle)).cas.length, 0, 'B n\'a rien gagné');

  // Et l'évaluateur ne peut pas s'en servir hors de A.
  assert.strictEqual(app.academyPratique.lireCasDe(b.cle, ca.body.cas.id), null);
});

test('une formation inconnue ne reçoit pas de cas', async () => {
  const r = await adm('POST', '/api/academy/admin/cas?formation=nexiste_pas', { titre: 'Orphelin' });
  assert.strictEqual(r.status, 404);
});

test('pratique obligatoire SANS AUCUN CAS : un avertissement, jamais un blocage', async () => {
  // La nuance est tout le sujet : « zéro cas est un cas valide » — c'est ce qui
  // garde Coach Nutrition publiable, où l'évaluateur juge en champ libre.
  const f = await formationJetable({ pratiqueObligatoire: true });
  const v = await verifDe(f.cle);
  assert.strictEqual(v.publiable, true, 'l\'absence de cas ne doit RIEN bloquer');
  assert.ok(v.avertissements.some((a) => /aucun cas/i.test(a)),
    'le trou doit être dit : ' + JSON.stringify(v.avertissements));

  // Un cas posé, l'avertissement disparaît.
  await adm('POST', '/api/academy/admin/cas', { formation: f.cle, titre: 'Un cas' });
  const v2 = await verifDe(f.cle);
  assert.ok(!v2.avertissements.some((a) => /aucun cas/i.test(a)));

  // Et une formation qui n'évalue pas ne s'entend jamais reprocher ses cas.
  const sans = await formationJetable({ pratiqueObligatoire: false });
  assert.ok(!(await verifDe(sans.cle)).avertissements.some((a) => /aucun cas/i.test(a)));
});

test('COACH NUTRITION RESTE INTACTE : ni cas imposé, ni publication refusée', async () => {
  const v = await verifDe(COACH_NUTRITION);
  assert.ok(!v.blocages.some((b) => /cas/i.test(b)),
    'aucun blocage lié aux cas ne doit apparaître sur la formation historique');
});

test('l\'ÉCRAN administre les cas, sans jamais les supprimer', () => {
  const bloc = js.slice(js.indexOf('function rendreAdminContenus'), js.indexOf('function lireChoixSaisis'));
  assert.ok(/Cas d\\'évaluation pratique/.test(bloc), 'la section existe');
  // Elle ne s'affiche que si la formation évalue : un champ de plus à
  // comprendre pour rien serait une régression d'écran.
  assert.ok(/pratiqueObligatoire/.test(bloc), 'la section doit suivre le drapeau de la formation');
  assert.ok(/data-adm="cas-neuf"/.test(js), 'le geste d\'ajout existe');
  assert.ok(/data-adm="cas-enregistrer"/.test(js), 'le geste d\'enregistrement existe');
  assert.ok(/id="acKTitre"/.test(js) && /id="acKConsignes"/.test(js), 'les deux champs existent');
  // AUCUNE suppression : le mot ne doit pas apparaître comme geste.
  assert.ok(!/data-adm="cas-supprimer"/.test(js), 'aucun geste de suppression');
  assert.ok(/'cas'/.test(js.slice(js.indexOf('function voisinage'), js.indexOf('async function agirSurContenus'))),
    'les cas doivent s\'ordonner entre frères');
});

test('le moteur d\'administration ne nomme toujours aucune formation', () => {
  // Le même invariant qu'au début du fichier, revérifié APRÈS l'ajout des cas.
  const pratiqueSrc = fs.readFileSync(path.join(__dirname, '..', 'lib', 'academyPratique.js'), 'utf8');
  const definirCas = pratiqueSrc.slice(pratiqueSrc.indexOf('function definirCas'),
    pratiqueSrc.indexOf('// Un cas n\'est utilisable QUE'));
  assert.ok(definirCas.length > 500, 'la fonction doit être délimitée');
  assert.ok(!/coach_nutrition|cycle_menstruel|prevenir_decrochage|mouvements_fondamentaux/.test(definirCas),
    'definirCas nomme une formation');
});

// ===========================================================================
//  9. LA CATÉGORIE DE CATALOGUE, DEPUIS L'ADMINISTRATION
// ===========================================================================

test('une formation se crée avec sa catégorie et sa description', async () => {
  const r = await adm('POST', '/api/academy/admin/formations', {
    cle: 'cat_admin', libelle: 'Catégorisée', titre: 'T',
    categorie: 'signature', description: 'Une présentation du parcours.',
  });
  assert.strictEqual(r.status, 200, r.txt.slice(0, 200));
  assert.strictEqual(r.body.formation.categorie, 'signature');
  assert.strictEqual(r.body.formation.description, 'Une présentation du parcours.');
  assert.strictEqual(r.body.formation.actif, false, 'et toujours en brouillon');
});

test('la catégorie se modifie ensuite depuis les réglages', async () => {
  const r = await adm('PUT', '/api/academy/admin/formations/cat_admin', {
    libelle: 'Catégorisée', titre: 'T', categorie: 'expertise',
  });
  assert.strictEqual(r.status, 200, r.txt.slice(0, 200));
  assert.strictEqual(r.body.formation.categorie, 'expertise');
});

test('une catégorie inconnue est refusée par la route, sans rien écrire', async () => {
  const avant = app.academyFormations.lire('cat_admin').categorie;
  const r = await adm('PUT', '/api/academy/admin/formations/cat_admin', {
    libelle: 'Catégorisée', titre: 'T', categorie: 'premium',
  });
  assert.strictEqual(r.status, 400);
  assert.match(r.body.error, /premium/);
  assert.strictEqual(app.academyFormations.lire('cat_admin').categorie, avant,
    'un refus a quand même modifié la catégorie');
});

test('la catégorie voyage jusqu\'au CATALOGUE DU COACH, sans route nouvelle', async () => {
  await adm('POST', '/api/academy/admin/formations/cat_admin/publier').catch(() => {});
  // La formation jetable n'est pas publiable en l'état : on interroge donc le
  // registre, qui est ce que la route recopie.
  const f = app.academyFormations.lire('cat_admin');
  assert.strictEqual(f.categorie, 'expertise');
  // Et le catalogue servi au collaborateur porte le champ pour les publiées.
  const cat = await api('GET', '/api/academy/formations', null, jetons[THEO]);
  for (const x of cat.body.formations) {
    assert.ok('categorie' in x, 'le catalogue coach doit porter la catégorie : ' + x.cle);
  }
});

test('L\'ÉCRAN d\'administration propose les CINQ catégories, et rien d\'autre', () => {
  // Le <select> est rendu par une fonction partagée : son `id` est un
  // PARAMÈTRE, il n'apparaît donc pas en clair dans un attribut.
  assert.ok(/champCategorie\('acFCategorie'/.test(js), 'le formulaire de création a son champ');
  assert.ok(/champCategorie\('acRCategorie'/.test(js), 'les réglages ont le leur');
  assert.ok(/id="acFDesc"/.test(js) && /id="acRDesc"/.test(js), 'la description est saisissable des deux côtés');
  // La liste est déclarée UNE fois et le <select> est partagé : deux listes
  // divergeraient au premier ajout de catégorie.
  const bloc = js.slice(js.indexOf('const CATEGORIES = ['), js.indexOf('function rendreFormFormationNeuve'));
  for (const c of ['essentiel', 'signature', 'expertise', 'management', 'boite_a_outils']) {
    assert.ok(bloc.includes(`'${c}'`), 'catégorie manquante à l\'écran : ' + c);
  }
  assert.strictEqual((js.match(/const CATEGORIES = \[/g) || []).length, 1,
    'la liste des catégories ne doit être déclarée qu\'une fois');
  assert.strictEqual((js.match(/function champCategorie/g) || []).length, 1,
    'un seul rendu de <select>, partagé');
  // Les deux gestes l'envoient.
  const creer = js.slice(js.indexOf("geste === 'formation-creer'"), js.indexOf("geste === 'reglages-enregistrer'"));
  assert.ok(/acFCategorie/.test(creer) && /acFDesc/.test(creer));
  const regler = js.slice(js.indexOf("geste === 'reglages-enregistrer'"), js.indexOf("geste === 'publier'"));
  assert.ok(/acRCategorie/.test(regler) && /acRDesc/.test(regler));
});

// ===========================================================================
//  10. LE RAIL DE CATÉGORIES, CÔTÉ COACH
//
//  L'exigence de fond : le catalogue doit pouvoir accueillir cinquante
//  formations demain SANS QU'UNE LIGNE DE CODE NE CHANGE. Ce qui se vérifie
//  ici, ce n'est donc pas l'apparence du rail — c'est qu'aucune formation n'y
//  soit nommée, et que la liste des onglets se DÉRIVE de la donnée.
// ===========================================================================

test('LE RAIL SE DÉRIVE DE LA LISTE, il n\'est pas écrit à la main', () => {
  const bloc = js.slice(js.indexOf('function rendreAccueil'), js.indexOf('function etapesDe'));
  assert.ok(/ac-cats/.test(bloc), 'le rail existe');
  // Les six onglets : « toutes » plus la liste. Aucun autre libellé en dur.
  assert.ok(/\['toutes', 'Toutes'\], \.\.\.CATEGORIES/.test(bloc),
    'les onglets doivent se construire depuis CATEGORIES');
  for (const c of ['essentiel', 'signature', 'expertise', 'management', 'boite_a_outils']) {
    assert.ok(!new RegExp(`'${c}'`).test(bloc),
      `« ${c} » est écrit en dur dans le rendu de l'accueil : il doit venir de CATEGORIES`);
  }
});

test('AUCUNE FORMATION N\'EST NOMMÉE dans la logique du catalogue coach', () => {
  const bloc = js.slice(js.indexOf('function formationsAffichees'), js.indexOf('async function ouvrirAccueil'));
  for (const cle of ['coach_nutrition', 'cycle_menstruel', 'prevenir_decrochage',
    'mouvements_fondamentaux', 'savoir_etre', 'fitness_boxe']) {
    assert.ok(!bloc.includes(cle), 'une formation est classée en dur : ' + cle);
  }
});

test('le filtre par catégorie s\'applique AVANT le tri, et laisse le tri intact', () => {
  const fn = js.slice(js.indexOf('function formationsAffichees'), js.indexOf('async function ouvrirAccueil'));
  const iCat = fn.indexOf('accueilCategorie !==');
  const iTri = fn.indexOf('accueilTri ===');
  assert.ok(iCat > 0 && iTri > 0, 'les deux doivent exister');
  assert.ok(iCat < iTri, 'le filtre doit précéder le tri : sinon le tri par statut serait faussé');
  // Le tri lui-même n'a pas été touché.
  assert.ok(/ORDRE_STATUT\.indexOf/.test(fn), 'le tri par statut doit rester celui d\'avant');
  assert.ok(/pourcentage/.test(fn) && /localeCompare/.test(fn), 'les trois tris doivent subsister');
});

test('« toutes » n\'est PAS une catégorie enregistrée', () => {
  const { CATEGORIES } = require('../lib/academyFormations');
  assert.ok(!CATEGORIES.includes('toutes'),
    '« toutes » est l\'absence de filtre, pas une valeur de la colonne');
  // Et le filtre le traite comme tel : il ne compare jamais categorie === 'toutes'.
  const fn = js.slice(js.indexOf('function formationsAffichees'), js.indexOf('async function ouvrirAccueil'));
  assert.ok(!/categorie === 'toutes'/.test(fn));
});

test('les deux filtres sont ORTHOGONAUX : certifiantes et catégorie coexistent', () => {
  const fn = js.slice(js.indexOf('function formationsAffichees'), js.indexOf('async function ouvrirAccueil'));
  assert.ok(/accueilFiltre === 'certifiantes'/.test(fn), 'le filtre historique subsiste');
  assert.ok(/accueilCategorie !== 'toutes'/.test(fn), 'le nouveau s\'ajoute');
  // Deux `if` distincts, pas un `else if` : choisir une catégorie ne doit pas
  // faire sortir de « Mes certifications ».
  assert.ok(!/else if \(accueilCategorie/.test(fn),
    'les deux filtres doivent se cumuler, pas s\'exclure');
});

test('une catégorie vide affiche un état vide qui la NOMME', () => {
  const bloc = js.slice(js.indexOf('function rendreAccueil'), js.indexOf('function etapesDe'));
  assert.ok(/Aucune formation dans/.test(bloc), 'l\'état vide doit exister');
  assert.ok(/libelleCategorie\(accueilCategorie\)/.test(bloc),
    'et nommer la catégorie choisie plutôt qu\'un message générique');
});

test('le rail survit à 390 px, et les assets sont versionnés', () => {
  assert.ok(css.includes('.ac-cats'), 'le rail a son style');
  assert.ok(css.includes('.ac-cat.on'), 'l\'onglet actif est distingué');
  // On cherche LE bloc mobile qui parle du rail, pas « le dernier » : d'autres
  // écrans ajoutent les leurs, et un test qui suppose sa place casse au premier
  // qui arrive après lui.
  const blocsMobiles = css.split('@media (max-width: 520px)').slice(1);
  assert.ok(blocsMobiles.some((b2) => /ac-cats/.test(b2) && /overflow-x: auto/.test(b2)),
    'le rail doit défiler sous 520 px plutôt que hacher la page');
  // Sans bump, le navigateur sert l'ancien écran : le piège a déjà coûté une
  // session. On ne fige PAS le numéro — il monte à chaque lot — mais on exige
  // que les deux assets portent LE MÊME : n'en bumper qu'un est le vrai piège,
  // le CSS et le JS se répondent.
  const vJs = (html.match(/academy\.js\?v=(\d+)/) || [])[1];
  const vCss = (html.match(/academy\.css\?v=(\d+)/) || [])[1];
  assert.ok(vJs && vCss, 'les deux assets doivent être versionnés');
  assert.strictEqual(vJs, vCss, 'academy.js et academy.css doivent porter la même version');
});
