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

// Jour du Chemin -> id. Ce sont EXACTEMENT les étapes « Découvre ton guide ».
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
// ⚠️ Les seuils suivent le parcours (une récompense par étape) et les paliers
// sont INÉGAUX pour ne jamais re-verrouiller un guide déjà accessible. L'ORDRE
// des identifiants est celui d'avant : un client retrouve ses guides dans la
// même séquence, simplement servis par doses plus petites et plus fréquentes.
const EBOOK_PUNCH = {
  105: [8, 31],
  160: [12],
  260: [11],
  345: [6],
  495: [15, 13, 18],
  580: [20],
  595: [25, 28],
  905: [19],
  960: [26, 33],
  1285: [23, 32, 30, 37],
  1325: [34, 35, 38, 7],
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

// Le VERROU d'un guide, dit UNE seule fois. La liste, l'ouverture et le fichier
// doivent répondre exactement pareil — sinon un guide affiché « débloqué » reste
// illisible au clic (vécu : les ebooks du canal Punch restaient bloqués au jour,
// parce que les routes de lecture ne vérifiaient que unlock_day).
//   eb  = { id, type, video_lot, unlock_day } (la ligne nutrition_ebooks)
//   qui = { day, punch } (la progression du client)
function estVerrouille(eb, { day = 0, punch = 0 } = {}) {
  const punchSeuils = require('./punchSeuils'); // requis ici : évite tout cycle au chargement
  if ((eb.type || 'ebook') === 'video') {
    // Une vidéo se débloque au PUNCH de son lot ; lot inconnu -> jamais ouvert
    // (plutôt qu'ouvert à tous par accident).
    const seuil = punchSeuils.VIDEO_LOTS[Math.max(0, Number(eb.video_lot) - 1)];
    return seuil == null ? true : punch < seuil;
  }
  const src = sourceEbook(eb.id);
  if (!src) return day < (Number(eb.unlock_day) || 0); // hors répartition -> règle historique
  if (src.source === 'intro') return false;
  if (src.source === 'chemin') return day < src.jour;
  return punch < src.seuil; // canal Punch : le jour n'a AUCUN mot à dire
}

module.exports = { EBOOK_INTRO, EBOOK_CHEMIN, EBOOK_PUNCH, sourceEbook, idsRepartis, estVerrouille };
