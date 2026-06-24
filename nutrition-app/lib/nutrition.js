// nutrition.js
// Calcul des besoins caloriques (Mifflin-St Jeor) + repartition des macros.
// Tout est "a titre indicatif" : aucune visee medicale.

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

// Metabolisme de base (BMR) - formule Mifflin-St Jeor.
function calculerBMR({ sexe, age, taille_cm, poids_kg }) {
  const base = 10 * poids_kg + 6.25 * taille_cm - 5 * age;
  if (sexe === 'homme') return base + 5;
  if (sexe === 'femme') return base - 161;
  // "autre" / non precise : moyenne des deux constantes.
  return base - 78;
}

// Besoins complets : BMR -> depense (TDEE) -> cible selon objectif -> macros.
function calculerBesoins(profil) {
  const age = clampNumber(Number(profil.age) || 30, 14, 100);
  const taille_cm = clampNumber(Number(profil.taille_cm) || 170, 120, 230);
  const poids_kg = clampNumber(Number(profil.poids_kg) || 70, 35, 250);
  const sexe = profil.sexe || 'autre';
  const activite = ACTIVITE_FACTEURS[profil.activite] ? profil.activite : 'sedentaire';
  const objectif = OBJECTIF_AJUSTEMENT[profil.objectif] !== undefined ? profil.objectif : 'maintien';

  const bmr = calculerBMR({ sexe, age, taille_cm, poids_kg });
  const tdee = bmr * ACTIVITE_FACTEURS[activite];
  let kcalCible = tdee * (1 + OBJECTIF_AJUSTEMENT[objectif]);

  // Garde-fou : on ne descend jamais sous un plancher raisonnable.
  const plancher = sexe === 'homme' ? 1500 : 1200;
  kcalCible = Math.max(plancher, kcalCible);

  // Arrondi a la dizaine pour un affichage doux.
  kcalCible = Math.round(kcalCible / 10) * 10;

  const split = MACRO_SPLIT[objectif] || MACRO_SPLIT.maintien;
  const macros = {
    proteines: Math.round((kcalCible * split.proteines) / 4),
    glucides: Math.round((kcalCible * split.glucides) / 4),
    lipides: Math.round((kcalCible * split.lipides) / 9),
  };

  const repas = REPARTITION_REPAS[profil.repas_par_jour] || REPARTITION_REPAS[3];

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    kcalCible,
    macros,
    repartitionRepas: repas.map((r) => ({
      ...r,
      kcal: Math.round((kcalCible * r.part) / 10) * 10,
    })),
  };
}

module.exports = {
  ACTIVITE_FACTEURS,
  OBJECTIF_AJUSTEMENT,
  MACRO_SPLIT,
  REPARTITION_REPAS,
  calculerBMR,
  calculerBesoins,
};
