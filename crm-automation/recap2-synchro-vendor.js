'use strict';
// ============================================================================
//  VNI INTROUVABLES DANS DECIPLUS — FORCER LA SYNCHRONISATION CRM DANS VENDOR.
//
//  ⚠️⚠️ SEUL SCRIPT DU PROJET QUI ÉCRIT DANS UN CRM, et seulement avec
//  --appliquer. Sans ce drapeau il ne fait que REGARDER et classer.
//  La collecte mensuelle ne l'appelle jamais.
//
//  CE QU'ON FORCE, ET RIEN D'AUTRE (règle validée par Stan le 2026-09-16) :
//  la fenêtre de Vendor dit que la synchronisation a pu échouer pour trois
//  raisons — email déjà dans Deciplus, même nom/prénom/date de naissance, ou
//  fiche déjà présente dans un autre club — et demande de ne forcer que « s'il
//  s'agit bien de la même personne ». Forcer, c'est donc VALIDER UNE IDENTITÉ.
//  On n'automatise que le cas où la fiche porte le motif EXACT
//  « l'email y est déjà existant » : l'email est un identifiant fort.
//  Tous les autres motifs (et toute fiche dont on ne lit pas le motif) partent
//  en VÉRIFICATION MANUELLE, jamais en clic automatique.
//
//  DÉROULÉ PAR PERSONNE (consigne de Stan) :
//   1. ouvrir sa fiche Vendor (recherche par nom, puis clic sur la ligne) ;
//   2. lire « Synchronisation CRM » : ✅ -> rien à faire ; ⚠️ -> on continue ;
//   3. si le motif est l'email : ouvrir le panneau, « Forcer la synchronisation » ;
//   4. attendre, relire l'état ; recommencer au plus 3 fois ;
//   5. 3 tentatives sans coche verte = ANOMALIE à vérifier à la main ;
//   6. après la coche verte, RECHERCHER la personne dans Deciplus (écran
//      Membres, identité exacte et unique) : c'est ce qui dit si elle y est
//      vraiment. Sans cela on ne conclut pas.
//
//  Le compte rendu est écrit dans .session/controle/synchro-vendor-AAAA-MM.json
//  et résumé au terminal : synchronisations forcées, personnes concernées,
//  dossiers restés en erreur.
//
//  Usage :
//    node crm-automation/recap2-synchro-vendor.js 2026-08              (regarde et classe)
//    node crm-automation/recap2-synchro-vendor.js 2026-08 --appliquer  (force les cas « email »)
//    … --max 3   (ne traiter que les N premières personnes)
// ============================================================================

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const M = require('../public/recap2-metrics.js');
const V = require('./lib/vendorSynchro.js');
const DEC = require('./lib/deciplus.js');
const MEMBRES = require('./lib/deciplusMembres.js');
const FB = require('./lib/booster.js');

const DOSSIER = path.join(__dirname, '.session', 'controle');
const dire = (t) => console.log('[' + new Date().toISOString().slice(11, 19) + '] ' + t);
const MOTIF_EMAIL = /email\s+y\s+est\s+d[ée]j[àa]\s+existant/i;
const arg = (nom, defaut) => { const i = process.argv.indexOf(nom); return i > -1 ? process.argv[i + 1] : defaut; };

// Le texte de la fiche ouverte dans le volet latéral.
const texteFiche = (page) => page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' '));
// « Synchronisation CRM … » : les 30 caractères qui suivent la mention.
function extraitSynchro(texte) {
  const i = String(texte).search(/Synchronisation CRM/i);
  return i > -1 ? String(texte).slice(i, i + 30) : '';
}

// Ouvre la fiche d'un contact par la recherche (Bubble : pas d'URL directe).
const URL_CONTACTS = 'https://app.fitness-booster.fr/?menu=sportifs&volet-lateral=&type=fiche-sportif';
async function ouvrirFiche(page, client) {
  // ⚠️ REVENIR À LA LISTE D'ABORD : un volet latéral resté ouvert recouvre le
  // champ de recherche, et le clic expire sans rien dire.
  await page.goto(URL_CONTACTS, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);
  const champ = page.getByPlaceholder('Rechercher un contact', { exact: false }).first();
  await champ.fill(client, { timeout: 15000 });
  await page.waitForTimeout(5000);
  const ligne = page.getByText(client, { exact: false }).last();
  if (!(await ligne.isVisible().catch(() => false))) return false;
  await ligne.click({ timeout: 10000 });
  await page.waitForTimeout(7000);
  const t = await texteFiche(page);
  return /Synchronisation CRM/i.test(t);
}

// UN clic sur « Forcer la synchronisation », dans le panneau ouvert depuis la
// mention. ⚠️ On ne vise QUE le bouton nommé : « Supprimer ce contact » est
// juste à côté sur la fiche.
async function forcerUneFois(page) {
  const mention = page.locator('.clickable-element', { hasText: /^Synchronisation CRM/ }).first();
  if (await mention.isVisible().catch(() => false)) {
    await mention.click({ timeout: 10000 });
    await page.waitForTimeout(4000);
  }
  const bouton = page.getByRole('button', { name: 'Forcer la synchronisation', exact: true }).first();
  if (!(await bouton.isVisible().catch(() => false))) throw new Error('bouton « Forcer la synchronisation » absent');
  await bouton.click({ timeout: 10000 });
  await page.waitForTimeout(6000);
}

(async () => {
  const mois = process.argv[2];
  if (!/^\d{4}-\d{2}$/.test(mois || '')) { console.error('Usage : node recap2-synchro-vendor.js AAAA-MM [--appliquer] [--max N]'); process.exit(2); }
  const appliquer = process.argv.includes('--appliquer');
  const max = Number(arg('--max', '0')) || 0;
  const fichier = path.join(DOSSIER, 'recap2-' + mois + '.json');
  if (!fs.existsSync(fichier)) { console.error('Rapport introuvable : ' + fichier); process.exit(1); }
  const rapport = JSON.parse(fs.readFileSync(fichier, 'utf8'));

  const cibles = V.aSynchroniser(M.vniDuRapport(rapport).liste);
  dire((appliquer ? 'MODE ÉCRITURE' : 'lecture seule (ajoute --appliquer pour forcer)')
    + ' · ' + cibles.length + ' VNI sans Id Deciplus sur ' + mois);

  const navigateur = await chromium.connectOverCDP(process.env.CRM_DEBUG_URL || 'http://127.0.0.1:9222');
  const contexte = navigateur.contexts()[0];
  const page = contexte.pages().find((p) => p.url().includes('fitness-booster'));
  if (!page) throw new Error('Aucun onglet Vendor ouvert (lance open-crm.js sur app.fitness-booster.fr)');
  // ⚠️ FENÊTRE : sous ~1000 px de large, Vendor passe en disposition réduite et
  // le sélecteur de club ne s'ouvre pas du tout. Le navigateur sans fenêtre
  // démarre en 800 × 600 : on l'agrandit avant toute bascule.
  try {
    const cdp = await page.context().newCDPSession(page);
    const { windowId } = await cdp.send('Browser.getWindowForTarget');
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { width: 1600, height: 1000 } });
    await page.waitForTimeout(2000);
    dire('fenêtre Vendor : ' + (await page.evaluate(() => innerWidth + ' × ' + innerHeight)));
  } catch (e) {
    dire('⚠️ fenêtre non agrandie (' + e.message.slice(0, 60) + ') — la bascule de club peut échouer');
  }
  const clubActif = (await texteFiche(page)).slice(0, 60);
  dire('Vendor : ' + clubActif.split('Accueil')[0].trim());

  let recherche = null;
  const resultats = [];
  const liste = max ? cibles.slice(0, max) : cibles;
  // Club par club : une fiche n'est trouvable que dans le club actif de Vendor.
  const parStudio = new Map();
  liste.forEach((l) => { if (!parStudio.has(l.studio)) parStudio.set(l.studio, []); parStudio.get(l.studio).push(l); });
  for (const [studio, gens] of parStudio) {
  try {
    // ⚠️ Le sélecteur de club ne s'ouvre pas depuis l'écran Contacts (le volet
    // et la liste interceptent le clic sur le bloc « My Coach … »). On revient
    // à l'accueil d'abord, comme le fait la collecte.
    await page.goto('https://app.fitness-booster.fr/?menu=accueil', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);
    await FB.choisirClub(page, studio, dire);
    dire('club Vendor : ' + studio + ' (' + gens.length + ' fiche(s))');
  } catch (e) {
    dire('⚠️ club ' + studio + ' non atteint (' + e.message.slice(0, 80) + ') — ces fiches restent à vérifier à la main');
    gens.forEach((l) => resultats.push({ studio, contactId: l.contactId, client: l.client, tentatives: 0, etatFinal: 'club-non-atteint', idClientApres: '', motif: 'changement de club impossible — vérification manuelle' }));
    continue;
  }
  for (const l of gens) {
    const res = { studio: l.studio, contactId: l.contactId, client: l.client, tentatives: 0, etatFinal: 'inconnu', idClientApres: '', motif: '' };
    try {
      if (!(await ouvrirFiche(page, l.client))) {
        res.etatFinal = 'fiche-introuvable';
        res.motif = 'fiche non trouvée dans le club actif de Vendor — à vérifier à la main';
        resultats.push(res); dire('· ' + l.studio + ' / ' + l.client + ' : ' + res.motif); continue;
      }
      let texte = await texteFiche(page);
      res.etatFinal = V.etatSynchro(extraitSynchro(texte));
      if (res.etatFinal === 'ok') {
        res.motif = 'déjà synchronisée, rien à forcer';
      } else if (res.etatFinal !== 'avertissement') {
        res.motif = 'état de synchronisation illisible — à vérifier à la main';
      } else if (!MOTIF_EMAIL.test(texte)) {
        res.motif = 'motif autre que l\'email (homonyme, date de naissance, autre club) — vérification manuelle';
      } else if (!appliquer) {
        res.motif = 'motif email : à forcer (relancer avec --appliquer)';
      } else {
        // Le seul cas automatisé : email déjà existant dans Deciplus.
        while (res.tentatives < V.MAX_TENTATIVES && res.etatFinal !== 'ok') {
          res.tentatives += 1;
          await forcerUneFois(page);
          texte = await texteFiche(page);
          res.etatFinal = V.etatSynchro(extraitSynchro(texte));
          dire('· ' + l.studio + ' / ' + l.client + ' : tentative ' + res.tentatives + ' -> ' + res.etatFinal);
        }
        if (res.etatFinal !== 'ok') res.motif = V.MAX_TENTATIVES + ' tentatives sans coche verte — anomalie à vérifier à la main';
      }
      // Étape 6 : la coche verte ne prouve rien tant qu'on n'a pas regardé Deciplus.
      if (res.etatFinal === 'ok') {
        if (!recherche) recherche = await MEMBRES.ouvrirRecherche(contexte, DEC.garde);
        const fiche = await recherche.chercher(l.client, l.studio, M.studioLabel);
        res.idClientApres = fiche ? fiche.idClient : '';
        if (!res.motif) res.motif = fiche ? 'synchronisée et retrouvée dans Deciplus' : 'synchronisée mais introuvable dans Deciplus (identité non unique ou absente)';
      }
    } catch (e) {
      res.etatFinal = res.etatFinal === 'ok' ? 'ok' : 'erreur';
      res.motif = e.message.slice(0, 160);
    }
    resultats.push(res);
    dire('· ' + l.studio + ' / ' + l.client + ' : ' + res.etatFinal + (res.idClientApres ? ' · Id Deciplus ' + res.idClientApres : '') + (res.motif ? ' — ' + res.motif : ''));
  }
  }
  if (recherche) await recherche.fermer();

  const b = V.bilan(resultats);
  const sortie = path.join(DOSSIER, 'synchro-vendor-' + mois + '.json');
  fs.writeFileSync(sortie, JSON.stringify({ mois, mode: appliquer ? 'appliquer' : 'lecture', fait: new Date().toISOString(), bilan: b }, null, 1));
  console.log('\n===== SYNCHRONISATION VENDOR ' + mois + ' =====');
  console.log(JSON.stringify({ traitees: b.traitees, synchronisationsForcees: b.synchronisationsForcees, reussies: b.reussies,
    relieesDansDeciplus: b.reliees, synchroSansFiche: b.synchroSansFiche.length, anomalies: b.anomalies.length }, null, 1));
  const parMotif = {};
  resultats.forEach((r) => { parMotif[r.motif || r.etatFinal] = (parMotif[r.motif || r.etatFinal] || 0) + 1; });
  console.log('par motif :', JSON.stringify(parMotif, null, 1));
  console.log('compte rendu : ' + sortie);
  process.exit(0);
})().catch((e) => { console.error('Échec : ' + e.message); process.exit(1); });
