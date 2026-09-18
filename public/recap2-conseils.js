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
  // ── VNI : LE CHALLENGE FLEX ────────────────────────────────────────────────
  //  Statuts d'un VNI (posés par le contrôle Vendor, lib/recap2Flex.js) :
  //   · « Flex proposé »      — un devis ou une note Vendor le nomme ;
  //   · « Transformé depuis » — le prospect a souscrit depuis sa venue ;
  //   · « À vérifier »        — fiche non attribuée avec certitude : AUCUN statut
  //                             Flex n'est supposé ; la remarque demande de
  //                             vérifier l'identité du prospect dans Vendor ;
  //   · « Flex à proposer »   — tout le reste. L'absence de trace ne prouve pas
  //                             que l'offre n'a jamais été évoquée, mais le
  //                             conseiller doit la proposer ou la reproposer.
  //  Un marqueur manuel (Flex proposé / Prospect non intéressé / À reproposer
  //  plus tard) l'emporte toujours, et fait taire la remarque : l'action a été
  //  faite, on ne la redemande pas.
  const VNI = { PROPOSE: 'Flex proposé', TRANSFORME: 'Transformé depuis', A_PROPOSER: 'Flex à proposer', A_VERIFIER: 'À vérifier' };

  // Les cinq phrases, au mot près. Elles s'adressent au conseiller responsable.
  const TEXTES = {
    SEANCES: 'Contacte le client pour planifier ses prochaines séances.',
    PRELEVEMENT: 'Vérifie le contrat et lance le prélèvement du client.',
    REGULARISER: 'Contacte le client pour régulariser son prélèvement.',
    RESILIATION: 'Contacte le client pour comprendre sa résiliation et tenter de le conserver.',
    DECIPLUS: 'Vérifie et complète la vente dans Deciplus.',
    FLEX: 'Propose au prospect le Challenge Flex à 4 séances par mois.',
    IDENTITE: 'Vérifie l’identité du prospect dans Vendor.',
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

  // Les remarques d'un VNI : le Flex reste à proposer, ou la fiche Vendor n'a
  // pas pu être attribuée avec certitude. Une décision du conseiller (Flex
  // proposé, non intéressé, à reproposer) fait taire les deux.
  function conseilsVni(ligne) {
    const l = ligne || {};
    const f = l.flex;
    if (!f || !f.statut) return [];                 // mois non contrôlé : on ne réclame rien
    if (f.statut === VNI.A_PROPOSER) return [TEXTES.FLEX];
    if (f.statut === VNI.A_VERIFIER) return [TEXTES.IDENTITE];
    return [];
  }

  // La version AFFICHÉE de chaque remarque automatique : la version modifiée à
  // la main si elle existe (posée par le serveur dans `remarquesAuto`, clé =
  // texte d'origine), sinon le texte d'origine. L'écran ET les copies passent
  // par ici : ce qui est copié est exactement ce qui est affiché.
  function versions(textes, ligne) {
    const m = (ligne && ligne.remarquesAuto) || {};
    return (textes || []).map((t) => {
      const v = m[t];
      return v && v.texte
        ? { origine: t, texte: v.texte, modifiee: true, modifieLe: v.modifieLe || '', modifiePar: v.modifiePar || '' }
        : { origine: t, texte: t, modifiee: false };
    });
  }

  // ── NON-RECONDUITS ─────────────────────────────────────────────────────────
  //  Les phrases, au mot près (cahier des charges du 18/09/2026). Les remarques
  //  sont COMPOSÉES par le moteur (lib/recap2NrAnalyse.js, sur le Mac) à partir
  //  de ces phrases, puis déposées ; l'écran et les copies les relisent ici,
  //  en tenant compte de la décision manuelle, qui l'emporte toujours.
  const TEXTES_NR = {
    IDENTITE: 'Vérifie l’identité du client et son éventuelle reconduction dans Deciplus.',
    SUSP_RAISON: 'Renseigne dans Deciplus la raison de la suspension du client.',
    SUSP_REPRISE: 'Complète la suspension dans Deciplus en indiquant la date de reprise prévue.',
    SUSP_FINIE: 'La suspension du client est terminée. Contacte-le pour organiser sa reprise et réactiver son abonnement.',
    DEMENAGEMENT: 'Contacte le client et propose-lui un transfert de studio ou un accompagnement en visioconférence.',
    PRIX: 'Contacte le client et propose-lui l’abonnement Flex.',
    TEMPS: 'Contacte le client et propose-lui un rythme d’entraînement plus flexible.',
    MOTIVATION: 'Réalise un nouveau bilan avec le client et propose-lui un challenge adapté, comme le Protocole 42.',
    RESULTATS: 'Réalise un bilan avec le client, redéfinis ses objectifs et propose-lui un accompagnement adapté.',
    PLANNING: 'Contacte le client et recherche avec lui des créneaux compatibles avec ses disponibilités.',
    SANTE: 'Contacte le client et étudie une suspension ou une reprise progressive adaptée.',
    INSATISFACTION: 'Appelle le client pour comprendre son insatisfaction et trouve une solution avec le responsable du club.',
    COACH: 'Échange avec le responsable du club pour proposer au client un changement de coach.',
    IMPAYE: 'Contacte le client pour régulariser sa situation et récupérer son nouveau RIB.',
    FIN_CHALLENGE: 'Contacte le client et propose-lui une formule pour poursuivre son accompagnement.',
    INCONNU: 'Contacte le client pour comprendre sa non-reconduction et renseigne le motif dans Deciplus.',
    A_CONFIRMER: 'Contacte le client pour confirmer le motif de sa non-reconduction et renseigne-le dans Deciplus.',
  };
  // Une décision manuelle qui clôt le dossier fait taire les remarques : l'action
  // est faite ou sans objet. « À traiter » et « À creuser » les laissent.
  const NR_SILENCIEUX = ['sous_controle', 'resilie', 'reconduit_autrement', 'toujours_actif', 'suspendu', 'recupere', 'depart_confirme'];
  function conseilsNonReconduit(ligne) {
    const l = ligne || {};
    const a = l.analyse;
    if (!a || !Array.isArray(a.remarques)) return [];      // mois non contrôlé : rien n'est réclamé
    const manuel = l.suivi && l.suivi.statut;
    if (manuel && NR_SILENCIEUX.indexOf(manuel) > -1) return [];
    return a.remarques.slice();
  }
  // Une suspension hors non-reconduits (liste `suspensions` du studio).
  function conseilsSuspension(ligne) {
    const a = ligne && ligne.analyse;
    return (a && Array.isArray(a.remarques)) ? a.remarques.slice() : [];
  }

  return { TEXTES, TEXTES_NR, NR_SILENCIEUX, VNI, moisControle, conseilsVente, conseilsVni, conseilsNonReconduit, conseilsSuspension, versions };
}));
