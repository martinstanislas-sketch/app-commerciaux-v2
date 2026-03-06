// ─── Auth State ─────────────────────────────────────────────
let authToken = localStorage.getItem('authToken') || null;
let currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');

function isAdmin() {
  return currentUser && currentUser.role === 'admin';
}

function getMyRepId() {
  return currentUser ? currentUser.sales_rep_id : null;
}

function getMyName() {
  return currentUser ? currentUser.name : null;
}

// ─── State ──────────────────────────────────────────────────
let currentWeekStart = '';
let salesReps = [];
let currentMonth = '';
let isLocked = false;

// ─── Helpers ────────────────────────────────────────────────

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return formatDate(date);
}

function formatDate(d) {
  const date = new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

function getPreviousWeekMonday() {
  const today = new Date();
  const thisMonday = getMonday(today);
  return addDays(thisMonday, -7);
}

function formatWeekLabel(weekStart) {
  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(weekStart + 'T00:00:00');
  end.setDate(end.getDate() + 6);

  const opts = { day: 'numeric', month: 'short' };
  const startStr = start.toLocaleDateString('fr-FR', opts);
  const endStr = end.toLocaleDateString('fr-FR', opts);
  const year = end.getFullYear();
  return `${startStr} → ${endStr} ${year}`;
}

function formatMonthLabel(month) {
  const [y, m] = month.split('-');
  const date = new Date(parseInt(y), parseInt(m) - 1, 1);
  return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

function fmt(n) {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

function fmtEuro(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function formatAnalysis(text) {
  // Convert markdown-like text to HTML
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong class="analysis-heading">$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, (match) => '<ul>' + match + '</ul>')
    .replace(/<\/ul>\s*<ul>/g, '') // merge adjacent ul tags
    .replace(/\n{2,}/g, '<br>')
    .replace(/\n/g, '');
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  const res = await fetch(`/api${path}`, {
    headers,
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Erreur ${res.status}`);
  }
  return res.json();
}

// ─── Auth UI ────────────────────────────────────────────────

function showLogin() {
  document.getElementById('login-overlay').classList.remove('hidden');
}

function hideLogin() {
  document.getElementById('login-overlay').classList.add('hidden');
}

function updateUserUI() {
  const infoDiv = document.getElementById('user-info');
  const nameSpan = document.getElementById('user-name');
  if (currentUser) {
    nameSpan.textContent = currentUser.role === 'admin'
      ? 'Admin'
      : currentUser.name;
    infoDiv.classList.remove('hidden');
  } else {
    infoDiv.classList.add('hidden');
  }
}

function initAuthUI() {
  // Login form
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pinInput = document.getElementById('login-pin');
    const errorDiv = document.getElementById('login-error');
    errorDiv.classList.add('hidden');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput.value })
      });
      const data = await res.json();

      if (!res.ok) {
        errorDiv.textContent = data.error || 'Code incorrect';
        errorDiv.classList.remove('hidden');
        pinInput.value = '';
        pinInput.focus();
        return;
      }

      // Success
      authToken = data.token;
      currentUser = { role: data.role, name: data.name, sales_rep_id: data.sales_rep_id };
      localStorage.setItem('authToken', authToken);
      localStorage.setItem('currentUser', JSON.stringify(currentUser));

      pinInput.value = '';
      hideLogin();
      updateUserUI();
      await bootApp();
    } catch (err) {
      errorDiv.textContent = 'Erreur de connexion';
      errorDiv.classList.remove('hidden');
    }
  });

  // Logout button
  document.getElementById('btn-logout').addEventListener('click', async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {}
      });
    } catch (_) { /* ignore */ }

    authToken = null;
    currentUser = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    updateUserUI();
    showLogin();
  });
}

let _appBooted = false;

async function bootApp() {
  salesReps = await api('/sales-reps');
  currentWeekStart = getPreviousWeekMonday();

  const now = new Date();
  currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Only bind event listeners once to avoid duplicates on re-login
  if (!_appBooted) {
    initTabs();
    initWeekNav();
    initVentesTab();
    initMensuelTab();
    initModal();
    _appBooted = true;
  }

  loadDashboard();
}

// ─── Init ───────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  initAuthUI();

  // Check existing session
  if (authToken) {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        currentUser = data;
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        hideLogin();
        updateUserUI();
        await bootApp();
        return;
      }
    } catch (_) { /* ignore */ }

    // Session expired
    authToken = null;
    currentUser = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
  }

  showLogin();
});

// ─── Tabs ───────────────────────────────────────────────────

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');

      if (btn.dataset.tab === 'ventes') loadSales();
      if (btn.dataset.tab === 'mensuel') loadMonthlySummary();
    });
  });
}

// ─── Week Navigation ────────────────────────────────────────

function initWeekNav() {
  const prevBtn = document.getElementById('prev-week');
  const nextBtn = document.getElementById('next-week');
  const picker = document.getElementById('week-picker');
  const lockBtn = document.getElementById('lock-week');

  prevBtn.addEventListener('click', () => {
    currentWeekStart = addDays(currentWeekStart, -7);
    loadDashboard();
  });

  nextBtn.addEventListener('click', () => {
    currentWeekStart = addDays(currentWeekStart, 7);
    loadDashboard();
  });

  picker.addEventListener('change', () => {
    if (picker.value) {
      currentWeekStart = getMonday(picker.value);
      loadDashboard();
    }
  });

  lockBtn.addEventListener('click', async () => {
    try {
      await api(`/weeks/${currentWeekStart}/lock`, {
        method: 'PUT',
        body: { locked: !isLocked }
      });
      loadDashboard();
    } catch (e) {
      alert(e.message);
    }
  });
}

function updateWeekLabel() {
  document.getElementById('week-label').textContent = formatWeekLabel(currentWeekStart);
  document.getElementById('v-week-label').textContent = formatWeekLabel(currentWeekStart);
  document.getElementById('export-week-csv').href = `/api/export/week/${currentWeekStart}`;
}

// ─── Dashboard ──────────────────────────────────────────────

async function loadDashboard() {
  updateWeekLabel();

  const data = await api(`/weeks/${currentWeekStart}/dashboard`);

  isLocked = data.commerciaux.some(c => c.locked);
  const lockBtn = document.getElementById('lock-week');
  lockBtn.textContent = isLocked ? 'Deverrouiller' : 'Verrouiller';
  lockBtn.classList.toggle('locked', isLocked);

  renderCards(data.commerciaux);
  renderRankings(data);
}

function renderCards(commerciaux) {
  const container = document.getElementById('cards-container');
  container.innerHTML = '';

  for (const c of commerciaux) {
    const card = document.createElement('div');
    card.className = 'rep-card';

    const objectifBadge = c.nb_ventes > 0 || c.hours_worked > 0
      ? `<span class="badge-objectif ${c.objectif_atteint ? 'atteint' : 'non-atteint'}">
           ${c.objectif_atteint ? 'Objectif atteint' : 'Objectif non atteint'}
         </span>`
      : '';

    const settingsDisabled = isLocked || !isAdmin();

    card.innerHTML = `
      <h2>${c.rep_name} ${objectifBadge}</h2>
      <div class="settings-row" ${!isAdmin() ? 'style="display:none"' : ''}>
        <div class="field">
          <label>Heures travaillées</label>
          <input type="number" step="0.5" min="0" value="${c.hours_worked}"
                 data-rep-id="${c.sales_rep_id}" data-field="hours"
                 ${settingsDisabled ? 'disabled' : ''}>
        </div>
        <div class="field">
          <label>Objectif €/h</label>
          <select data-rep-id="${c.sales_rep_id}" data-field="target" ${settingsDisabled ? 'disabled' : ''}>
            <option value="200" ${c.target_per_hour === 200 ? 'selected' : ''}>200</option>
            <option value="250" ${c.target_per_hour === 250 ? 'selected' : ''}>250</option>
            <option value="custom" ${c.target_per_hour !== 200 && c.target_per_hour !== 250 ? 'selected' : ''}>Autre</option>
          </select>
          <input type="number" step="1" min="0" value="${c.target_per_hour}"
                 data-rep-id="${c.sales_rep_id}" data-field="target-custom"
                 style="margin-top:4px;${c.target_per_hour !== 200 && c.target_per_hour !== 250 ? '' : 'display:none'}"
                 ${settingsDisabled ? 'disabled' : ''}>
        </div>
      </div>
      <div class="kpi-grid">
        <div class="kpi-item">
          <div class="kpi-label">CA Total</div>
          <div class="kpi-value">${fmtEuro(c.ca)}</div>
        </div>
        <div class="kpi-item">
          <div class="kpi-label">Nb Ventes</div>
          <div class="kpi-value">${c.nb_ventes}</div>
        </div>
        <div class="kpi-item">
          <div class="kpi-label">Panier Moyen</div>
          <div class="kpi-value">${fmtEuro(c.panier_moyen)}</div>
        </div>
        <div class="kpi-item ${c.objectif_atteint ? 'success' : (c.hours_worked > 0 ? 'danger' : '')}">
          <div class="kpi-label">Ratio CA/h</div>
          <div class="kpi-value">${fmt(c.ratio)} €/h</div>
        </div>
      </div>
      <button class="btn-add-sale" data-rep-id="${c.sales_rep_id}" ${isLocked ? 'disabled' : ''}>
        + Ajouter une vente
      </button>
    `;

    // Event: hours change
    const hoursInput = card.querySelector('input[data-field="hours"]');
    hoursInput.addEventListener('change', () => saveSettings(c.sales_rep_id, card));

    // Event: target select
    const targetSelect = card.querySelector('select[data-field="target"]');
    const customInput = card.querySelector('input[data-field="target-custom"]');

    targetSelect.addEventListener('change', () => {
      if (targetSelect.value === 'custom') {
        customInput.style.display = '';
        customInput.focus();
      } else {
        customInput.style.display = 'none';
        customInput.value = targetSelect.value;
        saveSettings(c.sales_rep_id, card);
      }
    });

    customInput.addEventListener('change', () => saveSettings(c.sales_rep_id, card));

    // Event: add sale
    card.querySelector('.btn-add-sale').addEventListener('click', () => {
      openSaleModal(c.sales_rep_id);
    });

    container.appendChild(card);
  }
}

async function saveSettings(repId, card) {
  const hours = parseFloat(card.querySelector('input[data-field="hours"]').value) || 0;
  const targetSelect = card.querySelector('select[data-field="target"]');
  let target;
  if (targetSelect.value === 'custom') {
    target = parseFloat(card.querySelector('input[data-field="target-custom"]').value) || 200;
  } else {
    target = parseFloat(targetSelect.value);
  }

  try {
    await api(`/weeks/${currentWeekStart}/settings/${repId}`, {
      method: 'PUT',
      body: { hours_worked: hours, target_per_hour: target }
    });
    loadDashboard();
  } catch (e) {
    alert(e.message);
  }
}

function renderRankings(data) {
  renderRankTable('rank-ca', data.classement_ca, v => fmtEuro(v));
  renderRankTable('rank-ratio', data.classement_ratio, v => `${fmt(v)} €/h`);
  renderRankTable('rank-panier', data.classement_panier, v => fmtEuro(v));
}

function renderRankTable(tableId, ranking, formatter) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  tbody.innerHTML = '';
  for (const r of ranking) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="rank-medal r${r.rang}">${r.rang}</span></td>
      <td>${r.name}</td>
      <td style="text-align:right;font-weight:600">${formatter(r.value)}</td>
    `;
    tbody.appendChild(tr);
  }
}

// ─── Ventes Tab ─────────────────────────────────────────────

function initVentesTab() {
  document.getElementById('v-prev-week').addEventListener('click', () => {
    currentWeekStart = addDays(currentWeekStart, -7);
    loadDashboard();
    loadSales();
  });

  document.getElementById('v-next-week').addEventListener('click', () => {
    currentWeekStart = addDays(currentWeekStart, 7);
    loadDashboard();
    loadSales();
  });

  document.getElementById('v-week-picker').addEventListener('change', (e) => {
    if (e.target.value) {
      currentWeekStart = getMonday(e.target.value);
      loadDashboard();
      loadSales();
    }
  });

  // Filter dropdown
  const filterSelect = document.getElementById('v-filter-rep');
  for (const rep of salesReps) {
    const opt = document.createElement('option');
    opt.value = rep.id;
    opt.textContent = rep.name;
    filterSelect.appendChild(opt);
  }
  filterSelect.addEventListener('change', loadSales);

  document.getElementById('btn-add-sale').addEventListener('click', () => openSaleModal());
}

async function loadSales() {
  updateWeekLabel();
  const filterRep = document.getElementById('v-filter-rep').value;
  let url = `/weeks/${currentWeekStart}/sales`;
  if (filterRep) url += `?sales_rep_id=${filterRep}`;

  const sales = await api(url);
  const tbody = document.querySelector('#sales-table tbody');
  tbody.innerHTML = '';

  if (sales.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-light);padding:24px">Aucune vente cette semaine</td></tr>';
    return;
  }

  for (const s of sales) {
    const ribClass = s.rib_status === 'Reçu' ? 'rib-recu' :
                     s.rib_status === 'En attente' ? 'rib-attente' : 'rib-non-fourni';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(s.date + 'T00:00:00').toLocaleDateString('fr-FR')}</td>
      <td>${s.rep_name}</td>
      <td style="font-weight:600">${fmtEuro(s.amount)}</td>
      <td>${s.client_first_name}</td>
      <td>${s.client_last_name}</td>
      <td><span class="rib-badge ${ribClass}">${s.rib_status || 'Non fourni'}</span></td>
      <td class="actions">
        <button class="btn-sm" onclick="editSale(${s.id})">Modifier</button>
        <button class="btn-sm danger" onclick="deleteSale(${s.id})">Supprimer</button>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

// ─── Modal ──────────────────────────────────────────────────

function initModal() {
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Populate rep dropdown
  const repSelect = document.getElementById('sale-rep');
  for (const rep of salesReps) {
    const opt = document.createElement('option');
    opt.value = rep.id;
    opt.textContent = rep.name;
    repSelect.appendChild(opt);
  }

  document.getElementById('sale-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveSale();
  });
}

function openSaleModal(repId = null, saleData = null) {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('hidden');

  document.getElementById('modal-title').textContent = saleData ? 'Modifier la vente' : 'Ajouter une vente';
  document.getElementById('sale-id').value = saleData ? saleData.id : '';
  document.getElementById('sale-rep').value = repId || saleData?.sales_rep_id || salesReps[0]?.id;

  // Default date: first day of current week
  const weekEnd = addDays(currentWeekStart, 6);
  const dateInput = document.getElementById('sale-date');
  dateInput.value = saleData?.date || currentWeekStart;
  dateInput.min = currentWeekStart;
  dateInput.max = weekEnd;

  document.getElementById('sale-amount').value = saleData?.amount || '';
  document.getElementById('sale-firstname').value = saleData?.client_first_name || '';
  document.getElementById('sale-lastname').value = saleData?.client_last_name || '';
  document.getElementById('sale-rib-status').value = saleData?.rib_status || 'Non fourni';
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('sale-form').reset();
}

async function saveSale() {
  const id = document.getElementById('sale-id').value;
  const body = {
    sales_rep_id: parseInt(document.getElementById('sale-rep').value),
    date: document.getElementById('sale-date').value,
    amount: parseFloat(document.getElementById('sale-amount').value),
    client_first_name: document.getElementById('sale-firstname').value.trim(),
    client_last_name: document.getElementById('sale-lastname').value.trim(),
    rib_status: document.getElementById('sale-rib-status').value
  };

  try {
    if (id) {
      await api(`/sales/${id}`, { method: 'PUT', body });
    } else {
      await api('/sales', { method: 'POST', body });
    }
    closeModal();
    loadDashboard();
    // Also reload sales if on that tab
    if (document.getElementById('tab-ventes').classList.contains('active')) {
      loadSales();
    }
  } catch (e) {
    alert(e.message);
  }
}

window.editSale = async function(id) {
  const sales = await api(`/weeks/${currentWeekStart}/sales`);
  const sale = sales.find(s => s.id === id);
  if (sale) {
    openSaleModal(null, sale);
  }
};

window.deleteSale = async function(id) {
  if (!confirm('Supprimer cette vente ?')) return;
  try {
    await api(`/sales/${id}`, { method: 'DELETE' });
    loadDashboard();
    loadSales();
  } catch (e) {
    alert(e.message);
  }
};

// ─── Mensuel Tab ────────────────────────────────────────────

function initMensuelTab() {
  document.getElementById('prev-month').addEventListener('click', () => {
    const [y, m] = currentMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    loadMonthlySummary();
  });

  document.getElementById('next-month').addEventListener('click', () => {
    const [y, m] = currentMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    loadMonthlySummary();
  });

  document.getElementById('month-picker').addEventListener('change', (e) => {
    if (e.target.value) {
      currentMonth = e.target.value;
      loadMonthlySummary();
    }
  });
}

let lastMonthlyData = null;

async function loadMonthlySummary() {
  document.getElementById('month-label').textContent = formatMonthLabel(currentMonth);
  document.getElementById('month-picker').value = currentMonth;
  document.getElementById('export-month-csv').href = `/api/export/month/${currentMonth}`;

  // Show/hide admin-only controls
  const pdfBtn = document.getElementById('btn-recap-pdf');
  if (pdfBtn) pdfBtn.style.display = isAdmin() ? '' : 'none';

  const data = await api(`/months/${currentMonth}/summary`);
  lastMonthlyData = data;

  // ── Podium par ratio mensuel ──
  const sorted = [...data.rep_stats].sort((a, b) => b.ratio_mensuel - a.ratio_mensuel);
  const podiumOrder = sorted.length >= 3
    ? [sorted[1], sorted[0], sorted[2]]
    : [...sorted];
  const medals = { 0: 'gold', 1: 'silver', 2: 'bronze' };
  const rankLabels = { 0: '1er', 1: '2e', 2: '3e' };

  const repsDiv = document.getElementById('monthly-reps');
  let podiumHTML = '<h3>Classement Ratio</h3><div class="podium">';

  podiumOrder.forEach((r) => {
    const originalIdx = sorted.indexOf(r);
    const medal = medals[originalIdx] || '';
    const rank = rankLabels[originalIdx] || '';

    podiumHTML += `
      <div class="podium-step ${medal}">
        <div class="podium-rank">${rank}</div>
        <div class="podium-name">${r.name}</div>
        <div class="podium-ratio">${fmt(r.ratio_mensuel)} €/h</div>
        <div class="podium-block ${medal}">
          <div class="podium-ca">${fmtEuro(r.ca)}</div>
          <div class="podium-detail">${r.nb_ventes} ventes</div>
          <div class="podium-detail">Moy: ${fmtEuro(r.panier_moyen)}</div>
          <div class="podium-detail">${fmt(r.total_hours)}h</div>
        </div>
      </div>`;
  });
  podiumHTML += '</div>';

  // ── Classement Panier Moyen ──
  const sortedPanier = [...data.rep_stats].sort((a, b) => b.panier_moyen - a.panier_moyen);
  podiumHTML += '<h3 style="margin-top:28px">Classement Panier Moyen</h3><div class="ranking-table-wrap">';
  sortedPanier.forEach((r, i) => {
    const medal = medals[i] || '';
    podiumHTML += `
      <div class="ranking-row ${medal}">
        <span class="rank-medal r${i + 1}">${i + 1}</span>
        <span class="ranking-name">${r.name}</span>
        <span class="ranking-value">${fmtEuro(r.panier_moyen)}</span>
      </div>`;
  });
  podiumHTML += '</div>';

  repsDiv.innerHTML = podiumHTML;

  // ── Panier moyen global (en bas) ──
  const globalDiv = document.getElementById('monthly-global');
  globalDiv.innerHTML = `
    <div class="monthly-kpi-grid">
      <div class="monthly-kpi">
        <div class="label">Panier Moyen Global</div>
        <div class="value">${fmtEuro(data.global.panier_moyen)}</div>
      </div>
    </div>
  `;

  // ── Analyse individuelle avec checkboxes ──
  await renderAnalysisSection(data);

  // ── Graphiques évolution hebdomadaire ──
  await loadWeeklyCharts();
}

// ─── Charts ──────────────────────────────────────────────────

let chartRatio = null;
let chartPanier = null;

const REP_COLORS = {
  'Marvin':  { line: '#002366', bg: 'rgba(0,35,102,.1)' },
  'Magali':  { line: '#fa6863', bg: 'rgba(250,104,99,.1)' },
  'Fabian':  { line: '#0f52ba', bg: 'rgba(15,82,186,.1)' }
};

async function loadWeeklyCharts() {
  try {
    const breakdown = await api(`/months/${currentMonth}/weekly-breakdown`);
    if (!breakdown.weeks || breakdown.weeks.length === 0) {
      document.getElementById('monthly-charts').style.display = 'none';
      return;
    }
    document.getElementById('monthly-charts').style.display = '';

    // Filter out leading weeks where ALL reps have 0 values (no data yet)
    let startIdx = 0;
    for (let i = 0; i < breakdown.weeks.length; i++) {
      const allZero = breakdown.weeks[i].reps.every(r => r.ca === 0 && r.nb_ventes === 0);
      if (!allZero) break;
      startIdx = i + 1;
    }
    const filteredWeeks = breakdown.weeks.slice(startIdx);
    if (filteredWeeks.length === 0) {
      document.getElementById('monthly-charts').style.display = 'none';
      return;
    }

    const labels = filteredWeeks.map(w => w.label);
    const reps = filteredWeeks[0].reps;

    // Build datasets for Ratio
    const ratioDatasets = reps.map(rep => {
      const colors = REP_COLORS[rep.name] || { line: '#999', bg: 'rgba(153,153,153,.1)' };
      return {
        label: rep.name,
        data: filteredWeeks.map(w => {
          const r = w.reps.find(rr => rr.sales_rep_id === rep.sales_rep_id);
          return r ? Math.round(r.ratio * 100) / 100 : 0;
        }),
        borderColor: colors.line,
        backgroundColor: colors.bg,
        tension: 0.3,
        fill: true,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 2.5
      };
    });

    // Build datasets for Panier Moyen
    const panierDatasets = reps.map(rep => {
      const colors = REP_COLORS[rep.name] || { line: '#999', bg: 'rgba(153,153,153,.1)' };
      return {
        label: rep.name,
        data: filteredWeeks.map(w => {
          const r = w.reps.find(rr => rr.sales_rep_id === rep.sales_rep_id);
          return r ? Math.round(r.panier_moyen) : 0;
        }),
        borderColor: colors.line,
        backgroundColor: colors.bg,
        tension: 0.3,
        fill: true,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 2.5
      };
    });

    const commonOptions = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16, font: { size: 11 } } },
        tooltip: {
          backgroundColor: '#212121',
          titleFont: { size: 12 },
          bodyFont: { size: 11 },
          cornerRadius: 6,
          padding: 10
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 10 } }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(0,0,0,.05)' },
          ticks: { font: { size: 10 } }
        }
      }
    };

    // Destroy old charts if they exist
    const existingRatio = Chart.getChart('chart-ratio');
    if (existingRatio) existingRatio.destroy();
    const existingPanier = Chart.getChart('chart-panier');
    if (existingPanier) existingPanier.destroy();

    const ctxRatio = document.getElementById('chart-ratio').getContext('2d');
    chartRatio = new Chart(ctxRatio, {
      type: 'line',
      data: { labels, datasets: ratioDatasets },
      options: {
        ...commonOptions,
        plugins: {
          ...commonOptions.plugins,
          title: { display: true, text: 'Ratio CA/h (€/h)', font: { size: 13, weight: '700' }, color: '#002366', padding: { bottom: 12 } }
        },
        scales: {
          ...commonOptions.scales,
          y: { ...commonOptions.scales.y, ticks: { ...commonOptions.scales.y.ticks, callback: v => v + ' €/h' } }
        }
      }
    });

    const ctxPanier = document.getElementById('chart-panier').getContext('2d');
    chartPanier = new Chart(ctxPanier, {
      type: 'line',
      data: { labels, datasets: panierDatasets },
      options: {
        ...commonOptions,
        plugins: {
          ...commonOptions.plugins,
          title: { display: true, text: 'Panier Moyen (€)', font: { size: 13, weight: '700' }, color: '#002366', padding: { bottom: 12 } }
        },
        scales: {
          ...commonOptions.scales,
          y: { ...commonOptions.scales.y, ticks: { ...commonOptions.scales.y.ticks, callback: v => v + ' €' } }
        }
      }
    });
  } catch (e) {
    console.error('Erreur chargement graphiques:', e);
  }
}

// ─── Analyse par commercial (données hebdomadaires) ─────────

function analyzeRepWeekly(data, weeklyBreakdown) {
  const sorted = [...data.rep_stats].sort((a, b) => b.ratio_mensuel - a.ratio_mensuel);
  const sortedPanier = [...data.rep_stats].sort((a, b) => b.panier_moyen - a.panier_moyen);
  const totalHours = data.rep_stats.reduce((s, r) => s + r.total_hours, 0);
  const ratioGlobal = totalHours > 0 ? data.global.ca / totalHours : 0;
  const avgPanier = data.global.panier_moyen;
  const avgVentes = data.global.nb_ventes / data.rep_stats.length;

  // Filter weeks with activity
  const activeWeeks = weeklyBreakdown.weeks.filter(w => w.reps.some(r => r.ca > 0));

  return data.rep_stats.map(r => {
    const points = [];
    const travail = [];

    // Extract this rep's weekly stats
    const weeks = activeWeeks.map(w => {
      const rd = w.reps.find(rr => rr.sales_rep_id === r.id || rr.name === r.name);
      return { label: w.label, ca: rd?.ca || 0, nb: rd?.nb_ventes || 0, pm: rd?.panier_moyen || 0, h: rd?.hours_worked || 0, ratio: rd?.ratio || 0 };
    });
    const nbWeeks = weeks.length;
    if (nbWeeks === 0) return { name: r.name, points: ['Pas de données'], travail: ['Pas de données'] };

    // ── Weekly ratios, paniers, volumes ──
    const ratios = weeks.map(w => w.ratio);
    const paniers = weeks.map(w => w.pm);
    const volumes = weeks.map(w => w.nb);
    const cas = weeks.map(w => w.ca);

    const bestRatioWeek = weeks.reduce((a, b) => a.ratio > b.ratio ? a : b);
    const worstRatioWeek = weeks.reduce((a, b) => a.ratio < b.ratio ? a : b);
    const bestPanierWeek = weeks.reduce((a, b) => a.pm > b.pm ? a : b);
    const worstPanierWeek = weeks.filter(w => w.nb > 0).reduce((a, b) => a.pm < b.pm ? a : b, weeks[0]);
    const bestCAWeek = weeks.reduce((a, b) => a.ca > b.ca ? a : b);
    const bestVolumeWeek = weeks.reduce((a, b) => a.nb > b.nb ? a : b);

    // ── Trend analysis (comparing last half vs first half) ──
    const mid = Math.ceil(nbWeeks / 2);
    const firstHalfRatio = ratios.slice(0, mid).reduce((s, v) => s + v, 0) / mid;
    const secondHalfRatio = ratios.slice(mid).reduce((s, v) => s + v, 0) / (nbWeeks - mid);
    const ratioTrend = secondHalfRatio - firstHalfRatio;
    const ratioTrendPct = firstHalfRatio > 0 ? (ratioTrend / firstHalfRatio * 100) : 0;

    const firstHalfPanier = paniers.slice(0, mid).filter(v => v > 0);
    const secondHalfPanier = paniers.slice(mid).filter(v => v > 0);
    const avgFirstPanier = firstHalfPanier.length ? firstHalfPanier.reduce((s, v) => s + v, 0) / firstHalfPanier.length : 0;
    const avgSecondPanier = secondHalfPanier.length ? secondHalfPanier.reduce((s, v) => s + v, 0) / secondHalfPanier.length : 0;
    const panierTrend = avgSecondPanier - avgFirstPanier;

    // ── Consistency (coefficient of variation) ──
    const avgRatio = ratios.reduce((s, v) => s + v, 0) / nbWeeks;
    const stdRatio = Math.sqrt(ratios.reduce((s, v) => s + (v - avgRatio) ** 2, 0) / nbWeeks);
    const cvRatio = avgRatio > 0 ? stdRatio / avgRatio : 0;

    // ── Team weekly comparisons ──
    let weeksAsLeader = 0;
    let weeksAsLast = 0;
    activeWeeks.forEach(w => {
      const reps = w.reps.filter(rr => rr.ca > 0);
      if (reps.length === 0) return;
      const repData = reps.find(rr => rr.name === r.name);
      if (!repData) return;
      const maxRatio = Math.max(...reps.map(rr => rr.ratio));
      const minRatio = Math.min(...reps.map(rr => rr.ratio));
      if (repData.ratio === maxRatio) weeksAsLeader++;
      if (repData.ratio === minRatio && reps.length > 1) weeksAsLast++;
    });

    // ══════════ POINTS FORTS ══════════

    // 1. Ranking mensuel
    const ratioRank = sorted.indexOf(r) + 1;
    if (ratioRank === 1) {
      points.push('Meilleur ratio CA/h du mois : ' + fmt(r.ratio_mensuel) + ' €/h (vs ' + fmt(sorted[1].ratio_mensuel) + ' €/h pour ' + sorted[1].name + ')');
    }
    const panierRank = sortedPanier.indexOf(r) + 1;
    if (panierRank === 1) {
      points.push('Meilleur panier moyen du mois : ' + fmtEuro(r.panier_moyen) + ' (vs moy. équipe ' + fmtEuro(avgPanier) + ')');
    }

    // 2. Best week
    points.push('Meilleure semaine (' + bestCAWeek.label + ') : ' + fmtEuro(bestCAWeek.ca) + ' de CA, ' + bestCAWeek.nb + ' ventes, ratio ' + fmt(bestCAWeek.ratio) + ' €/h');

    // 3. Trend ratio positif
    if (ratioTrendPct > 10) {
      points.push('Ratio en progression : +' + fmt(ratioTrendPct) + '% entre début et fin de mois (' + fmt(firstHalfRatio) + ' → ' + fmt(secondHalfRatio) + ' €/h)');
    }

    // 4. Trend panier positif
    if (panierTrend > 50 && avgFirstPanier > 0) {
      points.push('Panier moyen en hausse : ' + fmtEuro(avgFirstPanier) + ' → ' + fmtEuro(avgSecondPanier) + ' entre début et fin de mois');
    }

    // 5. Consistency
    if (cvRatio < 0.15) {
      points.push('Régularité remarquable : ratio stable entre ' + fmt(Math.min(...ratios)) + ' et ' + fmt(Math.max(...ratios)) + ' €/h sur ' + nbWeeks + ' semaines');
    }

    // 6. Volume
    if (r.nb_ventes >= avgVentes * 1.2) {
      points.push('Volume de ventes élevé : ' + r.nb_ventes + ' ventes (moy. équipe : ' + Math.round(avgVentes) + '), meilleure semaine ' + bestVolumeWeek.nb + ' ventes (' + bestVolumeWeek.label + ')');
    }

    // 7. Weeks as leader
    if (weeksAsLeader >= 2) {
      points.push('Leader du ratio CA/h sur ' + weeksAsLeader + '/' + nbWeeks + ' semaines');
    }

    // 8. Efficiency
    if (r.total_hours < Math.max(...data.rep_stats.map(rr => rr.total_hours)) * 0.8 && ratioRank <= 2) {
      points.push('Très efficace : ratio de ' + fmt(r.ratio_mensuel) + ' €/h avec seulement ' + fmt(r.total_hours) + 'h travaillées');
    }

    // ══════════ AXES DE TRAVAIL ══════════

    // 1. Worst week
    travail.push('Semaine la plus faible (' + worstRatioWeek.label + ') : ' + fmtEuro(worstRatioWeek.ca) + ' de CA, ratio ' + fmt(worstRatioWeek.ratio) + ' €/h — écart de ' + fmt(bestRatioWeek.ratio - worstRatioWeek.ratio) + ' €/h avec sa meilleure semaine');

    // 2. Ratio below average
    if (ratioRank > 1 && r.ratio_mensuel < ratioGlobal) {
      travail.push('Ratio mensuel (' + fmt(r.ratio_mensuel) + ' €/h) en dessous de la moyenne équipe (' + fmt(ratioGlobal) + ' €/h) — écart de ' + fmt(ratioGlobal - r.ratio_mensuel) + ' €/h à combler');
    }

    // 3. Trend ratio négatif
    if (ratioTrendPct < -10) {
      travail.push('Ratio en baisse : ' + fmt(Math.abs(ratioTrendPct)) + '% entre début et fin de mois (' + fmt(firstHalfRatio) + ' → ' + fmt(secondHalfRatio) + ' €/h)');
    }

    // 4. Trend panier négatif
    if (panierTrend < -50 && avgFirstPanier > 0) {
      travail.push('Panier moyen en recul : ' + fmtEuro(avgFirstPanier) + ' → ' + fmtEuro(avgSecondPanier) + ' entre début et fin de mois');
    }

    // 5. Inconsistency
    if (cvRatio >= 0.25) {
      travail.push('Irrégularité du ratio : écart de ' + fmt(Math.max(...ratios) - Math.min(...ratios)) + ' €/h entre meilleure et pire semaine (de ' + fmt(Math.min(...ratios)) + ' à ' + fmt(Math.max(...ratios)) + ' €/h)');
    }

    // 6. Weeks as last
    if (weeksAsLast >= 2) {
      travail.push('Dernier du classement ratio sur ' + weeksAsLast + '/' + nbWeeks + ' semaines');
    }

    // 7. Low volume
    if (r.nb_ventes < avgVentes * 0.8) {
      const worstVolWeek = weeks.reduce((a, b) => a.nb < b.nb ? a : b);
      travail.push('Volume insuffisant : ' + r.nb_ventes + ' ventes vs moy. ' + Math.round(avgVentes) + ' — seulement ' + worstVolWeek.nb + ' vente(s) la semaine du ' + worstVolWeek.label);
    }

    // 8. Panier below average
    if (panierRank > 1 && r.panier_moyen < avgPanier * 0.85) {
      travail.push('Panier moyen de ' + fmtEuro(r.panier_moyen) + ' nettement sous la moyenne équipe (' + fmtEuro(avgPanier) + ') — pic à ' + fmtEuro(bestPanierWeek.pm) + ' (' + bestPanierWeek.label + ') montre le potentiel');
    }

    return { name: r.name, points, travail };
  });
}

async function renderAnalysisSection(data) {
  const div = document.getElementById('monthly-analysis');
  const breakdown = await api(`/months/${currentMonth}/weekly-breakdown`);
  const analyses = analyzeRepWeekly(data, breakdown);

  // Filter: commercial sees only their own analysis card
  const admin = isAdmin();
  const myName = getMyName();

  let visibleAnalyses = analyses.map((a, idx) => ({ ...a, originalIdx: idx }));
  if (!admin && myName) {
    visibleAnalyses = visibleAnalyses.filter(a => a.name === myName);
  }

  const title = admin ? 'Analyse Individuelle' : 'Mon Analyse';
  let html = `<div class="analysis-section"><h3>${title}</h3><div class="analysis-grid">`;
  visibleAnalyses.forEach((a) => {
    const repIdx = a.originalIdx;
    const editBtn = admin
      ? `<button class="edit-toggle" onclick="toggleEditMode(${repIdx})">✏️ Éditer</button>`
      : '';
    const addPointBtn = admin
      ? `<button class="add-item-btn good" onclick="addItem(${repIdx}, 'point')">+ Ajouter un point</button>`
      : '';
    const addAxeBtn = admin
      ? `<button class="add-item-btn work" onclick="addItem(${repIdx}, 'travail')">+ Ajouter un axe</button>`
      : '';
    const checkboxAttr = admin ? 'checked' : 'checked disabled';

    html += `<div class="analysis-card" data-rep="${repIdx}">
      <div class="analysis-card-header">
        <span>${a.name}</span>
        ${editBtn}
      </div>
      <div class="analysis-card-body">
        <div class="analysis-label good">Points de satisfaction</div>
        <div class="analysis-items points-${repIdx}">
          ${a.points.map((p, i) => `<label class="analysis-item" data-rep="${repIdx}" data-type="point" data-idx="${i}">
            <input type="checkbox" ${checkboxAttr}>
            <span class="dot good"></span>
            <span>${p}</span>
          </label>`).join('')}
        </div>
        ${addPointBtn}

        <div class="analysis-label work">Axes d'amélioration</div>
        <div class="analysis-items travail-${repIdx}">
          ${a.travail.map((t, i) => `<label class="analysis-item" data-rep="${repIdx}" data-type="travail" data-idx="${i}">
            <input type="checkbox" ${checkboxAttr}>
            <span class="dot work"></span>
            <span>${t}</span>
          </label>`).join('')}
        </div>
        ${addAxeBtn}
      </div>
    </div>`;
  });
  html += '</div></div>';
  div.innerHTML = html;

  // Setup checkboxes
  div.querySelectorAll('.analysis-item input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      cb.closest('.analysis-item').classList.toggle('unchecked', !cb.checked);
    });
  });

  // Setup delete buttons
  div.querySelectorAll('.item-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const item = btn.closest('.analysis-item');
      item.remove();
    });
  });

  // Setup edit inputs
  div.querySelectorAll('.analysis-item.editable input').forEach(inp => {
    inp.addEventListener('blur', () => {
      const span = inp.closest('.analysis-item').querySelector('span:last-child');
      if (span) span.textContent = inp.value;
      inp.parentElement.replaceWith(inp.closest('.analysis-item').cloneNode(true));
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') inp.blur();
    });
  });
}

function toggleEditMode(repIdx) {
  const card = document.querySelector(`.analysis-card[data-rep="${repIdx}"]`);
  const isEditing = card.classList.toggle('edit-mode');

  if (isEditing) {
    // Convert items to editable
    card.querySelectorAll('.analysis-item').forEach(item => {
      const span = item.querySelector('span:last-child');
      if (span && !item.classList.contains('editable')) {
        const text = span.textContent;
        item.classList.add('editable');
        item.innerHTML = `
          <input type="checkbox" ${item.querySelector('input[type="checkbox"]').checked ? 'checked' : ''}>
          <span class="dot ${item.querySelector('.dot').classList.contains('good') ? 'good' : 'work'}"></span>
          <input type="text" value="${text}" style="flex:1;">
          <button class="item-delete-btn" onclick="this.closest('.analysis-item').remove()">✕ Suppr</button>
        `;
      }
    });

    // Focus first input
    const firstInput = card.querySelector('.analysis-item.editable input[type="text"]');
    if (firstInput) firstInput.focus();
  } else {
    // Convert back to display mode
    card.querySelectorAll('.analysis-item.editable').forEach(item => {
      const checkbox = item.querySelector('input[type="checkbox"]');
      const dotClass = item.querySelector('.dot').className.match(/\bgood\b|\bwork\b/)[0];
      const text = item.querySelector('input[type="text"]').value;
      item.classList.remove('editable');
      item.innerHTML = `
        <input type="checkbox" ${checkbox.checked ? 'checked' : ''}>
        <span class="dot ${dotClass}"></span>
        <span>${text}</span>
      `;
      item.querySelector('input[type="checkbox"]').addEventListener('change', function() {
        this.closest('.analysis-item').classList.toggle('unchecked', !this.checked);
      });
    });
  }
}

function addItem(repIdx, type) {
  const card = document.querySelector(`.analysis-card[data-rep="${repIdx}"]`);
  const containerClass = type === 'point' ? 'points-' : 'travail-';
  const container = card.querySelector(`.${containerClass}${repIdx}`);
  const dotClass = type === 'point' ? 'good' : 'work';
  const newItem = document.createElement('label');
  newItem.className = 'analysis-item editable';
  newItem.setAttribute('data-rep', repIdx);
  newItem.setAttribute('data-type', type);
  newItem.innerHTML = `
    <input type="checkbox" checked>
    <span class="dot ${dotClass}"></span>
    <input type="text" placeholder="Entrez un texte..." autofocus style="flex:1;">
    <button class="item-delete-btn" onclick="this.closest('.analysis-item').remove()">✕ Suppr</button>
  `;
  container.appendChild(newItem);
  newItem.querySelector('input[type="text"]').focus();
}

// ─── PDF Recap Generation ───────────────────────────────────

async function generateRecapPDF() {
  if (!lastMonthlyData) return;
  const data = lastMonthlyData;
  const monthLabel = formatMonthLabel(currentMonth);

  const sorted = [...data.rep_stats].sort((a, b) => b.ratio_mensuel - a.ratio_mensuel);
  const sortedPanier = [...data.rep_stats].sort((a, b) => b.panier_moyen - a.panier_moyen);
  const sortedBest = [...data.rep_stats].sort((a, b) => b.best_sale - a.best_sale);

  // Compute global ratio
  const totalHours = data.rep_stats.reduce((s, r) => s + r.total_hours, 0);
  const ratioGlobal = totalHours > 0 ? data.global.ca / totalHours : 0;

  // Load logos as base64 for reliable PDF embedding
  let logoBlancB64 = '';
  let logoNoirB64 = '';
  try {
    const [blancResp, noirResp] = await Promise.all([
      fetch('/logo-mycoach-blanc.png'),
      fetch('/logo-mycoach-noir.png')
    ]);
    const [blancBlob, noirBlob] = await Promise.all([blancResp.blob(), noirResp.blob()]);
    logoBlancB64 = await blobToDataURL(blancBlob);
    logoNoirB64 = await blobToDataURL(noirBlob);
  } catch (e) {
    console.warn('Impossible de charger les logos:', e);
  }

  // Build a clean HTML document for PDF — My Coach branding — polished single page
  const container = document.createElement('div');
  container.id = 'pdf-recap';
  container.innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Livvic:wght@400;500;600;700&family=Open+Sans:wght@400;600;700;800&display=swap');
      #pdf-recap { font-family: 'Livvic', sans-serif; color: #212121; padding: 0; max-width: 800px; margin: 0 auto; background: #fff; }

      /* ── Header ── */
      #pdf-recap .pdf-header { background: linear-gradient(135deg, #001a4d 0%, #002366 40%, #0f52ba 100%); color: #fff; padding: 22px 28px 18px; border-radius: 0 0 20px 20px; margin-bottom: 18px; position: relative; overflow: hidden; }
      #pdf-recap .pdf-header::before { content:''; position:absolute; top:-60px; right:-30px; width:180px; height:180px; background:rgba(255,255,255,.04); border-radius:50%; }
      #pdf-recap .pdf-header::after { content:''; position:absolute; bottom:-30px; left:40%; width:120px; height:120px; background:rgba(250,104,99,.08); border-radius:50%; }
      #pdf-recap .pdf-header-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; position:relative; z-index:1; }
      #pdf-recap .pdf-header-logo img { height: 44px; width: auto; }
      #pdf-recap .pdf-header h1 { font-family:'Open Sans',sans-serif; font-size:24px; font-weight:800; margin:0; color:#fff; position:relative; z-index:1; letter-spacing:-0.3px; }
      #pdf-recap .pdf-header .pdf-subtitle { font-size:11px; color:rgba(244,238,232,.8); position:relative; z-index:1; letter-spacing:0.5px; }
      #pdf-recap .pdf-header .pdf-badge { display:inline-block; background:rgba(250,104,99,.85); color:#fff; font-family:'Open Sans',sans-serif; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:1.5px; padding:3px 10px; border-radius:20px; margin-top:6px; position:relative; z-index:1; }

      /* ── Section titles ── */
      #pdf-recap .pdf-section-title { font-family:'Open Sans',sans-serif; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1.5px; color:#002366; margin:16px 28px 10px; padding-bottom:6px; border-bottom:2px solid #0f52ba; display:flex; align-items:center; gap:6px; }
      #pdf-recap .pdf-section-title .dot { width:6px; height:6px; border-radius:50%; background:#fa6863; flex-shrink:0; }

      /* ── Podium ── */
      #pdf-recap .pdf-podium { display:flex; align-items:flex-end; justify-content:center; gap:14px; margin:0 28px 16px; }
      #pdf-recap .pdf-pod { text-align:center; flex:1; max-width:210px; }
      #pdf-recap .pdf-pod-rank { font-family:'Open Sans',sans-serif; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#0f52ba; margin-bottom:2px; }
      #pdf-recap .pdf-pod-name { font-family:'Open Sans',sans-serif; font-size:14px; font-weight:700; margin-bottom:2px; }
      #pdf-recap .pdf-pod-ratio { font-family:'Open Sans',sans-serif; font-size:17px; font-weight:800; margin-bottom:5px; }
      #pdf-recap .pdf-pod.p1 .pdf-pod-name { color:#002366; }
      #pdf-recap .pdf-pod.p1 .pdf-pod-ratio { color:#fa6863; font-size:21px; }
      #pdf-recap .pdf-pod.p2 .pdf-pod-ratio { color:#0f52ba; }
      #pdf-recap .pdf-pod.p3 .pdf-pod-ratio { color:#94a3b8; }
      #pdf-recap .pdf-pod-block { border-radius:12px 12px 0 0; padding:14px 10px; position:relative; overflow:hidden; }
      #pdf-recap .pdf-pod.p1 .pdf-pod-block { background:linear-gradient(180deg,#002366 0%,#0f52ba 100%); color:#fff; min-height:108px; box-shadow:0 4px 12px rgba(0,35,102,.25); }
      #pdf-recap .pdf-pod.p1 .pdf-pod-block::after { content:''; position:absolute; top:-20px; right:-20px; width:60px; height:60px; background:rgba(250,104,99,.12); border-radius:50%; }
      #pdf-recap .pdf-pod.p2 .pdf-pod-block { background:linear-gradient(180deg,#f4eee8 0%,#e8ddd4 100%); border:1px solid #d4c9bf; min-height:88px; }
      #pdf-recap .pdf-pod.p3 .pdf-pod-block { background:linear-gradient(180deg,#f6f6f6 0%,#ebebeb 100%); border:1px solid #d4d4d4; min-height:72px; }
      #pdf-recap .pdf-pod-ca { font-family:'Open Sans',sans-serif; font-size:16px; font-weight:800; margin-bottom:4px; }
      #pdf-recap .pdf-pod.p1 .pdf-pod-ca { color:#fff; }
      #pdf-recap .pdf-pod-detail { font-size:10px; line-height:1.7; opacity:.85; }
      #pdf-recap .pdf-pod-best { font-size:9px; margin-top:5px; padding-top:5px; border-top:1px solid rgba(255,255,255,.15); opacity:.9; font-style:italic; }
      #pdf-recap .pdf-pod.p2 .pdf-pod-best, #pdf-recap .pdf-pod.p3 .pdf-pod-best { border-top-color:rgba(0,0,0,.1); }

      /* ── Charts ── */
      #pdf-recap .pdf-charts-wrap { display:flex; gap:12px; margin:0 28px 16px; }
      #pdf-recap .pdf-charts-wrap .chart-card { flex:1; background:#fafafa; border:1px solid #eee; border-radius:10px; padding:6px; overflow:hidden; }
      #pdf-recap .pdf-charts-wrap .chart-card img { width:100%; height:auto; border-radius:6px; }

      /* ── KPI Cards ── */
      #pdf-recap .pdf-kpi-row { display:flex; gap:14px; margin:0 28px 16px; }
      #pdf-recap .pdf-kpi { flex:1; text-align:center; padding:14px 10px; border-radius:12px; position:relative; overflow:hidden; }
      #pdf-recap .pdf-kpi::before { content:''; position:absolute; top:-15px; right:-15px; width:50px; height:50px; border-radius:50%; opacity:.08; }
      #pdf-recap .pdf-kpi.kpi-ratio { background:linear-gradient(135deg,#002366,#0f52ba); color:#fff; }
      #pdf-recap .pdf-kpi.kpi-ratio::before { background:#fa6863; opacity:.15; }
      #pdf-recap .pdf-kpi.kpi-panier { background:linear-gradient(135deg,#f4eee8,#e8ddd4); border:1px solid #d4c9bf; }
      #pdf-recap .pdf-kpi.kpi-panier::before { background:#002366; }
      #pdf-recap .pdf-kpi .kpi-label { font-family:'Open Sans',sans-serif; font-size:9px; text-transform:uppercase; letter-spacing:1.5px; font-weight:700; margin-bottom:4px; }
      #pdf-recap .pdf-kpi.kpi-ratio .kpi-label { color:rgba(255,255,255,.7); }
      #pdf-recap .pdf-kpi.kpi-panier .kpi-label { color:#0f52ba; }
      #pdf-recap .pdf-kpi .kpi-value { font-family:'Open Sans',sans-serif; font-size:22px; font-weight:800; position:relative; z-index:1; }
      #pdf-recap .pdf-kpi.kpi-ratio .kpi-value { color:#fff; }
      #pdf-recap .pdf-kpi.kpi-panier .kpi-value { color:#002366; }
      #pdf-recap .pdf-kpi .kpi-sub { font-size:9px; opacity:.6; margin-top:2px; position:relative; z-index:1; }

      /* ── Analyse par commercial ── */
      #pdf-recap .pdf-analyses { margin:0 28px 16px; display:flex; gap:10px; }
      #pdf-recap .pdf-analysis { flex:1; background:#fff; border:1px solid #e8e8e8; border-radius:10px; padding:10px 12px; position:relative; overflow:hidden; }
      #pdf-recap .pdf-analysis::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; }
      #pdf-recap .pdf-analysis.an-1::before { background:linear-gradient(90deg,#002366,#0f52ba); }
      #pdf-recap .pdf-analysis.an-2::before { background:linear-gradient(90deg,#fa6863,#f8928e); }
      #pdf-recap .pdf-analysis.an-3::before { background:linear-gradient(90deg,#0f52ba,#5b8dd9); }
      #pdf-recap .pdf-analysis .an-name { font-family:'Open Sans',sans-serif; font-size:11px; font-weight:700; color:#002366; margin-bottom:6px; }
      #pdf-recap .pdf-analysis .an-section { margin-bottom:5px; }
      #pdf-recap .pdf-analysis .an-label { font-family:'Open Sans',sans-serif; font-size:8px; font-weight:700; text-transform:uppercase; letter-spacing:1px; margin-bottom:3px; }
      #pdf-recap .pdf-analysis .an-label.good { color:#16a34a; }
      #pdf-recap .pdf-analysis .an-label.work { color:#ea580c; }
      #pdf-recap .pdf-analysis .an-item { font-size:9px; color:#444; line-height:1.5; padding-left:8px; position:relative; }
      #pdf-recap .pdf-analysis .an-item::before { content:''; position:absolute; left:0; top:5px; width:3px; height:3px; border-radius:50%; }
      #pdf-recap .pdf-analysis .an-item.good::before { background:#16a34a; }
      #pdf-recap .pdf-analysis .an-item.work::before { background:#ea580c; }

      /* ── Footer ── */
      #pdf-recap .pdf-footer { text-align:center; padding:12px 28px 10px; border-top:2px solid #f4eee8; margin:0 28px; }
      #pdf-recap .pdf-footer-logo img { height:30px; width:auto; margin-bottom:4px; }
      #pdf-recap .pdf-footer .footer-tagline { font-size:9px; color:#94a3b8; font-style:italic; letter-spacing:0.5px; }
    </style>

    <div class="pdf-header">
      <div class="pdf-header-top">
        ${logoBlancB64 ? `<div class="pdf-header-logo"><img src="${logoBlancB64}" alt="my COACH Ginkgo"></div>` : ''}
        <div style="text-align:right;">
          <div style="font-family:'Open Sans',sans-serif;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;opacity:.6;">Suivi Performance</div>
        </div>
      </div>
      <h1>Récap ${monthLabel}</h1>
      <div class="pdf-subtitle">Rapport mensuel de performance commerciale</div>
      <div class="pdf-badge">${data.global.nb_ventes} ventes · ${fmtEuro(data.global.ca)} de CA</div>
    </div>

    <div class="pdf-section-title"><span class="dot"></span> Classement Ratio CA/h</div>
    <div class="pdf-podium">
      ${sorted.length >= 3 ? [sorted[1], sorted[0], sorted[2]].map((r) => {
        const origIdx = sorted.indexOf(r);
        const pClass = 'p' + (origIdx + 1);
        const rankLabel = origIdx === 0 ? '1er' : (origIdx === 1 ? '2e' : '3e');
        return `<div class="pdf-pod ${pClass}">
          <div class="pdf-pod-rank">${rankLabel}</div>
          <div class="pdf-pod-name">${r.name}</div>
          <div class="pdf-pod-ratio">${fmt(r.ratio_mensuel)} €/h</div>
          <div class="pdf-pod-block">
            <div class="pdf-pod-ca">${fmtEuro(r.ca)}</div>
            <div class="pdf-pod-detail">${r.nb_ventes} ventes · Moy: ${fmtEuro(r.panier_moyen)}</div>
            <div class="pdf-pod-detail">${fmt(r.total_hours)}h travaillées</div>
            <div class="pdf-pod-best">Meilleure vente : ${r.best_sale > 0 ? fmtEuro(r.best_sale) : '—'}</div>
          </div>
        </div>`;
      }).join('') : sorted.map((r, i) => `<div class="pdf-pod p${i+1}">
          <div class="pdf-pod-name">${r.name}</div>
          <div class="pdf-pod-ratio">${fmt(r.ratio_mensuel)} €/h</div>
          <div class="pdf-pod-block">
            <div class="pdf-pod-ca">${fmtEuro(r.ca)}</div>
            <div class="pdf-pod-best">Meilleure vente : ${r.best_sale > 0 ? fmtEuro(r.best_sale) : '—'}</div>
          </div>
        </div>`).join('')}
    </div>

    <div class="pdf-section-title"><span class="dot"></span> Évolution Hebdomadaire</div>
    <div class="pdf-charts-wrap">
      ${chartRatio ? `<div class="chart-card"><img src="${document.getElementById('chart-ratio').toDataURL('image/png')}"></div>` : ''}
      ${chartPanier ? `<div class="chart-card"><img src="${document.getElementById('chart-panier').toDataURL('image/png')}"></div>` : ''}
    </div>

    <div class="pdf-kpi-row">
      <div class="pdf-kpi kpi-ratio">
        <div class="kpi-label">Ratio Moyen Global</div>
        <div class="kpi-value">${fmt(ratioGlobal)} €/h</div>
        <div class="kpi-sub">${fmt(totalHours)}h travaillées au total</div>
      </div>
      <div class="pdf-kpi kpi-panier">
        <div class="kpi-label">Panier Moyen Global</div>
        <div class="kpi-value">${fmtEuro(data.global.panier_moyen)}</div>
        <div class="kpi-sub">${data.global.nb_ventes} ventes au total</div>
      </div>
    </div>

    <div class="pdf-section-title"><span class="dot"></span> Analyse Individuelle</div>
    <div class="pdf-analyses">
      ${(() => {
        const cards = document.querySelectorAll('#monthly-analysis .analysis-card');
        if (!cards.length) return '';
        return Array.from(cards).map((card, i) => {
          const name = card.querySelector('.analysis-card-header').textContent;
          const checkedPoints = Array.from(card.querySelectorAll('[data-type="point"]'))
            .filter(el => el.querySelector('input').checked)
            .map(el => el.querySelector('span:last-child').textContent);
          const checkedTravail = Array.from(card.querySelectorAll('[data-type="travail"]'))
            .filter(el => el.querySelector('input').checked)
            .map(el => el.querySelector('span:last-child').textContent);
          if (checkedPoints.length === 0 && checkedTravail.length === 0) return '';
          return `<div class="pdf-analysis an-${i + 1}">
            <div class="an-name">${name}</div>
            ${checkedPoints.length ? `<div class="an-section">
              <div class="an-label good">Points forts</div>
              ${checkedPoints.map(p => `<div class="an-item good">${p}</div>`).join('')}
            </div>` : ''}
            ${checkedTravail.length ? `<div class="an-section">
              <div class="an-label work">Axe de travail</div>
              ${checkedTravail.map(t => `<div class="an-item work">${t}</div>`).join('')}
            </div>` : ''}
          </div>`;
        }).join('');
      })()}
    </div>

    <div class="pdf-footer">
      ${logoNoirB64 ? `<div class="pdf-footer-logo"><img src="${logoNoirB64}" alt="my COACH Ginkgo"></div>` : ''}
      <div class="footer-tagline">Un Challenge, des résultats</div>
    </div>
  `;

  document.body.appendChild(container);

  const opt = {
    margin: [0, 0, 0, 0],
    filename: `recap-mycoach-${currentMonth}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  html2pdf().set(opt).from(container).save().then(() => {
    document.body.removeChild(container);
  });
}

// Helper: convert Blob to data URL
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ─── Email Test ─────────────────────────────────────────────

(function initEmailTest() {
  const btn = document.getElementById('btn-test-email');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const resultDiv = document.getElementById('email-result');
    resultDiv.classList.remove('hidden', 'success', 'error');
    resultDiv.textContent = 'Envoi en cours...';
    btn.disabled = true;

    try {
      const res = await fetch('/api/email/test', { method: 'POST' });
      const data = await res.json();

      if (res.ok) {
        resultDiv.classList.add('success');
        resultDiv.textContent = `Email de test envoyé avec succès (ID: ${data.messageId})`;
      } else {
        resultDiv.classList.add('error');
        resultDiv.textContent = `Erreur : ${data.error}`;
      }
    } catch (e) {
      resultDiv.classList.add('error');
      resultDiv.textContent = `Erreur réseau : ${e.message}`;
    } finally {
      btn.disabled = false;
    }
  });
})();
