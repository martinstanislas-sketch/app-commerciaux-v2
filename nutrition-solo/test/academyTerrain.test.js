'use strict';
// ============================================================================
//  MY COACH ACADEMY — LE SUIVI TERRAIN.
//
//  CE QUE CE FICHIER DOIT DÉMONTRER :
//
//   1. LE DROIT EST UN DROIT À PART. Ni se former, ni certifier, ni
//      administrer : un quatrième droit, qui s'accorde et se retire, et dont
//      la garde est SERVEUR — un coach ordinaire reçoit 403, pas un onglet
//      masqué.
//   2. UNE OBSERVATION = UNE COULEUR + UN TEXTE. Studio et niveau obligatoires,
//      salarié facultatif, aucun titre à saisir.
//   3. LA CHRONOLOGIE SUIT LA DATE DU FAIT, pas celle de la saisie. C'est la
//      propriété qui se casse le plus discrètement.
//   4. LES FILTRES SE COMPOSENT, et les compteurs comptent EXACTEMENT ce qui
//      est affiché.
//   5. MODIFIER ET SUPPRIMER SONT RÉSERVÉS à l'auteur et à l'administrateur —
//      et l'auteur d'origine n'est jamais réattribué.
//   6. RIEN N'EST DÉCLENCHÉ. Un « écart » ne touche ni parcours, ni QCM, ni
//      certification : les compteurs de ces tables ne bougent pas d'une ligne.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DB = path.join(os.tmpdir(), `nutri-academy-terrain-${process.pid}.sqlite`);
process.env.NUTRITION_DB = DB;
process.env.ADMIN_EMAIL = 'patron@exemple.fr';

const app = require('../server');
const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'academy.js'), 'utf8');

const ADMIN = 'patron@exemple.fr';
const PILOTE = 'paul.tr@exemple.fr';   // reçoit le droit de suivi terrain
const COACH = 'theo.tr@exemple.fr';    // collaborateur ordinaire, aucun droit
const SALARIE = 'lea.tr@exemple.fr';   // collaboratrice observée
const jetons = {};
let srv, base, studioA, studioB;
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
  const r = await api('POST', '/account/login', { email, prenom: email.split('.')[0], pin });
  jetons[email] = r.body.token;
};
const liste = (qui, q) => api('GET', '/api/academy/terrain' + (q || ''), null, jetons[qui]);
const creer = (qui, d) => api('POST', '/api/academy/terrain', d, jetons[qui]);

test.before(async () => {
  srv = app.listen(0);
  await new Promise((r) => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;
  for (const [e, p] of [[ADMIN, '7777'], [PILOTE, '5005'], [COACH, '4004'], [SALARIE, '3003']]) {
    await connecter(e, p);
  }
  for (const e of [PILOTE, COACH, SALARIE]) {
    await api('POST', '/api/boost/admin/collaborateurs', { email: e, role: 'collaborateur' }, jetons[ADMIN]);
  }
  for (const [e, p] of [[PILOTE, '5005'], [COACH, '4004'], [SALARIE, '3003']]) await connecter(e, p);
  await api('POST', '/api/academy/admin/terrain', { email: PILOTE, terrain: true }, jetons[ADMIN]);
  studioA = (await api('POST', '/api/academy/admin/studios', { nom: 'Studio Nord' }, jetons[ADMIN])).body.studio.id;
  studioB = (await api('POST', '/api/academy/admin/studios', { nom: 'Studio Sud' }, jetons[ADMIN])).body.studio.id;
});

test.after(() => {
  if (srv) srv.close();
  require('../lib/db').closeDb();
  ['', '-wal', '-shm'].forEach((s) => { try { fs.unlinkSync(DB + s); } catch (_) {} });
});

// ===========================================================================
//  1. LE DROIT
// ===========================================================================

test('LE SUIVI TERRAIN EST UN QUATRIÈME DROIT, indépendant des trois autres', async () => {
  const moi = await api('GET', '/api/academy/moi', null, jetons[PILOTE]);
  assert.strictEqual(moi.body.terrain, true, 'il a le droit de suivi terrain');
  assert.strictEqual(moi.body.evaluateur, false, 'sans être certificateur');
  assert.strictEqual(moi.body.admin, false, 'sans être administrateur');
  assert.strictEqual(moi.body.collaborateur, true, 'et il reste coach');

  const admin = await api('GET', '/api/academy/moi', null, jetons[ADMIN]);
  assert.strictEqual(admin.body.terrain, true, 'l\'administrateur l\'a par son rôle');
});

test('LA GARDE EST SERVEUR : un coach ordinaire reçoit 403 sur toutes les routes', async () => {
  const fermees = [
    ['GET', '/api/academy/terrain'],
    ['POST', '/api/academy/terrain'],
    ['PUT', '/api/academy/terrain/1'],
    ['DELETE', '/api/academy/terrain/1'],
  ];
  for (const [m, route] of fermees) {
    const r = await api(m, route, m === 'GET' || m === 'DELETE' ? null : {}, jetons[COACH]);
    assert.strictEqual(r.status, 403, route + ' doit être fermée à un coach sans droit');
    assert.strictEqual(r.body.nonTerrain, true, 'et le refus doit dire pourquoi');
  }
  // Sans jeton non plus.
  assert.strictEqual((await api('GET', '/api/academy/terrain', null, null)).status, 401);
});

test('retirer le droit referme la rubrique à l\'appel suivant', async () => {
  await api('POST', '/api/academy/admin/terrain', { email: PILOTE, terrain: false }, jetons[ADMIN]);
  assert.strictEqual((await liste(PILOTE)).status, 403);
  await api('POST', '/api/academy/admin/terrain', { email: PILOTE, terrain: true }, jetons[ADMIN]);
  assert.strictEqual((await liste(PILOTE)).status, 200);
});

test('un non-administrateur ne peut ni accorder le droit, ni gérer les studios', async () => {
  for (const [m, route, corps] of [
    ['POST', '/api/academy/admin/terrain', { email: COACH, terrain: true }],
    ['POST', '/api/academy/admin/studios', { nom: 'Studio pirate' }],
  ]) {
    assert.strictEqual((await api(m, route, corps, jetons[PILOTE])).status, 403,
      route + ' doit rester à l\'administrateur');
  }
});

// ===========================================================================
//  2. UNE OBSERVATION = UNE COULEUR + UN TEXTE
// ===========================================================================

test('une observation SANS salarié est parfaitement valide', async () => {
  const r = await creer(PILOTE, { studioId: studioA, date: '2026-09-04',
    niveau: 'OBSERVATION', observation: 'Passage au studio à 14h. Équipe présente, activité normale.' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.observation.salarie, null, 'aucun salarié : le champ reste nul');
  assert.strictEqual(r.body.observation.studio, 'Studio Nord');
  assert.strictEqual(r.body.observation.auteur.length > 0, true, 'l\'auteur vient du jeton');
});

test('une observation AVEC salarié le rattache, sans recopier son nom', async () => {
  const r = await creer(PILOTE, { studioId: studioA, salarie: SALARIE, date: '2026-09-03',
    niveau: 'POSITIVE', observation: 'Très bonne prise en charge du nouveau client.' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.observation.salarieEmail, SALARIE);
  // Le nom AFFICHÉ vient de `users` : la table des observations ne le stocke pas.
  const brut = dbq().prepare('SELECT * FROM academy_observations WHERE id = ?').get(r.body.observation.id);
  assert.strictEqual(brut.salarie_email, SALARIE);
  assert.strictEqual(brut.observation.includes('prise en charge'), true);
  assert.ok(!Object.keys(brut).some((k) => /prenom|nom_|titre/.test(k)),
    'aucune identité ni aucun titre recopiés dans la ligne');
});

test('LES QUATRE NIVEAUX SONT ACCEPTÉS, et rien d\'autre', async () => {
  for (const niveau of ['POSITIVE', 'TO_CORRECT', 'ISSUE', 'OBSERVATION']) {
    const r = await creer(PILOTE, { studioId: studioB, date: '2026-09-02', niveau,
      observation: 'Niveau ' + niveau + ' — texte de vérification.' });
    assert.strictEqual(r.status, 200, niveau + ' doit être accepté');
  }
  const faux = await creer(PILOTE, { studioId: studioB, date: '2026-09-02', niveau: 'ROUGE',
    observation: 'Une couleur n\'est pas un niveau.' });
  assert.strictEqual(faux.status, 400, 'une couleur ne doit pas passer pour une valeur métier');
});

test('les champs obligatoires sont exigés, et le refus nomme ce qui manque', async () => {
  const cas = [
    [{ date: '2026-09-04', niveau: 'ISSUE', observation: 'x' }, /studio/i],
    [{ studioId: studioA, niveau: 'ISSUE', observation: 'x' }, /date/i],
    [{ studioId: studioA, date: '2026-09-04', observation: 'x' }, /niveau/i],
    [{ studioId: studioA, date: '2026-09-04', niveau: 'ISSUE' }, /observ/i],
    [{ studioId: 99999, date: '2026-09-04', niveau: 'ISSUE', observation: 'x' }, /studio/i],
  ];
  for (const [corps, attendu] of cas) {
    const r = await creer(PILOTE, corps);
    assert.strictEqual(r.status, 400, JSON.stringify(corps) + ' doit être refusé');
    assert.match(r.body.error, attendu);
  }
});

test('un salarié inconnu est refusé : l\'historique ne porte pas d\'adresse sans visage', async () => {
  const r = await creer(PILOTE, { studioId: studioA, salarie: 'fantome@exemple.fr',
    date: '2026-09-04', niveau: 'POSITIVE', observation: 'x' });
  assert.strictEqual(r.status, 400);
});

// ===========================================================================
//  3. LA CHRONOLOGIE SUIT LA DATE DU FAIT
// ===========================================================================

test('UNE OBSERVATION ANCIENNE SAISIE AUJOURD\'HUI SE LIT À SA DATE', async () => {
  // Saisie en DERNIER, mais datée du 1er : elle doit passer derrière celles du 4.
  await creer(PILOTE, { studioId: studioA, date: '2026-09-01', niveau: 'TO_CORRECT',
    observation: 'Fait du 1er septembre, noté plus tard.' });
  const l = await liste(PILOTE);
  const dates = l.body.observations.map((o) => o.date);
  const triees = [...dates].sort().reverse();
  assert.deepStrictEqual(dates, triees, 'la liste doit être ordonnée par date du FAIT, décroissante');
  assert.strictEqual(dates[dates.length - 1], '2026-09-01',
    'le fait le plus ancien ferme la marche, quelle que soit sa date de saisie');

  const ancien = await liste(PILOTE, '?tri=ancien');
  assert.strictEqual(ancien.body.observations[0].date, '2026-09-01', 'et le tri inverse fonctionne');
});

// ===========================================================================
//  4. FILTRES ET COMPTEURS
// ===========================================================================

test('les filtres se COMPOSENT, et les compteurs comptent ce qui est affiché', async () => {
  const tout = await liste(PILOTE);
  assert.strictEqual(tout.body.compteurs.total, tout.body.observations.length,
    'le total doit être celui de la liste renvoyée');

  const nord = await liste(PILOTE, '?studio=' + studioA);
  assert.ok(nord.body.observations.every((o) => o.studio === 'Studio Nord'));
  assert.strictEqual(nord.body.compteurs.total, nord.body.observations.length,
    'les compteurs suivent le filtre : ils ne parlent jamais d\'autre chose que de l\'écran');

  const positifs = await liste(PILOTE, '?niveau=POSITIVE');
  assert.ok(positifs.body.observations.every((o) => o.niveau === 'POSITIVE'));
  assert.strictEqual(positifs.body.compteurs.POSITIVE, positifs.body.observations.length);

  const combine = await liste(PILOTE, '?studio=' + studioA + '&salarie=' + encodeURIComponent(SALARIE));
  assert.ok(combine.body.observations.every((o) => o.studio === 'Studio Nord' && o.salarieEmail === SALARIE),
    'studio ET salarié doivent s\'appliquer ensemble');

  const cherche = await liste(PILOTE, '?q=' + encodeURIComponent('prise en charge'));
  assert.ok(cherche.body.observations.length >= 1);
  assert.ok(cherche.body.observations.every((o) => /prise en charge/i.test(o.observation)));

  const periode = await liste(PILOTE, '?depuis=2026-09-03&jusqua=2026-09-04');
  assert.ok(periode.body.observations.every((o) => o.date >= '2026-09-03' && o.date <= '2026-09-04'));
});

test('la liste sert aussi les référentiels de saisie, sans second appel', async () => {
  const l = await liste(PILOTE);
  assert.ok(l.body.studios.length >= 2, 'les studios voyagent avec la liste');
  // LES SALARIÉS VIENNENT DU BOOST : aucune liste écrite en dur.
  assert.ok(l.body.salaries.some((s) => s.email === SALARIE));
  assert.ok(l.body.salaries.every((s) => typeof s.email === 'string'));
});

// ===========================================================================
//  5. MODIFIER ET SUPPRIMER
// ===========================================================================

test('l\'auteur modifie la sienne — et l\'AUTEUR D\'ORIGINE NE CHANGE PAS', async () => {
  const cree = await creer(PILOTE, { studioId: studioA, date: '2026-09-04', niveau: 'TO_CORRECT',
    observation: 'Texte de départ.' });
  const id = cree.body.observation.id;
  const auteur = cree.body.observation.auteurEmail;

  const maj = await api('PUT', '/api/academy/terrain/' + id, {
    studioId: studioB, salarie: SALARIE, date: '2026-09-05', niveau: 'ISSUE',
    observation: 'Texte corrigé.', auteur: ADMIN,   // ⚠️ on TENTE de réattribuer
  }, jetons[PILOTE]);
  assert.strictEqual(maj.status, 200);
  assert.strictEqual(maj.body.observation.observation, 'Texte corrigé.');
  assert.strictEqual(maj.body.observation.niveau, 'ISSUE');
  assert.strictEqual(maj.body.observation.auteurEmail, auteur,
    'l\'auteur ne se réattribue pas par un corps de requête bien tourné');
});

test('un autre porteur du droit ne réécrit PAS le constat de quelqu\'un d\'autre', async () => {
  await api('POST', '/api/academy/admin/terrain', { email: SALARIE, terrain: true }, jetons[ADMIN]);
  const mienne = await creer(PILOTE, { studioId: studioA, date: '2026-09-04', niveau: 'POSITIVE',
    observation: 'Observation de Paul.' });
  const id = mienne.body.observation.id;

  const tentative = await api('PUT', '/api/academy/terrain/' + id, {
    studioId: studioA, date: '2026-09-04', niveau: 'ISSUE', observation: 'Réécrit par un autre.',
  }, jetons[SALARIE]);
  assert.strictEqual(tentative.status, 403, 'le droit d\'AJOUTER n\'est pas celui de RÉÉCRIRE');
  assert.strictEqual((await api('DELETE', '/api/academy/terrain/' + id, null, jetons[SALARIE])).status, 403);

  // L'administrateur, lui, peut reprendre et supprimer.
  assert.strictEqual((await api('PUT', '/api/academy/terrain/' + id, {
    studioId: studioA, date: '2026-09-04', niveau: 'POSITIVE', observation: 'Repris par l\'admin.',
  }, jetons[ADMIN])).status, 200);
  assert.strictEqual((await api('DELETE', '/api/academy/terrain/' + id, null, jetons[ADMIN])).status, 200);
  assert.strictEqual((await api('DELETE', '/api/academy/terrain/' + id, null, jetons[ADMIN])).status, 404,
    'et une observation supprimée ne se supprime pas deux fois');
});

// ===========================================================================
//  6. RIEN N'EST DÉCLENCHÉ
// ===========================================================================

test('UN « ÉCART » NE DÉCLENCHE RIEN : aucune autre table ne bouge', async () => {
  const TABLES = ['academy_vus', 'academy_tentatives', 'academy_evaluations',
    'academy_certifications', 'boost_certifications', 'boost_collaborateurs', 'users'];
  const compter = () => Object.fromEntries(TABLES.map((t) => {
    let n = -1;
    try { n = dbq().prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n; } catch (_) { n = -1; }
    return [t, n];
  }));
  const avant = compter();
  const r = await creer(PILOTE, { studioId: studioA, salarie: SALARIE, date: '2026-09-04',
    niveau: 'ISSUE', observation: 'Le standard de suivi client en fin de séance n\'a pas été réalisé.' });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(compter(), avant,
    'ni parcours, ni QCM, ni certification, ni rôle ne doivent avoir bougé');
});

test('AUCUN SCORE N\'EST CALCULÉ : les compteurs sont quatre entiers, rien de plus', async () => {
  const l = await liste(PILOTE);
  const c = l.body.compteurs;
  assert.deepStrictEqual(Object.keys(c).sort(),
    ['ISSUE', 'OBSERVATION', 'POSITIVE', 'TO_CORRECT', 'total'].sort());
  for (const v of Object.values(c)) assert.strictEqual(Number.isInteger(v), true, 'des entiers, pas des moyennes');
  // Et rien qui ressemble à une note dans la réponse.
  assert.ok(!/score|moyenne|note|classement/i.test(l.txt), 'aucune note ne doit sortir de cette route');
});

test('un studio s\'ARCHIVE, il ne se supprime pas : les observations restent lisibles', async () => {
  await api('POST', '/api/academy/admin/studios/' + studioB + '/archiver', { archive: true }, jetons[ADMIN]);
  const l = await liste(PILOTE);
  assert.ok(!l.body.studios.some((s) => s.id === studioB), 'il quitte la saisie');
  assert.ok(l.body.observations.some((o) => o.studio === 'Studio Sud'),
    'mais l\'historique qui le cite reste lisible');
  await api('POST', '/api/academy/admin/studios/' + studioB + '/archiver', { archive: false }, jetons[ADMIN]);
});

// ===========================================================================
//  7. L'ÉCRAN
// ===========================================================================

test('l\'écran n\'invente aucune catégorie : quatre niveaux, et c\'est tout', () => {
  const bloc = js.slice(js.indexOf('// --- Suivi terrain'), js.indexOf('// --- Connexion'));
  assert.ok(bloc.length > 2000, 'l\'écran doit exister');
  assert.ok(/NIVEAUX_TERRAIN = \[/.test(bloc));
  for (const v of ['POSITIVE', 'TO_CORRECT', 'ISSUE', 'OBSERVATION']) {
    assert.ok(bloc.includes("'" + v + "'"), v + ' doit être un niveau de l\'écran');
  }
  // Aucune des catégories que le brief refuse explicitement.
  for (const interdit of ['Visite studio', 'Bonne pratique', 'Fait marquant', 'Observation managériale']) {
    assert.ok(!bloc.includes(interdit), '« ' + interdit + ' » ne doit pas devenir une catégorie');
  }
  // Aucun champ « titre » : le texte suffit.
  assert.ok(!/acTfTitre|>Titre</.test(bloc), 'pas de champ Titre — le commentaire suffit');
});

test('le niveau porte TOUJOURS son libellé, jamais la couleur seule', () => {
  const bloc = js.slice(js.indexOf('// --- Suivi terrain'), js.indexOf('// --- Connexion'));
  for (const libelle of ['Positif', 'À corriger', 'Écart', 'Observation']) {
    assert.ok(bloc.includes(libelle), '« ' + libelle + ' » doit être écrit');
  }
  // La pastille de la liste rend le libellé, pas seulement une classe de couleur.
  assert.ok(/ac-obs-niv[\s\S]{0,200}echapper\(libelle\)/.test(bloc));
});

test('la double soumission est gardée, et l\'écran n\'appelle que ses routes', () => {
  const bloc = js.slice(js.indexOf('// --- Suivi terrain'), js.indexOf('// --- Connexion'));
  assert.ok(/if \(terrainEnvoi\) return;/.test(bloc), 'un double clic ne doit pas créer deux observations');
  const appels = [...bloc.matchAll(/apiAc\('([^']+)'/g)].map((m) => m[1]);
  assert.ok(appels.length > 0);
  for (const a of appels) {
    assert.ok(/^\/api\/academy\/(terrain|admin\/(studios|terrain))/.test(a),
      'aucune autre route ne doit partir de cet écran : ' + a);
  }
});
