'use strict';
// ============================================================================
//  RÉESSAI — pour les à-coups d'affichage, JAMAIS pour les contrôles.
//
//  Les deux CRM sont des applications lourdes. Sous charge, la barre de filtres
//  Deciplus n'est pas redessinée dans les vingt secondes, ou le sélecteur de
//  club de Fitness Booster n'a pas fini de basculer quand on lit le titre. Ce
//  ne sont pas des anomalies de données : c'est la même page, une seconde trop
//  tôt. Perdre un mois entier pour ça n'a aucun sens.
//
//  ⚠️ CE QU'ON NE RÉESSAIE JAMAIS : un contrôle de conformité. Un club affiché
//  qui reste faux après deux passages est un échec, pas un à-coup — et il doit
//  le rester. Le réessai rejoue une LECTURE, il ne relâche aucune exigence :
//  chaque tentative repasse par les mêmes vérifications, et la dernière erreur
//  est propagée telle quelle si toutes échouent.
//
//  `remise` remet l'écran dans un état connu entre deux passages (filtres
//  réinitialisés, panneau refermé). Sans elle, on rejouerait par-dessus le
//  désordre laissé par l'essai raté — et on échouerait pour une autre raison,
//  ce qui est pire que d'échouer deux fois pareil. Ses propres erreurs sont
//  ignorées : c'est du rangement, pas une mesure.
// ============================================================================

async function avecReessai(libelle, tentatives, fn, { remise, journal } = {}) {
  const dire = journal || (() => {});
  const n = Math.max(1, Number(tentatives) || 1);
  let derniere;
  for (let i = 1; i <= n; i++) {
    try {
      return await fn(i);
    } catch (e) {
      derniere = e;
      if (i >= n) break;
      dire('↻ ' + libelle + ' — tentative ' + i + '/' + n + ' échouée (' + e.message + '), on recommence');
      if (remise) { try { await remise(i); } catch (_) { /* du rangement, pas une mesure */ } }
    }
  }
  throw derniere;
}

// Combien de passages pour une lecture. 2 par défaut ; 1 désactive le réessai.
function tentatives(env) {
  const n = parseInt((env || process.env).RECAP2_TENTATIVES || '', 10);
  return Number.isFinite(n) && n > 0 ? n : 2;
}

module.exports = { avecReessai, tentatives };
