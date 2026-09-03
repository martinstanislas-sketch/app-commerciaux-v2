'use strict';
// ============================================================================
//  AIDE DE TEST — amorcer un Coach Nutrition CERTIFIÉ.
//
//  POURQUOI CE FICHIER EXISTE. Jusqu'au lot 3, les suites Boost fabriquaient un
//  coach certifié d'un coup, en posant `statut: 'certifie'` via
//  PUT /api/boost/admin/certification. Le lot 4 a FERMÉ cette porte : la
//  certification Coach Nutrition se délivre désormais dans My Coach Academy, au
//  terme du parcours. Cet amorçage doit donc emprunter le même chemin que la
//  vraie vie.
//
//  Conséquence heureuse : chaque suite Boost prouve maintenant, en passant, que
//  la chaîne complète tient — contenus, QCM, évaluation pratique, délivrance.
//
//  ⚠️ `certifierAncienne()` est l'exception, et elle est assumée : elle écrit
//  la ligne Boost À LA MAIN pour reproduire une certification ANTÉRIEURE à
//  l'Academy. C'est précisément le cas qu'on veut éprouver — des données
//  héritées, sans dossier Academy — et il n'est plus atteignable par l'API.
// ============================================================================

// Le corrigé de démonstration, reconstruit depuis l'amorçage du lot 2. Il ne
// vient pas du serveur : aucune route ne le donne, et c'est voulu.
const { AMORCE_QUESTIONS } = require('../lib/academyQcm');
const CORRIGE = new Map(AMORCE_QUESTIONS.map((q) =>
  [q.enonce, q.choix.filter(([, bon]) => bon).map(([texte]) => texte)]));

// Termine tous les contenus actifs de la formation.
async function terminerFormation({ api, email, jeton }) {
  const f = (await api('GET', '/api/academy/formation', null, jeton)).body.formation;
  for (const c of f.modules.flatMap((m) => m.contenus)) {
    await api('POST', `/api/academy/contenus/${c.id}/terminer`, {}, jeton);
  }
}

// Passe le QCM et le réussit. Les bonnes réponses viennent du fichier
// d'amorçage, jamais d'une route.
async function reussirQcm({ api, jeton }) {
  const t = (await api('POST', '/api/academy/qcm/tentatives', {}, jeton)).body.tentative;
  for (const q of t.questions) {
    const bonnes = CORRIGE.get(q.enonce) || [];
    const ids = q.choix.filter((c) => bonnes.includes(c.texte)).map((c) => c.id);
    await api('PUT', `/api/academy/qcm/tentatives/${t.id}/reponses/${q.id}`, { choix: ids }, jeton);
  }
  const r = await api('POST', `/api/academy/qcm/tentatives/${t.id}/terminer`, {}, jeton);
  return r.body.tentative.resultat;
}

// Le parcours complet, du premier contenu au diplôme.
//
//  evaluateur / jetonEvaluateur : qui fait passer la pratique. Par défaut
//  l'administrateur — il est un compte comme un autre pour l'Academy, et
//  personne ne s'évalue ni ne se certifie soi-même de toute façon.
async function certifierViaAcademy({
  api, admin, jetonAdmin, email, jeton,
  evaluateur, jetonEvaluateur, date,
}) {
  const evalEmail = evaluateur || admin;
  const evalJeton = jetonEvaluateur || jetonAdmin;

  // Le droit d'évaluer se désigne explicitement, administrateur compris.
  await api('POST', '/api/academy/admin/evaluateurs', { email: evalEmail, evaluateur: true }, jetonAdmin);

  await terminerFormation({ api, email, jeton });
  await reussirQcm({ api, jeton });

  // LA GRILLE, QUAND LA FORMATION EN A UNE. Coach Nutrition a reçu la sienne
  // (neuf critères) : depuis, un verdict sans grille complète est refusé — la
  // même règle que Fitness Boxe. On la lit là où l'écran la lit, sur la fiche,
  // plutôt que de recopier neuf clés qui bougeraient avec le référentiel.
  const fiche = (await api('GET',
    `/api/academy/evaluateur/collaborateurs/${encodeURIComponent(email)}?formation=coach_nutrition`,
    null, evalJeton)).body || {};
  const criteres = (fiche.grille || []).flatMap((a) => a.criteres.map((c) => ({ id: c.id, acquis: true })));

  const p = await api('POST', `/api/academy/evaluateur/collaborateurs/${encodeURIComponent(email)}/evaluations`,
    { resultat: 'valide', dateEvaluation: date || '2026-07-10', cas: 'Amorçage de test',
      ...(criteres.length ? { criteres } : {}) }, evalJeton);

  // ⚠️ DEPUIS LA CERTIFICATION AUTOMATIQUE, le diplôme est le plus souvent DÉJÀ
  // LÀ : valider la pratique suffit à le déclencher. On tente donc la
  // délivrance manuelle, et un « déjà certifié » n'est PAS une erreur — c'est
  // le nouveau chemin normal. On rend alors la certification existante.
  if (p.body && p.body.certification) return p.body.certification;

  const c = await api('POST', `/api/academy/admin/certifications/${encodeURIComponent(email)}`,
    { obtenueLe: date || '2026-07-15' }, jetonAdmin);
  if (c.status === 201) return c.body.certification;
  if (c.status === 409 && c.body && c.body.dejaCertifie) return c.body.certification;

  throw new Error('amorçage : certification refusée (' + c.status + ') — ' +
    JSON.stringify(c.body) + ' | pratique : ' + p.status);
}

// Une certification héritée, écrite à la main : le cas des coachs certifiés
// AVANT l'existence de l'Academy. Aucune route ne permet plus de la créer.
function certifierAncienne({ db, email, date = '2026-07-15', evaluateur = 'Stan Martin', scoreQcm = 88, resultatPratique = 'valide' }) {
  const maintenant = new Date().toISOString();
  db.prepare(`INSERT INTO boost_certifications
      (email, statut, date_certification, evaluateur, score_qcm, resultat_pratique, maj_le, maj_par)
      VALUES (?, 'certifie', ?, ?, ?, ?, ?, 'amorcage-test')
      ON CONFLICT(email) DO UPDATE SET statut = 'certifie', date_certification = excluded.date_certification,
        evaluateur = excluded.evaluateur, score_qcm = excluded.score_qcm,
        resultat_pratique = excluded.resultat_pratique, maj_le = excluded.maj_le`)
    .run(String(email).toLowerCase(), date, evaluateur, scoreQcm, resultatPratique, maintenant);
}

// Les critères d'une formation, TOUS ACQUIS. Sert aux suites qui prononcent un
// verdict pour ARRIVER quelque part — certifier un coach, remplir un espace —
// et non pour éprouver la grille, qui a son propre fichier. Sans eux, un
// verdict sur une formation qui porte une grille est refusé, à juste titre.
function criteresAcquis(db, formation = 'coach_nutrition') {
  return db.prepare('SELECT id FROM academy_criteres WHERE formation = ? AND actif = 1 ORDER BY axe, ordre')
    .all(formation).map((c) => ({ id: c.id, acquis: true }));
}

module.exports = {
  certifierViaAcademy, certifierAncienne, terminerFormation, reussirQcm, CORRIGE, criteresAcquis,
};
