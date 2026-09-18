'use strict';
// ============================================================================
//  MOTEUR D'ANALYSE DES NON-RECONDUITS — cas du cahier des charges (section 15)
//  et ajustements du 18/09 (Toujours actif, carte épuisée, Vendor ≠ Deciplus).
//  DONNÉES ENTIÈREMENT FICTIVES.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../lib/recap2NrAnalyse.js');
const C = require('../public/recap2-conseils.js');
const T = C.TEXTES_NR;

const MOIS = '2026-08';
const AUJ = '2026-09-18';
const ligne = { client: 'DUPONT Marie', idClient: '90001', netM1: '180.00', netM: '0.00' };
// Un contrat de 12 mois encaissé en juillet (M-1) et arrêté fin juillet.
const ech = (date, statut, montant = 45) => ({ date, statut, montant });
function contrat(o = {}) {
  return Object.assign({ id: 1, produit: 'CHALLENGE 12 MOIS HDF', etat: 'TERMINATED', debut: '2026-03-02', fin: '2027-03-01',
    resiliation: '2026-07-31', valeurInitiale: 2340, valeur: 900, paye: 900, restantDu: 0, impaye: 0, zoneId: '6',
    suspensionTotaleJours: 0, suspensions: [], historique: [{ date: '2026-07-31', type: 'TERMINATED', raison: '' }, { date: '2026-03-02', type: 'CREATED', raison: '' }],
    echeances: [ech('2026-07-06', 'E'), ech('2026-07-13', 'E'), ech('2026-07-20', 'E'), ech('2026-07-27', 'E')] }, o);
}
function dossier(o = {}) {
  return Object.assign({ ok: true, categorie: 'Clients', notes: { compta: '', accueil: '', admin: '' }, contrats: [contrat()], cartes: [], mandat: { rib: true, rum: true }, reservationsFutures: 0 }, o);
}
const notes = (admin, compta = '', accueil = '') => ({ admin, compta, accueil });
const an = (d, extra = {}) => A.analyser(Object.assign({ ligne, mois: MOIS, aujourdHui: AUJ, dossier: d }, extra));

// ── Contentieux ─────────────────────────────────────────────────────────────
test('contentieux confirmé par la catégorie Deciplus : Résilié, aucune remarque, aucune finance', () => {
  const r = an(dossier({ categorie: 'Contentieux', notes: notes('déménage à Lyon, pas de RIB') }));
  assert.equal(r.statut, 'resilie'); assert.equal(r.contentieux, true);
  assert.deepEqual(r.remarques, []); assert.equal(r.finance, null); assert.equal(r.suspension, null);
});
test('contentieux confirmé par une note (« CTX pour 1 200 € », « transmis au contentieux »)', () => {
  ['L. le 07/08/6 CTX POUR 1200€.', 'Dossier transmis au contentieux le 02/08', 'passé en contentieux']
    .forEach((n) => assert.equal(an(dossier({ notes: notes(n) })).contentieux, true, n));
});
test('simple risque de contentieux : l’analyse normale continue', () => {
  ['à transmettre au CTX si pas de régularisation', 'risque de contentieux', 'envisager le contentieux', 'devrait passer en contentieux']
    .forEach((n) => { const r = an(dossier({ notes: notes(n) })); assert.equal(r.contentieux, false, n); assert.equal(r.statut, 'a_traiter', n); });
});
test('un motif d’arrêt « impayé » seul ne vaut pas contentieux', () => {
  const r = an(dossier({ contrats: [contrat({ historique: [{ date: '2026-07-31', type: 'TERMINATED', raison: 'UNPAID' }] })] }));
  assert.equal(r.contentieux, false); assert.equal(r.cause.code, 'impaye'); assert.ok(r.remarques.includes(T.IMPAYE));
});
test('priorité du contentieux sur TOUTES les autres règles (suspension, nouveau contrat, finance, cause)', () => {
  const d = dossier({ categorie: 'Contentieux', notes: notes('suspension pour blessure, trop cher, doublon'),
    contrats: [contrat({ etat: 'SUSPENDED', suspensions: [{ debut: '2026-08-01', fin: '', motif: 'DISEASE' }] }), contrat({ id: 2, etat: 'ACTIVE', debut: '2026-08-20', historique: [], echeances: [ech('2026-09-25', 'T')] })] });
  const r = an(d); assert.equal(r.statut, 'resilie'); assert.deepEqual(r.remarques, []);
});

// ── Vraie non-reconduction ? ────────────────────────────────────────────────
test('TOUJOURS ACTIF : le contrat de référence continue avec des échéances à venir, aucune action', () => {
  const c = contrat({ etat: 'ACTIVE', resiliation: '', historique: [], echeances: [ech('2026-07-06', 'E'), ech('2026-09-21', 'T'), ech('2026-09-28', 'T')] });
  const r = an(dossier({ contrats: [c] }));
  assert.equal(r.statut, 'toujours_actif'); assert.deepEqual(r.remarques, []); assert.match(r.indication, /toujours actif/);
});
test('nouveau contrat retrouvé : Reconduit autrement', () => {
  const r = an(dossier({ contrats: [contrat(), contrat({ id: 2, produit: 'CHALLENGE 7 MOIS HDF', etat: 'ACTIVE', debut: '2026-08-25', resiliation: '', historique: [], echeances: [ech('2026-09-21', 'T')] })] }));
  assert.equal(r.statut, 'reconduit_autrement'); assert.deepEqual(r.remarques, []); assert.match(r.indication, /nouveau contrat/);
});
test('reconduction sous une autre formule (changement de produit)', () => {
  const r = an(dossier({ contrats: [contrat({ historique: [{ date: '2026-07-31', type: 'TERMINATED', raison: 'PRODUCT_CHANGE' }] }),
    contrat({ id: 2, produit: 'Challenge Flex', etat: 'ACTIVE', debut: '2026-08-01', resiliation: '', historique: [], echeances: [ech('2026-09-21', 'T')] })] }));
  assert.equal(r.statut, 'reconduit_autrement'); assert.match(r.indication, /changement de formule/);
});
test('transfert vers un autre studio (contrat actif sur une autre zone)', () => {
  const r = an(dossier({ contrats: [contrat(), contrat({ id: 2, etat: 'ACTIVE', zoneId: '9', debut: '2026-08-10', resiliation: '', historique: [], echeances: [ech('2026-09-21', 'T')] })] }));
  assert.equal(r.statut, 'reconduit_autrement'); assert.match(r.indication, /transfert/);
});
test('carte utilisable = reconduction ; carte active mais ÉPUISÉE ou expirée = pas de faux positif', () => {
  const k = { produit: '10 COACHING IDF', etat: 'ACTIVE', debut: '2026-08-02', fin: '2027-02-01', creditRestant: 4, creditInitial: 10 };
  assert.equal(an(dossier({ cartes: [k] })).statut, 'reconduit_autrement', 'achetée depuis M-1 : nouvelle prestation');
  assert.equal(an(dossier({ cartes: [Object.assign({}, k, { debut: '2026-04-02' })] })).statut, 'toujours_actif', 'plus ancienne : la même prestation continue');
  assert.equal(an(dossier({ cartes: [Object.assign({}, k, { creditRestant: 0 })] })).statut, 'a_traiter', 'épuisée');
  assert.equal(an(dossier({ cartes: [Object.assign({}, k, { fin: '2026-09-01' })] })).statut, 'a_traiter', 'expirée');
  assert.equal(an(dossier({ cartes: [Object.assign({}, k, { produit: 'Pack de suivi' })] })).statut, 'a_traiter', 'pack de démarrage');
});
test('erreur de rapprochement (doublon / autre fiche) : À creuser + vérification d’identité', () => {
  const r = an(dossier({ notes: notes('paie sur la fiche de son conjoint') }));
  assert.equal(r.statut, 'a_creuser'); assert.deepEqual(r.remarques, [T.IDENTITE]);
});
test('identité incertaine (aucun identifiant, dossier illisible) : À creuser', () => {
  assert.equal(A.analyser({ ligne: { client: 'X Y', idClient: '' }, mois: MOIS, aujourdHui: AUJ, dossier: dossier() }).statut, 'a_creuser');
  assert.deepEqual(an({ ok: false, erreur: 'fiche illisible' }).remarques, [T.IDENTITE]);
});

// ── Suspensions ─────────────────────────────────────────────────────────────
const cSusp = (o = {}) => contrat(Object.assign({ etat: 'SUSPENDED', resiliation: '', historique: [], suspensions: [{ debut: '2026-08-03', fin: '2026-11-30', motif: 'DISEASE' }],
  suspensionTotaleJours: 119, fin: '2027-06-28', echeances: [ech('2026-07-27', 'E'), ech('2026-08-03', 'S'), ech('2026-08-10', 'S'), ech('2026-12-07', 'T')] }, o));
test('suspension correctement documentée : Suspendu temporairement, aucune remarque', () => {
  const r = an(dossier({ contrats: [cSusp()], notes: notes('', 'suspension suite à une opération du genou, reprise le 30/11') }));
  assert.equal(r.statut, 'suspendu'); assert.deepEqual(r.remarques, []); assert.equal(r.suspension.raisonRenseignee, true);
});
test('suspension sans motif (le code Deciplus seul ne suffit pas)', () => {
  const r = an(dossier({ contrats: [cSusp()], notes: notes('client en suspension') }));
  assert.deepEqual(r.remarques, [T.SUSP_RAISON]);
});
test('suspension sans date de reprise (ni dates structurées, ni note)', () => {
  const r = an(dossier({ contrats: [cSusp({ suspensions: [{ debut: '2026-08-03', fin: '', motif: '' }] })], notes: notes('', 'suspension car voyage professionnel') }));
  assert.deepEqual(r.remarques, [T.SUSP_REPRISE]);
});
test('suspension « durée indéterminée » renseignée : aucune remarque de reprise', () => {
  const r = an(dossier({ contrats: [cSusp({ suspensions: [{ debut: '2026-08-03', fin: '', motif: '' }] })], notes: notes('', 'suspension pour grossesse, durée indéterminée') }));
  assert.deepEqual(r.remarques, []);
});
test('suspension terminée sans reprise ni nouveau contrat', () => {
  const r = an(dossier({ contrats: [cSusp({ suspensions: [{ debut: '2026-06-01', fin: '2026-08-31', motif: '' }], echeances: [ech('2026-06-01', 'S')] })], notes: notes('suspension car blessure') }));
  assert.equal(r.statut, 'a_traiter'); assert.deepEqual(r.remarques, [T.SUSP_FINIE]);
});
test('prolongation absente après suspension : durée manquante et montant à replanifier', () => {
  const r = an(dossier({ contrats: [cSusp({ fin: '2027-03-01' })], notes: notes('', 'suspension suite à opération, reprise le 30/11') }));
  assert.equal(r.statut, 'suspendu');
  assert.match(r.remarques[0], /^Prolonge le contrat de \d+ jours dans Deciplus.*90 € d’échéances suspendues à replanifier/);
});
test('les échéances suspendues ne sont pas des impayés (pas d’alerte financière)', () => {
  const r = an(dossier({ contrats: [cSusp()], notes: notes('', 'suspension suite à opération, reprise le 30/11') }));
  assert.equal(r.finance, null);
});
test('échéances S d’un contrat ARRÊTÉ ≠ suspension', () => {
  const r = an(dossier({ contrats: [contrat({ echeances: [ech('2026-07-27', 'E'), ech('2026-08-03', 'S')] })] }));
  assert.equal(r.suspension, null); assert.equal(r.statut, 'a_traiter');
});

// ── Causes et actions ───────────────────────────────────────────────────────
const cas = [
  ['prix', 'résilie car trop cher pour son budget', T.PRIX],
  ['demenagement', 'arrêt car déménagement à Bordeaux', T.DEMENAGEMENT],
  ['temps', 'stop : manque de temps avec son travail', T.TEMPS],
  ['motivation', 'arrête car plus de motivation', T.MOTIVATION],
  ['resultats', 'résilie car pas de résultat', T.RESULTATS],
  ['planning', 'arrêt car horaires incompatibles avec son planning', T.PLANNING],
  ['sante', 'arrête suite à une blessure', T.SANTE],
  ['insatisfaction', 'résilie car mécontent du suivi', T.INSATISFACTION],
  ['coach', 'arrête car problème avec son coach', T.COACH],
  ['impaye', 'rejet de prélèvement, changement de RIB', T.IMPAYE],
];
cas.forEach(([code, note, action]) => test('cause « ' + code + ' » : action adaptée', () => {
  const r = an(dossier({ notes: notes('', note) }));
  assert.equal(r.cause.code, code); assert.equal(r.remarques[r.remarques.length - 1], action);
  assert.ok(!/genou|opér|une blessure/i.test(r.indication), 'aucun détail médical de la note dans l’indication');
}));
test('fin de Challenge sans nouvelle formule (structure Deciplus)', () => {
  const r = an(dossier({ contrats: [contrat({ etat: 'EXPIRED', fin: '2026-07-31', resiliation: '', historique: [{ date: '2026-07-31', type: 'EXPIRED' }] })] }));
  assert.equal(r.cause.code, 'fin_challenge'); assert.deepEqual(r.remarques, [T.FIN_CHALLENGE]);
});
test('motif inconnu : action de qualification', () => {
  const r = an(dossier()); assert.equal(r.cause.code, 'inconnu');
  assert.equal(r.remarques[r.remarques.length - 1], T.INCONNU);
});
test('motif ambigu (plusieurs causes dans la même note) : À confirmer, action de vérification', () => {
  const r = an(dossier({ notes: notes('', 'arrête : trop cher et plus le temps') }));
  assert.equal(r.cause.certitude, 'À confirmer'); assert.equal(r.remarques[r.remarques.length - 1], T.A_CONFIRMER);
});
test('la note la plus récente l’emporte', () => {
  const r = an(dossier({ notes: notes('', '02/03 : trop cher au départ\n15/07 : arrête car déménagement') }));
  assert.equal(r.cause.code, 'demenagement');
});
test('départ irrécupérable : cause visible, aucune fausse tâche', () => {
  ['refus catégorique de toute proposition', 'client décédé', 'exclusion pour comportement']
    .forEach((n) => { const r = an(dossier({ notes: notes(n) })); assert.equal(r.statut, 'resilie', n); assert.deepEqual(r.remarques, [], n); });
});

// ── Finance ─────────────────────────────────────────────────────────────────
const vendorOk = (total) => ({ fiable: true, total });
const journalOk = (net, remb = 0) => ({ couvert: true, net, remboursements: remb });
test('différence financière non justifiée : X, Y, Z et part facturée', () => {
  const r = an(dossier(), { vendor: vendorOk(2340), journal: journalOk(900) });
  assert.equal(r.remarques[0], 'Vérifie la situation financière du client. Le contrat signé prévoyait 2 340 €, mais 900 € ont réellement été réglés, soit un écart de 1 440 €. La facturation Deciplus ne couvre que 900 €.');
  assert.equal(r.finance.valide, false, 'jamais présenté comme validé (avoirs non lisibles)');
});
test('différence financière justifiée (rétractation, geste commercial) : remarque de vérification du motif', () => {
  const r1 = an(dossier({ contrats: [contrat({ historique: [{ date: '2026-07-31', type: 'TERMINATED', raison: 'RETRACTATION' }] })] }), { vendor: vendorOk(2340), journal: journalOk(900) });
  assert.match(r1.remarques[0], /^Vérifie que l’écart de 1 440 € est bien justifié par la rétractation/);
  const r2 = an(dossier({ notes: notes('geste commercial accordé par le gérant') }), { vendor: vendorOk(2340), journal: journalOk(900) });
  assert.match(r2.remarques[0], /justifié par un geste commercial/);
});
test('Vendor et Deciplus divergent : anomalie à vérifier, aucun choix silencieux', () => {
  const r = an(dossier(), { vendor: vendorOk(2500), journal: journalOk(900) });
  assert.equal(r.finance.anomalie, 'divergence'); assert.match(r.remarques[0], /Vendor prévoit 2 500 €, Deciplus 2 340 €/);
});
test('facturé ≠ encaissé : encaissé recoupé avec le journal, sinon anomalie', () => {
  const r = an(dossier(), { vendor: vendorOk(2340), journal: journalOk(700) });
  assert.equal(r.finance.anomalie, 'encaisse_discordant'); assert.match(r.remarques[0], /Deciplus indique 900 € encaissés, le journal 700 €/);
});
test('remboursements lus dans le journal, avoirs non lisibles : limite affichée', () => {
  const r = an(dossier(), { vendor: vendorOk(2340), journal: journalOk(900, 45) });
  assert.equal(r.finance.remboursements, 45); assert.equal(r.finance.avoirs, null);
  assert.ok(r.finance.limites.some((x) => /avoirs non lisibles/.test(x)));
});
test('écart strictement inférieur à 5 € neutralisé ; fin normale d’engagement : aucun contrôle', () => {
  const r = an(dossier({ contrats: [contrat({ valeurInitiale: 904 })] }), { vendor: vendorOk(904), journal: journalOk(900) });
  assert.ok(!r.remarques.some((x) => /situation financière/.test(x)));
  const r2 = an(dossier({ contrats: [contrat({ fin: '2026-08-01' })] }), { vendor: vendorOk(2340), journal: journalOk(900) });
  assert.equal(r2.finance, null);
});
test('pack de démarrage séparé : jamais contrôlé financièrement', () => {
  assert.equal(A.finance(contrat({ produit: 'Pack de suivi' }), { ph: [] }), null);
});
test('Vendor non retrouvé : contractuel Deciplus, limite dite', () => {
  const r = an(dossier(), { vendor: null, journal: journalOk(900) });
  assert.equal(r.finance.contratReference, 2340); assert.ok(r.finance.limites.some((x) => /Vendor/.test(x)));
});

// ── Priorités et remarques ──────────────────────────────────────────────────
test('ordre : finance puis action, sans doublon, jamais plus de deux remarques', () => {
  const r = an(dossier({ notes: notes('', 'arrêt car trop cher') }), { vendor: vendorOk(2340), journal: journalOk(900) });
  assert.equal(r.remarques.length, 2); assert.match(r.remarques[0], /situation financière/); assert.equal(r.remarques[1], T.PRIX);
  assert.equal(new Set(r.remarques).size, r.remarques.length);
});
test('la remarque disparaît quand la situation est corrigée (nouveau contrat au contrôle suivant)', () => {
  const avant = an(dossier());
  const apres = an(dossier({ contrats: [contrat(), contrat({ id: 2, etat: 'ACTIVE', debut: '2026-09-01', resiliation: '', historique: [], echeances: [ech('2026-09-21', 'T')] })] }));
  assert.ok(avant.remarques.length > 0); assert.deepEqual(apres.remarques, []);
});
test('la décision manuelle fait taire les remarques (sauf À traiter / À creuser)', () => {
  const l = { analyse: { remarques: [T.PRIX] }, suivi: { statut: 'sous_controle' } };
  assert.deepEqual(C.conseilsNonReconduit(l), []);
  assert.deepEqual(C.conseilsNonReconduit(Object.assign({}, l, { suivi: { statut: 'a_traiter' } })), [T.PRIX]);
  assert.deepEqual(C.conseilsNonReconduit({}), [], 'mois non contrôlé : rien');
});
test('aucune donnée brute : l’indication ne recopie jamais la note', () => {
  const r = an(dossier({ notes: notes('', 'arrêt car trop cher, tel 06 11 22 33 44, rue des Lilas') }));
  assert.ok(!/06 11|Lilas/.test(JSON.stringify(r)));
});

// ── Cohorte ─────────────────────────────────────────────────────────────────
test('éligibilité : À traiter éligible ; contentieux, irrécupérable, actif… exclus avec motif ; À creuser en attente', () => {
  assert.deepEqual(A.eligibilite({ statut: 'a_traiter' }), { eligible: true, motif: '' });
  assert.deepEqual(A.eligibilite({ statut: 'resilie', motifExclusion: 'contentieux' }), { eligible: false, motif: 'contentieux' });
  assert.deepEqual(A.eligibilite({ statut: 'toujours_actif', motifExclusion: 'toujours actif' }), { eligible: false, motif: 'toujours actif' });
  assert.equal(A.eligibilite({ statut: 'a_creuser' }).eligible, null);
});

test('suspension : « reporter … car vacances » explique la raison ; une note ancienne (2 ans) ne suffit pas', () => {
  const r1 = an(dossier({ contrats: [cSusp()], notes: notes('', 'à reporter à la fin du contrat car vacance 15 jours, reprise le 30/11') }));
  assert.equal(r1.suspension.raisonRenseignee, true);
  const r2 = an(dossier({ contrats: [cSusp()], notes: notes('', 'Suspension 2 semaines car vacances, le 30/07/24') }));
  assert.deepEqual(r2.remarques, [T.SUSP_RAISON]);
});

test('contrat Vendor : prix HEBDOMADAIRE ; semaines confirmées par Deciplus, sinon estimation qui fera ressortir l’écart', () => {
  assert.deepEqual([A.totalContratVendor({ prix: 45, engagement: '12 mois', formuleDet: { jours: 364 } }, 0).total], [2340]);
  assert.equal(A.totalContratVendor({ prix: 69, engagement: '1 an(s)' }, 0).total, 3588);
  assert.equal(A.totalContratVendor({ prix: 497, engagement: '' }, 0).total, 497, 'forfait');
  const ok = A.totalContratVendor({ prix: 90, engagement: '4 mois' }, 1530);
  assert.equal(ok.total, 1530); assert.match(ok.detail, /confirmée par Deciplus/);
  const div = A.totalContratVendor({ prix: 95, engagement: '4 mois' }, 1530);
  assert.equal(div.total, 95 * 17); assert.match(div.detail, /estimation/);
  assert.equal(A.totalContratVendor({ prix: 0 }, 0).fiable, false);
});

test('« FA offert » ne justifie pas un écart ; un contrat annulé à 0 € n’est pas contrôlé', () => {
  const r = an(dossier({ notes: notes('', 'FA OFFERT, challenge 12 mois') }), { vendor: { fiable: true, total: 2340 }, journal: { couvert: true, net: 900 } });
  assert.match(r.remarques[0], /^Vérifie la situation financière/);
  const r2 = an(dossier({ contrats: [contrat({ etat: 'CANCELED', valeurInitiale: 0, valeur: 0, paye: 0 })] }), { vendor: { fiable: true, total: 3120 } });
  assert.equal(r2.finance, null);
});

// ── DÉMÉNAGEMENT RÉCUPÉRABLE (règle de Stan, 18/09 soir) ─────────────────────
const M2 = require('../public/recap2-metrics.js');
const DEM = 'Contacte le client et propose-lui un transfert de studio ou de poursuivre son Challenge en visioconférence.';
test('déménagement sans refus : À traiter, action transfert/visio, récupération ouverte', () => {
  const r = an(dossier({ notes: notes('', 'arrêt car déménagement à Bordeaux') }));
  assert.equal(r.statut, 'a_traiter'); assert.equal(r.recuperationOuverte, true); assert.equal(T.DEMENAGEMENT, DEM);
  assert.equal(r.remarques[r.remarques.length - 1], DEM);
});
test('déménagement + décision manuelle « Résilié » : l’action reste, comptée « À récupérer » ET « Résiliations », jamais deux fois', () => {
  const a = an(dossier({ notes: notes('', 'arrêt car déménagement à Bordeaux') }), { vendor: { fiable: true, total: 2340 }, journal: { couvert: true, net: 900 } });
  const l = { analyse: a, suivi: { statut: 'resilie' } };
  assert.deepEqual(C.conseilsNonReconduit(l), [DEM], 'seule l’action de récupération, pas la finance');
  assert.equal(C.recuperationOuverte(l), true);
  const k = M2.indicateursNR([l, { analyse: a, suivi: { statut: '' } }]);
  assert.deepEqual([k.aRecuperer, k.resiliations, k.dontResilieRecuperable, k.detectees], [2, 1, 1, 2]);
  assert.equal(Object.values(k.parStatut).reduce((x, y) => x + y, 0), 2, 'chaque dossier une seule fois par statut');
});
test('refus définitif explicite, ou refus du transfert ET de la visio : plus d’action', () => {
  ['déménage à Lyon, refus définitif de toute proposition', 'déménagement : refuse le transfert et la visio', 'déménage, ne veut ni transfert ni visio', 'déménagement, sans possibilité de suivi en visio']
    .forEach((n) => { const r = an(dossier({ notes: notes('', n) })); assert.deepEqual(r.remarques, [], n); assert.equal(r.recuperationOuverte, false, n); });
});
test('refus de la visioconférence UNIQUEMENT : le transfert reste possible, action maintenue', () => {
  const r = an(dossier({ notes: notes('', 'déménagement, refuse la visio') }));
  assert.equal(r.statut, 'a_traiter'); assert.equal(r.remarques[r.remarques.length - 1], DEM);
});
test('le mot « déménagement », une résiliation ou un contrat arrêté ne valent jamais refus', () => {
  const r = an(dossier({ notes: notes('', 'résiliation reçue, déménagement, pas de réponse aux appels') }));
  assert.equal(r.recuperationOuverte, true);
});
test('contentieux et reconduction retrouvée restent prioritaires, même avec « Résilié » manuel', () => {
  const ctx = an(dossier({ categorie: 'Contentieux', notes: notes('', 'arrêt car déménagement') }));
  assert.deepEqual(C.conseilsNonReconduit({ analyse: ctx, suivi: { statut: 'resilie' } }), []);
  const rec = an(dossier({ notes: notes('', 'arrêt car déménagement'), contrats: [contrat(), contrat({ id: 2, etat: 'ACTIVE', debut: '2026-09-01', resiliation: '', historique: [], echeances: [ech('2026-09-21', 'T')] })] }));
  assert.equal(rec.statut, 'reconduit_autrement'); assert.deepEqual(C.conseilsNonReconduit({ analyse: rec, suivi: { statut: 'resilie' } }), []);
});
