'use strict';
// ============================================================================
//  MY COACH ACADEMY — « REPRENDRE MA FORMATION » NE MÈNE JAMAIS NULLE PART.
//
//  LE DÉFAUT QUE CETTE SUITE FERME. Le bouton envoyait un identifiant de
//  contenu calculé AU MOMENT OÙ LA PAGE S'ÉTAIT AFFICHÉE. Entre cet affichage
//  et le clic, l'administrateur peut archiver ce contenu, archiver son module,
//  ou vider la formation — et le coach tombait sur « Contenu introuvable — Ce
//  contenu n'existe plus ou n'est plus actif », un écran sans issue.
//
//  LA CORRECTION EST DE PRINCIPE : le bouton ne dit plus OÙ aller, il demande
//  où aller. Le serveur recalcule la cible à chaque clic, contre la base :
//   · le dernier contenu consulté s'il est toujours actif et accessible ;
//   · sinon le premier contenu non terminé de la formation ;
//   · sinon RIEN — et « rien » est une réponse valable, pas une erreur.
//
//  Chaque test ci-dessous archive quelque chose SOUS LES PIEDS du coach, puis
//  clique. Aucun ne doit produire un 404.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DB = path.join(os.tmpdir(), `nutri-academy-reprise-test-${process.pid}.sqlite`);
process.env.NUTRITION_DB = DB;
process.env.ADMIN_EMAIL = 'patron@exemple.fr';

const app = require('../server');
let srv, base;

const ADMIN = 'patron@exemple.fr';
const THEO = 'theo.rp@exemple.fr';
const jetons = {};
const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'academy.js'), 'utf8');

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
const adm = (m, r, c) => api(m, r, c, jetons[ADMIN]);
const coach = (m, r, c) => api(m, r, c, jetons[THEO]);
const dbq = () => require('../lib/db').getDb();

const CLE = 'reprise_test';
let M1, M2, C1, C2, C3;

// Le geste du bouton : aucun identifiant n'est envoyé.
const reprendre = () => coach('POST', `/api/academy/reprendre?formation=${CLE}`);
const vue = async () => (await coach('GET', `/api/academy/formation?formation=${CLE}`)).body.formation;
const archiver = (type, id, actif) => adm('POST', `/api/academy/admin/archiver?formation=${CLE}`, { type, id, actif });
const position = () => dbq().prepare('SELECT contenu_id AS c FROM academy_position WHERE email = ? AND formation = ?')
  .get(THEO, CLE) || null;

test.before(async () => {
  await new Promise((r) => { srv = app.listen(0, r); });
  base = `http://127.0.0.1:${srv.address().port}`;
  app.boost.assurerSchema();
  app.academy.assurerSchema();
  for (const [e, p] of [[ADMIN, '7777'], [THEO, '4004']]) {
    const r = await api('POST', '/account/login', { email: e, prenom: e.split('@')[0], pin: p });
    jetons[e] = r.body.token;
  }
  await api('POST', '/api/boost/admin/collaborateurs', { email: THEO, role: 'collaborateur' }, jetons[ADMIN]);

  // Une formation à deux modules, trois contenus, publiée.
  await adm('POST', '/api/academy/admin/formations',
    { cle: CLE, libelle: 'Reprise', titre: 'Repreneur certifié', qcmNbQuestions: 1, qcmSeuilPct: 50 });
  const mod = async (titre) => (await adm('POST', '/api/academy/admin/modules', { formation: CLE, titre })).body.arbre
    .modules.find((m) => m.titre === titre).id;
  M1 = await mod('Module 1');
  M2 = await mod('Module 2');
  const con = async (moduleId, titre) => {
    const a = await adm('POST', `/api/academy/admin/contenus?formation=${CLE}`,
      { moduleId, type: 'video', titre, youtubeId: 'aBcDeFgHiJk' });
    return a.body.arbre.modules.find((m) => m.id === moduleId).contenus.find((c) => c.titre === titre).id;
  };
  C1 = await con(M1, 'Contenu 1');
  C2 = await con(M1, 'Contenu 2');
  C3 = await con(M2, 'Contenu 3');
  // La publication VÉRIFIE : une formation sans banque de questions est
  // refusée. On en pose donc une, sans quoi la formation resterait brouillon et
  // tous les appels ci-dessous répondraient « formation inconnue ».
  await adm('POST', '/api/academy/admin/questions', {
    formation: CLE, enonce: 'Question de reprise ?',
    choix: [{ texte: 'Oui', correct: true }, { texte: 'Non', correct: false }],
  });
  const pub = await adm('POST', `/api/academy/admin/formations/${CLE}/publier`);
  assert.strictEqual(pub.status, 200,
    'la formation témoin doit être publiée : ' + pub.txt.slice(0, 300));
});

test.after(() => {
  if (srv) srv.close();
  require('../lib/db').closeDb();
  ['', '-wal', '-shm'].forEach((s) => { try { fs.unlinkSync(DB + s); } catch (_) {} });
});

// ===========================================================================
//  1. LE CAS NORMAL
// ===========================================================================

test('sans rien avoir commencé, on reprend au PREMIER contenu', async () => {
  const r = await reprendre();
  assert.strictEqual(r.status, 200, r.txt.slice(0, 200));
  assert.strictEqual(r.body.contenu.id, C1);
  assert.strictEqual(position().c, C1, 'le point de reprise suit');
});

test('après avoir avancé, on reprend là où on s\'est arrêté', async () => {
  await coach('POST', `/api/academy/contenus/${C2}/ouvrir`);
  assert.strictEqual((await reprendre()).body.contenu.id, C2);
});

// ===========================================================================
//  2. LE DÉFAUT : ON ARCHIVE SOUS LES PIEDS DU COACH
// ===========================================================================

test('LE CONTENU DE REPRISE EST ARCHIVÉ -> on passe au suivant, sans 404', async () => {
  await coach('POST', `/api/academy/contenus/${C2}/ouvrir`);
  assert.strictEqual(position().c, C2);

  // L'administrateur archive précisément là où le coach s'était arrêté.
  assert.strictEqual((await archiver('contenu', C2, false)).status, 200);

  const r = await reprendre();
  assert.strictEqual(r.status, 200, 'le clic ne doit JAMAIS répondre 404');
  assert.ok(!/introuvable/i.test(r.txt), 'et surtout pas « Contenu introuvable »');
  assert.strictEqual(r.body.contenu.id, C1, 'on repart sur le premier contenu encore ouvrable');

  await archiver('contenu', C2, true);
});

test('LE MODULE ENTIER EST ARCHIVÉ -> on bascule sur l\'autre module', async () => {
  await coach('POST', `/api/academy/contenus/${C1}/ouvrir`);
  await coach('POST', `/api/academy/contenus/${C1}/terminer`);
  await coach('POST', `/api/academy/contenus/${C2}/ouvrir`);

  assert.strictEqual((await archiver('module', M1, false)).status, 200);

  const r = await reprendre();
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.contenu.id, C3, 'le contenu du module encore actif');
  assert.strictEqual(r.body.contenu.moduleId, M2);

  await archiver('module', M1, true);
});

test('LA POSITION DEVENUE INVALIDE EST NETTOYÉE, pas seulement ignorée', async () => {
  await coach('POST', `/api/academy/contenus/${C3}/ouvrir`);
  assert.strictEqual(position().c, C3);

  await archiver('contenu', C3, false);
  // La simple lecture de la formation suffit à faire le ménage : la ligne ne
  // doit pas rester à pointer sur quelque chose qui n'existe plus pour ce coach.
  await vue();
  assert.strictEqual(position(), null, 'la position périmée doit être effacée');

  const r = await reprendre();
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.contenu, 'et on repart sur un contenu valide');
  await archiver('contenu', C3, true);
});

test('TERMINER un contenu N\'EFFACE PAS la position — il reste le dernier consulté', () => {
  // ⚠️ LE PIÈGE DU NETTOYAGE. « La position n'est pas ouvrable » et « la
  // position n'existe plus » sont deux choses différentes : un contenu terminé
  // reste parfaitement valide, il n'est simplement pas la cible de reprise.
  // Les confondre effaçait la ligne dès qu'un coach finissait ce qu'il ouvrait.
  const acad = app.academy;
  acad.ouvrirContenu(THEO, C1);
  assert.strictEqual(position().c, C1);
  acad.terminerContenu(THEO, C1);
  acad.formationPour(THEO, CLE);          // c'est ici que le ménage se ferait
  assert.strictEqual(position() && position().c, C1,
    'terminer un contenu ne doit pas effacer le point de reprise');
  // Et la reprise, elle, passe bien au suivant.
  assert.notStrictEqual(acad.formationPour(THEO, CLE).reprise, C1);
});

// ===========================================================================
//  3. QUAND IL N'Y A RIEN À OUVRIR, CE N'EST PAS UNE ERREUR
// ===========================================================================

test('TOUT EST TERMINÉ -> on reste sur la formation, avec une raison', async () => {
  for (const c of [C1, C2, C3]) {
    await coach('POST', `/api/academy/contenus/${c}/ouvrir`);
    await coach('POST', `/api/academy/contenus/${c}/terminer`);
  }
  const r = await reprendre();
  assert.strictEqual(r.status, 200, 'un parcours fini n\'est pas une panne');
  assert.strictEqual(r.body.ok, true);
  assert.strictEqual(r.body.aucunContenu, true);
  assert.strictEqual(r.body.raison, 'acheve');
  assert.ok(r.body.formation, 'la formation à jour repart avec, pour redessiner l\'écran');
  assert.ok(!/introuvable/i.test(r.txt));
});

test('PLUS AUCUN CONTENU ACTIF -> même réponse, jamais une impasse', async () => {
  for (const c of [C1, C2, C3]) await archiver('contenu', c, false);
  const r = await reprendre();
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.aucunContenu, true);
  assert.strictEqual(r.body.raison, 'vide');
  assert.strictEqual((await vue()).reprise, null, 'la page le dit aussi');
  for (const c of [C1, C2, C3]) await archiver('contenu', c, true);
});

// ===========================================================================
//  4. LES GARDES N'ONT PAS BOUGÉ
// ===========================================================================

test('reprendre reste réservé aux collaborateurs, et à une formation publiée', async () => {
  assert.strictEqual((await api('POST', `/api/academy/reprendre?formation=${CLE}`)).status, 401);
  const r = await api('POST', '/account/login', { email: 'client.rp@exemple.fr', prenom: 'C', pin: '1111' });
  assert.strictEqual((await api('POST', `/api/academy/reprendre?formation=${CLE}`, undefined, r.body.token)).status, 403);
  // Une formation inconnue est refusée par le catalogue, comme partout ailleurs.
  assert.strictEqual((await coach('POST', '/api/academy/reprendre?formation=inexistante')).status, 404);
});

// ===========================================================================
//  5. L'ÉCRAN
// ===========================================================================

test('L\'ÉCRAN N\'ENVOIE PLUS D\'IDENTIFIANT MÉMORISÉ', () => {
  assert.ok(!/ouvrir\(f\.reprise\)/.test(js),
    'le bouton ne doit plus rejouer un identifiant calculé au rendu précédent');
  assert.ok(/id="acReprendre"[\s\S]{0,200}?reprendre\(\)/.test(js) || /acReprendre'\);\s*\n\s*if \(b\) b\.addEventListener\('click', \(\) => reprendre\(\)\)/.test(js),
    'le bouton doit appeler reprendre()');
  assert.ok(/apiAc\(avecFormation\('\/api\/academy\/reprendre'\), 'POST'\)/.test(js),
    'reprendre() doit demander la cible au serveur');
});

test('UN ÉCHEC D\'OUVERTURE NE MÈNE PLUS À UN CUL-DE-SAC', () => {
  const fn = js.slice(js.indexOf('async function ouvrir(id)'), js.indexOf('function rendreLecteur'));
  assert.ok(fn.length > 100, 'la fonction doit être délimitée');
  assert.ok(/await reprendre\(\)/.test(fn),
    'un refus doit relancer la résolution, pas afficher un écran sans issue');
  assert.ok(!/bloquer\('🔍', 'Contenu introuvable'/.test(fn),
    'l\'écran « Contenu introuvable » ne doit plus être atteignable depuis une ouverture de contenu');
  // Et il ne subsiste nulle part ailleurs dans le fichier.
  assert.ok(!/Contenu introuvable', 'Ce contenu n/.test(js),
    'le cul-de-sac doit avoir disparu du front');
});

test('quand il n\'y a rien à ouvrir, l\'écran l\'explique', () => {
  const fn = js.slice(js.indexOf('async function reprendre()'), js.indexOf('async function ouvrir(id)'));
  assert.ok(/aucunContenu/.test(fn), 'le cas « rien à ouvrir » doit être traité');
  assert.ok(/ouvrirFormation\(fCourante/.test(fn), 'et ramener sur la formation');
  assert.ok(/Tous les contenus sont terminés/.test(fn) && /Aucun contenu n/.test(fn),
    'avec un message adapté à la raison');
  assert.ok(/ac-avis/.test(js), 'l\'avis doit avoir sa place à l\'écran');
});
