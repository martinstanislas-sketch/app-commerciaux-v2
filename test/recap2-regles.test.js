'use strict';
// ============================================================================
//  REGISTRE UNIQUE DES REMARQUES RECAP 2 (public/recap2-regles.js) :
//  chaque règle, chaque condition de disparition, l'ordre de priorité,
//  les combinaisons décision manuelle + contentieux + suspension + finance +
//  déménagement, la requalification à la lecture, le référentiel.
//  DONNÉES ENTIÈREMENT FICTIVES.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../public/recap2-regles.js');
const Ref = require('../public/recap2-referentiel.js');
const RR = require('../public/recap2-remarques.js');
const M = require('../public/recap2-metrics.js');
const Auto = require('../lib/recap2Automatique.js');
const NrC = require('../lib/recap2NrControles.js');

const VUES = new Set();       // toutes les règles effectivement produites par ces scénarios
const ids = (items) => { items.forEach((x) => VUES.add(x.regle)); return items.map((x) => x.regle); };
const CTX = { controle: true, contentieux: new Set() };
const A = G.ALERTES_MOTEUR;

// ── VENTES ─────────────────────────────────────────────────────────────────
const vente = (o = {}, op = {}, auto = {}) => Object.assign({ client: 'Jeanne Test', date: '05/08/2026', retrouve: true, idClient: '70001',
  automatique: Object.assign({ alertes: [], regles: [], details: {}, idDeciplus: '70001' }, auto),
  operationnel: Object.assign({ prelevement: 'ok', reservation: 'ok', resilie: 'ko', sources: { prelevement: 'auto', reservation: 'auto', resilie: 'auto' } }, op) }, o);
const ev = (l, ctx = CTX) => ids(G.evaluerVente(l, ctx));

test('vente conforme : aucune remarque ; mois non contrôlé : rien', () => {
  assert.deepEqual(ev(vente()), []);
  assert.deepEqual(ev(vente({}, { reservation: 'ko' }), { controle: false }), []);
});
test('VENTE-CONTENTIEUX : contentieux confirmé (contrôle de la vente OU des non-reconduits) → aucune remarque, jamais « conserver »', () => {
  const l = vente({}, { resilie: 'ok', prelevement: 'ko' }, { alertes: [A.INTERROMPU], details: { contentieux: true } });
  assert.deepEqual(ev(l), []);
  assert.deepEqual(ev(vente({}, { resilie: 'ok', prelevement: 'ko' }, { alertes: [A.INTERROMPU] }), { controle: true, contentieux: new Set(['70001']) }), []);
  assert.equal(G.etatVente(l, CTX), 'contentieux');
});
test('impayé sans contentieux (R9 ou R15) → « régulariser son prélèvement » seulement, code SEPA en alerte admin', () => {
  assert.deepEqual(ev(vente({}, { resilie: 'ok', prelevement: 'ko', reservation: 'ko' }, { alertes: [A.INTERROMPU], regles: ['R15'] })), ['VENTE-REGULARISER']);
  const r9 = G.evaluerVente(vente({}, { reservation: 'ko' }, { alertes: [A.REJET], details: { codesRejet: [{ code: 'MD01', date: '2026-09-15' }] } }), CTX);
  assert.deepEqual(ids(r9), ['VENTE-REGULARISER', 'VENTE-CODE-REJET', 'VENTE-SEANCES']);
  assert.equal(r9[1].texte, 'Rejet de prélèvement — MD01 : mandat absent ou invalide (le 15/09/2026).');
  assert.equal(r9[1].nature, 'alerte');
  assert.equal(r9[0].texte, 'Contacte le client pour régulariser son prélèvement.');
});
test('VENTE-ANNULEE (R21) : aucune remarque tant qu’elle reste annulée', () => {
  assert.deepEqual(ev(vente({ annulee: true, retrouve: false }, { prelevement: 'ko', reservation: 'ko', resilie: 'ok' }, { alertes: [A.ANNULEE_JAMAIS_CREE] })), []);
  assert.deepEqual(ev(vente({ annulee: true }, { prelevement: 'ko', reservation: 'ko', resilie: 'ok' })), [], 'annulée arrêtée : aucune relance');
});
test('VENTE-CLOTURE (R22) : visible même annulée et même cases forcées', () => {
  const l = vente({ annulee: true }, { prelevement: 'ok', reservation: 'ok', resilie: 'ko', sources: { prelevement: 'force', reservation: 'force', resilie: 'force' } }, { alertes: [A.A_CLOTURER] });
  const it = G.evaluerVente(l, CTX);
  assert.deepEqual(ids(it), ['VENTE-CLOTURE']);
  assert.equal(G.enAction(it[0].texte), 'À faire : Clôture dans Deciplus le contrat encore actif du client.');
});
test('VENTE-RETRACTATION (R14) : aucune remarque ; un forçage manuel « Résilié » n’est pas une rétractation', () => {
  const l = vente({}, { prelevement: 'ko', reservation: 'ko', resilie: 'ok' }, { regles: ['R14'] });
  assert.deepEqual(ev(l), []); assert.equal(G.etatVente(l, CTX), 'retractation');
  assert.deepEqual(ev(vente({}, { prelevement: 'ko', reservation: 'ko', resilie: 'ok', sources: { resilie: 'force' } }, { regles: ['R14'] })), ['VENTE-RESILIATION']);
});
test('VENTE-INTROUVABLE / JAMAIS-CREE / NON-CONCLU : exclusives ; code technique jamais à la place de la remarque', () => {
  assert.deepEqual(ev(vente({ retrouve: false }, { reservation: 'ko' })), ['VENTE-INTROUVABLE']);
  assert.deepEqual(ev(vente({ retrouve: false, verification: { verifiee: true } })), [], 'disparaît : validée manuellement');
  assert.deepEqual(ev(vente({ retrouve: false, valideManuellement: true })), [], 'disparaît : rapprochement confirmé');
  assert.deepEqual(ev(vente({}, { prelevement: 'ko', reservation: 'ko' }, { alertes: [A.JAMAIS_CREE] })), ['VENTE-JAMAIS-CREE']);
  const nc = G.evaluerVente(vente({}, { prelevement: 'a_verifier' }, { raison: 'dossier Deciplus illisible : fiche illisible (HTTP 500)' }), CTX);
  assert.deepEqual(ids(nc), ['VENTE-NON-CONCLU', 'VENTE-CODE-CONTROLE']);
  assert.equal(G.enAction(nc[0].texte), 'À faire : Vérifie la vente dans Deciplus : le contrôle automatique n’a pas pu conclure.');
  assert.equal(nc[1].texte, 'Contrôle incomplet — CI01 : fiche Deciplus non exploitable.');
  const sans = G.evaluerVente(Object.assign(vente(), { automatique: null, operationnel: null }), CTX);
  assert.equal(sans[1].texte, 'Contrôle incomplet — CI10 : vente non contrôlée.');
  assert.deepEqual(ev(vente({}, { prelevement: 'ok', sources: { prelevement: 'force' } }, { raison: 'x' })), [], 'disparaît : forçage manuel du champ incertain');
});
test('VENTE-RIB : « Récupère le RIB », jamais « lance le prélèvement » en double', () => {
  assert.deepEqual(ev(vente({}, { prelevement: 'ko', reservation: 'ko' }, { alertes: [A.RIB] })), ['VENTE-RIB', 'VENTE-SEANCES']);
  assert.equal(G.PAR_ID['VENTE-RIB'].texte, 'Récupère le RIB du client, puis lance le prélèvement.');
});
test('récupération : séances, prélèvement, résiliation ; disparition par forçage ou réservation', () => {
  assert.deepEqual(ev(vente({}, { reservation: 'ko' })), ['VENTE-SEANCES']);
  assert.deepEqual(ev(vente({}, { reservation: 'ok', sources: { reservation: 'force' } })), []);
  assert.deepEqual(ev(vente({}, { prelevement: 'ko' })), ['VENTE-PRELEVEMENT']);
  assert.deepEqual(ev(vente({}, { prelevement: 'ko', reservation: 'ko', resilie: 'ok' })), ['VENTE-RESILIATION'], 'résilié : ni séances ni prélèvement');
});
test('RÉINTÉGRATION : requalification immédiate à la lecture (R21 → R20, R22 → à relancer), sans relire Deciplus', () => {
  const r21 = { prelevement: 'ko', reservation: 'ko', resilie: 'ok', alertes: [A.ANNULEE_JAMAIS_CREE], regles: ['R21'] };
  const a = Auto.requalifier(r21, { annulee: false });
  assert.deepEqual([a.resilie, a.alertes], ['ko', [A.JAMAIS_CREE]]);
  assert.deepEqual(ev(vente({}, { prelevement: 'ko', reservation: 'ko', resilie: 'ko' }, a)), ['VENTE-JAMAIS-CREE']);
  assert.equal(G.enAction(G.PAR_ID['VENTE-JAMAIS-CREE'].texte), 'À faire : Vérifie et complète la vente dans Deciplus.');
  const r22 = Auto.requalifier({ prelevement: 'ko', reservation: 'ko', resilie: 'ok', alertes: [A.A_CLOTURER], regles: ['R22'] }, { annulee: false });
  assert.deepEqual([r22.prelevement, r22.resilie, r22.alertes], ['a_verifier', 'a_verifier', []]);
  assert.equal(G.evaluerVente(vente({}, { prelevement: 'a_verifier', resilie: 'a_verifier' }, r22), CTX)[1].texte, 'Contrôle incomplet — CI11 : vente réintégrée : contrôle à relancer.');
  const r20 = Auto.requalifier({ prelevement: 'ko', reservation: 'ko', resilie: 'ko', alertes: [A.JAMAIS_CREE], regles: ['R20'] }, { annulee: true });
  assert.deepEqual([r20.resilie, r20.alertes], ['ok', [A.ANNULEE_JAMAIS_CREE]], 'annulée depuis le contrôle : R21');
  assert.equal(Auto.requalifier({ alertes: [A.REJET] }, { annulee: false }).requalification, undefined, 'sinon inchangé');
});
test('Recap2Automatique.appliquer : les pastilles suivent la requalification', () => {
  const rapport = { mois: '2026-08', studios: { Lille: { clientsRetrouves: { liste: [{ client: 'Jeanne Test', date: '05/08/2026', annulee: false }] } } } };
  const idx = new Map([['Lille|nom:JEANNE TEST|05/08/2026', { prelevement: 'ko', reservation: 'ko', resilie: 'ok', alertes: [A.ANNULEE_JAMAIS_CREE], regles: ['R21'], controleLe: '2026-09-17T08:44' }]]);
  const l = Auto.appliquer(rapport, idx).studios.Lille.clientsRetrouves.liste[0];
  assert.deepEqual([l.operationnel.resilie, l.operationnel.alertes], ['ko', [A.JAMAIS_CREE]]);
  assert.match(l.automatique.requalification, /réintégrée/);
});

// ── VNI ────────────────────────────────────────────────────────────────────
test('VNI : identité jamais masquée par une décision ; disparaît seulement à la validation ; Flex sans preuve', () => {
  const f = (statutAuto, decision) => ({ flex: { statut: statutAuto, statutAuto, decision: decision || null } });
  assert.deepEqual(ids(G.evaluerVni(f('À vérifier', { valeur: 'non_interesse' }))), ['VNI-IDENTITE']);
  assert.deepEqual(ids(G.evaluerVni(Object.assign(f('À vérifier'), { identiteVni: { validee: true } }))), ['VNI-FLEX']);
  assert.deepEqual(ids(G.evaluerVni(f('Flex à proposer'))), ['VNI-FLEX']);
  assert.deepEqual(ids(G.evaluerVni(f('Flex proposé'))), [], 'preuve : aucune action');
  assert.deepEqual(ids(G.evaluerVni(f('Flex à proposer', { valeur: 'propose' }))), []);
});

// ── NON-RECONDUITS ─────────────────────────────────────────────────────────
const nr = (a = {}, statut = '') => ({ client: 'MARTIN Paul', idClient: '80001', suivi: statut ? { statut } : undefined,
  analyse: Object.assign({ statut: 'a_traiter', contentieux: false, irrecuperable: false, cause: { code: 'prix', libelle: 'Prix', certitude: 'Confirmée', indice: '' },
    suspension: null, finance: null, remarques: [], motifExclusion: '', controleLe: '2026-09-18T18:56' }, a) });
const ecart = { contratVendor: 2340, contratDeciplus: 2340, contratReference: 2340, facture: 900, encaisse: 900, journalNet: 900, net: 900, ecart: 1440, anomalie: '', justification: '' };
const susp = (o = {}) => Object.assign({ debut: '2026-08-03', fin: '', repriseDate: '', indeterminee: false, active: true, terminee: false, raisonRenseignee: false, montantSuspendu: 0, prolongation: null }, o);
const en = (l) => ids(G.evaluerNR(l));
const MANUELS = ['', 'a_traiter', 'a_creuser', 'sous_controle', 'resilie', 'suspendu', 'toujours_actif', 'reconduit_autrement', 'recupere', 'depart_confirme'];

test('NR-CONTENTIEUX : aucune remarque sous AUCUNE décision ; statut Résilié imposé ; « dont contentieux » = donnée Deciplus', () => {
  const a = { statut: 'resilie', contentieux: true, cause: { code: 'impaye', libelle: 'Contentieux', certitude: 'Confirmée' }, finance: ecart, suspension: susp() };
  MANUELS.forEach((m) => { assert.deepEqual(en(nr(a, m)), [], m); assert.equal(G.statutEffectifNR(nr(a, m)), 'resilie', m); });
  const k = M.indicateursNR([nr(a, 'recupere'), nr(a, 'sous_controle'), nr({})]);
  assert.equal(k.contentieux, 2, 'compté d’après Deciplus, quel que soit le statut manuel');
});
test('NR-RETRACTATION : départ confirmé, cause « Rétractation confirmée », aucune récupération (ancien et nouveau format)', () => {
  const ancien = nr({ cause: { code: 'autre', libelle: 'Rétractation', certitude: 'Confirmée', indice: 'rétractation dans les 14 jours (Deciplus)' } });
  assert.deepEqual(en(ancien), []);
  assert.equal(G.statutEffectifNR(ancien), 'resilie');
  assert.equal(G.requalifierNR(ancien.analyse).cause.libelle, 'Rétractation confirmée');
  const nouveau = nr({ statut: 'resilie', retractation: true, cause: { code: 'retractation', libelle: 'Rétractation confirmée' }, finance: Object.assign({}, ecart, { justification: 'la rétractation dans le délai légal' }) });
  assert.deepEqual(en(nouveau), ['FIN-JUSTIFIE'], 'l’écart justifié reste une information administrateur');
  assert.equal(G.statutEffectifNR(Object.assign(nouveau, { suivi: { statut: 'recupere' } })), 'resilie');
});
test('NR-IRRECUPERABLE : plus d’action de récupération, anomalie financière conservée', () => {
  assert.deepEqual(en(nr({ statut: 'resilie', irrecuperable: true, cause: { code: 'demenagement', libelle: 'Déménagement', certitude: 'Confirmée' }, finance: ecart })), ['FIN-ECART']);
});
test('niveau 3 (identité, transfert, impayé, finance) : jamais masqué par une décision manuelle', () => {
  MANUELS.forEach((m) => {
    // « Départ confirmé » sans motif irrécupérable demande en plus le motif (niveau 6).
    const motif = m === 'depart_confirme' ? ['NR-DEPART-MOTIF'] : [];
    assert.deepEqual(en(nr({ statut: 'a_creuser', cause: null }, m)), ['NR-IDENTITE'].concat(motif), m);
    assert.deepEqual(en(nr({ statut: 'a_creuser', cause: { code: 'transfert', libelle: 'Transfert', certitude: 'Probable' } }, m)), ['NR-TRANSFERT'].concat(motif), m);
    assert.ok(en(nr({ cause: { code: 'impaye', libelle: 'Impayé', certitude: 'Probable' }, finance: ecart }, m)).join() .startsWith('NR-IMPAYE,FIN-ECART'), m);
  });
  assert.equal(G.PAR_ID['NR-TRANSFERT'].texte, 'Vérifie dans Deciplus si le client a bien été transféré vers un autre studio.');
});
test('FINANCE : écart fiable → action exacte ; estimé, contradictoire ou incomplet → alerte « Contrôle financier impossible »', () => {
  const it = G.evaluerNR(nr({ finance: ecart }));
  assert.equal(G.enAction(it[0].texte), 'À faire : Le client devait régler 2 340 €, mais 900 € ont réellement été encaissés, soit un écart de 1 440 €. Vérifie et régularise cet écart.');
  const alerte = (f) => { const it = G.evaluerNR(nr({ finance: f })); ids(it); return G.alertesAdmin(it)[0]; };
  assert.equal(alerte(Object.assign({}, ecart, { anomalie: 'divergence', contratVendor: 2500 })).regle, 'FIN-IMPOSSIBLE');
  assert.equal(alerte(Object.assign({}, ecart, { ecart: null })).texte, 'Contrôle financier impossible : données incomplètes.');
  assert.match(alerte(Object.assign({}, ecart, { vendorEstime: true, contratDeciplus: null })).texte, /montant Vendor estimé/);
  assert.deepEqual(en(nr({ finance: Object.assign({}, ecart, { vendorEstime: true }) })).slice(0, 1), ['FIN-ECART'], 'estimation confirmée par Deciplus : fiable');
  assert.deepEqual(en(nr({ finance: Object.assign({}, ecart, { ecart: 4 }) })), ['NR-PRIX'], 'écart < 5 € neutralisé');
  assert.ok(G.alertesAdmin(G.evaluerNR(nr({ finance: ecart }))).length === 0, 'aucune alerte quand tout concorde');
});
test('SUSPENSIONS : raison + période exigées ; « Suspendu » ou « Sous contrôle » ne masquent pas ; terminée ≠ active', () => {
  ['', 'suspendu', 'sous_controle', 'resilie', 'toujours_actif'].forEach((m) => {
    assert.deepEqual(en(nr({ statut: 'suspendu', cause: null, suspension: susp() }, m)), ['SUSP-DOC'], 'sans raison ' + m);
    assert.deepEqual(en(nr({ statut: 'suspendu', cause: null, suspension: susp({ raisonRenseignee: true }) }, m)), ['SUSP-DOC'], 'sans période ' + m);
  });
  assert.deepEqual(en(nr({ statut: 'suspendu', cause: null, suspension: susp({ raisonRenseignee: true, fin: '2026-11-30', repriseDate: '2026-11-30' }) })), []);
  assert.deepEqual(en(nr({ statut: 'suspendu', cause: null, suspension: susp({ raisonRenseignee: true, indeterminee: true }) })), []);
  const prol = G.evaluerNR(nr({ statut: 'suspendu', cause: null, suspension: susp({ raisonRenseignee: true, repriseDate: '2026-11-30', montantSuspendu: 90, prolongation: { verifiable: true, manqueJours: 112 } }) }));
  assert.deepEqual(ids(prol), ['SUSP-PROLONGATION']);
  assert.equal(prol[0].texte, 'Prolonge le contrat de 112 jours dans Deciplus pour compenser la suspension (90 € d’échéances suspendues à replanifier).');
  assert.deepEqual(en(nr({ statut: 'suspendu', cause: null, suspension: susp({ raisonRenseignee: true, repriseDate: '2026-11-30', prolongation: { verifiable: false, motif: 'contrat reconductible' } }) })), ['SUSP-PROLONGATION-IMPOSSIBLE']);
  const fini = nr({ statut: 'a_traiter', cause: { code: 'autre', libelle: 'Suspension terminée sans reprise', certitude: 'Confirmée' }, suspension: susp({ fin: '2026-08-31', terminee: true, active: false, raisonRenseignee: true }) });
  assert.deepEqual(en(fini), ['SUSP-TERMINEE']);
  assert.deepEqual(en(Object.assign(fini, { suivi: { statut: 'sous_controle' } })), [], 'récupération : tue par une décision d’organisation');
  assert.equal(G.etatSuspension(susp({ terminee: true, fin: '2026-08-31' }), '2026-09-19').code, 'terminee');
  assert.equal(G.etatSuspension(susp({ fin: '2026-09-10' }), '2026-09-19').code, 'terminee_depuis');
  assert.equal(G.etatSuspension(susp({ fin: '2026-11-30' }), '2026-09-19').libelle, 'Suspendu temporairement');
  const hors = { client: 'PETIT Jean', idClient: '80010', analyse: { statut: 'suspendu', suspension: susp() } };
  assert.deepEqual(ids(G.evaluerSuspension(hors)), ['SUSP-DOC']);
});
test('CAUSES → action ; temps, motivation et assiduité ensemble ; prix = Challenge Flex', () => {
  const cas = { prix: 'NR-PRIX', temps: 'NR-FREINS', motivation: 'NR-FREINS', frequentation: 'NR-FREINS', resultats: 'NR-RESULTATS', planning: 'NR-PLANNING',
    sante: 'NR-SANTE', insatisfaction: 'NR-INSATISFACTION', coach: 'NR-COACH', fin_challenge: 'NR-FIN-CHALLENGE', inconnu: 'NR-INCONNU', demenagement: 'NR-DEMENAGEMENT' };
  Object.entries(cas).forEach(([code, regle]) => assert.deepEqual(en(nr({ cause: { code, libelle: code, certitude: code === 'inconnu' ? 'À confirmer' : 'Confirmée' } })), [regle], code));
  assert.deepEqual(en(nr({ cause: { code: 'prix', libelle: 'Prix', certitude: 'À confirmer' } })), ['NR-A-CONFIRMER']);
  assert.equal(G.PAR_ID['NR-FREINS'].texte, 'Contacte le client, identifie ses freins et propose-lui un nouveau challenge adapté, par exemple le Protocole 42.');
  assert.equal(G.PAR_ID['NR-PRIX'].texte, 'Contacte le client et propose-lui le Challenge Flex à 4 séances par mois.');
});
test('DÉMÉNAGEMENT : survit à « Résilié » et à « Départ confirmé » (+ motif demandé) ; tu par Sous contrôle / Récupéré…', () => {
  const dem = { cause: { code: 'demenagement', libelle: 'Déménagement', certitude: 'Confirmée' }, recuperationOuverte: true };
  assert.deepEqual(en(nr(dem, 'resilie')), ['NR-DEMENAGEMENT']);
  assert.deepEqual(en(nr(dem, 'depart_confirme')), ['NR-DEMENAGEMENT', 'NR-DEPART-MOTIF']);
  ['sous_controle', 'suspendu', 'toujours_actif', 'reconduit_autrement', 'recupere'].forEach((m) => assert.deepEqual(en(nr(dem, m)), [], m));
  assert.equal(G.recuperationOuverte(nr(dem, 'resilie')), true);
  assert.deepEqual(en(nr({ cause: { code: 'prix', libelle: 'Prix', certitude: 'Confirmée' } }, 'resilie')), [], 'autre cause : « Résilié » tait la récupération');
  assert.deepEqual(en(nr({ cause: { code: 'prix', libelle: 'Prix', certitude: 'Confirmée' } }, 'depart_confirme')), ['NR-PRIX', 'NR-DEPART-MOTIF']);
});
test('COMBINAISONS décision + contentieux + suspension + finance + déménagement : ordre de priorité exact', () => {
  const tout = { statut: 'a_traiter', cause: { code: 'demenagement', libelle: 'Déménagement', certitude: 'Confirmée' }, finance: ecart,
    suspension: susp({ prolongation: { verifiable: true, manqueJours: 20 } }) };
  assert.deepEqual(en(nr(tout)), ['FIN-ECART', 'SUSP-PROLONGATION', 'SUSP-DOC', 'NR-DEMENAGEMENT'], 'niveaux 3, 3, 4 puis 5');
  assert.deepEqual(en(nr(tout, 'sous_controle')), ['FIN-ECART', 'SUSP-PROLONGATION', 'SUSP-DOC']);
  assert.deepEqual(en(nr(tout, 'resilie')), ['FIN-ECART', 'SUSP-PROLONGATION', 'SUSP-DOC', 'NR-DEMENAGEMENT']);
  assert.deepEqual(en(nr(Object.assign({}, tout, { contentieux: true }), 'resilie')), [], 'contentieux : rien');
  assert.deepEqual(en(nr(Object.assign({}, tout, { irrecuperable: true, statut: 'resilie' }), 'depart_confirme')), ['FIN-ECART', 'SUSP-PROLONGATION', 'SUSP-DOC'], 'refus définitif : ni récupération ni motif demandé');
  const niveaux = G.evaluerNR(nr(tout)).map((x) => x.niveau);
  assert.deepEqual(niveaux, [...niveaux].sort((a, b) => a - b), 'toujours dans l’ordre de priorité');
});
test('INDICATEURS : montant à vérifier non masqué par une décision ; cohorte requalifiée (rétractation exclue)', () => {
  const k = M.indicateursNR([nr({ finance: ecart }, 'sous_controle'), nr({ finance: Object.assign({}, ecart, { anomalie: 'divergence' }) }, 'resilie')]);
  assert.deepEqual([k.montantAVerifier, k.nbEcarts, k.divergences], [1440, 1, 1]);
  const rapport = { studios: { Lille: { nonReconduction: { liste: [{ client: 'MARTIN Paul', idClient: '80001' }] } } } };
  const retract = { statut: 'a_traiter', cause: { code: 'autre', libelle: 'Rétractation', certitude: 'Confirmée', indice: 'rétractation dans les 14 jours (Deciplus)' } };
  const idx = { nr: new Map([['Lille|id:80001', { analyse: retract, controleLe: '2026-09-18T18:56' }]]), susp: [],
    cohorte: new Map([['Lille|id:80001', { eligible: true, motifExclusion: '', premierStatut: 'a_traiter' }]]), dernier: null };
  const l = NrC.appliquer(rapport, idx).studios.Lille.nonReconduction.liste[0];
  assert.deepEqual([l.cohorte.eligible, l.cohorte.motifExclusion, l.cohorte.requalifie], [false, 'rétractation', true]);
});

// ── COPIES ─────────────────────────────────────────────────────────────────
test('COPIES : « À faire : » exactement une fois, alertes techniques jamais copiées, contexte de chaque dossier', () => {
  const rapport = { mois: '2026-08', studios: { Lille: {
    clientsRetrouves: { liste: [
      vente({ commercialId: 'c1', prestation: 'Challenge 12 mois' }, { prelevement: 'a_verifier' }, { raison: 'dossier Deciplus illisible' }),
      vente({ commercialId: 'c1', date: '20/08/2026', prestation: 'Flex' }, { reservation: 'ko' }, { alertes: [A.REJET], details: { codesRejet: [{ code: 'AM04', date: '2026-09-17' }] } }),
    ] },
    nonReconduction: { liste: [Object.assign(nr({ finance: Object.assign({}, ecart, { anomalie: 'divergence' }) }), { commercialId: 'c1' })] },
    vni: { liste: [] } } } };
  const t = RR.remarquesClub(rapport, 'Lille').texte;
  assert.ok(t.includes('Jeanne Test — vente du 05/08/2026 · Challenge 12 mois\nÀ faire : Vérifie la vente dans Deciplus : le contrôle automatique n’a pas pu conclure.'));
  assert.ok(t.includes('Jeanne Test — vente du 20/08/2026 · Flex\nÀ faire : Contacte le client pour régulariser son prélèvement.\nÀ faire : Contacte le client pour planifier ses prochaines séances.'));
  assert.ok(!/Contrôle incomplet|Rejet de prélèvement|Contrôle financier impossible/.test(t), 'aucune alerte technique');
  assert.equal((t.match(/À faire : À faire/g) || []).length, 0);
  t.split('\n').filter((x) => /^À faire/.test(x)).forEach((x) => assert.equal(x.indexOf('À faire : ', 1), -1));
});

// ── REGISTRE ET RÉFÉRENTIEL ────────────────────────────────────────────────
test('registre : identifiants uniques, champs complets, cohérence nature ↔ copies ↔ modifiable', () => {
  const vus = new Set();
  G.REGLES.forEach((r) => {
    assert.ok(!vus.has(r.id), 'doublon ' + r.id); vus.add(r.id);
    ['id', 'categorie', 'nature', 'niveau', 'destinataire', 'statut', 'declenchement', 'disparition'].forEach((k) => assert.ok(r[k] !== undefined && r[k] !== '', r.id + '.' + k));
    assert.ok(G.NIVEAUX[r.niveau], r.id + ' niveau');
    if (r.nature === 'action') { assert.ok(r.texte && !/^À faire/.test(r.texte), r.id); assert.ok(r.copieClub && r.copieCommercial && r.modifiable, r.id); }
    else assert.ok(!r.copieClub && !r.copieCommercial && !r.modifiable, r.id + ' : ni copie ni personnalisation');
    (r.masquePar || []).forEach((m) => assert.ok(G.PAR_ID[m] || / /.test(m), r.id + ' masquée par inconnu ' + m));
  });
  assert.throws(() => G.item('INVENTEE'), /non déclarée/);
});
test('COUVERTURE : chaque règle active (action ou alerte) est produite par au moins un scénario de ce fichier', () => {
  const actives = G.REGLES.filter((r) => r.nature !== 'silence').map((r) => r.id);
  assert.deepEqual(actives.filter((id) => !VUES.has(id)), []);
});
test('RÉFÉRENTIEL : généré depuis le registre (même nombre, mêmes textes), filtres catégorie / statut / destinataire / nature', () => {
  const ls = Ref.lignes();
  assert.equal(ls.length, G.REGLES.length);
  assert.equal(ls.find((l) => l.id === 'VENTE-RIB').texte, 'À faire : Récupère le RIB du client, puis lance le prélèvement.');
  assert.ok(Ref.filtrer(ls, { categorie: 'Finance' }).every((l) => l.categorie === 'Finance'));
  assert.ok(Ref.filtrer(ls, { destinataire: G.ADMIN }).every((l) => l.nature === 'alerte'));
  assert.equal(Ref.filtrer(ls, { statut: 'À creuser' }).length, 2);
  assert.ok(Ref.filtrer(ls, { nature: 'silence' }).every((l) => !l.copieClub));
  const h = Ref.html(ls, {});
  assert.ok(h.includes('Référentiel des remarques automatiques') && h.includes('NR-DEPART-MOTIF') && !/<script/i.test(h));
  for (let i = 1; i < ls.length; i++) assert.ok(ls[i - 1].niveau <= ls[i].niveau, 'trié par priorité');
});
test('texteDuRegistre : accepte les phrases du registre, refuse une note brute', () => {
  assert.ok(G.texteDuRegistre('Contacte le client et propose-lui le Challenge Flex à 4 séances par mois.'));
  assert.ok(G.texteDuRegistre('À faire : Le client devait régler 10 €, mais 2 € ont réellement été encaissés, soit un écart de 8 €. Vérifie et régularise cet écart.'));
  assert.ok(!G.texteDuRegistre('Rembourse 50 € au client.'));
});
