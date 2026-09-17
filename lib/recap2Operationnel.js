'use strict';
// ============================================================================
//  RECAP 2 — CONTRÔLE OPÉRATIONNEL AUTOMATIQUE D'UNE VENTE :
//  PRÉLÈVEMENT · RÉSERVATION · RÉSILIÉ.
//
//  Module PUR (aucune I/O). Entrée : la ligne de vente du rapport + le dossier
//  Deciplus déjà lu (crm-automation/lib/deciplusDossier.js). Sortie : trois
//  verdicts 'ok' | 'ko' | 'a_verifier', les alertes métier, les règles appliquées
//  et le contrat retenu.
//
//  Il applique la bibliothèque de règles validée par Stan (R1 → R23, septembre
//  2026). PRINCIPE NON NÉGOCIABLE : un cas que ces règles ne couvrent pas
//  EXACTEMENT sort « à vérifier », avec la raison — jamais une supposition.
//  Aucun nom de client n'est utilisé pour décider : le dossier est celui de
//  l'identifiant Deciplus fiable (Recap2Metrics.identifiantDeciplus).
//
//  N'influence AUCUN KPI : le résultat est une information par vente.
// ============================================================================

const OK = 'ok', KO = 'ko', AV = 'a_verifier';

const ALERTES = {
  REJET: 'Prélèvement à régulariser — rejet / impayé',                       // R9
  RIB: 'RIB / mandat manquant — prélèvement non opérationnel',                // R12
  INTERROMPU: 'Prélèvement interrompu — impayés / contentieux',               // R15
  JAMAIS_CREE: 'À régulariser — contrat jamais créé dans Deciplus',           // R20
  ANNULEE_JAMAIS_CREE: 'Vente annulée — contrat jamais créé dans Deciplus',   // R21
  A_CLOTURER: 'Contrat Deciplus encore actif — à clôturer',                   // R22
};

// ── R1 / R11 / R16 : correspondance prestation Vendor ↔ produit Deciplus ────
//  Neutralisés : casse, accents, espaces, CREUSE/CREUSES, suffixe HDF/IDF.
//  Variantes explicitement validées : « Transformation 12 mois » = « Challenge
//  12 mois » (R11) ; « Pack 4 coaching / mois » = « 4 coaching / mois » (R16).
function normProduit(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\bcreuses\b/g, 'creuse').replace(/\s+(hdf|idf)\s*$/, '').replace(/[^a-z0-9]/g, '');
}
const VARIANTES = { transformation12mois: 'challenge12mois', pack4coachingmois: '4coachingmois' };
function memeProduit(prestationVendor, produitDeciplus) {
  const v = normProduit(prestationVendor), d = normProduit(produitDeciplus);
  if (!v || !d) return false;
  return v === d || VARIANTES[v] === d;
}

const jour = (s) => {
  const t = String(s || '');
  let m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(t); if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t); if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return NaN;
};
const JOUR_MS = 86400000;
const FENETRE_AVANT = 30, FENETRE_APRES = 60; // jours autour de la date de vente Vendor
const ETATS_ARRETES = ['TERMINATED', 'CANCELED', 'EXPIRED'];
const ETATS_ECHEANCE = { E: 'encaisse', P: 'envoye', T: 'a_faire', S: 'suspendu', I: 'rejete' };

const reel = (c) => (c.echeances || []).some((e) => e.statut === 'E' || e.statut === 'P');
const futures = (c, auj) => (c.echeances || []).filter((e) => e.statut === 'T' && jour(e.date) >= auj);
const rejets = (c) => (c.echeances || []).filter((e) => e.statut === 'I' || e.rejet || e.motifRejet);
const vide = (c) => !(c.echeances || []).length && !(Number(c.paye) > 0);

// ── R8 / R10 / R13 : contrat annulé = saisie administrative à ignorer ? ──────
function ignorable(c, tous) {
  if (c.etat !== 'CANCELED' || !vide(c)) return null;
  const cree = (c.historique || []).find((h) => h.type === 'CREATED');
  const annule = (c.historique || []).find((h) => h.type === 'CANCELED');
  if (cree && annule && jour(annule.date) === jour(cree.date)
    && (Date.parse(annule.date) - Date.parse(cree.date)) <= 5 * 60000) return 'R8';
  if (annule && /err|correct|mauvais|implant|doublon/i.test(annule.annotation || '')) return 'R10';
  const remplacant = (tous || []).some((o) => o !== c && !ETATS_ARRETES.includes(o.etat) && normProduit(o.produit) === normProduit(c.produit)
    && jour(o.vendu) >= jour(c.vendu) && jour(o.vendu) - jour(c.vendu) <= 3 * JOUR_MS);
  return remplacant ? 'R13' : null;
}

// ── LE VERDICT ──────────────────────────────────────────────────────────────
//  vente   : ligne du rapport { prestation, date (Vendor), annulee }
//  dossier : { ok, erreur?, contrats[], cartes[], mandat {rib, rum}, reservationsFutures,
//              codesInconnus? } — voir deciplusDossier.js
//  aujourdHui : 'AAAA-MM-JJ'
function evaluerVente(vente, dossier, { aujourdHui } = {}) {
  const r = { prelevement: AV, reservation: AV, resilie: AV, alertes: [], regles: [], contrat: null, raison: '' };
  const aVerifier = (raison) => Object.assign(r, { prelevement: AV, resilie: AV, raison });
  const v = vente || {};
  if (!dossier || dossier.ok !== true) return aVerifier('dossier Deciplus illisible' + (dossier && dossier.erreur ? ' : ' + dossier.erreur : ''));
  const auj = jour(aujourdHui);
  if (!Number.isFinite(auj)) throw new Error('aujourdHui AAAA-MM-JJ requis');

  // Réservation (R6) : indépendante du contrat.
  if (Number.isInteger(dossier.reservationsFutures)) {
    r.reservation = dossier.reservationsFutures > 0 ? OK : KO; r.regles.push('R6');
  }

  const tous = dossier.contrats || [];
  const ignores = new Set();
  tous.forEach((c) => { const q = ignorable(c, tous); if (q) { ignores.add(c); r.regles.push(q); } });
  const actifs = tous.filter((c) => !ignores.has(c));
  if ((tous.concat(dossier.cartes || [])).some((c) => (c.echeances || []).some((e) => !ETATS_ECHEANCE[e.statut]))) {
    return aVerifier('code d\'échéance Deciplus inconnu');
  }

  // Aucun contrat Deciplus réellement créé (R20 / R21).
  const aucunContrat = !actifs.length && !(dossier.cartes || []).some((c) => !ETATS_ARRETES.includes(c.etat));
  if (aucunContrat && !(dossier.ventesDeciplus > 0)) {
    r.prelevement = KO; r.reservation = r.reservation === OK ? AV : KO;
    if (r.reservation === AV) return aVerifier('aucun contrat Deciplus mais réservation future');
    if (v.annulee) { r.resilie = OK; r.alertes.push(ALERTES.ANNULEE_JAMAIS_CREE); r.regles.push('R21'); }
    else { r.resilie = KO; r.alertes.push(ALERTES.JAMAIS_CREE); r.regles.push('R20'); }
    return r;
  }

  // Contrat de référence (R1 / R11 / R16 / R5) : même produit, autour de la date de vente.
  const dv = jour(v.date);
  const candidats = actifs.filter((c) => memeProduit(v.prestation, c.produit)
    && jour(c.vendu) >= dv - FENETRE_AVANT * JOUR_MS && jour(c.vendu) <= dv + FENETRE_APRES * JOUR_MS)
    .sort((a, b) => Math.abs(jour(a.vendu) - dv) - Math.abs(jour(b.vendu) - dv));
  if (!candidats.length) return aVerifier('aucun contrat Deciplus correspondant à la prestation Vendor autour de la date de vente');
  if (candidats.length > 1 && Math.abs(jour(candidats[0].vendu) - dv) === Math.abs(jour(candidats[1].vendu) - dv)
    && reel(candidats[0]) && reel(candidats[1])) return aVerifier('plusieurs contrats plausibles réellement prélevés');
  const ref = candidats[0];
  r.contrat = { numero: ref.numero, produit: ref.produit, etat: ref.etat };
  r.regles.push(normProduit(v.prestation) === normProduit(ref.produit) ? 'R1' : (VARIANTES[normProduit(v.prestation)] ? (normProduit(v.prestation).startsWith('pack') ? 'R16' : 'R11') : 'R1'));

  // Continuité (R2 / R5) : contrat arrêté ou résiliation programmée + remplaçant actif prélevé.
  const arrete = ETATS_ARRETES.includes(ref.etat) || !!ref.resiliation;
  const remplacant = arrete ? actifs.find((o) => o !== ref && !ETATS_ARRETES.includes(o.etat)
    && jour(o.vendu) >= jour(ref.vendu) && (futures(o, auj).length || reel(o))) : null;
  const courant = remplacant || ref;
  if (remplacant) { r.regles.push('R2'); r.contrat.remplacant = remplacant.numero; }

  if (arrete && !remplacant) {
    const raisons = (ref.historique || []).map((h) => h.raison || '').join(' ');
    if (futures(ref, auj).length) return aVerifier('résiliation programmée sans contrat de remplacement');
    r.prelevement = KO; r.resilie = OK;
    if (/RETRACTATION/.test(raisons)) r.regles.push('R14');
    else if (/UNPAID/.test(raisons)) { r.regles.push('R15'); r.alertes.push(ALERTES.INTERROMPU); }
    else if (ETATS_ARRETES.includes(ref.etat)) r.regles.push('arrêt explicite sans remplaçant');
    else return aVerifier('contrat arrêté sans motif reconnu');
    return r;
  }

  // Contrat en cours (ou remplaçant) : prélèvement (R3 / R4 / R9 / R12 / R22).
  const fut = futures(courant, auj);
  if (rejets(courant).length) r.alertes.push(ALERTES.REJET);
  if (fut.length) {
    const sansMoyen = !(dossier.mandat && (dossier.mandat.rib || dossier.mandat.rum)) && !reel(courant);
    if (sansMoyen) { r.prelevement = KO; r.alertes.push(ALERTES.RIB); r.regles.push('R12'); }
    else { r.prelevement = OK; r.regles.push(rejets(courant).length ? 'R9' : 'R3'); }
    r.resilie = KO;
  } else if ((courant.echeances || []).some((e) => e.statut === 'P')) {
    r.prelevement = OK; r.resilie = KO; r.regles.push('R3');
  } else if (Number(courant.paye) > 0 && Number(courant.restantDu) === 0) {
    const reduit = Number(courant.valeurInitiale) > 0 && Number(courant.valeur) < 0.5 * Number(courant.valeurInitiale);
    if (!reduit) { r.prelevement = OK; r.resilie = KO; r.regles.push('R3 paiement intégral'); }
    else if (v.annulee && r.reservation === KO) {
      r.prelevement = KO; r.resilie = OK; r.alertes.push(ALERTES.A_CLOTURER); r.regles.push('R22');
    } else return aVerifier('contrat actif réduit à un petit montant, sans échéance future');
  } else return aVerifier('contrat actif sans échéancier ni paiement');
  if (v.annulee) r.regles.push('R19');
  return r;
}

// ── PRIORITÉ AUX CORRECTIONS MANUELLES DE RECAP 2 ───────────────────────────
//  `controle` : la case posée à la main ({ prelevement, reservation } booléens,
//  présente = touchée par un humain) ; `resiliation` : { resilie } posé à la main.
//  Une valeur manuelle l'emporte TOUJOURS, et le résultat dit sa source.
//  `forcages` : { prelevement|reservation|resilie: 'ok'|'ko' } — le FORÇAGE à 3
//  états (Automatique / Forcé ✅ / Forcé ❌). Absent = automatique. Il l'emporte
//  sur tout, dans les deux sens (source 'force').
function fusionnerManuel(auto, { controle, resiliation, forcages } = {}) {
  const f = Object.assign({}, auto, { sources: { prelevement: 'auto', reservation: 'auto', resilie: 'auto' } });
  if (controle && typeof controle.prelevement === 'boolean') { f.prelevement = controle.prelevement ? OK : KO; f.sources.prelevement = 'manuel'; }
  if (controle && typeof controle.reservation === 'boolean') { f.reservation = controle.reservation ? OK : KO; f.sources.reservation = 'manuel'; }
  if (resiliation && typeof resiliation.resilie === 'boolean') { f.resilie = resiliation.resilie ? OK : KO; f.sources.resilie = 'manuel'; }
  ['prelevement', 'reservation', 'resilie'].forEach((k) => {
    const v = forcages && forcages[k];
    if (v === OK || v === KO) { f[k] = v; f.sources[k] = 'force'; }
  });
  return f;
}

module.exports = { OK, KO, AV, ALERTES, normProduit, memeProduit, ignorable, evaluerVente, fusionnerManuel };
