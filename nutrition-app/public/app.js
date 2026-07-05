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
// Démo = session SANS vrai compte client. Un client connecté (email présent) n'est
// JAMAIS en démo — même si son token de session est transporté via __NUTRI_DEMO. Ça
// évite qu'un vrai client tombe sur l'écran/bandeau « Mode démonstration » ou voie des
// données fictives. (Le token continue d'être envoyé via demoToken(), indépendant d'ici.)
function isDemo() { return !!window.__NUTRI_DEMO && !(window.__NUTRI_USER && window.__NUTRI_USER.email); }
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
// ⚙️ FORCE_CHALLENGE : au lancement, tout nouvel inscrit démarre en « Challenge 6/6 ».
// On MASQUE l'étape 1 « Quel est votre objectif ? » et on pré-sélectionne 'challenge'.
// Pour RÉACTIVER le choix libre de l'objectif : repasser cette constante à false
// (aucune autre modification nécessaire — l'étape et son choix reviennent tels quels).
const FORCE_CHALLENGE = true;
const FIRST_STEP = FORCE_CHALLENGE ? 2 : 1;

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
  communautePosts: [], // (obsolète) anciens partages locaux
  communauteMessages: [], // cache du mur collectif (chargé depuis le serveur)
  communauteMembers: 0, // taille du groupe (clients inscrits)
  communauteOverview: null, // stats de groupe (chargées depuis le serveur)
  quickOptions: null, // options rapides boutique (slot -> {nom,url,actif,...}), gérées par l'admin
  challengesParticipe: [], // ids des défis auxquels je participe
  challengesValides: {}, // id défi -> date (YYYY-MM-DD) de dernière validation
  conseilsJour: {}, // "ymd-id" -> { statut: compris|ajoute|snooze, until } (conseils du jour)
  conseilsAjouts: {}, // "ymd" -> [ { nom, kcal, prot } ] options ajoutées via un conseil
  conseilsSug: {}, // "ymd-id" -> index de suggestion (cyclage "voir d'autres options")
  photoMap: null, // id de recette -> version : plats AYANT une photo (chargé depuis le serveur)
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
  $('#loaderText').textContent = text || 'On prépare ton plan…';
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

// Si FORCE_CHALLENGE : pré-sélectionne l'objectif « Challenge 6/6 » et masque
// l'étape 1 (« Quel est votre objectif ? »). Réversible via la constante FORCE_CHALLENGE.
function applyForcedObjectif() {
  if (!FORCE_CHALLENGE) return;
  const g = $('.choice-grid[data-field="objectif"]');
  if (g) {
    g.dataset.selected = 'challenge';
    $$('.choice', g).forEach((b) => b.classList.toggle('selected', b.dataset.value === 'challenge'));
  }
  const s1 = $('.step[data-step="1"]');
  if (s1) s1.classList.remove('active'); // l'étape ne s'affichera jamais (goToStep démarre à FIRST_STEP)
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
  state.step = Math.min(Math.max(n, FIRST_STEP), TOTAL_STEPS);
  $$('.step').forEach((s) => s.classList.toggle('active', Number(s.dataset.step) === state.step));
  // Compteur relatif au 1er pas visible (si l'étape objectif est masquée, on démarre à 1/N).
  const shownNum = state.step - FIRST_STEP + 1;
  const shownTotal = TOTAL_STEPS - FIRST_STEP + 1;
  $('#progressFill').style.width = `${(shownNum / shownTotal) * 100}%`;
  $('#stepNum').textContent = shownNum;
  const stTot = $('#stepTotal'); if (stTot) stTot.textContent = shownTotal;
  $('#btnPrev').classList.toggle('hidden', state.step === FIRST_STEP);
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
    if (!objectif) { alert('Choisis un objectif pour continuer.'); return false; }
  }
  return true;
}

function collectProfile() {
  const form = $('#onboardingForm');
  const fd = new FormData(form);
  const objectif = $('.choice-grid[data-field="objectif"]').dataset.selected || (FORCE_CHALLENGE ? 'challenge' : 'maintien');
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
  const objLabels = { perte: 'Perte de poids', maintien: 'Maintien', muscle: 'Prise de muscle', energie: 'Plus d\'énergie', challenge: 'Challenge 6/6' };
  const pk = b.macros.proteines * 4, gk = b.macros.glucides * 4, lk = b.macros.lipides * 9;
  const tot = pk + gk + lk || 1;
  const bar = (v) => `<div class="macbar"><i style="width:${Math.round((v / tot) * 100)}%"></i></div>`;
  const kcalBlock = state.masquerCalories ? ''
    : `<div class="needs-stat"><div class="num">${b.kcalCible}</div><div class="lbl">kcal / jour</div></div>`;
  const isChallenge = state.profil.objectif === 'challenge';
  const prenom = clientPrenom();
  // Objectif POIDS chiffré, toujours visible (Challenge) + progression si pesées officielles.
  let goalStrip = '';
  if (isChallenge) {
    const perte = Math.max(1, Number(state.profil.perte_objectif_kg) || 6);
    const pc = state.parcours;
    const poidsDepart = (pc && pc.pesees && pc.pesees.depart && pc.pesees.depart.poids > 0)
      ? pc.pesees.depart.poids
      : (Number(state.profil.poids || state.profil.poids_depart || state.profil.poids_kg) || null);
    const poidsCible = (poidsDepart != null) ? Math.round((poidsDepart - perte) * 10) / 10 : null;
    let actuel = null;
    if (pc && pc.pesees) actuel = (pc.pesees.s6 && pc.pesees.s6.poids) || (pc.pesees.s3 && pc.pesees.s3.poids) || (pc.pesees.depart && pc.pesees.depart.poids) || null;
    const perdu = (poidsDepart != null && actuel != null) ? Math.max(0, Math.round((poidsDepart - actuel) * 10) / 10) : null;
    const pct = (perdu != null) ? Math.min(100, Math.round((perdu / perte) * 100)) : 0;
    const progBlock = (perdu != null) ? `
      <div class="needs-goal-bar"><i style="width:${pct}%"></i></div>
      <div class="needs-goal-prog">${perdu > 0 ? '<b>−' + frKg(perdu) + ' kg</b> parcourus · reste ' + frKg(Math.max(0, Math.round((perte - perdu) * 10) / 10)) + ' kg' : '<b>C’est parti</b> — ta première pesée se fait avec ton coach'}</div>` : '';
    goalStrip = `
      <div class="needs-goal">
        <div class="needs-goal-top"><span class="needs-goal-ic">${icSvg('target')}</span><span class="needs-goal-lbl">Objectif</span>
          <span class="needs-goal-val">−${frKg(perte)} kg</span>${poidsCible != null ? `<span class="needs-goal-cible">cible ${frKg(poidsCible)} kg</span>` : ''}</div>
        ${progBlock}
      </div>`;
  }
  $('#needsCard').innerHTML = `
    ${prenom ? `<p class="needs-kicker">Le programme de ${escapeHtml(prenom)}</p>` : ''}
    <div class="needs-head"><span class="needs-ic">${icSvg(isChallenge ? 'flame' : 'target')}</span><h2>Objectif : ${objLabels[state.profil.objectif] || ''}</h2>
      <button type="button" class="needs-agenda" title="Ajouter mes menus à mon agenda" aria-label="Ajouter à mon agenda">${icSvg('calendar')}<span>Agenda</span></button></div>
    <p class="needs-sub">${prenom ? escapeHtml(prenom) + ', ton objectif, résumé en chiffres.' : 'Ton objectif, résumé en chiffres.'}</p>
    ${goalStrip}
    <div class="needs-stats">
      ${kcalBlock}
      <div class="needs-stat"><div class="num">${b.macros.proteines} g</div><div class="lbl">Protéines</div>${bar(pk)}</div>
      <div class="needs-stat"><div class="num">${b.macros.glucides} g</div><div class="lbl">Glucides</div>${bar(gk)}</div>
      <div class="needs-stat"><div class="num">${b.macros.lipides} g</div><div class="lbl">Lipides</div>${bar(lk)}</div>
    </div>`;
  const ag = $('#needsCard .needs-agenda'); if (ag) ag.addEventListener('click', openAgenda);
}

// ---------- Ajustement automatique du plan (Challenge 6/6) ----------
// Le client ne se pèse PLUS lui-même (fonctionnalité « Pesée de la semaine » retirée).
// L'ajustement du plan est désormais piloté par les PESÉES OFFICIELLES du Parcours,
// saisies par le COACH (Départ / Semaine 3 / Semaine 6). À l'enregistrement de la
// Semaine 3 (puis de la Semaine 6), le plan est recalculé UNE SEULE FOIS ; entre deux
// pesées, il reste stable. Les anciennes pesées hebdo (state.pesees) sont conservées
// en base mais ne sont plus ni affichées ni modifiables (archivées).
let _officialAdjBusy = false;
async function checkOfficialAdjustment() {
  if (_officialAdjBusy || !state.plan || !(window.__NUTRI_USER && window.__NUTRI_USER.email)) return;
  _officialAdjBusy = true;
  try {
    if (!state.parcours) {
      try { const r = await fetch(apiUrl('/api/parcours'), { headers: nutriAuthHeaders() }); const d = await r.json(); if (d && d.ok) state.parcours = d.parcours; } catch (_) { /* réessaiera plus tard */ }
    }
    if (state.parcours && state.plan && $('#needsCard')) renderNeeds(); // affiche la progression poids dans l'objectif
    await maybeApplyOfficialAdjustment();
    await maybeShowCelebration();
  } finally { _officialAdjBusy = false; }
}

// ---------- Animation de célébration (perte à une pesée officielle S3/S6) ----------
let _celebrationShown = false;
function frKg(n) { const v = Math.round(Number(n) * 10) / 10; return Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ','); }
function celebrationMessage(c) {
  if (c.jalon === 's3') {
    const moitie = c.pctObjectif >= 0.5;
    return { emoji: '🔥', title: moitie ? 'Déjà plus de la moitié du chemin !' : 'Tu es sur la bonne voie !',
      sub: moitie ? 'Tu avances vite — continue comme ça.' : 'Beau parcours à mi-chemin. On continue !', context: 'à mi-parcours', strong: false };
  }
  if (c.objectifAtteint) {
    return { emoji: '🏆', title: 'Objectif atteint !', sub: 'Ton certificat de fin de challenge t’attend 🎓', context: 'en 6 semaines', strong: true };
  }
  return { emoji: '🎉', title: 'Bravo pour ta transformation !', sub: 'Un vrai changement en 6 semaines. Fier de toi 💪', context: 'en 6 semaines', strong: false };
}
async function maybeShowCelebration() {
  const c = state.parcours && state.parcours.celebration;
  if (!c || _celebrationShown) return;
  _celebrationShown = true;
  // Marque VUE tout de suite (une seule fois, même si l'utilisateur ferme aussitôt).
  try { await fetch(apiUrl('/api/parcours/celebration-seen'), { method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ jalon: c.jalon }) }); } catch (_) { /* réessaiera au prochain chargement */ }
  if (state.parcours) state.parcours.celebration = null;
  showCelebration(c);
}
function showCelebration(c) {
  const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const doux = !!state.masquerCalories; // affichage doux : on garde l'animation mais sans chiffres
  const m = celebrationMessage(c);
  const ov = document.createElement('div');
  ov.className = 'celebr' + (m.strong ? ' celebr-strong' : '') + (reduce ? ' celebr-reduce' : '');
  ov.setAttribute('role', 'dialog');
  ov.innerHTML =
    (reduce ? '' : '<canvas class="celebr-canvas" aria-hidden="true"></canvas>') +
    '<div class="celebr-card">' +
      '<div class="celebr-emoji">' + m.emoji + '</div>' +
      (doux ? '' : '<div class="celebr-kg"><span class="celebr-kg-val">' + (reduce ? '−' + frKg(c.kgPerdu) : '−0') + '</span><span class="celebr-kg-u"> kg</span></div>' +
        '<div class="celebr-ctx">' + m.context + '</div>') +
      '<div class="celebr-title">' + escapeHtml(m.title) + '</div>' +
      '<div class="celebr-sub">' + escapeHtml(m.sub) + '</div>' +
      '<button type="button" class="celebr-close">Continuer</button>' +
    '</div>';
  document.body.appendChild(ov);
  try { if (navigator.vibrate) navigator.vibrate(m.strong ? [45, 60, 45] : 30); } catch (_) { /* non supporté */ }
  let stopConfetti = null;
  if (!reduce) { const cv = ov.querySelector('.celebr-canvas'); if (cv) stopConfetti = celebrationConfetti(cv, m.strong); }
  // Compteur animé 0 -> valeur réelle (sauf reduced-motion / affichage doux).
  if (!reduce && !doux) {
    const el = ov.querySelector('.celebr-kg-val'); const target = c.kgPerdu; const t0 = performance.now(); const dur = 1200;
    const tick = (t) => { const p = Math.min(1, (t - t0) / dur); const v = target * (1 - Math.pow(1 - p, 3)); if (el) el.textContent = '−' + frKg(v); if (p < 1) requestAnimationFrame(tick); else if (el) el.textContent = '−' + frKg(target); };
    requestAnimationFrame(tick);
  }
  let closed = false;
  const close = () => { if (closed) return; closed = true; if (stopConfetti) stopConfetti(); ov.classList.add('celebr-out'); setTimeout(() => ov.remove(), 320); };
  ov.addEventListener('click', close);
  const btn = ov.querySelector('.celebr-close'); if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); close(); });
  setTimeout(close, reduce ? 4200 : 3200); // auto ~3 s (un peu plus en reduced-motion pour laisser lire)
}
// Confettis légers en canvas (aucune dépendance externe, CSP-safe).
function celebrationConfetti(canvas, strong) {
  const ctx = canvas.getContext('2d'); if (!ctx) return null;
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = window.innerWidth * DPR; canvas.height = window.innerHeight * DPR;
  const colors = ['#2563EB', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
  const N = strong ? 170 : 120;
  const parts = [];
  for (let i = 0; i < N; i++) {
    parts.push({ x: canvas.width * (0.5 + (Math.random() - 0.5) * 0.25), y: canvas.height * 0.34 + (Math.random() - 0.5) * 40 * DPR,
      vx: (Math.random() - 0.5) * 11 * DPR, vy: (Math.random() * -6 - 3) * DPR, g: (0.16 + Math.random() * 0.12) * DPR,
      s: (5 + Math.random() * 6) * DPR, rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.32, c: colors[i % colors.length] });
  }
  let raf = 0, start = 0; const dur = 2600;
  const frame = (t) => {
    if (!start) start = t; const elapsed = t - start; const life = Math.max(0, 1 - elapsed / dur);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    parts.forEach((p) => { p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save(); ctx.globalAlpha = life; ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.62); ctx.restore(); });
    if (elapsed < dur) raf = requestAnimationFrame(frame); else ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  raf = requestAnimationFrame(frame);
  return () => { if (raf) cancelAnimationFrame(raf); };
}
// Applique l'ajustement lié à la dernière pesée officielle non encore prise en compte.
async function maybeApplyOfficialAdjustment() {
  const pc = state.parcours;
  if (!pc || !pc.pesees || !state.plan) return;
  const p = state.profil || (state.profil = {});
  const applied = Array.isArray(p.officialAdjApplied) ? p.officialAdjApplied : [];
  const depart = pc.pesees.depart;
  if (!depart || !(depart.poids > 0)) return;
  let jalon = null, serie = null;
  if (pc.pesees.s6 && pc.pesees.s6.poids > 0 && !applied.includes('s6')) {
    jalon = 's6';
    const mid = (pc.pesees.s3 && pc.pesees.s3.poids > 0) ? pc.pesees.s3 : depart;
    serie = [{ ts: Date.parse(mid.date) || 0, poids: mid.poids }, { ts: Date.parse(pc.pesees.s6.date) || 1, poids: pc.pesees.s6.poids }];
  } else if (pc.pesees.s3 && pc.pesees.s3.poids > 0 && !applied.includes('s3')) {
    jalon = 's3';
    serie = [{ ts: Date.parse(depart.date) || 0, poids: depart.poids }, { ts: Date.parse(pc.pesees.s3.date) || 1, poids: pc.pesees.s3.poids }];
  }
  if (!jalon) return;
  const deficit = (state.plan.besoins && state.plan.besoins.deficit) || p.deficit_cible || 650;
  let delta = 0;
  try {
    const res = await fetch(apiUrl('/api/ajustement'), { method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ pesees: serie, deficit, sexe: p.sexe }) });
    const d = await res.json();
    if (d && d.ok && d.ajustement) delta = Number(d.ajustement.delta) || 0;
  } catch (_) { return; } // hors-ligne : rien n'est marqué -> nouvel essai au prochain chargement
  p.officialAdjApplied = [...applied, jalon];
  const lbl = jalon === 's3' ? 'de mi-parcours (semaine 3)' : 'finale (semaine 6)';
  if (delta !== 0) {
    p.ajustementKcal = Math.max(-400, Math.min(400, (Number(p.ajustementKcal) || 0) + delta));
    saveLocal();
    await generateAndShow(Math.floor(Math.random() * 1e6) + 1);
    showToast('Ton plan a été recalculé suite à ta pesée ' + lbl + ' avec ton coach.', { icon: 'check', duration: 4800 });
  } else {
    // Sur la cible : le plan reste inchangé, on note simplement la pesée comme prise en compte.
    saveLocal();
  }
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
    title.innerHTML = `${jour.jour}${nowTag}${kcalTag}<button class="day-regen" data-day="${di}">${icSvg('refresh')} Toute la journée</button>`;
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
  if (typeof renderConseils === 'function') renderConseils();
}

// ===== Conseils du jour : moteur d'astuces contextuelles (évolutif) =====
// Pour AJOUTER une astuce : pousser un objet dans CONSEILS (id, categorie,
// priorite, condition(ctx), message(ctx), suggestion...). Rien d'autre à toucher.
// Les conditions lisent le contexte RÉEL du jour (macros, repas validés, heure).
// Les signaux non encore captés (séance/eau/resto) restent dormants -> il suffira
// de renseigner le champ correspondant dans conseilsContext() pour les activer.
const CONSEIL_CAT_LABEL = {
  proteines: 'Protéines', hydratation: 'Hydratation', faim: 'Faim', sport: 'Sport',
  recuperation: 'Récupération', calories: 'Calories', sucre: 'Plaisir', organisation: 'Organisation',
  courses: 'Courses', restaurant: 'Restaurant', sommeil: 'Sommeil', motivation: 'Motivation',
};
const CONSEIL_SUGGESTIONS = {
  proteinee: [
    { nom: 'Shake protéiné à l’eau', kcal: 120, prot: 24 },
    { nom: 'Skyr nature (150 g)', kcal: 95, prot: 17 },
    { nom: 'Œufs durs (2)', kcal: 156, prot: 13 },
  ],
  hydratation: [
    { nom: 'Eau citron-menthe', kcal: 5, prot: 0 },
    { nom: 'Thé glacé sans sucre', kcal: 0, prot: 0 },
    { nom: 'Eau pétillante + citron', kcal: 0, prot: 0 },
  ],
  'plaisir-light': [
    { nom: 'Yaourt 0 % + cannelle', kcal: 90, prot: 10 },
    { nom: 'Carré de chocolat noir 85 %', kcal: 55, prot: 1 },
    { nom: 'Un fruit frais', kcal: 75, prot: 1 },
  ],
  'sport-recuperation': [
    { nom: 'Banane + shake protéiné', kcal: 230, prot: 25 },
    { nom: 'Skyr + fruits rouges', kcal: 180, prot: 18 },
  ],
};
const CONSEILS = [
  { id: 'retard-proteines', categorie: 'proteines', priorite: 1, suggestionType: 'aliment', suggestionCategorie: 'proteinee', actionPrincipale: 'ajouter', actionSecondaire: 'autres', tags: ['proteines', 'collation'],
    titre: 'Petit coup de pouce protéines',
    condition: (c) => c.repasValides >= 1 && c.cibleProt > 0 && c.consoProt < 0.8 * c.cibleProt,
    message: (c) => `Tu es à ${c.consoProt} g sur ${c.cibleProt} g de protéines aujourd’hui. Une option simple peut t’aider à atteindre ton objectif sans ajouter un gros repas.` },
  { id: 'seance-recup', categorie: 'recuperation', priorite: 2, suggestionType: 'aliment', suggestionCategorie: 'sport-recuperation', actionPrincipale: 'ajouter', actionSecondaire: 'compris', tags: ['sport', 'recuperation'],
    titre: 'Pense à ta récupération',
    condition: (c) => c.seanceAujourdhui === true,
    message: () => `Tu as une séance aujourd’hui. Pense à bien t’hydrater et à prévoir une option adaptée après l’entraînement.` },
  { id: 'hydratation', categorie: 'hydratation', priorite: 3, suggestionType: 'boisson', suggestionCategorie: 'hydratation', actionPrincipale: 'ajouter', actionSecondaire: 'compris', tags: ['hydratation'],
    titre: 'Objectif hydratation',
    condition: (c) => c.eauConsommee != null && c.eauConsommee < 1.5,
    message: (c) => `Tu es à ${c.eauConsommee} L d’eau aujourd’hui. Une eau aromatisée peut t’aider à boire plus facilement.` },
  { id: 'calories-restantes', categorie: 'calories', priorite: 4, suggestionType: 'boisson', suggestionCategorie: 'hydratation', actionPrincipale: 'ajouter', actionSecondaire: 'compris', tags: ['calories', 'grignotage'],
    titre: 'Envie de grignoter ?',
    condition: (c) => c.consoKcal > 0 && c.restantKcal < 150,
    message: (c) => `Il te reste ${c.restantKcal} kcal aujourd’hui. Une boisson légère peut t’aider à gérer l’envie sans dépasser ton plan.` },
  { id: 'envie-sucre', categorie: 'sucre', priorite: 5, suggestionType: 'aliment', suggestionCategorie: 'plaisir-light', actionPrincipale: 'ajouter', actionSecondaire: 'autres', tags: ['sucre', 'plaisir'],
    titre: 'Alternative plaisir',
    condition: (c) => c.envieSucre || (c.restantKcal >= 150 && c.restantKcal <= 250),
    message: () => `Une envie de sucré ? Cette option peut t’aider à te faire plaisir tout en restant dans ton objectif.` },
  { id: 'legumes', categorie: 'organisation', priorite: 6, suggestionType: null, suggestionCategorie: null, actionPrincipale: 'compris', actionSecondaire: 'snooze', tags: ['legumes', 'satiete'],
    titre: 'Ajoute du volume à ton assiette',
    condition: (c) => c.repasValides >= 1 && c.legumesValides === false,
    message: () => `Tu n’as pas encore beaucoup de légumes aujourd’hui. En ajouter peut t’aider à être plus rassasié sans trop augmenter les calories.` },
  { id: 'journee-basse', categorie: 'calories', priorite: 7, suggestionType: null, suggestionCategorie: null, actionPrincipale: 'compris', actionSecondaire: 'snooze', tags: ['calories', 'soir'],
    titre: 'Ne termine pas trop bas',
    condition: (c) => c.heure >= 18 && c.cibleKcal > 0 && c.consoKcal < 0.6 * c.cibleKcal,
    message: () => `Tu es encore assez bas en calories aujourd’hui. Mieux vaut compléter proprement ton plan plutôt que finir avec une grosse faim le soir.` },
  { id: 'restaurant', categorie: 'restaurant', priorite: 8, suggestionType: null, suggestionCategorie: null, actionPrincipale: 'compris', actionSecondaire: null, tags: ['restaurant'],
    titre: 'Repas extérieur',
    condition: (c) => c.restoPrevu === true,
    message: () => `Au restaurant, vise une source de protéines, des légumes et une portion de féculents simple. Garde les sauces à part si possible.` },
];

const CONSEIL_VEG_RE = /courgette|tomate|carotte|brocoli|[ée]pinard|salade|haricot|poivron|champignon|l[ée]gume|concombre|chou|courge|aubergine|betterave|poireau|fenouil|petits? pois|ratatouille|crudit|m[aâ]che|roquette|navet|radis/i;

// Contexte réel du jour pour évaluer les conditions.
function conseilsContext() {
  const m = (typeof coachMacrosJour === 'function') ? coachMacrosJour() : null;
  const av = state.avance || {};
  const di = (typeof indexJourActuel === 'function') ? indexJourActuel() : 0;
  const jour = state.plan && state.plan.jours && state.plan.jours[di];
  let repasValides = 0, legumesValides = false;
  (jour ? jour.repas : []).forEach((rp, mi) => {
    const s = state.suivi[trackKey(di, mi)];
    if (s && s.statut === 'respecte' && rp.recette) {
      repasValides++;
      const txt = (rp.recette.nom || '') + ' ' + (rp.recette.ingredients || []).map((i) => (i && i.nom) || i || '').join(' ');
      if (CONSEIL_VEG_RE.test(txt)) legumesValides = true;
    }
  });
  return {
    cibleProt: m ? m.cible.prot : 0, consoProt: m ? m.consomme.prot : 0,
    cibleKcal: m ? m.cible.kcal : 0, consoKcal: m ? m.consomme.kcal : 0, restantKcal: m ? m.restant.kcal : 0,
    repasValides, legumesValides, heure: new Date().getHours(),
    envieSucre: false,        // pas de déclaration ponctuelle d'envie pour l'instant
    eauConsommee: null,       // pas de suivi d'hydratation pour l'instant -> conseil dormant
    seanceAujourdhui: false,  // pas d'info séance par jour pour l'instant -> conseil dormant
    restoPrevu: false,        // pas d'info repas extérieur par jour pour l'instant -> conseil dormant
  };
}

function conseilSuggestion(t, today) {
  if (!t.suggestionCategorie) return null;
  const list = CONSEIL_SUGGESTIONS[t.suggestionCategorie] || [];
  if (!list.length) return null;
  return list[(state.conseilsSug[today + '-' + t.id] || 0) % list.length];
}

// Sélectionne ≤ 2 conseils : conditions vraies, par priorité, sans doublon d'action.
function evaluerConseils() {
  const c = conseilsContext();
  const today = ymd(new Date());
  const elig = CONSEILS.filter((t) => {
    let ok = false;
    try { ok = !!t.condition(c); } catch (_) { ok = false; }
    if (!ok) return false;
    const st = state.conseilsJour[today + '-' + t.id];
    if (st) {
      if (st.statut === 'compris' || st.statut === 'ajoute') return false;
      if (st.statut === 'snooze' && st.until && Date.now() < st.until) return false;
    }
    return true;
  }).sort((a, b) => a.priorite - b.priorite);
  const chosen = [], usedActions = new Set();
  for (const t of elig) {
    const actKey = t.suggestionCategorie || ('advice-' + t.id);
    if (usedActions.has(actKey)) continue; // éviter deux conseils qui proposent la même action
    chosen.push(t); usedActions.add(actKey);
    if (chosen.length >= 2) break; // maximum 2 conseils par jour
  }
  return { ctx: c, conseils: chosen, today };
}

const CONSEIL_ACT_LABEL = { ajouter: 'Ajouter à ma journée', autres: 'Voir d’autres options', compris: 'J’ai compris', snooze: 'Me le rappeler plus tard' };

function conseilCardHTML(t, today, ctx) {
  const sug = conseilSuggestion(t, today);
  const sugHTML = sug ? (
    '<div class="conseil-sug"><div class="conseil-sug-nom">' + escapeHtml(sug.nom) + '</div>' +
    '<div class="conseil-sug-nut">' + (sug.kcal != null ? (sug.kcal + ' kcal') : '') + (sug.prot ? (' · ' + sug.prot + ' g protéines') : '') + '</div></div>'
  ) : '';
  const prim = '<button type="button" class="btn btn-primary conseil-prim" data-conseil="' + t.id + '" data-act="' + t.actionPrincipale + '">' + CONSEIL_ACT_LABEL[t.actionPrincipale] + '</button>';
  const sec = t.actionSecondaire ? '<button type="button" class="conseil-sec" data-conseil="' + t.id + '" data-act="' + t.actionSecondaire + '">' + CONSEIL_ACT_LABEL[t.actionSecondaire] + '</button>' : '';
  return '<div class="conseil-card">' +
    '<div class="conseil-top"><span class="conseil-cat">' + (CONSEIL_CAT_LABEL[t.categorie] || t.categorie) + '</span></div>' +
    '<div class="conseil-titre">' + escapeHtml(t.titre) + '</div>' +
    '<div class="conseil-msg">' + escapeHtml(t.message(ctx)) + '</div>' +
    sugHTML +
    '<div class="conseil-acts">' + prim + sec + '</div>' +
  '</div>';
}

function renderConseils() {
  const host = $('#conseilsJour');
  if (!host) return;
  if (!state.plan || !state.plan.besoins) { host.innerHTML = ''; return; }
  const { ctx, conseils, today } = evaluerConseils();
  // Dès qu'un repas de la journée est validé, on retire les Conseils du jour.
  if (ctx && ctx.repasValides >= 1) { host.innerHTML = ''; return; }
  if (!conseils.length) { host.innerHTML = ''; return; }
  host.innerHTML = '<div class="conseils-head">' + icSvg('spark') + ' Conseils du jour</div>' +
    conseils.map((t) => conseilCardHTML(t, today, ctx)).join('');
  host.querySelectorAll('[data-conseil]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = CONSEILS.find((x) => x.id === btn.dataset.conseil);
      if (t) conseilAction(t, today, btn.dataset.act);
    });
  });
}

function conseilAction(t, today, action) {
  const key = today + '-' + t.id;
  if (action === 'ajouter') {
    const item = conseilSuggestion(t, today);
    state.conseilsJour[key] = { statut: 'ajoute' };
    if (!state.conseilsAjouts[today]) state.conseilsAjouts[today] = [];
    if (item) state.conseilsAjouts[today].push({ nom: item.nom, kcal: item.kcal, prot: item.prot });
    saveLocal(); renderConseils();
    showToast('Ajouté à ta journée : ' + (item ? item.nom : 'option') + ' ✓', { icon: 'check' });
  } else if (action === 'autres') {
    const list = CONSEIL_SUGGESTIONS[t.suggestionCategorie] || [];
    state.conseilsSug[today + '-' + t.id] = ((state.conseilsSug[today + '-' + t.id] || 0) + 1) % Math.max(1, list.length);
    renderConseils();
  } else if (action === 'compris') {
    state.conseilsJour[key] = { statut: 'compris' }; saveLocal(); renderConseils();
  } else if (action === 'snooze') {
    state.conseilsJour[key] = { statut: 'snooze', until: Date.now() + 3 * 3600 * 1000 }; saveLocal(); renderConseils();
    showToast('On t’en reparle un peu plus tard 👍', { icon: 'info' });
  }
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
          <div>${icSvg('check')} Restaurant : une protéine (poulet/poisson) + légumes + un féculent.</div>
          <div>${icSvg('check')} Boulangerie : sandwich complet poulet-crudités + un fruit.</div>
          <div>${icSvg('check')} À emporter : salade composée ou wrap, eau plutôt que soda.</div>
        </div>
      </div>`;
    return el;
  }
  const r = repas.recette;
  if (!r) {
    el.innerHTML = `<div class="meal-body"><span class="meal-empty">${escapeHtml(repas.label)} — aucune recette compatible. Assouplis un filtre.</span></div>`;
    return el;
  }
  const isFav = state.favoris.some((f) => f.id === r.id);
  const cat = repas.creneau === 'dejeuner' || repas.creneau === 'diner' ? 'plat' : repas.creneau;
  const glyph = cat === 'petit-dejeuner' ? 'sun' : (cat === 'collation' ? 'apple' : 'bowl');
  const suivi = state.suivi[trackKey(di, mi)] || {};
  const st = suivi.statut;
  // Texte « mangé autre chose » : saisi via le crayon (detail.repas) ou via le formulaire (autre.repas).
  const autreTxt = (suivi.autre && suivi.autre.repas) || (suivi.detail && suivi.detail.repas) || '';
  const autreQte = (suivi.autre && suivi.autre.quantite) || '';
  // Pour « autre » : le texte s'affiche SUR l'image (photo rendue transparente), plus de ligne en dessous.
  const autreNote = st === 'autre'
    ? `<div class="meal-autre-note">${icSvg('edit')}<span>${escapeHtml(autreTxt || 'Repas remplacé')}${autreQte ? ' (' + escapeHtml(autreQte) + ')' : ''}</span></div>`
    : '';
  const badge = recipeBadge(r);
  const badgeHTML = badge ? `<span class="meal-badge ${badge.cls}">${escapeHtml(badge.txt)}</span>` : '';
  const kcalMeta = state.masquerCalories ? '' : `<span class="mm-kcal">${icSvg('flame')} ${r.kcal} kcal</span>`;
  // Animations : entree au 1er rendu (stagger via --mi) ; flash si remplacee.
  if (_animateMeals) { el.classList.add('meal-in'); el.style.setProperty('--mi', mi); }
  if (state._swappedKey === trackKey(di, mi)) el.classList.add('meal-swapped');
  el.innerHTML = `
    <div class="meal-photo" data-cat="${cat}">
      ${recipePhotoImg(r, 'meal-img')}
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
      ${autreNote}
    </div>
    <div class="meal-body">
      <div class="meal-actions">
        <button class="mini-btn mini-btn-main" data-act="open">${icSvg('eye')} Voir la recette</button>
        <button class="mini-btn" data-act="swap">${icSvg('refresh')} Remplacer</button>
      </div>
      <div class="meal-track">
        <button class="track-btn ${st === 'respecte' ? 'on-ok' : ''}" data-act="t-ok" title="J'ai suivi mon plan" aria-label="J'ai suivi mon plan">${icSvg('check')}</button>
        <button class="track-btn ${st === 'non' ? 'on-no' : ''}" data-act="t-no" title="J'ai sauté ce repas" aria-label="J'ai sauté ce repas">${icSvg('x')}</button>
        <button class="track-btn ${(st === 'adapte' || st === 'autre') ? 'on-alt' : ''}" data-act="t-alt" title="J'ai adapté / mangé autre chose" aria-label="Adapter ce repas">${icSvg('edit')}</button>
      </div>
      ${collationOptionHTML(repas)}
    </div>`;
  el.classList.toggle('is-autre', st === 'autre');
  el.classList.toggle('is-adapte', st === 'adapte');
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
  'Super, tu avances dans la bonne direction.',
  'Journée complète validée, continue comme ça.',
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
    ? 'Semaine complète — un instant, on te prépare le résumé…'
    : 'La régularité se construit jour après jour. Continue !';
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
    'Tu as bien suivi ton plan sur l\'ensemble de la semaine',
    'Ta constance est ton meilleur levier de progression',
  ];
  const items = lignes.map((l) => `<li><span class="wr-ic">${icSvg('check')}</span><span>${escapeHtml(l)}</span></li>`).join('');
  const ov = document.createElement('div');
  ov.className = 'week-recap';
  ov.innerHTML = `
    <div class="wr-card" role="dialog" aria-label="Récapitulatif de la semaine">
      <div class="wr-badge">${icSvg('star')}</div>
      <h3 class="wr-title">Ta semaine est validée</h3>
      <p class="wr-sub">Voici un résumé simple de ta régularité cette semaine.</p>
      <ul class="wr-list">${items}</ul>
      <div class="wr-tip"><span class="wr-ic">${icSvg('flame')}</span><span>Continue sur ce rythme et garde des repas simples à préparer.</span></div>
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
  const repas = window.prompt('Qu\'as-tu mangé à la place ?', cur.repas || '');
  if (repas === null) return; // annule
  const quantite = window.prompt('Quantité approximative ? (optionnel)', cur.quantite || '') || '';
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
  showLoader('On te trouve une autre idée…');
  try {
    const nouvelle = await fetchMeal(repas.creneau, repas.kcalCible, repas.recette ? repas.recette.id : null);
    if (nouvelle) { repas.recette = nouvelle; clearTrack(di, mi); state._swappedKey = trackKey(di, mi); renderPlan(); saveLocal(); }
    else alert('Pas d\'autre recette compatible disponible pour ce créneau.');
  } catch (e) { alert('Impossible de remplacer ce repas pour le moment.'); }
  finally { hideLoader(); }
}

// ---------- Regenerer TOUTE une journee ----------
async function regenerateDay(di) {
  const jour = state.plan.jours[di];
  showLoader(`On régénère ${jour.jour}…`);
  try {
    for (let mi = 0; mi < jour.repas.length; mi++) {
      const repas = jour.repas[mi];
      const nouvelle = await fetchMeal(repas.creneau, repas.kcalCible, repas.recette ? repas.recette.id : null);
      if (nouvelle) { repas.recette = nouvelle; clearTrack(di, mi); }
    }
    renderPlan();
    saveLocal();
  } catch (e) { alert('Impossible de régénérer la journée pour le moment.'); }
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
    ? `<p class="panel-sub">Quantités pour ${state.portions} personnes (macros affichées par portion).</p>` : '';

  const photoCat = r.type === 'petit-dejeuner' ? 'petit-dejeuner' : (r.type === 'collation' ? 'collation' : 'plat');
  const photoGlyph = photoCat === 'petit-dejeuner' ? 'sun' : (photoCat === 'collation' ? 'apple' : 'bowl');
  $('#modalBody').innerHTML = `
    <div class="recipe-photo" data-cat="${photoCat}">
      ${recipePhotoImg(r, '')}
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
      <div class="m"><div class="n">${r.proteines} g</div><div class="l">Protéines</div></div>
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
    cont.innerHTML = '<p class="panel-empty">Aucun favori pour le moment. Ouvre une recette et ajoute-la à tes favoris.</p>';
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
  if (!choix) { alert('Aucune alternative compatible avec tes contraintes pour cet ingrédient.'); return; }
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
      <p class="pers-note">Ajuste seulement les quantités à acheter — ton plan, tes calories et tes macros restent inchangés.</p>
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

function openShopping() {
  renderShopping(); $('#shoppingPanel').classList.remove('hidden');
  // Comportement « page » : l'onglet Courses s'allume dans la sidebar.
  $$('#bottom-nav .nav-i').forEach((b) => b.classList.toggle('on', b.dataset.tab === 'courses'));
}
function closeShopping() {
  $('#shoppingPanel').classList.add('hidden');
  const cur = ($('#screen-result') && $('#screen-result').getAttribute('data-tab')) || 'plan';
  $$('#bottom-nav .nav-i').forEach((b) => b.classList.toggle('on', b.dataset.tab === cur));
}

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
  if (!w) { alert('Autorise les fenêtres pop-up pour exporter en PDF.'); return; }
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
  const objLabels = { perte: 'Perte de poids', maintien: 'Maintien', muscle: 'Prise de muscle', energie: 'Plus d\'énergie', challenge: 'Challenge 6/6' };
  let html = `<h1>Mon plan de repas — My Coach Nutrition</h1>
    <p class="sub">Objectif : ${objLabels[state.profil.objectif] || ''} · ~${b.kcalCible} kcal/jour · ${state.portions} personne(s) · Estimations à titre indicatif.</p>`;
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
const COMPLEMENT_LABELS = { non: 'Aucun', aucun: 'Aucun', proteines: 'Protéine (whey)', proteines_vegetales: 'Protéine végétale', creatine: 'Créatine', vitamines: 'Multivitamines', multivitamines: 'Multivitamines', omega3: 'Oméga 3', magnesium: 'Magnésium', fibres: 'Fibres', electrolytes: 'Électrolytes', vitamineD: 'Vitamine D3', ashwagandha: 'Ashwagandha', bruleur: 'Brûleur de graisse', collagene: 'Collagène', preworkout: 'Pré-workout', autre: 'Autre' };

// Lien boutique (Biloba Nutrition) par complement recommande : un clic -> la fiche produit.
// On NE met PAS de lien pour le bruleur (deconseille) ni les fibres (pas de produit dedie).
const SHOP_BASE = 'https://bilobanutrition.fr/products/';
const SHOP_UTM = '?utm_source=mycoach&utm_medium=app&utm_campaign=complements';
// Handles RÉELS du catalogue Biloba Nutrition (vérifiés via products.json, 2026-07).
const COMPLEMENT_SHOP = {
  proteines: 'iso-whey-clear-1',                         // Iso Whey Clear
  proteines_vegetales: 'proteine-vegetale',              // Protéine Végétale (vegan)
  creatine: 'creatine-100-monohydrate-biotechusa',       // Créatine 100% monohydrate
  magnesium: 'magnesium-bisglycinate',                   // Magnésium Bisglycinate (en stock)
  omega3: 'mega-omega3',                                 // Mega OMEGA3
  vitamineD: 'multivitamines-copie',                     // Vitamine D3 K2-MK7 1000 UI
  vitamines: 'multivitamines-complex',                   // Multivitamines complex
  multivitamines: 'multivitamines-complex',
  collagene: 'inlead-collagene-peptides-type-i-ii-et-iii', // INLEAD Collagène peptides
  electrolytes: 'electrolytes-comprimes-effervescents',  // Électrolytes effervescents
  ashwagandha: 'ashwagandha-ksm66-bio',                  // Ashwagandha KSM66 bio
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
// Ligne compacte "Option rapide" (alternative boutique SECONDAIRE) — uniquement sur
// les collations, et seulement si une option active existe pour ce créneau. La recette
// du plan reste l'option principale ; cette ligne prend très peu de hauteur.
function collationOptionHTML(repas) {
  if (!repas || repas.creneau !== 'collation') return '';
  const slot = collationMomentKey(repas.label);
  let nom = '', url = '';
  const qo = state.quickOptions && state.quickOptions[slot];
  if (qo) { if (!qo.actif) return ''; nom = qo.nom; url = qo.url; }      // géré par l'admin
  else { const p = COLLATION_PRODUITS[slot]; if (!p || p.actif === false) return ''; nom = p.nom; url = collationProduitUrl(p); } // repli
  if (!nom || !url) return '';
  return `
      <a class="meal-quickopt" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="Option rapide : ${escapeHtml(nom)}">
        <span class="mqo-ic">${icSvg('spark')}</span>
        <span class="mqo-txt"><strong>${escapeHtml(nom)}</strong><span class="mqo-tag"> · option rapide</span></span>
        <span class="mqo-cta">${icSvg('cart')} Commander</span>
      </a>`;
}
// Charge les options rapides (gérées par l'admin) ; re-render le plan si présent.
async function fetchQuickOptions() {
  try {
    const res = await fetch(apiUrl('/api/quick-options'), { headers: nutriAuthHeaders() });
    const d = await res.json();
    if (d && d.ok) { state.quickOptions = {}; (d.options || []).forEach((o) => { state.quickOptions[o.slot] = o; }); if (state.plan && typeof renderPlan === 'function') renderPlan(); }
  } catch (_) { /* repli sur le catalogue codé */ }
}

function openFiche() { renderFiche(); $('#fichePanel').classList.remove('hidden'); }
function closeFiche() { $('#fichePanel').classList.add('hidden'); }

function renderFiche() {
  const p = state.profil, pr = state.preferences, b = state.plan ? state.plan.besoins : null;
  const objLabels = { perte: 'Perte de poids', maintien: 'Maintien', muscle: 'Prise de muscle', energie: 'Plus d\'énergie', challenge: 'Challenge 6/6' };
  const comps = (p.complements || []).filter((c) => c !== 'aucun' && c !== 'non').map((c) => COMPLEMENT_LABELS[c] || c);
  const compStr = comps.length ? comps.filter((c) => c !== 'Autre').join(', ') + (p.complementsDetail ? ' — ' + p.complementsDetail : '') : 'Aucun';
  const hab = pr.habitudes || {};
  const habRow = (lbl, val) => (val ? `<div class="fiche-row"><span>${lbl}</span><b>${escapeHtml(val)}</b></div>` : '');
  const ad = computeAdherence();
  $('#ficheBody').innerHTML = `
    <div class="fiche-block">
      <h3>Profil</h3>
      <div class="fiche-row"><span>Objectif</span><b>${objLabels[p.objectif] || '—'}</b></div>
      <div class="fiche-row"><span>Sexe / Âge</span><b>${p.sexe || '—'} · ${p.age || '—'} ans</b></div>
      <div class="fiche-row"><span>Taille / Poids</span><b>${p.taille_cm || '—'} cm · ${p.poids_kg || '—'} kg</b></div>
      ${b && !state.masquerCalories ? `<div class="fiche-row"><span>Besoin estimé</span><b>~${b.kcalCible} kcal/jour</b></div>` : ''}
    </div>
    <div class="fiche-block">
      <h3>Compléments alimentaires</h3>
      <div class="fiche-tags">${escapeHtml(compStr)}</div>
    </div>
    <div class="fiche-block">
      <h3>Goûts & contraintes</h3>
      ${pr.cuisines && pr.cuisines.length ? `<div class="fiche-row"><span>Cuisines aimées</span><b>${pr.cuisines.join(', ')}</b></div>` : ''}
      ${pr.aimes && pr.aimes.length ? `<div class="fiche-row"><span>Aime</span><b>${escapeHtml(pr.aimes.join(', '))}</b></div>` : ''}
      ${pr.deteste && pr.deteste.length ? `<div class="fiche-row"><span>N'aime pas</span><b>${escapeHtml(pr.deteste.join(', '))}</b></div>` : ''}
      ${pr.allergies && pr.allergies.length ? `<div class="fiche-row"><span>Allergies</span><b style="color:var(--danger)">${escapeHtml(pr.allergies.join(', '))}</b></div>` : ''}
      ${pr.regime && pr.regime.length ? `<div class="fiche-row"><span>Régime</span><b>${pr.regime.join(', ')}</b></div>` : ''}
    </div>
    <div class="fiche-block">
      <h3>Habitudes actuelles</h3>
      ${habRow('Petit-déjeuner', hab.petitDej)}
      ${habRow('Déjeuner', hab.dejeuner)}
      ${habRow('Dîner', hab.diner)}
      ${habRow('Collations', hab.collations)}
      ${habRow('Boissons', hab.boissons)}
      ${pr.frequents && pr.frequents.length ? `<div class="fiche-row"><span>Presque tous les jours</span><b>${escapeHtml(pr.frequents.join(', '))}</b></div>` : ''}
    </div>
    <div class="fiche-block">
      <h3>Suivi</h3>
      <div class="fiche-row"><span>Adhérence</span><b>${ad.prevus ? ad.taux + ' %' : '—'}</b></div>
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
      <div class="adh-lbl">d'adhérence</div>
    </div>
    <div class="adh-stats">
      <div class="adh-stat"><b>${a.prevus}</b><span>prévus</span></div>
      <div class="adh-stat ok"><b>${a.respectes}</b><span>respectés</span></div>
      <div class="adh-stat alt"><b>${a.modifies}</b><span>modifiés</span></div>
      <div class="adh-stat no"><b>${a.nonRespectes}</b><span>non respectés</span></div>
    </div>
    <p class="panel-sub">${nonRenseignes > 0 ? nonRenseignes + ' repas pas encore renseignés. Marque chaque repas (respecté / non / modifié) sur le plan.' : 'Tous tes repas sont renseignés, bravo !'}</p>`;
}

// ---------- Analyse des ecarts (E5) ----------
const VEG_KEYS = ['legume', 'courgette', 'brocoli', 'salade', 'tomate', 'poivron', 'epinard', 'carotte', 'haricot', 'champignon', 'ratatouille', 'crudites', 'mais', 'patate douce', 'aubergine'];
const JUNK_KEYS = ['pizza', 'burger', 'fast', 'frite', 'soda', 'chips', 'bonbon', 'kebab', 'nugget', 'industriel', 'plat prepare', 'sandwich', 'biscuit', 'gateau', 'restaurant', 'tacos'];

function openAnalyse() { renderAnalyse(); $('#analysePanel').classList.remove('hidden'); }
function closeAnalyse() { $('#analysePanel').classList.add('hidden'); }

function renderAnalyse() {
  if (!state.plan) { $('#analyseBody').innerHTML = '<p class="panel-empty">Génère un plan pour obtenir une analyse.</p>'; return; }
  const forts = [], axes = [];
  const b = state.plan.besoins;
  const a = computeAdherence();

  // 1. Adherence / repas sautes
  if (a.prevus && a.respectes / a.prevus >= 0.8) forts.push('Très bonne régularité : tu suis la majorité de tes repas.');
  else if (a.nonRespectes >= 2) axes.push(`${a.nonRespectes} repas non pris : essaie de ne sauter aucun repas, même léger.`);

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
  if (b && protJour >= b.macros.proteines * 0.9) forts.push(`Apport protéique solide (~${protJour} g/jour).`);
  else if (b) axes.push(`Protéines un peu justes (~${protJour} g/jour vs ~${b.macros.proteines} g visés) : ajoute œufs, volaille, légumineuses ou laitages.`);

  // 3. Legumes
  const vegRatio = totMeals ? vegMeals / totMeals : 0;
  if (vegRatio >= 0.5) forts.push('Belle présence de légumes dans tes repas.');
  else axes.push('Peu de légumes : vise au moins une portion de légumes à chaque repas principal.');

  // 4. Aliments ultra-transformes (habitudes declarees + ecarts "autre")
  const textes = [];
  const h = state.preferences.habitudes || {}; Object.values(h).forEach((v) => v && textes.push(v));
  Object.values(state.suivi).forEach((s) => { if (s.autre && s.autre.repas) textes.push(s.autre.repas); });
  const blob = textes.join(' ').toLowerCase();
  const junkHits = JUNK_KEYS.filter((k) => blob.includes(k));
  if (junkHits.length >= 2) axes.push('Aliments plaisir / ultra-transformés assez fréquents (' + junkHits.slice(0, 3).join(', ') + ') : garde-les, mais en quantité raisonnée.');
  else if (textes.length) forts.push('Peu d\'aliments ultra-transformés repérés : continue ainsi.');

  if (!forts.length) forts.push('Tu démarres ton suivi : chaque repas renseigné améliore l\'analyse.');
  if (!axes.length) axes.push('Rien à signaler pour l\'instant : continue sur cette lancée !');

  $('#analyseBody').innerHTML = `
    <div class="ana-block ana-forts">
      <h3>${icSvg('check-circle')} Tes points forts</h3>
      <ul>${forts.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
    </div>
    <div class="ana-block ana-axes">
      <h3>${icSvg('leaf')} Pistes d'amélioration</h3>
      <ul>${axes.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
    </div>
    <p class="panel-sub">Rappel bienveillant : ce sont des repères, pas des règles. Avance à ton rythme.</p>`;
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
    expl.push({ t: 'Faim / envies plus fortes le soir', d: 'Dîner plus rassasiant (plus de protéines et de légumes) et collation cadrée dans l\'après-midi, pour éviter le creux du soir.' });
  }
  if (av.appetitMatin === 'non' || av.faim === 'midi') {
    m('petit-dejeuner', 0.8); m('dejeuner', 1.1); m('diner', 1.08);
    expl.push({ t: 'Peu d\'appétit le matin', d: 'Petit-déjeuner plus léger et apports reportés sur le déjeuner et le dîner.' });
  }
  if (av.grignotage === 'aprem' || av.sucre === 'aprem') {
    bumpSnack();
    expl.push({ t: 'Grignotage en fin d\'après-midi', d: 'Une collation est prévue dans l\'après-midi pour cadrer la faim, au lieu de laisser un vide qui pousse au grignotage.' });
  }
  if (av.midi === 'rapide') {
    tempsMax['dejeuner'] = 15;
    expl.push({ t: 'Peu de temps le midi', d: 'Déjeuners rapides (15 min max), faciles à préparer ou à emporter.' });
  }
  if (av.midi === 'exterieur') {
    exterieur.dejeuner = true;
    expl.push({ t: 'Déjeuner souvent à l\'extérieur', d: 'Le midi : des suggestions compatibles restaurant / boulangerie / repas froid, plutôt qu\'une recette à cuisiner.' });
  }
  if (av.soirCuisine === 'fatigue') {
    tempsMax['diner'] = 20;
    expl.push({ t: 'Peu d\'énergie pour cuisiner le soir', d: 'Dîners simples et rapides (20 min max), faciles à préparer à l\'avance.' });
  }
  if (av.sport === 'matin') {
    bumpSnack(); m('petit-dejeuner', 1.05);
    expl.push({ t: 'Sport le matin', d: 'Petit-déjeuner orienté protéines + glucides pour la récupération, et collation possible autour de la séance.' });
  }
  if (av.sucre === 'soir') {
    expl.push({ t: 'Envie de sucre le soir', d: 'Dîner plus rassasiant et possibilité d\'un dessert maîtrisé, pour calmer l\'envie sans excès.' });
  }
  if ((av.etat || []).length) {
    expl.push({ t: 'Sommeil / stress / fatigue', d: 'Le magnésium est mis en avant dans tes recommandations de compléments ; on privilégie aussi des repas réguliers.' });
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

  showLoader('On personnalise ton plan…');
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
    cont.innerHTML = '<div class="aj-done">Plan recalculé. Ajoute des précisions ci-dessus pour l\'adapter encore plus finement.</div>';
    return;
  }
  cont.innerHTML = `<div class="recipe-section-title">Ce qu'on a adapté pour toi</div>${
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
  proteines: 'aident à couvrir tes besoins en protéines et à tenir la satiété.',
  creatine: 'soutient la force et la performance à l\'entraînement.',
  magnesium: 'contribue à réduire la fatigue et au fonctionnement normal des muscles et des nerfs.',
  omega3: 'intéressant si tu manges peu de poissons gras (sardine, maquereau, saumon).',
  vitamines: 'filet de sécurité si ton alimentation est parfois déséquilibrée.',
  vitamineD: 'souvent un peu basse en hiver ou avec peu d\'exposition au soleil.',
  fibres: 'aident à la satiété et au transit.',
  electrolytes: 'utiles pour s\'hydrater lors d\'efforts longs ou par forte chaleur.',
  proteines_vegetales: 'source de protéines végétales pour compléter tes apports (idéal en alimentation végétale).',
  multivitamines: 'filet de sécurité si ton alimentation est parfois déséquilibrée.',
  collagene: 'soutient la peau, les articulations et les tissus, utile en perte de poids ou avec l\'âge.',
  ashwagandha: 'plante adaptogène : peut aider à mieux gérer le stress et à favoriser un sommeil réparateur.',
  bruleur: 'effet très limité : ce n\'est pas un levier prioritaire.',
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
  proteines_vegetales: 'après l\'entraînement ou en collation',
  multivitamines: 'le matin, au petit-déjeuner',
  collagene: 'chaque jour, à distance des repas ou le soir',
  ashwagandha: 'le soir, avant le coucher',
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
    perte: 'perdre du poids', challenge: 'une perte accélérée tout en préservant tes muscles',
    muscle: 'développer ta masse musculaire', energie: 'retrouver de l\'énergie au quotidien',
    maintien: 'maintenir ta forme',
  }[c.objectif] || 'ton objectif';
  const dietNote = c.vegan ? ' Avec une alimentation vegan, atteindre ce total demande un peu d\'organisation.'
    : (c.vegetarien ? ' Avec une alimentation végétarienne, les sources concentrées de protéines sont moins nombreuses.' : '');
  const suivi = (typeof estComplementSuivi === 'function' && estComplementSuivi(cle)) || (c.pris && c.pris.has(cle));
  let t;
  switch (cle) {
    case 'proteines_vegetales':
    case 'proteines':
      t = `Ton objectif est de ${obj}${prot ? `, avec un besoin d'environ ${prot} g de protéines par jour` : ''}. Atteindre cette quantité par l'alimentation seule peut être exigeant${c.objectif === 'muscle' || c.objectif === 'challenge' ? ', surtout les jours d\'entraînement' : ''}.${dietNote} Une protéine en poudre t'aide à compléter facilement tes apports, notamment après l'entraînement ou en collation.`;
      if (!c.actif && c.objectif !== 'muscle') t += ' Si tes repas couvrent déjà ce total, garde-la simplement en dépannage.';
      break;
    case 'creatine':
      t = c.actif
        ? `Tu t'entraînes régulièrement avec un objectif de ${obj}. La créatine est l'un des compléments les plus étudiés : elle peut soutenir ta force, tes performances et une progression plus régulière.${c.poids ? ` Pour ${c.poids} kg, environ 3 g par jour suffisent.` : ''}`
        : `La créatine est l'un des compléments les plus étudiés pour la force et la performance. Elle devient vraiment pertinente dès que tu t'entraînes régulièrement — à garder en tête si tu augmentes ton activité.`;
      break;
    case 'magnesium':
      t = `Ton rythme est ${c.activiteLabel}.${c.stressFatigue ? ' Tu as signalé du stress, de la fatigue ou un sommeil difficile :' : ' Si tu ressens fatigue, crampes ou récupération difficile,'} un apport en magnésium peut soutenir le fonctionnement musculaire et nerveux et favoriser une meilleure récupération.`;
      break;
    case 'omega3':
      t = `${c.poissonOk ? 'Pour compléter tes apports en bons acides gras,' : 'Tu sembles manger peu de poisson gras :'} les oméga-3 soutiennent l'équilibre cardiovasculaire et la récupération. 1 à 2 portions de poisson gras par semaine restent l'idéal ; un complément prend le relais sinon.`;
      break;
    case 'vitamineD':
      t = `Selon la saison et ton exposition au soleil, la vitamine D est souvent un peu basse en hiver. Un apport peut soutenir tes os, tes muscles et ton tonus${c.objectif === 'energie' ? ', utile pour ton objectif d\'énergie' : ''}.`;
      break;
    case 'fibres':
      t = `${c.faimGrignote ? 'Tu as signalé de la faim ou des grignotages :' : `Dans un objectif de ${obj},`} les fibres aident à se sentir rassasié plus longtemps et soutiennent le transit — un vrai plus pour tenir tes repas sans frustration.`;
      break;
    case 'electrolytes':
      t = `Avec des séances intenses ou longues, tu perds des minéraux en transpirant. Les électrolytes aident à rester bien hydraté et à limiter les coups de fatigue à l'effort.`;
      break;
    case 'vitamines': case 'multivitamines':
      t = `Un multivitamines sert de filet de sécurité si ton alimentation est parfois déséquilibrée${c.vegan ? ', ce qui peut arriver avec une alimentation vegan' : ''}. Rien d'indispensable si tes repas sont variés, mais cela rassure les semaines chargées.`;
      break;
    case 'collagene':
      t = `${c.objectif === 'perte' || c.objectif === 'challenge' ? 'En perte de poids, ' : ''}le collagène soutient la peau, les articulations et les tissus — un plus pour la souplesse et le confort articulaire, surtout si tu es actif ou avec l'âge. À voir comme un confort, pas un indispensable.`;
      break;
    case 'ashwagandha':
      t = `${c.stressFatigue ? 'Tu as signalé du stress, de la fatigue ou un sommeil difficile : ' : 'Si tu te sens souvent sous pression ou dors mal, '}l'ashwagandha est une plante adaptogène qui peut aider à mieux gérer le stress et à favoriser un sommeil plus réparateur. C'est un coup de pouce bien-être, jamais un traitement.`;
      break;
    default:
      t = COMPLEMENT_ROLES[cle] ? ('Ce complément ' + COMPLEMENT_ROLES[cle]) : 'Peut être un complément utile selon tes besoins.';
  }
  if (suivi) t += ' C\'est déjà dans ton plan : cette recommandation est donc déjà appliquée.';
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

  // 3 niveaux, chacun garanti avec AU MOINS 2 produits (tous liés à un vrai produit
  // Biloba). Ordre voulu : Les essentiels > À envisager > Peut vous aider.
  const protKey = vegan ? 'proteines_vegetales' : 'proteines';
  let ess, env, aide;
  if (objectif === 'muscle') {
    ess = [protKey, 'creatine']; env = ['multivitamines', 'collagene']; aide = ['magnesium', 'omega3'];
  } else if (objectif === 'challenge' || objectif === 'perte') {
    ess = [protKey, 'omega3']; env = ['multivitamines', 'collagene'];
    aide = ['magnesium', (actif && objectif === 'challenge') ? 'electrolytes' : 'vitamineD'];
  } else if (objectif === 'energie') {
    ess = ['omega3', 'vitamineD']; env = ['multivitamines', 'collagene']; aide = ['magnesium', 'ashwagandha'];
  } else { // maintien
    ess = [protKey, 'omega3']; env = ['multivitamines', 'collagene']; aide = ['magnesium', 'vitamineD'];
  }
  if (stressFatigue) aide[1] = 'ashwagandha'; // signal stress/fatigue/sommeil -> ashwagandha
  const seen = new Set();
  const pushTier = (keys, niveau) => keys.forEach((cle) => { if (seen.has(cle)) return; seen.add(cle); add(cle, niveau); });
  pushTier(ess, 'essentiel'); pushTier(env, 'envisager'); pushTier(aide, 'aide');
  // Filet de sécurité : complète chaque niveau à 2 minimum depuis un pool à vrais produits.
  const POOL = { essentiel: [protKey, 'omega3', 'creatine'], envisager: ['multivitamines', 'collagene', 'vitamineD'], aide: ['magnesium', 'electrolytes', 'ashwagandha'] };
  ['essentiel', 'envisager', 'aide'].forEach((niveau) => {
    let n = reco.filter((r) => r.priorite === niveau).length;
    for (const cle of POOL[niveau]) { if (n >= 2) break; if (seen.has(cle)) continue; seen.add(cle); add(cle, niveau); n++; }
  });

  // Alertes douces.
  if (pris.has('bruleur')) {
    alertes.push('Tu mentionnes un brûleur de graisse : son effet est très limité et ce n\'est pas une priorité. L\'essentiel reste ton alimentation et ton activité — tu peux tout à fait t\'en passer.');
  }
  if (pris.has('vitamines') && pris.has('magnesium')) {
    alertes.push('Vitamines/minéraux et magnésium peuvent se recouper : vérifie les doses pour ne pas cumuler inutilement.');
  }
  if (prisRaw.length >= 4) {
    alertes.push('Tu prends déjà plusieurs compléments. Tu pourrais simplifier en gardant surtout ceux marqués « essentiel pour toi », et éviter l\'accumulation.');
  }

  const labels = prisRaw.map((c) => COMPLEMENT_LABELS[c] || c);
  const resume = labels.length
    ? 'Tu prends actuellement : ' + labels.join(', ') + (profil.complementsDetail ? ` (${profil.complementsDetail}).` : '.')
    : '';

  return { resume, reco, alertes };
}

const PRIORITE_LABEL = {
  essentiel: 'Essentiel pour toi', aide: 'Peut t\'aider', envisager: 'À envisager',
  // compat retro (anciens niveaux)
  indispensable: 'Essentiel pour toi', utile: 'Essentiel pour toi', optionnel: 'À envisager',
};

function openComplements() {
  renderComplements(); $('#complementsPanel').classList.remove('hidden');
  // Comportement « page » : l'onglet Compléments s'allume dans la sidebar.
  $$('#bottom-nav .nav-i').forEach((b) => b.classList.toggle('on', b.dataset.tab === 'complements'));
}
function closeComplements() {
  $('#complementsPanel').classList.add('hidden');
  // Rend la surbrillance à l'onglet de fond réellement affiché.
  const cur = ($('#screen-result') && $('#screen-result').getAttribute('data-tab')) || 'plan';
  $$('#bottom-nav .nav-i').forEach((b) => b.classList.toggle('on', b.dataset.tab === cur));
}

// Une carte produit du niveau.
function complementCarte(r) {
  const handle = COMPLEMENT_SHOP[r.cle];
  const suivi = estComplementSuivi(r.cle);
  const shopUrl = handle ? `${SHOP_BASE}${handle}${SHOP_UTM}` : '';
  const shopBtn = shopUrl
    ? `<a class="comp-shop" href="${shopUrl}" target="_blank" rel="noopener noreferrer">${icSvg('cart')} Voir le produit</a>` : '';
  const actionBtn = `<button type="button" class="comp-add${suivi ? ' is-on' : ''}" data-comp-toggle="${r.cle}">${icSvg(suivi ? 'check' : 'plus')} ${suivi ? 'Dans mon plan' : 'Ajouter à mon plan'}</button>`;
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
        </div>
        <div class="comp-role">${escapeHtml(r.role)}</div>
        <div class="comp-moment">${icSvg('clock')} Quand : ${escapeHtml(complementMoment(r.cle))}</div>
        <div class="comp-actions">${actionBtn}${shopBtn}</div>
      </div>
    </div>`;
}
function renderComplements() {
  const data = recommanderComplements(state.profil, state.preferences);
  const alertes = data.alertes.map((a) => `<div class="comp-alert">${icSvg('spark')} ${escapeHtml(a)}</div>`).join('');
  // 3 niveaux affichés en haut, dans l'ordre voulu.
  const NIVEAUX = [
    { key: 'essentiel', titre: 'Les essentiels', sous: 'Le socle pour ton objectif.' },
    { key: 'envisager', titre: 'À envisager', sous: 'Des optimisations utiles, sans être indispensables.' },
    { key: 'aide', titre: 'Peut t\'aider', sous: 'Un coup de pouce selon ton ressenti.' },
  ];
  const sections = NIVEAUX.map((niv) => {
    const items = data.reco.filter((r) => r.priorite === niv.key);
    if (!items.length) return '';
    return `<div class="comp-tier"><div class="comp-tier-head"><h3 class="comp-tier-title comp-tier-${niv.key}">${niv.titre}</h3><span class="comp-tier-sub">${niv.sous}</span></div>${items.map(complementCarte).join('')}</div>`;
  }).join('');
  const actifs = complementsActifs();
  const suivisBlock = actifs.length ? `
    <div class="recipe-section-title">Dans ton plan</div>
    <div class="comp-suivis">${actifs.map((c) =>
      `<span class="comp-chip"><strong>${escapeHtml(c.nom)}</strong><em>${escapeHtml(c.moment)}</em><button type="button" class="comp-chip-x" data-comp-toggle="${c.cle}" aria-label="Retirer">${icSvg('x')}</button></span>`).join('')}</div>` : '';
  $('#complementsBody').innerHTML = `
    ${data.resume ? `<div class="comp-resume">${escapeHtml(data.resume)}</div>` : ''}
    ${sections}
    ${suivisBlock}
    ${alertes ? `<div class="recipe-section-title">À noter</div>${alertes}` : ''}
    <p class="panel-sub" style="margin-top:16px">Informations générales, non médicales. Produits proposés par Biloba Nutrition. Les compléments sont une aide secondaire, jamais la base du résultat. Ajoutes-en à ton plan pour les retrouver chaque jour et suivre leur prise.</p>`;
  $$('#complementsBody [data-comp-toggle]').forEach((b) => b.addEventListener('click', () => toggleComplementSuivi(b.dataset.compToggle)));
}

// ---------- Export agenda (.ics) (E3) ----------
// Horaires FIXES des repas dans l'agenda (demande client) : petit-dej 7h,
// collation du matin 10h, dejeuner 12h, collation de l'apres-midi 15h30,
// diner 19h, collation du soir 21h. La collation « apres sport » (sans heure
// planifiee) est placee a 17h par defaut. Format [heure, minute, duree_min].
const COLLATION_HEURES = { matin: [10, 0, 15], 'apres-midi': [15, 30, 15], 'apres-sport': [17, 0, 15], soir: [21, 0, 15] };
const CRENEAU_HEURES = { 'petit-dejeuner': [7, 0, 30], dejeuner: [12, 0, 45], diner: [19, 0, 45] };
// Horaire d'un creneau. Les collations sont differenciees par leur libelle
// (matin / apres-midi / apres-sport / soir) via collationMomentKey.
function creneauHeures(creneau, label) {
  if (creneau === 'collation') return COLLATION_HEURES[collationMomentKey(label)] || COLLATION_HEURES['apres-midi'];
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
      const [hh, mm, dur] = creneauHeures(repas.creneau, repas.label);
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
    communauteUnlocked: state.communauteUnlocked, communauteJoined: state.communauteJoined,
    communauteVue: state.communauteVue, communautePosts: (state.communautePosts || []).slice(0, 30),
    challengesParticipe: state.challengesParticipe || [], challengesValides: state.challengesValides || {},
    conseilsJour: state.conseilsJour, conseilsAjouts: state.conseilsAjouts,
    startDate: state.startDate,
    savedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(payload));
    $('#saveState').innerHTML = icSvg('check') + ' Plan sauvegarde';
  } catch (e) { console.warn('Sauvegarde locale échouée (quota / navigation privée) — la copie serveur prend le relais :', e && e.message); }
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
    }).catch((e) => { console.warn('Sauvegarde serveur échouée (copie locale conservée, resync au prochain enregistrement) :', e && e.message); });
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
    state.challengesParticipe = Array.isArray(data.challengesParticipe) ? data.challengesParticipe : [];
    state.challengesValides = data.challengesValides || {};
    state.conseilsJour = data.conseilsJour || {};
    state.conseilsAjouts = data.conseilsAjouts || {};
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
    showToast('Ton plan commence aujourd’hui — nous l’avons adapté à ton jour de démarrage.', { icon: 'calendar', duration: 4600 });
    // Plan généré : on débloque l'espace Communauté et on propose de le découvrir.
    state.communauteUnlocked = true;
    revealCommunaute();
    revealParcours();
    renderCommunaute();
    showCommunauteIntro();
    saveLocal();
    // Moment pertinent pour proposer les notifications (après création du plan).
    setTimeout(() => { try { maybeShowPushBanner(); } catch (_) { /* ignore */ } }, 5200);
  } catch (e) {
    const detail = (e && e.message && !/^Erreur$/.test(e.message)) ? '\n(' + e.message + ')' : '';
    alert('Désolé, la génération a échoué. Réessaie dans un instant.' + detail);
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
    if (!badge) return;
    // Indicateur technique (backend de génération) : réservé à l'admin, jamais devant un client.
    if (!(typeof isMainAdmin === 'function' && isMainAdmin())) { badge.classList.add('hidden'); return; }
    badge.classList.remove('hidden');
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
  applyForcedObjectif(); // masque l'étape objectif + force 'challenge' si FORCE_CHALLENGE
  personalizeStaticUI(); // prénom du client/coach dans les libellés statiques
  goToStep(FIRST_STEP);
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
  $('#sosFab').addEventListener('click', openCoachChat); // SOS coach -> discussion privée avec le coach identifié
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
  refreshCoachIaBadge();
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
  // (Bouton « Scanner un produit » retiré de la liste de courses.)
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
  // Panneau « Pesée de la semaine » retiré (le client ne se pèse plus lui-même).
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

  // Messagerie privée client <-> coach
  const _bContact = $('#btnContactCoach'); if (_bContact) _bContact.addEventListener('click', openCoachChat);
  $('#coachChatClose').addEventListener('click', closeCoachChat);
  $('#coachChatPanel').addEventListener('click', (e) => { if (e.target.id === 'coachChatPanel') closeCoachChat(); });
  $('#coachChatForm').addEventListener('submit', (e) => { e.preventDefault(); const inp = $('#coachChatInput'); const v = inp ? inp.value : ''; if (!v.trim()) return; sendCoachChat(v).then((ok) => { if (ok && inp) inp.value = ''; }); });
  const _bMsgCoach = $('#btnMessagesCoach'); if (_bMsgCoach) _bMsgCoach.addEventListener('click', openMessagesCoach);
  $('#messagesCoachClose').addEventListener('click', closeMessagesCoach);
  $('#messagesCoachPanel').addEventListener('click', (e) => { if (e.target.id === 'messagesCoachPanel') closeMessagesCoach(); });
  { const wc = $('#coachWallClose'); if (wc) wc.addEventListener('click', closeCoachWall); }
  { const wp = $('#coachWallPanel'); if (wp) wp.addEventListener('click', (e) => { if (e.target.id === 'coachWallPanel') closeCoachWall(); }); }

  // Dashboard coach
  const _coachMsgs = $('#coachOpenMessages'); if (_coachMsgs) _coachMsgs.addEventListener('click', openMessagesCoach);
  const _coachWall = $('#coachOpenWall'); if (_coachWall) _coachWall.addEventListener('click', openCoachWall);
  const _coachBack = $('#coachBack'); if (_coachBack) _coachBack.addEventListener('click', () => { location.href = '/coach/'; });
  const _coachLogout = $('#coachLogout'); if (_coachLogout) _coachLogout.addEventListener('click', logoutClient);

  // Gestion des photos de plats (admin/coach) + chargement de l'index (clients voient les photos)
  const _bPlatsPhotos = $('#btnPlatsPhotos'); if (_bPlatsPhotos) _bPlatsPhotos.addEventListener('click', openPlatsPhotos);
  const _bCoachIa = $('#btnCoachIaAdmin'); if (_bCoachIa) _bCoachIa.addEventListener('click', openCoachIaAdmin);
  const _bCoachFaq = $('#btnCoachFaq'); if (_bCoachFaq) _bCoachFaq.addEventListener('click', openCoachFaq);
  const _bQuickOpt = $('#btnQuickOptions'); if (_bQuickOpt) _bQuickOpt.addEventListener('click', openQuickOptions);
  const _bReset = $('#btnResetClients'); if (_bReset) _bReset.addEventListener('click', resetClientsData);
  const _coachPhotos = $('#coachOpenPhotos'); if (_coachPhotos) _coachPhotos.addEventListener('click', openPlatsPhotos);
  const _coachAdh = $('#coachOpenAdh'); if (_coachAdh) _coachAdh.addEventListener('click', openAdhAdmin);
  const _coachHelp = $('#coachOpenHelp'); if (_coachHelp) _coachHelp.addEventListener('click', openHelpAdmin);
  const _coachScans = $('#coachOpenScans'); if (_coachScans) _coachScans.addEventListener('click', openScanAdmin);
  const _coachPlate = $('#coachOpenPlate'); if (_coachPlate) _coachPlate.addEventListener('click', openPlateAdmin);
  $('#platsPhotosClose').addEventListener('click', closePlatsPhotos);
  $('#platsPhotosPanel').addEventListener('click', (e) => { if (e.target.id === 'platsPhotosPanel') closePlatsPhotos(); });
  $('#coachIaClose').addEventListener('click', closeCoachIaAdmin);
  $('#coachIaPanel').addEventListener('click', (e) => { if (e.target.id === 'coachIaPanel') closeCoachIaAdmin(); });
  const _faqClose = $('#coachFaqClose'); if (_faqClose) _faqClose.addEventListener('click', closeCoachFaq);
  const _faqPanel = $('#coachFaqPanel'); if (_faqPanel) _faqPanel.addEventListener('click', (e) => { if (e.target.id === 'coachFaqPanel') closeCoachFaq(); });
  $('#quickOptClose').addEventListener('click', closeQuickOptions);
  $('#quickOptPanel').addEventListener('click', (e) => { if (e.target.id === 'quickOptPanel') closeQuickOptions(); });
  // Panneau de saisie de pesée client retiré (pesées officielles saisies par le coach).
  const _bChangePin = $('#btnChangePin'); if (_bChangePin) _bChangePin.addEventListener('click', openChangePin);
  const _bLogout = $('#btnLogout'); if (_bLogout) _bLogout.addEventListener('click', logoutClient);
  const _navLogout = $('#navLogout'); if (_navLogout) _navLogout.addEventListener('click', logoutClient);
  const _bPush = $('#btnPushPrefs'); if (_bPush) _bPush.addEventListener('click', openPushPrefs);
  const _pushClose = $('#pushPrefsClose'); if (_pushClose) _pushClose.addEventListener('click', closePushPrefs);
  const _pushPanel = $('#pushPrefsPanel'); if (_pushPanel) _pushPanel.addEventListener('click', (e) => { if (e.target.id === 'pushPrefsPanel') closePushPrefs(); });
  const _bEbooks = $('#btnEbooks'); if (_bEbooks) _bEbooks.addEventListener('click', openEbooks);
  const _ebkClose = $('#ebooksClose'); if (_ebkClose) _ebkClose.addEventListener('click', closeEbooks);
  const _ebkPanel = $('#ebooksPanel'); if (_ebkPanel) _ebkPanel.addEventListener('click', (e) => { if (e.target.id === 'ebooksPanel') closeEbooks(); });
  const _bEbooksAdmin = $('#btnEbooksAdmin'); if (_bEbooksAdmin) _bEbooksAdmin.addEventListener('click', openEbooksAdmin);
  const _ebkAClose = $('#ebooksAdminClose'); if (_ebkAClose) _ebkAClose.addEventListener('click', closeEbooksAdmin);
  const _ebkAPanel = $('#ebooksAdminPanel'); if (_ebkAPanel) _ebkAPanel.addEventListener('click', (e) => { if (e.target.id === 'ebooksAdminPanel') closeEbooksAdmin(); });
  const _cpClose = $('#changePinClose'); if (_cpClose) _cpClose.addEventListener('click', closeChangePin);
  const _cpSave = $('#cpSave'); if (_cpSave) _cpSave.addEventListener('click', saveChangePin);
  const _cpPanel = $('#changePinPanel'); if (_cpPanel) _cpPanel.addEventListener('click', (e) => { if (e.target.id === 'changePinPanel') closeChangePin(); });
  $('#coachParcoursClose').addEventListener('click', closeCoachParcours);
  $('#coachParcoursPanel').addEventListener('click', (e) => { if (e.target.id === 'coachParcoursPanel') closeCoachParcours(); });
  $('#coachFicheClose').addEventListener('click', closeCoachFiche);
  $('#coachFichePanel').addEventListener('click', (e) => { if (e.target.id === 'coachFichePanel') closeCoachFiche(); });
  fetchPhotoIndex();
  fetchQuickOptions();

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

  // Notifications push : SW + deep links + re-souscription silencieuse (jamais de demande ici).
  bootPush();

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

  $('#navRestart').addEventListener('click', () => { if (confirm('Recommencer depuis le début ?')) showScreen('landing'); });

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeRecipe(); closeShopping(); closeFavoris(); closeFiche(); closeSuivi(); closeAnalyse(); closeComplements(); closeAvance(); closeHelp(); closeHelpAdmin(); closeScan(); closeScanAdmin(); closeSuiviPlan(); closeAdhAdmin(); closeDemoAdmin(); closePlate(); closePlateAdmin(); closeAgenda(); closeSos(); closeCoachChat(); closeMessagesCoach(); closeCoachWall(); closePlatsPhotos(); closeCoachFiche(); closeCoachIaAdmin(); closeQuickOptions(); closeCoachParcours(); closeChangePin(); closePushPrefs(); closeEbooks(); closeEbooksAdmin(); } });

  if (window.__NUTRI_COACH) {
    // Coach : on n'affiche PAS le parcours client (onboarding/plan), mais son dashboard.
    bootCoachDashboard();
    showScreen('coach');
    refreshNotifications();
  } else if (loadLocal()) {
    $('#portValue').textContent = state.portions;
    // Reconnexion : on garde la date de demarrage (ne pas reinitialiser le plan),
    // on recalcule juste ou en est l'utilisateur et on ouvre sur la journee du jour.
    ancrerDemarragePlan(false);
    renderNeeds();
    renderPlan();
    // Un plan existe deja (genere avant ou apres l'ajout de la communaute) =>
    // la partie alimentation est terminee, on debloque l'espace Communaute.
    if (!state.communauteUnlocked) { state.communauteUnlocked = true; saveLocal(); }
    revealCommunaute();
    revealParcours();
    renderCommunaute();
    showCommunauteIntro();
    $('#saveState').innerHTML = icSvg('check') + ' Plan restaure';
    showScreen('result');
    refreshNotifications();
    checkOfficialAdjustment(); // recalcul du plan si une pesée officielle S3/S6 vient d'être enregistrée par le coach
  } else if (isDemo()) {
    showScreen('demo-welcome'); // accueil démo avant le parcours client
  }
}

// ---------- Demande d'aide alimentaire (accompagnement coach) ----------
const HELP_OPTIONS = [
  { key: 'plan', label: "J'ai du mal à respecter mon plan" },
  { key: 'faim', label: "J'ai trop faim" },
  { key: 'grignote', label: 'Je grignote' },
  { key: 'idees', label: "Je manque d'idées de repas" },
  { key: 'exterieur', label: "Je mange souvent à l'extérieur" },
  { key: 'quantites', label: "Je n'arrive pas à gérer les quantités" },
  { key: 'sucre', label: "J'ai des envies de sucre" },
  { key: 'temps', label: "Je n'ai pas le temps de cuisiner" },
  { key: 'demotive', label: 'Je suis démotivé(e)' },
  { key: 'autre', label: 'Autre' },
];
const HELP_STATUS = { a_traiter: 'À traiter', en_cours: 'En cours', traite: 'Traité' };

// Utilisateur de l'app principale (meme origine) — pour le nom client + l'acces coach.
function mainAppUser() {
  try { return JSON.parse(localStorage.getItem('currentUser') || 'null'); } catch (_) { return null; }
}
function helpClientName() {
  const u = mainAppUser();
  return (u && u.name) || (state.profil && (state.profil.prenom || state.profil.nom)) || 'Client';
}
// Prénom du CLIENT (saisi à l'inscription) — pour personnaliser l'app « c'est TON programme ».
// Source : compte client (window.__NUTRI_USER), sinon le profil. Vide si inconnu (démo/coach).
function clientPrenom() {
  const u = window.__NUTRI_USER;
  const p = (u && u.prenom) || (state.profil && state.profil.prenom) || '';
  return String(p || '').trim().split(' ')[0];
}
// Prénom du COACH connecté (pour personnaliser son espace).
function coachPrenom() {
  const c = (window.__NUTRI_COACH && window.__NUTRI_COACH.name) || (mainAppUser() && mainAppUser().name) || '';
  return String(c || '').trim().split(' ')[0];
}
// Personnalise les libellés STATIQUES avec le prénom (titre du profil, etc.).
function personalizeStaticUI() {
  const pt = $('#view-profil .profil-title');
  if (pt) {
    const cp = clientPrenom();
    if (cp) pt.textContent = 'Ton espace, ' + cp;
    else if (window.__NUTRI_COACH && coachPrenom()) pt.textContent = 'Bonjour ' + coachPrenom();
  }
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
  if (!selected.length && !message) { alert('Indique au moins une difficulté ou un petit message.'); return; }
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
    alert("Oups, l'envoi n'a pas fonctionné. Réessaie dans un instant.");
  } finally { btn.disabled = false; }
}

// ---------- SOS coach : bouton flottant + feuille (reutilise /api/help-request) ----------
// ---------- Coach IA conversationnel ----------
const OBJ_LABELS = { perte: 'Perte de poids', maintien: 'Maintien', muscle: 'Prise de muscle', energie: 'Plus d\'énergie', challenge: 'Challenge 6/6' };
const ACT_LABELS = { sedentaire: 'sédentaire', leger: 'léger', modere: 'modéré', actif: 'actif', tres_actif: 'très actif' };
// Suggestions par défaut (alignées sur les réponses préenregistrées) ; remplacées
// au chargement par les questions réelles renvoyées par le serveur (/coach-faq/suggest).
const COACH_CHIPS = [
  'J\'ai faim entre les repas, que faire ?',
  'Quoi manger après le sport ?',
  'J\'ai fait un écart, c\'est grave ?',
  'Une envie de sucre, je fais quoi ?',
  'Je ne sais pas quoi manger',
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
  if (p.objectif === 'challenge') {
    const ch = ['Inscrit au Challenge 6/6 (perte accélérée sur 6 semaines)'];
    if (p.deficit_cible) ch.push('déficit visé ~' + p.deficit_cible + ' kcal/jour');
    const aj = Math.round(Number(p.ajustementKcal) || 0);
    if (aj) ch.push('ajustement auto en cours : ' + (aj > 0 ? '+' : '') + aj + ' kcal');
    L.push(ch.join(' — '));
  }
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
  const paint = (list) => { box.innerHTML = (list && list.length ? list : COACH_CHIPS).map((q) => `<button type="button" class="coach-chip" data-q="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join(''); };
  paint(COACH_CHIPS); // affichage immédiat
  // Remplace par les questions réelles du serveur (garanties d'avoir une réponse).
  fetch(apiUrl('/api/coach-faq/suggest'), { headers: nutriAuthHeaders() })
    .then((r) => r.json())
    .then((d) => { if (d && d.ok && Array.isArray(d.questions) && d.questions.length) paint(d.questions); })
    .catch(() => {});
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
    // 1) Réponses préenregistrées (GRATUIT) — priorité : instantané, 0 coût.
    //    human:true -> le client garde le lien « Prévenir mon coach » si ça ne lui convient pas.
    let answered = false;
    try {
      const fr = await fetch(apiUrl('/api/coach-faq/match'), {
        method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ question: text }),
      });
      const fd = await fr.json();
      if (fd && fd.ok && fd.match && fd.match.reponse) {
        state.coachMessages.push({ role: 'assistant', content: fd.match.reponse, human: true });
        answered = true;
      }
    } catch (_) { /* FAQ indispo -> on tente l'IA / le coach humain ci-dessous */ }
    // 2) Sinon : Coach IA si activé (payant), sinon bascule coach humain.
    if (!answered) {
      const res = await fetch(apiUrl('/api/coach'), {
        method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ messages: state.coachMessages.slice(-18), contexte: coachContext() }),
      });
      const d = await res.json();
      if (d && d.ok && d.reponse) state.coachMessages.push({ role: 'assistant', content: d.reponse });
      else if (d && d.ia === false) state.coachMessages.push({ role: 'assistant', content: "Je n'ai pas de réponse toute prête à cette question précise. Tu peux la reformuler plus simplement, ou prévenir ton coach — il reviendra vers toi pour t'aider.", human: true });
      else state.coachMessages.push({ role: 'assistant', content: "Je n'ai pas réussi à répondre à l'instant. Réessaie dans un moment 🙏" });
    }
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
// ---------- Espace Communauté : FIL D'ACTIVITÉ (auto-alimenté) ----------
// Réactions du fil (emoji) — alignées sur le backend (love/fire/muscle/clap).
const FEED_REACTIONS = [
  { type: 'love', emo: '❤️', label: 'J’aime' },
  { type: 'fire', emo: '🔥', label: 'Bravo' },
  { type: 'muscle', emo: '💪', label: 'Force' },
  { type: 'clap', emo: '👏', label: 'Bien joué' },
];
// Exemples illustratifs affichés UNIQUEMENT en mode démo (présentation commerciale) :
// jamais montrés à un vrai client (le fil réel ne contient que de l'activité réelle).
const FEED_DEMO = [
  { id: 'demo1', who: 'Paul', emoji: '🔥', text: 'Paul a validé 5 journées d’affilée', when: new Date(Date.now() - 12 * 60000).toISOString(), reactions: { fire: 4, muscle: 2 }, myReaction: null },
  { id: 'demo2', who: 'Julie', emoji: '💧', text: 'Julie a atteint son objectif d’hydratation aujourd’hui', when: new Date(Date.now() - 95 * 60000).toISOString(), reactions: { love: 3 }, myReaction: null },
  { id: 'demo3', who: 'Le groupe', emoji: '🔥', text: 'Le groupe a dépassé 100 repas validés cette semaine', when: new Date(Date.now() - 3 * 3600000).toISOString(), reactions: { clap: 6, fire: 5 }, myReaction: null },
  { id: 'demo4', who: 'Thomas', emoji: '💪', text: 'Thomas a terminé sa 3e séance de la semaine', when: new Date(Date.now() - 5 * 3600000).toISOString(), reactions: { muscle: 3, clap: 2 }, myReaction: null },
  { id: 'demo5', who: 'Sophie', emoji: '👋', text: 'Bienvenue à Sophie dans le groupe', when: new Date(Date.now() - 26 * 3600000).toISOString(), reactions: { love: 5 }, myReaction: null },
];
// Catalogue des défis du groupe (participation/validation stockées côté client).
const COMMUNAUTE_CHALLENGES = [
  { id: 'hydra', ic: 'leaf', t: 'Hydratation 2 L / jour', obj: 'Boire 2 L d’eau chaque jour', part: 0.72 },
  { id: 'sport', ic: 'flame', t: '5 séances d’activité', obj: '5 séances cette semaine', part: 0.48 },
  { id: 'sucre', ic: 'spark', t: 'Semaine sans sucre ajouté', obj: '7 jours sans sucre ajouté', part: 0.55 },
  { id: 'pas', ic: 'chart', t: '10 000 pas par jour', obj: '10 000 pas chaque jour', part: 0.4 },
];
// Réactions rapides du mur (libellés positifs et non sensibles).
const COMMUNAUTE_REACTIONS = [
  { type: 'bravo', label: 'Bravo', emo: '👏' },
  { type: 'force', label: 'Force', emo: '💪' },
  { type: 'moi-aussi', label: 'Moi aussi', emo: '🙌' },
  { type: 'bien-joue', label: 'Bien joué', emo: '🔥' },
  { type: 'courage', label: 'Courage', emo: '✊' },
  { type: 'aide', label: 'Besoin d’aide', emo: '🆘' },
];
// Choix du bouton « J'ai besoin d'aide » -> Coach IA (ia) ou alerte coach humain (coach).
const COMMUNAUTE_AIDE = [
  { key: 'faim', label: 'J’ai faim', emo: '🍽️', dest: 'ia', q: 'J’ai faim là, qu’est-ce que tu me conseilles de manger ?' },
  { key: 'craque', label: 'J’ai craqué', emo: '😔', dest: 'coach', diff: 'J’ai craqué sur un écart' },
  { key: 'quoi', label: 'Je ne sais pas quoi manger', emo: '🤔', dest: 'ia', q: 'Je ne sais pas quoi manger maintenant, une idée simple ?' },
  { key: 'remplacer', label: 'Remplacer un aliment', emo: '🔁', dest: 'ia', q: 'Je veux remplacer un aliment de mon plan, par quoi ?' },
  { key: 'motivation', label: 'Je manque de motivation', emo: '🔋', dest: 'coach', diff: 'Je manque de motivation' },
  { key: 'question', label: 'Une question nutrition', emo: '💬', dest: 'ia', q: '' },
];
// Le mur du groupe et les stats sont chargés en temps réel depuis le serveur.

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
    '<div class="comm-intro-tx"><strong>' + (clientPrenom() ? escapeHtml(clientPrenom()) + ', ton plan est prêt.' : 'Ton plan alimentaire est prêt.') + '</strong> Rejoins la communauté du challenge pour avancer avec le groupe.</div>' +
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
  fetchCommunaute();
  showToast('Bienvenue dans ton groupe de challenge 🎉', { icon: 'check' });
}

// --- Mur collectif (messages réels, partagés via le serveur) ---
function commTimeAgo(iso) {
  const t = Date.parse(iso || '');
  if (!t) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'à l’instant';
  const m = Math.floor(s / 60); if (m < 60) return 'il y a ' + m + ' min';
  const h = Math.floor(m / 60); if (h < 24) return 'il y a ' + h + ' h';
  const d = Math.floor(h / 24); if (d < 7) return 'il y a ' + d + ' j';
  return new Date(t).toLocaleDateString('fr-FR');
}

let _commPoll = null;
function startCommunautePoll() {
  stopCommunautePoll();
  _commPoll = setInterval(() => {
    const screen = $('#screen-result');
    if (screen && screen.getAttribute('data-tab') === 'communaute' && state.communauteJoined) { fetchCommunauteFeed(); fetchCommunauteOverview(); fetchCommunaute(); }
    else stopCommunautePoll();
  }, 15000);
}
function stopCommunautePoll() { if (_commPoll) { clearInterval(_commPoll); _commPoll = null; } }

async function fetchCommunaute() {
  try {
    const res = await fetch(apiUrl('/api/community/messages?limit=40'), { headers: nutriAuthHeaders() });
    const data = await res.json();
    if (data && data.ok) {
      state.communauteMessages = data.messages || [];
      state.communauteMembers = data.members || 0;
      renderCommunauteWall();
      applyCoachTip();
      const mb = $('#commMembers'); if (mb) mb.textContent = state.communauteMembers || '—';
    }
  } catch (_) { /* hors-ligne : on garde l'affichage courant */ }
}

async function postCommunaute(text, kind) {
  const msg = String(text || '').trim();
  if (!msg) return false;
  try {
    const res = await fetch(apiUrl('/api/community/messages'), {
      method: 'POST',
      headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ message: msg, kind: kind || 'message' }),
    });
    const data = await res.json();
    if (data && data.ok && data.message) {
      state.communauteMessages = [data.message].concat(state.communauteMessages || []);
      renderCommunauteWall();
      return true;
    }
    showToast((data && data.error) || 'Publication impossible.', { icon: 'info' });
  } catch (_) { showToast('Connexion requise pour publier au groupe.', { icon: 'info' }); }
  return false;
}

function commReactBar(m) {
  // Barre de réactions rapides sous chaque message (sauf les miens).
  const counts = m.reactions || {};
  const mine = m.myReaction || null;
  return '<div class="comm2-reacts">' + COMMUNAUTE_REACTIONS.map((r) => {
    const n = counts[r.type] || 0;
    const on = mine === r.type ? ' on' : '';
    return '<button type="button" class="comm2-react' + on + '" data-react-id="' + m.id + '" data-react-type="' + r.type + '" title="' + r.label + '">' +
      r.emo + (n ? ' <span class="comm2-react-n">' + n + '</span>' : '') + '</button>';
  }).join('') + '</div>';
}
function renderCommunauteWall() {
  const wall = $('#commWall');
  if (!wall) return;
  const msgs = state.communauteMessages || [];
  if (!msgs.length) { wall.innerHTML = '<p class="comm-empty">Sois le premier à écrire au groupe 👋</p>'; return; }
  wall.innerHTML = msgs.map((m) => {
    const isCoach = m.kind === 'coach';
    const av = isCoach ? '<div class="comm-av coach">C</div>' : '<div class="comm-av">' + escapeHtml((m.who || '?').charAt(0)) + '</div>';
    const tag = m.kind === 'partage' ? ' <span class="comm-tag">journée validée</span>' : (isCoach ? ' <span class="comm-tag coach">coach</span>' : '');
    return '<div class="comm-msg comm-post ' + (m.mine ? 'me' : '') + (isCoach ? ' is-coach' : '') + '">' + av +
      '<div class="comm-bub"><b>' + escapeHtml(m.who || 'Client') + '</b> <span class="when">· ' + escapeHtml(commTimeAgo(m.when)) + '</span>' + tag +
        '<p>' + escapeHtml(m.text || '') + '</p>' + commReactBar(m) + '</div></div>';
  }).join('');
  wall.querySelectorAll('.comm2-react').forEach((b) => b.addEventListener('click', () => reactCommunaute(Number(b.dataset.reactId), b.dataset.reactType)));
}

// Toggle d'une réaction sur un message du mur.
async function reactCommunaute(id, type) {
  try {
    const res = await fetch(apiUrl('/api/community/messages/' + id + '/react'), {
      method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ type }),
    });
    const d = await res.json();
    if (d && d.ok) {
      const m = (state.communauteMessages || []).find((x) => x.id === id);
      if (m) { m.reactions = d.reactions || {}; m.myReaction = d.myReaction || null; renderCommunauteWall(); }
    }
  } catch (_) { /* silencieux */ }
}

// ----- Bloc 4 : partage de la journée validée (avec mot personnel facultatif) -----
function partagerJournee() {
  const di = (typeof indexJourActuel === 'function') ? indexJourActuel() : 0;
  if (typeof dayIsComplete === 'function' && !dayIsComplete(di)) {
    showToast('Valide d’abord tous tes repas du jour pour le partager au groupe.', { icon: 'info' });
    return;
  }
  const box = $('#commShareBox');
  if (box) {
    box.classList.toggle('hidden');
    if (!box.classList.contains('hidden')) { const i = $('#commShareInput'); if (i) setTimeout(() => i.focus(), 50); }
  }
}
function confirmPartage() {
  const inp = $('#commShareInput');
  const perso = inp ? inp.value.trim() : '';
  const txt = 'Journée validée aujourd’hui.' + (perso ? ' ' + perso : '');
  postCommunaute(txt, 'partage').then((ok) => {
    if (ok) { showToast('Journée partagée au groupe 🎉', { icon: 'check' }); const b = $('#commShareBox'); if (b) b.classList.add('hidden'); if (inp) inp.value = ''; fetchCommunauteOverview(); }
  });
}

// ----- Bloc 2 : défis (participation/validation côté client) -----
function challengeCard(c) {
  const today = (typeof ymd === 'function' && typeof todayMidnight === 'function') ? ymd(todayMidnight()) : new Date().toISOString().slice(0, 10);
  const participe = (state.challengesParticipe || []).includes(c.id);
  const valideToday = (state.challengesValides || {})[c.id] === today;
  const members = (state.communauteOverview && state.communauteOverview.members) || state.communauteMembers || 0;
  const part = Math.max(1, Math.round(members * c.part)) + (participe ? 1 : 0);
  const pct = valideToday ? 100 : (participe ? 45 : 8);
  let btn;
  if (valideToday) btn = '<button type="button" class="comm2-chal-btn done" disabled>' + icSvg('check') + ' Validé</button>';
  else if (participe) btn = '<button type="button" class="comm2-chal-btn go" data-chal-go="' + c.id + '">Valider aujourd’hui</button>';
  else btn = '<button type="button" class="comm2-chal-btn" data-chal-join="' + c.id + '">Je participe</button>';
  return '<div class="comm2-chal' + (valideToday ? ' done' : '') + '">' +
    '<div class="comm2-chal-ic">' + icSvg(c.ic) + '</div>' +
    '<div class="comm2-chal-main"><b>' + escapeHtml(c.t) + '</b><span>' + escapeHtml(c.obj) + '</span>' +
      '<div class="comm2-chal-prog"><span style="width:' + pct + '%"></span></div>' +
      '<small>' + part + ' participant' + (part > 1 ? 's' : '') + '</small></div>' + btn + '</div>';
}
function joinChallenge(id) {
  const a = state.challengesParticipe || (state.challengesParticipe = []);
  if (!a.includes(id)) a.push(id);
  saveLocal(); showToast('Tu participes au défi 💪', { icon: 'check' }); renderCommunaute();
}
function validateChallenge(id) {
  const today = (typeof ymd === 'function' && typeof todayMidnight === 'function') ? ymd(todayMidnight()) : new Date().toISOString().slice(0, 10);
  state.challengesValides = state.challengesValides || {};
  state.challengesValides[id] = today;
  if (!(state.challengesParticipe || []).includes(id)) (state.challengesParticipe || (state.challengesParticipe = [])).push(id);
  saveLocal(); showToast('Défi validé pour aujourd’hui 🔥', { icon: 'check' }); renderCommunaute();
}

// ----- Bloc 5 : besoin d'aide -> Coach IA ou alerte coach humain -----
function commHelpBoxHtml() {
  return '<p class="comm2-help-t">Comment peut-on t’aider ?</p><div class="comm2-help-grid">' +
    COMMUNAUTE_AIDE.map((o) => '<button type="button" class="comm2-help-opt" data-aide="' + o.key + '"><span class="comm2-help-emo">' + o.emo + '</span>' + escapeHtml(o.label) + '</button>').join('') +
    '</div>';
}
function openCommHelp() { const b = $('#commHelpBox'); if (b) b.classList.toggle('hidden'); }
function commHelpChoice(key) {
  const o = COMMUNAUTE_AIDE.find((x) => x.key === key); if (!o) return;
  const b = $('#commHelpBox'); if (b) b.classList.add('hidden');
  if (o.dest === 'ia') { openCoachIaAvec(o.q); return; }
  // Alerte au coach humain (réutilise les demandes d'aide existantes).
  fetch(apiUrl('/api/help-request'), { method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ difficultes: [o.diff], message: '' }) })
    .then((r) => r.json())
    .then((d) => showToast(d && d.ok ? 'Ton coach a été prévenu, il revient vers toi 💬' : 'Envoi impossible, réessaie.', { icon: d && d.ok ? 'check' : 'info' }))
    .catch(() => showToast('Connexion requise pour prévenir ton coach.', { icon: 'info' }));
}
function openCoachIaAvec(q) {
  if (typeof openSos === 'function') openSos();
  if (q && typeof sendCoach === 'function') sendCoach(q);
}

// ----- Bloc 3 : messages du coach (auto + publiés) & posts système -----
function renderCommCoachHtml() {
  const ov = state.communauteOverview;
  const msgs = (ov && ov.coachAuto && ov.coachAuto.length) ? ov.coachAuto : ['Bienvenue dans ton groupe ! Valide tes repas chaque jour, on avance ensemble. 💪'];
  return msgs.map((m) => '<div class="comm-msg"><div class="comm-av coach">C</div><div class="comm-bub"><b>Coach</b><p>' + escapeHtml(m) + '</p></div></div>').join('');
}
function renderCommSystemHtml() {
  const ov = state.communauteOverview;
  const posts = (ov && ov.systemPosts) || [];
  if (!posts.length) return '';
  return posts.map((p) => '<div class="comm2-sys">' + icSvg('spark') + '<span>' + escapeHtml(p) + '</span></div>').join('');
}
function coachPublishHtml() {
  return '<form id="commCoachForm" class="comm-compose comm2-coachform">' +
    '<textarea id="commCoachInput" rows="1" maxlength="500" placeholder="Publier un message au groupe (coach)…"></textarea>' +
    '<button type="submit" class="comm-send" aria-label="Publier">' + icSvg('send') + '</button></form>';
}

// Charge les stats de groupe réelles + messages auto + posts système.
async function fetchCommunauteOverview() {
  try {
    const res = await fetch(apiUrl('/api/community/overview'), { headers: nutriAuthHeaders() });
    const d = await res.json();
    if (d && d.ok) { state.communauteOverview = d; applyOverview(); }
  } catch (_) { /* hors-ligne */ }
}
function applyOverview() {
  const ov = state.communauteOverview; if (!ov) return;
  const mb = $('#commMembers'); if (mb) mb.textContent = ov.members || 0;
  const pctObj = (ov.objectif && ov.objectif.pct) || 0;
  const bar = $('#commProgBar'); if (bar) bar.style.width = pctObj + '%';
  const pp = $('#commProgPct'); if (pp) pp.textContent = pctObj; // le « % » est un élément séparé
  applyCoachTip();
}
// Conseil du coach (compact) : conseil AUTO contextuel. Les messages publiés par le
// coach apparaissent désormais dans le fil de l'équipe (mis en valeur), pas ici.
function applyCoachTip() {
  const el = $('#commCoachTip'); if (!el) return;
  const ov = state.communauteOverview;
  el.textContent = (ov && ov.coachAuto && ov.coachAuto[0])
    || 'Ta collation protéinée de l’après-midi aide à éviter les fringales du soir.';
}

function commStatTile(id, val, label) {
  return '<div class="comm2-stat"><b id="' + id + '">' + val + '</b><span>' + label + '</span></div>';
}

// ===== Fil d'activité (auto-alimenté) : rendu + réactions =====
function avatarColor(name) {
  let h = 0; const s = String(name || '?'); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return 'hsl(' + h + ', 42%, 50%)';
}
function feedAvatar(item) {
  if (item.who === 'Le groupe') return '<div class="feed-av is-group">' + icSvg('users') + '</div>';
  const ch = ((item.who || '?').trim().charAt(0) || '?').toUpperCase();
  return '<div class="feed-av" style="background:' + avatarColor(item.who) + '">' + escapeHtml(ch) + '</div>';
}
// État transient du fil (NON persisté) : commentaires ouverts + cache par élément.
let _feedOpenComments = new Set();
let _feedComments = {};
function feedReactBtn(id, r, n, on) {
  return '<button type="button" class="feed-react' + (on ? ' on' : '') + '" data-fid="' + escapeHtml(id) + '" data-ftype="' + r.type + '" title="' + r.label + '" aria-label="' + r.label + '">' +
    '<span class="feed-react-emo">' + r.emo + '</span>' + (n ? '<span class="feed-react-n">' + n + '</span>' : '') + '</button>';
}
// Seul le ❤️ (like) est visible au premier plan ; les autres emojis se choisissent
// via la palette « + ». Les réactions déjà posées restent visibles (preuve sociale).
function feedReactBar(item) {
  const counts = item.reactions || {}; const mine = item.myReaction || null; const id = item.id;
  let html = '<div class="feed-reacts">';
  html += feedReactBtn(id, FEED_REACTIONS[0], counts.love || 0, mine === 'love'); // ❤️ like
  FEED_REACTIONS.slice(1).forEach((r) => { if ((counts[r.type] || 0) > 0 || mine === r.type) html += feedReactBtn(id, r, counts[r.type] || 0, mine === r.type); });
  html += '<button type="button" class="feed-more-btn" data-more="' + escapeHtml(id) + '" aria-label="Plus de réactions">' + icSvg('plus') + '</button>';
  html += '<div class="feed-palette hidden" data-palette="' + escapeHtml(id) + '">' +
    FEED_REACTIONS.map((r) => '<button type="button" class="feed-pal-btn' + (mine === r.type ? ' on' : '') + '" data-fid="' + escapeHtml(id) + '" data-ftype="' + r.type + '" title="' + r.label + '">' + r.emo + '</button>').join('') + '</div>';
  return html + '</div>';
}
function togglePalette(id) {
  document.querySelectorAll('.feed-palette').forEach((p) => { if (p.dataset.palette === id) p.classList.toggle('hidden'); else p.classList.add('hidden'); });
}
// ----- Commentaires d'un élément du fil -----
function feedCommentBar(item) {
  const n = item.comments || 0;
  return '<button type="button" class="feed-cbtn" data-ctoggle="' + escapeHtml(item.id) + '">' + icSvg('message') +
    '<span>' + (n > 0 ? (n + (n > 1 ? ' commentaires' : ' commentaire')) : 'Commenter') + '</span></button>';
}
function feedCommentRow(c) {
  const ch = ((c.who || '?').trim().charAt(0) || '?').toUpperCase();
  return '<div class="feed-c-row"><div class="feed-c-av" style="background:' + avatarColor(c.who) + '">' + escapeHtml(ch) + '</div>' +
    '<div class="feed-c-bub"><span class="feed-c-head"><b>' + escapeHtml(c.who || 'Un membre') + '</b><span class="feed-c-when">' + escapeHtml(commTimeAgo(c.when)) + '</span></span>' +
    '<p>' + escapeHtml(c.text || '') + '</p></div></div>';
}
function feedCommentThread(item) {
  const list = (_feedComments && _feedComments[item.id]) || null;
  const body = list == null ? '<p class="feed-c-empty">Chargement…</p>'
    : (list.length ? list.map(feedCommentRow).join('') : '<p class="feed-c-empty">Sois le premier à commenter 💬</p>');
  return '<div class="feed-comments">' + body +
    '<form class="feed-c-form" data-cform="' + escapeHtml(item.id) + '"><input type="text" class="feed-c-input" maxlength="500" placeholder="Écrire un commentaire…" autocomplete="off"><button type="submit" class="feed-c-send" aria-label="Envoyer">' + icSvg('send') + '</button></form>' +
    '</div>';
}
function toggleComments(id) {
  if (!_feedOpenComments) _feedOpenComments = new Set();
  if (!_feedComments) _feedComments = {};
  if (_feedOpenComments.has(id)) { _feedOpenComments.delete(id); renderCommunauteFeed(); return; }
  _feedOpenComments.add(id);
  if (_feedComments[id] == null) {
    if (isDemo() || String(id).indexOf('demo') === 0) { _feedComments[id] = []; renderCommunauteFeed(); }
    else fetchComments(id); // affiche « Chargement… » puis remplit
  }
  renderCommunauteFeed();
}
async function fetchComments(id) {
  try {
    const res = await fetch(apiUrl('/api/community/comments?item=' + encodeURIComponent(id)), { headers: nutriAuthHeaders() });
    const d = await res.json();
    if (!_feedComments) _feedComments = {};
    _feedComments[id] = (d && d.ok) ? (d.comments || []) : [];
  } catch (_) { if (!_feedComments) _feedComments = {}; _feedComments[id] = _feedComments[id] || []; }
  renderCommunauteFeed();
}
async function postComment(id, text) {
  text = String(text || '').trim(); if (!text) return;
  if (!_feedComments) _feedComments = {};
  const it = (state.communauteFeed || []).find((x) => x.id === id) || (typeof FEED_DEMO !== 'undefined' && FEED_DEMO.find((x) => x.id === id));
  if (isDemo() || String(id).indexOf('demo') === 0) {
    _feedComments[id] = (_feedComments[id] || []).concat([{ id: 'l' + (_feedComments[id] || []).length, who: 'Moi', text: text, when: new Date().toISOString(), mine: true }]);
    if (it) it.comments = (it.comments || 0) + 1;
    renderCommunauteFeed(); return;
  }
  try {
    const res = await fetch(apiUrl('/api/community/comments'), { method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ item: id, text: text }) });
    const d = await res.json();
    if (d && d.ok && d.comment) {
      _feedComments[id] = (_feedComments[id] || []).concat([d.comment]);
      if (it) it.comments = (it.comments || 0) + 1;
      renderCommunauteFeed();
    } else { showToast((d && d.error) || 'Commentaire impossible.', { icon: 'info' }); }
  } catch (_) { showToast('Connexion requise pour commenter.', { icon: 'info' }); }
}
function feedCard(item) {
  // Texte épuré : on évite de répéter le prénom déjà affiché en gras (« Paul » + « Paul a validé… »).
  let txt = item.text || '';
  if (item.kind === 'event') {
    if (item.subkind === 'welcome') txt = 'a rejoint le groupe';
    else if (item.who && txt.indexOf(item.who + ' ') === 0) txt = txt.slice(item.who.length + 1);
  }
  const who = item.who || 'Un membre';
  const isCoachPost = item.kind === 'post' && item.subkind === 'coach';
  const badge = (item.emoji && who !== 'Le groupe') ? '<span class="feed-av-badge">' + item.emoji + '</span>' : '';
  const coachTag = isCoachPost ? '<span class="feed-coach-tag">' + icSvg('spark') + ' Coach</span>' : '';
  return '<article class="feed-card' + (item.kind === 'post' ? ' is-post' : '') + (isCoachPost ? ' is-coach-post' : '') + '" data-k="' + escapeHtml(item.subkind || (item.kind === 'post' ? 'post' : '')) + '">' +
    '<div class="feed-av-wrap">' + feedAvatar(item) + badge + '</div>' +
    '<div class="feed-body">' +
      '<div class="feed-meta"><b class="feed-who">' + escapeHtml(who) + '</b>' + coachTag +
        '<span class="feed-when">' + escapeHtml(commTimeAgo(item.when)) + '</span></div>' +
      '<p class="feed-text">' + escapeHtml(txt) + '</p>' +
      '<div class="feed-actions">' + feedReactBar(item) + feedCommentBar(item) + '</div>' +
      ((_feedOpenComments && _feedOpenComments.has(item.id)) ? feedCommentThread(item) : '') +
    '</div></article>';
}
function renderCommunauteFeed() {
  const list = $('#feedList'); if (!list) return;
  let items = (state.communauteFeed || []).slice();
  // Démo (présentation commerciale) : on complète avec des exemples illustratifs.
  if (isDemo()) { items = items.concat(FEED_DEMO); items.sort((a, b) => String(b.when || '').localeCompare(String(a.when || ''))); }
  if (!items.length) {
    list.innerHTML = '<div class="feed-empty">' + icSvg('users') +
      '<b>Le fil est encore calme</b><p>Valide tes repas et tes séances : chaque réussite apparaîtra ici et motivera le groupe. Sois le premier à partager une victoire 💪</p></div>';
    return;
  }
  list.innerHTML = items.map(feedCard).join('');
  list.querySelectorAll('.feed-react, .feed-pal-btn').forEach((b) => b.addEventListener('click', () => reactFeed(b.dataset.fid, b.dataset.ftype)));
  list.querySelectorAll('.feed-more-btn').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); togglePalette(b.dataset.more); }));
  list.querySelectorAll('.feed-cbtn').forEach((b) => b.addEventListener('click', () => toggleComments(b.dataset.ctoggle)));
  list.querySelectorAll('.feed-c-form').forEach((f) => f.addEventListener('submit', (e) => { e.preventDefault(); const inp = f.querySelector('.feed-c-input'); const v = inp ? inp.value : ''; if (!v.trim()) return; postComment(f.dataset.cform, v); }));
}
async function fetchCommunauteFeed() {
  try {
    const res = await fetch(apiUrl('/api/community/feed?limit=50'), { headers: nutriAuthHeaders() });
    const d = await res.json();
    if (d && d.ok) { state.communauteFeed = d.items || []; renderCommunauteFeed(); }
  } catch (_) { /* hors-ligne : on garde l'affichage courant */ }
}
async function reactFeed(id, type) {
  const item = (state.communauteFeed || []).find((x) => x.id === id) || FEED_DEMO.find((x) => x.id === id);
  // Démo / exemples : réaction locale (aucun appel serveur).
  if (isDemo() || String(id).indexOf('demo') === 0) {
    if (item) {
      item.reactions = item.reactions || {};
      if (item.myReaction === type) { item.myReaction = null; item.reactions[type] = Math.max(0, (item.reactions[type] || 1) - 1); }
      else { if (item.myReaction) item.reactions[item.myReaction] = Math.max(0, (item.reactions[item.myReaction] || 1) - 1); item.myReaction = type; item.reactions[type] = (item.reactions[type] || 0) + 1; }
    }
    renderCommunauteFeed(); return;
  }
  try {
    const res = await fetch(apiUrl('/api/community/react'), { method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ id, type }) });
    const d = await res.json();
    if (d && d.ok && item) { item.reactions = d.reactions || {}; item.myReaction = d.myReaction || null; renderCommunauteFeed(); }
  } catch (_) { showToast('Réaction impossible pour le moment.', { icon: 'info' }); }
}
async function postCommunauteFeed(text, kind) {
  const ok = await postCommunaute(text, kind || 'partage'); // réutilise l'endpoint messages
  if (ok) { fetchCommunauteFeed(); showToast('Partagé au groupe 🎉', { icon: 'check' }); }
  return ok;
}
function autoGrowEl(el) { if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; }

function renderCommunaute() {
  const host = $('#view-communaute');
  if (!host) return;
  if (!state.communauteJoined) {
    host.innerHTML =
      '<div class="comm2-join">' +
        '<div class="comm2-join-ic">' + icSvg('users') + '</div>' +
        '<h2>Rejoins ton groupe</h2>' +
        '<p>Avance avec les autres : vois les progrès de chacun en direct, encourage-les, et partage tes victoires. La motivation, c’est l’équipe.</p>' +
        '<button type="button" class="btn btn-primary comm-join" id="commJoin">Rejoindre le groupe</button>' +
      '</div>';
    const j = $('#commJoin');
    if (j) j.addEventListener('click', joinCommunaute);
    fetchCommunaute();
    return;
  }
  const ov = state.communauteOverview;
  const members = (ov && ov.members) || state.communauteMembers || '—';
  const pctObj = ov && ov.objectif ? ov.objectif.pct : 0;
  const coachOnly = isCoachOrAdmin();
  host.innerHTML =
    '<div class="feed">' +
      // (Bloc « Défi / Groupe Challenge / progression » retiré — on garde uniquement la discussion collective.)
      // Zone de publication personnelle.
      '<form id="commForm" class="feed-compose">' +
        '<textarea id="commInput" rows="1" maxlength="500" placeholder="Partager une réussite, une difficulté ou une victoire…" autocomplete="off"></textarea>' +
        '<button type="submit" class="comm-send" aria-label="Partager">' + icSvg('send') + '</button>' +
      '</form>' +
      // Fil d'activité (élément central)
      '<div class="feed-section-head"><h3>Le fil de l’équipe</h3></div>' +
      '<div id="feedList" class="feed-list"><p class="comm-empty">Chargement du fil…</p></div>' +
      // 3. Conseil du coach (compact)
      '<div class="feed-coach"><span class="feed-coach-ic">💡</span><div class="feed-coach-body"><b>Conseil du coach</b><p id="commCoachTip">' +
        escapeHtml((ov && ov.coachAuto && ov.coachAuto[0]) || 'Ta collation protéinée de l’après-midi aide à éviter les fringales du soir.') + '</p></div></div>' +
      (coachOnly ? '<form id="commCoachForm" class="feed-compose feed-coachform"><textarea id="commCoachInput" rows="1" maxlength="500" placeholder="Publier un conseil au groupe (coach)…"></textarea><button type="submit" class="comm-send" aria-label="Publier">' + icSvg('send') + '</button></form>' : '') +
    '</div>';
  // Câblage
  const form = $('#commForm');
  if (form) {
    const inp = $('#commInput');
    if (inp) inp.addEventListener('input', () => autoGrowEl(inp));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = inp ? inp.value : '';
      if (!v.trim()) return;
      postCommunauteFeed(v, 'partage').then((ok) => { if (ok && inp) { inp.value = ''; autoGrowEl(inp); } });
    });
  }
  const cf = $('#commCoachForm');
  if (cf) cf.addEventListener('submit', (e) => { e.preventDefault(); const i = $('#commCoachInput'); const v = i ? i.value : ''; if (!v.trim()) return; postCommunaute(v, 'coach').then((ok) => { if (ok && i) { i.value = ''; fetchCommunaute(); fetchCommunauteOverview(); } }); });
  renderCommunauteFeed();
  fetchCommunauteFeed();
  fetchCommunauteOverview();
  fetchCommunaute(); // messages (compteur membres + dernier conseil coach publié)
  startCommunautePoll();
}

// ===== Mon Parcours (Challenge 6 semaines) =====
const PARCOURS_PHOTO_TYPES = [
  { key: 'face', label: 'Face' }, { key: 'profil', label: 'Profil' },
  { key: 'dos', label: 'Dos' }, { key: 'libre', label: 'Libre' },
];
const PARCOURS_JALONS_INFO = [
  { key: 'depart', titre: 'Départ', court: 'Départ' },
  { key: 's3', titre: 'Mi-parcours — Semaine 3', court: 'Semaine 3' },
  { key: 's6', titre: 'Final — Semaine 6', court: 'Semaine 6' },
];
let _parcoursPhotoUrls = {}; // cache id -> objectURL (photos privées chargées avec auth)
let _parcoursPhotoBusy = false;

function revealParcours() {
  const isCh = state.profil && state.profil.objectif === 'challenge';
  const btn = $('#navParcours'); if (btn) btn.classList.toggle('hidden', !isCh);
}
function fmtKg(v) { return (v == null || v === '') ? '—' : (Math.round(v * 10) / 10).toString().replace('.', ',') + ' kg'; }
function joursAvant(dateStr) { if (!dateStr) return null; const d = Date.parse(dateStr); if (isNaN(d)) return null; return Math.ceil((d - Date.now()) / 864e5); }
function dateCourte(dateStr) { if (!dateStr) return ''; const d = new Date(dateStr); return isNaN(d) ? '' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }); }

async function fetchParcours() {
  try {
    const res = await fetch(apiUrl('/api/parcours'), { headers: nutriAuthHeaders() });
    const d = await res.json();
    if (d && d.ok && d.parcours) { state.parcours = d.parcours; renderParcours(); return d.parcours; }
    if (d && d.noAccount) { state.parcours = null; renderParcours(); }
  } catch (_) { /* hors-ligne */ }
  return null;
}
// Phase courante du challenge -> pilote la « prochaine étape ».
function parcoursPhase(p) {
  if (!p.pesees.depart) return 'avant-depart';
  if (!p.pesees.s3) return (joursAvant(p.jalons.s3.date) <= 0) ? 's3-due' : 'depart-s3';
  if (!p.pesees.s6) return (joursAvant(p.jalons.s6.date) <= 0) ? 's6-due' : 's3-s6';
  return 'termine';
}
function jalonStatut(p, key) {
  if (p.pesees[key]) return 'valide';
  if (key === 'depart') return 'encours';
  const j = joursAvant(p.jalons[key].date);
  if (j == null) return 'avenir';
  if (j > 0) return 'avenir';
  return j < -3 ? 'retard' : 'encours';
}
const STATUT_INFO = {
  valide: { ic: 'check', cls: 'ok', txt: 'Validé' },
  encours: { ic: 'flame', cls: 'now', txt: 'En cours' },
  avenir: { ic: 'calendar', cls: 'soon', txt: 'À venir' },
  retard: { ic: 'flame', cls: 'late', txt: 'En retard' },
};

// Courbe simple à 3 points (Départ / S3 / S6) + ligne vers l'objectif.
function parcoursCourbeSVG(p) {
  const dep = p.poidsDepart, obj = p.poidsObjectif;
  if (dep == null || obj == null) return '';
  const top = 22, bottom = 104, W = 300;
  const xs = { depart: 46, s3: 150, s6: 254 };
  const span = Math.max(0.1, dep - obj);
  const yFor = (w) => bottom - ((w - obj) / span) * (bottom - top);
  const pts = {
    depart: { x: xs.depart, y: yFor(dep), val: fmtKg(dep), lbl: 'Départ', done: true },
    s3: p.pesees.s3 ? { x: xs.s3, y: yFor(p.pesees.s3.poids), val: fmtKg(p.pesees.s3.poids), lbl: 'Sem. 3', done: true } : { x: xs.s3, y: (top + bottom) / 2, val: 'à venir', lbl: 'Sem. 3', done: false },
    s6: p.pesees.s6 ? { x: xs.s6, y: yFor(p.pesees.s6.poids), val: fmtKg(p.pesees.s6.poids), lbl: 'Sem. 6', done: true } : { x: xs.s6, y: yFor(obj), val: 'objectif ' + fmtKg(obj), lbl: 'Sem. 6', done: false },
  };
  const done = [pts.depart, pts.s3, pts.s6].filter((q) => q.done);
  const solid = done.map((q, i) => (i ? 'L' : 'M') + q.x + ' ' + q.y).join(' ');
  const cible = 'M' + pts.depart.x + ' ' + pts.depart.y + ' L' + xs.s6 + ' ' + yFor(obj);
  const dot = (q) => `<circle cx="${q.x}" cy="${q.y}" r="${q.done ? 6 : 5}" class="pc-dot ${q.done ? 'on' : 'off'}"/>`;
  const lab = (q) => `<text x="${q.x}" y="${bottom + 16}" class="pc-x">${escapeHtml(q.lbl)}</text><text x="${q.x}" y="${(q.done ? q.y - 11 : q.y - 11)}" class="pc-v ${q.done ? '' : 'soft'}">${escapeHtml(q.val)}</text>`;
  return `<svg viewBox="0 0 ${W} 128" class="pc-svg" preserveAspectRatio="xMidYMid meet">
    <path d="${cible}" class="pc-target"/>
    ${solid ? `<path d="${solid}" class="pc-line"/>` : ''}
    ${dot(pts.depart)}${dot(pts.s3)}${dot(pts.s6)}
    ${lab(pts.depart)}${lab(pts.s3)}${lab(pts.s6)}
  </svg>`;
}

// Prochaine étape (titre + boutons) selon la phase.
function parcoursEtape(p) {
  const phase = parcoursPhase(p);
  const jS3 = joursAvant(p.jalons.s3.date), jS6 = joursAvant(p.jalons.s6.date);
  const B = (label, act, primary) => ({ label, act, primary });
  switch (phase) {
    case 'avant-depart': return { t: 'Ta pesée de départ se fait avec ton coach. En attendant, ajoute tes photos.', b: [B('Ajouter mes photos', 'photos:depart', true), B('Contacter mon coach', 'coach')] };
    case 'depart-s3': return { t: 'Reste régulier jusqu’au bilan mi-parcours avec ton coach.', sub: jS3 != null ? 'Bilan mi-parcours dans ' + jS3 + ' jour' + (jS3 > 1 ? 's' : '') + '.' : '', b: [B('Valider ma séance', 'seance', true), B('Voir ma régularité', 'scroll:reg'), B('Contacter mon coach', 'coach')] };
    case 's3-due': return { t: 'Ton bilan mi-parcours se fait avec ton coach. Pense à ajouter tes photos.', b: [B('Ajouter mes photos', 'photos:s3', true), B('Contacter mon coach', 'coach')] };
    case 's3-s6': return { t: 'Dernière ligne droite jusqu’au bilan final avec ton coach.', sub: jS6 != null ? 'Bilan final dans ' + jS6 + ' jour' + (jS6 > 1 ? 's' : '') + '.' : '', b: [B('Valider ma séance', 'seance', true), B('Voir ma progression', 'scroll:courbe'), B('Contacter mon coach', 'coach')] };
    case 's6-due': return { t: 'Ton bilan final se fait avec ton coach. Ajoute tes photos et découvre ton bilan.', b: [B('Ajouter mes photos', 'photos:s6', true), B('Voir mon bilan', 'scroll:bilan'), B('Contacter mon coach', 'coach')] };
    default: return { t: 'Challenge terminé — bravo ! Découvre ton bilan.', b: [B('Voir mon bilan', 'scroll:bilan', true), B('Contacter mon coach', 'coach')] };
  }
}

function lundiDeCetteSemaine() { const d = new Date(); const j = (d.getDay() + 6) % 7; d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - j); return d; }
function parcoursSeancesSemaine(p) {
  const lundi = lundiDeCetteSemaine();
  const jours = [];
  for (let i = 0; i < 7; i++) { const d = new Date(lundi.getTime() + i * 864e5); jours.push({ ymd: d.toISOString().slice(0, 10), lbl: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'][i] }); }
  const set = new Set(p.seances || []);
  jours.forEach((j) => { j.done = set.has(j.ymd); });
  return jours;
}

function parcoursBadges(p) {
  const sem = parcoursSeancesSemaine(p).filter((j) => j.done).length;
  const r = p.regularite || {};
  return [
    { label: 'Pesée de départ', got: !!p.pesees.depart },
    { label: 'Photos de départ', got: (p.photos || []).some((x) => x.jalon === 'depart') },
    { label: 'Semaine 3 validée', got: !!p.pesees.s3 },
    { label: 'Photos mi-parcours', got: (p.photos || []).some((x) => x.jalon === 's3') },
    { label: '3 séances / semaine', got: sem >= 3 },
    { label: '10 séances', got: (p.seances || []).length >= 10 },
    { label: '20 repas validés', got: (r.repasValides || 0) >= 20 },
    { label: 'Pesée finale', got: !!p.pesees.s6 },
    { label: 'Challenge terminé', got: !!p.pesees.s6 },
  ];
}

function renderParcours() {
  const host = $('#view-parcours'); if (!host) return;
  const p = state.parcours;
  if (!p) {
    host.innerHTML = '<div class="pc-empty"><h2>Mon Parcours</h2><p>Disponible une fois ton compte créé et ton plan généré.</p></div>';
    return;
  }
  const phase = parcoursPhase(p);
  const perdu = (p.poidsDepart != null && p.poidsActuel != null) ? Math.round((p.poidsDepart - p.poidsActuel) * 10) / 10 : null;
  const dernierPoids = p.pesees.s6 ? p.pesees.s6.poids : (p.pesees.s3 ? p.pesees.s3.poids : p.poidsDepart);
  const perduReel = (p.poidsDepart != null && dernierPoids != null) ? Math.round((p.poidsDepart - dernierPoids) * 10) / 10 : 0;
  const restant = (dernierPoids != null && p.poidsObjectif != null) ? Math.max(0, Math.round((dernierPoids - p.poidsObjectif) * 10) / 10) : null;
  const pctObj = (p.objectifPerte && perduReel > 0) ? Math.min(100, Math.round((perduReel / p.objectifPerte) * 100)) : 0;
  const prochaine = phase === 'avant-depart' ? { lbl: 'Pesée de départ', j: null } :
    !p.pesees.s3 ? { lbl: 'Semaine 3', j: joursAvant(p.jalons.s3.date) } :
    !p.pesees.s6 ? { lbl: 'Semaine 6', j: joursAvant(p.jalons.s6.date) } : null;
  const etape = parcoursEtape(p);
  const seancesSem = parcoursSeancesSemaine(p);
  const seancesSemN = seancesSem.filter((j) => j.done).length;
  const seancesTot = (p.seances || []).length;
  const r = p.regularite || {};
  const joursRestants = p.startDate ? Math.max(0, p.dureeJours - p.jourActuel) : p.dureeJours;
  const badges = parcoursBadges(p);

  // --- Carte principale ---
  const poidsActuelTxt = p.pesees.s6 || p.pesees.s3 ? fmtKg(dernierPoids) : fmtKg(p.poidsDepart);
  const carte =
    '<div class="pc-hero">' +
      '<div class="pc-hero-top"><div><div class="pc-kicker">Challenge 6 semaines</div>' +
        '<h2>Objectif : −' + (p.objectifPerte || 6) + ' kg</h2></div>' +
        (p.startDate ? '<span class="pc-day">Jour ' + p.jourActuel + ' / 42</span>' : '<span class="pc-day soon">À démarrer</span>') + '</div>' +
      '<div class="pc-weights">' +
        '<div class="pc-w"><span>Départ</span><b>' + fmtKg(p.poidsDepart) + '</b></div>' +
        '<div class="pc-w-arrow">→</div>' +
        '<div class="pc-w"><span>Actuel</span><b>' + poidsActuelTxt + '</b></div>' +
        '<div class="pc-w-arrow">→</div>' +
        '<div class="pc-w"><span>Objectif</span><b>' + fmtKg(p.poidsObjectif) + '</b></div>' +
      '</div>' +
      '<div class="pc-bar"><span style="width:' + pctObj + '%"></span></div>' +
      (prochaine ? '<p class="pc-next">' + (prochaine.j != null ? 'Prochaine pesée : ' + prochaine.lbl + ' · dans ' + Math.max(0, prochaine.j) + ' jour' + (Math.abs(prochaine.j) > 1 ? 's' : '') : 'Prochaine pesée : ' + prochaine.lbl) + '</p>' : '') +
      (!p.pesees.s3 && p.pesees.depart ? '<p class="pc-next soft">Prochaine mise à jour du poids à la pesée mi-parcours.</p>' : '') +
    '</div>';

  // --- Prochaine étape ---
  const etapeBlock =
    '<div class="pc-step"><div class="pc-step-h">' + icSvg('flame') + ' Ma prochaine étape</div>' +
      '<p class="pc-step-t">' + escapeHtml(etape.t) + '</p>' +
      (etape.sub ? '<p class="pc-step-sub">' + escapeHtml(etape.sub) + '</p>' : '') +
      '<div class="pc-step-btns">' + etape.b.map((b) => '<button type="button" class="pc-btn' + (b.primary ? ' primary' : '') + '" data-pc-act="' + b.act + '">' + escapeHtml(b.label) + '</button>').join('') + '</div>' +
    '</div>';

  // --- Courbe ---
  const courbe =
    '<section class="pc-sec"><h3>' + icSvg('chart') + ' Ma progression</h3>' +
      parcoursCourbeSVG(p) +
      '<div class="pc-mini">' +
        '<div><b>' + (perduReel > 0 ? '−' + fmtKg(perduReel) : '0 kg') + '</b><span>perdus</span></div>' +
        '<div><b>' + (restant != null ? fmtKg(restant) : '—') + '</b><span>restants</span></div>' +
        '<div><b>' + pctObj + '%</b><span>objectif</span></div>' +
      '</div></section>';

  // --- Timeline ---
  const timeline =
    '<section class="pc-sec"><h3>' + icSvg('calendar-check') + ' Mes jalons</h3><div class="pc-timeline">' +
      PARCOURS_JALONS_INFO.map((jal) => {
        const st = jalonStatut(p, jal.key); const si = STATUT_INFO[st];
        const pes = p.pesees[jal.key];
        const nbPhotos = (p.photos || []).filter((x) => x.jalon === jal.key).length;
        const dt = p.jalons[jal.key].date;
        return '<div class="pc-jalon ' + si.cls + '"><div class="pc-jalon-ic">' + icSvg(si.ic) + '</div>' +
          '<div class="pc-jalon-main"><div class="pc-jalon-top"><b>' + escapeHtml(jal.titre) + '</b><span class="pc-jalon-st ' + si.cls + '">' + si.txt + '</span></div>' +
          '<div class="pc-jalon-meta">' + (dt ? dateCourte(dt) + ' · ' : '') + (pes ? 'Pesée ' + fmtKg(pes.poids) : 'Pesée avec ton coach') + (nbPhotos ? ' · ' + nbPhotos + ' photo' + (nbPhotos > 1 ? 's' : '') : '') + '</div>' +
          (pes && pes.commentaire ? '<div class="pc-jalon-coach">' + icSvg('spark') + ' ' + escapeHtml(pes.commentaire) + '</div>' : '') +
          '</div></div>';
      }).join('') +
    '</div></section>';

  // --- Photos d'évolution (slots par jalon x type) ---
  const photoBlock =
    '<section class="pc-sec"><h3>' + icSvg('eye') + ' Mes photos d’évolution</h3>' +
      '<p class="pc-priv">' + icSvg('check') + ' Tes photos sont privées, visibles uniquement par toi et ton coach.</p>' +
      PARCOURS_JALONS_INFO.map((jal) =>
        '<div class="pc-photos-jalon"><div class="pc-photos-lbl">' + escapeHtml(jal.court) + '</div><div class="pc-photos-row">' +
          PARCOURS_PHOTO_TYPES.map((t) => {
            const ph = (p.photos || []).find((x) => x.jalon === jal.key && x.type === t.key);
            if (ph) return '<div class="pc-slot filled" data-pc-photo="' + ph.id + '"><img alt="' + t.label + '" data-pc-imgid="' + ph.id + '"><button type="button" class="pc-slot-del" data-pc-delphoto="' + ph.id + '" aria-label="Supprimer">' + icSvg('x') + '</button><span class="pc-slot-lbl">' + t.label + '</span></div>';
            return '<label class="pc-slot empty"><input type="file" accept="image/*" data-pc-up="' + jal.key + ':' + t.key + '" hidden><span class="pc-slot-add">+</span><span class="pc-slot-lbl">' + t.label + '</span></label>';
          }).join('') +
        '</div></div>').join('') +
    '</section>';

  // --- Séances ---
  const pastilles = Array.from({ length: p.seancesObjTotal || 24 }, (_, i) => '<span class="pc-pastille' + (i < seancesTot ? ' on' : '') + '"></span>').join('');
  const todayY = new Date().toISOString().slice(0, 10);
  const seancesBlock =
    '<section class="pc-sec"><h3>' + icSvg('flame') + ' Mes séances validées</h3>' +
      '<div class="pc-seances-head"><b>' + seancesSemN + ' / ' + (p.seancesObjHebdo || 4) + '</b> séances cette semaine</div>' +
      '<div class="pc-week">' + seancesSem.map((j) => '<div class="pc-day-cell ' + (j.done ? 'on' : '') + '"><span>' + j.lbl + '</span>' + (j.done ? icSvg('check') : '<i>—</i>') + '</div>').join('') + '</div>' +
      '<div class="pc-seances-tot">Depuis le départ : <b>' + seancesTot + ' / ' + (p.seancesObjTotal || 24) + '</b></div>' +
      '<div class="pc-pastilles">' + pastilles + '</div>' +
      '<button type="button" class="pc-btn primary pc-full" data-pc-act="seance">' + icSvg('check') + ' ' + (seancesSem.find((j) => j.ymd === todayY && j.done) ? 'Séance validée aujourd’hui' : 'Valider une séance') + '</button>' +
    '</section>';

  // --- Régularité ---
  let regMsg, regCls;
  if (r.pct >= 75) { regMsg = 'Très bonne régularité, continue comme ça jusqu’à la prochaine pesée.'; regCls = 'ok'; }
  else if (r.pct >= 45) { regMsg = 'Tu avances, mais essaie de valider plus de journées complètes cette semaine.'; regCls = 'mid'; }
  else { regMsg = 'On se remet dans le rythme. Commence par valider ta journée d’aujourd’hui.'; regCls = 'low'; }
  const regBlock =
    '<section class="pc-sec"><h3>' + icSvg('heart') + ' Ma régularité</h3>' +
      '<div class="pc-reg-grid">' +
        '<div class="pc-reg"><b>' + (r.journeesValidees || 0) + ' / 42</b><span>journées</span></div>' +
        '<div class="pc-reg"><b>' + (r.repasValides || 0) + '</b><span>repas validés</span></div>' +
        '<div class="pc-reg"><b>' + (r.pct || 0) + '%</b><span>régularité</span></div>' +
        '<div class="pc-reg"><b>' + joursRestants + '</b><span>jours restants</span></div>' +
      '</div>' +
      '<p class="pc-reg-msg ' + regCls + '">' + escapeHtml(regMsg) + '</p>' +
    '</section>';

  // --- Badges ---
  const badgeBlock =
    '<section class="pc-sec"><h3>' + icSvg('spark') + ' Mes badges</h3><div class="pc-badges">' +
      badges.map((b) => '<div class="pc-badge' + (b.got ? ' got' : '') + '">' + (b.got ? icSvg('check') : '<span class="pc-badge-dot"></span>') + ' ' + escapeHtml(b.label) + '</div>').join('') +
    '</div></section>';

  // --- Bilan (si pesée finale) ---
  let bilan = '';
  if (p.pesees.s6) {
    const atteint = perduReel >= (p.objectifPerte || 6);
    bilan =
      '<section class="pc-sec pc-bilan" id="pc-bilan"><h3>' + icSvg('check-circle') + ' Bilan du challenge</h3>' +
        '<div class="pc-bilan-grid">' +
          '<div><span>Départ</span><b>' + fmtKg(p.poidsDepart) + '</b></div>' +
          '<div><span>Final</span><b>' + fmtKg(p.pesees.s6.poids) + '</b></div>' +
          '<div><span>Résultat</span><b class="hl">−' + fmtKg(perduReel) + '</b></div>' +
          '<div><span>Objectif</span><b>−' + (p.objectifPerte || 6) + ' kg</b></div>' +
          '<div><span>Séances</span><b>' + seancesTot + ' / ' + (p.seancesObjTotal || 24) + '</b></div>' +
          '<div><span>Régularité</span><b>' + (r.pct || 0) + '%</b></div>' +
        '</div>' +
        '<p class="pc-bilan-msg">' + (atteint ? 'Bravo, objectif atteint ! L’étape suivante est de stabiliser tes résultats.' : 'Beau parcours ! Tu t’es rapproché de ton objectif — on continue pour le stabiliser et le dépasser.') + '</p>' +
        '<div class="pc-step-btns"><button type="button" class="pc-btn primary" data-pc-act="scroll:photos">Voir mes photos</button><button type="button" class="pc-btn" data-pc-act="coach">Contacter mon coach</button></div>' +
      '</section>';
  }

  const peseeNote =
    '<div class="pc-pesee-note">' + icSvg('scale') +
    '<p>Tes pesées sont faites avec ton coach : au départ, à mi-parcours et au bilan final. ' +
    'Pas besoin de te peser entre-temps — concentre-toi sur la régularité.</p></div>';

  host.innerHTML =
    '<div class="pc-head"><h1>Mon Parcours</h1><p>Ton évolution pendant le Challenge 6 semaines</p></div>' +
    carte + etapeBlock + peseeNote + courbe + timeline + photoBlock + seancesBlock + regBlock + badgeBlock + bilan;

  // Câblage
  host.querySelectorAll('[data-pc-act]').forEach((b) => b.addEventListener('click', () => parcoursAction(b.dataset.pcAct)));
  host.querySelectorAll('[data-pc-up]').forEach((inp) => inp.addEventListener('change', (e) => { const [jalon, type] = inp.dataset.pcUp.split(':'); uploadParcoursPhoto(jalon, type, e.target.files && e.target.files[0]); }));
  host.querySelectorAll('[data-pc-delphoto]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); deleteParcoursPhoto(Number(b.dataset.pcDelphoto)); }));
  // Charge les vignettes privées (avec auth -> blob)
  host.querySelectorAll('[data-pc-imgid]').forEach((img) => loadParcoursPhoto(Number(img.dataset.pcImgid), img));
}

async function loadParcoursPhoto(id, img) {
  if (_parcoursPhotoUrls[id]) { img.src = _parcoursPhotoUrls[id]; return; }
  try {
    const res = await fetch(apiUrl('/api/parcours/photo/' + id), { headers: nutriAuthHeaders() });
    if (!res.ok) { img.closest('.pc-slot') && img.closest('.pc-slot').classList.add('broken'); return; }
    const blob = await res.blob(); const url = URL.createObjectURL(blob);
    _parcoursPhotoUrls[id] = url; img.src = url;
  } catch (_) { /* ignore */ }
}

function parcoursAction(act) {
  const [kind, arg] = act.split(':');
  // Le client ne saisit plus de poids : les pesées officielles sont faites par le coach.
  if (kind === 'photos') { const el = $('#view-parcours .pc-photos-jalon'); const target = [...$$('#view-parcours .pc-photos-jalon')][['depart', 's3', 's6'].indexOf(arg)] || el; if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  if (kind === 'seance') return validerParcoursSeance();
  if (kind === 'coach') { if (typeof openCoachChat === 'function') openCoachChat(); return; }
  if (kind === 'scroll') {
    const map = { reg: '.pc-reg-grid', courbe: '.pc-svg', bilan: '#pc-bilan', photos: '.pc-photos-jalon' };
    const node = map[arg] && document.querySelector('#view-parcours ' + map[arg]);
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
}

async function validerParcoursSeance() {
  try {
    const res = await fetch(apiUrl('/api/parcours/seance'), { method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ date: new Date().toISOString().slice(0, 10) }) });
    const d = await res.json();
    if (d && d.ok) { state.parcours = d.parcours; renderParcours(); showToast('Séance enregistrée 🔥', { icon: 'check' });
      setTimeout(() => { try { maybeShowPushBanner(); } catch (_) { /* ignore */ } }, 1200); } // 1re séance = moment pertinent
    else showToast((d && d.error) || 'Impossible.', { icon: 'info' });
  } catch (_) { showToast('Connexion requise.', { icon: 'info' }); }
}

// Saisie de pesée côté client RETIRÉE : les pesées officielles (Départ / S3 / S6) sont
// saisies exclusivement par le coach depuis l'espace coach. Le client les voit en lecture seule.
function closeParcoursPesee() { const p = $('#parcoursPeseePanel'); if (p) p.classList.add('hidden'); }

async function uploadParcoursPhoto(jalon, type, file) {
  if (!file || _parcoursPhotoBusy) return;
  _parcoursPhotoBusy = true;
  showToast('Ajout de la photo…', { icon: 'info' });
  try {
    const data = await compressImage(file, 1100, 0.8);
    const res = await fetch(apiUrl('/api/parcours/photo'), { method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ jalon, type, data }) });
    const d = await res.json();
    if (d && d.ok) { state.parcours = d.parcours; renderParcours(); showToast('Photo ajoutée 📸', { icon: 'check' }); }
    else showToast((d && d.error) || 'Ajout impossible.', { icon: 'info' });
  } catch (_) { showToast('Ajout impossible.', { icon: 'info' }); }
  _parcoursPhotoBusy = false;
}
async function deleteParcoursPhoto(id) {
  if (!confirm('Es-tu sûr de vouloir supprimer cette photo ?')) return;
  try {
    const res = await fetch(apiUrl('/api/parcours/photo/' + id), { method: 'DELETE', headers: nutriAuthHeaders() });
    const d = await res.json();
    if (d && d.ok) { delete _parcoursPhotoUrls[id]; state.parcours = d.parcours; renderParcours(); showToast('Photo supprimée.', { icon: 'check' }); }
    else showToast((d && d.error) || 'Suppression impossible.', { icon: 'info' });
  } catch (_) { showToast('Suppression impossible.', { icon: 'info' }); }
}

// ----- Coach/admin : compléter le parcours d'un client (pesées + photos) -----
let _coachParcoursEmail = null;
async function openCoachParcours(email) {
  _coachParcoursEmail = email;
  const panel = $('#coachParcoursPanel'); if (!panel) return;
  panel.classList.remove('hidden');
  $('#coachParcoursBody').innerHTML = '<p class="panel-sub">Chargement…</p>';
  try {
    const res = await fetch(apiUrl('/api/coach/parcours/' + encodeURIComponent(email)), { headers: nutriAuthHeaders() });
    const d = await res.json();
    if (!d.ok) throw new Error(d.error || '');
    renderCoachParcours(d.parcours);
  } catch (_) { $('#coachParcoursBody').innerHTML = '<p class="help-empty">Lecture impossible.</p>'; }
}
function closeCoachParcours() { const p = $('#coachParcoursPanel'); if (p) p.classList.add('hidden'); }
function renderCoachParcours(p) {
  const body = $('#coachParcoursBody'); if (!body) return;
  body.innerHTML =
    '<p class="pc-priv warn">' + icSvg('eye') + ' Ces photos sont privées et ne doivent jamais être partagées sans accord du client.</p>' +
    PARCOURS_JALONS_INFO.map((jal) => {
      const pes = p.pesees[jal.key];
      return '<div class="cpc-jalon"><div class="cpc-jalon-h">' + escapeHtml(jal.titre) + '</div>' +
        '<div class="cpc-pesee"><input type="number" step="0.1" inputmode="decimal" id="cpcP-' + jal.key + '" value="' + (pes ? pes.poids : '') + '" placeholder="Poids (kg)">' +
        '<input id="cpcC-' + jal.key + '" maxlength="400" value="' + escapeHtml((pes && pes.commentaire) || '') + '" placeholder="Commentaire (optionnel)">' +
        '<button type="button" class="pc-btn primary" data-cpc-pesee="' + jal.key + '">Enregistrer</button></div>' +
        '<div class="pc-photos-row">' + PARCOURS_PHOTO_TYPES.map((t) => {
          const ph = (p.photos || []).find((x) => x.jalon === jal.key && x.type === t.key);
          if (ph) return '<div class="pc-slot filled"><img data-cpc-imgid="' + ph.id + '"><button type="button" class="pc-slot-del" data-cpc-delphoto="' + ph.id + '" aria-label="Supprimer">' + icSvg('x') + '</button><span class="pc-slot-lbl">' + t.label + '</span></div>';
          return '<label class="pc-slot empty"><input type="file" accept="image/*" data-cpc-up="' + jal.key + ':' + t.key + '" hidden><span class="pc-slot-add">+</span><span class="pc-slot-lbl">' + t.label + '</span></label>';
        }).join('') + '</div></div>';
    }).join('');
  body.querySelectorAll('[data-cpc-pesee]').forEach((b) => b.addEventListener('click', () => coachSavePesee(b.dataset.cpcPesee)));
  body.querySelectorAll('[data-cpc-up]').forEach((inp) => inp.addEventListener('change', (e) => { const [j, t] = inp.dataset.cpcUp.split(':'); coachUploadPhoto(j, t, e.target.files && e.target.files[0]); }));
  body.querySelectorAll('[data-cpc-delphoto]').forEach((b) => b.addEventListener('click', () => coachDeletePhoto(Number(b.dataset.cpcDelphoto))));
  body.querySelectorAll('[data-cpc-imgid]').forEach((img) => loadParcoursPhoto(Number(img.dataset.cpcImgid), img));
}
async function coachSavePesee(type) {
  const poids = Number(($('#cpcP-' + type) || {}).value);
  const commentaire = (($('#cpcC-' + type) || {}).value) || '';
  if (!(poids > 0 && poids < 400)) { showToast('Poids invalide.', { icon: 'info' }); return; }
  try {
    const res = await fetch(apiUrl('/api/parcours/pesee'), { method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ email: _coachParcoursEmail, type, poids, commentaire }) });
    const d = await res.json();
    if (d && d.ok) { renderCoachParcours(d.parcours); showToast('Pesée enregistrée.', { icon: 'check' }); }
    else showToast((d && d.error) || 'Échec.', { icon: 'info' });
  } catch (_) { showToast('Échec.', { icon: 'info' }); }
}
async function coachUploadPhoto(jalon, type, file) {
  if (!file) return;
  showToast('Ajout de la photo…', { icon: 'info' });
  try {
    const data = await compressImage(file, 1100, 0.8);
    const res = await fetch(apiUrl('/api/parcours/photo'), { method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ email: _coachParcoursEmail, jalon, type, data }) });
    const d = await res.json();
    if (d && d.ok) { renderCoachParcours(d.parcours); showToast('Photo ajoutée.', { icon: 'check' }); }
    else showToast((d && d.error) || 'Échec.', { icon: 'info' });
  } catch (_) { showToast('Échec.', { icon: 'info' }); }
}
async function coachDeletePhoto(id) {
  if (!confirm('Es-tu sûr de vouloir supprimer cette photo ?')) return;
  try {
    const res = await fetch(apiUrl('/api/parcours/photo/' + id), { method: 'DELETE', headers: nutriAuthHeaders() });
    const d = await res.json();
    if (d && d.ok) { delete _parcoursPhotoUrls[id]; renderCoachParcours(d.parcours); showToast('Photo supprimée.', { icon: 'check' }); }
    else showToast((d && d.error) || 'Échec.', { icon: 'info' });
  } catch (_) { showToast('Échec.', { icon: 'info' }); }
}

// ===== Messagerie privée client <-> coach =====
function chatBubble(m) {
  return '<div class="comm-msg comm-post ' + (m.mine ? 'me' : '') + '"><div class="comm-av">' + escapeHtml((m.who || '?').charAt(0)) + '</div>' +
    '<div class="comm-bub"><b>' + escapeHtml(m.who || '') + '</b> <span class="when">· ' + escapeHtml(m.when ? commTimeAgo(m.when) : 'à l’instant') + '</span><p>' + escapeHtml(m.text || '') + '</p></div></div>';
}

// --- Côté client : conversation avec SON coach ---
async function openCoachChat() {
  $('#coachChatPanel').classList.remove('hidden');
  const wall = $('#coachChatWall'); wall.innerHTML = '<p class="comm-empty">Chargement…</p>';
  const form = $('#coachChatForm'); form.style.display = '';
  try {
    const res = await fetch(apiUrl('/api/messages/coach'), { headers: nutriAuthHeaders() });
    const d = await res.json();
    if (!d.ok) throw new Error();
    if (!d.coach) {
      $('#coachChatTitle').textContent = 'Mon coach';
      wall.innerHTML = '<p class="comm-empty">Aucun coach n’est encore attribué à ton suivi. L’équipe My Coach va revenir vers toi.</p>';
      form.style.display = 'none';
      return;
    }
    $('#coachChatTitle').textContent = d.coach.name;
    const msgs = d.messages || [];
    wall.innerHTML = msgs.length ? msgs.map(chatBubble).join('') : '<p class="comm-empty">Pose ta première question à ton coach 👋</p>';
    wall.scrollTop = wall.scrollHeight;
    refreshNotifications(); // l'ouverture marque les messages du coach comme lus
  } catch (_) { wall.innerHTML = '<p class="comm-empty">Lecture impossible.</p>'; }
}
function closeCoachChat() { $('#coachChatPanel').classList.add('hidden'); }
async function sendCoachChat(text) {
  const msg = String(text || '').trim(); if (!msg) return false;
  try {
    const res = await fetch(apiUrl('/api/messages/coach'), { method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ message: msg }) });
    const d = await res.json();
    if (d.ok && d.message) {
      const wall = $('#coachChatWall'); const empty = wall.querySelector('.comm-empty'); if (empty) wall.innerHTML = '';
      wall.insertAdjacentHTML('beforeend', chatBubble(d.message)); wall.scrollTop = wall.scrollHeight; return true;
    }
    if (d.error === 'no_coach') showToast('Aucun coach n’est encore attribué à ton suivi.', { icon: 'info' });
    else showToast(d.error || 'Envoi impossible.', { icon: 'info' });
  } catch (_) { showToast('Envoi impossible.', { icon: 'info' }); }
  return false;
}

// --- Côté coach/admin : inbox "Mes messages" ---
async function openMessagesCoach() {
  $('#messagesCoachPanel').classList.remove('hidden');
  renderMessagesCoachList();
}
function closeMessagesCoach() { $('#messagesCoachPanel').classList.add('hidden'); }
async function renderMessagesCoachList() {
  const body = $('#messagesCoachBody'); body.innerHTML = '<p class="panel-sub">Chargement…</p>';
  try {
    const res = await fetch(apiUrl('/api/coach/conversations'), { headers: nutriAuthHeaders() });
    const d = await res.json();
    if (!d.ok) throw new Error();
    const conv = d.conversations || [];
    const isAdmin = d.scope === 'admin';
    if (!conv.length) { body.innerHTML = (isAdmin ? msgAuditHeader() : '') + '<p class="help-empty">Aucune conversation pour le moment.</p>'; if (isAdmin) wireAuditBtn(); return; }
    if (isAdmin) {
      // Supervision : métadonnées uniquement (participants, volume, activité). Pas de contenu.
      body.innerHTML = msgAuditHeader() + conv.map((c) =>
        '<button type="button" class="conv-row" data-conv="' + c.id + '">' +
          '<div class="conv-main"><div class="conv-name">' + escapeHtml(c.clientName) + '</div>' +
          '<div class="conv-last">' + escapeHtml(c.coachName || 'Coach non attribué') + ' · ' + (c.total || 0) + ' message' + ((c.total || 0) > 1 ? 's' : '') + '</div></div>' +
          '<div class="conv-when">' + escapeHtml(c.lastAt ? commTimeAgo(c.lastAt) : '') + '</div>' +
        '</button>'
      ).join('');
      wireAuditBtn();
    } else {
      body.innerHTML = conv.map((c) =>
        '<button type="button" class="conv-row" data-conv="' + c.id + '">' +
          '<div class="conv-main"><div class="conv-name">' + escapeHtml(c.clientName) + (c.unread ? ' <span class="conv-unread">' + c.unread + '</span>' : '') + '</div>' +
          '<div class="conv-last">' + (c.lastRole === 'client' ? '' : 'Toi : ') + escapeHtml((c.lastText || '').slice(0, 70)) + '</div></div>' +
          '<div class="conv-when">' + escapeHtml(c.lastAt ? commTimeAgo(c.lastAt) : '') + '</div>' +
        '</button>'
      ).join('');
    }
    body.querySelectorAll('.conv-row').forEach((b) => b.addEventListener('click', () => openCoachConversation(Number(b.dataset.conv))));
  } catch (_) { body.innerHTML = '<p class="help-empty">Lecture impossible.</p>'; }
}
function msgAuditHeader() {
  return '<div class="msg-superv"><svg class="ic"><use href="#ic-eye"/></svg><div><strong>Supervision</strong> — tu vois qui échange avec qui, le volume et l’activité. ' +
    'Le <strong>contenu reste privé</strong> ; il n’est révélé qu’en mode support (tracé).</div>' +
    '<button type="button" id="msgAuditBtn" class="msg-audit-link">Journal d’audit</button></div>';
}
function wireAuditBtn() { const b = $('#msgAuditBtn'); if (b) b.addEventListener('click', openMsgAudit); }
async function openMsgAudit() {
  const body = $('#messagesCoachBody'); body.innerHTML = '<p class="panel-sub">Chargement…</p>';
  try {
    const res = await fetch(apiUrl('/api/admin/message-audit'), { headers: nutriAuthHeaders() });
    const d = await res.json();
    const list = (d.entries || []);
    const ACT = { reveal: 'Contenu révélé (support)', reply: 'Réponse super-admin' };
    body.innerHTML = '<button type="button" class="btn btn-outline" id="auditBack" style="margin:0 0 12px">← Conversations</button>' +
      '<h3 style="margin:0 0 10px">Journal d’audit</h3>' +
      (list.length ? list.map((e) =>
        '<div class="audit-row"><div class="audit-act">' + escapeHtml(ACT[e.action] || e.action) + '</div>' +
        '<div class="audit-meta">' + escapeHtml(e.adminLabel || 'Admin') + ' · ' + escapeHtml(e.clientName || '—') + '</div>' +
        '<div class="audit-when">' + escapeHtml(e.when ? commTimeAgo(e.when) : '') + '</div></div>'
      ).join('') : '<p class="help-empty">Aucun accès au contenu enregistré.</p>');
    $('#auditBack').addEventListener('click', renderMessagesCoachList);
  } catch (_) { body.innerHTML = '<p class="help-empty">Lecture impossible.</p>'; }
}
async function openCoachConversation(id, support) {
  const body = $('#messagesCoachBody'); body.innerHTML = '<p class="panel-sub">Chargement…</p>';
  try {
    const url = '/api/coach/conversations/' + id + '/messages' + (support ? '?support=1' : '');
    const res = await fetch(apiUrl(url), { headers: nutriAuthHeaders() });
    const d = await res.json();
    if (!d.ok) throw new Error();
    const back = '<button type="button" class="btn btn-outline" id="convBack" style="margin:0 0 12px">← Toutes les conversations</button>';
    // En-tête : nom du client + bouton « Profil » (ouvre sa fiche de suivi par-dessus).
    const profilBtn = d.clientEmail ? '<button type="button" class="conv-profil-btn" id="convProfil">' + icSvg('user') + ' Profil</button>' : '';
    const head = '<div class="conv-head-row"><span class="conv-head-name">' + escapeHtml(d.clientName) + '</span>' + profilBtn + '</div>';
    if (d.redacted) {
      // Admin en supervision : on montre la FORME de l'échange (qui, quand), pas le texte.
      const wall = (d.messages || []).length ? (d.messages).map(redactedBubble).join('') : '<p class="comm-empty">Pas encore de message.</p>';
      body.innerHTML = back + head +
        '<div class="msg-redact-note"><svg class="ic"><use href="#ic-eye"/></svg> Contenu masqué — supervision. Révéler le contenu nécessite le mode support et sera <strong>enregistré dans le journal d’audit</strong>.</div>' +
        '<div id="convWall" class="comm-wall comm-wall-redacted">' + wall + '</div>' +
        '<button type="button" id="convReveal" class="btn btn-outline msg-reveal-btn">Révéler le contenu (mode support)</button>';
      { const _cp = $('#convProfil'); if (_cp) _cp.addEventListener('click', () => openCoachFiche(d.clientEmail)); }
      $('#convBack').addEventListener('click', renderMessagesCoachList);
      $('#convReveal').addEventListener('click', () => {
        if (confirm('Accéder au contenu de cette conversation en mode support ? Cet accès sera enregistré dans le journal d’audit.')) openCoachConversation(id, true);
      });
      return;
    }
    const supportBanner = d.support ? '<div class="msg-support-banner"><svg class="ic"><use href="#ic-eye"/></svg> Mode support — accès au contenu <strong>enregistré dans le journal d’audit</strong>.</div>' : '';
    body.innerHTML = back + head + supportBanner +
      '<div id="convWall" class="comm-wall">' + ((d.messages || []).length ? (d.messages).map(chatBubble).join('') : '<p class="comm-empty">Pas encore de message.</p>') + '</div>' +
      '<form id="convForm" class="comm-compose"><textarea id="convInput" rows="1" maxlength="2000" placeholder="Répondre à ' + escapeHtml(d.clientName) + '…" autocomplete="off"></textarea><button type="submit" class="comm-send" aria-label="Envoyer">' + icSvg('send') + '</button></form>';
    const w = $('#convWall'); if (w) w.scrollTop = w.scrollHeight;
    { const _cp = $('#convProfil'); if (_cp) _cp.addEventListener('click', () => openCoachFiche(d.clientEmail)); }
    $('#convBack').addEventListener('click', renderMessagesCoachList);
    $('#convForm').addEventListener('submit', (e) => { e.preventDefault(); const inp = $('#convInput'); const v = inp ? inp.value : ''; if (!v.trim()) return; replyCoachConversation(id, v).then((ok) => { if (ok && inp) inp.value = ''; }); });
    refreshNotifications(); // l'ouverture (coach) marque les messages du client comme lus
  } catch (_) { body.innerHTML = '<p class="help-empty">Lecture impossible.</p>'; }
}
// Bulle "masquée" : montre l'émetteur et l'heure, contenu remplacé par des barres.
function redactedBubble(m) {
  const who = m.role === 'client' ? 'Client' : (m.role === 'super_admin' ? 'Super-admin' : 'Coach');
  const n = Math.max(1, Math.min(6, Math.round((m.len || 12) / 14)));
  const bars = Array.from({ length: n }, () => '<span class="redact-bar"></span>').join('');
  return '<div class="comm-msg comm-post ' + (m.mine ? 'me' : '') + '"><div class="comm-av">' + escapeHtml(who.charAt(0)) + '</div>' +
    '<div class="comm-bub"><b>' + escapeHtml(who) + '</b> <span class="when">· ' + escapeHtml(m.when ? commTimeAgo(m.when) : '') + '</span>' +
    '<div class="redact-bars">' + bars + '</div></div></div>';
}
async function replyCoachConversation(id, text) {
  const msg = String(text || '').trim(); if (!msg) return false;
  try {
    const res = await fetch(apiUrl('/api/coach/conversations/' + id + '/reply'), { method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ message: msg }) });
    const d = await res.json();
    if (d.ok && d.message) {
      const wall = $('#convWall'); const empty = wall.querySelector('.comm-empty'); if (empty) wall.innerHTML = '';
      wall.insertAdjacentHTML('beforeend', chatBubble(d.message)); wall.scrollTop = wall.scrollHeight; return true;
    }
    showToast(d.error || 'Envoi impossible.', { icon: 'info' });
  } catch (_) { showToast('Envoi impossible.', { icon: 'info' }); }
  return false;
}

// ===== Espace coach : dashboard "Mes clients" + accès messagerie =====
async function bootCoachDashboard() {
  const nm = $('#coachDashName');
  if (nm) nm.textContent = (window.__NUTRI_COACH && window.__NUTRI_COACH.name) || 'Coach';
  const kick = $('#screen-coach .coach-dash-kicker'); if (kick) kick.textContent = 'Bonjour 👋';
  const list = $('#coachClientsList');
  if (list) {
    list.innerHTML = '<p class="panel-sub">Chargement…</p>';
    try {
      // Clients + conversations en parallèle : on met en surbrillance les clients
      // qui ont écrit au coach (message non lu).
      const [res, resConv] = await Promise.all([
        fetch(apiUrl('/api/coach/clients'), { headers: nutriAuthHeaders() }),
        fetch(apiUrl('/api/coach/conversations'), { headers: nutriAuthHeaders() }).catch(() => null),
      ]);
      const d = await res.json();
      const unread = new Set();
      try {
        const dc = resConv && await resConv.json();
        if (dc && dc.ok) (dc.conversations || []).forEach((c) => { if ((c.unread || 0) > 0 && c.clientEmail) unread.add(c.clientEmail); });
      } catch (_) { /* pas de conversations -> aucune surbrillance */ }
      if (d.ok) {
        const cs = d.clients || [];
        list.innerHTML = cs.length ? cs.map((c) => coachClientRow(c, unread.has(c.email))).join('') : '<p class="help-empty">Aucun client ne t’est attribué pour le moment.</p>';
        // Le clic sur un client ouvre DIRECTEMENT la conversation (pour répondre
        // facilement). Le profil/suivi reste accessible via le bouton « Profil »
        // dans l'en-tête de la conversation.
        list.querySelectorAll('.conv-row[data-email]').forEach((b) => b.addEventListener('click', () => coachOpenClientConversation(b.dataset.email)));
      } else list.innerHTML = '<p class="help-empty">Lecture impossible.</p>';
    } catch (_) { list.innerHTML = '<p class="help-empty">Lecture impossible.</p>'; }
  }
  refreshCoachMsgBadge();
}
function coachClientRow(c, hasUnread) {
  const nom = [c.prenom, c.nom].filter(Boolean).join(' ') || c.email;
  const OBJ = { perte: 'Perte de poids', maintien: 'Maintien', muscle: 'Prise de masse', energie: 'Énergie' };
  const obj = c.objectif ? (OBJ[c.objectif] || c.objectif) : '—';
  const etat = c.hasPlan ? 'Plan actif' : 'Sans plan';
  const flag = hasUnread ? '<span class="conv-msg-flag">' + icSvg('send') + ' Nouveau message</span>' : '';
  const right = hasUnread
    ? '<span class="conv-reply-pill">' + icSvg('send') + ' Répondre</span>'
    : '<div class="conv-when">' + icSvg('send') + '</div>';
  return '<button type="button" class="conv-row' + (hasUnread ? ' has-unread' : '') + '" data-email="' + escapeHtml(c.email) + '">' +
    '<div class="conv-main"><div class="conv-name">' + escapeHtml(nom) + '</div>' +
    '<div class="conv-last">' + escapeHtml(obj) + ' · ' + etat + '</div>' + flag + '</div>' +
    right + '</button>';
}
async function refreshCoachMsgBadge() {
  try {
    const res = await fetch(apiUrl('/api/coach/conversations'), { headers: nutriAuthHeaders() });
    const d = await res.json();
    const b = $('#coachMsgBadge'); if (!b) return;
    const n = d.ok ? (d.conversations || []).reduce((s, c) => s + (c.unread || 0), 0) : 0;
    b.textContent = n ? String(n) : '';
    b.style.display = n ? '' : 'none';
  } catch (_) { /* ignore */ }
}
// Badge global de notifications non-lues (messages). Source unique : /api/notifications,
// qui renvoie le bon compte selon le rôle (client = reçus du coach ; coach = reçus des
// clients ; admin = 0). Met à jour tous les ancrages présents (seul le pertinent est visible).
function setNotifBadge(el, n) { if (!el) return; el.textContent = n ? String(n > 99 ? '99+' : n) : ''; el.style.display = n ? '' : 'none'; }
async function refreshNotifications() {
  try {
    const res = await fetch(apiUrl('/api/notifications'), { headers: nutriAuthHeaders() });
    const d = await res.json();
    const n = (d && d.ok) ? (d.total || 0) : 0;
    setNotifBadge($('#coachMsgBadge'), n);
    setNotifBadge($('#messagesCoachBadge'), n);
    setNotifBadge($('#contactCoachBadge'), n);
    const dot = $('#navProfilDot'); if (dot) dot.style.display = n > 0 ? '' : 'none';
  } catch (_) { /* ignore */ }
}
async function coachOpenClientConversation(email) {
  try {
    const res = await fetch(apiUrl('/api/coach/conversations'), { method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ client_email: email }) });
    const d = await res.json();
    if (d.ok && d.conversationId) { openMessagesCoach(); openCoachConversation(d.conversationId); }
    else showToast(d.error || 'Impossible d’ouvrir la conversation.', { icon: 'info' });
  } catch (_) { showToast('Impossible d’ouvrir la conversation.', { icon: 'info' }); }
}

// ===== Espace coach : mur collectif (communauté du groupe) =====
async function openCoachWall() {
  const p = $('#coachWallPanel'); if (!p) return;
  p.classList.remove('hidden');
  const body = $('#coachWallBody'); if (body) body.innerHTML = '<p class="panel-sub">Chargement…</p>';
  const form = $('#coachWallForm');
  if (form && !form.dataset.wired) {
    form.dataset.wired = '1';
    form.addEventListener('submit', (e) => { e.preventDefault(); postCoachWall(); });
  }
  loadCoachWall();
}
function closeCoachWall() { const p = $('#coachWallPanel'); if (p) p.classList.add('hidden'); }
async function loadCoachWall() {
  const body = $('#coachWallBody'); if (!body) return;
  try {
    const res = await fetch(apiUrl('/api/coach/community?limit=40'), { headers: nutriAuthHeaders() });
    const d = await res.json();
    if (!d.ok) throw new Error();
    renderCoachWall(d.messages || [], d.members || 0);
  } catch (_) { body.innerHTML = '<p class="help-empty">Lecture impossible.</p>'; }
}
// Résumé des réactions (lecture seule) : emoji + total.
function commReactSummary(reactions) {
  const entries = Object.entries(reactions || {}).filter(([, n]) => n > 0);
  if (!entries.length) return '';
  const emo = {}; COMMUNAUTE_REACTIONS.forEach((r) => { emo[r.type] = r.emo; });
  return '<div class="comm-react-ro">' + entries.map(([t, n]) => '<span>' + (emo[t] || '•') + ' ' + n + '</span>').join('') + '</div>';
}
function renderCoachWall(msgs, members) {
  const body = $('#coachWallBody'); if (!body) return;
  const meta = '<div class="coach-wall-meta">' + icSvg('users') + ' ' + members + ' membre' + (members > 1 ? 's' : '') + ' dans la communauté</div>';
  if (!msgs.length) { body.innerHTML = meta + '<p class="comm-empty">Aucun message pour le moment. Lance la discussion 👋</p>'; return; }
  body.innerHTML = meta + '<div class="comm-wall">' + msgs.map((m) => {
    const isCoach = m.kind === 'coach';
    const av = isCoach ? '<div class="comm-av coach">C</div>' : '<div class="comm-av">' + escapeHtml((m.who || '?').charAt(0)) + '</div>';
    const tag = m.kind === 'partage' ? ' <span class="comm-tag">journée validée</span>' : (isCoach ? ' <span class="comm-tag coach">coach</span>' : '');
    return '<div class="comm-msg comm-post ' + (m.mine ? 'me ' : '') + (isCoach ? 'is-coach' : '') + '">' + av +
      '<div class="comm-bub"><b>' + escapeHtml(m.who || 'Client') + '</b> <span class="when">· ' + escapeHtml(commTimeAgo(m.when)) + '</span>' + tag +
      '<p>' + escapeHtml(m.text || '') + '</p>' + commReactSummary(m.reactions) + '</div></div>';
  }).join('') + '</div>';
}
async function postCoachWall() {
  const inp = $('#coachWallInput'); const v = inp ? inp.value.trim() : '';
  if (!v) return;
  const btn = $('#coachWallForm .comm-send'); if (btn) btn.disabled = true;
  try {
    const res = await fetch(apiUrl('/api/coach/community'), { method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ message: v }) });
    const d = await res.json();
    if (d.ok) { if (inp) inp.value = ''; loadCoachWall(); showToast('Message publié au groupe ✓', { icon: 'check' }); }
    else showToast(d.error || 'Publication impossible.', { icon: 'info' });
  } catch (_) { showToast('Publication impossible.', { icon: 'info' }); }
  if (btn) btn.disabled = false;
}

// ===== Coach : fiche détaillée d'un client (suivi, identité par email) =====
function closeCoachFiche() { const p = $('#coachFichePanel'); if (p) p.classList.add('hidden'); }
async function openCoachFiche(email) {
  const panel = $('#coachFichePanel'); if (!panel) return;
  panel.classList.remove('hidden');
  const body = $('#coachFicheBody'); body.innerHTML = '<p class="panel-sub">Chargement…</p>';
  try {
    const res = await fetch(apiUrl('/api/coach/clients/' + encodeURIComponent(email)), { headers: nutriAuthHeaders() });
    const d = await res.json();
    if (!d.ok) { body.innerHTML = '<p class="help-empty">' + escapeHtml(d.error || 'Lecture impossible.') + '</p>'; return; }
    renderCoachFiche(d.client);
    const btn = $('#coachFicheMsg'); if (btn) btn.addEventListener('click', () => { closeCoachFiche(); coachOpenClientConversation(email); });
    const pb = $('#coachFicheParcours'); if (pb) pb.addEventListener('click', () => openCoachParcours(email));
  } catch (_) { body.innerHTML = '<p class="help-empty">Lecture impossible.</p>'; }
}
function renderCoachFiche(c) {
  const body = $('#coachFicheBody'); if (!body) return;
  const OBJ = { perte: 'Perte de poids', maintien: 'Maintien', muscle: 'Prise de masse', energie: 'Énergie', challenge: 'Challenge' };
  const nom = [c.prenom, c.nom].filter(Boolean).join(' ') || c.email;
  const p = c.profil || {};
  const pes = (c.pesees || []).slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const last = pes[pes.length - 1];
  const first = pes[0];
  let poidsLine = '—';
  if (last && last.poids != null) {
    poidsLine = (+last.poids).toFixed(1).replace('.0', '') + ' kg';
    if (first && first !== last && first.poids != null) {
      const delta = (+last.poids) - (+first.poids);
      const sign = delta > 0 ? '+' : '';
      poidsLine += ' <span class="fiche-delta ' + (delta <= 0 ? 'down' : 'up') + '">' + sign + delta.toFixed(1).replace('.0', '') + ' kg</span>';
    }
  } else if (p.poidsDepart) { poidsLine = p.poidsDepart + ' kg'; }

  const stat = (label, val) => '<div class="fiche-stat"><div class="fiche-stat-val">' + val + '</div><div class="fiche-stat-lbl">' + label + '</div></div>';
  const scoreTxt = (c.adhScore == null) ? '—' : c.adhScore + '%';
  const planTxt = c.hasPlan ? ('Actif · ' + (c.planJours || 0) + ' j') : 'Sans plan';

  // Mini barres d'adhérence (chronologique)
  const adh = (c.adherence || []).slice().reverse();
  const bars = adh.length ? '<div class="fiche-bars">' + adh.map((a) => {
    const sc = Math.max(0, Math.min(100, a.score || 0));
    const cls = sc >= 70 ? 'good' : (sc >= 50 ? 'mid' : 'low');
    return '<div class="fiche-bar"><div class="fiche-bar-fill ' + cls + '" style="height:' + Math.max(6, sc) + '%"></div></div>';
  }).join('') + '</div><div class="fiche-bars-cap">Adhérence sur ' + adh.length + ' jour' + (adh.length > 1 ? 's' : '') + '</div>' : '<p class="fiche-empty">Aucun suivi d’adhérence enregistré.</p>';

  const allerg = (p.allergies || []).filter(Boolean);
  const regimes = (p.regimes || []).filter(Boolean);
  const tagLine = (label, arr) => arr.length ? '<div class="fiche-tags"><span class="fiche-tags-lbl">' + label + '</span>' + arr.map((x) => '<span class="fiche-tag">' + escapeHtml(String(x)) + '</span>').join('') + '</div>' : '';

  const help = (c.help || []);
  const helpBlock = help.length ? '<div class="fiche-sec"><h3>Demandes d’aide récentes</h3>' + help.map((h) => {
    const when = h.createdAt ? new Date(h.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '';
    const badge = h.statut === 'a_traiter' ? '<span class="fiche-pill warn">À traiter</span>' : '<span class="fiche-pill">Traitée</span>';
    const diff = (h.difficultes || []).slice(0, 3).map((x) => escapeHtml(String(x))).join(', ');
    return '<div class="fiche-help"><div class="fiche-help-top">' + badge + '<span class="fiche-help-when">' + when + '</span></div>' +
      (diff ? '<div class="fiche-help-diff">' + diff + '</div>' : '') +
      (h.message ? '<div class="fiche-help-msg">' + escapeHtml(h.message) + '</div>' : '') + '</div>';
  }).join('') + '</div>' : '';

  const aj = p.ajustementKcal ? (p.ajustementKcal > 0 ? '+' : '') + p.ajustementKcal + ' kcal' : null;

  body.innerHTML =
    '<div class="fiche-hero"><div class="fiche-avatar">' + escapeHtml((nom[0] || '?').toUpperCase()) + '</div>' +
    '<div><div class="fiche-name">' + escapeHtml(nom) + '</div>' +
    '<div class="fiche-obj">' + escapeHtml(OBJ[c.objectif] || c.objectif || 'Objectif non défini') + '</div>' +
    '<div class="fiche-mail">' + escapeHtml(c.email) + '</div></div></div>' +
    '<div class="fiche-stats">' +
      stat('Poids', poidsLine) +
      stat('Plan', planTxt) +
      stat('Adhérence', scoreTxt) +
      stat('Scans', c.scansCount || 0) +
    '</div>' +
    (aj ? '<div class="fiche-adjust">Ajustement calorique : <strong>' + aj + '</strong></div>' : '') +
    tagLine('Allergies', allerg) +
    tagLine('Régimes', regimes) +
    '<div class="fiche-sec"><h3>Suivi récent</h3>' + bars + '</div>' +
    helpBlock +
    (c.objectif === 'challenge' ? '<button type="button" id="coachFicheParcours" class="btn btn-outline fiche-msg-btn" style="margin-bottom:10px"><svg class="ic"><use href="#ic-flame"/></svg> Parcours Challenge 6 sem.</button>' : '') +
    '<button type="button" id="coachFicheMsg" class="btn btn-primary fiche-msg-btn"><svg class="ic"><use href="#ic-send"/></svg> Contacter ce client</button>';
}

// ===== Admin : activation du Coach IA =====
function closeCoachIaAdmin() { const p = $('#coachIaPanel'); if (p) p.classList.add('hidden'); }
async function openCoachIaAdmin() {
  const panel = $('#coachIaPanel'); if (!panel) return;
  panel.classList.remove('hidden');
  const body = $('#coachIaBody'); body.innerHTML = '<p class="panel-sub">Chargement…</p>';
  try {
    const res = await fetch(apiUrl('/api/coach-ia-config'), { headers: nutriAuthHeaders() });
    const d = await res.json();
    if (!d.ok) throw new Error();
    renderCoachIaAdmin(d);
  } catch (_) { body.innerHTML = '<p class="help-empty">Lecture impossible.</p>'; }
}
function renderCoachIaAdmin(d) {
  const body = $('#coachIaBody'); if (!body) return;
  const actif = !!d.actif;
  const noKey = !d.keyPresente;
  const statut = actif
    ? '<span class="cia-pill on">● Actif</span>'
    : '<span class="cia-pill off">● Inactif</span>';
  const keyLine = noKey
    ? '<div class="cia-warn"><svg class="ic"><use href="#ic-eye"/></svg> Aucune clé d’API détectée sur le serveur (<code>ANTHROPIC_API_KEY</code>). Le chat ne pourra pas répondre tant qu’elle n’est pas définie, même activé ici.</div>'
    : '<div class="cia-ok"><svg class="ic"><use href="#ic-check"/></svg> Clé d’API détectée sur le serveur.</div>';
  const opt = (mode, titre, sous) =>
    '<button type="button" class="cia-opt' + (d.mode === mode ? ' sel' : '') + '" data-mode="' + mode + '">' +
      '<div class="cia-opt-t">' + titre + '</div><div class="cia-opt-s">' + sous + '</div></button>';
  body.innerHTML =
    '<div class="cia-status">État du Coach IA : ' + statut + '</div>' +
    keyLine +
    '<div class="cia-opts">' +
      opt('on', 'Activé', 'Le chat répond aux clients (nécessite la clé serveur).') +
      opt('off', 'Désactivé', 'Le chat reste affiché mais propose de prévenir le coach humain.') +
      opt('auto', 'Auto', 'Suit la configuration serveur (variables d’environnement).') +
    '</div>' +
    '<div id="coachIaMsg" class="cia-msg"></div>';
  body.querySelectorAll('.cia-opt').forEach((b) => b.addEventListener('click', () => saveCoachIaMode(b.dataset.mode)));
}
async function saveCoachIaMode(mode) {
  const msg = $('#coachIaMsg'); if (msg) msg.textContent = 'Enregistrement…';
  try {
    const res = await fetch(apiUrl('/api/coach-ia-config'), {
      method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ mode }),
    });
    const d = await res.json();
    if (!d.ok) throw new Error(d.error || '');
    renderCoachIaAdmin(d);
    updateCoachIaBadge(d);
    showToast(d.actif ? 'Coach IA activé.' : 'Coach IA désactivé.', { icon: d.actif ? 'check' : 'info' });
  } catch (e) {
    const m = $('#coachIaMsg'); if (m) m.textContent = 'Échec : ' + (e.message || 'réessaie.');
  }
}
function updateCoachIaBadge(d) {
  const b = $('#coachIaStateBadge'); if (!b) return;
  b.textContent = d && d.actif ? 'Actif' : 'Inactif';
  b.className = 'pr-badge cia-badge ' + (d && d.actif ? 'on' : 'off');
}
async function refreshCoachIaBadge() {
  if (!isMainAdmin || !isMainAdmin()) return;
  try {
    const res = await fetch(apiUrl('/api/coach-ia-config'), { headers: nutriAuthHeaders() });
    const d = await res.json();
    if (d && d.ok) updateCoachIaBadge(d);
  } catch (_) { /* ignore */ }
}

// ===== Admin : réponses préenregistrées du coach (FAQ gratuite) =====
let _coachFaqItems = [];
function closeCoachFaq() { const p = $('#coachFaqPanel'); if (p) p.classList.add('hidden'); }
async function openCoachFaq() {
  const panel = $('#coachFaqPanel'); if (!panel) return;
  panel.classList.remove('hidden');
  const body = $('#coachFaqBody'); body.innerHTML = '<p class="panel-sub">Chargement…</p>';
  try {
    const res = await fetch(apiUrl('/api/coach-faq'), { headers: nutriAuthHeaders() });
    const d = await res.json();
    if (!d.ok) throw new Error();
    _coachFaqItems = d.items || [];
    renderCoachFaq();
  } catch (_) { body.innerHTML = '<p class="help-empty">Lecture impossible.</p>'; }
}
function coachFaqCard(o) {
  const id = o.id ? String(o.id) : 'new';
  return '<div class="qopt-card" data-faq="' + id + '">' +
      '<div class="qopt-card-head"><strong>' + (o.id ? escapeHtml(o.categorie || 'réponse') : 'Nouvelle réponse') + '</strong>' +
        '<label class="qopt-switch"><input type="checkbox" data-f="actif"' + (o.actif === 0 ? '' : ' checked') + '><span>Active</span></label></div>' +
      '<label class="qopt-field"><span>Question type</span><input data-f="question" maxlength="160" value="' + escapeHtml(o.question || '') + '" placeholder="Ex : J\'ai faim entre les repas ?"></label>' +
      '<label class="qopt-field"><span>Mots-clés (séparés par des virgules)</span><input data-f="mots_cles" value="' + escapeHtml(o.mots_cles || '') + '" placeholder="faim, fringale, grignoter"></label>' +
      '<label class="qopt-field"><span>Réponse</span><textarea data-f="reponse" rows="4" placeholder="La réponse affichée au client…">' + escapeHtml(o.reponse || '') + '</textarea></label>' +
      '<div class="qopt-card-foot"><label class="qopt-field qopt-inline"><span>Catégorie</span><input data-f="categorie" maxlength="40" value="' + escapeHtml(o.categorie || '') + '" placeholder="faim, sport…"></label>' +
        '<div class="faq-actions">' +
          (o.id ? '<button type="button" class="btn btn-ghost faq-del" data-del="' + o.id + '">Supprimer</button>' : '') +
          '<button type="button" class="btn btn-primary faq-save">' + (o.id ? 'Enregistrer' : 'Ajouter') + '</button>' +
        '</div></div>' +
    '</div>';
}
function renderCoachFaq() {
  const body = $('#coachFaqBody'); if (!body) return;
  body.innerHTML =
    '<div class="faq-count">' + _coachFaqItems.length + ' réponse(s) — gratuites, modifiables.</div>' +
    '<div id="faqList">' + _coachFaqItems.map(coachFaqCard).join('') + '</div>' +
    '<div class="faq-new-wrap"><h3 class="faq-new-title">Ajouter une réponse</h3>' + coachFaqCard({}) + '</div>';
  body.querySelectorAll('.qopt-card').forEach((card) => {
    const saveBtn = card.querySelector('.faq-save'); if (saveBtn) saveBtn.addEventListener('click', () => saveCoachFaqItem(card));
    const delBtn = card.querySelector('.faq-del'); if (delBtn) delBtn.addEventListener('click', () => deleteCoachFaqItem(delBtn.dataset.del));
  });
}
async function saveCoachFaqItem(card) {
  const val = (k) => { const el = card.querySelector('[data-f="' + k + '"]'); return el ? (el.type === 'checkbox' ? el.checked : el.value) : ''; };
  const id = card.dataset.faq && card.dataset.faq !== 'new' ? Number(card.dataset.faq) : null;
  const payload = { id, question: val('question'), reponse: val('reponse'), mots_cles: val('mots_cles'), categorie: val('categorie'), actif: val('actif') ? 1 : 0 };
  if (!payload.question.trim() || !payload.reponse.trim()) { showToast('Question et réponse obligatoires.'); return; }
  try {
    const res = await fetch(apiUrl('/api/coach-faq'), { method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(payload) });
    const d = await res.json();
    if (!d.ok) throw new Error(d.error || '');
    showToast('Réponse enregistrée.', { icon: 'check' });
    openCoachFaq();
  } catch (e) { showToast('Échec : ' + (e.message || 'réessaie.')); }
}
async function deleteCoachFaqItem(id) {
  if (!confirm('Supprimer cette réponse ?')) return;
  try {
    const res = await fetch(apiUrl('/api/coach-faq/' + encodeURIComponent(id)), { method: 'DELETE', headers: nutriAuthHeaders() });
    const d = await res.json();
    if (!d.ok) throw new Error(d.error || '');
    showToast('Réponse supprimée.', { icon: 'info' });
    openCoachFaq();
  } catch (e) { showToast('Échec : ' + (e.message || 'réessaie.')); }
}

// ===== Admin : gestion des options rapides boutique =====
function closeQuickOptions() { const p = $('#quickOptPanel'); if (p) p.classList.add('hidden'); }
async function openQuickOptions() {
  const panel = $('#quickOptPanel'); if (!panel) return;
  panel.classList.remove('hidden');
  const body = $('#quickOptBody'); body.innerHTML = '<p class="panel-sub">Chargement…</p>';
  try {
    const res = await fetch(apiUrl('/api/quick-options'), { headers: nutriAuthHeaders() });
    const d = await res.json();
    if (!d.ok) throw new Error();
    renderQuickOptions(d.options || []);
  } catch (_) { body.innerHTML = '<p class="help-empty">Lecture impossible.</p>'; }
}
function renderQuickOptions(options) {
  const body = $('#quickOptBody'); if (!body) return;
  body.innerHTML = options.map((o) =>
    '<div class="qopt" data-slot="' + escapeHtml(o.slot) + '">' +
      '<div class="qopt-head"><span class="qopt-label">' + escapeHtml(o.label) + '</span>' +
        '<label class="qopt-switch"><input type="checkbox" data-qo="actif"' + (o.actif ? ' checked' : '') + '><span>Active</span></label></div>' +
      '<label class="qopt-field"><span>Nom du produit</span><input data-qo="nom" maxlength="80" value="' + escapeHtml(o.nom || '') + '" placeholder="Ex : Raw Barre Bio"></label>' +
      '<label class="qopt-field"><span>Description courte (optionnel)</span><input data-qo="description" maxlength="160" value="' + escapeHtml(o.description || '') + '" placeholder="Ex : vegan, sans gluten"></label>' +
      '<label class="qopt-field"><span>Lien de commande</span><input data-qo="url" maxlength="400" value="' + escapeHtml(o.url || '') + '" placeholder="https://…"></label>' +
      '<div class="qopt-foot"><button type="button" class="btn btn-primary qopt-save" data-slot="' + escapeHtml(o.slot) + '">Enregistrer</button><span class="qopt-msg"></span></div>' +
    '</div>'
  ).join('');
  body.querySelectorAll('.qopt-save').forEach((b) => b.addEventListener('click', () => saveQuickOption(b.dataset.slot)));
}
async function saveQuickOption(slot) {
  const card = document.querySelector('.qopt[data-slot="' + slot + '"]'); if (!card) return;
  const val = (k) => { const el = card.querySelector('[data-qo="' + k + '"]'); return el ? (el.type === 'checkbox' ? el.checked : el.value) : ''; };
  const msg = card.querySelector('.qopt-msg'); if (msg) msg.textContent = 'Enregistrement…';
  try {
    const res = await fetch(apiUrl('/api/quick-options/' + encodeURIComponent(slot)), {
      method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ nom: val('nom'), description: val('description'), url: val('url'), actif: val('actif') }),
    });
    const d = await res.json();
    if (!d.ok) throw new Error(d.error || 'Échec');
    // Met à jour le cache client pour refléter aussitôt dans le plan.
    state.quickOptions = {}; (d.options || []).forEach((o) => { state.quickOptions[o.slot] = o; });
    if (state.plan && typeof renderPlan === 'function') renderPlan();
    if (msg) msg.textContent = '✓ Enregistré';
    showToast('Option rapide mise à jour.', { icon: 'check' });
  } catch (e) { if (msg) msg.textContent = '✗ ' + (e.message || 'réessaie'); }
}

// ===== Photos de plats : affichage client + gestion admin/coach =====
async function fetchPhotoIndex() {
  try {
    const res = await fetch(apiUrl('/api/recipe-photos-index'), { headers: nutriAuthHeaders() });
    const d = await res.json();
    if (d && d.ok) { state.photoMap = d.photos || {}; if (state.plan && typeof renderPlan === 'function') renderPlan(); }
  } catch (_) { if (!state.photoMap) state.photoMap = {}; }
}
function recipePhotoImg(r, cls) {
  const ver = state.photoMap && r && state.photoMap[r.id];
  if (!ver) return '';
  return '<img' + (cls ? ' class="' + cls + '"' : '') + ' src="api/recipe-photo/' + encodeURIComponent(r.id) + '?v=' + encodeURIComponent(ver) + '" alt="' + escapeHtml(r.nom || '') + '" loading="lazy" onload="this.classList.add(\'loaded\')" onerror="this.remove()" />';
}

let _platsPhotosCache = [];
let _platsPhotosFilter = 'tous';
async function openPlatsPhotos() {
  $('#platsPhotosPanel').classList.remove('hidden');
  const body = $('#platsPhotosBody'); body.innerHTML = '<p class="panel-sub">Chargement…</p>';
  try {
    const res = await fetch(apiUrl('/api/recipes-list'), { headers: nutriAuthHeaders() });
    const d = await res.json();
    if (!d.ok) throw new Error();
    _platsPhotosCache = d.recipes || [];
    renderPlatsPhotos();
  } catch (_) { body.innerHTML = '<p class="help-empty">Lecture impossible.</p>'; }
}
function closePlatsPhotos() { $('#platsPhotosPanel').classList.add('hidden'); }
function renderPlatsPhotos() {
  const body = $('#platsPhotosBody'); if (!body) return;
  const sEl = $('#platsPhotosSearch');
  const q = ((sEl && sEl.value) || '').toLowerCase().trim();
  const list = _platsPhotosCache.filter((r) => {
    if (_platsPhotosFilter === 'avec' && !r.hasPhoto) return false;
    if (_platsPhotosFilter === 'sans' && r.hasPhoto) return false;
    if (q && (r.nom || '').toLowerCase().indexOf(q) === -1) return false;
    return true;
  });
  const TYPE = { 'petit-dejeuner': 'Petit-déj', collation: 'Collation', plat: 'Plat' };
  const isAdmin = (typeof isMainAdmin === 'function') && isMainAdmin();
  const nbSans = _platsPhotosCache.filter((r) => !r.hasPhoto).length;
  const rows = list.map((r) => {
    const thumb = r.hasPhoto
      ? '<img src="api/recipe-photo/' + encodeURIComponent(r.id) + '?v=' + Date.now() + '" class="plat-thumb" alt="" />'
      : '<div class="plat-thumb plat-thumb-empty">' + icSvg('camera') + '</div>';
    const delBtn = (r.hasPhoto && isAdmin) ? '<button type="button" class="plat-del" data-id="' + escapeHtml(r.id) + '">Supprimer</button>' : '';
    return '<div class="plat-row">' + thumb +
      '<div class="plat-info"><div class="plat-nom">' + escapeHtml(r.nom) + '</div><div class="plat-type">' + (TYPE[r.type] || r.type) + (r.cuisines && r.cuisines[0] ? ' · ' + escapeHtml(r.cuisines[0]) : '') + '</div></div>' +
      '<div class="plat-acts"><label class="plat-add">' + (r.hasPhoto ? 'Changer' : 'Ajouter') + '<input type="file" accept="image/jpeg,image/png,image/webp" data-id="' + escapeHtml(r.id) + '" hidden></label>' + delBtn + '</div></div>';
  }).join('');
  body.innerHTML =
    '<div class="plats-filters">' +
      '<input id="platsPhotosSearch" type="search" placeholder="Rechercher un plat…" value="' + escapeHtml(q) + '" />' +
      '<div class="plats-chips">' +
        ['tous', 'sans', 'avec'].map((f) => '<button type="button" class="plats-chip ' + (_platsPhotosFilter === f ? 'on' : '') + '" data-f="' + f + '">' + (f === 'tous' ? 'Tous' : f === 'sans' ? ('Sans photo (' + nbSans + ')') : 'Avec photo') + '</button>').join('') +
      '</div></div>' +
    '<div class="plats-list">' + (rows || '<p class="help-empty">Aucun plat.</p>') + '</div>';
  const search = $('#platsPhotosSearch');
  if (search) { search.addEventListener('input', () => { clearTimeout(renderPlatsPhotos._t); renderPlatsPhotos._t = setTimeout(renderPlatsPhotos, 200); }); }
  body.querySelectorAll('.plats-chip').forEach((c) => c.addEventListener('click', () => { _platsPhotosFilter = c.dataset.f; renderPlatsPhotos(); }));
  body.querySelectorAll('.plat-add input[type=file]').forEach((inp) => inp.addEventListener('change', (e) => uploadPlatPhoto(inp.dataset.id, e.target.files && e.target.files[0])));
  body.querySelectorAll('.plat-del').forEach((b) => b.addEventListener('click', () => deletePlatPhoto(b.dataset.id)));
}
async function uploadPlatPhoto(id, file) {
  if (!file) return;
  try {
    const dataUrl = await compressImage(file, 1000, 0.78);
    const res = await fetch(apiUrl('/api/recipes/' + encodeURIComponent(id) + '/photo'), { method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ imageDataUrl: dataUrl }) });
    const d = await res.json();
    if (d.ok) {
      const r = _platsPhotosCache.find((x) => x.id === id); if (r) r.hasPhoto = true;
      if (!state.photoMap) state.photoMap = {};
      state.photoMap[id] = d.updatedAt || String(Date.now());
      showToast('Photo enregistrée ✓', { icon: 'check' });
      renderPlatsPhotos();
    } else showToast(d.error || 'Enregistrement impossible.', { icon: 'info' });
  } catch (_) { showToast('Image illisible.', { icon: 'info' }); }
}
async function deletePlatPhoto(id) {
  try {
    const res = await fetch(apiUrl('/api/recipes/' + encodeURIComponent(id) + '/photo'), { method: 'DELETE', headers: nutriAuthHeaders() });
    const d = await res.json();
    if (d.ok) { const r = _platsPhotosCache.find((x) => x.id === id); if (r) r.hasPhoto = false; if (state.photoMap) delete state.photoMap[id]; showToast('Photo supprimée', { icon: 'check' }); renderPlatsPhotos(); }
    else showToast(d.error || 'Suppression impossible.', { icon: 'info' });
  } catch (_) { showToast('Suppression impossible.', { icon: 'info' }); }
}

function setTab(tab) {
  // On quitte Compléments / Courses -> on ferme leur page (sinon elle resterait par-dessus).
  if (tab !== 'complements') { const cp = $('#complementsPanel'); if (cp && !cp.classList.contains('hidden')) cp.classList.add('hidden'); }
  if (tab !== 'courses') { const sp = $('#shoppingPanel'); if (sp && !sp.classList.contains('hidden')) sp.classList.add('hidden'); }
  // Courses & Suivi ouvrent les panneaux existants (overlays) sans changer la vue de fond.
  if (tab === 'complements') { $('#btnComplements').click(); return; }
  if (tab === 'courses') { $('#btnShopping').click(); return; }
  if (tab === 'suivi') { $('#btnSuiviPlan').click(); return; }
  if (tab === 'communaute') { renderCommunaute(); if (!state.communauteVue) dismissCommunauteIntro(); }
  if (tab === 'parcours') { if (state.parcours) renderParcours(); fetchParcours(); }
  const screen = $('#screen-result');
  if (screen) screen.setAttribute('data-tab', tab);
  $$('#bottom-nav .nav-i').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  window.scrollTo(0, 0);
}
// Affiche l'« Espace coach » de l'ecran Profil uniquement pour coach/admin.
function setupProfilCoach() {
  // Lignes réservées aux vrais comptes clients (changer le PIN) : pas en démo/coach/admin.
  if (window.__NUTRI_USER && window.__NUTRI_USER.email) {
    $$('#view-profil .profil-client').forEach((el) => el.classList.remove('hidden'));
  }
  // « Se déconnecter » est universel : visible dès qu'il y a une session (client OU
  // coach/admin de l'app principale). logoutClient() route ensuite selon le type.
  if ((window.__NUTRI_USER && window.__NUTRI_USER.email) || isCoachOrAdmin()) {
    const lo = $('#btnLogout'); if (lo) lo.classList.remove('hidden');
    const nlo = $('#navLogout'); if (nlo) nlo.classList.remove('hidden'); // aussi dans la sidebar (desktop)
  }
  if (!isCoachOrAdmin()) return;
  $$('#view-profil .profil-coach').forEach((el) => el.classList.remove('hidden'));
  // Lignes réservées au super-admin (config sensible : Coach IA…).
  if (isMainAdmin()) $$('#view-profil .profil-admin').forEach((el) => el.classList.remove('hidden'));
}
// --- Client : changer son code PIN / se déconnecter ---
function closeChangePin() { const p = $('#changePinPanel'); if (p) p.classList.add('hidden'); }
function openChangePin() {
  const p = $('#changePinPanel'); if (!p) return;
  p.classList.remove('hidden');
  const c = $('#cpCurrent'); if (c) c.value = ''; const n = $('#cpNew'); if (n) n.value = '';
  const m = $('#cpMsg'); if (m) m.textContent = '';
  setTimeout(() => { if (c) c.focus(); }, 60);
}
async function saveChangePin() {
  const current = ($('#cpCurrent') || {}).value || '';
  const nouveau = ($('#cpNew') || {}).value || '';
  const m = $('#cpMsg');
  if (!/^[0-9]{4,6}$/.test(nouveau)) { if (m) m.textContent = 'Le nouveau code doit comporter 4 à 6 chiffres.'; return; }
  try {
    const res = await fetch(apiUrl('/account/set-pin'), { method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ current, pin: nouveau }) });
    const d = await res.json();
    if (d && d.ok) { closeChangePin(); showToast('Code PIN modifié ✅', { icon: 'check' }); }
    else if (m) m.textContent = (d && d.error) || 'Échec.';
  } catch (_) { if (m) m.textContent = 'Connexion requise.'; }
}
async function logoutClient() {
  const isClient = !!(window.__NUTRI_USER && window.__NUTRI_USER.email);
  if (!confirm(isClient ? 'Te déconnecter de ton espace ?' : "Te déconnecter de l'application ?")) return;
  if (isClient) {
    // Compte client (PIN) : invalide le token client + purge l'état local.
    try { await fetch(apiUrl('/account/logout'), { method: 'POST', headers: nutriAuthHeaders() }); } catch (_) { /* on déconnecte quand même côté client */ }
    try {
      const email = window.__NUTRI_USER.email || '';
      localStorage.removeItem('mc-nutri-account');
      if (email) localStorage.removeItem('mc-nutri-state-' + email);
    } catch (_) { /* ignore */ }
    location.reload();
    return;
  }
  // Admin / coach : session de l'APP PRINCIPALE (token Bearer). On l'invalide côté
  // serveur, on purge les clés (y compris coaching), puis retour à l'écran de connexion.
  try {
    const t = localStorage.getItem('authToken');
    await fetch('/api/auth/logout', { method: 'POST', headers: t ? { 'Authorization': 'Bearer ' + t } : {} });
  } catch (_) { /* on déconnecte quand même côté client */ }
  try {
    localStorage.removeItem('authToken'); localStorage.removeItem('currentUser');
    localStorage.removeItem('authToken_coach'); localStorage.removeItem('currentUser_coach');
  } catch (_) { /* ignore */ }
  window.location.href = '/';
}

// --- Admin : réinitialiser toutes les données clients (lancement propre) ---
async function resetClientsData() {
  if (!confirm('⚠️ Effacer TOUTES les données clients de la nutrition (comptes, plans, suivi, communauté, messages) ?\n\nLe contenu est conservé (réponses du coach, options boutique, photos des plats). Les apps commerciale et coaching ne sont pas touchées.\n\nAction IRRÉVERSIBLE.')) return;
  const typed = window.prompt('Pour confirmer, tape exactement : RESET');
  if (typed !== 'RESET') { showToast('Réinitialisation annulée.', { icon: 'info' }); return; }
  try {
    const res = await fetch(apiUrl('/api/admin/reset-clients'), {
      method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ confirm: 'RESET' }),
    });
    const d = await res.json();
    if (!d.ok) throw new Error(d.error || '');
    showToast('Données clients réinitialisées ✅ (' + (d.total || 0) + ' lignes effacées)', { icon: 'check' });
  } catch (e) { showToast('Échec : ' + (e.message || 'réessaie.'), { icon: 'info' }); }
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
        date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) + ' à ' +
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
    body.innerHTML = '<p class="help-empty">Lecture impossible. Réessaie.</p>';
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
    hint.textContent = "La caméra n'est pas disponible ici — saisis le code manuellement.";
    $('#scanManual').classList.remove('hidden'); return;
  }
  video.setAttribute('playsinline', 'true');
  video.setAttribute('autoplay', 'true');
  video.muted = true;
  hint.textContent = 'Initialisation de la caméra…';
  scanActive = true;

  // 1) API native BarcodeDetector (Android Chrome) — la plus fiable.
  if ('BarcodeDetector' in window) {
    try {
      await startNativeScanner(video, hint);
      return;
    } catch (e) {
      if (e && (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError')) {
        scanActive = false; showScanError("Autorise l'accès à la caméra pour scanner ton produit."); return;
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
        showScanError("Autorise l'accès à la caméra pour scanner ton produit."); return;
      }
    }
  }

  // 3) Rien ne fonctionne -> saisie manuelle.
  scanActive = false;
  hint.textContent = 'Caméra indisponible — saisis le code manuellement.';
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
        : "Ce produit peut s'intégrer dans ton plan, surtout si tu respectes les portions." },
    moderation: { titre: 'À consommer avec modération',
      reco: 'Ce produit est possible occasionnellement, mais privilégie une alternative plus simple au quotidien.' },
    a_eviter: { titre: 'À éviter régulièrement',
      reco: objectif === 'perte'
        ? 'À limiter si ton objectif est la perte de poids. Il peut dépanner, mais ne doit pas devenir une base quotidienne.'
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
  if (!barcode) { showScanError('Code-barres invalide. Réessaie.'); return; }
  scanShowStage('loading');
  try {
    const fields = 'product_name,product_name_fr,brands,image_front_url,image_url,ingredients_text,ingredients_text_fr,allergens_tags,nutriments,nutriscore_grade,nova_group,quantity';
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=${fields}`);
    const data = await res.json();
    const found = data && data.product && data.status !== 0 &&
      (data.product.product_name || data.product.product_name_fr || data.product.brands || data.product.nutriments);
    if (!found) {
      // Produit absent de la base : on n'enregistre pas (vue coach propre).
      showScanError("Ce produit n'est pas encore référencé. Tu peux l'ajouter manuellement ou demander l'avis de ton coach.");
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
    ${conflits.length ? `<div class="scan-warning" style="display:flex;gap:8px;align-items:flex-start;background:rgba(248,113,113,0.14);border:1px solid rgba(248,113,113,0.45);color:#F87171;border-radius:12px;padding:11px 14px;font-size:13.5px;font-weight:600;margin-bottom:10px;line-height:1.4;">⚠️ Contient un de tes allergènes : ${conflits.map(escapeHtml).join(', ')}. À éviter — demande à ton coach en cas de doute.</div>` : ''}
    ${allerg.length ? `<div class="scan-allerg"><span class="scan-allerg-label">Allergènes</span> ${allerg.map((a) => { const danger = conflits.includes(a); return `<span class="help-tag"${danger ? ' style="background:rgba(248,113,113,0.18);color:#F87171;border:1px solid rgba(248,113,113,0.5);"' : ''}>${escapeHtml(a)}</span>`; }).join('')}</div>` : ''}
    <p class="help-disclaimer">Cette indication est une aide à la décision, pas un avis médical. En cas de doute, demande à ton coach ou à un professionnel de santé.</p>
    <label class="field" style="margin:2px 0 10px"><span>Un mot pour ton coach (optionnel)</span>
      <textarea id="scanCoachMsg" rows="2" placeholder="Ex : est-ce que je peux en prendre le matin ?"></textarea></label>
    <div class="scan-actions">
      <button type="button" class="btn btn-outline" id="scanFav"><svg class="ic"><use href="#ic-star"/></svg> ${isFav ? 'Dans tes favoris' : 'Ajouter à mes favoris'}</button>
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
  if (isDemo()) { btn.innerHTML = 'Demande envoyée (démo) ✓'; return; }
  try {
    const res = await fetch(apiUrl('/api/scan-advice'), { method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ clientName: helpClientName(), barcode: lastScanned.barcode, productName: lastScanned.name, message }) });
    const data = await res.json();
    if (!data.ok) throw new Error();
    btn.innerHTML = 'Demande envoyée à ton coach ✓';
  } catch (e) { btn.disabled = false; alert("L'envoi n'a pas fonctionné. Réessaie."); }
}

// --- Vue coach : scans produits ---
function cohBadge(c) {
  const m = { compatible: 'Compatible', moderation: 'Modération', a_eviter: 'À éviter' };
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
      : '<p class="help-empty">Rien à signaler.</p>';
    body.innerHTML =
      `<div class="scan-admin-sec"><h3>Demandes d'avis</h3>${adviceHtml}</div>`
      + `<div class="scan-admin-sec"><h3>Produits les plus scannés</h3>${topHtml}</div>`
      + `<div class="scan-admin-sec"><h3>Produits à surveiller</h3>${flaggedHtml}</div>`;
    $$('#scanAdminBody select[data-advice-id]').forEach((sel) =>
      sel.addEventListener('change', () => setScanAdviceStatus(sel.dataset.adviceId, sel.value)));
  } catch (e) { body.innerHTML = '<p class="help-empty">Lecture impossible. Réessaie.</p>'; }
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
      <label class="replace-qty">Quantité utilisée
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
  { k: 'adapte', label: "J'ai adapté légèrement", ic: 'edit' },
  { k: 'autre', label: "J'ai mangé autre chose", ic: 'swap' },
  { k: 'saute', label: "J'ai sauté ce repas", ic: 'x' },
];
const SUIVI_SCORE = { suivi: 100, adapte: 75, autre: 50, saute: 0 };
const SUIVI_NIVEAU = { suivi: 'coherent', adapte: 'correct', autre: 'reprendre', saute: 'reprendre' };
const NIVEAU_LABEL = { coherent: 'Cohérent avec ton objectif', correct: 'Correct, à ajuster', reprendre: 'À reprendre au prochain repas' };
const ADAPTE_CHIPS = ["J'ai changé l'accompagnement", "Portion plus grande", "J'ai remplacé un aliment", "Mangé plus tard que prévu"];
const SAUTE_CHIPS = ['Pas faim', 'Pas le temps', 'Oubli', 'Stress', 'Organisation compliquée', 'Autre'];
const SUIVI_DETAIL = { adapte: { field: 'modif', label: "Qu'as-tu modifié ?", ph: "Ex : j'ai changé l'accompagnement", chips: ADAPTE_CHIPS },
  autre: { field: 'repas', label: "Qu'as-tu mangé à la place ?", ph: 'Ex : sandwich, salade, repas au restaurant...', chips: null },
  saute: { field: 'raison', label: 'Pourquoi as-tu sauté ce repas ?', ph: 'Optionnel', chips: SAUTE_CHIPS } };
function feedbackFor(statut) {
  return ({
    suivi: "Parfait, tu as suivi ton plan sur ce repas. Continue comme ça, la régularité est ce qui crée les résultats.",
    adapte: "Ton adaptation reste cohérente avec ton objectif. Garde simplement une source de protéines et une portion de légumes pour rester proche de ton plan.",
    autre: "Ce repas peut arriver. L'important est de ne pas transformer un écart en abandon — reprends simplement ton plan au prochain repas.",
    saute: "Ce n'est pas grave ponctuellement. Si cela se répète, essaie de prévoir une option simple la prochaine fois. L'objectif est la régularité, pas la perfection.",
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
const DAY_STATUS_LABEL = { valide: 'Validée', partiel: 'Partielle', difficile: 'Difficile', vide: 'Non renseigné' };
function dailyPhrase(st) {
  if (!st.reported) return 'Indique tes repas du jour pour voir ton suivi.';
  if (st.score >= 75) return 'Bonne journée dans l\'ensemble — tu es resté proche de ton plan.';
  if (st.score >= 50) return 'Journée correcte. Tu peux améliorer un point demain.';
  return 'Journée plus irrégulière, mais tu peux reprendre demain. L\'objectif est la régularité, pas la perfection.';
}
function mondayThisWeek() { const now = new Date(); const d = (now.getDay() + 6) % 7; const m = new Date(now); m.setDate(now.getDate() - d); return m; }
function dateForDay(di) { const m = mondayThisWeek(); const d = new Date(m); d.setDate(m.getDate() + di); return d.toISOString().slice(0, 10); }
const CRENEAU_LABEL = { 'petit-dejeuner': 'petit-déjeuner', dejeuner: 'déjeuner', collation: 'collation', diner: 'dîner' };
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
  if (!state.plan) { alert('Génère d\'abord ton plan de la semaine.'); return; }
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
  if (!state.plan) { alert('Génère d\'abord ton plan de la semaine.'); return; }
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
    // Bouton d'enregistrement directement sous le repas dès qu'il est renseigné.
    const saveBtn = e ? `<button type="button" class="btn btn-primary suivi-save-inline" data-act="save"><svg class="ic"><use href="#ic-check-circle"/></svg> Enregistrer mon suivi</button>` : '';
    return `<div class="suivi-meal">
      <div class="suivi-meal-head"><span class="suivi-meal-label">${escapeHtml(rp.label || rp.creneau || 'Repas')}</span><span class="suivi-meal-recipe">${escapeHtml(recipeName)}</span></div>
      <div class="suivi-opts">${opts}</div>${detailHtml}${fb}${saveBtn}</div>`;
  }).join('');

  const st = dayStats(di);
  const key = dayStatusKey(st);
  const scoreCard = `<div class="suivi-day-score score-${key}">
    <div class="sds-ring">${st.score != null ? st.score + '%' : '—'}</div>
    <div class="sds-txt"><strong>${dailyPhrase(st)}</strong>
      <span>${st.reported}/${st.total} repas renseignés${st.reported ? ' · ' + st.counts.suivi + ' suivi(s), ' + st.counts.adapte + ' adapté(s), ' + st.counts.autre + ' autre(s), ' + st.counts.saute + ' sauté(s)' : ''}</span></div>
  </div>`;

  // Resume semaine
  const wk = jours.map((j, i) => dayStatusKey(dayStats(i)));
  const nb = (k) => wk.filter((x) => x === k).length;
  const axe = axeAmelioration();
  const weekTxt = `Cette semaine : ${nb('valide')} jour(s) bien suivi(s), ${nb('partiel')} partiel(s), ${nb('difficile')} difficile(s), ${nb('vide')} non renseigné(s).` + (axe ? ` Ton principal axe : la régularité au ${axe}.` : ' Continue, la régularité paie.');

  $('#suiviPlanBody').innerHTML = `
    <div class="week-strip">${strip}</div>
    <h3 class="suivi-day-title">${escapeHtml(jours[di].jour || ('Jour ' + (di + 1)))}${(jourActuelDansPlan() && di === indexJourActuel()) ? '<span class="day-now">Jour en cours</span>' : ''}</h3>
    ${meals || '<p class="help-empty">Aucun repas ce jour-là.</p>'}
    ${scoreCard}
    <div class="suivi-week"><h3><svg class="ic"><use href="#ic-trend"/></svg> Ma semaine nutrition</h3><p class="week-summary">${escapeHtml(weekTxt)}</p></div>
    <button type="button" class="btn btn-outline is-soon" data-act="plate" style="width:100%;margin-top:10px"><svg class="ic"><use href="#ic-camera"/></svg> J'ai mangé autre chose — analyser mon assiette<span class="soon-badge">Bientôt</span></button>
    <button type="button" class="btn btn-outline" data-act="help" style="width:100%;margin-top:8px"><svg class="ic"><use href="#ic-life-buoy"/></svg> J'ai besoin d'aide sur mon alimentation cette semaine</button>`;
}
// Le panneau parle en « suivi/adapte/autre/saute » ; la carte du plan et tous les
// calculs (journée validée, adhérence…) parlent en « respecte/adapte/autre/non ».
// On stocke TOUJOURS le vocabulaire canonique -> le ✓/✗/crayon s'affichent bien.
const PANEL_TO_STATUT = { suivi: 'respecte', adapte: 'adapte', autre: 'autre', saute: 'non' };
function setSuiviPlanStatus(di, mi, panelKey) {
  const key = trackKey(di, mi);
  const cur = state.suivi[key] || {};
  if (normStatut(cur.statut) === panelKey) { delete state.suivi[key]; } // re-clic = annule
  else {
    const statut = PANEL_TO_STATUT[panelKey] || panelKey;
    state.suivi[key] = { statut, detail: cur.detail || (cur.autre ? { repas: cur.autre.repas } : {}), autre: cur.autre };
    if (statut === 'respecte') checkDayCompletion(di);
  }
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
    if (btn) { btn.innerHTML = 'Suivi enregistré ✓'; setTimeout(() => { btn.disabled = false; renderSuiviPlan(); }, 1400); }
    return;
  }
  try {
    await fetch(apiUrl('/api/adherence'), { method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ clientName: helpClientName(), date: dateForDay(di), suivi: st.counts.suivi, adapte: st.counts.adapte, autre: st.counts.autre, saute: st.counts.saute, score: st.score || 0 }) });
    if (btn) { btn.innerHTML = 'Suivi enregistré ✓'; setTimeout(() => { btn.disabled = false; renderSuiviPlan(); }, 1400); }
  } catch (e) { if (btn) { btn.disabled = false; } alert("L'enregistrement n'a pas fonctionné, mais ton suivi reste gardé sur l'appareil."); }
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
const ADH_STATUT = { ok: 'OK', a_surveiller: 'À surveiller', besoin_aide: 'Besoin d\'aide' };
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
          <span class="adh-counts">${c.suivi} suivi · ${c.adapte} adapté · ${c.autre} autre · ${c.saute} sauté</span></div>
        ${alerts ? `<div class="adh-alerts">${alerts}</div>` : ''}
        ${c.lastHelp ? `<div class="adh-help">${icSvg('life-buoy')} Aide : ${escapeHtml((c.lastHelp.difficultes || []).slice(0, 3).join(', ') || 'demande reçue')}</div>` : ''}
      </div>`;
    }).join('');
  } catch (e) { body.innerHTML = '<p class="help-empty">Lecture impossible. Réessaie.</p>'; }
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
  if (h < 11) return 'Petit-déjeuner'; if (h < 15) return 'Déjeuner'; if (h < 18) return 'Collation'; return 'Dîner';
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
    $('#plateErrorBox').innerHTML = "L'analyse d'assiette en photo nécessite le Mode Claude, qui n'est pas activé pour le moment. Ton coach peut l'activer.";
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
    if (!data.ia) return plateError("L'analyse d'assiette nécessite le Mode Claude (à activer par ton coach).", false);
    if (!data.ok || !data.analyse) return plateError("L'analyse n'a pas pu être réalisée. Réessaie dans quelques instants.", true);
    if (data.analyse.lisible === false) return plateError("Je n'arrive pas à identifier clairement ton repas. Reprends une photo plus nette, ou ajoute une précision en texte.", true);
    plateBase = data.analyse; plateAdj = { portion: 'normale' };
    renderPlateResult();
  } catch (e) { plateError("L'analyse n'a pas pu être réalisée. Réessaie dans quelques instants.", true); }
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
    ${b.aliments && b.aliments.length ? `<div class="scan-allerg"><span class="scan-allerg-label">Détecté</span> ${b.aliments.slice(0, 8).map((a) => `<span class="help-tag">${escapeHtml(a)}</span>`).join('')}</div>` : ''}
    <div class="plate-macros">
      <div class="pm pm-kcal"><span class="pm-v">${m.kcal}</span><span class="pm-l">kcal estimées</span></div>
      <div class="pm"><span class="pm-v">${m.proteines} g</span><span class="pm-l">Protéines</span></div>
      <div class="pm"><span class="pm-v">${m.glucides} g</span><span class="pm-l">Glucides</span></div>
      <div class="pm"><span class="pm-v">${m.lipides} g</span><span class="pm-l">Lipides</span></div>
    </div>
    <p class="help-disclaimer">Estimation visuelle à utiliser comme repère. Les quantités peuvent varier selon les portions, la cuisson et les ingrédients.</p>
    <div class="plate-adjust">
      <label>Cette estimation te semble correcte ? Ajuste si besoin :</label>
      <div class="plate-chips">${portChip('petite', 'Portion petite')}${portChip('normale', 'Portion normale')}${portChip('genereuse', 'Portion généreuse')}</div>
      <div class="plate-chips">${addChip('sauce', 'Sauce / huile')}${addChip('boisson', 'Boisson')}${addChip('dessert', 'Dessert')}</div>
    </div>
    <div class="coherence coherence-${cohClass(b.niveau)}">
      <strong>${NIVEAU_LABEL[b.niveau] || NIVEAU_LABEL.correct}</strong>
      ${b.coherencePlan ? `<p>${escapeHtml(b.coherencePlan)}</p>` : ''}
    </div>
    ${b.pointPositif ? `<div class="plate-coach"><span class="pc-l">Point positif</span><p>${escapeHtml(b.pointPositif)}</p></div>` : ''}
    ${b.axe ? `<div class="plate-coach"><span class="pc-l">À améliorer</span><p>${escapeHtml(b.axe)}</p></div>` : ''}
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
  if (isDemo()) { if (btn) btn.innerHTML = askCoach ? 'Demande envoyée (démo) ✓' : 'Enregistré (démo) ✓'; return; }
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
    if (btn) btn.innerHTML = askCoach ? 'Demande envoyée à ton coach ✓' : 'Enregistré dans ton suivi ✓';
  } catch (e) { if (btn) btn.disabled = false; alert("L'enregistrement n'a pas fonctionné. Réessaie."); }
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
  } catch (e) { body.innerHTML = '<p class="help-empty">Lecture impossible. Réessaie.</p>'; }
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
        : 'Recommencer la démo depuis le début ? Les données de démo seront effacées.';
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
      if (!confirm(isClient ? 'Se déconnecter de ton espace ?' : 'Quitter le mode démo ?')) return;
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
        <label>Code de démonstration</label>
        <input type="text" id="demoCfgCode" value="${escapeHtml(d.code)}" autocomplete="off">
        <button type="button" class="link-copy" id="demoCfgCopy">Copier</button>
      </div>
      <label class="demo-toggle"><input type="checkbox" id="demoCfgEnabled" ${d.enabled ? 'checked' : ''}> Mode démo activé</label>
      <label class="field"><span>Date d'expiration (optionnel)</span>
        <input type="date" id="demoCfgExpires" value="${escapeHtml(d.expiresAt || '')}"></label>
      <div class="demo-stats">
        <div class="demo-stat"><strong>${d.uses}</strong><span>accès au total</span></div>
        <div class="demo-stat"><strong>${accesses.length}</strong><span>récents</span></div>
      </div>
      ${accesses.length ? `<div class="demo-accesses"><label>Derniers accès</label>${accesses.map((a) => `<span class="demo-access">${a}</span>`).join('')}</div>` : ''}
      <button type="button" class="btn btn-primary btn-lg" id="demoCfgSave" style="width:100%;margin-top:6px"><svg class="ic"><use href="#ic-check"/></svg> Enregistrer</button>
      <button type="button" class="btn btn-outline" id="demoCfgReset" style="width:100%;margin-top:8px"><svg class="ic"><use href="#ic-refresh"/></svg> Réinitialiser les statistiques démo</button>`;
    $('#demoCfgCopy').addEventListener('click', () => { try { navigator.clipboard.writeText($('#demoCfgCode').value); $('#demoCfgCopy').textContent = 'Copie ✓'; } catch (_) {} });
    $('#demoCfgSave').addEventListener('click', saveDemoConfig);
    $('#demoCfgReset').addEventListener('click', resetDemoData);
  } catch (e) { body.innerHTML = '<p class="help-empty">Lecture impossible.</p>'; }
}
async function saveDemoConfig() {
  const code = $('#demoCfgCode').value.trim();
  if (!code) { alert('Le code ne peut pas être vide.'); return; }
  const btn = $('#demoCfgSave'); btn.disabled = true;
  try {
    const res = await fetch(apiUrl('/api/demo-config'), { method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ code, enabled: $('#demoCfgEnabled').checked, expiresAt: $('#demoCfgExpires').value || null }) });
    const d = await res.json();
    if (!d.ok) throw new Error();
    btn.innerHTML = 'Enregistré ✓'; setTimeout(() => { btn.disabled = false; btn.innerHTML = '<svg class="ic"><use href="#ic-check"/></svg> Enregistrer'; }, 1400);
  } catch (e) { btn.disabled = false; alert("L'enregistrement n'a pas fonctionné."); }
}
async function resetDemoData() {
  if (!confirm('Réinitialiser les statistiques du mode démo (compteur d\'accès) ?')) return;
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
    // Coachs disponibles pour l'attribution (chargés une fois).
    let coaches = [];
    try { const cr = await fetch(apiUrl('/api/coaches'), { headers: nutriAuthHeaders() }); const cd = await cr.json(); if (cd.ok) coaches = cd.coaches || []; } catch (_) { /* ignore */ }
    window.__coachesCache = coaches; // pour coachPickerHTML / saveClientCoaches
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
          <div style="margin-top:7px;">
            <span style="font-size:11px;color:#8B94A3;text-transform:uppercase;letter-spacing:.3px;display:block;margin-bottom:4px;">Coachs</span>
            ${coachPickerHTML(c, coaches)}
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0;font-size:12px;color:#8B94A3;line-height:1.7;">
          <div>${etat}</div>
          <div>${escapeHtml(obj)}</div>
          <div>Inscrit le ${fmt(c.createdAt)}</div>
          <button type="button" class="pin-reset" data-email="${escapeHtml(c.email)}" style="margin-top:5px;background:none;border:1px solid #2C333F;color:#9AA0A6;border-radius:8px;padding:4px 9px;font-size:11.5px;font-family:inherit;cursor:pointer;">Réinitialiser le PIN</button>
        </div>
      </div>`;
    }).join('');
    const emails = clients.map((c) => c.email).join(', ');
    const coachHint = coaches.length ? '' : '<p class="panel-sub" style="margin:0 0 10px;color:#F59E0B;">Aucun coach en base — ajoute des coachs (espace coaching) pour pouvoir les attribuer.</p>';
    body.innerHTML = `
      <div style="margin:0 0 10px;font-size:14px;"><strong style="font-size:20px;">${d.total}</strong> client${d.total > 1 ? 's' : ''} inscrit${d.total > 1 ? 's' : ''}</div>
      ${coachHint}
      <button type="button" class="btn btn-outline" id="clientsCopyEmails" style="width:100%;margin:0 0 12px">Copier tous les emails</button>
      <div>${rows}</div>`;
    const cp = $('#clientsCopyEmails');
    if (cp) cp.addEventListener('click', () => { try { navigator.clipboard.writeText(emails); cp.textContent = 'Copié ✓'; setTimeout(() => { cp.textContent = 'Copier tous les emails'; }, 1400); } catch (_) { /* ignore */ } });
    body.querySelectorAll('.coach-multi').forEach((cm) => {
      cm.addEventListener('change', (e) => {
        if (e.target.classList.contains('cm-assign')) refreshCoachPickerRef(cm);
        saveClientCoaches(cm);
      });
    });
    body.querySelectorAll('.pin-reset').forEach((b) => b.addEventListener('click', () => resetClientPin(b.dataset.email, b)));
  } catch (e) { body.innerHTML = '<p class="help-empty">Lecture impossible.</p>'; }
}
// Réinitialise le PIN d'un client (admin/support). Le client en pose un nouveau à sa prochaine connexion.
async function resetClientPin(email, btn) {
  if (!confirm('Réinitialiser le code PIN de ' + email + ' ?\nLe client devra en définir un nouveau à sa prochaine connexion.')) return;
  try {
    const res = await fetch(apiUrl('/api/clients/' + encodeURIComponent(email) + '/reset-pin'), { method: 'POST', headers: nutriAuthHeaders() });
    const d = await res.json();
    if (d.ok) { if (btn) { btn.textContent = 'PIN réinitialisé ✓'; btn.disabled = true; } showToast('Code PIN réinitialisé.', { icon: 'check' }); }
    else showToast(d.error || 'Échec.', { icon: 'info' });
  } catch (_) { showToast('Échec.', { icon: 'info' }); }
}
// --- Multi-coach : sélecteur d'attribution (admin) ---
// Cases à cocher pour chaque coach + un « référent » (le coach qui porte le fil de
// messagerie ; tous les coachs cochés voient et répondent au même fil partagé).
function coachPickerHTML(c, coaches) {
  const assigned = new Set((c.coachIds && c.coachIds.length ? c.coachIds : (c.coachId ? [c.coachId] : [])).map(Number));
  const primary = Number(c.coachId) || (c.coachIds && c.coachIds[0]) || '';
  const checks = coaches.map((co) => `<label class="cm-check${assigned.has(co.id) ? ' on' : ''}"><input type="checkbox" class="cm-assign" value="${co.id}"${assigned.has(co.id) ? ' checked' : ''}><span>${escapeHtml(co.name)}</span></label>`).join('');
  const refOpts = coaches.filter((co) => assigned.has(co.id)).map((co) => `<option value="${co.id}"${Number(primary) === co.id ? ' selected' : ''}>${escapeHtml(co.name)}</option>`).join('');
  return `<div class="coach-multi" data-email="${escapeHtml(c.email)}">
    <div class="cm-checks">${checks || '<span style="color:#8B94A3;font-size:12px;">Aucun coach en base</span>'}</div>
    <div class="cm-refrow"${assigned.size > 1 ? '' : ' style="display:none"'}>Référent : <select class="cm-ref">${refOpts}</select></div>
  </div>`;
}
// Reconstruit la ligne « référent » (choix limité aux coachs cochés) après un (dé)cochage.
function refreshCoachPickerRef(cm) {
  const prevRef = cm.querySelector('.cm-ref') ? Number(cm.querySelector('.cm-ref').value) : null;
  const checked = [...cm.querySelectorAll('.cm-assign:checked')].map((c) => ({ id: Number(c.value), name: c.parentElement.querySelector('span').textContent }));
  cm.querySelectorAll('.cm-check').forEach((l) => l.classList.toggle('on', l.querySelector('input').checked));
  const refrow = cm.querySelector('.cm-refrow'); const sel = cm.querySelector('.cm-ref');
  if (checked.length > 1) {
    refrow.style.display = '';
    const keepRef = checked.some((c) => c.id === prevRef) ? prevRef : checked[0].id;
    sel.innerHTML = checked.map((c) => `<option value="${c.id}"${c.id === keepRef ? ' selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
  } else { refrow.style.display = 'none'; }
}
// Enregistre l'ensemble des coachs d'un client (+ le référent) auprès du serveur.
async function saveClientCoaches(cm) {
  const email = cm.dataset.email;
  const ids = [...cm.querySelectorAll('.cm-assign:checked')].map((c) => Number(c.value));
  const refSel = cm.querySelector('.cm-ref');
  let primary = refSel && refSel.value ? Number(refSel.value) : (ids[0] || null);
  if (!ids.includes(primary)) primary = ids[0] || null;
  try {
    const res = await fetch(apiUrl('/api/clients/' + encodeURIComponent(email) + '/coach'), {
      method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ coach_ids: ids, primary }),
    });
    const d = await res.json();
    if (d.ok) showToast(ids.length > 1 ? ids.length + ' coachs attribués ✓' : (ids.length ? 'Coach attribué ✓' : 'Coachs retirés'), { icon: 'check' });
    else showToast(d.error || 'Attribution impossible.', { icon: 'info' });
  } catch (_) { showToast('Attribution impossible.', { icon: 'info' }); }
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
  if (!state.plan) { alert('Génère d\'abord ton plan de la semaine.'); return; }
  $('#agendaModal').classList.remove('hidden');
  $('#agendaBody').innerHTML = '<div class="scan-loader"></div><p class="scan-loading-text">Vérification de la connexion…</p>';
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
      <p class="agenda-msg agenda-warn">Impossible de vérifier l'état de ton agenda pour le moment. Vérifie ta connexion, puis réessaie.</p>
      <button type="button" class="btn btn-outline" id="agendaRetry" style="width:100%">Réessayer</button>
      <button type="button" class="btn btn-ghost" id="agendaIcs" style="width:100%;margin-top:8px"><svg class="ic"><use href="#ic-file"/></svg> Télécharger le fichier calendrier (.ics)</button>`;
    $('#agendaRetry').addEventListener('click', () => { $('#agendaBody').innerHTML = '<div class="scan-loader"></div><p class="scan-loading-text">Vérification de la connexion…</p>'; refreshAgenda(); });
    $('#agendaIcs').addEventListener('click', () => { exportIcs(); $('#agendaIcs').innerHTML = 'Fichier téléchargé ✓'; });
    return;
  }
  const icsBtn = '<button type="button" class="btn btn-ghost" id="agendaIcs" style="width:100%;margin-top:8px"><svg class="ic"><use href="#ic-file"/></svg> Télécharger le fichier calendrier (.ics)</button>';
  const privacy = '<p class="help-disclaimer">My Coach Nutrition utilise cette connexion uniquement pour ajouter tes repas à ton agenda.</p>';
  if (status.connected) {
    $('#agendaBody').innerHTML = `
      <h2 class="scan-title"><svg class="ic"><use href="#ic-calendar"/></svg> Google Agenda connecté</h2>
      <p class="agenda-state"><span class="agenda-dot on"></span> Connecté${status.calendarName ? ` · calendrier « ${escapeHtml(status.calendarName)} »` : ''}.</p>
      <p class="panel-sub">Que souhaites-tu ajouter à ton agenda ?</p>
      <div class="agenda-choices">
        <button type="button" class="btn btn-outline agenda-sync" data-scope="jour">Ajouter le plan du jour</button>
        <button type="button" class="btn btn-primary agenda-sync" data-scope="semaine">Ajouter toute la semaine</button>
        <button type="button" class="btn btn-outline agenda-sync" data-scope="rappels">Ajouter les rappels principaux</button>
      </div>
      <p id="agendaSyncMsg" class="agenda-msg"></p>
      ${privacy}
      <button type="button" class="btn btn-ghost btn-sm" id="agendaDisconnect" style="width:100%">Déconnecter Google Agenda</button>
      ${icsBtn}`;
    $$('#agendaBody .agenda-sync').forEach((b) => b.addEventListener('click', () => syncAgenda(b.dataset.scope, b)));
    $('#agendaDisconnect').addEventListener('click', disconnectAgenda);
  } else if (!status.configured) {
    // Connexion directe pas encore activee cote serveur (identifiants Google absents).
    // On n'affiche PAS de bouton "Connecter" inactif (un clic sans effet trouble
    // l'utilisateur) : on met en avant le fichier .ics, qui fonctionne tout de suite.
    $('#agendaBody').innerHTML = `
      <h2 class="scan-title"><svg class="ic"><use href="#ic-calendar"/></svg> Ajouter à mon agenda</h2>
      <p class="panel-sub">Ajoute ton plan alimentaire à ton agenda en un clic.</p>
      <p class="agenda-state"><span class="agenda-dot off"></span> La connexion directe Google Agenda n'est pas encore activée.</p>
      <p class="agenda-msg agenda-warn">La connexion automatique à Google Agenda arrive bientôt. En attendant, télécharge le fichier calendrier ci-dessous : il s'ajoute en un clic à Google Agenda, Apple Calendrier ou Outlook.</p>
      <button type="button" class="btn btn-primary btn-lg" id="agendaIcs" style="width:100%"><svg class="ic"><use href="#ic-file"/></svg> Télécharger le fichier calendrier (.ics)</button>
      ${privacy}`;
  } else {
    $('#agendaBody').innerHTML = `
      <h2 class="scan-title"><svg class="ic"><use href="#ic-calendar"/></svg> Ajouter à Google Agenda</h2>
      <p class="panel-sub">Ajoute ton plan alimentaire directement dans Google Agenda, sans télécharger de fichier.</p>
      <p class="agenda-state"><span class="agenda-dot off"></span> Ton Google Agenda n'est pas encore connecté.</p>
      <button type="button" class="btn btn-primary btn-lg" id="agendaConnect" style="width:100%"><svg class="ic"><use href="#ic-calendar"/></svg> Connecter Google Agenda</button>
      <p class="agenda-msg" id="agendaConnectMsg"></p>
      ${privacy}
      ${icsBtn}`;
    const cb = $('#agendaConnect'); if (cb) cb.addEventListener('click', connectAgenda);
  }
  $('#agendaIcs').addEventListener('click', () => { exportIcs(); $('#agendaIcs').innerHTML = 'Fichier téléchargé ✓'; });
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
  if (!url) { showErr("La connexion à ton agenda n'a pas abouti. Réessaie."); return; }
  // 2. Ouverture de la fenetre d'autorisation Google (popup).
  const popup = window.open(url, 'mcn-google', 'width=480,height=660');
  if (!popup) { showErr('Autorise les fenêtres pop-up pour connecter ton agenda, puis réessaie.'); return; }
  // 3. Attente du retour : message du callback OU fermeture de la fenetre.
  let done = false;
  const finish = (ok) => {
    if (done) return; done = true;
    window.removeEventListener('message', onMsg); clearInterval(poll);
    if (ok) { refreshAgenda(); showToast('Agenda connecté ✓', { icon: 'calendar' }); }
    else { showErr('Autorisation refusée ou interrompue. Tu peux recommencer si tu souhaites connecter ton agenda.'); }
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
    if (d.ok) msg.innerHTML = `<span class="agenda-success">✓ ${d.count} événement(s) ajouté(s) à ton agenda${d.fail ? ` (${d.fail} non ajoutés)` : ''}.</span>`;
    else if (d.error === 'not_connected') { msg.textContent = 'Reconnecte ton Google Agenda.'; refreshAgenda(); }
    else msg.textContent = "La synchronisation n'a pas fonctionné. Réessaie dans quelques instants.";
  } catch (e) { msg.textContent = "La synchronisation n'a pas fonctionné. Réessaie dans quelques instants."; }
  btn.disabled = false; btn.innerHTML = old;
}
async function disconnectAgenda() {
  if (!confirm('Déconnecter Google Agenda ? Ton plan reste dans l\'application.')) return;
  try { await fetch(apiUrl('/api/google/disconnect'), { method: 'POST', headers: nutriAuthHeaders() }); } catch (_) { /* ignore */ }
  refreshAgenda();
}

// ===== Notifications push (Web Push) — client =====
const PUSH = { vapidKey: null, bannerShown: false };
function pushSupported() { return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window); }
function urlB64ToUint8(base64) {
  const pad = '='.repeat((4 - base64.length % 4) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64); const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
async function pushRegisterSW() {
  if (!pushSupported()) return null;
  try { return await navigator.serviceWorker.register('/nutrition/sw.js', { scope: '/nutrition/' }); } catch (_) { return null; }
}
async function pushVapidKey() {
  if (PUSH.vapidKey) return PUSH.vapidKey;
  try { const d = await (await fetch(apiUrl('/api/push/vapid-public'))).json(); if (d && d.ok) PUSH.vapidKey = d.key; } catch (_) { /* ignore */ }
  return PUSH.vapidKey;
}
async function pushSubscribe() {
  const reg = await pushRegisterSW(); if (!reg) return false;
  const key = await pushVapidKey(); if (!key) return false;
  try {
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(key) });
    const res = await fetch(apiUrl('/api/push/subscribe'), { method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ subscription: sub }) });
    return (await res.json()).ok === true;
  } catch (_) { return false; }
}
function pushEligibleForPrompt() {
  if (!(window.__NUTRI_USER && window.__NUTRI_USER.email)) return false; // vrai compte client uniquement
  if (!pushSupported()) return false;
  if (Notification.permission !== 'default') return false;             // déjà accordé / refusé
  const dis = Number(localStorage.getItem('mc-push-dismissed') || 0);
  if (dis && Date.now() - dis < 7 * 864e5) return false;               // pas avant 7 j après un refus
  return true;
}
// Bannière contextuelle — JAMAIS à la 1re ouverture ; appelée après le plan / la 1re séance.
function maybeShowPushBanner() {
  if (PUSH.bannerShown || $('#pushBanner')) return;
  if (!pushEligibleForPrompt()) return;
  PUSH.bannerShown = true;
  const el = document.createElement('div');
  el.id = 'pushBanner'; el.className = 'push-banner';
  el.innerHTML = '<span class="pb-tx">🔔 Active les notifications pour ne rien rater de ton challenge</span>' +
    '<span class="pb-act"><button type="button" class="pb-no">Plus tard</button><button type="button" class="pb-yes">Activer</button></span>';
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  const close = () => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); };
  el.querySelector('.pb-no').addEventListener('click', () => { localStorage.setItem('mc-push-dismissed', String(Date.now())); close(); });
  el.querySelector('.pb-yes').addEventListener('click', async () => {
    close();
    try {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') { const ok = await pushSubscribe(); showToast(ok ? 'Notifications activées 🔔' : 'Activation impossible pour le moment.', { icon: ok ? 'check' : 'info' }); }
      else localStorage.setItem('mc-push-dismissed', String(Date.now()));
    } catch (_) { /* ignore */ }
  });
}
async function bootPush() {
  if (!pushSupported()) return;
  pushRegisterSW();
  handlePushDeepLink();
  try { if (window.__NUTRI_USER && window.__NUTRI_USER.email && Notification.permission === 'granted') pushSubscribe(); } catch (_) { /* ignore */ }
}
function handlePushDeepLink() {
  let params; try { params = new URLSearchParams(location.search); } catch (_) { return; }
  const plog = params.get('plog');
  if (plog) { try { fetch(apiUrl('/api/push/opened'), { method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ logId: Number(plog) }) }); } catch (_) { /* ignore */ } }
  const p = params.get('push');
  if (p) setTimeout(() => {
    if (p === 'message') { if (typeof openCoachChat === 'function') openCoachChat(); }
    else if (typeof setTab === 'function') setTab('parcours'); // recap / photos / seance -> Parcours (Phase 2 affinera)
  }, 900);
  if (plog || p) { try { history.replaceState(null, '', location.pathname); } catch (_) { /* ignore */ } }
}
function closePushPrefs() { const p = $('#pushPrefsPanel'); if (p) p.classList.add('hidden'); }
async function openPushPrefs() {
  const p = $('#pushPrefsPanel'); if (!p) return;
  p.classList.remove('hidden');
  const body = $('#pushPrefsBody'); body.innerHTML = '<p class="panel-sub">Chargement…</p>';
  let prefs = { messages: 1, recap: 1, photos: 1, seances: 1 };
  try { const d = await (await fetch(apiUrl('/api/push/prefs'), { headers: nutriAuthHeaders() })).json(); if (d && d.ok) prefs = d.prefs; } catch (_) { /* défauts */ }
  const perm = ('Notification' in window) ? Notification.permission : 'unsupported';
  const permNote = perm === 'granted' ? ''
    : (perm === 'denied'
      ? '<p class="pushpref-warn">Les notifications sont bloquées dans les réglages de ton navigateur — réactive-les pour ce site.</p>'
      : '<button type="button" class="btn btn-primary" id="pushEnableBtn" style="width:100%;margin:0 0 12px">Activer les notifications</button>');
  const ROWS = [
    ['messages', '💬 Messages du coach', 'Quand ton coach t\'écrit'],
    ['recap', '📊 Récap de la semaine', 'Ton bilan chaque dimanche'],
    ['photos', '📸 Photos du parcours', 'Rappels mi-parcours et bilan'],
    ['seances', '💪 Rappels de séance', 'Lundi, mercredi, vendredi'],
  ];
  body.innerHTML = permNote + '<div class="pushpref-list">' + ROWS.map(([k, t, s]) =>
    '<label class="pushpref-row"><span class="pushpref-txt"><b>' + t + '</b><span>' + s + '</span></span>' +
    '<input type="checkbox" class="pushpref-tog" data-k="' + k + '"' + (prefs[k] ? ' checked' : '') + '></label>').join('') + '</div>' +
    (perm === 'granted' ? '<button type="button" class="btn btn-outline" id="pushTestBtn" style="width:100%;margin-top:12px">Envoyer une notification test</button>' : '');
  const eb = $('#pushEnableBtn'); if (eb) eb.addEventListener('click', async () => { try { const perm2 = await Notification.requestPermission(); if (perm2 === 'granted') { await pushSubscribe(); openPushPrefs(); } } catch (_) {} });
  body.querySelectorAll('.pushpref-tog').forEach((t) => t.addEventListener('change', () => savePushPrefs(body)));
  const tb = $('#pushTestBtn'); if (tb) tb.addEventListener('click', async () => { tb.disabled = true; try { await fetch(apiUrl('/api/push/test'), { method: 'POST', headers: nutriAuthHeaders() }); showToast('Test envoyé 🔔', { icon: 'check' }); } catch (_) {} tb.disabled = false; });
}
async function savePushPrefs(body) {
  const b = {}; body.querySelectorAll('.pushpref-tog').forEach((t) => { b[t.dataset.k] = t.checked; });
  try { await fetch(apiUrl('/api/push/prefs'), { method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(b) }); } catch (_) { /* ignore */ }
}

// ===== Mes guides (ebooks) — client =====
function closeEbooks() { const p = $('#ebooksPanel'); if (p) p.classList.add('hidden'); }
async function openEbooks() {
  const p = $('#ebooksPanel'); if (!p) return;
  p.classList.remove('hidden');
  const body = $('#ebooksBody'); body.innerHTML = '<p class="panel-sub">Chargement…</p>';
  try {
    const d = await (await fetch(apiUrl('/api/ebooks'), { headers: nutriAuthHeaders() })).json();
    if (!d.ok) throw new Error();
    renderEbooks(body, d.ebooks || []);
  } catch (_) { body.innerHTML = '<p class="help-empty">Lecture impossible.</p>'; }
}
function ebookCard(e) {
  const cover = e.cover ? ` style="background-image:url('${e.cover}')"` : '';
  const lock = e.locked ? `<span class="ebk-lock">${icSvg('lock')} ${escapeHtml(e.unlockLabel || 'À venir')}</span>` : '';
  return `<button type="button" class="ebk-card${e.locked ? ' locked' : ''}" data-id="${e.id}" data-locked="${e.locked ? 1 : 0}" data-unlock="${escapeHtml(e.unlockLabel || '')}">
    <span class="ebk-cover"${cover}>${e.cover ? '' : '<span class="ebk-cover-ic">' + icSvg('book') + '</span>'}${lock}</span>
    <span class="ebk-info"><b class="ebk-title">${escapeHtml(e.title)}</b>${e.description ? '<span class="ebk-desc">' + escapeHtml(e.description) + '</span>' : ''}</span>
  </button>`;
}
function renderEbooks(body, list) {
  if (!list.length) { body.innerHTML = '<p class="help-empty">Aucun guide pour le moment. Reviens bientôt 📚</p>'; return; }
  const cats = {}; list.forEach((e) => { const c = e.category || 'Guides'; (cats[c] = cats[c] || []).push(e); });
  body.innerHTML = Object.keys(cats).map((cat) => '<div class="ebk-cat">' + escapeHtml(cat) + '</div><div class="ebk-grid">' + cats[cat].map(ebookCard).join('') + '</div>').join('');
  body.querySelectorAll('.ebk-card').forEach((c) => c.addEventListener('click', () => {
    if (c.dataset.locked === '1') { showToast('🔒 Débloqué en ' + (c.dataset.unlock || 'cours de challenge'), { icon: 'info' }); return; }
    openEbook(Number(c.dataset.id));
  }));
}
async function openEbook(id) {
  const win = window.open('', '_blank'); // fenêtre synchrone (geste user) -> anti popup-blocker
  try {
    const d = await (await fetch(apiUrl('/api/ebooks/' + id + '/open'), { method: 'POST', headers: nutriAuthHeaders() })).json();
    if (d.ok && d.url) { if (win) win.location = d.url; else window.location = d.url; }
    else { if (win) win.close(); showToast(d.locked ? 'Ce guide n\'est pas encore débloqué.' : 'Ouverture impossible.', { icon: 'info' }); }
  } catch (_) { if (win) win.close(); showToast('Ouverture impossible.', { icon: 'info' }); }
}

// ===== Guides (ebooks) — admin =====
function closeEbooksAdmin() { const p = $('#ebooksAdminPanel'); if (p) p.classList.add('hidden'); }
function openEbooksAdmin() { const p = $('#ebooksAdminPanel'); if (!p) return; p.classList.remove('hidden'); renderEbooksAdmin(); }
function ebkDayLabel(unlockDay) { return (Number(unlockDay) + 1) <= 1 ? 'Jour 1 (départ)' : 'Jour ' + (Number(unlockDay) + 1); }
async function renderEbooksAdmin() {
  const body = $('#ebooksAdminBody'); if (!body) return;
  body.innerHTML = '<p class="panel-sub">Chargement…</p>';
  let list = [];
  try { const d = await (await fetch(apiUrl('/api/admin/ebooks'), { headers: nutriAuthHeaders() })).json(); if (d.ok) list = d.ebooks || []; } catch (_) { /* ignore */ }
  const rows = list.map((e) => `<div class="ebka-row" data-id="${e.id}" data-active="${e.active}">
    <div class="ebka-main"><b>${escapeHtml(e.title)}</b><span>${escapeHtml(e.category || '—')} · ${ebkDayLabel(e.unlockDay)} · ${e.sizeKo} Ko${e.active ? '' : ' · masqué'}</span></div>
    <div class="ebka-acts"><button type="button" class="ebka-btn" data-act="toggle">${e.active ? 'Masquer' : 'Afficher'}</button><button type="button" class="ebka-btn danger" data-act="del">Suppr.</button></div>
  </div>`).join('');
  body.innerHTML = `
    <form id="ebkAddForm" class="ebka-form">
      <input type="text" id="ebkTitle" placeholder="Titre du guide" maxlength="160" required>
      <input type="text" id="ebkCat" placeholder="Catégorie (ex. Nutrition, Recettes…)" maxlength="60">
      <textarea id="ebkDesc" rows="2" placeholder="Courte description (optionnel)" maxlength="600"></textarea>
      <label class="ebka-lbl">Jour de déblocage <em>(1 à 42 ; jour 1 = dès le départ)</em><input type="number" id="ebkUnlock" min="1" max="42" value="1"></label>
      <label class="ebka-file">Couverture <em>(image, optionnel)</em><input type="file" id="ebkCover" accept="image/*"></label>
      <label class="ebka-file">Fichier PDF <em>(requis, max 10 Mo)</em><input type="file" id="ebkPdf" accept="application/pdf" required></label>
      <button type="submit" class="btn btn-primary" id="ebkAddBtn">Ajouter le guide</button>
      <p class="pc-msg" id="ebkMsg"></p>
    </form>
    <div class="ebka-list">${rows || '<p class="help-empty">Aucun guide pour le moment.</p>'}</div>`;
  $('#ebkAddForm').addEventListener('submit', addEbook);
  body.querySelectorAll('.ebka-row').forEach((r) => {
    r.querySelector('[data-act="toggle"]').addEventListener('click', () => toggleEbook(r.dataset.id, r));
    r.querySelector('[data-act="del"]').addEventListener('click', () => delEbook(r.dataset.id));
  });
}
function fileToDataUrl(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); }); }
async function addEbook(e) {
  e.preventDefault();
  const msg = $('#ebkMsg'), btn = $('#ebkAddBtn');
  const title = $('#ebkTitle').value.trim(), pdfFile = $('#ebkPdf').files[0];
  if (!title || !pdfFile) { msg.textContent = 'Titre et PDF requis.'; return; }
  if (pdfFile.size > 10 * 1024 * 1024) { msg.textContent = 'PDF trop lourd (max 10 Mo).'; return; }
  btn.disabled = true; msg.textContent = 'Envoi…';
  try {
    const pdfData = await fileToDataUrl(pdfFile);
    let coverData = '';
    const cf = $('#ebkCover').files[0];
    if (cf) { try { coverData = await compressImage(cf, 640, 0.82); } catch (_) { coverData = ''; } }
    const jour = Math.max(1, Math.min(42, Number($('#ebkUnlock').value) || 1));
    const d = await (await fetch(apiUrl('/api/admin/ebooks'), { method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ title, category: $('#ebkCat').value.trim(), description: $('#ebkDesc').value.trim(), unlockDay: jour - 1, pdfData, coverData }) })).json();
    if (d.ok) { showToast('Guide ajouté ✓', { icon: 'check' }); renderEbooksAdmin(); }
    else msg.textContent = d.error || 'Échec.';
  } catch (_) { msg.textContent = 'Échec de l\'envoi.'; }
  btn.disabled = false;
}
async function toggleEbook(id, row) {
  const active = row.dataset.active === '1' ? 0 : 1;
  try { await fetch(apiUrl('/api/admin/ebooks/' + id), { method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ active }) }); renderEbooksAdmin(); } catch (_) { /* ignore */ }
}
async function delEbook(id) {
  if (!confirm('Supprimer ce guide définitivement ?')) return;
  try { await fetch(apiUrl('/api/admin/ebooks/' + id), { method: 'DELETE', headers: nutriAuthHeaders() }); renderEbooksAdmin(); } catch (_) { /* ignore */ }
}

document.addEventListener('DOMContentLoaded', init);
