'use strict';
// ============================================================================
//  RECAP 2 — ENVOI du JSON de collecte vers le serveur (Mac -> Railway).
//
//  La collecte tourne sur le Mac (elle a besoin du navigateur connecté aux deux
//  CRM). Le serveur, lui, ne sait rien faire d'autre que RELIRE le résultat.
//  Ce script est le pont, et il est volontairement bête :
//
//      lire le JSON local  ->  le valider  ->  le réduire à sa forme canonique
//                          ->  POST authentifié  ->  afficher l'accusé
//
//  Usage :
//    node recap2-envoi.js 2026-07                        (URL et clé depuis .env)
//    node recap2-envoi.js 2026-07 --url https://mon-app.up.railway.app
//    node recap2-envoi.js 2026-07 --verifier             (valide SANS rien envoyer)
//
//  ⚠️ CE QUI PART : uniquement l'objet reconstruit par lib/recap2Store.js —
//  les deux KPI par studio, leurs compteurs, le détail NOMINATIF (on le garde,
//  c'est ce que l'écran ouvre au clic), la traçabilité de la collecte et le
//  journal. Rien d'autre ne peut partir : la forme canonique est reconstruite
//  champ par champ.
//
//  ⚠️ CE QUI NE PART JAMAIS : les CSV Deciplus (.session/exports), le profil
//  Chromium et ses cookies (.session/chromium), les captures d'observation.
//  Ils restent ici, dans un dossier non versionné.
//
//  ⚠️ Le JSON contient des noms de clients : l'envoi exige HTTPS (sauf vers
//  localhost, pour les essais) et une clé de dépôt d'au moins 16 caractères.
// ============================================================================

const fs = require('fs');
const path = require('path');
const Store = require('../lib/recap2Store.js');

const DOSSIER_LOCAL = path.join(__dirname, '.session', 'controle');

// Petit lecteur de .env — pas de dépendance ici, le fichier reste à côté du
// script et n'est pas versionné (voir .gitignore). Aucune valeur n'écrase ce
// qui est déjà dans l'environnement du shell.
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

const arg = (nom) => {
  const i = process.argv.indexOf(nom);
  return i > -1 ? process.argv[i + 1] : undefined;
};

(async () => {
  chargerEnv();
  const mois = process.argv[2];
  if (!Store.MOIS_RE.test(mois || '')) {
    console.error('Usage : node recap2-envoi.js AAAA-MM [--url https://…] [--verifier]');
    process.exit(2);
  }
  const verifierSeulement = process.argv.includes('--verifier');
  const base = String(arg('--url') || process.env.RECAP2_INGEST_URL || '').replace(/\/+$/, '');
  const cle = String(process.env.RECAP2_INGEST_KEY || '').trim();

  // ── 1) Le fichier local ───────────────────────────────────────────────────
  const source = path.join(DOSSIER_LOCAL, 'recap2-' + mois + '.json');
  if (!fs.existsSync(source)) {
    console.error('✗ Aucun JSON pour ' + mois + ' : ' + source);
    console.error('  Lance d\'abord :  node recap2-collecte.js ' + mois);
    process.exit(1);
  }
  let rapport;
  try { rapport = JSON.parse(fs.readFileSync(source, 'utf8')); }
  catch (e) { console.error('✗ JSON illisible : ' + e.message); process.exit(1); }

  // ── 2) Validation AVANT tout envoi ────────────────────────────────────────
  //  Exactement le validateur du serveur : ce qui passe ici passera là-bas.
  const v = Store.valider(rapport, mois);
  if (!v.ok) {
    console.error('✗ Rapport ' + mois + ' refusé — ' + v.problemes.length + ' problème(s) :');
    v.problemes.forEach((p) => console.error('   · ' + p));
    process.exit(1);
  }
  const propre = Store.nettoyer(rapport);
  const corps = JSON.stringify(propre);
  const octets = Buffer.byteLength(corps);

  // Ce qu'on s'apprête à transmettre, en clair, avant de le faire.
  const noms = Store.LABELS.reduce((n, s) => {
    const b = propre.studios[s] || {};
    return n + ((b.nonReconduction && b.nonReconduction.liste || []).length)
      + ((b.completion && b.completion.liste || []).length);
  }, 0);
  console.log('Rapport ' + mois + ' (M-1 = ' + propre.m1 + ') — collecté le ' + propre.genere);
  console.log('  ' + Object.keys(propre.studios).length + ' studios · ' + noms + ' nom(s) de client dans le détail · '
    + octets + ' octets');
  if ((propre.erreurs || []).length) {
    console.log('  ⚠️ la collecte a signalé ' + propre.erreurs.length + ' erreur(s) — elles partent avec le rapport :');
    propre.erreurs.forEach((e) => console.log('     · ' + e));
  }
  if (verifierSeulement) { console.log('✓ Valide. Rien n\'a été envoyé (--verifier).'); process.exit(0); }

  // ── 3) Contrôles d'envoi ──────────────────────────────────────────────────
  if (!base) {
    console.error('✗ URL du serveur absente : --url https://… ou RECAP2_INGEST_URL dans crm-automation/.env');
    process.exit(2);
  }
  let u;
  try { u = new URL(base); } catch (_) { console.error('✗ URL invalide : ' + base); process.exit(2); }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !local) {
    console.error('✗ HTTPS exigé (le rapport contient des noms de clients) : ' + base);
    process.exit(2);
  }
  if (cle.length < 16) {
    console.error('✗ RECAP2_INGEST_KEY absente ou trop courte (16 caractères minimum).');
    console.error('  Renseigne-la dans crm-automation/.env — voir .env.example.');
    process.exit(2);
  }

  // ── 4) Dépôt ──────────────────────────────────────────────────────────────
  const cible = base + '/api/recap2/' + mois;
  console.log('→ POST ' + cible);
  let r;
  try {
    r = await fetch(cible, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Recap2-Key': cle },
      body: corps,
    });
  } catch (e) {
    console.error('✗ Serveur injoignable : ' + e.message);
    process.exit(1);
  }
  const rep = await r.json().catch(() => null);
  if (!r.ok) {
    console.error('✗ Dépôt refusé (HTTP ' + r.status + ') : ' + ((rep && rep.error) || 'réponse illisible'));
    ((rep && rep.problemes) || []).forEach((p) => console.error('   · ' + p));
    process.exit(1);
  }
  console.log('✓ Déposé : ' + JSON.stringify(rep));
  console.log('  Vérifie dans l\'app : onglet RECAP 2, mois ' + mois + '.');
})().catch((e) => { console.error('Échec : ' + e.message); process.exit(1); });
