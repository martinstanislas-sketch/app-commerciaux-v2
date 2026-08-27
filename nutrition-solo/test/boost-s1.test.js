'use strict';
// ============================================================================
//  S1 — PREMIER RENDEZ-VOUS BOOST NUTRITION.
//
//  Trois choses se jouent ici, et chacune casse d'une façon différente :
//
//   1. LE BROUILLON. Il doit être parfaitement inerte : tant que S1 n'est pas
//      validée, le Boost reste « à démarrer », l'Étape 1 reste à venir, les 16
//      semaines ne courent pas. Un brouillon qui démarre le compte à rebours
//      serait invisible sur le moment et faux pendant quatre mois.
//
//   2. L'ATOMICITÉ. La validation écrit le contenu, l'action ET l'Étape. Si
//      l'une échoue, tout doit être annulé : « Étape 1 validée » avec un
//      rendez-vous vide serait une panne qu'on ne saurait pas réparer.
//
//   3. LE CLOISONNEMENT DES NOTES. Les notes internes du coach ne doivent
//      sortir que par les routes Coach. Ni le client, ni l'administrateur.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const vm = require('node:vm');

const DB = path.join(os.tmpdir(), `nutri-boost-s1-test-${process.pid}.sqlite`);
process.env.NUTRITION_DB = DB;
process.env.ADMIN_EMAIL = 'patron@exemple.fr';

const app = require('../server');
const B = require('../lib/boost');
// Les constantes de séance vivent désormais dans le module des séances : c'est
// le seul effet visible de l'extraction sur ce fichier de test.
const S = require('../lib/boostSeances');
let srv, base;

const ADMIN = 'patron@exemple.fr';
const COACH_A = 'quentin@exemple.fr';
const COACH_B = 'sophie@exemple.fr';
const COLLAB = 'theo@exemple.fr';
const CLI_A = 'lea@exemple.fr';
const CLI_A2 = 'marc@exemple.fr';
const CLI_B = 'hugo@exemple.fr';
const jetons = {};
const dossiers = {};

const PUBLIC = path.join(__dirname, '..', 'public');
const js = fs.readFileSync(path.join(PUBLIC, 'coach.js'), 'utf8');
const css = fs.readFileSync(path.join(PUBLIC, 'coach.css'), 'utf8');

const aujourdhui = () => new Date().toISOString().slice(0, 10);

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

// Un rendez-vous S1 complet, tel que l'écran l'envoie.
const S1_COMPLET = {
  donnees: {
    objectif: { choix: 'perte', texte: 'Perdre 8 kg avant l\'été, sans se priver au point de craquer.' },
    habitudes: {
      organisation: '3 repas, pas de collation', petitDejeuner: 'Café seul, jamais faim le matin',
      dejeuner: 'Cantine, se ressert souvent', diner: 'Tard, vers 21h30', collations: 'Biscuits vers 17h',
      boissons: '2 sodas par jour', exterieur: '2 restaurants par semaine', preparation: 'Ne cuisine pas en semaine',
    },
    difficultes: { choix: ['temps', 'sucre', 'weekend'], precision: 'Craque surtout le dimanche soir.' },
    journalPhotoExplique: true,
  },
  action: { intitule: 'Ajouter une source de protéines au petit-déjeuner', detail: 'Œuf, skyr ou fromage blanc', frequence: '5 fois par semaine' },
  noteCoach: 'Très motivée mais horaires de nuit. Ne pas surcharger : une seule action à la fois.',
};

async function connecter(email, pin) {
  const r = await api('POST', '/account/login', { email, prenom: email.split('@')[0], pin });
  jetons[email] = r.body.token;
}

test.before(async () => {
  await new Promise((r) => { srv = app.listen(0, r); });
  base = `http://127.0.0.1:${srv.address().port}`;
  app.boost.assurerSchema();
  for (const [e, p] of [[ADMIN, '7777'], [COACH_A, '2002'], [COACH_B, '3003'], [COLLAB, '4004'],
    [CLI_A, '1001'], [CLI_A2, '5005'], [CLI_B, '9009']]) await connecter(e, p);

  const T = jetons[ADMIN];
  for (const e of [COACH_A, COACH_B, COLLAB]) {
    await api('POST', '/api/boost/admin/collaborateurs', { email: e, role: 'collaborateur' }, T);
  }
  for (const e of [COACH_A, COACH_B]) {
    await api('PUT', `/api/boost/admin/certification/${e}`,
      { statut: 'certifie', evaluateur: 'Stan Martin', dateCertification: '2026-07-15', scoreQcm: 88, resultatPratique: 'valide' }, T);
  }
  await api('PUT', `/api/boost/admin/certification/${COLLAB}`, { statut: 'en_cours', evaluateur: 'Stan Martin' }, T);

  for (const [cli, coach] of [[CLI_A, COACH_A], [CLI_A2, COACH_A], [CLI_B, COACH_B]]) {
    const r = await api('POST', '/api/boost/admin/dossiers', { clientEmail: cli, coachEmail: coach }, T);
    dossiers[cli] = r.body.boost.id;
  }
});

test.after(() => {
  if (srv) srv.close();
  require('../lib/db').closeDb();
  ['', '-wal', '-shm'].forEach((s) => { try { fs.unlinkSync(DB + s); } catch (_) {} });
});

const routeS1 = (cli, suffixe) => `/api/boost/coach/dossiers/${dossiers[cli]}/seances/1${suffixe || ''}`;

// ===========================================================================
//  1. OUVERTURE
// ===========================================================================

test('le coach attribué ouvre S1 sur un rendez-vous vierge', async () => {
  const r = await api('GET', routeS1(CLI_A), null, jetons[COACH_A]);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.seance.numero, 1);
  assert.strictEqual(r.body.seance.existe, false, 'aucun rendez-vous encore enregistré');
  assert.strictEqual(r.body.seance.statut, S.SEANCE_BROUILLON);
  assert.strictEqual(r.body.seance.action, null);
  assert.strictEqual(r.body.seance.noteCoach, '');
  // Le dossier arrive avec, pour que l'écran n'ait pas à faire deux appels.
  assert.strictEqual(r.body.boost.statut, B.STATUT_A_DEMARRER);
});

test('un numéro d\'étape aberrant est refusé', async () => {
  for (const n of [0, 13, 'abc']) {
    const r = await api('GET', `/api/boost/coach/dossiers/${dossiers[CLI_A]}/seances/${n}`, null, jetons[COACH_A]);
    assert.strictEqual(r.status, 400, 'étape ' + n);
  }
});

// ===========================================================================
//  2. BROUILLON — il doit être parfaitement inerte
// ===========================================================================

test('le brouillon s\'enregistre, même très incomplet', async () => {
  const r = await api('PUT', routeS1(CLI_A), {
    donnees: { objectif: { choix: 'perte', texte: '' }, habitudes: { petitDejeuner: 'Café seul' } },
    action: { intitule: '' },
    noteCoach: 'Première impression : très volontaire.',
  }, jetons[COACH_A]);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.brouillon, true);
  assert.strictEqual(r.body.seance.statut, S.SEANCE_BROUILLON);
});

test('après une simple sauvegarde, le Boost n\'a PAS bougé', async () => {
  const b = await api('GET', `/api/boost/coach/dossiers/${dossiers[CLI_A]}`, null, jetons[COACH_A]);
  assert.strictEqual(b.body.boost.statut, B.STATUT_A_DEMARRER, 'toujours à démarrer');
  assert.strictEqual(b.body.boost.etapesValidees, 0, 'l\'Étape 1 n\'est pas validée');
  assert.strictEqual(b.body.boost.demarreLe, null, 'les 16 semaines ne courent pas');
  assert.strictEqual(b.body.boost.echeanceLe, null);
});

test('le brouillon est retrouvé tel quel, après reconnexion', async () => {
  // Nouvelle session : c'est bien le serveur qui garde le brouillon, pas le navigateur.
  await connecter(COACH_A, '2002');
  const r = await api('GET', routeS1(CLI_A), null, jetons[COACH_A]);
  assert.strictEqual(r.body.seance.existe, true);
  assert.strictEqual(r.body.seance.donnees.objectif.choix, 'perte');
  assert.strictEqual(r.body.seance.donnees.habitudes.petitDejeuner, 'Café seul');
  assert.strictEqual(r.body.seance.noteCoach, 'Première impression : très volontaire.');
  assert.strictEqual(r.body.seance.majPar, COACH_A, 'l\'auteur de la dernière saisie est tracé');
});

test('un brouillon en écrase un autre, sans créer de doublon', async () => {
  await api('PUT', routeS1(CLI_A), {
    donnees: { objectif: { choix: 'perte', texte: 'Perdre 8 kg.' } }, action: { intitule: '' }, noteCoach: '',
  }, jetons[COACH_A]);
  const r = await api('GET', routeS1(CLI_A), null, jetons[COACH_A]);
  assert.strictEqual(r.body.seance.donnees.objectif.texte, 'Perdre 8 kg.');
  assert.strictEqual(r.body.seance.noteCoach, '', 'une note vidée est bien effacée');
  const n = require('../lib/db').getDb().prepare('SELECT COUNT(*) AS n FROM boost_seances WHERE boost_id = ?').get(dossiers[CLI_A]).n;
  assert.strictEqual(n, 1, 'une seule ligne de séance par Étape');
});

test('le serveur ne stocke que les champs qu\'il connaît', async () => {
  await api('PUT', routeS1(CLI_A), {
    donnees: { objectif: { choix: 'perte' }, jeSuisUnIntrus: '<script>alert(1)</script>' },
    action: { intitule: '', tarif: 9999 }, noteCoach: '',
  }, jetons[COACH_A]);
  const r = await api('GET', routeS1(CLI_A), null, jetons[COACH_A]);
  assert.strictEqual(r.body.seance.donnees.jeSuisUnIntrus, undefined, 'un champ inattendu n\'entre pas en base');
  assert.ok(!r.txt.includes('<script>'), 'et rien d\'injecté ne ressort');
});

// ===========================================================================
//  3. VALIDATION — ce qui manque doit être dit
// ===========================================================================

test('sans objectif, S1 ne se valide pas', async () => {
  const r = await api('POST', routeS1(CLI_A, '/valider'), {
    ...S1_COMPLET, donnees: { ...S1_COMPLET.donnees, objectif: { choix: '', texte: '' } },
  }, jetons[COACH_A]);
  assert.strictEqual(r.status, 400);
  assert.deepStrictEqual(r.body.manque, ['l\'objectif du client'], 'le manque est nommé, pas seulement signalé');
});

test('sans action de la semaine, S1 ne se valide pas', async () => {
  const r = await api('POST', routeS1(CLI_A, '/valider'), { ...S1_COMPLET, action: { intitule: '   ' } }, jetons[COACH_A]);
  assert.strictEqual(r.status, 400);
  assert.deepStrictEqual(r.body.manque, ['l\'action de la semaine']);
});

test('sans confirmation du journal photo, S1 ne se valide pas', async () => {
  const r = await api('POST', routeS1(CLI_A, '/valider'), {
    ...S1_COMPLET, donnees: { ...S1_COMPLET.donnees, journalPhotoExplique: false },
  }, jetons[COACH_A]);
  assert.strictEqual(r.status, 400);
  assert.deepStrictEqual(r.body.manque, ['la confirmation que le journal photo a été expliqué']);
});

test('tous les manques sont énoncés d\'un coup, pas un par un', async () => {
  const r = await api('POST', routeS1(CLI_A, '/valider'), { donnees: {}, action: {}, noteCoach: '' }, jetons[COACH_A]);
  assert.strictEqual(r.body.manque.length, 3, 'les trois manques, en une fois');
});

test('une tentative refusée ne laisse AUCUNE trace', async () => {
  const b = await api('GET', `/api/boost/coach/dossiers/${dossiers[CLI_A]}`, null, jetons[COACH_A]);
  assert.strictEqual(b.body.boost.statut, B.STATUT_A_DEMARRER);
  assert.strictEqual(b.body.boost.etapesValidees, 0);
  const s = await api('GET', routeS1(CLI_A), null, jetons[COACH_A]);
  assert.strictEqual(s.body.seance.statut, S.SEANCE_BROUILLON, 'la séance reste un brouillon');
  assert.strictEqual(s.body.seance.action, null, 'aucune action n\'a été créée');
});

// ===========================================================================
//  4. VALIDATION COMPLÈTE
// ===========================================================================

test('S1 complète : le Boost démarre et les 16 semaines s\'arment', async () => {
  const r = await api('POST', routeS1(CLI_A, '/valider'), S1_COMPLET, jetons[COACH_A]);
  assert.strictEqual(r.status, 200);
  const b = r.body.boost;

  assert.strictEqual(b.statut, B.STATUT_EN_COURS);
  assert.strictEqual(b.etapesValidees, 1);
  assert.strictEqual(b.etapeCourante, 2, 'la prochaine étape est S2');
  assert.strictEqual(b.demarreLe, aujourdhui());
  assert.strictEqual(b.echeanceLe, B.ajouterJours(aujourdhui(), 112), '16 semaines');
  assert.strictEqual(b.joursRestants, 112);

  // Auteur et date de la validation, sur l'Étape comme sur la séance.
  assert.strictEqual(b.etapes[0].valideePar, COACH_A);
  assert.strictEqual(b.etapes[0].valideeLe, aujourdhui());
  assert.strictEqual(r.body.seance.statut, S.SEANCE_VALIDEE);
  assert.strictEqual(r.body.seance.valideePar, COACH_A);
  assert.strictEqual(r.body.seance.valideeLe, aujourdhui());
});

test('l\'action de la semaine devient l\'action active du Boost', async () => {
  const r = await api('GET', routeS1(CLI_A), null, jetons[COACH_A]);
  const a = r.body.seance.action;
  assert.strictEqual(a.intitule, S1_COMPLET.action.intitule);
  assert.strictEqual(a.detail, S1_COMPLET.action.detail);
  assert.strictEqual(a.frequence, '5 fois par semaine');
  assert.strictEqual(a.statut, S.ACTION_ACTIVE);
  assert.strictEqual(a.numero, 1, 'on sait quelle Étape l\'a décidée');
  assert.strictEqual(a.creePar, COACH_A);
  // Une seule action active : c'est l'invariant que S2-S11 devront tenir.
  const actives = r.body.seance.actions.filter((x) => x.statut === S.ACTION_ACTIVE);
  assert.strictEqual(actives.length, 1);
});

test('le contenu de S1 reste consultable après validation', async () => {
  const r = await api('GET', routeS1(CLI_A), null, jetons[COACH_A]);
  const d = r.body.seance.donnees;
  assert.strictEqual(d.objectif.choix, 'perte');
  assert.ok(d.objectif.texte.includes('Perdre 8 kg'));
  assert.strictEqual(d.habitudes.diner, 'Tard, vers 21h30');
  assert.deepStrictEqual(d.difficultes.choix, ['temps', 'sucre', 'weekend']);
  assert.ok(d.difficultes.precision.includes('dimanche'));
  assert.strictEqual(d.journalPhotoExplique, true);
  assert.ok(r.body.seance.noteCoach.includes('horaires de nuit'));
});

test('la validation est inscrite au journal du dossier', async () => {
  const r = await api('GET', `/api/boost/coach/dossiers/${dossiers[CLI_A]}/journal`, null, jetons[COACH_A]);
  const l = r.body.journal.find((x) => x.action === 'seance_validee');
  assert.ok(l, 'le rendez-vous validé figure au journal');
  assert.strictEqual(l.detail.numero, 1);
  assert.strictEqual(l.auteur, COACH_A);
  assert.ok(r.body.journal.some((x) => x.action === 'demarrage'), 'le démarrage aussi');
});

test('S1 ne se valide pas deux fois', async () => {
  const r = await api('POST', routeS1(CLI_A, '/valider'), S1_COMPLET, jetons[COACH_A]);
  assert.strictEqual(r.status, 409);
  assert.ok(/déjà été validée/.test(r.body.error));
});

test('un rendez-vous validé ne se réécrit pas non plus', async () => {
  const r = await api('PUT', routeS1(CLI_A), {
    donnees: { objectif: { choix: 'prise', texte: 'Réécriture après coup.' } }, action: { intitule: 'Autre chose' },
  }, jetons[COACH_A]);
  assert.strictEqual(r.status, 409);
  // Le contenu d'origine est intact.
  const s = await api('GET', routeS1(CLI_A), null, jetons[COACH_A]);
  assert.strictEqual(s.body.seance.donnees.objectif.choix, 'perte');
});

// ===========================================================================
//  5. ATOMICITÉ
// ===========================================================================

test('si l\'Étape ne peut pas être validée, rien n\'est écrit', async () => {
  // Un Boost interrompu : la validation de l'Étape échouera. Le contenu de la
  // séance et l'action ne doivent pas survivre à cet échec.
  const T = jetons[ADMIN];
  await api('POST', `/api/boost/admin/dossiers/${dossiers[CLI_A2]}/interruption`,
    { motif: 'Interruption pour éprouver l\'atomicité de la validation.' }, T);

  const r = await api('POST', routeS1(CLI_A2, '/valider'), S1_COMPLET, jetons[COACH_A]);
  assert.strictEqual(r.status, 409, 'la validation est refusée');

  const db = require('../lib/db').getDb();
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM boost_seances WHERE boost_id = ?').get(dossiers[CLI_A2]).n, 0,
    'aucun contenu de séance écrit');
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM boost_actions WHERE boost_id = ?').get(dossiers[CLI_A2]).n, 0,
    'aucune action créée');
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM boost_notes_coach WHERE boost_id = ?').get(dossiers[CLI_A2]).n, 0,
    'aucune note écrite');
});

test('une Étape sans protocole ne se valide pas par la route des séances', async () => {
  // S12 n'a pas encore de rendez-vous construit : mieux vaut refuser que de
  // laisser valider un contenu qui n'existe pas.
  const r = await api('POST', `/api/boost/coach/dossiers/${dossiers[CLI_A]}/seances/12/valider`, S1_COMPLET, jetons[COACH_A]);
  assert.strictEqual(r.status, 409);
  assert.ok(/n'est pas encore construit/.test(r.body.error));
});

// ===========================================================================
//  6. CLOISONNEMENT
// ===========================================================================

test('un coach ne touche pas au rendez-vous d\'un confrère', async () => {
  for (const [m, suffixe] of [['GET', ''], ['PUT', ''], ['POST', '/valider']]) {
    const r = await api(m, routeS1(CLI_B, suffixe), m === 'GET' ? null : S1_COMPLET, jetons[COACH_A]);
    assert.strictEqual(r.status, 404, `${m} sur le dossier d'un confrère`);
    assert.ok(!r.txt.includes('hugo'), 'le refus ne dit rien du dossier');
  }
});

test('un collaborateur non certifié n\'approche pas S1', async () => {
  for (const [m, suffixe] of [['GET', ''], ['PUT', ''], ['POST', '/valider']]) {
    const r = await api(m, routeS1(CLI_A, suffixe), m === 'GET' ? null : S1_COMPLET, jetons[COLLAB]);
    assert.strictEqual(r.status, 403);
    assert.strictEqual(r.body.nonCertifie, true);
  }
});

test('un client n\'approche pas S1, pas même la sienne', async () => {
  for (const [m, suffixe] of [['GET', ''], ['PUT', ''], ['POST', '/valider']]) {
    const r = await api(m, routeS1(CLI_A, suffixe), m === 'GET' ? null : S1_COMPLET, jetons[CLI_A]);
    assert.strictEqual(r.status, 403);
  }
});

test('sans jeton, rien', async () => {
  for (const [m, suffixe] of [['GET', ''], ['PUT', ''], ['POST', '/valider']]) {
    assert.strictEqual((await api(m, routeS1(CLI_A, suffixe), m === 'GET' ? null : S1_COMPLET)).status, 401);
  }
});

test('retirer la certification coupe S1 immédiatement', async () => {
  await api('PUT', `/api/boost/admin/certification/${COACH_A}`, { statut: 'suspendu', evaluateur: 'Stan Martin' }, jetons[ADMIN]);
  const r = await api('GET', routeS1(CLI_A), null, jetons[COACH_A]);
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.body.nonCertifie, true);
  await api('PUT', `/api/boost/admin/certification/${COACH_A}`,
    { statut: 'certifie', evaluateur: 'Stan Martin', dateCertification: '2026-07-15', scoreQcm: 88, resultatPratique: 'valide' }, jetons[ADMIN]);
  assert.strictEqual((await api('GET', routeS1(CLI_A), null, jetons[COACH_A])).status, 200);
});

test('les notes du Coach ne sortent QUE par les routes Coach', async () => {
  // La note existe bien, côté coach.
  const coach = await api('GET', routeS1(CLI_A), null, jetons[COACH_A]);
  assert.ok(coach.body.seance.noteCoach.includes('horaires de nuit'));

  // Elle ne doit apparaître nulle part ailleurs. L'administrateur administre le
  // dispositif, il n'anime pas le suivi (arbitrage n°2).
  const vues = [
    ['admin, fiche', await api('GET', `/api/boost/admin/dossiers/${dossiers[CLI_A]}`, null, jetons[ADMIN])],
    ['admin, liste', await api('GET', '/api/boost/admin/dossiers', null, jetons[ADMIN])],
    ['admin, journal', await api('GET', `/api/boost/admin/dossiers/${dossiers[CLI_A]}/journal`, null, jetons[ADMIN])],
    ['client, son dossier', await api('GET', '/api/boost/mien', null, jetons[CLI_A])],
  ];
  for (const [quoi, r] of vues) {
    assert.strictEqual(r.status, 200, quoi);
    assert.ok(!r.txt.includes('horaires de nuit'), 'note du coach visible dans : ' + quoi);
    assert.ok(!/noteCoach/.test(r.txt), 'le champ noteCoach ne doit pas exister dans : ' + quoi);
  }
});

test('le client voit son Boost démarré, sans le contenu du rendez-vous', async () => {
  const r = await api('GET', '/api/boost/mien', null, jetons[CLI_A]);
  assert.strictEqual(r.body.actuel.statut, B.STATUT_EN_COURS);
  assert.strictEqual(r.body.actuel.etapesValidees, 1);
  // Aucune route client ne sert le contenu de S1 dans ce lot.
  assert.strictEqual(r.body.actuel.seance, undefined);
  assert.ok(!r.txt.includes('Perdre 8 kg'));
});

// ===========================================================================
//  7. L'ÉCRAN
// ===========================================================================

test('l\'écran suit l\'ordre demandé, avec l\'action mise en avant', () => {
  const bloc = js.slice(js.indexOf('function formDecouverte'));
  // Ancres sans apostrophe : dans la source JS elles sont échappées (aujourd\\'hui),
  // les chercher telles qu'affichées ne les trouverait pas.
  const ordre = ['Ton objectif', 'Comment tu manges', 'Ce qui te pose le plus de difficultés',
    'Ton action de la semaine', 'Journal photo', 'blocNotes()', 'Valider le rendez-vous S1'];
  let position = -1;
  for (const titre of ordre) {
    const i = bloc.indexOf(titre);
    assert.ok(i > position, 'ordre rompu à : ' + titre);
    position = i;
  }
  // L'action est la seule zone à porter une classe de mise en avant.
  assert.ok(bloc.includes('blocAction('), 'la zone action est distinguée');
  assert.ok(/\.ec-rdv-action\s*\{[^}]*var\(--saphir-soft\)/.test(css), 'et elle est mise en avant visuellement');
});

test('l\'écran n\'ouvre aucune porte vers ce qui n\'est pas construit', () => {
  // Le journal photo est EXPLIQUÉ dans S1, il n'est pas encore outillé : ni
  // envoi, ni galerie, ni analyse. Ce test garde la frontière du lot.
  assert.ok(!/type="file"|FormData|\.files\b/i.test(js), 'aucun envoi de photo');
  assert.ok(!/galerie|analyseIA|analyserPhoto/i.test(js), 'ni galerie ni analyse');
  assert.ok(!js.includes('/api/boost/admin/'), 'aucune route d\'administration');
  assert.ok(!js.includes('seances/2'), 'S2 n\'est pas appelée');
  // Mais l'explication au client, elle, doit bien être là.
  assert.ok(js.includes('photographie ses repas'), 'l\'explication du journal photo est présente');
});

test('les fonctions de rendu S1 produisent un écran complet', () => {
  const ctx = {
    document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: async () => ({ json: async () => ({}) }),
    window: { scrollTo() {} }, console,
  };
  vm.createContext(ctx);
  vm.runInContext(js + ';globalThis.__s1 = { poser: (v) => { rdv = v; }, bloc, libelle, OBJECTIFS, DIFFICULTES };', ctx);
  const ec = ctx.__s1;

  assert.strictEqual(ec.libelle(ec.OBJECTIFS, 'perte'), 'Perdre du poids');
  assert.strictEqual(ec.libelle(ec.DIFFICULTES, 'sucre'), 'Envies de sucre');
  assert.strictEqual(ec.libelle(ec.OBJECTIFS, 'inconnu'), '', 'une clé inconnue ne casse rien');

  const s = ec.bloc('Titre <script>', 'Aide', '<p>corps</p>');
  assert.ok(s.includes('&lt;script&gt;'), 'les titres sont échappés');
  assert.ok(s.includes('<p>corps</p>'), 'le contenu passe tel quel');
});

// ===========================================================================
//  8. GARDE-FOUS DU DÉCOUPAGE ET DE LA PORTE DÉROBÉE
//
//  Ces tests ne portent pas sur une fonctionnalité mais sur deux propriétés
//  qu'on peut casser sans s'en apercevoir : l'impossibilité de valider une
//  Étape en contournant son rendez-vous, et la séparation des deux modules.
// ===========================================================================

const CLI_GARDE = 'garde@exemple.fr';
const SUIVI_MINIMAL = (n) => ({
  donnees: { actionPrecedente: { resultat: 'realisee', commentaire: '' }, decision: 'continuer', adhesion: 8 },
  action: { intitule: `Action décidée à l'Étape ${n}` },
});

test('une Étape à contenu ne se valide JAMAIS par la route générique', async () => {
  await connecter(CLI_GARDE, '1212');
  const cree = await api('POST', '/api/boost/admin/dossiers',
    { clientEmail: CLI_GARDE, coachEmail: COACH_A }, jetons[ADMIN]);
  const id = cree.body.boost.id;

  const r = await api('POST', `/api/boost/coach/dossiers/${id}/etapes/1/valider`, {}, jetons[COACH_A]);
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.body.seanceRequise, true, 'le refus dit pourquoi, et vers quoi aller');
  assert.strictEqual(r.body.numero, 1);

  // Rien n'a bougé : ni l'Étape, ni le démarrage, ni la séance.
  const b = await api('GET', `/api/boost/coach/dossiers/${id}`, null, jetons[COACH_A]);
  assert.strictEqual(b.body.boost.etapesValidees, 0);
  assert.strictEqual(b.body.boost.statut, B.STATUT_A_DEMARRER);
  assert.strictEqual(b.body.boost.demarreLe, null);
  const s = await api('GET', `/api/boost/coach/dossiers/${id}/seances/1`, null, jetons[COACH_A]);
  assert.strictEqual(s.body.seance.existe, false);
});

test('la fermeture vise « l\'Étape a-t-elle un contenu », pas « est-ce S1 »', async () => {
  // Les Étapes 1 à 11 portent un rendez-vous : la route générique les refuse
  // toutes, sans qu'aucune n'ait été citée en dur. S12 n'en a pas encore.
  for (let n = 1; n <= 11; n++) assert.strictEqual(S.aUnContenu(n), true, 'Étape ' + n);
  assert.strictEqual(S.aUnContenu(12), false, 'S12 reste à construire');
});

test('une Étape sans rendez-vous se valide toujours par la route générique', async () => {
  // S12 n'a pas encore de contenu : elle doit rester validable, sinon un Boost
  // arrivé au bout serait bloqué. On fait avancer le dossier jusqu'à elle.
  for (let n = 2; n <= 11; n++) {
    const r = await api('POST', `/api/boost/coach/dossiers/${dossiers[CLI_A]}/seances/${n}/valider`,
      SUIVI_MINIMAL(n), jetons[COACH_A]);
    assert.strictEqual(r.status, 200, `Étape ${n}`);
  }
  const douze = await api('POST', `/api/boost/coach/dossiers/${dossiers[CLI_A]}/etapes/12/valider`, {}, jetons[COACH_A]);
  assert.strictEqual(douze.status, 200);
  assert.strictEqual(douze.body.boost.etapesValidees, 12);
});

test('les deux modules restent séparés', () => {
  const socle = fs.readFileSync(path.join(__dirname, '..', 'lib', 'boost.js'), 'utf8');
  const seances = fs.readFileSync(path.join(__dirname, '..', 'lib', 'boostSeances.js'), 'utf8');

  // Le socle ne doit plus rien savoir des rendez-vous : c'est tout l'objet du
  // découpage. S'il se remet à les nommer, on est en train de refusionner.
  assert.ok(!/boost_seances|boost_actions|boost_notes_coach/.test(socle),
    'le socle ne touche plus aux tables de séance');
  assert.ok(!/nettoyerDonneesS1|validerSeance|REGLES_SEANCE/.test(socle),
    'le socle ne connaît plus la logique de séance');

  // Et le module des séances ne doit pas réécrire les règles du socle de son
  // côté : il les emprunte, sinon les deux finiraient par diverger.
  assert.ok(seances.includes("require('./boost')"), 'les séances empruntent au socle');
  assert.ok(!/CREATE TABLE IF NOT EXISTS boosts\b|calculerEcheance\s*\(/.test(seances),
    'les séances ne redéfinissent pas le cycle de vie du Boost');
  // L'atomicité repose sur une connexion unique : les deux doivent recevoir le
  // MÊME getDb, jamais en ouvrir un de leur côté.
  assert.ok(!/require\('\.\/db'\)/.test(seances), 'le module des séances n\'ouvre pas sa propre base');
});
