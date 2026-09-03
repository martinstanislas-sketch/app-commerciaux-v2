'use strict';
// ============================================================================
//  MY COACH ACADEMY — « PARCOURS ACADEMY », la colonne du responsable.
//
//  CE QUE CETTE SUITE PROUVE :
//
//   1. LE POURCENTAGE NE MESURE QUE DES VALIDATIONS. Les vidéos vues, les
//      modules terminés, les mini-QCM et le fait d'avoir commencé n'y entrent
//      pour rien : un coach qui a tout regardé sans rien valider est à 0 %.
//   2. LE BARÈME EST CELUI DEMANDÉ : 0 / 50 / 100 quand la pratique est
//      obligatoire, 0 / 100 quand elle ne l'est pas.
//   3. CHAQUE FORMATION PÈSE PAREIL, et le compteur « X / 9 » ne compte QUE
//      les formations totalement validées.
//   4. UN DIPLÔME DÉLIVRÉ VAUT 100, jamais davantage : la certification
//      plafonne, elle n'ajoute pas de points.
//   5. LES EXIGENCES NE SONT PAS RÉÉCRITES ICI : elles sont lues dans les
//      prérequis que le serveur compose, ceux-là mêmes qui gouvernent la
//      certification.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');
const js = fs.readFileSync(path.join(PUBLIC, 'academy.js'), 'utf8');

// Le calcul est extrait du fichier réel et EXÉCUTÉ : on ne teste pas une copie
// de la règle, on teste la règle. Même procédé que les autres suites d'écran.
const source = js.slice(js.indexOf('function pctValidation'), js.indexOf('const GARDES_ETAT'));
// La table des catégories vient avec : le regroupement s'en sert pour compter
// les badges par famille, et on exécute le vrai code plutôt qu'un substitut.
const SRC_CATEGORIES = js.slice(js.indexOf('const CATEGORIES = ['), js.indexOf('const libelleCategorie'));
const moteur = new Function('rangTravail', 'STATUTS_A_EVALUER', 'echapper',
  SRC_CATEGORIES + source + '; return { pctValidation, grouperParCoach };')(
  () => 0, [], (x) => String(x));
const { pctValidation, grouperParCoach } = moteur;

// -- Des dossiers comme le serveur les sert --------------------------------
//
//  `prerequisDe` (lib/academyCertifications.js) pose TOUJOURS la théorie, et
//  n'ajoute la pratique QUE si la formation la rend obligatoire. C'est cette
//  forme-là qu'on rejoue, sans en inventer une autre.
const etapeTheorie = (rempli) => ({ cle: 'theorie', libelle: 'Évaluation théorique (QCM)', rempli });
const etapePratique = (rempli) => ({ cle: 'pratique', libelle: 'Évaluation pratique', rempli });

function dossier({ formation = 'f', pratique = true, theorieOk = false, pratiqueOk = false,
  certifie = false, contenus = null } = {}) {
  const prerequis = [etapeTheorie(theorieOk)];
  if (pratique) prerequis.push(etapePratique(pratiqueOk));
  return {
    email: 'coach@exemple.fr', prenom: 'Coach', formation, formationLibelle: formation,
    statut: certifie ? 'certifie' : 'formation_en_cours',
    progression: contenus,
    theorieValidee: theorieOk,
    pratique: { validee: pratiqueOk, nbTentatives: pratiqueOk ? 1 : 0 },
    certification: { certifie, eligible: false, prerequis, manquants: prerequis.filter((p) => !p.rempli).map((p) => p.cle) },
  };
}
const parcours = (dossiers) => grouperParCoach(dossiers)[0];
// Neuf formations, comme le catalogue publié : huit avec pratique obligatoire,
// « Les clés de la nutrition » sans.
const neuf = (faits) => {
  const d = [];
  for (let i = 0; i < 9; i++) d.push(dossier({ formation: 'f' + i, ...(faits[i] || {}) }));
  return d;
};

// -- A ---------------------------------------------------------------------
test('A — aucune formation validée : 0 %', () => {
  const c = parcours(neuf({}));
  assert.strictEqual(c.pourcentage, 0);
  assert.strictEqual(c.terminees, 0);
  assert.strictEqual(c.formations, 9);
});

test('A bis — TOUT VU, RIEN VALIDÉ : toujours 0 %', () => {
  // Le cœur de la demande. Ce coach a terminé les 40 contenus de chacune de
  // ses neuf formations. Aucun n'a validé quoi que ce soit.
  const c = parcours(neuf(Object.fromEntries(
    [...Array(9)].map((_, i) => [i, { contenus: { total: 40, termines: 40, pourcentage: 100 } }]))));
  assert.strictEqual(c.pourcentage, 0, 'le visionnage ne doit RIEN valoir dans le parcours');
  assert.strictEqual(c.terminees, 0);
  assert.strictEqual(c.aFaire, 9);
});

// -- B, C, D : le barème d'UNE formation -----------------------------------
test('B — théorie validée, pratique obligatoire : la formation vaut 50 %', () => {
  assert.strictEqual(pctValidation(dossier({ pratique: true, theorieOk: true })), 50);
});

test('C — théorie + pratique validées : la formation vaut 100 %', () => {
  assert.strictEqual(pctValidation(dossier({ pratique: true, theorieOk: true, pratiqueOk: true })), 100);
});

test('C bis — pratique seule validée : 50 % elle aussi', () => {
  // Le moteur ne produit pas cet état (une évaluation ne s'ouvre pas sans
  // théorie), mais le barème demandé le prévoit : une étape sur deux.
  assert.strictEqual(pctValidation(dossier({ pratique: true, pratiqueOk: true })), 50);
});

test('D — formation SANS pratique obligatoire : théorie validée = 100 %', () => {
  assert.strictEqual(pctValidation(dossier({ pratique: false, theorieOk: true })), 100);
  assert.strictEqual(pctValidation(dossier({ pratique: false })), 0);
});

test('rien de validé vaut 0 % dans les deux cas', () => {
  assert.strictEqual(pctValidation(dossier({ pratique: true })), 0);
  assert.strictEqual(pctValidation(dossier({ pratique: false })), 0);
});

// -- E, F : les deux exemples chiffrés du responsable -----------------------
test('E — 2 formations totalement validées sur 9 : « 2 / 9 » et 22 %', () => {
  const c = parcours(neuf({
    0: { theorieOk: true, pratiqueOk: true },
    1: { theorieOk: true, pratiqueOk: true },
  }));
  assert.strictEqual(c.terminees, 2, 'le compteur ne compte que les formations totalement validées');
  assert.strictEqual(c.formations, 9);
  assert.strictEqual(c.pourcentage, 22, '(100 + 100) / 9 = 22,22 -> 22');
});

test('F — + la théorie d\'une troisième : « 2 / 9 » toujours, mais 28 %', () => {
  const c = parcours(neuf({
    0: { theorieOk: true, pratiqueOk: true },
    1: { theorieOk: true, pratiqueOk: true },
    2: { theorieOk: true },
  }));
  assert.strictEqual(c.terminees, 2, 'une formation à 50 % n\'avance PAS le compteur');
  assert.strictEqual(c.pourcentage, 28, '(100 + 100 + 50) / 9 = 27,78 -> 28');
  assert.strictEqual(c.partielles, 1);
  assert.strictEqual(c.aFaire, 6);
});

// -- La certification -------------------------------------------------------
test('UN DIPLÔME DÉLIVRÉ VAUT 100, ET PAS UN POINT DE PLUS', () => {
  // Le cas que le responsable doit voir juste : les certifications déjà
  // prononcées comptent comme totalement validées.
  const certifiee = dossier({ theorieOk: true, pratiqueOk: true, certifie: true });
  assert.strictEqual(pctValidation(certifiee), 100);

  const c = parcours(neuf({ 0: { theorieOk: true, pratiqueOk: true, certifie: true } }));
  assert.strictEqual(c.terminees, 1);
  assert.strictEqual(c.pourcentage, 11, '100 / 9 = 11,1 -> 11 : la certification n\'ajoute rien');

  // Et un diplôme ancien, dont les prérequis ne se reliraient plus, reste 100 :
  // il a été délivré, c'est la preuve.
  const ancienne = dossier({ certifie: true });
  assert.strictEqual(pctValidation(ancienne), 100,
    'une certification déjà délivrée doit être reconnue comme totalement validée');
});

test('LES NEUF FORMATIONS VALIDÉES FONT 100 %', () => {
  const c = parcours(neuf(Object.fromEntries(
    [...Array(9)].map((_, i) => [i, { theorieOk: true, pratiqueOk: true }]))));
  assert.strictEqual(c.pourcentage, 100);
  assert.strictEqual(c.terminees, 9);
  assert.strictEqual(c.aFaire, 0);
});

// -- Les trois compteurs du résumé -----------------------------------------
test('LES TROIS NOMBRES DU RÉSUMÉ COUVRENT TOUJOURS LE TOTAL', () => {
  for (const faits of [{}, { 0: { theorieOk: true } },
    { 0: { theorieOk: true, pratiqueOk: true }, 3: { theorieOk: true }, 7: { theorieOk: true, certifie: true } }]) {
    const c = parcours(neuf(faits));
    assert.strictEqual(c.terminees + c.partielles + c.aFaire, c.formations,
      'validées + engagées + à faire doit faire le total, sinon le résumé ment');
  }
});

// -- Ce qui NE DOIT PAS avoir bougé ----------------------------------------
test('LE CALCUL LIT LES PRÉREQUIS DU SERVEUR, il ne réécrit pas les exigences', () => {
  const bloc = js.slice(js.indexOf('function pctValidation'), js.indexOf('function grouperParCoach'));
  assert.ok(/certification\.prerequis/.test(bloc),
    'les étapes exigées doivent venir des prérequis composés par le serveur');
  assert.ok(!/pratiqueObligatoire/.test(bloc),
    'l\'écran ne doit pas se prononcer lui-même sur le caractère obligatoire de la pratique');
  // Le moteur qui les compose n'a pas bougé : la théorie toujours, la pratique
  // seulement si la formation l'exige.
  const moteurSrc = fs.readFileSync(path.join(__dirname, '..', 'lib', 'academyCertifications.js'), 'utf8');
  const pre = moteurSrc.slice(moteurSrc.indexOf('function prerequisDe'), moteurSrc.indexOf('function preuvesDe'));
  assert.ok(/cle: 'theorie'/.test(pre) && /if \(f\.pratiqueObligatoire\)/.test(pre) && /cle: 'pratique'/.test(pre),
    'prerequisDe doit rester la source des exigences');
});

test('LE VISIONNAGE N\'ENTRE PAS DANS LE CALCUL GLOBAL', () => {
  const bloc = js.slice(js.indexOf('function pctValidation'), js.indexOf('const GARDES_ETAT'));
  assert.ok(!/d\.progression/.test(bloc),
    'la progression de contenus ne doit plus entrer dans le parcours global');
  assert.ok(!/commencees/.test(js),
    'le compteur « commencées » doit avoir disparu : il comptait des formations engagées, pas validées');
  // Mais elle reste affichée dans le DÉTAIL, où elle répond à l'autre question.
  const detail = js.slice(js.indexOf('function detailCoach'), js.indexOf('const ENTETE_COACHS'));
  assert.ok(/d\.progression\.termines \+ ' \/ ' \+ d\.progression\.total/.test(detail),
    'le détail d\'un coach doit continuer d\'afficher sa progression de contenus');
});

test('L\'INTITULÉ DE COLONNE EST « PARCOURS ACADEMY »', () => {
  assert.ok(/const ENTETE_COACHS = \['Coach', 'Parcours Academy'/.test(js), 'la colonne doit être renommée');
  assert.ok(!/'Progression Academy'/.test(js), 'l\'ancien intitulé doit avoir disparu');
  const ligne = js.slice(js.indexOf('function ligneAgregee'), js.indexOf('function detailCoach'));
  assert.ok(/data-l="Parcours"/.test(ligne), 'l\'étiquette mobile doit suivre l\'intitulé');
  assert.ok(/c\.terminees \+ ' \/ ' \+ c\.formations/.test(ligne),
    'le compteur doit afficher les formations VALIDÉES sur le total');
  assert.ok(/resumeParcours\(c\)/.test(ligne), 'le résumé doit être posé sous la jauge');
});

test('LE RÉSUMÉ SE LIT « 2 validées · 1 théorie validée · 6 à faire »', () => {
  const src = js.slice(js.indexOf('function resumeParcours'), js.indexOf('function ligneAgregee'));
  const rendre = new Function('echapper', src + '; return resumeParcours;')((x) => String(x));
  const texte = (c) => rendre(c).replace(/<[^>]*>/g, '');

  assert.strictEqual(texte({ terminees: 2, partielles: 1, aFaire: 6 }),
    '2 validées · 1 théorie validée · 6 à faire');
  // Le singulier et le pluriel, dits juste.
  assert.strictEqual(texte({ terminees: 1, partielles: 2, aFaire: 6 }),
    '1 validée · 2 théories validées · 6 à faire');
  // Un nombre à zéro ne s'écrit pas : il occuperait la place pour ne rien dire.
  assert.strictEqual(texte({ terminees: 0, partielles: 0, aFaire: 9 }), '9 à faire');
  assert.strictEqual(texte({ terminees: 9, partielles: 0, aFaire: 0 }), '9 validées');
  assert.strictEqual(rendre({ terminees: 0, partielles: 0, aFaire: 0 }), '',
    'sans formation, pas de résumé');
});
