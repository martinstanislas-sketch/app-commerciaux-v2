'use strict';
// ============================================================================
//  FAN — Note du studio /20 (capacité à transformer les clients en fans, étape 6
//  du parcours client). Admin uniquement. Reprend la structure de l'onglet RECAP.
//  Chaque studio reçoit une note /20 = somme de 4 indicateurs /5, calculés à
//  partir d'une saisie mensuelle. Le calcul vit ICI (source unique) ; le serveur
//  ne stocke que les saisies brutes + l'état « clôturé ».
// ============================================================================
const FanUI = (function () {
  const $ = (s) => document.querySelector(s);
  const T = () => (window.localStorage.getItem('authToken') || '');
  const H = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + T() });
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const STUDIOS = ['Levallois', 'Marcq', 'Neuilly', 'Boulogne', 'Wasquehal', 'Lille'];

  let mois = '';
  let inited = false;
  let cur = { rows: [], closed: 0 };  // mois courant : saisies + clôture
  let selStudio = '';                 // studio dont le formulaire est affiché
  let chart = null;

  // ── Mois ────────────────────────────────────────────────────────────────
  function moisParDefaut() {
    // Dernier mois calendaire révolu (le mois à clôturer), comme RECAP.
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function moisLabel(ym, delta) {
    const [a, m] = String(ym || '').split('-').map(Number);
    if (!a || !m) return ym || '';
    const d = new Date(a, m - 1 + (delta || 0), 1);
    const s = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function capMois() { return moisLabel(mois, 0); }

  // ── CALCUL DES 4 INDICATEURS (chacun /5) ─────────────────────────────────
  // 1 · Non-fréquentants : taux = non_freq / contrats × 100. Plus bas = mieux.
  function noteNonFreq(nonFreq, contrats) {
    if (!(contrats > 0)) return null;               // division par zéro -> « — »
    const t = (nonFreq / contrats) * 100;
    if (t <= 10) return 5;
    if (t <= 15) return 4;
    if (t <= 20) return 3;
    if (t <= 30) return 2;
    if (t <= 40) return 1;
    return 0;
  }
  // 2 · Événements : score = somme des participants de tous les événements.
  function totalParticipants(evs) { return (evs || []).reduce((s, e) => s + (Number(e && e.participants) || 0), 0); }
  function noteEvents(evs) {
    const p = totalParticipants(evs);
    if (p <= 0) return 0;
    if (p <= 9) return 1;
    if (p <= 19) return 2;
    if (p <= 29) return 3;
    if (p <= 39) return 4;
    return 5;
  }
  // 3 · Avis Google : 1 point par nouvel avis, plafonné à 5.
  function noteAvis(a) { return Math.max(0, Math.min(5, Math.round(Number(a) || 0))); }
  // 4 · Références.
  function noteRefs(r) {
    r = Number(r) || 0;
    if (r <= 0) return 0;
    if (r <= 2) return 1;
    if (r <= 4) return 2;
    if (r <= 6) return 3;
    if (r <= 8) return 4;
    return 5;
  }
  // Note globale d'un studio : { freq, even, avis, refs, total|null }.
  function noteStudio(row) {
    const freq = noteNonFreq(row.nonFreq, row.contrats);
    const even = noteEvents(row.evenements);
    const avis = noteAvis(row.avis);
    const refs = noteRefs(row.refs);
    const total = (freq === null) ? null : (freq + even + avis + refs);
    return { freq, even, avis, refs, total };
  }
  function noteReseau(rows) {
    const notes = rows.map((r) => noteStudio(r).total).filter((t) => t != null);
    if (!notes.length) return null;
    return notes.reduce((a, b) => a + b, 0) / notes.length;
  }
  function noteClass(total) {
    if (total == null) return 'fan-na';
    if (total >= 16) return 'fan-good';
    if (total >= 10) return 'fan-warn';
    return 'fan-bad';
  }
  const fmtNote = (t) => (t == null ? '—' : String(t));
  const fmtReseau = (t) => (t == null ? '—' : (Math.round(t * 10) / 10).toLocaleString('fr-FR'));

  // ── Ouverture / chargement ───────────────────────────────────────────────
  function open() {
    if (!inited) { wire(); inited = true; }
    if (!$('#fan-mois').value) $('#fan-mois').value = moisParDefaut();
    mois = $('#fan-mois').value;
    switchView('analyse');
    charger();
  }
  function wire() {
    const mp = $('#fan-mois');
    if (mp) mp.addEventListener('change', () => { mois = mp.value; if (currentView() === 'historique') renderHistorique(); else charger(); });
    document.querySelectorAll('[data-fan-view]').forEach((b) => b.addEventListener('click', () => switchView(b.dataset.fanView)));
  }
  function currentView() { return $('#fan-view-historique').hidden ? 'analyse' : 'historique'; }
  function switchView(v) {
    document.querySelectorAll('[data-fan-view]').forEach((b) => b.classList.toggle('is-on', b.dataset.fanView === v));
    $('#fan-view-analyse').hidden = (v !== 'analyse');
    $('#fan-view-historique').hidden = (v !== 'historique');
    if (v === 'historique') renderHistorique();
  }

  async function charger() {
    let data = null;
    try { data = await (await fetch('/api/fan/' + mois, { headers: H() })).json(); }
    catch (_) { $('#fan-recap').innerHTML = '<p class="rec-vide">Erreur de chargement.</p>'; return; }
    if (!data || !data.ok) { $('#fan-recap').innerHTML = '<p class="rec-vide">Erreur de chargement.</p>'; return; }
    cur = { rows: data.rows || [], closed: data.closed ? 1 : 0 };
    // Sélection par défaut = le studio le mieux noté.
    const sorted = sortedRows();
    if (!selStudio || !cur.rows.some((r) => r.studio === selStudio)) selStudio = (sorted[0] || {}).studio || STUDIOS[0];
    render();
  }

  function rowOf(studio) { return cur.rows.find((r) => r.studio === studio) || { studio, nonFreq: 0, contrats: 0, evenements: [], avis: 0, refs: 0 }; }
  function sortedRows() {
    return cur.rows.slice().sort((a, b) => {
      const ta = noteStudio(a).total, tb = noteStudio(b).total;
      return (tb == null ? -1 : tb) - (ta == null ? -1 : ta);  // notes définies d'abord, décroissant
    });
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────
  function render() { renderBanner(); renderCards(); renderForm(); renderTiles(); }

  function renderBanner() {
    const host = $('#fan-banner');
    if (!host) return;
    host.innerHTML = cur.closed
      ? '<div class="rec-import-done"><span class="ri-ok">✓ ' + esc(capMois()) + ' calculé</span>'
        + '<button type="button" class="rec-link" data-modifier>Modifier les saisies</button></div>'
      : '';
    const b = host.querySelector('[data-modifier]');
    if (b) b.addEventListener('click', () => cloturer(false));
  }

  function renderCards() {
    const host = $('#fan-recap');
    const reseau = noteReseau(cur.rows);
    const cards = sortedRows().map((r) => {
      const n = noteStudio(r);
      const active = r.studio === selStudio ? ' is-active' : '';
      return '<button type="button" class="rec-club-tab fan-card' + active + '" data-studio="' + esc(r.studio) + '">'
        + '<span class="rec-club-nom">' + esc(r.studio) + '</span>'
        + '<span class="rec-club-note ' + noteClass(n.total) + '">' + fmtNote(n.total) + '<span class="fan-max">/20</span></span>'
        + '<span class="rec-club-sub">Fréq ' + (n.freq == null ? '—' : n.freq) + '/5 · Évén ' + n.even + '/5 · Avis ' + n.avis + '/5 · Réf ' + n.refs + '/5</span>'
        + '</button>';
    }).join('');
    host.innerHTML = '<div class="rec-res-head"><h3 class="rec-h3">Notes · ' + esc(capMois()) + '</h3>'
      + '<span class="rec-reseau-badge fan-reseau">RÉSEAU <b class="' + noteClass(reseau == null ? null : Math.round(reseau)) + '">' + fmtReseau(reseau) + '<span class="fan-max">/20</span></b></span></div>'
      + '<div class="rec-club-tabs">' + cards + '</div>';
    host.querySelectorAll('.fan-card').forEach((c) => c.addEventListener('click', () => {
      selStudio = c.dataset.studio;
      renderCards();
      if (!cur.closed) renderForm();
    }));
  }

  function renderTiles() {
    const host = $('#fan-tiles');
    const totNonFreq = cur.rows.reduce((s, r) => s + (Number(r.nonFreq) || 0), 0);
    const totContrats = cur.rows.reduce((s, r) => s + (Number(r.contrats) || 0), 0);
    const totPart = cur.rows.reduce((s, r) => s + totalParticipants(r.evenements), 0);
    const totAvis = cur.rows.reduce((s, r) => s + (Number(r.avis) || 0), 0);
    const totRefs = cur.rows.reduce((s, r) => s + (Number(r.refs) || 0), 0);
    const tauxMoyen = totContrats > 0 ? Math.round((totNonFreq / totContrats) * 100) + ' %' : '—';
    const tile = (val, lbl) => '<div class="rec-kpi2 fan-tile"><b>' + esc(val) + '</b><span>' + esc(lbl) + '</span></div>';
    host.innerHTML = '<h3 class="rec-h3">Réseau · totaux du mois</h3><div class="rec-kpis2">'
      + tile(tauxMoyen, 'Taux moyen non-fréquentants')
      + tile(totPart, 'Participants événements')
      + tile(totAvis, 'Nouveaux avis Google')
      + tile(totRefs, 'Prises de références')
      + '</div>';
  }

  function renderForm() {
    const host = $('#fan-form');
    if (cur.closed) { host.innerHTML = ''; return; }  // figé -> pas de formulaire
    const r = rowOf(selStudio);
    const evs = r.evenements || [];
    const numField = (champ, label, val, hint) =>
      '<label class="fan-field"><span class="fan-lbl">' + esc(label) + (hint ? ' <small>' + esc(hint) + '</small>' : '') + '</span>'
      + '<input type="number" min="0" step="1" class="fan-num" data-champ="' + champ + '" value="' + (Number(val) || 0) + '"></label>';
    const evRows = evs.map((e, i) =>
      '<div class="fan-event-row" data-idx="' + i + '">'
      + '<input type="text" class="fan-ev-nom" placeholder="Nom de l\'événement" value="' + esc(e.nom || '') + '">'
      + '<input type="number" class="fan-ev-part" min="0" step="1" placeholder="Participants" value="' + (Number(e.participants) || 0) + '">'
      + '<button type="button" class="fan-ev-del" title="Retirer">✕</button>'
      + '</div>').join('');
    host.innerHTML = '<div class="fan-form-card">'
      + '<div class="fan-form-head">Saisie — <b>' + esc(selStudio) + '</b> · ' + esc(capMois()) + '</div>'
      + '<div class="fan-fields">'
      + numField('nonFreq', 'Membres non fréquentants', r.nonFreq)
      + numField('contrats', 'Membres avec contrat actif', r.contrats, '(carte ou abo)')
      + '</div>'
      + '<div class="fan-events">'
      + '<div class="fan-events-h">Événements du mois <small>(nom + nombre de participants)</small></div>'
      + '<div class="fan-events-list">' + (evRows || '<p class="fan-events-vide">Aucun événement ce mois-ci.</p>') + '</div>'
      + '<button type="button" class="rec-link" data-add-event>+ Ajouter un événement</button>'
      + '</div>'
      + '<div class="fan-fields">'
      + numField('avis', 'Nouveaux avis Google du mois', r.avis)
      + numField('refs', 'Prises de références du mois', r.refs)
      + '</div>'
      + '<div class="rec-actions"><button type="button" class="rec-btn" data-cloturer>Clôturer le mois</button>'
      + '<span class="rec-msg" id="fan-msg"></span></div>'
      + '</div>';
    wireForm(host, r);
  }

  function wireForm(host, r) {
    // Champs numériques : live (input -> maj cartes/tuiles) + save (change -> PATCH).
    host.querySelectorAll('.fan-num').forEach((inp) => {
      inp.addEventListener('input', () => { r[inp.dataset.champ] = Math.max(0, Math.round(Number(inp.value) || 0)); renderCards(); renderTiles(); });
      inp.addEventListener('change', () => { const v = Math.max(0, Math.round(Number(inp.value) || 0)); inp.value = v; r[inp.dataset.champ] = v; enregistrer({ [inp.dataset.champ]: v }); });
    });
    // Événements.
    host.querySelector('[data-add-event]').addEventListener('click', () => {
      r.evenements = (r.evenements || []).concat([{ nom: '', participants: 0 }]);
      renderForm(); renderCards(); renderTiles();
    });
    host.querySelectorAll('.fan-event-row').forEach((rowEl) => {
      const i = Number(rowEl.dataset.idx);
      const nom = rowEl.querySelector('.fan-ev-nom');
      const part = rowEl.querySelector('.fan-ev-part');
      const live = () => { r.evenements[i] = { nom: nom.value, participants: Math.max(0, Math.round(Number(part.value) || 0)) }; renderCards(); renderTiles(); };
      const save = () => { live(); enregistrer({ evenements: r.evenements }); };
      nom.addEventListener('input', live); nom.addEventListener('change', save);
      part.addEventListener('input', live); part.addEventListener('change', save);
      rowEl.querySelector('.fan-ev-del').addEventListener('click', () => {
        r.evenements.splice(i, 1);
        enregistrer({ evenements: r.evenements });
        renderForm(); renderCards(); renderTiles();
      });
    });
    host.querySelector('[data-cloturer]').addEventListener('click', () => cloturer(true));
  }

  async function enregistrer(champs) {
    msg('');
    try {
      const r = await (await fetch('/api/fan/' + mois, { method: 'PATCH', headers: H(),
        body: JSON.stringify(Object.assign({ studio: selStudio }, champs)) })).json();
      if (!r || !r.ok) msg('⚠️ Enregistrement impossible.', true);
    } catch (_) { msg('⚠️ Sauvegarde réseau impossible.', true); }
  }
  function msg(txt, err) { const el = $('#fan-msg'); if (el) { el.textContent = txt || ''; el.className = 'rec-msg' + (err ? ' rec-msg-err' : ''); } }

  async function cloturer(closed) {
    try {
      const r = await (await fetch('/api/fan/' + mois + '/cloturer', { method: 'POST', headers: H(), body: JSON.stringify({ closed: !!closed }) })).json();
      if (r && r.ok) { cur.closed = r.closed ? 1 : 0; render(); }
    } catch (_) { msg('⚠️ Opération impossible (réseau).', true); }
  }

  // ── HISTORIQUE ─────────────────────────────────────────────────────────────
  async function renderHistorique() {
    const host = $('#fan-histo');
    host.innerHTML = '<p class="rec-vide">Chargement…</p>';
    let data = null;
    try { data = await (await fetch('/api/fan-history', { headers: H() })).json(); }
    catch (_) { host.innerHTML = '<p class="rec-vide">Erreur de chargement.</p>'; return; }
    if (!data || !data.ok) { host.innerHTML = '<p class="rec-vide">Erreur de chargement.</p>'; return; }
    const months = data.months || [];
    if (!months.length) { host.innerHTML = '<p class="rec-vide">Aucun mois saisi pour le moment.</p>'; return; }

    // Note /20 par (mois, studio) + réseau.
    const noteMap = {}; // mois -> {studio -> total|null, reseau}
    months.forEach((m) => {
      const per = {};
      m.rows.forEach((r) => { per[r.studio] = noteStudio(r).total; });
      noteMap[m.mois] = { per, reseau: noteReseau(m.rows) };
    });
    const moisAsc = months.map((m) => m.mois);
    const moisDesc = moisAsc.slice().reverse();

    // Tableau : une ligne par mois (récent en haut), une colonne par studio + réseau.
    const cell = (t) => '<td class="fan-h-cell ' + noteClass(t) + '">' + fmtNote(t) + '</td>';
    const corps = moisDesc.map((ym) => {
      const nm = noteMap[ym];
      return '<tr><td class="fan-h-mois">' + esc(moisLabel(ym, 0)) + '</td>'
        + STUDIOS.map((s) => cell(nm.per[s] == null ? null : nm.per[s])).join('')
        + '<td class="fan-h-cell fan-h-reseau ' + noteClass(nm.reseau == null ? null : Math.round(nm.reseau)) + '">' + fmtReseau(nm.reseau) + '</td>'
        + '</tr>';
    }).join('');
    const thead = '<tr><th>Mois</th>' + STUDIOS.map((s) => '<th>' + esc(s) + '</th>').join('') + '<th>Réseau</th></tr>';

    // Cartes de tendance (dernier mois vs précédent).
    const last = moisAsc[moisAsc.length - 1], prev = moisAsc[moisAsc.length - 2];
    const trendCards = STUDIOS.map((s) => {
      const cu = noteMap[last].per[s];
      const pr = prev ? noteMap[prev].per[s] : null;
      let arw = '<span class="fan-tr flat">=</span>', d = '';
      if (cu != null && pr != null) {
        if (cu > pr) { arw = '<span class="fan-tr up">↑</span>'; d = ' +' + (cu - pr); }
        else if (cu < pr) { arw = '<span class="fan-tr down">↓</span>'; d = ' ' + (cu - pr); }
      }
      return '<div class="fan-trend-card"><span class="fan-trend-nom">' + esc(s) + '</span>'
        + '<span class="fan-trend-note ' + noteClass(cu) + '">' + fmtNote(cu) + '<span class="fan-max">/20</span></span>'
        + '<span class="fan-trend-sub">' + arw + esc(d) + '</span></div>';
    }).join('');

    host.innerHTML =
      '<h3 class="rec-h3">Évolution des notes /20</h3>'
      + '<div class="rec-histo-graph"><canvas id="fan-chart" height="120"></canvas></div>'
      + '<div class="fan-trend-row">' + trendCards + '</div>'
      + '<h3 class="rec-h3">Détail par mois</h3>'
      + '<div class="fan-h-table-wrap"><table class="fan-h-table"><thead>' + thead + '</thead><tbody>' + corps + '</tbody></table></div>';

    dessinerChart(moisAsc.slice(-12), noteMap);
  }

  const STUDIO_COLORS = { Levallois: '#60A5FA', Marcq: '#8B5CF6', Neuilly: '#34D399', Boulogne: '#F59E0B', Wasquehal: '#EC4899', Lille: '#F87171' };
  function dessinerChart(labels, noteMap) {
    const el = $('#fan-chart');
    if (!el || typeof Chart === 'undefined') return;
    if (chart) { chart.destroy(); chart = null; }
    const datasets = STUDIOS.map((s) => ({
      label: s,
      data: labels.map((ym) => { const v = noteMap[ym] ? noteMap[ym].per[s] : null; return v == null ? null : v; }),
      borderColor: STUDIO_COLORS[s], backgroundColor: STUDIO_COLORS[s],
      tension: 0.3, spanGaps: true, borderWidth: 2, pointRadius: 3,
    }));
    chart = new Chart(el.getContext('2d'), {
      type: 'line',
      data: { labels: labels.map((ym) => moisLabel(ym, 0).replace(/ \d{4}$/, '')), datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          y: { min: 0, max: 20, ticks: { stepSize: 5, color: '#6B7280' }, grid: { color: 'rgba(255,255,255,.06)' } },
          x: { ticks: { color: '#6B7280' }, grid: { display: false } },
        },
        plugins: { legend: { labels: { color: '#A2A9B8', boxWidth: 12, usePointStyle: true } } },
      },
    });
  }

  return { open };
})();
