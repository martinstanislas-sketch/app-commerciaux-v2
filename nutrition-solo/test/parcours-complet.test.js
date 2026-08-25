'use strict';
// Test de bout en bout : le chemin réel d'un utilisateur, du premier écran au
// suivi de sa progression. Il tourne sur une base jetable (NUTRITION_DB) et
// démarre un vrai serveur — c'est ce qui permet de vérifier les statuts HTTP et
// les gardes d'accès, pas seulement la logique pure.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DB = path.join(os.tmpdir(), `nutri-solo-test-${process.pid}.sqlite`);
process.env.NUTRITION_DB = DB;
process.env.ADMIN_EMAIL = 'patron@exemple.fr';

const app = require('../server');
let srv, base;

test.before(async () => {
  app.amorcerFaq();
  await new Promise((r) => { srv = app.listen(0, r); });
  base = `http://127.0.0.1:${srv.address().port}`;
});

test.after(() => {
  if (srv) srv.close();
  require('../lib/db').closeDb();
  ['', '-wal', '-shm'].forEach((s) => { try { fs.unlinkSync(DB + s); } catch (_) {} });
});

// Petit client HTTP : le jeton est passé explicitement à chaque appel, pour
// qu'un test ne puisse pas hériter par accident de la session d'un autre.
async function api(methode, route, corps, jeton) {
  const res = await fetch(base + route, {
    method: methode,
    headers: {
      'Content-Type': 'application/json',
      ...(jeton ? { Authorization: 'Bearer ' + jeton } : {}),
    },
    body: corps === undefined || corps === null ? undefined : JSON.stringify(corps),
  });
  const txt = await res.text();
  let json = null;
  try { json = JSON.parse(txt); } catch (_) { /* réponse non JSON : json reste null */ }
  return { status: res.status, body: json, txt };
}

// --- Les quatre objectifs d'origine -----------------------------------------

test('les 4 objectifs d\'origine sont servis, et le challenge n\'existe plus', async () => {
  const profil = { sexe: 'femme', age: 34, taille_cm: 168, poids_kg: 70, activite: 'modere', repas_par_jour: 3 };
  const cibles = {};
  for (const objectif of ['perte', 'maintien', 'muscle', 'energie']) {
    const r = await api('POST', '/api/needs', { ...profil, objectif });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.besoins.objectif, objectif, `objectif ${objectif} conservé`);
    cibles[objectif] = r.body.besoins.kcalCible;
  }
  // Le sens de chaque objectif : perte < maintien < muscle. « énergie » ne
  // touche pas aux calories, il ne joue que sur la répartition des macros.
  assert.ok(cibles.perte < cibles.maintien, 'perte doit être sous le maintien');
  assert.ok(cibles.muscle > cibles.maintien, 'muscle doit être au-dessus du maintien');
  assert.strictEqual(cibles.energie, cibles.maintien, 'énergie garde la maintenance');

  // « challenge » n'est plus un objectif : il retombe sur le maintien.
  const ch = await api('POST', '/api/needs', { ...profil, objectif: 'challenge' });
  assert.strictEqual(ch.body.besoins.objectif, 'maintien');
});

// --- Inscription et connexion -----------------------------------------------

let jeton = '';

test('inscription en libre-service, sans code ni coach', async () => {
  // Sans PIN : l'app demande d'en choisir un, elle ne crée rien.
  const sansPin = await api('POST', '/account/login', { email: 'lea@exemple.fr', prenom: 'Léa' });
  assert.strictEqual(sansPin.body.besoinPin, true);
  assert.strictEqual(sansPin.body.ok, false);

  const cree = await api('POST', '/account/login', { email: 'lea@exemple.fr', prenom: 'Léa', pin: '4821' });
  assert.strictEqual(cree.status, 200);
  assert.strictEqual(cree.body.ok, true);
  assert.strictEqual(cree.body.nouveau, true);
  assert.ok(cree.body.token, 'un jeton de session est délivré');
  jeton = cree.body.token;

  // Le compte renvoyé ne doit jamais transporter le secret.
  assert.strictEqual(cree.body.compte.pin_hash, undefined);
  assert.strictEqual(cree.body.compte.email, 'lea@exemple.fr');
});

test('email invalide refusé', async () => {
  const r = await api('POST', '/account/login', { email: 'pas-un-email', pin: '1234' });
  assert.strictEqual(r.status, 400);
});

test('reconnexion : le bon PIN passe, le mauvais est compté', async () => {
  const ok = await api('POST', '/account/login', { email: 'lea@exemple.fr', pin: '4821' });
  assert.strictEqual(ok.body.ok, true);

  const ko = await api('POST', '/account/login', { email: 'lea@exemple.fr', pin: '0000' });
  assert.strictEqual(ko.status, 401);
  assert.strictEqual(ko.body.ok, false);
});

test('sans jeton, aucune donnée personnelle n\'est accessible', async () => {
  for (const route of ['/account/me', '/api/progression', '/api/scans', '/api/plate-analyses']) {
    const r = await api('GET', route);
    assert.strictEqual(r.status, 401, `${route} doit exiger un compte`);
    assert.strictEqual(r.body.noAccount, true);
  }
});

// --- Plan de la semaine ------------------------------------------------------

test('génération du plan de la semaine, allergène exclu', async () => {
  const r = await api('POST', '/api/plan', {
    profil: { sexe: 'femme', age: 34, taille_cm: 168, poids_kg: 70, activite: 'modere', objectif: 'perte', repas_par_jour: 3 },
    preferences: { allergies: ['arachide'], cuisines: ['francaise'], tempsMax: 30 },
    seed: 42,
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.ok, true);
  assert.strictEqual(r.body.plan.jours.length, 7, 'une semaine complète');

  // Sécurité allergies : rien contenant de l'arachide ne doit sortir.
  const texte = JSON.stringify(r.body.plan).toLowerCase();
  assert.ok(!texte.includes('arachide'), 'aucune trace de l\'allergène déclaré');
});

test('un repas se remplace tout seul', async () => {
  const r = await api('POST', '/api/meal', {
    profil: { sexe: 'homme', age: 40, taille_cm: 180, poids_kg: 85, activite: 'leger', objectif: 'muscle' },
    preferences: {},
    creneau: 'dejeuner', kcalCible: 700, seed: 7,
  });
  assert.strictEqual(r.body.ok, true);
  assert.ok(r.body.recette && r.body.recette.nom, 'une recette est renvoyée');
});

// --- Progression personnelle -------------------------------------------------

test('pesées libres : pas de jalon imposé, la courbe se construit seule', async () => {
  await api('POST', '/api/progression/pesee', { date: '2026-08-01', poids: 70.4 }, jeton);
  await api('POST', '/api/progression/pesee', { date: '2026-08-10', poids: 69.1 }, jeton);
  await api('POST', '/api/progression/pesee', { date: '2026-08-20', poids: 68.2, masseGrasse: 22.5 }, jeton);

  const r = await api('GET', '/api/progression', null, jeton);
  assert.strictEqual(r.body.ok, true);
  assert.strictEqual(r.body.progression.pesees.length, 3);
  assert.strictEqual(r.body.progression.depart, 70.4);
  assert.strictEqual(r.body.progression.actuel, 68.2);
  assert.strictEqual(r.body.progression.variation, -2.2);
});

test('une deuxième pesée le même jour corrige la première', async () => {
  await api('POST', '/api/progression/pesee', { date: '2026-08-20', poids: 68.6 }, jeton);
  const r = await api('GET', '/api/progression', null, jeton);
  assert.strictEqual(r.body.progression.pesees.length, 3, 'toujours 3 pesées, pas 4');
  assert.strictEqual(r.body.progression.actuel, 68.6);
});

test('poids aberrant refusé', async () => {
  const r = await api('POST', '/api/progression/pesee', { poids: 800 }, jeton);
  assert.strictEqual(r.status, 400);
});

test('mensurations : au moins une mesure exigée', async () => {
  const vide = await api('POST', '/api/progression/mensuration', { date: '2026-08-20' }, jeton);
  assert.strictEqual(vide.status, 400);

  const ok = await api('POST', '/api/progression/mensuration', { date: '2026-08-20', taille: 78, hanches: 96 }, jeton);
  assert.strictEqual(ok.body.ok, true);

  const r = await api('GET', '/api/progression', null, jeton);
  assert.strictEqual(r.body.progression.mensurations.length, 1);
  assert.strictEqual(r.body.progression.mensurations[0].taille, 78);
});

// --- Cloisonnement : le point le plus important de cette version -------------

test('une photo de progression n\'est lisible QUE par son propriétaire', async () => {
  // 1x1 px PNG transparent — assez pour valider le chemin de bout en bout.
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const envoi = await api('POST', '/api/progression/photo', { imageDataUrl: png, type: 'face' }, jeton);
  assert.strictEqual(envoi.body.ok, true);
  const id = envoi.body.id;

  // Son propriétaire la lit.
  const mienne = await fetch(`${base}/api/progression/photo/${id}`, { headers: { Authorization: 'Bearer ' + jeton } });
  assert.strictEqual(mienne.status, 200);
  assert.strictEqual(mienne.headers.get('content-type'), 'image/png');

  // Sans jeton : refusé.
  const anonyme = await fetch(`${base}/api/progression/photo/${id}`);
  assert.strictEqual(anonyme.status, 401);

  // Un AUTRE compte connecté : introuvable (et non « interdit » — on ne révèle
  // même pas que la photo existe).
  const autre = await api('POST', '/account/login', { email: 'marc@exemple.fr', prenom: 'Marc', pin: '9930' });
  const chezMoi = await fetch(`${base}/api/progression/photo/${id}`, { headers: { Authorization: 'Bearer ' + autre.body.token } });
  assert.strictEqual(chezMoi.status, 404);

  // Et sa progression à lui est vide : aucune fuite entre comptes.
  const p = await api('GET', '/api/progression', null, autre.body.token);
  assert.strictEqual(p.body.progression.pesees.length, 0);
  assert.strictEqual(p.body.progression.photos.length, 0);
});

test('on ne peut pas supprimer la pesée de quelqu\'un d\'autre', async () => {
  const autre = await api('POST', '/account/login', { email: 'marc@exemple.fr', pin: '9930' });
  const mienne = await api('GET', '/api/progression', null, jeton);
  const idCible = mienne.body.progression.pesees[0].id;

  const tentative = await api('DELETE', `/api/progression/pesee/${idCible}`, null, autre.body.token);
  assert.strictEqual(tentative.body.ok, false, 'la suppression ne mord pas');

  const apres = await api('GET', '/api/progression', null, jeton);
  assert.strictEqual(apres.body.progression.pesees.length, 3, 'la pesée est toujours là');
});

// --- Adhérence ---------------------------------------------------------------

test('adhérence : une ligne par jour, réécrite à chaque envoi', async () => {
  await api('POST', '/api/adherence', { date: '2026-08-24', suivi: 2, adapte: 1, autre: 0, saute: 0, score: 92 }, jeton);
  await api('POST', '/api/adherence', { date: '2026-08-24', suivi: 3, adapte: 0, autre: 0, saute: 0, score: 100 }, jeton);
  await api('POST', '/api/adherence', { date: '2026-08-25', suivi: 1, adapte: 0, autre: 1, saute: 1, score: 50 }, jeton);

  const r = await api('GET', '/api/adherence', null, jeton);
  assert.strictEqual(r.body.jours.length, 2, 'deux jours, pas trois enregistrements');
  const j24 = r.body.jours.find((j) => j.date === '2026-08-24');
  assert.strictEqual(j24.score, 100, 'le dernier envoi fait foi');
});

// --- SOS coach ---------------------------------------------------------------

test('le SOS coach répond sans IA grâce à la FAQ', async () => {
  const r = await api('POST', '/api/coach-faq/match', { question: 'j\'ai faim entre les repas' });
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.match, 'une réponse préenregistrée est trouvée');
  assert.ok(r.body.match.reponse.length > 20);

  const sugg = await api('GET', '/api/coach-faq/suggest');
  assert.ok(sugg.body.questions.length > 0, 'des questions sont proposées');
  assert.ok(sugg.body.questions.length <= 6);
});

test('sans clé API, le coach IA le dit au lieu de planter', async () => {
  const r = await api('POST', '/api/coach', { messages: [{ role: 'user', content: 'Bonjour' }] });
  assert.strictEqual(r.body.ok, false);
  assert.strictEqual(r.body.ia, false);
});

// --- Administration ----------------------------------------------------------

test('les routes admin sont fermées à un compte normal', async () => {
  for (const route of ['/api/recipes-list', '/api/coach-faq']) {
    const r = await api('GET', route, null, jeton);
    assert.strictEqual(r.status, 403, `${route} doit être réservée à l'admin`);
  }
});

test('le compte administrateur, lui, y accède', async () => {
  const adm = await api('POST', '/account/login', { email: 'patron@exemple.fr', prenom: 'Patron', pin: '7777' });
  assert.strictEqual(adm.body.compte.admin, true);
  const r = await api('GET', '/api/recipes-list', null, adm.body.token);
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.total > 100, 'le catalogue de recettes est bien là');
});

// --- Fin de vie du compte ----------------------------------------------------

test('déconnexion : le jeton ne vaut plus rien', async () => {
  const s = await api('POST', '/account/login', { email: 'jetable@exemple.fr', prenom: 'Jetable', pin: '1122' });
  const t = s.body.token;
  assert.strictEqual((await api('GET', '/account/me', null, t)).status, 200);
  await api('POST', '/account/logout', {}, t);
  assert.strictEqual((await api('GET', '/account/me', null, t)).status, 401);
});

test('suppression du compte : tout part avec lui', async () => {
  const s = await api('POST', '/account/login', { email: 'partir@exemple.fr', prenom: 'Partir', pin: '3344' });
  const t = s.body.token;
  await api('POST', '/api/progression/pesee', { poids: 80 }, t);
  await api('DELETE', '/account', null, t);

  // Le compte n'existe plus : se reconnecter avec le même email crée un espace neuf.
  const neuf = await api('POST', '/account/login', { email: 'partir@exemple.fr', prenom: 'Partir', pin: '5566' });
  assert.strictEqual(neuf.body.nouveau, true, 'c\'est bien une nouvelle inscription');
  const p = await api('GET', '/api/progression', null, neuf.body.token);
  assert.strictEqual(p.body.progression.pesees.length, 0, 'aucune donnée de l\'ancien compte');
});

// --- Routes inconnues --------------------------------------------------------

test('une route /api inconnue répond en JSON, pas en HTML', async () => {
  const r = await api('GET', '/api/parcours');   // route du Protocole 42, retirée ici
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.body.ok, false, 'le front reçoit du JSON exploitable');
});
