'use strict';
// ============================================================================
//  MY COACH ACADEMY — l'espace « Évaluer & certifier » (lot 7).
//
//  CE QUI EST ATTAQUÉ ICI, ET POURQUOI :
//
//   1. LE STATUT UNIQUE. Un coach a UN état dans cette liste, jamais deux. On
//      fait avancer sept personnes le long du parcours et on lit le nom que la
//      liste leur donne à chaque palier. C'est le seul endroit de l'app où ces
//      sept noms existent : s'ils divergent de la réalité, l'évaluateur
//      travaille sur une fiction.
//
//   2. PERSONNE NE DISPARAÎT. L'ancienne liste filtrait sur « théorie
//      validée » : un coach encore dans ses vidéos n'existait pour personne.
//      La nouvelle les montre tous — c'est même la raison d'être du lot.
//
//   3. LE DROIT ÉLARGI S'ARRÊTE NET. Administrer implique évaluer et
//      certifier ; évaluer n'implique RIEN d'autre. On attaque les onze routes
//      d'administration avec le jeton d'une évaluatrice.
//
//   4. LE CLOISONNEMENT PAR FORMATION tient dans la liste comme ailleurs.
//
//  ⚠️ CE FICHIER NE REJOUE PAS le lot 3. L'immuabilité des évaluations, le
//  refus de l'auto-évaluation et l'absence de certification automatique sont
//  éprouvés dans academyPratique.test.js et academyCertifications.test.js. Ici
//  on éprouve la COMPOSITION, pas les règles qu'elle compose.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DB = path.join(os.tmpdir(), `nutri-academy-espace-test-${process.pid}.sqlite`);
process.env.NUTRITION_DB = DB;
process.env.ADMIN_EMAIL = 'patron@exemple.fr';

const app = require('../server');
const { STATUTS_COACH } = require('../lib/academyCertifications');
const { terminerFormation, reussirQcm } = require('./aideAcademy');

let srv, base;

const ADMIN = 'patron@exemple.fr';
const EVA = 'eva.e@exemple.fr';        // évaluatrice DÉSIGNÉE, pas administratrice
const DEBUT = 'debut.e@exemple.fr';    // n'a rien commencé
const THEORIE = 'theorie.e@exemple.fr'; // théorie validée, pratique à faire
const ATTENTE = 'attente.e@exemple.fr'; // séance ouverte, verdict à venir
const REPASSE = 'repasse.e@exemple.fr'; // pratique à repasser
const PRET = 'pret.e@exemple.fr';      // pratique validée -> à certifier
const DIPLOME = 'diplome.e@exemple.fr'; // certifié
const LEA = 'lea.e@exemple.fr';        // cliente : jamais dans la liste
const jetons = {};

const PUBLIC = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUBLIC, 'academy.html'), 'utf8');
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

async function connecter(email, pin) {
  const r = await api('POST', '/account/login', { email, prenom: email.split('@')[0], pin });
  jetons[email] = r.body.token;
}

const liste = async (jeton) => (await api('GET', '/api/academy/evaluateur/coachs', null, jeton)).body;
const statutDe = (d, email) => (d.coachs.find((c) => c.email === email) || {}).statut;
const ligneDe = (d, email) => d.coachs.find((c) => c.email === email) || null;

const ouvrirSeance = (cible, corps, par) =>
  api('POST', `/api/academy/evaluateur/collaborateurs/${encodeURIComponent(cible)}/evaluations`,
    corps || {}, jetons[par || EVA]);
const delivrer = (cible, par, corps) =>
  api('POST', `/api/academy/admin/certifications/${encodeURIComponent(cible)}`, corps || {}, jetons[par]);

test.before(async () => {
  await new Promise((r) => { srv = app.listen(0, r); });
  base = `http://127.0.0.1:${srv.address().port}`;
  app.boost.assurerSchema();
  app.academyCertifications.assurerSchema();

  const comptes = [[ADMIN, '7777'], [EVA, '3003'], [DEBUT, '1111'], [THEORIE, '2222'],
    [ATTENTE, '3333'], [REPASSE, '4444'], [PRET, '5555'], [DIPLOME, '6666'], [LEA, '9999']];
  for (const [e, p] of comptes) await connecter(e, p);
  for (const e of [EVA, DEBUT, THEORIE, ATTENTE, REPASSE, PRET, DIPLOME]) {
    await api('POST', '/api/boost/admin/collaborateurs', { email: e, role: 'collaborateur' }, jetons[ADMIN]);
  }
  await api('POST', '/api/academy/admin/evaluateurs', { email: EVA }, jetons[ADMIN]);

  // Chacun est amené EXACTEMENT à son palier, par les routes normales.
  for (const e of [THEORIE, ATTENTE, REPASSE, PRET, DIPLOME]) {
    await terminerFormation({ api, email: e, jeton: jetons[e] });
    await reussirQcm({ api, jeton: jetons[e] });
  }
  await ouvrirSeance(ATTENTE, { dateEvaluation: '2026-09-01' });
  await ouvrirSeance(REPASSE, { resultat: 'a_repasser', dateEvaluation: '2026-09-02', commentaire: 'À revoir.' });
  await ouvrirSeance(PRET, { resultat: 'valide', dateEvaluation: '2026-09-03' });
  await ouvrirSeance(DIPLOME, { resultat: 'valide', dateEvaluation: '2026-09-04' });
  await delivrer(DIPLOME, ADMIN, { obtenueLe: '2026-09-05' });
});

test.after(() => {
  if (srv) srv.close();
  require('../lib/db').closeDb();
  ['', '-wal', '-shm'].forEach((s) => { try { fs.unlinkSync(DB + s); } catch (_) {} });
});

// ===========================================================================
//  1. LE STATUT UNIQUE
// ===========================================================================

test('les sept statuts sont ceux du moteur, et pas un de plus', () => {
  assert.deepStrictEqual([...STATUTS_COACH].sort(), [
    'certification_a_delivrer', 'certifie', 'formation_en_cours', 'pratique_a_realiser',
    'pratique_a_repasser', 'pratique_validee', 'resultat_en_attente',
  ]);
  // « théorie validée » n'en est PAS un : c'est « pratique à réaliser » vu de
  // l'autre côté. Deux libellés concurrents pour un seul état obligeraient
  // l'évaluateur à savoir lequel compte.
  assert.ok(!STATUTS_COACH.includes('theorie_validee'));
});

test('chaque palier du parcours porte UN statut, et le bon', async () => {
  const d = await liste(jetons[EVA]);
  assert.strictEqual(statutDe(d, DEBUT), 'formation_en_cours');
  assert.strictEqual(statutDe(d, THEORIE), 'pratique_a_realiser');
  assert.strictEqual(statutDe(d, ATTENTE), 'resultat_en_attente');
  assert.strictEqual(statutDe(d, REPASSE), 'pratique_a_repasser');
  assert.strictEqual(statutDe(d, PRET), 'certification_a_delivrer');
  assert.strictEqual(statutDe(d, DIPLOME), 'certifie');
  // Un seul statut par ligne : la valeur est une chaîne, pas une liste.
  for (const c of d.coachs) {
    assert.strictEqual(typeof c.statut, 'string');
    assert.ok(STATUTS_COACH.includes(c.statut), c.email + ' : ' + c.statut);
  }
});

test('PERSONNE NE DISPARAÎT — même celui qui n\'a rien commencé', async () => {
  const d = await liste(jetons[EVA]);
  const emails = d.coachs.map((c) => c.email);
  for (const e of [DEBUT, THEORIE, ATTENTE, REPASSE, PRET, DIPLOME, EVA]) {
    assert.ok(emails.includes(e), e + ' manque à la liste');
  }
  // C'était le défaut de l'ancienne liste : elle filtrait sur la théorie.
  assert.ok(emails.includes(DEBUT), 'un coach encore dans ses vidéos doit être visible');
  // Une cliente n'y est pas : la liste montre des COACHS.
  assert.ok(!emails.includes(LEA));
});

test('la ligne porte de quoi décider sans ouvrir la fiche', async () => {
  const d = await liste(jetons[EVA]);
  const r = ligneDe(d, REPASSE);
  assert.strictEqual(r.theorieValidee, true);
  assert.strictEqual(typeof r.scoreTheorie, 'number');
  assert.strictEqual(r.pratique.nbTentatives, 1);
  assert.strictEqual(r.pratique.derniere.resultat, 'a_repasser');
  assert.strictEqual(r.certification.eligible, false);
  assert.ok(r.certification.manquants.includes('pratique'));

  // La progression d'apprentissage voyage aussi : « où en est-il ? » se lit
  // sans un appel de plus.
  const dd = ligneDe(d, DEBUT);
  assert.ok(dd.progression && dd.progression.total > 0);
  assert.strictEqual(dd.progression.termines, 0);
  assert.strictEqual(dd.progression.pourcentage, 0);
  assert.strictEqual(ligneDe(d, PRET).progression.pourcentage, 100);
});

test('le certifié porte son diplôme, l\'éligible porte ses prérequis remplis', async () => {
  const d = await liste(jetons[EVA]);
  const dip = ligneDe(d, DIPLOME);
  assert.strictEqual(dip.certification.certifie, true);
  assert.strictEqual(dip.certification.certification.obtenueLe, '2026-09-05');
  assert.strictEqual(dip.certification.certification.delivreePar, ADMIN);

  const pret = ligneDe(d, PRET);
  assert.strictEqual(pret.certification.eligible, true);
  assert.ok(pret.certification.prerequis.every((p) => p.rempli));
  assert.strictEqual(pret.certification.manquants.length, 0);
  assert.strictEqual(pret.pratique.validee, true);
  assert.strictEqual(pret.pratique.close, true, 'l\'étape pratique ne se repasse pas');
});

test('l\'ordre remonte ce qui attend une action, et descend les dossiers clos', async () => {
  const d = await liste(jetons[EVA]);
  const rang = (e) => d.coachs.findIndex((c) => c.email === e);
  assert.ok(rang(PRET) < rang(ATTENTE), 'une certification à délivrer passe devant');
  assert.ok(rang(ATTENTE) < rang(REPASSE));
  assert.ok(rang(REPASSE) < rang(THEORIE));
  assert.ok(rang(THEORIE) < rang(DEBUT), 'un dossier qui n\'attend rien descend');
  assert.ok(rang(DEBUT) < rang(DIPLOME), 'et un certifié ferme la marche');
});

// ===========================================================================
//  2. QUI ENTRE DANS CET ESPACE
// ===========================================================================

test('un coach ordinaire et une cliente n\'atteignent pas la liste', async () => {
  for (const e of [THEORIE, LEA]) {
    const r = await api('GET', '/api/academy/evaluateur/coachs', null, jetons[e]);
    assert.strictEqual(r.status, 403, e);
    assert.strictEqual(r.body.nonEvaluateur, true);
  }
  assert.strictEqual((await api('GET', '/api/academy/evaluateur/coachs')).status, 401, 'ni sans jeton');
});

test('l\'ADMINISTRATEUR y entre d\'office, sans désignation', async () => {
  assert.strictEqual(app.academyPratique.estEvaluateur(ADMIN), false,
    'aucune ligne de désignation : le droit vient du statut');
  const r = await api('GET', '/api/academy/evaluateur/coachs', null, jetons[ADMIN]);
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.coachs.length > 0);
});

test('L\'ÉVALUATRICE N\'ADMINISTRE RIEN — les onze portes restent fermées', async () => {
  for (const [m, route, corps] of [
    ['GET', '/api/academy/admin/formations', null],
    ['POST', '/api/academy/admin/formations', { cle: 'pirate', libelle: 'Pirate' }],
    ['PUT', '/api/academy/admin/formations/coach_nutrition', { libelle: 'Pirate' }],
    ['POST', '/api/academy/admin/formations/coach_nutrition/publier', {}],
    ['POST', '/api/academy/admin/formations/coach_nutrition/depublier', {}],
    ['GET', '/api/academy/admin/arbre', null],
    ['POST', '/api/academy/admin/modules', { titre: 'Pirate' }],
    ['POST', '/api/academy/admin/contenus', { titre: 'Pirate' }],
    ['POST', '/api/academy/admin/questions', { enonce: 'Pirate ?' }],
    ['GET', '/api/academy/admin/evaluateurs', null],
    ['POST', '/api/academy/admin/evaluateurs', { email: DEBUT }],
  ]) {
    assert.strictEqual((await api(m, route, corps, jetons[EVA])).status, 403, `${m} ${route}`);
  }
  // Et rien n'a bougé : la formation existe toujours telle quelle.
  const f = app.academyFormations.lire('coach_nutrition');
  assert.strictEqual(f.libelle, 'Coach Nutrition');
});

test('le drapeau `peutRetirer` distingue l\'évaluatrice de l\'administrateur', async () => {
  assert.strictEqual((await liste(jetons[EVA])).peutRetirer, false);
  assert.strictEqual((await liste(jetons[ADMIN])).peutRetirer, true);
  // Et le serveur ne se contente pas du drapeau : il refuse pour de bon.
  const r = await api('POST', `/api/academy/admin/certifications/${DIPLOME}/retrait`,
    { motif: 'essai' }, jetons[EVA]);
  assert.strictEqual(r.status, 403);
  assert.strictEqual(app.academyCertifications.estCertifie(DIPLOME), true, 'le diplôme tient');
});

// ===========================================================================
//  3. LE PARCOURS COMPLET, PAR LA SEULE ÉVALUATRICE
// ===========================================================================

test('de « pratique à réaliser » à « certifié » sans quitter l\'espace', async () => {
  // Le scénario que l'espace unifié promet : une seule personne, un seul écran.
  assert.strictEqual(statutDe(await liste(jetons[EVA]), THEORIE), 'pratique_a_realiser');

  assert.strictEqual((await ouvrirSeance(THEORIE, { resultat: 'valide', dateEvaluation: '2026-09-20' })).status, 201);
  assert.strictEqual(statutDe(await liste(jetons[EVA]), THEORIE), 'certification_a_delivrer',
    'AUCUNE CERTIFICATION AUTOMATIQUE : valider la pratique rend éligible, pas certifié');
  assert.strictEqual(app.academyCertifications.estCertifie(THEORIE), false);

  assert.strictEqual((await delivrer(THEORIE, EVA, { obtenueLe: '2026-09-21' })).status, 201);
  assert.strictEqual(statutDe(await liste(jetons[EVA]), THEORIE), 'certifie');
});

test('un « à repasser » se rattrape sans effacer la tentative ratée', async () => {
  assert.strictEqual((await ouvrirSeance(REPASSE, { resultat: 'valide', dateEvaluation: '2026-09-22' })).status, 201);
  const r = ligneDe(await liste(jetons[EVA]), REPASSE);
  assert.strictEqual(r.statut, 'certification_a_delivrer');
  assert.strictEqual(r.pratique.nbTentatives, 2, 'les DEUX tentatives sont là');
  assert.strictEqual(r.pratique.validee, true);
});

test('la liste est CLOISONNÉE par formation', async () => {
  const r = await api('GET', '/api/academy/evaluateur/coachs?formation=inconnue', null, jetons[EVA]);
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.body.formationInconnue, true);
  const d = await liste(jetons[EVA]);
  assert.strictEqual(d.formation.cle, 'coach_nutrition');
  assert.ok(d.formations.some((f) => f.cle === 'coach_nutrition'));
});

// ===========================================================================
//  4. L'ÉCRAN
// ===========================================================================

test('la navigation nomme l\'espace « Évaluer & certifier »', () => {
  assert.ok(js.includes('Évaluer & certifier'), 'l\'entrée de navigation porte le nom du métier');
  assert.ok(!/libelle: 'Évaluer'/.test(js), 'l\'ancienne entrée « Évaluer » seule a disparu');
});

test('l\'écran lit les sept statuts du serveur, il n\'en invente aucun', () => {
  for (const s of STATUTS_COACH) {
    assert.ok(js.includes(s), 'l\'écran ignore le statut ' + s);
  }
});

test('l\'administration de l\'écran n\'a plus d\'onglet Certifications', () => {
  // Il a rejoint « Évaluer & certifier » : le laisser aux deux endroits ferait
  // deux vérités pour un seul geste.
  assert.ok(html.includes('id="acEval"') && html.includes('id="acAdmin"'));
  assert.ok(!/\['evaluateurs', 'certifications', 'contenus'\]/.test(js),
    'l\'onglet Certifications doit avoir quitté l\'administration');
});
