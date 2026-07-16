'use strict';
// ============================================================================
//  EBOOKS — quel guide vient d'où. Répartition VALIDÉE par Stan, par id.
//
//  Trois canaux, sans doublon : 1 offert + 12 par le Chemin + 22 par le Punch = 35.
//
//  ⚠️ Le marquage n'est PAS écrit en base : il se calcule ICI, à la lecture. Une
//  seule source de vérité, et un ebook qui change de canal ne demande aucune
//  migration. (Même choix que pour les lots vidéo : la base dit ce qu'un client A
//  FAIT, ce fichier dit les RÈGLES.)
//
//  ⚠️ Les ids viennent de la PROD (ebooks téléversés par l'admin). Un id absent de
//  ce fichier n'est pas verrouillé à vie : il retombe sur son `unlock_day`
//  historique (cf. server.js) — un nouvel ebook ajouté demain reste accessible.
// ============================================================================

// Offert dès le départ, jamais verrouillé.
const EBOOK_INTRO = 4; // « Trouve ton rythme même avec une vie chargée » (MINDSET)

// Jour du Chemin -> id. Ce sont EXACTEMENT les étapes « Découvre ton ebook ».
// L'ebook s'ouvre quand le client ATTEINT le jour : c'est en l'ouvrant qu'il
// valide l'étape. L'exiger « étape faite » serait circulaire — l'étape ne peut
// pas se valider sans avoir ouvert l'ebook qu'elle verrouille.
const EBOOK_CHEMIN = {
  2: 14,  // Apéro
  4: 3,   // Prépare tes repas
  9: 9,   // Renforce-toi chez toi
  11: 10, // Reprends le cap après un écart
  16: 16, // Deviens la personne qui prend soin de toi
  18: 17, // Dors mieux
  23: 24, // Augmente tes pas
  25: 22, // Garde le cap entourage
  30: 21, // Pense comme ceux qui tiennent
  32: 29, // Objectif ventre plus plat
  37: 36, // Maintiens tes résultats
  39: 39, // Trouve ton vrai pourquoi
};

// Palier de Punch cumulé -> ids ouverts à ce palier (2+3+3+3+3+4+4 = 22).
const EBOOK_PUNCH = {
  150: [8, 31],
  350: [12, 11, 6],
  550: [15, 13, 18],
  800: [20, 25, 28],
  1050: [19, 26, 33],
  1300: [23, 32, 30, 37],
  1600: [34, 35, 38, 7],
};

// D'où vient cet ebook ? null = inconnu de la répartition (cf. avertissement plus haut).
function sourceEbook(id) {
  const n = Number(id);
  if (n === EBOOK_INTRO) return { source: 'intro' };
  const jour = Object.keys(EBOOK_CHEMIN).find((j) => EBOOK_CHEMIN[j] === n);
  if (jour !== undefined) return { source: 'chemin', jour: Number(jour) };
  const seuil = Object.keys(EBOOK_PUNCH).find((s) => EBOOK_PUNCH[s].includes(n));
  if (seuil !== undefined) return { source: 'punch', seuil: Number(seuil) };
  return null;
}

// Tous les ids rangés (sert aux contrôles : 35, sans doublon, sans orphelin).
function idsRepartis() {
  return [EBOOK_INTRO, ...Object.values(EBOOK_CHEMIN), ...Object.values(EBOOK_PUNCH).flat()];
}

module.exports = { EBOOK_INTRO, EBOOK_CHEMIN, EBOOK_PUNCH, sourceEbook, idsRepartis };
