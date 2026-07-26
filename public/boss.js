'use strict';
// ============================================================================
//  BOSS — Vue synthèse dirigeant (lecture seule). Un tableau : 6 clubs × 5
//  indicateurs, tous CALCULÉS depuis les sources (aucune saisie ici).
//   1. Leads (LEAD) + évolution vs N-1
//   2. % conversion Lead → RDV venu (LEAD) + évolution vs M-1 (pts)
//   3. Résultat = note de rétention (RECAP) en % + évolution vs M-1 (pts)
//   4. Note Fan = classement % Challenge → 10/8/6/4/2/0, en étoiles /5 + tendance
//   5. Contribution = encaissements − décaissements (Pennylane, localStorage) + Δ M-1
//  Accès : direction (admin + rôle director). Tri par contribution décroissante.
// ============================================================================
const BossUI = (function () {
  const $ = (s) => document.querySelector(s);
  const T = () => (window.localStorage.getItem('authToken') || '');
  const H = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + T() });
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let mois = '';
  let inited = false;
  let lastRows = [];              // dernières lignes rendues (pour le comparatif)
  let compareMetric = 'contribution';
  let compareChart = null;

  // ── Mois ────────────────────────────────────────────────────────────────
  function moisParDefaut() {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); // dernier mois révolu
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function moisAdj(ym, delta) {
    const [a, m] = String(ym || '').split('-').map(Number);
    if (!a || !m) return ym || '';
    const d = new Date(a, m - 1 + (delta || 0), 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function moisLabel(ym, delta) {
    const [a, m] = String(ym || '').split('-').map(Number);
    if (!a || !m) return ym || '';
    const d = new Date(a, m - 1 + (delta || 0), 1);
    const s = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ── Formatage ────────────────────────────────────────────────────────────
  const ND = '<span class="boss-nd">n.d.</span>';
  const fmtInt = (n) => Number(n).toLocaleString('fr-FR');
  const fmtEur = (n) => Math.round(Number(n)).toLocaleString('fr-FR') + ' €';
  const fmtPct1 = (x) => (Math.round(x * 10) / 10).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %';
  const fmtDec1 = (x) => (Math.round(x * 10) / 10).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  // Delta coloré : ▲ vert / ▼ rouge / = gris. `fmt` formate |valeur| ; `suffix` (ex. ' pts').
  function deltaHtml(cur, prev, fmt, suffix) {
    if (cur == null || prev == null) return '';
    const d = cur - prev;
    const cls = d > 0 ? 'up' : (d < 0 ? 'down' : 'flat');
    const arw = d > 0 ? '▲' : (d < 0 ? '▼' : '=');
    if (d === 0) return '<span class="boss-delta flat">= ' + (suffix ? '0' + suffix : '') + '</span>';
    const sign = d > 0 ? '+' : '−';
    return '<span class="boss-delta ' + cls + '">' + arw + ' ' + sign + fmt(Math.abs(d)) + (suffix || '') + '</span>';
  }
  // Delta leads vs N-1 : pourcentage uniquement (pas la valeur absolue).
  function deltaLeads(cur, n1) {
    if (cur == null || n1 == null) return '';
    const d = cur - n1;
    if (d === 0) return '<span class="boss-delta flat">=</span>';
    const cls = d > 0 ? 'up' : 'down';
    const arw = d > 0 ? '▲' : '▼';
    if (n1 <= 0) return '<span class="boss-delta ' + cls + '">' + arw + ' nouveau</span>';
    const sign = d > 0 ? '+' : '−';
    return '<span class="boss-delta ' + cls + '">' + arw + ' ' + sign + Math.round(Math.abs(d) / n1 * 100) + '%</span>';
  }

  // ── Note Fan : note FAN COMPLÈTE /50 (identique à l'onglet FAN) → étoiles /5 ─
  function starsHtml(note50) {
    if (note50 == null) return ND;
    const rating = note50 / 10;                        // 50 → 5,0
    const s = Math.max(0, Math.min(5, Math.round(rating)));
    return '<span class="boss-stars">' + '★'.repeat(s) + '<span class="boss-stars-empty">' + '★'.repeat(5 - s) + '</span></span>'
      + '<span class="boss-stars-note">' + fmtDec1(rating) + '</span>';
  }
  function trendArrow(cur, prev) {
    if (cur == null || prev == null) return '';
    if (cur > prev) return '<span class="boss-delta up">▲</span>';
    if (cur < prev) return '<span class="boss-delta down">▼</span>';
    return '<span class="boss-delta flat">=</span>';
  }

  // ── Contribution (Pennylane, localStorage : pilot:v1:{club}|{sig}|fin:…) ──
  const PF_PREFIX = 'pilot:v1:';
  function pfNum(pilotClub, sig, field) {
    try {
      const v = localStorage.getItem(PF_PREFIX + pilotClub + '|' + sig + '|fin:' + field);
      if (v == null || v === '') return null;
      const n = Number(v); return Number.isNaN(n) ? null : n;
    } catch (_) { return null; }
  }
  function contribution(pilotClub, sig) {
    const ca = pfNum(pilotClub, sig, 'ca_ttc');
    const dep = pfNum(pilotClub, sig, 'depenses');
    if (ca == null && dep == null) return null;
    return (ca || 0) - (dep || 0);
  }

  // ── Ouverture / chargement ─────────────────────────────────────────────────
  function open() {
    if (!inited) { wire(); inited = true; }
    if (!$('#boss-mois').value) $('#boss-mois').value = moisParDefaut();
    mois = $('#boss-mois').value;
    charger();
  }
  function wire() {
    const mp = $('#boss-mois');
    if (mp) mp.addEventListener('change', () => { mois = mp.value; charger(); });
    const p = $('#boss-prev'), n = $('#boss-next');
    if (p) p.addEventListener('click', () => { mois = moisAdj(mois, -1); $('#boss-mois').value = mois; charger(); });
    if (n) n.addEventListener('click', () => { mois = moisAdj(mois, 1); $('#boss-mois').value = mois; charger(); });
  }

  async function charger() {
    const host = $('#boss-table-wrap');
    if (!host) return;
    host.innerHTML = '<p class="boss-loading">Chargement…</p>';
    let data = null;
    try { data = await (await fetch('/api/boss/' + mois, { headers: H() })).json(); }
    catch (_) { host.innerHTML = '<p class="boss-loading">Erreur de chargement.</p>'; return; }
    if (!data || !data.ok) { host.innerHTML = '<p class="boss-loading">' + esc((data && data.error) || 'Erreur de chargement.') + '</p>'; return; }
    render(data);
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────
  function render(data) {
    const host = $('#boss-table-wrap');
    const clubs = data.clubs || [];
    const keys = clubs.map((c) => c.key);
    const D = data.data || {};
    const sigCur = 'month-' + mois;
    const sigPrec = 'month-' + data.moisPrec;

    // Calcule toutes les valeurs par club (pour tri + total)
    const rows = clubs.map((c) => {
      const d = D[c.key] || {};
      const conv = (d.leads > 0 && d.rdvVenu != null) ? (d.rdvVenu / d.leads * 100) : null;
      const convPrec = (d.leadsPrec > 0 && d.rdvVenuPrec != null) ? (d.rdvVenuPrec / d.leadsPrec * 100) : null;
      const resultat = (d.recapNote != null) ? d.recapNote * 100 : null;
      const resultatPrec = (d.recapNotePrec != null) ? d.recapNotePrec * 100 : null;
      const contrib = contribution(c.pilotage, sigCur);
      const contribPrec = contribution(c.pilotage, sigPrec);
      return {
        club: c, leads: d.leads, leadsN1: d.leadsN1, conv, convPrec,
        resultat, resultatPrec, fanNote: (d.fanNote != null ? d.fanNote : null), fanNotePrec: (d.fanNotePrec != null ? d.fanNotePrec : null),
        contrib, contribPrec,
      };
    });
    // Tri par défaut : contribution décroissante (n.d. en bas)
    rows.sort((a, b) => (b.contrib == null ? -Infinity : b.contrib) - (a.contrib == null ? -Infinity : a.contrib));

    const cellLeads = (r) => r.leads == null ? ND : ('<span class="boss-val">' + fmtInt(r.leads) + '</span>' + deltaLeads(r.leads, r.leadsN1));
    const cellConv = (r) => r.conv == null ? ND : ('<span class="boss-val">' + fmtPct1(r.conv) + '</span>' + deltaHtml(r.conv, r.convPrec, fmtDec1, ' pts'));
    const cellRes = (r) => r.resultat == null ? ND : ('<span class="boss-val">' + fmtPct1(r.resultat) + '</span>' + deltaHtml(r.resultat, r.resultatPrec, fmtDec1, ' pts'));
    const cellFan = (r) => r.fanNote == null ? ND : ('<span class="boss-val">' + starsHtml(r.fanNote) + '</span>' + trendArrow(r.fanNote, r.fanNotePrec));
    const cellContrib = (r) => r.contrib == null ? ND : ('<span class="boss-val ' + (r.contrib >= 0 ? '' : 'boss-neg') + '">' + fmtEur(r.contrib) + '</span>' + deltaHtml(r.contrib, r.contribPrec, (x) => fmtEur(x).replace(' €', ''), ' €'));

    const corps = rows.map((r) => '<tr>'
      + '<td class="boss-club">' + esc(r.club.display) + '</td>'
      + '<td>' + cellLeads(r) + '</td>'
      + '<td>' + cellConv(r) + '</td>'
      + '<td>' + cellRes(r) + '</td>'
      + '<td>' + cellFan(r) + '</td>'
      + '<td>' + cellContrib(r) + '</td>'
      + '</tr>').join('');

    // ── Ligne TOTAL ───────────────────────────────────────────────────────
    const sum = (arr, f) => { const v = arr.map(f).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
    const totLeads = sum(rows, (r) => r.leads);
    const totLeadsN1 = sum(rows, (r) => r.leadsN1);
    const totVenu = sum(rows, (r) => (r.leads != null && r.conv != null) ? (r.conv / 100 * r.leads) : null);
    const totConv = (totLeads && totVenu != null) ? (totVenu / totLeads * 100) : null;
    // conversion pondérée M-1 pour le delta
    const totLeadsPrec = sum(rows, (r) => (r.convPrec != null && D[r.club.key] && D[r.club.key].leadsPrec != null) ? D[r.club.key].leadsPrec : null);
    const totVenuPrec = sum(rows, (r) => (D[r.club.key] && D[r.club.key].rdvVenuPrec != null) ? D[r.club.key].rdvVenuPrec : null);
    const totConvPrec = (totLeadsPrec && totVenuPrec != null) ? (totVenuPrec / totLeadsPrec * 100) : null;
    const totContrib = sum(rows, (r) => r.contrib);
    const totContribPrec = sum(rows, (r) => r.contribPrec);
    // Résultat total = note réseau RECAP (moyenne pondérée), pas une somme
    const resReseau = (data.recapReseau != null) ? data.recapReseau * 100 : null;
    const resReseauPrec = (data.recapReseauPrec != null) ? data.recapReseauPrec * 100 : null;

    const totalRow = '<tr class="boss-total">'
      + '<td class="boss-club">TOTAL réseau</td>'
      + '<td>' + (totLeads == null ? ND : ('<span class="boss-val">' + fmtInt(totLeads) + '</span>' + deltaLeads(totLeads, totLeadsN1))) + '</td>'
      + '<td>' + (totConv == null ? ND : ('<span class="boss-val">' + fmtPct1(totConv) + '</span><span class="boss-sub">pondérée</span>' + deltaHtml(totConv, totConvPrec, fmtDec1, ' pts'))) + '</td>'
      + '<td>' + (resReseau == null ? ND : ('<span class="boss-val">' + fmtPct1(resReseau) + '</span><span class="boss-sub">réseau</span>' + deltaHtml(resReseau, resReseauPrec, fmtDec1, ' pts'))) + '</td>'
      + '<td><span class="boss-sub">—</span></td>'
      + '<td>' + (totContrib == null ? ND : ('<span class="boss-val ' + (totContrib >= 0 ? '' : 'boss-neg') + '">' + fmtEur(totContrib) + '</span>' + deltaHtml(totContrib, totContribPrec, (x) => fmtEur(x).replace(' €', ''), ' €'))) + '</td>'
      + '</tr>';

    host.innerHTML = '<table class="boss-table"><thead><tr>'
      + '<th>Club</th>'
      + '<th>Leads<span class="boss-th-sub">vs ' + esc(moisLabel(mois, 0)) + ' N-1</span></th>'
      + '<th>% Conversion<span class="boss-th-sub">RDV venus ÷ leads · vs M-1</span></th>'
      + '<th>Résultat<span class="boss-th-sub">rétention RECAP · vs M-1</span></th>'
      + '<th>Note Fan<span class="boss-th-sub">note FAN /50 → /5 ★ · vs M-1</span></th>'
      + '<th>Contribution<span class="boss-th-sub">encaiss. − décaiss. · vs M-1</span></th>'
      + '</tr></thead><tbody>' + corps + totalRow + '</tbody></table>';

    lastRows = rows;
    renderCompare();
  }

  // ── Comparatif visuel des clubs (à la demande) ─────────────────────────────
  const METRICS = [
    { key: 'contribution', label: 'Contribution', get: (r) => r.contrib, fmt: (v) => fmtEur(v), signed: true },
    { key: 'leads', label: 'Leads', get: (r) => r.leads, fmt: (v) => fmtInt(v) },
    { key: 'conv', label: '% Conversion', get: (r) => r.conv, fmt: (v) => fmtPct1(v) },
    { key: 'resultat', label: 'Résultat', get: (r) => r.resultat, fmt: (v) => fmtPct1(v) },
    { key: 'fan', label: 'Note Fan', get: (r) => (r.fanNote != null ? r.fanNote / 10 : null), fmt: (v) => fmtDec1(v) + '★' },
  ];
  function renderCompare() {
    const host = $('#boss-compare');
    if (!host) return;
    host.innerHTML = '<div class="boss-compare-head"><span class="boss-compare-title">Comparer les clubs</span>'
      + '<div class="boss-metric-btns">' + METRICS.map((m) => '<button type="button" class="boss-metric-btn' + (m.key === compareMetric ? ' is-on' : '') + '" data-metric="' + m.key + '">' + esc(m.label) + '</button>').join('') + '</div></div>'
      + '<div class="boss-chart-wrap"><canvas id="boss-chart"></canvas></div>';
    host.querySelectorAll('[data-metric]').forEach((b) => b.addEventListener('click', () => { compareMetric = b.dataset.metric; renderCompare(); }));
    drawCompareChart();
  }
  function drawCompareChart() {
    const el = $('#boss-chart');
    if (!el || typeof Chart === 'undefined') return;
    if (compareChart) { compareChart.destroy(); compareChart = null; }
    const metric = METRICS.find((m) => m.key === compareMetric) || METRICS[0];
    const pts = lastRows.map((r) => ({ name: r.club.display, val: metric.get(r) }))
      .filter((x) => x.val != null && !Number.isNaN(x.val))
      .sort((a, b) => b.val - a.val);
    const wrap = el.parentElement;
    if (!pts.length) { wrap.innerHTML = '<p class="boss-loading">Aucune donnée pour cet indicateur ce mois-ci.</p>'; return; }
    wrap.style.height = (pts.length * 40 + 24) + 'px';
    const colors = pts.map((p) => (metric.signed && p.val < 0) ? '#c22f2f' : '#6d3bd9');
    const labels = pts.map((p) => metric.fmt(p.val));
    const valuePlugin = {
      id: 'bossvals',
      afterDatasetsDraw(c) {
        const { ctx } = c; const meta = c.getDatasetMeta(0);
        ctx.save(); ctx.font = '700 12px Inter, system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#5a6072';
        meta.data.forEach((bar, i) => {
          const v = pts[i].val;
          if (v < 0) { ctx.textAlign = 'right'; ctx.fillText(labels[i], bar.x - 6, bar.y); }
          else { ctx.textAlign = 'left'; ctx.fillText(labels[i], bar.x + 6, bar.y); }
        });
        ctx.restore();
      },
    };
    compareChart = new Chart(el.getContext('2d'), {
      type: 'bar',
      data: { labels: pts.map((p) => p.name), datasets: [{ data: pts.map((p) => p.val), backgroundColor: colors, borderRadius: 6, barThickness: 22, maxBarThickness: 26 }] },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        layout: { padding: { right: 70, left: 4, top: 2, bottom: 2 } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => metric.fmt(ctx.raw) } } },
        scales: {
          x: { display: false, grid: { display: false }, beginAtZero: true },
          y: { grid: { display: false }, ticks: { color: '#1f2430', font: { weight: '700', size: 12.5 } } },
        },
      },
      plugins: [valuePlugin],
    });
  }

  return { open };
})();
