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

// Ordre croissant des niveaux d'activite : sert a NE JAMAIS sous-estimer
// l'activite reelle (on ne descend jamais sous le niveau declare par l'utilisateur).
const ORDRE_ACTIVITE = ['sedentaire', 'leger', 'modere', 'actif', 'tres_actif'];
const rangActivite = (n) => Math.max(0, ORDRE_ACTIVITE.indexOf(n));

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

// ⚠️⚠️ ZONE SENSIBLE — CALCUL DE LA CIBLE CALORIQUE (stabilisée le 2026-07-18).
// INVARIANT : la cible ne dépend QUE du profil actuel et reste STRICTEMENT
// décroissante avec le poids (baisser le poids ne doit JAMAIS monter la cible).
// Ne jamais réintroduire d'ajustement ADDITIF qui remonterait la cible (cf. le bug
// d'inversion corrigé). Sécurité déficit = plancher + recalcul sur le vrai poids.
// Toute modification ici doit être coordonnée (risque d'écrasement d'un fix).
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
  // Le selecteur "Niveau d'activite" du questionnaire reflete deja la frequence de
  // sport declaree (de "sedentaire" a "tres actif") : c'est le niveau de reference.
  const niveauDeclare = ACTIVITE_FACTEURS[profil.activite] ? profil.activite : 'sedentaire';
  // Les donnees de pesee (type de journee + seances) ne peuvent qu'AFFINER VERS LE
  // HAUT : on ne sous-estime jamais l'activite reelle. Sinon un client actif ayant un
  // travail de bureau serait traite comme sedentaire -> maintenance trop basse ->
  // deficit trop important (le client mange trop peu par rapport a sa depense).
  const niveauPesee = niveauActiviteDepuisPesee(profil);
  const niveau = (estChallenge && niveauPesee && rangActivite(niveauPesee) > rangActivite(niveauDeclare))
    ? niveauPesee
    : niveauDeclare;
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
    // Parametres ajustables (defauts : -650 kcal, objectif -6 kg sur 6 semaines).
    const deficitVise = clampNumber(nb(profil.deficit_cible) || 650, 400, 750);
    const perteObjectif = clampNumber(nb(profil.perte_objectif_kg) || 6, 1, 30);

    // CIBLE MONOTONE : elle ne depend QUE du profil actuel (BMR/TDEE + deficit).
    // On n'AJOUTE plus l'ajustement cumule de pesee : quand il devenait positif
    // (regle "perte rapide -> +125 kcal"), il pouvait REMONTER la cible et
    // inverser le sens attendu (baisser le poids augmentait les calories). Le suivi
    // de pesee reste un CONSEIL (message), il ne pousse plus le compteur vers le haut.
    let deficit = deficitVise;
    kcalCible = maintenance - deficit;
    if (kcalCible < plancher) kcalCible = plancher;
    deficit = Math.round(maintenance - kcalCible);
    kcalCible = Math.round(kcalCible / 10) * 10;

    // Poids cible : -perteObjectif kg (borne a 35 kg mini).
    const poidsCible = Math.max(35, Math.round((poids_kg - perteObjectif) * 10) / 10);
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

    // Deficit theorique pour atteindre l'objectif en 6 semaines (42 jours).
    const deficitTheorique = (perteObjectif * 7700) / 42;
    const perteMin = Math.round((deficit * 42 / 7700) * 10) / 10;
    extra = {
      maintenance: Math.round(maintenance),
      deficit,
      poidsActuel: poids_kg,
      poidsCible,
      perteObjectif,
      perteEstimee: { min: perteMin, max: perteObjectif },
      // Si le deficit applique reste sous le deficit theorique necessaire,
      // l'objectif est ambitieux mais raisonnable.
      ambitieux: deficit < deficitTheorique * 0.95,
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
    ...extra,
    repartitionRepas: repas.map((r) => {
      const p = (r.part || 0) / totalPart;
      return { ...r, part: p, kcal: Math.round((kcalCible * p) / 10) * 10 };
    }),
  };
}

// ⚠️ RETIRÉ (2026-07-18) : calculerAjustementHebdo ajoutait ±125 kcal à la cible
// selon la vitesse de perte. Ce terme s'accumulait et REMONTAIT la cible quand le
// poids baissait (inversion critique). La sécurité anti-déficit-dangereux passe
// désormais UNIQUEMENT par : (1) le plancher calorique (homme 1650 / femme 1350 en
// challenge), (2) le recalcul de la cible sur le VRAI poids à chaque pesée. Aucun
// ajout ne doit jamais REMONTER la cible : elle reste strictement décroissante
// avec le poids. Ne pas réintroduire d'ajustement additif sans coordination.

module.exports = {
  ACTIVITE_FACTEURS,
  ACTIVITE_FACTEURS_CHALLENGE,
  OBJECTIF_AJUSTEMENT,
  MACRO_SPLIT,
  REPARTITION_REPAS,
  calculerBMR,
  calculerBesoins,
};
