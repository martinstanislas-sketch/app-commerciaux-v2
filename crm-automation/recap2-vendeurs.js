'use strict';
// ============================================================================
//  RECAP 2 — POSER LE VENDEUR D'ORIGINE SUR UN RAPPORT DÉJÀ COLLECTÉ.
//
//  La collecte mensuelle (recap2-collecte.js) le fait d'elle-même. Ce script
//  sert à enrichir un rapport EXISTANT sans refaire toute la collecte :
//    1) exporte de Deciplus les journaux des ventes manquants sur 24 mois
//       (lecture seule ; les mois déjà sur disque sont réutilisés) ;
//    2) pose `vendeurOrigine` sur les non-reconduits du JSON local
//       (.session/controle/recap2-AAAA-MM.json), sans toucher à rien d'autre ;
//    3) affiche un résumé SANS AUCUN NOM de client.
//  Le dépôt sur le serveur reste l'affaire de recap2-envoi.js.
//
//  Usage :
//    node crm-automation/recap2-vendeurs.js AAAA-MM                 (navigateur CRM ouvert, port 9222)
//    node crm-automation/recap2-vendeurs.js AAAA-MM --sans-deciplus (CSV déjà sur disque uniquement)
// ============================================================================

const fs = require('fs');
const path = require('path');
const M = require('../public/recap2-metrics.js');
const HISTO = require('./lib/historiqueVentes.js');
const ORIGINE = require('./lib/vendeurOrigine.js');

const DOSSIER_EXPORTS = path.join(__dirname, '.session', 'exports');
const DOSSIER_SORTIE = path.join(__dirname, '.session', 'controle');
const dire = (t) => console.log('[' + new Date().toISOString().slice(11, 19) + '] ' + t);

(async () => {
  const mois = process.argv[2];
  if (!/^\d{4}-\d{2}$/.test(mois || '')) { console.error('Usage : node recap2-vendeurs.js AAAA-MM [--sans-deciplus]'); process.exit(2); }
  const fichier = path.join(DOSSIER_SORTIE, 'recap2-' + mois + '.json');
  if (!fs.existsSync(fichier)) { console.error('Rapport introuvable : ' + fichier); process.exit(1); }

  if (!process.argv.includes('--sans-deciplus')) {
    const { chromium } = require('playwright');
    const DEC = require('./lib/deciplus.js');
    const REESSAI = require('./lib/reessai.js');
    const navigateur = await chromium.connectOverCDP(process.env.CRM_DEBUG_URL || 'http://127.0.0.1:9222');
    const page = navigateur.contexts()[0].pages().find((p) => p.url().includes('deciplus'));
    if (!page) throw new Error('Aucun onglet Deciplus ouvert (lance open-crm.js)');
    const r = await HISTO.exporterManquants({ page, mois, dossier: DOSSIER_EXPORTS, dire, DEC, REESSAI, tentatives: REESSAI.tentatives() });
    await DEC.reinitialiserFiltres(page);
    dire('exports : ' + r.exportes.length + ' mois' + (r.echecs.length ? ' — échecs : ' + r.echecs.join(', ') : ''));
    await navigateur.close().catch(() => {});
  }

  const h = HISTO.lire({ mois, dossier: DOSSIER_EXPORTS });
  const rapport = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  ORIGINE.poser(rapport, ORIGINE.indexer(h.lignes), h.historique);
  fs.writeFileSync(fichier + '.tmp', JSON.stringify(rapport, null, 2));
  fs.renameSync(fichier + '.tmp', fichier);

  // Résumé, sans nom de client.
  const bilan = { attribues: 0, horsTable: 0, ambigus: 0, introuvables: 0, sansId: 0 };
  const parCommercial = {};
  const vendeursHorsTable = {};
  Object.values(rapport.studios).forEach((b) => ((b.nonReconduction && b.nonReconduction.liste) || []).forEach((l) => {
    const a = M.attributionNonReconduit(l);
    if (a.mode === 'auto') { bilan.attribues++; parCommercial[a.nom] = (parCommercial[a.nom] || 0) + 1; return; }
    const o = l.vendeurOrigine;
    if (!o) bilan.sansId++;
    else if (o.ambigu) bilan.ambigus++;
    else if (o.introuvable) bilan.introuvables++;
    else { bilan.horsTable++; vendeursHorsTable[o.vendeur] = (vendeursHorsTable[o.vendeur] || 0) + 1; }
  }));
  dire('historique : ' + h.historique.du + ' → ' + h.historique.au + ', ' + h.historique.moisLus + ' mois lus, ' + h.historique.lignes + ' lignes'
    + (h.historique.manquants.length ? ' — manquants : ' + h.historique.manquants.join(', ') : ''));
  console.log(JSON.stringify({ bilan, parCommercial, vendeursHorsTable }, null, 1));
})().catch((e) => { console.error('Échec : ' + e.message); process.exit(1); });
