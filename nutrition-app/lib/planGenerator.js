// planGenerator.js
// Generation du plan de la semaine en MODE DEMO (sans IA).
// Principe : filtrage DUR (allergies, regime, detestes, temps, budget),
// puis selection ponderee par proximite calorique + gouts.
//
// Securite allergies = ceinture + bretelles : on filtre ici, et server.js
// repasse un filtre final apres toute generation (IA comprise).

const { RECIPES } = require('./recipes');
const { calculerBesoins } = require('./nutrition');

// Normalise une chaine (minuscules, sans accents) pour comparer gouts/allergies.
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

// Mappe un mot saisi par l'utilisateur (allergie/deteste) vers les familles
// d'allergenes connues, pour attraper "noix" -> fruits-a-coque, etc.
const SYNONYMES_ALLERGENES = {
  gluten: ['gluten', 'ble', 'pain', 'pates', 'farine'],
  lactose: ['lactose', 'lait', 'lactose', 'fromage', 'yaourt', 'creme', 'beurre'],
  oeuf: ['oeuf', 'oeufs'],
  arachide: ['arachide', 'cacahuete', 'cacahuetes'],
  'fruits-a-coque': ['fruits a coque', 'noix', 'amande', 'amandes', 'noisette', 'pignon'],
  poisson: ['poisson', 'saumon', 'cabillaud', 'thon'],
  crustaces: ['crustace', 'crevette', 'gambas', 'crabe'],
  soja: ['soja', 'tofu', 'sauce soja'],
  sesame: ['sesame', 'tahin', 'houmous'],
};

// Resout la liste d'allergenes-familles a exclure a partir des mots utilisateur.
function familiesFromUserAllergies(allergies) {
  const familles = new Set();
  for (const a of allergies || []) {
    const na = norm(a);
    if (!na) continue;
    for (const [famille, mots] of Object.entries(SYNONYMES_ALLERGENES)) {
      if (mots.some((m) => na.includes(norm(m)) || norm(m).includes(na))) {
        familles.add(famille);
      }
    }
  }
  return familles;
}

// Une recette contient-elle un mot interdit (allergie OU aliment deteste) ?
function contientMotInterdit(recette, motsInterdits) {
  if (!motsInterdits.length) return false;
  const champ = [
    norm(recette.nom),
    ...(recette.motsCles || []).map(norm),
    ...(recette.ingredients || []).map((i) => norm(i.nom)),
  ].join(' | ');
  return motsInterdits.some((mot) => mot && champ.includes(mot));
}

// Cuisines "familieres" vs "exotiques" : pour une transition alimentaire douce,
// on favorise le familier et on penalise legerement l'exotique, SAUF si
// l'utilisateur a explicitement coche cette cuisine dans ses gouts.
const CUISINES_FAMILIERES = new Set(['francaise', 'italienne', 'americaine']);
const CUISINES_EXOTIQUES = new Set(['asiatique', 'indienne', 'thailandaise', 'japonaise', 'mexicaine']);

const STOPWORDS = new Set([
  'avec', 'sans', 'pour', 'dans', 'plus', 'tres', 'mais', 'des', 'les', 'une', 'un',
  'du', 'de', 'la', 'le', 'et', 'ou', 'au', 'aux', 'mon', 'ma', 'mes', 'son', 'sa',
  'jus', 'eau', 'the', 'cafe', 'verre', 'tasse', 'midi', 'soir', 'matin', 'parfois',
  'souvent', 'maison', 'petit', 'grand', 'bonne', 'bon', 'genre', 'type',
]);

// Extrait les "mots d'habitudes" : aliments cites dans la journee type,
// les frequents et les aimes. Sert a rapprocher le plan du quotidien reel.
function extraireMotsHabitudes(prefs) {
  const sources = [];
  const h = prefs.habitudes || {};
  ['petitDej', 'dejeuner', 'diner', 'collations', 'boissons'].forEach((k) => {
    if (h[k]) sources.push(h[k]);
  });
  (prefs.frequents || []).forEach((f) => sources.push(f));
  (prefs.aimes || []).forEach((a) => sources.push(a));

  const mots = new Set();
  sources.forEach((s) => {
    norm(s)
      .split(/[^a-z]+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
      .forEach((w) => mots.add(w));
  });
  // Les "frequents" comptent double : on les marque a part.
  const frequents = new Set();
  (prefs.frequents || []).forEach((f) => {
    norm(f).split(/[^a-z]+/).filter((w) => w.length >= 4 && !STOPWORDS.has(w)).forEach((w) => frequents.add(w));
  });
  return { mots, frequents };
}

// Filtre DUR : ne renvoie que les recettes 100 % compatibles.
function recettesCompatibles(pool, prefs) {
  const famillesAllergenes = familiesFromUserAllergies(prefs.allergies);
  const motsInterdits = [
    ...(prefs.allergies || []),
    ...(prefs.deteste || []),
  ]
    .map(norm)
    .filter(Boolean);
  const regimesRequis = (prefs.regime || []).map(norm).filter(Boolean);
  const tempsMax = Number(prefs.temps_max) || 999;
  const budget = prefs.budget === 'normal' ? 'normal' : 'eco';
  const exclus = new Set(prefs.exclus || []); // recettes "ne plus me proposer"

  return pool.filter((r) => {
    // 0. Recettes explicitement bannies par l'utilisateur.
    if (exclus.has(r.id)) return false;
    // 1. Allergenes : aucune famille interdite presente.
    if ((r.allergenes || []).some((a) => famillesAllergenes.has(a))) return false;
    // 2. Aucun mot interdit (allergie/deteste) dans nom/ingredients/mots-cles.
    if (contientMotInterdit(r, motsInterdits)) return false;
    // 3. Regime : la recette doit declarer TOUS les regimes requis.
    if (regimesRequis.length) {
      const tags = (r.regime || []).map(norm);
      if (!regimesRequis.every((req) => tags.includes(req))) return false;
    }
    // 4. Temps de preparation.
    if (r.tempsMinutes > tempsMax) return false;
    // 5. Budget : "eco" passe partout ; "normal" requiert budget normal.
    if (budget === 'eco' && r.budget === 'normal') return false;
    return true;
  });
}

// Score d'une recette pour un creneau : plus c'est haut, mieux ca colle.
const RASSASIANT_KEYS = /legume|brocoli|courgette|salade|haricot|epinard|lentille|pois chiche|quinoa|patate douce|avoine|flocons|oeuf/;

function scoreRecette(r, ctx) {
  const { kcalCible, prefs } = ctx;
  let score = 0;
  // Proximite calorique (max ~50 pts, decroit avec l'ecart).
  const ecart = Math.abs(r.kcal - kcalCible) / Math.max(kcalCible, 1);
  score += Math.max(0, 50 - ecart * 100);

  // Cuisines aimees (+15 par match).
  const cuisinesAimees = (prefs.cuisines || []).map(norm);
  if (cuisinesAimees.length) {
    const c = (r.cuisines || []).map(norm);
    score += c.filter((x) => cuisinesAimees.includes(x)).length * 15;
  }

  // Aliments aimes (+10 par match dans nom/mots-cles).
  const aimes = (prefs.aimes || []).map(norm).filter(Boolean);
  if (aimes.length) {
    const champ = [norm(r.nom), ...(r.motsCles || []).map(norm)].join(' | ');
    score += aimes.filter((a) => champ.includes(a)).length * 10;
  }

  // Habitudes alimentaires : rapprocher le plan du quotidien reel (E2).
  // On matche les aliments cites (journee type + frequents) dans la recette.
  const { mots, frequents } = extraireMotsHabitudes(prefs);
  if (mots.size) {
    const champHab = [
      norm(r.nom),
      ...(r.motsCles || []).map(norm),
      ...(r.ingredients || []).map((i) => norm(i.nom)),
    ].join(' | ');
    let hit = 0;
    mots.forEach((m) => { if (champHab.includes(m)) hit++; });
    frequents.forEach((m) => { if (champHab.includes(m)) hit++; }); // frequents = poids double
    score += hit * 9;
  }

  // Transition douce : favoriser les cuisines familieres, freiner l'exotique,
  // SAUF si l'utilisateur a explicitement choisi cette cuisine (deja bonifiee plus haut).
  const cuisinesChoisies = new Set((prefs.cuisines || []).map(norm));
  (r.cuisines || []).map(norm).forEach((c) => {
    if (cuisinesChoisies.has(c)) return;
    if (CUISINES_FAMILIERES.has(c)) score += 8;
    else if (CUISINES_EXOTIQUES.has(c)) score -= 7;
  });

  // Creneau "rassasiant" (ex. faim le soir, envies de sucre) : on bonifie les
  // recettes plus riches en proteines et en aliments volumineux/satietogenes.
  if (ctx.rassasiant) {
    score += (Number(r.proteines) || 0) * 0.5;
    const champ = [norm(r.nom), ...(r.motsCles || []).map(norm), ...(r.ingredients || []).map((i) => norm(i.nom))].join(' ');
    if (RASSASIANT_KEYS.test(champ)) score += 8;
  }

  // Recettes mises en favori (+25) : on les repropose en priorite.
  if ((prefs.favoris || []).includes(r.id)) score += 25;
  return score;
}

// Choix pondere parmi les meilleurs candidats (variete sans pur hasard fige).
// On evite de reprendre la meme recette que la veille pour le meme creneau.
function choisirRecette(candidats, ctx, dejaUtilisees, exclureId) {
  let pool = candidats.filter((r) => r.id !== exclureId);
  if (!pool.length) pool = candidats.slice();
  if (!pool.length) return null;

  // Penalise legerement les recettes deja vues recemment.
  const note = pool
    .map((r) => ({
      r,
      s: scoreRecette(r, ctx) - (dejaUtilisees.get(r.id) || 0) * 12,
    }))
    .sort((a, b) => b.s - a.s);

  // Top 4 candidats, tirage pondere par le rang.
  const top = note.slice(0, Math.min(4, note.length));
  const poids = top.map((_, i) => top.length - i); // 4,3,2,1
  const total = poids.reduce((a, b) => a + b, 0);
  let seuil = (ctx.rand() % 1000) / 1000 * total;
  for (let i = 0; i < top.length; i++) {
    seuil -= poids[i];
    if (seuil <= 0) return top[i].r;
  }
  return top[0].r;
}

// PRNG deterministe simple (pour des plans reproductibles selon une graine).
function makeRand(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return s;
  };
}

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

// Genere le plan complet. Renvoie { besoins, jours: [{ jour, repas: [...] }] }.
function genererPlanDemo(profil, prefs, seed) {
  const besoins = calculerBesoins(profil);
  const rand = makeRand(seed || 12345);
  const nbJours = Math.min(Math.max(Number(profil.jours) || 7, 1), 7);

  // Personnalisation avancee (Niveau 2) : multiplicateurs de repartition kcal
  // (ex. faim le soir -> diner +), temps max et "rassasiant" par creneau.
  const aj = prefs.ajustements || {};
  if (aj.repartitionMult) {
    besoins.repartitionRepas.forEach((r) => { r.part *= aj.repartitionMult[r.type] || 1; });
    const tot = besoins.repartitionRepas.reduce((s, r) => s + r.part, 0) || 1;
    besoins.repartitionRepas.forEach((r) => { r.part /= tot; r.kcal = Math.round((besoins.kcalCible * r.part) / 10) * 10; });
  }
  const tempsMaxCreneau = aj.tempsMaxCreneau || {};
  const rassasiantCreneau = new Set(aj.rassasiantCreneau || []);

  const compatibles = recettesCompatibles(RECIPES, prefs);
  // On segmente le pool par type de creneau. "plat" sert dejeuner ET diner.
  const parType = {
    'petit-dejeuner': compatibles.filter((r) => r.type === 'petit-dejeuner'),
    plat: compatibles.filter((r) => r.type === 'plat'),
    collation: compatibles.filter((r) => r.type === 'collation'),
  };

  const dejaUtilisees = new Map(); // id -> nombre d'utilisations (variete)
  const jours = [];

  for (let d = 0; d < nbJours; d++) {
    const repasDuJour = [];
    let recetteVeillePlat = null;
    for (const creneau of besoins.repartitionRepas) {
      const typePool = creneau.type === 'dejeuner' || creneau.type === 'diner' ? 'plat' : creneau.type;
      let candidats = parType[typePool] || [];
      // Temps max sur ce creneau (ex. pas le temps le midi -> recettes rapides).
      const cap = tempsMaxCreneau[creneau.type];
      if (cap) { const rapides = candidats.filter((r) => r.tempsMinutes <= cap); if (rapides.length >= 3) candidats = rapides; }
      const ctx = { kcalCible: creneau.kcal, prefs, rand, rassasiant: rassasiantCreneau.has(creneau.type) };
      const exclure = creneau.type === 'diner' ? recetteVeillePlat : null;
      const recette = choisirRecette(candidats, ctx, dejaUtilisees, exclure);
      if (creneau.type === 'dejeuner' && recette) recetteVeillePlat = recette.id;

      if (recette) dejaUtilisees.set(recette.id, (dejaUtilisees.get(recette.id) || 0) + 1);

      repasDuJour.push({
        creneau: creneau.type,
        label: creneau.label,
        kcalCible: creneau.kcal,
        recette: recette ? formaterRecette(recette) : null,
      });
    }
    jours.push({ jour: JOURS[d] || `Jour ${d + 1}`, repas: repasDuJour });
  }

  return {
    besoins,
    jours,
    poolVide: compatibles.length === 0,
    nbRecettesDispo: compatibles.length,
  };
}

// Regenere UN seul repas (creneau d'un jour donne), en excluant la recette actuelle.
function regenererRepas(profil, prefs, creneauType, kcalCible, exclureId, seed) {
  const rand = makeRand(seed || 999);
  const compatibles = recettesCompatibles(RECIPES, prefs);
  const typePool = creneauType === 'dejeuner' || creneauType === 'diner' ? 'plat' : creneauType;
  const candidats = compatibles.filter((r) => {
    if (typePool === 'plat') return r.type === 'plat';
    return r.type === typePool;
  });
  const ctx = { kcalCible: kcalCible || 500, prefs, rand };
  const recette = choisirRecette(candidats, ctx, new Map(), exclureId);
  return recette ? formaterRecette(recette) : null;
}

// Recopie la recette dans le format expose au front (sans champs internes lourds).
function formaterRecette(r) {
  return {
    id: r.id,
    nom: r.nom,
    type: r.type,
    cuisines: r.cuisines,
    tempsMinutes: r.tempsMinutes,
    kcal: r.kcal,
    proteines: r.proteines,
    glucides: r.glucides,
    lipides: r.lipides,
    ingredients: r.ingredients,
    etapes: r.etapes,
  };
}

module.exports = {
  norm,
  familiesFromUserAllergies,
  recettesCompatibles,
  genererPlanDemo,
  regenererRepas,
  formaterRecette,
};
