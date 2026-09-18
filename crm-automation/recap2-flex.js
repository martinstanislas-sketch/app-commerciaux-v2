'use strict';
// ============================================================================
//  RECAP 2 — CONTRÔLE « CHALLENGE FLEX » DES VNI D'UN MOIS, EN LECTURE SEULE.
//
//  À LA DEMANDE, jamais dans la collecte mensuelle : une fiche Vendor par VNI,
//  environ 30 secondes chacune. Le résultat part dans
//  .session/controle/flex-AAAA-MM.json, puis sur le serveur avec --envoyer.
//
//  CE QU'ON LIT SUR LA FICHE, SANS RIEN MODIFIER :
//   · les devis journalisés « Devis envoyé (Formule X) », datés — la preuve
//     structurée de ce qui a été proposé (54 fiches sur 60 en août) ;
//   · les notes libres « Rédigée par X le … » — signal d'appoint ;
//   · le statut actuel de la fiche (`statutVendor`) : « Client - Avec
//     Abonnement » classe la personne « Abonnement détecté dans Vendor »
//     (transformée, retirée des VNI à traiter) — seulement si la fiche est
//     celle de l'identifiant exact (règle de Stan, 2026-09-18).
//
//  ⚠️ IDENTITÉ EXIGÉE. La fiche est ouverte par RECHERCHE puis clic, et n'est
//  retenue que si l'URL porte l'identifiant de contact attendu. Une fiche
//  ouverte sur quelqu'un d'autre sort en « À vérifier » — jamais interprétée.
//  Constaté en août : 3 fiches sur 63 dans ce cas.
//
//  ⚠️ CE QUE LE CONTRÔLE NE DIT PAS. « Flex à proposer » ne prouve pas que
//  l'offre n'a jamais été évoquée : un Flex proposé oralement ne laisse aucune
//  trace. Le statut dit qu'il faut le proposer ou le reproposer.
//  « Transformé depuis » n'est PAS produit ici : c'est la règle VNI du serveur
//  (lib/recap2Vni.js) qui retire les personnes ayant signé depuis leur venue.
//
//  ⚠️ DONNÉES PERSONNELLES : on n'envoie que le nom déjà présent dans le
//  rapport et les extraits qui PROUVENT le Flex. Les autres notes sont lues,
//  jamais transmises.
//
//  Usage : node crm-automation/recap2-flex.js 2026-08 [--studio Neuilly] [--envoyer] [--url …]
//          node crm-automation/recap2-flex.js 2026-08 --reclasser             (règle changée, sans relire Vendor)
//          node crm-automation/recap2-flex.js 2026-08 --sans-lecture --url …   (redépose le dernier résultat)
//  Prérequis : navigateur ouvert par open-crm.js (CRM_DEBUG_PORT=9222), Vendor connecté.
// ============================================================================

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const FB = require('./lib/booster.js');
const FLEXLIB = require('../lib/recap2Flex.js');

const DOSSIER_CONTROLE = path.join(__dirname, '.session', 'controle');
const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : ''; };
const dire = (t) => console.log('[' + new Date().toISOString().slice(11, 19) + '] ' + t);
const paris = () => new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Paris' }).replace(' ', 'T').slice(0, 16);

// Le Challenge Flex, nommé. Les libellés « 4 coachings par mois » et « Pack 4
// coaching / mois » SONT le Flex (décision de Stan, 2026-09-18). Jamais
// « flexible », jamais « réflexion » : le mot doit être isolé.
const FLEX = /challenge\s*flex|(?:^|[^a-zéè])flex(?![a-z])|4\s*(?:s[ée]ances?|coachings?)\s*(?:\/|par|-)?\s*mois/i;

// Coordonnées masquées avant tout enregistrement.
const masquer = (t) => String(t || '')
  .replace(/[\w.+-]+@[\w.-]+\.\w+/g, '«email»')
  .replace(/(?:\+33|0033|\(33\))?[\s.]?[0-9](?:[\s.-]?[0-9]{2}){4}/g, '«tél»')
  .replace(/\d+\s+(rue|avenue|av\.|bd|boulevard|impasse|chemin|place|allée|résidence)[^\n]*/gi, '«adresse»');

async function envoyer(mois, contenu) {
  const base = (arg('--url') || process.env.RECAP2_INGEST_URL || '').replace(/\/$/, '');
  const cle = process.env.RECAP2_INGEST_KEY || '';
  if (!base || !cle) throw new Error('RECAP2_INGEST_URL / RECAP2_INGEST_KEY absents');
  if (!/^https:\/\//.test(base) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) throw new Error('HTTPS exigé (sauf localhost)');
  const rep = await fetch(base + '/api/recap2/flex/' + mois, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Recap2-Key': cle }, body: JSON.stringify(contenu) });
  const j = await rep.json().catch(() => null);
  if (!rep.ok) throw new Error('dépôt refusé (HTTP ' + rep.status + ') ' + JSON.stringify(j));
  dire('✓ déposé sur ' + base + ' : ' + JSON.stringify(j));
}

// Lit une fiche ouverte : devis, notes, et les preuves du Flex.
function analyser(volet) {
  const lignes = String(volet || '').split('\n').map((x) => x.trim());
  const devis = [];
  lignes.forEach((x, k) => { const m = /Devis envoyé \(([^)]*)\)?/.exec(x); if (m) devis.push({ quand: (lignes[k - 1] || '').trim(), texte: m[1].trim() }); });
  const notes = [];
  lignes.forEach((x, k) => { if (/^Rédigée par /.test(x)) notes.push({ quand: (lignes[k + 1] || '').trim(), texte: (lignes[k + 2] || '').trim() }); });
  const preuves = devis.filter((d) => FLEX.test(d.texte)).map((d) => ({ type: 'devis', quand: d.quand, texte: d.texte }))
    .concat(notes.filter((n) => FLEX.test(n.texte)).map((n) => ({ type: 'note', quand: n.quand, texte: n.texte })));
  return { devis: devis.length, notes: notes.length, preuves };
}

(async () => {
  const mois = process.argv[2];
  // Reclasse un résultat DÉJÀ collecté (mêmes fiches, même date de collecte)
  // après un changement de règle, sans relire Vendor.
  if (process.argv.includes('--reclasser')) {
    const f = path.join(DOSSIER_CONTROLE, 'flex-' + mois + '.json');
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    j.resultats.forEach((r) => { if (r.statut !== FLEXLIB.STATUTS.A_VERIFIER) r.statut = FLEXLIB.classer({ ouverte: true, statutVendor: r.statutVendor, preuves: r.preuves || [] }); });
    fs.writeFileSync(f, JSON.stringify(j, null, 1));
    const n = (s) => j.resultats.filter((x) => x.statut === s).length;
    dire('RECLASSÉ ' + JSON.stringify({ vni: j.resultats.length, propose: n(FLEXLIB.STATUTS.PROPOSE), aProposer: n(FLEXLIB.STATUTS.A_PROPOSER), aVerifier: n(FLEXLIB.STATUTS.A_VERIFIER), abonnesVendor: n(FLEXLIB.STATUTS.ABONNE_VENDOR) }));
    process.exit(0);
  }
  if (process.argv.includes('--sans-lecture')) {
    await envoyer(mois, JSON.parse(fs.readFileSync(path.join(DOSSIER_CONTROLE, 'flex-' + mois + '.json'), 'utf8')));
    process.exit(0);
  }
  if (!/^\d{4}-\d{2}$/.test(mois || '')) { console.error('Usage : node recap2-flex.js AAAA-MM [--studio X] [--envoyer]'); process.exit(2); }
  const rapport = JSON.parse(fs.readFileSync(path.join(DOSSIER_CONTROLE, 'recap2-' + mois + '.json'), 'utf8'));
  const seul = arg('--studio');
  const controleLe = paris();

  const cibles = [];
  Object.keys(rapport.studios || {}).forEach((s) => {
    if (seul && s !== seul) return;
    (((rapport.studios[s] || {}).vni || {}).liste || []).forEach((l) => {
      if (l.contactId) cibles.push({ studio: s, contactId: l.contactId, client: l.client });
    });
  });
  cibles.sort((a, b) => (a.studio === b.studio ? 0 : a.studio < b.studio ? -1 : 1)); // une bascule de club par studio
  dire(cibles.length + ' VNI à contrôler');

  const nav = await chromium.connectOverCDP(process.env.CRM_DEBUG_URL || 'http://127.0.0.1:9222');
  const page = await nav.contexts()[0].newPage();
  const resultats = [];
  let club = '';
  try {
    for (const c of cibles) {
      const r = { studio: c.studio, contactId: c.contactId, client: c.client, statut: FLEXLIB.STATUTS.A_VERIFIER, preuves: [], controleLe };
      try {
        if (club !== c.studio) {
          await page.goto('https://app.fitness-booster.fr/?menu=accueil', { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(6000);
          await FB.choisirClub(page, c.studio, () => {});
          club = c.studio;
        }
        await page.goto('https://app.fitness-booster.fr/?menu=sportifs&volet-lateral=&type=fiche-sportif', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(6000);
        await page.getByPlaceholder('Rechercher un contact', { exact: false }).first().fill(String(c.client || '').trim(), { timeout: 15000 });
        await page.waitForTimeout(5000);
        const mot = String(c.client || '').trim().split(/\s+/).filter(Boolean).pop() || String(c.client || '');
        const l = page.getByText(new RegExp(mot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
        const nb = await l.count();
        let ouverte = false;
        for (let i = nb - 1; i >= 0 && !ouverte; i--) {
          if (!(await l.nth(i).isVisible().catch(() => false))) continue;
          await l.nth(i).click({ timeout: 10000 }).catch(() => {});
          await page.waitForTimeout(8000);
          ouverte = new URL(page.url()).searchParams.get('sportif-lateral') === c.contactId;
        }
        if (!ouverte) { r.raison = 'fiche du contact attendu non ouverte'; resultats.push(r); dire(resultats.length + '/' + cibles.length + ' ⚠ ' + r.statut); continue; }
        await page.waitForTimeout(3000);
        // Le fil d'activités est TRONQUÉ : on déplie tout l'historique avant de
        // lire, sinon un devis ancien (début de mois) passe inaperçu.
        for (let k = 0; k < 15; k++) {
          const plus = page.getByText('Voir les activités précédentes', { exact: false }).last();
          if (!(await plus.isVisible().catch(() => false))) break;
          await plus.click({ timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(2500);
        }
        // Le VOLET seul : « Suivi par » n'existe que dans la fiche ouverte.
        // (« Création » ne convient pas : la LISTE a une colonne « Date de création ».)
        const volet = masquer(await page.evaluate(() => {
          const b = (document.body.innerText || '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n');
          const i = b.search(/Suivi par|Synchronisation CRM/i);
          return i > -1 ? b.slice(Math.max(0, i - 500)) : '';
        }));
        if (!volet) { r.raison = 'volet de fiche illisible'; resultats.push(r); dire(resultats.length + '/' + cibles.length + ' ⚠ ' + r.statut); continue; }
        const a = analyser(volet);
        // Le statut ACTUEL de la fiche. Le premier statut du volet est celui de
        // la fiche ; les suivants sont la liste déroulante.
        r.statutVendor = (volet.split('\n').map((x) => x.trim())
          .find((x) => /^(Client|Visiteur|Contact|RDV|Prospect)\s*-\s*/.test(x)) || '').slice(0, 80);
        r.preuves = a.preuves;
        r.statut = FLEXLIB.classer({ ouverte: true, statutVendor: r.statutVendor, preuves: a.preuves });
      } catch (e) { r.raison = e.message.slice(0, 140); }
      resultats.push(r);
      dire(resultats.length + '/' + cibles.length + ' ' + r.statut);
    }
  } finally {
    await page.close().catch(() => {});
  }

  const sortie = path.join(DOSSIER_CONTROLE, 'flex-' + mois + '.json');
  fs.mkdirSync(DOSSIER_CONTROLE, { recursive: true });
  fs.writeFileSync(sortie, JSON.stringify({ mois, controleLe, resultats }, null, 1));
  const n = (s) => resultats.filter((x) => x.statut === s).length;
  dire('RÉSUMÉ ' + JSON.stringify({ vni: resultats.length, propose: n(FLEXLIB.STATUTS.PROPOSE), aProposer: n(FLEXLIB.STATUTS.A_PROPOSER), aVerifier: n(FLEXLIB.STATUTS.A_VERIFIER), abonnesVendor: n(FLEXLIB.STATUTS.ABONNE_VENDOR) }));
  dire('écrit dans ' + sortie);
  if (process.argv.includes('--envoyer')) await envoyer(mois, JSON.parse(fs.readFileSync(sortie, 'utf8')));
  process.exit(0);
})().catch((e) => { console.error('Échec : ' + e.message); process.exit(1); });
