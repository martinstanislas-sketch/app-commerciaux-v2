// aiGenerator.js
// Branchement Claude (optionnel). Si @anthropic-ai/sdk OU ANTHROPIC_API_KEY
// manquent, iaDisponible() renvoie false et server.js bascule en mode demo.
//
// La generation impose un FORMAT JSON STRICT, valide cote code (sans zod pour
// rester leger), puis re-filtre allergies/regime (ceinture + bretelles).

const { calculerBesoins } = require('./nutrition');
const { recettesCompatibles, familiesFromUserAllergies, norm } = require('./planGenerator');

let Anthropic = null;
try {
  Anthropic = require('@anthropic-ai/sdk');
} catch (_) {
  Anthropic = null;
}

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

// IA active SEULEMENT si : le SDK est installe, une cle est presente, ET
// l'utilisateur a explicitement opte pour l'IA (NUTRITION_AI=on).
// Ce dernier garde-fou evite tout cout surprise si une cle ANTHROPIC_API_KEY
// traine deja dans l'environnement de la machine.
function iaDisponible() {
  const optIn = ['on', '1', 'true', 'yes'].includes(String(process.env.NUTRITION_AI || '').toLowerCase());
  return Boolean(Anthropic && process.env.ANTHROPIC_API_KEY && optIn);
}

function client() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

// Construit les contraintes DURES envoyees au modele.
function contraintesTexte(profil, prefs, besoins) {
  const lignes = [];
  lignes.push(`Objectif : ${profil.objectif}.`);
  lignes.push(`Cible calorique journaliere : environ ${besoins.kcalCible} kcal (tolerance +/-10%).`);
  lignes.push(
    `Repas par jour : ${besoins.repartitionRepas.map((r) => `${r.label} (~${r.kcal} kcal)`).join(', ')}.`
  );
  if ((prefs.cuisines || []).length) lignes.push(`Cuisines preferees : ${prefs.cuisines.join(', ')}.`);
  if ((prefs.aimes || []).length) lignes.push(`Aliments aimes : ${prefs.aimes.join(', ')}.`);
  if ((prefs.regime || []).length) lignes.push(`Regime A RESPECTER strictement : ${prefs.regime.join(', ')}.`);
  if (prefs.budget) lignes.push(`Budget : ${prefs.budget}.`);
  if (prefs.temps_max) lignes.push(`Temps de cuisine max : ${prefs.temps_max} minutes.`);

  // INTERDITS = priorite absolue.
  const interdits = [...(prefs.allergies || []), ...(prefs.deteste || [])].filter(Boolean);
  if (interdits.length) {
    lignes.push(
      `INTERDITS ABSOLUS (ne JAMAIS inclure, meme en trace) : ${interdits.join(', ')}.`
    );
  }
  return lignes.join('\n');
}

const FORMAT = `Reponds UNIQUEMENT avec un objet JSON valide, sans texte autour, au format exact :
{
  "jours": [
    {
      "jour": "Lundi",
      "repas": [
        {
          "creneau": "petit-dejeuner",
          "label": "Petit-dejeuner",
          "recette": {
            "id": "ia-...",
            "nom": "string",
            "cuisines": ["string"],
            "tempsMinutes": 0,
            "kcal": 0, "proteines": 0, "glucides": 0, "lipides": 0,
            "ingredients": [{"nom":"string","quantite":0,"unite":"string","rayon":"string"}],
            "etapes": ["string"]
          }
        }
      ]
    }
  ]
}`;

function promptPlan(profil, prefs, besoins, nbJours) {
  return `Tu es un nutritionniste bienveillant. Cree un plan de repas sur ${nbJours} jour(s).
${contraintesTexte(profil, prefs, besoins)}

Regles :
- Respecte ABSOLUMENT les interdits (allergies + aliments detestes).
- Privilegie les cuisines et aliments aimes.
- Vise la cible calorique de chaque repas.
- Recettes simples, ingredients courants, etapes courtes.
- Chaque ingredient a un "rayon" (Fruits & legumes, Boucherie, Cremerie, Epicerie, Poissonnerie, Boulangerie, Surgeles...).
- Prefixe chaque id de recette par "ia-".

${FORMAT}`;
}

// Extrait le premier bloc JSON d'une reponse texte.
function extraireJSON(texte) {
  const debut = texte.indexOf('{');
  const fin = texte.lastIndexOf('}');
  if (debut === -1 || fin === -1) throw new Error('Pas de JSON dans la reponse.');
  return JSON.parse(texte.slice(debut, fin + 1));
}

// Validation manuelle du schema (assez stricte pour proteger le front).
function validerPlan(obj) {
  if (!obj || !Array.isArray(obj.jours)) throw new Error('Champ "jours" manquant.');
  for (const jour of obj.jours) {
    if (!jour || typeof jour.jour !== 'string' || !Array.isArray(jour.repas)) {
      throw new Error('Jour invalide.');
    }
    for (const repas of jour.repas) {
      if (!repas || typeof repas.creneau !== 'string') throw new Error('Repas invalide.');
      const r = repas.recette;
      if (r) {
        const okNum = ['kcal', 'proteines', 'glucides', 'lipides', 'tempsMinutes'].every(
          (k) => typeof r[k] === 'number'
        );
        if (typeof r.nom !== 'string' || !Array.isArray(r.ingredients) || !Array.isArray(r.etapes) || !okNum) {
          throw new Error('Recette invalide.');
        }
      }
    }
  }
  return obj;
}

// Verifie qu'aucune recette IA ne contient un interdit ; sinon -> exception
// pour declencher une nouvelle tentative ou le repli demo.
function verifierInterdits(plan, prefs) {
  const motsInterdits = [...(prefs.allergies || []), ...(prefs.deteste || [])]
    .map(norm)
    .filter(Boolean);
  if (!motsInterdits.length) return;
  for (const jour of plan.jours) {
    for (const repas of jour.repas) {
      const r = repas.recette;
      if (!r) continue;
      const champ = [norm(r.nom), ...(r.ingredients || []).map((i) => norm(i.nom))].join(' | ');
      if (motsInterdits.some((m) => champ.includes(m))) {
        throw new Error(`Interdit detecte dans une recette IA : ${r.nom}`);
      }
    }
  }
}

async function genererPlanIA(profil, prefs, seed) {
  const besoins = calculerBesoins(profil);
  const nbJours = Math.min(Math.max(Number(profil.jours) || 7, 1), 7);
  const c = client();

  // Jusqu'a 2 tentatives si le JSON est invalide ou contient un interdit.
  let derniereErreur;
  for (let essai = 0; essai < 2; essai++) {
    const msg = await c.messages.create({
      model: MODEL,
      max_tokens: 4000,
      messages: [{ role: 'user', content: promptPlan(profil, prefs, besoins, nbJours) }],
    });
    const texte = (msg.content || []).map((b) => b.text || '').join('');
    try {
      const obj = validerPlan(extraireJSON(texte));
      verifierInterdits(obj, prefs);
      return { besoins, jours: obj.jours, nbRecettesDispo: null };
    } catch (e) {
      derniereErreur = e;
    }
  }
  throw derniereErreur || new Error('Generation IA invalide.');
}

async function regenererRepasIA(profil, prefs, creneau, kcalCible, exclureId, seed) {
  const c = client();
  const interdits = [...(prefs.allergies || []), ...(prefs.deteste || [])].filter(Boolean);
  const prompt = `Propose UNE seule recette pour le creneau "${creneau}", ~${kcalCible || 500} kcal.
${(prefs.cuisines || []).length ? 'Cuisines aimees : ' + prefs.cuisines.join(', ') + '.' : ''}
${(prefs.regime || []).length ? 'Regime strict : ' + prefs.regime.join(', ') + '.' : ''}
${interdits.length ? 'INTERDITS ABSOLUS : ' + interdits.join(', ') + '.' : ''}
Differente de l'id "${exclureId || ''}".
Reponds UNIQUEMENT avec l'objet JSON "recette" (memes champs que le format plan, id prefixe "ia-").`;

  const msg = await c.messages.create({
    model: MODEL,
    max_tokens: 1200,
    messages: [{ role: 'user', content: prompt }],
  });
  const texte = (msg.content || []).map((b) => b.text || '').join('');
  const r = extraireJSON(texte);
  // Validation minimale + controle interdits.
  if (typeof r.nom !== 'string') throw new Error('Recette IA invalide.');
  const champ = [norm(r.nom), ...((r.ingredients || []).map((i) => norm(i.nom)))].join(' | ');
  const motsInterdits = interdits.map(norm).filter(Boolean);
  if (motsInterdits.some((m) => champ.includes(m))) throw new Error('Interdit dans la recette IA.');
  return r;
}

// ----------------------------------------------------------------------
// Recette guidee detaillee, RECONSTRUITE a partir des ingredients actuels.
// Garantit la coherence (n'utilise que les ingredients fournis) et adapte
// materiel / temps / reperes / ajustements / dressage. Macros recalculees.
// ----------------------------------------------------------------------
function promptRecetteDetail({ nom, objectif, tempsMinutes, cuisines, ingredients }) {
  const liste = (ingredients || [])
    .map((i) => `- ${i.quantite} ${i.unite} ${i.nom}`)
    .join('\n');
  return `Tu es un chef qui ecrit des recettes guidees pour de grands debutants en cuisine.
Plat : "${nom}"${cuisines && cuisines.length ? ' (cuisine ' + cuisines.join(', ') + ')' : ''}.
Objectif nutrition : ${objectif || 'equilibre'}. Temps indicatif : ${tempsMinutes || 20} min. Pour 1 portion.

Ingredients EXACTS a utiliser (n'en ajoute AUCUN autre, sauf basiques : eau, sel, poivre, un filet d'huile) :
${liste}

Ecris une recette ULTRA pedagogique : la personne ne doit jamais avoir a deviner.
Reponds UNIQUEMENT avec un objet JSON valide, sans texte autour, au format exact :
{
  "materiel": ["..."],
  "etapes": ["...", "..."],
  "dressage": "...",
  "kcal": 0, "proteines": 0, "glucides": 0, "lipides": 0
}

Regles imperatives :
- "materiel" : 3 a 6 ustensiles necessaires (casserole, poele, bol, couteau, planche, cuillere, four, mixeur...).
- "etapes" : 5 a 8 etapes ordonnees.
  - La PREMIERE etape = preparation des ingredients (quoi sortir, peser, laver, couper, egoutter), avec les quantites.
  - Les etapes de cuisson precisent le FEU (doux/moyen/vif), le TEMPS en minutes, et un REPERE visuel ("jusqu'a ce que...", "doit etre dore", "ne doit plus etre rose a coeur").
  - Inclure un AJUSTEMENT concret quand c'est utile ("si trop epais, ajouter un peu de lait ou d'eau ; si trop liquide, prolonger la cuisson 1 a 2 min").
- "dressage" : comment servir (assiette/bol, ordre, chaud/froid).
- N'utilise QUE les ingredients listes (+ eau/sel/poivre/huile). Ne mentionne JAMAIS un ingredient absent de la liste.
- Macros : estimation coherente avec ces ingredients, pour 1 portion (nombres entiers).
- Francais simple, phrases courtes, niveau grand debutant.`;
}

function validerDetail(obj) {
  if (!obj || !Array.isArray(obj.materiel) || !Array.isArray(obj.etapes) || obj.etapes.length < 3) {
    throw new Error('Structure de recette detaillee invalide.');
  }
  if (typeof obj.dressage !== 'string') obj.dressage = '';
  ['kcal', 'proteines', 'glucides', 'lipides'].forEach((k) => {
    if (typeof obj[k] !== 'number') obj[k] = null;
  });
  return obj;
}

async function genererRecetteDetail(payload) {
  const c = client();
  let derniereErreur;
  for (let essai = 0; essai < 2; essai++) {
    const msg = await c.messages.create({
      model: MODEL,
      max_tokens: 1500,
      messages: [{ role: 'user', content: promptRecetteDetail(payload) }],
    });
    const texte = (msg.content || []).map((b) => b.text || '').join('');
    try {
      return validerDetail(extraireJSON(texte));
    } catch (e) {
      derniereErreur = e;
    }
  }
  throw derniereErreur || new Error('Recette detaillee invalide.');
}

// ----------------------------------------------------------------------
// Analyse d'assiette en photo (Claude vision) : ESTIMATION bienveillante des
// calories et macros + retour coaching. Jamais presentee comme exacte.
// ----------------------------------------------------------------------
function promptAssiette({ precision, objectif, planContext }) {
  return `Tu es un coach nutrition bienveillant et non culpabilisant. Analyse cette photo de repas/assiette et ESTIME (sans jamais pretendre etre exact) les calories et les macronutriments.
Objectif du client : ${objectif || 'equilibre'}.${planContext ? '\nRepas prevu dans son plan : ' + planContext + '.' : ''}
${precision ? 'Precision donnee par le client : ' + precision + '.' : ''}

Si la photo est trop floue, sombre, ou ne montre pas clairement un repas, renvoie {"lisible": false}.
Sinon, reponds UNIQUEMENT avec un objet JSON valide, sans texte autour, au format exact :
{
  "lisible": true,
  "aliments": ["aliment visible", "..."],
  "kcal": 0, "proteines": 0, "glucides": 0, "lipides": 0,
  "niveau": "coherent",
  "pointPositif": "un point positif concret et bienveillant",
  "axe": "un axe d'amelioration, en douceur",
  "action": "une action simple pour le prochain repas",
  "coherencePlan": "phrase courte sur la coherence avec le plan prevu (si fourni)"
}

Regles :
- "niveau" : "coherent" (cohérent avec l'objectif), "correct" (correct, a ajuster) ou "reprendre" (a reprendre au prochain repas).
- Estimations REALISTES pour la portion visible (nombres entiers). Si incertain, reste prudent.
- Ton bienveillant, oriente coaching. N'utilise JAMAIS "mauvais repas", "echec", "rate", "interdit", "compenser". Prefere "a ajuster", "bonne base", "reprends simplement au prochain repas", "la regularite avant la perfection".`;
}
function validerAssiette(o) {
  if (!o || typeof o !== 'object') throw new Error('Analyse invalide.');
  if (o.lisible === false) return { lisible: false };
  const out = { lisible: true };
  out.aliments = Array.isArray(o.aliments) ? o.aliments.map((x) => String(x).slice(0, 60)).slice(0, 12) : [];
  ['kcal', 'proteines', 'glucides', 'lipides'].forEach((k) => { const n = Math.round(Number(o[k])); out[k] = (isFinite(n) && n >= 0) ? n : 0; });
  out.niveau = ['coherent', 'correct', 'reprendre'].includes(o.niveau) ? o.niveau : 'correct';
  out.pointPositif = String(o.pointPositif || '').slice(0, 240);
  out.axe = String(o.axe || '').slice(0, 240);
  out.action = String(o.action || '').slice(0, 240);
  out.coherencePlan = String(o.coherencePlan || '').slice(0, 240);
  return out;
}
async function analyserAssietteIA({ imageDataUrl, precision, objectif, planContext }) {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/i.exec(imageDataUrl || '');
  if (!m) throw new Error('Image invalide.');
  const c = client();
  const msg = await c.messages.create({
    model: MODEL,
    max_tokens: 700,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: m[1].toLowerCase(), data: m[2] } },
        { type: 'text', text: promptAssiette({ precision, objectif, planContext }) },
      ],
    }],
  });
  const texte = (msg.content || []).map((b) => b.text || '').join('');
  return validerAssiette(extraireJSON(texte));
}

module.exports = { iaDisponible, genererPlanIA, regenererRepasIA, genererRecetteDetail, analyserAssietteIA };
