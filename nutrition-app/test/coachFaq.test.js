'use strict';
// Verrouille le moteur du Coach « réponses préenregistrées » (gratuit) :
// la bonne réponse sort pour les formulations courantes, et le hors-sujet
// ne déclenche RIEN (-> bascule coach humain plutôt qu'une réponse à côté).
const test = require('node:test');
const assert = require('node:assert');
const { matchFaq, COACH_FAQ_SEED, norm } = require('../lib/coachFaq');

// Reproduit les lignes telles que stockées en base (id + champs).
const ROWS = COACH_FAQ_SEED.map((e, i) => ({ id: i + 1, question: e.q, reponse: e.r, mots_cles: e.k, categorie: e.c, actif: 1 }));
function matchedCat(q) { const m = matchFaq(q, ROWS); return m ? m.row.categorie : null; }

function matchedQ(q) { const m = matchFaq(q, ROWS); return m ? m.row.question : null; }

test('graine : au moins 40 réponses, questions uniques, schéma complet', () => {
  assert.ok(COACH_FAQ_SEED.length >= 40, 'attendu >= 40 réponses');
  const qs = new Set(COACH_FAQ_SEED.map((e) => e.q));
  assert.strictEqual(qs.size, COACH_FAQ_SEED.length, 'questions toutes uniques');
  for (const e of COACH_FAQ_SEED) {
    assert.ok(e.q && e.r && e.k, 'chaque entrée a question/réponse/mots-clés');
  }
});

test('lot 2 : nouveaux thèmes routés correctement', () => {
  assert.strictEqual(matchedCat('combien de repas par jour'), 'organisation');
  assert.strictEqual(matchedCat('je peux boire du café'), 'general');
  assert.strictEqual(matchedCat('je me pèse tous les jours'), 'poids');
  assert.strictEqual(matchedCat('le stress me fait grignoter'), 'motivation');
  assert.strictEqual(matchedCat('mes règles me donnent faim'), 'faim');
  // Végétarien -> réponse végé dédiée, PAS la réponse protéines générique.
  assert.strictEqual(matchedQ("je suis végétarien, est-ce que j'ai assez de protéines ?"), 'Végétarien / végan : assez de protéines ?');
  assert.strictEqual(matchedQ('pourquoi autant de protéines'), 'Pourquoi manger autant de protéines ?');
});

test('normalisation : minuscules + sans accents + sans ponctuation', () => {
  assert.strictEqual(norm("J'ai DÉJÀ très faim !"), 'j ai deja tres faim');
});

test('questions courantes -> bonne catégorie', () => {
  assert.strictEqual(matchedCat("j'ai tout le temps faim le matin"), 'faim');
  assert.strictEqual(matchedCat('quoi manger avant le sport'), 'sport');
  assert.strictEqual(matchedCat("quoi manger après l'entrainement"), 'sport');
  assert.strictEqual(matchedCat("j'ai bu trop d'alcool hier soir"), 'ecarts');
  assert.strictEqual(matchedCat('mon poids stagne depuis 3 semaines'), 'poids');
  assert.strictEqual(matchedCat("grosse envie de chocolat ce soir"), 'sucre');
  assert.strictEqual(matchedCat('combien d\'eau par jour'), 'hydratation');
  assert.strictEqual(matchedCat('je dors mal en ce moment'), 'sommeil');
});

test('priorité correcte : un écart prime sur la faim', () => {
  // « j'ai craqué » doit router vers la gestion d'écart, pas la faim.
  assert.strictEqual(matchedCat("j'ai craqué ce week-end, j'avais trop faim"), 'ecarts');
});

test('santé / douleur -> renvoi pro de santé (jamais un conseil nutrition à côté)', () => {
  assert.strictEqual(matchedCat("j'ai mal au dos depuis 2 jours"), 'general');
});

test('hors-sujet -> AUCUNE réponse (bascule coach humain)', () => {
  assert.strictEqual(matchFaq('bonjour ça va', ROWS), null);
  assert.strictEqual(matchFaq('azerty qwerty zzz', ROWS), null);
  assert.strictEqual(matchFaq('', ROWS), null);
});

test('une réponse désactivée n\'est jamais proposée', () => {
  const rows = ROWS.map((r) => ({ ...r, actif: 0 }));
  assert.strictEqual(matchFaq("j'ai faim", rows), null);
});
