'use strict';
// ============================================================================
//  BILAN HEBDO — logique PURE (aucune DB, aucun DOM), donc testable directement.
//
//  Partage des rôles (décision produit) :
//   - l'APP calcule les chiffres (déterministe, exact) -> `stats` ;
//   - CE MODULE choisit les points forts / axes à partir de seuils, et sait
//     rédiger le texte par MODÈLES ;
//   - l'IA (si une clé est configurée côté serveur) ne fait qu'HABILLER ces
//     mêmes chiffres. Elle n'en invente aucun, et son absence ne bloque rien :
//     le modèle est le repli, jamais un écran vide.
//
//  RÈGLE PRODUIT NON NÉGOCIABLE : ton toujours positif et motivant, jamais
//  culpabilisant. Un axe est un objectif pour la semaine qui vient (« vise… »),
//  jamais un reproche. Même une toute petite semaine ressort encourageante.
// ============================================================================

const MAX_FORTS = 4;   // au-delà, plus rien ne ressort : on dilue la fierté
const MAX_AXES = 2;    // 3 axes = une liste de reproches déguisée
const MIN_FORTS = 2;   // même une semaine à 1 jour gagné doit donner 2 réussites

// Chaque règle : { cle, si(stats) -> bool, texte(stats) -> string }.
// L'ordre = la priorité : on garde les premières jusqu'au plafond.
const REGLES_FORTS = [
  { cle: 'regularite', si: (s) => s.joursGagnes >= 6,
    texte: (s) => `Tu as noté tes repas ${s.joursGagnes} jours sur 7 — c'est une régularité de fond.` },
  { cle: 'seances', si: (s) => s.seancesPrevues > 0 && s.seancesValidees >= s.seancesPrevues,
    texte: (s) => `${s.seancesValidees} séance${s.seancesValidees > 1 ? 's' : ''} validée${s.seancesValidees > 1 ? 's' : ''} : ton objectif de la semaine est atteint.` },
  { cle: 'serie', si: (s) => s.streakFin > s.streakDebut,
    texte: (s) => `Ta série est montée à ${s.streakFin} jour${s.streakFin > 1 ? 's' : ''} — tu construis une habitude.` },
  { cle: 'repas', si: (s) => s.repasPossibles > 0 && (s.repasRenseignes / s.repasPossibles) >= 0.8,
    texte: (s) => `${s.repasRenseignes} repas renseignés sur ${s.repasPossibles} : tu gardes le cap sur ton suivi.` },
  { cle: 'communaute', si: (s) => s.actionsCommunaute >= 1,
    texte: (s) => `Tu as participé au groupe ${s.actionsCommunaute} fois : ça compte pour toi, et pour les autres.` },
  { cle: 'ebooks', si: (s) => s.ebooksLus >= 2,
    texte: (s) => `${s.ebooksLus} guides ouverts — tu t'informes, c'est ce qui rend les choix plus faciles.` },
  { cle: 'seances_partiel', si: (s) => s.seancesValidees >= 1,
    texte: (s) => `${s.seancesValidees} séance${s.seancesValidees > 1 ? 's' : ''} au compteur cette semaine.` },
  { cle: 'un_jour', si: (s) => s.joursGagnes >= 1,
    texte: (s) => `Tu as noté ta journée ${s.joursGagnes} fois : chaque jour noté est un jour qui compte.` },
];

// Repli garanti : ces réussites sont vraies pour TOUT LE MONDE, même à zéro.
// Sans elles, une semaine vide donnerait un écran sans aucune réussite -> l'inverse
// exact de ce qu'on veut.
const FORTS_SOCLE = [
  { cle: 'present', texte: () => 'Tu es toujours dans le parcours — c\'est déjà une victoire, beaucoup abandonnent avant.' },
  { cle: 'semaine_neuve', texte: (s) => `La semaine ${s.semaine + 1} repart à zéro : tout est encore devant toi.` },
];

// Les axes sont TOUJOURS tournés vers la semaine à venir (« vise », « essaie »),
// jamais vers celle qui vient de passer (« tu n'as pas… »).
const REGLES_AXES = [
  { cle: 'rythme', si: (s) => s.joursGagnes <= 3,
    texte: () => 'Cette semaine, vise 4 journées notées : c\'est le rythme qui fait la différence, pas la perfection.' },
  { cle: 'seances', si: (s) => s.seancesPrevues > 0 && s.seancesValidees < s.seancesPrevues,
    texte: (s) => `Vise ${s.seancesPrevues} séances cette semaine — pose-les dans ton agenda dès maintenant.` },
  { cle: 'repas', si: (s) => s.repasPossibles > 0 && (s.repasRenseignes / s.repasPossibles) < 0.5,
    texte: () => 'Essaie de noter au moins 2 repas par jour : même « sauté » ou « autre », ça nourrit ton suivi.' },
  { cle: 'ebooks', si: (s) => s.ebooksLus === 0,
    texte: () => 'Ouvre un guide cette semaine : 2 minutes suffisent pour repartir avec une idée en plus.' },
  { cle: 'communaute', si: (s) => s.actionsCommunaute === 0,
    texte: () => 'Passe dire un mot au groupe : encourager quelqu\'un, c\'est aussi s\'encourager soi-même.' },
];

// Points forts + axes, plafonnés. Garantit toujours au moins MIN_FORTS forts.
function highlightsSemaine(stats) {
  const s = normaliserStats(stats);
  const forts = REGLES_FORTS.filter((r) => r.si(s)).map((r) => ({ cle: r.cle, texte: r.texte(s) }));
  // On complète avec le socle SANS jamais dépasser le plafond.
  for (const f of FORTS_SOCLE) {
    if (forts.length >= MIN_FORTS) break;
    forts.push({ cle: f.cle, texte: f.texte(s) });
  }
  const axes = REGLES_AXES.filter((r) => r.si(s)).map((r) => ({ cle: r.cle, texte: r.texte(s) }));
  return { forts: forts.slice(0, MAX_FORTS), axes: axes.slice(0, MAX_AXES) };
}

// Un stats incomplet ne doit jamais faire planter un bilan : on comble à 0.
function normaliserStats(stats) {
  const s = stats || {};
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    semaine: n(s.semaine), joursGagnes: n(s.joursGagnes),
    repasRenseignes: n(s.repasRenseignes), repasPossibles: n(s.repasPossibles),
    streakDebut: n(s.streakDebut), streakFin: n(s.streakFin),
    seancesValidees: n(s.seancesValidees), seancesPrevues: n(s.seancesPrevues),
    ebooksLus: n(s.ebooksLus), actionsCommunaute: n(s.actionsCommunaute),
    deltaMesures: s.deltaMesures || null,
  };
}

// Rédaction par MODÈLES = le repli quand l'IA n'est pas disponible (pas de clé,
// appel en échec, hors-ligne). Doit se suffire à elle-même.
function texteBilanTemplate(stats, highlights, opts) {
  const s = normaliserStats(stats);
  const h = highlights || highlightsSemaine(s);
  const final = !!(opts && opts.final);
  if (final) {
    return {
      intro: 'Six semaines. Tu y es arrivé — et ça, personne ne pourra te l\'enlever.',
      reussites: h.forts.map((f) => f.texte),
      focus: ['Le challenge s\'arrête, pas tes habitudes : garde ce qui t\'a le mieux réussi et lâche le reste.'],
      motFin: 'Bravo pour ces 6 semaines. Ce que tu as construit là, tu le gardes.',
    };
  }
  return {
    intro: `Semaine ${s.semaine} bouclée. Voilà ce que tu en retiens.`,
    reussites: h.forts.map((f) => f.texte),
    focus: h.axes.length ? h.axes.map((a) => a.texte) : ['Continue exactement comme ça : ton rythme est bon, garde-le.'],
    motFin: 'On se retrouve la semaine prochaine — un jour à la fois.',
  };
}

// Prompt pour l'IA. Elle HABILLE, elle ne calcule pas : les chiffres et les
// points forts/axes lui sont donnés, elle n'a pas le droit d'en inventer.
function promptBilan(stats, highlights, opts) {
  const s = normaliserStats(stats);
  const h = highlights || highlightsSemaine(s);
  const final = !!(opts && opts.final);
  const system = [
    'Tu rédiges un bilan de coaching nutrition pour un client, en français, au tutoiement.',
    'Utilise UNIQUEMENT les chiffres fournis : n\'en invente aucun, n\'en déduis aucun autre.',
    'Ton chaleureux, positif, motivant, JAMAIS culpabilisant : aucun reproche, aucun jugement.',
    'Les axes sont des objectifs pour la semaine à venir, formulés comme des opportunités.',
    'Court et scannable : des phrases brèves.',
    'Réponds en JSON strict : {"intro":"...","reussites":["..."],"focus":["..."],"motFin":"..."}.',
    final ? 'Il s\'agit du BILAN FINAL des 6 semaines : prends de la hauteur et clôture le parcours.'
      : 'Il s\'agit d\'un bilan HEBDOMADAIRE.',
  ].join('\n');
  const user = JSON.stringify({ chiffres: s, pointsForts: h.forts.map((f) => f.texte), axes: h.axes.map((a) => a.texte) });
  return { system, user };
}

// Garde-fou : l'IA reste un invité, on ne la croit pas sur parole. Une réponse
// mal formée ou vide -> on retombe sur le modèle.
function parseReponseIa(brut) {
  try {
    const m = /\{[\s\S]*\}/.exec(String(brut || ''));
    if (!m) return null;
    const d = JSON.parse(m[0]);
    const liste = (v) => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : []);
    // ⚠️ On REBORNE la réponse : le prompt a beau demander des plafonds, le modèle
    // en rend parfois plus (vu : 3 focus au lieu de 2). Les plafonds sont une règle
    // produit, pas une suggestion -> c'est le code qui tranche, pas l'IA.
    const t = {
      intro: String(d.intro || ''),
      reussites: liste(d.reussites).slice(0, MAX_FORTS),
      focus: liste(d.focus).slice(0, MAX_AXES),
      motFin: String(d.motFin || ''),
    };
    if (!t.intro || !t.reussites.length) return null;
    return t;
  } catch (_) { return null; }
}

module.exports = {
  MAX_FORTS, MAX_AXES, MIN_FORTS,
  highlightsSemaine, texteBilanTemplate, promptBilan, parseReponseIa, normaliserStats,
};
