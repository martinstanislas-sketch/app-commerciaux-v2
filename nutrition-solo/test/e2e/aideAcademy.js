'use strict';
// ============================================================================
//  AIDE E2E — amorcer un Coach Nutrition CERTIFIÉ.
//
//  Le pendant navigateur de test/aideAcademy.js. Depuis le lot 4, la porte
//  directe du Boost est fermée : un coach certifié s'obtient en parcourant
//  l'Academy — contenus, QCM, évaluation pratique, délivrance.
//
//  Les bonnes réponses viennent du FICHIER D'AMORÇAGE, jamais d'une route :
//  aucune ne les donne, et c'est la propriété du lot 2.
// ============================================================================

const { AMORCE_QUESTIONS } = require('../../lib/academyQcm');
const CORRIGE = new Map(AMORCE_QUESTIONS.map((q) =>
  [q.enonce, q.choix.filter(([, bon]) => bon).map(([texte]) => texte)]));

function creerAide(BASE) {
  const envoyer = (route, corps, methode, jeton) => fetch(BASE + route, {
    method: methode || 'POST',
    headers: { 'Content-Type': 'application/json', ...(jeton ? { Authorization: 'Bearer ' + jeton } : {}) },
    body: corps ? JSON.stringify(corps) : undefined,
  }).then((r) => r.json());
  const lire = (route, jeton) => fetch(BASE + route, { headers: { Authorization: 'Bearer ' + jeton } })
    .then((r) => r.json());

  // Le parcours complet, du premier contenu au diplôme.
  async function certifier({ email, pin, jeton, jetonAdmin, evaluateurJeton, evaluateurEmail, date }) {
    const t = jeton || (await envoyer('/account/login', { email, pin })).token;
    const evalEmail = evaluateurEmail || 'patron@exemple.fr';
    const evalJeton = evaluateurJeton || jetonAdmin;

    await envoyer('/api/academy/admin/evaluateurs', { email: evalEmail, evaluateur: true }, 'POST', jetonAdmin);

    const f = (await lire('/api/academy/formation', t)).formation;
    for (const c of f.modules.flatMap((m) => m.contenus)) {
      await envoyer(`/api/academy/contenus/${c.id}/terminer`, {}, 'POST', t);
    }

    const q = (await envoyer('/api/academy/qcm/tentatives', {}, 'POST', t)).tentative;
    for (const x of q.questions) {
      const bonnes = CORRIGE.get(x.enonce) || [];
      await envoyer(`/api/academy/qcm/tentatives/${q.id}/reponses/${x.id}`,
        { choix: x.choix.filter((c) => bonnes.includes(c.texte)).map((c) => c.id) }, 'PUT', t);
    }
    const fin = await envoyer(`/api/academy/qcm/tentatives/${q.id}/terminer`, {}, 'POST', t);
    if (!fin.tentative || !fin.tentative.resultat.reussie) {
      throw new Error('amorçage : QCM non réussi pour ' + email);
    }

    await envoyer(`/api/academy/evaluateur/collaborateurs/${encodeURIComponent(email)}/evaluations`,
      { resultat: 'valide', dateEvaluation: date || '2026-07-10', cas: 'Amorçage E2E' }, 'POST', evalJeton);

    const c = await envoyer(`/api/academy/admin/certifications/${encodeURIComponent(email)}`,
      { obtenueLe: date || '2026-07-15' }, 'POST', jetonAdmin);
    if (!c.ok) throw new Error('amorçage : certification refusée pour ' + email + ' — ' + JSON.stringify(c));
    return c.certification;
  }

  return { certifier, CORRIGE };
}

module.exports = { creerAide, CORRIGE };
