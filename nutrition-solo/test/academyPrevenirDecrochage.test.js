'use strict';
// ============================================================================
//  MY COACH ACADEMY — « Prévenir le décrochage et réengager un client ».
//
//  CE QUE CETTE SUITE PROUVE :
//
//   1. LA FORMATION SE RECONSTRUIT PAR SES SEULES DONNÉES. Aucune ligne de
//      moteur n'a été écrite pour elle : ni route, ni table, ni composant.
//      Si ce fichier passe, la procédure d'ajout par données est validée.
//
//   2. ELLE NE CONTAMINE RIEN. Coach Nutrition et Cycle menstruel restent
//      strictement inchangées, et le Boost ne reçoit pas un octet.
//
//   3. LE PARCOURS COMPLET TIENT. M1 -> mini -> … -> M5 -> mini -> QCM final
//      -> évaluation pratique -> certification, avec ses verrous séquentiels.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DB = path.join(os.tmpdir(), `nutri-academy-pd-test-${process.pid}.sqlite`);
process.env.NUTRITION_DB = DB;
process.env.ADMIN_EMAIL = 'patron@exemple.fr';

const app = require('../server');
const BANQUE = require('../lib/academyBanquePrevenirDecrochage');
const { idYoutubeValide } = require('../lib/academy');
let srv, base;

const PD = 'prevenir_decrochage';
const CM = 'cycle_menstruel';
const CN = 'coach_nutrition';
const ADMIN = 'patron@exemple.fr';
const LEA = 'lea.pd@exemple.fr';     // parcourt la formation de bout en bout
const THEO = 'theo.pd@exemple.fr';   // témoin : ne touche à rien
const EVA = 'eva.pd@exemple.fr';     // évaluateur
const jetons = {};

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

// LE CORRIGÉ VIENT DU FICHIER DE DONNÉES, jamais d'une route : aucune ne le
// donne, et c'est la propriété que le lot 2 défend.
const CORRIGE = new Map();
for (const m of BANQUE.MODULES) for (const q of m.questions) {
  CORRIGE.set(q.enonce, q.choix.filter(([, b]) => b).map(([t]) => t));
}
for (const q of BANQUE.FINALE) CORRIGE.set(q.enonce, q.choix.filter(([, b]) => b).map(([t]) => t));

const fmt = (r) => `?formation=${r}`;
const etatFormation = async (qui, f) => (await api('GET', '/api/academy/formation' + fmt(f), null, jetons[qui])).body.formation;
const etatQcm = async (qui, f) => (await api('GET', '/api/academy/qcm' + fmt(f), null, jetons[qui])).body.qcm;

// Passe une tentative en répondant JUSTE (ou FAUX pour les `rates` premières).
async function passerTentative(qui, corps, rates = 0) {
  const t = (await api('POST', '/api/academy/qcm/tentatives', corps, jetons[qui])).body.tentative;
  assert.ok(t, 'la tentative devrait s\'ouvrir : ' + JSON.stringify(corps));
  t.questions.forEach(() => {});
  let i = 0;
  for (const q of t.questions) {
    const bonnes = CORRIGE.get(q.enonce) || [];
    const justes = q.choix.filter((c) => bonnes.includes(c.texte)).map((c) => c.id);
    const faux = q.choix.filter((c) => !bonnes.includes(c.texte)).map((c) => c.id).slice(0, 1);
    await api('PUT', `/api/academy/qcm/tentatives/${t.id}/reponses/${q.id}`,
      { choix: i < rates ? faux : justes }, jetons[qui]);
    i++;
  }
  const fin = await api('POST', `/api/academy/qcm/tentatives/${t.id}/terminer`, {}, jetons[qui]);
  return { tentative: t, resultat: fin.body.tentative.resultat };
}

// Termine tous les contenus d'un module, sans toucher aux autres.
async function terminerModule(qui, f, ordre) {
  const form = await etatFormation(qui, f);
  const m = form.modules.find((x) => x.ordre === ordre);
  assert.ok(m, 'module ' + ordre + ' introuvable');
  for (const c of m.contenus) {
    const r = await api('POST', `/api/academy/contenus/${c.id}/terminer`, {}, jetons[qui]);
    assert.strictEqual(r.status, 200, `contenu ${c.id} du module ${ordre}`);
  }
  return m;
}


test.before(async () => {
  await new Promise((r) => { srv = app.listen(0, r); });
  base = `http://127.0.0.1:${srv.address().port}`;
  app.boost.assurerSchema();
  app.academyCertifications.assurerSchema();
  // L'amorçage n'est joué qu'au démarrage réel du serveur : ici on l'appelle.
  // La base de test est vierge : on amorce AUSSI Cycle menstruel, sans quoi il
  // n'y aurait aucune voisine à côté de qui prouver le cloisonnement.
  app.academyCycleMenstruel.amorcer();
  const n = app.academyPrevenirDecrochage.amorcer();
  assert.strictEqual(n, 45, 'l\'amorçage doit poser 25 mini + 20 finales, il a posé ' + n);

  for (const [e, p] of [[ADMIN, '7777'], [LEA, '1001'], [THEO, '2002'], [EVA, '3003']]) await connecter(e, p);
  for (const e of [LEA, THEO, EVA]) {
    await api('POST', '/api/boost/admin/collaborateurs', { email: e, role: 'collaborateur' }, jetons[ADMIN]);
  }
  // Elle naît en brouillon : on la publie pour pouvoir la parcourir.
  const pub = await api('POST', `/api/academy/admin/formations/${PD}/publier`, {}, jetons[ADMIN]);
  assert.strictEqual(pub.status, 200, 'publication : ' + pub.txt.slice(0, 200));
});

test.after(() => {
  if (srv) srv.close();
  require('../lib/db').closeDb();
  ['', '-wal', '-shm'].forEach((s) => { try { fs.unlinkSync(DB + s); } catch (_) {} });
});

// ===========================================================================
//  A. STRUCTURE
// ===========================================================================

test('LA FORMATION NAÎT EN BROUILLON, certifiante, avec pratique, sans reflet Boost', () => {
  // ⚠️ On relit la ligne AVANT publication via le catalogue complet : le test
  // suivant vérifie l'état posé par l'amorçage, pas celui d'après recette.
  const f = app.academyFormations.lire(PD);
  assert.strictEqual(f.libelle, 'Prévenir le décrochage et réengager un client');
  assert.strictEqual(f.titre, 'Prévention du décrochage');
  assert.strictEqual(f.pratiqueObligatoire, true, 'ÉTAPE TERRAIN EXIGÉE');
  assert.strictEqual(f.certificationActive, true);
  assert.strictEqual(f.refletBoost, false, 'ce titre ne doit ouvrir aucun dossier client');
  assert.strictEqual(f.qcmNbQuestions, 20);
  assert.strictEqual(f.qcmSeuilPct, 80);
  assert.strictEqual(f.miniNbQuestions, 5);
  assert.strictEqual(f.miniSeuilPct, 80);
});

test('l\'amorçage a posé une seule formation de plus', () => {
  const cles = app.academyFormations.lister({ toutes: true }).map((x) => x.cle).sort();
  assert.deepStrictEqual(cles, ['coach_nutrition', 'cycle_menstruel', 'prevenir_decrochage']);
});

test('cinq modules, cinq vidéos distinctes et valides, une par module', () => {
  const mods = dbq().prepare('SELECT id, ordre, titre, cle FROM academy_modules WHERE formation = ? ORDER BY ordre').all(PD);
  assert.strictEqual(mods.length, 5);
  assert.deepStrictEqual(mods.map((m) => m.ordre), [1, 2, 3, 4, 5]);
  assert.deepStrictEqual(mods.map((m) => m.cle), ['pd-m01', 'pd-m02', 'pd-m03', 'pd-m04', 'pd-m05']);
  assert.deepStrictEqual(mods.map((m) => m.titre), BANQUE.MODULES.map((m) => m.titre));

  const vus = new Set();
  for (const m of mods) {
    const cs = dbq().prepare('SELECT youtube_id AS yt FROM academy_contenus WHERE module_id = ?').all(m.id);
    assert.strictEqual(cs.length, 1, `le module ${m.ordre} doit porter UNE vidéo`);
    assert.ok(idYoutubeValide(cs[0].yt), `identifiant YouTube invalide au module ${m.ordre}`);
    assert.ok(!vus.has(cs[0].yt), `identifiant YouTube en double au module ${m.ordre}`);
    vus.add(cs[0].yt);
  }
  assert.deepStrictEqual([...vus], BANQUE.MODULES.map((m) => m.youtubeId), 'les vidéos suivent l\'ordre des modules');
});

test('vingt-cinq questions mini réparties 5 par module, vingt finales sans module', () => {
  const mini = dbq().prepare("SELECT module_id AS m FROM academy_questions WHERE formation = ? AND usage = 'mini'").all(PD);
  assert.strictEqual(mini.length, 25);
  const parModule = new Map();
  for (const q of mini) parModule.set(q.m, (parModule.get(q.m) || 0) + 1);
  assert.strictEqual(parModule.size, 5, 'les cinq modules ont leur mini');
  for (const [, n] of parModule) assert.strictEqual(n, 5);

  const fin = dbq().prepare("SELECT module_id AS m FROM academy_questions WHERE formation = ? AND usage = 'finale'").all(PD);
  assert.strictEqual(fin.length, 20);
  assert.ok(fin.every((q) => q.m === null), 'les finales sont transversales : aucun module');
});

test('chaque question porte quatre choix et UNE seule bonne réponse', () => {
  const qs = dbq().prepare('SELECT id FROM academy_questions WHERE formation = ?').all(PD);
  assert.strictEqual(qs.length, 45);
  for (const q of qs) {
    const cs = dbq().prepare('SELECT correct FROM academy_choix WHERE question_id = ?').all(q.id);
    assert.strictEqual(cs.length, 4, `question ${q.id} : quatre propositions attendues`);
    assert.strictEqual(cs.filter((c) => c.correct).length, 1, `question ${q.id} : une seule bonne réponse`);
  }
});

test('les six cas pratiques sont posés, dans l\'ordre, avec leurs consignes', () => {
  const cas = app.academyPratique.listerCas(PD);
  assert.strictEqual(cas.length, 6);
  assert.deepStrictEqual(cas.map((c) => c.ordre), [1, 2, 3, 4, 5, 6]);
  assert.deepStrictEqual(cas.map((c) => c.titre), BANQUE.CAS.map((c) => c.titre));
  for (const c of cas) {
    for (const section of ['SITUATION PRÉSENTÉE AU COACH', 'CE QUE L’ÉVALUATEUR OBSERVE',
      'COMPORTEMENT ATTENDU', 'VALIDATION', 'À REPASSER NOTAMMENT SI']) {
      assert.ok(c.consignes.includes(section), `cas ${c.ordre} : section « ${section} » manquante`);
    }
  }
  assert.deepStrictEqual(cas.map((c) => c.consignes), BANQUE.CAS.map((c) => c.consignes));
});

// ===========================================================================
//  D. CLOISONNEMENT
// ===========================================================================

test('AUCUNE question d\'une autre formation n\'entre dans ses QCM', async () => {
  const etrangeres = new Set(dbq().prepare('SELECT enonce FROM academy_questions WHERE formation <> ?').all(PD)
    .map((q) => q.enonce));
  const siennes = new Set(dbq().prepare('SELECT enonce FROM academy_questions WHERE formation = ?').all(PD)
    .map((q) => q.enonce));
  assert.strictEqual([...siennes].filter((e) => etrangeres.has(e)).length, 0, 'énoncé commun à deux formations');
});

test('un cas d\'une autre formation reste refusé ici, et réciproquement', () => {
  const sien = app.academyPratique.listerCas(PD)[0];
  assert.strictEqual(app.academyPratique.lireCasDe(PD, sien.id).titre, sien.titre);
  assert.strictEqual(app.academyPratique.lireCasDe(CN, sien.id), null);
  const cm = app.academyPratique.listerCas(CM)[0];
  if (cm) assert.strictEqual(app.academyPratique.lireCasDe(PD, cm.id), null, 'un cas voisin ne se résout pas ici');
});

test('avancer ici ne fait avancer aucune autre formation', async () => {
  await terminerModule(LEA, PD, 1);
  assert.strictEqual((await etatFormation(LEA, PD)).termines, 1);
  // Cycle menstruel reste en brouillon ici : la route publique la refuse, à
  // juste titre. On interroge donc le moteur, qui ne connaît pas ce filtre.
  assert.strictEqual(app.academy.formationPour(LEA, CN).termines, 0, 'CONTAMINATION vers Coach Nutrition');
  assert.strictEqual(app.academy.formationPour(LEA, CM).termines, 0, 'CONTAMINATION vers Cycle menstruel');
});

// ===========================================================================
//  E. LE PARCOURS COMPLET, AVEC SES VERROUS
// ===========================================================================

test('le mini d\'un module ne tire QUE dans les questions de ce module', async () => {
  const form = await etatFormation(LEA, PD);
  const m1 = form.modules.find((m) => m.ordre === 1);
  // On interroge le VIVIER, sans ouvrir de tentative : une tentative laissée en
  // cours bloquerait le parcours joué plus bas.
  const pool = app.academyQcm.questionsEligibles(PD, { usage: 'mini', moduleId: m1.id });
  assert.strictEqual(pool.length, 5);
  const attendus = new Set(BANQUE.MODULES[0].questions.map((q) => q.enonce));
  for (const q of pool) assert.ok(attendus.has(q.enonce), 'question étrangère au module 1 : ' + q.enonce.slice(0, 50));
});

test('LE MODULE 2 EST VERROUILLÉ tant que le mini du module 1 n\'est pas réussi', async () => {
  const form = await etatFormation(LEA, PD);
  const m2 = form.modules.find((m) => m.ordre === 2);
  const r = await api('POST', `/api/academy/contenus/${m2.contenus[0].id}/terminer`, {}, jetons[LEA]);
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.body.moduleVerrouille, true);
});

test('le QCM final est VERROUILLÉ tant que le parcours n\'est pas terminé', async () => {
  const r = await api('POST', '/api/academy/qcm/tentatives', { formation: PD }, jetons[LEA]);
  assert.strictEqual(r.status, 409);
});

test('les cinq modules se franchissent un par un, mini après mini', async () => {
  for (const ordre of [1, 2, 3, 4, 5]) {
    const m = await terminerModule(LEA, PD, ordre);
    const { resultat } = await passerTentative(LEA, { formation: PD, moduleId: m.id });
    assert.strictEqual(resultat.reussie, true, `mini du module ${ordre}`);
  }
  const f = await etatFormation(LEA, PD);
  assert.strictEqual(f.termines, 5);
  assert.strictEqual(f.pourcentage, 100);
});

test('UN ÉCHEC AU QCM FINAL NE VALIDE PAS LA FORMATION', async () => {
  // 5 fautes sur 20 = 75 %, sous le seuil de 80 %.
  const { resultat } = await passerTentative(LEA, { formation: PD }, 5);
  assert.strictEqual(resultat.reussie, false);
  assert.strictEqual(resultat.scorePct, 75, '15 bonnes sur 20 = 75 %, sous le seuil');
  assert.strictEqual((await etatQcm(LEA, PD)).theorieValidee, false);
});

test('LA RÉUSSITE AU QCM FINAL VALIDE LA THÉORIE — et rien de plus', async () => {
  const { tentative, resultat } = await passerTentative(LEA, { formation: PD });
  assert.strictEqual(tentative.questions.length, 20);
  assert.strictEqual(resultat.reussie, true);
  const q = await etatQcm(LEA, PD);
  assert.strictEqual(q.theorieValidee, true);
  assert.strictEqual(q.scoreValide, 100);
  // AUCUNE CERTIFICATION AUTOMATIQUE.
  assert.strictEqual(app.academyCertifications.estCertifie(LEA, PD), false);
});

test('la théorie ne suffit pas : le prérequis pratique manque', async () => {
  const c = (await api('GET', '/api/academy/certification', null, jetons[LEA])).body.certifications.find((x) => x.formation === PD);
  assert.deepStrictEqual(c.prerequis.map((p) => p.cle), ['theorie', 'pratique']);
  assert.deepStrictEqual(c.manquants, ['pratique']);
  assert.strictEqual(c.eligible, false);
});

test('l\'évaluation pratique se prononce SUR UN CAS DU RÉFÉRENTIEL', async () => {
  const cas = app.academyPratique.listerCas(PD);
  const r = await api('POST', `/api/academy/evaluateur/collaborateurs/${LEA}/evaluations`,
    { formation: PD, casId: cas[5].id, resultat: 'valide', commentaire: 'Alerte au bon moment, sans se décharger.' },
    jetons[ADMIN]);
  assert.strictEqual(r.status, 201, r.txt.slice(0, 200));
  assert.strictEqual(r.body.evaluation.cas, cas[5].titre);
  assert.strictEqual(r.body.evaluation.casId, cas[5].id);
  assert.strictEqual(r.body.pratique.etat, 'validee');
  // La pratique validée ici ne vaut rien ailleurs.
  assert.strictEqual(app.academyPratique.etatPour(LEA, CN).validee, false);
  assert.strictEqual(app.academyPratique.etatPour(LEA, CM).validee, false);
});

test('elle passe « Certification à délivrer », puis se délivre', async () => {
  const d = (await api('GET', `/api/academy/evaluateur/coachs${fmt(PD)}`, null, jetons[ADMIN])).body;
  assert.strictEqual(d.coachs.find((c) => c.email === LEA).statut, 'certification_a_delivrer');

  const r = await api('POST', `/api/academy/admin/certifications/${LEA}`, { formation: PD }, jetons[ADMIN]);
  assert.strictEqual(r.status, 201, r.txt.slice(0, 200));
  assert.strictEqual(r.body.certification.formation, PD);
  assert.strictEqual(r.body.certification.scoreQcm, 100);
  assert.ok(r.body.certification.pratiqueLe, 'la date de la pratique est recopiée');

  assert.strictEqual(app.academyCertifications.estCertifie(LEA, PD), true);
  assert.strictEqual(app.academyCertifications.estCertifie(LEA, CN), false, 'CONTAMINATION vers Coach Nutrition');
  assert.strictEqual(app.academyCertifications.estCertifie(LEA, CM), false, 'CONTAMINATION vers Cycle menstruel');
});

// ===========================================================================
//  G. LE BOOST N'A RIEN REÇU
// ===========================================================================

test('AUCUNE écriture Boost, à aucune étape', () => {
  assert.strictEqual(app.academyFormations.lire(PD).refletBoost, false);
  assert.strictEqual(dbq().prepare('SELECT COUNT(*) AS n FROM boost_certifications WHERE email = ?').get(LEA).n, 0,
    'une formation sans reflet n\'ouvre AUCUN dossier Boost');
  assert.strictEqual(app.boost.estCoachCertifie(LEA), false, 'ce titre n\'ouvre aucun droit client');
});

// ===========================================================================
//  F. L'EXISTANT EST INTACT
// ===========================================================================

test('Coach Nutrition et Cycle menstruel gardent leur configuration', () => {
  const cn = app.academyFormations.lire(CN);
  assert.strictEqual(cn.pratiqueObligatoire, true);
  assert.strictEqual(cn.refletBoost, true, 'elle seule ouvre les dossiers du Boost');
  const cm = app.academyFormations.lire(CM);
  assert.strictEqual(cm.refletBoost, false);
  assert.strictEqual(cm.certificationActive, true);
});

test('le témoin n\'a rien gagné au passage', async () => {
  assert.strictEqual((await etatQcm(THEO, PD)).theorieValidee, false);
  assert.strictEqual((await etatFormation(THEO, PD)).termines, 0);
  for (const f of [PD, CN, CM]) assert.strictEqual(app.academyCertifications.estCertifie(THEO, f), false);
});

// ===========================================================================
//  H. IDEMPOTENCE
// ===========================================================================

test('rejouer l\'amorçage ne recrée rien', () => {
  const avant = {
    formations: dbq().prepare('SELECT COUNT(*) AS n FROM academy_formations').get().n,
    modules: dbq().prepare('SELECT COUNT(*) AS n FROM academy_modules').get().n,
    contenus: dbq().prepare('SELECT COUNT(*) AS n FROM academy_contenus').get().n,
    questions: dbq().prepare('SELECT COUNT(*) AS n FROM academy_questions').get().n,
    cas: dbq().prepare('SELECT COUNT(*) AS n FROM academy_cas').get().n,
  };
  assert.strictEqual(app.academyPrevenirDecrochage.amorcer(), 0);
  assert.strictEqual(app.academyPrevenirDecrochage.amorcerCas(), 0);
  assert.strictEqual(app.academyPrevenirDecrochage.amorcerConsignesCas(), 0);
  const apres = {
    formations: dbq().prepare('SELECT COUNT(*) AS n FROM academy_formations').get().n,
    modules: dbq().prepare('SELECT COUNT(*) AS n FROM academy_modules').get().n,
    contenus: dbq().prepare('SELECT COUNT(*) AS n FROM academy_contenus').get().n,
    questions: dbq().prepare('SELECT COUNT(*) AS n FROM academy_questions').get().n,
    cas: dbq().prepare('SELECT COUNT(*) AS n FROM academy_cas').get().n,
  };
  assert.deepStrictEqual(apres, avant, 'un second amorçage a écrit quelque chose');
});
