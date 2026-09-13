'use strict';
// ============================================================================
//  RECAP 2 — LA COMMANDE DU MOIS. Une seule.
//
//      npm run recap2 -- 2026-08          (depuis la racine ou crm-automation)
//      node crm-automation/recap2.js 2026-08
//
//  Elle ne réécrit rien : elle ORCHESTRE les deux outils déjà éprouvés.
//
//    0. vérifier que Chromium est là et que les deux CRM sont ouverts ;
//       vérifier aussi l'adresse et la clé de dépôt — AVANT dix minutes de
//       collecte, pas après ;
//    1. recap2-collecte.js   -> Deciplus M et M-1, Fitness Booster M-1,
//                               ventes annulées exclues, JSON écrit en local ;
//    2. lib/recap2Controles  -> tous les contrôles, bloquants et non bloquants ;
//    3. un résumé lisible, AVANT tout envoi ;
//    4. recap2-envoi.js      -> seulement si aucun contrôle bloquant n'échoue.
//
//  ⚠️ CE QUI NE SORT JAMAIS DE CE MAC : les CSV Deciplus (.session/exports/),
//  le profil Chromium et ses cookies (.session/chromium/). Ce script ne les
//  lit même pas : il ne transmet rien lui-même, il laisse recap2-envoi.js
//  poster la forme canonique de lib/recap2Store.js, et rien d'autre.
//
//  Options :
//    --sans-deciplus   réutilise les CSV déjà exportés (passé à la collecte)
//    --sans-collecte   ne collecte pas : relit le JSON du mois déjà produit,
//                      rejoue les contrôles et refait l'envoi. C'est la reprise
//                      après un dépôt qui a échoué — inutile de repasser dix
//                      minutes dans les deux CRM pour un problème de réseau.
//    --sans-envoi      va jusqu'au résumé et s'arrête (aucun POST)
//    --url https://…   serveur de destination (sinon RECAP2_INGEST_URL)
// ============================================================================

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const CTRL = require('./lib/recap2Controles.js');
const Store = require('../lib/recap2Store.js');

const CDP = (process.env.CRM_DEBUG_URL || 'http://127.0.0.1:9222').replace(/\/+$/, '');
const DOSSIER_SORTIE = path.join(__dirname, '.session', 'controle');
const LARGEUR = 74;

// Les deux CRM, reconnus à leur hôte — les mêmes repères que la collecte.
const OUTILS = [
  { nom: 'Deciplus', motif: 'deciplus' },
  { nom: 'Fitness Booster', motif: 'fitness-booster' },
];

// ─── Habillage ──────────────────────────────────────────────────────────────
const trait = (c) => c.repeat(LARGEUR);
const titre = (t) => { console.log('\n' + trait('─')); console.log('  ' + t); console.log(trait('─')); };
const ok = (t) => console.log('  ✓ ' + t);
const ko = (t) => console.log('  ✗ ' + t);
const info = (t) => console.log('    ' + t);
const pct = (x) => (x == null ? '—' : (x * 100).toFixed(1).replace('.', ',') + ' %');
const moisLabel = (ym) => {
  const [a, m] = String(ym || '').split('-').map(Number);
  if (!a || !m) return String(ym || '');
  const l = new Date(a, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return l.charAt(0).toUpperCase() + l.slice(1);
};

// Lecteur de .env — le même que recap2-envoi.js, pour vérifier AVANT de
// collecter que le dépôt sera possible. Aucune valeur n'écrase le shell.
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

const arg = (nom) => { const i = process.argv.indexOf(nom); return i > -1 ? process.argv[i + 1] : undefined; };

// ─── ÉTAPE 0 — le navigateur et la session ──────────────────────────────────
//  On interroge le point de debug de Chromium en lecture seule : il rend la
//  liste des onglets ouverts (titre + URL). AUCUN cookie, aucun contenu de
//  page. C'est assez pour dire « la fenêtre est là, les deux CRM sont ouverts,
//  et aucun des deux n'est retombé sur son écran de connexion ».
async function verifierNavigateur() {
  const pb = [];
  let onglets = null;
  try {
    const r = await fetch(CDP + '/json/list', { signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    onglets = await r.json();
  } catch (e) {
    pb.push('Chromium injoignable sur ' + CDP + ' (' + e.message + ')');
    pb.push('Ouvre-le : CRM_DEBUG_PORT=9222 npm run open   (puis connecte-toi dans la fenêtre)');
    return { ok: false, problemes: pb, onglets: [] };
  }
  const pages = (onglets || []).filter((o) => o.type === 'page');
  OUTILS.forEach((o) => {
    const p = pages.find((x) => String(x.url || '').includes(o.motif));
    if (!p) { pb.push(o.nom + ' : aucun onglet ouvert'); return; }
    if (/\/login|\/signin|\/connexion|\/auth/i.test(String(p.url || ''))) {
      pb.push(o.nom + ' : la session semble expirée — l\'onglet est sur un écran de connexion');
    } else ok(o.nom + ' : onglet ouvert');
  });
  return { ok: pb.length === 0, problemes: pb, onglets: pages };
}

// ─── Lancement d'un sous-outil, sortie affichée telle quelle ────────────────
function lancer(script, args) {
  const r = spawnSync(process.execPath, [path.join(__dirname, script)].concat(args), {
    cwd: __dirname, stdio: 'inherit', env: process.env,
  });
  if (r.error) return { code: 1, erreur: r.error.message };
  return { code: r.status == null ? 1 : r.status };
}

(async () => {
  chargerEnv();
  const mois = process.argv[2];
  if (!Store.MOIS_RE.test(mois || '')) {
    console.error('Usage : node recap2.js AAAA-MM [options]');
    console.error('  --sans-deciplus   réutilise les CSV Deciplus déjà exportés');
    console.error('  --sans-collecte   ne collecte pas : relit le JSON du mois et refait contrôles + envoi');
    console.error('  --sans-envoi      s\'arrête après le résumé, aucun dépôt');
    console.error('  --url https://…   serveur de destination (sinon RECAP2_INGEST_URL)');
    console.error('Exemple : npm run recap2 -- 2026-08');
    process.exit(2);
  }
  const m1 = Store.moisPrecedent(mois);
  const sansEnvoi = process.argv.includes('--sans-envoi');
  const sansCollecte = process.argv.includes('--sans-collecte');
  const urlCible = arg('--url');

  console.log('\n' + trait('═'));
  console.log('  RECAP 2 — contrôle de ' + moisLabel(mois) + '   (ventes de ' + moisLabel(mois) + ', base de ' + moisLabel(m1) + ')');
  console.log(trait('═'));

  // ── 0. Préflight ──────────────────────────────────────────────────────────
  titre('1/4  Navigateur et session CRM');
  // Sans collecte, aucun CRM n'est ouvert ni nécessaire : on ne va lire qu'un
  // fichier déjà écrit. Vérifier le navigateur bloquerait pour rien.
  const nav = sansCollecte
    ? (ok('Non requis — reprise sur le JSON déjà collecté (--sans-collecte)'), { ok: true, problemes: [], onglets: [] })
    : await verifierNavigateur();
  const pbEnvoi = [];
  const base = String(urlCible || process.env.RECAP2_INGEST_URL || '').replace(/\/+$/, '');
  const cle = String(process.env.RECAP2_INGEST_KEY || '').trim();
  if (!sansEnvoi) {
    if (!base) pbEnvoi.push('RECAP2_INGEST_URL absente (crm-automation/.env) — ou passe --url https://…');
    else {
      let u = null;
      try { u = new URL(base); } catch (_) { pbEnvoi.push('URL de dépôt invalide : ' + base); }
      if (u && u.protocol !== 'https:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
        pbEnvoi.push('HTTPS exigé pour le dépôt (le rapport contient des noms de clients) : ' + base);
      }
    }
    if (cle.length < 16) pbEnvoi.push('RECAP2_INGEST_KEY absente ou trop courte (16 caractères minimum)');
  }
  if (!nav.ok || pbEnvoi.length) {
    nav.problemes.concat(pbEnvoi).forEach(ko);
    console.log('\n  Rien n\'a été collecté, rien n\'a été envoyé.');
    process.exit(1);
  }
  if (!sansEnvoi) ok('Dépôt configuré : ' + base);

  // ── 1. Collecte ───────────────────────────────────────────────────────────
  titre('2/4  Collecte — Deciplus ' + m1 + ' et ' + mois + ' (+ ventes ' + mois + '), Fitness Booster ' + mois);
  const source = path.join(DOSSIER_SORTIE, 'recap2-' + mois + '.json');
  let col = { code: 0 };
  const debut = Date.now();
  if (sansCollecte) ok('Sautée (--sans-collecte) — relecture de ' + path.basename(source));
  else {
    const optionsCollecte = process.argv.includes('--sans-deciplus') ? ['--sans-deciplus'] : [];
    col = lancer('recap2-collecte.js', [mois].concat(optionsCollecte));
  }
  if (!fs.existsSync(source)) {
    console.log('');
    ko(sansCollecte
      ? 'Aucun JSON à relire pour ' + mois + ' : ' + source
      : 'La collecte n\'a produit aucun fichier (' + source + ').');
    if (sansCollecte) info('Lance la commande sans --sans-collecte pour le produire.');
    process.exit(1);
  }
  let rapport;
  try { rapport = JSON.parse(fs.readFileSync(source, 'utf8')); }
  catch (e) { console.log(''); ko('JSON de collecte illisible : ' + e.message); process.exit(1); }
  if (col.code !== 0) info('(la collecte est sortie en code ' + col.code + ' — les contrôles vont dire pourquoi)');

  // ⚠️ NE JAMAIS PRENDRE UN ANCIEN FICHIER POUR UNE COLLECTE FRAÎCHE.
  // Si la collecte meurt AVANT d'écrire — navigateur tombé, CDP muet — le
  // fichier du mois est celui d'avant. Ses contrôles passeraient tous, et on
  // déposerait des chiffres périmés en croyant les avoir relevés à l'instant.
  // C'est le seul scénario où cette chaîne pouvait mentir : il est fermé ici.
  if (!sansCollecte) {
    const ecritLe = Date.parse(rapport.genere || '');
    if (!(ecritLe >= debut)) {
      console.log('');
      ko('La collecte n\'a rien écrit : le fichier du mois porte ' + (rapport.genere || 'aucune date')
        + ', antérieur au lancement.');
      info('Ce qui s\'y trouve décrit une collecte PRÉCÉDENTE — rien n\'est envoyé, rien n\'est affiché.');
      const diagnostic = path.join(DOSSIER_SORTIE, 'recap2-' + mois + '.echec.json');
      if (fs.existsSync(diagnostic)) info('Diagnostic de la collecte ratée : ' + diagnostic);
      console.log('\n' + trait('═'));
      console.log('  Mois              : ' + moisLabel(mois) + '  (' + mois + ', M-1 = ' + m1 + ')');
      console.log('  Studios           : 0 / ' + CTRL.LABELS.length + ' — la collecte n\'a pas abouti');
      console.log('  Alertes non bloq. : —');
      console.log('  Envoi             : ✗ collecte sans résultat');
      console.log(trait('═') + '\n');
      process.exit(1);
    }
  }
  // Une collecte d'un autre mois ne doit jamais être prise pour celle-ci.
  if (sansCollecte && rapport.mois !== mois) {
    console.log('');
    ko('Le fichier relu porte ' + rapport.mois + ', pas ' + mois + '.');
    process.exit(1);
  }

  // ── 2 et 3. Contrôles, puis résumé, AVANT tout envoi ──────────────────────
  const bilan = CTRL.analyser(rapport, mois);

  titre('3/4  Résultats — ' + moisLabel(mois));
  // Le 2e KPI n'a pas la même définition selon la règle métier du rapport : on
  // affiche le libellé de CELLE QUI A PRODUIT LES CHIFFRES, jamais l'autre.
  const v2 = bilan.version >= 2;
  const titre2 = v2 ? 'CLIENTS RETROUVÉS CRM' : 'COMPLÉTION (ancienne règle)';
  console.log('  ' + 'STUDIO'.padEnd(12) + 'NON-RECONDUCTION'.padEnd(26) + titre2);
  bilan.studios.forEach((s) => {
    const nr = s.nonReconduction;
    const gN = nr ? (pct(nr.taux) + '  (' + nr.nonReconduits + '/' + nr.base + ')') : '—';
    let g2 = '—';
    if (v2 && s.clientsRetrouves) {
      const cr = s.clientsRetrouves;
      g2 = pct(cr.taux) + '  (' + cr.retrouves + '/' + cr.signataires + ')';
    } else if (!v2 && s.completion) {
      const co = s.completion;
      g2 = pct(co.taux) + '  (' + co.ontPaye + '/' + co.contratsValides + ')';
    }
    console.log('  ' + s.studio.padEnd(12) + gN.padEnd(26) + g2);
  });

  console.log('');
  bilan.controles.forEach((c) => {
    if (c.ok) { ok(c.titre); return; }
    ko(c.titre + ' — ' + c.details.length + ' problème(s)');
    c.details.forEach((d) => info('· ' + d));
  });

  console.log('');
  if (!bilan.alertes.length) ok('Aucune alerte');
  else {
    console.log('  ⚠ ' + bilan.alertes.length + ' alerte' + (bilan.alertes.length > 1 ? 's' : '')
      + ' non bloquante' + (bilan.alertes.length > 1 ? 's' : '') + ' :');
    bilan.alertes.forEach((a) => info('· ' + a.studio + ' — ' + a.texte));
  }

  // ── 4. Envoi ──────────────────────────────────────────────────────────────
  titre('4/4  Envoi vers le serveur');
  let envoi = null;
  if (!bilan.peutEnvoyer) {
    ko('BLOQUÉ — ' + bilan.bloquants.map((b) => b.titre.toLowerCase()).join(', '));
    info('Le JSON reste en local : ' + source);
  } else if (sansEnvoi) {
    ok('Contrôles bloquants : tous passés');
    info('Envoi non demandé (--sans-envoi). Le JSON reste en local : ' + source);
  } else {
    ok('Contrôles bloquants : tous passés — envoi du JSON assaini (aucun CSV, aucun cookie)');
    console.log('');
    envoi = lancer('recap2-envoi.js', urlCible ? [mois, '--url', urlCible] : [mois]);
  }

  // ── Le mot de la fin, en quatre lignes ────────────────────────────────────
  const nbAlertes = bilan.alertes.length;
  const etatEnvoi = !bilan.peutEnvoyer ? '✗ bloqué par les contrôles'
    : sansEnvoi ? '— non demandé (--sans-envoi)'
      : (envoi && envoi.code === 0) ? '✓ succès' : '✗ échec';
  console.log('\n' + trait('═'));
  console.log('  Mois audité       : ' + moisLabel(mois) + '  (' + mois + ', base de ' + m1 + ')');
  console.log('  Studios           : ' + bilan.studios.filter((s) => s.nonReconduction && (v2 ? s.clientsRetrouves : s.completion)).length
    + ' / ' + CTRL.LABELS.length + ' avec leurs deux KPI');
  console.log('  Alertes non bloq. : ' + nbAlertes);
  console.log('  Envoi             : ' + etatEnvoi);
  console.log(trait('═') + '\n');

  process.exit(bilan.peutEnvoyer && (sansEnvoi || (envoi && envoi.code === 0)) ? 0 : 1);
})().catch((e) => { console.error('\nÉchec : ' + e.message); process.exit(1); });
