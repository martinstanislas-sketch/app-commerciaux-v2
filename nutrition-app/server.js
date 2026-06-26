// server.js
// My Coach Nutrition - serveur Express.
// Sert le front statique + une petite API de generation de plans.
// Sans ANTHROPIC_API_KEY -> mode DEMO (recettes locales). Avec cle -> Claude.

// Charge .env (depuis le dossier de ce fichier, quel que soit le cwd) si dotenv est installe.
// override:true -> la config NUTRITION du module (cle, modele, NUTRITION_AI) prime
// sur d'eventuelles valeurs deja presentes dans l'environnement (ex. placeholder du
// .env racine). En prod (pas de .env ici), sans effet : on utilise les vars Railway.
try {
  require('dotenv').config({ path: require('path').join(__dirname, '.env'), override: true });
} catch (_) {
  /* dotenv non installe : on lit process.env directement */
}

const path = require('path');
const express = require('express');

const { calculerBesoins, calculerAjustementHebdo } = require('./lib/nutrition');
const {
  genererPlanDemo,
  regenererRepas,
  recettesCompatibles,
  familiesFromUserAllergies,
} = require('./lib/planGenerator');
const { genererPlanIA, regenererRepasIA, genererRecetteDetail, analyserAssietteIA, iaDisponible } = require('./lib/aiGenerator');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

// Petite graine pseudo-aleatoire basee sur l'heure, transmise au generateur
// pour que chaque clic "Nouveau plan" varie sans casser le determinisme interne.
function seedFromRequest(body) {
  if (body && Number.isFinite(Number(body.seed))) return Number(body.seed);
  return Math.floor(Date.now() % 2147483646) + 1;
}

// CEINTURE + BRETELLES : retire toute recette qui contiendrait malgre tout un
// allergene/aliment interdit (utile surtout pour les sorties IA).
function filtreSecuriteFinal(plan, prefs) {
  if (!plan || !Array.isArray(plan.jours)) return plan;
  const compatiblesIds = new Set(recettesCompatibles(require('./lib/recipes-v2').RECIPES, prefs).map((r) => r.id));
  const familles = familiesFromUserAllergies(prefs.allergies);
  let retirees = 0;
  for (const jour of plan.jours || []) {
    for (const repas of jour.repas || []) {
      const r = repas.recette;
      if (!r) continue;
      // Si la recette vient du catalogue local et n'est pas compatible -> on coupe.
      if (r.id && compatiblesIds.size && !compatiblesIds.has(r.id) && !String(r.id).startsWith('ia-')) {
        repas.recette = null;
        retirees++;
      }
    }
  }
  if (retirees) plan.avertissementSecurite = `${retirees} repas retire(s) par securite.`;
  return plan;
}

// --- API ---

// Besoins caloriques seuls (testable sans generation de plan).
app.post('/api/needs', (req, res) => {
  try {
    const besoins = calculerBesoins(req.body || {});
    res.json({ ok: true, besoins });
  } catch (e) {
    res.status(400).json({ ok: false, error: 'Profil invalide.' });
  }
});

// Ajustement hebdomadaire (Challenge 6/6) a partir de l'historique de pesee.
app.post('/api/ajustement', (req, res) => {
  try {
    const { pesees = [], deficit = 650, sexe = 'autre', fatigue = false } = req.body || {};
    const ajustement = calculerAjustementHebdo(pesees, { deficit, sexe, fatigue });
    res.json({ ok: true, ajustement });
  } catch (e) {
    res.status(400).json({ ok: false, error: 'Donnees de pesee invalides.' });
  }
});

// Generation du PLAN par l'IA : opt-in distinct (NUTRITION_AI_PLAN=on).
// Par defaut OFF -> les plans viennent de la banque curatee (avec photos),
// meme quand Claude est actif pour les recettes guidees detaillees.
function iaPourPlan() {
  const opt = ['on', '1', 'true', 'yes'].includes(String(process.env.NUTRITION_AI_PLAN || '').toLowerCase());
  return iaDisponible() && opt;
}

// Genere un plan complet de la semaine.
app.post('/api/plan', async (req, res) => {
  const { profil = {}, preferences = {} } = req.body || {};
  const seed = seedFromRequest(req.body);
  try {
    let plan = null;
    let source = 'demo';
    // 1. Tentative IA (si activee). Toute defaillance -> repli demo, jamais d'erreur.
    if (iaPourPlan()) {
      try {
        // Borne le temps IA (sinon un appel lent peut depasser le timeout du proxy
        // -> erreur cote client). Au-dela -> repli demo instantane.
        plan = await Promise.race([
          genererPlanIA(profil, preferences, seed),
          new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout generation IA (22s)')), 22000)),
        ]);
        if (!plan || !Array.isArray(plan.jours) || !plan.jours.length) throw new Error('Plan IA vide');
        source = 'ia';
      } catch (e) {
        console.warn('Generation IA echouee, repli sur le mode demo :', e && e.message);
        plan = null;
        source = 'demo-repli';
      }
    }
    // 2. Repli/mode demo (hors du catch IA pour ne jamais double-fauter).
    if (!plan) {
      plan = genererPlanDemo(profil, preferences, seed);
      if (source !== 'demo-repli') source = 'demo';
    }
    plan = filtreSecuriteFinal(plan, preferences) || plan;
    res.json({ ok: true, source, seed, plan });
  } catch (e) {
    console.error('Erreur /api/plan :', e);
    res.status(500).json({ ok: false, error: 'Generation impossible : ' + (e && e.message ? e.message : 'erreur inconnue') });
  }
});

// Regenere UN repas precis.
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
        console.warn('Regeneration IA echouee, repli demo :', e.message);
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

// Cache memoire des recettes detaillees (cle = nom + ingredients).
const detailCache = new Map();
function cacheKey(nom, ingredients) {
  return nom + '|' + (ingredients || []).map((i) => `${i.quantite}${i.unite}${i.nom}`).join(';').toLowerCase();
}

// Enrichissement des recettes par Claude : opt-in SEPARE (NUTRITION_AI_RECIPES=on).
// Par defaut OFF meme si NUTRITION_AI est actif -> les recettes restent sur la
// fiche guidee LOCALE (gratuite, deja complete) et Claude est reserve a l'analyse
// d'assiette. Maitrise du cout.
function recettesIA() {
  return iaDisponible() && ['on', '1', 'true', 'yes'].includes(String(process.env.NUTRITION_AI_RECIPES || '').toLowerCase());
}

// Recette guidee detaillee, reconstruite a partir des ingredients ACTUELS.
// Si l'IA est coupee, renvoie ia:false -> le front garde la fiche locale.
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
    console.warn('Recette detaillee IA echouee :', e.message);
    res.json({ ok: true, ia: false, error: e.message });
  }
});

// Analyse d'une assiette en photo (Claude vision) : ESTIMATION, pas calcul exact.
// 1 seul appel IA ; les ajustements de portion sont recalcules cote front.
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
    console.warn('Analyse assiette echouee :', e.message);
    res.json({ ok: false, ia: true, error: 'analyse' });
  }
});

// Indique au front si l'IA est active (pour un petit badge).
app.get('/api/status', (req, res) => {
  res.json({ ok: true, ia: iaDisponible(), demo: !iaDisponible() });
});

// Demarre un serveur autonome UNIQUEMENT si ce fichier est lance directement
// (node server.js). Quand il est require() par l'app principale pour etre monte
// sous /nutrition, on n'ecoute pas : on exporte juste l'app Express.
if (require.main === module) {
  app.listen(PORT, () => {
    const mode = iaDisponible() ? 'IA (Claude)' : 'DEMO (recettes locales)';
    console.log(`\n  My Coach Nutrition`);
    console.log(`  -> http://localhost:${PORT}`);
    console.log(`  Mode de generation : ${mode}\n`);
  });
}

module.exports = app;
