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

// ─── Toast Notification System ─────────────────────────────
function showToast(message, type = 'success', duration = 2500) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || '✓'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-out');
    toast.addEventListener('animationend', () => toast.remove());
  }, duration);
}

// ─── Actions prédéfinies Aujourd'hui ────────────────────────
const PREDEFINED_YESNO = [
  { key: 'check_studio', label: "🏢 J'ai fait un check du studio" },
  { key: 'appel_annules_noshow', label: "📞 J'ai appelé les RDV annulés et no show du jour" },
  { key: 'mails_sms', label: "📧 J'ai traité 100% des mails, SMS et appel en absence du jour" },
  { key: 'rappel_rdv', label: "🔔 J'ai rappelé les RDV programmés pour demain" },
  { key: 'story', label: "📱 J'ai publié une story" },
];
const PREDEFINED_COUNTERS = [
  { key: 'references', label: '🤝 Prise de ref' },
  { key: 'entretien_premier_mois', label: '👋 Entretien 1er mois' },
  { key: 'rdv_fixes', label: '📅 RDV fixés' },
  { key: 'contact_entreprise', label: '🏢 Contact entreprise' },
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
  if (pct >= 80) return { name: 'Or', icon: '🏆', next: 'Diamant', progress: (pct - 80) / 20 * 100 };
  if (pct >= 60) return { name: 'Argent', icon: '🥈', next: 'Or', progress: (pct - 60) / 20 * 100 };
  if (pct >= 40) return { name: 'Bronze', icon: '🥉', next: 'Argent', progress: (pct - 40) / 20 * 100 };
  return { name: null, icon: '🎯', next: 'Bronze', progress: pct / 40 * 100 };
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
  const avatarDiv = document.getElementById('user-avatar');
  const roleBadge = document.getElementById('user-role-badge');
  if (currentUser) {
    const displayName = currentUser.role === 'admin' ? 'Stan' : currentUser.name;
    nameSpan.textContent = displayName;
    // Avatar initials
    if (avatarDiv) {
      const initials = displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      avatarDiv.textContent = initials;
    }
    // Role badge
    if (roleBadge) {
      const roleLabel = currentUser.role === 'admin' ? 'Admin' : currentUser.role === 'phoneur' ? 'Phoneur' : 'Commercial';
      roleBadge.textContent = roleLabel;
      roleBadge.className = 'user-role-badge' + (currentUser.role === 'admin' ? ' admin' : '');
    }
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
        const card = document.querySelector('.login-card');
        card.classList.add('login-error');
        card.addEventListener('animationend', () => card.classList.remove('login-error'), { once: true });
        pinInput.value = '';
        pinInput.focus();
        return;
      }

      // Success — brief visual confirmation before transition
      authToken = data.token;
      currentUser = { role: data.role, name: data.name, sales_rep_id: data.sales_rep_id };
      localStorage.setItem('authToken', authToken);
      localStorage.setItem('currentUser', JSON.stringify(currentUser));

      // Redirection auto vers l'app coaching si rôle coach/director/academy
      const coachRoles = ['coach', 'coach-leader', 'director', 'academy'];
      if (coachRoles.includes(data.role)) {
        // Transfert du token vers le storage coach et redirection
        localStorage.setItem('authToken_coach', data.token);
        localStorage.setItem('currentUser_coach', JSON.stringify({
          role: data.role, name: data.name, coach_id: data.coach_id || null, is_leader: data.is_leader || false
        }));
        window.location.href = '/coach/';
        return;
      }

      const loginCard = document.querySelector('.login-card');
      const loginBtn = loginCard.querySelector('.btn-primary');
      loginCard.classList.add('login-success');
      loginBtn.textContent = `Bienvenue ${data.name || ''}`;

      pinInput.value = '';
      await new Promise(r => setTimeout(r, 600));
      hideLogin();
      loginCard.classList.remove('login-success');
      loginBtn.textContent = 'Se connecter';
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
  currentWeekStart = getMonday(new Date().toISOString().slice(0, 10));

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
  const securityPanel = document.getElementById('admin-security-panel');
  if (securityPanel) securityPanel.classList.toggle('hidden', !isAdmin());
  // Bouton accès Coaching (admin uniquement)
  const coachBtn = document.getElementById('btn-goto-coach');
  if (coachBtn) coachBtn.classList.toggle('hidden', !isAdmin());
  // Barre de navigation du bas (mobile)
  renderBottomNav();
  // Show/hide tabs based on role
  updateTabVisibility();
  applyVentesRoleVisibility();

  // Show header widgets for commercials
  initHeaderWidgets();

  if (isPhoneLead()) {
    loadPhoningTab();
  } else {
    // Default landing tab = Tâches (Kanban)
    loadTasksBoard();
    // Preload others in background for instant tab switch
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
  const tasksBtn = document.querySelector('[data-tab="tasks"]');
  const persoBtn = document.querySelector('[data-tab="perso"]');
  const pilotageFunnelBtn = document.querySelector('[data-tab="pilotage-funnel"]');

  if (isPhoneLead()) {
    if (todayBtn) todayBtn.style.display = 'none';
    if (ventesBtn) ventesBtn.style.display = 'none';
    if (dashBtn) dashBtn.style.display = 'none';
    if (phoningBtn) phoningBtn.style.display = '';
    if (phoningRecapBtn) phoningRecapBtn.style.display = '';
    if (mensuelBtn) mensuelBtn.style.display = 'none';
    if (tasksBtn) tasksBtn.style.display = 'none';
    if (persoBtn) persoBtn.style.display = 'none';
    if (pilotageFunnelBtn) pilotageFunnelBtn.style.display = 'none';
    phoningBtn.click();
  } else if (isAdmin()) {
    if (todayBtn) todayBtn.style.display = 'none';
    if (ventesBtn) ventesBtn.style.display = '';
    if (dashBtn) dashBtn.style.display = '';
    if (phoningBtn) phoningBtn.style.display = 'none';
    if (phoningRecapBtn) phoningRecapBtn.style.display = 'none';
    if (mensuelBtn) mensuelBtn.style.display = '';
    if (tasksBtn) tasksBtn.style.display = '';
    if (persoBtn) persoBtn.style.display = '';
    if (pilotageFunnelBtn) pilotageFunnelBtn.style.display = '';
    // Default landing tab on login = Tâches
    if (tasksBtn) tasksBtn.click(); else dashBtn.click();
  } else {
    // Commercial: Aujourd'hui + Ventes + Récap + Tâches
    if (todayBtn) todayBtn.style.display = '';
    if (ventesBtn) ventesBtn.style.display = '';
    if (dashBtn) dashBtn.style.display = 'none';
    if (phoningBtn) phoningBtn.style.display = 'none';
    if (phoningRecapBtn) phoningRecapBtn.style.display = 'none';
    if (mensuelBtn) mensuelBtn.style.display = '';
    if (tasksBtn) tasksBtn.style.display = '';
    if (persoBtn) persoBtn.style.display = 'none';
    if (pilotageFunnelBtn) pilotageFunnelBtn.style.display = 'none';
    // Default landing tab on login = Tâches
    if (tasksBtn) tasksBtn.click(); else todayBtn.click();
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
      <div class="td-club-header">
        <span>${club.label}</span>
      </div>

      <div class="td-block">
        <h3 class="td-block-title">Priorit\u00e9s</h3>
        <div class="td-inline-widgets">
          <div class="td-inline-widget td-widget-histoire">
            <span class="td-inline-label">Histoire sportive</span>
            <div class="td-histoire-controls">
              <button class="td-histoire-btn" data-dir="minus" data-prefix="${p}">\u2212</button>
              <input type="number" class="td-histoire-val" data-prefix="${p}" value="${savedHS}" min="0">
              <button class="td-histoire-btn" data-dir="plus" data-prefix="${p}">+</button>
            </div>
          </div>
          <div class="td-inline-widget td-widget-energie">
            <span class="td-inline-label">\u00c9nergie</span>
            <div class="td-energy-nums">
              ${[{n:1,e:'😵',l:'Vid\u00e9'},{n:2,e:'😴',l:'Fatigu\u00e9'},{n:3,e:'😐',l:'Normal'},{n:4,e:'💪',l:'En forme'},{n:5,e:'🔥',l:'Au top'}].map(({n,e,l}) => `<button class="td-energy-btn ${savedEnergy === n ? 'active' : ''}" data-energy="${n}" data-prefix="${p}" title="${l}">${e}</button>`).join('')}
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
        <h3 class="td-block-title">Compteurs</h3>
        <div class="td-counters-grid">
          ${PREDEFINED_COUNTERS.map(a => {
            const val = valMap[`${p}${a.key}`] || 0;
            return `<div class="td-counter-card ${val > 0 ? 'td-counter-active' : ''}">
              <div class="td-counter-label">${a.label}</div>
              <div class="td-counter-controls">
                <button class="td-counter-btn" data-key="${p}${a.key}" data-dir="minus">\u2212</button>
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

    // Greeting
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';
    const dayStr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

    // Compute overall progress across all clubs
    let totalDone = 0, totalItems = 0;
    CLUB_PREFIXES.forEach(club => {
      const p = club.prefix;
      PREDEFINED_YESNO.forEach(a => { totalItems++; if (valMap[`${p}${a.key}`]) totalDone++; });
      PREDEFINED_COUNTERS.forEach(a => { totalItems++; if (valMap[`${p}${a.key}`] > 0) totalDone++; });
    });
    const globalPct = totalItems > 0 ? Math.round((totalDone / totalItems) * 100) : 0;
    const progressClass = globalPct >= 80 ? 'green' : globalPct >= 40 ? 'orange' : '';

    let html = `<div class="td-page">
      <div class="td-greeting">
        <div class="td-greeting-left">
          <h1>👋 ${greet}, ${getMyName()} !</h1>
          <p>${dayStr.charAt(0).toUpperCase() + dayStr.slice(1)}</p>
        </div>
        <div class="td-greeting-badge">${globalPct === 100 ? '✨ Journ\u00e9e compl\u00e8te' : `${globalPct}%`}</div>
      </div>
      <div class="td-clubs-grid">`;
    CLUB_PREFIXES.forEach(club => { html += renderClubBlock(club, valMap); });
    html += `</div></div>`;

    container.innerHTML = html;

    // Bind events for each club block
    CLUB_PREFIXES.forEach(club => {
      const block = container.querySelector(`[data-club="${club.id}"]`);
      if (block) bindClubEvents(block, repId, club.prefix);
    });

    // Update per-club progress bars
    updateAllClubProgress(container);
  } catch (err) {
    console.error('Erreur chargement Aujourd\'hui:', err);
  }
}

function updateAllClubProgress(container) {
  if (!container) container = document.getElementById('today-standalone');
  if (!container) return;

  let allDone = true;
  CLUB_PREFIXES.forEach(club => {
    const block = container.querySelector(`[data-club="${club.id}"]`);
    if (!block) return;

    const checks = block.querySelectorAll('.td-yesno');
    const counters = block.querySelectorAll('.td-counter-val');
    if (checks.length === 0 && counters.length === 0) return;

    let done = 0, total = checks.length + counters.length;
    checks.forEach(cb => { if (cb.checked) done++; });
    counters.forEach(inp => { if (parseInt(inp.value) > 0) done++; });

    const pct = Math.round((done / total) * 100);
    const fill = container.querySelector(`[data-club-fill="${club.id}"]`);
    const label = container.querySelector(`[data-club-pct="${club.id}"]`);
    if (!fill || !label) return;

    fill.style.width = pct + '%';
    label.textContent = `${done}/${total} · ${pct}%`;

    const level = pct === 100 ? 'full' : pct >= 60 ? 'good' : pct >= 30 ? 'mid' : 'low';
    fill.className = `td-club-progress-fill progress-${level}`;
    label.className = `td-club-progress-pct progress-${level}`;

    if (pct < 100) allDone = false;
  });

  if (allDone && !container.dataset.celebrated) {
    container.dataset.celebrated = '1';
    showToast('Journée complète — bravo !', 'success', 3000);
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
  // Énergie numeric buttons (1-5)
  block.querySelectorAll('.td-energy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      block.querySelectorAll('.td-energy-btn').forEach(b => b.classList.remove('active'));
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
      updateAllClubProgress();
      if (cb.checked) showToast('Action validée', 'success', 1500);
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
      // Number bump animation
      input.classList.remove('number-bump');
      void input.offsetWidth;
      input.classList.add('number-bump');
      await api(`/daily-actions/values/${repId}/${todaySelectedDate}`, {
        method: 'PUT', body: { action_key: key, value: val }
      });
      updateTodayStyles(block);
      updateAllClubProgress();
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
      list.innerHTML = `<div class="empty-state">
        <span class="empty-state-icon">&mdash;</span>
        <span class="empty-state-title">Aucune remarque</span>
        <span class="empty-state-desc">Les remarques ajoutées par l'admin apparaîtront ici.</span>
      </div>`;
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
    list.innerHTML = `<div class="empty-state">
      <span class="empty-state-icon">&mdash;</span>
      <span class="empty-state-title">Erreur de chargement</span>
      <span class="empty-state-desc">Impossible de récupérer les remarques. Réessayez plus tard.</span>
    </div>`;
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
        <h2 class="ph-title">Fiche Phoning — ${new Date(today).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
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
        <h2 class="ph-title">R\u00e9cap — ${monthLabel}</h2>
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
    { icon: '', label: 'Total appels', value: totalAppels },
    { icon: '📅', label: 'RDV fixés', value: totalRDV },
    { icon: '', label: 'Taux appels → RDV', value: `${taux}%` },
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

const ENERGY_EMOJIS = { 5: '5', 4: '4', 3: '3', 2: '2', 1: '1' };
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
      container.innerHTML = `<div class="empty-state">
        <span class="empty-state-icon">&mdash;</span>
        <span class="empty-state-title">Aucun commercial cette semaine</span>
        <span class="empty-state-desc">Le suivi énergie apparaîtra ici quand des commerciaux seront actifs.</span>
      </div>`;
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
      return `<td class="nrj-cell nrj-avg ${cls}">${avg.toFixed(1)}/5</td>`;
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
      container.innerHTML = `<div class="empty-state">
        <span class="empty-state-icon">&mdash;</span>
        <span class="empty-state-title">Aucun phoneur enregistré</span>
        <span class="empty-state-desc">Les statistiques de phoning apparaîtront ici une fois les phoneurs configurés.</span>
      </div>`;
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
        { icon: '', label: 'Total appels', value: totalAppels },
        { icon: '📅', label: 'RDV fixés', value: totalRDV },
        { icon: '', label: 'Taux → RDV', value: `${taux}%` },
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
    container.innerHTML = `<div class="empty-state">
      <span class="empty-state-icon">&mdash;</span>
      <span class="empty-state-title">Sélectionnez un commercial</span>
      <span class="empty-state-desc">Choisissez un commercial dans la liste ci-dessus pour consulter son contrôle hebdomadaire.</span>
    </div>`;
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
      html += `<div class="empty-state">
        <span class="empty-state-icon">&mdash;</span>
        <span class="empty-state-title">Aucune vente cette semaine</span>
        <span class="empty-state-desc">Les ventes saisies par ce commercial apparaîtront ici.</span>
      </div>`;
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
                <th>Remarque</th>
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
                  <td><input type="text" class="ctrl-edit-input" value="${(s.remark || '').replace(/"/g, '&quot;')}" data-field="remark" placeholder="Remarque"></td>
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

    // ── Bloc 5 : Remarques Actions de la semaine ──
    html += await renderControlRemarks(repId, ctrlWeekStart);

    // ── Bloc 6 : Points de satisfaction / amélioration ──
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
    showToast('Heures enregistrées', 'success', 2000);
  } catch (err) {
    showToast('Erreur : impossible de modifier les heures', 'error');
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
    rib_status: getValue('rib_status'),
    remark: getValue('remark')
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
    showToast('Vente mise à jour', 'success', 1800);
  } catch (err) {
    showToast('Erreur : impossible de modifier la vente', 'error');
  }
}

async function renderControlBadges(repId, repName, month) {
  // Fetch monthly summary to compute badges
  try {
    const summaryData = await api(`/months/${month}/summary`);
    const activeReps = summaryData.rep_stats.filter(r => r.total_hours > 0);
    if (activeReps.length === 0) return `<div class="ctrl-badges-section"><h3>Badges du mois</h3><div class="empty-state-inline"><span class="empty-state-icon">&mdash;</span><span>Aucun badge attribué ce mois — les données sont insuffisantes.</span></div></div>`;

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
      { color: 'gold', title: 'Premium', winner: bestPanier.panier_moyen > 0 ? bestPanier.name : null },
      { color: 'blue', title: 'RDV', winner: bestRDV.rdv_fixes > 0 ? bestRDV.name : null },
      { color: 'green', title: 'Ambassadeur', winner: bestRef.references > 0 ? bestRef.name : null },
    ];

    // Filter: only show badges won by this rep
    const wonBadges = badges.filter(b => b.winner === repName);

    if (wonBadges.length === 0) {
      return `<div class="ctrl-badges-section"><h3>Badges du mois</h3><div class="empty-state-inline"><span class="empty-state-icon">&mdash;</span><span>Aucun badge obtenu ce mois — encore tout à jouer !</span></div></div>`;
    }

    let badgeHTML = '<div class="ctrl-badges-section"><h3>Badges du mois</h3><div class="ctrl-badges-row">';
    wonBadges.forEach(b => {
      badgeHTML += `<div class="ctrl-badge"><span class="mc-dot mc-dot-${b.color}"></span><span class="ctrl-badge-title">${b.title}</span></div>`;
    });
    badgeHTML += '</div></div>';
    return badgeHTML;
  } catch (e) {
    return '';
  }
}

async function renderControlRemarks(repId, weekStart) {
  try {
    const remarks = await api(`/action-remarks/${weekStart}`);
    const startD = new Date(weekStart + 'T00:00:00');
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startD);
      d.setDate(d.getDate() + i);
      days.push(d.toISOString().slice(0, 10));
    }

    const dayRemarks = days.map(day => ({
      date: day,
      label: new Date(day + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' }),
      remark: remarks[`${repId}:${day}`] || ''
    })).filter(d => d.remark);

    if (dayRemarks.length === 0) return '';

    let html = `
      <div class="ctrl-remarks-section">
        <h3>Remarques Actions</h3>
        <div class="ctrl-remarks-list">
          ${dayRemarks.map(d => `
            <div class="ctrl-remark-item">
              <span class="ctrl-remark-day">${d.label}</span>
              <span class="ctrl-remark-text">${d.remark.replace(/</g, '&lt;')}</span>
            </div>
          `).join('')}
        </div>
      </div>`;
    return html;
  } catch (e) {
    return '';
  }
}

async function renderControlEnergy(repId, weekStart) {
  try {
    const data = await api(`/admin/energy/${weekStart}`);
    const rep = data.reps.find(r => r.sales_rep_id == repId);
    if (!rep) return `<div class="ctrl-energy-section"><h3>Suivi Énergie</h3><div class="empty-state-inline"><span class="empty-state-icon">&mdash;</span><span>Aucune donnée d'énergie pour cette semaine.</span></div></div>`;

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
            <span class="ctrl-nrj-emoji">${rep.avg !== null ? rep.avg.toFixed(1) + '/5' : '\u2014'}</span>
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
      return `<div class="ctrl-analysis-section"><h3>Analyse</h3><div class="empty-state-inline"><span class="empty-state-icon">&mdash;</span><span>Pas assez de données ce mois pour générer une analyse. Les heures doivent être renseignées.</span></div></div>`;
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
        html += '<div class="empty-state-inline"><span class="empty-state-icon">&mdash;</span><span>Pas assez de données pour une analyse pertinente.</span></div>';
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
    const [data, remarks] = await Promise.all([
      api(`/admin/actions/${actionsWeekStart}`),
      (currentUser && currentUser.role === 'admin') ? api(`/action-remarks/${actionsWeekStart}`) : {}
    ]);

    if (!data.reps || data.reps.length === 0) {
      container.innerHTML = `<div class="empty-state">
        <span class="empty-state-icon">&mdash;</span>
        <span class="empty-state-title">Aucun commercial actif</span>
        <span class="empty-state-desc">Les actions quotidiennes des commerciaux apparaîtront ici.</span>
      </div>`;
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
                        <span class="act-check-icon"><span class="mc-dot ${c.done ? 'mc-dot-green' : 'mc-dot-red'}"></span></span>
                        <span>${c.label}</span>
                        ${c.both ? '<span class="act-club-badge">\u00d72</span>' : ''}
                      </div>`;
                  }
                  return `
                    <div class="act-check-row ${c.done ? 'act-done' : 'act-missing'}">
                      <span class="act-check-icon"><span class="mc-dot ${c.done ? 'mc-dot-green' : 'mc-dot-red'}"></span></span>
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
              ${(currentUser && currentUser.role === 'admin') ? `
              <div class="act-day-remark">
                <textarea class="act-remark-input" placeholder="Remarque..."
                  data-rep="${rep.sales_rep_id}" data-day="${day}"
                  onblur="saveActionDayRemark(this)">${(remarks[`${rep.sales_rep_id}:${day}`] || '').replace(/</g, '&lt;')}</textarea>
              </div>` : (remarks[`${rep.sales_rep_id}:${day}`] ? `<div class="act-day-remark"><p class="act-remark-text">${remarks[`${rep.sales_rep_id}:${day}`].replace(/</g, '&lt;')}</p></div>` : '')}
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

// ─── Admin: save action day remark ───────────────────────────
async function saveActionDayRemark(el) {
  const repId = el.dataset.rep;
  const day = el.dataset.day;
  const remark = el.value.trim();
  try {
    await api(`/action-remarks/${repId}/${day}`, { method: 'PUT', body: { remark } });
    el.style.borderColor = '#22c55e';
    el.classList.add('pulse-save');
    setTimeout(() => { el.style.borderColor = ''; el.classList.remove('pulse-save'); }, 1000);
  } catch (e) {
    console.error('Erreur sauvegarde remarque:', e);
    el.style.borderColor = '#ef4444';
    showToast('Erreur sauvegarde remarque', 'error');
  }
}

// ─── Admin: toggle yesno action (instant DOM update) ─────────
async function toggleActionCheck(el) {
  const repId = el.dataset.rep;
  const day = el.dataset.day;
  const key = el.dataset.key;
  const v1 = parseInt(el.dataset.v1) || 0;
  const newVal = v1 > 0 ? 0 : 1;

  // Instant DOM toggle
  const icon = el.querySelector('.act-check-icon');
  if (newVal > 0) {
    el.classList.remove('act-missing');
    el.classList.add('act-done');
    if (icon) icon.innerHTML = '<span class="mc-dot mc-dot-green"></span>';
  } else {
    el.classList.remove('act-done');
    el.classList.add('act-missing');
    if (icon) icon.innerHTML = '<span class="mc-dot mc-dot-red"></span>';
  }
  el.dataset.v1 = newVal;

  // Update comparison table cell instantly
  _updateCompCell(repId, key, 'yesno', newVal - v1);

  // Save in background
  api(`/daily-actions/values/${repId}/${day}`, {
    method: 'PUT',
    body: { action_key: `predefined:${key}`, value: newVal }
  }).catch(err => console.error('Erreur toggle action:', err));
}

// ─── Admin: update counter action (instant) ──────────────────
async function updateActionCounter(el) {
  const repId = el.dataset.rep;
  const day = el.dataset.day;
  const key = el.dataset.key;
  const newVal = parseInt(el.value) || 0;
  const oldV1 = parseInt(el.dataset.v1) || 0;

  // Update comparison table cell instantly
  _updateCompCell(repId, key, 'counter', newVal - oldV1);
  el.dataset.v1 = newVal;

  // Save in background
  api(`/daily-actions/values/${repId}/${day}`, {
    method: 'PUT',
    body: { action_key: `predefined:${key}`, value: newVal }
  }).catch(err => console.error('Erreur update counter:', err));
}

// ─── Helper: update comparison table cell without re-render ──
function _updateCompCell(repId, key, type, delta) {
  const table = document.querySelector('.act-comp-table');
  if (!table || delta === 0) return;
  const input = table.querySelector(`input[data-rep="${repId}"][data-key="${key}"]`);
  if (input) {
    const cur = parseInt(input.value) || 0;
    input.value = Math.max(0, cur + delta);
  }
}

// ─── Admin: update hours from comparison table ───────────────
async function updateCompHours(el, repId, targetPerHour) {
  const hours = parseFloat(el.value) || 0;
  api(`/weeks/${actionsWeekStart}/settings/${repId}`, {
    method: 'PUT',
    body: { hours_worked: hours, target_per_hour: targetPerHour }
  }).catch(err => console.error('Erreur update heures comparatif:', err));
}

// ─── Admin: update action from comparison table ──────────────
async function updateCompAction(el) {
  const repId = el.dataset.rep;
  const key = el.dataset.key;
  const newTotal = parseInt(el.value) || 0;

  try {
    const data = await api(`/admin/actions/${actionsWeekStart}`);
    const rep = data.reps.find(r => r.sales_rep_id == repId);
    if (!rep) return;

    let currentTotal = 0;
    const days = data.days;
    days.forEach(day => {
      const v = (rep.days[day] && rep.days[day][`predefined:${key}`]) || 0;
      currentTotal += v;
    });

    const delta = newTotal - currentTotal;
    if (delta === 0) return;

    const monday = days[0];
    const mondayVal = (rep.days[monday] && rep.days[monday][`predefined:${key}`]) || 0;
    const newMondayVal = Math.max(0, mondayVal + delta);

    await api(`/daily-actions/values/${repId}/${monday}`, {
      method: 'PUT',
      body: { action_key: `predefined:${key}`, value: newMondayVal }
    });

    // Update detail section Monday cell if visible (without full reload)
    const detailInput = document.querySelector(
      `#admin-actions-container .act-counter-input[data-rep="${repId}"][data-key="${key}"][data-day="${monday}"]`
    );
    if (detailInput) {
      detailInput.value = newMondayVal;
      detailInput.dataset.v1 = newMondayVal;
    }
    // Toggle detail checkboxes for Monday if yesno
    const detailCheck = document.querySelector(
      `#admin-actions-container .act-check-row[data-rep="${repId}"][data-key="${key}"][data-day="${monday}"]`
    );
    if (detailCheck) {
      const icon = detailCheck.querySelector('.act-check-icon');
      if (newMondayVal > 0) {
        detailCheck.classList.remove('act-missing');
        detailCheck.classList.add('act-done');
        if (icon) icon.innerHTML = '<span class="mc-dot mc-dot-green"></span>';
      } else {
        detailCheck.classList.remove('act-done');
        detailCheck.classList.add('act-missing');
        if (icon) icon.innerHTML = '<span class="mc-dot mc-dot-red"></span>';
      }
      detailCheck.dataset.v1 = newMondayVal;
    }
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

// Icônes pour la barre de navigation du bas (mobile)
const TAB_ICONS = {
  today: '📊',
  dashboard: '🏠',
  ventes: '💰',
  mensuel: '📅',
  tasks: '✅',
  perso: '💪',
  'pilotage-funnel': '🔻',
  controle: '🔍',
  'admin-actions': '⚡',
  notes: '📝'
};
const TAB_SHORT_LABELS = {
  today: 'Jour',
  dashboard: 'Dashboard',
  ventes: 'Ventes',
  mensuel: 'Récap',
  tasks: 'Tâches',
  perso: 'Perso',
  'pilotage-funnel': 'Pilotage',
  controle: 'Contrôle',
  'admin-actions': 'Actions',
  notes: 'Notes'
};

// Construit / met à jour la barre de navigation du bas (mobile)
function renderBottomNav() {
  const bottomNav = document.getElementById('bottom-nav');
  if (!bottomNav) return;
  // Onglets visibles = tab-btn non masqués
  const visibleTabs = Array.from(document.querySelectorAll('#main-nav .tab-btn'))
    .filter(btn => btn.style.display !== 'none');
  bottomNav.innerHTML = visibleTabs.map(btn => {
    const tab = btn.dataset.tab;
    const active = btn.classList.contains('active');
    const icon = TAB_ICONS[tab] || '•';
    const label = TAB_SHORT_LABELS[tab] || btn.textContent.trim();
    return `
      <button class="bottom-nav-item ${active ? 'active' : ''}" data-bottom-tab="${tab}">
        <span class="bottom-nav-icon">${icon}</span>
        <span class="bottom-nav-label">${label}</span>
      </button>
    `;
  }).join('');
  bottomNav.querySelectorAll('[data-bottom-tab]').forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.dataset.bottomTab;
      const realBtn = document.querySelector(`#main-nav .tab-btn[data-tab="${tab}"]`);
      if (realBtn) realBtn.click();
    });
  });
}

function initTabs() {
  // Hamburger menu toggle
  const hamburger = document.getElementById('mobile-menu-toggle');
  const nav = document.getElementById('main-nav');
  if (hamburger && nav && !hamburger.dataset.bound) {
    hamburger.dataset.bound = '1';
    hamburger.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('mobile-open');
      hamburger.classList.toggle('open', isOpen);
      hamburger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  }

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
      // Body class for tab-specific layouts (e.g. full-width for tasks)
      document.body.classList.toggle('on-tasks-tab', btn.dataset.tab === 'tasks');
      // Auto-close mobile nav on tab pick
      if (nav) {
        nav.classList.remove('mobile-open');
        if (hamburger) {
          hamburger.classList.remove('open');
          hamburger.setAttribute('aria-expanded', 'false');
        }
      }
      // Sync bottom nav active state
      renderBottomNav();

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
      if (btn.dataset.tab === 'admin-actions') {
        // Sync Actions week with Dashboard week
        actionsWeekStart = currentWeekStart;
        loadAdminActions();
      }
      if (btn.dataset.tab === 'controle') loadControlTab();
      if (btn.dataset.tab === 'phoning') loadPhoningTab();
      if (btn.dataset.tab === 'phoning-recap') loadPhoningRecap();
      if (btn.dataset.tab === 'perso') loadPersoTab();
      if (btn.dataset.tab === 'tasks') loadTasksBoard();
      if (btn.dataset.tab === 'pilotage-funnel') loadPilotageFunnel();
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

  if (commerciaux.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <span class="empty-state-icon">&mdash;</span>
      <span class="empty-state-title">Aucune donnée cette semaine</span>
      <span class="empty-state-desc">Les fiches commerciales apparaîtront ici une fois les heures renseignées.</span>
    </div>`;
    return;
  }

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
  const vPrev = document.getElementById('v-prev-week');
  const vNext = document.getElementById('v-next-week');
  const vPicker = document.getElementById('v-week-picker');

  // Event listeners — admin can go anywhere, commercial can go back but not into the future
  vPrev.addEventListener('click', () => {
    currentWeekStart = addDays(currentWeekStart, -7);
    if (isAdmin()) loadDashboard();
    loadSales();
  });

  vNext.addEventListener('click', () => {
    const nextWeek = addDays(currentWeekStart, 7);
    const todayMonday = getMonday(new Date().toISOString().slice(0, 10));
    // Commercial: block navigating into the future
    if (!isAdmin() && nextWeek > todayMonday) return;
    currentWeekStart = nextWeek;
    if (isAdmin()) loadDashboard();
    loadSales();
  });

  vPicker.addEventListener('change', (e) => {
    if (e.target.value) {
      const picked = getMonday(e.target.value);
      const todayMonday = getMonday(new Date().toISOString().slice(0, 10));
      if (!isAdmin() && picked > todayMonday) {
        showToast('Impossible de sélectionner une semaine future', 'error');
        e.target.value = '';
        return;
      }
      currentWeekStart = picked;
      if (isAdmin()) loadDashboard();
      loadSales();
    }
  });

  const filterSelect = document.getElementById('v-filter-rep');
  filterSelect.addEventListener('change', loadSales);

  const ribBtn = document.getElementById('v-filter-rib');
  ribBtn.addEventListener('click', () => {
    ribBtn.classList.toggle('active');
    loadSales();
  });

  document.getElementById('btn-add-sale').addEventListener('click', () => openSaleModal());
  document.getElementById('btn-export-xls').addEventListener('click', exportSalesXLS);
  initSalesSort();
}

function exportSalesXLS() {
  const table = document.getElementById('sales-table');
  if (!table) return;
  const rows = table.querySelectorAll('tbody tr');
  if (rows.length === 0 || (rows.length === 1 && rows[0].querySelector('.empty-state'))) {
    showToast('Aucune vente à exporter', 'error');
    return;
  }

  const data = [];
  rows.forEach(tr => {
    const cells = tr.querySelectorAll('td');
    if (cells.length < 6) return;
    data.push({
      'Date': cells[0]?.textContent?.trim() || '',
      'Commercial': cells[1]?.textContent?.trim() || '',
      'Montant': cells[2]?.textContent?.trim() || '',
      'Prénom': cells[3]?.textContent?.trim() || '',
      'Nom': cells[4]?.textContent?.trim() || '',
      'Statut RIB': cells[5]?.textContent?.trim() || '',
      'Remarque': cells[6]?.textContent?.trim() || '',
      'Statut': cells[7]?.textContent?.trim() || ''
    });
  });

  const ws = XLSX.utils.json_to_sheet(data);
  // Auto-size columns
  const colWidths = Object.keys(data[0]).map(key => ({
    wch: Math.max(key.length, ...data.map(r => (r[key] || '').length)) + 2
  }));
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ventes');

  const weekLabel = currentWeekStart.replace(/-/g, '');
  XLSX.writeFile(wb, `ventes_semaine_${weekLabel}.xlsx`);
  showToast('Export Excel téléchargé ✅');
}

// Called on every login — applies role-based visibility to Ventes tab
function applyVentesRoleVisibility() {
  const vPrev = document.getElementById('v-prev-week');
  const vNext = document.getElementById('v-next-week');
  const vPicker = document.getElementById('v-week-picker');
  const filterSelect = document.getElementById('v-filter-rep');
  const ribBtn = document.getElementById('v-filter-rib');

  if (!isAdmin()) {
    // Commercial: start on current week, but can navigate to past weeks in read-only mode
    currentWeekStart = getMonday(new Date().toISOString().slice(0, 10));
    // Navigation allowed (past = read-only, future = blocked in nav handlers)
    vPrev.style.display = '';
    vNext.style.display = '';
    vPicker.style.display = '';

    // Lock filter to own rep
    filterSelect.innerHTML = `<option value="${currentUser.sales_rep_id}">${currentUser.name}</option>`;
    filterSelect.value = currentUser.sales_rep_id;
    filterSelect.style.display = 'none';

    ribBtn.style.display = 'none';
  } else {
    // Admin: show all navigation
    vPrev.style.display = '';
    vNext.style.display = '';
    vPicker.style.display = '';

    // Rebuild filter dropdown with all reps
    filterSelect.innerHTML = '<option value="">Tous les commerciaux</option>';
    for (const rep of salesReps) {
      const opt = document.createElement('option');
      opt.value = rep.id;
      opt.textContent = rep.name;
      filterSelect.appendChild(opt);
    }
    filterSelect.style.display = '';

    ribBtn.style.display = '';
  }
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

let chartVentesCA = null;

async function loadSales() {
  updateWeekLabel();

  // Read-only mode: commercial viewing a non-current week
  const todayMonday = getMonday(new Date().toISOString().slice(0, 10));
  const isCurrentWeek = currentWeekStart === todayMonday;
  const ventesReadOnly = !isAdmin() && !isCurrentWeek;

  // Show/hide "Ajouter une vente" button + read-only banner
  const addBtn = document.getElementById('btn-add-sale');
  if (addBtn) {
    addBtn.style.display = (!isAdmin() && !isCurrentWeek) ? 'none' : '';
  }
  // Inject / update read-only banner
  let banner = document.getElementById('v-readonly-banner');
  if (ventesReadOnly) {
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'v-readonly-banner';
      banner.className = 'v-readonly-banner';
      const table = document.getElementById('sales-table');
      if (table) table.parentNode.insertBefore(banner, table);
    }
    banner.innerHTML = '🔒 Semaine passée — lecture seule (impossible de modifier ces ventes)';
    banner.style.display = '';
  } else if (banner) {
    banner.style.display = 'none';
  }

  // Adjust columns for admin vs commercial
  const thead = document.querySelector('#sales-table thead tr');
  if (thead) {
    const ths = thead.querySelectorAll('th');
    if (isAdmin()) {
      if (ths[7]) { ths[7].style.display = ''; ths[7].innerHTML = 'Relances <span class="sort-icon"></span>'; }
      if (ths[8]) ths[8].style.display = '';
    } else {
      if (ths[7]) { ths[7].style.display = ''; ths[7].innerHTML = 'Statut'; ths[7].classList.remove('sortable'); }
      if (ths[8]) ths[8].style.display = 'none';
    }
  }

  // Commercial: always filter to own sales
  const filterRep = (!isAdmin() && currentUser) ? currentUser.sales_rep_id : document.getElementById('v-filter-rep').value;
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

  // ─── KPI stat cards ──────────────────────────────
  const totalCA = sales.reduce((s, v) => s + (v.validated ? v.amount : 0), 0);
  const totalAllCA = sales.reduce((s, v) => s + v.amount, 0);
  const pendingRib = sales.filter(v => v.rib_status !== 'Reçu').length;
  const pendingValidation = sales.filter(v => !v.validated).length;
  const avgPanier = sales.length > 0 ? Math.round(totalAllCA / sales.length) : 0;

  let statsBar = document.getElementById('ventes-stats-bar');
  if (!statsBar) {
    statsBar = document.createElement('div');
    statsBar.id = 'ventes-stats-bar';
    const table = document.getElementById('sales-table');
    table.parentNode.insertBefore(statsBar, table);
  }
  statsBar.innerHTML = `
    <div class="sc-stats-row">
      <div class="sc-stat-card accent-green">
        <div class="sc-stat-icon">💰</div>
        <div class="sc-stat-label">CA valid\u00e9</div>
        <div class="sc-stat-value">${fmtEuro(totalCA)}</div>
        <div class="sc-stat-sub">${sales.length} vente${sales.length > 1 ? 's' : ''}</div>
      </div>
      <div class="sc-stat-card accent-blue">
        <div class="sc-stat-icon">🛒</div>
        <div class="sc-stat-label">Panier moyen</div>
        <div class="sc-stat-value">${fmtEuro(avgPanier)}</div>
        <div class="sc-stat-sub">Sur ${sales.length} vente${sales.length > 1 ? 's' : ''}</div>
      </div>
      <div class="sc-stat-card ${pendingRib > 0 ? 'accent-orange' : ''}">
        <div class="sc-stat-icon">📋</div>
        <div class="sc-stat-label">RIB manquants</div>
        <div class="sc-stat-value">${pendingRib}</div>
        <div class="sc-stat-sub">${pendingRib > 0 ? 'Dossiers en attente' : 'Tous re\u00e7us'}</div>
      </div>
      <div class="sc-stat-card ${pendingValidation > 0 ? 'accent-red' : ''}">
        <div class="sc-stat-icon">⏳</div>
        <div class="sc-stat-label">En attente</div>
        <div class="sc-stat-value">${pendingValidation}</div>
        <div class="sc-stat-sub">${pendingValidation > 0 ? 'Ventes \u00e0 valider' : 'Tout valid\u00e9'}</div>
      </div>
    </div>
    ${sales.length > 0 ? '<div class="v-chart-wrap"><div class="v-chart-title">CA vs Objectif</div><canvas id="chart-ventes-ca"></canvas></div>' : ''}
  `;

  // ─── Bar chart CA/jour ────────────────────────────
  if (sales.length > 0) {
    const caByDay = {};
    for (let i = 0; i < 7; i++) {
      const d = addDays(currentWeekStart, i);
      caByDay[d] = 0;
    }
    sales.forEach(s => { if (s.validated && caByDay[s.date] !== undefined) caByDay[s.date] += s.amount; });

    const dayLabels = Object.keys(caByDay).map(d => new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }));
    const dayValues = Object.values(caByDay);

    const existingChart = Chart.getChart('chart-ventes-ca');
    if (existingChart) existingChart.destroy();

    const ctx = document.getElementById('chart-ventes-ca');
    if (ctx) {
      chartVentesCA = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: dayLabels,
          datasets: [{
            label: 'CA valid\u00e9',
            data: dayValues,
            backgroundColor: dayValues.map(v => v > 0 ? 'rgba(99,102,241,0.7)' : 'rgba(99,102,241,0.08)'),
            borderRadius: 4,
            borderSkipped: false,
            maxBarThickness: 48,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#fff',
              titleColor: '#1E293B',
              bodyColor: '#475569',
              borderColor: 'rgba(148,163,194,0.2)',
              borderWidth: 1,
              titleFont: { size: 12, family: 'Inter' },
              bodyFont: { size: 11, family: 'Inter' },
              cornerRadius: 8,
              padding: 10,
              callbacks: { label: ctx => fmtEuro(ctx.parsed.y) }
            }
          },
          scales: {
            x: { border: { color: '#64748B', width: 1.5 }, grid: { display: false }, ticks: { font: { size: 11, weight: '600', family: 'Inter' }, color: '#475569' } },
            y: { beginAtZero: true, border: { color: '#94A3B8' }, grid: { color: 'rgba(148,163,194,0.18)' }, ticks: { font: { size: 10, family: 'Inter' }, color: '#64748B', callback: v => v > 0 ? fmtEuro(v) : '0' } }
          }
        }
      });
    }
  }

  const tbody = document.querySelector('#sales-table tbody');
  tbody.innerHTML = '';

  if (sales.length === 0) {
    statsBar.innerHTML = '';

    tbody.innerHTML = `<tr class="empty-state-row"><td colspan="9">
      <span class="empty-state-title">Aucune vente cette semaine</span>
      <span class="empty-state-desc">Utilisez le bouton ci-dessus pour ajouter une vente.</span>
    </td></tr>`;
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

    // Validation status
    const isValidated = s.validated === 1;
    const validationBadge = isValidated
      ? '<span class="validation-badge validated">Validée</span>'
      : '<span class="validation-badge pending">En attente</span>';
    const validationBtn = isAdmin()
      ? (isValidated
          ? `<button class="btn-relance btn-unvalidate" onclick="toggleValidation(${s.id}, false)" title="Retirer la validation">Dévalider</button>`
          : `<button class="btn-relance btn-validate" onclick="toggleValidation(${s.id}, true)" title="Valider cette vente">Valider</button>`)
      : '';

    const tr = document.createElement('tr');
    if (!isValidated) tr.classList.add('sale-not-validated');
    const remarkCellOnClick = ventesReadOnly ? '' : `onclick="editRemarkInline(this, ${s.id})"`;
    const remarkCellClass = ventesReadOnly ? 'sale-remark-cell sale-remark-readonly' : 'sale-remark-cell';
    const remarkContent = ventesReadOnly
      ? (s.remark || '<span class="remark-placeholder">—</span>')
      : (s.remark || '<span class="remark-placeholder">+ Remarque</span>');
    tr.innerHTML = `
      <td>${new Date(s.date + 'T00:00:00').toLocaleDateString('fr-FR')}</td>
      <td>${s.rep_name}</td>
      <td style="font-weight:600">${fmtEuro(s.amount)}</td>
      <td>${s.client_first_name}</td>
      <td>${s.client_last_name}</td>
      <td><span class="rib-badge ${ribClass}">${s.rib_status || 'Non fourni'}</span></td>
      <td class="${remarkCellClass}" title="${(s.remark || '').replace(/"/g, '&quot;')}" ${remarkCellOnClick}>${remarkContent}</td>
      ${isAdmin() ? `<td class="relance-actions">${validationBtn} ${relanceHtml}</td>
      <td class="actions">
        <button class="btn-sm" onclick="editSale(${s.id})">Modifier</button>
        <button class="btn-sm danger" onclick="deleteSale(${s.id})">Supprimer</button>
      </td>` : `<td>${validationBadge}</td>`}
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

  const repSelect = document.getElementById('sale-rep');
  if (!isAdmin() && currentUser) {
    // Commercial: force own rep, hide selector
    repSelect.value = currentUser.sales_rep_id;
    repSelect.closest('.form-row').style.display = 'none';
  } else {
    repSelect.closest('.form-row').style.display = '';
    repSelect.value = repId || saleData?.sales_rep_id || salesReps[0]?.id;
  }

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
  const remarkEl = document.getElementById('sale-remark');
  if (remarkEl) remarkEl.value = saleData?.remark || '';
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
    rib_status: document.getElementById('sale-rib-status').value,
    remark: (document.getElementById('sale-remark')?.value || '').trim()
  };

  try {
    if (id) {
      await api(`/sales/${id}`, { method: 'PUT', body });
    } else {
      await api('/sales', { method: 'POST', body });
    }
    closeModal();
    loadDashboard();
    showToast(id ? 'Vente modifiée' : 'Vente ajoutée', 'success', 2000);
    // Also reload sales if on that tab
    if (document.getElementById('tab-ventes').classList.contains('active')) {
      loadSales();
    }
  } catch (e) {
    showToast(e.message || 'Erreur lors de l\'enregistrement', 'error');
  }
}

window.editRemarkInline = function(td, saleId) {
  if (td.querySelector('input')) return; // already editing
  const current = td.textContent === '+ Remarque' ? '' : td.textContent.trim();
  td.innerHTML = `<input type="text" class="remark-inline-input" value="${current.replace(/"/g, '&quot;')}" placeholder="Remarque..."
    onblur="saveRemarkInline(this, ${saleId})"
    onkeydown="if(event.key==='Enter'){this.blur();}if(event.key==='Escape'){this.dataset.cancel='1';this.blur();}">`;
  const input = td.querySelector('input');
  input.focus();
  input.select();
};

window.saveRemarkInline = async function(input, saleId) {
  if (input.dataset.cancel === '1') {
    loadSales();
    return;
  }
  const remark = input.value.trim();
  try {
    // Get current sale data to preserve other fields
    const sales = await api(`/weeks/${currentWeekStart}/sales`);
    const sale = sales.find(s => s.id === saleId);
    if (!sale) return;
    await api(`/sales/${saleId}`, {
      method: 'PUT',
      body: {
        sales_rep_id: sale.sales_rep_id,
        date: sale.date,
        amount: sale.amount,
        client_first_name: sale.client_first_name,
        client_last_name: sale.client_last_name,
        rib_status: sale.rib_status,
        client_email: sale.client_email || '',
        remark
      }
    });
    // Update cell inline
    const td = input.parentElement;
    td.innerHTML = remark || '<span class="remark-placeholder">+ Remarque</span>';
    td.title = remark;
  } catch (err) {
    console.error('Erreur save remark:', err);
  }
};

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
    showToast('Vente supprimée', 'info', 2000);
  } catch (e) {
    showToast(e.message || 'Erreur', 'error');
  }
};

window.validateRib = async function(id) {
  if (!confirm('Confirmer la réception du RIB ?')) return;
  try {
    await api(`/sales/${id}/validate-rib`, { method: 'POST', body: {} });
    loadSales();
    loadDashboard();
    showToast('RIB validé', 'success', 2000);
  } catch (e) {
    showToast(e.message || 'Erreur', 'error');
  }
};

window.sendRelance = async function(id, level) {
  const labels = { 1: '1ère relance (R1)', 2: '2ème relance (R2)', 3: 'mise en contentieux (R3)' };
  if (!confirm(`Envoyer la ${labels[level]} par email au client ?`)) return;
  try {
    await api(`/sales/${id}/relance`, { method: 'POST', body: { level } });
    showToast(`Relance R${level} envoyée`, 'success', 2500);
    loadSales();
  } catch (e) {
    showToast(e.message || 'Erreur', 'error');
  }
};

window.toggleValidation = async function(id, validate) {
  const endpoint = validate ? `/sales/${id}/validate` : `/sales/${id}/unvalidate`;
  try {
    await api(endpoint, { method: 'POST', body: {} });
    loadSales();
    loadDashboard();
    showToast(validate ? 'Vente validée' : 'Validation retirée', validate ? 'success' : 'info', 2000);
  } catch (e) {
    showToast(e.message || 'Erreur', 'error');
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

  // ── Global KPIs ──
  const totalCA = data.global.ca || 0;
  const totalVentes = data.global.nb_ventes || 0;
  const totalHours = data.rep_stats.reduce((s, r) => s + r.total_hours, 0);
  const globalRatio = totalHours > 0 ? Math.round(totalCA / totalHours) : 0;
  const globalPanier = totalVentes > 0 ? Math.round(totalCA / totalVentes) : 0;
  const activeReps = data.rep_stats.filter(r => r.total_hours > 0);
  const repsAtObjectif = activeReps.filter(r => r.ratio_mensuel >= 300).length;
  const objPct = activeReps.length > 0 ? Math.round((repsAtObjectif / activeReps.length) * 100) : 0;
  const progressClass = objPct >= 80 ? 'green' : objPct >= 40 ? 'orange' : '';

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

  // ── KPI stat cards ──
  let kpiHTML = '';
  if (admin) {
    kpiHTML = `
    <div class="sc-stats-row">
      <div class="sc-stat-card accent-green">
        <div class="sc-stat-icon">💰</div>
        <div class="sc-stat-label">CA Total</div>
        <div class="sc-stat-value">${fmtEuro(totalCA)}</div>
        <div class="sc-stat-sub">${totalVentes} vente${totalVentes > 1 ? 's' : ''} \u00b7 ${totalHours}h</div>
      </div>
      <div class="sc-stat-card accent-blue">
        <div class="sc-stat-icon">⚡</div>
        <div class="sc-stat-label">Ratio global</div>
        <div class="sc-stat-value">${globalRatio} \u20ac/h</div>
        <div class="sc-stat-sub">Objectif : 300 \u20ac/h</div>
      </div>
      <div class="sc-stat-card accent-orange">
        <div class="sc-stat-icon">🛒</div>
        <div class="sc-stat-label">Panier moyen</div>
        <div class="sc-stat-value">${fmtEuro(globalPanier)}</div>
        <div class="sc-stat-sub">Moyenne \u00e9quipe</div>
      </div>
      <div class="sc-stat-card ${objPct >= 80 ? 'accent-green' : objPct >= 40 ? 'accent-orange' : 'accent-red'}">
        <div class="sc-stat-icon">🎯</div>
        <div class="sc-stat-label">Objectif atteint</div>
        <div class="sc-stat-value">${repsAtObjectif}/${activeReps.length}</div>
        <div class="sc-stat-sub">${objPct}% de l'\u00e9quipe</div>
      </div>
    </div>
    <div class="sc-progress-wrap">
      <div class="sc-progress-header">
        <span class="sc-progress-label">Commerciaux \u00e0 l'objectif</span>
        <span class="sc-progress-pct">${objPct}%</span>
      </div>
      <div class="sc-progress-bar">
        <div class="sc-progress-fill ${progressClass}" style="width:${objPct}%"></div>
      </div>
    </div>`;
  } else {
    // Commercial: show their own stats
    const myRepId = getMyRepId();
    const myStats = data.rep_stats.find(r => r.sales_rep_id === myRepId);
    if (myStats) {
      const myRatio = myStats.total_hours > 0 ? Math.round(myStats.ratio_mensuel) : 0;
      const myPanier = Math.round(myStats.panier_moyen);
      const myRatioOk = myRatio >= 300;
      kpiHTML = `
      <div class="sc-stats-row">
        <div class="sc-stat-card accent-green">
          <div class="sc-stat-icon">💰</div>
          <div class="sc-stat-label">Mon CA</div>
          <div class="sc-stat-value">${fmtEuro(myStats.ca)}</div>
          <div class="sc-stat-sub">${myStats.nb_ventes} vente${myStats.nb_ventes > 1 ? 's' : ''}</div>
        </div>
        <div class="sc-stat-card ${myRatioOk ? 'accent-green' : 'accent-red'}">
          <div class="sc-stat-icon">⚡</div>
          <div class="sc-stat-label">Mon Ratio</div>
          <div class="sc-stat-value">${myRatio} \u20ac/h</div>
          <div class="sc-stat-sub">Objectif : 300 \u20ac/h</div>
        </div>
        <div class="sc-stat-card accent-blue">
          <div class="sc-stat-icon">🛒</div>
          <div class="sc-stat-label">Mon panier moyen</div>
          <div class="sc-stat-value">${fmtEuro(myPanier)}</div>
          <div class="sc-stat-sub">Sur ${myStats.nb_ventes} vente${myStats.nb_ventes > 1 ? 's' : ''}</div>
        </div>
        <div class="sc-stat-card accent-gold">
          <div class="sc-stat-icon">🏅</div>
          <div class="sc-stat-label">Mon classement</div>
          <div class="sc-stat-value">#${sorted.findIndex(r => r.sales_rep_id === myRepId) + 1}</div>
          <div class="sc-stat-sub">Sur ${sorted.length} commerciaux</div>
        </div>
      </div>`;
    }
  }

  // ── Classement par ratio mensuel (ranking list) ──
  let rankHTML = kpiHTML + `
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
      { color: 'gold', title: 'Premium', desc: 'Meilleur panier moyen', name: bestPanier.panier_moyen > 0 ? bestPanier.name : NA, value: bestPanier.panier_moyen > 0 ? Math.round(bestPanier.panier_moyen).toLocaleString('fr-FR') + ' \u20ac' : null },
      { color: 'blue', title: 'RDV', desc: 'Le plus de rendez-vous fix\u00e9s', name: bestRDV.rdv_fixes > 0 ? bestRDV.name : NA, value: bestRDV.rdv_fixes > 0 ? bestRDV.rdv_fixes : null },
      { color: 'green', title: 'Ambassadeur', desc: 'Le plus de r\u00e9f\u00e9rences', name: bestRef.references > 0 ? bestRef.name : NA, value: bestRef.references > 0 ? bestRef.references : null },
    ];

    rankHTML += '<div class="badges-grid">';
    badges.forEach(b => {
      const attribue = b.name !== NA;
      if (attribue) {
        rankHTML += `
          <div class="badge-card">
            <span class="mc-dot mc-dot-${b.color}" style="margin-bottom:8px"></span>
            <div class="badge-title">${b.title}</div>
            <div class="badge-desc">${b.desc}</div>
            <div class="badge-name">${b.name} \u2014 ${b.value}</div>
          </div>`;
      } else {
        rankHTML += `
          <div class="badge-card badge-unassigned">
            <span class="mc-dot mc-dot-muted" style="margin-bottom:8px"></span>
            <div class="badge-title">${b.title}</div>
            <div class="badge-desc">${b.desc}</div>
            <div class="badge-name badge-blink">\u00c0 saisir</div>
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
  'Marvin':  { line: '#6366F1', bg: 'rgba(99,102,241,.12)' },
  'Magali':  { line: '#EC4899', bg: 'rgba(236,72,153,.12)' },
  'Fabian':  { line: '#10B981', bg: 'rgba(16,185,129,.12)' }
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
          backgroundColor: '#fff',
          titleColor: '#1E293B',
          bodyColor: '#475569',
          borderColor: 'rgba(148,163,194,0.2)',
          borderWidth: 1,
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
// Ratio >= 300 = point positif, ratio < 250 = point négatif, entre 250 et 300 = rien
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

  // ── Priorité 0.5 : Ratio CA/h ──
  if (hours > 0) {
    const ratio = Math.round(repStat.ratio_mensuel || 0);
    if (ratio >= 300) {
      evals.push({ priority: 0.5, type: 'ok', text: `Ratio de ${ratio} €/h — objectif atteint` });
    } else if (ratio < 250) {
      evals.push({ priority: 0.5, type: 'ko', text: `Ratio de ${ratio} €/h — en dessous de l'objectif` });
    }
    // Entre 250 et 299 : on ne dit rien
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
        ${noData ? '<div class="empty-state-inline" style="margin-top:8px;"><span class="empty-state-icon">&mdash;</span><span>Pas assez de données pour une analyse pertinente.</span></div>' : ''}
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
  // PIN change form
  const pinForm = document.getElementById('change-pin-form');
  if (pinForm && !pinForm.dataset.bound) {
    pinForm.dataset.bound = '1';
    pinForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const feedback = document.getElementById('change-pin-feedback');
      const currentPin = document.getElementById('current-pin').value;
      const newPin = document.getElementById('new-pin').value;
      const confirmPin = document.getElementById('confirm-pin').value;
      if (newPin !== confirmPin) {
        feedback.textContent = '❌ Les deux nouveaux PINs ne correspondent pas.';
        feedback.className = 'admin-pin-feedback error';
        return;
      }
      if (newPin.length < 4) {
        feedback.textContent = '❌ Le nouveau PIN doit faire au moins 4 caractères.';
        feedback.className = 'admin-pin-feedback error';
        return;
      }
      try {
        await api('/admin/pin', { method: 'PUT', body: { currentPin, newPin } });
        feedback.textContent = '✅ PIN modifié avec succès. Il sera utilisé pour la prochaine connexion.';
        feedback.className = 'admin-pin-feedback success';
        pinForm.reset();
      } catch (err) {
        feedback.textContent = '❌ ' + (err.message || 'Erreur lors du changement');
        feedback.className = 'admin-pin-feedback error';
      }
    });
  }

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
    listDiv.innerHTML = `<div class="empty-state">
      <span class="empty-state-icon">&mdash;</span>
      <span class="empty-state-title">Aucun commercial</span>
      <span class="empty-state-desc">Ajoutez un commercial via le formulaire ci-dessus.</span>
    </div>`;
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
      <button class="btn-edit-pin" onclick="editPin(${rep.id}, '${rep.name}', '${rep.pin || ''}')" title="Modifier le PIN">✏️</button>
      <button class="btn-delete-rep" onclick="deleteRep(${rep.id}, '${rep.name}')" title="Supprimer">✕</button>
    </div>`;
  }).join('');
}

async function editPin(id, name, currentPin) {
  const newPin = prompt(`Nouveau PIN pour "${name}" :`, currentPin);
  if (newPin === null) return; // cancelled
  if (!newPin || newPin.trim().length < 2) {
    alert('Le PIN doit faire au moins 2 caractères.');
    return;
  }
  try {
    await api(`/sales-reps/${id}/pin`, { method: 'PUT', body: { pin: newPin.trim() } });
    await refreshSalesReps();
    renderAdminRepList();
    alert(`PIN de "${name}" mis à jour : ${newPin.trim()}`);
  } catch (err) {
    alert(err.message || 'Erreur lors du changement de PIN');
  }
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

// ═══════════════════════════════════════════════════════════
// PERSO V2 (workout tracking — admin only)
// ═══════════════════════════════════════════════════════════

let persoState = {
  booted: false,
  todayDate: () => new Date().toISOString().slice(0, 10),
  currentSession: null,
  templates: [],
  exercises: [],
  tplDraft: { id: null, name: '', exercise_ids: [] },
  restTimer: null, // { interval, remaining, total, perfId, setNum }
  progressChart: null,
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth()
};

async function loadPersoTab() {
  if (!isAdmin()) return;
  if (!persoState.booted) initPersoTab();
  const date = persoState.todayDate();
  document.getElementById('perso-today-date').textContent = new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // Load daily energy
  try {
    const daily = await api(`/perso/daily/${date}`);
    document.querySelectorAll('#perso-energy-scale button').forEach(b => b.classList.toggle('active', parseInt(b.dataset.val) === daily.energy));
  } catch (e) { /* ignore */ }

  await refreshPersoTemplates();
  await refreshPersoExercises();
  await loadPersoSession();
}

function initPersoTab() {
  persoState.booted = true;
  document.querySelectorAll('#perso-energy-scale button').forEach(btn => {
    btn.addEventListener('click', async () => {
      const val = parseInt(btn.dataset.val);
      document.querySelectorAll('#perso-energy-scale button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      await api(`/perso/daily/${persoState.todayDate()}`, { method: 'PUT', body: { energy: val } });
    });
  });
  document.getElementById('perso-btn-new-template').addEventListener('click', () => openTemplateEditor(null));
  // perso-btn-start-blank désormais rendu dynamiquement dans renderPersoSession (état vide)
  document.getElementById('perso-tpl-cancel').addEventListener('click', closeTemplateEditor);
  document.getElementById('perso-tpl-form').addEventListener('submit', async (e) => { e.preventDefault(); await saveTemplate(); });
  const tplInput = document.getElementById('perso-tpl-exercise-input');
  tplInput.addEventListener('input', () => renderExerciseAutocomplete(tplInput.value, 'perso-tpl-autocomplete', async (ex) => {
    if (!persoState.tplDraft.exercise_ids.includes(ex.id)) {
      persoState.tplDraft.exercise_ids.push(ex.id);
      persoState.tplDraft.superset_groups.push(null);
      renderTemplateEditorExercises();
    }
    tplInput.value = '';
    document.getElementById('perso-tpl-autocomplete').classList.add('hidden');
  }));
  tplInput.addEventListener('blur', () => setTimeout(() => document.getElementById('perso-tpl-autocomplete').classList.add('hidden'), 200));
  document.getElementById('perso-progress-close').addEventListener('click', () => {
    document.getElementById('perso-progress-overlay').classList.add('hidden');
    if (persoState.progressChart) { persoState.progressChart.destroy(); persoState.progressChart = null; }
  });

  // Exercise catalog
  document.getElementById('perso-btn-add-exercise').addEventListener('click', (e) => {
    e.stopPropagation(); // ne pas déclencher le toggle du catalogue
    addNewExercise();
  });
  document.getElementById('perso-ex-search').addEventListener('input', (e) => renderExercisesCatalog(e.target.value));
  // Repli/dépli du catalogue
  const catalogToggle = document.getElementById('perso-catalog-toggle');
  const catalog = document.getElementById('perso-catalog');
  if (catalogToggle && catalog) {
    catalogToggle.addEventListener('click', () => {
      catalog.classList.toggle('is-collapsed');
    });
    // Replié par défaut (secondaire)
    catalog.classList.add('is-collapsed');
  }

  // Navigation interne (pills) — scroll vers la section + état actif
  document.querySelectorAll('#perso-nav .p-nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.pnav;
      const target = document.getElementById(targetId);
      if (!target) return;
      // Si on cible le catalogue, on le déplie
      if (targetId === 'perso-catalog') {
        document.getElementById('perso-catalog')?.classList.remove('is-collapsed');
      }
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.querySelectorAll('#perso-nav .p-nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Calendar navigation
  document.getElementById('perso-cal-prev').addEventListener('click', () => { persoState.calMonth--; if (persoState.calMonth < 0) { persoState.calMonth = 11; persoState.calYear--; } renderCalendar(); });
  document.getElementById('perso-cal-next').addEventListener('click', () => { persoState.calMonth++; if (persoState.calMonth > 11) { persoState.calMonth = 0; persoState.calYear++; } renderCalendar(); });

  // Set date display
  const now = new Date();
  persoState.calYear = now.getFullYear();
  persoState.calMonth = now.getMonth();
  document.getElementById('perso-today-date').textContent = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // Energy text
  const energyLabels = { 1: 'Vidé', 2: 'Fatigué', 3: 'Normal', 4: 'En forme', 5: 'Au top !' };
  document.querySelectorAll('#perso-energy-scale button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('perso-energy-text').textContent = energyLabels[parseInt(btn.dataset.val)] || '';
    });
  });

  // Exercise filter buttons
  renderExerciseFilters();

  // Load sidebar data
  renderCalendar();
  loadMonthStats();
  loadRecentPRs();
}

// ─── Calendar ─────────────────────────────────────────────

async function renderCalendar() {
  const container = document.getElementById('perso-calendar');
  const monthLabel = document.getElementById('perso-cal-month');
  if (!container || !monthLabel) return;

  const year = persoState.calYear;
  const month = persoState.calMonth;
  const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  monthLabel.textContent = `${monthNames[month]} ${year}`;

  // Fetch sessions for this month
  const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0);
  const lastDayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
  let sessionDates = new Set();
  try {
    const sessions = await api(`/perso/sessions/range?from=${firstDay}&to=${lastDayStr}`);
    if (Array.isArray(sessions)) {
      sessions.forEach(s => sessionDates.add(s.date));
    }
  } catch (e) { /* endpoint may not exist yet */ }

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const daysInMonth = lastDay.getDate();
  const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0

  // Day of week headers
  const dows = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  let html = dows.map(d => `<span class="p-cal-dow">${d}</span>`).join('');

  // Empty cells before first day
  for (let i = 0; i < firstDayOfWeek; i++) {
    html += '<span class="p-cal-day empty"></span>';
  }

  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = dateStr === todayStr;
    const isTrained = sessionDates.has(dateStr);
    const cls = isToday ? 'today' : isTrained ? 'trained' : '';
    html += `<span class="p-cal-day ${cls}" data-date="${dateStr}">${d}</span>`;
  }

  container.innerHTML = html;

  // Update month badge
  const badge = document.getElementById('perso-month-badge');
  if (badge) {
    const count = sessionDates.size;
    badge.textContent = `${count} séance${count > 1 ? 's' : ''} ce mois`;
    badge.className = `p-badge ${count >= 12 ? 'p-badge-green' : count >= 8 ? 'p-badge-blue' : count >= 4 ? 'p-badge-orange' : 'p-badge-red'}`;
  }
}

// ─── Progression sportive (sidebar) ──────────────────────

function getPersoWeeklyGoal() {
  const stored = parseInt(localStorage.getItem('persoWeeklyGoal') || '3', 10);
  return (stored >= 1 && stored <= 7) ? stored : 3;
}

// Lundi de la semaine d'une date donnée (format YYYY-MM-DD)
function mondayOfWeek(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // 0 = lundi
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

async function loadMonthStats() {
  // Conservé sous le même nom pour compat avec les appels existants
  return loadPersoProgression();
}

// ─── Moteur de coaching ──────────────────────────────────
// Détecte le type d'une séance depuis son nom
function detectPersoSessionType(session) {
  const name = (session.name || '').toLowerCase();
  if (/\bpush\b|poussée?/.test(name)) return 'Push';
  if (/\bpull\b|tirage|dos/.test(name)) return 'Pull';
  if (/\blegs?\b|jambes?|cuisse/.test(name)) return 'Legs';
  if (/haut/.test(name)) return 'Haut du corps';
  if (/bas/.test(name)) return 'Bas du corps';
  return null;
}
// Suggère la prochaine séance selon une rotation classique
function nextPersoWorkout(lastType) {
  const rotation = {
    'Push': 'Pull',
    'Pull': 'Legs',
    'Legs': 'Push',
    'Haut du corps': 'Bas du corps',
    'Bas du corps': 'Haut du corps'
  };
  return rotation[lastType] || null;
}
// Calcule la liste des conseils de coaching, triés par priorité
function computeCoachingTips({ weekCount, goal, sessions, todayStr }) {
  const tips = [];
  const sorted = [...sessions].sort((a, b) => b.date.localeCompare(a.date));
  const lastSession = sorted[0];

  // 1. Objectif de la semaine
  if (weekCount === 0) {
    tips.push({ icon: '🎯', priority: 1, text: "Tu n'as pas encore fait de séance cette semaine. C'est le moment de t'y mettre !" });
  } else if (weekCount >= goal) {
    tips.push({ icon: '🏆', priority: 2, text: `Objectif atteint — ${weekCount} séance${weekCount > 1 ? 's' : ''} cette semaine. Tu progresses, continue comme ça !` });
  } else {
    const remaining = goal - weekCount;
    tips.push({ icon: '🔥', priority: 2, text: `Encore ${remaining} séance${remaining > 1 ? 's' : ''} pour atteindre ton objectif de la semaine.` });
  }

  // 2. Suggestion de rotation (si dernière séance récente)
  if (lastSession) {
    const lastType = detectPersoSessionType(lastSession);
    const daysSince = Math.round((new Date(todayStr) - new Date(lastSession.date + 'T00:00:00')) / 86400000);
    if (lastType && daysSince >= 1 && daysSince <= 4) {
      const next = nextPersoWorkout(lastType);
      if (next) {
        tips.push({ icon: '💡', priority: 3, text: `Ta dernière séance était ${lastType}, tu peux faire ${next} aujourd'hui.`, isSuggestion: true });
      }
    }
  }

  // 3. Charges non renseignées
  const recent = sorted.slice(0, 5);
  const hasWeights = recent.some(s =>
    (s.performances || []).some(p =>
      (p.set_logs || []).some(sl => (sl.weight_kg || 0) > 0)
    )
  );
  if (recent.length >= 2 && !hasWeights) {
    tips.push({ icon: '📝', priority: 4, text: "Pense à noter tes charges pour suivre ton évolution." });
  }

  // 4. Progression : volume de cette semaine > semaine précédente
  const weekStart = mondayOfWeek(todayStr);
  const prevWeekStart = (() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); })();
  const volOf = (sList) => sList.reduce((sum, s) => sum + (s.performances || []).reduce((ps, p) =>
    ps + (p.set_logs || []).filter(sl => !sl.is_warmup && sl.completed).reduce((t, sl) => t + (sl.weight_kg || 0) * (sl.reps || 0), 0), 0), 0);
  const thisWeekVol = volOf(sorted.filter(s => s.date >= weekStart && s.date <= todayStr));
  const prevWeekVol = volOf(sorted.filter(s => s.date >= prevWeekStart && s.date < weekStart));
  if (prevWeekVol > 0 && thisWeekVol > prevWeekVol * 1.05) {
    tips.push({ icon: '📈', priority: 3, text: "Ton volume d'entraînement augmente — tu progresses, continue !" });
  }

  return tips.sort((a, b) => a.priority - b.priority);
}
// Stocke le tip secondaire à afficher dans le hero
let persoHeroCoachingTip = null;
// Stocke la recommandation de séance du jour { lastType, recoType, templateId }
let persoRecommendation = null;

async function loadPersoProgression() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  // On charge les 8 dernières semaines pour calculs (fréquence, etc.)
  const from = new Date(now); from.setDate(from.getDate() - 56);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = now.toISOString().slice(0, 10);

  let sessions = [];
  try {
    sessions = await api(`/perso/sessions/range?from=${fromStr}&to=${toStr}`) || [];
  } catch (e) { /* ignore */ }

  const todayStr = now.toISOString().slice(0, 10);
  const weekStart = mondayOfWeek(todayStr);

  // Séances de cette semaine
  const weekSessions = sessions.filter(s => s.date >= weekStart && s.date <= todayStr);
  const weekCount = weekSessions.length;

  // Temps total cette semaine (estimé)
  let weekMinutes = 0;
  weekSessions.forEach(s => {
    if (s.started_at && s.ended_at) {
      weekMinutes += Math.round((new Date(s.ended_at.replace(' ', 'T')) - new Date(s.started_at.replace(' ', 'T'))) / 60000);
    } else {
      // Estimation: ~8min par exercice
      weekMinutes += (s.performances || []).length * 8;
    }
  });
  const timeStr = weekMinutes >= 60
    ? `${Math.floor(weekMinutes / 60)}h${String(weekMinutes % 60).padStart(2, '0')}`
    : `${weekMinutes}min`;

  // Fréquence moyenne sur les 8 dernières semaines
  const freq = sessions.length > 0 ? (sessions.length / 8).toFixed(1) : '0';

  // Dernière séance réalisée (la plus récente, complétée de préférence)
  const sorted = [...sessions].sort((a, b) => b.date.localeCompare(a.date));
  const lastSession = sorted[0];
  let lastStr = '—';
  if (lastSession) {
    const d = new Date(lastSession.date + 'T00:00:00');
    const diffDays = Math.round((new Date(todayStr) - d) / 86400000);
    if (diffDays === 0) lastStr = "Auj.";
    else if (diffDays === 1) lastStr = "Hier";
    else if (diffDays < 7) lastStr = `${diffDays}j`;
    else lastStr = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  // Objectif de la semaine
  const goal = getPersoWeeklyGoal();

  // Mise à jour du DOM
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText('perso-stat-week', weekCount);
  setText('perso-stat-time', timeStr);
  setText('perso-stat-freq', freq);
  setText('perso-stat-last', lastStr);
  setText('perso-goal-count', `${weekCount} / ${goal}`);

  const barFill = document.getElementById('perso-goal-bar-fill');
  if (barFill) {
    const pct = Math.min(100, Math.round((weekCount / goal) * 100));
    barFill.style.width = pct + '%';
    barFill.classList.toggle('is-complete', weekCount >= goal);
  }

  // Moteur de coaching — calcule tous les conseils contextuels
  const tips = computeCoachingTips({ weekCount, goal, sessions, todayStr });

  // Tip principal → bandeau de la sidebar
  const msgEl = document.querySelector('#perso-coaching-msg .p-coaching-text');
  const iconEl = document.querySelector('#perso-coaching-msg .p-coaching-icon');
  if (msgEl && tips.length > 0) {
    msgEl.textContent = tips[0].text;
    if (iconEl) iconEl.textContent = tips[0].icon;
  }

  // Tip secondaire pour le hero : suggestion de rotation OU 2e conseil
  persoHeroCoachingTip = tips.find(t => t.isSuggestion) || tips[1] || null;

  // ── Recommandation de séance du jour ──
  // Détermine quelle séance recommander et le template associé
  const sortedSessions = [...sessions].sort((a, b) => b.date.localeCompare(a.date));
  const lastSess = sortedSessions[0];
  const lastType = lastSess ? detectPersoSessionType(lastSess) : null;
  let recoType = lastType ? nextPersoWorkout(lastType) : null;
  if (!recoType) recoType = 'Push'; // défaut si pas d'historique typé
  // Cherche un template correspondant au type recommandé
  let recoTemplate = (persoState.templates || []).find(t => persoTemplateType(t).label === recoType);
  // Sinon, propose le premier template favori ou le premier dispo
  if (!recoTemplate && persoState.templates && persoState.templates.length > 0) {
    recoTemplate = persoState.templates.find(t => t.favorite) || persoState.templates[0];
    if (recoTemplate) recoType = persoTemplateType(recoTemplate).label;
  }
  persoRecommendation = { lastType, recoType, templateId: recoTemplate ? recoTemplate.id : null };

  // Si le hero est en état vide, on rafraîchit pour afficher le tip + reco
  if (!persoState.currentSession) renderPersoSession();

  // Bouton édition objectif
  const editBtn = document.getElementById('perso-goal-edit');
  if (editBtn && !editBtn.dataset.bound) {
    editBtn.dataset.bound = '1';
    editBtn.addEventListener('click', () => {
      const current = getPersoWeeklyGoal();
      const input = prompt('Objectif de séances par semaine (1 à 7) :', current);
      if (input === null) return;
      const n = parseInt(input, 10);
      if (n >= 1 && n <= 7) {
        localStorage.setItem('persoWeeklyGoal', String(n));
        loadPersoProgression();
      } else {
        showToast('Valeur invalide (1-7)', 'error');
      }
    });
  }
}

// ─── Recent PRs ───────────────────────────────────────────

async function loadRecentPRs() {
  const container = document.getElementById('perso-recent-prs');
  if (!container) return;

  let prs = [];
  try {
    prs = await api('/perso/records/recent?limit=5') || [];
  } catch (e) { /* endpoint may not exist */ }

  if (!prs.length) {
    container.innerHTML = '<div class="p-empty-sm">Aucun record pour le moment.</div>';
    return;
  }

  const typeLabels = { max_weight: 'Charge max', estimated_1rm: '1RM estimé', max_volume_set: 'Meilleur set', max_total_tonnage: 'Tonnage max' };
  container.innerHTML = prs.map(pr => `
    <div class="p-record-row">
      <span class="p-record-emoji">🏆</span>
      <div class="p-record-info">
        <div class="p-record-name">${escapeHtml(pr.exercise_name || pr.exercise)}</div>
        <div class="p-record-sub">${typeLabels[pr.record_type] || pr.record_type}</div>
      </div>
      <div style="text-align:right;">
        <div class="p-record-val">${pr.value} ${pr.unit || 'kg'}</div>
        ${pr.previous ? `<div class="p-record-delta">+${Math.round((pr.value - pr.previous) * 10) / 10}</div>` : ''}
      </div>
    </div>
  `).join('');
}

// ─── Exercise Filters ─────────────────────────────────────

function renderExerciseFilters() {
  const container = document.getElementById('perso-ex-filters');
  if (!container) return;

  const groups = new Set();
  persoState.exercises.forEach(ex => { if (ex.muscle_group) groups.add(ex.muscle_group); });

  let html = '<button class="p-ex-filter active" data-filter="">Tous</button>';
  [...groups].sort().forEach(g => {
    html += `<button class="p-ex-filter" data-filter="${escapeHtml(g)}">${escapeHtml(g)}</button>`;
  });
  container.innerHTML = html;

  container.querySelectorAll('.p-ex-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.p-ex-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;
      document.getElementById('perso-ex-search').value = filter;
      renderExercisesCatalog(filter);
    });
  });
}

// ─── Templates ─────────────────────────────────────────────

async function refreshPersoTemplates() {
  persoState.templates = await api('/perso/templates');
  renderPersoTemplates();
}

// Détermine le "type" d'une séance template (Push/Pull/Legs/Haut/Bas...)
function persoTemplateType(t) {
  const name = (t.name || '').toLowerCase();
  // 1. Détection par mots-clés dans le nom
  if (/\bpush\b|poussée?/.test(name)) return { label: 'Push', cls: 'push' };
  if (/\bpull\b|tirage|dos/.test(name)) return { label: 'Pull', cls: 'pull' };
  if (/\blegs?\b|jambes?|cuisse/.test(name)) return { label: 'Legs', cls: 'legs' };
  if (/full|complet|corps entier/.test(name)) return { label: 'Full body', cls: 'full' };
  if (/haut/.test(name)) return { label: 'Haut du corps', cls: 'upper' };
  if (/bas/.test(name)) return { label: 'Bas du corps', cls: 'lower' };
  // 2. Sinon, déduction depuis les body_part des exercices
  const exs = t.exercises || [];
  if (exs.length === 0) return { label: 'Séance', cls: 'default' };
  const parts = exs.map(e => e.body_part).filter(Boolean);
  const lower = parts.filter(p => p === 'lower').length;
  const upper = parts.filter(p => p === 'upper').length;
  if (lower > 0 && upper > 0) return { label: 'Full body', cls: 'full' };
  if (lower > upper) return { label: 'Bas du corps', cls: 'lower' };
  if (upper > 0) return { label: 'Haut du corps', cls: 'upper' };
  return { label: 'Séance', cls: 'default' };
}

// Durée estimée d'un template (minutes)
function estimateTemplateDuration(t) {
  const exs = t.exercises || [];
  if (exs.length === 0) return 0;
  let totalSec = 0;
  exs.forEach(e => {
    const sets = e.target_sets || e.ex_target_sets || 3;
    const rest = e.default_rest_seconds || 90;
    totalSec += sets * (45 + rest);
  });
  return Math.max(5, Math.round(totalSec / 60));
}

// "Dernière réalisation" formatée
function formatTemplateLastUsed(dateStr) {
  if (!dateStr) return 'Jamais réalisée';
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - d) / 86400000);
  if (diff === 0) return "Réalisée aujourd'hui";
  if (diff === 1) return 'Réalisée hier';
  if (diff < 7) return `Réalisée il y a ${diff}j`;
  if (diff < 30) return `Réalisée il y a ${Math.floor(diff / 7)} sem.`;
  return 'Réalisée le ' + d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function renderPersoTemplates() {
  const container = document.getElementById('perso-templates-list');
  if (persoState.templates.length === 0) {
    container.innerHTML = '<div class="p-empty">Aucune séance. Crée ta première séance type.</div>';
    return;
  }
  container.innerHTML = persoState.templates.map(t => {
    const type = persoTemplateType(t);
    const nbEx = t.exercises.length;
    const duration = estimateTemplateDuration(t);
    const lastUsed = formatTemplateLastUsed(t.last_used);
    // Aperçu des exercices : 4 max, puis "+N"
    const previewExs = t.exercises.slice(0, 4);
    const extraCount = nbEx - previewExs.length;
    const exPreview = nbEx === 0
      ? '<span class="p-tpl-ex-empty">Aucun exercice</span>'
      : previewExs.map(e => `<span class="p-tpl-ex-pill">${escapeHtml(e.name)}</span>`).join('')
        + (extraCount > 0 ? `<span class="p-tpl-ex-pill p-tpl-ex-more">+${extraCount}</span>` : '');

    return `
    <div class="p-workout-card ${t.favorite ? 'is-favorite' : ''}">
      <div class="p-workout-head">
        <div class="p-workout-titles">
          <span class="p-workout-type p-workout-type-${type.cls}">${type.label}</span>
          <h3 class="p-workout-name">${escapeHtml(t.name)}</h3>
        </div>
        <button class="p-workout-fav" onclick="event.stopPropagation(); togglePersoTemplateFavorite(${t.id})" title="${t.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${t.favorite ? '★' : '☆'}</button>
      </div>

      <div class="p-workout-meta">
        <span class="p-workout-meta-item">📋 ${nbEx} ex.</span>
        <span class="p-workout-meta-item">⏱ ~${duration} min</span>
        <span class="p-workout-meta-item p-workout-last">📅 ${lastUsed}</span>
      </div>

      <div class="p-workout-exs">${exPreview}</div>

      <div class="p-workout-footer">
        <button class="p-workout-start" onclick="startPersoSession(${t.id})">▶ Démarrer</button>
        <div class="p-workout-actions">
          <button onclick="openTemplateEditor(${t.id})" class="p-workout-action-btn" title="Modifier">✎</button>
          <button onclick="deletePersoTemplate(${t.id})" class="p-workout-action-btn p-workout-action-danger" title="Supprimer">✕</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function openTemplateEditor(templateId) {
  if (templateId) {
    const t = persoState.templates.find(x => x.id === templateId);
    persoState.tplDraft = { id: t.id, name: t.name, exercise_ids: t.exercises.map(e => e.id), superset_groups: t.exercises.map(e => e.superset_group || null) };
    document.getElementById('perso-tpl-title').textContent = 'Modifier la séance';
  } else {
    persoState.tplDraft = { id: null, name: '', exercise_ids: [], superset_groups: [] };
    document.getElementById('perso-tpl-title').textContent = 'Créer une séance';
  }
  document.getElementById('perso-tpl-id').value = persoState.tplDraft.id || '';
  document.getElementById('perso-tpl-name').value = persoState.tplDraft.name;
  renderTemplateEditorExercises();
  document.getElementById('perso-tpl-overlay').classList.remove('hidden');
}
function closeTemplateEditor() { document.getElementById('perso-tpl-overlay').classList.add('hidden'); }

function renderTemplateEditorExercises() {
  const container = document.getElementById('perso-tpl-exercises');
  const ids = persoState.tplDraft.exercise_ids;
  if (ids.length === 0) {
    container.innerHTML = '<div class="p-empty-sm">Aucun exercice. Ajoute-en ci-dessous.</div>';
    return;
  }
  container.innerHTML = ids.map((eid, idx) => {
    const ex = persoState.exercises.find(x => x.id === eid);
    if (!ex) return '';
    const ssGroup = persoState.tplDraft.superset_groups[idx];
    const ssLabel = ssGroup ? ssGroup.toUpperCase() : '';
    return `<div class="p-tpl-ex-row ${ssGroup ? 'has-superset superset-' + ssGroup : ''}" draggable="true" data-idx="${idx}">
      <span class="p-tpl-drag" title="Glisser pour réordonner">⠿</span>
      ${ssGroup ? `<span class="p-tpl-ss-badge">${ssLabel}</span>` : `<span class="p-tpl-ex-num">${idx + 1}.</span>`}
      <div class="p-tpl-ex-info">
        <span class="p-tpl-ex-name">${escapeHtml(ex.name)}</span>
        <div class="p-tpl-ex-video">
          <input type="url" placeholder="Lien vidéo YouTube..." value="${escapeHtml(ex.video_url || '')}" onchange="updateExerciseVideoUrl(${ex.id}, this.value)" onclick="event.stopPropagation()" />
          ${ex.video_url ? `<a href="${escapeHtml(ex.video_url)}" target="_blank" rel="noopener" class="p-video-link" onclick="event.stopPropagation()" title="Voir la vidéo">▶</a>` : ''}
        </div>
      </div>
      <button type="button" class="btn-icon btn-superset ${ssGroup ? 'active' : ''}" onclick="toggleSuperset(${idx})" title="${ssGroup ? 'Retirer du superset' : 'Lier en superset (agoniste/antagoniste)'}">🔗</button>
      <div class="p-tpl-arrows">
        <button type="button" class="btn-icon btn-arrow" onclick="moveTplExercise(${idx},-1)" ${idx === 0 ? 'disabled' : ''} title="Monter">↑</button>
        <button type="button" class="btn-icon btn-arrow" onclick="moveTplExercise(${idx},1)" ${idx === ids.length - 1 ? 'disabled' : ''} title="Descendre">↓</button>
      </div>
      <button type="button" class="btn-icon btn-danger" onclick="removeTplExercise(${eid})">✕</button>
    </div>`;
  }).join('');

  // Drag & drop
  container.querySelectorAll('.p-tpl-ex-row').forEach(row => {
    row.addEventListener('dragstart', e => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', row.dataset.idx);
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => row.classList.remove('dragging'));
    row.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', e => {
      e.preventDefault();
      row.classList.remove('drag-over');
      const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
      const toIdx = parseInt(row.dataset.idx);
      if (fromIdx !== toIdx) {
        const arr = persoState.tplDraft.exercise_ids;
        const [moved] = arr.splice(fromIdx, 1);
        arr.splice(toIdx, 0, moved);
        renderTemplateEditorExercises();
      }
    });
  });
}

function moveTplExercise(idx, dir) {
  const arr = persoState.tplDraft.exercise_ids;
  const ss = persoState.tplDraft.superset_groups;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= arr.length) return;
  [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
  [ss[idx], ss[newIdx]] = [ss[newIdx], ss[idx]];
  renderTemplateEditorExercises();
}

function toggleSuperset(idx) {
  const ss = persoState.tplDraft.superset_groups;
  if (ss[idx]) {
    // Remove from superset
    const oldGroup = ss[idx];
    ss[idx] = null;
    // If only 1 exercise left in the group, remove it too
    const remaining = ss.filter(g => g === oldGroup);
    if (remaining.length === 1) {
      const lastIdx = ss.indexOf(oldGroup);
      ss[lastIdx] = null;
    }
  } else {
    // Find the next exercise without a group to pair with
    const nextFree = idx < ss.length - 1 && !ss[idx + 1] ? idx + 1 : null;
    if (nextFree !== null) {
      // Create a new group
      const usedGroups = new Set(ss.filter(Boolean));
      const letters = 'abcdefghijklmnopqrstuvwxyz';
      let newGroup = 'a';
      for (const l of letters) { if (!usedGroups.has(l)) { newGroup = l; break; } }
      ss[idx] = newGroup;
      ss[nextFree] = newGroup;
    } else {
      showToast('Place cet exercice à côté d\'un autre exercice libre pour créer un superset', 'info');
    }
  }
  renderTemplateEditorExercises();
}
async function updateExerciseVideoUrl(exId, url) {
  await api(`/perso/exercises/${exId}`, { method: 'PUT', body: { video_url: url.trim() || null } });
  await refreshPersoExercises();
  renderTemplateEditorExercises();
  showToast(url.trim() ? 'Lien vidéo enregistré' : 'Lien vidéo retiré');
}

function removeTplExercise(exId) {
  const idx = persoState.tplDraft.exercise_ids.indexOf(exId);
  if (idx !== -1) {
    persoState.tplDraft.exercise_ids.splice(idx, 1);
    persoState.tplDraft.superset_groups.splice(idx, 1);
  }
  renderTemplateEditorExercises();
}
async function saveTemplate() {
  const name = document.getElementById('perso-tpl-name').value.trim();
  if (!name) return alert('Nom requis');
  const body = { name, exercise_ids: persoState.tplDraft.exercise_ids, superset_groups: persoState.tplDraft.superset_groups };
  if (persoState.tplDraft.id) { await api(`/perso/templates/${persoState.tplDraft.id}`, { method: 'PUT', body }); }
  else { await api('/perso/templates', { method: 'POST', body }); }
  closeTemplateEditor();
  await refreshPersoTemplates();
}
async function deletePersoTemplate(id) {
  if (!confirm('Supprimer ce template ?')) return;
  await api(`/perso/templates/${id}`, { method: 'DELETE' });
  await refreshPersoTemplates();
}
async function togglePersoTemplateFavorite(id) {
  const t = persoState.templates.find(x => x.id === id);
  await api(`/perso/templates/${id}`, { method: 'PUT', body: { favorite: !t.favorite } });
  await refreshPersoTemplates();
}

// ─── Exercises DB ──────────────────────────────────────────

async function refreshPersoExercises() {
  persoState.exercises = await api('/perso/exercises');
  if (document.getElementById('perso-exercises-list')) renderExercisesCatalog();
}

// ─── Exercise Catalog ─────────────────────────────────────

function renderExercisesCatalog(filter = '') {
  const container = document.getElementById('perso-exercises-list');
  if (!container) return;
  const q = filter.toLowerCase().trim();
  const filtered = q ? persoState.exercises.filter(e => e.name.toLowerCase().includes(q) || (e.muscle_group || '').toLowerCase().includes(q) || (e.body_part || '').toLowerCase().includes(q)) : persoState.exercises;

  // Compteur dans le header
  const countEl = document.getElementById('perso-catalog-count');
  if (countEl) countEl.textContent = persoState.exercises.length;

  if (filtered.length === 0) {
    container.innerHTML = `<div class="p-empty-sm">${q ? 'Aucun exercice trouvé.' : 'Aucun exercice. Ajoute-en un !'}</div>`;
    return;
  }

  container.innerHTML = filtered.map(ex => {
    const bodyLabel = ex.body_part === 'lower' ? 'Bas' : 'Haut';
    return `
    <div class="p-ex-line">
      <div class="p-ex-line-main">
        <span class="p-ex-line-name">${escapeHtml(ex.name)}</span>
        ${ex.video_url ? `<a href="${escapeHtml(ex.video_url)}" target="_blank" rel="noopener" class="p-ex-line-video" title="Voir la vidéo">▶</a>` : ''}
      </div>
      <div class="p-ex-line-meta">
        ${ex.muscle_group ? `<span class="p-ex-line-tag">${escapeHtml(ex.muscle_group)}</span>` : `<span class="p-ex-line-tag p-ex-line-tag-muted">${bodyLabel}</span>`}
        <span class="p-ex-line-sets">${ex.target_sets}×${ex.target_reps}</span>
        ${ex.goal_charge ? `<span class="p-ex-line-goal">🎯 ${ex.goal_charge}kg</span>` : ''}
      </div>
      <div class="p-ex-line-actions">
        <button class="p-ex-line-btn" onclick="editExerciseSettings(${ex.id})" title="Modifier">✎</button>
        <button class="p-ex-line-btn p-ex-line-btn-danger" onclick="deleteExercise(${ex.id}, '${escapeHtml(ex.name).replace(/'/g, "\\'")}')" title="Supprimer">✕</button>
      </div>
    </div>`;
  }).join('');
}

async function addNewExercise() {
  const name = prompt('Nom du nouvel exercice :');
  if (!name || !name.trim()) return;
  await api('/perso/exercises', { method: 'POST', body: { name: name.trim() } });
  await refreshPersoExercises();
  showToast(`Exercice "${name.trim()}" ajouté`);
}

async function deleteExercise(id, name) {
  if (!confirm(`Supprimer l'exercice "${name}" ? Ça supprimera aussi toutes les performances associées.`)) return;
  await api(`/perso/exercises/${id}`, { method: 'DELETE' });
  await refreshPersoExercises();
  showToast(`Exercice "${name}" supprimé`);
}

async function renderExerciseAutocomplete(query, containerId, onSelect) {
  const container = document.getElementById(containerId);
  if (!query || query.length < 1) { container.classList.add('hidden'); container.innerHTML = ''; return; }
  const results = await api(`/perso/exercises?q=${encodeURIComponent(query)}`);
  const trimmed = query.trim();
  const exactMatch = results.find(r => r.name.toLowerCase() === trimmed.toLowerCase());
  let html = results.map(r => `<div class="p-autocomplete-item" data-id="${r.id}">${escapeHtml(r.name)}${r.muscle_group ? ` · ${escapeHtml(r.muscle_group)}` : ''}</div>`).join('');
  if (!exactMatch && trimmed) html += `<div class="p-autocomplete-item p-autocomplete-create" data-create="${escapeHtml(trimmed)}">+ Créer "${escapeHtml(trimmed)}"</div>`;
  container.innerHTML = html || '<div class="p-empty-sm">Aucun résultat</div>';
  container.classList.remove('hidden');
  container.querySelectorAll('.p-autocomplete-item').forEach(el => {
    el.addEventListener('mousedown', async (e) => {
      e.preventDefault();
      if (el.dataset.create) {
        const newEx = await api('/perso/exercises', { method: 'POST', body: { name: el.dataset.create } });
        await refreshPersoExercises();
        onSelect(newEx);
      } else {
        const ex = results.find(r => r.id === parseInt(el.dataset.id));
        onSelect(ex);
      }
    });
  });
}

// ─── Session V2 ────────────────────────────────────────────

async function loadPersoSession() {
  const date = persoState.todayDate();
  persoState.currentSession = await api(`/perso/sessions/${date}`);
  renderPersoSession();
  await loadPersoCompletedSessions();
}

async function loadPersoCompletedSessions() {
  const today = new Date();
  const from = new Date(today);
  from.setMonth(from.getMonth() - 6); // last 6 months
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = today.toISOString().slice(0, 10);
  try {
    const sessions = await api(`/perso/sessions/range?from=${fromStr}&to=${toStr}`);
    persoState.completedSessions = sessions.filter(s => s.status === 'completed');
    renderPersoCompletedSessions();
  } catch (e) {
    console.error('Erreur chargement séances terminées:', e);
  }
}

function renderPersoCompletedSessions() {
  const list = document.getElementById('perso-completed-list');
  if (!list) return;
  const sessions = persoState.completedSessions || [];
  if (sessions.length === 0) {
    list.innerHTML = '<div class="p-empty">Aucune séance terminée pour le moment.</div>';
    return;
  }
  // Sort by date desc
  const sorted = [...sessions].sort((a, b) => b.date.localeCompare(a.date));
  list.innerHTML = sorted.map(s => {
    const total = sessionTotalKg(s);
    const sessionName = s.name || 'Séance';
    const dateObj = new Date(s.date + 'T00:00:00');
    const dateLabel = dateObj.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
    const exsCount = (s.performances || []).length;
    return `
      <div class="p-completed-bubble" onclick="openCompletedSession(${s.id})">
        <div class="p-completed-bubble-head">
          <span class="p-completed-bubble-name">${escapeHtml(sessionName)}</span>
          <span class="p-completed-bubble-badge">✓ Terminée</span>
        </div>
        <div class="p-completed-bubble-meta">
          <span class="p-completed-bubble-date">📅 ${dateLabel}</span>
          <span class="p-completed-bubble-total">💪 ${total.toLocaleString('fr-FR')} kg</span>
          ${exsCount > 0 ? `<span class="p-completed-bubble-exs">${exsCount} ex.</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

async function openCompletedSession(sessionId) {
  const s = (persoState.completedSessions || []).find(x => x.id === sessionId);
  if (!s) return;
  // Show the same recap modal in read-only mode
  showSessionRecap(s);
}

function showSessionRecap(s) {
  const total = sessionTotalKg(s);
  const totalSets = sessionTotalSets(s);
  const totalReps = sessionTotalReps(s);
  const sessionName = s.name || 'Séance';

  let durationStr = '';
  if (s.started_at && s.ended_at) {
    const start = new Date(s.started_at.replace(' ', 'T'));
    const end = new Date(s.ended_at.replace(' ', 'T'));
    const diffMin = Math.round((end - start) / 60000);
    if (diffMin > 0) {
      const h = Math.floor(diffMin / 60);
      const m = diffMin % 60;
      durationStr = h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
    }
  }

  const dateLabel = new Date(s.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const overlay = document.getElementById('perso-recap-overlay');
  document.getElementById('perso-recap-title').textContent = `${sessionName} — ${dateLabel}`;
  document.getElementById('perso-recap-total').textContent = total.toLocaleString('fr-FR') + ' kg';
  document.getElementById('perso-recap-exs-count').textContent = (s.performances || []).length;
  document.getElementById('perso-recap-sets').textContent = totalSets;
  document.getElementById('perso-recap-reps').textContent = totalReps;

  const list = document.getElementById('perso-recap-list');
  list.innerHTML = `
    ${durationStr ? `<div class="p-badge p-badge-blue" style="margin-bottom:8px;">Durée : ${durationStr}</div>` : ''}
    ${(s.performances || []).map(p => {
      const sets = (p.set_logs || []).filter(sl => !sl.is_warmup && sl.completed);
      const sub = sets.reduce((t, sl) => t + (sl.weight_kg || 0) * (sl.reps || 0), 0);
      const feelIcon = { facile: '😊', moyen: '😐', dur: '😓' }[p.feeling] || '';
      const detailTxt = sets.map((sl, i) => `S${i + 1}: ${sl.weight_kg || 0}kg×${sl.reps || 0}`).join(' · ');
      return `
        <div class="p-progress-row">
          <span class="p-progress-date">${escapeHtml(p.exercise_name)} ${feelIcon}</span>
          <span class="p-progress-sets">${detailTxt || '<em style="color:var(--p-text2)">Pas de séries enregistrées</em>'}</span>
          <span class="p-progress-tonnage">${sub.toLocaleString('fr-FR')} kg</span>
        </div>
      `;
    }).join('') || '<div class="p-empty">Aucun exercice enregistré</div>'}
  `;
  overlay.classList.remove('hidden');
}

async function startPersoSession(templateId) {
  const date = persoState.todayDate();
  if (persoState.currentSession) {
    if (!confirm('Une séance existe déjà. La remplacer ?')) return;
    await api(`/perso/sessions/${persoState.currentSession.id}`, { method: 'DELETE' });
  }
  await api('/perso/sessions', { method: 'POST', body: { date, template_id: templateId } });
  await loadPersoSession();
  setTimeout(() => {
    const el = document.getElementById('perso-session-container');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

function sessionTotalKg(s) {
  if (!s || !s.performances) return 0;
  return s.performances.reduce((sum, p) => {
    return sum + (p.set_logs || [])
      .filter(sl => !sl.is_warmup && sl.completed)
      .reduce((t, sl) => t + (sl.weight_kg || 0) * (sl.reps || 0), 0);
  }, 0);
}

function sessionTotalSets(s) {
  if (!s || !s.performances) return 0;
  return s.performances.reduce((n, p) => n + (p.set_logs || []).filter(sl => !sl.is_warmup && sl.completed).length, 0);
}

function sessionTotalReps(s) {
  if (!s || !s.performances) return 0;
  return s.performances.reduce((n, p) => n + (p.set_logs || []).filter(sl => !sl.is_warmup && sl.completed).reduce((r, sl) => r + (sl.reps || 0), 0), 0);
}

// Estime la durée d'une séance (minutes) à partir des exercices
function estimatePersoSessionDuration(performances) {
  if (!performances || performances.length === 0) return 0;
  let totalSec = 0;
  performances.forEach(p => {
    const sets = p.ex_target_sets || 3;
    const rest = p.default_rest_seconds || 90;
    totalSec += sets * (45 + rest); // 45s d'effort + repos par série
  });
  return Math.max(5, Math.round(totalSec / 60));
}

// Détermine le focus musculaire d'une séance
function persoSessionFocus(performances) {
  if (!performances || performances.length === 0) return '—';
  const groups = [...new Set(performances.map(p => (p.muscle_group || '').trim()).filter(Boolean))];
  if (groups.length > 0) return groups.slice(0, 3).join(' · ');
  const partLabels = { upper: 'Haut du corps', lower: 'Bas du corps', core: 'Gainage', full: 'Corps entier' };
  const parts = [...new Set(performances.map(p => p.body_part).filter(Boolean))];
  return parts.map(pt => partLabels[pt] || pt).join(' · ') || 'Séance complète';
}

function renderPersoSession() {
  const container = document.getElementById('perso-session-container');
  const s = persoState.currentSession;
  if (!s) {
    // État vide compact + recommandation intelligente
    const reco = persoRecommendation;
    let recoLine, primaryLabel;
    if (reco && reco.lastType && reco.recoType) {
      recoLine = `Ta dernière séance était <strong>${escapeHtml(reco.lastType)}</strong>. Aujourd'hui, on te recommande <strong>${escapeHtml(reco.recoType)}</strong>.`;
      primaryLabel = `▶ Démarrer ${escapeHtml(reco.recoType)}`;
    } else if (reco && reco.recoType) {
      recoLine = `Prêt à t'entraîner ? On te recommande de commencer par <strong>${escapeHtml(reco.recoType)}</strong>.`;
      primaryLabel = `▶ Démarrer ${escapeHtml(reco.recoType)}`;
    } else {
      recoLine = `Aucune séance prévue. Lance ta première séance pour démarrer ta progression.`;
      primaryLabel = '▶ Démarrer ma séance';
    }
    container.innerHTML = `
      <div class="p-hero-empty">
        <p class="p-hero-reco">${recoLine}</p>
        <div class="p-hero-actions">
          <button type="button" id="perso-btn-start-reco" class="p-hero-cta">${primaryLabel}</button>
          <button type="button" id="perso-btn-choose-template" class="p-hero-cta-secondary">Choisir une autre séance</button>
        </div>
      </div>
    `;
    const startBtn = document.getElementById('perso-btn-start-reco');
    if (startBtn) startBtn.addEventListener('click', () => {
      // Démarre le template recommandé s'il existe, sinon séance libre
      const tplId = persoRecommendation && persoRecommendation.templateId;
      startPersoSession(tplId || null);
    });
    const chooseBtn = document.getElementById('perso-btn-choose-template');
    if (chooseBtn) chooseBtn.addEventListener('click', () => {
      const tplCard = document.getElementById('perso-card-templates');
      if (tplCard) tplCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return;
  }

  const sessionName = s.name || (s.template_id ? (persoState.templates.find(t => t.id === s.template_id)?.name || 'Séance') : 'Séance libre');
  const lowEnergy = s.energy_level && s.energy_level <= 2;
  const perfs = s.performances || [];
  const nbExs = perfs.length;
  const duration = estimatePersoSessionDuration(perfs);
  const focus = persoSessionFocus(perfs);
  const isCompleted = s.status === 'completed';

  container.innerHTML = `
    <div class="p-hero-session">
      <div class="p-hero-session-top">
        <div>
          <span class="p-hero-session-label">${isCompleted ? '✓ Séance terminée' : '▶ Séance en cours'}</span>
          <h3 class="p-hero-session-name">${escapeHtml(sessionName)}</h3>
        </div>
        <button class="btn-icon btn-danger" onclick="deleteCurrentPersoSession()" title="Supprimer la séance">✕</button>
      </div>
      <div class="p-hero-stats">
        <div class="p-hero-stat">
          <span class="p-hero-stat-icon">📋</span>
          <span class="p-hero-stat-value">${nbExs}</span>
          <span class="p-hero-stat-label">exercice${nbExs > 1 ? 's' : ''}</span>
        </div>
        <div class="p-hero-stat">
          <span class="p-hero-stat-icon">⏱</span>
          <span class="p-hero-stat-value">~${duration}</span>
          <span class="p-hero-stat-label">minutes</span>
        </div>
        <div class="p-hero-stat p-hero-stat-wide">
          <span class="p-hero-stat-icon">🎯</span>
          <span class="p-hero-stat-value p-hero-stat-focus">${escapeHtml(focus)}</span>
          <span class="p-hero-stat-label">objectif</span>
        </div>
      </div>
    </div>
    ${lowEnergy ? '<div class="p-low-energy-banner">Énergie basse — suggestions conservatrices (-5% charge)</div>' : ''}
    <div id="perso-rest-timer-bar" class="p-rest-bar hidden"></div>
    <div id="perso-session-exs">
      ${renderSessionExercises(perfs)}
    </div>
    <div class="p-session-add">
      <input type="text" id="perso-add-ex-input" placeholder="Ajouter un exercice..." autocomplete="off">
      <div id="perso-add-ex-autocomplete" class="p-autocomplete hidden"></div>
    </div>
    <div class="p-session-footer">
      <div class="p-session-total">
        <span class="p-total-label">Total soulevé</span>
        <strong id="perso-total-value">${sessionTotalKg(s).toLocaleString('fr-FR')} kg</strong>
      </div>
      <button class="btn-primary p-end-btn" onclick="finishSession()">Terminer la séance</button>
    </div>
  `;

  // Bind add exercise
  const addInp = document.getElementById('perso-add-ex-input');
  addInp.addEventListener('input', () => renderExerciseAutocomplete(addInp.value, 'perso-add-ex-autocomplete', async (ex) => {
    await api(`/perso/sessions/${s.id}/performances`, { method: 'POST', body: { exercise_id: ex.id, date: persoState.todayDate() } });
    addInp.value = '';
    document.getElementById('perso-add-ex-autocomplete').classList.add('hidden');
    await loadPersoSession();
  }));
  addInp.addEventListener('blur', () => setTimeout(() => document.getElementById('perso-add-ex-autocomplete')?.classList.add('hidden'), 200));
}

// ─── Render a single exercise row with set_logs ─────────────

function renderSessionExercises(performances) {
  let html = '';
  let i = 0;
  while (i < performances.length) {
    const p = performances[i];
    if (p.superset_group) {
      const group = p.superset_group;
      const groupPerfs = [];
      while (i < performances.length && performances[i].superset_group === group) {
        groupPerfs.push(performances[i]);
        i++;
      }
      html += renderSupersetBlock(group, groupPerfs);
    } else {
      html += renderPerfRowV2(p);
      i++;
    }
  }
  return html;
}

function renderSupersetBlock(group, perfs) {
  // Find max sets across exercises in this superset
  const maxSets = Math.max(...perfs.map(p => (p.set_logs || []).filter(sl => !sl.is_warmup).length));

  // Header row with exercise names
  const headers = perfs.map(p => {
    const sets = (p.set_logs || []).filter(sl => !sl.is_warmup);
    const completedSets = sets.filter(sl => sl.completed).length;
    const maxW = sets.reduce((m, sl) => Math.max(m, sl.weight_kg || 0), 0);
    const goalReached = p.goal_charge && maxW >= p.goal_charge;
    return `<div class="ss-col-header">
      <strong>${escapeHtml(p.exercise_name)}</strong>
      ${p.video_url ? `<a href="${escapeHtml(p.video_url)}" target="_blank" rel="noopener" class="p-video-link" title="Vidéo">▶</a>` : ''}
      ${p.muscle_group ? `<span class="p-chip">${escapeHtml(p.muscle_group)}</span>` : ''}
      <span class="p-set-progress">${completedSets}/${sets.length}</span>
      <div class="ss-col-actions">
        <button class="btn-icon" onclick="openExerciseProgress(${p.exercise_id})" title="Progression">📈</button>
        <button class="btn-icon" onclick="editExerciseSettings(${p.exercise_id})" title="Paramètres">⚙</button>
      </div>
    </div>`;
  }).join('');

  // Interleaved set rows
  let rows = '';
  for (let s = 0; s < maxSets; s++) {
    const cols = perfs.map(p => {
      const sets = (p.set_logs || []).filter(sl => !sl.is_warmup);
      const sl = sets[s];
      if (!sl) return `<div class="ss-cell ss-cell-empty">—</div>`;
      const doneClass = sl.completed ? 'is-done' : '';
      const prBadge = sl.is_pr ? '<span class="p-pr-badge">🏆 PR</span>' : '';
      return `<div class="ss-cell ${doneClass}">
        <div class="ss-cell-inputs">
          <input type="number" step="0.5" value="${sl.weight_kg || ''}" placeholder="kg" class="ss-inp-kg"
                 onchange="updateSetLog(${sl.id}, 'weight_kg', this.value)">
          <span class="ss-x">×</span>
          <input type="number" value="${sl.reps || ''}" placeholder="reps" class="ss-inp-reps"
                 onchange="updateSetLog(${sl.id}, 'reps', this.value)">
        </div>
        <button type="button" class="p-set-done ${sl.completed ? 'active' : ''}" onclick="toggleSetDone(${p.id}, ${sl.id})" title="Valider">✓</button>
        ${prBadge}
      </div>`;
    }).join('');

    rows += `<div class="ss-round">
      <span class="ss-round-num">S${s + 1}</span>
      <div class="ss-round-cols">${cols}</div>
    </div>`;
  }

  // Footer: add set buttons + feeling
  const footer = perfs.map(p => {
    const tonnage = (p.set_logs || []).filter(sl => !sl.is_warmup && sl.completed).reduce((t, sl) => t + (sl.weight_kg || 0) * (sl.reps || 0), 0);
    return `<div class="ss-col-footer">
      <button type="button" class="p-add-set" onclick="addSetLog(${p.id})">+ Série</button>
      <span class="p-tonnage">Tonnage : ${tonnage} kg</span>
    </div>`;
  }).join('');

  return `<div class="p-superset-block" data-group="${group}">
    <div class="p-superset-label">🔗 Superset ${group.toUpperCase()}</div>
    <div class="ss-headers">${headers}</div>
    <div class="ss-rounds">${rows}</div>
    <div class="ss-footers">${footer}</div>
  </div>`;
}

function renderPerfRowV2(p) {
  const sets = p.set_logs || [];
  const suggestion = p.suggestion;
  const completedSets = sets.filter(sl => sl.completed && !sl.is_warmup).length;
  const totalSets = sets.filter(sl => !sl.is_warmup).length;
  const tonnage = sets.filter(sl => !sl.is_warmup && sl.completed).reduce((s, sl) => s + (sl.weight_kg || 0) * (sl.reps || 0), 0);
  const maxW = sets.reduce((m, sl) => Math.max(m, sl.weight_kg || 0), 0);
  const goalReached = p.goal_charge && maxW >= p.goal_charge;

  return `
    <div class="p-perf-row" data-perf="${p.id}" data-exercise="${p.exercise_id}">
      <div class="p-perf-head">
        <div class="p-perf-name">
          <strong>${escapeHtml(p.exercise_name)}</strong>
          ${p.video_url ? `<a href="${escapeHtml(p.video_url)}" target="_blank" rel="noopener" class="p-video-link" title="Voir la vidéo">▶</a>` : ''}
          ${p.muscle_group ? `<span class="p-chip">${escapeHtml(p.muscle_group)}</span>` : ''}
          ${p.goal_charge ? `<span class="p-goal-chip ${goalReached ? 'is-reached' : ''}">🎯 ${p.goal_charge} kg${goalReached ? ' ✓' : ''}</span>` : ''}
          <span class="p-set-progress">${completedSets}/${totalSets}</span>
        </div>
        <div class="p-perf-actions">
          <button class="btn-icon" onclick="openExerciseProgress(${p.exercise_id})" title="Progression">📈</button>
          <button class="btn-icon" onclick="editExerciseSettings(${p.exercise_id})" title="Paramètres">⚙</button>
          <button class="btn-icon btn-danger" onclick="deletePerf(${p.id})" title="Supprimer">✕</button>
        </div>
      </div>
      ${suggestion ? `
        <div class="p-suggestion">
          <span class="p-suggestion-last">Dernière fois (${formatDateShort(suggestion.lastDate)}) : ${suggestion.lastSets.map(s => `${s.weight_kg}×${s.reps}`).join(', ')}</span>
          <span class="p-suggestion-msg">${escapeHtml(suggestion.message)}</span>
        </div>
      ` : ''}
      <div class="p-set-logs">
        ${sets.map(sl => renderSetLogRow(p, sl)).join('')}
        <button type="button" class="p-add-set" onclick="addSetLog(${p.id})">+ Série</button>
      </div>
      <div class="p-perf-footer">
        <label>Ressenti</label>
        <div class="p-feeling-btns">
          <button type="button" class="${p.feeling === 'facile' ? 'active' : ''}" onclick="updatePerfFeeling(${p.id}, 'facile')">😊</button>
          <button type="button" class="${p.feeling === 'moyen' ? 'active' : ''}" onclick="updatePerfFeeling(${p.id}, 'moyen')">😐</button>
          <button type="button" class="${p.feeling === 'dur' ? 'active' : ''}" onclick="updatePerfFeeling(${p.id}, 'dur')">😓</button>
        </div>
      </div>
      ${tonnage > 0 ? `<div class="p-tonnage">Tonnage : ${tonnage.toLocaleString('fr-FR')} kg</div>` : ''}
    </div>
  `;
}

function renderSetLogRow(perf, sl) {
  const doneClass = sl.completed ? 'is-done' : '';
  const warmupClass = sl.is_warmup ? 'is-warmup' : '';
  const prBadge = sl.is_pr ? '<span class="p-pr-badge">🏆 PR</span>' : '';
  return `
    <div class="p-set-row ${doneClass} ${warmupClass}" data-set="${sl.id}">
      <span class="p-set-num">${sl.is_warmup ? 'W' : `S${sl.set_number}`}</span>
      <div class="p-set-inp">
        <input type="number" step="0.5" value="${sl.weight_kg || ''}" placeholder="kg"
               onchange="updateSetLog(${sl.id}, 'weight_kg', this.value)" ${sl.completed ? '' : ''}>
        <span class="p-set-unit">kg</span>
      </div>
      <span class="p-set-x">×</span>
      <div class="p-set-inp">
        <input type="number" value="${sl.reps || ''}" placeholder="reps"
               onchange="updateSetLog(${sl.id}, 'reps', this.value)">
        <span class="p-set-unit">reps</span>
      </div>
      <button type="button" class="p-set-done ${sl.completed ? 'active' : ''}" onclick="toggleSetDone(${perf.id}, ${sl.id})" title="Valider">✓</button>
      ${prBadge}
      <button type="button" class="btn-icon btn-xs btn-danger" onclick="deleteSetLog(${perf.id}, ${sl.id})" title="Suppr">✕</button>
    </div>
  `;
}

// ─── Set Log interactions ──────────────────────────────────

let _setLogDebounce = {};
async function updateSetLog(id, field, value) {
  clearTimeout(_setLogDebounce[id + field]);
  _setLogDebounce[id + field] = setTimeout(async () => {
    const body = {};
    body[field] = parseFloat(value) || 0;
    await api(`/perso/set-logs/${id}`, { method: 'PUT', body });
    // Update in-memory
    for (const p of (persoState.currentSession?.performances || [])) {
      const sl = (p.set_logs || []).find(s => s.id === id);
      if (sl) { sl[field] = body[field]; break; }
    }
    updateTotalDisplay();
  }, 400);
}

async function toggleSetDone(perfId, setId) {
  const p = persoState.currentSession?.performances?.find(x => x.id === perfId);
  if (!p) return;
  const sl = (p.set_logs || []).find(s => s.id === setId);
  if (!sl) return;
  const newVal = !sl.completed;
  const res = await api(`/perso/set-logs/${setId}`, { method: 'PUT', body: { completed: newVal } });
  sl.completed = newVal;

  // Update UI for this set row
  const rowEl = document.querySelector(`.p-set-row[data-set="${setId}"]`);
  if (rowEl) {
    rowEl.classList.toggle('is-done', newVal);
    rowEl.querySelector('.p-set-done')?.classList.toggle('active', newVal);
  }

  // PR check
  if (newVal && res.prs && res.prs.length > 0) {
    sl.is_pr = true;
    showPRNotification(res.prs, p.exercise_name);
    if (rowEl && !rowEl.querySelector('.p-pr-badge')) {
      rowEl.querySelector('.p-set-done').insertAdjacentHTML('afterend', '<span class="p-pr-badge p-pr-animate">🏆 PR</span>');
    }
  }

  updateTotalDisplay();
  updateSetProgress(perfId);

  // Start rest timer if set completed (not last set of last exercise)
  if (newVal && !sl.is_warmup) {
    const restSec = p.default_rest_seconds || 120;
    startRestTimer(restSec, perfId, sl.set_number);
  }
}

function updateSetProgress(perfId) {
  const p = persoState.currentSession?.performances?.find(x => x.id === perfId);
  if (!p) return;
  const sets = p.set_logs || [];
  const done = sets.filter(s => s.completed && !s.is_warmup).length;
  const total = sets.filter(s => !s.is_warmup).length;
  const el = document.querySelector(`.p-perf-row[data-perf="${perfId}"] .p-set-progress`);
  if (el) el.textContent = `${done}/${total}`;
  // Tonnage
  const tonnage = sets.filter(s => !s.is_warmup && s.completed).reduce((t, s) => t + (s.weight_kg || 0) * (s.reps || 0), 0);
  const tEl = document.querySelector(`.p-perf-row[data-perf="${perfId}"] .p-tonnage`);
  if (tEl) tEl.textContent = `Tonnage : ${tonnage.toLocaleString('fr-FR')} kg`;
}

async function addSetLog(perfId) {
  const p = persoState.currentSession?.performances?.find(x => x.id === perfId);
  if (!p) return;
  const lastSet = (p.set_logs || []).slice(-1)[0];
  const res = await api(`/perso/performances/${perfId}/sets`, { method: 'POST', body: { weight_kg: lastSet?.weight_kg || 0, reps: lastSet?.reps || 0 } });
  await loadPersoSession(); // reload for simplicity
}

async function deleteSetLog(perfId, setId) {
  await api(`/perso/set-logs/${setId}`, { method: 'DELETE' });
  const p = persoState.currentSession?.performances?.find(x => x.id === perfId);
  if (p) p.set_logs = (p.set_logs || []).filter(s => s.id !== setId);
  const rowEl = document.querySelector(`.p-set-row[data-set="${setId}"]`);
  if (rowEl) rowEl.remove();
  updateTotalDisplay();
  updateSetProgress(perfId);
}

async function updatePerfFeeling(id, feeling) {
  await api(`/perso/performances/${id}`, { method: 'PUT', body: { feeling } });
  const p = persoState.currentSession?.performances?.find(x => x.id === id);
  if (p) p.feeling = feeling;
  const row = document.querySelector(`.p-perf-row[data-perf="${id}"]`);
  if (row) row.querySelectorAll('.p-feeling-btns button').forEach(b => {
    b.classList.toggle('active', b.textContent.trim() === ({ facile: '😊', moyen: '😐', dur: '😓' })[feeling]);
  });
}

function updateTotalDisplay() {
  const el = document.getElementById('perso-total-value');
  if (el) el.textContent = sessionTotalKg(persoState.currentSession).toLocaleString('fr-FR') + ' kg';
}

async function deletePerf(id) {
  if (!confirm('Supprimer cet exercice de la séance ?')) return;
  await api(`/perso/performances/${id}`, { method: 'DELETE' });
  await loadPersoSession();
}

async function deleteCurrentPersoSession() {
  if (!persoState.currentSession) return;
  if (!confirm('Supprimer toute la séance ?')) return;
  stopRestTimer();
  await api(`/perso/sessions/${persoState.currentSession.id}`, { method: 'DELETE' });
  await loadPersoSession();
}

// ─── Exercise settings modal ───────────────────────────────

function editExerciseSettings(exId) {
  const ex = persoState.exercises.find(x => x.id === exId);
  if (!ex) return;

  // Build modal dynamically
  let overlay = document.getElementById('perso-ex-settings-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'perso-ex-settings-overlay';
    overlay.className = 'modal-overlay hidden';
    overlay.innerHTML = `<div class="modal"><h2 id="perso-ex-settings-title">Paramètres</h2>
      <form id="perso-ex-settings-form">
        <div class="form-row"><label>Groupe musculaire</label><input type="text" id="pex-group" placeholder="Pectoraux, Dos, Jambes..."></div>
        <div class="form-row"><label>Partie du corps</label><select id="pex-bp"><option value="upper">Haut du corps</option><option value="lower">Bas du corps</option></select></div>
        <div class="form-row"><label>Séries cibles</label><input type="number" id="pex-sets" min="1" max="20" value="3"></div>
        <div class="form-row"><label>Reps cibles</label><input type="number" id="pex-reps" min="1" max="100" value="10"></div>
        <div class="form-row"><label>Repos (secondes)</label><input type="number" id="pex-rest" min="0" max="600" value="120"></div>
        <div class="form-row"><label>Objectif charge (kg)</label><input type="number" id="pex-goal" step="0.5" placeholder="Optionnel"></div>
        <div class="form-row"><label>Lien vidéo</label><input type="url" id="pex-video" placeholder="https://youtube.com/..."></div>
        <div class="form-actions">
          <button type="submit" class="btn-primary">Enregistrer</button>
          <button type="button" id="pex-cancel" class="btn-secondary">Annuler</button>
        </div>
      </form></div>`;
    document.body.appendChild(overlay);
    document.getElementById('pex-cancel').addEventListener('click', () => overlay.classList.add('hidden'));
    document.getElementById('perso-ex-settings-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = overlay.dataset.exId;
      await api(`/perso/exercises/${id}`, { method: 'PUT', body: {
        muscle_group: document.getElementById('pex-group').value.trim(),
        body_part: document.getElementById('pex-bp').value,
        target_sets: parseInt(document.getElementById('pex-sets').value) || 3,
        target_reps: parseInt(document.getElementById('pex-reps').value) || 10,
        default_rest_seconds: parseInt(document.getElementById('pex-rest').value) || 120,
        goal_charge: document.getElementById('pex-goal').value.trim() === '' ? null : parseFloat(document.getElementById('pex-goal').value),
        video_url: document.getElementById('pex-video').value.trim() || null
      }});
      overlay.classList.add('hidden');
      await refreshPersoExercises();
      if (persoState.currentSession) await loadPersoSession();
      showToast('Exercice mis à jour');
    });
  }

  // Fill form with current values
  overlay.dataset.exId = exId;
  document.getElementById('perso-ex-settings-title').textContent = `⚙ ${ex.name}`;
  document.getElementById('pex-group').value = ex.muscle_group || '';
  document.getElementById('pex-bp').value = ex.body_part || 'upper';
  document.getElementById('pex-sets').value = ex.target_sets || 3;
  document.getElementById('pex-reps').value = ex.target_reps || 10;
  document.getElementById('pex-rest').value = ex.default_rest_seconds || 120;
  document.getElementById('pex-goal').value = ex.goal_charge || '';
  document.getElementById('pex-video').value = ex.video_url || '';
  overlay.classList.remove('hidden');
}

// ─── Rest Timer (Feature 3) ────────────────────────────────

function startRestTimer(seconds, perfId, setNum) {
  stopRestTimer();
  const total = seconds;
  let remaining = seconds;
  const bar = document.getElementById('perso-rest-timer-bar');
  if (!bar) return;
  bar.classList.remove('hidden');

  function updateBar() {
    const pct = Math.max(0, remaining / total * 100);
    const mins = Math.floor(Math.abs(remaining) / 60);
    const secs = Math.abs(remaining) % 60;
    const timeStr = `${remaining < 0 ? '+' : ''}${mins}:${String(secs).padStart(2, '0')}`;
    const isOvertime = remaining < 0;
    bar.innerHTML = `
      <div class="p-rest-info ${isOvertime ? 'is-overtime' : ''}">
        <div class="p-rest-progress" style="width: ${isOvertime ? 100 : pct}%">
          <div class="p-rest-fill"></div>
        </div>
        <div class="p-rest-time">${timeStr} / ${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}</div>
        <div class="p-rest-actions">
          <button onclick="adjustRestTimer(-15)">-15s</button>
          <button class="p-rest-skip" onclick="stopRestTimer()">Passer</button>
          <button onclick="adjustRestTimer(15)">+15s</button>
        </div>
      </div>
    `;
  }

  updateBar();
  persoState.restTimer = {
    interval: setInterval(() => {
      remaining--;
      updateBar();
      if (remaining === 0) {
        // Beep + vibrate
        playBeep();
        if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
      }
    }, 1000),
    remaining: () => remaining,
    adjustRemaining: (delta) => { remaining += delta; },
    total,
    perfId,
    setNum
  };
}

function adjustRestTimer(delta) {
  if (persoState.restTimer) persoState.restTimer.adjustRemaining(delta);
}

function stopRestTimer() {
  if (persoState.restTimer) {
    clearInterval(persoState.restTimer.interval);
    persoState.restTimer = null;
  }
  const bar = document.getElementById('perso-rest-timer-bar');
  if (bar) { bar.classList.add('hidden'); bar.innerHTML = ''; }
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 440;
    gain.gain.value = 0.3;
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch (e) { /* no audio */ }
}

// ─── PR Notification (Feature 2) ───────────────────────────

function showPRNotification(prs, exerciseName) {
  if (navigator.vibrate) navigator.vibrate(50);
  const labels = {
    max_weight: 'Charge max',
    estimated_1rm: '1RM estimé',
    max_volume_set: 'Meilleur set (volume)',
    max_total_tonnage: 'Tonnage séance'
  };
  const msg = prs.map(pr => {
    const diff = pr.prev ? ` (+${Math.round((pr.value - pr.prev) * 10) / 10})` : '';
    return `🏆 ${labels[pr.type] || pr.type} : ${pr.value} ${pr.unit}${diff}`;
  }).join('\n');

  // Show floating toast
  const toast = document.createElement('div');
  toast.className = 'p-pr-toast';
  toast.innerHTML = `<strong>Nouveau record ! — ${escapeHtml(exerciseName)}</strong><br>${escapeHtml(msg)}`;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 4000);
}

// ─── Finish Session (Recap) ────────────────────────────────

async function finishSession() {
  const s = persoState.currentSession;
  if (!s) return;

  // Mark session as completed
  await api(`/perso/sessions/${s.id}`, { method: 'PUT', body: { status: 'completed' } });
  stopRestTimer();

  const total = sessionTotalKg(s);
  const totalSets = sessionTotalSets(s);
  const totalReps = sessionTotalReps(s);
  const sessionName = s.name || 'Séance';

  // Duration
  let durationStr = '';
  if (s.started_at) {
    const start = new Date(s.started_at.replace(' ', 'T'));
    const end = new Date();
    const diffMin = Math.round((end - start) / 60000);
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    durationStr = h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
  }

  // Collect PRs from set_logs
  const prSets = [];
  (s.performances || []).forEach(p => {
    (p.set_logs || []).forEach(sl => {
      if (sl.is_pr) prSets.push({ exercise: p.exercise_name, set: sl });
    });
  });

  const overlay = document.getElementById('perso-recap-overlay');
  document.getElementById('perso-recap-title').textContent = `Récap — ${sessionName}`;
  document.getElementById('perso-recap-total').textContent = total.toLocaleString('fr-FR') + ' kg';
  document.getElementById('perso-recap-exs-count').textContent = (s.performances || []).length;
  document.getElementById('perso-recap-sets').textContent = totalSets;
  document.getElementById('perso-recap-reps').textContent = totalReps;

  const list = document.getElementById('perso-recap-list');
  list.innerHTML = `
    ${durationStr ? `<div class="p-badge p-badge-blue" style="margin-bottom:8px;">Durée : ${durationStr}</div>` : ''}
    ${prSets.length > 0 ? `<div style="margin-bottom:8px;"><strong style="color:var(--p-orange);">Records battus :</strong><br>${prSets.map(pr => `🏆 ${escapeHtml(pr.exercise)} — ${pr.set.weight_kg}kg×${pr.set.reps}`).join('<br>')}</div>` : ''}
    ${(s.performances || []).map(p => {
      const sets = (p.set_logs || []).filter(sl => !sl.is_warmup && sl.completed);
      const sub = sets.reduce((t, sl) => t + (sl.weight_kg || 0) * (sl.reps || 0), 0);
      const feelIcon = { facile: '😊', moyen: '😐', dur: '😓' }[p.feeling] || '';
      const detailTxt = sets.map((sl, i) => `S${i + 1}: ${sl.weight_kg || 0}kg×${sl.reps || 0}`).join(' · ');
      return `
        <div class="p-progress-row">
          <span class="p-progress-date">${escapeHtml(p.exercise_name)} ${feelIcon}</span>
          <span class="p-progress-sets">${detailTxt}</span>
          <span class="p-progress-tonnage">${sub.toLocaleString('fr-FR')} kg</span>
        </div>
      `;
    }).join('')}
  `;

  overlay.classList.remove('hidden');
  // Reload so UI shows "Terminée"
  await loadPersoSession();
}

function closeSessionRecap() {
  document.getElementById('perso-recap-overlay').classList.add('hidden');
}

// ─── Progression V2 (Feature 4) ────────────────────────────

async function openExerciseProgress(exerciseId) {
  const [ex, history] = await Promise.all([
    api(`/perso/exercises/${exerciseId}`),
    api(`/perso/exercises/${exerciseId}/history?period=3m`)
  ]);

  document.getElementById('perso-progress-title').textContent = `Progression — ${ex.name}`;

  // Records
  const stats = document.getElementById('perso-progress-stats');
  const records = ex.records || [];
  const recLabels = { max_weight: 'Charge max', estimated_1rm: '1RM estimé', max_volume_set: 'Meilleur set', max_total_tonnage: 'Tonnage max' };
  if (records.length > 0) {
    stats.innerHTML = records.map(r => `
      <div class="p-progress-stat"><span class="p-label">🏆 ${recLabels[r.record_type] || r.record_type}</span><strong>${r.value} ${r.unit}</strong></div>
    `).join('');
  } else {
    const lastTxt = ex.last && ex.last.sets.length ? ex.last.sets.map(s => `${s.weight_kg}×${s.reps}`).join(', ') : '—';
    stats.innerHTML = `<div class="p-progress-stat"><span class="p-label">Dernière</span><strong>${lastTxt}</strong></div>
      <div class="p-progress-stat"><span class="p-label">Objectif</span><strong>${ex.goal_charge ? ex.goal_charge + ' kg' : '—'}</strong></div>`;
  }

  document.getElementById('perso-progress-overlay').classList.remove('hidden');

  // Chart with 3 datasets
  setTimeout(() => {
    const ctx = document.getElementById('perso-progress-chart').getContext('2d');
    if (persoState.progressChart) persoState.progressChart.destroy();
    persoState.progressChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: history.map(h => new Date(h.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })),
        datasets: [
          {
            label: 'Charge max (kg)',
            data: history.map(h => h.maxWeight || null),
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99,102,241,0.1)',
            tension: 0.3, fill: false, pointRadius: 4
          },
          {
            label: '1RM estimé (kg)',
            data: history.map(h => h.estimated1RM || null),
            borderColor: '#f59e0b',
            borderDash: [5, 5],
            tension: 0.3, fill: false, pointRadius: 3
          },
          {
            label: 'Volume (kg)',
            data: history.map(h => h.totalVolume || null),
            borderColor: '#10b981',
            tension: 0.3, fill: false, pointRadius: 3,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#e5e7eb' } }, tooltip: {
          callbacks: {
            afterLabel: (ctx) => {
              const h = history[ctx.dataIndex];
              if (h && h.sets) {
                const prSets = h.sets.filter(s => s.is_pr);
                if (prSets.length > 0) return '🏆 PR !';
              }
              return '';
            }
          }
        }},
        scales: {
          x: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { position: 'left', ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' }, title: { display: true, text: 'kg', color: '#9ca3af' } },
          y1: { position: 'right', ticks: { color: '#10b981' }, grid: { display: false }, title: { display: true, text: 'Volume (kg)', color: '#10b981' } }
        }
      }
    });
  }, 50);

  // History list
  const hist = document.getElementById('perso-progress-history');
  if (history.length === 0) {
    hist.innerHTML = '<div class="p-empty">Aucun historique</div>';
  } else {
    hist.innerHTML = '<h4 style="color:var(--p-text);font-size:13px;margin-bottom:8px;">Historique</h4>' + history.slice().reverse().map(h => {
      const setsStr = h.sets.map(s => `${s.weight_kg}×${s.reps}${s.is_pr ? ' 🏆' : ''}`).join(', ');
      return `
        <div class="p-progress-row">
          <span class="p-progress-date">${new Date(h.date + 'T00:00:00').toLocaleDateString('fr-FR')}</span>
          <span class="p-progress-sets">${setsStr}</span>
          <span class="p-progress-tonnage">${h.totalVolume.toLocaleString('fr-FR')} kg</span>
        </div>
      `;
    }).join('');
  }
}

// ─── Helpers ───────────────────────────────────────────────

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ─── Tasks (Kanban Board) ───────────────────────────────────

const TASK_COLORS = ['#6366F1', '#EC4899', '#10B981', '#F59E0B', '#8B5CF6', '#06B6D4', '#EF4444', '#84CC16'];
let tasksBoard = [];
let tasksDragging = null;       // { type: 'task'|'column', id, sourceColId? }
let tasksDropTarget = null;     // { type: 'before'|'after'|'child'|'column-end'|'column-swap', taskId?, colId? }
let tasksActiveFilters = new Set(); // Set of column IDs that are active filters (empty = show all)
let tasksHoveredColumnId = null; // For "n" shortcut
let tasksUsersList = [];           // List of users for admin selector / assignment dropdown
let tasksViewingUserKey = null;    // Which user's board are we currently viewing
let tasksViewingUserName = '';     // Display name
let tasksIsViewingOther = false;   // Admin viewing someone else's board
let tasksCurrentUserKey = null;    // Current user's own key

function getMyUserKey() {
  if (!currentUser) return null;
  if (currentUser.role === 'admin') return 'admin';
  return currentUser.sales_rep_id ? `rep:${currentUser.sales_rep_id}` : null;
}

// ── Undo/Redo history ──
// Each entry: { undo: async fn, redo: async fn, label: string }
const tasksUndoStack = [];
const tasksRedoStack = [];
const TASKS_HISTORY_MAX = 50;

function recordHistory(entry) {
  tasksUndoStack.push(entry);
  if (tasksUndoStack.length > TASKS_HISTORY_MAX) tasksUndoStack.shift();
  // New action wipes the redo stack
  tasksRedoStack.length = 0;
}

async function tasksUndo() {
  if (tasksUndoStack.length === 0) {
    showToast('Rien à annuler', 'info', 1500);
    return;
  }
  const entry = tasksUndoStack.pop();
  try {
    await entry.undo();
    tasksRedoStack.push(entry);
    await loadTasksBoard();
    showToast(`↶ ${entry.label}`, 'info', 1500);
  } catch (e) {
    showToast('Erreur annulation', 'error');
  }
}

async function tasksRedo() {
  if (tasksRedoStack.length === 0) {
    showToast('Rien à refaire', 'info', 1500);
    return;
  }
  const entry = tasksRedoStack.pop();
  try {
    await entry.redo();
    tasksUndoStack.push(entry);
    await loadTasksBoard();
    showToast(`↷ ${entry.label}`, 'info', 1500);
  } catch (e) {
    showToast('Erreur refait', 'error');
  }
}

async function loadTasksBoard() {
  const container = document.getElementById('tasks-board');
  if (!container) return;
  tasksCurrentUserKey = getMyUserKey();
  if (!tasksViewingUserKey) tasksViewingUserKey = tasksCurrentUserKey;
  try {
    // Load users list once (admin needs it, others may need it for assignment dropdown)
    if (tasksUsersList.length === 0) {
      try { tasksUsersList = await api('/tasks/users'); } catch { tasksUsersList = []; }
    }
    // Build URL with ?as for admin viewing another board
    const asParam = (isAdmin() && tasksViewingUserKey && tasksViewingUserKey !== 'admin')
      ? `?as=${encodeURIComponent(tasksViewingUserKey)}`
      : '';
    const data = await api('/tasks/board' + asParam);
    // Backward compat: support both old (array) and new ({board, ...}) responses
    if (Array.isArray(data)) {
      tasksBoard = data;
      tasksViewingUserName = '';
      tasksIsViewingOther = false;
    } else {
      tasksBoard = data.board || [];
      tasksViewingUserKey = data.viewing_user_key;
      tasksViewingUserName = data.viewing_user_name || '';
      tasksIsViewingOther = !!data.is_viewing_other;
    }
    renderViewBanner();
    renderViewAsSelector();
    renderTasksBoard();
  } catch (e) {
    console.error('Erreur chargement tâches:', e);
    container.innerHTML = '<div class="empty-state">Erreur de chargement</div>';
  }
}

function renderViewBanner() {
  const banner = document.getElementById('tasks-view-banner');
  if (!banner) return;
  if (tasksIsViewingOther) {
    banner.innerHTML = `
      👁️ Vous consultez le tableau de <strong>${escapeHtml(tasksViewingUserName)}</strong>
      <button class="tk-banner-back" id="tk-banner-back">↩ Retour à mon tableau</button>
    `;
    banner.classList.remove('hidden');
    document.getElementById('tk-banner-back')?.addEventListener('click', () => {
      tasksViewingUserKey = tasksCurrentUserKey;
      loadTasksBoard();
    });
  } else {
    banner.classList.add('hidden');
  }
}

function renderViewAsSelector() {
  const sel = document.getElementById('tasks-view-as');
  if (!sel) return;
  if (!isAdmin()) {
    sel.style.display = 'none';
    return;
  }
  // Admin only: dropdown to pick whose board
  sel.style.display = '';
  sel.innerHTML = tasksUsersList.map(u =>
    `<option value="${escapeHtml(u.key)}" ${u.key === tasksViewingUserKey ? 'selected' : ''}>${escapeHtml(u.name)}${u.key === 'admin' ? ' (moi)' : ''}</option>`
  ).join('');
  if (!sel.dataset.bound) {
    sel.dataset.bound = '1';
    sel.addEventListener('change', () => {
      tasksViewingUserKey = sel.value;
      loadTasksBoard();
    });
  }
}

// Build a tree of tasks from the flat list: roots have parent_id null, children nested under their parent
function buildTaskTree(flatTasks) {
  const map = {};
  flatTasks.forEach(t => { map[t.id] = { ...t, children: [] }; });
  const roots = [];
  flatTasks.forEach(t => {
    if (t.parent_id && map[t.parent_id]) {
      map[t.parent_id].children.push(map[t.id]);
    } else {
      roots.push(map[t.id]);
    }
  });
  const isMobile = window.innerWidth <= 768;
  // Mobile: sort by priority (overdue → today → others); Desktop: by position
  const priorityScore = (t) => {
    if (!t.due || t.completed) return 100;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [y, m, d] = t.due.slice(0, 10).split('-').map(Number);
    const due = new Date(y, m - 1, d);
    const diffDays = Math.round((due - today) / 86400000);
    if (diffDays < 0) return 0;      // overdue → top
    if (diffDays === 0) return 1;    // today → next
    if (diffDays <= 2) return 2;     // next 2 days
    return 50 + diffDays;            // later
  };
  const sortFn = isMobile
    ? (a, b) => priorityScore(a) - priorityScore(b) || a.position - b.position
    : (a, b) => a.position - b.position || a.id - b.id;
  const sortNodes = (arr) => {
    arr.sort(sortFn);
    arr.forEach(n => sortNodes(n.children));
  };
  sortNodes(roots);
  return roots;
}

function renderTaskNode(t, depth = 0) {
  const indentClass = depth > 0 ? `tk-card-sub tk-depth-${Math.min(depth, 3)}` : '';
  const dueBadge = renderDueBadge(t.due, t.completed);
  const tagsHtml = (Array.isArray(t.tags) && t.tags.length > 0)
    ? `<div class="tk-card-tags">${t.tags.map(tag => `<span class="tk-tag-pill">${escapeHtml(tag.length > 22 ? tag.slice(0, 22) + '…' : tag)}</span>`).join('')}</div>`
    : '';
  const checkInfo = computeChecklistCount(t.description);
  const checkBadge = checkInfo ? `<span class="tk-check-badge">☑ ${checkInfo.done}/${checkInfo.total}</span>` : '';
  const subCount = (t.children && t.children.length) ? `<span class="tk-sub-badge">↳ ${t.children.length}</span>` : '';
  // Assignment indicator: when current user is the assignee (not creator), show "Assignée par X"
  let assignBadge = '';
  if (t.assigned_to && t.created_by && tasksCurrentUserKey === t.assigned_to && t.created_by !== tasksCurrentUserKey) {
    assignBadge = `<span class="tk-assign-badge" title="Assignée par ${escapeHtml(t.created_by_name || '')}">📌 Assignée par ${escapeHtml(t.created_by_name || '')}</span>`;
  } else if (t.assigned_to && t.created_by === tasksCurrentUserKey) {
    // I created it and assigned it to someone else: show whom
    assignBadge = `<span class="tk-assign-badge tk-assign-out" title="Assignée à ${escapeHtml(t.assigned_to_name || '')}">→ ${escapeHtml(t.assigned_to_name || '')}</span>`;
  }
  const meta = (dueBadge || tagsHtml || checkBadge || subCount || assignBadge)
    ? `<div class="tk-card-meta">${dueBadge}${checkBadge}${subCount}${assignBadge}${tagsHtml}</div>`
    : '';

  return `
    <div class="tk-card-wrap" data-task-wrap="${t.id}" style="${depth > 0 ? `margin-left: ${depth * 16}px;` : ''}">
      <div class="tk-card ${t.highlighted ? 'tk-highlight' : ''} ${t.completed ? 'tk-done' : ''} ${indentClass}"
           data-task-id="${t.id}"
           data-parent-id="${t.parent_id || ''}"
           data-col-id="${t.column_id}"
           draggable="true">
        <div class="tk-card-text" data-edit-task="${t.id}">${escapeHtml(t.text)}</div>
        ${meta}
        <div class="tk-card-actions">
          <button class="tk-card-arrow" data-move-task="${t.id}" data-dir="up" title="Monter">↑</button>
          <button class="tk-card-arrow" data-move-task="${t.id}" data-dir="down" title="Descendre">↓</button>
          <button class="tk-card-subbtn" data-add-subtask="${t.id}" title="Sous-tâche">+ Sous-tâche</button>
        </div>
      </div>
      ${t.children.map(c => renderTaskNode(c, depth + 1)).join('')}
    </div>
  `;
}

// ── Date helpers for due badges ──
function parseDueValue(due) {
  if (!due) return null;
  // Either "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM"
  const datePart = due.slice(0, 10);
  const timePart = due.length > 10 ? due.slice(11, 16) : null;
  return { datePart, timePart };
}

function renderDueBadge(due, completed) {
  const parsed = parseDueValue(due);
  if (!parsed) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = parsed.datePart.split('-').map(Number);
  const dueDate = new Date(y, m - 1, d);
  dueDate.setHours(0, 0, 0, 0);
  const diffDays = Math.round((dueDate - today) / 86400000);
  let label;
  if (diffDays === 0) label = 'Aujourd\'hui';
  else if (diffDays === 1) label = 'Demain';
  else if (diffDays === -1) label = 'Hier';
  else if (diffDays > 1 && diffDays <= 14) label = `Dans ${diffDays}j`;
  else if (diffDays < -1 && diffDays >= -14) label = `Il y a ${-diffDays}j`;
  else {
    const months = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    label = `${d} ${months[m - 1]}`;
  }
  if (parsed.timePart) label += ' · ' + parsed.timePart;
  let cls = 'tk-due-badge';
  if (diffDays < 0 && !completed) cls += ' tk-due-overdue';
  else if (diffDays === 0) cls += ' tk-due-today';
  else cls += ' tk-due-normal';
  return `<span class="${cls}">📅 ${escapeHtml(label)}</span>`;
}

// ── Checklist helpers ──
function computeChecklistCount(description) {
  if (!description) return null;
  const lines = description.split('\n');
  let total = 0, done = 0;
  for (const line of lines) {
    const m = line.match(/^\s*[-*]\s*\[( |x|X)\]/);
    if (m) {
      total++;
      if (m[1].toLowerCase() === 'x') done++;
    }
  }
  if (total === 0) return null;
  return { total, done };
}

function toggleChecklistLine(description, index) {
  if (!description) return description;
  const lines = description.split('\n');
  let count = -1;
  return lines.map(line => {
    const m = line.match(/^(\s*[-*]\s*\[)( |x|X)(\].*)$/);
    if (!m) return line;
    count++;
    if (count === index) {
      const newCheck = m[2].toLowerCase() === 'x' ? ' ' : 'x';
      return m[1] + newCheck + m[3];
    }
    return line;
  }).join('\n');
}

function renderTasksBoard() {
  const container = document.getElementById('tasks-board');
  if (!container) return;
  const totalTasks = tasksBoard.reduce((sum, c) => sum + c.tasks.length, 0);
  const visibleColumns = tasksActiveFilters.size === 0
    ? tasksBoard
    : tasksBoard.filter(c => tasksActiveFilters.has(c.id));
  const visibleTasks = visibleColumns.reduce((sum, c) => sum + c.tasks.length, 0);

  // Update header counter
  const countEl = document.getElementById('tasks-count');
  if (countEl) {
    if (tasksActiveFilters.size > 0) {
      countEl.innerHTML = `<button class="tk-count-clear" title="Effacer les filtres">${visibleTasks} / ${totalTasks} tâches <span class="tk-count-clear-x">✕</span></button>`;
      const clearBtn = countEl.querySelector('.tk-count-clear');
      if (clearBtn) clearBtn.addEventListener('click', () => {
        tasksActiveFilters.clear();
        renderTasksBoard();
      });
    } else {
      countEl.textContent = `${totalTasks} tâche${totalTasks !== 1 ? 's' : ''}`;
    }
  }

  // Render filter pills
  renderFilterPills();

  // Render board (only visible columns)
  container.innerHTML = visibleColumns.map(col => {
    const tree = buildTaskTree(col.tasks);
    const isVirtual = col.is_virtual || col.id < 0;
    const nameAttr = isVirtual ? '' : `data-edit-col="${col.id}"`;
    const menuBtn = isVirtual ? '' : `<button class="tk-col-menu" data-col-menu="${col.id}" title="Options">⋯</button>`;
    const headerDraggable = isVirtual ? '' : 'draggable="true"';
    const dragHandle = isVirtual ? '' : `<span class="tk-col-drag-handle" title="Glisser pour déplacer la colonne">⋮⋮</span>`;
    const addBtn = isVirtual ? '' : `<button class="tk-add-task" data-add-task="${col.id}">+ Ajouter une tâche</button>`;
    const colClass = isVirtual ? 'tk-col tk-col-virtual' : 'tk-col';
    return `
    <div class="${colClass}" data-col-id="${col.id}">
      <div class="tk-col-header" style="border-top-color: ${col.color}" data-col-header="${col.id}" ${headerDraggable}>
        ${dragHandle}
        <div class="tk-col-name" ${nameAttr}>${isVirtual ? '📌 ' : ''}${escapeHtml(col.name)}</div>
        <div class="tk-col-right">
          <span class="tk-col-count" style="background: ${col.color}20; color: ${col.color}">${col.tasks.length}</span>
          ${menuBtn}
        </div>
      </div>
      <div class="tk-col-body" data-col-body="${col.id}">
        ${tree.map(t => renderTaskNode(t, 0)).join('')}
        ${addBtn}
      </div>
    </div>`;
  }).join('');

  wireTasksEvents();
}

function renderFilterPills() {
  const el = document.getElementById('tasks-filters');
  if (!el) return;
  el.innerHTML = tasksBoard.map(col => {
    const active = tasksActiveFilters.has(col.id);
    return `
      <button class="tk-filter-pill ${active ? 'active' : ''}"
        data-filter-col="${col.id}"
        style="${active ? `background:${col.color}; border-color:${col.color}; color:#fff; box-shadow: 3px 3px 0 rgba(15,23,42,0.15);` : `border-color:${col.color}40;`}">
        <span class="tk-filter-dot" style="background:${col.color}"></span>
        ${escapeHtml(col.name)} · ${col.tasks.length}
      </button>
    `;
  }).join('');
  el.querySelectorAll('[data-filter-col]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.filterCol, 10);
      if (tasksActiveFilters.has(id)) tasksActiveFilters.delete(id);
      else tasksActiveFilters.add(id);
      renderTasksBoard();
    });
  });
}

function wireTasksEvents() {
  const container = document.getElementById('tasks-board');
  if (!container) return;
  // Add task
  container.querySelectorAll('[data-add-task]').forEach(btn => {
    btn.addEventListener('click', () => addTaskInline(parseInt(btn.dataset.addTask, 10), btn));
  });
  // Add subtask
  container.querySelectorAll('[data-add-subtask]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      addSubtaskInline(parseInt(btn.dataset.addSubtask, 10), btn);
    });
  });
  // Click on card (anywhere except buttons) opens the panel
  container.querySelectorAll('.tk-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // Mobile: clicking the actions zone opens the context menu (… button)
      const isMobile = window.innerWidth <= 768;
      if (isMobile && e.target.closest('.tk-card-actions')) {
        e.preventDefault();
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        openCardContextMenu(parseInt(card.dataset.taskId, 10), rect.right - 20, rect.top + 30);
        return;
      }
      // Ignore clicks on action buttons (arrows, subtask, etc.) on desktop
      if (e.target.closest('.tk-card-arrow') || e.target.closest('.tk-card-subbtn')) return;
      // Shift+click = delete
      if (e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        deleteTaskWithUndo(parseInt(card.dataset.taskId, 10));
        return;
      }
      openTaskPanel(parseInt(card.dataset.taskId, 10));
    });
  });
  // Move up/down arrows
  container.querySelectorAll('[data-move-task]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      moveTaskInList(parseInt(btn.dataset.moveTask, 10), btn.dataset.dir);
    });
  });
  // Edit column name
  container.querySelectorAll('[data-edit-col]').forEach(el => {
    el.addEventListener('click', () => editColumn(parseInt(el.dataset.editCol, 10), el));
  });
  // Column menu
  container.querySelectorAll('[data-col-menu]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openColumnMenu(parseInt(btn.dataset.colMenu, 10), btn);
    });
  });
  // Right-click context menu on cards
  container.querySelectorAll('.tk-card').forEach(card => {
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openCardContextMenu(parseInt(card.dataset.taskId, 10), e.clientX, e.clientY);
    });
  });
  // ── Drag & drop ──
  container.querySelectorAll('.tk-card').forEach(card => {
    card.addEventListener('dragstart', onTaskDragStart);
    card.addEventListener('dragend', onTaskDragEnd);
    card.addEventListener('dragover', onTaskDragOver);
    card.addEventListener('dragleave', onTaskDragLeave);
    card.addEventListener('drop', onTaskDrop);
  });
  container.querySelectorAll('[data-col-body]').forEach(body => {
    body.addEventListener('dragover', onColumnBodyDragOver);
    body.addEventListener('dragleave', onColumnBodyDragLeave);
    body.addEventListener('drop', onColumnBodyDrop);
  });
  // Track hovered column for "n" shortcut
  container.querySelectorAll('.tk-col').forEach(col => {
    col.addEventListener('mouseenter', () => { tasksHoveredColumnId = parseInt(col.dataset.colId, 10); });
    col.addEventListener('mouseleave', () => { tasksHoveredColumnId = null; });
  });
  container.querySelectorAll('[data-col-header]').forEach(header => {
    header.addEventListener('dragstart', onColumnDragStart);
    header.addEventListener('dragend', onColumnDragEnd);
    header.addEventListener('dragover', onColumnHeaderDragOver);
    header.addEventListener('drop', onColumnHeaderDrop);
  });
}

// ── Drag & drop handlers ──

function onTaskDragStart(e) {
  const id = parseInt(e.currentTarget.dataset.taskId, 10);
  tasksDragging = { type: 'task', id };
  e.currentTarget.classList.add('tk-dragging');
  e.dataTransfer.effectAllowed = 'move';
  // Some browsers need data to be set
  try { e.dataTransfer.setData('text/plain', String(id)); } catch (_) {}
  document.body.classList.add('tk-dragging-active');
}

function onTaskDragEnd(e) {
  e.currentTarget.classList.remove('tk-dragging');
  document.body.classList.remove('tk-dragging-active');
  clearDropIndicators();
  tasksDragging = null;
  tasksDropTarget = null;
}

function onTaskDragOver(e) {
  if (!tasksDragging || tasksDragging.type !== 'task') return;
  e.preventDefault();
  e.stopPropagation();
  const card = e.currentTarget;
  const targetId = parseInt(card.dataset.taskId, 10);
  if (targetId === tasksDragging.id) return;
  if (isDescendant(tasksDragging.id, targetId)) return; // prevent loops

  const rect = card.getBoundingClientRect();
  const y = e.clientY - rect.top;
  clearDropIndicators();
  if (y < 10) {
    card.classList.add('tk-drop-before');
    tasksDropTarget = { type: 'before', taskId: targetId };
  } else {
    card.classList.add('tk-drop-child');
    tasksDropTarget = { type: 'child', taskId: targetId };
  }
}

function onTaskDragLeave(e) {
  e.currentTarget.classList.remove('tk-drop-before', 'tk-drop-child');
}

function onTaskDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  if (!tasksDragging || !tasksDropTarget) return;
  const dragId = tasksDragging.id;
  const target = tasksDropTarget;
  clearDropIndicators();
  applyDrop(dragId, target);
}

function onColumnBodyDragOver(e) {
  if (!tasksDragging || tasksDragging.type !== 'task') return;
  e.preventDefault();
  const body = e.currentTarget;
  // Only show end indicator if hovering near the bottom (below all cards)
  const colId = parseInt(body.dataset.colBody, 10);
  clearDropIndicators();
  body.classList.add('tk-col-drop');
  tasksDropTarget = { type: 'column-end', colId };
}

function onColumnBodyDragLeave(e) {
  if (e.currentTarget.contains(e.relatedTarget)) return;
  e.currentTarget.classList.remove('tk-col-drop');
}

function onColumnBodyDrop(e) {
  e.preventDefault();
  if (!tasksDragging || !tasksDropTarget) return;
  const dragId = tasksDragging.id;
  const target = tasksDropTarget;
  clearDropIndicators();
  applyDrop(dragId, target);
}

function onColumnDragStart(e) {
  // If user is starting to drag from header but the original target was the inline name/menu, abort
  if (e.target.closest('[data-edit-col]') || e.target.closest('[data-col-menu]')) {
    e.preventDefault();
    return;
  }
  const id = parseInt(e.currentTarget.dataset.colHeader, 10);
  tasksDragging = { type: 'column', id };
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', 'col-' + id); } catch (_) {}
  e.currentTarget.classList.add('tk-col-dragging');
}

function onColumnDragEnd(e) {
  e.currentTarget.classList.remove('tk-col-dragging');
  clearColumnDropIndicators();
  tasksDragging = null;
  tasksDropTarget = null;
}

function clearColumnDropIndicators() {
  document.querySelectorAll('.tk-col-drop-left, .tk-col-drop-right, .tk-col-swap-target')
    .forEach(el => el.classList.remove('tk-col-drop-left', 'tk-col-drop-right', 'tk-col-swap-target'));
}

function onColumnHeaderDragOver(e) {
  if (!tasksDragging || tasksDragging.type !== 'column') return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const header = e.currentTarget;
  const targetId = parseInt(header.dataset.colHeader, 10);
  if (targetId === tasksDragging.id) return;
  // Detect left/right half of the header to decide insertion side
  const col = header.closest('.tk-col');
  if (!col) return;
  const rect = col.getBoundingClientRect();
  const side = (e.clientX - rect.left) < rect.width / 2 ? 'before' : 'after';
  clearColumnDropIndicators();
  col.classList.add(side === 'before' ? 'tk-col-drop-left' : 'tk-col-drop-right');
  tasksDropTarget = { type: 'column-insert', colId: targetId, side };
}

function onColumnHeaderDrop(e) {
  e.preventDefault();
  if (!tasksDragging || !tasksDropTarget || tasksDropTarget.type !== 'column-insert') return;
  moveColumnTo(tasksDragging.id, tasksDropTarget.colId, tasksDropTarget.side);
}

function clearDropIndicators() {
  document.querySelectorAll('.tk-drop-before, .tk-drop-child, .tk-col-drop').forEach(el => {
    el.classList.remove('tk-drop-before', 'tk-drop-child', 'tk-col-drop');
  });
}

// Check if checkId is descendant of ancestorId (in the flat tasks list)
function isDescendant(ancestorId, checkId) {
  if (ancestorId === checkId) return true;
  const allTasks = tasksBoard.flatMap(c => c.tasks);
  const childrenOf = (pid) => allTasks.filter(t => t.parent_id === pid);
  const stack = [...childrenOf(ancestorId)];
  while (stack.length) {
    const t = stack.pop();
    if (t.id === checkId) return true;
    stack.push(...childrenOf(t.id));
  }
  return false;
}

async function applyDrop(taskId, target) {
  const allTasks = tasksBoard.flatMap(c => c.tasks);
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return;

  let newColumnId = task.column_id;
  let newParentId = task.parent_id;
  let newPosition = task.position;

  if (target.type === 'before') {
    const targetTask = allTasks.find(t => t.id === target.taskId);
    if (!targetTask) return;
    newColumnId = targetTask.column_id;
    newParentId = targetTask.parent_id;
    newPosition = targetTask.position;
  } else if (target.type === 'child') {
    const targetTask = allTasks.find(t => t.id === target.taskId);
    if (!targetTask) return;
    newColumnId = targetTask.column_id;
    newParentId = targetTask.id;
    const siblings = allTasks.filter(t => t.parent_id === targetTask.id);
    newPosition = siblings.length;
  } else if (target.type === 'column-end') {
    newColumnId = target.colId;
    newParentId = null;
    const roots = allTasks.filter(t => t.column_id === target.colId && t.parent_id === null);
    newPosition = roots.length;
  }

  // Build the bulk updates: shift positions of siblings appropriately
  await persistTaskMove(taskId, newColumnId, newParentId, newPosition);
  await loadTasksBoard();
}

async function persistTaskMove(taskId, columnId, parentId, position) {
  try {
    // Capture previous state for undo
    const allTasks = tasksBoard.flatMap(c => c.tasks);
    const task = allTasks.find(t => t.id === taskId);
    const prev = task ? { column_id: task.column_id, parent_id: task.parent_id, position: task.position } : null;
    const next = { column_id: columnId, parent_id: parentId, position };

    await api('/tasks/reorder', { method: 'POST', body: { updates: [{ id: taskId, ...next }] } });
    if (task && task.column_id !== columnId) {
      const toUpdate = [];
      const collect = (pid) => {
        allTasks.filter(t => t.parent_id === pid).forEach(c => {
          toUpdate.push({ id: c.id, column_id: columnId, parent_id: c.parent_id, position: c.position });
          collect(c.id);
        });
      };
      collect(taskId);
      if (toUpdate.length > 0) {
        await api('/tasks/reorder', { method: 'POST', body: { updates: toUpdate } });
      }
    }
    if (prev) {
      recordHistory({
        label: 'Déplacement annulé',
        undo: async () => { await api('/tasks/reorder', { method: 'POST', body: { updates: [{ id: taskId, ...prev }] } }); },
        redo: async () => { await api('/tasks/reorder', { method: 'POST', body: { updates: [{ id: taskId, ...next }] } }); }
      });
    }
  } catch (e) {
    showToast('Erreur déplacement', 'error');
  }
}

// Move a column before/after a target column (insertion, not swap).
// Only operates on REAL columns (ignores the virtual "📌 Assignées à moi").
async function moveColumnTo(sourceId, targetId, side /* 'before' | 'after' */) {
  if (sourceId === targetId) return;
  // Build the order from real columns only
  const realCols = tasksBoard.filter(c => !c.is_virtual && c.id > 0);
  const ids = realCols.map(c => c.id);
  const srcIdx = ids.indexOf(sourceId);
  if (srcIdx < 0) return;
  ids.splice(srcIdx, 1); // remove source
  let tgtIdx = ids.indexOf(targetId);
  if (tgtIdx < 0) return;
  if (side === 'after') tgtIdx += 1;
  ids.splice(tgtIdx, 0, sourceId);
  // Avoid unnecessary calls if nothing changed
  const before = realCols.map(c => c.id).join(',');
  if (before === ids.join(',')) return;
  try {
    await api('/tasks/columns/reorder', { method: 'POST', body: { order: ids } });
    await loadTasksBoard();
  } catch (e) {
    showToast('Erreur réorganisation', 'error');
  }
}

// Shift a column one slot left or right (used by the column menu)
async function shiftColumn(columnId, dir /* -1 = left, +1 = right */) {
  const realCols = tasksBoard.filter(c => !c.is_virtual && c.id > 0);
  const ids = realCols.map(c => c.id);
  const idx = ids.indexOf(columnId);
  if (idx < 0) return;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= ids.length) return;
  [ids[idx], ids[newIdx]] = [ids[newIdx], ids[idx]];
  try {
    await api('/tasks/columns/reorder', { method: 'POST', body: { order: ids } });
    await loadTasksBoard();
  } catch (e) {
    showToast('Erreur déplacement', 'error');
  }
}

// ── Add subtask inline ──
function addSubtaskInline(parentId, btn) {
  const allTasks = tasksBoard.flatMap(c => c.tasks);
  const parent = allTasks.find(t => t.id === parentId);
  if (!parent) return;
  const wrap = document.querySelector(`[data-task-wrap="${parentId}"]`);
  if (!wrap) return;

  // Create input directly below parent card
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tk-add-input tk-sub-input';
  input.placeholder = 'Nouvelle sous-tâche…';
  input.style.marginLeft = (16 + 16) + 'px'; // approximate indent
  wrap.appendChild(input);
  input.focus();
  let submitted = false;

  const cleanup = () => { if (input.parentNode) input.remove(); };

  const submit = async (continueAfter) => {
    if (submitted) return;
    const text = input.value.trim();
    if (!text) { submitted = true; cleanup(); return; }
    submitted = true;
    try {
      await api('/tasks', { method: 'POST', body: { column_id: parent.column_id, parent_id: parent.id, text } });
      await loadTasksBoard();
      if (continueAfter) {
        // Re-open another sub-input under the same parent for chaining
        setTimeout(() => {
          const btn2 = document.querySelector(`[data-add-subtask="${parentId}"]`);
          if (btn2) addSubtaskInline(parentId, btn2);
        }, 50);
      }
    } catch (e) {
      showToast('Erreur sous-tâche', 'error');
      cleanup();
    }
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(true); }
    else if (e.key === 'Escape') { submitted = true; cleanup(); }
  });
  input.addEventListener('blur', () => setTimeout(() => submit(false), 100));
}

// ── Move task up/down within siblings ──
async function moveTaskInList(taskId, direction) {
  const allTasks = tasksBoard.flatMap(c => c.tasks);
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return;
  const siblings = allTasks
    .filter(t => t.column_id === task.column_id && (t.parent_id || null) === (task.parent_id || null))
    .sort((a, b) => a.position - b.position);
  const idx = siblings.findIndex(t => t.id === taskId);
  if (idx < 0) return;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= siblings.length) return;
  const other = siblings[swapIdx];
  // Swap positions
  try {
    await api('/tasks/reorder', { method: 'POST', body: { updates: [
      { id: task.id, column_id: task.column_id, parent_id: task.parent_id, position: other.position },
      { id: other.id, column_id: other.column_id, parent_id: other.parent_id, position: task.position }
    ] } });
    await loadTasksBoard();
  } catch (e) {
    showToast('Erreur déplacement', 'error');
  }
}

// ── Delete with toast undo ──
async function deleteTaskWithUndo(taskId) {
  const allTasks = tasksBoard.flatMap(c => c.tasks);
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return;
  // Collect descendants for restore
  const descendants = [];
  const collect = (pid) => {
    allTasks.filter(t => t.parent_id === pid).forEach(c => {
      descendants.push({ ...c });
      collect(c.id);
    });
  };
  collect(taskId);

  const restore = async () => {
    await api('/tasks/restore', { method: 'POST', body: { task, subtasks: descendants } });
  };
  const remove = async () => {
    await api(`/tasks/${taskId}`, { method: 'DELETE' });
  };

  try {
    await remove();
    await loadTasksBoard();
    // Record in history (Cmd+Z = restore, Cmd+Shift+Z = delete again)
    recordHistory({
      label: 'Suppression annulée',
      undo: restore,
      redo: remove
    });
    showUndoToast(task.text, async () => {
      try {
        await restore();
        await loadTasksBoard();
        // The undo through toast also pops from undo stack
        const idx = tasksUndoStack.findIndex(e => e.undo === restore);
        if (idx >= 0) tasksUndoStack.splice(idx, 1);
        showToast('Tâche restaurée', 'success', 1500);
      } catch (e) {
        showToast('Restauration impossible', 'error');
      }
    });
  } catch (e) {
    showToast('Erreur suppression', 'error');
  }
}

function showUndoToast(taskText, onUndo) {
  // Remove any existing undo toast
  document.querySelectorAll('.tk-undo-toast').forEach(t => t.remove());
  const toast = document.createElement('div');
  toast.className = 'tk-undo-toast';
  const shortText = taskText.length > 40 ? taskText.slice(0, 40) + '…' : taskText;
  toast.innerHTML = `<span>« ${escapeHtml(shortText)} » supprimée</span> <button class="tk-undo-btn">Annuler</button>`;
  document.body.appendChild(toast);
  const timer = setTimeout(() => toast.remove(), 5000);
  toast.querySelector('.tk-undo-btn').addEventListener('click', () => {
    clearTimeout(timer);
    toast.remove();
    onUndo();
  });
}

// ── Context menu on card ──
function openCardContextMenu(taskId, x, y) {
  document.querySelectorAll('.tk-menu-popup').forEach(m => m.remove());
  const allTasks = tasksBoard.flatMap(c => c.tasks);
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return;
  const menu = document.createElement('div');
  menu.className = 'tk-menu-popup';
  menu.innerHTML = `
    <button class="tk-menu-item" data-action="up">↑ Monter</button>
    <button class="tk-menu-item" data-action="down">↓ Descendre</button>
    <button class="tk-menu-item" data-action="highlight">${task.highlighted ? '○ Retirer le liseré rouge' : '🔴 Mettre un liseré rouge'}</button>
    <button class="tk-menu-item tk-menu-danger" data-action="delete">Supprimer</button>
  `;
  document.body.appendChild(menu);
  menu.style.top = y + 'px';
  menu.style.left = x + 'px';
  // Clamp to viewport
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
  if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 8) + 'px';

  menu.querySelector('[data-action="up"]').addEventListener('click', () => { menu.remove(); moveTaskInList(taskId, 'up'); });
  menu.querySelector('[data-action="down"]').addEventListener('click', () => { menu.remove(); moveTaskInList(taskId, 'down'); });
  menu.querySelector('[data-action="highlight"]').addEventListener('click', async () => {
    menu.remove();
    const newVal = task.highlighted ? 0 : 1;
    task.highlighted = newVal;
    await api(`/tasks/${taskId}`, { method: 'PUT', body: { highlighted: newVal } });
    renderTasksBoard();
  });
  menu.querySelector('[data-action="delete"]').addEventListener('click', () => { menu.remove(); deleteTaskWithUndo(taskId); });

  const closeOnOutside = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeOnOutside);
    }
  };
  setTimeout(() => document.addEventListener('click', closeOnOutside), 50);
}

function addTaskInline(columnId, btn) {
  if (tasksIsViewingOther) {
    showToast('Lecture seule — vous consultez le tableau d\'un autre utilisateur', 'error');
    return;
  }
  // Replace button with input
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tk-add-input';
  input.placeholder = 'Nouvelle tâche…';
  btn.style.display = 'none';
  btn.parentNode.insertBefore(input, btn);
  input.focus();
  let submitted = false;

  const cleanup = () => {
    if (input.parentNode) input.remove();
    btn.style.display = '';
  };

  const submit = async () => {
    if (submitted) return;
    submitted = true;
    const text = input.value.trim();
    if (!text) { cleanup(); return; }
    try {
      const task = await api('/tasks', { method: 'POST', body: { column_id: columnId, text } });
      const col = tasksBoard.find(c => c.id === columnId);
      if (col) col.tasks.push(task);
      cleanup();
      renderTasksBoard();
    } catch (e) {
      showToast('Erreur ajout tâche', 'error');
      cleanup();
    }
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    else if (e.key === 'Escape') { submitted = true; cleanup(); }
  });
  input.addEventListener('blur', () => setTimeout(submit, 100));
}

// Replaced by openTaskPanel — kept name for compat
function editTask(taskId) {
  openTaskPanel(taskId);
}

// ── Task panel (side drawer) ──
let currentPanelTaskId = null;

function openTaskPanel(taskId) {
  const allTasks = tasksBoard.flatMap(c => c.tasks);
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return;
  currentPanelTaskId = taskId;
  const panel = document.getElementById('tk-panel');
  const backdrop = document.getElementById('tk-panel-backdrop');
  if (!panel || !backdrop) return;
  panel.innerHTML = renderTaskPanel(task);
  panel.classList.remove('hidden');
  backdrop.classList.remove('hidden');
  setTimeout(() => {
    panel.classList.add('open');
    backdrop.classList.add('open');
  }, 10);
  wireTaskPanelEvents(task);
  // ESC to close
  document.addEventListener('keydown', onPanelEsc);
  backdrop.addEventListener('click', closeTaskPanel);
}

function onPanelEsc(e) {
  if (e.key === 'Escape') {
    // Don't close if the search overlay is open (it handles its own Esc)
    const searchOverlay = document.getElementById('tk-search-overlay');
    if (searchOverlay && !searchOverlay.classList.contains('hidden')) return;
    closeTaskPanel();
  }
}

function closeTaskPanel() {
  const panel = document.getElementById('tk-panel');
  const backdrop = document.getElementById('tk-panel-backdrop');
  if (!panel || !backdrop) return;
  panel.classList.remove('open');
  backdrop.classList.remove('open');
  setTimeout(() => {
    panel.classList.add('hidden');
    backdrop.classList.add('hidden');
  }, 200);
  document.removeEventListener('keydown', onPanelEsc);
  backdrop.removeEventListener('click', closeTaskPanel);
  currentPanelTaskId = null;
  // Re-render the board so card badges/preview update
  renderTasksBoard();
}

function renderTaskPanel(task) {
  const cols = tasksBoard;
  const parsed = parseDueValue(task.due);
  const dueDate = parsed?.datePart || '';
  const dueTime = parsed?.timePart || '';
  const tags = Array.isArray(task.tags) ? task.tags : [];
  const description = task.description || '';
  const checklist = computeChecklistCount(description);

  // Render checklist items (clickable) under description
  let checklistHTML = '';
  if (checklist) {
    const lines = description.split('\n');
    let idx = -1;
    const items = [];
    lines.forEach(line => {
      const m = line.match(/^\s*[-*]\s*\[( |x|X)\]\s*(.*)$/);
      if (m) {
        idx++;
        const checked = m[1].toLowerCase() === 'x';
        const itemIdx = idx;
        items.push(`
          <label class="tk-check-item">
            <input type="checkbox" data-check-idx="${itemIdx}" ${checked ? 'checked' : ''}>
            <span>${escapeHtml(m[2])}</span>
          </label>
        `);
      }
    });
    checklistHTML = `
      <div class="tk-pn-section">
        <div class="tk-pn-section-header">
          <span class="tk-pn-label">Checklist</span>
          <span class="tk-pn-checkcount">${checklist.done}/${checklist.total} cochées</span>
        </div>
        <div class="tk-check-list">${items.join('')}</div>
      </div>
    `;
  }

  return `
    <header class="tk-pn-header">
      <input type="text" class="tk-pn-title" id="tk-pn-title" value="${escapeHtml(task.text)}" placeholder="Titre de la tâche">
      <button class="tk-pn-close" id="tk-pn-close" title="Fermer">✕</button>
    </header>
    <div class="tk-pn-body">
      <div class="tk-pn-section">
        <div class="tk-pn-label">Colonne</div>
        <div class="tk-pn-cols">
          ${cols.map(c => `
            <button class="tk-pn-col-btn ${c.id === task.column_id ? 'active' : ''}"
              data-col-pick="${c.id}"
              style="--col-color: ${c.color}; ${c.id === task.column_id ? `background:${c.color}; border-color:${c.color}; color:#fff;` : ''}">
              ${escapeHtml(c.name)}
            </button>
          `).join('')}
        </div>
      </div>

      <div class="tk-pn-section">
        <div class="tk-pn-label">Échéance</div>
        <div class="tk-pn-due">
          <input type="date" id="tk-pn-date" value="${dueDate}">
          <input type="time" id="tk-pn-time" value="${dueTime}">
          <button class="tk-pn-due-clear" id="tk-pn-due-clear">Retirer</button>
        </div>
      </div>

      <div class="tk-pn-section">
        <div class="tk-pn-label">Tags</div>
        <div class="tk-pn-tags" id="tk-pn-tags">
          ${tags.map((tag, i) => `<span class="tk-pn-tag">${escapeHtml(tag)}<button data-tag-rm="${i}">×</button></span>`).join('')}
          <input type="text" id="tk-pn-tag-input" placeholder="Ajouter un tag…">
        </div>
      </div>

      <div class="tk-pn-section">
        <div class="tk-pn-label">Assigner à un collègue</div>
        <select id="tk-pn-assignee" class="tk-pn-assignee">
          <option value="">— Personne —</option>
          ${tasksUsersList
            .filter(u => u.key !== task.created_by) // can't assign to creator (it's already theirs)
            .map(u => `<option value="${escapeHtml(u.key)}" ${u.key === task.assigned_to ? 'selected' : ''}>${escapeHtml(u.name)}</option>`)
            .join('')}
        </select>
        ${task.created_by && task.created_by !== tasksCurrentUserKey ? `<div class="tk-pn-creator">Créée par <strong>${escapeHtml(task.created_by_name || '')}</strong></div>` : ''}
      </div>

      <div class="tk-pn-section">
        <div class="tk-pn-label">Description</div>
        <textarea id="tk-pn-desc" placeholder="Notes, instructions, checklist (- [ ] item)…">${escapeHtml(description)}</textarea>
      </div>

      ${checklistHTML}

      <div class="tk-pn-section tk-pn-buttons">
        <button class="tk-pn-toggle ${task.highlighted ? 'active' : ''}" id="tk-pn-highlight">
          ${task.highlighted ? '○ Retirer le liseré rouge' : '🔴 Mettre un liseré rouge'}
        </button>
        <button class="tk-pn-delete" id="tk-pn-delete">Supprimer</button>
      </div>
    </div>
  `;
}

// Helper: update a single field with undo support
async function updateTaskFieldWithUndo(taskId, field, oldValue, newValue, label) {
  const apply = async (val) => {
    await api(`/tasks/${taskId}`, { method: 'PUT', body: { [field]: val } });
  };
  await apply(newValue);
  recordHistory({
    label: label || `Modification annulée`,
    undo: async () => { await apply(oldValue); },
    redo: async () => { await apply(newValue); }
  });
}

function wireTaskPanelEvents(task) {
  const panel = document.getElementById('tk-panel');
  if (!panel) return;
  // Close
  panel.querySelector('#tk-pn-close')?.addEventListener('click', closeTaskPanel);

  // Title save on blur
  const titleInput = panel.querySelector('#tk-pn-title');
  let titleOriginal = task.text;
  titleInput?.addEventListener('focus', () => { titleOriginal = task.text; });
  titleInput?.addEventListener('blur', async () => {
    const val = titleInput.value.trim();
    if (val && val !== task.text) {
      const oldVal = titleOriginal;
      task.text = val;
      await updateTaskFieldWithUndo(task.id, 'text', oldVal, val, 'Titre modifié');
    }
  });
  titleInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); titleInput.blur(); }
  });

  // Column switch
  panel.querySelectorAll('[data-col-pick]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const newColId = parseInt(btn.dataset.colPick, 10);
      if (newColId === task.column_id) return;
      task.column_id = newColId;
      // Move to end of new column
      const allTasks = tasksBoard.flatMap(c => c.tasks);
      const newCol = tasksBoard.find(c => c.id === newColId);
      const newPos = newCol ? newCol.tasks.filter(t => !t.parent_id).length : 0;
      await api(`/tasks/${task.id}`, { method: 'PUT', body: { column_id: newColId, parent_id: null, position: newPos } });
      // Reload to get fresh data and re-render panel
      await loadTasksBoard();
      // Re-open panel with updated state
      openTaskPanel(task.id);
    });
  });

  // Due date / time
  const dateInput = panel.querySelector('#tk-pn-date');
  const timeInput = panel.querySelector('#tk-pn-time');
  const saveDue = async () => {
    const date = dateInput.value;
    const time = timeInput.value;
    let due = null;
    if (date) due = time ? `${date}T${time}` : date;
    task.due = due;
    await api(`/tasks/${task.id}`, { method: 'PUT', body: { due } });
  };
  dateInput?.addEventListener('change', saveDue);
  timeInput?.addEventListener('change', saveDue);
  panel.querySelector('#tk-pn-due-clear')?.addEventListener('click', async () => {
    dateInput.value = '';
    timeInput.value = '';
    task.due = null;
    await api(`/tasks/${task.id}`, { method: 'PUT', body: { due: null } });
  });

  // Tags
  const tagInput = panel.querySelector('#tk-pn-tag-input');
  const addTag = async (val) => {
    val = val.trim();
    if (!val) return;
    if (!Array.isArray(task.tags)) task.tags = [];
    if (task.tags.includes(val)) return;
    task.tags.push(val);
    await api(`/tasks/${task.id}`, { method: 'PUT', body: { tags: task.tags } });
    // Re-render tags section
    refreshPanelTags(task);
  };
  tagInput?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      await addTag(tagInput.value);
      tagInput.value = '';
    } else if (e.key === 'Backspace' && tagInput.value === '' && task.tags.length > 0) {
      task.tags.pop();
      await api(`/tasks/${task.id}`, { method: 'PUT', body: { tags: task.tags } });
      refreshPanelTags(task);
    }
  });
  panel.querySelectorAll('[data-tag-rm]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.tagRm, 10);
      task.tags.splice(idx, 1);
      await api(`/tasks/${task.id}`, { method: 'PUT', body: { tags: task.tags } });
      refreshPanelTags(task);
    });
  });

  // Assignee
  const assigneeSel = panel.querySelector('#tk-pn-assignee');
  assigneeSel?.addEventListener('change', async () => {
    const newAssignee = assigneeSel.value || null;
    const oldVal = task.assigned_to || null;
    task.assigned_to = newAssignee;
    await updateTaskFieldWithUndo(task.id, 'assigned_to', oldVal, newAssignee, 'Assignation modifiée');
    // Refresh user name for display
    if (newAssignee) {
      const u = tasksUsersList.find(x => x.key === newAssignee);
      task.assigned_to_name = u?.name || '';
    } else {
      task.assigned_to_name = null;
    }
  });

  // Description
  const desc = panel.querySelector('#tk-pn-desc');
  let descOriginal = task.description || '';
  desc?.addEventListener('focus', () => { descOriginal = task.description || ''; });
  desc?.addEventListener('blur', async () => {
    const val = desc.value;
    if (val !== (task.description || '')) {
      const oldVal = descOriginal;
      task.description = val;
      await updateTaskFieldWithUndo(task.id, 'description', oldVal, val, 'Description modifiée');
      // Re-render checklist part
      refreshPanelChecklist(task);
    }
  });

  // Checklist toggles
  panel.querySelectorAll('[data-check-idx]').forEach(cb => {
    cb.addEventListener('change', async () => {
      const idx = parseInt(cb.dataset.checkIdx, 10);
      task.description = toggleChecklistLine(task.description || '', idx);
      await api(`/tasks/${task.id}`, { method: 'PUT', body: { description: task.description } });
      // Update textarea + checklist counter
      const ta = panel.querySelector('#tk-pn-desc');
      if (ta) ta.value = task.description;
      refreshPanelChecklist(task);
    });
  });

  // Highlight toggle
  panel.querySelector('#tk-pn-highlight')?.addEventListener('click', async () => {
    const oldVal = task.highlighted;
    task.highlighted = task.highlighted ? 0 : 1;
    await updateTaskFieldWithUndo(task.id, 'highlighted', oldVal, task.highlighted, 'Liseré rouge basculé');
    // Re-render panel with updated state
    document.getElementById('tk-pn-highlight').textContent = task.highlighted ? '○ Retirer le liseré rouge' : '🔴 Mettre un liseré rouge';
    document.getElementById('tk-pn-highlight').classList.toggle('active', !!task.highlighted);
  });

  // Delete
  panel.querySelector('#tk-pn-delete')?.addEventListener('click', () => {
    const id = task.id;
    closeTaskPanel();
    deleteTaskWithUndo(id);
  });
}

function refreshPanelTags(task) {
  const tagsContainer = document.getElementById('tk-pn-tags');
  if (!tagsContainer) return;
  const tags = task.tags || [];
  tagsContainer.innerHTML = `
    ${tags.map((tag, i) => `<span class="tk-pn-tag">${escapeHtml(tag)}<button data-tag-rm="${i}">×</button></span>`).join('')}
    <input type="text" id="tk-pn-tag-input" placeholder="Ajouter un tag…">
  `;
  // Re-wire
  const tagInput = tagsContainer.querySelector('#tk-pn-tag-input');
  tagInput?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = tagInput.value.trim();
      if (!val) return;
      if (!Array.isArray(task.tags)) task.tags = [];
      if (task.tags.includes(val)) return;
      task.tags.push(val);
      await api(`/tasks/${task.id}`, { method: 'PUT', body: { tags: task.tags } });
      refreshPanelTags(task);
    } else if (e.key === 'Backspace' && tagInput.value === '' && task.tags.length > 0) {
      task.tags.pop();
      await api(`/tasks/${task.id}`, { method: 'PUT', body: { tags: task.tags } });
      refreshPanelTags(task);
    }
  });
  tagInput?.focus();
  tagsContainer.querySelectorAll('[data-tag-rm]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.tagRm, 10);
      task.tags.splice(idx, 1);
      await api(`/tasks/${task.id}`, { method: 'PUT', body: { tags: task.tags } });
      refreshPanelTags(task);
    });
  });
}

function refreshPanelChecklist(task) {
  // Re-render entire panel to update checklist section cleanly
  const panel = document.getElementById('tk-panel');
  if (!panel) return;
  panel.innerHTML = renderTaskPanel(task);
  wireTaskPanelEvents(task);
}

function editColumn(columnId, el) {
  const col = tasksBoard.find(c => c.id === columnId);
  if (!col) return;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tk-edit-col-input';
  input.value = col.name;
  el.replaceWith(input);
  input.focus();
  input.select();
  let done = false;

  const cleanup = (newName) => {
    if (done) return;
    done = true;
    if (newName !== undefined && newName.trim() && newName.trim() !== col.name) {
      col.name = newName.trim();
      api(`/tasks/columns/${columnId}`, { method: 'PUT', body: { name: newName.trim() } }).catch(() => showToast('Erreur sauvegarde', 'error'));
    }
    renderTasksBoard();
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); cleanup(input.value); }
    else if (e.key === 'Escape') cleanup();
  });
  input.addEventListener('blur', () => setTimeout(() => cleanup(input.value), 100));
}

function openColumnMenu(columnId, btn) {
  // Close any existing menu
  document.querySelectorAll('.tk-menu-popup').forEach(m => m.remove());

  const col = tasksBoard.find(c => c.id === columnId);
  if (!col) return;

  // Compute position among real columns to enable/disable move buttons
  const realCols = tasksBoard.filter(c => !c.is_virtual && c.id > 0);
  const idx = realCols.findIndex(c => c.id === columnId);
  const canLeft = idx > 0;
  const canRight = idx >= 0 && idx < realCols.length - 1;

  const menu = document.createElement('div');
  menu.className = 'tk-menu-popup';
  menu.innerHTML = `
    <div class="tk-menu-section">Déplacer</div>
    <div class="tk-menu-move-row">
      <button class="tk-menu-item tk-menu-move" data-action="move-left" ${canLeft ? '' : 'disabled'}>← Gauche</button>
      <button class="tk-menu-item tk-menu-move" data-action="move-right" ${canRight ? '' : 'disabled'}>Droite →</button>
    </div>
    <div class="tk-menu-section">Couleur</div>
    <div class="tk-color-grid">
      ${TASK_COLORS.map(c => `<button class="tk-color-dot ${c === col.color ? 'active' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}
    </div>
    <button class="tk-menu-item tk-menu-danger" data-action="delete">Supprimer la colonne</button>
  `;
  document.body.appendChild(menu);
  const rect = btn.getBoundingClientRect();
  menu.style.top = (rect.bottom + 4) + 'px';
  menu.style.left = (rect.right - menu.offsetWidth) + 'px';

  menu.querySelectorAll('[data-color]').forEach(c => {
    c.addEventListener('click', async () => {
      const newColor = c.dataset.color;
      col.color = newColor;
      await api(`/tasks/columns/${columnId}`, { method: 'PUT', body: { color: newColor } });
      menu.remove();
      renderTasksBoard();
    });
  });

  const moveLeftBtn = menu.querySelector('[data-action="move-left"]');
  if (moveLeftBtn && !moveLeftBtn.disabled) {
    moveLeftBtn.addEventListener('click', async () => {
      menu.remove();
      await shiftColumn(columnId, -1);
    });
  }
  const moveRightBtn = menu.querySelector('[data-action="move-right"]');
  if (moveRightBtn && !moveRightBtn.disabled) {
    moveRightBtn.addEventListener('click', async () => {
      menu.remove();
      await shiftColumn(columnId, +1);
    });
  }

  menu.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    if (!confirm(`Supprimer la colonne "${col.name}" et ses ${col.tasks.length} tâche(s) ?`)) return;
    await api(`/tasks/columns/${columnId}`, { method: 'DELETE' });
    tasksBoard = tasksBoard.filter(c => c.id !== columnId);
    menu.remove();
    renderTasksBoard();
  });

  const closeOnOutside = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeOnOutside);
    }
  };
  setTimeout(() => document.addEventListener('click', closeOnOutside), 50);
}

async function addNewColumn() {
  if (tasksIsViewingOther) {
    showToast('Lecture seule — impossible d\'ajouter une colonne au tableau d\'un autre', 'error');
    return;
  }
  const name = prompt('Nom de la nouvelle colonne :');
  if (!name || !name.trim()) return;
  try {
    const newCol = await api('/tasks/columns', { method: 'POST', body: { name: name.trim(), color: TASK_COLORS[tasksBoard.length % TASK_COLORS.length] } });
    tasksBoard.push(newCol);
    renderTasksBoard();
  } catch (e) {
    showToast('Erreur création colonne', 'error');
  }
}

function initTasksBindings() {
  const btn = document.getElementById('btn-add-column');
  if (btn && !btn.dataset.bound) {
    btn.dataset.bound = '1';
    btn.addEventListener('click', addNewColumn);
  }
  const searchBtn = document.getElementById('btn-tasks-search');
  if (searchBtn && !searchBtn.dataset.bound) {
    searchBtn.dataset.bound = '1';
    searchBtn.addEventListener('click', openTasksSearch);
  }
  const exportBtn = document.getElementById('btn-tasks-export');
  if (exportBtn && !exportBtn.dataset.bound) {
    exportBtn.dataset.bound = '1';
    exportBtn.addEventListener('click', exportTasksZip);
  }
  const settingsBtn = document.getElementById('btn-tasks-settings');
  if (settingsBtn && !settingsBtn.dataset.bound) {
    settingsBtn.dataset.bound = '1';
    settingsBtn.addEventListener('click', openTasksSettings);
  }
  initTasksWallpaper();
  initTasksSettingsModal();
  // Global keyboard shortcuts
  if (!document.body.dataset.tkShortcutsBound) {
    document.body.dataset.tkShortcutsBound = '1';
    document.addEventListener('keydown', onTasksGlobalShortcut);
  }
}

// ── Export to ZIP (one .md per task + _taskvault.json) ──
async function exportTasksZip() {
  if (typeof JSZip === 'undefined') {
    showToast('JSZip non chargé', 'error');
    return;
  }
  const zip = new JSZip();
  const taskvault = {
    exported_at: new Date().toISOString(),
    columns: tasksBoard.map(c => ({ id: c.id, name: c.name, color: c.color, position: c.position }))
  };
  zip.file('_taskvault.json', JSON.stringify(taskvault, null, 2));

  const slugify = (s) => (s || 'task')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

  tasksBoard.forEach(col => {
    col.tasks.forEach(task => {
      const status = col.name;
      const tags = Array.isArray(task.tags) ? task.tags : [];
      const links = tasksBoard.flatMap(c => c.tasks)
        .filter(t => t.parent_id === task.id)
        .map(t => t.id);
      const fm = ['---'];
      fm.push(`title: ${JSON.stringify(task.text || '')}`);
      fm.push(`status: ${JSON.stringify(status)}`);
      if (task.due) fm.push(`due: ${task.due}`);
      fm.push(`order: ${task.position}`);
      fm.push(`highlight: ${task.highlighted ? 'true' : 'false'}`);
      if (tags.length) {
        fm.push('tags:');
        tags.forEach(t => fm.push(`  - ${JSON.stringify(t)}`));
      }
      if (links.length) {
        fm.push('links:');
        links.forEach(l => fm.push(`  - ${l}`));
      }
      if (task.parent_id) fm.push(`parent: ${task.parent_id}`);
      fm.push('---');
      const body = task.description || '';
      const md = fm.join('\n') + '\n\n' + body + '\n';
      const filename = `${task.id}-${slugify(task.text)}.md`;
      zip.file(filename, md);
    });
  });

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dateStr = new Date().toISOString().slice(0, 10);
  a.download = `taskvault-${dateStr}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Export ZIP téléchargé', 'success', 2000);
}

// ── Wallpaper personnalisation ──
const TK_DB_NAME = 'tkPrefs';
const TK_STORE = 'kv';

function openTkDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(TK_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(TK_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tkDbGet(key) {
  const db = await openTkDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TK_STORE, 'readonly');
    const req = tx.objectStore(TK_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tkDbSet(key, val) {
  const db = await openTkDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TK_STORE, 'readwrite');
    tx.objectStore(TK_STORE).put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function tkDbDel(key) {
  const db = await openTkDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TK_STORE, 'readwrite');
    tx.objectStore(TK_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function initTasksWallpaper() {
  try {
    const blob = await tkDbGet('wallpaper');
    if (blob) applyWallpaperFromBlob(blob);
  } catch (_) {}
  // Apply saved opacity & blur
  const veilOp = parseInt(localStorage.getItem('tkVeilOpacity') || '60', 10);
  const blur = parseInt(localStorage.getItem('tkVeilBlur') || '0', 10);
  applyVeilSettings(veilOp, blur);
}

function applyWallpaperFromBlob(blob) {
  const url = URL.createObjectURL(blob);
  const wp = document.getElementById('tk-wallpaper');
  if (wp) {
    wp.style.backgroundImage = `url(${url})`;
    wp.classList.add('active');
    document.body.classList.add('tk-has-wallpaper');
  }
}

function clearWallpaper() {
  const wp = document.getElementById('tk-wallpaper');
  if (wp) {
    wp.style.backgroundImage = '';
    wp.classList.remove('active');
    document.body.classList.remove('tk-has-wallpaper');
  }
  tkDbDel('wallpaper').catch(() => {});
}

function applyVeilSettings(opacity, blur) {
  const veil = document.getElementById('tk-wallpaper-veil');
  if (veil) {
    veil.style.background = `rgba(255,255,255,${opacity / 100})`;
    veil.style.backdropFilter = blur > 0 ? `blur(${blur}px)` : '';
  }
}

function openTasksSettings() {
  const overlay = document.getElementById('tk-settings-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  // Sync sliders with stored values
  const veil = parseInt(localStorage.getItem('tkVeilOpacity') || '60', 10);
  const blur = parseInt(localStorage.getItem('tkVeilBlur') || '0', 10);
  const veilSlider = document.getElementById('tk-settings-veil');
  const blurSlider = document.getElementById('tk-settings-blur');
  if (veilSlider) veilSlider.value = veil;
  if (blurSlider) blurSlider.value = blur;
  document.getElementById('tk-settings-veil-val').textContent = veil + '%';
  document.getElementById('tk-settings-blur-val').textContent = blur + ' px';
}

function closeTasksSettings() {
  document.getElementById('tk-settings-overlay')?.classList.add('hidden');
}

function initTasksSettingsModal() {
  const overlay = document.getElementById('tk-settings-overlay');
  if (!overlay || overlay.dataset.bound) return;
  overlay.dataset.bound = '1';

  document.getElementById('tk-settings-close')?.addEventListener('click', closeTasksSettings);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeTasksSettings(); });

  const dropzone = document.getElementById('tk-settings-dropzone');
  const fileInput = document.getElementById('tk-settings-file');
  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
    dropzone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) await saveWallpaper(file);
    });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (file) await saveWallpaper(file);
    });
  }

  document.getElementById('tk-settings-remove')?.addEventListener('click', () => {
    clearWallpaper();
    showToast('Image de fond retirée', 'info', 1500);
  });

  const veilSlider = document.getElementById('tk-settings-veil');
  veilSlider?.addEventListener('input', () => {
    const v = parseInt(veilSlider.value, 10);
    document.getElementById('tk-settings-veil-val').textContent = v + '%';
    localStorage.setItem('tkVeilOpacity', String(v));
    const b = parseInt(localStorage.getItem('tkVeilBlur') || '0', 10);
    applyVeilSettings(v, b);
  });

  const blurSlider = document.getElementById('tk-settings-blur');
  blurSlider?.addEventListener('input', () => {
    const b = parseInt(blurSlider.value, 10);
    document.getElementById('tk-settings-blur-val').textContent = b + ' px';
    localStorage.setItem('tkVeilBlur', String(b));
    const v = parseInt(localStorage.getItem('tkVeilOpacity') || '60', 10);
    applyVeilSettings(v, b);
  });
}

async function saveWallpaper(file) {
  try {
    await tkDbSet('wallpaper', file);
    applyWallpaperFromBlob(file);
    showToast('Image de fond appliquée', 'success', 1500);
  } catch (e) {
    showToast('Erreur enregistrement', 'error');
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTasksBindings);
} else {
  initTasksBindings();
}

// ── Global shortcuts (only fire when tasks tab visible and no input focused) ──
function onTasksGlobalShortcut(e) {
  if (!isTasksTabVisible()) return;
  // Cmd+K opens search regardless of focus
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openTasksSearch();
    return;
  }
  // Cmd+Z = undo, Cmd+Shift+Z = redo (these work even with focus on inputs)
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    // Skip if focus is in an input/textarea — let native undo work first
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable) return;
    e.preventDefault();
    if (e.shiftKey) tasksRedo();
    else tasksUndo();
    return;
  }
  // Other shortcuts: only when not typing
  const tag = (document.activeElement?.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === '/') {
    e.preventDefault();
    openTasksSearch();
  } else if (e.key.toLowerCase() === 'n') {
    e.preventDefault();
    // Create new task in hovered column (fallback: first column)
    const colId = tasksHoveredColumnId || (tasksBoard[0]?.id);
    if (!colId) return;
    const btn = document.querySelector(`[data-add-task="${colId}"]`);
    if (btn) {
      btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      addTaskInline(colId, btn);
    }
  } else if (e.key.toLowerCase() === 'c') {
    // Delete current panel task
    if (currentPanelTaskId) {
      e.preventDefault();
      const id = currentPanelTaskId;
      closeTaskPanel();
      deleteTaskWithUndo(id);
    }
  } else if (e.key === '1') {
    // Tab "Tableau" — already on tasks tab
    e.preventDefault();
  }
}

function isTasksTabVisible() {
  const t = document.getElementById('tab-tasks');
  return t && t.classList.contains('active');
}

// ── Search palette ──
let tasksSearchSelected = 0;
let tasksSearchResults = [];

function openTasksSearch() {
  const overlay = document.getElementById('tk-search-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  const input = document.getElementById('tk-search-input');
  if (input) {
    input.value = '';
    setTimeout(() => input.focus(), 50);
  }
  tasksSearchSelected = 0;
  renderSearchResults('');

  if (!overlay.dataset.bound) {
    overlay.dataset.bound = '1';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeTasksSearch();
    });
    input.addEventListener('input', () => {
      tasksSearchSelected = 0;
      renderSearchResults(input.value);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeTasksSearch(); }
      else if (e.key === 'ArrowDown') {
        e.preventDefault();
        tasksSearchSelected = Math.min(tasksSearchResults.length - 1, tasksSearchSelected + 1);
        renderSearchResults(input.value, true);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        tasksSearchSelected = Math.max(0, tasksSearchSelected - 1);
        renderSearchResults(input.value, true);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const result = tasksSearchResults[tasksSearchSelected];
        if (result) {
          closeTasksSearch();
          openTaskPanel(result.task.id);
        }
      }
    });
  }
}

function closeTasksSearch() {
  const overlay = document.getElementById('tk-search-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function scoreTask(task, query) {
  if (!query) return 0;
  const q = query.toLowerCase();
  const title = (task.text || '').toLowerCase();
  const desc = (task.description || '').toLowerCase();
  const tags = Array.isArray(task.tags) ? task.tags.join(' ').toLowerCase() : '';
  let score = 0;
  if (title.startsWith(q)) score += 100;
  if (title.includes(q)) score += 70;
  if (tags.includes(q)) score += 50;
  if (desc.includes(q)) score += 20;
  // Fuzzy: all chars in q appear in title in order
  let i = 0;
  for (const c of title) { if (c === q[i]) i++; if (i >= q.length) break; }
  if (i === q.length) score += 10;
  return score;
}

function renderSearchResults(query, keepSelection) {
  const resultsEl = document.getElementById('tk-search-results');
  if (!resultsEl) return;
  const allTasks = tasksBoard.flatMap(c => c.tasks.map(t => ({ task: t, col: c })));
  const q = query.trim();
  if (!q) {
    // Show recent tasks (most recently created — by id desc)
    tasksSearchResults = allTasks
      .slice()
      .sort((a, b) => b.task.id - a.task.id)
      .slice(0, 12);
  } else {
    const scored = allTasks
      .map(item => ({ ...item, score: scoreTask(item.task, q) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
    tasksSearchResults = scored;
  }
  if (!keepSelection) tasksSearchSelected = 0;
  if (tasksSearchSelected >= tasksSearchResults.length) tasksSearchSelected = Math.max(0, tasksSearchResults.length - 1);

  if (tasksSearchResults.length === 0) {
    resultsEl.innerHTML = '<div class="tk-search-empty">Aucune tâche trouvée</div>';
    return;
  }

  resultsEl.innerHTML = tasksSearchResults.map((r, i) => `
    <div class="tk-search-item ${i === tasksSearchSelected ? 'selected' : ''}" data-search-idx="${i}">
      <span class="tk-search-dot" style="background:${r.col.color}"></span>
      <div class="tk-search-text">
        <div class="tk-search-title">${escapeHtml(r.task.text)}</div>
        <div class="tk-search-col">${escapeHtml(r.col.name)}</div>
      </div>
    </div>
  `).join('');

  resultsEl.querySelectorAll('[data-search-idx]').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.searchIdx, 10);
      const result = tasksSearchResults[idx];
      if (result) {
        closeTasksSearch();
        openTaskPanel(result.task.id);
      }
    });
    el.addEventListener('mouseenter', () => {
      tasksSearchSelected = parseInt(el.dataset.searchIdx, 10);
      resultsEl.querySelectorAll('.tk-search-item').forEach((it, i) => {
        it.classList.toggle('selected', i === tasksSearchSelected);
      });
    });
  });
}

// ═══════════════════════════════════════════════════════════════════
// PILOTAGE — Stockage local des valeurs (V1, à migrer en API plus tard)
// ═══════════════════════════════════════════════════════════════════
const PILOTAGE_STORE_PREFIX = 'pilot:v1:';

function pilotageStoreRead(key) {
  try {
    const v = localStorage.getItem(PILOTAGE_STORE_PREFIX + key);
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  } catch (_) { return null; }
}

function pilotageStoreWrite(key, value) {
  try {
    if (value === '' || value == null || Number.isNaN(Number(value))) {
      localStorage.removeItem(PILOTAGE_STORE_PREFIX + key);
    } else {
      localStorage.setItem(PILOTAGE_STORE_PREFIX + key, String(Number(value)));
    }
  } catch (_) {}
}

// Variantes JSON pour stocker des structures (ex: listes d'items)
function pilotageStoreReadJson(key) {
  try {
    const v = localStorage.getItem(PILOTAGE_STORE_PREFIX + key);
    if (!v) return null;
    return JSON.parse(v);
  } catch (_) { return null; }
}
function pilotageStoreWriteJson(key, value) {
  try {
    if (!value || (Array.isArray(value) && value.length === 0)) {
      localStorage.removeItem(PILOTAGE_STORE_PREFIX + key);
    } else {
      localStorage.setItem(PILOTAGE_STORE_PREFIX + key, JSON.stringify(value));
    }
  } catch (_) {}
}

// Lit une valeur niveau Groupe (top-level Pennylane, indépendant des clubs)
function pilotageReadGroup(periodSig, subKey) {
  return pilotageStoreRead(`__group__|${periodSig}|${subKey}`);
}

// Totaux niveau Groupe pour une période (somme des recettes ou des dépenses)
function pilotageGroupTotals(periodSig) {
  let totalRec = 0, recCount = 0;
  for (const r of PF_GROUP_RECETTES) {
    const v = pilotageReadGroup(periodSig, `grec:${r.key}`);
    if (v != null) { totalRec += v; recCount++; }
  }
  let totalDep = 0, depCount = 0;
  for (const d of PF_GROUP_DEPENSES) {
    const v = pilotageReadGroup(periodSig, `gdep:${d.key}`);
    if (v != null) { totalDep += v; depCount++; }
  }
  return { recettes: recCount > 0 ? totalRec : null, depenses: depCount > 0 ? totalDep : null, recCount, depCount };
}

// Formate une Date JS en YYYY-MM-DD en LOCAL (évite le shift UTC qui causait
// un décalage de ±1 jour en France lors de l'utilisation de toISOString()).
function pilotageToLocalISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Signature de période → utilisée dans la clé de stockage pour qu'un mois,
// une semaine, un trimestre, etc. soient distincts.
function pilotagePeriodSig(period, anchorISO, customStart, customEnd) {
  if (period === 'custom') return `custom-${customStart || '-'}_${customEnd || '-'}`;
  if (period === 'day')   return `day-${anchorISO}`;
  if (period === 'week') {
    const d = new Date(anchorISO + 'T00:00:00');
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    return `week-${d.toISOString().slice(0, 10)}`;
  }
  if (period === 'month')   return `month-${anchorISO.slice(0, 7)}`;
  if (period === 'quarter') {
    const d = new Date(anchorISO + 'T00:00:00');
    const q = Math.floor(d.getMonth() / 3) + 1;
    return `quarter-${d.getFullYear()}-Q${q}`;
  }
  return 'unknown';
}

// Détermine la liste des clubs effectifs.
// state.clubs : liste de noms (vide = aucun club).
function pilotageEffectiveClubs(state) {
  if (Array.isArray(state.clubs)) {
    if (state.clubs.includes('all')) return PILOTAGE_CLUBS.slice();
    return state.clubs.slice();
  }
  if (state.club) {
    return state.club === 'all' ? PILOTAGE_CLUBS.slice() : [state.club];
  }
  return [];
}

// Identifiant canonique du scope de clubs sélectionné, utilisé comme préfixe de clé de stockage.
// Permet d'enregistrer des valeurs distinctes pour : un club unique, "tous les clubs", ou un multi.
function pilotageClubScopeKey(state) {
  if (Array.isArray(state.clubs)) {
    if (state.clubs.includes('all') || state.clubs.length === 0) return '__all__';
    if (state.clubs.length === 1) return state.clubs[0];
    return '__multi__:' + state.clubs.slice().sort().join('+');
  }
  if (state.club) {
    return state.club === 'all' ? '__all__' : state.club;
  }
  return '__all__';
}

// Lit la valeur pour le scope courant. Si rien n'a été saisi directement pour ce scope,
// et que le scope est multi-clubs, tente une agrégation depuis les valeurs individuelles
// comme fallback. La cellule reste toujours éditable.
function pilotageResolveValue(state, storageSubKey, format, aggOverride) {
  const periodSig = pilotagePeriodSig(state.period, state.dateAnchor, state.customStart, state.customEnd);
  const scope = pilotageClubScopeKey(state);
  const key = `${scope}|${periodSig}|${storageSubKey}`;
  // Valeur directe pour le scope courant
  const direct = pilotageStoreRead(key);
  if (direct != null) {
    return { value: direct, editKey: key, editable: true, aggregate: false };
  }
  // Pas de valeur directe → si on est en multi/tous-clubs, tente un agrégat depuis les clubs individuels
  if (scope === '__all__' || scope.startsWith('__multi__:')) {
    const clubs = pilotageEffectiveClubs(state);
    if (clubs.length > 1) {
      let total = 0, count = 0;
      for (const c of clubs) {
        const v = pilotageStoreRead(`${c}|${periodSig}|${storageSubKey}`);
        if (v != null) { total += v; count++; }
      }
      if (count > 0) {
        const aggType = aggOverride || (format === 'pct' ? 'avg' : 'sum');
        const aggValue = aggType === 'avg' ? (total / count) : total;
        // L'agrégat est une valeur de fallback : la cellule reste éditable
        // (taper une valeur remplacera le calcul automatique pour le scope courant)
        return { value: aggValue, editKey: key, editable: true, aggregate: true, aggCount: count };
      }
    }
  }
  // Aucune valeur ni fallback
  return { value: null, editKey: key, editable: true, aggregate: false };
}

// Génère le HTML d'une valeur cliquable/éditable
function pilotageEditableValueHtml(state, storageSubKey, format, aggOverride, baseClass) {
  const r = pilotageResolveValue(state, storageSubKey, format, aggOverride);
  const display = pilotageFormatValue(r.value, format);
  const cls = baseClass + ' editable' + (r.aggregate ? ' aggregate' : '');
  const tooltip = r.aggregate
    ? `Agrégat auto de ${r.aggCount} club(s) — clique pour saisir une valeur consolidée qui prendra le dessus`
    : 'Cliquer pour saisir une valeur';
  return `<span class="${cls}" data-edit-key="${escapeHtml(r.editKey)}" data-format="${format}" tabindex="0" title="${tooltip}">${display}</span>`;
}

// Handler de clic pour transformer une cellule éditable en input
function pilotageHandleEditClick(e, reRender) {
  const span = e.target.closest('[data-edit-key]');
  if (!span || span.tagName === 'INPUT' || span.classList.contains('editing')) return;
  const editKey = span.dataset.editKey;
  const format = span.dataset.format || 'int';
  const current = pilotageStoreRead(editKey);

  const input = document.createElement('input');
  input.type = 'number';
  input.step = format === 'pct' ? '0.1' : '1';
  input.value = current != null ? current : '';
  input.className = 'pilotage-kpi-input';
  input.placeholder = '—';
  span.replaceWith(input);
  input.focus();
  input.select();

  let done = false;
  const commit = () => {
    if (done) return; done = true;
    pilotageStoreWrite(editKey, input.value.trim());
    reRender();
  };
  const cancel = () => {
    if (done) return; done = true;
    reRender();
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter')      { ev.preventDefault(); input.blur(); }
    else if (ev.key === 'Escape'){ ev.preventDefault(); cancel(); }
  });
}

// ═══════════════════════════════════════════════════════════════════
// PILOTAGE — Tableau de bord funnel commercial (admin uniquement)
// ═══════════════════════════════════════════════════════════════════
//
// Cette V1 pose la structure d'affichage :
//   - 5 cartes (Marketing / Phoning / Conseillers forme / Coach leader / Coach sportif)
//   - 3 KPIs par carte (placeholders "—" pour l'instant)
//   - Filtres : club + période (jour/semaine/mois/trimestre) + nav date
//
// Évolutions futures (préparées dans la structure) :
//   - Brancher `fetchPilotageData(state)` pour récupérer des vraies valeurs
//   - Ajouter `objective` à chaque KPI → calcul d'un statut vert/orange/rouge
//   - Ajouter `trend` / sparkline d'évolution
//   - Liste dynamique des clubs depuis l'API
// -------------------------------------------------------------------

// agg: stratégie d'agrégation multi-clubs ('sum' par défaut pour int/eur, 'avg' pour pct).
// Override explicite pour les unitaires (CPL, CAC, panier moyen, ratio).
const PILOTAGE_CATEGORIES = [
  {
    key: 'marketing',
    label: 'Marketing',
    icon: '📣',
    accent: '#6366F1', // indigo
    kpis: [
      { key: 'leads', label: 'Leads', format: 'int', agg: 'sum' },
      { key: 'cpl',   label: 'CPL',   format: 'eur', agg: 'avg' },
    ],
  },
  {
    key: 'phoning',
    label: 'Phoning',
    icon: '📞',
    accent: '#06B6D4', // cyan
    kpis: [
      { key: 'rdv_fixes',   label: 'RDV fixés',   format: 'int', agg: 'sum' },
      { key: 'non_traites', label: 'Non traités', format: 'int', agg: 'sum' },
    ],
  },
  {
    key: 'conseillers',
    label: 'Conseillers forme',
    icon: '🧑‍💼',
    accent: '#F59E0B', // amber
    kpis: [
      { key: 'transfo', label: 'Transfo', format: 'pct', agg: 'avg' },
      { key: 'show_up', label: 'Show Up', format: 'pct', agg: 'avg' },
    ],
  },
  {
    key: 'coach_leader',
    label: 'Coach leader',
    icon: '🏅',
    accent: '#8B5CF6', // violet
    kpis: [
      { key: 'resiliation', label: 'Résiliation', format: 'pct', agg: 'avg' },
      { key: 'remplissage', label: 'Remplissage', format: 'pct', agg: 'avg' },
    ],
  },
];

// État courant de l'onglet (en mémoire seulement, pas de persistance V1)
let pilotageState = {
  club: 'all',                   // 'all' | club name
  period: 'month',               // 'day' | 'week' | 'month' | 'quarter' | 'custom'
  dateAnchor: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
  customStart: '',               // YYYY-MM-DD (utilisé si period === 'custom')
  customEnd: '',                 // YYYY-MM-DD (utilisé si period === 'custom')
};

// ── Helpers de formatage ────────────────────────────────────────────
function pilotageFormatValue(value, format) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  switch (format) {
    case 'eur':
      return n.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €';
    case 'pct':
      return n.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %';
    case 'int':
    default:
      return n.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
  }
}

function pilotageFormatRange(period, anchorISO, customStart, customEnd) {
  if (period === 'custom') {
    if (!customStart || !customEnd) return '—';
    const a = new Date(customStart + 'T00:00:00');
    const b = new Date(customEnd + 'T00:00:00');
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return '—';
    const opts = { day: '2-digit', month: 'short', year: 'numeric' };
    return `${a.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} – ${b.toLocaleDateString('fr-FR', opts)}`;
  }
  const d = new Date(anchorISO + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '—';
  const opts = { day: '2-digit', month: 'short', year: 'numeric' };
  if (period === 'day') {
    return d.toLocaleDateString('fr-FR', opts);
  }
  if (period === 'week') {
    // Lundi → dimanche
    const monday = new Date(d);
    const day = (monday.getDay() + 6) % 7; // 0=Mon
    monday.setDate(monday.getDate() - day);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    return `${monday.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} – ${sunday.toLocaleDateString('fr-FR', opts)}`;
  }
  if (period === 'month') {
    return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }
  if (period === 'quarter') {
    const q = Math.floor(d.getMonth() / 3) + 1;
    return `T${q} ${d.getFullYear()}`;
  }
  return '—';
}

function pilotageShiftAnchor(period, anchorISO, dir /* -1 | +1 */) {
  const d = new Date(anchorISO + 'T00:00:00');
  if (period === 'day')     d.setDate(d.getDate() + dir);
  if (period === 'week')    d.setDate(d.getDate() + 7 * dir);
  if (period === 'month')   d.setMonth(d.getMonth() + dir);
  if (period === 'quarter') d.setMonth(d.getMonth() + 3 * dir);
  // IMPORTANT : format local pour éviter le shift UTC (-1/-2 jours selon fuseau)
  return pilotageToLocalISODate(d);
}

// ── Source de données (V1: tout vide) ───────────────────────────────
// Plus tard, cette fonction appellera /api/pilotage/... et retournera
// un objet { marketing: { leads: 142, cpl: 18, cac: 95 }, phoning: {...}, ... }
async function fetchPilotageData(/* state */) {
  // TODO V2: brancher l'API quand les indicateurs seront calculables côté serveur
  return {};
}

// ── Liste des clubs (V1: liste figée, à brancher sur une API plus tard) ──
// Tourcoing / Ginkgo Sport est exclu volontairement : on ne l'analyse plus
// dans l'EBE Groupe ni nulle part dans la page Pilotage Funnel.
const PILOTAGE_CLUBS = [
  'Neuilly-sur-Seine',
  'Levallois-Perret',
  'Boulogne-Billancourt',
  'Wasquehal',
  'Marcq-en-Barœul',
  'Lille',
];

async function fetchPilotageClubs() {
  // TODO V2: GET /api/clubs ou dérivé depuis les coaches/sales_reps
  return [
    { value: 'all', label: 'Tous les clubs' },
    ...PILOTAGE_CLUBS.map(c => ({ value: c, label: c })),
  ];
}

// ── Render ──────────────────────────────────────────────────────────
async function loadPilotage() {
  if (!isAdmin()) return; // safety net
  // Initialise la liste des clubs (une seule fois)
  const clubSelect = document.getElementById('pilotage-club');
  if (clubSelect && !clubSelect.dataset.bound) {
    const clubs = await fetchPilotageClubs();
    clubSelect.innerHTML = clubs.map(c => `<option value="${c.value}">${escapeHtml(c.label)}</option>`).join('');
    clubSelect.value = pilotageState.club;
    clubSelect.addEventListener('change', () => {
      pilotageState.club = clubSelect.value;
      renderPilotage();
    });
    clubSelect.dataset.bound = '1';
  }

  // Bind période (pills)
  document.querySelectorAll('#pilotage-period .pilotage-period-btn').forEach(btn => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      pilotageState.period = btn.dataset.period;
      document.querySelectorAll('#pilotage-period .pilotage-period-btn')
        .forEach(b => b.classList.toggle('active', b === btn));
      // En mode "custom", initialise les bornes si vides (dernier mois)
      if (pilotageState.period === 'custom' && (!pilotageState.customStart || !pilotageState.customEnd)) {
        const today = new Date();
        const monthAgo = new Date(); monthAgo.setMonth(monthAgo.getMonth() - 1);
        pilotageState.customStart = monthAgo.toISOString().slice(0, 10);
        pilotageState.customEnd = today.toISOString().slice(0, 10);
      }
      renderPilotage();
    });
  });

  // Bind navigation date
  const prevBtn = document.getElementById('pilotage-prev');
  const nextBtn = document.getElementById('pilotage-next');
  if (prevBtn && !prevBtn.dataset.bound) {
    prevBtn.dataset.bound = '1';
    prevBtn.addEventListener('click', () => {
      pilotageState.dateAnchor = pilotageShiftAnchor(pilotageState.period, pilotageState.dateAnchor, -1);
      renderPilotage();
    });
  }
  if (nextBtn && !nextBtn.dataset.bound) {
    nextBtn.dataset.bound = '1';
    nextBtn.addEventListener('click', () => {
      pilotageState.dateAnchor = pilotageShiftAnchor(pilotageState.period, pilotageState.dateAnchor, +1);
      renderPilotage();
    });
  }

  // Bind champs date custom
  const fromInput = document.getElementById('pilotage-date-from');
  const toInput = document.getElementById('pilotage-date-to');
  if (fromInput && !fromInput.dataset.bound) {
    fromInput.dataset.bound = '1';
    fromInput.addEventListener('change', () => {
      pilotageState.customStart = fromInput.value;
      renderPilotage();
    });
  }
  if (toInput && !toInput.dataset.bound) {
    toInput.dataset.bound = '1';
    toInput.addEventListener('change', () => {
      pilotageState.customEnd = toInput.value;
      renderPilotage();
    });
  }

  // Délégation de clic pour l'édition inline des KPIs
  const root = document.getElementById('tab-pilotage');
  if (root && !root.dataset.editBound) {
    root.dataset.editBound = '1';
    root.addEventListener('click', (e) => pilotageHandleEditClick(e, () => renderPilotage()));
  }

  await renderPilotage();
}

async function renderPilotage() {
  // Bascule nav ‹›  ↔  champs date custom
  const isCustom = pilotageState.period === 'custom';
  const navEl = document.getElementById('pilotage-date-nav');
  const customEl = document.getElementById('pilotage-date-custom');
  if (navEl) navEl.classList.toggle('hidden', isCustom);
  if (customEl) customEl.classList.toggle('hidden', !isCustom);
  if (isCustom) {
    const fromInput = document.getElementById('pilotage-date-from');
    const toInput = document.getElementById('pilotage-date-to');
    if (fromInput && fromInput.value !== pilotageState.customStart) fromInput.value = pilotageState.customStart || '';
    if (toInput && toInput.value !== pilotageState.customEnd) toInput.value = pilotageState.customEnd || '';
  }

  // Label de plage
  const lbl = document.getElementById('pilotage-date-label');
  if (lbl) lbl.textContent = pilotageFormatRange(pilotageState.period, pilotageState.dateAnchor, pilotageState.customStart, pilotageState.customEnd);

  // Récupère les valeurs (V1 = objet vide)
  const data = await fetchPilotageData(pilotageState);

  // Render des cartes
  const grid = document.getElementById('pilotage-grid');
  if (!grid) return;
  grid.innerHTML = PILOTAGE_CATEGORIES.map(cat => {
    const kpisHtml = cat.kpis.map(k => {
      const subKey = `cat:${cat.key}:${k.key}`;
      const valueHtml = pilotageEditableValueHtml(pilotageState, subKey, k.format, k.agg, 'pilotage-kpi-value');
      return `
        <div class="pilotage-kpi" data-cat="${cat.key}" data-kpi="${k.key}">
          <span class="pilotage-kpi-label">${escapeHtml(k.label)}</span>
          ${valueHtml}
          <span class="pilotage-kpi-status" aria-hidden="true"></span>
        </div>
      `;
    }).join('');
    return `
      <article class="pilotage-card" style="--pilotage-accent: ${cat.accent}" data-category="${cat.key}">
        <header class="pilotage-card-head">
          <span class="pilotage-card-icon" style="background: ${cat.accent}1a; color: ${cat.accent}">${cat.icon}</span>
          <h3 class="pilotage-card-title">${escapeHtml(cat.label)}</h3>
        </header>
        <div class="pilotage-card-kpis">
          ${kpisHtml}
        </div>
      </article>
    `;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════════
// PILOTAGE FUNNEL — Funnel commercial + indicateurs + finances (admin)
// ═══════════════════════════════════════════════════════════════════
//
// Structure V1 :
//   1. Filtres : période, plage, multi-clubs, comparaison (multi)
//   2. Cartes catégories (réutilise PILOTAGE_CATEGORIES)
//   3. Funnel vertical 4 étapes (Leads → RDV pris → RDV venus → Ventes)
//      + bandeau « ghost » de comparaison en filigrane
//      + taux de conversion entre chaque étape
//   4. Indicateurs complémentaires (CPL, no-show, transfo, résiliation)
//   5. Synthèse financière (CA TTC, CA HT, Dépenses, Cash-flow, Break-Even)
//
// Évolutions futures :
//   - fetchPilotageFunnelData(state) → branchement API
//   - Objectifs colorés sur les KPIs et le funnel
//   - Sparkline d'évolution
//   - Export PDF / Excel
// -------------------------------------------------------------------

const PF_FUNNEL_STAGES = [
  { key: 'leads',     label: 'Leads générés',      format: 'int', color: '#6366F1', agg: 'sum' },
  { key: 'rdv_pris',  label: 'RDV pris',           format: 'int', color: '#06B6D4', agg: 'sum' },
  { key: 'rdv_venus', label: 'RDV venus',          format: 'int', color: '#10B981', agg: 'sum' },
  { key: 'ventes',    label: 'Ventes',             format: 'int', color: '#F59E0B', agg: 'sum' },
];

const PF_SIDE_INDICATORS = [
  { key: 'cpl',         label: 'Coût par lead',          format: 'eur', agg: 'avg' },
  { key: 'no_show',     label: 'Taux de no-show',        format: 'pct', agg: 'avg' },
  { key: 'transfo',     label: 'Taux de transformation', format: 'pct', agg: 'avg' },
  { key: 'resiliation', label: 'Résiliation',            format: 'int', agg: 'sum' },
];

// Seules CA et Dépenses sont éditables — utilisé par les imports Pennylane (parser).
const PF_FINANCIALS = [
  { key: 'ca_ttc',    label: 'CA',         format: 'eur', tone: 'neutral',   editable: true,  agg: 'sum' },
  { key: 'depenses',  label: 'Dépenses',   format: 'eur', tone: 'negative',  editable: true,  agg: 'sum' },
  { key: 'cashflow',  label: 'Cash-flow',  format: 'eur', tone: 'highlight', editable: false },
  { key: 'ebe_pct',   label: 'EBE',        format: 'pct', tone: 'highlight', editable: false },
];

// Cellules consolidées affichées dans la carte « EBE consolidés » au-dessus de la Synthèse.
// Chaque scope définit quels CA et Dépenses additionner (en TTC) ; l'EBE est ensuite
// calculé en HT sur le total : on N'AGRÈGE JAMAIS d'EBE individuels (pas de moyenne
// de pourcentages). On somme TOUTES les recettes, on somme TOUTES les dépenses,
// puis on applique la formule EBE = (Σ CA_HT − Σ Dépenses) / Σ CA_HT × 100
// avec Σ CA_HT = (Σ CA_TTC) ÷ 1,20.
const PF_CONSOLIDATED_EBE = [
  { key: 'mycoach',         label: 'EBE My Coach',             scope: ['mycoach'] },
  { key: 'mycoach_franch',  label: 'EBE My Coach + Franchise', scope: ['mycoach', 'franchise'] },
  // EBE consolidé Groupe = 6 My Coach + Franchise (Tourcoing exclu — l'entité
  // Ginkgo Sport n'est plus analysée dans cette page). Valeurs déjà HT via
  // Σ CA TTC ÷ 1,20, donc ni Taxes ni Frais Groupe à ajouter côté dépenses.
  { key: 'groupe',          label: 'EBE Groupe',               scope: ['mycoach', 'franchise'] },
];

// Les 6 clubs My Coach (sans Tourcoing) — utilisés pour les agrégats
const PF_MYCOACH_CLUBS = ['Lille', 'Levallois-Perret', 'Boulogne-Billancourt', 'Marcq-en-Barœul', 'Wasquehal', 'Neuilly-sur-Seine'];

// Calcule l'EBE consolidé pour un scope donné.
//
// PRINCIPE (important — ne PAS confondre avec une moyenne d'EBE) :
//   1. On agrège (somme arithmétique) TOUTES les recettes (CA TTC) du scope
//      → `totalCa`
//   2. On agrège (somme arithmétique) TOUTES les dépenses du scope
//      → `totalDep`
//   3. On applique UNE SEULE fois la conversion TVA : Σ CA_HT = Σ CA_TTC ÷ 1,20
//   4. EBE consolidé = (Σ CA_HT − Σ Dépenses) / Σ CA_HT × 100
//
// On ne calcule JAMAIS l'EBE de chaque club séparément pour ensuite faire une
// moyenne — la moyenne arithmétique des pourcentages ne donne pas le même
// résultat qu'un EBE calculé sur les totaux (et c'est cette dernière valeur
// qui a un sens financier).
// Variante qui retourne le détail complet du calcul (pour affichage tooltip / panel)
// Structure : { entries:[{label,ca,dep,group}], totalCa, caHt, totalDep, ebe }
function pilotageConsolidatedEbeBreakdown(periodSig, scopeArr) {
  const entries = [];
  let totalCa = 0, totalDep = 0, hasAny = false;
  if (scopeArr.includes('mycoach')) {
    for (const club of PF_MYCOACH_CLUBS) {
      const ca  = pilotageStoreRead(`${club}|${periodSig}|fin:ca_ttc`);
      const dep = pilotageStoreRead(`${club}|${periodSig}|fin:depenses`);
      entries.push({ label: club, ca, dep, group: 'My Coach' });
      if (ca != null)  { totalCa += ca; hasAny = true; }
      if (dep != null) { totalDep += dep; hasAny = true; }
    }
  }
  if (scopeArr.includes('franchise')) {
    const fca  = pilotageStoreRead(`__group__|${periodSig}|grec:franchises`);
    const fdep = pilotageStoreRead(`__group__|${periodSig}|gdep:franchise`);
    entries.push({ label: 'Franchise', ca: fca, dep: fdep, group: 'Franchise' });
    if (fca != null)  { totalCa += fca; hasAny = true; }
    if (fdep != null) { totalDep += fdep; hasAny = true; }
  }
  // (Scope 'tourcoing' désormais supprimé — Ginkgo Sport n'est plus analysé
  //  dans l'EBE Groupe ni ailleurs dans la page Pilotage Funnel.)
  // Pas de lignes « Taxes » ou « Groupe Gingko Sport » côté dépenses :
  // les valeurs Pennylane sont déjà en HT (la TVA est retirée via la
  // conversion CA TTC ÷ 1,20 sur le total agrégé), donc inclure les
  // décaissements fiscaux dans l'EBE serait redondant.
  const caHt = totalCa / 1.20;
  let ebe = null;
  if (hasAny && totalCa !== 0 && caHt !== 0) {
    ebe = ((caHt - totalDep) / caHt) * 100;
  }
  return { entries, totalCa, caHt, totalDep, ebe, hasAny };
}

function pilotageConsolidatedEbe(periodSig, scopeArr) {
  // Source unique de vérité : on délègue au breakdown (qui sait gérer le
  // scope 'taxes' et toute future extension) et on retourne le ratio final.
  const b = pilotageConsolidatedEbeBreakdown(periodSig, scopeArr);
  if (!b.hasAny || b.totalCa === 0) return null;
  return b.ebe;
}

// Cellules affichées dans la Synthèse financière : 6 EBE clubs + CA Franchise
// (cellule EBE Ginkgo Sport retirée volontairement — l'entité Tourcoing
// n'est plus analysée dans cette page).
const PF_EBE_CELLS = [
  { type: 'club_ebe',     club: 'Lille',                label: 'EBE Lille' },
  { type: 'club_ebe',     club: 'Levallois-Perret',     label: 'EBE Levallois' },
  { type: 'club_ebe',     club: 'Boulogne-Billancourt', label: 'EBE Boulogne' },
  { type: 'club_ebe',     club: 'Marcq-en-Barœul',      label: 'EBE Marcq' },
  { type: 'club_ebe',     club: 'Wasquehal',            label: 'EBE Wasquehal' },
  { type: 'club_ebe',     club: 'Neuilly-sur-Seine',    label: 'EBE Neuilly' },
  { type: 'franchise_ca',                               label: 'CA Franchise' },
];

// Recettes complémentaires niveau Groupe (Pennylane → rows hors My Coach by Ginkgo)
// Produit exceptionnel = total Groupe Gingko Sport (= subv apprentis + recouvrement
// + produit exceptionnel + remboursement intérêt + autres).
// Note : Tourcoing n'est PAS ici (il est un club à part entière via PENNYLANE_CLUB_MAP),
// donc son CA et ses Dépenses sont stockés sous Tourcoing|sig|fin:ca_ttc / fin:depenses
// avec breakdown détaillé (Masse salariale, Bâtiment, etc.).
const PF_GROUP_RECETTES = [
  { key: 'franchises',     label: 'Franchisés',           pennylane: 'franchisés my coach by ginkgo', section: 'enc' },
  { key: 'produit_except', label: 'Produit exceptionnel', pennylane: 'groupe gingko sport',         section: 'enc' },
];

// Dépenses Groupe (hors clubs My Coach et Tourcoing)
const PF_GROUP_DEPENSES = [
  { key: 'groupe',    label: 'Frais Groupe',  pennylane: 'groupe gingko sport',           section: 'dec' },
  { key: 'franchise', label: 'Franchise',     pennylane: 'franchise my coach by ginkgo', section: 'dec' },
  { key: 'taxes',     label: 'Taxes',         pennylane: 'taxes',                         section: 'dec' },
];

// Décomposition des dépenses — cliquable sous la cellule Dépenses
// Pour Ginkgo Sport (Tourcoing), pas de section « Bâtiment » dédiée, donc on
// agrège dans « Bâtiment » les sections équivalentes : Leasing, Prêts bancaire,
// Consommation énergétique (= fluides chez My Coach).
const PF_DEPENSES_BREAKDOWN = [
  { key: 'salaire',        label: 'Masse salariale',         keywords: ['masse salariale'] },
  { key: 'batiment',       label: 'Bâtiment',                keywords: [
      'bâtiment', 'batiment',
      'leasing',
      'prêts bancaire', 'prets bancaire', 'prêt bancaire', 'pret bancaire',
      'consommation énergétique', 'consommation energetique',
  ] },
  { key: 'marketing',      label: 'Marketing',               keywords: ['marketing'] },
  { key: 'fonctionnement', label: 'Frais de fonctionnement', keywords: ['frais de fonctionnement', 'remboursement adhérent', 'remboursement adherent', 'remboursement adhérents', 'remboursement adherents'] },
];

// État (en mémoire)
let pilotageFunnelState = {
  period: 'month',         // 'day' | 'week' | 'month' | 'quarter' | 'custom'
  dateAnchor: pilotageToLocalISODate(new Date()),
  customStart: '',
  customEnd: '',
  clubs: [],               // [] = aucun club (rien filtré) | liste de noms (1+)
  compareWith: [],         // [] = pas de compare, ['__others__'] = moyenne du groupe (tous clubs), ou liste de noms
  scope: 'none',           // 'none' (par défaut, rien affiché sauf si club spécifique) | 'mycoach' | 'group'
  detailCatOpen: null,     // null | 'salaire' | 'batiment' | 'marketing' | 'fonctionnement' — catégorie dépliée dans la carte détail
  consolDetailOpen: null,  // null | 'mycoach' | 'mycoach_franch' | 'groupe' — cellule EBE consolidé dépliée
};

// Cache des clubs disponibles
let pfClubsCache = null;

// ── Helpers ─────────────────────────────────────────────────────────
function pfFormat(value, format) {
  return pilotageFormatValue(value, format); // réutilise le formateur Pilotage
}

function pfFormatRange(period, anchorISO, customStart, customEnd) {
  return pilotageFormatRange(period, anchorISO, customStart, customEnd); // idem
}

function pfShiftAnchor(period, anchor, dir) {
  return pilotageShiftAnchor(period, anchor, dir);
}

// ── Source de données ──────────────────────────────────────────────
// Les valeurs principales sont résolues directement par pilotageResolveValue()
// au moment du render (lecture localStorage). Ici on calcule uniquement la
// donnée de comparaison à partir des clubs choisis dans state.compareWith.
async function fetchPilotageFunnelData(state) {
  const compareWith = state.compareWith || [];
  if (compareWith.length === 0) {
    return { main: {}, compare: null };
  }

  // Résoudre la liste des clubs à agréger pour la comparaison
  let compareClubs;
  if (compareWith.includes('__others__')) {
    // Moyenne du groupe : moyenne sur TOUS les clubs (incluant le club sélectionné),
    // pour comparer la performance d'un club à la performance globale du réseau.
    compareClubs = PILOTAGE_CLUBS.slice();
  } else {
    // Cumul de clubs spécifiques
    compareClubs = compareWith.slice();
  }
  if (compareClubs.length === 0) {
    return { main: {}, compare: null };
  }

  const periodSig = pilotagePeriodSig(state.period, state.dateAnchor, state.customStart, state.customEnd);

  // Helper : agrège une valeur (sum ou avg) depuis la liste des clubs de comparaison
  const aggregate = (subKey, format, aggOverride) => {
    let total = 0, count = 0;
    for (const c of compareClubs) {
      const v = pilotageStoreRead(`${c}|${periodSig}|${subKey}`);
      if (v != null) { total += v; count++; }
    }
    if (count === 0) return null;
    const agg = aggOverride || (format === 'pct' ? 'avg' : 'sum');
    return agg === 'avg' ? (total / count) : total;
  };

  // Funnel stages
  const funnel = {};
  PF_FUNNEL_STAGES.forEach(s => {
    funnel[s.key] = aggregate(`fnl:${s.key}`, s.format, s.agg);
  });
  // Side indicators
  const indicators = {};
  PF_SIDE_INDICATORS.forEach(i => {
    indicators[i.key] = aggregate(`side:${i.key}`, i.format, i.agg);
  });
  // Catégories
  const categories = {};
  PILOTAGE_CATEGORIES.forEach(cat => {
    categories[cat.key] = {};
    cat.kpis.forEach(k => {
      categories[cat.key][k.key] = aggregate(`cat:${cat.key}:${k.key}`, k.format, k.agg);
    });
  });
  // Synthèse financière (modèle trésorerie : encaissements − décaissements)
  const financials = {};
  financials.ca_ttc   = aggregate('fin:ca_ttc',   'eur', 'sum');
  financials.depenses = aggregate('fin:depenses', 'eur', 'sum');
  if (financials.ca_ttc != null && financials.depenses != null) {
    financials.cashflow = financials.ca_ttc - financials.depenses;
    if (financials.ca_ttc !== 0) {
      financials.ebe_pct = (financials.cashflow / financials.ca_ttc) * 100;
    }
  }
  // Breakdown dépenses
  const depBreakdown = {};
  PF_DEPENSES_BREAKDOWN.forEach(cat => {
    depBreakdown[cat.key] = aggregate(`fin:dep_${cat.key}`, 'eur', 'sum');
  });

  return { main: {}, compare: { funnel, indicators, categories, financials, depBreakdown } };
}

async function fetchPilotageFunnelClubs() {
  if (pfClubsCache) return pfClubsCache;
  // TODO V2: appeler une vraie API. Liste partagée avec l'onglet Pilotage.
  pfClubsCache = PILOTAGE_CLUBS.slice();
  return pfClubsCache;
}

// ── Import Pennylane (Plan de trésorerie) ─────────────────────────
// Parse un export xlsx Pennylane et alimente localStorage avec CA + Dépenses
// par club et par mois, pour les 6 clubs de l'app.

const PENNYLANE_CLUB_MAP = {
  // Excel label (lowercase trimmed) → club name dans PILOTAGE_CLUBS
  'wasquehal':            'Wasquehal',
  'vieux lille':          'Lille',
  'lille':                'Lille',
  'marcq-en-baroeul':     'Marcq-en-Barœul',
  'marcq-en-barœul':      'Marcq-en-Barœul',
  'boulogne billancourt': 'Boulogne-Billancourt',
  'boulogne-billancourt': 'Boulogne-Billancourt',
  'neuilly-sur-seine':    'Neuilly-sur-Seine',
  'neuilly sur seine':    'Neuilly-sur-Seine',
  'levallois-perret':     'Levallois-Perret',
  'levallois perret':     'Levallois-Perret',
  'ginkgo sport':         'Tourcoing',
};

// Lignes top-level dans Pennylane (sections / clubs) — utilisé pour borner
// le scan des sous-catégories de dépenses (Masse salariale, Bâtiment, etc.)
// afin d'éviter de déborder sur la section voisine (Taxes, Lambersart, etc.).
const PENNYLANE_TOP_BOUNDARIES = new Set([
  'groupe gingko sport',
  'my coach by ginkgo',
  'franchisés my coach by ginkgo',
  'franchise my coach by ginkgo',
  'ginkgo sport',
  'lambersart',
  'lesquin',
  'ouverture my coach by ginkgo',
  'taxes',
  'virement interne',
  'a catégoriser',
]);

const PENNYLANE_MONTHS = {
  'janv': 1, 'jan': 1, 'janvier': 1,
  'févr': 2, 'fev': 2, 'fevr': 2, 'fév': 2, 'février': 2, 'fevrier': 2,
  'mars': 3,
  'avr':  4, 'avril': 4,
  'mai':  5,
  'juin': 6,
  'juil': 7, 'juillet': 7,
  'août': 8, 'aout': 8,
  'sept': 9, 'septembre': 9,
  'oct':  10, 'octobre': 10,
  'nov':  11, 'novembre': 11,
  'déc':  12, 'dec': 12, 'décembre': 12, 'decembre': 12,
};

// Réconcilie une liste d'items extraits d'une catégorie de dépenses Pennylane
// avec le total attendu (= valeur du sous-total parent). Pennylane peut contenir
// des sous-totaux imbriqués qui font apparaître la même valeur deux fois dans
// notre scan ligne-à-ligne (ex: Fluides = 122€ contient Électricité = 122€).
// Heuristique :
//   1. Si la somme des items > total : on cherche, en priorité, le sous-total
//      le plus probable :
//      a) un item dont la valeur égale UN sous-ensemble consécutif d'items
//         suivants (parent-enfants),
//      b) à défaut, un item dont la valeur égale exactement l'écart actuel.
//   2. On retire cet item et on recommence jusqu'à ce que la somme matche
//      le total ou qu'aucun candidat ne soit trouvé (safety break).
function reconcileBreakdownItems(items, target) {
  if (!Array.isArray(items) || items.length === 0) return items;
  if (target == null || Number.isNaN(Number(target))) return items.slice();
  const tolerance = 0.5; // tolérance pour erreurs de centimes
  const keep = new Array(items.length).fill(true);
  const currentSum = () => items.reduce((s, it, i) => keep[i] ? s + Number(it.value) : s, 0);
  let safety = 50;
  while (Math.abs(currentSum() - target) > tolerance && safety-- > 0) {
    const total = currentSum();
    if (total < target) break; // somme inférieure : on ne peut pas corriger en retirant
    let removed = false;
    // (1) Recherche d'un sous-total dont la valeur = somme d'items consécutifs suivants
    for (let i = 0; i < items.length - 1; i++) {
      if (!keep[i]) continue;
      const parentVal = Number(items[i].value);
      if (parentVal === 0) continue;
      let runSum = 0;
      let matched = false;
      for (let j = i + 1; j < items.length; j++) {
        if (!keep[j]) continue;
        runSum += Number(items[j].value);
        if (Math.abs(runSum - parentVal) < tolerance) { matched = true; break; }
        // Critère d'arrêt : si runSum dépasse parentVal dans la direction utile
        if (parentVal > 0 && runSum > parentVal + tolerance) break;
        if (parentVal < 0 && runSum < parentVal - tolerance) break;
      }
      if (matched) {
        keep[i] = false;
        removed = true;
        break;
      }
    }
    if (removed) continue;
    // (2) Recherche d'un item dont la valeur = écart exact
    const diff = total - target;
    for (let i = 0; i < items.length; i++) {
      if (!keep[i]) continue;
      if (Math.abs(Number(items[i].value) - diff) < tolerance) {
        keep[i] = false;
        removed = true;
        break;
      }
    }
    if (!removed) break; // aucun candidat trouvé → on s'arrête
  }
  return items.filter((_, i) => keep[i]);
}

function parsePennylaneXlsx(arrayBuffer) {
  if (typeof XLSX === 'undefined') {
    throw new Error('SheetJS (XLSX) non chargé');
  }
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  // 1. Trouver la ligne d'en-tête et la map mois → index colonne
  const monthColumns = {}; // monthSig → columnIndex
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const row = rows[i] || [];
    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j] || '').trim().toLowerCase();
      // Match formats: "Janv. 26", "Févr. 26", "Mai 26", etc.
      const m = cell.match(/^([a-zéèûôîàùç]+)\.?\s+(\d{2,4})$/);
      if (m) {
        const monthKey = m[1].replace(/\.$/, '');
        const monthNum = PENNYLANE_MONTHS[monthKey] || PENNYLANE_MONTHS[monthKey.slice(0, 4)] || PENNYLANE_MONTHS[monthKey.slice(0, 3)];
        if (monthNum) {
          let year = parseInt(m[2], 10);
          if (year < 100) year += 2000;
          const sig = `month-${year}-${String(monthNum).padStart(2, '0')}`;
          monthColumns[sig] = j;
          if (headerRowIdx === -1) headerRowIdx = i;
        }
      }
    }
  }
  if (Object.keys(monthColumns).length === 0) {
    throw new Error('Aucune colonne mois détectée dans l\'en-tête');
  }

  // 2. Trouver les sections Encaissements et Décaissements
  let encStart = -1, decStart = -1;
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const label = String((rows[i] || [])[0] || '').trim().toLowerCase();
    if (label.startsWith('encaissements') && encStart === -1) encStart = i;
    else if (label.startsWith('décaissements') && decStart === -1) { decStart = i; break; }
  }
  if (encStart === -1 || decStart === -1) {
    throw new Error('Sections Encaissements / Décaissements introuvables');
  }

  // 3. Trouver la 1ère occurrence de chaque club dans chaque section, avec la plage
  // (rangeEnd = ligne du club suivant ou fin de section)
  const findClubRangesInSection = (startIdx, endIdx) => {
    const out = {}; // club → { rowIdx, endIdx }
    const orderedHits = [];
    for (let i = startIdx; i < endIdx; i++) {
      const label = String((rows[i] || [])[0] || '').trim().toLowerCase();
      if (!label) continue;
      const mapped = PENNYLANE_CLUB_MAP[label];
      if (mapped && !out[mapped]) {
        out[mapped] = { rowIdx: i, endIdx: endIdx };
        orderedHits.push({ club: mapped, rowIdx: i });
      }
    }
    // Resserrer les endIdx selon l'ordre des club rows trouvés
    orderedHits.sort((a, b) => a.rowIdx - b.rowIdx);
    for (let k = 0; k < orderedHits.length; k++) {
      const next = orderedHits[k + 1];
      out[orderedHits[k].club].endIdx = next ? next.rowIdx : endIdx;
    }
    return out;
  };
  const caRows  = findClubRangesInSection(encStart + 1, decStart);
  const depRows = findClubRangesInSection(decStart + 1, rows.length);

  // 3.bis. Pour chaque club en décaissements, trouver les sous-rows de breakdown
  // (Masse salariale {club}, Bâtiment {club}, Marketing {club}, Frais de fonctionnement {club},
  //  Remboursement adhérent {club}). Sub-row détectée si label commence par un keyword.
  // Note: ces sous-rows sont des sous-totaux directement sous le club row.
  const matchBreakdownKey = (label) => {
    const lbl = label.trim().toLowerCase();
    for (const cat of PF_DEPENSES_BREAKDOWN) {
      for (const kw of cat.keywords) {
        if (lbl.startsWith(kw)) {
          // Doit être suivi par un espace ou être suivi exactement par le club
          const after = lbl.slice(kw.length);
          if (after === '' || after.startsWith(' ')) return cat.key;
        }
      }
    }
    return null;
  };

  const findClubBreakdownSubRows = (clubRange) => {
    // Retourne pour ce club : { salaire: [{rowIdx, endIdx}], batiment: [...], ... }
    // endIdx = exclusive upper bound pour les items-enfants de cette sous-row.
    // Une sous-row peut apparaître plusieurs fois (ex: Bâtiment = Leasing + Prêts + Conso)
    // → on agrège leurs valeurs ET leurs items.
    const ordered = [];
    for (let i = clubRange.rowIdx + 1; i < clubRange.endIdx; i++) {
      const label = String((rows[i] || [])[0] || '').trim();
      if (!label) continue;
      // Stop si on rencontre une section top-level (Tourcoing/Taxes/Lambersart/etc.)
      // pour éviter de déborder sur la section voisine.
      const labelLc = label.toLowerCase();
      if (PENNYLANE_TOP_BOUNDARIES.has(labelLc)) break;
      const key = matchBreakdownKey(label);
      if (key) ordered.push({ rowIdx: i, key });
    }
    // Calcule endIdx pour chaque sous-row (= rowIdx de la suivante ou fin de club)
    const subs = {};
    for (let k = 0; k < ordered.length; k++) {
      const sub = ordered[k];
      const next = ordered[k + 1];
      const endIdx = next ? next.rowIdx : clubRange.endIdx;
      subs[sub.key] = subs[sub.key] || [];
      subs[sub.key].push({ rowIdx: sub.rowIdx, endIdx });
    }
    return subs;
  };

  // 4. Extraire les valeurs
  const result = {
    months: Object.keys(monthColumns).sort(),
    data: {}, // monthSig → { club → { ca_ttc, depenses, dep_salaire, dep_batiment, dep_marketing, dep_fonctionnement } }
  };
  for (const [sig, col] of Object.entries(monthColumns)) {
    result.data[sig] = {};
    for (const club of PILOTAGE_CLUBS) {
      const caRange = caRows[club];
      const depRange = depRows[club];
      const ca  = caRange  ? Number((rows[caRange.rowIdx]  || [])[col]) : null;
      const dep = depRange ? Number((rows[depRange.rowIdx] || [])[col]) : null;

      const clubData = {};
      if (ca != null && !Number.isNaN(ca))   clubData.ca_ttc = ca;
      if (dep != null && !Number.isNaN(dep)) clubData.depenses = dep;

      // Breakdown des dépenses (si depRange trouvé) + extraction des items enfants
      if (depRange) {
        const subs = findClubBreakdownSubRows(depRange);
        for (const cat of PF_DEPENSES_BREAKDOWN) {
          const ranges = subs[cat.key];
          if (!ranges || ranges.length === 0) continue;
          let total = 0, found = false;
          const items = [];
          for (const range of ranges) {
            const v = Number((rows[range.rowIdx] || [])[col]);
            if (!Number.isNaN(v)) { total += v; found = true; }
            // Scan des lignes enfants entre range.rowIdx (exclu) et range.endIdx (exclu)
            for (let j = range.rowIdx + 1; j < range.endIdx; j++) {
              const rawLabel = String((rows[j] || [])[0] || '');
              const trimmed = rawLabel.trim();
              if (!trimmed) continue;
              const lcTrim = trimmed.toLowerCase();
              if (PENNYLANE_TOP_BOUNDARIES.has(lcTrim)) break;
              // Ignore tout libellé qui ressemble à une autre sous-row de breakdown
              if (matchBreakdownKey(trimmed)) continue;
              const itemVal = Number((rows[j] || [])[col]);
              if (Number.isNaN(itemVal) || itemVal === 0) continue;
              items.push({ label: trimmed, value: itemVal });
            }
          }
          if (found) {
            clubData[`dep_${cat.key}`] = total;
          }
          if (items.length > 0) {
            // Réconciliation : Pennylane peut contenir des sous-totaux
            // imbriqués (ex: Fluides = parent, Électricité = unique enfant
            // avec la MÊME valeur). Notre scan d'items les capture tous,
            // ce qui fait double-emploi. On retire les items dont la valeur
            // correspond à l'écart entre la somme actuelle et le total
            // attendu, ou qui équivalent à la somme de leurs frères suivants.
            const reconciled = reconcileBreakdownItems(items, total);
            // Tri décroissant par valeur absolue pour faire remonter les gros postes
            reconciled.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
            clubData[`dep_${cat.key}_items`] = reconciled;
          }
        }
      }

      if (Object.keys(clubData).length > 0) {
        result.data[sig][club] = clubData;
      }
    }
  }

  // 5. Extraire les valeurs niveau GROUPE (top-level rows en Encaissements / Décaissements)
  // Helper : trouver une ligne par label exact (lowercase trimmed) dans une plage
  const findRowExact = (startIdx, endIdx, target) => {
    const tgt = target.trim().toLowerCase();
    for (let i = startIdx; i < endIdx; i++) {
      const lbl = String((rows[i] || [])[0] || '').trim().toLowerCase();
      if (lbl === tgt) return i;
    }
    return -1;
  };
  // Trouver la fin de section Encaissements/Décaissements pour scoper la recherche
  const decEnd = (() => {
    // Cherche la prochaine ligne "Trésorerie en fin" ou "Opérations" après decStart
    for (let i = decStart + 1; i < rows.length; i++) {
      const lbl = String((rows[i] || [])[0] || '').trim().toLowerCase();
      if (lbl.startsWith('trésorerie en fin') || lbl.startsWith('opérations des comptes') || lbl.startsWith('opérations')) return i;
    }
    return rows.length;
  })();

  result.group = {}; // monthSig → { grec:tourcoing, grec:franchises, ..., gdep:groupe, gdep:taxes, ... }
  for (const [sig, col] of Object.entries(monthColumns)) {
    const g = {};

    // Recettes niveau Groupe — toujours top-level dans Encaissements
    // (produit_except = total Groupe Gingko Sport, qui inclut toutes les sous-lignes)
    for (const r of PF_GROUP_RECETTES) {
      const rowIdx = findRowExact(encStart + 1, decStart, r.pennylane);
      if (rowIdx > 0) {
        const v = Number((rows[rowIdx] || [])[col]);
        if (!Number.isNaN(v)) g[`grec:${r.key}`] = v;
      }
    }

    // Dépenses niveau Groupe
    for (const d of PF_GROUP_DEPENSES) {
      const rowIdx = findRowExact(decStart + 1, decEnd, d.pennylane);
      if (rowIdx > 0) {
        const v = Number((rows[rowIdx] || [])[col]);
        if (!Number.isNaN(v)) g[`gdep:${d.key}`] = v;
      }
    }

    if (Object.keys(g).length > 0) result.group[sig] = g;
  }

  return result;
}

function importPennylaneIntoStore(parsed) {
  let valuesWritten = 0;
  const monthsTouched = new Set();
  const clubsTouched = new Set();
  for (const [sig, perClub] of Object.entries(parsed.data)) {
    for (const [club, values] of Object.entries(perClub)) {
      if (values.ca_ttc != null) {
        pilotageStoreWrite(`${club}|${sig}|fin:ca_ttc`, values.ca_ttc);
        valuesWritten++;
        monthsTouched.add(sig);
        clubsTouched.add(club);
      }
      if (values.depenses != null) {
        pilotageStoreWrite(`${club}|${sig}|fin:depenses`, values.depenses);
        valuesWritten++;
        monthsTouched.add(sig);
        clubsTouched.add(club);
      }
      for (const cat of PF_DEPENSES_BREAKDOWN) {
        const v = values[`dep_${cat.key}`];
        if (v != null) {
          pilotageStoreWrite(`${club}|${sig}|fin:dep_${cat.key}`, v);
          valuesWritten++;
          monthsTouched.add(sig);
          clubsTouched.add(club);
        }
        // Items enfants (détail des lignes de dépenses) — stockés en JSON
        const items = values[`dep_${cat.key}_items`];
        if (items && items.length > 0) {
          pilotageStoreWriteJson(`${club}|${sig}|fin:dep_${cat.key}:items`, items);
          valuesWritten++;
          monthsTouched.add(sig);
          clubsTouched.add(club);
        } else {
          // Nettoie une éventuelle ancienne entrée
          pilotageStoreWriteJson(`${club}|${sig}|fin:dep_${cat.key}:items`, null);
        }
      }
    }
  }
  // Valeurs niveau Groupe (stockées sous pseudo-club __group__)
  let groupValuesWritten = 0;
  if (parsed.group) {
    for (const [sig, gvalues] of Object.entries(parsed.group)) {
      for (const [subKey, v] of Object.entries(gvalues)) {
        pilotageStoreWrite(`__group__|${sig}|${subKey}`, v);
        groupValuesWritten++;
        monthsTouched.add(sig);
      }
    }
  }
  return {
    valuesWritten: valuesWritten + groupValuesWritten,
    monthsCount: monthsTouched.size,
    clubsCount: clubsTouched.size,
    groupValues: groupValuesWritten,
    monthsTouched: Array.from(monthsTouched),
  };
}

// ═══════════════════════════════════════════════════════════════════
// IMPORT CHECK UP — 2ᵉ type d'import (KPIs commerciaux)
// Fichier : "CHECK UP MOIS YYYY.xlsx" avec feuilles conversion / APPEL /
// COACH / Récapitulatif. Alimente Leads, CPL, CAC, RDV, No-show, Transfo,
// Remplissage, Non traités par club × mois.
// ═══════════════════════════════════════════════════════════════════

const CHECKUP_CLUB_MAP = {
  'levallois':           'Levallois-Perret',
  'levallois-perret':    'Levallois-Perret',
  'levallois perret':    'Levallois-Perret',
  'levallois fa':        'Levallois-Perret',
  'lvl':                 'Levallois-Perret',
  'lev':                 'Levallois-Perret',
  'neuilly':             'Neuilly-sur-Seine',
  'neuilly-sur-seine':   'Neuilly-sur-Seine',
  'neuilly sur seine':   'Neuilly-sur-Seine',
  'neuilly fa':          'Neuilly-sur-Seine',
  'boulogne':            'Boulogne-Billancourt',
  'boulogne-billancourt':'Boulogne-Billancourt',
  'boulogne billancourt':'Boulogne-Billancourt',
  'boulogne fa':         'Boulogne-Billancourt',
  'bb':                  'Boulogne-Billancourt',
  'wasquehal':           'Wasquehal',
  'wasquehal fa':        'Wasquehal',
  'lille':               'Lille',
  'lille fa':            'Lille',
  'vieux lille':         'Lille',
  'marcq':               'Marcq-en-Barœul',
  'marcq fa':            'Marcq-en-Barœul',
  'marcq-en-baroeul':    'Marcq-en-Barœul',
  'marcq-en-barœul':     'Marcq-en-Barœul',
  'marcq en baroeul':    'Marcq-en-Barœul',
  'marcq en barœul':     'Marcq-en-Barœul',
  'tourcoing':           'Tourcoing',
  'tourcoing fa':        'Tourcoing',
  'ginkgo sport':        'Tourcoing',
};

const CHECKUP_MONTHS_FR = {
  'janvier': 1, 'février': 2, 'fevrier': 2, 'mars': 3, 'avril': 4, 'mai': 5,
  'juin': 6, 'juillet': 7, 'août': 8, 'aout': 8, 'septembre': 9,
  'octobre': 10, 'novembre': 11, 'décembre': 12, 'decembre': 12,
};

function parseCheckUpXlsx(arrayBuffer, fileName = '') {
  if (typeof XLSX === 'undefined') throw new Error('SheetJS non chargé');
  const wb = XLSX.read(arrayBuffer, { type: 'array' });

  // Détecte l'année depuis le nom de fichier
  let defaultYear = new Date().getFullYear();
  const yrMatch = fileName.match(/(20\d{2})/);
  if (yrMatch) defaultYear = parseInt(yrMatch[1], 10);
  // Détecte le mois primaire depuis le nom de fichier
  let primaryMonth = null;
  const monthMatch = fileName.toLowerCase().match(/(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)/);
  if (monthMatch) primaryMonth = CHECKUP_MONTHS_FR[monthMatch[1]];

  const result = { data: {} }; // sig → club → {leads, cpl, cac, rdv_fixes, no_show, transfo, non_traites, remplissage, ventes}
  const ensure = (sig, club) => {
    if (!result.data[sig]) result.data[sig] = {};
    if (!result.data[sig][club]) result.data[sig][club] = {};
    return result.data[sig][club];
  };

  // ── Feuille 'conversion' ─────────────────────────────────────
  const convSheet = wb.Sheets['conversion'];
  if (convSheet) {
    const rows = XLSX.utils.sheet_to_json(convSheet, { header: 1, defval: null });
    // Détection des colonnes par label d'entête : on scanne les premières
    // lignes pour trouver « Résiliation » (libellé exact attendu d'après
    // l'utilisateur). Si trouvé, on lit le nombre brut (entier) au lieu
    // de dériver depuis le taux de rétention.
    let resiliationCol = null;
    {
      const headerScanMax = Math.min(rows.length, 12);
      for (let i = 0; i < headerScanMax; i++) {
        const row = rows[i] || [];
        for (let c = 0; c < row.length; c++) {
          const cell = String(row[c] || '').trim().toLowerCase();
          if (cell === 'résiliation' || cell === 'resiliation') {
            resiliationCol = c;
            break;
          }
        }
        if (resiliationCol != null) break;
      }
    }
    let currentMonthNum = null;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || [];
      const first = String(row[0] || '').trim().toLowerCase();
      // Détection du titre de mois ("Avril", "Mars", etc.)
      if (CHECKUP_MONTHS_FR[first]) {
        currentMonthNum = CHECKUP_MONTHS_FR[first];
        continue;
      }
      if (!currentMonthNum) continue;
      // Skip headers et totaux
      if (!first || first === 'clubs' || first.startsWith('total') || first === 'franchise') continue;
      // Skip franchise clubs (Tours, Veigné, Caen, Paris, Valence, etc.)
      const club = CHECKUP_CLUB_MAP[first];
      if (!club) continue;

      const coutMarketing = Number(row[1]);
      const leads         = Number(row[2]);
      const rdv           = Number(row[4]);
      const showUpRate    = Number(row[5]);  // taux SHOW UP (0-1)
      const transfoRate   = Number(row[8]);  // taux conversion M1 (0-1)
      const ventes        = Number(row[9]);
      // Résiliation : nombre brut (entier) lu directement depuis la colonne
      // « Résiliation » détectée par header. Fallback : col 13 = taux rétention
      // (legacy, gardé pour data ancienne) → on retombera sur le pct si la
      // nouvelle colonne n'existe pas.
      const resiliationCount = resiliationCol != null ? Number(row[resiliationCol]) : NaN;
      const retentionRate    = Number(row[13]); // Taux rétention (0-1)

      // RDV venus (catégorie PROSPECT, feuille conversion) : la feuille définit
      // Show Up = RDV venus / RDV pris, donc RDV venus = RDV pris × Show Up.
      // On tente d'abord les colonnes voisines (col 6 ou 7) au cas où la valeur
      // brute serait stockée directement, sinon on calcule.
      let rdvVenus = null;
      const candidate6 = Number(row[6]);
      const candidate7 = Number(row[7]);
      const isPlausibleVenus = (v) => !Number.isNaN(v) && v >= 0
        && (Number.isNaN(rdv) || v <= rdv + 0.5)  // ≤ RDV pris
        && v === Math.round(v);                     // entier
      if (isPlausibleVenus(candidate6) && candidate6 > 0)      rdvVenus = candidate6;
      else if (isPlausibleVenus(candidate7) && candidate7 > 0) rdvVenus = candidate7;
      else if (!Number.isNaN(rdv) && !Number.isNaN(showUpRate)) {
        rdvVenus = Math.round(rdv * showUpRate);
      }

      const sig = `month-${defaultYear}-${String(currentMonthNum).padStart(2, '0')}`;
      const d = ensure(sig, club);
      if (!Number.isNaN(leads))       d.leads       = leads;
      if (!Number.isNaN(rdv))         d.rdv_fixes   = rdv;
      if (rdvVenus != null)           d.rdv_venus   = rdvVenus;
      if (!Number.isNaN(ventes))      d.ventes      = ventes;
      if (!Number.isNaN(transfoRate)) d.transfo     = transfoRate * 100;          // → %
      if (!Number.isNaN(showUpRate)) {
        d.show_up = showUpRate * 100;        // → % (catégorie Conseillers)
        d.no_show = (1 - showUpRate) * 100;  // → % (side indicator)
      }
      // Résiliation : on PRIORISE la colonne « Résiliation » (nombre brut, entier).
      // Fallback legacy : 1 − taux rétention (en %) si la nouvelle colonne n'est
      // pas trouvée (data plus ancienne ou format différent).
      if (!Number.isNaN(resiliationCount)) {
        d.resiliation = resiliationCount;
      } else if (!Number.isNaN(retentionRate)) {
        d.resiliation = (1 - retentionRate) * 100;
      }
      if (!Number.isNaN(coutMarketing) && !Number.isNaN(leads)  && leads  > 0) d.cpl = coutMarketing / leads;
      if (!Number.isNaN(coutMarketing) && !Number.isNaN(ventes) && ventes > 0) d.cac = coutMarketing / ventes;
      // On stocke aussi le coût marketing brut au cas où PROSPECTION ne donne rien
      if (!Number.isNaN(coutMarketing)) d._cout_marketing_fallback = coutMarketing;
    }
  }

  // ── Feuille 'PROSPECTION' — Coût par lead via somme des « €/jour » ─────
  // L'utilisateur indique que chaque date du mois a une colonne « €/jour »
  // qui contient le coût marketing dépensé ce jour-là. On somme TOUTES ces
  // valeurs pour chaque club afin d'obtenir le coût marketing mensuel exact,
  // puis on en déduit le CPL en divisant par le nombre de leads (déjà parsé
  // depuis la feuille conversion).
  const prospSheet = wb.Sheets['PROSPECTION'] || wb.Sheets['Prospection'] || wb.Sheets['prospection'];
  if (prospSheet && primaryMonth) {
    const rows = XLSX.utils.sheet_to_json(prospSheet, { header: 1, defval: null });
    // Détecte toutes les colonnes dont l'en-tête contient « €/jour » (ou
    // équivalents : « €/j », « euro/jour », etc.) dans les 12 premières lignes.
    const dailyCostCols = [];
    const headerScanMax = Math.min(rows.length, 12);
    for (let i = 0; i < headerScanMax; i++) {
      const row = rows[i] || [];
      for (let c = 0; c < row.length; c++) {
        const cell = String(row[c] || '').trim().toLowerCase().replace(/\s+/g, '');
        if (cell === '€/jour' || cell === '€/j' || cell === 'euro/jour'
            || cell.includes('€/jour') || cell.includes('eurosparjour')) {
          if (!dailyCostCols.includes(c)) dailyCostCols.push(c);
        }
      }
    }
    if (dailyCostCols.length > 0) {
      const sig = `month-${defaultYear}-${String(primaryMonth).padStart(2, '0')}`;
      const costByClub = {};
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i] || [];
        const lbl = String(row[0] || '').trim().toLowerCase();
        const club = CHECKUP_CLUB_MAP[lbl];
        if (!club) continue;
        let total = 0;
        for (const c of dailyCostCols) {
          const v = Number(row[c]);
          if (!Number.isNaN(v)) total += v;
        }
        if (total > 0) costByClub[club] = (costByClub[club] || 0) + total;
      }
      for (const [club, cost] of Object.entries(costByClub)) {
        const d = ensure(sig, club);
        d._cout_marketing_prospection = cost;
        // Recalcule le CPL avec le coût PROSPECTION si on a les leads
        if (d.leads != null && d.leads > 0) {
          d.cpl = cost / d.leads;
        }
      }
    }
  }

  // ── Feuille 'APPEL' — Non traités = somme des Qté (cols 3,6,9,12,15,18,21) ──
  const appelSheet = wb.Sheets['APPEL'];
  if (appelSheet && primaryMonth) {
    const rows = XLSX.utils.sheet_to_json(appelSheet, { header: 1, defval: null });
    const sig = `month-${defaultYear}-${String(primaryMonth).padStart(2, '0')}`;
    const qteCols = [3, 6, 9, 12, 15, 18, 21];
    const qtyByClub = {};
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || [];
      const lbl = String(row[0] || '').trim().toLowerCase();
      const club = CHECKUP_CLUB_MAP[lbl];
      if (!club) continue;
      let weekTotal = 0;
      for (const c of qteCols) {
        const v = Number(row[c]);
        if (!Number.isNaN(v)) weekTotal += v;
      }
      qtyByClub[club] = (qtyByClub[club] || 0) + weekTotal;
    }
    for (const [club, total] of Object.entries(qtyByClub)) {
      ensure(sig, club).non_traites = total;
    }
  }

  // ── Feuille 'COACH' — Taux de remplissage = Σ Rempli ÷ Σ Dispo × 100 ───
  // Structure attendue : un en-tête contient les libellés « Dispo » et « Rempli »
  // (potentiellement répétés plusieurs fois si la feuille a plusieurs sous-blocs
  // semaine/jour). On collecte TOUTES les colonnes étiquetées, puis pour chaque
  // club on additionne les valeurs des colonnes Dispo d'un côté, des colonnes
  // Rempli de l'autre. Le taux = somme(Rempli) ÷ somme(Dispo) × 100.
  //
  // Le libellé du club peut se trouver dans n'importe quelle colonne du début
  // de ligne (col 0, 1, 2, …), pas forcément col 0 — on scanne donc les 4 ou
  // 5 premières colonnes à la recherche d'un match dans CHECKUP_CLUB_MAP.
  const coachSheet = wb.Sheets['COACH'] || wb.Sheets['Coach'] || wb.Sheets['coach'];
  if (coachSheet && primaryMonth) {
    const rows = XLSX.utils.sheet_to_json(coachSheet, { header: 1, defval: null });
    const sig = `month-${defaultYear}-${String(primaryMonth).padStart(2, '0')}`;
    // Détecte toutes les colonnes Dispo / Rempli en scannant les 20 premières lignes
    const dispoCols = [];
    const rempliCols = [];
    const headerScanMax = Math.min(rows.length, 20);
    for (let i = 0; i < headerScanMax; i++) {
      const row = rows[i] || [];
      for (let c = 0; c < row.length; c++) {
        const cell = String(row[c] || '').trim().toLowerCase();
        if (cell === 'dispo' || cell === 'dispos' || cell === 'disponible' || cell === 'disponibles'
            || cell === 'capacité' || cell === 'capacite' || cell === 'places') {
          if (!dispoCols.includes(c)) dispoCols.push(c);
        } else if (cell === 'rempli' || cell === 'remplis' || cell === 'remplie' || cell === 'remplies'
            || cell === 'inscrits' || cell === 'inscrit') {
          if (!rempliCols.includes(c)) rempliCols.push(c);
        }
      }
    }
    // Trouve dans une ligne le libellé club (scan des 6 premières colonnes
    // pour gérer le cas où col 0 = date/coach/horaire et le club est en col 1+)
    const findClubInRow = (row) => {
      const maxCol = Math.min(row.length, 6);
      for (let c = 0; c < maxCol; c++) {
        const lbl = String(row[c] || '').trim().toLowerCase();
        if (!lbl) continue;
        const m = CHECKUP_CLUB_MAP[lbl];
        if (m) return m;
        // Match partiel : ex. "Levallois - Bd Bineau" → on trouve « levallois »
        for (const [key, club] of Object.entries(CHECKUP_CLUB_MAP)) {
          if (key.length >= 5 && lbl.includes(key)) return club;
        }
      }
      return null;
    };
    if (dispoCols.length > 0 && rempliCols.length > 0) {
      const sumsByClub = {}; // { club: { dispo, rempli } }
      const unmatchedLabels = new Set();
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i] || [];
        const club = findClubInRow(row);
        if (!club) {
          // Collecte les libellés non-matchés pour debug
          const firstLabel = String(row[0] || '').trim();
          if (firstLabel && Number.isNaN(Number(firstLabel))) {
            unmatchedLabels.add(firstLabel);
          }
          continue;
        }
        sumsByClub[club] = sumsByClub[club] || { dispo: 0, rempli: 0, rowCount: 0 };
        let touchedRow = false;
        for (const c of dispoCols) {
          const v = Number(row[c]);
          if (!Number.isNaN(v)) { sumsByClub[club].dispo += v; touchedRow = true; }
        }
        for (const c of rempliCols) {
          const v = Number(row[c]);
          if (!Number.isNaN(v)) { sumsByClub[club].rempli += v; touchedRow = true; }
        }
        if (touchedRow) sumsByClub[club].rowCount++;
      }
      // Log debug pour identifier rapidement les clubs manquants
      console.log('[CHECK UP / COACH] colonnes Dispo:', dispoCols, '· colonnes Rempli:', rempliCols);
      console.log('[CHECK UP / COACH] sommes par club:', sumsByClub);
      if (unmatchedLabels.size > 0) {
        console.warn('[CHECK UP / COACH] libellés col 0 non reconnus comme club :',
          Array.from(unmatchedLabels));
      }
      for (const [club, s] of Object.entries(sumsByClub)) {
        if (s.dispo > 0) {
          ensure(sig, club).remplissage = (s.rempli / s.dispo) * 100; // → %
        }
      }
    } else {
      console.warn('[CHECK UP / COACH] colonnes Dispo / Rempli introuvables — fallback Récapitulatif',
        '· dispoCols:', dispoCols, '· rempliCols:', rempliCols);
    }
  }

  // ── Feuille 'Récapitulatif' — Fallback Remplissage (si COACH absent ou
  //    sans colonnes Dispo/Rempli détectables) ──────────────────────────
  const recapSheet = wb.Sheets['Récapitulatif'];
  if (recapSheet && primaryMonth) {
    const rows = XLSX.utils.sheet_to_json(recapSheet, { header: 1, defval: null });
    const sig = `month-${defaultYear}-${String(primaryMonth).padStart(2, '0')}`;
    const valuesByClub = {};
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || [];
      const lbl = String(row[0] || '').trim().toLowerCase();
      const club = CHECKUP_CLUB_MAP[lbl];
      if (!club) continue;
      const v = Number(row[7]);
      // Skip #REF!, #VALUE!, 0
      if (Number.isNaN(v) || v === 0) continue;
      valuesByClub[club] = valuesByClub[club] || [];
      valuesByClub[club].push(v);
    }
    for (const [club, arr] of Object.entries(valuesByClub)) {
      if (arr.length === 0) continue;
      const d = ensure(sig, club);
      if (d.remplissage == null) {
        // Ne remplace pas la valeur COACH si elle existe déjà
        const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
        d.remplissage = avg * 100; // → %
      }
    }
  }

  return result;
}

function importCheckUpIntoStore(parsed) {
  let valuesWritten = 0;
  const monthsTouched = new Set();
  const clubsTouched = new Set();
  // Mapping KPI → storage subKey (cartes catégories)
  const MAP = {
    leads:       'cat:marketing:leads',
    cpl:         'cat:marketing:cpl',
    rdv_fixes:   'cat:phoning:rdv_fixes',
    non_traites: 'cat:phoning:non_traites',
    transfo:     'cat:conseillers:transfo',
    show_up:     'cat:conseillers:show_up',
    resiliation: 'cat:coach_leader:resiliation',
    remplissage: 'cat:coach_leader:remplissage',
  };
  // Funnel principal
  const FUNNEL_MAP = {
    leads:     'fnl:leads',
    rdv_fixes: 'fnl:rdv_pris',
    rdv_venus: 'fnl:rdv_venus',
    ventes:    'fnl:ventes',
  };
  // Indicateurs latéraux (PF_SIDE_INDICATORS)
  const SIDE_MAP = {
    cpl:         'side:cpl',
    no_show:     'side:no_show',
    transfo:     'side:transfo',
    resiliation: 'side:resiliation',
  };
  let catCount = 0, fnlCount = 0, sideCount = 0;
  for (const [sig, perClub] of Object.entries(parsed.data)) {
    for (const [club, values] of Object.entries(perClub)) {
      for (const [k, v] of Object.entries(values)) {
        if (k.startsWith('_')) continue; // champs internes (ex: _cout_marketing_*)
        if (v == null || Number.isNaN(Number(v))) continue;
        if (MAP[k]) {
          pilotageStoreWrite(`${club}|${sig}|${MAP[k]}`, v);
          valuesWritten++; catCount++;
        }
        if (FUNNEL_MAP[k]) {
          pilotageStoreWrite(`${club}|${sig}|${FUNNEL_MAP[k]}`, v);
          valuesWritten++; fnlCount++;
        }
        if (SIDE_MAP[k]) {
          pilotageStoreWrite(`${club}|${sig}|${SIDE_MAP[k]}`, v);
          valuesWritten++; sideCount++;
        }
        monthsTouched.add(sig);
        clubsTouched.add(club);
      }
    }
  }
  return {
    valuesWritten,
    monthsCount: monthsTouched.size,
    clubsCount: clubsTouched.size,
    monthsTouched: Array.from(monthsTouched),
    catCount, fnlCount, sideCount,
  };
}

async function handlePennylaneFileImport(file) {
  if (!file) return;
  try {
    const buf = await file.arrayBuffer();
    // Détection automatique du type de fichier
    const wb = XLSX.read(buf, { type: 'array' });
    const sheetNames = wb.SheetNames;
    const isPennylane = sheetNames.some(n => n.toLowerCase().includes('plan de trésorerie') || n.toLowerCase().includes('plan de tresorerie'));
    const isCheckUp = sheetNames.some(n => ['conversion', 'PROSPECTION', 'APPEL', 'COACH', 'Récapitulatif'].includes(n));

    if (isPennylane) {
      const parsed = parsePennylaneXlsx(buf);
      if (Object.keys(parsed.data).length === 0) {
        alert("Aucune valeur exploitable trouvée dans ce fichier Pennylane.");
        return;
      }
      const monthLabels = parsed.months.map(s => s.replace('month-', '')).join(', ');
      if (!confirm(`Import Pennylane (Plan de trésorerie) :\n\n• ${parsed.months.length} mois : ${monthLabels}\n• ${PILOTAGE_CLUBS.length} clubs scannés\n\nLes valeurs CA et Dépenses pour ces mois seront remplacées. Continuer ?`)) return;
      const s = importPennylaneIntoStore(parsed);
      alert(`Import Pennylane réussi ✓\n\n• ${s.valuesWritten} valeurs alimentées\n• ${s.monthsCount} mois · ${s.clubsCount} clubs\n• ${s.groupValues || 0} valeurs niveau Groupe\n\nMois : ${s.monthsTouched.map(x => x.replace('month-', '')).join(', ')}`);
    } else if (isCheckUp) {
      const parsed = parseCheckUpXlsx(buf, file.name);
      const months = Object.keys(parsed.data);
      if (months.length === 0) {
        alert("Aucune valeur exploitable trouvée dans ce fichier Check Up.\n\nVérifie qu'il contient bien les feuilles « conversion », « APPEL », « Récapitulatif ».");
        return;
      }
      const monthLabels = months.sort().map(s => s.replace('month-', '')).join(', ');
      if (!confirm(
        `Import Check Up (KPIs commerciaux) :\n\n`
        + `• ${months.length} mois : ${monthLabels}\n\n`
        + `Funnel de performance :\n`
        + `  · Leads générés (col leads)\n`
        + `  · RDV pris (col RDV)\n`
        + `  · RDV venus (Show Up × RDV pris)\n`
        + `  · Ventes (col ventes)\n\n`
        + `Indicateurs latéraux :\n`
        + `  · Coût par lead (Σ €/jour de l'onglet PROSPECTION ÷ leads)\n`
        + `  · Taux de no-show (1 − Show Up)\n`
        + `  · Taux de transformation (taux conversion M1)\n`
        + `  · Résiliation (nb brut, colonne « Résiliation »)\n\n`
        + `Cartes catégories : Marketing, Phoning, Conseillers, Coach leader.\n`
        + `  · Remplissage (Σ Rempli ÷ Σ Dispo de l'onglet COACH)\n\n`
        + `Les valeurs existantes pour ces mois seront remplacées. Continuer ?`
      )) return;
      const s = importCheckUpIntoStore(parsed);
      alert(
        `Import Check Up réussi ✓\n\n`
        + `• ${s.valuesWritten} valeurs alimentées\n`
        + `   – ${s.fnlCount}  étapes funnel\n`
        + `   – ${s.sideCount}  indicateurs latéraux (CPL, no-show, transfo, résiliation)\n`
        + `   – ${s.catCount}  KPIs de cartes catégories\n`
        + `• ${s.monthsCount} mois · ${s.clubsCount} clubs\n\n`
        + `Mois : ${s.monthsTouched.map(x => x.replace('month-', '')).join(', ')}`
      );
    } else {
      alert("Type de fichier non reconnu.\n\nFormats attendus :\n• Pennylane : Plan de trésorerie (.xlsx avec feuille « Plan de trésorerie »)\n• Check Up : KPIs commerciaux (.xlsx avec feuilles « conversion » + « APPEL » + « Récapitulatif »)");
      return;
    }
    if (typeof renderPilotageFunnel === 'function') {
      await renderPilotageFunnel();
    }
  } catch (err) {
    alert("Erreur d'import :\n\n" + err.message);
    console.error('[Import]', err);
  }
}

// ── Render principal ───────────────────────────────────────────────
async function loadPilotageFunnel() {
  if (!isAdmin()) return;

  // Bind période
  document.querySelectorAll('#pf-period .pf-period-btn').forEach(btn => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      pilotageFunnelState.period = btn.dataset.period;
      document.querySelectorAll('#pf-period .pf-period-btn')
        .forEach(b => b.classList.toggle('active', b === btn));
      // Initialise les bornes custom si vides
      if (pilotageFunnelState.period === 'custom' && (!pilotageFunnelState.customStart || !pilotageFunnelState.customEnd)) {
        const today = new Date();
        const monthAgo = new Date(); monthAgo.setMonth(monthAgo.getMonth() - 1);
        pilotageFunnelState.customStart = pilotageToLocalISODate(monthAgo);
        pilotageFunnelState.customEnd = pilotageToLocalISODate(today);
      }
      renderPilotageFunnel();
    });
  });

  // Bind navigation date
  const prevBtn = document.getElementById('pf-prev');
  const nextBtn = document.getElementById('pf-next');
  if (prevBtn && !prevBtn.dataset.bound) {
    prevBtn.dataset.bound = '1';
    prevBtn.addEventListener('click', () => {
      pilotageFunnelState.dateAnchor = pfShiftAnchor(pilotageFunnelState.period, pilotageFunnelState.dateAnchor, -1);
      renderPilotageFunnel();
    });
  }
  if (nextBtn && !nextBtn.dataset.bound) {
    nextBtn.dataset.bound = '1';
    nextBtn.addEventListener('click', () => {
      pilotageFunnelState.dateAnchor = pfShiftAnchor(pilotageFunnelState.period, pilotageFunnelState.dateAnchor, +1);
      renderPilotageFunnel();
    });
  }
  // Bind clic sur le label : retour à aujourd'hui (1 clic = reset à today)
  const dateLbl = document.getElementById('pf-date-label');
  if (dateLbl && !dateLbl.dataset.bound) {
    dateLbl.dataset.bound = '1';
    dateLbl.style.cursor = 'pointer';
    dateLbl.title = "Cliquer pour revenir à aujourd'hui";
    dateLbl.addEventListener('click', () => {
      pilotageFunnelState.dateAnchor = pilotageToLocalISODate(new Date());
      // En mode custom on remet aussi les bornes au dernier mois
      if (pilotageFunnelState.period === 'custom') {
        const today = new Date();
        const monthAgo = new Date(); monthAgo.setMonth(monthAgo.getMonth() - 1);
        pilotageFunnelState.customStart = pilotageToLocalISODate(monthAgo);
        pilotageFunnelState.customEnd = pilotageToLocalISODate(today);
      }
      renderPilotageFunnel();
    });
  }

  // Bind toggle scope (My Coach / Groupe consolidé) — clic sur l'actif = désélection
  document.querySelectorAll('#pf-scope-toggle .pf-scope-btn').forEach(btn => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      // Si déjà actif → désélectionne (passe à 'none')
      if (pilotageFunnelState.scope === btn.dataset.scope) {
        pilotageFunnelState.scope = 'none';
      } else {
        pilotageFunnelState.scope = btn.dataset.scope;
      }
      renderPilotageFunnel();
    });
  });

  // Bind nav mois dans la Synthèse financière — force le mode 'month' et shift d'un mois
  const finPrev = document.getElementById('pf-fin-prev');
  const finNext = document.getElementById('pf-fin-next');
  const finLbl  = document.getElementById('pf-fin-label');
  const switchToMonthAndShift = (dir) => {
    if (pilotageFunnelState.period !== 'month') {
      pilotageFunnelState.period = 'month';
      // Met à jour visuellement la pill active dans la barre du funnel
      document.querySelectorAll('#pf-period .pf-period-btn')
        .forEach(b => b.classList.toggle('active', b.dataset.period === 'month'));
    }
    pilotageFunnelState.dateAnchor = pfShiftAnchor('month', pilotageFunnelState.dateAnchor, dir);
    renderPilotageFunnel();
  };
  if (finPrev && !finPrev.dataset.bound) {
    finPrev.dataset.bound = '1';
    finPrev.addEventListener('click', () => switchToMonthAndShift(-1));
  }
  if (finNext && !finNext.dataset.bound) {
    finNext.dataset.bound = '1';
    finNext.addEventListener('click', () => switchToMonthAndShift(+1));
  }
  if (finLbl && !finLbl.dataset.bound) {
    finLbl.dataset.bound = '1';
    finLbl.style.cursor = 'pointer';
    finLbl.addEventListener('click', () => {
      pilotageFunnelState.period = 'month';
      document.querySelectorAll('#pf-period .pf-period-btn')
        .forEach(b => b.classList.toggle('active', b.dataset.period === 'month'));
      pilotageFunnelState.dateAnchor = pilotageToLocalISODate(new Date());
      renderPilotageFunnel();
    });
  }

  // Bind champs date custom
  const fromInput = document.getElementById('pf-date-from');
  const toInput = document.getElementById('pf-date-to');
  if (fromInput && !fromInput.dataset.bound) {
    fromInput.dataset.bound = '1';
    fromInput.addEventListener('change', () => {
      pilotageFunnelState.customStart = fromInput.value;
      renderPilotageFunnel();
    });
  }
  if (toInput && !toInput.dataset.bound) {
    toInput.dataset.bound = '1';
    toInput.addEventListener('change', () => {
      pilotageFunnelState.customEnd = toInput.value;
      renderPilotageFunnel();
    });
  }

  // Bind bouton Importer Excel
  const importBtn = document.getElementById('pf-import-trigger');
  const importInput = document.getElementById('pf-import-file');
  if (importBtn && importInput && !importBtn.dataset.bound) {
    importBtn.dataset.bound = '1';
    importBtn.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) await handlePennylaneFileImport(file);
      // Reset l'input pour que le même fichier puisse être réimporté
      e.target.value = '';
    });
  }

  // Bind popovers (clubs + compare)
  await initPfMultiSelectors();

  // Délégation de clic pour l'édition inline des valeurs (catégories, funnel, side, finances)
  const rootPf = document.getElementById('tab-pilotage-funnel');
  if (rootPf && !rootPf.dataset.editBound) {
    rootPf.dataset.editBound = '1';
    rootPf.addEventListener('click', (e) => pilotageHandleEditClick(e, () => renderPilotageFunnel()));
  }

  // Clic sur une cellule EBE → filtre les Clubs analysés sur ce club (toggle)
  if (rootPf && !rootPf.dataset.ebeClickBound) {
    rootPf.dataset.ebeClickBound = '1';
    rootPf.addEventListener('click', (e) => {
      if (e.target.closest('[data-edit-key]')) return;
      const cell = e.target.closest('[data-fin-club]');
      if (!cell) return;
      const club = cell.dataset.finClub;
      const current = pilotageFunnelState.clubs;
      const isOnlyThis = current.length === 1 && current[0] === club;
      // Toggle : si déjà sélectionné seul → désélectionne (vide)
      pilotageFunnelState.clubs = isOnlyThis ? [] : [club];
      // Reset l'éventuel panneau de détails ouvert (autre club / aucun club)
      pilotageFunnelState.detailCatOpen = null;
      syncPfClubsCheckboxes();
      renderPilotageFunnel();
    });
  }

  // Clic sur une cellule EBE consolidé → ouvre/ferme le panel détail du calcul
  if (rootPf && !rootPf.dataset.consolDetailBound) {
    rootPf.dataset.consolDetailBound = '1';
    rootPf.addEventListener('click', (e) => {
      if (e.target.closest('[data-consol-close]')) {
        pilotageFunnelState.consolDetailOpen = null;
        renderPilotageFunnel();
        return;
      }
      const cell = e.target.closest('[data-consol-key]');
      if (!cell) return;
      const key = cell.dataset.consolKey;
      pilotageFunnelState.consolDetailOpen =
        pilotageFunnelState.consolDetailOpen === key ? null : key;
      renderPilotageFunnel();
    });
    rootPf.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const cell = e.target.closest && e.target.closest('[data-consol-key]');
      if (!cell) return;
      e.preventDefault();
      const key = cell.dataset.consolKey;
      pilotageFunnelState.consolDetailOpen =
        pilotageFunnelState.consolDetailOpen === key ? null : key;
      renderPilotageFunnel();
    });
  }

  // Clic sur une cellule du breakdown dépenses (carte détail club)
  // → bascule l'affichage du détail des lignes Pennylane
  if (rootPf && !rootPf.dataset.depDetailBound) {
    rootPf.dataset.depDetailBound = '1';
    rootPf.addEventListener('click', (e) => {
      // Bouton de fermeture du panneau
      if (e.target.closest('[data-detail-close]')) {
        pilotageFunnelState.detailCatOpen = null;
        renderPilotageFunnel();
        return;
      }
      // L'édition inline de la valeur passe en priorité
      if (e.target.closest('[data-edit-key]')) return;
      const cell = e.target.closest('[data-detail-cat]');
      if (!cell) return;
      const cat = cell.dataset.detailCat;
      pilotageFunnelState.detailCatOpen =
        pilotageFunnelState.detailCatOpen === cat ? null : cat;
      renderPilotageFunnel();
    });
    // Activation clavier (Entrée / Espace)
    rootPf.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const cell = e.target.closest && e.target.closest('[data-detail-cat]');
      if (!cell) return;
      e.preventDefault();
      const cat = cell.dataset.detailCat;
      pilotageFunnelState.detailCatOpen =
        pilotageFunnelState.detailCatOpen === cat ? null : cat;
      renderPilotageFunnel();
    });
  }

  await renderPilotageFunnel();
}

async function initPfMultiSelectors() {
  const clubs = await fetchPilotageFunnelClubs();

  // Trigger Clubs analysés
  const trgClubs = document.getElementById('pf-clubs-trigger');
  const popClubs = document.getElementById('pf-clubs-popover');
  const optClubs = document.getElementById('pf-clubs-options');
  if (trgClubs && !trgClubs.dataset.bound) {
    trgClubs.dataset.bound = '1';
    optClubs.innerHTML = `
      ${clubs.map(c => `
        <label class="pf-popover-row">
          <input type="checkbox" data-club="${escapeHtml(c)}"> <span>${escapeHtml(c)}</span>
        </label>
      `).join('')}
    `;
    syncPfClubsCheckboxes();
    trgClubs.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePfPopover(popClubs, trgClubs);
      // ferme l'autre popover
      document.getElementById('pf-compare-popover').classList.add('hidden');
    });
    optClubs.addEventListener('change', (e) => {
      if (e.target.matches('[data-club]')) {
        const c = e.target.dataset.club;
        const current = pilotageFunnelState.clubs.filter(x => x !== 'all');
        if (e.target.checked) {
          if (!current.includes(c)) current.push(c);
        } else {
          const idx = current.indexOf(c);
          if (idx >= 0) current.splice(idx, 1);
        }
        pilotageFunnelState.clubs = current;
        // Reset le panneau de détails ouvert (autre club / multi)
        pilotageFunnelState.detailCatOpen = null;
      }
      syncPfClubsCheckboxes();
      renderPilotageFunnel();
    });
  }

  // Trigger Comparer avec
  const trgCmp = document.getElementById('pf-compare-trigger');
  const popCmp = document.getElementById('pf-compare-popover');
  const optCmp = document.getElementById('pf-compare-options');
  if (trgCmp && !trgCmp.dataset.bound) {
    trgCmp.dataset.bound = '1';
    optCmp.innerHTML = `
      <label class="pf-popover-row">
        <input type="radio" name="pf-cmp" data-cmp="none" checked> <span>Aucune comparaison</span>
      </label>
      <label class="pf-popover-row">
        <input type="radio" name="pf-cmp" data-cmp="others"> <span>Moyenne du groupe</span>
      </label>
      <div class="pf-popover-divider"></div>
      <div class="pf-popover-hint">Cumul de clubs spécifiques :</div>
      ${clubs.map(c => `
        <label class="pf-popover-row">
          <input type="checkbox" data-cmp-club="${escapeHtml(c)}"> <span>${escapeHtml(c)}</span>
        </label>
      `).join('')}
    `;
    trgCmp.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePfPopover(popCmp, trgCmp);
      document.getElementById('pf-clubs-popover').classList.add('hidden');
    });
    optCmp.addEventListener('change', (e) => {
      if (e.target.matches('[data-cmp]')) {
        const v = e.target.dataset.cmp;
        if (v === 'none') pilotageFunnelState.compareWith = [];
        else if (v === 'others') pilotageFunnelState.compareWith = ['__others__'];
        // Décoche les clubs spécifiques
        optCmp.querySelectorAll('[data-cmp-club]').forEach(cb => { cb.checked = false; });
      } else if (e.target.matches('[data-cmp-club]')) {
        // L'utilisateur sélectionne des clubs spécifiques → bascule en mode liste
        const specific = Array.from(optCmp.querySelectorAll('[data-cmp-club]:checked')).map(cb => cb.dataset.cmpClub);
        pilotageFunnelState.compareWith = specific;
        // Décoche les radios
        optCmp.querySelectorAll('[data-cmp]').forEach(r => { r.checked = false; });
        if (specific.length === 0) {
          optCmp.querySelector('[data-cmp="none"]').checked = true;
        }
      }
      renderPilotageFunnel();
    });
  }

  // Fermeture au clic extérieur
  if (!document.body.dataset.pfPopoverGlobal) {
    document.body.dataset.pfPopoverGlobal = '1';
    document.addEventListener('click', (e) => {
      const inClubs = e.target.closest('#pf-clubs-popover, #pf-clubs-trigger');
      const inCmp   = e.target.closest('#pf-compare-popover, #pf-compare-trigger');
      if (!inClubs) document.getElementById('pf-clubs-popover')?.classList.add('hidden');
      if (!inCmp)   document.getElementById('pf-compare-popover')?.classList.add('hidden');
    });
  }
}

function togglePfPopover(pop, trigger) {
  if (!pop) return;
  const willOpen = pop.classList.contains('hidden');
  pop.classList.toggle('hidden');
  if (willOpen && trigger) {
    const rect = trigger.getBoundingClientRect();
    pop.style.top = (rect.bottom + window.scrollY + 6) + 'px';
    pop.style.minWidth = rect.width + 'px';
    // Position initiale puis clamp dans le viewport pour ne jamais déborder à droite
    pop.style.left = (rect.left + window.scrollX) + 'px';
    const popWidth = pop.offsetWidth;
    const vw = document.documentElement.clientWidth;
    const MARGIN = 12;
    let left = rect.left;
    if (left + popWidth > vw - MARGIN) {
      // Bascule en alignement droit du popover sur le bord droit du trigger
      left = Math.max(MARGIN, rect.right - popWidth);
    }
    pop.style.left = (left + window.scrollX) + 'px';
  }
}

function syncPfClubsCheckboxes() {
  const opt = document.getElementById('pf-clubs-options');
  if (!opt) return;
  opt.querySelectorAll('[data-club]').forEach(cb => {
    cb.checked = pilotageFunnelState.clubs.includes(cb.dataset.club);
  });
}

function summarizeClubs(arr) {
  if (!arr || arr.length === 0) return 'Aucun club sélectionné';
  if (arr.includes('all')) return 'Tous les clubs';
  if (arr.length === 1) return arr[0];
  if (arr.length <= 3) return arr.join(', ');
  return `${arr.length} clubs sélectionnés`;
}

function summarizeCompare(arr) {
  if (!arr || arr.length === 0) return 'Aucune comparaison';
  if (arr[0] === '__others__') return 'Moyenne du groupe';
  if (arr.length === 1) return arr[0];
  if (arr.length <= 3) return arr.join(' + ');
  return `${arr.length} clubs cumulés`;
}

async function renderPilotageFunnel() {
  // Bascule nav ‹›  ↔  champs date custom
  const isCustom = pilotageFunnelState.period === 'custom';
  const navEl = document.getElementById('pf-date-nav');
  const customEl = document.getElementById('pf-date-custom');
  if (navEl) navEl.classList.toggle('hidden', isCustom);
  if (customEl) customEl.classList.toggle('hidden', !isCustom);
  if (isCustom) {
    const fromInput = document.getElementById('pf-date-from');
    const toInput = document.getElementById('pf-date-to');
    if (fromInput && fromInput.value !== pilotageFunnelState.customStart) fromInput.value = pilotageFunnelState.customStart || '';
    if (toInput && toInput.value !== pilotageFunnelState.customEnd) toInput.value = pilotageFunnelState.customEnd || '';
  }

  // Labels de filtres
  const rangeLabel = pfFormatRange(pilotageFunnelState.period, pilotageFunnelState.dateAnchor, pilotageFunnelState.customStart, pilotageFunnelState.customEnd);
  document.getElementById('pf-date-label').textContent = rangeLabel;
  // Le label dans la Synthèse financière affiche TOUJOURS un libellé mois,
  // même si l'utilisateur est en mode jour/semaine/trimestre/custom
  const finLblEl = document.getElementById('pf-fin-label');
  if (finLblEl) {
    if (pilotageFunnelState.period === 'month') {
      finLblEl.textContent = rangeLabel;
    } else {
      // Format mois forcé pour cohérence visuelle
      finLblEl.textContent = pfFormatRange('month', pilotageFunnelState.dateAnchor, '', '');
    }
  }
  document.getElementById('pf-clubs-summary').textContent = summarizeClubs(pilotageFunnelState.clubs);
  document.getElementById('pf-compare-summary').textContent = summarizeCompare(pilotageFunnelState.compareWith);

  // Données (V1 vide)
  const { main, compare } = await fetchPilotageFunnelData(pilotageFunnelState);
  const hasCompare = !!compare && pilotageFunnelState.compareWith.length > 0;

  // Cartes catégories (mêmes 5 que Pilotage) — éditables via localStorage
  const grid = document.getElementById('pf-grid');
  if (grid) {
    grid.innerHTML = PILOTAGE_CATEGORIES.map(cat => {
      const kpisHtml = cat.kpis.map(k => {
        const subKey = `cat:${cat.key}:${k.key}`;
        const valueHtml = pilotageEditableValueHtml(pilotageFunnelState, subKey, k.format, k.agg, 'pilotage-kpi-value');
        // Valeur de comparaison
        const cmpVal = (hasCompare && compare && compare.categories && compare.categories[cat.key])
          ? compare.categories[cat.key][k.key] : null;
        const cmpHtml = (cmpVal != null && !Number.isNaN(Number(cmpVal)))
          ? `<span class="pilotage-kpi-cmp" title="Comparaison">vs ${pilotageFormatValue(cmpVal, k.format)}</span>`
          : '';
        return `
          <div class="pilotage-kpi">
            <span class="pilotage-kpi-label">${escapeHtml(k.label)}</span>
            ${valueHtml}
            ${cmpHtml}
            <span class="pilotage-kpi-status" aria-hidden="true"></span>
          </div>
        `;
      }).join('');
      return `
        <article class="pilotage-card" style="--pilotage-accent: ${cat.accent}">
          <header class="pilotage-card-head">
            <span class="pilotage-card-icon" style="background: ${cat.accent}1a; color: ${cat.accent}">${cat.icon}</span>
            <h3 class="pilotage-card-title">${escapeHtml(cat.label)}</h3>
          </header>
          <div class="pilotage-card-kpis">${kpisHtml}</div>
        </article>
      `;
    }).join('');
  }

  // Funnel — les étapes lisent depuis le store. La 1ère étape (Leads) détermine la largeur de référence.
  const funnel = document.getElementById('pf-funnel');
  if (funnel) {
    // Résout chaque étape pour obtenir la valeur effective (single ou agrégat)
    const stageValues = PF_FUNNEL_STAGES.map(stage => {
      const r = pilotageResolveValue(pilotageFunnelState, `fnl:${stage.key}`, stage.format, stage.agg);
      return { stage, resolved: r, value: r.value };
    });
    const topMain = Number(stageValues[0].value) || 0;

    // Comparaison : on ne stocke pas (V1), donc fallback proportionnel uniquement
    const cmpFunnel = hasCompare && compare && compare.funnel ? compare.funnel : null;
    const topCmp = cmpFunnel ? Number(cmpFunnel[PF_FUNNEL_STAGES[0].key]) || 0 : 0;

    const cmpLabel = hasCompare ? summarizeCompare(pilotageFunnelState.compareWith) : '';
    const rows = stageValues.map((sv, i) => {
      const v = Number(sv.value);
      const cv = cmpFunnel ? Number(cmpFunnel[sv.stage.key]) : null;
      const hasCmpVal = cmpFunnel && cv != null && !Number.isNaN(cv);
      // Largeur main : si data → proportion, sinon fallback dégressif
      const fallback = 100 - i * 16;
      const wMain = (topMain > 0 && !Number.isNaN(v)) ? Math.max(8, Math.round((v / topMain) * 100)) : fallback;
      const wCmp  = (hasCmpVal && topCmp > 0) ? Math.max(8, Math.round((cv / topCmp) * 100)) : null;
      // Taux de conversion vs étape précédente (main + cmp)
      let convoMain = '', convoCmp = '';
      if (i > 0) {
        const prev = Number(stageValues[i - 1].value);
        if (!Number.isNaN(v) && !Number.isNaN(prev) && prev > 0) {
          convoMain = `${Math.round((v / prev) * 100)} %`;
        } else { convoMain = '—'; }
        if (hasCmpVal) {
          const prevCmp = Number(cmpFunnel[stageValues[i - 1].stage.key]);
          if (!Number.isNaN(prevCmp) && prevCmp > 0) {
            convoCmp = `${Math.round((cv / prevCmp) * 100)} %`;
          }
        }
      }
      // Chips de comparaison (valeur + delta)
      let cmpChip = '', deltaChip = '';
      if (hasCmpVal) {
        cmpChip = `<span class="pf-funnel-bar-cmp" title="Valeur de comparaison (${escapeHtml(cmpLabel)})">vs ${escapeHtml(pilotageFormatValue(cv, sv.stage.format))}</span>`;
        if (!Number.isNaN(v) && cv !== 0) {
          const delta = ((v - cv) / Math.abs(cv)) * 100;
          const sign = delta > 0 ? '+' : '';
          const tone = Math.abs(delta) < 0.5 ? 'neutral' : (delta >= 0 ? 'positive' : 'negative');
          const deltaStr = `${sign}${Math.round(delta * 10) / 10} %`.replace('.0 %', ' %');
          deltaChip = `<span class="pf-funnel-bar-delta ${tone}" title="Écart de la valeur principale vs comparaison">${escapeHtml(deltaStr)}</span>`;
        }
      }
      // Valeur éditable
      const r = sv.resolved;
      const display = pilotageFormatValue(r.value, sv.stage.format);
      const cls = 'pf-funnel-bar-value editable' + (r.aggregate ? ' aggregate' : '');
      const tooltip = r.aggregate
        ? `Agrégat auto de ${r.aggCount} club(s) — clique pour saisir une valeur consolidée`
        : 'Cliquer pour saisir une valeur';
      const attrs = `data-edit-key="${escapeHtml(r.editKey)}" data-format="${sv.stage.format}" tabindex="0" title="${tooltip}"`;
      // Contenu de la pastille de conversion
      const arrowContent = convoCmp
        ? `<span class="pf-funnel-arrow-main">${convoMain}</span><span class="pf-funnel-arrow-cmp" title="Conversion ${escapeHtml(cmpLabel)}">vs ${convoCmp}</span>`
        : `<span class="pf-funnel-arrow-main">${convoMain}</span>`;
      return `
        ${i > 0 ? `<div class="pf-funnel-arrow">${arrowContent}</div>` : ''}
        <div class="pf-funnel-row">
          <div class="pf-funnel-bar" style="width:${wMain}%; background: linear-gradient(135deg, ${sv.stage.color} 0%, ${sv.stage.color}cc 100%)">
            <span class="pf-funnel-bar-label">${escapeHtml(sv.stage.label)}</span>
            <span class="pf-funnel-bar-stats">
              <span class="${cls}" ${attrs}>${display}</span>
              ${deltaChip}
              ${cmpChip}
            </span>
          </div>
        </div>
      `;
    }).join('');
    funnel.innerHTML = rows;
  }

  // Légende compare
  const legCmp = document.getElementById('pf-legend-compare');
  const legCmpLabel = document.getElementById('pf-legend-compare-label');
  if (legCmp) {
    legCmp.classList.toggle('hidden', !hasCompare);
    if (hasCompare && legCmpLabel) legCmpLabel.textContent = summarizeCompare(pilotageFunnelState.compareWith);
  }

  // Indicateurs latéraux (éditables)
  const side = document.getElementById('pf-side-list');
  if (side) {
    const cmpSide = hasCompare && compare && compare.indicators ? compare.indicators : null;
    side.innerHTML = PF_SIDE_INDICATORS.map(ind => {
      const subKey = `side:${ind.key}`;
      const valueHtml = pilotageEditableValueHtml(pilotageFunnelState, subKey, ind.format, ind.agg, 'pf-side-value');
      const cmpStr = cmpSide ? pfFormat(cmpSide[ind.key], ind.format) : null;
      return `
        <li class="pf-side-row">
          <span class="pf-side-label">${escapeHtml(ind.label)}</span>
          <span class="pf-side-values">
            ${valueHtml}
            ${cmpStr !== null ? `<span class="pf-side-cmp" title="Comparaison">${cmpStr}</span>` : ''}
          </span>
        </li>
      `;
    }).join('');
  }

  // Carte « EBE consolidés » (3 cellules : My Coach / +Franchise / Groupe)
  const consolGrid = document.getElementById('pf-consol-grid');
  if (consolGrid) {
    const sig = pilotagePeriodSig(pilotageFunnelState.period, pilotageFunnelState.dateAnchor, pilotageFunnelState.customStart, pilotageFunnelState.customEnd);
    const openKey = pilotageFunnelState.consolDetailOpen;
    consolGrid.innerHTML = PF_CONSOLIDATED_EBE.map(c => {
      const value = pilotageConsolidatedEbe(sig, c.scope);
      let tone = '';
      if (value != null && !Number.isNaN(Number(value))) {
        tone = Number(value) >= 0 ? 'pf-fin-positive' : 'pf-fin-negative';
      }
      const display = pilotageFormatValue(value, 'pct');
      const isOpen = openKey === c.key;
      const cls = 'pf-fin-cell pf-consol-cell--clickable' + (tone ? ` ${tone}` : '') + (isOpen ? ' is-open' : '');
      return `
        <div class="${cls}" data-consol-key="${escapeHtml(c.key)}" role="button" tabindex="0" title="Cliquer pour voir le détail du calcul">
          <span class="pf-fin-label">${escapeHtml(c.label)} <span class="pf-consol-caret" aria-hidden="true">${isOpen ? '▾' : '▸'}</span></span>
          <span class="pf-fin-value">${display}</span>
        </div>
      `;
    }).join('');

    // Panel de détail du calcul EBE consolidé
    const detailPanel = document.getElementById('pf-consol-detail');
    if (detailPanel) {
      if (!openKey) {
        detailPanel.classList.add('hidden');
        detailPanel.innerHTML = '';
      } else {
        const cfg = PF_CONSOLIDATED_EBE.find(c => c.key === openKey);
        if (!cfg) {
          detailPanel.classList.add('hidden');
          detailPanel.innerHTML = '';
        } else {
          const b = pilotageConsolidatedEbeBreakdown(sig, cfg.scope);
          const fmtEur = (v) => pilotageFormatValue(v, 'eur');
          const fmtPct = (v) => pilotageFormatValue(v, 'pct');
          const ebeClass = (b.ebe != null && b.ebe >= 0) ? 'pf-fin-positive' : (b.ebe != null ? 'pf-fin-negative' : '');
          // Regroupe les entrées par "group" (My Coach / Franchise / Tourcoing /
          // Autres dépenses comme Taxes). L'ordre garantit l'affichage logique :
          // recettes opérationnelles d'abord, dépenses additionnelles en bas.
          const groupsOrder = ['My Coach', 'Franchise', 'Tourcoing', 'Autres dépenses'];
          const grouped = {};
          for (const e of b.entries) {
            grouped[e.group] = grouped[e.group] || [];
            grouped[e.group].push(e);
          }
          let html = `
            <div class="pf-consol-detail-head">
              <span class="pf-consol-detail-title">${escapeHtml(cfg.label)} <span class="pf-consol-detail-sub">détail du calcul</span></span>
              <button type="button" class="pf-items-close" data-consol-close title="Fermer">✕</button>
            </div>
            <table class="pf-consol-detail-table">
              <thead>
                <tr>
                  <th class="pf-cd-col-label">Entité</th>
                  <th class="pf-cd-col-num">CA TTC</th>
                  <th class="pf-cd-col-num">CA HT (÷1,20)</th>
                  <th class="pf-cd-col-num">Dépenses</th>
                </tr>
              </thead>
              <tbody>
          `;
          for (const g of groupsOrder) {
            const list = grouped[g];
            if (!list || list.length === 0) continue;
            for (const e of list) {
              const caHt = (e.ca != null) ? e.ca / 1.20 : null;
              html += `
                <tr>
                  <td class="pf-cd-col-label">${escapeHtml(e.label)}</td>
                  <td class="pf-cd-col-num">${fmtEur(e.ca)}</td>
                  <td class="pf-cd-col-num pf-cd-muted">${fmtEur(caHt)}</td>
                  <td class="pf-cd-col-num">${fmtEur(e.dep)}</td>
                </tr>
              `;
            }
          }
          html += `
              </tbody>
              <tfoot>
                <tr class="pf-cd-total">
                  <td class="pf-cd-col-label">Total</td>
                  <td class="pf-cd-col-num">${fmtEur(b.totalCa)}</td>
                  <td class="pf-cd-col-num">${fmtEur(b.caHt)}</td>
                  <td class="pf-cd-col-num">${fmtEur(b.totalDep)}</td>
                </tr>
              </tfoot>
            </table>
            <div class="pf-consol-formula">
              <span class="pf-cf-step">Σ CA HT</span>
              <span class="pf-cf-val">${fmtEur(b.caHt)}</span>
              <span class="pf-cf-op">−</span>
              <span class="pf-cf-step">Σ Dépenses</span>
              <span class="pf-cf-val">${fmtEur(b.totalDep)}</span>
              <span class="pf-cf-op">=</span>
              <span class="pf-cf-val">${fmtEur(b.caHt != null && b.totalDep != null ? b.caHt - b.totalDep : null)}</span>
              <span class="pf-cf-op">÷</span>
              <span class="pf-cf-step">Σ CA HT</span>
              <span class="pf-cf-val">${fmtEur(b.caHt)}</span>
              <span class="pf-cf-op">×</span>
              <span class="pf-cf-val">100</span>
              <span class="pf-cf-arrow">→</span>
              <span class="pf-cf-result ${ebeClass}">${fmtPct(b.ebe)}</span>
            </div>
          `;
          detailPanel.classList.remove('hidden');
          detailPanel.innerHTML = html;
        }
      }
    }
  }

  // Synthèse financière : 6 EBE clubs My Coach + EBE Ginkgo Sport + CA Franchise
  const fin = document.getElementById('pf-financials');
  if (fin) {
    const periodSig = pilotagePeriodSig(pilotageFunnelState.period, pilotageFunnelState.dateAnchor, pilotageFunnelState.customStart, pilotageFunnelState.customEnd);
    fin.innerHTML = PF_EBE_CELLS.map((cell, idx) => {
      let value = null;
      let format = 'pct';
      // Club lié au clic (filtre Clubs analysés). null = pas de filtre possible.
      let clickClub = null;
      if (cell.type === 'club_ebe') {
        const ca  = pilotageStoreRead(`${cell.club}|${periodSig}|fin:ca_ttc`);
        const dep = pilotageStoreRead(`${cell.club}|${periodSig}|fin:depenses`);
        if (ca != null && dep != null && ca !== 0) {
          // EBE en HT : on retire la TVA 20% du CA avant le calcul
          const caHt = ca / 1.20;
          if (caHt !== 0) value = ((caHt - dep) / caHt) * 100;
        }
        clickClub = cell.club;
      } else if (cell.type === 'franchise_ca') {
        value = pilotageStoreRead(`__group__|${periodSig}|grec:franchises`);
        format = 'eur';
        // Franchise pas dans PILOTAGE_CLUBS → non cliquable
      }
      // Tone sémantique : vert si EBE positif, rouge si négatif, accent indigo pour CA
      let tone = '';
      if (format === 'pct' && value != null && !Number.isNaN(Number(value))) {
        tone = Number(value) >= 0 ? 'pf-fin-positive' : 'pf-fin-negative';
      } else if (format === 'eur' && value != null) {
        tone = 'pf-fin-accent';
      }
      // Indicateur visuel si ce club est actuellement sélectionné
      const isSelected = clickClub && pilotageFunnelState.clubs.length === 1 && pilotageFunnelState.clubs[0] === clickClub;
      const clickableClass = clickClub ? ' pf-fin-cell--clickable' : '';
      const selectedClass = isSelected ? ' pf-fin-cell--selected' : '';
      const clickAttrs = clickClub
        ? `data-fin-club="${escapeHtml(clickClub)}" role="button" tabindex="0" title="Cliquer pour voir le détail de ${escapeHtml(clickClub)}"`
        : '';
      const display = pilotageFormatValue(value, format);
      return `
        <div class="pf-fin-cell ${tone}${clickableClass}${selectedClass}" ${clickAttrs}>
          <span class="pf-fin-label">${escapeHtml(cell.label)}</span>
          <span class="pf-fin-value">${display}</span>
        </div>
      `;
    }).join('');
  }

  // Render carte « Détail du club » — visible seulement si UN club spécifique sélectionné
  const detailCard = document.getElementById('pf-club-detail');
  if (detailCard) {
    const sigPF = pilotagePeriodSig(pilotageFunnelState.period, pilotageFunnelState.dateAnchor, pilotageFunnelState.customStart, pilotageFunnelState.customEnd);
    const clubsArr = pilotageFunnelState.clubs || [];
    const isSingleClub = clubsArr.length === 1;
    if (!isSingleClub) {
      detailCard.classList.add('hidden');
    } else {
      const club = clubsArr[0];
      detailCard.classList.remove('hidden');
      const nameEl = document.getElementById('pf-club-detail-name');
      if (nameEl) nameEl.textContent = club;

      // Récupère CA et Dépenses pour le club sélectionné
      const ca  = pilotageStoreRead(`${club}|${sigPF}|fin:ca_ttc`);
      const dep = pilotageStoreRead(`${club}|${sigPF}|fin:depenses`);
      // Cash-flow = variation de trésorerie TTC (encaissements − décaissements)
      const cashflow = (ca != null && dep != null) ? (ca - dep) : null;
      // EBE en HT : CA HT = CA TTC ÷ 1,20, puis (CA HT − Dépenses) ÷ CA HT × 100
      let ebe = null;
      if (ca != null && dep != null) {
        const caHt = ca / 1.20;
        if (caHt !== 0) ebe = ((caHt - dep) / caHt) * 100;
      }

      // 4 cellules principales
      const main = document.getElementById('pf-club-detail-main');
      if (main) {
        const cells = [
          { label: 'CA',        value: ca,       format: 'eur', tone: 'neutral' },
          { label: 'Dépenses',  value: dep,      format: 'eur', tone: 'muted' },
          { label: 'Cash-flow', value: cashflow, format: 'eur', tone: 'highlight' },
          { label: 'EBE',       value: ebe,      format: 'pct', tone: 'highlight' },
        ];
        main.innerHTML = cells.map(c => {
          let toneClass = '';
          if (c.tone === 'highlight' && c.value != null && !Number.isNaN(Number(c.value))) {
            toneClass = Number(c.value) >= 0 ? 'pf-fin-positive' : 'pf-fin-negative';
          } else if (c.tone === 'muted') {
            toneClass = 'pf-fin-muted';
          }
          return `
            <div class="pf-fin-cell ${toneClass}">
              <span class="pf-fin-label">${escapeHtml(c.label)}</span>
              <span class="pf-fin-value">${pilotageFormatValue(c.value, c.format)}</span>
            </div>
          `;
        }).join('');
      }

      // Breakdown des dépenses (Tourcoing inclus — il a ses propres sous-rows
      // « Masse salariale Tourcoing », « Bâtiment Tourcoing », etc. dans Pennylane)
      const breakdownWrap = document.getElementById('pf-club-detail-breakdown-wrap');
      const breakdownGrid = document.getElementById('pf-club-detail-breakdown');
      if (breakdownWrap && breakdownGrid) {
        breakdownWrap.classList.remove('hidden');
        const openCat = pilotageFunnelState.detailCatOpen;
        breakdownGrid.innerHTML = PF_DEPENSES_BREAKDOWN.map(cat => {
          const v = pilotageStoreRead(`${club}|${sigPF}|fin:dep_${cat.key}`);
          const display = pilotageFormatValue(v, 'eur');
          const editKey = `${club}|${sigPF}|fin:dep_${cat.key}`;
          const valAttrs = `data-edit-key="${escapeHtml(editKey)}" data-format="eur" tabindex="0" title="Cliquer pour saisir une valeur"`;
          // La cellule entière est cliquable pour ouvrir le détail des lignes
          const items = pilotageStoreReadJson(`${club}|${sigPF}|fin:dep_${cat.key}:items`);
          const hasItems = Array.isArray(items) && items.length > 0;
          const isOpen = openCat === cat.key;
          const cellCls = 'pf-dep-cell pf-dep-cell--clickable'
            + (hasItems ? ' has-items' : '')
            + (isOpen ? ' is-open' : '');
          const cellTitle = hasItems
            ? `Voir le détail des lignes (${items.length})`
            : 'Aucune ligne détaillée importée pour cette catégorie';
          return `
            <div class="${cellCls}" data-detail-cat="${escapeHtml(cat.key)}" role="button" tabindex="0" title="${escapeHtml(cellTitle)}">
              <span class="pf-dep-label">${escapeHtml(cat.label)}</span>
              <span class="pf-dep-value editable" ${valAttrs}>${display}</span>
              ${hasItems ? `<span class="pf-dep-caret" aria-hidden="true">${isOpen ? '▾' : '▸'}</span>` : ''}
            </div>
          `;
        }).join('');
      }

      // Panel des items (lignes Pennylane) pour la catégorie dépliée
      const itemsPanel = document.getElementById('pf-club-detail-items');
      if (itemsPanel) {
        const openCat = pilotageFunnelState.detailCatOpen;
        if (!openCat) {
          itemsPanel.classList.add('hidden');
          itemsPanel.innerHTML = '';
        } else {
          const cat = PF_DEPENSES_BREAKDOWN.find(c => c.key === openCat);
          let items = pilotageStoreReadJson(`${club}|${sigPF}|fin:dep_${openCat}:items`);
          // Réconcilie les items avec le total catégorie pour les data legacy
          // (importées avant le fix de dédup des sous-totaux imbriqués).
          const catTotal = pilotageStoreRead(`${club}|${sigPF}|fin:dep_${openCat}`);
          if (Array.isArray(items) && items.length > 0 && catTotal != null) {
            const sum = items.reduce((s, it) => s + (Number(it.value) || 0), 0);
            if (Math.abs(sum - Number(catTotal)) > 0.5) {
              items = reconcileBreakdownItems(items, Number(catTotal));
            }
          }
          if (!cat || !Array.isArray(items) || items.length === 0) {
            itemsPanel.classList.remove('hidden');
            itemsPanel.innerHTML = `
              <div class="pf-items-head">
                <span class="pf-items-title">${escapeHtml(cat ? cat.label : 'Catégorie')}</span>
                <button type="button" class="pf-items-close" data-detail-close title="Fermer">✕</button>
              </div>
              <div class="pf-items-empty">Aucune ligne détaillée importée pour cette catégorie sur cette période. Réimporte le fichier Pennylane pour récupérer le détail.</div>
            `;
          } else {
            const total = items.reduce((s, it) => s + (Number(it.value) || 0), 0);
            itemsPanel.classList.remove('hidden');
            itemsPanel.innerHTML = `
              <div class="pf-items-head">
                <span class="pf-items-title">${escapeHtml(cat.label)} <span class="pf-items-count">${items.length} ligne${items.length > 1 ? 's' : ''}</span></span>
                <button type="button" class="pf-items-close" data-detail-close title="Fermer">✕</button>
              </div>
              <ul class="pf-items-list">
                ${items.map(it => `
                  <li class="pf-items-row">
                    <span class="pf-items-label">${escapeHtml(it.label)}</span>
                    <span class="pf-items-value">${pilotageFormatValue(it.value, 'eur')}</span>
                  </li>
                `).join('')}
              </ul>
              <div class="pf-items-foot">
                <span class="pf-items-foot-label">Total</span>
                <span class="pf-items-foot-value">${pilotageFormatValue(total, 'eur')}</span>
              </div>
            `;
          }
        }
      }
    }
  }

  // Synchronise les boutons du toggle scope avec l'état
  document.querySelectorAll('#pf-scope-toggle .pf-scope-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.scope === pilotageFunnelState.scope);
  });

  // Render du panel breakdown des dépenses
  const breakdownGrid = document.getElementById('pf-dep-breakdown-grid');
  if (breakdownGrid) {
    breakdownGrid.innerHTML = PF_DEPENSES_BREAKDOWN.map(cat => {
      const subKey = `fin:dep_${cat.key}`;
      const r = pilotageResolveValue(pilotageFunnelState, subKey, 'eur', 'sum');
      const display = pilotageFormatValue(r.value, 'eur');
      const cls = 'pf-dep-value editable' + (r.aggregate ? ' aggregate' : '');
      const tooltip = r.aggregate
        ? `Agrégat auto de ${r.aggCount} club(s) — clique pour saisir une valeur consolidée`
        : 'Cliquer pour saisir une valeur';
      const attrs = `data-edit-key="${escapeHtml(r.editKey)}" data-format="eur" tabindex="0" title="${tooltip}"`;
      // Comparaison
      const cmpVal = (hasCompare && compare && compare.depBreakdown) ? compare.depBreakdown[cat.key] : null;
      const cmpHtml = (cmpVal != null && !Number.isNaN(Number(cmpVal)))
        ? `<span class="pf-dep-cmp" title="Comparaison">vs ${pilotageFormatValue(cmpVal, 'eur')}</span>`
        : '';
      return `
        <div class="pf-dep-cell">
          <span class="pf-dep-label">${escapeHtml(cat.label)}</span>
          <span class="${cls}" ${attrs}>${display}</span>
          ${cmpHtml}
        </div>
      `;
    }).join('');
  }
}
