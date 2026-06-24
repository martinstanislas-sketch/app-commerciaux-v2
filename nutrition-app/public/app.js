// app.js - My Coach Nutrition (front)
'use strict';

// ---------- Base d'URL + auth (intégration app principale) ----------
// L'app fonctionne en autonome (servie à la racine "/") OU montée sous "/nutrition/"
// dans l'app My Coach principale. On calcule le dossier courant pour que les appels
// API soient relatifs et tombent au bon endroit dans les deux cas.
const NUTRI_BASE = (function () {
  let p = location.pathname;
  if (!p.endsWith('/')) p = p.replace(/[^/]*$/, ''); // retire le fichier final
  return p || '/';
})();
function apiUrl(path) { return NUTRI_BASE + String(path).replace(/^\//, ''); }
// En contexte app principale, l'API /nutrition/api/* est protégée (admin) : on joint
// le token Bearer stocké par l'app principale (même origine). En autonome : pas de token.
function nutriAuthHeaders(base) {
  const h = Object.assign({}, base || {});
  let t = null;
  try { t = localStorage.getItem('authToken'); } catch (_) { /* ignore */ }
  if (t) h['Authorization'] = 'Bearer ' + t;
  return h;
}

const STORE_KEY = 'mycoach-nutrition-v1';
const TOTAL_STEPS = 5;

const state = {
  step: 1,
  profil: {},
  preferences: {},
  plan: null,
  source: 'demo',
  masquerCalories: false,
  portions: 1, // nombre de personnes (multiplie la liste de courses)
  favoris: [], // recettes favorites (objets complets) -> reproposees en priorite
  exclus: [], // ids de recettes "ne plus me proposer"
  suivi: {}, // adherence : cle "di-mi" -> { statut, autre:{repas,quantite,commentaire} }
  ia: false, // Claude actif ? (recettes guidees dynamiques) - renseigne par /api/status
  avance: {}, // analyse avancee niveau 2 (faim, grignotage, sport, etat...)
};

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

function normTxt(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}
function fmtQty(q) {
  const n = Math.round((Number(q) || 0) * 100) / 100;
  return Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// Icone SVG depuis le sprite (#ic-...) — pas d'emoji dans l'UI.
function icSvg(name) { return `<svg class="ic" aria-hidden="true"><use href="#ic-${name}"/></svg>`; }

// ---------- Table de substitution d'ingredients (mode demo) ----------
// Cle = morceau du nom (normalise) -> alternatives proposees au "swap".
const SUBSTITUTIONS = [
  { match: 'riz basmati', alts: ['Riz', 'Quinoa', 'Semoule'] },
  { match: 'riz a risotto', alts: ['Riz', 'Quinoa'] },
  { match: 'riz', alts: ['Quinoa', 'Semoule', 'Boulgour'] },
  { match: 'pates completes', alts: ['Pates', 'Riz complet', 'Quinoa'] },
  { match: 'pates', alts: ['Pates completes', 'Riz', 'Quinoa'] },
  { match: 'semoule', alts: ['Quinoa', 'Boulgour', 'Riz'] },
  { match: 'quinoa', alts: ['Riz', 'Boulgour', 'Semoule'] },
  { match: 'patate douce', alts: ['Pomme de terre', 'Riz', 'Courge'] },
  { match: 'pomme de terre', alts: ['Patate douce', 'Riz', 'Quinoa'] },
  { match: 'filet de poulet', alts: ['Escalope de dinde', 'Tofu ferme', 'Filet de cabillaud'] },
  { match: 'escalope de dinde', alts: ['Filet de poulet', 'Tofu ferme'] },
  { match: 'boeuf hache', alts: ['Dinde hachee', 'Hache vegetal', 'Lentilles cuites'] },
  { match: 'boeuf a griller emince', alts: ['Emince de poulet', 'Emince de dinde'] },
  { match: 'steak de boeuf', alts: ['Steak de dinde', 'Pave de saumon'] },
  { match: 'pave de saumon', alts: ['Dos de cabillaud', 'Filet de truite'] },
  { match: 'saumon', alts: ['Truite', 'Cabillaud'] },
  { match: 'dos de cabillaud', alts: ['Pave de saumon', 'Filet de colin'] },
  { match: 'tofu ferme', alts: ['Filet de poulet', 'Pois chiches cuits'] },
  { match: 'lait demi-ecreme', alts: ['Boisson vegetale (avoine)', 'Boisson vegetale (amande)'] },
  { match: 'boisson vegetale', alts: ['Lait demi-ecreme'] },
  { match: 'yaourt grec', alts: ['Skyr', 'Fromage blanc'] },
  { match: 'yaourt nature', alts: ['Skyr', 'Fromage blanc'] },
  { match: 'skyr', alts: ['Yaourt grec', 'Fromage blanc'] },
  { match: 'fromage blanc', alts: ['Skyr', 'Yaourt grec'] },
  { match: 'beurre de cacahuete', alts: ['Puree d amande', 'Puree de noisette'] },
  { match: 'beurre', alts: ['Huile d olive', 'Margarine vegetale'] },
  { match: 'amandes', alts: ['Noix', 'Noisettes'] },
  { match: 'noix', alts: ['Amandes', 'Noisettes'] },
  { match: 'banane', alts: ['Pomme', 'Poire', 'Fruits de saison'] },
  { match: 'pomme', alts: ['Poire', 'Banane', 'Fruits de saison'] },
  { match: 'courgette', alts: ['Aubergine', 'Brocoli', 'Haricots verts'] },
  { match: 'poivron', alts: ['Courgette', 'Aubergine'] },
  { match: 'brocoli', alts: ['Haricots verts', 'Courgette'] },
  { match: 'haricots verts', alts: ['Brocoli', 'Courgette'] },
  { match: 'miel', alts: ['Sirop d erable', 'Sucre'] },
  { match: 'sauce soja', alts: ['Tamari', 'Sauce teriyaki'] },
];

function trouverAlternatives(nom) {
  const n = normTxt(nom);
  for (const s of SUBSTITUTIONS) {
    if (n.includes(s.match)) return s.alts;
  }
  return [];
}

// ---------- Navigation entre ecrans ----------
function showScreen(id) {
  $$('.screen').forEach((s) => s.classList.remove('active'));
  $(`#screen-${id}`).classList.add('active');
  $('#navRestart').classList.toggle('hidden', id === 'landing');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showLoader(text) {
  $('#loaderText').textContent = text || 'On prepare votre plan…';
  $('#loader').classList.remove('hidden');
}
function hideLoader() { $('#loader').classList.add('hidden'); }

// ---------- Onboarding : selections ----------
function initSelections() {
  $$('.choice-grid').forEach((grid) => {
    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('.choice');
      if (!btn) return;
      $$('.choice', grid).forEach((c) => c.classList.remove('selected'));
      btn.classList.add('selected');
      grid.dataset.selected = btn.dataset.value;
    });
  });
  $$('.chip-set').forEach((set) => {
    set.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      chip.classList.toggle('selected');
    });
  });
}

function getMultiValues(field) {
  const set = $(`.chip-set[data-multifield="${field}"]`);
  if (!set) return [];
  return $$('.chip.selected', set).map((c) => c.dataset.value);
}
function parseCsv(value) {
  return String(value || '').split(',').map((s) => s.trim()).filter(Boolean);
}

// ---------- Onboarding : pas a pas ----------
function goToStep(n) {
  state.step = Math.min(Math.max(n, 1), TOTAL_STEPS);
  $$('.step').forEach((s) => s.classList.toggle('active', Number(s.dataset.step) === state.step));
  $('#progressFill').style.width = `${(state.step / TOTAL_STEPS) * 100}%`;
  $('#stepNum').textContent = state.step;
  $('#btnPrev').classList.toggle('hidden', state.step === 1);
  $('#btnNext').classList.toggle('hidden', state.step === TOTAL_STEPS);
  $('#btnFinish').classList.toggle('hidden', state.step !== TOTAL_STEPS);
}

function validateStep() {
  if (state.step === 1) {
    const objectif = $('.choice-grid[data-field="objectif"]').dataset.selected;
    if (!objectif) { alert('Choisissez un objectif pour continuer.'); return false; }
  }
  return true;
}

function collectProfile() {
  const form = $('#onboardingForm');
  const fd = new FormData(form);
  const objectif = $('.choice-grid[data-field="objectif"]').dataset.selected || 'maintien';
  state.masquerCalories = $('input[name="masquerCalories"]').checked;

  state.profil = {
    objectif,
    sexe: fd.get('sexe'),
    age: Number(fd.get('age')),
    taille_cm: Number(fd.get('taille_cm')),
    poids_kg: Number(fd.get('poids_kg')),
    activite: fd.get('activite'),
    repas_par_jour: Number(fd.get('repas_par_jour')),
    jours: Number(fd.get('jours')),
    // Complements alimentaires (enregistres dans le profil, reutilisables).
    complements: getMultiValues('complements'),
    complementsDetail: (fd.get('complementsDetail') || '').trim(),
  };
  state.preferences = {
    cuisines: getMultiValues('cuisines'),
    aimes: parseCsv(fd.get('aimes')),
    deteste: parseCsv(fd.get('deteste')),
    allergies: parseCsv(fd.get('allergies')),
    regime: getMultiValues('regime'),
    budget: fd.get('budget'),
    temps_max: Number(fd.get('temps_max')),
    // E2 - Habitudes alimentaires actuelles + aliments frequents.
    frequents: parseCsv(fd.get('frequents')),
    habitudes: {
      petitDej: (fd.get('hab_petitDej') || '').trim(),
      dejeuner: (fd.get('hab_dejeuner') || '').trim(),
      diner: (fd.get('hab_diner') || '').trim(),
      collations: (fd.get('hab_collations') || '').trim(),
      boissons: (fd.get('hab_boissons') || '').trim(),
    },
  };
  // Nouveau profil = nouveau suivi.
  state.suivi = {};
}

// Fusionne favoris/exclus dans les preferences envoyees au serveur.
function prefsForServer() {
  return {
    ...state.preferences,
    favoris: state.favoris.map((f) => f.id),
    exclus: state.exclus,
  };
}

// ---------- Appels API ----------
async function fetchPlan(seed) {
  const res = await fetch(apiUrl('/api/plan'), {
    method: 'POST',
    headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ profil: state.profil, preferences: prefsForServer(), seed }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Erreur');
  state.plan = data.plan;
  state.source = data.source;
  return data;
}

async function fetchMeal(creneau, kcalCible, exclureId) {
  const res = await fetch(apiUrl('/api/meal'), {
    method: 'POST',
    headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ profil: state.profil, preferences: prefsForServer(), creneau, kcalCible, exclureId }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Erreur');
  return data.recette;
}

// ---------- Rendu : besoins ----------
function renderNeeds() {
  const b = state.plan.besoins;
  const objLabels = { perte: 'Perte de poids', maintien: 'Maintien', muscle: 'Prise de muscle', energie: 'Plus d\'energie' };
  const pk = b.macros.proteines * 4, gk = b.macros.glucides * 4, lk = b.macros.lipides * 9;
  const tot = pk + gk + lk || 1;
  const bar = (v) => `<div class="macbar"><i style="width:${Math.round((v / tot) * 100)}%"></i></div>`;
  const kcalBlock = state.masquerCalories ? ''
    : `<div class="needs-stat"><div class="num">${b.kcalCible}</div><div class="lbl">kcal / jour</div></div>`;
  $('#needsCard').innerHTML = `
    <div class="needs-head"><span class="needs-ic">${icSvg('target')}</span><h2>Objectif : ${objLabels[state.profil.objectif] || ''}</h2></div>
    <p class="needs-sub">Vos besoins estimes pour atteindre votre objectif, repartis sur la journee.</p>
    <div class="needs-stats">
      ${kcalBlock}
      <div class="needs-stat"><div class="num">${b.macros.proteines} g</div><div class="lbl">Proteines</div>${bar(pk)}</div>
      <div class="needs-stat"><div class="num">${b.macros.glucides} g</div><div class="lbl">Glucides</div>${bar(gk)}</div>
      <div class="needs-stat"><div class="num">${b.macros.lipides} g</div><div class="lbl">Lipides</div>${bar(lk)}</div>
    </div>`;
}

// ---------- Rendu : grille du plan ----------
function renderPlan() {
  const grid = $('#planGrid');
  grid.innerHTML = '';
  state.plan.jours.forEach((jour, di) => {
    const dayKcal = jour.repas.reduce((sum, r) => sum + (r.recette && !r.exterieur ? r.recette.kcal : 0), 0);
    const card = document.createElement('div');
    card.className = 'day-card';
    const kcalTag = state.masquerCalories ? '' : `<span class="day-kcal">${dayKcal} kcal</span>`;
    const title = document.createElement('div');
    title.className = 'day-title';
    title.innerHTML = `${jour.jour}${kcalTag}<button class="day-regen" data-day="${di}">${icSvg('refresh')} Toute la journee</button>`;
    card.appendChild(title);
    const row = document.createElement('div');
    row.className = 'meals-row';
    jour.repas.forEach((repas, mi) => row.appendChild(renderMealCard(repas, di, mi)));
    card.appendChild(row);
    grid.appendChild(card);
  });
  $$('.day-regen').forEach((b) => b.addEventListener('click', () => regenerateDay(Number(b.dataset.day))));
}

function renderMealCard(repas, di, mi) {
  const el = document.createElement('div');
  el.className = 'meal-card';
  // Repas pris a l'exterieur (analyse avancee) : suggestions au lieu d'une recette.
  if (repas.exterieur) {
    el.innerHTML = `
      <div class="meal-photo" data-cat="exterieur">
        <span class="meal-creneau">${escapeHtml(repas.label)}</span>
        ${icSvg('bowl')}
      </div>
      <div class="meal-body">
        <span class="meal-name">A l'exterieur — options equilibrees</span>
        <div class="ext-suggestions">
          <div>${icSvg('check')} Restaurant : une proteine (poulet/poisson) + legumes + un feculent.</div>
          <div>${icSvg('check')} Boulangerie : sandwich complet poulet-crudites + un fruit.</div>
          <div>${icSvg('check')} A emporter : salade composee ou wrap, eau plutot que soda.</div>
        </div>
      </div>`;
    return el;
  }
  const r = repas.recette;
  if (!r) {
    el.innerHTML = `<div class="meal-body"><span class="meal-empty">${escapeHtml(repas.label)} — aucune recette compatible. Assouplissez un filtre.</span></div>`;
    return el;
  }
  const isFav = state.favoris.some((f) => f.id === r.id);
  const cat = repas.creneau === 'dejeuner' || repas.creneau === 'diner' ? 'plat' : repas.creneau;
  const glyph = cat === 'petit-dejeuner' ? 'sun' : (cat === 'collation' ? 'apple' : 'bowl');
  const suivi = state.suivi[trackKey(di, mi)] || {};
  const st = suivi.statut;
  const kcalChip = state.masquerCalories ? '' : `<span class="macro-chip kcal">${r.kcal} kcal</span>`;
  const altLine = st === 'autre' && suivi.autre
    ? `<div class="meal-alt">${icSvg('edit')} ${escapeHtml(suivi.autre.repas || '')}${suivi.autre.quantite ? ' (' + escapeHtml(suivi.autre.quantite) + ')' : ''}</div>`
    : '';
  el.innerHTML = `
    <div class="meal-photo" data-cat="${cat}">
      <img class="meal-img" src="images/recipes/${r.id}.jpg" alt="${escapeHtml(r.nom)}" loading="lazy" onerror="this.remove()" />
      <span class="meal-creneau">${escapeHtml(repas.label)}</span>
      ${isFav ? `<span class="meal-fav">${icSvg('heart')}</span>` : ''}
      ${icSvg(glyph)}
    </div>
    <div class="meal-body">
      <span class="meal-name" data-act="open">${escapeHtml(r.nom)}</span>
      <div class="macro-chips">
        ${kcalChip}
        <span class="macro-chip prot">${r.proteines} g P</span>
        <span class="macro-chip gluc">${r.glucides} g G</span>
        <span class="macro-chip lip">${r.lipides} g L</span>
        <span class="macro-chip time">${icSvg('clock')} ${r.tempsMinutes} min</span>
      </div>
      <div class="meal-actions">
        <button class="mini-btn" data-act="open">${icSvg('eye')} Voir</button>
        <button class="mini-btn" data-act="swap">${icSvg('refresh')} Remplacer</button>
      </div>
      <div class="meal-track">
        <button class="track-btn ${st === 'respecte' ? 'on-ok' : ''}" data-act="t-ok" title="Respecte" aria-label="Respecte">${icSvg('check')}</button>
        <button class="track-btn ${st === 'non' ? 'on-no' : ''}" data-act="t-no" title="Non respecte" aria-label="Non respecte">${icSvg('x')}</button>
        <button class="track-btn ${st === 'autre' ? 'on-alt' : ''}" data-act="t-alt" title="J'ai mange autre chose" aria-label="J'ai mange autre chose">${icSvg('edit')}</button>
      </div>
      ${altLine}
    </div>`;
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    const act = btn && btn.dataset.act;
    if (act === 'open') openRecipe(r, di, mi);
    if (act === 'swap') swapMeal(di, mi);
    if (act === 't-ok') setMealStatus(di, mi, 'respecte');
    if (act === 't-no') setMealStatus(di, mi, 'non');
    if (act === 't-alt') openAutreForm(di, mi);
  });
  return el;
}

function trackKey(di, mi) { return `${di}-${mi}`; }

// ---------- Traceur alimentaire (E4) ----------
function setMealStatus(di, mi, statut) {
  const key = trackKey(di, mi);
  const cur = state.suivi[key] || {};
  // Re-cliquer le meme statut l'annule (toggle).
  if (cur.statut === statut && statut !== 'autre') { delete state.suivi[key]; }
  else { state.suivi[key] = { ...cur, statut }; }
  saveLocal();
  renderPlan();
}

function openAutreForm(di, mi) {
  const key = trackKey(di, mi);
  const cur = (state.suivi[key] && state.suivi[key].autre) || {};
  const repas = window.prompt('Qu\'avez-vous mange a la place ?', cur.repas || '');
  if (repas === null) return; // annule
  const quantite = window.prompt('Quantite approximative ? (optionnel)', cur.quantite || '') || '';
  const commentaire = window.prompt('Un commentaire ? (optionnel)', cur.commentaire || '') || '';
  state.suivi[key] = { statut: 'autre', autre: { repas: repas.trim(), quantite: quantite.trim(), commentaire: commentaire.trim() } };
  saveLocal();
  renderPlan();
}

// Efface le suivi d'un creneau dont le repas a change.
function clearTrack(di, mi) { delete state.suivi[trackKey(di, mi)]; }

// ---------- Remplacer un repas ----------
async function swapMeal(di, mi) {
  const repas = state.plan.jours[di].repas[mi];
  showLoader('On vous trouve une autre idee…');
  try {
    const nouvelle = await fetchMeal(repas.creneau, repas.kcalCible, repas.recette ? repas.recette.id : null);
    if (nouvelle) { repas.recette = nouvelle; clearTrack(di, mi); renderPlan(); saveLocal(); }
    else alert('Pas d\'autre recette compatible disponible pour ce creneau.');
  } catch (e) { alert('Impossible de remplacer ce repas pour le moment.'); }
  finally { hideLoader(); }
}

// ---------- Regenerer TOUTE une journee ----------
async function regenerateDay(di) {
  const jour = state.plan.jours[di];
  showLoader(`On regenere ${jour.jour}…`);
  try {
    for (let mi = 0; mi < jour.repas.length; mi++) {
      const repas = jour.repas[mi];
      const nouvelle = await fetchMeal(repas.creneau, repas.kcalCible, repas.recette ? repas.recette.id : null);
      if (nouvelle) { repas.recette = nouvelle; clearTrack(di, mi); }
    }
    renderPlan();
    saveLocal();
  } catch (e) { alert('Impossible de regenerer la journee pour le moment.'); }
  finally { hideLoader(); }
}

// ---------- Modale recette ----------
let modalContext = { di: null, mi: null, recipe: null };

function openRecipe(r, di = null, mi = null, opts = {}) {
  modalContext = { di, mi, recipe: r };
  const isFav = state.favoris.some((f) => f.id === r.id);
  const macros = state.masquerCalories ? ''
    : `<div class="recipe-macros" id="recipeMacros">
        <div class="m"><div class="n">${r.kcal}</div><div class="l">kcal</div></div>
        <div class="m"><div class="n">${r.proteines} g</div><div class="l">Proteines</div></div>
        <div class="m"><div class="n">${r.glucides} g</div><div class="l">Glucides</div></div>
        <div class="m"><div class="n">${r.lipides} g</div><div class="l">Lipides</div></div>
      </div>`;

  // Boutons d'action : favori toujours dispo ; "ne plus proposer" seulement
  // quand la recette est rattachee a un repas du plan (contexte di/mi).
  const inPlan = di !== null && mi !== null;
  const actions = `
    <div class="recipe-actions">
      <button class="recipe-action ${isFav ? 'fav-on' : ''}" id="recipeFav">${icSvg('heart')} ${isFav ? 'Favori' : 'Ajouter aux favoris'}</button>
      ${inPlan ? `<button class="recipe-action" id="recipeExclude">${icSvg('x')} Ne plus me proposer</button>` : ''}
    </div>`;

  const ingredients = (r.ingredients || []).map((i, idx) => {
    const q = fmtQty((Number(i.quantite) || 0) * state.portions);
    const swapBtn = inPlan && trouverAlternatives(i.nom).length
      ? `<button class="ing-swap" title="Remplacer cet ingredient" aria-label="Remplacer ${escapeHtml(i.nom)}" data-ing="${idx}">${icSvg('swap')}</button>` : '';
    return `<li><span class="ing-left">${escapeHtml(i.nom)}${swapBtn}</span><span class="q">${q} ${i.unite}</span></li>`;
  }).join('');

  const portionsNote = state.portions > 1
    ? `<p class="panel-sub">Quantites pour ${state.portions} personnes (macros affichees par portion).</p>` : '';

  const photoCat = r.type === 'petit-dejeuner' ? 'petit-dejeuner' : (r.type === 'collation' ? 'collation' : 'plat');
  const photoGlyph = photoCat === 'petit-dejeuner' ? 'sun' : (photoCat === 'collation' ? 'apple' : 'bowl');
  $('#modalBody').innerHTML = `
    <div class="recipe-photo" data-cat="${photoCat}">
      <img src="images/recipes/${r.id}.jpg" alt="${escapeHtml(r.nom)}" loading="lazy" onerror="this.remove()" />
      ${icSvg(photoGlyph)}
    </div>
    <h2 class="recipe-title">${escapeHtml(r.nom)}</h2>`;
  $('#modalBody').innerHTML += `
    <div class="macro-chips">${(r.cuisines || []).map((c) => `<span class="macro-chip">${c}</span>`).join('')}<span class="macro-chip time">${icSvg('clock')} ${r.tempsMinutes} min</span></div>
    ${actions}
    ${macros}
    ${portionsNote}
    <div class="recipe-section-title">Ingredients</div>
    <ul class="ing-list">${ingredients}</ul>
    <div id="recipePrep">
      <div class="recipe-section-title">Preparation</div>
      <ol class="steps-list">${(r.etapes || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>
    </div>`;

  $('#recipeFav').addEventListener('click', () => { toggleFavori(r); openRecipe(state.plan && inPlan ? state.plan.jours[di].repas[mi].recette : r, di, mi); });
  if (inPlan) {
    $('#recipeExclude').addEventListener('click', () => excludeRecipe(di, mi));
    $$('#modalBody .ing-swap').forEach((b) => b.addEventListener('click', () => swapIngredient(di, mi, Number(b.dataset.ing))));
  }
  $('#recipeModal').scrollTop = 0;
  $('#recipeModal').classList.remove('hidden');

  // Recette guidee detaillee, reconstruite a partir des ingredients actuels (Claude).
  if (state.ia) enrichRecipe(r, di, mi, !!opts.recompute);
}
function closeRecipe() { $('#recipeModal').classList.add('hidden'); }

// ---------- Recette guidee dynamique (Claude) ----------
const recipeDetailCache = new Map();
function detailKey(r) {
  return r.nom + '|' + (r.ingredients || []).map((i) => `${i.quantite}${i.unite}${i.nom}`).join(';').toLowerCase();
}

async function fetchRecipeDetail(r) {
  const key = detailKey(r);
  if (recipeDetailCache.has(key)) return recipeDetailCache.get(key);
  const res = await fetch(apiUrl('/api/recipe-detail'), {
    method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ nom: r.nom, objectif: state.profil.objectif, tempsMinutes: r.tempsMinutes, cuisines: r.cuisines, ingredients: r.ingredients }),
  });
  const data = await res.json();
  if (data.ok && data.ia && data.detail) { recipeDetailCache.set(key, data.detail); return data.detail; }
  return null;
}

async function enrichRecipe(r, di, mi, recompute) {
  const prep = $('#recipePrep');
  if (!prep) return;
  if (!recipeDetailCache.has(detailKey(r))) {
    prep.innerHTML = `<div class="recipe-section-title">Preparation guidee</div>
      <div class="prep-loading">${icSvg('spark')} On prepare votre recette guidee, etape par etape…</div>`;
  }
  let detail = null;
  try { detail = await fetchRecipeDetail(r); } catch (e) { detail = null; }
  if (modalContext.recipe !== r) return; // l'utilisateur a change de recette entre-temps
  if (!detail) { // repli : etapes statiques existantes
    prep.innerHTML = `<div class="recipe-section-title">Preparation</div>
      <ol class="steps-list">${(r.etapes || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>`;
    return;
  }
  applyDetailToModal(detail, r, di, mi, recompute);
}

function applyDetailToModal(detail, r, di, mi, recompute) {
  const prep = $('#recipePrep');
  if (prep) {
    const materiel = (detail.materiel || []).map((m) => `<span class="mat-chip">${escapeHtml(m)}</span>`).join('');
    const etapes = (detail.etapes || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('');
    const dressage = detail.dressage
      ? `<div class="recipe-section-title">Dressage</div><p class="dressage">${escapeHtml(detail.dressage)}</p>` : '';
    prep.innerHTML = `
      ${materiel ? `<div class="recipe-section-title">Materiel</div><div class="mat-set">${materiel}</div>` : ''}
      <div class="recipe-section-title">Preparation guidee</div>
      <ol class="steps-list">${etapes}</ol>
      ${dressage}`;
  }
  // Macros recalculees uniquement apres un remplacement d'ingredient.
  if (recompute && detail.kcal != null && di !== null && mi !== null) {
    r.kcal = detail.kcal; r.proteines = detail.proteines; r.glucides = detail.glucides; r.lipides = detail.lipides;
    const mc = $('#recipeMacros');
    if (mc) mc.innerHTML = `
      <div class="m"><div class="n">${r.kcal}</div><div class="l">kcal</div></div>
      <div class="m"><div class="n">${r.proteines} g</div><div class="l">Proteines</div></div>
      <div class="m"><div class="n">${r.glucides} g</div><div class="l">Glucides</div></div>
      <div class="m"><div class="n">${r.lipides} g</div><div class="l">Lipides</div></div>`;
    renderPlan();
    saveLocal();
  }
}

// ---------- Favoris ----------
function toggleFavori(r) {
  const i = state.favoris.findIndex((f) => f.id === r.id);
  if (i >= 0) state.favoris.splice(i, 1);
  else state.favoris.push(r);
  saveLocal();
  renderPlan();
}

function openFavoris() { renderFavoris(); $('#favorisPanel').classList.remove('hidden'); }
function closeFavoris() { $('#favorisPanel').classList.add('hidden'); }

function renderFavoris() {
  const cont = $('#favorisList');
  if (!state.favoris.length) {
    cont.innerHTML = '<p class="panel-empty">Aucun favori pour le moment. Ouvrez une recette et ajoutez-la a vos favoris.</p>';
    return;
  }
  cont.innerHTML = '';
  state.favoris.forEach((r) => {
    const el = document.createElement('div');
    el.className = 'fav-item';
    const kcal = state.masquerCalories ? '' : `${r.kcal} kcal · `;
    el.innerHTML = `<span class="fav-name">${escapeHtml(r.nom)}</span>
      <span class="fav-meta">${kcal}${r.tempsMinutes} min</span>
      <button class="fav-remove" title="Retirer" aria-label="Retirer des favoris">${icSvg('x')}</button>`;
    el.querySelector('.fav-name').addEventListener('click', () => openRecipe(r));
    el.querySelector('.fav-remove').addEventListener('click', () => { toggleFavori(r); renderFavoris(); });
    cont.appendChild(el);
  });
}

// ---------- Ne plus me proposer ----------
async function excludeRecipe(di, mi) {
  const repas = state.plan.jours[di].repas[mi];
  const r = repas.recette;
  if (!r) return;
  if (!state.exclus.includes(r.id)) state.exclus.push(r.id);
  // Retirer aussi des favoris si present (coherence).
  state.favoris = state.favoris.filter((f) => f.id !== r.id);
  closeRecipe();
  showLoader('On remplace cette recette…');
  try {
    const nouvelle = await fetchMeal(repas.creneau, repas.kcalCible, r.id);
    repas.recette = nouvelle || null;
    clearTrack(di, mi);
    renderPlan();
    saveLocal();
  } catch (e) { alert('Recette exclue, mais remplacement impossible pour le moment.'); }
  finally { hideLoader(); }
}

// ---------- Swap d'un ingredient precis ----------
function swapIngredient(di, mi, idx) {
  const recette = state.plan.jours[di].repas[mi].recette;
  const ing = recette.ingredients[idx];
  if (!ing) return;
  const alts = trouverAlternatives(ing.nom);
  // Choisir une alternative qui ne reintroduit pas un aliment interdit.
  const interdits = [...(state.preferences.allergies || []), ...(state.preferences.deteste || [])].map(normTxt);
  const courant = normTxt(ing.nom);
  const choix = alts.find((a) => {
    const na = normTxt(a);
    return na !== courant && !interdits.some((m) => m && na.includes(m));
  });
  if (!choix) { alert('Aucune alternative compatible avec vos contraintes pour cet ingredient.'); return; }
  const ancien = ing.nom;
  ing.nom = choix; // on conserve quantite/unite ; le rayon reste indicatif
  // Hors-ligne (sans IA) : on remplace l'ancien nom dans les etapes statiques
  // pour eviter l'incoherence (ex. "banane" -> "fruits rouges" dans le dressage).
  if (!state.ia) recette.etapes = (recette.etapes || []).map((s) => remplacerMot(s, ancien, choix));
  saveLocal();
  // Avec IA : openRecipe(recompute) reconstruit la recette ET recalcule les macros
  // a partir des ingredients actuels (cache invalide car les ingredients ont change).
  openRecipe(recette, di, mi, { recompute: true });
  renderPlan();
}

function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
// Remplace, sans accent et sans tenir compte de la casse, l'ancien ingredient
// par le nouveau dans un texte d'etape (repli hors-ligne).
function remplacerMot(texte, ancien, nouveau) {
  if (!ancien) return texte;
  try {
    return texte.replace(new RegExp(escapeRegExp(ancien), 'gi'), nouveau);
  } catch (_) { return texte; }
}

// ---------- Liste de courses ----------
const RAYON_ORDRE = ['Fruits & legumes', 'Boucherie', 'Poissonnerie', 'Cremerie', 'Boulangerie', 'Epicerie', 'Surgeles', 'Rayon frais', 'Rayon vegetal'];

function buildShoppingList() {
  const agg = {};
  state.plan.jours.forEach((jour) => {
    jour.repas.forEach((repas) => {
      if (!repas.recette) return;
      (repas.recette.ingredients || []).forEach((ing) => {
        const key = `${ing.nom.toLowerCase()}|${ing.unite}`;
        if (!agg[key]) agg[key] = { nom: ing.nom, unite: ing.unite, rayon: ing.rayon || 'Epicerie', quantite: 0 };
        agg[key].quantite += (Number(ing.quantite) || 0) * state.portions;
      });
    });
  });
  const parRayon = {};
  Object.values(agg).forEach((item) => { (parRayon[item.rayon] = parRayon[item.rayon] || []).push(item); });
  return parRayon;
}

function rayonsTries(parRayon) {
  return Object.keys(parRayon).sort((a, b) => {
    const ia = RAYON_ORDRE.indexOf(a), ib = RAYON_ORDRE.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}

function renderShopping() {
  const parRayon = buildShoppingList();
  const cont = $('#shoppingList');
  cont.innerHTML = '';
  $('#shoppingDays').textContent = state.plan.jours.length;
  $('#shoppingPortions').textContent = state.portions;
  rayonsTries(parRayon).forEach((rayon) => {
    const group = document.createElement('div');
    group.className = 'rayon-group';
    group.innerHTML = `<div class="rayon-title">${rayon}</div>`;
    parRayon[rayon].sort((a, b) => a.nom.localeCompare(b.nom)).forEach((item, i) => {
      const id = `shop-${rayon}-${i}`.replace(/[^a-z0-9-]/gi, '');
      const row = document.createElement('div');
      row.className = 'shop-item';
      row.innerHTML = `<input type="checkbox" id="${id}" />
        <label for="${id}">${escapeHtml(item.nom)}</label>
        <span class="q">${fmtQty(item.quantite)} ${item.unite}</span>`;
      row.querySelector('input').addEventListener('change', (e) => row.classList.toggle('checked', e.target.checked));
      group.appendChild(row);
    });
    cont.appendChild(group);
  });
}

function openShopping() { renderShopping(); $('#shoppingPanel').classList.remove('hidden'); }
function closeShopping() { $('#shoppingPanel').classList.add('hidden'); }

// ---------- Portions ----------
function setPortions(n) {
  state.portions = Math.min(Math.max(n, 1), 12);
  $('#portValue').textContent = state.portions;
  if (!$('#shoppingPanel').classList.contains('hidden')) renderShopping();
  saveLocal();
}

// ---------- Export PDF (via fenetre d'impression, 100% hors-ligne) ----------
const PRINT_CSS = `
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, Arial, sans-serif; color: #21302a; margin: 24px; }
  h1 { color: #246b45; font-size: 22px; margin: 0 0 4px; }
  .sub { color: #5d6f66; font-size: 12px; margin: 0 0 18px; }
  h2 { color: #2f8f5b; font-size: 16px; border-bottom: 2px solid #d8ede0; padding-bottom: 4px; margin: 18px 0 8px; }
  h3 { font-size: 14px; margin: 12px 0 4px; }
  .meta { color: #5d6f66; font-size: 12px; margin: 0 0 4px; }
  ul, ol { margin: 4px 0 10px; padding-left: 20px; }
  li { font-size: 12.5px; margin: 2px 0; }
  .rayon { font-weight: 700; color: #2f8f5b; text-transform: uppercase; font-size: 12px; margin: 12px 0 4px; }
  .shop { font-size: 13px; padding: 2px 0; }
  .day { page-break-inside: avoid; }
  @media print { @page { margin: 14mm; } }
`;

function printDocument(title, innerHTML) {
  const w = window.open('', '_blank');
  if (!w) { alert('Autorisez les fenetres pop-up pour exporter en PDF.'); return; }
  w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${PRINT_CSS}</style></head><body>${innerHTML}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 350);
}

function exportPlanPdf() {
  const b = state.plan.besoins;
  const objLabels = { perte: 'Perte de poids', maintien: 'Maintien', muscle: 'Prise de muscle', energie: 'Plus d\'energie' };
  let html = `<h1>Mon plan de repas — My Coach Nutrition</h1>
    <p class="sub">Objectif : ${objLabels[state.profil.objectif] || ''} · ~${b.kcalCible} kcal/jour · ${state.portions} personne(s) · Estimations a titre indicatif.</p>`;
  state.plan.jours.forEach((jour) => {
    html += `<div class="day"><h2>${jour.jour}</h2>`;
    jour.repas.forEach((repas) => {
      const r = repas.recette;
      if (!r) { html += `<h3>${repas.label} — (aucune recette)</h3>`; return; }
      html += `<h3>${repas.label} — ${escapeHtml(r.nom)}</h3>
        <p class="meta">${r.kcal} kcal · ⏱ ${r.tempsMinutes} min</p>
        <ul>${r.ingredients.map((i) => `<li>${escapeHtml(i.nom)} — ${fmtQty((Number(i.quantite) || 0) * state.portions)} ${i.unite}</li>`).join('')}</ul>
        <ol>${r.etapes.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>`;
    });
    html += '</div>';
  });
  printDocument('Plan de repas', html);
}

function exportShoppingPdf() {
  const parRayon = buildShoppingList();
  let html = `<h1>Liste de courses — My Coach Nutrition</h1>
    <p class="sub">Pour ${state.plan.jours.length} jour(s) · ${state.portions} personne(s)</p>`;
  rayonsTries(parRayon).forEach((rayon) => {
    html += `<div class="rayon">${rayon}</div>`;
    parRayon[rayon].sort((a, b) => a.nom.localeCompare(b.nom)).forEach((item) => {
      html += `<div class="shop">☐ ${escapeHtml(item.nom)} — ${fmtQty(item.quantite)} ${item.unite}</div>`;
    });
  });
  printDocument('Liste de courses', html);
}

// ---------- Ma fiche (E1 + E6 : recap perso) ----------
const COMPLEMENT_LABELS = { non: 'Aucun', aucun: 'Aucun', proteines: 'Proteines', creatine: 'Creatine', vitamines: 'Vitamines / mineraux', multivitamines: 'Vitamines / mineraux', omega3: 'Omega 3', magnesium: 'Magnesium', bruleur: 'Bruleur de graisse', collagene: 'Collagene', preworkout: 'Pre-workout', autre: 'Autre' };

function openFiche() { renderFiche(); $('#fichePanel').classList.remove('hidden'); }
function closeFiche() { $('#fichePanel').classList.add('hidden'); }

function renderFiche() {
  const p = state.profil, pr = state.preferences, b = state.plan ? state.plan.besoins : null;
  const objLabels = { perte: 'Perte de poids', maintien: 'Maintien', muscle: 'Prise de muscle', energie: 'Plus d\'energie' };
  const comps = (p.complements || []).filter((c) => c !== 'aucun' && c !== 'non').map((c) => COMPLEMENT_LABELS[c] || c);
  const compStr = comps.length ? comps.filter((c) => c !== 'Autre').join(', ') + (p.complementsDetail ? ' — ' + p.complementsDetail : '') : 'Aucun';
  const hab = pr.habitudes || {};
  const habRow = (lbl, val) => (val ? `<div class="fiche-row"><span>${lbl}</span><b>${escapeHtml(val)}</b></div>` : '');
  const ad = computeAdherence();
  $('#ficheBody').innerHTML = `
    <div class="fiche-block">
      <h3>Profil</h3>
      <div class="fiche-row"><span>Objectif</span><b>${objLabels[p.objectif] || '—'}</b></div>
      <div class="fiche-row"><span>Sexe / Age</span><b>${p.sexe || '—'} · ${p.age || '—'} ans</b></div>
      <div class="fiche-row"><span>Taille / Poids</span><b>${p.taille_cm || '—'} cm · ${p.poids_kg || '—'} kg</b></div>
      ${b && !state.masquerCalories ? `<div class="fiche-row"><span>Besoin estime</span><b>~${b.kcalCible} kcal/jour</b></div>` : ''}
    </div>
    <div class="fiche-block">
      <h3>Complements alimentaires</h3>
      <div class="fiche-tags">${escapeHtml(compStr)}</div>
    </div>
    <div class="fiche-block">
      <h3>Gouts & contraintes</h3>
      ${pr.cuisines && pr.cuisines.length ? `<div class="fiche-row"><span>Cuisines aimees</span><b>${pr.cuisines.join(', ')}</b></div>` : ''}
      ${pr.aimes && pr.aimes.length ? `<div class="fiche-row"><span>Aime</span><b>${escapeHtml(pr.aimes.join(', '))}</b></div>` : ''}
      ${pr.deteste && pr.deteste.length ? `<div class="fiche-row"><span>N'aime pas</span><b>${escapeHtml(pr.deteste.join(', '))}</b></div>` : ''}
      ${pr.allergies && pr.allergies.length ? `<div class="fiche-row"><span>Allergies</span><b style="color:var(--danger)">${escapeHtml(pr.allergies.join(', '))}</b></div>` : ''}
      ${pr.regime && pr.regime.length ? `<div class="fiche-row"><span>Regime</span><b>${pr.regime.join(', ')}</b></div>` : ''}
    </div>
    <div class="fiche-block">
      <h3>Habitudes actuelles</h3>
      ${habRow('Petit-dejeuner', hab.petitDej)}
      ${habRow('Dejeuner', hab.dejeuner)}
      ${habRow('Diner', hab.diner)}
      ${habRow('Collations', hab.collations)}
      ${habRow('Boissons', hab.boissons)}
      ${pr.frequents && pr.frequents.length ? `<div class="fiche-row"><span>Presque tous les jours</span><b>${escapeHtml(pr.frequents.join(', '))}</b></div>` : ''}
    </div>
    <div class="fiche-block">
      <h3>Suivi</h3>
      <div class="fiche-row"><span>Adherence</span><b>${ad.prevus ? ad.taux + ' %' : '—'}</b></div>
      <div class="fiche-row"><span>Favoris</span><b>${state.favoris.length}</b></div>
    </div>`;
}

// ---------- Adherence (E4) ----------
function computeAdherence() {
  let prevus = 0, respectes = 0, modifies = 0, nonRespectes = 0;
  if (state.plan) state.plan.jours.forEach((j, di) => j.repas.forEach((rp, mi) => {
    if (!rp.recette) return;
    prevus++;
    const s = state.suivi[trackKey(di, mi)];
    if (!s) return;
    if (s.statut === 'respecte') respectes++;
    else if (s.statut === 'non') nonRespectes++;
    else if (s.statut === 'autre') modifies++;
  }));
  const taux = prevus ? Math.round((respectes / prevus) * 100) : 0;
  return { prevus, respectes, modifies, nonRespectes, taux };
}

function openSuivi() { renderSuivi(); $('#suiviPanel').classList.remove('hidden'); }
function closeSuivi() { $('#suiviPanel').classList.add('hidden'); }

function renderSuivi() {
  const a = computeAdherence();
  const nonRenseignes = a.prevus - a.respectes - a.modifies - a.nonRespectes;
  const R = 58, C = 2 * Math.PI * R;
  const off = C * (1 - (a.prevus ? a.taux : 0) / 100);
  $('#suiviBody').innerHTML = `
    <div class="adh-gauge">
      <div class="adh-ring">
        <svg width="132" height="132" viewBox="0 0 132 132">
          <circle cx="66" cy="66" r="${R}" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="12"/>
          <circle cx="66" cy="66" r="${R}" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/>
        </svg>
        <div class="adh-num">${a.prevus ? a.taux : 0}%</div>
      </div>
      <div class="adh-lbl">d'adherence</div>
    </div>
    <div class="adh-stats">
      <div class="adh-stat"><b>${a.prevus}</b><span>prevus</span></div>
      <div class="adh-stat ok"><b>${a.respectes}</b><span>respectes</span></div>
      <div class="adh-stat alt"><b>${a.modifies}</b><span>modifies</span></div>
      <div class="adh-stat no"><b>${a.nonRespectes}</b><span>non respectes</span></div>
    </div>
    <p class="panel-sub">${nonRenseignes > 0 ? nonRenseignes + ' repas pas encore renseignes. Marquez chaque repas (respecte / non / modifie) sur le plan.' : 'Tous vos repas sont renseignes, bravo !'}</p>`;
}

// ---------- Analyse des ecarts (E5) ----------
const VEG_KEYS = ['legume', 'courgette', 'brocoli', 'salade', 'tomate', 'poivron', 'epinard', 'carotte', 'haricot', 'champignon', 'ratatouille', 'crudites', 'mais', 'patate douce', 'aubergine'];
const JUNK_KEYS = ['pizza', 'burger', 'fast', 'frite', 'soda', 'chips', 'bonbon', 'kebab', 'nugget', 'industriel', 'plat prepare', 'sandwich', 'biscuit', 'gateau', 'restaurant', 'tacos'];

function openAnalyse() { renderAnalyse(); $('#analysePanel').classList.remove('hidden'); }
function closeAnalyse() { $('#analysePanel').classList.add('hidden'); }

function renderAnalyse() {
  if (!state.plan) { $('#analyseBody').innerHTML = '<p class="panel-empty">Generez un plan pour obtenir une analyse.</p>'; return; }
  const forts = [], axes = [];
  const b = state.plan.besoins;
  const a = computeAdherence();

  // 1. Adherence / repas sautes
  if (a.prevus && a.respectes / a.prevus >= 0.8) forts.push('Tres bonne regularite : vous suivez la majorite de vos repas.');
  else if (a.nonRespectes >= 2) axes.push(`${a.nonRespectes} repas non pris : essayez de ne sauter aucun repas, meme leger.`);

  // 2. Proteines (moyenne du plan vs cible)
  let totProt = 0, vegMeals = 0, totMeals = 0;
  const nbJours = state.plan.jours.length;
  state.plan.jours.forEach((j) => j.repas.forEach((rp) => {
    if (!rp.recette) return;
    totMeals++; totProt += rp.recette.proteines;
    const champ = (rp.recette.nom + ' ' + (rp.recette.ingredients || []).map((i) => i.nom).join(' ')).toLowerCase();
    if (VEG_KEYS.some((k) => champ.includes(k))) vegMeals++;
  }));
  const protJour = nbJours ? Math.round(totProt / nbJours) : 0;
  if (b && protJour >= b.macros.proteines * 0.9) forts.push(`Apport proteique solide (~${protJour} g/jour).`);
  else if (b) axes.push(`Proteines un peu justes (~${protJour} g/jour vs ~${b.macros.proteines} g vises) : ajoutez oeufs, volaille, legumineuses ou laitages.`);

  // 3. Legumes
  const vegRatio = totMeals ? vegMeals / totMeals : 0;
  if (vegRatio >= 0.5) forts.push('Belle presence de legumes dans vos repas.');
  else axes.push('Peu de legumes : visez au moins une portion de legumes a chaque repas principal.');

  // 4. Aliments ultra-transformes (habitudes declarees + ecarts "autre")
  const textes = [];
  const h = state.preferences.habitudes || {}; Object.values(h).forEach((v) => v && textes.push(v));
  Object.values(state.suivi).forEach((s) => { if (s.autre && s.autre.repas) textes.push(s.autre.repas); });
  const blob = textes.join(' ').toLowerCase();
  const junkHits = JUNK_KEYS.filter((k) => blob.includes(k));
  if (junkHits.length >= 2) axes.push('Aliments plaisir / ultra-transformes assez frequents (' + junkHits.slice(0, 3).join(', ') + ') : gardez-les, mais en quantite raisonnee.');
  else if (textes.length) forts.push('Peu d\'aliments ultra-transformes reperes : continuez ainsi.');

  if (!forts.length) forts.push('Vous demarrez votre suivi : chaque repas renseigne ameliore l\'analyse.');
  if (!axes.length) axes.push('Rien a signaler pour l\'instant : continuez sur cette lancee !');

  $('#analyseBody').innerHTML = `
    <div class="ana-block ana-forts">
      <h3>${icSvg('check-circle')} Vos points forts</h3>
      <ul>${forts.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
    </div>
    <div class="ana-block ana-axes">
      <h3>${icSvg('leaf')} Pistes d'amelioration</h3>
      <ul>${axes.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
    </div>
    <p class="panel-sub">Rappel bienveillant : ce sont des reperes, pas des regles. Avancez a votre rythme.</p>`;
}

// ---------- Analyse avancee (Niveau 2) : reponses detaillees -> decisions concretes ----------
function calculerAjustements(av, profil) {
  const mult = {}, tempsMax = {}, rass = [], expl = [];
  let repasParJour = Number(profil.repas_par_jour) || 3;
  const exterieur = {};
  const bumpSnack = () => { if (repasParJour < 4) repasParJour = 4; };
  const m = (t, f) => { mult[t] = (mult[t] || 1) * f; };

  if (av.faim === 'soir' || av.sucre === 'soir') {
    m('diner', 1.18); m('petit-dejeuner', 0.88); rass.push('diner'); bumpSnack();
    expl.push({ t: 'Faim / envies plus fortes le soir', d: 'Diner plus rassasiant (plus de proteines et de legumes) et collation cadree dans l\'apres-midi, pour eviter le creux du soir.' });
  }
  if (av.appetitMatin === 'non' || av.faim === 'midi') {
    m('petit-dejeuner', 0.8); m('dejeuner', 1.1); m('diner', 1.08);
    expl.push({ t: 'Peu d\'appetit le matin', d: 'Petit-dejeuner plus leger et apports reportes sur le dejeuner et le diner.' });
  }
  if (av.grignotage === 'aprem' || av.sucre === 'aprem') {
    bumpSnack();
    expl.push({ t: 'Grignotage en fin d\'apres-midi', d: 'Une collation est prevue dans l\'apres-midi pour cadrer la faim, au lieu de laisser un vide qui pousse au grignotage.' });
  }
  if (av.midi === 'rapide') {
    tempsMax['dejeuner'] = 15;
    expl.push({ t: 'Peu de temps le midi', d: 'Dejeuners rapides (15 min max), faciles a preparer ou a emporter.' });
  }
  if (av.midi === 'exterieur') {
    exterieur.dejeuner = true;
    expl.push({ t: 'Dejeuner souvent a l\'exterieur', d: 'Le midi : des suggestions compatibles restaurant / boulangerie / repas froid, plutot qu\'une recette a cuisiner.' });
  }
  if (av.soirCuisine === 'fatigue') {
    tempsMax['diner'] = 20;
    expl.push({ t: 'Peu d\'energie pour cuisiner le soir', d: 'Diners simples et rapides (20 min max), faciles a preparer a l\'avance.' });
  }
  if (av.sport === 'matin') {
    bumpSnack(); m('petit-dejeuner', 1.05);
    expl.push({ t: 'Sport le matin', d: 'Petit-dejeuner oriente proteines + glucides pour la recuperation, et collation possible autour de la seance.' });
  }
  if (av.sucre === 'soir') {
    expl.push({ t: 'Envie de sucre le soir', d: 'Diner plus rassasiant et possibilite d\'un dessert maitrise, pour calmer l\'envie sans exces.' });
  }
  if ((av.etat || []).length) {
    expl.push({ t: 'Sommeil / stress / fatigue', d: 'Le magnesium est mis en avant dans vos recommandations de complements ; on privilegie aussi des repas reguliers.' });
  }
  return { serverAjustements: { repartitionMult: mult, tempsMaxCreneau: tempsMax, rassasiantCreneau: rass }, repasParJour, exterieur, explications: expl };
}

function collectAvance() {
  const fd = new FormData($('#avanceForm'));
  state.avance = {
    faim: fd.get('faim'), appetitMatin: fd.get('appetitMatin'), grignotage: fd.get('grignotage'),
    sucre: fd.get('sucre'), midi: fd.get('midi'), soirCuisine: fd.get('soirCuisine'), sport: fd.get('sport'),
    etat: $$('.chip-set[data-multifield="etat"] .chip.selected').map((c) => c.dataset.value),
  };
}

async function appliquerAvance() {
  collectAvance();
  const aj = calculerAjustements(state.avance, state.profil);
  state.profil.repas_par_jour = aj.repasParJour; // eventuellement une collation en plus
  state.preferences.ajustements = aj.serverAjustements;
  state.preferences.etat = state.avance.etat || [];
  state.preferences.grignote = !!(state.avance.grignotage && state.avance.grignotage !== 'non');
  state.preferences.faimSoir = state.avance.faim === 'soir' || state.avance.sucre === 'soir';
  state.avance._exterieur = aj.exterieur;

  showLoader('On personnalise votre plan…');
  try {
    await fetchPlan(Math.floor(Math.random() * 1e6) + 1);
    postProcessExterieur();
    renderNeeds();
    renderPlan();
    renderAjustements(aj.explications);
    saveLocal();
  } catch (e) { alert('Impossible de recalculer le plan pour le moment.'); }
  finally { hideLoader(); }
}

// Marque certains creneaux comme "a l'exterieur" (suggestions au lieu d'une recette).
function postProcessExterieur() {
  const ext = (state.avance && state.avance._exterieur) || {};
  if (!state.plan) return;
  state.plan.jours.forEach((jour) => jour.repas.forEach((repas) => { repas.exterieur = !!ext[repas.creneau]; }));
}

function renderAjustements(explications) {
  const cont = $('#ajustementsBody');
  if (!cont) return;
  if (!explications || !explications.length) {
    cont.innerHTML = '<div class="aj-done">Plan recalcule. Ajoutez des precisions ci-dessus pour l\'adapter encore plus finement.</div>';
    return;
  }
  cont.innerHTML = `<div class="recipe-section-title">Ce qu'on a adapte pour vous</div>${
    explications.map((e) => `<div class="aj-item"><b>${escapeHtml(e.t)}</b><span>${escapeHtml(e.d)}</span></div>`).join('')}`;
}

function openAvance() {
  const a = state.avance || {};
  ['faim', 'appetitMatin', 'grignotage', 'sucre', 'midi', 'soirCuisine', 'sport'].forEach((n) => {
    const el = $(`#avanceForm [name="${n}"]`); if (el && a[n]) el.value = a[n];
  });
  $$('.chip-set[data-multifield="etat"] .chip').forEach((c) => c.classList.toggle('selected', (a.etat || []).includes(c.dataset.value)));
  $('#ajustementsBody').innerHTML = '';
  $('#avancePanel').classList.remove('hidden');
}
function closeAvance() { $('#avancePanel').classList.add('hidden'); }

// ---------- Complements alimentaires : recommandation prudente (a regles) ----------
const COMPLEMENT_ROLES = {
  proteines: 'aident a couvrir vos besoins en proteines et a tenir la satiete.',
  creatine: 'soutient la force et la performance a l\'entrainement.',
  magnesium: 'contribue a reduire la fatigue et au fonctionnement normal des muscles et des nerfs.',
  omega3: 'interessant si vous mangez peu de poissons gras (sardine, maquereau, saumon).',
  vitamines: 'filet de securite si votre alimentation est parfois desequilibree.',
  vitamineD: 'souvent un peu basse en hiver ou avec peu d\'exposition au soleil.',
  fibres: 'aident a la satiete et au transit.',
  bruleur: 'effet tres limite : ce n\'est pas un levier prioritaire.',
};

function mangeAssezPoisson(prefs) {
  const txt = [...(prefs.frequents || []), ...(prefs.aimes || []), ...Object.values(prefs.habitudes || {})].join(' ').toLowerCase();
  return /poisson|saumon|thon|sardine|maquereau|truite|cabillaud|hareng/.test(txt);
}

// Renvoie { resume, reco:[{cle,nom,priorite,role,dejaPris}], alertes:[] }.
function recommanderComplements(profil, prefs) {
  const objectif = profil.objectif || 'maintien';
  const prisRaw = (profil.complements || []).filter((c) => c && c !== 'non' && c !== 'aucun');
  const pris = new Set(prisRaw);
  const actif = ['modere', 'actif', 'tres_actif'].includes(profil.activite);
  const poissonOk = mangeAssezPoisson(prefs);
  // Signaux de l'analyse avancee (Niveau 2) : affinent les priorites.
  const etat = new Set(prefs.etat || []);
  const stressFatigue = etat.has('stress') || etat.has('fatigue') || etat.has('sommeil');
  const faimGrignote = !!(prefs.faimSoir || prefs.grignote);
  const reco = [];
  const alertes = [];
  const add = (cle, priorite, roleExtra) => reco.push({
    cle, nom: COMPLEMENT_LABELS[cle] || cle, priorite,
    role: (roleExtra ? roleExtra + ' ' : '') + (COMPLEMENT_ROLES[cle] || ''),
    dejaPris: pris.has(cle),
  });

  if (objectif === 'perte') {
    add('proteines', 'utile', 'En perte de poids, surtout si vos apports sont justes :');
    add('fibres', faimGrignote ? 'utile' : 'optionnel', faimGrignote ? 'Vous avez signale de la faim / des grignotages :' : 'Si vous avez souvent faim :');
    add('magnesium', stressFatigue ? 'utile' : 'optionnel', stressFatigue ? 'Vous avez signale du stress, de la fatigue ou un sommeil difficile :' : 'Si vous vous sentez stresse, fatigue ou dormez mal :');
  } else if (objectif === 'muscle') {
    add('proteines', 'utile', 'A privilegier seulement si l\'alimentation ne couvre pas vos besoins :');
    add('creatine', actif ? 'utile' : 'optionnel', 'Si vous vous entrainez regulierement :');
    add('magnesium', stressFatigue ? 'utile' : 'optionnel', stressFatigue ? 'Vous avez signale une recuperation difficile :' : 'Si la recuperation est difficile :');
  } else if (objectif === 'energie') {
    add('magnesium', 'utile', 'Pour le tonus au quotidien :');
    add('omega3', poissonOk ? 'optionnel' : 'utile', poissonOk ? '' : 'Vous semblez manger peu de poisson :');
    add('vitamineD', 'optionnel', 'Selon la saison et votre exposition au soleil :');
  } else { // maintien
    add('omega3', poissonOk ? 'optionnel' : 'utile', poissonOk ? '' : 'Vous semblez manger peu de poisson :');
    add('magnesium', 'optionnel', 'En cas de fatigue ou de stress :');
  }

  // Alertes douces.
  if (pris.has('bruleur')) {
    alertes.push('Vous mentionnez un bruleur de graisse : son effet est tres limite et ce n\'est pas une priorite. L\'essentiel reste votre alimentation et votre activite — vous pouvez tout a fait vous en passer.');
  }
  if (pris.has('vitamines') && pris.has('magnesium')) {
    alertes.push('Vitamines/mineraux et magnesium peuvent se recouper : verifiez les doses pour ne pas cumuler inutilement.');
  }
  if (prisRaw.length >= 4) {
    alertes.push('Vous prenez deja plusieurs complements. Vous pourriez simplifier en gardant surtout ceux marques "utile" pour votre objectif, et eviter l\'accumulation.');
  }

  const labels = prisRaw.map((c) => COMPLEMENT_LABELS[c] || c);
  const resume = labels.length
    ? 'Vous prenez actuellement : ' + labels.join(', ') + (profil.complementsDetail ? ` (${profil.complementsDetail}).` : '.')
    : 'Vous ne prenez aucun complement pour le moment — c\'est tout a fait possible : l\'alimentation reste la base.';

  return { resume, reco, alertes };
}

const PRIORITE_LABEL = { indispensable: 'Indispensable', utile: 'Utile', optionnel: 'Optionnel' };

function openComplements() { renderComplements(); $('#complementsPanel').classList.remove('hidden'); }
function closeComplements() { $('#complementsPanel').classList.add('hidden'); }

function renderComplements() {
  const data = recommanderComplements(state.profil, state.preferences);
  const alertes = data.alertes.map((a) => `<div class="comp-alert">${icSvg('spark')} ${escapeHtml(a)}</div>`).join('');
  const reco = data.reco.map((r) => `
    <div class="comp-item">
      <div class="comp-item-head">
        <span class="comp-name">${escapeHtml(r.nom)}${r.dejaPris ? ' <span class="comp-deja">deja pris</span>' : ''}</span>
        <span class="comp-prio prio-${r.priorite}">${PRIORITE_LABEL[r.priorite] || r.priorite}</span>
      </div>
      <div class="comp-role">${escapeHtml(r.role)}</div>
    </div>`).join('');
  $('#complementsBody').innerHTML = `
    <div class="comp-resume">${escapeHtml(data.resume)}</div>
    ${alertes ? `<div class="recipe-section-title">A noter</div>${alertes}` : ''}
    <div class="recipe-section-title">Recommandation selon votre objectif</div>
    ${reco}
    <p class="panel-sub" style="margin-top:16px">Informations generales, non medicales : elles ne remplacent pas l'avis d'un professionnel de sante. Les complements sont une aide secondaire, jamais la base du resultat.</p>`;
}

// ---------- Export agenda (.ics) (E3) ----------
const CRENEAU_HEURES = { 'petit-dejeuner': [8, 0, 30], dejeuner: [12, 30, 45], collation: [16, 0, 15], diner: [19, 30, 45] };

function icsEscape(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
function pad2(n) { return String(n).padStart(2, '0'); }
function fmtIcsDate(d) { return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + 'T' + pad2(d.getHours()) + pad2(d.getMinutes()) + '00'; }

function exportIcs() {
  if (!state.plan) return;
  const base = new Date(); base.setHours(0, 0, 0, 0); // le plan demarre aujourd'hui
  const lignes = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//My Coach Nutrition//FR', 'CALSCALE:GREGORIAN'];
  const stamp = fmtIcsDate(new Date());
  let uid = 0;
  state.plan.jours.forEach((jour, di) => {
    jour.repas.forEach((repas) => {
      const r = repas.recette; if (!r) return;
      const [hh, mm, dur] = CRENEAU_HEURES[repas.creneau] || [12, 0, 30];
      const start = new Date(base); start.setDate(base.getDate() + di); start.setHours(hh, mm, 0, 0);
      const end = new Date(start); end.setMinutes(start.getMinutes() + dur);
      const titre = `${repas.label} - ${r.nom}`;
      const ingr = (r.ingredients || []).slice(0, 5).map((i) => i.nom).join(', ');
      const desc = `${r.nom}\n${state.masquerCalories ? '' : r.kcal + ' kcal - '}${r.proteines} g proteines\nIngredients : ${ingr}\n(My Coach Nutrition - indicatif)`;
      lignes.push('BEGIN:VEVENT', `UID:mcn-${di}-${repas.creneau}-${uid++}@mycoach`, `DTSTAMP:${stamp}`,
        `DTSTART:${fmtIcsDate(start)}`, `DTEND:${fmtIcsDate(end)}`, `SUMMARY:${icsEscape(titre)}`, `DESCRIPTION:${icsEscape(desc)}`, 'END:VEVENT');
    });
  });
  lignes.push('END:VCALENDAR');
  const blob = new Blob([lignes.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'my-coach-nutrition.ics';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Sauvegarde locale ----------
function saveLocal() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      profil: state.profil, preferences: state.preferences, plan: state.plan,
      source: state.source, masquerCalories: state.masquerCalories,
      portions: state.portions, favoris: state.favoris, exclus: state.exclus,
      suivi: state.suivi, avance: state.avance,
      savedAt: new Date().toISOString(),
    }));
    $('#saveState').innerHTML = icSvg('check') + ' Plan sauvegarde';
  } catch (_) { /* quota / mode prive */ }
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    state.profil = data.profil || {};
    state.preferences = data.preferences || {};
    state.source = data.source || 'demo';
    state.masquerCalories = !!data.masquerCalories;
    state.portions = data.portions || 1;
    state.favoris = data.favoris || [];
    state.exclus = data.exclus || [];
    state.suivi = data.suivi || {};
    state.avance = data.avance || {};
    state.plan = data.plan || null;
    return !!data.plan;
  } catch (_) { return false; }
}

// ---------- Generation + affichage resultat ----------
async function generateAndShow(seed) {
  showLoader('On prepare votre plan…');
  try {
    await fetchPlan(seed);
    postProcessExterieur();
    renderNeeds();
    renderPlan();
    saveLocal();
    showScreen('result');
  } catch (e) { alert('Desole, la generation a echoue. Reessayez dans un instant.'); }
  finally { hideLoader(); }
}

// ---------- Badge mode (IA / demo) ----------
async function refreshModeBadge() {
  try {
    const res = await fetch(apiUrl('/api/status'), { headers: nutriAuthHeaders() });
    const data = await res.json();
    state.ia = !!data.ia;
    const badge = $('#modeBadge');
    if (data.ia) { badge.textContent = 'Mode Claude'; badge.className = 'badge badge-ia'; }
    else { badge.textContent = 'Mode demo'; badge.className = 'badge badge-demo'; }
  } catch (_) { /* ignore */ }
}

// ---------- Init ----------
function init() {
  if (window.__NUTRI_BLOCKED) return; // accès refusé (gate app principale)
  initSelections();
  goToStep(1);
  refreshModeBadge();

  $('#ctaStart').addEventListener('click', () => showScreen('onboarding'));
  $('#btnNext').addEventListener('click', () => { if (validateStep()) goToStep(state.step + 1); });
  $('#btnPrev').addEventListener('click', () => goToStep(state.step - 1));

  $('#onboardingForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validateStep()) return;
    collectProfile();
    generateAndShow();
  });

  $('#btnShopping').addEventListener('click', openShopping);
  $('#shoppingClose').addEventListener('click', closeShopping);
  $('#shoppingPanel').addEventListener('click', (e) => { if (e.target.id === 'shoppingPanel') closeShopping(); });
  $('#btnExportShopping').addEventListener('click', exportShoppingPdf);

  $('#btnFavoris').addEventListener('click', openFavoris);
  $('#favorisClose').addEventListener('click', closeFavoris);
  $('#favorisPanel').addEventListener('click', (e) => { if (e.target.id === 'favorisPanel') closeFavoris(); });

  // Nouveaux panneaux : fiche, suivi, analyse + export agenda.
  $('#btnFiche').addEventListener('click', openFiche);
  $('#ficheClose').addEventListener('click', closeFiche);
  $('#fichePanel').addEventListener('click', (e) => { if (e.target.id === 'fichePanel') closeFiche(); });
  $('#btnSuivi').addEventListener('click', openSuivi);
  $('#suiviClose').addEventListener('click', closeSuivi);
  $('#suiviPanel').addEventListener('click', (e) => { if (e.target.id === 'suiviPanel') closeSuivi(); });
  $('#btnAnalyse').addEventListener('click', openAnalyse);
  $('#analyseClose').addEventListener('click', closeAnalyse);
  $('#analysePanel').addEventListener('click', (e) => { if (e.target.id === 'analysePanel') closeAnalyse(); });
  $('#btnComplements').addEventListener('click', openComplements);
  $('#complementsClose').addEventListener('click', closeComplements);
  $('#complementsPanel').addEventListener('click', (e) => { if (e.target.id === 'complementsPanel') closeComplements(); });
  $('#btnAvance').addEventListener('click', openAvance);
  $('#avanceClose').addEventListener('click', closeAvance);
  $('#avancePanel').addEventListener('click', (e) => { if (e.target.id === 'avancePanel') closeAvance(); });
  $('#avanceForm').addEventListener('submit', (e) => { e.preventDefault(); appliquerAvance(); });
  $('#btnAgenda').addEventListener('click', exportIcs);

  // Complements : "Non" est exclusif ; le champ detail apparait des qu'un "Oui" est coche.
  const compSet = $('.chip-set[data-multifield="complements"]');
  if (compSet) compSet.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip'); if (!chip) return;
    if (chip.dataset.value === 'non') {
      // Selectionner "Non" deselectionne tout le reste.
      if (chip.classList.contains('selected')) $$('.chip', compSet).forEach((c) => { if (c !== chip) c.classList.remove('selected'); });
    } else if (chip.classList.contains('selected')) {
      // Selectionner un "Oui" deselectionne "Non".
      const non = $('.chip[data-value="non"]', compSet);
      if (non) non.classList.remove('selected');
    }
    const ouiCoche = $$('.chip.selected', compSet).some((c) => c.dataset.value !== 'non');
    $('#complementsDetailWrap').classList.toggle('hidden', !ouiCoche);
  });

  $('#btnExportPlan').addEventListener('click', exportPlanPdf);
  $('#btnNewPlan').addEventListener('click', () => generateAndShow(Math.floor(Math.random() * 1e6) + 1));
  $('#btnEditProfile').addEventListener('click', () => { showScreen('onboarding'); goToStep(1); });

  $('#portMinus').addEventListener('click', () => setPortions(state.portions - 1));
  $('#portPlus').addEventListener('click', () => setPortions(state.portions + 1));

  $('#modalClose').addEventListener('click', closeRecipe);
  $('#recipeModal').addEventListener('click', (e) => { if (e.target.id === 'recipeModal') closeRecipe(); });

  $('#navRestart').addEventListener('click', () => { if (confirm('Recommencer depuis le debut ?')) showScreen('landing'); });

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeRecipe(); closeShopping(); closeFavoris(); closeFiche(); closeSuivi(); closeAnalyse(); closeComplements(); closeAvance(); } });

  if (loadLocal()) {
    $('#portValue').textContent = state.portions;
    renderNeeds();
    renderPlan();
    $('#saveState').innerHTML = icSvg('check') + ' Plan restaure';
    showScreen('result');
  }
}

document.addEventListener('DOMContentLoaded', init);
