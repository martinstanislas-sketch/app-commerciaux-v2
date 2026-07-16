'use strict';
// Tests du BILAN HEBDO : seuils, plafonds, et surtout la règle produit non
// négociable — le ton reste positif, même sur une semaine ratée.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_FORTS, MAX_AXES, MIN_FORTS,
  highlightsSemaine, texteBilanTemplate, promptBilan, parseReponseIa,
} = require('../lib/bilanHebdo');

const semaine = (o) => Object.assign({
  semaine: 1, joursGagnes: 0, repasRenseignes: 0, repasPossibles: 21,
  streakDebut: 0, streakFin: 0, seancesValidees: 0, seancesPrevues: 4,
  ebooksLus: 0, actionsCommunaute: 0,
}, o);

const BONNE = semaine({ joursGagnes: 7, repasRenseignes: 19, streakDebut: 3, streakFin: 10, seancesValidees: 4, ebooksLus: 3, actionsCommunaute: 2 });
const MOYENNE = semaine({ joursGagnes: 4, repasRenseignes: 11, streakDebut: 2, streakFin: 3, seancesValidees: 2, ebooksLus: 1, actionsCommunaute: 1 });
const FAIBLE = semaine({ joursGagnes: 1, repasRenseignes: 2 });

// --- Plafonds et plancher ---------------------------------------------------
test('highlights : jamais plus de 4 points forts ni 2 axes', () => {
  [BONNE, MOYENNE, FAIBLE].forEach((s) => {
    const h = highlightsSemaine(s);
    assert.ok(h.forts.length <= MAX_FORTS, `${h.forts.length} forts > ${MAX_FORTS}`);
    assert.ok(h.axes.length <= MAX_AXES, `${h.axes.length} axes > ${MAX_AXES}`);
  });
});

test('highlights : toujours au moins 2 points forts, même en semaine faible', () => {
  [BONNE, MOYENNE, FAIBLE, semaine({})].forEach((s) => {
    assert.ok(highlightsSemaine(s).forts.length >= MIN_FORTS, 'moins de 2 réussites');
  });
});

test('highlights : une semaine VIDE (tout à zéro) donne quand même 2 réussites', () => {
  const h = highlightsSemaine(semaine({}));
  assert.equal(h.forts.length, 2);
  assert.ok(h.forts.some((f) => f.cle === 'present'), 'le socle « tu es toujours là » doit apparaître');
});

test('highlights : les seuils déclenchent les bons points forts', () => {
  const h = highlightsSemaine(BONNE);
  const cles = h.forts.map((f) => f.cle);
  assert.ok(cles.includes('regularite'), '7/7 jours -> régularité');
  assert.ok(cles.includes('seances'), '4/4 séances -> objectif atteint');
  assert.equal(h.axes.length, 0, 'une semaine parfaite n\'a aucun axe');
});

test('highlights : semaine faible -> axes tournés vers la semaine à venir', () => {
  const h = highlightsSemaine(FAIBLE);
  assert.ok(h.axes.length >= 1);
  assert.ok(h.axes.some((a) => a.cle === 'rythme'), '1 jour gagné -> axe rythme');
  assert.ok(h.axes.length <= MAX_AXES);
});

// --- LE point produit : le ton ----------------------------------------------
// Ces mots trahiraient un bilan qui juge au lieu d'encourager.
const MOTS_INTERDITS = [
  'échec', 'echec', 'raté', 'rate ', 'mauvais', 'insuffisant', 'décevant', 'decevant',
  'tu n\'as pas', 'tu n as pas', 'faible', 'problème', 'probleme', 'dommage',
  'malheureusement', 'attention', 'erreur', 'faute', 'abandonné', 'nul', 'trop peu',
  'aurait dû', 'aurais dû', 'tu devrais', 'il faut que tu',
];
function texteComplet(t) { return [t.intro, ...t.reussites, ...t.focus, t.motFin].join(' ').toLowerCase(); }

test('ton : aucun terme culpabilisant, sur une bonne / moyenne / faible semaine', () => {
  [['bonne', BONNE], ['moyenne', MOYENNE], ['faible', FAIBLE], ['vide', semaine({})]].forEach(([nom, s]) => {
    const txt = texteComplet(texteBilanTemplate(s, highlightsSemaine(s), {}));
    MOTS_INTERDITS.forEach((mot) => {
      assert.ok(txt.indexOf(mot) === -1, `semaine ${nom} : terme culpabilisant « ${mot} » -> ${txt}`);
    });
  });
});

test('ton : la semaine la plus faible reste encourageante et non vide', () => {
  const t = texteBilanTemplate(FAIBLE, highlightsSemaine(FAIBLE), {});
  assert.ok(t.intro.length > 0);
  assert.ok(t.reussites.length >= MIN_FORTS, 'au moins 2 réussites affichées');
  assert.ok(t.focus.length >= 1, 'un focus, jamais un reproche');
  assert.ok(t.motFin.length > 0);
});

test('ton : une semaine parfaite n\'invente pas un axe pour meubler', () => {
  const t = texteBilanTemplate(BONNE, highlightsSemaine(BONNE), {});
  assert.equal(t.focus.length, 1);
  assert.match(t.focus[0], /[Cc]ontinue/, 'sans axe -> on encourage à garder le cap');
});

// --- Modèle = repli qui se suffit à lui-même --------------------------------
test('modèle : le texte cite les chiffres réels (aucune invention)', () => {
  const t = texteBilanTemplate(BONNE, highlightsSemaine(BONNE), {});
  const txt = texteComplet(t);
  assert.ok(txt.includes('7 jours sur 7'), 'les jours gagnés réels');
  assert.ok(txt.includes('4 séance'), 'les séances réelles');
});

test('modèle : le bilan FINAL est un bilan de 6 semaines, pas un hebdo', () => {
  const t = texteBilanTemplate(BONNE, highlightsSemaine(BONNE), { final: true });
  assert.match(t.intro, /[Ss]ix semaines|6 semaines/);
  assert.ok(!/Semaine 1 bouclée/.test(t.intro), 'ce n\'est pas le texte hebdo');
  MOTS_INTERDITS.forEach((m) => assert.ok(texteComplet(t).indexOf(m) === -1));
});

// --- Prompt IA : elle habille, elle n'invente pas ---------------------------
test('prompt : interdit explicitement d\'inventer, et fournit les chiffres', () => {
  const { system, user } = promptBilan(MOYENNE, highlightsSemaine(MOYENNE), {});
  assert.match(system, /invente aucun/i);
  assert.match(system, /JAMAIS culpabilisant/i);
  const donnees = JSON.parse(user);
  assert.equal(donnees.chiffres.joursGagnes, 4, 'l\'IA reçoit les vrais chiffres');
  assert.ok(donnees.pointsForts.length >= MIN_FORTS);
});

test('prompt : le bilan final le dit à l\'IA', () => {
  assert.match(promptBilan(BONNE, highlightsSemaine(BONNE), { final: true }).system, /BILAN FINAL/);
});

// --- Réponse IA : on ne la croit pas sur parole -----------------------------
test('parseReponseIa : une réponse correcte est acceptée (même noyée dans du texte)', () => {
  const r = parseReponseIa('Voici :\n{"intro":"Bravo","reussites":["a","b"],"focus":["c"],"motFin":"À la semaine pro"}');
  assert.equal(r.intro, 'Bravo');
  assert.deepEqual(r.reussites, ['a', 'b']);
});

test('parseReponseIa : les plafonds sont REBORNÉS, même si l\'IA en rend plus', () => {
  // Cas réel observé : le modèle rend 3 focus alors que le plafond est 2.
  const r = parseReponseIa(JSON.stringify({
    intro: 'x', motFin: 'y',
    reussites: ['a', 'b', 'c', 'd', 'e', 'f'],
    focus: ['1', '2', '3'],
  }));
  assert.equal(r.reussites.length, MAX_FORTS, 'les points forts sont plafonnés à 4');
  assert.equal(r.focus.length, MAX_AXES, 'les axes sont plafonnés à 2');
});

test('parseReponseIa : réponse vide / cassée / sans réussite -> null (on retombe sur le modèle)', () => {
  assert.equal(parseReponseIa(''), null);
  assert.equal(parseReponseIa('désolé je ne peux pas'), null);
  assert.equal(parseReponseIa('{"intro":"x"}'), null, 'sans réussites, ce n\'est pas un bilan');
  assert.equal(parseReponseIa('{cassé'), null);
  assert.equal(parseReponseIa(null), null);
});

test('robustesse : un stats incomplet ne fait pas planter le bilan', () => {
  const h = highlightsSemaine({});
  assert.ok(h.forts.length >= MIN_FORTS);
  const t = texteBilanTemplate({}, h, {});
  assert.ok(t.intro.length > 0 && t.motFin.length > 0);
});
