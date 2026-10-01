'use strict';
/* ============================================================================
   My Coach Nutrition v2 — front (écrans Stitch).
   Écrans : code studio, accueil, connexion (lien magique, désactivée), questionnaire en
   4 étapes, génération, plan de la semaine, liste de courses, profil.
   Le moteur (plan + courses) est celui de nutrition-solo, inchangé.
   ========================================================================== */

const APP_NOM = 'My Coach Nutrition';
// Comptes clients (connexion par lien e-mail) : désactivés pour la phase de test
// (01/10/2026). Le plan reste enregistré sur le téléphone. Passer à true (et
// COMPTES=on côté serveur) pour réactiver connexion, sauvegarde et synchronisation.
const COMPTES = false;
const LS_STATE = 'nv2.state';
const LS_TOKEN = 'nv2.token';
// Studio validé sur cet appareil : { id, nom, code, valideLe }. Clé séparée de
// l'état (nv2.state) : le code d'accès ne touche jamais au plan enregistré.
const LS_STUDIO = 'nv2.studio';
const app = document.getElementById('app');
const nav = document.getElementById('nav');

// ---------------------------------------------------------------------------
//  Données de référence (valeurs attendues par le moteur)
// ---------------------------------------------------------------------------
const OBJECTIFS = [
  { v: 'perte', ic: 'trending_down', t: 'Perdre du poids', d: 'Un déficit doux pour affiner ta silhouette, sans frustration.' },
  { v: 'maintien', ic: 'balance', t: 'Maintenir mon poids', d: 'Trouver un équilibre sain et stabiliser ton énergie au quotidien.' },
  { v: 'muscle', ic: 'fitness_center', t: 'Prendre du muscle', d: 'Un léger surplus et plus de protéines pour développer ta masse musculaire.' },
  { v: 'energie', ic: 'bolt', t: 'Avoir plus d\'énergie', d: 'Une répartition pensée pour ta vitalité au quotidien.' },
];
const ACTIVITES = [
  { v: 'sedentaire', ic: 'chair', t: 'Je démarre', d: 'Pas d\'entraînement My Coach pour l\'instant.' },
  { v: 'leger', ic: 'directions_walk', t: 'Je bouge', d: '1 séance My Coach par semaine.' },
  { v: 'modere', ic: 'directions_run', t: 'Je suis régulier·e', d: '2 séances My Coach par semaine.' },
  { v: 'actif', ic: 'fitness_center', t: 'Je suis actif·ve', d: '2 à 3 séances My Coach par semaine et un métier physique.' },
  { v: 'tres_actif', ic: 'bolt', t: 'Je suis très actif·ve', d: '3 séances My Coach, un métier actif et de la marche.' },
];
const CUISINES = [
  { v: 'francaise', e: '🥖', t: 'Française' },
  { v: 'italienne', e: '🍝', t: 'Italienne' },
  { v: 'mediterraneenne', e: '🫒', t: 'Méditerranéenne' },
  { v: 'asiatique', e: '🍜', t: 'Asiatique' },
  { v: 'monde', e: '🌮', t: 'Cuisine du monde' },
];
const MATIN = [
  { v: 'sucre', t: 'Sucré' }, { v: 'sale', t: 'Salé' }, { v: 'les-deux', t: 'Peu importe' }, { v: 'aucun', t: 'Pas de petit-déj' },
];
const COLLATIONS = [
  { v: 'matin', t: 'Le matin' }, { v: 'apres-midi', t: 'L\'après-midi' }, { v: 'apres-sport', t: 'Après le sport' }, { v: 'soir', t: 'Le soir' },
];
const ALLERGIES = [
  { v: 'gluten', t: 'Gluten' }, { v: 'lactose', t: 'Lactose' }, { v: 'oeuf', t: 'Œufs' }, { v: 'arachide', t: 'Arachide' },
  { v: 'fruits-a-coque', t: 'Fruits à coque' }, { v: 'poisson', t: 'Poisson' }, { v: 'crustaces', t: 'Crustacés' },
  { v: 'mollusques', t: 'Mollusques' }, { v: 'soja', t: 'Soja' }, { v: 'sesame', t: 'Sésame' },
];
const REGIMES = [
  { v: 'omnivore', ic: 'restaurant', t: 'Omnivore', d: 'Équilibré et varié' },
  { v: 'vegetarien', ic: 'eco', t: 'Végétarien', d: 'Sans viande ni poisson' },
  { v: 'vegan', ic: 'potted_plant', t: 'Vegan', d: '100 % végétal' },
  { v: 'sans-porc', ic: 'no_meals', t: 'Sans porc', d: 'Toutes les autres viandes' },
];
const TEMPS = [
  { v: 20, ic: 'bolt', t: 'Express', d: '20 min max' },
  { v: 45, ic: 'skillet', t: 'Normal', d: '45 min max' },
  { v: 999, ic: 'soup_kitchen', t: 'Peu importe', d: 'J\'aime cuisiner' },
];
const CRENEAU = {
  'petit-dejeuner': { ic: 'free_breakfast', e: '🥣' },
  dejeuner: { ic: 'lunch_dining', e: '🥗' },
  collation: { ic: 'nutrition', e: '🍎' },
  diner: { ic: 'dinner_dining', e: '🍲' },
};
const RAYON_IC = {
  'Fruits & légumes': 'nutrition', Boucherie: 'kebab_dining', 'Charcuterie / Traiteur': 'lunch_dining', Poissonnerie: 'set_meal',
  Crèmerie: 'egg', Boulangerie: 'bakery_dining', Épicerie: 'grocery', Surgelés: 'ac_unit', 'Rayon frais': 'kitchen', 'À vérifier': 'help',
};
const JOURS_COURTS = { Lundi: 'Lun', Mardi: 'Mar', Mercredi: 'Mer', Jeudi: 'Jeu', Vendredi: 'Ven', Samedi: 'Sam', Dimanche: 'Dim' };

// ---------------------------------------------------------------------------
//  État (localStorage = source immédiate ; le serveur garde une copie)
// ---------------------------------------------------------------------------
function draftVide() {
  return {
    prenom: '', objectif: '', sexe: '', age: '', taille: '', poids: '', activite: '',
    cuisines: [], aimes: [], deteste: [], matin: 'les-deux', collations: ['apres-midi'],
    allergies: [], regime: 'omnivore', budget: 'normal', temps: 45, jours: 7,
  };
}
function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
function lsSet(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (_) { /* stockage indisponible */ } }

let S = (() => { try { return JSON.parse(lsGet(LS_STATE)) || {}; } catch (_) { return {}; } })();
S.draft = Object.assign(draftVide(), S.draft || {});
S.portions = S.portions || 1;
S.coches = S.coches || {};
S.jour = S.jour || 0;
let token = COMPTES ? lsGet(LS_TOKEN) : null;
let studio = (() => { try { const v = JSON.parse(lsGet(LS_STUDIO)); return v && v.code && v.nom ? v : null; } catch (_) { return null; } })();
function memoriserStudio(st, code) { studio = { id: st.id, nom: st.nom, code, valideLe: new Date().toISOString() }; lsSet(LS_STUDIO, JSON.stringify(studio)); }
function oublierStudio() { studio = null; lsSet(LS_STUDIO, null); }
let photos = {};
let authCtx = { email: '', lienDev: '', minutes: 15 };

function persist() { const { ...copie } = S; lsSet(LS_STATE, JSON.stringify(copie)); }

// ---------------------------------------------------------------------------
//  Utilitaires
// ---------------------------------------------------------------------------
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('fr-FR');
const ms = (name, cls) => `<span class="ms${cls ? ' ' + cls : ''}" aria-hidden="true">${name}</span>`;
const logo = (cls) => `<img class="${cls || 'logo'}" src="logo-mycoach-noir.png" alt="My Coach" />`;

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (studio && studio.code) headers['X-Studio-Code'] = studio.code;
  const res = await fetch(path.replace(/^\//, ''), { method: opts.method || (opts.body ? 'POST' : 'GET'), headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  let data = {};
  try { data = await res.json(); } catch (_) { /* réponse vide */ }
  if (!res.ok || data.ok === false) {
    if (res.status === 401 && data.noAccount) { token = null; lsSet(LS_TOKEN, null); S.email = ''; persist(); }
    // Code studio refusé par le serveur (changé ou retiré) : on le redemande, le plan reste.
    if (res.status === 401 && data.studioInvalide && !opts.sansRedirection) { oublierStudio(); location.replace('#/code'); }
    const err = new Error(data.error || 'Une erreur est survenue.');
    err.status = res.status; throw err;
  }
  return data;
}

let toastTimer;
function toast(msg) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 2600);
}

function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

// Le plan envoyé au compte embarque l'état de la liste de courses (cases, personnes).
function planPourServeur() { return S.plan ? Object.assign({}, S.plan, { _courses: { coches: S.coches || {}, portions: S.portions || 1 } }) : null; }
let syncCoursesT;
function syncCourses() { clearTimeout(syncCoursesT); syncCoursesT = setTimeout(() => syncServeur({ plan: planPourServeur() }), 900); }

// Sauvegarde serveur (silencieuse) quand on est connecté.
async function syncServeur(champs) {
  if (!COMPTES || !token) return;
  try { await api('/account/save', { body: champs }); } catch (_) { /* hors ligne : localStorage fait foi */ }
}

// ---------------------------------------------------------------------------
//  Routeur
// ---------------------------------------------------------------------------
const ROUTES = {
  '': ecranAccueil, code: ecranCode, ...(COMPTES ? { connexion: ecranConnexion, verification: ecranVerification } : {}),
  questionnaire: ecranQuestionnaire, generation: ecranGeneration, plan: ecranPlan, courses: ecranCourses, profil: ecranProfil,
};
function render() {
  const [, name = '', arg] = location.hash.split('/');
  let route = name;
  // Porte d'entrée : sans studio validé sur l'appareil, seul l'écran du code s'affiche.
  if (!studio && route !== 'code') return location.replace('#/code');
  // Garde-fous : pas de plan -> questionnaire ; plan existant -> pas d'accueil.
  if (['plan', 'courses'].includes(route) && !S.plan) return location.replace('#/questionnaire/1');
  if (route === '' && S.plan) return location.replace('#/plan');
  if (route && !ROUTES[route]) return location.replace('#/');
  const fn = ROUTES[route] || ecranAccueil;
  const avecNav = ['plan', 'courses', 'profil'].includes(route);
  nav.hidden = !avecNav;
  nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.go === '#/' + route));
  document.querySelector('.sheet-back')?.remove(); document.body.style.overflow = '';
  app.innerHTML = '';
  fn(arg);
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', render);
nav.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) go(b.dataset.go); });

// ---------------------------------------------------------------------------
//  Accueil
// ---------------------------------------------------------------------------
function ecranAccueil() {
  app.innerHTML = `
  <section class="screen landing">
    ${logo('logo-top')}
    <div class="dk dk-hero">
    <span class="pill"><span class="dot"></span>${studio ? 'MY COACH ' + esc(studio.nom.toUpperCase()) : 'TON COACH NUTRITION'}</span>
    <h1 class="display">Mange mieux,<br/>sans y penser.</h1>
    <p class="lead">Un plan de la semaine adapté à tes goûts, avec la liste de courses.</p>
    <div class="hero-img" aria-hidden="true"><span class="plate">🥗</span>
      <img src="api/recipe-photo/plat-bowl-lentilles-oeuf-feta" alt="" onerror="this.remove()" />
      <span class="float">${ms('verified', 'fill')}100 % personnalisé</span></div>
    <button class="btn btn-primary btn-block" id="start">Créer mon plan ${ms('arrow_forward')}</button>
    <p class="small muted center hero-note" style="margin:10px 0 22px">2 minutes · réservé aux adhérents My Coach</p>
    </div>
    <div class="dk dk-features">
    <div class="card feature"><div class="ic">${ms('bolt')}</div><div><div class="head"><b class="h3">Plan en 2 minutes</b><span class="badge">Express</span></div>
      <p>Quelques questions simples pour générer ta semaine.</p></div></div>
    <div class="card feature"><div class="ic">${ms('add_shopping_cart')}</div><div><div class="head"><b class="h3">Courses automatiques</b><span class="badge ok">${ms('check')}Prêt</span></div>
      <p>Les quantités calculées pour ta semaine, rayon par rayon.</p></div></div>
    <div class="card feature"><div class="ic">${ms('restaurant')}</div><div><div class="head"><b class="h3">Selon tes goûts</b><span class="badge">Sur-mesure</span></div>
      <p>Tes cuisines préférées, sans tes allergies ni ce que tu n'aimes pas.</p></div></div>
    </div>
    ${COMPTES ? `<p style="margin-top:18px">Déjà un compte ? <a class="link" href="#/connexion">Se connecter</a></p>` : ''}
    <p class="legal">Estimations indicatives, ne remplace pas un avis médical.</p>
  </section>`;
  document.getElementById('start').onclick = () => go('#/questionnaire/1');
}

// ---------------------------------------------------------------------------
//  Code d'accès du studio
// ---------------------------------------------------------------------------
function ecranCode() {
  const changement = !!studio;
  app.innerHTML = `
  <section class="screen studio-gate">
    ${logo('logo-top')}
    <h1 class="h1">Entre le code de ton studio</h1>
    <form id="f" novalidate>
      <div class="input-wrap">${ms('storefront')}<input id="code" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="go" maxlength="60" placeholder="Code studio" aria-label="Code de ton studio" /></div>
      <p class="form-error" id="err" role="alert" hidden></p>
      <button class="btn btn-primary btn-block" id="ok" type="submit">Valider ${ms('arrow_forward')}</button>
    </form>
    ${changement ? `<button class="btn btn-ghost keep" id="keep">Rester sur My Coach ${esc(studio.nom)}</button>` : ''}
  </section>`;
  const champ = document.getElementById('code');
  const err = document.getElementById('err');
  const btn = document.getElementById('ok');
  if (!matchMedia('(pointer: coarse)').matches) champ.focus();
  champ.addEventListener('input', () => { err.hidden = true; });
  const keep = document.getElementById('keep');
  if (keep) keep.onclick = () => go(S.plan ? '#/profil' : '#/');
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    const code = champ.value.trim();
    if (!code) { err.textContent = 'Saisis le code donné par ton studio.'; err.hidden = false; champ.focus(); return; }
    btn.disabled = true; err.hidden = true;
    try {
      const r = await api('/api/studio/verify', { body: { code }, sansRedirection: true });
      memoriserStudio(r.studio, r.code);
      toast('Bienvenue chez My Coach ' + r.studio.nom);
      location.replace(S.plan ? '#/plan' : '#/');
    } catch (ex) {
      err.textContent = ex.status ? ex.message : 'Pas de connexion internet. Réessaie dès que tu as du réseau.';
      err.hidden = false; btn.disabled = false; champ.select();
    }
  };
}

// ---------------------------------------------------------------------------
//  Connexion par lien magique
// ---------------------------------------------------------------------------
function ecranConnexion() {
  const sauvegarde = !!S.plan && !token;
  app.innerHTML = `
  <section class="screen auth">
    <div class="topbar" style="margin-bottom:0"><button class="icon-btn" id="back" aria-label="Retour">${ms('arrow_back')}</button><span class="spacer"></span></div>
    <span class="pill"><span class="dot"></span>Nutrition &amp; Santé</span>
    <div class="logo-box">${logo('')}</div>
    <h1 class="h1">${sauvegarde ? 'Garde ton plan avec toi' : 'Ton plan repas t\'attend'}</h1>
    <p class="lead">${sauvegarde ? 'Entre ton e-mail pour retrouver ton plan sur tous tes appareils.' : 'Connecte-toi sans mot de passe pour retrouver ton plan et ta liste de courses.'}</p>
    <form id="f" novalidate>
      <label class="field-label" for="email">Adresse e-mail <small>Lien instantané</small></label>
      <div class="input-wrap">${ms('mail')}<input id="email" type="email" inputmode="email" autocomplete="email" placeholder="exemple@email.com" value="${esc(authCtx.email || S.email || '')}" required /></div>
      <p class="form-error" id="err" hidden></p>
      <button class="btn btn-primary btn-block" style="margin-top:18px" id="send">Recevoir mon lien de connexion ${ms('arrow_forward')}</button>
    </form>
    <p class="secure">${ms('lock')}<span>Connexion sécurisée par lien unique • Aucun mot de passe à mémoriser</span></p>
  </section>`;
  document.getElementById('back').onclick = () => history.length > 1 ? history.back() : go('#/');
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const err = document.getElementById('err');
    const btn = document.getElementById('send');
    err.hidden = true;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { err.textContent = 'Vérifie ton adresse e-mail.'; err.hidden = false; return; }
    btn.disabled = true;
    try {
      const r = await demanderLien(email);
      authCtx = { email: r.email, lienDev: r.lienDev || '', minutes: r.minutes || 15 };
      go('#/verification');
    } catch (ex) { err.textContent = ex.message; err.hidden = false; btn.disabled = false; }
  };
}

function demanderLien(email) {
  return api('/account/request-link', { body: { email, page: location.origin + location.pathname } });
}

function ecranVerification() {
  if (!authCtx.email) return go('#/connexion');
  app.innerHTML = `
  <section class="screen auth">
    <div class="topbar" style="margin-bottom:0"><button class="icon-btn" id="back" aria-label="Retour">${ms('arrow_back')}</button><span class="spacer"></span></div>
    <span class="pill"><span class="dot"></span>Lien magique envoyé</span>
    <div class="sent-ic">${ms('mark_email_read')}<span class="check">${ms('check')}</span></div>
    <h1 class="h1">Vérifie ta boîte mail</h1>
    <p class="lead">Clique sur le lien que nous venons de t'envoyer pour accéder à ton plan repas.</p>
    <div class="card recipient"><div class="ic">${ms('mail')}</div><div class="who"><span class="muted small">Destinataire</span><b>${esc(authCtx.email)}</b></div>
      <button class="icon-btn" id="edit" aria-label="Modifier l'adresse">${ms('edit')}</button></div>
    <div class="chips-row"><span class="badge">${ms('timer')}Lien actif pendant ${authCtx.minutes} min</span><span class="badge ok">${ms('key_off')}Sans mot de passe</span></div>
    <div class="tip" style="margin-top:18px;text-align:left"><div class="ic">${ms('lightbulb')}</div><div>Pense à vérifier ton dossier <b>Courrier indésirable</b> ou <b>Spam</b> si l'e-mail tarde à arriver.</div></div>
    ${authCtx.lienDev ? `<div class="dev-box"><b>Mode test</b> — aucun serveur d'e-mail n'est configuré, le lien s'affiche ici :<br/>
      <button class="btn btn-soft btn-block" style="margin-top:10px;min-height:48px;font-size:15px" id="devlink">Ouvrir le lien de connexion</button></div>` : ''}
    <p style="margin-top:22px" class="muted">Tu n'as rien reçu ?</p>
    <button class="btn btn-soft btn-block" id="resend">${ms('refresh')} Renvoyer un lien</button>
    <button class="btn btn-ghost" style="margin-top:8px" id="change">Modifier l'adresse e-mail</button>
  </section>`;
  const modifier = () => go('#/connexion');
  document.getElementById('back').onclick = modifier;
  document.getElementById('edit').onclick = modifier;
  document.getElementById('change').onclick = modifier;
  const dev = document.getElementById('devlink');
  if (dev) dev.onclick = () => { location.href = authCtx.lienDev; };
  document.getElementById('resend').onclick = async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try { const r = await demanderLien(authCtx.email); authCtx.lienDev = r.lienDev || ''; toast('Nouveau lien envoyé ✓'); if (r.lienDev) render(); } catch (ex) { toast(ex.message); }
    setTimeout(() => { b.disabled = false; }, 4000);
  };
}

// Arrivée depuis le lien magique : ?lien=…
async function traiterLienMagique() {
  const params = new URLSearchParams(location.search);
  const lien = params.get('lien');
  if (!lien) return;
  history.replaceState(null, '', location.pathname + (location.hash || ''));
  try {
    const r = await api('/account/verify', { body: { token: lien } });
    token = r.token; lsSet(LS_TOKEN, token);
    adopterCompte(r.compte, true);
    toast('Tu es connecté ✓');
    location.hash = S.plan ? '#/plan' : '#/questionnaire/1';
  } catch (ex) {
    authCtx.email = authCtx.email || S.email || '';
    toast(ex.message);
    location.hash = '#/connexion';
  }
}

// Fusion compte serveur <-> appareil. Le plan du compte gagne s'il existe ;
// sinon le plan fait sur cet appareil est envoyé au compte.
function adopterCompte(compte, pousserLocal) {
  if (!compte) return;
  S.email = compte.email;
  if (compte.prenom) S.prenom = compte.prenom;
  if (compte.plan && compte.profil) {
    const { _courses, ...planServeur } = compte.plan;
    const change = !S.plan || JSON.stringify(S.plan) !== JSON.stringify(planServeur);
    S.profil = compte.profil; S.preferences = compte.preferences || {}; S.plan = planServeur;
    if (change) { S.coches = {}; S.jour = 0; S.refus = {}; }
    if (_courses) { S.coches = _courses.coches || {}; S.portions = _courses.portions || 1; }
    if (S.profil) S.draft = Object.assign(draftDepuis(S.profil, S.preferences), { prenom: S.prenom || '' });
  } else if (pousserLocal && S.plan) {
    syncServeur({ profil: S.profil, preferences: S.preferences, plan: planPourServeur(), prenom: S.prenom || undefined });
  }
  persist();
}

// ---------------------------------------------------------------------------
//  Questionnaire (4 étapes)
// ---------------------------------------------------------------------------
const ETAPES = ['Objectif', 'Profil', 'Goûts', 'Contraintes'];

function ecranQuestionnaire(arg) {
  const n = Math.min(4, Math.max(1, Number(arg) || 1));
  const d = S.draft;
  const top = `
    <div class="q-top"><div class="row">
      <button class="icon-btn" id="qback" aria-label="Retour">${ms('arrow_back')}</button>${logo()}<span class="spacer"></span>
      <span class="step-name">Étape ${n} sur 4 · ${ETAPES[n - 1]}</span></div>
      <div class="segments">${[1, 2, 3, 4].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</div></div>`;
  let corps = '';
  if (n === 1) {
    corps = `
      <div class="q-head"><h1 class="h1">Quel est ton objectif principal ?</h1>
        <p class="lead">On adapte les calories et les macronutriments de ton plan à ta réponse.</p></div>
      <div class="dk dk-opts">${OBJECTIFS.map((o) => optionHTML('objectif', o, d.objectif === o.v)).join('')}</div>`;
  } else if (n === 2) {
    corps = `
      <div class="q-head"><h1 class="h1">Parlons un peu de toi</h1>
        <p class="lead">Ces repères servent à estimer tes besoins caloriques quotidiens.</p></div>
      <div class="section-title">Ton prénom <small>Facultatif</small></div>
      <div class="input-wrap">${ms('person')}<input id="prenom" autocomplete="given-name" autocapitalize="words" maxlength="40" placeholder="Ex. Julie" value="${esc(d.prenom || '')}" /></div>
      <div class="section-title">Sexe</div>
      <div class="seg-2">
        <button class="tile${d.sexe === 'homme' ? ' on' : ''}" data-set="sexe" data-v="homme">${ms('male')}Homme</button>
        <button class="tile${d.sexe === 'femme' ? ' on' : ''}" data-set="sexe" data-v="femme">${ms('female')}Femme</button>
      </div>
      <button class="link-small${d.sexe === 'autre' ? ' on' : ''}" data-set="sexe" data-v="autre">${d.sexe === 'autre' ? '✓ ' : ''}Je préfère ne pas le préciser</button>
      <div class="section-title">Mesures</div>
      <div class="measures">
        ${mesureHTML('age', 'Âge', 'ans', d.age, 14, 100, 1)}
        ${mesureHTML('taille', 'Taille', 'cm', d.taille, 120, 230, 1)}
        ${mesureHTML('poids', 'Poids', 'kg', d.poids, 35, 250, 0.1)}
      </div>
      <div class="section-title">Niveau d'activité <small>Une seule option</small></div>
      <div class="dk dk-opts">${ACTIVITES.map((o) => optionHTML('activite', o, d.activite === o.v, true)).join('')}</div>`;
  } else if (n === 3) {
    corps = `
      <div class="q-head"><h1 class="h1">Quels sont tes goûts ?</h1>
        <p class="lead">Pour des repas que tu auras vraiment plaisir à manger. Tout est facultatif.</p></div>
      <div class="section-title">Cuisines préférées <small>Plusieurs choix</small></div>
      <div class="cuisine-grid">${CUISINES.map((c) => `<button class="cuisine${d.cuisines.includes(c.v) ? ' on' : ''}" data-toggle="cuisines" data-v="${c.v}"><span class="emo">${c.e}</span>${c.t}${ms('check_circle', 'fill chk')}</button>`).join('')}</div>
      <div class="section-title">Le matin, tu manges plutôt…</div>
      <div class="chip-grid">${MATIN.map((m) => `<button class="chip${d.matin === m.v ? ' on' : ''}" data-set="matin" data-v="${m.v}">${m.t}</button>`).join('')}</div>
      <div class="section-title">Une collation dans la journée ? <small>Plusieurs choix</small></div>
      <div class="chip-grid">${COLLATIONS.map((m) => `<button class="chip${d.collations.includes(m.v) ? ' on' : ''}" data-toggle="collations" data-v="${m.v}">${m.t}</button>`).join('')}
        <button class="chip${!d.collations.length ? ' on' : ''}" data-clear="collations">Aucune</button></div>
      ${tagsHTML('aimes', 'Aliments que tu adores', 'Ils reviendront plus souvent dans tes menus.', 'Ex. saumon, avocat…', false)}
      ${tagsHTML('deteste', 'Aliments à éviter', 'Aucune recette qui les contient ne te sera proposée.', 'Ex. champignons, coriandre…', true)}`;
  } else {
    corps = `
      <div class="q-head"><span class="pill">Dernière étape</span><h1 class="h1">Tes contraintes &amp; ta semaine</h1>
        <p class="lead">Ton plan s'adapte à ta santé, ton budget et ton rythme de vie.</p></div>
      <div class="section-title">Allergies &amp; intolérances <small>Jamais proposées</small></div>
      <div class="chip-grid">${ALLERGIES.map((a) => `<button class="chip neg${d.allergies.includes(a.v) ? ' on' : ''}" data-toggle="allergies" data-v="${a.v}">${d.allergies.includes(a.v) ? ms('block') : ''}${a.t}</button>`).join('')}
        <button class="chip${!d.allergies.length ? ' on' : ''}" data-clear="allergies">Aucune allergie</button></div>
      <div class="section-title">Régime</div>
      <div class="dk dk-opts">${REGIMES.map((o) => optionHTML('regime', o, d.regime === o.v, true)).join('')}</div>
      ${S.q4Plus ? '' : `<button class="card resume" id="q4plus"><span class="ic">${ms('tune')}</span><span class="txt"><b>${d.budget === 'eco' ? 'Budget économique' : 'Budget standard'} · ${(TEMPS.find((t) => t.v === Number(d.temps)) || TEMPS[1]).d} · ${d.jours} jours</b><span>Réglages par défaut, tu peux les changer</span></span><span class="link-txt">Modifier</span></button>`}
      <div ${S.q4Plus ? '' : 'hidden'}>
      <div class="section-title">Budget courses</div>
      <div class="seg-2">
        <button class="tile stack${d.budget === 'eco' ? ' on' : ''}" data-set="budget" data-v="eco">Économique<small>Produits simples</small></button>
        <button class="tile stack${d.budget === 'normal' ? ' on' : ''}" data-set="budget" data-v="normal">Standard<small>Plus de variété</small></button>
      </div>
      <div class="section-title">Temps de cuisine par repas</div>
      <div class="seg-3">${TEMPS.map((t) => `<button class="tile stack${Number(d.temps) === t.v ? ' on' : ''}" data-set="temps" data-v="${t.v}">${ms(t.ic)}${t.t}<small>${t.d}</small></button>`).join('')}</div>
      <div class="section-title">Nombre de jours au menu</div>
      <div class="seg-3">${[3, 5, 7].map((j) => `<button class="tile stack${Number(d.jours) === j ? ' on' : ''}" data-set="jours" data-v="${j}">${j} jours<small>${j === 7 ? 'Semaine complète' : j === 5 ? 'Du lundi au vendredi' : 'Pour démarrer'}</small></button>`).join('')}</div>
      </div>`;
  }
  const dernier = n === 4;
  app.innerHTML = `<section class="screen q-screen">${top}${corps}
    <p class="form-error q-err" id="qerr" hidden></p>
    <div class="q-foot">
      ${n > 1 ? `<button class="btn btn-soft" id="prev" aria-label="Étape précédente">${ms('arrow_back')}</button>` : ''}
      <button class="btn btn-primary" id="next">${dernier ? 'Voir mon plan ' + ms('auto_awesome') : 'Continuer ' + ms('arrow_forward')}</button>
    </div></section>`;

  const maj = () => { persist(); const e = document.getElementById('qerr'); if (e) e.hidden = true; };

  app.querySelectorAll('[data-set]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.set; const v = b.dataset.v;
    d[k] = ['temps', 'jours'].includes(k) ? Number(v) : v;
    persist(); ecranQuestionnaireRefresh(n);
  }));
  app.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.toggle; const v = b.dataset.v;
    d[k] = d[k].includes(v) ? d[k].filter((x) => x !== v) : [...d[k], v];
    persist(); ecranQuestionnaireRefresh(n);
  }));
  const q4plus = document.getElementById('q4plus');
  if (q4plus) q4plus.onclick = () => { S.q4Plus = true; persist(); ecranQuestionnaireRefresh(n); };
  app.querySelectorAll('[data-clear]').forEach((b) => b.addEventListener('click', () => { d[b.dataset.clear] = []; persist(); ecranQuestionnaireRefresh(n); }));
  const champPrenom = document.getElementById('prenom');
  if (champPrenom) champPrenom.addEventListener('input', () => { d.prenom = champPrenom.value.trim().slice(0, 40); persist(); });
  app.querySelectorAll('.measure input').forEach((inp) => inp.addEventListener('input', () => {
    let v = inp.value.replace(/[^0-9.,]/g, '').replace('.', ',');
    const i = v.indexOf(',');
    if (i >= 0) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/,/g, '').slice(0, 1);
    if (inp.value !== v) inp.value = v;
    d[inp.name] = inp.value.replace(',', '.'); inp.closest('.measure').classList.remove('err'); maj();
  }));
  app.querySelectorAll('[data-tagform]').forEach((f) => f.addEventListener('submit', (e) => {
    e.preventDefault();
    const k = f.dataset.tagform; const inp = f.querySelector('input');
    const vals = inp.value.split(',').map((s) => s.trim()).filter(Boolean);
    vals.forEach((v) => { if (!d[k].some((x) => x.toLowerCase() === v.toLowerCase())) d[k].push(v.slice(0, 40)); });
    persist(); ecranQuestionnaireRefresh(n, k);
  }));
  app.querySelectorAll('[data-untag]').forEach((b) => b.addEventListener('click', () => {
    const [k, i] = b.dataset.untag.split(':'); d[k].splice(Number(i), 1); persist(); ecranQuestionnaireRefresh(n);
  }));

  document.getElementById('qback').onclick = () => (n > 1 ? go('#/questionnaire/' + (n - 1)) : go(S.plan ? '#/profil' : '#/'));
  const prev = document.getElementById('prev'); if (prev) prev.onclick = () => go('#/questionnaire/' + (n - 1));
  document.getElementById('next').onclick = () => {
    if (!etapeValide(n, true)) return;
    if (!dernier) return go('#/questionnaire/' + (n + 1));
    // Un plan existe déjà : on prévient avant de le remplacer.
    if (S.plan) return confirmer('Remplacer ton plan actuel ?', 'Ton nouveau plan remplacera celui en cours, avec les repas que tu as changés et ta liste de courses cochée.', 'Créer mon nouveau plan', lancerGeneration, true);
    lancerGeneration();
  };
}

// La génération n'est lancée QUE par un clic : revenir en arrière vers cet écran
// ne doit jamais recréer un plan (cf. ecranGeneration).
function lancerGeneration() { S.genDemandee = true; persist(); go('#/generation'); }

// Re-rendu de l'étape en gardant la position de défilement.
function ecranQuestionnaireRefresh(n, focusTag) {
  const y = window.scrollY;
  ecranQuestionnaire(n);
  window.scrollTo(0, y);
  if (focusTag) app.querySelector(`[data-tagform="${focusTag}"] input`)?.focus();
}

function optionHTML(champ, o, on, compact) {
  return `<button class="option${on ? ' on' : ''}${compact ? ' compact' : ''}" data-set="${champ}" data-v="${o.v}">
    <span class="ic">${ms(o.ic)}</span><span class="txt"><b>${o.t}</b><span>${o.d}</span></span><span class="radio">${ms('check')}</span></button>`;
}
function mesureHTML(name, label, unit, val, min, max, step) {
  return `<div class="measure"><label for="m-${name}">${label}</label><div class="val">
    <input id="m-${name}" name="${name}" type="text" inputmode="${step < 1 ? 'decimal' : 'numeric'}" autocomplete="off" maxlength="5" value="${esc(String(val).replace('.', ','))}" placeholder="—" />
    <span class="unit">${unit}</span></div></div>`;
}
function tagsHTML(k, titre, aide, ph, neg) {
  return `<div class="section-title">${titre}</div><p class="section-help">${aide}</p>
    <form class="tag-input" data-tagform="${k}"><div class="input-wrap"><input placeholder="${ph}" aria-label="${titre}" /></div>
    <button class="btn btn-soft" type="submit">${ms('add')}Ajouter</button></form>
    <div class="tags">${S.draft[k].map((t, i) => `<span class="tag${neg ? ' neg' : ''}">${esc(t)}<button data-untag="${k}:${i}" aria-label="Retirer ${esc(t)}">${ms('close')}</button></span>`).join('')}</div>`;
}

const nombre = (v) => { const x = parseFloat(String(v == null ? '' : v).replace(',', '.')); return Number.isFinite(x) ? x : NaN; };
const BORNES = { age: [14, 100], taille: [120, 230], poids: [35, 250] };
function etapeValide(n, montrer) {
  const d = S.draft;
  const dire = (txt) => {
    if (!montrer) return;
    const e = document.getElementById('qerr');
    if (e) { e.textContent = txt; e.hidden = false; }
  };
  if (n === 1) { if (!d.objectif) dire('Choisis ton objectif pour continuer.'); return !!d.objectif; }
  if (n === 2) {
    const manque = [];
    if (!d.sexe) manque.push('ton sexe');
    const fautifs = Object.entries(BORNES).filter(([k, [a, b]]) => { const v = nombre(d[k]); return !(v >= a && v <= b); }).map(([k]) => k);
    if (fautifs.length) manque.push('tes mesures (âge 14–100 ans, taille 120–230 cm, poids 35–250 kg)');
    if (!d.activite) manque.push('ton niveau d\'activité');
    if (montrer) fautifs.forEach((k) => app.querySelector(`.measure input[name="${k}"]`)?.closest('.measure').classList.add('err'));
    if (manque.length) dire('Il manque ' + manque.join(', ') + '.');
    return !manque.length;
  }
  return true;
}

// Conversion questionnaire -> format attendu par le moteur.
function profilDepuisDraft(d) {
  return {
    objectif: d.objectif, sexe: d.sexe, age: nombre(d.age), taille_cm: nombre(d.taille), poids_kg: nombre(d.poids),
    activite: d.activite, jours: Number(d.jours) || 7, mangeMatin: d.matin !== 'aucun', collations: [...d.collations], dinerTard: 'non',
  };
}
function preferencesDepuisDraft(d) {
  return {
    cuisines: [...d.cuisines], matinGout: d.matin, aimes: [...d.aimes], deteste: [...d.deteste], allergies: [...d.allergies],
    regime: d.regime === 'omnivore' ? [] : [d.regime], budget: d.budget, temps_max: Number(d.temps) || 45, dinerTard: 'non', collationCategories: [],
  };
}
function draftDepuis(p, pr) {
  pr = pr || {};
  return Object.assign(draftVide(), {
    objectif: p.objectif || '', sexe: p.sexe || '', age: p.age || '', taille: p.taille_cm || '', poids: p.poids_kg || '', activite: p.activite || '',
    jours: p.jours || 7, collations: p.collations || [], matin: pr.matinGout || (p.mangeMatin === false ? 'aucun' : 'les-deux'),
    cuisines: pr.cuisines || [], aimes: pr.aimes || [], deteste: pr.deteste || [], allergies: pr.allergies || [],
    regime: (pr.regime && pr.regime[0]) || 'omnivore', budget: pr.budget || 'normal', temps: pr.temps_max || 45,
  });
}

// ---------------------------------------------------------------------------
//  Génération du plan
// ---------------------------------------------------------------------------
async function ecranGeneration() {
  // Arrivée sans clic (bouton retour, lien, rechargement) : on ne régénère pas.
  if (!S.genDemandee) return location.replace(S.plan ? '#/plan' : '#/questionnaire/1');
  if (!etapeValide(1, false) || !etapeValide(2, false)) { S.genDemandee = false; persist(); return go('#/questionnaire/' + (etapeValide(1, false) ? 2 : 1)); }
  const etapes = ['Analyse de ton objectif', 'Calcul de tes besoins', 'Prise en compte de tes goûts', 'Vérification de tes contraintes', 'Équilibrage de tes repas', 'Création de la liste de courses'];
  app.innerHTML = `<section class="loading"><div class="spinner"></div><h1 class="h2">On prépare ton plan…</h1>
    <p class="lead">On adapte chaque repas à toi, un instant.</p>
    <ul>${etapes.map((e) => `<li>${ms('check_circle', 'fill')}${e}</li>`).join('')}</ul></section>`;
  const lis = [...app.querySelectorAll('li')];
  let i = 0;
  const tick = setInterval(() => { if (lis[i]) lis[i++].classList.add('done'); }, 280);
  const debut = Date.now();
  try {
    await genererPlan();
    await new Promise((r) => setTimeout(r, Math.max(0, 1900 - (Date.now() - debut))));
    clearInterval(tick); lis.forEach((l) => l.classList.add('done'));
    setTimeout(() => location.replace('#/plan'), 250);
  } catch (ex) {
    clearInterval(tick);
    S.genDemandee = false; persist();
    app.innerHTML = `<section class="loading"><h1 class="h2">Oups, le plan n'a pas pu être créé</h1><p class="lead">${esc(ex.message)}</p>
      <button class="btn btn-primary btn-block" style="margin-top:22px" id="retry">Réessayer</button>
      <button class="btn btn-ghost" id="edit">Modifier mes réponses</button></section>`;
    document.getElementById('retry').onclick = () => { S.genDemandee = true; render(); };
    document.getElementById('edit').onclick = () => go('#/questionnaire/1');
  }
}

async function genererPlan() {
  const profil = profilDepuisDraft(S.draft);
  const preferences = preferencesDepuisDraft(S.draft);
  const seed = Math.floor(Math.random() * 2e9) + 1;
  const r = await api('/api/plan', { body: { profil, preferences, seed } });
  if (!r.plan || !r.plan.jours || !r.plan.jours.length) throw new Error('Aucun plan renvoyé.');
  if (r.plan.poolVide) throw new Error('Aucune recette ne correspond à toutes tes contraintes. Assouplis un critère (temps, budget ou aliments à éviter).');
  S.profil = profil; S.preferences = preferences; S.plan = r.plan; S.seed = r.seed;
  if (S.draft.prenom) S.prenom = S.draft.prenom;
  S.jour = 0; S.coches = {}; S.refus = {}; S.genDemandee = false;
  persist();
  syncServeur({ profil, preferences, plan: r.plan, prenom: S.prenom || undefined });
}

// ---------------------------------------------------------------------------
//  Plan de la semaine
// ---------------------------------------------------------------------------
function objectifLabel(v) { return (OBJECTIFS.find((o) => o.v === v) || {}).t || 'Équilibre'; }

function totauxJour(jour) {
  const t = { kcal: 0, proteines: 0, glucides: 0, lipides: 0 };
  (jour.repas || []).forEach((r) => { if (r.recette) Object.keys(t).forEach((k) => { t[k] += Number(r.recette[k]) || 0; }); });
  return t;
}

function photoHTML(r) {
  const c = CRENEAU[r.creneau] || CRENEAU.dejeuner;
  const img = r.recette && photos[r.recette.id]
    ? `<img src="api/recipe-photo/${encodeURIComponent(r.recette.id)}?v=${encodeURIComponent(photos[r.recette.id])}" alt="" loading="lazy" onerror="this.remove()" />` : '';
  return `<span class="emo" aria-hidden="true">${c.e}</span>${img}`;
}

function ecranPlan() {
  const plan = S.plan;
  const b = plan.besoins;
  if (S.jour >= plan.jours.length) S.jour = 0;
  const jour = plan.jours[S.jour];
  const t = totauxJour(jour);
  const pct = (a, c) => (c ? Math.min(100, Math.round((a / c) * 100)) : 0);
  const kcalPct = Math.round((t.kcal / (b.kcalCible || 1)) * 100);
  const macroLigne = (lbl, val, cible) => `<div class="mline"><span>${lbl}</span><div class="bar"><i style="width:${pct(val, cible)}%"></i></div><b>${fmt(val)} / ${fmt(cible)} g</b></div>`;
  const doux = !!S.masquerKcal;
  const tousIds = plan.jours.flatMap((j) => j.repas.map((r) => r.recette && r.recette.id).filter(Boolean));

  app.innerHTML = `
  <section class="screen with-nav plan-screen">
    <div class="topbar">${logo()}<span class="title">Plan de repas</span></div>
    <span class="pill">${ms('eco')}${esc(objectifLabel(S.profil.objectif))} · ${plan.jours.length} jours</span>
    <h1 class="h1" style="margin-top:12px">${S.prenom ? esc(S.prenom) + ', ton' : 'Ton'} menu de la semaine</h1>
    <p class="lead">Calibré pour ton objectif et tes goûts.</p>
    <div class="days" role="tablist" style="--n:${plan.jours.length}">${plan.jours.map((j, i) => `<button class="day${i === S.jour ? ' on' : ''}" data-day="${i}" role="tab" aria-selected="${i === S.jour}">
      ${JOURS_COURTS[j.jour] || j.jour.slice(0, 3)}</button>`).join('')}</div>
    <div class="dk dk-cols${doux && !(COMPTES && !token) ? ' solo' : ''}"><div class="dk dk-side">
    ${doux ? '' : `<div class="hero-card energie">
      <div class="head"><div><small>Énergie du ${esc((jour.jour || '').toLowerCase())}</small><b>${fmt(t.kcal)} <span>/ ${fmt(b.kcalCible)} kcal</span></b></div>
        <span class="badge${kcalPct >= 95 && kcalPct <= 105 ? ' ok' : ''}">${kcalPct >= 95 && kcalPct <= 105 ? ms('check') + 'Équilibré' : kcalPct + ' %'}</span></div>
      <div class="bar big${kcalPct >= 95 && kcalPct <= 105 ? ' ok' : ''}"><i style="width:${pct(t.kcal, b.kcalCible)}%"></i></div>
      <details class="macros-detail"${S.voirMacros ? ' open' : ''}><summary>Voir le détail (protéines, glucides, lipides)${ms('expand_more', 'chev')}</summary>
        ${macroLigne('Protéines', t.proteines, b.macros.proteines)}${macroLigne('Glucides', t.glucides, b.macros.glucides)}${macroLigne('Lipides', t.lipides, b.macros.lipides)}</details>
    </div>`}
    ${COMPTES && !token ? `<div class="save-banner">${ms('cloud_upload')}<div style="flex:1"><b>Garde ton plan</b><p>Retrouve-le sur tous tes appareils.</p></div><button id="save">Sauvegarder</button></div>` : ''}
    </div><div class="dk dk-main dk-meals">
    <div class="meals-head"><h2 class="h2">Les repas du jour</h2><span class="muted small">${jour.repas.length} repas prévus</span></div>
    ${jour.repas.map((r, i) => {
      const c = CRENEAU[r.creneau] || CRENEAU.dejeuner;
      if (!r.recette) return `<article class="card meal"><div class="empty-meal"><b>${esc(r.label)}</b><br/>Aucune recette compatible avec tes contraintes pour ce repas.</div></article>`;
      const rc = r.recette;
      return `<article class="card meal">
        <div class="photo">${photoHTML(r)}
          <span class="chip-float slot">${ms(c.ic)}${esc(labelRepas(r.label))}</span>
          <button class="chip-float swap" data-swap="${i}">${ms('sync')}Changer</button></div>
        <div class="body"><h3 class="name">${esc(rc.nom)}</h3>
          <div class="meal-foot"><div class="meta"><span>${ms('schedule')}${rc.tempsMinutes} min</span>${doux ? '' : `<span>${ms('local_fire_department')}${fmt(rc.kcal)} kcal</span>`}</div>
            <button class="btn btn-ghost" data-recipe="${i}">Recette${ms('chevron_right')}</button></div></div>
      </article>`;
    }).join('')}
    <div class="end-cta"><button class="btn btn-primary btn-block" id="toShop">${ms('shopping_cart')}Voir ma liste de courses</button></div>
    </div></div>
  </section>`;

  app.querySelectorAll('[data-day]').forEach((bt) => bt.addEventListener('click', () => { S.jour = Number(bt.dataset.day); persist(); const y = window.scrollY; ecranPlan(); window.scrollTo(0, y); }));
  app.querySelectorAll('[data-recipe]').forEach((bt) => bt.addEventListener('click', () => ouvrirRecette(jour.repas[Number(bt.dataset.recipe)])));
  app.querySelectorAll('[data-swap]').forEach((bt) => bt.addEventListener('click', async () => {
    const idx = Number(bt.dataset.swap);
    const repas = jour.repas[idx];
    const cleRefus = S.jour + '-' + idx;
    S.refus = S.refus || {};
    const refus = S.refus[cleRefus] = [...new Set([...(S.refus[cleRefus] || []), repas.recette.id])];
    bt.disabled = true; bt.innerHTML = ms('hourglass_top') + 'Un instant…';
    const demander = (exclus) => api('/api/meal', { body: {
      profil: S.profil, preferences: S.preferences, creneau: repas.creneau, kcalCible: repas.kcalCible,
      exclureId: repas.recette.id, exclus, seed: Math.floor(Math.random() * 2e9) + 1,
    } });
    try {
      let r = await demander([...tousIds, ...refus]);
      let tour = false;
      // Toutes les recettes compatibles ont été vues : on repart du début.
      if (!r.recette && refus.length > 1) { S.refus[cleRefus] = [repas.recette.id]; r = await demander([...tousIds]); tour = true; }
      if (!r.recette) { toast('Pas d\'autre recette compatible pour ce repas.'); bt.disabled = false; bt.innerHTML = ms('sync') + 'Changer'; return; }
      repas.recette = r.recette;
      persist(); syncServeur({ plan: planPourServeur() });
      if (tour) { const y = window.scrollY; ecranPlan(); window.scrollTo(0, y); return toast('Tu as vu toutes les recettes possibles, on recommence.'); }
      const y = window.scrollY; ecranPlan(); window.scrollTo(0, y);
      toast('Repas remplacé ✓');
    } catch (ex) { toast(ex.message); bt.disabled = false; bt.innerHTML = ms('sync') + 'Changer'; }
  }));
  const det = app.querySelector('.macros-detail');
  if (det) det.addEventListener('toggle', () => { S.voirMacros = det.open; persist(); });
  document.getElementById('toShop').onclick = () => go('#/courses');
  const save = document.getElementById('save'); if (save) save.onclick = () => go('#/connexion');
}

function nomIngredient(n) {
  const t = String(n || '').replace(/\boeuf/gi, (m) => (m[0] === 'O' ? 'Œuf' : 'œuf'));
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function quantiteTxt(i) {
  const q = Number(i.quantite) || 0;
  let u = String(i.unite || '').trim();
  if (/^pi[eè]ces?$/i.test(u)) u = q > 1 ? 'pièces' : 'pièce';
  return (String(i.quantite).replace('.', ',') + ' ' + u).trim();
}
function labelRepas(l) { return String(l || '').replace(/apres/g, 'après'); }

function initiale() { return ((S.prenom || S.email || 'M').trim()[0] || 'M').toUpperCase(); }

function ouvrirRecette(repas) {
  const r = repas.recette; if (!r) return;
  const back = document.createElement('div');
  back.className = 'sheet-back';
  back.innerHTML = `<div class="sheet sheet-recette" role="dialog" aria-modal="true" aria-label="${esc(r.nom)}"><div class="grab"></div>
    ${photos[r.id] ? `<img class="sheet-photo" src="api/recipe-photo/${encodeURIComponent(r.id)}?v=${encodeURIComponent(photos[r.id])}" alt="" onerror="this.remove()" />` : ''}
    <div class="top"><h2>${esc(r.nom)}</h2><button class="icon-btn" data-close aria-label="Fermer">${ms('close')}</button></div>
    <div class="meta"><span>${ms('schedule')}${r.tempsMinutes} min</span>${S.masquerKcal ? '' : `<span>${ms('local_fire_department')}${fmt(r.kcal)} kcal</span>`}<span>${ms('person')}1 portion</span></div>
    ${S.masquerKcal ? '' : `<div class="macros"><span class="macro">Protéines ${fmt(r.proteines)} g</span><span class="macro">Glucides ${fmt(r.glucides)} g</span><span class="macro">Lipides ${fmt(r.lipides)} g</span></div>`}
    <div class="dk dk-recette"><div class="dk">
    <h3>Ingrédients</h3>
    ${(r.ingredients || []).map((i) => `<div class="ing"><span>${esc(nomIngredient(i.nom))}</span><span>${esc(quantiteTxt(i))}</span></div>`).join('')}
    </div><div class="dk">
    <h3>Préparation</h3>
    <ol class="steps">${(r.etapes || []).map((e) => `<li>${esc(e)}</li>`).join('')}</ol>
    </div></div>
    <p class="legal">Les quantités sont adaptées à ton objectif.</p>
  </div>`;
  const fermer = () => { back.remove(); document.body.style.overflow = ''; };
  back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) fermer(); });
  document.body.style.overflow = 'hidden';
  document.body.appendChild(back);
}

// ---------------------------------------------------------------------------
//  Liste de courses
// ---------------------------------------------------------------------------
function ecranCourses() {
  const liste = CoursesEngine.construireListe(S.plan, S.portions);
  const parRayon = {};
  liste.frais.forEach((it) => { (parRayon[it.rayon] = parRayon[it.rayon] || []).push(it); });
  const rayons = CoursesEngine.trierRayons(Object.keys(parRayon));
  const cle = (it) => it.id || it.nom;
  const tous = [...liste.frais, ...liste.placard];
  const faits = tous.filter((it) => S.coches[cle(it)]).length;
  const pct = tous.length ? Math.round((faits / tous.length) * 100) : 0;

  const itemHTML = (it) => {
    const on = !!S.coches[cle(it)];
    const sous = it.probablement_deja_en_stock ? 'Sûrement déjà dans ton placard' : '';
    return `<button class="item${on ? ' done' : ''}" data-item="${esc(cle(it))}" aria-pressed="${on}">
      <span class="box">${ms('check')}</span><span class="nm">${esc(it.nom)}${sous ? `<small>${sous}</small>` : ''}</span>
      <span class="qty">${esc(it.quantite_achat)}</span></button>`;
  };
  const faitsDans = (arr) => arr.filter((it) => S.coches[cle(it)]).length;
  // Les articles pris descendent ; un rayon entièrement pris se replie en bas.
  const trier = (arr) => [...arr.filter((it) => !S.coches[cle(it)]), ...arr.filter((it) => S.coches[cle(it)])];
  const rayonsFinis = rayons.filter((ry) => faitsDans(parRayon[ry]) === parRayon[ry].length);
  const rayonsEnCours = rayons.filter((ry) => !rayonsFinis.includes(ry));

  app.innerHTML = `
  <section class="screen with-nav">
    <div class="topbar">${logo()}<span class="title">Courses</span></div>
    <span class="pill">${ms('calendar_month')}Plan de ${S.plan.jours.length} jours</span>
    <h1 class="h1" style="margin-top:12px">Liste de courses</h1>
    <p class="lead">Tous les ingrédients de ton plan, calculés pour la semaine.</p>
    <p class="print-only">${esc(APP_NOM)} — pour ${S.plan.jours.length} jours · ${S.portions} personne(s)</p>
    <div class="dk dk-cols dk-courses"><div class="dk dk-side">
    <div class="card portions"><div class="ic">${ms('group')}</div><div class="txt"><b>Cuisiner pour</b><span>Quantités ajustées</span></div>
      <div class="stepper"><button id="minus" aria-label="Une personne de moins" ${S.portions <= 1 ? 'disabled' : ''}>${ms('remove')}</button>
        <output>${S.portions}<small>pers.</small></output>
        <button id="plus" aria-label="Une personne de plus" ${S.portions >= 12 ? 'disabled' : ''}>${ms('add')}</button></div></div>
    <div class="card progress-card"><div class="row"><span>${ms('check_circle', 'fill')}${faits} sur ${tous.length} articles</span><span>${pct} %</span></div>
      <div class="bar"><i style="width:${pct}%"></i></div></div>
    </div><div class="dk dk-main dk-rayons">
    ${rayonsEnCours.map((ry) => `<div class="card rayon"><div class="head"><div class="ic">${ms(RAYON_IC[ry] || 'shopping_basket')}</div><h3>${esc(ry)}</h3>
      <small>${faitsDans(parRayon[ry])}/${parRayon[ry].length}</small></div>${trier(parRayon[ry]).map(itemHTML).join('')}</div>`).join('')}
    ${liste.placard.length ? `<details class="card rayon placard"><summary class="head"><div class="ic">${ms('kitchen')}</div><h3>Placard</h3>
      <small>${faitsDans(liste.placard)}/${liste.placard.length}</small>${ms('expand_more', 'chev')}</summary>
      <p class="section-help" style="margin:4px 0 0">Condiments et basiques : vérifie avant d'en racheter.</p>${trier(liste.placard).map(itemHTML).join('')}</details>` : ''}
    ${rayonsFinis.map((ry) => `<details class="card rayon fini"><summary class="head"><div class="ic">${ms('check', 'fill')}</div><h3>${esc(ry)}</h3>
      <small>Tout est pris</small>${ms('expand_more', 'chev')}</summary>${parRayon[ry].map(itemHTML).join('')}</details>`).join('')}
    </div><div class="dk dk-actions">
    <button class="btn btn-primary btn-block no-print" style="margin-top:22px" id="share">${ms('ios_share')}Partager la liste</button>
    <div class="export-row no-print"><button class="btn btn-ghost" id="pdf">${ms('download')}Exporter en PDF</button>
      ${faits ? `<button class="btn btn-ghost" id="reset">${ms('restart_alt')}Tout décocher</button>` : ''}</div>
    </div></div>
  </section>`;

  const reRender = () => {
    const y = window.scrollY; const ouvert = app.querySelector('.placard')?.open;
    const finisOuverts = [...app.querySelectorAll('.rayon.fini[open] h3')].map((h) => h.textContent);
    ecranCourses(); window.scrollTo(0, y);
    if (ouvert) app.querySelector('.placard').open = true;
    app.querySelectorAll('.rayon.fini').forEach((el) => { if (finisOuverts.includes(el.querySelector('h3').textContent)) el.open = true; });
  };
  app.querySelectorAll('[data-item]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.item; if (S.coches[k]) delete S.coches[k]; else S.coches[k] = 1; persist(); syncCourses(); reRender();
  }));
  document.getElementById('minus').onclick = () => { S.portions = Math.max(1, S.portions - 1); persist(); syncCourses(); reRender(); };
  document.getElementById('plus').onclick = () => { S.portions = Math.min(12, S.portions + 1); persist(); syncCourses(); reRender(); };
  document.getElementById('pdf').onclick = () => { const p = app.querySelector('.placard'); if (p) p.open = true; window.print(); };
  const reset = document.getElementById('reset'); if (reset) reset.onclick = () => { S.coches = {}; persist(); syncCourses(); reRender(); };
  document.getElementById('share').onclick = async () => {
    const texte = CoursesEngine.rendreTexte(liste, { jours: S.plan.jours.length, personnes: S.portions, programme: APP_NOM });
    try {
      if (navigator.share) { await navigator.share({ title: 'Ma liste de courses', text: texte }); return; }
      await navigator.clipboard.writeText(texte); toast('Liste copiée ✓');
    } catch (ex) { if (ex && ex.name !== 'AbortError') toast('Partage impossible sur cet appareil.'); }
  };
}

// ---------------------------------------------------------------------------
//  Profil
// ---------------------------------------------------------------------------
function ecranProfil() {
  const b = S.plan && S.plan.besoins;
  const pr = S.preferences || {};
  const d = S.draft;
  const listeTxt = (vals, ref) => vals.map((v) => (ref.find((x) => x.v === v) || { t: v }).t).join(', ');
  const contraintes = [
    (REGIMES.find((r) => r.v === d.regime) || REGIMES[0]).t,
    d.allergies.length ? 'Sans ' + listeTxt(d.allergies, ALLERGIES).toLowerCase() : 'Aucune allergie',
  ].join(' · ');
  const macroRow = (lbl, g, kcalParG) => {
    const p = b ? Math.round((g * kcalParG * 100) / b.kcalCible) : 0;
    return `<div class="macro-row"><div class="lbl"><b>${lbl}</b><span>${fmt(g)} g · ${p} %</span></div><div class="bar"><i style="width:${p}%"></i></div></div>`;
  };

  app.innerHTML = `
  <section class="screen with-nav">
    <div class="topbar">${logo()}<span class="title">Profil</span></div>
    <div class="dk dk-cols dk-profil"><div class="dk dk-side">
    <div class="profile-head"><div class="avatar">${esc(initiale())}</div><div class="who">
      <b>${esc(S.prenom || 'Ajoute ton prénom')}</b><span>${token ? esc(S.email || '') : 'Ton plan est enregistré sur ce téléphone'}</span></div>
      <button class="icon-btn" id="editName" aria-label="Modifier mon prénom">${ms('edit')}</button></div>
    <form class="name-edit" id="nameForm" hidden><div class="input-wrap"><input id="prenom" placeholder="Ton prénom" value="${esc(S.prenom || '')}" maxlength="60" aria-label="Ton prénom" autocomplete="given-name" /></div>
      <button class="btn btn-soft" type="submit">OK</button></form>
    ${COMPTES && !token ? `<div class="save-banner">${ms('cloud_upload')}<div style="flex:1"><b>Sauvegarde ton plan</b><p>Connexion par e-mail, sans mot de passe.</p></div><button id="save">Me connecter</button></div>` : ''}
    ${b ? `<div class="goal-card"><small>Objectif</small><div class="h2">${esc(objectifLabel(S.profil.objectif))}</div>
      ${S.masquerKcal ? '' : `<div class="kcal"><b>${fmt(b.kcalCible)}</b><span>kcal / jour</span></div>
      <div class="macro-rows">${macroRow('Protéines', b.macros.proteines, 4)}${macroRow('Glucides', b.macros.glucides, 4)}${macroRow('Lipides', b.macros.lipides, 9)}</div>`}</div>` : ''}
    </div><div class="dk dk-main">
    <div class="card list-card">
      ${studio ? `<button class="list-row" id="studio"><span class="ic">${ms('storefront')}</span><span class="txt"><b>My Coach ${esc(studio.nom)}</b><span class="link-txt">Changer de studio</span></span>${ms('chevron_right')}</button>` : ''}
      <button class="list-row" id="edit"><span class="ic">${ms('tune')}</span><span class="txt"><b>Modifier mes réponses</b><span>Objectif, mesures, goûts, contraintes</span></span>${ms('chevron_right')}</button>
      <div class="list-row"><span class="ic">${ms('restaurant')}</span><span class="txt"><b>Régime &amp; tolérances</b><span>${esc(contraintes)}</span></span></div>
      ${pr.cuisines && pr.cuisines.length ? `<div class="list-row"><span class="ic">${ms('public')}</span><span class="txt"><b>Cuisines préférées</b><span>${esc(listeTxt(pr.cuisines, CUISINES))}</span></span></div>` : ''}
      <label class="list-row toggle-row" for="masquer"><span class="ic">${ms('visibility_off')}</span><span class="txt"><b>Masquer les calories</b><span>Affichage plus doux, sans chiffres</span></span>
        <input type="checkbox" id="masquer" class="switch" ${S.masquerKcal ? 'checked' : ''} /></label>
      <button class="list-row" id="regen"><span class="ic">${ms('autorenew')}</span><span class="txt"><b>Nouveau plan</b><span>Mêmes réglages, nouvelles recettes</span></span>${ms('chevron_right')}</button>
    </div>
    <div class="card list-card">
      ${token ? `<button class="list-row" id="logout"><span class="ic">${ms('logout')}</span><span class="txt"><b>Se déconnecter</b></span></button>` : ''}
      <button class="list-row" id="erase"><span class="ic" style="color:var(--danger)">${ms('delete')}</span><span class="txt"><b style="color:var(--danger)">${token ? 'Supprimer mon compte' : 'Effacer mes données'}</b>
        <span>${token ? 'Supprime ton compte et ton plan, définitivement' : 'Efface le plan enregistré sur cet appareil'}</span></span></button>
    </div>
    </div></div>
    <p class="legal center">Estimations à titre indicatif. Cette application ne remplace pas l'avis d'un professionnel de santé.</p>
  </section>`;

  document.getElementById('editName').onclick = () => { const f = document.getElementById('nameForm'); f.hidden = !f.hidden; if (!f.hidden) document.getElementById('prenom').focus(); };
  document.getElementById('masquer').onchange = (e) => { S.masquerKcal = e.target.checked; persist(); toast(S.masquerKcal ? 'Calories masquées' : 'Calories affichées'); };
  document.getElementById('nameForm').onsubmit = (e) => {
    e.preventDefault();
    S.prenom = document.getElementById('prenom').value.trim().slice(0, 60); persist();
    syncServeur({ prenom: S.prenom }); toast('Prénom enregistré ✓'); ecranProfil();
  };
  const save = document.getElementById('save'); if (save) save.onclick = () => go('#/connexion');
  const btnStudio = document.getElementById('studio'); if (btnStudio) btnStudio.onclick = () => go('#/code');
  document.getElementById('edit').onclick = () => { if (S.profil) S.draft = Object.assign(draftDepuis(S.profil, S.preferences), { prenom: S.prenom || '' }); persist(); go('#/questionnaire/1'); };
  document.getElementById('regen').onclick = () => confirmer('Créer un nouveau plan ?', 'Mêmes réglages, nouvelles recettes. Ton plan actuel et ta liste de courses cochée seront remplacés.', 'Créer mon nouveau plan', lancerGeneration, true);
  const logout = document.getElementById('logout');
  if (logout) logout.onclick = async () => {
    try { await api('/account/logout', { body: {} }); } catch (_) { /* déjà déconnecté */ }
    token = null; lsSet(LS_TOKEN, null);
    S = { draft: draftVide(), portions: 1, coches: {}, jour: 0 }; persist();
    toast('Tu es déconnecté'); go('#/');
  };
  document.getElementById('erase').onclick = () => confirmer(
    token ? 'Supprimer ton compte ?' : 'Effacer tes données ?',
    token ? 'Ton compte et ton plan seront supprimés définitivement.' : 'Le plan enregistré sur cet appareil sera effacé.',
    token ? 'Supprimer' : 'Effacer',
    async () => {
      if (token) { try { await api('/account', { method: 'DELETE' }); } catch (ex) { toast(ex.message); return; } }
      token = null; lsSet(LS_TOKEN, null);
      S = { draft: draftVide(), portions: 1, coches: {}, jour: 0 }; persist();
      toast('C\'est fait.'); go('#/');
    },
  );
}

function confirmer(titre, texte, action, onOk, doux) {
  const back = document.createElement('div');
  back.className = 'sheet-back';
  back.innerHTML = `<div class="sheet sheet-confirm" role="alertdialog" aria-modal="true"><div class="grab"></div><h2 class="h2">${esc(titre)}</h2>
    <p class="lead">${esc(texte)}</p>
    <button class="btn btn-block ${doux ? 'btn-primary' : ''}" style="margin-top:20px;${doux ? '' : 'background:var(--danger);color:#fff'}" data-ok>${esc(action)}</button>
    <button class="btn btn-soft btn-block" style="margin-top:10px" data-close>Annuler</button></div>`;
  back.addEventListener('click', (e) => {
    if (e.target === back || e.target.closest('[data-close]')) back.remove();
    if (e.target.closest('[data-ok]')) { back.remove(); onOk(); }
  });
  document.body.appendChild(back);
}

// ---------------------------------------------------------------------------
//  Démarrage
// ---------------------------------------------------------------------------
(async function init() {
  fetch('api/recipe-photos-index').then((r) => r.json()).then((j) => { photos = (j && j.photos) || {}; if (Object.keys(photos).length && /plan/.test(location.hash)) render(); }).catch(() => {});
  if (COMPTES && new URLSearchParams(location.search).has('lien')) { await traiterLienMagique(); render(); return; }
  render();
  // Vérification discrète du code mémorisé. Code refusé : on le redemande (le plan
  // reste). Pas de réseau ou serveur indisponible : l'accès est maintenu.
  if (studio) {
    try {
      const r = await api('/api/studio/verify', { body: { code: studio.code }, sansRedirection: true });
      memoriserStudio(r.studio, r.code);
    } catch (ex) {
      if (ex.status === 401) { oublierStudio(); location.replace('#/code'); }
    }
  }
  if (COMPTES && token) {
    try { const r = await api('/account/me'); adopterCompte(r.compte, false); if (/^#\/(plan|profil|courses)?$/.test(location.hash || '#/')) render(); } catch (_) { /* hors ligne ou session expirée */ }
  }
})();
