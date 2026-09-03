'use strict';
// ============================================================================
//  MY COACH ACADEMY — LA CERTIFICATION AUTOMATIQUE.
//
//  L'étape « à certifier » a disparu. Avant ce lot, un coach dont TOUT était
//  validé attendait encore un clic ; le diplôme existe désormais dès que le
//  dernier prérequis est rempli.
//
//  CE QUE CETTE SUITE PROUVE :
//
//   1. LE DÉCLENCHEUR EST LE DERNIER PRÉREQUIS, pas un geste. Avec pratique
//      obligatoire, c'est le verdict de l'évaluation ; sans pratique, c'est le
//      QCM final.
//   2. RIEN N'EST DÉLIVRÉ TROP TÔT. Théorie manquante, pratique à repasser,
//      formation qui ne certifie pas : aucun diplôme.
//   3. AUCUN DOUBLON, JAMAIS. Plusieurs évaluations, plusieurs QCM rendus, une
//      seule certification pour un couple (coach, formation).
//   4. UNE CERTIFICATION EXISTANTE EST INTOUCHABLE. Elle n'est ni recréée, ni
//      réécrite, ni datée à nouveau.
//   5. L'ÉTAT INTERMÉDIAIRE N'EXISTE PLUS — ni dans le moteur, ni à l'écran.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DB = path.join(os.tmpdir(), `nutri-academy-certif-auto-${process.pid}.sqlite`);
process.env.NUTRITION_DB = DB;
process.env.ADMIN_EMAIL = 'patron@exemple.fr';

const app = require('../server');
const { STATUTS_COACH, RANG_STATUT } = require('../lib/academyCertifications');
const { terminerFormation, reussirQcm, criteresAcquis } = require('./aideAcademy');

let srv, base;
const ADMIN = 'patron@exemple.fr';
const EVA = 'eva@exemple.fr';
const NEUF = 'neuf@exemple.fr';        // n'a rien fait
const THEO = 'theo@exemple.fr';        // théorie validée seulement
const COMPLET = 'complet@exemple.fr';  // théorie + pratique
const ECHEC = 'echec@exemple.fr';      // pratique à repasser, puis validée
const SANS = 'sans@exemple.fr';        // formation sans pratique obligatoire
const jetons = {};

const PUBLIC = path.join(__dirname, '..', 'public');
const js = fs.readFileSync(path.join(PUBLIC, 'academy.js'), 'utf8');

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

const dbq = () => require('../lib/db').getDb();
const liste = async () => (await api('GET', '/api/academy/evaluateur/coachs', null, jetons[EVA])).body;
const statutDe = async (email) => ((await liste()).coachs.find((c) => c.email === email) || {}).statut;

// Une séance ouverte et, si un résultat est fourni, prononcée du même geste.
const evaluer = (cible, corps) => {
  const c = corps || {};
  const avec = c.resultat && !c.criteres ? { ...c, criteres: criteresAcquis(dbq()) } : c;
  return api('POST', `/api/academy/evaluateur/collaborateurs/${encodeURIComponent(cible)}/evaluations`,
    avec, jetons[EVA]);
};
// Les certifications d'un couple, lues en base : c'est la preuve, pas l'écran.
const certifsDe = (email, formation = 'coach_nutrition') =>
  dbq().prepare('SELECT * FROM academy_certifications WHERE email = ? AND formation = ? ORDER BY id')
    .all(email, formation);
const compterTout = () => dbq().prepare('SELECT COUNT(*) AS n FROM academy_certifications').get().n;

test.before(async () => {
  await new Promise((r) => { srv = app.listen(0, r); });
  base = `http://127.0.0.1:${srv.address().port}`;
  app.boost.assurerSchema();
  app.academyCertifications.assurerSchema();

  for (const [e, p] of [[ADMIN, '7777'], [EVA, '3003'], [NEUF, '1111'], [THEO, '2222'],
    [COMPLET, '3333'], [ECHEC, '4444'], [SANS, '5555']]) await connecter(e, p);
  for (const e of [EVA, NEUF, THEO, COMPLET, ECHEC, SANS]) {
    await api('POST', '/api/boost/admin/collaborateurs', { email: e, role: 'collaborateur' }, jetons[ADMIN]);
  }
  await api('POST', '/api/academy/admin/evaluateurs', { email: EVA }, jetons[ADMIN]);
});

test.after(() => {
  if (srv) srv.close();
  require('../lib/db').closeDb();
  ['', '-wal', '-shm'].forEach((s) => { try { fs.unlinkSync(DB + s); } catch (_) {} });
});

// ---------------------------------------------------------------------------
//  A. Théorie non validée : rien ne bouge.
// ---------------------------------------------------------------------------
test('A — sans théorie validée : ni à évaluer, ni certifié', async () => {
  assert.strictEqual(await statutDe(NEUF), 'formation_en_cours');
  assert.deepStrictEqual(certifsDe(NEUF), []);
  // La fiche est refusée : on ne peut même pas ouvrir une séance.
  const r = await evaluer(NEUF, { resultat: 'valide' });
  assert.strictEqual(r.status, 409, 'une pratique sans théorie validée doit être refusée');
  assert.deepStrictEqual(certifsDe(NEUF), [], 'un refus ne doit rien certifier');
});

// ---------------------------------------------------------------------------
//  B. Théorie validée : le coach entre dans « À évaluer », et PAS plus loin.
// ---------------------------------------------------------------------------
test('B — théorie validée : « pratique à réaliser », toujours aucun diplôme', async () => {
  await terminerFormation({ api, email: THEO, jeton: jetons[THEO] });
  const resultat = await reussirQcm({ api, jeton: jetons[THEO] });
  assert.strictEqual(resultat.reussie, true, 'le QCM doit être réussi');

  assert.strictEqual(await statutDe(THEO), 'pratique_a_realiser');
  assert.deepStrictEqual(certifsDe(THEO), [],
    'une théorie validée ne certifie pas une formation à pratique obligatoire');
});

// ---------------------------------------------------------------------------
//  C. Le verdict complète le parcours -> certification automatique.
// ---------------------------------------------------------------------------
test('C — théorie + pratique validées : la certification part TOUTE SEULE', async () => {
  await terminerFormation({ api, email: COMPLET, jeton: jetons[COMPLET] });
  await reussirQcm({ api, jeton: jetons[COMPLET] });
  assert.deepStrictEqual(certifsDe(COMPLET), [], 'rien avant le verdict');

  const r = await evaluer(COMPLET, { resultat: 'valide', dateEvaluation: '2026-09-03' });
  assert.strictEqual(r.status, 201);
  // La réponse le DIT : l'écran doit pouvoir afficher « certifié » aussitôt.
  assert.strictEqual(r.body.certificationAutomatique, true);
  assert.ok(r.body.certification, 'le diplôme doit repartir avec la réponse');

  const c = certifsDe(COMPLET);
  assert.strictEqual(c.length, 1, 'exactement une certification');
  assert.strictEqual(c[0].statut, 'delivree');
  assert.strictEqual(c[0].delivree_par, 'Academy', 'personne n\'a prononcé : c\'est la règle');
  // Les preuves sont recopiées, l'évaluateur compris : rien n'est perdu.
  assert.strictEqual(c[0].pratique_par, EVA);
  assert.strictEqual(c[0].pratique_le, '2026-09-03');
  assert.ok(c[0].score_qcm > 0, 'le score théorique doit être recopié');

  assert.strictEqual(await statutDe(COMPLET), 'certifie');
});

// ---------------------------------------------------------------------------
//  F + G. Un échec ne certifie rien ; plusieurs évaluations, un seul diplôme.
// ---------------------------------------------------------------------------
test('F — pratique à repasser : aucune certification', async () => {
  await terminerFormation({ api, email: ECHEC, jeton: jetons[ECHEC] });
  await reussirQcm({ api, jeton: jetons[ECHEC] });

  const r = await evaluer(ECHEC, { resultat: 'a_repasser', dateEvaluation: '2026-09-01', commentaire: 'À revoir.' });
  assert.strictEqual(r.status, 201);
  assert.ok(!r.body.certificationAutomatique, 'un échec ne déclenche rien');
  assert.deepStrictEqual(certifsDe(ECHEC), []);
  assert.strictEqual(await statutDe(ECHEC), 'pratique_a_repasser',
    'le coach reste à évaluer, selon la logique existante de nouvelle tentative');
});

test('G — plusieurs évaluations : UNE SEULE certification', async () => {
  // Deuxième séance, validée cette fois.
  const r = await evaluer(ECHEC, { resultat: 'valide', dateEvaluation: '2026-09-05' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.certificationAutomatique, true);
  assert.strictEqual(certifsDe(ECHEC).length, 1);

  // Les deux évaluations existent toujours : on ne réécrit pas l'histoire.
  const evals = dbq().prepare('SELECT resultat FROM academy_evaluations WHERE email = ? ORDER BY id').all(ECHEC);
  assert.deepStrictEqual(evals.map((e) => e.resultat), ['a_repasser', 'valide']);

  // Une troisième séance est refusée : l'étape est close.
  const encore = await evaluer(ECHEC, { resultat: 'valide', dateEvaluation: '2026-09-06' });
  assert.strictEqual(encore.status, 409);
  assert.strictEqual(certifsDe(ECHEC).length, 1, 'toujours une seule');
});

// ---------------------------------------------------------------------------
//  E. Une certification existante est intouchable.
// ---------------------------------------------------------------------------
test('E — un diplôme déjà délivré n\'est ni recréé, ni réécrit', async () => {
  const avant = certifsDe(COMPLET)[0];
  const totalAvant = compterTout();

  // On rejoue tout ce qui pourrait déclencher une délivrance : un nouveau QCM
  // rendu, et un appel direct à la délivrance automatique.
  await reussirQcm({ api, jeton: jetons[COMPLET] });
  const rejoue = app.academyCertifications.delivrerSiComplet(COMPLET, 'coach_nutrition');
  assert.strictEqual(rejoue.delivree, false);
  assert.strictEqual(rejoue.raison, 'deja_certifie');

  const apres = certifsDe(COMPLET);
  assert.strictEqual(apres.length, 1, 'aucune ligne ajoutée');
  assert.deepStrictEqual(apres[0], avant, 'la ligne n\'a pas bougé d\'un caractère');
  assert.strictEqual(compterTout(), totalAvant, 'le total n\'a pas changé');

  // Et la délivrance manuelle reste refusée, comme avant ce lot.
  const manuel = await api('POST', `/api/academy/admin/certifications/${encodeURIComponent(COMPLET)}`,
    { formation: 'coach_nutrition' }, jetons[ADMIN]);
  assert.strictEqual(manuel.status, 409);
  assert.strictEqual(certifsDe(COMPLET).length, 1);
});

// ---------------------------------------------------------------------------
//  D. Formation SANS pratique obligatoire : le QCM final suffit.
// ---------------------------------------------------------------------------
//  ⚠️ CE TEST BASCULE LE DRAPEAU de la formation, et il est donc placé EN
//  DERNIER : les cas ci-dessus éprouvent le parcours avec pratique obligatoire,
//  et doivent l'avoir fait avant qu'on y touche.
test('D — sans pratique obligatoire : le QCM final certifie à lui seul', async () => {
  // La route des réglages exige le libellé (elle passe par `definir`) : on lui
  // rend le sien, inchangé — on ne bascule QUE le drapeau de la pratique.
  const avant = app.academyFormations.lire('coach_nutrition');
  const r = await api('PUT', '/api/academy/admin/formations/coach_nutrition',
    { libelle: avant.libelle, titre: avant.titre, pratiqueObligatoire: false }, jetons[ADMIN]);
  assert.strictEqual(r.status, 200, 'le réglage doit passer : ' + JSON.stringify(r.body));
  assert.strictEqual(app.academyFormations.lire('coach_nutrition').pratiqueObligatoire, false);

  await terminerFormation({ api, email: SANS, jeton: jetons[SANS] });
  assert.deepStrictEqual(certifsDe(SANS), [], 'les contenus seuls ne certifient pas');

  const resultat = await reussirQcm({ api, jeton: jetons[SANS] });
  assert.strictEqual(resultat.reussie, true);

  const c = certifsDe(SANS);
  assert.strictEqual(c.length, 1, 'le QCM final doit avoir certifié');
  assert.strictEqual(c[0].delivree_par, 'Academy');
  assert.strictEqual(c[0].pratique_le, null, 'aucune pratique : aucune preuve pratique');
  assert.strictEqual(await statutDe(SANS), 'certifie');
});

// ---------------------------------------------------------------------------
//  L'ÉTAT INTERMÉDIAIRE A DISPARU — moteur et écran.
// ---------------------------------------------------------------------------
test('« certification_a_delivrer » n\'existe plus dans le moteur', () => {
  assert.ok(!STATUTS_COACH.includes('certification_a_delivrer'),
    'le statut ne doit plus faire partie des états du moteur');
  assert.strictEqual(STATUTS_COACH.length, 6, 'six états, plus sept');
  assert.strictEqual(RANG_STATUT.certification_a_delivrer, undefined,
    'le barème ne doit plus le classer');
  // Tous les états restants ont un rang : sans quoi un dossier serait trié
  // sur `undefined` et remonterait n'importe où.
  for (const s of STATUTS_COACH) {
    assert.strictEqual(typeof RANG_STATUT[s], 'number', 'rang manquant pour ' + s);
  }
});

test('L\'ÉCRAN NE PROPOSE PLUS « À certifier »', () => {
  assert.ok(!/certification_a_delivrer/.test(js), 'le statut ne doit plus être écrit dans l\'écran');
  assert.ok(!/'À certifier'/.test(js), 'ni l\'onglet, ni le compteur, ni la colonne');
  assert.ok(!/a_certifier/.test(js), 'ni la vue, ni le filtre d\'état');
  assert.ok(!/aCertifier/.test(js), 'ni le compteur de la ligne coach');
  // Les deux vues qui restent, et les deux compteurs.
  const kpis = js.slice(js.indexOf('const KPI_EVAL'), js.indexOf('const STATUTS_A_EVALUER'));
  assert.ok(/'À évaluer'/.test(kpis) && /'Certifiés'/.test(kpis), 'les deux compteurs demandés');
  assert.strictEqual((kpis.match(/\[' /g) || []).length, 0);
});

// ---------------------------------------------------------------------------
//  UNE FORMATION SANS PRATIQUE N'ENTRE PAS DANS LA FILE DE L'ÉVALUATEUR.
//
//  La file « À évaluer » ne doit contenir QUE des dossiers où une pratique est
//  obligatoire et pas encore validée. Une formation qui n'en demande aucune n'a
//  rien à y faire : le certificateur y verrait un rendez-vous à prendre pour
//  une épreuve qui n'existe pas.
// ---------------------------------------------------------------------------
test('SANS PRATIQUE OBLIGATOIRE, un dossier n\'entre JAMAIS dans « À évaluer »', async () => {
  // La formation ne demande ni pratique, ni certification : le coach qui valide
  // sa théorie a terminé tout ce qu'elle attend de lui.
  const avant = app.academyFormations.lire('coach_nutrition');
  const r = await api('PUT', '/api/academy/admin/formations/coach_nutrition',
    { libelle: avant.libelle, titre: avant.titre, pratiqueObligatoire: false, certificationActive: false },
    jetons[ADMIN]);
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));

  await connecter('fini@exemple.fr', '8888');
  await api('POST', '/api/boost/admin/collaborateurs', { email: 'fini@exemple.fr', role: 'collaborateur' }, jetons[ADMIN]);
  await terminerFormation({ api, email: 'fini@exemple.fr', jeton: jetons['fini@exemple.fr'] });
  await reussirQcm({ api, jeton: jetons['fini@exemple.fr'] });

  const statut = await statutDe('fini@exemple.fr');
  const FILE = ['pratique_a_realiser', 'resultat_en_attente', 'pratique_a_repasser'];
  assert.ok(!FILE.includes(statut),
    'une formation sans pratique obligatoire ne doit pas réclamer d\'évaluation — statut : ' + statut);
  assert.strictEqual(statut, 'pratique_validee',
    'son parcours est achevé de son côté : rien n\'est attendu de l\'évaluateur');
});

// ---------------------------------------------------------------------------
//  LA VUE « CERTIFICATIONS » DIT LE DIPLÔME, ET NE PROMET RIEN D'AUTRE.
// ---------------------------------------------------------------------------
test('une ligne certifiée porte sa date, et AUCUNE action à venir', () => {
  const bloc = js.slice(js.indexOf('function ligneCoach'), js.indexOf('// ==========================================================================='
    + '\n//  LA VUE GLOBALE'));
  // La date du diplôme est affichée quand il y en a un.
  assert.ok(/certification && c\.certification\.certification/.test(bloc),
    'la ligne doit lire le diplôme pour en afficher la date');
  assert.ok(/dateFr\(cert\.obtenueLe\)/.test(bloc), 'la date d\'obtention doit être rendue');
  // ⚠️ « Dès la théorie validée » ne se dit QUE si une action est attendue et
  // que la fiche n'est pas encore ouvrable. Sur un dossier certifié, la cellule
  // reste vide : cette phrase y annonçait une étape déjà franchie.
  assert.ok(/action && !ouvrable/.test(bloc),
    'la note d\'attente doit être conditionnée à une action réellement attendue');
  // Et « certifie » n'a aucune action : c'est ce qui garde la cellule vide.
  const actions = js.slice(js.indexOf('const ACTION = {'), js.indexOf('const ORDRE_TRAVAIL'));
  assert.ok(!/certifie:/.test(actions), 'un dossier certifié n\'attend aucune action');
});
