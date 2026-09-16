'use strict';
// ============================================================================
//  VENDOR — VÉRIFICATION DE LA BASCULE DE CLUB, EN LECTURE SEULE.
//
//  Enchaîne des bascules de club avec la fonction de la collecte
//  (lib/booster.js › choisirClub), puis RELIT le club actif sur une page
//  d'accueil rechargée : une bascule n'est réussie que si ce club relu est
//  exactement le club demandé.
//
//  ⚠️ LECTURE SEULE : aucune fiche ouverte (l'URL est contrôlée à chaque
//  étape), aucun champ rempli, aucun enregistrement. Seul le sélecteur de club
//  est manipulé — comme au début de chaque studio de la collecte.
//
//  Prérequis : navigateur ouvert par open-crm.js avec CRM_DEBUG_PORT=9222,
//  session Vendor connectée.
//
//  Usage :
//    node crm-automation/verifier-bascule-clubs.js
//        (défaut : Valence → Lille, Wasquehal, Marcq, Boulogne, Levallois,
//         Neuilly → Ginkgo Sport → Marcq, Wasquehal)
//    node crm-automation/verifier-bascule-clubs.js "Ginkgo Sport,Lille"
// ============================================================================

const { chromium } = require('playwright');
const FB = require('./lib/booster.js');

const DEFAUT = ['Valence', 'Lille', 'Wasquehal', 'Marcq', 'Boulogne', 'Levallois', 'Neuilly', 'Ginkgo Sport', 'Marcq', 'Wasquehal'];
const ACCUEIL = 'https://app.fitness-booster.fr/?menu=accueil';
const dire = (t) => console.log('[' + new Date().toISOString().slice(11, 19) + '] ' + t);
const sansFiche = (url) => !/sportif-lateral=\w/.test(url) && !/volet-lateral=show/.test(url);

(async () => {
  const suite = process.argv[2] ? process.argv[2].split(',').map((s) => s.trim()).filter(Boolean) : DEFAUT;
  for (const c of suite) if (!FB.libelleClub(c)) { console.error('Club inconnu : ' + c); process.exit(2); }

  const nav = await chromium.connectOverCDP(process.env.CRM_DEBUG_URL || 'http://127.0.0.1:9222');
  const page = nav.contexts()[0].pages().find((p) => p.url().includes('fitness-booster'));
  if (!page) throw new Error('Aucun onglet Vendor ouvert (lance open-crm.js sur app.fitness-booster.fr)');

  const lireActif = async () => {
    await page.goto(ACCUEIL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);
    return FB.clubAffiche(page);
  };
  dire('club actif au départ : ' + ((await lireActif()) || '— (illisible)'));

  const resultats = [];
  for (const club of suite) {
    const debut = Date.now();
    const r = { club, attendu: FB.clubAttendu(club), bascule: '', relu: '', ok: false, erreur: '' };
    try {
      await page.goto(ACCUEIL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(8000);
      r.bascule = await FB.choisirClub(page, club, dire);
      r.relu = await lireActif();
      r.ok = FB.verifierClub(r.relu, club) && sansFiche(page.url());
      if (!sansFiche(page.url())) r.erreur = 'une fiche semble ouverte : ' + page.url();
    } catch (e) {
      r.erreur = e.message.slice(0, 160);
      r.relu = await lireActif().catch(() => '');
    }
    r.secondes = Math.round((Date.now() - debut) / 1000);
    resultats.push(r);
    dire((r.ok ? '✅ ' : '❌ ') + club + ' : relu « ' + (r.relu || '—') + ' » (attendu « ' + r.attendu + ' »)'
      + (r.erreur ? ' — ' + r.erreur : '') + ' · ' + r.secondes + ' s');
  }

  const ko = resultats.filter((r) => !r.ok);
  console.log('\n===== BASCULE DE CLUB : ' + (resultats.length - ko.length) + '/' + resultats.length + ' vérifiée(s) =====');
  resultats.forEach((r) => console.log((r.ok ? '✅' : '❌') + ' ' + r.club.padEnd(13) + ' relu « ' + (r.relu || '—') + ' »'));
  process.exit(ko.length ? 1 : 0);
})().catch((e) => { console.error('Échec : ' + e.message); process.exit(1); });
