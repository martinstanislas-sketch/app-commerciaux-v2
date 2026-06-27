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
// Mode démonstration client (session démo validée par code) : tout est isolé.
function isDemo() { return !!window.__NUTRI_DEMO; }
function demoToken() { return (window.__NUTRI_DEMO && window.__NUTRI_DEMO.token) || null; }
// En contexte app principale, l'API /nutrition/api/* est protégée : on joint le token
// Bearer. En mode démo, on utilise le jeton de session démo (jamais le token admin).
function nutriAuthHeaders(base) {
  const h = Object.assign({}, base || {});
  let t = demoToken();
  if (!t) { try { t = localStorage.getItem('authToken'); } catch (_) { /* ignore */ } }
  if (t) h['Authorization'] = 'Bearer ' + t;
  return h;
}

// Stockage isolé : par compte client (suivi par email), sinon démo, sinon normal.
// Le namespacing par email evite que deux clients sur un meme navigateur se melangent.
const STORE_KEY = (window.__NUTRI_USER && window.__NUTRI_USER.email)
  ? ('mc-nutri-state-' + window.__NUTRI_USER.email)
  : (isDemo() ? 'mycoach-nutrition-demo-v1' : 'mycoach-nutrition-v1');
const TOTAL_STEPS = 5;

const state = {
  step: 1,
  profil: {},
  preferences: {},
  plan: null,
  source: 'demo',
  masquerCalories: false,
  portions: 1, // multiplicateur de la liste de courses = adultes + 0,5 x enfants
  adultes: 1, // nb d'adultes pour qui on cuisine (liste de courses)
  enfants: 0, // nb d'enfants (0,5 portion chacun)
  favoris: [], // recettes favorites (objets complets) -> reproposees en priorite
  exclus: [], // ids de recettes "ne plus me proposer"
  suivi: {}, // adherence : cle "di-mi" -> { statut, autre:{repas,quantite,commentaire} }
  ia: false, // Claude actif ? (recettes guidees dynamiques) - renseigne par /api/status
  avance: {}, // analyse avancee niveau 2 (faim, grignotage, sport, etat...)
  celebratedDays: [], // index des jours deja felicites (une seule fois par jour/plan)
  weekDone: false, // recap de semaine deja affiche pour ce plan
  complementsSuivis: [], // cles des complements ajoutes au plan (suivi quotidien)
  suiviComp: {}, // "di-cle" -> true : complement pris ce jour-la
  coachMessages: [], // memoire de conversation du Coach IA
  coachBusy: false,
  startDate: null, // date "YYYY-MM-DD" du 1er affichage = jour 0 du plan
  communauteUnlocked: false, // espace Communauté débloqué (plan généré au moins une fois)
  communauteJoined: false, // l'utilisateur a rejoint son groupe de challenge
  communauteVue: false, // message d'intro Communauté déjà affiché
  communautePosts: [], // partages de l'utilisateur dans le feed du groupe
};

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

function normTxt(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}
// Libelle COURT du creneau pour le badge des cartes (evite les retours a la ligne
// et harmonise l'affichage). N'affecte que l'affichage du badge, pas la donnee.
const CRENEAU_COURT = {
  'petit-dejeuner': 'Petit-déj',
  'collation du matin': 'Collation matin',
  "collation de l'apres-midi": 'Collation après-midi',
  'collation apres sport': 'Collation sport',
  'collation du soir': 'Collation soir',
  'dejeuner': 'Déjeuner',
  'diner': 'Dîner',
};
function creneauCourt(label) {
  return CRENEAU_COURT[normTxt(label)] || label;
}
function fmtQty(q) {
  const n = Math.round((Number(q) || 0) * 100) / 100;
  return Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// Libelle d'unite propre et accentue (gere le pluriel des unites comptables).
function uniteLabel(unite, qty) {
  const u = normTxt(unite);
  const n = Number(qty) || 0;
  const map = {
    'piece': n > 1 ? 'pièces' : 'pièce',
    'tranche': n > 1 ? 'tranches' : 'tranche',
    'poignee': n > 1 ? 'poignées' : 'poignée',
    'c. a cafe': 'c. à café', 'cuillere a cafe': 'c. à café', 'cac': 'c. à café',
    'c. a soupe': 'c. à soupe', 'cuillere a soupe': 'c. à soupe', 'cas': 'c. à soupe',
    'g': 'g', 'ml': 'ml', 'cl': 'cl', 'l': 'l',
  };
  return map[u] || unite;
}
// Affichage accentue des cuisines (les donnees restent des slugs sans accent).
const CUISINE_LABELS = {
  francaise: 'Française', italienne: 'Italienne', mediterraneenne: 'Méditerranéenne',
  asiatique: 'Asiatique', indienne: 'Indienne', mexicaine: 'Mexicaine', americaine: 'Américaine',
  orientale: 'Orientale', africaine: 'Africaine', anglaise: 'Anglaise', espagnole: 'Espagnole',
};
function cuisineLabel(c) { return CUISINE_LABELS[normTxt(c)] || (c ? c.charAt(0).toUpperCase() + c.slice(1) : c); }
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

// ---------- Valeurs nutritionnelles des ingredients echangeables ----------
// Pour 100 g / 100 ml. Sert a recalculer les macros d'une recette quand on
// remplace un ingredient (mode hors-ligne), via la DIFFERENCE old -> new.
// Cles "propres" : minuscules, sans accent ni apostrophe. Les plus specifiques
// d'abord (ex. "beurre de cacahuete" avant "beurre").
const NUTRI = {
  'pave de saumon': { kcal: 200, p: 20, g: 0, l: 13 }, 'saumon': { kcal: 200, p: 20, g: 0, l: 13 },
  'dos de cabillaud': { kcal: 80, p: 18, g: 0, l: 1 }, 'cabillaud': { kcal: 80, p: 18, g: 0, l: 1 },
  'filet de colin': { kcal: 80, p: 17, g: 0, l: 1 }, 'colin': { kcal: 80, p: 17, g: 0, l: 1 },
  'filet de truite': { kcal: 140, p: 20, g: 0, l: 6 }, 'truite': { kcal: 140, p: 20, g: 0, l: 6 },
  'filet de poulet': { kcal: 110, p: 23, g: 0, l: 2 }, 'poulet': { kcal: 110, p: 23, g: 0, l: 2 },
  'tofu': { kcal: 145, p: 16, g: 3, l: 8 }, 'pois chiches': { kcal: 165, p: 9, g: 27, l: 3 },
  'boisson vegetale (avoine)': { kcal: 45, p: 1, g: 7, l: 1.5 },
  'boisson vegetale (amande)': { kcal: 24, p: 0.5, g: 3, l: 1.1 },
  'boisson vegetale': { kcal: 35, p: 1, g: 5, l: 1.3 }, 'lait demi-ecreme': { kcal: 47, p: 3.3, g: 5, l: 1.6 },
  'yaourt grec': { kcal: 97, p: 9, g: 4, l: 5 }, 'yaourt nature': { kcal: 61, p: 3.5, g: 5, l: 3.3 },
  'skyr': { kcal: 63, p: 11, g: 4, l: 0.2 }, 'fromage blanc': { kcal: 75, p: 8, g: 4, l: 3 },
  'beurre de cacahuete': { kcal: 590, p: 25, g: 20, l: 50 },
  'puree d amande': { kcal: 630, p: 21, g: 13, l: 55 }, 'puree de noisette': { kcal: 650, p: 15, g: 12, l: 62 },
  'huile d olive': { kcal: 884, p: 0, g: 0, l: 100 }, 'margarine': { kcal: 720, p: 0, g: 0, l: 80 },
  'beurre': { kcal: 717, p: 0.9, g: 0.1, l: 81 },
  'amande': { kcal: 580, p: 21, g: 22, l: 49 }, 'noisette': { kcal: 628, p: 15, g: 17, l: 61 }, 'noix': { kcal: 654, p: 15, g: 14, l: 65 },
  'banane': { kcal: 89, p: 1.1, g: 23, l: 0.3 }, 'pomme': { kcal: 52, p: 0.3, g: 14, l: 0.2 },
  'poire': { kcal: 57, p: 0.4, g: 15, l: 0.1 }, 'ananas': { kcal: 50, p: 0.5, g: 13, l: 0.1 },
  'fruits de saison': { kcal: 60, p: 0.7, g: 14, l: 0.3 }, 'fruits': { kcal: 60, p: 0.7, g: 14, l: 0.3 },
  'courgette': { kcal: 17, p: 1.2, g: 3, l: 0.3 }, 'aubergine': { kcal: 25, p: 1, g: 6, l: 0.2 },
  'brocoli': { kcal: 34, p: 2.8, g: 7, l: 0.4 }, 'haricots verts': { kcal: 31, p: 1.8, g: 7, l: 0.1 },
  'poivron': { kcal: 31, p: 1, g: 6, l: 0.3 }, 'epinard': { kcal: 23, p: 2.9, g: 3.6, l: 0.4 },
  'miel': { kcal: 304, p: 0.3, g: 82, l: 0 }, 'sirop d erable': { kcal: 260, p: 0, g: 67, l: 0 }, 'sucre': { kcal: 400, p: 0, g: 100, l: 0 },
  'sauce teriyaki': { kcal: 130, p: 5, g: 26, l: 0 }, 'tamari': { kcal: 60, p: 10, g: 5, l: 0 }, 'sauce soja': { kcal: 60, p: 8, g: 6, l: 0 },
  // Viandes (valeurs crues, par 100 g)
  'dinde hachee': { kcal: 150, p: 18, g: 0, l: 8 },
  'escalope de dinde': { kcal: 110, p: 24, g: 0, l: 1.5 }, 'steak de dinde': { kcal: 110, p: 24, g: 0, l: 1.5 }, 'emince de dinde': { kcal: 110, p: 24, g: 0, l: 1.5 },
  'boeuf hache': { kcal: 200, p: 20, g: 0, l: 13 }, 'steak de boeuf': { kcal: 180, p: 26, g: 0, l: 8 }, 'boeuf a griller emince': { kcal: 180, p: 26, g: 0, l: 8 },
  'hache vegetal': { kcal: 170, p: 17, g: 5, l: 9 },
  // Feculents (valeurs crues sauf "cuit", par 100 g)
  'pates completes': { kcal: 340, p: 13, g: 66, l: 2.5 }, 'pates': { kcal: 350, p: 12, g: 70, l: 1.5 },
  'riz': { kcal: 350, p: 7, g: 77, l: 0.6 }, 'semoule': { kcal: 350, p: 12, g: 72, l: 1 },
  'boulgour': { kcal: 340, p: 12, g: 76, l: 1.3 }, 'quinoa': { kcal: 368, p: 14, g: 64, l: 6 },
  'lentilles cuites': { kcal: 116, p: 9, g: 20, l: 0.4 },
  'patate douce': { kcal: 86, p: 1.6, g: 20, l: 0.1 }, 'courge': { kcal: 26, p: 1, g: 6, l: 0.1 },
};
const PIECE_G = { banane: 120, pomme: 150, poire: 160, oeuf: 50 };
const nettoyerNom = (s) => normTxt(s).replace(/['’]/g, ' ').replace(/\s+/g, ' ').trim();

// Convertit une quantite + unite en grammes (approximations usuelles).
function grammesIngredient(nom, qty, unite) {
  const u = normTxt(unite || '');
  const q = Number(qty) || 0;
  if (u === 'g' || u === 'ml') return q;
  if (u === 'piece') { const n = nettoyerNom(nom); const k = Object.keys(PIECE_G).find((x) => n.includes(x)); return q * (k ? PIECE_G[k] : 100); }
  if (u === 'c. a soupe') return q * 15;
  if (u === 'c. a cafe') return q * 5;
  if (u === 'gousse') return q * 5;
  if (u === 'pincee') return q * 1;
  if (u === 'tranche') return q * 20;
  if (u === 'poignee') return q * 30;
  return q;
}

// Macros apportees par un ingredient (selon sa quantite). null si inconnu.
function macrosIngredient(nom, qty, unite) {
  const n = nettoyerNom(nom);
  const key = Object.keys(NUTRI).find((k) => n.includes(k));
  if (!key) return null;
  const per = NUTRI[key];
  const f = grammesIngredient(nom, qty, unite) / 100;
  return { kcal: per.kcal * f, p: per.p * f, g: per.g * f, l: per.l * f };
}

// ---------- Navigation entre ecrans ----------
function showScreen(id) {
  $$('.screen').forEach((s) => s.classList.remove('active'));
  $(`#screen-${id}`).classList.add('active');
  $('#navRestart').classList.toggle('hidden', id === 'landing');
  // Active la "coque" (sidebar desktop + decalage du contenu) uniquement sur l'ecran plan.
  document.body.classList.toggle('app-shell', id === 'result');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showLoader(text) {
  $('#loaderText').textContent = text || 'On prepare votre plan…';
  $('#loader').classList.remove('hidden');
}
function hideLoader() { $('#loader').classList.add('hidden'); }

// Loader premium : revele le plan etape par etape (coches progressives) sur
// ~10 s. Renvoie une promesse resolue a la fin de l'animation. La generation
// reelle tourne en parallele (instantanee en mode demo).
function runPlanReveal(durationMs) {
  durationMs = durationMs || 10000;
  const loader = $('#planLoader');
  const steps = Array.prototype.slice.call(loader.querySelectorAll('.pl-step'));
  const bar = loader.querySelector('.pl-bar > i');
  steps.forEach((s) => s.classList.remove('active', 'done'));
  bar.style.transition = 'none';
  bar.style.width = '0%';
  loader.classList.remove('hidden');
  loader.setAttribute('aria-hidden', 'false');
  void loader.offsetWidth; // reflow pour relancer la transition de la barre
  bar.style.transition = 'width ' + durationMs + 'ms linear';
  bar.style.width = '100%';
  const per = durationMs / steps.length;
  steps.forEach((s, i) => {
    setTimeout(() => s.classList.add('active'), Math.round(i * per) + 60);
    setTimeout(() => { s.classList.remove('active'); s.classList.add('done'); }, Math.max(0, Math.round((i + 1) * per) - 220));
  });
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}
function hidePlanLoader() {
  const loader = $('#planLoader');
  loader.classList.add('hidden');
  loader.setAttribute('aria-hidden', 'true');
}

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
      if (set.dataset.multifield === 'collations') updateCollationDetails();
    });
  });
}

// Affiche les precisions sur les collations (type + raison) uniquement si au
// moins un moment de collation est selectionne (hors "non").
function updateCollationDetails() {
  const box = $('#collationDetails');
  if (!box) return;
  const moments = getMultiValues('collations').filter((c) => c !== 'non');
  box.classList.toggle('hidden', moments.length === 0);
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
  // A chaque changement d'etape (Continuer / Retour), on revient tout en haut
  // pour que l'utilisateur voie toutes les questions dans l'ordre.
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
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
  const matinGout = ($('.choice-grid[data-field="matinGout"]') || {}).dataset ? ($('.choice-grid[data-field="matinGout"]').dataset.selected || 'les-deux') : 'les-deux';
  state.masquerCalories = $('input[name="masquerCalories"]').checked;

  state.profil = {
    objectif,
    sexe: fd.get('sexe'),
    age: Number(fd.get('age')),
    taille_cm: Number(fd.get('taille_cm')),
    poids_kg: Number(fd.get('poids_kg')),
    activite: fd.get('activite'),
    jours: Number(fd.get('jours')),
    // Repas de la journee pilotes par les vraies habitudes : petit-dejeuner
    // (sauf "je ne mange pas le matin") + collations cochees (matin/aprem/soir).
    mangeMatin: matinGout !== 'aucun',
    collations: getMultiValues('collations').filter((c) => c !== 'non'),
    // Donnees de pesee (optionnel) : affinent le calcul, surtout Challenge 6/6.
    metabolisme_basal: Number(fd.get('metabolisme_basal')) || undefined,
    masse_grasse: Number(fd.get('masse_grasse')) || undefined,
    masse_musculaire: Number(fd.get('masse_musculaire')) || undefined,
    type_journee: fd.get('type_journee') || undefined,
    seances_sport: Number(fd.get('seances_sport')) || undefined,
    // Reglages Challenge 6/6 (objectif de perte + intensite du deficit, ajustables).
    perte_objectif_kg: Number(fd.get('perte_objectif_kg')) || 6,
    deficit_cible: Number(fd.get('deficit_cible')) || 650,
    // Ajustement hebdomadaire cumule (modifie par le suivi de pesee).
    ajustementKcal: 0,
    // Dine tard : repercute sur la repartition (diner plus leger).
    dinerTard: (($('.choice-grid[data-field="dinerTard"]') || {}).dataset || {}).selected || 'non',
    // Complements alimentaires (enregistres dans le profil, reutilisables).
    complements: getMultiValues('complements'),
    complementsDetail: (fd.get('complementsDetail') || '').trim(),
  };
  state.pesees = [];
  state.preferences = {
    cuisines: getMultiValues('cuisines'),
    matinGout,
    // Categories de collations preferees (fruits-laitiers, oleagineux, proteinees,
    // tartines, smoothies, emporter) -> le moteur alterne parmi celles choisies.
    collationCategories: getMultiValues('collationCategories'),
    aimes: parseCsv(fd.get('aimes')),
    deteste: parseCsv(fd.get('deteste')),
    allergies: [...getMultiValues('allergiesCourantes'), ...parseCsv(fd.get('allergies'))],
    regime: getMultiValues('regime'),
    budget: fd.get('budget'),
    temps_max: Number(fd.get('temps_max')),
    dinerTard: (($('.choice-grid[data-field="dinerTard"]') || {}).dataset || {}).selected || 'non',
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
  // Nouveau profil = nouveau suivi (et felicitations remises a zero).
  state.suivi = {};
  state.celebratedDays = [];
  state.weekDone = false;
  // Complements suivis = ce que l'utilisateur a declare prendre (questionnaire).
  // Il pourra en ajouter/retirer depuis la section Complements.
  state.complementsSuivis = (state.profil.complements || []).filter((c) => c && c !== 'non' && c !== 'aucun' && c !== 'autre');
  state.suiviComp = {};
  state.coachMessages = []; // nouveau profil = nouvelle conversation coach
}

// Pre-remplit le questionnaire avec le profil + preferences deja enregistres
// (inverse de collectProfile), pour "Refaire mon plan" sans repartir de zero.
function prefillOnboarding() {
  const p = state.profil || {};
  const pr = state.preferences || {};
  const form = $('#onboardingForm'); if (!form) return;
  const setVal = (name, v) => { const el = form.querySelector(`[name="${name}"]`); if (el && v != null && v !== '' && !(typeof v === 'number' && Number.isNaN(v))) el.value = v; };
  const setChk = (name, v) => { const el = form.querySelector(`[name="${name}"]`); if (el) el.checked = !!v; };
  const setGrid = (field, v) => { const g = $(`.choice-grid[data-field="${field}"]`); if (!g || v == null || v === '') return; g.dataset.selected = v; $$('.choice', g).forEach((b) => b.classList.toggle('selected', b.dataset.value === v)); };
  const setChips = (field, arr) => { const s = $(`.chip-set[data-multifield="${field}"]`); if (!s) return; const set = new Set(arr || []); $$('.chip', s).forEach((c) => c.classList.toggle('selected', set.has(c.dataset.value))); };
  // --- Profil ---
  setGrid('objectif', p.objectif);
  setVal('sexe', p.sexe); setVal('age', p.age); setVal('taille_cm', p.taille_cm); setVal('poids_kg', p.poids_kg);
  setVal('activite', p.activite); setVal('jours', p.jours);
  setVal('metabolisme_basal', p.metabolisme_basal); setVal('masse_grasse', p.masse_grasse);
  setVal('masse_musculaire', p.masse_musculaire); setVal('type_journee', p.type_journee);
  setGrid('dinerTard', p.dinerTard);
  setChips('collations', p.collations);
  setChips('complements', p.complements);
  setVal('complementsDetail', p.complementsDetail);
  // --- Preferences ---
  // Cuisines : on remappe les anciennes valeurs granulaires vers les 5 categories
  // (indienne/mexicaine/americaine/orientale... -> monde) pour le prereremplissage.
  const cuisines5 = new Set(['francaise', 'italienne', 'mediterraneenne', 'asiatique', 'monde']);
  setChips('cuisines', (pr.cuisines || []).map((c) => (cuisines5.has(c) ? c : 'monde')));
  setGrid('matinGout', pr.matinGout);
  setChips('collationCategories', pr.collationCategories);
  setVal('aimes', (pr.aimes || []).join(', '));
  setVal('deteste', (pr.deteste || []).join(', '));
  setChips('regime', pr.regime);
  setVal('budget', pr.budget); setVal('temps_max', pr.temps_max);
  // Allergies : on coche les puces connues, le reste va dans le champ libre.
  const allergSet = $('.chip-set[data-multifield="allergiesCourantes"]');
  const chipVals = allergSet ? $$('.chip', allergSet).map((c) => c.dataset.value) : [];
  const allerg = pr.allergies || [];
  setChips('allergiesCourantes', allerg.filter((a) => chipVals.includes(a)));
  setVal('allergies', allerg.filter((a) => !chipVals.includes(a)).join(', '));
  setChk('masquerCalories', state.masquerCalories);
  // Revele le bloc collations (type/raison) si des collations sont cochees.
  if (typeof updateCollationDetails === 'function') updateCollationDetails();
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

// Tous les ids de recettes deja presents dans le plan (pour eviter les doublons
// quand on regenere un seul repas).
function planRecipeIds() {
  const ids = [];
  (state.plan && state.plan.jours || []).forEach((j) => (j.repas || []).forEach((rp) => { if (rp.recette && rp.recette.id) ids.push(rp.recette.id); }));
  return ids;
}
async function fetchMeal(creneau, kcalCible, exclureId) {
  const res = await fetch(apiUrl('/api/meal'), {
    method: 'POST',
    headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ profil: state.profil, preferences: prefsForServer(), creneau, kcalCible, exclureId, exclus: planRecipeIds() }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Erreur');
  return data.recette;
}

// ---------- Rendu : besoins ----------
function renderNeeds() {
  const b = state.plan.besoins;
  const objLabels = { perte: 'Perte de poids', maintien: 'Maintien', muscle: 'Prise de muscle', energie: 'Plus d\'energie', challenge: 'Challenge 6/6' };
  const pk = b.macros.proteines * 4, gk = b.macros.glucides * 4, lk = b.macros.lipides * 9;
  const tot = pk + gk + lk || 1;
  const bar = (v) => `<div class="macbar"><i style="width:${Math.round((v / tot) * 100)}%"></i></div>`;
  const kcalBlock = state.masquerCalories ? ''
    : `<div class="needs-stat"><div class="num">${b.kcalCible}</div><div class="lbl">kcal / jour</div></div>`;
  const isChallenge = state.profil.objectif === 'challenge';
  $('#needsCard').innerHTML = `
    <div class="needs-head"><span class="needs-ic">${icSvg(isChallenge ? 'flame' : 'target')}</span><h2>Objectif : ${objLabels[state.profil.objectif] || ''}</h2></div>
    <p class="needs-sub">Votre objectif, résumé en chiffres.</p>
    <div class="needs-stats">
      ${kcalBlock}
      <div class="needs-stat"><div class="num">${b.macros.proteines} g</div><div class="lbl">Protéines</div>${bar(pk)}</div>
      <div class="needs-stat"><div class="num">${b.macros.glucides} g</div><div class="lbl">Glucides</div>${bar(gk)}</div>
      <div class="needs-stat"><div class="num">${b.macros.lipides} g</div><div class="lbl">Lipides</div>${bar(lk)}</div>
    </div>`;
}

// ---------- Pesee hebdomadaire + ajustement automatique (Challenge 6/6) ----------
function openPesee() { renderPesee(); $('#peseePanel').classList.remove('hidden'); }
function closePesee() { $('#peseePanel').classList.add('hidden'); }

function renderPesee() {
  const pesees = (state.pesees || []).slice().sort((a, b) => a.ts - b.ts);
  const aj = Math.round(Number((state.profil || {}).ajustementKcal) || 0);
  const reco = state.lastAjustement;
  const fmtDate = (ts) => new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  let histo = '';
  if (pesees.length) {
    const rev = pesees.slice().reverse();
    histo = '<div class="pesee-histo"><div class="pesee-histo-title">Historique</div>' + rev.map((p, i) => {
      const prev = rev[i + 1];
      const d = prev ? (p.poids - prev.poids) : null;
      const dTxt = d === null ? '' : `<span class="pesee-delta ${d < 0 ? 'down' : (d > 0 ? 'up' : '')}">${d > 0 ? '+' : ''}${d.toFixed(1)} kg</span>`;
      return `<div class="pesee-line"><span>${fmtDate(p.ts)}</span><b>${p.poids} kg</b>${dTxt}</div>`;
    }).join('') + '</div>';
  }
  let recoBlock = '';
  if (reco) {
    recoBlock = `<div class="pesee-reco st-${reco.statut}">
      <p>${escapeHtml(reco.message)}</p>
      ${reco.delta !== 0 ? `<button type="button" class="btn btn-primary" id="peseeApply">Appliquer ${reco.delta > 0 ? '+' : ''}${reco.delta} kcal et régénérer</button>` : ''}
    </div>`;
  }
  $('#peseeBody').innerHTML = `
    <div class="pesee-form">
      <div class="field-row">
        <label class="field"><span>Poids du jour (kg)</span><input type="number" id="peseePoids" min="35" max="250" step="0.1" placeholder="ex. 74.2" /></label>
        <label class="field"><span>Masse musculaire (kg) <em>(opt.)</em></span><input type="number" id="peseeMuscle" min="1" max="120" step="0.1" placeholder="ex. 29" /></label>
      </div>
      <label class="pesee-check"><input type="checkbox" id="peseeFatigue" /> <span>Je me sens fatigué(e) cette semaine</span></label>
      <button type="button" class="btn btn-primary" id="peseeSave">Enregistrer la pesée</button>
    </div>
    ${recoBlock}
    <p class="pesee-cumul">Ajustement actuel : <b>${aj >= 0 ? '+' : ''}${aj} kcal/jour</b></p>
    ${histo}`;
  $('#peseeSave').addEventListener('click', savePesee);
  const applyBtn = $('#peseeApply');
  if (applyBtn) applyBtn.addEventListener('click', applyAjustement);
}

async function savePesee() {
  const poids = Number($('#peseePoids').value);
  if (!poids || poids < 35 || poids > 250) { alert('Entrez un poids valide (en kg).'); return; }
  const muscle = Number($('#peseeMuscle').value) || undefined;
  const fatigue = $('#peseeFatigue').checked;
  state.pesees = state.pesees || [];
  state.pesees.push({ ts: Date.now(), poids, masse_musculaire: muscle, fatigue });
  saveLocal();
  const deficit = (state.plan && state.plan.besoins && state.plan.besoins.deficit)
    || (state.profil && state.profil.deficit_cible) || 650;
  try {
    const res = await fetch(apiUrl('/api/ajustement'), {
      method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ pesees: state.pesees, deficit, sexe: (state.profil || {}).sexe, fatigue }),
    });
    const data = await res.json();
    state.lastAjustement = data.ok ? data.ajustement : null;
  } catch (_) { state.lastAjustement = null; }
  renderPesee();
}

async function applyAjustement() {
  if (!state.lastAjustement) return;
  const delta = Number(state.lastAjustement.delta) || 0;
  state.profil.ajustementKcal = Math.max(-400, Math.min(400, (Number(state.profil.ajustementKcal) || 0) + delta));
  state.lastAjustement = null;
  saveLocal();
  closePesee();
  await generateAndShow(Math.floor(Math.random() * 1e6) + 1);
}

// ---------- Alignement du plan sur le jour reel ----------
// Le plan demarre au jour ou il est genere (state.startDate). On NE reordonne
// JAMAIS le tableau jours[] (les cles de suivi "di-mi" restent stables) : on se
// contente de renommer chaque jour (startDate + index) et d'ouvrir l'app sur la
// bonne journee. A chaque reconnexion, l'index "aujourd'hui" est recalcule.
const JOURS_SEMAINE = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

function todayMidnight() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function ymd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function startMidnight() {
  if (!state.startDate) return todayMidnight();
  const [y, m, j] = String(state.startDate).split('-').map(Number);
  const d = new Date(y, (m || 1) - 1, j || 1);
  return isNaN(d.getTime()) ? todayMidnight() : d;
}
// Jours ecoules depuis le demarrage (>= 0).
function joursDepuisDemarrage() {
  return Math.max(0, Math.round((todayMidnight().getTime() - startMidnight().getTime()) / 86400000));
}
// Index du jour "aujourd'hui" DANS le plan (borne au dernier jour si depasse).
function indexJourActuel() {
  const n = (state.plan && state.plan.jours && state.plan.jours.length) || 1;
  return Math.min(joursDepuisDemarrage(), n - 1);
}
// Aujourd'hui est-il encore dans la fenetre du plan ? (sinon : plan termine)
function jourActuelDansPlan() {
  const n = (state.plan && state.plan.jours && state.plan.jours.length) || 0;
  return joursDepuisDemarrage() < n;
}
// Renomme chaque jour avec le jour de semaine reel (startDate + index).
function appliquerLabelsCalendaires() {
  if (!state.plan || !Array.isArray(state.plan.jours)) return;
  const base = startMidnight();
  state.plan.jours.forEach((j, i) => {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    j.jour = JOURS_SEMAINE[d.getDay()];
  });
}
// Ancre la date de demarrage (la cree si absente = 1er affichage = aujourd'hui),
// aligne les libelles et ouvre sur la journee du jour. Renvoie true si c'etait
// le tout premier affichage (date creee a l'instant).
function ancrerDemarragePlan(forceAujourdhui) {
  const premiere = forceAujourdhui || !state.startDate;
  if (forceAujourdhui || !state.startDate) state.startDate = ymd(todayMidnight());
  appliquerLabelsCalendaires();
  state.activeDay = indexJourActuel();
  return premiere;
}

// Animation d'apparition des cartes : seulement au 1er rendu du plan (pas a
// chaque clic de suivi qui re-render). Les appelants peuvent la reactiver.
let _animateMeals = true;

// ---------- Rendu : grille du plan ----------
function renderPlan() {
  const grid = $('#planGrid');
  grid.innerHTML = '';
  const jours = state.plan.jours || [];
  let active = Number.isInteger(state.activeDay) ? state.activeDay : 0;
  if (active < 0 || active >= jours.length) active = 0;
  state.activeDay = active;

  const todayIdx = jourActuelDansPlan() ? indexJourActuel() : -1;

  // Selecteur de jours horizontal (mobile : un jour a la fois ; desktop : masque, semaine entiere)
  const sel = document.createElement('div');
  sel.className = 'day-selector';
  sel.innerHTML = jours.map((j, i) =>
    `<button type="button" class="day-pill${i === active ? ' on' : ''}${i === todayIdx ? ' is-today' : ''}" data-day-pill="${i}">${String(j.jour || '').slice(0, 3)}</button>`).join('');
  grid.appendChild(sel);

  jours.forEach((jour, di) => {
    const dayKcal = jour.repas.reduce((sum, r) => sum + (r.recette && !r.exterieur ? r.recette.kcal : 0), 0);
    const card = document.createElement('div');
    card.className = 'day-card' + (di === active ? ' is-active' : '');
    card.dataset.dayIndex = di;
    const kcalTag = state.masquerCalories ? '' : `<span class="day-kcal">${dayKcal} kcal</span>`;
    const title = document.createElement('div');
    title.className = 'day-title';
    const nowTag = di === todayIdx ? '<span class="day-now">Jour en cours</span>' : '';
    title.innerHTML = `${jour.jour}${nowTag}${kcalTag}<button class="day-regen" data-day="${di}">${icSvg('refresh')} Toute la journee</button>`;
    card.appendChild(title);
    const row = document.createElement('div');
    row.className = 'meals-row meals-n' + jour.repas.length; // colonnes nettes selon le nombre de repas
    jour.repas.forEach((repas, mi) => row.appendChild(renderMealCard(repas, di, mi)));
    card.appendChild(row);
    // Bloc "Complements du jour" : meme liste chaque jour, suivi (pris/non) par jour.
    const comps = complementsActifs();
    if (comps.length) {
      const cb = document.createElement('div');
      cb.className = 'day-comps';
      cb.innerHTML = `<div class="day-comps-title">${icSvg('pill')} Compléments du jour</div>` +
        comps.map((c) => {
          const pris = !!state.suiviComp[di + '-' + c.cle];
          return `<button type="button" class="comp-day${pris ? ' is-pris' : ''}" data-comp-di="${di}" data-comp-cle="${c.cle}">
            <span class="comp-day-check">${pris ? icSvg('check') : ''}</span>
            <span class="comp-day-txt"><strong>${escapeHtml(c.nom)}</strong><span>${escapeHtml(c.moment)}</span></span>
            <span class="comp-day-state">${pris ? 'Pris ✓' : 'À prendre'}</span>
          </button>`;
        }).join('');
      card.appendChild(cb);
    }
    grid.appendChild(card);
  });
  $$('.day-regen').forEach((b) => b.addEventListener('click', () => regenerateDay(Number(b.dataset.day))));
  $$('#planGrid .comp-day').forEach((b) => b.addEventListener('click', () => toggleComplementPris(Number(b.dataset.compDi), b.dataset.compCle)));
  $$('#planGrid .day-pill').forEach((p) => p.addEventListener('click', () => setDay(Number(p.dataset.dayPill))));
  setupPlanSwipe();
  _animateMeals = false;   // l'entree ne joue qu'une fois
  state._swappedKey = null; // le flash de remplacement n'est consomme qu'une fois
}

// Affiche un jour donne (mobile) ; sur desktop tous les jours restent visibles.
function setDay(i) {
  const jours = (state.plan && state.plan.jours) || [];
  i = Math.max(0, Math.min(jours.length - 1, i));
  state.activeDay = i;
  $$('#planGrid .day-card').forEach((c) => c.classList.toggle('is-active', Number(c.dataset.dayIndex) === i));
  $$('#planGrid .day-pill').forEach((p) => p.classList.toggle('on', Number(p.dataset.dayPill) === i));
  const ap = document.querySelector(`#planGrid .day-pill[data-day-pill="${i}"]`);
  if (ap) ap.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
}
// Navigation par swipe horizontal sur le plan (mobile).
function setupPlanSwipe() {
  const grid = $('#planGrid');
  if (!grid || grid._swipeBound) return;
  grid._swipeBound = true;
  let x0 = null, y0 = null;
  grid.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  grid.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy)) return; // ignore les gestes verticaux
    setDay((state.activeDay || 0) + (dx < 0 ? 1 : -1));
  }, { passive: true });
}

// Un seul badge mis en avant par recette (priorite regime > proteines > glucides).
function recipeBadge(r) {
  const reg = (r.regime || []).map((x) => normTxt(x));
  if (reg.includes('vegan')) return { txt: 'Vegan', cls: 'b-veg' };
  if (reg.includes('sans-gluten')) return { txt: 'Sans gluten', cls: 'b-gf' };
  const p = Number(r.proteines) || 0, g = Number(r.glucides) || 0, k = Number(r.kcal) || 0;
  if (p >= 22) return { txt: 'Riche en protéines', cls: 'b-prot' };
  if (g <= 15 && k > 150) return { txt: 'Faible en glucides', cls: 'b-low' };
  if (reg.includes('vegetarien')) return { txt: 'Végétarien', cls: 'b-veg' };
  if (p >= 18) return { txt: 'Riche en protéines', cls: 'b-prot' };
  return null;
}

function renderMealCard(repas, di, mi) {
  const el = document.createElement('div');
  el.className = 'meal-card';
  // Repas pris a l'exterieur (analyse avancee) : suggestions au lieu d'une recette.
  if (repas.exterieur) {
    el.innerHTML = `
      <div class="meal-photo" data-cat="exterieur">
        ${icSvg('bowl')}
        <div class="meal-grad"></div>
        <div class="meal-toprow"><span class="meal-creneau">${escapeHtml(creneauCourt(repas.label))}</span></div>
        <div class="meal-overlay"><h3 class="meal-name">À l'extérieur — options équilibrées</h3></div>
      </div>
      <div class="meal-body">
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
  const altLine = st === 'autre' && suivi.autre
    ? `<div class="meal-alt">${icSvg('edit')} ${escapeHtml(suivi.autre.repas || '')}${suivi.autre.quantite ? ' (' + escapeHtml(suivi.autre.quantite) + ')' : ''}</div>`
    : '';
  const badge = recipeBadge(r);
  const badgeHTML = badge ? `<span class="meal-badge ${badge.cls}">${escapeHtml(badge.txt)}</span>` : '';
  const kcalMeta = state.masquerCalories ? '' : `<span class="mm-kcal">${icSvg('flame')} ${r.kcal} kcal</span>`;
  // Animations : entree au 1er rendu (stagger via --mi) ; flash si remplacee.
  if (_animateMeals) { el.classList.add('meal-in'); el.style.setProperty('--mi', mi); }
  if (state._swappedKey === trackKey(di, mi)) el.classList.add('meal-swapped');
  el.innerHTML = `
    <div class="meal-photo" data-cat="${cat}">
      <img class="meal-img" src="images/recipes/${r.id}.jpg" alt="${escapeHtml(r.nom)}" loading="lazy" onload="this.classList.add('loaded')" onerror="this.remove()" />
      ${icSvg(glyph)}
      <div class="meal-grad"></div>
      <div class="meal-toprow">
        <span class="meal-creneau">${escapeHtml(creneauCourt(repas.label))}</span>
        <span class="meal-toprow-right">
          ${badgeHTML}
          ${r.adapte ? `<span class="meal-adapte">${icSvg('swap')} Adapté</span>` : ''}
          ${isFav ? `<span class="meal-fav">${icSvg('heart')}</span>` : ''}
        </span>
      </div>
      <div class="meal-overlay">
        <h3 class="meal-name" data-act="open">${escapeHtml(r.nom)}</h3>
        <div class="meal-meta">
          <span class="mm-time">${icSvg('clock')} ${r.tempsMinutes} min</span>
          ${kcalMeta}
        </div>
      </div>
    </div>
    <div class="meal-body">
      <div class="meal-actions">
        <button class="mini-btn mini-btn-main" data-act="open">${icSvg('eye')} Voir la recette</button>
        <button class="mini-btn" data-act="swap">${icSvg('refresh')} Remplacer</button>
      </div>
      <div class="meal-track">
        <button class="track-btn ${st === 'respecte' ? 'on-ok' : ''}" data-act="t-ok" title="Repas suivi" aria-label="Repas suivi">${icSvg('check')}</button>
        <button class="track-btn ${st === 'non' ? 'on-no' : ''}" data-act="t-no" title="Non suivi" aria-label="Non suivi">${icSvg('x')}</button>
        <button class="track-btn ${st === 'autre' ? 'on-alt' : ''}" data-act="t-alt" title="Modifier ce repas" aria-label="Modifier ce repas">${icSvg('edit')}</button>
      </div>
      ${altLine}
      ${collationOptionHTML(repas)}
    </div>`;
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    const act = btn && btn.dataset.act;
    if (act === 'open') openRecipe(r, di, mi);
    if (act === 'swap') swapMeal(di, mi);
    if (act === 't-ok') setMealStatus(di, mi, 'respecte');
    if (act === 't-no') setMealStatus(di, mi, 'non');
    if (act === 't-alt') openSuiviForMeal(di, mi);
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
  // Felicitations si cette action vient de completer la journee (tous "respecte").
  if (statut === 'respecte') checkDayCompletion(di);
}

// ---------- Valorisation : journee complete + recap de semaine ----------
// Une journee est "validee" quand TOUS ses repas (ayant une recette) sont
// marques "respecte". Les creneaux sans recette sont ignores.
function dayIsComplete(di) {
  const jour = state.plan && state.plan.jours && state.plan.jours[di];
  if (!jour || !Array.isArray(jour.repas)) return false;
  const reels = jour.repas.filter((rp) => rp && rp.recette);
  if (!reels.length) return false;
  return jour.repas.every((rp, mi) => {
    if (!rp || !rp.recette) return true;
    const s = state.suivi[trackKey(di, mi)];
    return s && s.statut === 'respecte';
  });
}

// Appele apres chaque passage d'un repas en "respecte" : si la journee vient
// d'etre completee (et n'a pas deja ete felicitee), on celebre une seule fois.
function checkDayCompletion(di) {
  if (!dayIsComplete(di)) return;
  if (state.celebratedDays.includes(di)) return;
  state.celebratedDays.push(di);
  const total = state.plan.jours.length;
  const doneDays = state.plan.jours.reduce((n, _, i) => n + (dayIsComplete(i) ? 1 : 0), 0);
  const semaineComplete = doneDays >= total && total >= 1 && !state.weekDone;
  if (semaineComplete) state.weekDone = true;
  saveLocal();
  celebrateDay(di, { doneDays, total, lastOfWeek: semaineComplete });
}

const DAY_MESSAGES = [
  'Bravo, journée validée !',
  'Belle régularité aujourd\'hui.',
  'Objectif du jour atteint.',
  'Super, vous avancez dans la bonne direction.',
  'Journée complète validée, continuez comme ça.',
];

// Overlay premium et sobre : coche animee + halo + confettis discrets.
function celebrateDay(di, info) {
  info = info || {};
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const msg = DAY_MESSAGES[di % DAY_MESSAGES.length];
  const done = info.doneDays || 1;
  const total = info.total || 7;
  const prog = `${done} jour${done > 1 ? 's' : ''} sur ${total} validé${done > 1 ? 's' : ''} cette semaine`;
  const sub = info.lastOfWeek
    ? 'Semaine complète — un instant, on vous prépare le résumé…'
    : 'La régularité se construit jour après jour. Continuez !';
  const confetti = reduceMotion ? '' :
    Array.from({ length: 16 }, (_, i) => `<i class="dc-cf dc-cf-${i % 4}" style="left:${(i * 6 + 3) % 100}%;animation-delay:${(i % 6) * 70}ms"></i>`).join('');
  const ov = document.createElement('div');
  ov.className = 'day-celebrate';
  ov.innerHTML = `
    <div class="dc-confetti" aria-hidden="true">${confetti}</div>
    <div class="dc-card" role="status">
      <div class="dc-badge">
        <svg class="dc-check" viewBox="0 0 52 52" aria-hidden="true"><circle class="dc-circle" cx="26" cy="26" r="23"/><path class="dc-tick" d="M15 27l7.5 7.5L38 19"/></svg>
      </div>
      <h3 class="dc-title">${escapeHtml(msg)}</h3>
      <p class="dc-prog">${escapeHtml(prog)}</p>
      <p class="dc-sub">${escapeHtml(sub)}</p>
      <button class="dc-btn" type="button">Continuer</button>
    </div>`;
  document.body.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add('show'));
  const close = () => {
    if (ov._closed) return; ov._closed = true;
    clearTimeout(ov._timer);
    ov.classList.remove('show');
    setTimeout(() => { ov.remove(); if (info.lastOfWeek) showWeekRecap(info); }, 320);
  };
  ov.querySelector('.dc-btn').addEventListener('click', close);
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  ov._timer = setTimeout(close, info.lastOfWeek ? 2600 : 4600);
}

// Recap simple, positif et non technique apres une semaine complete validee.
function showWeekRecap(info) {
  info = info || {};
  const total = info.total || 7;
  const lignes = [
    `${total} jours sur ${total} validés`,
    'Excellente régularité cette semaine',
    'Vous avez bien suivi votre plan sur l\'ensemble de la semaine',
    'Votre constance est votre meilleur levier de progression',
  ];
  const items = lignes.map((l) => `<li><span class="wr-ic">${icSvg('check')}</span><span>${escapeHtml(l)}</span></li>`).join('');
  const ov = document.createElement('div');
  ov.className = 'week-recap';
  ov.innerHTML = `
    <div class="wr-card" role="dialog" aria-label="Récapitulatif de la semaine">
      <div class="wr-badge">${icSvg('star')}</div>
      <h3 class="wr-title">Votre semaine est validée</h3>
      <p class="wr-sub">Voici un résumé simple de votre régularité cette semaine.</p>
      <ul class="wr-list">${items}</ul>
      <div class="wr-tip"><span class="wr-ic">${icSvg('flame')}</span><span>Continuez sur ce rythme et gardez des repas simples à préparer.</span></div>
      <button class="wr-btn" type="button">Continuer</button>
    </div>`;
  document.body.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add('show'));
  const close = () => {
    if (ov._closed) return; ov._closed = true;
    ov.classList.remove('show');
    setTimeout(() => ov.remove(), 320);
  };
  ov.querySelector('.wr-btn').addEventListener('click', close);
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
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
    if (nouvelle) { repas.recette = nouvelle; clearTrack(di, mi); state._swappedKey = trackKey(di, mi); renderPlan(); saveLocal(); }
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
        <div class="m"><div class="n">${r.proteines} g</div><div class="l">Protéines</div></div>
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
    const scanBtn = inPlan
      ? `<button class="ing-scan" title="Remplacer en scannant un produit" aria-label="Scanner pour remplacer ${escapeHtml(i.nom)}" data-ing="${idx}">${icSvg('scan')}</button>` : '';
    return `<li><span class="ing-left">${escapeHtml(i.nom)}${swapBtn}${scanBtn}</span><span class="q">${q} ${uniteLabel(i.unite, (Number(i.quantite) || 0) * state.portions)}</span></li>`;
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
    <div class="macro-chips">${r.adapte ? `<span class="macro-chip adapte">${icSvg('swap')} Adapté avec tes produits</span>` : ''}${(r.cuisines || []).map((c) => `<span class="macro-chip">${escapeHtml(cuisineLabel(c))}</span>`).join('')}<span class="macro-chip time">${icSvg('clock')} ${r.tempsMinutes} min</span></div>
    ${actions}
    ${macros}
    ${portionsNote}
    <div class="recipe-section-title">Ingrédients</div>
    <ul class="ing-list">${ingredients}</ul>
    <div id="recipePrep"></div>`;

  // Fiche guidee complete (locale, immediate) : materiel, prep, etapes,
  // reperes, ajustements, dressage. Claude l'enrichit ensuite si actif.
  renderGuidedRecipe(r, buildLocalRecipeDetail(r));

  $('#recipeFav').addEventListener('click', () => { toggleFavori(r); openRecipe(state.plan && inPlan ? state.plan.jours[di].repas[mi].recette : r, di, mi); });
  if (inPlan) {
    $('#recipeExclude').addEventListener('click', () => excludeRecipe(di, mi));
    $$('#modalBody .ing-swap').forEach((b) => b.addEventListener('click', () => swapIngredient(di, mi, Number(b.dataset.ing))));
    $$('#modalBody .ing-scan').forEach((b) => b.addEventListener('click', () => openScanForReplace(di, mi, Number(b.dataset.ing))));
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
  if (!$('#recipePrep')) return;
  // La fiche guidee locale est deja affichee : on enrichit en silence si Claude repond.
  let detail = null;
  try { detail = await fetchRecipeDetail(r); } catch (e) { detail = null; }
  if (modalContext.recipe !== r) return; // l'utilisateur a change de recette entre-temps
  if (!detail) return; // on garde la fiche locale complete
  applyDetailToModal(detail, r, di, mi, recompute);
}

function applyDetailToModal(detail, r, di, mi, recompute) {
  if ($('#recipePrep')) {
    // On fusionne : Claude fournit materiel/etapes/dressage plus precis ; on garde
    // la preparation des ingredients, les reperes visuels et les ajustements locaux.
    const local = buildLocalRecipeDetail(r);
    renderGuidedRecipe(r, {
      materiel: (detail.materiel && detail.materiel.length) ? detail.materiel : local.materiel,
      preparation: local.preparation,
      etapes: (detail.etapes && detail.etapes.length) ? detail.etapes : local.etapes,
      reperes: local.reperes,
      ajustements: local.ajustements,
      dressage: detail.dressage || local.dressage,
    });
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

// ---------- Fiche recette guidee (locale, sans IA) ----------
function listeNoms(arr) {
  const n = arr.map((i) => i.nom.toLowerCase());
  if (n.length === 1) return n[0];
  return n.slice(0, -1).join(', ') + ' et ' + n[n.length - 1];
}
// Construit une fiche complete et pedagogique a partir des ingredients + etapes.
// Construit une fiche guidee COHERENTE avec la vraie recette : aucune phrase
// generique hors-sujet (pas de "legumes" pour un fruit, pas de "poele" sans
// cuisson, pas de "toppings/croquant" sans ingredient croquant).
function buildLocalRecipeDetail(r) {
  const ings = r.ingredients || [];
  const txt = ((r.etapes || []).join(' ') + ' ' + ings.map((i) => i.nom).join(' ')).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const has = (re) => re.test(txt);
  const norm = (s) => normTxt(s);
  // Riz CUIT (pour distinguer "farine de riz", "lait de riz", "galette de riz").
  const rizCuit = /(?<!farine de )(?<!lait de )(?<!galettes? de )(?<!nouilles? de )(?<!pois-)(?<!pois )\briz\b/.test(txt);

  // --- La recette comporte-t-elle une CUISSON ? (sinon : pas de poele/four/feu) ---
  const poele = has(/poel|saisir|dorer|revenir|sauter|omelette|au plat|brouill|\bsaute|frire|\bgrill/);
  const four = has(/\bfour\b|rotir|enfourn|gratin|\broti\b/);
  const casserole = has(/casserole|bouillir|eau bouillante|mijot|vapeur|pocher|oeufs? poche|\bsoupe\b|porridge|\brisotto/) || rizCuit;
  const cuisson = poele || four || casserole || has(/\bcuire|\bcuiss|chauff|rechauff|\bfeu\b|mijote|\bblanchir|\bdorer|gratin/);
  // Recette plutot sucree ? (priorite au champ explicite r.gout, sinon deduction)
  const sucreType = r.type === 'petit-dejeuner' || r.type === 'collation';
  const salePetitDej = has(/oeuf|omelette|jambon|bacon|avocat|saumon|\bfeta\b|charcuterie|saucisse|\bthon|\btofu\b/);
  const doux = r.gout === 'sucre' || (r.gout !== 'sale' && sucreType && !salePetitDej);

  // --- Classification des ingredients (fruit != legume) ---
  const estFruit = (i) => /banane|orange|pomme\b|poire|fraise|framboise|myrtille|fruits rouges|mangue|ananas|kiwi|raisin|\bpeche|abricot|cerise|melon|pasteque|clementine|mandarine|grenade|figue|datte|fruits de saison|fruits frais|fruits secs|compote|avocat/.test(norm(i.nom));
  const estLegume = (i) => { const n = norm(i.nom); if (/graine|farine|lait|huile|\bjus\b/.test(n)) return false; return /brocoli|courgette|poivron|epinard|haricot vert|\btomate|carotte|champignon|salade|concombre|oignon|\bail\b|aubergine|\bchou|poireau|courge|patate douce|betterave|radis|fenouil|asperge|petit pois|\bmais\b|roquette|mache|endive|navet|celeri|blette|crudite/.test(n); };
  const estCroquant = (i) => { const n = norm(i.nom); if (/lait|boisson|puree|creme|huile|sirop/.test(n)) return false; return /granola|\bnoix|amande|noisette|\bgraine|muesli|crouton|cereales|cacahuete|pignon|pistache|cajou|\bchia\b/.test(n); };
  const estLaitier = (i) => /yaourt|\bskyr|fromage blanc|petit-suisse|fromage frais|cottage|faisselle/.test(norm(i.nom));
  const estProteine = (i) => /poulet|dinde|\bboeuf|steak|\bveau|agneau|\bporc|jambon|saumon|\bthon|cabillaud|colin|merlu|truite|sardine|crevette|gambas|\boeuf|\btofu|tempeh|pois chiche|lentille|haricot rouge|\bfeta|mozzarella/.test(norm(i.nom));
  const estFeculent = (i) => /\briz\b|pates\b|quinoa|semoule|boulgour|patate|pomme de terre|\bpain\b|wrap|tortilla|galette|flocons|avoine|polenta|blini|muffin|\bpita\b/.test(norm(i.nom));
  const aJus = has(/presse|presser|pressee/) && ings.some((i) => { const n = norm(i.nom); return /\b(orange|citron|pamplemousse|clementine)\b/.test(n) && !/jus de/.test(n); });

  const fruits = ings.filter((i) => estFruit(i) && !estLegume(i));
  const legumes = ings.filter((i) => estLegume(i) && !estFruit(i));
  const croquants = ings.filter(estCroquant);
  const laitiers = ings.filter(estLaitier);
  const proteines = ings.filter(estProteine);
  const feculents = ings.filter(estFeculent);
  const noms = (arr) => arr.map((i) => i.nom.toLowerCase()).join(', ');
  const elide = (n) => { const t = n.trim(); if (/^(haricot|hareng|homard|yaourt|yuzu)/i.test(t)) return 'de ' + t; return /^[aeiouàâäéèêëîïôöûùœh]/i.test(t) ? "d'" + t : 'de ' + t; };

  // --- Materiel REELLEMENT utilise ---
  const mat = [];
  const add = (m) => { if (!mat.includes(m)) mat.push(m); };
  if (poele) { add('Poêle'); add('Spatule'); }
  if (four) add('Four');
  if (casserole || (cuisson && has(/\briz\b|pates\b|quinoa|semoule|boulgour|lentille/))) add('Casserole');
  if (has(/mixer|mixeur|smoothie|veloute|mouline|blender|\bmixe/)) add('Blender');
  if (aJus) add('Presse-agrumes');
  const aDecouper = proteines.length || legumes.length || fruits.some((i) => /orange|pomme|poire|mangue|ananas|kiwi|banane|avocat|\bpeche|melon/.test(norm(i.nom))) || has(/couper|eminc|tranche|hach|decoup/);
  if (aDecouper) { add('Couteau'); add('Planche à découper'); }
  if ((cuisson && has(/\briz\b|pates\b|quinoa|boulgour|lentille/)) || has(/egoutter|rincer|passoire|filtrer/)) add('Passoire');
  if (has(/fouet|battre|monter en neige/)) add('Fouet');
  if (has(/\brap|zeste/)) add('Râpe');
  if (laitiers.length || r.type === 'petit-dejeuner' || r.type === 'collation') add('Cuillère');
  add('Bol');
  if (!cuisson) add('Assiette');

  // --- Preparation des ingredients ---
  const prep = [];
  const sortir = ings.map((i) => `${fmtQty((Number(i.quantite) || 0) * state.portions)} ${uniteLabel(i.unite, (Number(i.quantite) || 0) * state.portions)} ${elide(i.nom.toLowerCase())}`);
  if (sortir.length) prep.push('Sortir et peser : ' + sortir.join(', ') + '.');
  if (legumes.length) prep.push('Laver et parer les légumes : ' + noms(legumes) + '.');
  if (fruits.length) {
    const aEplucher = fruits.filter((i) => /orange|banane|kiwi|mangue|ananas|clementine|mandarine|pamplemousse|avocat/.test(norm(i.nom)));
    if (aJus) prep.push('Couper puis presser les agrumes pour recueillir le jus.');
    else if (aEplucher.length) prep.push('Rincer puis éplucher les fruits : ' + noms(fruits) + '.');
    else prep.push('Rincer les fruits : ' + noms(fruits) + '.');
  }
  if (cuisson) {
    const aCouper = [...proteines, ...legumes];
    if (aCouper.length) prep.push('Couper en morceaux réguliers : ' + noms(aCouper.slice(0, 3)) + '.');
  }
  const aRincer = ings.filter((i) => {
    const n = norm(i.nom);
    if (/pois chiche|lentille|haricot rouge|\bmais\b|\bthon\b/.test(n)) return true; // conserves : rincer
    if (/(?<!farine de )(?<!lait de )\briz\b|quinoa|boulgour/.test(n) && !/cuit/.test(n)) return true; // cereale crue
    return false;
  });
  if (aRincer.length) prep.push('Rincer et égoutter : ' + noms(aRincer) + '.');
  if (four) prep.push('Préchauffer le four à 200 °C.');

  // --- Reperes visuels (adaptes : cuisson vs assemblage) ---
  const reperes = [];
  if (cuisson) {
    if (has(/poulet|dinde/)) reperes.push('La volaille ne doit plus être rosée à cœur.');
    if (has(/saumon|cabillaud|\bthon|poisson|crevette/)) reperes.push("Le poisson doit s'effeuiller facilement à la fourchette.");
    if (has(/\bboeuf|steak/)) reperes.push('Vise une belle coloration extérieure en saisissant à feu vif.');
    if (rizCuit) reperes.push('Le riz doit être tendre mais pas collant.');
    if (has(/pates\b/)) reperes.push('Les pâtes doivent rester al dente.');
    if (legumes.length) reperes.push('Les légumes doivent rester légèrement croquants et bien colorés.');
    if (has(/oeuf/)) reperes.push('Le blanc doit être pris, le jaune encore coulant selon ton goût.');
    if (has(/sauce|coulis|creme|pesto|coco/)) reperes.push('La sauce doit napper la cuillère sans être liquide.');
    if (!reperes.length) reperes.push(doux ? 'La préparation doit être dorée et bien moelleuse.' : "Goûte en fin de cuisson et ajuste l'assaisonnement.");
  } else {
    if (laitiers.length) reperes.push('Le skyr (ou fromage blanc) doit être lisse et bien frais.');
    if (fruits.length) reperes.push('Les fruits doivent être frais, juteux et bien colorés.');
    if (has(/\bpain\b|tartine|wrap|galette|biscotte/)) reperes.push('Le pain doit être bien croustillant à l\'extérieur.');
    if (croquants.length) reperes.push('Les fruits secs et les graines doivent rester croquants.');
    if (!reperes.length) reperes.push('Soigne la présentation : des ingrédients frais et nets donnent tout de suite envie.');
  }

  // --- Ajustements (adaptes au type, a la cuisson et a l'objectif) ---
  const ajust = [];
  if (doux) {
    ajust.push('Pour plus de protéines et de satiété, ajoute du skyr ou du fromage blanc.');
    if (has(/miel|sucre|sirop|confiture|chocolat|pate a tartiner/)) ajust.push('Tu surveilles les sucres ? Réduis le miel/sucre ou remplace par un fruit frais.');
    if (aJus) ajust.push('Pour limiter les sucres liquides, préfère le fruit entier au jus.');
    if (poele) ajust.push("Si ça accroche dans la poêle, ajoute un filet d'huile ou un peu de lait végétal.");
    ajust.push("Trop léger à ton goût ? Ajoute une poignée de flocons, de fruits ou d'oléagineux.");
  } else if (cuisson) {
    ajust.push('Si le plat manque de goût, ajoute des herbes, des épices ou un filet de citron.');
    if (has(/sauce|creme|coco|pesto|coulis/)) ajust.push("Sauce trop liquide ? Prolonge la cuisson 1 à 2 minutes. Trop épaisse ? Détends avec un peu d'eau.");
    if (poele) ajust.push("Si ça accroche dans la poêle, ajoute un fond d'eau ou un filet d'huile.");
    if (has(/\briz\b|pates\b|quinoa|semoule/)) ajust.push("Féculent encore ferme ? Prolonge de 2 à 3 minutes avec un peu d'eau chaude.");
  } else {
    ajust.push('Assaisonne à ton goût : sel, poivre, herbes fraîches ou filet de citron.');
    ajust.push("Pour plus de satiété, accompagne d'une portion de légumes ou d'un féculent complet.");
  }

  // --- Dressage (concret, sans "toppings/croquant" si rien de croquant) ---
  let dressage;
  const fec = feculents[0], prot = proteines[0], leg = legumes[0];
  const estTartine = has(/\bpain\b|tartine|\bwrap\b|galette|biscotte|tortilla|burrito|socca|muffin anglais/);
  const estMoule = !has(/muffin anglais/) && (four || has(/frittata|muffin|\bcake\b|gratin|banana bread|terrine/));
  if (/smoothie|\bshake\b/.test(norm(r.nom)) || has(/smoothie/)) {
    dressage = 'Verse dans un grand verre (ou un bol) et sers bien frais.';
  } else if (sucreType && !cuisson) {
    if (laitiers.length) {
      dressage = `Dépose ${laitiers[0].nom.toLowerCase()} dans un bol${fruits.length ? `, dispose ${noms(fruits)} dessus` : ''}${croquants.length ? ` et ajoute ${noms(croquants)} au dernier moment pour garder le croquant` : ''}. Sers aussitôt.`;
    } else if (estTartine) {
      dressage = 'Dresse sur une assiette, coupe en deux si besoin et sers aussitôt.';
    } else {
      dressage = `Dresse dans un bol ou une assiette${fruits.length ? `, avec ${noms(fruits)} bien visibles` : ''}. Sers frais.`;
    }
  } else if (estMoule) {
    dressage = 'Laisse tiédir, démoule ou coupe en parts, puis sers.';
  } else if (estTartine) {
    dressage = 'Dresse sur une assiette, coupe en deux si besoin et sers aussitôt.';
  } else if (cuisson && fec && prot && !doux) {
    dressage = `Dispose ${fec.nom.toLowerCase()} au fond de l'assiette, ajoute ${prot.nom.toLowerCase()} par-dessus${leg ? `, puis ${leg.nom.toLowerCase()} sur le côté` : ''}. Sers chaud, avec un filet de citron ou des herbes fraîches.`;
  } else if (doux && cuisson) {
    dressage = 'Dresse dans un bol ou une assiette et sers tiède.';
  } else if (cuisson) {
    dressage = "Dresse harmonieusement dans l'assiette et sers aussitôt, tant que c'est chaud.";
  } else {
    dressage = 'Dresse joliment dans une assiette et sers aussitôt.';
  }

  return { materiel: mat, preparation: prep, etapes: r.etapes || [], reperes, ajustements: ajust, dressage };
}
function renderGuidedRecipe(r, d) {
  const prep = $('#recipePrep'); if (!prep) return;
  const sec = (title, ic, inner) => `<div class="recipe-section-title">${ic ? icSvg(ic) + ' ' : ''}${title}</div>${inner}`;
  const liste = (arr, cls) => `<ul class="${cls}">${arr.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`;
  let html = '';
  if (d.materiel && d.materiel.length) html += sec('Matériel nécessaire', 'check-circle', `<div class="mat-set">${d.materiel.map((m) => `<span class="mat-chip">${escapeHtml(m)}</span>`).join('')}</div>`);
  if (d.preparation && d.preparation.length) html += sec('Préparation des ingrédients', 'edit', liste(d.preparation, 'prep-list'));
  html += sec('Préparation, étape par étape', 'clock', `<ol class="steps-list">${(d.etapes || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>`);
  if (d.reperes && d.reperes.length) html += sec('Repères visuels', 'eye', liste(d.reperes, 'reperes-list'));
  if (d.ajustements && d.ajustements.length) html += sec('Ajustements', 'sliders', liste(d.ajustements, 'ajust-list'));
  if (d.dressage) html += sec('Dressage', 'spark', `<p class="dressage">${escapeHtml(d.dressage)}</p>`);
  prep.innerHTML = html;
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
  // Choisir une alternative qui ne reintroduit pas un aliment interdit
  // (allergies etendues aux synonymes/familles + aliments detestes).
  const interdits = motsAllergenesInterdits();
  const courant = normTxt(ing.nom);
  const choix = alts.find((a) => {
    const na = normTxt(a);
    return na !== courant && !interdits.some((m) => m && na.includes(m));
  });
  if (!choix) { alert('Aucune alternative compatible avec vos contraintes pour cet ingredient.'); return; }
  const ancien = ing.nom;
  ing.nom = choix; // on conserve quantite/unite ; le rayon reste indicatif
  // Recalcul des macros par DIFFERENCE (old -> new) a partir de la table NUTRI.
  // Marche en mode demo comme en IA ; l'IA pourra affiner ensuite via recompute.
  const mOld = macrosIngredient(ancien, ing.quantite, ing.unite);
  const mNew = macrosIngredient(choix, ing.quantite, ing.unite);
  if (mOld && mNew) {
    recette.kcal = Math.max(0, Math.round((recette.kcal || 0) + mNew.kcal - mOld.kcal));
    recette.proteines = Math.max(0, Math.round((recette.proteines || 0) + mNew.p - mOld.p));
    recette.glucides = Math.max(0, Math.round((recette.glucides || 0) + mNew.g - mOld.g));
    recette.lipides = Math.max(0, Math.round((recette.lipides || 0) + mNew.l - mOld.l));
  }
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
const RAYON_ORDRE = ['Fruits & légumes', 'Fruits & legumes', 'Boucherie', 'Poissonnerie', 'Crèmerie', 'Cremerie', 'Boulangerie', 'Épicerie', 'Epicerie', 'Surgelés', 'Surgeles', 'Rayon frais', 'Rayon vegetal'];

// ----- Cuisiner pour plusieurs : portions = adultes + 0,5 x enfants -----
// N'affecte QUE la liste de courses / quantites a preparer, jamais le plan
// nutritionnel personnel (kcal/macros restent par personne).
function totalPortions() { return (state.adultes || 1) + 0.5 * (state.enfants || 0); }
function syncPortions() { state.portions = totalPortions() || 1; }
function personnesResume() {
  const a = state.adultes || 1, e = state.enfants || 0;
  const parts = [`${a} adulte${a > 1 ? 's' : ''}`];
  if (e > 0) parts.push(`${e} enfant${e > 1 ? 's' : ''}`);
  return parts.join(' + ');
}
function setAdultes(n) { state.adultes = Math.min(Math.max(Math.round(n), 1), 20); syncPortions(); saveLocal(); renderShopping(); }
function setEnfants(n) { state.enfants = Math.min(Math.max(Math.round(n), 0), 20); syncPortions(); saveLocal(); renderShopping(); }

// Arrondi PRATIQUE pour les courses : evite 237 g -> 240 g ; entiers pour les
// unites comptables (piece, tranche, oeuf...).
function arrondiCourses(q, unite) {
  if (!(q > 0)) return 0;
  const u = normTxt(unite || '');
  const comptable = /piece|unite|tranche|oeuf|gousse|sachet|boite|pot|cuillere|\bcs\b|\bcc\b|pincee|feuille|branche|filet|steak|poignee|verre|portion|\bbol\b|barquette/.test(u);
  if (comptable) return Math.max(1, Math.round(q));
  if (q >= 100) return Math.round(q / 10) * 10;
  if (q >= 20) return Math.round(q / 5) * 5;
  if (q >= 10) return Math.round(q);
  return Math.round(q * 2) / 2; // < 10 g/ml : au demi
}

function buildShoppingList() {
  syncPortions();
  const agg = {};
  state.plan.jours.forEach((jour) => {
    jour.repas.forEach((repas) => {
      if (!repas.recette) return;
      (repas.recette.ingredients || []).forEach((ing) => {
        const key = `${normTxt(ing.nom).replace(/\s+/g, ' ')}|${normTxt(ing.unite)}`;
        if (!agg[key]) agg[key] = { nom: ing.nom, unite: ing.unite, rayon: ing.rayon || 'Epicerie', quantite: 0 };
        agg[key].quantite += (Number(ing.quantite) || 0) * state.portions;
      });
    });
  });
  const parRayon = {};
  Object.values(agg).forEach((item) => {
    item.quantite = arrondiCourses(item.quantite, item.unite); // arrondi pratique
    (parRayon[item.rayon] = parRayon[item.rayon] || []).push(item);
  });
  return parRayon;
}

function rayonsTries(parRayon) {
  return Object.keys(parRayon).sort((a, b) => {
    const ia = RAYON_ORDRE.indexOf(a), ib = RAYON_ORDRE.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}

// Reglage "Cuisiner pour" (adultes + enfants) en haut de la liste de courses.
function personnesControlHTML() {
  const a = state.adultes || 1, e = state.enfants || 0;
  const pills = (cur, presets, kind) => {
    const vals = presets.includes(cur) ? presets : [...presets, cur].sort((x, y) => x - y);
    return vals.map((v) => `<button type="button" class="pers-pill${v === cur ? ' on' : ''}" data-pers="${kind}" data-val="${v}">${v}</button>`).join('')
      + `<button type="button" class="pers-pill pers-plus" data-pers="${kind}" data-val="plus" aria-label="Personnaliser">+</button>`;
  };
  return `
    <div class="pers-ctrl">
      <div class="pers-title">${icSvg('users')} Cuisiner pour</div>
      <div class="pers-row"><span class="pers-lbl">Adultes</span><div class="pers-pills">${pills(a, [1, 2, 3, 4], 'adultes')}</div></div>
      <div class="pers-row"><span class="pers-lbl">Enfants</span><div class="pers-pills">${pills(e, [0, 1, 2, 3], 'enfants')}</div></div>
      <div class="pers-resume">Liste calculée pour : <strong>${escapeHtml(personnesResume())}</strong><span class="pers-tot">Total portions : ${fmtQty(totalPortions())}</span></div>
      <p class="pers-note">Ajuste seulement les quantités à acheter — votre plan, vos calories et vos macros restent inchangés.</p>
    </div>`;
}

function renderShopping() {
  const parRayon = buildShoppingList();
  const cont = $('#shoppingList');
  cont.innerHTML = personnesControlHTML();
  $('#shoppingDays').textContent = state.plan.jours.length;
  const portSpan = $('#shoppingPortions'); if (portSpan) portSpan.textContent = fmtQty(state.portions);
  $$('#shoppingList .pers-pill').forEach((b) => b.addEventListener('click', () => {
    const kind = b.dataset.pers, val = b.dataset.val;
    if (kind === 'adultes') setAdultes(val === 'plus' ? (state.adultes || 1) + 1 : Number(val));
    else setEnfants(val === 'plus' ? (state.enfants || 0) + 1 : Number(val));
  }));
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
  const t = isDemo() ? 'DEMO — ' + title : title;
  const demoBanner = isDemo()
    ? '<div style="background:#0B3D91;color:#fff;text-align:center;font-weight:700;padding:8px;border-radius:8px;margin-bottom:16px;font-family:Arial,sans-serif;">MODE DEMONSTRATION — document fictif</div>'
    : '';
  const demoCss = isDemo() ? 'body::before{content:"DEMO";position:fixed;top:40%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:120px;color:rgba(11,61,145,.07);font-weight:800;z-index:-1;}' : '';
  w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(t)}</title><style>${PRINT_CSS}${demoCss}</style></head><body>${demoBanner}${innerHTML}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 350);
}

function exportPlanPdf() {
  const b = state.plan.besoins;
  const objLabels = { perte: 'Perte de poids', maintien: 'Maintien', muscle: 'Prise de muscle', energie: 'Plus d\'energie', challenge: 'Challenge 6/6' };
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
const COMPLEMENT_LABELS = { non: 'Aucun', aucun: 'Aucun', proteines: 'Proteines', creatine: 'Creatine', vitamines: 'Vitamines / mineraux', multivitamines: 'Vitamines / mineraux', omega3: 'Omega 3', magnesium: 'Magnesium', fibres: 'Fibres', electrolytes: 'Electrolytes', vitamineD: 'Vitamine D', bruleur: 'Bruleur de graisse', collagene: 'Collagene', preworkout: 'Pre-workout', autre: 'Autre' };

// Lien boutique (Biloba Nutrition) par complement recommande : un clic -> la fiche produit.
// On NE met PAS de lien pour le bruleur (deconseille) ni les fibres (pas de produit dedie).
const SHOP_BASE = 'https://bilobanutrition.fr/products/';
const SHOP_UTM = '?utm_source=mycoach&utm_medium=app&utm_campaign=complements';
const COMPLEMENT_SHOP = {
  proteines: 'whey-isolate-native-nutripure',
  creatine: 'creatine-nutripure',
  magnesium: 'magnesium-bisglycinate',
  omega3: 'mega-omega3',
  vitamineD: 'multivitamines-copie',
  vitamines: 'vitamines-1',
  multivitamines: 'vitamines-1',
  collagene: 'collagene-marin-sauvage',
  preworkout: 'abe-ultimate-pre-workout-375g',
};
// Visuel produit par complement. Par defaut on tente une image LOCALE
// (public/images/complements/<cle>.jpg) ; sinon, renseignez ici l'URL exacte de
// l'image officielle Biloba (ex. CDN Shopify). A defaut -> fallback elegant.
const COMPLEMENT_IMG = {
  // proteines: 'https://bilobanutrition.fr/cdn/shop/products/xxxx.jpg',
  // creatine: '...', magnesium: '...', omega3: '...', vitamineD: '...',
};
function complementImgSrc(cle) { return COMPLEMENT_IMG[cle] || `images/complements/${cle}.jpg`; }

// ---------- Option produit boutique sur les creneaux "collation" ----------
// 1 produit MAX par moment de collation, presente comme alternative PRATIQUE
// (jamais en remplacement de la recette : la recette reste l'option principale).
// Lien = recherche boutique (toujours valide) ; remplacez `q` par `handle`
// (slug produit exact, ex. 'raw-barre-bio') des que vous l'avez pour pointer la
// fiche produit directe.
const COLLATION_PRODUIT_UTM = 'utm_source=app&utm_medium=nutrition&utm_campaign=collations&utm_content=option_produit_collation';
const COLLATION_PRODUITS = {
  matin: { nom: 'Raw Barre Bio', tag: 'snack simple', q: 'raw barre bio' },
  'apres-midi': { nom: 'Barre protéinée', tag: 'satiété', q: 'barre proteinee' },
  'apres-sport': { nom: 'Protein Water', tag: 'après l\'effort', q: 'protein water' },
  soir: { nom: 'Raw Barre Bio', tag: 'option légère', q: 'raw barre bio' },
};
function collationMomentKey(label) {
  const n = normTxt(label);
  if (n.includes('sport')) return 'apres-sport';
  if (n.includes('matin')) return 'matin';
  if (n.includes('soir')) return 'soir';
  return 'apres-midi';
}
function collationProduitUrl(p) {
  return p.handle
    ? SHOP_BASE + p.handle + '?' + COLLATION_PRODUIT_UTM
    : 'https://bilobanutrition.fr/search?q=' + encodeURIComponent(p.q) + '&' + COLLATION_PRODUIT_UTM;
}
// Zone "Option rapide" (1 produit) pour une carte collation ; '' sinon.
function collationOptionHTML(repas) {
  if (!repas || repas.creneau !== 'collation') return '';
  const p = COLLATION_PRODUITS[collationMomentKey(repas.label)];
  if (!p) return '';
  return `
      <div class="meal-option">
        <div class="meal-option-head">${icSvg('spark')} Option rapide</div>
        <p class="meal-option-sub">Vous pouvez aussi choisir une collation prête à consommer.</p>
        <a class="meal-option-prod" href="${collationProduitUrl(p)}" target="_blank" rel="noopener noreferrer">
          <span class="mop-info"><strong>${escapeHtml(p.nom)}</strong><em>${escapeHtml(p.tag)}</em></span>
          <span class="mop-cta">${icSvg('cart')} Commander</span>
        </a>
        <p class="meal-option-note">Option pratique issue de notre boutique. L'alimentation reste la base de votre plan.</p>
      </div>`;
}

function openFiche() { renderFiche(); $('#fichePanel').classList.remove('hidden'); }
function closeFiche() { $('#fichePanel').classList.add('hidden'); }

function renderFiche() {
  const p = state.profil, pr = state.preferences, b = state.plan ? state.plan.besoins : null;
  const objLabels = { perte: 'Perte de poids', maintien: 'Maintien', muscle: 'Prise de muscle', energie: 'Plus d\'energie', challenge: 'Challenge 6/6' };
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
  electrolytes: 'utiles pour s\'hydrater lors d\'efforts longs ou par forte chaleur.',
  bruleur: 'effet tres limite : ce n\'est pas un levier prioritaire.',
};
// Moment de prise suggere (general, non medical) — affiche dans "Complements du jour".
const COMPLEMENT_MOMENT = {
  proteines: 'après l\'entraînement ou en collation',
  creatine: 'chaque jour, au même moment',
  magnesium: 'le soir',
  omega3: 'pendant un repas',
  fibres: 'avant un repas, avec un grand verre d\'eau',
  vitamines: 'le matin, au petit-déjeuner',
  vitamineD: 'le matin, au repas',
  electrolytes: 'pendant ou après l\'effort',
};
function complementMoment(cle) { return COMPLEMENT_MOMENT[cle] || 'selon recommandation'; }
// Liste des complements que l'utilisateur suit (a integrer au plan quotidien).
function complementsActifs() {
  const seen = new Set();
  return (state.complementsSuivis || [])
    .filter((c) => c && c !== 'non' && c !== 'aucun' && c !== 'autre' && !seen.has(c) && seen.add(c))
    .map((cle) => ({ cle, nom: COMPLEMENT_LABELS[cle] || cle, moment: complementMoment(cle) }));
}
function estComplementSuivi(cle) { return (state.complementsSuivis || []).includes(cle); }
// Ajoute / retire un complement du plan (bouton "Ajouter a mon plan" / "Retirer").
function toggleComplementSuivi(cle) {
  state.complementsSuivis = state.complementsSuivis || [];
  const i = state.complementsSuivis.indexOf(cle);
  if (i >= 0) state.complementsSuivis.splice(i, 1); else state.complementsSuivis.push(cle);
  saveLocal();
  renderComplements();
  if (state.plan) renderPlan(); // met a jour le bloc "Complements du jour"
}
// Coche / decoche un complement comme pris pour un jour donne (suivi quotidien).
function toggleComplementPris(di, cle) {
  const key = di + '-' + cle;
  if (state.suiviComp[key]) delete state.suiviComp[key]; else state.suiviComp[key] = true;
  saveLocal();
  renderPlan();
}

function mangeAssezPoisson(prefs) {
  const txt = [...(prefs.frequents || []), ...(prefs.aimes || []), ...Object.values(prefs.habitudes || {})].join(' ').toLowerCase();
  return /poisson|saumon|thon|sardine|maquereau|truite|cabillaud|hareng/.test(txt);
}

// Renvoie { resume, reco:[{cle,nom,priorite,role,dejaPris}], alertes:[] }.
// Genere une explication 100% personnalisee pour un complement, a partir des
// donnees reelles du profil (objectif, proteines visees, activite, regime,
// signaux, complement deja dans le plan). Ton coach : rassurant, pedagogique,
// jamais medical ni commercial. c = contexte calcule dans recommanderComplements.
function complementExplication(cle, c) {
  const prot = c.prot;
  const obj = {
    perte: 'perdre du poids', challenge: 'une perte accélérée tout en préservant vos muscles',
    muscle: 'développer votre masse musculaire', energie: 'retrouver de l\'énergie au quotidien',
    maintien: 'maintenir votre forme',
  }[c.objectif] || 'votre objectif';
  const dietNote = c.vegan ? ' Avec une alimentation vegan, atteindre ce total demande un peu d\'organisation.'
    : (c.vegetarien ? ' Avec une alimentation végétarienne, les sources concentrées de protéines sont moins nombreuses.' : '');
  const suivi = (typeof estComplementSuivi === 'function' && estComplementSuivi(cle)) || (c.pris && c.pris.has(cle));
  let t;
  switch (cle) {
    case 'proteines':
      t = `Votre objectif est de ${obj}${prot ? `, avec un besoin d'environ ${prot} g de protéines par jour` : ''}. Atteindre cette quantité par l'alimentation seule peut être exigeant${c.objectif === 'muscle' || c.objectif === 'challenge' ? ', surtout les jours d\'entraînement' : ''}.${dietNote} Une protéine en poudre vous aide à compléter facilement vos apports, notamment après l'entraînement ou en collation.`;
      if (!c.actif && c.objectif !== 'muscle') t += ' Si vos repas couvrent déjà ce total, gardez-la simplement en dépannage.';
      break;
    case 'creatine':
      t = c.actif
        ? `Vous vous entraînez régulièrement avec un objectif de ${obj}. La créatine est l'un des compléments les plus étudiés : elle peut soutenir votre force, vos performances et une progression plus régulière.${c.poids ? ` Pour ${c.poids} kg, environ 3 g par jour suffisent.` : ''}`
        : `La créatine est l'un des compléments les plus étudiés pour la force et la performance. Elle devient vraiment pertinente dès que vous vous entraînez régulièrement — à garder en tête si vous augmentez votre activité.`;
      break;
    case 'magnesium':
      t = `Votre rythme est ${c.activiteLabel}.${c.stressFatigue ? ' Vous avez signalé du stress, de la fatigue ou un sommeil difficile :' : ' Si vous ressentez fatigue, crampes ou récupération difficile,'} un apport en magnésium peut soutenir le fonctionnement musculaire et nerveux et favoriser une meilleure récupération.`;
      break;
    case 'omega3':
      t = `${c.poissonOk ? 'Pour compléter vos apports en bons acides gras,' : 'Vous semblez manger peu de poisson gras :'} les oméga-3 soutiennent l'équilibre cardiovasculaire et la récupération. 1 à 2 portions de poisson gras par semaine restent l'idéal ; un complément prend le relais sinon.`;
      break;
    case 'vitamineD':
      t = `Selon la saison et votre exposition au soleil, la vitamine D est souvent un peu basse en hiver. Un apport peut soutenir vos os, vos muscles et votre tonus${c.objectif === 'energie' ? ', utile pour votre objectif d\'énergie' : ''}.`;
      break;
    case 'fibres':
      t = `${c.faimGrignote ? 'Vous avez signalé de la faim ou des grignotages :' : `Dans un objectif de ${obj},`} les fibres aident à se sentir rassasié plus longtemps et soutiennent le transit — un vrai plus pour tenir vos repas sans frustration.`;
      break;
    case 'electrolytes':
      t = `Avec des séances intenses ou longues, vous perdez des minéraux en transpirant. Les électrolytes aident à rester bien hydraté et à limiter les coups de fatigue à l'effort.`;
      break;
    case 'vitamines': case 'multivitamines':
      t = `Un multivitamines sert de filet de sécurité si votre alimentation est parfois déséquilibrée${c.vegan ? ', ce qui peut arriver avec une alimentation vegan' : ''}. Rien d'indispensable si vos repas sont variés, mais cela rassure les semaines chargées.`;
      break;
    default:
      t = COMPLEMENT_ROLES[cle] ? ('Ce complément ' + COMPLEMENT_ROLES[cle]) : 'Peut être un complément utile selon vos besoins.';
  }
  if (suivi) t += ' C\'est déjà dans votre plan : cette recommandation est donc déjà appliquée.';
  return t;
}

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
  // Contexte pour generer des explications 100% personnalisees (proteines visees,
  // regime, activite...). Besoins issus du plan ; sinon estimation depuis le poids.
  const besoins = (state.plan && state.plan.besoins) || null;
  const protPerKg = objectif === 'muscle' ? 2.0 : (objectif === 'perte' || objectif === 'challenge') ? 1.8 : 1.4;
  const prot = (besoins && besoins.macros && besoins.macros.proteines)
    ? Math.round(besoins.macros.proteines)
    : (profil.poids_kg ? Math.round(profil.poids_kg * protPerKg) : null);
  const regime = (prefs.regime || []).map((x) => normTxt(x));
  const vegan = regime.includes('vegan');
  const activiteLabel = { sedentaire: 'plutôt calme', leger: 'légèrement actif', modere: 'modéré', actif: 'soutenu', tres_actif: 'très soutenu' }[profil.activite] || 'actif';
  const ctx = {
    objectif, prot, kcal: besoins ? besoins.kcalCible : null, vegan, vegetarien: vegan || regime.includes('vegetarien'),
    poids: profil.poids_kg, age: profil.age, sexe: profil.sexe, activiteLabel, actif, stressFatigue, faimGrignote, poissonOk, pris,
  };
  const reco = [];
  const alertes = [];
  // role = explication dynamique personnalisee (le 3e argument est ignore : conserve
  // pour la lisibilite du contexte de chaque recommandation).
  const add = (cle, priorite) => reco.push({
    cle, nom: COMPLEMENT_LABELS[cle] || cle, priorite,
    role: complementExplication(cle, ctx),
    dejaPris: pris.has(cle),
  });

  // Niveaux : 'essentiel' (tres pertinent pour le profil) > 'aide' (vrai benefice,
  // pas indispensable) > 'envisager' (optimisation / confort / bien-etre).
  if (objectif === 'perte' || objectif === 'challenge') {
    const intense = objectif === 'challenge';
    add('proteines', 'essentiel', intense ? 'En perte acceleree, pour proteger vos muscles et tenir la satiete :' : 'En perte de poids, surtout si vos apports sont justes :');
    add('fibres', (faimGrignote || intense) ? 'aide' : 'envisager', faimGrignote ? 'Vous avez signale de la faim / des grignotages :' : 'Pour la satiete et le transit :');
    add('magnesium', stressFatigue ? 'aide' : 'envisager', stressFatigue ? 'Vous avez signale du stress, de la fatigue ou un sommeil difficile :' : 'Si vous vous sentez stresse, fatigue ou dormez mal :');
    if (intense && actif) add('electrolytes', 'essentiel', 'Seances intenses : si vous transpirez beaucoup a l\'effort :');
  } else if (objectif === 'muscle') {
    add('proteines', 'essentiel', 'Pour couvrir vos besoins eleves en proteines si l\'alimentation ne suffit pas :');
    add('creatine', actif ? 'essentiel' : 'envisager', 'Si vous vous entrainez regulierement :');
    add('magnesium', stressFatigue ? 'aide' : 'envisager', stressFatigue ? 'Vous avez signale une recuperation difficile :' : 'Si la recuperation est difficile :');
  } else if (objectif === 'energie') {
    add('magnesium', 'aide', 'Pour le tonus au quotidien :');
    add('omega3', 'aide', poissonOk ? '' : 'Vous semblez manger peu de poisson :');
    add('vitamineD', 'aide', 'Selon la saison et votre exposition au soleil :');
  } else { // maintien
    add('omega3', 'aide', poissonOk ? '' : 'Vous semblez manger peu de poisson :');
    add('magnesium', stressFatigue ? 'aide' : 'envisager', 'En cas de fatigue ou de stress :');
  }

  // Alertes douces.
  if (pris.has('bruleur')) {
    alertes.push('Vous mentionnez un bruleur de graisse : son effet est tres limite et ce n\'est pas une priorite. L\'essentiel reste votre alimentation et votre activite — vous pouvez tout a fait vous en passer.');
  }
  if (pris.has('vitamines') && pris.has('magnesium')) {
    alertes.push('Vitamines/mineraux et magnesium peuvent se recouper : verifiez les doses pour ne pas cumuler inutilement.');
  }
  if (prisRaw.length >= 4) {
    alertes.push('Vous prenez deja plusieurs complements. Vous pourriez simplifier en gardant surtout ceux marques « essentiel pour vous », et eviter l\'accumulation.');
  }

  const labels = prisRaw.map((c) => COMPLEMENT_LABELS[c] || c);
  const resume = labels.length
    ? 'Vous prenez actuellement : ' + labels.join(', ') + (profil.complementsDetail ? ` (${profil.complementsDetail}).` : '.')
    : 'Vous ne prenez aucun complement pour le moment — c\'est tout a fait possible : l\'alimentation reste la base.';

  return { resume, reco, alertes };
}

const PRIORITE_LABEL = {
  essentiel: 'Essentiel pour vous', aide: 'Peut vous aider', envisager: 'À envisager',
  // compat retro (anciens niveaux)
  indispensable: 'Essentiel pour vous', utile: 'Essentiel pour vous', optionnel: 'À envisager',
};

function openComplements() { renderComplements(); $('#complementsPanel').classList.remove('hidden'); }
function closeComplements() { $('#complementsPanel').classList.add('hidden'); }

function renderComplements() {
  const data = recommanderComplements(state.profil, state.preferences);
  const alertes = data.alertes.map((a) => `<div class="comp-alert">${icSvg('spark')} ${escapeHtml(a)}</div>`).join('');
  const reco = data.reco.map((r) => {
    const handle = COMPLEMENT_SHOP[r.cle];
    const suivi = estComplementSuivi(r.cle);
    const shopBtn = handle
      ? `<a class="comp-shop" href="${SHOP_BASE}${handle}${SHOP_UTM}" target="_blank" rel="noopener noreferrer">${icSvg('cart')} Voir le produit</a>`
      : '';
    const actionBtn = `<button type="button" class="comp-add${suivi ? ' is-on' : ''}" data-comp-toggle="${r.cle}">${icSvg(suivi ? 'check' : 'plus')} ${suivi ? 'Dans mon plan' : 'Ajouter à mon plan'}</button>`;
    // Vignette produit : cliquable -> fiche produit si dispo. Fallback elegant
    // (degrade + icone) si pas d'image. onerror retire l'img -> le fallback apparait.
    const shopUrl = handle ? `${SHOP_BASE}${handle}${SHOP_UTM}` : '';
    const thumbInner = `<span class="comp-thumb-fallback">${icSvg('pill')}</span><img src="${complementImgSrc(r.cle)}" alt="${escapeHtml(r.nom)}" loading="lazy" onload="this.classList.add('loaded')" onerror="this.remove()" />`;
    const thumb = shopUrl
      ? `<a class="comp-thumb" href="${shopUrl}" target="_blank" rel="noopener noreferrer" aria-label="Voir ${escapeHtml(r.nom)}">${thumbInner}</a>`
      : `<div class="comp-thumb">${thumbInner}</div>`;
    return `
    <div class="comp-item${suivi ? ' is-suivi' : ''}">
      ${thumb}
      <div class="comp-main">
        <div class="comp-item-head">
          <span class="comp-name">${escapeHtml(r.nom)}${r.dejaPris ? ' <span class="comp-deja">déjà pris</span>' : ''}</span>
          <span class="comp-prio prio-${r.priorite}">${PRIORITE_LABEL[r.priorite] || r.priorite}</span>
        </div>
        <div class="comp-role">${escapeHtml(r.role)}</div>
        <div class="comp-moment">${icSvg('clock')} Quand : ${escapeHtml(complementMoment(r.cle))}</div>
        <div class="comp-actions">${actionBtn}${shopBtn}</div>
      </div>
    </div>`;
  }).join('');
  // Section "Vos complements suivis" : tout ce qui est dans le plan, meme hors reco.
  const actifs = complementsActifs();
  const suivisBlock = actifs.length ? `
    <div class="recipe-section-title">Dans votre plan</div>
    <div class="comp-suivis">${actifs.map((c) =>
      `<span class="comp-chip"><strong>${escapeHtml(c.nom)}</strong><em>${escapeHtml(c.moment)}</em><button type="button" class="comp-chip-x" data-comp-toggle="${c.cle}" aria-label="Retirer">${icSvg('x')}</button></span>`).join('')}</div>` : '';
  $('#complementsBody').innerHTML = `
    <p class="comp-rappel">Les compléments peuvent être une aide complémentaire. Ils ne remplacent pas une alimentation équilibrée ni l'avis d'un professionnel de santé.</p>
    <div class="comp-resume">${escapeHtml(data.resume)}</div>
    ${suivisBlock}
    ${alertes ? `<div class="recipe-section-title">À noter</div>${alertes}` : ''}
    <div class="recipe-section-title">Recommandation selon votre objectif</div>
    ${reco}
    <p class="panel-sub" style="margin-top:16px">Informations générales, non médicales. Les compléments sont une aide secondaire, jamais la base du résultat. Ajoutez-en à votre plan pour les retrouver chaque jour et suivre leur prise.</p>`;
  $$('#complementsBody [data-comp-toggle]').forEach((b) => b.addEventListener('click', () => toggleComplementSuivi(b.dataset.compToggle)));
}

// ---------- Export agenda (.ics) (E3) ----------
const CRENEAU_HEURES = { 'petit-dejeuner': [8, 0, 30], dejeuner: [12, 30, 45], collation: [16, 0, 15], diner: [19, 30, 45] };
// Horaire d'un creneau : le diner passe a 21h00 si le client mange tard le soir.
function creneauHeures(creneau) {
  if (creneau === 'diner' && state.preferences && state.preferences.dinerTard === 'oui') return [21, 0, 45];
  return CRENEAU_HEURES[creneau] || [12, 0, 30];
}

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
      const [hh, mm, dur] = creneauHeures(repas.creneau);
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
  const payload = {
    profil: state.profil, preferences: state.preferences, plan: state.plan,
    source: state.source, masquerCalories: state.masquerCalories,
    portions: state.portions, adultes: state.adultes, enfants: state.enfants, favoris: state.favoris, exclus: state.exclus,
    suivi: state.suivi, avance: state.avance, pesees: state.pesees,
    celebratedDays: state.celebratedDays, weekDone: state.weekDone,
    complementsSuivis: state.complementsSuivis, suiviComp: state.suiviComp,
    coachMessages: (state.coachMessages || []).slice(-40),
    startDate: state.startDate,
    savedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(payload));
    $('#saveState').innerHTML = icSvg('check') + ' Plan sauvegarde';
  } catch (_) { /* quota / mode prive */ }
  pushAccountSave(payload); // compte client -> copie serveur (suit l'utilisateur sur tous ses appareils)
}

// Sauvegarde serveur du compte client (anti-rebond : on regroupe les changements rapprochés).
function pushAccountSave(payload) {
  if (!window.__NUTRI_USER) return; // pas de compte (coach/démo) -> rien à pousser
  clearTimeout(pushAccountSave._t);
  pushAccountSave._t = setTimeout(() => {
    fetch(apiUrl('/account/save'), {
      method: 'POST',
      headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ data: payload }),
    }).catch(() => { /* hors-ligne : la copie locale suffit, resync au prochain enregistrement */ });
  }, 1200);
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
    state.adultes = data.adultes || (Math.max(1, Math.round(data.portions || 1)));
    state.enfants = data.enfants || 0;
    state.portions = (state.adultes + 0.5 * state.enfants) || 1;
    state.favoris = data.favoris || [];
    state.exclus = data.exclus || [];
    state.suivi = data.suivi || {};
    state.avance = data.avance || {};
    state.pesees = data.pesees || [];
    state.celebratedDays = data.celebratedDays || [];
    state.weekDone = !!data.weekDone;
    state.startDate = data.startDate || null;
    state.complementsSuivis = data.complementsSuivis || (state.profil.complements || []).filter((c) => c && c !== 'non' && c !== 'aucun' && c !== 'autre');
    state.suiviComp = data.suiviComp || {};
    state.coachMessages = data.coachMessages || [];
    state.communauteUnlocked = !!data.communauteUnlocked;
    state.communauteJoined = !!data.communauteJoined;
    state.communauteVue = !!data.communauteVue;
    state.communautePosts = data.communautePosts || [];
    state.plan = data.plan || null;
    return !!data.plan;
  } catch (_) { return false; }
}

// ---------- Generation + affichage resultat ----------
async function generateAndShow(seed) {
  // Animation premium ~10 s (revelation pas-a-pas) EN PARALLELE de la generation
  // reelle : on n'affiche le plan qu'une fois les deux termines.
  const reveal = runPlanReveal(10000);
  try {
    await Promise.all([fetchPlan(seed), reveal]);
    postProcessExterieur();
    // Nouveau plan = la semaine demarre AUJOURD'HUI : on (re)cale la date de
    // demarrage sur ce jour, on renomme les jours et on ouvre sur aujourd'hui.
    ancrerDemarragePlan(true);
    renderNeeds();
    renderPlan();
    saveLocal();
    showScreen('result');
    showToast('Votre plan commence aujourd’hui — nous l’avons adapté à votre jour de démarrage.', { icon: 'calendar', duration: 4600 });
    // Plan généré : on débloque l'espace Communauté et on propose de le découvrir.
    state.communauteUnlocked = true;
    revealCommunaute();
    renderCommunaute();
    showCommunauteIntro();
    saveLocal();
  } catch (e) {
    const detail = (e && e.message && !/^Erreur$/.test(e.message)) ? '\n(' + e.message + ')' : '';
    alert('Desole, la generation a echoue. Reessayez dans un instant.' + detail);
  }
  finally { hidePlanLoader(); }
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
  // Compte client : on attend le rafraîchissement serveur (token frais + dernières
  // données du client) avant de démarrer, pour charger SON plan à jour.
  if (window.__NUTRI_REFRESH) { const p = window.__NUTRI_REFRESH; window.__NUTRI_REFRESH = null; p.then(init); return; }
  setupDemoMode(); // bannière + actions si session démo
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
  $('#btnAgenda').addEventListener('click', openAgenda);
  $('#agendaClose').addEventListener('click', closeAgenda);
  $('#agendaModal').addEventListener('click', (e) => { if (e.target.id === 'agendaModal') closeAgenda(); });

  // Demande d'aide alimentaire (accompagnement coach)
  $('#btnHelp').addEventListener('click', openHelp);
  $('#btnHelpFromSuivi').addEventListener('click', () => { closeSuivi(); openHelp(); });

  // Coach IA : bouton flottant + chat
  $('#sosFab').addEventListener('click', openSos);
  $('#coachForm').addEventListener('submit', (e) => { e.preventDefault(); sendCoach($('#coachInput').value); });
  $('#coachInput').addEventListener('input', autoGrowCoach);
  $('#coachInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCoach($('#coachInput').value); }
  });
  $('#coachChips').addEventListener('click', (e) => { const c = e.target.closest('.coach-chip'); if (c) sendCoach(c.dataset.q || c.textContent); });
  $('#coachHuman').addEventListener('click', coachHumanRequest);
  $$('#sosSheet [data-sos-close]').forEach((b) => b.addEventListener('click', closeSos));

  // Nouvelle navigation : barre basse + lignes de l'ecran Profil (delegue aux boutons existants)
  setupProfilCoach();
  $$('#bottom-nav .nav-i').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  $$('[data-go]').forEach((r) => r.addEventListener('click', () => { const t = $('#' + r.dataset.go); if (t) t.click(); }));
  $('#helpClose').addEventListener('click', closeHelp);
  $('#helpDoneClose').addEventListener('click', closeHelp);
  $('#helpPanel').addEventListener('click', (e) => { if (e.target.id === 'helpPanel') closeHelp(); });
  $('#helpOptions').addEventListener('click', (e) => { const b = e.target.closest('.help-opt'); if (b) b.classList.toggle('selected'); });
  $('#helpSubmit').addEventListener('click', submitHelp);
  // Vue coach
  $('#btnHelpAdmin').addEventListener('click', openHelpAdmin);
  $('#helpAdminClose').addEventListener('click', closeHelpAdmin);
  $('#helpAdminPanel').addEventListener('click', (e) => { if (e.target.id === 'helpAdminPanel') closeHelpAdmin(); });
  setupHelpAccess();

  // Scan de produit (mode normal : on repart sans contexte de remplacement)
  $('#btnScan').addEventListener('click', () => { scanReplaceCtx = null; openScan(); });
  $('#btnScanFromShopping').addEventListener('click', () => { scanReplaceCtx = null; closeShopping(); openScan(); });
  $('#btnScanFromSuivi').addEventListener('click', () => { scanReplaceCtx = null; closeSuivi(); openScan(); });
  $('#scanClose').addEventListener('click', closeScan);
  $('#scanModal').addEventListener('click', (e) => { if (e.target.id === 'scanModal') closeScan(); });
  $('#scanManualToggle').addEventListener('click', () => $('#scanManual').classList.toggle('hidden'));
  $('#scanManualGo').addEventListener('click', () => { const v = $('#scanManualInput').value.trim(); if (v) { stopCamera(); lookupBarcode(v); } });
  $('#scanManualInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const v = e.target.value.trim(); if (v) { stopCamera(); lookupBarcode(v); } } });
  $('#scanRetry').addEventListener('click', () => { scanShowStage('camera'); startCamera(); });
  $('#btnScanAdmin').addEventListener('click', openScanAdmin);
  $('#scanAdminClose').addEventListener('click', closeScanAdmin);
  $('#scanAdminPanel').addEventListener('click', (e) => { if (e.target.id === 'scanAdminPanel') closeScanAdmin(); });
  setupScanAccess();

  // Suivi de mon plan (adherence)
  $('#btnSuiviPlan').addEventListener('click', openSuiviPlan);
  $('#suiviPlanClose').addEventListener('click', closeSuiviPlan);
  $('#suiviPlanPanel').addEventListener('click', (e) => { if (e.target.id === 'suiviPlanPanel') closeSuiviPlan(); });
  $('#suiviPlanBody').addEventListener('click', onSuiviPlanClick);
  $('#suiviPlanBody').addEventListener('input', onSuiviPlanInput);
  $('#peseeClose').addEventListener('click', closePesee);
  $('#peseePanel').addEventListener('click', (e) => { if (e.target.id === 'peseePanel') closePesee(); });
  // Vue coach adherence
  $('#btnAdhAdmin').addEventListener('click', openAdhAdmin);
  $('#adhAdminClose').addEventListener('click', closeAdhAdmin);
  $('#adhAdminPanel').addEventListener('click', (e) => { if (e.target.id === 'adhAdminPanel') closeAdhAdmin(); });
  setupAdhAccess();
  // Gestion du mode démo (admin principal)
  $('#btnDemoAdmin').addEventListener('click', openDemoAdmin);
  $('#demoAdminClose').addEventListener('click', closeDemoAdmin);
  $('#demoAdminPanel').addEventListener('click', (e) => { if (e.target.id === 'demoAdminPanel') closeDemoAdmin(); });
  setupDemoAdminAccess();

  // Clients inscrits (admin principal)
  $('#btnClientsAdmin').addEventListener('click', openClientsAdmin);
  $('#clientsAdminClose').addEventListener('click', closeClientsAdmin);
  $('#clientsAdminPanel').addEventListener('click', (e) => { if (e.target.id === 'clientsAdminPanel') closeClientsAdmin(); });
  setupClientsAdminAccess();

  // Analyser mon assiette en photo
  $('#btnPlate').addEventListener('click', openPlate);
  $('#btnPlateFromSuivi').addEventListener('click', () => { closeSuivi(); openPlate(); });
  $('#plateClose').addEventListener('click', closePlate);
  $('#plateModal').addEventListener('click', (e) => { if (e.target.id === 'plateModal') closePlate(); });
  // Taper la zone ouvre l'appareil photo / la galerie (declencheur explicite, fiable mobile).
  $('#plateDrop').addEventListener('click', () => $('#plateFile').click());
  $('#plateDrop').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#plateFile').click(); } });
  $('#plateFile').addEventListener('change', onPlateFile);
  $('#plateAnalyze').addEventListener('click', analyzePlate);
  $('#plateRetry').addEventListener('click', () => plateShowStage('input'));
  $('#btnPlateAdmin').addEventListener('click', openPlateAdmin);
  $('#plateAdminClose').addEventListener('click', closePlateAdmin);
  $('#plateAdminPanel').addEventListener('click', (e) => { if (e.target.id === 'plateAdminPanel') closePlateAdmin(); });
  setupPlateAccess();

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
  $('#btnEditProfile').addEventListener('click', () => { prefillOnboarding(); showScreen('onboarding'); goToStep(1); });

  $('#portMinus').addEventListener('click', () => setPortions(state.portions - 1));
  $('#portPlus').addEventListener('click', () => setPortions(state.portions + 1));

  $('#modalClose').addEventListener('click', closeRecipe);
  $('#recipeModal').addEventListener('click', (e) => { if (e.target.id === 'recipeModal') closeRecipe(); });

  $('#navRestart').addEventListener('click', () => { if (confirm('Recommencer depuis le debut ?')) showScreen('landing'); });

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeRecipe(); closeShopping(); closeFavoris(); closeFiche(); closeSuivi(); closeAnalyse(); closeComplements(); closeAvance(); closeHelp(); closeHelpAdmin(); closeScan(); closeScanAdmin(); closeSuiviPlan(); closeAdhAdmin(); closeDemoAdmin(); closePlate(); closePlateAdmin(); closeAgenda(); closeSos(); } });

  if (loadLocal()) {
    $('#portValue').textContent = state.portions;
    // Reconnexion : on garde la date de demarrage (ne pas reinitialiser le plan),
    // on recalcule juste ou en est l'utilisateur et on ouvre sur la journee du jour.
    ancrerDemarragePlan(false);
    renderNeeds();
    renderPlan();
    revealCommunaute();
    renderCommunaute();
    showCommunauteIntro();
    $('#saveState').innerHTML = icSvg('check') + ' Plan restaure';
    showScreen('result');
  } else if (isDemo()) {
    showScreen('demo-welcome'); // accueil démo avant le parcours client
  }
}

// ---------- Demande d'aide alimentaire (accompagnement coach) ----------
const HELP_OPTIONS = [
  { key: 'plan', label: "J'ai du mal a respecter mon plan" },
  { key: 'faim', label: "J'ai trop faim" },
  { key: 'grignote', label: 'Je grignote' },
  { key: 'idees', label: "Je manque d'idees de repas" },
  { key: 'exterieur', label: "Je mange souvent a l'exterieur" },
  { key: 'quantites', label: "Je n'arrive pas a gerer les quantites" },
  { key: 'sucre', label: "J'ai des envies de sucre" },
  { key: 'temps', label: "Je n'ai pas le temps de cuisiner" },
  { key: 'demotive', label: 'Je suis demotive(e)' },
  { key: 'autre', label: 'Autre' },
];
const HELP_STATUS = { a_traiter: 'A traiter', en_cours: 'En cours', traite: 'Traite' };

// Utilisateur de l'app principale (meme origine) — pour le nom client + l'acces coach.
function mainAppUser() {
  try { return JSON.parse(localStorage.getItem('currentUser') || 'null'); } catch (_) { return null; }
}
function helpClientName() {
  const u = mainAppUser();
  return (u && u.name) || (state.profil && (state.profil.prenom || state.profil.nom)) || 'Client';
}
function isCoachOrAdmin() {
  if (isDemo()) return false; // démo = expérience client pure, pas de vues coach
  const u = mainAppUser();
  if (!u) return false;
  const perms = u.permissions || [];
  return u.role === 'admin' || (Array.isArray(perms) && perms.includes('can_access_nutrition_module'));
}

function renderHelpOptions() {
  $('#helpOptions').innerHTML = HELP_OPTIONS.map((o) =>
    `<button type="button" class="help-opt" data-key="${o.key}">${o.label}</button>`).join('');
}
function resetHelpForm() {
  renderHelpOptions();
  $('#helpMessage').value = '';
  $('#helpForm').classList.remove('hidden');
  $('#helpDone').classList.add('hidden');
}
function openHelp() { resetHelpForm(); $('#helpPanel').classList.remove('hidden'); }
function closeHelp() { $('#helpPanel').classList.add('hidden'); }

async function submitHelp() {
  const selected = $$('#helpOptions .help-opt.selected').map((b) => {
    const o = HELP_OPTIONS.find((x) => x.key === b.dataset.key); return o ? o.label : b.dataset.key;
  });
  const message = $('#helpMessage').value.trim();
  if (!selected.length && !message) { alert('Indique au moins une difficulte ou un petit message.'); return; }
  const btn = $('#helpSubmit'); btn.disabled = true;
  if (isDemo()) { // démo : aucune vraie demande envoyée
    $('#helpForm').classList.add('hidden'); $('#helpDone').classList.remove('hidden'); btn.disabled = false; return;
  }
  try {
    const res = await fetch(apiUrl('/api/help-request'), {
      method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ clientName: helpClientName(), difficultes: selected, message }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Erreur');
    $('#helpForm').classList.add('hidden');
    $('#helpDone').classList.remove('hidden');
  } catch (e) {
    alert("Oups, l'envoi n'a pas fonctionne. Reessaie dans un instant.");
  } finally { btn.disabled = false; }
}

// ---------- SOS coach : bouton flottant + feuille (reutilise /api/help-request) ----------
// ---------- Coach IA conversationnel ----------
const OBJ_LABELS = { perte: 'Perte de poids', maintien: 'Maintien', muscle: 'Prise de muscle', energie: 'Plus d\'énergie', challenge: 'Challenge 6/6' };
const ACT_LABELS = { sedentaire: 'sédentaire', leger: 'léger', modere: 'modéré', actif: 'actif', tres_actif: 'très actif' };
const COACH_CHIPS = [
  'Puis-je manger une pizza ce soir ?',
  'Que manger après le sport ?',
  'Comment atteindre mes protéines aujourd\'hui ?',
  'J\'ai fait un écart, comment je rattrape ?',
  'Propose-moi une version plus rapide de mon dîner',
];

// Macros du jour : cible / consomme (repas valides) / restant.
function coachMacrosJour() {
  const b = state.plan && state.plan.besoins;
  if (!b || !b.macros) return null;
  const di = (typeof indexJourActuel === 'function') ? indexJourActuel() : 0;
  const jour = state.plan.jours && state.plan.jours[di];
  let kcal = 0, prot = 0, gluc = 0, lip = 0;
  (jour ? jour.repas : []).forEach((rp, mi) => {
    const s = state.suivi[trackKey(di, mi)];
    if (s && s.statut === 'respecte' && rp.recette) {
      kcal += rp.recette.kcal || 0; prot += rp.recette.proteines || 0; gluc += rp.recette.glucides || 0; lip += rp.recette.lipides || 0;
    }
  });
  const r = (a, c) => Math.max(0, Math.round(a - c));
  return {
    cible: { kcal: b.kcalCible, prot: b.macros.proteines, gluc: b.macros.glucides, lip: b.macros.lipides },
    consomme: { kcal, prot, gluc, lip },
    restant: { kcal: r(b.kcalCible, kcal), prot: r(b.macros.proteines, prot), gluc: r(b.macros.glucides, gluc), lip: r(b.macros.lipides, lip) },
  };
}

// Assemble TOUT le contexte client en texte pour le coach (jamais redemande).
function coachContext() {
  const p = state.profil || {}, pr = state.preferences || {};
  const L = [];
  const nom = (typeof helpClientName === 'function' && helpClientName()) || '';
  if (nom && nom !== 'Client') L.push('Prénom : ' + nom.split(' ')[0]);
  L.push('Objectif : ' + (OBJ_LABELS[p.objectif] || p.objectif || '—'));
  const ident = [];
  if (p.sexe) ident.push(p.sexe); if (p.age) ident.push(p.age + ' ans');
  if (p.taille_cm) ident.push(p.taille_cm + ' cm'); if (p.poids_kg) ident.push(p.poids_kg + ' kg');
  if (ident.length) L.push('Profil : ' + ident.join(', '));
  const compo = [];
  if (p.masse_grasse) compo.push('masse grasse ' + p.masse_grasse + ' %');
  if (p.masse_musculaire) compo.push('masse musculaire ' + p.masse_musculaire + ' kg');
  if (p.metabolisme_basal) compo.push('métabolisme basal ~' + p.metabolisme_basal + ' kcal');
  if (compo.length) L.push('Composition : ' + compo.join(', '));
  if (p.activite) L.push('Niveau d\'activité : ' + (ACT_LABELS[p.activite] || p.activite));
  if ((pr.allergies || []).length) L.push('Allergies : ' + pr.allergies.join(', '));
  if ((pr.regime || []).length) L.push('Régime : ' + pr.regime.join(', '));
  if ((pr.aimes || []).length) L.push('Aime : ' + pr.aimes.join(', '));
  if ((pr.deteste || []).length) L.push('N\'aime pas : ' + pr.deteste.join(', '));
  const m = coachMacrosJour();
  if (m) {
    L.push(`Objectif du jour : ${m.cible.kcal} kcal, ${m.cible.prot} g protéines, ${m.cible.gluc} g glucides, ${m.cible.lip} g lipides`);
    L.push(`Déjà consommé (repas validés) : ${m.consomme.kcal} kcal, ${m.consomme.prot} g P`);
    L.push(`RESTANT aujourd'hui : ~${m.restant.kcal} kcal, ~${m.restant.prot} g protéines, ~${m.restant.gluc} g glucides, ~${m.restant.lip} g lipides`);
  }
  const di = (typeof indexJourActuel === 'function') ? indexJourActuel() : 0;
  const jour = state.plan && state.plan.jours && state.plan.jours[di];
  if (jour) {
    L.push(`\nRepas prévus aujourd'hui (${jour.jour}) :`);
    jour.repas.forEach((rp, mi) => {
      const s = state.suivi[trackKey(di, mi)];
      const etat = s ? ({ respecte: 'validé', non: 'sauté', autre: 'remplacé/autre' }[s.statut] || s.statut) : 'à faire';
      const r = rp.recette;
      L.push(`- ${rp.label} : ${r ? `${r.nom} (${r.kcal} kcal, ${r.proteines} g P)` : '—'} [${etat}]`);
      if (s && s.statut === 'autre' && s.autre && s.autre.repas) L.push(`   (a mangé à la place : ${s.autre.repas})`);
    });
  }
  const comps = (typeof complementsActifs === 'function') ? complementsActifs() : [];
  if (comps.length) L.push('\nCompléments suivis : ' + comps.map((c) => `${c.nom} (${c.moment})`).join(', '));
  if ((state.pesees || []).length) {
    const last = state.pesees.slice(-3).map((x) => `${x.date || ''} ${x.poids || x.poids_kg || x.valeur || '?'} kg`).join(' ; ');
    L.push('Pesées récentes : ' + last);
  }
  if (state.masquerCalories) L.push('\n(Le client a masqué les calories : reste qualitatif sur les chiffres si possible.)');
  return L.join('\n');
}

function autoGrowCoach() {
  const t = $('#coachInput'); if (!t) return;
  t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px';
}
function coachMd(s) {
  // Rendu leger : on echappe le HTML puis on gere **gras** et les retours ligne.
  return escapeHtml(s).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
}
function coachBubble(m) {
  if (m.role === 'user') return `<div class="cm cm-user"><div class="cm-b">${escapeHtml(m.content)}</div></div>`;
  const html = coachMd(m.content);
  const humanBtn = m.human ? `<button type="button" class="cm-human-link" data-coach-human>Prévenir mon coach humain</button>` : '';
  return `<div class="cm cm-ai"><span class="cm-av">${icSvg('spark')}</span><div class="cm-b">${html}${humanBtn}</div></div>`;
}
function renderCoach(scroll) {
  const box = $('#coachMessages'); if (!box) return;
  let html = (state.coachMessages || []).map(coachBubble).join('');
  if (state.coachBusy) html += `<div class="cm cm-ai"><span class="cm-av">${icSvg('spark')}</span><div class="cm-b cm-typing"><span></span><span></span><span></span></div></div>`;
  box.innerHTML = html;
  $$('#coachMessages [data-coach-human]').forEach((b) => b.addEventListener('click', coachHumanRequest));
  if (scroll) box.scrollTop = box.scrollHeight;
}
function renderCoachChips() {
  const box = $('#coachChips'); if (!box) return;
  box.innerHTML = COACH_CHIPS.map((q) => `<button type="button" class="coach-chip" data-q="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join('');
}
function openSos() {
  if (!state.coachMessages) state.coachMessages = [];
  if (!state.coachMessages.length) {
    const nom = (typeof helpClientName === 'function' && helpClientName()) || '';
    const prenom = (nom && nom !== 'Client') ? ' ' + nom.split(' ')[0] : '';
    const obj = OBJ_LABELS[state.profil && state.profil.objectif];
    const m = coachMacrosJour();
    let g = `Salut${prenom} ! Je suis ton coach nutrition.`;
    g += obj ? ` Je connais ton objectif (${obj.toLowerCase()}) et ton plan du jour.` : ' Je connais ton profil et ton plan.';
    if (m && m.restant && !state.masquerCalories) g += ` Il te reste environ ${m.restant.prot} g de protéines aujourd'hui.`;
    g += ' Pose-moi tes questions : un repas, un écart, quoi manger avant/après le sport…';
    state.coachMessages.push({ role: 'assistant', content: g });
    saveLocal();
  }
  renderCoachChips();
  renderCoach(true);
  $('#sosSheet').classList.remove('hidden');
  setTimeout(() => { const i = $('#coachInput'); if (i) i.focus(); }, 60);
}
function closeSos() { $('#sosSheet').classList.add('hidden'); }
async function sendCoach(text) {
  text = (text || '').trim();
  if (!text || state.coachBusy) return;
  if (!state.coachMessages) state.coachMessages = [];
  state.coachMessages.push({ role: 'user', content: text });
  state.coachBusy = true;
  const inp = $('#coachInput'); if (inp) { inp.value = ''; }
  autoGrowCoach();
  $('#coachChips').innerHTML = ''; // les suggestions disparaissent des qu'on discute
  renderCoach(true); saveLocal();
  try {
    const res = await fetch(apiUrl('/api/coach'), {
      method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ messages: state.coachMessages.slice(-18), contexte: coachContext() }),
    });
    const d = await res.json();
    if (d && d.ok && d.reponse) state.coachMessages.push({ role: 'assistant', content: d.reponse });
    else if (d && d.ia === false) state.coachMessages.push({ role: 'assistant', content: "Ton coach IA n'est pas encore activé sur ce compte. En attendant, tu peux prévenir ton coach humain — il pourra ajuster ta semaine.", human: true });
    else state.coachMessages.push({ role: 'assistant', content: "Je n'ai pas réussi à répondre à l'instant. Réessaie dans un moment 🙏" });
  } catch (e) {
    state.coachMessages.push({ role: 'assistant', content: 'Connexion difficile pour le moment. Réessaie dans un instant.' });
  }
  state.coachBusy = false;
  renderCoach(true); saveLocal();
}
async function coachHumanRequest() {
  const message = window.prompt('Un mot pour ton coach (il reviendra vers toi pour ajuster ta semaine) :', '');
  if (message == null || !message.trim()) return;
  if (isDemo()) { showToast('Message transmis à ton coach (démo).', { icon: 'check' }); return; }
  try {
    const res = await fetch(apiUrl('/api/help-request'), {
      method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ clientName: helpClientName(), difficultes: [], message: message.trim() }),
    });
    const d = await res.json();
    if (!d.ok) throw new Error();
    showToast('Ton coach a bien reçu ta demande 💬', { icon: 'check' });
  } catch (e) { showToast("L'envoi n'a pas fonctionné, réessaie dans un instant."); }
}

// ---------- Navigation (barre basse mobile / sidebar desktop) ----------
// ---------- Espace Communauté (débloqué après génération du plan) ----------
const COMMUNAUTE_CHALLENGES = [
  { ic: 'spark', t: 'Semaine sans sucre ajouté', d: 'Jour 3 / 7 · 18 membres en lice' },
  { ic: 'chart', t: '5 séances d’activité', d: 'Cette semaine · 21 participants' },
  { ic: 'calendar', t: 'Hydratation 2 L / jour', d: 'Objectif quotidien du groupe' },
];
const COMMUNAUTE_COACH = [
  'Bravo au groupe : 82 % des repas validés hier. On garde le rythme cette semaine ! 💪',
  'Pensez à votre collation protéinée de l’après-midi : c’est elle qui coupe les fringales de 18 h.',
];
const COMMUNAUTE_FEED = [
  { who: 'Camille', txt: 'Journée validée ✅ Première semaine bouclée, trop fière !', when: 'il y a 2 h' },
  { who: 'Yanis', txt: 'Petit-déj œufs-avocat au top, merci pour l’idée 🙌', when: 'il y a 4 h' },
  { who: 'Sofia', txt: 'Dur de tenir le soir, mais le groupe motive 🔥', when: 'hier' },
  { who: 'Marc', txt: '3 séances cette semaine, objectif atteint !', when: 'hier' },
];

// Affiche l'onglet Communauté dans la barre une fois le plan généré.
function revealCommunaute() {
  if (!state.communauteUnlocked) return;
  const btn = $('#navCommunaute');
  if (btn) btn.classList.remove('hidden');
}

// Bandeau d'introduction une seule fois, en haut de l'écran plan.
function showCommunauteIntro() {
  if (!state.communauteUnlocked || state.communauteVue) return;
  const host = $('#view-plan');
  if (!host || $('#commIntro')) return;
  const el = document.createElement('div');
  el.id = 'commIntro';
  el.className = 'comm-intro';
  el.innerHTML =
    '<div class="comm-intro-ic">' + icSvg('users') + '</div>' +
    '<div class="comm-intro-tx"><strong>Votre plan alimentaire est prêt.</strong> Rejoignez la communauté du challenge pour avancer avec le groupe.</div>' +
    '<div class="comm-intro-act">' +
      '<button type="button" class="btn btn-primary" id="commIntroGo">Découvrir la communauté</button>' +
      '<button type="button" class="comm-intro-x" id="commIntroX" aria-label="Fermer">' + icSvg('x') + '</button>' +
    '</div>';
  host.insertBefore(el, host.firstChild);
  $('#commIntroGo').addEventListener('click', () => { dismissCommunauteIntro(); setTab('communaute'); });
  $('#commIntroX').addEventListener('click', dismissCommunauteIntro);
}
function dismissCommunauteIntro() {
  state.communauteVue = true;
  saveLocal();
  const el = $('#commIntro');
  if (el) el.remove();
}

function joinCommunaute() {
  state.communauteJoined = true;
  saveLocal();
  renderCommunaute();
  showToast('Bienvenue dans votre groupe de challenge 🎉', { icon: 'check' });
}

// Partage la journée du jour si elle est validée.
function partagerJournee() {
  const di = (typeof indexJourActuel === 'function') ? indexJourActuel() : 0;
  if (typeof dayIsComplete === 'function' && !dayIsComplete(di)) {
    showToast('Validez d’abord tous vos repas du jour pour le partager au groupe.', { icon: 'info' });
    return;
  }
  const j = state.plan && state.plan.jours && state.plan.jours[di];
  const label = (j && (j.libelle || j.label)) ? (j.libelle || j.label) : 'Ma journée';
  state.communautePosts.unshift({ who: 'Vous', txt: label + ' validée 💯 On continue !', when: 'à l’instant', me: true });
  saveLocal();
  renderCommunaute();
  showToast('Journée partagée au groupe 🎉', { icon: 'check' });
}

function renderCommunaute() {
  const host = $('#view-communaute');
  if (!host) return;
  if (!state.communauteJoined) {
    host.innerHTML =
      '<div class="comm-hero">' +
        '<h2>La communauté du challenge</h2>' +
        '<p>Rejoignez votre groupe pour avancer ensemble, partager vos journées validées et garder la motivation.</p>' +
        '<div class="comm-hero-row">' +
          '<div class="comm-stat"><b>24</b> membres</div>' +
          '<div class="comm-stat"><b>6/6</b> challenge</div>' +
          '<div class="comm-stat"><b>82%</b> repas validés</div>' +
        '</div>' +
      '</div>' +
      '<button type="button" class="btn btn-primary comm-join" id="commJoin">Rejoindre mon groupe</button>';
    const j = $('#commJoin');
    if (j) j.addEventListener('click', joinCommunaute);
    return;
  }
  const posts = (state.communautePosts || []).concat(COMMUNAUTE_FEED);
  const av = (who) => '<div class="comm-av">' + escapeHtml((who || '?').charAt(0)) + '</div>';
  host.innerHTML =
    '<div class="comm-hero">' +
      '<h2>Groupe Challenge 6/6</h2>' +
      '<p>Vous avancez avec 24 membres. Continuez, le groupe vous suit !</p>' +
      '<div class="comm-hero-row">' +
        '<div class="comm-stat"><b>24</b> membres</div>' +
        '<div class="comm-stat"><b>3</b> challenges actifs</div>' +
        '<div class="comm-stat"><b>82%</b> repas validés</div>' +
      '</div>' +
      '<div class="comm-prog"><span style="width:82%"></span></div>' +
    '</div>' +
    '<div class="comm-card"><h3>' + icSvg('spark') + ' Challenges en cours</h3>' +
      COMMUNAUTE_CHALLENGES.map((c) => '<div class="comm-item"><div class="comm-item-ic">' + icSvg(c.ic) + '</div><div class="comm-item-tx"><b>' + escapeHtml(c.t) + '</b><span>' + escapeHtml(c.d) + '</span></div></div>').join('') +
    '</div>' +
    '<div class="comm-card"><h3>' + icSvg('spark') + ' Messages du coach</h3>' +
      COMMUNAUTE_COACH.map((m) => '<div class="comm-msg"><div class="comm-av coach">C</div><div class="comm-bub"><b>Coach</b><p>' + escapeHtml(m) + '</p></div></div>').join('') +
    '</div>' +
    '<button type="button" class="btn btn-primary comm-share" id="commShare">' + icSvg('check') + ' Partager ma journée validée</button>' +
    '<div class="comm-card" style="margin-top:14px"><h3>' + icSvg('heart') + ' Encouragements du groupe</h3>' +
      posts.map((p) => '<div class="comm-msg comm-post ' + (p.me ? 'me' : '') + '">' + av(p.who) + '<div class="comm-bub"><b>' + escapeHtml(p.who) + '</b> <span class="when">· ' + escapeHtml(p.when || '') + '</span><p>' + escapeHtml(p.txt) + '</p></div></div>').join('') +
    '</div>';
  const s = $('#commShare');
  if (s) s.addEventListener('click', partagerJournee);
}

function setTab(tab) {
  // Courses & Suivi ouvrent les panneaux existants (overlays) sans changer la vue de fond.
  if (tab === 'complements') { $('#btnComplements').click(); return; }
  if (tab === 'courses') { $('#btnShopping').click(); return; }
  if (tab === 'suivi') { $('#btnSuiviPlan').click(); return; }
  if (tab === 'communaute') { renderCommunaute(); if (!state.communauteVue) dismissCommunauteIntro(); }
  const screen = $('#screen-result');
  if (screen) screen.setAttribute('data-tab', tab);
  $$('#bottom-nav .nav-i').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  window.scrollTo(0, 0);
}
// Affiche l'« Espace coach » de l'ecran Profil uniquement pour coach/admin.
function setupProfilCoach() {
  if (!isCoachOrAdmin()) return;
  $$('#view-profil .profil-coach').forEach((el) => el.classList.remove('hidden'));
}

// --- Vue coach : liste des demandes ---
async function openHelpAdmin() { $('#helpAdminPanel').classList.remove('hidden'); await renderHelpAdmin(); }
function closeHelpAdmin() { $('#helpAdminPanel').classList.add('hidden'); }

async function renderHelpAdmin() {
  const body = $('#helpAdminBody');
  body.innerHTML = '<p class="panel-sub">Chargement…</p>';
  try {
    const res = await fetch(apiUrl('/api/help-requests'), { headers: nutriAuthHeaders() });
    const data = await res.json();
    if (!data.ok) throw new Error();
    const list = data.demandes || [];
    updateHelpBadge(list);
    if (!list.length) { body.innerHTML = '<p class="help-empty">Aucune demande pour le moment.</p>'; return; }
    body.innerHTML = list.map((d) => {
      const date = new Date(d.createdAt);
      const dateStr = isNaN(date.getTime()) ? '' :
        date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) + ' a ' +
        date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const tags = (d.difficultes || []).map((t) => `<span class="help-tag">${escapeHtml(t)}</span>`).join('');
      const opts = Object.entries(HELP_STATUS).map(([k, lbl]) =>
        `<option value="${k}" ${d.statut === k ? 'selected' : ''}>${lbl}</option>`).join('');
      return `<div class="help-req statut-${d.statut}">
        <div class="help-req-head">
          <strong>${escapeHtml(d.clientName || 'Client')}</strong>
          <span class="help-status-badge statut-${d.statut}">${HELP_STATUS[d.statut] || d.statut}</span>
        </div>
        <div class="help-req-date">${dateStr}</div>
        <div class="help-req-tags">${tags || '<span class="help-tag muted">—</span>'}</div>
        ${d.message ? `<p class="help-req-msg">${escapeHtml(d.message)}</p>` : ''}
        <label class="help-status-set">Statut
          <select data-id="${d.id}">${opts}</select>
        </label>
      </div>`;
    }).join('');
    $$('#helpAdminBody select[data-id]').forEach((sel) =>
      sel.addEventListener('change', () => setHelpStatus(sel.dataset.id, sel.value)));
  } catch (e) {
    body.innerHTML = '<p class="help-empty">Lecture impossible. Reessaie.</p>';
  }
}
async function setHelpStatus(id, statut) {
  try {
    await fetch(apiUrl('/api/help-requests/' + id), {
      method: 'PATCH', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ statut }),
    });
    await renderHelpAdmin();
  } catch (_) { /* ignore */ }
}
function updateHelpBadge(list) {
  const n = (list || []).filter((d) => d.statut === 'a_traiter').length;
  const badge = $('#helpAdminBadge');
  if (!badge) return;
  badge.textContent = n;
  badge.classList.toggle('hidden', n === 0);
}

// Affiche la carte coach + precharge le badge si l'utilisateur est coach/admin.
async function setupHelpAccess() {
  if (!isCoachOrAdmin()) return;
  const card = $('#btnHelpAdmin');
  if (card) card.classList.remove('hidden');
  try {
    const res = await fetch(apiUrl('/api/help-requests'), { headers: nutriAuthHeaders() });
    const data = await res.json();
    if (data.ok) updateHelpBadge(data.demandes || []);
  } catch (_) { /* ignore */ }
}

// ---------- Scan de produit (code-barres -> Open Food Facts) ----------
let scanReader = null;     // instance ZXing
let scanActive = false;    // un scan camera est en cours
let lastScanned = null;    // dernier produit affiche
const SCAN_FAV_KEY = isDemo() ? 'mycoach-scan-favoris-demo-v1' : 'mycoach-scan-favoris-v1';

function scanShowStage(stage) {
  ['Camera', 'Loading', 'Error', 'Result'].forEach((s) =>
    $('#scanStage' + s).classList.toggle('hidden', s.toLowerCase() !== stage));
}
function openScan() {
  $('#scanModal').classList.remove('hidden');
  $('#scanManual').classList.add('hidden');
  $('#scanManualInput').value = '';
  scanShowStage('camera');
  startCamera();
}
function closeScan() {
  scanReplaceCtx = null;
  if ($('#scanModal').classList.contains('hidden')) return;
  stopCamera();
  $('#scanModal').classList.add('hidden');
}
let nativeStream = null;   // MediaStream du scanner natif
let nativeTimer = 0;       // boucle de detection native

function stopCamera() {
  scanActive = false;
  try { if (scanReader) scanReader.reset(); } catch (_) { /* ignore */ }
  if (nativeTimer) { clearTimeout(nativeTimer); nativeTimer = 0; }
  if (nativeStream) { try { nativeStream.getTracks().forEach((t) => t.stop()); } catch (_) { /* ignore */ } nativeStream = null; }
  const v = $('#scanVideo'); if (v) { try { v.srcObject = null; } catch (_) { /* ignore */ } }
}

// Lecteur ZXing cible sur les formats de codes-barres ALIMENTAIRES (EAN/UPC...)
function makeScanReader() {
  try {
    const hints = new Map();
    const F = ZXing.BarcodeFormat;
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.ITF]);
    hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
    return new ZXing.BrowserMultiFormatReader(hints, 250);
  } catch (_) {
    return new ZXing.BrowserMultiFormatReader();
  }
}

const CAM_CONSTRAINTS = { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } };

// Dessine l'image de la video tournee de `deg` degres dans un canvas reutilise,
// pour pouvoir scanner un code-barres quelle que soit son orientation.
let scanCanvas = null;
function rotatedFrame(video, deg) {
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return null;
  if (!scanCanvas) scanCanvas = document.createElement('canvas');
  const c = scanCanvas, ctx = c.getContext('2d');
  if (deg === 90 || deg === 270) { c.width = h; c.height = w; } else { c.width = w; c.height = h; }
  ctx.save();
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(deg * Math.PI / 180);
  ctx.drawImage(video, -w / 2, -h / 2);
  ctx.restore();
  return c;
}

// Scanner natif (API BarcodeDetector) : tres fiable sur Android Chrome.
async function startNativeScanner(video, hint) {
  let formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'];
  try {
    const avail = await window.BarcodeDetector.getSupportedFormats();
    const inter = formats.filter((f) => avail.includes(f));
    formats = inter.length ? inter : avail;
  } catch (_) { /* on garde la liste par defaut */ }
  const detector = new window.BarcodeDetector({ formats });
  const stream = await navigator.mediaDevices.getUserMedia(CAM_CONSTRAINTS);
  nativeStream = stream;
  video.srcObject = stream;
  await video.play().catch(() => {});
  hint.textContent = 'Vise le code-barres — peu importe le sens.';
  // On essaie l'image brute (0/180 deg) puis une rotation differente a chaque
  // cycle (90, 45, 135) -> le code est lu quelle que soit son orientation.
  const EXTRA = [90, 45, 135];
  let ai = 0;
  const detect = async (src) => { try { return await detector.detect(src); } catch (_) { return null; } };
  const loop = async () => {
    if (!scanActive) return;
    let codes = await detect(video);
    if ((!codes || !codes.length) && scanActive) {
      const rot = rotatedFrame(video, EXTRA[ai++ % EXTRA.length]);
      if (rot) codes = await detect(rot);
    }
    if (codes && codes.length && scanActive) {
      scanActive = false; stopCamera(); lookupBarcode(codes[0].rawValue); return;
    }
    nativeTimer = setTimeout(loop, 120);
  };
  nativeTimer = setTimeout(loop, 300);
}

async function startCamera() {
  const hint = $('#scanHint');
  const video = $('#scanVideo');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    hint.textContent = "La camera n'est pas disponible ici — saisis le code manuellement.";
    $('#scanManual').classList.remove('hidden'); return;
  }
  video.setAttribute('playsinline', 'true');
  video.setAttribute('autoplay', 'true');
  video.muted = true;
  hint.textContent = 'Initialisation de la camera…';
  scanActive = true;

  // 1) API native BarcodeDetector (Android Chrome) — la plus fiable.
  if ('BarcodeDetector' in window) {
    try {
      await startNativeScanner(video, hint);
      return;
    } catch (e) {
      if (e && (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError')) {
        scanActive = false; showScanError("Autorise l'acces a la camera pour scanner ton produit."); return;
      }
      stopCamera(); scanActive = true; // on tente ZXing en repli
    }
  }

  // 2) Repli ZXing (iOS Safari, navigateurs sans BarcodeDetector).
  if (typeof ZXing !== 'undefined' && ZXing.BrowserMultiFormatReader) {
    const onResult = (result) => { if (result && scanActive) { scanActive = false; stopCamera(); lookupBarcode(result.getText()); } };
    try {
      if (!scanReader) scanReader = makeScanReader();
      if (typeof scanReader.decodeFromConstraints === 'function') await scanReader.decodeFromConstraints(CAM_CONSTRAINTS, video, onResult);
      else await scanReader.decodeFromVideoDevice(null, video, onResult);
      hint.textContent = 'Approche le code-barres, bien net dans le cadre.';
      return;
    } catch (e) {
      scanActive = false;
      if (e && (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError')) {
        showScanError("Autorise l'acces a la camera pour scanner ton produit."); return;
      }
    }
  }

  // 3) Rien ne fonctionne -> saisie manuelle.
  scanActive = false;
  hint.textContent = 'Camera indisponible — saisis le code manuellement.';
  $('#scanManual').classList.remove('hidden');
}
function showScanError(html) {
  scanShowStage('error');
  $('#scanErrorBox').innerHTML = html;
}

// Niveau de coherence avec l'objectif (Nutri-Score + ultra-transformation NOVA),
// nuance selon l'objectif. Simple et bienveillant — pas un avis medical.
function evaluerCoherence(p) {
  const objectif = (state.profil && state.profil.objectif) || 'maintien';
  const ns = p.nutriscore, nova = p.nova;
  let score = 2; // par defaut : moderation (donnees incompletes)
  if (ns === 'a' || ns === 'b') score = 1;
  else if (ns === 'c') score = 2;
  else if (ns === 'd' || ns === 'e') score = 3;
  if (nova === 4) score = Math.max(score, 3);
  else if (nova === 3) score = Math.max(score, 2);
  if (objectif === 'perte') {
    const sucres = Number(p.nutriments['sugars_100g'] || 0);
    const gras = Number(p.nutriments['saturated-fat_100g'] || 0);
    if ((sucres >= 22 || gras >= 8) && score < 3) score = score + 1;
  }
  const niveau = score <= 1 ? 'compatible' : score === 2 ? 'moderation' : 'a_eviter';
  return Object.assign({ niveau }, messageCoherence(niveau, objectif));
}
function messageCoherence(niveau, objectif) {
  const map = {
    compatible: { titre: 'Compatible avec ton objectif',
      reco: objectif === 'perte'
        ? 'Bon choix si tu cherches une option simple et pratique — respecte juste les portions.'
        : "Ce produit peut s'integrer dans ton plan, surtout si tu respectes les portions." },
    moderation: { titre: 'A consommer avec moderation',
      reco: 'Ce produit est possible occasionnellement, mais privilegie une alternative plus simple au quotidien.' },
    a_eviter: { titre: 'A eviter regulierement',
      reco: objectif === 'perte'
        ? 'A limiter si ton objectif est la perte de poids. Il peut depanner, mais ne doit pas devenir une base quotidienne.'
        : "Ce produit risque de compliquer ton objectif si tu le consommes souvent. Demande l'avis de ton coach en cas de doute." },
  };
  return map[niveau] || map.moderation;
}

const ALLERGEN_FR = {
  milk: 'lait', gluten: 'gluten', eggs: 'oeufs', nuts: 'fruits a coque', peanuts: 'arachides',
  soybeans: 'soja', fish: 'poisson', crustaceans: 'crustaces', molluscs: 'mollusques',
  celery: 'celeri', mustard: 'moutarde', 'sesame-seeds': 'sesame', sesame: 'sesame', lupin: 'lupin',
  'sulphur-dioxide-and-sulphites': 'sulfites',
};
function translateAllergen(tag) {
  const key = String(tag).replace(/^[a-z]{2}:/, '');
  return ALLERGEN_FR[key] || key.replace(/-/g, ' ');
}

async function lookupBarcode(code) {
  const barcode = String(code || '').replace(/\D/g, '');
  if (!barcode) { showScanError('Code-barres invalide. Reessaie.'); return; }
  scanShowStage('loading');
  try {
    const fields = 'product_name,product_name_fr,brands,image_front_url,image_url,ingredients_text,ingredients_text_fr,allergens_tags,nutriments,nutriscore_grade,nova_group,quantity';
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=${fields}`);
    const data = await res.json();
    const found = data && data.product && data.status !== 0 &&
      (data.product.product_name || data.product.product_name_fr || data.product.brands || data.product.nutriments);
    if (!found) {
      // Produit absent de la base : on n'enregistre pas (vue coach propre).
      showScanError("Ce produit n'est pas encore reference. Tu peux l'ajouter manuellement ou demander l'avis de ton coach.");
      return;
    }
    const pr = data.product;
    const produit = {
      barcode,
      name: pr.product_name_fr || pr.product_name || 'Produit',
      brand: (pr.brands || '').split(',')[0].trim(),
      image: pr.image_front_url || pr.image_url || '',
      ingredients: pr.ingredients_text_fr || pr.ingredients_text || '',
      allergens: (pr.allergens_tags || []).map(translateAllergen),
      nutriscore: (pr.nutriscore_grade || '').toLowerCase(),
      nova: pr.nova_group || null,
      quantity: pr.quantity || '',
      nutriments: pr.nutriments || {},
    };
    produit.coherence = evaluerCoherence(produit);
    lastScanned = produit;
    logScan({ barcode, productName: produit.name, brand: produit.brand, nutriscore: produit.nutriscore, coherence: produit.coherence.niveau });
    if (scanReplaceCtx) renderScanReplace(produit);
    else renderScanResult(produit);
  } catch (e) {
    showScanError("Produit non reconnu, tu peux l'ajouter manuellement.");
  }
}

// Synonymes d'allergenes cote front : "arachide" coche doit exclure "cacahuete",
// "fruits a coque" doit exclure "amande/noix/noisette", etc. Miroir (volontairement
// large, on prefere sur-exclure que laisser passer) de la logique serveur.
const ALLERG_SYNONYMES_FRONT = {
  arachide: ['arachide', 'cacahuete', 'cacahouete', 'satay', 'peanut'],
  'fruits a coque': ['fruits a coque', 'noix', 'amande', 'noisette', 'cajou', 'pistache', 'pignon', 'pecan', 'cerneau', 'macadamia'],
  lactose: ['lactose', 'lait', 'fromage', 'yaourt', 'creme', 'beurre', 'skyr', 'mozzar', 'parmesan', 'feta', 'ricotta', 'mascarpone', 'emmental', 'gruyere', 'cheddar', 'chevre'],
  gluten: ['gluten', 'ble', 'pain', 'pates', 'semoule', 'couscous', 'avoine', 'orge', 'seigle', 'epeautre', 'chapelure', 'biscotte', 'naan', 'pita', 'brioche'],
  oeuf: ['oeuf', 'omelette', 'mayonnaise', 'meringue', 'frittata'],
  poisson: ['poisson', 'saumon', 'thon', 'cabillaud', 'colin', 'merlu', 'truite', 'sardine', 'maquereau', 'hareng', 'anchois', 'surimi', 'dorade'],
  crustaces: ['crustace', 'crevette', 'gambas', 'crabe', 'homard', 'langoustine', 'ecrevisse'],
  soja: ['soja', 'tofu', 'edamame', 'miso', 'tamari', 'tempeh'],
  sesame: ['sesame', 'tahin', 'houmous', 'gomasio'],
};

// Liste des mots a exclure pour l'utilisateur courant : allergies (etendues aux
// synonymes/familles) + aliments detestes (mots bruts).
function motsAllergenesInterdits() {
  const out = new Set();
  for (const a of (state.preferences.allergies || [])) {
    const na = normTxt(a);
    if (!na) continue;
    out.add(na);
    for (const [fam, syns] of Object.entries(ALLERG_SYNONYMES_FRONT)) {
      const match = na.includes(normTxt(fam)) || normTxt(fam).includes(na)
        || syns.some((s) => na.includes(normTxt(s)) || normTxt(s).includes(na));
      if (match) syns.forEach((s) => out.add(normTxt(s)));
    }
  }
  for (const d of (state.preferences.deteste || [])) { const nd = normTxt(d); if (nd) out.add(nd); }
  return [...out].filter(Boolean);
}

function renderScanResult(p) {
  scanShowStage('result');
  const allerg = (p.allergens || []).filter(Boolean).slice(0, 6);
  // Croisement avec les allergies de l'utilisateur : on signale clairement les conflits.
  const interditsUser = motsAllergenesInterdits();
  const conflits = (p.allergens || []).filter((a) => {
    const na = normTxt(a);
    return interditsUser.some((m) => m && (na.includes(m) || m.includes(na)));
  });
  const ns = p.nutriscore && 'abcde'.includes(p.nutriscore)
    ? `<span class="nutriscore ns-${p.nutriscore}">Nutri-Score ${p.nutriscore.toUpperCase()}</span>` : '';
  const isFav = scanFavoris().some((f) => f.barcode === p.barcode);
  $('#scanResultBody').innerHTML = `
    <div class="scan-product">
      ${p.image
        ? `<img class="scan-img" src="${escapeHtml(p.image)}" alt="" onerror="this.style.display='none'">`
        : `<div class="scan-img scan-img-empty"><svg class="ic"><use href="#ic-barcode"/></svg></div>`}
      <div class="scan-product-info">
        <h3>${escapeHtml(p.name)}</h3>
        ${p.brand ? `<p class="scan-brand">${escapeHtml(p.brand)}</p>` : ''}
        ${p.quantity ? `<p class="scan-qty">${escapeHtml(p.quantity)}</p>` : ''}
        ${ns}
      </div>
    </div>
    <div class="coherence coherence-${p.coherence.niveau}">
      <strong>${p.coherence.titre}</strong>
      <p>${p.coherence.reco}</p>
    </div>
    ${conflits.length ? `<div class="scan-warning" style="display:flex;gap:8px;align-items:flex-start;background:rgba(248,113,113,0.14);border:1px solid rgba(248,113,113,0.45);color:#F87171;border-radius:12px;padding:11px 14px;font-size:13.5px;font-weight:600;margin-bottom:10px;line-height:1.4;">⚠️ Contient un de tes allergenes : ${conflits.map(escapeHtml).join(', ')}. A eviter — demande a ton coach en cas de doute.</div>` : ''}
    ${allerg.length ? `<div class="scan-allerg"><span class="scan-allerg-label">Allergenes</span> ${allerg.map((a) => { const danger = conflits.includes(a); return `<span class="help-tag"${danger ? ' style="background:rgba(248,113,113,0.18);color:#F87171;border:1px solid rgba(248,113,113,0.5);"' : ''}>${escapeHtml(a)}</span>`; }).join('')}</div>` : ''}
    <p class="help-disclaimer">Cette indication est une aide a la decision, pas un avis medical. En cas de doute, demande a ton coach ou a un professionnel de sante.</p>
    <label class="field" style="margin:2px 0 10px"><span>Un mot pour ton coach (optionnel)</span>
      <textarea id="scanCoachMsg" rows="2" placeholder="Ex : est-ce que je peux en prendre le matin ?"></textarea></label>
    <div class="scan-actions">
      <button type="button" class="btn btn-outline" id="scanFav"><svg class="ic"><use href="#ic-star"/></svg> ${isFav ? 'Dans tes favoris' : 'Ajouter a mes favoris'}</button>
      <button type="button" class="btn btn-primary" id="scanAskCoach"><svg class="ic"><use href="#ic-heart-hand"/></svg> Demander l'avis de mon coach</button>
    </div>
    <button type="button" class="btn btn-ghost btn-sm" id="scanAnother" style="width:100%;margin-top:8px"><svg class="ic"><use href="#ic-scan"/></svg> Scanner un autre produit</button>
  `;
  $('#scanFav').addEventListener('click', toggleScanFav);
  $('#scanAskCoach').addEventListener('click', askCoachAboutProduct);
  $('#scanAnother').addEventListener('click', () => { scanShowStage('camera'); $('#scanManual').classList.add('hidden'); startCamera(); });
}

function scanFavoris() { try { return JSON.parse(localStorage.getItem(SCAN_FAV_KEY) || '[]'); } catch (_) { return []; } }
function toggleScanFav() {
  if (!lastScanned) return;
  const favs = scanFavoris();
  const i = favs.findIndex((f) => f.barcode === lastScanned.barcode);
  if (i >= 0) favs.splice(i, 1);
  else favs.unshift({ barcode: lastScanned.barcode, name: lastScanned.name, brand: lastScanned.brand, image: lastScanned.image, coherence: lastScanned.coherence.niveau });
  localStorage.setItem(SCAN_FAV_KEY, JSON.stringify(favs.slice(0, 100)));
  renderScanResult(lastScanned);
}

async function logScan(payload) {
  if (isDemo()) return; // démo : pas de journalisation serveur
  try {
    await fetch(apiUrl('/api/scan'), { method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(Object.assign({ clientName: helpClientName() }, payload)) });
  } catch (_) { /* best-effort */ }
}
async function askCoachAboutProduct() {
  if (!lastScanned) return;
  const message = ($('#scanCoachMsg') && $('#scanCoachMsg').value.trim()) || '';
  const btn = $('#scanAskCoach'); btn.disabled = true;
  if (isDemo()) { btn.innerHTML = 'Demande envoyee (demo) ✓'; return; }
  try {
    const res = await fetch(apiUrl('/api/scan-advice'), { method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ clientName: helpClientName(), barcode: lastScanned.barcode, productName: lastScanned.name, message }) });
    const data = await res.json();
    if (!data.ok) throw new Error();
    btn.innerHTML = 'Demande envoyee a ton coach ✓';
  } catch (e) { btn.disabled = false; alert("L'envoi n'a pas fonctionne. Reessaie."); }
}

// --- Vue coach : scans produits ---
function cohBadge(c) {
  const m = { compatible: 'Compatible', moderation: 'Moderation', a_eviter: 'A eviter' };
  return m[c] ? `<span class="coh-badge coh-${c}">${m[c]}</span>` : '';
}
async function openScanAdmin() { $('#scanAdminPanel').classList.remove('hidden'); await renderScanAdmin(); }
function closeScanAdmin() { $('#scanAdminPanel').classList.add('hidden'); }
function updateScanBadge(advice) {
  const n = (advice || []).filter((a) => a.statut === 'a_traiter').length;
  const b = $('#scanAdminBadge'); if (!b) return;
  b.textContent = n; b.classList.toggle('hidden', n === 0);
}
async function renderScanAdmin() {
  const body = $('#scanAdminBody');
  body.innerHTML = '<p class="panel-sub">Chargement…</p>';
  try {
    const res = await fetch(apiUrl('/api/scans'), { headers: nutriAuthHeaders() });
    const data = await res.json();
    if (!data.ok) throw new Error();
    const advice = data.advice || [], top = data.topProducts || [], recent = data.recent || [];
    updateScanBadge(advice);
    const flagged = recent.filter((r) => r.coherence === 'a_eviter');
    const adviceHtml = advice.length ? advice.map((a) => {
      const date = new Date(a.createdAt);
      const ds = isNaN(date.getTime()) ? '' : date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
      const opts = Object.entries(HELP_STATUS).map(([k, l]) => `<option value="${k}" ${a.statut === k ? 'selected' : ''}>${l}</option>`).join('');
      return `<div class="help-req statut-${a.statut}">
        <div class="help-req-head"><strong>${escapeHtml(a.clientName)}</strong><span class="help-status-badge statut-${a.statut}">${HELP_STATUS[a.statut]}</span></div>
        <div class="help-req-date">${ds}${a.barcode ? ' · ' + escapeHtml(a.barcode) : ''}</div>
        <div class="help-req-tags"><span class="help-tag">${escapeHtml(a.productName || 'Produit')}</span></div>
        ${a.message ? `<p class="help-req-msg">${escapeHtml(a.message)}</p>` : ''}
        <label class="help-status-set">Statut <select data-advice-id="${a.id}">${opts}</select></label>
      </div>`;
    }).join('') : '<p class="help-empty">Aucune demande d\'avis.</p>';
    const topHtml = top.length ? top.map((t) =>
      `<div class="scan-top-row"><span class="scan-top-count">${t.count}×</span><span class="scan-top-name">${escapeHtml(t.productName || t.barcode)}</span>${cohBadge(t.coherence)}</div>`).join('')
      : '<p class="help-empty">Aucun scan pour le moment.</p>';
    const flaggedHtml = flagged.length ? flagged.slice(0, 12).map((f) =>
      `<div class="scan-top-row"><span class="scan-top-name">${escapeHtml(f.productName || f.barcode)}</span><span class="scan-top-client">${escapeHtml(f.clientName)}</span></div>`).join('')
      : '<p class="help-empty">Rien a signaler.</p>';
    body.innerHTML =
      `<div class="scan-admin-sec"><h3>Demandes d'avis</h3>${adviceHtml}</div>`
      + `<div class="scan-admin-sec"><h3>Produits les plus scannes</h3>${topHtml}</div>`
      + `<div class="scan-admin-sec"><h3>Produits a surveiller</h3>${flaggedHtml}</div>`;
    $$('#scanAdminBody select[data-advice-id]').forEach((sel) =>
      sel.addEventListener('change', () => setScanAdviceStatus(sel.dataset.adviceId, sel.value)));
  } catch (e) { body.innerHTML = '<p class="help-empty">Lecture impossible. Reessaie.</p>'; }
}
async function setScanAdviceStatus(id, statut) {
  try {
    await fetch(apiUrl('/api/scan-advice/' + id), { method: 'PATCH', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ statut }) });
    await renderScanAdmin();
  } catch (_) { /* ignore */ }
}
async function setupScanAccess() {
  if (!isCoachOrAdmin()) return;
  const card = $('#btnScanAdmin'); if (card) card.classList.remove('hidden');
  try { const res = await fetch(apiUrl('/api/scans'), { headers: nutriAuthHeaders() }); const data = await res.json(); if (data.ok) updateScanBadge(data.advice || []); } catch (_) { /* ignore */ }
}

// ---------- Remplacer un ingredient par un produit scanne ----------
let scanReplaceCtx = null; // { di, mi, idx, oldIng }

// Table nutritionnelle generique (pour 100 g / 100 ml) : sert a ESTIMER la
// contribution de l'ANCIEN ingredient (la banque ne stocke que les totaux).
const FOOD_NUTRITION = [
  { k: ['pates', 'spaghetti', 'penne', 'macaroni', 'tagliatelle', 'coquillettes'], v: { kcal: 350, p: 12, g: 70, l: 2 } },
  { k: ['riz'], v: { kcal: 350, p: 7, g: 78, l: 1 } },
  { k: ['semoule', 'couscous'], v: { kcal: 350, p: 12, g: 73, l: 1 } },
  { k: ['quinoa'], v: { kcal: 360, p: 14, g: 64, l: 6 } },
  { k: ['boulgour'], v: { kcal: 345, p: 12, g: 76, l: 1 } },
  { k: ['patate douce'], v: { kcal: 90, p: 1.5, g: 21, l: 0 } },
  { k: ['pomme de terre', 'pommes de terre'], v: { kcal: 80, p: 2, g: 18, l: 0 } },
  { k: ['flocons', 'avoine', 'muesli', 'cereales'], v: { kcal: 370, p: 12, g: 62, l: 7 } },
  { k: ['pain', 'baguette', 'tartine', 'biscotte'], v: { kcal: 260, p: 9, g: 50, l: 2 } },
  { k: ['poulet'], v: { kcal: 150, p: 30, g: 0, l: 4 } },
  { k: ['dinde'], v: { kcal: 120, p: 26, g: 0, l: 2 } },
  { k: ['boeuf', 'steak'], v: { kcal: 160, p: 26, g: 0, l: 6 } },
  { k: ['jambon'], v: { kcal: 120, p: 20, g: 1, l: 4 } },
  { k: ['saumon'], v: { kcal: 200, p: 22, g: 0, l: 13 } },
  { k: ['thon'], v: { kcal: 110, p: 26, g: 0, l: 1 } },
  { k: ['cabillaud', 'colin', 'poisson blanc'], v: { kcal: 80, p: 18, g: 0, l: 1 } },
  { k: ['crevette'], v: { kcal: 85, p: 18, g: 0, l: 1 } },
  { k: ['oeuf'], v: { kcal: 145, p: 13, g: 1, l: 10 } },
  { k: ['tofu'], v: { kcal: 120, p: 12, g: 3, l: 7 } },
  { k: ['pois chiche'], v: { kcal: 150, p: 8, g: 23, l: 3 } },
  { k: ['lentille'], v: { kcal: 115, p: 8, g: 20, l: 0.5 } },
  { k: ['haricot rouge', 'haricots rouges'], v: { kcal: 110, p: 8, g: 20, l: 0.5 } },
  { k: ['feta'], v: { kcal: 260, p: 14, g: 1, l: 21 } },
  { k: ['mozzarella'], v: { kcal: 250, p: 18, g: 1, l: 19 } },
  { k: ['fromage', 'gruyere', 'emmental', 'comte'], v: { kcal: 370, p: 25, g: 1, l: 30 } },
  { k: ['yaourt', 'skyr', 'fromage blanc'], v: { kcal: 60, p: 6, g: 5, l: 1.5 } },
  { k: ['lait de coco'], v: { kcal: 180, p: 2, g: 3, l: 18 } },
  { k: ['lait'], v: { kcal: 47, p: 3.4, g: 5, l: 1.6 } },
  { k: ['beurre'], v: { kcal: 740, p: 1, g: 1, l: 81 } },
  { k: ['huile'], v: { kcal: 880, p: 0, g: 0, l: 100 } },
  { k: ['pesto'], v: { kcal: 450, p: 5, g: 6, l: 45 } },
  { k: ['sauce tomate', 'coulis', 'passata'], v: { kcal: 40, p: 1.5, g: 7, l: 1 } },
  { k: ['sauce soja'], v: { kcal: 60, p: 8, g: 6, l: 0 } },
  { k: ['tahin', 'puree de sesame'], v: { kcal: 600, p: 17, g: 10, l: 54 } },
  { k: ['mayonnaise'], v: { kcal: 680, p: 1, g: 2, l: 75 } },
  { k: ['brocoli'], v: { kcal: 34, p: 2.8, g: 4, l: 0.4 } },
  { k: ['courgette'], v: { kcal: 17, p: 1.2, g: 3, l: 0.3 } },
  { k: ['poivron'], v: { kcal: 30, p: 1, g: 6, l: 0.3 } },
  { k: ['epinard'], v: { kcal: 23, p: 2.9, g: 1, l: 0.4 } },
  { k: ['haricot vert', 'haricots verts'], v: { kcal: 31, p: 1.8, g: 5, l: 0.2 } },
  { k: ['tomate'], v: { kcal: 18, p: 0.9, g: 3, l: 0.2 } },
  { k: ['carotte'], v: { kcal: 40, p: 0.9, g: 9, l: 0.2 } },
  { k: ['champignon'], v: { kcal: 22, p: 3, g: 1, l: 0.3 } },
  { k: ['salade', 'laitue', 'roquette', 'mache'], v: { kcal: 15, p: 1.4, g: 1.5, l: 0.2 } },
  { k: ['concombre'], v: { kcal: 15, p: 0.7, g: 2, l: 0.1 } },
  { k: ['banane'], v: { kcal: 90, p: 1.1, g: 21, l: 0.3 } },
  { k: ['pomme', 'poire'], v: { kcal: 55, p: 0.3, g: 13, l: 0.2 } },
  { k: ['fruits rouges', 'myrtille', 'framboise', 'fraise'], v: { kcal: 50, p: 1, g: 9, l: 0.4 } },
  { k: ['orange', 'clementine'], v: { kcal: 47, p: 1, g: 9, l: 0.1 } },
  { k: ['amande', 'noix', 'noisette', 'cajou'], v: { kcal: 600, p: 20, g: 12, l: 52 } },
  { k: ['miel', 'sirop'], v: { kcal: 300, p: 0, g: 80, l: 0 } },
  { k: ['chocolat'], v: { kcal: 540, p: 6, g: 50, l: 33 } },
  { k: ['sucre', 'confiture'], v: { kcal: 300, p: 0, g: 75, l: 0 } },
];
function lookupFood(nom) {
  const n = normTxt(nom);
  for (const e of FOOD_NUTRITION) if (e.k.some((k) => n.includes(k))) return e.v;
  return null;
}
function ingredientGrams(ing) {
  const q = Number(ing.quantite) || 0;
  const u = normTxt(ing.unite || '');
  if (u === 'g' || u === 'ml' || u === '') return q;
  if (u.includes('soupe')) return q * 15;
  if (u.includes('cafe')) return q * 5;
  if (u.includes('piece') || u.includes('unite')) {
    const n = normTxt(ing.nom);
    if (n.includes('oeuf')) return q * 55;
    if (n.includes('tranche')) return q * 30;
    if (n.includes('banane')) return q * 120;
    if (n.includes('pomme') || n.includes('poire') || n.includes('orange')) return q * 130;
    return q * 100;
  }
  return q;
}
function macrosForGrams(per100, grams) {
  const f = grams / 100;
  return { kcal: (per100.kcal || 0) * f, p: (per100.p || 0) * f, g: (per100.g || 0) * f, l: (per100.l || 0) * f };
}
// Estimation des macros d'un ingredient de la banque (best effort).
function estimateIngredientMacros(ing) {
  const food = lookupFood(ing.nom);
  const grams = ingredientGrams(ing);
  if (food) return Object.assign(macrosForGrams(food, grams), { estimated: false });
  return { kcal: grams * 1.3, p: grams * 0.06, g: grams * 0.15, l: grams * 0.04, estimated: true };
}
// Macros d'un produit OFF pour une quantite (g/ml), depuis les valeurs /100 g.
function productMacrosForIngredient(product, grams) {
  const nu = product.nutriments || {};
  const kcal100 = Number(nu['energy-kcal_100g'] != null ? nu['energy-kcal_100g'] : (nu['energy-kcal'] || 0));
  const per100 = { kcal: kcal100, p: Number(nu['proteins_100g'] || 0), g: Number(nu['carbohydrates_100g'] || 0), l: Number(nu['fat_100g'] || 0) };
  const known = kcal100 > 0 || per100.p || per100.g || per100.l;
  return Object.assign(macrosForGrams(per100, grams), { known });
}

function openScanForReplace(di, mi, idx) {
  if (!state.plan || !state.plan.jours[di] || !state.plan.jours[di].repas[mi]) return;
  const recette = state.plan.jours[di].repas[mi].recette;
  const oldIng = recette && recette.ingredients && recette.ingredients[idx];
  if (!oldIng) return;
  scanReplaceCtx = { di, mi, idx, oldIng: Object.assign({}, oldIng) };
  closeRecipe();
  openScan();
}

function computeReplace(p) {
  const ctx = scanReplaceCtx;
  const recette = state.plan.jours[ctx.di].repas[ctx.mi].recette;
  const qtyInput = $('#replaceQty');
  const newQty = Number(qtyInput ? qtyInput.value : ctx.oldIng.quantite) || 0;
  const oldEst = estimateIngredientMacros(ctx.oldIng);
  const grams = ingredientGrams({ quantite: newQty, unite: ctx.oldIng.unite, nom: p.name });
  const newM = productMacrosForIngredient(p, grams);
  return {
    newQty, grams, newM, oldEst,
    estimated: oldEst.estimated || !newM.known,
    kcal: Math.max(0, Math.round(recette.kcal - oldEst.kcal + newM.kcal)),
    p: Math.max(0, Math.round(recette.proteines - oldEst.p + newM.p)),
    g: Math.max(0, Math.round(recette.glucides - oldEst.g + newM.g)),
    l: Math.max(0, Math.round(recette.lipides - oldEst.l + newM.l)),
  };
}
function macroDelta(label, oldV, newV, unit) {
  const diff = newV - oldV;
  const cls = diff > 0 ? 'up' : (diff < 0 ? 'down' : 'flat');
  const txt = diff === 0 ? '=' : (diff > 0 ? '+' : '') + diff + unit;
  return `<div class="rm"><span class="rm-l">${label}</span><span class="rm-v">${newV}${unit}</span><span class="rm-d ${cls}">${txt}</span></div>`;
}
function renderReplacePreview(p) {
  const r = computeReplace(p);
  const recette = state.plan.jours[scanReplaceCtx.di].repas[scanReplaceCtx.mi].recette;
  $('#replacePreview').innerHTML = `
    <div class="replace-macros">
      ${macroDelta('kcal', recette.kcal, r.kcal, '')}
      ${macroDelta('P', recette.proteines, r.p, 'g')}
      ${macroDelta('G', recette.glucides, r.g, 'g')}
      ${macroDelta('L', recette.lipides, r.l, 'g')}
    </div>
    <p class="replace-note">${r.estimated ? '≈ ' : ''}Nouveau total du repas${r.estimated ? ' (estimation)' : ''}</p>`;
}
function renderScanReplace(p) {
  scanShowStage('result');
  const oldIng = scanReplaceCtx.oldIng;
  const defQty = Number(oldIng.quantite) || 0;
  const unit = oldIng.unite || 'g';
  $('#scanResultBody').innerHTML = `
    <div class="scan-product">
      ${p.image ? `<img class="scan-img" src="${escapeHtml(p.image)}" alt="" onerror="this.style.display='none'">`
        : `<div class="scan-img scan-img-empty"><svg class="ic"><use href="#ic-barcode"/></svg></div>`}
      <div class="scan-product-info"><h3>${escapeHtml(p.name)}</h3>${p.brand ? `<p class="scan-brand">${escapeHtml(p.brand)}</p>` : ''}</div>
    </div>
    <div class="replace-box">
      <p class="replace-line">Remplacer <strong>${escapeHtml(oldIng.nom)}</strong> par <strong>${escapeHtml(p.name)}</strong> dans ce repas.</p>
      <label class="replace-qty">Quantite utilisee
        <span><input type="number" id="replaceQty" min="0" step="1" value="${defQty}"> ${escapeHtml(unit)}</span>
      </label>
      <div id="replacePreview" class="replace-preview"></div>
    </div>
    <p class="help-disclaimer">Valeurs du nouveau produit issues d'Open Food Facts ; le recalcul des macros est une estimation.</p>
    <div class="scan-actions">
      <button type="button" class="btn btn-ghost" id="replaceCancel">Annuler</button>
      <button type="button" class="btn btn-primary" id="replaceConfirm"><svg class="ic"><use href="#ic-swap"/></svg> Remplacer</button>
    </div>`;
  $('#replaceQty').addEventListener('input', () => renderReplacePreview(p));
  renderReplacePreview(p);
  $('#replaceConfirm').addEventListener('click', () => applyScanReplace(p));
  $('#replaceCancel').addEventListener('click', () => {
    const c = scanReplaceCtx; closeScan();
    if (c) openRecipe(state.plan.jours[c.di].repas[c.mi].recette, c.di, c.mi);
  });
}
function applyScanReplace(p) {
  const ctx = scanReplaceCtx;
  if (!ctx) return;
  const recette = state.plan.jours[ctx.di].repas[ctx.mi].recette;
  const ing = recette.ingredients[ctx.idx];
  if (!ing) { closeScan(); return; }
  const r = computeReplace(p);
  const ancien = ing.nom;
  ing.nom = p.name + (p.brand ? ` (${p.brand})` : '');
  ing.quantite = r.newQty;
  recette.kcal = r.kcal; recette.proteines = r.p; recette.glucides = r.g; recette.lipides = r.l;
  recette.adapte = true;
  recette.adaptations = (recette.adaptations || []).concat([{ ancien, nouveau: ing.nom }]);
  if (!state.ia) recette.etapes = (recette.etapes || []).map((s) => remplacerMot(s, ancien, p.name));
  saveLocal();
  renderPlan();
  closeScan();
  openRecipe(recette, ctx.di, ctx.mi);
}

// ---------- Suivi de mon plan (adherence) ----------
let suiviPlanDay = 0;
const SUIVI_STATUSES = [
  { k: 'suivi', label: "J'ai suivi mon plan", ic: 'check' },
  { k: 'adapte', label: "J'ai adapte legerement", ic: 'edit' },
  { k: 'autre', label: "J'ai mange autre chose", ic: 'swap' },
  { k: 'saute', label: "J'ai saute ce repas", ic: 'x' },
];
const SUIVI_SCORE = { suivi: 100, adapte: 75, autre: 50, saute: 0 };
const SUIVI_NIVEAU = { suivi: 'coherent', adapte: 'correct', autre: 'reprendre', saute: 'reprendre' };
const NIVEAU_LABEL = { coherent: 'Coherent avec ton objectif', correct: 'Correct, a ajuster', reprendre: 'A reprendre au prochain repas' };
const ADAPTE_CHIPS = ["J'ai change l'accompagnement", "Portion plus grande", "J'ai remplace un aliment", "Mange plus tard que prevu"];
const SAUTE_CHIPS = ['Pas faim', 'Pas le temps', 'Oubli', 'Stress', 'Organisation compliquee', 'Autre'];
const SUIVI_DETAIL = { adapte: { field: 'modif', label: "Qu'as-tu modifie ?", ph: "Ex : j'ai change l'accompagnement", chips: ADAPTE_CHIPS },
  autre: { field: 'repas', label: "Qu'as-tu mange a la place ?", ph: 'Ex : sandwich, salade, repas au restaurant...', chips: null },
  saute: { field: 'raison', label: 'Pourquoi as-tu saute ce repas ?', ph: 'Optionnel', chips: SAUTE_CHIPS } };
function feedbackFor(statut) {
  return ({
    suivi: "Parfait, tu as suivi ton plan sur ce repas. Continue comme ca, la regularite est ce qui cree les resultats.",
    adapte: "Ton adaptation reste coherente avec ton objectif. Garde simplement une source de proteines et une portion de legumes pour rester proche de ton plan.",
    autre: "Ce repas peut arriver. L'important est de ne pas transformer un ecart en abandon — reprends simplement ton plan au prochain repas.",
    saute: "Ce n'est pas grave ponctuellement. Si cela se repete, essaie de prevoir une option simple la prochaine fois. L'objectif est la regularite, pas la perfection.",
  })[statut] || '';
}
function normStatut(s) { return s === 'respecte' ? 'suivi' : (s === 'non' ? 'saute' : s); }
function suiviEntry(di, mi) {
  const e = state.suivi[trackKey(di, mi)];
  if (!e || !e.statut) return null;
  const statut = normStatut(e.statut);
  if (!SUIVI_SCORE.hasOwnProperty(statut)) return null;
  return { statut, detail: e.detail || (e.autre ? { repas: e.autre.repas } : {}) };
}
function dayMeals(di) { return ((state.plan && state.plan.jours[di] && state.plan.jours[di].repas) || []).map((rp, mi) => ({ rp, mi })).filter((x) => !x.rp.exterieur); }
function dayStats(di) {
  const counts = { suivi: 0, adapte: 0, autre: 0, saute: 0 };
  let reported = 0, sum = 0;
  const meals = dayMeals(di);
  meals.forEach(({ mi }) => { const e = suiviEntry(di, mi); if (!e) return; counts[e.statut]++; reported++; sum += SUIVI_SCORE[e.statut]; });
  return { counts, reported, total: meals.length, score: reported ? Math.round(sum / reported) : null };
}
function dayStatusKey(st) {
  if (!st.reported) return 'vide';
  if (st.score >= 75) return 'valide';
  if (st.score >= 50) return 'partiel';
  return 'difficile';
}
const DAY_STATUS_LABEL = { valide: 'Validee', partiel: 'Partielle', difficile: 'Difficile', vide: 'Non renseigne' };
function dailyPhrase(st) {
  if (!st.reported) return 'Indique tes repas du jour pour voir ton suivi.';
  if (st.score >= 75) return 'Bonne journee dans l\'ensemble — tu es reste proche de ton plan.';
  if (st.score >= 50) return 'Journee correcte. Tu peux ameliorer un point demain.';
  return 'Journee plus irreguliere, mais tu peux reprendre demain. L\'objectif est la regularite, pas la perfection.';
}
function mondayThisWeek() { const now = new Date(); const d = (now.getDay() + 6) % 7; const m = new Date(now); m.setDate(now.getDate() - d); return m; }
function dateForDay(di) { const m = mondayThisWeek(); const d = new Date(m); d.setDate(m.getDate() + di); return d.toISOString().slice(0, 10); }
const CRENEAU_LABEL = { 'petit-dejeuner': 'petit-dejeuner', dejeuner: 'dejeuner', collation: 'collation', diner: 'diner' };
function axeAmelioration() {
  const bad = {};
  (state.plan ? state.plan.jours : []).forEach((j, di) => (j.repas || []).forEach((rp, mi) => {
    if (rp.exterieur) return; const e = suiviEntry(di, mi); if (!e) return;
    if (e.statut === 'autre' || e.statut === 'saute') { const c = rp.creneau || rp.label; bad[c] = (bad[c] || 0) + 1; }
  }));
  const worst = Object.entries(bad).sort((a, b) => b[1] - a[1])[0];
  return worst ? (CRENEAU_LABEL[worst[0]] || worst[0]) : null;
}

function openSuiviPlan() {
  if (!state.plan) { alert('Genere d\'abord ton plan de la semaine.'); return; }
  // Le suivi s'ouvre toujours sur la journee actuelle (calculee depuis la date
  // de demarrage du plan, et non sur une hypothese de depart le lundi).
  suiviPlanDay = indexJourActuel();
  $('#suiviPlanPanel').classList.remove('hidden');
  renderSuiviPlan();
}
function closeSuiviPlan() { $('#suiviPlanPanel').classList.add('hidden'); }

// Ouvre le suivi/modification (panneau existant) directement sur un repas precis,
// declenche par le bouton crayon "Modifier" d'une carte repas.
function openSuiviForMeal(di, mi) {
  if (!state.plan) { alert('Genere d\'abord ton plan de la semaine.'); return; }
  suiviPlanDay = Math.min(Math.max(Number(di) || 0, 0), state.plan.jours.length - 1);
  $('#suiviPlanPanel').classList.remove('hidden');
  renderSuiviPlan();
  // Scroll vers le repas concerne + surbrillance breve.
  requestAnimationFrame(() => {
    const body = $('#suiviPlanBody');
    const meals = body ? body.querySelectorAll('.suivi-meal') : [];
    const idx = dayMeals(suiviPlanDay).findIndex((m) => m.mi === mi);
    const target = meals[idx >= 0 ? idx : 0];
    if (target) {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      target.classList.add('suivi-meal-focus');
      setTimeout(() => target.classList.remove('suivi-meal-focus'), 1800);
    }
  });
}

function renderSuiviPlan() {
  const di = suiviPlanDay;
  const jours = state.plan.jours;
  // Bande semaine (selecteur + statut)
  const strip = jours.map((j, i) => {
    const st = dayStats(i); const key = dayStatusKey(st);
    const lbl = (j.jour || ('J' + (i + 1))).slice(0, 3);
    return `<button class="week-day status-${key} ${i === di ? 'cur' : ''}" data-act="day" data-di="${i}"><span class="wd-label">${escapeHtml(lbl)}</span><span class="wd-dot"></span></button>`;
  }).join('');

  // Repas du jour selectionne
  const meals = dayMeals(di).map(({ rp, mi }) => {
    const e = suiviEntry(di, mi);
    const recipeName = rp.recette ? rp.recette.nom : 'Repas libre';
    const opts = SUIVI_STATUSES.map((s) =>
      `<button class="suivi-opt opt-${s.k} ${e && e.statut === s.k ? 'on' : ''}" data-act="status" data-mi="${mi}" data-k="${s.k}">${icSvg(s.ic)} ${s.label}</button>`).join('');
    let detailHtml = '';
    if (e && SUIVI_DETAIL[e.statut]) {
      const cfg = SUIVI_DETAIL[e.statut];
      const val = (e.detail && e.detail[cfg.field]) || '';
      const chips = cfg.chips ? `<div class="suivi-chips">${cfg.chips.map((c) =>
        `<button class="suivi-chip ${val === c ? 'on' : ''}" data-act="chip" data-mi="${mi}" data-field="${cfg.field}" data-val="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}</div>` : '';
      detailHtml = `<div class="suivi-detail"><label>${cfg.label}</label>${chips}
        <input type="text" data-detail="${cfg.field}" data-mi="${mi}" value="${escapeHtml(val)}" placeholder="${escapeHtml(cfg.ph)}"></div>`;
    }
    const fb = e ? `<div class="suivi-feedback niveau-${SUIVI_NIVEAU[e.statut]}"><span class="suivi-niveau">${NIVEAU_LABEL[SUIVI_NIVEAU[e.statut]]}</span><p>${feedbackFor(e.statut)}</p></div>` : '';
    return `<div class="suivi-meal">
      <div class="suivi-meal-head"><span class="suivi-meal-label">${escapeHtml(rp.label || rp.creneau || 'Repas')}</span><span class="suivi-meal-recipe">${escapeHtml(recipeName)}</span></div>
      <div class="suivi-opts">${opts}</div>${detailHtml}${fb}</div>`;
  }).join('');

  const st = dayStats(di);
  const key = dayStatusKey(st);
  const scoreCard = `<div class="suivi-day-score score-${key}">
    <div class="sds-ring">${st.score != null ? st.score + '%' : '—'}</div>
    <div class="sds-txt"><strong>${dailyPhrase(st)}</strong>
      <span>${st.reported}/${st.total} repas renseignes${st.reported ? ' · ' + st.counts.suivi + ' suivi(s), ' + st.counts.adapte + ' adapte(s), ' + st.counts.autre + ' autre(s), ' + st.counts.saute + ' saute(s)' : ''}</span></div>
  </div>`;

  // Resume semaine
  const wk = jours.map((j, i) => dayStatusKey(dayStats(i)));
  const nb = (k) => wk.filter((x) => x === k).length;
  const axe = axeAmelioration();
  const weekTxt = `Cette semaine : ${nb('valide')} jour(s) bien suivi(s), ${nb('partiel')} partiel(s), ${nb('difficile')} difficile(s), ${nb('vide')} non renseigne(s).` + (axe ? ` Ton principal axe : la regularite au ${axe}.` : ' Continue, la regularite paie.');

  $('#suiviPlanBody').innerHTML = `
    <div class="week-strip">${strip}</div>
    <h3 class="suivi-day-title">${escapeHtml(jours[di].jour || ('Jour ' + (di + 1)))}${(jourActuelDansPlan() && di === indexJourActuel()) ? '<span class="day-now">Jour en cours</span>' : ''}</h3>
    ${meals || '<p class="help-empty">Aucun repas ce jour-la.</p>'}
    ${scoreCard}
    <button type="button" class="btn btn-primary btn-lg" data-act="save" style="width:100%"><svg class="ic"><use href="#ic-check-circle"/></svg> Enregistrer mon suivi</button>
    <div class="suivi-week"><h3><svg class="ic"><use href="#ic-trend"/></svg> Ma semaine nutrition</h3><p class="week-summary">${escapeHtml(weekTxt)}</p></div>
    <button type="button" class="btn btn-outline is-soon" data-act="plate" style="width:100%;margin-top:10px"><svg class="ic"><use href="#ic-camera"/></svg> J'ai mange autre chose — analyser mon assiette<span class="soon-badge">Bientôt</span></button>
    <button type="button" class="btn btn-outline" data-act="help" style="width:100%;margin-top:8px"><svg class="ic"><use href="#ic-life-buoy"/></svg> J'ai besoin d'aide sur mon alimentation cette semaine</button>`;
}
function setSuiviPlanStatus(di, mi, statut) {
  const key = trackKey(di, mi);
  const cur = state.suivi[key] || {};
  if (normStatut(cur.statut) === statut) { delete state.suivi[key]; } // re-clic = annule
  else { state.suivi[key] = { statut, detail: cur.detail || (cur.autre ? { repas: cur.autre.repas } : {}) }; }
  saveLocal(); renderSuiviPlan(); renderPlan();
}
function setSuiviDetail(di, mi, field, value, rerender) {
  const key = trackKey(di, mi);
  const e = state.suivi[key]; if (!e) return;
  e.detail = e.detail || {}; e.detail[field] = value;
  saveLocal();
  if (rerender) renderSuiviPlan();
}
async function saveSuiviDay(di, btn) {
  const st = dayStats(di);
  if (btn) { btn.disabled = true; }
  if (isDemo()) { // démo : suivi garde en local, rien envoye au serveur
    if (btn) { btn.innerHTML = 'Suivi enregistre ✓'; setTimeout(() => { btn.disabled = false; renderSuiviPlan(); }, 1400); }
    return;
  }
  try {
    await fetch(apiUrl('/api/adherence'), { method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ clientName: helpClientName(), date: dateForDay(di), suivi: st.counts.suivi, adapte: st.counts.adapte, autre: st.counts.autre, saute: st.counts.saute, score: st.score || 0 }) });
    if (btn) { btn.innerHTML = 'Suivi enregistre ✓'; setTimeout(() => { btn.disabled = false; renderSuiviPlan(); }, 1400); }
  } catch (e) { if (btn) { btn.disabled = false; } alert("L'enregistrement n'a pas fonctionne, mais ton suivi reste garde sur l'appareil."); }
}
function onSuiviPlanClick(e) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act;
  if (act === 'day') { suiviPlanDay = Number(b.dataset.di); renderSuiviPlan(); }
  else if (act === 'status') setSuiviPlanStatus(suiviPlanDay, Number(b.dataset.mi), b.dataset.k);
  else if (act === 'chip') setSuiviDetail(suiviPlanDay, Number(b.dataset.mi), b.dataset.field, b.dataset.val, true);
  else if (act === 'save') saveSuiviDay(suiviPlanDay, b);
  else if (act === 'help') { closeSuiviPlan(); openHelp(); }
  else if (act === 'plate') { closeSuiviPlan(); openPlate(); }
}
function onSuiviPlanInput(e) {
  const t = e.target.closest('[data-detail]'); if (!t) return;
  setSuiviDetail(suiviPlanDay, Number(t.dataset.mi), t.dataset.detail, t.value, false);
}

// --- Vue coach : adherence des clients ---
const ADH_STATUT = { ok: 'OK', a_surveiller: 'A surveiller', besoin_aide: 'Besoin d\'aide' };
async function openAdhAdmin() { $('#adhAdminPanel').classList.remove('hidden'); await renderAdhAdmin(); }
function closeAdhAdmin() { $('#adhAdminPanel').classList.add('hidden'); }
function updateAdhBadge(clients) {
  const n = (clients || []).filter((c) => c.statut !== 'ok').length;
  const b = $('#adhAdminBadge'); if (!b) return; b.textContent = n; b.classList.toggle('hidden', n === 0);
}
async function renderAdhAdmin() {
  const body = $('#adhAdminBody'); body.innerHTML = '<p class="panel-sub">Chargement…</p>';
  try {
    const res = await fetch(apiUrl('/api/adherence/coach'), { headers: nutriAuthHeaders() });
    const data = await res.json(); if (!data.ok) throw new Error();
    const clients = data.clients || []; updateAdhBadge(clients);
    if (!clients.length) { body.innerHTML = '<p class="help-empty">Aucun suivi client pour le moment.</p>'; return; }
    body.innerHTML = clients.map((c) => {
      const alerts = (c.alerts || []).map((a) => `<span class="adh-alert">${escapeHtml(a)}</span>`).join('');
      return `<div class="adh-client statut-${c.statut}">
        <div class="adh-head"><strong>${escapeHtml(c.clientName)}</strong><span class="adh-statut statut-${c.statut}">${ADH_STATUT[c.statut] || c.statut}</span></div>
        <div class="adh-row"><span class="adh-score">${c.days ? c.score + '%' : '—'}</span>
          <span class="adh-counts">${c.suivi} suivi · ${c.adapte} adapte · ${c.autre} autre · ${c.saute} saute</span></div>
        ${alerts ? `<div class="adh-alerts">${alerts}</div>` : ''}
        ${c.lastHelp ? `<div class="adh-help">${icSvg('life-buoy')} Aide : ${escapeHtml((c.lastHelp.difficultes || []).slice(0, 3).join(', ') || 'demande recue')}</div>` : ''}
      </div>`;
    }).join('');
  } catch (e) { body.innerHTML = '<p class="help-empty">Lecture impossible. Reessaie.</p>'; }
}
async function setupAdhAccess() {
  if (!isCoachOrAdmin()) return;
  const card = $('#btnAdhAdmin'); if (card) card.classList.remove('hidden');
  try { const res = await fetch(apiUrl('/api/adherence/coach'), { headers: nutriAuthHeaders() }); const data = await res.json(); if (data.ok) updateAdhBadge(data.clients || []); } catch (_) { /* ignore */ }
}

// ---------- Analyser mon assiette en photo (Claude vision) ----------
let plateImage = null;   // image compressee envoyee a l'analyse
let plateThumb = null;   // miniature pour le suivi coach
let plateBase = null;    // estimation IA de base (avant ajustements)
let plateAdj = { portion: 'normale' };
let platePrecisionUsed = '';
const PLATE_PORTION = { petite: 0.78, normale: 1, genereuse: 1.28 };

function plateShowStage(s) {
  ['Input', 'Loading', 'Error', 'Result'].forEach((x) => $('#plateStage' + x).classList.toggle('hidden', x.toLowerCase() !== s));
}
function planContextStr() {
  if (!state.plan || !state.plan.jours[0]) return '';
  const noms = (state.plan.jours[0].repas || []).filter((rp) => rp.recette).map((rp) => rp.recette.nom);
  return noms.length ? 'Plats prevus aujourd\'hui : ' + noms.slice(0, 4).join(', ') : '';
}
function plateMealLabel() {
  const h = new Date().getHours();
  if (h < 11) return 'Petit-dejeuner'; if (h < 15) return 'Dejeuner'; if (h < 18) return 'Collation'; return 'Diner';
}
function cohClass(n) { return n === 'coherent' ? 'compatible' : (n === 'reprendre' ? 'a_eviter' : 'moderation'); }

// Petit toast premium (message bref auto-disparaissant en bas de l'ecran).
function showToast(msg, opts) {
  opts = opts || {};
  let t = document.getElementById('mcToast');
  if (!t) { t = document.createElement('div'); t.id = 'mcToast'; t.className = 'mc-toast'; document.body.appendChild(t); }
  t.innerHTML = `<span class="mc-toast-ic">${icSvg(opts.icon || 'clock')}</span><span>${escapeHtml(msg)}</span>`;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), opts.duration || 3400);
}

function openPlate() {
  // Fonctionnalite "Analyser mon assiette" en cours de developpement : on informe
  // l'utilisateur via un toast propre et on n'ouvre pas (encore) le module.
  showToast('Cette fonctionnalité est en cours de développement et sera bientôt disponible.');
  return;
  plateImage = null; plateThumb = null; plateBase = null; plateAdj = { portion: 'normale' }; platePrecisionUsed = '';
  $('#platePreview').classList.add('hidden'); $('#plateDropEmpty').classList.remove('hidden');
  $('#platePrecision').value = ''; $('#plateAnalyze').disabled = true; $('#plateFile').value = '';
  $('#plateModal').classList.remove('hidden');
  if (!state.ia) {
    plateShowStage('error');
    $('#plateErrorBox').innerHTML = "L'analyse d'assiette en photo necessite le Mode Claude, qui n'est pas active pour le moment. Ton coach peut l'activer.";
    $('#plateRetry').style.display = 'none';
    return;
  }
  $('#plateRetry').style.display = ''; plateShowStage('input');
}
function closePlate() { $('#plateModal').classList.add('hidden'); }

// Compresse une image (canvas) -> data URL JPEG, pour limiter upload et cout.
function compressImage(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w > h && w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; }
      else if (h >= w && h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize; }
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(cv.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
}
async function onPlateFile(e) {
  const file = e.target.files && e.target.files[0]; if (!file) return;
  try {
    plateImage = await compressImage(file, 1024, 0.72);
    plateThumb = await compressImage(file, 480, 0.5);
    const img = $('#platePreview'); img.src = plateImage; img.classList.remove('hidden');
    $('#plateDropEmpty').classList.add('hidden'); $('#plateAnalyze').disabled = false;
  } catch (_) { alert('Impossible de lire cette image, essaie-en une autre.'); }
}
function plateError(html, allowRetry) {
  plateShowStage('error'); $('#plateErrorBox').innerHTML = html; $('#plateRetry').style.display = allowRetry ? '' : 'none';
}
async function analyzePlate() {
  if (!plateImage) return;
  platePrecisionUsed = $('#platePrecision').value.trim();
  plateShowStage('loading');
  try {
    const res = await fetch(apiUrl('/api/plate-analyze'), {
      method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ imageDataUrl: plateImage, precision: platePrecisionUsed, objectif: state.profil && state.profil.objectif, planContext: planContextStr() }),
    });
    const data = await res.json();
    if (!data.ia) return plateError("L'analyse d'assiette necessite le Mode Claude (a activer par ton coach).", false);
    if (!data.ok || !data.analyse) return plateError("L'analyse n'a pas pu etre realisee. Reessaie dans quelques instants.", true);
    if (data.analyse.lisible === false) return plateError("Je n'arrive pas a identifier clairement ton repas. Reprends une photo plus nette, ou ajoute une precision en texte.", true);
    plateBase = data.analyse; plateAdj = { portion: 'normale' };
    renderPlateResult();
  } catch (e) { plateError("L'analyse n'a pas pu etre realisee. Reessaie dans quelques instants.", true); }
}
function plateAdjusted() {
  const b = plateBase; const f = PLATE_PORTION[plateAdj.portion] || 1;
  let k = b.kcal * f, p = b.proteines * f, g = b.glucides * f, l = b.lipides * f;
  if (plateAdj.sauce) { k += 110; l += 12; }
  if (plateAdj.boisson) { k += 90; g += 21; }
  if (plateAdj.dessert) { k += 190; g += 28; l += 6; p += 3; }
  return { kcal: Math.round(k), proteines: Math.round(p), glucides: Math.round(g), lipides: Math.round(l) };
}
function renderPlateResult() {
  const b = plateBase, m = plateAdjusted();
  const portChip = (v, lbl) => `<button class="plate-chip ${(plateAdj.portion || 'normale') === v ? 'on' : ''}" data-pport="${v}">${lbl}</button>`;
  const addChip = (k, lbl) => `<button class="plate-chip ${plateAdj[k] ? 'on' : ''}" data-padd="${k}">${lbl}</button>`;
  $('#plateResultBody').innerHTML = `
    <h2 class="scan-title"><svg class="ic"><use href="#ic-spark"/></svg> Estimation de ton assiette</h2>
    ${b.aliments && b.aliments.length ? `<div class="scan-allerg"><span class="scan-allerg-label">Detecte</span> ${b.aliments.slice(0, 8).map((a) => `<span class="help-tag">${escapeHtml(a)}</span>`).join('')}</div>` : ''}
    <div class="plate-macros">
      <div class="pm pm-kcal"><span class="pm-v">${m.kcal}</span><span class="pm-l">kcal estimees</span></div>
      <div class="pm"><span class="pm-v">${m.proteines} g</span><span class="pm-l">Proteines</span></div>
      <div class="pm"><span class="pm-v">${m.glucides} g</span><span class="pm-l">Glucides</span></div>
      <div class="pm"><span class="pm-v">${m.lipides} g</span><span class="pm-l">Lipides</span></div>
    </div>
    <p class="help-disclaimer">Estimation visuelle a utiliser comme repere. Les quantites peuvent varier selon les portions, la cuisson et les ingredients.</p>
    <div class="plate-adjust">
      <label>Cette estimation te semble correcte ? Ajuste si besoin :</label>
      <div class="plate-chips">${portChip('petite', 'Portion petite')}${portChip('normale', 'Portion normale')}${portChip('genereuse', 'Portion genereuse')}</div>
      <div class="plate-chips">${addChip('sauce', 'Sauce / huile')}${addChip('boisson', 'Boisson')}${addChip('dessert', 'Dessert')}</div>
    </div>
    <div class="coherence coherence-${cohClass(b.niveau)}">
      <strong>${NIVEAU_LABEL[b.niveau] || NIVEAU_LABEL.correct}</strong>
      ${b.coherencePlan ? `<p>${escapeHtml(b.coherencePlan)}</p>` : ''}
    </div>
    ${b.pointPositif ? `<div class="plate-coach"><span class="pc-l">Point positif</span><p>${escapeHtml(b.pointPositif)}</p></div>` : ''}
    ${b.axe ? `<div class="plate-coach"><span class="pc-l">A ameliorer</span><p>${escapeHtml(b.axe)}</p></div>` : ''}
    ${b.action ? `<div class="plate-coach pc-action"><span class="pc-l">Au prochain repas</span><p>${escapeHtml(b.action)}</p></div>` : ''}
    <label class="field" style="margin:6px 0 10px"><span>Un mot pour ton coach (optionnel)</span><textarea id="plateCoachMsg" rows="2"></textarea></label>
    <div class="scan-actions">
      <button type="button" class="btn btn-outline" id="plateSave"><svg class="ic"><use href="#ic-check"/></svg> Enregistrer</button>
      <button type="button" class="btn btn-primary" id="plateAskCoach"><svg class="ic"><use href="#ic-heart-hand"/></svg> Demander l'avis de mon coach</button>
    </div>
    <button type="button" class="btn btn-ghost btn-sm" id="plateAnother" style="width:100%;margin-top:8px"><svg class="ic"><use href="#ic-camera"/></svg> Analyser une autre assiette</button>`;
  plateShowStage('result');
  $$('#plateResultBody [data-pport]').forEach((b2) => b2.addEventListener('click', () => { plateAdj.portion = b2.dataset.pport; renderPlateResult(); }));
  $$('#plateResultBody [data-padd]').forEach((b2) => b2.addEventListener('click', () => { plateAdj[b2.dataset.padd] = !plateAdj[b2.dataset.padd]; renderPlateResult(); }));
  $('#plateSave').addEventListener('click', () => savePlate(false, $('#plateSave')));
  $('#plateAskCoach').addEventListener('click', () => savePlate(true, $('#plateAskCoach')));
  $('#plateAnother').addEventListener('click', openPlate);
}
async function savePlate(askCoach, btn) {
  const b = plateBase, m = plateAdjusted();
  const msg = ($('#plateCoachMsg') && $('#plateCoachMsg').value.trim()) || '';
  if (btn) btn.disabled = true;
  if (isDemo()) { if (btn) btn.innerHTML = askCoach ? 'Demande envoyee (demo) ✓' : 'Enregistre (demo) ✓'; return; }
  try {
    const res = await fetch(apiUrl('/api/plate-save'), {
      method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ clientName: helpClientName(), mealLabel: plateMealLabel(), precision: platePrecisionUsed, aliments: b.aliments,
        kcal: m.kcal, proteines: m.proteines, glucides: m.glucides, lipides: m.lipides, coherence: b.niveau,
        pointPositif: b.pointPositif, axe: b.axe, action: b.action, coherencePlan: b.coherencePlan,
        thumb: plateThumb, askCoach: !!askCoach, clientMessage: msg }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error();
    if (btn) btn.innerHTML = askCoach ? 'Demande envoyee a ton coach ✓' : 'Enregistre dans ton suivi ✓';
  } catch (e) { if (btn) btn.disabled = false; alert("L'enregistrement n'a pas fonctionne. Reessaie."); }
}

// --- Vue coach : analyses d'assiettes ---
async function openPlateAdmin() { $('#plateAdminPanel').classList.remove('hidden'); await renderPlateAdmin(); }
function closePlateAdmin() { $('#plateAdminPanel').classList.add('hidden'); }
function updatePlateBadge(items) { const n = (items || []).filter((i) => i.adviceStatut === 'a_traiter').length; const b = $('#plateAdminBadge'); if (!b) return; b.textContent = n; b.classList.toggle('hidden', n === 0); }
async function renderPlateAdmin() {
  const body = $('#plateAdminBody'); body.innerHTML = '<p class="panel-sub">Chargement…</p>';
  try {
    const res = await fetch(apiUrl('/api/plate-analyses'), { headers: nutriAuthHeaders() });
    const data = await res.json(); if (!data.ok) throw new Error();
    const items = data.items || []; updatePlateBadge(items);
    if (!items.length) { body.innerHTML = '<p class="help-empty">Aucune analyse d\'assiette pour le moment.</p>'; return; }
    body.innerHTML = items.map((it) => {
      const d = new Date(it.createdAt);
      const ds = isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const badge = it.adviceStatut ? `<span class="help-status-badge statut-${it.adviceStatut}">${HELP_STATUS[it.adviceStatut] || it.adviceStatut}</span>` : '';
      const adv = it.adviceStatut ? `<label class="help-status-set">Avis <select data-plate-id="${it.id}">${Object.entries(HELP_STATUS).map(([k, l]) => `<option value="${k}" ${it.adviceStatut === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : '';
      return `<div class="plate-req">
        <div class="plate-req-top">
          ${it.thumb ? `<img class="plate-req-thumb" src="${escapeHtml(it.thumb)}" alt="" loading="lazy">` : ''}
          <div class="plate-req-info">
            <div class="help-req-head"><strong>${escapeHtml(it.clientName)}</strong>${badge}</div>
            <div class="help-req-date">${ds}${it.mealLabel ? ' · ' + escapeHtml(it.mealLabel) : ''}</div>
            <div class="plate-req-macros">${it.kcal} kcal · ${it.proteines}P · ${it.glucides}G · ${it.lipides}L ${cohBadge(cohClass(it.coherence))}</div>
          </div>
        </div>
        ${it.aliments && it.aliments.length ? `<div class="help-req-tags">${it.aliments.slice(0, 6).map((a) => `<span class="help-tag">${escapeHtml(a)}</span>`).join('')}</div>` : ''}
        ${it.clientMessage ? `<p class="help-req-msg">${escapeHtml(it.clientMessage)}</p>` : ''}
        ${adv}
      </div>`;
    }).join('');
    $$('#plateAdminBody select[data-plate-id]').forEach((sel) => sel.addEventListener('change', () => setPlateStatus(sel.dataset.plateId, sel.value)));
  } catch (e) { body.innerHTML = '<p class="help-empty">Lecture impossible. Reessaie.</p>'; }
}
async function setPlateStatus(id, statut) {
  try { await fetch(apiUrl('/api/plate-advice/' + id), { method: 'PATCH', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ statut }) }); await renderPlateAdmin(); } catch (_) { /* ignore */ }
}
async function setupPlateAccess() {
  if (!isCoachOrAdmin()) return;
  const c = $('#btnPlateAdmin'); if (c) c.classList.remove('hidden');
  try { const res = await fetch(apiUrl('/api/plate-analyses'), { headers: nutriAuthHeaders() }); const data = await res.json(); if (data.ok) updatePlateBadge(data.items || []); } catch (_) { /* ignore */ }
}

// ---------- Mode démonstration client ----------
function isMainAdmin() { const u = mainAppUser(); return !!u && u.role === 'admin'; }

// Active la bannière + actions du mode démo (appelé au boot si isDemo()).
function setupDemoMode() {
  if (!isDemo()) return;
  document.body.classList.add('is-demo');
  // Le bandeau du bas est masque (CSS) pour une lecture plein ecran ; ses actions
  // (Recommencer / Quitter) sont reprises dans l'ecran Profil > "Demonstration".
  $$('#view-profil .profil-demo').forEach((el) => el.classList.remove('hidden'));
  const isClient = !!window.__NUTRI_USER; // vrai compte client (vs simple démo coach)
  const restart = $('#demoRestart');
  if (restart) {
    if (isClient) restart.textContent = 'Réinitialiser mon plan';
    restart.addEventListener('click', () => {
      const msg = isClient
        ? 'Réinitialiser ton plan et refaire le questionnaire ? Tes réponses actuelles seront effacées.'
        : 'Recommencer la demo depuis le debut ? Les donnees de demo seront effacees.';
      if (!confirm(msg)) return;
      try { localStorage.removeItem(STORE_KEY); localStorage.removeItem(SCAN_FAV_KEY); } catch (_) { /* ignore */ }
      // Compte client : on vide aussi la copie serveur pour repartir sur l'onboarding.
      if (isClient) pushAccountSave({});
      location.reload();
    });
  }
  const quit = $('#demoQuit');
  if (quit) {
    if (isClient) quit.textContent = 'Se déconnecter';
    quit.addEventListener('click', () => {
      if (!confirm(isClient ? 'Se déconnecter de ton espace ?' : 'Quitter le mode demo ?')) return;
      try {
        localStorage.removeItem('mc-nutri-demo');
        if (window.__NUTRI_USER && window.__NUTRI_USER.email) {
          localStorage.removeItem('mc-nutri-state-' + window.__NUTRI_USER.email);
        }
        localStorage.removeItem('mc-nutri-account');
      } catch (_) { /* ignore */ }
      location.reload();
    });
  }
  const ds = $('#demoStart');
  if (ds) ds.addEventListener('click', () => showScreen('landing'));
}

// --- Gestion du code démo (administrateur principal) ---
function openDemoAdmin() { $('#demoAdminPanel').classList.remove('hidden'); renderDemoAdmin(); }
function closeDemoAdmin() { $('#demoAdminPanel').classList.add('hidden'); }
async function renderDemoAdmin() {
  const body = $('#demoAdminBody');
  body.innerHTML = '<p class="panel-sub">Chargement…</p>';
  try {
    const res = await fetch(apiUrl('/api/demo-config'), { headers: nutriAuthHeaders() });
    const d = await res.json();
    if (!d.ok) throw new Error();
    const accesses = (d.accesses || []).map((a) => {
      const dt = new Date(a); return isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) + ' ' + dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }).filter(Boolean);
    body.innerHTML = `
      <div class="demo-admin-code">
        <label>Code de demonstration</label>
        <input type="text" id="demoCfgCode" value="${escapeHtml(d.code)}" autocomplete="off">
        <button type="button" class="link-copy" id="demoCfgCopy">Copier</button>
      </div>
      <label class="demo-toggle"><input type="checkbox" id="demoCfgEnabled" ${d.enabled ? 'checked' : ''}> Mode demo active</label>
      <label class="field"><span>Date d'expiration (optionnel)</span>
        <input type="date" id="demoCfgExpires" value="${escapeHtml(d.expiresAt || '')}"></label>
      <div class="demo-stats">
        <div class="demo-stat"><strong>${d.uses}</strong><span>acces au total</span></div>
        <div class="demo-stat"><strong>${accesses.length}</strong><span>recents</span></div>
      </div>
      ${accesses.length ? `<div class="demo-accesses"><label>Derniers acces</label>${accesses.map((a) => `<span class="demo-access">${a}</span>`).join('')}</div>` : ''}
      <button type="button" class="btn btn-primary btn-lg" id="demoCfgSave" style="width:100%;margin-top:6px"><svg class="ic"><use href="#ic-check"/></svg> Enregistrer</button>
      <button type="button" class="btn btn-outline" id="demoCfgReset" style="width:100%;margin-top:8px"><svg class="ic"><use href="#ic-refresh"/></svg> Reinitialiser les statistiques demo</button>`;
    $('#demoCfgCopy').addEventListener('click', () => { try { navigator.clipboard.writeText($('#demoCfgCode').value); $('#demoCfgCopy').textContent = 'Copie ✓'; } catch (_) {} });
    $('#demoCfgSave').addEventListener('click', saveDemoConfig);
    $('#demoCfgReset').addEventListener('click', resetDemoData);
  } catch (e) { body.innerHTML = '<p class="help-empty">Lecture impossible.</p>'; }
}
async function saveDemoConfig() {
  const code = $('#demoCfgCode').value.trim();
  if (!code) { alert('Le code ne peut pas etre vide.'); return; }
  const btn = $('#demoCfgSave'); btn.disabled = true;
  try {
    const res = await fetch(apiUrl('/api/demo-config'), { method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ code, enabled: $('#demoCfgEnabled').checked, expiresAt: $('#demoCfgExpires').value || null }) });
    const d = await res.json();
    if (!d.ok) throw new Error();
    btn.innerHTML = 'Enregistre ✓'; setTimeout(() => { btn.disabled = false; btn.innerHTML = '<svg class="ic"><use href="#ic-check"/></svg> Enregistrer'; }, 1400);
  } catch (e) { btn.disabled = false; alert("L'enregistrement n'a pas fonctionne."); }
}
async function resetDemoData() {
  if (!confirm('Reinitialiser les statistiques du mode demo (compteur d\'acces) ?')) return;
  try { await fetch(apiUrl('/api/demo-reset'), { method: 'POST', headers: nutriAuthHeaders() }); renderDemoAdmin(); } catch (_) { /* ignore */ }
}
function setupDemoAdminAccess() {
  if (!isMainAdmin()) return;
  const card = $('#btnDemoAdmin'); if (card) card.classList.remove('hidden');
}

// ---------- Clients inscrits (vue administrateur) ----------
function openClientsAdmin() { $('#clientsAdminPanel').classList.remove('hidden'); renderClientsAdmin(); }
function closeClientsAdmin() { $('#clientsAdminPanel').classList.add('hidden'); }
async function renderClientsAdmin() {
  const body = $('#clientsAdminBody');
  body.innerHTML = '<p class="panel-sub">Chargement…</p>';
  try {
    const res = await fetch(apiUrl('/api/clients'), { headers: nutriAuthHeaders() });
    const d = await res.json();
    if (!d.ok) throw new Error();
    const clients = d.clients || [];
    if (!clients.length) { body.innerHTML = '<p class="help-empty">Aucun client inscrit pour le moment.</p>'; return; }
    const OBJ = { perte: 'Perte de poids', maintien: 'Maintien', muscle: 'Prise de masse', energie: 'Énergie' };
    const fmt = (s) => { const dt = new Date(s); return isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' }); };
    const rows = clients.map((c) => {
      const nom = [c.prenom, c.nom].filter(Boolean).join(' ') || '(sans nom)';
      const obj = c.objectif ? (OBJ[c.objectif] || c.objectif) : '—';
      const etat = c.hasPlan
        ? '<span style="display:inline-block;padding:1px 8px;border-radius:999px;background:rgba(47,123,255,.18);color:#7FB0FF;font-weight:600;">Plan actif</span>'
        : '<span style="display:inline-block;padding:1px 8px;border-radius:999px;background:rgba(255,255,255,.08);color:#9AA0A6;">Sans plan</span>';
      return `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.08);">
        <div style="min-width:0;">
          <div style="font-weight:700;">${escapeHtml(nom)}</div>
          <div style="font-size:12.5px;color:#8B94A3;word-break:break-all;">${escapeHtml(c.email)}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;font-size:12px;color:#8B94A3;line-height:1.7;">
          <div>${etat}</div>
          <div>${escapeHtml(obj)}</div>
          <div>Inscrit le ${fmt(c.createdAt)}</div>
        </div>
      </div>`;
    }).join('');
    const emails = clients.map((c) => c.email).join(', ');
    body.innerHTML = `
      <div style="margin:0 0 10px;font-size:14px;"><strong style="font-size:20px;">${d.total}</strong> client${d.total > 1 ? 's' : ''} inscrit${d.total > 1 ? 's' : ''}</div>
      <button type="button" class="btn btn-outline" id="clientsCopyEmails" style="width:100%;margin:0 0 12px">Copier tous les emails</button>
      <div>${rows}</div>`;
    const cp = $('#clientsCopyEmails');
    if (cp) cp.addEventListener('click', () => { try { navigator.clipboard.writeText(emails); cp.textContent = 'Copié ✓'; setTimeout(() => { cp.textContent = 'Copier tous les emails'; }, 1400); } catch (_) { /* ignore */ } });
  } catch (e) { body.innerHTML = '<p class="help-empty">Lecture impossible.</p>'; }
}
function setupClientsAdminAccess() {
  if (!isMainAdmin()) return;
  const card = $('#btnClientsAdmin'); if (card) card.classList.remove('hidden');
}

// ---------- Google Agenda ----------
// Identifiant stable du plan (pour l'anti-doublon cote Google) : derive du contenu.
function planIdFor(plan) {
  const s = ((plan && plan.jours) || []).map((j) => (j.repas || []).map((rp) => (rp.recette && rp.recette.id) || '').join('-')).join('|');
  let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
  return 'p' + h.toString(36);
}
function openAgenda() {
  if (!state.plan) { alert('Genere d\'abord ton plan de la semaine.'); return; }
  $('#agendaModal').classList.remove('hidden');
  $('#agendaBody').innerHTML = '<div class="scan-loader"></div><p class="scan-loading-text">Verification de la connexion…</p>';
  refreshAgenda();
}
function closeAgenda() { $('#agendaModal').classList.add('hidden'); }
async function refreshAgenda() {
  let status = { configured: false, connected: false };
  let fetchError = false;
  try {
    const r = await fetch(apiUrl('/api/google/status'), { headers: nutriAuthHeaders() });
    const d = await r.json();
    if (d && d.ok) status = d; else fetchError = true;
  } catch (_) { fetchError = true; }
  renderAgenda(status, { fetchError });
}
function renderAgenda(status, opts) {
  opts = opts || {};
  // Erreur de verification du statut : on ne laisse jamais l'utilisateur sans retour.
  if (opts.fetchError) {
    $('#agendaBody').innerHTML = `
      <h2 class="scan-title"><svg class="ic"><use href="#ic-calendar"/></svg> Agenda</h2>
      <p class="agenda-msg agenda-warn">Impossible de verifier l'etat de votre agenda pour le moment. Verifiez votre connexion, puis reessayez.</p>
      <button type="button" class="btn btn-outline" id="agendaRetry" style="width:100%">Reessayer</button>
      <button type="button" class="btn btn-ghost" id="agendaIcs" style="width:100%;margin-top:8px"><svg class="ic"><use href="#ic-file"/></svg> Telecharger le fichier calendrier (.ics)</button>`;
    $('#agendaRetry').addEventListener('click', () => { $('#agendaBody').innerHTML = '<div class="scan-loader"></div><p class="scan-loading-text">Verification de la connexion…</p>'; refreshAgenda(); });
    $('#agendaIcs').addEventListener('click', () => { exportIcs(); $('#agendaIcs').innerHTML = 'Fichier telecharge ✓'; });
    return;
  }
  const icsBtn = '<button type="button" class="btn btn-ghost" id="agendaIcs" style="width:100%;margin-top:8px"><svg class="ic"><use href="#ic-file"/></svg> Telecharger le fichier calendrier (.ics)</button>';
  const privacy = '<p class="help-disclaimer">My Coach Nutrition utilise cette connexion uniquement pour ajouter tes repas a ton agenda.</p>';
  if (status.connected) {
    $('#agendaBody').innerHTML = `
      <h2 class="scan-title"><svg class="ic"><use href="#ic-calendar"/></svg> Google Agenda connecte</h2>
      <p class="agenda-state"><span class="agenda-dot on"></span> Connecte${status.calendarName ? ` · calendrier « ${escapeHtml(status.calendarName)} »` : ''}.</p>
      <p class="panel-sub">Que souhaites-tu ajouter a ton agenda ?</p>
      <div class="agenda-choices">
        <button type="button" class="btn btn-outline agenda-sync" data-scope="jour">Ajouter le plan du jour</button>
        <button type="button" class="btn btn-primary agenda-sync" data-scope="semaine">Ajouter toute la semaine</button>
        <button type="button" class="btn btn-outline agenda-sync" data-scope="rappels">Ajouter les rappels principaux</button>
      </div>
      <p id="agendaSyncMsg" class="agenda-msg"></p>
      ${privacy}
      <button type="button" class="btn btn-ghost btn-sm" id="agendaDisconnect" style="width:100%">Deconnecter Google Agenda</button>
      ${icsBtn}`;
    $$('#agendaBody .agenda-sync').forEach((b) => b.addEventListener('click', () => syncAgenda(b.dataset.scope, b)));
    $('#agendaDisconnect').addEventListener('click', disconnectAgenda);
  } else if (!status.configured) {
    // Connexion directe pas encore activee cote serveur (identifiants Google absents).
    // On n'affiche PAS de bouton "Connecter" inactif (un clic sans effet trouble
    // l'utilisateur) : on met en avant le fichier .ics, qui fonctionne tout de suite.
    $('#agendaBody').innerHTML = `
      <h2 class="scan-title"><svg class="ic"><use href="#ic-calendar"/></svg> Ajouter a mon agenda</h2>
      <p class="panel-sub">Ajoute ton plan alimentaire a ton agenda en un clic.</p>
      <p class="agenda-state"><span class="agenda-dot off"></span> La connexion directe Google Agenda n'est pas encore activee.</p>
      <p class="agenda-msg agenda-warn">La connexion automatique a Google Agenda arrive bientot. En attendant, telecharge le fichier calendrier ci-dessous : il s'ajoute en un clic a Google Agenda, Apple Calendrier ou Outlook.</p>
      <button type="button" class="btn btn-primary btn-lg" id="agendaIcs" style="width:100%"><svg class="ic"><use href="#ic-file"/></svg> Telecharger le fichier calendrier (.ics)</button>
      ${privacy}`;
  } else {
    $('#agendaBody').innerHTML = `
      <h2 class="scan-title"><svg class="ic"><use href="#ic-calendar"/></svg> Ajouter a Google Agenda</h2>
      <p class="panel-sub">Ajoute ton plan alimentaire directement dans Google Agenda, sans telecharger de fichier.</p>
      <p class="agenda-state"><span class="agenda-dot off"></span> Ton Google Agenda n'est pas encore connecte.</p>
      <button type="button" class="btn btn-primary btn-lg" id="agendaConnect" style="width:100%"><svg class="ic"><use href="#ic-calendar"/></svg> Connecter Google Agenda</button>
      <p class="agenda-msg" id="agendaConnectMsg"></p>
      ${privacy}
      ${icsBtn}`;
    const cb = $('#agendaConnect'); if (cb) cb.addEventListener('click', connectAgenda);
  }
  $('#agendaIcs').addEventListener('click', () => { exportIcs(); $('#agendaIcs').innerHTML = 'Fichier telecharge ✓'; });
}
async function connectAgenda() {
  const btn = $('#agendaConnect');
  const showErr = (t) => { const m = $('#agendaConnectMsg'); if (m) m.innerHTML = `<span class="agenda-warn">${escapeHtml(t)}</span>`; if (btn) btn.disabled = false; };
  if (btn) btn.disabled = true;
  const m0 = $('#agendaConnectMsg'); if (m0) m0.innerHTML = '';
  // 1. Demande de l'URL d'autorisation au serveur.
  let url = null, notConfigured = false;
  try {
    const r = await fetch(apiUrl('/api/google/connect'), { headers: nutriAuthHeaders() });
    const d = await r.json();
    if (d && d.ok && d.url) url = d.url;
    else if (d && d.configured === false) notConfigured = true;
  } catch (_) { /* reseau */ }
  if (notConfigured) { refreshAgenda(); return; }
  if (!url) { showErr("La connexion a votre agenda n'a pas abouti. Veuillez reessayer."); return; }
  // 2. Ouverture de la fenetre d'autorisation Google (popup).
  const popup = window.open(url, 'mcn-google', 'width=480,height=660');
  if (!popup) { showErr('Veuillez autoriser les fenetres pop-up pour connecter votre agenda, puis reessayez.'); return; }
  // 3. Attente du retour : message du callback OU fermeture de la fenetre.
  let done = false;
  const finish = (ok) => {
    if (done) return; done = true;
    window.removeEventListener('message', onMsg); clearInterval(poll);
    if (ok) { refreshAgenda(); showToast('Agenda connecte ✓', { icon: 'calendar' }); }
    else { showErr('Autorisation refusee ou interrompue. Vous pouvez recommencer si vous souhaitez connecter votre agenda.'); }
  };
  const onMsg = (e) => { if (e.data === 'mcn-google-connected') finish(true); else if (e.data === 'mcn-google-error') finish(false); };
  window.addEventListener('message', onMsg);
  const poll = setInterval(() => { if (popup && popup.closed) finish(false); }, 1000);
}
async function syncAgenda(scope, btn) {
  const old = btn.innerHTML; btn.disabled = true; const msg = $('#agendaSyncMsg'); msg.textContent = '';
  // La synchro est REELLE des qu'un agenda est connecte (la connexion exige une
  // vraie autorisation Google) : on appelle l'API meme en session demo.
  msg.innerHTML = '<span class="agenda-msg">Ajout en cours…</span>';
  try {
    const r = await fetch(apiUrl('/api/google/sync'), { method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ scope, plan: state.plan, planId: planIdFor(state.plan), dinerTard: (state.preferences && state.preferences.dinerTard) === 'oui' }) });
    const d = await r.json();
    if (d.ok) msg.innerHTML = `<span class="agenda-success">✓ ${d.count} evenement(s) ajoute(s) a ton agenda${d.fail ? ` (${d.fail} non ajoutes)` : ''}.</span>`;
    else if (d.error === 'not_connected') { msg.textContent = 'Reconnecte ton Google Agenda.'; refreshAgenda(); }
    else msg.textContent = "La synchronisation n'a pas fonctionne. Reessaie dans quelques instants.";
  } catch (e) { msg.textContent = "La synchronisation n'a pas fonctionne. Reessaie dans quelques instants."; }
  btn.disabled = false; btn.innerHTML = old;
}
async function disconnectAgenda() {
  if (!confirm('Deconnecter Google Agenda ? Ton plan reste dans l\'application.')) return;
  try { await fetch(apiUrl('/api/google/disconnect'), { method: 'POST', headers: nutriAuthHeaders() }); } catch (_) { /* ignore */ }
  refreshAgenda();
}

document.addEventListener('DOMContentLoaded', init);
