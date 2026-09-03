'use strict';
// ============================================================================
//  MY COACH ACADEMY — LA LECTURE PAR BADGE (Essentiel, Expertise, Leader).
//
//  CE QUE CETTE SUITE PROUVE :
//
//   1. UN BADGE COMPTE DES VALIDATIONS, pas des contenus vus. C'est la même
//      règle que le Parcours Academy — `pctValidation` à 100 — appliquée
//      famille par famille. Un coach qui a tout regardé sans rien valider a
//      trois badges « À commencer ».
//   2. LES TROIS ÉTATS NE SE CHEVAUCHENT PAS : 0 validée, entre 1 et total-1,
//      tout validé. Et une famille vide n'a pas d'état.
//   3. LES TOTAUX COUVRENT LE CATALOGUE : la somme des trois badges vaut le
//      nombre de formations du coach.
//   4. « management » S'AFFICHE « Leader », et la clé stockée ne bouge pas.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');
const js = fs.readFileSync(path.join(PUBLIC, 'academy.js'), 'utf8');
const css = fs.readFileSync(path.join(PUBLIC, 'academy.css'), 'utf8');

// On exécute le vrai code de l'écran : la table des catégories, le barème de
// validation et le regroupement, extraits du fichier servi au navigateur.
const SRC_CATEGORIES = js.slice(js.indexOf('const CATEGORIES = ['), js.indexOf('const libelleCategorie'));
const SRC_MOTEUR = js.slice(js.indexOf('function pctValidation'), js.indexOf('const GARDES_ETAT'));
const { grouperParCoach, CATEGORIES } = new Function('rangTravail', 'STATUTS_A_EVALUER', 'echapper',
  SRC_CATEGORIES + SRC_MOTEUR + '; return { grouperParCoach, CATEGORIES };')(
  () => 0, [], (x) => String(x));

// -- Des dossiers comme le serveur les sert --------------------------------
const etapes = (pratique, theorieOk, pratiqueOk) => {
  const l = [{ cle: 'theorie', rempli: theorieOk }];
  if (pratique) l.push({ cle: 'pratique', rempli: pratiqueOk });
  return l;
};
let n = 0;
function dossier(categorie, { pratique = true, theorieOk = false, pratiqueOk = false,
  certifie = false, contenus = null } = {}) {
  const prerequis = etapes(pratique, theorieOk, pratiqueOk);
  const cle = 'f' + (++n);
  return {
    email: 'coach@exemple.fr', prenom: 'Coach', formation: cle, formationLibelle: cle,
    formationCategorie: categorie, statut: certifie ? 'certifie' : 'formation_en_cours',
    progression: contenus, theorieValidee: theorieOk,
    pratique: { validee: pratiqueOk, nbTentatives: pratiqueOk ? 1 : 0 },
    certification: { certifie, eligible: false, prerequis, manquants: prerequis.filter((p) => !p.rempli).map((p) => p.cle) },
  };
}
const VALIDEE = { theorieOk: true, pratiqueOk: true };
const badgesDe = (dossiers) => {
  const c = grouperParCoach(dossiers)[0];
  return Object.fromEntries(c.badges.map((b) => [b.cle, b]));
};
// Un catalogue de 15 Essentiel, 13 Expertise, 6 Leader — les proportions de
// ton exemple.
const catalogue = (faits) => {
  n = 0;
  const d = [];
  for (const [cat, total] of [['essentiel', 15], ['expertise', 13], ['management', 6]]) {
    for (let i = 0; i < total; i++) d.push(dossier(cat, (faits[cat] || {})[i] || {}));
  }
  return d;
};

// -- 1 --------------------------------------------------------------------
test('1 — aucune formation validée : les trois badges sont « À commencer »', () => {
  const b = badgesDe(catalogue({}));
  for (const cle of ['essentiel', 'expertise', 'management']) {
    assert.strictEqual(b[cle].validees, 0, cle);
    assert.strictEqual(b[cle].etat, 'a_commencer', cle);
  }
  assert.strictEqual(b.essentiel.total, 15);
});

// -- 2 --------------------------------------------------------------------
test('2 — quelques Essentiel validées : « En cours »', () => {
  const faits = { essentiel: {} };
  for (let i = 0; i < 5; i++) faits.essentiel[i] = VALIDEE;
  const b = badgesDe(catalogue(faits));
  assert.strictEqual(b.essentiel.validees, 5);
  assert.strictEqual(b.essentiel.total, 15);
  assert.strictEqual(b.essentiel.etat, 'en_cours');
  // Les deux autres familles n'ont pas bougé.
  assert.strictEqual(b.expertise.etat, 'a_commencer');
  assert.strictEqual(b.management.etat, 'a_commencer');
});

// -- 3 --------------------------------------------------------------------
test('3 — TOUTES les Essentiel validées : « Validé »', () => {
  const faits = { essentiel: {} };
  for (let i = 0; i < 15; i++) faits.essentiel[i] = VALIDEE;
  const b = badgesDe(catalogue(faits));
  assert.strictEqual(b.essentiel.validees, 15);
  assert.strictEqual(b.essentiel.etat, 'valide');
  // Une seule de moins, et le badge redescend : il n'y a pas d'« à peu près ».
  const presque = { essentiel: {} };
  for (let i = 0; i < 14; i++) presque.essentiel[i] = VALIDEE;
  assert.strictEqual(badgesDe(catalogue(presque)).essentiel.etat, 'en_cours');
});

// -- 4 --------------------------------------------------------------------
test('4 — théorie SEULE sur une formation à pratique obligatoire : ne compte pas', () => {
  const faits = { essentiel: {} };
  for (let i = 0; i < 15; i++) faits.essentiel[i] = { theorieOk: true };  // pratique manquante
  const b = badgesDe(catalogue(faits));
  assert.strictEqual(b.essentiel.validees, 0, 'une théorie seule ne valide pas une formation');
  assert.strictEqual(b.essentiel.etat, 'a_commencer');
});

// -- 5 --------------------------------------------------------------------
test('5 — une certification existante vaut validation définitive', () => {
  // Même sans prérequis relisibles : le diplôme est la preuve.
  const faits = { management: { 0: { certifie: true }, 1: { certifie: true } } };
  const b = badgesDe(catalogue(faits));
  assert.strictEqual(b.management.validees, 2);
  assert.strictEqual(b.management.etat, 'en_cours');
});

// -- 6 --------------------------------------------------------------------
test('6 — les trois totaux couvrent TOUT le catalogue du coach', () => {
  const dossiers = catalogue({});
  const c = grouperParCoach(dossiers)[0];
  const somme = c.badges.reduce((t, b) => t + b.total, 0);
  assert.strictEqual(somme, dossiers.length, 'aucune formation ne doit tomber hors des badges');
  assert.strictEqual(somme, c.formations, 'et le total des badges vaut celui du parcours');
  assert.deepStrictEqual(c.badges.map((b) => b.total), [15, 13, 6]);
});

// -- 7 : le visionnage ne valide rien ---------------------------------------
test('7 — TOUT VU, RIEN VALIDÉ : les badges restent « À commencer »', () => {
  const faits = {};
  for (const [cat, total] of [['essentiel', 15], ['expertise', 13], ['management', 6]]) {
    faits[cat] = {};
    for (let i = 0; i < total; i++) faits[cat][i] = { contenus: { total: 40, termines: 40, pourcentage: 100 } };
  }
  const b = badgesDe(catalogue(faits));
  for (const cle of ['essentiel', 'expertise', 'management']) {
    assert.strictEqual(b[cle].etat, 'a_commencer', cle + ' : le visionnage a validé un badge');
  }
});

// -- Les libellés et la clé stockée ----------------------------------------
test('« management » S\'AFFICHE « Leader », et la clé ne bouge pas', () => {
  assert.deepStrictEqual(CATEGORIES, [
    ['essentiel', 'Essentiel'], ['expertise', 'Expertise'], ['management', 'Leader'],
  ]);
  const b = badgesDe(catalogue({}));
  assert.strictEqual(b.management.libelle, 'Leader');
  assert.strictEqual(b.management.cle, 'management', 'la clé stockée reste « management »');
  // Le serveur accepte toujours cette clé, et elle seule.
  const { CATEGORIES: SERVEUR } = require('../lib/academyFormations');
  assert.deepStrictEqual(SERVEUR, ['essentiel', 'expertise', 'management']);
});

test('UNE FAMILLE VIDE N\'A PAS D\'ÉTAT — on ne demande pas de commencer le néant', () => {
  n = 0;
  const c = grouperParCoach([dossier('essentiel', VALIDEE)])[0];
  const b = Object.fromEntries(c.badges.map((x) => [x.cle, x]));
  assert.strictEqual(b.essentiel.etat, 'valide');
  assert.strictEqual(b.expertise.etat, 'vide');
  assert.strictEqual(b.management.etat, 'vide');
  // Et l'écran ne rend que les familles utiles.
  const src = js.slice(js.indexOf('function badgesParcours'), js.indexOf('function resumeParcours'));
  assert.ok(/filter\(\(b\) => b\.etat !== 'vide'\)/.test(src), 'une famille vide ne doit pas s\'afficher');
});

// -- Le rendu ---------------------------------------------------------------
test('L\'INDICATEUR PORTE LE NOM, LE COMPTE ET UNE BARRE — SANS « À commencer »', () => {
  const src = js.slice(js.indexOf('function badgesParcours'), js.indexOf('function resumeParcours'));
  assert.ok(/b\.validees \+ ' <span>\/ ' \+ b\.total/.test(src), 'le compte X / TOTAL doit être rendu');
  assert.ok(/ac-jauge/.test(src) && /width:' \+ b\.pct/.test(src), 'chaque famille porte sa barre');
  // ⚠️ « À COMMENCER » NE S'ÉCRIT PLUS : « 0 / 12 » le dit déjà, et trois fois
  // le même mot noyait les deux marques qui comptent.
  assert.ok(!/À commencer/i.test(src), 'le mot « à commencer » ne doit plus être rendu');
  assert.ok(!/LIB_BADGE/.test(js), 'la table des libellés de pastille doit avoir disparu');
  // Seules deux marques s'écrivent : ce qui attend, et ce qui est terminé.
  assert.ok(/b\.aEvaluer/.test(src) && /'valide'/.test(src), 'les deux seules marques utiles');
  // ESSENTIEL est le socle : il se distingue, sans bordure ni pastille.
  assert.ok(/b\.cle === 'essentiel' \? ' ac-fam-socle'/.test(src), 'Essentiel doit être marqué comme socle');
  assert.ok(css.includes('.ac-fam-socle'), 'le style du socle doit exister');
  // PLUS AUCUN CONTOUR DE PASTILLE : les anciennes classes ont disparu.
  assert.ok(!/ac-bdg/.test(css), 'les pastilles cerclées doivent avoir disparu du style');
});

test('LE DÉTAIL EST REGROUPÉ PAR BADGE, ET REPLIABLE SANS JAVASCRIPT', () => {
  const src = js.slice(js.indexOf('function detailCoach'), js.indexOf('const ENTETE_COACHS'));
  assert.ok(/<details class="ac-evs/.test(src), 'chaque section doit être un <details>');
  // ESSENTIEL OUVERT, les autres fermées — sauf si une évaluation attend.
  assert.ok(/b\.cle === 'essentiel' \|\| b\.aEvaluer > 0/.test(src),
    'Essentiel doit être ouvert par défaut, et toute famille qui attend une action');
  // L'en-tête porte compte, barre et pourcentage : c'est ce qui permet de NE
  // PAS répéter les trois indicateurs juste au-dessus des sections.
  assert.ok(/b\.validees \+ ' \/ ' \+ b\.total/.test(src), 'chaque section porte son compte');
  assert.ok(/ac-jauge/.test(src) && /b\.pct \+ ' %/.test(src), 'et sa barre avec son pourcentage');
  assert.ok(/à évaluer/.test(src), 'une évaluation en attente doit être signalée dans l\'en-tête');
  assert.ok(/d\.formationCategorie === b\.cle/.test(src), 'les formations doivent être rangées par famille');
  // Les six colonnes d'origine sont conservées dans chaque section.
  for (const t of ['Formation', 'Progression', 'Théorie', 'Pratique', 'Statut', 'Action']) {
    assert.ok(src.includes(`'${t}'`), 'colonne perdue : ' + t);
  }
  // Rien ne disparaît : un dossier sans catégorie garde sa section.
  assert.ok(/Sans catégorie/.test(src), 'un dossier hors badge ne doit pas être escamoté');
});

test('UNE FORMATION JAMAIS COMMENCÉE NE PORTE PLUS DE PASTILLE', () => {
  const src = js.slice(js.indexOf('function detailCoach'), js.indexOf('const ENTETE_COACHS'));
  // Un tiret gris au lieu d'un badge « À COMMENCER » : trente badges alignés
  // noyaient les deux qui demandaient une action.
  assert.ok(/termines === 0\s*\n?\s*\? '<span class="ac-eval-note">/.test(src)
    || /ac-eval-note">\\u2014/.test(src), 'une formation neuve doit se lire « — »');
  assert.ok(/pastilleStatut\(d\)/.test(src), 'les autres statuts gardent leur pastille');
});

test('LA PRIORITÉ VISUELLE VA À CE QUI ATTEND UNE ACTION', () => {
  // Une seule teinte chaude dans tout le bloc : celle de « à évaluer ».
  const bloc = css.slice(css.indexOf('.ac-fam {'), css.indexOf('@media (max-width: 620px)', css.indexOf('.ac-evs {')));
  assert.ok(/\.ac-evs-a \{[^}]*#FCF3DA/.test(bloc), 'l\'alerte doit porter la teinte ambre de l\'écran');
  assert.ok(!/border(-\w+)?: 1px solid #(0|1|2|3)/i.test(bloc), 'aucun contour foncé');
});
