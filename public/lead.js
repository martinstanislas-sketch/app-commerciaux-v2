'use strict';
// ============================================================================
//  LEAD — Leads générés par club et par mois (saisie manuelle) + comparatif N-1.
//  Admin uniquement. Onglet « LEAD ». Un mois affiché, comparé au même mois
//  l'an dernier (N-1). Écran simple : 6 clubs, saisie inline, écart calculé.
// ============================================================================
const LeadUI = (function () {
  const $ = (s) => document.querySelector(s);
  const T = () => (window.localStorage.getItem('authToken') || '');
  const H = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + T() });
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let mois = '';
  let inited = false;

  // Mois par défaut = mois calendaire en cours.
  function moisParDefaut() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function moisLabel(ym, deltaAnnee) {
    const [a, m] = String(ym || '').split('-').map(Number);
    if (!a || !m) return ym || '';
    const d = new Date(a + (deltaAnnee || 0), m - 1, 1);
    const s = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function open() {
    if (!inited) { wire(); inited = true; }
    if (!$('#lead-mois').value) $('#lead-mois').value = moisParDefaut();
    mois = $('#lead-mois').value;
    charger();
  }

  function wire() {
    const mp = $('#lead-mois');
    if (mp) mp.addEventListener('change', () => { mois = mp.value; charger(); });
  }

  async function charger() {
    const host = $('#lead-table-wrap');
    if (!host) return;
    host.innerHTML = '<p class="lead-loading">Chargement…</p>';
    let data = null;
    try { data = await (await fetch('/api/leads/' + mois, { headers: H() })).json(); }
    catch (_) { host.innerHTML = '<p class="lead-loading">Erreur de chargement.</p>'; return; }
    if (!data || !data.ok) { host.innerHTML = '<p class="lead-loading">Erreur de chargement.</p>'; return; }
    render(data);
  }

  function ecartCell(nb, nbN1) {
    const diff = nb - nbN1;
    const signe = diff > 0 ? '+' : '';
    let cls = 'lead-flat', fleche = '→';
    if (diff > 0) { cls = 'lead-up'; fleche = '▲'; }
    else if (diff < 0) { cls = 'lead-down'; fleche = '▼'; }
    let pct = '';
    if (nbN1 > 0) pct = ' <span class="lead-pct">(' + signe + Math.round((diff / nbN1) * 100) + '%)</span>';
    else if (nb > 0) pct = ' <span class="lead-pct">(nouveau)</span>';
    return '<span class="lead-ecart ' + cls + '">' + fleche + ' ' + signe + diff + pct + '</span>';
  }

  // Cellule input éditable pour un champ (nb / rdvFixe / rdvVenu).
  function inputCell(champ, club, valeur) {
    return '<td class="lead-input-cell"><input type="number" class="lead-input" min="0" step="1" value="'
      + valeur + '" data-champ="' + champ + '" data-club="' + esc(club) + '"></td>';
  }

  // KPI de référence : nombre de leads ÷ nombre de RDV venus (« — » si aucun venu).
  function ratioCell(nb, venu) {
    const v = (venu > 0) ? (nb / venu) : null;
    const txt = (v == null) ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return '<td class="lead-ratio-cell"><span class="lead-ratio">' + txt + '</span></td>';
  }

  function render(data) {
    const host = $('#lead-table-wrap');
    const rows = data.rows || [];
    let totalNb = 0, totalN1 = 0, totalFixe = 0, totalVenu = 0;
    const corps = rows.map((r) => {
      totalNb += r.nb; totalN1 += r.nbN1; totalFixe += (r.rdvFixe || 0); totalVenu += (r.rdvVenu || 0);
      return '<tr>'
        + '<td class="lead-club">' + esc(r.club) + '</td>'
        + inputCell('nb', r.club, r.nb)
        + '<td class="lead-n1">' + r.nbN1 + '</td>'
        + '<td class="lead-ecart-cell">' + ecartCell(r.nb, r.nbN1) + '</td>'
        + inputCell('rdvFixe', r.club, r.rdvFixe || 0)
        + inputCell('rdvVenu', r.club, r.rdvVenu || 0)
        + ratioCell(r.nb, r.rdvVenu || 0)
        + '</tr>';
    }).join('');
    const totalRow = '<tr class="lead-total">'
      + '<td class="lead-club">Total réseau</td>'
      + '<td class="lead-input-cell"><b>' + totalNb + '</b></td>'
      + '<td class="lead-n1"><b>' + totalN1 + '</b></td>'
      + '<td class="lead-ecart-cell">' + ecartCell(totalNb, totalN1) + '</td>'
      + '<td class="lead-input-cell"><b>' + totalFixe + '</b></td>'
      + '<td class="lead-input-cell"><b>' + totalVenu + '</b></td>'
      + '<td class="lead-ratio-cell"><b>' + (totalVenu > 0 ? (totalNb / totalVenu).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—') + '</b></td>'
      + '</tr>';
    host.innerHTML = '<table class="lead-table"><thead><tr>'
      + '<th>Club</th>'
      + '<th>Leads · ' + esc(moisLabel(mois, 0)) + '</th>'
      + '<th>N-1 · ' + esc(moisLabel(mois, -1)) + '</th>'
      + '<th>Écart</th>'
      + '<th>RDV fixés</th>'
      + '<th>RDV venus</th>'
      + '<th title="Nombre de leads ÷ nombre de RDV venus">Leads / RDV venu</th>'
      + '</tr></thead><tbody>' + corps + totalRow + '</tbody></table>';
    host.querySelectorAll('.lead-input').forEach((inp) => {
      inp.addEventListener('change', () => enregistrer(inp.dataset.champ, inp.dataset.club, inp.value, inp));
    });
  }

  async function enregistrer(champ, club, valeur, inp) {
    const val = Math.max(0, Math.round(Number(valeur) || 0));
    if (inp) { inp.value = val; inp.classList.add('lead-saving'); }
    try {
      const r = await (await fetch('/api/leads/' + mois, { method: 'PATCH', headers: H(),
        body: JSON.stringify({ club, [champ]: val }) })).json();
      if (inp) { inp.classList.remove('lead-saving'); inp.classList.add('lead-saved'); setTimeout(() => inp.classList.remove('lead-saved'), 700); }
      // Seul le champ « nb » influe sur l'écart/total leads → on ne recharge que dans ce cas.
      if (r && r.ok && champ === 'nb') charger();
    } catch (_) { if (inp) inp.classList.remove('lead-saving'); }
  }

  return { open };
})();
