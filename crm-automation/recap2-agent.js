'use strict';
// ============================================================================
//  RECAP 2 — L'AGENT DU MAC : exécute les analyses demandées depuis l'écran.
//
//      node crm-automation/recap2-agent.js            (tourne en continu)
//      node crm-automation/recap2-agent.js --une-fois (une seule interrogation)
//
//  Le bouton « Lancer l'analyse du mois » de RECAP 2 dépose une demande sur le
//  serveur (lib/recap2Analyses.js). Toutes les RECAP2_AGENT_INTERVALLE secondes
//  (20 par défaut), l'agent demande s'il y a du travail et, s'il y en a,
//  enchaîne sur CE Mac, avec le Chromium déjà connecté aux deux CRM :
//
//    1. recap2.js AAAA-MM                       — collecte, contrôles, dépôt ;
//    2. recap2-operationnel.js AAAA-MM --envoyer — contrôle opérationnel ;
//    3. recap2-nr-controle.js AAAA-MM --envoyer  — contrôle des non-reconduits.
//
//  Il s'arrête à la PREMIÈRE étape en échec : un contrôle lancé sur un rapport
//  qui n'a pas été déposé porterait sur des chiffres périmés.
//
//  ⚠️ LE MAC N'OUVRE AUCUN PORT. L'agent ne fait que des appels SORTANTS vers
//  RECAP2_INGEST_URL, avec RECAP2_INGEST_KEY (crm-automation/.env). Il ne
//  transmet que des états d'étape et une raison d'échec courte — jamais un
//  CSV, un cookie ni le journal complet, qui restent dans le terminal du Mac.
//
//  Le Challenge Flex n'en fait PAS partie : il reste à lancer à la main.
// ============================================================================

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Lecteur de .env — le même que recap2.js. Aucune valeur n'écrase le shell.
function chargerEnv() {
  const f = path.join(__dirname, '.env');
  if (!fs.existsSync(f)) return;
  fs.readFileSync(f, 'utf8').split('\n').forEach((ligne) => {
    const l = ligne.trim();
    if (!l || l.startsWith('#')) return;
    const i = l.indexOf('=');
    if (i < 1) return;
    const cle = l.slice(0, i).trim();
    let val = l.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[cle] === undefined) process.env[cle] = val;
  });
}

const ETAPES = [
  { id: 'recap2', script: 'recap2.js', args: [] },
  { id: 'operationnel', script: 'recap2-operationnel.js', args: ['--envoyer'] },
  { id: 'nr_controle', script: 'recap2-nr-controle.js', args: ['--envoyer'] },
];
const VIE_MS = 60 * 1000; // signe de vie pendant une étape longue

const horo = () => new Date().toISOString().slice(11, 19);
const dire = (t) => console.log('[' + horo() + '] ' + t);

let base = '';
let cle = '';
let enfant = null;     // le sous-outil en cours, pour l'arrêter proprement
let analyseEnCours = null;

async function appeler(chemin, corps) {
  const r = await fetch(base + chemin, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Recap2-Key': cle },
    body: JSON.stringify(corps || {}),
    signal: AbortSignal.timeout(20000),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error((j && j.error) || ('HTTP ' + r.status));
  return j;
}
// Un compte rendu perdu ne doit jamais faire tomber l'analyse elle-même.
async function rendreCompte(id, corps) {
  try { await appeler('/api/recap2/agent/' + id, corps); }
  catch (e) { dire('⚠️ compte rendu non transmis : ' + e.message); }
}

// La raison d'un échec, en une ligne : les deux dernières lignes qui l'annoncent
// (la cause, puis souvent le remède : « Chromium injoignable » — « Ouvre-le… »).
function raison(lignes, code) {
  const signal = lignes.filter((l) => /✗|BLOQUÉ|Échec|échec|⚠️|injoignable|expirée/.test(l));
  const l = signal.length ? signal.slice(-2).join(' — ') : (lignes[lignes.length - 1] || '');
  return (l.replace(/✗/g, '').replace(/\s+/g, ' ').trim() || 'code de sortie ' + code).slice(0, 300);
}

// Lance un sous-outil ; sa sortie est affichée telle quelle et on garde la fin.
function lancer(script, args, surVie) {
  return new Promise((resolve) => {
    const fin = [];
    const garder = (buf) => {
      String(buf).split('\n').forEach((l) => { if (l.trim()) fin.push(l); });
      while (fin.length > 40) fin.shift();
    };
    enfant = spawn(process.execPath, [path.join(__dirname, script)].concat(args), { cwd: __dirname, env: process.env });
    enfant.stdout.on('data', (b) => { process.stdout.write(b); garder(b); });
    enfant.stderr.on('data', (b) => { process.stderr.write(b); garder(b); });
    const vie = setInterval(surVie, VIE_MS);
    enfant.on('error', (e) => { garder('Échec : ' + e.message); });
    enfant.on('close', (code) => {
      clearInterval(vie);
      enfant = null;
      resolve({ code: code == null ? 1 : code, lignes: fin });
    });
  });
}

// Le `genere` du rapport déposé : il relie l'analyse aux fichiers analysés.
function genereLocal(mois) {
  try {
    const f = path.join(__dirname, '.session', 'controle', 'recap2-' + mois + '.json');
    return JSON.parse(fs.readFileSync(f, 'utf8')).genere || '';
  } catch (_) { return ''; }
}

async function executer(a) {
  analyseEnCours = a;
  dire('▶ analyse #' + a.id + ' — ' + a.mois + (a.demandePar ? ' (demandée par ' + a.demandePar + ')' : ''));
  let erreur = '';
  for (const e of ETAPES) {
    await rendreCompte(a.id, { etape: e.id, statut: 'en_cours' });
    dire('— étape ' + e.id + ' : node ' + e.script + ' ' + [a.mois].concat(e.args).join(' '));
    const r = await lancer(e.script, [a.mois].concat(e.args), () => rendreCompte(a.id, { vie: true }));
    if (r.code !== 0) {
      const msg = raison(r.lignes, r.code);
      await rendreCompte(a.id, { etape: e.id, statut: 'echec', message: msg });
      erreur = msg;
      dire('✗ étape ' + e.id + ' en échec : ' + msg);
      break;
    }
    await rendreCompte(a.id, { etape: e.id, statut: 'ok' });
    dire('✓ étape ' + e.id);
  }
  await rendreCompte(a.id, { fin: true, ok: !erreur, erreur, genere: genereLocal(a.mois) });
  dire((erreur ? '✗' : '✓') + ' analyse #' + a.id + ' ' + (erreur ? 'en échec' : 'terminée'));
  analyseEnCours = null;
}

async function interroger() {
  try {
    const j = await appeler('/api/recap2/agent/prendre');
    if (j && j.analyse) await executer(j.analyse);
  } catch (e) {
    dire('⚠️ serveur injoignable : ' + e.message);
  }
}

// Arrêt demandé (Ctrl+C, launchd) : on coupe le sous-outil et on le DIT.
async function arreter(signal) {
  dire('arrêt (' + signal + ')');
  if (enfant) enfant.kill('SIGTERM');
  if (analyseEnCours) {
    await rendreCompte(analyseEnCours.id, { fin: true, ok: false, erreur: 'Agent du Mac arrêté pendant l\'analyse.' });
  }
  process.exit(1);
}

(async () => {
  chargerEnv();
  base = (process.env.RECAP2_INGEST_URL || '').replace(/\/+$/, '');
  cle = process.env.RECAP2_INGEST_KEY || '';
  if (!base || !cle) {
    console.error('RECAP2_INGEST_URL / RECAP2_INGEST_KEY absents (crm-automation/.env).');
    process.exit(2);
  }
  process.on('SIGINT', () => arreter('SIGINT'));
  process.on('SIGTERM', () => arreter('SIGTERM'));
  const intervalle = Math.max(5, Number(process.env.RECAP2_AGENT_INTERVALLE) || 20) * 1000;
  dire('agent RECAP 2 prêt — ' + base + ', interrogation toutes les ' + intervalle / 1000 + ' s');
  if (process.argv.includes('--une-fois')) { await interroger(); process.exit(0); }
  for (;;) {
    await interroger();
    await new Promise((r) => setTimeout(r, intervalle));
  }
})();
