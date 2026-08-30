'use strict';
// ============================================================================
//  MY COACH ACADEMY — évaluation pratique (lot 3).
//
//  QUATRE PROPRIÉTÉS SONT ATTAQUÉES ICI, PARCE QU'ELLES SE CASSENT SANS BRUIT :
//
//   1. LE PRÉREQUIS TIENT À L'ÉCRITURE, PAS SEULEMENT À L'AFFICHAGE. On tente
//      d'ouvrir une évaluation pour quelqu'un dont la théorie n'est pas validée,
//      directement par l'API. Un contrôle qui ne vit que dans l'écran n'est pas
//      un contrôle.
//   2. PERSONNE NE S'AUTO-VALIDE. Un évaluateur est un compte comme un autre :
//      on lui fait tenter de s'évaluer lui-même, et on lui fait tenter de
//      modifier un verdict déjà prononcé.
//   3. L'HISTORIQUE NE S'ÉCRASE PAS. Deux tentatives, deux évaluateurs, deux
//      dates : la seconde ne doit pas faire disparaître la première.
//   4. UNE PRATIQUE VALIDÉE CLÔT L'ÉTAPE. Aucune quatrième tentative après une
//      validation : on l'attaque par l'API, pas seulement par l'écran. Sans ce
//      verrou, un verdict postérieur pourrait rétrograder une habilitation.
//   5. VALIDER LA PRATIQUE NE CERTIFIE PAS. Le statut de certification est
//      relu après chaque écriture : il ne bouge jamais.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DB = path.join(os.tmpdir(), `nutri-academy-pratique-test-${process.pid}.sqlite`);
process.env.NUTRITION_DB = DB;
process.env.ADMIN_EMAIL = 'patron@exemple.fr';

const app = require('../server');
const { certifierAncienne } = require('./aideAcademy');
const P = require('../lib/academyPratique');
let srv, base;

const ADMIN = 'patron@exemple.fr';    // évaluateur d'office
const EVA = 'eva.p@exemple.fr';       // évaluateur désigné
const OLIVIER = 'olivier.p@exemple.fr'; // second évaluateur : deux tentatives, deux évaluateurs
const THEO = 'theo.p@exemple.fr';     // collaborateur : théorie validée, le parcours principal
const NINA = 'nina.p@exemple.fr';     // collaborateur : théorie NON validée
const QUENTIN = 'quentin.p@exemple.fr'; // collaborateur DÉJÀ CERTIFIÉ
const LEA = 'lea.p@exemple.fr';       // client
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
const pratiqueDe = async (email) => (await api('GET', '/api/academy/pratique', null, jetons[email])).body.pratique;

// Fait valider la THÉORIE d'un collaborateur, en passant par les lots 1 et 2 —
// jamais en écrivant directement en base. Le prérequis testé doit être le vrai.
async function validerLaTheorie(email) {
  const f = (await api('GET', '/api/academy/formation', null, jetons[email])).body.formation;
  for (const c of f.modules.flatMap((m) => m.contenus)) {
    await api('POST', `/api/academy/contenus/${c.id}/terminer`, {}, jetons[email]);
  }
  const t = (await api('POST', '/api/academy/qcm/tentatives', {}, jetons[email])).body.tentative;
  const k = new Map(dbq().prepare('SELECT id, correct_json AS c FROM academy_tentative_questions WHERE tentative_id = ?')
    .all(t.id).map((r) => [r.id, JSON.parse(r.c)]));
  for (const q of t.questions) {
    await api('PUT', `/api/academy/qcm/tentatives/${t.id}/reponses/${q.id}`, { choix: k.get(q.id) }, jetons[email]);
  }
  const res = (await api('POST', `/api/academy/qcm/tentatives/${t.id}/terminer`, {}, jetons[email])).body.tentative.resultat;
  assert.strictEqual(res.reussie, true, 'la théorie devait être validée pour ' + email);
}

const ouvrir = (cible, par, corps) =>
  api('POST', `/api/academy/evaluateur/collaborateurs/${encodeURIComponent(cible)}/evaluations`, corps || {}, jetons[par]);
const prononcer = (id, par, corps) =>
  api('PUT', `/api/academy/evaluateur/evaluations/${id}`, corps, jetons[par]);

test.before(async () => {
  await new Promise((r) => { srv = app.listen(0, r); });
  base = `http://127.0.0.1:${srv.address().port}`;
  app.boost.assurerSchema();
  app.academyPratique.assurerSchema();
  for (const [e, p] of [[ADMIN, '7777'], [EVA, '3003'], [OLIVIER, '6006'], [THEO, '4004'],
    [NINA, '5005'], [QUENTIN, '2002'], [LEA, '1001']]) {
    await connecter(e, p);
  }
  // EVA et OLIVIER sont AUSSI collaborateurs : c'est le cas le plus dangereux
  // (un évaluateur qui pourrait se valider lui-même), donc celui qu'on installe.
  for (const e of [EVA, OLIVIER, THEO, NINA, QUENTIN]) {
    await api('POST', '/api/boost/admin/collaborateurs', { email: e, role: 'collaborateur' }, jetons[ADMIN]);
  }
  // Certification ANTÉRIEURE à l'Academy, écrite à la main : depuis le lot 4,
  // aucune route ne permet plus de certifier sans le parcours complet — et
  // c'est précisément ce cas hérité qu'on veut éprouver ici.
  certifierAncienne({ db: require('../lib/db').getDb(), email: QUENTIN });
  await validerLaTheorie(THEO);
  await validerLaTheorie(EVA);
  // Eva est désignée évaluatrice AVANT tout : depuis l'arbitrage, l'admin n'a
  // aucun droit d'évaluer, il n'a que celui de désigner.
  await api('POST', '/api/academy/admin/evaluateurs', { email: EVA }, jetons[ADMIN]);
});

test.after(() => {
  if (srv) srv.close();
  require('../lib/db').closeDb();
  ['', '-wal', '-shm'].forEach((s) => { try { fs.unlinkSync(DB + s); } catch (_) {} });
});

// ===========================================================================
//  1. LE PRÉREQUIS : LA THÉORIE
// ===========================================================================

test('sans jeton, aucune route d\'évaluation pratique ne répond', async () => {
  for (const [m, route] of [['GET', '/api/academy/pratique'],
    ['GET', '/api/academy/evaluateur/collaborateurs'],
    ['POST', `/api/academy/evaluateur/collaborateurs/${THEO}/evaluations`],
    ['PUT', '/api/academy/evaluateur/evaluations/1'],
    ['GET', '/api/academy/admin/evaluateurs']]) {
    assert.strictEqual((await api(m, route, m === 'GET' ? null : {})).status, 401, `${m} ${route}`);
  }
});

test('théorie NON validée : l\'évaluation pratique est inaccessible', async () => {
  const p = await pratiqueDe(NINA);
  assert.strictEqual(p.etat, P.ETAT_NON_ACCESSIBLE);
  assert.strictEqual(p.accessible, false);
  assert.strictEqual(p.theorieValidee, false);
  assert.strictEqual(p.validee, false);
  assert.deepStrictEqual(p.historique, []);
});

test('le prérequis tient à l\'ÉCRITURE : on n\'ouvre pas une évaluation sans théorie', async () => {
  // L'appel vient d'une évaluatrice légitime : ce n'est pas le droit qui manque,
  // c'est le prérequis. Un contrôle qui ne vivrait que dans l'écran serait
  // contourné par exactement cette requête.
  const r = await ouvrir(NINA, EVA, { resultat: 'valide' });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.body.theorieNonValidee, true);
  assert.ok(/théorique/i.test(r.body.error));
  assert.strictEqual(dbq().prepare('SELECT COUNT(*) AS n FROM academy_evaluations WHERE email = ?').get(NINA).n, 0,
    'aucune ligne n\'a été créée');
});

test('la fiche d\'un collaborateur sans théorie est refusée à l\'évaluateur aussi', async () => {
  const r = await api('GET', `/api/academy/evaluateur/collaborateurs/${NINA}`, null, jetons[EVA]);
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.body.theorieNonValidee, true);
});

test('théorie validée : l\'évaluation pratique devient accessible, « À réaliser »', async () => {
  const p = await pratiqueDe(THEO);
  assert.strictEqual(p.theorieValidee, true);
  assert.strictEqual(p.accessible, true);
  assert.strictEqual(p.etat, P.ETAT_A_REALISER);
  assert.strictEqual(p.validee, false);
  assert.strictEqual(p.enAttente, null);
  assert.strictEqual(p.certifie, false);
});

test('la théorie n\'est pas recalculée ici : c\'est le lot 2 qui répond', async () => {
  const theorie = (await api('GET', '/api/academy/qcm', null, jetons[THEO])).body.qcm;
  const p = await pratiqueDe(THEO);
  assert.strictEqual(p.theorieValidee, theorie.theorieValidee);
  assert.strictEqual(p.scoreTheorie, theorie.scoreValide);
  // Et le module ne porte aucune table de scores : il n'y a qu'un seul QCM.
  const tables = dbq().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'academy_%'").all()
    .map((t) => t.name);
  assert.ok(!tables.some((t) => /pratique_(score|qcm|theorie)/.test(t)), 'tables : ' + tables.join(', '));
});

// ===========================================================================
//  2. QUI PEUT ÉVALUER
// ===========================================================================

test('un client n\'atteint aucune route de l\'évaluation pratique', async () => {
  const r = await api('GET', '/api/academy/pratique', null, jetons[LEA]);
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.body.nonCollaborateur, true);
  for (const [m, route] of [['GET', '/api/academy/evaluateur/collaborateurs'],
    ['POST', `/api/academy/evaluateur/collaborateurs/${THEO}/evaluations`]]) {
    assert.strictEqual((await api(m, route, m === 'GET' ? null : {}, jetons[LEA])).status, 403, `${m} ${route}`);
  }
});

test('un collaborateur ordinaire ne peut ni lister, ni ouvrir, ni prononcer', async () => {
  const routes = [
    ['GET', '/api/academy/evaluateur/collaborateurs', null],
    ['GET', `/api/academy/evaluateur/collaborateurs/${THEO}`, null],
    ['POST', `/api/academy/evaluateur/collaborateurs/${THEO}/evaluations`, { resultat: 'valide' }],
    ['PUT', '/api/academy/evaluateur/evaluations/1', { resultat: 'valide' }],
  ];
  for (const [m, route, corps] of routes) {
    const r = await api(m, route, corps, jetons[THEO]);
    assert.strictEqual(r.status, 403, `${m} ${route}`);
    assert.strictEqual(r.body.nonEvaluateur, true);
  }
  // Il reste « À réaliser » : rien n'a bougé.
  assert.strictEqual((await pratiqueDe(THEO)).etat, P.ETAT_A_REALISER);
});

test('un collaborateur NE PEUT PAS s\'auto-valider, même en visant son propre compte', async () => {
  const r = await ouvrir(THEO, THEO, { resultat: 'valide' });
  assert.strictEqual(r.status, 403, 'refusé avant même la question de l\'auto-évaluation');
  assert.strictEqual(dbq().prepare('SELECT COUNT(*) AS n FROM academy_evaluations WHERE email = ?').get(THEO).n, 0);
});

test('L\'ADMINISTRATEUR ÉVALUE D\'OFFICE, sans avoir été désigné', async () => {
  // La règle a changé de sens : administrer implique désormais évaluer et
  // certifier. L'ancienne séparation obligeait l'administrateur à se désigner
  // lui-même avant de pouvoir travailler — et cette désignation manquante
  // rendait l'espace inatteignable sur une base neuve.
  const moi = await api('GET', '/api/academy/moi', null, jetons[ADMIN]);
  assert.strictEqual(moi.body.evaluateur, true, 'l\'admin est évaluateur d\'office');
  assert.strictEqual(moi.body.admin, true);
  assert.strictEqual(moi.body.collaborateur, false, 'sans être entré dans le parcours pour autant');
  // La table des droits, elle, est TOUJOURS VIDE pour lui : le droit vient de
  // son statut, pas d'une ligne. C'est ce qui distingue « d'office » de
  // « désigné ».
  assert.strictEqual(dbq().prepare('SELECT COUNT(*) AS n FROM academy_evaluateurs WHERE email = ?').get(ADMIN).n, 0);

  for (const route of ['/api/academy/evaluateur/collaborateurs',
    `/api/academy/evaluateur/collaborateurs/${THEO}`]) {
    assert.strictEqual((await api('GET', route, null, jetons[ADMIN])).status, 200, route);
  }

  // L'ÉCRITURE AUSSI PASSE LA GARDE — démontré SANS rien écrire : sur un compte
  // inconnu, le refus vient de la cible (404) et non du droit (403). Un
  // `nonEvaluateur` ici voudrait dire que la porte est restée fermée.
  const r = await api('POST', '/api/academy/evaluateur/collaborateurs/fantome@exemple.fr/evaluations',
    { resultat: 'valide' }, jetons[ADMIN]);
  assert.strictEqual(r.status, 404);
  assert.notStrictEqual(r.body.nonEvaluateur, true, 'la garde s\'est ouverte : le refus est celui de la cible');
  assert.strictEqual(dbq().prepare('SELECT COUNT(*) AS n FROM academy_evaluations').get().n, 0,
    'aucune évaluation n\'a été créée au passage');

  // Et il garde le droit de DÉSIGNER les évaluateurs qui, eux, ne sont pas admin.
  assert.strictEqual((await api('GET', '/api/academy/admin/evaluateurs', null, jetons[ADMIN])).status, 200);
});

test('un admin peut tout de même être désigné explicitement — et le geste reste tracé', async () => {
  assert.strictEqual((await api('POST', '/api/academy/admin/evaluateurs', { email: ADMIN }, jetons[ADMIN])).status, 200);
  assert.strictEqual((await api('GET', '/api/academy/moi', null, jetons[ADMIN])).body.evaluateur, true);
  const ligne = dbq().prepare('SELECT actif, maj_par FROM academy_evaluateurs WHERE email = ?').get(ADMIN);
  assert.strictEqual(ligne.actif, 1);
  assert.strictEqual(ligne.maj_par, ADMIN, 'qui a désigné qui reste écrit');
});

test('seul l\'administrateur désigne un évaluateur', async () => {
  for (const e of [THEO, EVA]) {
    assert.strictEqual((await api('POST', '/api/academy/admin/evaluateurs', { email: EVA }, jetons[e])).status, 403, e);
  }
  assert.strictEqual((await api('GET', '/api/academy/admin/evaluateurs', null, jetons[THEO])).status, 403);

  const r = await api('POST', '/api/academy/admin/evaluateurs', { email: EVA }, jetons[ADMIN]);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.evaluateur.actif, true);
  assert.strictEqual((await api('GET', '/api/academy/moi', null, jetons[EVA])).body.evaluateur, true);
  // Théo, lui, n'a rien demandé et n'a rien reçu.
  assert.strictEqual((await api('GET', '/api/academy/moi', null, jetons[THEO])).body.evaluateur, false);
});

test('désigner un compte inexistant est refusé', async () => {
  const r = await api('POST', '/api/academy/admin/evaluateurs', { email: 'fantome@exemple.fr' }, jetons[ADMIN]);
  assert.strictEqual(r.status, 404);
});

test('retirer le droit d\'évaluer ferme la porte à l\'appel suivant', async () => {
  await api('POST', '/api/academy/admin/evaluateurs', { email: EVA, evaluateur: false }, jetons[ADMIN]);
  // Le jeton est toujours valide : c'est bien le droit, relu à chaque requête, qui ferme.
  const r = await api('GET', '/api/academy/evaluateur/collaborateurs', null, jetons[EVA]);
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.body.nonEvaluateur, true);
  assert.strictEqual((await api('GET', '/api/academy/moi', null, jetons[EVA])).body.evaluateur, false);

  await api('POST', '/api/academy/admin/evaluateurs', { email: EVA, evaluateur: true }, jetons[ADMIN]);
  assert.strictEqual((await api('GET', '/api/academy/evaluateur/collaborateurs', null, jetons[EVA])).status, 200);
});

test('un ÉVALUATEUR ne s\'évalue pas lui-même — c\'est le refus qui donne du poids au reste', async () => {
  // EVA est évaluateur ET collaborateur à théorie validée : sans ce garde-fou,
  // le droit d'évaluer vaudrait droit de se valider soi-même.
  assert.strictEqual((await pratiqueDe(EVA)).theorieValidee, true);
  const r = await ouvrir(EVA, EVA, { resultat: 'valide' });
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.body.autoEvaluation, true);
  assert.ok(/sa propre pratique/i.test(r.body.error));
  assert.strictEqual((await pratiqueDe(EVA)).etat, P.ETAT_A_REALISER);
});

test('on n\'évalue pas un collaborateur inexistant, ni un client', async () => {
  for (const cible of ['fantome@exemple.fr', LEA]) {
    const r = await ouvrir(cible, EVA, { resultat: 'valide' });
    assert.strictEqual(r.status, 404, cible);
    assert.ok(/introuvable/i.test(r.body.error));
  }
  assert.strictEqual((await api('GET', `/api/academy/evaluateur/collaborateurs/${LEA}`, null, jetons[EVA])).status, 404);
});

// ===========================================================================
//  3. LE CYCLE DE VIE
// ===========================================================================

let evalUn;

test('l\'évaluateur voit les collaborateurs éligibles — et EUX SEULS', async () => {
  const r = await api('GET', '/api/academy/evaluateur/collaborateurs', null, jetons[EVA]);
  assert.strictEqual(r.status, 200);
  const emails = r.body.collaborateurs.map((c) => c.email);
  assert.ok(emails.includes(THEO), 'Théo a validé sa théorie');
  assert.ok(!emails.includes(NINA), 'Nina n\'a pas validé la sienne : elle n\'apparaît pas');
  assert.ok(!emails.includes(LEA), 'un client n\'est pas un collaborateur');
  assert.ok(r.body.collaborateurs.every((c) => c.theorieValidee === true));
});

test('ouvrir une séance sans résultat met l\'état en « Résultat en attente »', async () => {
  const r = await ouvrir(THEO, EVA, { cas: 'Mise en situation S1', dateEvaluation: '2026-09-03' });
  assert.strictEqual(r.status, 201);
  evalUn = r.body.evaluation;
  assert.strictEqual(evalUn.resultat, null);
  assert.strictEqual(evalUn.enAttente, true);
  assert.strictEqual(evalUn.cas, 'Mise en situation S1');
  assert.strictEqual(evalUn.dateEvaluation, '2026-09-03');
  assert.strictEqual(evalUn.ouvertPar, EVA);
  assert.strictEqual(r.body.pratique.etat, P.ETAT_EN_ATTENTE);

  const p = await pratiqueDe(THEO);
  assert.strictEqual(p.etat, P.ETAT_EN_ATTENTE);
  assert.strictEqual(p.enAttente.id, evalUn.id);
  assert.strictEqual(p.validee, false, 'une séance ouverte ne vaut pas une validation');
});

test('deux séances ouvertes en même temps sont refusées', async () => {
  const r = await ouvrir(THEO, ADMIN, {});
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.body.evaluation.id, evalUn.id, 'le refus renvoie celle qui attend');
  assert.strictEqual(dbq().prepare('SELECT COUNT(*) AS n FROM academy_evaluations WHERE email = ?').get(THEO).n, 1);
});

test('un résultat inconnu est refusé, et la séance reste ouverte', async () => {
  for (const resultat of ['certifie', 'super', 'VALIDE ', 'non_valide']) {
    const r = await prononcer(evalUn.id, EVA, { resultat });
    assert.strictEqual(r.status, 400, resultat);
  }
  assert.strictEqual((await prononcer(evalUn.id, EVA, {})).status, 400, 'un verdict vide n\'est pas un verdict');
  assert.strictEqual((await prononcer(evalUn.id, EVA, { resultat: 'valide', dateEvaluation: '03/09/2026' })).status, 400,
    'date au mauvais format');
  assert.strictEqual((await pratiqueDe(THEO)).etat, P.ETAT_EN_ATTENTE);
});

test('« À REPASSER » n\'est jamais interprété comme validé', async () => {
  const r = await prononcer(evalUn.id, EVA, {
    resultat: 'a_repasser', commentaire: 'Cadre posé, mais l\'action de la semaine reste floue.',
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.evaluation.resultat, 'a_repasser');
  assert.strictEqual(r.body.evaluation.enAttente, false);
  assert.strictEqual(r.body.evaluation.evaluateur, EVA, 'l\'évaluateur qui a prononcé est enregistré');
  assert.ok(r.body.evaluation.decideLe, 'la date de saisie est enregistrée');

  const p = r.body.pratique;
  assert.strictEqual(p.etat, P.ETAT_A_REPASSER);
  assert.strictEqual(p.validee, false, 'à repasser n\'est pas validé');
  assert.strictEqual(p.valideeLe, null);
  assert.strictEqual(p.enAttente, null);
});

test('une évaluation prononcée est IMMUABLE', async () => {
  const avant = dbq().prepare('SELECT * FROM academy_evaluations WHERE id = ?').get(evalUn.id);
  for (const par of [EVA, ADMIN, OLIVIER]) {
    const r = await prononcer(evalUn.id, par, { resultat: 'valide', commentaire: 'on efface tout' });
    assert.strictEqual(r.status, par === OLIVIER ? 403 : 409, par);
  }
  const apres = dbq().prepare('SELECT * FROM academy_evaluations WHERE id = ?').get(evalUn.id);
  assert.deepStrictEqual(apres, avant, 'la ligne n\'a pas bougé d\'un caractère');
  assert.strictEqual((await pratiqueDe(THEO)).etat, P.ETAT_A_REPASSER);
});

test('une évaluation inexistante répond 404', async () => {
  for (const id of [999999, 'abc']) {
    assert.strictEqual((await prononcer(id, ADMIN, { resultat: 'valide' })).status, 404, String(id));
  }
});

// ===========================================================================
//  4. DEUXIÈME TENTATIVE : L'HISTORIQUE
// ===========================================================================

let evalDeux;

test('une nouvelle tentative n\'efface pas la première', async () => {
  await api('POST', '/api/academy/admin/evaluateurs', { email: OLIVIER }, jetons[ADMIN]);
  const r = await ouvrir(THEO, OLIVIER, {
    resultat: 'valide', dateEvaluation: '2026-09-10', cas: 'Mise en situation S4',
    commentaire: 'Action unique posée, reformulation nette.',
  });
  assert.strictEqual(r.status, 201);
  evalDeux = r.body.evaluation;
  assert.strictEqual(evalDeux.resultat, 'valide');
  assert.strictEqual(evalDeux.evaluateur, OLIVIER, 'un autre évaluateur que la première fois');
  assert.notStrictEqual(evalDeux.id, evalUn.id);

  const p = r.body.pratique;
  assert.strictEqual(p.etat, P.ETAT_VALIDEE);
  assert.strictEqual(p.validee, true);
  assert.strictEqual(p.valideeLe, '2026-09-10');

  // LA PROPRIÉTÉ DU LOT : les deux tentatives sont là, dans l'ordre.
  assert.strictEqual(p.historique.length, 2);
  const [recent, ancien] = p.historique;
  assert.strictEqual(recent.id, evalDeux.id);
  assert.strictEqual(recent.resultat, 'valide');
  assert.strictEqual(recent.dateEvaluation, '2026-09-10');
  assert.strictEqual(recent.evaluateur, OLIVIER);
  assert.strictEqual(ancien.id, evalUn.id);
  assert.strictEqual(ancien.resultat, 'a_repasser');
  assert.strictEqual(ancien.dateEvaluation, '2026-09-03');
  assert.strictEqual(ancien.evaluateur, EVA);
  assert.ok(/action de la semaine/.test(ancien.commentaire), 'l\'appréciation d\'origine est intacte');
});

test('l\'historique conserve tout ce qui trace la décision humaine', async () => {
  const p = await pratiqueDe(THEO);
  for (const t of p.historique) {
    assert.ok(t.id && t.ouverteLe && t.dateEvaluation, 'dates présentes');
    assert.ok(t.evaluateur, 'évaluateur présent');
    assert.strictEqual(t.formation, P.FORMATION, 'formation concernée');
    assert.ok(t.decideLe, 'date de saisie du verdict');
    assert.ok(t.cas, 'support utilisé');
  }
});

test('UNE PRATIQUE VALIDÉE CLÔT L\'ÉTAPE : aucune quatrième tentative', async () => {
  // Le verrou est attaqué côté SERVEUR, par plusieurs évaluateurs, avec et sans
  // verdict. Masquer le formulaire ne protège rien.
  const avant = (await pratiqueDe(THEO)).historique.length;
  for (const [par, corps] of [[EVA, {}], [OLIVIER, { resultat: 'a_repasser' }],
    [EVA, { resultat: 'valide' }], [OLIVIER, { cas: 'reprise' }]]) {
    const r = await ouvrir(THEO, par, corps);
    assert.strictEqual(r.status, 409, par + ' ' + JSON.stringify(corps));
    assert.strictEqual(r.body.dejaValidee, true);
    assert.ok(/déjà validée|étape est terminée/i.test(r.body.error));
    assert.strictEqual(r.body.evaluation.resultat, 'valide', 'le refus montre la validation acquise');
  }
  assert.strictEqual((await pratiqueDe(THEO)).historique.length, avant, 'aucune ligne n\'a été créée');
});

test('l\'état annonce que l\'étape est close, et l\'écran s\'en sert', async () => {
  const p = await pratiqueDe(THEO);
  assert.strictEqual(p.etat, P.ETAT_VALIDEE);
  assert.strictEqual(p.validee, true);
  assert.strictEqual(p.close, true, 'le drapeau qui fait disparaître le formulaire de l\'évaluateur');
  assert.strictEqual(p.enAttente, null, 'aucune séance ne reste ouverte après une validation');
});

test('aucun verdict postérieur ne peut rétrograder une validation', async () => {
  // Les séances déjà closes sont immuables, et plus aucune ne peut s'ouvrir :
  // la règle tient par construction, pas par comparaison de dates. On le
  // démontre en tentant de prononcer « à repasser » sur chaque ligne existante.
  const p = await pratiqueDe(THEO);
  for (const t of p.historique) {
    const r = await prononcer(t.id, EVA, { resultat: 'a_repasser' });
    assert.strictEqual(r.status, 409, 'évaluation ' + t.id);
  }
  const apres = await pratiqueDe(THEO);
  assert.strictEqual(apres.etat, P.ETAT_VALIDEE);
  assert.strictEqual(apres.validee, true);
  assert.strictEqual(apres.valideeLe, '2026-09-10');
  assert.strictEqual(apres.historique.length, p.historique.length);
});

test('la validation se DÉMONTRE par l\'historique, pas par le cache', async () => {
  // La source de vérité est academy_evaluations : une ligne au résultat
  // « valide », datée, signée. boost_certifications.resultat_pratique n'en est
  // qu'un reflet.
  const lignes = dbq().prepare(`SELECT resultat, date_evaluation, evaluateur FROM academy_evaluations
                                WHERE email = ? AND resultat = 'valide'`).all(THEO);
  assert.strictEqual(lignes.length, 1, 'une seule validation, et elle est en base');
  assert.strictEqual(lignes[0].date_evaluation, '2026-09-10');
  assert.strictEqual(lignes[0].evaluateur, OLIVIER);
  assert.strictEqual(app.boost.lireCertification(THEO).resultatPratique, 'valide', 'le reflet dit la même chose');
});

test('la liste de l\'évaluateur reflète l\'état courant', async () => {
  const liste = (await api('GET', '/api/academy/evaluateur/collaborateurs', null, jetons[EVA])).body.collaborateurs;
  const theo = liste.find((c) => c.email === THEO);
  assert.strictEqual(theo.etat, P.ETAT_VALIDEE);
  assert.strictEqual(theo.validee, true);
  assert.strictEqual(theo.nbTentatives, 2, 'les deux tentatives, et pas une de plus');
  assert.strictEqual(theo.close, true);
  assert.strictEqual(theo.certifie, false);
});

// ===========================================================================
//  5. VALIDER LA PRATIQUE NE CERTIFIE PAS
// ===========================================================================

test('le résultat est reporté dans boost_certifications — mais PAS le statut', async () => {
  const cert = app.boost.lireCertification(THEO);
  assert.strictEqual(cert.resultatPratique, 'valide', 'la colonne prévue pour ça reçoit le verdict');
  assert.strictEqual(cert.statut, 'en_cours', 'le statut est resté celui posé par le QCM');
  assert.notStrictEqual(cert.statut, 'certifie');
});

test('le reflet a suivi les deux verdicts, dans l\'ordre, sans jamais reculer', () => {
  // Il valait « a_repasser » après la première tentative, « valide » après la
  // seconde. Et il ne peut plus bouger : plus aucune tentative ne s'ouvrira, et
  // un « valide » enregistré n'est jamais réécrit.
  assert.strictEqual(app.boost.enregistrerPratique(THEO, 'a_repasser', ADMIN).body.inchange, true);
  assert.strictEqual(app.boost.lireCertification(THEO).resultatPratique, 'valide');
});

test('AUCUNE CERTIFICATION AUTOMATIQUE : pratique validée, coach non certifié', async () => {
  const p = await pratiqueDe(THEO);
  assert.strictEqual(p.validee, true, 'sa pratique est validée');
  assert.strictEqual(p.certifie, false, 'et il n\'est PAS Coach Nutrition certifié');
  assert.strictEqual(p.certification, 'en_cours');

  assert.strictEqual(app.boost.estCoachCertifie(THEO), false);
  const r = await api('GET', '/api/boost/coach/dossiers', null, jetons[THEO]);
  assert.strictEqual(r.status, 403, 'il n\'accède toujours pas aux dossiers Boost');
  assert.strictEqual(r.body.nonCertifie, true);

  // Rien n'a été prononcé par personne : l'évaluateur et la date de
  // certification restent vides.
  const cert = app.boost.lireCertification(THEO);
  assert.strictEqual(cert.evaluateur, null);
  assert.strictEqual(cert.dateCertification, null);
});

test('aucune route de l\'Academy ne permet de poser le statut « certifie »', async () => {
  // NINA n'a pas validé sa théorie, OLIVIER l'a validée mais n'est pas encore
  // évalué : on tente de leur faire poser un statut par tous les corps de
  // requête imaginables.
  await validerLaTheorie(OLIVIER);
  const routes = [
    ['POST', `/api/academy/evaluateur/collaborateurs/${OLIVIER}/evaluations`, { resultat: 'certifie' }],
    ['POST', `/api/academy/evaluateur/collaborateurs/${OLIVIER}/evaluations`, { statut: 'certifie', certifie: true }],
    ['POST', `/api/academy/evaluateur/collaborateurs/${THEO}/evaluations`, { resultat: 'valide', statut: 'certifie' }],
    // `evaluateur: false` volontairement : ce test vérifie qu'un `statut`
    // glissé dans le corps est ignoré, pas qu'on accorde un droit au passage.
    ['POST', '/api/academy/admin/evaluateurs', { email: THEO, evaluateur: false, statut: 'certifie' }],
  ];
  for (const [m, route, corps] of routes) {
    await api(m, route, corps, jetons[EVA]);
    await api(m, route, corps, jetons[ADMIN]);
  }
  for (const e of [THEO, OLIVIER]) {
    assert.strictEqual(app.boost.lireCertification(e).statut !== 'certifie', true, e + ' a été certifié');
  }
  assert.strictEqual(app.boost.lireCertification(THEO).statut, 'en_cours', 'le statut n\'a pas bougé');
  assert.strictEqual(app.boost.estCoachCertifie(THEO), false);
});

test('un Coach DÉJÀ CERTIFIÉ n\'est pas rétrogradé par une évaluation pratique', async () => {
  await validerLaTheorie(QUENTIN);
  const avant = app.boost.lireCertification(QUENTIN);
  assert.strictEqual(avant.statut, 'certifie');

  const r = await ouvrir(QUENTIN, EVA, { resultat: 'a_repasser', commentaire: 'contrôle de non-régression' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.pratique.etat, P.ETAT_A_REPASSER);
  assert.strictEqual(r.body.pratique.certifie, true, 'il reste certifié : ce lot ne décertifie personne non plus');

  const apres = app.boost.lireCertification(QUENTIN);
  assert.strictEqual(apres.statut, 'certifie');
  assert.strictEqual(apres.evaluateur, avant.evaluateur, 'l\'évaluateur d\'origine est intact');
  assert.strictEqual(apres.dateCertification, avant.dateCertification);
  assert.strictEqual(apres.scoreQcm, avant.scoreQcm);
  assert.strictEqual(apres.resultatPratique, 'valide',
    'le « valide » prononcé lors de sa certification n\'est pas écrasé par un contrôle ultérieur');
  assert.strictEqual(app.boost.estCoachCertifie(QUENTIN), true, 'il garde ses dossiers');
});

// ===========================================================================
//  6. CLOISONNEMENT
// ===========================================================================

test('un collaborateur ne lit que SON état : aucune route n\'accepte d\'email', async () => {
  const p = await pratiqueDe(EVA);
  assert.strictEqual(p.historique.length, 0, 'Eva n\'a jamais été évaluée');
  // On tente de lire celui d'un autre par tous les chemins qu'offre l'API.
  const avant = (await pratiqueDe(THEO)).historique.length;
  assert.ok(avant >= 2, 'Théo a bien un historique à convoiter');
  const parQuery = await api('GET', `/api/academy/pratique?email=${encodeURIComponent(THEO)}`, null, jetons[EVA]);
  assert.strictEqual(parQuery.body.pratique.historique.length, 0, 'c\'est toujours le sien');
  assert.strictEqual((await pratiqueDe(THEO)).historique.length, avant, 'celui de Théo est intact');
});

test('un collaborateur ne voit pas les appréciations d\'un autre', async () => {
  const brut = (await api('GET', '/api/academy/pratique', null, jetons[NINA])).txt;
  assert.ok(!/action de la semaine|reformulation nette/.test(brut), 'une appréciation a fuité');
  // Et il n'atteint pas la fiche évaluateur de son confrère.
  assert.strictEqual((await api('GET', `/api/academy/evaluateur/collaborateurs/${THEO}`, null, jetons[NINA])).status, 403);
});

test('aucun ALTER TABLE users : le lot n\'ajoute que ses propres tables', () => {
  const cols = dbq().prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  for (const interdit of ['evaluateur', 'pratique', 'academy', 'certifie']) {
    assert.ok(!cols.some((c) => c.toLowerCase().includes(interdit)), 'colonne ajoutée à users : ' + cols.join(', '));
  }
  const tables = dbq().prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t) => t.name);
  assert.ok(tables.includes('academy_evaluateurs') && tables.includes('academy_evaluations'));
});

// ===========================================================================
//  7. GESTION DES ÉVALUATEURS (ÉCRAN D'ADMINISTRATION)
//
//  Un écran a été ouvert pour ne plus avoir à désigner un évaluateur à la main.
//  Ce qu'il ne change pas, et qui est vérifié ici : la porte reste gardée par le
//  SERVEUR, et administrer ne rend toujours pas évaluateur.
// ===========================================================================

test('l\'écran de gestion n\'est servi qu\'à l\'administrateur', async () => {
  for (const e of [THEO, EVA, LEA, OLIVIER]) {
    const r = await api('GET', '/api/academy/admin/evaluateurs', null, jetons[e]);
    assert.strictEqual(r.status, 403, e);
    assert.ok(!r.txt.includes('comptes'), 'aucune liste n\'a fuité pour ' + e);
  }
  assert.strictEqual((await api('GET', '/api/academy/admin/evaluateurs')).status, 401, 'sans jeton non plus');
});

test('la liste montre chaque compte avec son droit d\'évaluer', async () => {
  const r = await api('GET', '/api/academy/admin/evaluateurs', null, jetons[ADMIN]);
  assert.strictEqual(r.status, 200);
  const comptes = r.body.comptes;
  assert.ok(Array.isArray(comptes) && comptes.length > 0);

  const eva = comptes.find((c) => c.email === EVA);
  assert.strictEqual(eva.evaluateur, true, 'Eva a été désignée');
  assert.strictEqual(eva.collaborateur, true);
  assert.ok(eva.prenom, 'le prénom est là pour que l\'écran soit lisible');

  const theo = comptes.find((c) => c.email === THEO);
  assert.strictEqual(theo.evaluateur, false, 'Théo ne l\'a jamais été');

  // Un client n'est pas un candidat : il n'apparaît pas.
  assert.ok(!comptes.some((c) => c.email === LEA));
  // Les évaluateurs en tête : c'est la question qu'on vient se poser.
  const rangs = comptes.map((c) => (c.evaluateur ? 0 : 1));
  assert.deepStrictEqual(rangs, [...rangs].sort((a, b) => a - b));
  // Et le contrat du lot 3 est intact : `evaluateurs` répond toujours.
  assert.ok(Array.isArray(r.body.evaluateurs));
  assert.ok(r.body.evaluateurs.some((e) => e.email === EVA && e.actif === true));
});

test('désigner depuis l\'écran donne réellement le droit d\'évaluer', async () => {
  assert.strictEqual((await api('GET', '/api/academy/moi', null, jetons[THEO])).body.evaluateur, false);
  assert.strictEqual((await api('GET', '/api/academy/evaluateur/collaborateurs', null, jetons[THEO])).status, 403);

  const r = await api('POST', '/api/academy/admin/evaluateurs', { email: THEO, evaluateur: true }, jetons[ADMIN]);
  assert.strictEqual(r.status, 200);
  // La liste à jour repart avec la réponse : l'écran ne peut pas afficher un droit périmé.
  assert.strictEqual(r.body.comptes.find((c) => c.email === THEO).evaluateur, true);

  assert.strictEqual((await api('GET', '/api/academy/moi', null, jetons[THEO])).body.evaluateur, true);
  assert.strictEqual((await api('GET', '/api/academy/evaluateur/collaborateurs', null, jetons[THEO])).status, 200);
});

test('retirer depuis l\'écran referme la porte immédiatement', async () => {
  const r = await api('POST', '/api/academy/admin/evaluateurs', { email: THEO, evaluateur: false }, jetons[ADMIN]);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.comptes.find((c) => c.email === THEO).evaluateur, false);

  // Le jeton est toujours valide : c'est bien le droit, relu à chaque requête, qui ferme.
  const l = await api('GET', '/api/academy/evaluateur/collaborateurs', null, jetons[THEO]);
  assert.strictEqual(l.status, 403);
  assert.strictEqual(l.body.nonEvaluateur, true);
  assert.strictEqual((await api('GET', '/api/academy/moi', null, jetons[THEO])).body.evaluateur, false);
});

test('un retrait ne supprime rien : la ligne et l\'historique restent', async () => {
  const ligne = dbq().prepare('SELECT actif, maj_par FROM academy_evaluateurs WHERE email = ?').get(THEO);
  assert.strictEqual(ligne.actif, 0, 'désactivée, pas supprimée : la trace du retrait est gardée');
  assert.strictEqual(ligne.maj_par, ADMIN);
  // Et les évaluations prononcées par un ancien évaluateur ne bougent pas.
  const parEva = dbq().prepare('SELECT COUNT(*) AS n FROM academy_evaluations WHERE evaluateur = ?').get(EVA).n;
  await api('POST', '/api/academy/admin/evaluateurs', { email: EVA, evaluateur: false }, jetons[ADMIN]);
  assert.strictEqual(dbq().prepare('SELECT COUNT(*) AS n FROM academy_evaluations WHERE evaluateur = ?').get(EVA).n,
    parEva, 'les évaluations prononcées restent au nom de leur évaluateur');
  await api('POST', '/api/academy/admin/evaluateurs', { email: EVA, evaluateur: true }, jetons[ADMIN]);
});

test('RETIRER LA DÉSIGNATION D\'UN ADMIN NE LUI RETIRE PAS SON DROIT D\'OFFICE', async () => {
  // Le piège de cet écran : il gère des DÉSIGNATIONS, pas le statut d'admin.
  // Retirer sa ligne à un administrateur retire bien la ligne — et ne change
  // rien à ce qu'il peut faire, puisque son droit ne venait pas de là.
  await api('POST', '/api/academy/admin/evaluateurs', { email: ADMIN, evaluateur: false }, jetons[ADMIN]);
  assert.strictEqual(dbq().prepare('SELECT actif FROM academy_evaluateurs WHERE email = ?').get(ADMIN).actif, 0,
    'la désignation est bien retirée');

  const moi = await api('GET', '/api/academy/moi', null, jetons[ADMIN]);
  assert.strictEqual(moi.body.admin, true, 'il reste administrateur');
  assert.strictEqual(moi.body.evaluateur, true, 'et évaluateur d\'office, désignation ou pas');
  assert.strictEqual((await api('GET', '/api/academy/evaluateur/collaborateurs', null, jetons[ADMIN])).status, 200);
  // Et il peut toujours ouvrir l'écran de gestion.
  assert.strictEqual((await api('GET', '/api/academy/admin/evaluateurs', null, jetons[ADMIN])).status, 200);
});

test('un évaluateur ORDINAIRE, lui, perd tout quand on le dédésigne', async () => {
  // Le contrepoint indispensable au test précédent : sans le statut d'admin,
  // la ligne EST le droit. Sans ce contraste, « évaluateur d'office » pourrait
  // masquer une garde qui ne refuse plus personne.
  await api('POST', '/api/academy/admin/evaluateurs', { email: EVA, evaluateur: false }, jetons[ADMIN]);
  const moi = await api('GET', '/api/academy/moi', null, jetons[EVA]);
  assert.strictEqual(moi.body.admin, false);
  assert.strictEqual(moi.body.evaluateur, false);
  const r = await api('GET', '/api/academy/evaluateur/collaborateurs', null, jetons[EVA]);
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.body.nonEvaluateur, true);
  // On la rétablit : les tests suivants la veulent évaluatrice.
  await api('POST', '/api/academy/admin/evaluateurs', { email: EVA, evaluateur: true }, jetons[ADMIN]);
});

test('le drapeau `admin` n\'ouvre aucune porte, il n\'affiche qu\'un écran', async () => {
  for (const e of [THEO, EVA, LEA]) {
    assert.strictEqual((await api('GET', '/api/academy/moi', null, jetons[e])).body.admin, false, e);
  }
  // Le prétendre dans une requête ne change rien : le serveur ne lit pas le corps.
  const r = await api('POST', '/api/academy/admin/evaluateurs',
    { email: THEO, evaluateur: true, admin: true }, jetons[THEO]);
  assert.strictEqual(r.status, 403);
  assert.strictEqual((await api('GET', '/api/academy/moi', null, jetons[THEO])).body.evaluateur, false,
    'aucun droit n\'a été accordé');
});

test('désigner un compte qui n\'existe pas reste refusé depuis l\'écran aussi', async () => {
  const r = await api('POST', '/api/academy/admin/evaluateurs', { email: 'inconnu@exemple.fr' }, jetons[ADMIN]);
  assert.strictEqual(r.status, 404);
  assert.strictEqual(dbq().prepare('SELECT COUNT(*) AS n FROM academy_evaluateurs WHERE email = ?')
    .get('inconnu@exemple.fr').n, 0);
});

test('un évaluateur externe reste gérable même s\'il n\'est plus collaborateur', async () => {
  // Sinon on ne pourrait plus lui retirer son droit depuis l'écran, et il
  // faudrait ressortir la ligne de commande — ce que cet écran doit éviter.
  await api('POST', '/api/academy/admin/evaluateurs', { email: OLIVIER, evaluateur: true }, jetons[ADMIN]);
  await api('POST', '/api/boost/admin/collaborateurs', { email: OLIVIER, role: 'client' }, jetons[ADMIN]);

  const comptes = (await api('GET', '/api/academy/admin/evaluateurs', null, jetons[ADMIN])).body.comptes;
  const o = comptes.find((c) => c.email === OLIVIER);
  assert.ok(o, 'il doit rester visible dans l\'écran');
  assert.strictEqual(o.evaluateur, true);
  assert.strictEqual(o.collaborateur, false, 'et signalé comme compte externe');

  await api('POST', '/api/boost/admin/collaborateurs', { email: OLIVIER, role: 'collaborateur' }, jetons[ADMIN]);
});

// ===========================================================================
//  8. L'ÉCRAN
// ===========================================================================

test('l\'écran présente les cinq états de l\'évaluation pratique', () => {
  for (const etat of ['non_accessible', 'a_realiser', 'en_attente', 'validee', 'a_repasser']) {
    assert.ok(js.includes(etat), 'état manquant : ' + etat);
  }
  for (const libelle of ['Non accessible', 'À réaliser', 'Résultat en attente',
    'Évaluation validée', 'Évaluation à repasser']) {
    assert.ok(js.includes(libelle), 'libellé manquant : ' + libelle);
  }
  assert.ok(html.includes('id="acEval"'));
  for (const cls of ['.ac-etat-p-validee', '.ac-eval-actions', '.ac-eval-l']) {
    assert.ok(css.includes(cls), 'style manquant : ' + cls);
  }
});

test('l\'écran ferme l\'étape quand la pratique est validée', () => {
  assert.ok(/p\.close/.test(js), 'la fiche évaluateur lit le drapeau de clôture');
  assert.ok(/Étape pratique terminée/.test(js), 'et l\'annonce à l\'évaluateur');
  assert.ok(/Aucune nouvelle évaluation ne peut être ouverte/.test(js), 'en disant pourquoi');
  assert.ok(/étape pratique est terminée : elle ne se repasse pas/.test(js),
    'le collaborateur aussi doit le lire');
});

test('l\'écran dit qu\'une pratique validée ne vaut pas certification', () => {
  // Depuis le lot 5, le nom de la formation vient du CATALOGUE : la phrase se
  // construit, elle n'est plus écrite en dur. Ce qu'on vérifie est qu'elle est
  // toujours dite — et qu'elle nomme la formation courante.
  assert.ok(/La certification ' \+ echapper\(nomFormation\(fCourante\)\) \+\s*\n?\s*' sera prononcée dans un second temps/.test(js),
    'le collaborateur doit lire que cette étape ne remplace pas la certification');
  assert.ok(/ne certifie pas le collaborateur/.test(js),
    'l\'évaluateur aussi doit le lire avant de prononcer son verdict');
});

test('l\'écran ne décide d\'aucun résultat : il les envoie', () => {
  const code = js.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.ok(!/resultat\s*=\s*\(/.test(code), 'aucun résultat calculé dans l\'écran');
  assert.ok(code.includes("enregistrer('valide')") && code.includes("enregistrer('a_repasser')"),
    'les deux verdicts sont des gestes explicites de l\'évaluateur');
  // Les deux boutons portent le verbe en toutes lettres : « ✓ » et « ✗ » se
  // confondent trop vite pour une décision qui ne se corrige pas.
  assert.ok(/Enregistrer : évaluation validée/.test(js));
  assert.ok(/Enregistrer : à repasser/.test(js));
});

test('l\'évaluateur est prévenu que son appréciation est lue par le collaborateur', () => {
  assert.ok(/communiquée au collaborateur/.test(js),
    'écrire une appréciation sans savoir qui la lira est un piège');
});

test('l\'écran de gestion affiche l\'état et confirme avant de retirer', () => {
  assert.ok(html.includes('id="acAdmin"'), 'la section existe');
  // LOT A : l'entrée a quitté le parcours de l'apprenant pour l'en-tête.
  // Administrer est un changement de rôle, pas une étape de formation.
  // L'entrée vit dans la BARRE LATÉRALE, rendue par le script : elle n'est
  // posée que pour qui a le droit, et c'est le serveur qui l'a dit
  // (`moiAdmin` / `moiEval` viennent de /api/academy/moi).
  assert.ok(html.includes('id="acSideNav"'), 'la barre latérale existe');
  assert.ok(/if \(moiAdmin\) entrees\.push\(/.test(js),
    'l\'entrée d\'administration n\'apparaît que pour un administrateur');
  assert.ok(/if \(moiEval\) entrees\.push\(/.test(js),
    'l\'entrée d\'évaluation n\'apparaît que pour un évaluateur');
  assert.ok(/'acRoleAdmin'/.test(js) && /'acRoleEval'/.test(js),
    'les deux entrées gardent leur identifiant');
  const sommaire = js.slice(js.indexOf('function rendreSommaire'), js.indexOf('function rendreModule'));
  assert.ok(!/acRoleAdmin|acRoleEval/.test(sommaire),
    'le parcours de l\'apprenant ne doit plus proposer de changer de rôle');
  assert.ok(/data-onglet="?/.test(js) || js.includes('data-onglet'), 'la gestion vit dans un onglet');
  assert.ok(/'Évaluateur'/.test(js) && /'Non évaluateur'/.test(js), 'les deux états sont nommés');
  assert.ok(/Désigner comme évaluateur/.test(js) && /Retirer le droit d/.test(js),
    'les deux gestes portent leur verbe en toutes lettres');
  assert.ok(/Confirmer le retrait/.test(js) && /Annuler/.test(js), 'le retrait se confirme');
  // Surtout PAS de boîte de dialogue du navigateur : elle fige la page et se
  // clique sans se lire.
  const code = js.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.ok(!/\b(confirm|alert|prompt)\s*\(/.test(code), 'aucune boîte de dialogue native');
  // L'écran dit la règle en vigueur : l'admin a ces droits d'office, la liste
  // sert à les donner à ceux qui ne sont pas administrateurs.
  // Le texte est écrit dans une chaîne JavaScript : l'apostrophe y est échappée.
  assert.ok(/sans être administrateur/.test(js) && /d\\?'office/.test(js),
    'l\'écran doit dire à quoi sert cette liste maintenant qu\'un admin évalue d\'office');
  for (const cls of ['.ac-etat-eval-oui', '.ac-etat-eval-non', '.ac-adm-danger', '.ac-adm-actions']) {
    assert.ok(css.includes(cls), 'style manquant : ' + cls);
  }
});

test('l\'écran ne décide d\'aucun droit : il les demande', () => {
  const code = js.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  // Le drapeau `admin` ne sert qu'à afficher : aucune branche ne l'utilise pour
  // accorder quoi que ce soit.
  assert.ok(!/moiEval\s*=\s*true/.test(code), 'l\'écran ne s\'accorde pas le droit d\'évaluer');
  assert.ok(!/moiAdmin\s*=\s*true/.test(code), 'ni celui d\'administrer');
  // Chaque changement repart du serveur.
  assert.ok(/adminComptes = r\.data\.comptes/.test(code), 'la liste vient toujours de la réponse serveur');
});

test('l\'écran n\'appelle que les routes du lot', () => {
  for (const route of ['/api/academy/pratique', '/api/academy/evaluateur/collaborateurs', '/evaluations']) {
    assert.ok(js.includes(route), 'appelle ' + route);
  }
  // Désigner un évaluateur est désormais un geste d'écran — mais UNIQUEMENT
  // celui-là : la route est gardée par exigeAdmin, et aucune autre
  // administration de l'Academy n'a été ouverte au passage.
  assert.ok(js.includes('/api/academy/admin/evaluateurs'), 'l\'écran gère les évaluateurs');
  // Le lot 4 en a ouvert une seconde — les certifications. Le lot 6 ouvre
  // l'administration des contenus, sur décision explicite : l'inventaire reste
  // donc CLOS, il a seulement changé de contenu. Toute route qui apparaîtrait
  // ici sans avoir été décidée fait échouer ce test, et c'est son seul rôle.
  const admin = js.match(/\/api\/academy\/admin\/[a-z]+/g) || [];
  assert.deepStrictEqual([...new Set(admin)].sort(),
    [
      '/api/academy/admin/arbre',         // lot 6 : la SEULE route qui porte le corrigé
      '/api/academy/admin/archiver',      // lot 6 : archiver / restaurer
      '/api/academy/admin/cas',           // étape 2 : le référentiel d'évaluation, administrable
      '/api/academy/admin/certifications',
      '/api/academy/admin/collaborateurs', // qui entre dans l'Academy — délègue au Boost
      '/api/academy/admin/contenus',
      '/api/academy/admin/evaluateurs',
      '/api/academy/admin/formations',
      '/api/academy/admin/import',        // étape 3 : une formation entière, en un JSON
      '/api/academy/admin/modules',
      '/api/academy/admin/ordre',
      '/api/academy/admin/questions',
      // Boîte à outils : la bibliothèque de ressources. Elle n'ouvre AUCUNE
      // route de parcours — ni arbre, ni progression, ni certification.
      '/api/academy/admin/ressources',
    ],
    'une autre route d\'administration a été ouverte : ' + admin.join(', '));
});
