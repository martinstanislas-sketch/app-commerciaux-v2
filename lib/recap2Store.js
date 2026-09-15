'use strict';
// ============================================================================
//  RECAP 2 — MAGASIN DE FICHIERS (validation + lecture + écriture atomique).
//
//  RECAP 2 n'a toujours AUCUNE persistance SQL : ses résultats sont produits
//  sur le Mac par crm-automation, puis déposés sur le serveur sous forme d'UN
//  fichier JSON par mois, dans le volume :
//
//      $DB_DIR/recap2/recap2-AAAA-MM.json
//
//  Ce module est le SEUL endroit qui connaît ce chemin et cette forme. Il est
//  volontairement sans dépendance (fs/path + le module de libellés studios),
//  pour être appelé des deux côtés :
//   · côté serveur  (server.js) : valider ce qui arrive, écrire, relire ;
//   · côté Mac (crm-automation/recap2-envoi.js) : valider AVANT d'envoyer, et
//     surtout n'envoyer QUE la forme canonique — jamais un CSV, un cookie ou
//     quoi que ce soit qui traînerait dans l'objet.
//
//  ⚠️ CE JSON CONTIENT DES NOMS DE CLIENTS (le détail nominatif des cartes
//  « non-reconduction » et « complétion » — on les conserve, c'est l'intérêt de
//  l'écran). D'où :
//   · le fichier vit dans le volume, JAMAIS dans public/ : rien n'est servi en
//     statique, la seule porte de sortie est la route admin GET /api/recap2 ;
//   · l'écriture se fait en 0600 ;
//   · la validation refuse tout ce qui n'est pas exactement la forme attendue.
//
//  ⚠️ AUCUNE ÉCRITURE EN BASE. Ni ici, ni ailleurs pour RECAP 2 : les tables
//  retention_* de l'ancien RECAP ne sont pas touchées.
// ============================================================================

const fs = require('fs');
const path = require('path');
const M = require('../public/recap2-metrics.js'); // LABELS : les 6 studios en propre

const MOIS_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// Bornes de bon sens. Elles ne protègent pas d'un attaquant (la clé de dépôt
// s'en charge) mais d'une bêtise : un CSV collé dans le JSON, un journal qui
// enfle, un fichier qui remplirait le volume.
const TAILLE_MAX = 4 * 1024 * 1024;   // 4 Mo : un mois réel pèse ~30 Ko
const TEXTE_MAX = 500;                // aucune chaîne légitime ne dépasse ça
const PROFONDEUR_MAX = 8;
const LISTE_MAX = 20000;              // détail nominatif d'un studio
const JOURNAL_MAX = 2000;

// ─── LES DEUX RÈGLES MÉTIER ─────────────────────────────────────────────────
//  1 (clé absente) : ancienne règle. 2e KPI = « complétion », soit les contrats
//                    signés en M-1 ayant payé en M. Auditer août imposait donc
//                    de demander septembre, et « pas encore prélevé » se lisait
//                    comme « absent du CRM ».
//  2               : règle actuelle. M est le MOIS AUDITÉ ; le 2e KPI devient
//                    « clients retrouvés dans Deciplus », soit les signataires
//                    de M présents dans le journal des VENTES de M.
//  Les deux formes coexistent en lecture — l'historique reste consultable — mais
//  un rapport v1 ne doit JAMAIS s'afficher sous le libellé de la v2.
const VERSION_METIER = 2;
const versionMetier = (r) => (r && Number.isFinite(r.businessVersion) ? r.businessVersion : 1);

const CLES_RACINE = ['businessVersion', 'genere', 'mois', 'm1', 'source', 'studios', 'journal', 'erreurs'];
const CLES_STUDIO = ['studio', 'nonReconduction', 'completion', 'clientsRetrouves', 'avertissements', 'controleBloquant', 'prisesReference'];
// PRISES DE RÉFÉRENCE (Vendor) — facultatif : les rapports d'avant n'en ont pas.
//  { total, affiche, liste } quand la lecture est contrôlée, { echec } sinon.
//  Un identifiant Vendor (Bubble) : « 1676534557603x269706782936696800 ».
const RE_ID_VENDOR = /^\d{10,16}x\d{10,24}$/;
const CLES_REF = ['total', 'affiche', 'liste', 'echec'];
const CLES_REF_LIGNE = ['contactId', 'client', 'date', 'createurId', 'createur', 'statut'];
const CLES_NR = ['base', 'nonReconduits', 'taux', 'tauxPct', 'liste'];
const CLES_COMP = ['contratsSouscrits', 'annulesExclus', 'contratsValides', 'ontPaye',
  'taux', 'tauxPct', 'liste', 'contratsBruts', 'doublonsSignataire'];
// `annulees` / `ventesActives` : la règle actuelle. `annulesExclus` /
// `ventesValides` : les mêmes nombres sous leurs anciens noms, conservés pour
// que les rapports DÉJÀ DÉPOSÉS restent lisibles sans être retouchés.
const CLES_CR = ['ventesSignees', 'annulees', 'annulesExclus', 'ventesActives', 'ventesValides',
  'signataires', 'retrouves', 'taux', 'tauxPct', 'liste',
  'doublonsSignataire', 'retrouvesSansEncaissement', 'paiements'];
// `idClient` : l'Id_client Deciplus de la vente retrouvée. Il n'est là que pour
// ouvrir la fiche membre au clic — aucune autre donnée personnelle n'entre par
// cette porte. Absent (chaîne vide) sur un « à vérifier », qui n'a pas de vente.
// `annulee` / `dateAnnulation` : une vente annulée est DANS la liste — on
// contrôle tout ce qui a été signé — mais hors du taux.
// `candidat*` : une PISTE de quasi-homonyme sur un « à vérifier ». Elle ne
// vaut pas appariement — la ligne reste « à vérifier » et aucun compteur n'en
// tient compte. Elle n'existe que là où elle a un sens : jamais sur un client
// retrouvé (il n'y a plus rien à chercher), jamais sur une annulée (on ne la
// cherche pas).
// `paiement` : la détection de paiement sur 31 jours (crm-automation/lib/paiement.js),
// seulement sur une vente retrouvée. `encaisse` reste, = paiement.etat === 'encaisse',
// pour que les rapports d'avant restent lisibles.
// `ficheId` / `ficheNom` / `ficheSite` : la fiche Deciplus d'un « à vérifier »
// trouvée par la recherche Membres — sans vente saisie. Elle ouvre la fiche,
// elle ne change NI le statut NI le KPI.
const ETATS_PAIEMENT = ['encaisse', 'attendu', 'aucun', 'indetermine'];
const CLES_CR_LIGNE = ['client', 'date', 'prestation', 'commercial', 'annulee', 'dateAnnulation',
  'retrouve', 'site', 'dateVente', 'idClient', 'encaisse', 'commercialId',
  'candidat', 'candidatScore', 'candidatNiveau', 'candidatIndices', 'candidatSite', 'candidatId',
  'paiement', 'ficheId', 'ficheNom', 'ficheSite'];
const DATE_FR = /^\d{2}\/\d{2}\/\d{4}$/;

const estObjet = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const estNombre = (x) => typeof x === 'number' && Number.isFinite(x);
const estTexte = (x) => typeof x === 'string';
const clesEnTrop = (o, permises) => Object.keys(o).filter((k) => !permises.includes(k));

function moisPrecedent(ym) {
  const [a, m] = String(ym).split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 2, 1));
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

// Le taux annoncé doit correspondre au rapport affiché, à l'arrondi près.
// Même règle que public/recap2.js : le serveur refuse d'archiver un chiffre que
// l'écran refuserait d'afficher.
function tauxCoherent(taux, num, den) {
  if (!estNombre(num) || !estNombre(den) || den <= 0) return taux == null;
  if (!estNombre(taux)) return false;
  return Math.abs(taux - num / den) < 0.0005;
}

// ─── Garde-fou générique : que des feuilles simples, courtes, peu profondes ──
// C'est CE contrôle qui rend impossible de faire passer un CSV d'encaissements,
// un cookie de session ou un PDF encodé dans un champ « libre » du rapport.
function verifierFeuilles(valeur, chemin, pb, profondeur) {
  if (profondeur > PROFONDEUR_MAX) { pb.push(chemin + ' : structure trop profonde'); return; }
  if (valeur === null) return;
  if (estTexte(valeur)) {
    if (valeur.length > TEXTE_MAX) pb.push(chemin + ' : texte de ' + valeur.length + ' caractères (max ' + TEXTE_MAX + ')');
    return;
  }
  if (typeof valeur === 'boolean') return;
  if (typeof valeur === 'number') {
    if (!Number.isFinite(valeur)) pb.push(chemin + ' : nombre non fini');
    return;
  }
  if (Array.isArray(valeur)) {
    if (valeur.length > LISTE_MAX) { pb.push(chemin + ' : liste de ' + valeur.length + ' entrées (max ' + LISTE_MAX + ')'); return; }
    valeur.forEach((v, i) => verifierFeuilles(v, chemin + '[' + i + ']', pb, profondeur + 1));
    return;
  }
  if (estObjet(valeur)) {
    Object.keys(valeur).forEach((k) => {
      if (k.length > 120) pb.push(chemin + ' : clé anormalement longue');
      verifierFeuilles(valeur[k], chemin + '.' + k, pb, profondeur + 1);
    });
    return;
  }
  pb.push(chemin + ' : type non sérialisable');
}

// ─── VALIDATION STRICTE ─────────────────────────────────────────────────────
//  Renvoie { ok, problemes[] }. On énumère TOUS les problèmes plutôt que de
//  s'arrêter au premier : quand la collecte change, on veut la liste complète.
function valider(rapport, moisAttendu) {
  const pb = [];
  if (!estObjet(rapport)) return { ok: false, problemes: ['racine : objet JSON attendu'] };

  const trop = clesEnTrop(rapport, CLES_RACINE);
  if (trop.length) pb.push('clés inattendues à la racine : ' + trop.join(', '));

  // Mois / mois précédent : la cohérence interne du fichier, et son accord avec
  // l'URL de dépôt (impossible de déposer juin sous l'étiquette juillet).
  if (!MOIS_RE.test(String(rapport.mois || ''))) pb.push('mois : AAAA-MM attendu');
  else if (moisAttendu && rapport.mois !== moisAttendu) {
    pb.push('mois : le fichier porte ' + rapport.mois + ', le dépôt annonce ' + moisAttendu);
  }
  if (!MOIS_RE.test(String(rapport.m1 || ''))) pb.push('m1 : AAAA-MM attendu');
  else if (MOIS_RE.test(String(rapport.mois || '')) && rapport.m1 !== moisPrecedent(rapport.mois)) {
    pb.push('m1 : ' + rapport.m1 + ' n\'est pas le mois précédant ' + rapport.mois);
  }

  if (!estTexte(rapport.genere) || isNaN(new Date(rapport.genere).getTime())) {
    pb.push('genere : date ISO attendue');
  }

  // Version métier : absente (rapport d'avant le changement de règle) ou un
  // entier connu. On refuse une version FUTURE : mieux vaut un dépôt rejeté
  // qu'un écran qui affiche des chiffres dont il ignore la définition.
  if (rapport.businessVersion !== undefined) {
    if (!estNombre(rapport.businessVersion) || !Number.isInteger(rapport.businessVersion)) {
      pb.push('businessVersion : entier attendu');
    } else if (rapport.businessVersion < 1 || rapport.businessVersion > VERSION_METIER) {
      pb.push('businessVersion : ' + rapport.businessVersion + ' inconnue (maximum géré : ' + VERSION_METIER + ')');
    }
  }

  // Journal et erreurs : des lignes de texte, rien d'autre.
  [['journal', JOURNAL_MAX], ['erreurs', 200]].forEach(([cle, max]) => {
    const v = rapport[cle];
    if (v === undefined) return; // facultatif
    if (!Array.isArray(v)) { pb.push(cle + ' : tableau attendu'); return; }
    if (v.length > max) pb.push(cle + ' : ' + v.length + ' entrées (max ' + max + ')');
    if (!v.every(estTexte)) pb.push(cle + ' : que des chaînes');
  });

  // Source : la traçabilité de la collecte (fichiers, périodes, contrôles).
  // Les clés sont connues ; le contenu est libre mais soumis au garde-fou des
  // feuilles — donc jamais un CSV.
  if (rapport.source !== undefined) {
    if (!estObjet(rapport.source)) pb.push('source : objet attendu');
    else {
      Object.keys(rapport.source).forEach((k) => {
        // `deciplus_AAAA-MM` = journal des encaissements ; `deciplus_ventes_AAAA-MM`
        // = journal des ventes (règle v2). Le second n'existe pas dans l'historique.
        // `paiements` = ce que la détection de paiement a réellement pu lire
        // (mois d'encaissements, couverture en jours).
        if (!/^deciplus_(ventes_)?\d{4}-\d{2}$/.test(k) && k !== 'fitnessBooster' && k !== 'paiements') pb.push('source : clé inattendue « ' + k + ' »');
        else if (!estObjet(rapport.source[k])) pb.push('source.' + k + ' : objet attendu');
      });
    }
  }

  // Studios : les 6 en propre, ni plus ni moins.
  if (!estObjet(rapport.studios)) pb.push('studios : objet attendu');
  else {
    const inconnus = clesEnTrop(rapport.studios, M.LABELS);
    if (inconnus.length) pb.push('studios : studio(s) hors périmètre : ' + inconnus.join(', '));
    const manquants = M.LABELS.filter((s) => !(s in rapport.studios));
    if (manquants.length) pb.push('studios : studio(s) manquant(s) : ' + manquants.join(', '));
    M.LABELS.filter((s) => s in rapport.studios).forEach((s) => validerStudio(rapport.studios[s], s, pb, versionMetier(rapport)));
  }

  verifierFeuilles(rapport, 'racine', pb, 0);
  return { ok: pb.length === 0, problemes: pb };
}

function validerStudio(bloc, label, pb, version) {
  const ici = 'studios.' + label;
  if (!estObjet(bloc)) { pb.push(ici + ' : objet attendu'); return; }
  const trop = clesEnTrop(bloc, CLES_STUDIO);
  if (trop.length) pb.push(ici + ' : clés inattendues : ' + trop.join(', '));
  validerReferences(bloc.prisesReference, ici + '.prisesReference', pb);

  // LES DEUX RÈGLES NE SE MÉLANGENT PAS DANS UN MÊME FICHIER. Un rapport v2 qui
  // porterait encore une « complétion » ferait cohabiter deux définitions du
  // même KPI — exactement ce qu'on veut rendre impossible.
  if (version >= 2 && bloc.completion !== undefined && bloc.completion !== null) {
    pb.push(ici + '.completion : règle v' + version + ' — ce KPI est remplacé par clientsRetrouves');
  }
  if (version < 2 && bloc.clientsRetrouves !== undefined && bloc.clientsRetrouves !== null) {
    pb.push(ici + '.clientsRetrouves : absent de la règle v1 (businessVersion manquante ?)');
  }
  if (bloc.studio !== label) pb.push(ici + '.studio : « ' + bloc.studio +' » ne correspond pas à la clé');
  if (bloc.avertissements !== undefined
    && (!Array.isArray(bloc.avertissements) || !bloc.avertissements.every(estTexte))) {
    pb.push(ici + '.avertissements : tableau de chaînes attendu');
  }
  if (bloc.controleBloquant !== undefined) {
    if (!estObjet(bloc.controleBloquant)) pb.push(ici + '.controleBloquant : objet attendu');
    else if (typeof bloc.controleBloquant.ok !== 'boolean') pb.push(ici + '.controleBloquant.ok : booléen attendu');
  }

  // Non-reconduction : nul (KPI refusé, c'est légitime) ou complet et cohérent.
  const nr = bloc.nonReconduction;
  if (nr !== null && nr !== undefined) {
    const ou = ici + '.nonReconduction';
    if (!estObjet(nr)) pb.push(ou + ' : objet ou null attendu');
    else {
      const t = clesEnTrop(nr, CLES_NR);
      if (t.length) pb.push(ou + ' : clés inattendues : ' + t.join(', '));
      if (!estNombre(nr.base) || nr.base < 0) pb.push(ou + '.base : nombre positif attendu');
      if (!estNombre(nr.nonReconduits) || nr.nonReconduits < 0) pb.push(ou + '.nonReconduits : nombre positif attendu');
      if (estNombre(nr.base) && estNombre(nr.nonReconduits) && nr.nonReconduits > nr.base) {
        pb.push(ou + ' : plus de non-reconduits (' + nr.nonReconduits + ') que de base (' + nr.base + ')');
      }
      if (!tauxCoherent(nr.taux, nr.nonReconduits, nr.base)) {
        pb.push(ou + '.taux : incohérent avec ' + nr.nonReconduits + '/' + nr.base);
      }
      if (nr.tauxPct !== null && nr.tauxPct !== undefined && !estNombre(nr.tauxPct)) pb.push(ou + '.tauxPct : nombre ou null attendu');
      validerListe(nr.liste, ou + '.liste', pb, (e, ou2) => {
        // Le détail nominatif : on le CONSERVE, c'est ce que l'écran ouvre au clic.
        if (!estTexte(e.client) || !e.client.trim()) pb.push(ou2 + '.client : nom attendu');
        if (!estNombre(e.netM1)) pb.push(ou2 + '.netM1 : nombre attendu');
        if (!estNombre(e.netM)) pb.push(ou2 + '.netM : nombre attendu');
        // `idClient` (facultatif : les rapports d'avant n'en ont pas) : l'Id membre
        // Deciplus du client, pour ouvrir SA fiche. Des chiffres, ou vide — rien
        // d'autre : un id bricolé ouvrirait la fiche de quelqu'un d'autre.
        if (e.idClient !== undefined) {
          if (!estTexte(e.idClient)) pb.push(ou2 + '.idClient : texte attendu');
          else if (e.idClient !== '' && !/^[0-9]{1,20}$/.test(e.idClient)) {
            pb.push(ou2 + '.idClient : « ' + e.idClient + ' » n\'est pas un Id_client Deciplus');
          }
        }
        const t2 = clesEnTrop(e, ['client', 'idClient', 'netM1', 'netM']);
        if (t2.length) pb.push(ou2 + ' : clés inattendues : ' + t2.join(', '));
      });
      if (Array.isArray(nr.liste) && estNombre(nr.nonReconduits) && nr.liste.length !== nr.nonReconduits) {
        pb.push(ou + ' : ' + nr.liste.length + ' nom(s) pour ' + nr.nonReconduits + ' non-reconduit(s)');
      }
    }
  }

  // Complétion : même logique.
  const co = bloc.completion;
  if (co !== null && co !== undefined) {
    const ou = ici + '.completion';
    if (!estObjet(co)) pb.push(ou + ' : objet ou null attendu');
    else {
      const t = clesEnTrop(co, CLES_COMP);
      if (t.length) pb.push(ou + ' : clés inattendues : ' + t.join(', '));
      if (!estNombre(co.contratsValides) || co.contratsValides < 0) pb.push(ou + '.contratsValides : nombre positif attendu');
      if (!estNombre(co.ontPaye) || co.ontPaye < 0) pb.push(ou + '.ontPaye : nombre positif attendu');
      if (estNombre(co.contratsValides) && estNombre(co.ontPaye) && co.ontPaye > co.contratsValides) {
        pb.push(ou + ' : plus de payés (' + co.ontPaye + ') que de contrats (' + co.contratsValides + ')');
      }
      if (!tauxCoherent(co.taux, co.ontPaye, co.contratsValides)) {
        pb.push(ou + '.taux : incohérent avec ' + co.ontPaye + '/' + co.contratsValides);
      }
      ['contratsSouscrits', 'annulesExclus', 'tauxPct', 'contratsBruts', 'doublonsSignataire'].forEach((k) => {
        if (co[k] !== null && co[k] !== undefined && !estNombre(co[k])) pb.push(ou + '.' + k + ' : nombre ou null attendu');
      });
      validerListe(co.liste, ou + '.liste', pb, (e, ou2) => {
        if (!estTexte(e.contrat) || !e.contrat.trim()) pb.push(ou2 + '.contrat : nom attendu');
        if (e.date !== undefined && !estTexte(e.date)) pb.push(ou2 + '.date : texte attendu');
        if (typeof e.paye !== 'boolean') pb.push(ou2 + '.paye : booléen attendu');
        const t2 = clesEnTrop(e, ['contrat', 'date', 'paye']);
        if (t2.length) pb.push(ou2 + ' : clés inattendues : ' + t2.join(', '));
      });
      if (Array.isArray(co.liste) && estNombre(co.contratsValides) && co.liste.length !== co.contratsValides) {
        pb.push(ou + ' : ' + co.liste.length + ' nom(s) pour ' + co.contratsValides + ' contrat(s) valide(s)');
      }
    }
  }

  // Clients retrouvés dans Deciplus (règle v2) : même exigence de cohérence.
  const cr = bloc.clientsRetrouves;
  if (cr !== null && cr !== undefined) {
    const ou = ici + '.clientsRetrouves';
    if (!estObjet(cr)) pb.push(ou + ' : objet ou null attendu');
    else {
      const t = clesEnTrop(cr, CLES_CR);
      if (t.length) pb.push(ou + ' : clés inattendues : ' + t.join(', '));
      if (!estNombre(cr.signataires) || cr.signataires < 0) pb.push(ou + '.signataires : nombre positif attendu');
      if (!estNombre(cr.retrouves) || cr.retrouves < 0) pb.push(ou + '.retrouves : nombre positif attendu');
      if (estNombre(cr.signataires) && estNombre(cr.retrouves) && cr.retrouves > cr.signataires) {
        pb.push(ou + ' : plus de retrouvés (' + cr.retrouves + ') que de signataires (' + cr.signataires + ')');
      }
      if (!tauxCoherent(cr.taux, cr.retrouves, cr.signataires)) {
        pb.push(ou + '.taux : incohérent avec ' + cr.retrouves + '/' + cr.signataires);
      }
      // Les signataires sont les ventes valides DÉDUPLIQUÉES : jamais plus
      // nombreux qu'elles. L'écart, lui, est légitime (et signalé en alerte).
      if (estNombre(cr.ventesValides) && estNombre(cr.signataires) && cr.signataires > cr.ventesValides) {
        pb.push(ou + ' : ' + cr.signataires + ' signataires pour ' + cr.ventesValides + ' vente(s) valide(s)');
      }
      ['ventesSignees', 'annulees', 'annulesExclus', 'ventesActives', 'ventesValides', 'tauxPct', 'doublonsSignataire', 'retrouvesSansEncaissement'].forEach((k) => {
        if (cr[k] !== null && cr[k] !== undefined && !estNombre(cr[k])) pb.push(ou + '.' + k + ' : nombre ou null attendu');
      });
      if (cr.paiements !== undefined && cr.paiements !== null) {
        if (!estObjet(cr.paiements)) pb.push(ou + '.paiements : objet attendu');
        else {
          const tp = clesEnTrop(cr.paiements, ETATS_PAIEMENT);
          if (tp.length) pb.push(ou + '.paiements : clés inattendues : ' + tp.join(', '));
          ETATS_PAIEMENT.forEach((k) => {
            if (cr.paiements[k] !== undefined && !(estNombre(cr.paiements[k]) && cr.paiements[k] >= 0)) pb.push(ou + '.paiements.' + k + ' : nombre positif attendu');
          });
        }
      }
      validerListe(cr.liste, ou + '.liste', pb, (e, ou2) => {
        if (!estTexte(e.client) || !e.client.trim()) pb.push(ou2 + '.client : nom attendu');
        if (typeof e.retrouve !== 'boolean') pb.push(ou2 + '.retrouve : booléen attendu');
        if (e.annulee !== undefined && typeof e.annulee !== 'boolean') pb.push(ou2 + '.annulee : booléen attendu');
        if (e.dateAnnulation !== undefined && !estTexte(e.dateAnnulation)) pb.push(ou2 + '.dateAnnulation : texte attendu');
        // Une vente annulée est « ANNULÉ », point. On ne lui cherche aucune
        // trace Deciplus, donc elle ne peut porter ni « retrouvé » ni identifiant.
        if (e.annulee === true && e.retrouve === true) {
          pb.push(ou2 + ' : une vente annulée ne peut pas être marquée « retrouvée »');
        }
        if (e.encaisse !== undefined && typeof e.encaisse !== 'boolean') pb.push(ou2 + '.encaisse : booléen attendu');
        ['date', 'prestation', 'commercial', 'site', 'dateVente'].forEach((k) => {
          if (e[k] !== undefined && !estTexte(e[k])) pb.push(ou2 + '.' + k + ' : texte attendu');
        });
        // L'identifiant Vendor du commercial : bien formé, ou vide (illisible).
        if (e.commercialId !== undefined && (!estTexte(e.commercialId) || (e.commercialId !== '' && !RE_ID_VENDOR.test(e.commercialId)))) {
          pb.push(ou2 + '.commercialId : identifiant Vendor ou vide attendu');
        }
        // L'identifiant doit être une suite de chiffres, ou vide. On refuse tout
        // le reste : un id bricolé ouvrirait la fiche de quelqu'un d'autre.
        if (e.idClient !== undefined) {
          if (!estTexte(e.idClient)) pb.push(ou2 + '.idClient : texte attendu');
          else if (e.idClient !== '' && !/^[0-9]{1,20}$/.test(e.idClient)) {
            pb.push(ou2 + '.idClient : « ' + e.idClient + ' » n\'est pas un Id_client Deciplus');
          } else if (e.idClient !== '' && e.retrouve === false) {
            pb.push(ou2 + ' : un client « à vérifier » ne peut pas porter d\'Id_client');
          }
        }
        // La piste : seulement sur un « à vérifier », et un écart plausible.
        if (e.candidat !== undefined && e.candidat !== '') {
          if (!estTexte(e.candidat)) pb.push(ou2 + '.candidat : texte attendu');
          if (e.retrouve === true || e.annulee === true) {
            pb.push(ou2 + ' : une piste de quasi-homonyme n\'a de sens que sur un « à vérifier »');
          }
          if (!estNombre(e.candidatScore) || e.candidatScore < 0.5 || e.candidatScore > 1) {
            pb.push(ou2 + '.candidatScore : score entre 0,5 et 1 attendu');
          }
          if (['tres_forte', 'forte', 'moyenne'].indexOf(e.candidatNiveau) < 0) {
            pb.push(ou2 + '.candidatNiveau : très forte / forte / moyenne attendu');
          }
          if (e.candidatIndices !== undefined
            && (!Array.isArray(e.candidatIndices) || !e.candidatIndices.every(estTexte))) {
            pb.push(ou2 + '.candidatIndices : tableau de raisons lisibles attendu');
          }
          if (e.candidatId !== undefined && e.candidatId !== '' && !/^[0-9]{1,20}$/.test(String(e.candidatId))) {
            pb.push(ou2 + '.candidatId : « ' + e.candidatId + ' » n\'est pas un Id_client Deciplus');
          }
        }
        ['candidat', 'candidatNiveau', 'candidatSite', 'candidatId'].forEach((k) => {
          if (e[k] !== undefined && !estTexte(e[k])) pb.push(ou2 + '.' + k + ' : texte attendu');
        });
        // Le paiement : seulement sur une vente retrouvée, avec un état connu.
        if (e.paiement !== undefined && e.paiement !== null) {
          const p = e.paiement;
          if (!estObjet(p)) pb.push(ou2 + '.paiement : objet attendu');
          else {
            if (ETATS_PAIEMENT.indexOf(p.etat) < 0) pb.push(ou2 + '.paiement.etat : ' + ETATS_PAIEMENT.join(' / ') + ' attendu');
            if (e.retrouve !== true || e.annulee === true) pb.push(ou2 + ' : un statut de paiement n\'a de sens que sur une vente retrouvée');
            ['premier', 'finFenetre', 'couvertJusquau'].forEach((k) => {
              if (p[k] !== undefined && p[k] !== '' && !(estTexte(p[k]) && DATE_FR.test(p[k]))) pb.push(ou2 + '.paiement.' + k + ' : date JJ/MM/AAAA attendue');
            });
            if (p.etat === 'encaisse' && !p.premier) pb.push(ou2 + '.paiement : date du premier encaissement attendue');
            if (typeof e.encaisse === 'boolean' && e.encaisse !== (p.etat === 'encaisse')) pb.push(ou2 + ' : « encaisse » contredit le statut de paiement');
            const tp = clesEnTrop(p, ['etat', 'premier', 'finFenetre', 'couvertJusquau']);
            if (tp.length) pb.push(ou2 + '.paiement : clés inattendues : ' + tp.join(', '));
          }
        }
        // La fiche trouvée : seulement sur un « à vérifier » sans piste, avec un
        // vrai Id_client — jamais sur un client retrouvé ou une vente annulée.
        if (e.ficheId !== undefined && e.ficheId !== '') {
          if (!/^[0-9]{1,20}$/.test(String(e.ficheId))) pb.push(ou2 + '.ficheId : « ' + e.ficheId + ' » n\'est pas un Id_client Deciplus');
          if (e.retrouve === true || e.annulee === true || (e.candidat && e.candidat !== '')) {
            pb.push(ou2 + ' : une fiche trouvée n\'a de sens que sur un « à vérifier » sans piste de vente');
          }
        }
        ['ficheId', 'ficheNom', 'ficheSite'].forEach((k) => {
          if (e[k] !== undefined && !estTexte(e[k])) pb.push(ou2 + '.' + k + ' : texte attendu');
        });
        const t2 = clesEnTrop(e, CLES_CR_LIGNE);
        if (t2.length) pb.push(ou2 + ' : clés inattendues : ' + t2.join(', '));
      });
      // La liste porte DEUX populations : les signataires actifs (dédupliqués,
      // dénominateur du taux) et les ventes annulées (une ligne par vente).
      // Chacune doit correspondre à son compteur, sinon un nom s'est perdu.
      if (Array.isArray(cr.liste)) {
        const actives = cr.liste.filter((e) => !(e && e.annulee)).length;
        const annulees = cr.liste.length - actives;
        if (estNombre(cr.signataires) && actives !== cr.signataires) {
          pb.push(ou + ' : ' + actives + ' nom(s) actif(s) pour ' + cr.signataires + ' signataire(s)');
        }
        // `annulees` n'existe pas dans les rapports d'avant cette règle : on ne
        // recoupe que s'il est là, sinon on accepte une liste sans annulées.
        if (estNombre(cr.annulees) && annulees !== cr.annulees) {
          pb.push(ou + ' : ' + annulees + ' ligne(s) annulée(s) pour ' + cr.annulees + ' annoncée(s)');
        }
      }
    }
  }
}

// Prises de référence : cohérentes, ou explicitement en échec — jamais entre les deux.
function validerReferences(pr, ou, pb) {
  if (pr === undefined || pr === null) return;
  if (!estObjet(pr)) { pb.push(ou + ' : objet attendu'); return; }
  const t = clesEnTrop(pr, CLES_REF);
  if (t.length) pb.push(ou + ' : clés inattendues : ' + t.join(', '));
  if (pr.echec !== undefined) {
    if (!estTexte(pr.echec) || !pr.echec.trim()) pb.push(ou + '.echec : raison attendue');
    if (pr.total !== undefined || pr.liste !== undefined) pb.push(ou + ' : un échec ne porte ni total ni liste');
    return;
  }
  if (!estNombre(pr.total) || pr.total < 0 || !Number.isInteger(pr.total)) pb.push(ou + '.total : entier positif attendu');
  if (!estNombre(pr.affiche) || pr.affiche !== pr.total) pb.push(ou + '.affiche : doit égaler le total (contrôle Vendor)');
  if (!Array.isArray(pr.liste)) { pb.push(ou + '.liste : tableau attendu'); return; }
  if (estNombre(pr.total) && pr.liste.length !== pr.total) pb.push(ou + ' : ' + pr.liste.length + ' ligne(s) pour un total de ' + pr.total);
  const vus = new Set();
  pr.liste.forEach((e, i) => {
    const ou2 = ou + '.liste[' + i + ']';
    if (!estObjet(e)) { pb.push(ou2 + ' : objet attendu'); return; }
    const t2 = clesEnTrop(e, CLES_REF_LIGNE);
    if (t2.length) pb.push(ou2 + ' : clés inattendues : ' + t2.join(', '));
    if (!estTexte(e.contactId) || !RE_ID_VENDOR.test(e.contactId)) pb.push(ou2 + '.contactId : identifiant Vendor attendu');
    else if (vus.has(e.contactId)) pb.push(ou2 + ' : contact en double');
    else vus.add(e.contactId);
    if (!estTexte(e.createurId) || !RE_ID_VENDOR.test(e.createurId)) pb.push(ou2 + '.createurId : identifiant Vendor attendu');
    if (!estTexte(e.date) || !DATE_FR.test(e.date)) pb.push(ou2 + '.date : JJ/MM/AAAA attendu');
    ['client', 'createur', 'statut'].forEach((k) => { if (!estTexte(e[k])) pb.push(ou2 + '.' + k + ' : texte attendu'); });
  });
}

function validerListe(liste, ou, pb, valideur) {
  if (liste === undefined || liste === null) { pb.push(ou + ' : tableau attendu'); return; }
  if (!Array.isArray(liste)) { pb.push(ou + ' : tableau attendu'); return; }
  if (liste.length > LISTE_MAX) { pb.push(ou + ' : ' + liste.length + ' entrées (max ' + LISTE_MAX + ')'); return; }
  liste.forEach((e, i) => {
    if (!estObjet(e)) { pb.push(ou + '[' + i + '] : objet attendu'); return; }
    valideur(e, ou + '[' + i + ']');
  });
}

// ─── FORME CANONIQUE ────────────────────────────────────────────────────────
//  On ne stocke (et on n'envoie) que les champs connus, reconstruits un à un.
//  Une clé qu'on n'attend pas ne peut donc pas se retrouver sur le serveur,
//  même si la validation venait un jour à s'assouplir.
function nettoyer(rapport) {
  const propre = {};
  CLES_RACINE.forEach((k) => { if (rapport[k] !== undefined) propre[k] = rapport[k]; });
  propre.studios = {};
  M.LABELS.forEach((s) => {
    const b = rapport.studios && rapport.studios[s];
    if (!estObjet(b)) return;
    const n = {};
    CLES_STUDIO.forEach((k) => { if (b[k] !== undefined) n[k] = b[k]; });
    if (estObjet(b.nonReconduction)) {
      n.nonReconduction = {};
      CLES_NR.forEach((k) => { if (b.nonReconduction[k] !== undefined) n.nonReconduction[k] = b.nonReconduction[k]; });
      // L'id ne survit que s'il est plausible ; absent d'un rapport d'avant, il n'est pas inventé.
      n.nonReconduction.liste = (b.nonReconduction.liste || []).map((e) => {
        const o = { client: e.client };
        if (/^[0-9]{1,20}$/.test(String(e.idClient || ''))) o.idClient = String(e.idClient);
        o.netM1 = e.netM1; o.netM = e.netM;
        return o;
      });
    }
    if (estObjet(b.completion)) {
      n.completion = {};
      CLES_COMP.forEach((k) => { if (b.completion[k] !== undefined) n.completion[k] = b.completion[k]; });
      n.completion.liste = (b.completion.liste || []).map((e) => ({ contrat: e.contrat, date: e.date === undefined ? '' : e.date, paye: e.paye }));
    }
    if (estObjet(b.clientsRetrouves)) {
      n.clientsRetrouves = {};
      CLES_CR.forEach((k) => { if (b.clientsRetrouves[k] !== undefined) n.clientsRetrouves[k] = b.clientsRetrouves[k]; });
      // Les champs de piste sont FACULTATIFS : on ne les écrit que là où il y en
      // a une, plutôt que de charger chaque ligne de quatre champs vides.
      const CLES_PISTE = ['candidat', 'candidatScore', 'candidatNiveau', 'candidatIndices', 'candidatSite', 'candidatId',
        'paiement', 'ficheId', 'ficheNom', 'ficheSite'];
      n.clientsRetrouves.liste = (b.clientsRetrouves.liste || []).map((e) => {
        const o = {};
        CLES_CR_LIGNE.filter((k) => CLES_PISTE.indexOf(k) < 0)
          .forEach((k) => { o[k] = e[k] === undefined ? (k === 'retrouve' || k === 'encaisse' ? false : '') : e[k]; });
        // Ceinture et bretelles : un id ne survit au nettoyage que s'il est
        // plausible ET rattaché à une vente réellement retrouvée.
        if (!o.retrouve || o.annulee || !/^[0-9]{1,20}$/.test(String(o.idClient || ''))) o.idClient = '';
        if (o.annulee) o.retrouve = false; // le statut d'une annulée est son annulation
        if (!RE_ID_VENDOR.test(String(o.commercialId || ''))) o.commercialId = '';
        // Une piste n'a de sens que sur un « à vérifier », avec un écart
        // plausible. Partout ailleurs elle disparaît, sans laisser de trace.
        const sc = e.candidatScore;
        if (!o.retrouve && !o.annulee && estTexte(e.candidat) && e.candidat
          && estNombre(sc) && sc >= 0.5 && sc <= 1) {
          o.candidat = e.candidat;
          o.candidatScore = sc;
          o.candidatNiveau = ['tres_forte', 'forte', 'moyenne'].indexOf(e.candidatNiveau) >= 0 ? e.candidatNiveau : 'moyenne';
          o.candidatIndices = Array.isArray(e.candidatIndices)
            ? e.candidatIndices.filter(estTexte).slice(0, 4) : [];
          o.candidatSite = estTexte(e.candidatSite) ? e.candidatSite : '';
          o.candidatId = /^[0-9]{1,20}$/.test(String(e.candidatId || '')) ? String(e.candidatId) : '';
        }
        // Le paiement, reconstruit champ par champ, seulement sur une vente retrouvée.
        const p = e.paiement;
        if (o.retrouve && !o.annulee && estObjet(p) && ETATS_PAIEMENT.indexOf(p.etat) >= 0) {
          const d = (x) => (estTexte(x) && DATE_FR.test(x) ? x : '');
          o.paiement = { etat: p.etat, premier: d(p.premier), finFenetre: d(p.finFenetre), couvertJusquau: d(p.couvertJusquau) };
          o.encaisse = p.etat === 'encaisse';
        }
        // La fiche trouvée, seulement sur un « à vérifier » sans piste, id plausible.
        if (!o.retrouve && !o.annulee && !o.candidat && /^[0-9]{1,20}$/.test(String(e.ficheId || ''))) {
          o.ficheId = String(e.ficheId);
          o.ficheNom = estTexte(e.ficheNom) ? e.ficheNom : '';
          o.ficheSite = estTexte(e.ficheSite) ? e.ficheSite : '';
        }
        return o;
      });
    }
    // Prises de référence, reconstruites champ par champ.
    const pr = b.prisesReference;
    if (estObjet(pr)) {
      if (estTexte(pr.echec)) n.prisesReference = { echec: pr.echec };
      else {
        n.prisesReference = { total: pr.total, affiche: pr.affiche, liste: (pr.liste || []).map((e) => {
          const o = {};
          CLES_REF_LIGNE.forEach((k) => { o[k] = estTexte(e[k]) ? e[k] : ''; });
          return o;
        }) };
      }
    }
    propre.studios[s] = n;
  });
  return propre;
}

// ─── CHEMINS ────────────────────────────────────────────────────────────────
//  DB_DIR est le volume Railway (la base y vit déjà) ; en local, la racine du
//  projet. Ce dossier n'est JAMAIS servi en statique.
function dossier() {
  return path.join(process.env.DB_DIR || path.join(__dirname, '..'), 'recap2');
}

// Un mois -> un chemin, ou null. Le format AAAA-MM interdit déjà tout « ../ » ;
// on vérifie malgré tout que le chemin résolu reste DANS le dossier attendu.
function chemin(mois) {
  if (!MOIS_RE.test(String(mois || ''))) return null;
  const d = path.resolve(dossier());
  const f = path.resolve(d, 'recap2-' + mois + '.json');
  if (path.dirname(f) !== d) return null;
  return f;
}

// ─── ÉCRITURE ATOMIQUE ──────────────────────────────────────────────────────
//  .tmp puis rename() : sur le même système de fichiers, le remplacement est
//  atomique. Un lecteur voit soit l'ancien fichier, soit le nouveau — jamais un
//  JSON coupé en deux. AUCUNE COPIE .bak : le fichier est reproductible (il
//  suffit de relancer la collecte), et une copie de plus, ce sont des noms de
//  clients de plus qui traînent.
function ecrire(mois, rapport) {
  const f = chemin(mois);
  if (!f) throw new Error('mois invalide');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = f + '.tmp-' + process.pid + '-' + Date.now();
  try {
    fs.writeFileSync(tmp, JSON.stringify(rapport, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, f);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) { /* le .tmp n'existait pas */ }
    throw e;
  }
  return f;
}

// ─── LECTURE ────────────────────────────────────────────────────────────────
//  { etat: 'ok' | 'absent' | 'illisible', ... } — jamais d'exception à gérer
//  côté route.
function lire(mois) {
  const f = chemin(mois);
  if (!f) return { etat: 'illisible', raison: 'mois invalide' };
  if (!fs.existsSync(f)) return { etat: 'absent', fichier: f };
  try {
    return { etat: 'ok', fichier: f, rapport: JSON.parse(fs.readFileSync(f, 'utf8')) };
  } catch (e) {
    return { etat: 'illisible', fichier: f, raison: e.message };
  }
}

module.exports = {
  MOIS_RE, TAILLE_MAX, LABELS: M.LABELS, VERSION_METIER, versionMetier,
  moisPrecedent, tauxCoherent, valider, nettoyer,
  dossier, chemin, ecrire, lire,
};
