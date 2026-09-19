'use strict';
// ============================================================================
//  RECAP 2 — LE REGISTRE UNIQUE DES REMARQUES AUTOMATIQUES.
//
//  Module PUR (aucune I/O, aucun DOM, aucun stockage), chargé des deux côtés
//  (UMD) : navigateur (écran, copies, référentiel), Node (serveur, moteurs du
//  Mac, tests). C'est LA seule source des règles :
//    · REGLES      — la fiche de chaque règle (identifiant stable, catégorie,
//                    déclenchement, texte, disparition, priorité, masquages,
//                    copies, modifiable) : le référentiel administrateur est
//                    généré depuis ce tableau, il ne peut pas diverger ;
//    · evaluer*()  — les fonctions qui PRODUISENT les remarques, et qui ne
//                    peuvent citer qu'une règle déclarée ici (voir `item`).
//
//  ⚠️ RIEN N'EST ENREGISTRÉ. Une remarque est RECALCULÉE à chaque lecture à
//  partir de l'état servi (réintégration, forçage, décisions, dernier contrôle
//  déposé) : elle disparaît dès que l'application sait que le point est réglé.
//
//  ⚠️ AUCUN EFFET SUR LES KPI DE COLLECTE. Les seuls compteurs qui lisent ce
//  module sont ceux du suivi des non-reconductions (Recap2Metrics.indicateursNR).
//
//  ORDRE DE PRIORITÉ (arbitrage de Stan, 18/09/2026) :
//    1. contentieux confirmé ;
//    2. rétractation ou refus définitif documenté ;
//    3. anomalie administrative, documentaire ou financière ;
//    4. suspension insuffisamment documentée ;
//    5. action de récupération ;
//    6. décision manuelle d'organisation.
//  Une décision manuelle (niveau 6) ne masque JAMAIS les niveaux 1 à 4 ; elle
//  peut seulement taire une action de récupération (niveau 5), selon la règle
//  de chaque décision ci-dessous.
// ============================================================================

(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.Recap2Regles = fabrique();
}(typeof self !== 'undefined' ? self : this, function () {
  const PREFIXE = 'À faire : ';
  const NIVEAUX = {
    1: 'Contentieux confirmé',
    2: 'Rétractation ou refus définitif documenté',
    3: 'Anomalie administrative, documentaire ou financière',
    4: 'Suspension insuffisamment documentée',
    5: 'Action de récupération',
    6: 'Décision manuelle d’organisation',
  };
  // Nature : 'action' = remarque « À faire » au conseiller (écran + copies) ;
  // 'alerte' = information technique pour l'administrateur (écran seulement) ;
  // 'silence' = règle qui IMPOSE l'absence de remarque (documentée ici).
  const CONSEILLER = 'Conseiller forme';
  const ADMIN = 'Administrateur';
  const PERSONNE = 'Aucun';

  // ── LE REGISTRE ──────────────────────────────────────────────────────────
  //  texte : gabarit exact ; {x} = valeur calculée (montant, jours, code…).
  //  masquePar : ce qui peut faire disparaître la règle alors qu'elle serait
  //  vraie (règle de priorité supérieure ou décision manuelle).
  const REGLES = [
    // ── VENTES SIGNÉES ──
    { id: 'VENTE-CONTENTIEUX', categorie: 'Ventes signées', perimetre: 'vente', nature: 'silence', niveau: 1, destinataire: PERSONNE,
      statut: 'Résilié (contentieux)', texte: '',
      declenchement: 'Contentieux confirmé pour le client : catégorie Deciplus « Contentieux » ou note qui confirme le passage en contentieux (lu au contrôle de la vente, ou par le contrôle des non-reconduits du même Id Deciplus).',
      disparition: 'Donnée Deciplus modifiée puis nouveau contrôle.', masquePar: [],
      copieClub: false, copieCommercial: false, modifiable: false },
    { id: 'VENTE-ANNULEE', categorie: 'Ventes annulées', perimetre: 'vente', nature: 'silence', niveau: 2, destinataire: PERSONNE,
      statut: 'Annulé', texte: '',
      declenchement: 'Vente annulée dans Fitness Booster et non réintégrée (dont R21 : aucun contrat jamais créé dans Deciplus). Seule la clôture d’un contrat encore actif (VENTE-CLOTURE) reste demandée.',
      disparition: '« Réintégrer dans les chiffres » : la vente redevient normale et tous les contrôles s’appliquent.', masquePar: [],
      copieClub: false, copieCommercial: false, modifiable: false },
    { id: 'VENTE-RETRACTATION', categorie: 'Ventes signées', perimetre: 'vente', nature: 'silence', niveau: 2, destinataire: PERSONNE,
      statut: 'Résilié — Rétractation confirmée', texte: '',
      declenchement: 'Contrat arrêté pour rétractation (Deciplus, R14) et case Résilié à ✅.',
      disparition: 'Nouveau contrat au contrôle suivant, ou forçage « Résilié » ❌.', masquePar: ['VENTE-CONTENTIEUX'],
      copieClub: false, copieCommercial: false, modifiable: false },
    { id: 'VENTE-CLOTURE', categorie: 'Ventes annulées', perimetre: 'vente', nature: 'action', niveau: 3, destinataire: CONSEILLER,
      statut: '❌/❌/✅ + alerte « à clôturer »', texte: 'Clôture dans Deciplus le contrat encore actif du client.',
      declenchement: 'Vente annulée, départ établi, contrat Deciplus encore techniquement actif (alerte R22 « Contrat Deciplus encore actif — à clôturer »). Reste visible même si la vente est annulée ou les cases forcées à la main.',
      disparition: 'Contrat clôturé constaté au contrôle suivant ; réintégration de la vente (le contrôle est alors à relancer).', masquePar: ['VENTE-CONTENTIEUX'],
      copieClub: true, copieCommercial: true, modifiable: true },
    { id: 'VENTE-INTROUVABLE', categorie: 'Ventes signées', perimetre: 'vente', nature: 'action', niveau: 3, destinataire: CONSEILLER,
      statut: 'À vérifier', texte: 'Vérifie et complète la vente dans Deciplus.',
      declenchement: 'Mois contrôlé, vente non annulée absente du journal des ventes Deciplus du mois, ni rapprochement confirmé ni « Validée manuellement ».',
      disparition: 'Vente retrouvée à une recollecte, rapprochement confirmé ou « Validée manuellement ».', masquePar: ['VENTE-CONTENTIEUX', 'VENTE-ANNULEE'],
      copieClub: true, copieCommercial: true, modifiable: true, exclusive: true },
    { id: 'VENTE-JAMAIS-CREE', categorie: 'Ventes signées', perimetre: 'vente', nature: 'action', niveau: 3, destinataire: CONSEILLER,
      statut: '❌/❌/❌ + alerte « contrat jamais créé »', texte: 'Vérifie et complète la vente dans Deciplus.',
      declenchement: 'Vente non annulée (ou réintégrée) sans aucun contrat Deciplus (R20 ; une R21 réintégrée est requalifiée en R20).',
      disparition: 'Contrat créé, constaté au contrôle suivant ; annulation de la vente.', masquePar: ['VENTE-CONTENTIEUX', 'VENTE-ANNULEE'],
      copieClub: true, copieCommercial: true, modifiable: true, exclusive: true },
    { id: 'VENTE-NON-CONCLU', categorie: 'Ventes signées', perimetre: 'vente', nature: 'action', niveau: 3, destinataire: CONSEILLER,
      statut: 'Contrôle incomplet', texte: 'Vérifie la vente dans Deciplus : le contrôle automatique n’a pas pu conclure.',
      declenchement: 'Mois contrôlé et, pour cette vente, aucun contrôle automatique ou au moins un verdict « à vérifier » (Prélèvement, Réservation, Résilié) après forçages.',
      disparition: 'Nouveau contrôle concluant, ou forçage manuel des champs incertains.', masquePar: ['VENTE-CONTENTIEUX', 'VENTE-ANNULEE', 'VENTE-RETRACTATION'],
      copieClub: true, copieCommercial: true, modifiable: true, exclusive: true },
    { id: 'VENTE-CODE-CONTROLE', categorie: 'Ventes signées', perimetre: 'vente', nature: 'alerte', niveau: 3, destinataire: ADMIN,
      statut: 'Contrôle incomplet', texte: 'Contrôle incomplet — {code} : {libelle}.',
      declenchement: 'Accompagne toujours VENTE-NON-CONCLU : code technique du contrôle (CI01 à CI13) avec un libellé compréhensible. Ne remplace jamais la remarque au conseiller.',
      disparition: 'Avec VENTE-NON-CONCLU.', masquePar: ['VENTE-CONTENTIEUX', 'VENTE-ANNULEE', 'VENTE-RETRACTATION'],
      copieClub: false, copieCommercial: false, modifiable: false },
    { id: 'VENTE-RIB', categorie: 'Ventes signées', perimetre: 'vente', nature: 'action', niveau: 3, destinataire: CONSEILLER,
      statut: 'Prélèvement ❌ + alerte R12', texte: 'Récupère le RIB du client, puis lance le prélèvement.',
      declenchement: 'Échéancier futur sans RIB ni mandat et rien de prélevé (alerte R12 « RIB / mandat manquant — prélèvement non opérationnel »).',
      disparition: 'RIB ou mandat constaté au contrôle suivant.', masquePar: ['VENTE-CONTENTIEUX', 'VENTE-ANNULEE', 'VENTE-RETRACTATION'],
      copieClub: true, copieCommercial: true, modifiable: true },
    { id: 'VENTE-REGULARISER', categorie: 'Ventes signées', perimetre: 'vente', nature: 'action', niveau: 3, destinataire: CONSEILLER,
      statut: 'Alerte R9 ou R15', texte: 'Contacte le client pour régulariser son prélèvement.',
      declenchement: 'Impayé sans contentieux confirmé : prélèvement rejeté avec échéancier actif (R9) ou contrat arrêté par le club pour impayés (R15).',
      disparition: 'Plus d’échéance rejetée au contrôle suivant ; contentieux confirmé.', masquePar: ['VENTE-CONTENTIEUX', 'VENTE-ANNULEE'],
      copieClub: true, copieCommercial: true, modifiable: true },
    { id: 'VENTE-CODE-REJET', categorie: 'Ventes signées', perimetre: 'vente', nature: 'alerte', niveau: 3, destinataire: ADMIN,
      statut: 'Alerte R9', texte: 'Rejet de prélèvement — {code} : {libelle}{date}.',
      declenchement: 'Code SEPA du dernier rejet lu dans Deciplus (contrôles déposés depuis cette version).',
      disparition: 'Avec l’alerte de rejet.', masquePar: ['VENTE-CONTENTIEUX', 'VENTE-ANNULEE'],
      copieClub: false, copieCommercial: false, modifiable: false },
    { id: 'VENTE-SEANCES', categorie: 'Ventes signées', perimetre: 'vente', nature: 'action', niveau: 5, destinataire: CONSEILLER,
      statut: 'Réservation ❌', texte: 'Contacte le client pour planifier ses prochaines séances.',
      declenchement: 'Vente contrôlée, Réservation ❌, client non résilié.',
      disparition: 'Réservation future au contrôle suivant, case ou forçage Réservation ✅, résiliation.', masquePar: ['VENTE-CONTENTIEUX', 'VENTE-ANNULEE', 'VENTE-RETRACTATION', 'VENTE-INTROUVABLE', 'VENTE-JAMAIS-CREE', 'VENTE-NON-CONCLU'],
      copieClub: true, copieCommercial: true, modifiable: true },
    { id: 'VENTE-PRELEVEMENT', categorie: 'Ventes signées', perimetre: 'vente', nature: 'action', niveau: 5, destinataire: CONSEILLER,
      statut: 'Prélèvement ❌', texte: 'Vérifie le contrat et lance le prélèvement du client.',
      declenchement: 'Vente contrôlée, Prélèvement ❌, sans rejet ni RIB manquant, client non résilié.',
      disparition: 'Prélèvement lancé au contrôle suivant, case ou forçage Prélèvement ✅, résiliation.', masquePar: ['VENTE-CONTENTIEUX', 'VENTE-ANNULEE', 'VENTE-RETRACTATION', 'VENTE-INTROUVABLE', 'VENTE-JAMAIS-CREE', 'VENTE-NON-CONCLU', 'VENTE-RIB', 'VENTE-REGULARISER'],
      copieClub: true, copieCommercial: true, modifiable: true },
    { id: 'VENTE-RESILIATION', categorie: 'Ventes signées', perimetre: 'vente', nature: 'action', niveau: 5, destinataire: CONSEILLER,
      statut: 'Résilié ✅', texte: 'Contacte le client pour comprendre sa résiliation et tenter de le conserver.',
      declenchement: 'Vente contrôlée, Résilié ✅ (arrêt explicite, case ou forçage), hors rétractation, hors impayés (R15) et hors contentieux.',
      disparition: 'Remplaçant détecté au contrôle suivant, forçage Résilié ❌, retrait de la résiliation manuelle.', masquePar: ['VENTE-CONTENTIEUX', 'VENTE-ANNULEE', 'VENTE-RETRACTATION', 'VENTE-INTROUVABLE', 'VENTE-JAMAIS-CREE', 'VENTE-NON-CONCLU'],
      copieClub: true, copieCommercial: true, modifiable: true },

    // ── VNI ──
    { id: 'VNI-IDENTITE', categorie: 'VNI', perimetre: 'vni', nature: 'action', niveau: 3, destinataire: CONSEILLER,
      statut: 'À vérifier', texte: 'Vérifie l’identité du prospect dans Vendor.',
      declenchement: 'Contrôle Vendor : la fiche n’a pas pu être attribuée avec certitude (identifiant de contact non exact). Aucune décision commerciale ne la masque.',
      disparition: 'Uniquement « Identité validée » par un administrateur, ou contrôle suivant sur l’identifiant exact.', masquePar: [],
      copieClub: true, copieCommercial: true, modifiable: true },
    { id: 'VNI-FLEX', categorie: 'VNI', perimetre: 'vni', nature: 'action', niveau: 5, destinataire: CONSEILLER,
      statut: 'Flex à proposer', texte: 'Propose au prospect le Challenge Flex à 4 séances par mois.',
      declenchement: 'Identité certaine (ou validée) et aucune preuve de proposition : ni devis ni note Vendor nommant le Flex, ni décision du conseiller (Flex proposé, Prospect non intéressé, À reproposer plus tard).',
      disparition: 'Preuve trouvée au contrôle suivant, décision du conseiller, souscription (le VNI quitte la liste).', masquePar: ['VNI-IDENTITE'],
      copieClub: true, copieCommercial: true, modifiable: true },

    // ── NON-RECONDUITS ──
    { id: 'NR-CONTENTIEUX', categorie: 'Non-reconduits', perimetre: 'non_reconduit', nature: 'silence', niveau: 1, destinataire: PERSONNE,
      statut: 'Résilié (contentieux)', texte: '',
      declenchement: 'Catégorie Deciplus « Contentieux » ou note qui confirme le passage en contentieux. Statut « Résilié » imposé, compté dans « dont contentieux » d’après la seule donnée Deciplus.',
      disparition: 'Donnée Deciplus modifiée puis nouveau contrôle.', masquePar: [],
      copieClub: false, copieCommercial: false, modifiable: false },
    { id: 'NR-RETRACTATION', categorie: 'Non-reconduits', perimetre: 'non_reconduit', nature: 'silence', niveau: 2, destinataire: PERSONNE,
      statut: 'Résilié — Rétractation confirmée', texte: '',
      declenchement: 'Contrat arrêté pour rétractation dans les 14 jours (historique Deciplus). Aucune action de récupération ; les anomalies financières restent affichées.',
      disparition: 'Nouveau contrôle.', masquePar: ['NR-CONTENTIEUX'],
      copieClub: false, copieCommercial: false, modifiable: false },
    { id: 'NR-IRRECUPERABLE', categorie: 'Non-reconduits', perimetre: 'non_reconduit', nature: 'silence', niveau: 2, destinataire: PERSONNE,
      statut: 'Résilié — départ irrécupérable', texte: '',
      declenchement: 'Motif irrécupérable écrit dans une note : refus définitif (du transfert ET de la visioconférence), départ définitif sans suivi possible, décès, fraude, exclusion, contre-indication définitive. Le refus de la visioconférence seul ne suffit pas.',
      disparition: 'Nouveau contrôle.', masquePar: ['NR-CONTENTIEUX'],
      copieClub: false, copieCommercial: false, modifiable: false },
    { id: 'NR-IDENTITE', categorie: 'Non-reconduits', perimetre: 'non_reconduit', nature: 'action', niveau: 3, destinataire: CONSEILLER,
      statut: 'À creuser', texte: 'Vérifie l’identité du client et son éventuelle reconduction dans Deciplus.',
      declenchement: 'Aucun Id Deciplus fiable, dossier illisible, ou note évoquant un doublon / une autre fiche.',
      disparition: 'Contrôle suivant avec une identité certaine.', masquePar: [],
      copieClub: true, copieCommercial: true, modifiable: true },
    { id: 'NR-TRANSFERT', categorie: 'Non-reconduits', perimetre: 'non_reconduit', nature: 'action', niveau: 3, destinataire: CONSEILLER,
      statut: 'À creuser', texte: 'Vérifie dans Deciplus si le client a bien été transféré vers un autre studio.',
      declenchement: 'Une note évoque un transfert ou un autre studio, sans nouveau contrat retrouvé.',
      disparition: 'Contrat du nouveau studio retrouvé au contrôle suivant (Reconduit autrement).', masquePar: ['NR-CONTENTIEUX'],
      copieClub: true, copieCommercial: true, modifiable: true },
    { id: 'NR-IMPAYE', categorie: 'Non-reconduits', perimetre: 'non_reconduit', nature: 'action', niveau: 3, destinataire: CONSEILLER,
      statut: 'À traiter', texte: 'Contacte le client pour régulariser son prélèvement.',
      declenchement: 'Impayé ou problème bancaire sans contentieux confirmé (note, ou contrat arrêté pour impayés).',
      disparition: 'Contentieux confirmé ou nouveau contrat au contrôle suivant.', masquePar: ['NR-CONTENTIEUX'],
      copieClub: true, copieCommercial: true, modifiable: true },
    { id: 'FIN-ECART', categorie: 'Finance', perimetre: 'non_reconduit', nature: 'action', niveau: 3, destinataire: CONSEILLER,
      statut: 'Écart à régulariser', texte: 'Le client devait régler {du}, mais {encaisse} ont réellement été encaissés, soit un écart de {ecart}. Vérifie et régularise cet écart.',
      declenchement: 'Résiliation avant la fin de l’engagement, montant dû FIABLE (contrat Deciplus, confirmé par Vendor quand il est connu ; jamais une estimation seule) supérieur d’au moins 5 € à l’encaissé, sans justification écrite.',
      disparition: 'Justification écrite (geste commercial, accord, échéancier, avoir) ou paiement constaté au contrôle suivant.', masquePar: ['NR-CONTENTIEUX'],
      copieClub: true, copieCommercial: true, modifiable: true },
    { id: 'FIN-JUSTIFIE', categorie: 'Finance', perimetre: 'non_reconduit', nature: 'alerte', niveau: 3, destinataire: ADMIN,
      statut: 'Écart probablement justifié', texte: 'Écart de {ecart} probablement justifié par {justification} — à confirmer.',
      declenchement: 'Écart ≥ 5 € et justification trouvée (rétractation, geste commercial, accord avec le club, échéancier, avoir).',
      disparition: 'Nouveau contrôle.', masquePar: ['NR-CONTENTIEUX'],
      copieClub: false, copieCommercial: false, modifiable: false },
    { id: 'FIN-IMPOSSIBLE', categorie: 'Finance', perimetre: 'non_reconduit', nature: 'alerte', niveau: 3, destinataire: ADMIN,
      statut: 'Contrôle financier impossible', texte: 'Contrôle financier impossible : données incomplètes{detail}.',
      declenchement: 'Résiliation anticipée mais montants absents, contradictoires (Vendor ≠ Deciplus, encaissé ≠ journal) ou estimés. Aucun écart n’est présenté comme certain ; aucune remarque au conseiller, qui ne peut pas corriger ces sources.',
      disparition: 'Données complètes et concordantes au contrôle suivant.', masquePar: ['NR-CONTENTIEUX'],
      copieClub: false, copieCommercial: false, modifiable: false },
    { id: 'SUSP-PROLONGATION', categorie: 'Suspensions', perimetre: 'non_reconduit+suspension', nature: 'action', niveau: 3, destinataire: CONSEILLER,
      statut: 'Suspendu temporairement', texte: 'Prolonge le contrat de {jours} jours dans Deciplus pour compenser la suspension{montant}.',
      declenchement: 'Durée réelle du contrat inférieure de plus de 7 jours à la durée nominale + suspensions (contrat non reconductible, durée lisible).',
      disparition: 'Contrat prolongé constaté au contrôle suivant.', masquePar: ['NR-CONTENTIEUX'],
      copieClub: true, copieCommercial: true, modifiable: true },
    { id: 'SUSP-PROLONGATION-IMPOSSIBLE', categorie: 'Suspensions', perimetre: 'non_reconduit+suspension', nature: 'alerte', niveau: 3, destinataire: ADMIN,
      statut: 'Suspendu temporairement', texte: 'Prolongation non vérifiable : {motif}.',
      declenchement: 'Suspension sur un contrat reconductible ou de durée nominale illisible.',
      disparition: 'Nouveau contrôle.', masquePar: ['NR-CONTENTIEUX'],
      copieClub: false, copieCommercial: false, modifiable: false },
    { id: 'SUSP-DOC', categorie: 'Suspensions', perimetre: 'non_reconduit+suspension', nature: 'action', niveau: 4, destinataire: CONSEILLER,
      statut: 'Suspendu temporairement', texte: 'Renseigne dans Deciplus la raison et la période de la suspension du client.',
      declenchement: 'Suspension en cours dont la cause n’est pas écrite dans l’une des trois zones de notes, ou dont la période n’est pas connue (ni dates de suspension Deciplus, ni reprise ou durée indéterminée écrite). « Suspendu » ou « Sous contrôle » posés à la main ne la masquent pas.',
      disparition: 'Raison et période constatées au contrôle suivant.', masquePar: ['NR-CONTENTIEUX'],
      copieClub: true, copieCommercial: true, modifiable: true },
    { id: 'SUSP-TERMINEE', categorie: 'Suspensions', perimetre: 'non_reconduit+suspension', nature: 'action', niveau: 5, destinataire: CONSEILLER,
      statut: 'Suspension terminée', texte: 'La suspension du client est terminée. Contacte-le pour organiser sa reprise et réactiver son abonnement.',
      declenchement: 'Fin de suspension passée, sans échéance après la reprise, contrat non actif. Jamais affichée comme suspension active.',
      disparition: 'Reprise constatée au contrôle suivant ; décision manuelle d’organisation.', masquePar: ['NR-CONTENTIEUX', 'NR-RETRACTATION', 'NR-IRRECUPERABLE', 'DECISION-MANUELLE'],
      copieClub: true, copieCommercial: true, modifiable: true },
    { id: 'NR-DEMENAGEMENT', categorie: 'Déménagement', perimetre: 'non_reconduit', nature: 'action', niveau: 5, destinataire: CONSEILLER,
      statut: 'À traiter (survit à « Résilié »)', texte: 'Contacte le client et propose-lui un transfert de studio ou de poursuivre son Challenge en visioconférence.',
      declenchement: 'Déménagement établi (Confirmé ou Probable). Reste affiché sous une décision manuelle « Résilié » ou « Départ confirmé ».',
      disparition: 'Motif irrécupérable documenté (refus du transfert ET de la visio, départ définitif), contentieux, rétractation, reconduction.', masquePar: ['NR-CONTENTIEUX', 'NR-RETRACTATION', 'NR-IRRECUPERABLE', 'Sous contrôle / Suspendu / Toujours actif / Reconduit autrement / Récupéré (manuels)'],
      copieClub: true, copieCommercial: true, modifiable: true },
    { id: 'NR-FREINS', categorie: 'Non-reconduits', perimetre: 'non_reconduit', nature: 'action', niveau: 5, destinataire: CONSEILLER,
      statut: 'À traiter', texte: 'Contacte le client, identifie ses freins et propose-lui un nouveau challenge adapté, par exemple le Protocole 42.',
      declenchement: 'Cause : manque de temps, de motivation ou d’assiduité (fréquentation).',
      disparition: 'Nouveau contrôle ; décision manuelle d’organisation.', masquePar: ['NR-CONTENTIEUX', 'NR-RETRACTATION', 'NR-IRRECUPERABLE', 'DECISION-MANUELLE'],
      copieClub: true, copieCommercial: true, modifiable: true },
    { id: 'NR-PRIX', categorie: 'Non-reconduits', perimetre: 'non_reconduit', nature: 'action', niveau: 5, destinataire: CONSEILLER,
      statut: 'À traiter', texte: 'Contacte le client et propose-lui le Challenge Flex à 4 séances par mois.',
      declenchement: 'Cause : prix ou difficulté financière, hors contentieux.',
      disparition: 'Nouveau contrôle ; décision manuelle d’organisation.', masquePar: ['NR-CONTENTIEUX', 'NR-RETRACTATION', 'NR-IRRECUPERABLE', 'DECISION-MANUELLE'],
      copieClub: true, copieCommercial: true, modifiable: true },
    { id: 'NR-RESULTATS', categorie: 'Non-reconduits', perimetre: 'non_reconduit', nature: 'action', niveau: 5, destinataire: CONSEILLER,
      statut: 'À traiter', texte: 'Réalise un bilan avec le client, redéfinis ses objectifs et propose-lui un accompagnement adapté.',
      declenchement: 'Cause : manque de résultats.', disparition: 'Nouveau contrôle ; décision manuelle d’organisation.',
      masquePar: ['NR-CONTENTIEUX', 'NR-RETRACTATION', 'NR-IRRECUPERABLE', 'DECISION-MANUELLE'], copieClub: true, copieCommercial: true, modifiable: true },
    { id: 'NR-PLANNING', categorie: 'Non-reconduits', perimetre: 'non_reconduit', nature: 'action', niveau: 5, destinataire: CONSEILLER,
      statut: 'À traiter', texte: 'Contacte le client et recherche avec lui des créneaux compatibles avec ses disponibilités.',
      declenchement: 'Cause : difficulté de planning.', disparition: 'Nouveau contrôle ; décision manuelle d’organisation.',
      masquePar: ['NR-CONTENTIEUX', 'NR-RETRACTATION', 'NR-IRRECUPERABLE', 'DECISION-MANUELLE'], copieClub: true, copieCommercial: true, modifiable: true },
    { id: 'NR-SANTE', categorie: 'Non-reconduits', perimetre: 'non_reconduit', nature: 'action', niveau: 5, destinataire: CONSEILLER,
      statut: 'À traiter', texte: 'Contacte le client et étudie une suspension ou une reprise progressive adaptée.',
      declenchement: 'Cause : santé ou blessure.', disparition: 'Nouveau contrôle ; décision manuelle d’organisation.',
      masquePar: ['NR-CONTENTIEUX', 'NR-RETRACTATION', 'NR-IRRECUPERABLE', 'DECISION-MANUELLE'], copieClub: true, copieCommercial: true, modifiable: true },
    { id: 'NR-INSATISFACTION', categorie: 'Non-reconduits', perimetre: 'non_reconduit', nature: 'action', niveau: 5, destinataire: CONSEILLER,
      statut: 'À traiter', texte: 'Appelle le client pour comprendre son insatisfaction et trouve une solution avec le responsable du club.',
      declenchement: 'Cause : insatisfaction.', disparition: 'Nouveau contrôle ; décision manuelle d’organisation.',
      masquePar: ['NR-CONTENTIEUX', 'NR-RETRACTATION', 'NR-IRRECUPERABLE', 'DECISION-MANUELLE'], copieClub: true, copieCommercial: true, modifiable: true },
    { id: 'NR-COACH', categorie: 'Non-reconduits', perimetre: 'non_reconduit', nature: 'action', niveau: 5, destinataire: CONSEILLER,
      statut: 'À traiter', texte: 'Échange avec le responsable du club pour proposer au client un changement de coach.',
      declenchement: 'Cause : problème avec le coach.', disparition: 'Nouveau contrôle ; décision manuelle d’organisation.',
      masquePar: ['NR-CONTENTIEUX', 'NR-RETRACTATION', 'NR-IRRECUPERABLE', 'DECISION-MANUELLE'], copieClub: true, copieCommercial: true, modifiable: true },
    { id: 'NR-FIN-CHALLENGE', categorie: 'Non-reconduits', perimetre: 'non_reconduit', nature: 'action', niveau: 5, destinataire: CONSEILLER,
      statut: 'À traiter', texte: 'Contacte le client et propose-lui une formule pour poursuivre son accompagnement.',
      declenchement: 'Challenge arrivé à son terme sans nouvelle formule, aucun autre motif écrit.', disparition: 'Nouveau contrôle ; décision manuelle d’organisation.',
      masquePar: ['NR-CONTENTIEUX', 'NR-RETRACTATION', 'NR-IRRECUPERABLE', 'DECISION-MANUELLE'], copieClub: true, copieCommercial: true, modifiable: true },
    { id: 'NR-A-CONFIRMER', categorie: 'Non-reconduits', perimetre: 'non_reconduit', nature: 'action', niveau: 5, destinataire: CONSEILLER,
      statut: 'À traiter', texte: 'Contacte le client pour confirmer le motif de sa non-reconduction et renseigne-le dans Deciplus.',
      declenchement: 'Plusieurs motifs possibles dans la même note.', disparition: 'Nouveau contrôle ; décision manuelle d’organisation.',
      masquePar: ['NR-CONTENTIEUX', 'NR-RETRACTATION', 'NR-IRRECUPERABLE', 'DECISION-MANUELLE'], copieClub: true, copieCommercial: true, modifiable: true },
    { id: 'NR-INCONNU', categorie: 'Non-reconduits', perimetre: 'non_reconduit', nature: 'action', niveau: 5, destinataire: CONSEILLER,
      statut: 'À traiter', texte: 'Contacte le client pour comprendre sa non-reconduction et renseigne le motif dans Deciplus.',
      declenchement: 'Motif inconnu (aucune note exploitable, aucun indice structurel).', disparition: 'Nouveau contrôle ; décision manuelle d’organisation.',
      masquePar: ['NR-CONTENTIEUX', 'NR-RETRACTATION', 'NR-IRRECUPERABLE', 'DECISION-MANUELLE'], copieClub: true, copieCommercial: true, modifiable: true },
    { id: 'NR-DEPART-MOTIF', categorie: 'Décision manuelle', perimetre: 'non_reconduit', nature: 'action', niveau: 6, destinataire: CONSEILLER,
      statut: 'Départ confirmé', texte: 'Précise le motif du départ confirmé.',
      declenchement: 'Décision manuelle « Départ confirmé » sans motif irrécupérable documenté (ni contentieux, ni rétractation, ni refus définitif) : l’action de récupération reste affichée.',
      disparition: 'Motif irrécupérable écrit dans Deciplus puis nouveau contrôle ; retrait de la décision.', masquePar: ['NR-CONTENTIEUX', 'NR-RETRACTATION', 'NR-IRRECUPERABLE'],
      copieClub: true, copieCommercial: true, modifiable: true },
    { id: 'DECISION-MANUELLE', categorie: 'Décision manuelle', perimetre: 'non_reconduit', nature: 'silence', niveau: 6, destinataire: PERSONNE,
      statut: 'Sous contrôle / Suspendu / Toujours actif / Reconduit autrement / Récupéré / Résilié', texte: '',
      declenchement: 'Décision manuelle d’organisation : tait uniquement les actions de récupération (niveau 5). « Résilié » laisse le déménagement ; « Départ confirmé » ne tait rien sans motif irrécupérable. Ne masque jamais les niveaux 1 à 4.',
      disparition: 'Retour au statut automatique.', masquePar: [],
      copieClub: false, copieCommercial: false, modifiable: false },
  ];
  const PAR_ID = {};
  REGLES.forEach((r) => { PAR_ID[r.id] = r; });

  // ── OUTILS ────────────────────────────────────────────────────────────────
  const euros = (x) => {
    const v = Math.round(Number(x) * 100) / 100;
    const [e, c] = v.toFixed(2).split('.');
    return e.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f') + (c === '00' ? '' : ',' + c) + ' €';   // espace fine insécable, comme le moteur
  };
  const dateFr = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(iso || '') ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '');
  function remplir(gabarit, p) {
    return String(gabarit).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] != null ? String(p[k]) : ''));
  }
  // Un élément ne peut citer qu'une règle DÉCLARÉE : le registre fait foi.
  function item(id, params) {
    const r = PAR_ID[id];
    if (!r) throw new Error('règle non déclarée : ' + id);
    return { regle: id, niveau: r.niveau, nature: r.nature, texte: remplir(r.texte, params), destinataire: r.destinataire, modifiable: !!r.modifiable };
  }
  // « À faire : » exactement une fois, écrit dans le texte (jamais par CSS).
  function sansPrefixe(t) { let s = String(t == null ? '' : t).trim(); while (/^À faire\s*:\s*/i.test(s)) s = s.replace(/^À faire\s*:\s*/i, '').trim(); return s; }
  function enAction(t) { return PREFIXE + sansPrefixe(t); }

  // Même normalisation que lib/recap2Matches.js cleIdentite.
  function cleIdentite(identite) {
    return String(identite == null ? '' : identite)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/['’`´]/g, ' ').replace(/[-_]/g, ' ')
      .toUpperCase().replace(/[^A-Z0-9]+/g, ' ')
      .trim().split(/\s+/).filter(Boolean).sort().join(' ');
  }
  // CLÉ STABLE D'UN DOSSIER (personnalisation) : avec le mois et l'identifiant
  // de règle, elle forme la clé d'une remarque personnalisée. Une vente = le
  // client ET la date de signature (deux ventes = deux dossiers).
  const ID_RE = /^[0-9]{1,20}$/;
  const ID_VENDOR_RE = /^[0-9]{10,16}x[0-9]{10,24}$/;
  function cleDossier(type, l) {
    const x = l || {};
    if (type === 'vente') return 'vente:' + cleIdentite(x.client) + '|' + String(x.date || '').trim();
    if (type === 'vni') {
      if (ID_VENDOR_RE.test(String(x.contactId || ''))) return 'vendor:' + x.contactId;
      return ID_RE.test(String(x.idClient || '')) ? 'id:' + x.idClient : 'nom:' + cleIdentite(x.client);
    }
    return ID_RE.test(String(x.idClient || '')) ? 'id:' + x.idClient : 'nom:' + cleIdentite(x.client);
  }

  // ── VENTES ──────────────────────────────────────────────────────────────
  //  Libellés des alertes du moteur (lib/recap2Operationnel.js ALERTES).
  const A = {
    REJET: 'Prélèvement à régulariser — rejet / impayé', RIB: 'RIB / mandat manquant — prélèvement non opérationnel',
    INTERROMPU: 'Prélèvement interrompu — impayés / contentieux', JAMAIS_CREE: 'À régulariser — contrat jamais créé dans Deciplus',
    ANNULEE_JAMAIS_CREE: 'Vente annulée — contrat jamais créé dans Deciplus', A_CLOTURER: 'Contrat Deciplus encore actif — à clôturer',
  };
  // Codes du contrôle incomplet : la raison du moteur, en clair.
  const CODES_CONTROLE = [
    ['CI01', /dossier Deciplus illisible|fiche illisible|contrats illisibles|API contrat|session Deciplus/i, 'fiche Deciplus non exploitable'],
    ['CI02', /code d.échéance/i, 'échéancier Deciplus illisible (code d’échéance inconnu)'],
    ['CI03', /réservation future/i, 'réservation future sans aucun contrat'],
    ['CI04', /aucun contrat Deciplus correspondant/i, 'aucun contrat Deciplus ne correspond à la prestation vendue'],
    ['CI05', /plusieurs contrats/i, 'plusieurs contrats possibles, tous prélevés'],
    ['CI06', /résiliation programmée/i, 'résiliation programmée sans contrat de remplacement'],
    ['CI07', /arrêté sans motif/i, 'contrat arrêté sans motif reconnu'],
    ['CI08', /petit montant/i, 'contrat réduit à un petit montant, sans échéance future'],
    ['CI09', /sans échéancier ni paiement/i, 'contrat actif sans échéancier ni paiement'],
    ['CI11', /réintégrée/i, 'vente réintégrée : contrôle à relancer'],
    ['CI12', /aucun identifiant Deciplus fiable/i, 'aucun identifiant Deciplus fiable'],
    ['CI13', /divergents/i, 'identifiants Deciplus divergents, à trancher'],
  ];
  function codeControle(a) {
    if (!a) return { code: 'CI10', libelle: 'vente non contrôlée' };
    const raison = String(a.raison || '');
    const t = CODES_CONTROLE.find(([, re]) => re.test(raison));
    return t ? { code: t[0], libelle: t[2] } : { code: 'CI00', libelle: raison || 'verdict incertain' };
  }
  const CODES_SEPA = {
    AC01: 'IBAN incorrect', AC04: 'compte clôturé', AC06: 'compte bloqué', AG01: 'prélèvement interdit sur ce compte',
    AM04: 'provision insuffisante', MD01: 'mandat absent ou invalide', MD06: 'remboursement demandé par le client',
    MS02: 'refus du client', MS03: 'raison non communiquée par la banque', RR04: 'raison réglementaire', SL01: 'service spécifique de la banque',
    BE05: 'créancier non reconnu', FF01: 'format invalide',
  };
  const connu = (v) => v === 'ok' || v === 'ko';
  const CHAMPS = ['prelevement', 'reservation', 'resilie'];

  // Le mois est-il contrôlé ? Sans aucun contrôle automatique des ventes, on
  // ne réclame rien sur les ventes (mois ancien).
  function moisControle(rapport) {
    const studios = (rapport && rapport.studios) || {};
    return Object.keys(studios).some((s) => (((studios[s] || {}).clientsRetrouves || {}).liste || []).some((l) => l && l.automatique));
  }
  // Contexte de lecture d'un rapport : mois contrôlé, et les Id Deciplus en
  // contentieux confirmé par le contrôle des non-reconduits (même personne).
  function contexteRapport(rapport) {
    const contentieux = new Set();
    const studios = (rapport && rapport.studios) || {};
    Object.keys(studios).forEach((s) => {
      (((studios[s] || {}).nonReconduction || {}).liste || []).forEach((l) => {
        if (l && l.analyse && l.analyse.contentieux && ID_RE.test(String(l.idClient || ''))) contentieux.add(String(l.idClient));
      });
    });
    return { controle: moisControle(rapport), contentieux };
  }
  const reintegree = (l) => !!(l && l.reintegration && l.reintegration.decision === 'reintegree' && !l.reintegration.plusNecessaire);

  // Les remarques et alertes d'une vente, dans l'ordre de priorité.
  function evaluerVente(ligne, ctx) {
    const l = ligne || {};
    const c = ctx || {};
    if (c.controle === false) return [];
    const a = l.automatique || null;
    const o = l.operationnel || null;
    const alertes = (a && a.alertes) || [];
    const regles = (a && a.regles) || [];
    const details = (a && a.details) || {};
    const id = String((a && a.idDeciplus) || l.idClient || '');
    const has = (x) => alertes.indexOf(x) > -1;

    // 1. Contentieux confirmé : aucune remarque, aucune invitation à conserver.
    if (details.contentieux || (id && c.contentieux && c.contentieux.has && c.contentieux.has(id))) return [];
    // 2. Vente annulée (non réintégrée) : aucune action, sauf un contrat resté actif.
    if (l.annulee) return has(A.A_CLOTURER) ? [item('VENTE-CLOTURE')] : [];
    // 2. Rétractation confirmée.
    const resilie = !!(o && o.resilie === 'ok');
    if (resilie && regles.indexOf('R14') > -1 && (!o.sources || o.sources.resilie === 'auto')) return [];
    // 3. Anomalies administratives EXCLUSIVES : l'état réel n'est pas connu.
    const verifiee = !!(l.verification && l.verification.verifiee);
    if (l.retrouve === false && !l.valideManuellement && !verifiee) return [item('VENTE-INTROUVABLE')];
    if (has(A.JAMAIS_CREE)) return [item('VENTE-JAMAIS-CREE')];
    if (has(A.A_CLOTURER)) return [item('VENTE-CLOTURE')];
    if (!o || CHAMPS.some((k) => !connu(o[k]))) {
      const cc = codeControle(a);
      return [item('VENTE-NON-CONCLU'), item('VENTE-CODE-CONTROLE', cc)];
    }
    // 3. Anomalies administratives et financières cumulables.
    const out = [];
    const rib = has(A.RIB);
    const impaye = has(A.REJET) || has(A.INTERROMPU);
    if (rib) out.push(item('VENTE-RIB'));
    if (impaye) {
      out.push(item('VENTE-REGULARISER'));
      (details.codesRejet || []).slice(-1).forEach((r) => {
        const code = String(r.code || '').toUpperCase();
        out.push(item('VENTE-CODE-REJET', { code, libelle: CODES_SEPA[code] || 'motif bancaire', date: r.date ? ' (le ' + dateFr(r.date) + ')' : '' }));
      });
    }
    // 5. Actions de récupération.
    if (o.reservation === 'ko' && !resilie) out.push(item('VENTE-SEANCES'));
    if (o.prelevement === 'ko' && !rib && !impaye && !resilie) out.push(item('VENTE-PRELEVEMENT'));
    if (resilie && !has(A.INTERROMPU)) out.push(item('VENTE-RESILIATION'));
    return out;
  }
  // Rétractation ou contentieux d'une vente : pour l'étiquette à l'écran.
  function etatVente(ligne, ctx) {
    const l = ligne || {};
    const a = l.automatique || {};
    const o = l.operationnel || {};
    const id = String(a.idDeciplus || l.idClient || '');
    if ((a.details && a.details.contentieux) || (id && ctx && ctx.contentieux && ctx.contentieux.has(id))) return 'contentieux';
    if (!l.annulee && o.resilie === 'ok' && (a.regles || []).indexOf('R14') > -1 && (!o.sources || o.sources.resilie === 'auto')) return 'retractation';
    return '';
  }

  // ── VNI ─────────────────────────────────────────────────────────────────
  function evaluerVni(ligne) {
    const l = ligne || {};
    const f = l.flex;
    if (!f || !f.statut) return [];                          // mois non contrôlé : rien n'est réclamé
    const identiteValidee = !!(l.identiteVni && l.identiteVni.validee);
    if (f.statutAuto === 'À vérifier' && !identiteValidee) return [item('VNI-IDENTITE')];
    const preuve = !!f.decision || f.statutAuto === 'Flex proposé';
    if (preuve) return [];
    if (f.statutAuto === 'Flex à proposer' || f.statutAuto === 'À vérifier') return [item('VNI-FLEX')];
    return [];
  }

  // ── NON-RECONDUITS ────────────────────────────────────────────────────────
  const retractationDe = (a) => !!(a && (a.retractation
    || (a.cause && (/^Rétractation/.test(a.cause.libelle || '') || /rétractation/i.test(a.cause.indice || '')))));
  // Requalification à la lecture : la même règle pour un contrôle ancien et un
  // contrôle récent (rétractation, contentieux, identité, transfert).
  function requalifierNR(analyse) {
    const a = analyse || null;
    if (!a) return null;
    const q = { statut: a.statut, contentieux: !!a.contentieux, retractation: false, irrecuperable: !!a.irrecuperable,
      identite: false, transfert: false, cause: a.cause || null, motifExclusion: a.motifExclusion || '' };
    if (q.contentieux) { q.statut = 'resilie'; q.motifExclusion = 'contentieux'; return q; }
    if (retractationDe(a) && (a.statut === 'a_traiter' || a.statut === 'resilie')) {
      q.retractation = true; q.statut = 'resilie'; q.motifExclusion = 'rétractation';
      q.cause = Object.assign({}, a.cause || {}, { code: 'retractation', libelle: 'Rétractation confirmée', certitude: 'Confirmée' });
      return q;
    }
    if (a.statut === 'a_creuser') {
      if (a.cause && a.cause.code === 'transfert') q.transfert = true; else q.identite = true;
    }
    return q;
  }
  // Statut effectif : contentieux et rétractation (niveaux 1-2) priment sur
  // toute décision manuelle ; sinon la décision manuelle, sinon l'automatique.
  function statutEffectifNR(l) {
    const q = requalifierNR(l && l.analyse);
    if (q && (q.contentieux || q.retractation)) return 'resilie';
    return (l && l.suivi && l.suivi.statut) || (q && q.statut) || 'non_controle';
  }
  const MANUELS_TAISENT = ['sous_controle', 'suspendu', 'toujours_actif', 'reconduit_autrement', 'recupere'];
  const ACTION_CAUSE = {
    demenagement: 'NR-DEMENAGEMENT', temps: 'NR-FREINS', motivation: 'NR-FREINS', frequentation: 'NR-FREINS',
    prix: 'NR-PRIX', resultats: 'NR-RESULTATS', planning: 'NR-PLANNING', sante: 'NR-SANTE', insatisfaction: 'NR-INSATISFACTION',
    coach: 'NR-COACH', fin_challenge: 'NR-FIN-CHALLENGE', inconnu: 'NR-INCONNU', autre: 'NR-INCONNU',
  };
  function financeItems(f) {
    if (!f) return [];
    if (f.anomalie === 'divergence') {
      return [item('FIN-IMPOSSIBLE', { detail: ' — montant du contrat : Vendor ' + euros(f.contratVendor) + ', Deciplus ' + euros(f.contratDeciplus) })];
    }
    if (f.anomalie === 'encaisse_discordant') {
      return [item('FIN-IMPOSSIBLE', { detail: ' — encaissé : Deciplus ' + euros(f.encaisse) + ', journal ' + euros(f.journalNet) })];
    }
    if (f.anomalie || f.ecart == null) return [item('FIN-IMPOSSIBLE', { detail: '' })];
    // Un total Vendor ESTIMÉ n'est jamais présenté comme certain.
    if (f.vendorEstime && (f.contratDeciplus == null || Math.abs(Number(f.contratVendor) - Number(f.contratDeciplus)) >= 5)) {
      return [item('FIN-IMPOSSIBLE', { detail: ' — montant Vendor estimé' })];
    }
    if (!(Number(f.ecart) >= 5)) return [];
    if (f.justification) return [item('FIN-JUSTIFIE', { ecart: euros(f.ecart), justification: f.justification })];
    const du = f.contratReference != null ? f.contratReference : (f.contratDeciplus != null ? f.contratDeciplus : f.contratVendor);
    const regle = f.net != null ? f.net : f.encaisse;
    return [item('FIN-ECART', { du: euros(du), encaisse: euros(regle), ecart: euros(f.ecart) })];
  }
  function suspensionItems(s, { recuperation = true } = {}) {
    if (!s) return { admin: [], doc: [], recup: [] };
    const admin = [];
    const p = s.prolongation;
    if (p && p.verifiable && Number(p.manqueJours) > 0) {
      admin.push(item('SUSP-PROLONGATION', { jours: p.manqueJours, montant: Number(s.montantSuspendu) > 0 ? ' (' + euros(s.montantSuspendu) + ' d’échéances suspendues à replanifier)' : '' }));
    } else if (p && p.verifiable === false && p.motif) admin.push(item('SUSP-PROLONGATION-IMPOSSIBLE', { motif: p.motif }));
    const doc = (!s.terminee && (!s.raisonRenseignee || (!s.repriseDate && !s.indeterminee))) ? [item('SUSP-DOC')] : [];
    const recup = (s.terminee && recuperation) ? [item('SUSP-TERMINEE')] : [];
    return { admin, doc, recup };
  }
  // Les remarques d'un non-reconduit, dans l'ordre de priorité.
  function evaluerNR(ligne) {
    const l = ligne || {};
    const a = l.analyse;
    if (!a) return [];                                        // mois non contrôlé : rien n'est réclamé
    const q = requalifierNR(a);
    // 1. Contentieux confirmé : rien.
    if (q.contentieux) return [];
    const manuel = (l.suivi && l.suivi.statut) || '';
    const out = [];
    // 3. Anomalies administratives, documentaires, financières (jamais masquées).
    if (q.identite) out.push(item('NR-IDENTITE'));
    if (q.transfert) out.push(item('NR-TRANSFERT'));
    const causeCode = q.cause && q.cause.code;
    if (causeCode === 'impaye' && q.statut === 'a_traiter') out.push(item('NR-IMPAYE'));
    out.push(...financeItems(a.finance));
    const s = suspensionItems(a.suspension, { recuperation: q.statut === 'a_traiter' });
    out.push(...s.admin);
    // 4. Suspension insuffisamment documentée.
    out.push(...s.doc);
    // 2. Rétractation / refus définitif : aucune action de récupération.
    if (q.retractation || q.irrecuperable) return out;
    // 5. Actions de récupération.
    let recup = [];
    if (s.recup.length) recup = s.recup;
    else if (q.statut === 'a_traiter' && causeCode && causeCode !== 'impaye' && causeCode !== 'transfert') {
      const incertain = q.cause.certitude === 'À confirmer' && causeCode !== 'inconnu';
      recup = [item(incertain ? 'NR-A-CONFIRMER' : (ACTION_CAUSE[causeCode] || 'NR-INCONNU'))];
    }
    // 6. Décisions manuelles d'organisation : seulement sur le niveau 5.
    if (MANUELS_TAISENT.indexOf(manuel) > -1) recup = [];
    else if (manuel === 'resilie') recup = recup.filter((x) => x.regle === 'NR-DEMENAGEMENT');
    else if (manuel === 'depart_confirme') recup = recup.concat([item('NR-DEPART-MOTIF')]);
    return out.concat(recup);
  }
  // Déménagement encore récupérable sous une décision « Résilié » (bandeau, compteur).
  function recuperationOuverte(ligne) {
    const a = ligne && ligne.analyse;
    const q = requalifierNR(a);
    if (!q || q.contentieux || q.retractation || q.irrecuperable || q.statut !== 'a_traiter') return false;
    return !!(q.cause && q.cause.code === 'demenagement' && q.cause.certitude !== 'À confirmer');
  }
  // Une suspension hors non-reconduits (liste `suspensionsControle`).
  function evaluerSuspension(ligne) {
    const a = ligne && ligne.analyse;
    if (!a) return [];
    if (a.contentieux) return [];
    const s = suspensionItems(a.suspension, { recuperation: true });
    return s.admin.concat(s.doc, s.recup);
  }
  // État affiché d'une suspension : terminée n'est JAMAIS « active ».
  //  `aujourdHui` 'AAAA-MM-JJ' : une fin passée depuis le contrôle se voit.
  function etatSuspension(s, aujourdHui) {
    if (!s) return null;
    if (s.terminee) return { code: 'terminee', libelle: 'Suspension terminée' + (s.fin ? ' le ' + dateFr(s.fin) : '') + ' sans reprise' };
    if (s.fin && aujourdHui && s.fin < aujourdHui) return { code: 'terminee_depuis', libelle: 'Suspension terminée le ' + dateFr(s.fin) + ' — reprise à vérifier au prochain contrôle' };
    return { code: 'active', libelle: 'Suspendu temporairement' };
  }

  // ── VERSIONS AFFICHÉES (personnalisation) ────────────────────────────────
  //  `ligne.remarquesPerso` = { <id de règle>: { texte, modifieLe, modifiePar, auteur } },
  //  posé par le serveur pour CE dossier et CE mois. Seules les actions sont
  //  personnalisables ; l'écran et les copies passent par ici.
  function versions(items, ligne) {
    const m = (ligne && ligne.remarquesPerso) || {};
    return (items || []).map((x) => {
      const v = x.nature === 'action' ? m[x.regle] : null;
      const base = Object.assign({}, x, { origine: x.texte });
      if (v && v.texte) return Object.assign(base, { texte: sansPrefixe(v.texte), modifiee: true, modifieLe: v.modifieLe || '', modifiePar: v.modifiePar || '', auteur: v.auteur || v.modifiePar || '' });
      return Object.assign(base, { modifiee: false });
    });
  }
  const actions = (items) => (items || []).filter((x) => x.nature === 'action');
  const alertesAdmin = (items) => (items || []).filter((x) => x.nature === 'alerte');

  // ── VALIDATION D'UN DÉPÔT (le moteur du Mac cite des textes du registre) ──
  function gabaritRe(t) {
    return new RegExp('^' + String(t).replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{\w+\\?\}/g, '.*').replace(/\{\w+\}/g, '.*') + '$');
  }
  const GABARITS = REGLES.filter((r) => r.texte).map((r) => gabaritRe(r.texte));
  function texteDuRegistre(t) { const s = sansPrefixe(t); return GABARITS.some((re) => re.test(s)); }

  return {
    PREFIXE, NIVEAUX, REGLES, PAR_ID, CONSEILLER, ADMIN, CODES_CONTROLE, CODES_SEPA, ALERTES_MOTEUR: A,
    item, remplir, enAction, sansPrefixe, euros, dateFr, cleIdentite, cleDossier,
    moisControle, contexteRapport, reintegree, evaluerVente, etatVente, codeControle,
    evaluerVni, requalifierNR, statutEffectifNR, evaluerNR, recuperationOuverte, evaluerSuspension, etatSuspension,
    versions, actions, alertesAdmin, texteDuRegistre, MANUELS_TAISENT, ACTION_CAUSE,
  };
}));
