'use strict';
// ============================================================================
//  MY COACH ACADEMY — L'APERÇU DES ÉVALUATIONS PRATIQUES (administrateur).
//
//  CE QUE CE FICHIER DOIT DÉMONTRER :
//
//   1. LE MODE EST RÉSERVÉ À L'ADMINISTRATEUR. Un certificateur désigné n'y
//      entre pas : il verrait les cas de TOUTES les formations, brouillons
//      compris, ce qui relève du catalogue et non de l'évaluation.
//
//   2. IL NE DÉPEND D'AUCUN DOSSIER COACH. Pas de collaborateur, pas de
//      théorie validée, pas de dossier ouvert : c'est tout l'intérêt.
//
//   3. IL N'ÉCRIT RIEN, ET NE PEUT RIEN ÉCRIRE. Deux GET. Après un parcours
//      complet, chaque table métier compte exactement les mêmes lignes.
//
//   4. IL SERT EXACTEMENT CE QUE VOIT LE CERTIFICATEUR — les mêmes cas, les
//      mêmes scénarios, la même grille. Un test compare les deux réponses
//      champ par champ : c'est ce qui interdit à l'aperçu de diverger.
//
//   5. AUCUNE GARDE DU PARCOURS RÉEL N'EST AFFAIBLIE. Après un aperçu, les
//      refus habituels refusent toujours, et une vraie évaluation s'ouvre et
//      se prononce normalement.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DB = path.join(os.tmpdir(), `nutri-academy-apercu-${process.pid}.sqlite`);
process.env.NUTRITION_DB = DB;
process.env.ADMIN_EMAIL = 'patron@exemple.fr';

const app = require('../server');

const ADMIN = 'patron@exemple.fr';
const EVA = 'eva.ap@exemple.fr';    // certificatrice DÉSIGNÉE, pas administratrice
const THEO = 'theo.ap@exemple.fr';  // collaborateur ordinaire
const ZOE = 'zoe.ap@exemple.fr';    // compte sans rôle
const NUTRI = 'coach_nutrition';
const SANS_GRILLE = 'formation_sans_grille';
const SANS_RIEN = 'formation_sans_rien';

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

const apercu = (par) => api('GET', '/api/academy/admin/apercu', null, jetons[par]);
const apercuDe = (cle, par) => api('GET', '/api/academy/admin/apercu/' + cle, null, jetons[par]);

// L'état de TOUTES les tables métier qu'un aperçu pourrait toucher.
const COMPTEURS = ['academy_evaluations', 'academy_evaluation_criteres', 'boost_certifications',
  'academy_tentatives', 'academy_tentative_questions', 'academy_vus', 'academy_cas', 'academy_criteres'];
const compter = () => Object.fromEntries(COMPTEURS.map((t) => {
  let n = 0;
  try { n = dbq().prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n; } catch (_) { n = -1; }
  return [t, n];
}));

test.before(async () => {
  srv = app.listen(0);
  await new Promise((r) => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;

  for (const [e, p] of [[ADMIN, '7777'], [EVA, '5005'], [THEO, '4004'], [ZOE, '3003']]) await connecter(e, p);
  for (const e of [EVA, THEO]) {
    await api('POST', '/api/boost/admin/collaborateurs', { email: e, role: 'collaborateur' }, jetons[ADMIN]);
    await connecter(e, e === EVA ? '5005' : '4004');
  }
  // Eva est certificatrice DÉSIGNÉE. C'est elle qui prouve que le mode n'est
  // pas ouvert « à ceux qui évaluent » mais à l'administrateur seul.
  await api('POST', '/api/academy/admin/evaluateurs', { email: EVA, evaluateur: true }, jetons[ADMIN]);

  app.academyPratique.assurerSchema();
  app.academyGrilles.assurerSchema();

  // Une formation EN BROUILLON, avec des cas mais AUCUNE grille : elle doit
  // apparaître, et son aperçu doit montrer le formulaire libre — c'est ce que
  // verrait un certificateur aujourd'hui sur Pilates ou Décrochage.
  app.academyFormations.definir({
    cle: SANS_GRILLE, libelle: 'Formation sans grille', ordre: 80,
    qcmNbQuestions: 1, qcmSeuilPct: 0, pratiqueObligatoire: true, certificationActive: false,
    actif: false,
  }, ADMIN);
  // Une formation SANS cas ni critère : elle ne doit PAS apparaître.
  app.academyFormations.definir({
    cle: SANS_RIEN, libelle: 'Formation sans rien', ordre: 81,
    qcmNbQuestions: 1, qcmSeuilPct: 0, pratiqueObligatoire: false, certificationActive: false,
  }, ADMIN);
  const maintenant = new Date().toISOString();
  for (const [ordre, titre] of [[1, 'Cas libre numéro un'], [2, 'Cas libre numéro deux']]) {
    dbq().prepare(`INSERT INTO academy_cas (formation, titre, consignes, ordre, actif, cle, cree_le, maj_le)
                   VALUES (?,?,?,?,1,?,?,?)`)
      .run(SANS_GRILLE, titre, 'Un pavé de consignes, comme avant les scénarios.', ordre,
        'ap-sg-' + ordre, maintenant, maintenant);
  }
});

test.after(() => {
  if (srv) srv.close();
  require('../lib/db').closeDb();
  ['', '-wal', '-shm'].forEach((s) => { try { fs.unlinkSync(DB + s); } catch (_) {} });
});

// ===========================================================================
//  1. LES DROITS
// ===========================================================================

test('L\'ADMINISTRATEUR ENTRE, et personne d\'autre', async () => {
  assert.strictEqual((await apercu(ADMIN)).status, 200, 'l\'administrateur doit entrer');

  for (const [qui, quoi] of [[EVA, 'une certificatrice DÉSIGNÉE'], [THEO, 'un collaborateur ordinaire'],
    [ZOE, 'un compte sans rôle']]) {
    const r = await apercu(qui);
    assert.strictEqual(r.status, 403, quoi + ' ne doit pas entrer (reçu ' + r.status + ')');
    const d = await apercuDe(NUTRI, qui);
    assert.strictEqual(d.status, 403, quoi + ' ne doit pas lire une formation');
  }
});

test('sans jeton, les deux routes d\'aperçu ne répondent pas', async () => {
  for (const route of ['/api/academy/admin/apercu', '/api/academy/admin/apercu/' + NUTRI]) {
    const r = await api('GET', route, null, null);
    assert.strictEqual(r.status, 401, route);
  }
});

test('être certificateur N\'OUVRE PAS le mode — et n\'est pas non plus refermé par lui', async () => {
  // Eva reste certificatrice : le mode aperçu ne lui retire rien.
  const coachs = await api('GET', `/api/academy/evaluateur/coachs?formation=${NUTRI}`, null, jetons[EVA]);
  assert.strictEqual(coachs.status, 200, 'la certificatrice garde son espace');
  // Mais il ne lui donne rien non plus.
  assert.strictEqual((await apercu(EVA)).status, 403);
});

// ===========================================================================
//  2. LE PÉRIMÈTRE
// ===========================================================================

test('les formations qui ont des cas OU des critères apparaissent — les autres non', async () => {
  const l = (await apercu(ADMIN)).body.formations;
  const par = new Map(l.map((f) => [f.cle, f]));

  const n = par.get(NUTRI);
  assert.ok(n, 'Nutrition Certifié doit apparaître');
  assert.strictEqual(n.nbCas, 6);
  assert.strictEqual(n.nbCriteres, 9);
  assert.strictEqual(n.nbAxes, 3);

  // Cas SANS grille : présente, comptée à zéro critère, et signalée brouillon.
  const sg = par.get(SANS_GRILLE);
  assert.ok(sg, 'une formation sans grille doit tout de même apparaître');
  assert.strictEqual(sg.nbCas, 2);
  assert.strictEqual(sg.nbCriteres, 0);
  assert.strictEqual(sg.actif, false, 'les brouillons sont montrés, et dits brouillons');

  // Ni cas ni critère : absente.
  assert.strictEqual(par.has(SANS_RIEN), false,
    'une formation sans référentiel pratique n\'a rien à prévisualiser');
});

test('une formation inconnue répond 404, jamais une autre formation', async () => {
  const r = await apercuDe('formation_fantome', ADMIN);
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.body.ok, false);
});

// ===========================================================================
//  3. CE QUI EST SERVI EST CE QUE VOIT LE CERTIFICATEUR
// ===========================================================================

test('les six cas sont consultables, scénario complet compris', async () => {
  const r = await apercuDe(NUTRI, ADMIN);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.cas.length, 6);
  assert.strictEqual(r.body.grille.length, 3);
  assert.strictEqual(r.body.grille.reduce((n, a) => n + a.criteres.length, 0), 9);

  for (const c of r.body.cas) {
    const sc = c.scenario;
    assert.ok(sc, c.titre + ' doit porter son scénario');
    assert.ok(sc.lire, '① manquant sur ' + c.titre);
    assert.ok(sc.role, '② manquant sur ' + c.titre);
    assert.ok(sc.jouer.length, '③ manquant sur ' + c.titre);
    assert.ok(sc.sections.length, '④/⑤ manquants sur ' + c.titre);
    assert.ok(sc.attendu, '⑥ manquant sur ' + c.titre);
    assert.ok(sc.observer, 'point à observer manquant sur ' + c.titre);
  }
});

test('L\'APERÇU SERT EXACTEMENT LA MÊME CHOSE QUE LA FICHE RÉELLE', async () => {
  // C'est le test qui interdit à l'aperçu de diverger : on compare la réponse
  // de l'aperçu à celle que reçoit un certificateur sur une vraie fiche.
  const maintenant = new Date().toISOString();
  dbq().prepare(`INSERT INTO academy_tentatives
      (email, formation, portee, statut, nb_questions, seuil_pct, ouverte_le, soumise_le, score_pct, bonnes, reussie)
      VALUES (?,?,'finale','soumise',1,0,?,?,100,1,1)`).run(THEO, NUTRI, maintenant, maintenant);

  const reelle = await api('GET',
    `/api/academy/evaluateur/collaborateurs/${encodeURIComponent(THEO)}?formation=${NUTRI}`,
    null, jetons[EVA]);
  assert.strictEqual(reelle.status, 200, JSON.stringify(reelle.body));

  const vue = await apercuDe(NUTRI, ADMIN);
  assert.deepStrictEqual(vue.body.cas, reelle.body.cas, 'les cas doivent être IDENTIQUES');
  assert.deepStrictEqual(vue.body.grille, reelle.body.grille, 'la grille doit être IDENTIQUE');
});

test('une formation sans grille sert ses cas et une grille VIDE', async () => {
  const r = await apercuDe(SANS_GRILLE, ADMIN);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.cas.length, 2);
  assert.deepStrictEqual(r.body.grille, [], 'sans grille, l\'écran retombe sur le formulaire libre');
  // Ses cas n'ont pas de scénario : ils gardent leur pavé, comme avant.
  assert.strictEqual(r.body.cas[0].scenario, null);
  assert.ok(r.body.cas[0].consignes, 'le pavé d\'avant reste servi');
});

// ===========================================================================
//  4. AUCUNE ÉCRITURE — LE CŒUR DU MODE
// ===========================================================================

test('AUCUN COACH N\'EST NÉCESSAIRE : le mode ne cite aucun collaborateur', async () => {
  // On efface toute trace de dossier, et l'aperçu répond exactement pareil.
  const avant = (await apercuDe(NUTRI, ADMIN)).body;
  dbq().prepare('DELETE FROM academy_evaluations').run();
  const apres = (await apercuDe(NUTRI, ADMIN)).body;
  assert.deepStrictEqual(apres, avant, 'l\'aperçu ne dépend d\'aucun dossier');
});

test('UN PARCOURS D\'APERÇU COMPLET N\'ÉCRIT RIEN', async () => {
  const avant = compter();

  // Tout ce que fait l'écran : lister, ouvrir chaque formation, relire chaque
  // cas. Plusieurs fois, comme un administrateur qui compare.
  for (let tour = 0; tour < 3; tour++) {
    const l = (await apercu(ADMIN)).body.formations;
    for (const f of l) {
      const d = await apercuDe(f.cle, ADMIN);
      assert.strictEqual(d.status, 200, f.cle);
    }
  }

  assert.deepStrictEqual(compter(), avant, 'une table métier a bougé pendant un aperçu');
});

test('aucune certification n\'est créée, aucune progression touchée', async () => {
  const certs = dbq().prepare('SELECT COUNT(*) AS n FROM boost_certifications').get().n;
  const vus = dbq().prepare('SELECT COUNT(*) AS n FROM academy_vus').get().n;
  for (const f of (await apercu(ADMIN)).body.formations) await apercuDe(f.cle, ADMIN);
  assert.strictEqual(dbq().prepare('SELECT COUNT(*) AS n FROM boost_certifications').get().n, certs);
  assert.strictEqual(dbq().prepare('SELECT COUNT(*) AS n FROM academy_vus').get().n, vus);
});

test('les routes d\'aperçu n\'acceptent QUE la lecture', async () => {
  for (const m of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    const r = await api(m, '/api/academy/admin/apercu', {}, jetons[ADMIN]);
    assert.ok(r.status === 404 || r.status === 405,
      m + ' /admin/apercu ne doit pas être servi (reçu ' + r.status + ')');
    const d = await api(m, '/api/academy/admin/apercu/' + NUTRI, {}, jetons[ADMIN]);
    assert.ok(d.status === 404 || d.status === 405,
      m + ' /admin/apercu/:cle ne doit pas être servi (reçu ' + d.status + ')');
  }
});

// ===========================================================================
//  5. AUCUNE RÉGRESSION DU PARCOURS RÉEL
// ===========================================================================

test('APRÈS UN APERÇU, une vraie évaluation s\'ouvre et se prononce normalement', async () => {
  // On passe d'abord par le mode aperçu, comme le fera l'administrateur.
  await apercu(ADMIN);
  await apercuDe(NUTRI, ADMIN);

  const f = (await api('GET',
    `/api/academy/evaluateur/collaborateurs/${encodeURIComponent(THEO)}?formation=${NUTRI}`,
    null, jetons[EVA])).body;
  const criteres = f.grille.flatMap((a) => a.criteres.map((c) => ({ id: c.id, acquis: true })));

  const ouvert = await api('POST',
    `/api/academy/evaluateur/collaborateurs/${encodeURIComponent(THEO)}/evaluations`,
    { formation: NUTRI, casId: f.cas[0].id }, jetons[EVA]);
  assert.strictEqual(ouvert.status, 201, JSON.stringify(ouvert.body));
  assert.strictEqual(ouvert.body.evaluation.resultat, null);

  const verdict = await api('PUT', `/api/academy/evaluateur/evaluations/${ouvert.body.evaluation.id}`,
    { resultat: 'valide', criteres }, jetons[EVA]);
  assert.strictEqual(verdict.status, 200, JSON.stringify(verdict.body));

  const p = app.academyPratique.etatPour(THEO, NUTRI);
  assert.strictEqual(p.validee, true, 'le parcours réel doit fonctionner comme avant');
});

test('les refus du parcours réel refusent toujours', async () => {
  // Le mode aperçu n'a ouvert aucune porte : les gardes d'avant tiennent.
  const soi = await api('POST',
    `/api/academy/evaluateur/collaborateurs/${encodeURIComponent(EVA)}/evaluations`,
    { formation: NUTRI, resultat: 'valide' }, jetons[EVA]);
  assert.strictEqual(soi.status, 403, 'on ne s\'auto-évalue toujours pas');

  const coach = await api('POST',
    `/api/academy/evaluateur/collaborateurs/${encodeURIComponent(THEO)}/evaluations`,
    { formation: NUTRI, resultat: 'valide' }, jetons[THEO]);
  assert.strictEqual(coach.status, 403, 'un collaborateur ordinaire n\'évalue toujours personne');
});
