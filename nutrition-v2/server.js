'use strict';
// ============================================================================
//  SERVEUR — My Coach Nutrition v2 (refonte MVP, écrans Stitch).
//
//  Périmètre MVP, décidé le 30/09/2026 :
//   - le calcul des besoins et la génération du plan de repas ;
//   - la liste de courses et son catalogue d'ingrédients ;
//   - la base de données et les comptes (connexion par lien magique).
//
//  Moteur repris À L'IDENTIQUE de nutrition-solo (lib/nutrition.js,
//  lib/planGenerator.js, lib/recipes-v2.js, public/courses*.js). Tout le reste
//  (suivi, scan, assiette, coach IA, FAQ, avatar, PIN) est volontairement absent.
// ============================================================================

try {
  require('dotenv').config({ path: require('path').join(__dirname, '.env'), override: true });
} catch (_) { /* dotenv facultatif */ }

const path = require('path');
const express = require('express');

const { calculerBesoins } = require('./lib/nutrition');
const { genererPlanDemo, regenererRepas, recettesCompatibles } = require('./lib/planGenerator');
const { RECIPES } = require('./lib/recipes-v2');
const { getDb, nowIso, readJson } = require('./lib/db');
const { createAuth, normEmail, LIEN_MINUTES } = require('./lib/auth');
const { envoyerLienMagique, smtpConfigure } = require('./lib/mailer');

const APP_NOM = process.env.APP_NOM || 'My Coach Nutrition';
const PORT = process.env.PORT || 3000;
const PROD = process.env.NODE_ENV === 'production';
// URL publique de l'app (ex. https://app.stanmartinapp.cloud/nutrition-v2/).
// Sert à construire le lien magique : sans elle, on reprend l'adresse de la page
// qui a fait la demande, à condition qu'elle soit sur le même hôte.
const PUBLIC_URL = String(process.env.PUBLIC_URL || '').trim();

const auth = createAuth({ getDb, nowIso });
const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '1mb' }));

app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) res.setHeader('Cache-Control', 'no-cache');
    else res.setHeader('Cache-Control', 'public, max-age=86400');
  },
}));

// --- Session ---------------------------------------------------------------
app.use((req, _res, next) => {
  const h = String(req.headers.authorization || '');
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const s = token ? auth.lireSession(token) : null;
  if (s) {
    const u = auth.findUser(s.email);
    if (u) { req.user = u; req.token = token; }
  }
  next();
});
function exigeCompte(req, res, next) {
  if (!req.user) return res.status(401).json({ ok: false, noAccount: true, error: 'Connexion requise.' });
  next();
}
const moi = (req) => normEmail(req.user.email);

// --- Moteur : besoins, plan, remplacement d'un repas -------------------------
function seedFromRequest(body) {
  if (body && Number.isFinite(Number(body.seed))) return Number(body.seed);
  return Math.floor(Date.now() % 2147483646) + 1;
}

// Filet de sécurité : retire toute recette incompatible (allergies, régime…).
function filtreSecuriteFinal(plan, prefs) {
  if (!plan || !Array.isArray(plan.jours)) return plan;
  const ids = new Set(recettesCompatibles(RECIPES, prefs).map((r) => r.id));
  let retirees = 0;
  for (const jour of plan.jours) {
    for (const repas of jour.repas || []) {
      if (repas.recette && ids.size && !ids.has(repas.recette.id)) { repas.recette = null; retirees++; }
    }
  }
  if (retirees) plan.avertissementSecurite = `${retirees} repas retiré(s) par sécurité.`;
  return plan;
}

app.get('/api/status', (req, res) => {
  res.json({ ok: true, app: APP_NOM, connecte: !!req.user, email: smtpConfigure() ? 'smtp' : (PROD ? 'absent' : 'dev') });
});

app.post('/api/needs', (req, res) => {
  try { res.json({ ok: true, besoins: calculerBesoins(req.body || {}) }); } catch (e) { res.status(400).json({ ok: false, error: 'Profil invalide.' }); }
});

app.post('/api/plan', (req, res) => {
  const { profil = {}, preferences = {} } = req.body || {};
  const seed = seedFromRequest(req.body);
  try {
    const plan = filtreSecuriteFinal(genererPlanDemo(profil, preferences, seed), preferences);
    res.json({ ok: true, seed, plan });
  } catch (e) {
    console.error('Erreur /api/plan :', e);
    res.status(500).json({ ok: false, error: 'Génération impossible.' });
  }
});

app.post('/api/meal', (req, res) => {
  const { profil = {}, preferences = {}, creneau, kcalCible, exclureId, exclus = [] } = req.body || {};
  try {
    const recette = regenererRepas(profil, preferences, creneau, kcalCible, exclureId, seedFromRequest(req.body), Array.isArray(exclus) ? exclus : []);
    res.json({ ok: true, recette });
  } catch (e) {
    console.error('Erreur /api/meal :', e);
    res.status(500).json({ ok: false, error: 'Remplacement impossible.' });
  }
});

// --- Comptes : lien magique ----------------------------------------------------
function baseUrlPour(req) {
  if (PUBLIC_URL) return PUBLIC_URL.replace(/\/?$/, '/');
  // Pas d'URL configurée : on reprend la page appelante si elle est sur le même hôte.
  const page = String((req.body || {}).page || '');
  try {
    const u = new URL(page);
    if (u.host === req.get('host')) return u.origin + u.pathname.replace(/[^/]*$/, '');
  } catch (_) { /* page absente ou invalide */ }
  return `${req.protocol}://${req.get('host')}/`;
}

app.post('/account/request-link', async (req, res) => {
  const r = auth.demanderLien((req.body || {}).email);
  if (!r.ok) return res.status(r.status).json({ ok: false, error: r.error });
  const lien = baseUrlPour(req) + '?lien=' + encodeURIComponent(r.token);
  try {
    const envoi = await envoyerLienMagique({ to: r.email, lien, minutes: LIEN_MINUTES, appNom: APP_NOM });
    if (envoi.simule) {
      if (PROD) return res.status(503).json({ ok: false, error: 'L\'envoi d\'e-mails n\'est pas encore configuré. Contacte ton coach.' });
      // Développement uniquement : le lien est rendu au navigateur pour tester sans boîte mail.
      return res.json({ ok: true, email: r.email, minutes: LIEN_MINUTES, lienDev: lien });
    }
    res.json({ ok: true, email: r.email, minutes: LIEN_MINUTES });
  } catch (e) {
    console.error('Envoi du lien magique impossible :', e && e.message);
    res.status(502).json({ ok: false, error: 'L\'e-mail n\'a pas pu partir. Réessaie dans un instant.' });
  }
});

// Appelé par le front quand la page est ouverte depuis le lien (?lien=…). Un POST
// et non un GET : les antivirus de messagerie qui « visitent » les liens ne
// consomment ainsi pas le jeton à la place de l'utilisateur.
app.post('/account/verify', (req, res) => {
  const r = auth.consommerLien((req.body || {}).token);
  if (!r.ok) return res.status(400).json({ ok: false, error: r.error });
  const { token, expire } = auth.creerSession(r.email);
  res.json({ ok: true, token, expire, compte: compteVisible(auth.findUser(r.email)) });
});

function compteVisible(u) {
  if (!u) return null;
  return {
    email: u.email,
    prenom: u.prenom || '',
    profil: readJson(u.profil, null),
    preferences: readJson(u.preferences, null),
    plan: readJson(u.plan, null),
    planMaj: u.plan_maj || null,
  };
}

app.get('/account/me', exigeCompte, (req, res) => {
  getDb().prepare('UPDATE users SET vu_le = ? WHERE email = ?').run(nowIso(), moi(req));
  res.json({ ok: true, compte: compteVisible(auth.findUser(moi(req))) });
});

app.post('/account/save', exigeCompte, (req, res) => {
  const { profil, preferences, plan, prenom } = req.body || {};
  const db = getDb();
  if (prenom !== undefined) db.prepare('UPDATE users SET prenom = ? WHERE email = ?').run(String(prenom || '').slice(0, 60), moi(req));
  if (profil !== undefined) db.prepare('UPDATE users SET profil = ? WHERE email = ?').run(JSON.stringify(profil || {}), moi(req));
  if (preferences !== undefined) db.prepare('UPDATE users SET preferences = ? WHERE email = ?').run(JSON.stringify(preferences || {}), moi(req));
  if (plan !== undefined) db.prepare('UPDATE users SET plan = ?, plan_maj = ? WHERE email = ?').run(JSON.stringify(plan || null), nowIso(), moi(req));
  res.json({ ok: true });
});

app.post('/account/logout', (req, res) => {
  if (req.token) auth.supprimerSession(req.token);
  res.json({ ok: true });
});

// RGPD : suppression du compte et de tout ce qui s'y rattache.
app.delete('/account', exigeCompte, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM magic_links WHERE email = ?').run(moi(req));
  db.prepare('DELETE FROM users WHERE email = ?').run(moi(req));
  res.json({ ok: true });
});

// --- Photos de plats (publiques : ce ne sont pas des données personnelles) ----
app.get('/api/recipe-photos-index', (req, res) => {
  try {
    const photos = {};
    getDb().prepare('SELECT recipe_id, updated_at FROM recipe_photos').all().forEach((r) => { photos[r.recipe_id] = r.updated_at || '1'; });
    res.set('Cache-Control', 'no-cache');
    res.json({ ok: true, photos });
  } catch (e) { res.json({ ok: true, photos: {} }); }
});

app.get('/api/recipe-photo/:id', (req, res) => {
  try {
    const row = getDb().prepare('SELECT mime, data FROM recipe_photos WHERE recipe_id = ?').get(String(req.params.id));
    if (!row) return res.status(404).end();
    res.set('Content-Type', row.mime);
    res.set('Cache-Control', 'public, max-age=300');
    res.send(row.data);
  } catch (e) { res.status(404).end(); }
});

app.use('/api', (req, res) => res.status(404).json({ ok: false, error: 'Route inconnue.' }));

// --- Import des photos de plats depuis une app source (PHOTOS_SOURCE_URL) -----
// Repris de nutrition-solo : au démarrage, importe les photos MANQUANTES depuis
// les routes publiques de la source. Idempotent, en tâche de fond.
async function importerPhotosDepuisSource() {
  const src = String(process.env.PHOTOS_SOURCE_URL || '').trim().replace(/\/+$/, '');
  if (!src) return null;
  const bilan = { importees: 0, echecs: 0 };
  try {
    const idx = await (await fetch(src + '/api/recipe-photos-index')).json();
    if (!idx || !idx.ok) throw new Error('index illisible');
    const db = getDb();
    const catalogue = new Set(RECIPES.map((r) => r.id));
    const locales = new Set(db.prepare('SELECT recipe_id FROM recipe_photos').all().map((r) => r.recipe_id));
    const manquantes = Object.keys(idx.photos || {}).filter((id) => catalogue.has(id) && !locales.has(id));
    const ins = db.prepare('INSERT INTO recipe_photos (recipe_id, mime, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(recipe_id) DO NOTHING');
    for (const id of manquantes) {
      try {
        const r = await fetch(src + '/api/recipe-photo/' + encodeURIComponent(id));
        if (!r.ok) { bilan.echecs++; continue; }
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > 3 * 1024 * 1024) continue;
        ins.run(id, r.headers.get('content-type') || 'image/jpeg', buf, nowIso());
        bilan.importees++;
      } catch (_) { bilan.echecs++; }
    }
    console.log(`Photos de plats : ${bilan.importees} importée(s), ${bilan.echecs} échec(s).`);
  } catch (e) {
    console.warn('Photos de plats : import impossible pour le moment (' + e.message + ').');
  }
  return bilan;
}

if (require.main === module) {
  getDb();
  setTimeout(() => { importerPhotosDepuisSource(); }, 1500);
  app.listen(PORT, () => {
    console.log(`\n  ${APP_NOM} v2 -> http://localhost:${PORT}`);
    console.log(`  E-mails : ${smtpConfigure() ? 'SMTP configuré' : (PROD ? '⚠️ SMTP ABSENT — connexion impossible' : 'mode dev (lien affiché dans les logs et à l\'écran)')}`);
    console.log(`  Base    : ${require('./lib/db').dbPath()}\n`);
  });
}

module.exports = app;
module.exports.importerPhotosDepuisSource = importerPhotosDepuisSource;
