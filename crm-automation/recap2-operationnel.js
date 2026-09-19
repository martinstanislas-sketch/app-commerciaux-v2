'use strict';
// ============================================================================
//  RECAP 2 — CONTRÔLE OPÉRATIONNEL AUTOMATIQUE (Prélèvement / Réservation /
//  Résilié) DES VENTES D'UN MOIS, EN LOCAL.
//
//  LECTURE SEULE : Deciplus lu par Id Deciplus fiable (lib/deciplusDossier.js),
//  règles appliquées par lib/recap2Operationnel.js, attributions décidées par
//  lib/recap2Attributions.js. Rien n'est écrit dans Deciplus, Vendor ni sur le
//  serveur : le résultat va dans .session/controle/operationnel-AAAA-MM.json.
//
//  Usage : node crm-automation/recap2-operationnel.js 2026-08 [--studio Lille] [--envoyer] [--url …]
//          node crm-automation/recap2-operationnel.js 2026-08 --sans-lecture --url …   (redépose le dernier résultat)
//  Prérequis : navigateur ouvert par open-crm.js (CRM_DEBUG_PORT=9222), Deciplus connecté.
// ============================================================================

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const M = require('../public/recap2-metrics.js');
const OP = require('../lib/recap2Operationnel.js');
const ATTR = require('../lib/recap2Attributions.js');
const DOSSIER = require('./lib/deciplusDossier.js');

const DOSSIER_CONTROLE = path.join(__dirname, '.session', 'controle');
const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : ''; };
const paris = () => new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Paris' }).replace(' ', 'T').slice(0, 16);

// Dépôt du résultat sur le serveur RECAP 2 (clé RECAP2_INGEST_KEY, comme recap2-envoi.js).
async function envoyer(mois, contenu) {
  const base = (arg('--url') || process.env.RECAP2_INGEST_URL || '').replace(/\/$/, '');
  const cle = process.env.RECAP2_INGEST_KEY || '';
  if (!base || !cle) throw new Error('RECAP2_INGEST_URL / RECAP2_INGEST_KEY absents');
  if (!/^https:\/\//.test(base) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) throw new Error('HTTPS exigé (sauf localhost)');
  const rep = await fetch(base + '/api/recap2/automatique/' + mois, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Recap2-Key': cle }, body: JSON.stringify(contenu) });
  const j = await rep.json().catch(() => null);
  if (!rep.ok) throw new Error('dépôt refusé (HTTP ' + rep.status + ') ' + JSON.stringify(j));
  console.log('✓ déposé sur ' + base + ' : ' + JSON.stringify(j));
}

(async () => {
  const mois = process.argv[2];
  if (process.argv.includes('--sans-lecture')) {
    // Aucun accès Deciplus : on (re)dépose le dernier résultat local.
    const f = path.join(DOSSIER_CONTROLE, 'operationnel-' + mois + '.json');
    await envoyer(mois, JSON.parse(fs.readFileSync(f, 'utf8')));
    process.exit(0);
  }
  if (!/^\d{4}-\d{2}$/.test(mois || '')) { console.error('Usage : node recap2-operationnel.js AAAA-MM [--studio X]'); process.exit(2); }
  const rapport = JSON.parse(fs.readFileSync(path.join(DOSSIER_CONTROLE, 'recap2-' + mois + '.json'), 'utf8'));
  const seul = arg('--studio');
  const maintenant = paris(), aujourdHui = maintenant.slice(0, 10);

  const nav = await chromium.connectOverCDP(process.env.CRM_DEBUG_URL || 'http://127.0.0.1:9222');
  const lecteur = await DOSSIER.ouvrir(nav.contexts()[0]);
  const cache = new Map();
  const resultats = [];
  try {
    for (const studio of M.LABELS.filter((s) => !seul || s === seul)) {
      for (const ligne of ((rapport.studios[studio] || {}).clientsRetrouves || {}).liste || []) {
        const ident = M.identifiantDeciplus(ligne);
        let verdict;
        if (ident.aTrancher) verdict = Object.assign(OP.evaluerVente(ligne, null, { aujourdHui }), { raison: 'identifiants Deciplus divergents — à trancher' });
        else if (!ident.id) verdict = Object.assign(OP.evaluerVente(ligne, null, { aujourdHui }), { raison: 'aucun identifiant Deciplus fiable' });
        else {
          if (!cache.has(ident.id)) {
            try { cache.set(ident.id, await lecteur.lireDossier(ident.id, { aujourdHui, maintenant })); }
            catch (e) { cache.set(ident.id, { ok: false, erreur: e.message.slice(0, 120) }); }
          }
          verdict = OP.evaluerVente(ligne, cache.get(ident.id), { aujourdHui });
        }
        const attribution = ATTR.attributionVente(mois, studio, ligne, ident.id);
        resultats.push({ studio, client: ligne.client, date: ligne.date, annulee: !!ligne.annulee, idDeciplus: ident.id, source: ident.source,
          prelevement: verdict.prelevement, reservation: verdict.reservation, resilie: verdict.resilie,
          alertes: verdict.alertes, regles: [...new Set(verdict.regles)], contrat: verdict.contrat, raison: verdict.raison,
          details: verdict.details || {}, attribution, controleLe: maintenant });
        console.log('· ' + studio + ' / ' + ligne.client + ' : ' + [verdict.prelevement, verdict.reservation, verdict.resilie].join(' / ')
          + (verdict.alertes.length ? ' — ' + verdict.alertes.join(' ; ') : '') + (verdict.raison ? ' — ' + verdict.raison : ''));
      }
    }
  } finally { await lecteur.fermer(); }
  const sortie = path.join(DOSSIER_CONTROLE, 'operationnel-' + mois + '.json');
  fs.writeFileSync(sortie, JSON.stringify({ mois, controleLe: maintenant, requetesBloquees: [...new Set(lecteur.bloques)], resultats }, null, 1));
  const n = (k, v) => resultats.filter((r) => r[k] === v).length;
  console.log('\nventes : ' + resultats.length
    + ' · Prélèvement ✅ ' + n('prelevement', 'ok') + ' ❌ ' + n('prelevement', 'ko') + ' ? ' + n('prelevement', 'a_verifier')
    + ' · Réservation ✅ ' + n('reservation', 'ok') + ' ❌ ' + n('reservation', 'ko') + ' ? ' + n('reservation', 'a_verifier')
    + ' · Résilié ✅ ' + n('resilie', 'ok') + ' ❌ ' + n('resilie', 'ko') + ' ? ' + n('resilie', 'a_verifier'));
  console.log('écrit : ' + sortie);
  if (process.argv.includes('--envoyer')) await envoyer(mois, JSON.parse(fs.readFileSync(sortie, 'utf8')));
  process.exit(0);
})().catch((e) => { console.error('Échec : ' + e.message); process.exit(1); });
