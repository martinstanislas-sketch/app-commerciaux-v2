'use strict';
// ============================================================================
//  BOOST NUTRITION — interface d'administration.
//
//  Deux familles de tests, parce que l'écran a deux façons de casser :
//
//   1. LE SERVEUR. Les lectures et actions que l'écran déclenche : annuaire des
//      clients éligibles, collaborateurs désactivés, prolongation par date
//      limite. C'est là que vivent les règles.
//
//   2. LE BALISAGE ET LE CÂBLAGE. L'app est du vanilla servi en fichiers
//      statiques : rien ne casse au build, tout casse à l'exécution. Ces tests
//      relisent index.html / app.js / style.css et vérifient les points où une
//      faute est silencieuse — un identifiant renommé d'un côté seulement, une
//      route d'écran qui n'existe plus au serveur, un ?v= non bumpé (le cache
//      du navigateur servirait alors l'ANCIEN app.js à un admin qui verrait un
//      panneau vide sans comprendre pourquoi), et surtout la ligne d'accès
//      laissée visible à un compte non-admin.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DB = path.join(os.tmpdir(), `nutri-boost-admin-test-${process.pid}.sqlite`);
process.env.NUTRITION_DB = DB;
process.env.ADMIN_EMAIL = 'patron@exemple.fr';

const app = require('../server');
// Depuis le lot 4, un Coach Nutrition certifié s'amorce par le PARCOURS RÉEL :
// contenus, QCM, évaluation pratique, puis délivrance. La porte directe du
// Boost est fermée — et chaque suite prouve donc la chaîne en passant.
const { certifierViaAcademy } = require('./aideAcademy');
const B = require('../lib/boost');
let srv, base;

const ADMIN = 'patron@exemple.fr';
const COACH = 'quentin@exemple.fr';
const COACH2 = 'sophie@exemple.fr';
const CLIENT = 'lea@exemple.fr';
const CLIENT2 = 'marc@exemple.fr';
const jetons = {};

const PUBLIC = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(PUBLIC, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(PUBLIC, 'style.css'), 'utf8');

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
  return r.body.token;
}

test.before(async () => {
  await new Promise((r) => { srv = app.listen(0, r); });
  base = `http://127.0.0.1:${srv.address().port}`;
  app.boost.assurerSchema();
  for (const [e, p] of [[ADMIN, '7777'], [COACH, '2002'], [COACH2, '3003'], [CLIENT, '1001'], [CLIENT2, '5005']]) {
    await connecter(e, p);
  }
  // Un Coach Nutrition prêt à recevoir des clients.
  await api('POST', '/api/boost/admin/collaborateurs', { email: COACH, role: 'collaborateur' }, jetons[ADMIN]);
  await certifierViaAcademy({ api, admin: ADMIN, jetonAdmin: jetons[ADMIN],
        email: COACH, jeton: jetons[COACH] });
});

test.after(() => {
  if (srv) srv.close();
  require('../lib/db').closeDb();
  ['', '-wal', '-shm'].forEach((s) => { try { fs.unlinkSync(DB + s); } catch (_) {} });
});

// ===========================================================================
//  1. ANNUAIRE DES CLIENTS ÉLIGIBLES
// ===========================================================================

test('l\'annuaire des clients est réservé à l\'admin', async () => {
  for (const jeton of [undefined, jetons[CLIENT], jetons[COACH]]) {
    const r = await api('GET', '/api/boost/admin/clients', null, jeton);
    assert.ok(r.status === 401 || r.status === 403, 'un annuaire de comptes ne fuit pas');
  }
});

test('l\'annuaire liste les clients et écarte les collaborateurs', async () => {
  const r = await api('GET', '/api/boost/admin/clients', null, jetons[ADMIN]);
  assert.strictEqual(r.status, 200);
  const emails = r.body.clients.map((c) => c.email);
  assert.ok(emails.includes(CLIENT), 'un client figure dans la liste');
  assert.ok(!emails.includes(COACH), 'un collaborateur actif ne peut pas être client de son dispositif');
  assert.ok(emails.includes(COACH2), 'un compte non encore collaborateur reste éligible');
});

test('l\'annuaire signale qui a déjà un Boost en cours', async () => {
  const cree = await api('POST', '/api/boost/admin/dossiers', { clientEmail: CLIENT, coachEmail: COACH }, jetons[ADMIN]);
  assert.strictEqual(cree.status, 201);

  const r = await api('GET', '/api/boost/admin/clients', null, jetons[ADMIN]);
  const lea = r.body.clients.find((c) => c.email === CLIENT);
  // C'est ce drapeau qui permet à l'écran de griser la ligne AVANT le clic,
  // au lieu de laisser l'admin découvrir le refus après coup.
  assert.ok(lea.boostActif, 'le Boost actif est signalé');
  assert.strictEqual(lea.boostActif.statut, B.STATUT_A_DEMARRER);

  const marc = r.body.clients.find((c) => c.email === CLIENT2);
  assert.strictEqual(marc.boostActif, null, 'un client libre n\'est pas signalé');
});

test('l\'annuaire se filtre par prénom ou email', async () => {
  const r = await api('GET', '/api/boost/admin/clients?q=marc', null, jetons[ADMIN]);
  assert.strictEqual(r.body.clients.length, 1);
  assert.strictEqual(r.body.clients[0].email, CLIENT2);

  const vide = await api('GET', '/api/boost/admin/clients?q=zzzintrouvable', null, jetons[ADMIN]);
  assert.strictEqual(vide.body.clients.length, 0);
});

// ===========================================================================
//  2. COLLABORATEURS : ACTIVER / DÉSACTIVER
// ===========================================================================

test('par défaut la liste ne montre que les collaborateurs actifs, ?tous=1 les montre tous', async () => {
  await api('POST', '/api/boost/admin/collaborateurs', { email: COACH2, role: 'collaborateur' }, jetons[ADMIN]);
  await certifierViaAcademy({ api, admin: ADMIN, jetonAdmin: jetons[ADMIN],
        email: COACH2, jeton: jetons[COACH2] });
  await api('POST', '/api/boost/admin/collaborateurs', { email: COACH2, role: 'client' }, jetons[ADMIN]);

  const actifs = await api('GET', '/api/boost/admin/collaborateurs', null, jetons[ADMIN]);
  assert.ok(!actifs.body.collaborateurs.some((c) => c.email === COACH2), 'désactivé : absent par défaut');

  const tous = await api('GET', '/api/boost/admin/collaborateurs?tous=1', null, jetons[ADMIN]);
  const sophie = tous.body.collaborateurs.find((c) => c.email === COACH2);
  assert.ok(sophie, 'désactivé : visible avec ?tous=1, sinon impossible de le réactiver');
  assert.strictEqual(sophie.actif, false);
});

test('un collaborateur désactivé ne peut plus suivre de clients, même certifié', async () => {
  const tous = await api('GET', '/api/boost/admin/collaborateurs?tous=1', null, jetons[ADMIN]);
  const sophie = tous.body.collaborateurs.find((c) => c.email === COACH2);
  // Sa certification est intacte : c'est bien l'activité qui décide.
  assert.strictEqual(sophie.certification.statut, B.CERT_OK);
  assert.strictEqual(sophie.peutSuivre, false, 'certifié mais désactivé : ne suit personne');

  // Et l'attribution le refuse.
  const dossiers = await api('GET', '/api/boost/admin/dossiers', null, jetons[ADMIN]);
  const id = dossiers.body.dossiers[0].id;
  const refus = await api('POST', `/api/boost/admin/dossiers/${id}/coach`, { coachEmail: COACH2 }, jetons[ADMIN]);
  assert.strictEqual(refus.status, 409);
});

test('la réactivation rend le coach de nouveau attribuable, sans retoucher sa certification', async () => {
  const r = await api('POST', '/api/boost/admin/collaborateurs', { email: COACH2, role: 'collaborateur' }, jetons[ADMIN]);
  assert.strictEqual(r.status, 200);
  const tous = await api('GET', '/api/boost/admin/collaborateurs?tous=1', null, jetons[ADMIN]);
  const sophie = tous.body.collaborateurs.find((c) => c.email === COACH2);
  assert.strictEqual(sophie.actif, true);
  assert.strictEqual(sophie.peutSuivre, true);
  // Le score vient désormais du VRAI QCM passé à l'amorçage : ce qu'on vérifie,
  // c'est qu'activer/désactiver un collaborateur ne le touche pas.
  assert.strictEqual(sophie.certification.scoreQcm, 100, 'la certification n\'a pas été touchée');
  assert.strictEqual(sophie.certification.statut, 'certifie');
});

// ===========================================================================
//  3. PROLONGATION PAR NOUVELLE DATE LIMITE
// ===========================================================================

let dossierEnCours = null;

test('préparation : un Boost démarré il y a 30 jours', async () => {
  const cree = await api('POST', '/api/boost/admin/dossiers', { clientEmail: CLIENT2, coachEmail: COACH }, jetons[ADMIN]);
  dossierEnCours = cree.body.boost.id;
  app.boost.validerEtape(dossierEnCours, 1, COACH, jour(-30));
  const b = app.boost.lireBoost(dossierEnCours);
  assert.strictEqual(b.statut, B.STATUT_EN_COURS);
  assert.strictEqual(b.echeanceLe, jour(-30 + 112));
});

test('prolonger jusqu\'à une date précise pose exactement cette date limite', async () => {
  const cible = jour(-30 + 112 + 19);   // 19 jours de plus : pas un multiple de 7
  const r = await api('POST', `/api/boost/admin/dossiers/${dossierEnCours}/prolongation`,
    { nouvelleEcheance: cible, motif: 'Hospitalisation de 3 semaines, certificat reçu.' }, jetons[ADMIN]);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.boost.echeanceLe, cible, 'la date choisie est la date appliquée');
  assert.strictEqual(r.body.boost.joursProlongation, 19);
  // 19 jours ne font pas un compte rond de semaines : on n'invente pas d'arrondi.
  assert.strictEqual(r.body.boost.semainesProlongation, null);

  const p = r.body.boost.prolongations[0];
  assert.strictEqual(p.jours, 19);
  assert.strictEqual(p.auteur, ADMIN, 'auteur tracé automatiquement');
  assert.ok(p.creeLe, 'date tracée automatiquement');
  assert.ok(p.motif.includes('Hospitalisation'));
});

test('deux prolongations successives ne dérivent pas : la date choisie fait foi', async () => {
  const cible = jour(-30 + 112 + 40);
  const r = await api('POST', `/api/boost/admin/dossiers/${dossierEnCours}/prolongation`,
    { nouvelleEcheance: cible, motif: 'Deuxième report exceptionnel, validé en réunion.' }, jetons[ADMIN]);
  assert.strictEqual(r.body.boost.echeanceLe, cible);
  assert.strictEqual(r.body.boost.joursProlongation, 40, 'cumul recalculé depuis l\'Étape 1, pas empilé');
  // La deuxième prolongation n'a ajouté que le delta.
  assert.strictEqual(r.body.boost.prolongations[1].jours, 21);
});

test('la nouvelle date doit être postérieure à l\'actuelle', async () => {
  const b = app.boost.lireBoost(dossierEnCours);
  for (const cible of [b.echeanceLe, jour(-5)]) {
    const r = await api('POST', `/api/boost/admin/dossiers/${dossierEnCours}/prolongation`,
      { nouvelleEcheance: cible, motif: 'Tentative de raccourcir la durée du Boost.' }, jetons[ADMIN]);
    assert.strictEqual(r.status, 400, 'une prolongation ne raccourcit pas');
  }
});

test('date et durée sont exclusives, et l\'une des deux est exigée', async () => {
  const deux = await api('POST', `/api/boost/admin/dossiers/${dossierEnCours}/prolongation`,
    { nouvelleEcheance: jour(200), semaines: 4, motif: 'Deux expressions contradictoires.' }, jetons[ADMIN]);
  assert.strictEqual(deux.status, 400);

  const aucune = await api('POST', `/api/boost/admin/dossiers/${dossierEnCours}/prolongation`,
    { motif: 'Ni date ni durée fournies dans la requête.' }, jetons[ADMIN]);
  assert.strictEqual(aucune.status, 400);

  const malFormee = await api('POST', `/api/boost/admin/dossiers/${dossierEnCours}/prolongation`,
    { nouvelleEcheance: '31/12/2026', motif: 'Date au mauvais format, refusée.' }, jetons[ADMIN]);
  assert.strictEqual(malFormee.status, 400);
});

test('une prolongation de plus d\'un an est refusée (faute de frappe sur l\'année)', async () => {
  const r = await api('POST', `/api/boost/admin/dossiers/${dossierEnCours}/prolongation`,
    { nouvelleEcheance: jour(800), motif: 'Saisie 2028 au lieu de 2026 par erreur.' }, jetons[ADMIN]);
  assert.strictEqual(r.status, 400);
});

test('le motif reste obligatoire, même avec une date valide', async () => {
  const r = await api('POST', `/api/boost/admin/dossiers/${dossierEnCours}/prolongation`,
    { nouvelleEcheance: jour(150) }, jetons[ADMIN]);
  assert.strictEqual(r.status, 400);
});

test('le journal conserve la prolongation en jours, avec son auteur et son motif', async () => {
  const r = await api('GET', `/api/boost/admin/dossiers/${dossierEnCours}/journal`, null, jetons[ADMIN]);
  const prolongations = r.body.journal.filter((l) => l.action === 'prolongation');
  assert.strictEqual(prolongations.length, 2);
  assert.ok(prolongations.every((l) => l.auteur === ADMIN && l.detail.motif && l.detail.jours > 0 && l.detail.echeanceApres));
});

// ===========================================================================
//  4. BALISAGE ET CÂBLAGE DE L'ÉCRAN
// ===========================================================================

test('la ligne d\'accès est réservée à l\'admin ET cachée par défaut', () => {
  const ligne = /<button[^>]*id="btnBoostAdmin"[^>]*>/.exec(html);
  assert.ok(ligne, 'la ligne d\'accès existe dans le Profil');
  // Les deux classes font le travail ensemble : `hidden` cache au chargement,
  // `profil-admin` est ce que setupProfilCoach() révèle pour le seul ADMIN_EMAIL.
  // En perdre une rendrait l'entrée visible à tout le monde.
  assert.ok(/class="[^"]*\bprofil-admin\b[^"]*"/.test(ligne[0]), 'classe profil-admin');
  assert.ok(/class="[^"]*\bhidden\b[^"]*"/.test(ligne[0]), 'cachée par défaut');
  assert.ok(/isMainAdmin\(\)\)\s*\$\$\('#view-profil \.profil-admin'\)/.test(js),
    'setupProfilCoach ne révèle .profil-admin que pour l\'admin');
});

test('le panneau expose les ancres que le script attend', () => {
  for (const ancre of ['boostAdminPanel', 'boostAdminClose', 'boostAdminBody']) {
    assert.ok(html.includes('id="' + ancre + '"'), `#${ancre} présent dans index.html`);
    assert.ok(js.includes("'#" + ancre + "'"), `#${ancre} utilisé par app.js`);
  }
  const onglets = html.match(/class="badm-tab[^"]*"[^>]*data-vue="(boosts|coachs)"/g) || [];
  assert.strictEqual(onglets.length, 2, 'les deux onglets Boosts / Coachs Nutrition');
});

test('le script déclare et câble l\'ouverture du panneau', () => {
  assert.ok(/function openBoostAdmin\(/.test(js));
  assert.ok(/function closeBoostAdmin\(/.test(js));
  assert.ok(js.includes("$('#btnBoostAdmin')"), 'la ligne du Profil est câblée dans init()');
  assert.ok(/addEventListener\('click', openBoostAdmin\)/.test(js));
});

test('toutes les routes appelées par l\'écran existent réellement au serveur', async () => {
  // Le piège de cette app : le front est servi en statique, une route d'écran
  // qui n'existe plus ne casse rien au démarrage — elle échoue chez l'admin.
  const b = dossierEnCours;
  const appels = [
    ['GET', '/api/boost/admin/dossiers', "'/api/boost/admin/dossiers'"],
    ['GET', '/api/boost/admin/collaborateurs?tous=1', "'/api/boost/admin/collaborateurs?tous=1'"],
    ['GET', '/api/boost/admin/clients?q=', "'/api/boost/admin/clients?q='"],
    ['GET', `/api/boost/admin/dossiers/${b}/journal`, "'/journal'"],
  ];
  for (const [m, route, extrait] of appels) {
    const r = await api(m, route, null, jetons[ADMIN]);
    assert.strictEqual(r.status, 200, `${route} répond`);
    assert.ok(js.includes(extrait), `app.js appelle bien ${extrait}`);
  }
  // Les routes d'écriture, telles que le script les construit.
  for (const extrait of ["'/api/boost/admin/dossiers/' + id + '/coach'",
    "'/api/boost/admin/dossiers/' + id + '/prolongation'",
    "'/api/boost/admin/dossiers/' + id + '/interruption'",
    "'/api/boost/admin/certification/'"]) {
    assert.ok(js.includes(extrait), `app.js construit ${extrait}`);
  }
});

test('les assets versionnés ont été bumpés (sinon le cache sert l\'ancien écran)', () => {
  const vJs = Number((/app\.js\?v=(\d+)/.exec(html) || [])[1]);
  const vCss = Number((/style\.css\?v=(\d+)/.exec(html) || [])[1]);
  assert.ok(vJs >= 226, `app.js?v=${vJs} doit dépasser la version 225 d'avant ce lot`);
  assert.ok(vCss >= 193, `style.css?v=${vCss} doit dépasser la version 192 d'avant ce lot`);
});

test('les styles de l\'écran sont préfixés et n\'écrasent rien d\'existant', () => {
  const bloc = css.slice(css.indexOf('ADMINISTRATION DU BOOST NUTRITION'));
  assert.ok(bloc.length > 500, 'le bloc de styles est bien là');
  // Chaque sélecteur du bloc doit contenir une classe .badm- : sans ce préfixe,
  // une règle pourrait repeindre un écran client sans qu'on s'en aperçoive.
  const selecteurs = (bloc.match(/^[^@\s][^{]*\{/gm) || []).map((x) => x.trim());
  const intrus = selecteurs.filter((sel) => !sel.includes('.badm-'));
  assert.deepStrictEqual(intrus, [], 'aucun sélecteur hors du préfixe .badm-');
});

test('l\'écran ne construit aucune route Coach ou client : ce lot est admin seul', () => {
  const bloc = js.slice(js.indexOf('ADMINISTRATION DU BOOST NUTRITION'));
  assert.ok(!bloc.includes('/api/boost/coach/'), 'aucun appel à l\'espace Coach');
  assert.ok(!bloc.includes('/api/boost/mien'), 'aucun appel à l\'espace client');
});

// ===========================================================================
//  5. RENDU RÉEL DE L'ÉCRAN
//
//  Les tests précédents vérifient que les identifiants et les routes concordent.
//  Ceux-ci exécutent VRAIMENT les fonctions de rendu, sur des données venues du
//  serveur, dans un bac à sable Node avec les seuls utilitaires dont elles ont
//  besoin. C'est ce qui attrape ce qu'une relecture laisse passer : une clé mal
//  nommée (`etapesValidees` devenu `etapes_validees`), une concaténation qui
//  produit « undefined », un bouton d'action proposé sur un dossier clos.
// ===========================================================================

const vm = require('node:vm');

function chargerRendu() {
  const bloc = js.slice(js.indexOf('const BADM_STATUTS'));
  // Les `let`/`const` de tête restent dans la portée du script : on expose
  // explicitement ce dont les tests ont besoin, depuis cette même portée.
  const pont = `;globalThis.__ecran = {
    ligneBoost: badmLigneBoost, ligneCoach: badmLigneCoach,
    vueBoosts: badmVueBoosts, vueCoachs: badmVueCoachs, formCreer: badmFormCreer,
    charger: (d, c, cl) => { _badmDossiers = d; _badmCoachs = c; _badmClients = cl; _badmForm = null; },
    formulaire: (f) => { _badmForm = f; },
  };`;
  const ctx = {
    escapeHtml: (s) => String(s === null || s === undefined ? '' : s)
      .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    icSvg: (n) => `<svg class="ic"><use href="#ic-${n}"/></svg>`,
    $: () => null, $$: () => [], apiUrl: (p) => p, nutriAuthHeaders: () => ({}),
    showToast: () => {}, fetch: async () => ({ json: async () => ({}) }),
    setTimeout, clearTimeout, console,
  };
  vm.createContext(ctx);
  vm.runInContext(bloc + pont, ctx);
  return ctx.__ecran;
}

test('la ligne d\'un Boost affiche les 6 colonnes demandées, avec de vraies données', async () => {
  const ecran = chargerRendu();
  const d = await api('GET', '/api/boost/admin/dossiers', null, jetons[ADMIN]);
  const dossier = d.body.dossiers.find((x) => x.id === dossierEnCours);
  assert.ok(dossier, 'le dossier de référence est là');

  const sortie = ecran.ligneBoost(dossier);
  assert.ok(!/undefined|NaN|\[object Object\]/.test(sortie), 'aucun trou dans le rendu : ' + sortie.slice(0, 200));

  // Client, Coach Nutrition, Étape X/12, Début, Date limite, Statut.
  assert.ok(sortie.includes(CLIENT2), 'le client');
  assert.ok(sortie.includes('Coach Nutrition') && sortie.includes('quentin'), 'le coach attribué');
  assert.ok(sortie.includes('1/12'), 'Étape X/12');
  assert.ok(sortie.includes('Début'), 'la colonne Début');
  const [an, mois, jourDeb] = dossier.demarreLe.split('-');
  assert.ok(sortie.includes(`${jourDeb}/${mois}/${an}`), 'la date de début au format français');
  assert.ok(sortie.includes('Date limite'), 'la colonne Date limite');
  assert.ok(sortie.includes('En cours'), 'le statut en toutes lettres');
});

test('les actions proposées suivent le statut du dossier', () => {
  const ecran = chargerRendu();
  const socle = {
    id: 1, clientEmail: 'a@b.fr', clientPrenom: 'Ana', coachEmail: 'c@d.fr', coachPrenom: 'Cé',
    etapesValidees: 3, etapesTotal: 12, demarreLe: '2026-05-01', echeanceLe: '2026-08-21',
    joursRestants: 10, prolongations: [],
  };
  const attendu = {
    a_demarrer: { attribuer: true, prolonger: false, interrompre: true },
    en_cours: { attribuer: true, prolonger: true, interrompre: true },
    expire: { attribuer: false, prolonger: true, interrompre: true },
    // Un dossier clos ne propose plus rien : un bouton qu'on ne peut pas
    // utiliser est un bouton qui trompe.
    termine: { attribuer: false, prolonger: false, interrompre: false },
    interrompu: { attribuer: false, prolonger: false, interrompre: false },
  };
  for (const [statut, veut] of Object.entries(attendu)) {
    const s = ecran.ligneBoost({ ...socle, statut });
    assert.strictEqual(/data-form="coach"/.test(s), veut.attribuer, `${statut} : attribuer`);
    assert.strictEqual(/data-form="prolonger"/.test(s), veut.prolonger, `${statut} : prolonger`);
    assert.strictEqual(/data-form="interrompre"/.test(s), veut.interrompre, `${statut} : interrompre`);
    assert.ok(s.includes(BOOST_LIBELLES[statut]), `${statut} : libellé lisible`);
    assert.ok(/data-journal="1"/.test(s), `${statut} : l'historique reste consultable`);
  }
});

const BOOST_LIBELLES = { a_demarrer: 'À démarrer', en_cours: 'En cours', termine: 'Terminé', expire: 'Expiré', interrompu: 'Interrompu' };

test('un Boost sans coach ni démarrage se lit quand même', () => {
  const ecran = chargerRendu();
  const s = ecran.ligneBoost({
    id: 9, clientEmail: 'seul@exemple.fr', clientPrenom: '', coachEmail: null, coachPrenom: '',
    statut: 'a_demarrer', etapesValidees: 0, etapesTotal: 12,
    demarreLe: null, echeanceLe: null, joursRestants: null, prolongations: [],
  });
  assert.ok(!/undefined|NaN/.test(s), 'pas de trou quand tout est vide');
  assert.ok(s.includes('non attribué'), 'l\'absence de coach est dite');
  assert.ok(s.includes('0/12'));
  // Les colonnes vides affichent un tiret, pas « null ».
  assert.ok(s.includes('—'), 'les dates absentes sont neutres');
  assert.ok(s.includes('Attribuer le coach'), 'l\'action évidente est proposée');
});

test('le rendu échappe ce que saisissent les utilisateurs', () => {
  const ecran = chargerRendu();
  const s = ecran.ligneBoost({
    id: 3, clientEmail: 'x@y.fr', clientPrenom: '<img src=x onerror=alert(1)>', coachEmail: null, coachPrenom: '',
    statut: 'a_demarrer', etapesValidees: 0, etapesTotal: 12,
    demarreLe: null, echeanceLe: null, joursRestants: null, prolongations: [],
  });
  assert.ok(!s.includes('<img src=x'), 'le prénom est échappé, pas injecté');
  assert.ok(s.includes('&lt;img'), 'il reste lisible sous forme échappée');
});

test('la fiche d\'un Coach Nutrition affiche les 5 informations de certification', async () => {
  const ecran = chargerRendu();
  const c = await api('GET', '/api/boost/admin/collaborateurs?tous=1', null, jetons[ADMIN]);
  const quentin = c.body.collaborateurs.find((x) => x.email === COACH);

  const s = ecran.ligneCoach(quentin);
  assert.ok(!/undefined|NaN/.test(s), 'aucun trou : ' + s.slice(0, 200));
  assert.ok(s.includes('Certifié'), 'statut');
  assert.ok(s.includes('15/07/2026'), 'date de certification');
  // Depuis le lot 4, « l'évaluateur » de la ligne Boost est l'administrateur
  // Academy qui a DÉLIVRÉ le diplôme : c'est lui qui répond de l'habilitation.
  assert.ok(s.includes(ADMIN), 'délivreur : ' + s.slice(0, 200));
  assert.ok(s.includes('100/100'), 'score QCM, celui de la vraie tentative');
  assert.ok(s.includes('Validée'), 'résultat pratique');
  assert.ok(s.includes('Désactiver'), 'l\'action d\'activation/désactivation');
});

test('un collaborateur non certifié est montré comme tel, et désactivé se voit', () => {
  const ecran = chargerRendu();
  const brut = ecran.ligneCoach({
    email: 'theo@exemple.fr', prenom: 'Théo', actif: true, nbClients: 0, peutSuivre: false,
    certification: { statut: 'en_cours', dateCertification: null, evaluateur: null, scoreQcm: null, resultatPratique: null },
  });
  assert.ok(brut.includes('En formation'));
  assert.ok(!brut.includes('badm-b-oui'), 'pas de pastille « certifié »');
  assert.ok(brut.includes('—'), 'les champs vides restent neutres');

  const off = ecran.ligneCoach({
    email: 'sortie@exemple.fr', prenom: 'Sortie', actif: false, nbClients: 0, peutSuivre: false,
    certification: { statut: 'certifie', dateCertification: '2026-01-05', evaluateur: 'Stan', scoreQcm: 90, resultatPratique: 'valide' },
  });
  assert.ok(off.includes('Désactivé'), 'l\'état désactivé est visible');
  assert.ok(off.includes('Réactiver'), 'et réversible');
});

test('sans coach certifié disponible, l\'écran le dit au lieu d\'offrir une liste vide', () => {
  const ecran = chargerRendu();
  ecran.charger([], [{ email: 'x@y.fr', prenom: 'X', actif: true, peutSuivre: false, nbClients: 0, certification: { statut: 'en_cours' } }], []);
  ecran.formulaire({ type: 'creer', id: null, clientEmail: '' });
  const s = ecran.formCreer();
  assert.ok(s.includes('attribuer plus tard'), 'le Boost peut être créé sans coach');
  assert.ok(s.includes('Aucun coach certifié disponible'), 'et l\'admin sait pourquoi la liste est vide');
});

test('la liste de création grise les clients qui ont déjà un Boost actif', () => {
  const ecran = chargerRendu();
  ecran.charger([], [], [
    { email: 'libre@exemple.fr', prenom: 'Libre', boostActif: null },
    { email: 'pris@exemple.fr', prenom: 'Pris', boostActif: { id: 4, statut: 'en_cours' } },
  ]);
  ecran.formulaire({ type: 'creer', id: null, clientEmail: '' });
  const s = ecran.formCreer();
  assert.ok(/data-client="libre@exemple\.fr"(?![^>]*disabled)/.test(s), 'le client libre est cliquable');
  assert.ok(/<button[^>]*disabled[^>]*data-client="pris@exemple\.fr"|data-client="pris@exemple\.fr"[^>]*disabled/.test(s)
    || /class="badm-pick"[^>]*disabled[\s\S]{0,80}pris@exemple\.fr/.test(s), 'le client déjà pris est désactivé');
  assert.ok(s.includes('En cours'), 'et on dit pourquoi');
});

test('la vue Boosts reste lisible quand il n\'y a encore rien', () => {
  const ecran = chargerRendu();
  ecran.charger([], [], []);
  const s = ecran.vueBoosts();
  assert.ok(s.includes('Créer un Boost'), 'l\'action de départ est offerte');
  assert.ok(s.includes('Aucun Boost'), 'et l\'état vide est expliqué');
  assert.ok(!/undefined|NaN/.test(s));

  const c = ecran.vueCoachs();
  assert.ok(c.includes('Ajouter un collaborateur'));
  assert.ok(c.includes('Aucun collaborateur déclaré'));
});
