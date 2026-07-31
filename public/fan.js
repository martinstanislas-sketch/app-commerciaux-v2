'use strict';
// ============================================================================
//  FAN — Note du studio /50. Admin uniquement. Thème CLAIR.
//  Chaque studio reçoit une note /50 = Fréquentation /10 + Événements
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

  // Indicateur 1 — Fréquentation (/10) : CLASSEMENT des 6 studios sur le TAUX de
  // non-fréquentants (non_freq/contrats). Le plus BAS taux = meilleur = 10, le plus
  // haut = 0. Même règle que la fidélité (2 × studios strictement moins bons ;
  // égalité = mêmes points). Studio sans contrats (taux indéfini) = classé dernier.
  const tauxNonFreq = (row) => (row.contrats > 0 ? (row.nonFreq / row.contrats) * 100 : null);
  function freqQual(r) { const c = Number(r.contrats) || 0; return c > 0 ? -((Number(r.nonFreq) || 0) / c) : -Infinity; } // + haut = meilleur
  function freqPointsMap(rows) {
    const q = {}; rows.forEach((r) => { q[r.studio] = freqQual(r); });
    const map = {};
    STUDIOS.forEach((s) => {
      let below = 0;
      STUDIOS.forEach((o) => { if (o !== s && q[o] < q[s]) below++; });
      map[s] = Math.min(10, below * 2);
    });
    return map;
  }
  function freqRank(rows, studio) {
    const q = {}; rows.forEach((r) => { q[r.studio] = freqQual(r); });
    let above = 0; STUDIOS.forEach((o) => { if (o !== studio && q[o] > q[studio]) above++; });
    return above + 1;
  }

  // Indicateur 6 — Engagement contrat (/10) : CLASSEMENT des 6 studios sur le
  // % Challenge (Challenge ÷ (Challenge+Carnet), source Deciplus). Le plus haut % =
  // meilleur. Règle « note du MEILLEUR rang concerné » en cas d'égalité →
  // points = 10 − 2 × (studios strictement AU-DESSUS), borné à 0. Studio sans donnée = dernier.
  function engQual(r) { return (r.challengePct != null) ? Number(r.challengePct) : -Infinity; } // + haut = meilleur
  function engPointsMap(rows) {
    const q = {}; rows.forEach((r) => { q[r.studio] = engQual(r); });
    const map = {};
    STUDIOS.forEach((s) => {
      let above = 0;
      STUDIOS.forEach((o) => { if (o !== s && q[o] > q[s]) above++; });
      map[s] = (q[s] === -Infinity) ? 0 : Math.max(0, 10 - above * 2);
    });
    return map;
  }
  function engRank(rows, studio) {
    const q = {}; rows.forEach((r) => { q[r.studio] = engQual(r); });
    let above = 0; STUDIOS.forEach((o) => { if (o !== studio && q[o] > q[studio]) above++; });
    return above + 1;
  }

  // Note d'un studio /50. fid/freqPts/engPts = points (0–10) déjà classés.
  function noteStudio(row, fid, freqPts, engPts) {
    const hasC = (Number(row.contrats) || 0) > 0;
    const freq = hasC ? Math.max(0, Math.min(10, Number(freqPts) || 0)) : null;   // pas de contrats → « — »
    const even = noteEvents(row.evenements);
    const avis = noteAvis(row.avis);
    const refs = noteRefs(row.refs);
    const f = Math.max(0, Math.min(10, Number(fid) || 0));
    const eng = Math.max(0, Math.min(10, Number(engPts) || 0));
    const total = (freq === null) ? null : (freq + even + avis + refs + f + eng);
    return { freq, even, avis, refs, fid: f, eng, total };
  }
  function noteReseau(rows, fp, freqp, engp) {
    const notes = rows.map((r) => noteStudio(r, fp && fp[r.studio], freqp && freqp[r.studio], engp && engp[r.studio]).total).filter((t) => t != null);
    if (!notes.length) return null;
    return notes.reduce((a, b) => a + b, 0) / notes.length;
  }

  // ── Couleurs de note /50 : bon ≥40 / moyen 25–39,9 / faible <25 ───────────
  function noteClass(total) {
    if (total == null) return 'fan-na';
    if (total >= 40) return 'fan-good';
    if (total >= 25) return 'fan-warn';
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

  // Note /50 ramenée en note ÉTOILES /5 (façon Google My Business). Le remplissage
  // est fractionnaire (largeur du calque plein), la couleur suit la bande de score.
  function stars(note50, size) {
    const cls = noteClass(note50);
    if (note50 == null) {
      return '<span class="fan-stars-wrap ' + cls + (size ? ' ' + size : '') + '"><span class="fan-stars"><span class="fan-stars-bg">★★★★★</span></span><span class="fan-star-val">—</span></span>';
    }
    const rating = note50 / 10;                      // 50 → 5,0
    const pct = Math.max(0, Math.min(100, note50 * 2));
    return '<span class="fan-stars-wrap ' + cls + (size ? ' ' + size : '') + '">'
      + '<span class="fan-stars"><span class="fan-stars-bg">★★★★★</span>'
      + '<span class="fan-stars-fg" style="width:' + pct + '%">★★★★★</span></span>'
      + '<span class="fan-star-val">' + fmtDec(rating) + '</span></span>';
  }
  const fmtPct = (r) => (r == null ? '—' : Math.round(Number(r) * 100) + ' %');

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
    freq: { titre: 'Fréquentation (/10)', desc: 'Classement des 6 studios sur le taux de non-fréquentants (non fréquentants ÷ contrat actif). Le taux le plus BAS marque 10, puis 8, 6, 4, 2, et 0 pour le taux le plus élevé. Studios à égalité = mêmes points ; sans contrats saisis = classé dernier.', rows: [['1ᵉʳ (taux le + bas)', '10'], ['2ᵉ', '8'], ['3ᵉ', '6'], ['4ᵉ', '4'], ['5ᵉ', '2'], ['6ᵉ (taux le + haut)', '0']] },
    even: { titre: 'Événements (/5)', desc: 'Somme des participants de tous les événements du mois.', rows: [['0', '0'], ['1–9', '1'], ['10–19', '2'], ['20–29', '3'], ['30–39', '4'], ['≥ 40', '5']] },
    avis: { titre: 'Avis Google (/5)', desc: '1 point par nouvel avis du mois, plafonné à 5.', rows: [['0', '0'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['≥ 5', '5']] },
    refs: { titre: 'Références (/10)', desc: '1 point par prise de référence du mois, plafonné à 10.', rows: [['0', '0'], ['1', '1'], ['5', '5'], ['9', '9'], ['≥ 10', '10']] },
    fid: { titre: 'Clients fidèles (/10)', desc: 'Classement des 6 studios sur le nombre de clients fidèles du mois (source RECAP, automatique). Le studio qui en a le plus marque 10, puis 8, 6, 4, 2, et 0 pour celui qui en a le moins. Studios à égalité = mêmes points.', rows: [['1ᵉʳ (le plus)', '10'], ['2ᵉ', '8'], ['3ᵉ', '6'], ['4ᵉ', '4'], ['5ᵉ', '2'], ['6ᵉ (le moins)', '0']] },
    eng: { titre: 'Engagement contrat (/10)', desc: 'Classement des 6 studios sur le % Challenge = abonnements Challenge ÷ (Challenge + Carnets) parmi les contrats actifs (source Deciplus, auto). Le % le plus haut marque 10, puis 8, 6, 4, 2, et 0 pour le plus bas. Égalité = note du meilleur rang concerné.', rows: [['1ᵉʳ (% le + haut)', '10'], ['2ᵉ', '8'], ['3ᵉ', '6'], ['4ᵉ', '4'], ['5ᵉ', '2'], ['6ᵉ (% le + bas)', '0']] },
    contrats: { titre: 'Contrat actif', desc: 'Nombre de membres avec un contrat actif (carte ou abonnement) ce mois-ci. Sert de base (dénominateur) au taux de non-fréquentation. N\'a pas de note propre.' },
    eventnom: { titre: 'Événement — nom', desc: 'Nom de l\'événement organisé ce mois-ci (texte libre, ex. « portes ouvertes »). Sans note en soi : c\'est le nombre de participants qui donne la note Événements.' },
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
    // Tooltip d'explication au survol des libellés d'indicateurs (Fréq, Évén,
    // Avis, Réf, Fid, Eng) dans les cartes studio. Contenu : BAREMES.
    document.addEventListener('mouseover', (e) => {
      const t = e.target.closest('.fan-g-lbl[data-aide]');
      if (t) showAideTip(t);
    });
    document.addEventListener('mouseout', (e) => {
      if (e.target.closest('.fan-g-lbl[data-aide]')) hideAideTip();
    });
  }
  let aideTipEl = null;
  function showAideTip(target) {
    const b = BAREMES[target.dataset.aide];
    if (!b) return;
    if (!aideTipEl) { aideTipEl = document.createElement('div'); aideTipEl.className = 'fan-tip'; document.body.appendChild(aideTipEl); }
    aideTipEl.innerHTML = '<b>' + esc(b.titre) + '</b><span>' + esc(b.desc) + '</span>';
    aideTipEl.style.display = 'block';
    const r = target.getBoundingClientRect();
    const tw = aideTipEl.offsetWidth, th = aideTipEl.offsetHeight;
    const x = Math.max(8, Math.min(window.innerWidth - tw - 8, r.left));
    let y = r.top - th - 8;
    if (y < 8) y = r.bottom + 8; // pas de place au-dessus -> en dessous
    aideTipEl.style.left = x + 'px';
    aideTipEl.style.top = y + 'px';
  }
  function hideAideTip() { if (aideTipEl) aideTipEl.style.display = 'none'; }
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
    cur.freqPts = freqPointsMap(cur.rows);
    cur.engPts = engPointsMap(cur.rows);
    if (prev && prev.ok) { prevTotals = sumTotals(prev.rows || []); prevTotals.fideles = sumFideles(prev.fideles); prevTotals.challMean = meanChall(prev.rows); }
    else prevTotals = null;
    // Aucune sélection par défaut : le panneau de saisie n'apparaît qu'après un clic
    // sur un studio (et disparaît à chaque changement de mois / réouverture).
    selStudio = '';
    render();
  }

  function rowOf(studio) { return cur.rows.find((r) => r.studio === studio) || { studio, nonFreq: 0, contrats: 0, evenements: [], avis: 0, refs: 0 }; }
  // Note d'un studio du mois courant (injecte ses points de fidélité).
  function noteOf(r) { return noteStudio(r, (cur.fidPts || {})[r.studio], (cur.freqPts || {})[r.studio], (cur.engPts || {})[r.studio]); }
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
    const reseau = noteReseau(cur.rows, cur.fidPts, cur.freqPts, cur.engPts);
    host.innerHTML = '<div class="fan-net-top"><span class="fan-net-lbl">Note réseau</span>' + stars(reseau, 'lg') + '</div>'
      + '<span class="fan-net-sub">basée sur ' + notes.length + '/' + STUDIOS.length + ' studios saisis</span>';
  }

  // Cartes studios
  function gauge(label, full, n, max, dec, aideKey) {
    const isNull = (n == null);
    const val = isNull ? '—' : ((dec ? fmtDec(n) : String(n)) + '/' + max);
    const w = isNull ? 0 : Math.max(0, Math.min(100, n / max * 100));
    // aideKey -> tooltip riche (BAREMES) au survol ; sinon title natif.
    const attr = aideKey ? ' data-aide="' + aideKey + '"' : ' title="' + esc(full) + '"';
    return '<div class="fan-g">'
      + '<span class="fan-g-lbl"' + attr + '>' + esc(label) + '</span>'
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
        ? gauge('Fréq', 'Fréquentation', null, 10, false, 'freq') + gauge('Évén', 'Événements', null, 5, false, 'even') + gauge('Avis', 'Avis Google', null, 5, false, 'avis') + gauge('Réf', 'Références', null, 10, false, 'refs') + gauge('Fid', 'Clients fidèles', null, 10, false, 'fid') + gauge('Eng', 'Engagement contrat', null, 10, false, 'eng')
        : gauge('Fréq', 'Fréquentation', n.freq, 10, false, 'freq') + gauge('Évén', 'Événements', n.even, 5, false, 'even') + gauge('Avis', 'Avis Google', n.avis, 5, false, 'avis') + gauge('Réf', 'Références', n.refs, 10, false, 'refs') + gauge('Fid', 'Clients fidèles', n.fid, 10, false, 'fid') + gauge('Eng', 'Engagement contrat', n.eng, 10, false, 'eng');
      const note40 = empty ? null : n.total;
      return '<button type="button" class="fan-card ' + state + sel + '" data-studio="' + esc(r.studio) + '" aria-pressed="' + (sel ? 'true' : 'false') + '">'
        + '<div class="fan-card-top"><span class="fan-card-nom">' + esc(r.studio) + '</span>'
        + '<span class="fan-badge ' + state + '">' + badge + '</span></div>'
        + '<div class="fan-card-note">' + stars(note40) + '</div>'
        + '<div class="fan-gauges">' + g + '</div>'
        + '</button>';
    }).join('');
    host.innerHTML = '<div class="fan-cards-grid">' + cards + '</div>';
    host.querySelectorAll('.fan-card').forEach((c) => c.addEventListener('click', () => {
      selStudio = c.dataset.studio; renderCards(); renderForm();
    }));
  }

  // ── Formulaire de saisie ────────────────────────────────────────────────────

  function renderForm() {
    const host = $('#fan-form');
    // Req 4 & 6 : rien tant qu'aucun studio n'est cliqué (ni à l'ouverture, ni après réouverture).
    if (!selStudio) { host.innerHTML = '<p class="fan-form-hint">Sélectionne un studio ci-dessus pour saisir ses données du mois.</p>'; return; }
    const r = rowOf(selStudio);
    const ro = !!cur.closed;                 // lecture seule si clôturé
    const n = noteOf(r);
    const dis = ro ? ' disabled' : '';
    const num = (champ, val) => '<input type="number" min="0" step="1" class="fan-num" data-champ="' + champ + '" value="' + (Number(val) || 0) + '"' + dis + '>';
    const ev = (r.evenements && r.evenements[0]) || { nom: '', participants: 0 };
    const nbFid = (cur.fideles || {})[r.studio];
    const fidVal = (nbFid == null) ? '—' : String(nbFid);
    const engVal = fmtPct(r.challengePct);
    // « ? » d'aide au-dessus de chaque champ (ce que c'est + comment c'est calculé).
    const help = (key) => ro ? '' : ' <button type="button" class="fan-help" data-help="' + key + '" aria-label="Aide">?</button>';
    const field = (lbl, inputHtml, helpKey, cls) => '<label class="fan-line-field' + (cls ? ' ' + cls : '') + '"><span class="fan-lbl">' + lbl + help(helpKey) + '</span>' + inputHtml + '</label>';

    host.innerHTML = '<div class="fan-form-card' + (ro ? ' is-readonly' : '') + '">'
      + '<div class="fan-form-head"><div><span class="fan-form-title">Saisie — <b>' + esc(selStudio) + '</b></span>'
      + '<span class="fan-form-mois">' + esc(capMois()) + (ro ? ' · figé' : '') + '</span></div>'
      + '<span class="fan-form-note" id="fan-form-note">' + stars(n.total) + '</span></div>'

      // Req 5 : une seule ligne de saisie, avec un « ? » par champ
      + '<div class="fan-line">'
      + field('Non fréquentants', num('nonFreq', r.nonFreq), 'freq')
      + field('Contrat actif', num('contrats', r.contrats), 'contrats')
      + field('Avis GMB', num('avis', r.avis), 'avis')
      + field('Réf', num('refs', r.refs), 'refs')
      + field('Event', '<input type="text" class="fan-ev-nom" placeholder="Nom" value="' + esc(ev.nom || '') + '"' + dis + '>', 'eventnom', 'fan-line-ev')
      + field('Participants', '<input type="number" class="fan-ev-part" min="0" step="1" value="' + (Number(ev.participants) || 0) + '"' + dis + '>', 'even')
      + field('Fidèle <span class="fan-auto-tag">RECAP</span>', '<input type="text" class="fan-fid-ro" value="' + esc(fidVal) + '" title="Automatique depuis RECAP" disabled>', 'fid', 'fan-line-fid')
      + field('Engagt <span class="fan-auto-tag">% Chall.</span>', '<input type="text" class="fan-fid-ro" value="' + esc(engVal) + '" title="% Challenge (auto, export Deciplus)" disabled>', 'eng', 'fan-line-fid')
      + '</div>'

      // Détail du calcul en direct
      + '<div class="fan-breakdown" id="fan-breakdown"></div>'

      // Pied : clôture (masqué si déjà clôturé)
      + (ro ? '' : '<div class="fan-form-foot"><span class="fan-close-reason" id="fan-close-reason"></span>'
        + '<button type="button" class="fan-btn-primary" id="fan-close-btn">Clôturer le mois</button></div>')
      + '</div>';

    if (!ro) wireForm(host, r);
    updateDerived(r);
    updateCloseBtn();
  }

  // Détail du calcul en direct (une ligne) + rafraîchissement de la note étoiles.
  function updateDerived(r) {
    const n = noteOf(r);
    const bd = $('#fan-breakdown');
    if (bd) {
      if (ratioError(r)) {
        bd.innerHTML = '<span class="fan-bd-err">⚠ Non fréquentants (' + r.nonFreq + ') dépasse Contrat actif (' + r.contrats + ')</span>';
      } else {
        const tx = tauxNonFreq(r);
        const freqTxt = (n.freq == null) ? 'Fréq —' : ('Fréq ' + n.freq + '/10 (taux ' + Math.round(tx) + '%, rang ' + freqRank(cur.rows, r.studio) + '/' + STUDIOS.length + ')');
        const nb = (cur.fideles || {})[r.studio];
        const fidTxt = (nb == null) ? 'Fid 0/10' : ('Fid ' + n.fid + '/10 (' + nb + ' fidèles, rang ' + fidRank(cur.fideles, r.studio) + '/' + STUDIOS.length + ')');
        const engTxt = (r.challengePct == null) ? 'Eng 0/10' : ('Eng ' + n.eng + '/10 (' + fmtPct(r.challengePct) + ' Challenge, rang ' + engRank(cur.rows, r.studio) + '/' + STUDIOS.length + ')');
        const parts = [freqTxt, 'Évén ' + n.even + '/5', 'Avis ' + n.avis + '/5', 'Réf ' + n.refs + '/10', fidTxt, engTxt];
        bd.innerHTML = '<span class="fan-bd-parts">' + parts.join(' · ') + '</span> <span class="fan-bd-total ' + noteClass(n.total) + '">= ' + fmtNote(n.total) + '/50</span>';
      }
    }
    const noteEl = $('#fan-form-note');
    if (noteEl) noteEl.innerHTML = stars(n.total);
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
    const refreshLive = () => { cur.freqPts = freqPointsMap(cur.rows); updateDerived(r); renderNetwork(); renderProgress(); renderCards(); renderTiles(); updateCloseBtn(); };
    host.querySelectorAll('.fan-num[data-champ]').forEach((inp) => {
      const commit = (save) => {
        const v = Math.max(0, Math.round(Number(inp.value) || 0));
        inp.value = v; r[inp.dataset.champ] = v;
        refreshLive();
        if (save) enregistrer({ [inp.dataset.champ]: v });
      };
      inp.addEventListener('input', () => commit(false));
      inp.addEventListener('change', () => commit(true));
    });
    // Événement unique (nom + participants) sur la ligne.
    const nom = host.querySelector('.fan-ev-nom'), part = host.querySelector('.fan-ev-part');
    if (nom && part) {
      const setEv = () => {
        const nm = nom.value;
        const p = Math.max(0, Math.round(Number(part.value) || 0)); part.value = p;
        r.evenements = (nm.trim() || p) ? [{ nom: nm, participants: p }] : [];
      };
      const live = () => { setEv(); refreshLive(); };
      const save = () => { live(); enregistrer({ evenements: r.evenements }); };
      nom.addEventListener('input', live); nom.addEventListener('change', save);
      part.addEventListener('input', live); part.addEventListener('change', save);
    }
    host.querySelectorAll('[data-help]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openPop(b, b.dataset.help); }));
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
  function meanChall(rows) { const v = (rows || []).map((r) => r.challengePct).filter((x) => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 100) : null; }

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
      + (function () { const cm = meanChall(cur.rows); return tile(cm == null ? '—' : (cm + ' %'), '% Challenge moyen', delta(cm, prevTotals && prevTotals.challMean, ' pts')); })()
      + '</div>';
    const g = host.querySelector('[data-goto-histo]');
    if (g) g.addEventListener('click', () => switchView('historique'));
  }

  // ── Popover barème ────────────────────────────────────────────────────────────
  function openPop(trigger, key) {
    closePop();
    const el = document.createElement('div');
    el.className = 'fan-pop' + (key === 'all' ? ' fan-pop-all' : ''); el.id = 'fan-pop'; el.setAttribute('role', 'dialog');
    if (key === 'all') {
      el.innerHTML = '<div class="fan-pop-t">Barème des notes — total /50</div>'
        + ['freq', 'even', 'avis', 'refs', 'fid', 'eng'].map((k) => { const b = BAREMES[k]; return '<div class="fan-pop-sec"><div class="fan-pop-st">' + esc(b.titre) + '</div><p class="fan-pop-d">' + esc(b.desc) + '</p></div>'; }).join('')
        + '<p class="fan-pop-d">La note /50 est ramenée en étoiles /5 (façon Google My Business).</p>';
    } else {
      const b = BAREMES[key]; if (!b) return;
      el.innerHTML = '<div class="fan-pop-t">' + esc(b.titre) + (b.rows ? ' — barème' : '') + '</div>'
        + '<p class="fan-pop-d">' + esc(b.desc) + '</p>'
        + (b.rows ? ('<table class="fan-pop-table"><tbody>'
          + b.rows.map((row) => '<tr><td>' + esc(row[0]) + '</td><td><b>' + esc(row[1]) + '</b></td></tr>').join('')
          + '</tbody></table>') : '');
    }
    document.body.appendChild(el);
    const rect = trigger.getBoundingClientRect();
    const top = rect.bottom + 8, left = Math.min(rect.left, window.innerWidth - el.offsetWidth - 12);
    el.style.top = top + 'px'; el.style.left = Math.max(12, left) + 'px';
    setTimeout(() => document.addEventListener('click', outsidePop, true), 0);
  }
  function outsidePop(e) { const el = $('#fan-pop'); if (el && !el.contains(e.target) && !(e.target.dataset && e.target.dataset.help != null)) closePop(); }
  function closePop() { const el = $('#fan-pop'); if (el) el.remove(); document.removeEventListener('click', outsidePop, true); }

  // ── Modale de clôture ─────────────────────────────────────────────────────────
  function openModal() {
    if (cur.rows.some((r) => !studioComplete(r))) return;   // garde-fou
    closeModal();
    const reseau = noteReseau(cur.rows, cur.fidPts, cur.freqPts, cur.engPts);
    const list = sortedRows().map((r) => {
      const t = noteOf(r).total;
      return '<li><span>' + esc(r.studio) + ' — ' + esc(capMois()) + '</span>' + stars(t) + '</li>';
    }).join('');
    const host = $('#fan-modal-host');
    host.innerHTML = '<div class="fan-modal-backdrop" data-cancel>'
      + '<div class="fan-modal" role="dialog" aria-modal="true" aria-labelledby="fan-modal-t">'
      + '<h3 id="fan-modal-t" class="fan-modal-t">Clôturer ' + esc(capMois()) + ' ?</h3>'
      + '<p class="fan-modal-warn">Les saisies seront figées. Tu pourras rouvrir le mois plus tard si besoin.</p>'
      + '<div class="fan-modal-net">Note réseau ' + stars(reseau) + '</div>'
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
      const freqp = freqPointsMap(m.rows);
      const engp = engPointsMap(m.rows);
      const per = {};
      m.rows.forEach((r) => { per[r.studio] = noteStudio(r, fp[r.studio], freqp[r.studio], engp[r.studio]).total; });
      noteMap[m.mois] = { per, reseau: noteReseau(m.rows, fp, freqp, engp) };
    });
    const moisAsc = months.map((m) => m.mois);
    const moisDesc = moisAsc.slice().reverse();

    // En tableau dense : la note est affichée en étoiles /5 (valeur = note50/10) avec ★.
    const star5 = (t) => (t == null ? '—' : fmtDec(t / 10) + '★');
    const cell = (t) => '<td class="fan-h-cell ' + noteClass(t) + '">' + star5(t) + '</td>';
    const corps = moisDesc.map((ym) => {
      const nm = noteMap[ym];
      return '<tr><td class="fan-h-mois">' + esc(moisLabel(ym, 0)) + '</td>'
        + STUDIOS.map((s) => cell(nm.per[s] == null ? null : nm.per[s])).join('')
        + '<td class="fan-h-cell fan-h-reseau ' + noteClass(nm.reseau) + '">' + star5(nm.reseau) + '</td></tr>';
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
        + '<span class="fan-trend-note">' + stars(cu) + '</span>'
        + '<span class="fan-trend-sub">' + arw + esc(d) + '</span></div>';
    }).join('');

    host.innerHTML = '<h3 class="fan-h3">Évolution des notes (étoiles /5)</h3>'
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
    // Données en note ÉTOILES /5 (note40 ÷ 8).
    const datasets = STUDIOS.map((s) => ({
      label: s, data: labels.map((ym) => { const v = noteMap[ym] ? noteMap[ym].per[s] : null; return v == null ? null : Math.round(v / 10 * 100) / 100; }),
      borderColor: STUDIO_COLORS[s], backgroundColor: STUDIO_COLORS[s], tension: 0.3, spanGaps: true, borderWidth: 2, pointRadius: 3,
    }));
    chart = new Chart(el.getContext('2d'), {
      type: 'line',
      data: { labels: labels.map((ym) => moisCourt(ym)), datasets },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        scales: {
          y: { min: 0, max: 5, ticks: { stepSize: 1, color: '#5c5b57' }, grid: { color: 'rgba(0,0,0,.08)' } },
          x: { ticks: { color: '#5c5b57' }, grid: { display: false } },
        },
        plugins: { legend: { labels: { color: '#111111', boxWidth: 12, usePointStyle: true } } },
      },
    });
  }

  return { open };
})();
