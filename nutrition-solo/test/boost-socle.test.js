'use strict';
// ============================================================================
//  BOOST NUTRITION — tests du socle.
//
//  Comme test/parcours-complet.test.js : base jetable + VRAI serveur, pour
//  vérifier les statuts HTTP et les gardes d'accès, pas seulement la logique.
//
//  Deux choses sont testées différemment du reste :
//   - le TEMPS. Les 16 semaines et l'expiration ne se testent pas en attendant
//     quatre mois. Les fonctions du module acceptent un paramètre `jour`, ce qui
//     permet de démarrer un Boost à une date passée, puis de relire le dossier
//     par HTTP — donc avec l'horloge réelle — et de constater l'expiration.
//     C'est le vrai chemin de lecture qui est éprouvé, pas une simulation ;
//   - le CLOISONNEMENT, qui a sa propre section. C'est le point où une erreur ne
//     se voit pas à l'usage mais coûte cher : un dossier client lisible par le
//     mauvais coach ne provoque aucun bug visible.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DB = path.join(os.tmpdir(), `nutri-boost-test-${process.pid}.sqlite`);
process.env.NUTRITION_DB = DB;
process.env.ADMIN_EMAIL = 'patron@exemple.fr';

const app = require('../server');
const B = require('../lib/boost');
let srv, base;

// Comptes du scénario. Un client par situation : la règle « un seul Boost actif »
// interdit de rejouer plusieurs cycles de vie sur le même client.
const ADMIN = 'patron@exemple.fr';
const COACH1 = 'quentin@exemple.fr';       // collaborateur certifié
const COACH2 = 'sophie@exemple.fr';        // collaborateur certifié, autre portefeuille
const COLLAB3 = 'theo@exemple.fr';         // collaborateur NON certifié
const LEA = 'lea@exemple.fr';              // parcours nominal, 12 Étapes
const MARC = 'marc@exemple.fr';            // expiration puis prolongation
const NORA = 'nora@exemple.fr';            // interruption puis rachat
const PAUL = 'paul@exemple.fr';            // cloisonnement
const HUGO = 'hugo@exemple.fr';            // prolongation insuffisante

const jetons = {};

const jour = (decalage) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + Number(decalage || 0));
  return d.toISOString().slice(0, 10);
};

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
  try { json = JSON.parse(txt); } catch (_) { /* non JSON */ }
  return { status: res.status, body: json, txt };
}

async function connecter(email, pin) {
  const r = await api('POST', '/account/login', { email, prenom: email.split('@')[0], pin });
  assert.ok(r.body && r.body.token, `connexion ${email} : jeton attendu`);
  jetons[email] = r.body.token;
  return r.body.token;
}

test.before(async () => {
  await new Promise((r) => { srv = app.listen(0, r); });
  base = `http://127.0.0.1:${srv.address().port}`;
  // Un compte créé AVANT que le schéma Boost n'existe : c'est le cas de tous les
  // comptes déjà en production. Il doit survivre à l'ajout de la colonne `role`.
  await connecter(LEA, '1001');
  app.boost.assurerSchema();
  for (const [email, pin] of [[ADMIN, '7777'], [COACH1, '2002'], [COACH2, '3003'],
    [COLLAB3, '4004'], [MARC, '5005'], [NORA, '6006'], [PAUL, '8008'], [HUGO, '9009']]) {
    await connecter(email, pin);
  }
});

test.after(() => {
  if (srv) srv.close();
  require('../lib/db').closeDb();
  ['', '-wal', '-shm'].forEach((s) => { try { fs.unlinkSync(DB + s); } catch (_) {} });
});

// ===========================================================================
//  NON-RÉGRESSION — le socle Boost ne doit rien avoir cassé
// ===========================================================================

test('non-régression : un compte créé avant le schéma Boost reste intact', async () => {
  // Léa s'est inscrite avant que la moindre table Boost n'existe.
  const me = await api('GET', '/account/me', null, jetons[LEA]);
  assert.strictEqual(me.status, 200);
  assert.strictEqual(me.body.compte.email, LEA);
  // Son rôle est CALCULÉ, pas stocké : aucune ligne n'a eu besoin d'être créée
  // ni modifiée pour qu'elle soit reconnue comme cliente.
  assert.strictEqual(app.boost.lireUtilisateur(LEA).role, B.ROLE_CLIENT);
});

// ===========================================================================
//  SCHÉMA PUREMENT ADDITIF — la garantie architecturale
//
//  Le socle Boost ne doit RIEN ajouter ni modifier dans les tables existantes.
//  Deux vérifications complémentaires : la forme de `users` (ses colonnes), et
//  le contenu d'un enregistrement réel, comparé à l'octet près après un cycle
//  de vie Boost complet.
// ===========================================================================

// Les 12 colonnes déclarées dans lib/db.js, ni plus ni moins. Ce tableau est
// volontairement écrit en dur : si un jour quelqu'un ajoute une colonne à
// `users` pour le Boost, ce test tombe, et c'est exactement le but.
const COLONNES_USERS = ['email', 'prenom', 'pin_hash', 'pin_fails', 'bloque',
  'avatar_config', 'profil', 'preferences', 'plan', 'plan_maj', 'cree_le', 'vu_le'];

let empreinteLea = null;

test('la table users garde exactement ses colonnes d\'origine', () => {
  const db = require('../lib/db').getDb();
  const colonnes = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  assert.deepStrictEqual(colonnes, COLONNES_USERS,
    'aucune colonne ajoutée à users pour le Boost');

  // Empreinte de l'enregistrement de Léa, prise AVANT toute opération Boost.
  // Elle sera recomparée en fin de suite, après un cycle complet.
  empreinteLea = db.prepare('SELECT * FROM users WHERE email = ?').get(LEA);
  assert.ok(empreinteLea, 'le compte témoin existe');
});

test('aucun ALTER TABLE users dans le code du Boost', () => {
  // Garde de niveau source : la contrainte est architecturale, elle ne doit pas
  // pouvoir être contournée par une migration glissée plus tard dans un coin.
  for (const fichier of ['../lib/boost.js', '../lib/boostRoutes.js']) {
    const code = fs.readFileSync(path.join(__dirname, fichier), 'utf8');
    assert.ok(!/ALTER\s+TABLE/i.test(code), `${fichier} ne contient aucun ALTER TABLE`);
    // Ni écriture d'aucune sorte dans les tables du socle nutrition.
    assert.ok(!/UPDATE\s+users|INSERT\s+INTO\s+users|DELETE\s+FROM\s+users/i.test(code),
      `${fichier} n'écrit jamais dans users`);
  }
});

test('non-régression : inscription, plan et progression fonctionnent toujours', async () => {
  const neuf = await api('POST', '/account/login', { email: 'temoin@exemple.fr', prenom: 'Témoin', pin: '1212' });
  assert.strictEqual(neuf.body.ok, true);
  assert.strictEqual(neuf.body.nouveau, true);

  const besoins = await api('POST', '/api/needs', {
    sexe: 'femme', age: 34, taille_cm: 168, poids_kg: 70, activite: 'modere', objectif: 'perte',
  });
  assert.strictEqual(besoins.status, 200);
  assert.ok(besoins.body.besoins.kcalCible > 0, 'le moteur calorique répond comme avant');

  await api('POST', '/api/progression/pesee', { date: '2026-08-01', poids: 70.4 }, neuf.body.token);
  const p = await api('GET', '/api/progression', null, neuf.body.token);
  assert.strictEqual(p.body.progression.pesees.length, 1);
});

test('non-régression : une route /api/boost inconnue répond en JSON', async () => {
  const r = await api('GET', '/api/boost/nimporte-quoi', null, jetons[ADMIN]);
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.body.ok, false, 'le front reçoit du JSON, pas du HTML');
});

// ===========================================================================
//  RÔLES ET CERTIFICATION
// ===========================================================================

test('désigner un collaborateur : le compte doit exister au préalable', async () => {
  // Aucun second système d'authentification : on ne crée pas de compte ici.
  const fantome = await api('POST', '/api/boost/admin/collaborateurs',
    { email: 'personne@exemple.fr', role: 'collaborateur' }, jetons[ADMIN]);
  assert.strictEqual(fantome.status, 404);

  for (const email of [COACH1, COACH2, COLLAB3]) {
    const r = await api('POST', '/api/boost/admin/collaborateurs', { email, role: 'collaborateur' }, jetons[ADMIN]);
    assert.strictEqual(r.status, 200, `${email} devient collaborateur`);
    assert.strictEqual(r.body.collaborateur.role, B.ROLE_COLLABORATEUR);
  }
});

test('certifier : évaluateur obligatoire, score borné, verdict conservé', async () => {
  const sansEvaluateur = await api('PUT', `/api/boost/admin/certification/${COACH1}`,
    { statut: 'certifie', scoreQcm: 88 }, jetons[ADMIN]);
  assert.strictEqual(sansEvaluateur.status, 400, 'on ne certifie pas anonymement');

  const scoreFou = await api('PUT', `/api/boost/admin/certification/${COACH1}`,
    { statut: 'certifie', evaluateur: 'Stan', scoreQcm: 250 }, jetons[ADMIN]);
  assert.strictEqual(scoreFou.status, 400);

  const pratiqueInconnue = await api('PUT', `/api/boost/admin/certification/${COACH1}`,
    { statut: 'certifie', evaluateur: 'Stan', resultatPratique: 'peut-etre' }, jetons[ADMIN]);
  assert.strictEqual(pratiqueInconnue.status, 400);

  // Les 5 informations que l'app conserve du parcours Academy, et rien de plus.
  const ok = await api('PUT', `/api/boost/admin/certification/${COACH1}`, {
    statut: 'certifie', evaluateur: 'Stan Martin', dateCertification: '2026-07-15',
    scoreQcm: 88, resultatPratique: 'valide',
  }, jetons[ADMIN]);
  assert.strictEqual(ok.status, 200);
  const c = ok.body.certification;
  assert.strictEqual(c.statut, B.CERT_OK);
  assert.strictEqual(c.dateCertification, '2026-07-15');
  assert.strictEqual(c.evaluateur, 'Stan Martin');
  assert.strictEqual(c.scoreQcm, 88);
  assert.strictEqual(c.resultatPratique, 'valide');

  await api('PUT', `/api/boost/admin/certification/${COACH2}`,
    { statut: 'certifie', evaluateur: 'Stan Martin', scoreQcm: 91, resultatPratique: 'valide' }, jetons[ADMIN]);
  // Theo reste explicitement non certifié : c'est lui qui éprouve le refus.
  await api('PUT', `/api/boost/admin/certification/${COLLAB3}`,
    { statut: 'en_cours', evaluateur: 'Stan Martin', scoreQcm: 62 }, jetons[ADMIN]);
});

test('un compte qui n\'est pas collaborateur ne peut pas être certifié', async () => {
  const r = await api('PUT', `/api/boost/admin/certification/${LEA}`,
    { statut: 'certifie', evaluateur: 'Stan' }, jetons[ADMIN]);
  assert.strictEqual(r.status, 409);
});

test('sans ligne de certification, le statut lu est « non certifié »', () => {
  // Un trou en base ne doit jamais s'interpréter comme un droit accordé.
  assert.strictEqual(app.boost.lireCertification('inconnu@exemple.fr').statut, B.CERT_NON);
  assert.strictEqual(app.boost.estCoachCertifie('inconnu@exemple.fr'), false);
});

// ===========================================================================
//  CRÉATION D'UN BOOST ET ATTRIBUTION
// ===========================================================================

const dossiers = {};

test('création manuelle par l\'admin : 12 Étapes, à démarrer, chrono non armé', async () => {
  const r = await api('POST', '/api/boost/admin/dossiers',
    { clientEmail: LEA, referenceExterne: 'FACTURE-2026-0042' }, jetons[ADMIN]);
  assert.strictEqual(r.status, 201);
  const b = r.body.boost;
  dossiers[LEA] = b.id;

  assert.strictEqual(b.statut, B.STATUT_A_DEMARRER);
  assert.strictEqual(b.etapes.length, 12, 'les 12 Étapes existent dès la création');
  assert.strictEqual(b.etapesValidees, 0);
  assert.strictEqual(b.etapeCourante, 1);
  // Les 16 semaines partent de l'Étape 1, pas de l'achat.
  assert.strictEqual(b.demarreLe, null);
  assert.strictEqual(b.echeanceLe, null);
  // Aucun paiement branché, mais la référence externe est déjà transportée.
  assert.strictEqual(b.referenceExterne, 'FACTURE-2026-0042');
  assert.strictEqual(b.coachEmail, null);
});

test('un client n\'a qu\'un seul Boost actif à la fois', async () => {
  const doublon = await api('POST', '/api/boost/admin/dossiers', { clientEmail: LEA }, jetons[ADMIN]);
  assert.strictEqual(doublon.status, 409);
  assert.strictEqual(doublon.body.boostId, dossiers[LEA]);
});

test('la règle « un seul Boost actif » tient aussi au niveau de la base', () => {
  // Garde-fou de dernier recours : même en contournant le contrôle applicatif,
  // l'index unique partiel refuse un second dossier actif.
  const db = require('../lib/db').getDb();
  assert.throws(() => {
    db.prepare('INSERT INTO boosts (client_email, statut, cree_le) VALUES (?, ?, ?)')
      .run(LEA, B.STATUT_EN_COURS, new Date().toISOString());
  }, /UNIQUE|constraint/i);
});

test('un collaborateur ne peut pas recevoir de Boost en tant que client', async () => {
  const r = await api('POST', '/api/boost/admin/dossiers', { clientEmail: COACH1 }, jetons[ADMIN]);
  assert.strictEqual(r.status, 409);
});

test('attribution : refusée vers un collaborateur non certifié, acceptée vers un certifié', async () => {
  const refus = await api('POST', `/api/boost/admin/dossiers/${dossiers[LEA]}/coach`,
    { coachEmail: COLLAB3 }, jetons[ADMIN]);
  assert.strictEqual(refus.status, 409, 'Theo n\'est pas certifié');

  const inconnu = await api('POST', `/api/boost/admin/dossiers/${dossiers[LEA]}/coach`,
    { coachEmail: LEA }, jetons[ADMIN]);
  assert.strictEqual(inconnu.status, 409, 'un client n\'est pas un Coach Nutrition');

  const ok = await api('POST', `/api/boost/admin/dossiers/${dossiers[LEA]}/coach`,
    { coachEmail: COACH1 }, jetons[ADMIN]);
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.body.boost.coachEmail, COACH1);
});

// ===========================================================================
//  CLOISONNEMENT — la section qui compte
// ===========================================================================

test('le client ne voit QUE son dossier, sans jamais nommer d\'email', async () => {
  const mien = await api('GET', '/api/boost/mien', null, jetons[LEA]);
  assert.strictEqual(mien.status, 200);
  assert.strictEqual(mien.body.actuel.id, dossiers[LEA]);

  // Un autre client : dossier vide, et surtout aucune trace de celui de Léa.
  const autre = await api('GET', '/api/boost/mien', null, jetons[PAUL]);
  assert.strictEqual(autre.status, 200);
  assert.strictEqual(autre.body.actuel, null);
  assert.strictEqual(autre.body.historique.length, 0);
  assert.ok(!autre.txt.includes(LEA), 'aucune fuite d\'un dossier tiers');
});

test('sans jeton, aucune route Boost ne répond', async () => {
  const routes = [
    ['GET', '/api/boost/mien'],
    ['GET', '/api/boost/coach/dossiers'],
    ['GET', '/api/boost/admin/dossiers'],
    ['GET', `/api/boost/admin/dossiers/${dossiers[LEA]}`],
  ];
  for (const [m, route] of routes) {
    const r = await api(m, route);
    assert.strictEqual(r.status, 401, `${route} doit exiger un compte`);
  }
});

test('un collaborateur NON certifié n\'accède à aucun dossier', async () => {
  const liste = await api('GET', '/api/boost/coach/dossiers', null, jetons[COLLAB3]);
  assert.strictEqual(liste.status, 403, 'un refus franc, pas une liste vide');
  assert.strictEqual(liste.body.nonCertifie, true);
  assert.strictEqual(liste.body.certification, B.CERT_EN_COURS);

  const detail = await api('GET', `/api/boost/coach/dossiers/${dossiers[LEA]}`, null, jetons[COLLAB3]);
  assert.strictEqual(detail.status, 403);

  const validation = await api('POST', `/api/boost/coach/dossiers/${dossiers[LEA]}/etapes/1/valider`, {}, jetons[COLLAB3]);
  assert.strictEqual(validation.status, 403);
});

test('un client ne passe pas par la porte des coachs', async () => {
  const r = await api('GET', '/api/boost/coach/dossiers', null, jetons[LEA]);
  assert.strictEqual(r.status, 403);
});

test('un Coach Nutrition certifié ne voit QUE les dossiers qui lui sont attribués', async () => {
  const sien = await api('GET', '/api/boost/coach/dossiers', null, jetons[COACH1]);
  assert.strictEqual(sien.status, 200);
  assert.deepStrictEqual(sien.body.dossiers.map((d) => d.id), [dossiers[LEA]]);

  // Sophie est certifiée, mais ce dossier n'est pas le sien.
  const chezElle = await api('GET', '/api/boost/coach/dossiers', null, jetons[COACH2]);
  assert.strictEqual(chezElle.body.dossiers.length, 0);

  // 404 et non 403 : un 403 confirmerait que le dossier existe.
  const vol = await api('GET', `/api/boost/coach/dossiers/${dossiers[LEA]}`, null, jetons[COACH2]);
  assert.strictEqual(vol.status, 404);
  assert.ok(!vol.txt.includes(LEA), 'le refus ne dit rien du dossier');
});

test('un Coach Nutrition ne valide pas une Étape chez un confrère', async () => {
  const r = await api('POST', `/api/boost/coach/dossiers/${dossiers[LEA]}/etapes/1/valider`, {}, jetons[COACH2]);
  assert.strictEqual(r.status, 404);
});

test('les routes d\'administration sont fermées aux clients et aux coachs', async () => {
  const routes = [
    ['GET', '/api/boost/admin/dossiers'],
    ['GET', '/api/boost/admin/collaborateurs'],
    ['POST', '/api/boost/admin/dossiers'],
    ['GET', `/api/boost/admin/dossiers/${dossiers[LEA]}/journal`],
  ];
  for (const jeton of [jetons[LEA], jetons[COACH1], jetons[COLLAB3]]) {
    for (const [m, route] of routes) {
      // Pas de corps sur un GET : fetch le refuse avant même de partir.
      const r = await api(m, route, m === 'POST' ? {} : null, jeton);
      assert.strictEqual(r.status, 403, `${m} ${route} doit rester à l'admin`);
    }
  }
});

test('l\'admin administre mais n\'anime pas : il ne valide aucune Étape', async () => {
  // Il n'existe aucune route admin de validation, et la porte coach lui est
  // fermée : l'admin n'est pas un collaborateur.
  const r = await api('POST', `/api/boost/coach/dossiers/${dossiers[LEA]}/etapes/1/valider`, {}, jetons[ADMIN]);
  assert.strictEqual(r.status, 403);
});

test('retirer la certification ferme l\'accès immédiatement, sans défaire l\'attribution', async () => {
  await api('PUT', `/api/boost/admin/certification/${COACH1}`,
    { statut: 'suspendu', evaluateur: 'Stan Martin' }, jetons[ADMIN]);

  const ferme = await api('GET', '/api/boost/coach/dossiers', null, jetons[COACH1]);
  assert.strictEqual(ferme.status, 403);
  assert.strictEqual(ferme.body.nonCertifie, true);

  // Le dossier, lui, n'a pas bougé : il reste attribué, visible de l'admin.
  const vueAdmin = await api('GET', `/api/boost/admin/dossiers/${dossiers[LEA]}`, null, jetons[ADMIN]);
  assert.strictEqual(vueAdmin.body.boost.coachEmail, COACH1);

  // Rétablissement : l'accès revient sans retoucher l'attribution.
  await api('PUT', `/api/boost/admin/certification/${COACH1}`, {
    statut: 'certifie', evaluateur: 'Stan Martin', dateCertification: '2026-07-15',
    scoreQcm: 88, resultatPratique: 'valide',
  }, jetons[ADMIN]);
  const rouvert = await api('GET', '/api/boost/coach/dossiers', null, jetons[COACH1]);
  assert.strictEqual(rouvert.status, 200);
  assert.strictEqual(rouvert.body.dossiers.length, 1);
});

// ===========================================================================
//  LES 12 ÉTAPES ET LA RÈGLE DES 16 SEMAINES
// ===========================================================================

test('on ne saute pas d\'Étape', async () => {
  const r = await api('POST', `/api/boost/coach/dossiers/${dossiers[LEA]}/etapes/2/valider`, {}, jetons[COACH1]);
  assert.strictEqual(r.status, 409);

  const horsBornes = await api('POST', `/api/boost/coach/dossiers/${dossiers[LEA]}/etapes/13/valider`, {}, jetons[COACH1]);
  assert.strictEqual(horsBornes.status, 400);
});

// Depuis que l'Étape 1 porte un rendez-vous, elle se valide par S1 et non plus
// par la route générique. Ce test vérifie toujours la même chose — la règle des
// 16 semaines du socle — mais par le chemin réel.
const S1_MINIMAL = {
  donnees: { objectif: { choix: 'perte', texte: '' }, journalPhotoExplique: true },
  action: { intitule: 'Ajouter une source de protéines au petit-déjeuner' },
};

test('la route générique ne valide plus une Étape qui porte un rendez-vous', async () => {
  const r = await api('POST', `/api/boost/coach/dossiers/${dossiers[LEA]}/etapes/1/valider`, {}, jetons[COACH1]);
  assert.strictEqual(r.status, 409, 'la porte dérobée est fermée');
  assert.strictEqual(r.body.seanceRequise, true);

  // Et elle n'a rien validé au passage.
  const b = await api('GET', `/api/boost/coach/dossiers/${dossiers[LEA]}`, null, jetons[COACH1]);
  assert.strictEqual(b.body.boost.etapesValidees, 0);
  assert.strictEqual(b.body.boost.statut, B.STATUT_A_DEMARRER);
  assert.strictEqual(b.body.boost.demarreLe, null, 'les 16 semaines ne sont pas armées');
});

test('la validation de l\'Étape 1 arme les 16 semaines', async () => {
  const r = await api('POST', `/api/boost/coach/dossiers/${dossiers[LEA]}/seances/1/valider`, S1_MINIMAL, jetons[COACH1]);
  assert.strictEqual(r.status, 200);
  const b = r.body.boost;

  assert.strictEqual(b.statut, B.STATUT_EN_COURS);
  assert.strictEqual(b.demarreLe, jour(0));
  // 16 semaines = 112 jours, comptés depuis l'Étape 1.
  assert.strictEqual(b.echeanceLe, B.ajouterJours(jour(0), 112));
  assert.strictEqual(b.joursRestants, 112);
  assert.strictEqual(b.etapesValidees, 1);
  assert.strictEqual(b.etapeCourante, 2);
  assert.strictEqual(b.etapes[0].valideePar, COACH1, 'la validation est attribuée à son auteur');
});

test('une Étape déjà validée ne se revalide pas', async () => {
  const r = await api('POST', `/api/boost/coach/dossiers/${dossiers[LEA]}/seances/1/valider`, S1_MINIMAL, jetons[COACH1]);
  assert.strictEqual(r.status, 409);
});

test('l\'Étape 12 termine le Boost et libère la place pour un nouveau', async () => {
  for (let n = 2; n <= 12; n++) {
    const r = await api('POST', `/api/boost/coach/dossiers/${dossiers[LEA]}/etapes/${n}/valider`, {}, jetons[COACH1]);
    assert.strictEqual(r.status, 200, `Étape ${n}/12`);
  }
  const fin = await api('GET', `/api/boost/admin/dossiers/${dossiers[LEA]}`, null, jetons[ADMIN]);
  const b = fin.body.boost;
  assert.strictEqual(b.statut, B.STATUT_TERMINE);
  assert.strictEqual(b.etapesValidees, 12);
  assert.strictEqual(b.etapeCourante, null);
  assert.strictEqual(b.actif, false);

  // Arbitrage n°4 : un nouveau Boost est possible après un Boost terminé.
  const rachat = await api('POST', '/api/boost/admin/dossiers', { clientEmail: LEA, coachEmail: COACH1 }, jetons[ADMIN]);
  assert.strictEqual(rachat.status, 201);

  // Le client voit le nouveau en cours, l'ancien en historique.
  const vue = await api('GET', '/api/boost/mien', null, jetons[LEA]);
  assert.strictEqual(vue.body.actuel.id, rachat.body.boost.id);
  assert.strictEqual(vue.body.historique.length, 1);
  assert.strictEqual(vue.body.historique[0].statut, B.STATUT_TERMINE);
});

test('un Boost terminé ne se rouvre pas par une Étape', async () => {
  const r = await api('POST', `/api/boost/coach/dossiers/${dossiers[LEA]}/etapes/12/valider`, {}, jetons[COACH1]);
  assert.strictEqual(r.status, 409);
});

// ===========================================================================
//  EXPIRATION ET PROLONGATION EXCEPTIONNELLE
// ===========================================================================

test('passé 16 semaines, le Boost expire de lui-même à la première lecture', async () => {
  const cree = await api('POST', '/api/boost/admin/dossiers', { clientEmail: MARC, coachEmail: COACH1 }, jetons[ADMIN]);
  dossiers[MARC] = cree.body.boost.id;
  // Étape 1 validée il y a 120 jours : l'échéance (112 j) est dépassée de 8 jours.
  app.boost.validerEtape(dossiers[MARC], 1, COACH1, jour(-120));

  // Lecture par le chemin réel, avec l'horloge réelle.
  const vue = await api('GET', '/api/boost/mien', null, jetons[MARC]);
  assert.strictEqual(vue.body.actuel, null, 'un Boost expiré n\'est plus le Boost actif');
  assert.strictEqual(vue.body.historique[0].statut, B.STATUT_EXPIRE);
  assert.strictEqual(vue.body.historique[0].joursRestants, -8);
});

test('un Boost expiré n\'accepte plus d\'Étape', async () => {
  const r = await api('POST', `/api/boost/coach/dossiers/${dossiers[MARC]}/etapes/2/valider`, {}, jetons[COACH1]);
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.body.statut, B.STATUT_EXPIRE);
});

test('prolonger exige un motif explicite et une durée sensée', async () => {
  const sansMotif = await api('POST', `/api/boost/admin/dossiers/${dossiers[MARC]}/prolongation`,
    { semaines: 4 }, jetons[ADMIN]);
  assert.strictEqual(sansMotif.status, 400);

  const motifCreux = await api('POST', `/api/boost/admin/dossiers/${dossiers[MARC]}/prolongation`,
    { semaines: 4, motif: 'ok' }, jetons[ADMIN]);
  assert.strictEqual(motifCreux.status, 400, 'un motif doit être un motif');

  const dureeFolle = await api('POST', `/api/boost/admin/dossiers/${dossiers[MARC]}/prolongation`,
    { semaines: 0, motif: 'Arrêt maladie documenté du client.' }, jetons[ADMIN]);
  assert.strictEqual(dureeFolle.status, 400);
});

test('la prolongation rouvre un Boost expiré, datée, motivée et attribuée', async () => {
  const r = await api('POST', `/api/boost/admin/dossiers/${dossiers[MARC]}/prolongation`,
    { semaines: 4, motif: 'Arrêt maladie de 3 semaines, justificatif reçu le 12/08.' }, jetons[ADMIN]);
  assert.strictEqual(r.status, 200);
  const b = r.body.boost;

  assert.strictEqual(b.statut, B.STATUT_EN_COURS, 'le Boost est rouvert');
  // L'échéance se recalcule TOUJOURS depuis l'Étape 1 : 16 + 4 semaines.
  assert.strictEqual(b.echeanceLe, B.ajouterJours(b.demarreLe, (16 + 4) * 7));
  assert.strictEqual(b.semainesProlongation, 4);

  assert.strictEqual(b.prolongations.length, 1);
  const p = b.prolongations[0];
  assert.strictEqual(p.semaines, 4);
  assert.ok(p.motif.includes('Arrêt maladie'), 'le motif est conservé');
  assert.strictEqual(p.auteur, ADMIN, 'la prolongation est attribuée à son auteur');
  assert.ok(p.creeLe, 'elle est datée');
  assert.ok(p.echeanceAvant && p.echeanceApres && p.echeanceApres > p.echeanceAvant);

  // Et le suivi peut reprendre.
  const etape = await api('POST', `/api/boost/coach/dossiers/${dossiers[MARC]}/etapes/2/valider`, {}, jetons[COACH1]);
  assert.strictEqual(etape.status, 200);
});

test('aucun plafond au nombre de prolongations, mais chacune laisse sa trace', async () => {
  for (const semaines of [2, 3, 1]) {
    const r = await api('POST', `/api/boost/admin/dossiers/${dossiers[MARC]}/prolongation`,
      { semaines, motif: `Prolongation exceptionnelle de ${semaines} semaine(s), validée en réunion.` }, jetons[ADMIN]);
    assert.strictEqual(r.status, 200);
  }
  const vue = await api('GET', `/api/boost/admin/dossiers/${dossiers[MARC]}`, null, jetons[ADMIN]);
  const b = vue.body.boost;
  assert.strictEqual(b.prolongations.length, 4, '4 prolongations, aucune refusée pour cause de plafond');
  assert.strictEqual(b.semainesProlongation, 10, '4 + 2 + 3 + 1');
  assert.strictEqual(b.echeanceLe, B.ajouterJours(b.demarreLe, (16 + 10) * 7));
  assert.ok(b.prolongations.every((p) => p.motif && p.auteur && p.creeLe),
    'aucune prolongation anonyme, sans motif ou sans date');
});

test('une prolongation trop courte ne ressuscite pas le Boost', async () => {
  const cree = await api('POST', '/api/boost/admin/dossiers', { clientEmail: HUGO, coachEmail: COACH1 }, jetons[ADMIN]);
  const id = cree.body.boost.id;
  app.boost.validerEtape(id, 1, COACH1, jour(-130));   // échéance dépassée de 18 jours

  const r = await api('POST', `/api/boost/admin/dossiers/${id}/prolongation`,
    { semaines: 1, motif: 'Prolongation d\'une semaine à titre commercial.' }, jetons[ADMIN]);
  assert.strictEqual(r.status, 200, 'la prolongation est bien enregistrée');
  // 130 - (112 + 7) = 11 jours encore dans le passé : le Boost retombe expiré.
  assert.strictEqual(r.body.boost.statut, B.STATUT_EXPIRE);
  assert.strictEqual(r.body.boost.joursRestants, -11);
  assert.strictEqual(r.body.boost.prolongations.length, 1, 'la trace reste, même si l\'effet est nul');
});

test('un Boost pas encore démarré ne se prolonge pas', async () => {
  const cree = await api('POST', '/api/boost/admin/dossiers', { clientEmail: PAUL, coachEmail: COACH2 }, jetons[ADMIN]);
  const r = await api('POST', `/api/boost/admin/dossiers/${cree.body.boost.id}/prolongation`,
    { semaines: 4, motif: 'Le client souhaite décaler son démarrage à septembre.' }, jetons[ADMIN]);
  assert.strictEqual(r.status, 409, 'les 16 semaines ne courent pas encore');
  assert.strictEqual(r.body.statut, B.STATUT_A_DEMARRER);
});

// ===========================================================================
//  INTERRUPTION
// ===========================================================================

test('interrompre : motif obligatoire, puis rachat possible', async () => {
  const cree = await api('POST', '/api/boost/admin/dossiers', { clientEmail: NORA, coachEmail: COACH2 }, jetons[ADMIN]);
  dossiers[NORA] = cree.body.boost.id;
  await api('POST', `/api/boost/coach/dossiers/${dossiers[NORA]}/seances/1/valider`, S1_MINIMAL, jetons[COACH2]);

  const sansMotif = await api('POST', `/api/boost/admin/dossiers/${dossiers[NORA]}/interruption`, {}, jetons[ADMIN]);
  assert.strictEqual(sansMotif.status, 400);

  const r = await api('POST', `/api/boost/admin/dossiers/${dossiers[NORA]}/interruption`,
    { motif: 'Déménagement à l\'étranger, accompagnement arrêté d\'un commun accord.' }, jetons[ADMIN]);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.boost.statut, B.STATUT_INTERROMPU);
  assert.strictEqual(r.body.boost.interrompuLe, jour(0));
  assert.ok(r.body.boost.motifInterruption.includes('Déménagement'));

  // Plus d'Étape possible, mais la place est libérée.
  const etape = await api('POST', `/api/boost/coach/dossiers/${dossiers[NORA]}/etapes/2/valider`, {}, jetons[COACH2]);
  assert.strictEqual(etape.status, 409);

  const rachat = await api('POST', '/api/boost/admin/dossiers', { clientEmail: NORA, coachEmail: COACH2 }, jetons[ADMIN]);
  assert.strictEqual(rachat.status, 201, 'un nouveau Boost après une interruption');
});

test('un Boost déjà clos ne s\'interrompt pas deux fois', async () => {
  const r = await api('POST', `/api/boost/admin/dossiers/${dossiers[NORA]}/interruption`,
    { motif: 'Nouvelle tentative d\'interruption.' }, jetons[ADMIN]);
  assert.strictEqual(r.status, 409);
});

// ===========================================================================
//  JOURNALISATION
// ===========================================================================

test('le journal raconte le dossier : création, attribution, Étapes, prolongations', async () => {
  const r = await api('GET', `/api/boost/admin/dossiers/${dossiers[MARC]}/journal`, null, jetons[ADMIN]);
  assert.strictEqual(r.status, 200);
  const actions = r.body.journal.map((l) => l.action);

  for (const attendue of ['creation', 'attribution', 'demarrage', 'etape_validee', 'expiration', 'prolongation']) {
    assert.ok(actions.includes(attendue), `le journal contient « ${attendue} »`);
  }
  // Toute écriture volontaire porte son auteur (l'expiration, elle, est
  // constatée par le système : pas d'auteur, et c'est normal).
  const prolongations = r.body.journal.filter((l) => l.action === 'prolongation');
  assert.strictEqual(prolongations.length, 4);
  assert.ok(prolongations.every((l) => l.auteur === ADMIN && l.detail.motif && l.creeLe));

  const expiration = r.body.journal.find((l) => l.action === 'expiration');
  assert.strictEqual(expiration.auteur, null, 'constatée par le système');
  assert.ok(expiration.detail.echeanceLe);
});

test('le journal d\'un dossier inexistant répond 404', async () => {
  const r = await api('GET', '/api/boost/admin/dossiers/99999/journal', null, jetons[ADMIN]);
  assert.strictEqual(r.status, 404);
});

// ===========================================================================
//  VUE ADMIN DES COLLABORATEURS
// ===========================================================================

test('l\'admin voit qui peut suivre des clients, et combien', async () => {
  const r = await api('GET', '/api/boost/admin/collaborateurs', null, jetons[ADMIN]);
  assert.strictEqual(r.status, 200);
  const parEmail = Object.fromEntries(r.body.collaborateurs.map((c) => [c.email, c]));

  assert.strictEqual(parEmail[COACH1].peutSuivre, true);
  assert.strictEqual(parEmail[COACH1].certification.scoreQcm, 88);
  assert.strictEqual(parEmail[COLLAB3].peutSuivre, false, 'non certifié : ne suit personne');
  assert.strictEqual(parEmail[COLLAB3].nbClients, 0);
  assert.ok(parEmail[COACH1].nbClients >= 1);
  // Les clients ne figurent pas dans la liste des collaborateurs.
  assert.strictEqual(parEmail[LEA], undefined);
});

// ===========================================================================
//  SUPPRESSION DU COMPTE (V1 : cascade, cf. arbitrage n°1)
// ===========================================================================

test('supprimer un compte client emporte ses Boosts', async () => {
  const s = await api('POST', '/account/login', { email: 'jetable@exemple.fr', prenom: 'Jetable', pin: '3131' });
  const cree = await api('POST', '/api/boost/admin/dossiers',
    { clientEmail: 'jetable@exemple.fr', coachEmail: COACH1 }, jetons[ADMIN]);
  const id = cree.body.boost.id;
  assert.strictEqual(cree.status, 201);

  await api('DELETE', '/account', null, s.body.token);
  assert.strictEqual(app.boost.lireBoost(id), null, 'le dossier part avec le compte');
});

test('le départ d\'un coach ne détruit pas les dossiers de ses clients', async () => {
  const s = await api('POST', '/account/login', { email: 'partant@exemple.fr', prenom: 'Partant', pin: '4141' });
  await api('POST', '/api/boost/admin/collaborateurs', { email: 'partant@exemple.fr', role: 'collaborateur' }, jetons[ADMIN]);
  await api('PUT', '/api/boost/admin/certification/partant@exemple.fr',
    { statut: 'certifie', evaluateur: 'Stan Martin', scoreQcm: 80, resultatPratique: 'valide' }, jetons[ADMIN]);

  const cli = await api('POST', '/account/login', { email: 'reste@exemple.fr', prenom: 'Reste', pin: '5151' });
  const cree = await api('POST', '/api/boost/admin/dossiers',
    { clientEmail: 'reste@exemple.fr', coachEmail: 'partant@exemple.fr' }, jetons[ADMIN]);
  const id = cree.body.boost.id;

  await api('DELETE', '/account', null, s.body.token);

  // Le dossier survit, simplement sans coach : à réattribuer.
  const apres = app.boost.lireBoost(id);
  assert.ok(apres, 'le dossier du client est toujours là');
  assert.strictEqual(apres.coachEmail, null);
  const vue = await api('GET', '/api/boost/mien', null, cli.body.token);
  assert.strictEqual(vue.body.actuel.id, id);
});

// ===========================================================================
//  L'ENREGISTREMENT users, APRÈS TOUT
// ===========================================================================

test('après un cycle Boost complet, l\'enregistrement users est inchangé', () => {
  // Léa a, depuis l'empreinte : reçu un Boost, été attribuée à un coach, validé
  // ses 12 Étapes, terminé, puis racheté un Boost. Son compte, lui, n'a pas
  // bougé d'un octet — c'est toute la différence entre « rattaché au Boost » et
  // « modifié par le Boost ».
  const db = require('../lib/db').getDb();
  const apres = db.prepare('SELECT * FROM users WHERE email = ?').get(LEA);
  assert.deepStrictEqual(apres, empreinteLea);

  // Et la forme de la table n'a pas bougé non plus.
  assert.deepStrictEqual(db.prepare('PRAGMA table_info(users)').all().map((c) => c.name),
    COLONNES_USERS);
});

test('le rôle collaborateur vit dans les tables Boost, pas dans le compte', () => {
  const db = require('../lib/db').getDb();
  // Quentin est Coach Nutrition certifié : cela se lit dans boost_collaborateurs…
  const ligne = db.prepare('SELECT email, actif FROM boost_collaborateurs WHERE email = ?').get(COACH1);
  assert.strictEqual(ligne.actif, 1);
  // …et son enregistrement users est de la même forme que celui d'une cliente.
  const coach = db.prepare('SELECT * FROM users WHERE email = ?').get(COACH1);
  assert.deepStrictEqual(Object.keys(coach), Object.keys(empreinteLea),
    'rien ne distingue un collaborateur d\'un client dans la table users');
});

test('retirer le rôle collaborateur ferme l\'accès sans toucher au compte', async () => {
  const db = require('../lib/db').getDb();
  const avant = db.prepare('SELECT * FROM users WHERE email = ?').get(COACH2);

  const r = await api('POST', '/api/boost/admin/collaborateurs',
    { email: COACH2, role: 'client' }, jetons[ADMIN]);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.collaborateur.role, B.ROLE_CLIENT);

  // Il ne passe plus la porte des coachs, bien qu'il reste certifié.
  const ferme = await api('GET', '/api/boost/coach/dossiers', null, jetons[COACH2]);
  assert.strictEqual(ferme.status, 403);
  assert.strictEqual(app.boost.estCoachCertifie(COACH2), false);

  // La ligne est conservée pour garder la trace du retrait…
  const trace = db.prepare('SELECT actif, maj_par FROM boost_collaborateurs WHERE email = ?').get(COACH2);
  assert.strictEqual(trace.actif, 0);
  assert.strictEqual(trace.maj_par, ADMIN);
  // …et le compte, lui, n'a pas été touché.
  assert.deepStrictEqual(db.prepare('SELECT * FROM users WHERE email = ?').get(COACH2), avant);
});
