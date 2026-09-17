'use strict';
// ============================================================================
//  RECAP 2 — ATTRIBUTIONS COMMERCIALES DÉCIDÉES PAR STAN (R17 / R23).
//
//  Doublons liés à un transfert de club ou à une erreur de saisie de studio,
//  EXPLICITEMENT prouvés (note / historique) et tranchés par Stan. Ce ne sont
//  pas des déductions : chaque entrée est une décision, repérée par l'Id
//  Deciplus fiable, le studio et la date de la vente Vendor — jamais par nom.
//  Information par vente uniquement : n'applique AUCUN changement de KPI.
// ============================================================================

const DECISIONS = {
  '2026-08': [
    // R23 (décision du 17/09/2026) : note Deciplus du 12/08/2026 prouvant une
    // erreur de saisie du studio (signé à Wasquehal, saisi sur Marcq).
    { idClient: '42130', studio: 'Marcq', date: '12/08/2026', compte: false, regle: 'R23',
      motif: 'erreur de saisie du studio — vente comptée à Wasquehal' },
    { idClient: '42130', studio: 'Wasquehal', date: '19/08/2026', compte: true, regle: 'R23',
      commercial: 'Cédric H.', commercialId: '1639731900216x114031637613311040',
      motif: 'vente réelle signée à Wasquehal par Cédric H. (la ligne Vendor est la vente créée par synchronisation)' },
    // R17 (décision du 16/09/2026) : note Deciplus prouvant un transfert
    // administratif de Marcq vers Wasquehal.
    { idClient: '42131', studio: 'Marcq', date: '12/08/2026', compte: true, regle: 'R17',
      motif: 'vente commerciale d\'origine (Cédric H.)' },
    { idClient: '42131', studio: 'Wasquehal', date: '18/08/2026', compte: false, regle: 'R17',
      motif: 'doublon de transfert administratif vers Wasquehal' },
  ],
};

function attributionVente(mois, studio, ligne, idClient) {
  const l = ligne || {};
  const d = (DECISIONS[mois] || []).find((x) => x.idClient === String(idClient || '') && x.studio === studio && x.date === l.date);
  return d ? Object.assign({}, d) : null;
}

module.exports = { DECISIONS, attributionVente };
