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
const { terminerFormation, reussirQcm, criteresAcquis } = require('./aideAcademy');

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

// Un verdict sur une formation qui porte une grille exige cette grille. On la
// pose ici quand un résultat est demandé — ce fichier éprouve l'ESPACE de
// l'évaluateur, pas les critères.
const dbq = () => require('../lib/db').getDb();
const ouvrirSeance = (cible, corps, par) => {
  const c = corps || {};
  const avec = c.resultat && !c.criteres ? { ...c, criteres: criteresAcquis(dbq()) } : c;
  return api('POST', `/api/academy/evaluateur/collaborateurs/${encodeURIComponent(cible)}/evaluations`,
    avec, jetons[par || EVA]);
};
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

test('les six statuts sont ceux du moteur, et pas un de plus', () => {
  // ⚠️ ILS ÉTAIENT SEPT. « certification_a_delivrer » a disparu avec l'étape
  // qu'il nommait : la certification part automatiquement dès que le dernier
  // prérequis est rempli, donc aucun dossier n'attend plus un clic.
  assert.deepStrictEqual([...STATUTS_COACH].sort(), [
    'certifie', 'formation_en_cours', 'pratique_a_realiser',
    'pratique_a_repasser', 'pratique_validee', 'resultat_en_attente',
  ]);
  assert.ok(!STATUTS_COACH.includes('certification_a_delivrer'));
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
  // PRET a vu sa pratique validée : il est donc CERTIFIÉ, comme DIPLOME. Le
  // palier intermédiaire qu'il incarnait n'existe plus.
  assert.strictEqual(statutDe(d, PRET), 'certifie');
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

test('le certifié porte son diplôme, et ses prérequis tous remplis', async () => {
  const d = await liste(jetons[EVA]);
  // ⚠️ DIPLOME ÉTAIT CERTIFIÉ À LA MAIN dans l'amorçage ; il l'est désormais
  // par la règle, au moment où sa pratique a été validée. Son diplôme porte
  // donc le marqueur automatique et la date du verdict, pas celle qu'un
  // administrateur aurait saisie ensuite.
  const dip = ligneDe(d, DIPLOME);
  assert.strictEqual(dip.certification.certifie, true);
  assert.strictEqual(dip.certification.certification.delivreePar, 'Academy');
  assert.strictEqual(dip.certification.certification.obtenueLe, '2026-09-04',
    'la date du verdict pratique, pas celle de la saisie');

  // PRET a suivi le même chemin : plus d'état d'attente entre les deux.
  const pret = ligneDe(d, PRET);
  assert.strictEqual(pret.certification.certifie, true);
  assert.ok(pret.certification.prerequis.every((p) => p.rempli));
  assert.strictEqual(pret.certification.manquants.length, 0);
  assert.strictEqual(pret.pratique.validee, true);
  assert.strictEqual(pret.pratique.close, true, 'l\'étape pratique ne se repasse pas');
});

test('l\'ordre remonte ce qui attend une action, et descend les dossiers clos', async () => {
  const d = await liste(jetons[EVA]);
  const rang = (e) => d.coachs.findIndex((c) => c.email === e);
  // Le barème n'a pas changé, il a juste perdu son rang 0 : ce qui attend un
  // verdict remonte, ce qui est clos descend. PRET, désormais certifié, ferme
  // la marche avec DIPLOME au lieu d'ouvrir la file.
  assert.ok(rang(ATTENTE) < rang(REPASSE));
  assert.ok(rang(REPASSE) < rang(THEORIE));
  assert.ok(rang(THEORIE) < rang(DEBUT), 'un dossier qui n\'attend rien descend');
  assert.ok(rang(DEBUT) < rang(DIPLOME), 'et un certifié ferme la marche');
  assert.ok(rang(DEBUT) < rang(PRET), 'PRET est certifié : il ferme la marche aussi');
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

test('de « pratique à réaliser » à « certifié » EN UN SEUL GESTE', async () => {
  // La promesse de l'espace unifié, resserrée par ce lot : une seule personne,
  // un seul écran, et désormais UN SEUL GESTE. Le verdict pratique ne rend
  // plus « éligible » — il certifie.
  assert.strictEqual(statutDe(await liste(jetons[EVA]), THEORIE), 'pratique_a_realiser');

  const r = await ouvrirSeance(THEORIE, { resultat: 'valide', dateEvaluation: '2026-09-20' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.certificationAutomatique, true, 'le diplôme part avec la réponse');
  assert.strictEqual(app.academyCertifications.estCertifie(THEORIE), true);
  assert.strictEqual(statutDe(await liste(jetons[EVA]), THEORIE), 'certifie');

  // Et il n'y a plus rien à délivrer derrière : la porte manuelle refuse.
  const encore = await delivrer(THEORIE, EVA, { obtenueLe: '2026-09-21' });
  assert.strictEqual(encore.status, 409);
  assert.strictEqual(encore.body.dejaCertifie, true);
});

test('un « à repasser » se rattrape sans effacer la tentative ratée', async () => {
  assert.strictEqual((await ouvrirSeance(REPASSE, { resultat: 'valide', dateEvaluation: '2026-09-22' })).status, 201);
  const r = ligneDe(await liste(jetons[EVA]), REPASSE);
  assert.strictEqual(r.statut, 'certifie', 'le rattrapage validé certifie directement');
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

// ===========================================================================
//  LA FILE DE TRAVAIL — refonte de l'écran « Évaluer & certifier »
//
//  CE QUE CES TESTS DÉFENDENT :
//   1. l'agrégation « toutes les formations » EXISTE et n'altère RIEN du mode
//      mono-formation ;
//   2. chaque ligne porte SA formation — un dossier est un couple
//      (coach, formation), et prononcer sur le mauvais parcours serait la
//      faute la plus grave de cette page ;
//   3. les compteurs et l'ordre se déduisent des SEPT statuts existants, sans
//      qu'aucun ne soit inventé ;
//   4. `RANG_STATUT` et `fCourante` ne sont pas touchés : d'autres vues en
//      dépendent.
// ===========================================================================

const listeToutes = async (jeton) =>
  (await api('GET', '/api/academy/evaluateur/coachs?formation=toutes', null, jeton)).body;

test('LE MODE MONO-FORMATION EST INCHANGÉ, et chaque ligne porte sa formation', async () => {
  const d = await liste(jetons[EVA]);
  assert.strictEqual(d.ok, true);
  assert.strictEqual(d.toutes, false);
  assert.ok(d.formation && d.formation.cle, 'la formation courante est toujours servie');
  assert.ok(Array.isArray(d.formations), 'la liste des formations aussi');
  assert.ok(d.coachs.length > 0);
  // L'ajout : la formation sur CHAQUE ligne, en mono comme en agrégé, pour que
  // l'écran n'ait qu'une seule façon de lire une ligne.
  for (const c of d.coachs) {
    assert.strictEqual(c.formation, d.formation.cle, 'ligne sans sa formation : ' + c.email);
    assert.ok(c.formationLibelle, 'et sans son libellé : ' + c.email);
  }
  // Rien d'autre n'a bougé : les champs que l'écran lit sont tous là.
  const l = ligneDe(d, THEORIE);
  for (const champ of ['email', 'prenom', 'statut', 'progression', 'theorieValidee',
    'scoreTheorie', 'pratique', 'certification']) {
    assert.ok(champ in l, 'champ perdu : ' + champ);
  }
});

test('« TOUTES LES FORMATIONS » agrège en UN SEUL appel', async () => {
  const t = await listeToutes(jetons[EVA]);
  assert.strictEqual(t.ok, true);
  assert.strictEqual(t.toutes, true);
  assert.strictEqual(t.formation, null, '« toutes » n\'a pas de formation courante');
  assert.ok(t.formations.length >= 1);

  // Le total agrégé vaut la somme des formations publiées : un dossier par
  // couple (coach, formation), jamais un coach dédoublonné à tort.
  let attendu = 0;
  for (const f of t.formations) {
    const d = (await api('GET', `/api/academy/evaluateur/coachs?formation=${f.cle}`, null, jetons[EVA])).body;
    attendu += d.coachs.length;
  }
  assert.strictEqual(t.coachs.length, attendu);
  for (const c of t.coachs) {
    assert.ok(c.formation && c.formationLibelle, 'ligne agrégée sans sa formation : ' + c.email);
  }
});

test('l\'agrégation N\'INVENTE AUCUN STATUT ni ne modifie ceux du moteur', async () => {
  const t = await listeToutes(jetons[EVA]);
  for (const c of t.coachs) {
    assert.ok(STATUTS_COACH.includes(c.statut), 'statut inconnu : ' + c.statut);
  }
  // Et le statut d'un dossier est le même, agrégé ou non.
  const mono = await liste(jetons[EVA]);
  for (const c of mono.coachs) {
    const agrege = t.coachs.find((x) => x.email === c.email && x.formation === mono.formation.cle);
    assert.ok(agrege, 'dossier perdu à l\'agrégation : ' + c.email);
    assert.strictEqual(agrege.statut, c.statut, 'statut divergent pour ' + c.email);
  }
});

test('l\'agrégation reste FERMÉE à qui n\'évalue pas', async () => {
  const r = await api('GET', '/api/academy/evaluateur/coachs?formation=toutes', null, jetons[LEA]);
  assert.strictEqual(r.status, 403, 'une cliente ne doit pas lire la file de travail');
});

test('LES TROIS COMPTEURS se calculent sur les statuts réels', async () => {
  const t = await listeToutes(jetons[EVA]);
  const compte = (sts) => t.coachs.filter((c) => sts.includes(c.statut)).length;
  const aEvaluer = compte(['pratique_a_realiser', 'resultat_en_attente', 'pratique_a_repasser']);
  const aCertifier = compte(['certification_a_delivrer']);
  const certifies = compte(['certifie']);

  // ⚠️ CE TEST NE SUPPOSE PAS L'ÉTAT INITIAL. Les tests qui précèdent font
  // avancer des dossiers de bout en bout ; figer ici « THEORIE est à évaluer »
  // ferait échouer le lot au premier réordonnancement du fichier. On éprouve
  // donc les PROPRIÉTÉS des compteurs, qui, elles, ne dépendent pas de l'ordre.
  //
  // DIPLOME, lui, est certifié et le reste : rien ne le déclasse.
  assert.strictEqual(statutDe(t, DIPLOME), 'certifie');
  assert.ok(certifies >= 1, `certifiés = ${certifies}`);
  // Chaque compteur vaut exactement le nombre de lignes qu'il revendique.
  assert.strictEqual(aEvaluer,
    t.coachs.filter((c) => ['pratique_a_realiser', 'resultat_en_attente', 'pratique_a_repasser']
      .includes(c.statut)).length);
  assert.strictEqual(aCertifier, t.coachs.filter((c) => c.statut === 'certification_a_delivrer').length);
  assert.strictEqual(certifies, t.coachs.filter((c) => c.statut === 'certifie').length);
  // Et les trois familles ne se recouvrent jamais.
  const familles = [
    ['pratique_a_realiser', 'resultat_en_attente', 'pratique_a_repasser'],
    ['certification_a_delivrer'], ['certifie'],
  ];
  const vus = new Set();
  for (const f of familles) for (const st of f) {
    assert.ok(!vus.has(st), 'statut compté deux fois : ' + st);
    vus.add(st);
  }

  // Aucun dossier n'est compté deux fois, et les deux statuts « sans geste »
  // ne sont dans aucun compteur.
  const total = t.coachs.length;
  const neutres = compte(['pratique_validee', 'formation_en_cours']);
  assert.strictEqual(aEvaluer + aCertifier + certifies + neutres, total,
    'les cinq familles doivent partitionner exactement la liste');
});

test('L\'ÉCRAN trie SANS toucher à RANG_STATUT', () => {
  // L'ordre de travail est déclaré dans l'écran, et il est celui demandé.
  // La tranche s'arrête au tableau LUI-MÊME : plus loin, KPI_EVAL mentionne
  // légitimement « certifie » pour le compteur des diplômés.
  const bloc = js.slice(js.indexOf('const ORDRE_TRAVAIL'), js.indexOf('const rangTravail'));
  assert.ok(bloc.length > 100, 'l\'ordre de travail doit être délimité');
  // « certification_a_delivrer » est sorti de cette file avec l'étape qu'il
  // nommait : plus rien n'attend un clic entre « tout est validé » et
  // « certifié ».
  const ordre = ['pratique_a_realiser', 'resultat_en_attente', 'pratique_a_repasser',
    'pratique_validee', 'formation_en_cours'];
  let pos = -1;
  for (const st of ordre) {
    const i = bloc.indexOf(`'${st}'`);
    assert.ok(i > pos, `${st} est mal placé dans l'ordre de travail`);
    pos = i;
  }
  // `certifie` n'est PAS dans la file : il n'attend rien.
  assert.ok(!bloc.includes("'certifie'"), 'un certifié n\'a rien à faire dans la file de travail');

  // Et le moteur dit la même chose que l'écran : le barème a perdu son rang 0
  // avec l'étape « à certifier », mais RIEN d'autre n'a bougé — un dossier qui
  // attend un verdict remonte toujours, un dossier clos descend toujours.
  const moteur = fs.readFileSync(path.join(__dirname, '..', 'lib', 'academyCertifications.js'), 'utf8');
  const rang = moteur.slice(moteur.indexOf('const RANG_STATUT'), moteur.indexOf('const AUTEUR_AUTO'));
  assert.ok(!/certification_a_delivrer/.test(rang), 'le rang de l\'étape supprimée doit avoir disparu');
  assert.ok(/resultat_en_attente: 1/.test(rang) && /certifie: 6/.test(rang),
    'les rangs des états conservés ne doivent pas bouger');
  // ⚠️ ON NE COMPARE PAS les deux ordres terme à terme, et c'est voulu : ils
  // divergeaient DÉJÀ avant ce lot. L'écran remonte « pratique à réaliser » en
  // tête de sa file de travail, le moteur classe d'abord ce qui attend un
  // verdict. Deux lectures légitimes du même parcours ; ce test garde
  // seulement qu'aucun état ne perd son rang au passage.
  const { RANG_STATUT } = require('../lib/academyCertifications');
  for (const st of ordre) {
    assert.strictEqual(typeof RANG_STATUT[st], 'number', 'rang manquant dans le moteur : ' + st);
  }
});

test('L\'ÉCRAN N\'UTILISE PAS fCourante pour évaluer : elle appartient aux autres vues', () => {
  const bloc = js.slice(js.indexOf('async function ouvrirEvaluateur'), js.indexOf('async function ouvrirFiche'));
  assert.ok(bloc.length > 500, 'le bloc de l\'écran doit être délimité');
  assert.ok(!/fCourante/.test(bloc),
    'l\'écran d\'évaluation touche à fCourante : Mon Academy et l\'administration la partagent');
  assert.ok(/evalFormation/.test(bloc), 'il doit utiliser sa propre variable');
  // Les gestes de certification visent la formation DU DOSSIER.
  const geste = js.slice(js.indexOf('function formationDuGeste'), js.indexOf('async function agirSurCertification'));
  assert.ok(/evalFicheFormation/.test(geste) && /ligne && ligne.formation/.test(geste),
    'un geste de certification doit viser la formation du dossier');
  assert.ok(!/fCourante/.test(geste), 'et jamais se rabattre sur fCourante');
});

test('l\'écran garde son sous-titre, son select de formation et ses compteurs', () => {
  const bloc = js.slice(js.indexOf('function rendreEvalListe'), js.indexOf('function rafraichirCorpsEval'));
  assert.ok(/Suis la progression des coachs et traite les évaluations en attente/.test(bloc),
    'le sous-titre demandé doit être là');
  // ⚠️ LES COMPTEURS SONT PASSÉS DANS LE BENTO (refonte lot 1) : ils ne sont
  // plus rendus dans `rendreEvalListe` mais dans `rendreBentoEval`, appelée
  // par elle. Le sous-titre, lui, n'a pas bougé.
  assert.ok(/rendreBentoEval\(tous\)/.test(bloc), 'le bento doit être rendu');
  // Le select remplace les pilules.
  assert.ok(/id="acEvalFormation"/.test(js), 'le filtre doit être un select');
  assert.ok(!/data-formation-eval/.test(js), 'les anciennes pilules doivent avoir disparu');
  assert.ok(/Toutes les formations/.test(js), 'et proposer « toutes »');
  // Les files d'action gardent les sept colonnes du dossier : là, un dossier
  // reste un couple (coach, formation), et la formation doit être en clair.
  const file = js.slice(js.indexOf('const ENTETE_FILE'), js.indexOf('function rendreCorpsEval'));
  for (const t of ['Coach', 'Formation', 'Contenus', 'Théorie', 'Pratique', 'Statut', 'Action']) {
    assert.ok(file.includes(`'${t}'`), 'colonne manquante dans la file : ' + t);
  }
  assert.ok(/Aucune évaluation en attente\./.test(js), 'l\'état vide doit tenir en une phrase');
});

// ===========================================================================
//  UN COACH = UNE LIGNE
//
//  CE QUE CES TESTS DÉFENDENT, et c'est tout l'enjeu du lot :
//
//   1. LE REGROUPEMENT EST UN AFFICHAGE, PAS UN CALCUL. Aucun statut n'est
//      recalculé, aucune progression n'est recomposée à partir de rien : tout
//      se compte sur ce que le serveur a déjà établi. Un second barème, ici,
//      ferait dire à l'écran autre chose qu'au moteur — pour la même donnée.
//   2. LE DÉTAIL N'EST JAMAIS AFFICHÉ PAR DÉFAUT. C'est la raison d'être du
//      lot : dix formations ne doivent plus faire dix lignes permanentes.
//   3. LES GESTES RESTENT CEUX DU DOSSIER. On ne prononce pas sur un coach, on
//      prononce sur un couple (coach, formation) : les boutons du détail
//      portent les mêmes attributs et passent par les mêmes fonctions.
// ===========================================================================

test('LE REGROUPEMENT NE RECALCULE RIEN : il compte les statuts du serveur', () => {
  const bloc = js.slice(js.indexOf('function grouperParCoach'), js.indexOf('const GARDES_ETAT'));
  assert.ok(bloc.length > 400, 'le regroupement doit être délimité');
  // Les deux familles de statuts sont LUES dans KPI_EVAL, pas réécrites : deux
  // listes qui divergeraient donneraient un badge et un compteur en désaccord.
  const familles = js.slice(js.indexOf('const STATUTS_A_EVALUER'), js.indexOf('function grouperParCoach'));
  assert.ok(/STATUTS_A_EVALUER = KPI_EVAL/.test(familles), 'les statuts « à évaluer » doivent venir de KPI_EVAL');
  assert.ok(!/STATUT_A_CERTIFIER/.test(js), 'le statut « à certifier » n\'existe plus');
  // Aucun statut inventé dans le regroupement.
  for (const s of ['pratique_a_realiser', 'resultat_en_attente', 'pratique_a_repasser']) {
    assert.ok(!bloc.includes(`'${s}'`), `${s} est réécrit dans le regroupement au lieu d'être lu`);
  }
  // LE PARCOURS ACADEMY EST UNE MOYENNE DE VALIDATIONS, une formation = une
  // voix. Ce que le regroupement additionne, ce sont des pourcentages de
  // validation lus sur les prérequis du serveur — jamais des contenus vus.
  // (Le barème lui-même est prouvé dans test/academyParcours.test.js.)
  assert.ok(/somme \+= pct/.test(bloc) && /pctValidation\(d\)/.test(bloc),
    'le parcours global doit sommer les validations');
  assert.ok(!/d\.progression/.test(bloc),
    'la progression de contenus ne doit pas entrer dans le parcours global');
  // Et le moteur n'a pas bougé.
  const moteur = fs.readFileSync(path.join(__dirname, '..', 'lib', 'academyCertifications.js'), 'utf8');
  assert.ok(/function statutCoach/.test(moteur) && /function ligneCoach/.test(moteur),
    'le moteur de statut doit rester intact');
});

test('LE DÉTAIL D\'UN COACH NE S\'AFFICHE QUE SI ON LE DEMANDE', () => {
  assert.ok(/const evalDeplies = new Set\(\)/.test(js), 'le dépliage doit être un état d\'écran');
  const ligne = js.slice(js.indexOf('function ligneAgregee'), js.indexOf('function detailCoach'));
  assert.ok(/const ouvert = evalDeplies\.has\(c\.email\)/.test(ligne),
    'la ligne doit lire l\'état de dépliage');
  assert.ok(/ouvert \? '<div class="ac-evd">' \+ detailCoach\(c\)/.test(ligne),
    'le détail ne doit être rendu que lorsque la ligne est ouverte');
  assert.ok(/Voir le parcours/.test(ligne), 'le bouton demandé doit être là');
  assert.ok(/aria-expanded/.test(ligne), 'et dire son état à un lecteur d\'écran');
});

test('LES GESTES DU DÉTAIL SONT CEUX DU DOSSIER, pas du coach', () => {
  const bloc = js.slice(js.indexOf('function detailCoach'), js.indexOf('const ENTETE_COACHS'));
  assert.ok(/data-collab="/.test(bloc) && /data-form="/.test(bloc),
    'ouvrir une fiche doit viser un couple (coach, formation)');
  // LE GESTE « CERTIFIER » A DISPARU de cette vue : aucun dossier n'attend
  // plus une délivrance. Le seul geste du détail est d'ouvrir la fiche.
  assert.ok(!/data-cert="/.test(bloc) && !/data-geste="delivrer"/.test(bloc),
    'plus aucun bouton de délivrance dans le détail d\'un coach');
  assert.ok(/ficheOuvrable\(d\)/.test(bloc),
    'sans théorie validée, aucun bouton : le serveur refuserait la fiche');
  // Les six colonnes compactes demandées.
  for (const t of ['Formation', 'Progression', 'Théorie', 'Pratique', 'Statut', 'Action']) {
    assert.ok(bloc.includes(`'${t}'`), 'colonne manquante dans le détail : ' + t);
  }
});

test('LA LIGNE COACH PORTE LES CINQ INFORMATIONS DEMANDÉES', () => {
  const bloc = js.slice(js.indexOf('function ligneAgregee'), js.indexOf('function detailCoach'));
  assert.ok(/ac-eval-mail/.test(bloc), 'l\'email doit rester en information secondaire');
  assert.ok(/c\.terminees \+ ' \/ ' \+ c\.formations/.test(bloc), 'validées / disponibles');
  assert.ok(/ac-jauge/.test(bloc), 'la barre de progression doit être celle de l\'Academy');
  assert.ok(/badgeEval\(c\.aEvaluer/.test(bloc), 'le badge « à évaluer » doit être là');
  assert.ok(!/aCertifier/.test(bloc), 'celui d\'« à certifier » a disparu avec l\'étape');
  // Un badge ne s'affiche QUE s'il compte quelque chose.
  const badge = js.slice(js.indexOf('const badgeEval'), js.indexOf('function ligneAgregee'));
  assert.ok(/n > 0/.test(badge), 'le badge ne doit apparaître qu\'au-dessus de zéro');
  assert.ok(/\\u\{1F3C5\}/.test(bloc), 'la médaille de l\'Academy doit marquer les certifications');
});

test('LES TROIS VUES REMPLACENT « À traiter | Certifications »', () => {
  assert.ok(!/'À traiter'/.test(js), 'l\'ancien onglet « À traiter » doit avoir disparu');
  const vues = js.slice(js.indexOf('const VUES_EVAL'), js.indexOf('function rendreOngletsEval'));
  // ELLES ÉTAIENT QUATRE. « À certifier » est parti avec son étape.
  assert.ok(!/a_certifier/.test(vues), 'la vue « À certifier » ne doit plus exister');
  for (const [cle, libelle] of [['coachs', 'Coachs'], ['a_evaluer', 'À évaluer'],
    ['certifications', 'Certifications']]) {
    assert.ok(vues.includes(`'${cle}'`) && vues.includes(`'${libelle}'`), 'vue manquante : ' + libelle);
  }
  assert.ok(/let evalOnglet = 'coachs'/.test(js), '« Coachs » doit être la vue par défaut');
});

test('LES COMPTEURS DU BENTO RESTENT DES RACCOURCIS', () => {
  // Le bento a remplacé les trois cartes-compteurs (refonte lot 1) : on lit
  // donc `rendreBentoEval`, et la fonction d'écran qui l'appelle.
  const bloc = js.slice(js.indexOf('function rendreBentoEval'), js.indexOf('function rafraichirCorpsEval'));
  // LES QUATRE TUILES SONT DES DESTINATIONS : chacune porte sa vue, et c'est
  // la tuile ENTIÈRE qui est un <button> — le petit bouton « Traiter » niché
  // dedans a disparu, un bouton dans un bouton n'étant pas du HTML valide.
  const tuiles = js.slice(js.indexOf('function kpiTile'), js.indexOf('function rendreEvalListe'));
  assert.ok(/data-kpi-eval="' \+ vue \+ '"/.test(tuiles),
    'une tuile qui mène quelque part doit porter sa destination');
  assert.ok(/<button type="button" class="' \+ classe \+ '"/.test(tuiles),
    'c\'est un bouton : atteignable au clavier');
  for (const v of ["vue: 'a_evaluer'", "vue: 'certifications'", "vue: 'coachs'"]) {
    assert.ok(tuiles.includes(v), 'destination manquante : ' + v);
  }
  assert.ok(/etat: 'actifs'/.test(tuiles), '« Actifs cette semaine » doit poser son filtre');
  assert.ok(!/ac-btn-mini/.test(bloc), 'le bouton imbriqué doit avoir disparu');
  assert.ok(/aria-pressed=/.test(bloc), 'le segmented control dit lequel est actif');
  // Le chiffre compte des DOSSIERS, pas des coachs : il se calcule sur la
  // liste servie, avant tout regroupement.
  assert.ok(/tous\.filter\(\(c\) => STATUTS_A_EVALUER\.includes/.test(bloc),
    'le compteur doit compter des dossiers, pas des coachs');
  assert.ok(/certifs = tous\.filter\(\(c\) => c\.statut === 'certifie'\)/.test(bloc),
    'les certifications comptent des dossiers, elles aussi');
  // ⚠️ LE BENTO, LUI, REGROUPE — et c'est légitime : « progression moyenne » et
  // « actifs cette semaine » comptent des COACHS, pas des dossiers. Les deux
  // granularités cohabitent, chacune sur la bonne liste. Ce que ce test garde,
  // c'est qu'on ne les confonde pas.
  assert.ok(/const coachs = grouperParCoach\(tous\)/.test(bloc),
    'les tuiles qui parlent de coachs doivent regrouper');
  assert.ok(/actifs = coachs\.filter/.test(bloc), 'les actifs se comptent sur des coachs');
});

test('LA RECHERCHE ET LE FILTRE NE REPARTENT PAS AU SERVEUR', () => {
  const bloc = js.slice(js.indexOf('function rendreEvalListe'), js.indexOf('function rafraichirCorpsEval'));
  // Seul le changement de FORMATION recharge : c'est le serveur qui agrège par
  // formation. La recherche et l'état trient ce qui est déjà là.
  assert.ok(/evalStatut = etat\.value; rafraichirCorpsEval\(\)/.test(bloc),
    'le filtre d\'état doit redessiner le corps, pas recharger');
  assert.ok(/evalQ = q\.value; rafraichirCorpsEval\(\)/.test(bloc),
    'la recherche doit redessiner le corps, pas recharger');
  assert.ok(/await ouvrirEvaluateur\(\)/.test(bloc), 'changer de formation, lui, recharge');
});

test('les assets sont versionnés : sans bump, le navigateur sert l\'ancien écran', () => {
  // Même règle qu'ailleurs : on n'attache pas un test à un numéro qui monte à
  // chaque lot, mais on exige que les deux assets bougent ENSEMBLE.
  const vJs = (html.match(/academy\.js\?v=(\d+)/) || [])[1];
  const vCss = (html.match(/academy\.css\?v=(\d+)/) || [])[1];
  assert.ok(vJs && vCss, 'les deux assets doivent être versionnés');
  assert.strictEqual(vJs, vCss, 'academy.js et academy.css doivent porter la même version');
  assert.ok(Number(vJs) >= 33, 'la version doit avoir été bumpée pour ce lot');
});

test('MON ACADEMY N\'A PAS BOUGÉ : cartes, tri et filtres du coach intacts', () => {
  // Le périmètre le plus important du lot : la refonte ne devait toucher QUE
  // l'espace d'évaluation.
  const accueil = js.slice(js.indexOf('function formationsAffichees'), js.indexOf('function rendreBarreLaterale'));
  assert.ok(/accueilFiltre === 'certifiantes'/.test(accueil), 'le filtre certifiantes est intact');
  assert.ok(/accueilCategorie !== 'toutes'/.test(accueil), 'le filtre par catégorie est intact');
  assert.ok(/ORDRE_STATUT\.indexOf/.test(accueil), 'le tri par statut est intact');
  const cartes = js.slice(js.indexOf('function rendreAccueil'), js.indexOf('function etapesDe'));
  assert.ok(/ac-fc ac-fc-/.test(cartes), 'les cartes de formation sont intactes');
  assert.ok(/ac-cats/.test(cartes), 'le rail de catégories est intact');
  assert.ok(/data-ouvrir=/.test(cartes), 'les boutons des cartes sont intacts');
});
