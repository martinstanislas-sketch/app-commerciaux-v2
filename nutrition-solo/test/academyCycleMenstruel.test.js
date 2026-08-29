'use strict';
// ============================================================================
//  MY COACH ACADEMY — « Cycle menstruel & entraînement », la deuxième vraie
//  formation.
//
//  CE QUE CETTE SUITE PROUVE, ET QUI N'AVAIT JAMAIS ÉTÉ PROUVÉ :
//
//   1. LA SÉQUENCE M10 -> MINI M10 -> QCM FINAL. Coach Nutrition n'a PAS de
//      mini sur son dernier module : il se franchit dès ses contenus terminés.
//      Personne n'avait donc jamais fait passer un mini sur le DERNIER module,
//      ni vérifié que sa réussite ouvre la certification théorique. C'est la
//      raison d'être de la section 3.
//
//   2. DEUX FORMATIONS RÉELLES NE SE CONTAMINENT PAS. Jusqu'ici le
//      cloisonnement était éprouvé sur une formation synthétique. Ici les deux
//      banques existent pour de bon, avec leurs 70 et 60 questions.
//
//   3. UN PARCOURS SANS ÉTAPE TERRAIN va jusqu'à la certification. Pas une
//      étape grisée : une étape qui n'existe pas.
//
//  ⚠️ CE FICHIER NE REJOUE PAS le moteur. Le tirage, le gel des tentatives, la
//  correction en tout-ou-rien et les refus d'auto-certification sont éprouvés
//  par academyQcm/academyMiniQcm/academyCertifications. Ici on éprouve ce que
//  DEUX FORMATIONS RÉELLES font l'une à côté de l'autre.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DB = path.join(os.tmpdir(), `nutri-academy-cm-test-${process.pid}.sqlite`);
process.env.NUTRITION_DB = DB;
process.env.ADMIN_EMAIL = 'patron@exemple.fr';

const app = require('../server');
const BANQUE = require('../lib/academyBanqueCycleMenstruel');
const { idYoutubeValide } = require('../lib/academy');
let srv, base;

const CM = 'cycle_menstruel';
const CN = 'coach_nutrition';
const ADMIN = 'patron@exemple.fr';
const LEA = 'lea.cm@exemple.fr';     // parcourt Cycle menstruel de bout en bout
const THEO = 'theo.cm@exemple.fr';   // reste sur Coach Nutrition : témoin
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
  // L'amorçage n'est joué qu'au démarrage du serveur réel : ici on l'appelle.
  const n = app.academyCycleMenstruel.amorcer();
  assert.strictEqual(n, 70, 'l\'amorçage doit poser 50 mini + 20 finales, il a posé ' + n);

  for (const [e, p] of [[ADMIN, '7777'], [LEA, '1001'], [THEO, '2002']]) await connecter(e, p);
  for (const e of [LEA, THEO]) {
    await api('POST', '/api/boost/admin/collaborateurs', { email: e, role: 'collaborateur' }, jetons[ADMIN]);
  }
  // Elle naît en brouillon : on la publie pour pouvoir la parcourir.
  const pub = await api('POST', `/api/academy/admin/formations/${CM}/publier`, {}, jetons[ADMIN]);
  assert.strictEqual(pub.status, 200, 'publication : ' + pub.txt.slice(0, 160));
});

test.after(() => {
  if (srv) srv.close();
  require('../lib/db').closeDb();
  ['', '-wal', '-shm'].forEach((s) => { try { fs.unlinkSync(DB + s); } catch (_) {} });
});

// ===========================================================================
//  1. LA BANQUE ET LA FORMATION
// ===========================================================================

test('dix modules, dix vidéos distinctes et valides, une par module', () => {
  assert.strictEqual(BANQUE.MODULES.length, 10);
  const vus = new Map();
  for (const m of BANQUE.MODULES) {
    assert.ok(idYoutubeValide(m.youtubeId), `identifiant invalide au module ${m.ordre} : ${m.youtubeId}`);
    assert.ok(!vus.has(m.youtubeId), `identifiant en double : ${m.youtubeId} (M${m.ordre} et M${vus.get(m.youtubeId)})`);
    vus.set(m.youtubeId, m.ordre);
  }
  assert.deepStrictEqual(BANQUE.MODULES.map((m) => m.ordre), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  // Et en base, chaque module pointe bien vers SA vidéo.
  const lignes = dbq().prepare(`SELECT m.ordre AS ordre, c.youtube_id AS yt FROM academy_contenus c
                                JOIN academy_modules m ON m.id = c.module_id
                                WHERE m.formation = ? ORDER BY m.ordre`).all(CM);
  assert.strictEqual(lignes.length, 10);
  for (const l of lignes) {
    assert.strictEqual(l.yt, BANQUE.MODULES.find((m) => m.ordre === l.ordre).youtubeId, 'module ' + l.ordre);
  }
});

test('cinquante questions mini réparties 5 par module, vingt finales sans module', () => {
  const parModule = dbq().prepare(`SELECT m.ordre AS ordre, COUNT(*) AS n FROM academy_questions q
                                   JOIN academy_modules m ON m.id = q.module_id
                                   WHERE q.formation = ? AND q.usage = 'mini' AND q.actif = 1
                                   GROUP BY m.ordre ORDER BY m.ordre`).all(CM);
  assert.strictEqual(parModule.length, 10, 'les DIX modules doivent avoir leur banque, le dixième compris');
  for (const l of parModule) assert.strictEqual(l.n, 5, 'module ' + l.ordre);

  const finales = dbq().prepare("SELECT COUNT(*) AS n FROM academy_questions WHERE formation = ? AND usage = 'finale' AND actif = 1").get(CM);
  assert.strictEqual(finales.n, 20);
  const orphelines = dbq().prepare("SELECT COUNT(*) AS n FROM academy_questions WHERE formation = ? AND usage = 'finale' AND module_id IS NOT NULL").get(CM);
  assert.strictEqual(orphelines.n, 0, 'les finales sont transversales : aucun module');

  // Quatre choix, UNE seule bonne réponse, partout.
  const mauvaises = dbq().prepare(`SELECT q.cle AS cle, COUNT(x.id) AS nb, SUM(x.correct) AS bonnes
                                   FROM academy_questions q JOIN academy_choix x ON x.question_id = q.id
                                   WHERE q.formation = ? GROUP BY q.id HAVING nb != 4 OR bonnes != 1`).all(CM);
  assert.deepStrictEqual(mauvaises, [], 'chaque question doit avoir 4 choix et 1 seule bonne réponse');
});

test('la formation est certifiante, AVEC pratique, et n\'ouvre aucun droit Boost', () => {
  const f = app.academyFormations.lire(CM);
  assert.strictEqual(f.titre, 'Cycle menstruel & entraînement');
  assert.strictEqual(f.certificationActive, true);
  // ⚠️ C'EST LA DONNÉE SOURCE QUI LE DIT. Ce drapeau a d'abord vécu dans une
  // seule base locale ; un amorçage neuf reproduisait alors une formation SANS
  // étape Terrain, donc sans jamais montrer les six cas. Ce test-là est ce qui
  // garantit que l'amorçage et la recette parlent du même parcours.
  assert.strictEqual(f.pratiqueObligatoire, true, 'ÉTAPE TERRAIN EXIGÉE');
  assert.strictEqual(f.refletBoost, false, 'ce titre ne doit ouvrir aucun dossier client');
  assert.strictEqual(f.qcmNbQuestions, 20);
  assert.strictEqual(f.qcmSeuilPct, 80);
  assert.strictEqual(f.miniNbQuestions, 5);
  assert.strictEqual(f.miniSeuilPct, 80);
});

// ===========================================================================
//  LE RÉFÉRENTIEL DE CAS PRATIQUES
//
//  Il est posé par les DONNÉES de la formation, sous son propre marqueur, et il
//  ne déborde pas sur Coach Nutrition — qui n'en a aucun et doit continuer à
//  n'en avoir aucun.
// ===========================================================================

test('les six cas pratiques sont posés, dans l\'ordre et pour CETTE formation', () => {
  const cas = app.academyPratique.listerCas(CM);
  assert.deepStrictEqual(cas.map((c) => c.titre), BANQUE.CAS.map((c) => c.titre),
    'les intitulés sont ceux du référentiel, au caractère près');
  assert.deepStrictEqual(cas.map((c) => c.ordre), [1, 2, 3, 4, 5, 6]);
  assert.strictEqual(cas.length, 6);
  // Les identifiants sont ceux de l'amorçage, et ils ne bougent pas : une
  // évaluation passée les référence.
  assert.deepStrictEqual(cas.map((c) => c.id), [1, 2, 3, 4, 5, 6]);
});

test('les six cas portent tous leurs CONSIGNES, et aucune n\'est vide', () => {
  const cas = app.academyPratique.listerCas(CM);
  assert.strictEqual(cas.filter((c) => c.consignes && c.consignes.trim()).length, 6,
    'aucune consigne ne doit rester NULL');
  for (const c of cas) {
    // Chaque cas doit permettre de MENER la séance sans document externe : la
    // situation, ce qu'on observe, ce qu'on attend, ce qui vaut validation, et
    // ce qui justifie un « à repasser ».
    for (const section of ['SITUATION PRÉSENTÉE AU COACH', 'CE QUE L’ÉVALUATEUR OBSERVE',
      'COMPORTEMENT ATTENDU', 'VALIDATION', 'À REPASSER NOTAMMENT SI']) {
      assert.ok(c.consignes.includes(section),
        `cas ${c.ordre} : section « ${section} » manquante`);
    }
    assert.ok(c.consignes.length > 500, `cas ${c.ordre} : consigne trop courte pour être exploitable`);
  }
  // Et elles viennent bien du référentiel source, au caractère près.
  assert.deepStrictEqual(cas.map((c) => c.consignes), BANQUE.CAS.map((c) => c.consignes));
});

test('« À repasser notamment si » reste un texte, JAMAIS une règle logicielle', () => {
  // Le moteur ne lit pas les consignes : il les stocke et les affiche. Le
  // verdict reste les deux boutons de l'évaluateur.
  const moteur = ['lib/academyPratique.js', 'lib/academyCertifications.js'].map((f) =>
    fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
  assert.ok(!/consignes/.test(moteur.replace(/--.*$/gm, '').replace(/\/\/.*$/gm, '')
    .replace(/consignes\s+TEXT/g, '').replace(/consignes: r\.consignes \|\| null,/g, '')
    .replace(/c\.consignes \|\| null/g, '')),
  'aucune décision du moteur ne doit dépendre du texte des consignes');
});

test('l\'amorçage des consignes est idempotent', () => {
  assert.strictEqual(app.academyCycleMenstruel.amorcerConsignesCas(), 0, 'un second passage ne réécrit rien');
  assert.strictEqual(app.academyPratique.listerCas(CM).filter((c) => c.consignes).length, 6);
});

test('Coach Nutrition n\'a AUCUN cas : son écran d\'évaluation ne bouge pas', () => {
  assert.deepStrictEqual(app.academyPratique.listerCas(CN), [],
    'zéro cas = le champ libre d\'avant, inchangé');
});

test('un cas ne s\'utilise QUE dans sa formation', () => {
  const unCas = app.academyPratique.listerCas(CM)[0];
  assert.ok(unCas && unCas.id, 'il y a bien un cas à essayer');
  // Vu depuis Cycle menstruel : il existe. Vu depuis Coach Nutrition : il
  // n'existe pas. C'est la même colonne qui cloisonne modules et questions.
  assert.strictEqual(app.academyPratique.lireCasDe(CM, unCas.id).titre, unCas.titre);
  assert.strictEqual(app.academyPratique.lireCasDe(CN, unCas.id), null,
    'l\'identifiant d\'un cas voisin ne se résout pas ici');
});

test('l\'amorçage des cas est idempotent', () => {
  assert.strictEqual(app.academyCycleMenstruel.amorcerCas(), 0, 'un second passage ne repose rien');
  assert.strictEqual(app.academyPratique.listerCas(CM).length, 6, 'toujours six, pas douze');
});

test('l\'amorçage est idempotent et n\'a pas touché Coach Nutrition', () => {
  const avant = dbq().prepare('SELECT COUNT(*) AS n FROM academy_questions').get().n;
  assert.strictEqual(app.academyCycleMenstruel.amorcer(), 0, 'rejouer ne doit rien écrire');
  assert.strictEqual(dbq().prepare('SELECT COUNT(*) AS n FROM academy_questions').get().n, avant);
  // Coach Nutrition garde sa configuration à elle.
  const cn = app.academyFormations.lire(CN);
  assert.strictEqual(cn.pratiqueObligatoire, true);
  assert.strictEqual(cn.refletBoost, true);
});

// ===========================================================================
//  2. AUCUNE CONTAMINATION ENTRE LES DEUX FORMATIONS
// ===========================================================================

test('progression indépendante : avancer ici ne fait pas avancer là-bas', async () => {
  await terminerModule(LEA, CM, 1);
  const cm = await etatFormation(LEA, CM);
  const cn = await etatFormation(LEA, CN);
  assert.ok(cm.termines > 0, 'elle a avancé sur Cycle menstruel');
  assert.strictEqual(cn.termines, 0, 'et pas d\'un pouce sur Coach Nutrition');
});

test('le mini d\'un module ne tire QUE dans les questions de ce module', async () => {
  const m1 = (await etatFormation(LEA, CM)).modules.find((m) => m.ordre === 1);
  const { tentative } = await passerTentative(LEA, { formation: CM, moduleId: m1.id });
  assert.strictEqual(tentative.questions.length, 5);
  const attendues = new Set(BANQUE.MODULES[0].questions.map((q) => q.enonce));
  for (const q of tentative.questions) {
    assert.ok(attendues.has(q.enonce), 'question étrangère au module 1 : ' + q.enonce.slice(0, 60));
  }
});

test('AUCUNE question de Coach Nutrition n\'entre dans un QCM Cycle menstruel', async () => {
  const enoncesCN = new Set(dbq().prepare('SELECT enonce FROM academy_questions WHERE formation = ?').all(CN).map((r) => r.enonce));
  const m2 = (await etatFormation(LEA, CM)).modules.find((m) => m.ordre === 2);
  await terminerModule(LEA, CM, 2);
  const { tentative } = await passerTentative(LEA, { formation: CM, moduleId: m2.id });
  for (const q of tentative.questions) {
    assert.ok(!enoncesCN.has(q.enonce), 'CONTAMINATION : une question Coach Nutrition est entrée');
  }
});

// ===========================================================================
//  3. LA SÉQUENCE M10 -> MINI M10 -> QCM FINAL
//
//  Le point jamais éprouvé : chez Coach Nutrition le dernier module n'a pas de
//  mini. Ici il en a un, et c'est la dernière porte avant la certification
//  théorique.
// ===========================================================================

test('le QCM final est VERROUILLÉ tant que le parcours n\'est pas terminé', async () => {
  const q = await etatQcm(LEA, CM);
  assert.notStrictEqual(q.etat, 'disponible', 'le final ne doit pas être ouvert à l\'Étape 2 : ' + q.etat);
  const r = await api('POST', '/api/academy/qcm/tentatives', { formation: CM }, jetons[LEA]);
  assert.notStrictEqual(r.status, 201, 'le serveur ne doit pas ouvrir le QCM final');
});

test('les modules 3 à 9 se franchissent un par un, mini après mini', async () => {
  for (let n = 3; n <= 9; n++) {
    const m = await terminerModule(LEA, CM, n);
    const { resultat } = await passerTentative(LEA, { formation: CM, moduleId: m.id });
    assert.strictEqual(resultat.reussie, true, 'mini du module ' + n);
  }
  const f = await etatFormation(LEA, CM);
  assert.ok(f.modules.find((m) => m.ordre === 10), 'le module 10 doit être atteint');
});

test('M10 TERMINÉ SEUL NE VALIDE PAS LA THÉORIE', async () => {
  await terminerModule(LEA, CM, 10);
  const f = await etatFormation(LEA, CM);
  assert.strictEqual(f.acheve, true, 'tous les contenus sont vus');
  const q = await etatQcm(LEA, CM);
  assert.strictEqual(q.theorieValidee, false, 'terminer les contenus ne valide RIEN');
  assert.notStrictEqual(q.etat, 'validee');
});

test('le mini M10 devient accessible, et lui seul ouvre la suite', async () => {
  const m10 = (await etatFormation(LEA, CM)).modules.find((m) => m.ordre === 10);
  const r = await api('POST', '/api/academy/qcm/tentatives', { formation: CM, moduleId: m10.id }, jetons[LEA]);
  assert.strictEqual(r.status, 201, 'le mini du dernier module doit s\'ouvrir');
  assert.strictEqual(r.body.tentative.questions.length, 5);
  // Et il tire dans la banque du module 10, pas ailleurs.
  const attendues = new Set(BANQUE.MODULES[9].questions.map((q) => q.enonce));
  for (const q of r.body.tentative.questions) assert.ok(attendues.has(q.enonce), 'question étrangère au module 10');
  // On abandonne cette tentative : la suivante servira à l'échouer.
  await api('POST', `/api/academy/qcm/tentatives/${r.body.tentative.id}/terminer`, {}, jetons[LEA]);
});

test('UN ÉCHEC AU MINI M10 NE DÉBLOQUE PAS LE QCM FINAL', async () => {
  const m10 = (await etatFormation(LEA, CM)).modules.find((m) => m.ordre === 10);
  // 2 fautes sur 5 = 60 %, sous le seuil de 80 %.
  const { resultat } = await passerTentative(LEA, { formation: CM, moduleId: m10.id }, 2);
  assert.strictEqual(resultat.reussie, false, 'le mini devait échouer');

  const q = await etatQcm(LEA, CM);
  assert.notStrictEqual(q.etat, 'disponible', 'le final s\'est ouvert malgré un mini raté : ' + q.etat);
  const r = await api('POST', '/api/academy/qcm/tentatives', { formation: CM }, jetons[LEA]);
  assert.notStrictEqual(r.status, 201, 'le serveur a ouvert le QCM final malgré un mini raté');
  assert.strictEqual((await etatQcm(LEA, CM)).theorieValidee, false);
});

test('4/5 AU MINI M10 SUFFIT, ET DÉBLOQUE LE QCM FINAL', async () => {
  const m10 = (await etatFormation(LEA, CM)).modules.find((m) => m.ordre === 10);
  // 1 faute sur 5 = 80 %, pile le seuil.
  const { resultat } = await passerTentative(LEA, { formation: CM, moduleId: m10.id }, 1);
  assert.strictEqual(resultat.scorePct, 80, 'score attendu : 80 %');
  assert.strictEqual(resultat.reussie, true, '80 % est le seuil : il doit passer');

  const q = await etatQcm(LEA, CM);
  assert.strictEqual(q.disponible, true, 'LE QCM FINAL DOIT ÊTRE OUVERT : ' + q.etat);
  assert.strictEqual(q.theorieValidee, false, 'ouvert n\'est pas validé');
});

test('le QCM final tire 20 questions, TOUTES de la banque finale Cycle menstruel', async () => {
  const t = (await api('POST', '/api/academy/qcm/tentatives', { formation: CM }, jetons[LEA])).body.tentative;
  assert.strictEqual(t.questions.length, 20);
  const finales = new Set(BANQUE.FINALE.map((q) => q.enonce));
  const mini = new Set(BANQUE.MODULES.flatMap((m) => m.questions.map((q) => q.enonce)));
  const enoncesCN = new Set(dbq().prepare('SELECT enonce FROM academy_questions WHERE formation = ?').all(CN).map((r) => r.enonce));
  for (const q of t.questions) {
    assert.ok(finales.has(q.enonce), 'question hors banque finale : ' + q.enonce.slice(0, 60));
    assert.ok(!mini.has(q.enonce), 'une question de mini est entrée dans la certification');
    assert.ok(!enoncesCN.has(q.enonce), 'une question Coach Nutrition est entrée');
  }
  // On l'abandonne : la suivante servira à l'échouer.
  await api('POST', `/api/academy/qcm/tentatives/${t.id}/terminer`, {}, jetons[LEA]);
});

test('UN ÉCHEC AU QCM FINAL NE VALIDE PAS LA FORMATION', async () => {
  // 5 fautes sur 20 = 75 %, sous le seuil de 80 %.
  const { resultat } = await passerTentative(LEA, { formation: CM }, 5);
  assert.strictEqual(resultat.scorePct, 75);
  assert.strictEqual(resultat.reussie, false);
  assert.strictEqual((await etatQcm(LEA, CM)).theorieValidee, false, 'un échec ne valide rien');
  const c = (await api('GET', '/api/academy/certification', null, jetons[LEA])).body.certifications.find((x) => x.formation === CM);
  assert.strictEqual(c.eligible, false, 'et il n\'est pas éligible');
});

test('LA RÉUSSITE AU QCM FINAL VALIDE LA THÉORIE — et rien de plus', async () => {
  const { resultat } = await passerTentative(LEA, { formation: CM });
  assert.strictEqual(resultat.scorePct, 100);
  assert.strictEqual(resultat.reussie, true);
  const q = await etatQcm(LEA, CM);
  assert.strictEqual(q.theorieValidee, true);
  // AUCUNE CERTIFICATION AUTOMATIQUE.
  assert.strictEqual(app.academyCertifications.estCertifie(LEA, CM), false,
    'RÉUSSIR LE QCM A CERTIFIÉ : régression majeure');
});

// ===========================================================================
//  4. AUCUNE ÉTAPE TERRAIN, PUIS LA CERTIFICATION
// ===========================================================================

test('LA THÉORIE NE SUFFIT PAS : le prérequis pratique manque', async () => {
  const c = (await api('GET', '/api/academy/certification', null, jetons[LEA])).body.certifications.find((x) => x.formation === CM);
  assert.deepStrictEqual(c.prerequis.map((p) => p.cle), ['theorie', 'pratique']);
  assert.strictEqual(c.pratiqueObligatoire, true);
  assert.deepStrictEqual(c.manquants, ['pratique']);
  assert.strictEqual(c.eligible, false, 'pas éligible tant que le terrain n\'est pas fait');
  assert.strictEqual(c.certifie, false);
  // Aucune évaluation n'existe encore.
  const n = dbq().prepare('SELECT COUNT(*) AS n FROM academy_evaluations WHERE formation = ?').get(CM).n;
  assert.strictEqual(n, 0);
});

test('elle apparaît « Pratique à réaliser » dans l\'espace Évaluer & certifier', async () => {
  const d = (await api('GET', `/api/academy/evaluateur/coachs${fmt(CM)}`, null, jetons[ADMIN])).body;
  assert.strictEqual(d.coachs.find((c) => c.email === LEA).statut, 'pratique_a_realiser');
  assert.strictEqual(d.pratiqueObligatoire, true);
  // Le témoin, lui, n'a rien fait ici.
  assert.strictEqual(d.coachs.find((c) => c.email === THEO).statut, 'formation_en_cours');
});

test('l\'évaluation pratique se prononce SUR UN CAS DU RÉFÉRENTIEL', async () => {
  const cas = app.academyPratique.listerCas(CM);
  const r = await api('POST', `/api/academy/evaluateur/collaborateurs/${LEA}/evaluations`,
    { formation: CM, casId: cas[3].id, resultat: 'valide', commentaire: 'Sait rester dans son rôle.' }, jetons[ADMIN]);
  assert.strictEqual(r.status, 201, r.txt.slice(0, 200));
  assert.strictEqual(r.body.evaluation.cas, cas[3].titre, 'le titre du cas est recopié dans l\'évaluation');
  assert.strictEqual(r.body.evaluation.casId, cas[3].id, 'et son origine est gardée');
  assert.strictEqual(r.body.pratique.etat, 'validee');
  assert.strictEqual(r.body.pratique.close, true, 'une pratique validée ferme l\'étape');

  // ⚠️ VALIDER LA PRATIQUE NE CERTIFIE PAS, et n'ouvre aucun dossier Boost.
  assert.strictEqual(app.academyCertifications.estCertifie(LEA, CM), false);
  const boostLea = dbq().prepare('SELECT COUNT(*) AS n FROM boost_certifications WHERE email = ?').get(LEA).n;
  assert.strictEqual(boostLea, 0, 'une formation sans reflet n\'écrit RIEN dans le Boost');
});

test('la pratique validée ici ne vaut rien sur Coach Nutrition', () => {
  assert.strictEqual(app.academyPratique.etatPour(LEA, CM).validee, true);
  assert.strictEqual(app.academyPratique.etatPour(LEA, CN).validee, false,
    'CONTAMINATION : la pratique a débordé sur l\'autre formation');
  assert.strictEqual(app.academyPratique.etatPour(LEA, CN).etat, 'non_accessible');
});

test('elle passe alors « Certification à délivrer »', async () => {
  const d = (await api('GET', `/api/academy/evaluateur/coachs${fmt(CM)}`, null, jetons[ADMIN])).body;
  assert.strictEqual(d.coachs.find((c) => c.email === LEA).statut, 'certification_a_delivrer');
});

test('la certification se délivre, et elle est PROPRE à cette formation', async () => {
  const r = await api('POST', `/api/academy/admin/certifications/${LEA}`, { formation: CM, obtenueLe: '2026-09-20' }, jetons[ADMIN]);
  assert.strictEqual(r.status, 201, r.txt.slice(0, 200));
  assert.strictEqual(r.body.certification.formation, CM);
  // Les preuves RECOPIÉES : le diplôme se relit seul, des années plus tard.
  assert.strictEqual(r.body.certification.scoreQcm, 100);
  assert.ok(r.body.certification.pratiqueLe, 'la date de la pratique est recopiée');

  assert.strictEqual(app.academyCertifications.estCertifie(LEA, CM), true);
  // AUCUNE CONTAMINATION : certifiée ici, pas là-bas.
  assert.strictEqual(app.academyCertifications.estCertifie(LEA, CN), false,
    'CONTAMINATION : la certification a débordé sur Coach Nutrition');
  // Et le droit Boost reste fermé : cette formation ne le reflète pas.
  assert.strictEqual(app.boost.estCoachCertifie(LEA), false,
    'ce titre ne doit ouvrir aucun dossier client du Boost');
  const dossiers = await api('GET', '/api/boost/coach/dossiers', null, jetons[LEA]);
  assert.strictEqual(dossiers.status, 403);
});

test('le témoin resté sur Coach Nutrition n\'a rien gagné au passage', async () => {
  const q = await etatQcm(THEO, CN);
  assert.strictEqual(q.theorieValidee, false);
  const f = await etatFormation(THEO, CN);
  assert.strictEqual(f.termines, 0);
  assert.strictEqual(app.academyCertifications.estCertifie(THEO, CM), false);
  assert.strictEqual(app.academyCertifications.estCertifie(THEO, CN), false);
});
