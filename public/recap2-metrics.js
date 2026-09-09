'use strict';
// ============================================================================
//  RECAP 2 — les DEUX métriques brutes, et rien d'autre.
//
//  Module PUR (aucune I/O, aucun DOM) : on lui passe des lignes DÉJÀ parsées
//  par le système RECAP existant (retention_imports) et il rend des nombres et
//  des listes. Chargé des deux côtés (UMD) : navigateur pour l'écran, Node pour
//  les tests.
//
//  ⚠️ VOLONTAIREMENT BRUT. Aucune qualification, aucun « NE », aucun « déjà
//  traité », aucun pack, aucun préavis, aucun ajustement manuel, aucun fichier
//  de résiliation n'entre ici. RECAP 2 répond à deux questions factuelles :
//    1. qui payait le mois dernier et ne paie plus ce mois-ci ?
//    2. parmi les contrats signés le mois dernier, lesquels ont payé ce mois-ci ?
//  Le moteur `retention.js` reste la référence de l'ancien RECAP (et de FAN /
//  BOSS) : on lui EMPRUNTE ses briques (clé client, agrégation, dédup des
//  signataires), on ne le modifie pas et on n'en refait pas une deuxième version.
// ============================================================================

(function (root, factory) {
  const R = (root && root.Retention) || (typeof require !== 'undefined' ? require('./retention.js') : null);
  const api = factory(R);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Recap2Metrics = api;
}(typeof self !== 'undefined' ? self : this, function (Retention) {

  // ── STUDIOS : les 6 studios en propre, dans l'ordre imposé ──────────────────
  // Table d'alias EXPLICITE : un nom de studio n'est reconnu que s'il figure
  // ici, à l'identique après normalisation. Aucun rapprochement approximatif —
  // « Ginkgo Sport », « Caen », « Tours », « Veigné », « Paris 15 » et tout
  // studio inconnu sont simplement ignorés (studioLabel -> null).
  const STUDIOS = [
    { label: 'Lille', alias: ['lille', 'vieuxlille', 'lillevieuxlille', 'mycoachlille', 'mycoachvieuxlille'] },
    { label: 'Wasquehal', alias: ['wasquehal', 'mycoachwasquehal'] },
    { label: 'Marcq', alias: ['marcq', 'marcqenbaroeul', 'mycoachmarcq', 'mycoachmarcqenbaroeul'] },
    { label: 'Boulogne', alias: ['boulogne', 'boulognebillancourt', 'mycoachboulogne', 'mycoachboulognebillancourt'] },
    { label: 'Levallois', alias: ['levallois', 'levalloisperret', 'mycoachlevallois', 'mycoachlevalloisperret'] },
    { label: 'Neuilly', alias: ['neuilly', 'neuillysurseine', 'mycoachneuilly', 'mycoachneuillysurseine'] },
  ];
  const LABELS = STUDIOS.map((s) => s.label);

  // Normalisation d'un nom de studio : minuscules, ligatures dépliées, sans
  // accents, sans ponctuation ni espaces. « Marcq-en-Barœul » -> marcqenbaroeul.
  function normStudio(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '');
  }
  // Index alias -> label, construit une fois.
  const INDEX = (() => {
    const m = new Map();
    STUDIOS.forEach((s) => s.alias.forEach((a) => m.set(normStudio(a), s.label)));
    return m;
  })();
  // Libellé d'affichage d'un studio source, ou null s'il n'est pas des nôtres.
  function studioLabel(nom) { return INDEX.get(normStudio(nom)) || null; }

  // ── Noms lisibles ──────────────────────────────────────────────────────────
  // Les lignes d'encaissement portent Nom/Prénom tels qu'exportés : on garde la
  // 1re graphie non vide rencontrée pour chaque clé. À défaut, la clé elle-même
  // (NOM|PRENOM) redonne les deux morceaux.
  function nomsDepuisLignes(lignes) {
    const m = new Map();
    (lignes || []).forEach((l) => {
      if (!l || !l.cle || m.has(l.cle)) return;
      if (l.nom || l.prenom) m.set(l.cle, { nom: String(l.nom || ''), prenom: String(l.prenom || '') });
    });
    return m;
  }
  function nomDeCle(cle, map) {
    const hit = map && map.get(cle);
    if (hit) return hit;
    const p = String(cle || '').split('|');
    return { nom: p[0] || '', prenom: p[1] || '' };
  }

  // ── INDICATEUR 1 — NON-RECONDUCTION ────────────────────────────────────────
  // Base   : clients UNIQUES dont le net M-1 > 0 (un client vu 5 fois = 1).
  // Perdus : parmi eux, ceux dont le net M <= 0 ou qui sont absents de M.
  // Le net est signé (un rejet annule son prélèvement) : c'est l'agrégation du
  // moteur existant, reprise telle quelle.
  function nonReconduction({ encM1, encM } = {}) {
    const agM1 = Retention.agregerParClient(encM1 || []);
    const agM = Retention.agregerParClient(encM || []);
    const noms = nomsDepuisLignes((encM1 || []).concat(encM || []));
    const nonReconduits = [];
    let base = 0;
    agM1.forEach((a, cle) => {
      if (!(a.net > 0)) return;          // n'a pas réellement payé en M-1 -> hors base
      base += 1;
      const aM = agM.get(cle);
      const netM = aM ? aM.net : 0;
      if (netM > 0) return;              // reconduit
      const n = nomDeCle(cle, noms);
      nonReconduits.push({ cle, nom: n.nom, prenom: n.prenom, netM1: a.net, netM });
    });
    nonReconduits.sort((x, y) => ((x.nom || '') + ' ' + (x.prenom || '')).localeCompare((y.nom || '') + ' ' + (y.prenom || ''), 'fr'));
    return {
      base,
      nb: nonReconduits.length,
      // Pas de dénominateur -> pas de taux. Jamais NaN, jamais un faux 0 %.
      taux: base > 0 ? nonReconduits.length / base : null,
      nonReconduits,
    };
  }

  // ── INDICATEUR 2 — COMPLÉTION DES NOUVEAUX CONTRATS ────────────────────────
  // Dénominateur : signataires UNIQUES de M-1 (dédup du moteur : deux contrats
  // au même jeu de clés candidates = une seule personne).
  // Numérateur   : ceux dont AU MOINS UNE clé candidate correspond à un client
  // au net M > 0 (le nom de fichier ne dit pas où s'arrête le prénom, d'où les
  // clés candidates ; une seule suffit, et on ne compte la personne qu'une fois).
  function completion({ contratsM1, encM } = {}) {
    const agM = Retention.agregerParClient(encM || []);
    const sig = Retention.dedupSignataires(contratsM1 || []);
    const contrats = sig.map((s) => {
      let netM = 0, cleMatch = null;
      (s.cles || []).forEach((k) => {
        const a = agM.get(k);
        if (a && a.net > netM) { netM = a.net; cleMatch = k; }
      });
      const prenom = Retention.titleCase(s.prenom || '');
      const nom = Retention.titleCase(s.nom || '');
      return { cle: cleMatch, nom, prenom, paye: netM > 0, netM, date: s.date || '' };
    });
    contrats.sort((x, y) => ((x.nom || '') + ' ' + (x.prenom || '')).localeCompare((y.nom || '') + ' ' + (y.prenom || ''), 'fr'));
    const nbPayes = contrats.filter((c) => c.paye).length;
    return {
      total: contrats.length,
      nbPayes,
      // Aucun contrat signé -> pas de dénominateur -> taux null (l'écran dira
      // « — » et « 0 nouveau contrat »), jamais 0 % ni NaN.
      taux: contrats.length > 0 ? nbPayes / contrats.length : null,
      contrats,
    };
  }

  // ── Assemblage d'un studio, disponibilité comprise ─────────────────────────
  // Convention d'entrée : `null` = import ABSENT (rien n'a jamais été déposé) ;
  // `[]` = import présent mais vide (ex. aucun contrat signé ce mois-là). Les
  // deux cas ne se disent pas pareil à l'écran, donc ils ne se confondent pas ici.
  function analyserStudio({ encM1, encM, contratsM1 } = {}) {
    const manqueNR = [];
    if (!Array.isArray(encM1)) manqueNR.push('encM1');
    if (!Array.isArray(encM)) manqueNR.push('encM');
    const manqueC = [];
    if (!Array.isArray(contratsM1)) manqueC.push('contratsM1');
    if (!Array.isArray(encM)) manqueC.push('encM');
    return {
      nonReconduction: manqueNR.length
        ? { dispo: false, manque: manqueNR }
        : Object.assign({ dispo: true }, nonReconduction({ encM1, encM })),
      completion: manqueC.length
        ? { dispo: false, manque: manqueC }
        : Object.assign({ dispo: true }, completion({ contratsM1, encM })),
    };
  }

  return { STUDIOS, LABELS, normStudio, studioLabel, nonReconduction, completion, analyserStudio };
}));
