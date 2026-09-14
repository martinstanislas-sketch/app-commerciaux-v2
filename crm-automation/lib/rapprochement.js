'use strict';
// ============================================================================
//  RAPPROCHEMENT DE PERSONNES — proposer, expliquer, ne JAMAIS trancher.
//
//  Le rapprochement Fitness Booster ↔ Deciplus se fait par le nom, et les deux
//  outils ne l'écrivent pas pareil. Relevé sur juillet 2026 :
//
//      Aristide Guev-O-noux       ↔  GUEV-E-NOUX Aristide
//      Shermila Paz Guev-O-noux   ↔  PAZ GUEV-E-NOUX Shermila
//      Pamela De-V-aux            ↔  DE-SV-AUX Pamela
//
//  Une comparaison stricte les déclare « à vérifier » : taux sous-évalué, et
//  quelqu'un part chercher un problème qui n'existe pas.
//
//  ⚠️ CE MODULE NE FUSIONNE RIEN, JAMAIS. Il PROPOSE, avec un score et des
//  raisons lisibles ; c'est un humain qui tranche. Un rapprochement proposé
//  n'est pas compté comme « retrouvé » : il a son propre statut et sa propre
//  colonne dans le décompte.
//
//  ── COMMENT ON COMPARE ────────────────────────────────────────────────────
//  Deux mesures, on garde la meilleure des deux :
//
//   1. PAR MOTS. On apparie les mots des deux identités au mieux, sans tenir
//      compte de l'ordre — Fitness Booster écrit « Prénom Nom », Deciplus
//      « NOM Prénom ». Chaque paire est notée, et la moyenne est PONDÉRÉE PAR
//      LA LONGUEUR DES MOTS : « guevenoux » (9 lettres) pèse plus que
//      « paz » (3). C'est ce qui donne au nom de famille le poids demandé,
//      sans avoir à deviner lequel des mots EST le nom de famille — devinette
//      que les noms composés font échouer (« Shermila Paz Guevonoux »).
//      ⚠️ C'est un PROXY, pas une identification du patronyme : il tient parce
//      qu'un nom de famille est en général plus long qu'un prénom, mais un
//      prénom long (« Bertrand ») pèsera autant. Conséquence assumée : le
//      moteur est également sévère sur un prénom différent et sur un nom
//      différent — les deux sont rejetés, ce qui est le comportement voulu.
//
//   2. PAR CHAÎNE ENTIÈRE, mots recollés, dans les deux ordres. C'est ce qui
//      rattrape « Le Goff » ↔ « Legoff » et « Jean-Pierre » ↔ « JeanPierre »,
//      où le nombre de mots diffère.
//
//  La similarité de deux mots combine Jaro-Winkler (fait pour les noms propres :
//  il favorise les débuts identiques) et une distance d'édition normalisée. On
//  garde la plus PRUDENTE des deux — la plus basse : mieux vaut rater une piste
//  que d'en proposer une fausse.
//
//  ── L'EMAIL ───────────────────────────────────────────────────────────────
//  L'interface l'accepte et le traite comme un signal très fort, MAIS aucune
//  source ne le fournit aujourd'hui : vérifié le 2026-09-14, les exports
//  Deciplus (ventes, encaissements) n'en contiennent aucun, et le détail
//  Fitness Booster non plus. Le code est prêt, la donnée manque.
//  Les emails ne sont comparés qu'ici, en mémoire : jamais stockés en clair
//  dans le rapport (cf. `indices`, qui dit « email identique » sans l'adresse).
// ============================================================================

const R = require('../../public/retention.js');

// ─── SEUILS ─────────────────────────────────────────────────────────────────
//  Calés sur les cas réels de juillet/août 2026 (voir test/rapprochement.test.js).
const SEUIL = {
  tresForte: 0.95,   // « Guevonoux » / « Guevenoux » : une lettre sur neuf
  forte: 0.90,
  moyenne: 0.86,     // en dessous : on ne propose RIEN
};
// Deux candidats dont les scores sont plus proches que ça sont réputés
// indiscernables : on ne tranche pas à leur place.
const ECART_AMBIGU = 0.02;
const MOT_MIN = 4;   // un mot plus court ressemble à trop d'autres

// ─── NORMALISATION (pour la COMPARAISON seulement) ──────────────────────────
//  Accents, casse, apostrophes, tirets, espaces multiples, ponctuation. On ne
//  touche jamais à la graphie d'origine : elle reste affichée telle quelle.
function normaliser(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // accents : Élodie -> Elodie
    .replace(/[''`´]/g, ' ')                            // O'Brien -> O Brien
    .replace(/[-_]/g, ' ')                              // Jean-Pierre -> Jean Pierre
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim().replace(/\s+/g, ' ');
}
const mots = (s) => normaliser(s).split(' ').filter(Boolean);

// ─── JARO-WINKLER ───────────────────────────────────────────────────────────
//  Conçu pour les noms propres : il tolère les transpositions et récompense un
//  début identique, ce qui est exactement le comportement voulu sur des
//  patronymes (« GUEVENOUX » / « GUEVONOUX »).
function jaro(a, b) {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const portee = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const prisA = new Array(a.length).fill(false);
  const prisB = new Array(b.length).fill(false);
  let communs = 0;
  for (let i = 0; i < a.length; i++) {
    const debut = Math.max(0, i - portee);
    const fin = Math.min(i + portee + 1, b.length);
    for (let j = debut; j < fin; j++) {
      if (prisB[j] || a[i] !== b[j]) continue;
      prisA[i] = true; prisB[j] = true; communs++;
      break;
    }
  }
  if (!communs) return 0;
  let transpositions = 0, k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!prisA[i]) continue;
    while (!prisB[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  transpositions /= 2;
  return (communs / a.length + communs / b.length + (communs - transpositions) / communs) / 3;
}

function jaroWinkler(a, b, p = 0.1) {
  const j = jaro(a, b);
  let prefixe = 0;
  while (prefixe < 4 && prefixe < a.length && prefixe < b.length && a[prefixe] === b[prefixe]) prefixe++;
  return j + prefixe * p * (1 - j);
}

// ─── DISTANCE D'ÉDITION, NORMALISÉE ─────────────────────────────────────────
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prec = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prec[j] + 1, cur[j - 1] + 1, prec[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prec = cur;
  }
  return prec[b.length];
}
const levNorm = (a, b) => (a.length || b.length
  ? 1 - levenshtein(a, b) / Math.max(a.length, b.length) : 1);

// Similarité de DEUX MOTS : la plus prudente des deux mesures.
//  Jaro-Winkler seul est trop généreux sur les mots courts (« ROI »/« ROY »
//  frôle 0,93) ; la distance normalisée seule ignore les transpositions. En
//  gardant la plus basse, on n'accepte que ce sur quoi les deux s'accordent.
function similariteMot(a, b) {
  if (a === b) return 1;
  return Math.min(jaroWinkler(a, b), levNorm(a, b));
}

// ─── COMPARAISON DE DEUX IDENTITÉS ──────────────────────────────────────────
//  Apparie les mots au mieux (glouton sur la meilleure paire restante), sans
//  tenir compte de l'ordre. Moyenne PONDÉRÉE PAR LA LONGUEUR : le mot long —
//  en pratique le patronyme — pèse davantage. Un mot non apparié compte pour 0
//  avec son propre poids : une identité amputée ne peut pas bien scorer.
function scoreParMots(a, b) {
  const restA = a.slice();
  const restB = b.slice();
  const paires = [];
  while (restA.length && restB.length) {
    let meilleur = { s: -1, i: 0, j: 0 };
    restA.forEach((x, i) => restB.forEach((y, j) => {
      const s = similariteMot(x, y);
      if (s > meilleur.s) meilleur = { s, i, j };
    }));
    paires.push({ a: restA[meilleur.i], b: restB[meilleur.j], score: meilleur.s });
    restA.splice(meilleur.i, 1);
    restB.splice(meilleur.j, 1);
  }
  const orphelins = restA.concat(restB);
  let num = 0, den = 0;
  paires.forEach((p) => { const poids = Math.max(p.a.length, p.b.length); num += p.score * poids; den += poids; });
  orphelins.forEach((m) => { den += m.length; });       // pénalise, sans numérateur
  return { score: den ? num / den : 0, paires };
}

// Mots recollés : rattrape « Le Goff » / « Legoff », où le nombre de mots
// diffère et où la comparaison mot à mot ne peut rien.
//  ⚠️ Il faut essayer PLUSIEURS ORDRES des deux côtés. « Marie Le Goff » vs
//  « LEGOFF Marie » ne se recolle bien que si l'on retourne le SECOND :
//  « MARIELEGOFF » = « MARIELEGOFF ». Trois variantes suffisent (telle quelle,
//  retournée, triée) ; on garde la meilleure des neuf comparaisons.
const variantes = (t) => [t.join(''), t.slice().reverse().join(''), t.slice().sort().join('')];
function scoreParChaine(a, b) {
  let meilleur = 0;
  variantes(a).forEach((x) => variantes(b).forEach((y) => {
    const s = similariteMot(x, y);
    if (s > meilleur) meilleur = s;
  }));
  return meilleur;
}

//  Rend { score, indices[], paires } — ou null si les identités sont vides.
//  `indices` est la RAISON lisible du rapprochement, celle qu'affiche l'écran.
function comparerIdentites(identiteA, identiteB) {
  const a = mots(identiteA);
  const b = mots(identiteB);
  if (!a.length || !b.length) return null;

  const parMots = scoreParMots(a, b);
  const parChaine = scoreParChaine(a, b);
  const score = Math.max(parMots.score, parChaine);

  const indices = [];
  const exactes = parMots.paires.filter((p) => p.score === 1);
  const approchees = parMots.paires.filter((p) => p.score < 1);
  // On nomme le mot long « nom », le court « prénom » : c'est faux dans
  // l'absolu, mais c'est ce que l'œil lit, et ça reste une EXPLICATION, pas
  // une donnée de calcul.
  const plusLong = (p) => Math.max(p.a.length, p.b.length);
  exactes.sort((x, y) => plusLong(y) - plusLong(x));
  approchees.sort((x, y) => plusLong(y) - plusLong(x));
  exactes.forEach((p) => indices.push((plusLong(p) >= 5 ? 'nom' : 'prénom') + ' identique'));
  approchees.forEach((p) => {
    indices.push((plusLong(p) >= 5 ? 'nom' : 'prénom') + ' similaire à '
      + Math.round(p.score * 100) + ' %');
  });
  if (parChaine > parMots.score) indices.push('même nom écrit en un mot ou en deux');
  if (a.join(' ') !== b.join(' ') && a.slice().sort().join(' ') === b.slice().sort().join(' ')) {
    indices.push('prénom et nom inversés');
  }
  return { score, indices, paires: parMots.paires };
}

const niveauDe = (score) => (score >= SEUIL.tresForte ? 'tres_forte'
  : score >= SEUIL.forte ? 'forte'
    : score >= SEUIL.moyenne ? 'moyenne' : 'faible');

// ─── RECHERCHE DU CANDIDAT ──────────────────────────────────────────────────
//  `lignes` : les lignes du journal des ventes (adherent, site, idClient…).
//  `email`  : celui du signataire, si un jour une source en fournit un.
//
//  Rend { candidat, score, niveau, indices, ambigu, second } ou null.
//  AMBIGU : deux candidats trop proches l'un de l'autre — on ne tranche pas,
//  c'est précisément le cas où un rapprochement automatique se tromperait.
function proposer(identite, lignes, options = {}) {
  const { email = '', emailDe = null, exclure = [] } = options;
  const bannis = new Set((exclure || []).map(String));
  const vus = new Map();

  (lignes || []).forEach((l) => {
    const nom = (l && l.adherent) || '';
    const id = String((l && l.idClient) || '');
    if (!nom || vus.has(nom) || bannis.has(id)) return;

    const cmp = comparerIdentites(identite, nom);
    if (!cmp) return;

    // L'EMAIL, quand il existe, est une preuve bien plus forte que le nom.
    const mailB = emailDe ? String(emailDe(l) || '').trim().toLowerCase() : '';
    const mailA = String(email || '').trim().toLowerCase();
    const memeEmail = !!mailA && mailA === mailB;

    let score = cmp.score;
    const indices = cmp.indices.slice();
    if (memeEmail) {
      indices.unshift('email identique');
      // Un email identique emporte la décision, même sur un nom très différent
      // — mais le dossier reste une PROPOSITION, et l'écart de nom est DIT.
      if (cmp.score < SEUIL.forte) indices.push('⚠ nom différent');
      score = Math.max(score, 0.99);
    }
    if (!memeEmail && niveauDe(score) === 'faible') return;
    // Un rapprochement qui ne tient qu'à des mots très courts est trop fragile.
    const plusLongMot = Math.max(...mots(identite).map((m) => m.length), 0);
    if (!memeEmail && plusLongMot < MOT_MIN) return;

    vus.set(nom, {
      adherent: nom, site: l.site || '', idClient: id,
      score: +score.toFixed(4), niveau: niveauDe(score), indices, memeEmail,
    });
  });

  const liste = [...vus.values()].sort((p, q) => q.score - p.score
    || p.adherent.localeCompare(q.adherent, 'fr'));
  if (!liste.length) return null;

  const premier = liste[0];
  const second = liste[1] || null;
  const ambigu = !!second && (premier.score - second.score) < ECART_AMBIGU;
  return Object.assign({}, premier, {
    ambigu,
    // Le second n'est rendu que s'il est vraiment dans le même mouchoir : c'est
    // l'information qui dit « ne me crois pas sur parole », pas une liste de dix.
    second: ambigu ? { adherent: second.adherent, score: second.score, idClient: second.idClient } : null,
    nbCandidats: liste.length,
  });
}

module.exports = {
  normaliser, mots, jaro, jaroWinkler, levenshtein, levNorm, similariteMot,
  comparerIdentites, niveauDe, proposer, SEUIL, ECART_AMBIGU, MOT_MIN,
};
