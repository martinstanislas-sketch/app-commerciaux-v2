'use strict';
// ============================================================================
//  RECAP 2 — LES REMARQUES AUTOMATIQUES ADRESSÉES AU CONSEILLER.
//
//  Module PUR (aucune I/O, aucun DOM, aucun stockage), chargé des deux côtés
//  (UMD) : navigateur pour l'affichage et la copie, Node pour les tests.
//
//  ⚠️ RIEN N'EST ENREGISTRÉ. Une remarque automatique est RECALCULÉE à chaque
//  affichage à partir de l'état FINALEMENT AFFICHÉ de la vente
//  (`ligne.operationnel`, donc forçage manuel compris) et des alertes du moteur
//  (`ligne.automatique.alertes`). Conséquences voulues :
//    · elle ne peut pas exister en double ;
//    · elle disparaît d'elle-même dès que le problème est résolu ;
//    · elle suit un forçage manuel dans les deux sens ;
//    · elle ne touche jamais la remarque manuelle (lib/recap2Notes.js), qui
//      reste seule en base et s'affiche à côté.
//
//  ⚠️ AUCUN EFFET SUR LES KPI : c'est une lecture de l'état déjà calculé.
//
//  CUMUL FILTRÉ (décision de Stan, 17/09/2026) :
//    · une vente « à vérifier », non contrôlée, ou dont le contrat n'existe pas
//      / reste à clôturer ne reçoit QUE « Vérifie et complète la vente » : son
//      état réel n'est pas connu, le reste serait une supposition ;
//    · un client résilié ne reçoit ni « planifier ses séances » ni « lancer le
//      prélèvement » : ces actions n'ont plus d'objet.
//  Sinon toutes les remarques utiles sortent, dans l'ordre ci-dessous.
// ============================================================================

(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.Recap2Conseils = fabrique();
}(typeof self !== 'undefined' ? self : this, function () {
  // Les cinq phrases, au mot près. Elles s'adressent au conseiller responsable.
  const TEXTES = {
    SEANCES: 'Contacte le client pour planifier ses prochaines séances.',
    PRELEVEMENT: 'Vérifie le contrat et lance le prélèvement du client.',
    REGULARISER: 'Contacte le client pour régulariser son prélèvement.',
    RESILIATION: 'Contacte le client pour comprendre sa résiliation et tenter de le conserver.',
    DECIPLUS: 'Vérifie et complète la vente dans Deciplus.',
  };

  // Les alertes du moteur (lib/recap2Operationnel.js ALERTES), reconnues par
  // leur texte exact — le moteur est la seule source de ces libellés.
  const ALERTE_REJET = ['Prélèvement à régulariser — rejet / impayé', 'Prélèvement interrompu — impayés / contentieux'];
  const ALERTE_INCOMPLETE = ['À régulariser — contrat jamais créé dans Deciplus',
    'Vente annulée — contrat jamais créé dans Deciplus', 'Contrat Deciplus encore actif — à clôturer'];

  const CHAMPS = ['prelevement', 'reservation', 'resilie'];
  const connu = (v) => v === 'ok' || v === 'ko';

  // Le mois est-il contrôlé ? Sans aucun contrôle automatique (mois ancien,
  // contrôle jamais lancé), AUCUNE remarque automatique n'est produite : on ne
  // réclame pas de vérifier des ventes qu'on n'a jamais lues.
  function moisControle(rapport) {
    const studios = (rapport && rapport.studios) || {};
    return Object.keys(studios).some((s) => {
      const b = studios[s] && studios[s].clientsRetrouves;
      return ((b && b.liste) || []).some((l) => l && l.automatique);
    });
  }

  // Les remarques d'une vente, dans l'ordre d'affichage. `controle` : le mois
  // a-t-il été contrôlé (cf. moisControle) — sinon, aucune remarque.
  function conseilsVente(ligne, { controle = true } = {}) {
    const l = ligne || {};
    if (!controle) return [];
    const o = l.operationnel || null;
    const alertes = (l.automatique && l.automatique.alertes) || [];

    // Vente introuvable ou incomplète :
    //  · absente du journal Deciplus (`retrouve` faux) alors qu'elle n'est ni
    //    annulée, ni validée à la main, ni VÉRIFIÉE à la main par un
    //    administrateur — c'est le badge « À vérifier » de l'écran ;
    //  · jamais contrôlée, verdict incertain, ou contrat absent / à clôturer.
    const verifiee = !!(l.verification && l.verification.verifiee);
    const introuvable = l.retrouve === false && !l.annulee && !l.valideManuellement && !verifiee;
    const incomplete = introuvable || !o || CHAMPS.some((c) => !connu(o[c])) || alertes.some((a) => ALERTE_INCOMPLETE.indexOf(a) > -1);
    if (incomplete) return [TEXTES.DECIPLUS];

    const resilie = o.resilie === 'ok';
    const rejet = alertes.some((a) => ALERTE_REJET.indexOf(a) > -1);
    const out = [];
    if (o.reservation === 'ko' && !resilie) out.push(TEXTES.SEANCES);
    if (o.prelevement === 'ko' && !rejet && !resilie) out.push(TEXTES.PRELEVEMENT);
    if (rejet) out.push(TEXTES.REGULARISER);
    if (resilie) out.push(TEXTES.RESILIATION);
    return out;
  }

  return { TEXTES, moisControle, conseilsVente };
}));
