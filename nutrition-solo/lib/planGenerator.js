// planGenerator.js
// Generation du plan de la semaine en MODE DEMO (sans IA).
// Principe : filtrage DUR (allergies, regime, detestes, temps, budget),
// puis selection ponderee par proximite calorique + gouts.
//
// Securite allergies = ceinture + bretelles : on filtre ici, et server.js
// repasse un filtre final apres toute generation (IA comprise).

const { RECIPES } = require('./recipes-v2');
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
  mollusques: ['mollusque', 'mollusques', 'coquillage', 'moule', 'moules', 'palourde', 'huitre', 'seiche', 'calamar', 'calmar', 'poulpe', 'saint-jacques', 'coque', 'coques', 'encornet', 'bulot', 'escargot'],
  soja: ['soja', 'tofu', 'sauce soja'],
  sesame: ['sesame', 'tahin', 'houmous'],
};

// Resout la liste d'allergenes-familles a exclure a partir des mots utilisateur.
function familiesFromUserAllergies(allergies) {
  const familles = new Set();
  for (const a of allergies || []) {
    const na = norm(a);
    if (!na) continue;
    // 1. Correspondance EXACTE avec une cle de famille canonique (valeurs du
    //    questionnaire : "fruits-a-coque", "lactose", "gluten"...). Prioritaire
    //    pour eviter qu'un substring trop permissif ne devie vers la mauvaise
    //    famille (ex. "fruits-a-COQUE" matchait "coque" -> mollusques).
    if (Object.prototype.hasOwnProperty.call(SYNONYMES_ALLERGENES, na)) {
      familles.add(na);
      continue;
    }
    // 2. Sinon, correspondance par synonymes (saisie libre : "kiwi", "moutarde"...).
    for (const [famille, mots] of Object.entries(SYNONYMES_ALLERGENES)) {
      if (mots.some((m) => na.includes(norm(m)) || norm(m).includes(na))) {
        familles.add(famille);
      }
    }
  }
  return familles;
}

// Detecteurs HAUTE PRECISION : reperent une famille d'allergene directement dans
// les ingredients/nom/mots-cles, meme si la recette a oublie de la declarer.
// Les "faux amis" sont exclus (lait de coco, beurre de cacahuete, noix de coco,
// nouilles de riz, tortilla espagnole, pate de curry...) pour ne PAS exclure a tort.
const ALLERGENES_DETECTEURS = {
  arachide: /\b(arachide|cacahuete|cacahouete|peanut)/,
  'fruits-a-coque': /(amande|noisette|\bcajou|pistache|noix de pecan|noix de grenoble|cerneau|pignon de pin|\bnoix\b(?! de coco)(?! de muscade)(?! de saint))/,
  lactose: /(\blait\b(?! de coco)(?! d.amande)(?! de soja)(?! vegetal)(?! d.avoine)(?! de riz)(?! de noisette)|fromage(?! vegetal)(?! vegan)|yaourt(?! vegetal)(?! (?:de )?soja)(?! (?:de )?coco)(?! (?:d.)?amande)(?! (?:d.)?avoine)(?! vegan)|\bskyr|mozzarella|parmesan|\bfeta\b|ricotta|mascarpone|\bcreme (?:fraiche|legere|liquide|epaisse|entiere)|\bbeurre\b(?! de cacahuete)(?! de cacao)(?! d.amande)|emmental|gruyere|cheddar|\bchevre\b|burrata|\bcomte\b|petit-suisse|mozzar|raclette|reblochon|feta)/,
  oeuf: /(\boeuf|omelette|\bmayonnaise|meringue|frittata|brouillade d.?oeuf)/,
  gluten: /(\bble\b|\bpain\b|\bpates\b(?! de (?:mais|lentille|pois|sarrasin|riz|quinoa|legumineuse))|semoule|couscous|boulg|\borge\b|seigle|epeautre|chapelure|biscotte|\bpita\b|\bnaan\b|brioche|(?<!facon )lasagne|gnocchi|raviol|(?<!courgettes? )(?<!legumes? )\bspaghettis?\b(?! de (?:courgette|legume))|\bpenne|tagliatelle|macaroni|farine de ble|farine de froment|\bavoine|flocons d.avoine|muesli|granola|baguette|\bbiscuit|croissant|crouton|\bblini|\budon\b|\bramen\b)/,
  poisson: /(saumon|\bthon\b|cabillaud|\bcolin\b|\bmerlu|truite|sardine|maquereau|hareng|lieu noir|dorade|\bsole\b|anchois|surimi|nuoc.?mam|\bbar\b|\blotte\b|eglefin|haddock)/,
  crustaces: /(crevette|gambas|\bcrabe|homard|langoustine|ecrevisse|\bscampi)/,
  mollusques: /(palourde|seiche|calam[ae]r|encornet|poulpe|saint.?jacques|petoncle|\bbulot|bigorneau|\bormeau|\bpraire\b|telline|\bhuitre|\bmoules?\b(?! a )|(?<!a la )\bcoques?\b|\bcouteaux?\b|escargot)/,
  soja: /(\bsoja\b|\btofu\b|tempeh|edamame|\btamari\b|\bmiso\b)/,
  sesame: /(sesame|\btahin|houmous|gomasio)/,
};
// Familles d'allergenes DETECTEES par SEGMENT (nom, mot-cle, ou ingredient).
// Detecter par segment permet de gerer proprement les produits "sans gluten"
// (pain sans gluten, flocons d'avoine certifies sans gluten...) : un segment qui
// mentionne "sans gluten" ne compte pas comme source de gluten.
function segmentsDeRecette(recette) {
  return [
    norm(recette.nom),
    ...(recette.motsCles || []).map(norm),
    ...(recette.ingredients || []).map((i) => norm(i.nom)),
  ];
}
// Sources de gluten AUTRES que l'avoine/les flocons (pour gerer l'avoine certifiee
// sans gluten meme quand "avoine" apparait dans le NOM sans la mention SG).
const GLUTEN_HORS_AVOINE = /(\bble\b|\bpain\b|\bpates\b(?! de (?:mais|lentille|pois|sarrasin|riz|quinoa|legumineuse))|semoule|couscous|boulg|\borge\b|seigle|epeautre|chapelure|biscotte|\bpita\b|\bnaan\b|brioche|(?<!facon )lasagne|gnocchi|raviol|(?<!courgettes? )(?<!legumes? )\bspaghettis?\b(?! de (?:courgette|legume))|\bpenne|tagliatelle|macaroni|farine de ble|farine de froment|baguette|\bbiscuit|croissant|crouton|\bblini|\budon\b|\bramen\b)/;
function famillesDetectees(segments) {
  const fams = new Set();
  for (const [fam, re] of Object.entries(ALLERGENES_DETECTEURS)) {
    for (const seg of segments) {
      if (fam === 'gluten' && /sans gluten/.test(seg)) continue; // produit explicitement sans gluten
      if (re.test(seg)) { fams.add(fam); break; }
    }
  }
  // Avoine/flocons certifies sans gluten : si "sans gluten" est mentionne quelque
  // part et qu'aucune AUTRE source de gluten n'est presente, on retire le gluten.
  if (fams.has('gluten') && segments.some((s) => /sans gluten/.test(s)) && !segments.some((s) => GLUTEN_HORS_AVOINE.test(s))) {
    fams.delete('gluten');
  }
  return fams;
}
// Familles d'allergenes EFFECTIVEMENT presentes : declarees U detectees.
function allergenesEffectifs(recette) {
  const fams = famillesDetectees(segmentsDeRecette(recette));
  for (const a of recette.allergenes || []) fams.add(a);
  return fams;
}

// Ingredients qui CONTREDISENT un regime : si presents, la recette ne respecte
// pas ce regime meme si elle l'a (a tort) declare. Blinde les preferences au
// meme titre que les allergies. ("jambon de dinde" reste autorise en sans-porc.)
const REGIME_INTERDITS = {
  vegan: /(poulet|\bboeuf|\bporc\b|jambon|dinde|\bveau\b|agneau|lardon|bacon|chorizo|saucisse|merguez|steak(?!s? veget)|escalope|magret|canard|charcuterie|\bviande|gelatine|saumon|\bthon\b|cabillaud|colin|merlu|truite|sardine|maquereau|hareng|dorade|anchois|surimi|poisson|crevette|gambas|\bcrabe|\boeuf|omelette|\blait\b(?! de coco)(?! d.amande)(?! vegetal)(?! de soja)(?! de riz)(?! d.avoine)(?! de noisette)|fromage(?! vegetal)(?! vegan)|yaourt(?! vegetal)(?! (?:de )?soja)(?! (?:de )?coco)(?! (?:d.)?amande)(?! (?:d.)?avoine)(?! vegan)|\bskyr|\bbeurre\b(?! de cacahuete)(?! de cacao)(?! d.amande)|\bcreme (?:fraiche|legere|liquide|epaisse|entiere)|\bmiel\b|mascarpone|mozzar|parmesan|\bfeta\b|ricotta)/,
  vegetarien: /(poulet|\bboeuf|\bporc\b|jambon|dinde|\bveau\b|agneau|lardon|bacon|chorizo|saucisse|merguez|steak(?!s? veget)|escalope|magret|canard|charcuterie|\bviande|gelatine|saumon|\bthon\b|cabillaud|colin|merlu|truite|sardine|maquereau|hareng|dorade|anchois|surimi|poisson|crevette|gambas|\bcrabe|nuoc.?mam)/,
  'sans-porc': /(\bporc\b|jambon(?! de (?:dinde|volaille|poulet))|lardon|bacon|chorizo|\bcochon|saucisse(?! de volaille)(?! de poulet))/,
  'sans-gluten': null, // utilise ALLERGENES_DETECTEURS.gluten
};
// La recette respecte-t-elle reellement un regime requis ? (declare ET non contredit)
function satisfaitRegime(recette, regime) {
  if (!(recette.regime || []).map(norm).includes(regime)) return false;
  if (regime === 'sans-gluten') return !famillesDetectees(segmentsDeRecette(recette)).has('gluten');
  const re = REGIME_INTERDITS[regime];
  if (re && re.test(champRecette(recette))) return false;
  return true;
}

// La recette CONTREDIT-elle un regime requis, d'apres ses ingredients/nom ?
// Contrairement a satisfaitRegime, n'exige PAS le tag "regime" declare : sert a
// verifier des recettes IA (qui n'ont pas ce champ) sans tout rejeter a tort.
function regimeContredit(recette, regime) {
  if (regime === 'sans-gluten') return famillesDetectees(segmentsDeRecette(recette)).has('gluten');
  const re = REGIME_INTERDITS[regime];
  return Boolean(re && re.test(champRecette(recette)));
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

// Categories du questionnaire : 5 cuisines, dont "monde" qui regroupe toutes les
// origines hors francaise/italienne/mediterraneenne/asiatique. On etend "monde"
// vers les cuisines reelles des recettes pour le matching.
const CUISINES_MONDE = new Set(['indienne', 'mexicaine', 'americaine', 'orientale', 'anglaise', 'suisse', 'vegetale', 'thailandaise', 'japonaise']);
function expandCuisines(cuisines) {
  const out = new Set();
  (cuisines || []).map(norm).forEach((c) => {
    if (c === 'monde') CUISINES_MONDE.forEach((x) => out.add(x));
    else if (c) out.add(c);
  });
  return out;
}

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
  // Les allergies-familles (gluten, lactose, oeuf, soja...) sont gerees par le
  // detecteur de familles (etape 1), qui respecte les faux-amis ("certifie sans
  // gluten", "lait de riz", "yaourt soja"...). On ne garde en correspondance texte
  // BRUTE que les allergies HORS-famille (kiwi, moutarde, celeri, mollusques...)
  // et les aliments detestes : sinon le mot "gluten" matcherait le label "sans
  // gluten" et exclurait a tort les produits justement sans gluten.
  const motsInterdits = [
    ...(prefs.allergies || []).filter((a) => familiesFromUserAllergies([a]).size === 0),
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
    // 1. Allergenes : aucune famille interdite presente (tags declares U detectes).
    if (famillesAllergenes.size) {
      const presentes = allergenesEffectifs(r);
      for (const fam of famillesAllergenes) { if (presentes.has(fam)) return false; }
    }
    // 2. Aucun mot interdit (allergie/deteste) dans nom/ingredients/mots-cles.
    if (contientMotInterdit(r, motsInterdits)) return false;
    // 3. Regime : la recette doit reellement respecter TOUS les regimes requis
    //    (declare ET non contredit par un ingredient).
    if (regimesRequis.length) {
      if (!regimesRequis.every((req) => satisfaitRegime(r, req))) return false;
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

// Ingredients "specialises" (pas dans un placard courant) : legerement penalises
// pour coller au positionnement "manger facile". (Compare sur nom normalise sans accents.)
const INGREDIENTS_SPECIALISES = /proteine (de pois|de soja|vegetale)|\bwhey\b|isolate|tofu (soyeux|fume)|tempeh|edamame|\blupin|sarrasin|\bmillet\b|psyllium|levure maltee|spiruline|graines de chanvre|\bagar\b|konjac|matcha|farine de pois chiche|farine de riz/;

function scoreRecette(r, ctx) {
  const { kcalCible, prefs } = ctx;
  let score = 0;
  // Proximite calorique (max ~50 pts, decroit avec l'ecart).
  const ecart = Math.abs(r.kcal - kcalCible) / Math.max(kcalCible, 1);
  score += Math.max(0, 50 - ecart * 100);

  // Priorite proteines (objectifs perte / prise de muscle) : favorise les recettes
  // denses en proteines pour mieux atteindre la cible proteique apres mise a l'echelle.
  if (ctx.protPrioritaire) {
    const densiteProt = (Number(r.proteines) || 0) / Math.max(r.kcal / 100, 1); // g prot / 100 kcal
    score += densiteProt * 4;
  }

  // Simplicite ("manger facile") : on favorise les recettes a peu d'ingredients,
  // on penalise les recettes chargees et les ingredients trop specialises.
  const nbIng = (r.ingredients || []).length;
  score += (6 - Math.min(nbIng, 12)) * 9; // <=5 ingr -> bonus, >=7 -> malus croissant
  let nbSpe = 0;
  (r.ingredients || []).forEach((i) => { if (INGREDIENTS_SPECIALISES.test(norm(i.nom))) nbSpe++; });
  score -= nbSpe * 8;

  // Cuisines aimees (+15 par match) — "monde" etendu aux cuisines reelles.
  const cuisinesAimees = expandCuisines(prefs.cuisines);
  if (cuisinesAimees.size) {
    const c = (r.cuisines || []).map(norm);
    score += c.filter((x) => cuisinesAimees.has(x)).length * 15;
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
  const cuisinesChoisies = expandCuisines(prefs.cuisines);
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
  if (r.gout === 'sucre' || r.gout === 'sale') return r.gout; // champ explicite prioritaire
  const c = champRecette(r);
  if (/oeuf|omelette|jambon|bacon|avocat|saumon|\bfeta\b|charcuterie|saucisse|thon/.test(c)) return 'sale';
  if (/muesli|granola|flocons|avoine|porridge|banane|fruit|miel|confiture|chocolat|pancake|crepe|gaufre|smoothie|compote|brioche|chia|cereales|marmelade|cacao|yaourt|skyr|fromage blanc/.test(c)) return 'sucre';
  return 'neutre';
}
// Categories de collations (memes intitules que le questionnaire). Une recette
// peut appartenir a plusieurs categories. Detection par ingredients/nom/mots-cles.
const COLLATION_CAT = {
  'fruits-laitiers': /skyr|fromage blanc|yaourt|yogourt|faisselle|petit.?suisse|compote|cottage|fromage frais|\bfruit|pomme|poire|banane|fraise|myrtille|framboise|ananas|peche|abricot|kiwi|raisin|orange|clementine|mangue|melon/,
  oleagineux: /amande|\bnoix|noisette|\bcajou|pistache|fruits secs|oleagineux|beurre de cacahuete|beurre d.amande|puree d.amande|melange montagnard|granola|graines/,
  proteinees: /proteine|\bwhey|barre proteinee|skyr proteine|\bshake/,
  tartines: /tartine|galette de riz|\bpain|crackers?|biscotte|toast|houmous|\bblini|avocat/,
  smoothies: /smoothie|\bshake|milkshake|protein water|boisson|frappe|lassi/,
  emporter: /wrap|sandwich|energy ball|\bbarre|\bmini|a emporter|nomade/,
};
function collationCategorie(r) {
  const seg = [norm(r.nom), ...(r.motsCles || []).map(norm), ...(r.ingredients || []).map((i) => norm(i.nom))].join(' | ');
  const cats = new Set();
  for (const [cat, re] of Object.entries(COLLATION_CAT)) if (re.test(seg)) cats.add(cat);
  if ((Number(r.proteines) || 0) >= 18) cats.add('proteinees'); // protéinée par la macro
  return cats;
}
// Affine le choix d'une collation selon les CATEGORIES choisies (filtre souple :
// applique seulement s'il reste >= 3 candidats, pour ne jamais bloquer la
// generation). Si plusieurs categories, la variete du moteur fait alterner.
function prefererCollation(candidats, prefs, profil, creneau) {
  let pref = candidats;
  const cats = (prefs.collationCategories || []).map(norm).filter(Boolean);
  const obj = norm(profil.objectif || '');
  const apresSport = /sport/.test(norm((creneau && creneau.label) || ''));
  const apply = (fn) => { const f = pref.filter(fn); if (f.length >= 3) pref = f; };
  // Priorite aux categories selectionnees par l'utilisateur.
  if (cats.length) {
    const want = new Set(cats);
    apply((r) => { for (const x of collationCategorie(r)) if (want.has(x)) return true; return false; });
  }
  // Apres sport / objectifs proteiques : pousser un peu les collations riches en proteines.
  if (apresSport || ['perte', 'muscle'].includes(obj)) {
    apply((r) => (Number(r.proteines) || 0) >= 14);
  }
  return pref;
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
function choisirRecette(candidats, ctx, st, exclureId, type, exclureJour) {
  const usedCount = (id) => (st.usedIds.get(id) || 0);
  const usedToday = (id) => !!(exclureJour && exclureJour.has(id)); // dedup PAR JOUR
  // 1. Filtre DUR pour la variete de la semaine.
  let pool = candidats.filter((r) => {
    if (r.id === exclureId) return false;
    if (usedToday(r.id)) return false;                                       // jamais 2x la meme recette le meme jour
    if (type === 'plat') {
      if (usedCount(r.id) > 0) return false;                                  // jamais 2x le meme plat
      if (signaturesOf(r).some((s) => st.usedSig.has(s))) return false;       // pas de doublon deguise
    } else if (type === 'petit-dejeuner') {
      if (usedCount(r.id) >= 2) return false;                                 // max 2x le meme petit-dej
    } else if (usedCount(r.id) >= 3) return false;                            // collation : tolerance un peu plus large
    return true;
  });
  // 2. Replis progressifs si trop restrictif (petit catalogue / contraintes serrees).
  if (!pool.length && type === 'plat') pool = candidats.filter((r) => r.id !== exclureId && !usedToday(r.id) && usedCount(r.id) === 0);
  if (!pool.length) pool = candidats.filter((r) => r.id !== exclureId && !usedToday(r.id));
  if (!pool.length) pool = candidats.slice(); // dernier recours : evite un repas vide (peut re-autoriser un doublon si catalogue minuscule)
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
  // Diner tard -> on privilegie un diner plus rassasiant (proteines + volume).
  if (prefs.dinerTard === 'oui') rassasiantCreneau.add('diner');

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
    const idsDuJour = new Set(); // dedup PAR JOUR : jamais 2x la meme recette dans la meme journee
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
      if (typePool === 'collation') candidats = prefererCollation(candidats, prefs, profil, creneau);
      const ctx = { kcalCible: creneau.kcal, prefs, rand, rassasiant: rassasiantCreneau.has(creneau.type), protPrioritaire: ['perte', 'muscle'].includes(norm(profil.objectif || '')) };
      const exclure = creneau.type === 'diner' ? recetteVeillePlat : null;
      const recette = choisirRecette(candidats, ctx, st, exclure, typePool, idsDuJour);
      if (creneau.type === 'dejeuner' && recette) recetteVeillePlat = recette.id;

      if (recette) { marquerVariete(st, recette, typePool); idsDuJour.add(recette.id); }

      repasDuJour.push({
        creneau: creneau.type,
        label: creneau.label,
        kcalCible: creneau.kcal,
        recette: recette ? formaterRecette(recette, creneau.kcal) : null,
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
  if (typePool === 'collation') candidats = prefererCollation(candidats, prefs, profil, { label: creneauType });
  // Etat de variete reconstruit a partir des repas deja dans la semaine.
  const st = nouvelEtatVariete();
  const dejaLa = [exclureId, ...(exclusIds || [])].filter(Boolean);
  dejaLa.forEach((id) => {
    const r = RECIPES.find((x) => x.id === id);
    if (r) marquerVariete(st, r, r.type === 'plat' ? 'plat' : creneauType);
    else st.usedIds.set(id, 1);
  });
  const ctx = { kcalCible: kcalCible || 500, prefs, rand, protPrioritaire: ['perte', 'muscle'].includes(norm((profil || {}).objectif || '')) };
  // Exclusion DURE des recettes déjà présentes -> jamais un doublon réintroduit.
  const recette = choisirRecette(candidats, ctx, st, exclureId, typePool, new Set(dejaLa));
  return recette ? formaterRecette(recette, kcalCible) : null;
}

// Mise a l'echelle des portions : facteur borne pour ne pas obtenir de quantites
// absurdes, tout en permettant d'atteindre des cibles elevees (prise de masse).
const SCALE_MIN = 0.6;
const SCALE_MAX = 3;

// Arrondi "propre" d'une quantite selon l'unite (g/ml au pas de 5, le reste au 0,5).
function arrondiQuantite(q, unite) {
  const u = norm(unite || '');
  if (u === 'g' || u === 'ml') return Math.max(5, Math.round(q / 5) * 5);
  return Math.max(0.5, Math.round(q * 2) / 2);
}

// Recopie la recette dans le format expose au front (sans champs internes lourds).
// Si kcalCible est fourni, met la recette A L'ECHELLE pour s'approcher de la cible
// calorique du creneau : kcal, macros ET quantites d'ingredients sont multiplies
// par le MEME facteur borne -> coherence macros/kcal et liste de courses correcte.
function formaterRecette(r, kcalCible) {
  let facteur = 1;
  if (kcalCible && Number(r.kcal) > 0) {
    facteur = Math.min(SCALE_MAX, Math.max(SCALE_MIN, kcalCible / r.kcal));
  }
  const sc = (x) => Math.round((Number(x) || 0) * facteur);
  return {
    id: r.id,
    nom: r.nom,
    type: r.type,
    cuisines: r.cuisines,
    tempsMinutes: r.tempsMinutes,
    kcal: sc(r.kcal),
    proteines: sc(r.proteines),
    glucides: sc(r.glucides),
    lipides: sc(r.lipides),
    portionFacteur: Math.round(facteur * 100) / 100,
    ingredients: (r.ingredients || []).map((i) => ({
      ...i,
      quantite: facteur === 1
        ? i.quantite
        : arrondiQuantite((Number(i.quantite) || 0) * facteur, i.unite),
    })),
    etapes: r.etapes,
  };
}

module.exports = {
  norm,
  familiesFromUserAllergies,
  allergenesEffectifs,
  satisfaitRegime,
  regimeContredit,
  petitDejGout,
  recettesCompatibles,
  genererPlanDemo,
  regenererRepas,
  formaterRecette,
};
