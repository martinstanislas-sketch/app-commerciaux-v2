'use strict';
// ============================================================================
//  MY COACH ACADEMY — L'ÉVALUATION PRATIQUE DE « NUTRITION CERTIFIÉ ».
//
//  CE QUE CE FICHIER DOIT DÉMONTRER :
//
//   1. LES SIX CAS ET LES NEUF CRITÈRES SONT POSÉS UNE FOIS. Rejouer
//      l'amorçage n'ajoute rien, ne duplique rien, ne réécrit aucun identifiant.
//
//   2. RIEN NE DÉBORDE. Les critères sont à coach_nutrition et à elle seule ;
//      les cas aussi. Fitness Boxe n'a pas bougé d'un octet.
//
//   3. LE SCÉNARIO ARRIVE ENTIER JUSQU'À L'ÉCRAN — y compris ce que le client
//      ne dit QUE si on l'interroge. C'est cette frontière qui rend le
//      questionnement du coach évaluable ; si elle ne voyage pas, le
//      certificateur devra inventer, et l'évaluation ne mesure plus rien.
//
//   4. LA SÉANCE S'OUVRE, S'INTERROMPT ET SE REPREND, par la mécanique qui
//      existait déjà : resultat NULL = séance ouverte.
//
//   5. LES DEUX RÈGLES DE SAISIE TIENNENT : neuf critères ou aucun, et un
//      commentaire obligatoire dès qu'un critère n'est pas acquis.
//
//   6. LA GRILLE NE PRONONCE RIEN. Le verdict reste au certificateur, et
//      valider la pratique ne certifie personne.
//
//   7. UNE ÉVALUATION D'AVANT LA GRILLE RESTE LISIBLE.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DB = path.join(os.tmpdir(), `nutri-academy-pratique-nutri-${process.pid}.sqlite`);
process.env.NUTRITION_DB = DB;
process.env.ADMIN_EMAIL = 'patron@exemple.fr';

const app = require('../server');
const G = require('../lib/academyGrilles');
const DATA = require('../lib/academyPratiqueCoachNutrition');

const ADMIN = 'patron@exemple.fr';
const EVA = 'eva.nu@exemple.fr';    // la certificatrice
const THEO = 'theo.nu@exemple.fr';  // le coach évalué
const NUTRI = 'coach_nutrition';
const BOXE = 'fitness_boxe';

const jetons = {};
let srv, base;

const dbq = () => require('../lib/db').getDb();

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

const fiche = async (par) => (await api('GET',
  `/api/academy/evaluateur/collaborateurs/${encodeURIComponent(THEO)}?formation=${NUTRI}`,
  null, jetons[par || EVA])).body;

const ouvrir = (corps, par) => api('POST',
  `/api/academy/evaluateur/collaborateurs/${encodeURIComponent(THEO)}/evaluations`,
  { formation: NUTRI, ...(corps || {}) }, jetons[par || EVA]);

const prononcer = (id, corps, par) => api('PUT',
  `/api/academy/evaluateur/evaluations/${id}`, corps || {}, jetons[par || EVA]);

// Les neuf critères, avec le nombre d'acquis voulu PAR AXE.
const criteresAvec = (grille, parAxe) =>
  grille.flatMap((a, i) => a.criteres.map((c, j) => ({ id: c.id, acquis: j < parAxe[i] })));

// Remettre Théo en état d'être évalué : une validation clôt l'étape.
const reinitialiser = () =>
  dbq().prepare('DELETE FROM academy_evaluations WHERE email = ? AND formation = ?').run(THEO, NUTRI);

test.before(async () => {
  srv = app.listen(0);
  await new Promise((r) => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;

  for (const [email, pin] of [[ADMIN, '7777'], [EVA, '5005'], [THEO, '4004']]) await connecter(email, pin);
  for (const email of [EVA, THEO]) {
    await api('POST', '/api/boost/admin/collaborateurs', { email, role: 'collaborateur' }, jetons[ADMIN]);
    await connecter(email, email === EVA ? '5005' : '4004');
  }
  await api('POST', '/api/academy/admin/evaluateurs', { email: EVA, evaluateur: true }, jetons[ADMIN]);

  app.academyPratique.assurerSchema();
  app.academyGrilles.assurerSchema();

  // La théorie de Théo, prérequis de toute évaluation pratique. Posée par le
  // moteur : ce n'est pas l'objet de ce fichier.
  const maintenant = new Date().toISOString();
  dbq().prepare(`INSERT INTO academy_tentatives
      (email, formation, portee, statut, nb_questions, seuil_pct, ouverte_le, soumise_le, score_pct, bonnes, reussie)
      VALUES (?,?,'finale','soumise',1,0,?,?,100,1,1)`).run(THEO, NUTRI, maintenant, maintenant);
});

test.after(() => {
  if (srv) srv.close();
  require('../lib/db').closeDb();
  ['', '-wal', '-shm'].forEach((s) => { try { fs.unlinkSync(DB + s); } catch (_) {} });
});

// ===========================================================================
//  1. L'AMORÇAGE — une fois, et une seule
// ===========================================================================

test('les SIX cas sont posés, dans l\'ordre, avec leurs clés stables', () => {
  const cas = dbq().prepare('SELECT cle, titre, ordre, actif FROM academy_cas WHERE formation = ? ORDER BY ordre')
    .all(NUTRI);
  assert.strictEqual(cas.length, 6, 'six cas attendus');
  assert.deepStrictEqual(cas.map((c) => c.cle),
    ['cn-cas-1', 'cn-cas-2', 'cn-cas-3', 'cn-cas-4', 'cn-cas-5', 'cn-cas-6']);
  assert.deepStrictEqual(cas.map((c) => c.ordre), [1, 2, 3, 4, 5, 6]);
  for (const c of cas) assert.strictEqual(c.actif, 1, c.titre + ' doit être actif');
});

test('la grille compte TROIS axes de TROIS critères, tels qu\'ils ont été arbitrés', async () => {
  const f = await fiche();
  assert.strictEqual(f.ok, true, f.error || '');
  assert.strictEqual(f.grille.length, 3);
  assert.deepStrictEqual(f.grille.map((a) => a.axeTitre),
    ['Questionnement & compréhension', 'Accompagnement nutritionnel', 'Cadre & limites du coach']);
  for (const a of f.grille) assert.strictEqual(a.criteres.length, 3, 'trois critères dans ' + a.axeTitre);
  assert.deepStrictEqual(f.grille.flatMap((a) => a.criteres.map((c) => c.titre)), [
    'Exploration', 'Compréhension', 'Priorisation',
    'Pertinence des recommandations', 'Applicabilité', 'Individualisation & suivi',
    'Posture professionnelle', 'Limites professionnelles', 'Orientation / recours approprié',
  ]);
});

test('LE NEUVIÈME CRITÈRE SE LIT DANS LES DEUX SENS', async () => {
  const f = await fiche();
  const neuf = f.grille[2].criteres[2];
  // Sans cette double lecture, le critère serait incochable dans les cinq cas
  // où aucune orientation n'est attendue.
  assert.match(neuf.enonce, /oriente vers un professionnel adapté/i);
  assert.match(neuf.enonce, /s’abstient de médicaliser/i);
});

test('l\'amorçage est IDEMPOTENT : le rejouer n\'ajoute ni cas ni critère', () => {
  const compter = () => ({
    cas: dbq().prepare('SELECT COUNT(*) AS n FROM academy_cas').get().n,
    criteres: dbq().prepare('SELECT COUNT(*) AS n FROM academy_criteres').get().n,
  });
  const avant = compter();
  const ids = dbq().prepare('SELECT id FROM academy_cas WHERE formation = ? ORDER BY ordre').all(NUTRI)
    .map((r) => r.id);

  app.academyGrilles.amorcer();
  app.academyGrilles.amorcer();
  app.academyGrilles.amorcerGrille(NUTRI, DATA.GRILLE_COACH_NUTRITION, DATA.MARQUEUR_GRILLE_NUTRITION);
  app.academyGrilles.amorcerCas(NUTRI, DATA.CAS_COACH_NUTRITION, DATA.MARQUEUR_CAS_NUTRITION);

  assert.deepStrictEqual(compter(), avant, 'un second passage a écrit quelque chose');
  // LES IDENTIFIANTS NE BOUGENT PAS : les évaluations les citent par `cas_id`.
  assert.deepStrictEqual(
    dbq().prepare('SELECT id FROM academy_cas WHERE formation = ? ORDER BY ordre').all(NUTRI).map((r) => r.id),
    ids, 'un identifiant de cas a changé');
});

// ===========================================================================
//  2. AUCUNE CONTAMINATION
// ===========================================================================

test('les neuf critères sont à Nutrition, et à elle seule', () => {
  const parFormation = dbq().prepare('SELECT formation, COUNT(*) AS n FROM academy_criteres GROUP BY formation')
    .all();
  const nutri = parFormation.find((r) => r.formation === NUTRI);
  assert.ok(nutri, 'coach_nutrition doit porter une grille');
  assert.strictEqual(nutri.n, 9);
  // Aucune clé partagée avec Fitness Boxe : deux référentiels, zéro emprunt.
  const clesNutri = app.academyGrilles.grillePour(NUTRI).flatMap((a) => a.criteres.map((c) => c.cle));
  const clesBoxe = app.academyGrilles.grillePour(BOXE).flatMap((a) => a.criteres.map((c) => c.cle));
  assert.strictEqual(clesNutri.filter((c) => clesBoxe.includes(c)).length, 0);
  for (const c of clesNutri) assert.match(c, /^cn-c\d$/);
});

test('aucun cas d\'une autre formation n\'a reçu de scénario Nutrition', () => {
  const etrangers = dbq()
    .prepare('SELECT COUNT(*) AS n FROM academy_cas WHERE formation <> ? AND scenario IS NOT NULL').get(NUTRI).n;
  assert.strictEqual(etrangers, 0, 'un cas voisin a reçu un scénario structuré');
  // Et symétriquement : les cas Nutrition n'ont PAS touché aux colonnes d'avant.
  const anciennes = dbq()
    .prepare('SELECT COUNT(*) AS n FROM academy_cas WHERE formation = ? AND (lire IS NOT NULL OR jouer IS NOT NULL)')
    .get(NUTRI).n;
  assert.strictEqual(anciennes, 0, 'un cas Nutrition écrit dans les colonnes de Fitness Boxe');
});

test('FITNESS BOXE N\'A PAS BOUGÉ : son scénario se lit exactement comme avant', () => {
  const maintenant = new Date().toISOString();
  // Un cas Boxe au format d'avant : quatre colonnes, aucun bloc structuré.
  dbq().prepare(`INSERT INTO academy_cas (formation, titre, ordre, actif, cle, lire, role, jouer, evalue, cree_le, maj_le)
                 VALUES (?,?,?,1,?,?,?,?,?,?,?)`)
    .run(BOXE, 'Cas Boxe témoin', 1, 'nu-boxe-1',
      'Fais-moi vivre une courte séquence adaptée.',
      'Tu joues le client débutant.',
      JSON.stringify(['Suis ses consignes.', 'Laisse retomber ta garde.', 'Souffle et ralentis.']),
      'correction · ajustement · dosage', maintenant, maintenant);

  const sc = app.academyPratique.listerCas(BOXE).find((c) => c.titre === 'Cas Boxe témoin').scenario;
  assert.ok(sc, 'le scénario d\'avant doit continuer d\'être servi');
  assert.strictEqual(sc.jouer.length, 3, 'ses trois comportements, intacts');
  assert.strictEqual(sc.lire, 'Fais-moi vivre une courte séquence adaptée.');
  assert.strictEqual(sc.evalue, 'correction · ajustement · dosage');
  // Les champs neufs existent et sont VIDES : l'écran n'affiche donc rien de plus.
  assert.deepStrictEqual(sc.sections, []);
  assert.strictEqual(sc.attendu, null);
  assert.strictEqual(sc.observer, null);
});

test('un cas SANS scénario vaut toujours null, pas un objet vide', () => {
  const maintenant = new Date().toISOString();
  dbq().prepare(`INSERT INTO academy_cas (formation, titre, ordre, actif, cle, cree_le, maj_le)
                 VALUES (?,?,?,1,?,?,?)`)
    .run(BOXE, 'Cas Boxe nu', 2, 'nu-boxe-2', maintenant, maintenant);
  const nu = app.academyPratique.listerCas(BOXE).find((c) => c.titre === 'Cas Boxe nu');
  assert.strictEqual(nu.scenario, null);
});

// ===========================================================================
//  3. LE SCÉNARIO VOYAGE ENTIER JUSQU'À L'ÉCRAN
// ===========================================================================

test('les six cas arrivent à l\'écran du certificateur, dans l\'ordre', async () => {
  const f = await fiche();
  const nutri = f.cas;
  assert.strictEqual(nutri.length, 6);
  assert.deepStrictEqual(nutri.map((c) => c.ordre), [1, 2, 3, 4, 5, 6]);
  assert.match(nutri[0].titre, /faim de fin d’après-midi/);
  assert.match(nutri[5].titre, /Douleurs digestives/);
});

test('CE QUE LE CLIENT DIT SPONTANÉMENT et CE QU\'IL RÉVÈLE sont SÉPARÉS', async () => {
  const f = await fiche();
  const un = f.cas[0].scenario;

  // ① ce qu'on lit au coach : la demande, sans la cause.
  assert.match(un.lire, /je ne sais pas ce que je devrais changer/);
  assert.doesNotMatch(un.lire, /petit-déjeuner|17 h|grignote/,
    'la consigne lue au coach ne doit rien révéler de ce qu\'il doit découvrir');

  // ③ ce qui se dit spontanément : rien de la journée.
  assert.ok(un.jouer.length >= 1);
  assert.doesNotMatch(un.jouer.join(' '), /petit-déjeuner|sandwich|17 h/,
    'le spontané ne doit pas livrer les réponses du questionnement');

  // ④ et ⑤ : les rubriques conditionnelles, elles, portent tout.
  assert.strictEqual(un.sections.length, 2);
  assert.match(un.sections[0].titre, /Si le coach te questionne/);
  assert.match(un.sections[1].titre, /Si le coach propose/);
  const questions = un.sections[0];
  const cles = questions.lignes.map((l) => l.cle);
  for (const attendu of ['Objectif', 'Matin', 'Midi', 'Après-midi', 'Soir', 'Difficulté principale', 'Santé']) {
    assert.ok(cles.includes(attendu), 'rubrique manquante : ' + attendu);
  }
  assert.match(questions.lignes.find((l) => l.cle === 'Matin').valeur, /pas de petit-déjeuner/);
  // Aucune ligne vide : le certificateur ne doit jamais tomber sur un blanc.
  for (const s of un.sections) for (const l of s.lignes) assert.ok(l.valeur, 'une rubrique sans réponse');
});

test('LES SIX CAS PORTENT LEUR RUBRIQUE SANTÉ et leur point à observer', async () => {
  const f = await fiche();
  for (const c of f.cas) {
    const sc = c.scenario;
    assert.ok(sc, c.titre + ' doit porter un scénario');
    assert.ok(sc.attendu, c.titre + ' doit dire ce qui est attendu');
    assert.ok(sc.observer, c.titre + ' doit porter son point à observer');
  }
  // Cinq cas ferment la porte, le sixième l'ouvre : le certificateur ne décide
  // JAMAIS lui-même si une situation relève d'un professionnel de santé.
  const ferme = f.cas.filter((c) => /Aucune orientation n’est attendue/.test(c.scenario.observer));
  assert.strictEqual(ferme.length, 5, 'cinq cas doivent fermer explicitement l\'orientation');
  const six = f.cas[5].scenario;
  assert.match(six.observer, /dépasse le cadre/);
  assert.match(six.observer, /orienter vers un professionnel adapté/);
  assert.match(six.observer, /Tu n’as rien à interpréter/);
});

test('le cas des compléments reste ALIGNÉ SUR CE QUE LA FORMATION ENSEIGNE', async () => {
  const f = await fiche();
  const quatre = f.cas[3].scenario;
  // Le module 6 enseigne « identifier d'abord si les bases sont maîtrisées »,
  // PAS que le sujet sorte du rôle du coach. Le cas ne doit pas inventer une
  // limite professionnelle qui n'existe pas dans le cours.
  assert.match(quatre.attendu, /IDENTIFIER D’ABORD si les bases/);
  // Et le cas n'annonce PAS qu'il met en évidence les « limites
  // professionnelles » : ce serait envoyer le certificateur chercher une
  // limite que le cours ne pose pas.
  assert.doesNotMatch(quatre.evalue, /limites professionnelles/i);
  assert.match(quatre.observer, /Aucune orientation n’est attendue/);
});

// ===========================================================================
//  4. LA SÉANCE : ouvrir, interrompre, reprendre
// ===========================================================================

test('« Commencer la mise en situation » ouvre une séance SANS prononcer de résultat', async () => {
  reinitialiser();
  const f = await fiche();
  const cas = f.cas[0];
  const r = await ouvrir({ casId: cas.id });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  assert.strictEqual(r.body.evaluation.resultat, null, 'aucun verdict n\'est prononcé à l\'ouverture');
  assert.strictEqual(r.body.evaluation.casId, cas.id);
  assert.strictEqual(r.body.evaluation.cas, cas.titre, 'le titre est COPIÉ, pas référencé');
  assert.ok(r.body.evaluation.ouverteLe, 'la date et l\'heure sont enregistrées');
  assert.strictEqual(r.body.evaluation.ouvertPar, EVA, 'le certificateur est enregistré');
});

test('une séance interrompue se REPREND, elle ne se double pas', async () => {
  const f = await fiche();
  assert.ok(f.pratique.enAttente, 'la séance ouverte doit être annoncée à l\'écran');
  assert.strictEqual(f.pratique.etat, 'en_attente');
  assert.ok(f.pratique.enAttente.casId, 'l\'écran retrouve le cas de la séance');

  // Une seconde ouverture est refusée : on reprend celle qui est ouverte.
  const encore = await ouvrir({ casId: f.cas[1].id });
  assert.strictEqual(encore.status, 409, JSON.stringify(encore.body));
  assert.strictEqual(dbq().prepare(
    'SELECT COUNT(*) AS n FROM academy_evaluations WHERE email = ? AND formation = ?').get(THEO, NUTRI).n, 1);
});

// ===========================================================================
//  5. LA GRILLE : deux états, neuf critères, un commentaire quand il le faut
// ===========================================================================

test('une grille INCOMPLÈTE est refusée, et dit ce qui manque', async () => {
  const f = await fiche();
  const partielle = criteresAvec(f.grille, [3, 3, 3]).slice(0, 5);
  const r = await prononcer(f.pratique.enAttente.id, { resultat: 'valide', criteres: partielle });
  assert.strictEqual(r.status, 400, JSON.stringify(r.body));
  assert.strictEqual(r.body.grilleIncomplete, true);
  assert.strictEqual(r.body.manquants.length, 4);
});

test('SANS COMMENTAIRE, une grille imparfaite est REFUSÉE', async () => {
  const f = await fiche();
  const r = await prononcer(f.pratique.enAttente.id,
    { resultat: 'valide', criteres: criteresAvec(f.grille, [3, 2, 3]) });
  assert.strictEqual(r.status, 400, JSON.stringify(r.body));
  assert.strictEqual(r.body.commentaireRequis, true);
});

test('les trois résultats d\'axe se CALCULENT : 3/3, 2/3, 0/3', async () => {
  const f = await fiche();
  const r = await prononcer(f.pratique.enAttente.id, {
    resultat: 'a_repasser',
    commentaire: 'Il conseille avant d\'avoir compris la journée.',
    criteres: criteresAvec(f.grille, [3, 2, 0]),
  });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));

  const apres = await fiche();
  const derniere = apres.pratique.historique[0];
  assert.ok(derniere.grille, 'le relevé doit être servi avec l\'évaluation');
  assert.strictEqual(derniere.grille.criteres.length, 9, 'les neuf critères sont figés dans l\'évaluation');
  assert.deepStrictEqual(derniere.grille.axes.map((a) => [a.acquis, a.total, a.statut, a.libelle]), [
    [3, 3, 'maitrise', 'Maîtrisé'],
    [2, 3, 'a_renforcer', 'À renforcer'],
    [0, 3, 'non_maitrise', 'Non maîtrisé'],
  ]);
  // Le résultat d'axe n'est JAMAIS stocké : aucune colonne ne le porte.
  const colonnes = dbq().prepare('PRAGMA table_info(academy_evaluation_criteres)').all().map((c) => c.name);
  assert.strictEqual(colonnes.includes('statut'), false);
});

test('9/9 acquis : le commentaire redevient FACULTATIF', async () => {
  reinitialiser();
  const f = await fiche();
  const r = await ouvrir({
    casId: f.cas[5].id, resultat: 'valide',
    criteres: criteresAvec(f.grille, [3, 3, 3]),
  });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  assert.strictEqual(r.body.evaluation.commentaire, null, 'aucun commentaire n\'était exigé');
});

test('LA GRILLE NE PRONONCE PAS LE VERDICT : le certificateur tranche', async () => {
  reinitialiser();
  const f = await fiche();
  // Neuf critères NON acquis, et pourtant « validée » : c'est la règle actuelle.
  const r = await ouvrir({
    casId: f.cas[0].id, resultat: 'valide',
    commentaire: 'Décision assumée du certificateur.',
    criteres: criteresAvec(f.grille, [0, 0, 0]),
  });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  assert.strictEqual(r.body.evaluation.resultat, 'valide');
  const p = app.academyPratique.etatPour(THEO, NUTRI);
  assert.strictEqual(p.validee, true, 'le verdict humain fait foi, pas le compte des croix');
});

test('CERTIFICATION AUTOMATIQUE : la pratique validée délivre le diplôme', async () => {
  // ⚠️ CE TEST DISAIT L'INVERSE. L'étape « à certifier » a été supprimée : le
  // verdict pratique étant le dernier prérequis, il délivre.
  const etat = await api('GET', '/api/academy/certification', null, jetons[THEO]);
  const nutri = (etat.body.certifications || []).find((f) => f.formation === NUTRI);
  assert.ok(nutri, 'Nutrition doit figurer dans l\'état du coach');
  assert.strictEqual(nutri.certifie, true, 'valider la pratique ouvre le diplôme');

  // UN SEUL diplôme, et personne ne l'a prononcé.
  const lignes = dbq().prepare('SELECT delivree_par FROM academy_certifications WHERE email = ? AND formation = ? AND statut = ?')
    .all(THEO, NUTRI, 'delivree');
  assert.strictEqual(lignes.length, 1);
  assert.strictEqual(lignes[0].delivree_par, 'Academy');
});

// ===========================================================================
//  6. LES LIBELLÉS SONT FIGÉS, ET L'ANCIEN RESTE LISIBLE
// ===========================================================================

test('renommer un critère ne réécrit AUCUNE évaluation déjà prononcée', async () => {
  const avant = (await fiche()).pratique.historique[0].grille.criteres[0].titre;
  dbq().prepare('UPDATE academy_criteres SET titre = ? WHERE cle = ?').run('Exploration (v2)', 'cn-c1');
  const apres = (await fiche()).pratique.historique[0].grille.criteres[0].titre;
  assert.strictEqual(apres, avant, 'le relevé porte le libellé du jour de l\'évaluation');
  dbq().prepare('UPDATE academy_criteres SET titre = ? WHERE cle = ?').run('Exploration', 'cn-c1');
});

test('une évaluation d\'AVANT la grille reste lisible : son relevé vaut null', async () => {
  reinitialiser();
  const maintenant = new Date().toISOString();
  dbq().prepare(`INSERT INTO academy_evaluations
      (email, formation, cas, ouvert_par, ouverte_le, date_evaluation, evaluateur, resultat, commentaire, decide_le, maj_le)
      VALUES (?,?,?,?,?,?,?,'valide','Ancienne évaluation, champ libre.',?,?)`)
    .run(THEO, NUTRI, 'Support libre', EVA, maintenant, '2026-05-01', EVA, maintenant, maintenant);

  const p = app.academyPratique.etatPour(THEO, NUTRI);
  assert.strictEqual(p.validee, true, 'une évaluation d\'avant reste valide');
  const ancienne = p.historique.find((h) => h.cas === 'Support libre');
  assert.ok(ancienne, 'elle reste dans l\'historique');
  assert.strictEqual(ancienne.grille, null, 'sans relevé, la grille vaut null — et rien ne casse');
});

// ===========================================================================
//  7. LES DROITS N'ONT PAS BOUGÉ
// ===========================================================================

test('le coach évalué n\'atteint ni la fiche, ni l\'ouverture, ni le verdict', async () => {
  const routes = [
    ['GET', `/api/academy/evaluateur/collaborateurs/${encodeURIComponent(THEO)}?formation=${NUTRI}`, null],
    ['POST', `/api/academy/evaluateur/collaborateurs/${encodeURIComponent(THEO)}/evaluations`,
      { formation: NUTRI, resultat: 'valide' }],
    ['PUT', '/api/academy/evaluateur/evaluations/1', { resultat: 'valide' }],
  ];
  for (const [m, r, corps] of routes) {
    const res = await api(m, r, corps, jetons[THEO]);
    assert.strictEqual(res.status, 403, `${m} ${r} devrait rester fermée`);
  }
});

test('l\'administrateur évalue d\'office, et personne ne s\'auto-valide', async () => {
  reinitialiser();
  const f = await fiche(ADMIN);
  assert.strictEqual(f.ok, true, 'l\'administrateur atteint la fiche sans désignation');
  assert.strictEqual(f.grille.length, 3, 'et il reçoit la même grille');

  // EVA ne s'évalue pas elle-même, grille ou pas.
  const soi = await api('POST',
    `/api/academy/evaluateur/collaborateurs/${encodeURIComponent(EVA)}/evaluations`,
    { formation: NUTRI, resultat: 'valide' }, jetons[EVA]);
  assert.strictEqual(soi.status, 403, JSON.stringify(soi.body));
});
