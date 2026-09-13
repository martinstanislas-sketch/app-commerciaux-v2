'use strict';
// ============================================================================
//  RECAP 2 — LE TEST QUI COMPTE : juin et juillet 2026, sur les vrais fichiers.
//
//  Il rejoue la collecte À PARTIR DES CSV DECIPLUS RÉELS déjà exportés et des
//  rapports déjà déposés en production, et il vérifie DEUX choses en même
//  temps, parce qu'elles ne valent qu'ensemble :
//
//    1. les alertes se réduisent    — juillet passe de 3 à 2 ;
//    2. AUCUN KPI NE BOUGE          — la non-reconduction recalculée depuis les
//       CSV est celle du rapport de production, au chiffre près, pour les six
//       studios et les deux mois.
//
//  Le point 2 est le garde-fou du point 1 : simplifier l'affichage n'a le droit
//  de rien changer aux chiffres. Le calcul passe par les MÊMES modules que la
//  collecte (public/recap2-metrics.js), jamais par une deuxième arithmétique.
//
//  ⚠️ LA COMPLÉTION N'EST PAS REJOUABLE HORS LIGNE, et on ne fait pas semblant :
//  son dénominateur vient de Fitness Booster, qui n'a pas d'export. Le détail
//  nominatif du rapport ne peut pas le remplacer — il porte des noms déjà mis en
//  forme, dont on ne peut plus retrouver les clés d'origine. Ses compteurs sont
//  donc RELUS tels quels et vérifiés contre les valeurs validées ; ce qui est
//  rejoué, c'est l'alerte qu'on en tire.
//
//  Sauté si .session/exports/ ou .session/controle/ sont absents (autre machine).
// ============================================================================
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const CSV = require('../lib/csvEncaissements.js');
const CTRL = require('../lib/recap2Controles.js');
const M = require('../../public/recap2-metrics.js');
const R = require('../../public/retention.js');
const Store = require('../../lib/recap2Store.js');

const EXPORTS = path.join(__dirname, '..', '.session', 'exports');
const CONTROLE = path.join(__dirname, '..', '.session', 'controle');
const csvDe = (ym) => path.join(EXPORTS, 'encaissements-' + ym + '.csv');
const jsonDe = (ym) => path.join(CONTROLE, 'recap2-' + ym + '.json');
const csvsLa = (mois, m1) => fs.existsSync(csvDe(mois)) && fs.existsSync(csvDe(m1));
// ⚠️ Un fichier n'est pas une référence. Une collecte ratée laisse un rapport
// sans le moindre KPI : le prendre pour la production ferait échouer les tests
// pour une raison qui n'a rien à voir avec le code. On exige qu'il soit VALIDE.
function prodValide(mois) {
  if (!fs.existsSync(jsonDe(mois))) return null;
  let j = null;
  try { j = JSON.parse(fs.readFileSync(jsonDe(mois), 'utf8')); } catch (_) { return null; }
  // Structurellement valide ne suffit pas : une collecte ratée écrit un rapport
  // conforme et vide. La référence, c'est un rapport qui PARTIRAIT.
  return CTRL.analyser(j, mois).peutEnvoyer ? j : null;
}

// …et les CSV doivent être du même millésime que ce rapport, sinon on compare
// deux relevés différents et l'échec ne dit rien du code. Le rapport note le
// nombre de lignes qu'il a lues : c'est notre repère.
function memeMillesime(mois, m1) {
  const prod = prodValide(mois);
  if (!prod) return false;
  return [m1, mois].every((ym) => {
    const src = (prod.source || {})['deciplus_' + ym];
    if (!src || typeof src.lignes !== 'number') return false;
    return CSV.parser(fs.readFileSync(csvDe(ym), 'utf8')).lignes.length === src.lignes;
  });
}
const dispo = (mois, m1) => csvsLa(mois, m1) && !!prodValide(mois);
const comparable = (mois, m1) => dispo(mois, m1) && memeMillesime(mois, m1);

// Rejoue la partie Deciplus de la collecte, à l'identique, avec les règles
// d'alerte d'aujourd'hui.
function rejouer(mois, prod) {
  const m1 = prod.m1;
  const opt = { studios: M.LABELS, studioLabel: M.studioLabel };
  const enc = {}, ctrl = {}, source = {};
  [m1, mois].forEach((ym) => {
    const texte = fs.readFileSync(csvDe(ym), 'utf8');
    const p = CSV.parser(texte);
    const ecartees = CSV.lignesEcartees(texte, opt);
    const v = CSV.verifier(p, { moisAttendu: ym, studiosAttendus: M.LABELS, studioLabel: M.studioLabel, ecartees });
    ctrl[ym] = CSV.controlerStudios(texte, p, { moisAttendu: ym, studios: M.LABELS, studioLabel: M.studioLabel });
    source['deciplus_' + ym] = { avertissements: v.avertissements, ecartGlobal: v.ecartGlobal };
    enc[ym] = p.lignes;
  });

  const studios = {};
  M.LABELS.forEach((studio) => {
    const avertissements = [];
    [m1, mois].forEach((ym) => {
      (ctrl[ym][studio].avertissements || []).forEach((a) => avertissements.push(ym === mois ? a : ym + ' : ' + a));
    });
    const nr = M.nonReconduction({
      encM1: CSV.vueParId(enc[m1], studio, M.studioLabel),
      encM: CSV.vueParId(enc[mois], studio, M.studioLabel),
    });
    // Complétion : compteurs relus du rapport (voir l'avertissement en tête de
    // fichier), alerte de doublons recalculée avec la règle d'aujourd'hui.
    const co = (prod.studios[studio] || {}).completion || null;
    if (co) {
      const msg = CTRL.messageDoublons(co.contratsBruts || co.contratsValides, co.contratsValides);
      if (msg) avertissements.push(msg);
    }
    studios[studio] = { studio, avertissements, nonReconduction: nr, completion: co };
  });
  return { mois, m1, source, studios };
}

const alertesDe = (rejeu) => {
  const l = [];
  M.LABELS.forEach((s) => rejeu.studios[s].avertissements.forEach((t) => l.push({ studio: s, texte: t })));
  Object.keys(rejeu.source).forEach((k) => rejeu.source[k].avertissements.forEach((t) => l.push({ studio: k, texte: t })));
  return l;
};
const pct1 = (t) => (t == null ? null : +(t * 100).toFixed(1));

// ─── L'INVARIANT : UN PHÉNOMÈNE, UNE ALERTE ────────────────────────────────
//  Ce test ne dépend d'AUCUN chiffre relevé un jour donné. Les exports changent
//  (un remboursement passe, une écriture est rattachée) — la règle, elle, ne
//  change pas :
//    · si l'écart global est entièrement expliqué par des lignes sans adhérent
//      qui tombent dans le périmètre, AUCUNE alerte globale n'est émise ;
//    · chaque lot de lignes sans adhérent est signalé EXACTEMENT une fois.
['2026-05', '2026-06', '2026-07'].forEach((ym) => {
  test('export réel ' + ym + ' : un phénomène ne peut produire qu\'une alerte', { skip: !fs.existsSync(csvDe(ym)) && 'CSV absent' }, () => {
    const texte = fs.readFileSync(csvDe(ym), 'utf8');
    const p = CSV.parser(texte);
    const ec = CSV.lignesEcartees(texte, { studios: M.LABELS, studioLabel: M.studioLabel });
    const v = CSV.verifier(p, { moisAttendu: ym, studiosAttendus: M.LABELS, studioLabel: M.studioLabel, ecartees: ec });
    const c = CSV.controlerStudios(texte, p, { moisAttendu: ym, studios: M.LABELS, studioLabel: M.studioLabel });

    // ⚠️ /écart/ attrape aussi « écartés du calcul » : on vise le message global.
    const parleDEcart = v.avertissements.filter((a) => /^écart de /.test(a));
    if (v.ecartGlobal.explique) {
      assert.deepEqual(parleDEcart, [], 'écart expliqué : plus rien à en dire');
    } else {
      assert.equal(parleDEcart.length, 1, 'un résidu inexpliqué se dit une fois');
      assert.match(parleDEcart[0], /inexpliqué/);
    }

    // Autant d'alertes « sans adhérent » que de lots réels : celles des studios
    // du périmètre, plus AU PLUS une pour tout ce qui tombe hors périmètre.
    const alertesStudio = M.LABELS.filter((st) => c[st].lignesSansAdherent > 0);
    alertesStudio.forEach((st) => assert.equal(c[st].avertissements.length, 1, st + ' : une seule alerte'));
    const alertesHors = v.avertissements.filter((a) => /hors des 6 studios/.test(a));
    assert.equal(alertesHors.length, ec.horsPerimetre.lignes > 0 && v.ecartGlobal.explique ? 1 : 0);

    // Et le total dit exactement ce que le fichier contient, au centime.
    const dit = alertesStudio.reduce((n, st) => n + c[st].lignesSansAdherent, 0) + ec.horsPerimetre.lignes;
    assert.equal(dit, ec.sansAdherent.lignes, 'aucune ligne écartée n\'est passée sous silence');
  });
});

// ─── LES DEUX FORMULATIONS, AU CARACTÈRE PRÈS ──────────────────────────────
test('juillet 2026 : « 7 encaissements sans adhérent (225 €) écartés du calcul », chez Lille et nulle part ailleurs',
  { skip: !fs.existsSync(csvDe('2026-07')) && 'CSV absent' }, () => {
    const texte = fs.readFileSync(csvDe('2026-07'), 'utf8');
    const p = CSV.parser(texte);
    const ec = CSV.lignesEcartees(texte, { studios: M.LABELS, studioLabel: M.studioLabel });
    const v = CSV.verifier(p, { moisAttendu: '2026-07', studiosAttendus: M.LABELS, studioLabel: M.studioLabel, ecartees: ec });
    const c = CSV.controlerStudios(texte, p, { moisAttendu: '2026-07', studios: M.LABELS, studioLabel: M.studioLabel });
    assert.deepEqual(c.Lille.avertissements, ['7 encaissements sans adhérent (225 €) écartés du calcul']);
    M.LABELS.filter((st) => st !== 'Lille').forEach((st) => assert.deepEqual(c[st].avertissements, [], st));
    assert.deepEqual(v.avertissements, [], 'l\'écart global de 225 € ne se répète plus');
  });

test('mai 2026 : hors périmètre -> une alerte qui se comprend, aucune alerte studio',
  { skip: !fs.existsSync(csvDe('2026-05')) && 'CSV absent' }, () => {
    const texte = fs.readFileSync(csvDe('2026-05'), 'utf8');
    const p = CSV.parser(texte);
    const ec = CSV.lignesEcartees(texte, { studios: M.LABELS, studioLabel: M.studioLabel });
    const v = CSV.verifier(p, { moisAttendu: '2026-05', studiosAttendus: M.LABELS, studioLabel: M.studioLabel, ecartees: ec });
    assert.deepEqual(v.avertissements,
      ['3 encaissements sans adhérent (49,95 €) écartés du calcul, hors des 6 studios — sans effet sur les KPI']);
  });

test('le message de doublons est celui qu\'on veut lire', () => {
  assert.equal(CTRL.messageDoublons(14, 13), '1 doublon de contrat détecté, calcul effectué sur 13 signataires uniques');
  assert.equal(CTRL.messageDoublons(6, 5), '1 doublon de contrat détecté, calcul effectué sur 5 signataires uniques');
});

// ─── LE GARDE-FOU : AUCUN KPI NE BOUGE ──────────────────────────────────────
[['2026-06', '2026-05'], ['2026-07', '2026-06']].forEach(([mois, m1]) => {
  test(mois + ' : les 6 non-reconductions recalculées depuis les CSV sont IDENTIQUES à la production', { skip: !comparable(mois, m1) && 'pas de rapport de production du même millésime que les CSV' }, () => {
    const prod = JSON.parse(fs.readFileSync(jsonDe(mois), 'utf8'));
    const rejeu = rejouer(mois, prod);
    M.LABELS.forEach((s) => {
      const p = prod.studios[s], r = rejeu.studios[s];
      assert.equal(r.nonReconduction.base, p.nonReconduction.base, s + ' base');
      assert.equal(r.nonReconduction.nb, p.nonReconduction.nonReconduits, s + ' non-reconduits');
      assert.equal(pct1(r.nonReconduction.taux), p.nonReconduction.tauxPct, s + ' taux non-reconduction');
      // Le détail nominatif aussi : autant de noms que de non-reconduits.
      assert.equal(r.nonReconduction.nonReconduits.length, p.nonReconduction.liste.length, s + ' détail');
    });
  });
});

// ─── Les chiffres nommément exigés, écrits en clair ─────────────────────────
const ATTENDU = {
  '2026-06': { Wasquehal: { nr: [5, 71, 7.0], comp: [9, 11, 81.8] } },
  '2026-07': { Wasquehal: { nr: [11, 78, 14.1], comp: [10, 13, 76.9] } },
};
Object.keys(ATTENDU).forEach((mois) => {
  const m1 = mois === '2026-06' ? '2026-05' : '2026-06';
  test('Wasquehal ' + mois + ' : non-reconduction et complétion inchangées', { skip: !comparable(mois, m1) && 'pas de rapport de production du même millésime que les CSV' }, () => {
    const prod = JSON.parse(fs.readFileSync(jsonDe(mois), 'utf8'));
    const r = rejouer(mois, prod).studios.Wasquehal;
    const a = ATTENDU[mois].Wasquehal;
    // Non-reconduction : RECALCULÉE depuis le CSV, pas relue.
    assert.deepEqual([r.nonReconduction.nb, r.nonReconduction.base, pct1(r.nonReconduction.taux)], a.nr);
    // Complétion : relue du rapport, et elle doit valoir ce qui a été validé.
    assert.deepEqual([r.completion.ontPaye, r.completion.contratsValides, r.completion.tauxPct], a.comp);
  });
});
