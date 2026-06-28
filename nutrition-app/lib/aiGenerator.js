// aiGenerator.js
// Branchement Claude (optionnel). Si @anthropic-ai/sdk OU ANTHROPIC_API_KEY
// manquent, iaDisponible() renvoie false et server.js bascule en mode demo.
//
// La generation impose un FORMAT JSON STRICT, valide cote code (sans zod pour
// rester leger), puis re-filtre allergies/regime (ceinture + bretelles).

const { calculerBesoins } = require('./nutrition');
const { recettesCompatibles, familiesFromUserAllergies, allergenesEffectifs, regimeContredit, norm } = require('./planGenerator');

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

// Override piloté depuis le panneau admin (persisté en base par le root server.js,
// poussé ici via setCoachIaOverride). null = "auto" (suit les variables d'env),
// true = forcé ON, false = forcé OFF. Dans tous les cas, la CLÉ reste requise :
// sans ANTHROPIC_API_KEY, le chat ne peut pas répondre quel que soit l'override.
let coachIaOverride = null;
function setCoachIaOverride(v) { coachIaOverride = (v === true || v === false) ? v : null; }

function coachIaKeyPresente() { return Boolean(Anthropic && process.env.ANTHROPIC_API_KEY); }
function coachIaEnvOptIn() {
  const on = (k) => ['on', '1', 'true', 'yes'].includes(String(process.env[k] || '').toLowerCase());
  return on('NUTRITION_AI') || on('NUTRITION_COACH_IA');
}

// Le Coach IA conversationnel peut être activé INDÉPENDAMMENT de la génération de
// plans IA. Priorité : override admin (ON/OFF) > variables d'env (auto).
function coachIaDisponible() {
  if (!coachIaKeyPresente()) return false;          // sans clé, impossible
  if (coachIaOverride === true) return true;
  if (coachIaOverride === false) return false;
  return iaDisponible() || coachIaEnvOptIn();        // auto : suit l'environnement
}

// État détaillé pour le panneau admin.
function coachIaInfos() {
  const mode = coachIaOverride === true ? 'on' : (coachIaOverride === false ? 'off' : 'auto');
  return { mode, keyPresente: coachIaKeyPresente(), envOptIn: coachIaEnvOptIn(), actif: coachIaDisponible() };
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
      `INTERDITS ABSOLUS (ne JAMAIS inclure, meme en trace, ni aucun derive ou synonyme) : ${interdits.join(', ')}.`
    );
    lignes.push(
      'Rappels synonymes a exclure aussi : arachide = cacahuete / beurre de cacahuete / sauce satay ; ' +
      'fruits a coque = noix, amande, noisette, cajou, pistache, pignon ; lactose = lait, fromage, yaourt, creme, beurre ; ' +
      'gluten = ble, pain, pates, semoule, couscous, avoine ; soja = tofu, edamame, sauce soja, miso ; sesame = tahin, houmous.'
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

// Detecte un interdit dans UNE recette IA. Deux niveaux, comme le mode demo :
//  a) familles d'allergenes via les memes detecteurs (cacahuete = arachide,
//     noix/amande = fruits-a-coque, lait/fromage = lactose...) -> attrape les
//     synonymes que l'utilisateur n'a pas tapes ("arachide" coche, "cacahuete" servie).
//  b) mots bruts (aliments detestes + libelles d'allergie) dans nom/ingredients/mots-cles.
// Renvoie la raison (string) si interdit, sinon null.
function raisonInterdit(r, prefs) {
  if (!r) return null;
  const famillesInterdites = familiesFromUserAllergies(prefs.allergies);
  if (famillesInterdites.size) {
    const presentes = allergenesEffectifs(r);
    for (const fam of famillesInterdites) {
      if (presentes.has(fam)) return `allergene ${fam}`;
    }
  }
  const motsInterdits = [...(prefs.allergies || []), ...(prefs.deteste || [])]
    .map(norm)
    .filter(Boolean);
  if (motsInterdits.length) {
    const champ = [
      norm(r.nom),
      ...(r.ingredients || []).map((i) => norm(i.nom)),
      ...(r.motsCles || []).map(norm),
    ].join(' | ');
    const hit = motsInterdits.find((m) => champ.includes(m));
    if (hit) return `mot interdit "${hit}"`;
  }
  // Regime (vegan, vegetarien, sans-porc, sans-gluten) : la recette IA ne doit pas
  // le contredire par ses ingredients (l'IA n'ayant pas de tag "regime" fiable).
  const regimesRequis = (prefs.regime || []).map(norm).filter(Boolean);
  for (const reg of regimesRequis) {
    if (regimeContredit(r, reg)) return `regime ${reg} non respecte`;
  }
  return null;
}

// Verifie qu'aucune recette IA ne contient un interdit ; sinon -> exception
// pour declencher une nouvelle tentative ou le repli demo.
function verifierInterdits(plan, prefs) {
  for (const jour of plan.jours) {
    for (const repas of jour.repas) {
      const raison = raisonInterdit(repas.recette, prefs);
      if (raison) {
        throw new Error(`Interdit (${raison}) dans une recette IA : ${repas.recette.nom}`);
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
  const raison = raisonInterdit(r, prefs);
  if (raison) throw new Error(`Interdit (${raison}) dans la recette IA.`);
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

// ---------- Coach IA conversationnel ----------
const COACH_SYSTEME = `Tu es le coach nutrition personnel de l'application « My Coach Nutrition ». Tu accompagnes le client au quotidien comme le ferait un vrai coach humain (nutritionniste / coach sportif).

CONNAISSANCE DU CLIENT
- Tu connais déjà son profil complet et son programme (fournis ci-dessous). Ne redemande JAMAIS ces informations.
- Personnalise CHAQUE réponse à partir de ses données réelles (objectif, calories et macros visées et restantes, repas du jour, écarts, allergies, préférences, compléments, poids…). Jamais de réponse générique.

CE QUE TU SAIS FAIRE
- Répondre à toute question nutrition en tenant compte de son profil (« puis-je manger une pizza / boire un verre de vin », « que manger avant/après le sport », « comment atteindre mes protéines », « pourquoi ai-je faim », « cheat meal ? »…).
- Proposer des adaptations de recettes (remplacer un aliment, version végé, sans four, plus rapide, avec ce qu'il a dans le frigo) en gardant la cohérence avec ses objectifs.
- Adapter le reste de la journée si écart ou imprévu (resto, barbecue, invité, saut de repas) pour garder des apports cohérents — concrètement (ex. « allège ton dîner », « cale une collation protéinée »).
- Conseiller en temps réel avec des chiffres concrets (ex. « il te reste ~40 g de protéines : un skyr + une poignée d'amandes suffisent »).
- Encourager et motiver régulièrement, sans en faire trop.
- Expliquer les compléments (intérêt, moment de prise, intégration dans la journée) — informatif, jamais médical.

GESTION DES ÉCARTS
- Ne culpabilise JAMAIS. Un seul repas ne remet pas en cause les résultats. Analyse calmement puis propose une solution concrète et rassurante.

STYLE
- Chaleureux, naturel, bienveillant, motivant, pédagogue, professionnel. Tutoiement. Français. Utilise son prénom si tu le connais.
- Réponses HUMAINES, jamais robotiques. Concises et directement applicables (vise 2 à 6 phrases ; une courte liste si utile). Pas de markdown lourd ni de titres.

INTERDITS (sécurité — ne JAMAIS franchir)
- Jamais : culpabiliser, juger, répondre de façon générique, inventer des informations (si une donnée manque, dis-le simplement et donne un conseil général adapté).
- Jamais de diagnostic ni d'avis médical : tu ne remplaces ni un médecin, ni un diététicien, ni un professionnel de santé.
- Jamais de restrictions extrêmes, de jeûnes prolongés/dangereux, de régimes très basses calories, ni de compléments à risque ou dosages excessifs.
- Femme enceinte ou allaitante, pathologie (diabète, thyroïde, cœur…), traitement médicamenteux, ou trouble du comportement alimentaire (anorexie, boulimie, hyperphagie…) : ne donne AUCUN conseil risqué ; reste prudent, bienveillant, et oriente clairement vers un professionnel de santé / le coach humain.
- Devant douleur, malaise, perte de poids anormale ou tout signal inquiétant : oriente vers un professionnel de santé.

QUAND PASSER LA MAIN AU COACH HUMAIN
- Si la situation demande un vrai suivi personnalisé (ajustement durable du plan, blocage qui dure, contexte médical), propose simplement de prévenir le coach humain — il pourra ajuster la semaine. Tu complètes le coach humain, tu ne le remplaces pas.

OBJECTIF : à la fin de l'échange, le client doit avoir le sentiment d'avoir parlé à un vrai coach qui connaît parfaitement son profil et lui donne des réponses concrètes, sûres et personnalisées.`;

async function coachRepondre({ contexte, messages }) {
  const c = client();
  const sys = COACH_SYSTEME + '\n\n=== PROFIL & DONNÉES DU CLIENT (source de vérité, ne jamais redemander) ===\n' + String(contexte || '(profil non disponible)').slice(0, 7000);
  const msgs = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && m.content)
    .slice(-18)
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 2000) }));
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return '';
  const r = await c.messages.create({ model: MODEL, max_tokens: 700, system: sys, messages: msgs });
  return (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

module.exports = { iaDisponible, coachIaDisponible, setCoachIaOverride, coachIaInfos, genererPlanIA, regenererRepasIA, genererRecetteDetail, analyserAssietteIA, coachRepondre };
