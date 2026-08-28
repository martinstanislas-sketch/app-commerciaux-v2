'use strict';
// ============================================================================
//  MY COACH ACADEMY — l'import de la banque réelle de Coach Nutrition.
//
//  CE QUI EST ÉPROUVÉ ICI N'EST PAS LE MOTEUR, MAIS L'ÉCRITURE DES DONNÉES.
//  Une banque mal posée ne casse rien visiblement : elle rattache des questions
//  au mauvais module, ou en oublie cinq, et personne ne s'en aperçoit avant
//  qu'un collaborateur bute dessus.
//
//   1. LE COMPTE Y EST : 40 questions mini réparties 5 par module sur les huit
//      modules concernés, 20 questions finales, 240 choix.
//   2. LE RATTACHEMENT EST LE BON, vérifié module par module.
//   3. LE GARDE-FOU MORD : si les modules attendus ne sont pas là, on n'écrit
//      RIEN — pas « ce qu'on a pu ».
//   4. L'IMPORT EST IDEMPOTENT : le rejouer ne duplique rien et ne réécrase pas
//      une question corrigée depuis l'administration.
//   5. LES DEUX BANQUES SONT DISJOINTES : aucun énoncé commun.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');

const DB = path.join(os.tmpdir(), `nutri-academy-banque-test-${process.pid}.sqlite`);
process.env.NUTRITION_DB = DB;
process.env.ADMIN_EMAIL = 'patron@exemple.fr';

const app = require('../server');
const qcm = app.academyQcm;
const formations = app.academyFormations;
const BANQUE = require('../lib/academyBanqueCoachNutrition');
const { COACH_NUTRITION } = require('../lib/academyFormations');

const dbq = () => require('../lib/db').getDb();

// Les neuf modules de la vraie formation : le module d'introduction (sans mini)
// puis les huit modules de la banque, à leur ordre exact.
const TITRES = [
  'Devenir Coach Nutrition My Coach',
  ...BANQUE.MINI.map((b) => b.titre),
];

// On pose les modules en SQL direct : c'est exactement ce qu'a fait la reprise
// de la vraie formation, et on veut éprouver l'import sur cette forme-là.
function poserModules(titres) {
  const d = dbq();
  const now = new Date().toISOString();
  d.prepare('DELETE FROM academy_modules WHERE formation = ?').run(COACH_NUTRITION);
  titres.forEach((titre, i) => {
    d.prepare(`INSERT INTO academy_modules (formation, titre, description, ordre, actif, cle, cree_le, maj_le)
               VALUES (?,?,NULL,?,1,NULL,?,?)`).run(COACH_NUTRITION, titre, i + 1, now, now);
  });
}

const compter = (sql, ...p) => dbq().prepare(sql).get(...p).n;
const moduleAOrdre = (o) => dbq().prepare(
  'SELECT id, titre FROM academy_modules WHERE formation = ? AND ordre = ?').get(COACH_NUTRITION, o);

test.before(() => {
  // Le schéma Academy se pose à la première requête /api/academy. Ce fichier
  // n'en fait aucune : on l'appelle donc explicitement, ce qui déclenche au
  // passage la première tentative d'import.
  app.academy.assurerSchema();
  qcm.assurerSchema();

  // Ce démarrage a déjà tenté l'import : sur une base d'amorçage, les modules
  // attendus n'existent pas, donc il n'a rien écrit. C'est la situation n°3.
  assert.strictEqual(
    compter('SELECT COUNT(*) AS n FROM academy_questions WHERE cle LIKE \'cn-%\''), 0,
    'l\'import a écrit alors que les modules réels n\'existaient pas');
});

// ===========================================================================
//  3. LE GARDE-FOU
// ===========================================================================

test('un titre de module qui ne correspond pas : on n\'écrit rien du tout', () => {
  const faux = [...TITRES];
  faux[5] = 'Un titre qui n\'est pas celui attendu';
  poserModules(faux);

  const ecrites = qcm.importerBanqueCoachNutrition();
  assert.strictEqual(ecrites, 0, 'l\'import a écrit malgré un module non conforme');
  assert.strictEqual(compter('SELECT COUNT(*) AS n FROM academy_questions WHERE cle LIKE \'cn-%\''), 0,
    'des questions ont été posées malgré le garde-fou');
  assert.strictEqual(compter('SELECT COUNT(*) AS n FROM academy_config WHERE cle = ?', BANQUE.MARQUEUR), 0,
    'le marqueur a été posé alors que rien n\'a été importé');
});

// ===========================================================================
//  1 & 2. LE COMPTE ET LE RATTACHEMENT
// ===========================================================================

test('les 60 questions sont importées et rattachées au bon module', () => {
  poserModules(TITRES);
  const ecrites = qcm.importerBanqueCoachNutrition();
  assert.strictEqual(ecrites, 60, 'l\'import n\'a pas posé 60 questions : ' + ecrites);

  assert.strictEqual(compter('SELECT COUNT(*) AS n FROM academy_questions WHERE formation = ? AND usage = ?',
    COACH_NUTRITION, 'mini'), 40, 'la banque mini ne compte pas 40 questions');
  assert.strictEqual(compter('SELECT COUNT(*) AS n FROM academy_questions WHERE formation = ? AND usage = ? AND cle LIKE \'cn-fin-%\'',
    COACH_NUTRITION, 'finale'), 20, 'la banque finale ne compte pas 20 questions');
  assert.strictEqual(compter(`SELECT COUNT(*) AS n FROM academy_choix c
                              JOIN academy_questions q ON q.id = c.question_id
                              WHERE q.cle LIKE 'cn-%'`), 240, 'les 240 choix ne sont pas tous posés');

  // Le module d'introduction n'a AUCUNE question mini : c'est l'exception voulue.
  const intro = moduleAOrdre(1);
  assert.strictEqual(compter('SELECT COUNT(*) AS n FROM academy_questions WHERE module_id = ? AND usage = ?',
    intro.id, 'mini'), 0, 'le module d\'introduction a reçu un mini-QCM');

  // Et chacun des huit autres en a exactement cinq, les siennes.
  for (const bloc of BANQUE.MINI) {
    const m = moduleAOrdre(bloc.ordre);
    assert.ok(m, 'module absent à l\'ordre ' + bloc.ordre);
    const qs = dbq().prepare(`SELECT enonce FROM academy_questions
                              WHERE module_id = ? AND usage = 'mini' ORDER BY ordre ASC`).all(m.id);
    assert.strictEqual(qs.length, 5, `le module « ${bloc.titre} » n'a pas 5 questions mini`);
    assert.deepStrictEqual(qs.map((q) => q.enonce), bloc.questions.map((q) => q.enonce),
      `les questions du module « ${bloc.titre} » ne sont pas les siennes`);
  }

  // Les questions finales ne portent aucun module : elles sont transversales.
  assert.strictEqual(compter(`SELECT COUNT(*) AS n FROM academy_questions
                              WHERE cle LIKE 'cn-fin-%' AND module_id IS NOT NULL`), 0,
    'une question finale a été rattachée à un module');

  // Et les questions d'appareillage sont sorties du tirage.
  assert.strictEqual(compter(`SELECT COUNT(*) AS n FROM academy_questions
                              WHERE cle LIKE 'demo-q%' AND actif = 1`), 0,
    'des questions de démonstration restent actives après l\'import de la vraie banque');
});

test('les énoncés et les bonnes réponses sont ceux du document, au caractère près', () => {
  const lire = (cle) => {
    const q = dbq().prepare('SELECT id, enonce FROM academy_questions WHERE cle = ?').get(cle);
    const choix = dbq().prepare('SELECT texte, correct FROM academy_choix WHERE question_id = ? ORDER BY ordre ASC').all(q.id);
    return { enonce: q.enonce, choix: choix.map((c) => [c.texte, c.correct]) };
  };
  for (const bloc of BANQUE.MINI) {
    bloc.questions.forEach((attendu, i) => {
      assert.deepStrictEqual(lire(`${bloc.prefixe}-q${i + 1}`), { enonce: attendu.enonce, choix: attendu.choix },
        `${bloc.prefixe}-q${i + 1} a été altérée à l'écriture`);
    });
  }
  BANQUE.FINALE.forEach((attendu, i) => {
    const cle = `cn-fin-q${String(i + 1).padStart(2, '0')}`;
    assert.deepStrictEqual(lire(cle), { enonce: attendu.enonce, choix: attendu.choix },
      `${cle} a été altérée à l'écriture`);
  });
});

test('les réglages de la formation sont posés : 20 questions à 90 %, mini de 5 à 80 %', () => {
  const f = formations.lire(COACH_NUTRITION);
  assert.strictEqual(f.qcmNbQuestions, 20);
  assert.strictEqual(f.qcmSeuilPct, 90);
  assert.strictEqual(f.miniNbQuestions, 5);
  assert.strictEqual(f.miniSeuilPct, 80);
});

// ===========================================================================
//  5. LES DEUX BANQUES SONT DISJOINTES
// ===========================================================================

test('aucun énoncé n\'appartient aux deux banques', () => {
  const mini = new Set(dbq().prepare(
    'SELECT enonce FROM academy_questions WHERE formation = ? AND usage = ?').all(COACH_NUTRITION, 'mini')
    .map((q) => q.enonce));
  const finale = dbq().prepare(
    'SELECT enonce FROM academy_questions WHERE formation = ? AND usage = ? AND cle LIKE \'cn-fin-%\'')
    .all(COACH_NUTRITION, 'finale').map((q) => q.enonce);
  const communs = finale.filter((e) => mini.has(e));
  assert.deepStrictEqual(communs, [], 'des énoncés sont communs aux deux banques');
});

test('le tirage d\'un mini ne voit que sa banque, celui de la finale que la sienne', () => {
  for (const bloc of BANQUE.MINI) {
    const m = moduleAOrdre(bloc.ordre);
    const pool = qcm.questionsEligibles(COACH_NUTRITION, { usage: 'mini', moduleId: m.id });
    assert.strictEqual(pool.length, 5, `le vivier mini du module « ${bloc.titre} » ne compte pas 5 questions`);
    assert.deepStrictEqual(pool.map((q) => q.enonce).sort(), bloc.questions.map((q) => q.enonce).sort());
  }
  // 20 et non 30 : l'import a archivé les dix questions de démonstration, qui
  // relèvent de la banque finale que celle-ci remplace.
  const finale = qcm.questionsEligibles(COACH_NUTRITION, { usage: 'finale' });
  assert.strictEqual(finale.length, 20, 'le vivier final ne compte pas 20 questions');
  assert.deepStrictEqual(finale.map((q) => q.enonce).sort(), BANQUE.FINALE.map((q) => q.enonce).sort());
});

// ===========================================================================
//  4. L'IDEMPOTENCE
// ===========================================================================

test('rejouer l\'import ne duplique rien et ne réécrase pas une correction', () => {
  // On corrige une question depuis « l'administration ».
  const q = dbq().prepare('SELECT id FROM academy_questions WHERE cle = ?').get('cn-mini-m1-q1');
  dbq().prepare('UPDATE academy_questions SET enonce = ? WHERE id = ?').run('Énoncé corrigé à la main', q.id);

  const rejoue = qcm.importerBanqueCoachNutrition();
  assert.strictEqual(rejoue, 0, 'l\'import a rejoué alors que le marqueur est posé');
  assert.strictEqual(compter('SELECT COUNT(*) AS n FROM academy_questions WHERE cle LIKE \'cn-%\''), 60,
    'l\'import a dupliqué des questions');
  assert.strictEqual(
    dbq().prepare('SELECT enonce FROM academy_questions WHERE id = ?').get(q.id).enonce,
    'Énoncé corrigé à la main', 'l\'import a réécrasé une correction faite à la main');
});
