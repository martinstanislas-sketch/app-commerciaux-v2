'use strict';
// ============================================================================
//  SÉANCES VIDÉO — parsing YouTube + catalogue des 27 séances.
//
//  Pur (aucune DB, aucun DOM) -> testable directement.
//
//  Déblocage : RIEN n'est offert au départ. 5 lots sur le Punch cumulé, selon
//  VIDEO_LOTS de lib/punchSeuils.js (250 / 650 / 1050 / 1450 / 1750) :
//  5 + 5 + 5 + 6 + 6 = 27. Les lots mélangent les groupes musculaires et les
//  coachs : chaque palier doit donner un ENTRAÎNEMENT COMPLET possible, pas
//  « 5 fois des biceps ».
// ============================================================================

// Extrait l'ID d'une URL YouTube. Accepte youtu.be, /watch?v=, /embed/, /shorts/,
// avec ou sans paramètres. Renvoie '' si ce n'est pas une URL YouTube exploitable
// -> l'admin refuse l'enregistrement plutôt que de stocker un lien mort.
function extraireYoutubeId(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  const motifs = [
    /(?:youtu\.be\/)([A-Za-z0-9_-]{11})/,                    // youtu.be/<ID>
    /(?:youtube\.com\/watch\?[^#]*\bv=)([A-Za-z0-9_-]{11})/, // /watch?v=<ID> (v= où qu'il soit)
    /(?:youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,          // /embed/<ID>
    /(?:youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,         // /shorts/<ID>
    /(?:youtube-nocookie\.com\/embed\/)([A-Za-z0-9_-]{11})/,
  ];
  for (const re of motifs) { const m = re.exec(s); if (m) return m[1]; }
  // Dernier recours : un ID nu (11 caractères) collé tel quel par le coach.
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  return '';
}
function miniatureYoutube(id) { return id ? 'https://img.youtube.com/vi/' + id + '/hqdefault.jpg' : ''; }
// nocookie : pas de cookie YouTube tant que le client ne lance pas la lecture.
function lecteurYoutube(id) { return id ? 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0&modestbranding=1&playsinline=1' : ''; }

// Les 27 séances. `lot` 1..5 = le palier qui les ouvre.
//
// `coach` = LA PERSONNE SUR LA MINIATURE (vérifiée visuellement, jamais
// « Générique » : ces gabarits-là montrent tous Quentin). Visages recensés :
// Quentin ×10, Alexandre ×7, Gauthier ×5, Théo ×2, Mathys ×2, Antton ×1.
//
// Répartition des VISAGES, équilibrée sur les 5 lots : chaque lot = 2 Quentin
// (10/5, impossible de faire moins) + 1-2 Alexandre + 1 Gauthier + 1 invité
// (Théo / Mathys / Antton) -> jamais plus de 2 fois le même visage dans un lot,
// 4 visages différents partout (l'ancien lot 5 montrait 4× Quentin). Les groupes
// musculaires restent mélangés : chaque palier permet un entraînement complet.
const VIDEOS_SEED = [
  // Lot 1 (250 Punch) — de quoi s'entraîner tout de suite : un full body, du
  // renfo complet, du cardio, une mini session et de la récupération.
  { lot: 1, coach: 'Quentin', titre: 'Full body', url: 'https://youtu.be/qAyrBCA-NQE' },
  { lot: 1, coach: 'Quentin', titre: 'Renforcement musculaire', url: 'https://youtu.be/Ki6lzNbqviU' },
  { lot: 1, coach: 'Théo', titre: 'Cardio express', url: 'https://youtu.be/wfR-_3Ec-MY' },
  { lot: 1, coach: 'Alexandre', titre: 'Mini session', url: 'https://youtu.be/nEvoo47TCuM' },
  { lot: 1, coach: 'Gauthier', titre: 'Stretching', url: 'https://youtu.be/eAWTKxmJV_s' },
  // Lot 2 (650) — on monte en intensité : tabata, élastiques, abdos, haut, bas.
  { lot: 2, coach: 'Quentin', titre: 'Tabata', url: 'https://youtu.be/isNbt6B308Y' },
  { lot: 3, coach: 'Quentin', titre: 'Spéciale élastique', url: 'https://youtu.be/3lWb5YJUuh8' },
  { lot: 4, coach: 'Mathys', titre: 'Abdos', url: 'https://youtu.be/EAd44vWugOk' },
  { lot: 4, coach: 'Gauthier', titre: 'Pectoraux / Trapèzes', url: 'https://youtu.be/z6Br50fxzak' },
  { lot: 4, coach: 'Alexandre', titre: 'Bas du corps', url: 'https://youtu.be/e59hHr0JNu0' },
  // Lot 3 (1050) — full body, amrap, HIIT et du travail des bras.
  { lot: 5, coach: 'Quentin', titre: 'Full body A', url: 'https://youtu.be/AmRkZ3ohAeo' },
  { lot: 6, coach: 'Quentin', titre: 'Amrap A', url: 'https://youtu.be/vvfcNl9-3qA' },
  { lot: 6, coach: 'Gauthier', titre: 'HIIT', url: 'https://youtu.be/26q1pYpY0Cg' },
  { lot: 6, coach: 'Alexandre', titre: 'Biceps', url: 'https://youtu.be/RmzmZhk4swU' },
  { lot: 6, coach: 'Mathys', titre: 'Full body', url: 'https://youtu.be/AJlUFD4-Aec' },
  // Lot 4 (1450) — 6 séances : amrap, renfo haut, épaules, bas, abdos, gainage.
  { lot: 7, coach: 'Quentin', titre: 'Amrap B', url: 'https://youtu.be/bbxhBoPhfOo' },
  { lot: 8, coach: 'Quentin', titre: 'Renfo haut du corps', url: 'https://youtu.be/Llh_g4sSnhM' },
  { lot: 8, coach: 'Alexandre', titre: 'Épaules, bras & gainage', url: 'https://youtu.be/zLL6ZnKcr7o' },
  { lot: 8, coach: 'Alexandre', titre: 'Quadriceps & fessiers', url: 'https://youtu.be/4Vb9UygtQDA' },
  { lot: 8, coach: 'Gauthier', titre: 'Abdos', url: 'https://youtu.be/3O_N8u_Kaak' },
  { lot: 8, coach: 'Théo', titre: 'Gainage', url: 'https://youtu.be/0SmjUiOFfDg' },
  // Lot 5 (1750) — 6 séances pour ceux qui vont au bout : full body, boxe,
  // haut du corps, triceps, cardio, abdos.
  { lot: 9, coach: 'Quentin', titre: 'Full body B', url: 'https://youtu.be/gc4Xbz-27Hw' },
  { lot: 10, coach: 'Quentin', titre: 'Cardio + renfo + boxe', url: 'https://youtu.be/kL2BbwOCpL0' },
  { lot: 10, coach: 'Alexandre', titre: 'Haut du corps', url: 'https://youtu.be/fs3pg2fo6Ho' },
  { lot: 10, coach: 'Alexandre', titre: 'Triceps', url: 'https://youtu.be/B1jt8gr25-w' },
  { lot: 10, coach: 'Gauthier', titre: 'Cardio 40/20', url: 'https://youtu.be/ZXdD72vpdrY' },
  { lot: 10, coach: 'Antton', titre: 'Abdos spéciale', url: 'https://youtu.be/O4tTeQY2Yiw' },
];

// Combien de séances par lot -> doit coller à 5/5/5/6/6.
// ⚠️ Tailles INÉGALES, et une par seuil de VIDEO_LOTS. Les premiers lots sont
// chargés pour qu'aucune vidéo déjà accessible ne se re-verrouille (cf. le
// commentaire de VIDEO_LOTS dans punchSeuils.js). Un test le vérifie.
const TAILLE_LOTS = [5, 1, 1, 3, 1, 4, 1, 5, 1, 5];

module.exports = { extraireYoutubeId, miniatureYoutube, lecteurYoutube, VIDEOS_SEED, TAILLE_LOTS };
