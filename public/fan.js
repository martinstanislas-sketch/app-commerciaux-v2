'use strict';
// ============================================================================
//  FAN — Note du studio /40. Admin uniquement. Thème CLAIR.
//  Chaque studio reçoit une note /40 = Fréquentation /10 (progressif) + Événements
//  /5 + Avis /5 + Références /10 + Clients fidèles /10 (classement RECAP), calculés à
//  partir d'une saisie mensuelle. Le CALCUL vit ici (source unique) ; le serveur
//  ne stocke que les saisies brutes + l'état « clôturé ». La logique métier
//  (barèmes) n'a pas changé — seule l'UI/UX est refondue.
// ============================================================================
const FanUI = (function () {
  const $ = (s) => document.querySelector(s);
  const T = () => (window.localStorage.getItem('authToken') || '');
  const H = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + T() });
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const STUDIOS = ['Levallois', 'Marcq', 'Neuilly', 'Boulogne', 'Wasquehal', 'Lille'];

  let mois = '';
  let inited = false;
  let cur = { rows: [], closed: 0, closedAt: '' };
  let prevTotals = null;   // totaux du mois précédent (pour les deltas)
  let selStudio = '';
  let chart = null;

  // ── Mois ────────────────────────────────────────────────────────────────
  function moisParDefaut() {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
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
  function moisCourt(ym) {
    const [a, m] = String(ym || '').split('-').map(Number);
    if (!a || !m) return '';
    return new Date(a, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long' });
  }
  function capMois() { return moisLabel(mois, 0); }
  function userName() { try { return (JSON.parse(localStorage.getItem('currentUser') || '{}').name) || 'admin'; } catch (_) { return 'admin'; } }
  function fmtDate(iso) { try { return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (_) { return ''; } }

  // ── CALCUL DES 4 INDICATEURS (/5) — INCHANGÉ ────────────────────────────
  // Non-fréquentants (/10, PROGRESSIF sans palier) : 10 × (1 − taux/40), borné 0–10, arrondi au dixième.
  function noteNonFreq(nonFreq, contrats) {
    if (!(contrats > 0)) return null;
    const taux = (nonFreq / contrats) * 100;
    const p = Math.max(0, Math.min(10, 10 * (1 - taux / 40)));
    return Math.round(p * 10) / 10;
  }
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
  function noteAvis(a) { return Math.max(0, Math.min(5, Math.round(Number(a) || 0))); }
  // Références (/10) : 1 point par prise de référence du mois, plafonné à 10.
  function noteRefs(r) { return Math.max(0, Math.min(10, Math.round(Number(r) || 0))); }
  // Indicateur 5 — Fidélité (/10) : CLASSEMENT relatif des studios sur le nb de
  // clients fidèles du mois (source RECAP). Points = 2 × (nb de studios STRICTEMENT
  // en dessous), plafonné 10 → 10/8/6/4/2/0 quand les 6 valeurs sont distinctes.
  // Studios à égalité = mêmes points ; le(s) studio(s) avec le moins → 0.
  function fidPointsMap(fideles) {
    const map = {};
    const val = (s) => Number(fideles && fideles[s]) || 0;
    STUDIOS.forEach((s) => {
      const v = val(s);
      let below = 0;
      STUDIOS.forEach((o) => { if (o !== s && val(o) < v) below++; });
      map[s] = Math.min(10, below * 2);
    });
    return map;
  }
  // Rang (1 = le plus de fidèles) pour l'info du formulaire.
  function fidRank(fideles, studio) {
    const val = (s) => Number(fideles && fideles[s]) || 0;
    const v = val(studio);
    let above = 0;
    STUDIOS.forEach((o) => { if (o !== studio && val(o) > v) above++; });
    return above + 1;
  }

  // Note d'un studio /40. `fid` = points de fidélité (0–10) déjà classés.
  function noteStudio(row, fid) {
    const freq = noteNonFreq(row.nonFreq, row.contrats);
    const even = noteEvents(row.evenements);
    const avis = noteAvis(row.avis);
    const refs = noteRefs(row.refs);
    const f = Math.max(0, Math.min(10, Number(fid) || 0));
    const total = (freq === null) ? null : (freq + even + avis + refs + f);
    return { freq, even, avis, refs, fid: f, total };
  }
  function noteReseau(rows, fp) {
    const notes = rows.map((r) => noteStudio(r, fp && fp[r.studio]).total).filter((t) => t != null);
    if (!notes.length) return null;
    return notes.reduce((a, b) => a + b, 0) / notes.length;
  }
  const tauxNonFreq = (row) => (row.contrats > 0 ? (row.nonFreq / row.contrats) * 100 : null);

  // ── Couleurs de note /40 : bon ≥32 / moyen 20–31,9 / faible <20 ───────────
  function noteClass(total) {
    if (total == null) return 'fan-na';
    if (total >= 32) return 'fan-good';
    if (total >= 20) return 'fan-warn';
    return 'fan-bad';
  }
  // Couleur d'une sous-jauge selon sa proportion du max (≥80 % bon · ≥50 % moyen · sinon faible).
  function propClass(n, max) {
    if (n == null || !(max > 0)) return 'fan-na';
    const r = n / max;
    if (r >= 0.8) return 'fan-good';
    if (r >= 0.5) return 'fan-warn';
    return 'fan-bad';
  }
  const fmtDec = (x) => (Math.round(x * 10) / 10).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmtNote = (t) => (t == null ? '—' : fmtDec(t));
  const fmtReseau = fmtNote;

  // ── États d'un studio ─────────────────────────────────────────────────────
  function isEmpty(r) {
    return !(Number(r.nonFreq) || 0) && !(Number(r.contrats) || 0)
      && !(Number(r.avis) || 0) && !(Number(r.refs) || 0)
      && !((r.evenements || []).length);
  }
  function ratioError(r) { return (Number(r.contrats) || 0) > 0 && (Number(r.nonFreq) || 0) > (Number(r.contrats) || 0); }
  function studioComplete(r) { return (Number(r.contrats) || 0) > 0 && !ratioError(r); }

  // ── Barèmes (popovers « ? ») ──────────────────────────────────────────────
  const BAREMES = {
    freq: { titre: 'Fréquentation (/10)', desc: 'Note = 10 × (1 − taux/40), bornée 0–10, arrondie au dixième. Taux = non fréquentants ÷ contrats actifs. Plus le taux est bas, meilleure est la note.', rows: [['0 %', '10,0'], ['5 %', '8,8'], ['10 %', '7,5'], ['20 %', '5,0'], ['30 %', '2,5'], ['≥ 40 %', '0,0']] },
    even: { titre: 'Événements (/5)', desc: 'Somme des participants de tous les événements du mois.', rows: [['0', '0'], ['1–9', '1'], ['10–19', '2'], ['20–29', '3'], ['30–39', '4'], ['≥ 40', '5']] },
    avis: { titre: 'Avis Google (/5)', desc: '1 point par nouvel avis du mois, plafonné à 5.', rows: [['0', '0'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['≥ 5', '5']] },
    refs: { titre: 'Références (/10)', desc: '1 point par prise de référence du mois, plafonné à 10.', rows: [['0', '0'], ['1', '1'], ['5', '5'], ['9', '9'], ['≥ 10', '10']] },
    fid: { titre: 'Clients fidèles (/10)', desc: 'Classement des 6 studios sur le nombre de clients fidèles du mois (source RECAP). Le studio qui en a le plus marque 10, puis 8, 6, 4, 2, et 0 pour celui qui en a le moins. Studios à égalité = mêmes points.', rows: [['1ᵉʳ (le plus)', '10'], ['2ᵉ', '8'], ['3ᵉ', '6'], ['4ᵉ', '4'], ['5ᵉ', '2'], ['6ᵉ (le moins)', '0']] },
  };

  // ── Ouverture / navigation ─────────────────────────────────────────────────
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
    const prev = $('#fan-prev'), next = $('#fan-next');
    if (prev) prev.addEventListener('click', () => changeMois(-1));
    if (next) next.addEventListener('click', () => changeMois(1));
    document.querySelectorAll('[data-fan-view]').forEach((b) => b.addEventListener('click', () => switchView(b.dataset.fanView)));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closePop(); closeModal(); } });
  }
  function changeMois(delta) { mois = moisAdj(mois, delta); $('#fan-mois').value = mois; charger(); }
  function currentView() { return $('#fan-view-historique').hidden ? 'analyse' : 'historique'; }
  function switchView(v) {
    document.querySelectorAll('[data-fan-view]').forEach((b) => b.classList.toggle('is-on', b.dataset.fanView === v));
    $('#fan-view-analyse').hidden = (v !== 'analyse');
    $('#fan-view-historique').hidden = (v !== 'historique');
    if (v === 'historique') renderHistorique();
  }

  async function charger() {
    closePop(); closeModal();
    $('#fan-recap').innerHTML = '<p class="fan-loading">Chargement…</p>';
    let data = null, prev = null;
    try {
      [data, prev] = await Promise.all([
        (await fetch('/api/fan/' + mois, { headers: H() })).json(),
        fetch('/api/fan/' + moisAdj(mois, -1), { headers: H() }).then((r) => r.json()).catch(() => null),
      ]);
    } catch (_) { $('#fan-recap').innerHTML = '<p class="fan-loading">Erreur de chargement.</p>'; return; }
    if (!data || !data.ok) { $('#fan-recap').innerHTML = '<p class="fan-loading">Erreur de chargement.</p>'; return; }
    const fideles = data.fideles || {};
    cur = { rows: data.rows || [], closed: data.closed ? 1 : 0, closedAt: data.closedAt || '', fideles, fidPts: fidPointsMap(fideles) };
    if (prev && prev.ok) { prevTotals = sumTotals(prev.rows || []); prevTotals.fideles = sumFideles(prev.fideles); }
    else prevTotals = null;
    if (!selStudio || !cur.rows.some((r) => r.studio === selStudio)) {
      const notEmpty = cur.rows.find((r) => !isEmpty(r));
      selStudio = (notEmpty || cur.rows[0] || {}).studio || STUDIOS[0];
    }
    render();
  }

  function rowOf(studio) { return cur.rows.find((r) => r.studio === studio) || { studio, nonFreq: 0, contrats: 0, evenements: [], avis: 0, refs: 0 }; }
  // Note d'un studio du mois courant (injecte ses points de fidélité).
  function noteOf(r) { return noteStudio(r, (cur.fidPts || {})[r.studio]); }
  function sortedRows() {
    return cur.rows.slice().sort((a, b) => {
      const ta = noteOf(a).total, tb = noteOf(b).total;
      return (tb == null ? -1 : tb) - (ta == null ? -1 : ta);
    });
  }
  function sumTotals(rows) {
    return {
      nonFreq: rows.reduce((s, r) => s + (Number(r.nonFreq) || 0), 0),
      contrats: rows.reduce((s, r) => s + (Number(r.contrats) || 0), 0),
      participants: rows.reduce((s, r) => s + totalParticipants(r.evenements), 0),
      avis: rows.reduce((s, r) => s + (Number(r.avis) || 0), 0),
      refs: rows.reduce((s, r) => s + (Number(r.refs) || 0), 0),
    };
  }

  // ── Rendu global ────────────────────────────────────────────────────────────
  function render() { renderNetwork(); renderProgress(); renderCards(); renderBanner(); renderForm(); renderTiles(); }

  // Progression du mois
  function renderProgress() {
    const host = $('#fan-progress');
    const nSaisis = cur.rows.filter((r) => !isEmpty(r)).length;
    const pct = Math.round((nSaisis / STUDIOS.length) * 100);
    host.innerHTML = '<div class="fan-progress-track"><span class="fan-progress-fill" style="width:' + pct + '%"></span></div>'
      + '<span class="fan-progress-lbl">' + nSaisis + '/' + STUDIOS.length + ' studios saisis</span>';
  }

  // Note réseau (composant jauge)
  function renderNetwork() {
    const host = $('#fan-network');
    const notes = cur.rows.filter((r) => noteOf(r).total != null);
    const reseau = noteReseau(cur.rows, cur.fidPts);
    const cls = noteClass(reseau);
    host.innerHTML = '<div class="fan-net-top"><span class="fan-net-lbl">Note réseau</span>'
      + '<span class="fan-net-val ' + cls + '">' + fmtReseau(reseau) + '<small>/40</small></span></div>'
      + '<div class="fan-net-track"><span class="fan-net-fill ' + cls + '" style="width:' + (reseau == null ? 0 : (reseau / 40 * 100)) + '%"></span></div>'
      + '<span class="fan-net-sub">basée sur ' + notes.length + '/' + STUDIOS.length + ' studios saisis</span>';
  }

  // Cartes studios
  function gauge(label, full, n, max, dec) {
    const isNull = (n == null);
    const val = isNull ? '—' : ((dec ? fmtDec(n) : String(n)) + '/' + max);
    const w = isNull ? 0 : Math.max(0, Math.min(100, n / max * 100));
    return '<div class="fan-g">'
      + '<span class="fan-g-lbl" title="' + esc(full) + '">' + esc(label) + '</span>'
      + '<span class="fan-g-track"><span class="fan-g-fill ' + propClass(n, max) + '" style="width:' + w + '%"></span></span>'
      + '<span class="fan-g-val">' + val + '</span></div>';
  }
  function renderCards() {
    const host = $('#fan-recap');
    const cards = sortedRows().map((r) => {
      const n = noteOf(r);
      const empty = isEmpty(r);
      const state = cur.closed ? 'st-closed' : (empty ? 'st-empty' : 'st-progress');
      const badge = cur.closed ? 'Clôturé ✓' : (empty ? 'À saisir' : 'En cours');
      const sel = r.studio === selStudio ? ' is-selected' : '';
      // Sous-scores : « — » quand la carte est vide (jamais 0 pour un studio non saisi).
      const g = empty
        ? gauge('Fréq', 'Fréquentation', null, 10, true) + gauge('Évén', 'Événements', null, 5, false) + gauge('Avis', 'Avis Google', null, 5, false) + gauge('Réf', 'Références', null, 10, false) + gauge('Fid', 'Clients fidèles', null, 10, false)
        : gauge('Fréq', 'Fréquentation', n.freq, 10, true) + gauge('Évén', 'Événements', n.even, 5, false) + gauge('Avis', 'Avis Google', n.avis, 5, false) + gauge('Réf', 'Références', n.refs, 10, false) + gauge('Fid', 'Clients fidèles', n.fid, 10, false);
      const noteVal = empty ? '—' : fmtNote(n.total);
      const noteCls = empty ? 'fan-na' : noteClass(n.total);
      return '<button type="button" class="fan-card ' + state + sel + '" data-studio="' + esc(r.studio) + '" aria-pressed="' + (sel ? 'true' : 'false') + '">'
        + '<div class="fan-card-top"><span class="fan-card-nom">' + esc(r.studio) + '</span>'
        + '<span class="fan-badge ' + state + '">' + badge + '</span></div>'
        + '<div class="fan-card-note"><span class="fan-pastille ' + noteCls + '"></span>'
        + '<span class="fan-note-val ' + noteCls + '">' + noteVal + '<span class="fan-note-max">/40</span></span></div>'
        + '<div class="fan-gauges">' + g + '</div>'
        + '</button>';
    }).join('');
    host.innerHTML = '<div class="fan-cards-grid">' + cards + '</div>';
    host.querySelectorAll('.fan-card').forEach((c) => c.addEventListener('click', () => {
      selStudio = c.dataset.studio; renderCards(); renderForm();
    }));
  }

  // ── Formulaire de saisie ────────────────────────────────────────────────────
  function derFreq(r) {
    if (!(r.contrats > 0)) return { txt: 'Renseigne les « membres avec contrat actif » pour noter la fréquentation.', err: false };
    if (ratioError(r)) return { txt: '⚠ Les non-fréquentants (' + r.nonFreq + ') dépassent les contrats actifs (' + r.contrats + ').', err: true };
    const t = Math.round(tauxNonFreq(r));
    return { txt: '= ' + t + ' % de non-fréquentants → Fréquentation ' + fmtDec(noteNonFreq(r.nonFreq, r.contrats)) + '/10', err: false };
  }
  function derEven(r) {
    const p = totalParticipants(r.evenements);
    return p <= 0 ? { txt: 'Aucun événement = Événements 0/5' } : { txt: p + ' participant' + (p > 1 ? 's' : '') + ' → Événements ' + noteEvents(r.evenements) + '/5' };
  }
  function derAvis(r) { const a = Number(r.avis) || 0; return { txt: a + (a > 1 ? ' nouveaux avis' : ' nouvel avis') + ' → Avis ' + noteAvis(a) + '/5' }; }
  function derRefs(r) { const x = Number(r.refs) || 0; return { txt: x + ' référence' + (x > 1 ? 's' : '') + ' → Références ' + noteRefs(x) + '/10' }; }

  function renderForm() {
    const host = $('#fan-form');
    const r = rowOf(selStudio);
    const ro = !!cur.closed;                 // lecture seule si clôturé
    const n = noteOf(r);
    const dis = ro ? ' disabled' : '';
    const num = (champ, val) => '<input type="number" min="0" step="1" class="fan-num" data-champ="' + champ + '" value="' + (Number(val) || 0) + '"' + dis + '>';
    const evs = r.evenements || [];
    const evRows = evs.map((e, i) =>
      '<div class="fan-event-row" data-idx="' + i + '">'
      + '<input type="text" class="fan-ev-nom" placeholder="Nom de l\'événement" value="' + esc(e.nom || '') + '"' + dis + '>'
      + '<input type="number" class="fan-ev-part" min="0" step="1" placeholder="Particip." value="' + (Number(e.participants) || 0) + '"' + dis + '>'
      + (ro ? '' : '<button type="button" class="fan-ev-del" title="Retirer l\'événement" aria-label="Retirer l\'événement">✕</button>')
      + '</div>').join('');
    const help = (key) => ro ? '' : '<button type="button" class="fan-help" data-help="' + key + '" aria-label="Voir le barème">?</button>';

    host.innerHTML = '<div class="fan-form-card' + (ro ? ' is-readonly' : '') + '">'
      + '<div class="fan-form-head"><div><span class="fan-form-title">Saisie — <b>' + esc(selStudio) + '</b></span>'
      + '<span class="fan-form-mois">' + esc(capMois()) + (ro ? ' · figé' : '') + '</span></div>'
      + '<span class="fan-form-note ' + noteClass(n.total) + '" id="fan-form-note">' + fmtNote(n.total) + '<small>/40</small></span></div>'

      // Bloc membres (groupé + ratio)
      + '<div class="fan-block"><div class="fan-block-h">Membres ' + help('freq') + '</div>'
      + '<div class="fan-two-fields">'
      + '<label class="fan-field"><span class="fan-lbl">Non fréquentants</span>' + num('nonFreq', r.nonFreq) + '</label>'
      + '<label class="fan-field"><span class="fan-lbl">Avec contrat actif <small>(carte ou abo)</small></span>' + num('contrats', r.contrats) + '</label>'
      + '</div><div class="fan-derived" id="fan-d-freq"></div></div>'

      // Événements
      + '<div class="fan-block"><div class="fan-block-h">Événements du mois ' + help('even') + '</div>'
      + '<div class="fan-events-list">' + (evRows || '<p class="fan-events-vide">Aucun événement ce mois-ci.</p>') + '</div>'
      + (ro ? '' : '<button type="button" class="fan-link" data-add-event>+ Ajouter un événement</button>')
      + '<div class="fan-derived" id="fan-d-even"></div></div>'

      // Avis + Références
      + '<div class="fan-two-blocks">'
      + '<div class="fan-block"><div class="fan-block-h">Nouveaux avis Google ' + help('avis') + '</div>'
      + '<label class="fan-field fan-field-sm"><span class="fan-lbl">Avis du mois</span>' + num('avis', r.avis) + '</label>'
      + '<div class="fan-derived" id="fan-d-avis"></div></div>'
      + '<div class="fan-block"><div class="fan-block-h">Prises de références ' + help('refs') + '</div>'
      + '<label class="fan-field fan-field-sm"><span class="fan-lbl">Références du mois</span>' + num('refs', r.refs) + '</label>'
      + '<div class="fan-derived" id="fan-d-refs"></div></div>'
      + '</div>'

      // Clients fidèles (auto depuis RECAP, non éditable)
      + '<div class="fan-block"><div class="fan-block-h">Clients fidèles <span class="fan-auto-tag">auto · RECAP</span> ' + help('fid') + '</div>'
      + '<div class="fan-fid-info" id="fan-fid-info"></div></div>'

      // Pied : clôture (masqué si déjà clôturé)
      + (ro ? '' : '<div class="fan-form-foot"><span class="fan-close-reason" id="fan-close-reason"></span>'
        + '<button type="button" class="fan-btn-primary" id="fan-close-btn">Clôturer le mois</button></div>')
      + '</div>';

    if (!ro) wireForm(host, r);
    updateDerived(r);
    updateFidInfo(r);
    updateCloseBtn();
  }

  function updateFidInfo(r) {
    const el = $('#fan-fid-info');
    if (!el) return;
    const nb = Number((cur.fideles || {})[r.studio]);
    const pts = (cur.fidPts || {})[r.studio] || 0;
    const has = (cur.fideles || {})[r.studio] != null;
    if (!has) { el.innerHTML = '<span class="fan-fid-none">Aucune donnée RECAP pour ' + esc(selStudio) + ' ce mois-ci → Fidélité 0/10.</span>'; return; }
    const rang = fidRank(cur.fideles, r.studio);
    el.innerHTML = '<b>' + nb + '</b> client' + (nb > 1 ? 's' : '') + ' fidèle' + (nb > 1 ? 's' : '')
      + ' <span class="fan-fid-rank">(rang ' + rang + '/' + STUDIOS.length + ' du réseau)</span> → Fidélité <b>' + pts + '/10</b>';
  }

  function updateDerived(r) {
    const set = (id, d) => { const el = $('#' + id); if (el) { el.textContent = d.txt; el.classList.toggle('is-err', !!d.err); } };
    set('fan-d-freq', derFreq(r)); set('fan-d-even', derEven(r)); set('fan-d-avis', derAvis(r)); set('fan-d-refs', derRefs(r));
    const nt = noteOf(r), noteEl = $('#fan-form-note');
    if (noteEl) { noteEl.className = 'fan-form-note ' + noteClass(nt.total); noteEl.innerHTML = fmtNote(nt.total) + '<small>/40</small>'; }
    // reflète l'erreur de ratio sur le champ
    const nf = document.querySelector('.fan-num[data-champ="nonFreq"]');
    if (nf) nf.classList.toggle('is-err', ratioError(r));
  }

  function updateCloseBtn() {
    const btn = $('#fan-close-btn'), reason = $('#fan-close-reason');
    if (!btn || !reason) return;
    const missing = cur.rows.filter((r) => !studioComplete(r));
    if (missing.length) {
      btn.disabled = true;
      reason.textContent = 'Saisie incomplète — à compléter : ' + missing.map((r) => r.studio).join(', ');
    } else {
      btn.disabled = false;
      reason.textContent = 'Tous les studios sont saisis.';
    }
  }

  function wireForm(host, r) {
    host.querySelectorAll('.fan-num').forEach((inp) => {
      const commit = (save) => {
        const v = Math.max(0, Math.round(Number(inp.value) || 0));
        inp.value = v; r[inp.dataset.champ] = v;
        updateDerived(r); renderNetwork(); renderProgress(); renderCards(); renderTiles(); updateCloseBtn();
        if (save) enregistrer({ [inp.dataset.champ]: v });
      };
      inp.addEventListener('input', () => commit(false));
      inp.addEventListener('change', () => commit(true));
    });
    const add = host.querySelector('[data-add-event]');
    if (add) add.addEventListener('click', () => { r.evenements = (r.evenements || []).concat([{ nom: '', participants: 0 }]); renderForm(); renderNetwork(); renderCards(); });
    host.querySelectorAll('.fan-event-row').forEach((rowEl) => {
      const i = Number(rowEl.dataset.idx);
      const nom = rowEl.querySelector('.fan-ev-nom'), part = rowEl.querySelector('.fan-ev-part');
      const live = () => { r.evenements[i] = { nom: nom.value, participants: Math.max(0, Math.round(Number(part.value) || 0)) }; updateDerived(r); renderNetwork(); renderProgress(); renderCards(); renderTiles(); updateCloseBtn(); };
      const save = () => { live(); enregistrer({ evenements: r.evenements }); };
      nom.addEventListener('input', live); nom.addEventListener('change', save);
      part.addEventListener('input', live); part.addEventListener('change', save);
      const del = rowEl.querySelector('.fan-ev-del');
      if (del) del.addEventListener('click', () => { r.evenements.splice(i, 1); enregistrer({ evenements: r.evenements }); renderForm(); renderNetwork(); renderCards(); });
    });
    host.querySelectorAll('.fan-help').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); openPop(b, b.dataset.help); }));
    const cb = host.querySelector('#fan-close-btn');
    if (cb) cb.addEventListener('click', () => openModal());
  }

  async function enregistrer(champs) {
    try {
      const r = await (await fetch('/api/fan/' + mois, { method: 'PATCH', headers: H(), body: JSON.stringify(Object.assign({ studio: selStudio }, champs)) })).json();
      if (!r || !r.ok) console.warn('fan save failed');
    } catch (_) { /* silencieux : la valeur reste à l'écran */ }
  }

  // ── Bandeau clôture + rouverture ─────────────────────────────────────────────
  function renderBanner() {
    const host = $('#fan-banner');
    if (!cur.closed) { host.innerHTML = ''; return; }
    host.innerHTML = '<div class="fan-closed-banner"><span class="fan-closed-txt">🔒 Clôturé le ' + esc(fmtDate(cur.closedAt)) + ' par ' + esc(userName()) + '</span>'
      + '<button type="button" class="fan-link fan-reopen" data-reopen>Rouvrir le mois</button></div>';
    host.querySelector('[data-reopen]').addEventListener('click', () => cloturer(false));
  }
  async function cloturer(closed) {
    try {
      const r = await (await fetch('/api/fan/' + mois + '/cloturer', { method: 'POST', headers: H(), body: JSON.stringify({ closed: !!closed }) })).json();
      if (r && r.ok) charger();
    } catch (_) { /* réseau */ }
  }

  function sumFideles(fideles) { return STUDIOS.reduce((s, st) => s + (Number(fideles && fideles[st]) || 0), 0); }

  // ── Tuiles totaux réseau + delta vs M-1 ───────────────────────────────────────
  function renderTiles() {
    const host = $('#fan-tiles');
    const t = sumTotals(cur.rows);
    const totFid = sumFideles(cur.fideles);
    const tauxMoyen = t.contrats > 0 ? Math.round((t.nonFreq / t.contrats) * 100) : null;
    const tauxPrev = (prevTotals && prevTotals.contrats > 0) ? Math.round((prevTotals.nonFreq / prevTotals.contrats) * 100) : null;
    const moisPrec = moisCourt(moisAdj(mois, -1));
    const delta = (curV, prevV, unit) => {
      if (prevTotals == null || prevV == null || curV == null) return '<span class="fan-tile-delta flat">— vs ' + esc(moisPrec) + '</span>';
      const d = curV - prevV;
      const cls = d > 0 ? 'up' : (d < 0 ? 'down' : 'flat');
      const s = (d > 0 ? '+' : (d < 0 ? '−' : '')) + Math.abs(d) + (unit || '');
      return '<span class="fan-tile-delta ' + cls + '">' + (d === 0 ? '=' : s) + ' vs ' + esc(moisPrec) + '</span>';
    };
    const tile = (val, lbl, deltaHtml) => '<div class="fan-tile"><span class="fan-tile-val">' + esc(val) + '</span>'
      + '<span class="fan-tile-lbl">' + esc(lbl) + '</span>' + deltaHtml + '</div>';
    host.innerHTML = '<div class="fan-tiles-head"><h3 class="fan-h3">Totaux du mois · réseau</h3>'
      + '<button type="button" class="fan-link" data-goto-histo>Voir l\'historique →</button></div>'
      + '<div class="fan-tiles-grid">'
      + tile(tauxMoyen == null ? '—' : (tauxMoyen + ' %'), 'Taux moyen non-fréquentants', delta(tauxMoyen, tauxPrev, ' pts'))
      + tile(t.participants, 'Participants aux événements', delta(t.participants, prevTotals && prevTotals.participants))
      + tile(t.avis, 'Nouveaux avis Google', delta(t.avis, prevTotals && prevTotals.avis))
      + tile(t.refs, 'Prises de références', delta(t.refs, prevTotals && prevTotals.refs))
      + tile(totFid, 'Clients fidèles (RECAP)', delta(totFid, prevTotals && prevTotals.fideles))
      + '</div>';
    const g = host.querySelector('[data-goto-histo]');
    if (g) g.addEventListener('click', () => switchView('historique'));
  }

  // ── Popover barème ────────────────────────────────────────────────────────────
  function openPop(trigger, key) {
    const b = BAREMES[key]; if (!b) return;
    closePop();
    const el = document.createElement('div');
    el.className = 'fan-pop'; el.id = 'fan-pop'; el.setAttribute('role', 'dialog');
    el.innerHTML = '<div class="fan-pop-t">' + esc(b.titre) + ' — barème</div>'
      + '<p class="fan-pop-d">' + esc(b.desc) + '</p>'
      + '<table class="fan-pop-table"><tbody>'
      + b.rows.map((row) => '<tr><td>' + esc(row[0]) + '</td><td><b>' + esc(row[1]) + '</b></td></tr>').join('')
      + '</tbody></table>';
    document.body.appendChild(el);
    const rect = trigger.getBoundingClientRect();
    const top = rect.bottom + 8, left = Math.min(rect.left, window.innerWidth - el.offsetWidth - 12);
    el.style.top = top + 'px'; el.style.left = Math.max(12, left) + 'px';
    setTimeout(() => document.addEventListener('click', outsidePop, true), 0);
  }
  function outsidePop(e) { const el = $('#fan-pop'); if (el && !el.contains(e.target) && !(e.target.classList && e.target.classList.contains('fan-help'))) closePop(); }
  function closePop() { const el = $('#fan-pop'); if (el) el.remove(); document.removeEventListener('click', outsidePop, true); }

  // ── Modale de clôture ─────────────────────────────────────────────────────────
  function openModal() {
    if (cur.rows.some((r) => !studioComplete(r))) return;   // garde-fou
    closeModal();
    const reseau = noteReseau(cur.rows, cur.fidPts);
    const list = sortedRows().map((r) => {
      const t = noteOf(r).total;
      return '<li><span>' + esc(r.studio) + ' — ' + esc(capMois()) + '</span><b class="' + noteClass(t) + '">' + fmtNote(t) + '/40</b></li>';
    }).join('');
    const host = $('#fan-modal-host');
    host.innerHTML = '<div class="fan-modal-backdrop" data-cancel>'
      + '<div class="fan-modal" role="dialog" aria-modal="true" aria-labelledby="fan-modal-t">'
      + '<h3 id="fan-modal-t" class="fan-modal-t">Clôturer ' + esc(capMois()) + ' ?</h3>'
      + '<p class="fan-modal-warn">Les saisies seront figées. Tu pourras rouvrir le mois plus tard si besoin.</p>'
      + '<div class="fan-modal-net">Note réseau <b class="' + noteClass(reseau) + '">' + fmtReseau(reseau) + '/40</b></div>'
      + '<ul class="fan-modal-list">' + list + '</ul>'
      + '<div class="fan-modal-actions"><button type="button" class="fan-btn-ghost" data-cancel>Annuler</button>'
      + '<button type="button" class="fan-btn-primary" data-confirm>Clôturer définitivement</button></div>'
      + '</div></div>';
    host.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', (e) => { if (e.target === b) closeModal(); }));
    host.querySelector('[data-confirm]').addEventListener('click', () => { closeModal(); cloturer(true); });
    const cf = host.querySelector('[data-confirm]'); if (cf) cf.focus();
  }
  function closeModal() { const h = $('#fan-modal-host'); if (h) h.innerHTML = ''; }

  // ── HISTORIQUE ─────────────────────────────────────────────────────────────
  async function renderHistorique() {
    const host = $('#fan-histo');
    host.innerHTML = '<p class="fan-loading">Chargement…</p>';
    let data = null;
    try { data = await (await fetch('/api/fan-history', { headers: H() })).json(); }
    catch (_) { host.innerHTML = '<p class="fan-loading">Erreur de chargement.</p>'; return; }
    if (!data || !data.ok) { host.innerHTML = '<p class="fan-loading">Erreur de chargement.</p>'; return; }
    const months = data.months || [];
    if (!months.length) { host.innerHTML = '<p class="fan-loading">Aucun mois saisi pour le moment.</p>'; return; }

    const noteMap = {};
    months.forEach((m) => {
      const fp = fidPointsMap(m.fideles || {});
      const per = {};
      m.rows.forEach((r) => { per[r.studio] = noteStudio(r, fp[r.studio]).total; });
      noteMap[m.mois] = { per, reseau: noteReseau(m.rows, fp) };
    });
    const moisAsc = months.map((m) => m.mois);
    const moisDesc = moisAsc.slice().reverse();

    const cell = (t) => '<td class="fan-h-cell ' + noteClass(t) + '">' + fmtNote(t) + '</td>';
    const corps = moisDesc.map((ym) => {
      const nm = noteMap[ym];
      return '<tr><td class="fan-h-mois">' + esc(moisLabel(ym, 0)) + '</td>'
        + STUDIOS.map((s) => cell(nm.per[s] == null ? null : nm.per[s])).join('')
        + '<td class="fan-h-cell fan-h-reseau ' + noteClass(nm.reseau) + '">' + fmtReseau(nm.reseau) + '</td></tr>';
    }).join('');
    const thead = '<tr><th>Mois</th>' + STUDIOS.map((s) => '<th>' + esc(s) + '</th>').join('') + '<th>Réseau</th></tr>';

    const last = moisAsc[moisAsc.length - 1], prev = moisAsc[moisAsc.length - 2];
    const trendCards = STUDIOS.map((s) => {
      const cu = noteMap[last].per[s], pr = prev ? noteMap[prev].per[s] : null;
      let arw = '<span class="fan-tr flat">=</span>', d = '';
      if (cu != null && pr != null) {
        if (cu > pr) { arw = '<span class="fan-tr up">↑</span>'; d = ' +' + fmtDec(cu - pr); }
        else if (cu < pr) { arw = '<span class="fan-tr down">↓</span>'; d = ' −' + fmtDec(pr - cu); }
      }
      return '<div class="fan-trend-card"><span class="fan-trend-nom">' + esc(s) + '</span>'
        + '<span class="fan-trend-note ' + noteClass(cu) + '">' + fmtNote(cu) + '<small>/40</small></span>'
        + '<span class="fan-trend-sub">' + arw + esc(d) + '</span></div>';
    }).join('');

    host.innerHTML = '<h3 class="fan-h3">Évolution des notes /40</h3>'
      + '<div class="fan-histo-graph"><canvas id="fan-chart" height="120"></canvas></div>'
      + '<div class="fan-trend-row">' + trendCards + '</div>'
      + '<h3 class="fan-h3">Détail par mois</h3>'
      + '<div class="fan-h-table-wrap"><table class="fan-h-table"><thead>' + thead + '</thead><tbody>' + corps + '</tbody></table></div>';
    dessinerChart(moisAsc.slice(-12), noteMap);
  }

  const STUDIO_COLORS = { Levallois: '#2563EB', Marcq: '#7C3AED', Neuilly: '#0A7D33', Boulogne: '#B56A00', Wasquehal: '#DB2777', Lille: '#C22F2F' };
  function dessinerChart(labels, noteMap) {
    const el = $('#fan-chart');
    if (!el || typeof Chart === 'undefined') return;
    if (chart) { chart.destroy(); chart = null; }
    const datasets = STUDIOS.map((s) => ({
      label: s, data: labels.map((ym) => { const v = noteMap[ym] ? noteMap[ym].per[s] : null; return v == null ? null : v; }),
      borderColor: STUDIO_COLORS[s], backgroundColor: STUDIO_COLORS[s], tension: 0.3, spanGaps: true, borderWidth: 2, pointRadius: 3,
    }));
    chart = new Chart(el.getContext('2d'), {
      type: 'line',
      data: { labels: labels.map((ym) => moisCourt(ym)), datasets },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        scales: {
          y: { min: 0, max: 40, ticks: { stepSize: 10, color: '#5c5b57' }, grid: { color: 'rgba(0,0,0,.08)' } },
          x: { ticks: { color: '#5c5b57' }, grid: { display: false } },
        },
        plugins: { legend: { labels: { color: '#111111', boxWidth: 12, usePointStyle: true } } },
      },
    });
  }

  return { open };
})();
