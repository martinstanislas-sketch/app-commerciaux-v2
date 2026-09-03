'use strict';
// ============================================================================
//  MY COACH ACADEMY — la description affichée sur la carte de formation.
//
//  CE QUI CHANGE : la phrase sous le nom d'une formation était FABRIQUÉE par
//  l'écran à partir du titre délivré (« Obtiens le titre X. »). Elle devient une
//  donnée que l'administration écrit librement.
//
//  QUATRE PROPRIÉTÉS, ET LA TROISIÈME EST CELLE QUI SE CASSE EN SILENCE :
//
//   1. LA REPRISE N'EFFACE RIEN. Une formation qui n'avait pas de description
//      reçoit exactement la phrase qui s'affichait avant ; une formation qui en
//      avait déjà une la garde, mot pour mot.
//
//   2. LA DESCRIPTION VOYAGE JUSQU'À LA CARTE. Elle part dans le catalogue
//      servi au collaborateur, sinon l'écran n'aurait rien à afficher.
//
//   3. LA REPRISE NE SE REJOUE JAMAIS. Un administrateur qui VIDE une
//      description doit la retrouver vide au redémarrage suivant. Sans le
//      marqueur, la migration la repose — et personne ne comprend pourquoi un
//      texte supprimé réapparaît tout seul.
//
//   4. LES AUTRES GESTES NE L'EMPORTENT PAS. Régler un seuil, publier ou
//      dépublier n'envoient pas la description : elle doit survivre à ces
//      enregistrements partiels.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DB = path.join(os.tmpdir(), `nutri-academy-desc-test-${process.pid}.sqlite`);
process.env.NUTRITION_DB = DB;
process.env.ADMIN_EMAIL = 'patron@exemple.fr';

const app = require('../server');
const F = require('../lib/academyFormations');

const ADMIN = 'patron@exemple.fr';
const THEO = 'theo.d@exemple.fr';
const jetons = {};
let srv, base;

const dbq = () => require('../lib/db').getDb();
const registre = () => app.academyFormations;

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

async function connecter(email, pin) {
  const r = await api('POST', '/account/login', { email, prenom: email.split('@')[0], pin });
  jetons[email] = r.body.token;
}

// Le catalogue TEL QUE L'ÉCRAN LE REÇOIT. C'est lui qui alimente la carte : le
// vérifier en base ne prouverait pas que la description arrive jusque-là.
const catalogue = async () =>
  (await api('GET', '/api/academy/formations', null, jetons[THEO])).body.formations;
const carteDe = async (cle) => (await catalogue()).find((f) => f.cle === cle);

// Rejouer la migration comme le ferait un redémarrage : la garde en mémoire
// (WeakSet) n'est plus dans le chemin, seul le marqueur en base l'est.
const rejouerMigration = () => registre().amorcerDescriptions();

const MUETTE = 'formation_sans_desc';
const ECRITE = 'formation_avec_desc';
const DEJA = 'Un texte écrit à la main, que personne ne doit réécrire.';

test.before(async () => {
  srv = app.listen(0);
  await new Promise((r) => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;

  await connecter(ADMIN, '7777');
  await connecter(THEO, '4004');
  await api('POST', '/api/boost/admin/collaborateurs', { email: THEO, role: 'collaborateur' }, jetons[ADMIN]);
  await connecter(THEO, '4004');

  // DEUX FIXTURES POSÉES AVANT LA REPRISE, et c'est tout l'objet du fichier :
  // l'une n'a jamais eu de description, l'autre en porte déjà une.
  registre().definir({ cle: MUETTE, libelle: 'Formation muette', titre: 'Titre de la muette', ordre: 8 }, ADMIN);
  registre().definir({ cle: ECRITE, libelle: 'Formation écrite', titre: 'Titre de l\'écrite', ordre: 9, description: DEJA }, ADMIN);
  // La colonne est nullable : on remet la muette dans l'état d'une base
  // d'avant ce lot, description absente.
  dbq().prepare('UPDATE academy_formations SET description = NULL WHERE cle = ?').run(MUETTE);
  // academy_config appartient au moteur du QCM : on s'assure qu'il a posé son
  // schéma, sinon le marqueur de reprise n'a nulle part où vivre.
  app.academyQcm.assurerSchema();
  // Le marqueur a déjà pu être posé : on le retire pour observer la migration
  // telle qu'elle se joue sur une base en service.
  dbq().prepare('DELETE FROM academy_config WHERE cle LIKE ?').run('formations_descriptions%');
});

test.after(() => {
  if (srv) srv.close();
  require('../lib/db').closeDb();
  ['', '-wal', '-shm'].forEach((s) => { try { fs.unlinkSync(DB + s); } catch (_) {} });
});

// ===========================================================================
//  1. LA REPRISE N'EFFACE RIEN
// ===========================================================================

test('la reprise pose la phrase qui s\'affichait, et seulement là où il n\'y avait rien', () => {
  const reprises = rejouerMigration();
  assert.ok(reprises >= 1, 'la migration n\'a rien repris');

  assert.strictEqual(registre().lire(MUETTE).description, 'Obtiens le titre Titre de la muette.',
    'la carte doit retrouver EXACTEMENT le texte qu\'elle fabriquait');
  assert.strictEqual(registre().lire(ECRITE).description, DEJA,
    'une description déjà saisie n\'est jamais réécrite');
});

test('la formation d\'amorçage naît avec sa description, sans attendre la migration', () => {
  assert.strictEqual(registre().lire(F.COACH_NUTRITION).description,
    'Obtiens le titre Coach Nutrition certifié.');
});

// ===========================================================================
//  2. LA DESCRIPTION VOYAGE JUSQU'À LA CARTE
// ===========================================================================

test('le catalogue servi au collaborateur transporte la description', async () => {
  const c = await carteDe(F.COACH_NUTRITION);
  assert.ok(c, 'la formation manque au catalogue');
  assert.strictEqual(c.description, 'Obtiens le titre Coach Nutrition certifié.');
});

test('ce que l\'administrateur écrit est ce que la carte reçoit, immédiatement', async () => {
  const avant = await carteDe(F.COACH_NUTRITION);
  const texte = 'Apprends à intégrer la boxe dans tes accompagnements et obtiens ta certification Fitness Boxe My Coach.';
  const r = await api('PUT', `/api/academy/admin/formations/${F.COACH_NUTRITION}`,
    { libelle: 'Nutrition', titre: 'Coach Nutrition certifié', description: texte }, jetons[ADMIN]);
  assert.strictEqual(r.status, 200, r.txt);

  const c = await carteDe(F.COACH_NUTRITION);
  assert.strictEqual(c.description, texte, 'aucun texte n\'est reformulé ni tronqué en chemin');
  // Le reste de la ligne n'a pas bougé : écrire une description n'est pas un
  // prétexte à réécrire le parcours.
  assert.strictEqual(c.titre, avant.titre);
  assert.strictEqual(c.qcmNbQuestions, avant.qcmNbQuestions);
  assert.strictEqual(c.qcmSeuilPct, avant.qcmSeuilPct);
  assert.strictEqual(c.miniNbQuestions, avant.miniNbQuestions);
  assert.strictEqual(c.miniSeuilPct, avant.miniSeuilPct);
});

test('une description est disponible dès la création d\'une formation', async () => {
  const r = await api('POST', '/api/academy/admin/formations', {
    cle: 'formation_neuve_desc', libelle: 'Formation neuve', titre: 'Titre neuf',
    description: 'Écrite dès le premier écran.',
  }, jetons[ADMIN]);
  assert.strictEqual(r.status, 200, r.txt);
  assert.strictEqual(r.body.formation.description, 'Écrite dès le premier écran.');
});

// ===========================================================================
//  3. LA REPRISE NE SE REJOUE JAMAIS
// ===========================================================================

test('une description vidée par l\'administrateur ne réapparaît pas au redémarrage', async () => {
  const r = await api('PUT', `/api/academy/admin/formations/${MUETTE}`,
    { libelle: 'Formation muette', titre: 'Titre de la muette', description: '' }, jetons[ADMIN]);
  assert.strictEqual(r.status, 200, r.txt);
  assert.strictEqual(registre().lire(MUETTE).description, null, 'le vide est un choix légitime');

  rejouerMigration();
  rejouerMigration();
  assert.strictEqual(registre().lire(MUETTE).description, null,
    'le marqueur doit interdire à la migration de reposer un texte supprimé');
});

// ===========================================================================
//  4. LES AUTRES GESTES NE L'EMPORTENT PAS
// ===========================================================================

test('régler un seuil, publier ou dépublier laissent la description intacte', () => {
  const texte = 'Le texte de la carte, qui doit survivre à tout le reste.';
  registre().definir({ cle: ECRITE, libelle: 'Formation écrite', titre: 'Titre de l\'écrite', description: texte }, ADMIN);

  // Un enregistrement de réglages n'envoie pas tous les champs.
  registre().definir({ cle: ECRITE, libelle: 'Formation écrite', titre: 'Titre de l\'écrite', qcmSeuilPct: 70 }, ADMIN);
  assert.strictEqual(registre().lire(ECRITE).description, texte);
  assert.strictEqual(registre().lire(ECRITE).qcmSeuilPct, 70, 'le réglage, lui, a bien été pris');

  app.academyAdmin.depublier(ECRITE, ADMIN);
  assert.strictEqual(registre().lire(ECRITE).description, texte, 'dépublier n\'efface pas la présentation');
});
