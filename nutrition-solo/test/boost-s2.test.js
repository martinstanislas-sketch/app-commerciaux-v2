'use strict';
// ============================================================================
//  S2 À S11 — LA BOUCLE DE SUIVI.
//
//  Ce ne sont pas dix rendez-vous : c'est UN protocole joué dix fois. Les tests
//  le prennent au mot — plusieurs d'entre eux parcourent la boucle entière, de
//  l'Étape 2 à l'Étape 11, plutôt que de vérifier S2 et d'espérer que le reste
//  suive.
//
//  Trois propriétés se cassent sans bruit et sont testées de près :
//
//   1. LE CHAÎNAGE DES ACTIONS. Une action créée à l'Étape n est celle qu'on
//      évalue à l'Étape n+1. Si le chaînage glisse d'un cran, l'écran affichera
//      la mauvaise action au coach — en rendez-vous, devant le client.
//
//   2. L'INVARIANT « UNE SEULE ACTION ACTIVE ». Dix passages, dix occasions
//      d'en laisser deux actives.
//
//   3. LE BROUILLON QUI NE TOUCHE À RIEN. Enregistrer un brouillon de S3 ne
//      doit ni valider l'Étape, ni remplacer l'action en cours — le client la
//      suit encore.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const vm = require('node:vm');

const DB = path.join(os.tmpdir(), `nutri-boost-s2-test-${process.pid}.sqlite`);
process.env.NUTRITION_DB = DB;
process.env.ADMIN_EMAIL = 'patron@exemple.fr';

const app = require('../server');
const B = require('../lib/boost');
const S = require('../lib/boostSeances');
let srv, base;

const ADMIN = 'patron@exemple.fr';
const COACH_A = 'quentin@exemple.fr';
const COACH_B = 'sophie@exemple.fr';
const COLLAB = 'theo@exemple.fr';
const CLI = 'lea@exemple.fr';          // parcourt toute la boucle
const CLI_2 = 'marc@exemple.fr';       // brouillons et refus
const CLI_B = 'hugo@exemple.fr';       // client du confrère
const jetons = {};
const dossiers = {};

const PUBLIC = path.join(__dirname, '..', 'public');
const jsCoquille = fs.readFileSync(path.join(PUBLIC, 'coach.js'), 'utf8');
const jsRdv = fs.readFileSync(path.join(PUBLIC, 'coachRdv.js'), 'utf8');
// Ce que le navigateur évalue réellement : les deux scripts, dans l'ordre de
// chargement de coach.html. Ils partagent la même portée globale, donc les
// analyser séparément ferait passer pour manquant ce qui est simplement à côté.
const js = jsCoquille + '\n' + jsRdv;
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

const S1_COMPLET = {
  donnees: {
    objectif: { choix: 'perte', texte: 'Perdre 8 kg avant l\'été.' },
    habitudes: { petitDejeuner: 'Café seul', diner: 'Tard, vers 21h30' },
    difficultes: { choix: ['temps', 'sucre'], precision: 'Craque le dimanche.' },
    journalPhotoExplique: true,
  },
  action: { intitule: 'Action de l\'Étape 1', detail: 'Œuf ou skyr', frequence: '5 fois par semaine' },
  noteCoach: 'Note interne de S1.',
};

// Un rendez-vous de suivi complet, paramétré par l'Étape.
const suivi = (n, extra) => ({
  donnees: {
    actionPrecedente: { resultat: 'partielle', commentaire: `Tenue 3 jours sur 5 à l'Étape ${n}.` },
    bilan: { reussites: 'Petit-déjeuner mieux tenu', difficultes: 'Le week-end reste dur', observations: '' },
    decision: 'ajuster',
    adhesion: 7,
    ...(extra && extra.donnees ? extra.donnees : {}),
  },
  action: { intitule: `Action de l'Étape ${n}`, detail: '', frequence: '3 fois par semaine' },
  noteCoach: `Note interne de l'Étape ${n}.`,
  ...(extra && extra.action ? { action: extra.action } : {}),
});

const routeSeance = (cli, n, suffixe) => `/api/boost/coach/dossiers/${dossiers[cli]}/seances/${n}${suffixe || ''}`;

async function connecter(email, pin) {
  const r = await api('POST', '/account/login', { email, prenom: email.split('@')[0], pin });
  jetons[email] = r.body.token;
}

test.before(async () => {
  await new Promise((r) => { srv = app.listen(0, r); });
  base = `http://127.0.0.1:${srv.address().port}`;
  app.boost.assurerSchema();
  for (const [e, p] of [[ADMIN, '7777'], [COACH_A, '2002'], [COACH_B, '3003'], [COLLAB, '4004'],
    [CLI, '1001'], [CLI_2, '5005'], [CLI_B, '9009']]) await connecter(e, p);

  const T = jetons[ADMIN];
  for (const e of [COACH_A, COACH_B, COLLAB]) {
    await api('POST', '/api/boost/admin/collaborateurs', { email: e, role: 'collaborateur' }, T);
  }
  for (const e of [COACH_A, COACH_B]) {
    await api('PUT', `/api/boost/admin/certification/${e}`,
      { statut: 'certifie', evaluateur: 'Stan Martin', dateCertification: '2026-07-15', scoreQcm: 88, resultatPratique: 'valide' }, T);
  }
  await api('PUT', `/api/boost/admin/certification/${COLLAB}`, { statut: 'en_cours', evaluateur: 'Stan Martin' }, T);

  for (const [cli, coach] of [[CLI, COACH_A], [CLI_2, COACH_A], [CLI_B, COACH_B]]) {
    const r = await api('POST', '/api/boost/admin/dossiers', { clientEmail: cli, coachEmail: coach }, T);
    dossiers[cli] = r.body.boost.id;
  }
  // Les deux dossiers de COACH_A démarrent par S1.
  for (const cli of [CLI, CLI_2]) {
    const r = await api('POST', routeSeance(cli, 1, '/valider'), S1_COMPLET, jetons[COACH_A]);
    assert.strictEqual(r.status, 200, 'préparation : S1 de ' + cli);
  }
});

test.after(() => {
  if (srv) srv.close();
  require('../lib/db').closeDb();
  ['', '-wal', '-shm'].forEach((s) => { try { fs.unlinkSync(DB + s); } catch (_) {} });
});

// ===========================================================================
//  1. OUVERTURE DE S2 : ZÉRO PRÉPARATION
// ===========================================================================

test('S2 s\'ouvre avec l\'action créée en S1, sans rien chercher', async () => {
  const r = await api('GET', routeSeance(CLI, 2), null, jetons[COACH_A]);
  assert.strictEqual(r.status, 200);
  const s = r.body.seance;

  assert.strictEqual(s.protocole, S.PROTOCOLE_SUIVI, 'S2 relève du protocole de suivi');
  assert.strictEqual(s.existe, false, 'rien n\'a encore été saisi');
  // L'action à évaluer est bien celle décidée à l'Étape précédente.
  assert.strictEqual(s.action.intitule, 'Action de l\'Étape 1');
  assert.strictEqual(s.action.numero, 1);
  assert.strictEqual(s.action.statut, S.ACTION_ACTIVE);
  assert.strictEqual(s.action.frequence, '5 fois par semaine');
});

test('S2 remonte ce qui s\'est dit au rendez-vous précédent', async () => {
  const r = await api('GET', routeSeance(CLI, 2), null, jetons[COACH_A]);
  const p = r.body.seance.precedent;
  assert.ok(p, 'le contexte du rendez-vous précédent est fourni');
  assert.strictEqual(p.numero, 1);
  assert.strictEqual(p.objectif.choix, 'perte');
  assert.ok(p.objectif.texte.includes('8 kg'));
  assert.deepStrictEqual(p.difficultes.choix, ['temps', 'sucre']);
  // Les notes internes du coach ne font PAS partie du contexte remonté.
  assert.strictEqual(p.noteCoach, undefined);
});

test('l\'historique contient déjà S1', async () => {
  const r = await api('GET', routeSeance(CLI, 2), null, jetons[COACH_A]);
  const h = r.body.seance.historique;
  assert.strictEqual(h.length, 1);
  assert.strictEqual(h[0].numero, 1);
  assert.strictEqual(h[0].actionDecidee, 'Action de l\'Étape 1');
  assert.strictEqual(h[0].actionSuivie, null, 'S1 n\'évalue aucune action précédente');
  assert.strictEqual(h[0].objectif.choix, 'perte', 'l\'objectif reste consultable');
});

// ===========================================================================
//  2. BROUILLON : IL NE DOIT TOUCHER À RIEN
// ===========================================================================

test('un brouillon de S2 s\'enregistre et se retrouve', async () => {
  const r = await api('PUT', routeSeance(CLI_2, 2), {
    donnees: { actionPrecedente: { resultat: 'realisee', commentaire: 'Bien tenue.' }, bilan: { reussites: 'Motivé' } },
    action: { intitule: '' }, noteCoach: 'À creuser : sommeil.',
  }, jetons[COACH_A]);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.brouillon, true);

  // Nouvelle session : c'est bien le serveur qui garde le brouillon.
  await connecter(COACH_A, '2002');
  const relu = await api('GET', routeSeance(CLI_2, 2), null, jetons[COACH_A]);
  assert.strictEqual(relu.body.seance.donnees.actionPrecedente.resultat, 'realisee');
  assert.strictEqual(relu.body.seance.donnees.actionPrecedente.commentaire, 'Bien tenue.');
  assert.strictEqual(relu.body.seance.donnees.bilan.reussites, 'Motivé');
  assert.strictEqual(relu.body.seance.noteCoach, 'À creuser : sommeil.');
});

test('le brouillon ne valide pas l\'Étape et ne change pas l\'action active', async () => {
  const b = await api('GET', `/api/boost/coach/dossiers/${dossiers[CLI_2]}`, null, jetons[COACH_A]);
  assert.strictEqual(b.body.boost.etapesValidees, 1, 'toujours à l\'Étape 1');
  assert.strictEqual(b.body.boost.etapeCourante, 2);

  const s = await api('GET', routeSeance(CLI_2, 2), null, jetons[COACH_A]);
  // Le client suit encore l'action de S1 : la remplacer sur un brouillon
  // reviendrait à changer sa consigne sans que le rendez-vous ait eu lieu.
  assert.strictEqual(s.body.seance.action.intitule, 'Action de l\'Étape 1');
  assert.strictEqual(s.body.seance.action.numero, 1);
  assert.strictEqual(s.body.seance.action.resultat, null, 'aucun résultat enregistré');
  const actives = s.body.seance.actions.filter((a) => a.statut === S.ACTION_ACTIVE);
  assert.strictEqual(actives.length, 1);
});

test('les données de suivi ne sont pas effacées par le nettoyage de S1', async () => {
  // Le piège du protocole unique : sans aiguillage par Étape, enregistrer un
  // brouillon de S2 le ferait passer par le nettoyage de S1, qui ne connaît
  // aucun de ses champs et les jetterait tous, sans un mot.
  const s = await api('GET', routeSeance(CLI_2, 2), null, jetons[COACH_A]);
  const d = s.body.seance.donnees;
  assert.ok(d.actionPrecedente, 'actionPrecedente survit');
  assert.ok(d.bilan, 'bilan survit');
  assert.strictEqual(d.objectif, undefined, 'et les champs de S1 ne sont pas fabriqués');
});

test('une valeur hors liste est refusée plutôt que stockée', async () => {
  await api('PUT', routeSeance(CLI_2, 2), {
    donnees: { actionPrecedente: { resultat: 'excellent' }, decision: 'abandonner', adhesion: 42 },
    action: { intitule: '' },
  }, jetons[COACH_A]);
  const s = await api('GET', routeSeance(CLI_2, 2), null, jetons[COACH_A]);
  assert.strictEqual(s.body.seance.donnees.actionPrecedente.resultat, '', 'résultat inconnu effacé');
  assert.strictEqual(s.body.seance.donnees.decision, '', 'décision inconnue effacée');
  assert.strictEqual(s.body.seance.donnees.adhesion, null, 'note hors bornes effacée');
});

// ===========================================================================
//  3. VALIDATION : CE QUI MANQUE EST NOMMÉ
// ===========================================================================

test('les quatre conditions de validation sont énoncées, et nommées', async () => {
  const r = await api('POST', routeSeance(CLI_2, 2, '/valider'), { donnees: {}, action: {} }, jetons[COACH_A]);
  assert.strictEqual(r.status, 400);
  assert.deepStrictEqual(r.body.manque, [
    'le résultat de l\'action précédente',
    'la décision sur cette action (continuer, ajuster ou changer)',
    'l\'action jusqu\'au prochain rendez-vous',
    'la note d\'adhésion du client (1 à 10)',
  ]);
});

test('chaque condition manque séparément', async () => {
  const cas = [
    [{ donnees: { actionPrecedente: { resultat: '' } } }, 'le résultat de l\'action précédente'],
    [{ donnees: { decision: '' } }, 'la décision sur cette action (continuer, ajuster ou changer)'],
    [{ action: { intitule: '  ' } }, 'l\'action jusqu\'au prochain rendez-vous'],
    [{ donnees: { adhesion: null } }, 'la note d\'adhésion du client (1 à 10)'],
  ];
  for (const [amputation, attendu] of cas) {
    const corps = suivi(2);
    if (amputation.donnees) Object.assign(corps.donnees, amputation.donnees);
    if (amputation.action) corps.action = amputation.action;
    const r = await api('POST', routeSeance(CLI_2, 2, '/valider'), corps, jetons[COACH_A]);
    assert.strictEqual(r.status, 400, attendu);
    assert.deepStrictEqual(r.body.manque, [attendu]);
  }
});

test('une adhésion hors de 1-10 ne passe pas pour renseignée', async () => {
  for (const note of [0, 11, 5.5, -3, 'huit']) {
    const corps = suivi(2);
    corps.donnees.adhesion = note;
    const r = await api('POST', routeSeance(CLI_2, 2, '/valider'), corps, jetons[COACH_A]);
    assert.strictEqual(r.status, 400, 'note ' + note);
  }
});

test('un refus ne laisse aucune trace', async () => {
  const b = await api('GET', `/api/boost/coach/dossiers/${dossiers[CLI_2]}`, null, jetons[COACH_A]);
  assert.strictEqual(b.body.boost.etapesValidees, 1);
  const s = await api('GET', routeSeance(CLI_2, 2), null, jetons[COACH_A]);
  assert.strictEqual(s.body.seance.statut, S.SEANCE_BROUILLON);
  assert.strictEqual(s.body.seance.action.numero, 1, 'l\'action de S1 est toujours active');
});

// ===========================================================================
//  4. VALIDATION COMPLÈTE : LE CHAÎNAGE
// ===========================================================================

test('valider S2 historise l\'ancienne action et en active une seule nouvelle', async () => {
  const r = await api('POST', routeSeance(CLI, 2, '/valider'), suivi(2), jetons[COACH_A]);
  assert.strictEqual(r.status, 200);

  const s = r.body.seance;
  const actions = s.actions;
  assert.strictEqual(actions.length, 2);

  const ancienne = actions.find((a) => a.numero === 1);
  assert.strictEqual(ancienne.statut, S.ACTION_REMPLACEE, 'l\'ancienne est historisée, pas supprimée');
  assert.strictEqual(ancienne.resultat, 'partielle', 'son résultat est inscrit sur elle');
  assert.ok(ancienne.commentaireResultat.includes('3 jours sur 5'));
  assert.strictEqual(ancienne.evalueeAEtape, 2, 'on sait quel rendez-vous l\'a évaluée');
  assert.strictEqual(ancienne.evalueePar, COACH_A);
  assert.strictEqual(ancienne.evalueeLe, aujourdhui());

  const nouvelle = actions.find((a) => a.numero === 2);
  assert.strictEqual(nouvelle.statut, S.ACTION_ACTIVE);
  assert.strictEqual(nouvelle.intitule, 'Action de l\'Étape 2');
  assert.strictEqual(nouvelle.adhesion, 7, 'l\'adhésion est portée par l\'action');
  assert.strictEqual(nouvelle.creePar, COACH_A);

  assert.strictEqual(actions.filter((a) => a.statut === S.ACTION_ACTIVE).length, 1,
    'une seule action active — l\'invariant du dispositif');
});

test('l\'Étape 2 est validée, datée, attribuée, et l\'Étape 3 débloquée', async () => {
  const b = await api('GET', `/api/boost/coach/dossiers/${dossiers[CLI]}`, null, jetons[COACH_A]);
  assert.strictEqual(b.body.boost.etapesValidees, 2);
  assert.strictEqual(b.body.boost.etapeCourante, 3, 'on passe automatiquement à l\'Étape suivante');
  assert.strictEqual(b.body.boost.etapes[1].statut, 'validee');
  assert.strictEqual(b.body.boost.etapes[1].valideeLe, aujourdhui());
  assert.strictEqual(b.body.boost.etapes[1].valideePar, COACH_A);
  assert.strictEqual(b.body.boost.statut, B.STATUT_EN_COURS, 'le Boost reste en cours');
});

test('« continuer » crée quand même une nouvelle action, pour ne pas trouer l\'historique', async () => {
  const corps = suivi(3);
  corps.donnees.decision = 'continuer';
  corps.action = { intitule: 'Action de l\'Étape 2', detail: '', frequence: '3 fois par semaine' };
  const r = await api('POST', routeSeance(CLI, 3, '/valider'), corps, jetons[COACH_A]);
  assert.strictEqual(r.status, 200);

  const actions = r.body.seance.actions;
  assert.strictEqual(actions.length, 3, 'une ligne par Étape, même à intitulé identique');
  assert.strictEqual(actions.filter((a) => a.numero === 3).length, 1);
  assert.strictEqual(actions.find((a) => a.numero === 3).statut, S.ACTION_ACTIVE);
  assert.strictEqual(actions.find((a) => a.numero === 2).statut, S.ACTION_REMPLACEE);
});

test('S3 évalue bien l\'action de S2, pas une autre', async () => {
  // Le chaînage : à l'Étape n on évalue l'action créée à l'Étape n-1. S'il
  // glissait d'un cran, le coach verrait la mauvaise action devant son client.
  const h = (await api('GET', routeSeance(CLI, 4), null, jetons[COACH_A])).body.seance.historique;
  const etape3 = h.find((x) => x.numero === 3);
  assert.strictEqual(etape3.actionSuivie, 'Action de l\'Étape 2');
  assert.strictEqual(etape3.actionDecidee, 'Action de l\'Étape 2', 'décision « continuer »');
  assert.strictEqual(etape3.decision, 'continuer');
  assert.strictEqual(etape3.adhesion, 7);
});

// ===========================================================================
//  5. LA BOUCLE ENTIÈRE : LE MÊME ÉCRAN DE S2 À S11
// ===========================================================================

test('le protocole se joue à l\'identique de l\'Étape 4 à l\'Étape 11', async () => {
  for (let n = 4; n <= 11; n++) {
    const ouverture = await api('GET', routeSeance(CLI, n), null, jetons[COACH_A]);
    assert.strictEqual(ouverture.body.seance.protocole, S.PROTOCOLE_SUIVI, `protocole de l'Étape ${n}`);
    assert.strictEqual(ouverture.body.seance.action.numero, n - 1,
      `l'Étape ${n} évalue l'action créée à l'Étape ${n - 1}`);

    const r = await api('POST', routeSeance(CLI, n, '/valider'), suivi(n), jetons[COACH_A]);
    assert.strictEqual(r.status, 200, `validation de l'Étape ${n}`);
    assert.strictEqual(r.body.boost.etapesValidees, n);
    assert.strictEqual(r.body.seance.actions.filter((a) => a.statut === S.ACTION_ACTIVE).length, 1,
      `une seule action active après l'Étape ${n}`);
  }
  const b = await api('GET', `/api/boost/coach/dossiers/${dossiers[CLI]}`, null, jetons[COACH_A]);
  assert.strictEqual(b.body.boost.etapeCourante, 12);
});

test('les dix Étapes ont été validées le même jour, sans délai imposé', async () => {
  // Arbitrage validé : la contrainte porte sur l'ORDRE et sur la fenêtre de 16
  // semaines, pas sur un espacement entre rendez-vous.
  const b = await api('GET', `/api/boost/coach/dossiers/${dossiers[CLI]}`, null, jetons[COACH_A]);
  const dates = b.body.boost.etapes.filter((e) => e.statut === 'validee').map((e) => e.valideeLe);
  assert.strictEqual(dates.length, 11);
  assert.strictEqual(new Set(dates).size, 1, 'toutes le même jour : aucun délai minimum');
});

test('l\'historique raconte les onze rendez-vous, dans l\'ordre', async () => {
  const h = (await api('GET', routeSeance(CLI, 12), null, jetons[COACH_A])).body.seance.historique;
  assert.strictEqual(h.length, 11);
  assert.deepStrictEqual(h.map((x) => x.numero), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

  const parNumero = new Map(h.map((x) => [x.numero, x]));
  for (const e of h.filter((x) => x.numero >= 2)) {
    assert.ok(e.valideeLe, `Étape ${e.numero} : date`);
    assert.ok(e.resultat, `Étape ${e.numero} : résultat`);
    assert.ok(e.decision, `Étape ${e.numero} : décision`);
    assert.ok(e.actionDecidee, `Étape ${e.numero} : action décidée`);
    assert.strictEqual(e.adhesion, 7, `Étape ${e.numero} : adhésion`);
    // LE CHAÎNAGE : l'action suivie pendant une Étape est exactement celle
    // décidée à la précédente. On compare les deux entrées de l'historique
    // plutôt que des intitulés attendus — l'Étape 3 a reconduit celle de
    // l'Étape 2 (décision « continuer »), et le chaînage doit tenir quand même.
    assert.strictEqual(e.actionSuivie, parNumero.get(e.numero - 1).actionDecidee,
      `Étape ${e.numero} : elle doit évaluer l'action décidée à l'Étape ${e.numero - 1}`);
  }
  // Les notes du coach ne sont PAS dans l'historique : elles ont leur zone.
  assert.ok(!JSON.stringify(h).includes('Note interne'), 'aucune note interne dans l\'historique');
});

test('l\'ordre reste strict : on ne saute pas d\'Étape', async () => {
  const r = await api('POST', routeSeance(CLI_2, 4, '/valider'), suivi(4), jetons[COACH_A]);
  assert.strictEqual(r.status, 409);
  assert.ok(/doit être validée avant/.test(r.body.error));
});

// ===========================================================================
//  6. VERROUILLAGE
// ===========================================================================

test('une Étape validée ne se revalide ni ne se réécrit', async () => {
  const revalider = await api('POST', routeSeance(CLI, 2, '/valider'), suivi(2), jetons[COACH_A]);
  assert.strictEqual(revalider.status, 409);
  assert.ok(/déjà été validée/.test(revalider.body.error));

  const reecrire = await api('PUT', routeSeance(CLI, 2), suivi(2), jetons[COACH_A]);
  assert.strictEqual(reecrire.status, 409);

  // Le contenu d'origine est intact.
  const s = await api('GET', routeSeance(CLI, 2), null, jetons[COACH_A]);
  assert.strictEqual(s.body.seance.donnees.decision, 'ajuster');
  assert.strictEqual(s.body.seance.statut, S.SEANCE_VALIDEE);
});

// ===========================================================================
//  7. ATOMICITÉ
// ===========================================================================

test('si l\'Étape ne peut pas être validée, rien n\'est écrit', async () => {
  // Un Boost interrompu : la validation de l'Étape échouera. Ni la séance, ni la
  // nouvelle action, ni le résultat de l'ancienne ne doivent survivre.
  await api('POST', `/api/boost/admin/dossiers/${dossiers[CLI_2]}/interruption`,
    { motif: 'Interruption pour éprouver l\'atomicité du rendez-vous de suivi.' }, jetons[ADMIN]);

  const db = require('../lib/db').getDb();
  const avant = db.prepare('SELECT COUNT(*) AS n FROM boost_actions WHERE boost_id = ?').get(dossiers[CLI_2]).n;

  const r = await api('POST', routeSeance(CLI_2, 2, '/valider'), suivi(2), jetons[COACH_A]);
  assert.strictEqual(r.status, 409);

  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM boost_actions WHERE boost_id = ?').get(dossiers[CLI_2]).n,
    avant, 'aucune action créée');
  const seance = db.prepare('SELECT statut FROM boost_seances WHERE boost_id = ? AND numero = 2').get(dossiers[CLI_2]);
  assert.strictEqual(seance.statut, S.SEANCE_BROUILLON, 'la séance reste un brouillon');
  // Et surtout : l'action de S1 n'a pas été évaluée ni remplacée.
  const a1 = db.prepare('SELECT statut, resultat FROM boost_actions WHERE boost_id = ? AND numero = 1').get(dossiers[CLI_2]);
  assert.strictEqual(a1.statut, S.ACTION_ACTIVE);
  assert.strictEqual(a1.resultat, null);
});

// ===========================================================================
//  8. SÉCURITÉ
// ===========================================================================

test('un coach ne touche pas au rendez-vous de suivi d\'un confrère', async () => {
  const r0 = await api('POST', `/api/boost/coach/dossiers/${dossiers[CLI_B]}/seances/1/valider`, S1_COMPLET, jetons[COACH_B]);
  assert.strictEqual(r0.status, 200, 'préparation : S1 du client de Sophie');

  for (const [m, suffixe] of [['GET', ''], ['PUT', ''], ['POST', '/valider']]) {
    const r = await api(m, `/api/boost/coach/dossiers/${dossiers[CLI_B]}/seances/2${suffixe}`,
      m === 'GET' ? null : suivi(2), jetons[COACH_A]);
    assert.strictEqual(r.status, 404, `${m} chez le confrère`);
    assert.ok(!r.txt.includes('hugo'));
  }
});

test('non certifié, client et anonyme sont tous refusés', async () => {
  const cas = [[jetons[COLLAB], 403], [jetons[CLI], 403], [undefined, 401]];
  for (const [jeton, attendu] of cas) {
    for (const [m, suffixe] of [['GET', ''], ['PUT', ''], ['POST', '/valider']]) {
      const r = await api(m, routeSeance(CLI, 4, suffixe), m === 'GET' ? null : suivi(4), jeton);
      assert.strictEqual(r.status, attendu, `${m} avec jeton ${jeton ? 'restreint' : 'absent'}`);
    }
  }
});

test('retirer la certification coupe le rendez-vous immédiatement', async () => {
  await api('PUT', `/api/boost/admin/certification/${COACH_A}`, { statut: 'suspendu', evaluateur: 'Stan Martin' }, jetons[ADMIN]);
  const r = await api('GET', routeSeance(CLI, 12), null, jetons[COACH_A]);
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.body.nonCertifie, true);
  await api('PUT', `/api/boost/admin/certification/${COACH_A}`,
    { statut: 'certifie', evaluateur: 'Stan Martin', dateCertification: '2026-07-15', scoreQcm: 88, resultatPratique: 'valide' }, jetons[ADMIN]);
  assert.strictEqual((await api('GET', routeSeance(CLI, 12), null, jetons[COACH_A])).status, 200);
});

test('les notes de suivi ne sortent que par les routes Coach', async () => {
  const coach = await api('GET', routeSeance(CLI, 5), null, jetons[COACH_A]);
  assert.ok(coach.body.seance.noteCoach.includes('Note interne'), 'la note existe côté coach');

  for (const [quoi, r] of [
    ['admin, fiche', await api('GET', `/api/boost/admin/dossiers/${dossiers[CLI]}`, null, jetons[ADMIN])],
    ['admin, journal', await api('GET', `/api/boost/admin/dossiers/${dossiers[CLI]}/journal`, null, jetons[ADMIN])],
    ['client, son dossier', await api('GET', '/api/boost/mien', null, jetons[CLI])],
  ]) {
    assert.strictEqual(r.status, 200, quoi);
    assert.ok(!r.txt.includes('Note interne'), 'note visible dans : ' + quoi);
    assert.ok(!/noteCoach/.test(r.txt), 'champ noteCoach présent dans : ' + quoi);
  }
});

test('le client ne voit pas le contenu de ses rendez-vous', async () => {
  const r = await api('GET', '/api/boost/mien', null, jetons[CLI]);
  assert.strictEqual(r.body.actuel.etapesValidees, 11);
  assert.ok(!r.txt.includes('Action de l\'Étape'), 'aucune action servie au client dans ce lot');
  assert.ok(!r.txt.includes('partielle'), 'aucun résultat servi au client');
});

// ===========================================================================
//  9. L'ÉCRAN
// ===========================================================================

test('l\'écran de suivi suit l\'ordre demandé', () => {
  const bloc = js.slice(js.indexOf('function formSuivi'));
  // Ancres sans apostrophe : dans la source JS elles sont échappées.
  const ordre = ['Ton action depuis le dernier rendez-vous', 'Comment ça s',
    'Que fait-on de cette action', 'Ton action jusqu',
    'À quel point tu te sens capable', 'blocNotes()', 'Valider le rendez-vous'];
  let position = -1;
  for (const titre of ordre) {
    const i = bloc.indexOf(titre);
    assert.ok(i > position, 'ordre rompu à : ' + titre);
    position = i;
  }
});

test('un seul écran sert toutes les Étapes de suivi', () => {
  // La garantie du « pas dix écrans » : aucune fonction ni branche par numéro.
  assert.strictEqual((js.match(/function formSuivi/g) || []).length, 1);
  assert.ok(!/formS[2-9]|formS1[01]|rendreS[2-9]/.test(js), 'aucun écran par Étape');
  // L'aiguillage se fait sur le protocole renvoyé par le serveur, pas sur un
  // numéro recalculé côté écran.
  assert.ok(/rdv\.seance\.protocole === 'suivi'/.test(js), 'aiguillage par protocole');
});

test('l\'action à venir est la seule zone mise en avant', () => {
  assert.ok(/\.ec-rdv-action\s*\{[^}]*var\(--saphir-soft\)/.test(css), 'fond distinct pour l\'action');
  // L'action précédente est distinguée, mais en sable : elle ne doit pas voler
  // la vedette à celle qu'on décide.
  assert.ok(/\.ec-rdv-prec\s*\{[^}]*surface-soft/.test(css));
});

test('les résultats sont des constats, jamais des notes', () => {
  const bloc = js.slice(js.indexOf('const RESULTATS'), js.indexOf('const DECISIONS'));
  assert.ok(bloc.includes('Réalisée') && bloc.includes('Partiellement réalisée') && bloc.includes('Non réalisée'));
  // Aucun vocabulaire de notation ni de reproche dans ce que le coach VOIT.
  // On retire les commentaires du code avant de juger : ils parlent du code,
  // pas au client (« pas un score » y figure légitimement).
  const suiviJs = js.slice(js.indexOf('function formSuivi'), js.indexOf('function bloc('))
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.ok(!/échec|raté|mauvais|score|insuffisant|discipline/i.test(suiviJs), 'aucun vocabulaire de jugement');
  assert.ok(/constat/i.test(suiviJs), 'le mot « constat » est employé au client');
});

test('les fonctions de rendu du suivi produisent un écran complet', () => {
  const ctx = {
    document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: async () => ({ json: async () => ({}) }),
    window: { scrollTo() {} }, console,
  };
  vm.createContext(ctx);
  vm.runInContext(js + ';globalThis.__ec = { poser: (v) => { rdv = v; }, formSuivi, vueHistorique };', ctx);
  const ec = ctx.__ec;

  ec.poser({
    boost: { id: 1, etapesTotal: 12 }, numero: 5,
    seance: {
      protocole: 'suivi', numero: 5, donnees: {},
      action: { intitule: 'Préparer mon déjeuner la veille', frequence: '3 fois par semaine', detail: '', adhesion: 8 },
      precedent: { numero: 4, valideeLe: '2026-08-01', objectif: { choix: 'perte', texte: 'Perdre 8 kg' }, difficultes: { choix: ['temps'] }, bilan: {} },
      historique: [], noteCoach: '',
    },
  });
  const s = ec.formSuivi();
  assert.ok(!/undefined|NaN|\[object Object\]/.test(s), 'aucun trou : ' + s.slice(0, 200));
  assert.ok(s.includes('Étape 5/12'));
  assert.ok(s.includes('Préparer mon déjeuner la veille'), 'l\'action précédente est affichée');
  assert.ok(s.includes('3 fois par semaine'));
  assert.ok(s.includes('Adhésion annoncée : 8/10'));
  assert.ok(s.includes('dernier point le 01/08/2026'));
  assert.ok(s.includes('Perdre 8 kg'), 'le rappel du rendez-vous précédent');
  // Les dix notes d'adhésion sont proposées.
  assert.strictEqual((s.match(/name="svAdh"/g) || []).length, 10);
  assert.ok(/fait passer à l.{0,6}Étape 6/.test(s), 'la validation annonce l\'Étape suivante');
});

test('sans action précédente, l\'écran le dit au lieu d\'afficher un trou', () => {
  const ctx = {
    document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: async () => ({ json: async () => ({}) }), window: { scrollTo() {} }, console,
  };
  vm.createContext(ctx);
  vm.runInContext(js + ';globalThis.__ec = { poser: (v) => { rdv = v; }, formSuivi, vueHistorique };', ctx);
  ctx.__ec.poser({
    boost: { id: 1, etapesTotal: 12 }, numero: 2,
    seance: { protocole: 'suivi', numero: 2, donnees: {}, action: null, precedent: null, historique: [], noteCoach: '' },
  });
  const s = ctx.__ec.formSuivi();
  assert.ok(s.includes('Aucune action active trouvée'));
  assert.ok(!/undefined|null/.test(s.replace(/null"/g, '')), 'pas de « null » affiché');
});

test('l\'historique rendu échappe ce que saisissent les utilisateurs', () => {
  const ctx = {
    document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: async () => ({ json: async () => ({}) }), window: { scrollTo() {} }, console,
  };
  vm.createContext(ctx);
  vm.runInContext(js + ';globalThis.__ec = { vueHistorique };', ctx);
  const s = ctx.__ec.vueHistorique({
    historique: [{ numero: 2, valideeLe: '2026-08-10', actionSuivie: '<img src=x onerror=alert(1)>',
      resultat: 'partielle', commentaireResultat: '', decision: 'ajuster', actionDecidee: 'Suite', adhesion: 6 }],
  });
  assert.ok(!s.includes('<img src=x'), 'échappé');
  assert.ok(s.includes('&lt;img'));
  assert.ok(s.includes('Partiellement réalisée'));
  assert.ok(s.includes('adhésion 6/10'));
});
