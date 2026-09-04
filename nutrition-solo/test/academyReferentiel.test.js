'use strict';
// ============================================================================
//  MY COACH ACADEMY — LE RÉFÉRENTIEL DU CERTIFICATEUR.
//
//  CE QUE CE FICHIER DOIT DÉMONTRER :
//
//   1. DEUX MÉTIERS, DEUX PORTES. Le certificateur CONSULTE le référentiel de
//      toutes les formations ; le coach SUIT le sien. Ni l'un ni l'autre
//      n'entre par la porte de l'autre — et c'est le SERVEUR qui le dit, pas
//      un écran qui masque un bouton.
//
//   2. LE CERTIFICATEUR VOIT TOUT CE QU'IL DOIT ÉVALUER : modules, contenus,
//      vidéos, textes, questions du QCM et leur corrigé, cas pratiques et leur
//      scénario, grille, critères, et les règles qui mènent au diplôme.
//
//   3. CONSULTER N'EST PAS APPRENDRE. Après un parcours complet du référentiel,
//      chaque table de progression, de tentative et d'évaluation compte
//      EXACTEMENT les mêmes lignes qu'avant. Ce n'est pas de la prudence : les
//      deux routes sont des GET sur un module qui n'a aucune écriture.
//
//   4. UN BROUILLON RESTE UN BROUILLON. Un certificateur ordinaire ne voit que
//      les formations publiées ; seul l'administrateur voit les autres.
//
//   5. LE DOUBLE RÔLE MARCHE, ET NE TRICHE PAS. Qui est coach ET certificateur
//      garde ses deux espaces — mais ne lit pas le corrigé d'une théorie qu'il
//      doit encore passer. Le corrigé revient dès qu'il l'a validée.
//
//   6. L'ÉCRAN SUIT LES MÊMES RÈGLES. « Mon Academy » n'existe que pour qui se
//      forme ; « Formations » et « Évaluer & certifier » que pour qui certifie.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DB = path.join(os.tmpdir(), `nutri-academy-referentiel-${process.pid}.sqlite`);
process.env.NUTRITION_DB = DB;
process.env.ADMIN_EMAIL = 'patron@exemple.fr';

const app = require('../server');
const { reussirQcm, terminerFormation } = require('./aideAcademy');
const PUBLIC = path.join(__dirname, '..', 'public');
const js = fs.readFileSync(path.join(PUBLIC, 'academy.js'), 'utf8');

const ADMIN = 'patron@exemple.fr';
const CERT = 'carla.rf@exemple.fr';  // CERTIFICATRICE PURE : elle ne se forme pas
const COACH = 'theo.rf@exemple.fr';  // coach pur : il se forme, il ne certifie pas
const DEUX = 'dana.rf@exemple.fr';   // les deux rôles à la fois
const ZOE = 'zoe.rf@exemple.fr';     // aucun rôle
const NUTRI = 'coach_nutrition';
const BROUILLON = 'formation_brouillon_rf';

const jetons = {};
let srv, base;
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

const liste = (qui) => api('GET', '/api/academy/referentiel', null, jetons[qui]);
const fiche = (cle, qui) => api('GET', '/api/academy/referentiel/' + cle, null, jetons[qui]);

// TOUTES les tables qu'une consultation pourrait salir si elle écrivait.
const COMPTEURS = ['academy_vus', 'academy_tentatives', 'academy_tentative_questions',
  'academy_tentative_reponses', 'academy_evaluations', 'academy_evaluation_criteres',
  'academy_certifications', 'boost_certifications'];
const compter = () => Object.fromEntries(COMPTEURS.map((t) => {
  let n = -1;
  try { n = dbq().prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n; } catch (_) { n = -1; }
  return [t, n];
}));

test.before(async () => {
  srv = app.listen(0);
  await new Promise((r) => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;

  for (const [e, p] of [[ADMIN, '7777'], [CERT, '5005'], [COACH, '4004'], [DEUX, '6006'], [ZOE, '3003']]) {
    await connecter(e, p);
  }
  // Seuls COACH et DEUX se forment. CARLA reste HORS des collaborateurs : c'est
  // tout l'objet de ce fichier — un certificateur qui n'est l'apprenant de rien.
  for (const e of [COACH, DEUX]) {
    await api('POST', '/api/boost/admin/collaborateurs', { email: e, role: 'collaborateur' }, jetons[ADMIN]);
  }
  for (const [e, p] of [[COACH, '4004'], [DEUX, '6006']]) await connecter(e, p);

  for (const e of [CERT, DEUX]) {
    await api('POST', '/api/academy/admin/evaluateurs', { email: e, evaluateur: true }, jetons[ADMIN]);
  }

  // Une formation EN BROUILLON : elle sert à prouver qu'elle n'existe pas pour
  // un certificateur ordinaire, et qu'elle existe pour l'administrateur.
  app.academyFormations.definir({
    cle: BROUILLON, libelle: 'Formation en construction', ordre: 90,
    qcmNbQuestions: 1, qcmSeuilPct: 0, pratiqueObligatoire: false, certificationActive: false,
    actif: false,
  }, ADMIN);

  // L'amorçage de démonstration ne pose que des vidéos. On ajoute UN contenu
  // écrit, parce que le certificateur doit pouvoir lire un cours autant qu'en
  // regarder un — et qu'un test qui ne l'éprouve pas ne garantit rien.
  const arbre = (await api('GET', '/api/academy/admin/arbre?formation=' + NUTRI, null, jetons[ADMIN])).body;
  await api('POST', '/api/academy/admin/contenus', {
    formation: NUTRI, moduleId: arbre.modules[0].id, type: 'texte',
    titre: 'Le protocole écrit, à relire avant l\'évaluation',
    texte: 'Trois repères que le coach doit savoir énoncer sans notes.',
  }, jetons[ADMIN]);
});

test.after(() => {
  if (srv) srv.close();
  require('../lib/db').closeDb();
  ['', '-wal', '-shm'].forEach((s) => { try { fs.unlinkSync(DB + s); } catch (_) {} });
});

// ===========================================================================
//  1. DEUX MÉTIERS, DEUX PORTES — et la garde est serveur
// ===========================================================================

test('la certificatrice PURE n\'est pas une apprenante, et le serveur le dit', async () => {
  const moi = await api('GET', '/api/academy/moi', null, jetons[CERT]);
  assert.strictEqual(moi.body.collaborateur, false, 'elle ne se forme pas');
  assert.strictEqual(moi.body.evaluateur, true, 'elle certifie');
  assert.strictEqual(moi.body.admin, false, 'elle n\'administre pas');
  assert.strictEqual(app.academy.peutSeFormer(CERT), false);
});

test('LE RÉFÉRENTIEL S\'OUVRE À QUI CERTIFIE, et se ferme aux autres', async () => {
  for (const qui of [CERT, DEUX, ADMIN]) {
    assert.strictEqual((await liste(qui)).status, 200, qui + ' doit entrer dans le référentiel');
    assert.strictEqual((await fiche(NUTRI, qui)).status, 200, qui + ' doit lire une formation');
  }
  for (const [qui, quoi] of [[COACH, 'un coach pur'], [ZOE, 'un compte sans rôle']]) {
    const l = await liste(qui);
    assert.strictEqual(l.status, 403, quoi + ' ne doit pas entrer (reçu ' + l.status + ')');
    assert.strictEqual(l.body.nonEvaluateur, true, 'le refus doit dire pourquoi');
    assert.strictEqual((await fiche(NUTRI, qui)).status, 403, quoi + ' ne doit lire aucune fiche');
  }
});

test('sans jeton, les deux routes ne répondent pas', async () => {
  for (const route of ['/api/academy/referentiel', '/api/academy/referentiel/' + NUTRI]) {
    const r = await api('GET', route, null, null);
    assert.strictEqual(r.status, 401, route + ' doit exiger un compte');
  }
});

test('la certificatrice pure reste dehors du parcours d\'apprentissage', async () => {
  // Ces refus EXISTAIENT ; ils ne doivent pas avoir bougé d'un caractère.
  const fermees = [
    ['GET', '/api/academy/formation'],
    ['GET', '/api/academy/qcm'],
    ['GET', '/api/academy/pratique'],
    ['GET', '/api/academy/certification'],
    ['POST', '/api/academy/qcm/tentatives'],
    ['POST', '/api/academy/reprendre'],
  ];
  for (const [m, route] of fermees) {
    const r = await api(m, route, m === 'POST' ? {} : null, jetons[CERT]);
    assert.strictEqual(r.status, 403, route + ' doit rester fermée à qui ne se forme pas');
    assert.strictEqual(r.body.nonCollaborateur, true, route + ' doit dire pourquoi');
  }
});

// ===========================================================================
//  2. ELLE VOIT TOUT CE QU'ELLE DOIT ÉVALUER
// ===========================================================================

test('la liste sert le catalogue COMPLET, sans une once de progression', async () => {
  const r = await liste(CERT);
  const publiees = app.academyFormations.lister();
  assert.strictEqual(r.body.formations.length, publiees.length,
    'toutes les formations publiées doivent être là');
  // Les trois familles de l'Academy sont atteignables depuis cette seule liste.
  const familles = new Set(r.body.formations.map((f) => f.categorie).filter(Boolean));
  for (const c of ['essentiel', 'expertise', 'management']) {
    if (publiees.some((f) => f.categorie === c)) {
      assert.ok(familles.has(c), 'la famille ' + c + ' doit être représentée');
    }
  }
  const nutri = r.body.formations.find((f) => f.cle === NUTRI);
  assert.ok(nutri, 'la formation Coach Nutrition doit figurer');
  assert.ok(nutri.nbModules > 0 && nutri.nbContenus > 0, 'les compteurs doivent être servis');
  assert.ok(nutri.nbQuestionsFinale > 0, 'la banque finale doit être comptée');
  // AUCUN champ de parcours personnel : ni progression, ni pourcentage, ni
  // « terminés ». Le certificateur n'a pas de parcours, et l'écran ne doit
  // même pas pouvoir en inventer un.
  for (const interdit of ['pourcentage', 'termines', 'total', 'acheve', 'statut']) {
    assert.strictEqual(nutri[interdit], undefined,
      'le référentiel ne doit porter aucun champ de progression (' + interdit + ')');
  }
});

test('LA FICHE PORTE LE RÉFÉRENTIEL ENTIER — contenus, QCM, pratique, règles', async () => {
  const r = await fiche(NUTRI, CERT);
  const d = r.body;

  // La présentation de la formation.
  assert.strictEqual(d.formation.cle, NUTRI);
  assert.ok(d.formation.libelle, 'la formation doit porter son libellé');
  assert.strictEqual(typeof d.formation.qcm.seuilPct, 'number', 'le seuil théorique doit être servi');

  // Modules, chapitres, vidéos, textes.
  assert.ok(d.modules.length > 0, 'les modules doivent être servis');
  const contenus = d.modules.flatMap((m) => m.contenus);
  assert.ok(contenus.length > 0, 'les contenus doivent être servis');
  assert.ok(contenus.some((c) => c.type === 'video' && c.youtubeId), 'les vidéos doivent porter leur lien');
  assert.ok(contenus.some((c) => c.type === 'texte' && c.texte), 'les textes doivent porter leur contenu');

  // Le QCM théorique, ses questions ET son corrigé.
  assert.ok(d.qcm.finale.questions.length > 0, 'les questions finales doivent être servies');
  assert.strictEqual(d.qcm.corrige, true, 'la certificatrice pure lit le corrigé');
  assert.strictEqual(d.corrigeMasque, null, 'rien ne lui est masqué');
  const q = d.qcm.finale.questions[0];
  assert.ok(q.enonce, 'une question porte son énoncé');
  assert.ok(q.choix.length >= 2, 'une question porte ses choix');
  assert.ok(q.choix.some((c) => c.correct === true), 'le corrigé doit désigner au moins une bonne réponse');

  // L'évaluation pratique : cas, mise en situation, grille, critères, règles.
  assert.ok(d.pratique.cas.length > 0, 'les cas pratiques doivent être servis');
  assert.ok(d.pratique.cas.some((c) => c.scenario), 'la mise en situation doit voyager avec le cas');
  assert.ok(d.pratique.grille.length > 0, 'la grille doit être servie');
  assert.ok(d.pratique.grille.every((a) => a.criteres.length > 0), 'chaque axe porte ses critères');
  assert.strictEqual(d.pratique.reglesAxe.length, 3, 'les trois lectures d\'axe doivent être dites');
  assert.deepStrictEqual(d.pratique.verdicts.map((v) => v.cle), ['valide', 'a_repasser']);

  // Ce qu'il faut pour être certifié.
  assert.ok(d.certification.etapes.length > 0, 'les étapes de certification doivent être dites');
  assert.ok(d.certification.etapes.every((e) => e.regle), 'chaque étape porte sa règle');
});

test('LES ÉTAPES ANNONCÉES SONT CELLES DU MOTEUR — pas une seconde liste', async () => {
  // `prerequisDe` répond « où en est cette personne ? », le référentiel « qu'exige
  // cette formation ? ». Les deux se déduisent des mêmes drapeaux : les clés,
  // et leur ordre, doivent coïncider. Sinon l'écran promettrait autre chose que
  // ce que la certification vérifie.
  for (const cle of app.academyFormations.lister().map((f) => f.cle)) {
    const r = await fiche(cle, CERT);
    const attendues = app.academyCertifications.etatPour(COACH, cle).prerequis.map((p) => p.cle);
    assert.deepStrictEqual(r.body.certification.etapes.map((e) => e.cle), attendues,
      'les étapes annoncées pour ' + cle + ' doivent être celles du moteur');
  }
});

// ===========================================================================
//  3. CONSULTER N'EST PAS APPRENDRE
// ===========================================================================

test('UN PARCOURS COMPLET DU RÉFÉRENTIEL N\'ÉCRIT PAS UNE LIGNE', async () => {
  const avant = compter();

  // Tout ce qu'un certificateur peut faire sur cet espace, en entier : la
  // liste, puis CHAQUE formation, avec son QCM et son évaluation pratique.
  const l = await liste(CERT);
  for (const f of l.body.formations) {
    const d = await fiche(f.cle, CERT);
    assert.strictEqual(d.status, 200, f.cle + ' doit s\'ouvrir');
    // On lit vraiment ce qui est servi — c'est ce que fait l'écran.
    d.body.qcm.finale.questions.forEach((q) => q.choix.forEach((c) => c.texte));
    d.body.pratique.cas.forEach((c) => c.scenario);
  }

  assert.deepStrictEqual(compter(), avant,
    'aucune table de progression, de tentative ou d\'évaluation ne doit avoir bougé');
});

test('la certificatrice consultante n\'apparaît nulle part comme apprenante', async () => {
  const r = await api('GET', '/api/academy/evaluateur/coachs?formation=toutes', null, jetons[CERT]);
  assert.strictEqual(r.status, 200);
  assert.ok(!r.body.coachs.some((c) => c.email === CERT),
    'elle ne doit pas figurer dans la file des coachs à suivre');
  // Et rien n'a été vu : la table de progression ne la connaît pas.
  const vus = dbq().prepare('SELECT COUNT(*) AS n FROM academy_vus WHERE email = ?').get(CERT).n;
  assert.strictEqual(vus, 0, 'aucun contenu ne doit avoir été marqué vu pour elle');
});

// ===========================================================================
//  4. UN BROUILLON RESTE UN BROUILLON
// ===========================================================================

test('le brouillon n\'existe pas pour un certificateur ordinaire, et existe pour l\'administrateur', async () => {
  const c = await liste(CERT);
  assert.ok(!c.body.formations.some((f) => f.cle === BROUILLON), 'la liste ne doit pas le montrer');
  assert.strictEqual(c.body.brouillonsInclus, false);
  assert.strictEqual((await fiche(BROUILLON, CERT)).status, 404,
    'une clé devinée ne doit pas ouvrir un parcours en construction');

  const a = await liste(ADMIN);
  assert.ok(a.body.formations.some((f) => f.cle === BROUILLON), 'l\'administrateur le prépare, il le voit');
  assert.strictEqual(a.body.brouillonsInclus, true);
  assert.strictEqual((await fiche(BROUILLON, ADMIN)).status, 200);
});

test('une formation inconnue répond 404, jamais la formation par défaut', async () => {
  const r = await fiche('formation_qui_nexiste_pas', CERT);
  assert.strictEqual(r.status, 404);
});

// ===========================================================================
//  5. LE DOUBLE RÔLE — les deux espaces, et pas de triche
// ===========================================================================

test('coach ET certificatrice : les deux espaces s\'ouvrent', async () => {
  assert.strictEqual((await api('GET', '/api/academy/formation', null, jetons[DEUX])).status, 200,
    'elle garde son parcours d\'apprenante');
  assert.strictEqual((await liste(DEUX)).status, 200, 'elle garde le référentiel');
  assert.strictEqual(
    (await api('GET', '/api/academy/evaluateur/coachs?formation=toutes', null, jetons[DEUX])).status, 200,
    'elle garde « Évaluer & certifier »');
});

test('ON NE LIT PAS LE CORRIGÉ D\'UNE ÉPREUVE QU\'ON DOIT ENCORE PASSER', async () => {
  const avant = await fiche(NUTRI, DEUX);
  assert.strictEqual(avant.body.qcm.corrige, false, 'sa théorie n\'est pas validée : pas de corrigé');
  assert.ok(avant.body.corrigeMasque, 'et on lui dit pourquoi');
  const questions = avant.body.qcm.finale.questions;
  assert.ok(questions.length > 0, 'elle voit tout de même les questions');
  for (const q of questions) {
    assert.strictEqual(q.multiple, undefined, '« plusieurs bonnes réponses » est déjà la moitié du corrigé');
    for (const c of q.choix) {
      assert.strictEqual(c.correct, undefined,
        'aucun choix ne doit porter la réponse — même pas un `correct: false`');
    }
  }
  // Le reste du référentiel, lui, ne lui est PAS masqué : elle certifie.
  assert.ok(avant.body.pratique.cas.length > 0, 'les cas pratiques restent lisibles');
  assert.ok(avant.body.modules.length > 0, 'les contenus restent lisibles');
});

test('le corrigé revient dès que sa propre théorie est validée', async () => {
  await terminerFormation({ api, email: DEUX, jeton: jetons[DEUX] });
  const res = await reussirQcm({ api, jeton: jetons[DEUX] });
  assert.strictEqual(res.reussie, true, 'l\'amorçage doit avoir fait réussir le QCM');

  const apres = await fiche(NUTRI, DEUX);
  assert.strictEqual(apres.body.qcm.corrige, true, 'la raison de masquer a disparu');
  assert.strictEqual(apres.body.corrigeMasque, null);
  assert.ok(apres.body.qcm.finale.questions.some((q) => q.choix.some((c) => c.correct === true)),
    'le corrigé doit être servi');
});

test('la certificatrice PURE, elle, n\'a jamais rien eu à valider', async () => {
  const r = await fiche(NUTRI, CERT);
  assert.strictEqual(r.body.qcm.corrige, true,
    'elle n\'est l\'apprenante de rien : la règle ne la concerne pas');
});

// ===========================================================================
//  6. L'ÉCRAN SUIT LES MÊMES RÈGLES
// ===========================================================================

test('« Mon Academy » n\'est proposée qu\'à qui se forme', () => {
  const barre = js.slice(js.indexOf('function rendreBarreLaterale'), js.indexOf('async function naviguer'));
  assert.ok(/moiCollab[\s\S]{0,120}Mon Academy/.test(barre),
    'l\'entrée « Mon Academy » doit être conditionnée au fait de se former');
});

test('« Formations » et « Évaluer & certifier » n\'apparaissent qu\'à qui certifie', () => {
  const barre = js.slice(js.indexOf('function rendreBarreLaterale'), js.indexOf('async function naviguer'));
  assert.ok(/if \(moiEval\)[\s\S]{0,200}Évaluer & certifier/.test(barre));
  assert.ok(/if \(moiEval\)[\s\S]{0,200}'Formations'/.test(barre),
    'la consultation du référentiel doit avoir sa propre destination');
});

test('l\'écran de consultation n\'emploie AUCUN verbe d\'apprenant', () => {
  // On lit le CODE, commentaires retirés : un commentaire qui cite le libellé
  // qu'on refuse d'afficher ne doit pas faire échouer la vérification.
  const ecran = js.slice(js.indexOf('// --- Référentiel'), js.indexOf('// --- Suivi terrain'))
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.ok(ecran.length > 500, 'l\'écran du référentiel doit exister');
  for (const interdit of ['Commencer cette formation', 'complété', 'Reprendre ma formation']) {
    assert.ok(!ecran.includes(interdit),
      'le certificateur ne consulte pas son parcours : « ' + interdit + ' » n\'a rien à faire ici');
  }
  for (const attendu of ['Voir la formation', 'Voir le QCM théorique', 'Voir l’évaluation pratique']) {
    assert.ok(ecran.includes(attendu), 'le libellé « ' + attendu + ' » doit être proposé');
  }
});

test('l\'écran n\'appelle QUE les deux routes de consultation', () => {
  const ecran = js.slice(js.indexOf('// --- Référentiel'), js.indexOf('// --- Suivi terrain'))
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const appels = [...ecran.matchAll(/apiAc\(([^)]*)\)/g)].map((m) => m[1]);
  assert.ok(appels.length > 0, 'l\'écran doit lire le serveur');
  for (const a of appels) {
    assert.ok(a.includes('/api/academy/referentiel'),
      'aucun autre appel que le référentiel ne doit partir d\'ici : ' + a);
  }
  assert.ok(!/apiAc\([^)]*,\s*'POST'/.test(ecran) && !/apiAc\([^)]*,\s*'PUT'/.test(ecran),
    'la consultation n\'écrit rien, y compris depuis l\'écran');
});
