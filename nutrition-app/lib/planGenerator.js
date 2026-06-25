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

// ---- Variete : detection proteine / feculent / style pour eviter les
// doublons (exacts ET deguises) et alterner les sources sur la semaine. ----
const PROTEINES_KEYS = ['poulet', 'dinde', 'boeuf', 'steak', 'veau', 'saumon', 'thon', 'cabillaud', 'colin', 'truite', 'sardine', 'crevette', 'gambas', 'oeuf', 'tofu', 'pois chiche', 'lentille', 'haricot rouge', 'feta', 'mozzarella', 'jambon', 'skyr', 'fromage blanc'];
const FECULENTS_KEYS = ['riz', 'pates', 'spaghetti', 'penne', 'quinoa', 'semoule', 'couscous', 'boulgour', 'patate douce', 'pomme de terre', 'baguette', 'tortilla', 'wrap', 'pita', 'avoine', 'flocons', 'muesli', 'pain'];
const STYLE_KEYS = [
  ['bowl', /bowl/], ['salade', /salade|salad/], ['wrap', /wrap|tortilla|burrito|tacos|pita|fajita/],
  ['gratin', /gratin/], ['wok', /\bwok\b|saute a l asiat/], ['omelette', /omelette|frittata/],
  ['soupe', /soupe|veloute|potage/], ['four', /au four|roti|enfourn/], ['pates', /pates|spaghetti|penne|lasagne|tagliatelle/],
];
function champRecette(r) {
  return norm(r.nom + ' ' + (r.motsCles || []).join(' ') + ' ' + (r.ingredients || []).map((i) => i.nom).join(' '));
}
// Petit-dejeuner : plutot sucre ou sale ? (pour adapter selon le gout du matin)
function petitDejGout(r) {
  const c = champRecette(r);
  if (/oeuf|omelette|jambon|bacon|avocat|saumon|\bfeta\b|charcuterie|saucisse|thon/.test(c)) return 'sale';
  if (/muesli|granola|flocons|avoine|porridge|banane|fruit|miel|confiture|chocolat|pancake|crepe|gaufre|smoothie|compote|brioche|chia|cereales|marmelade|cacao|yaourt|skyr|fromage blanc/.test(c)) return 'sucre';
  return 'neutre';
}
function proteinesOf(r) { const c = champRecette(r); return PROTEINES_KEYS.filter((p) => c.includes(p)); }
function feculentsOf(r) { const c = champRecette(r); return FECULENTS_KEYS.filter((p) => c.includes(p)); }
function styleOf(r) { const c = champRecette(r); for (const [name, re] of STYLE_KEYS) if (re.test(c)) return name; return 'assiette'; }
// Signature(s) "proteine|feculent" : deux plats partageant une meme combinaison
// sont consideres comme trop proches (doublon deguise). Vide si pas de feculent.
function signaturesOf(r) {
  const prots = proteinesOf(r); const fecs = feculentsOf(r);
  const sigs = [];
  (prots.length ? prots : []).forEach((p) => fecs.forEach((f) => sigs.push(p + '|' + f)));
  return sigs;
}

// Choix pondere parmi les meilleurs candidats, avec EXCLUSION DURE des plats deja
// utilises dans la semaine (et de leurs equivalents) + penalites de variete.
function choisirRecette(candidats, ctx, st, exclureId, type) {
  const usedCount = (id) => (st.usedIds.get(id) || 0);
  // 1. Filtre DUR pour la variete de la semaine.
  let pool = candidats.filter((r) => {
    if (r.id === exclureId) return false;
    if (type === 'plat') {
      if (usedCount(r.id) > 0) return false;                                  // jamais 2x le meme plat
      if (signaturesOf(r).some((s) => st.usedSig.has(s))) return false;       // pas de doublon deguise
    } else if (type === 'petit-dejeuner') {
      if (usedCount(r.id) >= 2) return false;                                 // max 2x le meme petit-dej
    } else if (usedCount(r.id) >= 3) return false;                            // collation : tolerance un peu plus large
    return true;
  });
  // 2. Replis progressifs si trop restrictif (petit catalogue / contraintes serrees).
  if (!pool.length && type === 'plat') pool = candidats.filter((r) => r.id !== exclureId && usedCount(r.id) === 0);
  if (!pool.length) pool = candidats.filter((r) => r.id !== exclureId);
  if (!pool.length) pool = candidats.slice();
  if (!pool.length) return null;

  // 3. Score + penalites de variete (proteines, feculents, style deja vus).
  const note = pool.map((r) => {
    let s = scoreRecette(r, ctx);
    proteinesOf(r).forEach((p) => { s -= (st.protCount.get(p) || 0) * 9; });
    feculentsOf(r).forEach((f) => { s -= (st.fecCount.get(f) || 0) * 6; });
    s -= (st.styleCount.get(styleOf(r)) || 0) * 5;
    s -= usedCount(r.id) * 14;
    return { r, s };
  }).sort((a, b) => b.s - a.s);

  // 4. Top 4 candidats, tirage pondere par le rang.
  const top = note.slice(0, Math.min(4, note.length));
  const poids = top.map((_, i) => top.length - i);
  const total = poids.reduce((a, b) => a + b, 0);
  let seuil = (ctx.rand() % 1000) / 1000 * total;
  for (let i = 0; i < top.length; i++) {
    seuil -= poids[i];
    if (seuil <= 0) return top[i].r;
  }
  return top[0].r;
}

// Enregistre une recette choisie dans l'etat de variete de la semaine.
function marquerVariete(st, r, type) {
  st.usedIds.set(r.id, (st.usedIds.get(r.id) || 0) + 1);
  if (type === 'plat') signaturesOf(r).forEach((s) => st.usedSig.add(s));
  proteinesOf(r).forEach((p) => st.protCount.set(p, (st.protCount.get(p) || 0) + 1));
  feculentsOf(r).forEach((f) => st.fecCount.set(f, (st.fecCount.get(f) || 0) + 1));
  const sty = styleOf(r); st.styleCount.set(sty, (st.styleCount.get(sty) || 0) + 1);
}
function nouvelEtatVariete() {
  return { usedIds: new Map(), usedSig: new Set(), protCount: new Map(), fecCount: new Map(), styleCount: new Map() };
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

  // "Je ne mange pas le matin" : on retire le petit-dejeuner et on redistribue
  // ses calories sur les autres repas (proportionnellement).
  if (prefs.matinGout === 'aucun') {
    const sansPdej = besoins.repartitionRepas.filter((r) => r.type !== 'petit-dejeuner');
    if (sansPdej.length) {
      besoins.repartitionRepas = sansPdej;
      const tot = besoins.repartitionRepas.reduce((s, r) => s + r.part, 0) || 1;
      besoins.repartitionRepas.forEach((r) => { r.part /= tot; r.kcal = Math.round((besoins.kcalCible * r.part) / 10) * 10; });
    }
  }

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

  const st = nouvelEtatVariete(); // variete sur toute la semaine
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
      // Gout du matin : sucre ou sale (les neutres restent compatibles avec les deux).
      if (typePool === 'petit-dejeuner' && (prefs.matinGout === 'sucre' || prefs.matinGout === 'sale')) {
        const pref = candidats.filter((r) => { const g = petitDejGout(r); return g === prefs.matinGout || g === 'neutre'; });
        if (pref.length >= 3) candidats = pref;
      }
      const ctx = { kcalCible: creneau.kcal, prefs, rand, rassasiant: rassasiantCreneau.has(creneau.type) };
      const exclure = creneau.type === 'diner' ? recetteVeillePlat : null;
      const recette = choisirRecette(candidats, ctx, st, exclure, typePool);
      if (creneau.type === 'dejeuner' && recette) recetteVeillePlat = recette.id;

      if (recette) marquerVariete(st, recette, typePool);

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

// Regenere UN seul repas (creneau d'un jour donne), en excluant la recette
// actuelle ET les autres recettes deja presentes dans la semaine (exclusIds),
// pour ne pas reintroduire un doublon. Regenere uniquement ce repas.
function regenererRepas(profil, prefs, creneauType, kcalCible, exclureId, seed, exclusIds) {
  const rand = makeRand(seed || 999);
  const compatibles = recettesCompatibles(RECIPES, prefs);
  const typePool = creneauType === 'dejeuner' || creneauType === 'diner' ? 'plat' : creneauType;
  let candidats = compatibles.filter((r) => (typePool === 'plat' ? r.type === 'plat' : r.type === typePool));
  if (typePool === 'petit-dejeuner' && (prefs.matinGout === 'sucre' || prefs.matinGout === 'sale')) {
    const pref = candidats.filter((r) => { const g = petitDejGout(r); return g === prefs.matinGout || g === 'neutre'; });
    if (pref.length >= 3) candidats = pref;
  }
  // Etat de variete reconstruit a partir des repas deja dans la semaine.
  const st = nouvelEtatVariete();
  const dejaLa = [exclureId, ...(exclusIds || [])].filter(Boolean);
  dejaLa.forEach((id) => {
    const r = RECIPES.find((x) => x.id === id);
    if (r) marquerVariete(st, r, r.type === 'plat' ? 'plat' : creneauType);
    else st.usedIds.set(id, 1);
  });
  const ctx = { kcalCible: kcalCible || 500, prefs, rand };
  const recette = choisirRecette(candidats, ctx, st, exclureId, typePool);
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
