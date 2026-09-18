'use strict';
// ============================================================================
//  CHALLENGE FLEX DES VNI : RÈGLE, STOCKAGE, REMARQUE ET DÉCISION DU CONSEILLER.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const F = require('../lib/recap2Flex.js');
const C = require('../public/recap2-conseils.js');
const RR = require('../public/recap2-remarques.js');

const ID1 = '1700000000001x100000000000000001';
const ID2 = '1700000000002x100000000000000002';
const rapport = () => ({
  mois: '2026-08',
  studios: {
    Neuilly: {
      clientsRetrouves: { liste: [] }, nonReconduction: { liste: [] },
      vni: { liste: [
        { client: 'DUPONT Marie', contactId: ID1, idClient: '40001', dateVenue: '12/08/2026', commercial: 'Marvin R.', commercialId: 'c1' },
        { client: 'MARTIN Luc', contactId: ID2, idClient: '40002', dateVenue: '20/08/2026', commercial: 'Marvin R.', commercialId: 'c1' },
      ] },
    },
    Lille: { clientsRetrouves: { liste: [] }, nonReconduction: { liste: [] }, vni: { liste: [] } },
  },
});
const depot = (resultats) => ({ mois: '2026-08', controleLe: '2026-09-18T09:30', resultats });
const base = () => { const db = new Database(':memory:'); F.creerTable(db); return db; };
const vni = (r, i = 0) => r.studios.Neuilly.vni.liste[i];

test('la table se crée sans risque deux fois de suite', () => {
  const db = base(); F.creerTable(db);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type = 'table' AND name LIKE 'recap2_flex%'").get().n, 3);
});

test('dépôt refusé : statut inconnu, VNI absent du rapport, identifiant douteux', () => {
  const r = rapport();
  assert.deepEqual(F.valider({ resultats: [] }, r), ['controleLe : AAAA-MM-JJTHH:MM attendu']);
  const pb = F.valider(depot([
    { studio: 'Neuilly', contactId: ID1, statut: 'Transformé depuis' },
    { studio: 'Neuilly', contactId: '42', statut: 'Flex à proposer' },
    { studio: 'Lille', contactId: ID1, statut: 'Flex à proposer' },
  ]), r);
  assert.ok(pb.some((x) => /\.statut/.test(x)), 'le contrôle ne pose jamais « Transformé depuis »');
  assert.ok(pb.some((x) => /contactId/.test(x)));
  assert.ok(pb.some((x) => /absent du rapport/.test(x)));
});

test('dépôt accepté : statut, preuves et horodatage appliqués à la lecture', () => {
  const db = base(); const r = rapport();
  const d = depot([
    { studio: 'Neuilly', contactId: ID1, client: 'DUPONT Marie', statut: F.STATUTS.PROPOSE,
      preuves: [{ type: 'devis', quand: '12/08/2026 à 16:48', texte: 'Formule 4 coachings par mois' }] },
    { studio: 'Neuilly', contactId: ID2, client: 'MARTIN Luc', statut: F.STATUTS.A_PROPOSER, preuves: [] },
  ]);
  assert.deepEqual(F.valider(d, r), []);
  assert.equal(F.enregistrer(db, '2026-08', d), 2);
  const a = F.appliquer(r, F.controlesDuMois(db, '2026-08'));
  assert.equal(vni(a, 0).flex.statut, 'Flex proposé');
  assert.equal(vni(a, 0).flex.source, 'auto');
  assert.equal(vni(a, 0).flex.preuves[0].texte, 'Formule 4 coachings par mois');
  assert.equal(vni(a, 0).flex.controleLe, '2026-09-18T09:30');
  assert.equal(vni(a, 1).flex.statut, 'Flex à proposer');
  assert.equal(vni(r, 0).flex, undefined, 'le rapport d’origine n’est jamais modifié');
});

test('remarques : « Flex à proposer » et « À vérifier » seulement', () => {
  assert.deepEqual(C.conseilsVni({ flex: { statut: 'Flex à proposer' } }), ['Propose au prospect le Challenge Flex à 4 séances par mois.']);
  assert.deepEqual(C.conseilsVni({ flex: { statut: 'À vérifier' } }), ['Vérifie l’identité du prospect dans Vendor.']);
  ['Flex proposé', 'Transformé depuis', 'Prospect non intéressé', 'À reproposer plus tard']
    .forEach((s) => assert.deepEqual(C.conseilsVni({ flex: { statut: s } }), [], s));
  assert.deepEqual(C.conseilsVni({}), [], 'mois non contrôlé : aucune remarque');
});

test('DÉCISION DU CONSEILLER : datée, attribuée, prioritaire, et elle fait taire la remarque', () => {
  const db = base(); const r = rapport();
  F.enregistrer(db, '2026-08', depot([{ studio: 'Neuilly', contactId: ID1, statut: F.STATUTS.A_PROPOSER, preuves: [] }]));
  const avant = F.appliquer(r, F.controlesDuMois(db, '2026-08'), F.decisionsDuMois(db, '2026-08'));
  assert.deepEqual(C.conseilsVni(vni(avant, 0)), ['Propose au prospect le Challenge Flex à 4 séances par mois.']);

  const d = F.decider(db, { mois: '2026-08', studio: 'Neuilly', contactId: ID1, valeur: 'propose', par: 'Stan' });
  assert.equal(d.libelle, 'Flex proposé');
  assert.ok(d.modifieLe && d.modifiePar === 'Stan');
  const apres = F.appliquer(r, F.controlesDuMois(db, '2026-08'), F.decisionsDuMois(db, '2026-08'));
  assert.equal(vni(apres, 0).flex.statut, 'Flex proposé');
  assert.equal(vni(apres, 0).flex.source, 'manuel');
  assert.equal(vni(apres, 0).flex.statutAuto, 'Flex à proposer', 'le contrôle automatique reste lisible');
  assert.deepEqual(C.conseilsVni(vni(apres, 0)), [], 'l’action est faite : on ne la redemande pas');
});

test('les trois décisions possibles, et le retour à l’automatique', () => {
  const db = base(); const r = rapport();
  F.enregistrer(db, '2026-08', depot([{ studio: 'Neuilly', contactId: ID1, statut: F.STATUTS.A_PROPOSER, preuves: [] }]));
  [['propose', 'Flex proposé'], ['non_interesse', 'Prospect non intéressé'], ['reproposer', 'À reproposer plus tard']].forEach(([v, libelle]) => {
    F.decider(db, { mois: '2026-08', studio: 'Neuilly', contactId: ID1, valeur: v, par: 'Stan' });
    const a = F.appliquer(r, F.controlesDuMois(db, '2026-08'), F.decisionsDuMois(db, '2026-08'));
    assert.equal(vni(a, 0).flex.statut, libelle);
    assert.deepEqual(C.conseilsVni(vni(a, 0)), []);
  });
  F.decider(db, { mois: '2026-08', studio: 'Neuilly', contactId: ID1, valeur: 'auto', par: 'Stan' });
  const a = F.appliquer(r, F.controlesDuMois(db, '2026-08'), F.decisionsDuMois(db, '2026-08'));
  assert.equal(vni(a, 0).flex.statut, 'Flex à proposer');
  assert.deepEqual(C.conseilsVni(vni(a, 0)), ['Propose au prospect le Challenge Flex à 4 séances par mois.']);
});

test('une valeur inconnue ou un identifiant non Vendor sont refusés', () => {
  const db = base();
  assert.throws(() => F.decider(db, { mois: '2026-08', studio: 'Neuilly', contactId: ID1, valeur: 'peut-être' }), /valeur/);
  assert.throws(() => F.decider(db, { mois: '2026-08', studio: 'Neuilly', contactId: '42', valeur: 'propose' }), /contact Vendor/);
  assert.throws(() => F.decider(db, { mois: '2026-13', studio: 'Neuilly', contactId: ID1, valeur: 'propose' }), /mois/);
});

test('un nouveau contrôle n’efface pas la décision du conseiller', () => {
  const db = base(); const r = rapport();
  F.enregistrer(db, '2026-08', depot([{ studio: 'Neuilly', contactId: ID1, statut: F.STATUTS.A_PROPOSER, preuves: [] }]));
  F.decider(db, { mois: '2026-08', studio: 'Neuilly', contactId: ID1, valeur: 'non_interesse', par: 'Stan' });
  F.enregistrer(db, '2026-08', depot([{ studio: 'Neuilly', contactId: ID1, statut: F.STATUTS.PROPOSE, preuves: [{ type: 'note', quand: '18/08', texte: 'offre FLEX' }] }]));
  const a = F.appliquer(r, F.controlesDuMois(db, '2026-08'), F.decisionsDuMois(db, '2026-08'));
  assert.equal(a.studios.Neuilly.vni.liste[0].flex.statut, 'Prospect non intéressé');
  assert.equal(a.studios.Neuilly.vni.liste[0].flex.statutAuto, 'Flex proposé');
});

test('le même contact dans un autre studio garde son propre statut', () => {
  const db = base();
  const r = rapport();
  r.studios.Lille.vni.liste.push({ client: 'DUPONT Marie', contactId: ID1, dateVenue: '02/08/2026' });
  F.enregistrer(db, '2026-08', depot([{ studio: 'Neuilly', contactId: ID1, statut: F.STATUTS.PROPOSE, preuves: [] }]));
  const a = F.appliquer(r, F.controlesDuMois(db, '2026-08'));
  assert.equal(a.studios.Neuilly.vni.liste[0].flex.statut, 'Flex proposé');
  assert.equal(a.studios.Lille.vni.liste[0].flex, undefined);
});

test('COPIE DU CLUB ET DU COMMERCIAL : la remarque VNI est reprise, la manuelle intacte', () => {
  const db = base(); const r = rapport();
  F.enregistrer(db, '2026-08', depot([
    { studio: 'Neuilly', contactId: ID1, statut: F.STATUTS.A_PROPOSER, preuves: [] },
    { studio: 'Neuilly', contactId: ID2, statut: F.STATUTS.PROPOSE, preuves: [] },
  ]));
  const a = F.appliquer(r, F.controlesDuMois(db, '2026-08'));
  a.studios.Neuilly.vni.liste[0].note = { remarque: 'Rappelé hier.' };
  const club = RR.remarquesClub(a, 'Neuilly');
  assert.equal(club.nb, 1, 'seule Marie a quelque chose à traiter');
  assert.ok(club.texte.includes('Marie Dupont\nPropose au prospect le Challenge Flex à 4 séances par mois.\nRappelé hier.'));
  assert.ok(!club.texte.includes('Luc Martin'), 'un Flex déjà proposé ne sort pas');
  const com = RR.remarquesCommercial(a, 'id:c1', 'Marvin R.');   // clé du jeu d'essai du module
  assert.ok(com.texte.includes('Propose au prospect le Challenge Flex à 4 séances par mois.'));
});

test('sans aucun contrôle ni décision, le rapport est rendu tel quel', () => {
  const r = rapport();
  assert.equal(F.appliquer(r, new Map(), new Map()), r);
});

// ── DE BOUT EN BOUT, CONTRE UN VRAI SERVEUR ────────────────────────────────
//  Dépôt du contrôle (clé d'ingestion), décision du conseiller (admin), puis
//  NOUVELLE COLLECTE et REDÉMARRAGE : tout tient, et aucun compteur VNI ne bouge.
const { before, after } = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const S = require('../lib/recap2Store.js');

const COM = '1700000000009x900000000000000009';   // identifiant Vendor d'un commercial
const BAC = fs.mkdtempSync(path.join(os.tmpdir(), 'recap2-flex-'));
const PORT = 3988;
const BASE = 'http://127.0.0.1:' + PORT;
const CLE = 'cle-de-test-tres-longue-0123456789';
const PIN = 'pin-de-test-flex';
let serveur, jeton;

const studioComplet = (nom) => ({
  studio: nom,
  nonReconduction: { base: 4, nonReconduits: 1, taux: 0.25, tauxPct: 25, liste: [{ client: 'DUPONT Marie', netM1: 60, netM: 0 }] },
  clientsRetrouves: {
    ventesSignees: 1, annulees: 0, ventesActives: 1, signataires: 1, retrouves: 1, taux: 1, tauxPct: 100,
    liste: [{ client: 'Julien Berger', date: '12/08/2026', prestation: 'Challenge', commercial: 'Cédric H.', annulee: false,
      dateAnnulation: '', retrouve: true, site: 'My Coach ' + nom, dateVente: '12/08/2026', idClient: '40003', encaisse: false }],
  },
  vni: { visiteurs: 2, tuileVisiteurs: 2, venus: 2, transformes: 0, liste: [
    { client: 'DUPONT Marie', contactId: ID1, idClient: '40001', dateVenue: '12/08/2026', venues: 1, commercial: 'Marvin R.', commercialId: COM, statutVendor: 'Visiteur - Refus' },
    { client: 'MARTIN Luc', contactId: ID2, idClient: '40002', dateVenue: '20/08/2026', venues: 1, commercial: 'Marvin R.', commercialId: COM, statutVendor: 'Visiteur - En réflexion' },
  ] },
  avertissements: [], controleBloquant: { ok: true, detail: {} },
});
const rapportComplet = () => ({
  businessVersion: 2, genere: new Date().toISOString(), mois: '2026-08', m1: '2026-07', source: { fitnessBooster: {} },
  studios: Object.fromEntries(S.LABELS.map((s) => [s, studioComplet(s)])), journal: [], erreurs: [],
});

const demarrer = async () => {
  serveur = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT), DB_DIR: BAC, RECAP2_INGEST_KEY: CLE, ADMIN_PIN: PIN }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serveur.stdout.resume(); serveur.stderr.resume();
  for (let i = 0; i < 100; i++) {
    try { await fetch(BASE + '/api/recap2/2026-08'); break; } catch (_) { await new Promise((r) => setTimeout(r, 100)); }
  }
  const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: PIN }) });
  jeton = (await r.json()).token;
};
const arreter = () => new Promise((ok) => { if (!serveur) return ok(); serveur.once('exit', ok); serveur.kill(); });
const deposerRapport = (c) => fetch(BASE + '/api/recap2/2026-08', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Recap2-Key': CLE }, body: JSON.stringify(c) });
const deposerFlex = (corps, cle = CLE) => fetch(BASE + '/api/recap2/flex/2026-08', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Recap2-Key': cle }, body: JSON.stringify(corps) });
const decider = (corps, auth = true) => fetch(BASE + '/api/recap2/flex-decision', {
  method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth ? { Authorization: 'Bearer ' + jeton } : {}),
  body: JSON.stringify(Object.assign({ mois: '2026-08', studio: 'Neuilly', contactId: ID1 }, corps)) });
const lireRapport = async () => (await fetch(BASE + '/api/recap2/2026-08', { headers: { Authorization: 'Bearer ' + jeton } })).json();
const marie = (r) => r.studios.Neuilly.vni.liste.find((l) => l.contactId === ID1);
const compteursVni = (r) => S.LABELS.map((s) => { const v = r.studios[s].vni; return [v.visiteurs, v.venus, v.transformes, (v.liste || []).length].join('/'); }).join(' ');
let VNI0;

before(async () => { await demarrer(); assert.equal((await deposerRapport(rapportComplet())).status, 200); VNI0 = compteursVni(await lireRapport()); });
after(async () => { await arreter(); try { fs.rmSync(BAC, { recursive: true, force: true }); } catch (_) {} });

test('dépôt du contrôle sans clé : refusé', async () => {
  assert.equal((await deposerFlex(depot([]), 'mauvaise')).status, 401);
});

test('dépôt du contrôle : statuts posés, compteurs VNI inchangés', async () => {
  const rep = await deposerFlex(depot([
    { studio: 'Neuilly', contactId: ID1, client: 'DUPONT Marie', statut: F.STATUTS.A_PROPOSER, preuves: [] },
    { studio: 'Neuilly', contactId: ID2, client: 'MARTIN Luc', statut: F.STATUTS.PROPOSE, preuves: [{ type: 'devis', quand: '20/08/2026 à 10:00', texte: 'Formule Pack 4 coaching / mois' }] },
  ]));
  assert.equal(rep.status, 200);
  assert.equal((await rep.json()).vni, 2);
  const r = await lireRapport();
  assert.equal(marie(r).flex.statut, 'Flex à proposer');
  assert.equal(r.studios.Neuilly.vni.liste[1].flex.statut, 'Flex proposé');
  assert.equal(compteursVni(r), VNI0, 'aucun compteur VNI ne bouge');
});

test('un VNI absent du rapport est refusé', async () => {
  const rep = await deposerFlex(depot([{ studio: 'Neuilly', contactId: '1111111111x2222222222', statut: F.STATUTS.A_PROPOSER }]));
  assert.equal(rep.status, 422);
});

test('décision sans session : refusée', async () => {
  assert.equal((await decider({ valeur: 'propose' }, false)).status, 401);
});

test('décision du conseiller : enregistrée, datée, attribuée', async () => {
  const rep = await decider({ valeur: 'reproposer' });
  assert.equal(rep.status, 200);
  const j = await rep.json();
  assert.equal(j.decision.libelle, 'À reproposer plus tard');
  assert.ok(j.decision.modifiePar && j.decision.modifieLe);
  assert.equal(j.flex.statut, 'À reproposer plus tard');
  assert.equal((await lireRapport(), marie(await lireRapport()).flex.source), 'manuel');
});

test('la décision SURVIT à une nouvelle collecte et à un redémarrage', async () => {
  assert.equal((await deposerRapport(rapportComplet())).status, 200);
  assert.equal(marie(await lireRapport()).flex.statut, 'À reproposer plus tard');
  await arreter(); await demarrer();
  const r = await lireRapport();
  assert.equal(marie(r).flex.statut, 'À reproposer plus tard');
  assert.equal(marie(r).flex.statutAuto, 'Flex à proposer');
  assert.equal(compteursVni(r), VNI0);
});

test('retour à l’automatique : la remarque revient', async () => {
  assert.equal((await decider({ valeur: 'auto' })).status, 200);
  const r = await lireRapport();
  assert.equal(marie(r).flex.statut, 'Flex à proposer');
  assert.deepEqual(C.conseilsVni(marie(r)), ['Propose au prospect le Challenge Flex à 4 séances par mois.']);
});

test('un contact inconnu du mois est refusé', async () => {
  assert.equal((await decider({ contactId: '1111111111x2222222222', valeur: 'propose' })).status, 404);
});

test('HISTORIQUE : chaque décision et chaque retour à l’automatique sont inscrits, jamais effacés', () => {
  const db = base();
  const dec = (valeur, t) => F.decider(db, { mois: '2026-08', studio: 'Neuilly', contactId: ID1, valeur, client: 'DUPONT Marie', par: 'Stan' }, t);
  dec('propose', '2026-09-18T10:00:00Z');
  dec('propose', '2026-09-18T10:01:00Z'); // même valeur : pas de ligne inutile
  dec('non_interesse', '2026-09-18T10:02:00Z');
  dec('auto', '2026-09-18T10:03:00Z');
  const h = F.historique(db, '2026-08').map((x) => [x.avant, x.apres, x.par]);
  assert.deepEqual(h, [['auto', 'propose', 'Stan'], ['propose', 'non_interesse', 'Stan'], ['non_interesse', 'auto', 'Stan']]);
  assert.equal(F.decisionsDuMois(db, '2026-08').size, 0, 'retour à l’automatique : plus de décision courante');
});

// ── ABONNEMENT DÉTECTÉ DANS VENDOR (règle de Stan, 2026-09-18) ─────────────────
test('classement : identifiant exact exigé ; abonné Vendor avant tout ; jamais sur le nom', () => {
  const S = F.STATUTS;
  assert.equal(F.classer({ ouverte: false, statutVendor: 'Client - Avec Abonnement' }), S.A_VERIFIER, 'identité incertaine : À vérifier');
  assert.equal(F.classer({ ouverte: true, statutVendor: 'Client - Avec Abonnement' }), S.ABONNE_VENDOR);
  assert.equal(F.classer({ ouverte: true, statutVendor: 'Client – Avec Abonnement' }), S.ABONNE_VENDOR, 'tiret long accepté');
  assert.equal(F.classer({ ouverte: true, statutVendor: 'Client - Avec Abonnement', preuves: [{}] }), S.ABONNE_VENDOR, 'souscrit : plus de Flex à traiter');
  assert.equal(F.classer({ ouverte: true, statutVendor: 'Client - Résilié' }), S.A_PROPOSER, 'un résilié n’est pas transformé');
  assert.equal(F.classer({ ouverte: true, statutVendor: 'Visiteur - Refus', preuves: [{}] }), S.PROPOSE);
  assert.equal(F.classer({ ouverte: true, statutVendor: '' }), S.A_PROPOSER);
});

test('abonné Vendor : retiré de la liste active, ligne transformée datée de la collecte, sans date de signature', () => {
  const db = base(); const r = rapport();
  const d = depot([{ studio: 'Neuilly', contactId: ID1, client: 'DUPONT Marie', statut: F.STATUTS.ABONNE_VENDOR, preuves: [] },
    { studio: 'Neuilly', contactId: ID2, client: 'MARTIN Luc', statut: F.STATUTS.A_PROPOSER, preuves: [] }]);
  assert.deepEqual(F.valider(d, r), []);
  F.enregistrer(db, '2026-08', d);
  const a = F.appliquer(r, F.controlesDuMois(db, '2026-08'), F.decisionsDuMois(db, '2026-08'));
  const v = a.studios.Neuilly.vni;
  assert.deepEqual(v.liste.map((l) => l.client), ['MARTIN Luc'], 'hors des VNI à traiter');
  assert.equal(v.retires, 1);
  assert.equal(v.transformesDepuis.length, 1);
  const t = v.transformesDepuis[0];
  assert.equal(t.source, 'vendor-abonnement');
  assert.equal(t.transformeLe, '', 'aucune date de signature inventée');
  assert.equal(t.detecteLe, '2026-09-18T09:30');
  assert.equal(t.client, 'DUPONT Marie');
  assert.deepEqual(C.conseilsVni(v.liste[0]), ['Propose au prospect le Challenge Flex à 4 séances par mois.']);
});

test('homonyme : le statut Vendor d’un contact ne retire jamais un autre contact au même nom', () => {
  const db = base(); const r = rapport();
  r.studios.Neuilly.vni.liste[1].client = 'DUPONT Marie';
  F.enregistrer(db, '2026-08', depot([{ studio: 'Neuilly', contactId: ID1, client: 'DUPONT Marie', statut: F.STATUTS.ABONNE_VENDOR, preuves: [] }]));
  const a = F.appliquer(r, F.controlesDuMois(db, '2026-08'));
  assert.deepEqual(a.studios.Neuilly.vni.liste.map((l) => l.contactId), [ID2]);
});

test('signature RECAP 2 prioritaire : déjà retirée par la règle VNI, elle garde sa date et sa source', () => {
  const V = require('../lib/recap2Vni.js');
  const db = base(); const r = rapport();
  F.enregistrer(db, '2026-08', depot([{ studio: 'Neuilly', contactId: ID1, client: 'DUPONT Marie', statut: F.STATUTS.ABONNE_VENDOR, preuves: [] }]));
  const idx = V.indexer([{ contactId: ID1, date: '05/09/2026', source: 'vendor-vente' }]);
  const a = F.appliquer(V.appliquer(r, idx), F.controlesDuMois(db, '2026-08'));
  const v = a.studios.Neuilly.vni;
  assert.equal(v.transformesDepuis.length, 1, 'une seule ligne transformée');
  assert.equal(v.transformesDepuis[0].transformeLe, '05/09/2026');
  assert.equal(v.transformesDepuis[0].source, 'vendor-vente');
  assert.equal(v.retires, 1);
});
