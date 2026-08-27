// app.js — front de l'application nutrition.
//
// Version HORS Protocole 42 : les quatre objectifs d'origine (perdre du poids,
// maintenir, prendre du muscle, avoir plus d'energie) sont de nouveau proposes au
// choix, et tout ce qui dependait du dispositif coach (parcours 42 jours, Punch,
// cadeaux, groupe, messagerie) a ete retire.
'use strict';

// ---------- Base d'URL + session ----------
// L'app est servie a la racine de son propre serveur. On calcule quand meme le
// dossier courant : ca la rend deployable sous un sous-chemin (ex. /nutrition/)
// derriere un reverse proxy, sans toucher une seule URL.
const NUTRI_BASE = (function () {
  let p = location.pathname;
  if (!p.endsWith('/')) p = p.replace(/[^/]*$/, ''); // retire le fichier final
  return p || '/';
})();
function apiUrl(path) { return NUTRI_BASE + String(path).replace(/^\//, ''); }

// Le compte connecte, pose par le portail d'entree (index.html) apres /account/login.
function compte() { return window.__NUTRI_USER || null; }
function estConnecte() { return !!(compte() && compte().email); }
function nutriToken() { return (compte() && compte().token) || null; }
function nutriAuthHeaders(base) {
  const h = Object.assign({}, base || {});
  const t = nutriToken();
  if (t) h['Authorization'] = 'Bearer ' + t;
  return h;
}
// Le mode demonstration commercial appartenait au dispositif coach (session de
// presentation ouverte par un code). Ici tout le monde peut essayer l'app pour de
// vrai : il n'y a plus rien a simuler. Ces deux fonctions restent pour que le code
// appelant n'ait pas a se poser la question.
function isDemo() { return false; }
function demoToken() { return null; }

// Prenom du titulaire du compte — sert aux libelles (« Salut Lea ! »).
function clientPrenom() {
  const c = compte();
  return (c && (c.prenom || '').trim()) || '';
}
// Nom transmis au serveur avec un enregistrement. Le serveur ne s'en sert QUE pour
// l'affichage : l'identite qui fait foi est celle du jeton.
function helpClientName() { return clientPrenom() || 'Moi'; }

// Le compte administrateur (ADMIN_EMAIL cote serveur) : seul a voir la gestion des
// photos de plats et de la FAQ. Il n'existe plus de role « coach ».
function isMainAdmin() { return !!(compte() && compte().admin); }
function isCoachOrAdmin() { return isMainAdmin(); }

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
  progression: null, // pesées / mensurations / photos, chargées depuis /api/progression
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
// Marque MC des en-têtes de page. Un seul helper pour que la tuile soit posée à
// l'identique sur TOUTES les pages (la barre du haut est masquée en mode app,
// donc sans ça la marque n'existerait que sur l'écran Repas).
// Décoratif : alt vide + aria-hidden, le nom de la page est déjà dans le titre.
function brandMark() { return '<img class="mc-brand" src="logo-mc.png?v=1" alt="" aria-hidden="true" width="256" height="256" />'; }

// Stockage local, cloisonne PAR COMPTE (suivi par email) : deux personnes qui se
// connectent sur le meme navigateur ne doivent jamais voir le plan l'une de l'autre.
// Sans compte, on garde une cle anonyme — l'app reste utilisable sans s'inscrire.
const STORE_KEY = estConnecte() ? ('nutri-state-' + compte().email) : 'nutri-state-invite';
const TOTAL_STEPS = 6;
// L'onboarding commence a l'etape 1, « Quel est ton objectif ? » : c'est exactement
// l'ecran que la version Protocole 42 masquait pour imposer son challenge.
const FIRST_STEP = 1;

// Poids en francais : 2.4 -> « 2,4 ».
function frKg(v) {
  const n = Number(v);
  if (!isFinite(n)) return '0';
  return (Math.round(n * 10) / 10).toString().replace('.', ',');
}

// ---------- Table de substitution d'ingredients (mode demo) ----------
// Cle = morceau du nom (normalise) -> alternatives proposees au "swap".
const SUBSTITUTIONS = [
  { match: 'riz basmati', alts: ['Pates', 'Riz', 'Quinoa', 'Semoule'] },
  { match: 'riz a risotto', alts: ['Riz', 'Pates', 'Quinoa'] },
  { match: 'riz', alts: ['Pates', 'Quinoa', 'Semoule', 'Boulgour'] },
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
// Moment de la journée d'une collation, déduit de son libellé.
function collationMomentKey(label) {
  const n = normTxt(label);
  if (n.includes('sport')) return 'apres-sport';
  if (n.includes('matin')) return 'matin';
  if (n.includes('soir')) return 'soir';
  return 'apres-midi';
}
// Le titre de l'écran Profil porte le prénom du titulaire.
function personalizeStaticUI() {
  const pt = $('#view-profil .profil-title');
  if (!pt) return;
  const cp = clientPrenom();
  if (cp) pt.textContent = 'Ton espace, ' + cp;
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
    // ⚠️ Les champs `perte_objectif_kg` (6 kg) et `deficit_cible` (650 kcal) ont
    // été retirés : ils n'ont JAMAIS été demandés à l'utilisateur, c'étaient les
    // constantes du challenge « −6 kg en 6 semaines ». Affichés tels quels, ils
    // promettaient une perte que personne n'avait choisie.
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
// Haut de l'écran Plan (refonte compacte) : en-tête programme + « Jour X/X » discret,
// puis une rangée de 3 pictos — Guide du jour (badge +1 si non lu), Affiner (si pas
// encore rempli) et Objectif de poids (pastille -X kg -> ouvre le détail des macros).
function renderNeeds() {
  const card = $('#needsCard'); if (!card || !state.plan || !state.plan.besoins) return;
  const b = state.plan.besoins;
  const objLabels = { perte: 'Perte de poids', maintien: 'Maintien', muscle: 'Prise de muscle', energie: 'Plus d\'énergie' };
  const prenom = clientPrenom();
  // Jour X/X (discret)
  const total = (state.plan.jours && state.plan.jours.length) || 0;
  const dayIdx = (typeof indexJourActuel === 'function') ? indexJourActuel() : 0;
  // Le compteur suit la semaine du plan (jour 3 / 7), et non plus les 42 jours
  // d'un programme a duree fixe.
  const dayTag = total ? `<span class="pt-day">Jour ${dayIdx + 1}<span>/${total}</span></span>` : '';
  // Pastille objectif : poids si applicable, sinon kcal cible.
  const objPill = state.masquerCalories ? 'Objectif' : (b.kcalCible + '&nbsp;kcal');
  // Pictos : Affine (si pas encore rempli), Progression, puis Objectif de poids.
  let items = '';
  const avanceFilled = Object.keys(state.avance || {}).length > 0;
  if (!avanceFilled) {
    items += `<button type="button" class="pt-item" data-act="affine" aria-label="Personnaliser mon plan"><span class="pt-ic">${icSvg('sliders')}</span><span class="pt-cap">Personnaliser</span></button>`;
  }
  // Raccourci vers la progression : il remplace le « guide du jour », qui était
  // débloqué étape par étape par le parcours 42 jours.
  if (estConnecte()) {
    items += `<button type="button" class="pt-item" data-act="progression" aria-label="Ma progression"><span class="pt-ic">${icSvg('scale')}</span><span class="pt-cap">Progression</span></button>`;
  }
  items += `<button type="button" class="pt-item pt-item--obj" data-act="obj" aria-label="Voir le détail de mes objectifs nutritionnels"><span class="pt-pill">${objPill}</span><span class="pt-cap">Objectif</span></button>`;

  card.innerHTML = `
    <div class="pt-top">
      <div class="pt-titles">
        ${prenom ? `<p class="pt-kicker">Bonjour ${escapeHtml(prenom)}</p>` : ''}
        <div class="pt-titlerow"><span class="pt-headic pt-headic--logo">${brandMark()}</span><h2 class="pt-title">${objLabels[state.profil.objectif] || 'Mon plan'}</h2></div>
      </div>
      ${dayTag}
    </div>
    <div class="pt-row">${items}</div>`;

  const gi = card.querySelector('[data-act="progression"]'); if (gi) gi.addEventListener('click', () => setTab('progression'));
  const af = card.querySelector('[data-act="affine"]'); if (af) af.addEventListener('click', function () { const bt = $('#btnAvance'); if (bt) bt.click(); });
  const ob = card.querySelector('[data-act="obj"]'); if (ob) ob.addEventListener('click', openObjDetail);

}
// Détail des objectifs nutritionnels (ouvert depuis la pastille Objectif).
function openObjDetail() {
  const p = $('#objDetail'); if (!p || !state.plan || !state.plan.besoins) return;
  const b = state.plan.besoins;
  const set = (id, v) => { const e = $('#' + id); if (e) e.textContent = v; };
  set('objKcal', state.masquerCalories ? '—' : (b.kcalCible + ' kcal'));
  set('objProt', b.macros.proteines + ' g');
  set('objGluc', b.macros.glucides + ' g');
  set('objLip', b.macros.lipides + ' g');
  // Pas d'objectif de poids affiché : l'app ne demande aucun chiffre à atteindre,
  // et en inventer un (l'ancien « −6 kg » du challenge) serait une promesse.
  const w = $('#objWeight'); if (w) w.innerHTML = '';
  p.classList.remove('hidden');
}
function closeObjDetail() { const p = $('#objDetail'); if (p) p.classList.add('hidden'); }

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
    const nowTag = di === todayIdx ? '<span class="day-now">Aujourd\'hui</span>' : '';
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
  host.innerHTML = ''; host.classList.add('hidden'); return; // Section « Conseils du jour » retirée (à la demande).
  /* eslint-disable no-unreachable */
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
        <button class="mini-btn" data-act="open">${icSvg('eye')} Voir la recette</button>
        <button class="mini-btn" data-act="swap">${icSvg('refresh')} Remplacer</button>
      </div>
      <div class="meal-track-wrap">
        <span class="meal-track-lbl">Suivi du repas</span>
        <div class="meal-track" role="group" aria-label="Suivi du repas">
          <button class="track-btn ${st === 'respecte' ? 'on-ok' : ''}" data-act="t-ok" title="Repas suivi" aria-label="Repas suivi">${icSvg('check')}</button>
          <button class="track-btn ${st === 'non' ? 'on-no' : ''}" data-act="t-no" title="Repas sauté" aria-label="Repas sauté">${icSvg('x')}</button>
          <button class="track-btn ${(st === 'adapte' || st === 'autre') ? 'on-alt' : ''}" data-act="t-alt" title="J'ai mangé autre chose" aria-label="J'ai mangé autre chose">${icSvg('edit')}</button>
        </div>
      </div>
    </div>`;
  el.classList.toggle('is-autre', st === 'autre');
  el.classList.toggle('is-adapte', st === 'adapte');
  el.classList.add('is-clickable'); // toute la carte ouvre la recette (cf. handler ci-dessous)
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    const act = btn && btn.dataset.act;
    if (act === 'open') { openRecipe(r, di, mi); return; }
    if (act === 'swap') { swapMeal(di, mi); return; }
    if (act === 't-ok') { setMealStatus(di, mi, 'respecte'); return; }
    if (act === 't-no') { setMealStatus(di, mi, 'non'); return; }
    if (act === 't-alt') { openSuiviForMeal(di, mi); return; }
    // Clic ailleurs sur la carte -> ouvrir la recette, SAUF sur un element interactif
    // (lien « option rapide » de collation, autre bouton/lien).
    if (e.target.closest('a, button, input, label, select, textarea')) return;
    openRecipe(r, di, mi);
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
    const alts = inPlan ? altsCompatibles(i.nom) : [];
    const swapBtn = alts.length
      ? `<button class="ing-swap" title="Remplacer par un équivalent" aria-label="Remplacer ${escapeHtml(i.nom)}" aria-expanded="false" data-ing="${idx}">${icSvg('swap')}</button>` : '';
    const scanBtn = inPlan
      ? `<button class="ing-scan" title="Remplacer en scannant un produit" aria-label="Scanner pour remplacer ${escapeHtml(i.nom)}" data-ing="${idx}">${icSvg('scan')}</button>` : '';
    const altsMenu = alts.length
      ? `<div class="ing-alts hidden" data-altsfor="${idx}"><span class="ing-alts-lbl">Remplacer par</span>${alts.map((a) => `<button type="button" class="ing-alt" data-ing="${idx}" data-alt="${escapeHtml(a)}">${icSvg('swap')} ${escapeHtml(a)}</button>`).join('')}</div>` : '';
    return `<li><span class="ing-left">${escapeHtml(i.nom)}${swapBtn}${scanBtn}</span><span class="q">${q} ${uniteLabel(i.unite, (Number(i.quantite) || 0) * state.portions)}</span>${altsMenu}</li>`;
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
    $$('#modalBody .ing-swap').forEach((b) => b.addEventListener('click', () => toggleIngAlts(Number(b.dataset.ing), b)));
    $$('#modalBody .ing-alt').forEach((b) => b.addEventListener('click', () => applyIngredientSwap(di, mi, Number(b.dataset.ing), b.dataset.alt)));
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
    // Levier proteines/satiete : contextualise selon ce que la recette contient DEJA.
    const aBaseLaitiere = laitiers.length > 0;                       // skyr / fromage blanc / yaourt deja present
    const aWhey = has(/\bwhey\b|proteines? en poudre|isolat/);
    const aSucre = has(/miel|sucre|sirop|confiture|chocolat|pate a tartiner/);
    if (!aBaseLaitiere) {
      ajust.push('Pour plus de protéines et de satiété, ajoute du skyr ou du fromage blanc.');
    } else {
      // La recette tourne deja autour du skyr / fromage blanc -> autres alternatives.
      if (!aWhey) ajust.push('Base laitière déjà présente : pour encore plus de protéines, ajoute une dose de whey (protéine en poudre) si tu en as.');
      if (!aSucre) ajust.push('Envie d\'un petit goût sucré ? Un filet de miel fait le job — ça reste du sucre naturel, à doser avec modération.');
      if (aWhey && aSucre) ajust.push('Pour varier, ajoute quelques oléagineux ou des fruits rouges : plus de satiété sans alourdir.');
    }
    if (aSucre) ajust.push('Tu surveilles les sucres ? Réduis le miel/sucre ou remplace par un fruit frais.');
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
// Alternatives d'un ingredient, filtrees selon les contraintes (allergies/familles + detestes).
function altsCompatibles(nom) {
  const interdits = motsAllergenesInterdits();
  const courant = normTxt(nom);
  return trouverAlternatives(nom).filter((a) => {
    const na = normTxt(a);
    return na !== courant && !interdits.some((m) => m && na.includes(m));
  });
}
// Ouvre/ferme le petit menu d'equivalents affiche sous un ingredient (un seul ouvert a la fois).
function toggleIngAlts(idx, btn) {
  const menu = document.querySelector('#modalBody .ing-alts[data-altsfor="' + idx + '"]');
  if (!menu) return;
  const willOpen = menu.classList.contains('hidden');
  document.querySelectorAll('#modalBody .ing-alts').forEach((m) => m.classList.add('hidden'));
  document.querySelectorAll('#modalBody .ing-swap').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  if (willOpen) { menu.classList.remove('hidden'); if (btn) btn.setAttribute('aria-expanded', 'true'); }
}
// Remplace l'ingredient idx par "choix" (equivalent choisi) et recalcule kcal/macros
// par DIFFERENCE (old -> new) via la table NUTRI. Marche en demo comme en IA.
function applyIngredientSwap(di, mi, idx, choix) {
  const recette = state.plan.jours[di].repas[mi].recette;
  const ing = recette.ingredients[idx];
  if (!ing || !choix || normTxt(ing.nom) === normTxt(choix)) return;
  const ancien = ing.nom;
  ing.nom = choix; // on conserve quantite/unite ; le rayon reste indicatif
  const mOld = macrosIngredient(ancien, ing.quantite, ing.unite);
  const mNew = macrosIngredient(choix, ing.quantite, ing.unite);
  if (mOld && mNew) {
    recette.kcal = Math.max(0, Math.round((recette.kcal || 0) + mNew.kcal - mOld.kcal));
    recette.proteines = Math.max(0, Math.round((recette.proteines || 0) + mNew.p - mOld.p));
    recette.glucides = Math.max(0, Math.round((recette.glucides || 0) + mNew.g - mOld.g));
    recette.lipides = Math.max(0, Math.round((recette.lipides || 0) + mNew.l - mOld.l));
  }
  // Hors-ligne (sans IA) : on remplace l'ancien nom dans les etapes statiques pour la coherence.
  if (!state.ia) recette.etapes = (recette.etapes || []).map((s) => remplacerMot(s, ancien, choix));
  saveLocal();
  // recompute: reconstruit la fiche et raffine les macros (IA) a partir des ingredients actuels.
  openRecipe(recette, di, mi, { recompute: true });
  renderPlan();
  showToast(ancien + ' → ' + choix, { icon: 'check' });
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
// L'ordre = le parcours physique d'un magasin. « Placard » (longue conservation,
// replié) et « À vérifier » (non référencés sans rayon) ferment la marche.
const RAYON_ORDRE = ['Fruits & légumes', 'Fruits & legumes', 'Boucherie', 'Charcuterie / Traiteur', 'Poissonnerie', 'Crèmerie', 'Cremerie', 'Boulangerie', 'Épicerie', 'Epicerie', 'Surgelés', 'Surgeles', 'Rayon frais', 'Rayon vegetal', 'Placard', 'À vérifier'];
const RAYON_PLACARD = 'Placard';
const RAYON_A_VERIFIER = 'À vérifier';

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

// Le calcul vit dans le MOTEUR PUR (public/coursesEngine.js, testé en node) :
// agrégation par ingrédient canonique, conversion d'unités, arrondis d'achat,
// unités d'ACHAT, split frais/placard, repli des non-référencés. Ici on ne fait
// que le brancher sur l'état et regrouper par rayon pour l'affichage.

// Les avertissements du DERNIER build : les ingrédients de recette absents du
// référentiel (public/coursesCatalogue.js), à y ajouter au fil de l'eau.
let shoppingWarnings = [];
let shoppingPlacard = []; // le bloc « Placard » du dernier build (staples)

function buildShoppingList() {
  syncPortions();
  const res = CoursesEngine.construireListe(state.plan, state.portions);
  shoppingWarnings = res.warnings;
  shoppingPlacard = res.placard;
  if (shoppingWarnings.length) console.warn('[COURSES] ' + shoppingWarnings.length + ' ingrédient(s) hors référentiel :\n- ' + shoppingWarnings.join('\n- '));
  const parRayon = {};
  res.frais.forEach((item) => { (parRayon[item.rayon] = parRayon[item.rayon] || []).push(item); });
  // Le placard est une PRÉSENTATION (repliée), pas un rayon : les articles y
  // gardent leur rayon du référentiel (Épicerie…) pour les exports.
  if (res.placard.length) parRayon[RAYON_PLACARD] = res.placard;
  return parRayon;
}

function rayonsTries(parRayon) {
  return Object.keys(parRayon).sort((a, b) => {
    const ia = RAYON_ORDRE.indexOf(a), ib = RAYON_ORDRE.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}

// Reglage "Cuisiner pour" (adultes + enfants) en tete de la liste de courses.
// Replie par defaut (resume 1 ligne) pour montrer la liste tout de suite ; ouvre au tap.
let _persOpen = false;
function personnesControlHTML() {
  const a = state.adultes || 1, e = state.enfants || 0;
  const pills = (cur, presets, kind) => {
    const vals = presets.includes(cur) ? presets : [...presets, cur].sort((x, y) => x - y);
    return vals.map((v) => `<button type="button" class="pers-pill${v === cur ? ' on' : ''}" data-pers="${kind}" data-val="${v}">${v}</button>`).join('')
      + `<button type="button" class="pers-pill pers-plus" data-pers="${kind}" data-val="plus" aria-label="Personnaliser">+</button>`;
  };
  return `
    <details class="pers-ctrl"${_persOpen ? ' open' : ''}>
      <summary class="pers-summary">
        <span class="pers-summary-ic">${icSvg('users')}</span>
        <span class="pers-summary-txt">Pour : <strong>${escapeHtml(personnesResume())}</strong></span>
        <span class="pers-summary-edit">${icSvg('edit')}<span>Modifier</span></span>
      </summary>
      <div class="pers-body">
        <div class="pers-row"><span class="pers-lbl">Adultes</span><div class="pers-pills">${pills(a, [1, 2, 3, 4], 'adultes')}</div></div>
        <div class="pers-row"><span class="pers-lbl">Enfants</span><div class="pers-pills">${pills(e, [0, 1, 2, 3], 'enfants')}</div></div>
        <div class="pers-resume">Liste calculée pour : <strong>${escapeHtml(personnesResume())}</strong><span class="pers-tot">Total portions : ${fmtQty(totalPortions())}</span></div>
        <p class="pers-note">Ajuste seulement les quantités à acheter — ton plan, tes calories et tes macros restent inchangés.</p>
      </div>
    </details>`;
}

function renderShopping() {
  const parRayon = buildShoppingList();
  const cont = $('#shoppingList');
  const totalArticles = Object.values(parRayon).reduce((s, arr) => s + arr.length, 0);
  const nbRayons = Object.keys(parRayon).length;
  const aside =
    '<div class="shop-aside-card">' +
      '<div class="comp-aside-h">' + icSvg('cart') + ' Ta liste en un coup d’œil</div>' +
      '<div class="shop-stat-grid">' +
        '<div class="shop-stat"><b>' + totalArticles + '</b><span>articles</span></div>' +
        '<div class="shop-stat"><b>' + nbRayons + '</b><span>rayons</span></div>' +
        '<div class="shop-stat"><b>' + state.plan.jours.length + '</b><span>jours</span></div>' +
      '</div>' +
      '<p class="comp-aside-note">Coche les articles au fur et à mesure. La liste s’adapte au nombre de personnes via le bloc « Pour ».</p>' +
    '</div>';
  cont.innerHTML = '<div class="shop-layout"><div class="shop-main">' + personnesControlHTML() + '</div><aside class="shop-aside">' + aside + '</aside></div>';
  const main = cont.querySelector('.shop-main');
  $('#shoppingDays').textContent = state.plan.jours.length;
  const portSpan = $('#shoppingPortions'); if (portSpan) portSpan.textContent = fmtQty(state.portions);
  // Mémorise l'état ouvert/replié pour qu'un clic sur un pill (qui re-render) ne referme pas le bloc.
  const persDet = cont.querySelector('.pers-ctrl');
  if (persDet) persDet.addEventListener('toggle', () => { _persOpen = persDet.open; });
  cont.querySelectorAll('.pers-pill').forEach((b) => b.addEventListener('click', () => {
    const kind = b.dataset.pers, val = b.dataset.val;
    if (kind === 'adultes') setAdultes(val === 'plus' ? (state.adultes || 1) + 1 : Number(val));
    else setEnfants(val === 'plus' ? (state.enfants || 0) + 1 : Number(val));
  }));
  rayonsTries(parRayon).forEach((rayon) => {
    // Le placard (longue conservation) se replie : on achète pour plusieurs
    // semaines, pas à chaque passage — la liste du frais reste courte.
    const placard = rayon === RAYON_PLACARD;
    const group = document.createElement(placard ? 'details' : 'div');
    group.className = 'rayon-group' + (placard ? ' rayon-placard' : '');
    group.innerHTML = placard
      ? `<summary class="rayon-title">${rayon} <span class="rayon-note">longue conservation — vérifie tes réserves</span></summary>`
      : `<div class="rayon-title">${rayon}${rayon === RAYON_A_VERIFIER ? ' <span class="rayon-note">à ranger dans le bon rayon</span>' : ''}</div>`;
    parRayon[rayon].sort((a, b) => a.nom.localeCompare(b.nom)).forEach((item, i) => {
      const id = `shop-${rayon}-${i}`.replace(/[^a-z0-9-]/gi, '');
      const row = document.createElement('div');
      row.className = 'shop-item';
      row.innerHTML = `<input type="checkbox" id="${id}" />
        <label for="${id}">${escapeHtml(item.nom)}${item.sousTitre ? `<span class="shop-achat">${escapeHtml(item.sousTitre)}</span>` : ''}</label>
        <span class="q">${escapeHtml(item.quantite_achat)}</span>`;
      row.querySelector('input').addEventListener('change', (e) => row.classList.toggle('checked', e.target.checked));
      group.appendChild(row);
    });
    main.appendChild(group);
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

// Version imprimable du plan (repli ordinateur si la génération PDF échoue).
function printPlanPdf() {
  const b = state.plan.besoins;
  const objLabels = { perte: 'Perte de poids', maintien: 'Maintien', muscle: 'Prise de muscle', energie: 'Plus d\'énergie' };
  let html = `<h1>Mon plan de repas — ${APP_NOM}</h1>
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
// Export du plan : mobile -> partage natif du PDF (Fichiers / WhatsApp / Mail…),
// repli téléchargement ; ordinateur -> téléchargement direct du PDF. (Même correctif
// que la liste de courses : window.print est bloqué sur mobile.)
function exportPlanPdf() {
  let blob = null;
  try { blob = buildPlanPdfBlob(); } catch (_) { blob = null; }
  if (!blob) { printPlanPdf(); return; }
  const filename = 'mon-plan-repas.pdf';
  if (isMobileDevice() && navigator.share) {
    try {
      const file = new File([blob], filename, { type: 'application/pdf' });
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: 'Mon plan de repas' }).catch((e) => {
          if (!e || e.name !== 'AbortError') downloadBlob(filename, blob);
        });
        return;
      }
    } catch (_) { /* -> téléchargement */ }
  }
  downloadBlob(filename, blob);
}

// Détection mobile : sur mobile l'impression via window.open est bloquée/inopérante,
// on privilégie le partage natif / le téléchargement de fichier.
function isMobileDevice() {
  try {
    if (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return true;
    if (navigator.maxTouchPoints > 1 && !(window.matchMedia && window.matchMedia('(min-width: 1024px)').matches)) return true;
  } catch (_) { /* ignore */ }
  return false;
}
// Liste de courses en texte simple (partageable / imprimable partout).
function shoppingListText() {
  // Rendu par le moteur (une ligne par article, join — T7) : le même que testent
  // les tests node, donc jamais deux articles collés sur une ligne.
  syncPortions();
  const liste = CoursesEngine.construireListe(state.plan, state.portions);
  return CoursesEngine.rendreTexte(liste, { jours: state.plan.jours.length, personnes: state.portions, programme: APP_NOM });
}
function downloadTextFile(filename, text) {
  try {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch (_) { showToast('Export impossible sur cet appareil.', { icon: 'info' }); }
}
// Version imprimable (PDF via l'impression du navigateur) — fiable sur ordinateur.
function printShoppingList() {
  const parRayon = buildShoppingList();
  const prog = '';
  let html = `<h1>Liste de courses — ${APP_NOM}</h1>
    ${prog ? `<p class="sub" style="font-weight:700;color:#2563EB;margin:0 0 2px;">${prog}</p>` : ''}
    <p class="sub">Pour ${state.plan.jours.length} jour(s) · ${state.portions} personne(s)</p>`;
  rayonsTries(parRayon).forEach((rayon) => {
    html += `<div class="rayon">${rayon}</div>`;
    parRayon[rayon].sort((a, b) => a.nom.localeCompare(b.nom)).forEach((item) => {
      html += `<div class="shop">☐ ${escapeHtml(item.nom)} — ${escapeHtml(item.quantite_achat)}${item.sousTitre ? ' <em>· ' + escapeHtml(item.sousTitre) + '</em>' : ''}</div>`;
    });
  });
  printDocument('Liste de courses', html);
}
function downloadBlob(filename, blob) {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch (_) { showToast('Export impossible sur cet appareil.', { icon: 'info' }); }
}

// --- Génération d'un vrai PDF de la liste, sans dépendance (police standard
//     Helvetica + WinAnsiEncoding pour les accents, cases à cocher vectorielles,
//     pagination A4). Renvoie un Blob application/pdf. ---
const _CP1252 = { 0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F };
function _pdfStr(s) {
  let out = '';
  for (const ch of String(s)) {
    let c = ch.codePointAt(0);
    if (c > 0xFF) c = (_CP1252[c] != null) ? _CP1252[c] : 0x3F; // hors Latin-1 -> mappe CP1252 sinon '?'
    if (c === 0x28 || c === 0x29 || c === 0x5C) out += '\\'; // échappe ( ) \
    out += String.fromCharCode(c);
  }
  return out;
}
function buildShoppingPdfBlob() {
  const parRayon = buildShoppingList();
  const W = 595, H = 842, ML = 50, MB = 55, TOP = H - 50;
  const pages = []; let cur = ''; let y = TOP;
  const newPage = () => { pages.push(cur); cur = ''; y = TOP; };
  const ensure = (space) => { if (y - space < MB) newPage(); };
  const text = (str, x, size, bold, rgb) => {
    const c = rgb || [0, 0, 0];
    cur += `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${c[0]} ${c[1]} ${c[2]} rg 1 0 0 1 ${x} ${y} Tm (${_pdfStr(str)}) Tj ET\n`;
  };
  const checkbox = (x, boxY, s) => { cur += `0.55 0.6 0.7 RG 1 w ${x} ${boxY} ${s} ${s} re S\n`; };
  // En-tête
  text('Liste de courses', ML, 20, true, [0.09, 0.11, 0.13]); y -= 26;
  const _prog = '';
  if (_prog) { text(_prog, ML, 12, true, [0.15, 0.39, 0.92]); y -= 18; }
  text(APP_NOM + ' · Pour ' + state.plan.jours.length + ' jour(s) · ' + state.portions + ' personne(s)', ML, 10.5, false, [0.42, 0.45, 0.5]); y -= 26;
  rayonsTries(parRayon).forEach((rayon) => {
    ensure(40);
    y -= 4;
    text(rayon, ML, 13, true, [0.231, 0.510, 0.965]); y -= 19;
    parRayon[rayon].sort((a, b) => a.nom.localeCompare(b.nom)).forEach((item) => {
      ensure(17);
      let label = item.nom + ' — ' + item.quantite_achat + (item.sousTitre ? ' · ' + item.sousTitre : '');
      if (label.length > 78) label = label.slice(0, 77) + '…';
      checkbox(ML + 1, y - 1, 9);
      text(label, ML + 18, 11, false, [0.12, 0.14, 0.18]);
      y -= 17;
    });
    y -= 8;
  });
  pages.push(cur);
  return _assemblePdf(pages, W, H);
}
// Assemble des flux de pages (chaînes de contenu PDF) en un Blob application/pdf
// (catalogue + 2 polices Helvetica/Bold WinAnsi + pages + xref). Partagé par les
// exports Liste de courses et Plan.
function _assemblePdf(pages, W, H) {
  const fontReg = 3, fontBold = 4;
  let num = 5; const pageNums = [], contentNums = [];
  for (let i = 0; i < pages.length; i++) { contentNums.push(num++); pageNums.push(num++); }
  const objs = {};
  objs[1] = '<</Type/Catalog/Pages 2 0 R>>';
  objs[2] = `<</Type/Pages/Kids[${pageNums.map((n) => n + ' 0 R').join(' ')}]/Count ${pages.length}>>`;
  objs[fontReg] = '<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>';
  objs[fontBold] = '<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold/Encoding/WinAnsiEncoding>>';
  for (let i = 0; i < pages.length; i++) {
    const content = pages[i];
    objs[contentNums[i]] = `<</Length ${content.length}>>\nstream\n${content}\nendstream`;
    objs[pageNums[i]] = `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${W} ${H}]/Resources<</Font<</F1 ${fontReg} 0 R/F2 ${fontBold} 0 R>>>>/Contents ${contentNums[i]} 0 R>>`;
  }
  const maxNum = num - 1;
  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const off = [];
  for (let n = 1; n <= maxNum; n++) { off[n] = pdf.length; pdf += `${n} 0 obj\n${objs[n]}\nendobj\n`; }
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${maxNum + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= maxNum; n++) pdf += String(off[n]).padStart(10, '0') + ' 00000 n \n';
  pdf += `trailer\n<</Size ${maxNum + 1}/Root 1 0 R>>\nstartxref\n${xrefPos}\n%%EOF`;
  const bytes = Uint8Array.from(pdf, (c) => c.charCodeAt(0) & 0xFF);
  return new Blob([bytes], { type: 'application/pdf' });
}
// Découpe un texte en lignes d'au plus maxChars caractères (aux espaces).
function _wrapText(str, maxChars) {
  const words = String(str).split(/\s+/).filter(Boolean);
  const lines = []; let line = '';
  for (const w of words) {
    if (!line) line = w;
    else if ((line + ' ' + w).length <= maxChars) line += ' ' + w;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}
// PDF du plan de repas (jours -> repas -> ingrédients + étapes), même moteur.
function buildPlanPdfBlob() {
  const W = 595, H = 842, ML = 50, MB = 55, TOP = H - 50, WRAP = 92;
  const pages = []; let cur = ''; let y = TOP;
  const newPage = () => { pages.push(cur); cur = ''; y = TOP; };
  const ensure = (space) => { if (y - space < MB) newPage(); };
  const text = (str, x, size, bold, rgb) => {
    const c = rgb || [0, 0, 0];
    cur += `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${c[0]} ${c[1]} ${c[2]} rg 1 0 0 1 ${x} ${y} Tm (${_pdfStr(str)}) Tj ET\n`;
  };
  const para = (str, x, size, bold, rgb, hang) => {
    _wrapText(str, WRAP).forEach((ln, i) => { ensure(size + 3); text(i && hang ? hang + ln : ln, x, size, bold, rgb); y -= size + 3; });
  };
  const b = state.plan.besoins;
  const objLabels = { perte: 'Perte de poids', maintien: 'Maintien', muscle: 'Prise de muscle', energie: 'Plus d\'énergie' };
  text('Mon plan de repas — ' + APP_NOM, ML, 19, true, [0.09, 0.11, 0.13]); y -= 24;
  const sub = 'Objectif : ' + (objLabels[state.profil.objectif] || '—') + (state.masquerCalories ? '' : ' · ~' + (b.kcalCible || '') + ' kcal/jour') + ' · ' + state.portions + ' personne(s) · Estimations indicatives';
  text(sub, ML, 10, false, [0.42, 0.45, 0.5]); y -= 24;
  (state.plan.jours || []).forEach((jour) => {
    ensure(60);
    y -= 6;
    text(jour.jour, ML, 15, true, [0.231, 0.510, 0.965]); y -= 21;
    (jour.repas || []).forEach((repas) => {
      const r = repas.recette; if (!r) return;
      ensure(46);
      text(repas.label + ' — ' + r.nom, ML, 12, true, [0.12, 0.14, 0.18]); y -= 15;
      text((state.masquerCalories ? '' : (r.kcal + ' kcal · ')) + r.tempsMinutes + ' min', ML, 9.5, false, [0.5, 0.53, 0.58]); y -= 16;
      (r.ingredients || []).forEach((i) => {
        para('•  ' + i.nom + ' — ' + fmtQty((Number(i.quantite) || 0) * state.portions) + ' ' + i.unite, ML + 6, 10.5, false, [0.2, 0.22, 0.26], '    ');
      });
      y -= 4;
      (r.etapes || []).forEach((s, si) => {
        para((si + 1) + '. ' + s, ML + 6, 10, false, [0.34, 0.36, 0.4], '   ');
      });
      y -= 12;
    });
    y -= 6;
  });
  pages.push(cur);
  return _assemblePdf(pages, W, H);
}
// Export de la liste : mobile -> partage natif (Fichiers / WhatsApp / Mail…) du PDF,
// repli téléchargement ; ordinateur -> téléchargement direct du PDF. Plus de window.print
// (bloqué sur mobile), d'où l'impossibilité de « télécharger » constatée auparavant.
function exportShoppingPdf() {
  let blob = null;
  try { blob = buildShoppingPdfBlob(); } catch (_) { blob = null; }
  if (!blob) { // repli extrême : ancien comportement selon l'appareil
    if (isMobileDevice()) downloadTextFile('liste-de-courses.txt', shoppingListText());
    else printShoppingList();
    return;
  }
  const filename = 'liste-de-courses.pdf';
  if (isMobileDevice() && navigator.share) {
    try {
      const file = new File([blob], filename, { type: 'application/pdf' });
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: 'Liste de courses' }).catch((e) => {
          if (!e || e.name !== 'AbortError') downloadBlob(filename, blob); // annulé -> rien ; échec -> download
        });
        return;
      }
    } catch (_) { /* -> téléchargement */ }
  }
  downloadBlob(filename, blob);
}

// ---------- Ma fiche (E1 + E6 : recap perso) ----------
const COMPLEMENT_LABELS = { non: 'Aucun', aucun: 'Aucun', proteines: 'Protéine (whey)', proteines_vegetales: 'Protéine végétale', creatine: 'Créatine', vitamines: 'Multivitamines', multivitamines: 'Multivitamines', omega3: 'Oméga 3', magnesium: 'Magnésium', fibres: 'Fibres', electrolytes: 'Électrolytes', vitamineD: 'Vitamine D3', ashwagandha: 'Ashwagandha', bruleur: 'Brûleur de graisse', collagene: 'Collagène', preworkout: 'Pré-workout', autre: 'Autre' };

// Lien boutique par complement recommande : un clic -> la fiche produit.
// ⚠️ VIDE PAR DÉFAUT dans cette version. L'app d'origine pointait la boutique du
// coach (liens affiliés) ; hors de ce dispositif, recommander une enseigne précise
// n'est plus neutre. Renseigner cette constante (ex. 'https://ma-boutique.fr/products/')
// suffit à réactiver TOUS les liens produit : ils sont conditionnés à elle.
// On NE met PAS de lien pour le bruleur (deconseille) ni les fibres (pas de produit dedie).
// LE NOM de l'app, dit a UN seul endroit : exports PDF, agenda, partages. Le
// changer ici le change partout (voir aussi <title>, manifest.json et APP_NOM
// cote serveur).
const APP_NOM = 'My Coach Nutrition';

const SHOP_BASE = '';
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

function openFiche() { renderFiche(); $('#fichePanel').classList.remove('hidden'); }
function closeFiche() { $('#fichePanel').classList.add('hidden'); }

function renderFiche() {
  const p = state.profil, pr = state.preferences, b = state.plan ? state.plan.besoins : null;
  const objLabels = { perte: 'Perte de poids', maintien: 'Maintien', muscle: 'Prise de muscle', energie: 'Plus d\'énergie' };
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
      <div class="fiche-row"><span>Ce que tu prends</span><b>${escapeHtml(compStr)}</b></div>
      ${ficheComplementsConseilles(p, pr)}
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
  // ⚠️ Le câblage global de [data-go] est posé UNE FOIS au démarrage : ce bouton,
  // lui, naît à chaque construction de la fiche. Sans ce branchement, il serait
  // muet — le lien vers les explications ne mènerait nulle part.
  $$('#ficheBody [data-go]').forEach((r) => r.addEventListener('click', () => {
    const t = $('#' + r.dataset.go); if (t) t.click();
  }));
}

// Les compléments CONSEILLÉS, dans la fiche : les noms, groupés par niveau, et
// rien d'autre.
// ⚠️ Sans explication ici, volontairement : la fiche est un récapitulatif qu'on
// parcourt des yeux, et le « pourquoi » de chaque produit fait plusieurs lignes.
// Il vit à sa place, dans l'écran Compléments — d'où le renvoi en pied de bloc.
// ⚠️ La liste vient de recommanderComplements, la MÊME fonction que cet écran :
// deux calculs séparés auraient fini par conseiller deux choses différentes.
function ficheComplementsConseilles(profil, prefs) {
  let reco = [];
  try { reco = (recommanderComplements(profil, prefs) || {}).reco || []; } catch (_) { return ''; }
  if (!reco.length) return '';
  const NIVEAUX = [['essentiel', 'Les essentiels'], ['envisager', 'À envisager'], ['aide', 'Peut t\'aider']];
  const lignes = NIVEAUX.map(([cle, titre]) => {
    const noms = reco.filter((r) => r.priorite === cle).map((r) => r.nom);
    return noms.length ? `<div class="fiche-row"><span>${titre}</span><b>${escapeHtml(noms.join(', '))}</b></div>` : '';
  }).join('');
  return `<div class="fiche-sub">Conseillés pour toi</div>${lignes}
    <button type="button" class="fiche-lien" data-go="btnComplements">Voir le détail et les conseils</button>`;
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
    perte: 'perdre du poids',
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
      t = `Ton objectif est de ${obj}${prot ? `, avec un besoin d'environ ${prot} g de protéines par jour` : ''}. Atteindre cette quantité par l'alimentation seule peut être exigeant${c.objectif === 'muscle' ? ', surtout les jours d\'entraînement' : ''}.${dietNote} Une protéine en poudre t'aide à compléter facilement tes apports, notamment après l'entraînement ou en collation.`;
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
      t = `${c.objectif === 'perte' ? 'En perte de poids, ' : ''}le collagène soutient la peau, les articulations et les tissus — un plus pour la souplesse et le confort articulaire, surtout si tu es actif ou avec l'âge. À voir comme un confort, pas un indispensable.`;
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
  const protPerKg = objectif === 'muscle' ? 2.0 : (objectif === 'perte') ? 1.8 : 1.4;
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
  } else if (objectif === 'perte') {
    ess = [protKey, 'omega3']; env = ['multivitamines', 'collagene'];
    aide = ['magnesium', actif ? 'electrolytes' : 'vitamineD'];
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
  const shopUrl = (SHOP_BASE && handle) ? `${SHOP_BASE}${handle}${SHOP_UTM}` : '';
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
  const suivisChips = actifs.length ? `<div class="comp-suivis">${actifs.map((c) =>
    `<span class="comp-chip"><strong>${escapeHtml(c.nom)}</strong><em>${escapeHtml(c.moment)}</em><button type="button" class="comp-chip-x" data-comp-toggle="${c.cle}" aria-label="Retirer">${icSvg('x')}</button></span>`).join('')}</div>` : '';
  const aside =
    (actifs.length ? `<div class="comp-aside-card comp-aside-plan"><div class="comp-aside-h">${icSvg('check-circle')} Dans ton plan</div>${suivisChips}</div>` : '') +
    `<div class="comp-aside-card"><div class="comp-aside-h">${icSvg('shield')} Comment lire ces conseils</div>` +
      `<p>Les compléments sont une <b>aide secondaire</b>, jamais la base du résultat. Commence par « Les essentiels » selon ton objectif, puis ajoute « À envisager » si tu le souhaites.</p>` +
      `<p class="comp-aside-note">Informations générales, non médicales. Produits proposés par Biloba Nutrition. Ajoute un complément à ton plan pour le retrouver chaque jour et suivre sa prise.</p></div>`;
  $('#complementsBody').innerHTML = `
    ${data.resume ? `<div class="comp-resume">${escapeHtml(data.resume)}</div>` : ''}
    <div class="comp-layout">
      <div class="comp-main">
        ${sections}
        ${alertes ? `<div class="recipe-section-title">À noter</div>${alertes}` : ''}
      </div>
      <aside class="comp-aside">${aside}</aside>
    </div>`;
  $$('#complementsBody [data-comp-toggle]').forEach((b) => b.addEventListener('click', () => toggleComplementSuivi(b.dataset.compToggle)));
}

// ---------- Export agenda (.ics) ----------
// L'app d'origine proposait AUSSI une connexion Google Agenda (OAuth). Elle est
// retirée ici : elle demandait trois identifiants Google côté serveur, donc elle
// était de toute façon inactive tant qu'on ne les fournissait pas. Le fichier
// .ics, lui, ne demande rien et s'importe dans Google, Apple comme Outlook.
function openAgenda() {
  const body = $('#agendaBody');
  if (!body) return;
  body.innerHTML = `
    <h2 class="scan-title">${icSvg('calendar')} Mes repas dans mon agenda</h2>
    <p class="panel-sub">Télécharge le fichier de ta semaine et ouvre-le : tes repas
      s'ajoutent à ton calendrier, avec les ingrédients dans la description.
      Compatible Google Agenda, Apple Calendrier et Outlook.</p>
    <button type="button" class="btn btn-primary" id="agendaIcs" style="width:100%">
      ${icSvg('file')} Télécharger le calendrier (.ics)</button>`;
  $('#agendaIcs').addEventListener('click', () => { exportIcs(); $('#agendaIcs').innerHTML = 'Fichier téléchargé ✓'; });
  $('#agendaModal').classList.remove('hidden');
}
function closeAgenda() { const m = $('#agendaModal'); if (m) m.classList.add('hidden'); }


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
  const lignes = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//' + APP_NOM + '//FR', 'CALSCALE:GREGORIAN'];
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
      const desc = `${r.nom}\n${state.masquerCalories ? '' : r.kcal + ' kcal - '}${r.proteines} g proteines\nIngredients : ${ingr}\n(${APP_NOM} - indicatif)`;
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
    conseilsJour: state.conseilsJour, conseilsAjouts: state.conseilsAjouts,
    startDate: state.startDate,
    savedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(payload));
    $('#saveState').innerHTML = icSvg('check') + ' Plan sauvegardé';
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
// Un seul point d'entrée, et il ne câble QUE des écrans qui existent encore.
// L'ancien init() branchait une quarantaine de panneaux (dashboard coach,
// messagerie, guides, boutique, notifications…) : autant de `$('#x')` qui
// lèveraient une exception ici, puisque le HTML ne porte plus ces éléments.
function init() {
  // Le portail d'entrée (landing / connexion) REMPLACE le contenu de la page : plus
  // un seul élément de l'app n'est dans le DOM. Sans ce garde-fou, init() partait
  // câbler des `#id` absents et tombait dès la première ligne.
  if (window.__NUTRI_PORTAIL) return;
  // Un compte est en cours de revalidation côté serveur : on l'attend, sinon on
  // démarrerait sur un plan périmé avant de le remplacer sous les yeux de l'utilisateur.
  if (window.__NUTRI_REFRESH) { const p = window.__NUTRI_REFRESH; window.__NUTRI_REFRESH = null; p.then(init); return; }

  initSelections();
  personalizeStaticUI();
  goToStep(FIRST_STEP);
  refreshModeBadge();

  // --- Onboarding ---
  $('#ctaStart').addEventListener('click', () => showScreen('onboarding'));
  $('#btnNext').addEventListener('click', () => { if (validateStep()) goToStep(state.step + 1); });
  $('#btnPrev').addEventListener('click', () => goToStep(state.step - 1));
  $('#onboardingForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validateStep()) return;
    collectProfile();
    generateAndShow();
  });

  // --- Panneaux du plan ---
  const brancher = (btn, ouvrir, fermer, panneau) => {
    const b = $(btn); if (b && ouvrir) b.addEventListener('click', ouvrir);
    const c = $(fermer); if (c) c.addEventListener('click', panneau.close);
    const p = $(panneau.id); if (p) p.addEventListener('click', (e) => { if (e.target.id === panneau.id.slice(1)) panneau.close(); });
  };
  brancher('#btnShopping', openShopping, '#shoppingClose', { id: '#shoppingPanel', close: closeShopping });
  brancher('#btnFavoris', openFavoris, '#favorisClose', { id: '#favorisPanel', close: closeFavoris });
  brancher('#btnFiche', openFiche, '#ficheClose', { id: '#fichePanel', close: closeFiche });
  brancher('#btnSuivi', openSuivi, '#suiviClose', { id: '#suiviPanel', close: closeSuivi });
  brancher('#btnAnalyse', openAnalyse, '#analyseClose', { id: '#analysePanel', close: closeAnalyse });
  brancher('#btnComplements', openComplements, '#complementsClose', { id: '#complementsPanel', close: closeComplements });
  brancher('#btnAvance', openAvance, '#avanceClose', { id: '#avancePanel', close: closeAvance });
  brancher('#btnSuiviPlan', openSuiviPlan, '#suiviPlanClose', { id: '#suiviPlanPanel', close: closeSuiviPlan });
  $('#btnExportShopping').addEventListener('click', exportShoppingPdf);
  $('#avanceForm').addEventListener('submit', (e) => { e.preventDefault(); appliquerAvance(); });
  $('#suiviPlanBody').addEventListener('click', onSuiviPlanClick);
  $('#suiviPlanBody').addEventListener('input', onSuiviPlanInput);

  // --- SOS coach (IA + réponses préenregistrées) ---
  $('#sosFab').addEventListener('click', openSos);
  $('#coachForm').addEventListener('submit', (e) => { e.preventDefault(); sendCoach($('#coachInput').value); });
  $('#coachInput').addEventListener('input', autoGrowCoach);
  $('#coachInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCoach($('#coachInput').value); }
  });
  $('#coachChips').addEventListener('click', (e) => { const c = e.target.closest('.coach-chip'); if (c) sendCoach(c.dataset.q || c.textContent); });
  $$('#sosSheet [data-sos-close]').forEach((b) => b.addEventListener('click', closeSos));

  // --- Scan de produit ---
  $('#btnScan').addEventListener('click', () => { scanReplaceCtx = null; openScan(); });
  $('#btnScanFromSuivi').addEventListener('click', () => { scanReplaceCtx = null; closeSuivi(); openScan(); });
  $('#scanClose').addEventListener('click', closeScan);
  $('#scanModal').addEventListener('click', (e) => { if (e.target.id === 'scanModal') closeScan(); });
  $('#scanManualToggle').addEventListener('click', () => $('#scanManual').classList.toggle('hidden'));
  $('#scanManualGo').addEventListener('click', () => { const v = $('#scanManualInput').value.trim(); if (v) { stopCamera(); lookupBarcode(v); } });
  $('#scanManualInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const v = e.target.value.trim(); if (v) { stopCamera(); lookupBarcode(v); } } });
  $('#scanRetry').addEventListener('click', () => { scanShowStage('camera'); startCamera(); });

  // --- Analyse d'assiette ---
  $('#btnPlate').addEventListener('click', openPlate);
  $('#btnPlateFromSuivi').addEventListener('click', () => { closeSuivi(); openPlate(); });
  $('#plateClose').addEventListener('click', closePlate);
  $('#plateModal').addEventListener('click', (e) => { if (e.target.id === 'plateModal') closePlate(); });
  $('#plateDrop').addEventListener('click', () => $('#plateFile').click());
  $('#plateDrop').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#plateFile').click(); } });
  $('#plateFile').addEventListener('change', onPlateFile);
  $('#plateAnalyze').addEventListener('click', analyzePlate);
  $('#plateRetry').addEventListener('click', () => plateShowStage('input'));

  // --- Agenda (.ics, 100 % hors-ligne) ---
  brancher('#btnAgenda', openAgenda, '#agendaClose', { id: '#agendaModal', close: closeAgenda });

  // --- Navigation ---
  setupProfilCoach();
  $$('#bottom-nav .nav-i').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  $$('[data-go]').forEach((r) => r.addEventListener('click', () => { const t = $('#' + r.dataset.go); if (t) t.click(); }));
  // Le logo ramène à l'écran Repas — l'accueil de cette version.
  document.addEventListener('click', (e) => {
    if (e.target.closest('.brand-logo, .mc-brand')) setTab('plan');
  });

  // --- Compte ---
  const _pavEdit = $('#pavEdit'); if (_pavEdit) _pavEdit.addEventListener('click', () => openAvatarEditor());
  const _bChangePin = $('#btnChangePin'); if (_bChangePin) _bChangePin.addEventListener('click', openChangePin);
  const _cpClose = $('#changePinClose'); if (_cpClose) _cpClose.addEventListener('click', closeChangePin);
  const _cpSave = $('#cpSave'); if (_cpSave) _cpSave.addEventListener('click', saveChangePin);
  const _cpPanel = $('#changePinPanel'); if (_cpPanel) _cpPanel.addEventListener('click', (e) => { if (e.target.id === 'changePinPanel') closeChangePin(); });
  const _bLogout = $('#btnLogout'); if (_bLogout) _bLogout.addEventListener('click', logoutClient);
  const _navLogout = $('#navLogout'); if (_navLogout) _navLogout.addEventListener('click', logoutClient);

  // --- Administration (photos de plats) : visible pour le seul compte ADMIN_EMAIL ---
  const _bPlatsPhotos = $('#btnPlatsPhotos'); if (_bPlatsPhotos) _bPlatsPhotos.addEventListener('click', openPlatsPhotos);
  const _ppClose = $('#platsPhotosClose'); if (_ppClose) _ppClose.addEventListener('click', closePlatsPhotos);
  const _ppPanel = $('#platsPhotosPanel'); if (_ppPanel) _ppPanel.addEventListener('click', (e) => { if (e.target.id === 'platsPhotosPanel') closePlatsPhotos(); });
  fetchPhotoIndex();

  // --- Administration du Boost Nutrition (même porte que les photos de plats :
  //     la ligne n'est révélée que pour le compte ADMIN_EMAIL, cf. setupProfilCoach) ---
  const _bBoost = $('#btnBoostAdmin'); if (_bBoost) _bBoost.addEventListener('click', openBoostAdmin);
  const _baClose = $('#boostAdminClose'); if (_baClose) _baClose.addEventListener('click', closeBoostAdmin);
  const _baPanel = $('#boostAdminPanel');
  if (_baPanel) {
    _baPanel.addEventListener('click', (e) => { if (e.target.id === 'boostAdminPanel') closeBoostAdmin(); });
    // Les onglets vivent dans le balisage (pas dans le corps re-rendu) : on les
    // câble une fois pour toutes, ici, plutôt qu'à chaque rendu.
    _baPanel.querySelectorAll('.badm-tab').forEach((t) => t.addEventListener('click', () => {
      _badmVue = t.dataset.vue; _badmForm = null; _badmJournalId = null; _badmMsg = ''; badmRender();
    }));
  }

  // --- Détail des objectifs ---
  const _odClose = $('#objDetailClose'); if (_odClose) _odClose.addEventListener('click', closeObjDetail);
  const _odPanel = $('#objDetail'); if (_odPanel) _odPanel.addEventListener('click', (e) => { if (e.target.id === 'objDetail') closeObjDetail(); });

  // --- Compléments : « Non » est exclusif ---
  const compSet = $('.chip-set[data-multifield="complements"]');
  if (compSet) compSet.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip'); if (!chip) return;
    if (chip.dataset.value === 'non') {
      if (chip.classList.contains('selected')) $$('.chip', compSet).forEach((c) => { if (c !== chip) c.classList.remove('selected'); });
    } else if (chip.classList.contains('selected')) {
      const non = $('.chip[data-value="non"]', compSet);
      if (non) non.classList.remove('selected');
    }
    const ouiCoche = $$('.chip.selected', compSet).some((c) => c.dataset.value !== 'non');
    $('#complementsDetailWrap').classList.toggle('hidden', !ouiCoche);
  });

  // --- Actions du plan ---
  $('#btnExportPlan').addEventListener('click', exportPlanPdf);
  $('#btnNewPlan').addEventListener('click', () => generateAndShow(Math.floor(Math.random() * 1e6) + 1));
  $('#btnEditProfile').addEventListener('click', () => { prefillOnboarding(); showScreen('onboarding'); goToStep(1); });
  $('#portMinus').addEventListener('click', () => setPortions(state.portions - 1));
  $('#portPlus').addEventListener('click', () => setPortions(state.portions + 1));
  $('#modalClose').addEventListener('click', closeRecipe);
  $('#recipeModal').addEventListener('click', (e) => { if (e.target.id === 'recipeModal') closeRecipe(); });
  $('#navRestart').addEventListener('click', () => { if (confirm('Recommencer depuis le début ?')) showScreen('landing'); });

  // Échap ferme ce qui est ouvert. La liste ne cite que des panneaux existants :
  // une seule fonction absente ici ferait échouer TOUTES les fermetures.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    [closeRecipe, closeShopping, closeFavoris, closeFiche, closeSuivi, closeAnalyse,
      closeComplements, closeAvance, closeScan, closeSuiviPlan, closePlate, closeAgenda,
      closeSos, closePlatsPhotos, closeChangePin, closeObjDetail].forEach((f) => { try { f(); } catch (_) { /* panneau absent */ } });
  });

  // --- Reprise d'une session existante ---
  if (loadLocal()) {
    $('#portValue').textContent = state.portions;
    ancrerDemarragePlan(false);
    renderNeeds();
    renderPlan();
    $('#saveState').innerHTML = icSvg('check') + ' Plan restauré';
    showScreen('result');
    setTab('plan');
    if (estConnecte()) fetchProgression();
  }
}

// ---------- SOS coach : bouton flottant + feuille (reutilise /api/help-request) ----------
// ---------- Coach IA conversationnel ----------
const OBJ_LABELS = { perte: 'Perte de poids', maintien: 'Maintien', muscle: 'Prise de muscle', energie: 'Plus d\'énergie' };
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
  const humanBtn = ''; // plus de coach humain à prévenir : le coach IA est le seul interlocuteur
  return `<div class="cm cm-ai"><span class="cm-av">${icSvg('spark')}</span><div class="cm-b">${html}${humanBtn}</div></div>`;
}
function renderCoach(scroll) {
  const box = $('#coachMessages'); if (!box) return;
  let html = (state.coachMessages || []).map(coachBubble).join('');
  if (state.coachBusy) html += `<div class="cm cm-ai"><span class="cm-av">${icSvg('spark')}</span><div class="cm-b cm-typing"><span></span><span></span><span></span></div></div>`;
  box.innerHTML = html;
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
    let answered = false;
    try {
      const fr = await fetch(apiUrl('/api/coach-faq/match'), {
        method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ question: text }),
      });
      const fd = await fr.json();
      if (fd && fd.ok && fd.match && fd.match.reponse) {
        state.coachMessages.push({ role: 'assistant', content: fd.match.reponse });
        answered = true;
      }
    } catch (_) { /* FAQ indispo -> on tente l'IA / le coach humain ci-dessous */ }
    // 2) Sinon : Coach IA si une clé est configurée. Sans clé, on le dit — on ne
    //    renvoie plus vers un coach humain, il n'y en a pas.
    if (!answered) {
      const res = await fetch(apiUrl('/api/coach'), {
        method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ messages: state.coachMessages.slice(-18), contexte: coachContext() }),
      });
      const d = await res.json();
      if (d && d.ok && d.reponse) state.coachMessages.push({ role: 'assistant', content: d.reponse });
      else if (d && d.ia === false) state.coachMessages.push({ role: 'assistant', content: "Je n'ai pas de réponse toute prête à cette question précise. Essaie de la reformuler plus simplement — ou regarde les suggestions, elles couvrent les questions les plus fréquentes." });
      else state.coachMessages.push({ role: 'assistant', content: "Je n'ai pas réussi à répondre à l'instant. Réessaie dans un moment 🙏" });
    }
  } catch (e) {
    state.coachMessages.push({ role: 'assistant', content: 'Connexion difficile pour le moment. Réessaie dans un instant.' });
  }
  state.coachBusy = false;
  renderCoach(true); saveLocal();
}
// ---------- Navigation (barre basse mobile / sidebar desktop) ----------
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
  // Courses, Compléments et Suivi ouvrent des panneaux par-dessus la vue de fond.
  if (tab === 'complements') { $('#btnComplements').click(); return; }
  if (tab === 'courses') { $('#btnShopping').click(); return; }
  if (tab === 'suivi') { $('#btnSuiviPlan').click(); return; }
  if (tab === 'progression') renderProgression();
  const screen = $('#screen-result');
  if (screen) screen.setAttribute('data-tab', tab);
  $$('#bottom-nav .nav-i').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  window.scrollTo(0, 0);
}
// Affiche les lignes de l'écran Profil qui dépendent de la session.
function setupProfilCoach() {
  if (estConnecte()) {
    $$('#view-profil .profil-client').forEach((el) => el.classList.remove('hidden'));
    renderProfilAvatar();
    const lo = $('#btnLogout'); if (lo) lo.classList.remove('hidden');
    const nlo = $('#navLogout'); if (nlo) nlo.classList.remove('hidden'); // sidebar (desktop)
  }
  // Le seul privilège restant : la gestion des photos de plats et de la FAQ.
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
// --- Client : photo de profil (avatar communauté) ---
// ── AVATAR PERSONNALISABLE ─────────────────────────────────────────────────
// La config est la source de vérité ; le SVG est reconstruit par le MÊME moteur
// que celui du serveur (window.MCAvatar) -> l'aperçu ne peut pas diverger de ce
// que voient les autres membres.
let _avatarBrouillon = null; // config en cours d'édition (annulable)

function avatarConfigCourante() {
  return (window.__NUTRI_USER && window.__NUTRI_USER.avatarConfig) || null;
}
// Les badges d'avatar etaient debloques par le Punch du challenge. Sans lui, il
// n'y a plus de condition a evaluer : l'editeur propose tout, tout le temps.
function avatarProgression() {
  const punch = 0;
  const badges = [];
  return { punch, badges };
}
function renderProfilAvatar() {
  const pic = $('#pavPic'); if (!pic) return;
  const cfg = avatarConfigCourante();
  const lbl = $('#pavEditLbl');
  if (cfg && window.MCAvatar) {
    pic.innerHTML = window.MCAvatar.rendreSVG(cfg, { alt: 'Mon avatar' });
    pic.classList.add('has-img');
    if (lbl) lbl.textContent = 'Modifier mon avatar';
    return;
  }
  // Pas encore d'avatar : on montre la photo existante s'il y en a une (repli),
  // et on invite à créer l'avatar.
  const url = (window.__NUTRI_USER && window.__NUTRI_USER.avatarUrl) || '';
  pic.innerHTML = url ? '<img src="' + escapeHtml(url) + '" alt="Ma photo">' : '<svg class="ic"><use href="#ic-user"/></svg>';
  pic.classList.toggle('has-img', !!url);
  if (lbl) lbl.textContent = 'Créer mon avatar';
}

// Groupes de la personnalisation de base — TOUS gratuits, dès la création.
const AVATAR_GROUPES = [
  { cle: 'visage', titre: 'Visage', liste: 'VISAGES' },
  { cle: 'peau', titre: 'Peau', liste: 'PEAUX', couleur: true },
  { cle: 'coiffure', titre: 'Coiffure', liste: 'COIFFURES' },
  { cle: 'couleur_cheveux', titre: 'Couleur des cheveux', liste: 'CHEVEUX_COULEURS', couleur: true },
  { cle: 'yeux', titre: 'Yeux', liste: 'YEUX' },
  { cle: 'sourcils', titre: 'Sourcils', liste: 'SOURCILS' },
  { cle: 'bouche', titre: 'Bouche', liste: 'BOUCHES' },
  { cle: 'pilosite', titre: 'Barbe / moustache', liste: 'PILOSITES' },
  { cle: 'tenue', titre: 'Tenue', liste: 'TENUES', couleur: true },
];

function openAvatarEditor(focusAccessoire) {
  if (!window.MCAvatar) { showToast('Éditeur indisponible.'); return; }
  const A = window.MCAvatar;
  _avatarBrouillon = A.normaliserConfig(avatarConfigCourante() || A.configParDefaut((window.__NUTRI_USER || {}).email || ''));
  let panel = $('#avatarPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'avatarPanel';
    panel.className = 'panel hidden';
    panel.innerHTML = '<div class="panel-inner">'
      + '<div class="panel-head"><h2>' + icSvg('user') + ' Mon avatar</h2>'
      + '<button class="modal-close" id="avClose" aria-label="Fermer">' + icSvg('x') + '</button></div>'
      + '<div class="av-preview"><div class="av-pic" id="avPreview"></div>'
      + '<button type="button" class="btn btn-outline av-hasard" id="avHasard">' + icSvg('refresh') + ' Au hasard</button></div>'
      + '<div id="avBody"></div>'
      + '<div class="av-foot"><button type="button" class="btn btn-primary" id="avSave">Enregistrer</button></div>'
      + '</div>';
    document.body.appendChild(panel);
    $('#avClose').addEventListener('click', closeAvatarEditor);
    panel.addEventListener('click', (e) => { if (e.target === panel) closeAvatarEditor(); });
    $('#avSave').addEventListener('click', saveAvatar);
    $('#avHasard').addEventListener('click', () => {
      _avatarBrouillon = A.normaliserConfig(Object.assign(
        A.configParDefaut(String(Math.random())), { accessoires: _avatarBrouillon.accessoires }));
      renderAvatarEditor();
    });
  }
  panel.classList.remove('hidden');
  renderAvatarEditor();
  if (focusAccessoire) {
    setTimeout(() => {
      const el = panel.querySelector('.av-acc[data-id="' + focusAccessoire + '"]');
      if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('is-neuf'); }
    }, 120);
  }
}
function closeAvatarEditor() { const p = $('#avatarPanel'); if (p) p.classList.add('hidden'); _avatarBrouillon = null; }

function renderAvatarEditor() {
  const A = window.MCAvatar; const cfg = _avatarBrouillon; if (!A || !cfg) return;
  const prev = $('#avPreview'); if (prev) prev.innerHTML = A.rendreSVG(cfg, { alt: 'Aperçu de mon avatar' });

  const bloc = (g) => {
    const items = A[g.liste] || [];
    const choix = items.map((it) => {
      const on = cfg[g.cle] === it.id;
      const pastille = g.couleur && it.c
        ? '<span class="av-dot" style="background:' + it.c + '"></span>'
        : '';
      return '<button type="button" class="av-opt' + (on ? ' on' : '') + '" data-groupe="' + g.cle + '" data-val="' + it.id + '">'
        + pastille + escapeHtml(it.nom) + '</button>';
    }).join('');
    return '<div class="av-sec"><h3>' + escapeHtml(g.titre) + '</h3><div class="av-opts">' + choix + '</div></div>';
  };

  // Accessoires : les 3 états sont TOUJOURS visibles. On ne masque jamais un
  // accessoire verrouillé — le voir est ce qui donne envie de progresser.
  const { punch, badges } = avatarProgression();
  const accs = A.etatAccessoires({ punch, badges, equipes: cfg.accessoires });
  const carte = (a) => {
    const etat = !a.debloque ? 'is-lock' : (a.equipe ? 'is-on' : 'is-ok');
    const badge = !a.debloque ? escapeHtml(a.conditionTexte) : (a.equipe ? 'Équipé' : 'Débloqué');
    return '<button type="button" class="av-acc ' + etat + ' t-' + a.tier + '" data-id="' + a.id + '"'
      + (a.debloque ? '' : ' aria-disabled="true"') + '>'
      + '<span class="av-acc-nom">' + escapeHtml(a.nom) + '</span>'
      + '<span class="av-acc-etat">' + badge + '</span></button>';
  };
  const html = AVATAR_GROUPES.map(bloc).join('')
    + '<div class="av-sec"><h3>Accessoires</h3>'
    + '<p class="av-note">Ils se débloquent avec ta progression. Aucun ne s’achète.</p>'
    + '<div class="av-accs">' + accs.map(carte).join('') + '</div></div>';
  const body = $('#avBody'); if (!body) return;
  body.innerHTML = html;

  body.querySelectorAll('.av-opt').forEach((b) => b.addEventListener('click', () => {
    cfg[b.dataset.groupe] = b.dataset.val;
    renderAvatarEditor();
  }));
  body.querySelectorAll('.av-acc').forEach((b) => b.addEventListener('click', () => {
    const a = accs.find((x) => x.id === b.dataset.id);
    if (!a || !a.debloque) { showToast(a ? a.conditionTexte : ''); return; }
    const dedans = cfg.accessoires.includes(a.id);
    // Un seul accessoire par emplacement : équiper remplace ce qui l'occupait.
    let liste = cfg.accessoires.filter((id) => {
      if (id === a.id) return false;
      const autre = A.ACCESSOIRES.find((x) => x.id === id);
      return !(autre && A.EMPLACEMENT_UNIQUE.includes(a.categorie) && autre.categorie === a.categorie);
    });
    if (!dedans) liste = liste.concat(a.id);
    cfg.accessoires = liste;
    renderAvatarEditor();
  }));
}

async function saveAvatar() {
  const cfg = _avatarBrouillon; if (!cfg) return;
  const btn = $('#avSave'); if (btn) btn.disabled = true;
  try {
    const r = await fetch(apiUrl('/account/avatar-config'), {
      method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ config: cfg }),
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Enregistrement impossible.');
    // Le serveur renvoie la config VALIDÉE (accessoires non gagnés retirés) :
    // on adopte la sienne, jamais la nôtre.
    if (window.__NUTRI_USER) {
      window.__NUTRI_USER.avatarConfig = d.config;
      window.__NUTRI_USER.avatarUrl = d.avatarUrl;
      if (typeof persistNutriAccount === 'function') persistNutriAccount();
    }
    closeAvatarEditor();
    renderProfilAvatar();
    showToast('Avatar enregistré.', { icon: 'check' });
  } catch (e) {
    showToast(e.message || 'Enregistrement impossible.');
    if (btn) btn.disabled = false;
  }
}
// L'import de photo a été retiré avec le passage à l'avatar personnalisable :
// resizeImageToSquare / onAvatarFile / removeAvatar n'avaient plus d'appelant.
// Les photos déjà en base ne sont PAS supprimées : elles servent de repli
// tant qu'un client n'a pas créé son avatar (routes serveur conservées).
// Persiste l'identité client (dont avatarUrl) sur cet appareil.
function persistNutriAccount() {
  try {
    if (!window.__NUTRI_USER) return;
    localStorage.setItem('mc-nutri-account', JSON.stringify(window.__NUTRI_USER));
  } catch (_) { /* ignore */ }
}
// --- Coach : inviter un client (lien d'invitation sécurisé) ---
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
    ${conflits.length ? `<div class="scan-warning" style="display:flex;gap:8px;align-items:flex-start;background:rgba(248,113,113,0.14);border:1px solid rgba(248,113,113,0.45);color:#F87171;border-radius:12px;padding:11px 14px;font-size:13.5px;font-weight:600;margin-bottom:10px;line-height:1.4;">⚠️ Contient un de tes allergènes : ${conflits.map(escapeHtml).join(', ')}. À éviter — en cas de doute, demande à un professionnel de santé.</div>` : ''}
    ${allerg.length ? `<div class="scan-allerg"><span class="scan-allerg-label">Allergènes</span> ${allerg.map((a) => { const danger = conflits.includes(a); return `<span class="help-tag"${danger ? ' style="background:rgba(248,113,113,0.18);color:#F87171;border:1px solid rgba(248,113,113,0.5);"' : ''}>${escapeHtml(a)}</span>`; }).join('')}</div>` : ''}
    <p class="help-disclaimer">Cette indication est une aide à la décision, pas un avis médical. En cas de doute, demande à un professionnel de santé.</p>
    <div class="scan-actions">
      <button type="button" class="btn btn-outline" id="scanFav"><svg class="ic"><use href="#ic-star"/></svg> ${isFav ? 'Dans tes favoris' : 'Ajouter à mes favoris'}</button>
      <button type="button" class="btn btn-primary" id="scanAskCoach"><svg class="ic"><use href="#ic-spark"/></svg> En parler au coach</button>
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
// Le produit scanné part directement dans le SOS coach, avec son contexte. Dans
// l'app d'origine ce bouton créait une demande qu'un coach humain traitait plus
// tard ; ici la réponse arrive tout de suite, et rien n'est mis en attente.
function askCoachAboutProduct() {
  if (!lastScanned) return;
  const p = lastScanned;
  const desc = [p.name, p.brand].filter(Boolean).join(' — ');
  closeScan();
  openSos();
  sendCoach(`Je viens de scanner ce produit : ${desc}. Est-ce que ça colle avec mon objectif ?`);
}

function cohBadge(c) {
  const m = { compatible: 'Compatible', moderation: 'Modération', a_eviter: 'À éviter' };
  return m[c] ? `<span class="coh-badge coh-${c}">${m[c]}</span>` : '';
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
function dateForDay(di) { const m = mondayThisWeek(); return ymd(new Date(m.getFullYear(), m.getMonth(), m.getDate() + di)); }
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
    <h3 class="suivi-day-title">${escapeHtml(jours[di].jour || ('Jour ' + (di + 1)))}${(jourActuelDansPlan() && di === indexJourActuel()) ? '<span class="day-now">Aujourd\'hui</span>' : ''}</h3>
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

const ADH_STATUT = { ok: 'OK', a_surveiller: 'À surveiller', besoin_aide: 'Besoin d\'aide' };
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

    <div class="scan-actions">
      <button type="button" class="btn btn-outline" id="plateSave"><svg class="ic"><use href="#ic-check"/></svg> Enregistrer</button>
      <button type="button" class="btn btn-primary" id="plateAskCoach"><svg class="ic"><use href="#ic-spark"/></svg> En parler au coach</button>
    </div>
    <button type="button" class="btn btn-ghost btn-sm" id="plateAnother" style="width:100%;margin-top:8px"><svg class="ic"><use href="#ic-camera"/></svg> Analyser une autre assiette</button>`;
  plateShowStage('result');
  $$('#plateResultBody [data-pport]').forEach((b2) => b2.addEventListener('click', () => { plateAdj.portion = b2.dataset.pport; renderPlateResult(); }));
  $$('#plateResultBody [data-padd]').forEach((b2) => b2.addEventListener('click', () => { plateAdj[b2.dataset.padd] = !plateAdj[b2.dataset.padd]; renderPlateResult(); }));
  $('#plateSave').addEventListener('click', () => savePlate(false, $('#plateSave')));
  $('#plateAskCoach').addEventListener('click', () => {
    const a = plateAdjusted();
    closePlate();
    openSos();
    sendCoach(`Je viens d'analyser mon assiette : environ ${Math.round(a.kcal)} kcal, ${Math.round(a.proteines)} g de protéines. Ça te paraît cohérent avec mon objectif ?`);
  });
  $('#plateAnother').addEventListener('click', openPlate);
}
// L'analyse est gardée dans l'historique personnel. Le serveur n'attend que
// l'analyse et la photo : il n'y a plus de coach à notifier ni de file à traiter.
async function savePlate(_askCoach, btn) {
  const b = plateBase, m = plateAdjusted();
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(apiUrl('/api/plate-save'), {
      method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        analyse: {
          mealLabel: plateMealLabel(), precision: platePrecisionUsed, aliments: b.aliments,
          kcal: m.kcal, proteines: m.proteines, glucides: m.glucides, lipides: m.lipides,
          coherence: b.niveau, pointPositif: b.pointPositif, axe: b.axe, action: b.action,
          coherencePlan: b.coherencePlan,
        },
        imageDataUrl: plateThumb,
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error();
    if (btn) btn.innerHTML = 'Enregistré dans ton suivi ✓';
  } catch (e) {
    if (btn) btn.disabled = false;
    alert("L'enregistrement n'a pas fonctionné. Réessaie.");
  }
}


// ============================================================================
//  MA PROGRESSION — pesées, mensurations, photos.
//
//  C'est l'écran qui remplace le « Parcours » du Protocole 42. La différence est
//  de fond, pas d'habillage : là-bas, la progression était scandée par trois
//  jalons imposés (départ, semaine 3, semaine 6), parce que la promo durait six
//  semaines et que tout le groupe partait le même jour. Ici, personne n'impose
//  de date : on se pèse quand on veut, la courbe se construit toute seule.
//
//  On ne juge JAMAIS le sens de la variation. Perdre 2 kg est un progrès pour
//  qui veut maigrir, un échec pour qui veut prendre du muscle : c'est l'objectif
//  choisi à l'inscription qui décide du mot affiché, jamais le signe du chiffre.
// ============================================================================

const PHOTO_TYPES_LBL = { face: 'Face', profil: 'Profil', dos: 'Dos', libre: 'Libre' };

function dateCourte(iso) {
  if (!iso) return '';
  const d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''));
  return isNaN(d) ? '' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

async function fetchProgression() {
  if (!estConnecte()) return null;
  try {
    const d = await (await fetch(apiUrl('/api/progression'), { headers: nutriAuthHeaders() })).json();
    if (d && d.ok) { state.progression = d.progression; return d.progression; }
  } catch (_) { /* hors-ligne : on garde ce qu'on a déjà */ }
  return null;
}

// Le mot qui accompagne la variation de poids, choisi selon l'OBJECTIF.
function motVariation(delta, objectif) {
  if (delta === null || delta === undefined) return '';
  const abs = frKg(Math.abs(delta));
  if (Math.abs(delta) < 0.2) return 'Poids stable — c\'est aussi un résultat.';
  const baisse = delta < 0;
  if (objectif === 'muscle') {
    return baisse ? `−${abs} kg. Sur une prise de muscle, surveille tes apports.`
      : `+${abs} kg. C\'est le sens de ton objectif — continue.`;
  }
  if (objectif === 'perte') {
    return baisse ? `−${abs} kg depuis ta première pesée. Beau travail.`
      : `+${abs} kg. Une remontée arrive ; regarde la tendance, pas la journée.`;
  }
  return baisse ? `−${abs} kg depuis ta première pesée.` : `+${abs} kg depuis ta première pesée.`;
}

// Courbe de poids en SVG, sans aucune librairie. Deux points suffisent à tracer.
function courbePoids(pesees) {
  if (!pesees || pesees.length < 2) return '';
  const W = 300, H = 90, PAD = 6;
  const poids = pesees.map((p) => p.poids);
  const min = Math.min(...poids), max = Math.max(...poids);
  const span = (max - min) || 1;
  const pts = pesees.map((p, i) => {
    const x = PAD + (i / (pesees.length - 1)) * (W - 2 * PAD);
    const y = PAD + (1 - (p.poids - min) / span) * (H - 2 * PAD);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `
    <svg class="prog-courbe" viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution de ton poids">
      <polyline points="${pts.join(' ')}" fill="none" stroke="currentColor" stroke-width="2.5"
                stroke-linecap="round" stroke-linejoin="round" />
      ${pts.map((pt) => { const [x, y] = pt.split(','); return `<circle cx="${x}" cy="${y}" r="3" fill="currentColor" />`; }).join('')}
    </svg>`;
}

async function renderProgression() {
  const box = $('#view-progression');
  if (!box) return;
  if (!estConnecte()) {
    box.innerHTML = `
      <div class="prog-wrap">
        <h2 class="prog-title">Ma progression</h2>
        <p class="prog-empty">Crée ton espace pour enregistrer tes pesées, tes mensurations et tes photos.
        Sans compte, ton plan reste sur cet appareil et rien n'est suivi dans le temps.</p>
      </div>`;
    return;
  }
  const p = state.progression || await fetchProgression();
  if (!p) { box.innerHTML = '<div class="prog-wrap"><p class="prog-empty">Chargement…</p></div>'; return; }

  const objectif = (state.profil && state.profil.objectif) || '';
  const dernier = p.pesees.length ? p.pesees[p.pesees.length - 1] : null;

  const entete = dernier
    ? `<div class="prog-head">
         <div class="prog-poids"><b>${frKg(dernier.poids)}</b><span>kg</span></div>
         <p class="prog-mot">${escapeHtml(motVariation(p.variation, objectif))}</p>
         ${courbePoids(p.pesees)}
         <p class="prog-meta">${p.pesees.length} pesée${p.pesees.length > 1 ? 's' : ''} · depuis le ${dateCourte(p.pesees[0].date)}</p>
       </div>`
    : `<div class="prog-head prog-head--vide">
         <p class="prog-mot">Enregistre ta première pesée : c'est elle qui devient ton point de départ.</p>
       </div>`;

  const listePesees = p.pesees.slice().reverse().slice(0, 8).map((w) => `
      <li class="prog-li">
        <span class="prog-li-date">${dateCourte(w.date)}</span>
        <span class="prog-li-val">${frKg(w.poids)} kg${w.masseGrasse ? ` · ${frKg(w.masseGrasse)} % MG` : ''}</span>
        <button type="button" class="prog-del" data-del-pesee="${w.id}" aria-label="Supprimer cette pesée">${icSvg('x')}</button>
      </li>`).join('');

  const derniereMens = p.mensurations.length ? p.mensurations[p.mensurations.length - 1] : null;
  const mensLignes = derniereMens
    ? ['taille', 'hanches', 'poitrine', 'bras', 'cuisse']
      .filter((k) => derniereMens[k] != null)
      .map((k) => `<span class="prog-mens-i"><b>${frKg(derniereMens[k])}</b> cm<span>${k}</span></span>`).join('')
    : '';

  const photos = p.photos.slice().reverse().slice(0, 12).map((ph) => `
      <figure class="prog-photo">
        <img src="${apiUrl('/api/progression/photo/' + ph.id)}" alt="Photo du ${dateCourte(ph.date)}" loading="lazy"
             data-photo-auth="${ph.id}" />
        <figcaption>${dateCourte(ph.date)} · ${PHOTO_TYPES_LBL[ph.type] || 'Libre'}</figcaption>
        <button type="button" class="prog-del" data-del-photo="${ph.id}" aria-label="Supprimer cette photo">${icSvg('x')}</button>
      </figure>`).join('');

  box.innerHTML = `
    <div class="prog-wrap">
      <h2 class="prog-title">Ma progression</h2>
      ${entete}

      <section class="prog-sec">
        <h3>Me peser</h3>
        <div class="prog-form">
          <input id="progPoids" type="number" step="0.1" min="30" max="300" inputmode="decimal" placeholder="Poids (kg)" />
          <input id="progMg" type="number" step="0.1" min="3" max="70" inputmode="decimal" placeholder="% masse grasse (optionnel)" />
          <button type="button" id="progAddPesee" class="btn btn-primary">Enregistrer</button>
        </div>
        ${listePesees ? `<ul class="prog-list">${listePesees}</ul>` : ''}
      </section>

      <section class="prog-sec">
        <h3>Mes mensurations</h3>
        ${mensLignes ? `<div class="prog-mens">${mensLignes}</div>
          <p class="prog-meta">Dernière prise le ${dateCourte(derniereMens.date)}</p>` : ''}
        <div class="prog-form prog-form--mens">
          <input id="progTaille" type="number" step="0.5" inputmode="decimal" placeholder="Taille (cm)" />
          <input id="progHanches" type="number" step="0.5" inputmode="decimal" placeholder="Hanches" />
          <input id="progPoitrine" type="number" step="0.5" inputmode="decimal" placeholder="Poitrine" />
          <input id="progBras" type="number" step="0.5" inputmode="decimal" placeholder="Bras" />
          <input id="progCuisse" type="number" step="0.5" inputmode="decimal" placeholder="Cuisse" />
          <button type="button" id="progAddMens" class="btn btn-outline">Enregistrer mes mesures</button>
        </div>
      </section>

      <section class="prog-sec">
        <h3>Mes photos</h3>
        <p class="prog-note">Elles restent privées : personne d'autre que toi ne peut les afficher.</p>
        <div class="prog-form">
          <select id="progPhotoType">
            <option value="face">Face</option><option value="profil">Profil</option>
            <option value="dos">Dos</option><option value="libre" selected>Libre</option>
          </select>
          <input id="progPhotoFile" type="file" accept="image/*" />
        </div>
        ${photos ? `<div class="prog-photos">${photos}</div>` : ''}
      </section>
    </div>`;

  chargerPhotosProgression();
  cablerProgression();
}

// Les photos sont protégées par jeton : un <img src> n'en envoie pas. On les
// récupère en fetch authentifié puis on injecte le blob. C'est le prix à payer
// pour qu'une URL devinée ne donne rien (cf. server.js).
async function chargerPhotosProgression() {
  for (const img of $$('#view-progression img[data-photo-auth]')) {
    const id = img.dataset.photoAuth;
    try {
      const res = await fetch(apiUrl('/api/progression/photo/' + id), { headers: nutriAuthHeaders() });
      if (!res.ok) { img.remove(); continue; }
      img.src = URL.createObjectURL(await res.blob());
    } catch (_) { img.remove(); }
  }
}

function cablerProgression() {
  const val = (id) => { const e = $(id); return e && e.value !== '' ? Number(e.value) : null; };

  const bp = $('#progAddPesee');
  if (bp) bp.addEventListener('click', async () => {
    const poids = val('#progPoids');
    if (poids === null) { showToast('Renseigne ton poids.'); return; }
    bp.disabled = true;
    try {
      const d = await (await fetch(apiUrl('/api/progression/pesee'), {
        method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ poids, masseGrasse: val('#progMg') }),
      })).json();
      if (!d.ok) throw new Error(d.error || '');
      state.progression = null;
      showToast('Pesée enregistrée', { icon: 'check' });
      renderProgression();
    } catch (e) { showToast(e.message || "L'enregistrement n'a pas fonctionné."); bp.disabled = false; }
  });

  const bm = $('#progAddMens');
  if (bm) bm.addEventListener('click', async () => {
    const corps = { taille: val('#progTaille'), hanches: val('#progHanches'), poitrine: val('#progPoitrine'), bras: val('#progBras'), cuisse: val('#progCuisse') };
    if (Object.values(corps).every((v) => v === null)) { showToast('Renseigne au moins une mesure.'); return; }
    bm.disabled = true;
    try {
      const d = await (await fetch(apiUrl('/api/progression/mensuration'), {
        method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(corps),
      })).json();
      if (!d.ok) throw new Error(d.error || '');
      state.progression = null;
      showToast('Mesures enregistrées', { icon: 'check' });
      renderProgression();
    } catch (e) { showToast(e.message || "L'enregistrement n'a pas fonctionné."); bm.disabled = false; }
  });

  const pf = $('#progPhotoFile');
  if (pf) pf.addEventListener('change', async () => {
    const f = pf.files && pf.files[0];
    if (!f) return;
    try {
      // On compresse avant l'envoi : une photo brute de téléphone dépasse la
      // limite du serveur (6 Mo) et n'apporte rien de plus à l'écran.
      const dataUrl = await compressImage(f, 1200, 0.82);
      const d = await (await fetch(apiUrl('/api/progression/photo'), {
        method: 'POST', headers: nutriAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ imageDataUrl: dataUrl, type: ($('#progPhotoType') || {}).value || 'libre' }),
      })).json();
      if (!d.ok) throw new Error(d.error || '');
      state.progression = null;
      showToast('Photo ajoutée', { icon: 'check' });
      renderProgression();
    } catch (e) { showToast(e.message || "L'envoi n'a pas fonctionné."); }
  });

  $('#view-progression').addEventListener('click', async (e) => {
    const dp = e.target.closest('[data-del-pesee]');
    const dph = e.target.closest('[data-del-photo]');
    if (!dp && !dph) return;
    const route = dp ? '/api/progression/pesee/' + dp.dataset.delPesee : '/api/progression/photo/' + dph.dataset.delPhoto;
    if (!confirm(dp ? 'Supprimer cette pesée ?' : 'Supprimer cette photo ?')) return;
    try {
      await fetch(apiUrl(route), { method: 'DELETE', headers: nutriAuthHeaders() });
      state.progression = null;
      renderProgression();
    } catch (_) { showToast('Suppression impossible.'); }
  });
}

document.addEventListener('DOMContentLoaded', init);
// ===========================================================================
//  ADMINISTRATION DU BOOST NUTRITION  (compte ADMIN_EMAIL uniquement)
//
//  Deux vues, une liste par vue, des formulaires qui s'ouvrent sous la ligne
//  concernée. Rien d'autre : ce lot sert à PRÉPARER les suivis, pas à les
//  animer. Aucun écran Coach ni client ici.
//
//  Le serveur reste seul juge de ce qui est permis (certification, Boost déjà
//  actif, motif obligatoire…). L'interface ne fait que RENDRE ces règles
//  visibles avant l'échec : proposer un coach non certifié pour se le voir
//  refuser ensuite, c'est une mauvaise manière de dire non. Quand les deux
//  divergent, c'est la réponse serveur qui s'affiche, jamais l'optimisme local.
// ===========================================================================

const BADM_STATUTS = { a_demarrer: 'À démarrer', en_cours: 'En cours', termine: 'Terminé', expire: 'Expiré', interrompu: 'Interrompu' };
const BADM_CERT = { non_certifie: 'Non certifié', en_cours: 'En formation', certifie: 'Certifié', suspendu: 'Suspendu' };
const BADM_PRATIQUE = { valide: 'Validée', non_valide: 'Non validée', a_repasser: 'À repasser' };
const BADM_JOURNAL = {
  creation: 'Boost créé', attribution: 'Coach Nutrition attribué', demarrage: 'Étape 1 validée — 16 semaines lancées',
  etape_validee: 'Étape validée', prolongation: 'Prolongation', expiration: 'Arrivé à échéance',
  terminaison: 'Boost terminé', interruption: 'Boost interrompu',
};

let _badmVue = 'boosts';
let _badmDossiers = [];
let _badmCoachs = [];
let _badmClients = [];
// Un seul formulaire ouvert à la fois : { type, id, clientEmail? }. Deux
// formulaires ouverts en même temps, et on ne sait plus lequel on valide.
let _badmForm = null;
let _badmJournalId = null;
let _badmMsg = '';

async function badmApi(methode, route, corps) {
  const res = await fetch(apiUrl(route), {
    method: methode,
    headers: nutriAuthHeaders(corps ? { 'Content-Type': 'application/json' } : {}),
    body: corps ? JSON.stringify(corps) : undefined,
  });
  let d = null;
  try { d = await res.json(); } catch (_) { /* réponse non JSON */ }
  return { status: res.status, data: d || {} };
}

function badmDate(iso) {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}
function badmDateHeure(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('fr-FR') + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
// Décale une date AAAA-MM-JJ de n jours, en UTC comme le serveur.
function badmPlusJours(iso, n) {
  if (!iso) return '';
  const d = new Date(String(iso) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + Number(n || 0));
  return d.toISOString().slice(0, 10);
}
const badmNom = (prenom, email) => escapeHtml(prenom || String(email || '').split('@')[0] || '—');

function openBoostAdmin() {
  const p = $('#boostAdminPanel'); if (!p) return;
  p.classList.remove('hidden');
  _badmVue = 'boosts'; _badmForm = null; _badmJournalId = null; _badmMsg = '';
  badmRecharger();
}
function closeBoostAdmin() { const p = $('#boostAdminPanel'); if (p) p.classList.add('hidden'); }

async function badmRecharger() {
  const body = $('#boostAdminBody');
  if (body && !body.innerHTML) body.innerHTML = '<p class="panel-sub">Chargement…</p>';
  try {
    const [d, c] = await Promise.all([
      badmApi('GET', '/api/boost/admin/dossiers'),
      badmApi('GET', '/api/boost/admin/collaborateurs?tous=1'),
    ]);
    if (!d.data.ok || !c.data.ok) throw new Error('lecture');
    _badmDossiers = d.data.dossiers || [];
    _badmCoachs = c.data.collaborateurs || [];
    badmRender();
  } catch (_) {
    if (body) body.innerHTML = '<p class="help-empty">Lecture impossible. Réessaie dans un instant.</p>';
  }
}

function badmRender() {
  $$('#boostAdminPanel .badm-tab').forEach((t) => t.classList.toggle('on', t.dataset.vue === _badmVue));
  const body = $('#boostAdminBody'); if (!body) return;
  body.innerHTML = (_badmVue === 'boosts' ? badmVueBoosts() : badmVueCoachs()) +
    (_badmMsg ? '<p class="badm-warn">' + escapeHtml(_badmMsg) + '</p>' : '');
  badmWire();
}

// --- Vue « Boosts » --------------------------------------------------------

function badmVueBoosts() {
  const n = _badmDossiers.length;
  const lignes = n ? _badmDossiers.map(badmLigneBoost).join('')
    : '<p class="help-empty">Aucun Boost pour l\'instant. Commence par en créer un.</p>';
  return '<div class="badm-bar">' +
      '<button type="button" class="pc-btn primary badm-neo" id="badmNouveau">' + icSvg('plus') + 'Créer un Boost</button>' +
      '<span class="badm-count">' + n + ' Boost' + (n > 1 ? 's' : '') + '</span>' +
    '</div>' +
    (_badmForm && _badmForm.type === 'creer' ? badmFormCreer() : '') +
    '<div class="badm-list">' + lignes + '</div>';
}

function badmLigneBoost(b) {
  const estActif = b.statut === 'a_demarrer' || b.statut === 'en_cours';
  const retard = b.joursRestants !== null && b.joursRestants !== undefined && b.joursRestants < 0;
  const reste = (b.joursRestants === null || b.joursRestants === undefined) ? ''
    : retard ? ` <em class="badm-late">(dépassée de ${Math.abs(b.joursRestants)} j)</em>`
      : ` <em>(dans ${b.joursRestants} j)</em>`;

  const actions = [];
  // Actions strictement contextuelles : un bouton qu'on ne peut pas utiliser
  // est un bouton qui trompe.
  if (estActif) actions.push(badmBtn('coach', b.id, b.coachEmail ? 'Réattribuer' : 'Attribuer le coach'));
  if (b.statut === 'en_cours' || b.statut === 'expire') actions.push(badmBtn('prolonger', b.id, 'Prolonger'));
  if (b.statut !== 'termine' && b.statut !== 'interrompu') actions.push(badmBtn('interrompre', b.id, 'Interrompre', 'danger'));
  actions.push('<button type="button" class="badm-act' + (_badmJournalId === b.id ? ' on' : '') + '" data-journal="' + b.id + '">Historique</button>');

  const formulaire = (_badmForm && _badmForm.id === b.id)
    ? (_badmForm.type === 'coach' ? badmFormCoach(b)
      : _badmForm.type === 'prolonger' ? badmFormProlonger(b)
        : _badmForm.type === 'interrompre' ? badmFormInterrompre(b) : '')
    : '';

  return '<div class="badm-row">' +
    '<div class="badm-row-head">' +
      '<div class="badm-cli"><b>' + badmNom(b.clientPrenom, b.clientEmail) + '</b><small>' + escapeHtml(b.clientEmail) + '</small></div>' +
      '<span class="badm-badge badm-b-' + b.statut + '">' + (BADM_STATUTS[b.statut] || b.statut) + '</span>' +
    '</div>' +
    '<div class="badm-cells">' +
      '<span><i>Coach Nutrition</i>' + (b.coachEmail ? badmNom(b.coachPrenom, b.coachEmail) : '<em>non attribué</em>') + '</span>' +
      '<span><i>Étape</i>' + b.etapesValidees + '/' + b.etapesTotal + '</span>' +
      '<span><i>Début</i>' + badmDate(b.demarreLe) + '</span>' +
      '<span><i>Date limite</i>' + badmDate(b.echeanceLe) + reste + '</span>' +
    '</div>' +
    '<div class="badm-acts">' + actions.join('') + '</div>' +
    formulaire +
    (_badmJournalId === b.id ? '<div class="badm-journal" id="badmJournalBox"><p class="badm-hint">Chargement de l\'historique…</p></div>' : '') +
  '</div>';
}

function badmBtn(type, id, libelle, extra) {
  const ouvert = _badmForm && _badmForm.id === id && _badmForm.type === type;
  return '<button type="button" class="badm-act ' + (extra || '') + (ouvert ? ' on' : '') +
    '" data-form="' + type + '" data-id="' + id + '">' + escapeHtml(libelle) + '</button>';
}

// Coachs proposables : actifs ET certifiés. La liste est calculée ici pour que
// l'admin ne puisse pas choisir quelqu'un que le serveur refusera.
function badmCoachsDisponibles() { return _badmCoachs.filter((c) => c.peutSuivre); }

function badmOptionsCoachs(selection) {
  const dispo = badmCoachsDisponibles();
  if (!dispo.length) return '';
  return dispo.map((c) => '<option value="' + escapeHtml(c.email) + '"' + (c.email === selection ? ' selected' : '') + '>' +
    badmNom(c.prenom, c.email) + ' — ' + escapeHtml(c.email) + '</option>').join('');
}

const BADM_AUCUN_COACH = '<p class="badm-warn">Aucun Coach Nutrition actif et certifié pour l\'instant. ' +
  'Va dans l\'onglet « Coachs Nutrition » pour en déclarer un et renseigner sa certification.</p>';

// Rendu isolé de la liste de clients : la recherche la rafraîchit SEULE, sans
// re-rendre le formulaire. Re-rendre tout à chaque frappe recréait le champ de
// recherche et faisait perdre le focus au bout d'une lettre.
function badmPicksHtml() {
  const choisi = (_badmForm && _badmForm.clientEmail) || '';
  if (_badmClients === null) return '<p class="badm-hint" style="padding:10px 12px">Chargement…</p>';
  if (!_badmClients.length) return '<p class="badm-hint" style="padding:10px 12px">Aucun client trouvé.</p>';
  return _badmClients.map((c) => {
    // Un client qui a déjà un Boost actif est montré mais NON cliquable : le
    // masquer laisserait croire que le compte n'existe pas.
    const pris = !!c.boostActif;
    return '<button type="button" class="badm-pick' + (c.email === choisi ? ' on' : '') + '"' +
      (pris ? ' disabled' : '') + ' data-client="' + escapeHtml(c.email) + '">' +
      '<span><b>' + badmNom(c.prenom, c.email) + '</b><br><small>' + escapeHtml(c.email) + '</small></span>' +
      (pris ? '<small>Boost ' + (BADM_STATUTS[c.boostActif.statut] || '') + '</small>' : '') + '</button>';
  }).join('');
}

function badmFormCreer() {
  const dispo = badmCoachsDisponibles();
  const picks = badmPicksHtml();

  return '<div class="badm-form">' +
    '<label class="qopt-field"><span>Client</span>' +
      '<input id="badmCliQ" type="search" placeholder="Rechercher par prénom ou email…" autocomplete="off"></label>' +
    '<div class="badm-picks" id="badmCliList">' + picks + '</div>' +
    '<div class="badm-grid2">' +
      '<label class="qopt-field"><span>Coach Nutrition (facultatif)</span><select id="badmCreerCoach">' +
        '<option value="">— attribuer plus tard —</option>' + badmOptionsCoachs('') + '</select></label>' +
      '<label class="qopt-field"><span>Référence externe (facultatif)</span>' +
        '<input id="badmCreerRef" type="text" maxlength="200" placeholder="N° de facture, commande…"></label>' +
    '</div>' +
    (dispo.length ? '' : '<p class="badm-hint">Aucun coach certifié disponible : le Boost sera créé sans coach, à attribuer plus tard.</p>') +
    '<p class="badm-hint">Le Boost est créé au statut « À démarrer ». Les 16 semaines ne commenceront qu\'à la validation de l\'Étape 1 par le coach.</p>' +
    '<div class="badm-form-btns">' +
      '<button type="button" class="pc-btn primary" id="badmCreerOk">Créer le Boost</button>' +
      '<button type="button" class="pc-btn" data-annuler="1">Annuler</button>' +
    '</div></div>';
}

function badmFormCoach(b) {
  const dispo = badmCoachsDisponibles();
  if (!dispo.length) {
    return '<div class="badm-form">' + BADM_AUCUN_COACH +
      '<div class="badm-form-btns"><button type="button" class="pc-btn" data-annuler="1">Fermer</button></div></div>';
  }
  return '<div class="badm-form">' +
    '<label class="qopt-field"><span>Coach Nutrition</span><select id="badmCoachSel">' +
      badmOptionsCoachs(b.coachEmail || '') + '</select></label>' +
    (b.coachEmail ? '<p class="badm-hint">La réattribution est enregistrée dans l\'historique du dossier (ancien coach, nouveau coach, auteur, date).</p>' : '') +
    '<div class="badm-form-btns">' +
      '<button type="button" class="pc-btn primary" id="badmCoachOk">' + (b.coachEmail ? 'Réattribuer' : 'Attribuer') + '</button>' +
      '<button type="button" class="pc-btn" data-annuler="1">Annuler</button>' +
    '</div></div>';
}

function badmFormProlonger(b) {
  // Par défaut : 4 semaines après l'échéance actuelle. Le minimum est le
  // lendemain de l'échéance — une « prolongation » qui raccourcit n'en est pas une.
  const min = badmPlusJours(b.echeanceLe, 1);
  const defaut = badmPlusJours(b.echeanceLe, 28);
  return '<div class="badm-form">' +
    '<p class="badm-hint">Date limite actuelle : <b>' + badmDate(b.echeanceLe) + '</b>' +
      (b.statut === 'expire' ? ' — ce Boost est expiré, choisis une date à venir pour le rouvrir.' : '') + '</p>' +
    '<label class="qopt-field"><span>Nouvelle date limite</span>' +
      '<input id="badmProlDate" type="date" min="' + min + '" value="' + defaut + '"></label>' +
    '<label class="qopt-field"><span>Motif (obligatoire)</span>' +
      '<textarea id="badmProlMotif" maxlength="1000" placeholder="Pourquoi ce Boost est-il prolongé ? (10 caractères minimum)"></textarea></label>' +
    '<p class="badm-hint">Ton nom et la date sont enregistrés automatiquement. La prolongation doit rester exceptionnelle.</p>' +
    '<div class="badm-form-btns">' +
      '<button type="button" class="pc-btn primary" id="badmProlOk">Prolonger</button>' +
      '<button type="button" class="pc-btn" data-annuler="1">Annuler</button>' +
    '</div></div>';
}

function badmFormInterrompre(b) {
  return '<div class="badm-form">' +
    '<p class="badm-hint">L\'accompagnement de <b>' + badmNom(b.clientPrenom, b.clientEmail) + '</b> sera clos. ' +
      'Un nouveau Boost pourra lui être ouvert ensuite.</p>' +
    '<label class="qopt-field"><span>Motif (obligatoire)</span>' +
      '<textarea id="badmIntMotif" maxlength="1000" placeholder="Pourquoi cet accompagnement s\'arrête-t-il ?"></textarea></label>' +
    '<div class="badm-form-btns">' +
      '<button type="button" class="pc-btn primary" id="badmIntOk">Interrompre le Boost</button>' +
      '<button type="button" class="pc-btn" data-annuler="1">Annuler</button>' +
    '</div></div>';
}

// --- Vue « Coachs Nutrition » ---------------------------------------------

function badmVueCoachs() {
  const dispo = badmCoachsDisponibles().length;
  const lignes = _badmCoachs.length ? _badmCoachs.map(badmLigneCoach).join('')
    : '<p class="help-empty">Aucun collaborateur déclaré. Ajoute un compte existant pour commencer.</p>';
  return '<div class="badm-bar">' +
      '<button type="button" class="pc-btn primary badm-neo" id="badmAjoutCollab">' + icSvg('plus') + 'Ajouter un collaborateur</button>' +
      '<span class="badm-count">' + dispo + ' coach' + (dispo > 1 ? 's' : '') + ' pouvant suivre des clients</span>' +
    '</div>' +
    (_badmForm && _badmForm.type === 'collab' ? badmFormCollab() : '') +
    '<div class="badm-list">' + lignes + '</div>';
}

function badmFormCollab() {
  return '<div class="badm-form">' +
    '<label class="qopt-field"><span>Email du collaborateur</span>' +
      '<input id="badmCollabMail" type="email" autocomplete="off" placeholder="prenom@exemple.fr"></label>' +
    '<p class="badm-hint">Le compte doit déjà exister : le collaborateur s\'inscrit lui-même dans l\'app (email + code PIN), ' +
      'comme n\'importe quel utilisateur. On ne crée pas de compte depuis ici.</p>' +
    '<div class="badm-form-btns">' +
      '<button type="button" class="pc-btn primary" id="badmCollabOk">Ajouter</button>' +
      '<button type="button" class="pc-btn" data-annuler="1">Annuler</button>' +
    '</div></div>';
}

function badmLigneCoach(c) {
  const cert = c.certification || {};
  const badge = c.peutSuivre ? '<span class="badm-badge badm-b-oui">Certifié</span>'
    : '<span class="badm-badge badm-b-non">' + (BADM_CERT[cert.statut] || 'Non certifié') + '</span>';
  const off = c.actif ? '' : '<span class="badm-badge badm-b-off">Désactivé</span>';
  const formulaire = (_badmForm && _badmForm.type === 'cert' && _badmForm.id === c.email) ? badmFormCert(c) : '';
  return '<div class="badm-row">' +
    '<div class="badm-row-head">' +
      '<div class="badm-cli"><b>' + badmNom(c.prenom, c.email) + '</b><small>' + escapeHtml(c.email) + '</small></div>' +
      '<span style="display:flex;gap:6px;flex-wrap:wrap">' + badge + off + '</span>' +
    '</div>' +
    '<div class="badm-cells">' +
      '<span><i>Certifié le</i>' + badmDate(cert.dateCertification) + '</span>' +
      '<span><i>Évaluateur</i>' + (cert.evaluateur ? escapeHtml(cert.evaluateur) : '—') + '</span>' +
      '<span><i>Score QCM</i>' + (cert.scoreQcm === null || cert.scoreQcm === undefined ? '—' : cert.scoreQcm + '/100') + '</span>' +
      '<span><i>Pratique</i>' + (BADM_PRATIQUE[cert.resultatPratique] || '—') + '</span>' +
      '<span><i>Clients suivis</i>' + (c.nbClients || 0) + '</span>' +
    '</div>' +
    '<div class="badm-acts">' +
      '<button type="button" class="badm-act' + (formulaire ? ' on' : '') + '" data-cert="' + escapeHtml(c.email) + '">Certification</button>' +
      '<button type="button" class="badm-act' + (c.actif ? ' danger' : '') + '" data-actif="' + escapeHtml(c.email) + '" data-val="' + (c.actif ? '0' : '1') + '">' +
        (c.actif ? 'Désactiver' : 'Réactiver') + '</button>' +
    '</div>' + formulaire +
  '</div>';
}

function badmFormCert(c) {
  const cert = c.certification || {};
  const opt = (obj, sel) => Object.keys(obj).map((k) => '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + obj[k] + '</option>').join('');
  return '<div class="badm-form">' +
    '<div class="badm-grid2">' +
      '<label class="qopt-field"><span>Statut de certification</span><select id="badmCertStatut">' +
        opt(BADM_CERT, cert.statut || 'non_certifie') + '</select></label>' +
      '<label class="qopt-field"><span>Date de certification</span>' +
        '<input id="badmCertDate" type="date" value="' + escapeHtml(cert.dateCertification || '') + '"></label>' +
      '<label class="qopt-field"><span>Évaluateur</span>' +
        '<input id="badmCertEval" type="text" maxlength="120" value="' + escapeHtml(cert.evaluateur || '') + '" placeholder="Qui a prononcé la certification"></label>' +
      '<label class="qopt-field"><span>Score QCM final (0 à 100)</span>' +
        '<input id="badmCertScore" type="number" min="0" max="100" value="' + (cert.scoreQcm === null || cert.scoreQcm === undefined ? '' : cert.scoreQcm) + '"></label>' +
      '<label class="qopt-field"><span>Résultat de l\'évaluation pratique</span><select id="badmCertPratique">' +
        '<option value="">— non renseigné —</option>' + opt(BADM_PRATIQUE, cert.resultatPratique || '') + '</select></label>' +
    '</div>' +
    '<p class="badm-hint">Les 35 vidéos, le QCM et l\'évaluation pratique sont gérés en amont. On ne conserve ici que le verdict. ' +
      'Pour certifier, l\'évaluateur est obligatoire.</p>' +
    '<div class="badm-form-btns">' +
      '<button type="button" class="pc-btn primary" id="badmCertOk">Enregistrer</button>' +
      '<button type="button" class="pc-btn" data-annuler="1">Annuler</button>' +
    '</div></div>';
}

// --- Câblage et actions ----------------------------------------------------

function badmWire() {
  const body = $('#boostAdminBody'); if (!body) return;

  body.querySelectorAll('[data-annuler]').forEach((b) => b.addEventListener('click', () => { _badmForm = null; _badmMsg = ''; badmRender(); }));
  body.querySelectorAll('[data-form]').forEach((b) => b.addEventListener('click', () => {
    const id = Number(b.dataset.id), type = b.dataset.form;
    _badmForm = (_badmForm && _badmForm.id === id && _badmForm.type === type) ? null : { type, id };
    _badmMsg = ''; badmRender();
  }));
  body.querySelectorAll('[data-journal]').forEach((b) => b.addEventListener('click', () => {
    const id = Number(b.dataset.journal);
    _badmJournalId = _badmJournalId === id ? null : id;
    badmRender();
    if (_badmJournalId === id) badmChargerJournal(id);
  }));

  const nouveau = $('#badmNouveau');
  if (nouveau) nouveau.addEventListener('click', () => {
    if (_badmForm && _badmForm.type === 'creer') { _badmForm = null; badmRender(); return; }
    _badmForm = { type: 'creer', id: null, clientEmail: '' };
    _badmClients = null; _badmMsg = ''; badmRender(); badmChercherClients('');
  });

  const q = $('#badmCliQ');
  if (q) q.addEventListener('input', () => {
    clearTimeout(badmWire._t);
    badmWire._t = setTimeout(() => badmChercherClients(q.value), 220);
  });
  badmWirePicks();

  const creerOk = $('#badmCreerOk'); if (creerOk) creerOk.addEventListener('click', badmCreerBoost);
  const coachOk = $('#badmCoachOk'); if (coachOk) coachOk.addEventListener('click', badmAttribuer);
  const prolOk = $('#badmProlOk'); if (prolOk) prolOk.addEventListener('click', badmProlonger);
  const intOk = $('#badmIntOk'); if (intOk) intOk.addEventListener('click', badmInterrompre);

  const ajout = $('#badmAjoutCollab');
  if (ajout) ajout.addEventListener('click', () => {
    _badmForm = (_badmForm && _badmForm.type === 'collab') ? null : { type: 'collab', id: null };
    _badmMsg = ''; badmRender();
  });
  const collabOk = $('#badmCollabOk'); if (collabOk) collabOk.addEventListener('click', badmAjouterCollaborateur);
  body.querySelectorAll('[data-cert]').forEach((b) => b.addEventListener('click', () => {
    const email = b.dataset.cert;
    _badmForm = (_badmForm && _badmForm.type === 'cert' && _badmForm.id === email) ? null : { type: 'cert', id: email };
    _badmMsg = ''; badmRender();
  }));
  const certOk = $('#badmCertOk'); if (certOk) certOk.addEventListener('click', badmEnregistrerCert);
  body.querySelectorAll('[data-actif]').forEach((b) => b.addEventListener('click', () => badmBasculerActif(b.dataset.actif, b.dataset.val === '1')));
}

// Toute action passe par ici : on affiche le message du SERVEUR tel quel. Les
// refus métier (coach non certifié, Boost déjà actif, motif trop court) sont
// des informations utiles, pas des erreurs à masquer derrière un « Oups ».
async function badmAgir(methode, route, corps, succes) {
  _badmMsg = '';
  const r = await badmApi(methode, route, corps);
  if (r.data && r.data.ok) {
    _badmForm = null;
    showToast(succes, { icon: 'check' });
    await badmRecharger();
    return true;
  }
  _badmMsg = (r.data && r.data.error) || 'Action impossible.';
  badmRender();
  return false;
}

async function badmChercherClients(q) {
  const r = await badmApi('GET', '/api/boost/admin/clients?q=' + encodeURIComponent(q || ''));
  _badmClients = (r.data && r.data.clients) || [];
  if (!_badmForm || _badmForm.type !== 'creer') return;
  const liste = $('#badmCliList');
  // Si le formulaire n'est pas encore à l'écran (première ouverture), on rend
  // tout ; sinon on remplace la seule liste, pour ne pas voler le focus.
  if (!liste) { badmRender(); return; }
  liste.innerHTML = badmPicksHtml();
  badmWirePicks();
}

// Sélection d'un client : on marque le choix à la main plutôt que de re-rendre,
// pour la même raison que ci-dessus.
function badmWirePicks() {
  const liste = $('#badmCliList'); if (!liste) return;
  liste.querySelectorAll('[data-client]').forEach((b) => b.addEventListener('click', () => {
    _badmForm.clientEmail = b.dataset.client;
    liste.querySelectorAll('[data-client]').forEach((x) => x.classList.toggle('on', x === b));
  }));
}

async function badmCreerBoost() {
  const client = (_badmForm && _badmForm.clientEmail) || '';
  if (!client) { _badmMsg = 'Choisis d\'abord un client dans la liste.'; badmRender(); return; }
  await badmAgir('POST', '/api/boost/admin/dossiers', {
    clientEmail: client,
    coachEmail: (($('#badmCreerCoach') || {}).value) || undefined,
    referenceExterne: (($('#badmCreerRef') || {}).value || '').trim() || undefined,
  }, 'Boost créé ✓');
}

async function badmAttribuer() {
  const id = _badmForm.id;
  const coach = ($('#badmCoachSel') || {}).value || '';
  if (!coach) { _badmMsg = 'Choisis un Coach Nutrition.'; badmRender(); return; }
  await badmAgir('POST', '/api/boost/admin/dossiers/' + id + '/coach', { coachEmail: coach }, 'Client attribué ✓');
}

async function badmProlonger() {
  const id = _badmForm.id;
  const date = ($('#badmProlDate') || {}).value || '';
  const motif = (($('#badmProlMotif') || {}).value || '').trim();
  if (!date) { _badmMsg = 'Choisis une nouvelle date limite.'; badmRender(); return; }
  if (motif.length < 10) { _badmMsg = 'Le motif est obligatoire (10 caractères minimum).'; badmRender(); return; }
  if (await badmAgir('POST', '/api/boost/admin/dossiers/' + id + '/prolongation', { nouvelleEcheance: date, motif }, 'Boost prolongé ✓')) {
    // Le serveur accepte une date déjà passée (la trace vaut d'être gardée),
    // mais le Boost retombe expiré : on le dit franchement plutôt que de
    // laisser un « ✓ » faire croire que l'accompagnement a repris.
    const apres = _badmDossiers.find((b) => b.id === id);
    if (apres && apres.statut === 'expire') {
      _badmMsg = 'Prolongation enregistrée, mais la nouvelle date limite est déjà passée : le Boost reste expiré.';
      badmRender();
    }
  }
}

async function badmInterrompre() {
  const id = _badmForm.id;
  const motif = (($('#badmIntMotif') || {}).value || '').trim();
  if (!motif) { _badmMsg = 'Le motif est obligatoire pour interrompre un Boost.'; badmRender(); return; }
  await badmAgir('POST', '/api/boost/admin/dossiers/' + id + '/interruption', { motif }, 'Boost interrompu');
}

async function badmAjouterCollaborateur() {
  const email = (($('#badmCollabMail') || {}).value || '').trim().toLowerCase();
  if (!email) { _badmMsg = 'Saisis l\'email du collaborateur.'; badmRender(); return; }
  if (await badmAgir('POST', '/api/boost/admin/collaborateurs', { email, role: 'collaborateur' }, 'Collaborateur ajouté ✓')) {
    _badmVue = 'coachs'; _badmForm = { type: 'cert', id: email }; badmRender();
  }
}

async function badmEnregistrerCert() {
  const email = _badmForm.id;
  const score = ($('#badmCertScore') || {}).value;
  await badmAgir('PUT', '/api/boost/admin/certification/' + encodeURIComponent(email), {
    statut: ($('#badmCertStatut') || {}).value || 'non_certifie',
    dateCertification: ($('#badmCertDate') || {}).value || null,
    evaluateur: ($('#badmCertEval') || {}).value || '',
    scoreQcm: score === '' || score === undefined ? null : Number(score),
    resultatPratique: ($('#badmCertPratique') || {}).value || null,
  }, 'Certification enregistrée ✓');
}

async function badmBasculerActif(email, activer) {
  await badmAgir('POST', '/api/boost/admin/collaborateurs',
    { email, role: activer ? 'collaborateur' : 'client' },
    activer ? 'Collaborateur réactivé ✓' : 'Collaborateur désactivé');
}

async function badmChargerJournal(id) {
  const box = $('#badmJournalBox'); if (!box) return;
  const r = await badmApi('GET', '/api/boost/admin/dossiers/' + id + '/journal');
  const lignes = (r.data && r.data.journal) || [];
  if (!lignes.length) { box.innerHTML = '<p class="badm-hint">Aucun événement.</p>'; return; }
  box.innerHTML = '<ol>' + lignes.map((l) => {
    const d = l.detail || {};
    let quoi = BADM_JOURNAL[l.action] || l.action;
    if (l.action === 'etape_validee' && d.numero) quoi = 'Étape ' + d.numero + '/12 validée';
    if (l.action === 'prolongation' && d.jours) quoi = 'Prolongé de ' + d.jours + ' jours (jusqu\'au ' + badmDate(d.echeanceApres) + ')';
    if (l.action === 'attribution') quoi = d.avant ? 'Réattribué : ' + escapeHtml(d.avant) + ' → ' + escapeHtml(d.apres || '') : 'Coach attribué';
    const par = l.auteur ? ' par ' + escapeHtml(l.auteur) : ' (constaté par le système)';
    const motif = d.motif ? '<br><small>« ' + escapeHtml(d.motif) + ' »</small>' : '';
    return '<li>' + quoi + '<br><small>' + badmDateHeure(l.creeLe) + par + '</small>' + motif + '</li>';
  }).join('') + '</ol>';
}
