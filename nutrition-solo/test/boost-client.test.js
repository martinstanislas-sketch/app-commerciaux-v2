'use strict';
// ============================================================================
//  BOOST NUTRITION — « MON ACCOMPAGNEMENT », L'ESPACE CLIENT.
//
//  LE MANQUE QUE CE LOT COMBLE. `GET /api/boost/mien` existait depuis le socle
//  et ne disait que l'avancement : combien d'Étapes validées, combien de jours
//  restants. Le client voyait une barre de progression sans jamais lire CE
//  QU'IL AVAIT À FAIRE — l'action décidée avec son coach ne vivait que dans
//  l'espace coach. Douze Étapes de suivi, et rien à l'écran de l'intéressé.
//
//  QUATRE PROPRIÉTÉS SONT ATTAQUÉES ICI :
//
//   1. L'ÉTANCHÉITÉ, et c'est la plus importante. Le Boost range les notes du
//      coach dans une table à part POUR QU'ELLES NE SORTENT PAS. Cette suite
//      les écrit à chaque rendez-vous puis fouille la réponse client : ni la
//      note interne, ni le bloc de travail du coach (réussites, difficultés,
//      observations), ni AUCUN email ne doit s'y trouver.
//
//   2. L'ACTION AFFICHÉE EST LA BONNE. Une Étape est une PÉRIODE : à l'Étape N,
//      le client travaille l'action décidée à l'Étape N-1. Décaler d'un cran
//      ferait afficher une consigne périmée.
//
//   3. LE CATALOGUE ÉDITORIAL est de la donnée, pas une règle. Douze titres,
//      douze objectifs, identiques pour tous — et le moteur continue de ne
//      connaître que TROIS protocoles.
//
//   4. LA PORTÉE. Aucun email en paramètre, jamais le dossier d'un autre.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DB = path.join(os.tmpdir(), `nutri-boost-client-test-${process.pid}.sqlite`);
process.env.NUTRITION_DB = DB;
process.env.ADMIN_EMAIL = 'patron@exemple.fr';

const app = require('../server');
const { certifierViaAcademy } = require('./aideAcademy');
const { ETAPES_BOOST, etapeDe } = require('../lib/boostEtapes');
const S = require('../lib/boostSeances');
let srv, base;

const ADMIN = 'patron@exemple.fr';
const COACH = 'quentin.bc@exemple.fr';
const CLI = 'lea.bc@exemple.fr';        // parcourt la boucle
const AUTRE = 'marc.bc@exemple.fr';     // un autre client, jamais visible
const SANS = 'nina.bc@exemple.fr';      // aucun Boost
const jetons = {};
const dossiers = {};

const PUBLIC = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(PUBLIC, 'app.js'), 'utf8');

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

const mien = async (qui) => (await api('GET', '/api/boost/mien', null, jetons[qui])).body;
const routeSeance = (cli, n, sfx) => `/api/boost/coach/dossiers/${dossiers[cli]}/seances/${n}${sfx || ''}`;

// Les textes qui NE DOIVENT JAMAIS atteindre le client. On les sème dans
// chaque rendez-vous pour pouvoir les chercher ensuite dans la réponse.
const NOTE_INTERNE = 'NOTE-INTERNE-COACH-A-NE-PAS-DIVULGUER';
const OBSERVATION = 'OBSERVATION-DE-TRAVAIL-DU-COACH';
const DIFFICULTE = 'DIFFICULTE-NOTEE-PAR-LE-COACH';

const S1 = {
  donnees: {
    objectif: { choix: 'perte', texte: 'Retrouver de l\'énergie.' },
    habitudes: { petitDejeuner: 'Café seul' },
    difficultes: { choix: ['temps'], precision: 'Semaine chargée.' },
    journalPhotoExplique: true,
  },
  action: { intitule: 'Un petit-déjeuner protéiné', detail: 'Œufs ou skyr, pas de sucré seul.', frequence: 'Tous les matins en semaine' },
  noteCoach: NOTE_INTERNE,
};

const suivi = (n) => ({
  donnees: {
    actionPrecedente: { resultat: 'partielle', commentaire: `Bien tenu en semaine, décroché le week-end (Étape ${n}).` },
    bilan: { reussites: 'Petit-déjeuner mieux tenu', difficultes: DIFFICULTE, observations: OBSERVATION },
    decision: 'ajuster',
    adhesion: 8,
  },
  action: { intitule: `Action décidée à l'Étape ${n}`, detail: 'Détail visible du client.', frequence: '3 fois par semaine' },
  noteCoach: NOTE_INTERNE,
});

test.before(async () => {
  await new Promise((r) => { srv = app.listen(0, r); });
  base = `http://127.0.0.1:${srv.address().port}`;
  app.boost.assurerSchema();
  for (const [e, p] of [[ADMIN, '7777'], [COACH, '2002'], [CLI, '1001'], [AUTRE, '3003'], [SANS, '4004']]) {
    await connecter(e, p);
  }
  const T = jetons[ADMIN];
  await api('POST', '/api/boost/admin/collaborateurs', { email: COACH, role: 'collaborateur' }, T);
  await certifierViaAcademy({ api, admin: ADMIN, jetonAdmin: T, email: COACH, jeton: jetons[COACH] });
  for (const cli of [CLI, AUTRE]) {
    const r = await api('POST', '/api/boost/admin/dossiers', { clientEmail: cli, coachEmail: COACH }, T);
    dossiers[cli] = r.body.boost.id;
  }
});

test.after(() => {
  if (srv) srv.close();
  require('../lib/db').closeDb();
  ['', '-wal', '-shm'].forEach((s) => { try { fs.unlinkSync(DB + s); } catch (_) {} });
});

// ===========================================================================
//  1. LE CATALOGUE ÉDITORIAL
// ===========================================================================

test('douze Étapes, numérotées 1 à 12, toutes rédigées', () => {
  assert.strictEqual(ETAPES_BOOST.length, 12);
  assert.deepStrictEqual(ETAPES_BOOST.map((e) => e.numero), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  for (const e of ETAPES_BOOST) {
    assert.ok(e.titre && e.titre.length > 3, 'titre vide à l\'Étape ' + e.numero);
    assert.ok(e.objectif && e.objectif.length > 20, 'objectif vide à l\'Étape ' + e.numero);
  }
  // Douze titres DISTINCTS : deux Étapes qui portent le même nom se
  // confondraient dans la frise.
  assert.strictEqual(new Set(ETAPES_BOOST.map((e) => e.titre)).size, 12);
  assert.strictEqual(etapeDe(1).titre, 'Faire le point');
  assert.strictEqual(etapeDe(12).titre, 'Faire ton bilan');
  assert.strictEqual(etapeDe(13), null, 'hors bornes -> null, jamais un objet vide');
});

test('le catalogue est une DONNÉE : il n\'ajoute aucun protocole', () => {
  // Le moteur en connaît trois, et douze textes ne doivent pas en faire douze.
  assert.strictEqual(S.protocoleDe(1), 'decouverte');
  assert.strictEqual(S.protocoleDe(6), 'suivi');
  assert.strictEqual(S.protocoleDe(11), 'suivi');
  assert.strictEqual(S.protocoleDe(12), 'bilan');
  const code = fs.readFileSync(path.join(__dirname, '..', 'lib', 'boostEtapes.js'), 'utf8')
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.ok(!/function |if \(|for \(|require\(/.test(code.replace(/module\.exports[\s\S]*/, '')
    .replace(/const etapeDe[\s\S]*?;\n/, '')), 'le catalogue doit rester du texte, pas de la logique');
});

test('les règles du dispositif ne sont pas contredites par les textes', () => {
  const tout = ETAPES_BOOST.map((e) => e.titre + ' ' + e.objectif).join(' ').toLowerCase();
  // L'échéance se dit « jusqu'au prochain rendez-vous », jamais « cette semaine » :
  // 12 Étapes sur 16 semaines ne font pas une semaine chacune.
  assert.ok(tout.includes('jusqu\'au prochain rendez-vous'));
  assert.ok(!/chaque semaine|cette semaine|par semaine/.test(tout), 'un rythme hebdomadaire serait faux');
  // Aucun jugement : les trois résultats ne sont pas des notes.
  assert.ok(!/échec|raté|mauvais|réussite obligatoire|note/.test(tout));
  // Le bilan promet TROIS règles, comme REGLES_AUTONOMIE_MAX.
  assert.strictEqual(S.REGLES_AUTONOMIE_MAX, 3);
  assert.ok(/trois règles personnelles/.test(etapeDe(12).objectif));
});

// ===========================================================================
//  2. CE QUE LE CLIENT REÇOIT
// ===========================================================================

test('sans Boost, la route répond — et ne montre rien', async () => {
  const d = await mien(SANS);
  assert.strictEqual(d.ok, true);
  assert.strictEqual(d.actuel, null);
  assert.strictEqual(d.suivi, null, 'aucun suivi sans dossier');
  assert.strictEqual(d.catalogue.length, 12, 'le catalogue est servi quand même : l\'écran peut se dessiner');
});

test('avant le premier rendez-vous : Étape 1, aucune action encore', async () => {
  const d = await mien(CLI);
  assert.strictEqual(d.actuel.statut, 'a_demarrer');
  assert.strictEqual(d.actuel.etapeCourante, 1);
  assert.strictEqual(d.actuel.etapesValidees, 0);
  assert.strictEqual(d.suivi.action, null, 'rien n\'a encore été décidé');
  assert.strictEqual(d.suivi.derniereEvaluation, null);
  assert.deepStrictEqual(d.suivi.parcours, []);
  // Le catalogue permet déjà d'annoncer ce qui va se passer.
  assert.strictEqual(etapeDe(d.actuel.etapeCourante).titre, 'Faire le point');
});

test('après le rendez-vous de découverte : l\'action apparaît, le compteur avance', async () => {
  assert.strictEqual((await api('POST', routeSeance(CLI, 1, '/valider'), S1, jetons[COACH])).status, 200);
  const d = await mien(CLI);
  assert.strictEqual(d.actuel.statut, 'en_cours');
  assert.strictEqual(d.actuel.etapesValidees, 1);
  assert.strictEqual(d.actuel.etapeCourante, 2, 'on travaille désormais l\'Étape 2');
  assert.ok(d.actuel.joursRestants > 0, 'les 16 semaines sont armées');
  assert.strictEqual(d.actuel.coachPrenom, 'quentin.bc', 'le PRÉNOM du coach, pas son email');

  const a = d.suivi.action;
  assert.strictEqual(a.intitule, 'Un petit-déjeuner protéiné');
  assert.strictEqual(a.detail, 'Œufs ou skyr, pas de sucré seul.');
  assert.strictEqual(a.frequence, 'Tous les matins en semaine');
  // UNE ÉTAPE EST UNE PÉRIODE : à l'Étape 2, on travaille l'action décidée à
  // l'Étape 1. Décaler d'un cran afficherait une consigne périmée.
  assert.strictEqual(a.decideeAEtape, 1);
  assert.strictEqual(a.decideeAEtape, d.actuel.etapeCourante - 1);
  assert.strictEqual(d.suivi.derniereEvaluation, null, 'elle n\'a pas encore été évaluée');
});

test('au rendez-vous suivant : le verdict de la précédente, et la nouvelle action', async () => {
  assert.strictEqual((await api('POST', routeSeance(CLI, 2, '/valider'), suivi(2), jetons[COACH])).status, 200);
  const d = await mien(CLI);
  assert.strictEqual(d.actuel.etapeCourante, 3);

  const e = d.suivi.derniereEvaluation;
  assert.strictEqual(e.intitule, 'Un petit-déjeuner protéiné');
  assert.strictEqual(e.resultat, 'partielle');
  assert.ok(/décroché le week-end/.test(e.commentaire), 'le commentaire du coach lui parvient');
  assert.strictEqual(e.etape, 2, 'prononcé à l\'Étape 2');

  assert.strictEqual(d.suivi.action.intitule, 'Action décidée à l\'Étape 2');
  assert.strictEqual(d.suivi.action.decideeAEtape, 2);
  assert.strictEqual(d.suivi.action.adhesion, 8, 'la note qu\'il a lui-même donnée');
});

test('UNE SEULE ACTION À LA FOIS, jusqu\'au bout', async () => {
  for (let n = 3; n <= 11; n++) {
    assert.strictEqual((await api('POST', routeSeance(CLI, n, '/valider'), suivi(n), jetons[COACH])).status, 200, 'Étape ' + n);
    const d = await mien(CLI);
    assert.strictEqual(d.suivi.action.decideeAEtape, n, 'l\'action affichée est celle du dernier rendez-vous');
    assert.strictEqual(d.actuel.etapeCourante, n + 1);
  }
});

test('le parcours se relit comme un fil, étape par étape', async () => {
  const d = await mien(CLI);
  const p = d.suivi.parcours;
  assert.strictEqual(p.length, 11, 'onze rendez-vous tenus');
  assert.strictEqual(p[0].numero, 1);
  assert.ok(p[0].objectif.texte.includes('énergie'), 'l\'objectif que le client a lui-même formulé');
  // Chaque ligne porte l'action décidée là, et ce qu'a donné la précédente.
  assert.strictEqual(p[1].actionDecidee, 'Action décidée à l\'Étape 2');
  assert.strictEqual(p[1].actionSuivie, 'Un petit-déjeuner protéiné');
  assert.strictEqual(p[1].resultat, 'partielle');
});

test('AUCUNE FUITE : ni note interne, ni bloc de travail, ni email', async () => {
  const brut = (await api('GET', '/api/boost/mien', null, jetons[CLI])).txt;
  assert.ok(!brut.includes(NOTE_INTERNE), 'LA NOTE INTERNE DU COACH EST SORTIE : fuite grave');
  assert.ok(!brut.includes(OBSERVATION), 'les observations de travail du coach sont sorties');
  assert.ok(!brut.includes(DIFFICULTE), 'le bloc « difficultés » du coach est sorti');
  // AUCUN EMAIL, pas même celui du coach ni de l'admin qui a ouvert le dossier.
  assert.ok(!brut.includes(COACH), 'l\'email du coach est sorti');
  assert.ok(!brut.includes(ADMIN), 'l\'email de l\'administrateur est sorti');
  assert.ok(!/"creePar"|"valideePar"|"referenceExterne"|"auteur"/.test(brut),
    'un champ d\'administration est sorti dans la vue client');
  // Le prénom, lui, est bien là : c'est ce qui rend l'écran humain.
  assert.ok(brut.includes('quentin.bc'), 'le prénom du coach doit être affichable');

  // Et la note interne existe bel et bien côté coach : le test prouve un
  // FILTRE, pas une absence de donnée.
  const cote = await api('GET', routeSeance(CLI, 2), null, jetons[COACH]);
  assert.strictEqual(cote.body.seance.noteCoach, NOTE_INTERNE);
});

test('le bilan : les trois règles à emporter, et plus aucune action', async () => {
  const bilan = {
    donnees: {
      actionPrecedente: { resultat: 'realisee', commentaire: 'Bien installé.' },
      bilan: { progres: 'Énergie retrouvée', plusFacile: 'Les matins', appris: 'Anticiper' },
      regles: ['Un petit-déjeuner protéiné', 'Je prépare le dimanche', 'Je bois avant de manger'],
      fragiles: OBSERVATION,
      confiance: 8,
    },
    noteCoach: NOTE_INTERNE,
  };
  assert.strictEqual((await api('POST', routeSeance(CLI, 12, '/valider'), bilan, jetons[COACH])).status, 200);

  const d = await mien(CLI);
  // LE BOOST EST TERMINÉ : `actuel` est null. Mais le client doit TOUJOURS
  // pouvoir relire ce qu'il emporte — c'est même le seul moment où ça compte.
  assert.strictEqual(d.actuel, null, 'le bilan clôt le Boost');
  assert.ok(d.montre, 'le dernier accompagnement reste consultable');
  assert.strictEqual(d.clos, true);
  assert.strictEqual(d.montre.statut, 'termine');
  assert.strictEqual(d.montre.etapesValidees, 12);
  assert.strictEqual(d.suivi.action, null, 'LE BILAN NE CRÉE AUCUNE ACTION');
  assert.deepStrictEqual(d.suivi.regles, ['Un petit-déjeuner protéiné', 'Je prépare le dimanche', 'Je bois avant de manger']);
  assert.strictEqual(d.suivi.regles.length, 3, 'trois au maximum, comme le dit le moteur');
  assert.strictEqual(d.suivi.confiance, 8);
  assert.strictEqual(d.suivi.derniereEvaluation.resultat, 'realisee', 'la dernière action a bien eu son verdict');

  // Et `fragiles`, qui est du matériau de coach, ne sort pas.
  const brut = (await api('GET', '/api/boost/mien', null, jetons[CLI])).txt;
  assert.ok(!brut.includes(OBSERVATION));
});

// ===========================================================================
//  3. LA PORTÉE
// ===========================================================================

test('un client ne lit QUE son dossier — aucune route n\'accepte d\'email', async () => {
  const a = await mien(AUTRE);
  assert.strictEqual(a.actuel.id, dossiers[AUTRE]);
  assert.notStrictEqual(a.actuel.id, dossiers[CLI]);
  assert.strictEqual(a.suivi.action, null, 'son dossier à lui n\'a pas démarré');
  // Le dossier terminé de Léa reste le sien, et lui seul le voit.
  assert.strictEqual((await mien(CLI)).montre.id, dossiers[CLI]);
  assert.strictEqual((await api('GET', '/api/boost/mien')).status, 401, 'ni sans jeton');
});

// ===========================================================================
//  4. L'ÉCRAN
// ===========================================================================

test('l\'app cliente porte l\'onglet « Mon accompagnement »', () => {
  assert.ok(html.includes('data-tab="accompagnement"'), 'l\'onglet manque à la navigation');
  assert.ok(html.includes('id="view-accompagnement"'), 'l\'écran manque');
  assert.ok(js.includes('/api/boost/mien'), 'l\'écran ne lit pas la route du Boost');
});

test('l\'onglet n\'apparaît QUE pour un client accompagné', () => {
  // Le serveur tranche : `actuel` non nul. L'écran ne déduit rien d'un 403 ni
  // d'un rôle deviné — un client sans Boost garde les quatre onglets d'avant.
  assert.ok(/navAccompagnement|accompagnementVisible|majOngletAccompagnement/.test(js),
    'rien ne pilote la visibilité de l\'onglet');
});

test('l\'écran affiche l\'action, son objectif d\'Étape, et ne juge pas', () => {
  // On juge la SECTION de l'accompagnement, pas tout app.js : le mot « échec »
  // y existe ailleurs pour un téléchargement raté, ce qui n'a rien à voir.
  const bloc = js.slice(js.indexOf('MON ACCOMPAGNEMENT'));
  assert.ok(bloc.length > 2000, 'la section de l\'accompagnement est introuvable');
  assert.ok(bloc.includes('Mon action en cours'), 'l\'action doit être nommée');
  assert.ok(/Réalisée/.test(bloc) && /Partiellement réalisée/.test(bloc) && /Non réalisée/.test(bloc),
    'les trois résultats sont libellés');
  const code = bloc.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.ok(!/échec|raté|mauvais|bravo|félicitation/i.test(code), 'aucun vocabulaire de jugement');
  // L'échéance se dit toujours de la même façon. (L'apostrophe est échappée
  // dans la chaîne JavaScript : on l'accepte avec ou sans antislash.)
  assert.ok(/jusqu\\?'à ton prochain rendez-vous/.test(bloc),
    'l\'échéance doit se dire « jusqu\'à ton prochain rendez-vous »');
  // Et RIEN n'est écrit par le client : le verdict appartient au coach.
  assert.ok(!/method: 'POST'[\s\S]{0,200}boost/.test(bloc), 'l\'écran client ne doit rien écrire dans le Boost');
});
