'use strict';
// ============================================================================
//  RECAP 2 — CA NET DU MOIS PAR STUDIO.
//
//  Un repère à côté du nom du studio, PAS un KPI. Ce qu'on prouve :
//   · il vaut tous les encaissements Deciplus du studio sur le mois audité,
//     remboursements et décaissements déduits, lignes sans adhérent comprises ;
//   · il vient du recomptage déjà fait par la collecte — aucune collecte de plus ;
//   · rien plutôt qu'un chiffre douteux (recomptage absent ou en échec) ;
//   · il ne dépend d'aucun commercial et ne touche à aucun KPI ;
//   · sur les exports RÉELS, il est égal au CSV brut recompté ligne à ligne.
// ============================================================================

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const M = require('../public/recap2-metrics.js');
const Store = require('../lib/recap2Store.js');

// Un recomptage de studio tel que la collecte l'écrit (csvEncaissements.controlerStudios).
const ctrl = (sommeBrute, extra = {}) => Object.assign({
  ok: true, problemes: [], lignesBrutes: 266, lignesParsees: 266,
  sommeBrute, sommeParsee: sommeBrute, lignesSansAdherent: 0, montantSansAdherent: 0, avertissements: [],
}, extra);
const rapportAvec = (mois, parStudio, autres = {}) => ({
  businessVersion: 2, mois, m1: '2026-07',
  source: Object.assign({ ['deciplus_' + mois]: { controleParStudio: parStudio } }, autres),
  studios: {},
});

test('CA = somme brute du mois audité, arrondie à l\'euro, milliers séparés', () => {
  const r = rapportAvec('2026-08', { Levallois: ctrl(22362.66) });
  assert.deepEqual(M.caNetStudio(r, 'Levallois'), { montant: 22362.66, lignes: 266, partielAu: null });
  assert.equal(M.eurosArrondis(22362.66), '22 363 €');
  assert.equal(M.eurosArrondis(999.49), '999 €');
  assert.equal(M.eurosArrondis(1234567.5), '1 234 568 €');
  assert.equal(M.eurosArrondis(0), '0 €');
  assert.equal(M.eurosArrondis(-0.2), '0 €', 'jamais « -0 € »');
  assert.equal(M.eurosArrondis(-1500), '−1 500 €');
});

test('les encaissements SANS adhérent sont dans le CA (écartés des KPI, mais encaissés)', () => {
  // Lille, juillet 2026 réel : 15 271 € avec adhérent + 225 € sans adhérent.
  const r = rapportAvec('2026-07', { Lille: ctrl(15271, { lignesBrutes: 257, lignesSansAdherent: 7, montantSansAdherent: 225 }) });
  r.m1 = '2026-06';
  assert.deepEqual(M.caNetStudio(r, 'Lille'), { montant: 15496, lignes: 264, partielAu: null });
});

test('mois non clos à la collecte : le CA dit jusqu\'où il va', () => {
  // Septembre 2026 collecté le 13/09 : l'export est filtré 01 → 30/09, mais ne contient que 13 jours.
  const sept = Object.assign(rapportAvec('2026-09', { Lille: ctrl(7405) }), { genere: new Date(2026, 8, 13, 20, 24).toISOString() });
  assert.equal(M.caNetStudio(sept, 'Lille').partielAu, '13/09');
  // Août collecté le 14/09 : mois clos, rien à signaler.
  const aout = Object.assign(rapportAvec('2026-08', { Lille: ctrl(14225.4) }), { genere: new Date(2026, 8, 14, 18, 43).toISOString() });
  assert.equal(M.caNetStudio(aout, 'Lille').partielAu, null);
  // Le dernier jour du mois, le soir : toujours partiel ; le 1er du mois suivant : clos.
  assert.equal(M.caNetStudio(Object.assign({}, aout, { genere: new Date(2026, 7, 31, 23, 30).toISOString() }), 'Lille').partielAu, '31/08');
  assert.equal(M.caNetStudio(Object.assign({}, aout, { genere: new Date(2026, 8, 1, 0, 5).toISOString() }), 'Lille').partielAu, null);
  // Décembre -> janvier de l'année suivante.
  const dec = Object.assign(rapportAvec('2026-12', { Lille: ctrl(1) }), { genere: new Date(2027, 0, 2, 9).toISOString() });
  assert.equal(M.caNetStudio(dec, 'Lille').partielAu, null);
  // Date de collecte illisible : on ne prétend rien.
  assert.equal(M.caNetStudio(Object.assign({}, aout, { genere: 'n\'importe quoi' }), 'Lille').partielAu, null);
});

test('le CA est celui du MOIS AUDITÉ, jamais celui de M-1', () => {
  const r = rapportAvec('2026-08', { Marcq: ctrl(14017.1) }, { 'deciplus_2026-07': { controleParStudio: { Marcq: ctrl(16346.1) } } });
  assert.equal(M.caNetStudio(r, 'Marcq').montant, 14017.1);
  // Le mois change -> le CA change, sans rien d'autre à faire.
  assert.equal(M.caNetStudio(Object.assign({}, r, { mois: '2026-07' }), 'Marcq').montant, 16346.1);
});

test('rien plutôt qu\'un chiffre douteux : recomptage absent, en échec, ou illisible', () => {
  assert.equal(M.caNetStudio(null, 'Lille'), null);
  assert.equal(M.caNetStudio({ mois: '2026-08', studios: {} }, 'Lille'), null, 'rapport sans source');
  assert.equal(M.caNetStudio(rapportAvec('2026-08', {}), 'Lille'), null, 'studio non recompté');
  assert.equal(M.caNetStudio(rapportAvec('2026-08', { Lille: ctrl(100, { ok: false, problemes: ['lignes perdues'] }) }), 'Lille'), null,
    'un recomptage en échec (lignes perdues, sommes divergentes) ne donne pas de CA');
  assert.equal(M.caNetStudio(rapportAvec('2026-08', { Lille: ctrl('100') }), 'Lille'), null, 'un montant non numérique');
  assert.equal(M.caNetStudio(rapportAvec('2026-08', { Lille: ctrl(NaN) }), 'Lille'), null);
  // Un vrai 0 € reste un 0 € : ce n'est pas une absence.
  assert.deepEqual(M.caNetStudio(rapportAvec('2026-08', { Lille: ctrl(0, { lignesBrutes: 2 }) }), 'Lille'), { montant: 0, lignes: 2, partielAu: null });
});

test('aucun KPI ne bouge : la fonction ne modifie pas le rapport', () => {
  const r = rapportAvec('2026-08', { Neuilly: ctrl(13971.93) });
  r.studios.Neuilly = { nonReconduction: { base: 65, nonReconduits: 16, taux: 16 / 65, tauxPct: 24.6, liste: [] },
    clientsRetrouves: { signataires: 12, retrouves: 12, taux: 1, tauxPct: 100, liste: [] } };
  const avant = JSON.stringify(r);
  M.caNetStudio(r, 'Neuilly');
  assert.equal(JSON.stringify(r), avant);
});

test('le dépôt garde le recomptage : un rapport nettoyé porte toujours de quoi afficher le CA', () => {
  const r = rapportAvec('2026-08', { Boulogne: ctrl(22152.11) });
  assert.equal(M.caNetStudio(Store.nettoyer(r), 'Boulogne').montant, 22152.11);
});

// ── L'ÉCRAN ────────────────────────────────────────────────────────────────
test('l\'écran : à côté du nom, jamais lié au commercial ni aux filtres', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'recap2.js'), 'utf8');
  const i = src.indexOf('function caStudio');
  assert.ok(i > 0, 'la fonction existe');
  const bloc = src.slice(i, src.indexOf('\n  }\n', i));
  assert.match(bloc, /MM\.caNetStudio\(rapport, label\)/, 'le calcul vient du module partagé');
  assert.match(bloc, /MM\.eurosArrondis/, 'arrondi à l\'euro');
  assert.match(bloc, /moisLabel\(rapport\.mois\)/, 'le libellé suit le mois du rapport');
  assert.match(bloc, /ca\.partielAu \? ' <i class="rec2-studio-ca-partiel">\(au '/, 'un CA partiel est dit à l\'écran, pas seulement au survol');
  assert.doesNotMatch(bloc, /commercial\b(?! sélectionné)/, 'aucune dépendance au commercial');
  assert.doesNotMatch(bloc, /filtre/i, 'aucune dépendance aux filtres');
  const bs = src.slice(src.indexOf('function blocStudio'), i);
  assert.match(bs, /rec2-studio-nom[\s\S]*caStudio\(label, b\)/, 'posé dans l\'en-tête du studio, après le nom');
  // Il est calculé AVANT l'aiguillage commercial : présent dans les deux vues.
  assert.equal((bs.match(/caStudio\(/g) || []).length, 1, 'un seul appel, commun à toutes les vues');
});

// ── SUR LES DONNÉES RÉELLES ────────────────────────────────────────────────
//  Recompte INDÉPENDANT du CSV brut : on ne passe ni par le parseur métier, ni
//  par controlerStudios(). Toutes les lignes du site, avec ou sans adhérent.
const SESSION = path.join(__dirname, '..', 'crm-automation', '.session');
const decouper = (l) => { const o = []; let c = '', q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (ch === '"') { if (q && l[i + 1] === '"') { c += '"'; i++; } else q = !q; } else if (ch === ';' && !q) { o.push(c); c = ''; } else c += ch; } o.push(c); return o; };
function recompterCsv(mois) {
  const txt = fs.readFileSync(path.join(SESSION, 'exports', 'encaissements-' + mois + '.csv'), 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lignes = txt.split('\n');
  const iE = lignes.findIndex((l) => /^"?Numéro"?\s*;/.test(l) && /Date d'encaissement/.test(l));
  const cols = decouper(lignes[iE]).map((c) => c.trim());
  const iSite = cols.indexOf('Site'), iMt = cols.indexOf('Montant encaissé');
  const out = {};
  lignes.slice(iE + 1).filter((l) => l.trim()).forEach((l) => {
    const v = decouper(l);
    const s = M.studioLabel(v[iSite]);
    if (!s) return;
    out[s] = (out[s] || 0) + (Number(String(v[iMt]).replace(/[\s ]/g, '').replace(',', '.')) || 0);
  });
  return out;
}
['2026-07', '2026-08'].forEach((mois) => {
  const rapportF = path.join(SESSION, 'controle', 'recap2-' + mois + '.json');
  const csvF = path.join(SESSION, 'exports', 'encaissements-' + mois + '.csv');
  const r = fs.existsSync(rapportF) ? JSON.parse(fs.readFileSync(rapportF, 'utf8')) : null;
  const memeCollecte = r && r.source && r.source['deciplus_' + mois] && fs.existsSync(csvF)
    && r.source['deciplus_' + mois].lignes === (() => { try { return require('../crm-automation/lib/csvEncaissements.js').parser(fs.readFileSync(csvF, 'utf8')).lignes.length; } catch (_) { return -1; } })();
  test(mois + ' réel : le CA de chaque studio = le CSV brut recompté, au centime',
    { skip: !memeCollecte && 'rapport et CSV du même export absents' }, () => {
      const brut = recompterCsv(mois);
      M.LABELS.forEach((s) => {
        const ca = M.caNetStudio(r, s);
        assert.ok(ca, s + ' : un CA');
        assert.ok(Math.abs(ca.montant - brut[s]) < 0.005, s + ' : ' + ca.montant + ' ≠ ' + brut[s].toFixed(2));
      });
    });
});

test('août 2026 réel : Levallois 22 363 €, Lille 14 225 €', {
  skip: !fs.existsSync(path.join(SESSION, 'controle', 'recap2-2026-08.json')) && 'rapport local absent',
}, () => {
  const r = JSON.parse(fs.readFileSync(path.join(SESSION, 'controle', 'recap2-2026-08.json'), 'utf8'));
  if (!r.source || !r.source['deciplus_2026-08'] || r.source['deciplus_2026-08'].lignes !== 3382) return; // autre export
  assert.equal(M.eurosArrondis(M.caNetStudio(r, 'Levallois').montant), '22 363 €');
  assert.equal(M.eurosArrondis(M.caNetStudio(r, 'Lille').montant), '14 225 €');
});
