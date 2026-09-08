'use strict';
// ============================================================================
//  RECAP 2 — écran minimal : 6 studios, 2 chiffres chacun.
//
//  VUE DE LECTURE PURE sur les données déjà archivées par RECAP :
//    • GET /api/retention/<M>    -> encaissements de M
//    • GET /api/retention/<M-1>  -> encaissements ET contrats de M-1
//  Aucun import, aucune écriture, aucune route ni table nouvelle. RECAP,
//  FAN et BOSS ne sont ni lus ni modifiés par ce fichier.
//
//  Le calcul vit dans recap2-metrics.js (module pur, testé) ; ici, seulement
//  l'orchestration et le rendu.
// ============================================================================

const Recap2UI = (function () {
  const $ = (s) => document.querySelector(s);
  const T = () => (window.localStorage.getItem('authToken') || '');
  const H = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + T() });
  const M = () => window.Recap2Metrics;

  let mois = '', m1 = '';
  let inited = false;
  let etat = 'vide';        // 'vide' | 'chargement' | 'ok' | 'erreur'
  let parStudio = {};       // label -> { encM, encM1, contratsM1 }  (null = import absent)
  let resultats = {};       // label -> retour de analyserStudio
  let ouvert = '';          // détail ouvert : '<label>|nr' ou '<label>|comp' (un seul à la fois)
  let filtreComp = {};      // label -> 'tous' | 'payes' | 'nonpayes'

  function open() {
    if (!inited) { wire(); inited = true; }
    if (!$('#rec2-mois').value) $('#rec2-mois').value = moisParDefaut();
    mois = $('#rec2-mois').value;
    m1 = RetentionParse.moisPrecedent(mois);
    charger();
  }

  function wire() {
    $('#rec2-mois').addEventListener('change', () => {
      mois = $('#rec2-mois').value;
      m1 = RetentionParse.moisPrecedent(mois);
      ouvert = '';
      charger();
    });
    // Un seul écouteur délégué pour tout l'écran (cartes, fermeture, filtres).
    $('#rec2-body').addEventListener('click', onBodyClick);
  }

  // Mois par défaut = dernier mois calendaire révolu (même règle que RECAP).
  function moisParDefaut() {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function moisLabel(ym) {
    const [a, m] = String(ym || '').split('-').map(Number);
    if (!a || !m) return ym || '';
    return new Date(a, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }
  const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

  // ── CHARGEMENT ──────────────────────────────────────────────────────────────
  async function charger() {
    etat = 'chargement'; resultats = {}; parStudio = {}; render();
    try {
      const [dM, dM1] = await Promise.all([
        fetch('/api/retention/' + mois, { headers: H() }).then((r) => r.json()),
        fetch('/api/retention/' + m1, { headers: H() }).then((r) => r.json()),
      ]);
      construire(dM, dM1);
      calculer();
      etat = 'ok';
    } catch (_) { etat = 'erreur'; }
    render();
  }

  // Range les imports sous le libellé simple du studio. Un studio inconnu de la
  // table d'alias (Ginkgo Sport, franchises…) est ignoré, sans bruit.
  function construire(dM, dM1) {
    parStudio = {};
    const cellule = (label) => parStudio[label] || (parStudio[label] = { encM: null, encM1: null, contratsM1: null });
    const ajouter = (label, champ, contenu) => {
      const c = cellule(label);
      c[champ] = (c[champ] || []).concat(Array.isArray(contenu) ? contenu : []);
    };
    ((dM && dM.importsM) || []).forEach((im) => {
      const label = M().studioLabel(im.studio);
      if (label && im.type === 'encaissements') ajouter(label, 'encM', im.contenu);
    });
    ((dM1 && dM1.importsM) || []).forEach((im) => {
      const label = M().studioLabel(im.studio);
      if (!label) return;
      if (im.type === 'encaissements') ajouter(label, 'encM1', im.contenu);
      else if (im.type === 'contrats') ajouter(label, 'contratsM1', im.contenu);
    });
  }
  function calculer() {
    resultats = {};
    M().LABELS.forEach((label) => {
      const src = parStudio[label] || { encM: null, encM1: null, contratsM1: null };
      resultats[label] = M().analyserStudio(src);
    });
  }

  // ── RENDU ───────────────────────────────────────────────────────────────────
  const pct = (x) => (x == null ? '—' : (x * 100).toFixed(1).replace('.', ',') + ' %');
  const eur = (n) => (Number(n) || 0).toFixed(2).replace('.', ',') + ' €';
  const nomAff = (x) => ((x.prenom || '') + ' ' + (x.nom || '')).trim() || '—';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // Libellé humain d'un import manquant.
  function manqueTxt(codes) {
    const t = {
      encM1: 'Encaissements ' + moisLabel(m1) + ' manquants',
      encM: 'Encaissements ' + moisLabel(mois) + ' manquants',
      contratsM1: 'Contrats ' + moisLabel(m1) + ' manquants',
    };
    return (codes || []).map((c) => t[c] || 'Données manquantes').join(' · ');
  }

  function render() {
    const host = $('#rec2-body'); if (!host) return;
    $('#rec2-sub').textContent = mois
      ? 'Passage ' + moisLabel(m1) + ' → ' + moisLabel(mois) + ' · 6 studios en propre'
      : '';
    if (etat === 'chargement') { host.innerHTML = '<p class="rec2-info">Chargement…</p>'; return; }
    if (etat === 'erreur') { host.innerHTML = '<p class="rec2-info rec2-info-err">Lecture impossible (réseau).</p>'; return; }
    host.innerHTML = M().LABELS.map(blocStudio).join('');
  }

  function blocStudio(label) {
    const r = resultats[label] || {};
    return '<section class="rec2-studio">'
      + '<h3 class="rec2-studio-nom">' + esc(label.toUpperCase()) + '</h3>'
      + '<div class="rec2-cards">' + carteNR(label, r.nonReconduction) + carteComp(label, r.completion) + '</div>'
      + detail(label)
      + '</section>';
  }

  function carte(label, ind, titre, valeur, sous, actif, cliquable) {
    const tag = cliquable ? 'button' : 'div';
    const attrs = cliquable
      ? ' type="button" data-open="' + esc(label) + '|' + ind + '" aria-expanded="' + (actif ? 'true' : 'false') + '"'
      : '';
    return '<' + tag + ' class="rec2-card' + (actif ? ' is-open' : '') + (cliquable ? '' : ' is-na') + '"' + attrs + '>'
      + '<span class="rec2-card-lbl">' + titre + '</span>'
      + '<span class="rec2-card-val">' + valeur + '</span>'
      + '<span class="rec2-card-sub">' + sous + '</span>'
      + (cliquable ? '<span class="rec2-card-hint">' + (actif ? 'Masquer le détail' : 'Voir le détail') + '</span>' : '')
      + '</' + tag + '>';
  }

  function carteNR(label, d) {
    if (!d || !d.dispo) return carte(label, 'nr', 'NON-RECONDUCTION', '—', esc(manqueTxt(d && d.manque)), false, false);
    const sous = d.base > 0
      ? d.nb + ' / ' + d.base + ' client' + (d.base > 1 ? 's' : '')
      : 'aucun client prélevé en ' + esc(moisLabel(m1));
    return carte(label, 'nr', 'NON-RECONDUCTION', pct(d.taux), sous, ouvert === label + '|nr', d.base > 0);
  }
  function carteComp(label, d) {
    if (!d || !d.dispo) return carte(label, 'comp', 'COMPLÉTION', '—', esc(manqueTxt(d && d.manque)), false, false);
    const sous = d.total > 0
      ? d.nbPayes + ' / ' + d.total + ' nouveau' + (d.total > 1 ? 'x' : '') + ' contrat' + (d.total > 1 ? 's' : '')
      : '0 nouveau contrat';
    return carte(label, 'comp', 'COMPLÉTION', pct(d.taux), sous, ouvert === label + '|comp', d.total > 0);
  }

  // ── DÉTAILS (fermés par défaut, un seul ouvert à la fois) ────────────────────
  function detail(label) {
    if (ouvert === label + '|nr') return detailNR(label);
    if (ouvert === label + '|comp') return detailComp(label);
    return '';
  }
  const detailHead = (titre) => '<div class="rec2-det-head"><span>' + titre + '</span>'
    + '<button type="button" class="rec2-det-x" data-close="1" aria-label="Fermer le détail">✕ Fermer</button></div>';

  function detailNR(label) {
    const d = (resultats[label] || {}).nonReconduction;
    if (!d || !d.dispo) return '';
    const lignes = d.nonReconduits.map((c) => '<tr><td>' + esc(nomAff(c)) + '</td>'
      + '<td class="rec2-num">' + esc(eur(c.netM1)) + '</td>'
      + '<td class="rec2-num">' + esc(eur(c.netM)) + '</td></tr>').join('');
    const corps = d.nonReconduits.length
      ? '<table class="rec2-table"><thead><tr><th>Client</th><th class="rec2-num">Net ' + esc(cap(moisLabel(m1))) + '</th><th class="rec2-num">Net ' + esc(cap(moisLabel(mois))) + '</th></tr></thead><tbody>' + lignes + '</tbody></table>'
      : '<p class="rec2-info">Aucun client non reconduit.</p>';
    return '<div class="rec2-detail">' + detailHead(esc(label) + ' · clients non reconduits — ' + d.nb) + corps + '</div>';
  }

  function detailComp(label) {
    const d = (resultats[label] || {}).completion;
    if (!d || !d.dispo) return '';
    const f = filtreComp[label] || 'tous';
    const liste = d.contrats.filter((c) => f === 'tous' || (f === 'payes' ? c.paye : !c.paye));
    const chip = (val, txt, n) => '<button type="button" class="rec2-chip' + (f === val ? ' is-on' : '') + '" data-filtre="' + esc(label) + '|' + val + '">' + txt + ' <b>' + n + '</b></button>';
    const chips = '<div class="rec2-chips">'
      + chip('tous', 'Tous', d.total) + chip('payes', 'Payés', d.nbPayes) + chip('nonpayes', 'Non payés', d.total - d.nbPayes)
      + '</div>';
    const lignes = liste.map((c) => '<tr><td>' + esc(nomAff(c)) + '</td>'
      + '<td class="rec2-num"><span class="rec2-etat ' + (c.paye ? 'is-oui' : 'is-non') + '">' + (c.paye ? 'Payé' : 'Non payé') + '</span></td></tr>').join('');
    const corps = liste.length
      ? '<table class="rec2-table"><thead><tr><th>Nouveau contrat ' + esc(cap(moisLabel(m1))) + '</th><th class="rec2-num">Paiement ' + esc(cap(moisLabel(mois))) + '</th></tr></thead><tbody>' + lignes + '</tbody></table>'
      : '<p class="rec2-info">Aucun contrat dans ce filtre.</p>';
    return '<div class="rec2-detail">' + detailHead(esc(label) + ' · nouveaux contrats ' + esc(moisLabel(m1)) + ' — ' + d.total) + chips + corps + '</div>';
  }

  // ── INTERACTIONS ────────────────────────────────────────────────────────────
  function onBodyClick(e) {
    const fil = e.target.closest('[data-filtre]');
    if (fil) {
      const [label, val] = fil.dataset.filtre.split('|');
      filtreComp[label] = val;
      render();
      return;
    }
    if (e.target.closest('[data-close]')) { ouvert = ''; render(); return; }
    const btn = e.target.closest('[data-open]');
    if (!btn) return;
    ouvert = (ouvert === btn.dataset.open) ? '' : btn.dataset.open; // re-clic = referme
    render();
  }

  return { open };
})();
