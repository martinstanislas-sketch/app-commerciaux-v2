// nutrition.js
// Calcul des besoins caloriques + repartition des macros.
// Tout est "a titre indicatif" : aucune visee medicale.

// Facteurs d'activite classiques (objectifs perte / maintien / muscle / energie).
const ACTIVITE_FACTEURS = {
  sedentaire: 1.2, // peu ou pas d'exercice
  leger: 1.375, // exercice leger 1-3 j/semaine
  modere: 1.55, // exercice modere 3-5 j/semaine
  actif: 1.725, // exercice intense 6-7 j/semaine
  tres_actif: 1.9, // travail physique + sport
};

// Facteurs d'activite "Challenge 6/6" (methode coach, plus conservateurs).
const ACTIVITE_FACTEURS_CHALLENGE = {
  sedentaire: 1.25,
  leger: 1.35,
  modere: 1.5,
  actif: 1.65,
  tres_actif: 1.8,
};

const OBJECTIF_AJUSTEMENT = {
  perte: -0.15, // deficit doux ~15 %
  maintien: 0,
  muscle: 0.1, // surplus doux ~10 %
  energie: 0, // pas de modification calorique, focus sur la repartition
  challenge: -0.15, // indicatif ; le deficit reel est calcule dans la branche challenge
};

// Repartition des macros (% des calories) selon l'objectif.
// 1 g proteines = 4 kcal, 1 g glucides = 4 kcal, 1 g lipides = 9 kcal.
const MACRO_SPLIT = {
  perte: { proteines: 0.3, glucides: 0.4, lipides: 0.3 },
  maintien: { proteines: 0.25, glucides: 0.45, lipides: 0.3 },
  muscle: { proteines: 0.3, glucides: 0.45, lipides: 0.25 },
  energie: { proteines: 0.2, glucides: 0.5, lipides: 0.3 },
  challenge: { proteines: 0.35, glucides: 0.35, lipides: 0.3 }, // fallback ; le challenge calcule en g/kg
};

// Repartition des calories par repas selon le nombre de repas/jour.
const REPARTITION_REPAS = {
  2: [
    { type: 'dejeuner', label: 'Dejeuner', part: 0.55 },
    { type: 'diner', label: 'Diner', part: 0.45 },
  ],
  3: [
    { type: 'petit-dejeuner', label: 'Petit-dejeuner', part: 0.3 },
    { type: 'dejeuner', label: 'Dejeuner', part: 0.4 },
    { type: 'diner', label: 'Diner', part: 0.3 },
  ],
  4: [
    { type: 'petit-dejeuner', label: 'Petit-dejeuner', part: 0.25 },
    { type: 'dejeuner', label: 'Dejeuner', part: 0.35 },
    { type: 'collation', label: 'Collation', part: 0.1 },
    { type: 'diner', label: 'Diner', part: 0.3 },
  ],
  5: [
    { type: 'petit-dejeuner', label: 'Petit-dejeuner', part: 0.22 },
    { type: 'collation', label: 'Collation du matin', part: 0.1 },
    { type: 'dejeuner', label: 'Dejeuner', part: 0.33 },
    { type: 'collation', label: 'Collation de l\'apres-midi', part: 0.1 },
    { type: 'diner', label: 'Diner', part: 0.25 },
  ],
};

function clampNumber(n, min, max) {
  return Math.min(max, Math.max(min, n));
}
function nb(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Diner tardif : on allege le diner et on redistribue vers petit-dej / dejeuner
// (eviter un repas lourd le soir). Renormalise pour rester a 100 %.
function appliquerDinerLeger(repartition) {
  const diner = repartition.find((r) => r.type === 'diner');
  if (!diner || diner.part <= 0.18) return repartition;
  const retire = 0.08;
  return repartition.map((r) => {
    if (r.type === 'diner') return { ...r, part: r.part - retire };
    if (r.type === 'petit-dejeuner') return { ...r, part: r.part + retire * 0.5 };
    if (r.type === 'dejeuner') return { ...r, part: r.part + retire * 0.5 };
    return r;
  });
}

// Metabolisme de base (BMR) - formule Mifflin-St Jeor.
function calculerBMR({ sexe, age, taille_cm, poids_kg }) {
  const base = 10 * poids_kg + 6.25 * taille_cm - 5 * age;
  if (sexe === 'homme') return base + 5;
  if (sexe === 'femme') return base - 161;
  // "autre" / non precise : moyenne des deux constantes.
  return base - 78;
}

// BMR avec PRIORITE aux donnees de pesee :
// 1. valeur de la balance si fournie ; 2. masse sans graisse (370 + 21,6 x MSG) ;
// 3. estimation Mifflin-St Jeor (sexe/age/taille/poids).
function bmrAvecPriorite(profil, sexe, age, taille_cm, poids_kg) {
  const balance = nb(profil.metabolisme_basal);
  if (balance >= 600 && balance <= 4000) {
    return { bmr: balance, source: 'balance' };
  }
  const masseGrasse = nb(profil.masse_grasse);
  if (masseGrasse > 0 && poids_kg > masseGrasse) {
    const msg = poids_kg - masseGrasse; // masse sans graisse
    return { bmr: 370 + 21.6 * msg, source: 'masse sans graisse' };
  }
  return { bmr: calculerBMR({ sexe, age, taille_cm, poids_kg }), source: 'estimation' };
}

// Niveau d'activite deduit du type de journee + nombre de seances de sport.
// Renvoie null si aucune donnee -> on utilisera le selecteur "activite".
function niveauActiviteDepuisPesee(profil) {
  const type = String(profil.type_journee || '').toLowerCase();
  const seances = nb(profil.seances_sport);
  if (!type && !profil.seances_sport) return null;
  if (type === 'physique') return seances >= 4 ? 'tres_actif' : 'actif';
  if (type === 'debout') return seances >= 4 ? 'actif' : (seances >= 2 ? 'modere' : 'leger');
  // assis (defaut)
  if (seances >= 5) return 'actif';
  if (seances >= 3) return 'modere';
  if (seances >= 1) return 'leger';
  return 'sedentaire';
}

// Besoins complets : BMR -> maintien -> cible selon objectif -> macros.
function calculerBesoins(profil) {
  const age = clampNumber(nb(profil.age) || 30, 14, 100);
  const taille_cm = clampNumber(nb(profil.taille_cm) || 170, 120, 230);
  const poids_kg = clampNumber(nb(profil.poids_kg) || 70, 35, 250);
  const sexe = profil.sexe || 'autre';
  const objectif = (OBJECTIF_AJUSTEMENT[profil.objectif] !== undefined) ? profil.objectif : 'maintien';
  const estChallenge = objectif === 'challenge';

  // BMR (priorite donnees de pesee).
  const bmrInfo = bmrAvecPriorite(profil, sexe, age, taille_cm, poids_kg);
  const bmr = bmrInfo.bmr;

  // Niveau d'activite + facteur (jeu de facteurs dedie au challenge).
  const niveauPesee = niveauActiviteDepuisPesee(profil);
  const niveau = (estChallenge && niveauPesee)
    ? niveauPesee
    : (ACTIVITE_FACTEURS[profil.activite] ? profil.activite : 'sedentaire');
  const facteur = estChallenge
    ? (ACTIVITE_FACTEURS_CHALLENGE[niveau] || ACTIVITE_FACTEURS_CHALLENGE.leger)
    : (ACTIVITE_FACTEURS[niveau] || ACTIVITE_FACTEURS.sedentaire);
  const maintenance = bmr * facteur;

  // Plancher de securite.
  const plancher = sexe === 'homme' ? (estChallenge ? 1650 : 1500) : (estChallenge ? 1350 : 1200);

  let kcalCible;
  let macros;
  let extra = {};

  if (estChallenge) {
    // Deficit "challenge" securise (650 kcal, jamais sous le plancher).
    let deficit = 650;
    kcalCible = maintenance - deficit;
    if (kcalCible < plancher) kcalCible = plancher;
    deficit = Math.round(maintenance - kcalCible);
    kcalCible = Math.round(kcalCible / 10) * 10;

    // Poids cible du challenge : -6 kg (borne a 35 kg mini).
    const poidsCible = Math.max(35, Math.round((poids_kg - 6) * 10) / 10);
    const masseGrasse = nb(profil.masse_grasse);
    const msg = (masseGrasse > 0 && poids_kg > masseGrasse) ? poids_kg - masseGrasse : null;

    // Proteines : 2,2 g/kg de masse sans graisse si dispo, sinon 2,0 g/kg de poids cible.
    const proteines = Math.round(msg ? 2.2 * msg : 2.0 * poidsCible);
    // Lipides : 0,7 g/kg de poids cible, minimum 40 g (femme) / 50 g (homme).
    const lipMin = sexe === 'homme' ? 50 : 40;
    const lipides = Math.max(lipMin, Math.round(0.7 * poidsCible));
    // Glucides : le reste des calories.
    const glucides = Math.max(0, Math.round((kcalCible - proteines * 4 - lipides * 9) / 4));
    macros = { proteines, glucides, lipides };

    // Estimations (perte basse = appliquee au deficit, haute = objectif -6 kg).
    const perteMin = Math.round((deficit * 42 / 7700) * 10) / 10;
    extra = {
      maintenance: Math.round(maintenance),
      deficit,
      poidsActuel: poids_kg,
      poidsCible,
      perteEstimee: { min: perteMin, max: 6 },
      // Le deficit theorique pour -6 kg/6 sem (~1100 kcal/j) depasse le deficit
      // securise applique -> on signale un objectif ambitieux mais raisonnable.
      ambitieux: deficit < 1100,
    };
  } else {
    kcalCible = maintenance * (1 + OBJECTIF_AJUSTEMENT[objectif]);
    kcalCible = Math.max(plancher, kcalCible);
    kcalCible = Math.round(kcalCible / 10) * 10;
    const split = MACRO_SPLIT[objectif] || MACRO_SPLIT.maintien;
    macros = {
      proteines: Math.round((kcalCible * split.proteines) / 4),
      glucides: Math.round((kcalCible * split.glucides) / 4),
      lipides: Math.round((kcalCible * split.lipides) / 9),
    };
  }

  // Repartition des repas (+ allegement du diner si diner tardif).
  let repas = REPARTITION_REPAS[profil.repas_par_jour] || REPARTITION_REPAS[3];
  const dinerTard = String(profil.dinerTard) === 'oui' || profil.dinerTard === true;
  if (dinerTard) repas = appliquerDinerLeger(repas);

  return {
    bmr: Math.round(bmr),
    bmrSource: bmrInfo.source,
    tdee: Math.round(maintenance),
    maintenance: Math.round(maintenance),
    kcalCible,
    macros,
    objectif,
    ...extra,
    repartitionRepas: repas.map((r) => ({
      ...r,
      kcal: Math.round((kcalCible * r.part) / 10) * 10,
    })),
  };
}

module.exports = {
  ACTIVITE_FACTEURS,
  ACTIVITE_FACTEURS_CHALLENGE,
  OBJECTIF_AJUSTEMENT,
  MACRO_SPLIT,
  REPARTITION_REPAS,
  calculerBMR,
  calculerBesoins,
};
