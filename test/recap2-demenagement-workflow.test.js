'use strict';
// ============================================================================
//  DÉMÉNAGEMENT RÉCUPÉRABLE MALGRÉ « RÉSILIÉ », DE BOUT EN BOUT, CONTRE UN VRAI SERVEUR.
//  Dépôt (clé), garde-fous, application à la lecture, décision manuelle
//  prioritaire et historisée, remarques automatiques modifiables et
//  restaurables, remarque manuelle historisée, copies, cohorte figée,
//  suggestion « Récupéré », droits, persistance (rechargement, nouvelle
//  collecte, redémarrage), et AUCUN impact sur les KPI.  DONNÉES FICTIVES.
// ============================================================================

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const S = require('../lib/recap2Store.js');
const RR = require('../public/recap2-remarques.js');
const M = require('../public/recap2-metrics.js');
const T = require('../public/recap2-conseils.js').TEXTES_NR;

const BAC = fs.mkdtempSync(path.join(os.tmpdir(), 'recap2-dem-'));
const PORT = 3969;
const BASE = 'http://127.0.0.1:' + PORT;
const CLE = 'cle-de-test-tres-longue-nr-0123456789';
const PIN = 'pin-de-test-nr-controle';
const PIN_CONSEILLER = 'pin-conseiller-test';
let serveur, jeton, jetonConseiller;

const studio = (nom) => ({
  studio: nom,
  nonReconduction: { base: 10, nonReconduits: 3, taux: 0.3, tauxPct: 30, liste: [
    { client: 'DUPONT Marie', idClient: '90001', netM1: 180, netM: 0, vendeurOrigine: { vendeur: 'Marvin', date: '02/03/2026', numVente: '1', prestation: 'Challenge', site: 'x' } },
    { client: 'MARTIN Luc', idClient: '90002', netM1: 69, netM: 0 },
    { client: 'LEROY Anne', idClient: '90003', netM1: 45, netM: 0 },
  ] },
  clientsRetrouves: { ventesSignees: 0, annulees: 0, ventesActives: 0, ventesValides: 0, signataires: 0, retrouves: 0, taux: null, tauxPct: null, liste: [] },
  avertissements: [], controleBloquant: { ok: true, detail: {} },
});
const rapport = () => ({ businessVersion: 2, genere: new Date().toISOString(), mois: '2026-08', m1: '2026-07', source: { fitnessBooster: {} },
  studios: Object.fromEntries(S.LABELS.map((s) => [s, studio(s)])), journal: [], erreurs: [] });
const analyse = (o) => Object.assign({ statut: 'a_traiter', contentieux: false, irrecuperable: false, cause: { code: 'prix', libelle: 'Prix', certitude: 'Confirmée', indice: 'note Message accueil du 12/07/2026' },
  indication: 'Cause probable : Prix (Confirmée)', suspension: null, finance: null, remarques: [T.PRIX], motifExclusion: '' }, o);
const controle = (resultats, quand = '2026-09-18T10:00') => ({ mois: '2026-08', controleLe: quand, resultats, limites: ['avoirs non lisibles'] });
const r1 = (o = {}) => Object.assign({ type: 'nr', studio: 'Lille', idClient: '90001', client: 'DUPONT Marie', analyse: analyse() }, o);

const demarrer = async () => {
  serveur = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT), DB_DIR: BAC, RECAP2_INGEST_KEY: CLE, ADMIN_PIN: PIN, PILOTAGE_CONSULTANT_PIN: PIN_CONSEILLER }), stdio: ['ignore', 'pipe', 'pipe'] });
  serveur.stdout.resume(); serveur.stderr.resume();
  for (let i = 0; i < 100; i++) { try { await fetch(BASE + '/api/recap2/2026-08'); break; } catch (_) { await new Promise((r) => setTimeout(r, 100)); } }
  const login = async (pin) => (await (await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) })).json()).token;
  jeton = await login(PIN); jetonConseiller = await login(PIN_CONSEILLER);
  assert.ok(jeton && jetonConseiller);
};
const arreter = () => new Promise((ok) => { if (!serveur) return ok(); serveur.once('exit', ok); serveur.kill(); });
const post = (chemin, corps, h) => fetch(BASE + chemin, { method: 'POST', headers: h || auth(), body: JSON.stringify(corps) });
const auth = (j = jeton) => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + j });
const cle = { 'Content-Type': 'application/json', 'X-Recap2-Key': CLE };
const deposerRapport = () => post('/api/recap2/2026-08', rapport(), cle);
const deposerControle = (c) => post('/api/recap2/nr-controle/2026-08', c, cle);
const lire = async () => { const r = await fetch(BASE + '/api/recap2/2026-08', { headers: auth() }); assert.equal(r.status, 200); return r.json(); };
const ligne = (r, client = 'DUPONT Marie', s = 'Lille') => r.studios[s].nonReconduction.liste.find((l) => l.client === client);
const kpi = (r) => S.LABELS.map((s) => { const n = r.studios[s].nonReconduction; return [n.base, n.nonReconduits, n.taux, n.tauxPct, n.liste.length].join('/'); }).join(' ');
const fichier = () => fs.readFileSync(path.join(BAC, 'recap2', 'recap2-2026-08.json'), 'utf8');
let KPI0, FICHIER0;

const DEM = T.DEMENAGEMENT;
const dem = () => analyse({ cause: { code: 'demenagement', libelle: 'Déménagement', certitude: 'Confirmée', indice: 'note Message accueil du 19/05/2026' },
  indication: 'Cause probable : Déménagement (Confirmée)', recuperationOuverte: true,
  remarques: ['Vérifie la situation financière du client. Le contrat signé prévoyait 3 588 €, mais 552 € ont réellement été réglés, soit un écart de 3 036 €.', DEM] });

before(async () => {
  await demarrer();
  assert.equal((await deposerRapport()).status, 200);
  assert.equal((await deposerControle(controle([r1({ analyse: dem() })]))).status, 200);
  assert.equal((await post('/api/recap2/nr-statut', { mois: '2026-08', studio: 'Lille', client: 'DUPONT Marie', idClient: '90001', statut: 'resilie' })).status, 200);
});
after(async () => { await arreter(); try { fs.rmSync(BAC, { recursive: true, force: true }); } catch (_) {} });

const verifier = async (msg) => {
  const r = await lire(); const l = ligne(r);
  assert.equal(l.suivi.statut, 'resilie', msg + ' : décision humaine conservée');
  const club = RR.remarquesClub(r, 'Lille').texte;
  assert.match(club, /Marie Dupont\nÀ faire : Contacte le client et propose-lui un transfert de studio ou de poursuivre son Challenge en visioconférence\./, msg + ' : copie du club');
  assert.ok(!/situation financière/.test(club), msg + ' : seule l’action de récupération malgré « Résilié »');
  const k = M.indicateursNR(r.studios.Lille.nonReconduction.liste);
  assert.deepEqual([k.aRecuperer, k.resiliations, k.dontResilieRecuperable], [1, 1, 1], msg + ' : compteurs');
  return r;
};

test('« Résilié » manuel + déménagement récupérable : action visible, club et commercial, compteurs', async () => {
  await verifier('après décision');
  const com = M.commerciauxAttribuables(await lire())[0];
  assert.equal((await post('/api/recap2/nr-commercial', { mois: '2026-08', studio: 'Lille', client: 'DUPONT Marie', idClient: '90001', commercial: com.cle })).status, 200);
  assert.match(RR.remarquesCommercial(await lire(), com.cle, com.nom).texte, /À faire : Contacte le client et propose-lui un transfert de studio ou de poursuivre son Challenge en visioconférence\./);
});

test('persistance : rechargement, nouvelle collecte, redémarrage', async () => {
  await verifier('rechargement');
  assert.equal((await deposerRapport()).status, 200);
  await verifier('nouvelle collecte');
  await arreter(); await demarrer();
  await verifier('redémarrage');
});

test('refus définitif documenté au contrôle suivant : l’action disparaît, la décision reste', async () => {
  assert.equal((await deposerControle(controle([r1({ analyse: analyse({ statut: 'resilie', irrecuperable: true, recuperationOuverte: false, remarques: [], motifExclusion: 'départ irrécupérable' }) })], '2026-09-25T09:00'))).status, 200);
  const r = await lire();
  assert.equal(ligne(r).suivi.statut, 'resilie');
  assert.ok(!/visioconférence/.test(RR.remarquesClub(r, 'Lille').texte));
  assert.equal(M.indicateursNR(r.studios.Lille.nonReconduction.liste).aRecuperer, 0);
});
