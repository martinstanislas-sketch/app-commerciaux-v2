'use strict';
// ============================================================================
//  RECAP 2 — CONTRÔLE DES NON-RECONDUITS D'UN MOIS, EN LECTURE SEULE.
//
//  Pour chaque non-reconduit du rapport (et chaque membre suspendu repéré sans
//  risque hors de la liste) : lecture du dossier Deciplus en GET (liste
//  blanche, garde-fou lib/deciplus.js), analyse par le moteur déterministe
//  lib/recap2NrAnalyse.js, puis — seulement pour une résiliation avant la fin
//  de l'engagement — lecture du contrat signé dans Vendor (rapprochement par
//  l'Id Deciplus de la fiche Vendor, JAMAIS par le nom) et recoupement de
//  l'encaissé avec le journal des encaissements Deciplus.
//
//  ⚠️ AUCUNE ÉCRITURE dans Deciplus ni dans Vendor. Le journal des
//  encaissements manquant est EXPORTÉ comme le fait la collecte mensuelle.
//  ⚠️ LES NOTES RESTENT SUR LE MAC : le dépôt ne contient que le résultat du
//  moteur (statut, cause, indication courte générée, remarques issues des
//  gabarits). Aucun journal ne recopie une note.
//
//  Usage : node crm-automation/recap2-nr-controle.js 2026-08 [--studio Lille] [--envoyer] [--url …]
//          node crm-automation/recap2-nr-controle.js 2026-08 --sans-lecture --url …   (redépose le dernier résultat)
//  Prérequis : navigateur ouvert par open-crm.js (CRM_DEBUG_PORT=9222), Deciplus et Vendor connectés.
// ============================================================================

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const DEC = require('./lib/deciplus.js');
const D = require('./lib/deciplusDossier.js');
const FB = require('./lib/booster.js');
const CSV = require('./lib/csvEncaissements.js');
const A = require('../lib/recap2NrAnalyse.js');
const M = require('../public/recap2-metrics.js');

const DOSSIER_CONTROLE = path.join(__dirname, '.session', 'controle');
const DOSSIER_EXPORTS = path.join(__dirname, '.session', 'exports');
const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : ''; };
const dire = (t) => console.log('[' + new Date().toISOString().slice(11, 19) + '] ' + t);
const paris = () => new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Paris' }).replace(' ', 'T').slice(0, 16);
const moisEntre = (debut, fin) => { const out = []; let [a, m] = debut.split('-').map(Number); const [a2, m2] = fin.split('-').map(Number);
  while (a < a2 || (a === a2 && m <= m2)) { out.push(a + '-' + String(m).padStart(2, '0')); m += 1; if (m > 12) { m = 1; a += 1; } } return out; };

async function envoyer(mois, contenu) {
  const base = (arg('--url') || process.env.RECAP2_INGEST_URL || '').replace(/\/$/, '');
  const cle = process.env.RECAP2_INGEST_KEY || '';
  if (!base || !cle) throw new Error('RECAP2_INGEST_URL / RECAP2_INGEST_KEY absents');
  if (!/^https:\/\//.test(base) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) throw new Error('HTTPS exigé (sauf localhost)');
  const rep = await fetch(base + '/api/recap2/nr-controle/' + mois, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Recap2-Key': cle }, body: JSON.stringify(contenu) });
  const j = await rep.json().catch(() => null);
  if (!rep.ok) throw new Error('dépôt refusé (HTTP ' + rep.status + ') ' + JSON.stringify(j));
  dire('✓ déposé sur ' + base + ' : ' + JSON.stringify(j));
}

// ── JOURNAL DES ENCAISSEMENTS (recoupement de « Total encaissé ») ───────────
const journaux = new Map();
function journalDuMois(ym) {
  if (journaux.has(ym)) return journaux.get(ym);
  const f = path.join(DOSSIER_EXPORTS, 'encaissements-' + ym + '.csv');
  const v = fs.existsSync(f) ? CSV.parser(fs.readFileSync(f, 'utf8')).lignes : null;
  journaux.set(ym, v);
  return v;
}
// Somme des lignes « échéance » du membre sur la période du contrat (arrêt + 31 j).
function journalContrat(idClient, ref) {
  if (!ref || !ref.debut) return null;
  const finP = ref.resiliation || ref.fin || '';
  const borne = new Date(Date.parse(finP) + 31 * 86400000).toISOString().slice(0, 10);
  const mois = moisEntre(ref.debut.slice(0, 7), borne.slice(0, 7));
  let net = 0, remb = 0, n = 0;
  for (const ym of mois) {
    const l = journalDuMois(ym);
    if (!l) return { couvert: false };
    l.filter((x) => x.idMembre === String(idClient) && /ch[ée]ance/i.test(x.note)).forEach((x) => {
      const iso = x.date.split('/').reverse().join('-');
      if (iso < ref.debut || iso > borne) return;
      net += x.montant; n += 1;
      if (x.montant < 0 && /rembours|d[ée]caissement/i.test(x.note)) remb += -x.montant;
    });
  }
  return { couvert: true, net: Math.round(net * 100) / 100, remboursements: Math.round(remb * 100) / 100, lignes: n };
}

// ── VENDOR : LE CONTRAT SIGNÉ, PAR ID DECIPLUS ──────────────────────────────
//  Une page « ventes » par studio et par mois, mise en cache. Le prix Vendor est
//  HEBDOMADAIRE ; le total n'est calculé que si la durée est connue sans
//  approximation (jours d'engagement, ou années) ; sinon : non fiable, dit.
const ventesVendor = new Map();
async function ventesDuMois(page, studio, ym) {
  const k = studio + '|' + ym;
  if (ventesVendor.has(k)) return ventesVendor.get(k);
  const ventes = new Map(), formules = new Map();
  const capte = async (r) => {
    if (!/\/elasticsearch\/|\/api\/1\.1\//.test(r.url())) return;
    try {
      const w = (o) => { if (!o || typeof o !== 'object') return; const s = o._source || o;
        if (o._type === 'custom.commerciaux_vente') ventes.set(o._id, { contact: s.sportif_custom_sportif, prix: s.formule_prix_number, engagement: s.engagement_text || '', formule: s.formule_custom_club_formule, nom: s.formule_nom_text || '' });
        if (o._type === 'custom.club_formule') formules.set(o._id, { n: s.engagement_nombre_number, unite: s.engagement_mois_annee_option_temps_formule || '', jours: s.engagement_jours_number });
        Object.values(o).forEach(w); };
      w(JSON.parse(await r.text()));
    } catch (_) { /* réponse non JSON */ }
  };
  page.on('response', capte);
  let res = null;
  try {
    // Comme le contrôle Flex : l'accueil Vendor d'abord, sinon le sélecteur de club n'est pas prêt.
    await page.goto('https://app.fitness-booster.fr/?menu=accueil', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    res = await FB.lireStudio(page, studio, ym, () => {});
  } catch (e) { dire('Vendor ' + studio + ' ' + ym + ' : ' + e.message.slice(0, 80)); }
  finally { page.off('response', capte); }
  // Lien vente → Id Deciplus par l'IDENTIFIANT DE LA VENTE (exact) : le champ
  // contact de l'objet vente est une référence « …__LOOKUP__… » à précision
  // tronquée, inutilisable pour un rapprochement.
  const parVente = new Map();
  ((res && res.contrats) || []).forEach((c) => { if (c.venteId && c.idDeciplusVendor) parVente.set(c.venteId, c.idDeciplusVendor); });
  const out = [...ventes.entries()].map(([id, v]) => Object.assign({}, v, { idDeciplus: parVente.get(id) || '', formuleDet: formules.get(v.formule) || null }));
  const lu = { ok: !!res, ventes: out };
  if (process.env.NR_DEBUG) dire('Vendor ' + studio + ' ' + ym + ' : ' + out.length + ' vente(s) captée(s), ' + out.filter((v) => v.idDeciplus).length + ' reliée(s) à un Id Deciplus, ' + ((res && res.contrats) || []).length + ' contrat(s) au tableau');
  ventesVendor.set(k, lu);
  return lu;
}
const totalVendor = A.totalContratVendor;

async function vendorPour(page, studio, idClient, ref) {
  if (!page || !ref || !ref.vendu) return { fiable: false, motif: 'date de vente inconnue' };
  const ym = ref.vendu.slice(0, 7);
  const lu = await ventesDuMois(page, studio, ym);
  if (!lu.ok) return { fiable: false, motif: 'ventes Vendor illisibles pour ' + ym };
  const cand = lu.ventes.filter((v) => v.idDeciplus === String(idClient));
  if (!cand.length) return { fiable: false, motif: 'vente non retrouvée dans Vendor (' + ym + ')' };
  const tot = cand.map((v) => totalVendor(v, ref.valeurInitiale)).filter((t) => t.fiable);
  if (!tot.length) return totalVendor(cand[0], ref.valeurInitiale);
  if (new Set(tot.map((t) => t.total)).size > 1) return { fiable: false, motif: 'plusieurs ventes Vendor possibles' };
  return tot[0];
}

// ── SUSPENSIONS HORS LISTE : candidats repérés SANS aucune lecture risquée ──
//  Ventes du mois (identifiants du rapport) + membres classés « Clients en
//  suspension » dans les journaux de ventes déjà exportés (3 derniers mois).
function candidatsSuspension(rapport, mois) {
  const nr = new Set();
  Object.values(rapport.studios || {}).forEach((b) => (((b.nonReconduction || {}).liste) || []).forEach((l) => { if (l.idClient) nr.add(String(l.idClient)); }));
  const out = new Map();
  Object.keys(rapport.studios || {}).forEach((s) => (((rapport.studios[s].clientsRetrouves || {}).liste) || []).forEach((l) => {
    const id = String(M.identifiantDeciplus ? (M.identifiantDeciplus(l).id || '') : (l.idClient || ''));
    if (/^\d{1,20}$/.test(id) && !nr.has(id)) out.set(id, { studio: s, idClient: id, client: l.client });
  }));
  const [a, m] = mois.split('-').map(Number);
  [0, 1, 2].forEach((k) => {
    const d = new Date(Date.UTC(a, m - 1 - k, 1)).toISOString().slice(0, 7);
    const f = path.join(DOSSIER_EXPORTS, 'ventes-' + d + '.csv');
    if (!fs.existsSync(f)) return;
    const brutes = fs.readFileSync(f, 'utf8').replace(/^﻿/, '').split(/\r?\n/);
    const iE = brutes.findIndex((l) => /Num\. vente/.test(l) && /Id_client/.test(l));
    if (iE < 0) return;
    const col = {}; CSV.decouper(brutes[iE]).forEach((c, i) => { col[c.trim()] = i; });
    brutes.slice(iE + 1).forEach((l) => {
      const v = CSV.decouper(l);
      if (!/suspension/i.test(v[col['Catégorie']] || '')) return;
      const id = (v[col['Id_client']] || '').trim(); const studio = M.studioLabel ? M.studioLabel(v[col['Site']] || '') : '';
      if (/^\d{1,20}$/.test(id) && studio && !nr.has(id) && !out.has(id)) out.set(id, { studio, idClient: id, client: (v[col['Adhérent']] || '').trim() });
    });
  });
  return [...out.values()];
}

(async () => {
  const mois = process.argv[2];
  if (process.argv.includes('--sans-lecture')) {
    await envoyer(mois, JSON.parse(fs.readFileSync(path.join(DOSSIER_CONTROLE, 'nr-' + mois + '.json'), 'utf8')));
    process.exit(0);
  }
  if (!/^\d{4}-\d{2}$/.test(mois || '')) { console.error('Usage : node recap2-nr-controle.js AAAA-MM [--studio X] [--envoyer]'); process.exit(2); }
  const rapport = JSON.parse(fs.readFileSync(path.join(DOSSIER_CONTROLE, 'recap2-' + mois + '.json'), 'utf8'));
  const seul = arg('--studio');
  const controleLe = paris();
  const aujourdHui = controleLe.slice(0, 10);

  const nav = await chromium.connectOverCDP(process.env.CRM_DEBUG_URL || 'http://127.0.0.1:9222');
  const ctx = nav.contexts()[0];
  // Journal des encaissements : les mois manquants sont exportés (lecture seule),
  // 18 mois en arrière — la durée d'un engagement long + marge.
  const [a0, m0] = mois.split('-').map(Number);
  const debutJ = new Date(Date.UTC(a0, m0 - 19, 1)).toISOString().slice(0, 7);
  const manquants = moisEntre(debutJ, aujourdHui.slice(0, 7)).filter((ym) => !fs.existsSync(path.join(DOSSIER_EXPORTS, 'encaissements-' + ym + '.csv')));
  if (manquants.length && !process.argv.includes('--sans-export')) {
    const p = ctx.pages().find((x) => /deciplus\.pro/.test(x.url())) || await ctx.newPage();
    for (const ym of manquants) {
      // Après un export, l'écran garde un état qui fait échouer le suivant une
      // fois sur deux : on recharge et on retente une fois.
      for (let essai = 1; essai <= 2; essai++) {
        try { dire('export journal des encaissements ' + ym + (essai > 1 ? ' (nouvel essai)' : '')); await DEC.exporterMois(p, ym, DOSSIER_EXPORTS, () => {}); break; }
        catch (e) {
          dire('export ' + ym + ' impossible : ' + e.message.slice(0, 100));
          await p.goto(DEC.garde('https://ginkgo-sport.deciplus.pro/nextgen/home'), { waitUntil: 'domcontentloaded' }).catch(() => {});
          await p.waitForTimeout(5000);
        }
      }
    }
  }

  const o = await D.ouvrir(ctx);
  const vpage = await ctx.newPage();
  const resultats = [];
  const limites = new Set(['avoirs non lisibles dans Deciplus : tout calcul financier reste à confirmer']);
  const cibles = [];
  Object.keys(rapport.studios || {}).forEach((s) => { if (seul && s !== seul) return;
    (((rapport.studios[s].nonReconduction || {}).liste) || []).forEach((l) => cibles.push({ type: 'nr', studio: s, ligne: l })); });
  cibles.sort((x, y) => (x.studio < y.studio ? -1 : x.studio > y.studio ? 1 : 0));
  dire(cibles.length + ' non-reconduits à contrôler');
  try {
    for (const c of cibles) {
      const l = c.ligne;
      const d = l.idClient ? await o.lireDossierNR(l.idClient, { aujourdHui }) : null;
      let r = A.analyser({ ligne: l, mois, aujourdHui, dossier: d });
      if (r.finance && d && d.ok) {
        const ref = A.references(d.contrats, mois)[0] || d.contrats.filter((k) => /TERMINATED|CANCELED|EXPIRED/.test(k.etat)).sort((x, y) => (y.resiliation || '').localeCompare(x.resiliation || ''))[0];
        const vendor = await vendorPour(vpage, c.studio, l.idClient, ref).catch((e) => ({ fiable: false, motif: 'lecture Vendor : ' + e.message.slice(0, 60) }));
        const journal = journalContrat(l.idClient, ref);
        if (journal && !journal.couvert) limites.add('journal des encaissements incomplet pour certains contrats');
        r = A.analyser({ ligne: l, mois, aujourdHui, dossier: d, vendor, journal });
      }
      resultats.push({ type: 'nr', studio: c.studio, idClient: l.idClient || '', client: l.client, controleLe, analyse: r });
      dire(resultats.length + '/' + cibles.length + ' ' + r.statut + (r.remarques.length ? ' · ' + r.remarques.length + ' remarque(s)' : ''));
    }
    const susp = seul ? [] : candidatsSuspension(rapport, mois);
    dire(susp.length + ' membre(s) hors liste à vérifier pour une suspension');
    for (const s of susp) {
      const d = await o.lireDossierNR(s.idClient, { aujourdHui });
      if (!d || !d.ok) continue;
      const r = A.analyser({ ligne: s, mois, aujourdHui, dossier: d, mode: 'suspension' });
      // Hors liste, seule une VRAIE suspension est retenue (un contentieux n'a
      // rien à faire dans cette liste : il ne porte aucune remarque).
      if (r.suspension && /^(suspendu|a_traiter)$/.test(r.statut)) resultats.push({ type: 'suspension', studio: s.studio, idClient: s.idClient, client: s.client, controleLe, analyse: r });
    }
  } finally {
    await vpage.close().catch(() => {});
    if (o.bloques.length) dire('⚠ requêtes bloquées par le garde-fou : ' + [...new Set(o.bloques)].join(' | '));
    await o.fermer();
  }

  const sortie = path.join(DOSSIER_CONTROLE, 'nr-' + mois + '.json');
  fs.mkdirSync(DOSSIER_CONTROLE, { recursive: true });
  fs.writeFileSync(sortie, JSON.stringify({ mois, controleLe, resultats, limites: [...limites], requetesBloquees: [...new Set(o.bloques)] }, null, 1));
  const n = {}; resultats.forEach((x) => { const k = x.type + ':' + (x.analyse.statut || '—'); n[k] = (n[k] || 0) + 1; });
  dire('RÉSUMÉ ' + JSON.stringify(n));
  dire('écrit dans ' + sortie);
  if (process.argv.includes('--envoyer')) await envoyer(mois, JSON.parse(fs.readFileSync(sortie, 'utf8')));
  process.exit(0);
})().catch((e) => { console.error('Échec : ' + e.message); process.exit(1); });
