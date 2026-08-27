'use strict';
// ============================================================================
//  MY COACH ACADEMY — certification finale (lot 4).
//
//  CINQ PROPRIÉTÉS SONT ATTAQUÉES ICI :
//
//   1. LES PRÉREQUIS TIENNENT À L'ÉCRITURE. On tente de délivrer sans théorie,
//      sans pratique, puis avec les deux — par l'API, pas par l'écran.
//   2. LA PORTE PARALLÈLE EST FERMÉE. On tente de certifier depuis
//      l'administration du Boost, de toutes les façons possibles.
//   3. PERSONNE NE SE CERTIFIE SOI-MÊME, ET PAS DE DOUBLON. Le second est tenu
//      par la base (index unique partiel), pas seulement par du code.
//   4. UN RETRAIT N'EFFACE RIEN. Motif obligatoire, historique conservé, droits
//      Boost fermés dans la seconde.
//   5. LE MOTEUR EST GÉNÉRIQUE. Il ne connaît aucune formation : il lit un
//      registre. On le vérifie sur le code, pas sur une intention.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DB = path.join(os.tmpdir(), `nutri-academy-cert-test-${process.pid}.sqlite`);
process.env.NUTRITION_DB = DB;
process.env.ADMIN_EMAIL = 'patron@exemple.fr';

const app = require('../server');
const C = require('../lib/academyCertifications');
const F = require('../lib/academyFormations');
const { certifierAncienne, terminerFormation, reussirQcm } = require('./aideAcademy');
let srv, base;

const ADMIN = 'patron@exemple.fr';
const EVA = 'eva.c@exemple.fr';        // évaluatrice
const THEO = 'theo.c@exemple.fr';      // le parcours principal
const NINA = 'nina.c@exemple.fr';      // théorie seule : jamais éligible
const SACHA = 'sacha.c@exemple.fr';    // rien du tout
const ANCIEN = 'ancien.c@exemple.fr';  // certifié AVANT l'Academy
const LEA = 'lea.c@exemple.fr';        // cliente
const jetons = {};

const PUBLIC = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUBLIC, 'academy.html'), 'utf8');
const js = fs.readFileSync(path.join(PUBLIC, 'academy.js'), 'utf8');
const css = fs.readFileSync(path.join(PUBLIC, 'academy.css'), 'utf8');
const appJs = fs.readFileSync(path.join(PUBLIC, 'app.js'), 'utf8');
const moteur = fs.readFileSync(path.join(__dirname, '..', 'lib', 'academyCertifications.js'), 'utf8');

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
const certifDe = async (email) => (await api('GET', '/api/academy/certification', null, jetons[email])).body.certifications[0];
const delivrer = (cible, par, corps) =>
  api('POST', `/api/academy/admin/certifications/${encodeURIComponent(cible)}`, corps || {}, jetons[par]);
const retirer = (cible, par, corps) =>
  api('POST', `/api/academy/admin/certifications/${encodeURIComponent(cible)}/retrait`, corps || {}, jetons[par]);

const validerPratique = (cible) =>
  api('POST', `/api/academy/evaluateur/collaborateurs/${encodeURIComponent(cible)}/evaluations`,
    { resultat: 'valide', dateEvaluation: '2026-09-10' }, jetons[EVA]);

test.before(async () => {
  await new Promise((r) => { srv = app.listen(0, r); });
  base = `http://127.0.0.1:${srv.address().port}`;
  app.boost.assurerSchema();
  app.academyCertifications.assurerSchema();
  for (const [e, p] of [[ADMIN, '7777'], [EVA, '3003'], [THEO, '4004'], [NINA, '5005'],
    [SACHA, '6006'], [ANCIEN, '2002'], [LEA, '1001']]) {
    await connecter(e, p);
  }
  for (const e of [EVA, THEO, NINA, SACHA, ANCIEN]) {
    await api('POST', '/api/boost/admin/collaborateurs', { email: e, role: 'collaborateur' }, jetons[ADMIN]);
  }
  await api('POST', '/api/academy/admin/evaluateurs', { email: EVA }, jetons[ADMIN]);
  // Nina valide sa théorie et RIEN d'autre : elle éprouve le prérequis pratique.
  await terminerFormation({ api, email: NINA, jeton: jetons[NINA] });
  await reussirQcm({ api, jeton: jetons[NINA] });
  // Un certifié d'AVANT l'Academy : le cas hérité, plus atteignable par l'API.
  certifierAncienne({ db: dbq(), email: ANCIEN });
});

test.after(() => {
  if (srv) srv.close();
  require('../lib/db').closeDb();
  ['', '-wal', '-shm'].forEach((s) => { try { fs.unlinkSync(DB + s); } catch (_) {} });
});

// ===========================================================================
//  1. LE MOTEUR EST GÉNÉRIQUE
// ===========================================================================

test('le moteur ne connaît aucune formation : il lit un registre', () => {
  // On juge sur le CODE, commentaires retirés. « Coach Nutrition » ne doit
  // apparaître nulle part dans le moteur — sinon ce n'est pas un moteur.
  const code = moteur.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('--')).join('\n');
  assert.ok(!/coach_nutrition|Coach Nutrition/.test(code),
    'le moteur nomme une formation : il n\'est pas générique');
  assert.ok(code.includes('formations.lire') && code.includes('f.prerequis'),
    'il passe par le registre pour tout');
});

test('le registre décrit la formation, ses prérequis et ce qu\'elle ouvre', () => {
  const liste = app.academyCertifications.formations();
  assert.strictEqual(liste.length, 1, 'une seule formation aujourd\'hui');
  assert.strictEqual(liste[0].cle, F.COACH_NUTRITION);
  assert.strictEqual(liste[0].refletBoost, true, 'c\'est elle qui ouvre les dossiers Boost');

  const e = app.academyCertifications.etatPour(THEO);
  assert.deepStrictEqual(e.prerequis.map((p) => p.cle), ['theorie', 'pratique'],
    'les prérequis viennent du registre, dans l\'ordre où on les raconte');
});

test('la table est nativement multi-formation', () => {
  const cols = dbq().prepare('PRAGMA table_info(academy_certifications)').all().map((c) => c.name);
  assert.ok(cols.includes('formation'), 'colonnes : ' + cols.join(', '));
  // L'unicité porte sur le COUPLE, et seulement sur les certifications actives.
  const idx = dbq().prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_academy_cert_active'").get();
  assert.ok(idx && /email, formation/.test(idx.sql), 'index : ' + (idx && idx.sql));
  assert.ok(/WHERE statut = 'delivree'/.test(idx.sql), 'les lignes retirées ne bloquent pas une nouvelle délivrance');
});

test('aucun ALTER TABLE users : le lot n\'ajoute que sa table', () => {
  const cols = dbq().prepare('PRAGMA table_info(users)').all().map((c) => c.name.toLowerCase());
  for (const interdit of ['certif', 'academy', 'diplome', 'formation']) {
    assert.ok(!cols.some((c) => c.includes(interdit)), 'colonne ajoutée à users : ' + cols.join(', '));
  }
});

// ===========================================================================
//  2. LES PRÉREQUIS
// ===========================================================================

test('sans jeton, aucune route de certification ne répond', async () => {
  for (const [m, route] of [['GET', '/api/academy/certification'],
    ['GET', '/api/academy/admin/certifications'],
    ['POST', `/api/academy/admin/certifications/${THEO}`],
    ['POST', `/api/academy/admin/certifications/${THEO}/retrait`]]) {
    assert.strictEqual((await api(m, route, m === 'GET' ? null : {})).status, 401, `${m} ${route}`);
  }
});

test('rien de validé : non éligible, et les deux prérequis sont annoncés', async () => {
  const c = await certifDe(SACHA);
  assert.strictEqual(c.etat, 'non_eligible');
  assert.strictEqual(c.eligible, false);
  assert.strictEqual(c.certifie, false);
  assert.deepStrictEqual(c.manquants, ['theorie', 'pratique']);
  assert.ok(c.prerequis.every((p) => p.rempli === false));
  assert.deepStrictEqual(c.historique, []);
});

test('QCM validé mais pratique non validée : TOUJOURS PAS certifiable', async () => {
  const c = await certifDe(NINA);
  assert.strictEqual(c.prerequis.find((p) => p.cle === 'theorie').rempli, true);
  assert.strictEqual(c.prerequis.find((p) => p.cle === 'pratique').rempli, false);
  assert.strictEqual(c.eligible, false);
  assert.deepStrictEqual(c.manquants, ['pratique']);

  // Et l'API refuse, pas seulement l'écran.
  const r = await delivrer(NINA, ADMIN);
  assert.strictEqual(r.status, 409);
  assert.deepStrictEqual(r.body.prerequisManquants, ['pratique']);
  assert.strictEqual(dbq().prepare('SELECT COUNT(*) AS n FROM academy_certifications WHERE email = ?').get(NINA).n, 0);
});

test('la pratique est inaccessible sans théorie : la chaîne tient d\'elle-même', async () => {
  // Sacha n'a pas validé sa théorie : le lot 3 refuse d'ouvrir une évaluation.
  const r = await api('POST', `/api/academy/evaluateur/collaborateurs/${SACHA}/evaluations`,
    { resultat: 'valide' }, jetons[EVA]);
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.body.theorieNonValidee, true);
  assert.strictEqual((await delivrer(SACHA, ADMIN)).status, 409);
});

test('théorie + pratique validées : ÉLIGIBLE — et toujours pas certifié', async () => {
  await terminerFormation({ api, email: THEO, jeton: jetons[THEO] });
  await reussirQcm({ api, jeton: jetons[THEO] });
  assert.strictEqual((await validerPratique(THEO)).status, 201);

  const c = await certifDe(THEO);
  assert.strictEqual(c.etat, 'eligible');
  assert.strictEqual(c.eligible, true);
  assert.strictEqual(c.certifie, false, 'ÉLIGIBLE N\'EST PAS CERTIFIÉ');
  assert.deepStrictEqual(c.manquants, []);
  assert.ok(c.prerequis.every((p) => p.rempli));
  // Rien n'a été accordé côté Boost.
  assert.strictEqual(app.boost.estCoachCertifie(THEO), false);
  assert.strictEqual((await api('GET', '/api/boost/coach/dossiers', null, jetons[THEO])).status, 403);
});

// ===========================================================================
//  3. QUI DÉLIVRE
// ===========================================================================

test('un client, un collaborateur, un évaluateur : aucun ne délivre', async () => {
  for (const e of [LEA, THEO, EVA]) {
    const r = await delivrer(THEO, e);
    assert.strictEqual(r.status, 403, e);
  }
  assert.strictEqual((await api('GET', '/api/academy/admin/certifications', null, jetons[EVA])).status, 403,
    'être évaluateur ne donne pas accès à l\'écran de certification');
  assert.strictEqual((await certifDe(THEO)).certifie, false);
});

test('un client n\'atteint même pas la lecture de sa certification', async () => {
  const r = await api('GET', '/api/academy/certification', null, jetons[LEA]);
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.body.nonCollaborateur, true);
});

test('PERSONNE NE SE CERTIFIE SOI-MÊME', async () => {
  // L'administrateur pourrait être collaborateur : le refus vaut pour lui aussi.
  await api('POST', '/api/boost/admin/collaborateurs', { email: ADMIN, role: 'collaborateur' }, jetons[ADMIN]);
  const r = await delivrer(ADMIN, ADMIN);
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.body.autoCertification, true);
  assert.ok(/sa propre certification/i.test(r.body.error));
  await api('POST', '/api/boost/admin/collaborateurs', { email: ADMIN, role: 'client' }, jetons[ADMIN]);
});

test('on ne certifie ni un inconnu, ni un client', async () => {
  for (const cible of ['fantome@exemple.fr', LEA]) {
    assert.strictEqual((await delivrer(cible, ADMIN)).status, 404, cible);
  }
});

// ===========================================================================
//  4. LA DÉLIVRANCE
// ===========================================================================

test('une date d\'obtention mal formée est refusée', async () => {
  const r = await delivrer(THEO, ADMIN, { obtenueLe: '15/09/2026' });
  assert.strictEqual(r.status, 400);
  assert.ok(/AAAA-MM-JJ/.test(r.body.error));
  assert.strictEqual((await certifDe(THEO)).certifie, false, 'rien n\'a été délivré');
});

test('l\'administrateur délivre : date, identité et preuves sont figées', async () => {
  const r = await delivrer(THEO, ADMIN, { obtenueLe: '2026-09-15', commentaire: 'Parcours net.' });
  assert.strictEqual(r.status, 201);
  const d = r.body.certification;

  assert.strictEqual(d.statut, 'delivree');
  assert.strictEqual(d.active, true);
  assert.strictEqual(d.formation, F.COACH_NUTRITION);
  assert.strictEqual(d.obtenueLe, '2026-09-15', 'la date d\'obtention, telle que saisie');
  assert.strictEqual(d.delivreePar, ADMIN, 'qui a délivré — pris sur le jeton');
  assert.ok(d.delivreeLe, 'et quand la saisie a eu lieu');
  assert.strictEqual(d.commentaire, 'Parcours net.');
  // Les PREUVES recopiées : le diplôme se relit seul.
  assert.strictEqual(d.scoreQcm, 100);
  assert.strictEqual(d.pratiqueLe, '2026-09-10');
  assert.strictEqual(d.pratiquePar, EVA);
  assert.strictEqual(r.body.etat.etat, 'certifie');
});

test('l\'identité du délivreur vient du jeton, pas du corps de la requête', async () => {
  const c = await certifDe(THEO);
  assert.strictEqual(c.certification.delivreePar, ADMIN);
  // Le corps prétendait autre chose lors de la délivrance : rien n'a été lu.
  assert.notStrictEqual(c.certification.delivreePar, EVA);
  const ligne = dbq().prepare(
    "SELECT delivree_par, statut FROM academy_certifications WHERE email = ? AND statut = 'delivree'").get(THEO);
  assert.strictEqual(ligne.delivree_par, ADMIN);
});

test('PAS DE DOUBLON : ni par l\'API, ni en base', async () => {
  const r = await delivrer(THEO, ADMIN);
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.body.dejaCertifie, true);

  // Et la base elle-même refuse : l'index unique partiel est la vraie garantie.
  assert.throws(() => {
    dbq().prepare(`INSERT INTO academy_certifications
      (email, formation, statut, obtenue_le, delivree_par, delivree_le, maj_le)
      VALUES (?,?,?,?,?,?,?)`)
      .run(THEO, F.COACH_NUTRITION, 'delivree', '2026-01-01', ADMIN, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
  }, /UNIQUE/, 'la base doit refuser une seconde certification active');

  assert.strictEqual(dbq().prepare(
    "SELECT COUNT(*) AS n FROM academy_certifications WHERE email = ? AND statut = 'delivree'").get(THEO).n, 1);
});

// ===========================================================================
//  5. CE QUE LA CERTIFICATION OUVRE
// ===========================================================================

test('le reflet Boost est posé, et les dossiers s\'ouvrent', async () => {
  const cert = app.boost.lireCertification(THEO);
  assert.strictEqual(cert.statut, 'certifie');
  assert.strictEqual(cert.dateCertification, '2026-09-15');
  assert.strictEqual(cert.evaluateur, ADMIN, 'le Boost enregistre qui a délivré');
  assert.strictEqual(app.boost.estCoachCertifie(THEO), true);

  const r = await api('GET', '/api/boost/coach/dossiers', null, jetons[THEO]);
  assert.strictEqual(r.status, 200, 'le parcours complet se referme : il peut exercer');

  // Et il devient attribuable dans l'écran d'administration du Boost.
  const liste = (await api('GET', '/api/boost/admin/collaborateurs', null, jetons[ADMIN])).body.collaborateurs;
  assert.strictEqual(liste.find((c) => c.email === THEO).peutSuivre, true);
});

test('la carte du collaborateur annonce le diplôme et son historique', async () => {
  const c = await certifDe(THEO);
  assert.strictEqual(c.certifie, true);
  assert.strictEqual(c.titre, 'Coach Nutrition certifié');
  assert.strictEqual(c.historique.length, 1);
  assert.strictEqual(c.historique[0].statut, 'delivree');
});

// ===========================================================================
//  6. LA PORTE PARALLÈLE EST FERMÉE
// ===========================================================================

test('le Boost ne peut plus certifier un compte sans diplôme Academy', async () => {
  for (const corps of [
    { statut: 'certifie', evaluateur: 'Stan Martin', dateCertification: '2026-01-01' },
    { statut: 'certifie', evaluateur: 'Stan', scoreQcm: 100, resultatPratique: 'valide' },
  ]) {
    const r = await api('PUT', `/api/boost/admin/certification/${NINA}`, corps, jetons[ADMIN]);
    assert.strictEqual(r.status, 409, JSON.stringify(corps));
    assert.strictEqual(r.body.academyRequise, true);
    assert.ok(/Academy/.test(r.body.error));
  }
  assert.strictEqual(app.boost.estCoachCertifie(NINA), false);
  assert.strictEqual((await api('GET', '/api/boost/coach/dossiers', null, jetons[NINA])).status, 403);
});

test('le Boost garde ses gestes utiles : suspendre, retirer, annoter', async () => {
  for (const statut of ['suspendu', 'en_cours', 'non_certifie']) {
    const r = await api('PUT', `/api/boost/admin/certification/${NINA}`,
      { statut, commentaire: 'note' }, jetons[ADMIN]);
    assert.strictEqual(r.status, 200, statut);
  }
});

test('une RÉACTIVATION reste possible quand l\'Academy a délivré', async () => {
  await api('PUT', `/api/boost/admin/certification/${THEO}`, { statut: 'suspendu' }, jetons[ADMIN]);
  assert.strictEqual(app.boost.estCoachCertifie(THEO), false, 'la suspension ferme le droit');
  assert.strictEqual((await certifDe(THEO)).certifie, true, 'mais le diplôme reste');

  const r = await api('PUT', `/api/boost/admin/certification/${THEO}`,
    { statut: 'certifie', evaluateur: 'Stan Martin', dateCertification: '2026-09-15' }, jetons[ADMIN]);
  assert.strictEqual(r.status, 200, 'lever une suspension n\'est pas délivrer');
  assert.strictEqual(app.boost.estCoachCertifie(THEO), true);
});

// ===========================================================================
//  7. LE RETRAIT
// ===========================================================================

test('un retrait sans motif est refusé', async () => {
  for (const corps of [{}, { motif: '' }, { motif: '   ' }]) {
    const r = await retirer(THEO, ADMIN, corps);
    assert.strictEqual(r.status, 400, JSON.stringify(corps));
    assert.strictEqual(r.body.motifRequis, true);
  }
  assert.strictEqual((await certifDe(THEO)).certifie, true, 'rien n\'a bougé');
});

test('retirer ferme les droits — et n\'efface RIEN', async () => {
  const r = await retirer(THEO, ADMIN, { motif: 'Suite à un signalement client.' });
  assert.strictEqual(r.status, 200);
  const d = r.body.certification;
  assert.strictEqual(d.statut, 'retiree');
  assert.strictEqual(d.active, false);
  assert.strictEqual(d.motifRetrait, 'Suite à un signalement client.');
  assert.strictEqual(d.retireePar, ADMIN);
  assert.ok(d.retireeLe);
  // Tout ce qui décrivait la délivrance est intact.
  assert.strictEqual(d.obtenueLe, '2026-09-15');
  assert.strictEqual(d.delivreePar, ADMIN);
  assert.strictEqual(d.scoreQcm, 100);
  assert.strictEqual(d.pratiquePar, EVA);

  // Les droits Boost se ferment dans la seconde.
  assert.strictEqual(app.boost.estCoachCertifie(THEO), false);
  assert.strictEqual(app.boost.lireCertification(THEO).statut, 'non_certifie');
  assert.strictEqual((await api('GET', '/api/boost/coach/dossiers', null, jetons[THEO])).status, 403);
});

test('après un retrait, le collaborateur redevient éligible — pas certifié', async () => {
  const c = await certifDe(THEO);
  assert.strictEqual(c.certifie, false);
  assert.strictEqual(c.eligible, true, 'son parcours reste validé');
  assert.strictEqual(c.historique.length, 1, 'le diplôme retiré reste dans l\'historique');
  assert.strictEqual(c.historique[0].statut, 'retiree');
});

test('retirer deux fois répond 404, et n\'invente pas de ligne', async () => {
  assert.strictEqual((await retirer(THEO, ADMIN, { motif: 'encore' })).status, 404);
  assert.strictEqual(dbq().prepare('SELECT COUNT(*) AS n FROM academy_certifications WHERE email = ?').get(THEO).n, 1);
});

test('redélivrer crée une NOUVELLE ligne : l\'historique se lit comme un parcours', async () => {
  const r = await delivrer(THEO, ADMIN, { obtenueLe: '2026-10-01' });
  assert.strictEqual(r.status, 201);
  const c = await certifDe(THEO);
  assert.strictEqual(c.certifie, true);
  assert.strictEqual(c.historique.length, 2);
  assert.strictEqual(c.historique[0].statut, 'delivree', 'la plus récente en tête');
  assert.strictEqual(c.historique[0].obtenueLe, '2026-10-01');
  assert.strictEqual(c.historique[1].statut, 'retiree');
  assert.ok(/signalement/.test(c.historique[1].motifRetrait), 'le motif d\'origine est intact');
  assert.strictEqual(app.boost.estCoachCertifie(THEO), true, 'les droits sont rouverts');
});

// ===========================================================================
//  8. LES ÉCARTS ACADEMY / BOOST
// ===========================================================================

test('un écart est NOMMÉ, jamais masqué', async () => {
  // Suspension : différence attendue, pas une anomalie.
  await api('PUT', `/api/boost/admin/certification/${THEO}`, { statut: 'suspendu' }, jetons[ADMIN]);
  let d = (await api('GET', '/api/academy/admin/certifications', null, jetons[ADMIN])).body;
  let e = d.ecarts.find((x) => x.email === THEO);
  assert.ok(e, 'la suspension doit apparaître comme un écart');
  assert.strictEqual(e.anomalie, false, 'une suspension est une décision, pas un bug');
  assert.ok(/suspendus/.test(e.explication));

  // Modification directe du reflet : anomalie franche.
  await api('PUT', `/api/boost/admin/certification/${THEO}`, { statut: 'non_certifie' }, jetons[ADMIN]);
  d = (await api('GET', '/api/academy/admin/certifications', null, jetons[ADMIN])).body;
  e = d.ecarts.find((x) => x.email === THEO);
  assert.strictEqual(e.anomalie, true);
  assert.ok(/en dehors de l'Academy/.test(e.explication));

  await api('PUT', `/api/boost/admin/certification/${THEO}`,
    { statut: 'certifie', evaluateur: 'Stan Martin' }, jetons[ADMIN]);
});

test('un certifié ANTÉRIEUR à l\'Academy est signalé, pas effacé', async () => {
  const d = (await api('GET', '/api/academy/admin/certifications', null, jetons[ADMIN])).body;
  const e = d.ecarts.find((x) => x.email === ANCIEN);
  assert.ok(e, 'il doit apparaître : ses droits sont ouverts sans diplôme Academy');
  assert.strictEqual(e.academy, 'aucune');
  assert.strictEqual(e.boost, 'certifie');
  assert.strictEqual(e.anomalie, true);
  assert.ok(/antérieure/.test(e.explication));
  // On ne lui retire rien : ses droits restent, c'est une décision humaine.
  assert.strictEqual(app.boost.estCoachCertifie(ANCIEN), true);
});

test('les listes de l\'administrateur séparent éligibles et certifiés', async () => {
  const d = (await api('GET', '/api/academy/admin/certifications', null, jetons[ADMIN])).body;
  assert.ok(d.certifies.some((c) => c.email === THEO));
  assert.ok(!d.eligibles.some((c) => c.email === THEO), 'un certifié n\'est plus « à délivrer »');
  assert.ok(!d.eligibles.some((c) => c.email === NINA), 'sa pratique n\'est pas validée');
  assert.ok(!d.certifies.some((c) => c.email === LEA), 'un client n\'est pas là');
  assert.ok(d.formations.some((f) => f.cle === F.COACH_NUTRITION));
});

// ===========================================================================
//  9. LE DIPLÔME NE BOUGE PLUS
// ===========================================================================

test('modifier l\'Academy après coup ne réécrit pas un diplôme délivré', () => {
  const avant = dbq().prepare(
    "SELECT * FROM academy_certifications WHERE email = ? AND statut = 'delivree'").get(THEO);

  // On abîme la banque de questions et la configuration sous le diplôme.
  dbq().prepare('UPDATE academy_questions SET actif = 0').run();
  app.academyQcm.definirConfig({ nbQuestions: 1, seuilPct: 100 }, ADMIN);

  const apres = dbq().prepare(
    "SELECT * FROM academy_certifications WHERE email = ? AND statut = 'delivree'").get(THEO);
  assert.deepStrictEqual(apres, avant, 'le diplôme n\'a pas bougé d\'un caractère');
  assert.strictEqual(apres.score_qcm, 100, 'la preuve recopiée tient');

  dbq().prepare('UPDATE academy_questions SET actif = 1').run();
  app.academyQcm.definirConfig({ nbQuestions: 5, seuilPct: 80 }, ADMIN);
});

// ===========================================================================
//  10. L'ÉCRAN
// ===========================================================================

test('l\'écran présente les trois états et les prérequis un par un', () => {
  assert.ok(html.includes('id="acAdmin"'));
  for (const etat of ['non_eligible', 'eligible', 'certifie']) {
    assert.ok(js.includes(etat), 'état manquant : ' + etat);
  }
  for (const libelle of ['Non éligible', 'Éligible à la certification', 'Certifié']) {
    assert.ok(js.includes(libelle), 'libellé manquant : ' + libelle);
  }
  assert.ok(/ac-cert-prereq/.test(js), 'les prérequis sont listés');
  for (const cls of ['.ac-cert-prereq', '.ac-etat-c-certifie', '.ac-ecarts', '.ac-adm-onglets']) {
    assert.ok(css.includes(cls), 'style manquant : ' + cls);
  }
});

test('l\'écran dit qu\'éligible n\'est pas certifié, et exige un motif au retrait', () => {
  assert.ok(/tu n\\?'es pas encore/.test(js), 'l\'éligible doit lire qu\'il n\'est pas certifié');
  assert.ok(/Motif du retrait \(obligatoire\)/.test(js));
  assert.ok(/Confirmer le retrait/.test(js) && /Confirmer la délivrance/.test(js),
    'les deux gestes se confirment');
  const code = js.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.ok(!/\b(confirm|alert|prompt)\s*\(/.test(code), 'aucune boîte de dialogue native');
});

test('l\'écran affiche les écarts au lieu de les taire', () => {
  assert.ok(/Écarts entre l\\?'Academy et le Boost/.test(js));
  assert.ok(/à corriger/.test(js) && /situation attendue/.test(js),
    'les deux natures d\'écart sont distinguées');
});

test('l\'écran d\'administration du Boost dit d\'où vient la certification', () => {
  assert.ok(/délivrée par My Coach Academy/.test(appJs),
    'le vocabulaire doit désigner l\'Academy comme source');
  assert.ok(/ne peut pas être accordée depuis cet écran/.test(appJs),
    'et prévenir que la tentative sera refusée');
  assert.ok(/Certifié \(Academy\)/.test(appJs), 'le libellé du statut le rappelle');
});
