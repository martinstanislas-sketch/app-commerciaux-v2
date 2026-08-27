'use strict';
// ============================================================================
//  S12 — BILAN FINAL ET AUTONOMIE.
//
//  Le dernier rendez-vous n'est pas un suivi de plus : il ne crée AUCUNE action
//  de semaine. C'est la propriété centrale de ce lot, et celle qui casserait
//  sans bruit — un Boost terminé avec une action encore active voudrait dire
//  qu'une consigne hebdomadaire court toujours alors que l'accompagnement est
//  fini. Personne ne le verrait ; le client, si.
//
//  Deux autres choses se jouent ici :
//   - le RAPPEL du point de départ et la SYNTHÈSE des actions doivent se
//     reconstituer seuls. Si le coach doit ressaisir quoi que ce soit, la
//     promesse « zéro préparation » tombe au moment où elle compte le plus ;
//   - le PLAN D'AUTONOMIE doit survivre à la fin du Boost, sinon le client
//     repart les mains vides.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const vm = require('node:vm');

const DB = path.join(os.tmpdir(), `nutri-boost-s12-test-${process.pid}.sqlite`);
process.env.NUTRITION_DB = DB;
process.env.ADMIN_EMAIL = 'patron@exemple.fr';

const app = require('../server');
// Depuis le lot 4, un Coach Nutrition certifié s'amorce par le PARCOURS RÉEL :
// contenus, QCM, évaluation pratique, puis délivrance. La porte directe du
// Boost est fermée — et chaque suite prouve donc la chaîne en passant.
const { certifierViaAcademy } = require('./aideAcademy');
const B = require('../lib/boost');
const S = require('../lib/boostSeances');
let srv, base;

const ADMIN = 'patron@exemple.fr';
const COACH_A = 'quentin@exemple.fr';
const COACH_B = 'sophie@exemple.fr';
const COLLAB = 'theo@exemple.fr';
const CLI = 'lea@exemple.fr';        // mené jusqu'au bilan
const CLI_2 = 'marc@exemple.fr';     // brouillons et refus (son Boost finit par se terminer)
const CLI_3 = 'nora@exemple.fr';     // réservé à l'atomicité : doit rester à l'Étape 11
const CLI_B = 'hugo@exemple.fr';     // client du confrère
const jetons = {};
const dossiers = {};

const PUBLIC = path.join(__dirname, '..', 'public');
const jsCoquille = fs.readFileSync(path.join(PUBLIC, 'coach.js'), 'utf8');
const jsRdv = fs.readFileSync(path.join(PUBLIC, 'coachRdv.js'), 'utf8');
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
    habitudes: { petitDejeuner: 'Café seul', diner: 'Tard, vers 21h30', collations: 'Biscuits vers 17h' },
    difficultes: { choix: ['temps', 'sucre'], precision: 'Craque le dimanche soir.' },
    journalPhotoExplique: true,
  },
  action: { intitule: 'Action de l\'Étape 1', frequence: '5 fois par semaine' },
  noteCoach: 'Note interne de S1.',
};
const suivi = (n) => ({
  donnees: {
    actionPrecedente: { resultat: 'realisee', commentaire: `Constat de l'Étape ${n}.` },
    bilan: { reussites: '', difficultes: '', observations: '' },
    decision: 'ajuster', adhesion: 7,
  },
  action: { intitule: `Action de l'Étape ${n}`, frequence: '3 fois par semaine' },
  noteCoach: `Note interne de l'Étape ${n}.`,
});
const BILAN_COMPLET = {
  donnees: {
    actionPrecedente: { resultat: 'partielle', commentaire: 'Tenue quatre jours sur sept.' },
    bilan: {
      progres: 'Six kilos en moins et un sommeil bien meilleur.',
      plusFacile: 'Préparer ses repas ne lui demande plus d\'effort.',
      appris: 'Qu\'un petit-déjeuner salé la tient jusqu\'à midi.',
    },
    regles: ['Préparer mes déjeuners la veille', 'Une source de protéines à chaque repas', 'Boire un litre avant midi'],
    fragiles: 'Les week-ends et les repas au restaurant.',
    confiance: 8,
  },
  noteCoach: 'Note interne du bilan : très autonome, ne pas la relancer trop tôt.',
};

const routeSeance = (cli, n, suffixe) => `/api/boost/coach/dossiers/${dossiers[cli]}/seances/${n}${suffixe || ''}`;

async function connecter(email, pin) {
  const r = await api('POST', '/account/login', { email, prenom: email.split('@')[0], pin });
  jetons[email] = r.body.token;
}

// Mène un dossier de S1 jusqu'à l'Étape `jusqua` incluse.
async function mener(cli, jusqua, jeton) {
  const s1 = await api('POST', routeSeance(cli, 1, '/valider'), S1_COMPLET, jeton);
  assert.strictEqual(s1.status, 200, 'préparation S1 de ' + cli);
  for (let n = 2; n <= jusqua; n++) {
    const r = await api('POST', routeSeance(cli, n, '/valider'), suivi(n), jeton);
    assert.strictEqual(r.status, 200, `préparation Étape ${n} de ${cli}`);
  }
}

test.before(async () => {
  await new Promise((r) => { srv = app.listen(0, r); });
  base = `http://127.0.0.1:${srv.address().port}`;
  app.boost.assurerSchema();
  for (const [e, p] of [[ADMIN, '7777'], [COACH_A, '2002'], [COACH_B, '3003'], [COLLAB, '4004'],
    [CLI, '1001'], [CLI_2, '5005'], [CLI_3, '6006'], [CLI_B, '9009']]) await connecter(e, p);

  const T = jetons[ADMIN];
  for (const e of [COACH_A, COACH_B, COLLAB]) {
    await api('POST', '/api/boost/admin/collaborateurs', { email: e, role: 'collaborateur' }, T);
  }
  for (const e of [COACH_A, COACH_B]) {
    await certifierViaAcademy({ api, admin: ADMIN, jetonAdmin: T,
        email: e, jeton: jetons[e] });
  }
  await api('PUT', `/api/boost/admin/certification/${COLLAB}`, { statut: 'en_cours', evaluateur: 'Stan Martin' }, T);

  for (const [cli, coach] of [[CLI, COACH_A], [CLI_2, COACH_A], [CLI_3, COACH_A], [CLI_B, COACH_B]]) {
    const r = await api('POST', '/api/boost/admin/dossiers', { clientEmail: cli, coachEmail: coach }, T);
    dossiers[cli] = r.body.boost.id;
  }
  await mener(CLI, 11, jetons[COACH_A]);
  await mener(CLI_2, 11, jetons[COACH_A]);
  await mener(CLI_3, 11, jetons[COACH_A]);
});

test.after(() => {
  if (srv) srv.close();
  require('../lib/db').closeDb();
  ['', '-wal', '-shm'].forEach((s) => { try { fs.unlinkSync(DB + s); } catch (_) {} });
});

// ===========================================================================
//  1. ORDRE : S12 NE PASSE PAS AVANT LES AUTRES
// ===========================================================================

test('S12 est impossible tant que S1-S11 ne sont pas faites', async () => {
  const neuf = await api('POST', '/api/boost/admin/dossiers',
    { clientEmail: 'tardif@exemple.fr', coachEmail: COACH_A }, jetons[ADMIN]);
  assert.strictEqual(neuf.status, 404, 'le compte doit exister d\'abord');

  // Sur un dossier arrêté à l'Étape 5, le bilan est refusé.
  await connecter('etape5@exemple.fr', '3131');
  const cree = await api('POST', '/api/boost/admin/dossiers',
    { clientEmail: 'etape5@exemple.fr', coachEmail: COACH_A }, jetons[ADMIN]);
  const id = cree.body.boost.id;
  dossiers.etape5 = id;
  await api('POST', `/api/boost/coach/dossiers/${id}/seances/1/valider`, S1_COMPLET, jetons[COACH_A]);
  for (let n = 2; n <= 5; n++) {
    await api('POST', `/api/boost/coach/dossiers/${id}/seances/${n}/valider`, suivi(n), jetons[COACH_A]);
  }
  const r = await api('POST', `/api/boost/coach/dossiers/${id}/seances/12/valider`, BILAN_COMPLET, jetons[COACH_A]);
  assert.strictEqual(r.status, 409);
  assert.ok(/doit être validée avant/.test(r.body.error));
});

// ===========================================================================
//  2. ZÉRO PRÉPARATION : LE RAPPEL ET LA SYNTHÈSE SE RECONSTITUENT SEULS
// ===========================================================================

test('S12 s\'ouvre avec le point de départ, sans rien ressaisir', async () => {
  const r = await api('GET', routeSeance(CLI, 12), null, jetons[COACH_A]);
  assert.strictEqual(r.status, 200);
  const d = r.body.seance.depart;

  assert.ok(d, 'le point de départ est fourni');
  assert.strictEqual(d.objectif.choix, 'perte');
  assert.ok(d.objectif.texte.includes('8 kg'));
  assert.deepStrictEqual(d.difficultes.choix, ['temps', 'sucre']);
  assert.ok(d.difficultes.precision.includes('dimanche'));
  // Les habitudes de S1 aussi : elles n'étaient plus affichées nulle part.
  assert.strictEqual(d.habitudes.diner, 'Tard, vers 21h30');
  assert.strictEqual(d.habitudes.collations, 'Biscuits vers 17h');
  assert.strictEqual(d.valideeLe, aujourdhui(), 'la date de démarrage du Boost');
});

test('S12 présente la synthèse des actions travaillées', async () => {
  const r = await api('GET', routeSeance(CLI, 12), null, jetons[COACH_A]);
  const s = r.body.seance.synthese;
  assert.strictEqual(s.length, 11, 'une ligne par action décidée, de S1 à S11');

  const premiere = s[0];
  assert.strictEqual(premiere.numero, 1);
  assert.strictEqual(premiere.intitule, 'Action de l\'Étape 1');
  assert.strictEqual(premiere.resultat, 'realisee', 'constatée à l\'Étape 2');
  assert.strictEqual(premiere.decision, 'ajuster', 'la décision prise à l\'Étape 2');

  // La dernière n'a jamais été constatée : aucun rendez-vous ne l'a suivie.
  // Avant le bilan, la dernière action n'a pas encore de verdict : aucun
  // rendez-vous ne l'a suivie. C'est S12 qui va le poser.
  const derniere = s[s.length - 1];
  assert.strictEqual(derniere.numero, 11);
  assert.strictEqual(derniere.resultat, null, 'le résultat n\'existe pas encore, on ne l\'invente pas');
  assert.strictEqual(derniere.decision, null);
  assert.strictEqual(derniere.adhesion, 7);
});

test('le protocole du bilan est annoncé par le serveur', async () => {
  const r = await api('GET', routeSeance(CLI, 12), null, jetons[COACH_A]);
  assert.strictEqual(r.body.seance.protocole, S.PROTOCOLE_BILAN);
  // Un rendez-vous de suivi, lui, ne porte ni départ ni synthèse : les calculer
  // partout coûterait deux requêtes de plus à chaque ouverture pour rien.
  const suiviOuvert = await api('GET', routeSeance(dossiers.etape5 ? 'etape5' : CLI, 6), null, jetons[COACH_A]);
  if (suiviOuvert.status === 200) {
    assert.strictEqual(suiviOuvert.body.seance.depart, null);
    assert.strictEqual(suiviOuvert.body.seance.synthese, null);
  }
});

// ===========================================================================
//  3. BROUILLON
// ===========================================================================

test('le brouillon du bilan s\'enregistre et se retrouve', async () => {
  const r = await api('PUT', routeSeance(CLI_2, 12), {
    donnees: { bilan: { progres: 'Six kilos en moins.' }, regles: ['Préparer mes déjeuners la veille'], fragiles: 'Les week-ends.' },
    noteCoach: 'À revoir dans trois mois.',
  }, jetons[COACH_A]);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.brouillon, true);

  await connecter(COACH_A, '2002');
  const relu = await api('GET', routeSeance(CLI_2, 12), null, jetons[COACH_A]);
  assert.strictEqual(relu.body.seance.donnees.bilan.progres, 'Six kilos en moins.');
  assert.deepStrictEqual(relu.body.seance.donnees.regles, ['Préparer mes déjeuners la veille']);
  assert.strictEqual(relu.body.seance.donnees.fragiles, 'Les week-ends.');
  assert.strictEqual(relu.body.seance.noteCoach, 'À revoir dans trois mois.');
});

test('le brouillon ne termine pas le Boost', async () => {
  const b = await api('GET', `/api/boost/coach/dossiers/${dossiers[CLI_2]}`, null, jetons[COACH_A]);
  assert.strictEqual(b.body.boost.statut, B.STATUT_EN_COURS, 'toujours en cours');
  assert.strictEqual(b.body.boost.etapesValidees, 11);
  assert.strictEqual(b.body.boost.etapeCourante, 12);
  assert.strictEqual(b.body.boost.termineLe, null);
});

test('les données du bilan ne sont pas effacées par le nettoyage d\'un autre protocole', async () => {
  const s = await api('GET', routeSeance(CLI_2, 12), null, jetons[COACH_A]);
  const d = s.body.seance.donnees;
  assert.ok(d.bilan && d.regles && d.actionPrecedente, 'les champs du bilan survivent');
  // Le bilan partage le constat d'action avec le suivi, mais pas le reste :
  // ni la décision (il n'en prend aucune), ni l'objectif (propre à S1).
  assert.strictEqual(d.decision, undefined, 'le bilan ne décide d\'aucune action');
  assert.strictEqual(d.objectif, undefined);
});

test('les règles vides sont retirées, et le plafond de trois tient', async () => {
  await api('PUT', routeSeance(CLI_2, 12), {
    donnees: { regles: ['Une', '', '   ', 'Deux', 'Trois', 'Quatre', 'Cinq'] },
  }, jetons[COACH_A]);
  const s = await api('GET', routeSeance(CLI_2, 12), null, jetons[COACH_A]);
  assert.deepStrictEqual(s.body.seance.donnees.regles, ['Une', 'Deux', 'Trois'],
    'les vides sautent, et on s\'arrête à trois');
});

// ===========================================================================
//  4. CONDITIONS DE VALIDATION
// ===========================================================================

test('les quatre conditions du bilan sont énoncées, et nommées', async () => {
  const r = await api('POST', routeSeance(CLI_2, 12, '/valider'), { donnees: {} }, jetons[COACH_A]);
  assert.strictEqual(r.status, 400);
  assert.deepStrictEqual(r.body.manque, [
    'le résultat de l\'action précédente',
    'le bilan de ce qui a changé',
    'au moins une règle personnelle à conserver',
    'la note de confiance pour continuer seul (1 à 10)',
  ]);
});

test('chaque condition manque séparément', async () => {
  const cas = [
    [{ actionPrecedente: { resultat: '', commentaire: '' } }, 'le résultat de l\'action précédente'],
    [{ bilan: { progres: '', plusFacile: '', appris: '' } }, 'le bilan de ce qui a changé'],
    [{ regles: ['   '] }, 'au moins une règle personnelle à conserver'],
    [{ confiance: null }, 'la note de confiance pour continuer seul (1 à 10)'],
  ];
  for (const [amputation, attendu] of cas) {
    const corps = JSON.parse(JSON.stringify(BILAN_COMPLET));
    Object.assign(corps.donnees, amputation);
    const r = await api('POST', routeSeance(CLI_2, 12, '/valider'), corps, jetons[COACH_A]);
    assert.strictEqual(r.status, 400, attendu);
    assert.deepStrictEqual(r.body.manque, [attendu]);
  }
});

test('une confiance hors de 1-10 ne passe pas pour renseignée', async () => {
  for (const note of [0, 11, 7.5, -2, 'huit']) {
    const corps = JSON.parse(JSON.stringify(BILAN_COMPLET));
    corps.donnees.confiance = note;
    const r = await api('POST', routeSeance(CLI_2, 12, '/valider'), corps, jetons[COACH_A]);
    assert.strictEqual(r.status, 400, 'note ' + note);
  }
});

test('un seul champ de bilan suffit', async () => {
  const corps = JSON.parse(JSON.stringify(BILAN_COMPLET));
  corps.donnees.bilan = { progres: '', plusFacile: 'Cuisiner ne lui coûte plus.', appris: '' };
  const r = await api('POST', routeSeance(CLI_2, 12, '/valider'), corps, jetons[COACH_A]);
  assert.strictEqual(r.status, 200, 'on n\'exige pas les trois champs');
});

// ===========================================================================
//  5. VALIDATION : LE BOOST SE TERMINE, SANS NOUVELLE ACTION
// ===========================================================================

test('terminer le Boost : Étape 12 validée, statut Terminé, daté et attribué', async () => {
  const r = await api('POST', routeSeance(CLI, 12, '/valider'), BILAN_COMPLET, jetons[COACH_A]);
  assert.strictEqual(r.status, 200);
  const b = r.body.boost;

  assert.strictEqual(b.statut, B.STATUT_TERMINE);
  assert.strictEqual(b.etapesValidees, 12);
  assert.strictEqual(b.etapeCourante, null, 'plus d\'Étape à venir');
  assert.strictEqual(b.actif, false);
  assert.strictEqual(b.termineLe, aujourdhui());
  assert.strictEqual(b.etapes[11].valideeLe, aujourdhui());
  assert.strictEqual(b.etapes[11].valideePar, COACH_A);
  assert.strictEqual(r.body.seance.statut, S.SEANCE_VALIDEE);
  assert.strictEqual(r.body.seance.valideePar, COACH_A);
});

test('AUCUNE nouvelle action n\'est créée, et plus rien n\'est actif', async () => {
  const r = await api('GET', routeSeance(CLI, 12), null, jetons[COACH_A]);
  const actions = r.body.seance.actions;

  // Onze actions : une par Étape de S1 à S11. Le bilan n'en ajoute pas.
  assert.strictEqual(actions.length, 11);
  assert.ok(!actions.some((a) => a.numero === 12), 'aucune action portée par l\'Étape 12');

  // Et surtout : plus aucune n'est active. Laisser une consigne hebdomadaire
  // courante après la fin du Boost serait invisible ici, et faux pour le client.
  assert.strictEqual(actions.filter((a) => a.statut === S.ACTION_ACTIVE).length, 0);
  assert.strictEqual(r.body.seance.action, null, 'aucune action active à servir');

  const db = require('../lib/db').getDb();
  const n = db.prepare('SELECT COUNT(*) AS n FROM boost_actions WHERE boost_id = ? AND statut = ?')
    .get(dossiers[CLI], S.ACTION_ACTIVE).n;
  assert.strictEqual(n, 0, 'vérifié en base, pas seulement dans la réponse');
});

test('le plan d\'autonomie est conservé, à l\'identique', async () => {
  const r = await api('GET', routeSeance(CLI, 12), null, jetons[COACH_A]);
  const d = r.body.seance.donnees;
  assert.deepStrictEqual(d.regles, BILAN_COMPLET.donnees.regles);
  assert.strictEqual(d.confiance, 8);
  assert.ok(d.fragiles.includes('week-ends'));
  assert.ok(d.bilan.progres.includes('Six kilos'));
  assert.ok(d.bilan.appris.includes('petit-déjeuner salé'));
});

test('le bilan figure dans l\'historique, avec ses règles', async () => {
  const r = await api('GET', routeSeance(CLI, 12), null, jetons[COACH_A]);
  const h = r.body.seance.historique;
  assert.strictEqual(h.length, 12, 'les douze rendez-vous');
  const bilan = h.find((x) => x.numero === 12);
  assert.deepStrictEqual(bilan.regles, BILAN_COMPLET.donnees.regles);
  assert.strictEqual(bilan.confiance, 8);
  assert.strictEqual(bilan.actionDecidee, null, 'le bilan ne décide aucune action');
  assert.strictEqual(bilan.actionSuivie, 'Action de l\'Étape 11');
});

test('la fin du Boost est inscrite au journal', async () => {
  const r = await api('GET', `/api/boost/coach/dossiers/${dossiers[CLI]}/journal`, null, jetons[COACH_A]);
  const actions = r.body.journal.map((l) => l.action);
  assert.ok(actions.includes('terminaison'), 'la terminaison figure au journal');
  const seance = r.body.journal.filter((l) => l.action === 'seance_validee').find((l) => l.detail.numero === 12);
  assert.ok(seance, 'le rendez-vous de bilan aussi');
  assert.strictEqual(seance.detail.action, null, 'aucune action décidée');
  assert.deepStrictEqual(seance.detail.regles, BILAN_COMPLET.donnees.regles);
});

// ===========================================================================
//  6. VERROUILLAGE ET CONSULTATION APRÈS LA FIN
// ===========================================================================

test('S12 est verrouillée : ni revalidation, ni réécriture', async () => {
  const revalider = await api('POST', routeSeance(CLI, 12, '/valider'), BILAN_COMPLET, jetons[COACH_A]);
  assert.strictEqual(revalider.status, 409);

  const reecrire = await api('PUT', routeSeance(CLI, 12), { donnees: { regles: ['Réécriture'] } }, jetons[COACH_A]);
  assert.strictEqual(reecrire.status, 409);

  const s = await api('GET', routeSeance(CLI, 12), null, jetons[COACH_A]);
  assert.deepStrictEqual(s.body.seance.donnees.regles, BILAN_COMPLET.donnees.regles, 'le plan est intact');
});

test('le Boost terminé reste consultable, avec tout son historique', async () => {
  const fiche = await api('GET', `/api/boost/coach/dossiers/${dossiers[CLI]}`, null, jetons[COACH_A]);
  assert.strictEqual(fiche.status, 200);
  assert.strictEqual(fiche.body.boost.statut, B.STATUT_TERMINE);

  // Chaque rendez-vous se relit, y compris les premiers.
  for (const n of [1, 6, 11, 12]) {
    const s = await api('GET', routeSeance(CLI, n), null, jetons[COACH_A]);
    assert.strictEqual(s.status, 200, 'Étape ' + n);
    assert.strictEqual(s.body.seance.statut, S.SEANCE_VALIDEE);
  }
  // Et il apparaît dans « Anciens suivis » côté liste.
  const liste = await api('GET', '/api/boost/coach/dossiers', null, jetons[COACH_A]);
  const d = liste.body.dossiers.find((x) => x.id === dossiers[CLI]);
  assert.strictEqual(d.actif, false);
  assert.strictEqual(d.etapesValidees, 12);
});

test('le client peut recevoir un nouveau Boost après celui-ci', async () => {
  const r = await api('POST', '/api/boost/admin/dossiers', { clientEmail: CLI, coachEmail: COACH_A }, jetons[ADMIN]);
  assert.strictEqual(r.status, 201, 'la place est libérée');
  assert.strictEqual(r.body.boost.etapesValidees, 0);
  // Le nouveau Boost part vierge : aucune action héritée du précédent.
  const s = await api('GET', `/api/boost/coach/dossiers/${r.body.boost.id}/seances/1`, null, jetons[COACH_A]);
  assert.strictEqual(s.body.seance.action, null);
  assert.strictEqual(s.body.seance.historique.length, 0);
});

// ===========================================================================
//  7. ATOMICITÉ
// ===========================================================================

test('si l\'Étape ne peut pas être validée, le bilan n\'est pas écrit', async () => {
  // Dossier dédié : celui de CLI_2 a été mené jusqu'au bout par les tests de
  // complétude, et un Boost terminé n'a plus d'action active à préserver.
  await api('PUT', routeSeance(CLI_3, 12), { donnees: { bilan: { progres: 'Brouillon.' } } }, jetons[COACH_A]);
  await api('POST', `/api/boost/admin/dossiers/${dossiers[CLI_3]}/interruption`,
    { motif: 'Interruption pour éprouver l\'atomicité du bilan final.' }, jetons[ADMIN]);

  const db = require('../lib/db').getDb();
  const actifs = () => db.prepare('SELECT COUNT(*) AS n FROM boost_actions WHERE boost_id = ? AND statut = ?')
    .get(dossiers[CLI_3], S.ACTION_ACTIVE).n;
  assert.strictEqual(actifs(), 1, 'une action court encore avant la tentative');

  const r = await api('POST', routeSeance(CLI_3, 12, '/valider'), BILAN_COMPLET, jetons[COACH_A]);
  assert.strictEqual(r.status, 409);

  const seance = db.prepare('SELECT statut FROM boost_seances WHERE boost_id = ? AND numero = 12').get(dossiers[CLI_3]);
  assert.strictEqual(seance.statut, S.SEANCE_BROUILLON, 'la séance reste un brouillon');
  // Et l'action en cours n'a PAS été close au passage. C'est le piège propre au
  // bilan : sa seule écriture sur les actions EST une fermeture, donc un défaut
  // d'atomicité s'y traduirait par un client sans consigne, en silence.
  assert.strictEqual(actifs(), 1, 'l\'action est toujours active');
});

// ===========================================================================
//  8. SÉCURITÉ
// ===========================================================================

test('un coach ne touche pas au bilan d\'un confrère', async () => {
  await mener(CLI_B, 11, jetons[COACH_B]);
  for (const [m, suffixe] of [['GET', ''], ['PUT', ''], ['POST', '/valider']]) {
    const r = await api(m, `/api/boost/coach/dossiers/${dossiers[CLI_B]}/seances/12${suffixe}`,
      m === 'GET' ? null : BILAN_COMPLET, jetons[COACH_A]);
    assert.strictEqual(r.status, 404, `${m} chez le confrère`);
    assert.ok(!r.txt.includes('hugo'));
  }
});

test('non certifié, client et anonyme sont tous refusés', async () => {
  for (const [jeton, attendu] of [[jetons[COLLAB], 403], [jetons[CLI], 403], [undefined, 401]]) {
    for (const [m, suffixe] of [['GET', ''], ['PUT', ''], ['POST', '/valider']]) {
      const r = await api(m, `/api/boost/coach/dossiers/${dossiers[CLI_B]}/seances/12${suffixe}`,
        m === 'GET' ? null : BILAN_COMPLET, jeton);
      assert.strictEqual(r.status, attendu, `${m} avec jeton ${jeton ? 'restreint' : 'absent'}`);
    }
  }
});

test('retirer la certification coupe le bilan immédiatement', async () => {
  await api('PUT', `/api/boost/admin/certification/${COACH_B}`, { statut: 'suspendu', evaluateur: 'Stan Martin' }, jetons[ADMIN]);
  const r = await api('GET', `/api/boost/coach/dossiers/${dossiers[CLI_B]}/seances/12`, null, jetons[COACH_B]);
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.body.nonCertifie, true);
  // Rétablissement : le diplôme Academy n'a jamais bougé, c'est le DROIT Boost
  // qui avait été fermé. La réactivation reste un geste d'administration
  // légitime — et elle n'est permise que PARCE QUE l'Academy a délivré.
  await api('PUT', `/api/boost/admin/certification/${COACH_B}`,
    { statut: 'certifie', evaluateur: 'Stan Martin', dateCertification: '2026-07-15' }, jetons[ADMIN]);
  assert.strictEqual((await api('GET', `/api/boost/coach/dossiers/${dossiers[CLI_B]}/seances/12`, null, jetons[COACH_B])).status, 200);
});

test('les notes du bilan ne sortent que par les routes Coach', async () => {
  const coach = await api('GET', routeSeance(CLI, 12), null, jetons[COACH_A]);
  assert.ok(coach.body.seance.noteCoach.includes('ne pas la relancer'));

  for (const [quoi, r] of [
    ['admin, fiche', await api('GET', `/api/boost/admin/dossiers/${dossiers[CLI]}`, null, jetons[ADMIN])],
    ['admin, journal', await api('GET', `/api/boost/admin/dossiers/${dossiers[CLI]}/journal`, null, jetons[ADMIN])],
    ['client, son dossier', await api('GET', '/api/boost/mien', null, jetons[CLI])],
  ]) {
    assert.strictEqual(r.status, 200, quoi);
    assert.ok(!r.txt.includes('ne pas la relancer'), 'note visible dans : ' + quoi);
    assert.ok(!/noteCoach/.test(r.txt), 'champ noteCoach présent dans : ' + quoi);
  }
});

test('le client ne voit pas le contenu de son bilan dans ce lot', async () => {
  const r = await api('GET', '/api/boost/mien', null, jetons[CLI]);
  assert.ok(!r.txt.includes('Préparer mes déjeuners la veille'), 'le plan n\'est pas encore servi au client');
  assert.ok(!r.txt.includes('Six kilos'), 'ni le bilan');
});

// ===========================================================================
//  9. L'ÉCRAN
// ===========================================================================

test('l\'écran du bilan suit l\'ordre demandé', () => {
  const bloc = js.slice(js.indexOf('function formBilan'));
  const ordre = ['D\\\'où tu es parti', 'Le chemin parcouru', 'Ce qui a changé',
    'Ce que tu veux conserver', 'Ce qui reste difficile', 'À quel point tu te sens capable',
    'blocNotes()', 'Terminer mon Boost Nutrition'];
  let position = -1;
  for (const titre of ordre) {
    const i = bloc.indexOf(titre);
    assert.ok(i > position, 'ordre rompu à : ' + titre);
    position = i;
  }
});

test('l\'écran du bilan n\'offre aucune action de semaine', () => {
  const bloc = js.slice(js.indexOf('function formBilan'), js.indexOf('function bloc('));
  assert.ok(!bloc.includes('blocAction('), 'pas de zone d\'action hebdomadaire');
  assert.ok(!/actIntitule|actFreq/.test(bloc), 'aucun champ d\'action');
  assert.ok(bloc.includes('ec-regle'), 'mais bien des règles personnelles');
});

test('les règles conservées sont la zone mise en avant', () => {
  const bloc = js.slice(js.indexOf('function formBilan'), js.indexOf('function bloc('));
  // Même classe que l'action de la semaine : c'est le même rôle — ce que le
  // client emporte en sortant.
  assert.ok(/ec-rdv-bloc ec-rdv-action[\s\S]{0,200}Ce que tu veux conserver/.test(bloc));
  assert.ok(/\.ec-plan\s*\{[^}]*saphir/.test(css), 'et le plan final aussi, après la fin');
});

test('les fonctions de rendu du bilan produisent un écran complet', () => {
  const ctx = {
    document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: async () => ({ json: async () => ({}) }), window: { scrollTo() {} }, console,
  };
  vm.createContext(ctx);
  vm.runInContext(js + ';globalThis.__ec = { poser: (v) => { rdv = v; }, formBilan };', ctx);

  ctx.__ec.poser({
    boost: { id: 1, etapesTotal: 12 }, numero: 12,
    seance: {
      protocole: 'bilan', numero: 12, donnees: {}, action: null, precedent: null, historique: [], noteCoach: '',
      depart: {
        valideeLe: '2026-05-04',
        objectif: { choix: 'perte', texte: 'Perdre 8 kg' },
        difficultes: { choix: ['temps', 'sucre'], precision: 'Le dimanche soir.' },
        habitudes: { diner: 'Tard, vers 21h30' },
      },
      synthese: [
        { numero: 1, intitule: 'Protéines au petit-déjeuner', resultat: 'realisee', decision: 'ajuster', adhesion: 8 },
        { numero: 11, intitule: 'Marcher après le dîner', resultat: null, decision: null, adhesion: 6 },
      ],
    },
  });
  const s = ctx.__ec.formBilan();
  assert.ok(!/undefined|NaN|\[object Object\]/.test(s), 'aucun trou : ' + s.slice(0, 200));
  assert.ok(s.includes('Étape 12/12 — Ton bilan'));
  assert.ok(s.includes('Perdre 8 kg'), 'l\'objectif initial');
  assert.ok(s.includes('Manque de temps') && s.includes('Envies de sucre'), 'les difficultés en clair');
  assert.ok(s.includes('Tard, vers 21h30'), 'les habitudes de S1');
  assert.ok(s.includes('04/05/2026'), 'la date de démarrage');
  assert.ok(s.includes('Protéines au petit-déjeuner') && s.includes('Réalisée'), 'la synthèse');
  assert.ok(s.includes('pas encore constatée'), 'la dernière action, sans résultat inventé');
  assert.strictEqual((s.match(/data-regle=/g) || []).length, 3, 'trois champs de règle');
  assert.strictEqual((s.match(/name="bilConf"/g) || []).length, 10, 'les dix notes de confiance');
  assert.ok(s.includes('Terminer mon Boost Nutrition'));
});

test('l\'écran de fin présente le plan, et échappe ce qui vient du coach', () => {
  const ctx = {
    document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: async () => ({ json: async () => ({}) }), window: { scrollTo() {} }, console,
  };
  vm.createContext(ctx);
  vm.runInContext(js + ';globalThis.__ec = { vueHistorique };', ctx);
  const s = ctx.__ec.vueHistorique({
    historique: [{ numero: 12, valideeLe: '2026-08-27', actionSuivie: 'Marcher', resultat: null,
      decision: null, actionDecidee: null, adhesion: null,
      regles: ['<img src=x onerror=alert(1)>', 'Boire un litre avant midi'], confiance: 9 }],
  });
  assert.ok(!s.includes('<img src=x'), 'échappé');
  assert.ok(s.includes('&lt;img'));
  assert.ok(s.includes('Boire un litre avant midi'));
  assert.ok(s.includes('9/10'), 'la confiance');
});

test('la conclusion est un écran à part, pas un rendez-vous de plus', () => {
  assert.ok(js.includes('function chargerConclusion'), 'la fin a son écran');
  assert.ok(/Boost Nutrition terminé/.test(js));
  assert.ok(/Ton plan pour la suite/.test(js));
  assert.ok(/accompagnement nutrition standard/.test(js), 'la suite est dite au coach');
  // Et rien qui vende quoi que ce soit : ni renouvellement, ni paiement.
  const bloc = js.slice(js.indexOf('function chargerConclusion'), js.indexOf('function cablerHistorique'));
  assert.ok(!/renouvel|paiement|acheter|tarif|abonnement/i.test(bloc), 'aucune offre commerciale');
});

// ===========================================================================
//  10. LE CONSTAT DE LA DERNIÈRE ACTION (S11), POSÉ PENDANT S12
//
//  Sans lui, l'action décidée à S11 serait la seule du Boost à finir sans
//  verdict — alors que c'est précisément celle sur laquelle le client vient de
//  travailler pendant la dernière période.
// ===========================================================================

const CLI_4 = 'ines@exemple.fr';

test('S12 présente l\'action décidée en S11, prête à être constatée', async () => {
  await connecter(CLI_4, '7171');
  const cree = await api('POST', '/api/boost/admin/dossiers',
    { clientEmail: CLI_4, coachEmail: COACH_A }, jetons[ADMIN]);
  dossiers[CLI_4] = cree.body.boost.id;
  await mener(CLI_4, 11, jetons[COACH_A]);

  const r = await api('GET', routeSeance(CLI_4, 12), null, jetons[COACH_A]);
  assert.strictEqual(r.status, 200);
  // C'est bien l'action de S11 qui est servie, pas une autre.
  assert.strictEqual(r.body.seance.action.numero, 11);
  assert.strictEqual(r.body.seance.action.intitule, 'Action de l\'Étape 11');
  assert.strictEqual(r.body.seance.action.statut, S.ACTION_ACTIVE);
  assert.strictEqual(r.body.seance.action.resultat, null, 'pas encore constatée');
});

test('le résultat de l\'action S11 est obligatoire', async () => {
  const corps = JSON.parse(JSON.stringify(BILAN_COMPLET));
  corps.donnees.actionPrecedente = { resultat: '', commentaire: 'Sans verdict.' };
  const r = await api('POST', routeSeance(CLI_4, 12, '/valider'), corps, jetons[COACH_A]);
  assert.strictEqual(r.status, 400);
  assert.deepStrictEqual(r.body.manque, ['le résultat de l\'action précédente']);
});

test('les trois résultats sont acceptés, et eux seuls', async () => {
  // Chaque valeur légitime passe le contrôle de complétude…
  for (const resultat of [S.RESULTAT_REALISEE, S.RESULTAT_PARTIELLE, S.RESULTAT_NON]) {
    const corps = JSON.parse(JSON.stringify(BILAN_COMPLET));
    corps.donnees.actionPrecedente = { resultat, commentaire: '' };
    await api('PUT', routeSeance(CLI_4, 12), corps, jetons[COACH_A]);
    const relu = await api('GET', routeSeance(CLI_4, 12), null, jetons[COACH_A]);
    assert.strictEqual(relu.body.seance.donnees.actionPrecedente.resultat, resultat);
  }
  // …et une valeur inventée est effacée plutôt que stockée.
  const faux = JSON.parse(JSON.stringify(BILAN_COMPLET));
  faux.donnees.actionPrecedente = { resultat: 'presque', commentaire: '' };
  const r = await api('POST', routeSeance(CLI_4, 12, '/valider'), faux, jetons[COACH_A]);
  assert.strictEqual(r.status, 400, 'un résultat hors liste ne vaut pas un résultat');
});

test('le commentaire du constat est facultatif', async () => {
  const corps = JSON.parse(JSON.stringify(BILAN_COMPLET));
  corps.donnees.actionPrecedente = { resultat: 'non_realisee', commentaire: '' };
  const r = await api('POST', routeSeance(CLI_4, 12, '/valider'), corps, jetons[COACH_A]);
  assert.strictEqual(r.status, 200, 'un constat sans commentaire suffit');
});

test('le constat clôt la dernière action, sans en créer de nouvelle', async () => {
  const r = await api('GET', routeSeance(CLI_4, 12), null, jetons[COACH_A]);
  const actions = r.body.seance.actions;

  const onze = actions.find((a) => a.numero === 11);
  assert.strictEqual(onze.resultat, 'non_realisee', 'le verdict est inscrit sur l\'action');
  assert.strictEqual(onze.evalueeAEtape, 12, 'on sait quel rendez-vous l\'a constatée');
  assert.strictEqual(onze.evalueePar, COACH_A);
  assert.strictEqual(onze.evalueeLe, aujourdhui());
  assert.strictEqual(onze.statut, S.ACTION_REMPLACEE);

  // Les invariants du bilan tiennent toujours.
  assert.strictEqual(actions.length, 11, 'aucune action ajoutée par le bilan');
  assert.ok(!actions.some((a) => a.numero === 12));
  assert.strictEqual(actions.filter((a) => a.statut === S.ACTION_ACTIVE).length, 0);
});

test('le résultat de S11 apparaît dans la synthèse finale', async () => {
  const r = await api('GET', routeSeance(CLI_4, 12), null, jetons[COACH_A]);
  const synth = r.body.seance.synthese;
  const derniere = synth[synth.length - 1];
  assert.strictEqual(derniere.numero, 11);
  assert.strictEqual(derniere.resultat, 'non_realisee', 'plus aucune action ne finit sans verdict');
  assert.strictEqual(derniere.decision, null, 'et le bilan ne décide toujours rien');
  // Toutes les actions du Boost ont désormais un résultat.
  assert.ok(synth.every((a) => a.resultat), 'les onze actions sont constatées');
});

test('un échec de validation ne laisse aucun constat partiel', async () => {
  const CLI_5 = 'jade@exemple.fr';
  await connecter(CLI_5, '8282');
  const cree = await api('POST', '/api/boost/admin/dossiers',
    { clientEmail: CLI_5, coachEmail: COACH_A }, jetons[ADMIN]);
  dossiers[CLI_5] = cree.body.boost.id;
  await mener(CLI_5, 11, jetons[COACH_A]);

  await api('POST', `/api/boost/admin/dossiers/${dossiers[CLI_5]}/interruption`,
    { motif: 'Interruption pour éprouver l\'atomicité du constat final.' }, jetons[ADMIN]);

  const r = await api('POST', routeSeance(CLI_5, 12, '/valider'), BILAN_COMPLET, jetons[COACH_A]);
  assert.strictEqual(r.status, 409);

  // Le constat écrit AVANT la fermeture : s'il survivait à l'échec, l'action
  // porterait un verdict pour un rendez-vous qui n'a jamais eu lieu.
  const db = require('../lib/db').getDb();
  const onze = db.prepare('SELECT statut, resultat, evaluee_a_etape FROM boost_actions WHERE boost_id = ? AND numero = 11')
    .get(dossiers[CLI_5]);
  assert.strictEqual(onze.resultat, null, 'aucun verdict enregistré');
  assert.strictEqual(onze.evaluee_a_etape, null);
  assert.strictEqual(onze.statut, S.ACTION_ACTIVE, 'l\'action reste active');
  const seance = db.prepare('SELECT statut FROM boost_seances WHERE boost_id = ? AND numero = 12').get(dossiers[CLI_5]);
  assert.ok(!seance || seance.statut === S.SEANCE_BROUILLON, 'la séance n\'est pas validée');
});

test('l\'écran du bilan ouvre sur le constat de la dernière action', () => {
  // ⚠️ L'ordre à vérifier est celui du RENDU, pas du code source : le rappel du
  // départ est construit plus haut dans la fonction mais concaténé plus bas.
  // Un test sur la source dirait l'inverse de ce que le coach voit.
  const ctx = {
    document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: async () => ({ json: async () => ({}) }), window: { scrollTo() {} }, console,
  };
  vm.createContext(ctx);
  vm.runInContext(js + ';globalThis.__ec = { poser: (v) => { rdv = v; }, formBilan };', ctx);
  ctx.__ec.poser({
    boost: { id: 1, etapesTotal: 12 }, numero: 12,
    seance: {
      protocole: 'bilan', numero: 12, donnees: {}, historique: [], noteCoach: '',
      action: { numero: 11, intitule: 'Marcher après le dîner', frequence: '3 fois par semaine', detail: '', adhesion: 6 },
      depart: { valideeLe: '2026-05-04', objectif: { choix: 'perte', texte: 'Perdre 8 kg' }, difficultes: null, habitudes: null },
      synthese: [],
    },
  });
  const s = ctx.__ec.formBilan();

  const iConstat = s.indexOf('Ton action depuis le dernier rendez-vous');
  const iDepart = s.indexOf('tu es parti');
  assert.ok(iConstat > 0, 'la section du constat est rendue');
  assert.ok(iConstat < iDepart, 'elle vient EN PREMIER, avant le rappel du départ');

  // L'action de S11 est reprise, avec les mêmes codes qu'en S2-S11.
  assert.ok(s.includes('Marcher après le dîner'), 'l\'action de S11 est présentée');
  assert.ok(s.includes('Adhésion annoncée : 6/10'));
  assert.strictEqual((s.match(/name="svRes"/g) || []).length, 3, 'les trois constats');
  assert.ok(s.includes('svResCom'), 'le commentaire, facultatif');
  // Toujours aucune action de semaine à décider.
  assert.ok(!s.includes('actIntitule'), 'aucun champ d\'action hebdomadaire');
  assert.ok(!/undefined|NaN/.test(s));
});
