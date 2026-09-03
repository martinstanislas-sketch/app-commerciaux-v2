'use strict';
// ============================================================================
//  MY COACH ACADEMY — LA GRILLE D'ÉVALUATION PRATIQUE (Fitness Boxe).
//
//  SEPT PROPRIÉTÉS, ET LA PREMIÈRE EST CELLE QU'ON NE VOIT PAS SE CASSER :
//
//   1. LA GRILLE NE DÉCIDE PAS DE LA RÉUSSITE. Neuf critères non acquis et un
//      verdict « validé » : l'évaluation est validée. C'est le certificateur
//      qui tranche, exactement comme avant ce lot. Le jour où une règle
//      automatique sera décidée, c'est CE test qui devra changer — et son
//      changement sera une décision, pas un effet de bord.
//
//   2. LE RÉSULTAT D'UN AXE EST CALCULÉ : 3/3 maîtrisé, 2/3 à renforcer, 0 ou
//      1 non maîtrisé. Jamais choisi, jamais stocké.
//
//   3. LA GRILLE SE REMPLIT ENTIÈREMENT OU PAS DU TOUT. Un axe à moitié
//      renseigné afficherait un résultat faux qui a l'air juste.
//
//   4. UN CRITÈRE NON ACQUIS OBLIGE À ÉCRIRE POURQUOI.
//
//   5. LA MÊME GRILLE VAUT POUR LES SIX CAS. Le cas change, la grille reste.
//
//   6. LES LIBELLÉS SONT FIGÉS DANS L'ÉVALUATION : renommer un critère du
//      référentiel ne réécrit aucune évaluation déjà prononcée.
//
//   7. UNE FORMATION SANS GRILLE RESTE ENTIÈRE, et les évaluations d'avant
//      restent lisibles — c'est ce qui garantit qu'on n'a rien cassé.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DB = path.join(os.tmpdir(), `nutri-academy-grille-test-${process.pid}.sqlite`);
process.env.NUTRITION_DB = DB;
process.env.ADMIN_EMAIL = 'patron@exemple.fr';

const app = require('../server');
const G = require('../lib/academyGrilles');

const ADMIN = 'patron@exemple.fr';
const EVA = 'eva.gr@exemple.fr';    // la certificatrice
const THEO = 'theo.gr@exemple.fr';  // le coach évalué
const BOXE = 'fitness_boxe';
// UNE FORMATION TÉMOIN, sans grille et sans scénario. coach_nutrition tenait
// ce rôle jusqu'à ce qu'elle reçoive les siens : un témoin à qui l'on donne
// ce qu'il doit contredire n'est plus un témoin.
const TEMOIN = 'formation_temoin';
const jetons = {};
let srv, base;
let CAS = [];

const dbq = () => require('../lib/db').getDb();

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

// La grille servie à l'écran, avec la fiche du coach.
const fiche = async () => (await api('GET',
  `/api/academy/evaluateur/collaborateurs/${encodeURIComponent(THEO)}?formation=${BOXE}`,
  null, jetons[EVA])).body;

// Prononcer une évaluation en une fois, comme le fait l'écran.
const prononcer = (corps) => api('POST',
  `/api/academy/evaluateur/collaborateurs/${encodeURIComponent(THEO)}/evaluations`,
  { formation: BOXE, ...corps }, jetons[EVA]);

// Les neuf critères, avec le nombre d'acquis voulu PAR AXE.
function criteresAvec(grille, parAxe) {
  return grille.flatMap((a, i) => a.criteres.map((c, j) => ({ id: c.id, acquis: j < parAxe[i] })));
}

// Remettre le coach en état d'être évalué : une validation clôt l'étape.
function reinitialiser() {
  dbq().prepare('DELETE FROM academy_evaluations WHERE email = ? AND formation = ?').run(THEO, BOXE);
}

test.before(async () => {
  srv = app.listen(0);
  await new Promise((r) => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;

  for (const [email, pin] of [[ADMIN, '7777'], [EVA, '5005'], [THEO, '4004']]) await connecter(email, pin);
  for (const email of [EVA, THEO]) {
    await api('POST', '/api/boost/admin/collaborateurs', { email, role: 'collaborateur' }, jetons[ADMIN]);
    await connecter(email, email === EVA ? '5005' : '4004');
  }
  await api('POST', '/api/academy/admin/evaluateurs', { email: EVA, evaluateur: true }, jetons[ADMIN]);

  // LA FORMATION FITNESS BOXE ET SES SIX CAS, posés par les données — comme en
  // production. La grille, elle, s'amorce toute seule (cf. academyGrilles).
  app.academyPratique.assurerSchema();
  app.academyGrilles.assurerSchema();
  app.academyFormations.definir({
    cle: BOXE, libelle: 'Fitness Boxe', titre: 'Fitness Boxe My Coach certifié', ordre: 20,
    qcmNbQuestions: 1, qcmSeuilPct: 0, pratiqueObligatoire: true, certificationActive: true,
  }, ADMIN);
  const maintenant = new Date().toISOString();
  // LES SIX TITRES RÉELS, ceux de la base : c'est par eux que les scénarios se
  // rattachent (le garde-fou de `amorcerScenariosFitnessBoxe` vérifie le titre
  // avant d'écrire, pour ne jamais donner à un cas le rôle d'un autre).
  G.SCENARIOS_FITNESS_BOXE.forEach((sc) => {
    dbq().prepare(`INSERT INTO academy_cas (formation, titre, consignes, ordre, actif, cle, cree_le, maj_le)
                   VALUES (?,?,?,?,1,?,?,?)`)
      .run(BOXE, sc.titre, `SITUATION PRÉSENTÉE AU COACH\nAncien pavé, conservé.`,
        sc.ordre, `gr-cas-${sc.ordre}`, maintenant, maintenant);
  });
  // Les deux amorçages n'ont pu aboutir qu'une fois academy_config et les cas
  // posés : on les rejoue, comme le fait assurerSchema à chaque appel.
  app.academyGrilles.amorcer();
  CAS = dbq().prepare('SELECT id, titre FROM academy_cas WHERE formation = ? ORDER BY ordre').all(BOXE);

  // La formation témoin et son cas nu : ni critères, ni scénario.
  app.academyFormations.definir({
    cle: TEMOIN, libelle: 'Formation témoin', ordre: 90,
    qcmNbQuestions: 1, qcmSeuilPct: 0, pratiqueObligatoire: true, certificationActive: false,
  }, ADMIN);
  dbq().prepare(`INSERT INTO academy_cas (formation, titre, consignes, ordre, actif, cle, cree_le, maj_le)
                 VALUES (?,?,NULL,1,1,?,?,?)`)
    .run(TEMOIN, 'Cas sans scénario', 'gr-temoin-1', maintenant, maintenant);

  // La théorie de Théo, prérequis de toute évaluation pratique. On la pose par
  // le moteur, pas par une route : ce n'est pas l'objet de ce fichier.
  dbq().prepare(`INSERT INTO academy_tentatives
      (email, formation, portee, statut, nb_questions, seuil_pct, ouverte_le, soumise_le, score_pct, bonnes, reussie)
      VALUES (?,?,'finale','soumise',1,0,?,?,100,1,1)`).run(THEO, BOXE, maintenant, maintenant);
});

test.after(() => {
  if (srv) srv.close();
  require('../lib/db').closeDb();
  ['', '-wal', '-shm'].forEach((s) => { try { fs.unlinkSync(DB + s); } catch (_) {} });
});

// ===========================================================================
//  1. LE RÉFÉRENTIEL
// ===========================================================================

test('la grille Fitness Boxe compte TROIS axes de TROIS critères', async () => {
  const f = await fiche();
  assert.strictEqual(f.ok, true, f.error || '');
  assert.strictEqual(f.grille.length, 3, 'trois axes attendus');
  assert.deepStrictEqual(f.grille.map((a) => a.axeTitre),
    ['Technique & pédagogie', 'Adaptation & coaching', 'Sécurité & maîtrise']);
  for (const a of f.grille) assert.strictEqual(a.criteres.length, 3, 'trois critères dans ' + a.axeTitre);
  // Les neuf énoncés sont ceux qui ont été rédigés, mot pour mot.
  const enonces = f.grille.flatMap((a) => a.criteres.map((c) => c.enonce));
  assert.ok(enonces.includes('Démontre correctement les mouvements et techniques proposés.'));
  assert.ok(enonces.includes('Identifie une situation à risque et intervient de manière appropriée.'));
});

test('l\'amorçage est idempotent : le rejouer n\'ajoute rien', () => {
  const avant = dbq().prepare('SELECT COUNT(*) AS n FROM academy_criteres WHERE formation = ?').get(BOXE).n;
  app.academyGrilles.amorcerFitnessBoxe();
  app.academyGrilles.amorcerFitnessBoxe();
  assert.strictEqual(dbq().prepare('SELECT COUNT(*) AS n FROM academy_criteres WHERE formation = ?').get(BOXE).n, avant);
});

test('LES CRITÈRES NE SONT PAS UNIVERSELS : aucune autre formation n\'en hérite', () => {
  // DEUX formations portent désormais une grille — Fitness Boxe et Nutrition
  // Certifié — et c'est ce qui rend la démonstration plus forte qu'avant :
  // deux référentiels coexistent sans qu'aucun critère ne passe de l'un à
  // l'autre, et une troisième formation n'hérite de rien.
  const avecGrille = dbq().prepare('SELECT DISTINCT formation FROM academy_criteres ORDER BY formation')
    .all().map((r) => r.formation);
  assert.deepStrictEqual(avecGrille, ['coach_nutrition', BOXE],
    'seules les formations amorcées portent une grille : ' + avecGrille.join(', '));

  // Aucun critère ne franchit la frontière : les clés de l'une ne sont jamais
  // servies à l'autre.
  const clesBoxe = app.academyGrilles.grillePour(BOXE).flatMap((a_) => a_.criteres.map((c) => c.cle));
  const clesNutri = app.academyGrilles.grillePour('coach_nutrition').flatMap((a_) => a_.criteres.map((c) => c.cle));
  assert.strictEqual(clesBoxe.length, 9);
  assert.strictEqual(clesNutri.length, 9);
  assert.strictEqual(clesBoxe.filter((c) => clesNutri.includes(c)).length, 0,
    'aucune clé ne doit être partagée entre deux grilles');

  // Et la formation témoin, elle, n'en a aucune.
  assert.strictEqual(app.academyGrilles.aUneGrille(TEMOIN), false);
  assert.deepStrictEqual(app.academyGrilles.grillePour(TEMOIN), []);
});

// ===========================================================================
//  2. LE RÉSULTAT D'UN AXE EST CALCULÉ
// ===========================================================================

test('3/3 maîtrisé, 2/3 à renforcer, 1/3 et 0/3 non maîtrisés', () => {
  assert.strictEqual(G.statutAxe(3, 3), G.MAITRISE);
  assert.strictEqual(G.statutAxe(2, 3), G.A_RENFORCER);
  assert.strictEqual(G.statutAxe(1, 3), G.NON_MAITRISE);
  assert.strictEqual(G.statutAxe(0, 3), G.NON_MAITRISE);
});

test('LES TROIS COMBINAISONS SE LISENT DANS LE RELEVÉ SERVI', async () => {
  reinitialiser();
  const f = await fiche();
  const r = await prononcer({
    resultat: 'a_repasser',
    casId: CAS[0].id,
    commentaire: 'Le placement des appuis reste à travailler.',
    criteres: criteresAvec(f.grille, [3, 2, 1]),
  });
  assert.strictEqual(r.status, 201, r.txt.slice(0, 200));

  const axes = r.body.evaluation.grille.axes;
  assert.deepStrictEqual(axes.map((a) => [a.acquis, a.total, a.statut, a.libelle]), [
    [3, 3, 'maitrise', 'Maîtrisé'],
    [2, 3, 'a_renforcer', 'À renforcer'],
    [1, 3, 'non_maitrise', 'Non maîtrisé'],
  ]);
  // Le relevé porte les neuf lignes, dans l'ordre de la grille.
  assert.strictEqual(r.body.evaluation.grille.criteres.length, 9);
});

test('le résultat de l\'axe n\'est JAMAIS stocké : il se recalcule', () => {
  const colonnes = dbq().prepare('PRAGMA table_info(academy_evaluation_criteres)').all().map((c) => c.name);
  for (const interdite of ['statut', 'resultat', 'note', 'score']) {
    assert.ok(!colonnes.includes(interdite),
      'la colonne ' + interdite + ' figerait un résultat qui doit se déduire');
  }
  assert.deepStrictEqual(colonnes.filter((c) => c === 'acquis'), ['acquis']);
});

// ===========================================================================
//  3. LA GRILLE SE REMPLIT ENTIÈREMENT
// ===========================================================================

test('une grille incomplète est REFUSÉE, et dit ce qui manque', async () => {
  reinitialiser();
  const f = await fiche();
  const partielle = criteresAvec(f.grille, [3, 3, 3]).slice(0, 7);
  const r = await prononcer({ resultat: 'valide', casId: CAS[0].id, criteres: partielle });
  assert.strictEqual(r.status, 400, r.txt.slice(0, 200));
  assert.match(r.body.error, /complète/);
  assert.strictEqual(r.body.grilleIncomplete, true);
  assert.strictEqual(r.body.manquants.length, 2, 'les critères manquants doivent être nommés');
  // ET RIEN N'A ÉTÉ ÉCRIT : un refus ne laisse pas d'évaluation derrière lui.
  assert.strictEqual(dbq().prepare('SELECT COUNT(*) AS n FROM academy_evaluations WHERE email = ? AND formation = ?')
    .get(THEO, BOXE).n, 0);
});

test('un critère venu d\'ailleurs est refusé, jamais ignoré', async () => {
  reinitialiser();
  const f = await fiche();
  const criteres = criteresAvec(f.grille, [3, 3, 3]);
  criteres[0] = { id: 99999, acquis: true };
  const r = await prononcer({ resultat: 'valide', casId: CAS[0].id, criteres });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.body.critereInconnu, true);
});

test('un critère sans réponse claire est refusé (deux états, pas trois)', async () => {
  reinitialiser();
  const f = await fiche();
  const criteres = criteresAvec(f.grille, [3, 3, 3]);
  criteres[4] = { id: criteres[4].id, acquis: 'peut-être' };
  const r = await prononcer({ resultat: 'valide', casId: CAS[0].id, criteres });
  assert.strictEqual(r.status, 400);
  assert.match(r.body.error, /acquis ou non acquis/);
});

// ===========================================================================
//  4. UN CRITÈRE NON ACQUIS OBLIGE À EXPLIQUER
// ===========================================================================

test('sans commentaire, une grille imparfaite est REFUSÉE', async () => {
  reinitialiser();
  const f = await fiche();
  const r = await prononcer({
    resultat: 'valide', casId: CAS[0].id, criteres: criteresAvec(f.grille, [3, 3, 2]),
  });
  assert.strictEqual(r.status, 400, r.txt.slice(0, 200));
  assert.strictEqual(r.body.commentaireRequis, true);
  assert.match(r.body.error, /commentaire/i);
});

test('une grille TOUTE acquise n\'exige aucun commentaire', async () => {
  reinitialiser();
  const f = await fiche();
  const r = await prononcer({
    resultat: 'valide', casId: CAS[0].id, criteres: criteresAvec(f.grille, [3, 3, 3]),
  });
  assert.strictEqual(r.status, 201, r.txt.slice(0, 200));
  assert.strictEqual(r.body.evaluation.commentaire, null);
  assert.strictEqual(r.body.evaluation.grille.axes.every((a) => a.statut === 'maitrise'), true);
});

// ===========================================================================
//  5. LA MÊME GRILLE POUR LES SIX CAS
// ===========================================================================

test('LES SIX CAS PRATIQUES emploient la MÊME grille', async () => {
  assert.strictEqual(CAS.length, 6, 'les six cas doivent exister');
  for (const cas of CAS) {
    reinitialiser();
    const f = await fiche();
    assert.strictEqual(f.grille.length, 3, 'la grille ne dépend pas du cas');
    const r = await prononcer({
      resultat: 'a_repasser', casId: cas.id,
      commentaire: 'À revoir sur ce cas.',
      criteres: criteresAvec(f.grille, [3, 3, 2]),
    });
    assert.strictEqual(r.status, 201, 'cas refusé : ' + cas.titre + ' — ' + r.txt.slice(0, 160));
    // Le cas est recopié dans l'évaluation, la grille est complète.
    assert.strictEqual(r.body.evaluation.cas, cas.titre);
    assert.strictEqual(r.body.evaluation.grille.criteres.length, 9);
    assert.deepStrictEqual(r.body.evaluation.grille.axes.map((a) => a.statut),
      ['maitrise', 'maitrise', 'a_renforcer']);
  }
});

// ===========================================================================
//  6. LES LIBELLÉS SONT FIGÉS
// ===========================================================================

test('renommer un critère du référentiel ne réécrit AUCUNE évaluation passée', async () => {
  reinitialiser();
  const f = await fiche();
  const r = await prononcer({
    resultat: 'valide', casId: CAS[0].id, criteres: criteresAvec(f.grille, [3, 3, 3]),
  });
  assert.strictEqual(r.status, 201, r.txt.slice(0, 200));
  const avant = r.body.evaluation.grille.criteres.map((c) => c.titre);

  dbq().prepare('UPDATE academy_criteres SET titre = ? WHERE cle = ?').run('Démonstration (v2)', 'fb-c1');
  const releve = app.academyGrilles.releveDe(r.body.evaluation.id).map((c) => c.titre);
  assert.deepStrictEqual(releve, avant, 'le relevé a suivi le référentiel : il devait être figé');
  dbq().prepare('UPDATE academy_criteres SET titre = ? WHERE cle = ?').run('Démonstration', 'fb-c1');
});

// ===========================================================================
//  7. RIEN N'EST CASSÉ
// ===========================================================================

test('LA GRILLE NE DÉCIDE PAS DE LA RÉUSSITE — la règle actuelle est inchangée', async () => {
  reinitialiser();
  const f = await fiche();
  // NEUF CRITÈRES NON ACQUIS, et le certificateur prononce « validé ».
  const r = await prononcer({
    resultat: 'valide', casId: CAS[0].id,
    commentaire: 'Tout est à revoir, mais je valide : c\'est la règle actuelle.',
    criteres: criteresAvec(f.grille, [0, 0, 0]),
  });
  assert.strictEqual(r.status, 201, r.txt.slice(0, 200));
  assert.deepStrictEqual(r.body.evaluation.grille.axes.map((a) => a.statut),
    ['non_maitrise', 'non_maitrise', 'non_maitrise']);
  // ⚠️ ET LA PRATIQUE EST VALIDÉE. C'est le verdict humain qui décide, pas la
  // grille. Le jour où une règle automatique sera décidée, c'est ici qu'elle
  // se verra — et ce sera une décision, pas un effet de bord.
  assert.strictEqual(r.body.pratique.validee, true);
  assert.strictEqual(r.body.pratique.etat, 'validee');
});

test('une formation SANS grille s\'évalue exactement comme avant', async () => {
  // Théo n'a pas la théorie de cette formation : on éprouve la grille, pas le
  // prérequis — on vérifie donc que la saisie n'exige AUCUN critère.
  const g = app.academyGrilles.verifierSaisie(TEMOIN, undefined);
  assert.strictEqual(g.grille, false, 'aucune grille ne doit être exigée');
  assert.ok(!g.erreur, 'et surtout aucun refus');
});

test('une évaluation SANS relevé reste lisible : la grille vaut null', async () => {
  reinitialiser();
  const maintenant = new Date().toISOString();
  // Une évaluation telle qu'elle existait AVANT ce lot : aucun critère.
  dbq().prepare(`INSERT INTO academy_evaluations
      (email, formation, cas, ouvert_par, ouverte_le, date_evaluation, evaluateur, resultat, commentaire, decide_le, maj_le)
      VALUES (?,?,?,?,?,?,?,'valide','Ancienne évaluation.',?,?)`)
    .run(THEO, BOXE, 'Support libre', EVA, maintenant, '2026-05-01', EVA, maintenant, maintenant);

  const p = app.academyPratique.etatPour(THEO, BOXE);
  assert.strictEqual(p.validee, true, 'une évaluation d\'avant doit rester valide');
  const ancienne = p.historique.find((h) => h.cas === 'Support libre');
  assert.ok(ancienne, 'elle doit rester dans l\'historique');
  assert.strictEqual(ancienne.grille, null, 'sans relevé, la grille vaut null — et rien ne casse');
});

test('AUCUNE ÉVALUATION EXISTANTE N\'A ÉTÉ TOUCHÉE par l\'arrivée de la grille', () => {
  // Les relevés n'existent que pour les évaluations qui en ont produit un.
  const orphelins = dbq().prepare(`SELECT COUNT(*) AS n FROM academy_evaluation_criteres c
                                   LEFT JOIN academy_evaluations e ON e.id = c.evaluation_id
                                   WHERE e.id IS NULL`).get().n;
  assert.strictEqual(orphelins, 0, 'un relevé pointe vers une évaluation qui n\'existe pas');
  // Et la table des évaluations n'a gagné aucune colonne : la grille vit à côté.
  const colonnes = dbq().prepare('PRAGMA table_info(academy_evaluations)').all().map((c) => c.name);
  for (const interdite of ['criteres', 'axes', 'grille', 'note']) {
    assert.ok(!colonnes.includes(interdite), 'academy_evaluations a été modifiée : ' + interdite);
  }
});

// ===========================================================================
//  8. LES SIX MISES EN SITUATION
// ===========================================================================

test('les six cas reçoivent leur scénario SANS être recréés', () => {
  const avant = CAS.map((c) => c.id);
  app.academyGrilles.amorcerScenariosFitnessBoxe();
  const apres = dbq().prepare('SELECT id, titre, lire, role, jouer, evalue, consignes FROM academy_cas WHERE formation = ? ORDER BY ordre')
    .all(BOXE);
  assert.deepStrictEqual(apres.map((c) => c.id), avant, 'les identifiants des cas ont changé');
  for (const c of apres) {
    assert.ok(c.lire && c.lire.length > 40, 'le texte à lire manque : ' + c.titre);
    assert.ok(c.role && c.role.length > 10, 'le rôle manque : ' + c.titre);
    const jouer = JSON.parse(c.jouer || '[]');
    assert.strictEqual(jouer.length, 3, 'trois comportements attendus : ' + c.titre);
    assert.ok(c.evalue, 'le lien avec les critères manque : ' + c.titre);
    // ⚠️ L'ANCIEN PAVÉ EST CONSERVÉ. On ne détruit pas ce qu'on remplace :
    // s'il faut revenir en arrière, rien n'a été perdu.
    assert.ok(c.consignes, 'les consignes d\'origine ont été effacées : ' + c.titre);
  }
});

test('l\'amorçage des scénarios est idempotent, et ne touche à aucun autre cas', () => {
  const autres = dbq().prepare('SELECT COUNT(*) AS n FROM academy_cas WHERE formation <> ? AND lire IS NOT NULL')
    .get(BOXE).n;
  assert.strictEqual(autres, 0, 'un cas d\'une autre formation a reçu un scénario');
  const avant = dbq().prepare('SELECT COUNT(*) AS n FROM academy_cas').get().n;
  app.academyGrilles.amorcerScenariosFitnessBoxe();
  app.academyGrilles.amorcerScenariosFitnessBoxe();
  assert.strictEqual(dbq().prepare('SELECT COUNT(*) AS n FROM academy_cas').get().n, avant, 'un cas a été ajouté');
});

test('le scénario voyage jusqu\'à l\'écran, avec ses trois comportements', async () => {
  const f = await fiche();
  const premier = f.cas.find((c) => c.ordre === 1);
  assert.ok(premier.scenario, 'le cas doit porter son scénario');
  assert.strictEqual(premier.scenario.jouer.length, 3);
  assert.match(premier.scenario.lire, /courte séquence adaptée/);
  // Un cas sans scénario le dit clairement, plutôt que d'inventer un objet vide.
  // Le cas de la formation témoin n'a ni scénario structuré ni colonnes
  // d'avant : il doit valoir `null`, pas un objet vide.
  const liste = app.academyPratique.listerCas(TEMOIN);
  assert.strictEqual(liste.length, 1, 'la formation témoin porte son cas nu');
  assert.strictEqual(liste[0].scenario, null, 'un cas sans scénario doit valoir null');
});
