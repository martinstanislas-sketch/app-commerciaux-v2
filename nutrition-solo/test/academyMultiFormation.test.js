'use strict';
// ============================================================================
//  MY COACH ACADEMY — cloisonnement multi-formation (lot 5, tranche 2).
//
//  CE QUI EST DÉMONTRÉ : deux formations coexistent sans se contaminer. Aucune
//  ne voit les modules, les vidéos, les questions, les tentatives, la
//  progression, la position, la pratique ni la certification de l'autre.
//
//  ⚠️ LA SECONDE FORMATION EST UNE FIXTURE DE TEST, posée ici par ses seules
//  DONNÉES — une ligne de catalogue, deux modules, deux contenus, trois
//  questions. Aucune ligne de moteur n'a été écrite pour elle : c'est
//  précisément ce que ce fichier doit prouver. Elle n'est jamais amorcée en
//  production.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DB = path.join(os.tmpdir(), `nutri-academy-multi-test-${process.pid}.sqlite`);
process.env.NUTRITION_DB = DB;
process.env.ADMIN_EMAIL = 'patron@exemple.fr';

const app = require('../server');
const { COACH_NUTRITION } = require('../lib/academyFormations');

const A = COACH_NUTRITION;          // Coach Nutrition : pratique OUI, certification OUI
const B = 'formation_test_b';       // fixture : pratique NON, certification NON, seuil 60
const THEO = 'theo.m@exemple.fr';
const EVA = 'eva.m@exemple.fr';
const ADMIN = 'patron@exemple.fr';

const dbq = () => require('../lib/db').getDb();
const acad = () => app.academy;
const qcm = () => app.academyQcm;
const prat = () => app.academyPratique;
const cert = () => app.academyCertifications;

// -- Poser un compte et un rôle sans passer par HTTP --------------------------
function compte(email, prenom) {
  dbq().prepare("INSERT OR IGNORE INTO users (email, prenom, cree_le) VALUES (?, ?, ?)")
    .run(email, prenom, new Date().toISOString());
  app.boost.definirRole(email, 'collaborateur', ADMIN);
}

// -- LA FIXTURE : une formation entière, par ses seules données ---------------
//
//  C'est aussi la démonstration de la procédure d'ajout : une ligne de
//  catalogue, des modules, des contenus, des questions. Rien d'autre.
function poserFormationB() {
  const d = dbq();
  const maintenant = new Date().toISOString();

  app.academyFormations.definir({
    cle: B, libelle: 'Formation de test B', ordre: 2,
    qcmNbQuestions: 3, qcmSeuilPct: 60,
    pratiqueObligatoire: false, certificationActive: false,
  }, ADMIN);

  const modules = [
    { cle: 'b-m1', titre: 'Module B1', ordre: 1 },
    { cle: 'b-m2', titre: 'Module B2', ordre: 2 },
  ];
  const contenus = [
    { cle: 'b-c1', module: 'b-m1', titre: 'Vidéo B — première', youtube: 'BBBBbbbb001', duree: 4 },
    { cle: 'b-c2', module: 'b-m2', titre: 'Vidéo B — seconde', youtube: 'BBBBbbbb002', duree: 6 },
  ];
  const questions = [
    { cle: 'b-q1', enonce: 'Question B numéro un ?', choix: [['B1 juste', 1], ['B1 faux', 0]] },
    { cle: 'b-q2', enonce: 'Question B numéro deux ?', choix: [['B2 juste', 1], ['B2 faux', 0]] },
    { cle: 'b-q3', enonce: 'Question B numéro trois ?', choix: [['B3 juste', 1], ['B3 faux', 0]] },
  ];

  d.transaction(() => {
    const ids = {};
    for (const m of modules) {
      const i = d.prepare(`INSERT INTO academy_modules (formation, titre, description, ordre, actif, cle, cree_le, maj_le)
                           VALUES (?,?,?,?,1,?,?,?)`)
        .run(B, m.titre, 'Module de la formation de test.', m.ordre, m.cle, maintenant, maintenant);
      ids[m.cle] = Number(i.lastInsertRowid);
    }
    contenus.forEach((c, i) => {
      d.prepare(`INSERT INTO academy_contenus (module_id, type, titre, description, youtube_id, duree_min, ordre, actif, cle, cree_le, maj_le)
                 VALUES (?,'video',?,?,?,?,?,1,?,?,?)`)
        .run(ids[c.module], c.titre, null, c.youtube, c.duree, i + 1, c.cle, maintenant, maintenant);
    });
    questions.forEach((q, iq) => {
      const i = d.prepare(`INSERT INTO academy_questions (formation, module_id, enonce, actif, ordre, cle, cree_le, maj_le)
                           VALUES (?,?,?,1,?,?,?,?)`)
        .run(B, ids['b-m1'], q.enonce, iq + 1, q.cle, maintenant, maintenant);
      q.choix.forEach(([texte, correct], j) => {
        d.prepare(`INSERT INTO academy_choix (question_id, texte, correct, actif, ordre, cle, cree_le, maj_le)
                   VALUES (?,?,?,1,?,?,?,?)`)
          .run(Number(i.lastInsertRowid), texte, correct, j + 1, `${q.cle}-c${j + 1}`, maintenant, maintenant);
      });
    });
  })();
}

// Termine tous les contenus d'UNE formation.
function terminerContenus(email, formation) {
  for (const c of acad().formationPour(email, formation).modules.flatMap((m) => m.contenus)) {
    acad().terminerContenu(email, c.id);
  }
}

// Passe et réussit le QCM d'UNE formation. Le corrigé est lu en base : aucune
// route ne le donne, et c'est la propriété du lot 2.
function reussirQcm(email, formation) {
  const t = qcm().demarrer(email, formation).body.tentative;
  const k = new Map(dbq().prepare('SELECT id, correct_json AS c FROM academy_tentative_questions WHERE tentative_id = ?')
    .all(t.id).map((r) => [r.id, JSON.parse(r.c)]));
  for (const q of t.questions) qcm().repondre(email, t.id, q.id, k.get(q.id));
  return qcm().terminer(email, t.id).body.tentative.resultat;
}

test.before(() => {
  app.boost.assurerSchema();
  cert().assurerSchema();
  compte(THEO, 'Théo');
  compte(EVA, 'Eva');
  prat().definirEvaluateur(EVA, true, ADMIN);
  poserFormationB();
});

test.after(() => {
  require('../lib/db').closeDb();
  ['', '-wal', '-shm'].forEach((s) => { try { fs.unlinkSync(DB + s); } catch (_) {} });
});

// ===========================================================================
//  1. LE CATALOGUE
// ===========================================================================

test('le catalogue porte deux formations, aux réglages différents', () => {
  const l = app.academyFormations.lister();
  assert.deepStrictEqual(l.map((f) => f.cle), [A, B]);
  assert.strictEqual(l[0].qcmSeuilPct, 80);
  assert.strictEqual(l[1].qcmSeuilPct, 60, 'la formation B a SON seuil');
  assert.strictEqual(l[1].qcmNbQuestions, 3);
  assert.strictEqual(l[1].pratiqueObligatoire, false);
  assert.strictEqual(l[1].certificationActive, false);
});

// ===========================================================================
//  2. CONTENUS ET PROGRESSION
// ===========================================================================

test('les MODULES sont cloisonnés', () => {
  const a = acad().formationPour(THEO, A).modules.map((m) => m.titre);
  const b = acad().formationPour(THEO, B).modules.map((m) => m.titre);
  assert.ok(a.every((t) => /démonstration/.test(t)), 'A : ' + a.join(' | '));
  assert.deepStrictEqual(b, ['Module B1', 'Module B2']);
  assert.strictEqual(a.filter((t) => b.includes(t)).length, 0, 'aucun module commun');
});

test('les VIDÉOS sont cloisonnées', () => {
  const idsA = acad().formationPour(THEO, A).modules.flatMap((m) => m.contenus).map((c) => c.youtubeId);
  const idsB = acad().formationPour(THEO, B).modules.flatMap((m) => m.contenus).map((c) => c.youtubeId);
  assert.ok(idsA.every((i) => /^DEMO/.test(i)));
  assert.deepStrictEqual(idsB, ['BBBBbbbb001', 'BBBBbbbb002']);
  assert.strictEqual(idsA.filter((i) => idsB.includes(i)).length, 0);
});

test('la PROGRESSION est indépendante', () => {
  assert.strictEqual(acad().formationPour(THEO, A).pourcentage, 0);
  assert.strictEqual(acad().formationPour(THEO, B).pourcentage, 0);

  terminerContenus(THEO, B);
  assert.strictEqual(acad().formationPour(THEO, B).acheve, true, 'B est terminée');
  assert.strictEqual(acad().formationPour(THEO, A).acheve, false, 'A n\'a pas bougé');
  assert.strictEqual(acad().formationPour(THEO, A).pourcentage, 0);
  assert.strictEqual(acad().formationPour(THEO, A).termines, 0);
});

test('la POSITION de reprise est indépendante', () => {
  const premierA = acad().formationPour(THEO, A).modules[0].contenus[0];
  const premierB = acad().formationPour(THEO, B).modules[0].contenus[0];
  acad().ouvrirContenu(THEO, premierA.id);
  assert.strictEqual(acad().positionDe(THEO, A), premierA.id);
  acad().ouvrirContenu(THEO, premierB.id);
  assert.strictEqual(acad().positionDe(THEO, B), premierB.id);
  assert.strictEqual(acad().positionDe(THEO, A), premierA.id,
    'ouvrir un contenu de B n\'a pas déplacé le point de reprise de A');
  // Deux lignes distinctes en base : la clé primaire est bien (email, formation).
  assert.strictEqual(dbq().prepare('SELECT COUNT(*) AS n FROM academy_position WHERE email = ?').get(THEO).n, 2);
});

// ===========================================================================
//  3. LE QCM
// ===========================================================================

test('la BANQUE DE QUESTIONS est cloisonnée', () => {
  const a = qcm().questionsEligibles(A).map((q) => q.enonce);
  const b = qcm().questionsEligibles(B).map((q) => q.enonce);
  assert.ok(a.length >= 8, 'la banque de A : ' + a.length);
  assert.strictEqual(b.length, 3, 'la banque de B : trois questions');
  assert.ok(b.every((e) => /^Question B/.test(e)));
  assert.strictEqual(a.filter((e) => b.includes(e)).length, 0, 'aucune question commune');
});

test('le QCM de B ne s\'ouvre qu\'avec les contenus de B — et tire SES questions', () => {
  const e = qcm().etatPour(THEO, B);
  assert.strictEqual(e.etat, 'qcm_disponible', 'B est prête : ses contenus sont terminés');
  assert.strictEqual(qcm().etatPour(THEO, A).etat, 'formation_en_cours', 'A ne l\'est pas');

  const t = qcm().demarrer(THEO, B).body.tentative;
  assert.strictEqual(t.nbQuestions, 3, 'le nombre de questions de B');
  assert.strictEqual(t.seuilPct, 60, 'et SON seuil, pas celui de A');
  assert.ok(t.questions.every((q) => /^Question B/.test(q.enonce)),
    'des questions de A ont fui dans le tirage : ' + t.questions.map((q) => q.enonce).join(' | '));
});

test('le SEUIL propre à B est réellement appliqué', () => {
  const enCours = qcm().etatPour(THEO, B).enCours;
  const k = new Map(dbq().prepare('SELECT id, correct_json AS c FROM academy_tentative_questions WHERE tentative_id = ?')
    .all(enCours.id).map((r) => [r.id, JSON.parse(r.c)]));
  const t = qcm().lireTentative(THEO, enCours.id).body.tentative;
  // 2 bonnes sur 3 = 67 % : sous le seuil de A (80), au-dessus de celui de B (60).
  t.questions.forEach((q, i) => {
    const bons = k.get(q.id);
    const mauvais = q.choix.map((c) => c.id).filter((id) => !bons.includes(id));
    qcm().repondre(THEO, t.id, q.id, i < 2 ? bons : [mauvais[0]]);
  });
  const res = qcm().terminer(THEO, t.id).body.tentative.resultat;
  assert.strictEqual(res.scorePct, 67);
  assert.strictEqual(res.seuilPct, 60);
  assert.strictEqual(res.reussie, true, '67 % passe le seuil de B — il n\'aurait pas passé celui de A');
});

test('les TENTATIVES, SCORES et VALIDATION THÉORIQUE sont indépendants', () => {
  const b = qcm().etatPour(THEO, B);
  const a = qcm().etatPour(THEO, A);
  assert.strictEqual(b.theorieValidee, true);
  assert.strictEqual(a.theorieValidee, false, 'réussir B ne valide pas la théorie de A');
  assert.strictEqual(b.scoreValide, 67);
  assert.strictEqual(a.scoreValide, null);
  assert.strictEqual(b.historique.length, 1);
  assert.strictEqual(a.historique.length, 0, 'aucune tentative ne s\'est glissée dans A');
  // Et en base, chaque tentative porte sa formation.
  const lignes = dbq().prepare('SELECT formation FROM academy_tentatives WHERE email = ?').all(THEO);
  assert.ok(lignes.every((l) => l.formation === B));
});

// ===========================================================================
//  4. LA PRATIQUE
// ===========================================================================

test('B n\'a pas d\'étape pratique : elle n\'est pas demandée', () => {
  const e = cert().etatPour(THEO, B);
  assert.deepStrictEqual(e.prerequis.map((p) => p.cle), ['theorie']);
  assert.strictEqual(e.pratiqueObligatoire, false);
  assert.strictEqual(e.manquants.length, 0, 'sa théorie suffit');
});

test('valider la pratique de A ne touche pas B', () => {
  terminerContenus(THEO, A);
  reussirQcm(THEO, A);
  assert.strictEqual(qcm().etatPour(THEO, A).theorieValidee, true);

  const r = prat().ouvrir(THEO, EVA, { formation: A, resultat: 'valide', dateEvaluation: '2026-09-10' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(prat().etatPour(THEO, A).validee, true);
  assert.strictEqual(prat().etatPour(THEO, B).validee, false, 'B n\'a pas hérité de la pratique de A');
  assert.strictEqual(prat().etatPour(THEO, B).historique.length, 0, 'ni de son historique');
  // La ligne porte bien sa formation.
  assert.strictEqual(dbq().prepare('SELECT formation FROM academy_evaluations WHERE email = ?').get(THEO).formation, A);
});

test('une évaluation ne s\'ouvre pas sur une formation inconnue', () => {
  const r = prat().ouvrir(THEO, EVA, { formation: 'fantome', resultat: 'valide' });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(dbq().prepare('SELECT COUNT(*) AS n FROM academy_evaluations WHERE email = ?').get(THEO).n, 1);
});

// ===========================================================================
//  5. LA CERTIFICATION
// ===========================================================================

test('certifier A ne certifie pas B — et B ne certifie personne', () => {
  const d = cert().delivrer(THEO, ADMIN, { formation: A, obtenueLe: '2026-09-15' });
  assert.strictEqual(d.status, 201);
  assert.strictEqual(cert().etatPour(THEO, A).certifie, true);

  const b = cert().etatPour(THEO, B);
  assert.strictEqual(b.certifie, false);
  assert.strictEqual(b.certificationActive, false);
  assert.strictEqual(b.etat, 'parcours_termine', 'son parcours est fini, sans diplôme');
  assert.deepStrictEqual(b.historique, [], 'et sans historique de certification');
  assert.strictEqual(cert().delivrer(THEO, ADMIN, { formation: B }).status, 409);
});

test('seule la certification de Nutrition ouvre les droits du Boost', () => {
  assert.strictEqual(app.boost.estCoachCertifie(THEO), true, 'A ouvre le Boost');
  const lignes = dbq().prepare('SELECT formation FROM academy_certifications WHERE email = ?').all(THEO);
  assert.deepStrictEqual(lignes.map((l) => l.formation), [A], 'un seul diplôme, celui de A');
});

test('L\'ÉTAT COMPLET distingue les deux parcours, sans les mélanger', () => {
  const tout = cert().etatCompletPour(THEO);
  assert.deepStrictEqual(tout.map((f) => f.formation), [A, B]);
  assert.strictEqual(tout[0].certifie, true);
  assert.strictEqual(tout[1].certifie, false);
  assert.deepStrictEqual(tout[0].prerequis.map((p) => p.cle), ['theorie', 'pratique']);
  assert.deepStrictEqual(tout[1].prerequis.map((p) => p.cle), ['theorie']);
});

// ===========================================================================
//  6. AUCUNE CONTAMINATION, AUCUNE DONNÉE DE PRODUCTION
// ===========================================================================

test('chaque table cloisonnante porte bien ses deux formations', () => {
  for (const [table, colonne] of [['academy_modules', 'formation'], ['academy_questions', 'formation'],
    ['academy_tentatives', 'formation'], ['academy_position', 'formation'], ['academy_evaluations', 'formation'],
    ['academy_certifications', 'formation']]) {
    const cols = dbq().prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    assert.ok(cols.includes(colonne), table + ' n\'a pas de colonne formation');
  }
  const parF = dbq().prepare('SELECT formation, COUNT(*) AS n FROM academy_modules GROUP BY formation').all();
  assert.strictEqual(parF.length, 2, 'les modules des deux formations cohabitent');
});

test('la fixture n\'existe QUE dans les tests', () => {
  for (const f of ['lib/academyFormations.js', 'lib/academy.js', 'lib/academyQcm.js', 'lib/academyPratique.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    assert.ok(!src.includes(B), f + ' contient la formation de test');
  }
});

test('aucun ALTER TABLE users', () => {
  const cols = dbq().prepare('PRAGMA table_info(users)').all().map((c) => c.name.toLowerCase());
  assert.ok(!cols.some((c) => c.includes('formation') || c.includes('academy')), cols.join(', '));
});
