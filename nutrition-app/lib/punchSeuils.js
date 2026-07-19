'use strict';
// ============================================================================
//  SEUILS DE PUNCH — LA source de vérité des déblocages.
//
//  ⚠️ LES SEUILS NE SONT PLUS ÉCRITS ICI. Ils vivent dans la DONNÉE :
//    - `lib/deblocages.json` = la table de référence (le seed, versionné) ;
//    - la table `nutrition_deblocages` en base = ce qui fait foi en production,
//      éditable depuis le panneau admin SANS redéploiement.
//  Ce fichier ne fait plus que LIRE cette table et en déduire ce dont le moteur
//  a besoin. Changer un seuil ne demande donc plus de toucher au code.
//
//  Le serveur injecte la table de la base au démarrage (et après chaque édition)
//  via `setTable`. Sans injection — tests, outils hors ligne —, le JSON sert de
//  repli : le module reste PUR et testable sans base.
//
//  Le compteur de référence est `punch` (user_game_stats) : CUMULÉ, jamais
//  débité. Un déblocage s'obtient en ATTEIGNANT un seuil, et reste acquis —
//  il n'y a pas d'achat, donc pas de solde qui redescend.
//
//  ⚠️ Plafond : 4305 Punch max — parcours 1180 + série 1215 + missions bonus
//  1700 + bonus de séance 210 (42 jours × 5, cf. PUNCH_SEANCE_BONUS).
//  Un seuil au-dessus serait inatteignable -> PUNCH_MAX_THEORIQUE + un test le
//  verrouillent.
//
//  ⚠️ GRANULARITÉ : une ligne = UN contenu. Les vidéos et les guides tombaient
//  autrefois par LOTS (10 lots, 11 paliers) ; ils tombent désormais un par un,
//  chacun avec son seuil. Cadeaux, badges et accessoires n'ont pas bougé d'un
//  Punch — seule la distribution du contenu a changé.
// ============================================================================

const REFERENCE = require('./deblocages.json');

const PUNCH_MAX_THEORIQUE = 4305;

// La table courante. Remplacée par la base au boot ; sinon c'est la référence.
let TABLE = normaliser(REFERENCE.deblocages);

// Nettoie et trie : le reste du module suppose une table triée et bien formée.
// Une ligne inexploitable est ÉCARTÉE plutôt que de faire tomber le moteur —
// un seuil mal saisi en admin ne doit pas priver tout le monde de récompenses.
function normaliser(lignes) {
  return (Array.isArray(lignes) ? lignes : [])
    .map((d) => ({
      seuil: Number(d.seuil),
      type: String(d.type || ''),
      nom: String(d.nom || ''),
      rang: d.rang == null ? null : Number(d.rang),
      ref: d.ref || null,
      bonus_accessoire: d.bonus_accessoire || null,
    }))
    .filter((d) => Number.isFinite(d.seuil) && d.seuil > 0 && d.type)
    .sort((a, b) => a.seuil - b.seuil || a.type.localeCompare(b.type));
}

// Le serveur appelle ceci au démarrage et après chaque édition admin.
// Une table vide est REFUSÉE : mieux vaut la référence que plus rien du tout.
function setTable(lignes) {
  const t = normaliser(lignes);
  if (!t.length) return false;
  TABLE = t;
  return true;
}
function table() { return TABLE; }
function tableReference() { return normaliser(REFERENCE.deblocages); }

// ── CE QUE LE MOTEUR EN DÉDUIT ──────────────────────────────────────────────
// Seuil de la n-ième vidéo / du n-ième guide (n commence à 1).
// `null` = ce rang n'est pas dans la table -> le contenu reste verrouillé,
// jamais ouvert à tous par accident.
function seuilVideo(rang) { return seuilParRang('video', rang); }
function seuilGuide(rang) { return seuilParRang('guide', rang); }
function seuilParRang(type, rang) {
  const n = Number(rang);
  if (!Number.isFinite(n) || n < 1) return null;
  const l = TABLE.find((d) => d.type === type && d.rang === n);
  return l ? l.seuil : null;
}
function nbDeType(type) { return TABLE.filter((d) => d.type === type).length; }

// Cadeaux : seuil -> identifiant. Les badges SONT des cadeaux (ils ont leur bon
// et leur fiche) : ils partagent la même table, seul leur affichage diffère.
function gifts() {
  const out = {};
  TABLE.filter((d) => (d.type === 'cadeau' || d.type === 'badge') && d.ref).forEach((d) => { out[d.seuil] = d.ref; });
  return out;
}

// Accessoires d'avatar. Deux origines, une seule sortie :
//   - les lignes `accessoire` de la table ;
//   - le `bonus_accessoire` d'un badge — la médaille tombe AVEC son badge, au
//     même seuil. C'est la règle « un badge débloque aussi sa médaille ».
// ⚠️ On ne renvoie que des accessoires CONNUS du catalogue (lib/avatar.js) :
// une référence morte saisie en admin ne peut pas créer un accessoire fantôme.
function avatarSeuils() {
  let connus = new Set();
  try { connus = new Set((require('./avatar').ACCESSOIRES || []).map((a) => a.id)); } catch (_) { /* catalogue absent */ }
  const out = [];
  TABLE.forEach((d) => {
    if (d.type === 'accessoire' && d.ref) out.push({ seuil: d.seuil, type: 'avatar', payload: { accessoire: d.ref } });
    if (d.bonus_accessoire) out.push({ seuil: d.seuil, type: 'avatar', payload: { accessoire: d.bonus_accessoire } });
  });
  return connus.size ? out.filter((a) => connus.has(a.payload.accessoire)) : out;
}

// Tous les déblocages, à plat et triés par seuil.
// ⚠️ Un même seuil peut porter PLUSIEURS récompenses (un badge + sa médaille) :
// la paire (seuil, type) est l'identité, pas le seuil (cf. cleSeuil).
function tousLesSeuils() {
  const out = [];
  TABLE.forEach((d) => {
    if (d.type === 'video') out.push({ seuil: d.seuil, type: 'video', payload: { rang: d.rang, nom: d.nom } });
    else if (d.type === 'guide') out.push({ seuil: d.seuil, type: 'ebook', payload: { rang: d.rang, nom: d.nom } });
    else if ((d.type === 'cadeau' || d.type === 'badge') && d.ref) out.push({ seuil: d.seuil, type: 'gift', payload: { cadeau: d.ref } });
  });
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

// Identité d'un déblocage : seuil + type. UNE SEULE définition dans toute l'app.
// ⚠️ C'est aussi la CLÉ PRIMAIRE de user_unlocks (client_email, seuil, type) :
// y ajouter le rang ici — ce que j'avais fait — créait deux identités
// divergentes, et la récompense se serait redébloquée à chaque évaluation.
// La contrepartie : deux lignes de MÊME TYPE au MÊME seuil sont indistinguables.
// C'est interdit, et `collisions()` le vérifie avant toute écriture admin.
function cleSeuil(s) { return s.seuil + ':' + s.type; }

// Les paires (seuil, type) en double : une seule survivrait en base, l'autre
// serait perdue en silence. Sert de garde-fou à l'édition des seuils.
function collisions(lignes) {
  const t = lignes ? normaliser(lignes) : TABLE;
  const vus = new Map();
  const dup = [];
  t.forEach((d) => {
    // Un badge et sa médaille partagent le seuil mais pas le type : légitime.
    const k = d.seuil + ':' + (d.type === 'guide' ? 'ebook' : d.type === 'badge' ? 'cadeau' : d.type);
    if (vus.has(k)) dup.push({ seuil: d.seuil, type: d.type, avec: vus.get(k) });
    else vus.set(k, d.nom || d.type);
  });
  return dup;
}

// Prochain déblocage à viser -> le front affiche « Encore X PUNCH ».
function prochainSeuil(total) {
  const n = Number(total) || 0;
  return tousLesSeuils().find((s) => s.seuil > n) || null;
}

// ── COMPATIBILITÉ ───────────────────────────────────────────────────────────
// Anciens noms, conservés le temps que tout l'appelant migre. VIDEO_LOTS et
// EBOOK_TIERS décrivaient des LOTS ; ils sont reconstruits depuis la table pour
// que rien ne casse, mais ils ne sont plus la source de vérité.
Object.defineProperty(module.exports, 'VIDEO_LOTS', {
  enumerable: true,
  get() { return TABLE.filter((d) => d.type === 'video').map((d) => d.seuil); },
});
Object.defineProperty(module.exports, 'EBOOK_TIERS', {
  enumerable: true,
  get() {
    const o = {};
    TABLE.filter((d) => d.type === 'guide').forEach((d) => { o[d.seuil] = (o[d.seuil] || 0) + 1; });
    return o;
  },
});
Object.defineProperty(module.exports, 'GIFTS', { enumerable: true, get: gifts });

Object.assign(module.exports, {
  PUNCH_MAX_THEORIQUE, REFERENCE,
  setTable, table, tableReference, normaliser,
  seuilVideo, seuilGuide, nbDeType, gifts, avatarSeuils, collisions,
  tousLesSeuils, seuilsAtteints, cleSeuil, prochainSeuil,
});
