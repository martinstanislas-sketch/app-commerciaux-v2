'use strict';
// ============================================================================
//  MY COACH ACADEMY — le catalogue des formations (lot 5, première tranche).
//
//  CE QUI EST DÉMONTRÉ ICI : une formation est devenue de la DONNÉE. On en pose
//  une seconde sans toucher au code, avec ses propres réglages, sans pratique
//  et sans certification — et le moteur de certification s'y adapte tout seul.
//
//  ⚠️ LA SECONDE FORMATION EST UNE FIXTURE DE TEST. Elle est créée dans cette
//  suite, jamais amorcée en production : l'amorçage n'écrit que Coach Nutrition.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DB = path.join(os.tmpdir(), `nutri-academy-formations-test-${process.pid}.sqlite`);
process.env.NUTRITION_DB = DB;
process.env.ADMIN_EMAIL = 'patron@exemple.fr';

const app = require('../server');
const F = require('../lib/academyFormations');

const dbq = () => require('../lib/db').getDb();
const registre = () => app.academyFormations;

test.before(() => { app.boost.assurerSchema(); app.academyCertifications.assurerSchema(); });
test.after(() => {
  require('../lib/db').closeDb();
  ['', '-wal', '-shm'].forEach((s) => { try { fs.unlinkSync(DB + s); } catch (_) {} });
});

// ===========================================================================
//  1. LE CATALOGUE EST UNE TABLE
// ===========================================================================

test('la table existe et porte tout ce qui dessine un parcours', () => {
  const cols = dbq().prepare('PRAGMA table_info(academy_formations)').all().map((c) => c.name);
  for (const attendue of ['cle', 'libelle', 'titre_certifie', 'ordre', 'actif', 'qcm_nb_questions',
    'qcm_seuil_pct', 'pratique_obligatoire', 'certification_active', 'reflet_boost']) {
    assert.ok(cols.includes(attendue), 'colonne manquante : ' + attendue + ' — vu : ' + cols.join(', '));
  }
});

test('Coach Nutrition est amorcée comme PREMIÈRE formation, pas comme cas particulier', () => {
  const l = registre().lister();
  assert.strictEqual(l.length, 1);
  const n = l[0];
  assert.strictEqual(n.cle, F.COACH_NUTRITION);
  assert.strictEqual(n.libelle, 'Coach Nutrition');
  assert.strictEqual(n.titre, 'Coach Nutrition certifié');
  assert.strictEqual(n.pratiqueObligatoire, true);
  assert.strictEqual(n.certificationActive, true);
  assert.strictEqual(n.refletBoost, true, 'elle seule ouvre les dossiers du Boost');
  assert.deepStrictEqual(registre().defaut(), n, 'et c\'est la formation par défaut');
});

test('l\'amorçage est idempotent et ne réécrit pas une formation modifiée', () => {
  registre().definir({ cle: F.COACH_NUTRITION, libelle: 'Coach Nutrition', titre: 'Coach Nutrition certifié', qcmSeuilPct: 75 });
  registre().amorcer();
  registre().amorcer();
  assert.strictEqual(registre().lister().length, 1);
  assert.strictEqual(registre().lire(F.COACH_NUTRITION).qcmSeuilPct, 75, 'le réglage n\'a pas été écrasé');
  registre().definir({ cle: F.COACH_NUTRITION, libelle: 'Coach Nutrition', titre: 'Coach Nutrition certifié', qcmSeuilPct: 80 });
});

test('une clé inconnue ne se rabat JAMAIS sur une autre formation', () => {
  assert.strictEqual(registre().lire('fantome'), null);
  assert.strictEqual(registre().resoudre('fantome'), null, 'sinon on mélangerait deux parcours');
  // Absente en revanche = formation par défaut : c'est ce qui rend le lot additif.
  assert.strictEqual(registre().resoudre(undefined).cle, F.COACH_NUTRITION);
  assert.strictEqual(registre().resoudre('').cle, F.COACH_NUTRITION);
});

// ===========================================================================
//  2. LA MIGRATION NE PERD RIEN
// ===========================================================================

test('l\'amorçage REPREND les réglages d\'academy_config au lieu de les écraser', () => {
  // On simule une base existante : réglages personnalisés dans academy_config
  // (là où le lot 2 les rangeait), et pas encore de ligne de formation.
  const d = dbq();
  app.academyQcm.assurerSchema();
  d.prepare("UPDATE academy_config SET valeur = '9' WHERE cle = 'qcm_nb_questions'").run();
  d.prepare("UPDATE academy_config SET valeur = '65' WHERE cle = 'qcm_seuil_pct'").run();
  d.prepare('DELETE FROM academy_formations WHERE cle = ?').run(F.COACH_NUTRITION);

  registre().amorcer();
  const n = registre().lire(F.COACH_NUTRITION);
  assert.strictEqual(n.qcmNbQuestions, 9, 'un réglage personnalisé serait perdu sans cette reprise');
  assert.strictEqual(n.qcmSeuilPct, 65);

  registre().definir({ cle: F.COACH_NUTRITION, libelle: 'Coach Nutrition',
    titre: 'Coach Nutrition certifié', qcmNbQuestions: 5, qcmSeuilPct: 80 });
});

// ===========================================================================
//  3. UNE SECONDE FORMATION, SANS TOUCHER AU CODE
// ===========================================================================

const LEADER = 'formation_test_b';

test('on pose une seconde formation par ses seules DONNÉES', () => {
  const r = registre().definir({
    cle: LEADER, libelle: 'Formation de test B', ordre: 2,
    qcmNbQuestions: 3, qcmSeuilPct: 60,
    pratiqueObligatoire: false, certificationActive: false,
  }, 'patron@exemple.fr');
  assert.strictEqual(r.status, 200);

  const f = registre().lire(LEADER);
  assert.strictEqual(f.qcmNbQuestions, 3, 'son propre nombre de questions');
  assert.strictEqual(f.qcmSeuilPct, 60, 'son propre seuil');
  assert.strictEqual(f.pratiqueObligatoire, false);
  assert.strictEqual(f.certificationActive, false);
  assert.strictEqual(f.titre, null, 'elle ne certifie pas : pas de titre');
  // Et surtout : elle n'ouvre AUCUN droit métier.
  assert.strictEqual(f.refletBoost, false, 'le reflet Boost ne s\'accorde pas depuis une saisie');

  const l = registre().lister();
  assert.deepStrictEqual(l.map((x) => x.cle), [F.COACH_NUTRITION, LEADER], 'catalogue ordonné');
});

test('le reflet Boost ne peut pas être RÉCLAMÉ dans les données', () => {
  registre().definir({ cle: LEADER, libelle: 'Formation de test B', refletBoost: true, certificationActive: false });
  assert.strictEqual(registre().lire(LEADER).refletBoost, false,
    'une formation ne s\'accorde pas l\'ouverture des dossiers clients');
  assert.strictEqual(registre().lire(F.COACH_NUTRITION).refletBoost, true, 'Nutrition garde le sien');
});

test('les saisies absurdes sont refusées', () => {
  for (const donnees of [
    { cle: 'X', libelle: 'Majuscules' },
    { cle: 'ab', libelle: 'Trop court' },
    { cle: 'formation_ok', libelle: '' },
    { cle: 'formation_ok', libelle: 'Seuil fou', qcmSeuilPct: 140 },
    { cle: 'formation_ok', libelle: 'Zéro question', qcmNbQuestions: 0 },
    { cle: 'formation_ok', libelle: 'Certifie sans titre', certificationActive: true },
  ]) {
    assert.strictEqual(registre().definir(donnees).status, 400, JSON.stringify(donnees));
  }
  assert.strictEqual(registre().lire('formation_ok'), null, 'aucune ligne n\'a été créée');
});

test('désactiver une formation la retire du catalogue sans la supprimer', () => {
  registre().definir({ cle: LEADER, libelle: 'Formation de test B', actif: false, certificationActive: false });
  assert.ok(!registre().lister().some((f) => f.cle === LEADER));
  assert.ok(registre().lister({ toutes: true }).some((f) => f.cle === LEADER), 'la ligne est conservée');
  assert.strictEqual(registre().resoudre(LEADER), null, 'et elle n\'est plus résolvable');
  registre().definir({ cle: LEADER, libelle: 'Formation de test B', actif: true, certificationActive: false });
});

// ===========================================================================
//  4. LE MOTEUR DE CERTIFICATION SUIT LES DRAPEAUX
// ===========================================================================

const COLLAB = 'theo.f@exemple.fr';

test.before(() => {
  const d = dbq();
  // `cree_le` est la seule colonne obligatoire de users : sans elle l'insertion
  // échoue en silence sous OR IGNORE, et le compte n'existerait pas.
  d.prepare("INSERT OR IGNORE INTO users (email, prenom, cree_le) VALUES (?, 'Théo', ?)")
    .run(COLLAB, new Date().toISOString());
  app.boost.definirRole(COLLAB, 'collaborateur', 'patron@exemple.fr');
});

test('formation SANS pratique : le prérequis pratique n\'est pas demandé', () => {
  const e = app.academyCertifications.etatPour(COLLAB, LEADER);
  assert.deepStrictEqual(e.prerequis.map((p) => p.cle), ['theorie'],
    'la pratique n\'est pas « sautée » : elle n\'est pas demandée');
  assert.strictEqual(e.pratiqueObligatoire, false);

  const n = app.academyCertifications.etatPour(COLLAB, F.COACH_NUTRITION);
  assert.deepStrictEqual(n.prerequis.map((p) => p.cle), ['theorie', 'pratique'],
    'Nutrition, elle, la demande toujours');
});

test('formation SANS certification : un parcours, pas un diplôme fictif', () => {
  const e = app.academyCertifications.etatPour(COLLAB, LEADER);
  assert.strictEqual(e.certificationActive, false);
  assert.strictEqual(e.certifie, false);
  assert.strictEqual(e.eligible, false);
  assert.strictEqual(e.etat, 'parcours_en_cours');
  assert.strictEqual(e.certification, null);
  assert.deepStrictEqual(e.historique, []);
});

test('on ne délivre pas un titre que la formation ne prévoit pas', () => {
  const r = app.academyCertifications.delivrer(COLLAB, 'patron@exemple.fr', { formation: LEADER });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.body.sansCertification, true);
  const retrait = app.academyCertifications.retirer(COLLAB, 'patron@exemple.fr', { formation: LEADER, motif: 'x' });
  assert.strictEqual(retrait.status, 409);
  assert.strictEqual(dbq().prepare('SELECT COUNT(*) AS n FROM academy_certifications WHERE formation = ?')
    .get(LEADER).n, 0);
});

test('l\'écran d\'administration n\'a rien à délivrer pour une telle formation', () => {
  const d = app.academyCertifications.listerAdmin(LEADER);
  assert.deepStrictEqual(d.eligibles, []);
  assert.deepStrictEqual(d.certifies, []);
  assert.deepStrictEqual(d.ecarts, []);
});

test('l\'état complet couvre TOUTES les formations du catalogue', () => {
  const tout = app.academyCertifications.etatCompletPour(COLLAB);
  assert.deepStrictEqual(tout.map((f) => f.formation), [F.COACH_NUTRITION, LEADER]);
  assert.strictEqual(tout[0].certificationActive, true);
  assert.strictEqual(tout[1].certificationActive, false);
});

test('aucune vraie seconde formation n\'est amorcée en production', () => {
  // L'amorçage du moteur n'écrit QUE Coach Nutrition. La formation de test
  // ci-dessus a été créée par cette suite, pas par le code de production.
  const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'academyFormations.js'), 'utf8');
  const code = source.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.ok(!/coach_leader|Coach Leader/i.test(code), 'aucune donnée Coach Leader dans le code');
  assert.strictEqual((code.match(/cle:\s*COACH_NUTRITION/g) || []).length, 1,
    'une seule formation amorcée');
});

test('aucun ALTER TABLE users', () => {
  const cols = dbq().prepare('PRAGMA table_info(users)').all().map((c) => c.name.toLowerCase());
  for (const interdit of ['formation', 'academy', 'certif']) {
    assert.ok(!cols.some((c) => c.includes(interdit)), 'colonnes users : ' + cols.join(', '));
  }
});
