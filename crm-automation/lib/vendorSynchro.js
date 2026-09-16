'use strict';
// ============================================================================
//  VENDOR — FORCER LA SYNCHRONISATION CRM D'UNE FICHE DE CONTACT.
//
//  ⚠️⚠️ SEUL ENDROIT DU PROJET QUI ÉCRIT DANS UN CRM. Tout le reste de la
//  collecte et de RECAP 2 est en lecture seule. On clique ici deux boutons de
//  la fiche Vendor — « Synchronisation CRM ⚠️ » puis « Forcer la
//  synchronisation » — ce qui crée ou relie la fiche Deciplus du contact.
//  Conséquence : ce module n'est JAMAIS appelé par recap2-collecte.js. Il ne
//  tourne que via recap2-synchro-vendor.js, lancé à la main.
//
//  POURQUOI : un VNI dont la fiche Vendor n'a pas d'Id Deciplus est
//  « introuvable dans Deciplus » — on ne peut ni ouvrir sa fiche, ni suivre sa
//  transformation par identifiant. Dans la quasi-totalité des cas, c'est une
//  synchronisation Vendor -> Deciplus qui a échoué, et que la fiche signale.
//
//  RÈGLES (fixées par Stan le 2026-09-16) :
//   · au plus TROIS tentatives par personne, jamais de boucle infinie ;
//   · on s'arrête dès la coche verte « Synchronisation CRM ✅ » ;
//   · après la coche verte, on RELIT l'Id Deciplus de la fiche : lui seul dit
//     si la personne existe enfin dans Deciplus ;
//   · trois tentatives sans coche verte = anomalie à vérifier à la main ;
//   · tout est journalisé : personnes traitées, tentatives, anomalies.
//
//  Ce fichier-ci est PUR (aucune navigation) : lecture d'un état depuis le
//  texte de la fiche, et agrégation du bilan. La navigation vit dans
//  recap2-synchro-vendor.js, pour que ces règles soient testables sans CRM.
// ============================================================================

const MAX_TENTATIVES = 3;

// L'état de synchronisation lu dans le TEXTE de la fiche.
//   'ok'            la coche verte est là ;
//   'avertissement' le triangle est là (synchronisation à forcer) ;
//   'inconnu'       la fiche ne parle pas de synchronisation (on ne touche à rien).
function etatSynchro(texteFiche) {
  const t = String(texteFiche == null ? '' : texteFiche).replace(/\s+/g, ' ');
  if (!/Synchronisation CRM/i.test(t)) return 'inconnu';
  const apres = t.slice(t.search(/Synchronisation CRM/i)).slice(0, 60);
  if (/✅|✔|Synchronisé/i.test(apres)) return 'ok';
  if (/⚠|!|Erreur|Échec/i.test(apres)) return 'avertissement';
  return 'inconnu';
}

// Une personne est à traiter si son VNI n'a AUCUN Id Deciplus. On ne touche
// jamais à une fiche déjà reliée.
function aSynchroniser(vni) {
  return (vni || []).filter((l) => !/^[0-9]{1,20}$/.test(String(l.idClient || '')) && String(l.contactId || '').trim());
}

// Bilan pour le rapport et pour le terminal. `resultats` : une entrée par
// personne { studio, contactId, client, tentatives, etatFinal, idClientApres }.
function bilan(resultats) {
  const r = resultats || [];
  const reussies = r.filter((x) => x.etatFinal === 'ok');
  return {
    traitees: r.length,
    synchronisationsForcees: r.reduce((n, x) => n + (x.tentatives || 0), 0),
    reussies: reussies.length,
    reliees: reussies.filter((x) => /^[0-9]{1,20}$/.test(String(x.idClientApres || ''))).length,
    // Coche verte obtenue mais toujours aucun Id Deciplus : la personne n'existe
    // vraiment pas dans Deciplus — ce n'est plus un défaut de synchronisation.
    synchroSansFiche: reussies.filter((x) => !/^[0-9]{1,20}$/.test(String(x.idClientApres || ''))).map((x) => x.contactId),
    anomalies: r.filter((x) => x.etatFinal !== 'ok').map((x) => ({
      studio: x.studio, contactId: x.contactId, client: x.client, tentatives: x.tentatives, etat: x.etatFinal, motif: x.motif || '',
    })),
    personnes: r.map((x) => ({ studio: x.studio, contactId: x.contactId, client: x.client, tentatives: x.tentatives, etat: x.etatFinal, idClient: x.idClientApres || '' })),
  };
}

module.exports = { MAX_TENTATIVES, etatSynchro, aSynchroniser, bilan };
