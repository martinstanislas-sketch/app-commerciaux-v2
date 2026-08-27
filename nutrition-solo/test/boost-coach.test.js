'use strict';
// ============================================================================
//  ESPACE COACH NUTRITION — « Mes clients ».
//
//  Le cœur de ce fichier, c'est le CLOISONNEMENT. Un écran coach qui affiche un
//  dossier de trop ne plante pas, ne ralentit pas, ne se voit pas : il faut donc
//  le chercher exprès. On teste les quatre situations réelles — coach certifié,
//  confrère, collaborateur non certifié, client normal — plutôt que le seul
//  chemin heureux.
//
//  Le reste vérifie ce que l'écran promet : l'ordre d'urgence, les dossiers clos
//  rangés à part, la coquille de fiche, et le fait qu'AUCUNE donnée n'est
//  inventée là où le socle n'en a pas encore (action en cours, repas depuis le
//  dernier rendez-vous).
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const vm = require('node:vm');

const DB = path.join(os.tmpdir(), `nutri-boost-coach-test-${process.pid}.sqlite`);
process.env.NUTRITION_DB = DB;
process.env.ADMIN_EMAIL = 'patron@exemple.fr';

const app = require('../server');
const B = require('../lib/boost');
let srv, base;

const ADMIN = 'patron@exemple.fr';
const COACH_A = 'quentin@exemple.fr';
const COACH_B = 'sophie@exemple.fr';
const COLLAB = 'theo@exemple.fr';        // collaborateur, jamais certifié
const CLI_A1 = 'lea@exemple.fr';
const CLI_A2 = 'marc@exemple.fr';
const CLI_A3 = 'nora@exemple.fr';        // dossier clos
const CLI_B1 = 'hugo@exemple.fr';
const jetons = {};
const dossiers = {};

const PUBLIC = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUBLIC, 'coach.html'), 'utf8');
const js = fs.readFileSync(path.join(PUBLIC, 'coach.js'), 'utf8');
const css = fs.readFileSync(path.join(PUBLIC, 'coach.css'), 'utf8');

const jour = (d) => {
  const x = new Date();
  x.setUTCDate(x.getUTCDate() + Number(d || 0));
  return x.toISOString().slice(0, 10);
};

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

test.before(async () => {
  await new Promise((r) => { srv = app.listen(0, r); });
  base = `http://127.0.0.1:${srv.address().port}`;
  app.boost.assurerSchema();
  for (const [e, p] of [[ADMIN, '7777'], [COACH_A, '2002'], [COACH_B, '3003'], [COLLAB, '4004'],
    [CLI_A1, '1001'], [CLI_A2, '5005'], [CLI_A3, '6006'], [CLI_B1, '9009']]) await connecter(e, p);

  const T = jetons[ADMIN];
  for (const e of [COACH_A, COACH_B, COLLAB]) {
    await api('POST', '/api/boost/admin/collaborateurs', { email: e, role: 'collaborateur' }, T);
  }
  for (const e of [COACH_A, COACH_B]) {
    await api('PUT', `/api/boost/admin/certification/${e}`,
      { statut: 'certifie', evaluateur: 'Stan Martin', dateCertification: '2026-07-15', scoreQcm: 88, resultatPratique: 'valide' }, T);
  }
  await api('PUT', `/api/boost/admin/certification/${COLLAB}`,
    { statut: 'en_cours', evaluateur: 'Stan Martin', scoreQcm: 61 }, T);

  // Portefeuille de A : un « à démarrer », un « en cours », un interrompu.
  for (const [cli, coach] of [[CLI_A1, COACH_A], [CLI_A2, COACH_A], [CLI_A3, COACH_A], [CLI_B1, COACH_B]]) {
    const r = await api('POST', '/api/boost/admin/dossiers', { clientEmail: cli, coachEmail: coach }, T);
    dossiers[cli] = r.body.boost.id;
  }
  app.boost.validerEtape(dossiers[CLI_A2], 1, COACH_A, jour(-20));
  await api('POST', `/api/boost/admin/dossiers/${dossiers[CLI_A3]}/interruption`,
    { motif: 'Déménagement, accompagnement arrêté d\'un commun accord.' }, T);
});

test.after(() => {
  if (srv) srv.close();
  require('../lib/db').closeDb();
  ['', '-wal', '-shm'].forEach((s) => { try { fs.unlinkSync(DB + s); } catch (_) {} });
});

// ===========================================================================
//  1. QUI PEUT ENTRER
// ===========================================================================

test('la page /coach est servie, sans exiger de session', async () => {
  // La page est publique ; ce sont les DONNÉES qui sont protégées. Servir un
  // écran de connexion n'a pas besoin d'un jeton.
  const r = await api('GET', '/coach');
  assert.strictEqual(r.status, 200);
  assert.ok(r.txt.includes('id="ecLogin"'), 'l\'écran de connexion est dans la page');
  assert.ok(r.txt.includes('coach.js'), 'le script de la page est référencé');
});

test('sans jeton, aucune route Coach ne répond', async () => {
  for (const route of ['/api/boost/coach/moi', '/api/boost/coach/dossiers',
    `/api/boost/coach/dossiers/${dossiers[CLI_A1]}`, `/api/boost/coach/dossiers/${dossiers[CLI_A1]}/journal`]) {
    const r = await api('GET', route);
    assert.strictEqual(r.status, 401, `${route} doit exiger un compte`);
  }
});

test('« qui suis-je » distingue les trois situations', async () => {
  const client = await api('GET', '/api/boost/coach/moi', null, jetons[CLI_A1]);
  assert.strictEqual(client.status, 200);
  assert.strictEqual(client.body.collaborateur, false);
  assert.strictEqual(client.body.certifie, false);

  const attente = await api('GET', '/api/boost/coach/moi', null, jetons[COLLAB]);
  assert.strictEqual(attente.body.collaborateur, true);
  assert.strictEqual(attente.body.certifie, false);
  assert.strictEqual(attente.body.certification.statut, B.CERT_EN_COURS);

  const coach = await api('GET', '/api/boost/coach/moi', null, jetons[COACH_A]);
  assert.strictEqual(coach.body.collaborateur, true);
  assert.strictEqual(coach.body.certifie, true);
  assert.strictEqual(coach.body.prenom, 'quentin');
});

test('un client normal n\'entre pas dans l\'espace Coach', async () => {
  const r = await api('GET', '/api/boost/coach/dossiers', null, jetons[CLI_A1]);
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.body.nonCertifie, undefined, 'ce n\'est pas une affaire de certification');

  // Et il ne lit pas non plus la fiche d'un dossier, fût-ce le sien.
  const fiche = await api('GET', `/api/boost/coach/dossiers/${dossiers[CLI_A1]}`, null, jetons[CLI_A1]);
  assert.strictEqual(fiche.status, 403);
});

test('un collaborateur non certifié voit l\'espace mais aucun dossier', async () => {
  const liste = await api('GET', '/api/boost/coach/dossiers', null, jetons[COLLAB]);
  assert.strictEqual(liste.status, 403);
  assert.strictEqual(liste.body.nonCertifie, true, 'l\'écran doit pouvoir dire pourquoi');
  assert.strictEqual(liste.body.certification, B.CERT_EN_COURS);

  for (const route of [`/api/boost/coach/dossiers/${dossiers[CLI_A1]}`,
    `/api/boost/coach/dossiers/${dossiers[CLI_A1]}/journal`]) {
    assert.strictEqual((await api('GET', route, null, jetons[COLLAB])).status, 403, route);
  }
});

// ===========================================================================
//  2. CLOISONNEMENT ENTRE COACHS
// ===========================================================================

test('un coach certifié ne voit QUE ses clients attribués', async () => {
  const a = await api('GET', '/api/boost/coach/dossiers', null, jetons[COACH_A]);
  assert.strictEqual(a.status, 200);
  const emailsA = a.body.dossiers.map((d) => d.clientEmail).sort();
  assert.deepStrictEqual(emailsA, [CLI_A1, CLI_A2, CLI_A3].sort());
  assert.ok(!a.txt.includes(CLI_B1), 'aucune trace du client d\'un confrère');

  const b = await api('GET', '/api/boost/coach/dossiers', null, jetons[COACH_B]);
  assert.deepStrictEqual(b.body.dossiers.map((d) => d.clientEmail), [CLI_B1]);
  assert.ok(!b.txt.includes(CLI_A1));
});

test('le dossier d\'un confrère répond 404, pas 403', async () => {
  // 403 confirmerait que le dossier existe : c'est déjà une fuite.
  const fiche = await api('GET', `/api/boost/coach/dossiers/${dossiers[CLI_B1]}`, null, jetons[COACH_A]);
  assert.strictEqual(fiche.status, 404);
  assert.ok(!fiche.txt.includes(CLI_B1), 'le refus ne dit rien du dossier');

  const journal = await api('GET', `/api/boost/coach/dossiers/${dossiers[CLI_B1]}/journal`, null, jetons[COACH_A]);
  assert.strictEqual(journal.status, 404);
});

test('un dossier inexistant répond 404 comme un dossier interdit', async () => {
  const r = await api('GET', '/api/boost/coach/dossiers/999999', null, jetons[COACH_A]);
  assert.strictEqual(r.status, 404);
  const fantaisie = await api('GET', '/api/boost/coach/dossiers/abc', null, jetons[COACH_A]);
  assert.strictEqual(fantaisie.status, 404);
});

test('aucune route Coach n\'accepte un email de client en paramètre', async () => {
  // La portée se déduit du JETON, jamais de l'URL. On tente quand même.
  const parEmail = await api('GET', `/api/boost/coach/dossiers/${encodeURIComponent(CLI_B1)}`, null, jetons[COACH_A]);
  assert.strictEqual(parEmail.status, 404);
  const injection = await api('GET', `/api/boost/coach/dossiers?clientEmail=${encodeURIComponent(CLI_B1)}`, null, jetons[COACH_A]);
  assert.deepStrictEqual(injection.body.dossiers.map((d) => d.clientEmail).sort(), [CLI_A1, CLI_A2, CLI_A3].sort(),
    'un paramètre inattendu ne change pas la portée');
});

test('retirer la certification ferme l\'accès dès l\'appel suivant', async () => {
  await api('PUT', `/api/boost/admin/certification/${COACH_A}`,
    { statut: 'suspendu', evaluateur: 'Stan Martin' }, jetons[ADMIN]);

  // Le jeton est toujours valide : c'est bien la certification qui décide.
  const moi = await api('GET', '/api/boost/coach/moi', null, jetons[COACH_A]);
  assert.strictEqual(moi.status, 200);
  assert.strictEqual(moi.body.certifie, false);

  for (const route of ['/api/boost/coach/dossiers', `/api/boost/coach/dossiers/${dossiers[CLI_A1]}`,
    `/api/boost/coach/dossiers/${dossiers[CLI_A1]}/journal`]) {
    const r = await api('GET', route, null, jetons[COACH_A]);
    assert.strictEqual(r.status, 403, route + ' doit se fermer immédiatement');
    assert.strictEqual(r.body.nonCertifie, true);
  }

  // Rétabli : l'accès revient, sans avoir touché aux attributions.
  await api('PUT', `/api/boost/admin/certification/${COACH_A}`,
    { statut: 'certifie', evaluateur: 'Stan Martin', dateCertification: '2026-07-15', scoreQcm: 88, resultatPratique: 'valide' }, jetons[ADMIN]);
  const apres = await api('GET', '/api/boost/coach/dossiers', null, jetons[COACH_A]);
  assert.strictEqual(apres.status, 200);
  assert.strictEqual(apres.body.dossiers.length, 3);
});

// ===========================================================================
//  3. ORDRE ET CONTENU DE « MES CLIENTS »
// ===========================================================================

test('les dossiers sont rangés par urgence : à démarrer, puis en cours, puis clos', async () => {
  const r = await api('GET', '/api/boost/coach/dossiers', null, jetons[COACH_A]);
  const statuts = r.body.dossiers.map((d) => d.statut);
  assert.deepStrictEqual(statuts, [B.STATUT_A_DEMARRER, B.STATUT_EN_COURS, B.STATUT_INTERROMPU],
    'l\'ordre est une règle du dispositif, pas une décision d\'affichage');
});

test('chaque ligne porte ce qu\'il faut pour décider, et rien d\'inventé', async () => {
  const r = await api('GET', '/api/boost/coach/dossiers', null, jetons[COACH_A]);
  const enCours = r.body.dossiers.find((d) => d.statut === B.STATUT_EN_COURS);

  assert.strictEqual(enCours.clientPrenom, 'marc');
  assert.strictEqual(enCours.etapesValidees, 1);
  assert.strictEqual(enCours.etapesTotal, 12);
  assert.strictEqual(enCours.demarreLe, jour(-20));
  assert.strictEqual(enCours.echeanceLe, jour(-20 + 112));

  // Ce qui n'existe pas encore en base ne doit surtout pas être servi vide :
  // un « 0 » ou un « — » se lirait comme une information.
  assert.strictEqual(enCours.actionEnCours, undefined, 'la bibliothèque d\'actions n\'existe pas encore');
  assert.strictEqual(enCours.repasDepuisRdv, undefined, 'le journal photo n\'existe pas encore');
  assert.strictEqual(enCours.clientNom, undefined, 'la table des comptes ne porte pas de nom de famille');
});

test('la fiche d\'un client attribué s\'ouvre', async () => {
  const r = await api('GET', `/api/boost/coach/dossiers/${dossiers[CLI_A2]}`, null, jetons[COACH_A]);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.boost.clientEmail, CLI_A2);
  assert.strictEqual(r.body.boost.etapeCourante, 2, 'la prochaine Étape est connue');
  assert.strictEqual(r.body.boost.coachEmail, COACH_A);
});

test('le coach lit l\'historique de SON dossier', async () => {
  const r = await api('GET', `/api/boost/coach/dossiers/${dossiers[CLI_A2]}/journal`, null, jetons[COACH_A]);
  assert.strictEqual(r.status, 200);
  const actions = r.body.journal.map((l) => l.action);
  assert.ok(actions.includes('creation'));
  assert.ok(actions.includes('etape_validee'));
});

// ===========================================================================
//  4. LA PAGE : ISOLATION, BALISAGE, CÂBLAGE
// ===========================================================================

test('la page Coach est autonome : elle n\'emprunte rien à l\'app client', () => {
  assert.ok(!html.includes('app.js'), 'app.js n\'est pas chargé');
  assert.ok(!html.includes('style.css'), 'style.css (340 Ko de l\'app client) n\'est pas chargé');
  assert.ok(html.includes('coach.css'), 'sa propre feuille');
  assert.ok(html.includes('coach.js'), 'son propre script');
  // Et elle ne doit pas être indexée : c'est un outil interne.
  assert.ok(/name="robots"[^>]*noindex/.test(html), 'noindex');
});

test('le script n\'appelle que les routes Coach, jamais celles de l\'admin', () => {
  assert.ok(!js.includes('/api/boost/admin/'), 'aucune route d\'administration');
  assert.ok(!js.includes('/api/boost/mien'), 'aucune route de l\'espace client');
  for (const route of ['/api/boost/coach/moi', '/api/boost/coach/dossiers']) {
    assert.ok(js.includes(route), 'appelle ' + route);
  }
  // Les dossiers s'adressent par identifiant, jamais par email.
  assert.ok(!/dossiers\/'\s*\+\s*\w*[Ee]mail/.test(js), 'aucun email dans une URL de dossier');
});

test('les ancres du script existent, dans la page ou dans ce qu\'il fabrique', () => {
  // Le script cible deux familles d'identifiants : ceux du balisage statique, et
  // ceux qu'il crée lui-même en écrivant la fiche client. Les confondre ferait
  // passer ce test pour cassé alors qu'il ne l'est pas — on les sépare donc.
  const ancres = [...new Set([...js.matchAll(/\$\('#([A-Za-z0-9]+)'\)/g)].map((m) => m[1]))];
  const fabriques = new Set([...js.matchAll(/id="([A-Za-z0-9]+)"/g)].map((m) => m[1]));

  const manquantes = ancres.filter((id) => !html.includes('id="' + id + '"') && !fabriques.has(id));
  assert.deepStrictEqual(manquantes, [], 'des identifiants du script n\'existent nulle part');
  assert.ok(ancres.length > 8, 'le script est bien câblé sur la page');

  // Et l'inverse : un identifiant du balisage que plus personne ne câble est du
  // balisage mort, qu'on préfère voir tomber ici.
  const dansPage = [...new Set([...html.matchAll(/id="(ec[A-Za-z0-9]+)"/g)].map((m) => m[1]))];
  const orphelins = dansPage.filter((id) => !js.includes("'#" + id + "'") && !js.includes('#' + id));
  assert.deepStrictEqual(orphelins, [], 'du balisage n\'est plus utilisé par le script');
});

test('la session Coach ne se mélange pas à celle de l\'app client', () => {
  // L'app client stocke sous 'nutri-compte' : deux clés distinctes, sinon se
  // connecter d'un côté déconnecterait de l'autre.
  assert.ok(js.includes("'mc-coach-session'"), 'clé de session dédiée');
  assert.ok(!js.includes('nutri-compte'), 'ne touche pas la session de l\'app client');
});

test('la feuille de styles est autonome et déclare sa palette', () => {
  for (const token of ['--marine', '--saphir', '--surface']) {
    assert.ok(css.includes(token), 'token ' + token);
  }
  assert.ok(css.includes('source de vérité'), 'le lien avec style.css est documenté');
});

// ===========================================================================
//  5. RENDU RÉEL DES CARTES
// ===========================================================================

function chargerRendu() {
  const ctx = {
    document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: async () => ({ json: async () => ({}) }),
    window: { scrollTo() {} },
    console,
  };
  vm.createContext(ctx);
  vm.runInContext(js + ';globalThis.__ec = { carte: carteClient, nom: nomAffiche, date: dateFr };', ctx);
  return ctx.__ec;
}

test('la carte d\'un client affiche prénom, Étape X/12 et statut', async () => {
  const ec = chargerRendu();
  const r = await api('GET', '/api/boost/coach/dossiers', null, jetons[COACH_A]);
  const enCours = r.body.dossiers.find((d) => d.statut === B.STATUT_EN_COURS);

  const s = ec.carte(enCours);
  assert.ok(!/undefined|NaN|\[object Object\]/.test(s), 'aucun trou : ' + s.slice(0, 200));
  assert.ok(s.includes('marc'), 'le prénom');
  assert.ok(s.includes('Étape 1/12'), 'Étape X/12');
  assert.ok(s.includes('En cours'), 'le statut en toutes lettres');
  assert.ok(s.includes('data-id="' + enCours.id + '"'), 'la carte est cliquable, par identifiant');
});

test('un dossier pas encore démarré le dit, au lieu d\'afficher des dates vides', () => {
  const ec = chargerRendu();
  const s = ec.carte({
    id: 5, clientEmail: 'a@b.fr', clientPrenom: 'Ana', statut: 'a_demarrer',
    etapesValidees: 0, etapesTotal: 12, demarreLe: null, echeanceLe: null, joursRestants: null,
  });
  assert.ok(s.includes('Pas encore démarré'));
  assert.ok(!s.includes('—'), 'aucune date vide affichée');
  assert.ok(s.includes('À démarrer'));
});

test('un dépassement d\'échéance se voit', () => {
  const ec = chargerRendu();
  const s = ec.carte({
    id: 6, clientEmail: 'a@b.fr', clientPrenom: 'Ana', statut: 'expire',
    etapesValidees: 7, etapesTotal: 12, demarreLe: '2026-01-05', echeanceLe: '2026-04-27', joursRestants: -12,
  });
  assert.ok(s.includes('ec-late'), 'le retard est mis en évidence');
  assert.ok(s.includes('Échéance dépassée'));
  assert.ok(s.includes('Expiré'));
});

test('la carte échappe ce que saisissent les utilisateurs', () => {
  const ec = chargerRendu();
  const s = ec.carte({
    id: 7, clientEmail: 'x@y.fr', clientPrenom: '<img src=x onerror=alert(1)>', statut: 'en_cours',
    etapesValidees: 2, etapesTotal: 12, demarreLe: '2026-06-01', echeanceLe: '2026-09-21', joursRestants: 20,
  });
  assert.ok(!s.includes('<img src=x'), 'le prénom est échappé');
  assert.ok(s.includes('&lt;img'));
});

test('sans prénom, on retombe sur l\'email — jamais sur un nom inventé', () => {
  const ec = chargerRendu();
  assert.strictEqual(ec.nom({ clientPrenom: '', clientEmail: 'jean.dupont@exemple.fr' }), 'jean.dupont');
  assert.strictEqual(ec.nom({ clientPrenom: 'Léa', clientEmail: 'l@x.fr' }), 'Léa');
});
