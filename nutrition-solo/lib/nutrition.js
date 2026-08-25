// nutrition.js
// Calcul des besoins caloriques + repartition des macros.
// Tout est "a titre indicatif" : aucune visee medicale.

// Facteurs d'activite classiques. Les quatre objectifs de l'app :
//   perte / maintien / muscle / energie.
const ACTIVITE_FACTEURS = {
  sedentaire: 1.2, // peu ou pas d'exercice
  leger: 1.375, // exercice leger 1-3 j/semaine
  modere: 1.55, // exercice modere 3-5 j/semaine
  actif: 1.725, // exercice intense 6-7 j/semaine
  tres_actif: 1.9, // travail physique + sport
};

const OBJECTIF_AJUSTEMENT = {
  perte: -0.15, // deficit doux ~15 %
  maintien: 0,
  muscle: 0.1, // surplus doux ~10 %
  energie: 0, // pas de modification calorique, focus sur la repartition
};

// Repartition des macros (% des calories) selon l'objectif.
// 1 g proteines = 4 kcal, 1 g glucides = 4 kcal, 1 g lipides = 9 kcal.
const MACRO_SPLIT = {
  perte: { proteines: 0.3, glucides: 0.4, lipides: 0.3 },
  maintien: { proteines: 0.25, glucides: 0.45, lipides: 0.3 },
  muscle: { proteines: 0.3, glucides: 0.45, lipides: 0.25 },
  energie: { proteines: 0.2, glucides: 0.5, lipides: 0.3 },
};

// Repartition des calories par repas selon le nombre de repas/jour.
const REPARTITION_REPAS = {
  2: [
    { type: 'dejeuner', label: 'Déjeuner', part: 0.55 },
    { type: 'diner', label: 'Dîner', part: 0.45 },
  ],
  3: [
    { type: 'petit-dejeuner', label: 'Petit-déjeuner', part: 0.3 },
    { type: 'dejeuner', label: 'Déjeuner', part: 0.4 },
    { type: 'diner', label: 'Dîner', part: 0.3 },
  ],
  4: [
    { type: 'petit-dejeuner', label: 'Petit-déjeuner', part: 0.25 },
    { type: 'dejeuner', label: 'Déjeuner', part: 0.35 },
    { type: 'collation', label: 'Collation', part: 0.1 },
    { type: 'diner', label: 'Dîner', part: 0.3 },
  ],
  5: [
    { type: 'petit-dejeuner', label: 'Petit-déjeuner', part: 0.22 },
    { type: 'collation', label: 'Collation du matin', part: 0.1 },
    { type: 'dejeuner', label: 'Déjeuner', part: 0.33 },
    { type: 'collation', label: 'Collation de l\'après-midi', part: 0.1 },
    { type: 'diner', label: 'Dîner', part: 0.25 },
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

// Construit les creneaux de la journee a partir des VRAIES habitudes de l'utilisateur :
//  - petit-dejeuner sauf "je ne mange pas le matin" (profil.mangeMatin === false) ;
//  - collations cochees (profil.collations : 'matin' / 'apres-midi' / 'soir') ;
//  - dejeuner et diner toujours presents.
// Renvoie des creneaux ponderes (part = fraction des calories) deja normalises ->
// les collations sont INTEGREES dans la repartition (les autres repas baissent
// proportionnellement), le total journalier reste coherent.
function construireRepartition(profil) {
  const mangeMatin = profil.mangeMatin === undefined ? true : !!profil.mangeMatin;
  const col = new Set((profil.collations || []).map((c) => String(c).toLowerCase()));
  const slots = [];
  if (mangeMatin) slots.push({ type: 'petit-dejeuner', label: 'Petit-déjeuner', w: 26 });
  if (col.has('matin')) slots.push({ type: 'collation', label: 'Collation du matin', w: 9 });
  slots.push({ type: 'dejeuner', label: 'Déjeuner', w: 34 });
  if (col.has('apres-midi')) slots.push({ type: 'collation', label: "Collation de l'apres-midi", w: 9 });
  if (col.has('apres-sport')) slots.push({ type: 'collation', label: 'Collation après sport', w: 10 });
  slots.push({ type: 'diner', label: 'Dîner', w: 28 });
  if (col.has('soir')) slots.push({ type: 'collation', label: 'Collation du soir', w: 8 });
  const totalW = slots.reduce((s, x) => s + x.w, 0) || 1;
  return slots.map((s) => ({ type: s.type, label: s.label, part: s.w / totalW }));
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

// ⚠️⚠️ ZONE SENSIBLE — CALCUL DE LA CIBLE CALORIQUE (stabilisée le 2026-07-18).
// INVARIANT : la cible ne dépend QUE du profil actuel et reste STRICTEMENT
// décroissante avec le poids (baisser le poids ne doit JAMAIS monter la cible).
// Ne jamais réintroduire d'ajustement ADDITIF qui remonterait la cible (cf. le bug
// d'inversion corrigé). Sécurité déficit = plancher + recalcul sur le vrai poids.
// Besoins complets : BMR -> maintien -> cible selon objectif -> macros.
function calculerBesoins(profil) {
  const age = clampNumber(nb(profil.age) || 30, 14, 100);
  const taille_cm = clampNumber(nb(profil.taille_cm) || 170, 120, 230);
  const poids_kg = clampNumber(nb(profil.poids_kg) || 70, 35, 250);
  const sexe = profil.sexe || 'autre';
  const objectif = (OBJECTIF_AJUSTEMENT[profil.objectif] !== undefined) ? profil.objectif : 'maintien';

  // BMR (priorite donnees de pesee).
  const bmrInfo = bmrAvecPriorite(profil, sexe, age, taille_cm, poids_kg);
  const bmr = bmrInfo.bmr;

  // Niveau d'activite + facteur. Le selecteur "Niveau d'activite" du questionnaire
  // reflete deja la frequence de sport declaree (de "sedentaire" a "tres actif").
  const niveau = ACTIVITE_FACTEURS[profil.activite] ? profil.activite : 'sedentaire';
  const facteur = ACTIVITE_FACTEURS[niveau] || ACTIVITE_FACTEURS.sedentaire;
  const maintenance = bmr * facteur;

  // Plancher de securite : on ne descend jamais la cible sous ce seuil.
  const plancher = sexe === 'homme' ? 1500 : 1200;

  let kcalCible = maintenance * (1 + OBJECTIF_AJUSTEMENT[objectif]);
  kcalCible = Math.max(plancher, kcalCible);
  kcalCible = Math.round(kcalCible / 10) * 10;
  const split = MACRO_SPLIT[objectif] || MACRO_SPLIT.maintien;
  const macros = {
    proteines: Math.round((kcalCible * split.proteines) / 4),
    glucides: Math.round((kcalCible * split.glucides) / 4),
    lipides: Math.round((kcalCible * split.lipides) / 9),
  };

  // Repartition des repas : pilotee par les vraies habitudes (petit-dej +
  // collations cochees) si renseignees, sinon fallback sur le nombre de repas/jour.
  let repas;
  if (Array.isArray(profil.collations) || profil.mangeMatin !== undefined) {
    repas = construireRepartition(profil);
  } else {
    repas = REPARTITION_REPAS[profil.repas_par_jour] || REPARTITION_REPAS[3];
  }
  const dinerTard = String(profil.dinerTard) === 'oui' || profil.dinerTard === true;
  if (dinerTard) repas = appliquerDinerLeger(repas);
  // Renormalisation : garantit que les parts somment a 1 (total journalier coherent).
  const totalPart = repas.reduce((s, r) => s + (r.part || 0), 0) || 1;

  return {
    bmr: Math.round(bmr),
    bmrSource: bmrInfo.source,
    tdee: Math.round(maintenance),
    maintenance: Math.round(maintenance),
    kcalCible,
    macros,
    objectif,
    repartitionRepas: repas.map((r) => {
      const p = (r.part || 0) / totalPart;
      return { ...r, part: p, kcal: Math.round((kcalCible * p) / 10) * 10 };
    }),
  };
}

// ⚠️ INVARIANT conserve depuis l'app d'origine : la cible calorique ne depend QUE
// du profil courant et reste strictement decroissante avec le poids. Ne jamais
// reintroduire d'ajustement ADDITIF qui la remonterait. La securite tient au
// plancher calorique (homme 1500 / femme 1200) et au recalcul sur le vrai poids.

module.exports = {
  ACTIVITE_FACTEURS,
  OBJECTIF_AJUSTEMENT,
  MACRO_SPLIT,
  REPARTITION_REPAS,
  calculerBMR,
  calculerBesoins,
};
