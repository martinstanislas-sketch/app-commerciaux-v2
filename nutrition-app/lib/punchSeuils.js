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

// ⚠️ LES SEUILS SUIVENT LE PARCOURS, ils ne sont pas des nombres ronds choisis
// à la main. Chacun vaut le cumul de Punch d'un parcours parfait À UNE ÉTAPE
// PRÉCISE (cf. CUMUL_PUNCH_PARFAIT) : c'est ce qui fait tomber une récompense — et
// une seule — à chaque action. Avant, les seuils ronds tombaient n'importe où sur
// la courbe : 23 étapes sur 43 ne débloquaient rien, et une seule en débloquait
// cinq d'un coup. Déplacer un seuil au hasard casse cette propriété.
//
// ⚠️ Les LOTS SONT INÉGAUX (5, 1, 1, 3…) et c'est voulu : à chaque niveau de
// Punch, le client doit avoir au moins autant de contenu qu'avec l'ancien
// découpage, sinon des vidéos déjà accessibles disparaîtraient. Les premiers
// lots sont donc chargés (l'ancien 1er lot donnait 5 vidéos dès 250). Un test
// verrouille cette non-régression.
const VIDEO_LOTS = [175, 305, 360, 540, 790, 945, 1245, 1310, 1690, 1715];
// Paliers d'ebooks : seuil -> nombre d'ebooks ouverts à ce palier.
const EBOOK_TIERS = { 105: 2, 160: 1, 260: 1, 345: 1, 495: 3, 580: 1, 595: 2, 905: 1, 960: 2, 1285: 4, 1325: 4 };
// Cadeaux : seuil de Punch -> identifiant du cadeau (paliers, jamais débités).
// Les dix premiers tombent sur une étape du parcours. Les quatre derniers sont
// AU-DESSUS de 2395 (le maximum d'un parcours parfait) : ils exigent des
// missions bonus, et restent donc une récompense d'exception.
const GIFTS = {
  200: 'bilan_proche',
  320: 'badge_argent',
  515: 'chanson',
  620: 'ambassadeur',
  920: 'coaching_individuel',
  1225: 'acces_prioritaire',
  1350: 'badge_or',
  1670: 'deux_semaines_proche',
  1730: 'coaching_nutrition',
  2295: 'mois_offert',
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
