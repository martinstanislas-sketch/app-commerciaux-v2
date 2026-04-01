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

function isPhoneLead() {
  return currentUser && currentUser.role === 'phoneur';
}

// ─── State ──────────────────────────────────────────────────
let currentWeekStart = '';
let salesReps = [];
let currentMonth = '';
let featureStatus = { ai: false, email: false, webhook: false };
let isLocked = false;
let todaySelectedDate = new Date().toISOString().slice(0, 10);

// ─── Actions prédéfinies Aujourd'hui ────────────────────────
const PREDEFINED_YESNO = [
  { key: 'check_studio', label: "J'ai fait un check du studio" },
  { key: 'appel_annules_noshow', label: "J'ai appelé les RDV annulés et no show du jour" },
  { key: 'mails_sms', label: "J'ai traité 100% des mails, SMS et appel en absence du jour" },
  { key: 'rappel_rdv', label: "J'ai rappelé les RDV programmés pour demain" },
  { key: 'story', label: "J'ai publié une story" },
];
const PREDEFINED_COUNTERS = [
  { key: 'references', label: 'Prise de ref' },
  { key: 'entretien_premier_mois', label: 'Entretien 1er mois' },
  { key: 'rdv_fixes', label: 'RDV fixés' },
  { key: 'contact_entreprise', label: 'Contact entreprise' },
];
const TOTAL_ACTIONS = PREDEFINED_YESNO.length + PREDEFINED_COUNTERS.length;

// ─── Champs Phoning ─────────────────────────────────────────
const PHONING_COUNTERS = [
  { key: 'heures_travaillees', label: 'Heures travaillées', unit: 'h' },
  { key: 'appels_rdv_demain', label: 'Appels RDV du lendemain' },
  { key: 'appels_on_fire', label: 'Appels On Fire' },
  { key: 'rdv_on_fire', label: 'RDV fixés (On Fire)' },
  { key: 'appels_entrants', label: 'Appels entrants / en absence' },
  { key: 'leads_froids', label: 'Leads froids relancés' },
  { key: 'rdv_leads_froids', label: 'RDV fixés (Leads froids)' },
  { key: 'appels_vni', label: 'Appels VNI' },
  { key: 'appels_clients', label: 'Appels clients' },
  { key: 'appels_resilies', label: 'Appels résiliés' },
  { key: 'appels_annules_noshow', label: 'Appels annulés / no show' },
];
const PHONING_YESNO = [
  { key: 'mails_sms_traites', label: 'Mail et SMS traités intégralement' },
];
// Champs supplémentaires Pamela uniquement
const PHONING_PAMELA_YESNO = [
  { key: 'repartition_taches', label: 'Répartition des tâches quotidienne' },
  { key: 'checkup', label: 'Check-up complété' },
  { key: 'analyse_taches_ecoute', label: 'Analyse des données + écoute' },
];

function getBadge(score) {
  const pct = score / TOTAL_ACTIONS * 100;
  if (pct >= 100) return { name: 'Diamant', icon: '💎', next: null, progress: 100 };
  if (pct >= 80) return { name: 'Or', icon: '🥇', next: 'Diamant 💎', progress: (pct - 80) / 20 * 100 };
  if (pct >= 60) return { name: 'Argent', icon: '🥈', next: 'Or 🥇', progress: (pct - 60) / 20 * 100 };
  if (pct >= 40) return { name: 'Bronze', icon: '🥉', next: 'Argent 🥈', progress: (pct - 40) / 20 * 100 };
  return { name: null, icon: '', next: 'Bronze 🥉', progress: pct / 40 * 100 };
}

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

  // Charger le statut des features externes
  try {
    const statusRes = await fetch('/api/status');
    if (statusRes.ok) featureStatus = await statusRes.json();
  } catch (_) { /* keep defaults */ }
  applyFeatureStatus();

  // Only bind event listeners once to avoid duplicates on re-login
  if (!_appBooted) {
    initTabs();
    initWeekNav();
    initVentesTab();
    initMensuelTab();
    initModal();
    initAdminPanel();
    initAdminPhoneursNav();
    initAdminEnergy();
    initControlTab();
    initAdminActionsNav();
    _appBooted = true;
  }

  // Show/hide admin panels
  const adminPanel = document.getElementById('admin-reps-panel');
  if (adminPanel) adminPanel.classList.toggle('hidden', !isAdmin());
  // Show/hide tabs based on role
  updateTabVisibility();

  // Show header widgets for commercials
  initHeaderWidgets();

  if (isPhoneLead()) {
    loadPhoningTab();
  } else {
    loadDashboard();
    if (!isAdmin()) loadTodayTab();
  }
}

function updateTabVisibility() {
  const todayBtn = document.querySelector('[data-tab="today"]');
  const ventesBtn = document.querySelector('[data-tab="ventes"]');
  const dashBtn = document.querySelector('[data-tab="dashboard"]');
  const phoningBtn = document.querySelector('[data-tab="phoning"]');
  const phoningRecapBtn = document.querySelector('[data-tab="phoning-recap"]');
  const mensuelBtn = document.querySelector('[data-tab="mensuel"]');
  const notesBtn = document.querySelector('[data-tab="notes"]');
  const adminPhoneursBtn = document.querySelector('[data-tab="admin-phoneurs"]');
  const controleBtn = document.querySelector('[data-tab="controle"]');
  const actionsBtn = document.querySelector('[data-tab="admin-actions"]');

  if (isPhoneLead()) {
    if (todayBtn) todayBtn.style.display = 'none';
    if (ventesBtn) ventesBtn.style.display = 'none';
    if (dashBtn) dashBtn.style.display = 'none';
    if (phoningBtn) phoningBtn.style.display = '';
    if (phoningRecapBtn) phoningRecapBtn.style.display = '';
    if (mensuelBtn) mensuelBtn.style.display = 'none';
    if (notesBtn) notesBtn.style.display = 'none';
    if (adminPhoneursBtn) adminPhoneursBtn.style.display = 'none';
    if (controleBtn) controleBtn.style.display = 'none';
    if (actionsBtn) actionsBtn.style.display = 'none';
    phoningBtn.click();
  } else if (isAdmin()) {
    if (todayBtn) todayBtn.style.display = 'none';
    if (ventesBtn) ventesBtn.style.display = '';
    if (dashBtn) dashBtn.style.display = '';
    if (phoningBtn) phoningBtn.style.display = 'none';
    if (phoningRecapBtn) phoningRecapBtn.style.display = 'none';
    if (mensuelBtn) mensuelBtn.style.display = '';
    if (notesBtn) notesBtn.style.display = '';
    if (adminPhoneursBtn) adminPhoneursBtn.style.display = '';
    if (controleBtn) controleBtn.style.display = '';
    if (actionsBtn) actionsBtn.style.display = '';
    dashBtn.click();
  } else {
    if (todayBtn) todayBtn.style.display = '';
    if (ventesBtn) ventesBtn.style.display = 'none';
    if (dashBtn) dashBtn.style.display = 'none';
    if (phoningBtn) phoningBtn.style.display = 'none';
    if (phoningRecapBtn) phoningRecapBtn.style.display = 'none';
    if (mensuelBtn) mensuelBtn.style.display = '';
    if (notesBtn) notesBtn.style.display = 'none';
    if (adminPhoneursBtn) adminPhoneursBtn.style.display = 'none';
    if (controleBtn) controleBtn.style.display = 'none';
    if (actionsBtn) actionsBtn.style.display = 'none';
    todayBtn.click();
  }
}

async function initHeaderWidgets() {
  const widgetsDiv = document.getElementById('header-widgets');
  if (!widgetsDiv) return;

  if (isAdmin()) {
    widgetsDiv.classList.add('hidden');
    return;
  }
  widgetsDiv.classList.remove('hidden');

  const repId = getMyRepId();
  const today = new Date().toISOString().slice(0, 10);

  // Load saved values
  try {
    const values = await api(`/daily-actions/values/${repId}/${today}`);
    const valMap = {};
    values.forEach(v => { valMap[v.action_key] = v.value; });

    // Histoire Sportive
    const hsInput = document.getElementById('hs-value');
    hsInput.value = valMap['predefined:histoire_sportive'] || 0;

    // Énergie
    const savedEnergy = valMap['predefined:energie'] || 0;
    if (savedEnergy > 0) {
      const activeBtn = widgetsDiv.querySelector(`.hw-smiley[data-energy="${savedEnergy}"]`);
      if (activeBtn) activeBtn.classList.add('active');
    }
  } catch (e) { /* ignore */ }

  // Histoire Sportive +/- buttons
  document.getElementById('hs-minus').addEventListener('click', async () => {
    const inp = document.getElementById('hs-value');
    const val = Math.max(0, (parseInt(inp.value) || 0) - 1);
    inp.value = val;
    await api(`/daily-actions/values/${repId}/${today}`, {
      method: 'PUT', body: { action_key: 'predefined:histoire_sportive', value: val }
    });
  });
  document.getElementById('hs-plus').addEventListener('click', async () => {
    const inp = document.getElementById('hs-value');
    const val = (parseInt(inp.value) || 0) + 1;
    inp.value = val;
    await api(`/daily-actions/values/${repId}/${today}`, {
      method: 'PUT', body: { action_key: 'predefined:histoire_sportive', value: val }
    });
  });
  document.getElementById('hs-value').addEventListener('change', async () => {
    const inp = document.getElementById('hs-value');
    const val = Math.max(0, parseInt(inp.value) || 0);
    inp.value = val;
    await api(`/daily-actions/values/${repId}/${today}`, {
      method: 'PUT', body: { action_key: 'predefined:histoire_sportive', value: val }
    });
  });

  // Énergie smiley buttons
  widgetsDiv.querySelectorAll('.hw-smiley').forEach(btn => {
    btn.addEventListener('click', async () => {
      widgetsDiv.querySelectorAll('.hw-smiley').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      await api(`/daily-actions/values/${repId}/${today}`, {
        method: 'PUT', body: { action_key: 'predefined:energie', value: parseInt(btn.dataset.energy) }
      });
    });
  });
}

// Club prefixes: Club 1 = 'predefined:' (backward compatible), Club 2 = 'club2:'
const CLUB_PREFIXES = [
  { id: 'club1', label: 'Club 1', prefix: 'predefined:' },
  { id: 'club2', label: 'Club 2', prefix: 'club2:' },
];

function renderClubBlock(club, valMap) {
  const p = club.prefix;
  const savedEnergy = valMap[`${p}energie`] || 0;
  const savedHS = valMap[`${p}histoire_sportive`] || 0;

  return `
    <div class="td-club-block" data-club="${club.id}" data-prefix="${p}">
      <div class="td-club-header">${club.label}</div>

      <div class="td-block">
        <h3 class="td-block-title">Actions prioritaires</h3>
        <div class="td-inline-widgets">
          <div class="td-inline-widget td-widget-histoire">
            <span class="td-inline-label">Histoire sportive</span>
            <div class="td-histoire-controls">
              <button class="td-histoire-btn" data-dir="minus" data-prefix="${p}">−</button>
              <input type="number" class="td-histoire-val" data-prefix="${p}" value="${savedHS}" min="0">
              <button class="td-histoire-btn" data-dir="plus" data-prefix="${p}">+</button>
            </div>
          </div>
          <div class="td-inline-widget td-widget-energie">
            <span class="td-inline-label">Énergie</span>
            <div class="td-smileys">
              <button class="td-smiley td-smiley-green ${savedEnergy === 3 ? 'active' : ''}" data-energy="3" data-prefix="${p}" title="Super forme">😊</button>
              <button class="td-smiley td-smiley-orange ${savedEnergy === 2 ? 'active' : ''}" data-energy="2" data-prefix="${p}" title="Neutre">😐</button>
              <button class="td-smiley td-smiley-red ${savedEnergy === 1 ? 'active' : ''}" data-energy="1" data-prefix="${p}" title="Pas en forme">😞</button>
            </div>
          </div>
        </div>
        <div class="td-checklist">
          ${PREDEFINED_YESNO.map(a => {
            const checked = valMap[`${p}${a.key}`] ? 'checked' : '';
            return `<label class="td-check-row ${checked ? 'td-done' : ''}">
              <input type="checkbox" class="td-yesno" data-key="${p}${a.key}" ${checked}>
              <span class="td-check-box"></span>
              <span class="td-check-label">${a.label}</span>
            </label>`;
          }).join('')}
        </div>
      </div>

      <div class="td-block">
        <h3 class="td-block-title">Compteurs du jour</h3>
        <div class="td-counters-grid">
          ${PREDEFINED_COUNTERS.map(a => {
            const val = valMap[`${p}${a.key}`] || 0;
            return `<div class="td-counter-card ${val > 0 ? 'td-counter-active' : ''}">
              <div class="td-counter-label">${a.label}</div>
              <div class="td-counter-controls">
                <button class="td-counter-btn" data-key="${p}${a.key}" data-dir="minus">−</button>
                <input type="number" class="td-counter-val" value="${val}" min="0" data-key="${p}${a.key}">
                <button class="td-counter-btn" data-key="${p}${a.key}" data-dir="plus">+</button>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>`;
}

async function loadTodayTab() {
  const container = document.getElementById('today-standalone');
  if (!container) return;
  const repId = getMyRepId();
  if (!repId) return;

  const today = new Date().toISOString().slice(0, 10);
  todaySelectedDate = today;

  try {
    const values = await api(`/daily-actions/values/${repId}/${todaySelectedDate}`);
    const valMap = {};
    values.forEach(v => { valMap[v.action_key] = v.value; });

    let html = `<div class="td-page"><div class="td-clubs-grid">`;
    CLUB_PREFIXES.forEach(club => { html += renderClubBlock(club, valMap); });
    html += `</div></div>`;

    container.innerHTML = html;

    // Bind events for each club block
    CLUB_PREFIXES.forEach(club => {
      const block = container.querySelector(`[data-club="${club.id}"]`);
      if (block) bindClubEvents(block, repId, club.prefix);
    });
  } catch (err) {
    console.error('Erreur chargement Aujourd\'hui:', err);
  }
}

function updateTodayStyles(block) {
  block.querySelectorAll('.td-check-row').forEach(row => {
    const cb = row.querySelector('.td-yesno');
    row.classList.toggle('td-done', cb && cb.checked);
  });
  block.querySelectorAll('.td-counter-card').forEach(card => {
    const inp = card.querySelector('.td-counter-val');
    card.classList.toggle('td-counter-active', inp && parseInt(inp.value) > 0);
  });
}

function bindClubEvents(block, repId, prefix) {
  // Énergie smileys
  block.querySelectorAll('.td-smiley').forEach(btn => {
    btn.addEventListener('click', async () => {
      block.querySelectorAll('.td-smiley').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      await api(`/daily-actions/values/${repId}/${todaySelectedDate}`, {
        method: 'PUT', body: { action_key: `${prefix}energie`, value: parseInt(btn.dataset.energy) }
      });
    });
  });

  // Histoire sportive +/- buttons
  block.querySelectorAll('.td-histoire-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const input = block.querySelector(`.td-histoire-val[data-prefix="${prefix}"]`);
      let val = parseInt(input.value) || 0;
      val = btn.dataset.dir === 'plus' ? val + 1 : Math.max(0, val - 1);
      input.value = val;
      await api(`/daily-actions/values/${repId}/${todaySelectedDate}`, {
        method: 'PUT', body: { action_key: `${prefix}histoire_sportive`, value: val }
      });
    });
  });

  // Histoire sportive direct input
  const hsInput = block.querySelector(`.td-histoire-val[data-prefix="${prefix}"]`);
  if (hsInput) {
    hsInput.addEventListener('change', async () => {
      const val = Math.max(0, parseInt(hsInput.value) || 0);
      hsInput.value = val;
      await api(`/daily-actions/values/${repId}/${todaySelectedDate}`, {
        method: 'PUT', body: { action_key: `${prefix}histoire_sportive`, value: val }
      });
    });
  }

  // Yes/No checkboxes
  block.querySelectorAll('.td-yesno').forEach(cb => {
    cb.addEventListener('change', async () => {
      await api(`/daily-actions/values/${repId}/${todaySelectedDate}`, {
        method: 'PUT', body: { action_key: cb.dataset.key, value: cb.checked ? 1 : 0 }
      });
      updateTodayStyles(block);
    });
  });

  // Counter +/- buttons
  block.querySelectorAll('.td-counter-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.key;
      const input = block.querySelector(`.td-counter-val[data-key="${key}"]`);
      let val = parseInt(input.value) || 0;
      val = btn.dataset.dir === 'plus' ? val + 1 : Math.max(0, val - 1);
      input.value = val;
      await api(`/daily-actions/values/${repId}/${todaySelectedDate}`, {
        method: 'PUT', body: { action_key: key, value: val }
      });
      updateTodayStyles(block);
    });
  });

  // Counter direct input
  block.querySelectorAll('.td-counter-val').forEach(input => {
    input.addEventListener('change', async () => {
      const val = Math.max(0, parseInt(input.value) || 0);
      input.value = val;
      await api(`/daily-actions/values/${repId}/${todaySelectedDate}`, {
        method: 'PUT', body: { action_key: input.dataset.key, value: val }
      });
      updateTodayStyles(block);
    });
  });
}

// ─── Admin Notes (Remarques) ─────────────────────────────────

async function loadNotes() {
  const list = document.getElementById('notes-list');
  if (!list) return;

  const addBtn = document.getElementById('btn-add-note');
  if (addBtn && !addBtn._bound) {
    addBtn._bound = true;
    addBtn.addEventListener('click', () => openNoteEditor(null));
  }

  try {
    const notes = await api('/notes');
    if (notes.length === 0) {
      list.innerHTML = '<p class="notes-empty">Aucune remarque pour le moment.</p>';
      return;
    }
    list.innerHTML = notes.map(n => {
      const date = new Date(n.updated_at);
      const dateStr = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) + ' à ' + date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const preview = n.content.length > 120 ? n.content.slice(0, 120) + '…' : n.content;
      return `
      <div class="note-card" data-note-id="${n.id}">
        <div class="note-preview">${preview.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, ' ')}</div>
        <div class="note-meta">
          <span class="note-date">${dateStr}</span>
          <div class="note-actions">
            <button class="note-btn note-btn-copy" data-id="${n.id}" title="Copier">Copier</button>
            <button class="note-btn note-btn-edit" data-id="${n.id}" title="Modifier">Modifier</button>
            <button class="note-btn note-btn-delete" data-id="${n.id}" title="Supprimer">Supprimer</button>
          </div>
        </div>
      </div>`;
    }).join('');

    // Bind events
    list.querySelectorAll('.note-btn-copy').forEach(btn => {
      btn.addEventListener('click', async () => {
        const note = notes.find(n => n.id === parseInt(btn.dataset.id));
        if (note) {
          try {
            await navigator.clipboard.writeText(note.content);
            btn.textContent = 'Copié !';
            setTimeout(() => btn.textContent = 'Copier', 1500);
          } catch { alert('Copie impossible'); }
        }
      });
    });
    list.querySelectorAll('.note-btn-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const note = notes.find(n => n.id === parseInt(btn.dataset.id));
        if (note) openNoteEditor(note);
      });
    });
    list.querySelectorAll('.note-btn-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Supprimer cette remarque ?')) return;
        try {
          await api(`/notes/${btn.dataset.id}`, { method: 'DELETE' });
          loadNotes();
        } catch (e) { alert(e.message); }
      });
    });
    // Click on card to expand/collapse
    list.querySelectorAll('.note-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.note-btn')) return;
        card.classList.toggle('expanded');
        const preview = card.querySelector('.note-preview');
        const note = notes.find(n => n.id === parseInt(card.dataset.noteId));
        if (!note) return;
        if (card.classList.contains('expanded')) {
          preview.innerHTML = note.content.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
        } else {
          const short = note.content.length > 120 ? note.content.slice(0, 120) + '…' : note.content;
          preview.innerHTML = short.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, ' ');
        }
      });
    });
  } catch (e) {
    list.innerHTML = '<p class="notes-empty">Erreur de chargement</p>';
  }
}

function openNoteEditor(existingNote) {
  // Remove any existing editor
  const old = document.getElementById('note-editor-overlay');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.id = 'note-editor-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal note-modal">
      <h2>${existingNote ? 'Modifier la remarque' : 'Nouvelle remarque'}</h2>
      <textarea id="note-editor-content" rows="8" placeholder="Écrire votre remarque...">${existingNote ? existingNote.content.replace(/</g, '&lt;').replace(/>/g, '&gt;') : ''}</textarea>
      <div class="form-actions">
        <button id="note-editor-save" class="btn-primary">Enregistrer</button>
        <button id="note-editor-cancel" class="btn-secondary">Annuler</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const textarea = document.getElementById('note-editor-content');
  textarea.focus();

  document.getElementById('note-editor-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  document.getElementById('note-editor-save').addEventListener('click', async () => {
    const content = textarea.value.trim();
    if (!content) return;
    try {
      if (existingNote) {
        await api(`/notes/${existingNote.id}`, { method: 'PUT', body: { content } });
      } else {
        await api('/notes', { method: 'POST', body: { content } });
      }
      overlay.remove();
      loadNotes();
    } catch (e) { alert(e.message); }
  });
}

// ─── Phoning Tab : Fiche du jour (onglet "Aujourd'hui") ──────

async function loadPhoningTab() {
  const container = document.getElementById('phoning-container');
  if (!container) return;
  const repId = getMyRepId();
  if (!repId) return;

  const today = new Date().toISOString().slice(0, 10);

  try {
    const values = await api(`/daily-actions/values/${repId}/${today}`);
    const valMap = {};
    values.forEach(v => { valMap[v.action_key] = v.value; });

    const isPamela = (getMyName() || '').toLowerCase() === 'pamela';
    const allYesNo = [...PHONING_YESNO, ...(isPamela ? PHONING_PAMELA_YESNO : [])];

    let html = `
    <div class="ph-page">
      <div class="ph-header">
        <h2 class="ph-title">📞 Fiche Phoning — ${new Date(today).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
      </div>

      <!-- Compteurs -->
      <div class="td-block">
        <h3 class="td-block-title">Volumes du jour</h3>
        <div class="td-counters-grid ph-counters-grid">
          ${PHONING_COUNTERS.map(a => {
            const val = valMap[`phoning:${a.key}`] || 0;
            return `<div class="td-counter-card ${val > 0 ? 'td-counter-active' : ''}">
              <div class="td-counter-label">${a.label}</div>
              <div class="td-counter-controls">
                <button class="td-counter-btn ph-counter-btn" data-key="phoning:${a.key}" data-dir="minus">−</button>
                <input type="number" class="td-counter-val ph-counter-val" value="${val}" min="0" data-key="phoning:${a.key}" ${a.unit === 'h' ? 'step="0.5"' : ''}>
                <button class="td-counter-btn ph-counter-btn" data-key="phoning:${a.key}" data-dir="plus">+</button>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- Cases oui/non -->
      <div class="td-block">
        <h3 class="td-block-title">Validations</h3>
        <div class="td-checklist">
          ${allYesNo.map(a => {
            const checked = valMap[`phoning:${a.key}`] ? 'checked' : '';
            return `<label class="td-check-row ${checked ? 'td-done' : ''}">
              <input type="checkbox" class="td-yesno ph-yesno" data-key="phoning:${a.key}" ${checked}>
              <span class="td-check-box"></span>
              <span class="td-check-label">${a.label}</span>
            </label>`;
          }).join('')}
        </div>
      </div>
    </div>`;

    container.innerHTML = html;
    bindPhoningEvents(container, repId, today);
  } catch (err) {
    console.error('Erreur chargement Phoning:', err);
    container.innerHTML = '<p style="color:red;">Erreur de chargement</p>';
  }
}

function bindPhoningEvents(container, repId, today) {
  // Counter +/- buttons
  container.querySelectorAll('.ph-counter-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.key;
      const input = container.querySelector(`.ph-counter-val[data-key="${key}"]`);
      const step = input.step === '0.5' ? 0.5 : 1;
      let val = parseFloat(input.value) || 0;
      val = btn.dataset.dir === 'plus' ? val + step : Math.max(0, val - step);
      input.value = val;
      await api(`/daily-actions/values/${repId}/${today}`, {
        method: 'PUT', body: { action_key: key, value: val }
      });
      const card = btn.closest('.td-counter-card');
      if (card) card.classList.toggle('td-counter-active', val > 0);
    });
  });

  // Counter direct input
  container.querySelectorAll('.ph-counter-val').forEach(input => {
    input.addEventListener('change', async () => {
      const val = Math.max(0, parseFloat(input.value) || 0);
      input.value = val;
      await api(`/daily-actions/values/${repId}/${today}`, {
        method: 'PUT', body: { action_key: input.dataset.key, value: val }
      });
      const card = input.closest('.td-counter-card');
      if (card) card.classList.toggle('td-counter-active', val > 0);
    });
  });

  // Yes/No checkboxes
  container.querySelectorAll('.ph-yesno').forEach(cb => {
    cb.addEventListener('change', async () => {
      await api(`/daily-actions/values/${repId}/${today}`, {
        method: 'PUT', body: { action_key: cb.dataset.key, value: cb.checked ? 1 : 0 }
      });
      const row = cb.closest('.td-check-row');
      if (row) row.classList.toggle('td-done', cb.checked);
    });
  });
}

// ─── Phoning Tab : Récap mensuel (onglet "Récap") ───────────

async function loadPhoningRecap() {
  const container = document.getElementById('phoning-recap-container');
  if (!container) return;
  const repId = getMyRepId();
  if (!repId) return;

  const today = new Date().toISOString().slice(0, 10);
  const currentPhoningMonth = today.slice(0, 7);
  const monthLabel = new Date(today).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  try {
    const monthly = await api(`/phoning/monthly/${repId}/${currentPhoningMonth}`);
    const monthTotals = {};
    if (monthly.totals) {
      monthly.totals.forEach(r => { monthTotals[r.action_key.replace('phoning:', '')] = r.total; });
    }

    const html = `
    <div class="ph-page">
      <div class="ph-header">
        <h2 class="ph-title">📊 Récap — ${monthLabel}</h2>
        <p class="ph-subtitle">${monthly.days_worked || 0} jour(s) travaillé(s)</p>
      </div>
      <div class="ph-kpi-grid">
        ${buildPhoningKPIs(monthTotals)}
      </div>
    </div>`;

    container.innerHTML = html;
  } catch (err) {
    console.error('Erreur chargement Récap Phoning:', err);
    container.innerHTML = '<p style="color:red;">Erreur de chargement</p>';
  }
}

function buildPhoningKPIs(t) {
  const totalAppels = (t.appels_rdv_demain || 0) + (t.appels_on_fire || 0) +
    (t.appels_entrants || 0) + (t.appels_vni || 0) + (t.appels_clients || 0) +
    (t.appels_resilies || 0) + (t.appels_annules_noshow || 0);
  const totalRDV = (t.rdv_on_fire || 0) + (t.rdv_leads_froids || 0);
  const taux = totalAppels > 0 ? Math.round((totalRDV / totalAppels) * 100) : 0;

  const kpis = [
    { icon: '⏱️', label: 'Heures travaillées', value: `${(t.heures_travaillees || 0).toFixed(1)}h` },
    { icon: '📞', label: 'Total appels', value: totalAppels },
    { icon: '📅', label: 'RDV fixés', value: totalRDV },
    { icon: '🎯', label: 'Taux appels → RDV', value: `${taux}%` },
    { icon: '❄️', label: 'Leads froids relancés', value: t.leads_froids || 0 },
    { icon: '🔥', label: 'Appels On Fire', value: t.appels_on_fire || 0 },
    { icon: '📲', label: 'Appels entrants', value: t.appels_entrants || 0 },
  ];

  return kpis.map(k => `
    <div class="ph-kpi-card">
      <div class="ph-kpi-icon">${k.icon}</div>
      <div class="ph-kpi-value">${k.value}</div>
      <div class="ph-kpi-label">${k.label}</div>
    </div>
  `).join('');
}

// ─── Admin Énergie : Tableau de suivi (admin only) ───────────

let energyWeekStart = '';

function initAdminEnergy() {
  const prevBtn = document.getElementById('energy-prev-week');
  const nextBtn = document.getElementById('energy-next-week');
  if (!prevBtn) return;

  energyWeekStart = getMonday(new Date().toISOString().slice(0, 10));

  prevBtn.addEventListener('click', () => {
    const d = new Date(energyWeekStart + 'T00:00:00');
    d.setDate(d.getDate() - 7);
    energyWeekStart = formatDate(d);
    loadAdminEnergy();
  });
  nextBtn.addEventListener('click', () => {
    const d = new Date(energyWeekStart + 'T00:00:00');
    d.setDate(d.getDate() + 7);
    energyWeekStart = formatDate(d);
    loadAdminEnergy();
  });
}

const ENERGY_EMOJIS = { 3: '😊', 2: '😐', 1: '😞' };
const ENERGY_LABELS = { 3: 'Bon', 2: 'Moyen', 1: 'Bas' };
const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

async function loadAdminEnergy() {
  const container = document.getElementById('energy-table-container');
  if (!container) return;

  if (!energyWeekStart) energyWeekStart = getMonday(new Date().toISOString().slice(0, 10));

  // Update label
  const label = document.getElementById('energy-week-label');
  const startD = new Date(energyWeekStart + 'T00:00:00');
  const endD = new Date(startD);
  endD.setDate(endD.getDate() + 6);
  const fmtD = d => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  if (label) label.textContent = `${fmtD(startD)} → ${fmtD(endD)} ${endD.getFullYear()}`;

  try {
    const data = await api(`/admin/energy/${energyWeekStart}`);
    if (!data.reps || data.reps.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px 0;">Aucun commercial</p>';
      return;
    }

    function energyCell(val) {
      if (!val) return '<td class="nrj-cell nrj-empty">—</td>';
      const emoji = ENERGY_EMOJIS[val] || '—';
      const cls = val === 3 ? 'nrj-good' : val === 2 ? 'nrj-mid' : 'nrj-low';
      return `<td class="nrj-cell ${cls}">${emoji}</td>`;
    }

    function avgCell(avg) {
      if (avg === null) return '<td class="nrj-cell nrj-empty">—</td>';
      const cls = avg >= 2.5 ? 'nrj-good' : avg >= 1.5 ? 'nrj-mid' : 'nrj-low';
      const emoji = avg >= 2.5 ? '😊' : avg >= 1.5 ? '😐' : '😞';
      return `<td class="nrj-cell nrj-avg ${cls}">${emoji} ${avg.toFixed(1)}</td>`;
    }

    let html = `<table class="nrj-table">
      <thead>
        <tr>
          <th>Commercial</th>
          ${DAY_NAMES.map((d, i) => {
            const dd = new Date(energyWeekStart + 'T00:00:00');
            dd.setDate(dd.getDate() + i);
            return `<th>${d}<br><span class="nrj-date">${dd.getDate()}</span></th>`;
          }).join('')}
          <th>Moy.</th>
        </tr>
      </thead>
      <tbody>
        ${data.reps.map(r => `
          <tr>
            <td class="nrj-name">${r.name}</td>
            ${r.days.map(v => energyCell(v)).join('')}
            ${avgCell(r.avg)}
          </tr>
        `).join('')}
      </tbody>
    </table>`;

    container.innerHTML = html;
  } catch (err) {
    console.error('Erreur chargement énergie:', err);
    container.innerHTML = '<p style="color:red;">Erreur de chargement</p>';
  }
}

// ─── Admin Phoneurs : Récap mensuel (admin only) ─────────────

let currentPhoneursMonth = '';

function initAdminPhoneursNav() {
  const prevBtn = document.getElementById('ph-prev-month');
  const nextBtn = document.getElementById('ph-next-month');
  const picker = document.getElementById('ph-month-picker');
  if (!prevBtn) return;

  const now = new Date();
  currentPhoneursMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  prevBtn.addEventListener('click', () => {
    const [y, m] = currentPhoneursMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    currentPhoneursMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    loadAdminPhoneurs();
  });
  nextBtn.addEventListener('click', () => {
    const [y, m] = currentPhoneursMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    currentPhoneursMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    loadAdminPhoneurs();
  });
  if (picker) {
    picker.addEventListener('change', () => {
      if (picker.value) {
        currentPhoneursMonth = picker.value;
        loadAdminPhoneurs();
      }
    });
  }
}

async function loadAdminPhoneurs() {
  const container = document.getElementById('admin-phoneurs-container');
  if (!container) return;

  if (!currentPhoneursMonth) {
    const now = new Date();
    currentPhoneursMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  // Update month nav label
  const label = document.getElementById('ph-month-label');
  const picker = document.getElementById('ph-month-picker');
  const [y, m] = currentPhoneursMonth.split('-').map(Number);
  const monthName = new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  if (label) label.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  if (picker) picker.value = currentPhoneursMonth;

  try {
    const data = await api(`/phoning/all-monthly/${currentPhoneursMonth}`);

    if (!data.phoneurs || data.phoneurs.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px 0;">Aucun phoneur enregistré</p>';
      return;
    }

    const avatarColors = [
      { bg: '#FAEEDA', color: '#854F0B' },
      { bg: '#EEEDFE', color: '#3C3489' },
      { bg: '#EAF3DE', color: '#3B6D11' },
      { bg: '#FCEBEB', color: '#A32D2D' },
    ];

    let html = '';
    data.phoneurs.forEach((p, idx) => {
      const t = p.totals;
      const ac = avatarColors[idx % avatarColors.length];
      const initiales = p.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

      const totalAppels = (t.appels_rdv_demain || 0) + (t.appels_on_fire || 0) +
        (t.appels_entrants || 0) + (t.appels_vni || 0) + (t.appels_clients || 0) +
        (t.appels_resilies || 0) + (t.appels_annules_noshow || 0);
      const totalRDV = (t.rdv_on_fire || 0) + (t.rdv_leads_froids || 0);
      const taux = totalAppels > 0 ? Math.round((totalRDV / totalAppels) * 100) : 0;

      const kpis = [
        { icon: '📅', label: 'Jours travaillés', value: p.days_worked },
        { icon: '⏱️', label: 'Heures', value: `${(t.heures_travaillees || 0).toFixed(1)}h` },
        { icon: '📞', label: 'Total appels', value: totalAppels },
        { icon: '📅', label: 'RDV fixés', value: totalRDV },
        { icon: '🎯', label: 'Taux → RDV', value: `${taux}%` },
        { icon: '🔥', label: 'Appels On Fire', value: t.appels_on_fire || 0 },
        { icon: '❄️', label: 'Leads froids', value: t.leads_froids || 0 },
        { icon: '📲', label: 'Appels entrants', value: t.appels_entrants || 0 },
      ];

      html += `
        <div class="aph-card">
          <div class="aph-card-header">
            <div class="aph-avatar" style="background:${ac.bg};color:${ac.color}">${initiales}</div>
            <div class="aph-header-info">
              <h3 class="aph-name">${p.name}</h3>
              <span class="aph-subtitle">${p.days_worked} jour(s) travaillé(s)</span>
            </div>
          </div>
          <div class="aph-kpi-grid">
            ${kpis.map(k => `
              <div class="aph-kpi">
                <span class="aph-kpi-icon">${k.icon}</span>
                <span class="aph-kpi-value">${k.value}</span>
                <span class="aph-kpi-label">${k.label}</span>
              </div>
            `).join('')}
          </div>
          <div class="aph-details">
            <table class="aph-table">
              <tbody>
                ${PHONING_COUNTERS.map(c => {
                  const val = t[c.key] || 0;
                  return `<tr><td class="aph-td-label">${c.label}</td><td class="aph-td-val">${val}${c.unit ? ' ' + c.unit : ''}</td></tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>`;
    });

    container.innerHTML = html;
  } catch (err) {
    console.error('Erreur chargement phoneurs:', err);
    container.innerHTML = '<p style="color:red;">Erreur de chargement</p>';
  }
}

// ─── Admin Contrôle : Onglet contrôle hebdomadaire ───────────

let ctrlWeekStart = '';

function initControlTab() {
  const select = document.getElementById('ctrl-rep-select');
  const prevBtn = document.getElementById('ctrl-prev-week');
  const nextBtn = document.getElementById('ctrl-next-week');
  if (!select) return;

  ctrlWeekStart = getMonday(new Date().toISOString().slice(0, 10));

  select.addEventListener('change', () => loadControlTab());
  prevBtn.addEventListener('click', () => {
    ctrlWeekStart = addDays(ctrlWeekStart, -7);
    loadControlTab();
  });
  nextBtn.addEventListener('click', () => {
    ctrlWeekStart = addDays(ctrlWeekStart, 7);
    loadControlTab();
  });
}

async function loadControlTab() {
  const container = document.getElementById('ctrl-container');
  const select = document.getElementById('ctrl-rep-select');
  if (!container || !select) return;

  if (!ctrlWeekStart) ctrlWeekStart = getMonday(new Date().toISOString().slice(0, 10));

  // Update week label
  const label = document.getElementById('ctrl-week-label');
  const startD = new Date(ctrlWeekStart + 'T00:00:00');
  const endD = new Date(startD);
  endD.setDate(endD.getDate() + 6);
  const fmtD = d => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  if (label) label.textContent = `${fmtD(startD)} → ${fmtD(endD)} ${endD.getFullYear()}`;

  // Populate rep select (commercials only, not phoneurs, not archived)
  const commercials = salesReps.filter(r => r.role !== 'phoneur' && !r.archived);
  const currentVal = select.value;
  if (select.options.length <= 1) {
    commercials.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = r.name;
      select.appendChild(opt);
    });
  }
  if (currentVal) select.value = currentVal;

  const repId = select.value;
  if (!repId) {
    container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px 0;">Sélectionnez un commercial pour voir son contrôle</p>';
    return;
  }

  try {
    const data = await api(`/control/${repId}/${ctrlWeekStart}`);
    const repName = commercials.find(r => r.id == repId)?.name || '';

    // ── Bloc 1 : CA semaine ──
    let html = `
      <div class="ctrl-summary">
        <div class="ctrl-ca-card">
          <div class="ctrl-ca-label">CA Semaine</div>
          <div class="ctrl-ca-value">${data.ca.toLocaleString('fr-FR')} €</div>
          <div class="ctrl-ca-sub">${data.nb_ventes} vente${data.nb_ventes > 1 ? 's' : ''}</div>
        </div>
      </div>`;

    // ── Bloc 2 : Heures (contrôle + modification) ──
    const hoursChecked = data.hours_controlled ? 'checked' : '';
    html += `
      <div class="ctrl-hours-section">
        <h3>Heures déclarées</h3>
        <div class="ctrl-hours-row">
          <div class="ctrl-hours-input-wrap">
            <label class="ctrl-hours-label">Heures semaine</label>
            <input type="number" id="ctrl-hours-input" class="ctrl-hours-input" value="${data.hours_worked}" step="0.5" min="0" max="80">
          </div>
          <div class="ctrl-hours-actions">
            <button class="ctrl-hours-save" onclick="saveControlHours(${repId}, '${ctrlWeekStart}')">Enregistrer</button>
            <label class="ctrl-checkbox ctrl-hours-check">
              <input type="checkbox" ${hoursChecked} onchange="toggleHoursControlled(${repId}, '${ctrlWeekStart}', this.checked)">
              <span class="ctrl-checkmark"></span>
              <span class="ctrl-hours-check-label">Validé</span>
            </label>
          </div>
        </div>
      </div>`;

    // ── Bloc 3 : Badges du mois ──
    html += await renderControlBadges(repId, repName, data.month);

    // ── Bloc 4 : Tableau des ventes ──
    const repOptions = salesReps.filter(r => r.role !== 'phoneur' && !r.archived)
      .map(r => `<option value="${r.id}">${r.name}</option>`).join('');

    if (data.sales.length === 0) {
      html += '<div class="ctrl-empty">Aucune vente cette semaine</div>';
    } else {
      html += `
        <div class="ctrl-sales-section">
          <h3>Ventes de la semaine</h3>
          <table class="ctrl-sales-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Commercial</th>
                <th>Nom</th>
                <th>Prénom</th>
                <th>Montant</th>
                <th>RIB</th>
                <th>Contrôlé</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${data.sales.map(s => {
                const noRib = s.rib_status !== 'Reçu';
                return `<tr class="${noRib ? 'ctrl-row-no-rib' : ''}" id="ctrl-sale-${s.id}">
                  <td><input type="date" class="ctrl-edit-input ctrl-edit-date" value="${s.date}" data-field="date"></td>
                  <td><select class="ctrl-edit-input ctrl-edit-rep" data-field="sales_rep_id">${repOptions.replace(`value="${s.sales_rep_id}"`, `value="${s.sales_rep_id}" selected`)}</select></td>
                  <td><input type="text" class="ctrl-edit-input" value="${s.client_last_name || ''}" data-field="client_last_name" placeholder="Nom"></td>
                  <td><input type="text" class="ctrl-edit-input" value="${s.client_first_name || ''}" data-field="client_first_name" placeholder="Prénom"></td>
                  <td><input type="number" class="ctrl-edit-input ctrl-edit-amount" value="${s.amount}" step="0.01" min="0" data-field="amount"></td>
                  <td><select class="ctrl-edit-input ctrl-edit-rib" data-field="rib_status">
                    <option value="Reçu" ${s.rib_status === 'Reçu' ? 'selected' : ''}>Fourni</option>
                    <option value="Non fourni" ${s.rib_status !== 'Reçu' ? 'selected' : ''}>Non fourni</option>
                  </select></td>
                  <td class="ctrl-check-cell">
                    <label class="ctrl-checkbox">
                      <input type="checkbox" ${s.controlled ? 'checked' : ''} onchange="toggleControlled(${s.id}, this.checked)">
                      <span class="ctrl-checkmark"></span>
                    </label>
                  </td>
                  <td class="ctrl-actions-cell">
                    <button class="ctrl-save-sale" onclick="saveCtrlSale(${s.id})" title="Enregistrer">💾</button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
    }

    // ── Bloc 4 : Suivi Énergie de la semaine ──
    html += await renderControlEnergy(repId, ctrlWeekStart);

    // ── Bloc 5 : Points de satisfaction / amélioration ──
    html += await renderControlAnalysis(repId, data.month);

    container.innerHTML = html;
  } catch (err) {
    console.error('Erreur chargement contrôle:', err);
    container.innerHTML = '<p style="color:red;">Erreur de chargement</p>';
  }
}

async function toggleControlled(saleId, controlled) {
  try {
    await api(`/sales/${saleId}/controlled`, { method: 'PUT', body: { controlled } });
  } catch (err) {
    console.error('Erreur toggle controlled:', err);
  }
}

async function saveControlHours(repId, weekStart) {
  const input = document.getElementById('ctrl-hours-input');
  if (!input) return;
  const hours = parseFloat(input.value) || 0;
  try {
    await api(`/control/${repId}/${weekStart}/hours`, { method: 'PUT', body: { hours_worked: hours } });
    // Flash success
    const btn = document.querySelector('.ctrl-hours-save');
    if (btn) {
      btn.textContent = '✓ Enregistré';
      btn.style.background = 'var(--success)';
      setTimeout(() => { btn.textContent = 'Enregistrer'; btn.style.background = ''; }, 2000);
    }
  } catch (err) {
    alert('Erreur : ' + (err.message || 'Impossible de modifier les heures'));
  }
}

async function toggleHoursControlled(repId, weekStart, controlled) {
  try {
    await api(`/control/${repId}/${weekStart}/hours`, { method: 'PUT', body: { hours_controlled: controlled } });
  } catch (err) {
    console.error('Erreur toggle hours controlled:', err);
  }
}

async function saveCtrlSale(saleId) {
  const row = document.getElementById(`ctrl-sale-${saleId}`);
  if (!row) return;

  const getValue = (field) => {
    const el = row.querySelector(`[data-field="${field}"]`);
    return el ? el.value : '';
  };

  const body = {
    date: getValue('date'),
    sales_rep_id: parseInt(getValue('sales_rep_id')),
    client_last_name: getValue('client_last_name'),
    client_first_name: getValue('client_first_name'),
    amount: parseFloat(getValue('amount')) || 0,
    rib_status: getValue('rib_status')
  };

  try {
    await api(`/sales/${saleId}`, { method: 'PUT', body });
    const btn = row.querySelector('.ctrl-save-sale');
    if (btn) {
      btn.textContent = '✓';
      btn.style.background = 'var(--success)';
      btn.style.color = 'white';
      setTimeout(() => { btn.textContent = '💾'; btn.style.background = ''; btn.style.color = ''; }, 2000);
    }
    // Update row color based on RIB
    const noRib = body.rib_status !== 'Reçu';
    row.className = noRib ? 'ctrl-row-no-rib' : '';
  } catch (err) {
    alert('Erreur : ' + (err.message || 'Impossible de modifier la vente'));
  }
}

async function renderControlBadges(repId, repName, month) {
  // Fetch monthly summary to compute badges
  try {
    const summaryData = await api(`/months/${month}/summary`);
    const activeReps = summaryData.rep_stats.filter(r => r.total_hours > 0);
    if (activeReps.length === 0) return '<div class="ctrl-empty">Aucun badge ce mois</div>';

    let monthlyCounters = [];
    let disciplineData = [];
    try { monthlyCounters = await api(`/daily-actions/monthly/${month}`); } catch (e) {}
    try { disciplineData = await api(`/daily-actions/discipline/${month}`); } catch (e) {}

    const counterTotals = {};
    activeReps.forEach(r => { counterTotals[r.sales_rep_id] = { name: r.name, rdv_fixes: 0, references: 0, entretien_premier_mois: 0, contact_entreprise: 0, discipline: 0, panier_moyen: r.panier_moyen }; });
    monthlyCounters.forEach(row => {
      if (!counterTotals[row.sales_rep_id]) return;
      if (row.action_key === 'predefined:rdv_fixes') counterTotals[row.sales_rep_id].rdv_fixes = row.total;
      if (row.action_key === 'predefined:references') counterTotals[row.sales_rep_id].references = row.total;
      if (row.action_key === 'predefined:entretien_premier_mois') counterTotals[row.sales_rep_id].entretien_premier_mois = row.total;
      if (row.action_key === 'predefined:contact_entreprise') counterTotals[row.sales_rep_id].contact_entreprise = row.total;
    });
    disciplineData.forEach(row => {
      if (counterTotals[row.sales_rep_id]) counterTotals[row.sales_rep_id].discipline = row.total_actions;
    });
    const counterList = Object.values(counterTotals);

    const bestPanier = [...activeReps].sort((a, b) => b.panier_moyen - a.panier_moyen)[0];
    const bestRDV = [...counterList].sort((a, b) => b.rdv_fixes - a.rdv_fixes)[0];
    const bestRef = [...counterList].sort((a, b) => b.references - a.references)[0];
    const bestAccueil = [...counterList].sort((a, b) => b.entretien_premier_mois - a.entretien_premier_mois)[0];
    const bestBusiness = [...counterList].sort((a, b) => b.contact_entreprise - a.contact_entreprise)[0];
    const bestDiscipline = [...counterList].sort((a, b) => b.discipline - a.discipline)[0];

    const badges = [
      { icon: '💎', title: 'Premium', winner: bestPanier.panier_moyen > 0 ? bestPanier.name : null },
      { icon: '📞', title: 'RDV', winner: bestRDV.rdv_fixes > 0 ? bestRDV.name : null },
      { icon: '🤝', title: 'Ambassadeur', winner: bestRef.references > 0 ? bestRef.name : null },
      { icon: '👋', title: 'Accueil', winner: bestAccueil.entretien_premier_mois > 0 ? bestAccueil.name : null },
      { icon: '💼', title: 'Business', winner: bestBusiness.contact_entreprise > 0 ? bestBusiness.name : null },
      { icon: '🏆', title: 'Discipline', winner: bestDiscipline.discipline > 0 ? bestDiscipline.name : null },
    ];

    // Filter: only show badges won by this rep
    const wonBadges = badges.filter(b => b.winner === repName);

    if (wonBadges.length === 0) {
      return '<div class="ctrl-badges-section"><h3>Badges du mois</h3><div class="ctrl-empty-inline">Aucun badge obtenu ce mois</div></div>';
    }

    let badgeHTML = '<div class="ctrl-badges-section"><h3>Badges du mois</h3><div class="ctrl-badges-row">';
    wonBadges.forEach(b => {
      badgeHTML += `<div class="ctrl-badge"><span class="ctrl-badge-icon">${b.icon}</span><span class="ctrl-badge-title">${b.title}</span></div>`;
    });
    badgeHTML += '</div></div>';
    return badgeHTML;
  } catch (e) {
    return '';
  }
}

async function renderControlEnergy(repId, weekStart) {
  try {
    const data = await api(`/admin/energy/${weekStart}`);
    const rep = data.reps.find(r => r.sales_rep_id == repId);
    if (!rep) return '<div class="ctrl-energy-section"><h3>Suivi Énergie</h3><p class="ctrl-empty">Aucune donnée</p></div>';

    const startD = new Date(weekStart + 'T00:00:00');

    let html = `
      <div class="ctrl-energy-section">
        <h3>Suivi Énergie</h3>
        <div class="ctrl-energy-grid">
          ${DAY_NAMES.map((day, i) => {
            const dd = new Date(startD);
            dd.setDate(dd.getDate() + i);
            const val = rep.days[i];
            const emoji = val ? (ENERGY_EMOJIS[val] || '—') : '—';
            const cls = val === 3 ? 'ctrl-nrj-good' : val === 2 ? 'ctrl-nrj-mid' : val === 1 ? 'ctrl-nrj-low' : 'ctrl-nrj-empty';
            return `
              <div class="ctrl-nrj-cell ${cls}">
                <span class="ctrl-nrj-day">${day} ${dd.getDate()}</span>
                <span class="ctrl-nrj-emoji">${emoji}</span>
              </div>`;
          }).join('')}
          <div class="ctrl-nrj-cell ctrl-nrj-avg ${rep.avg >= 2.5 ? 'ctrl-nrj-good' : rep.avg >= 1.5 ? 'ctrl-nrj-mid' : rep.avg ? 'ctrl-nrj-low' : 'ctrl-nrj-empty'}">
            <span class="ctrl-nrj-day">Moy.</span>
            <span class="ctrl-nrj-emoji">${rep.avg !== null ? (rep.avg >= 2.5 ? '😊' : rep.avg >= 1.5 ? '😐' : '😞') + ' ' + rep.avg.toFixed(1) : '—'}</span>
          </div>
        </div>
      </div>`;
    return html;
  } catch (e) {
    return '';
  }
}

async function renderControlAnalysis(repId, month) {
  try {
    const summaryData = await api(`/months/${month}/summary`);
    const repStat = summaryData.rep_stats.find(r => r.sales_rep_id == repId);
    if (!repStat || repStat.total_hours === 0) {
      return '<div class="ctrl-analysis-section"><h3>Analyse</h3><div class="ctrl-empty-inline">Pas assez de données pour générer une analyse</div></div>';
    }

    let analysisDataArr = [];
    try {
      const result = await api(`/months/${month}/analysis-data`);
      analysisDataArr = result.reps || [];
    } catch (e) {}

    const ad = analysisDataArr.find(d => d.sales_rep_id == repId) || { counters: {}, sales_no_rib: 0, commercial_days: 0, complete_days: 0, rdv_objectif_par_jour: 2 };
    const analysis = analyzeRep(repStat, ad);

    let html = '<div class="ctrl-analysis-section"><h3>Analyse du mois</h3>';

    if (analysis.satisfaction.length > 0) {
      html += '<div class="ctrl-analysis-blk ctrl-blk-ok"><div class="ctrl-blk-label">Points de satisfaction</div>';
      analysis.satisfaction.forEach(p => { html += `<div>• ${p.text}</div>`; });
      html += '</div>';
    }

    if (analysis.amelioration.length > 0) {
      html += '<div class="ctrl-analysis-blk ctrl-blk-ko"><div class="ctrl-blk-label">Points d\'amélioration</div>';
      analysis.amelioration.forEach(p => { html += `<div>• ${p.text}</div>`; });
      html += '</div>';
    }

    if (analysis.satisfaction.length === 0 && analysis.amelioration.length === 0) {
      if (analysis.neutres.length > 0) {
        html += '<div class="ctrl-analysis-blk ctrl-blk-neutre"><div class="ctrl-blk-label">Points neutres</div>';
        analysis.neutres.forEach(p => { html += `<div>• ${p.text}</div>`; });
        html += '</div>';
      } else {
        html += '<div class="ctrl-empty-inline">Pas assez de données pour générer une analyse pertinente</div>';
      }
    }

    html += '</div>';
    return html;
  } catch (e) {
    return '';
  }
}

// ─── Admin Actions : Suivi actions hebdo (admin only) ────────

let actionsWeekStart = '';

function initAdminActionsNav() {
  const prevBtn = document.getElementById('act-prev-week');
  const nextBtn = document.getElementById('act-next-week');
  if (!prevBtn) return;

  actionsWeekStart = getMonday(new Date().toISOString().slice(0, 10));

  prevBtn.addEventListener('click', () => {
    const d = new Date(actionsWeekStart + 'T00:00:00');
    d.setDate(d.getDate() - 7);
    actionsWeekStart = formatDate(d);
    loadAdminActions();
  });
  nextBtn.addEventListener('click', () => {
    const d = new Date(actionsWeekStart + 'T00:00:00');
    d.setDate(d.getDate() + 7);
    actionsWeekStart = formatDate(d);
    loadAdminActions();
  });

  const dayFilter = document.getElementById('act-day-filter');
  if (dayFilter) dayFilter.addEventListener('change', () => loadAdminActions());

  const periodToggle = document.getElementById('act-period-toggle');
  if (periodToggle) periodToggle.addEventListener('change', () => loadAdminActions());
}

async function loadAdminActions() {
  const container = document.getElementById('admin-actions-container');
  if (!container) return;

  if (!actionsWeekStart) actionsWeekStart = getMonday(new Date().toISOString().slice(0, 10));

  // Update label
  const label = document.getElementById('act-week-label');
  const startD = new Date(actionsWeekStart + 'T00:00:00');
  const endD = new Date(startD);
  endD.setDate(endD.getDate() + 6);
  const fmtD = d => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  if (label) label.textContent = `${fmtD(startD)} → ${fmtD(endD)} ${endD.getFullYear()}`;

  // Populate day filter
  const dayFilter = document.getElementById('act-day-filter');
  if (dayFilter && dayFilter.options.length <= 1) {
    const dayNames = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startD);
      d.setDate(d.getDate() + i);
      const opt = document.createElement('option');
      opt.value = d.toISOString().slice(0, 10);
      opt.textContent = `${dayNames[i]} ${d.getDate()}`;
      dayFilter.appendChild(opt);
    }
  }
  // Update day filter options when week changes
  if (dayFilter && dayFilter.options.length > 1) {
    const dayNames = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startD);
      d.setDate(d.getDate() + i);
      dayFilter.options[i + 1].value = d.toISOString().slice(0, 10);
      dayFilter.options[i + 1].textContent = `${dayNames[i]} ${d.getDate()}`;
    }
  }

  const filterDay = dayFilter ? dayFilter.value : 'all';
  const periodToggle = document.getElementById('act-period-toggle');
  const period = periodToggle ? periodToggle.value : 'week';

  // Load comparison table
  await loadActionsComparison(period);

  try {
    const data = await api(`/admin/actions/${actionsWeekStart}`);

    if (!data.reps || data.reps.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px;">Aucun commercial</p>';
      return;
    }

    const daysToShow = filterDay === 'all' ? data.days : [filterDay];
    const dayLabels = { 0: 'Lun', 1: 'Mar', 2: 'Mer', 3: 'Jeu', 4: 'Ven', 5: 'Sam', 6: 'Dim' };

    let html = '';
    data.reps.forEach(rep => {
      // Check if rep has any data for the filtered days
      const hasData = daysToShow.some(d => rep.days[d] && Object.keys(rep.days[d]).length > 0);

      html += `<div class="act-rep-card">
        <h3 class="act-rep-name">${rep.name}</h3>`;

      daysToShow.forEach(day => {
        const vals = rep.days[day] || {};
        const dayD = new Date(day + 'T00:00:00');
        const dayLabel = dayD.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });

        // Checkboxes (Club 1 + Club 2)
        const checks = PREDEFINED_YESNO.map(a => {
          const v1 = vals[`predefined:${a.key}`] || 0;
          const v2 = vals[`club2:${a.key}`] || 0;
          const done = v1 > 0 || v2 > 0;
          const both = v1 > 0 && v2 > 0;
          return { key: a.key, label: a.label, done, both, v1, v2 };
        });

        // Counters (Club 1 + Club 2 summed)
        const counters = PREDEFINED_COUNTERS.map(c => {
          const v1 = vals[`predefined:${c.key}`] || 0;
          const v2 = vals[`club2:${c.key}`] || 0;
          return { key: c.key, label: c.label, value: v1 + v2, v1, v2 };
        });

        const allChecked = checks.every(c => c.done);
        const anyData = checks.some(c => c.done) || counters.some(c => c.value > 0);
        const adminMode = currentUser && currentUser.role === 'admin';

        html += `
          <div class="act-day-block ${!anyData ? 'act-day-empty' : ''}">
            <div class="act-day-header">${dayLabel}</div>
            <div class="act-day-content">
              <div class="act-checks">
                ${checks.map(c => {
                  if (adminMode) {
                    return `
                      <div class="act-check-row ${c.done ? 'act-done' : 'act-missing'} act-editable"
                           data-rep="${rep.sales_rep_id}" data-day="${day}" data-key="${c.key}" data-type="yesno"
                           data-v1="${c.v1}" data-v2="${c.v2}"
                           onclick="toggleActionCheck(this)">
                        <span class="act-check-icon">${c.done ? '✅' : '❌'}</span>
                        <span>${c.label}</span>
                        ${c.both ? '<span class="act-club-badge">×2</span>' : ''}
                      </div>`;
                  }
                  return `
                    <div class="act-check-row ${c.done ? 'act-done' : 'act-missing'}">
                      <span class="act-check-icon">${c.done ? '✅' : '❌'}</span>
                      <span>${c.label}</span>
                      ${c.both ? '<span class="act-club-badge">×2</span>' : ''}
                    </div>`;
                }).join('')}
              </div>
              <div class="act-counters">
                ${counters.map(c => {
                  if (adminMode) {
                    return `
                      <div class="act-counter-item act-editable">
                        <span class="act-counter-label">${c.label}</span>
                        <input type="number" min="0" class="act-counter-input" value="${c.value}"
                               data-rep="${rep.sales_rep_id}" data-day="${day}" data-key="${c.key}"
                               data-v1="${c.v1}" data-v2="${c.v2}"
                               onchange="updateActionCounter(this)">
                      </div>`;
                  }
                  return `
                    <div class="act-counter-item">
                      <span class="act-counter-label">${c.label}</span>
                      <span class="act-counter-value ${c.value > 0 ? 'act-counter-active' : ''}">${c.value}</span>
                    </div>`;
                }).join('')}
              </div>
            </div>
          </div>`;
      });

      html += '</div>';
    });

    container.innerHTML = html;
  } catch (err) {
    console.error('Erreur chargement actions:', err);
    container.innerHTML = '<p style="color:red;">Erreur de chargement</p>';
  }
}

// ─── Admin: toggle yesno action ──────────────────────────────
async function toggleActionCheck(el) {
  const repId = el.dataset.rep;
  const day = el.dataset.day;
  const key = el.dataset.key;
  const v1 = parseInt(el.dataset.v1) || 0;
  const newVal = v1 > 0 ? 0 : 1; // toggle

  try {
    await api(`/daily-actions/values/${repId}/${day}`, {
      method: 'PUT',
      body: { action_key: `predefined:${key}`, value: newVal }
    });
    // Reload actions tab
    await loadAdminActions();
  } catch (err) {
    console.error('Erreur toggle action:', err);
  }
}

// ─── Admin: update counter action ────────────────────────────
async function updateActionCounter(el) {
  const repId = el.dataset.rep;
  const day = el.dataset.day;
  const key = el.dataset.key;
  const newVal = parseInt(el.value) || 0;

  try {
    await api(`/daily-actions/values/${repId}/${day}`, {
      method: 'PUT',
      body: { action_key: `predefined:${key}`, value: newVal }
    });
    // Reload comparison table
    const periodToggle = document.getElementById('act-period-toggle');
    const period = periodToggle ? periodToggle.value : 'week';
    await loadActionsComparison(period);
  } catch (err) {
    console.error('Erreur update counter:', err);
  }
}

// ─── Admin: update hours from comparison table ───────────────
async function updateCompHours(el, repId, targetPerHour) {
  const hours = parseFloat(el.value) || 0;
  try {
    await api(`/weeks/${actionsWeekStart}/settings/${repId}`, {
      method: 'PUT',
      body: { hours_worked: hours, target_per_hour: targetPerHour }
    });
  } catch (err) {
    console.error('Erreur update heures comparatif:', err);
  }
}

// ─── Admin: update action from comparison table ──────────────
// Distributes the new total to the first day (Monday) of the week
async function updateCompAction(el) {
  const repId = el.dataset.rep;
  const key = el.dataset.key;
  const newTotal = parseInt(el.value) || 0;

  // For simplicity: set Monday's value to the new total, reset other days
  // First get current weekly data to know old per-day distribution
  try {
    const data = await api(`/admin/actions/${actionsWeekStart}`);
    const rep = data.reps.find(r => r.sales_rep_id == repId);
    if (!rep) return;

    // Calculate current total for this key across all days
    let currentTotal = 0;
    const days = data.days;
    days.forEach(day => {
      const v = (rep.days[day] && rep.days[day][`predefined:${key}`]) || 0;
      currentTotal += v;
    });

    const delta = newTotal - currentTotal;
    if (delta === 0) return;

    // Apply delta to Monday (first day)
    const monday = days[0];
    const mondayVal = (rep.days[monday] && rep.days[monday][`predefined:${key}`]) || 0;
    const newMondayVal = Math.max(0, mondayVal + delta);

    await api(`/daily-actions/values/${repId}/${monday}`, {
      method: 'PUT',
      body: { action_key: `predefined:${key}`, value: newMondayVal }
    });

    // Reload the detail section too
    await loadAdminActions();
  } catch (err) {
    console.error('Erreur update action comparatif:', err);
  }
}

async function loadActionsComparison(period) {
  const tableDiv = document.getElementById('act-comparison-table');
  if (!tableDiv) return;

  try {
    let reps;
    let periodLabel;

    if (period === 'month') {
      // Use month of the current week
      const month = actionsWeekStart.slice(0, 7);
      const data = await api(`/admin/actions-summary/${month}`);
      reps = data.reps;
      const [y, m] = month.split('-').map(Number);
      periodLabel = new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    } else {
      // Use weekly data and aggregate
      const data = await api(`/admin/actions/${actionsWeekStart}`);
      const startD = new Date(actionsWeekStart + 'T00:00:00');
      const endD = new Date(startD);
      endD.setDate(endD.getDate() + 6);
      const fmtD = d => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      periodLabel = `${fmtD(startD)} → ${fmtD(endD)}`;

      reps = data.reps.map(rep => {
        const totals = {};
        Object.values(rep.days).forEach(dayVals => {
          Object.entries(dayVals).forEach(([key, val]) => {
            const k = key.replace('predefined:', '').replace('club2:', '');
            totals[k] = (totals[k] || 0) + val;
          });
        });
        const daysActive = Object.values(rep.days).filter(dv => Object.values(dv).some(v => v > 0)).length;
        return { sales_rep_id: rep.sales_rep_id, name: rep.name, totals, days_active: daysActive, total_hours: null, target_per_hour: null };
      });

      // Fetch hours for the week
      try {
        const dashboard = await api(`/weeks/${actionsWeekStart}/dashboard`);
        dashboard.commerciaux.forEach(c => {
          const r = reps.find(rr => rr.name === c.rep_name);
          if (r) {
            r.total_hours = c.hours_worked;
            r.target_per_hour = c.target_per_hour || 250;
            r.sales_rep_id = c.sales_rep_id;
          }
        });
      } catch (e) { /* ignore */ }
    }

    if (!reps || reps.length === 0) {
      tableDiv.innerHTML = '';
      return;
    }

    // Build columns: Heures + yesno checks (count of days done) + counters
    const yesnoKeys = PREDEFINED_YESNO.map(a => a.key);
    const counterKeys = PREDEFINED_COUNTERS.map(c => c.key);
    const adminMode = currentUser && currentUser.role === 'admin' && period === 'week';

    let html = `
      <div class="act-comp-section">
        <h3>Comparatif — ${periodLabel}</h3>
        <div class="act-comp-scroll">
          <table class="act-comp-table">
            <thead>
              <tr>
                <th>Commercial</th>
                <th>Heures</th>
                <th>Check studio</th>
                <th>Annulés / no-show</th>
                <th>Messages traités</th>
                <th>RDV de demain</th>
                <th>Story postée</th>
                <th>Ref</th>
                <th>1er mois</th>
                <th>RDV fixés</th>
                <th>Entreprise</th>
              </tr>
            </thead>
            <tbody>
              ${reps.map(r => {
                const t = r.totals || {};
                const repId = r.sales_rep_id || '';
                if (adminMode && repId) {
                  return `<tr>
                    <td class="act-comp-name">${r.name}</td>
                    <td class="act-comp-hours">
                      <input type="number" class="act-comp-input" value="${r.total_hours || 0}" min="0" step="0.5"
                             onchange="updateCompHours(this, ${repId}, ${r.target_per_hour || 250})">
                    </td>
                    ${yesnoKeys.map(k => {
                      const val = t[k] || 0;
                      return `<td class="act-comp-val">
                        <input type="number" class="act-comp-input" value="${val}" min="0"
                               data-rep="${repId}" data-key="${k}" data-type="yesno"
                               onchange="updateCompAction(this)">
                      </td>`;
                    }).join('')}
                    ${counterKeys.map(k => {
                      const val = t[k] || 0;
                      return `<td class="act-comp-val">
                        <input type="number" class="act-comp-input" value="${val}" min="0"
                               data-rep="${repId}" data-key="${k}" data-type="counter"
                               onchange="updateCompAction(this)">
                      </td>`;
                    }).join('')}
                  </tr>`;
                }
                return `<tr>
                  <td class="act-comp-name">${r.name}</td>
                  <td class="act-comp-hours">${r.total_hours !== null && r.total_hours !== undefined ? r.total_hours + 'h' : '—'}</td>
                  ${yesnoKeys.map(k => {
                    const val = t[k] || 0;
                    return `<td class="act-comp-val ${val > 0 ? 'act-comp-ok' : 'act-comp-zero'}">${val > 0 ? val + 'j' : '0'}</td>`;
                  }).join('')}
                  ${counterKeys.map(k => {
                    const val = t[k] || 0;
                    return `<td class="act-comp-val ${val > 0 ? 'act-comp-ok' : 'act-comp-zero'}">${val}</td>`;
                  }).join('')}
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;

    tableDiv.innerHTML = html;
  } catch (err) {
    console.error('Erreur chargement comparatif:', err);
    tableDiv.innerHTML = '';
  }
}

function applyFeatureStatus() {
  // Email : bouton test + relances
  const btnTestEmail = document.getElementById('btn-test-email');
  if (btnTestEmail) {
    btnTestEmail.disabled = !featureStatus.email;
    btnTestEmail.title = featureStatus.email ? 'Envoyer un email de test' : 'Email non configuré (SMTP manquant dans .env)';
  }
  // Relances : désactivées visuellement dans renderSalesTable si email non configuré
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

      // Show/hide header widgets only on Aujourd'hui tab
      const widgets = document.getElementById('header-widgets');
      if (widgets && !isAdmin()) {
        widgets.classList.toggle('hidden', btn.dataset.tab !== 'today');
      }

      if (btn.dataset.tab === 'today') loadTodayTab();
      if (btn.dataset.tab === 'ventes') loadSales();
      if (btn.dataset.tab === 'mensuel') loadMonthlySummary();
      if (btn.dataset.tab === 'notes') loadNotes();
      if (btn.dataset.tab === 'admin-phoneurs') loadAdminPhoneurs();
      if (btn.dataset.tab === 'admin-actions') loadAdminActions();
      if (btn.dataset.tab === 'controle') loadControlTab();
      if (btn.dataset.tab === 'phoning') loadPhoningTab();
      if (btn.dataset.tab === 'phoning-recap') loadPhoningRecap();
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

async function removeRepFromWeek(repId, repName) {
  if (!confirm(`Retirer "${repName}" de la semaine ${ctrlWeekStart || currentWeek} ?\n\nCela supprimera ses heures, ventes, actions et transcripts pour cette semaine. Cette action est irréversible.`)) return;
  try {
    const week = currentWeek;
    await api(`/weeks/${week}/rep/${repId}`, { method: 'DELETE' });
    loadDashboard();
  } catch (err) {
    alert('Erreur : ' + (err.message || 'Impossible de retirer le commercial'));
  }
}

async function loadDashboard() {
  updateWeekLabel();

  const data = await api(`/weeks/${currentWeekStart}/dashboard`);

  isLocked = data.commerciaux.some(c => c.locked);
  const lockBtn = document.getElementById('lock-week');
  lockBtn.textContent = isLocked ? 'Deverrouiller' : 'Verrouiller';
  lockBtn.classList.toggle('locked', isLocked);

  renderCards(data.commerciaux);

}

function renderCards(commerciaux) {
  const container = document.getElementById('cards-container');
  container.innerHTML = '';

  for (const c of commerciaux) {
    const card = document.createElement('div');
    card.className = 'rep-card';

    // Hero ratio calculations
    const ratioColor = c.ratio >= c.target_per_hour ? '#3B6D11'
      : c.ratio >= c.target_per_hour * 0.8 ? '#BA7517' : '#A32D2D';
    const heroBg = c.ratio >= c.target_per_hour ? '#EAF3DE'
      : c.ratio >= c.target_per_hour * 0.8 ? '#FAEEDA' : '#FCEBEB';
    const heroBorder = c.ratio >= c.target_per_hour ? '#c6e0a8'
      : c.ratio >= c.target_per_hour * 0.8 ? '#ecd5a8' : '#f0c4c4';
    const objPct = c.hours_worked > 0 && c.target_per_hour > 0
      ? Math.min(Math.round((c.ratio / c.target_per_hour) * 100), 100) : 0;
    const manque = c.target_per_hour > 0 && c.hours_worked > 0
      ? Math.round(c.target_per_hour * c.hours_worked - c.ca) : 0;
    const surplus = c.target_per_hour > 0 && c.hours_worked > 0
      ? Math.round(c.ca - c.target_per_hour * c.hours_worked) : 0;
    const ventesNecessaires = c.panier_moyen > 0 && manque > 0
      ? Math.ceil(manque / c.panier_moyen) : 0;

    const settingsDisabled = isLocked || !isAdmin();

    card.innerHTML = `
      <h2>${c.rep_name}${isAdmin() && !isLocked ? `<button class="btn-remove-rep-week" onclick="removeRepFromWeek(${c.sales_rep_id}, '${c.rep_name}')" title="Retirer ce commercial de la semaine">✕</button>` : ''}</h2>
      <div class="rep-ratio-hero" style="background:${c.hours_worked > 0 ? heroBg : 'var(--bg-subtle)'};border-color:${c.hours_worked > 0 ? heroBorder : 'var(--border-light)'}">
        <div class="rep-ratio-value" style="color:${c.hours_worked > 0 ? ratioColor : 'var(--text-muted)'}">
          ${c.ratio > 0 ? Math.round(c.ratio) + ' €/h' : '—'}
        </div>
        <div class="rep-ratio-sub">Ratio · Objectif : ${c.target_per_hour} €/h</div>
        <div class="rep-ratio-bar">
          <div class="rep-ratio-bar-fill" style="width:${objPct}%;background:${ratioColor}"></div>
        </div>
        ${manque > 0 && c.hours_worked > 0 ? `<div class="rep-ratio-ecart" style="color:#A32D2D">Il manque ${manque.toLocaleString('fr-FR')} € pour atteindre l'objectif</div>` : ''}
        ${surplus > 0 && c.hours_worked > 0 ? `<div class="rep-ratio-ecart" style="color:#3B6D11">Objectif dépassé de +${surplus.toLocaleString('fr-FR')} €</div>` : ''}
      </div>
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
            <option value="250" ${c.target_per_hour === 250 ? 'selected' : ''}>250</option>
            <option value="300" ${c.target_per_hour === 300 ? 'selected' : ''}>300</option>
            <option value="350" ${c.target_per_hour === 350 ? 'selected' : ''}>350</option>
            <option value="custom" ${c.target_per_hour !== 250 && c.target_per_hour !== 300 && c.target_per_hour !== 350 ? 'selected' : ''}>Autre</option>
          </select>
          <input type="number" step="1" min="0" value="${c.target_per_hour}"
                 data-rep-id="${c.sales_rep_id}" data-field="target-custom"
                 style="margin-top:4px;${c.target_per_hour !== 250 && c.target_per_hour !== 300 && c.target_per_hour !== 350 ? '' : 'display:none'}"
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
      </div>
      ${c.hours_worked > 0 ? `
      <div class="analysis-grid">
        <div class="analysis-ok">
          <div class="analysis-label">Points forts</div>
          <div>Volume : ${c.nb_ventes} vente${c.nb_ventes > 1 ? 's' : ''} · Panier moyen ${Math.round(c.panier_moyen).toLocaleString('fr-FR')} €</div>
        </div>
        <div class="analysis-ko">
          <div class="analysis-label">À améliorer</div>
          <div>Ratio ${Math.round(c.ratio)} €/h vs objectif ${c.target_per_hour} €/h</div>
          ${manque > 0 ? `<div>Il manque <strong>${manque.toLocaleString('fr-FR')} €</strong></div>` : ''}
          ${c.rib_manquants > 0 ? `<div>RIB à récupérer : ${c.rib_manquants} dossier${c.rib_manquants > 1 ? 's' : ''} en attente</div>` : ''}
        </div>
      </div>
      ${manque > 0 && ventesNecessaires > 0 ? `
      <div class="analysis-lever">
        Levier : ${ventesNecessaires} vente${ventesNecessaires > 1 ? 's' : ''} supplémentaire${ventesNecessaires > 1 ? 's' : ''} à ${Math.round(c.panier_moyen).toLocaleString('fr-FR')} € = objectif atteint
      </div>` : ''}` : ''}
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

    // "Aujourd'hui" daily actions section removed from admin dashboard

    // Chat messages section
    const chatSection = document.createElement('div');
    chatSection.className = 'chat-section';
    chatSection.innerHTML = `
      <div class="chat-label">Remarques</div>
      <div class="chat-messages" id="chat-messages-${c.sales_rep_id}"></div>
      <div class="chat-input-row">
        <input type="text" class="chat-input" placeholder="Écrire une remarque..." data-rep-id="${c.sales_rep_id}">
        <button class="chat-send-btn" data-rep-id="${c.sales_rep_id}">Envoyer</button>
      </div>
    `;
    card.appendChild(chatSection);

    // Send message events
    const chatInput = chatSection.querySelector('.chat-input');
    const chatSendBtn = chatSection.querySelector('.chat-send-btn');
    chatSendBtn.addEventListener('click', () => sendChatMessage(c.sales_rep_id, chatInput));
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && chatInput.value.trim()) sendChatMessage(c.sales_rep_id, chatInput);
    });

    // Append card to DOM BEFORE async loads (they use getElementById)
    container.appendChild(card);

    // Load async data
    loadChatMessages(c.sales_rep_id);
  }
}

async function saveSettings(repId, card) {
  const hours = parseFloat(card.querySelector('input[data-field="hours"]').value) || 0;
  const targetSelect = card.querySelector('select[data-field="target"]');
  let target;
  if (targetSelect.value === 'custom') {
    target = parseFloat(card.querySelector('input[data-field="target-custom"]').value) || 250;
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

// ─── Chat Messages ──────────────────────────────────────────

async function loadChatMessages(repId) {
  const container = document.getElementById(`chat-messages-${repId}`);
  if (!container) return;

  try {
    const data = await api(`/weeks/${currentWeekStart}/messages/${repId}`);
    container.innerHTML = '';

    // Show legacy transcript as first bubble if exists
    if (data.legacy_transcript && data.legacy_transcript.trim()) {
      const bubble = document.createElement('div');
      bubble.className = 'chat-bubble legacy';
      bubble.innerHTML = `
        <div class="chat-bubble-text">${data.legacy_transcript.replace(/\n/g, '<br>')}</div>
        <div class="chat-bubble-time">Ancien transcript</div>
      `;
      container.appendChild(bubble);
    }

    for (const msg of data.messages) {
      const bubble = document.createElement('div');
      bubble.className = 'chat-bubble';
      const date = new Date(msg.created_at);
      const timeStr = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' à ' + date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      bubble.innerHTML = `
        <div class="chat-bubble-text">${msg.message.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div>
        <div class="chat-bubble-meta">
          <span class="chat-bubble-time">${timeStr}</span>
          ${isAdmin() ? `<button class="chat-delete-btn" onclick="deleteChatMessage(${msg.id}, ${repId})">×</button>` : ''}
        </div>
      `;
      container.appendChild(bubble);
    }

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
  } catch (e) {
    console.error('Erreur chargement messages:', e);
  }
}

async function sendChatMessage(repId, inputEl) {
  const message = inputEl.value.trim();
  if (!message) return;

  try {
    await api(`/weeks/${currentWeekStart}/messages/${repId}`, {
      method: 'POST',
      body: { message }
    });
    inputEl.value = '';
    await loadChatMessages(repId);
  } catch (e) {
    alert(e.message);
  }
}

window.deleteChatMessage = async function(msgId, repId) {
  if (!confirm('Supprimer ce message ?')) return;
  try {
    await api(`/messages/${msgId}`, { method: 'DELETE' });
    await loadChatMessages(repId);
  } catch (e) {
    alert(e.message);
  }
};

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

  // RIB filter toggle
  const ribBtn = document.getElementById('v-filter-rib');
  ribBtn.addEventListener('click', () => {
    ribBtn.classList.toggle('active');
    loadSales();
  });

  document.getElementById('btn-add-sale').addEventListener('click', () => openSaleModal());
  initSalesSort();
}

// ─── Sales sort state ────────────────────────────────────────
let salesSortKey = null;   // 'date', 'rep_name', 'amount', etc.
let salesSortDir = 0;      // 0 = default, 1 = asc, -1 = desc

function initSalesSort() {
  document.querySelectorAll('#sales-table th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (salesSortKey === key) {
        // Cycle: asc → desc → default
        if (salesSortDir === 1) salesSortDir = -1;
        else if (salesSortDir === -1) { salesSortDir = 0; salesSortKey = null; }
        else salesSortDir = 1;
      } else {
        salesSortKey = key;
        salesSortDir = 1;
      }
      updateSortIcons();
      loadSales();
    });
  });
}

function updateSortIcons() {
  document.querySelectorAll('#sales-table th.sortable').forEach(th => {
    const icon = th.querySelector('.sort-icon');
    const key = th.dataset.sort;
    if (key === salesSortKey && salesSortDir !== 0) {
      th.classList.add('sort-active');
      icon.textContent = salesSortDir === 1 ? '↑' : '↓';
    } else {
      th.classList.remove('sort-active');
      icon.textContent = '';
    }
  });
}

function sortSales(sales) {
  if (!salesSortKey || salesSortDir === 0) return sales;
  const RIB_ORDER = { 'Reçu': 0, 'En attente': 1, 'Non fourni': 2 };

  return [...sales].sort((a, b) => {
    let va, vb;
    switch (salesSortKey) {
      case 'date':
        va = a.date || ''; vb = b.date || '';
        break;
      case 'amount':
        va = a.amount || 0; vb = b.amount || 0;
        return (va - vb) * salesSortDir;
      case 'rib_status':
        va = RIB_ORDER[a.rib_status] ?? 9;
        vb = RIB_ORDER[b.rib_status] ?? 9;
        return (va - vb) * salesSortDir;
      case 'relance':
        va = (a.r3_sent ? 3 : a.r2_sent ? 2 : a.r1_sent ? 1 : 0);
        vb = (b.r3_sent ? 3 : b.r2_sent ? 2 : b.r1_sent ? 1 : 0);
        return (va - vb) * salesSortDir;
      default:
        va = (a[salesSortKey] || '').toString().toLowerCase();
        vb = (b[salesSortKey] || '').toString().toLowerCase();
    }
    if (va < vb) return -1 * salesSortDir;
    if (va > vb) return 1 * salesSortDir;
    return 0;
  });
}

async function loadSales() {
  updateWeekLabel();
  const filterRep = document.getElementById('v-filter-rep').value;
  let url = `/weeks/${currentWeekStart}/sales`;
  if (filterRep) url += `?sales_rep_id=${filterRep}`;

  let sales = await api(url);

  // Filtre RIB manquants côté client
  const ribFilterActive = document.getElementById('v-filter-rib')?.classList.contains('active');
  if (ribFilterActive) {
    sales = sales.filter(s => s.rib_status !== 'Reçu');
  }

  // Apply sort
  sales = sortSales(sales);

  const tbody = document.querySelector('#sales-table tbody');
  tbody.innerHTML = '';

  if (sales.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-light);padding:24px">Aucune vente cette semaine</td></tr>';
    return;
  }

  for (const s of sales) {
    const ribClass = s.rib_status === 'Reçu' ? 'rib-recu' :
                     s.rib_status === 'En attente' ? 'rib-attente' : 'rib-non-fourni';

    // Relance buttons (only if RIB not received)
    let relanceHtml = '';
    if (s.rib_status !== 'Reçu') {
      const r1Done = !!s.r1_sent;
      const r2Done = !!s.r2_sent;
      const r3Done = !!s.r3_sent;

      const emailOff = !featureStatus.email;
      const noEmailTitle = 'Email non configuré (SMTP manquant)';
      relanceHtml = `
        <button class="btn-relance btn-valider-rib" onclick="validateRib(${s.id})">Valider</button>
        <button class="btn-relance btn-r1" onclick="sendRelance(${s.id}, 1)" ${r1Done || emailOff ? 'disabled' : ''} title="${emailOff ? noEmailTitle : (r1Done ? 'Envoyée le ' + s.r1_sent : '1ère relance')}">R1</button>
        <button class="btn-relance btn-r2" onclick="sendRelance(${s.id}, 2)" ${r2Done || !r1Done || emailOff ? 'disabled' : ''} title="${emailOff ? noEmailTitle : (r2Done ? 'Envoyée le ' + s.r2_sent : '2ème relance')}">R2</button>
        <button class="btn-relance btn-r3" onclick="sendRelance(${s.id}, 3)" ${r3Done || !r2Done || emailOff ? 'disabled' : ''} title="${emailOff ? noEmailTitle : (r3Done ? 'Envoyée le ' + s.r3_sent : 'Contentieux')}">R3</button>
      `;
    } else {
      relanceHtml = '<span style="color:var(--success);font-size:0.8rem;">✓ RIB reçu</span>';
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(s.date + 'T00:00:00').toLocaleDateString('fr-FR')}</td>
      <td>${s.rep_name}</td>
      <td style="font-weight:600">${fmtEuro(s.amount)}</td>
      <td>${s.client_first_name}</td>
      <td>${s.client_last_name}</td>
      <td><span class="rib-badge ${ribClass}">${s.rib_status || 'Non fourni'}</span></td>
      <td class="relance-actions">${relanceHtml}</td>
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

  // Default date: today
  const weekEnd = addDays(currentWeekStart, 6);
  const today = new Date().toISOString().slice(0, 10);
  const dateInput = document.getElementById('sale-date');
  dateInput.value = saleData?.date || today;
  dateInput.min = currentWeekStart;
  dateInput.max = weekEnd;

  document.getElementById('sale-amount').value = saleData?.amount || '';
  const clientName = saleData ? `${saleData.client_last_name || ''} ${saleData.client_first_name || ''}`.trim() : '';
  document.getElementById('sale-client-name').value = clientName;
  document.getElementById('sale-rib-status').value = saleData?.rib_status || 'Reçu';
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('sale-form').reset();
}

async function saveSale() {
  const id = document.getElementById('sale-id').value;
  const fullName = document.getElementById('sale-client-name').value.trim();
  const nameParts = fullName.split(/\s+/);
  const lastName = nameParts[0] || '';
  const firstName = nameParts.slice(1).join(' ') || '';
  const body = {
    sales_rep_id: parseInt(document.getElementById('sale-rep').value),
    date: document.getElementById('sale-date').value,
    amount: parseFloat(document.getElementById('sale-amount').value),
    client_first_name: firstName,
    client_last_name: lastName,
    client_email: '',
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

window.validateRib = async function(id) {
  if (!confirm('Confirmer la réception du RIB ?')) return;
  try {
    await api(`/sales/${id}/validate-rib`, { method: 'POST', body: {} });
    loadSales();
    loadDashboard();
  } catch (e) {
    alert(e.message);
  }
};

window.sendRelance = async function(id, level) {
  const labels = { 1: '1ère relance (R1)', 2: '2ème relance (R2)', 3: 'mise en contentieux (R3)' };
  if (!confirm(`Envoyer la ${labels[level]} par email au client ?`)) return;
  try {
    await api(`/sales/${id}/relance`, { method: 'POST', body: { level } });
    alert(`Relance R${level} envoyée avec succès !`);
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
  const admin = isAdmin();
  const pdfBtn = document.getElementById('btn-recap-pdf');
  if (pdfBtn) pdfBtn.style.display = admin ? '' : 'none';
  const monthPicker = document.getElementById('month-picker');
  if (monthPicker) monthPicker.style.display = admin ? '' : 'none';
  const exportCSV = document.getElementById('export-month-csv');
  if (exportCSV) exportCSV.style.display = admin ? '' : 'none';
  // Hide charts for commercials
  const chartsDiv = document.getElementById('monthly-charts');
  if (chartsDiv) chartsDiv.style.display = admin ? '' : 'none';

  const data = await api(`/months/${currentMonth}/summary`);
  lastMonthlyData = data;

  // ── Classement par ratio mensuel (ranking list) ──
  const activeReps = data.rep_stats.filter(r => r.total_hours > 0);
  const allReps = data.rep_stats;
  const sorted = [...allReps].sort((a, b) => {
    if (a.total_hours === 0 && b.total_hours === 0) return 0;
    if (a.total_hours === 0) return 1;
    if (b.total_hours === 0) return -1;
    return b.ratio_mensuel - a.ratio_mensuel;
  });

  const avatarColors = [
    { bg: '#EAF3DE', color: '#3B6D11' },
    { bg: '#EEEDFE', color: '#3C3489' },
    { bg: '#FAEEDA', color: '#854F0B' },
    { bg: '#FCEBEB', color: '#A32D2D' },
    { bg: '#E0F2FE', color: '#0369A1' },
  ];

  function rlStatus(ratio, hours) {
    if (hours === 0 || ratio === 0) return { cls: 'rl-nd', pill: 'nd', label: 'Pas de données', color: '#888780' };
    if (ratio >= 300) return { cls: 'rl-ok', pill: 'ok', label: 'Objectif atteint', color: '#3B6D11' };
    if (ratio >= 250) return { cls: 'rl-warn', pill: 'warn', label: 'Sous objectif', color: '#BA7517' };
    return { cls: 'rl-ko', pill: 'ko', label: 'En danger', color: '#A32D2D' };
  }

  const maxRatio = sorted.length > 0 ? Math.max(...sorted.map(r => r.ratio_mensuel || 0), 1) : 1;

  const repsDiv = document.getElementById('monthly-reps');
  let rankHTML = `
    <h3>Classement Ratio</h3>
    <div class="ranking-list">
      <div class="ranking-list-legend">
        <span class="rl-dot" style="background:#3B6D11"></span>&ge; 300 €/h
        <span class="rl-dot" style="background:#BA7517"></span>250–299 €/h
        <span class="rl-dot" style="background:#E24B4A"></span>&lt; 250 €/h
      </div>
      ${sorted.map((r, i) => {
        const s = rlStatus(r.ratio_mensuel, r.total_hours);
        const initiales = r.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
        const ac = avatarColors[i % avatarColors.length];
        const pct = r.ratio_mensuel > 0 ? Math.round((r.ratio_mensuel / maxRatio) * 100) : 0;
        return `
        <div class="rl-row ${s.cls}">
          <span class="rl-pos">#${i + 1}</span>
          <div class="rl-avatar" style="background:${ac.bg};color:${ac.color}">${initiales}</div>
          <div class="rl-info">
            <div class="rl-name-row">
              <span class="rl-name">${r.name}</span>
              <span class="rl-pill rl-pill-${s.pill}">${s.label}</span>
            </div>
            <div class="rl-sub">
              ${r.total_hours > 0 ? `${r.ca.toLocaleString('fr-FR')} € · ${r.nb_ventes} vente${r.nb_ventes > 1 ? 's' : ''} · Panier ${Math.round(r.panier_moyen).toLocaleString('fr-FR')} € · ${r.total_hours}h` : '0 € · 0 vente · 0h'}
            </div>
            <div class="rl-bar-wrap">
              <div class="rl-bar-fill" style="width:${pct}%;background:${s.color}"></div>
            </div>
          </div>
          <div class="rl-ratio" style="color:${s.color}">
            ${r.total_hours > 0 ? Math.round(r.ratio_mensuel) + ' €/h' : '—'}
          </div>
        </div>`;
      }).join('')}
    </div>`;

  // ── 6 Badges de performance ──
  if (activeReps.length > 0) {
    // Fetch monthly daily-action counters + discipline data
    let monthlyCounters = [];
    let disciplineData = [];
    try { monthlyCounters = await api(`/daily-actions/monthly/${currentMonth}`); } catch (e) { /* ignore */ }
    try { disciplineData = await api(`/daily-actions/discipline/${currentMonth}`); } catch (e) { /* ignore */ }

    // Build per-rep counter totals
    const counterTotals = {};
    activeReps.forEach(r => { counterTotals[r.sales_rep_id] = { name: r.name, rdv_fixes: 0, references: 0, entretien_premier_mois: 0, contact_entreprise: 0, discipline: 0 }; });
    monthlyCounters.forEach(row => {
      if (!counterTotals[row.sales_rep_id]) return;
      if (row.action_key === 'predefined:rdv_fixes') counterTotals[row.sales_rep_id].rdv_fixes = row.total;
      if (row.action_key === 'predefined:references') counterTotals[row.sales_rep_id].references = row.total;
      if (row.action_key === 'predefined:entretien_premier_mois') counterTotals[row.sales_rep_id].entretien_premier_mois = row.total;
      if (row.action_key === 'predefined:contact_entreprise') counterTotals[row.sales_rep_id].contact_entreprise = row.total;
    });
    disciplineData.forEach(row => {
      if (counterTotals[row.sales_rep_id]) counterTotals[row.sales_rep_id].discipline = row.total_actions;
    });
    const counterList = Object.values(counterTotals);

    const bestPanier = [...activeReps].sort((a, b) => b.panier_moyen - a.panier_moyen)[0];
    const bestRDV = [...counterList].sort((a, b) => b.rdv_fixes - a.rdv_fixes)[0];
    const bestRef = [...counterList].sort((a, b) => b.references - a.references)[0];
    const bestAccueil = [...counterList].sort((a, b) => b.entretien_premier_mois - a.entretien_premier_mois)[0];
    const bestBusiness = [...counterList].sort((a, b) => b.contact_entreprise - a.contact_entreprise)[0];
    const bestDiscipline = [...counterList].sort((a, b) => b.discipline - a.discipline)[0];

    const NA = 'A SAISIR';
    const badges = [
      { icon: '💎', title: 'Premium', desc: 'Meilleur panier moyen', name: bestPanier.panier_moyen > 0 ? bestPanier.name : NA, value: bestPanier.panier_moyen > 0 ? Math.round(bestPanier.panier_moyen).toLocaleString('fr-FR') + ' €' : null },
      { icon: '📞', title: 'RDV', desc: 'Le plus de rendez-vous fixés', name: bestRDV.rdv_fixes > 0 ? bestRDV.name : NA, value: bestRDV.rdv_fixes > 0 ? bestRDV.rdv_fixes : null },
      { icon: '🤝', title: 'Ambassadeur', desc: 'Le plus de références', name: bestRef.references > 0 ? bestRef.name : NA, value: bestRef.references > 0 ? bestRef.references : null },
      { icon: '👋', title: 'Accueil', desc: "Le plus d'appels nouveaux clients", name: bestAccueil.entretien_premier_mois > 0 ? bestAccueil.name : NA, value: bestAccueil.entretien_premier_mois > 0 ? bestAccueil.entretien_premier_mois : null },
      { icon: '💼', title: 'Business', desc: 'Le plus de contacts entreprises', name: bestBusiness.contact_entreprise > 0 ? bestBusiness.name : NA, value: bestBusiness.contact_entreprise > 0 ? bestBusiness.contact_entreprise : null },
      { icon: '🏆', title: 'Discipline', desc: "Le plus d'actions validées", name: bestDiscipline.discipline > 0 ? bestDiscipline.name : NA, value: bestDiscipline.discipline > 0 ? bestDiscipline.discipline : null },
    ];

    rankHTML += '<div class="badges-grid">';
    badges.forEach(b => {
      const attribue = b.name !== NA;
      if (attribue) {
        rankHTML += `
          <div class="badge-card">
            <div class="badge-icon">${b.icon}</div>
            <div class="badge-title">${b.title}</div>
            <div class="badge-desc">${b.desc}</div>
            <div class="badge-name">${b.name} — ${b.value}</div>
          </div>`;
      } else {
        rankHTML += `
          <div class="badge-card badge-unassigned">
            <div class="badge-icon">${b.icon}</div>
            <div class="badge-title">${b.title}</div>
            <div class="badge-desc">${b.desc}</div>
            <div class="badge-name badge-blink">À saisir</div>
          </div>`;
      }
    });
    rankHTML += '</div>';
  }

  repsDiv.innerHTML = rankHTML;

  // Filtres retirés

  // ── Panier moyen global (retiré) ──
  const globalDiv = document.getElementById('monthly-global');
  globalDiv.innerHTML = '';

  // ── Analyse individuelle avec checkboxes ──
  await renderAnalysisSection(data);

  // ── Graphiques évolution hebdomadaire (admin only) ──
  if (isAdmin()) await loadWeeklyCharts();
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
    const allReps = filteredWeeks[0].reps;
    // Only include reps who have worked hours in at least one week
    const reps = allReps.filter(rep => {
      return filteredWeeks.some(w => {
        const r = w.reps.find(rr => rr.sales_rep_id === rep.sales_rep_id);
        return r && r.hours_worked > 0;
      });
    });

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

// ─── Analyse individuelle (règles métier strictes) ──────────
//
// ORDRE DE PRIORITÉ :
// 1. Transformation HS / ventes
// 2. Panier moyen
// 3. Références
// 4. Actions prioritaires
// 5. RDV fixés
// 6. Entretien 1er mois
// 7. Contacts entreprise
//
// + Vente sans RIB = point d'amélioration prioritaire
// Le ratio global ne doit JAMAIS apparaître dans satisfaction / amélioration
// Max 3 satisfaction, max 3 amélioration

function analyzeRep(repStat, analysisData) {
  const c = analysisData.counters || {};
  const nbVentes = repStat.nb_ventes || 0;
  const panier = repStat.panier_moyen || 0;
  const hours = repStat.total_hours || 0;
  const hs = c.histoire_sportive || 0;
  const refs = c.references || 0;
  const rdv = c.rdv_fixes || 0;
  const ent = c.entretien_premier_mois || 0;
  const contact = c.contact_entreprise || 0;
  const salesNoRib = analysisData.sales_no_rib || 0;
  const commercialDays = analysisData.commercial_days || 0;
  const completeDays = analysisData.complete_days || 0;
  const rdvObjectif = analysisData.rdv_objectif_par_jour || 2;

  // Collect all evaluations: { priority, type, text }
  // type: 'ok' | 'ko' | 'neutre'
  const evals = [];

  // ── Priorité 0 (la plus haute) : Vente sans RIB ──
  if (salesNoRib > 0) {
    evals.push({ priority: 0, type: 'ko', text: `${salesNoRib > 1 ? salesNoRib + ' ventes ont été réalisées' : 'Une vente a été réalisée'} sans RIB fourni` });
  }

  // ── Priorité 1 : Transformation HS / ventes ──
  if (hs > 0) {
    const taux = nbVentes / hs;
    if (taux > 0.5) {
      evals.push({ priority: 1, type: 'ok', text: 'Bonne transformation des histoires sportives en ventes' });
    } else if (taux === 0.5) {
      evals.push({ priority: 1, type: 'neutre', text: 'Transformation des histoires sportives dans la moyenne (50%)' });
    } else {
      evals.push({ priority: 1, type: 'ko', text: 'Les histoires sportives ne se transforment pas suffisamment en ventes' });
    }
  }

  // ── Priorité 2 : Panier moyen ──
  if (nbVentes > 0) {
    if (panier > 3000) {
      evals.push({ priority: 2, type: 'ok', text: 'Excellent panier moyen' });
    } else if (panier > 2100) {
      evals.push({ priority: 2, type: 'ok', text: 'Bon panier moyen' });
    } else {
      evals.push({ priority: 2, type: 'ko', text: 'Panier moyen trop faible' });
    }
  }

  // ── Priorité 3 : Références ──
  // inscrits = nb de ventes (chaque vente = un inscrit)
  if (nbVentes > 0) {
    if (refs > nbVentes) {
      evals.push({ priority: 3, type: 'ok', text: 'Bonnes prises de références au-delà des inscriptions' });
    } else if (refs === nbVentes) {
      evals.push({ priority: 3, type: 'neutre', text: 'Références égales aux inscriptions' });
    } else {
      evals.push({ priority: 3, type: 'ko', text: 'Références insuffisantes au regard des inscriptions' });
    }
  }

  // ── Priorité 4 : Actions prioritaires ──
  if (commercialDays > 0) {
    if (completeDays >= commercialDays) {
      evals.push({ priority: 4, type: 'ok', text: 'Bonne régularité sur les actions prioritaires' });
    } else {
      evals.push({ priority: 4, type: 'ko', text: 'Les actions prioritaires ne sont pas tenues avec régularité' });
    }
  }

  // ── Priorité 5 : RDV fixés (proratisés sur jours commerciaux) ──
  if (commercialDays > 0) {
    const rdvObjectifProrate = commercialDays * rdvObjectif;
    if (rdv >= rdvObjectifProrate) {
      evals.push({ priority: 5, type: 'ok', text: 'Bon volume de RDV fixés au regard des jours commerciaux' });
    } else {
      evals.push({ priority: 5, type: 'ko', text: 'Le volume de RDV fixés reste trop faible au regard des jours commerciaux' });
    }
  }

  // ── Priorité 6 : Entretien 1er mois ──
  if (hours > 0) {
    if (ent > 0) {
      evals.push({ priority: 6, type: 'ok', text: 'Bon suivi des nouveaux adhérents (entretien 1er mois)' });
    } else {
      evals.push({ priority: 6, type: 'ko', text: 'Aucun entretien 1er mois réalisé' });
    }
  }

  // ── Priorité 7 : Contacts entreprise ──
  if (hours > 0) {
    if (contact > 3) {
      evals.push({ priority: 7, type: 'ok', text: 'Bonne dynamique de contacts entreprise' });
    } else if (contact >= 1) {
      evals.push({ priority: 7, type: 'neutre', text: 'Contacts entreprise présents mais perfectibles' });
    } else {
      evals.push({ priority: 7, type: 'ko', text: 'Aucun contact entreprise sur le mois' });
    }
  }

  // Sort by priority (lowest number = highest priority)
  evals.sort((a, b) => a.priority - b.priority);

  // Select top 3 satisfaction, top 3 amélioration
  const satisfaction = evals.filter(e => e.type === 'ok').slice(0, 3);
  const amelioration = evals.filter(e => e.type === 'ko').slice(0, 3);

  // Neutres: shown only if we have fewer than 1 satisfaction AND fewer than 1 amelioration
  let neutres = [];
  if (satisfaction.length === 0 && amelioration.length === 0) {
    neutres = evals.filter(e => e.type === 'neutre').slice(0, 3);
  }

  return { name: repStat.name, satisfaction, amelioration, neutres };
}

async function renderAnalysisSection(data) {
  const div = document.getElementById('monthly-analysis');

  // Fetch analysis data from server
  let analysisDataArr = [];
  try {
    const result = await api(`/months/${currentMonth}/analysis-data`);
    analysisDataArr = result.reps || [];
  } catch (e) { /* ignore */ }

  // Build lookup by sales_rep_id
  const analysisById = {};
  analysisDataArr.forEach(d => { analysisById[d.sales_rep_id] = d; });

  // Analyze each rep
  const analyses = data.rep_stats
    .filter(r => r.total_hours > 0)
    .map(r => {
      const ad = analysisById[r.sales_rep_id] || { counters: {}, sales_no_rib: 0, commercial_days: 0, complete_days: 0, rdv_objectif_par_jour: 2 };
      return analyzeRep(r, ad);
    });

  // Filter: commercial sees only their own analysis card
  const admin = isAdmin();
  const myName = getMyName();
  let visibleAnalyses = analyses;
  if (!admin && myName) {
    visibleAnalyses = analyses.filter(a => a.name === myName);
  }

  const title = admin ? 'Analyse Individuelle' : 'Mon Analyse';
  const gridClass = (!admin && visibleAnalyses.length === 1) ? 'analysis-grid analysis-grid-solo' : 'analysis-grid';
  let html = `<div class="analysis-section"><h3>${title}</h3><div class="${gridClass}">`;

  visibleAnalyses.forEach((a, idx) => {
    // Bloc 1 — Points de satisfaction
    let satHTML = '';
    if (a.satisfaction.length > 0) {
      satHTML = `<div class="analysis-blk analysis-blk-ok">
        <div class="analysis-blk-label">Points de satisfaction</div>
        ${a.satisfaction.map(p => `<div>• ${p.text}</div>`).join('')}
      </div>`;
    }

    // Bloc 2 — Points d'amélioration
    let amHTML = '';
    if (a.amelioration.length > 0) {
      amHTML = `<div class="analysis-blk analysis-blk-ko">
        <div class="analysis-blk-label">Points d'amélioration</div>
        ${a.amelioration.map(p => `<div>• ${p.text}</div>`).join('')}
      </div>`;
    }

    // Bloc 3 — Points neutres (seulement si aucun ok/ko)
    let neutreHTML = '';
    if (a.neutres.length > 0) {
      neutreHTML = `<div class="analysis-blk analysis-blk-lever">
        <div class="analysis-blk-label">Points neutres</div>
        ${a.neutres.map(p => `<div>• ${p.text}</div>`).join('')}
      </div>`;
    }

    const noData = !satHTML && !amHTML && !neutreHTML;

    html += `<div class="analysis-card" data-rep="${idx}">
      <div class="analysis-card-header">
        <span>${a.name}</span>
      </div>
      <div class="analysis-card-body">
        ${satHTML}
        ${amHTML}
        ${neutreHTML}
        ${noData ? '<div style="color:var(--text-muted);font-size:12px;padding:8px 0;">Pas assez de données pour générer une analyse pertinente</div>' : ''}
      </div>
    </div>`;
  });
  html += '</div></div>';
  div.innerHTML = html;
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
          const name = card.querySelector('.analysis-card-header').textContent.trim();
          const okBlk = card.querySelector('.analysis-blk-ok');
          const koBlk = card.querySelector('.analysis-blk-ko');
          const leverBlk = card.querySelector('.analysis-blk-lever');
          const points = okBlk ? Array.from(okBlk.querySelectorAll('div:not(.analysis-blk-label)')).map(d => d.textContent.replace(/^• /, '')) : [];
          const travail = koBlk ? Array.from(koBlk.querySelectorAll('div:not(.analysis-blk-label)')).map(d => d.textContent.replace(/^• /, '')) : [];
          const neutres = leverBlk ? Array.from(leverBlk.querySelectorAll('div:not(.analysis-blk-label)')).map(d => d.textContent.replace(/^• /, '')) : [];
          if (points.length === 0 && travail.length === 0 && neutres.length === 0) return '';
          return `<div class="pdf-analysis an-${i + 1}">
            <div class="an-name">${name}</div>
            ${points.length ? `<div class="an-section">
              <div class="an-label good">Satisfaction</div>
              ${points.map(p => `<div class="an-item good">${p}</div>`).join('')}
            </div>` : ''}
            ${travail.length ? `<div class="an-section">
              <div class="an-label work">Amélioration</div>
              ${travail.map(t => `<div class="an-item work">${t}</div>`).join('')}
            </div>` : ''}
            ${neutres.length ? `<div class="an-section">
              <div class="an-label" style="color:#3C3489">Neutre</div>
              ${neutres.map(n => `<div class="an-item" style="color:#3C3489">${n}</div>`).join('')}
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

// ─── Daily Actions ("Aujourd'hui") ──────────────────────────

function getTodayDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

async function initTodaySection(repId, section) {
  const addBtn = section.querySelector('.today-add-btn');
  const addForm = section.querySelector(`#today-add-form-${repId}`);

  addBtn.addEventListener('click', () => {
    addForm.classList.toggle('hidden');
    if (!addForm.classList.contains('hidden')) {
      addForm.querySelector('.today-add-name').focus();
    }
  });

  addForm.querySelector('.today-add-cancel').addEventListener('click', () => {
    addForm.classList.add('hidden');
    addForm.querySelector('.today-add-name').value = '';
  });

  addForm.querySelector('.today-add-confirm').addEventListener('click', async () => {
    const name = addForm.querySelector('.today-add-name').value.trim();
    const type = addForm.querySelector('.today-add-type').value;
    if (!name) return;

    await api(`/daily-actions/types/${repId}`, { method: 'POST', body: { name, type } });
    addForm.querySelector('.today-add-name').value = '';
    addForm.classList.add('hidden');
    await renderTodayActions(repId);
  });

  await renderTodayActions(repId);
}

async function renderTodayActions(repId) {
  const container = document.getElementById(`today-actions-${repId}`);
  if (!container) return;

  const today = getTodayDate();
  const [types, valuesArr] = await Promise.all([
    api(`/daily-actions/types/${repId}`),
    api(`/daily-actions/values/${repId}/${today}`)
  ]);

  // Build values map
  const valMap = {};
  for (const v of valuesArr) valMap[v.action_key] = v.value;

  let html = '';

  // Built-in: Histoires sportives
  const hsValue = valMap['builtin:histoires_sportives'] || 0;
  html += `
    <div class="today-action-row builtin">
      <span class="today-action-name">Histoires sportives</span>
      <input type="number" class="today-counter" min="0" value="${hsValue}"
             data-rep-id="${repId}" data-key="builtin:histoires_sportives">
    </div>
  `;

  // Custom counter actions
  const counterTypes = types.filter(t => t.type === 'counter');
  const yesnoTypes = types.filter(t => t.type === 'yesno');

  if (counterTypes.length > 0) {
    html += '<div class="today-group-label">Actions compteur</div>';
    for (const t of counterTypes) {
      const val = valMap[`custom:${t.id}`] || 0;
      html += `
        <div class="today-action-row">
          <span class="today-action-name">${t.name}</span>
          <input type="number" class="today-counter" min="0" value="${val}"
                 data-rep-id="${repId}" data-key="custom:${t.id}">
          <button class="today-delete-btn" data-type-id="${t.id}" title="Supprimer">✕</button>
        </div>
      `;
    }
  }

  if (yesnoTypes.length > 0) {
    html += '<div class="today-group-label">Actions Oui / Non</div>';
    for (const t of yesnoTypes) {
      const val = valMap[`custom:${t.id}`] || 0;
      html += `
        <div class="today-action-row">
          <span class="today-action-name">${t.name}</span>
          <label class="today-toggle">
            <input type="checkbox" ${val ? 'checked' : ''}
                   data-rep-id="${repId}" data-key="custom:${t.id}">
            <span class="today-toggle-slider"></span>
          </label>
          <button class="today-delete-btn" data-type-id="${t.id}" title="Supprimer">✕</button>
        </div>
      `;
    }
  }

  container.innerHTML = html;

  // Bind counter change events
  container.querySelectorAll('.today-counter').forEach(input => {
    input.addEventListener('change', async () => {
      await api(`/daily-actions/values/${input.dataset.repId}/${today}`, {
        method: 'PUT',
        body: { action_key: input.dataset.key, value: parseFloat(input.value) || 0 }
      });
    });
  });

  // Bind toggle change events
  container.querySelectorAll('.today-toggle input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', async () => {
      await api(`/daily-actions/values/${cb.dataset.repId}/${today}`, {
        method: 'PUT',
        body: { action_key: cb.dataset.key, value: cb.checked ? 1 : 0 }
      });
    });
  });

  // Bind delete buttons
  container.querySelectorAll('.today-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer cette action ?')) return;
      await api(`/daily-actions/types/${btn.dataset.typeId}`, { method: 'DELETE' });
      await renderTodayActions(repId);
    });
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

// ─── Admin: Gestion Commerciaux ─────────────────────────────

function initAdminPanel() {
  const form = document.getElementById('add-rep-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('new-rep-name');
    const roleSelect = document.getElementById('new-rep-role');
    const startWeekInput = document.getElementById('new-rep-start-week');
    const name = nameInput.value.trim();
    if (!name) return;

    const body = { name };
    if (roleSelect) body.role = roleSelect.value;
    if (startWeekInput && startWeekInput.value) {
      body.start_week = startWeekInput.value;
    }

    try {
      const newRep = await api('/sales-reps', { method: 'POST', body });
      nameInput.value = '';
      if (roleSelect) roleSelect.value = 'commercial';
      if (startWeekInput) startWeekInput.value = '';
      // Refresh salesReps and all dropdowns
      await refreshSalesReps();
      renderAdminRepList();
      loadDashboard();
    } catch (err) {
      alert(err.message || 'Erreur lors de l\'ajout');
    }
  });

  renderAdminRepList();
}

async function refreshSalesReps() {
  salesReps = await api('/sales-reps');

  // Refresh modal sale-rep dropdown
  const repSelect = document.getElementById('sale-rep');
  if (repSelect) {
    repSelect.innerHTML = '';
    for (const rep of salesReps) {
      const opt = document.createElement('option');
      opt.value = rep.id;
      opt.textContent = rep.name;
      repSelect.appendChild(opt);
    }
  }

  // Refresh ventes filter dropdown
  const filterSelect = document.getElementById('v-filter-rep');
  if (filterSelect) {
    const currentVal = filterSelect.value;
    filterSelect.innerHTML = '<option value="">Tous les commerciaux</option>';
    for (const rep of salesReps) {
      const opt = document.createElement('option');
      opt.value = rep.id;
      opt.textContent = rep.name;
      filterSelect.appendChild(opt);
    }
    filterSelect.value = currentVal;
  }
}

function renderAdminRepList() {
  const listDiv = document.getElementById('admin-rep-list');
  if (!listDiv) return;

  if (salesReps.length === 0) {
    listDiv.innerHTML = '<p style="color:var(--text-light)">Aucun commercial</p>';
    return;
  }

  listDiv.innerHTML = salesReps.map(rep => {
    const startLabel = rep.start_week
      ? `Depuis le ${new Date(rep.start_week + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`
      : 'Depuis toujours';
    const roleBadge = rep.role === 'phoneur'
      ? '<span class="admin-rep-role phoneur">Phoneur</span>'
      : '<span class="admin-rep-role commercial">Commercial</span>';
    return `<div class="admin-rep-row">
      <span class="admin-rep-name">${rep.name}</span>
      ${roleBadge}
      <span class="admin-rep-start">${startLabel}</span>
      <span class="admin-rep-pin">PIN : <strong>${rep.pin || '—'}</strong></span>
      <button class="btn-delete-rep" onclick="deleteRep(${rep.id}, '${rep.name}')" title="Supprimer">✕</button>
    </div>`;
  }).join('');
}

async function deleteRep(id, name) {
  if (!confirm(`Archiver "${name}" ?\n\nCette personne n'apparaîtra plus dans les listes actives mais son historique sera conservé.`)) return;

  try {
    await api(`/sales-reps/${id}`, { method: 'DELETE' });
    await refreshSalesReps();
    renderAdminRepList();
    loadDashboard();
    alert(`"${name}" a été archivé avec succès.`);
  } catch (err) {
    alert(err.message || 'Erreur lors de l\'archivage');
  }
}
