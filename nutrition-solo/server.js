'use strict';
// ============================================================================
//  SERVEUR — application nutrition autonome.
//
//  Volontairement AUTOPORTANTE : elle ne dépend pas de l'app principale
//  (suivi commerciaux / Protocole 42). `node server.js` suffit, avec sa propre
//  base SQLite. C'est tout l'intérêt de cette version : elle peut être déployée,
//  vendue ou ouverte au public sans rien traîner du dispositif coach.
//
//  Ce qui a été RETIRÉ par rapport au Protocole 42, et pourquoi :
//   - parcours 42 jours, Punch, cadeaux, groupe : ils n'ont de sens qu'adossés à
//     un coach et à une promo qui démarre le même jour ;
//   - messagerie et dashboard coach : il n'y a personne derrière ;
//   - invitations / codes de cohorte : on s'inscrit seul (cf. lib/auth.js).
//
//  Ce qui reste : les 4 objectifs d'origine (perte / maintien / muscle /
//  énergie), le plan de la semaine, les courses, le SOS coach IA, les comptes
//  et le suivi de progression personnel.
// ============================================================================

try {
  require('dotenv').config({ path: require('path').join(__dirname, '.env'), override: true });
} catch (_) {
  /* dotenv non installé : on lit process.env directement */
}

const path = require('path');
const express = require('express');

const { calculerBesoins } = require('./lib/nutrition');
const {
  genererPlanDemo,
  regenererRepas,
  recettesCompatibles,
  familiesFromUserAllergies,
} = require('./lib/planGenerator');
const {
  genererPlanIA, regenererRepasIA, genererRecetteDetail, analyserAssietteIA,
  iaDisponible, coachIaDisponible, coachRepondre,
} = require('./lib/aiGenerator');
const { getDb, nowIso, readJson } = require('./lib/db');
const { createAuth, normEmail, hashPin, PIN_RE } = require('./lib/auth');
const coachFaq = require('./lib/coachFaq');
const { createBoost } = require('./lib/boost');
const { createSeances } = require('./lib/boostSeances');
const { creerRoutesBoost } = require('./lib/boostRoutes');
const { createAcademy } = require('./lib/academy');
const { creerRoutesAcademy } = require('./lib/academyRoutes');
const { createAcademyQcm } = require('./lib/academyQcm');
const { createAcademyPratique } = require('./lib/academyPratique');
const { creerRegistre } = require('./lib/academyFormations');
const { createAcademyCertifications } = require('./lib/academyCertifications');

const APP_NOM = process.env.APP_NOM || 'My Coach Nutrition';
const PORT = process.env.PORT || 3000;
// Compte administrateur : le SEUL privilège au-dessus d'un compte normal, et il
// ne sert qu'aux photos de plats et à la FAQ. Non défini -> personne n'est admin.
const ADMIN_EMAIL = normEmail(process.env.ADMIN_EMAIL || '');

const auth = createAuth({ getDb, nowIso });
// Socle Boost Nutrition. Volontairement à côté du reste : il porte son propre
// schéma et ses propres routes (/api/boost/*), et ne réutilise de l'app que
// l'authentification existante — un compte reste un compte (email + PIN).
const boost = createBoost({ getDb, nowIso });
// Le contenu des rendez-vous vit à part (lib/boostSeances.js) : le socle porte
// le cycle de vie du Boost, ce module porte ce qui se dit en séance.
const seances = createSeances({ getDb, nowIso, boost });
// My Coach Academy : la formation qui mène à la certification Coach Nutrition.
// Elle réutilise les comptes et les collaborateurs du Boost — jamais les siens.
const academy = createAcademy({ getDb, nowIso, boost });
// L'évaluation théorique vit à part : le socle porte les contenus et la
// progression, ce module porte le QCM, son gel et sa correction. Réussir n'y
// certifie personne — la certification reste celle du Boost (boost.js).
const academyQcm = createAcademyQcm({ getDb, nowIso, boost, academy });
// L'évaluation pratique : la seule étape que personne n'automatise. Elle relit
// le verdict théorique du QCM plutôt que de le recalculer, et n'écrit jamais le
// statut de certification — valider la pratique ne certifie pas.
// Le droit d'évaluer n'est PAS dérivé du droit d'administrer : il se désigne,
// explicitement, administrateur compris (cf. lib/academyPratique.js).
const academyPratique = createAcademyPratique({ getDb, nowIso, boost, qcm: academyQcm });
// La certification finale. Le moteur est GÉNÉRIQUE : il ne connaît aucune
// formation, il lit un registre. « Coach Nutrition » y est la première entrée.
const academyFormations = creerRegistre({ qcm: academyQcm, pratique: academyPratique });
const academyCertifications = createAcademyCertifications({
  getDb, nowIso, boost, qcm: academyQcm, pratique: academyPratique, formations: academyFormations,
});
// LA FERMETURE DE LA PORTE PARALLÈLE : à partir d'ici, l'administration du
// Boost ne peut plus poser « certifié » sur un compte que l'Academy n'a pas
// diplômé. Elle garde en revanche tout le reste — suspendre, retirer, annoter.
boost.brancherCertificationAcademy((email) => academyCertifications.estCertifie(email));

const app = express();
// 6 Mo : une photo de progression prise au téléphone passe, un envoi abusif non.
app.use(express.json({ limit: '6mb' }));

app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    else res.setHeader('Cache-Control', 'public, max-age=86400');
  },
}));

// Le moteur d'avatar est servi au navigateur depuis lib/ — PAS de copie dans
// public/ : une seule source, donc l'aperçu de l'éditeur ne peut pas diverger du
// SVG que le serveur sait rendre.
app.get('/avatar.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.sendFile(path.join(__dirname, 'lib', 'avatar.js'));
});

// ---------------------------------------------------------------------------
//  Authentification des requêtes
// ---------------------------------------------------------------------------

// Lit le jeton (en-tête Authorization) et attache req.user quand il est valide.
// Ne refuse RIEN : c'est `exigeCompte` qui tranche. Beaucoup de routes marchent
// aussi bien connecté que non (générer un plan, par exemple).
function litCompte(req, _res, next) {
  const h = String(req.headers.authorization || '');
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const s = token ? auth.lireSession(token) : null;
  if (s) {
    const u = auth.findUser(s.email);
    if (u) { req.user = u; req.token = token; }
  }
  next();
}
app.use(litCompte);

function exigeCompte(req, res, next) {
  if (!req.user) return res.status(401).json({ ok: false, noAccount: true, error: 'Connexion requise.' });
  next();
}

// La règle « qui est administrateur » est écrite ICI, une seule fois : le
// middleware la garde, et les modules qui ont besoin de la CONNAÎTRE (pour
// afficher un écran, jamais pour ouvrir une porte) reçoivent la même fonction.
// Deux formulations de la même règle finiraient par diverger.
const estAdmin = (email) => !!ADMIN_EMAIL && normEmail(email) === ADMIN_EMAIL;

function exigeAdmin(req, res, next) {
  if (!req.user || !estAdmin(req.user.email)) {
    return res.status(403).json({ ok: false, error: 'Réservé à l\'administrateur.' });
  }
  next();
}

// Garde commune : toutes les routes de contenu personnel filtrent sur
// req.user.email. Aucune route n'accepte un email en paramètre — c'est ce qui
// rend structurellement impossible de lire l'espace de quelqu'un d'autre.
const moi = (req) => normEmail(req.user.email);

// ---------------------------------------------------------------------------
//  Génération de plans (repris tel quel de l'app d'origine)
// ---------------------------------------------------------------------------

function seedFromRequest(body) {
  if (body && Number.isFinite(Number(body.seed))) return Number(body.seed);
  return Math.floor(Date.now() % 2147483646) + 1;
}

// CEINTURE + BRETELLES : retire toute recette qui contiendrait malgré tout un
// allergène / aliment interdit (utile surtout pour les sorties IA).
function filtreSecuriteFinal(plan, prefs) {
  if (!plan || !Array.isArray(plan.jours)) return plan;
  const compatiblesIds = new Set(recettesCompatibles(require('./lib/recipes-v2').RECIPES, prefs).map((r) => r.id));
  familiesFromUserAllergies(prefs.allergies);
  let retirees = 0;
  for (const jour of plan.jours || []) {
    for (const repas of jour.repas || []) {
      const r = repas.recette;
      if (!r) continue;
      if (r.id && compatiblesIds.size && !compatiblesIds.has(r.id) && !String(r.id).startsWith('ia-')) {
        repas.recette = null;
        retirees++;
      }
    }
  }
  if (retirees) plan.avertissementSecurite = `${retirees} repas retiré(s) par sécurité.`;
  return plan;
}

function iaPourPlan() {
  const opt = ['on', '1', 'true', 'yes'].includes(String(process.env.NUTRITION_AI_PLAN || '').toLowerCase());
  return iaDisponible() && opt;
}

function recettesIA() {
  return iaDisponible() && ['on', '1', 'true', 'yes'].includes(String(process.env.NUTRITION_AI_RECIPES || '').toLowerCase());
}

app.get('/api/status', (req, res) => {
  res.json({
    ok: true, app: APP_NOM,
    ia: iaDisponible(), coachIa: coachIaDisponible(), demo: !iaDisponible(),
    connecte: !!req.user, admin: !!(req.user && ADMIN_EMAIL && normEmail(req.user.email) === ADMIN_EMAIL),
  });
});

app.post('/api/needs', (req, res) => {
  try {
    res.json({ ok: true, besoins: calculerBesoins(req.body || {}) });
  } catch (e) {
    res.status(400).json({ ok: false, error: 'Profil invalide.' });
  }
});

app.post('/api/plan', async (req, res) => {
  const { profil = {}, preferences = {} } = req.body || {};
  const seed = seedFromRequest(req.body);
  try {
    let plan = null;
    let source = 'demo';
    if (iaPourPlan()) {
      try {
        // Borne le temps IA : au-delà, repli démo instantané plutôt qu'un timeout
        // de proxy côté client.
        plan = await Promise.race([
          genererPlanIA(profil, preferences, seed),
          new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout génération IA (22s)')), 22000)),
        ]);
        if (!plan || !Array.isArray(plan.jours) || !plan.jours.length) throw new Error('Plan IA vide');
        source = 'ia';
      } catch (e) {
        console.warn('Génération IA échouée, repli sur le mode démo :', e && e.message);
        plan = null;
        source = 'demo-repli';
      }
    }
    if (!plan) {
      plan = genererPlanDemo(profil, preferences, seed);
      if (source !== 'demo-repli') source = 'demo';
    }
    plan = filtreSecuriteFinal(plan, preferences) || plan;
    res.json({ ok: true, source, seed, plan });
  } catch (e) {
    console.error('Erreur /api/plan :', e);
    res.status(500).json({ ok: false, error: 'Génération impossible : ' + (e && e.message ? e.message : 'erreur inconnue') });
  }
});

app.post('/api/meal', async (req, res) => {
  const { profil = {}, preferences = {}, creneau, kcalCible, exclureId, exclus = [] } = req.body || {};
  const seed = seedFromRequest(req.body);
  const exclusIds = Array.isArray(exclus) ? exclus : [];
  try {
    let recette;
    if (iaPourPlan()) {
      try {
        recette = await regenererRepasIA(profil, preferences, creneau, kcalCible, exclureId, seed);
      } catch (e) {
        console.warn('Régénération IA échouée, repli démo :', e.message);
        recette = regenererRepas(profil, preferences, creneau, kcalCible, exclureId, seed, exclusIds);
      }
    } else {
      recette = regenererRepas(profil, preferences, creneau, kcalCible, exclureId, seed, exclusIds);
    }
    res.json({ ok: true, recette });
  } catch (e) {
    console.error('Erreur /api/meal :', e);
    res.status(500).json({ ok: false, error: 'Remplacement impossible.' });
  }
});

const detailCache = new Map();
function cacheKey(nom, ingredients) {
  return nom + '|' + (ingredients || []).map((i) => `${i.quantite}${i.unite}${i.nom}`).join(';').toLowerCase();
}

app.post('/api/recipe-detail', async (req, res) => {
  const { nom, objectif, tempsMinutes, cuisines, ingredients } = req.body || {};
  if (!recettesIA()) return res.json({ ok: true, ia: false });
  if (!nom || !Array.isArray(ingredients) || !ingredients.length) {
    return res.status(400).json({ ok: false, error: 'Recette invalide.' });
  }
  const key = cacheKey(nom, ingredients);
  if (detailCache.has(key)) return res.json({ ok: true, ia: true, cached: true, detail: detailCache.get(key) });
  try {
    const detail = await genererRecetteDetail({ nom, objectif, tempsMinutes, cuisines, ingredients });
    detailCache.set(key, detail);
    res.json({ ok: true, ia: true, detail });
  } catch (e) {
    console.warn('Recette détaillée IA échouée :', e.message);
    res.json({ ok: true, ia: false, error: e.message });
  }
});

// ---------------------------------------------------------------------------
//  Comptes
// ---------------------------------------------------------------------------

// Connexion OU inscription : un seul appel (cf. lib/auth.js).
app.post('/account/login', (req, res) => {
  const { email, prenom, pin } = req.body || {};
  const r = auth.login({ email, prenom, pin });
  if (!r.ok) return res.status(r.status).json(r.body);
  const { token, expire } = auth.creerSession(r.email);
  const u = auth.findUser(r.email);
  res.json({ ...r.body, token, expire, compte: compteVisible(u) });
});

// Ce que le front reçoit d'un compte : jamais le hash du PIN, jamais les
// compteurs d'échec. Une seule fonction pour ne pas l'oublier quelque part.
function compteVisible(u) {
  if (!u) return null;
  return {
    email: u.email,
    prenom: u.prenom || '',
    avatarConfig: readJson(u.avatar_config, null),
    profil: readJson(u.profil, null),
    preferences: readJson(u.preferences, null),
    plan: readJson(u.plan, null),
    planMaj: u.plan_maj || null,
    admin: !!(ADMIN_EMAIL && normEmail(u.email) === ADMIN_EMAIL),
  };
}

app.get('/account/me', exigeCompte, (req, res) => {
  getDb().prepare('UPDATE users SET vu_le = ? WHERE email = ?').run(nowIso(), moi(req));
  res.json({ ok: true, compte: compteVisible(auth.findUser(moi(req))) });
});

// Sauvegarde serveur du profil / des préférences / du plan. Le front reste
// maître (il écrit d'abord en localStorage) : ici on ne fait que garder une
// copie pour retrouver son espace sur un autre appareil.
app.post('/account/save', exigeCompte, (req, res) => {
  const { profil, preferences, plan, prenom } = req.body || {};
  const db = getDb();
  if (prenom !== undefined) {
    db.prepare('UPDATE users SET prenom = ? WHERE email = ?').run(String(prenom || '').slice(0, 60), moi(req));
  }
  if (profil !== undefined) {
    db.prepare('UPDATE users SET profil = ? WHERE email = ?').run(JSON.stringify(profil || {}), moi(req));
  }
  if (preferences !== undefined) {
    db.prepare('UPDATE users SET preferences = ? WHERE email = ?').run(JSON.stringify(preferences || {}), moi(req));
  }
  if (plan !== undefined) {
    db.prepare('UPDATE users SET plan = ?, plan_maj = ? WHERE email = ?').run(JSON.stringify(plan || null), nowIso(), moi(req));
  }
  res.json({ ok: true });
});

app.post('/account/set-pin', exigeCompte, (req, res) => {
  const { ancien, nouveau } = req.body || {};
  const r = auth.changerPin(moi(req), ancien, nouveau);
  res.status(r.status).json(r.body);
});

app.post('/account/avatar-config', exigeCompte, (req, res) => {
  const cfg = (req.body || {}).config || {};
  getDb().prepare('UPDATE users SET avatar_config = ? WHERE email = ?').run(JSON.stringify(cfg), moi(req));
  res.json({ ok: true });
});

app.post('/account/logout', (req, res) => {
  if (req.token) auth.supprimerSession(req.token);
  res.json({ ok: true });
});

// Suppression du compte. Obligatoire quand on s'adresse au public (RGPD) et,
// sans coach à qui écrire, c'est le seul recours de l'utilisateur. ON DELETE
// CASCADE emporte pesées, mensurations, photos, adhérence, scans et analyses.
app.delete('/account', exigeCompte, (req, res) => {
  getDb().prepare('DELETE FROM users WHERE email = ?').run(moi(req));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
//  Progression personnelle (pesées, mensurations, photos)
//
//  Remplace l'onglet « Parcours » du Protocole 42. Là-bas, tout tournait autour
//  de trois jalons imposés (départ / semaine 3 / semaine 6) parce que la promo
//  durait 6 semaines. Ici on se pèse quand on veut : la courbe est libre.
// ---------------------------------------------------------------------------

const num = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));
const jourValide = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const aujourdhui = () => new Date().toISOString().slice(0, 10);

app.get('/api/progression', exigeCompte, (req, res) => {
  const db = getDb();
  const email = moi(req);
  const pesees = db.prepare('SELECT id, date, poids, masse_grasse AS masseGrasse, commentaire FROM pesees WHERE email = ? ORDER BY date ASC').all(email);
  const mensurations = db.prepare('SELECT id, date, taille, hanches, poitrine, bras, cuisse FROM mensurations WHERE email = ? ORDER BY date ASC').all(email);
  const photos = db.prepare('SELECT id, date, type FROM photos WHERE email = ? ORDER BY date ASC, id ASC').all(email);
  const adherence = db.prepare('SELECT date, suivi, adapte, autre, saute, score FROM adherence WHERE email = ? ORDER BY date DESC LIMIT 90').all(email);

  const premier = pesees[0] || null;
  const dernier = pesees[pesees.length - 1] || null;
  res.json({
    ok: true,
    progression: {
      pesees, mensurations, photos, adherence,
      depart: premier ? premier.poids : null,
      actuel: dernier ? dernier.poids : null,
      // Négatif = poids perdu. On ne qualifie pas : c'est au front de dire si
      // c'est « bien » selon l'objectif (prendre du muscle -> monter est normal).
      variation: (premier && dernier) ? Math.round((dernier.poids - premier.poids) * 10) / 10 : null,
    },
  });
});

app.post('/api/progression/pesee', exigeCompte, (req, res) => {
  const { date, poids, masseGrasse, commentaire } = req.body || {};
  const p = num(poids);
  if (p === null || p < 30 || p > 300) return res.status(400).json({ ok: false, error: 'Poids invalide.' });
  const d = jourValide(date) ? date : aujourdhui();
  getDb().prepare(`INSERT INTO pesees (email, date, poids, masse_grasse, commentaire, cree_le)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(email, date) DO UPDATE SET poids = excluded.poids,
                     masse_grasse = excluded.masse_grasse, commentaire = excluded.commentaire`)
    .run(moi(req), d, p, num(masseGrasse), String(commentaire || '').slice(0, 500), nowIso());
  res.json({ ok: true });
});

app.delete('/api/progression/pesee/:id', exigeCompte, (req, res) => {
  const info = getDb().prepare('DELETE FROM pesees WHERE id = ? AND email = ?').run(Number(req.params.id), moi(req));
  res.json({ ok: info.changes > 0 });
});

app.post('/api/progression/mensuration', exigeCompte, (req, res) => {
  const b = req.body || {};
  const d = jourValide(b.date) ? b.date : aujourdhui();
  const vals = ['taille', 'hanches', 'poitrine', 'bras', 'cuisse'].map((k) => num(b[k]));
  if (vals.every((v) => v === null)) return res.status(400).json({ ok: false, error: 'Aucune mesure renseignée.' });
  getDb().prepare(`INSERT INTO mensurations (email, date, taille, hanches, poitrine, bras, cuisse, cree_le)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(email, date) DO UPDATE SET taille = excluded.taille, hanches = excluded.hanches,
                     poitrine = excluded.poitrine, bras = excluded.bras, cuisse = excluded.cuisse`)
    .run(moi(req), d, ...vals, nowIso());
  res.json({ ok: true });
});

app.delete('/api/progression/mensuration/:id', exigeCompte, (req, res) => {
  const info = getDb().prepare('DELETE FROM mensurations WHERE id = ? AND email = ?').run(Number(req.params.id), moi(req));
  res.json({ ok: info.changes > 0 });
});

const PHOTO_TYPES = ['face', 'profil', 'dos', 'libre'];

app.post('/api/progression/photo', exigeCompte, (req, res) => {
  const { imageDataUrl, type, date } = req.body || {};
  const url = String(imageDataUrl || '');
  if (url.length > 5000000) return res.status(413).json({ ok: false, error: 'Photo trop lourde.' });
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(url);
  if (!m) return res.status(400).json({ ok: false, error: 'Format non supporté (jpg, png, webp).' });
  const info = getDb().prepare('INSERT INTO photos (email, date, type, mime, data, cree_le) VALUES (?, ?, ?, ?, ?, ?)')
    .run(moi(req), jourValide(date) ? date : aujourdhui(),
      PHOTO_TYPES.includes(type) ? type : 'libre', m[1], Buffer.from(m[2], 'base64'), nowIso());
  res.json({ ok: true, id: info.lastInsertRowid });
});

// Une photo corporelle n'est JAMAIS publique : jeton exigé, et la requête filtre
// sur l'email du porteur du jeton. Deviner un id ne donne donc rien.
app.get('/api/progression/photo/:id', exigeCompte, (req, res) => {
  const row = getDb().prepare('SELECT mime, data FROM photos WHERE id = ? AND email = ?').get(Number(req.params.id), moi(req));
  if (!row) return res.status(404).end();
  res.set('Content-Type', row.mime);
  res.set('Cache-Control', 'private, max-age=300');
  res.send(row.data);
});

app.delete('/api/progression/photo/:id', exigeCompte, (req, res) => {
  const info = getDb().prepare('DELETE FROM photos WHERE id = ? AND email = ?').run(Number(req.params.id), moi(req));
  res.json({ ok: info.changes > 0 });
});

// ---------------------------------------------------------------------------
//  Adhérence au plan
// ---------------------------------------------------------------------------

app.post('/api/adherence', exigeCompte, (req, res) => {
  const b = req.body || {};
  const d = jourValide(b.date) ? b.date : aujourdhui();
  const n = (v) => Math.max(0, Math.min(20, Number(v) || 0));
  getDb().prepare(`INSERT INTO adherence (email, date, suivi, adapte, autre, saute, score, maj_le)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(email, date) DO UPDATE SET suivi = excluded.suivi, adapte = excluded.adapte,
                     autre = excluded.autre, saute = excluded.saute, score = excluded.score, maj_le = excluded.maj_le`)
    .run(moi(req), d, n(b.suivi), n(b.adapte), n(b.autre), n(b.saute),
      Math.max(0, Math.min(100, Number(b.score) || 0)), nowIso());
  res.json({ ok: true });
});

app.get('/api/adherence', exigeCompte, (req, res) => {
  const rows = getDb().prepare('SELECT date, suivi, adapte, autre, saute, score FROM adherence WHERE email = ? ORDER BY date DESC LIMIT 120').all(moi(req));
  res.json({ ok: true, jours: rows });
});

// ---------------------------------------------------------------------------
//  SOS coach
// ---------------------------------------------------------------------------

// Réponses préenregistrées (gratuit, aucun appel IA). Première ligne de réponse :
// si une question-type correspond, inutile de payer un appel modèle.
app.post('/api/coach-faq/match', (req, res) => {
  try {
    const question = String((req.body || {}).question || '');
    if (question.trim().length < 2) return res.json({ ok: true, match: null });
    const rows = getDb().prepare('SELECT id, question, reponse, mots_cles, actif FROM coach_faq WHERE actif = 1').all();
    const m = coachFaq.matchFaq(question, rows);
    if (!m) return res.json({ ok: true, match: null });
    res.json({ ok: true, match: { id: m.row.id, question: m.row.question, reponse: m.row.reponse } });
  } catch (e) {
    console.error('coach-faq/match :', e);
    res.status(500).json({ ok: false, error: 'Recherche impossible.' });
  }
});

// Suggestions affichées en « chips » : uniquement des questions dont on SAIT
// qu'elles ont une réponse — proposer une question sans réponse serait pire que
// de ne rien proposer.
app.get('/api/coach-faq/suggest', (req, res) => {
  try {
    const rows = getDb().prepare('SELECT question FROM coach_faq WHERE actif = 1 ORDER BY ordre ASC, id ASC LIMIT 6').all();
    res.json({ ok: true, questions: rows.map((r) => r.question) });
  } catch (e) { res.json({ ok: true, questions: [] }); }
});

app.get('/api/coach-faq', exigeAdmin, (req, res) => {
  res.json({ ok: true, items: getDb().prepare('SELECT id, question, reponse, mots_cles, categorie, ordre, actif FROM coach_faq ORDER BY ordre ASC, id ASC').all() });
});

// Création (sans id) ou mise à jour (avec id).
app.post('/api/coach-faq', exigeAdmin, (req, res) => {
  const b = req.body || {};
  const question = String(b.question || '').trim();
  const reponse = String(b.reponse || '').trim();
  if (!question || !reponse) return res.status(400).json({ ok: false, error: 'Question et réponse requises.' });
  const mots = String(b.mots_cles || '').trim();
  const cat = String(b.categorie || '').trim().slice(0, 40);
  const ordre = Number.isFinite(Number(b.ordre)) ? Number(b.ordre) : 0;
  const actif = (b.actif === 0 || b.actif === false || b.actif === '0') ? 0 : 1;
  if (b.id) {
    getDb().prepare('UPDATE coach_faq SET question=?, reponse=?, mots_cles=?, categorie=?, ordre=?, actif=?, maj_le=? WHERE id=?')
      .run(question, reponse, mots, cat, ordre, actif, nowIso(), Number(b.id));
  } else {
    getDb().prepare('INSERT INTO coach_faq (question, reponse, mots_cles, categorie, ordre, actif, maj_le) VALUES (?,?,?,?,?,?,?)')
      .run(question, reponse, mots, cat, ordre, actif, nowIso());
  }
  res.json({ ok: true });
});

app.delete('/api/coach-faq/:id', exigeAdmin, (req, res) => {
  const info = getDb().prepare('DELETE FROM coach_faq WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: info.changes > 0 });
});

// Coach IA conversationnel. Sans clé -> ia:false, et le front bascule sur la FAQ.
app.post('/api/coach', async (req, res) => {
  if (!coachIaDisponible()) return res.json({ ok: false, ia: false });
  const { messages = [], contexte = '' } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ ok: false, error: 'Message manquant.' });
  }
  try {
    const reponse = await Promise.race([
      coachRepondre({ contexte, messages }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout coach (30s)')), 30000)),
    ]);
    if (!reponse) return res.status(502).json({ ok: false, error: 'Réponse vide.' });
    res.json({ ok: true, reponse });
  } catch (e) {
    console.warn('Coach IA échoué :', e && e.message);
    res.status(500).json({ ok: false, error: 'coach' });
  }
});

// ---------------------------------------------------------------------------
//  Scan de produits (code-barres) — le front interroge Open Food Facts
//  directement ; ici on ne fait que journaliser pour l'historique personnel.
// ---------------------------------------------------------------------------

app.post('/api/scan', exigeCompte, (req, res) => {
  const { barcode, productName, brand, produit, verdict } = req.body || {};
  getDb().prepare('INSERT INTO scans (email, code, nom, marque, produit, verdict, cree_le) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(moi(req), String(barcode || '').slice(0, 40), String(productName || '').slice(0, 200),
      String(brand || '').slice(0, 120), produit ? JSON.stringify(produit).slice(0, 20000) : null,
      String(verdict || '').slice(0, 40), nowIso());
  res.json({ ok: true });
});

app.get('/api/scans', exigeCompte, (req, res) => {
  const rows = getDb().prepare('SELECT id, code, nom, marque, verdict, cree_le AS creeLe FROM scans WHERE email = ? ORDER BY id DESC LIMIT 60').all(moi(req));
  res.json({ ok: true, scans: rows });
});

// ---------------------------------------------------------------------------
//  Analyse d'assiette (photo -> estimation IA)
// ---------------------------------------------------------------------------

app.post('/api/plate-analyze', async (req, res) => {
  const { imageDataUrl, precision, objectif, planContext } = req.body || {};
  if (!iaDisponible()) return res.json({ ok: true, ia: false });
  if (!imageDataUrl || typeof imageDataUrl !== 'string' || imageDataUrl.length < 100) {
    return res.status(400).json({ ok: false, error: 'Photo manquante.' });
  }
  try {
    const analyse = await analyserAssietteIA({
      imageDataUrl,
      precision: String(precision || '').slice(0, 300),
      objectif,
      planContext: String(planContext || '').slice(0, 160),
    });
    res.json({ ok: true, ia: true, analyse });
  } catch (e) {
    console.warn('Analyse assiette échouée :', e.message);
    res.json({ ok: false, ia: true, error: 'analyse' });
  }
});

app.post('/api/plate-save', exigeCompte, (req, res) => {
  const { analyse, imageDataUrl } = req.body || {};
  if (!analyse) return res.status(400).json({ ok: false, error: 'Analyse manquante.' });
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(String(imageDataUrl || ''));
  const info = getDb().prepare('INSERT INTO plate_analyses (email, analyse, mime, image, cree_le) VALUES (?, ?, ?, ?, ?)')
    .run(moi(req), JSON.stringify(analyse).slice(0, 20000), m ? m[1] : null,
      m ? Buffer.from(m[2], 'base64') : null, nowIso());
  res.json({ ok: true, id: info.lastInsertRowid });
});

app.get('/api/plate-analyses', exigeCompte, (req, res) => {
  const rows = getDb().prepare('SELECT id, analyse, cree_le AS creeLe FROM plate_analyses WHERE email = ? ORDER BY id DESC LIMIT 40').all(moi(req));
  res.json({ ok: true, analyses: rows.map((r) => ({ id: r.id, creeLe: r.creeLe, analyse: readJson(r.analyse, {}) })) });
});

// ---------------------------------------------------------------------------
//  Photos de plats (illustration des recettes)
//
//  Le catalogue de recettes ne porte pas d'image : les photos sont ajoutées en
//  base. Sans admin configuré, l'index est simplement vide et le front affiche
//  les recettes sans visuel (le <img> se retire tout seul sur erreur).
// ---------------------------------------------------------------------------

app.get('/api/recipe-photos-index', (req, res) => {
  try {
    const photos = {};
    getDb().prepare('SELECT recipe_id, updated_at FROM recipe_photos').all()
      .forEach((r) => { photos[r.recipe_id] = r.updated_at || '1'; });
    res.set('Cache-Control', 'no-cache');
    res.json({ ok: true, photos });
  } catch (e) { res.json({ ok: true, photos: {} }); }
});

// PUBLIC : un <img> n'envoie pas de jeton. Sans conséquence — une photo de plat
// n'est pas une donnée personnelle (contrairement aux photos de progression).
app.get('/api/recipe-photo/:id', (req, res) => {
  try {
    const row = getDb().prepare('SELECT mime, data FROM recipe_photos WHERE recipe_id = ?').get(String(req.params.id));
    if (!row) return res.status(404).end();
    res.set('Content-Type', row.mime);
    res.set('Cache-Control', 'public, max-age=300');
    res.send(row.data);
  } catch (e) { res.status(404).end(); }
});

app.get('/api/recipes-list', exigeAdmin, (req, res) => {
  const { RECIPES } = require('./lib/recipes-v2');
  const avec = new Set(getDb().prepare('SELECT recipe_id FROM recipe_photos').all().map((r) => r.recipe_id));
  res.json({
    ok: true, total: RECIPES.length,
    recipes: RECIPES.map((r) => ({ id: r.id, nom: r.nom, type: r.type, cuisines: r.cuisines || [], hasPhoto: avec.has(r.id) })),
  });
});

app.post('/api/recipes/:id/photo', exigeAdmin, (req, res) => {
  const { RECIPES } = require('./lib/recipes-v2');
  const id = String(req.params.id);
  if (!RECIPES.some((r) => r.id === id)) return res.status(404).json({ ok: false, error: 'Plat inconnu.' });
  const url = String((req.body || {}).imageDataUrl || '');
  if (url.length > 3000000) return res.status(413).json({ ok: false, error: 'Image trop lourde (compresse-la).' });
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(url);
  if (!m) return res.status(400).json({ ok: false, error: 'Format non supporté (jpg, png, webp).' });
  const now = nowIso();
  getDb().prepare(`INSERT INTO recipe_photos (recipe_id, mime, data, updated_at) VALUES (?, ?, ?, ?)
                   ON CONFLICT(recipe_id) DO UPDATE SET mime = excluded.mime, data = excluded.data, updated_at = excluded.updated_at`)
    .run(id, m[1], Buffer.from(m[2], 'base64'), now);
  res.json({ ok: true, updatedAt: now });
});

app.delete('/api/recipes/:id/photo', exigeAdmin, (req, res) => {
  const info = getDb().prepare('DELETE FROM recipe_photos WHERE recipe_id = ?').run(String(req.params.id));
  res.json({ ok: info.changes > 0 });
});

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
//  Boost Nutrition — monté ICI, juste avant le filet /api 404 : plus haut il
//  masquerait des routes existantes, plus bas il serait avalé par le 404.
// ---------------------------------------------------------------------------
app.use(creerRoutesBoost({ boost, seances, exigeCompte, exigeAdmin }));
app.use(creerRoutesAcademy({ academy, qcm: academyQcm, pratique: academyPratique,
  certifications: academyCertifications, exigeCompte, exigeAdmin, estAdmin }));

// Toute route /api inconnue répond en JSON : sinon Express renvoie du HTML et le
// front, qui fait systématiquement res.json(), échoue avec une erreur illisible.
app.use('/api', (req, res) => res.status(404).json({ ok: false, error: 'Route inconnue.' }));

// ---------------------------------------------------------------------------
//  Réinitialisation du PIN administrateur — PIN oublié, sans coach pour aider.
//
//  Volontairement PAS une route HTTP : un « reset sans l'ancien PIN » accessible
//  par le web serait une porte dérobée, quelle que soit sa protection. On ancre
//  donc le reset là où se définit déjà QUI est admin : les variables
//  d'environnement du déploiement. Poser ADMIN_PIN_RESET exige le même niveau
//  de contrôle que changer ADMIN_EMAIL — on n'élargit rien.
//
//  Usage : poser ADMIN_PIN_RESET=<nouveau code 4-6 chiffres> (Railway ->
//  Variables), redéployer, se reconnecter avec le nouveau code, puis RETIRER la
//  variable. Elle est appliquée à CHAQUE démarrage tant qu'elle reste posée
//  (idempotent, mais le code traînerait en clair dans la config) — d'où
//  l'avertissement insistant dans les logs.
//
//  Périmètre strict : le seul compte ADMIN_EMAIL, et seulement ses colonnes
//  d'authentification (pin_hash, compteur d'échecs, temporisation) + ses
//  sessions. Ni les autres comptes, ni le profil/plan/photos de l'admin.
//  Les sessions sont révoquées comme à tout changement de secret : si le reset
//  est fait parce que le compte est soupçonné compromis, une session volée ne
//  doit pas y survivre. Il suffit de se reconnecter avec le nouveau code.
// ---------------------------------------------------------------------------
function appliquerResetPinAdmin() {
  const voulu = String(process.env.ADMIN_PIN_RESET || '').trim();
  if (!voulu) return false;
  if (!ADMIN_EMAIL) {
    console.warn('⚠️  ADMIN_PIN_RESET est posé mais ADMIN_EMAIL est vide : ignoré.');
    return false;
  }
  if (!PIN_RE.test(voulu)) {
    console.warn('⚠️  ADMIN_PIN_RESET ignoré : le code doit faire 4 à 6 chiffres.');
    return false;
  }
  const db = getDb();
  const existe = db.prepare('SELECT email FROM users WHERE email = ?').get(ADMIN_EMAIL);
  if (!existe) {
    console.warn(`⚠️  ADMIN_PIN_RESET ignoré : le compte ${ADMIN_EMAIL} n'existe pas encore.` +
      ' Une première connexion dans l\'app le créera (elle choisit son PIN à ce moment-là).');
    return false;
  }
  db.prepare('UPDATE users SET pin_hash = ?, pin_fails = 0, bloque = 0 WHERE email = ?')
    .run(hashPin(voulu), ADMIN_EMAIL);
  db.prepare('DELETE FROM sessions WHERE email = ?').run(ADMIN_EMAIL);
  console.warn(`⚠️  PIN administrateur RÉINITIALISÉ pour ${ADMIN_EMAIL} (sessions révoquées).`);
  console.warn('⚠️  RETIRE la variable ADMIN_PIN_RESET maintenant : tant qu\'elle reste posée,');
  console.warn('⚠️  le code est en clair dans la config et réappliqué à chaque démarrage.');
  return true;
}

// ---------------------------------------------------------------------------
//  Amorçage des photos de plats depuis une app source (PHOTOS_SOURCE_URL).
//
//  Même rôle que tools/importer-photos.js, mais exécuté PAR LE SERVEUR à son
//  démarrage : indispensable quand l'import ne peut pas être lancé d'ailleurs
//  (poste sans accès, environnement au réseau restreint). Le serveur va chercher
//  lui-même les photos manquantes sur les routes PUBLIQUES de la source
//  (/api/recipe-photos-index, /api/recipe-photo/:id) et les écrit dans SA table
//  recipe_photos — aucun identifiant requis, aucune autre table touchée.
//
//  Idempotent et auto-réparant : à chaque démarrage, seule la différence
//  (photos de la source absentes ici) est importée ; si rien ne manque, un seul
//  appel d'index et c'est fini. Laisser la variable posée est donc sans danger ;
//  la retirer arrête simplement la synchronisation.
//
//  Lancé APRÈS l'écoute, en tâche de fond : une source lente ou injoignable ne
//  doit jamais retarder ni empêcher le démarrage de l'app.
// ---------------------------------------------------------------------------
const PHOTO_IMPORT_MAX_OCTETS = 3 * 1024 * 1024; // parité avec la route admin
async function importerPhotosDepuisSource() {
  const src = String(process.env.PHOTOS_SOURCE_URL || '').trim().replace(/\/+$/, '');
  if (!src) return null;
  const bilan = { importees: 0, deja: 0, sautees: 0, echecs: 0 };
  try {
    const idx = await (await fetch(src + '/api/recipe-photos-index')).json();
    if (!idx || !idx.ok) throw new Error('index illisible');
    const db = getDb();
    const { RECIPES } = require('./lib/recipes-v2');
    const catalogue = new Set(RECIPES.map((r) => r.id));
    const locales = new Set(db.prepare('SELECT recipe_id FROM recipe_photos').all().map((r) => r.recipe_id));
    const manquantes = Object.keys(idx.photos || {}).filter((id) => catalogue.has(id) && !locales.has(id));
    bilan.deja = locales.size;
    if (!manquantes.length) {
      console.log(`Photos de plats : rien à importer (${locales.size} en base, source alignée).`);
      return bilan;
    }
    console.log(`Photos de plats : import de ${manquantes.length} photo(s) depuis ${src}…`);
    const ins = db.prepare(`INSERT INTO recipe_photos (recipe_id, mime, data, updated_at) VALUES (?, ?, ?, ?)
                            ON CONFLICT(recipe_id) DO NOTHING`);
    // En séquentiel : on est l'invité d'un serveur de production.
    for (const id of manquantes) {
      try {
        const res = await fetch(src + '/api/recipe-photo/' + encodeURIComponent(id));
        if (!res.ok) { bilan.echecs++; continue; }
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > PHOTO_IMPORT_MAX_OCTETS) { bilan.sautees++; continue; }
        ins.run(id, res.headers.get('content-type') || 'image/jpeg', buf, nowIso());
        bilan.importees++;
        if (bilan.importees % 50 === 0) console.log(`  … ${bilan.importees}/${manquantes.length}`);
      } catch (_) { bilan.echecs++; }
    }
    const total = db.prepare('SELECT COUNT(*) AS n FROM recipe_photos').get().n;
    console.log(`Photos de plats : ${bilan.importees} importée(s), ${bilan.sautees} sautée(s) (trop lourdes), ` +
      `${bilan.echecs} échec(s). Total en base : ${total}.`);
  } catch (e) {
    console.warn('Photos de plats : import impossible pour le moment (' + e.message + '). ' +
      'L\'app fonctionne normalement ; nouvel essai au prochain démarrage.');
  }
  return bilan;
}

if (require.main === module) {
  // getDb() crée le schéma au premier appel ; amorcerFaq() complète la base de
  // réponses. Les deux sont idempotents : redémarrer ne duplique rien.
  const ajout = amorcerFaq();
  if (ajout) console.log(`  FAQ coach : ${ajout} réponses ajoutées.`);
  appliquerResetPinAdmin();
  // L'état de la synchronisation photos est dit AU BOOT, inconditionnellement :
  // « aucune ligne dans les logs » ne doit plus pouvoir signifier à la fois
  // « variable absente » et « code pas déployé » — c'est précisément l'ambiguïté
  // qui a rendu un déploiement en retard indiagnosticable depuis les logs.
  if (String(process.env.PHOTOS_SOURCE_URL || '').trim()) {
    console.log(`  Photos     : synchronisation depuis ${String(process.env.PHOTOS_SOURCE_URL).trim()} (démarre dans 1,5 s)`);
  } else {
    console.log('  Photos     : PHOTOS_SOURCE_URL non définie — pas de synchronisation au démarrage');
  }
  // En tâche de fond, une fois le serveur prêt à répondre.
  setTimeout(() => { importerPhotosDepuisSource(); }, 1500);
  app.listen(PORT, () => {
    const mode = iaDisponible() ? 'IA (Claude)' : 'DÉMO (recettes locales)';
    console.log(`\n  ${APP_NOM}`);
    console.log(`  -> http://localhost:${PORT}`);
    console.log(`  Génération : ${mode}`);
    console.log(`  Coach IA   : ${coachIaDisponible() ? 'actif' : 'inactif (FAQ seule)'}`);
    console.log(`  Base       : ${require('./lib/db').dbPath()}\n`);
  });
}

// La FAQ livrée avec le module sert de socle : sans elle, le SOS coach serait
// muet tant que l'IA n'est pas branchée. On n'insère que les questions absentes,
// pour ne jamais écraser ce que l'administrateur a réécrit à la main.
function amorcerFaq() {
  const db = getDb();
  const { COACH_FAQ_SEED } = coachFaq;
  const existe = db.prepare('SELECT 1 FROM coach_faq WHERE question = ?');
  const ins = db.prepare('INSERT INTO coach_faq (question, reponse, mots_cles, categorie, ordre, maj_le) VALUES (?,?,?,?,?,?)');
  let ajout = 0;
  db.transaction(() => {
    COACH_FAQ_SEED.forEach((e, i) => {
      if (existe.get(e.q)) return;
      ins.run(e.q, e.r, e.k || '', e.c || '', i + 1, nowIso());
      ajout++;
    });
  })();
  return ajout;
}

module.exports = app;
module.exports.boost = boost;
module.exports.seances = seances;
module.exports.academy = academy;
module.exports.academyQcm = academyQcm;
module.exports.academyPratique = academyPratique;
module.exports.academyCertifications = academyCertifications;
module.exports.academyFormations = academyFormations;
module.exports.amorcerFaq = amorcerFaq;
module.exports.appliquerResetPinAdmin = appliquerResetPinAdmin;
module.exports.importerPhotosDepuisSource = importerPhotosDepuisSource;
