// ═════════════════════════════════════════════════════════════════════════
// PAGE AUTONOME /standard — photos quotidiennes du studio (club test : Tours)
// Version épurée de l'onglet Standards de l'app : uniquement les photos
// (2 rangées Matin / Après-midi). Pas d'indicateurs du jour, pas de check-in.
// ═════════════════════════════════════════════════════════════════════════

'use strict';

// Studio en test — figé pour cette page.
const STD_STUDIO = 'Tours';

// Session partagée avec l'app principale (mêmes clés localStorage) : si le
// coach est déjà connecté sur app.stanmartinapp.cloud, il l'est aussi ici.
let authToken = localStorage.getItem('authToken') || null;
let currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');

let standardsDate = null;      // YYYY-MM-DD affiché
let standardsSlotsDef = [];    // définition des 12 slots (id, label, icon, coach)

// Une seule prise de poste affichée à la fois : Matin (rangée 1) avant
// STD_SHIFT_SWITCH_HOUR heures, Après-midi (rangée 2) ensuite. Les contrôles
// précédents restent accessibles derrière un bouton.
const STD_SHIFT_SWITCH_HOUR = 13;
let stdShowPrevious = false;   // état du volet « contrôles précédents »

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ─── Rôles / permissions ────────────────────────────────────
function isAdmin() { return currentUser && currentUser.role === 'admin'; }
function isCoachLeader() { return currentUser && currentUser.role === 'coach_leader'; }
function isGuest() { return currentUser && currentUser.role === 'guest'; }
function isStandardsAdmin() { return currentUser && currentUser.role === 'standards_admin'; }
function hasStandardsAccess() {
  return isAdmin() || isCoachLeader() || isGuest() || isStandardsAdmin();
}
function canViewStandardsHistory() {
  if (!currentUser) return false;
  if (currentUser.role === 'admin' || currentUser.role === 'standards_admin') return true;
  return currentUser.role === 'coach_leader' && currentUser.can_view_history === true;
}

// ─── Icônes SVG inline (Lucide-style, currentColor) ─────────
const STD_ICONS = {
  spreadsheet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>',
  clipboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6"/><path d="M9 16h6"/></svg>',
  dumbbell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 5v14"/><path d="M18 5v14"/><path d="M3 9v6"/><path d="M21 9v6"/><path d="M6 12h12"/></svg>',
  activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  shower: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l16 16"/><path d="M14 4l4-2 3 3-2 4"/><circle cx="9" cy="13" r="0.5" fill="currentColor"/><circle cx="13" cy="15" r="0.5" fill="currentColor"/><circle cx="11" cy="17" r="0.5" fill="currentColor"/><circle cx="7" cy="17" r="0.5" fill="currentColor"/><circle cx="9" cy="20" r="0.5" fill="currentColor"/></svg>',
  shirt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><polyline points="21 3 21 8 16 8"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><polyline points="3 21 3 16 8 16"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="4"/><path d="M5.5 21a6.5 6.5 0 0 1 13 0"/></svg>',
};

const STD_SLOT_ICONS = {
  excel_adherent: 'spreadsheet',
  tableau_pret: 'clipboard',
  salle_entrainement: 'dumbbell',
  salle_entrainement_2: 'activity',
  sdb: 'shower',
  chic_coach: 'shirt',
};

function stdGetIcon(slotId) {
  const baseId = String(slotId || '').replace(/^c[12]_/, '');
  const key = STD_SLOT_ICONS[baseId];
  return key ? STD_ICONS[key] : STD_ICONS.camera;
}

// ─── Dates ──────────────────────────────────────────────────
const STD_DAYS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const STD_MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

function standardsTodayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// Format court pour l'en-tête compact : « Mardi 21 juillet » (l'année
// n'est ajoutée que si elle diffère de l'année en cours).
function standardsFormatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = STD_DAYS_FR[dt.getUTCDay()];
  const base = `${dow} ${String(d).padStart(2, '0')} ${(STD_MONTHS_FR[m - 1] || '').toLowerCase()}`;
  return y === new Date().getFullYear() ? base : `${base} ${y}`;
}
function standardsShiftDate(iso, delta) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

// ─── Login / logout ─────────────────────────────────────────
function showLogin() {
  document.getElementById('std-login').classList.remove('hidden');
  document.getElementById('tab-standards').classList.add('hidden');
  const pinInput = document.getElementById('std-login-pin');
  if (pinInput) { pinInput.value = ''; pinInput.focus(); }
}

function showApp() {
  document.getElementById('std-login').classList.add('hidden');
  document.getElementById('tab-standards').classList.remove('hidden');
}

async function onLoginSubmit(e) {
  e.preventDefault();
  const pinInput = document.getElementById('std-login-pin');
  const submitBtn = document.getElementById('std-login-submit');
  const errEl = document.getElementById('std-login-error');
  errEl.style.display = 'none';
  submitBtn.disabled = true;
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pinInput.value }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.token) {
      errEl.textContent = data.error || 'Code PIN incorrect';
      errEl.style.display = 'block';
      return;
    }
    authToken = data.token;
    // Même forme que l'app principale pour partager la session
    currentUser = {
      role: data.role,
      name: data.name,
      sales_rep_id: data.sales_rep_id,
      studio: data.studio || null,
      coach_leader_id: data.coach_leader_id || null,
      coach_id: data.coach_id || null,
      is_leader: data.is_leader || false,
      can_view_history: data.can_view_history === true,
      coach_slot: (data.coach_slot === 1 || data.coach_slot === 2) ? data.coach_slot : null,
    };
    localStorage.setItem('authToken', authToken);
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    await bootStandardsPage();
  } catch (_) {
    errEl.textContent = 'Erreur réseau — réessaie.';
    errEl.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
  }
}

function logout() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('authToken');
  localStorage.removeItem('currentUser');
  standardsThumbCache.forEach(url => URL.revokeObjectURL(url));
  standardsThumbCache.clear();
  showLogin();
}

// ─── Boot ───────────────────────────────────────────────────
async function bootStandardsPage() {
  if (!authToken) { showLogin(); return; }
  if (currentUser && !hasStandardsAccess()) {
    showApp();
    document.getElementById('std-categories').innerHTML =
      `<div class="std-empty">Accès réservé aux coachs, coach leaders et administrateurs.</div>`;
    return;
  }
  const headers = { 'Authorization': `Bearer ${authToken}` };
  try {
    const sl = await fetch('/api/standards/daily/slots', { headers });
    if (sl.status === 401) { logout(); return; }
    if (sl.status === 403) {
      showApp();
      document.getElementById('std-categories').innerHTML =
        `<div class="std-empty">Accès réservé aux coachs, coach leaders et administrateurs.</div>`;
      return;
    }
    if (sl.ok) {
      const d = await sl.json();
      standardsSlotsDef = d.slots || [];
    }
  } catch (_) { standardsSlotsDef = []; }

  // Pas d'accès à l'historique → flèches masquées, jour courant uniquement
  if (!canViewStandardsHistory()) {
    const prevBtn = document.getElementById('std-month-prev');
    const nextBtn = document.getElementById('std-month-next');
    if (prevBtn) prevBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';
  }

  standardsDate = standardsTodayDate();
  stdShowPrevious = false;
  showApp();
  standardsRender();
}

// ─── Rendu principal ────────────────────────────────────────
async function standardsRender() {
  const dateLabel = document.getElementById('std-month-label');
  if (dateLabel) dateLabel.textContent = standardsFormatDate(standardsDate);
  // Pas de navigation vers le futur
  const nextBtn = document.getElementById('std-month-next');
  if (nextBtn) {
    const today = standardsTodayDate();
    if (standardsDate >= today) {
      nextBtn.disabled = true;
      nextBtn.style.opacity = '0.3';
      nextBtn.style.cursor = 'not-allowed';
      nextBtn.title = 'Pas de navigation vers le futur';
    } else {
      nextBtn.disabled = false;
      nextBtn.style.opacity = '';
      nextBtn.style.cursor = '';
      nextBtn.title = '';
    }
  }
  const container = document.getElementById('std-categories');
  const scoreEl = document.getElementById('std-score-display');
  if (scoreEl) scoreEl.innerHTML = '';
  const progressInline = document.getElementById('std-progress-inline');
  if (progressInline) progressInline.textContent = '—';
  if (!container) return;
  container.innerHTML = `<div class="std-loading">Chargement…</div>`;
  try {
    const headers = { 'Authorization': `Bearer ${authToken}` };
    const dailyUrl = `/api/standards/daily?studio=${encodeURIComponent(STD_STUDIO)}&date=${encodeURIComponent(standardsDate)}`;
    const res = await fetch(dailyUrl, { headers });
    if (res.status === 401) { logout(); return; }
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || ('HTTP ' + res.status));
    }
    const daily = await res.json();
    standardsRenderDaily(daily);
  } catch (err) {
    container.innerHTML = `<div class="std-error">Erreur : ${escapeHtml(String(err.message || err))}</div>`;
  }
}

// Composant card photo. status ∈ { 'todo' | 'validated' }
function renderStandardPhotoCard(props) {
  const { title, slotId, slotKey, status, hasPhoto, readOnly, uploadedBy, uploadedAt, isNext } = props;
  const fmtDateTime = (iso) => {
    if (!iso) return '';
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    return m ? `${m[3]}/${m[2]} · ${m[4]}:${m[5]}` : iso;
  };
  const iconSvg = stdGetIcon(slotId);
  const badges = {
    todo: '<span class="std-badge std-badge-todo">À faire</span>',
    validated: '<span class="std-badge std-badge-validated">✓ Validée</span>',
  };
  const badge = badges[status] || badges.todo;

  if (hasPhoto) {
    return `
      <article class="std-card std-card-filled" data-slot="${escapeHtml(slotKey)}">
        <button type="button" class="std-card-photo" data-slot-action="view" data-slot-key="${escapeHtml(slotKey)}" title="Voir en grand">
          <img class="std-card-img std-slot-thumb-img" data-thumb-key="${escapeHtml(slotKey)}" alt="${escapeHtml(title)}">
        </button>
        <div class="std-card-body">
          <header class="std-card-head">
            <span class="std-card-icon">${iconSvg}</span>
            <h4 class="std-card-title">${escapeHtml(title)}</h4>
            ${badge}
          </header>
          <div class="std-card-meta">
            <span class="std-card-meta-user">${STD_ICONS.user}<span>${escapeHtml(uploadedBy || '?')}</span></span>
            <span class="std-card-meta-when">${escapeHtml(fmtDateTime(uploadedAt))}</span>
          </div>
          ${readOnly ? '' : `
            <div class="std-card-actions">
              <button type="button" class="std-card-action-btn std-card-replace" data-slot-action="replace" data-slot-key="${escapeHtml(slotKey)}" title="Reprendre la photo">${STD_ICONS.refresh}<span>Remplacer</span></button>
              <button type="button" class="std-card-action-btn std-card-delete" data-slot-action="delete" data-slot-key="${escapeHtml(slotKey)}" title="Supprimer">${STD_ICONS.trash}</button>
            </div>
          `}
        </div>
      </article>
    `;
  }

  return `
    <article class="std-card std-card-empty ${isNext ? 'std-card-next' : ''}" data-slot="${escapeHtml(slotKey)}">
      ${isNext ? '<span class="std-card-next-tag">Suivant</span>' : ''}
      <div class="std-card-empty-body">
        <header class="std-card-head">
          <span class="std-card-icon">${iconSvg}</span>
          <h4 class="std-card-title">${escapeHtml(title)}</h4>
          ${badge}
        </header>
        ${readOnly ? `
          <div class="std-card-readonly-note">Aucune photo ce jour-là</div>
        ` : `
          <button type="button" class="std-card-primary" data-slot-action="upload" data-slot-key="${escapeHtml(slotKey)}">
            ${STD_ICONS.camera}
            <span class="std-card-primary-long">Prendre la photo</span>
            <span class="std-card-primary-short">Photo</span>
          </button>
          <input type="file" accept="image/*" capture="environment" class="std-slot-input" data-slot-key="${escapeHtml(slotKey)}" style="display:none">
        `}
      </div>
    </article>
  `;
}

function standardsRenderDaily(data) {
  const container = document.getElementById('std-categories');
  if (!container) return;
  const slots = data.slots || {};
  const today = standardsTodayDate();
  const readOnly = isStandardsAdmin() || ((isCoachLeader() || isGuest()) && standardsDate !== today);
  // Filtre selon le coach_slot de l'utilisateur (1 ou 2). NULL = tout voir.
  const userCoachSlot = currentUser && currentUser.coach_slot;
  const allDefs = standardsSlotsDef || [];
  const defsAll = (userCoachSlot === 1 || userCoachSlot === 2)
    ? allDefs.filter(d => d.coach === userCoachSlot)
    : allDefs;

  // ─── Prise de poste courante ──────────────────────────────
  // Aujourd'hui : Matin avant STD_SHIFT_SWITCH_HOUR h, Après-midi ensuite.
  // Jour passé : on affiche la dernière prise de poste (Après-midi),
  // les précédentes restent derrière le bouton.
  const hasCoachField = defsAll.some(d => d.coach != null);
  const groups = hasCoachField
    ? [1, 2].map(n => ({ num: n, defs: defsAll.filter(d => d.coach === n) })).filter(g => g.defs.length > 0)
    : [{ num: null, defs: defsAll }];
  const isToday = standardsDate === today;
  const currentShift = isToday
    ? (new Date().getHours() < STD_SHIFT_SWITCH_HOUR ? 1 : 2)
    : 2;
  const primaryGroup = groups.find(g => g.num === currentShift) || groups[groups.length - 1] || { num: null, defs: [] };
  const previousGroups = groups.filter(g => g.num != null && primaryGroup.num != null && g.num < primaryGroup.num);

  // Progression calculée sur la prise de poste affichée uniquement
  const progressDefs = primaryGroup.defs;
  const doneCount = progressDefs.reduce((n, def) => n + ((slots[def.id] && slots[def.id].has_photo) ? 1 : 0), 0);
  const total = progressDefs.length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const nextSlot = progressDefs.find(def => !(slots[def.id] && slots[def.id].has_photo));
  const nextSlotId = nextSlot ? nextSlot.id : null;
  container.dataset.nextSlot = nextSlotId || '';

  // Compteur inline dans l'en-tête compact : « 0/6 espaces contrôlés »
  const progressInline = document.getElementById('std-progress-inline');
  if (progressInline) progressInline.textContent = `${doneCount}/${total} espaces contrôlés`;

  // Raccourci « Suivant » compact (à droite de l'en-tête)
  const scoreEl = document.getElementById('std-score-display');
  if (scoreEl) {
    if (nextSlot && !readOnly) {
      scoreEl.innerHTML = `
        <button type="button" class="stdp-next" data-next-slot="${escapeHtml(nextSlot.id)}">
          <span class="stdp-next-label">Suivant</span>
          <strong>${escapeHtml(nextSlot.label)}</strong>
          <span>→</span>
        </button>
      `;
      const jumpBtn = scoreEl.querySelector('[data-next-slot]');
      jumpBtn.addEventListener('click', () => {
        const target = jumpBtn.dataset.nextSlot;
        const targetCard = document.querySelector(`.std-card[data-slot="${target}"]`);
        if (targetCard) {
          targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetCard.classList.add('std-card-pulse');
          setTimeout(() => targetCard.classList.remove('std-card-pulse'), 1200);
        }
      });
    } else if (pct >= 100 && total > 0) {
      scoreEl.innerHTML = `<span class="stdp-done">✓ Prise de poste complète</span>`;
    } else {
      scoreEl.innerHTML = '';
    }
  }

  const renderSlot = (def) => {
    const s = slots[def.id] || {};
    const hasPhoto = !!s.has_photo;
    return renderStandardPhotoCard({
      title: def.label,
      slotId: def.id,
      slotKey: def.id,
      status: hasPhoto ? 'validated' : 'todo',
      hasPhoto,
      readOnly,
      uploadedBy: s.uploaded_by || null,
      uploadedAt: s.uploaded_at || null,
      isNext: def.id === nextSlotId,
    });
  };

  if (defsAll.length === 0) {
    container.innerHTML = `<div class="std-empty">Aucun emplacement photo configuré.</div>`;
    return;
  }
  const shiftLabel = (n) => n === 1 ? 'Matin' : 'Après-midi';
  const renderGroup = (g) => `
    <section class="std-group">
      ${g.num != null ? `<div class="std-group-head">Prise de poste — ${shiftLabel(g.num)}</div>` : ''}
      <div class="std-slots-grid">${g.defs.map(renderSlot).join('')}</div>
    </section>
  `;
  // Une seule prise de poste affichée ; les précédentes derrière un bouton.
  const bodyHtml = `
    ${renderGroup(primaryGroup)}
    ${previousGroups.length ? `
      <button type="button" class="std-prev-toggle" id="std-prev-toggle">
        ${stdShowPrevious ? 'Masquer les contrôles précédents' : 'Voir les contrôles précédents'}
      </button>
      <div class="std-prev-wrap ${stdShowPrevious ? '' : 'hidden'}" id="std-prev-groups">
        ${previousGroups.map(renderGroup).join('')}
      </div>
    ` : ''}
  `;
  container.innerHTML = `
    ${readOnly ? `
      <div class="std-readonly-banner">
        🔒 Lecture seule — ${isStandardsAdmin()
          ? 'tu peux consulter les photos mais pas modifier les uploads.'
          : 'tu peux consulter les photos mais pas les modifier pour les jours passés.'}
      </div>
    ` : ''}
    ${bodyHtml}
  `;
  // Bouton « contrôles précédents » : simple toggle, l'état survit aux re-rendus
  const prevToggle = container.querySelector('#std-prev-toggle');
  if (prevToggle) {
    prevToggle.addEventListener('click', () => {
      stdShowPrevious = !stdShowPrevious;
      const wrap = container.querySelector('#std-prev-groups');
      if (wrap) wrap.classList.toggle('hidden', !stdShowPrevious);
      prevToggle.textContent = stdShowPrevious ? 'Masquer les contrôles précédents' : 'Voir les contrôles précédents';
    });
  }
  // Miniatures des slots remplis
  container.querySelectorAll('.std-slot-thumb-img').forEach(img => {
    const slot = img.dataset.thumbKey;
    standardsLoadThumb(slot, img);
  });
  // Bindings actions cards
  container.querySelectorAll('[data-slot-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.slotAction;
      const slotKey = btn.dataset.slotKey;
      if (action === 'upload' || action === 'replace') {
        const input = container.querySelector(`.std-slot-input[data-slot-key="${slotKey}"]`);
        if (input) input.click();
      } else if (action === 'view') {
        standardsViewDailyPhoto(slotKey);
      } else if (action === 'delete') {
        if (confirm('Supprimer la photo de ce créneau ?')) standardsDeleteDailyPhoto(slotKey);
      }
    });
  });
  container.querySelectorAll('.std-slot-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const slotKey = input.dataset.slotKey;
      await standardsUploadDailyPhoto(slotKey, file);
      input.value = '';
    });
  });
}

// ─── Miniatures (cache blob URLs) ───────────────────────────
const standardsThumbCache = new Map();

async function standardsLoadThumb(slot, imgEl) {
  const key = `${STD_STUDIO}|${standardsDate}|${slot}`;
  if (standardsThumbCache.has(key)) {
    imgEl.src = standardsThumbCache.get(key);
    return;
  }
  try {
    const url = `/api/standards/daily/photo?studio=${encodeURIComponent(STD_STUDIO)}&date=${encodeURIComponent(standardsDate)}&slot=${encodeURIComponent(slot)}`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${authToken}` } });
    if (!res.ok) return;
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    standardsThumbCache.set(key, blobUrl);
    imgEl.src = blobUrl;
  } catch (_) {
    // silencieux : fond gris + overlay « Voir »
  }
}

function standardsInvalidateThumb(slot) {
  const key = `${STD_STUDIO}|${standardsDate}|${slot}`;
  const url = standardsThumbCache.get(key);
  if (url) {
    URL.revokeObjectURL(url);
    standardsThumbCache.delete(key);
  }
}

// ─── Compression image (canvas) avant upload ────────────────
async function compressImageToBase64(file, maxDim = 1600, quality = 0.85) {
  const bitmap = await (async () => {
    if (typeof createImageBitmap === 'function') {
      try { return await createImageBitmap(file); } catch (_) {}
    }
    return await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
      img.src = url;
    });
  })();
  const srcW = bitmap.width || bitmap.naturalWidth;
  const srcH = bitmap.height || bitmap.naturalHeight;
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  if (bitmap.close) try { bitmap.close(); } catch (_) {}
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return { base64: dataUrl.replace(/^data:[^,]*,/, ''), mime: 'image/jpeg', width: w, height: h };
}

// ─── Toast ──────────────────────────────────────────────────
function showStandardsToast(message, type) {
  document.querySelectorAll('.std-toast').forEach(t => t.remove());
  const toast = document.createElement('div');
  toast.className = 'std-toast std-toast-' + (type || 'success');
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 250);
  }, 2400);
}

// ─── Upload / view / delete photo ───────────────────────────
async function standardsUploadDailyPhoto(slot, file) {
  if (!file.type.startsWith('image/')) {
    showStandardsToast('Format non supporté — image requise.', 'error');
    return;
  }
  if (file.size > 25 * 1024 * 1024) {
    showStandardsToast('Photo trop lourde (max 25 Mo brut).', 'error');
    return;
  }
  const card = document.querySelector(`.std-card[data-slot="${slot}"]`);
  if (card) card.classList.add('std-card-uploading');
  try {
    const { base64, mime } = await compressImageToBase64(file);
    const res = await fetch('/api/standards/daily/photo', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        studio: STD_STUDIO,
        date: standardsDate,
        slot,
        photo_base64: base64,
        mime,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || ('HTTP ' + res.status));
    }
    standardsInvalidateThumb(slot);
    if (card) card.classList.remove('std-card-uploading');
    showStandardsToast('✓ Photo envoyée', 'success');
    await standardsRender();
  } catch (err) {
    if (card) card.classList.remove('std-card-uploading');
    showStandardsToast('Erreur upload : ' + (err.message || err), 'error');
  }
}

async function standardsViewDailyPhoto(slot) {
  try {
    const url = `/api/standards/daily/photo?studio=${encodeURIComponent(STD_STUDIO)}&date=${encodeURIComponent(standardsDate)}&slot=${encodeURIComponent(slot)}`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${authToken}` } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    openStandardsLightbox(blobUrl);
  } catch (err) {
    alert('Erreur affichage photo : ' + (err.message || err));
  }
}

async function standardsDeleteDailyPhoto(slot) {
  try {
    const url = `/api/standards/daily/photo?studio=${encodeURIComponent(STD_STUDIO)}&date=${encodeURIComponent(standardsDate)}&slot=${encodeURIComponent(slot)}`;
    const res = await fetch(url, { method: 'DELETE', headers: { 'Authorization': `Bearer ${authToken}` } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    standardsInvalidateThumb(slot);
    await standardsRender();
  } catch (err) {
    alert('Erreur suppression photo : ' + (err.message || err));
  }
}

// ─── Lightbox plein écran ───────────────────────────────────
function openStandardsLightbox(src) {
  closeStandardsLightbox();
  const overlay = document.createElement('div');
  overlay.id = 'std-lightbox';
  overlay.className = 'std-lightbox';
  overlay.innerHTML = `
    <button type="button" class="std-lightbox-close" aria-label="Fermer">✕</button>
    <img class="std-lightbox-img" src="${escapeHtml(src)}" alt="Photo">
  `;
  overlay.dataset.blobUrl = src;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.classList.contains('std-lightbox-close')) {
      closeStandardsLightbox();
    }
  });
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeStandardsLightbox();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

function closeStandardsLightbox() {
  const existing = document.getElementById('std-lightbox');
  if (!existing) return;
  const blobUrl = existing.dataset.blobUrl;
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  existing.remove();
  document.body.style.overflow = '';
}

// ─── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('std-login-form')?.addEventListener('submit', onLoginSubmit);
  document.getElementById('std-logout')?.addEventListener('click', logout);
  document.getElementById('std-month-prev')?.addEventListener('click', () => {
    standardsDate = standardsShiftDate(standardsDate, -1);
    stdShowPrevious = false;
    standardsRender();
  });
  document.getElementById('std-month-next')?.addEventListener('click', () => {
    standardsDate = standardsShiftDate(standardsDate, +1);
    stdShowPrevious = false;
    standardsRender();
  });
  bootStandardsPage();
});
