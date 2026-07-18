// ─── Global error handler — prevent extension errors from crashing app ──
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason && e.reason.message && e.reason.message.includes('Listener')) {
    e.preventDefault(); // Ignore browser extension errors
  }
});

// ─── Auth State ─────────────────────────────────────────────
let authToken = localStorage.getItem('authToken_coach') || null;
let currentUser = null;
try { currentUser = JSON.parse(localStorage.getItem('currentUser_coach') || 'null'); } catch (_) { currentUser = null; }

function isAdmin() { return currentUser && currentUser.role === 'admin'; }
function isLeader() { return currentUser && currentUser.is_leader === true; }
function isAcademy() { return currentUser && currentUser.role === 'academy'; }
function isDirector() { return currentUser && currentUser.role === 'director'; }
// Full admin rights on formation/validation pages (admin OR academy 1234)
function isFormationAdmin() { return isAdmin() || isAcademy(); }
function canSeeAllCoaches() { return isAdmin() || isLeader() || isAcademy() || isDirector(); }
function getMyCoachId() { return currentUser ? currentUser.coach_id : null; }
function getMyName() { return currentUser ? currentUser.name : null; }
let selectedClub = localStorage.getItem('selectedClub_coach') || '';

// Admin-only element enforcement
function enforceAdminOnlyElements() {
  const admin = isAdmin();
  if (admin) {
    document.body.classList.add('is-admin');
  } else {
    document.body.classList.remove('is-admin');
  }
}

function getMyStudio() {
  // Priority: selected club at login, then coach's assigned studio
  if (selectedClub) return selectedClub;
  if (!currentUser || !currentUser.coach_id) return '';
  const c = coaches.find(x => x.id === currentUser.coach_id);
  return c ? c.studio : '';
}

// Toujours le studio du profil du coach (ignoré selectedClub)
// Utilisé pour la Revue mensuelle : un leader voit toujours SON club
function getMyAssignedStudio() {
  if (!currentUser || !currentUser.coach_id) return '';
  const c = coaches.find(x => x.id === currentUser.coach_id);
  return c ? c.studio : '';
}

// ─── State ──────────────────────────────────────────────────
let coaches = [];
let currentMonth = '';
let featureStatus = { ai: false };
let todaySubTab = sessionStorage.getItem('todaySubTab') || 'forme';

// ─── Clubs ──────────────────────────────────────────────────
const CLUBS = ['Wasquehal', 'Lille', 'Marcq', 'Boulogne', 'Neuilly', 'Levallois', 'Paris 15', 'Veigné', 'Tours', 'Nice', 'Valence', 'Caen'];
const DR_CLUBS = ['Wasquehal', 'Lille', 'Marcq', 'Boulogne', 'Neuilly', 'Levallois'];

// ─── Critères d'évaluation ELITES ───────────────────────────
// Super indicateur = 5 pts si coché | Chaque sous-indicateur = 1 pt | Max par critère = 9 | Total max = 54
const EVAL_CRITERIA = [
  {
    key: 'engagement', label: 'Engagement', icon: '🔥',
    superLabel: 'Taux de résiliation < 7 %',
    sub: [
      'Maîtrise de son taux de résiliation',
      'Capacité à analyser les écarts et les tendances',
      'Actions concrètes mises en place pour réduire la résiliation',
      'Objectif mensuel clair et partagé avec l\'équipe',
    ]
  },
  {
    key: 'loyal', label: 'Loyauté', icon: '🤝',
    superLabel: 'Taux de non-fréquentants < 10 %',
    sub: [
      'Capacité à maintenir les clients engagés et réguliers',
      'Génération de satisfaction visible : témoignages, avis Google, retours positifs',
      'Développement des prises de référence',
      'Exploitation des retours clients avec l\'équipe',
    ]
  },
  {
    key: 'infos', label: 'Infos', icon: '📊',
    superLabel: 'Connaissance fine du fichier client en cherry picking',
    sub: [
      'Maîtrise du fichier client et des informations clés',
      'Suivi rigoureux des pesées, welcome calls et données client',
      'Bonne connaissance des résiliés et des actions menées',
      'Qualité de la proximité et de la personnalisation client',
    ]
  },
  {
    key: 'team', label: 'Team', icon: '👥',
    superLabel: 'Aucune remontée à la direction concernant les coachs',
    sub: [
      'Capacité à encadrer et suivre les coachs',
      'Animation d\'une vraie dynamique collective dans le studio',
      'Discipline opérationnelle de l\'équipe au quotidien',
      'Formation, implication et montée en compétence des coachs',
    ]
  },
  {
    key: 'eclat', label: 'Éclat', icon: '✨',
    superLabel: 'Audit > 80 %',
    sub: [
      'Respect des standards d\'image et de posture',
      'Tenue globale du studio et cohérence avec la marque',
      'Régularité de la communication terrain et digitale',
      'Bonne incarnation de l\'image My Coach par les coachs',
    ]
  },
  {
    key: 'succes', label: 'Succès', icon: '🏆',
    superLabel: 'Contribution > 30 %',
    sub: [
      'Impact direct sur la performance business du studio',
      'Capacité à créer des opportunités : events, partenaires, urnes',
      'Fiabilité dans l\'exécution des missions confiées',
      'Capacité à apporter un plus personnel au studio',
    ]
  },
];

// ─── Essentiels du jour Coach ────────────────────────────────
const DAILY_YESNO = [
  { key: 'check_club', label: 'État du club vérifié' },
  { key: 'story', label: 'Story du jour publiée' },
  { key: 'fichier_client', label: 'Fichier client mis à jour' },
  { key: 'cr_journee', label: 'Compte rendu transmis' },
];
const DAILY_COUNTERS = [
  { key: 'references', label: 'Prises de référence' },
  { key: 'relances_nf', label: 'Call Non fréquentant' },
  { key: 'avis_google', label: 'Avis Google' },
  { key: 'temoignages', label: 'Témoignages' },
  { key: 'surpack', label: 'Surpack', unit: '€' },
];

// ─── Helpers ────────────────────────────────────────────────
function formatDate(d) {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatMonthLabel(month) {
  const [y, m] = month.split('-');
  const date = new Date(parseInt(y), parseInt(m) - 1, 1);
  return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}
function monthDe(month) {
  const [y, m] = month.split('-');
  const name = new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString('fr-FR', { month: 'long' });
  return /^[aeiouàâéèêëîïôùûü]/i.test(name) ? `d'${name}` : `de ${name}`;
}

function prevMonth(month) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function nextMonth(month) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmt(n) {
  if (n == null || isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(Number(n)));
}

// ── Score E.L.I.T.E.S — badge header persistant ──────────────
function updateHeaderElitesScore(total, max) {
  const badge = document.getElementById('header-elites-score');
  const el = document.getElementById('hes-score');
  if (!badge || !el) return;
  if (total == null || max == null) { badge.classList.remove('visible'); return; }
  el.textContent = total;
  badge.classList.add('visible');
  // Couleur selon niveau
  const pct = total / max;
  el.style.color = pct >= 0.75 ? '#22c55e' : pct >= 0.5 ? '#C9A961' : '#ef4444';
}

function formatAnalysis(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong class="analysis-heading">$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, (match) => '<ul>' + match + '</ul>')
    .replace(/<\/ul>\s*<ul>/g, '')
    .replace(/\n{2,}/g, '<br>')
    .replace(/\n/g, '');
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  // Prefix all coach routes with /api/coach (auth routes use /api/auth directly)
  const url = path.startsWith('/auth/') ? `/api${path}` : `/api/coach${path}`;
  const res = await fetch(url, {
    headers, ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Erreur ${res.status}`);
  }
  return res.json();
}

// ─── Auth UI ────────────────────────────────────────────────
function showLogin() { document.getElementById('login-overlay').classList.remove('hidden'); }
function hideLogin() { document.getElementById('login-overlay').classList.add('hidden'); }

function updateUserUI() {
  const infoDiv = document.getElementById('user-info');
  const nameSpan = document.getElementById('user-name');
  const appTitle = document.getElementById('app-title');
  if (currentUser) {
    nameSpan.textContent = currentUser.role === 'admin' ? 'Admin' : currentUser.role === 'director' ? 'Directeur' : currentUser.name || 'Academy';
    infoDiv.classList.remove('hidden');
    if (appTitle) appTitle.textContent = isAcademy() ? 'Academy' : isDirector() ? 'Réseau' : 'Coach';
    // Bouton « Nutrition » masqué : les 3 onglets (Challenge / Groupes / Messages)
    // remplacent l'ancien tableau de bord nutrition côté coach.
    const nutBtn = document.getElementById('btn-nutrition');
    if (nutBtn) nutBtn.style.display = 'none';
  } else {
    infoDiv.classList.add('hidden');
    if (appTitle) appTitle.textContent = 'Coach';
  }
}

function initAuthUI() {
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
        const loginCard = document.querySelector('.login-card');
        if (loginCard) {
          loginCard.classList.add('shake');
          setTimeout(() => loginCard.classList.remove('shake'), 350);
        }
        return;
      }
      authToken = data.token;
      currentUser = { role: data.role, name: data.name, coach_id: data.coach_id, is_leader: data.is_leader || false };
      localStorage.setItem('authToken_coach', authToken);
      localStorage.setItem('currentUser_coach', JSON.stringify(currentUser));
      enforceAdminOnlyElements();
      pinInput.value = '';

      if (data.role === 'coach') {
        // Show club selection
        document.getElementById('login-overlay').classList.add('hidden');
        showClubSelect();
      } else if (data.role === 'academy') {
        // Academy mode — direct access, no name selection needed
        hideLogin();
        updateUserUI();
        await bootApp();
      } else {
        // Admin → go directly
        hideLogin();
        updateUserUI();
        await bootApp();
      }
    } catch (err) {
      errorDiv.textContent = 'Erreur de connexion';
      errorDiv.classList.remove('hidden');
    }
  });

  const nutBtn = document.getElementById('btn-nutrition');
  if (nutBtn) nutBtn.addEventListener('click', () => {
    // Copie la session coach vers les cles principales lues par le gate /nutrition
    // (marche meme si le coach s'est connecte directement via /coach/).
    try {
      if (authToken) localStorage.setItem('authToken', authToken);
      if (currentUser) localStorage.setItem('currentUser', JSON.stringify(currentUser));
    } catch (_) { /* ignore */ }
    window.location.href = '/nutrition';
  });

  document.getElementById('btn-logout').addEventListener('click', async () => {
    try { await fetch('/api/auth/logout', { method: 'POST', headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {} }); } catch (_) {}
    authToken = null;
    currentUser = null;
    document.body.classList.remove('is-admin');
    selectedClub = '';
    valSelectedCoachId = null;
    valInitialized = false;
    localStorage.removeItem('authToken_coach');
    localStorage.removeItem('currentUser_coach');
    localStorage.removeItem('selectedClub_coach');
    updateUserUI();
    showLogin();
  });
}

const MAIN_STUDIOS = [
  { name: 'Wasquehal', color: '#3b82f6' },
  { name: 'Lille',     color: '#10b981' },
  { name: 'Marcq',     color: '#f59e0b' },
  { name: 'Boulogne',  color: '#ef4444' },
  { name: 'Neuilly',   color: '#8b5cf6' },
  { name: 'Levallois', color: '#ec4899' },
];

function showClubSelect() {
  const overlay = document.getElementById('club-select-overlay');
  const grid = document.getElementById('club-select-grid');
  overlay.classList.remove('hidden');

  grid.innerHTML = MAIN_STUDIOS.map(s => `
    <button class="club-select-btn" data-club="${s.name}"
            style="--studio-color:${s.color}">
      <span class="club-select-btn-dot" style="background:${s.color}"></span>
      <span class="club-select-btn-label">${s.name}</span>
    </button>`
  ).join('');

  grid.querySelectorAll('.club-select-btn').forEach(btn => {
    // Hover: tint border with studio color
    const color = btn.style.getPropertyValue('--studio-color');
    btn.addEventListener('mouseenter', () => {
      btn.style.borderColor = color;
      btn.style.background = color + '14';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.borderColor = '';
      btn.style.background = '';
    });
    btn.addEventListener('click', async () => {
      selectedClub = btn.dataset.club;
      localStorage.setItem('selectedClub_coach', selectedClub);
      overlay.classList.add('hidden');
      hideLogin();
      updateUserUI();
      await bootApp();
    });
  });
}



// ─── Boot ───────────────────────────────────────────────────
let _appBooted = false;

async function bootApp() {
  if (isAdmin()) {
    document.body.classList.add('is-admin');
  } else {
    document.body.classList.remove('is-admin');
  }

  coaches = await api('/coaches');
  const now = new Date();
  currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  try {
    const statusRes = await fetch('/api/status');
    if (statusRes.ok) featureStatus = await statusRes.json();
  } catch (_) {}

  if (!_appBooted) {
    initTabs();
    initDashboardNav();
    initRecapTab();
    initControlTab();
    initStudiosTab();
    initNotesTab();
    initCommunityTab();
    _appBooted = true;
    enforceAdminOnlyElements();
  }

  const adminPanel = document.getElementById('admin-coaches-panel');
  if (adminPanel) adminPanel.classList.toggle('hidden', !isAdmin());
  updateTabVisibility();
  fetchHeaderElitesScore(); // silencieux, non-bloquant

  if (isAdmin()) {
    await loadDashboard();
  } else if (isAcademy()) {
    await loadValidation();
  } else {
    await loadTodayTab();
  }
}

// ─── Tabs ───────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      const tab = document.getElementById(`tab-${btn.dataset.tab}`);
      if (tab) tab.classList.add('active');

      const t = btn.dataset.tab;
      if (t === 'dashboard') loadDashboard();
      else if (t === 'today') loadTodayTab();
      else if (t === 'challenge') loadChallengeTab();
      else if (t === 'messagerie') loadMessagerieTab();
      else if (t === 'academy') loadAcademyBadges();
      else if (t === 'recap') loadRecapTab();
      else if (t === 'notes') loadNotes();
      else if (t === 'controle') loadControlTab();
      else if (t === 'community') { if (!commActiveClubFilter) commActiveClubFilter = getMyStudio() || ''; loadCommunityMessages(); }
      else if (t === 'ressources') loadRessources();
      else if (t === 'module') loadModuleTab();
      else if (t === 'validation') loadValidation();
      else if (t === 'parcours') loadParcoursTab();
      else if (t === 'calendrier') loadCalendrierTab();
      else if (t === 'accompagnement') { loadAccompagnementTab(); }
      else if (t === 'pilotage') { loadPilotageTab(); }
      else if (t === 'revue') { loadRevueTab(); }
      else if (t === 'dr-revues') { loadDrRevuesTab(); }
      else if (t === 'suivi-dr') { loadSuiviDrTab(); }
      else if (t === 'palmares') { loadPalmaresTab(); }
      else if (t === 'vue-ensemble') { loadVueEnsembleTab(); }
      else if (t === 'perso') { initPerso(); }
      else if (t === 'data') { loadDataTab(); }
    });
  });
}

function updateTabVisibility() {
  // Label/icon adjustments per role
  const validationTabBtn = document.querySelector('[data-tab="validation"] .tab-label');
  if (validationTabBtn) validationTabBtn.textContent = isAdmin() ? 'Validations' : 'ACADEMY';
  const validationTabIcon = document.querySelector('[data-tab="validation"] .tab-icon');
  if (validationTabIcon) validationTabIcon.textContent = isAdmin() ? '✅' : '🎓';
  const valTitle = document.getElementById('val-section-title');
  if (valTitle) valTitle.textContent = isAdmin() ? '✅ Validation des formations' : '🎓 ACADEMY';
  const valSub = document.getElementById('val-section-subtitle');
  if (valSub) valSub.textContent = isAdmin() ? 'Suivi des formations de l\'équipe' : 'Ton parcours de formations';

  // Rename ressources tab for 1234 academy users
  const ressTabLabel = document.querySelector('[data-tab="ressources"] .tab-label');
  if (ressTabLabel) ressTabLabel.textContent = isAcademy() ? 'PERF' : 'Academy';

  // Rename recap tab for Director
  const recapTabLabel = document.querySelector('[data-tab="recap"] .tab-label');
  if (recapTabLabel) recapTabLabel.textContent = isDirector() ? 'PERF' : 'Succès';
  const recapTabIcon = document.querySelector('[data-tab="recap"] .tab-icon');
  if (recapTabIcon) recapTabIcon.textContent = isDirector() ? '📈' : '🏆';

  const tabs = {
    today:          document.querySelector('[data-tab="today"]'),
    challenge:      document.querySelector('[data-tab="challenge"]'),
    dashboard:      document.querySelector('[data-tab="dashboard"]'),
    recap:          document.querySelector('[data-tab="recap"]'),
    notes:          document.querySelector('[data-tab="notes"]'),
    controle:       document.querySelector('[data-tab="controle"]'),
    community:      document.querySelector('[data-tab="community"]'),
    ressources:     document.querySelector('[data-tab="ressources"]'),
    module:         document.querySelector('[data-tab="module"]'),
    validation:     document.querySelector('[data-tab="validation"]'),
    parcours:       document.querySelector('[data-tab="parcours"]'),
    calendrier:     document.querySelector('[data-tab="calendrier"]'),
    perso:          document.querySelector('[data-tab="perso"]'),
    accompagnement: document.querySelector('[data-tab="accompagnement"]'),
    pilotage:       document.querySelector('[data-tab="pilotage"]'),
    revue:          document.querySelector('[data-tab="revue"]'),
    drRevues:       document.querySelector('[data-tab="dr-revues"]'),
    suiviDr:        document.querySelector('[data-tab="suivi-dr"]'),
    palmares:       document.querySelector('[data-tab="palmares"]'),
    vueEnsemble:    document.querySelector('[data-tab="vue-ensemble"]'),
    data:           document.querySelector('[data-tab="data"]'),
  };

  // Espace /coach/ : Challenge (clients) · Messagerie (privé + groupes) · Academy
  // (badges perso). L'admin/academy voit en plus « Validations » pour valider les
  // formations des coachs. Les autres onglets restent dans le code, masqués.
  Object.values(tabs).forEach((t) => { if (t) t.style.display = 'none'; });
  const _shown = ['challenge', 'messagerie', 'academy'];
  if (isFormationAdmin()) _shown.push('validation'); // admin + academy : validation des formations
  _shown.forEach((k) => { const b = document.querySelector('[data-tab="' + k + '"]'); if (b) b.style.display = ''; });
  if (tabs.challenge) tabs.challenge.click();
  return;

  if (isAdmin()) {
    // Hide everything, then show only what admin needs
    Object.values(tabs).forEach(t => { if (t) t.style.display = 'none'; });
    const adminShow = ['recap','calendrier','data','dashboard','suiviDr'];
    adminShow.forEach(k => { if (tabs[k]) tabs[k].style.display = ''; });
    // Rename Dashboard → RH3 and move to last position in nav
    if (tabs.dashboard) {
      const lbl = tabs.dashboard.querySelector('.tab-label');
      const ico = tabs.dashboard.querySelector('.tab-icon');
      if (lbl) lbl.textContent = 'RH';
      if (ico) ico.textContent = '📐';
      const nav = tabs.dashboard.closest('nav');
      if (nav) nav.appendChild(tabs.dashboard);
    }
    tabs.dashboard.click();
  } else if (isDirector()) {
    // 4321: Succès + Accompagnement + Palmarès + Vue d'ensemble + Parcours + Suivi DR
    Object.values(tabs).forEach(t => { if (t) t.style.display = 'none'; });
    if (tabs.recap)          tabs.recap.style.display = '';
    if (tabs.accompagnement) tabs.accompagnement.style.display = '';
    if (tabs.parcours)       tabs.parcours.style.display = '';
    if (tabs.palmares)       tabs.palmares.style.display = '';
    if (tabs.vueEnsemble)    tabs.vueEnsemble.style.display = '';
    if (tabs.suiviDr)        tabs.suiviDr.style.display = '';
    tabs.suiviDr.click();
  } else if (isAcademy()) {
    // 1234: PERF + MODULE + PARCOURS + CALENDRIER
    Object.values(tabs).forEach(t => { if (t) t.style.display = 'none'; });
    if (tabs.ressources)  tabs.ressources.style.display = '';
    if (tabs.module)      tabs.module.style.display = '';
    if (tabs.parcours)    tabs.parcours.style.display = '';
    if (tabs.calendrier)  tabs.calendrier.style.display = '';
    tabs.ressources.click();
  } else {
    // Coach / Leader: Journée + Succès + Team + ACADEMY + Calendrier (+ Accompagnement pour leaders)
    Object.values(tabs).forEach(t => { if (t) t.style.display = 'none'; });
    if (tabs.today)      tabs.today.style.display = '';
    if (tabs.challenge)  tabs.challenge.style.display = '';
    if (tabs.recap)      tabs.recap.style.display = '';
    if (tabs.community)  tabs.community.style.display = '';
    if (tabs.validation) tabs.validation.style.display = '';
    if (tabs.calendrier) tabs.calendrier.style.display = '';
    if (isLeader() && tabs.accompagnement) tabs.accompagnement.style.display = '';
    tabs.today.click();
  }
}

// ─── TODAY TAB (Coach) ──────────────────────────────────────
let crMediaRecorder = null;
let crAudioChunks = [];
let crRecording = false;
let crRecordingCancelled = false;
let crRecordingStart = 0;
let crRecordingTimer = null;
let crStream = null;

async function loadTodayTab() {
  const container = document.getElementById('today-container');
  if (!container) return;
  const coachId = getMyCoachId();
  if (!coachId) return;

  const today = formatDate(new Date());

  try {
    const values = await api(`/daily-actions/values/${coachId}/${today}`);
    const valMap = {};
    const textMap = {};
    values.forEach(v => { valMap[v.action_key] = v.value; if (v.text_value) textMap[v.action_key] = v.text_value; });

    const secondStudio = values.find(v => v.action_key === 'second_studio')?.text_value || '';
    const dayLabel = new Date(today + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const notesMembres = valMap['notes_membres'] || '';
    const notesJournee = valMap['notes_journee'] || '';

    // Pré-charger les actions clés du jour pour chaque studio
    const primaryStudioName = getMyStudio() || '';
    const leaderMonth = currentMonth;
    const [primaryActionData, secondActionData, nouveauxData] = await Promise.all([
      primaryStudioName ? api(`/club-daily-action/${encodeURIComponent(primaryStudioName)}`).catch(() => ({ action: null })) : Promise.resolve({ action: null }),
      secondStudio      ? api(`/club-daily-action/${encodeURIComponent(secondStudio)}`).catch(() => ({ action: null }))      : Promise.resolve({ action: null }),
      (isLeader() && primaryStudioName) ? api(`/club-nouveaux/${encodeURIComponent(primaryStudioName)}`).catch(() => ({ entries: [] })) : Promise.resolve({ entries: [] }),
    ]);
    const lesNouveaux = nouveauxData.entries || [];

    // Build studio section HTML (réutilisable pour 1er et 2ème studio)
    const buildStudioSection = (prefix, studioName, isPrimary, clubAction) => {
      const k = key => `${prefix}${key}`; // préfixe les clés de sauvegarde
      const energy = valMap[k('energie')] || 0;
      return `
      <div class="td-studio-group" data-prefix="${prefix}">
        <div class="td-block td-block-centered">
          <h3 class="td-block-title">Comment tu te sens aujourd’hui ?</h3>
          <div class="td-smileys-row td-smileys-big">
            <button class="td-smiley td-energy-5 ${energy === 5 ? 'active' : ''}" data-energy="5" data-prefix="${prefix}">
              <span class="td-smiley-emoji">🔥</span><span class="td-smiley-label">En feu !</span>
            </button>
            <button class="td-smiley td-energy-4 ${energy === 4 ? 'active' : ''}" data-energy="4" data-prefix="${prefix}">
              <span class="td-smiley-emoji">😊</span><span class="td-smiley-label">Bien</span>
            </button>
            <button class="td-smiley td-energy-3 ${energy === 3 ? 'active' : ''}" data-energy="3" data-prefix="${prefix}">
              <span class="td-smiley-emoji">😐</span><span class="td-smiley-label">Neutre</span>
            </button>
            <button class="td-smiley td-energy-2 ${energy === 2 ? 'active' : ''}" data-energy="2" data-prefix="${prefix}">
              <span class="td-smiley-emoji">😕</span><span class="td-smiley-label">Fatigué</span>
            </button>
            <button class="td-smiley td-energy-1 ${energy === 1 ? 'active' : ''}" data-energy="1" data-prefix="${prefix}">
              <span class="td-smiley-emoji">😞</span><span class="td-smiley-label">Pas top</span>
            </button>
          </div>
          <div class="td-club-badge-row">
            <span class="td-club-badge ${isPrimary ? '' : 'td-club-badge-second'}">📍 ${studioName}</span>
            ${isPrimary
              ? (secondStudio
                  ? `<button class="td-club-badge-remove" data-action="remove-second-studio" title="Retirer le 2ème studio">✕ 2ème studio</button>`
                  : `<button class="td-club-badge-add" data-action="add-second-studio">+ 2ème studio</button>`)
              : ''}
          </div>
          ${isPrimary ? `
          <div id="td-second-studio-picker" class="td-second-studio-picker hidden">
            <select id="td-second-studio-select">
              <option value="">— Choisir un studio —</option>
              ${CLUBS.filter(c => c !== getMyStudio()).map(c => `<option value="${c}" ${c === secondStudio ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>` : ''}
        </div>

        ${isLeader() && getMyAssignedStudio() === studioName ? `
        <div class="td-block td-block-leader-action" data-studio="${studioName}">
          <h3 class="td-block-title">📌 Action clé du jour — équipe</h3>
          <div class="td-leader-action-wrap">
            <input type="text" class="td-leader-action-input" maxlength="120"
              placeholder="Ex : Faire signer 2 contrats avant 14h…"
              value="${clubAction ? clubAction.replace(/"/g, '&quot;') : ''}">
            <div class="td-leader-action-btns">
              <button class="td-leader-action-save btn-primary-sm">Publier</button>
              ${clubAction ? `<button class="td-leader-action-clear btn-ghost-sm">Retirer</button>` : ''}
            </div>
          </div>
          ${clubAction ? `<div class="td-leader-action-status">✅ Action active pour ton équipe</div>` : ''}
        </div>` : ''}

        <div class="td-block td-block-essentials">
          <h3 class="td-block-title">Essentiels du jour</h3>
          <div class="td-checklist">
            ${DAILY_YESNO.map(a => {
              const fk = k(a.key);
              const checked = valMap[fk] ? 'checked' : '';
              const isCR = a.key === 'cr_journee';
              return `<label class="td-check-row ${checked ? 'td-done' : ''}">
                <input type="checkbox" class="td-yesno" data-key="${fk}" ${checked}>
                <span class="td-check-box"></span>
                <span class="td-check-label">${a.label}</span>
                ${isCR ? `
                <span class="td-cr-rec-wrap" id="td-cr-rec-wrap${prefix ? '-' + prefix.replace('_','') : ''}">
                  <button type="button" class="td-cr-mic-btn" data-prefix="${prefix}" id="td-cr-mic${prefix ? '-' + prefix.replace('_','') : ''}" title="Enregistrer un CR vocal">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                  </button>
                  <span class="td-cr-rec-live hidden" id="td-cr-rec-live${prefix ? '-' + prefix.replace('_','') : ''}">
                    <span class="comm-rec-dot"></span>
                    <span class="td-cr-rec-timer" id="td-cr-rec-timer${prefix ? '-' + prefix.replace('_','') : ''}">0:00</span>
                    <button type="button" class="td-cr-rec-cancel" id="td-cr-rec-cancel${prefix ? '-' + prefix.replace('_','') : ''}" title="Annuler">🗑️</button>
                  </span>
                </span>` : ''}
              </label>`;
            }).join('')}
            ${clubAction ? (() => {
              const fk = k('leader_action_done');
              const checked = valMap[fk] ? 'checked' : '';
              return `<label class="td-check-row td-check-row-action-cle ${checked ? 'td-done td-done-action-cle' : ''}">
                <input type="checkbox" class="td-yesno" data-key="${fk}" ${checked}>
                <span class="td-check-box td-check-box-action-cle"></span>
                <span class="td-action-cle-icon">📌</span>
                <span class="td-check-label td-action-cle-text">${clubAction}</span>
              </label>`;
            })() : ''}
          </div>
        </div>

        <div class="td-block td-block-indicators">
          <h3 class="td-block-title">Indicateurs du jour</h3>
          <div class="td-counters-grid">
            ${DAILY_COUNTERS.map(a => {
              const fk = k(a.key);
              const val = valMap[fk] || 0;
              if (a.key === 'surpack') {
                const surpackCard = `<div class="td-counter-card td-counter-surpack ${val > 0 ? 'td-counter-active' : ''}">
                  <div class="td-counter-label">${a.label} <span class="td-euro-tag">€</span></div>
                  <div class="td-counter-controls">
                    <input type="number" class="td-counter-val td-surpack-input" value="${val || ''}" min="0" step="1" placeholder="0" data-key="${fk}">
                    <span class="td-euro-suffix">€</span>
                  </div>
                </div>`;
                const nouveauxCard = isLeader() ? `<div class="td-counter-card td-counter-nouveaux">
                  <div class="td-counter-label">Les nouveaux</div>
                  ${(() => { const visible = lesNouveaux.filter(e => !e.leader_ok); return visible.length
                    ? `<div class="td-nv-cards">${visible.map(e => {
                        const needsSa    = !!e.sa;
                        const needsRib   = !!e.rib;
                        const needsCroix = !!e.croix && !e.leader_croix_ok;
                        const hasFlags   = needsSa || needsRib || needsCroix;
                        return `
                        <div class="td-nv-entry ${needsSa ? 'td-nv-arrete' : ''} ${needsRib ? 'td-nv-rib' : ''} ${needsCroix ? 'td-nv-has-croix' : ''}"
                             data-name="${e.name.replace(/"/g,'&quot;')}"
                             data-need-sa="${needsSa}" data-need-rib="${needsRib}" data-need-croix="${needsCroix}">
                          <div class="td-nv-entry-top">
                            <span class="td-nv-entry-name">${e.name}</span>
                            ${needsSa    ? '<button class="td-nv-badge td-nv-badge-arrete td-nv-ack-btn" data-ack="sa">⚠ SA</button>'  : ''}
                            ${needsRib   ? '<button class="td-nv-badge td-nv-badge-rib   td-nv-ack-btn" data-ack="rib">RIB</button>' : ''}
                            ${e.photo    ? '<button class="td-nv-badge td-nv-badge-photo td-nv-photo-ack">👤 Photo</button>' : ''}
                            ${needsCroix ? `<button class="td-nv-badge td-nv-badge-croix td-nv-croix-btn" data-text="${(e.croix_text||'').replace(/"/g,'&quot;')}">✚</button>` : ''}
                          </div>
                          <label class="td-nv-ok-label ${hasFlags ? 'td-nv-ok-locked' : ''}">
                            <input type="checkbox" class="td-nv-ok-chk" data-name="${e.name.replace(/"/g,'&quot;')}" ${hasFlags ? 'disabled' : ''}>
                            <span class="td-nv-ok-text">Sous contrôle</span>
                          </label>
                        </div>`;
                      }).join('')}
                      </div>`
                    : `<p class="td-nouveaux-empty">Aucun nouveau renseigné</p>`; })()}
                </div>` : '';
                return surpackCard + nouveauxCard;
              }
              return `<div class="td-counter-card ${val > 0 ? 'td-counter-active' : ''}">
                <div class="td-counter-label">${a.label}</div>
                <div class="td-counter-controls">
                  <button class="td-counter-btn" data-key="${fk}" data-dir="minus">−</button>
                  <input type="number" class="td-counter-val" value="${val}" min="0" data-key="${fk}">
                  <button class="td-counter-btn" data-key="${fk}" data-dir="plus">+</button>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>`;
    };

    let html = `
    <div class="td-page">
      <div class="td-header">
        <h2>📋 Ma journée — ${dayLabel}</h2>
      </div>
      ${buildStudioSection('', getMyStudio() || 'Mon studio', true,  primaryActionData.action)}
      ${secondStudio ? buildStudioSection('s2_', secondStudio, false, secondActionData.action) : ''}
    </div>`;

    container.innerHTML = html;
    bindTodayEvents(container, coachId, today);
  } catch (err) {
    console.error('Erreur chargement Aujourd\'hui:', err);
    container.innerHTML = '<p style="color:red;">Erreur de chargement</p>';
  }
}

function bindTodayEvents(container, coachId, today) {

  // ── Nouveaux : acquittement SA/RIB + Sous contrôle (leader) ─
  const leaderStudio = getMyStudio();

  function dismissNvEntry(entry, name) {
    entry.style.transition = 'opacity .3s, transform .3s, max-height .35s';
    entry.style.overflow = 'hidden';
    entry.style.opacity = '0';
    entry.style.transform = 'scale(.95)';
    entry.style.maxHeight = entry.offsetHeight + 'px';
    setTimeout(() => { entry.style.maxHeight = '0'; entry.style.padding = '0'; entry.style.margin = '0'; }, 50);
    setTimeout(() => entry.remove(), 400);
    api(`/club-nouveaux/${encodeURIComponent(leaderStudio)}/ok`, {
      method: 'PATCH', body: { name, leader_ok: true }
    }).catch(() => {});
  }

  function checkNvUnlock(entry) {
    // Déverrouille "Sous contrôle" quand plus aucun badge SA/RIB ni croix active
    const remaining = entry.querySelectorAll('.td-nv-ack-btn:not(.td-nv-ack-done)').length
                    + entry.querySelectorAll('.td-nv-croix-btn:not(.td-nv-ack-done)').length;
    const chk   = entry.querySelector('.td-nv-ok-chk');
    const label = entry.querySelector('.td-nv-ok-label');
    if (chk)   chk.disabled = remaining > 0;
    if (label) label.classList.toggle('td-nv-ok-locked', remaining > 0);
  }

  // Boutons SA / RIB — disparaissent au clic
  container.querySelectorAll('.td-nv-ack-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const entry = btn.closest('.td-nv-entry');
      if (btn.dataset.ack === 'sa')  entry?.classList.remove('td-nv-arrete');
      if (btn.dataset.ack === 'rib') entry?.classList.remove('td-nv-rib');
      btn.style.transition = 'opacity .2s, transform .2s';
      btn.style.opacity = '0';
      btn.style.transform = 'scale(.7)';
      btn.classList.add('td-nv-ack-done');
      setTimeout(() => { btn.style.display = 'none'; }, 220);
      if (entry) checkNvUnlock(entry);
    });
  });

  // Bouton Photo — disparaît au clic (informatif, ne bloque pas Sous contrôle)
  container.querySelectorAll('.td-nv-photo-ack').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.style.transition = 'opacity .2s, transform .2s';
      btn.style.opacity = '0';
      btn.style.transform = 'scale(.7)';
      setTimeout(() => btn.remove(), 220);
    });
  });

  // Bouton Croix rouge — ouvre une popup avec le message
  const nvPopupEl = (() => {
    let el = document.getElementById('nv-croix-popup');
    if (!el) {
      el = document.createElement('div');
      el.id = 'nv-croix-popup';
      el.className = 'nv-croix-overlay';
      el.innerHTML = `
        <div class="nv-croix-popup">
          <div class="nv-croix-popup-header">
            <span class="nv-croix-popup-title">✚ Message</span>
            <button class="nv-croix-popup-close" title="Fermer">×</button>
          </div>
          <p class="nv-croix-popup-text"></p>
          <label class="nv-croix-popup-fait-label">
            <input type="checkbox" class="nv-croix-fait-chk">
            <span>Fait ✓</span>
          </label>
        </div>`;
      document.body.appendChild(el);
      el.querySelector('.nv-croix-popup-close').addEventListener('click', () => el.classList.remove('nv-croix-visible'));
      el.addEventListener('click', e => { if (e.target === el) el.classList.remove('nv-croix-visible'); });
    }
    return el;
  })();

  container.querySelectorAll('.td-nv-croix-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const entry = btn.closest('.td-nv-entry');
      const text  = btn.dataset.text || '(aucun message)';
      nvPopupEl.querySelector('.nv-croix-popup-text').textContent = text;
      nvPopupEl.querySelector('.nv-croix-fait-chk').checked = false;
      nvPopupEl.classList.add('nv-croix-visible');

      // Remplacer le handler "fait" pour cette instance
      const chkEl = nvPopupEl.querySelector('.nv-croix-fait-chk');
      const freshChk = chkEl.cloneNode(true);
      chkEl.replaceWith(freshChk);
      freshChk.addEventListener('change', async () => {
        if (!freshChk.checked) return;
        nvPopupEl.classList.remove('nv-croix-visible');
        // Retirer le bouton croix de l'entrée
        btn.style.transition = 'opacity .2s, transform .2s';
        btn.style.opacity = '0';
        btn.style.transform = 'scale(.7)';
        btn.classList.add('td-nv-ack-done');
        entry?.classList.remove('td-nv-has-croix');
        setTimeout(() => { btn.style.display = 'none'; }, 220);
        if (entry) checkNvUnlock(entry);
        const name = entry?.dataset.name;
        if (name) {
          await api(`/club-nouveaux/${encodeURIComponent(leaderStudio)}/ok`, {
            method: 'PATCH', body: { name, leader_croix_ok: true }
          }).catch(() => {});
        }
      });
    });
  });

  // Checkbox "Sous contrôle"
  container.querySelectorAll('.td-nv-ok-chk').forEach(chk => {
    chk.addEventListener('change', async () => {
      if (!chk.checked) return;
      const entry = chk.closest('.td-nv-entry');
      const name  = chk.dataset.name;
      dismissNvEntry(entry, name);
    });
  });

  // ── Action clé du jour (leader) ───────────────────────────
  container.querySelectorAll('.td-block-leader-action').forEach(block => {
    const studio  = block.dataset.studio;
    const input   = block.querySelector('.td-leader-action-input');
    const saveBtn = block.querySelector('.td-leader-action-save');
    const clearBtn = block.querySelector('.td-leader-action-clear');
    const status  = block.querySelector('.td-leader-action-status');

    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const text = input?.value?.trim();
        if (!text) return;
        saveBtn.disabled = true; saveBtn.textContent = '…';
        try {
          await api(`/club-daily-action/${encodeURIComponent(studio)}`, {
            method: 'PUT', body: { action_text: text }
          });
          saveBtn.textContent = '✓ Publié'; saveBtn.style.color = '#22c55e';
          if (status) { status.textContent = '✅ Action active pour ton équipe'; status.style.display = ''; }
          if (!clearBtn) {
            const btn = document.createElement('button');
            btn.className = 'td-leader-action-clear btn-ghost-sm';
            btn.textContent = 'Retirer';
            saveBtn.after(btn);
            btn.addEventListener('click', () => clearBtn?.click());
          }
          setTimeout(() => { saveBtn.textContent = 'Publier'; saveBtn.style.color = ''; saveBtn.disabled = false; }, 2000);
        } catch(e) {
          saveBtn.textContent = '⚠ Erreur'; saveBtn.style.color = '#ef4444';
          setTimeout(() => { saveBtn.textContent = 'Publier'; saveBtn.style.color = ''; saveBtn.disabled = false; }, 3000);
        }
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        clearBtn.disabled = true; clearBtn.textContent = '…';
        try {
          await api(`/club-daily-action/${encodeURIComponent(studio)}`, {
            method: 'PUT', body: { action_text: '' }
          });
          if (input) input.value = '';
          if (status) status.style.display = 'none';
          clearBtn.remove();
        } catch(e) {
          clearBtn.textContent = '⚠ Erreur'; clearBtn.style.color = '#ef4444';
          setTimeout(() => { clearBtn.textContent = 'Retirer'; clearBtn.style.color = ''; clearBtn.disabled = false; }, 3000);
        }
      });
    }
  });

  // Energy — scoped per studio group
  container.querySelectorAll('.td-smiley').forEach(btn => {
    btn.addEventListener('click', async () => {
      const prefix = btn.dataset.prefix || '';
      // Only clear smileys belonging to the same studio group
      container.querySelectorAll(`.td-smiley[data-prefix="${prefix}"]`).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      await api(`/daily-actions/values/${coachId}/${today}`, {
        method: 'PUT', body: { action_key: prefix + 'energie', value: parseInt(btn.dataset.energy) }
      });
    });
  });

  // Second studio — add
  const addStudioBtn = container.querySelector('[data-action="add-second-studio"]');
  const picker = container.querySelector('#td-second-studio-picker');
  const studioSelect = container.querySelector('#td-second-studio-select');
  if (addStudioBtn && picker && studioSelect) {
    addStudioBtn.addEventListener('click', () => {
      picker.classList.toggle('hidden');
      if (!picker.classList.contains('hidden')) studioSelect.focus();
    });
    studioSelect.addEventListener('change', async () => {
      const val = studioSelect.value;
      if (!val) return;
      await api(`/daily-actions/values/${coachId}/${today}`, {
        method: 'PUT', body: { action_key: 'second_studio', value: 0, text_value: val }
      });
      loadTodayTab(); // reload pour afficher le badge
    });
  }

  // Second studio — remove
  const removeStudioBtn = container.querySelector('[data-action="remove-second-studio"]');
  if (removeStudioBtn) {
    removeStudioBtn.addEventListener('click', async () => {
      await api(`/daily-actions/values/${coachId}/${today}`, {
        method: 'PUT', body: { action_key: 'second_studio', value: 0, text_value: '' }
      });
      loadTodayTab();
    });
  }

  // Yes/No
  container.querySelectorAll('.td-yesno').forEach(cb => {
    cb.addEventListener('change', async () => {
      await api(`/daily-actions/values/${coachId}/${today}`, {
        method: 'PUT', body: { action_key: cb.dataset.key, value: cb.checked ? 1 : 0 }
      });
      const row = cb.closest('.td-check-row');
      if (row) row.classList.toggle('td-done', cb.checked);
    });
  });

  // Counters
  container.querySelectorAll('.td-counter-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.key;
      const input = container.querySelector(`.td-counter-val[data-key="${key}"]`);
      let val = parseInt(input.value) || 0;
      val = btn.dataset.dir === 'plus' ? val + 1 : Math.max(0, val - 1);
      input.value = val;
      await api(`/daily-actions/values/${coachId}/${today}`, {
        method: 'PUT', body: { action_key: key, value: val }
      });
      const card = btn.closest('.td-counter-card');
      if (card) card.classList.toggle('td-counter-active', val > 0);
    });
  });

  container.querySelectorAll('.td-counter-val').forEach(input => {
    const saveVal = async () => {
      const isSurpack = input.dataset.key.endsWith('surpack');
      const val = isSurpack
        ? Math.max(0, parseFloat(input.value) || 0)
        : Math.max(0, parseInt(input.value) || 0);
      if (!isSurpack) input.value = val;
      await api(`/daily-actions/values/${coachId}/${today}`, {
        method: 'PUT', body: { action_key: input.dataset.key, value: val }
      });
      const card = input.closest('.td-counter-card');
      if (card) card.classList.toggle('td-counter-active', val > 0);
    };
    input.addEventListener('change', saveVal);
    if (input.dataset.key.endsWith('surpack')) {
      input.addEventListener('blur', saveVal);
    }
  });

  // CR Vocal buttons — works for both primary and second studio
  container.querySelectorAll('.td-cr-mic-btn').forEach(micBtn => {
    micBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (crRecording) {
        stopCRRecording(micBtn);
      } else {
        startCRRecording(micBtn);
      }
    });
  });
}

async function startCRRecording(btn) {
  try {
    crStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    crAudioChunks = [];

    let mimeType = '';
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4', ''];
    for (const mt of candidates) {
      if (!mt || MediaRecorder.isTypeSupported(mt)) { mimeType = mt; break; }
    }

    const options = mimeType ? { mimeType } : {};
    crMediaRecorder = new MediaRecorder(crStream, options);

    crMediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) crAudioChunks.push(e.data);
    };

    crMediaRecorder.onstop = async () => {
      if (crStream) { crStream.getTracks().forEach(t => t.stop()); crStream = null; }

      if (crRecordingCancelled) { crRecordingCancelled = false; return; }

      const actualMime = crMediaRecorder.mimeType || 'audio/webm';
      const blob = new Blob(crAudioChunks, { type: actualMime });
      const durationSec = (Date.now() - crRecordingStart) / 1000;

      if (durationSec < 0.5) return;

      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result;
        try {
          // Auto club from coach studio
          const targetClub = getMyStudio() || null;
          await api('/community/messages', {
            method: 'POST',
            body: { type: 'audio', audio_data: base64, audio_duration: Math.round(durationSec), is_cr: true, target_club: targetClub }
          });
          // Also mark CR as done
          const coachId = getMyCoachId();
          const today = formatDate(new Date());
          await api(`/daily-actions/values/${coachId}/${today}`, {
            method: 'PUT', body: { action_key: 'cr_journee', value: 1 }
          });
          // Update checkbox UI
          const cb = document.querySelector('.td-yesno[data-key="cr_journee"]');
          if (cb) {
            cb.checked = true;
            const row = cb.closest('.td-check-row');
            if (row) row.classList.add('td-done');
          }
          alert('CR vocal envoyé !');
        } catch (err) {
          alert('Erreur envoi CR vocal : ' + err.message);
        }
      };
      reader.readAsDataURL(blob);
    };

    crMediaRecorder.start(100);
    crRecording = true;
    crRecordingCancelled = false;
    crRecordingStart = Date.now();
    btn.classList.add('recording');

    // Afficher le timer live, brancher le bouton annuler
    const prefix = btn.dataset.prefix || '';
    const suffix = prefix ? '-' + prefix.replace('_','') : '';
    const recLive   = document.getElementById(`td-cr-rec-live${suffix}`);
    const timerEl   = document.getElementById(`td-cr-rec-timer${suffix}`);
    const cancelBtn = document.getElementById(`td-cr-rec-cancel${suffix}`);
    if (recLive) recLive.classList.remove('hidden');
    if (timerEl) { timerEl.textContent = '0:00'; timerEl.classList.remove('over'); }
    if (cancelBtn) cancelBtn.onclick = () => cancelCRRecording(btn);

    crRecordingTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - crRecordingStart) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      if (timerEl) {
        timerEl.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
        if (elapsed >= 60) timerEl.classList.add('over');
      }
    }, 200);

  } catch (err) {
    alert('Impossible d\'accéder au microphone.');
    crRecording = false;
  }
}

function _crResetUI(btn) {
  const prefix = (btn && btn.dataset.prefix) || '';
  const suffix = prefix ? '-' + prefix.replace('_','') : '';
  const recLive = document.getElementById(`td-cr-rec-live${suffix}`);
  if (recLive) recLive.classList.add('hidden');
  document.querySelectorAll('.td-cr-mic-btn').forEach(b => b.classList.remove('recording'));
  if (crRecordingTimer) { clearInterval(crRecordingTimer); crRecordingTimer = null; }
}

function stopCRRecording(btn) {
  crRecording = false;
  if (crMediaRecorder && crMediaRecorder.state === 'recording') {
    crMediaRecorder.stop();
  }
  if (crStream) { crStream.getTracks().forEach(t => t.stop()); crStream = null; }
  _crResetUI(btn || document.querySelector('.td-cr-mic-btn.recording'));
}

function cancelCRRecording(btn) {
  if (!crRecording) return;
  crRecordingCancelled = true;
  crRecording = false;
  if (crMediaRecorder && crMediaRecorder.state === 'recording') crMediaRecorder.stop();
  if (crStream) { crStream.getTracks().forEach(t => t.stop()); crStream = null; }
  _crResetUI(btn || document.querySelector('.td-cr-mic-btn.recording'));
}

// ─── DASHBOARD (Admin) ──────────────────────────────────────
let dashMonth = '';

function initDashboardNav() {
  const prev = document.getElementById('dash-prev-month');
  const next = document.getElementById('dash-next-month');
  const picker = document.getElementById('dash-month-picker');

  if (prev) prev.addEventListener('click', () => { dashMonth = prevMonth(dashMonth); loadDashboard(); });
  if (next) next.addEventListener('click', () => { dashMonth = nextMonth(dashMonth); loadDashboard(); });
  if (picker) picker.addEventListener('change', () => { if (picker.value) { dashMonth = picker.value; loadDashboard(); } });

  const form = document.getElementById('add-coach-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('new-coach-name').value.trim();
      const studio = document.getElementById('new-coach-studio').value.trim();
      const is_leader = document.getElementById('new-coach-is-leader').checked;
      if (!name) return;
      try {
        await api('/coaches', { method: 'POST', body: { name, studio, is_leader } });
        document.getElementById('new-coach-name').value = '';
        document.getElementById('new-coach-studio').value = '';
        document.getElementById('new-coach-is-leader').checked = false;
        coaches = await api('/coaches');
        loadDashboard();
      } catch (err) { alert(err.message); }
    });
  }
}

async function loadDashboard() {
  if (!dashMonth) dashMonth = currentMonth;
  const label = document.getElementById('dash-month-label');
  const picker = document.getElementById('dash-month-picker');
  if (label) label.textContent = formatMonthLabel(dashMonth);
  if (picker) picker.value = dashMonth;

  const container = document.getElementById('dashboard-cards');
  if (!container) return;

  try {
    const data = await api(`/months/${dashMonth}/dashboard`);

    container.innerHTML = '';
    renderAdminCoachList();
  } catch (err) {
    console.error('Erreur dashboard:', err);
    container.innerHTML = '<p style="color:red;">Erreur de chargement</p>';
  }
}

function renderAdminCoachList() {
  const list = document.getElementById('admin-coach-list');
  if (!list || !isAdmin()) return;

  list.innerHTML = coaches.filter(c => !c.archived).map(c => `
    <div class="admin-coach-card" data-coach-id="${c.id}">
      <div class="admin-coach-card-header">
        <span class="admin-coach-name">${c.name}${c.is_leader ? ' <span class="badge-leader">Leader</span>' : ''}</span>
        <button class="btn-edit-sm" onclick="openEditCoach(${c.id})" title="Modifier">✏️</button>
        <button class="btn-danger-sm" onclick="archiveCoach(${c.id})" title="Archiver">🗑️</button>
      </div>
      <div class="admin-coach-info">
        <span class="admin-coach-detail">🔑 ${c.pin || '—'}</span>
        <span class="admin-coach-detail">📍 ${c.studio || 'Aucun club'}</span>
        <span class="admin-coach-detail">${c.is_leader ? '👑 Leader' : '🏋️ Coach'}</span>
      </div>
    </div>
  `).join('');
}

function openEditCoach(coachId) {
  const coach = coaches.find(c => c.id === coachId);
  if (!coach) return;

  // Remove any existing edit overlay
  const existing = document.getElementById('edit-coach-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'edit-coach-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <h3>Modifier — ${coach.name}</h3>
        <button class="modal-close" id="edit-coach-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="modal-field">
          <label>Nom</label>
          <input type="text" id="edit-coach-name" value="${coach.name}">
        </div>
        <div class="modal-field">
          <label>Code PIN</label>
          <input type="text" id="edit-coach-pin" value="${coach.pin || ''}" maxlength="6" placeholder="ex: mari">
        </div>
        <div class="modal-field">
          <label>Club d’appartenance</label>
          <select id="edit-coach-studio">
            <option value="">— Aucun —</option>
            ${CLUBS.map(club => `<option value="${club}" ${coach.studio === club ? 'selected' : ''}>${club}</option>`).join('')}
          </select>
        </div>
        <div class="modal-field">
          <label>Statut</label>
          <div class="modal-toggle-row">
            <button class="modal-toggle-btn ${!coach.is_leader ? 'active' : ''}" data-leader="0">🏋️ Coach</button>
            <button class="modal-toggle-btn ${coach.is_leader ? 'active' : ''}" data-leader="1">👑 Coach Leader</button>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="edit-coach-cancel">Annuler</button>
        <button class="btn-primary" id="edit-coach-save">Enregistrer</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Toggle buttons
  let selectedLeader = coach.is_leader ? 1 : 0;
  overlay.querySelectorAll('.modal-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('.modal-toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedLeader = parseInt(btn.dataset.leader);
    });
  });

  // Close
  const closeModal = () => overlay.remove();
  overlay.querySelector('#edit-coach-close').addEventListener('click', closeModal);
  overlay.querySelector('#edit-coach-cancel').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

  // Save
  overlay.querySelector('#edit-coach-save').addEventListener('click', async () => {
    const body = {
      name: document.getElementById('edit-coach-name').value.trim(),
      pin: document.getElementById('edit-coach-pin').value.trim(),
      studio: document.getElementById('edit-coach-studio').value,
      is_leader: selectedLeader === 1,
    };

    if (!body.name) return alert('Le nom est requis');
    if (!body.pin) return alert('Le code PIN est requis');

    try {
      await api(`/coaches/${coachId}`, { method: 'PATCH', body });
      coaches = await api('/coaches');
      closeModal();
      loadDashboard();
    } catch (err) {
      alert(err.message);
    }
  });
}

async function showResiliationMembers(month, coachId) {
  try {
    const data = await api(`/months/${month}/resiliations/${coachId}`);
    const coach = coaches.find(c => c.id === coachId);
    const coachName = coach ? coach.name : 'Coach';
    const admin = isAdmin();

    const existing = document.getElementById('resiliation-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'resiliation-overlay';
    overlay.className = 'modal-overlay';

    function renderContent() {
      return `
        <div class="modal-card">
          <div class="modal-header">
            <h3>Résiliations — ${coachName}</h3>
            <button class="modal-close" id="resil-close">✕</button>
          </div>
          <div class="modal-body">
            <p style="color:var(--text-muted);font-size:.8rem;margin-bottom:12px;">${formatMonthLabel(month)} — ${data.members.length} membre${data.members.length > 1 ? 's' : ''}</p>
            <div class="resil-list" id="resil-list">
              ${data.members.length === 0 ? '<p style="color:var(--text-muted);text-align:center;padding:16px 0;">Aucune résiliation ce mois</p>' : ''}
              ${data.members.map(m => `
                <div class="resil-member-row">
                  <span class="resil-member-name">👤 ${m.member_name}</span>
                  ${admin ? `<button class="resil-delete-btn" data-id="${m.id}" title="Retirer">✕</button>` : ''}
                </div>
              `).join('')}
            </div>
            ${admin ? `
            <div class="resil-add-row">
              <input type="text" id="resil-new-name" placeholder="Nom du membre résilié" class="resil-input">
              <button class="btn-primary resil-add-btn" id="resil-add-btn">+ Ajouter</button>
            </div>` : ''}
          </div>
        </div>
      `;
    }

    overlay.innerHTML = renderContent();
    document.body.appendChild(overlay);

    // Bind close
    const bindClose = () => {
      overlay.querySelector('#resil-close').addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    };
    bindClose();

    // Bind add
    if (admin) {
      const addBtn = overlay.querySelector('#resil-add-btn');
      const addInput = overlay.querySelector('#resil-new-name');
      const doAdd = async () => {
        const name = addInput.value.trim();
        if (!name) return;
        const result = await api(`/months/${month}/resiliations/${coachId}`, { method: 'POST', body: { member_name: name } });
        data.members.push({ id: result.id, member_name: result.member_name });
        overlay.innerHTML = renderContent();
        bindClose();
        bindActions();
      };
      addBtn.addEventListener('click', doAdd);
      addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
    }

    // Bind delete buttons
    const bindActions = () => {
      if (admin) {
        overlay.querySelectorAll('.resil-delete-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            await api(`/months/${month}/resiliations/${id}`, { method: 'DELETE' });
            data.members = data.members.filter(m => m.id != id);
            overlay.innerHTML = renderContent();
            bindClose();
            bindActions();
          });
        });
        const addBtn2 = overlay.querySelector('#resil-add-btn');
        const addInput2 = overlay.querySelector('#resil-new-name');
        if (addBtn2 && addInput2) {
          const doAdd2 = async () => {
            const name = addInput2.value.trim();
            if (!name) return;
            const result = await api(`/months/${month}/resiliations/${coachId}`, { method: 'POST', body: { member_name: name } });
            data.members.push({ id: result.id, member_name: result.member_name });
            overlay.innerHTML = renderContent();
            bindClose();
            bindActions();
          };
          addBtn2.addEventListener('click', doAdd2);
          addInput2.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd2(); });
        }
      }
    };
    bindActions();

  } catch (err) {
    alert('Erreur : ' + err.message);
  }
}

async function showNonFrequentantMembers(month, coachId) {
  try {
    const data = await api(`/months/${month}/non-frequentants/${coachId}`);
    const coach = coaches.find(c => c.id === coachId);
    const coachName = coach ? coach.name : 'Coach';
    const admin = isAdmin();

    const existing = document.getElementById('nf-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'nf-overlay';
    overlay.className = 'modal-overlay';

    function renderContent() {
      return `
        <div class="modal-card">
          <div class="modal-header">
            <h3>Non fréquentants — ${coachName}</h3>
            <button class="modal-close" id="nf-close">✕</button>
          </div>
          <div class="modal-body">
            <p style="color:var(--text-muted);font-size:.8rem;margin-bottom:12px;">${formatMonthLabel(month)} — ${data.members.length} membre${data.members.length > 1 ? 's' : ''}</p>
            <div class="resil-list" id="nf-list">
              ${data.members.length === 0 ? '<p style="color:var(--text-muted);text-align:center;padding:16px 0;">Aucun non fréquentant ce mois</p>' : ''}
              ${data.members.map(m => `
                <div class="resil-member-row">
                  <span class="resil-member-name">👤 ${m.member_name}</span>
                  ${admin ? `<button class="resil-delete-btn" data-id="${m.id}" title="Retirer">✕</button>` : ''}
                </div>
              `).join('')}
            </div>
            ${admin ? `
            <div class="resil-add-row">
              <input type="text" id="nf-new-name" placeholder="Nom du membre non fréquentant" class="resil-input">
              <button class="btn-primary resil-add-btn" id="nf-add-btn">+ Ajouter</button>
            </div>` : ''}
          </div>
        </div>
      `;
    }

    overlay.innerHTML = renderContent();
    document.body.appendChild(overlay);

    function bindAll() {
      overlay.querySelector('#nf-close').addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

      if (admin) {
        overlay.querySelectorAll('.resil-delete-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            await api(`/months/${month}/non-frequentants/${btn.dataset.id}`, { method: 'DELETE' });
            data.members = data.members.filter(m => m.id != btn.dataset.id);
            overlay.innerHTML = renderContent();
            bindAll();
          });
        });
        const addBtn = overlay.querySelector('#nf-add-btn');
        const addInput = overlay.querySelector('#nf-new-name');
        if (addBtn && addInput) {
          const doAdd = async () => {
            const name = addInput.value.trim();
            if (!name) return;
            const result = await api(`/months/${month}/non-frequentants/${coachId}`, { method: 'POST', body: { member_name: name } });
            data.members.push({ id: result.id, member_name: result.member_name });
            overlay.innerHTML = renderContent();
            bindAll();
          };
          addBtn.addEventListener('click', doAdd);
          addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
        }
      }
    }
    bindAll();

  } catch (err) {
    alert('Erreur : ' + err.message);
  }
}

async function showNouveauxClientsMembers(month, coachId) {
  try {
    const data = await api(`/months/${month}/nouveaux-clients/${coachId}`);
    const coach = coaches.find(c => c.id === coachId);
    const coachName = coach ? coach.name : 'Coach';
    const admin = isAdmin();

    const existing = document.getElementById('nc-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'nc-overlay';
    overlay.className = 'modal-overlay';

    function renderContent() {
      return `
        <div class="modal-card">
          <div class="modal-header">
            <h3>Nouveaux clients — ${coachName}</h3>
            <button class="modal-close" id="nc-close">✕</button>
          </div>
          <div class="modal-body">
            <p style="color:var(--text-muted);font-size:.8rem;margin-bottom:12px;">${formatMonthLabel(month)} — ${data.members.length} nouveau${data.members.length > 1 ? 'x' : ''} client${data.members.length > 1 ? 's' : ''}</p>
            <div class="resil-list">
              ${data.members.length === 0 ? '<p style="color:var(--text-muted);text-align:center;padding:16px 0;">Aucun nouveau client ce mois</p>' : ''}
              ${data.members.map(m => `
                <div class="resil-member-row">
                  <span class="resil-member-name">👤 ${m.member_name}</span>
                  ${admin ? `<button class="resil-delete-btn" data-id="${m.id}" title="Retirer">✕</button>` : ''}
                </div>
              `).join('')}
            </div>
            ${admin ? `
            <div class="resil-add-row">
              <input type="text" id="nc-new-name" placeholder="Nom du nouveau client" class="resil-input">
              <button class="btn-primary resil-add-btn" id="nc-add-btn">+ Ajouter</button>
            </div>` : ''}
          </div>
        </div>
      `;
    }

    overlay.innerHTML = renderContent();
    document.body.appendChild(overlay);

    function bindAll() {
      overlay.querySelector('#nc-close').addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
      if (admin) {
        overlay.querySelectorAll('.resil-delete-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            await api(`/months/${month}/nouveaux-clients/${btn.dataset.id}`, { method: 'DELETE' });
            data.members = data.members.filter(m => m.id != btn.dataset.id);
            overlay.innerHTML = renderContent();
            bindAll();
          });
        });
        const addBtn = overlay.querySelector('#nc-add-btn');
        const addInput = overlay.querySelector('#nc-new-name');
        if (addBtn && addInput) {
          const doAdd = async () => {
            const name = addInput.value.trim();
            if (!name) return;
            const result = await api(`/months/${month}/nouveaux-clients/${coachId}`, { method: 'POST', body: { member_name: name } });
            data.members.push({ id: result.id, member_name: result.member_name });
            overlay.innerHTML = renderContent();
            bindAll();
          };
          addBtn.addEventListener('click', doAdd);
          addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
        }
      }
    }
    bindAll();
  } catch (err) { alert('Erreur : ' + err.message); }
}

async function archiveCoach(id) {
  if (!confirm('Archiver ce Coach ?')) return;
  try {
    await api(`/coaches/${id}`, { method: 'DELETE' });
    coaches = await api('/coaches');
    loadDashboard();
  } catch (err) { alert(err.message); }
}

// ─── RECAP TAB ──────────────────────────────────────────────
let recapMonth = '';

function initRecapTab() {
  const prev = document.getElementById('recap-prev-month');
  const next = document.getElementById('recap-next-month');
  const picker = document.getElementById('recap-month-picker');
  const pdfBtn = document.getElementById('btn-recap-pdf');

  // Directeur : flèches uniquement, pas de date-picker ni de PDF
  if (isDirector()) {
    if (picker) picker.style.display = 'none';
    if (pdfBtn) pdfBtn.style.display = 'none';
    if (prev) prev.addEventListener('click', () => { recapMonth = prevMonth(recapMonth); loadRecapTab(); });
    if (next) next.addEventListener('click', () => { recapMonth = nextMonth(recapMonth); loadRecapTab(); });
  } else if (!canSeeAllCoaches()) {
    // Coaches : bandeau mois masqué entièrement (mois intégré dans les titres de section)
    const recapNav = document.querySelector('#tab-recap .month-nav');
    if (recapNav) recapNav.style.display = 'none';
  } else {
    if (prev) prev.addEventListener('click', () => { recapMonth = prevMonth(recapMonth); loadRecapTab(); });
    if (next) next.addEventListener('click', () => { recapMonth = nextMonth(recapMonth); loadRecapTab(); });
    if (picker) picker.addEventListener('change', () => { if (picker.value) { recapMonth = picker.value; loadRecapTab(); } });
    // PDF uniquement pour l'admin (pas pour les coaches leaders)
    if (isAdmin()) {
      if (pdfBtn) pdfBtn.addEventListener('click', generateRecapPDF);
    } else {
      if (pdfBtn) pdfBtn.style.display = 'none';
    }
  }
}

async function loadRecapTab() {
  if (!recapMonth) recapMonth = currentMonth;
  const label = document.getElementById('recap-month-label');
  const picker = document.getElementById('recap-month-picker');
  if (label) label.textContent = formatMonthLabel(recapMonth);
  if (picker) picker.value = recapMonth;

  const container = document.getElementById('recap-container');
  if (!container) return;

  const coachId = isAdmin() ? null : getMyCoachId();

  try {
    // Get badges
    const badgesData = await api(`/months/${recapMonth}/badges`);

    if (coachId) {
      const data = await api(`/months/${recapMonth}/recap/${coachId}`);
      let studioHtml = '';
      let evalHtml = '';

      // Evaluation visible si le coach est leader (session frontend OU flag serveur)
      // Studios table supprimée pour les leaders (disponible uniquement pour le directeur)
      container.innerHTML = renderCoachRecap(data, badgesData, coachId) + evalHtml + studioHtml;
    } else {
      const dashData = await api(`/months/${recapMonth}/dashboard`);
      let studioHtml = '';
      try {
        const [studiosSummary, objData] = await Promise.all([
          api(`/months/${recapMonth}/studios-summary`),
          api(`/ca-objectifs/${recapMonth}`)
        ]);
        studioHtml = renderStudiosTable(studiosSummary, objData.objectifs);
      } catch (_) {}

      if (isDirector()) {
        container.innerHTML = '<div id="cockpit-container"><div class="loading-spinner"></div></div>' + renderAllRecap(dashData, badgesData, { hideChart: true });
        try {
          // Cockpit + Accompagnement = mois courant (cohérence : ce qu'on saisit en avril = référence avril)
          const [cockpitData, accompData] = await Promise.all([
            api(`/cockpit/${recapMonth}`),
            api(`/accompagnement/${recapMonth}`).catch(() => ({ leaders: [] })),
          ]);
          const cockpitEl = document.getElementById('cockpit-container');
          if (cockpitEl) cockpitEl.innerHTML = renderCockpitReseau(cockpitData, accompData);
        } catch(e) {
          const cockpitEl = document.getElementById('cockpit-container');
          if (cockpitEl) cockpitEl.innerHTML = '';
        }
      } else {
        container.innerHTML = renderAllRecap(dashData, badgesData, { hideChart: true }) + studioHtml;
      }
    }
  } catch (err) {
    console.error('Erreur récap:', err);
    container.innerHTML = '<p style="color:red;">Erreur de chargement</p>';
  }
}

function renderCoachRecap(data, badgesData, coachId) {
  const leader = data.is_leader;
  const prev = data.prev || {};

  // Helper : affiche la valeur M-1 avec flèche de comparaison
  function prevBadge(current, prevVal, unit = '', lowerIsBetter = false) {
    if (prevVal === null || prevVal === undefined || current === null || current === undefined) {
      return prevVal !== null && prevVal !== undefined
        ? `<span class="recap-prev">M-1 : ${prevVal}${unit}</span>`
        : '';
    }
    const diff = current - prevVal;
    if (diff === 0) return `<span class="recap-prev">M-1 : ${prevVal}${unit} <span class="recap-prev-neutral">→</span></span>`;
    const better = lowerIsBetter ? diff < 0 : diff > 0;
    const arrow = diff > 0 ? '↑' : '↓';
    const cls = better ? 'recap-prev-good' : 'recap-prev-bad';
    return `<span class="recap-prev">M-1 : ${prevVal}${unit} <span class="${cls}">${arrow}${Math.abs(diff)}${unit}</span></span>`;
  }

  // ── Super Indicateur ─────────────────────────────────────────
  // Leader → taux de résiliation < 7 %
  // Coach  → taux de non-fréquentants < 10 %
  let superIndicateurHtml;
  if (leader) {
    // Super indicateur LEADER : taux de résiliation (stocké directement en %)
    const resilPct      = data.taux_resiliation ?? null;  // déjà en %
    const SI_L_THRESHOLD = 7; // < 7 % = réussi
    const siReussi  = resilPct !== null && resilPct < SI_L_THRESHOLD;
    const siUnknown = resilPct === null;
    const siBarPct  = resilPct !== null ? Math.round(Math.min(resilPct, 20) / 20 * 100) : 0;
    const siColor   = siUnknown ? 'var(--text-muted)' : siReussi ? '#22c55e' : resilPct < 12 ? '#f59e0b' : '#ef4444';

    superIndicateurHtml = `
  <div class="super-indic-card ${siReussi ? 'si-ok' : siUnknown ? 'si-unknown' : 'si-ko'}">
    <div class="si-icon">${siReussi ? '⚡' : siUnknown ? '❓' : '⚠️'}</div>
    <div class="si-body">
      <div class="si-title">Super Indicateur — Taux de résiliation</div>
      <div class="si-value" style="color:${siColor}">
        ${resilPct !== null ? `<span class="si-rate">${resilPct}%</span>` : '—'}
      </div>
      <div class="si-bar-wrap">
        <div class="si-bar" style="--pct:${siBarPct}%;--color:${siColor}"></div>
        <span class="si-target">Objectif : &lt; ${SI_L_THRESHOLD}%</span>
      </div>
    </div>
    <div class="si-badge">${siReussi ? '✅ RÉUSSI' : siUnknown ? 'Données manquantes' : '❌ EN COURS'}</div>
  </div>`;
  } else {
    superIndicateurHtml = '';
  }

  return `
  <div class="recap-page" id="recap-pdf-content">

    ${leader ? `
    <div class="recap-section">
      <h3 class="recap-section-title">📈 Croissance</h3>
      <div class="recap-kpis">
        <div class="recap-kpi-card recap-kpi-ca-double">
          <span class="recap-kpi-label">CA du mois</span>
          <span class="recap-kpi-value">${data.chiffre_affaires !== null ? fmt(data.chiffre_affaires) + ' €' : '—'}</span>
          <span class="recap-kpi-ca-obj">Objectif : ${data.objectif_ca !== null ? fmt(data.objectif_ca) + ' €' : '—'}</span>
        </div>
        <div class="recap-kpi-card recap-kpi-clickable" onclick="showNouveauxClientsMembers('${data.month}', ${coachId})" title="Cliquer pour voir les clients">
          <span class="recap-kpi-label">Nouveaux clients</span>
          <span class="recap-kpi-value">${data.nouveaux_clients !== null ? data.nouveaux_clients : '0'}</span>
          ${prevBadge(data.nouveaux_clients, prev.nouveaux_clients, '')}
        </div>
      </div>
    </div>

    <div class="recap-section">
      <h3 class="recap-section-title">🏥 Santé du studio</h3>
      <div class="recap-kpis">
        <div class="recap-kpi-card recap-kpi-clickable" onclick="showResiliationMembers('${data.month}', ${coachId})" title="Cliquer pour voir les membres">
          <span class="recap-kpi-label">Résiliations</span>
          <span class="recap-kpi-value ${data.taux_resiliation ? (data.taux_resiliation >= 10 ? 'kpi-bad kpi-blink' : data.taux_resiliation >= 7 ? 'kpi-bad' : data.taux_resiliation >= 5 ? 'kpi-warn' : 'kpi-good') : ''}">${data.taux_resiliation !== null ? Math.round(data.taux_resiliation) + '%' : '—'}</span>
          ${prevBadge(data.taux_resiliation !== null ? Math.round(data.taux_resiliation) : null, prev.taux_resiliation !== null && prev.taux_resiliation !== undefined ? Math.round(prev.taux_resiliation) : prev.taux_resiliation, '%', true)}
        </div>
        <div class="recap-kpi-card recap-kpi-clickable" onclick="showNonFrequentantMembers('${data.month}', ${coachId})" title="Cliquer pour voir les membres">
          <span class="recap-kpi-label">Décrocheurs</span>
          <span class="recap-kpi-value ${data.taux_non_frequentants > 0 ? 'kpi-bad' : ''}">${data.taux_non_frequentants !== null ? data.taux_non_frequentants : '—'}</span>
          ${prevBadge(data.taux_non_frequentants, prev.taux_non_frequentants, '', true)}
        </div>
        <div class="recap-kpi-card recap-kpi-clickable" onclick="showNonFrequentantMembers('${data.month}', ${coachId})" title="Cliquer pour voir les membres">
          <span class="recap-kpi-label">Non fréquentants</span>
          <span class="recap-kpi-value">${data.taux_non_frequentants !== null ? data.taux_non_frequentants : '—'}</span>
          ${prevBadge(data.taux_non_frequentants, prev.taux_non_frequentants, '', true)}
        </div>
      </div>
    </div>` : `
    <div class="recap-section recap-section-solo">
      <h3 class="recap-section-title">📊 Mes indicateurs ${monthDe(data.month)}</h3>
      <div class="recap-kpis recap-kpis-solo">
        <div class="recap-kpi-card recap-kpi-clickable" onclick="showNonFrequentantMembers('${data.month}', ${coachId})" title="Cliquer pour voir les membres">
          <span class="recap-kpi-label">Non fréquentants</span>
          <span class="recap-kpi-value">${data.taux_non_frequentants !== null ? data.taux_non_frequentants : '—'}</span>
          ${prevBadge(data.taux_non_frequentants, prev.taux_non_frequentants, '', true)}
        </div>
      </div>
    </div>`}

    <div class="recap-section">
      <h3 class="recap-section-title">🏆 Palmarès ${monthDe(data.month)}</h3>
      <div class="recap-badges-grid">
        ${badgesData.badges.map(b => {
          const isMine = b.coach_id === coachId;
          return `<div class="recap-badge-card ${isMine ? 'is-mine' : ''}">
            <div class="recap-badge-icon">${b.icon}</div>
            <div class="recap-badge-label">${b.label}</div>
            <div class="recap-badge-desc">${b.desc || ''}</div>
            <div class="recap-badge-winner">${b.coach_name}</div>
            <div class="recap-badge-value">${b.value}</div>
          </div>`;
        }).join('')}
      </div>
    </div>

  </div>`;
}

function renderLeaderEvaluation(ev, month) {
  if (!ev) {
    return `
    <div class="recap-section eval-leader-section">
      <h3 class="recap-section-title">📋 Évaluation du Directeur — ${formatMonthLabel(month)}</h3>
      <p class="eval-empty">Aucune évaluation renseignée pour ce mois.</p>
    </div>`;
  }

  const ed = ev.eval_data || {};
  const { total, perCrit, max } = evalComputeScore(ed);
  const pct = max ? Math.round(total / max * 100) : 0;
  const scoreColor = pct >= 75 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';

  const criteriaHtml = EVAL_CRITERIA.map(c => {
    const d = ed[c.key] || {};
    const pts = perCrit[c.key] || 0;
    const superOk = !!d.super;
    const subItems = c.sub.map((label, i) => {
      const done = d.sub?.[i] || false;
      return `<div class="eval-sub-item ${done ? 'done' : 'todo'}">
        <span class="eval-sub-icon">${done ? '✅' : '☐'}</span>
        <span>${label}</span>
      </div>`;
    }).join('');

    return `
    <div class="eval-criterion-row">
      <div class="eval-criterion-head">
        <span class="eval-criterion-title">${c.icon} ${c.label}</span>
        <span class="eval-crit-pts" style="color:${pts >= 7 ? '#22c55e' : pts >= 4 ? '#f59e0b' : 'var(--text-muted)'}">${pts}/9</span>
      </div>
      <div class="eval-super-row ${superOk ? 'done' : 'todo'}">
        <span>${superOk ? '⭐' : '☐'}</span>
        <span class="eval-super-label">Super indicateur — ${c.superLabel}</span>
        <span class="eval-super-pts">${superOk ? '+5 pts' : '0/5'}</span>
      </div>
      <div class="eval-sub-list">${subItems}</div>
    </div>`;
  }).join('');

  return `
  <div class="recap-section eval-leader-section">
    <div class="eval-header-row">
      <h3 class="recap-section-title" style="margin:0">📋 Évaluation du Directeur — ${formatMonthLabel(month)}</h3>
      <div class="eval-total-badge" style="color:${scoreColor}">
        ${total}<span>/${max}</span>
        <div class="eval-total-sub">${pct}%</div>
      </div>
    </div>
    <div class="eval-criteria-list">${criteriaHtml}</div>
    ${ev.remarques?.trim() ? `
    <div class="eval-block" style="margin-top:14px;">
      <div class="eval-block-title">💬 Remarques</div>
      <p class="eval-block-content">${ev.remarques.trim().replace(/\n/g, '<br>')}</p>
    </div>` : ''}
    ${ev.updated_at ? `<p class="eval-updated-at">Mis à jour le ${new Date(ev.updated_at).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' })}</p>` : ''}
  </div>`;
}

function renderStudiosTable(studiosSummary, objectifs) {
  if (!studiosSummary || !studiosSummary.studios) return '';
  const obj = objectifs || {};
  const isComplete = s => s.chiffre_affaires !== null && s.taux_resiliation !== null && s.taux_occupation !== null;
  const studios = [...studiosSummary.studios].sort((a, b) => {
    const cA = isComplete(a), cB = isComplete(b);
    if (cA !== cB) return cA ? -1 : 1; // incomplete goes to bottom
    const pctA = a.taux_resiliation ?? 0;
    const pctB = b.taux_resiliation ?? 0;
    return pctA - pctB;
  });

  return `
  <div class="recap-section studios-table-section">
    <h3 class="recap-section-title">🏢 Vue d’ensemble des studios</h3>
    <div class="studios-table-wrap">
      <table class="studios-table sortable-table">
        <thead>
          <tr>
            <th onclick="sortTableByTh(this)">Studio</th>
            <th onclick="sortTableByTh(this)">CA réel</th>
            <th onclick="sortTableByTh(this)">Objectif</th>
            <th onclick="sortTableByTh(this)">Écart</th>
            <th onclick="sortTableByTh(this)">Résiliations</th>
            <th onclick="sortTableByTh(this)">Occupation</th>
          </tr>
        </thead>
        <tbody>
          ${studios.map(s => {
            const ca = s.chiffre_affaires;
            const target = obj[s.club] ?? null;
            let ecart = null;
            let ecartClass = '';
            if (ca !== null && target !== null && target > 0) {
              ecart = ((ca - target) / target * 100);
              ecartClass = ecart >= 0 ? 'kpi-good' : ecart >= -10 ? 'kpi-warn' : 'kpi-bad';
            }
            return `
          <tr>
            <td class="studios-td-name">${s.club}</td>
            <td class="studios-td-val">${ca !== null ? fmt(ca) + ' €' : '—'}</td>
            <td class="studios-td-val" style="color:#f59e0b;">${target !== null ? fmt(target) + ' €' : '—'}</td>
            <td class="studios-td-val ${ecartClass}">${ecart !== null ? (ecart >= 0 ? '+' : '') + fmt(ecart) + '%' : '—'}</td>
            ${(() => {
              const val = s.taux_resiliation;
              if (val === null || val === undefined) return `<td class="studios-td-val" style="color:var(--text-muted)">—</td>`;
              const cls = val >= 10 ? 'kpi-bad kpi-blink' : val >= 7 ? 'kpi-bad' : val >= 5 ? 'kpi-warn' : 'kpi-good';
              return `<td class="studios-td-val ${cls}">${fmt(val)}%</td>`;
            })()}
            <td class="studios-td-val">${s.taux_occupation !== null ? fmt(s.taux_occupation) + '%' : '—'}</td>
          </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

function renderCoachesGrid(dashData) {
  const allCoaches = dashData.coaches || [];

  const PRIORITY_CLUBS = ['Lille', 'Marcq', 'Wasquehal', 'Boulogne', 'Neuilly', 'Levallois'];
  const isPriority = c => PRIORITY_CLUBS.includes(c.studio);

  // is_leader : priorité à la valeur du dashboard, sinon lookup dans le tableau coaches global
  const isLeader = c => {
    if (c.is_leader !== undefined && c.is_leader !== null) return !!c.is_leader;
    const found = coaches.find(x => x.id === c.coach_id);
    return found ? !!found.is_leader : false;
  };

  // 4 groupes ordonnés
  const g1 = allCoaches.filter(c =>  isLeader(c) &&  isPriority(c));
  const g2 = allCoaches.filter(c => !isLeader(c) &&  isPriority(c));
  const g3 = allCoaches.filter(c =>  isLeader(c) && !isPriority(c));
  const g4 = allCoaches.filter(c => !isLeader(c) && !isPriority(c));

  function studioClass(studio) {
    return 'studio-' + (studio || '').toLowerCase().replace(/[^a-z]/g, '');
  }

  function renderCard(c, showLeaderBadge = false) {
    showLeaderBadge = showLeaderBadge || isLeader(c);
    const isInactive = c.active_days === 0;
    const stCls = studioClass(c.studio);
    const kpis = [
      ...DAILY_COUNTERS.map(a => ({ label: a.label, value: a.key === 'surpack' ? fmt(c.totals?.[a.key] || 0) + ' €' : (c.totals?.[a.key] || 0) })),
      { label: 'Résiliation', value: c.taux_resiliation !== null ? c.taux_resiliation + '%' : '—' },
      { label: 'Non fréq.', value: c.taux_non_frequentants !== null ? c.taux_non_frequentants + '%' : '—' },
    ];
    return `
    <div class="coach-card ${isInactive ? 'coach-inactive' : ''} ${showLeaderBadge ? 'coach-card-leader' : ''}">
      <div class="coach-card-header">
        <span class="coach-name">${c.coach_name}</span>
        <span class="studio-badge ${stCls}">${c.studio || '—'}</span>
      </div>
      ${showLeaderBadge ? '<div class="coach-leader-tag">★ Leader</div>' : ''}
      <div class="coach-kpi-list">
        ${kpis.map(k => `<div class="coach-kpi-row"><span class="coach-kpi-label">${k.label}</span><span class="coach-kpi-value">${k.value}</span></div>`).join('')}
      </div>
    </div>`;
  }

  function sep(label) {
    return `<div class="coaches-group-sep">${label}</div>`;
  }

  let html = '<div class="coaches-grid">';
  if (g1.length) {
    html += sep('★ Leaders — clubs prioritaires');
    g1.forEach(c => html += renderCard(c, true));
  }
  if (g2.length) {
    html += sep('Coachs sportifs — clubs prioritaires');
    g2.forEach(c => html += renderCard(c));
  }
  if (g3.length) {
    html += sep('Leaders — autres clubs');
    g3.forEach(c => html += renderCard(c, true));
  }
  if (g4.length) {
    html += sep('Coachs sportifs — autres clubs');
    g4.forEach(c => html += renderCard(c));
  }
  html += '</div>';
  return html;
}

function renderAllRecap(dashData, badgesData, { hideChart = false } = {}) {
  if (dashData.coaches.length === 0) {
    return '<div class="empty-state"><span class="empty-icon">📊</span><h3>Aucune donnée</h3><p>Aucun coach actif ce mois-ci.</p></div>';
  }

  let html = '';

  // CA evolution chart — masqué pour le Directeur
  if (!hideChart) {
    html += `<div class="recap-section">
      <div class="chart-studio-selector" id="chart-studio-selector">
        <button class="chart-studio-btn active" data-studio="">Tous les studios</button>
        ${CLUBS.map(c => `<button class="chart-studio-btn" data-studio="${c}">${c}</button>`).join('')}
      </div>
      <div class="recap-ca-chart-wrap" style="height:320px;"><canvas id="recap-ca-global-chart"></canvas></div>
    </div>`;
  }


  return html;
}

// ─── PALMARÈS TAB (Directeur + Admin) ───────────────────────
let palmaresMonth = '';
let palmaresInitialized = false;

function initPalmaresTab() {
  if (palmaresInitialized) return;
  palmaresInitialized = true;
  const prev   = document.getElementById('palmares-prev-month');
  const next   = document.getElementById('palmares-next-month');
  const picker = document.getElementById('palmares-month-picker');
  if (isDirector() && picker) picker.style.display = 'none';
  if (prev)   prev.addEventListener('click',   () => { palmaresMonth = prevMonth(palmaresMonth); loadPalmaresTab(); });
  if (next)   next.addEventListener('click',   () => { palmaresMonth = nextMonth(palmaresMonth); loadPalmaresTab(); });
  if (picker) picker.addEventListener('change', () => { if (picker.value) { palmaresMonth = picker.value; loadPalmaresTab(); } });
}

async function loadPalmaresTab() {
  initPalmaresTab();
  if (!palmaresMonth) palmaresMonth = currentMonth;
  const label  = document.getElementById('palmares-month-label');
  const picker = document.getElementById('palmares-month-picker');
  if (label)  label.textContent = formatMonthLabel(palmaresMonth);
  if (picker) picker.value = palmaresMonth;

  const container = document.getElementById('palmares-container');
  if (!container) return;
  container.innerHTML = '<div class="loading-spinner"></div>';

  try {
    const [badgesData, dashData] = await Promise.all([
      api(`/months/${palmaresMonth}/badges`),
      api(`/months/${palmaresMonth}/dashboard`),
    ]);

    let html = '';

    // ── Badges ──────────────────────────────────────────────
    html += `<div class="recap-badges">
      <h3>🏆 Palmarès — ${formatMonthLabel(palmaresMonth)}</h3>
      <div class="recap-badges-grid">
        ${badgesData.badges.map(b => `
          <div class="recap-badge-card">
            <div class="recap-badge-icon">${b.icon}</div>
            <div class="recap-badge-label">${b.label}</div>
            <div class="recap-badge-desc">${b.desc || ''}</div>
            <div class="recap-badge-winner">${b.coach_name}</div>
            <div class="recap-badge-value">${b.value}</div>
          </div>
        `).join('')}
        ${badgesData.badges.length === 0 ? '<p style="color:var(--text-muted);text-align:center;grid-column:1/-1;">Pas encore de badges ce mois-ci</p>' : ''}
      </div>
    </div>`;

    // ── Performances coachs ──────────────────────────────────
    html += '<div class="recap-section">';
    html += '<h3 class="recap-section-title">👥 Performances coachs</h3>';
    html += renderCoachesGrid(dashData);
    html += '</div>';

    container.innerHTML = html;
  } catch(e) {
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">⚠️</span><h3>Erreur</h3><p>${e.message}</p></div>`;
  }
}

function generateRecapPDF() {
  const content = document.getElementById('recap-pdf-content');
  if (!content) { alert('Affichez d\'abord un récap individuel'); return; }

  // Injecter la date de téléchargement
  const dateStr = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const stamp = document.createElement('div');
  stamp.id = 'pdf-download-stamp';
  stamp.style.cssText = 'text-align:right;font-size:11px;color:#94a3b8;padding:4px 0 12px;border-bottom:1px solid #e2e8f0;margin-bottom:12px;';
  stamp.textContent = `Téléchargé le ${dateStr}`;
  content.prepend(stamp);

  const opt = {
    margin: [10, 10, 10, 10],
    filename: `recap-coach-${recapMonth}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };
  html2pdf().set(opt).from(content).save().then(() => {
    stamp.remove();
  });
}

// ─── DATA TAB (Admin) ───────────────────────────────────────
let dataMonth = '';

const STUDIO_COLORS = {
  Wasquehal: '#3b82f6', Lille: '#10b981', Marcq: '#f59e0b',
  Boulogne: '#ef4444', Neuilly: '#8b5cf6', Levallois: '#ec4899',
};

// ─── Nouveaux — admin panel ──────────────────────────────────
function renderNvRows(section, entries) {
  const list = section.querySelector('.data-nv-list');
  if (!list) return;
  if (!entries.length) { list.innerHTML = '<p class="data-nv-empty">Aucun nouveau</p>'; return; }
  list.innerHTML = entries.map((e, i) => `
    <div class="data-nv-row${e.croix ? ' nv-has-croix' : ''}" data-idx="${i}">
      <span class="data-nv-name">${e.name}</span>
      <button class="data-nv-sa-btn ${e.sa ? 'nv-sa-on' : ''}" data-idx="${i}"
        title="${e.sa ? 'SA actif — cliquer pour désactiver' : 'Marquer SA'}">SA</button>
      <button class="data-nv-rib-btn ${e.rib ? 'nv-rib-on' : ''}" data-idx="${i}"
        title="${e.rib ? 'RIB demandé — cliquer pour désactiver' : 'Demander RIB'}">RIB</button>
      <button class="data-nv-photo-btn ${e.photo ? 'nv-photo-on' : ''}" data-idx="${i}"
        title="${e.photo ? 'Photo demandée — cliquer pour désactiver' : 'Demander photo'}">👤</button>
      <button class="data-nv-croix-btn ${e.croix ? 'nv-croix-on' : ''}" data-idx="${i}"
        title="${e.croix ? 'Croix rouge active — cliquer pour désactiver' : 'Croix rouge (alerte + message)'}">✚</button>
      <button class="data-nv-del" data-idx="${i}" title="Supprimer">×</button>
      ${e.croix ? `<input class="data-nv-croix-input" type="text" placeholder="Message pour le leader…"
        value="${(e.croix_text || '').replace(/"/g, '&quot;')}" data-idx="${i}">` : ''}
    </div>`).join('');
}

function saveNvEntries(club, entries) {
  return api(`/club-nouveaux/${encodeURIComponent(club)}`, {
    method: 'PUT', body: { entries }
  });
}

function initNouveauxSection(section) {
  const club = section.dataset.club;
  let entries = [];
  try { entries = JSON.parse(section.dataset.entries || '[]'); } catch(e) {}
  renderNvRows(section, entries);

  // Ajouter un nom via le champ texte
  const input = section.querySelector('.data-nv-input');
  const addBtn = section.querySelector('.data-nv-add-btn');
  const doAdd = async () => {
    const name = input?.value.trim();
    if (!name) return;
    if (!entries.find(e => e.name === name)) {
      entries.push({ name, sa: false, rib: false, photo: false, croix: false, croix_text: '', leader_ok: false, leader_croix_ok: false });
      input.value = '';
      renderNvRows(section, entries);
      bindNvRows(section, club, entries);
      await saveNvEntries(club, entries);
    }
  };
  addBtn?.addEventListener('click', doAdd);
  input?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });

  bindNvRows(section, club, entries);
}

function bindNvRows(section, club, entries) {
  const list = section.querySelector('.data-nv-list');
  if (!list) return;
  // Bouton SA
  list.querySelectorAll('.data-nv-sa-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.idx);
      entries[idx].sa = !entries[idx].sa;
      renderNvRows(section, entries);
      bindNvRows(section, club, entries);
      await saveNvEntries(club, entries);
    });
  });
  // Bouton RIB
  list.querySelectorAll('.data-nv-rib-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.idx);
      entries[idx].rib = !entries[idx].rib;
      renderNvRows(section, entries);
      bindNvRows(section, club, entries);
      await saveNvEntries(club, entries);
    });
  });
  // Bouton Photo
  list.querySelectorAll('.data-nv-photo-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.idx);
      entries[idx].photo = !entries[idx].photo;
      renderNvRows(section, entries);
      bindNvRows(section, club, entries);
      await saveNvEntries(club, entries);
    });
  });
  // Bouton Croix rouge ✚
  list.querySelectorAll('.data-nv-croix-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.idx);
      entries[idx].croix = !entries[idx].croix;
      if (!entries[idx].croix) entries[idx].croix_text = '';
      renderNvRows(section, entries);
      bindNvRows(section, club, entries);
      await saveNvEntries(club, entries);
    });
  });
  // Champ texte message croix rouge (sauvegarde au blur)
  list.querySelectorAll('.data-nv-croix-input').forEach(inp => {
    inp.addEventListener('blur', async () => {
      const idx = parseInt(inp.dataset.idx);
      entries[idx].croix_text = inp.value.trim();
      await saveNvEntries(club, entries);
    });
  });
  // Supprimer
  list.querySelectorAll('.data-nv-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.idx);
      entries.splice(idx, 1);
      renderNvRows(section, entries);
      bindNvRows(section, club, entries);
      await saveNvEntries(club, entries);
    });
  });
}

async function loadDataTab() {
  if (!dataMonth) dataMonth = currentMonth;
  const container = document.getElementById('data-container');
  if (!container) return;

  container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted)">Chargement…</div>`;

  try {
    const data = await api(`/data-tab/${dataMonth}`);
    renderDataTab(data);
  } catch(e) {
    container.innerHTML = `<p style="color:red;padding:20px;">Erreur : ${e.message}</p>`;
  }
}

function renderDataTab(data) {
  const container = document.getElementById('data-container');
  if (!container) return;
  const studios = data.studios || [];

  const monthLabel = formatMonthLabel(dataMonth);

  let html = `
  <div class="data-tab-wrap">
    <div class="data-tab-header">
      <div class="data-month-nav">
        <button class="data-nav-btn" id="data-prev-month">←</button>
        <span class="data-month-label">${monthLabel}</span>
        <button class="data-nav-btn" id="data-next-month">→</button>
      </div>
      <button class="btn-primary" id="data-save-all" style="font-size:.82rem;padding:8px 20px;">💾 Enregistrer tout</button>
    </div>
    <div class="data-studios-grid">
  `;

  studios.forEach(s => {
    const color = STUDIO_COLORS[s.club] || '#64748b';
    const v = (val) => val !== null && val !== undefined ? val : '';

    html += `
    <div class="data-studio-card" data-club="${s.club}">
      <div class="data-studio-header" style="border-left:4px solid ${color}">
        <span class="data-studio-name">${s.club}</span>
      </div>
      <div class="data-fields-grid">
        <div class="data-field">
          <label>Résiliations</label>
          <input type="number" class="data-input" data-field="taux_resiliation" value="${v(s.taux_resiliation)}" min="0" step="1" placeholder="—">
        </div>
        <div class="data-field">
          <label>Non fqt</label>
          <input type="number" class="data-input" data-field="taux_non_frequentants" value="${v(s.taux_non_frequentants)}" min="0" step="1" placeholder="—">
        </div>
        <div class="data-field">
          <label>Nv clients</label>
          <input type="number" class="data-input" data-field="nouveaux_clients" value="${v(s.nouveaux_clients)}" min="0" step="1" placeholder="—">
        </div>
        <div class="data-field">
          <label>Adhérents</label>
          <input type="number" class="data-input" data-field="nb_adherents" value="${v(s.nb_adherents)}" min="0" step="1" placeholder="—">
        </div>
        <div class="data-field">
          <label>CA</label>
          <input type="number" class="data-input" data-field="chiffre_affaires" value="${v(s.chiffre_affaires)}" min="0" step="1" placeholder="—">
        </div>
        <div class="data-field data-field-objectif">
          <label>Obj CA</label>
          <input type="number" class="data-input data-input-objectif" data-field="objectif" value="${v(s.objectif)}" min="0" step="100" placeholder="—">
        </div>
        <div class="data-field">
          <label>Dépenses</label>
          <input type="number" class="data-input" data-field="depenses" value="${v(s.depenses)}" min="0" step="1" placeholder="—">
        </div>
        <div class="data-field data-field-objectif">
          <label>Obj dépenses</label>
          <input type="number" class="data-input data-input-objectif" data-field="objectif_min" value="${v(s.objectif_min)}" min="0" step="100" placeholder="—">
        </div>
        <div class="data-field">
          <label>Créneau libre</label>
          <input type="number" class="data-input" data-field="taux_occupation" value="${v(s.taux_occupation)}" min="0" step="1" placeholder="—">
        </div>
        <div class="data-field data-field-full data-nv-section" data-club="${s.club}" data-entries='${JSON.stringify((() => { try { const p = JSON.parse(s.les_sa||'[]'); return Array.isArray(p)?p:[]; } catch(e){ return (s.les_sa||'').split(',').map(n=>n.trim()).filter(Boolean).map(name=>({name,sa:false,leader_ok:false})); } })())}'>
          <label>Nouveaux</label>
          <div class="data-nv-add-row">
            <input class="data-nv-input" type="text" placeholder="Nom Prénom…" autocomplete="off">
            <button class="data-nv-add-btn">+ Ajouter</button>
          </div>
          <div class="data-nv-list"></div>
        </div>
      </div>
    </div>`;
  });

  html += `</div></div>`;
  container.innerHTML = html;

  // Bind month nav
  document.getElementById('data-prev-month')?.addEventListener('click', () => {
    dataMonth = prevMonth(dataMonth); loadDataTab();
  });
  document.getElementById('data-next-month')?.addEventListener('click', () => {
    dataMonth = nextMonth(dataMonth); loadDataTab();
  });

  // Bind save all
  document.getElementById('data-save-all')?.addEventListener('click', saveAllDataTab);

  // Init panneau Nouveaux pour chaque club
  document.querySelectorAll('.data-nv-section').forEach(section => initNouveauxSection(section));
}

async function saveAllDataTab() {
  const cards = document.querySelectorAll('.data-studio-card');
  const btn = document.getElementById('data-save-all');
  if (btn) { btn.disabled = true; btn.textContent = 'Sauvegarde…'; }

  const objectifsBody = {};
  const studioPromises = [];

  cards.forEach(card => {
    const club = card.dataset.club;
    const fields = {};
    const objEntry = {};
    card.querySelectorAll('.data-input').forEach(inp => {
      const f = inp.dataset.field;
      const v = inp.value.trim();
      if (f === 'objectif' || f === 'objectif_min') {
        if (v !== '') objEntry[f] = parseFloat(v);
      } else if (inp.classList.contains('data-input-text')) {
        fields[f] = v; // champ texte : toujours inclus (même vide pour effacer)
      } else {
        if (v !== '') fields[f] = parseFloat(v);
      }
    });
    if (Object.keys(objEntry).length > 0) objectifsBody[club] = objEntry;
    if (Object.keys(fields).length > 0) {
      studioPromises.push(
        api(`/director/studio-data/${dataMonth}`, { method: 'PUT', body: { club, ...fields } })
      );
    }
  });

  // Save objectifs if any
  if (Object.keys(objectifsBody).length > 0) {
    studioPromises.push(api(`/ca-objectifs/${dataMonth}`, { method: 'PUT', body: objectifsBody }));
  }

  try {
    await Promise.all(studioPromises);
    if (btn) { btn.disabled = false; btn.textContent = '✅ Enregistré'; setTimeout(() => { if (btn) btn.textContent = '💾 Enregistrer tout'; }, 2000); }
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Enregistrer tout'; }
    alert('Erreur lors de la sauvegarde : ' + e.message);
  }
}

// ─── CONTROL TAB (Admin) ────────────────────────────────────
let ctrlMonth = '';

function initControlTab() {
  const select = document.getElementById('ctrl-club-select');
  const prev = document.getElementById('ctrl-prev-month');
  const next = document.getElementById('ctrl-next-month');

  if (select) {
    // Populate clubs
    CLUBS.forEach(club => {
      const opt = document.createElement('option');
      opt.value = club;
      opt.textContent = club;
      select.appendChild(opt);
    });
    select.addEventListener('change', () => loadControlTab());
  }
  if (prev) prev.addEventListener('click', () => { ctrlMonth = prevMonth(ctrlMonth); loadControlTab(); });
  if (next) next.addEventListener('click', () => { ctrlMonth = nextMonth(ctrlMonth); loadControlTab(); });
}

async function renderCtrlOverview(month) {
  const container = document.getElementById('ctrl-container');
  if (!container) return;
  try {
    const [summary, objData] = await Promise.all([
      api(`/months/${month}/studios-summary`),
      api(`/ca-objectifs/${month}`)
    ]);
    const studios = summary.studios || [];
    const objectifs = objData.objectifs || {};
    const studioColors = {
      'Marcq': 'var(--studio-marcq)',
      'Wasquehal': 'var(--studio-wasquehal)',
      'Lille': 'var(--studio-lille)',
      'Boulogne': 'var(--studio-boulogne)',
      'Neuilly': 'var(--studio-neuilly)',
      'Levallois': 'var(--studio-levallois)',
    };

    let html = '<div class="ctrl-overview-grid">';
    studios.forEach(s => {
      const ca = s.chiffre_affaires;
      const obj = objectifs[s.club] ?? null;
      const pct = ca !== null && obj ? Math.min(Math.round(ca / obj * 100), 100) : null;
      const color = studioColors[s.club] || 'var(--primary)';
      html += `
      <div class="ctrl-studio-card" onclick="selectCtrlClub('${s.club}')">
        <h3><span class="studio-dot" style="background:${color}"></span>${s.club}</h3>
        <div class="ctrl-ca-bar">
          <span>${ca !== null ? ca.toLocaleString('fr-FR') + ' €' : '—'}${obj ? ' / ' + obj.toLocaleString('fr-FR') + ' €' : ''}</span>
          ${pct !== null ? `<div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${pct>=100?'#22c55e':pct>=80?'#f59e0b':'#ef4444'};border-radius:3px"></div></div>` : ''}
        </div>
        <div class="ctrl-mini-metrics">
          <span>${s.nb_adherents ?? '—'} adhérents</span>
          <span>${s.taux_occupation !== null ? s.taux_occupation + '% occup.' : ''}</span>
        </div>
      </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
  } catch(e) {
    container.innerHTML = '<p style="color:red">Erreur de chargement de l\'aperçu</p>';
  }
}

window.selectCtrlClub = function(club) {
  const select = document.getElementById('ctrl-club-select');
  if (select) {
    select.value = club;
    loadControlTab();
  }
};

async function openObjectifsModal(month) {
  const objData = await api(`/ca-objectifs/${month}`);
  const objectifs = objData.objectifs || {};
  const clubs = CLUBS;
  const studioColors = {
    Wasquehal: '#3b82f6', Lille: '#10b981', Marcq: '#f59e0b',
    Boulogne: '#ef4444', Neuilly: '#8b5cf6', Levallois: '#ec4899',
    'Paris 15': '#f43f5e', 'Veigné': '#84cc16', Tours: '#0ea5e9',
    Nice: '#fb923c', Valence: '#a16207', Caen: '#64748b'
  };

  const existing = document.getElementById('objectifs-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'objectifs-modal';
  modal.innerHTML = `
    <div class="modal-box">
      <h3>⚙️ Objectifs CA — ${formatMonthLabel(month)}</h3>
      <div class="objectifs-form">
        ${clubs.map(club => `
          <div class="objectif-row">
            <label><span class="studio-dot" style="background:${studioColors[club]||'#888'}"></span>${club}</label>
            <input type="number" id="obj-${club}" class="val-input" value="${objectifs[club] ?? ''}" placeholder="Objectif €" step="100">
          </div>
        `).join('')}
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="document.getElementById('objectifs-modal').remove()">Annuler</button>
        <button class="btn-primary" onclick="saveObjectifs('${month}')">Enregistrer</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

window.saveObjectifs = async function(month) {
  const clubs = CLUBS;
  const body = {};
  clubs.forEach(club => {
    const val = document.getElementById(`obj-${club}`)?.value;
    if (val !== '') body[club] = parseFloat(val);
  });
  try {
    await api(`/ca-objectifs/${month}`, { method: 'PUT', body });
    document.getElementById('objectifs-modal')?.remove();
    loadControlTab();
  } catch(e) { alert(e.message); }
};

function ctrlAutoContrib() {
  const ca  = parseFloat(document.getElementById('ctrl-club-ca')?.value);
  const dep = parseFloat(document.getElementById('ctrl-club-depenses')?.value);
  const contribEl = document.getElementById('ctrl-club-contribution');
  if (contribEl && !isNaN(ca) && !isNaN(dep) && ca > 0) {
    const caHT = ca / 1.2;
    contribEl.value = ((caHT - dep) / caHT * 100).toFixed(1);
  }
}

async function loadControlTab() {
  if (!ctrlMonth) ctrlMonth = currentMonth;
  const label = document.getElementById('ctrl-month-label');
  const select = document.getElementById('ctrl-club-select');
  if (label) label.textContent = formatMonthLabel(ctrlMonth);

  // Afficher le bouton Objectifs pour admin
  const btnObj = document.getElementById('btn-objectifs');
  if (btnObj) {
    if (isAdmin()) {
      btnObj.style.display = '';
      if (!btnObj._objBound) {
        btnObj._objBound = true;
        btnObj.addEventListener('click', () => openObjectifsModal(ctrlMonth));
      }
    } else {
      btnObj.style.display = 'none';
    }
  }

  const container = document.getElementById('ctrl-container');
  if (!container) return;

  const selectedClubCtrl = select ? select.value : '';
  if (!selectedClubCtrl) {
    await renderCtrlOverview(ctrlMonth);
    return;
  }

  const clubCoaches = coaches.filter(c => !c.archived && c.role === 'coach' && c.studio === selectedClubCtrl);

  if (clubCoaches.length === 0) {
    container.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:40px 0;">Aucun coach dans le club ${selectedClubCtrl}</p>`;
    return;
  }

  // Use leader as reference coach for club-level data, fallback to first coach
  const leader = clubCoaches.find(c => c.is_leader) || clubCoaches[0];
  const refId = leader.id;

  try {
    const md = await api(`/months/${ctrlMonth}/data/${refId}`);

    // Team list
    const leaderCoach = clubCoaches.find(c => c.is_leader);
    const otherCoaches = clubCoaches.filter(c => !c.is_leader);

    let html = `
    <div class="ctrl-club-title">📍 ${selectedClubCtrl}</div>

    <div class="ctrl-coach-block">
      <div class="ctrl-coach-block-header">
        <span class="ctrl-coach-block-name">👥 Équipe</span>
      </div>
      <div class="ctrl-team-list">
        ${leaderCoach ? `<div class="ctrl-team-member"><span class="badge-leader">Leader</span> ${leaderCoach.name}</div>` : ''}
        ${otherCoaches.map(c => `<div class="ctrl-team-member">🏋️ ${c.name}</div>`).join('')}
      </div>
    </div>

    <div class="ctrl-coach-block">
      <div class="ctrl-coach-block-header">
        <span class="ctrl-coach-block-name">📊 Résultats du club</span>
      </div>
      <div class="ctrl-admin-fields">
        <div class="ctrl-field">
          <label>Résiliations</label>
          <div class="ctrl-input-row">
            <span class="ctrl-resil-count">${md.taux_resiliation !== null ? Math.round(md.taux_resiliation) : 0}</span>
            <button type="button" class="btn-primary" style="padding:6px 14px;font-size:.75rem;" onclick="showResiliationMembers('${ctrlMonth}', ${refId})">Voir / Gérer</button>
          </div>
        </div>
        <div class="ctrl-field">
          <label>Non fréquentants</label>
          <div class="ctrl-input-row">
            <span class="ctrl-resil-count">${md.taux_non_frequentants !== null ? Math.round(md.taux_non_frequentants) : 0}</span>
            <button type="button" class="btn-primary" style="padding:6px 14px;font-size:.75rem;" onclick="showNonFrequentantMembers('${ctrlMonth}', ${refId})">Voir / Gérer</button>
          </div>
        </div>
        <div class="ctrl-field">
          <label>Nouveaux clients</label>
          <div class="ctrl-input-row">
            <span class="ctrl-resil-count">${md.nouveaux_clients !== null ? md.nouveaux_clients : 0}</span>
            <button type="button" class="btn-primary" style="padding:6px 14px;font-size:.75rem;" onclick="showNouveauxClientsMembers('${ctrlMonth}', ${refId})">Voir / Gérer</button>
          </div>
        </div>
        <div class="ctrl-field">
          <label>Adhérents</label>
          <input type="number" id="ctrl-club-nb-adherents" value="${md.nb_adherents !== null ? md.nb_adherents : ''}" step="1" min="0">
        </div>
        <div class="ctrl-field">
          <label>CA (€)</label>
          <div class="ctrl-input-row">
            <input type="number" id="ctrl-club-ca" value="${md.chiffre_affaires !== null ? md.chiffre_affaires : ''}" step="0.01" min="0" oninput="ctrlAutoContrib()">
            <span class="ctrl-unit">€</span>
          </div>
        </div>
        <div class="ctrl-field">
          <label>Dépenses (€)</label>
          <div class="ctrl-input-row">
            <input type="number" id="ctrl-club-depenses" value="${md.depenses !== null && md.depenses !== undefined ? md.depenses : ''}" step="0.01" min="0" oninput="ctrlAutoContrib()">
            <span class="ctrl-unit">€</span>
          </div>
        </div>
        <div class="ctrl-field">
          <label>Occupation (%)</label>
          <div class="ctrl-input-row">
            <input type="number" id="ctrl-club-occupation" value="${md.taux_occupation !== null ? md.taux_occupation : ''}" step="0.1" min="0">
            <span class="ctrl-unit">%</span>
          </div>
        </div>
        <div class="ctrl-field">
          <label>Contribution (%) <span style="font-size:.7rem;color:var(--text-muted);">auto-calculé</span></label>
          <div class="ctrl-input-row">
            <input type="number" id="ctrl-club-contribution" value="${md.taux_contribution !== null && md.taux_contribution !== undefined ? md.taux_contribution : ''}" step="0.1" min="0" max="100" placeholder="Auto si CA + Dépenses">
            <span class="ctrl-unit">%</span>
          </div>
        </div>
      </div>
      <div style="margin-top:12px;">
        <button class="btn-primary" id="ctrl-club-save" style="font-size:.8rem;padding:8px 20px;">Enregistrer</button>
      </div>
    </div>`;

    container.innerHTML = html;

    // Bind save
    document.getElementById('ctrl-club-save').addEventListener('click', async () => {
      const caVal  = document.getElementById('ctrl-club-ca').value;
      const depVal = document.getElementById('ctrl-club-depenses').value;
      const contribEl = document.getElementById('ctrl-club-contribution');
      const body = {
        nb_adherents:     document.getElementById('ctrl-club-nb-adherents').value !== '' ? parseInt(document.getElementById('ctrl-club-nb-adherents').value) : null,
        chiffre_affaires: caVal !== '' ? parseFloat(caVal) : null,
        depenses:         depVal !== '' ? parseFloat(depVal) : null,
        taux_occupation:  document.getElementById('ctrl-club-occupation').value !== '' ? parseFloat(document.getElementById('ctrl-club-occupation').value) : null,
        taux_contribution: contribEl?.value !== '' ? parseFloat(contribEl?.value) : null,
      };
      try {
        // Save to all coaches of the club so data is visible in their recap
        await Promise.all(clubCoaches.map(c => api(`/months/${ctrlMonth}/data/${c.id}`, { method: 'PUT', body })));
        const btn = document.getElementById('ctrl-club-save');
        btn.textContent = 'Enregistré !';
        btn.style.background = 'var(--success)';
        setTimeout(() => { btn.textContent = 'Enregistrer'; btn.style.background = ''; }, 2000);
      } catch (err) { alert(err.message); }
    });

  } catch (err) {
    console.error('Erreur contrôle:', err);
    container.innerHTML = '<p style="color:red;">Erreur de chargement</p>';
  }
}

async function runAIAnalysis(month, coachId) {
  const resultDiv = document.getElementById('ai-analysis-result');
  if (!resultDiv) return;
  resultDiv.innerHTML = '<p style="color:var(--text-muted);">Analyse en cours…</p>';

  try {
    const data = await api(`/months/${month}/recap/${coachId}`);
    const coach = coaches.find(c => c.id == coachId);

    const result = await api('/analyze-coach', {
      method: 'POST',
      body: {
        coach_name: coach?.name || data.coach_name,
        month,
        data
      }
    });

    resultDiv.innerHTML = `<div class="ai-analysis">${formatAnalysis(result.analysis)}</div>`;
  } catch (err) {
    resultDiv.innerHTML = `<p style="color:var(--danger);">${err.message}</p>`;
  }
}

// ─── STUDIOS TAB ────────────────────────────────────────────
let studiosMonth = null;

function initStudiosTab() {
  if (!studiosMonth) studiosMonth = currentMonth;
  const prev = document.getElementById('studios-prev-month');
  const next = document.getElementById('studios-next-month');
  const picker = document.getElementById('studios-month-picker');
  if (prev) prev.addEventListener('click', () => { studiosMonth = prevMonth(studiosMonth); loadStudiosTab(); });
  if (next) next.addEventListener('click', () => { studiosMonth = nextMonth(studiosMonth); loadStudiosTab(); });
  if (picker) picker.addEventListener('change', () => { if (picker.value) { studiosMonth = picker.value; loadStudiosTab(); } });
}

async function loadStudiosTab() {
  if (!studiosMonth) studiosMonth = currentMonth;
  const label = document.getElementById('studios-month-label');
  const picker = document.getElementById('studios-month-picker');
  if (label) label.textContent = formatMonthLabel(studiosMonth);
  if (picker) picker.value = studiosMonth;

  const container = document.getElementById('studios-container');
  if (!container) return;

  try {
    const studiosSummary = await api(`/months/${studiosMonth}/studios-summary`);
    container.innerHTML = renderStudiosTable(studiosSummary);
  } catch (err) {
    container.innerHTML = '<p style="color:red;">Erreur de chargement</p>';
  }
}

// ─── VUE D'ENSEMBLE TAB (Directeur) ─────────────────────────
let vueEnsembleMonth = null;
let vueEnsembleInitialized = false;

function initVueEnsembleTab() {
  if (vueEnsembleInitialized) return;
  vueEnsembleInitialized = true;
  if (!vueEnsembleMonth) vueEnsembleMonth = currentMonth;
  const prev   = document.getElementById('vue-ensemble-prev-month');
  const next   = document.getElementById('vue-ensemble-next-month');
  const picker = document.getElementById('vue-ensemble-month-picker');
  if (isDirector() && picker) picker.style.display = 'none';
  if (prev)   prev.addEventListener('click',   () => { vueEnsembleMonth = prevMonth(vueEnsembleMonth); loadVueEnsembleTab(); });
  if (next)   next.addEventListener('click',   () => { vueEnsembleMonth = nextMonth(vueEnsembleMonth); loadVueEnsembleTab(); });
  if (picker) picker.addEventListener('change', () => { if (picker.value) { vueEnsembleMonth = picker.value; loadVueEnsembleTab(); } });
}

async function loadVueEnsembleTab() {
  initVueEnsembleTab();
  if (!vueEnsembleMonth) vueEnsembleMonth = currentMonth;
  const label  = document.getElementById('vue-ensemble-month-label');
  const picker = document.getElementById('vue-ensemble-month-picker');
  if (label)  label.textContent = formatMonthLabel(vueEnsembleMonth);
  if (picker) picker.value = vueEnsembleMonth;

  const container = document.getElementById('vue-ensemble-container');
  if (!container) return;
  container.innerHTML = '<div class="loading-spinner"></div>';

  const DIRECTOR_CLUBS = ['Lille', 'Marcq', 'Wasquehal', 'Boulogne', 'Neuilly', 'Levallois'];
  const canEdit = isDirector() || isAdmin();

  try {
    const [studiosSummary, objData, cockpitData] = await Promise.all([
      api(`/months/${vueEnsembleMonth}/studios-summary`),
      api(`/ca-objectifs/${vueEnsembleMonth}`).catch(() => ({ objectifs: {} })),
      api(`/cockpit/${vueEnsembleMonth}`).catch(() => ({ studios: [] })),
    ]);

    const obj = objData.objectifs || {};
    const allStudios = (studiosSummary?.studios || []).filter(s => DIRECTOR_CLUBS.includes(s.club));

    // Trier : données complètes en premier, puis par résiliation
    const sorted = [...allStudios].sort((a, b) => {
      const cA = a.chiffre_affaires !== null && a.taux_resiliation !== null;
      const cB = b.chiffre_affaires !== null && b.taux_resiliation !== null;
      if (cA !== cB) return cA ? -1 : 1;
      return (a.taux_resiliation ?? 0) - (b.taux_resiliation ?? 0);
    });

    // Préparer les données pour le tri
    const rowData = sorted.map(s => {
      const club       = s.club;
      const isPriority = DIRECTOR_CLUBS.includes(club);
      const ckpi       = (cockpitData.studios || []).find(x => x.name === club) || {};
      const ca         = s.chiffre_affaires;
      const dep        = ckpi.depenses ?? null;
      const target     = obj[club] ?? null;
      let ecart = null, ecartClass = '';
      if (ca !== null && target !== null && target > 0) {
        ecart = ((ca - target) / target * 100);
        ecartClass = ecart >= 0 ? 'kpi-good' : ecart >= -10 ? 'kpi-warn' : 'kpi-bad';
      }
      const resilVal = s.taux_resiliation;
      const resilCls = resilVal === null ? '' : resilVal >= 10 ? 'kpi-bad kpi-blink' : resilVal >= 7 ? 'kpi-bad' : resilVal >= 5 ? 'kpi-warn' : 'kpi-good';
      return { club, isPriority, ca, dep, target, ecart, ecartClass, resilVal, resilCls, occup: s.taux_occupation };
    });

    function buildRows(data) {
      return data.map(s => {
        const { club, isPriority, ca, dep, target, ecart, ecartClass, resilVal, resilCls, occup } = s;
        if (canEdit && isPriority) {
          return `
            <tr class="dr-saisie-row" data-club="${club}" data-target="${target !== null ? target : ''}">
              <td class="studios-td-name dr-row-priority" data-val="${club}">${club}</td>
              <td data-val="${ca !== null ? ca : -Infinity}"><input class="dr-saisie-input" type="number" placeholder="ex: 42000" data-field="ca"    value="${ca !== null ? ca : ''}"></td>
              <td data-val="${dep !== null ? dep : -Infinity}"><input class="dr-saisie-input" type="number" placeholder="ex: 18000" data-field="dep"   value="${dep !== null ? dep : ''}"></td>
              <td class="studios-td-val" style="color:#f59e0b;" data-val="${target !== null ? target : -Infinity}">${target !== null ? fmt(target) + ' €' : '—'}</td>
              <td class="studios-td-val dr-ecart-cell ${ecartClass}" data-val="${ecart !== null ? ecart : -Infinity}">${ecart !== null ? (ecart >= 0 ? '+' : '') + ecart.toFixed(1) + '%' : '—'}</td>
              <td data-val="${resilVal !== null ? resilVal : -Infinity}"><input class="dr-saisie-input dr-saisie-input-pct" type="number" min="0" max="100" step="0.1" placeholder="%" data-field="resil" value="${resilVal !== null ? resilVal : ''}"></td>
              <td data-val="${occup !== null ? occup : -Infinity}"><input class="dr-saisie-input dr-saisie-input-pct" type="number" min="0" max="100" step="0.1" placeholder="%" data-field="occup" value="${occup !== null ? occup : ''}"></td>
              <td><button class="dr-saisie-save" data-club="${club}">Enregistrer</button></td>
            </tr>`;
        } else {
          return `
            <tr>
              <td class="studios-td-name" data-val="${club}">${club}</td>
              <td class="studios-td-val" data-val="${ca !== null ? ca : -Infinity}">${ca !== null ? fmt(ca) + ' €' : '—'}</td>
              <td class="studios-td-val" style="color:var(--text-muted);" data-val="${dep !== null ? dep : -Infinity}">${dep !== null ? fmt(dep) + ' €' : '—'}</td>
              <td class="studios-td-val" style="color:#f59e0b;" data-val="${target !== null ? target : -Infinity}">${target !== null ? fmt(target) + ' €' : '—'}</td>
              <td class="studios-td-val ${ecartClass}" data-val="${ecart !== null ? ecart : -Infinity}">${ecart !== null ? (ecart >= 0 ? '+' : '') + ecart.toFixed(1) + '%' : '—'}</td>
              <td class="studios-td-val ${resilCls}" data-val="${resilVal !== null ? resilVal : -Infinity}">${resilVal !== null ? resilVal + '%' : '—'}</td>
              <td class="studios-td-val" data-val="${occup !== null ? occup : -Infinity}">${occup !== null ? occup + '%' : '—'}</td>
              ${canEdit ? '<td></td>' : ''}
            </tr>`;
        }
      }).join('');
    }

    const saveCol = canEdit ? '<th></th>' : '';
    container.innerHTML = `
      <div class="recap-section studios-table-section">
        <h3 class="recap-section-title">🏢 Vue d’ensemble des studios — ${formatMonthLabel(vueEnsembleMonth)}</h3>
        <div class="studios-table-wrap">
          <table class="studios-table" id="vue-ensemble-table">
            <thead>
              <tr>
                <th class="ve-sortable" data-col="0">Studio <span class="ve-sort-icon"></span></th>
                <th class="ve-sortable" data-col="1">CA <span class="ve-sort-icon"></span></th>
                <th class="ve-sortable" data-col="2">Dépenses <span class="ve-sort-icon"></span></th>
                <th class="ve-sortable" data-col="3">Objectif <span class="ve-sort-icon"></span></th>
                <th class="ve-sortable" data-col="4">Écart <span class="ve-sort-icon"></span></th>
                <th class="ve-sortable" data-col="5">Résiliations <span class="ve-sort-icon"></span></th>
                <th class="ve-sortable" data-col="6">Occupation <span class="ve-sort-icon"></span></th>
                ${saveCol}
              </tr>
            </thead>
            <tbody id="vue-ensemble-tbody">${buildRows(rowData)}</tbody>
          </table>
        </div>
      </div>`;

    // ── Tri des colonnes ──────────────────────────────────────
    let veSortCol = -1, veSortAsc = true;
    container.querySelectorAll('.ve-sortable').forEach(th => {
      th.addEventListener('click', () => {
        const col = parseInt(th.dataset.col);
        if (veSortCol === col) { veSortAsc = !veSortAsc; }
        else { veSortCol = col; veSortAsc = true; }

        // Mettre à jour les icônes
        container.querySelectorAll('.ve-sortable').forEach(h => {
          h.querySelector('.ve-sort-icon').textContent = '';
          h.classList.remove('ve-sort-active');
        });
        th.querySelector('.ve-sort-icon').textContent = veSortAsc ? ' ▲' : ' ▼';
        th.classList.add('ve-sort-active');

        // Trier les lignes selon data-val de la colonne
        const tbody = document.getElementById('vue-ensemble-tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));
        rows.sort((a, b) => {
          const aCell = a.querySelectorAll('td')[col];
          const bCell = b.querySelectorAll('td')[col];
          const aRaw = aCell?.dataset.val ?? '';
          const bRaw = bCell?.dataset.val ?? '';
          const aNum = parseFloat(aRaw);
          const bNum = parseFloat(bRaw);
          let cmp;
          if (!isNaN(aNum) && !isNaN(bNum)) { cmp = aNum - bNum; }
          else { cmp = aRaw.localeCompare(bRaw, 'fr'); }
          return veSortAsc ? cmp : -cmp;
        });
        rows.forEach(r => tbody.appendChild(r));
      });
    });

    // Bind save buttons
    container.querySelectorAll('.dr-saisie-row').forEach(row => {
      const club      = row.dataset.club;
      const targetVal = parseFloat(row.dataset.target) || null;
      const caInput   = row.querySelector('[data-field="ca"]');
      const depInput  = row.querySelector('[data-field="dep"]');
      const resilInput = row.querySelector('[data-field="resil"]');
      const occupInput = row.querySelector('[data-field="occup"]');
      const ecartCell = row.querySelector('.dr-ecart-cell');

      // Recalcul en temps réel de l'écart quand CA change
      caInput.addEventListener('input', () => {
        if (!ecartCell || !targetVal) return;
        const caVal = parseFloat(caInput.value);
        if (isNaN(caVal) || targetVal <= 0) { ecartCell.textContent = '—'; ecartCell.className = 'studios-td-val dr-ecart-cell'; return; }
        const e = (caVal - targetVal) / targetVal * 100;
        ecartCell.textContent = (e >= 0 ? '+' : '') + e.toFixed(1) + '%';
        ecartCell.className = 'studios-td-val dr-ecart-cell ' + (e >= 0 ? 'kpi-good' : e >= -10 ? 'kpi-warn' : 'kpi-bad');
      });

      row.querySelector('.dr-saisie-save').addEventListener('click', async () => {
        const btn   = row.querySelector('.dr-saisie-save');
        const ca    = parseFloat(caInput.value);
        const dep   = parseFloat(depInput.value);
        const resil = parseFloat(resilInput.value);
        const occup = parseFloat(occupInput.value);
        if (isNaN(ca) && isNaN(dep) && isNaN(resil) && isNaN(occup)) return;
        btn.disabled = true; btn.textContent = '…';
        try {
          await api(`/director/studio-data/${vueEnsembleMonth}`, {
            method: 'PUT',
            body: {
              club,
              chiffre_affaires:  isNaN(ca)    ? undefined : ca,
              depenses:          isNaN(dep)   ? undefined : dep,
              taux_resiliation:  isNaN(resil) ? undefined : resil,
              taux_occupation:   isNaN(occup) ? undefined : occup,
            },
          });
          btn.textContent = '✓ Enregistré'; btn.style.color = '#22c55e';
          setTimeout(() => { btn.textContent = 'Enregistrer'; btn.style.color = ''; btn.disabled = false; }, 2500);
        } catch(e) {
          const msg = e.message || 'Erreur';
          const isAuth = msg.includes('401') || msg.includes('403') || msg.includes('autorisé');
          btn.textContent = isAuth ? '⚠ Session expirée — reconnecte-toi' : '⚠ ' + msg;
          btn.style.color = '#ef4444';
          setTimeout(() => { btn.textContent = 'Enregistrer'; btn.style.color = ''; btn.disabled = false; }, 5000);
        }
      });
    });

  } catch (err) {
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">⚠️</span><h3>Erreur</h3><p>${err.message}</p></div>`;
  }
}

// ─── NOTES TAB (Admin) ──────────────────────────────────────
function initNotesTab() {
  const addBtn = document.getElementById('btn-add-note');
  if (addBtn && !addBtn._bound) {
    addBtn._bound = true;
    addBtn.addEventListener('click', () => openNoteEditor(null));
  }
}

async function loadNotes() {
  const list = document.getElementById('notes-list');
  if (!list) return;

  try {
    const notes = await api('/notes');
    if (notes.length === 0) {
      list.innerHTML = `<div class="empty-state">
        <span class="empty-icon">📝</span>
        <h3>Aucune remarque pour le moment</h3>
        <p>Ajoute des notes pour suivre tes observations sur l’équipe.</p>
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
            <button class="note-btn note-btn-edit" data-id="${n.id}" title="Modifier">Modifier</button>
            <button class="note-btn note-btn-delete" data-id="${n.id}" title="Supprimer">Supprimer</button>
          </div>
        </div>
      </div>`;
    }).join('');

    list.querySelectorAll('.note-btn-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const note = notes.find(n => n.id === parseInt(btn.dataset.id));
        if (note) openNoteEditor(note);
      });
    });
    list.querySelectorAll('.note-btn-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Supprimer cette remarque ?')) return;
        try { await api(`/notes/${btn.dataset.id}`, { method: 'DELETE' }); loadNotes(); } catch (e) { alert(e.message); }
      });
    });
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
  const old = document.getElementById('note-editor-overlay');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.id = 'note-editor-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal note-modal">
      <h2>${existingNote ? 'Modifier la remarque' : 'Nouvelle remarque'}</h2>
      <textarea id="note-editor-content" rows="8" placeholder="Écrire ta remarque…">${existingNote ? existingNote.content.replace(/</g, '&lt;').replace(/>/g, '&gt;') : ''}</textarea>
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

// ─── COMMUNITY TAB (Vocaux + Texte) ────────────────────────

let commMediaRecorder = null;
let commAudioChunks = [];
let commRecording = false;
let commRecordingCancelled = false;
let commRecordingTimer = null;
let commRecordingStart = 0;
let commPollingInterval = null;

let commActiveClubFilter = null; // null = not yet initialized, '' = all

function renderCommClubFilters() {
  const container = document.getElementById('comm-club-filters');
  if (!container) return;
  // Default to coach's own club on first load
  if (commActiveClubFilter === null) {
    commActiveClubFilter = getMyStudio() || '';
  }
  const DIRECTOR_CLUBS = ['Wasquehal', 'Lille', 'Marcq', 'Boulogne', 'Neuilly', 'Levallois'];
  const visibleClubs = (isAdmin() || isDirector()) ? CLUBS : DIRECTOR_CLUBS;
  container.innerHTML = `
    <button class="comm-club-filter ${!commActiveClubFilter ? 'active' : ''}" data-club="">Tous</button>
    ${visibleClubs.map(s => `<button class="comm-club-filter ${commActiveClubFilter === s ? 'active' : ''}" data-club="${s}">${s}</button>`).join('')}
  `;
  container.querySelectorAll('.comm-club-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      commActiveClubFilter = btn.dataset.club;
      container.querySelectorAll('.comm-club-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadCommunityMessages();
    });
  });
}

function initCommunityTab() {
  const sendBtn = document.getElementById('comm-send-text');
  const textInput = document.getElementById('comm-text');
  const recordBtn = document.getElementById('comm-record-btn');

  if (!sendBtn) return;

  sendBtn.addEventListener('click', () => sendCommunityText());
  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCommunityText(); }
  });

  recordBtn.addEventListener('click', () => {
    if (commRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  });

  const cancelBtn = document.getElementById('comm-rec-cancel');
  if (cancelBtn) cancelBtn.addEventListener('click', cancelRecording);

  renderCommClubFilters();
}

async function sendCommunityText() {
  const input = document.getElementById('comm-text');
  const text = input.value.trim();
  if (!text) return;

  try {
    const msg = await api('/community/messages', { method: 'POST', body: { type: 'text', content: text, target_club: getMyStudio() || null } });
    input.value = '';
    appendCommunityMessage(msg);
    scrollCommToBottom();
  } catch (err) { alert(err.message); }
}

let commStream = null;

async function startRecording() {
  try {
    commStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    commAudioChunks = [];

    let mimeType = '';
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4', ''];
    for (const mt of candidates) {
      if (!mt || MediaRecorder.isTypeSupported(mt)) { mimeType = mt; break; }
    }

    const options = mimeType ? { mimeType } : {};
    commMediaRecorder = new MediaRecorder(commStream, options);

    commMediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) commAudioChunks.push(e.data);
    };

    commMediaRecorder.onstop = async () => {
      if (commStream) { commStream.getTracks().forEach(t => t.stop()); commStream = null; }

      // Si annulé, on jette l'audio et on ne fait rien
      if (commRecordingCancelled) { commRecordingCancelled = false; return; }

      const actualMime = commMediaRecorder.mimeType || 'audio/webm';
      const blob = new Blob(commAudioChunks, { type: actualMime });
      const durationSec = (Date.now() - commRecordingStart) / 1000;

      if (durationSec < 0.5) return;

      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result;
        try {
          const msg = await api('/community/messages', {
            method: 'POST',
            body: { type: 'audio', audio_data: base64, audio_duration: Math.round(durationSec), target_club: getMyStudio() || null }
          });
          appendCommunityMessage(msg);
          scrollCommToBottom();

          // Vocal > 1 min → message automatique de honte
          if (durationSec > 60) {
            const shameMsg = await api('/community/messages', {
              method: 'POST',
              body: { type: 'text', content: 'désolé, ce vocal est trop long, promis juré craché, je le ferai plus', target_club: getMyStudio() || null }
            });
            appendCommunityMessage(shameMsg);
            scrollCommToBottom();
          }
        } catch (err) {
          alert('Erreur envoi vocal : ' + err.message);
        }
      };
      reader.readAsDataURL(blob);
    };

    commMediaRecorder.start(100);
    commRecording = true;
    commRecordingStart = Date.now();

    // Afficher la live bar, masquer l'input texte
    const textWrap = document.getElementById('comm-text-input-wrap');
    const recLive  = document.getElementById('comm-rec-live');
    const recordBtn = document.getElementById('comm-record-btn');
    if (textWrap) textWrap.classList.add('hidden');
    if (recLive)  recLive.classList.remove('hidden');
    if (recordBtn) recordBtn.classList.add('recording');

    const timerEl = document.getElementById('comm-recording-timer');
    if (timerEl) { timerEl.textContent = '0:00'; timerEl.classList.remove('over'); }
    commRecordingTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - commRecordingStart) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      if (timerEl) {
        timerEl.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
        if (elapsed >= 60) timerEl.classList.add('over');
      }
    }, 200);

  } catch (err) {
    alert('Impossible d\'accéder au microphone.');
    commRecording = false;
  }
}

function stopRecording() {
  commRecording = false;

  if (commMediaRecorder && commMediaRecorder.state === 'recording') {
    commMediaRecorder.stop();
  }

  if (commStream) {
    commStream.getTracks().forEach(t => t.stop());
    commStream = null;
  }

  if (commRecordingTimer) { clearInterval(commRecordingTimer); commRecordingTimer = null; }

  // Restaurer l'input texte, masquer la live bar
  const textWrap = document.getElementById('comm-text-input-wrap');
  const recLive  = document.getElementById('comm-rec-live');
  const recordBtn = document.getElementById('comm-record-btn');
  if (textWrap) textWrap.classList.remove('hidden');
  if (recLive)  recLive.classList.add('hidden');
  if (recordBtn) recordBtn.classList.remove('recording');
}

function cancelRecording() {
  if (!commRecording) return;
  commRecordingCancelled = true; // signale à onstop de jeter l'audio
  commRecording = false;

  if (commMediaRecorder && commMediaRecorder.state === 'recording') {
    commMediaRecorder.stop();
  }
  if (commStream) { commStream.getTracks().forEach(t => t.stop()); commStream = null; }
  if (commRecordingTimer) { clearInterval(commRecordingTimer); commRecordingTimer = null; }

  const textWrap = document.getElementById('comm-text-input-wrap');
  const recLive  = document.getElementById('comm-rec-live');
  const recordBtn = document.getElementById('comm-record-btn');
  if (textWrap) textWrap.classList.remove('hidden');
  if (recLive)  recLive.classList.add('hidden');
  if (recordBtn) recordBtn.classList.remove('recording');
}

async function loadCommunityMessages() {
  const container = document.getElementById('comm-messages');
  if (!container) return;

  try {
    const clubParam = commActiveClubFilter ? `&club=${encodeURIComponent(commActiveClubFilter)}` : '';
    const data = await api(`/community/messages?limit=100${clubParam}`);
    container.innerHTML = '';

    if (data.messages.length === 0) {
      container.innerHTML = `<div class="empty-state">
        <span class="empty-icon">💬</span>
        <h3>L’espace Team est calme</h3>
        <p>Sois le premier à partager un message ou un CR de journée !</p>
      </div>`;
    } else {
      data.messages.forEach(msg => appendCommunityMessage(msg, false));
    }
    scrollCommToBottom();

    if (commPollingInterval) clearInterval(commPollingInterval);
    commPollingInterval = setInterval(pollNewCommunityMessages, 5000);
  } catch (err) {
    container.innerHTML = '<p style="color:red;">Erreur de chargement</p>';
  }
}

let lastCommMessageId = 0;

async function pollNewCommunityMessages() {
  const activeTab = document.querySelector('.tab-content.active');
  if (!activeTab || activeTab.id !== 'tab-community') {
    if (commPollingInterval) { clearInterval(commPollingInterval); commPollingInterval = null; }
    return;
  }

  try {
    const clubParam = commActiveClubFilter ? `&club=${encodeURIComponent(commActiveClubFilter)}` : '';
    const data = await api(`/community/messages?limit=20${clubParam}`);
    if (data.messages.length > 0) {
      const newMsgs = data.messages.filter(m => m.id > lastCommMessageId);
      newMsgs.forEach(msg => appendCommunityMessage(msg));
      if (newMsgs.length > 0) scrollCommToBottom();
    }
  } catch (_) {}
}

function appendCommunityMessage(msg, checkDuplicate = true) {
  const container = document.getElementById('comm-messages');
  if (!container) return;

  const empty = container.querySelector('.comm-empty');
  if (empty) empty.remove();

  if (checkDuplicate && container.querySelector(`[data-msg-id="${msg.id}"]`)) return;

  if (msg.id > lastCommMessageId) lastCommMessageId = msg.id;

  const isMe = currentUser && currentUser.coach_id === msg.coach_id;
  const time = new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const initials = (msg.coach_name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  const avatarColors = [
    { bg: '#EEEDFE', color: '#3C3489' },
    { bg: '#EAF3DE', color: '#3B6D11' },
    { bg: '#FAEEDA', color: '#854F0B' },
    { bg: '#FCEBEB', color: '#A32D2D' },
    { bg: '#E8F4FD', color: '#1565C0' },
    { bg: '#F3E5F5', color: '#6A1B9A' },
  ];
  const ac = avatarColors[(msg.coach_id || 0) % avatarColors.length];

  const crTag = msg.is_cr ? '<span class="comm-msg-cr-tag">CR</span>' : '';
  const clubTag = msg.target_club ? `<span class="comm-msg-club-tag">📍 ${msg.target_club}</span>` : '';

  // Find leader for this club
  let leaderTag = '';
  if (msg.is_cr && msg.target_club) {
    const leader = coaches.find(c => c.is_leader && c.studio && c.studio.toLowerCase() === msg.target_club.toLowerCase());
    if (leader) {
      leaderTag = `<span class="comm-msg-leader-tag">→ ${leader.name}</span>`;
    }
  }

  let bodyHtml = '';
  if (msg.type === 'audio' && msg.audio_data) {
    const dur = msg.audio_duration ? `${Math.floor(msg.audio_duration / 60)}:${String(Math.round(msg.audio_duration % 60)).padStart(2, '0')}` : '';
    bodyHtml = `
      <div class="comm-audio-msg">
        <button class="comm-play-btn" onclick="togglePlayAudio(this, '${msg.id}')" data-playing="false">
          <svg class="comm-play-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          <svg class="comm-pause-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="display:none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        </button>
        <div class="comm-audio-wave" id="wave-${msg.id}">
          <div class="comm-audio-progress" id="progress-${msg.id}"></div>
        </div>
        <button class="comm-speed-btn" onclick="cyclePlaybackSpeed(this, '${msg.id}')" title="Vitesse de lecture">x1</button>
        <span class="comm-audio-dur">${dur}</span>
        <audio id="audio-${msg.id}" src="${msg.audio_data}" preload="metadata"></audio>
      </div>`;
  } else {
    bodyHtml = `<div class="comm-text-msg">${(msg.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`;
  }

  const deleteBtn = (isAdmin())
    ? `<button class="comm-delete-btn" onclick="deleteCommunityMsg(${msg.id})" title="Supprimer">✕</button>`
    : '';

  const canLike = !isAdmin() && !isAcademy() && currentUser?.coach_id;
  const likeCount = msg.likes_count || 0;
  const likedByMe = msg.liked_by_me || false;
  const likeBtn = canLike ? `
    <button class="comm-like-btn ${likedByMe ? 'liked' : ''}" data-msg-id="${msg.id}" title="J’aime">
      <span class="comm-like-heart">${likedByMe ? '❤️' : '🤍'}</span>
      <span class="comm-like-count">${likeCount > 0 ? likeCount : ''}</span>
    </button>` : (likeCount > 0 ? `<span class="comm-like-display">❤️ ${likeCount}</span>` : '');

  const div = document.createElement('div');
  div.className = `comm-msg ${isMe ? 'comm-msg-me' : 'comm-msg-other'}`;
  div.dataset.msgId = msg.id;
  div.innerHTML = `
    <div class="comm-msg-avatar" style="background:${ac.bg};color:${ac.color}">${initials}</div>
    <div class="comm-msg-body">
      <div class="comm-msg-header">
        <span class="comm-msg-name">${msg.coach_name || 'Admin'}</span>
        ${crTag}${clubTag}${leaderTag}
        <span class="comm-msg-time">${time}</span>
        ${deleteBtn}
      </div>
      ${bodyHtml}
      <div class="comm-msg-footer">${likeBtn}</div>
    </div>`;

  // Bind like button
  const likeBtnEl = div.querySelector('.comm-like-btn');
  if (likeBtnEl) {
    likeBtnEl.addEventListener('click', async () => {
      try {
        const res = await api(`/community/messages/${msg.id}/like`, { method: 'POST' });
        const heart = likeBtnEl.querySelector('.comm-like-heart');
        const count = likeBtnEl.querySelector('.comm-like-count');
        likeBtnEl.classList.toggle('liked', res.liked);
        if (heart) heart.textContent = res.liked ? '❤️' : '🤍';
        if (count) count.textContent = res.likes_count > 0 ? res.likes_count : '';
        // Pop animation
        likeBtnEl.classList.add('like-pop');
        setTimeout(() => likeBtnEl.classList.remove('like-pop'), 300);
      } catch (_) {}
    });
  }

  container.appendChild(div);
}

function scrollCommToBottom() {
  const container = document.getElementById('comm-messages');
  if (container) {
    requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
  }
}

function togglePlayAudio(btn, msgId) {
  const audio = document.getElementById(`audio-${msgId}`);
  if (!audio) return;

  const playIcon = btn.querySelector('.comm-play-icon');
  const pauseIcon = btn.querySelector('.comm-pause-icon');
  const progressBar = document.getElementById(`progress-${msgId}`);

  if (btn.dataset.playing === 'true') {
    audio.pause();
    btn.dataset.playing = 'false';
    if (playIcon) playIcon.style.display = '';
    if (pauseIcon) pauseIcon.style.display = 'none';
  } else {
    document.querySelectorAll('.comm-play-btn[data-playing="true"]').forEach(other => {
      if (other !== btn) togglePlayAudio(other, other.closest('.comm-msg')?.dataset.msgId);
    });

    audio.play();
    btn.dataset.playing = 'true';
    if (playIcon) playIcon.style.display = 'none';
    if (pauseIcon) pauseIcon.style.display = '';

    audio.ontimeupdate = () => {
      if (progressBar && audio.duration) {
        progressBar.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
      }
    };

    audio.onended = () => {
      btn.dataset.playing = 'false';
      if (playIcon) playIcon.style.display = '';
      if (pauseIcon) pauseIcon.style.display = 'none';
      if (progressBar) progressBar.style.width = '0%';

      // Auto-play next vocal message
      const currentMsg = btn.closest('.comm-msg');
      if (!currentMsg) return;
      let next = currentMsg.nextElementSibling;
      while (next) {
        const nextPlayBtn = next.querySelector('.comm-play-btn');
        if (nextPlayBtn) {
          const nextMsgId = next.dataset.msgId;
          if (nextMsgId) {
            togglePlayAudio(nextPlayBtn, nextMsgId);
            // Scroll to the next message
            next.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          return;
        }
        next = next.nextElementSibling;
      }
    };
  }
}

function cyclePlaybackSpeed(btn, msgId) {
  const audio = document.getElementById(`audio-${msgId}`);
  if (!audio) return;
  const speeds = [1, 1.5, 2];
  const labels = ['x1', 'x1.5', 'x2'];
  const currentIdx = speeds.indexOf(audio.playbackRate);
  const nextIdx = (currentIdx + 1) % speeds.length;
  audio.playbackRate = speeds[nextIdx];
  btn.textContent = labels[nextIdx];
}

async function deleteCommunityMsg(id) {
  if (!confirm('Supprimer ce message ?')) return;
  try {
    await api(`/community/messages/${id}`, { method: 'DELETE' });
    const el = document.querySelector(`[data-msg-id="${id}"]`);
    if (el) el.remove();
  } catch (err) { alert(err.message); }
}

// ─── VALIDATION ─────────────────────────────────────────────
let valInitialized = false;
let valSelectedCoachId = null;

const VAL_CATEGORIES = [
  { key: 'essentielles', label: '🎯 Essentielles', color: '#3b82f6' },
  { key: 'signature', label: '✨ Signature', color: '#f59e0b' },
  { key: 'expertise', label: '🧠 Expertise', color: '#a855f7' },
  { key: 'leadership', label: '👑 Leadership', color: '#ef4444' },
];

// Gamification constants
const BELTS = [
  { id: 'white', name: 'Ceinture Blanche', min: 0, color: '#e2e8f0', emoji: '🤍' },
  { id: 'yellow', name: 'Ceinture Jaune', min: 20, color: '#fbbf24', emoji: '💛' },
  { id: 'orange', name: 'Ceinture Orange', min: 40, color: '#f97316', emoji: '🧡' },
  { id: 'green', name: 'Ceinture Verte', min: 60, color: '#22c55e', emoji: '💚' },
  { id: 'blue', name: 'Ceinture Bleue', min: 80, color: '#3b82f6', emoji: '💙' },
  { id: 'black', name: 'Ceinture Noire', min: 100, color: '#1e293b', emoji: '🖤' },
];

function getBeltClient(pct) {
  return [...BELTS].reverse().find(b => pct >= b.min) || BELTS[0];
}

function getStars(bestPct) {
  if (bestPct >= 100) return '⭐⭐⭐';
  if (bestPct >= 90) return '⭐⭐';
  if (bestPct >= 80) return '⭐';
  return '';
}

const CATEGORY_BADGES = {
  essentielles: { name: 'Fondations', emoji: '🏗️' },
  signature: { name: 'Signature', emoji: '✍️' },
  expertise: { name: 'Expert', emoji: '🧠' },
  leadership: { name: 'Leadership', emoji: '👑' },
};


async function loadValidation() {
  const coachSelect = document.getElementById('val-admin-coach-select');
  const list = document.getElementById('val-list');
  if (!list) return;

  const admin = isFormationAdmin(); // true for both 'admin' and 'academy' roles
  const leader = isLeader();
  const canSeeAll = canSeeAllCoaches();
  if (coachSelect) coachSelect.classList.toggle('hidden', !canSeeAll);

  // Manage panel: admin + academy
  const manageBtn = document.getElementById('val-manage-btn');
  const managePanel = document.getElementById('val-manage-panel');
  const manageClose = document.getElementById('val-manage-close');
  if (manageBtn) manageBtn.classList.toggle('hidden', !admin);
  if (!admin) {
    if (managePanel) managePanel.classList.add('hidden');
    if (manageBtn) manageBtn.style.display = 'none';
  }

  // Admin + Academy + Coach Leader : sélecteur de coach
  if (canSeeAll && coachSelect) {
    const activeCoaches = coaches.filter(c => !c.archived);
    // Coach leader (non admin/academy) : only their studio
    const visibleCoaches = leader && !admin
      ? activeCoaches.filter(c => c.studio === (coaches.find(x => x.id === getMyCoachId())?.studio))
      : activeCoaches;
    coachSelect.innerHTML = `
      <label class="val-coach-label">Sélectionner un coach :</label>
      <div class="val-coach-chips">
        ${visibleCoaches.map(c => `<button class="val-coach-chip ${valSelectedCoachId === c.id ? 'active' : ''}" data-cid="${c.id}">${c.name}</button>`).join('')}
      </div>
    `;
    coachSelect.querySelectorAll('.val-coach-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        valSelectedCoachId = parseInt(btn.dataset.cid);
        coachSelect.querySelectorAll('.val-coach-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadStudioProgress();
        refreshValidationList();
      });
    });
  }

  if (admin && !valInitialized) {
    valInitialized = true;
    if (manageBtn) {
      manageBtn.addEventListener('click', () => managePanel.classList.toggle('hidden'));
    }
    if (manageClose) {
      manageClose.addEventListener('click', () => managePanel.classList.add('hidden'));
    }
    const addBtn = document.getElementById('val-add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', async () => {
        const nameInput = document.getElementById('val-formation-name');
        const catSelect = document.getElementById('val-formation-cat');
        const name = nameInput?.value.trim();
        const category = catSelect?.value || 'essentielles';
        if (!name) return alert('Nom du module requis');
        addBtn.disabled = true;
        try {
          await api('/formations', { method: 'POST', body: { name, category } });
          nameInput.value = '';
          managePanel.classList.add('hidden');
          await refreshValidationList();
        } catch (err) { alert(err.message); }
        finally { addBtn.disabled = false; }
      });
    }
  }

  // Coach simple : force sur ses propres validations uniquement
  // Admin / Academy / Leader : null = pas de sélection → vue équipe en premier
  if (!canSeeAll) {
    valSelectedCoachId = getMyCoachId();
  } else if (!valSelectedCoachId) {
    // Admin, Academy et Leader démarrent sans sélection (vue équipe en premier)
    valSelectedCoachId = null;
  }

  await loadPendingValidations();
  await loadStudioProgress();
  await refreshValidationList();
}


const VAL_CAT_LABELS = {
  essentielles: '🎯 Essentielles',
  signature: '✨ Signature',
  expertise: '🧠 Expertise',
  leadership: '👑 Leadership',
};

async function loadParcoursTab() {
  const container = document.getElementById('parcours-content');
  if (!container) return;
  container.innerHTML = '<div class="val-empty">Chargement…</div>';

  try {
    const data = await api('/formations/coaches-progress');
    let list = data.coaches || [];

    // Directeur : seulement les 6 clubs prioritaires
    if (isDirector()) {
      const DIRECTOR_CLUBS = ['Lille', 'Marcq', 'Wasquehal', 'Boulogne', 'Neuilly', 'Levallois'];
      list = list.filter(c => DIRECTOR_CLUBS.includes(c.studio));
    }

    if (list.length === 0) {
      container.innerHTML = '<div class="val-empty">Aucun coach actif.</div>';
      return;
    }

    // Group by belt id, following BELTS order (least → most graded)
    const byBelt = {};
    BELTS.forEach(b => { byBelt[b.id] = []; });

    list.forEach(c => {
      const belt = c.belt || BELTS[0];
      const beltId = belt.id || 'white';
      if (!byBelt[beltId]) byBelt[beltId] = [];
      byBelt[beltId].push(c);
    });

    const blocks = BELTS.map(beltDef => {
      const coaches = byBelt[beltDef.id] || [];
      if (coaches.length === 0) return '';

      // Sort coaches within group by pct descending
      coaches.sort((a, b) => b.pct - a.pct);

      const coachCards = coaches.map(c => {
        const belt = c.belt || BELTS[0];
        const pct = c.pct;
        return `
          <div class="parc-card parc-card-clickable" style="--belt-color:${belt.color}" onclick="openCoachFormations(${c.id})">
            <div class="parc-card-top">
              <span class="parc-name">${c.name}${c.is_leader ? ' 👑' : ''}</span>
              <span class="parc-studio-tag">${c.studio || '—'}</span>
            </div>
            <div class="parc-bar-track"><div class="parc-bar-fill" style="width:${pct}%"></div></div>
            <div class="parc-info">
              <span class="parc-count">${c.validated}/${c.total} validées</span>
              <span class="parc-pct">${pct}%</span>
            </div>
          </div>`;
      }).join('');

      return `
        <div class="parc-belt-block">
          <h3 class="parc-belt-title" style="--belt-color:${beltDef.color}">
            <span class="parc-belt-title-emoji">${beltDef.emoji}</span>
            ${beltDef.name}
            <span class="parc-belt-count">${coaches.length}</span>
          </h3>
          <div class="parc-grid">${coachCards}</div>
        </div>`;
    }).join('');

    container.innerHTML = blocks || '<div class="val-empty">Aucun coach actif.</div>';
  } catch (err) {
    container.innerHTML = '<div class="val-empty" style="color:red;">Erreur de chargement</div>';
  }
}

// ─── PARCOURS : détail coach (modale) ───────────────────────
async function openCoachFormations(coachId) {
  const modal = document.getElementById('parc-detail-modal');
  if (!modal) return;
  const admin = isFormationAdmin();
  const coach = coaches.find(c => c.id === coachId);
  if (!coach) return;

  // Show modal with spinner
  modal.classList.remove('hidden');
  modal.innerHTML = `
    <div class="prd-backdrop" onclick="if(event.target===this)closeParcDetail()">
      <div class="prd-panel">
        <div class="prd-header">
          <span class="prd-title">📋 ${coach.name} — ${coach.studio || ''}</span>
          <button class="prd-close" onclick="closeParcDetail()">✕</button>
        </div>
        <div class="prd-body" id="prd-body">
          <div class="loading-spinner" style="margin:40px auto;"></div>
        </div>
      </div>
    </div>`;

  try {
    const [data, quizCounts] = await Promise.all([
      api('/formations/validations/' + coachId),
      api('/quiz/counts'),
    ]);
    const qCounts = quizCounts.counts || {};
    const body = document.getElementById('prd-body');
    if (!body) return;

    if (!data.formations || data.formations.length === 0) {
      body.innerHTML = '<div class="val-empty">Aucune formation enregistrée.</div>';
      return;
    }

    const pct   = data.pct || 0;
    const belt  = data.belt || getBeltClient(pct);
    const total = data.total || data.formations.length;
    const validated = data.validated || data.formations.filter(f => f.status === 'validated').length;
    const pctColor  = belt.color || '#3b82f6';
    const nextBelt  = BELTS.find(b => b.min > pct);
    const nextBeltStr = nextBelt ? `encore ${nextBelt.min - pct}% pour ${nextBelt.emoji} ${nextBelt.name}` : 'Niveau maximum atteint !';
    const radius = 54, circ = 2 * Math.PI * radius;
    const offset = circ - (pct / 100) * circ;

    let html = `
      <div class="val-hero" style="margin-bottom:16px;">
        <div class="val-hero-ring">
          <svg width="120" height="120" viewBox="0 0 140 140">
            <circle cx="70" cy="70" r="${radius}" fill="none" stroke="rgba(0,0,0,.06)" stroke-width="10"/>
            <circle cx="70" cy="70" r="${radius}" fill="none" stroke="${pctColor}" stroke-width="10"
              stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
              transform="rotate(-90 70 70)"/>
          </svg>
          <div class="val-hero-pct"><span class="val-hero-number">${pct}</span><span class="val-hero-pct-sign">%</span></div>
        </div>
        <div class="val-hero-info">
          <h3 class="val-hero-name">${coach.name}</h3>
          <p class="val-hero-sub">${validated} sur ${total} formations validées</p>
          <div class="val-hero-belt"><span class="val-belt-emoji">${belt.emoji}</span><span class="val-belt-name">${belt.name}</span></div>
          <div class="val-belt-next">${nextBeltStr}</div>
        </div>
      </div>`;
    html += renderSkillTree(data.formations, qCounts, data.bestScores || {}, admin, coachId);
    body.innerHTML = html;
  } catch (err) {
    const body = document.getElementById('prd-body');
    if (body) body.innerHTML = '<p style="color:red;padding:16px;">Erreur de chargement</p>';
  }
}

function closeParcDetail() {
  const modal = document.getElementById('parc-detail-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.innerHTML = '';
  }
}


// ─── CALENDRIER ACADEMY ─────────────────────────────────────
const CAL_MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const CAL_DAYS_FR   = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];

let calVisualYear  = new Date().getFullYear();
let calVisualMonth = new Date().getMonth() + 1; // 1-12
let calCachedEvents = [];

function renderCalVisual() {
  const container = document.getElementById('cal-visual-section');
  if (!container) return;

  const year  = calVisualYear;
  const month = calVisualMonth;
  const today = new Date().toISOString().split('T')[0];

  // First day of month (day-of-week, Mon=0…Sun=6)
  const firstDow = (() => {
    const d = new Date(year, month - 1, 1).getDay();
    return d === 0 ? 6 : d - 1;
  })();
  const daysInMonth = new Date(year, month, 0).getDate();

  // Group events by day number for this month
  const byDay = {};
  calCachedEvents.forEach(ev => {
    const [y, m, d] = ev.event_date.split('-').map(Number);
    if (y === year && m === month) {
      if (!byDay[d]) byDay[d] = [];
      byDay[d].push(ev);
    }
  });

  // Day-of-week headers (Mon → Sun)
  const headers = ['L','M','M','J','V','S','D']
    .map(h => `<div class="cal-vis-dh">${h}</div>`).join('');

  // Empty leading cells
  let cells = '';
  for (let i = 0; i < firstDow; i++) {
    cells += '<div class="cal-vis-day cal-vis-empty"></div>';
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday  = dateStr === today;
    const evs      = byDay[d];
    const isPast   = dateStr < today;
    const title    = evs ? evs.map(e => e.title).join('\n') : '';

    cells += `
      <div class="cal-vis-day${isToday ? ' is-today' : ''}${evs ? ' has-event' : ''}${isPast ? ' is-past' : ''}"
           data-date="${dateStr}"${title ? ` title="${title}"` : ''}>
        <span class="cal-vis-dn">${d}</span>
        ${evs ? `<span class="cal-vis-dot" data-count="${Math.min(evs.length, 3)}"></span>` : ''}
      </div>`;
  }

  container.innerHTML = `
    <div class="cal-vis-card">
      <div class="cal-vis-nav">
        <button class="cal-vis-btn" id="cal-vis-prev" title="Mois précédent">‹</button>
        <span class="cal-vis-month-label">${CAL_MONTHS_FR[month - 1]} ${year}</span>
        <button class="cal-vis-btn" id="cal-vis-next" title="Mois suivant">›</button>
      </div>
      <div class="cal-vis-grid">
        ${headers}
        ${cells}
      </div>
    </div>`;

  // Nav
  document.getElementById('cal-vis-prev')?.addEventListener('click', () => {
    if (calVisualMonth === 1) { calVisualMonth = 12; calVisualYear--; }
    else calVisualMonth--;
    renderCalVisual();
  });
  document.getElementById('cal-vis-next')?.addEventListener('click', () => {
    if (calVisualMonth === 12) { calVisualMonth = 1; calVisualYear++; }
    else calVisualMonth++;
    renderCalVisual();
  });

  // Click on a day with events → scroll to it in the list
  container.querySelectorAll('.cal-vis-day.has-event').forEach(cell => {
    cell.addEventListener('click', () => {
      const date = cell.dataset.date;
      const target = document.querySelector(`[data-ev-date="${date}"]`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add('cal-event-highlight');
        setTimeout(() => target.classList.remove('cal-event-highlight'), 1800);
      }
    });
  });
}

function calFormatDate(dateStr) {
  // dateStr = "YYYY-MM-DD"
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${CAL_DAYS_FR[dt.getDay()]} ${d} ${CAL_MONTHS_FR[m - 1]} ${y}`;
}

function calMonthKey(dateStr) {
  const [y, m] = dateStr.split('-');
  return `${y}-${m}`;
}

function calMonthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return `${CAL_MONTHS_FR[m - 1]} ${y}`;
}

async function loadCalFocus() {
  const block = document.getElementById('cal-focus-block');
  if (!block) return;

  const now   = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthLabel = `${CAL_MONTHS_FR[now.getMonth()]} ${now.getFullYear()}`;
  const canEdit = isFormationAdmin();

  try {
    const data = await api(`/calendar/focus?month=${month}`);
    const content = data.content || '';

    if (canEdit) {
      block.innerHTML = `
        <div class="cal-focus-card">
          <div class="cal-focus-header">
            <span class="cal-focus-icon">🎯</span>
            <span class="cal-focus-title">Focus Academy — ${monthLabel}</span>
            <button class="cal-focus-edit-btn" id="cal-focus-edit-btn" title="Modifier">✏️</button>
          </div>
          <div id="cal-focus-view" class="cal-focus-content">${content ? content.replace(/\n/g, '<br>') : '<em class="cal-focus-empty">Aucun focus défini pour ce mois.</em>'}</div>
          <div id="cal-focus-edit" class="cal-focus-edit-zone hidden">
            <textarea id="cal-focus-textarea" class="cal-focus-textarea" rows="5" placeholder="Décris le focus de ce mois pour l’équipe…">${content}</textarea>
            <div class="cal-focus-actions">
              <button class="btn-primary cal-focus-save-btn" id="cal-focus-save">Enregistrer</button>
              <button class="btn-secondary cal-focus-cancel-btn" id="cal-focus-cancel">Annuler</button>
            </div>
          </div>
        </div>`;

      document.getElementById('cal-focus-edit-btn').addEventListener('click', () => {
        document.getElementById('cal-focus-view').classList.add('hidden');
        document.getElementById('cal-focus-edit').classList.remove('hidden');
        document.getElementById('cal-focus-textarea').focus();
      });
      document.getElementById('cal-focus-cancel').addEventListener('click', () => {
        document.getElementById('cal-focus-edit').classList.add('hidden');
        document.getElementById('cal-focus-view').classList.remove('hidden');
      });
      document.getElementById('cal-focus-save').addEventListener('click', async () => {
        const saveBtn = document.getElementById('cal-focus-save');
        const text = document.getElementById('cal-focus-textarea').value;
        saveBtn.disabled = true; saveBtn.textContent = '…';
        try {
          await api('/calendar/focus', { method: 'PUT', body: { month, content: text } });
          await loadCalFocus();
        } catch(e) { alert('Erreur lors de la sauvegarde'); }
        finally { saveBtn.disabled = false; saveBtn.textContent = 'Enregistrer'; }
      });

    } else {
      // Coach : lecture seule
      if (!content) { block.innerHTML = ''; return; }
      block.innerHTML = `
        <div class="cal-focus-card">
          <div class="cal-focus-header">
            <span class="cal-focus-icon">🎯</span>
            <span class="cal-focus-title">Focus Academy — ${monthLabel}</span>
          </div>
          <div class="cal-focus-content">${content.replace(/\n/g, '<br>')}</div>
        </div>`;
    }
  } catch(e) {
    block.innerHTML = '';
  }
}

async function loadCalendrierTab() {
  const listEl  = document.getElementById('cal-events-list');
  const formEl  = document.getElementById('cal-add-form');
  if (!listEl) return;

  // Afficher le formulaire si admin, academy, leader, directeur
  const canEditCal = isFormationAdmin() || isLeader() || isDirector();
  if (formEl) {
    if (canEditCal) {
      formEl.classList.remove('hidden');
      // Brancher le bouton (une seule fois)
      const submitBtn = document.getElementById('cal-submit-btn');
      if (submitBtn && !submitBtn.dataset.bound) {
        submitBtn.dataset.bound = '1';
        submitBtn.addEventListener('click', async () => {
          const title = document.getElementById('cal-input-title')?.value.trim();
          const date  = document.getElementById('cal-input-date')?.value;
          const studio = document.getElementById('cal-input-studio')?.value.trim();
          const notes  = document.getElementById('cal-input-notes')?.value.trim();
          if (!title || !date) { alert('Titre et date requis'); return; }
          submitBtn.disabled = true;
          try {
            await api('/calendar/events', { method: 'POST', body: { title, event_date: date, studio, notes } });
            document.getElementById('cal-input-title').value = '';
            document.getElementById('cal-input-date').value = '';
            document.getElementById('cal-input-studio').value = '';
            document.getElementById('cal-input-notes').value = '';
            await renderCalEvents();
          } catch(e) { alert('Erreur lors de l\'ajout'); }
          finally { submitBtn.disabled = false; }
        });
      }
    } else {
      formEl.classList.add('hidden');
    }
  }

  await Promise.all([renderCalEvents(), loadCalFocus()]);
}

async function renderCalEvents() {
  const listEl = document.getElementById('cal-events-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="cal-loading">Chargement…</div>';
  try {
    // Admin/Academy/Leader/Director: fetch all (past + future) for visual calendar accuracy
    // Coaches: future only
    const canManageCal = isFormationAdmin() || isLeader() || isDirector();
    const endpoint = canManageCal ? '/calendar/events/all' : '/calendar/events';
    const data = await api(endpoint);
    calCachedEvents = data.events || [];

    // Refresh the visual calendar with the full dataset
    renderCalVisual();

    // List shows only upcoming events
    const today = new Date().toISOString().split('T')[0];
    const DIRECTOR_CLUBS = ['Wasquehal', 'Lille', 'Marcq', 'Boulogne', 'Neuilly', 'Levallois'];
    let events = canManageCal
      ? calCachedEvents.filter(ev => ev.event_date >= today)
      : calCachedEvents;

    // Coachs sportifs : masquer les événements des clubs hors réseau
    if (!isAdmin() && !isDirector()) {
      events = events.filter(ev => !ev.studio || DIRECTOR_CLUBS.includes(ev.studio));
    }

    if (events.length === 0) {
      listEl.innerHTML = `
        <div class="cal-empty">
          <span class="cal-empty-icon">📅</span>
          <span>Aucun événement planifié pour le moment</span>
        </div>`;
      return;
    }

    // Grouper par mois
    const byMonth = {};
    events.forEach(ev => {
      const key = calMonthKey(ev.event_date);
      if (!byMonth[key]) byMonth[key] = [];
      byMonth[key].push(ev);
    });

    const canManage = isFormationAdmin() || isLeader() || isDirector();

    const html = Object.keys(byMonth).sort().map(key => {
      const rows = byMonth[key].map(ev => {
        const isPast = ev.event_date < today;
        const studioTag = ev.studio ? `<span class="cal-ev-studio">${ev.studio}</span>` : '';
        const notesSpan = ev.notes ? `<span class="cal-ev-notes">${ev.notes}</span>` : '';
        const managebtns = canManage ? `
          <div class="cal-ev-actions">
            <button class="cal-edit-btn" data-id="${ev.id}" title="Modifier">✏️</button>
            <button class="cal-del-btn"  data-id="${ev.id}" title="Supprimer">✕</button>
          </div>` : '';

        const editForm = canManage ? `
          <div class="cal-ev-edit hidden" data-id="${ev.id}">
            <div class="cal-ev-edit-row">
              <input type="text"  class="cal-ev-edit-title cal-input" value="${ev.title.replace(/"/g,'&quot;')}" placeholder="Titre *">
              <input type="date"  class="cal-ev-edit-date  cal-input cal-input-date" value="${ev.event_date}">
            </div>
            <div class="cal-ev-edit-row">
              <input type="text"  class="cal-ev-edit-studio cal-input" value="${ev.studio || ''}" placeholder="Studio">
              <input type="text"  class="cal-ev-edit-notes  cal-input" value="${ev.notes || ''}"  placeholder="Notes / lieu">
            </div>
            <div class="cal-ev-edit-actions">
              <button class="btn-primary  cal-ev-save-btn"   data-id="${ev.id}">Enregistrer</button>
              <button class="btn-secondary cal-ev-cancel-btn" data-id="${ev.id}">Annuler</button>
            </div>
          </div>` : '';

        return `
          <div class="cal-event${isPast ? ' cal-event-past' : ''}" data-id="${ev.id}" data-ev-date="${ev.event_date}">
            <div class="cal-ev-view">
              <div class="cal-ev-date">${calFormatDate(ev.event_date)}</div>
              <div class="cal-ev-body">
                <span class="cal-ev-title">${ev.title}</span>
                ${studioTag}
                ${notesSpan}
              </div>
              ${managebtns}
            </div>
            ${editForm}
          </div>`;
      }).join('');

      return `
        <div class="cal-month-group">
          <div class="cal-month-title">${calMonthLabel(key)}</div>
          ${rows}
        </div>`;
    }).join('');

    listEl.innerHTML = html;

    // ── Boutons édition ──
    listEl.querySelectorAll('.cal-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = listEl.querySelector(`.cal-event[data-id="${btn.dataset.id}"]`);
        card.querySelector('.cal-ev-view').classList.add('hidden');
        card.querySelector('.cal-ev-edit').classList.remove('hidden');
        card.querySelector('.cal-ev-edit-title').focus();
      });
    });

    listEl.querySelectorAll('.cal-ev-cancel-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = listEl.querySelector(`.cal-event[data-id="${btn.dataset.id}"]`);
        card.querySelector('.cal-ev-edit').classList.add('hidden');
        card.querySelector('.cal-ev-view').classList.remove('hidden');
      });
    });

    listEl.querySelectorAll('.cal-ev-save-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id   = btn.dataset.id;
        const card = listEl.querySelector(`.cal-event[data-id="${id}"]`);
        const form = card.querySelector('.cal-ev-edit');
        const title      = form.querySelector('.cal-ev-edit-title').value.trim();
        const event_date = form.querySelector('.cal-ev-edit-date').value;
        const studio     = form.querySelector('.cal-ev-edit-studio').value.trim();
        const notes      = form.querySelector('.cal-ev-edit-notes').value.trim();
        if (!title || !event_date) { alert('Titre et date requis'); return; }
        btn.disabled = true; btn.textContent = '…';
        try {
          await api(`/calendar/events/${id}`, { method: 'PATCH', body: { title, event_date, studio, notes } });
          await renderCalEvents();
        } catch(e) {
          alert('Erreur lors de la modification');
          btn.disabled = false; btn.textContent = 'Enregistrer';
        }
      });
    });

    // ── Boutons supprimer ──
    listEl.querySelectorAll('.cal-del-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Supprimer cet événement ?')) return;
        try {
          await api(`/calendar/events/${btn.dataset.id}`, { method: 'DELETE' });
          await renderCalEvents();
        } catch(e) { alert('Erreur lors de la suppression'); }
      });
    });

  } catch(err) {
    listEl.innerHTML = '<div class="cal-loading" style="color:red;">Erreur de chargement</div>';
  }
}

async function loadPendingValidations() {
  // QCM retiré : plus de file d'attente de validation par quiz.
  const panel = document.getElementById('val-pending-panel');
  if (panel) { panel.innerHTML = ''; panel.classList.add('hidden'); }
  return;
  // eslint-disable-next-line no-unreachable
  try {
    const data = await api('/formations/pending-validations');
    const items = data.pending || [];

    if (items.length === 0) {
      panel.innerHTML = `
        <div class="vpend-empty">
          <span class="vpend-empty-icon">✅</span>
          <span>Aucun QCM en attente de validation</span>
        </div>`;
      panel.classList.remove('hidden');
      return;
    }

    // Group by coach
    const byCoach = {};
    items.forEach(item => {
      const key = item.coach_id;
      if (!byCoach[key]) byCoach[key] = { name: item.coach_name, studio: item.studio, items: [] };
      byCoach[key].items.push(item);
    });

    const formatDate = (s) => {
      if (!s) return '';
      const d = new Date(s);
      return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    };

    const coachBlocks = Object.entries(byCoach).map(([cid, coach]) => {
      const rows = coach.items.map(item => `
        <div class="vpend-row" data-cid="${item.coach_id}" data-fid="${item.formation_id}">
          <div class="vpend-row-info">
            <span class="vpend-formation">${item.formation_name}</span>
            <span class="vpend-cat">${VAL_CAT_LABELS[item.category] || item.category}</span>
          </div>
          <div class="vpend-row-meta">
            <span class="vpend-score ${item.best_pct >= 80 ? 'vpend-score-good' : 'vpend-score-ok'}">
              ${item.best_pct}%
            </span>
            <span class="vpend-date">${formatDate(item.last_quiz_at)}</span>
          </div>
          <div class="vpend-row-actions">
            <button class="vpend-btn-validate" data-cid="${item.coach_id}" data-fid="${item.formation_id}" title="Valider">✓</button>
            <button class="vpend-btn-refuse" data-cid="${item.coach_id}" data-fid="${item.formation_id}" title="Refuser">✗</button>
          </div>
        </div>
      `).join('');

      return `
        <div class="vpend-coach-block">
          <div class="vpend-coach-header">
            <span class="vpend-coach-name">${coach.name}</span>
            <span class="vpend-coach-studio">${coach.studio || '—'}</span>
            <span class="vpend-count-badge">${coach.items.length}</span>
          </div>
          <div class="vpend-coach-rows">${rows}</div>
        </div>
      `;
    }).join('');

    panel.innerHTML = `
      <div class="vpend-section">
        <div class="vpend-header">
          <h3 class="vpend-title">⏳ QCM en attente de validation</h3>
          <span class="vpend-total-badge">${items.length}</span>
        </div>
        <div class="vpend-list">${coachBlocks}</div>
      </div>
    `;
    panel.classList.remove('hidden');

    // Bind validate / refuse buttons
    panel.querySelectorAll('.vpend-btn-validate').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        await setValidation(parseInt(btn.dataset.cid), parseInt(btn.dataset.fid), 'validated');
        await loadPendingValidations();
      });
    });
    panel.querySelectorAll('.vpend-btn-refuse').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Refuser cette validation ?')) return;
        btn.disabled = true;
        await setValidation(parseInt(btn.dataset.cid), parseInt(btn.dataset.fid), 'failed');
        await loadPendingValidations();
      });
    });

    // Click on a row to jump to that coach
    panel.querySelectorAll('.vpend-coach-header').forEach(header => {
      header.style.cursor = 'pointer';
      header.addEventListener('click', () => {
        const block = header.closest('.vpend-coach-block');
        const firstRow = block.querySelector('[data-cid]');
        if (!firstRow) return;
        valSelectedCoachId = parseInt(firstRow.dataset.cid);
        document.querySelectorAll('.val-coach-chip').forEach(b => {
          b.classList.toggle('active', parseInt(b.dataset.cid) === valSelectedCoachId);
        });
        refreshValidationList();
        document.getElementById('val-list')?.scrollIntoView({ behavior: 'smooth' });
      });
    });

  } catch (err) {
    panel.classList.add('hidden');
  }
}

async function loadStudioProgress() {
  const container = document.getElementById('val-studio-progress');
  if (!container) return;

  // Only for leaders and formation admins (admin + academy)
  if (!isLeader() && !isFormationAdmin()) { container.classList.add('hidden'); return; }

  // Déterminer le studio cible :
  // - Admin/Academy : studio du coach sélectionné (ou null si pas de sélection)
  // - Leader : toujours son propre studio (depuis coaches[] pour être sûr)
  let targetStudio;
  if (isFormationAdmin()) {
    targetStudio = coaches.find(c => c.id === valSelectedCoachId)?.studio || null;
  } else {
    // Leader : récupère le studio depuis coaches[] ou session
    targetStudio = coaches.find(c => c.id === getMyCoachId())?.studio || getMyStudio() || null;
  }

  if (!targetStudio) { container.classList.add('hidden'); return; }

  try {
    const data = await api(`/formations/studio-progress/${encodeURIComponent(targetStudio)}`);
    const list = data.coaches || [];

    if (list.length === 0) { container.classList.add('hidden'); return; }

    const sectionTitle = isLeader() && !isFormationAdmin()
      ? `👥 Mon équipe — ${targetStudio}`
      : `🏢 Suivi formations — ${targetStudio}`;

    const cards = list.map(c => {
      const belt = c.belt || { emoji: '🤍', name: 'Débutant', color: '#e2e8f0' };
      const isSelected = valSelectedCoachId === c.id;
      return `
        <div class="stprog-card ${isSelected ? 'active' : ''}" data-cid="${c.id}" style="--belt-color:${belt.color}">
          <div class="stprog-top">
            <span class="stprog-name">${c.name}${c.is_leader ? ' 👑' : ''}</span>
            <span class="stprog-belt">${belt.emoji}</span>
          </div>
          <div class="stprog-bar-track"><div class="stprog-bar-fill" style="width:${c.pct}%"></div></div>
          <div class="stprog-stats">${c.validated}/${c.total} <span class="stprog-pct">${c.pct}%</span></div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="stprog-section">
        <h3 class="stprog-title">${sectionTitle}</h3>
        <p class="stprog-hint">Clique sur un membre pour voir ses formations</p>
        <div class="stprog-grid">${cards}</div>
      </div>
    `;
    container.classList.remove('hidden');

    // Click a card → select that coach
    container.querySelectorAll('.stprog-card').forEach(card => {
      card.addEventListener('click', () => {
        valSelectedCoachId = parseInt(card.dataset.cid);
        // Sync chip selector
        document.querySelectorAll('.val-coach-chip').forEach(b => {
          b.classList.toggle('active', parseInt(b.dataset.cid) === valSelectedCoachId);
        });
        // Update active card
        container.querySelectorAll('.stprog-card').forEach(c2 => {
          c2.classList.toggle('active', parseInt(c2.dataset.cid) === valSelectedCoachId);
        });
        refreshValidationList();
      });
    });
  } catch (err) {
    container.classList.add('hidden');
  }
}

async function refreshValidationList() {
  const list = document.getElementById('val-list');
  if (!list) return;

  const coachId = valSelectedCoachId;
  const admin = isFormationAdmin(); // true for admin + academy

  if (!coachId) {
    if (isLeader() && !admin) {
      list.innerHTML = '<div class="val-empty">👆 Clique sur un membre de ton équipe pour voir ses formations.</div>';
    } else if (admin) {
      list.innerHTML = '<div class="val-empty">Sélectionne un coach pour voir ses validations.</div>';
    } else {
      list.innerHTML = '<div class="val-empty">Aucune formation disponible.</div>';
    }
    return;
  }

  try {
    const [data, quizCounts] = await Promise.all([
      api(`/formations/validations/${coachId}`),
      api('/quiz/counts'),
    ]);
    const qCounts = quizCounts.counts || {};

    if (!data.formations || data.formations.length === 0) {
      list.innerHTML = '<div class="val-empty">Aucune formation enregistrée.</div>';
      return;
    }

    const coach = coaches.find(c => c.id === coachId);
    const coachName = coach ? coach.name : '';
    const pct = data.pct || 0;
    const belt = data.belt || getBeltClient(pct);
    const xp = data.xp || 0;
    const badges = data.badges || [];
    const streak = data.streak || { current: 0, best: 0 };
    const bestScores = data.bestScores || {};
    const total = data.total || data.formations.length;
    const validated = data.validated || data.formations.filter(f => f.status === 'validated').length;
    const pctColor = belt.color || '#3b82f6';

    // Next belt
    const nextBelt = BELTS.find(b => b.min > pct);
    const nextBeltStr = nextBelt ? `encore ${nextBelt.min - pct}% pour ${nextBelt.emoji} ${nextBelt.name}` : 'Niveau maximum atteint !';

    // SVG circle progress
    const radius = 54, circ = 2 * Math.PI * radius;
    const offset = circ - (pct / 100) * circ;

    let html = `
      <div class="val-hero">
        <div class="val-hero-ring">
          <svg width="140" height="140" viewBox="0 0 140 140">
            <circle cx="70" cy="70" r="${radius}" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="10"/>
            <circle cx="70" cy="70" r="${radius}" fill="none" stroke="${pctColor}" stroke-width="10"
              stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
              transform="rotate(-90 70 70)" style="transition:stroke-dashoffset .8s ease"/>
          </svg>
          <div class="val-hero-pct">
            <span class="val-hero-number">${pct}</span>
            <span class="val-hero-pct-sign">%</span>
          </div>
        </div>
        <div class="val-hero-info">
          <h3 class="val-hero-name">${coachName}</h3>
          <p class="val-hero-sub">${validated} sur ${total} formations validées</p>
          <div class="val-hero-belt">
            <span class="val-belt-emoji">${belt.emoji}</span>
            <span class="val-belt-name">${belt.name}</span>
          </div>
          <div class="val-belt-next">${nextBeltStr}</div>
        </div>
      </div>
    `;

    html += renderSkillTree(data.formations, qCounts, bestScores, admin, coachId);

    list.innerHTML = html;

    // Pour les coaches et coach leaders : afficher les formations Academy en dessous
    if (!admin) {
      await loadAcademyFormations('val-aca-section');
    } else {
      const acaSection = document.getElementById('val-aca-section');
      if (acaSection) acaSection.innerHTML = '';
    }
  } catch (err) {
    list.innerHTML = '<p style="color:red;">Erreur de chargement</p>';
  }
}

function renderSkillTree(formations, qCounts, bestScores, admin, coachId) {
  let html = '';
  for (const cat of VAL_CATEGORIES) {
    const items = formations.filter(f => f.category === cat.key);
    if (items.length === 0) continue;

    const catValidated = items.filter(f => f.status === 'validated').length;
    let foundCurrent = false;

    html += `<div class="skill-path">
      <div class="skill-path-title">${cat.label} <span style="color:var(--text-muted);font-size:.75rem;font-weight:600;">${catValidated}/${items.length}</span></div>
      <div class="skill-path-nodes">`;

    items.forEach((f, idx) => {
      const isDone   = f.status === 'validated';
      const isFailed = f.status === 'failed';

      // 3 états : vert validé / rouge refusé / gris à valider
      const nodeClass = isDone ? 'validated' : isFailed ? 'failed' : 'locked';
      const nodeIcon = isDone ? '✓' : isFailed ? '✗' : '•';

      if (admin) {
        // Admin : boutons de validation inline directement sur le nœud
        html += `<div class="skill-node ${nodeClass} admin-node" title="${f.name}">
          <div class="skill-node-circle">${nodeIcon}</div>
          <span class="skill-node-label">${f.name}</span>
          <div class="skill-node-actions">
            <button class="sna-btn sna-ok ${isDone ? 'active' : ''}" onclick="event.stopPropagation();openValComment(${coachId},${f.id},'validated')" title="Valider">✓</button>
            <button class="sna-btn sna-fail ${isFailed ? 'active' : ''}" onclick="event.stopPropagation();openValComment(${coachId},${f.id},'failed')" title="Refuser">✗</button>
            <button class="sna-btn sna-reset" onclick="event.stopPropagation();setValidation(${coachId},${f.id},'pending')" title="Remettre à valider">↺</button>
          </div>
          ${f.comment ? `<span class="sna-comment-text" title="${f.comment.replace(/"/g,'&quot;')}">💬 ${f.comment}</span>` : ''}
        </div>`;
      } else {
        html += `<div class="skill-node ${nodeClass}" title="${f.name}">
          <div class="skill-node-circle">${nodeIcon}</div>
          <span class="skill-node-label">${f.name}</span>
          ${f.comment ? `<span class="sna-comment-text">💬 ${f.comment}</span>` : ''}
        </div>`;
      }
    });

    html += `</div>
      <div class="skill-path-progress">${catValidated}/${items.length} complétées</div>
    </div>`;
  }

  return html;
}

function renderValidationList(formations, qCounts, bestScores, admin, coachId) {
  // Vue Liste supprimée — redirige vers Parcours
  return renderSkillTree(formations, qCounts, bestScores, admin, coachId);
  let html = '<div class="val-cats-grid">';
  for (const cat of VAL_CATEGORIES) {
    const items = formations.filter(f => f.category === cat.key);
    if (items.length === 0) continue;
    const catValidated = items.filter(f => f.status === 'validated').length;
    const catPct = Math.round((catValidated / items.length) * 100);

    html += `<div class="val-cat-card" style="--cat-color:${cat.color}">
      <div class="val-cat-header">
        <span class="val-cat-label">${cat.label}</span>
        <span class="val-cat-score">${catValidated}/${items.length}</span>
      </div>
      <div class="val-cat-bar-wrap"><div class="val-cat-bar" style="width:${catPct}%;background:${cat.color}"></div></div>
      <div class="val-cat-items">`;

    for (const f of items) {
      const isDone = f.status === 'validated';
      const isFailed = f.status === 'failed';
      const quizPassed = f.quiz_passed === true || f.quiz_passed === 1;
      const isAwaitingAdmin = !isDone && !isFailed && quizPassed; // quiz réussi, en attente admin
      const statusClass = isDone ? 'val-item-done' : isFailed ? 'val-item-failed' : isAwaitingAdmin ? 'val-item-awaiting' : 'val-item-pending';
      const icon = isDone ? '✓' : isFailed ? '✗' : isAwaitingAdmin ? '⏳' : '';
      const dateStr = f.validated_at ? new Date(f.validated_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
      const hasQuiz = (qCounts[f.id] || 0) > 0;
      const stars = bestScores[f.id] ? getStars(bestScores[f.id]) : '';

      html += `<div class="val-item ${statusClass}">
        <div class="val-item-check">${icon}</div>
        <div class="val-item-content">
          <span class="val-item-name">${f.name}</span>
          ${stars ? `<span class="val-item-stars">${stars}</span>` : ''}
          ${isAwaitingAdmin && !admin ? `<span class="val-item-date" style="color:var(--warning);font-weight:700;">Quiz réussi — En attente de validation</span>` : ''}
          ${dateStr && isDone ? `<span class="val-item-date">${dateStr}</span>` : ''}
        </div>
        ${hasQuiz && !admin && !isDone && !isAwaitingAdmin ? `<button class="quiz-start-btn" onclick="openQuiz(${f.id},'${f.name.replace(/'/g, "\\'")}')">Passer le quiz</button>` : ''}
        ${isDone ? `<span class="quiz-passed-badge">Validé ✓</span>` : ''}
        ${isAwaitingAdmin && !admin ? `<span class="quiz-passed-badge" style="background:rgba(217,119,6,.15);color:var(--warning);">⏳ En attente</span>` : ''}
        ${admin ? `<div class="val-item-actions">
          ${isAwaitingAdmin ? `<span style="font-size:.65rem;color:var(--warning);font-weight:800;white-space:nowrap;">⏳ Quiz OK</span>` : ''}
          <button class="val-item-btn val-ibtn-quiz" onclick="openQuizEditor(${f.id},'${f.name.replace(/'/g, "\\'")}')" title="Quiz (${(qCounts[f.id]||0)} Q)">?</button>
          <button class="val-item-btn val-ibtn-ok ${isDone ? 'active' : ''}" onclick="setValidation(${coachId},${f.id},'validated')">✓</button>
          <button class="val-item-btn val-ibtn-fail ${isFailed ? 'active' : ''}" onclick="setValidation(${coachId},${f.id},'failed')">✗</button>
          <button class="val-item-btn val-ibtn-reset" onclick="setValidation(${coachId},${f.id},'pending')">↺</button>
          <button class="val-item-btn val-ibtn-del" onclick="deleteFormation(${f.id})">🗑</button>
        </div>` : ''}
      </div>`;
    }
    html += '</div></div>';
  }
  html += '</div>';
  return html;
}

// ── Validation comment popup ──────────────────────────────
let _vcmPending = null;

function openValComment(coachId, formationId, status) {
  const modal = document.getElementById('val-comment-modal');
  if (!modal) { setValidation(coachId, formationId, status); return; }
  const title = document.getElementById('vcm-title');
  const subtitle = document.getElementById('vcm-subtitle');
  const textarea = document.getElementById('vcm-text');
  if (title) title.textContent = status === 'validated' ? '✅ Valider la formation' : '❌ Refuser la formation';
  if (subtitle) subtitle.textContent = 'Laisse un message optionnel pour le collaborateur.';
  if (textarea) textarea.value = '';
  _vcmPending = { coachId, formationId, status };
  modal.classList.remove('hidden');
  setTimeout(() => textarea?.focus(), 80);
}

function confirmValComment() {
  const modal = document.getElementById('val-comment-modal');
  const comment = document.getElementById('vcm-text')?.value.trim() || '';
  modal?.classList.add('hidden');
  if (!_vcmPending) return;
  const { coachId, formationId, status } = _vcmPending;
  _vcmPending = null;
  setValidation(coachId, formationId, status, comment);
}

function cancelValComment() {
  document.getElementById('val-comment-modal')?.classList.add('hidden');
  _vcmPending = null;
}

async function setValidation(coachId, formationId, status, comment = null) {
  try {
    await api(`/formations/validations/${coachId}/${formationId}`, { method: 'PUT', body: { status, comment } });
    const modal = document.getElementById('parc-detail-modal');
    if (modal && !modal.classList.contains('hidden')) {
      // Called from parcours detail modal — refresh modal
      await openCoachFormations(coachId);
    } else {
      await loadPendingValidations();
      await loadStudioProgress();
      await refreshValidationList();
    }
  } catch (err) { alert(err.message); }
}

async function deleteFormation(id) {
  if (!confirm('Supprimer cette formation pour tout le monde ?')) return;
  try {
    await api(`/formations/${id}`, { method: 'DELETE' });
    await refreshModulesList();
    await refreshValidationList();
  } catch (err) { alert(err.message); }
}

async function refreshModulesList() {
  const container = document.getElementById('val-modules-list');
  if (!container) return;
  try {
    const resp = await api('/formations');
    const data = resp.formations || resp;
    if (!data || data.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted);padding:12px 0;font-size:.85rem;">Aucun module. Ajoutez-en un ci-dessus.</p>';
      return;
    }
    // Group by category
    const catMap = {};
    for (const f of data) {
      if (!catMap[f.category]) catMap[f.category] = [];
      catMap[f.category].push(f);
    }
    const catLabels = { essentielles:'🎯 Essentielles', signature:'✨ Signature', expertise:'🧠 Expertise', leadership:'👑 Leadership' };
    let html = '';
    for (const [cat, items] of Object.entries(catMap)) {
      html += `<div class="val-mod-group">
        <div class="val-mod-cat-label">${catLabels[cat] || cat} <span class="val-mod-count">${items.length}</span></div>
        <div class="val-mod-items">
          ${items.map(f => `
            <div class="val-mod-row">
              <span class="val-mod-name">${f.name}</span>
              <button class="val-item-btn val-ibtn-del" onclick="deleteFormation(${f.id})" title="Supprimer">🗑</button>
            </div>
          `).join('')}
        </div>
      </div>`;
    }
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = '<p style="color:red;font-size:.85rem;">Erreur de chargement</p>';
  }
}

// ─── QUIZ ───────────────────────────────────────────────────
let currentQuizFormationId = null;
let currentQuizAnswers = {};

async function openQuiz(formationId, formationName) {
  currentQuizFormationId = formationId;
  currentQuizAnswers = {};
  const overlay = document.getElementById('quiz-overlay');
  const content = document.getElementById('quiz-content');
  overlay.classList.remove('hidden');

  content.innerHTML = '<div class="quiz-loading">Chargement du quiz…</div>';

  try {
    const data = await api(`/quiz/${formationId}/questions`);
    if (!data.questions || data.questions.length === 0) {
      content.innerHTML = '<div class="quiz-loading">Aucune question pour ce quiz.</div>';
      return;
    }

    let html = `
      <div class="quiz-header">
        <h2 class="quiz-title">Quiz</h2>
        <p class="quiz-formation">${formationName}</p>
        <p class="quiz-info">${data.questions.length} questions — 80% pour valider</p>
      </div>
      <div class="quiz-questions">
    `;

    data.questions.forEach((q, idx) => {
      html += `
        <div class="quiz-q" data-qid="${q.id}">
          <div class="quiz-q-num">Question ${idx + 1}/${data.questions.length}</div>
          <div class="quiz-q-text">${q.question}</div>
          <div class="quiz-options">
            ${['a', 'b', 'c', 'd'].map(letter => `
              <label class="quiz-option" data-qid="${q.id}" data-letter="${letter}">
                <input type="radio" name="quiz-${q.id}" value="${letter}" onchange="currentQuizAnswers[${q.id}]='${letter}'; document.querySelectorAll('.quiz-option[data-qid=\\'${q.id}\\']').forEach(o=>o.classList.remove('selected')); this.closest('.quiz-option').classList.add('selected');">
                <span class="quiz-option-letter">${letter.toUpperCase()}</span>
                <span class="quiz-option-text">${q['option_' + letter]}</span>
              </label>
            `).join('')}
          </div>
        </div>
      `;
    });

    html += `
      </div>
      <div class="quiz-submit-wrap">
        <button class="quiz-submit-btn" onclick="submitQuiz()">Valider mes réponses</button>
      </div>
    `;

    content.innerHTML = html;
  } catch (err) {
    content.innerHTML = `<div class="quiz-loading" style="color:var(--danger)">Erreur: ${err.message}</div>`;
  }
}

async function submitQuiz() {
  const btn = document.querySelector('.quiz-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Correction…'; }

  try {
    const result = await api(`/quiz/${currentQuizFormationId}/submit`, {
      method: 'POST',
      body: { answers: currentQuizAnswers }
    });

    const content = document.getElementById('quiz-content');
    const passed = result.passed;
    const stars = getStars(result.pct);
    const xpGained = result.xp_gained || 0;

    let html = `<div class="quiz-result-card">
      ${stars ? `<div class="quiz-result-stars">${stars}</div>` : ''}
      <div class="quiz-result-icon" style="font-size:3rem;margin-bottom:8px;">${passed ? '🏆' : '📚'}</div>
      <div class="quiz-result-score">${result.score}/${result.total}</div>
      <div class="quiz-result-pct">${result.pct}%</div>
      ${passed && result.pct < 100 ? `<button class="btn-primary" style="margin-top:12px;" onclick="openQuiz(${currentQuizFormationId},'')">Retenter pour ⭐⭐⭐</button>` : ''}
      ${result.pct >= 100 ? '<div class="quiz-result-perfect">🎯 PARFAIT !</div>' : ''}
      ${!passed ? `<p style="color:var(--text-muted);margin:12px 0;">Il faut 80% pour valider. Révise et réessaie !</p>
        <button class="btn-primary" onclick="openQuiz(${currentQuizFormationId},'')">Réessayer</button>` : ''}
      <button class="btn-secondary" style="margin-top:8px;" onclick="closeQuiz()">Fermer</button>
    </div>`;

    // Show corrections — bonne réponse masquée pour les erreurs
    html += '<div class="quiz-corrections" style="margin-top:20px;"><h3 style="font-size:.9rem;font-weight:700;margin-bottom:12px;">Correction détaillée</h3>';
    result.results.forEach((r, idx) => {
      const corrId = `quiz-corr-reveal-${idx}`;
      html += `<div class="quiz-corr ${r.correct ? 'quiz-corr-ok' : 'quiz-corr-ko'}">
        <div class="quiz-corr-header">
          <span class="quiz-corr-num">Q${idx + 1}</span>
          <span class="quiz-corr-icon">${r.correct ? '✓' : '✗'}</span>
        </div>
        ${!r.correct ? `
          <p class="quiz-corr-answer">Ta réponse : <strong>${(r.userAnswer || '—').toUpperCase()}</strong></p>
          <div id="${corrId}" style="display:none;">
            <p class="quiz-corr-answer">Bonne réponse : <strong>${r.correctAnswer.toUpperCase()}</strong></p>
            ${r.explanation ? `<p class="quiz-corr-explain">${r.explanation}</p>` : ''}
          </div>
          <button onclick="document.getElementById('${corrId}').style.display='block';this.style.display='none';"
            style="margin-top:6px;font-size:.75rem;font-weight:700;padding:4px 12px;border-radius:6px;border:1px solid var(--border);background:var(--bg-subtle);cursor:pointer;color:var(--text-secondary);">
            Voir la réponse
          </button>
        ` : ''}
      </div>`;
    });
    html += '</div>';

    content.innerHTML = html;


    // Belt up animation
    if (result.belt_up) {
      setTimeout(() => showBeltUp(result.belt_up), 500);
    }

    // Badge unlock animation
    if (result.new_badges && result.new_badges.length > 0) {
      const delay = result.belt_up ? 4000 : 500;
      result.new_badges.forEach((badgeKey, i) => {
        setTimeout(() => showBadgeUnlock(badgeKey), delay + i * 3500);
      });
    }

    if (passed) {
      await refreshValidationList();
    }
  } catch (err) {
    alert('Erreur: ' + err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Valider mes réponses'; }
  }
}

function closeQuiz() {
  document.getElementById('quiz-overlay').classList.add('hidden');
}

// ─── Gamification UI Helpers ──────────────────────────────────

function showBeltUp(beltUp) {
  const overlay = document.getElementById('belt-up-overlay');
  const card = document.getElementById('belt-up-card');
  if (!overlay || !card) return;
  card.innerHTML = `
    <div class="belt-up-emoji">${beltUp.to.emoji}</div>
    <h2>NIVEAU SUPÉRIEUR !</h2>
    <p>Tu passes <strong>${beltUp.to.name}</strong></p>
  `;
  overlay.classList.remove('hidden');
  const dismiss = () => overlay.classList.add('hidden');
  overlay.onclick = dismiss;
  setTimeout(dismiss, 3500);
}

function showBadgeUnlock(badgeKey) {
  const badge = CATEGORY_BADGES[badgeKey];
  if (!badge) return;
  const overlay = document.getElementById('badge-unlock-overlay');
  const card = document.getElementById('badge-unlock-card');
  if (!overlay || !card) return;
  card.innerHTML = `
    <div class="badge-unlock-emoji">${badge.emoji}</div>
    <h2>BADGE DÉBLOQUÉ !</h2>
    <p>${badge.name}</p>
  `;
  overlay.classList.remove('hidden');
  const dismiss = () => overlay.classList.add('hidden');
  overlay.onclick = dismiss;
  setTimeout(dismiss, 3500);
}

// ─── QUIZ EDITOR (Admin) ────────────────────────────────────
async function openQuizEditor(formationId, formationName) {
  const overlay = document.getElementById('quiz-editor-overlay');
  const content = document.getElementById('quiz-editor-content');
  overlay.classList.remove('hidden');

  content.innerHTML = '<div class="quiz-loading">Chargement…</div>';

  try {
    const data = await api(`/quiz/${formationId}/questions`);
    renderQuizEditor(formationId, formationName, data.questions || []);
  } catch (err) {
    content.innerHTML = `<div class="quiz-loading" style="color:var(--danger)">Erreur: ${err.message}</div>`;
  }
}

function renderQuizEditor(formationId, formationName, questions) {
  const content = document.getElementById('quiz-editor-content');

  let html = `
    <div class="quiz-header">
      <h2 class="quiz-title">Éditeur de Quiz</h2>
      <p class="quiz-formation">${formationName}</p>
      <p class="quiz-info">${questions.length} question${questions.length > 1 ? 's' : ''}</p>
    </div>
  `;

  if (questions.length > 0) {
    html += '<div class="quiz-editor-list">';
    questions.forEach((q, idx) => {
      html += `
        <div class="quiz-editor-q">
          <div class="quiz-editor-q-header">
            <span class="quiz-corr-num">Q${idx + 1}</span>
            <span class="quiz-editor-q-text">${q.question}</span>
            <button class="val-item-btn val-ibtn-del" onclick="deleteQuizQuestion(${q.id},${formationId},'${formationName.replace(/'/g, "\\'")}')">🗑</button>
          </div>
          <div class="quiz-editor-options">
            ${['a', 'b', 'c', 'd'].map(l => `
              <span class="quiz-editor-opt ${q.correct_answer === l ? 'quiz-editor-correct' : ''}">
                <strong>${l.toUpperCase()}.</strong> ${q['option_' + l]}
              </span>
            `).join('')}
          </div>
          ${q.explanation ? `<p class="quiz-editor-explain">💡 ${q.explanation}</p>` : ''}
        </div>
      `;
    });
    html += '</div>';
  }

  // AI Generation block
  html += `
    <div class="quiz-editor-ai">
      <h3>🤖 Générer avec l’IA</h3>
      <p class="quiz-ai-desc">Collez un transcript et l’IA génère automatiquement les questions QCM.</p>
      <textarea id="qe-transcript" class="val-input quiz-ai-textarea" rows="4" placeholder="Collez le transcript ici…"></textarea>
      <div style="display:flex;gap:10px;margin-top:8px;align-items:center;flex-wrap:wrap">
        <select id="qe-ai-count" class="val-input" style="flex:0 0 auto;min-width:140px">
          <option value="4">4 questions</option>
          <option value="6" selected>6 questions</option>
          <option value="8">8 questions</option>
          <option value="10">10 questions</option>
        </select>
        <button class="btn-primary quiz-ai-btn" id="qe-ai-generate" onclick="generateQuizAI(${formationId},'${formationName.replace(/'/g, "\\'")}')">Générer le quiz</button>
        <span id="qe-ai-status" class="quiz-ai-status"></span>
      </div>
    </div>
  `;

  html += `
    <div class="quiz-editor-add">
      <h3>Ajouter une question manuellement</h3>
      <input type="text" id="qe-question" placeholder="Question" class="val-input" style="width:100%;margin-bottom:8px">
      <div class="quiz-editor-opts-grid">
        <div class="quiz-editor-opt-input">
          <label>A (bonne réponse par défaut)</label>
          <input type="text" id="qe-a" placeholder="Option A" class="val-input">
        </div>
        <div class="quiz-editor-opt-input">
          <label>B</label>
          <input type="text" id="qe-b" placeholder="Option B" class="val-input">
        </div>
        <div class="quiz-editor-opt-input">
          <label>C</label>
          <input type="text" id="qe-c" placeholder="Option C" class="val-input">
        </div>
        <div class="quiz-editor-opt-input">
          <label>D</label>
          <input type="text" id="qe-d" placeholder="Option D" class="val-input">
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:8px;flex-wrap:wrap;align-items:center">
        <select id="qe-correct" class="val-input" style="flex:0 0 auto;min-width:160px">
          <option value="a">Bonne réponse : A</option>
          <option value="b">Bonne réponse : B</option>
          <option value="c">Bonne réponse : C</option>
          <option value="d">Bonne réponse : D</option>
        </select>
        <input type="text" id="qe-explanation" placeholder="Explication (optionnel)" class="val-input" style="flex:1">
        <button class="btn-primary" onclick="addQuizQuestion(${formationId},'${formationName.replace(/'/g, "\\'")}')">Ajouter</button>
      </div>
    </div>
  `;

  content.innerHTML = html;
}

async function addQuizQuestion(formationId, formationName) {
  const question = document.getElementById('qe-question').value.trim();
  const a = document.getElementById('qe-a').value.trim();
  const b = document.getElementById('qe-b').value.trim();
  const c = document.getElementById('qe-c').value.trim();
  const d = document.getElementById('qe-d').value.trim();
  const correct = document.getElementById('qe-correct').value;
  const explanation = document.getElementById('qe-explanation').value.trim();

  if (!question || !a || !b || !c || !d) return alert('Remplis la question et les 4 options');

  try {
    await api(`/quiz/${formationId}/questions`, {
      method: 'POST',
      body: { question, option_a: a, option_b: b, option_c: c, option_d: d, correct_answer: correct, explanation }
    });
    const data = await api(`/quiz/${formationId}/questions`);
    renderQuizEditor(formationId, formationName, data.questions || []);
  } catch (err) { alert(err.message); }
}

async function deleteQuizQuestion(questionId, formationId, formationName) {
  if (!confirm('Supprimer cette question ?')) return;
  try {
    await api(`/quiz/questions/${questionId}`, { method: 'DELETE' });
    const data = await api(`/quiz/${formationId}/questions`);
    renderQuizEditor(formationId, formationName, data.questions || []);
  } catch (err) { alert(err.message); }
}

async function generateQuizAI(formationId, formationName) {
  const transcript = document.getElementById('qe-transcript').value.trim();
  const count = document.getElementById('qe-ai-count').value;
  const status = document.getElementById('qe-ai-status');
  const btn = document.getElementById('qe-ai-generate');

  if (!transcript || transcript.length < 50) {
    return alert('Le transcript doit faire au moins 50 caractères.');
  }

  btn.disabled = true;
  btn.textContent = 'Génération…';
  if (status) status.textContent = '⏳ L’IA analyse le transcript…';

  try {
    const result = await api(`/quiz/${formationId}/generate`, {
      method: 'POST',
      body: { transcript, num_questions: parseInt(count) }
    });

    if (result.error) {
      alert(result.error);
      if (status) status.textContent = '❌ ' + result.error;
    } else {
      if (status) status.textContent = `✅ ${result.count} questions générées !`;
      // Reload editor
      const data = await api(`/quiz/${formationId}/questions`);
      renderQuizEditor(formationId, formationName, data.questions || []);
    }
  } catch (err) {
    alert('Erreur: ' + err.message);
    if (status) status.textContent = '❌ Erreur';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Générer le quiz';
  }
}

function closeQuizEditor() {
  document.getElementById('quiz-editor-overlay').classList.add('hidden');
  refreshValidationList();
}

// ─── RESSOURCES ─────────────────────────────────────────────
let resInitialized = false;
let acaInitialized = false;
let modInitialized = false;

// ─── Helper: extraire l'ID YouTube d'une URL ─────────────────
function getYoutubeId(url) {
  if (!url) return '';
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : '';
}

// ─── Academy : section Formations ────────────────────────────
async function loadAcademyFormations(targetId) {
  // Pour Academy (1234) sans cible explicite → onglet MODULE
  const useModule = !targetId && isAcademy();
  const containerId = targetId || (useModule ? 'mod-formations' : 'aca-formations');
  const container = document.getElementById(containerId);
  if (!container) return;

  const admin = isFormationAdmin();
  // Boutons de gestion : uniquement dans l'onglet principal (pas quand embedded)
  const manageBtn   = !targetId ? document.getElementById(useModule ? 'mod-manage-btn'   : 'aca-manage-btn')   : null;
  const managePanel = !targetId ? document.getElementById(useModule ? 'mod-manage-panel' : 'aca-manage-panel') : null;
  const manageClose = !targetId ? document.getElementById(useModule ? 'mod-manage-close' : 'aca-manage-close') : null;

  if (manageBtn) manageBtn.classList.toggle('hidden', !admin);
  if (!admin && managePanel) managePanel.classList.add('hidden');

  const alreadyInit = useModule ? modInitialized : acaInitialized;
  if (admin && manageBtn && !alreadyInit) {
    if (useModule) modInitialized = true; else acaInitialized = true;
    manageBtn.addEventListener('click', () => managePanel.classList.toggle('hidden'));
    if (manageClose) manageClose.addEventListener('click', () => managePanel.classList.add('hidden'));

    const nameId  = useModule ? 'mod-formation-name'  : 'aca-formation-name';
    const catId   = useModule ? 'mod-formation-cat'   : 'aca-formation-cat';
    const descId  = useModule ? 'mod-formation-desc'  : 'aca-formation-desc';
    const videoId = useModule ? 'mod-formation-video' : 'aca-formation-video';
    const addBtn  = document.getElementById(useModule ? 'mod-add-btn' : 'aca-add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', async () => {
        const name = document.getElementById(nameId)?.value.trim();
        const category = document.getElementById(catId)?.value || 'essentielles';
        const description = document.getElementById(descId)?.value.trim() || '';
        const video_url = document.getElementById(videoId)?.value.trim() || '';
        if (!name) return alert('Nom du module requis');
        addBtn.disabled = true; addBtn.textContent = '…';
        try {
          await api('/formations', { method: 'POST', body: { name, category, description, video_url } });
          document.getElementById(nameId).value = '';
          document.getElementById(descId).value = '';
          document.getElementById(videoId).value = '';
          await loadAcademyFormations();
        } catch (err) { alert(err.message); }
        finally { addBtn.disabled = false; addBtn.textContent = '+ Ajouter'; }
      });
    }
  }

  // Stats opérationnelles : uniquement pour l'onglet Academy des coaches (pas Academy 1234, pas embedded)
  if (!targetId && !useModule) {
    const opContainer = document.getElementById('aca-operational-container');
    if (opContainer) await loadAcademyOperationalRate();
  }

  // Feature 2: new/updated badge logic
  const seenTs = localStorage.getItem('formations_seen_ts') || '1970-01-01';

  try {
    const data = await api('/formations');
    const formations = data.formations || [];

    // Count new formations and update nav badge
    const newCount = formations.filter(f => f.updated_at && f.updated_at > seenTs).length;
    const academyTabEl = document.querySelector('.tab-btn-validation') || document.querySelector('[data-tab="validation"]');
    if (academyTabEl) {
      academyTabEl.classList.toggle('tab-has-new', newCount > 0);
    }
    const moduleTabEl = document.querySelector('.tab-btn-module') || document.querySelector('[data-tab="module"]');
    if (moduleTabEl) {
      moduleTabEl.classList.toggle('tab-has-new', newCount > 0);
    }

    // After 5 seconds, mark all as seen
    setTimeout(() => {
      localStorage.setItem('formations_seen_ts', new Date().toISOString());
      if (academyTabEl) academyTabEl.classList.remove('tab-has-new');
      if (moduleTabEl) moduleTabEl.classList.remove('tab-has-new');
    }, 5000);

    if (formations.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📚</div><h3>Aucune formation disponible</h3><p>L\'admin peut ajouter des formations via ⚙️</p></div>';
      return;
    }

    const categories = [
      { key: 'essentielles',  label: '🎯 Essentielles', group: 'ressources' },
      { key: 'signature',     label: '✨ Signature',     group: 'ressources' },
      { key: 'expertise',     label: '🧠 Expertise',     group: 'ressources' },
      { key: 'leadership',    label: '👑 Leadership',    group: 'ressources' },
    ];
    const allCatKeys = categories.map(c => c.key);

    const renderCatBlock = (cat, formations) => {
      const items = formations.filter(f => f.category === cat.key);
      if (!items.length) return '';
      let b = `<div class="aca-cat-block">`;
      b += `<button class="aca-cat-toggle" onclick="toggleAcaCat(this)">
        <span class="aca-cat-toggle-label">${cat.label} <span class="aca-cat-count">${items.length}</span></span>
        <svg class="aca-cat-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </button>`;
      b += `<div class="aca-cat-grid aca-cat-collapsed">`;
      for (let i = 0; i < items.length; i++) {
        const f = items[i];
        const vid = getYoutubeId(f.video_url || '');
        const isNew = f.updated_at && f.updated_at > seenTs;
        const otherCats = allCatKeys.filter(k => k !== cat.key);
        b += `
          <div class="aca-card" id="aca-card-${f.id}">
            ${vid ? `
              <a href="https://www.youtube.com/watch?v=${vid}" target="_blank" class="aca-thumb-link">
                <img src="https://img.youtube.com/vi/${vid}/mqdefault.jpg" alt="${f.name}" class="aca-thumb">
                <div class="res-play-overlay"><svg width="36" height="36" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg></div>
              </a>
            ` : ''}
            <div class="aca-card-body">
              <div class="aca-card-top">
                <span class="aca-card-name">${f.name}${isNew ? ' <span class="badge-nouveau">🆕</span>' : ''}</span>
                ${admin ? `
                  <div class="aca-card-actions">
                    <button class="val-item-btn" onclick="reorderAcaFormation(${f.id},'up')" title="Monter" ${i === 0 ? 'disabled' : ''}>↑</button>
                    <button class="val-item-btn" onclick="reorderAcaFormation(${f.id},'down')" title="Descendre" ${i === items.length - 1 ? 'disabled' : ''}>↓</button>
                    <button class="val-item-btn" onclick="toggleAcaEdit(${f.id})" title="Modifier">✏️</button>
                    <button class="val-item-btn val-ibtn-del" onclick="deleteAcaFormation(${f.id})" title="Supprimer">🗑</button>
                  </div>
                ` : ''}
              </div>
              ${f.description ? `<p class="aca-card-desc">${f.description}</p>` : ''}
              ${admin ? `
                <div id="aca-edit-${f.id}" class="aca-edit-form hidden">
                  <input type="text" id="aca-en-${f.id}" value="${(f.name||'').replace(/"/g,'&quot;')}" class="val-input" placeholder="Nom">
                  <input type="text" id="aca-ed-${f.id}" value="${(f.description||'').replace(/"/g,'&quot;')}" class="val-input" placeholder="Description (optionnel)">
                  <input type="text" id="aca-ev-${f.id}" value="${(f.video_url||'').replace(/"/g,'&quot;')}" class="val-input" placeholder="URL YouTube (optionnel)">
                  <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;align-items:center;">
                    <button class="btn-primary" onclick="saveAcaFormation(${f.id})" style="padding:6px 14px;font-size:.8rem;">💾 Sauvegarder</button>
                    <button class="btn-secondary" onclick="toggleAcaEdit(${f.id})" style="padding:6px 14px;font-size:.8rem;">Annuler</button>
                    <select class="val-input" style="flex:1;min-width:130px;font-size:.8rem;" onchange="moveAcaFormation(${f.id},this.value,this)">
                      <option value="">Déplacer vers…</option>
                      ${otherCats.map(k => `<option value="${k}">${k.charAt(0).toUpperCase()+k.slice(1)}</option>`).join('')}
                    </select>
                  </div>
                </div>
              ` : ''}
            </div>
          </div>
        `;
      }
      b += `</div></div>`;
      return b;
    };

    let html = '';

    // ── Groupe Ressources (Essentielles + Signature + Expertise) ──
    const ressourcesCats = categories.filter(c => c.group === 'ressources');
    const ressourcesCount = formations.filter(f => ressourcesCats.some(c => c.key === f.category)).length;
    if (ressourcesCount > 0) {
      html += `<div class="aca-group-block">`;
      html += `<div class="aca-group-header">📚 Ressources <span class="aca-group-count">${ressourcesCount}</span></div>`;
      for (const cat of ressourcesCats) {
        html += renderCatBlock(cat, formations);
      }
      html += `</div>`;
    }



    // If rendering in the val tab, wrap with a section title
    if (targetId) {
      container.innerHTML = `
        <div style="margin-top:28px;padding-top:20px;border-top:2px solid var(--border);">
          <h3 style="font-size:.8rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--text-secondary);margin-bottom:16px;">🎓 Formations disponibles</h3>
          ${html}
        </div>`;
    } else {
      container.innerHTML = html;
    }
  } catch (err) {
    container.innerHTML = '<p style="color:red;">Erreur de chargement des formations</p>';
  }
}

function toggleAcaCat(btn) {
  const grid = btn.nextElementSibling;
  const chevron = btn.querySelector('.aca-cat-chevron');
  const collapsed = grid.classList.toggle('aca-cat-collapsed');
  chevron.style.transform = collapsed ? '' : 'rotate(180deg)';
}

function toggleAcaEdit(id) {
  document.getElementById(`aca-edit-${id}`)?.classList.toggle('hidden');
}

async function saveAcaFormation(id) {
  const name = document.getElementById(`aca-en-${id}`)?.value.trim();
  const description = document.getElementById(`aca-ed-${id}`)?.value.trim();
  const video_url = document.getElementById(`aca-ev-${id}`)?.value.trim();
  if (!name) return alert('Nom requis');
  try {
    await api(`/formations/${id}`, { method: 'PATCH', body: { name, description, video_url } });
    if (isAcademy()) modInitialized = false; else acaInitialized = false;
    await loadAcademyFormations();
  } catch (err) { alert(err.message); }
}

async function deleteAcaFormation(id) {
  if (!confirm('Supprimer cette formation ? Les validations associées seront aussi supprimées.')) return;
  try {
    await api(`/formations/${id}`, { method: 'DELETE' });
    await loadAcademyFormations();
  } catch (err) { alert(err.message); }
}

async function reorderAcaFormation(id, direction) {
  try {
    await api(`/formations/${id}/reorder`, { method: 'PATCH', body: { direction } });
    if (isAcademy()) modInitialized = false; else acaInitialized = false;
    await loadAcademyFormations();
  } catch (err) { alert(err.message); }
}

async function moveAcaFormation(id, category, selectEl) {
  if (!category) return;
  try {
    await api(`/formations/${id}/reorder`, { method: 'PATCH', body: { category } });
    if (isAcademy()) modInitialized = false; else acaInitialized = false;
    await loadAcademyFormations();
  } catch (err) {
    alert(err.message);
    if (selectEl) selectEl.value = '';
  }
}

async function loadRessources() {
  if (isAcademy()) {
    // PERF : stats opérationnelles uniquement (les formations sont dans MODULE)
    const opContainer = document.getElementById('aca-operational-container');
    if (opContainer) await loadAcademyOperationalRate();
  } else {
    await loadAcademyFormations();
  }
}

async function loadModuleTab() {
  await loadAcademyFormations();
}

// ─── BODY CHECK ────────────────────────────────────────────

function generateBodyCheck() { return; // supprimé
  const v = (id) => parseFloat(document.getElementById(id).value) || 0;
  const s = (id) => document.getElementById(id).value.trim();

  const prenom = s('bc-prenom') || 'Client';
  const sexe = s('bc-sexe');
  const age = v('bc-age');
  const taille = v('bc-taille');
  const score = v('bc-score');
  const qualiteMusc = v('bc-qualite-musc');
  const poids = v('bc-poids');
  const muscle = v('bc-muscle');
  const graisse = v('bc-graisse');
  const pctGraisse = v('bc-pct-graisse');
  const graisseTronc = v('bc-graisse-tronc');
  const graisseMembres = v('bc-graisse-membres');
  const rth = v('bc-rth');
  const poidsCible = v('bc-poids-cible');
  const graissePerdre = v('bc-graisse-perdre');

  if (!prenom || !poids) { alert('Remplis au minimum le prénom et le poids'); return; }

  // 1. Score global
  let scoreMsg = '';
  if (score >= 80) scoreMsg = 'Très bon niveau. Solide.';
  else if (score >= 70) scoreMsg = 'Bon départ, marge de progression intéressante.';
  else if (score >= 60) scoreMsg = 'Niveau correct, on a du travail ensemble.';
  else scoreMsg = 'Point de départ identifié. Tout est à construire — c\'est motivant.';

  // 2. Composition corporelle
  const normeGraisse = sexe === 'F' ? { bas: 18, haut: 28 } : { bas: 10, haut: 20 };
  let compoMsg = '';
  if (pctGraisse > normeGraisse.haut) {
    const exces = (pctGraisse - normeGraisse.haut).toFixed(1);
    compoMsg = `Masse grasse au-dessus de la norme (+${exces}%). `;
  } else if (pctGraisse < normeGraisse.bas) {
    compoMsg = 'Masse grasse basse. ';
  } else {
    compoMsg = 'Masse grasse dans la norme. ';
  }
  const ratioMG = muscle / (muscle + graisse);
  if (ratioMG < 0.7) compoMsg += 'Le rapport muscle/graisse est à rééquilibrer.';
  else if (ratioMG < 0.8) compoMsg += 'Rapport muscle/graisse correct, on peut l\'améliorer.';
  else compoMsg += 'Bon ratio muscle/graisse.';

  // 3. Localisation graisse
  let locMsg = '';
  const totalGraisseSegments = graisseTronc + graisseMembres;
  if (totalGraisseSegments > 0) {
    const pctTronc = (graisseTronc / totalGraisseSegments * 100).toFixed(0);
    if (pctTronc > 60) {
      locMsg = `Graisse concentrée au niveau du tronc (${pctTronc}%). Zone à surveiller pour la santé.`;
    } else if (pctTronc > 45) {
      locMsg = `Répartition mixte tronc/membres. Légère prédominance abdominale.`;
    } else {
      locMsg = `Graisse plutôt en périphérie. Moins de risque santé, davantage esthétique.`;
    }
    if (rth > 0) {
      if ((sexe === 'H' && rth > 0.90) || (sexe === 'F' && rth > 0.85)) {
        locMsg += ` RTH à ${rth} — au-dessus du seuil recommandé.`;
      } else {
        locMsg += ` RTH à ${rth} — dans la norme.`;
      }
    }
  }

  // 4. Qualité musculaire
  let qualMsg = '';
  if (qualiteMusc >= 70) qualMsg = 'Muscle fonctionnel et de qualité. Très bien.';
  else if (qualiteMusc >= 55) qualMsg = 'Qualité musculaire correcte, on peut progresser sur la fonctionnalité.';
  else if (qualiteMusc > 0) qualMsg = 'Qualité musculaire faible — on peut avoir du volume sans efficacité. C\'est notre axe de travail.';
  else qualMsg = 'Non renseigné.';

  // 5. Objectif chiffré
  let objMsg = '';
  if (graissePerdre > 0) {
    const mois = Math.ceil(graissePerdre / 2); // ~2kg/mois réaliste
    objMsg = `Objectif : perdre ${graissePerdre} kg de graisse pour atteindre ${poidsCible} kg. Horizon réaliste : ${mois} mois avec 3 séances/semaine.`;
  } else if (poidsCible > 0) {
    objMsg = `Poids cible : ${poidsCible} kg.`;
  }

  // Messages coach (3 lignes)
  let msg1 = '', msg2 = '', msg3 = '';
  if (score >= 70) {
    msg1 = `${prenom}, ton bilan montre une base solide. Score de ${score}/100, c’est un bon point de départ.`;
  } else {
    msg1 = `${prenom}, ton bilan est posé. Score de ${score}/100 — on sait exactement où on en est, et c’est ça qui compte.`;
  }

  if (pctGraisse > normeGraisse.haut && qualiteMusc < 55) {
    msg2 = `On va travailler sur deux fronts : réduire la masse grasse et améliorer la qualité de ton muscle. Pas juste le volume — l’efficacité.`;
  } else if (pctGraisse > normeGraisse.haut) {
    msg2 = `L’objectif principal : faire baisser ta masse grasse. Le muscle est là, il faut le révéler.`;
  } else if (qualiteMusc < 55) {
    msg2 = `Ton point clé : la qualité musculaire (${qualiteMusc}/100). On va transformer ton muscle pour qu’il soit vraiment fonctionnel.`;
  } else {
    msg2 = `Ton profil est équilibré. On va affiner et pousser la qualité musculaire encore plus haut.`;
  }

  if (graissePerdre > 0) {
    msg3 = `Objectif ${poidsCible} kg, c’est ${graissePerdre} kg de graisse à perdre. C’est faisable, c’est chiffré, on y va ensemble.`;
  } else {
    msg3 = `On a les chiffres, on a le plan. Maintenant on exécute.`;
  }

  // Render
  const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const resultDiv = document.getElementById('bc-result');

  resultDiv.innerHTML = `
    <div class="bc-report">
      <div class="bc-report-header">
        <h3>Body Check — ${prenom}</h3>
        <span class="bc-report-date">${date}</span>
      </div>
      <table class="bc-table"><tbody>
        <tr><td class="bc-table-label">Poids actuel</td><td class="bc-table-value">${poids} kg</td></tr>
        <tr><td class="bc-table-label">Masse musculaire</td><td class="bc-table-value">${muscle} kg</td></tr>
        <tr><td class="bc-table-label">Masse grasse</td><td class="bc-table-value">${graisse} kg (${pctGraisse}%)</td></tr>
        <tr><td class="bc-table-label">Score global</td><td class="bc-table-value">${score}/100</td></tr>
        <tr><td class="bc-table-label">Qualité musculaire</td><td class="bc-table-value">${qualiteMusc}/100</td></tr>
        ${poidsCible ? `<tr><td class="bc-table-label">Poids cible</td><td class="bc-table-value">${poidsCible} kg</td></tr>` : ''}
        ${graissePerdre ? `<tr><td class="bc-table-label">Graisse à perdre</td><td class="bc-table-value">${graissePerdre} kg</td></tr>` : ''}
      </tbody></table>

      <div class="bc-grid-analysis">
        <div class="bc-grid-item"><span class="bc-grid-icon">📊</span><strong>Score global</strong><p>${scoreMsg}</p></div>
        <div class="bc-grid-item"><span class="bc-grid-icon">⚖️</span><strong>Composition</strong><p>${compoMsg}</p></div>
        ${locMsg ? `<div class="bc-grid-item"><span class="bc-grid-icon">📍</span><strong>Localisation graisse</strong><p>${locMsg}</p></div>` : ''}
        <div class="bc-grid-item"><span class="bc-grid-icon">💪</span><strong>Qualité musculaire</strong><p>${qualMsg}</p></div>
        ${objMsg ? `<div class="bc-grid-item"><span class="bc-grid-icon">🎯</span><strong>Objectif</strong><p>${objMsg}</p></div>` : ''}
      </div>

      <div class="bc-report-divider"></div>
      <div class="bc-message">
        <p>${msg1}</p>
        <p>${msg2}</p>
        <p>${msg3}</p>
      </div>
      <div class="bc-actions">
        <button class="btn-primary bc-copy-btn" onclick="copyBodyCheck()">📋 Copier</button>
        <button class="btn-secondary bc-mail-btn" onclick="mailBodyCheck('${prenom.replace(/'/g, "\\'")}')">✉️ Envoyer par mail</button>
      </div>
    </div>
  `;
  resultDiv.classList.remove('hidden');
  resultDiv.scrollIntoView({ behavior: 'smooth' });
}

function copyBodyCheck() {
  const report = document.querySelector('.bc-report');
  if (!report) return;
  navigator.clipboard.writeText(report.innerText).then(() => {
    const btn = document.querySelector('.bc-copy-btn');
    btn.textContent = '✅ Copié !';
    setTimeout(() => btn.textContent = '📋 Copier', 2000);
  });
}

function mailBodyCheck(clientName) {
  const report = document.querySelector('.bc-report');
  if (!report) return;
  const subject = encodeURIComponent(`Body Check — ${clientName} — My Coach`);
  const body = encodeURIComponent(report.innerText);
  window.open(`mailto:?subject=${subject}&body=${body}`);
}

// ─── INIT ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initAuthUI();

  // Always show login first to avoid black screen
  showLogin();

  if (authToken && currentUser) {
    try {
      const me = await api('/auth/me');
      if (me && me.role) {
        currentUser = me;
        localStorage.setItem('currentUser_coach', JSON.stringify(currentUser));

        if (me.role === 'coach' && !selectedClub) {
          hideLogin();
          showClubSelect();
          return;
        }

        hideLogin();
        updateUserUI();
        await bootApp();
        return;
      }
    } catch (err) {
      console.warn('[auto-login] session expired, showing login', err.message);
    }
    // Session invalide → nettoyage
    authToken = null;
    currentUser = null;
    selectedClub = '';
    _appBooted = false;
    localStorage.removeItem('authToken_coach');
    localStorage.removeItem('currentUser_coach');
    localStorage.removeItem('selectedClub_coach');
  }

  // Login overlay is already shown
});

// ─── PERSO TAB (admin only) ────────────────────────────────
let _personoInit = false;
let persoExercises = [];
let persoSessions = [];
let persoCurrentExercise = null; // Selected exercise (with last/best/objective)
let persoFeeling = 'moyen';
let persoEnergie = null;
let persoEditingSession = null; // Session being edited (or null for new)
let persoSessionExercises = []; // Exercises currently in the session editor
let persoChart = null;

function initPerso() {
  if (_personoInit) { loadPersoData(); return; }
  _personoInit = true;

  // Date default = today
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('perso-date').value = today;

  // Energie buttons
  document.querySelectorAll('#perso-energie-stars button').forEach(btn => {
    btn.addEventListener('click', () => {
      persoEnergie = parseInt(btn.dataset.val);
      document.querySelectorAll('#perso-energie-stars button').forEach(b => b.classList.toggle('active', parseInt(b.dataset.val) === persoEnergie));
    });
  });

  // Feeling buttons
  document.querySelectorAll('#perso-feeling button').forEach(btn => {
    btn.addEventListener('click', () => {
      persoFeeling = btn.dataset.val;
      document.querySelectorAll('#perso-feeling button').forEach(b => b.classList.toggle('active', b.dataset.val === persoFeeling));
    });
  });

  // Save daily
  document.getElementById('perso-save-daily').addEventListener('click', savePersoDaily);
  document.getElementById('perso-date').addEventListener('change', loadPersoDaily);

  // Exercise autocomplete
  const nameInput = document.getElementById('perso-ex-name');
  nameInput.addEventListener('input', onPersoExInput);
  nameInput.addEventListener('focus', onPersoExInput);
  nameInput.addEventListener('blur', () => setTimeout(() => document.getElementById('perso-ex-suggestions').classList.add('hidden'), 150));

  document.getElementById('perso-add-set').addEventListener('click', addPersoSet);

  // Session management
  document.getElementById('perso-new-session').addEventListener('click', () => openPersoSessionEditor(null));
  document.getElementById('perso-session-close').addEventListener('click', closePersoSessionEditor);
  document.getElementById('perso-session-save').addEventListener('click', savePersoSession);
  document.getElementById('perso-session-delete').addEventListener('click', deletePersoSession);

  const sesInput = document.getElementById('perso-session-ex-input');
  sesInput.addEventListener('input', onPersoSessionExInput);
  sesInput.addEventListener('focus', onPersoSessionExInput);
  sesInput.addEventListener('blur', () => setTimeout(() => document.getElementById('perso-session-ex-suggestions').classList.add('hidden'), 150));

  // Progress modal close
  document.getElementById('perso-progress-close').addEventListener('click', () => {
    document.getElementById('perso-progress-overlay').classList.add('hidden');
  });

  loadPersoData();
}

async function loadPersoData() {
  await loadPersoExercises();
  await loadPersoSessions();
  await loadPersoDaily();
  await loadPersoSetsToday();
}

async function loadPersoExercises() {
  try {
    const data = await api('/perso/exercises');
    persoExercises = data.exercises || [];
  } catch(e) { console.error(e); }
}

async function loadPersoSessions() {
  try {
    const data = await api('/perso/sessions');
    persoSessions = data.sessions || [];
    renderPersoSessions();
  } catch(e) { console.error(e); }
}

function renderPersoSessions() {
  const container = document.getElementById('perso-sessions-list');
  if (!persoSessions.length) {
    container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:10px;">Aucune séance. Clique sur "+ Nouvelle".</p>';
    return;
  }
  container.innerHTML = persoSessions.map(s => `
    <div class="perso-session-card">
      <div class="perso-session-info">
        <button class="perso-fav-btn ${s.is_favorite ? 'active' : ''}" onclick="togglePersoFav(${s.id})" title="Favori">${s.is_favorite ? '⭐' : '☆'}</button>
        <div>
          <div class="perso-session-name">${s.name}</div>
          <div class="perso-session-count">${s.exercises.length} exercice${s.exercises.length > 1 ? 's' : ''}</div>
        </div>
      </div>
      <div class="perso-session-actions">
        <button class="btn-secondary" onclick="loadPersoSessionIntoDay(${s.id})">▶️ Utiliser</button>
        <button class="btn-secondary" onclick="openPersoSessionEditor(${s.id})">✏️</button>
      </div>
    </div>
  `).join('');
}

async function togglePersoFav(id) {
  const s = persoSessions.find(x => x.id === id);
  if (!s) return;
  try {
    await api(`/perso/sessions/${id}`, { method: 'PATCH', body: JSON.stringify({ is_favorite: !s.is_favorite }) });
    await loadPersoSessions();
  } catch(e) { alert(e.message); }
}

async function loadPersoSessionIntoDay(sessionId) {
  const s = persoSessions.find(x => x.id === sessionId);
  if (!s) return;
  // For each exercise in session, add an empty placeholder in sets-today if not yet present
  // Actually, better: pre-fill the exercise input with the first exercise not yet done today
  const today = document.getElementById('perso-date').value;
  const setsData = await api(`/perso/sets-today/${today}`);
  const doneIds = new Set((setsData.sets || []).map(s => s.exercise_id));
  const todo = s.exercises.filter(e => !doneIds.has(e.id));
  if (!todo.length) {
    alert('Tous les exercices de cette séance sont déjà faits aujourd\'hui !');
    return;
  }
  persoSelectExercise(todo[0]);
  // Scroll to input
  document.getElementById('perso-ex-name').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function openPersoSessionEditor(sessionId) {
  persoEditingSession = sessionId ? persoSessions.find(s => s.id === sessionId) : null;
  document.getElementById('perso-session-title').textContent = persoEditingSession ? `Modifier : ${persoEditingSession.name}` : 'Nouvelle séance';
  document.getElementById('perso-session-name').value = persoEditingSession ? persoEditingSession.name : '';
  document.getElementById('perso-session-ex-input').value = '';
  persoSessionExercises = persoEditingSession ? [...persoEditingSession.exercises] : [];
  renderPersoSessionExList();
  document.getElementById('perso-session-delete').classList.toggle('hidden', !persoEditingSession);
  document.getElementById('perso-session-overlay').classList.remove('hidden');
}

function closePersoSessionEditor() {
  document.getElementById('perso-session-overlay').classList.add('hidden');
  persoEditingSession = null;
  persoSessionExercises = [];
}

function renderPersoSessionExList() {
  const c = document.getElementById('perso-session-ex-list');
  if (!persoSessionExercises.length) {
    c.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:10px;font-size:.85rem;">Aucun exercice ajouté</p>';
    return;
  }
  c.innerHTML = persoSessionExercises.map((e, i) => `
    <div class="perso-session-ex-row">
      <span class="perso-session-ex-num">${i + 1}</span>
      <span class="perso-session-ex-name">${e.name}</span>
      <span class="perso-session-ex-muscle">${e.muscle_group || ''}</span>
      <button onclick="removePersoSessionEx(${i})">&times;</button>
    </div>
  `).join('');
}

window.removePersoSessionEx = function(idx) {
  persoSessionExercises.splice(idx, 1);
  renderPersoSessionExList();
};

function onPersoSessionExInput() {
  const val = document.getElementById('perso-session-ex-input').value.trim().toLowerCase();
  const sugEl = document.getElementById('perso-session-ex-suggestions');
  const filtered = persoExercises
    .filter(e => !val || e.name.toLowerCase().includes(val))
    .filter(e => !persoSessionExercises.find(se => se.id === e.id))
    .slice(0, 8);
  if (!filtered.length) { sugEl.classList.add('hidden'); return; }
  sugEl.innerHTML = filtered.map(e => `
    <div onmousedown="addPersoSessionEx(${e.id})">${e.name}${e.muscle_group ? `<span class="sug-muscle">${e.muscle_group}</span>` : ''}</div>
  `).join('');
  sugEl.classList.remove('hidden');
}

window.addPersoSessionEx = function(id) {
  const ex = persoExercises.find(e => e.id === id);
  if (!ex) return;
  persoSessionExercises.push(ex);
  document.getElementById('perso-session-ex-input').value = '';
  document.getElementById('perso-session-ex-suggestions').classList.add('hidden');
  renderPersoSessionExList();
};

async function savePersoSession() {
  const name = document.getElementById('perso-session-name').value.trim();
  if (!name) { alert('Nom requis'); return; }
  if (!persoSessionExercises.length) { alert('Ajoute au moins un exercice'); return; }
  const body = { name, exercise_ids: persoSessionExercises.map(e => e.id) };
  try {
    if (persoEditingSession) {
      await api(`/perso/sessions/${persoEditingSession.id}`, { method: 'PATCH', body: JSON.stringify(body) });
    } else {
      await api('/perso/sessions', { method: 'POST', body: JSON.stringify(body) });
    }
    closePersoSessionEditor();
    await loadPersoSessions();
  } catch(e) { alert(e.message); }
}

async function deletePersoSession() {
  if (!persoEditingSession) return;
  if (!confirm(`Supprimer la séance "${persoEditingSession.name}" ?`)) return;
  try {
    await api(`/perso/sessions/${persoEditingSession.id}`, { method: 'DELETE' });
    closePersoSessionEditor();
    await loadPersoSessions();
  } catch(e) { alert(e.message); }
}

async function loadPersoDaily() {
  const date = document.getElementById('perso-date').value;
  try {
    const data = await api(`/perso/daily/${date}`);
    document.getElementById('perso-poids').value = data.poids ?? '';
    persoEnergie = data.energie;
    document.querySelectorAll('#perso-energie-stars button').forEach(b => b.classList.toggle('active', parseInt(b.dataset.val) === persoEnergie));
    await loadPersoSetsToday();
  } catch(e) { console.error(e); }
}

async function savePersoDaily() {
  const date = document.getElementById('perso-date').value;
  const poids = parseFloat(document.getElementById('perso-poids').value) || null;
  try {
    await api(`/perso/daily/${date}`, { method: 'PUT', body: JSON.stringify({ poids, energie: persoEnergie }) });
    showToast('Suivi du jour enregistré ✓');
  } catch(e) { alert(e.message); }
}

function onPersoExInput() {
  const val = document.getElementById('perso-ex-name').value.trim().toLowerCase();
  const sugEl = document.getElementById('perso-ex-suggestions');
  const filtered = persoExercises.filter(e => !val || e.name.toLowerCase().includes(val)).slice(0, 8);
  if (!filtered.length) { sugEl.classList.add('hidden'); return; }
  sugEl.innerHTML = filtered.map(e => `
    <div onmousedown="persoPickExercise(${e.id})">${e.name}${e.muscle_group ? `<span class="sug-muscle">${e.muscle_group}</span>` : ''}</div>
  `).join('');
  sugEl.classList.remove('hidden');
}

window.persoPickExercise = async function(id) {
  const ex = persoExercises.find(e => e.id === id);
  if (!ex) return;
  document.getElementById('perso-ex-suggestions').classList.add('hidden');
  await persoSelectExercise(ex);
};

async function persoSelectExercise(ex) {
  document.getElementById('perso-ex-name').value = ex.name;
  document.getElementById('perso-ex-muscle').value = ex.muscle_group || '';
  document.getElementById('perso-ex-obj').value = ex.objectif_charge ?? '';
  // Load history
  try {
    const data = await api(`/perso/exercises/${ex.id}/history`);
    persoCurrentExercise = { ...ex, last: data.last, best: data.best, objectif_charge: data.exercise.objectif_charge };
    renderPersoPerf();
  } catch(e) { console.error(e); }
}

function renderPersoPerf() {
  const el = document.getElementById('perso-ex-perf');
  if (!persoCurrentExercise) { el.classList.add('hidden'); return; }
  const { last, best, objectif_charge } = persoCurrentExercise;
  const parts = [];
  if (last) parts.push(`<span>📍 <b>Dernière</b> : ${last.charge}kg × ${last.series}×${last.reps} (${last.date})</span>`);
  else parts.push(`<span>📍 <b>Dernière</b> : —</span>`);
  if (best) parts.push(`<span>🏆 <b>Meilleure</b> : ${best.charge}kg × ${best.series}×${best.reps}</span>`);
  else parts.push(`<span>🏆 <b>Meilleure</b> : —</span>`);
  if (objectif_charge) {
    const achieved = best && best.charge >= objectif_charge;
    parts.push(`<span class="${achieved ? 'perso-obj-ok' : ''}">🎯 <b>Objectif</b> : ${objectif_charge}kg ${achieved ? '✅' : ''}</span>`);
  }
  el.innerHTML = parts.join('');
  el.classList.remove('hidden');
}

async function addPersoSet() {
  const name = document.getElementById('perso-ex-name').value.trim();
  const muscle_group = document.getElementById('perso-ex-muscle').value.trim();
  const objVal = document.getElementById('perso-ex-obj').value;
  const charge = parseFloat(document.getElementById('perso-ex-charge').value) || 0;
  const series = parseInt(document.getElementById('perso-ex-series').value) || 0;
  const reps = parseInt(document.getElementById('perso-ex-reps').value) || 0;
  const date = document.getElementById('perso-date').value;

  if (!name) { alert('Nom de l\'exercice requis'); return; }

  try {
    const data = await api('/perso/sets', {
      method: 'POST',
      body: JSON.stringify({ name, muscle_group, charge, series, reps, feeling: persoFeeling, date }),
    });
    // Update objectif if provided
    if (objVal !== '') {
      await api(`/perso/exercises/${data.exercise.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ objectif_charge: parseFloat(objVal) }),
      });
    }
    showToast('Exercice enregistré ✓');
    // Clear performance fields but keep exercise name for next set
    document.getElementById('perso-ex-charge').value = '';
    document.getElementById('perso-ex-series').value = '';
    document.getElementById('perso-ex-reps').value = '';
    await loadPersoExercises();
    await loadPersoSetsToday();
    // Refresh selected exercise stats
    const ex = persoExercises.find(e => e.id === data.exercise.id);
    if (ex) await persoSelectExercise(ex);
  } catch(e) { alert(e.message); }
}

async function loadPersoSetsToday() {
  const date = document.getElementById('perso-date').value;
  try {
    const data = await api(`/perso/sets-today/${date}`);
    renderPersoSetsToday(data.sets || []);
  } catch(e) { console.error(e); }
}

function renderPersoSetsToday(sets) {
  const c = document.getElementById('perso-sets-today');
  if (!sets.length) {
    c.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">Aucun exercice enregistré aujourd\'hui.</p>';
    return;
  }
  const feelEmoji = { facile: '😌', moyen: '😐', dur: '😰' };
  c.innerHTML = sets.map(s => {
    const achieved = s.objectif_charge && s.charge >= s.objectif_charge;
    return `
      <div class="perso-set-item" onclick="openPersoProgress(${s.exercise_id}, '${s.exercise_name.replace(/'/g, "\\'")}')">
        <div style="flex:1;">
          <div class="perso-set-name">${s.exercise_name} ${achieved ? '✅' : ''}<span class="perso-set-muscle"> ${s.muscle_group || ''}</span></div>
          <div class="perso-set-stats">${s.charge}kg · ${s.series} × ${s.reps}${s.objectif_charge ? ` · 🎯 ${s.objectif_charge}kg` : ''}</div>
        </div>
        <span class="perso-set-feeling">${feelEmoji[s.feeling] || ''}</span>
        <button class="perso-set-delete" onclick="event.stopPropagation(); deletePersoSet(${s.id})">🗑️</button>
      </div>
    `;
  }).join('');
}

window.deletePersoSet = async function(id) {
  if (!confirm('Supprimer cet exercice ?')) return;
  try {
    await api(`/perso/sets/${id}`, { method: 'DELETE' });
    await loadPersoSetsToday();
  } catch(e) { alert(e.message); }
};

window.openPersoProgress = async function(exerciseId, name) {
  try {
    const data = await api(`/perso/exercises/${exerciseId}/history`);
    document.getElementById('perso-progress-title').textContent = `📈 ${name}`;
    const sets = data.sets || [];
    // Render history
    const histEl = document.getElementById('perso-progress-history');
    histEl.innerHTML = sets.map(s => `
      <div class="perso-hist-row">
        <span class="perso-hist-date">${s.date}</span>
        <span>${s.charge}kg · ${s.series}×${s.reps}</span>
        <span>${ {facile:'😌',moyen:'😐',dur:'😰'}[s.feeling] || '' }</span>
      </div>
    `).join('');
    // Render chart
    renderPersoChart(sets.slice().reverse());
    document.getElementById('perso-progress-overlay').classList.remove('hidden');
  } catch(e) { alert(e.message); }
};

function renderPersoChart(sets) {
  const canvas = document.getElementById('perso-progress-chart');
  if (persoChart) { persoChart.destroy(); persoChart = null; }
  if (!sets.length) return;
  const ctx = canvas.getContext('2d');
  persoChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: sets.map(s => s.date),
      datasets: [{
        label: 'Charge (kg)',
        data: sets.map(s => s.charge),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,.15)',
        tension: .3,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#e2e8f0' } } },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,.1)' } },
        y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,.1)' } },
      },
    },
  });
}

function showToast(msg) {
  let t = document.getElementById('perso-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'perso-toast';
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#22c55e;color:white;padding:12px 24px;border-radius:8px;font-weight:600;z-index:10001;box-shadow:0 4px 12px rgba(0,0,0,.3);';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  setTimeout(() => { t.style.transition = 'opacity .5s'; t.style.opacity = '0'; }, 1800);
}

// ─── ACCOMPAGNEMENT (Directeur + Admin) ─────────────────────
let accompMonth = null;
let pilotageMonth = '';

async function loadAccompagnementTab() {
  const container = document.getElementById('accomp-container');
  if (!container) return;
  if (!accompMonth) accompMonth = currentMonth;

  // ── Vue leader : sa propre évaluation en lecture seule ──────
  if (isLeader() && !isDirector() && !isAdmin()) {
    await loadLeaderOwnAccompagnement(container);
    return;
  }

  // ── Vue directeur / admin : formulaire d'évaluation ─────────
  const managePanel = isAdmin() ? `
    <div class="accomp-manage-panel" id="accomp-manage-panel">
      <button class="accomp-manage-toggle" onclick="toggleAccompManage()">
        ⚙️ Gérer les coaches évalués <span id="accomp-manage-arrow">▼</span>
      </button>
      <div id="accomp-manage-body" class="hidden">
        <p class="accomp-manage-hint">Cochez les coaches qui apparaissent dans les évaluations.</p>
        <div id="accomp-manage-list" class="accomp-manage-list"></div>
      </div>
    </div>` : '';

  container.innerHTML = `
    <div class="accomp-header">
      <h2>🤝 Accompagnement — Évaluations Leaders</h2>
      <p class="accomp-subtitle">Évaluez chaque coach leader selon les 6 critères E.L.I.T.E.S.</p>
      <div class="accomp-nav">
        <button class="month-btn" onclick="accompChangeMonth(-1)">◀</button>
        <span id="accomp-month-label" class="month-label">${formatMonthLabel(accompMonth)}</span>
        <button class="month-btn" onclick="accompChangeMonth(1)">▶</button>
      </div>
    </div>
    ${managePanel}
    <div id="accomp-cards" class="accomp-cards-grid"></div>`;

  if (isAdmin()) renderAccompManageList();
  await renderAccompCards();
}

async function loadLeaderOwnAccompagnement(container) {
  const coachId = getMyCoachId();
  container.innerHTML = `
    <div class="accomp-header">
      <h2>🤝 Mon Accompagnement</h2>
      <p class="accomp-subtitle">Mes accompagnements selon les 6 critères E.L.I.T.E.S.</p>
      <div class="accomp-nav">
        <button class="month-btn" onclick="leaderAccompChangeMonth(-1)">◀</button>
        <span id="accomp-month-label" class="month-label">${formatMonthLabel(accompMonth)}</span>
        <button class="month-btn" onclick="leaderAccompChangeMonth(1)">▶</button>
      </div>
    </div>
    <div id="leader-accomp-content" style="padding:0 24px 40px;max-width:760px;margin:0 auto;"></div>`;
  await renderLeaderOwnAccompagnement(coachId);
}

window.leaderAccompChangeMonth = function(delta) {
  const [y, m] = accompMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  accompMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const lbl = document.getElementById('accomp-month-label');
  if (lbl) lbl.textContent = formatMonthLabel(accompMonth);
  renderLeaderOwnAccompagnement(getMyCoachId());
};

async function renderLeaderOwnAccompagnement(coachId) {
  const content = document.getElementById('leader-accomp-content');
  if (!content) return;
  content.innerHTML = '<p style="color:var(--text-muted);padding:20px 0">Chargement…</p>';
  try {
    const evalData = await api(`/accompagnement/evaluation/${coachId}/${accompMonth}`);
    content.innerHTML = renderLeaderEvaluation(evalData.evaluation, accompMonth);
    // Mettre à jour le badge header si c'est le mois courant
    if (accompMonth === currentMonth && evalData.evaluation) {
      const ed = evalData.evaluation.eval_data || {};
      const { total, max } = evalComputeScore(ed);
      updateHeaderElitesScore(total, max);
    }
  } catch(e) {
    content.innerHTML = `<p style="color:var(--danger)">Erreur : ${e.message}</p>`;
  }
}

// Chargement silencieux du score E.L.I.T.E.S pour le header (leaders)
async function fetchHeaderElitesScore() {
  if (!isLeader() || isDirector() || isAdmin()) return;
  try {
    const coachId = getMyCoachId();
    if (!coachId) return;
    const evalData = await api(`/accompagnement/evaluation/${coachId}/${currentMonth}`);
    if (evalData.evaluation) {
      const ed = evalData.evaluation.eval_data || {};
      const { total, max } = evalComputeScore(ed);
      updateHeaderElitesScore(total, max);
    }
  } catch(_) {}
}

window.toggleAccompManage = function() {
  const body = document.getElementById('accomp-manage-body');
  const arrow = document.getElementById('accomp-manage-arrow');
  if (!body) return;
  body.classList.toggle('hidden');
  if (arrow) arrow.textContent = body.classList.contains('hidden') ? '▼' : '▲';
};

async function renderAccompManageList() {
  const listEl = document.getElementById('accomp-manage-list');
  if (!listEl) return;
  // Use already-loaded coaches list
  const eligible = coaches.filter(c => !c.archived && c.role === 'coach').sort((a,b) => a.name.localeCompare(b.name));
  listEl.innerHTML = eligible.map(c => `
    <label class="accomp-manage-row">
      <input type="checkbox" class="accomp-manage-chk" data-id="${c.id}"
        ${c.in_accompagnement ? 'checked' : ''}
        onchange="accompToggleCoach(${c.id}, this.checked)">
      <span class="accomp-manage-name">${c.name}</span>
      <span class="accomp-manage-studio">${c.studio || '—'}</span>
    </label>`).join('');
}

window.accompToggleCoach = async function(coachId, checked) {
  try {
    await api(`/coaches/${coachId}`, { method: 'PATCH', body: { in_accompagnement: checked } });
    // Update local coaches cache
    const c = coaches.find(x => x.id === coachId);
    if (c) c.in_accompagnement = checked ? 1 : 0;
    // Refresh cards without re-rendering the whole tab
    await renderAccompCards();
  } catch(e) {
    alert('Erreur : ' + e.message);
  }
};

window.accompChangeMonth = function(delta) {
  const [y, m] = accompMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  accompMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const lbl = document.getElementById('accomp-month-label');
  if (lbl) lbl.textContent = formatMonthLabel(accompMonth);
  renderAccompCards();
};

// ── Scoring helpers ──────────────────────────────────────────
function evalComputeScore(evalData) {
  // evalData = { engagement: { super: bool, sub: [bool,bool,bool,bool] }, … }
  let total = 0;
  const perCrit = {};
  for (const c of EVAL_CRITERIA) {
    const d = evalData?.[c.key] || {};
    const s = (d.super ? 5 : 0) + (d.sub || []).filter(Boolean).length;
    perCrit[c.key] = s;
    total += s;
  }
  return { total, perCrit, max: EVAL_CRITERIA.length * 9 };
}

// ── Axes prioritaires (Directeur — cockpit leaders) ──────────
// accompScore : 0-100 (% évaluation M-1) ou null
function computeAxesPrioritaires(evalData, accompScore) {
  if (!evalData) return [];
  const { total } = evalComputeScore(evalData);
  if (total < 2) return []; // Évaluation vide ou non remplie

  // Nombre d'axes selon le niveau d'accompagnement
  let maxAxes;
  if      (accompScore === null) maxAxes = 3;  // non évalué → 3 par défaut
  else if (accompScore < 40)     maxAxes = 4;  // Accompagnement prioritaire
  else if (accompScore < 70)     maxAxes = 3;  // À surveiller
  else if (accompScore < 90)     maxAxes = 2;  // Dans les normes
  else                           maxAxes = 1;  // > 90 % — 1 axe de perfectionnement

  // Traduction catégorie → axe managérial
  const AXES = {
    succes:     "Renforcer l’impact business du leader",
    team:       "Structurer le management d’équipe",
    eclat:      "Faire remonter l’image et les standards",
    infos:      "Mieux exploiter la connaissance client",
    engagement: "Maîtriser la rétention clients",
    loyal:      "Renforcer la fidélisation client",
  };

  // Score par catégorie + statut du super indicateur
  const scores = EVAL_CRITERIA.map(c => {
    const d = evalData[c.key] || {};
    const superChecked = !!d.super;
    const score = (superChecked ? 5 : 0) + (d.sub || []).filter(Boolean).length;
    return { key: c.key, score, superChecked, pct: score / 9 };
  });

  // Tri : super NON coché en premier (priorité absolue), puis score croissant
  scores.sort((a, b) => {
    if (!a.superChecked && b.superChecked) return -1;
    if (a.superChecked && !b.superChecked) return 1;
    return a.score - b.score;
  });

  // Exclure les catégories déjà très fortes (≥ 90 %) sauf si on cherche 1 seul axe
  const candidates = scores.filter(s => s.pct < 0.90);

  return candidates.slice(0, maxAxes).map(t => AXES[t.key]).filter(Boolean);
}

function _evalCritHtml(coachId, c, ed) {
  // ed = { super: bool, sub: [bool,bool,bool,bool] }
  const superChk = ed?.super ? 'checked' : '';
  const subBoxes = c.sub.map((label, i) => `
    <label class="accomp-sub-row">
      <input type="checkbox" class="accomp-chk" ${ed?.sub?.[i] ? 'checked' : ''}
        onchange="accompRecompute(${coachId})">
      <span>${label}</span>
    </label>`).join('');

  const pts = (ed?.super ? 5 : 0) + (ed?.sub || []).filter(Boolean).length;
  return `
  <div class="accomp-criterion" id="accomp-crit-${coachId}-${c.key}">
    <div class="accomp-criterion-head">
      <span class="accomp-criterion-title">${c.icon} ${c.label}</span>
      <span class="accomp-crit-pts" id="accomp-pts-${coachId}-${c.key}">${pts}/9</span>
    </div>
    <label class="accomp-super-row">
      <input type="checkbox" class="accomp-chk accomp-super-chk" ${superChk}
        onchange="accompRecompute(${coachId})">
      <span class="accomp-super-label">⭐ Super indicateur — ${c.superLabel}</span>
      <span class="accomp-super-pts">5 pts</span>
    </label>
    <div class="accomp-sub-list">${subBoxes}</div>
  </div>`;
}

async function renderAccompCards() {
  const grid = document.getElementById('accomp-cards');
  if (!grid) return;
  grid.innerHTML = '<div class="accomp-loading">Chargement…</div>';
  try {
    const data = await api(`/accompagnement/${accompMonth}`);
    const leaders = data.leaders || [];
    if (leaders.length === 0) {
      grid.innerHTML = '<div class="accomp-empty">Aucun coach évalué activé.</div>';
      return;
    }

    grid.innerHTML = leaders.map(l => {
      const ev = l.evaluation || {};
      const ed = ev.eval_data || {};
      const { total, max } = evalComputeScore(ed);
      const pct = max ? Math.round(total / max * 100) : 0;

      const criteriaHtml = EVAL_CRITERIA.map(c => _evalCritHtml(l.id, c, ed[c.key])).join('');

      return `
      <div class="accomp-card" id="accomp-card-${l.id}">
        <div class="accomp-card-head">
          <div class="accomp-coach-info">
            <span class="accomp-coach-name">${l.name}</span>
            <span class="accomp-coach-studio">${l.studio || '—'}</span>
          </div>
          <div class="accomp-total-badge" id="accomp-total-${l.id}">
            <span class="accomp-total-pts">${pct}</span>
            <span class="accomp-total-max">%</span>
            <div class="accomp-total-bar" style="--pct:${pct}%"></div>
          </div>
        </div>
        <div class="accomp-criteria-list" id="accomp-crits-${l.id}">${criteriaHtml}</div>
        <div class="accomp-global-comment-block">
          <label>💬 Remarques</label>
          <textarea id="accomp-remarques-${l.id}" class="accomp-textarea" rows="3"
            placeholder="Observations générales, axes de progrès…">${ev.remarques || ''}</textarea>
        </div>
        <div class="accomp-card-foot">
          ${ev.updated_at
            ? `<span class="accomp-saved-at">Mis à jour le ${new Date(ev.updated_at).toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' })}</span>`
            : '<span class="accomp-saved-at">Non renseigné</span>'}
          <button class="btn-primary accomp-save-btn" onclick="accompSave(${l.id})">💾 Enregistrer</button>
        </div>
      </div>`;
    }).join('');

  } catch(e) {
    grid.innerHTML = `<div class="accomp-empty" style="color:var(--danger)">Erreur : ${e.message}</div>`;
  }
}

// Recompute score display when a checkbox changes
window.accompRecompute = function(coachId) {
  const card = document.getElementById(`accomp-card-${coachId}`);
  if (!card) return;
  const ed = _readEvalData(coachId, card);
  const { total, perCrit, max } = evalComputeScore(ed);
  // Update per-criterion pts
  for (const c of EVAL_CRITERIA) {
    const el = document.getElementById(`accomp-pts-${coachId}-${c.key}`);
    if (el) el.textContent = `${perCrit[c.key]}/9`;
  }
  // Update total badge
  const badge = document.getElementById(`accomp-total-${coachId}`);
  if (badge) {
    const pct = Math.round(total/max*100);
    badge.querySelector('.accomp-total-pts').textContent = pct;
    badge.style.setProperty('--pct', pct + '%');
    const bar = badge.querySelector('.accomp-total-bar');
    if (bar) bar.style.width = pct + '%';
  }
};

function _readEvalData(coachId, card) {
  const ed = {};
  for (const c of EVAL_CRITERIA) {
    const critEl = card.querySelector(`#accomp-crit-${coachId}-${c.key}`);
    if (!critEl) continue;
    const chks = critEl.querySelectorAll('.accomp-chk');
    const superChk = critEl.querySelector('.accomp-super-chk');
    const subChks = [...critEl.querySelectorAll('.accomp-sub-row .accomp-chk')];
    ed[c.key] = {
      super: superChk?.checked || false,
      sub: subChks.map(ch => ch.checked),
    };
  }
  return ed;
}

window.accompSave = async function(coachId) {
  const card = document.getElementById(`accomp-card-${coachId}`);
  if (!card) return;
  const eval_data = _readEvalData(coachId, card);
  const remarques = document.getElementById(`accomp-remarques-${coachId}`)?.value || '';
  const btn = card.querySelector('.accomp-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    await api(`/accompagnement/${accompMonth}/${coachId}`, { method: 'PUT', body: { eval_data, remarques } });
    const foot = card.querySelector('.accomp-saved-at');
    if (foot) foot.textContent = `Mis à jour le ${new Date().toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' })}`;
    showToast('✅ Évaluation enregistrée');
  } catch(e) {
    alert('Erreur : ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Enregistrer'; }
  }
};

// ─── PILOTAGE (Leader only) ──────────────────────────────────

async function loadPilotageTab() {
  const container = document.getElementById('pilotage-container');
  if (!container) return;

  const studio = getMyStudio();
  if (!studio) {
    container.innerHTML = '<p class="empty-state">Studio non défini pour ton compte.</p>';
    return;
  }

  if (!pilotageMonth) {
    const now = new Date();
    pilotageMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  }

  container.innerHTML = `
    <div class="pilotage-header">
      <div>
        <h2 style="margin:0;font-size:1.3rem">🎯 Pilotage — ${studio}</h2>
        <p style="margin:4px 0 0;font-size:.85rem;color:var(--text-muted)">Vue agrégée du club sur le mois</p>
      </div>
      <div class="pilotage-month-nav">
        <button class="icon-btn" onclick="pilotageNavMonth(-1)">‹</button>
        <span id="pilotage-month-label">${formatMonthLabel(pilotageMonth)}</span>
        <button class="icon-btn" onclick="pilotageNavMonth(1)">›</button>
      </div>
    </div>
    <div id="pilotage-content"><div class="loading-spinner"></div></div>
  `;

  await renderPilotageContent(studio, pilotageMonth);
}

async function pilotageNavMonth(dir) {
  pilotageMonth = dir === -1 ? prevMonth(pilotageMonth) : nextMonth(pilotageMonth);
  const label = document.getElementById('pilotage-month-label');
  if (label) label.textContent = formatMonthLabel(pilotageMonth);
  const studio = getMyStudio();
  if (studio) await renderPilotageContent(studio, pilotageMonth);
}

async function renderPilotageContent(studio, month) {
  const content = document.getElementById('pilotage-content');
  if (!content) return;
  content.innerHTML = '<div class="loading-spinner"></div>';

  let data;
  try {
    data = await api(`/pilotage/${encodeURIComponent(studio)}/${month}`);
  } catch(e) {
    content.innerHTML = `<p class="empty-state">Erreur chargement : ${e.message}</p>`;
    return;
  }

  const { club_totals: ct, coaches, days_elapsed, days_in_month, days_remaining,
          club_ess_completion, total_active_coach_days, expected_coach_days } = data;

  // ── Objectifs implicites ─────────────────────────────────
  const OBJ = {
    references:  10,
    avis_google:  3,
    temoignages:  2,
    relances_nf:  5,
    surpack:   null,
    ess_completion: 80,
  };

  // Projection fin de mois
  function project(val) {
    if (!days_elapsed) return 0;
    return Math.round(val / days_elapsed * days_in_month);
  }

  function statusColor(val, obj) {
    if (obj === null) return val > 0 ? 'ok' : 'warn';
    const pct = obj > 0 ? val / obj * 100 : 0;
    if (pct >= 100) return 'great';
    if (pct >= 70)  return 'ok';
    if (pct >= 40)  return 'warn';
    return 'bad';
  }

  function statusEss(pct) {
    if (pct === null || pct === undefined) return 'warn';
    if (pct >= 90) return 'great';
    if (pct >= 75) return 'ok';
    if (pct >= 50) return 'warn';
    return 'bad';
  }

  function phrase(key, val, obj) {
    if (key === 'references') {
      if (val === 0) return 'Aucune prise de référence ce mois-ci';
      if (obj && val < obj) return `Seulement ${val} référence${val>1?'s':''} enregistrée${val>1?'s':''}`;
      if (obj && val >= obj) return 'Objectif références atteint';
      return `${val} prises de référence enregistrées`;
    }
    if (key === 'avis_google') {
      if (val === 0) return 'Aucun avis Google ce mois-ci';
      if (obj && val < obj) return `Seulement ${val} avis Google — objectif non sécurisé`;
      return `${val} avis Google récoltés`;
    }
    if (key === 'temoignages') {
      if (val === 0) return 'Aucun témoignage récolté ce mois-ci';
      if (obj && val < obj) return `Seulement ${val} témoignage${val>1?'s':''} — à renforcer`;
      return `${val} témoignage${val>1?'s':''} enregistré${val>1?'s':''}`;
    }
    if (key === 'relances_nf') {
      if (val === 0) return 'Aucun call non fréquentant ce mois-ci';
      if (obj && val < obj) return `${val} call${val>1?'s':''} NF — activité insuffisante`;
      return `${val} calls non fréquentants réalisés`;
    }
    if (key === 'surpack') {
      if (val === 0) return 'Aucun surpack ce mois-ci';
      return `Surpack à ${fmt(val)} €`;
    }
    if (key === 'ess_completion') {
      if (val === null) return 'Données insuffisantes';
      if (val >= 90) return 'Essentiels très bien complétés';
      if (val >= 75) return `Essentiels complétés à ${val} %`;
      if (val >= 50) return `Essentiels complétés à ${val} % — à améliorer`;
      return `Essentiels complétés à ${val} % — niveau insuffisant`;
    }
    return '';
  }

  // ── BLOC 1 : Synthèse immédiate ──────────────────────────
  const synthCards = [
    { key: 'references',     val: ct.references||0,   obj: OBJ.references,   label: 'Références', icon: '📋' },
    { key: 'avis_google',    val: ct.avis_google||0,   obj: OBJ.avis_google,   label: 'Avis Google', icon: '⭐' },
    { key: 'temoignages',    val: ct.temoignages||0,   obj: OBJ.temoignages,   label: 'Témoignages', icon: '💬' },
    { key: 'relances_nf',    val: ct.relances_nf||0,   obj: OBJ.relances_nf,   label: 'Calls NF', icon: '📞' },
    { key: 'surpack',        val: ct.surpack||0,       obj: null,              label: 'Surpack', icon: '💰', unit: '€' },
    { key: 'ess_completion', val: club_ess_completion, obj: OBJ.ess_completion, label: 'Essentiels', icon: '✅', unit: '%' },
  ];

  const synthHtml = synthCards.map(c => {
    const status = c.key === 'ess_completion' ? statusEss(c.val) : statusColor(c.val, c.obj);
    const displayVal = c.key === 'ess_completion' ? (c.val !== null ? c.val + '%' : '—')
                     : c.unit === '€' ? fmt(c.val) + ' €'
                     : c.val;
    const manque = (c.obj !== null && c.val < c.obj) ? c.obj - c.val : null;
    const metaHtml = c.obj !== null
      ? `<div class="pilotage-card-meta">Objectif : ${c.obj}${c.unit||''} ${manque !== null ? `· Manque : <strong>${manque}</strong>` : '· <strong style="color:#22c55e">✓</strong>'}</div>`
      : '';
    return `
      <div class="pilotage-card ${status}">
        <div class="pilotage-card-label">${c.icon} ${c.label}</div>
        <div class="pilotage-card-value">${displayVal}</div>
        ${metaHtml}
        <div class="pilotage-card-phrase">${phrase(c.key, c.val, c.obj)}</div>
      </div>`;
  }).join('');

  // ── BLOC 2 : Ce qui manque encore ───────────────────────
  const alerts = [];
  for (const c of synthCards) {
    if (c.key === 'ess_completion') {
      if (c.val !== null && c.val < 80) {
        const manque = 80 - c.val;
        alerts.push({
          label: 'Essentiels du jour',
          val: `${c.val}%`,
          target: '80%',
          manque: `+${manque}% à gagner`,
          color: c.val < 50 ? 'red' : 'orange'
        });
      }
      continue;
    }
    if (c.obj !== null && c.val < c.obj) {
      alerts.push({
        label: c.label,
        val: `${c.unit === '€' ? fmt(c.val)+' €' : c.val}`,
        target: `${c.obj}${c.unit||''}`,
        manque: `manque ${c.obj - c.val}`,
        color: c.val === 0 ? 'red' : 'orange'
      });
    } else if (c.obj === null && c.val === 0 && c.key !== 'surpack') {
      alerts.push({ label: c.label, val: '0', target: null, manque: 'aucune saisie', color: 'red' });
    }
  }

  // Alertes saisie essentiels par item
  const essYesno = [
    { key: 'check_club', label: 'Tour club' },
    { key: 'story', label: 'Stories' },
    { key: 'fichier_client', label: 'Fiches clients' },
    { key: 'cr_journee', label: 'CR journée' },
  ];
  if (total_active_coach_days > 0) {
    for (const ey of essYesno) {
      const val = ct[ey.key] || 0;
      const pct = Math.round(val / total_active_coach_days * 100);
      if (pct < 70) {
        alerts.push({
          label: ey.label,
          val: `${pct}% des journées`,
          target: '70%+',
          manque: 'trop souvent non validé',
          color: pct < 40 ? 'red' : 'orange'
        });
      }
    }
  }

  const alertsHtml = alerts.length === 0
    ? '<div class="pilotage-alert green"><span class="pilotage-alert-label">✅ Rien à signaler — club bien piloté ce mois-ci</span></div>'
    : alerts.map(a => `
      <div class="pilotage-alert ${a.color}">
        <span class="pilotage-alert-label">${a.label}</span>
        <span class="pilotage-alert-val">
          ${a.val}${a.target ? ` / obj. ${a.target}` : ''} — <em>${a.manque}</em>
        </span>
      </div>`).join('');

  // ── BLOC 3 : Dynamique du mois ───────────────────────────
  const trendItems = [
    { key: 'references', label: 'Références', icon: '📋', obj: OBJ.references },
    { key: 'avis_google', label: 'Avis Google', icon: '⭐', obj: OBJ.avis_google },
    { key: 'temoignages', label: 'Témoignages', icon: '💬', obj: OBJ.temoignages },
    { key: 'relances_nf', label: 'Calls NF', icon: '📞', obj: OBJ.relances_nf },
    { key: 'surpack', label: 'Surpack', icon: '💰', obj: null, unit: '€' },
  ];

  const trendHtml = trendItems.map(t => {
    const val = ct[t.key] || 0;
    const proj = project(val);
    let status, statusLabel;
    if (t.obj === null) {
      status = val > 0 ? 'ok' : 'warn';
      statusLabel = val > 0 ? 'Rythme satisfaisant' : 'Aucune activité';
    } else {
      const projPct = t.obj > 0 ? proj / t.obj * 100 : 0;
      if (projPct >= 110) { status = 'great'; statusLabel = 'En avance'; }
      else if (projPct >= 90) { status = 'ok'; statusLabel = 'Dans le rythme'; }
      else if (projPct >= 60) { status = 'warn'; statusLabel = 'Léger retard'; }
      else { status = 'bad'; statusLabel = 'En retard'; }
    }
    const projDisplay = t.unit === '€' ? fmt(proj)+' €' : proj;
    const objDisplay = t.obj !== null ? (t.unit === '€' ? fmt(t.obj)+' €' : t.obj) : null;

    const trendPhrase = days_remaining === 0
      ? `Résultat final : ${t.unit === '€' ? fmt(val)+' €' : val}`
      : t.obj !== null
        ? `Projection : ${projDisplay} ${proj >= t.obj ? '✓' : '— obj. '+objDisplay}`
        : `Projection : ${projDisplay}`;

    return `
      <div class="pilotage-trend-card ${status}">
        <div style="font-size:.75rem;font-weight:700;text-transform:uppercase;color:var(--text-muted)">${t.icon} ${t.label}</div>
        <div style="font-size:1.3rem;font-weight:700;margin:4px 0">${t.unit === '€' ? fmt(val)+' €' : val}</div>
        <div style="font-size:.78rem;color:var(--text-secondary)">${trendPhrase}</div>
        <div style="margin-top:6px">
          <span class="pilotage-status-badge ${status}">${statusLabel}</span>
        </div>
      </div>`;
  }).join('');

  // ── BLOC 4 : Contribution de l'équipe ───────────────────
  const contribRows = coaches.map(c => {
    const t = c.totals || {};
    const essDisp = c.ess_completion !== null ? c.ess_completion + '%' : '—';
    const essClass = c.ess_completion === null ? '' : c.ess_completion >= 80 ? 'great' : c.ess_completion >= 60 ? 'ok' : 'bad';
    return `
      <tr>
        <td><strong>${c.name}</strong>${c.is_leader ? ' <span style="font-size:.7rem;color:var(--primary)">Leader</span>' : ''}</td>
        <td class="text-right">${c.active_days}j</td>
        <td class="text-right">${t.references||0}</td>
        <td class="text-right">${t.avis_google||0}</td>
        <td class="text-right">${t.temoignages||0}</td>
        <td class="text-right">${t.relances_nf||0}</td>
        <td class="text-right">${t.surpack ? fmt(t.surpack)+'€' : '0€'}</td>
        <td class="text-right"><span class="pilotage-contrib-badge ${essClass}">${essDisp}</span></td>
      </tr>`;
  }).join('');

  const contribHtml = `
    <div style="overflow-x:auto">
      <table class="pilotage-contrib-table sortable-table">
        <thead>
          <tr>
            <th onclick="sortTableByTh(this)">Coach</th><th class="text-right" onclick="sortTableByTh(this)">Journées</th>
            <th class="text-right" onclick="sortTableByTh(this)">Réf.</th><th class="text-right" onclick="sortTableByTh(this)">Avis G.</th>
            <th class="text-right" onclick="sortTableByTh(this)">Témoi.</th><th class="text-right" onclick="sortTableByTh(this)">Calls NF</th>
            <th class="text-right" onclick="sortTableByTh(this)">Surpack</th><th class="text-right" onclick="sortTableByTh(this)">Essentiels</th>
          </tr>
        </thead>
        <tbody>${contribRows}</tbody>
      </table>
    </div>`;

  // ── BLOC 5 : Fiabilité de saisie ─────────────────────────
  const saisieRate = expected_coach_days > 0
    ? Math.round(total_active_coach_days / expected_coach_days * 100) : null;
  const saisieColor = saisieRate === null ? 'warn'
    : saisieRate >= 85 ? 'great' : saisieRate >= 65 ? 'ok' : saisieRate >= 40 ? 'warn' : 'bad';

  const inactivCoaches = coaches.filter(c => c.active_days === 0);
  const lowCoaches = coaches.filter(c => c.active_days > 0 && c.active_days < Math.max(1, Math.floor(days_elapsed * 0.5)));

  const fiabHtml = `
    <div class="pilotage-fiab-row">
      <div class="pilotage-fiab-item ${saisieColor}">
        <div class="pilotage-card-label">📅 Journées saisies</div>
        <div class="pilotage-card-value">${total_active_coach_days} <span style="font-size:1rem;color:var(--text-muted)">/ ${expected_coach_days}</span></div>
        <div class="pilotage-card-phrase">${saisieRate !== null ? saisieRate+'% de complétion' : '—'}</div>
      </div>
      <div class="pilotage-fiab-item ${club_ess_completion !== null ? statusEss(club_ess_completion) : 'warn'}">
        <div class="pilotage-card-label">✅ Essentiels globaux</div>
        <div class="pilotage-card-value">${club_ess_completion !== null ? club_ess_completion+'%' : '—'}</div>
        <div class="pilotage-card-phrase">Taux de complétion des 4 essentiels</div>
      </div>
    </div>
    ${inactivCoaches.length > 0 ? `<div class="pilotage-alert red" style="margin-top:8px"><span class="pilotage-alert-label">⚠️ Sans aucune saisie ce mois</span><span class="pilotage-alert-val">${inactivCoaches.map(c=>c.name).join(', ')}</span></div>` : ''}
    ${lowCoaches.length > 0 ? `<div class="pilotage-alert orange" style="margin-top:8px"><span class="pilotage-alert-label">📉 Saisie insuffisante</span><span class="pilotage-alert-val">${lowCoaches.map(c=>c.name+' ('+c.active_days+'j)').join(', ')}</span></div>` : ''}
  `;

  // ── BONUS : 3 priorités automatiques ─────────────────────
  const priorities = [...alerts].sort((a, b) => (a.color === 'red' ? 0 : 1) - (b.color === 'red' ? 0 : 1)).slice(0, 3);
  const prioritiesHtml = priorities.length === 0
    ? '<div style="color:#22c55e;font-weight:600">✅ Aucune priorité urgente — club bien piloté</div>'
    : priorities.map((p, i) => `
        <div class="pilotage-priority-item">
          <span style="font-size:1.1rem">${['🥇','🥈','🥉'][i]}</span>
          <span>${p.label} — ${p.manque}</span>
        </div>`).join('');

  // ── Assemblage final ──────────────────────────────────────
  content.innerHTML = `
    <div class="pilotage-priority-box">
      <div style="font-weight:700;font-size:.9rem;margin-bottom:10px;letter-spacing:.04em">🚨 TOP 3 PRIORITÉS DU MOIS</div>
      ${prioritiesHtml}
    </div>

    <div class="pilotage-section">
      <h3 class="pilotage-section-title">📊 Synthèse immédiate</h3>
      <div class="pilotage-cards-grid">${synthHtml}</div>
    </div>

    <div class="pilotage-section">
      <h3 class="pilotage-section-title">⚠️ Ce qui manque encore</h3>
      <div class="pilotage-alerts-list">${alertsHtml}</div>
    </div>

    <div class="pilotage-section">
      <h3 class="pilotage-section-title">📈 Dynamique du mois</h3>
      <p style="font-size:.8rem;color:var(--text-muted);margin-bottom:10px">Projection basée sur ${days_elapsed} jour${days_elapsed>1?'s':''} écoulé${days_elapsed>1?'s':''} sur ${days_in_month}</p>
      <div class="pilotage-trend-grid">${trendHtml}</div>
    </div>

    <div class="pilotage-section">
      <h3 class="pilotage-section-title">👥 Contribution de l’équipe</h3>
      ${contribHtml}
    </div>

    <div class="pilotage-section">
      <h3 class="pilotage-section-title">🔍 Fiabilité de saisie</h3>
      ${fiabHtml}
    </div>
  `;
}

// ─── COCKPIT RÉSEAU (Directeur) ─────────────────────────────
function renderCockpitReseau(data, accompData) {
  if (!data || !data.studios) return '';

  // Construire un map nom → score% accompagnement + eval_data (mois précédent)
  const accompScoreMap = {};
  const accompEvalMap  = {};
  if (accompData && accompData.leaders) {
    for (const l of accompData.leaders) {
      const ed = l.evaluation?.eval_data || {};
      const { total, max } = evalComputeScore(ed);
      accompScoreMap[l.name] = max ? Math.round(total / max * 100) : null;
      accompEvalMap[l.name]  = ed;
    }
  }

  const studios = data.studios.filter(s => !s.no_data);

  // ── Helpers ──────────────────────────────────────────────
  function contribStatus(s) {
    const val = s.taux_contribution;
    if (val === null) {
      // Fallback: CA achievement
      if (s.ca_achievement === null) return 'unknown';
      if (s.ca_achievement >= 100) return 'green';
      if (s.ca_achievement >= 90) return 'orange';
      return 'red';
    }
    if (val > 30) return 'green';
    if (val >= 27) return 'orange';
    return 'red';
  }

  function contribVal(s) {
    if (s.taux_contribution !== null) return s.taux_contribution.toFixed(1) + '%';
    if (s.ca_achievement !== null) return s.ca_achievement.toFixed(0) + '% obj.CA';
    if (s.ca !== null) return fmt(s.ca) + ' €';
    return '—';
  }

  function contribLabel(s) {
    if (s.taux_contribution !== null) return 'Contribution';
    if (s.ca_achievement !== null) return 'Atteinte CA';
    return 'CA';
  }

  function trendArrow(current, prev) {
    if (current === null || prev === null) return '';
    if (current > prev + 0.5) return '<span class="cockpit-trend up">↑</span>';
    if (current < prev - 0.5) return '<span class="cockpit-trend down">↓</span>';
    return '<span class="cockpit-trend neutral">→</span>';
  }

  function statusColor(status) {
    return status === 'green' ? '#22c55e' : status === 'orange' ? '#f59e0b' : status === 'red' ? '#ef4444' : '#94a3b8';
  }

  // Résiliation
  function resilStatus(v) {
    if (v === null) return 'unknown';
    if (v < 7) return 'green';
    if (v <= 8) return 'orange';
    return 'red';
  }

  // NF
  function nfStatus(v) {
    if (v === null) return 'unknown';
    if (v < 10) return 'green';
    if (v <= 12) return 'orange';
    return 'red';
  }

  // Infos qualité fichier
  function infosStatus(v) {
    if (v === null) return 'unknown';
    if (v >= 80) return 'green';
    if (v >= 65) return 'orange';
    return 'red';
  }

  // Team (CR journée rate)
  function teamStatus(v) {
    if (v === null) return 'unknown';
    if (v >= 80) return 'green';
    if (v >= 60) return 'orange';
    return 'red';
  }

  // Eclat (taux occupation proxy)
  function eclatStatus(v) {
    if (v === null) return 'unknown';
    if (v >= 80) return 'green';
    if (v >= 75) return 'orange';
    return 'red';
  }

  function badge(status, label) {
    const colors = { green: '#22c55e', orange: '#f59e0b', red: '#ef4444', unknown: '#94a3b8' };
    const c = colors[status] || '#94a3b8';
    return `<span class="cockpit-badge" style="background:${c}22;color:${c};border:1px solid ${c}55">${label}</span>`;
  }

  function countByStatus(arr, fn) {
    return {
      green: arr.filter(s => fn(s) === 'green').length,
      orange: arr.filter(s => fn(s) === 'orange').length,
      red: arr.filter(s => fn(s) === 'red').length,
      unknown: arr.filter(s => fn(s) === 'unknown').length,
    };
  }

  // ── BLOC 1 : Contribution par studio ─────────────────────
  // Tri décroissant : plus grosse contribution en premier, valeurs nulles à la fin
  function contribSortVal(s) {
    if (s.taux_contribution !== null) return s.taux_contribution;
    if (s.ca_achievement !== null) return s.ca_achievement - 1000; // fallback en bas
    return -Infinity;
  }
  const studiosSorted = [...studios].sort((a, b) => contribSortVal(b) - contribSortVal(a));

  const contribCounts = countByStatus(studios, contribStatus);

  // Stats réseau
  const validContrib = studios.filter(s => s.taux_contribution !== null);
  const avgContrib = validContrib.length > 0
    ? (validContrib.reduce((sum, s) => sum + s.taux_contribution, 0) / validContrib.length).toFixed(1)
    : null;

  const validCA = studios.filter(s => s.ca_achievement !== null);
  const avgCAach = validCA.length > 0
    ? (validCA.reduce((sum, s) => sum + s.ca_achievement, 0) / validCA.length).toFixed(0) : null;

  const worstStudio = studiosSorted[0];
  const bestStudio = [...studiosSorted].reverse()[0];

  const networkSummaryHtml = `
    <div class="cockpit-network-summary">
      <div class="cockpit-ns-item">
        <div class="cockpit-ns-val" style="color:#22c55e">${contribCounts.green}</div>
        <div class="cockpit-ns-label">Studios verts</div>
      </div>
      <div class="cockpit-ns-item">
        <div class="cockpit-ns-val" style="color:#f59e0b">${contribCounts.orange}</div>
        <div class="cockpit-ns-label">Studios oranges</div>
      </div>
      <div class="cockpit-ns-item">
        <div class="cockpit-ns-val" style="color:#ef4444">${contribCounts.red}</div>
        <div class="cockpit-ns-label">Studios rouges</div>
      </div>
      ${avgContrib !== null ? `<div class="cockpit-ns-item"><div class="cockpit-ns-val">${avgContrib}%</div><div class="cockpit-ns-label">Contrib. moy. réseau</div></div>` : avgCAach !== null ? `<div class="cockpit-ns-item"><div class="cockpit-ns-val">${avgCAach}%</div><div class="cockpit-ns-label">Atteinte CA moy.</div></div>` : ''}
      ${bestStudio ? `<div class="cockpit-ns-item"><div class="cockpit-ns-val">🏆 ${bestStudio.name}</div><div class="cockpit-ns-label">Meilleur studio</div></div>` : ''}
      ${worstStudio && contribStatus(worstStudio) === 'red' ? `<div class="cockpit-ns-item"><div class="cockpit-ns-val" style="color:#ef4444">⚠️ ${worstStudio.name}</div><div class="cockpit-ns-label">Studio en difficulté</div></div>` : ''}
    </div>`;

  // Phrase de synthèse
  const underTarget = contribCounts.red + contribCounts.orange;
  const synthPhrase = underTarget > 0
    ? `<p class="cockpit-synth-phrase">${underTarget} studio${underTarget>1?'s sont':'est'} sous la cible de contribution${worstStudio && contribStatus(worstStudio) === 'red' ? ` — ${worstStudio.name} est le plus en difficulté` : ''}</p>`
    : `<p class="cockpit-synth-phrase" style="color:#22c55e">✅ Tous les studios atteignent leur cible de contribution</p>`;

  const contribCardsHtml = studiosSorted.map(s => {
    const st = contribStatus(s);
    const c = statusColor(st);
    const prev = s.prev;
    const prevContrib = s.taux_contribution !== null ? prev?.taux_contribution : prev?.ca_achievement != null ? prev.ca_achievement : null;
    const currForTrend = s.taux_contribution !== null ? s.taux_contribution : s.ca_achievement;
    const arrow = trendArrow(currForTrend, prevContrib);

    return `
      <div class="cockpit-studio-card" style="border-left:4px solid ${c}" onclick="cockpitOpenStudio('${s.name}')">
        <div class="cockpit-studio-header">
          <span class="cockpit-studio-name">${s.name}</span>
          ${badge(st, st === 'green' ? '✅ OK' : st === 'orange' ? '⚠️ Vigilance' : st === 'red' ? '🚨 Alerte' : '—')}
        </div>
        <div class="cockpit-studio-val" style="color:${c}">${contribVal(s)} ${arrow}</div>
        <div class="cockpit-studio-meta">${contribLabel(s)}${s.ca !== null ? ` · CA ${fmt(s.ca)} €` : ''}${s.ca_objectif ? ` / obj. ${fmt(s.ca_objectif)} €` : ''}</div>
      </div>`;
  }).join('');

  // ── BLOC 2 : Diagnostic réseau ─────────────────────────────
  function diagCard(icon, label, statusFn, valueFn, unitStr, threshold) {
    const counts = countByStatus(studios, statusFn);
    const redStudios = studios.filter(s => statusFn(s) === 'red');
    const orangeStudios = studios.filter(s => statusFn(s) === 'orange');
    const alertStudios = [...redStudios, ...orangeStudios];
    const networkStatus = redStudios.length > 2 ? 'red' : redStudios.length > 0 || orangeStudios.length > 1 ? 'orange' : 'green';

    const phrase = redStudios.length > 0
      ? `${redStudios.length} studio${redStudios.length>1?'s sont':'est'} en alerte sur ${label.toLowerCase()}`
      : orangeStudios.length > 0
      ? `${orangeStudios.length} studio${orangeStudios.length>1?'s':''}  à surveiller`
      : `Réseau dans les normes sur ${label.toLowerCase()}`;

    return `
      <div class="cockpit-diag-card">
        <div class="cockpit-diag-header">
          <span class="cockpit-diag-icon">${icon}</span>
          <span class="cockpit-diag-label">${label}</span>
          ${badge(networkStatus, networkStatus === 'green' ? 'OK réseau' : networkStatus === 'orange' ? 'À surveiller' : 'En alerte')}
        </div>
        <div class="cockpit-diag-counts">
          <span style="color:#22c55e">●&nbsp;${counts.green}</span>
          <span style="color:#f59e0b">●&nbsp;${counts.orange}</span>
          <span style="color:#ef4444">●&nbsp;${counts.red}</span>
          <span style="color:#94a3b8;font-size:.75rem">${threshold}</span>
        </div>
        ${alertStudios.length > 0 ? `<div class="cockpit-diag-studios">${alertStudios.map(s => `<span class="cockpit-diag-studio ${statusFn(s)}">${s.name} ${valueFn(s)}</span>`).join('')}</div>` : ''}
        <div class="cockpit-diag-phrase">${phrase}</div>
      </div>`;
  }

  const diagHtml = `
    <div class="cockpit-diag-grid">
      ${diagCard('💔', 'Résiliation',
        s => resilStatus(s.taux_resiliation),
        s => s.taux_resiliation !== null ? `(${s.taux_resiliation.toFixed(1)}%)` : '',
        '%', 'Seuil < 7 %')}
      ${diagCard('👥', 'Non fréquentants',
        s => nfStatus(s.nf_rate),
        s => s.nf_rate !== null ? `(${s.nf_rate.toFixed(1)}%)` : '',
        '%', 'Seuil < 10 %')}
      ${diagCard('📋', 'Qualité fichier',
        s => infosStatus(s.fichier_quality),
        s => s.fichier_quality !== null ? `(${s.fichier_quality}%)` : '',
        '%', 'Cible ≥ 80 %')}
      ${diagCard('🤝', 'Team / CRs',
        s => teamStatus(s.team_quality),
        s => s.team_quality !== null ? `(${s.team_quality}%)` : '',
        '%', 'Cible ≥ 80 %')}
      ${diagCard('✨', 'Éclat / Occupation',
        s => eclatStatus(s.eclat_score),
        s => s.eclat_score !== null ? `(${s.eclat_score.toFixed(0)}%)` : '',
        '%', 'Cible ≥ 80 %')}
    </div>`;

  // ── BLOC 3 : Priorités d'intervention ──────────────────────
  const PRIORITY_STUDIOS = ['Lille', 'Marcq', 'Wasquehal', 'Boulogne', 'Neuilly', 'Levallois'];
  const priorityPool = studiosSorted.filter(s => PRIORITY_STUDIOS.includes(s.name));
  const priorities = [];

  priorityPool.filter(s => contribStatus(s) === 'red').forEach(s => {
    const causes = [];
    if (resilStatus(s.taux_resiliation) !== 'green' && s.taux_resiliation !== null) causes.push('résiliation');
    if (nfStatus(s.nf_rate) !== 'green' && s.nf_rate !== null) causes.push('NF');
    if (infosStatus(s.fichier_quality) !== 'green' && s.fichier_quality !== null) causes.push('qualité fichier');
    if (teamStatus(s.team_quality) !== 'green' && s.team_quality !== null) causes.push('team');
    if (eclatStatus(s.eclat_score) !== 'green' && s.eclat_score !== null) causes.push('éclat');
    priorities.push({
      studio: s.name, level: 'red',
      contrib: contribVal(s),
      causes: causes.length ? causes.join(', ') : 'données insuffisantes',
    });
  });

  priorityPool.filter(s => contribStatus(s) === 'orange').forEach(s => {
    const causes = [];
    if (resilStatus(s.taux_resiliation) === 'red') causes.push('résiliation critique');
    if (nfStatus(s.nf_rate) === 'red') causes.push('NF critique');
    if (teamStatus(s.team_quality) === 'red') causes.push('team fragile');
    priorities.push({
      studio: s.name, level: 'orange',
      contrib: contribVal(s),
      causes: causes.length ? causes.join(', ') : 'vigilance générale',
    });
  });

  // Add studios with good contrib but team issue
  priorityPool.filter(s => contribStatus(s) === 'green' && teamStatus(s.team_quality) === 'red').forEach(s => {
    priorities.push({
      studio: s.name, level: 'orange',
      contrib: contribVal(s) + ' ✅',
      causes: 'vigilance team malgré bonne contribution',
    });
  });

  const top5 = priorities.slice(0, 5);
  const prioritiesHtml = top5.length === 0
    ? '<div class="cockpit-priority-item" style="color:#22c55e">✅ Aucune priorité urgente — réseau bien piloté ce mois</div>'
    : top5.map((p, i) => `
        <div class="cockpit-priority-item ${p.level}">
          <span class="cockpit-priority-rank">${['1','2','3','4','5'][i]}</span>
          <div class="cockpit-priority-content">
            <span class="cockpit-priority-studio">${p.studio}</span>
            <span class="cockpit-priority-contrib">${p.contrib}</span>
            <span class="cockpit-priority-causes">${p.causes}</span>
          </div>
          <span class="cockpit-priority-badge" style="background:${p.level==='red'?'#ef444422':'#f59e0b22'};color:${p.level==='red'?'#ef4444':'#f59e0b'}">${p.level==='red'?'🚨 Urgent':'⚠️ À traiter'}</span>
        </div>`).join('');

  // ── BLOC 4 : Leaders à accompagner ─────────────────────────
  const LEADER_STUDIOS = ['Lille', 'Marcq', 'Wasquehal', 'Boulogne', 'Neuilly', 'Levallois'];
  const leadersAtRisk = studios
    .filter(s => s.leader_name && LEADER_STUDIOS.includes(s.name))
    .map(s => {
      const redPillars = [
        resilStatus(s.taux_resiliation) === 'red',
        nfStatus(s.nf_rate) === 'red',
        infosStatus(s.fichier_quality) === 'red',
        teamStatus(s.team_quality) === 'red',
        eclatStatus(s.eclat_score) === 'red',
      ].filter(Boolean).length;
      const orangePillars = [
        resilStatus(s.taux_resiliation) === 'orange',
        nfStatus(s.nf_rate) === 'orange',
        infosStatus(s.fichier_quality) === 'orange',
        teamStatus(s.team_quality) === 'orange',
        eclatStatus(s.eclat_score) === 'orange',
      ].filter(Boolean).length;
      const accompScore = accompScoreMap[s.leader_name] ?? null;
      const evalData    = accompEvalMap[s.leader_name]  ?? null;
      const axes        = computeAxesPrioritaires(evalData, accompScore);
      return { ...s, redPillars, orangePillars, status: contribStatus(s), accompScore, axes };
    })
    // Tri : score accompagnement croissant (plus bas = priorité), null en dernier
    .sort((a, b) => {
      if (a.accompScore === null && b.accompScore === null) return 0;
      if (a.accompScore === null) return 1;
      if (b.accompScore === null) return -1;
      return a.accompScore - b.accompScore;
    });

  const leadersHtml = leadersAtRisk.length === 0
    ? '<p class="empty-state">Aucun leader à afficher ce mois-ci.</p>'
    : leadersAtRisk.map(l => {
        const sc = l.accompScore;
        const scoreColor = sc === null ? '#94a3b8' : sc >= 70 ? '#22c55e' : sc >= 40 ? '#f59e0b' : '#ef4444';
        const scoreLabel = sc !== null ? `${sc}%` : '—';
        const phrase = sc === null ? 'Non évalué M-1' : sc < 40 ? 'Accompagnement prioritaire' : sc < 70 ? 'À surveiller' : 'Dans les normes';
        const axesHtml = l.axes && l.axes.length > 0
          ? `<div class="cockpit-axes">
               <span class="cockpit-axes-title">Axes prioritaires</span>
               <ul class="cockpit-axes-list">${l.axes.map(a => `<li>→ ${a}</li>`).join('')}</ul>
             </div>`
          : '';
        return `
        <div class="cockpit-leader-row">
          <div class="cockpit-leader-info">
            <span class="cockpit-leader-name">${l.leader_name}</span>
            <span class="cockpit-leader-studio">${l.name}</span>
          </div>
          ${axesHtml}
          <div class="cockpit-leader-score-col">
            <div class="cockpit-accomp-score-big" style="color:${scoreColor}">${scoreLabel}</div>
            <div class="cockpit-leader-phrase">${phrase}</div>
          </div>
        </div>`;
      }).join('');

  // ── SUPER KPI : Contribution par studio ──────────────────
  const CONTRIB_STUDIOS = ['Lille', 'Marcq', 'Wasquehal', 'Boulogne', 'Neuilly', 'Levallois'];

  // Calculer la valeur de contribution pour chaque studio
  const contribStudioData = CONTRIB_STUDIOS.map(name => {
    const s = studios.find(x => x.name === name);
    const ca  = s?.ca ?? null;
    const dep = s?.depenses ?? null;
    const pct = (ca !== null && dep !== null && ca > 0)
      ? parseFloat((((ca / 1.2) - dep) / (ca / 1.2) * 100).toFixed(1))
      : (s?.taux_contribution ?? null);
    return { name, pct };
  });

  // Trier du plus haut au plus bas (null à la fin)
  contribStudioData.sort((a, b) => {
    if (a.pct === null && b.pct === null) return 0;
    if (a.pct === null) return 1;
    if (b.pct === null) return -1;
    return b.pct - a.pct;
  });

  const contribBubbleHtml = ({ name, pct }) => {
    const isNeg = pct !== null && pct < 0;
    const contribColor = pct === null ? '#94a3b8' : pct >= 30 ? '#22c55e' : pct >= 20 ? '#f59e0b' : '#ef4444';
    const negClass = isNeg ? ' ckpi-contrib-negative' : '';
    return `
      <div class="ckpi-bubble">
        <div class="ckpi-bubble-name">${name}</div>
        <div class="ckpi-contrib${negClass}" style="color:${contribColor}">${pct !== null ? pct.toFixed(1) + ' %' : '—'}</div>
      </div>`;
  };

  // Contribution moyenne des 6 studios
  const contribValues = contribStudioData.map(d => d.pct).filter(v => v !== null);
  const avgContribPct = contribValues.length > 0
    ? parseFloat((contribValues.reduce((a, b) => a + b, 0) / contribValues.length).toFixed(1))
    : null;
  const avgColor = avgContribPct === null ? '#94a3b8' : avgContribPct >= 30 ? '#22c55e' : avgContribPct >= 20 ? '#f59e0b' : '#ef4444';

  const superKpiHtml = `
    <div class="ckpi-avg-banner" style="border-color:${avgColor};background:${avgColor}18;">
      <div class="ckpi-avg-inner">
        <span class="ckpi-avg-label">💰 Contribution moyenne réseau</span>
        <span class="ckpi-avg-value" style="color:${avgColor}">${avgContribPct !== null ? avgContribPct + ' %' : '—'}</span>
      </div>
    </div>
    <div class="ckpi-grid">
      <div class="ckpi-row-3">${contribStudioData.slice(0, 3).map(contribBubbleHtml).join('')}</div>
      <div class="ckpi-row-3">${contribStudioData.slice(3, 6).map(contribBubbleHtml).join('')}</div>
    </div>`;

  // ── Assemblage ────────────────────────────────────────────
  return `
    <div class="cockpit-wrap">
      <div class="cockpit-section">
        <h3 class="cockpit-section-title">💰 CONTRIBUTION PAR CLUB</h3>
        ${superKpiHtml}
      </div>

      <div class="cockpit-section">
        <h3 class="cockpit-section-title">👥 LEADERS À ACCOMPAGNER</h3>
        <div class="cockpit-leaders-list">${leadersHtml}</div>
      </div>

      <div class="cockpit-section-divider"></div>
    </div>`;
}

function cockpitOpenStudio(studioName) {
  // Scroll to the contrôle tab and select this studio
  // For now: navigate to contrôle tab
  const ctrlBtn = document.querySelector('[data-tab="controle"]');
  if (ctrlBtn) { ctrlBtn.click(); }
}

// ─── Academy : taux coachs opérationnels ────────────────────
let acaOpStudio = '';  // filtre studio courant

async function loadAcademyOperationalRate() {
  const container = document.getElementById('aca-operational-container');
  if (!container) return;
  container.innerHTML = '<div class="loading-spinner"></div>';
  try {
    const url = acaOpStudio ? `/academy/operational-rate?studio=${encodeURIComponent(acaOpStudio)}` : '/academy/operational-rate';
    const data = await api(url);
    container.innerHTML = renderAcademyOperationalRate(data);

    // Filtre studio
    const sel = document.getElementById('aca-op-studio-filter');
    if (sel && !sel.dataset.bound) {
      sel.dataset.bound = '1';
      sel.addEventListener('change', async () => {
        acaOpStudio = sel.value;
        await loadAcademyOperationalRate();
      });
    }
  } catch(e) {
    container.innerHTML = `<p class="empty-state">Erreur : ${e.message}</p>`;
  }
}

function renderAcademyOperationalRate(data) {
  const { total_coaches, operational_coaches, rate, essentielles_count, coaches, studios, blocking_modules } = data;

  if (total_coaches === 0) {
    return '<div class="aca-op-wrap"><p class="empty-state">Aucun coach actif trouvé.</p></div>';
  }
  if (essentielles_count === 0) {
    return '<div class="aca-op-wrap"><p class="empty-state">Aucun module "Essentielles" défini.</p></div>';
  }

  // Statut couleur
  const status = rate >= 80 ? 'green' : rate >= 60 ? 'orange' : 'red';
  const statusColor = status === 'green' ? '#22c55e' : status === 'orange' ? '#f59e0b' : '#ef4444';

  // Phrase de synthèse
  const nonOp = total_coaches - operational_coaches;
  let phrase = '';
  if (rate >= 80) phrase = 'Le socle essentiel est bien maîtrisé sur le réseau.';
  else if (rate >= 60) phrase = `Plusieurs coachs ne sont pas encore opérationnels sur les Essentiels.`;
  else phrase = `Le niveau Academy du réseau est encore insuffisant sur le socle minimum.`;
  if (nonOp > 0 && rate < 100) {
    phrase += ` ${nonOp} coach${nonOp>1?'s':''} bloque${nonOp>1?'nt':''} encore l’homogénéité du réseau.`;
  }

  // Filtre studio — toujours la liste complète des clubs (pas celle des coachs filtrés)
  const allStudios = [...CLUBS].sort();
  const studioOptions = ['<option value="">Tous les studios</option>', ...allStudios.map(s => `<option value="${s}" ${acaOpStudio===s?'selected':''}>${s}</option>`)].join('');

  // ── BLOC 1 : Super indicateur ─────────────────────────────
  const superIndHtml = `
    <div class="aca-op-si" style="border-color:${statusColor}">
      <div class="aca-op-si-left">
        <div class="aca-op-si-label">TAUX DE COACHS OPÉRATIONNELS SUR LES ESSENTIELS</div>
        <div class="aca-op-si-rate" style="color:${statusColor}">${rate !== null ? rate + '%' : '—'}</div>
        <div class="aca-op-si-detail">${operational_coaches} coachs opérationnels sur ${total_coaches}</div>
        <div class="aca-op-si-phrase">${phrase}</div>
      </div>
      <div class="aca-op-si-right">
        <div class="aca-op-gauge" style="--pct:${rate||0}%;--color:${statusColor}">
          <svg viewBox="0 0 36 36" class="aca-op-gauge-svg">
            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="var(--border)" stroke-width="3"/>
            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="${statusColor}" stroke-width="3" stroke-dasharray="${rate||0}, 100" stroke-linecap="round"/>
            <text x="18" y="20.35" class="aca-op-gauge-text" fill="${statusColor}">${rate !== null ? rate+'%' : '—'}</text>
          </svg>
        </div>
        <div class="aca-op-filter-wrap">
          <select id="aca-op-studio-filter" class="aca-op-filter">${studioOptions}</select>
        </div>
      </div>
    </div>`;

  // ── BLOC 2 : Coachs non opérationnels ─────────────────────
  const nonOpCoaches = coaches.filter(c => !c.operational).sort((a,b) => a.validated - b.validated);

  const nonOpHtml = nonOpCoaches.length === 0
    ? '<div class="aca-op-all-ok">✅ Tous les coachs sont opérationnels sur les Essentiels !</div>'
    : nonOpCoaches.map(c => {
        const pct = Math.round(c.validated / c.total * 100);
        const barColor = pct >= 80 ? '#f59e0b' : '#ef4444';
        const missingHtml = c.missing.map(m => {
          const stLabel = m.status === 'pending' ? '⏳ En attente de validation' : m.status === 'in_progress' ? '🔄 En cours' : '⭕ Non commencé';
          const stClass = m.status === 'pending' ? 'pending' : m.status === 'in_progress' ? 'progress' : 'none';
          return `<li class="aca-op-missing-item ${stClass}"><span class="aca-op-missing-name">${m.name}</span><span class="aca-op-missing-status">${stLabel}</span></li>`;
        }).join('');
        return `
          <div class="aca-op-coach-card">
            <div class="aca-op-coach-header">
              <span class="aca-op-coach-name">${c.name}</span>
              <span class="aca-op-coach-studio">${c.studio}</span>
              <span class="aca-op-coach-score" style="color:${barColor}">${c.validated}/${c.total} validés</span>
            </div>
            <div class="aca-op-progress-bar">
              <div class="aca-op-progress-fill" style="width:${pct}%;background:${barColor}"></div>
            </div>
            <ul class="aca-op-missing-list">${missingHtml}</ul>
          </div>`;
      }).join('');

  return `
    <div class="aca-op-wrap">
      ${superIndHtml}

      <div class="aca-op-section">
        <h3 class="aca-op-section-title">⚠️ COACHS NON OPÉRATIONNELS <span class="aca-op-section-count">${nonOpCoaches.length}</span></h3>
        <div class="aca-op-coaches-list">${nonOpHtml}</div>
      </div>
    </div>`;
}

// ─── Tri de tableau générique ─────────────────────────────────────────────────
function sortTableByTh(th) {
  const table = th.closest('table');
  if (!table) return;
  const tbody = table.querySelector('tbody');
  if (!tbody) return;

  // Déterminer l'index de la colonne cliquée
  const ths = Array.from(th.closest('tr').querySelectorAll('th'));
  const colIdx = ths.indexOf(th);

  // Basculer le sens de tri
  const asc = th.dataset.sortDir !== 'asc';
  // Retirer les indicateurs des autres colonnes
  ths.forEach(h => { h.dataset.sortDir = ''; h.classList.remove('th-sort-asc','th-sort-desc'); });
  th.dataset.sortDir = asc ? 'asc' : 'desc';
  th.classList.add(asc ? 'th-sort-asc' : 'th-sort-desc');

  // Parser une cellule en valeur comparable
  function parseCell(td) {
    const raw = td.textContent.trim()
      .replace(/\s/g, '')      // espaces (milliers)
      .replace(/€/g, '')
      .replace(/%/g, '')
      .replace(/\+/g, '');
    if (raw === '—' || raw === '') return asc ? Infinity : -Infinity;
    const n = parseFloat(raw.replace(',', '.'));
    return isNaN(n) ? raw.toLowerCase() : n;
  }

  const rows = Array.from(tbody.querySelectorAll('tr'));
  rows.sort((a, b) => {
    const cellA = a.querySelectorAll('td')[colIdx];
    const cellB = b.querySelectorAll('td')[colIdx];
    if (!cellA || !cellB) return 0;
    const va = parseCell(cellA);
    const vb = parseCell(cellB);
    if (typeof va === 'number' && typeof vb === 'number') {
      return asc ? va - vb : vb - va;
    }
    return asc
      ? String(va).localeCompare(String(vb), 'fr')
      : String(vb).localeCompare(String(va), 'fr');
  });

  rows.forEach(r => tbody.appendChild(r));
}

// ═══════════════════════════════════════════════════════════════
// REVUE MENSUELLE DU STUDIO
// ═══════════════════════════════════════════════════════════════

let revueMonth = null;
let revueData  = null; // { review, prefill, studio, month }

async function loadRevueTab() {
  const container = document.getElementById('revue-container');
  if (!container) return;

  const studio = getMyAssignedStudio();
  if (!studio) {
    container.innerHTML = '<p class="empty-state">Studio non défini pour ton compte.</p>';
    return;
  }

  if (!revueMonth) {
    const now = new Date();
    revueMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  }

  container.innerHTML = `
    <div class="revue-header">
      <div>
        <h2 class="revue-title">📝 Revue mensuelle — ${studio}</h2>
        <p class="revue-subtitle">Confirme les chiffres, complète les éléments manquants, explique les écarts.</p>
      </div>
      <div class="pilotage-month-nav">
        <button class="icon-btn" onclick="revueNavMonth(-1)">‹</button>
        <span id="revue-month-label">${formatMonthLabel(revueMonth)}</span>
        <button class="icon-btn" onclick="revueNavMonth(1)">›</button>
      </div>
    </div>
    <div id="revue-body"><div class="loading-spinner"></div></div>`;

  await renderRevueBody(studio, revueMonth);
}

async function revueNavMonth(dir) {
  revueMonth = dir === -1 ? prevMonth(revueMonth) : nextMonth(revueMonth);
  const label = document.getElementById('revue-month-label');
  if (label) label.textContent = formatMonthLabel(revueMonth);
  const studio = getMyAssignedStudio();
  if (studio) await renderRevueBody(studio, revueMonth);
}

async function renderRevueBody(studio, month) {
  const body = document.getElementById('revue-body');
  if (!body) return;
  body.innerHTML = '<div class="loading-spinner"></div>';
  try {
    revueData = await api(`/studio-review/${encodeURIComponent(studio)}/${month}`);
  } catch(e) {
    body.innerHTML = `<p class="empty-state">Erreur : ${e.message}</p>`;
    return;
  }
  body.innerHTML = buildRevueForm(revueData);
}

function rv(field) {
  // Valeur : revue si elle existe, sinon prefill, sinon null
  if (!revueData) return null;
  const r = revueData.review;
  const p = revueData.prefill;
  if (r && r[field] !== null && r[field] !== undefined && r[field] !== '') return r[field];
  if (p && p[field] !== null && p[field] !== undefined) return p[field];
  return null;
}

function revueFmt(v, suffix='') {
  if (v === null || v === undefined || v === '') return '<span class="revue-empty">—</span>';
  return `<strong>${typeof v === 'number' ? v.toLocaleString('fr-FR', {maximumFractionDigits:1}) : v}${suffix}</strong>`;
}

function statusBadge(status) {
  const map = {
    draft:     { label:'Brouillon',   cls:'revue-status-draft' },
    submitted: { label:'Soumis au DR', cls:'revue-status-submitted' },
    validated: { label:'Validé ✓',     cls:'revue-status-validated' },
  };
  const s = map[status] || map.draft;
  return `<span class="revue-status-badge ${s.cls}">${s.label}</span>`;
}

function pillarStatus(color) {
  const map = { green:'🟢', orange:'🟠', red:'🔴', grey:'⚫' };
  return map[color] || '⚫';
}

function commentField(id, label, required, currentVal) {
  const req = required ? ' <span class="revue-req">*</span>' : '';
  return `
    <div class="revue-comment-wrap${required ? ' revue-comment-required' : ''}">
      <label class="revue-comment-label">${label}${req}</label>
      <textarea id="${id}" class="revue-textarea" rows="2" placeholder="Quelques mots suffisent…">${currentVal || ''}</textarea>
    </div>`;
}

function radioGroup(name, options, currentVal) {
  return `<div class="revue-radio-group">${options.map(o => `
    <label class="revue-radio-label${currentVal === o.v ? ' revue-radio-checked' : ''}">
      <input type="radio" name="${name}" value="${o.v}"${currentVal === o.v ? ' checked' : ''}
        onchange="this.closest('.revue-radio-group').querySelectorAll('.revue-radio-label').forEach(l=>l.classList.remove('revue-radio-checked')); this.parentElement.classList.add('revue-radio-checked')">
      ${o.l}
    </label>`).join('')}</div>`;
}

function numInput(id, val, suffix='', placeholder='') {
  return `<input type="number" id="${id}" class="revue-num-input" value="${val !== null && val !== undefined ? val : ''}" placeholder="${placeholder}" step="0.1" min="0">
          ${suffix ? `<span class="revue-num-suffix">${suffix}</span>` : ''}`;
}

function buildRevueForm(data) {
  const r      = data.review || {};
  const p      = data.prefill || {};
  const status = r.status || 'draft';
  const locked = status === 'validated';

  // ── Helpers pour les valeurs fusionnées ──────────────────────
  const get = (field) => {
    if (r[field] !== null && r[field] !== undefined && r[field] !== '') return r[field];
    if (p[field] !== null && p[field] !== undefined) return p[field];
    return null;
  };

  // ── Calculs de statut par pilier ─────────────────────────────
  const resil    = get('taux_resiliation');
  const nf       = get('taux_non_freq');
  const ag       = get('avis_google');
  const temo     = get('temoignages');
  const contrib  = get('contribution');
  const audit    = get('score_audit');

  const statusEngagement = resil === null ? 'grey' : resil < 7 ? 'green' : resil <= 8 ? 'orange' : 'red';
  const statusLoyaute    = nf === null ? 'grey' : nf < 10 ? 'green' : nf <= 12 ? 'orange' : 'red';
  const statusSucces     = contrib === null ? 'grey' : contrib > 30 ? 'green' : contrib >= 27 ? 'orange' : 'red';
  const statusEclat      = audit === null ? 'grey' : audit >= 80 ? 'green' : audit >= 75 ? 'orange' : 'red';

  // ── Infos
  const fc = get('fichier_client');
  const pe = get('pesees');
  const wc = get('welcome_calls');
  const rc = get('resilies_commentes');
  let infoBad = 0;
  if (fc && fc !== 'oui') infoBad++;
  if (pe === 'non') infoBad++;
  if (wc === 'non') infoBad++;
  if (rc === 'non') infoBad++;
  const statusInfos = (!fc && !pe && !wc && !rc) ? 'grey' : infoBad === 0 ? 'green' : infoBad === 1 ? 'orange' : 'red';

  // ── Team
  const remontees = get('nb_remontees');
  const coObs     = get('coachs_observes');
  const crQ       = get('cr_quotidiens');
  const ponct     = get('ponctualite');
  let teamBad = 0;
  if (remontees && remontees > 0) teamBad++;
  if (coObs === 'non') teamBad++;
  if (crQ === 'non') teamBad++;
  if (ponct === 'moyenne') teamBad += 0.5;
  if (ponct === 'insuffisante') teamBad++;
  const statusTeam = (!remontees && !coObs && !crQ && !ponct) ? 'grey' : teamBad === 0 ? 'green' : teamBad <= 1 ? 'orange' : 'red';

  const commentRequired = (st) => st === 'orange' || st === 'red';

  // ── Alertes ──────────────────────────────────────────────────
  const alerts = [];
  if (resil !== null && resil >= 7)  alerts.push(`Taux de résiliation élevé : ${resil}%`);
  if (nf    !== null && nf   >= 10)  alerts.push(`Non fréquentants au-dessus de 10% : ${nf}%`);
  if (ag    !== null && ag   === 0)  alerts.push('Aucun avis Google ce mois');
  if (temo  !== null && temo === 0)  alerts.push('Aucun témoignage ce mois');
  if (fc    === 'non')               alerts.push('Fichier client non à jour');
  if (fc    === 'presque')           alerts.push('Fichier client incomplet');
  if (remontees > 0)                 alerts.push(`${remontees} remontée(s) direction ce mois`);
  if (audit !== null && audit < 80)  alerts.push(`Score audit insuffisant : ${audit}%`);
  if (contrib !== null && contrib < 27) alerts.push(`Contribution insuffisante : ${contrib}%`);

  const alertsHtml = alerts.length === 0
    ? '<p class="revue-no-alert">✅ Aucune alerte automatique détectée</p>'
    : alerts.map(a => `<div class="revue-alert-item">⚠️ ${a}</div>`).join('');

  const lockedAttr = locked ? 'disabled' : '';

  return `
  <div class="revue-form${locked ? ' revue-locked' : ''}">

    <!-- STATUS BAR -->
    <div class="revue-status-bar">
      ${statusBadge(status)}
      ${r.submitted_at ? `<span class="revue-date-info">Soumis le ${r.submitted_at?.split(' ')[0]}</span>` : ''}
      ${r.validated_at ? `<span class="revue-date-info">Validé le ${r.validated_at?.split(' ')[0]}</span>` : ''}
      ${locked ? '<span class="revue-locked-msg">🔒 Revue validée — lecture seule</span>' : ''}
    </div>

    <!-- 1. SYNTHÈSE AUTO -->
    <div class="revue-section revue-synthese">
      <h3 class="revue-section-title">📊 Synthèse du mois</h3>
      <div class="revue-synthese-grid">
        <div class="revue-synth-card">
          <span class="revue-synth-label">Contribution</span>
          ${revueFmt(get('contribution'),'%')}
          ${p.contribution !== null && p.contribution !== undefined ? '<span class="revue-auto-tag">auto</span>' : ''}
        </div>
        <div class="revue-synth-card">
          <span class="revue-synth-label">Résiliation</span>
          ${revueFmt(get('taux_resiliation'),'%')}
          ${p.taux_resiliation !== null && p.taux_resiliation !== undefined ? '<span class="revue-auto-tag">auto</span>' : ''}
        </div>
        <div class="revue-synth-card">
          <span class="revue-synth-label">Non fréquentants</span>
          ${revueFmt(get('taux_non_freq'),'%')}
          ${p.taux_non_freq !== null && p.taux_non_freq !== undefined ? '<span class="revue-auto-tag">auto</span>' : ''}
        </div>
        <div class="revue-synth-card">
          <span class="revue-synth-label">Avis Google</span>
          ${revueFmt(get('avis_google'))}
          ${p.avis_google !== null && p.avis_google !== undefined ? '<span class="revue-auto-tag">auto</span>' : ''}
        </div>
        <div class="revue-synth-card">
          <span class="revue-synth-label">Témoignages</span>
          ${revueFmt(get('temoignages'))}
          ${p.temoignages !== null && p.temoignages !== undefined ? '<span class="revue-auto-tag">auto</span>' : ''}
        </div>
        <div class="revue-synth-card">
          <span class="revue-synth-label">Prises de réf.</span>
          ${revueFmt(get('references_count'))}
          ${p.references_count !== null && p.references_count !== undefined ? '<span class="revue-auto-tag">auto</span>' : ''}
        </div>
        <div class="revue-synth-card">
          <span class="revue-synth-label">Surpack</span>
          ${revueFmt(get('surpack'),'€')}
          ${p.surpack !== null && p.surpack !== undefined ? '<span class="revue-auto-tag">auto</span>' : ''}
        </div>
        <div class="revue-synth-card">
          <span class="revue-synth-label">Audit</span>
          ${revueFmt(get('score_audit'),'%')}
        </div>
      </div>
    </div>

    <!-- 2. PILIERS -->

    <!-- A. ENGAGEMENT -->
    <div class="revue-section">
      <div class="revue-pillar-header">
        <span class="revue-pillar-icon">${pillarStatus(statusEngagement)}</span>
        <h3 class="revue-section-title">A. Engagement</h3>
        <span class="revue-pillar-si">Super indicateur : Taux de résiliation &lt; 7%</span>
      </div>
      <div class="revue-fields-row">
        <div class="revue-field-group">
          <label class="revue-field-label">Taux de résiliation (%)</label>
          <div class="revue-input-wrap">${numInput('rv-resil', get('taux_resiliation'), '%')} ${lockedAttr}</div>
        </div>
        <div class="revue-field-group">
          <label class="revue-field-label">Objectif du mois (%)</label>
          <div class="revue-input-wrap">${numInput('rv-obj-resil', get('obj_resiliation'), '%', '7')} ${lockedAttr}</div>
        </div>
      </div>
      ${commentField('rv-comment-engagement', 'Explique brièvement le niveau de résiliation et les actions mises en place', commentRequired(statusEngagement), get('comment_engagement'))}
    </div>

    <!-- B. LOYAUTÉ -->
    <div class="revue-section">
      <div class="revue-pillar-header">
        <span class="revue-pillar-icon">${pillarStatus(statusLoyaute)}</span>
        <h3 class="revue-section-title">B. Loyauté</h3>
        <span class="revue-pillar-si">Super indicateur : Non fréquentants &lt; 10%</span>
      </div>
      <div class="revue-fields-row">
        <div class="revue-field-group">
          <label class="revue-field-label">Non fréquentants (%)</label>
          <div class="revue-input-wrap">${numInput('rv-nf', get('taux_non_freq'), '%')}</div>
        </div>
        <div class="revue-field-group">
          <label class="revue-field-label">Avis Google</label>
          <div class="revue-input-wrap">${numInput('rv-ag', get('avis_google'))}</div>
        </div>
        <div class="revue-field-group">
          <label class="revue-field-label">Témoignages</label>
          <div class="revue-input-wrap">${numInput('rv-temo', get('temoignages'))}</div>
        </div>
        <div class="revue-field-group">
          <label class="revue-field-label">Prises de référence</label>
          <div class="revue-input-wrap">${numInput('rv-ref', get('references_count'))}</div>
        </div>
      </div>
      ${ag === 0 ? '<div class="revue-alert-inline">⚠️ Aucun avis Google saisi ce mois</div>' : ''}
      ${temo === 0 ? '<div class="revue-alert-inline">⚠️ Aucun témoignage saisi ce mois</div>' : ''}
      ${commentField('rv-comment-loyaute', 'Explique brièvement la dynamique de fidélisation, de preuve sociale et de recommandation', commentRequired(statusLoyaute) || ag === 0 || temo === 0, get('comment_loyaute'))}
    </div>

    <!-- C. INFOS -->
    <div class="revue-section">
      <div class="revue-pillar-header">
        <span class="revue-pillar-icon">${pillarStatus(statusInfos)}</span>
        <h3 class="revue-section-title">C. Infos</h3>
        <span class="revue-pillar-si">Super indicateur : Connaissance fine du fichier client</span>
      </div>
      <div class="revue-checklist">
        <div class="revue-check-item">
          <span class="revue-check-label">Fichier client à jour</span>
          ${radioGroup('rv-fc', [{v:'oui',l:'✅ Oui'},{v:'presque',l:'🟡 Presque'},{v:'non',l:'❌ Non'}], get('fichier_client'))}
        </div>
        <div class="revue-check-item">
          <span class="revue-check-label">Pesées à jour</span>
          ${radioGroup('rv-pesees', [{v:'oui',l:'✅ Oui'},{v:'non',l:'❌ Non'}], get('pesees'))}
        </div>
        <div class="revue-check-item">
          <span class="revue-check-label">Welcome calls faits</span>
          ${radioGroup('rv-wc', [{v:'oui',l:'✅ Oui'},{v:'non',l:'❌ Non'}], get('welcome_calls'))}
        </div>
        <div class="revue-check-item">
          <span class="revue-check-label">Résiliés connus et commentés</span>
          ${radioGroup('rv-rc', [{v:'oui',l:'✅ Oui'},{v:'non',l:'❌ Non'}], get('resilies_commentes'))}
        </div>
      </div>
      ${commentField('rv-comment-infos', 'Explique les retards ou faiblesses éventuelles dans le suivi client', commentRequired(statusInfos), get('comment_infos'))}
    </div>

    <!-- D. TEAM -->
    <div class="revue-section">
      <div class="revue-pillar-header">
        <span class="revue-pillar-icon">${pillarStatus(statusTeam)}</span>
        <h3 class="revue-section-title">D. Team</h3>
        <span class="revue-pillar-si">Super indicateur : Aucune remontée direction</span>
      </div>
      <div class="revue-fields-row">
        <div class="revue-field-group">
          <label class="revue-field-label">Remontées direction</label>
          <div class="revue-input-wrap">${numInput('rv-remontees', get('nb_remontees'), '', '0')}</div>
        </div>
      </div>
      <div class="revue-checklist">
        <div class="revue-check-item">
          <span class="revue-check-label">Coachs observés ce mois</span>
          ${radioGroup('rv-obs', [{v:'oui',l:'✅ Oui'},{v:'non',l:'❌ Non'}], get('coachs_observes'))}
        </div>
        <div class="revue-check-item">
          <span class="revue-check-label">CR quotidiens bien réalisés</span>
          ${radioGroup('rv-crq', [{v:'oui',l:'✅ Oui'},{v:'non',l:'❌ Non'}], get('cr_quotidiens'))}
        </div>
        <div class="revue-check-item">
          <span class="revue-check-label">Ponctualité de l’équipe</span>
          ${radioGroup('rv-ponct', [{v:'bonne',l:'✅ Bonne'},{v:'moyenne',l:'🟡 Moyenne'},{v:'insuffisante',l:'❌ Insuffisante'}], get('ponctualite'))}
        </div>
      </div>
      ${commentField('rv-comment-team', 'Explique brièvement les sujets équipe à signaler', commentRequired(statusTeam), get('comment_team'))}
    </div>

    <!-- E. ÉCLAT -->
    <div class="revue-section">
      <div class="revue-pillar-header">
        <span class="revue-pillar-icon">${pillarStatus(statusEclat)}</span>
        <h3 class="revue-section-title">E. Éclat</h3>
        <span class="revue-pillar-si">Super indicateur : Audit &gt; 80%</span>
      </div>
      <div class="revue-fields-row">
        <div class="revue-field-group">
          <label class="revue-field-label">Mon évaluation du score audit (%)</label>
          <div class="revue-input-wrap">${numInput('rv-audit', get('score_audit'), '%', 'Saisir le score')}</div>
        </div>
      </div>
      <div class="revue-checklist">
        <div class="revue-check-item">
          <span class="revue-check-label">Stories réalisées régulièrement</span>
          ${radioGroup('rv-stories', [{v:'oui',l:'✅ Oui'},{v:'non',l:'❌ Non'}], get('stories'))}
        </div>
        <div class="revue-check-item">
          <span class="revue-check-label">Présence réseaux conforme</span>
          ${radioGroup('rv-reseaux', [{v:'oui',l:'✅ Oui'},{v:'non',l:'❌ Non'}], get('presence_reseaux'))}
        </div>
        <div class="revue-check-item">
          <span class="revue-check-label">Standard image / posture respecté</span>
          ${radioGroup('rv-image', [{v:'oui',l:'✅ Oui'},{v:'non',l:'❌ Non'}], get('standard_image'))}
        </div>
      </div>
      ${commentField('rv-comment-eclat', 'Explique le niveau d\'image, de régularité de communication et de conformité', commentRequired(statusEclat) || audit === null, get('comment_eclat'))}
    </div>

    <!-- F. SUCCÈS -->
    <div class="revue-section">
      <div class="revue-pillar-header">
        <span class="revue-pillar-icon">${pillarStatus(statusSucces)}</span>
        <h3 class="revue-section-title">F. Succès</h3>
        <span class="revue-pillar-si">Super indicateur : Contribution &gt; 30%</span>
      </div>
      <div class="revue-fields-row">
        <div class="revue-field-group">
          <label class="revue-field-label">Contribution (%)</label>
          <div class="revue-readonly-val">
            ${contrib !== null ? `<strong>${contrib}%</strong> <span class="revue-auto-tag">auto</span>` : '<span class="revue-empty">Non disponible</span>'}
          </div>
        </div>
        <div class="revue-field-group">
          <label class="revue-field-label">Events internes</label>
          <div class="revue-input-wrap">${numInput('rv-events', get('nb_events'))}</div>
        </div>
        <div class="revue-field-group">
          <label class="revue-field-label">Partenaires / urnes</label>
          <div class="revue-input-wrap">${numInput('rv-partenaires', get('nb_partenaires'))}</div>
        </div>
      </div>
      <div class="revue-comment-wrap">
        <label class="revue-field-label">Petit plus du mois <span style="opacity:.6;font-weight:400">(facultatif)</span></label>
        <input type="text" id="rv-petit-plus" class="revue-text-input" maxlength="120" placeholder="Une info, une fierté, un fait marquant…" value="${get('petit_plus') || ''}">
      </div>
      ${commentField('rv-comment-succes', 'Explique brièvement la performance business et les leviers activés', commentRequired(statusSucces), get('comment_succes'))}
    </div>

    <!-- 3. ALERTES -->
    <div class="revue-section revue-alerts-section">
      <h3 class="revue-section-title">⚠️ Alertes du mois</h3>
      <div class="revue-alerts-list">${alertsHtml}</div>
    </div>

    <!-- 4. PLAN D'ACTION -->
    <div class="revue-section">
      <h3 class="revue-section-title">🎯 Plan d’action — mois suivant</h3>
      <p class="revue-plan-hint">Court et concret. 3 champs maximum.</p>
      <div class="revue-plan-grid">
        <div class="revue-plan-field">
          <label class="revue-field-label">Sujet prioritaire</label>
          <input type="text" id="rv-plan-sujet" class="revue-text-input" maxlength="80" placeholder="Ex: non fréquentants trop hauts" value="${get('plan_sujet') || ''}">
        </div>
        <div class="revue-plan-field">
          <label class="revue-field-label">Action prévue</label>
          <input type="text" id="rv-plan-action" class="revue-text-input" maxlength="100" placeholder="Ex: relance ciblée + répartition coachs" value="${get('plan_action') || ''}">
        </div>
        <div class="revue-plan-field">
          <label class="revue-field-label">Échéance</label>
          <input type="text" id="rv-plan-echeance" class="revue-text-input" maxlength="40" placeholder="Ex: 10 mai" value="${get('plan_echeance') || ''}">
        </div>
      </div>
    </div>

    ${r.dr_comment ? `
    <div class="revue-section revue-dr-comment">
      <h3 class="revue-section-title">💬 Commentaire du DR</h3>
      <p class="revue-dr-text">${r.dr_comment}</p>
    </div>` : ''}

    <!-- BOUTONS D'ACTION -->
    ${!locked ? `
    <div class="revue-actions">
      <button class="btn-revue-draft" onclick="saveRevue('draft')">💾 Enregistrer brouillon</button>
      <button class="btn-revue-submit" onclick="saveRevue('submit')">📤 Soumettre au DR</button>
    </div>` : ''}

  </div>`;
}

function collectRevuePayload(action) {
  const g = (id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    const v = el.value;
    if (v === '' || v === null || v === undefined) return null;
    const n = parseFloat(v);
    return isNaN(n) ? v : n;
  };
  const radio = (name) => {
    const el = document.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : null;
  };
  const txt = (id) => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  };

  return {
    action,
    taux_resiliation:   g('rv-resil'),
    obj_resiliation:    g('rv-obj-resil'),
    taux_non_freq:      g('rv-nf'),
    avis_google:        g('rv-ag'),
    temoignages:        g('rv-temo'),
    references_count:   g('rv-ref'),
    score_audit:        g('rv-audit'),
    nb_events:          g('rv-events'),
    nb_partenaires:     g('rv-partenaires'),
    nb_remontees:       g('rv-remontees'),
    fichier_client:     radio('rv-fc'),
    pesees:             radio('rv-pesees'),
    welcome_calls:      radio('rv-wc'),
    resilies_commentes: radio('rv-rc'),
    coachs_observes:    radio('rv-obs'),
    cr_quotidiens:      radio('rv-crq'),
    ponctualite:        radio('rv-ponct'),
    stories:            radio('rv-stories'),
    presence_reseaux:   radio('rv-reseaux'),
    standard_image:     radio('rv-image'),
    comment_engagement: txt('rv-comment-engagement'),
    comment_loyaute:    txt('rv-comment-loyaute'),
    comment_infos:      txt('rv-comment-infos'),
    comment_team:       txt('rv-comment-team'),
    comment_eclat:      txt('rv-comment-eclat'),
    comment_succes:     txt('rv-comment-succes'),
    petit_plus:         txt('rv-petit-plus'),
    plan_sujet:         txt('rv-plan-sujet'),
    plan_action:        txt('rv-plan-action'),
    plan_echeance:      txt('rv-plan-echeance'),
    surpack:            revueData?.prefill?.surpack ?? null,
  };
}

async function saveRevue(action) {
  const studio = getMyAssignedStudio();
  if (!studio) return;

  // Validation si soumission
  if (action === 'submit') {
    const r = revueData?.review || {};
    const p = revueData?.prefill || {};
    const get = (id, field) => {
      const el = document.getElementById(id);
      if (el && el.value !== '') return parseFloat(el.value) || el.value;
      if (r[field] !== null && r[field] !== undefined && r[field] !== '') return r[field];
      if (p[field] !== null && p[field] !== undefined) return p[field];
      return null;
    };
    const resil = get('rv-resil','taux_resiliation');
    const nf    = get('rv-nf','taux_non_freq');
    const statusE = resil !== null && resil >= 7;
    const statusL = nf !== null && nf >= 10;
    const ag   = get('rv-ag','avis_google');
    const temo = get('rv-temo','temoignages');
    const errors = [];
    if (statusE && !document.getElementById('rv-comment-engagement')?.value.trim()) errors.push('Commentaire Engagement requis (résiliation ≥ 7%)');
    if ((statusL || ag === 0 || temo === 0) && !document.getElementById('rv-comment-loyaute')?.value.trim()) errors.push('Commentaire Loyauté requis');
    if (errors.length > 0) { alert('Champs obligatoires manquants :\n\n' + errors.join('\n')); return; }
  }

  const payload = collectRevuePayload(action);
  const btns = document.querySelectorAll('.btn-revue-draft, .btn-revue-submit');
  btns.forEach(b => b.disabled = true);
  try {
    const res = await api(`/studio-review/${encodeURIComponent(studio)}/${revueMonth}`, {
      method: 'PUT', body: payload
    });
    revueData = { ...revueData, review: res.review };
    // Rafraîchir l'affichage
    const body = document.getElementById('revue-body');
    if (body) body.innerHTML = buildRevueForm(revueData);
    // Toast
    showRevueToast(action === 'submit' ? '📤 Revue soumise au DR !' : '💾 Brouillon enregistré');
  } catch(e) {
    alert('Erreur : ' + e.message);
  } finally {
    btns.forEach(b => b.disabled = false);
  }
}

function showRevueToast(msg) {
  let toast = document.getElementById('revue-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'revue-toast';
    toast.className = 'revue-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('revue-toast-show');
  setTimeout(() => toast.classList.remove('revue-toast-show'), 2800);
}

// ═══════════════════════════════════════════════════════════════
// REVUES DR — Directeur de réseau
// ═══════════════════════════════════════════════════════════════

let drRevuesMonth = null;
let drRevuesData  = [];

async function loadDrRevuesTab() {
  const container = document.getElementById('dr-revues-container');
  if (!container) return;

  if (!drRevuesMonth) {
    const now = new Date();
    drRevuesMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  }

  container.innerHTML = `
    <div class="drr-header">
      <div>
        <h2 class="drr-title">📋 Revues des studios</h2>
        <p class="drr-subtitle">Revues soumises par les coach leaders</p>
      </div>
      <div class="pilotage-month-nav">
        <button class="icon-btn" onclick="drRevuesNavMonth(-1)">‹</button>
        <span id="drr-month-label">${formatMonthLabel(drRevuesMonth)}</span>
        <button class="icon-btn" onclick="drRevuesNavMonth(1)">›</button>
      </div>
    </div>
    <div id="drr-body"><div class="loading-spinner"></div></div>`;

  await renderDrRevues(drRevuesMonth);
}

async function drRevuesNavMonth(dir) {
  drRevuesMonth = dir === -1 ? prevMonth(drRevuesMonth) : nextMonth(drRevuesMonth);
  const label = document.getElementById('drr-month-label');
  if (label) label.textContent = formatMonthLabel(drRevuesMonth);
  await renderDrRevues(drRevuesMonth);
}

async function renderDrRevues(month) {
  const body = document.getElementById('drr-body');
  if (!body) return;
  body.innerHTML = '<div class="loading-spinner"></div>';

  let reviews = [];
  try {
    const data = await api(`/studio-reviews/${month}`);
    reviews = data.reviews || [];
  } catch(e) {
    body.innerHTML = `<p class="empty-state">Erreur : ${e.message}</p>`;
    return;
  }

  drRevuesData = reviews;

  if (reviews.length === 0) {
    body.innerHTML = `<div class="drr-empty">
      <span style="font-size:2rem">📭</span>
      <p>Aucune revue soumise pour ${formatMonthLabel(month)}</p>
    </div>`;
    return;
  }

  const statusOrder = { submitted: 0, draft: 1, validated: 2 };
  const sorted = [...reviews].sort((a,b) => (statusOrder[a.status]??3) - (statusOrder[b.status]??3));

  // Stats rapides
  const submitted  = reviews.filter(r => r.status === 'submitted').length;
  const validated  = reviews.filter(r => r.status === 'validated').length;
  const draft      = reviews.filter(r => r.status === 'draft').length;

  const statsHtml = `
    <div class="drr-stats">
      <div class="drr-stat-card drr-stat-submitted">
        <span class="drr-stat-val">${submitted}</span>
        <span class="drr-stat-label">À valider</span>
      </div>
      <div class="drr-stat-card drr-stat-validated">
        <span class="drr-stat-val">${validated}</span>
        <span class="drr-stat-label">Validées</span>
      </div>
      <div class="drr-stat-card drr-stat-draft">
        <span class="drr-stat-val">${draft}</span>
        <span class="drr-stat-label">Brouillons</span>
      </div>
    </div>`;

  const cardsHtml = sorted.map(r => buildDrrCard(r)).join('');
  body.innerHTML = statsHtml + `<div class="drr-list">${cardsHtml}</div>`;
}

function buildDrrCard(r) {
  const statusMap = {
    draft:     { label: 'Brouillon',    cls: 'revue-status-draft' },
    submitted: { label: 'À valider ⚡',  cls: 'revue-status-submitted' },
    validated: { label: 'Validée ✓',    cls: 'revue-status-validated' },
  };
  const st = statusMap[r.status] || statusMap.draft;

  // Alertes auto
  const alerts = [];
  if (r.taux_resiliation !== null && r.taux_resiliation >= 7)  alerts.push(`Résiliation ${r.taux_resiliation}%`);
  if (r.taux_non_freq    !== null && r.taux_non_freq    >= 10) alerts.push(`NF ${r.taux_non_freq}%`);
  if (r.avis_google      !== null && r.avis_google      === 0) alerts.push('0 avis Google');
  if (r.score_audit      !== null && r.score_audit      < 80)  alerts.push(`Audit ${r.score_audit}%`);
  if (r.contribution     !== null && r.contribution     < 27)  alerts.push(`Contrib. ${r.contribution}%`);

  const alertBadges = alerts.map(a => `<span class="drr-alert-badge">⚠️ ${a}</span>`).join('');

  // Piliers avec couleurs rapides
  const piliers = [
    { label:'Engagement', val: r.taux_resiliation, unit:'%', seuil:[7,8], inverted:true },
    { label:'NF',         val: r.taux_non_freq,    unit:'%', seuil:[10,12], inverted:true },
    { label:'Audit',      val: r.score_audit,      unit:'%', seuil:[80,75], inverted:false },
    { label:'Contrib.',   val: r.contribution,     unit:'%', seuil:[30,27], inverted:false },
  ].map(p => {
    if (p.val === null || p.val === undefined) return `<span class="drr-kpi drr-kpi-grey">${p.label} —</span>`;
    let color;
    if (p.inverted) {
      color = p.val < p.seuil[0] ? 'green' : p.val <= p.seuil[1] ? 'orange' : 'red';
    } else {
      color = p.val >= p.seuil[0] ? 'green' : p.val >= p.seuil[1] ? 'orange' : 'red';
    }
    return `<span class="drr-kpi drr-kpi-${color}">${p.label} ${p.val}${p.unit}</span>`;
  }).join('');

  return `
  <div class="drr-card${r.status === 'submitted' ? ' drr-card-highlight' : ''}" id="drr-card-${r.id}">
    <div class="drr-card-header" onclick="drrToggle(${r.id})">
      <div class="drr-card-left">
        <span class="drr-studio-name">🏢 ${r.studio}</span>
        <span class="revue-status-badge ${st.cls}">${st.label}</span>
        ${r.submitted_at ? `<span class="drr-date">Soumis le ${r.submitted_at.split(' ')[0]}</span>` : ''}
      </div>
      <div class="drr-card-right">
        <div class="drr-kpis">${piliers}</div>
        ${alertBadges ? `<div class="drr-alerts-row">${alertBadges}</div>` : ''}
        <span class="drr-toggle-icon" id="drr-icon-${r.id}">▼</span>
      </div>
    </div>
    <div class="drr-card-body hidden" id="drr-body-${r.id}">
      ${buildDrrDetail(r)}
    </div>
  </div>`;
}

function buildDrrDetail(r) {
  const yn = v => v === 'oui' ? '✅' : v === 'non' ? '❌' : v === 'presque' ? '🟡' : v || '—';
  const val = v => (v !== null && v !== undefined && v !== '') ? v : '—';
  const pct = v => (v !== null && v !== undefined) ? `${v}%` : '—';
  const comment = (label, text) => text
    ? `<div class="drr-comment"><span class="drr-comment-label">${label}</span><p class="drr-comment-text">${text}</p></div>`
    : '';

  return `
  <div class="drr-detail">

    <!-- SYNTHÈSE -->
    <div class="drr-detail-section">
      <h4 class="drr-detail-title">📊 Synthèse</h4>
      <div class="drr-kpi-grid">
        <div class="drr-kpi-item"><span class="drr-kpi-label">Contribution</span><strong>${pct(r.contribution)}</strong></div>
        <div class="drr-kpi-item"><span class="drr-kpi-label">Résiliation</span><strong>${pct(r.taux_resiliation)}</strong></div>
        <div class="drr-kpi-item"><span class="drr-kpi-label">Non fréquentants</span><strong>${pct(r.taux_non_freq)}</strong></div>
        <div class="drr-kpi-item"><span class="drr-kpi-label">Avis Google</span><strong>${val(r.avis_google)}</strong></div>
        <div class="drr-kpi-item"><span class="drr-kpi-label">Témoignages</span><strong>${val(r.temoignages)}</strong></div>
        <div class="drr-kpi-item"><span class="drr-kpi-label">Prises de réf.</span><strong>${val(r.references_count)}</strong></div>
        <div class="drr-kpi-item"><span class="drr-kpi-label">Surpack</span><strong>${r.surpack !== null ? r.surpack + '€' : '—'}</strong></div>
        <div class="drr-kpi-item"><span class="drr-kpi-label">Score audit</span><strong>${pct(r.score_audit)}</strong></div>
      </div>
    </div>

    <!-- PILIERS -->
    <div class="drr-detail-section drr-pillars-grid">

      <div class="drr-pillar">
        <h5>A. Engagement</h5>
        <p>Résiliation : <strong>${pct(r.taux_resiliation)}</strong></p>
        ${comment('Explication', r.comment_engagement)}
      </div>

      <div class="drr-pillar">
        <h5>B. Loyauté</h5>
        <p>NF : <strong>${pct(r.taux_non_freq)}</strong> · AG : <strong>${val(r.avis_google)}</strong> · Témos : <strong>${val(r.temoignages)}</strong></p>
        ${comment('Explication', r.comment_loyaute)}
      </div>

      <div class="drr-pillar">
        <h5>C. Infos</h5>
        <p>Fichier : ${yn(r.fichier_client)} · Pesées : ${yn(r.pesees)} · Welcome : ${yn(r.welcome_calls)} · Résiliés : ${yn(r.resilies_commentes)}</p>
        ${comment('Explication', r.comment_infos)}
      </div>

      <div class="drr-pillar">
        <h5>D. Team</h5>
        <p>Remontées : <strong>${val(r.nb_remontees)}</strong> · Obs. : ${yn(r.coachs_observes)} · CR : ${yn(r.cr_quotidiens)} · Ponct. : <strong>${val(r.ponctualite) || '—'}</strong></p>
        ${comment('Explication', r.comment_team)}
      </div>

      <div class="drr-pillar">
        <h5>E. Éclat</h5>
        <p>Audit : <strong>${pct(r.score_audit)}</strong> · Stories : ${yn(r.stories)} · Réseaux : ${yn(r.presence_reseaux)} · Image : ${yn(r.standard_image)}</p>
        ${comment('Explication', r.comment_eclat)}
      </div>

      <div class="drr-pillar">
        <h5>F. Succès</h5>
        <p>Contrib. : <strong>${pct(r.contribution)}</strong> · Events : <strong>${val(r.nb_events)}</strong> · Partenaires : <strong>${val(r.nb_partenaires)}</strong></p>
        ${r.petit_plus ? `<p class="drr-petit-plus">💡 ${r.petit_plus}</p>` : ''}
        ${comment('Explication', r.comment_succes)}
      </div>

    </div>

    <!-- PLAN D'ACTION -->
    ${(r.plan_sujet || r.plan_action) ? `
    <div class="drr-detail-section">
      <h4 class="drr-detail-title">🎯 Plan d’action</h4>
      <div class="drr-plan-row">
        ${r.plan_sujet  ? `<div><span class="drr-plan-lbl">Sujet</span> ${r.plan_sujet}</div>` : ''}
        ${r.plan_action ? `<div><span class="drr-plan-lbl">Action</span> ${r.plan_action}</div>` : ''}
        ${r.plan_echeance ? `<div><span class="drr-plan-lbl">Échéance</span> ${r.plan_echeance}</div>` : ''}
      </div>
    </div>` : ''}

    <!-- COMMENTAIRE DR + VALIDATION -->
    ${r.status !== 'draft' ? `
    <div class="drr-detail-section drr-action-section">
      <h4 class="drr-detail-title">💬 Réponse du DR</h4>
      ${r.status === 'validated'
        ? `<p class="drr-validated-msg">✅ Validée le ${r.validated_at?.split(' ')[0]}</p>
           ${r.dr_comment ? `<p class="drr-comment-text">${r.dr_comment}</p>` : ''}`
        : `<textarea id="drr-comment-${r.id}" class="revue-textarea" rows="2" placeholder="Commentaire optionnel pour le coach leader…">${r.dr_comment || ''}</textarea>
           <div class="drr-validate-btns">
             <button class="btn-drr-validate" onclick="drrValidate(${r.id}, '${r.studio}', '${r.month}')">✅ Valider la revue</button>
           </div>`
      }
    </div>` : ''}

  </div>`;
}

function drrToggle(id) {
  const body = document.getElementById(`drr-body-${id}`);
  const icon = document.getElementById(`drr-icon-${id}`);
  if (!body) return;
  const isHidden = body.classList.toggle('hidden');
  if (icon) icon.textContent = isHidden ? '▼' : '▲';
}

async function drrValidate(id, studio, month) {
  const comment = document.getElementById(`drr-comment-${id}`)?.value.trim() || '';
  const btn = document.querySelector(`#drr-card-${id} .btn-drr-validate`);
  if (btn) btn.disabled = true;
  try {
    await api(`/studio-review/${encodeURIComponent(studio)}/${month}/validate`, {
      method: 'POST', body: { dr_comment: comment }
    });
    await renderDrRevues(drRevuesMonth);
    // Ré-ouvrir la carte
    const card = document.getElementById(`drr-body-${id}`);
    if (card) { card.classList.remove('hidden'); const ic = document.getElementById(`drr-icon-${id}`); if (ic) ic.textContent = '▲'; }
  } catch(e) {
    alert('Erreur : ' + e.message);
    if (btn) btn.disabled = false;
  }
}

// ─────────────────────────────────────────────────────────────
// SUIVI DR — Reporting hebdomadaire Directeur de Réseau
// ─────────────────────────────────────────────────────────────

function drGetISOWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function drFormatWeekLabel(weekStr) {
  if (!weekStr) return '—';
  try {
    const [yearStr, wStr] = weekStr.split('-W');
    const weekNum = parseInt(wStr);
    const year    = parseInt(yearStr);
    const jan4    = new Date(year, 0, 4);
    const w1Mon   = new Date(jan4.getTime() - ((jan4.getDay() || 7) - 1) * 86400000);
    const monday  = new Date(w1Mon.getTime() + (weekNum - 1) * 7 * 86400000);
    const sunday  = new Date(monday.getTime() + 6 * 86400000);
    const fmt     = { day: 'numeric', month: 'short' };
    return `S${weekNum} · ${monday.toLocaleDateString('fr-FR', fmt)} – ${sunday.toLocaleDateString('fr-FR', fmt)}`;
  } catch(e) { return weekStr; }
}

let drCurrentWeek = drGetISOWeek();

async function loadSuiviDrTab() {
  const container = document.getElementById('suivi-dr-container');
  if (!container) return;
  container.innerHTML = '<div class="dr-loading">Chargement…</div>';
  try {
    const { reports } = await api('/dr-weekly/list');
    const currentReport = reports.find(r => r.week === drCurrentWeek) || { week: drCurrentWeek };
    if (isDirector()) {
      renderDrEditView(container, currentReport, reports);
    } else {
      renderDrReadView(container, currentReport, reports);
    }
  } catch(e) {
    container.innerHTML = `<div class="dr-loading" style="color:var(--danger)">Erreur : ${e.message}</div>`;
  }
}

function _drLeaderOpts(selected) {
  // Succursales uniquement (pas les franchisés)
  const leaders = (coaches || []).filter(c => c.is_leader && DR_CLUBS.includes(c.studio));
  return `<option value="">— Leader</option>` +
    leaders.map(l => `<option value="${l.name}" ${l.name === selected ? 'selected' : ''}>${l.name}</option>`).join('');
}

function _drClubOpts(selected) {
  return `<option value="">— Club</option>` +
    DR_CLUBS.map(c => `<option value="${c}" ${c === selected ? 'selected' : ''}>${c}</option>`).join('');
}

function _drInput(field, val, ph, max = 70) {
  const safe = (val || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `<input type="text" class="dr-input" data-field="${field}" value="${safe}" placeholder="${ph}" maxlength="${max}">`;
}

function _drWeekOptions(selectedWeek) {
  const weeks = new Set();
  weeks.add(drGetISOWeek());
  for (let i = 1; i <= 4; i++) {
    const d = new Date(); d.setDate(d.getDate() - i * 7);
    weeks.add(drGetISOWeek(d));
  }
  return [...weeks].sort().reverse()
    .map(w => `<option value="${w}" ${w === selectedWeek ? 'selected' : ''}>${drFormatWeekLabel(w)}</option>`)
    .join('');
}

function renderDrEditView(container, report, allReports) {
  const r = report || {};
  container.innerHTML = `
<div class="dr-wrap">
  <div class="dr-topbar">
    <select class="dr-week-sel" id="dr-week-sel">${_drWeekOptions(drCurrentWeek)}</select>
    <button class="dr-save-btn" id="dr-save-btn">💾 Enregistrer</button>
  </div>

  <div class="dr-cards">

    <!-- EN FORME -->
    <div class="dr-card dr-card-green">
      <div class="dr-card-head">
        <span class="dr-dot dr-dot-green"></span>
        <span class="dr-card-title">Leaders en forme</span>
        <span class="dr-pill dr-pill-top">TOP 2</span>
      </div>
      <div class="dr-card-body">
        <div class="dr-row">
          <select class="dr-select" data-field="top_leader_1">${_drLeaderOpts(r.top_leader_1)}</select>
          ${_drInput('top_leader_1_comment', r.top_leader_1_comment, 'Pourquoi ?')}
        </div>
        <div class="dr-row">
          <select class="dr-select" data-field="top_leader_2">${_drLeaderOpts(r.top_leader_2)}</select>
          ${_drInput('top_leader_2_comment', r.top_leader_2_comment, 'Pourquoi ?')}
        </div>
      </div>
    </div>

    <!-- EN DIFFICULTÉ -->
    <div class="dr-card dr-card-red">
      <div class="dr-card-head">
        <span class="dr-dot dr-dot-red"></span>
        <span class="dr-card-title">Leaders en difficulté</span>
        <span class="dr-pill dr-pill-flop">FLOP 2</span>
      </div>
      <div class="dr-card-body">
        <div class="dr-row">
          <select class="dr-select" data-field="flop_leader_1">${_drLeaderOpts(r.flop_leader_1)}</select>
          ${_drInput('flop_leader_1_comment', r.flop_leader_1_comment, 'Pourquoi ?')}
        </div>
        <div class="dr-row">
          <select class="dr-select" data-field="flop_leader_2">${_drLeaderOpts(r.flop_leader_2)}</select>
          ${_drInput('flop_leader_2_comment', r.flop_leader_2_comment, 'Pourquoi ?')}
        </div>
      </div>
    </div>

    <!-- CLUBS -->
    <div class="dr-card dr-card-blue">
      <div class="dr-card-head">
        <span class="dr-dot dr-dot-blue"></span>
        <span class="dr-card-title">Clubs</span>
      </div>
      <div class="dr-card-body">
        <div class="dr-sublabel dr-sublabel-top"><span class="dr-pill dr-pill-top">TOP 2</span></div>
        <div class="dr-row">
          <select class="dr-select" data-field="top_club_1">${_drClubOpts(r.top_club_1)}</select>
          ${_drInput('top_club_1_comment', r.top_club_1_comment, 'Commentaire…')}
        </div>
        <div class="dr-row">
          <select class="dr-select" data-field="top_club_2">${_drClubOpts(r.top_club_2)}</select>
          ${_drInput('top_club_2_comment', r.top_club_2_comment, 'Commentaire…')}
        </div>
        <div class="dr-sublabel dr-sublabel-flop"><span class="dr-pill dr-pill-flop">FLOP 2</span></div>
        <div class="dr-row">
          <select class="dr-select" data-field="flop_club_1">${_drClubOpts(r.flop_club_1)}</select>
          ${_drInput('flop_club_1_comment', r.flop_club_1_comment, 'Commentaire…')}
        </div>
        <div class="dr-row">
          <select class="dr-select" data-field="flop_club_2">${_drClubOpts(r.flop_club_2)}</select>
          ${_drInput('flop_club_2_comment', r.flop_club_2_comment, 'Commentaire…')}
        </div>
      </div>
    </div>

    <!-- PRIORITÉS -->
    <div class="dr-card dr-card-gold">
      <div class="dr-card-head">
        <span class="dr-dot dr-dot-gold"></span>
        <span class="dr-card-title">Priorités semaine prochaine</span>
      </div>
      <div class="dr-card-body">
        <div class="dr-prio-row"><span class="dr-prio-num">1</span>${_drInput('priority_1', r.priority_1, 'Action prioritaire…', 100)}</div>
        <div class="dr-prio-row"><span class="dr-prio-num">2</span>${_drInput('priority_2', r.priority_2, 'Action prioritaire…', 100)}</div>
        <div class="dr-prio-row"><span class="dr-prio-num">3</span>${_drInput('priority_3', r.priority_3, 'Action prioritaire…', 100)}</div>
      </div>
    </div>

    <!-- ARBITRAGE -->
    <div class="dr-card dr-card-orange">
      <div class="dr-card-head">
        <span class="dr-dot dr-dot-orange"></span>
        <span class="dr-card-title">Besoin d’aide / Arbitrage</span>
      </div>
      <div class="dr-card-body">
        ${_drInput('arbitrage', r.arbitrage, 'Ce que j\'attends de Stan cette semaine…', 150)}
      </div>
    </div>

  </div>
  <div id="dr-feedback" class="dr-feedback hidden">✅ Enregistré</div>
</div>`;

  document.getElementById('dr-week-sel').addEventListener('change', async e => {
    drCurrentWeek = e.target.value;
    await loadSuiviDrTab();
  });

  document.getElementById('dr-save-btn').addEventListener('click', async () => {
    const btn = document.getElementById('dr-save-btn');
    btn.disabled = true;
    btn.textContent = '⏳ Enregistrement…';
    try {
      const body = {};
      container.querySelectorAll('[data-field]').forEach(el => { body[el.dataset.field] = el.value; });
      await api(`/dr-weekly/${drCurrentWeek}`, { method: 'PUT', body });
      // Feedback visible : bouton passe au vert pendant 2 s
      btn.textContent = '✅ Enregistré !';
      btn.classList.add('dr-save-btn-ok');
      setTimeout(() => {
        btn.textContent = '💾 Enregistrer';
        btn.classList.remove('dr-save-btn-ok');
        btn.disabled = false;
      }, 2000);
    } catch(e) {
      btn.disabled = false;
      btn.textContent = '💾 Enregistrer';
      alert('Erreur : ' + e.message);
    }
  });
}

function renderDrReadView(container, report, allReports) {
  const r = report || {};
  const hasData = !!r.id;

  const weekOptHtml = allReports.length
    ? allReports.map(rp => `<option value="${rp.week}" ${rp.week === (r.week || drCurrentWeek) ? 'selected' : ''}>${drFormatWeekLabel(rp.week)}</option>`).join('')
    : `<option value="">${drFormatWeekLabel(drCurrentWeek)}</option>`;

  const updAt = r.updated_at
    ? new Date(r.updated_at).toLocaleDateString('fr-FR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
    : null;

  const nameRow = (name, comment, cls = '') =>
    name ? `<div class="dr-read-row ${cls}"><span class="dr-read-name">${name}</span>${comment ? `<span class="dr-read-comment">"${comment}"</span>` : ''}</div>` : '';

  container.innerHTML = `
<div class="dr-wrap">
  <div class="dr-topbar dr-topbar-read">
    <div class="dr-topbar-left">
      <span class="dr-topbar-label">Suivi DR</span>
      <select class="dr-week-sel dr-week-sel-read" id="dr-week-read">${weekOptHtml}</select>
    </div>
    ${updAt ? `<span class="dr-updated">màj ${updAt}</span>` : ''}
  </div>

  ${!hasData ? `
    <div class="dr-empty">
      <div class="dr-empty-icon">📭</div>
      <div class="dr-empty-title">Aucun rapport</div>
      <div class="dr-empty-sub">Marvin n’a pas encore rempli cette semaine</div>
    </div>
  ` : `
    <div class="dr-read-cards">

      <div class="dr-read-card">
        <div class="dr-read-head dr-head-green"><span>🟢</span><span>Leaders en forme</span></div>
        <div class="dr-read-body">
          ${nameRow(r.top_leader_1, r.top_leader_1_comment) || '<span class="dr-read-none">—</span>'}
          ${nameRow(r.top_leader_2, r.top_leader_2_comment)}
        </div>
      </div>

      <div class="dr-read-card">
        <div class="dr-read-head dr-head-red"><span>🔴</span><span>Leaders en difficulté</span></div>
        <div class="dr-read-body">
          ${nameRow(r.flop_leader_1, r.flop_leader_1_comment) || '<span class="dr-read-none">—</span>'}
          ${nameRow(r.flop_leader_2, r.flop_leader_2_comment)}
        </div>
      </div>

      <div class="dr-read-card">
        <div class="dr-read-head dr-head-blue"><span>🏢</span><span>Clubs</span></div>
        <div class="dr-read-body">
          <div class="dr-read-sublabel dr-read-sl-top">TOP</div>
          ${nameRow(r.top_club_1, r.top_club_1_comment) || '<span class="dr-read-none">—</span>'}
          ${nameRow(r.top_club_2, r.top_club_2_comment)}
          <div class="dr-read-sublabel dr-read-sl-flop">FLOP</div>
          ${nameRow(r.flop_club_1, r.flop_club_1_comment) || '<span class="dr-read-none">—</span>'}
          ${nameRow(r.flop_club_2, r.flop_club_2_comment)}
        </div>
      </div>

      <div class="dr-read-card">
        <div class="dr-read-head dr-head-gold"><span>🎯</span><span>Priorités S+1</span></div>
        <div class="dr-read-body">
          ${[r.priority_1, r.priority_2, r.priority_3].filter(Boolean).map((p, i) =>
            `<div class="dr-read-prio"><span class="dr-prio-num">${i + 1}</span>${p}</div>`
          ).join('') || '<span class="dr-read-none">—</span>'}
        </div>
      </div>

      ${r.arbitrage ? `
      <div class="dr-read-card dr-read-card-arb">
        <div class="dr-read-head dr-head-orange"><span>🆘</span><span>Besoin d’aide</span></div>
        <div class="dr-read-body">
          <div class="dr-read-arb">${r.arbitrage}</div>
        </div>
      </div>
      ` : ''}

    </div>
  `}
</div>`;

  const sel = document.getElementById('dr-week-read');
  if (sel) sel.addEventListener('change', async e => {
    if (!e.target.value) return;
    try {
      const { report: nr } = await api(`/dr-weekly/${e.target.value}`);
      const { reports } = await api('/dr-weekly/list');
      renderDrReadView(container, nr || { week: e.target.value }, reports);
    } catch(err) { console.error(err); }
  });
}

// ═══════════════════════════════════════════════════════════════════
// CHALLENGE (Coach) — suivi des clients nutrition attribués
// Lit les routes /nutrition/api/coach/* avec le token coach (Bearer).
// Aucune photo privée n'est affichée ici (choix explicite).
// ═══════════════════════════════════════════════════════════════════

// Client HTTP dédié aux routes nutrition (l'`api()` global préfixe /api/coach).
async function nutriApi(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const res = await fetch(`/nutrition/api${path}`, {
    headers, ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Erreur ${res.status}`);
  }
  return res.json();
}

function chEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
// Date calendaire LOCALE (YYYY-MM-DD). Ne jamais utiliser toISOString() pour un
// jour calendaire : il renvoie la date UTC et décale d'un jour.
function chYmd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function chInitials(p, n) {
  const a = ((p || '').trim()[0] || '');
  const b = ((n || '').trim()[0] || '');
  return (a + b).toUpperCase() || '?';
}
function chDateFr(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}
const CH_OBJ_LABEL = {
  challenge: 'Challenge 6 semaines', perte: 'Perte de poids', 'perte-poids': 'Perte de poids',
  muscle: 'Prise de muscle', 'prise-de-muscle': 'Prise de muscle', 'prise-muscle': 'Prise de muscle',
  forme: 'Forme & énergie', recomposition: 'Recomposition', maintien: 'Maintien', seche: 'Sèche',
};
function chObjLabel(o) {
  if (!o) return 'Objectif non défini';
  return CH_OBJ_LABEL[o] || (o.charAt(0).toUpperCase() + o.slice(1));
}
function chIsChallenge(o) { return String(o || '').toLowerCase() === 'challenge'; }

function chInjectStyles() {
  if (document.getElementById('challenge-styles')) return;
  const st = document.createElement('style');
  st.id = 'challenge-styles';
  st.textContent = `
    /* ===== Espace coach — identité noir / doré / crème (design tokens --mc-*) ===== */
    #challenge-container, #groupes-container, #messages-container {
      max-width: 960px; margin: 0 auto; padding: 8px 2px 48px;
      font-family: Inter, Manrope, system-ui, -apple-system, sans-serif; color: var(--mc-text); }
    .ch-muted { color: var(--mc-text-muted); }
    .ch-loading, .ch-empty { text-align: center; padding: 48px 16px; color: var(--mc-text-muted); }
    .ch-empty p { margin: 5px 0; } .ch-empty p:first-child { font-weight: 650; color: var(--mc-text); }
    /* En-tête de page */
    .ch-head { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin: 2px 4px 18px; flex-wrap: wrap; }
    .ch-head h2 { margin: 0; font-size: 26px; font-weight: 700; letter-spacing: -.02em; color: var(--mc-text); }
    .ch-head-l { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
    .ch-count { font-size: 13px; color: var(--mc-text-muted); font-weight: 550; }
    /* Boutons */
    .ch-btn { font: inherit; font-weight: 600; font-size: 14px; cursor: pointer; border: 1px solid transparent; border-radius: 11px; padding: 10px 16px;
      background: var(--mc-anthracite); color: var(--mc-cream); transition: background .16s var(--ease), transform .06s var(--ease), box-shadow .16s var(--ease); }
    .ch-btn:hover { background: var(--mc-black); }
    .ch-btn:active { transform: translateY(1px); }
    .ch-btn:disabled { opacity: .5; cursor: default; }
    .ch-btn.sec { background: var(--mc-cream-dark); color: var(--mc-text); border-color: var(--mc-border); }
    .ch-btn.sec:hover { background: #e2dccd; }
    .ch-btn.sec.on { background: var(--mc-success-bg); color: var(--mc-success); border-color: rgba(36,131,91,.25); }
    .ch-btn.danger { background: var(--mc-danger-bg); color: var(--mc-danger); border-color: rgba(198,71,61,.25); }
    .ch-btn.danger:hover { background: #fbe3e0; }
    .ch-invite-btn { flex: 0 0 auto; background: var(--mc-black); }
    .ch-btn:focus-visible, .ch-card:focus-visible, .grp-chip:focus-visible, .grp-react .rx:focus-visible,
    .ch-group-write:focus-visible, .grp-cmt-toggle:focus-visible, .ch-back:focus-visible { outline: 2px solid var(--mc-gold); outline-offset: 2px; }
    /* Liste + carte client */
    .ch-list { display: grid; gap: 10px; }
    .ch-card { display: flex; align-items: center; gap: 14px; width: 100%; text-align: left; font-family: inherit;
      background: var(--mc-white); border: 1px solid var(--mc-border); border-radius: 16px; padding: 14px 16px; cursor: pointer;
      box-shadow: var(--mc-shadow-sm); transition: box-shadow .18s var(--ease), border-color .18s var(--ease), transform .12s var(--ease); }
    .ch-card:hover { box-shadow: var(--mc-shadow-md); border-color: var(--mc-gold); transform: translateY(-1px); }
    .ch-card:active { transform: translateY(0); }
    .ch-ava { flex: 0 0 auto; width: 46px; height: 46px; border-radius: 50%; display: grid; place-items: center;
      font-weight: 700; font-size: 15px; color: var(--mc-black); background: linear-gradient(140deg, var(--mc-gold-light), var(--mc-gold)); }
    .ch-card-main { flex: 1 1 auto; min-width: 0; }
    .ch-card-name { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; font-weight: 650; font-size: 16px; color: var(--mc-text); }
    .ch-card-sub { font-size: 13px; color: var(--mc-text-muted); margin-top: 2px; }
    .ch-card-right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex: 0 0 auto; }
    .ch-chev { flex: 0 0 auto; color: var(--mc-text-muted); opacity: .55; font-size: 22px; line-height: 1; }
    .ch-badge { flex: 0 0 auto; font-size: 12px; font-weight: 700; color: #8a6d2a; background: var(--mc-gold-soft);
      border: 1px solid rgba(199,164,90,.3); padding: 3px 9px; border-radius: 999px; white-space: nowrap; }
    .ch-badge.sm { padding: 2px 6px; font-size: 11px; }
    .ch-city { flex: 0 0 auto; font-size: 11px; font-weight: 650; color: #8a6d2a; background: var(--mc-gold-soft); border: 1px solid rgba(199,164,90,.25); border-radius: 999px; padding: 2px 8px; white-space: nowrap; }
    /* Pastille d'état (fonctionnelle, une par client) */
    .ch-pill { flex: 0 0 auto; font-size: 12px; font-weight: 650; padding: 5px 11px; border-radius: 999px; white-space: nowrap; }
    .ch-pill.red { color: var(--mc-danger); background: var(--mc-danger-bg); border: 1px solid rgba(198,71,61,.22); }
    .ch-pill.orange { color: var(--mc-warning); background: var(--mc-warning-bg); border: 1px solid rgba(183,106,25,.22); }
    .ch-pill.green { color: var(--mc-success); background: var(--mc-success-bg); border: 1px solid rgba(36,131,91,.22); }
    /* Adhérence + barres de progression (dorées) */
    .ch-adh { font-weight: 700; }
    .ch-adh.good { color: var(--mc-success); } .ch-adh.warn { color: var(--mc-warning); } .ch-adh.bad { color: var(--mc-danger); }
    .ch-bar { display: block; height: 6px; border-radius: 999px; background: var(--mc-cream-dark); overflow: hidden; margin-top: 8px; max-width: 220px; }
    .ch-bar > i { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--mc-gold), var(--mc-gold-light)); }
    .ch-progress { height: 8px; border-radius: 999px; background: var(--mc-cream-dark); overflow: hidden; margin: 8px 0 6px; }
    .ch-progress > i { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--mc-gold), var(--mc-gold-light)); }
    /* Nouveau message (discret, doré) */
    .ch-newmsg { font-size: 12px; font-weight: 650; color: var(--mc-gold-light); background: var(--mc-anthracite);
      padding: 5px 12px; border-radius: 999px; white-space: nowrap; display: inline-flex; align-items: center; gap: 5px; }
    .ch-card.has-unread { border-color: var(--mc-gold); background: #FCFAF4; box-shadow: var(--mc-shadow-sm), inset 3px 0 0 var(--mc-gold); }
    .ch-card.has-unread:hover { border-color: var(--mc-gold); }
    /* Fiche client */
    .ch-back { display: inline-flex; align-items: center; gap: 6px; background: none; border: none; cursor: pointer;
      color: var(--mc-text); font-weight: 600; font-size: 14px; padding: 6px 4px; margin-bottom: 12px; border-radius: 8px; }
    .ch-back:hover { color: #8a6d2a; }
    .ch-detail-head { display: flex; align-items: center; gap: 14px; margin: 2px 2px 18px; }
    .ch-detail-head .ch-ava { width: 54px; height: 54px; font-size: 19px; }
    .ch-detail-head h2 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -.02em; display: flex; align-items: center; gap: 8px; }
    .ch-detail-head .ch-obj { font-size: 13px; color: var(--mc-text-muted); font-weight: 550; margin-top: 3px; }
    .ch-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 14px; }
    .ch-panel { background: var(--mc-white); border: 1px solid var(--mc-border); border-radius: 16px; padding: 16px 18px; box-shadow: var(--mc-shadow-sm); }
    .ch-panel h3 { margin: 0 0 12px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--mc-text-muted); }
    .ch-kv { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; font-size: 14px; border-bottom: 1px solid var(--mc-cream-dark); }
    .ch-kv:last-child { border-bottom: none; }
    .ch-kv .k { color: var(--mc-text-muted); }
    .ch-kv .v { font-weight: 650; color: var(--mc-text); text-align: right; }
    .ch-jalons { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .ch-jalon { text-align: center; background: var(--mc-cream); border: 1px solid var(--mc-border); border-radius: 12px; padding: 12px 6px; }
    .ch-jalon .lbl { font-size: 11px; font-weight: 650; text-transform: uppercase; letter-spacing: .05em; color: var(--mc-text-muted); }
    .ch-jalon .w { font-size: 20px; font-weight: 700; color: var(--mc-text); margin-top: 4px; }
    .ch-jalon .w small { font-size: 12px; font-weight: 600; color: var(--mc-text-muted); }
    .ch-jalon .d { font-size: 11px; color: var(--mc-text-muted); margin-top: 2px; }
    .ch-jalon.done { background: var(--mc-success-bg); border-color: rgba(36,131,91,.2); }
    .ch-delta { font-size: 13px; font-weight: 700; margin-top: 10px; text-align: center; }
    .ch-delta.down { color: var(--mc-success); } .ch-delta.up { color: var(--mc-warning); }
    .ch-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .ch-chip { font-size: 12px; font-weight: 550; background: var(--mc-cream-dark); color: var(--mc-text); border-radius: 999px; padding: 4px 10px; }
    .ch-actions { margin-top: 16px; display: grid; gap: 14px; }
    /* Formulaires */
    .ch-form { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; }
    .ch-form label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 650; color: var(--mc-text-muted); }
    .ch-form select, .ch-form input, .ch-form textarea { font: inherit; font-size: 14px; padding: 9px 11px; border: 1px solid var(--mc-border);
      border-radius: 10px; background: var(--mc-white); color: var(--mc-text); transition: border-color .15s var(--ease), box-shadow .15s var(--ease); }
    .ch-form select:focus, .ch-form input:focus, .ch-form textarea:focus { outline: none; border-color: var(--mc-gold); box-shadow: 0 0 0 3px var(--mc-gold-soft); }
    .ch-form textarea { width: 100%; min-height: 72px; resize: vertical; line-height: 1.5; }
    .ch-msg { font-size: 12.5px; font-weight: 650; margin-top: 4px; }
    .ch-msg.ok { color: var(--mc-success); } .ch-msg.err { color: var(--mc-danger); }
    /* Filtres + regroupement */
    .ch-filters { display: flex; gap: 10px; margin: 0 4px 16px; flex-wrap: wrap; }
    .ch-filters select { font: inherit; font-weight: 550; font-size: 13px; padding: 9px 13px; border: 1px solid var(--mc-border); border-radius: 11px; background: var(--mc-white); color: var(--mc-text); cursor: pointer; }
    .ch-filters select:focus { outline: none; border-color: var(--mc-gold); box-shadow: 0 0 0 3px var(--mc-gold-soft); }
    .ch-group { margin-bottom: 22px; }
    .ch-group-h { margin: 0 4px 10px; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .ch-group-t { font-size: 15px; font-weight: 700; letter-spacing: -.01em; color: var(--mc-text); display: inline-flex; align-items: center; gap: 8px; }
    .ch-group-n { background: var(--mc-cream-dark); color: var(--mc-text-muted); border-radius: 999px; padding: 1px 9px; font-size: 12px; font-weight: 600; }
    .ch-group-write { flex: 0 0 auto; background: var(--mc-gold-soft); color: #8a6d2a; border: 1px solid rgba(199,164,90,.35); border-radius: 10px; padding: 7px 13px; font: inherit; font-weight: 600; font-size: 12.5px; cursor: pointer; transition: background .15s var(--ease); }
    .ch-group-write:hover { background: rgba(199,164,90,.2); }
    /* Code du challenge : ce que le coach donne à son groupe pour qu'il s'inscrive. */
    .ch-group-code { flex: 0 0 auto; margin-left: auto; background: var(--mc-cream-dark); color: var(--mc-text); border: 1px solid rgba(199,164,90,.35); border-radius: 10px; padding: 6px 11px; font-size: 12.5px; cursor: pointer; user-select: all; white-space: nowrap; transition: background .15s var(--ease); }
    .ch-group-code b { letter-spacing: 2px; font-size: 14px; }
    .ch-group-code:hover { background: var(--mc-gold-soft); }
    .ch-group-code.ch-code-copied { background: #DCEFD8; border-color: #8DB37F; }
    .ch-group-code.ch-code-off { opacity: .6; cursor: default; }
    .ch-group-code.ch-code-off:hover { background: var(--mc-cream-dark); }
    .ch-code-regen { flex: 0 0 auto; background: none; border: 1px solid rgba(199,164,90,.35); color: var(--mc-text-muted); border-radius: 9px; width: 30px; height: 30px; font-size: 14px; cursor: pointer; line-height: 1; }
    .ch-code-regen:hover { background: var(--mc-gold-soft); color: #8a6d2a; }
    /* Gestion du groupe : renommer / supprimer (même gabarit que ↻). */
    .ch-group-edit, .ch-group-del { flex: 0 0 auto; background: none; border: 1px solid rgba(199,164,90,.35); color: var(--mc-text-muted); border-radius: 9px; width: 30px; height: 30px; font-size: 13px; cursor: pointer; line-height: 1; }
    .ch-group-edit:hover { background: var(--mc-gold-soft); color: #8a6d2a; }
    .ch-group-del:hover { background: #F6DEDE; border-color: #D89A9A; color: #9A3B3B; }
    /* Groupe créé mais encore sans membre : on l'affiche quand même. */
    .ch-group-empty { padding: 14px 4px; }
    /* Date de début du challenge : lance le parcours de tout le groupe. */
    .ch-group-date { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 5px; background: var(--mc-cream-dark); border: 1px solid rgba(199,164,90,.35); border-radius: 10px; padding: 4px 9px; font-size: 12.5px; cursor: pointer; }
    .ch-group-date input { border: none; background: none; font: inherit; color: var(--mc-text-muted); cursor: pointer; padding: 2px 0; }
    .ch-group-date.ch-date-set { background: var(--mc-gold-soft); border-color: rgba(199,164,90,.6); }
    .ch-group-date.ch-date-set input { color: #8a6d2a; font-weight: 600; }
    /* Onglet Groupes : sélecteur de mur (chips) + fil */
    .grp-chips { display: flex; gap: 8px; flex-wrap: wrap; margin: 0 4px 18px; }
    .grp-chip { display: inline-flex; align-items: center; gap: 6px; background: var(--mc-white); border: 1px solid var(--mc-border); border-radius: 999px; padding: 8px 14px; font: inherit; font-weight: 600; font-size: 13px; color: var(--mc-text); cursor: pointer; transition: border-color .15s var(--ease), background .15s var(--ease); }
    .grp-chip:hover { border-color: var(--mc-gold); }
    .grp-chip.on { background: var(--mc-anthracite); color: var(--mc-cream); border-color: var(--mc-anthracite); }
    .grp-chip span { background: var(--mc-cream-dark); color: var(--mc-text-muted); border-radius: 999px; padding: 0 7px; font-size: 11px; }
    .grp-chip.on span { background: rgba(255,255,255,.18); color: var(--mc-gold-light); }
    .grp-msg { display: flex; flex-direction: column; gap: 4px; }
    .grp-msg.them { align-items: flex-start; } .grp-msg.me { align-items: flex-end; }
    .grp-react { display: flex; gap: 4px; flex-wrap: wrap; margin: 0 2px; }
    .grp-react .rx { background: var(--mc-cream); border: 1px solid var(--mc-border); border-radius: 999px; padding: 2px 8px; font-size: 13px; cursor: pointer; line-height: 1.5; display: inline-flex; align-items: center; gap: 3px; transition: background .15s var(--ease); }
    .grp-react .rx:hover { background: var(--mc-cream-dark); }
    .grp-react .rx.on { background: var(--mc-gold-soft); border-color: rgba(199,164,90,.4); }
    .grp-react .rx span { font-size: 11px; font-weight: 700; color: var(--mc-text); }
    .grp-cmt-toggle { background: none; border: none; color: #8a6d2a; font: inherit; font-weight: 600; font-size: 12px; cursor: pointer; padding: 1px 2px; }
    .grp-cmts { align-self: stretch; display: flex; flex-direction: column; gap: 6px; margin: 4px 0 2px; }
    .grp-cmt { background: var(--mc-cream); border: 1px solid var(--mc-border); border-radius: 10px; padding: 6px 10px; font-size: 12.5px; color: var(--mc-text); }
    .grp-cmt b { color: var(--mc-text); margin-right: 4px; }
    .grp-cmt-form { display: flex; gap: 6px; }
    .grp-cmt-form input { flex: 1; font: inherit; font-size: 12.5px; padding: 7px 10px; border: 1px solid var(--mc-border); border-radius: 8px; background: var(--mc-white); color: var(--mc-text); }
    .grp-cmt-form input:focus { outline: none; border-color: var(--mc-gold); box-shadow: 0 0 0 3px var(--mc-gold-soft); }
    .grp-cmt-form button { background: var(--mc-anthracite); color: var(--mc-cream); border: none; border-radius: 8px; padding: 7px 13px; font: inherit; font-weight: 600; font-size: 12px; cursor: pointer; }
    /* Conversation (bulles) — coach anthracite, client crème */
    .ch-conv { display: flex; flex-direction: column; gap: 8px; max-height: 340px; overflow-y: auto; padding: 4px 2px; margin-bottom: 12px; }
    .ch-bubble { max-width: 78%; padding: 9px 13px; border-radius: 15px; font-size: 14px; line-height: 1.45; word-wrap: break-word; }
    .ch-bubble.them { align-self: flex-start; background: var(--mc-cream); color: var(--mc-text); border-bottom-left-radius: 5px; }
    .ch-bubble.me { align-self: flex-end; background: var(--mc-anthracite); color: var(--mc-cream); border-bottom-right-radius: 5px; }
    .ch-bubble .t { display: block; font-size: 10.5px; opacity: .6; margin-top: 3px; }
    .ch-conv-empty { text-align: center; color: var(--mc-text-muted); font-size: 13px; padding: 20px; }
    /* Modale */
    .ch-modal { position: fixed; inset: 0; z-index: 9000; background: rgba(17,17,15,.55); display: flex; align-items: center; justify-content: center; padding: 18px; animation: chFade .18s var(--ease); }
    @keyframes chFade { from { opacity: 0; } to { opacity: 1; } }
    .ch-modal-card { background: var(--mc-white); border: 1px solid var(--mc-border); border-radius: 18px; padding: 22px; width: 100%; max-width: 440px; box-shadow: var(--mc-shadow-lg); }
    .ch-modal-card h3 { margin: 0 0 4px; font-size: 20px; font-weight: 700; letter-spacing: -.01em; color: var(--mc-text); }
    .ch-modal-card p.sub { margin: 0 0 16px; font-size: 13px; color: var(--mc-text-muted); }
    .ch-modal-close { float: right; background: none; border: none; font-size: 22px; color: var(--mc-text-muted); cursor: pointer; line-height: 1; }
    .ch-link-box { display: flex; gap: 8px; margin-top: 12px; }
    .ch-link-box input { flex: 1; font: inherit; font-size: 12.5px; padding: 9px 11px; border: 1px solid var(--mc-border); border-radius: 10px; background: var(--mc-cream); color: var(--mc-text); }
    .ch-share-row { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
    .ch-share-row a, .ch-share-row button { flex: 1; min-width: 120px; text-align: center; text-decoration: none; font: inherit; font-weight: 600; font-size: 13px; padding: 10px; border-radius: 10px; cursor: pointer; border: none; }
    .ch-share-wa { background: #1FA855; color: #fff; }
    .ch-share-mail { background: var(--mc-cream-dark); color: var(--mc-text); }
    /* Bandeau notifications (legacy, retiré du Challenge) */
    .ch-pushstrip { background: var(--mc-white); border: 1px solid var(--mc-border); border-radius: 16px; padding: 12px 14px; margin: 0 4px 14px; box-shadow: var(--mc-shadow-sm); }
    .ch-ps-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--mc-text-muted); margin-bottom: 8px; }
    .ch-ps-alerts { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; }
    .ch-ps-alert { display: flex; align-items: center; gap: 10px; justify-content: space-between; background: var(--mc-warning-bg); border: 1px solid rgba(183,106,25,.25); border-radius: 10px; padding: 8px 11px; font-size: 13px; color: var(--mc-warning); }
    .ch-ps-seen { flex: none; background: var(--mc-white); border: 1px solid rgba(183,106,25,.4); color: var(--mc-warning); border-radius: 8px; padding: 3px 12px; font: inherit; font-weight: 650; font-size: 12px; cursor: pointer; }
    .ch-ps-stats { display: flex; flex-wrap: wrap; gap: 6px; }
    .ch-ps-stat { font-size: 12px; color: var(--mc-text); background: var(--mc-cream-dark); border-radius: 999px; padding: 4px 10px; }
    .ch-ps-stat b { color: #8a6d2a; } .ch-ps-stat em { color: var(--mc-text-muted); font-style: normal; }
    /* Missions bonus déclarées */
    .ch-mb { margin: 0 0 16px; padding: 14px 16px; background: var(--mc-white); border: 1px solid #EBDCB8; border-radius: 14px; }
    .ch-mb-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #8a6d2a; margin-bottom: 4px; }
    .ch-mb-row { display: flex; gap: 12px; align-items: flex-start; justify-content: space-between; padding: 10px 0; border-top: 1px solid var(--mc-border); }
    .ch-mb-row:first-of-type { border-top: 0; }
    .ch-mb-main { min-width: 0; font-size: 13px; color: var(--mc-text); }
    .ch-mb-main em { color: var(--mc-text-muted); font-style: normal; margin-left: 6px; font-size: 12px; }
    .ch-mb-main p { margin: 5px 0 0; color: var(--mc-text-muted); font-size: 13px; line-height: 1.45; white-space: pre-wrap; }
    .ch-mb-actions { display: flex; gap: 8px; flex: none; }
    .ch-mb-ok, .ch-mb-ko { border: 0; border-radius: 999px; padding: 8px 14px; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
    .ch-mb-ok { background: var(--mc-success, #24835B); color: #fff; }
    .ch-mb-ko { background: var(--mc-cream-dark); color: var(--mc-text); }
    .ch-mb-chip { flex: none; align-self: center; padding: 6px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; background: var(--mc-success-bg, #E9F4EE); color: var(--mc-success, #24835B); }
    .ch-mb-chip.refusee { background: var(--mc-cream-dark); color: var(--mc-text-muted); }
    /* Écran de blocage : répondre aux messages avant de valider les missions. */
    .ch-mb-lock { padding: 6px 0 2px; }
    .ch-mb-lock-t { margin: 0; font-size: 14.5px; font-weight: 700; color: var(--mc-text); }
    .ch-mb-lock-w { margin: 5px 0 0; font-size: 13px; color: var(--mc-text-muted); }
    .ch-mb-lock-s { margin: 8px 0 0; font-size: 13px; color: #8a6d2a; }
    .ch-mb-go { margin-top: 12px; border: 0; border-radius: 999px; padding: 9px 16px; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; background: var(--mc-ink, #14110C); color: var(--mc-gold, #C7A45A); }
    .ch-mb-go:hover { opacity: .9; }
    .ch-mb-next { margin: 10px 0 0; font-size: 12.5px; color: var(--mc-text-muted); }
    /* Responsive */
    @media (max-width: 640px) {
      .ch-head h2 { font-size: 23px; }
      .ch-form { flex-direction: column; align-items: stretch; }
      .ch-head { align-items: flex-start; }
      .ch-mb-row { flex-direction: column; }
      .ch-invite-btn { width: 100%; }
      .ch-filters { flex-direction: column; } .ch-filters select { width: 100%; }
      .ch-grid { grid-template-columns: 1fr; }
      .ch-bubble { max-width: 88%; }
      .ch-card { padding: 13px 14px; gap: 12px; }
      .ch-card-right { max-width: 42%; }
    }
  `;
  document.head.appendChild(st);
}

async function loadChallengeTab() {
  chInjectStyles();
  const host = document.getElementById('challenge-container');
  if (!host) return;
  host.innerHTML = '<div class="ch-loading">Chargement de tes clients…</div>';
  try {
    // Clients + conversations en parallèle : la liste affiche une pastille d'état par client
    // (dont « nouveau message », qui vient des conversations).
    const [cRes, convRes] = await Promise.all([
      nutriApi('/coach/clients'),
      nutriApi('/coach/conversations').catch(() => ({ conversations: [] })),
    ]);
    const unread = {};
    (convRes.conversations || []).forEach((cv) => { if (cv.clientEmail) unread[cv.clientEmail] = (unread[cv.clientEmail] || 0) + (cv.unread || 0); });
    // Messages EN ATTENTE DE RÉPONSE = le dernier message du fil vient du client.
    // On ne se fie PAS à « unread » (lu = 0) : ouvrir la conversation suffirait à
    // faire tomber le compteur sans avoir répondu — donc à débloquer les missions.
    const attente = (convRes.conversations || []).filter((cv) => cv.lastRole === 'client');
    renderChallengeList(host, cRes.clients || [], unread);
    loadMissionsBonus(host, attente); // section « Missions bonus », posée en tête
    // (Bandeau « 🔔 Notifications » retiré à la demande — moins de bruit dans l'onglet.)
  } catch (e) {
    host.innerHTML = `<div class="ch-empty"><p>Impossible de charger tes clients.</p><p class="ch-muted">${chEsc(e.message || '')}</p></div>`;
  }
}

// Missions bonus déclarées par les clients : le coach voit qui, quelle semaine,
// quelle mission, le texte et la date — puis Valide (crédit des PUNCH côté
// serveur) ou Refuse. La décision est finale ; la liste garde l'historique.
// RÈGLE : répondre d'abord, valider ensuite. Tant qu'un fil attend une réponse du
// coach, les missions sont masquées derrière un écran de blocage ; une fois tous les
// fils traités, elles reviennent et se valident UNE PAR UNE, de la plus ancienne à
// la plus récente (le coach ne peut pas piocher dans le tas).
async function loadMissionsBonus(host, attente) {
  let missions = [];
  try { const r = await nutriApi('/coach/missions-bonus'); missions = r.missions || []; } catch (_) { return; }
  const enAttente = attente || [];
  // File d'attente : plus ANCIENNE d'abord (l'API renvoie les plus récentes en tête).
  const file = missions.filter((m) => m.statut === 'declaree').sort((a, b) => a.id - b.id);
  const histo = missions.filter((m) => m.statut !== 'declaree');
  if (!missions.length && !enAttente.length) return;
  const dateStr = (iso) => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }); };
  const row = (m, actionnable) => {
    const nom = [m.prenom, m.nom].filter(Boolean).join(' ') || m.client_email;
    const actions = actionnable
      ? `<div class="ch-mb-actions"><button type="button" class="ch-mb-ok" data-id="${m.id}">Valider</button><button type="button" class="ch-mb-ko" data-id="${m.id}">Refuser</button></div>`
      : `<span class="ch-mb-chip${m.statut === 'refusee' ? ' refusee' : ''}">${m.statut === 'validee' ? 'Validée · +' + m.punch + ' PUNCH' : 'Refusée'}</span>`;
    return `<div class="ch-mb-row">
      <div class="ch-mb-main"><b>${chEsc(nom)}</b> · Semaine ${m.week} · ${chEsc(m.mission)}<em>${chEsc(dateStr(m.created_at))}</em>
        <p>${chEsc(m.texte)}</p></div>${actions}</div>`;
  };
  const sec = document.createElement('div');
  sec.className = 'ch-mb';
  let corps;
  if (enAttente.length) {
    // Bloqué : on dit COMBIEN de fils attendent, QUI, et ce qui sera débloqué.
    const noms = enAttente.slice(0, 6).map((cv) => chEsc(cv.clientName || cv.clientEmail || '')).join(', ');
    const reste = enAttente.length > 6 ? ' et ' + (enAttente.length - 6) + ' autre' + (enAttente.length - 6 > 1 ? 's' : '') : '';
    corps = `<div class="ch-mb-lock">
      <p class="ch-mb-lock-t">🔒 ${enAttente.length} message${enAttente.length > 1 ? 's' : ''} en attente de ta réponse</p>
      <p class="ch-mb-lock-w">${noms}${reste}.</p>
      <p class="ch-mb-lock-s">${file.length ? file.length + ' mission' + (file.length > 1 ? 's' : '') + ' à valider t\'attend' + (file.length > 1 ? 'ent' : '') + ' juste après.' : 'Les missions à valider réapparaîtront ensuite.'}</p>
      <button type="button" class="ch-mb-go" id="ch-mb-go">Répondre dans la messagerie</button>
    </div>`;
  } else if (file.length) {
    // Une seule à la fois : la plus ancienne. La suivante apparaît après décision.
    const suite = file.length > 1 ? `<p class="ch-mb-next">Puis ${file.length - 1} autre${file.length - 1 > 1 ? 's' : ''} mission${file.length - 1 > 1 ? 's' : ''} à traiter.</p>` : '';
    corps = row(file[0], true) + suite;
  } else {
    corps = '<p class="ch-mb-next">Aucune mission en attente de validation.</p>';
  }
  const titre = enAttente.length ? '⭐ Missions bonus — en attente' : '⭐ Missions bonus déclarées';
  sec.innerHTML = `<div class="ch-mb-title">${titre}</div>` + corps
    + (enAttente.length ? '' : histo.map((m) => row(m, false)).join(''));
  host.insertBefore(sec, host.firstChild);
  const go = sec.querySelector('#ch-mb-go');
  if (go) go.addEventListener('click', () => {
    const b = document.querySelector('.tab-btn[data-tab="messagerie"]');
    if (b) b.click();
  });
  sec.querySelectorAll('.ch-mb-ok, .ch-mb-ko').forEach((b) => b.addEventListener('click', async () => {
    const action = b.classList.contains('ch-mb-ok') ? 'valider' : 'refuser';
    b.disabled = true;
    try {
      await nutriApi('/coach/missions-bonus/' + b.dataset.id + '/decision', { method: 'POST', body: { action } });
      loadChallengeTab(); // recharge l'onglet : la ligne passe en « Validée / Refusée »
    } catch (e) { alert(e.message || 'Impossible de trancher.'); b.disabled = false; }
  }));
}

// Bandeau notifications (coach) : alertes photos en attente + taux d'ouverture par type.
async function loadPushStrip(host) {
  let stats = [], alerts = [];
  try { const s = await nutriApi('/coach/push-stats'); if (s.ok) stats = s.stats || []; } catch (_) { /* ignore */ }
  try { const a = await nutriApi('/coach/push-alerts'); if (a.ok) alerts = a.alerts || []; } catch (_) { /* ignore */ }
  if (!stats.length && !alerts.length) return;
  const strip = document.createElement('div');
  strip.className = 'ch-pushstrip';
  const alertsHtml = alerts.length ? '<div class="ch-ps-alerts">' + alerts.map((a) =>
    `<div class="ch-ps-alert"><span>📸 ${chEsc(a.message)}</span><button type="button" class="ch-ps-seen" data-id="${a.id}">OK</button></div>`).join('') + '</div>' : '';
  const statsHtml = stats.length ? '<div class="ch-ps-stats">' + stats.map((s) =>
    `<span class="ch-ps-stat"><b>${s.rate}%</b> ${chEsc(s.label)} <em>${s.opened}/${s.sent}</em></span>`).join('') + '</div>' : '';
  strip.innerHTML = '<div class="ch-ps-title">🔔 Notifications</div>' + alertsHtml + statsHtml;
  host.insertBefore(strip, host.firstChild);
  strip.querySelectorAll('.ch-ps-seen').forEach((b) => b.addEventListener('click', async () => {
    try { await nutriApi('/coach/push-alerts/' + b.dataset.id + '/seen', { method: 'POST' }); b.closest('.ch-ps-alert').remove(); } catch (_) { /* ignore */ }
  }));
}

// ===== Onglet GROUPES : murs collectifs par groupe (ville + n° de challenge) =====
// Réactions disponibles (mêmes que côté client) : [clé, emoji].
const CH_REACTIONS = [['bravo', '👏'], ['force', '💪'], ['bien-joue', '🔥'], ['courage', '🌟'], ['moi-aussi', '🙌'], ['aide', '🤝']];
function chReactBar(m) {
  return `<div class="grp-react" data-id="${m.id}">` + CH_REACTIONS.map(([type, emo]) => {
    const n = (m.reactions && m.reactions[type]) || 0;
    const on = m.myReaction === type;
    return `<button type="button" class="rx${on ? ' on' : ''}" data-type="${type}" title="${type}">${emo}${n ? ` <span>${n}</span>` : ''}</button>`;
  }).join('') + '</div>';
}
// Charge + affiche les commentaires (réponses) d'un message du mur + le champ de réponse.
async function grpLoadComments(box, id) {
  box.innerHTML = '<div class="ch-muted" style="font-size:12px;padding:4px 2px">Chargement…</div>';
  try {
    const d = await nutriApi(`/coach/community/comments?item=p${id}`);
    const list = (d.comments || []).map((c) => `<div class="grp-cmt"><b>${chEsc(c.who)}</b> ${chEsc(c.text)}</div>`).join('');
    box.innerHTML = `${list}<form class="grp-cmt-form"><input type="text" maxlength="500" placeholder="Écrire une réponse…" autocomplete="off"><button type="submit">Envoyer</button></form>`;
    const n = (d.comments || []).length;
    const tg = box.parentElement.querySelector('.grp-cmt-toggle');
    if (tg) tg.textContent = '💬 ' + (n ? n + (n > 1 ? ' réponses' : ' réponse') : 'Répondre');
    box.querySelector('.grp-cmt-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const inp = e.target.querySelector('input'); const text = inp.value.trim();
      if (!text) return;
      const b = e.target.querySelector('button'); b.disabled = true;
      try {
        await nutriApi('/coach/community/comments', { method: 'POST', body: { item: 'p' + id, text } });
        grpLoadComments(box, id); // recharge la liste + met à jour le compteur
      } catch (_) { b.disabled = false; }
    });
  } catch (e) { box.innerHTML = '<div class="ch-muted" style="font-size:12px;padding:4px 2px">Indisponible.</div>'; }
}
// ─── MESSAGERIE (coach) — fusion Privé (conversations) + Groupes (murs) ──────
function msgrInjectStyles() {
  if (document.getElementById('messagerie-styles')) return;
  const s = document.createElement('style');
  s.id = 'messagerie-styles';
  s.textContent = `
  .msgr-seg{display:inline-flex;background:var(--mc-cream-dark);border:1px solid var(--mc-border);border-radius:12px;padding:4px;gap:4px;margin:0 0 18px}
  .msgr-seg-btn{border:none;background:none;cursor:pointer;font-weight:700;font-size:14px;color:var(--mc-text-muted);padding:8px 18px;border-radius:9px;display:inline-flex;align-items:center;gap:8px;transition:background .18s ease,color .18s ease}
  .msgr-seg-btn:hover{color:var(--mc-black)}
  .msgr-seg-btn.on{background:var(--mc-anthracite);color:var(--mc-cream);box-shadow:var(--mc-shadow-sm)}
  .msgr-unread{min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:var(--mc-gold);color:var(--mc-black);font-size:11px;font-weight:800;align-items:center;justify-content:center;display:none}
  .msgr-seg-btn.on .msgr-unread{background:var(--mc-gold-light)}
  `;
  document.head.appendChild(s);
}
function setMsgrUnreadBadge(n) {
  const b = document.getElementById('msgr-unread');
  if (!b) return;
  b.textContent = n > 0 ? (n > 99 ? '99+' : String(n)) : '';
  b.style.display = n > 0 ? 'inline-flex' : 'none';
}
async function loadMessagerieTab() {
  chInjectStyles();
  msgrInjectStyles();
  const host = document.getElementById('messagerie-container');
  if (!host) return;
  host.innerHTML = `
    <div class="msgr-seg" role="tablist">
      <button type="button" class="msgr-seg-btn on" data-view="prive" role="tab">Privé<span class="msgr-unread" id="msgr-unread"></span></button>
      <button type="button" class="msgr-seg-btn" data-view="groupes" role="tab">Groupes</button>
    </div>
    <div id="messages-container"></div>
    <div id="groupes-container" style="display:none"></div>`;
  const segs = host.querySelectorAll('.msgr-seg-btn');
  const priv = host.querySelector('#messages-container');
  const grp = host.querySelector('#groupes-container');
  const loaded = { prive: false, groupes: false };
  function show(view) {
    segs.forEach((b) => b.classList.toggle('on', b.dataset.view === view));
    priv.style.display = view === 'prive' ? '' : 'none';
    grp.style.display = view === 'groupes' ? '' : 'none';
    if (view === 'prive' && !loaded.prive) { loaded.prive = true; loadMessagesInbox(); }
    if (view === 'groupes' && !loaded.groupes) { loaded.groupes = true; loadGroupesTab(); }
  }
  segs.forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));
  show('prive');
}
let _grpActive = null; // { ville, no } du mur affiché
async function loadGroupesTab() {
  chInjectStyles();
  const host = document.getElementById('groupes-container');
  if (!host) return;
  host.innerHTML = '<div class="ch-loading">Chargement des groupes…</div>';
  try {
    const { clients } = await nutriApi('/coach/clients');
    const map = {};
    (clients || []).forEach((c) => {
      if ((c.ville || '').trim() && c.challengeNo) {
        const k = c.ville.trim().toLowerCase() + '#' + c.challengeNo;
        if (!map[k]) map[k] = { ville: c.ville.trim(), no: c.challengeNo, count: 0 };
        map[k].count++;
      }
    });
    const groups = Object.values(map).sort((a, b) => (b.no - a.no) || a.ville.localeCompare(b.ville));
    if (!groups.length) {
      host.innerHTML = `<div class="ch-head"><div class="ch-head-l"><h2>📣 Groupes</h2></div></div>
        <div class="ch-empty"><p>Aucun groupe pour l'instant.</p><p class="ch-muted">Range tes clients (Ville + N° de challenge) dans l'onglet Challenge pour créer des murs de groupe.</p></div>`;
      return;
    }
    if (!_grpActive || !groups.some((g) => g.ville.toLowerCase() === _grpActive.ville.toLowerCase() && g.no === _grpActive.no)) {
      _grpActive = { ville: groups[0].ville, no: groups[0].no };
    }
    const chips = groups.map((g) => {
      const on = g.ville.toLowerCase() === _grpActive.ville.toLowerCase() && g.no === _grpActive.no;
      return `<button type="button" class="grp-chip${on ? ' on' : ''}" data-ville="${chEsc(g.ville)}" data-no="${g.no}">📍 ${chEsc(g.ville)} · Chall. ${g.no} <span>${g.count}</span></button>`;
    }).join('');
    host.innerHTML = `
      <div class="ch-head"><div class="ch-head-l"><h2>📣 Groupes</h2><span class="ch-count">${groups.length} mur${groups.length > 1 ? 's' : ''} collectif${groups.length > 1 ? 's' : ''}</span></div></div>
      <div class="grp-chips">${chips}</div>
      <div id="grp-wall"></div>`;
    host.querySelectorAll('.grp-chip').forEach((b) => b.addEventListener('click', () => { _grpActive = { ville: b.dataset.ville, no: Number(b.dataset.no) }; loadGroupesTab(); }));
    renderGroupWall(host.querySelector('#grp-wall'), _grpActive);
  } catch (e) {
    host.innerHTML = `<div class="ch-empty"><p>Chargement impossible.</p><p class="ch-muted">${chEsc(e.message || '')}</p></div>`;
  }
}
async function renderGroupWall(el, grp) {
  if (!el) return;
  el.innerHTML = '<div class="ch-loading">Chargement du mur…</div>';
  const label = `${grp.ville} · Challenge n°${grp.no}`;
  try {
    const d = await nutriApi(`/coach/community?ville=${encodeURIComponent(grp.ville)}&challengeNo=${grp.no}&limit=60`);
    const msgs = (d.messages || []).slice().reverse(); // du plus ancien au plus récent
    const thread = msgs.length
      ? msgs.map((m) => {
        const side = m.kind === 'coach' ? 'me' : 'them';
        const cc = m.commentCount || 0;
        return `<div class="grp-msg ${side}">
          <div class="ch-bubble ${side}"><span>${chEsc(m.text || '')}</span><span class="t">${chEsc(m.who || 'Client')} · ${chConvTime(m.when)}</span></div>
          ${chReactBar(m)}
          <button type="button" class="grp-cmt-toggle" data-id="${m.id}">💬 ${cc ? cc + (cc > 1 ? ' réponses' : ' réponse') : 'Répondre'}</button>
          <div class="grp-cmts" data-id="${m.id}" hidden></div>
        </div>`;
      }).join('')
      : '<div class="ch-conv-empty">Aucun message sur ce mur. Écris le premier ci-dessous.</div>';
    el.innerHTML = `
      <div class="ch-panel">
        <h3>Mur de ${chEsc(label)} · ${d.members || 0} membre${(d.members || 0) > 1 ? 's' : ''}</h3>
        <div class="ch-conv" id="grp-thread">${thread}</div>
        <form class="ch-form" id="grp-form" style="flex-direction:column;align-items:stretch">
          <label style="width:100%">Écrire sur le mur de ${chEsc(label)}<textarea name="message" placeholder="Ex. Bravo à tous, belle semaine 💪"></textarea></label>
          <button type="submit" class="ch-btn" style="align-self:flex-start">Publier sur le mur</button>
        </form>
        <div class="ch-msg" id="grp-status"></div>
      </div>`;
    const t = el.querySelector('#grp-thread'); if (t) t.scrollTop = t.scrollHeight;
    const status = el.querySelector('#grp-status');
    // Réactions du coach (toggle) — mise à jour de la barre en place.
    el.querySelectorAll('.grp-react .rx').forEach((btn) => btn.addEventListener('click', async () => {
      const bar = btn.closest('.grp-react'); const id = bar.dataset.id; const type = btn.dataset.type;
      btn.disabled = true;
      try {
        const r = await nutriApi(`/coach/community/${id}/react`, { method: 'POST', body: { type } });
        CH_REACTIONS.forEach(([tp, emo]) => {
          const b = bar.querySelector(`.rx[data-type="${tp}"]`); if (!b) return;
          const n = (r.reactions && r.reactions[tp]) || 0;
          b.classList.toggle('on', r.myReaction === tp);
          b.innerHTML = emo + (n ? ` <span>${n}</span>` : '');
        });
      } catch (_) { /* ignore */ }
      btn.disabled = false;
    }));
    // Commentaires (réponses) : déplier / replier sous chaque message.
    el.querySelectorAll('.grp-cmt-toggle').forEach((btn) => btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const box = el.querySelector(`.grp-cmts[data-id="${id}"]`);
      if (!box) return;
      if (!box.hidden) { box.hidden = true; return; }
      box.hidden = false;
      grpLoadComments(box, id);
    }));
    el.querySelector('#grp-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target; const btn = f.querySelector('button');
      const message = f.message.value.trim();
      if (!message) { status.textContent = 'Message vide.'; status.className = 'ch-msg err'; return; }
      btn.disabled = true;
      try {
        await nutriApi('/coach/community', { method: 'POST', body: { message, ville: grp.ville, challengeNo: grp.no } });
        renderGroupWall(el, grp); // recharge le mur avec le nouveau message
      } catch (err) { status.textContent = err.message || 'Erreur.'; status.className = 'ch-msg err'; btn.disabled = false; }
    });
  } catch (e) {
    el.innerHTML = `<div class="ch-empty"><p>Mur indisponible.</p><p class="ch-muted">${chEsc(e.message || '')}</p></div>`;
  }
}

// ===== Onglet MESSAGES : conversations privées (envoyées/reçues) =====
// ─── ACADEMY (coach) — vitrine ceinture + badges du coach connecté ──────────
let _acaData = null;
const ACADEMY_BADGES = [
  { key: 'essentielles', name: 'Fondations', emoji: '🏗️' },
  { key: 'signature',    name: 'Signature',  emoji: '✍️' },
  { key: 'expertise',    name: 'Expert',     emoji: '🧠' },
  { key: 'leadership',   name: 'Leadership', emoji: '👑' },
];
function acaInjectStyles() {
  if (document.getElementById('academy-styles')) return;
  const s = document.createElement('style');
  s.id = 'academy-styles';
  s.textContent = `
  #academy-container{max-width:760px;margin:0 auto}
  .aca-hero{display:flex;align-items:center;gap:20px;background:linear-gradient(150deg,var(--mc-anthracite),var(--mc-black));
    color:var(--mc-cream);border-radius:20px;padding:22px 24px;box-shadow:var(--mc-shadow-md);margin-bottom:20px}
  .aca-ring{position:relative;width:120px;height:120px;flex:0 0 auto}
  .aca-pct{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
  .aca-pct b{font-size:30px;font-weight:800;color:#fff;line-height:1}
  .aca-pct span{font-size:11px;color:var(--mc-gold-light);letter-spacing:.06em;text-transform:uppercase;margin-top:2px}
  .aca-hero-info h2{margin:0 0 8px;font-size:20px;color:#fff}
  .aca-belt{display:inline-flex;align-items:center;gap:8px;background:rgba(199,164,90,.16);border:1px solid rgba(199,164,90,.4);
    color:var(--mc-gold-light);border-radius:999px;padding:6px 14px;font-weight:700;font-size:14px}
  .aca-hero-sub{color:#b8b3a6;font-size:13px;margin:10px 0 0}
  .aca-next{color:var(--mc-gold-light);font-size:12.5px;margin-top:6px}
  .aca-badges-title{font-size:13px;font-weight:700;color:var(--mc-text-muted);text-transform:uppercase;letter-spacing:.05em;margin:0 0 12px}
  .aca-badges{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
  .aca-badge{position:relative;background:var(--mc-white);border:1px solid var(--mc-border);border-radius:18px;padding:18px 16px 16px;text-align:center;cursor:pointer;transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease}
  .aca-badge:hover{transform:translateY(-3px);border-color:var(--mc-gold)}
  .aca-badge.on{border-color:var(--mc-gold);box-shadow:0 12px 30px -14px rgba(199,164,90,.6);background:linear-gradient(160deg,#fffdf7,#fbf6ea)}
  .aca-badge-more{margin-top:10px;font-size:11.5px;font-weight:700;color:var(--mc-gold);letter-spacing:.02em}
  /* Vue détail catégorie */
  .aca-back{display:inline-flex;align-items:center;gap:6px;background:none;border:none;color:var(--mc-text-muted);font-weight:700;font-size:14px;cursor:pointer;padding:4px 0;margin-bottom:14px}
  .aca-back:hover{color:var(--mc-black)}
  .aca-cat-head{display:flex;align-items:center;gap:16px;background:var(--mc-white);border:1px solid var(--mc-border);border-radius:18px;padding:18px 20px;margin-bottom:16px}
  .aca-cat-head.on{border-color:var(--mc-gold);background:linear-gradient(160deg,#fffdf7,#fbf6ea)}
  .aca-cat-emoji{font-size:44px;line-height:1;flex:0 0 auto}
  .aca-cat-info{flex:1;min-width:0}
  .aca-cat-info h2{margin:0 0 3px;font-size:19px;color:var(--mc-black);display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .aca-cat-badge{font-size:12px;font-weight:700;color:var(--mc-gold);background:rgba(199,164,90,.14);border:1px solid rgba(199,164,90,.4);border-radius:999px;padding:2px 10px}
  .aca-cat-sub{margin:0 0 10px;font-size:13px;color:var(--mc-text-muted)}
  .aca-flist{display:flex;flex-direction:column;gap:10px}
  .aca-f{display:flex;align-items:center;gap:14px;background:var(--mc-white);border:1px solid var(--mc-border);border-radius:14px;padding:13px 16px}
  .aca-f-ico{width:28px;height:28px;flex:0 0 auto;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:14px;background:var(--mc-cream-dark);color:var(--mc-text-muted)}
  .aca-f.done .aca-f-ico{background:var(--mc-success-bg);color:var(--mc-success)}
  .aca-f.failed .aca-f-ico{background:var(--mc-danger-bg);color:var(--mc-danger)}
  .aca-f.awaiting .aca-f-ico{background:var(--mc-warning-bg);color:var(--mc-warning)}
  .aca-f-main{display:flex;flex-direction:column;min-width:0}
  .aca-f-name{font-weight:700;color:var(--mc-text);font-size:15px;line-height:1.3}
  .aca-f.done .aca-f-name{color:var(--mc-black)}
  .aca-f-state{font-size:12px;color:var(--mc-text-muted);margin-top:1px}
  .aca-f.done .aca-f-state{color:var(--mc-success);font-weight:600}
  .aca-f.awaiting .aca-f-state{color:var(--mc-warning);font-weight:600}
  .aca-badge-emoji{font-size:40px;line-height:1;filter:grayscale(1) opacity(.35)}
  .aca-badge.on .aca-badge-emoji{filter:none}
  .aca-badge-name{font-weight:800;color:var(--mc-text);margin:10px 0 3px;font-size:16px}
  .aca-badge.on .aca-badge-name{color:var(--mc-black)}
  .aca-badge-state{font-size:12px;color:var(--mc-text-muted)}
  .aca-badge.on .aca-badge-state{color:var(--mc-gold);font-weight:700}
  .aca-badge-lock{position:absolute;top:12px;right:14px;font-size:14px;opacity:.55}
  .aca-mini{height:6px;border-radius:999px;background:var(--mc-cream-dark);margin-top:11px;overflow:hidden}
  .aca-mini i{display:block;height:100%;background:var(--mc-gold);border-radius:999px}
  @media (max-width:520px){.aca-hero{flex-direction:column;text-align:center}.aca-badges{grid-template-columns:1fr}}
  `;
  document.head.appendChild(s);
}
async function loadAcademyBadges() {
  chInjectStyles();
  acaInjectStyles();
  const host = document.getElementById('academy-container');
  if (!host) return;
  const coachId = getMyCoachId();
  if (!coachId) {
    host.innerHTML = `<div class="ch-head"><div class="ch-head-l"><h2>🎓 Academy</h2></div></div>
      <div class="ch-empty"><p>Ta progression Academy n'est pas disponible.</p><p class="ch-muted">Connecte-toi avec ton compte coach pour retrouver tes badges.</p></div>`;
    return;
  }
  host.innerHTML = '<div class="ch-loading">Chargement de ta progression…</div>';
  try {
    const d = await api('/formations/validations/' + coachId);
    _acaData = d;
    const pct = d.pct || 0;
    const belt = d.belt || { name: 'Ceinture Blanche', emoji: '🤍', color: '#e2e8f0', min: 0 };
    const earned = new Set(d.badges || []);
    const cat = {};
    (d.formations || []).forEach((f) => { const k = f.category; if (!cat[k]) cat[k] = { total: 0, ok: 0 }; cat[k].total++; if (f.status === 'validated') cat[k].ok++; });
    const nextBelt = BELTS.find((b) => b.min > pct);
    const nextStr = nextBelt ? `Encore ${nextBelt.min - pct}% pour ${nextBelt.emoji} ${nextBelt.name.replace('Ceinture ', '')}` : 'Ceinture maximale atteinte 🎉';
    const r = 52, circ = 2 * Math.PI * r, off = circ - (pct / 100) * circ;
    const earnedCount = ACADEMY_BADGES.filter((b) => earned.has(b.key)).length;
    const badgesHtml = ACADEMY_BADGES.map((b) => {
      const on = earned.has(b.key);
      const c = cat[b.key] || { total: 0, ok: 0 };
      const prog = c.total ? Math.round((c.ok / c.total) * 100) : 0;
      return `<div class="aca-badge${on ? ' on' : ''}" data-key="${b.key}" role="button" tabindex="0" aria-label="Voir les formations ${b.name}">
        <span class="aca-badge-lock">${on ? '🏅' : '🔒'}</span>
        <div class="aca-badge-emoji">${b.emoji}</div>
        <div class="aca-badge-name">${b.name}</div>
        <div class="aca-badge-state">${on ? '✓ Débloqué' : (c.total ? `${c.ok}/${c.total} formations` : 'À débloquer')}</div>
        ${on ? '' : `<div class="aca-mini"><i style="width:${prog}%"></i></div>`}
        <div class="aca-badge-more">Voir les formations →</div>
      </div>`;
    }).join('');
    host.innerHTML = `
      <div class="aca-hero">
        <div class="aca-ring">
          <svg width="120" height="120" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="${r}" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="9"/>
            <circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--mc-gold)" stroke-width="9" stroke-linecap="round"
              stroke-dasharray="${circ}" stroke-dashoffset="${off}" transform="rotate(-90 60 60)" style="transition:stroke-dashoffset .9s ease"/>
          </svg>
          <div class="aca-pct"><b>${pct}%</b><span>validé</span></div>
        </div>
        <div class="aca-hero-info">
          <h2>Ma progression</h2>
          <span class="aca-belt">${belt.emoji} ${belt.name}</span>
          <p class="aca-hero-sub">${d.validated || 0} formation${(d.validated || 0) > 1 ? 's' : ''} sur ${d.total || 0} validée${(d.validated || 0) > 1 ? 's' : ''}</p>
          <p class="aca-next">${nextStr}</p>
        </div>
      </div>
      <p class="aca-badges-title">Badges Academy · ${earnedCount}/${ACADEMY_BADGES.length}</p>
      <div class="aca-badges">${badgesHtml}</div>`;
    host.querySelectorAll('.aca-badge').forEach((el) => {
      const open = () => openAcademyCategory(el.dataset.key);
      el.addEventListener('click', open);
      el.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } });
    });
  } catch (e) {
    host.innerHTML = `<div class="ch-empty"><p>Chargement impossible.</p><p class="ch-muted">${chEsc(e.message || '')}</p></div>`;
  }
}
function openAcademyCategory(key) {
  const host = document.getElementById('academy-container');
  if (!host || !_acaData) { loadAcademyBadges(); return; }
  const meta = ACADEMY_BADGES.find((b) => b.key === key) || { name: key, emoji: '🎓' };
  const items = (_acaData.formations || []).filter((f) => f.category === key);
  const done = items.filter((f) => f.status === 'validated').length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  const on = new Set(_acaData.badges || []).has(key);
  const rows = items.length ? items.map((f) => {
    const isDone = f.status === 'validated';
    const isFailed = f.status === 'failed';
    const quizPassed = f.quiz_passed === true || f.quiz_passed === 1;
    const awaiting = !isDone && !isFailed && quizPassed;
    const cls = isDone ? 'done' : isFailed ? 'failed' : awaiting ? 'awaiting' : 'pending';
    const icon = isDone ? '✓' : isFailed ? '✗' : awaiting ? '⏳' : '○';
    const state = isDone ? 'Validée' : isFailed ? 'À refaire' : awaiting ? 'Quiz réussi · en attente de validation' : 'À valider';
    const date = (isDone && f.validated_at) ? ' · ' + new Date(f.validated_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    return `<div class="aca-f ${cls}"><span class="aca-f-ico">${icon}</span>
      <span class="aca-f-main"><span class="aca-f-name">${chEsc(f.name || 'Formation')}</span>
      <span class="aca-f-state">${state}${date}</span></span></div>`;
  }).join('') : '<div class="ch-empty"><p>Aucune formation dans cette catégorie pour l\'instant.</p></div>';
  host.innerHTML = `
    <button type="button" class="aca-back" id="aca-back">← Retour aux badges</button>
    <div class="aca-cat-head${on ? ' on' : ''}">
      <div class="aca-cat-emoji">${meta.emoji}</div>
      <div class="aca-cat-info">
        <h2>${meta.name}${on ? ' <span class="aca-cat-badge">🏅 Débloqué</span>' : ''}</h2>
        <p class="aca-cat-sub">${done}/${items.length} formation${items.length > 1 ? 's' : ''} validée${done > 1 ? 's' : ''}</p>
        <div class="aca-mini"><i style="width:${pct}%"></i></div>
      </div>
    </div>
    <div class="aca-flist">${rows}</div>`;
  document.getElementById('aca-back').addEventListener('click', loadAcademyBadges);
  host.scrollIntoView({ block: 'start', behavior: 'smooth' });
}
async function loadMessagesInbox() {
  chInjectStyles();
  const host = document.getElementById('messages-container');
  if (!host) return;
  host.innerHTML = '<div class="ch-loading">Chargement des messages…</div>';
  try {
    const d = await nutriApi('/coach/conversations');
    const convs = (d.conversations || []).slice().sort((a, b) => ((b.unread || 0) - (a.unread || 0)) || (Date.parse(b.lastAt || 0) - Date.parse(a.lastAt || 0)));
    if (!convs.length) {
      setMsgrUnreadBadge(0);
      host.innerHTML = `<div class="ch-head"><div class="ch-head-l"><h2>✉️ Messages</h2></div></div>
        <div class="ch-empty"><p>Aucune conversation pour l'instant.</p><p class="ch-muted">Les échanges privés avec tes clients apparaîtront ici.</p></div>`;
      return;
    }
    const totalUnread = convs.reduce((s, c) => s + (c.unread || 0), 0);
    setMsgrUnreadBadge(totalUnread);
    const rows = convs.map((c) => {
      const name = c.clientName || c.clientEmail;
      const parts = String(name).split(' ');
      const preview = c.lastText ? ((c.lastRole && c.lastRole !== 'client' ? 'Vous : ' : '') + c.lastText) : '';
      return `<button type="button" class="ch-card${c.unread ? ' has-unread' : ''}" data-id="${c.id}" data-email="${chEsc(c.clientEmail)}" data-name="${chEsc(name)}">
        <span class="ch-ava">${chEsc(chInitials(parts[0] || '', parts[1] || ''))}</span>
        <span class="ch-card-main">
          <span class="ch-card-name">${chEsc(name)}</span>
          <span class="ch-card-sub">${chEsc(preview.slice(0, 64))}</span>
        </span>
        <span class="ch-card-right">
          ${c.unread ? `<span class="ch-newmsg">💬 ${c.unread}</span>` : (c.lastAt ? `<span class="ch-muted" style="font-size:11px">${chConvTime(c.lastAt)}</span>` : '')}
        </span>
        <span class="ch-chev">›</span>
      </button>`;
    }).join('');
    host.innerHTML = `
      <div class="ch-head"><div class="ch-head-l"><h2>✉️ Messages</h2><span class="ch-count">${convs.length} conversation${convs.length > 1 ? 's' : ''}${totalUnread ? ` · ${totalUnread} non lu${totalUnread > 1 ? 's' : ''}` : ''}</span></div></div>
      <div class="ch-list">${rows}</div>`;
    host.querySelectorAll('.ch-card').forEach((el) => el.addEventListener('click', () => openInboxConversation(host, el.dataset.id, el.dataset.email, el.dataset.name)));
  } catch (e) {
    host.innerHTML = `<div class="ch-empty"><p>Chargement impossible.</p><p class="ch-muted">${chEsc(e.message || '')}</p></div>`;
  }
}
async function openInboxConversation(host, id, email, name) {
  host.innerHTML = '<div class="ch-loading">Chargement de la conversation…</div>';
  const parts = String(name).split(' ');
  try {
    const d = await nutriApi(`/coach/conversations/${id}/messages`);
    const msgs = d.messages || [];
    const thread = msgs.length
      ? msgs.map((m) => `<div class="ch-bubble ${m.mine ? 'me' : 'them'}"><span>${chEsc(m.text || '')}</span><span class="t">${chEsc(m.who || '')} · ${chConvTime(m.when)}</span></div>`).join('')
      : '<div class="ch-conv-empty">Aucun message. Écris le premier ci-dessous.</div>';
    host.innerHTML = `
      <button class="ch-back" data-act="back">‹ Tous les messages</button>
      <div class="ch-detail-head"><span class="ch-ava">${chEsc(chInitials(parts[0] || '', parts[1] || ''))}</span><div><h2>${chEsc(name)}</h2><div class="ch-obj">${chEsc(email)}</div></div></div>
      <div class="ch-panel">
        <div class="ch-conv" id="inbox-thread">${thread}</div>
        <form class="ch-form" id="inbox-form" style="flex-direction:column;align-items:stretch">
          <label style="width:100%">Répondre à ${chEsc(parts[0] || name)}<textarea name="message" placeholder="Ton message…"></textarea></label>
          <button type="submit" class="ch-btn" style="align-self:flex-start">Envoyer</button>
        </form>
        <div class="ch-msg" id="inbox-status"></div>
      </div>`;
    host.querySelector('[data-act="back"]').addEventListener('click', () => loadMessagesInbox());
    const t = host.querySelector('#inbox-thread'); if (t) t.scrollTop = t.scrollHeight;
    const status = host.querySelector('#inbox-status');
    host.querySelector('#inbox-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target; const btn = f.querySelector('button');
      const message = f.message.value.trim();
      if (!message) { status.textContent = 'Message vide.'; status.className = 'ch-msg err'; return; }
      btn.disabled = true;
      try {
        await nutriApi(`/coach/conversations/${id}/reply`, { method: 'POST', body: { message } });
        openInboxConversation(host, id, email, name); // recharge le fil
      } catch (err) { status.textContent = err.message || 'Erreur.'; status.className = 'ch-msg err'; btn.disabled = false; }
    });
  } catch (e) {
    host.innerHTML = `<button class="ch-back" data-act="back">‹ Retour</button><div class="ch-empty"><p>Conversation indisponible.</p><p class="ch-muted">${chEsc(e.message || '')}</p></div>`;
    const b = host.querySelector('[data-act="back"]'); if (b) b.addEventListener('click', () => loadMessagesInbox());
  }
}

// Signaux d'attention d'un client (base commune à la pastille ET au tri).
function chDaysSince(dateStr) { if (!dateStr) return null; const t = Date.parse(dateStr); if (isNaN(t)) return null; return Math.floor((Date.now() - t) / 864e5); }
function chSignals(c, unread) {
  const inact = chDaysSince(c.updatedAt || c.savedAt || c.createdAt);
  const red = !!c.hasPlan && ((inact != null && inact >= 6) || (c.adhScore != null && c.adhScore < 50));
  let orange = false;
  if (c.hasPlan && chIsChallenge(c.objectif)) {
    const p = c.pesees || {};
    orange = !p.depart || (c.challengeDay >= 42 && !p.s6) || (c.challengeDay >= 21 && !p.s3);
  }
  return { inact, red, orange, noPlan: !c.hasPlan, unread: unread || 0 };
}
// Pastille d'état (une seule, la plus prioritaire) : rouge = décroche, orange = pesée
// officielle à faire, vert = tout va bien. Rien si le plan n'est pas encore prêt.
function chStatusPill(c) {
  if (!c.hasPlan) return null; // « plan en attente » est déjà écrit dans le sous-titre
  const s = chSignals(c, 0);
  if (s.red) return { cls: 'red', txt: (s.inact != null && s.inact >= 6) ? ('Inactif depuis ' + s.inact + ' jours') : 'À surveiller' };
  if (s.orange) {
    const p = c.pesees || {};
    if (!p.depart) return { cls: 'orange', txt: 'Pesée de départ à faire' };
    if (c.challengeDay >= 42 && !p.s6) return { cls: 'orange', txt: 'Pesée semaine 6 à faire' };
    return { cls: 'orange', txt: 'Pesée semaine 3 à faire' };
  }
  return { cls: 'green', txt: 'Sur les rails' };
}
// Score d'urgence -> tri « les plus à traiter en haut ». Rouge (décroche) > message
// non lu > pesée due > plan en attente > sur les rails ; les signaux se cumulent.
function chUrgency(c, unread) {
  const s = chSignals(c, unread);
  return (s.red ? 4 : 0) + (s.unread > 0 ? 3 : 0) + (s.orange ? 2 : 0) + (s.noPlan ? 1 : 0)
    + Math.min(s.unread, 3) * 0.1 // + de messages -> un peu plus haut
    + (s.red && c.adhScore != null ? (100 - c.adhScore) / 1000 : 0); // adhérence plus basse -> plus haut
}
// Carte d'un client (liste). Utilise l'état des messages non lus mémorisé.
function chCardHtml(c) {
  const name = [c.prenom, c.nom].filter(Boolean).join(' ') || c.email;
  const isCh = chIsChallenge(c.objectif);
  const unread = _chUnread[c.email] || 0;
  const pill = chStatusPill(c);
  const adhCls = c.adhScore == null ? '' : (c.adhScore >= 70 ? 'good' : c.adhScore >= 50 ? 'warn' : 'bad');
  const adhHtml = (c.adhScore != null) ? `<span class="ch-adh ${adhCls}">adhérence ${c.adhScore}%</span>` : '';
  let sub;
  if (c.hasPlan && isCh && c.challengeDay) sub = `Jour ${c.challengeDay}/42${adhHtml ? ' · ' + adhHtml : ''}`;
  else if (c.hasPlan) sub = adhHtml || chEsc(c.email);
  else sub = 'Plan en attente';
  const bar = (c.hasPlan && isCh && c.challengeDay)
    ? `<span class="ch-bar"><i style="width:${Math.round(Math.min(42, c.challengeDay) / 42 * 100)}%"></i></span>` : '';
  const newMsg = unread ? `<span class="ch-newmsg">💬 ${unread === 1 ? 'Nouveau message' : unread + ' nouveaux messages'}</span>` : '';
  const city = c.ville ? `<span class="ch-city">📍 ${chEsc(c.ville)}</span>` : '';
  return `<button class="ch-card${isCh ? ' is-ch' : ''}${unread ? ' has-unread' : ''}" data-email="${chEsc(c.email)}">
    <span class="ch-ava">${chEsc(chInitials(c.prenom, c.nom))}</span>
    <span class="ch-card-main">
      <span class="ch-card-name">${chEsc(name)}${isCh ? '<span class="ch-badge sm">🔥</span>' : ''}${city}</span>
      <span class="ch-card-sub">${sub}</span>
      ${bar}
    </span>
    <span class="ch-card-right">
      ${newMsg}
      ${pill ? `<span class="ch-pill ${pill.cls}">${chEsc(pill.txt)}</span>` : ''}
    </span>
    <span class="ch-chev">›</span>
  </button>`;
}
let _chHost = null, _chClients = [], _chUnread = {}, _chFilter = { ville: '', no: '' };
// Codes des challenges : « ville#n° » -> { code, actif }. C'est LE code que le coach
// donne à son groupe pour que les clients créent leur espace (auto-inscription).
let _chCodes = {};
// Registre des groupes (y compris ceux sans aucun membre) : [{ville, challengeNo, code, actif, startDate, membres}]
let _chGroups = [];
function chCodeKey(ville, no) { return String(ville || '').trim().toLowerCase() + '#' + (Number(no) || 0); }
// NB : on n'utilise PAS api() ici — elle préfixe toute route par /api/coach et
// sérialise elle-même le body. Nos routes vivent sous /nutrition/api/coach/*.
async function chNutriFetch(path, options) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const res = await fetch(path, { headers, ...(options || {}) });
  return res.json();
}
async function chLoadCodes() {
  try {
    // Registre des groupes : contient AUSSI les groupes encore vides, que la liste
    // des clients ne peut pas révéler (un groupe naît désormais avant ses membres).
    const d = await chNutriFetch('/nutrition/api/coach/groups');
    if (!d || !d.ok) return;
    const m = {};
    _chGroups = d.groups || [];
    _chGroups.forEach((g) => { m[chCodeKey(g.ville, g.challengeNo)] = { code: g.code, actif: g.actif, startDate: g.startDate || '' }; });
    _chCodes = m;
  } catch (_) { /* pas de codes affichés, le reste de l'écran fonctionne */ }
}

// Crée un groupe vide : le serveur lui attribue automatiquement un code unique.
async function chCreateGroup(ville, challengeNo, startDate) {
  const d = await chNutriFetch('/nutrition/api/coach/groups', {
    method: 'POST', body: JSON.stringify({ ville, challengeNo: Number(challengeNo), startDate: startDate || '' }),
  });
  if (!d || !d.ok) throw new Error((d && d.error) || 'Création impossible.');
  await chLoadCodes(); chRenderList();
  return d.group;
}
async function chRenameGroup(ville, no) {
  const nv = window.prompt('Nouvelle ville du groupe :', ville);
  if (nv === null) return;
  const nn = window.prompt('Nouveau n° de challenge :', String(no));
  if (nn === null) return;
  try {
    const d = await chNutriFetch('/nutrition/api/coach/groups/rename', {
      method: 'POST', body: JSON.stringify({ ville, challengeNo: Number(no), newVille: String(nv).trim(), newChallengeNo: Number(nn) }),
    });
    if (d && d.ok) { await chLoadCodes(); loadChallengeTab(); }
    else alert((d && d.error) || 'Renommage impossible.');
  } catch (_) { alert('Erreur réseau.'); }
}
async function chDeleteGroup(ville, no) {
  if (!window.confirm('Supprimer le groupe ' + ville + ' · Challenge n°' + no + ' ?\n\nSon code cessera d\'exister.')) return;
  try {
    const d = await chNutriFetch('/nutrition/api/coach/groups?ville=' + encodeURIComponent(ville) + '&challengeNo=' + Number(no), { method: 'DELETE' });
    if (d && d.ok) { await chLoadCodes(); chRenderList(); }
    else alert((d && d.error) || 'Suppression impossible.');
  } catch (_) { alert('Erreur réseau.'); }
}
// Modale de création : ville + n° de challenge + date de début facultative.
// Le code n'est PAS saisi — il est généré par le serveur et affiché après coup.
function openCreateGroupPanel() {
  document.querySelectorAll('.ch-modal').forEach((m) => m.remove());
  const modal = document.createElement('div');
  modal.className = 'ch-modal';
  modal.innerHTML = `
    <div class="ch-modal-card">
      <button type="button" class="ch-modal-close" aria-label="Fermer">×</button>
      <h3>Nouveau groupe</h3>
      <p class="sub">Un code de connexion unique est généré automatiquement : c'est lui que tu donnes aux participants pour qu'ils rejoignent ce groupe.</p>
      <form class="ch-form" id="ch-ng-form" style="flex-direction:column;align-items:stretch">
        <label>Ville<input type="text" name="ville" placeholder="Ex. Lyon" maxlength="80" required></label>
        <label>N° de challenge<input type="number" name="no" placeholder="Ex. 3" min="1" max="999" required></label>
        <label>Date de début (facultatif)<input type="date" name="date"></label>
        <button type="submit" class="ch-btn" style="align-self:flex-start">Créer le groupe</button>
      </form>
      <div id="ch-ng-result"></div>
      <div class="ch-msg" id="ch-ng-msg"></div>
    </div>`;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('.ch-modal-close').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  const msg = modal.querySelector('#ch-ng-msg');
  modal.querySelector('#ch-ng-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target; const btn = f.querySelector('button');
    const ville = f.ville.value.trim(); const no = Number(f.no.value);
    msg.className = 'ch-msg';
    if (!ville || !no) { msg.textContent = 'Ville et n° de challenge sont requis.'; return; }
    btn.disabled = true; msg.textContent = 'Création…';
    try {
      const g = await chCreateGroup(ville, no, f.date.value || '');
      msg.textContent = '';
      f.style.display = 'none';
      modal.querySelector('#ch-ng-result').innerHTML = `
        <p><b>${chEsc(g.ville)} · Challenge n°${g.challengeNo}</b> est créé.</p>
        <div class="ch-link-box">
          <input type="text" readonly value="${chEsc(g.code)}" id="ch-ng-code">
          <button type="button" class="ch-btn" id="ch-ng-copy">Copier</button>
        </div>
        <p class="sub">Donne ce code aux participants : il les rattache automatiquement à ce groupe.</p>`;
      modal.querySelector('#ch-ng-copy').addEventListener('click', () => {
        try { navigator.clipboard.writeText(g.code); msg.textContent = 'Code copié.'; } catch (_) { /* il le dicte */ }
      });
    } catch (e2) { msg.textContent = e2.message || 'Création impossible.'; btn.disabled = false; }
  });
}
// Date de début du groupe : lance le parcours pour TOUT le groupe ce jour-là.
// Vide = chacun démarre à sa pesée de départ (comportement historique).
async function chSetStartDate(ville, no, startDate) {
  try {
    const d = await chNutriFetch('/nutrition/api/coach/access-codes', {
      method: 'POST', body: JSON.stringify({ ville, challengeNo: Number(no), startDate }),
    });
    if (d && d.ok) { await chLoadCodes(); chRenderList(); }
    else alert((d && d.error) || 'Enregistrement impossible.');
  } catch (_) { alert('Erreur réseau.'); }
}
// Régénère le code d'un groupe (fuite, changement de cohorte...). L'ancien cesse d'agir.
async function chRegenCode(ville, no) {
  if (!window.confirm('Régénérer le code de ' + ville + ' · Challenge n°' + no + ' ?\n\nL\'ancien code ne fonctionnera plus : les clients pas encore inscrits devront recevoir le nouveau.')) return;
  try {
    const d = await chNutriFetch('/nutrition/api/coach/access-codes', {
      method: 'POST', body: JSON.stringify({ ville, challengeNo: Number(no), regenerate: true }),
    });
    if (d && d.ok) { await chLoadCodes(); chRenderList(); }
    else alert((d && d.error) || 'Régénération impossible.');
  } catch (_) { alert('Erreur réseau.'); }
}
function renderChallengeList(host, clients, unreadMap) {
  _chHost = host; _chClients = clients || []; _chUnread = unreadMap || {};
  chRenderList();
  // Les codes arrivent en asynchrone : on re-rend dès qu'ils sont là.
  chLoadCodes().then(() => { if (_chHost) chRenderList(); });
}
// Liste : filtres (ville + n° de challenge) + regroupement par n° de challenge,
// tri par priorité DANS chaque groupe.
function chRenderList() {
  const host = _chHost; if (!host) return;
  const clients = _chClients;
  const inviteBtn = '<button type="button" class="ch-btn ch-group-new" id="ch-group-new">+ Créer un groupe</button>'
    + '<button type="button" class="ch-btn ch-invite-btn" id="ch-invite-open">+ Inviter un client</button>';
  const wireCommon = () => {
    const inv = host.querySelector('#ch-invite-open'); if (inv) inv.addEventListener('click', () => openInvitePanel());
    const ng = host.querySelector('#ch-group-new'); if (ng) ng.addEventListener('click', () => openCreateGroupPanel());
    host.querySelectorAll('.ch-card').forEach((el) => el.addEventListener('click', () => openChallengeClient(host, el.dataset.email)));
  };
  if (!clients.length && !_chGroups.length) {
    host.innerHTML = `<div class="ch-head"><div class="ch-head-l"><h2>🔥 Mes clients</h2></div>${inviteBtn}</div>
      <div class="ch-empty"><p>Aucun client pour le moment.</p><p class="ch-muted">Invite un client avec un lien ci-dessus.</p></div>`;
    wireCommon();
    return;
  }
  // Les filtres couvrent aussi les groupes du registre encore sans membre.
  const villes = [...new Set(clients.map((c) => (c.ville || '').trim()).concat(_chGroups.map((g) => (g.ville || '').trim())).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const nos = [...new Set(clients.map((c) => c.challengeNo || 0).concat(_chGroups.map((g) => g.challengeNo || 0)))].sort((a, b) => b - a);
  // On assainit le filtre courant (une valeur devenue absente -> « tous »).
  const fVille = villes.includes(_chFilter.ville) ? _chFilter.ville : '';
  const fNo = nos.map(String).includes(String(_chFilter.no)) ? String(_chFilter.no) : '';
  _chFilter.ville = fVille; _chFilter.no = fNo;
  const shown = clients.filter((c) => (!fVille || (c.ville || '') === fVille) && (!fNo || String(c.challengeNo || 0) === fNo));
  const urg = (c) => chUrgency(c, _chUnread[c.email]);
  shown.sort((a, b) => urg(b) - urg(a));
  // Regroupement par CANAL = ville + n° de challenge (le vrai groupe de discussion).
  const groups = {}; // clé -> { ville, no, clients }
  // Les groupes VIDES n'apparaissent dans aucune fiche client : on les amorce depuis
  // le registre, sinon un groupe fraîchement créé serait invisible jusqu'au 1er membre.
  _chGroups.forEach((g) => {
    if (!g.ville || !g.challengeNo) return;
    if (fVille && g.ville !== fVille) return;
    if (fNo && String(g.challengeNo) !== String(fNo)) return;
    const key = chCodeKey(g.ville, g.challengeNo);
    if (!groups[key]) groups[key] = { ville: g.ville, no: g.challengeNo, clients: [] };
  });
  shown.forEach((c) => {
    const ok = !!((c.ville || '').trim() && c.challengeNo);
    const key = ok ? ((c.ville || '').trim().toLowerCase() + '#' + c.challengeNo) : '';
    (groups[key] || (groups[key] = { ville: ok ? c.ville.trim() : '', no: ok ? c.challengeNo : 0, clients: [] })).clients.push(c);
  });
  const groupKeys = Object.keys(groups).sort((a, b) => {
    if (a === '') return 1; if (b === '') return -1;
    return (groups[b].no - groups[a].no) || groups[a].ville.localeCompare(groups[b].ville);
  });
  const listHtml = groupKeys.length
    ? groupKeys.map((k) => {
      const g = groups[k];
      const title = k ? `📍 ${chEsc(g.ville)} · Challenge n°${g.no}` : 'Sans groupe (à ranger)';
      const writeBtn = k ? `<button type="button" class="ch-group-write" data-ville="${chEsc(g.ville)}" data-no="${g.no}">✍️ Écrire au groupe</button>` : '';
      // Code du challenge : c'est avec lui que les clients de CE groupe créent leur
      // espace. Le coach le lit ici et le donne à l'oral. Clic = copie.
      let codeHtml = '';
      if (k) {
        const cc = _chCodes[chCodeKey(g.ville, g.no)];
        if (cc && cc.code) {
          codeHtml = `<span class="ch-group-code${cc.actif ? '' : ' ch-code-off'}" data-code="${chEsc(cc.code)}" title="Clic pour copier — donne ce code à ton groupe">🔑 <b>${chEsc(cc.code)}</b>${cc.actif ? '' : ' <i>désactivé</i>'}</span>`
            + `<button type="button" class="ch-code-regen" data-ville="${chEsc(g.ville)}" data-no="${g.no}" title="Régénérer le code">↻</button>`;
        } else {
          codeHtml = `<span class="ch-group-code ch-code-off" title="Ce groupe n'a pas encore de code : personne ne peut le rejoindre">🔑 <i>aucun code</i></span>`
            + `<button type="button" class="ch-code-regen" data-ville="${chEsc(g.ville)}" data-no="${g.no}" title="Générer un code">↻</button>`;
        }
        // Date de début : lance le parcours de TOUT le groupe ce jour-là.
        // Vide = chacun démarre à sa pesée de départ (comportement historique).
        const sd = (cc && cc.startDate) || '';
        codeHtml += `<label class="ch-group-date${sd ? ' ch-date-set' : ''}" title="Date de début du challenge : lance le parcours de tout le groupe ce jour-là. Vide = démarrage individuel (pesée de départ).">📅 <input type="date" class="ch-date-in" value="${chEsc(sd)}" data-ville="${chEsc(g.ville)}" data-no="${g.no}"></label>`;
      }
      // Gérer le groupe : renommer (faute de frappe sur la ville, mauvais n°) et
      // supprimer (refusé côté serveur tant qu'il reste des membres).
      const manageBtns = k
        ? `<button type="button" class="ch-group-edit" data-ville="${chEsc(g.ville)}" data-no="${g.no}" title="Renommer le groupe">✏️</button>`
          + `<button type="button" class="ch-group-del" data-ville="${chEsc(g.ville)}" data-no="${g.no}" title="Supprimer le groupe (seulement s'il est vide)">🗑️</button>`
        : '';
      const body = g.clients.length
        ? `<div class="ch-list">${g.clients.map(chCardHtml).join('')}</div>`
        : '<div class="ch-empty ch-group-empty"><p class="ch-muted">Aucun membre pour le moment — communique le code ci-dessus pour qu\'ils rejoignent ce groupe.</p></div>';
      return `<div class="ch-group"><div class="ch-group-h"><span class="ch-group-t">${title} <span class="ch-group-n">${g.clients.length}</span></span>${codeHtml}${writeBtn}${manageBtns}</div>${body}</div>`;
    }).join('')
    : '<div class="ch-empty"><p>Aucun client pour ce filtre.</p></div>';
  const opt = (val, label, sel) => `<option value="${chEsc(String(val))}"${String(sel) === String(val) ? ' selected' : ''}>${chEsc(label)}</option>`;
  const villeSel = `<select id="ch-f-ville"><option value="">Toutes les villes</option>${villes.map((v) => opt(v, v, fVille)).join('')}</select>`;
  const noSel = `<select id="ch-f-no"><option value="">Tous les challenges</option>${nos.map((n) => opt(n, n === 0 ? 'Sans n°' : 'Challenge n°' + n, fNo)).join('')}</select>`;
  host.innerHTML = `
    <div class="ch-head">
      <div class="ch-head-l">
        <h2>🔥 Mes clients</h2>
        <span class="ch-count">${clients.length} client${clients.length > 1 ? 's' : ''}</span>
      </div>
      ${inviteBtn}
    </div>
    <div class="ch-filters">${villeSel}${noSel}</div>
    ${listHtml}`;
  wireCommon();
  const fv = host.querySelector('#ch-f-ville'); if (fv) fv.addEventListener('change', () => { _chFilter.ville = fv.value; chRenderList(); });
  const fn = host.querySelector('#ch-f-no'); if (fn) fn.addEventListener('change', () => { _chFilter.no = fn.value; chRenderList(); });
  host.querySelectorAll('.ch-group-write').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); openGroupComposer(b.dataset.ville, Number(b.dataset.no)); }));
  // Clic sur le code : copie dans le presse-papier (le coach le dicte ou le colle).
  host.querySelectorAll('.ch-group-code[data-code]').forEach((s) => s.addEventListener('click', (e) => {
    e.stopPropagation();
    const c = s.dataset.code || '';
    try { navigator.clipboard.writeText(c); s.classList.add('ch-code-copied'); setTimeout(() => s.classList.remove('ch-code-copied'), 1200); } catch (_) { /* pas de presse-papier : il le lit */ }
  }));
  host.querySelectorAll('.ch-code-regen').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); chRegenCode(b.dataset.ville, Number(b.dataset.no)); }));
  host.querySelectorAll('.ch-group-edit').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); chRenameGroup(b.dataset.ville, Number(b.dataset.no)); }));
  host.querySelectorAll('.ch-group-del').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); chDeleteGroup(b.dataset.ville, Number(b.dataset.no)); }));
  host.querySelectorAll('.ch-date-in').forEach((i) => i.addEventListener('change', (e) => {
    e.stopPropagation();
    chSetStartDate(i.dataset.ville, Number(i.dataset.no), i.value || '');
  }));
}

// Modale « Écrire au groupe » : le coach publie dans le canal Communauté d'UN groupe
// (ville + n° de challenge) — seuls ses membres le voient — ou en diffusion à tous.
function openGroupComposer(ville, no) {
  document.querySelectorAll('.ch-modal').forEach((m) => m.remove());
  const label = (ville && no) ? `${ville} · Challenge n°${no}` : 'Tous les clients';
  const modal = document.createElement('div');
  modal.className = 'ch-modal';
  modal.innerHTML = `
    <div class="ch-modal-card">
      <button type="button" class="ch-modal-close" aria-label="Fermer">×</button>
      <h3>Écrire au groupe</h3>
      <p class="sub">Ce message apparaît dans la Communauté de <b>${chEsc(label)}</b>. Les clients des autres groupes ne le voient pas.</p>
      <form class="ch-form" id="ch-grp-form" style="flex-direction:column;align-items:stretch">
        <label style="width:100%">Message au groupe<textarea name="message" placeholder="Ex. Bravo pour cette semaine, on garde le rythme 💪" style="min-height:96px"></textarea></label>
        <label style="display:flex;flex-direction:row;align-items:center;gap:8px;font-weight:600;color:#374151;"><input type="checkbox" name="all" style="width:auto"> Envoyer plutôt à <b>tous les clients</b> (diffusion)</label>
        <button type="submit" class="ch-btn" style="align-self:flex-start">Publier</button>
      </form>
      <div class="ch-msg" id="ch-grp-status"></div>
    </div>`;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('.ch-modal-close').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  const status = modal.querySelector('#ch-grp-status');
  modal.querySelector('#ch-grp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target; const btn = f.querySelector('button[type=submit]');
    const message = f.message.value.trim();
    if (!message) { status.textContent = 'Message vide.'; status.className = 'ch-msg err'; return; }
    const toAll = f.all.checked;
    btn.disabled = true; status.textContent = 'Publication…'; status.className = 'ch-msg';
    try {
      const body = toAll ? { message } : { message, ville, challengeNo: no };
      await nutriApi('/coach/community', { method: 'POST', body });
      status.textContent = toAll ? 'Publié pour tous ✓' : `Publié pour ${label} ✓`;
      status.className = 'ch-msg ok';
      f.message.value = '';
      setTimeout(close, 900);
    } catch (err) { status.textContent = err.message || 'Erreur.'; status.className = 'ch-msg err'; btn.disabled = false; }
  });
}

// Modale « Inviter un client » : génère un lien d'invitation (email facultatif) + partage.
function openInvitePanel() {
  document.querySelectorAll('.ch-modal').forEach((m) => m.remove());
  const modal = document.createElement('div');
  modal.className = 'ch-modal';
  modal.innerHTML = `
    <div class="ch-modal-card">
      <button type="button" class="ch-modal-close" aria-label="Fermer">×</button>
      <h3>Inviter un client</h3>
      <p class="sub">Génère un lien d'invitation. Le client crée son espace et choisit son code PIN. Lien valable 21 jours.</p>
      <form class="ch-form" id="ch-inv-form" style="flex-direction:column;align-items:stretch">
        <label>Prénom (facultatif)<input type="text" name="prenom" placeholder="Ex. Marie"></label>
        <label>Email (facultatif)<input type="email" name="email" placeholder="Ex. marie@email.com"></label>
        <button type="submit" class="ch-btn" style="align-self:flex-start">Générer le lien</button>
      </form>
      <div id="ch-inv-result"></div>
      <div class="ch-msg" id="ch-inv-msg"></div>
    </div>`;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('.ch-modal-close').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  const msg = modal.querySelector('#ch-inv-msg');
  modal.querySelector('#ch-inv-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target; const btn = f.querySelector('button');
    const body = { prenom: f.prenom.value.trim(), email: f.email.value.trim() };
    btn.disabled = true; msg.textContent = 'Génération…'; msg.className = 'ch-msg';
    try {
      const r = await nutriApi('/coach/invites', { method: 'POST', body });
      const url = r.url;
      const waText = encodeURIComponent(`Salut${body.prenom ? ' ' + body.prenom : ''} ! Voici ton accès à My Coach Nutrition : ${url}`);
      const mailSub = encodeURIComponent('Ton accès My Coach Nutrition');
      const mailBody = encodeURIComponent(`Bonjour${body.prenom ? ' ' + body.prenom : ''},\n\nVoici ton lien pour créer ton espace : ${url}\n\nÀ bientôt !`);
      modal.querySelector('#ch-inv-result').innerHTML = `
        <div class="ch-link-box">
          <input type="text" readonly value="${chEsc(url)}" id="ch-inv-url">
          <button type="button" class="ch-btn" id="ch-inv-copy">Copier</button>
        </div>
        <div class="ch-share-row">
          <a class="ch-share-wa" href="https://wa.me/?text=${waText}" target="_blank" rel="noopener">Partager sur WhatsApp</a>
          <a class="ch-share-mail" href="mailto:${encodeURIComponent(body.email)}?subject=${mailSub}&body=${mailBody}">Par email</a>
        </div>`;
      msg.textContent = r.emailSent ? 'Email envoyé au client ✓' : 'Lien prêt — partage-le au client.';
      msg.className = 'ch-msg ok';
      const copyBtn = modal.querySelector('#ch-inv-copy');
      copyBtn.addEventListener('click', () => {
        const inp = modal.querySelector('#ch-inv-url'); inp.select();
        try { navigator.clipboard.writeText(inp.value); } catch (_) { try { document.execCommand('copy'); } catch (__) {} }
        copyBtn.textContent = 'Copié ✓';
      });
    } catch (err) { msg.textContent = err.message || 'Erreur.'; msg.className = 'ch-msg err'; }
    btn.disabled = false;
  });
}

async function openChallengeClient(host, email) {
  host.innerHTML = '<div class="ch-loading">Chargement de la fiche…</div>';
  try {
    const [ficheRes, parcRes, convRes] = await Promise.all([
      nutriApi(`/coach/clients/${encodeURIComponent(email)}`),
      nutriApi(`/coach/parcours/${encodeURIComponent(email)}`).catch(() => ({ parcours: null })),
      nutriApi(`/coach/conversations`).catch(() => ({ conversations: [] })),
    ]);
    const conv = (convRes.conversations || []).find((cv) => cv.clientEmail === email) || null;
    let messages = [];
    if (conv && conv.id) {
      try { const m = await nutriApi(`/coach/conversations/${conv.id}/messages`); messages = m.messages || []; } catch (_) { /* fil vide si erreur */ }
    }
    renderChallengeDetail(host, ficheRes.client, parcRes.parcours, { convId: conv && conv.id, messages });
  } catch (e) {
    host.innerHTML = `<button class="ch-back" data-act="back">‹ Retour</button>
      <div class="ch-empty"><p>Impossible de charger cette fiche.</p><p class="ch-muted">${chEsc(e.message || '')}</p></div>`;
    const b = host.querySelector('[data-act="back"]');
    if (b) b.addEventListener('click', () => loadChallengeTab());
  }
}

function chConvTime(iso) { const d = new Date(iso); if (isNaN(d.getTime())) return ''; return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
function renderChallengeDetail(host, c, pc, msgData) {
  const name = [c.prenom, c.nom].filter(Boolean).join(' ') || c.email;
  const p = c.profil || {};
  const isCh = chIsChallenge(c.objectif);

  // ── Profil & objectif
  const kv = (k, v) => (v || v === 0) && String(v).trim() !== '' ? `<div class="ch-kv"><span class="k">${k}</span><span class="v">${chEsc(v)}</span></div>` : '';
  const allerg = (p.allergies || []).length ? `<div style="margin-top:10px"><div class="ch-kv" style="border:none;padding-bottom:4px"><span class="k">Allergies</span></div><div class="ch-chips">${p.allergies.map((a) => `<span class="ch-chip">${chEsc(a)}</span>`).join('')}</div></div>` : '';
  const regimes = (p.regimes || []).length ? `<div style="margin-top:10px"><div class="ch-kv" style="border:none;padding-bottom:4px"><span class="k">Régimes</span></div><div class="ch-chips">${p.regimes.map((a) => `<span class="ch-chip">${chEsc(a)}</span>`).join('')}</div></div>` : '';
  const profilPanel = `
    <div class="ch-panel">
      <h3>Profil & objectif</h3>
      ${kv('Objectif', chObjLabel(c.objectif))}
      ${kv('Sexe', p.sexe === 'h' ? 'Homme' : p.sexe === 'f' ? 'Femme' : p.sexe)}
      ${kv('Âge', p.age ? p.age + ' ans' : '')}
      ${kv('Taille', p.taille ? p.taille + ' cm' : '')}
      ${kv('Poids de départ', p.poidsDepart ? p.poidsDepart + ' kg' : '')}
      ${kv('Poids cible', p.poidsCible ? p.poidsCible + ' kg' : '')}
      ${kv('Activité', p.activite)}
      ${p.ajustementKcal ? kv('Ajustement', (p.ajustementKcal > 0 ? '+' : '') + p.ajustementKcal + ' kcal') : ''}
      ${kv('Plan', c.hasPlan ? (c.planJours ? c.planJours + ' jours' : 'actif') : 'en attente')}
      ${allerg}${regimes}
    </div>`;

  // ── Pesées & évolution
  let peseePanel;
  if (pc) {
    const jal = (key, lbl) => {
      const j = (pc.pesees || {})[key];
      const done = j && j.poids;
      return `<div class="ch-jalon${done ? ' done' : ''}">
        <div class="lbl">${lbl}</div>
        <div class="w">${done ? j.poids + '<small> kg</small>' : '—'}</div>
        <div class="d">${done ? chDateFr(j.date) : 'à venir'}</div>
      </div>`;
    };
    const dep = (pc.pesees || {}).depart;
    const last = ((pc.pesees || {}).s6 && pc.pesees.s6.poids) ? pc.pesees.s6 : (((pc.pesees || {}).s3 && pc.pesees.s3.poids) ? pc.pesees.s3 : null);
    let deltaHtml = '';
    if (dep && dep.poids && last && last.poids) {
      const d = Math.round((last.poids - dep.poids) * 10) / 10;
      deltaHtml = `<div class="ch-delta ${d <= 0 ? 'down' : 'up'}">${d <= 0 ? '▼' : '▲'} ${Math.abs(d)} kg depuis le départ</div>`;
    } else if (pc.poidsObjectif != null) {
      deltaHtml = `<div class="ch-delta down">🎯 Objectif : ${pc.poidsObjectif} kg</div>`;
    }
    peseePanel = `<div class="ch-panel">
      <h3>Pesées & évolution</h3>
      <div class="ch-jalons">${jal('depart', 'Départ')}${jal('s3', 'Semaine 3')}${jal('s6', 'Semaine 6')}</div>
      ${deltaHtml}
    </div>`;
  } else {
    peseePanel = '<div class="ch-panel"><h3>Pesées & évolution</h3><p class="ch-muted" style="font-size:13px">Aucune donnée de parcours pour ce client.</p></div>';
  }

  // ── Séances, régularité & adhérence
  let suiviPanel = '<div class="ch-panel"><h3>Séances & régularité</h3>';
  if (pc) {
    const nbSeances = (pc.seances || []).length;
    const objTot = pc.seancesObjTotal || 24;
    const pctSeance = Math.min(100, Math.round((nbSeances / objTot) * 100));
    const reg = pc.regularite || {};
    suiviPanel += `
      <div class="ch-kv"><span class="k">Séances validées</span><span class="v">${nbSeances} / ${objTot}</span></div>
      <div class="ch-progress"><i style="width:${pctSeance}%"></i></div>
      <div class="ch-kv"><span class="k">Adhérence repas</span><span class="v">${reg.pct || 0}%</span></div>
      <div class="ch-progress"><i style="width:${reg.pct || 0}%"></i></div>
      <div class="ch-kv"><span class="k">Repas suivis</span><span class="v">${reg.repasValides || 0} / ${reg.repasTotal || 0}</span></div>
      <div class="ch-kv"><span class="k">Journées validées</span><span class="v">${reg.journeesValidees || 0}</span></div>`;
    if (c.adhScore != null) suiviPanel += `<div class="ch-kv"><span class="k">Score adhérence (30 j)</span><span class="v">${c.adhScore}/100</span></div>`;
  } else {
    suiviPanel += '<p class="ch-muted" style="font-size:13px">Aucune donnée de suivi.</p>';
  }
  suiviPanel += '</div>';

  // ── Actions
  // Date LOCALE : toISOString() renvoie la date UTC et décalait la séance d'un
  // jour en soirée/nuit (minuit local = la veille en UTC).
  const today = chYmd(new Date());
  const seanceToday = pc && (pc.seances || []).includes(today);
  // ── Conversation (fil + composeur) : le coach voit et répond directement.
  const msgs = (msgData && msgData.messages) || [];
  const thread = msgs.length
    ? msgs.map((m) => `<div class="ch-bubble ${m.mine ? 'me' : 'them'}"><span>${chEsc(m.text || '')}</span><span class="t">${chEsc(m.who || '')} · ${chConvTime(m.when)}</span></div>`).join('')
    : '<div class="ch-conv-empty">Aucun message pour l’instant. Écris le premier ci-dessous.</div>';
  const convPanel = `
    <div class="ch-panel">
      <h3>💬 Conversation</h3>
      <div class="ch-conv" id="ch-conv">${thread}</div>
      <form class="ch-form" id="ch-msg-form" style="flex-direction:column;align-items:stretch">
        <label style="width:100%">Répondre à ${chEsc(c.prenom || name)}<textarea name="message" placeholder="Ton message…"></textarea></label>
        <button type="submit" class="ch-btn" style="align-self:flex-start">Envoyer</button>
      </form>
      <div class="ch-msg" id="ch-msg-status"></div>
    </div>`;

  const actionsPanel = `
    <div class="ch-panel ch-actions">
      <h3>Actions</h3>
      <form class="ch-form" id="ch-org-form">
        <label>Ville<input type="text" name="ville" value="${chEsc(c.ville || '')}" placeholder="Ex. Lyon"></label>
        <label>N° de challenge<input type="number" name="challengeNo" min="0" max="999" value="${c.challengeNo || ''}" placeholder="Ex. 3"></label>
        <button type="submit" class="ch-btn">Ranger</button>
      </form>
      <form class="ch-form" id="ch-pesee-form">
        <label>Pesée
          <select name="type">
            <option value="depart">Départ</option>
            <option value="s3">Semaine 3</option>
            <option value="s6">Semaine 6</option>
          </select>
        </label>
        <label>Poids (kg)<input type="number" name="poids" step="0.1" min="20" max="300" required></label>
        <label>Date<input type="date" name="date" value="${today}"></label>
        <button type="submit" class="ch-btn">Enregistrer la pesée</button>
      </form>
      <div>
        <button type="button" class="ch-btn sec${seanceToday ? ' on' : ''}" id="ch-seance-btn">${seanceToday ? '✓ Séance validée aujourd’hui' : '+ Valider une séance aujourd’hui'}</button>
      </div>
      <div class="ch-msg" id="ch-action-msg"></div>
      <div><button type="button" class="ch-btn danger" id="ch-delete-btn">Supprimer ce client</button></div>
    </div>`;

  host.innerHTML = `
    <button class="ch-back" data-act="back">‹ Tous mes clients</button>
    <div class="ch-detail-head">
      <span class="ch-ava">${chEsc(chInitials(c.prenom, c.nom))}</span>
      <div>
        <h2>${chEsc(name)} ${isCh ? '<span class="ch-badge">🔥</span>' : ''}</h2>
        <div class="ch-obj">${chEsc(c.email)}</div>
      </div>
    </div>
    <div class="ch-grid">${profilPanel}${peseePanel}${suiviPanel}</div>
    ${convPanel}
    ${actionsPanel}`;

  // ── Wiring
  const email = c.email;
  host.querySelector('[data-act="back"]').addEventListener('click', () => loadChallengeTab());
  const msgBox = host.querySelector('#ch-action-msg');
  const setMsg = (txt, ok) => { msgBox.textContent = txt; msgBox.className = 'ch-msg ' + (ok ? 'ok' : 'err'); };

  host.querySelector('#ch-org-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target; const btn = f.querySelector('button');
    btn.disabled = true;
    try {
      await nutriApi(`/coach/clients/${encodeURIComponent(email)}/meta`, { method: 'POST', body: { ville: f.ville.value.trim(), challengeNo: Number(f.challengeNo.value) || 0 } });
      setMsg('Client rangé ✓', true);
    } catch (err) { setMsg(err.message || 'Erreur.', false); }
    btn.disabled = false;
  });

  host.querySelector('#ch-pesee-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector('button');
    const type = f.type.value;
    const poids = parseFloat(f.poids.value);
    const date = f.date.value || today;
    if (!(poids > 0)) { setMsg('Poids invalide.', false); return; }
    btn.disabled = true;
    try {
      await nutriApi('/parcours/pesee', { method: 'POST', body: { email, type, poids, date } });
      setMsg('Pesée enregistrée ✓', true);
      openChallengeClient(host, email);
    } catch (err) { setMsg(err.message || 'Erreur.', false); btn.disabled = false; }
  });

  host.querySelector('#ch-seance-btn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await nutriApi('/parcours/seance', { method: 'POST', body: { email, date: today } });
      openChallengeClient(host, email);
    } catch (err) { setMsg(err.message || 'Erreur.', false); btn.disabled = false; }
  });

  const convStatus = host.querySelector('#ch-msg-status');
  const setConvMsg = (txt, ok) => { convStatus.textContent = txt; convStatus.className = 'ch-msg ' + (ok ? 'ok' : 'err'); };
  const convEl = host.querySelector('#ch-conv'); if (convEl) convEl.scrollTop = convEl.scrollHeight; // fil déroulé en bas

  host.querySelector('#ch-msg-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector('button');
    const message = f.message.value.trim();
    if (!message) { setConvMsg('Message vide.', false); return; }
    btn.disabled = true;
    try {
      const { conversationId } = await nutriApi('/coach/conversations', { method: 'POST', body: { client_email: email } });
      await nutriApi(`/coach/conversations/${conversationId}/reply`, { method: 'POST', body: { message } });
      openChallengeClient(host, email); // recharge le fil avec le nouveau message
    } catch (err) { setConvMsg(err.message || 'Erreur.', false); btn.disabled = false; }
  });

  host.querySelector('#ch-delete-btn').addEventListener('click', async () => {
    if (!window.confirm(`Supprimer définitivement ${name} et toutes ses données ?\n\nCette action est irréversible.`)) return;
    setMsg('Suppression…', true);
    try {
      await nutriApi(`/coach/clients/${encodeURIComponent(email)}`, { method: 'DELETE' });
      loadChallengeTab();
    } catch (err) { setMsg(err.message || 'Suppression impossible.', false); }
  });
}
