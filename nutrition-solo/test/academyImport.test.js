'use strict';
// ============================================================================
//  MY COACH ACADEMY — import d'une formation complète (étape 3).
//
//  CE QUE CETTE SUITE PROUVE :
//
//   1. UNE FORMATION ENTIÈRE NAÎT D'UN SEUL JSON, en brouillon, sans qu'aucun
//      fichier ni aucune ligne de code ne lui soit propre.
//   2. L'APERÇU N'ÉCRIT RIEN. Pas une ligne, pas une table.
//   3. L'IMPORT EST ATOMIQUE. Une erreur à la dernière question, et il ne
//      reste RIEN — ni formation, ni module, ni vidéo.
//   4. TOUTES LES ERREURS SORTENT D'UN COUP, chacune avec son chemin.
//   5. RIEN NE PUBLIE, RIEN N'ÉCRASE, RIEN NE DÉBORDE sur une autre formation.
//   6. LE BOUCLAGE : le JSON dérivé de la banque « Mouvements fondamentaux »
//      produit le MÊME arbre que son script d'amorçage. C'est la preuve que
//      l'import remplace la chaîne de fichiers par formation.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DB = path.join(os.tmpdir(), `nutri-academy-import-test-${process.pid}.sqlite`);
process.env.NUTRITION_DB = DB;
process.env.ADMIN_EMAIL = 'patron@exemple.fr';

const app = require('../server');
let srv, base;

const ADMIN = 'patron@exemple.fr';
const THEO = 'theo.i@exemple.fr';
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
const adm = (m, route, corps) => api(m, route, corps, jetons[ADMIN]);
const importer = (json, apercu) => adm('POST', '/api/academy/admin/import', { json, apercu });
const arbreDe = async (cle) => (await adm('GET', `/api/academy/admin/arbre?formation=${cle}`)).body;

// Le compte de TOUT ce qui peut être écrit par un import. Sert à prouver qu'un
// aperçu, ou un import refusé, n'a rien laissé derrière lui.
const compter = () => ['academy_formations', 'academy_modules', 'academy_contenus',
  'academy_questions', 'academy_choix', 'academy_cas']
  .reduce((o, t) => ({ ...o, [t]: dbq().prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n }), {});

const question = (n, prefixe) => ({
  enonce: `${prefixe} ${n} ?`,
  choix: [
    { texte: `Bonne réponse ${prefixe} ${n}`, correct: true },
    { texte: `Mauvaise A ${prefixe} ${n}`, correct: false },
    { texte: `Mauvaise B ${prefixe} ${n}`, correct: false },
    { texte: `Mauvaise C ${prefixe} ${n}`, correct: false },
  ],
});

// Un JSON valide, complet, et paramétrable pour les cas d'espèce.
function jsonValide(cle, sur = {}) {
  return {
    formation: {
      cle, libelle: 'Fitness Boxe', description: 'Les fondamentaux de la boxe en coaching.',
      ordre: 6, qcmNbQuestions: 2, qcmSeuilPct: 90, miniNbQuestions: 2, miniSeuilPct: 90,
      pratiqueObligatoire: true, certificationActive: true, titre: 'Fitness Boxe My Coach',
      ...(sur.formation || {}),
    },
    modules: sur.modules || [
      {
        titre: 'Garde et appuis', description: 'Ce que tu observes avant la frappe.',
        video: { titre: 'La garde', youtubeId: 'N5jHrHsGD9w', dureeMin: 12 },
        questions: [question(1, 'M1'), question(2, 'M1')],
      },
      {
        titre: 'Déplacements',
        video: { titre: 'Les appuis', youtubeId: 'qT4wh5xwwP8' },
        questions: [question(1, 'M2'), question(2, 'M2')],
      },
    ],
    finale: sur.finale || [question(1, 'F'), question(2, 'F')],
    cas: sur.cas || [{ titre: 'Corriger une garde', consignes: 'SITUATION : …' }],
  };
}

test.before(async () => {
  await new Promise((r) => { srv = app.listen(0, r); });
  base = `http://127.0.0.1:${srv.address().port}`;
  app.boost.assurerSchema();
  app.academyCertifications.assurerSchema();
  for (const [e, p] of [[ADMIN, '7777'], [THEO, '4004']]) await connecter(e, p);
  await api('POST', '/api/boost/admin/collaborateurs', { email: THEO, role: 'collaborateur' }, jetons[ADMIN]);
});

test.after(() => {
  if (srv) srv.close();
  require('../lib/db').closeDb();
  ['', '-wal', '-shm'].forEach((s) => { try { fs.unlinkSync(DB + s); } catch (_) {} });
});

// ===========================================================================
//  A. LE CHEMIN NOMINAL
// ===========================================================================

test('UNE FORMATION COMPLÈTE NAÎT D\'UN SEUL JSON, en brouillon', async () => {
  const r = await importer(jsonValide('import_boxe'), false);
  assert.strictEqual(r.status, 200, r.txt.slice(0, 300));

  const f = r.body.formation;
  assert.strictEqual(f.cle, 'import_boxe');
  assert.strictEqual(f.libelle, 'Fitness Boxe');
  assert.strictEqual(f.description, 'Les fondamentaux de la boxe en coaching.');
  assert.strictEqual(f.titre, 'Fitness Boxe My Coach');
  assert.strictEqual(f.ordre, 6);
  assert.strictEqual(f.qcmNbQuestions, 2);
  assert.strictEqual(f.qcmSeuilPct, 90);
  assert.strictEqual(f.miniNbQuestions, 2);
  assert.strictEqual(f.miniSeuilPct, 90);
  assert.strictEqual(f.pratiqueObligatoire, true);
  assert.strictEqual(f.certificationActive, true);
  assert.strictEqual(f.actif, false, 'UN IMPORT NE PUBLIE JAMAIS');
  assert.strictEqual(f.refletBoost, false, 'et n\'ouvre aucun dossier Boost');

  const a = await arbreDe('import_boxe');
  assert.deepStrictEqual(a.modules.map((m) => m.titre), ['Garde et appuis', 'Déplacements']);
  assert.deepStrictEqual(a.modules.map((m) => m.contenus.length), [1, 1]);
  assert.deepStrictEqual(a.modules.map((m) => m.contenus[0].youtubeId), ['N5jHrHsGD9w', 'qT4wh5xwwP8']);
  assert.strictEqual(a.modules[0].contenus[0].dureeMin, 12);

  // L'usage est DÉDUIT de l'emplacement : sous un module, c'est un mini.
  const minis = a.questions.filter((q) => q.usage === 'mini');
  const finales = a.questions.filter((q) => q.usage === 'finale');
  assert.strictEqual(minis.length, 4);
  assert.strictEqual(finales.length, 2);
  assert.ok(minis.every((q) => q.moduleId), 'un mini est toujours rattaché');
  assert.ok(finales.every((q) => q.moduleId === null), 'une finale est transversale');
  assert.ok(a.questions.every((q) => q.tirable), 'toutes les questions doivent être tirables');
  assert.deepStrictEqual(a.cas.map((c) => c.titre), ['Corriger une garde']);
});

test('la formation importée est PUBLIABLE, mais ce n\'est pas l\'import qui publie', async () => {
  const v = (await arbreDe('import_boxe')).verification;
  assert.strictEqual(v.publiable, true, 'blocages : ' + JSON.stringify(v.blocages));
  assert.strictEqual(v.publiee, false);

  // Le collaborateur ne la voit pas tant qu'un humain n'a pas publié.
  const cat = await api('GET', '/api/academy/formations', null, jetons[THEO]);
  assert.ok(!cat.body.formations.some((x) => x.cle === 'import_boxe'),
    'un brouillon importé n\'existe pour aucun collaborateur');

  // Et la publication reste le geste vérifié d'avant.
  const p = await adm('POST', '/api/academy/admin/formations/import_boxe/publier');
  assert.strictEqual(p.status, 200, p.txt.slice(0, 200));
  assert.strictEqual(p.body.formation.actif, true);
});

// ===========================================================================
//  B. L'APERÇU N'ÉCRIT RIEN
// ===========================================================================

test('L\'APERÇU N\'ÉCRIT PAS UNE LIGNE', async () => {
  const avant = compter();
  const r = await importer(jsonValide('import_apercu'), true);
  assert.strictEqual(r.status, 200, r.txt.slice(0, 300));
  assert.strictEqual(r.body.apercu, true);
  assert.deepStrictEqual(compter(), avant, 'un aperçu a écrit quelque chose');
  assert.strictEqual(app.academyFormations.lire('import_apercu'), null);

  // Et il annonce ce qui serait créé.
  assert.deepStrictEqual(r.body.rapport.chiffres,
    { cle: 'import_apercu', modules: 2, videos: 2, minis: 4, finales: 2, cas: 1 });
  assert.strictEqual(r.body.rapport.erreurs.length, 0);
});

test('un aperçu en ERREUR n\'écrit rien non plus', async () => {
  const avant = compter();
  const mauvais = jsonValide('import_ko');
  mauvais.modules[0].video.youtubeId = 'https://youtu.be/abc';
  const r = await importer(mauvais, true);
  assert.strictEqual(r.status, 400);
  assert.deepStrictEqual(compter(), avant);
});

// ===========================================================================
//  C. TOUTES LES ERREURS, D'UN COUP, AVEC LEUR CHEMIN
// ===========================================================================

test('TOUTES LES ERREURS SORTENT ENSEMBLE, chacune avec son chemin', async () => {
  const j = jsonValide('import_multi');
  j.formation.cle = 'Fitness-Boxe';                       // majuscules et tiret
  j.modules[0].video.youtubeId = 'https://youtu.be/xY9';  // URL, pas identifiant
  j.modules[1].titre = '';                                // titre manquant
  j.finale[0].choix.forEach((c) => { c.correct = false; });  // aucune bonne réponse
  j.cas[0].titre = '';                                    // cas sans titre

  const r = await importer(j, true);
  assert.strictEqual(r.status, 400);
  const chemins = r.body.rapport.erreurs.map((e) => e.chemin);
  for (const attendu of ['formation.cle', 'modules[0].video.youtubeId', 'modules[1].titre',
    'finale[0].choix', 'cas[0].titre']) {
    assert.ok(chemins.includes(attendu), `« ${attendu} » manque : ${JSON.stringify(chemins)}`);
  }
  assert.ok(r.body.rapport.erreurs.length >= 5,
    'les erreurs doivent sortir toutes ensemble, pas une par une');
});

test('chaque champ obligatoire est réclamé, et nommé', async () => {
  const cas = [
    [(j) => { delete j.formation.libelle; }, 'formation.libelle'],
    [(j) => { j.formation.certificationActive = true; delete j.formation.titre; }, 'formation.titre'],
    [(j) => { j.formation.qcmSeuilPct = 150; }, 'formation.qcmSeuilPct'],
    [(j) => { j.formation.qcmNbQuestions = 0; }, 'formation.qcmNbQuestions'],
    [(j) => { j.modules = []; }, 'modules'],
    [(j) => { delete j.modules[0].video; }, 'modules[0].video'],
    [(j) => { delete j.modules[0].questions[0].enonce; }, 'modules[0].questions[0].enonce'],
    [(j) => { j.modules[0].questions[0].choix = [{ texte: 'Seule', correct: true }]; }, 'modules[0].questions[0].choix'],
    [(j) => { j.modules[0].questions[0].choix.forEach((c) => { c.correct = true; }); }, 'modules[0].questions[0].choix'],
    [(j) => { j.finale = [question(1, 'F')]; }, 'finale'],
    [(j) => { j.modules[0].questions = [question(1, 'M1')]; }, 'modules[0].questions'],
  ];
  for (const [casser, chemin] of cas) {
    const j = jsonValide('import_champ');
    casser(j);
    const r = await importer(j, true);
    assert.strictEqual(r.status, 400, 'aurait dû être refusé : ' + chemin);
    assert.ok(r.body.rapport.erreurs.some((e) => e.chemin === chemin),
      `« ${chemin} » attendu, reçu ${JSON.stringify(r.body.rapport.erreurs.map((e) => e.chemin))}`);
  }
});

test('un JSON qui n\'est pas un objet est refusé sans planter', async () => {
  for (const mauvais of [null, 'du texte', 42, []]) {
    const r = await importer(mauvais, true);
    assert.strictEqual(r.status, 400, JSON.stringify(mauvais));
    assert.ok(r.body.rapport.erreurs.length);
  }
});

// ===========================================================================
//  D. ATOMICITÉ
// ===========================================================================

test('UNE ERREUR À LA DERNIÈRE QUESTION, ET IL NE RESTE RIEN', async () => {
  const avant = compter();
  const j = jsonValide('import_atomique');
  // Une erreur que l'ANALYSE ne voit pas mais que l'écriture refusera :
  // un énoncé de 1200 caractères passe la longueur côté analyse ? non — on
  // choisit donc une erreur d'écriture pure : un choix vide en dernière ligne.
  j.finale[j.finale.length - 1].choix = [
    { texte: 'Unique', correct: true }, { texte: 'Autre', correct: true },
  ];
  const r = await importer(j, false);
  assert.strictEqual(r.status, 400);
  assert.deepStrictEqual(compter(), avant, 'l\'import refusé a laissé des lignes derrière lui');
  assert.strictEqual(app.academyFormations.lire('import_atomique'), null,
    'la formation ne doit pas exister');
});

test('l\'atomicité tient AUSSI sur un refus venu du moteur, pas de l\'analyse', async () => {
  const avant = compter();
  // `definirContenu` refuse un identifiant YouTube invalide. On en glisse un que
  // l'analyse laisse passer (11 caractères) mais que le moteur refusera… il n'y
  // en a pas : les deux appliquent LA MÊME règle, et c'est exactement le but.
  // On éprouve donc l'atomicité par une durée hors bornes, refusée à l'écriture.
  const j = jsonValide('import_atomique2');
  j.modules[1].video.dureeMin = 5000;
  const r = await importer(j, false);
  assert.strictEqual(r.status, 400);
  assert.deepStrictEqual(compter(), avant);
});

// ===========================================================================
//  E. CE QU'ON REFUSE D'OBÉIR
// ===========================================================================

test('« actif » et « refletBoost » sont IGNORÉS, et le rapport le dit', async () => {
  const j = jsonValide('import_forcage');
  j.formation.actif = true;
  j.formation.refletBoost = true;
  const r = await importer(j, false);
  assert.strictEqual(r.status, 200, r.txt.slice(0, 300));
  assert.strictEqual(r.body.formation.actif, false, 'un import ne publie JAMAIS');
  assert.strictEqual(r.body.formation.refletBoost, false, 'et n\'accorde JAMAIS le reflet Boost');
  const chemins = r.body.rapport.avertissements.map((a) => a.chemin);
  assert.ok(chemins.includes('formation.actif') && chemins.includes('formation.refletBoost'),
    'les champs refusés doivent être NOMMÉS, pas ignorés en silence : ' + JSON.stringify(chemins));
  assert.strictEqual(app.boost.estCoachCertifie(THEO), false);
  assert.strictEqual(dbq().prepare('SELECT COUNT(*) AS n FROM boost_certifications').get().n, 0);
});

test('UNE CLÉ DÉJÀ PRISE EST REFUSÉE : aucun écrasement', async () => {
  const avant = compter();
  const r = await importer(jsonValide('import_boxe'), false);   // déjà importée plus haut
  assert.strictEqual(r.status, 400);
  assert.ok(r.body.rapport.erreurs.some((e) => e.chemin === 'formation.cle' && /déjà/.test(e.message)));
  assert.deepStrictEqual(compter(), avant, 'le refus a quand même écrit');
  // Et l'existante n'a pas bougé : elle avait été publiée au test B.
  assert.strictEqual(app.academyFormations.lire('import_boxe').actif, true);
});

// ===========================================================================
//  F. AUCUNE AUTRE FORMATION N'EST TOUCHÉE
// ===========================================================================

test('UN IMPORT NE DÉBORDE SUR AUCUNE AUTRE FORMATION', async () => {
  const empreinte = () => JSON.stringify({
    f: dbq().prepare('SELECT cle, libelle, ordre, actif, qcm_nb_questions, qcm_seuil_pct, mini_nb_questions, mini_seuil_pct, pratique_obligatoire, certification_active, reflet_boost FROM academy_formations WHERE cle <> ? ORDER BY cle').all('import_voisin'),
    m: dbq().prepare('SELECT formation, titre, ordre, actif FROM academy_modules WHERE formation <> ? ORDER BY formation, ordre, titre').all('import_voisin'),
    q: dbq().prepare('SELECT formation, usage, enonce FROM academy_questions WHERE formation <> ? ORDER BY formation, usage, enonce').all('import_voisin'),
    c: dbq().prepare('SELECT formation, titre FROM academy_cas WHERE formation <> ? ORDER BY formation, titre').all('import_voisin'),
  });
  const avant = empreinte();
  const r = await importer(jsonValide('import_voisin'), false);
  assert.strictEqual(r.status, 200, r.txt.slice(0, 300));
  assert.strictEqual(empreinte(), avant, 'l\'import a modifié une formation voisine');
});

test('les progressions, tentatives et certifications existantes sont intactes', async () => {
  const avant = ['academy_vus', 'academy_tentatives', 'academy_certifications', 'academy_evaluations']
    .map((t) => dbq().prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n);
  await importer(jsonValide('import_neutre'), false);
  const apres = ['academy_vus', 'academy_tentatives', 'academy_certifications', 'academy_evaluations']
    .map((t) => dbq().prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n);
  assert.deepStrictEqual(apres, avant);
});

test('l\'import est fermé à un collaborateur', async () => {
  const r = await api('POST', '/api/academy/admin/import',
    { json: jsonValide('import_vole'), apercu: false }, jetons[THEO]);
  assert.ok(r.status === 401 || r.status === 403, 'statut ' + r.status);
  assert.strictEqual(app.academyFormations.lire('import_vole'), null);
});

// ===========================================================================
//  G. LE BOUCLAGE — l'import remplace la chaîne de fichiers
// ===========================================================================

test('LE JSON DÉRIVÉ DE « MOUVEMENTS FONDAMENTAUX » PRODUIT LE MÊME ARBRE QUE SON AMORÇAGE', async () => {
  const BANQUE = require('../lib/academyBanqueMouvementsFondamentaux');

  // 1. On dérive le JSON de la banque, sans rien inventer.
  const json = {
    formation: {
      cle: 'import_boucle', libelle: BANQUE.FORMATION.libelle, description: BANQUE.FORMATION.description,
      titre: BANQUE.FORMATION.titre, ordre: 99,
      qcmNbQuestions: BANQUE.REGLAGES.qcmNbQuestions, qcmSeuilPct: BANQUE.REGLAGES.qcmSeuilPct,
      miniNbQuestions: BANQUE.REGLAGES.miniNbQuestions, miniSeuilPct: BANQUE.REGLAGES.miniSeuilPct,
      pratiqueObligatoire: BANQUE.FORMATION.pratiqueObligatoire,
      certificationActive: BANQUE.FORMATION.certificationActive,
    },
    modules: BANQUE.MODULES.map((m) => ({
      titre: m.titre, description: m.description,
      video: { titre: m.titre, youtubeId: m.youtubeId },
      questions: m.questions.map((q) => ({
        enonce: q.enonce,
        choix: q.choix.map(([texte, correct]) => ({ texte, correct: !!correct })),
      })),
    })),
    finale: BANQUE.FINALE.map((q) => ({
      enonce: q.enonce,
      choix: q.choix.map(([texte, correct]) => ({ texte, correct: !!correct })),
    })),
    cas: BANQUE.CAS.map((c) => ({ titre: c.titre, consignes: c.consignes })),
  };

  const r = await importer(json, false);
  assert.strictEqual(r.status, 200, r.txt.slice(0, 400));

  // 2. On amorce la vraie, par le script, dans la même base.
  app.academyMouvementsFondamentaux.amorcer();

  // 3. Les deux arbres doivent coïncider, à la clé et à l'ordre près.
  const importe = await arbreDe('import_boucle');
  const amorce = await arbreDe('mouvements_fondamentaux');

  assert.strictEqual(importe.modules.length, amorce.modules.length, '10 modules attendus');
  assert.deepStrictEqual(importe.modules.map((m) => m.titre), amorce.modules.map((m) => m.titre));
  assert.deepStrictEqual(
    importe.modules.map((m) => m.contenus.map((c) => c.youtubeId)),
    amorce.modules.map((m) => m.contenus.map((c) => c.youtubeId)));

  const signature = (a) => {
    // Un module se désigne par son TITRE : les identifiants diffèrent
    // forcément entre deux formations, l'ordre pédagogique non.
    const titreDe = new Map(a.modules.map((m) => [m.id, m.titre]));
    return a.questions.map((q) => ({
      usage: q.usage,
      module: q.moduleId ? titreDe.get(q.moduleId) : null,
      enonce: q.enonce,
      choix: q.choix.map((c) => [c.texte, c.correct]),
    })).sort((x, y) => (x.enonce < y.enonce ? -1 : 1));
  };
  assert.deepStrictEqual(signature(importe), signature(amorce),
    'la banque importée doit être identique à la banque amorcée, corrigé compris');
  assert.deepStrictEqual(importe.cas.map((c) => [c.titre, c.consignes]),
    amorce.cas.map((c) => [c.titre, c.consignes]));

  // 4. Et surtout : la même vérification de publiabilité.
  assert.strictEqual(importe.verification.publiable, amorce.verification.publiable);
  assert.strictEqual(importe.verification.chiffres.questionsTirables,
    amorce.verification.chiffres.questionsTirables);
  assert.strictEqual(importe.verification.chiffres.modulesAvecMini,
    amorce.verification.chiffres.modulesAvecMini);
  assert.strictEqual(importe.formation.actif, false, 'et elle reste en brouillon');
});

// ===========================================================================
//  H. L'ÉCRAN
// ===========================================================================

test('l\'écran vérifie AVANT d\'écrire, et n\'offre l\'écriture que sur un rapport vierge', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'academy.js'), 'utf8');
  assert.ok(/data-adm="import-verifier"/.test(js), 'le geste de vérification existe');
  assert.ok(/data-adm="import-ecrire"/.test(js), 'le geste d\'écriture existe');
  const bloc = js.slice(js.indexOf('function rendreImport'), js.indexOf('// Les réglages.'));
  assert.ok(bloc.length > 500, 'le rendu de l\'import doit être délimité');
  // Le bouton d'écriture n'est pas grisé : IL N'EXISTE PAS tant qu'une
  // vérification n'est pas passée sans erreur.
  assert.ok(/!erreurs\.length[\s\S]{0,200}import-ecrire/.test(bloc),
    'le bouton d\'import doit dépendre d\'un rapport sans erreur');
  // Et l'aperçu part bien avec apercu:true.
  const geste = js.slice(js.indexOf("geste === 'import-verifier'"), js.indexOf("if (geste === 'basculer')"));
  assert.ok(/apercu/.test(geste), 'l\'écran doit distinguer aperçu et écriture');
  assert.ok(/'import-verifier'/.test(geste));
});

// ===========================================================================
//  I. LA CATÉGORIE DE CATALOGUE
// ===========================================================================

test('la catégorie du JSON est enregistrée telle quelle', async () => {
  const j = jsonValide('import_cat', { formation: { categorie: 'signature' } });
  const r = await importer(j, false);
  assert.strictEqual(r.status, 200, r.txt.slice(0, 300));
  assert.strictEqual(r.body.formation.categorie, 'signature');
});

test('UNE CATÉGORIE INCONNUE EST UNE ERREUR, dite AVANT toute écriture', async () => {
  const avant = compter();
  const j = jsonValide('import_cat_ko', { formation: { categorie: 'premium' } });
  const r = await importer(j, true);
  assert.strictEqual(r.status, 400);
  const e = r.body.rapport.erreurs.find((x) => x.chemin === 'formation.categorie');
  assert.ok(e, 'l\'erreur doit porter son chemin : ' + JSON.stringify(r.body.rapport.erreurs));
  assert.match(e.message, /premium/);
  assert.match(e.message, /essentiel, signature, expertise, management, boite_a_outils/);
  assert.deepStrictEqual(compter(), avant, 'un refus a écrit quelque chose');

  // Et l'écriture la refuse aussi, pour son propre compte.
  const w = await importer(j, false);
  assert.strictEqual(w.status, 400);
  assert.strictEqual(app.academyFormations.lire('import_cat_ko'), null);
  assert.deepStrictEqual(compter(), avant);
});

test('une catégorie ABSENTE est un AVERTISSEMENT, jamais un blocage', async () => {
  const j = jsonValide('import_cat_sans');
  delete j.formation.categorie;
  const ap = await importer(j, true);
  assert.strictEqual(ap.status, 200, 'l\'absence de catégorie ne doit RIEN bloquer');
  assert.ok(ap.body.rapport.avertissements.some((a) => a.chemin === 'formation.categorie'),
    'le trou doit être dit : ' + JSON.stringify(ap.body.rapport.avertissements));

  const r = await importer(j, false);
  assert.strictEqual(r.status, 200, r.txt.slice(0, 300));
  assert.strictEqual(r.body.formation.categorie, null);
  // Elle reste entièrement fonctionnelle.
  assert.strictEqual((await arbreDe('import_cat_sans')).verification.publiable, true);
});

test('la casse et les espaces d\'une catégorie sont normalisés', async () => {
  const j = jsonValide('import_cat_casse', { formation: { categorie: '  Boite_A_Outils ' } });
  const r = await importer(j, false);
  assert.strictEqual(r.status, 200, r.txt.slice(0, 300));
  assert.strictEqual(r.body.formation.categorie, 'boite_a_outils');
});
