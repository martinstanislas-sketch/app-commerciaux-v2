'use strict';
// ============================================================================
//  SEUILS DE PUNCH — LA source de vérité des déblocages.
//
//  Tout ce qui se débloque dans l'app (vidéos, ebooks, cadeaux) est décrit ICI
//  et nulle part ailleurs. Les prompts suivants brancheront leurs récompenses sur
//  ce fichier : personne ne redéclare un seuil dans son coin.
//
//  Le compteur de référence est `punch` (user_game_stats) : CUMULÉ, jamais
//  débité. Un déblocage s'obtient en ATTEIGNANT un seuil, et reste acquis —
//  il n'y a pas d'achat, donc pas de solde qui redescend.
//
//  ⚠️ Plafond : 4095 Punch max (parcours 1180 + série 1215 + missions bonus 1700).
//  Un seuil au-dessus serait inatteignable -> PUNCH_MAX_THEORIQUE + un test le
//  verrouillent.
// ============================================================================

const PUNCH_MAX_THEORIQUE = 4095;

// Lots de vidéos : chaque seuil ouvre un lot (le n-ième lot = index + 1).
const VIDEO_LOTS = [250, 650, 1050, 1450, 1750];
// Paliers d'ebooks : seuil -> nombre d'ebooks ouverts à ce palier.
const EBOOK_TIERS = { 150: 2, 350: 3, 550: 3, 800: 3, 1050: 3, 1300: 4, 1600: 4 };
// Cadeaux : seuil de Punch -> identifiant du cadeau (paliers, jamais débités).
const GIFTS = {
  300: 'bilan_proche',
  450: 'badge_argent',
  600: 'chanson',
  800: 'ambassadeur',
  1000: 'coaching_individuel',
  1200: 'acces_prioritaire',
  1350: 'badge_or',
  1500: 'deux_semaines_proche',
  1800: 'coaching_nutrition',
  2000: 'mois_offert',
  2500: 'badge_platine',
  3000: 'remise_abo',
  3500: 'shooting',
  4000: 'massage',
};

// Accessoires d'avatar : la condition est déclarée UNE SEULE FOIS, dans le
// catalogue de lib/avatar.js (le front en a besoin pour afficher « Encore X
// PUNCH »). On la DÉRIVE ici plutôt que de la recopier — sinon les deux
// listes divergeraient au premier ajout d'accessoire.
// Une condition de type « badge » est ramenée au seuil de Punch du cadeau
// correspondant : c'est ce Punch-là qui la rend atteignable.
function avatarSeuils() {
  let catalogue = [];
  try { catalogue = require('./avatar').ACCESSOIRES || []; } catch (_) { return []; }
  const seuilDuCadeau = (id) => {
    const cle = Object.keys(GIFTS).find((s) => GIFTS[s] === id);
    return cle ? Number(cle) : null;
  };
  return catalogue.map((a) => {
    const seuil = a.condition.type === 'badge' ? seuilDuCadeau(a.condition.valeur) : Number(a.condition.valeur);
    return seuil ? { seuil, type: 'avatar', payload: { accessoire: a.id } } : null;
  }).filter(Boolean);
}

// Tous les déblocages, à plat et triés par seuil.
// ⚠️ Un même seuil peut porter PLUSIEURS récompenses (800 = ebooks + cadeau,
// 1050 = vidéos + ebooks) : la paire (seuil, type) est l'identité, pas le seuil.
function tousLesSeuils() {
  const out = [];
  VIDEO_LOTS.forEach((seuil, i) => out.push({ seuil, type: 'video', payload: { lot: i + 1 } }));
  Object.keys(EBOOK_TIERS).forEach((s) => out.push({ seuil: Number(s), type: 'ebook', payload: { nombre: EBOOK_TIERS[s] } }));
  Object.keys(GIFTS).forEach((s) => out.push({ seuil: Number(s), type: 'gift', payload: { cadeau: GIFTS[s] } }));
  avatarSeuils().forEach((a) => out.push(a));
  return out.sort((a, b) => a.seuil - b.seuil || a.type.localeCompare(b.type));
}

// Ce qui est atteint avec `total` Punch. `deja` = clés déjà débloquées -> on ne
// renvoie que le NOUVEAU (idempotence).
function seuilsAtteints(total, deja) {
  const n = Number(total) || 0;
  const vus = deja instanceof Set ? deja : new Set(Array.isArray(deja) ? deja : []);
  return tousLesSeuils().filter((s) => n >= s.seuil && !vus.has(cleSeuil(s)));
}

// Identité d'un déblocage : seuil + type (jamais le seuil seul).
function cleSeuil(s) { return s.seuil + ':' + s.type; }

// Prochain déblocage à viser -> le front peut afficher « encore X Punch ».
function prochainSeuil(total) {
  const n = Number(total) || 0;
  return tousLesSeuils().find((s) => s.seuil > n) || null;
}

module.exports = {
  PUNCH_MAX_THEORIQUE, VIDEO_LOTS, EBOOK_TIERS, GIFTS, avatarSeuils,
  tousLesSeuils, seuilsAtteints, cleSeuil, prochainSeuil,
};
