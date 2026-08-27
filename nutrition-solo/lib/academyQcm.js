'use strict';
// ============================================================================
//  MY COACH ACADEMY — évaluation théorique (lot 2 : le QCM).
//
//  TROIS RÈGLES TIENNENT TOUT CE FICHIER. Elles ne sont pas des précautions
//  d'usage : chacune répond à une façon précise dont un QCM se casse.
//
//   1. LES BONNES RÉPONSES NE QUITTENT JAMAIS LE SERVEUR.
//      Elles vivent dans UNE seule colonne — `correct_json`, sur la question
//      figée — et aucune fonction de lecture destinée au collaborateur ne la
//      sélectionne. La table des choix figés, elle, ne contient AUCUNE marque
//      de correction : on peut en faire un `SELECT *` sans rien divulguer.
//      C'est volontaire. Une colonne « correct » posée à côté du texte d'un
//      choix finit tôt ou tard dans une réponse HTTP.
//
//   2. UNE TENTATIVE EST FIGÉE À SON OUVERTURE.
//      On ne stocke pas des références vers la banque : on RECOPIE l'énoncé,
//      les choix, leur ordre, le nombre de questions et le seuil. Modifier la
//      banque, désactiver une question, changer la configuration : rien de tout
//      cela ne doit rattraper une tentative commencée. Un collaborateur ne doit
//      jamais découvrir que son questionnaire a changé pendant qu'il y répond.
//
//   3. RÉUSSIR LE QCM NE CERTIFIE PAS LE COACH NUTRITION.
//      La réussite valide LA THÉORIE et rend éligible à l'évaluation pratique.
//      La certification reste prononcée par un humain, dans le système existant
//      (boost_certifications). L'Academy y écrit le score et l'avancement —
//      elle ne crée pas une seconde certification, et ne s'accorde pas la
//      dernière.
//
//  Ce que ce module NE fait pas : l'évaluation pratique, la certification
//  finale, et l'administration de la banque (lot 4). Le schéma la prépare
//  — actif/inactif partout, aucune suppression dure — mais aucune route
//  d'écriture admin n'est ouverte ici.
// ============================================================================

const { err, ok } = require('./boost');
const { ajouterColonne, COACH_NUTRITION } = require('./academyFormations');

// Valeurs d'AMORÇAGE, et rien d'autre. La logique lit toujours la table
// academy_config : ces deux nombres servent à la remplir la première fois, puis
// n'ont plus voix au chapitre. C'est ce qui permettra à l'administration (lot 4)
// de les changer sans redéploiement.
const CFG_NB = 'qcm_nb_questions';
const CFG_SEUIL = 'qcm_seuil_pct';
const DEFAUTS = { nbQuestions: 5, seuilPct: 80 };

const T_EN_COURS = 'en_cours';
const T_SOUMISE = 'soumise';

// Les six états que l'écran doit pouvoir présenter (cf. cahier des charges).
// Ils sont CALCULÉS à chaque lecture, jamais stockés : un état stocké finit par
// mentir le jour où la formation gagne un contenu.
const ETAT_FORMATION = 'formation_en_cours';
const ETAT_DISPONIBLE = 'qcm_disponible';
const ETAT_EVALUATION = 'evaluation_en_cours';
const ETAT_ECHOUE = 'theorie_non_validee';
const ETAT_VALIDEE = 'theorie_validee';

const SCHEMA_QCM = `
-- Configuration en DONNÉES. Ni le nombre de questions ni le seuil ne sont
-- écrits dans la logique : ils se règlent ici, et se régleront demain depuis
-- l'administration sans toucher au code.
CREATE TABLE IF NOT EXISTS academy_config (
  cle     TEXT PRIMARY KEY,
  valeur  TEXT NOT NULL,
  maj_le  TEXT NOT NULL,
  maj_par TEXT
);

-- Banque de questions. La colonne module_id est en SET NULL : retirer un module ne doit pas
-- emporter les questions qui s'y rattachaient — l'historique des tentatives y
-- fait référence.
CREATE TABLE IF NOT EXISTS academy_questions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  -- La banque est cloisonnée : le tirage d'une formation ne pioche jamais
  -- dans les questions d'une autre.
  formation   TEXT NOT NULL DEFAULT 'coach_nutrition',
  module_id   INTEGER REFERENCES academy_modules(id) ON DELETE SET NULL,
  enonce      TEXT NOT NULL,
  actif       INTEGER NOT NULL DEFAULT 1,
  ordre       INTEGER NOT NULL DEFAULT 0,
  cle         TEXT UNIQUE,          -- repère stable d'amorçage ; « demo-… » = démonstration
  cree_le     TEXT NOT NULL,
  maj_le      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_academy_questions ON academy_questions(actif, module_id);

-- Choix d'une question. La colonne correct est la SEULE colonne sensible du fichier, et
-- elle ne sort d'ici par aucune route collaborateur : les fonctions de lecture
-- publiques listent leurs colonnes une par une, jamais d'étoile.
CREATE TABLE IF NOT EXISTS academy_choix (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES academy_questions(id) ON DELETE CASCADE,
  texte       TEXT NOT NULL,
  correct     INTEGER NOT NULL DEFAULT 0,
  actif       INTEGER NOT NULL DEFAULT 1,
  ordre       INTEGER NOT NULL DEFAULT 0,
  cle         TEXT UNIQUE,
  cree_le     TEXT NOT NULL,
  maj_le      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_academy_choix ON academy_choix(question_id, ordre);

-- Une tentative. Les colonnes nb_questions et seuil_pct sont COPIÉS ici à l'ouverture :
-- c'est le seuil de CETTE tentative, pas celui d'aujourd'hui. Changer la
-- configuration ne doit jamais rendre réussie une tentative qui ne l'était pas,
-- ni l'inverse.
CREATE TABLE IF NOT EXISTS academy_tentatives (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  email        TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  -- « Une tentative en cours », « la théorie est-elle validée » : deux
  -- questions qui n'ont de sens que RAPPORTÉES À UNE FORMATION.
  formation    TEXT NOT NULL DEFAULT 'coach_nutrition',
  statut       TEXT NOT NULL DEFAULT 'en_cours',   -- en_cours | soumise
  nb_questions INTEGER NOT NULL,
  seuil_pct    INTEGER NOT NULL,
  ouverte_le   TEXT NOT NULL,
  soumise_le   TEXT,
  score_pct    INTEGER,
  bonnes       INTEGER,
  reussie      INTEGER
);
CREATE INDEX IF NOT EXISTS idx_academy_tentatives ON academy_tentatives(email, formation, id);

-- Les questions FIGÉES de la tentative. Tout est recopié : l'énoncé, le titre
-- du module, la position. Renommer un module ou corriger une faute de frappe
-- dans la banque ne réécrit pas une tentative déjà passée.
--
-- La colonne correct_json contient les identifiants (de academy_tentative_choix) des
-- bonnes réponses figées. C'est LE secret du fichier.
CREATE TABLE IF NOT EXISTS academy_tentative_questions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  tentative_id INTEGER NOT NULL REFERENCES academy_tentatives(id) ON DELETE CASCADE,
  question_id  INTEGER,          -- d'où elle vient, pour les statistiques futures
  module_id    INTEGER,
  module_titre TEXT,
  enonce       TEXT NOT NULL,
  multiple     INTEGER NOT NULL DEFAULT 0,
  position     INTEGER NOT NULL,
  correct_json TEXT NOT NULL,
  reponse_json TEXT,
  repondu_le   TEXT,
  correcte     INTEGER           -- renseigné à la soumission, jamais avant
);
CREATE INDEX IF NOT EXISTS idx_academy_tq ON academy_tentative_questions(tentative_id, position);

-- Les choix FIGÉS, dans l'ordre tiré. Aucune marque de correction ici : c'est
-- la table que l'écran voit, elle ne doit rien savoir.
CREATE TABLE IF NOT EXISTS academy_tentative_choix (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  tq_id    INTEGER NOT NULL REFERENCES academy_tentative_questions(id) ON DELETE CASCADE,
  choix_id INTEGER,
  texte    TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_academy_tchoix ON academy_tentative_choix(tq_id, position);
`;

// Questions de DÉMONSTRATION. Repérées par une clé « demo-q… », comme les
// contenus du lot 1 le sont par « demo-m… » : l'administration pourra les
// désactiver d'un geste. Les vraies questions de la formation seront saisies
// depuis l'écran d'administration (lot 4), sans toucher à ce fichier.
//
// Elles sont volontairement ÉVIDENTES : ce sont des questions d'appareillage,
// destinées à éprouver le tirage, le gel et la correction — pas à évaluer qui
// que ce soit.
const AMORCE_QUESTIONS = [
  { cle: 'demo-q1', module: 'demo-m1', enonce: 'Un Coach Nutrition peut-il poser un diagnostic médical ?',
    choix: [['Non, jamais : ce n\'est pas son rôle', 1], ['Oui, s\'il a suivi la formation', 0], ['Oui, pour les cas simples', 0]] },
  { cle: 'demo-q2', module: 'demo-m1', enonce: 'Combien d\'actions le coach fixe-t-il à la fin d\'un rendez-vous ?',
    choix: [['Une seule', 1], ['Trois', 0], ['Autant que le client en accepte', 0], ['Aucune', 0]] },
  { cle: 'demo-q3', module: 'demo-m1', enonce: 'Face à un écart de son client, que fait le coach ? (plusieurs réponses)',
    choix: [['Il le constate sans juger', 1], ['Il cherche avec lui ce qui l\'a déclenché', 1],
      ['Il lui rappelle qu\'il manque de volonté', 0], ['Il interrompt le suivi', 0]] },
  { cle: 'demo-q4', module: 'demo-m1', enonce: 'La posture attendue d\'un Coach Nutrition est :',
    choix: [['Bienveillante et factuelle', 1], ['Autoritaire', 0], ['Distante', 0], ['Complaisante', 0]] },
  { cle: 'demo-q5', module: 'demo-m2', enonce: 'À quoi sert le premier rendez-vous (S1) ?',
    choix: [['À découvrir le client et à poser le cadre du suivi', 1], ['À vendre un programme complémentaire', 0],
      ['À faire signer un engagement de résultat', 0]] },
  { cle: 'demo-q6', module: 'demo-m2', enonce: 'Un suivi hebdomadaire réussi comporte : (plusieurs réponses)',
    choix: [['Un constat', 1], ['Une décision', 1], ['Une action pour la semaine qui vient', 1],
      ['Un jugement sur la volonté du client', 0]] },
  { cle: 'demo-q7', module: 'demo-m2', enonce: 'Le client n\'a pas réalisé son action de la semaine. Que fait le coach ?',
    choix: [['Il en cherche la cause avec lui avant de décider de la suite', 1],
      ['Il repose la même action sans rien changer', 0], ['Il en fixe cinq pour rattraper', 0]] },
  { cle: 'demo-q8', module: 'demo-m2', enonce: 'Un Boost Nutrition dure, à compter de la validation de l\'Étape 1 :',
    choix: [['16 semaines', 1], ['6 semaines', 0], ['52 semaines', 0]] },
  { cle: 'demo-q9', module: 'demo-m2', enonce: 'Qui peut se voir attribuer le suivi d\'un client dans le Boost ?',
    choix: [['Un collaborateur certifié Coach Nutrition', 1], ['N\'importe quel collaborateur', 0],
      ['N\'importe quel client du Boost', 0]] },
  { cle: 'demo-q10', module: 'demo-m1', enonce: 'Marquer un contenu « terminé » dans l\'Academy signifie : (plusieurs réponses)',
    choix: [['Que le collaborateur déclare l\'avoir suivi', 1], ['Que sa progression avance d\'autant', 1],
      ['Que l\'application a vérifié le visionnage', 0], ['Qu\'il est certifié Coach Nutrition', 0]] },
];

// Fisher-Yates. Sur une COPIE : mélanger le tableau reçu modifierait la banque
// lue juste avant, et rendrait un bug de tirage indétectable à la relecture.
function melangerDefaut(liste) {
  const a = [...liste];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const memesIds = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const trierNum = (l) => [...new Set(l.map(Number).filter(Number.isInteger))].sort((x, y) => x - y);

function createAcademyQcm({ getDb, nowIso, boost, academy, formations, melanger = melangerDefaut }) {
  const db = () => getDb();
  const normalise = (e) => String(e || '').trim().toLowerCase();

  // La formation visée. Absente -> celle du catalogue par défaut : c'est ce
  // qui laisse fonctionner tout l'existant sans le réécrire.
  const cleFormation = (f) => (f ? (typeof f === 'string' ? f : f.cle)
    : ((formations.defaut() || {}).cle || COACH_NUTRITION));

  const basesMigrees = new WeakSet();
  function assurerSchema() {
    const d = db();
    if (basesMigrees.has(d)) return true;
    // Les tables du QCM référencent academy_modules : le socle du lot 1 doit
    // exister d'abord (les clés étrangères sont actives dans cette base).
    academy.assurerSchema();
    d.exec(SCHEMA_QCM);
    // Base existante : on pose la colonne et l'existant se rattache à la
    // formation historique. Aucune ligne réécrite, aucune donnée perdue.
    ajouterColonne(d, 'academy_questions', 'formation', `TEXT NOT NULL DEFAULT '${COACH_NUTRITION}'`);
    ajouterColonne(d, 'academy_tentatives', 'formation', `TEXT NOT NULL DEFAULT '${COACH_NUTRITION}'`);
    basesMigrees.add(d);
    amorcer();
    return true;
  }

  // Amorçage idempotent, repéré par `cle` — même principe que le lot 1 :
  // redémarrer ne duplique rien, et une question réécrite par l'administration
  // n'est jamais réécrasée.
  function amorcer() {
    const d = db();
    const maintenant = nowIso();
    let ajouts = 0;
    d.transaction(() => {
      for (const [cle, defaut] of [[CFG_NB, DEFAUTS.nbQuestions], [CFG_SEUIL, DEFAUTS.seuilPct]]) {
        const info = d.prepare('INSERT INTO academy_config (cle, valeur, maj_le) VALUES (?,?,?) ON CONFLICT(cle) DO NOTHING')
          .run(cle, String(defaut), maintenant);
        ajouts += info.changes;
      }
      const qExiste = d.prepare('SELECT id FROM academy_questions WHERE cle = ?');
      const module = d.prepare('SELECT id FROM academy_modules WHERE cle = ?');
      AMORCE_QUESTIONS.forEach((q, iq) => {
        if (qExiste.get(q.cle)) return;
        const m = module.get(q.module);
        const info = d.prepare(`INSERT INTO academy_questions (formation, module_id, enonce, actif, ordre, cle, cree_le, maj_le)
                                VALUES (?,?,?,1,?,?,?,?)`)
          .run(COACH_NUTRITION, m ? m.id : null, q.enonce, iq + 1, q.cle, maintenant, maintenant);
        q.choix.forEach(([texte, correct], i) => {
          d.prepare('INSERT INTO academy_choix (question_id, texte, correct, actif, ordre, cle, cree_le, maj_le) VALUES (?,?,?,1,?,?,?,?)')
            .run(Number(info.lastInsertRowid), texte, correct ? 1 : 0, i + 1, `${q.cle}-c${i + 1}`, maintenant, maintenant);
        });
        ajouts++;
      });
    })();
    return ajouts;
  }

  // -- Configuration ---------------------------------------------------------

  // LA CONFIGURATION VIENT DE LA FORMATION, et d'elle seule. academy_config
  // reste en place pour d'éventuels réglages réellement globaux, mais le
  // nombre de questions et le seuil sont des propriétés du PARCOURS : les
  // laisser en double ferait deux vérités, et un jour deux réponses.
  function lireConfig(formation) {
    const f = formations.lire(cleFormation(formation));
    return f
      ? { nbQuestions: f.qcmNbQuestions, seuilPct: f.qcmSeuilPct }
      : { nbQuestions: DEFAUTS.nbQuestions, seuilPct: DEFAUTS.seuilPct };
  }

  function definirConfig(donnees, auteur, formation) {
    const cle = cleFormation(formation);
    const actuel = lireConfig(cle);
    const nb = donnees.nbQuestions === undefined ? actuel.nbQuestions : Number(donnees.nbQuestions);
    const seuil = donnees.seuilPct === undefined ? actuel.seuilPct : Number(donnees.seuilPct);
    if (!Number.isInteger(nb) || nb < 1 || nb > 200) return err(400, 'Le nombre de questions doit être un entier entre 1 et 200.');
    if (!Number.isInteger(seuil) || seuil < 0 || seuil > 100) return err(400, 'Le seuil de réussite doit être un entier entre 0 et 100.');
    const f = formations.lire(cle);
    if (!f) return err(404, 'Formation inconnue.');
    const r = formations.definir({
      cle: f.cle, libelle: f.libelle, titre: f.titre, ordre: f.ordre, actif: f.actif,
      pratiqueObligatoire: f.pratiqueObligatoire, certificationActive: f.certificationActive,
      qcmNbQuestions: nb, qcmSeuilPct: seuil,
    }, auteur);
    if (!r.ok) return r;
    return ok({ config: lireConfig(cle) });
  }

  // -- Banque ----------------------------------------------------------------

  // Les questions tirables. Une question dont le module est désactivé sort du
  // tirage : elle porte sur un contenu que plus personne ne suit.
  //
  // On écarte aussi les questions INCORRIGEABLES — sans bonne réponse, sans
  // mauvaise, ou avec un seul choix. Mieux vaut une banque plus courte qu'une
  // question que tout le monde réussit sans la lire.
  function questionsEligibles(formation) {
    const qs = db().prepare(`SELECT q.id AS id, q.enonce AS enonce, q.module_id AS moduleId, m.titre AS moduleTitre
                             FROM academy_questions q
                             LEFT JOIN academy_modules m ON m.id = q.module_id
                             WHERE q.formation = ? AND q.actif = 1 AND (q.module_id IS NULL OR m.actif = 1)
                             ORDER BY q.ordre ASC, q.id ASC`).all(cleFormation(formation));
    const lireChoix = db().prepare('SELECT id, texte, correct FROM academy_choix WHERE question_id = ? AND actif = 1 ORDER BY ordre ASC, id ASC');
    return qs
      .map((q) => ({ ...q, choix: lireChoix.all(q.id) }))
      .filter((q) => {
        const bons = q.choix.filter((c) => c.correct).length;
        return q.choix.length >= 2 && bons >= 1 && bons < q.choix.length;
      });
  }

  // -- Accès -----------------------------------------------------------------

  // Le QCM final s'ouvre quand TOUS les contenus actifs sont terminés. C'est la
  // formation qui décide, pas une case à part : ajouter un contenu demain
  // refermera naturellement l'accès de ceux qui ne l'ont pas encore suivi.
  function formationAchevee(email, formation) {
    const f = academy.formationPour(email, cleFormation(formation));
    return { acheve: !!f.acheve, total: f.total, termines: f.termines, pourcentage: f.pourcentage };
  }

  // -- Tentatives ------------------------------------------------------------

  const ligneTentative = (id, email) =>
    db().prepare('SELECT * FROM academy_tentatives WHERE id = ? AND email = ?').get(Number(id), normalise(email));

  const tentativeEnCours = (email, formation) =>
    db().prepare(`SELECT * FROM academy_tentatives WHERE email = ? AND formation = ? AND statut = ?
                  ORDER BY id DESC LIMIT 1`)
      .get(normalise(email), cleFormation(formation), T_EN_COURS);

  // La vue destinée au collaborateur. Elle ne lit JAMAIS correct_json : les
  // colonnes sont énumérées, et cette énumération est le contrat de sécurité du
  // fichier. Un `SELECT *` ici serait la fuite.
  function vueTentative(t) {
    const questions = db().prepare(`SELECT id, position, enonce, multiple, module_titre AS moduleTitre, reponse_json AS reponseJson
                                    FROM academy_tentative_questions WHERE tentative_id = ? ORDER BY position ASC, id ASC`)
      .all(t.id);
    const lireChoix = db().prepare('SELECT id, texte FROM academy_tentative_choix WHERE tq_id = ? ORDER BY position ASC, id ASC');
    const vues = questions.map((q) => ({
      id: q.id,
      position: q.position,
      enonce: q.enonce,
      multiple: !!q.multiple,
      moduleTitre: q.moduleTitre || null,
      choix: lireChoix.all(q.id),
      reponse: q.reponseJson ? JSON.parse(q.reponseJson) : [],
    }));
    return {
      id: t.id,
      statut: t.statut,
      nbQuestions: t.nb_questions,
      seuilPct: t.seuil_pct,
      ouverteLe: t.ouverte_le,
      soumiseLe: t.soumise_le,
      repondues: vues.filter((q) => q.reponse.length > 0).length,
      questions: vues,
      resultat: t.statut === T_SOUMISE ? resultatDe(t) : null,
    };
  }

  // Le résultat tel qu'on l'annonce : un score, un compte, et les modules à
  // revoir. PAS le détail question par question — savoir lesquelles sont
  // tombées à côté revient à distribuer la moitié du corrigé, et le cahier des
  // charges demande explicitement de ne pas révéler les bonnes réponses.
  function resultatDe(t) {
    const qs = db().prepare('SELECT module_titre AS moduleTitre, correcte FROM academy_tentative_questions WHERE tentative_id = ?')
      .all(t.id);
    const aRevoir = new Map();
    for (const q of qs) {
      if (q.correcte) continue;
      const nom = q.moduleTitre || 'Formation générale';
      aRevoir.set(nom, (aRevoir.get(nom) || 0) + 1);
    }
    return {
      scorePct: t.score_pct,
      bonnes: t.bonnes,
      total: t.nb_questions,
      seuilPct: t.seuil_pct,
      reussie: !!t.reussie,
      aRevoir: [...aRevoir.entries()].map(([module, questions]) => ({ module, questions })),
    };
  }

  // Le résumé d'une tentative, sans ses questions : ce qu'affichent la carte de
  // l'écran d'accueil et l'historique. Aucune trace du corrigé, là non plus.
  const resumeTentative = (t) => ({
    id: t.id, statut: t.statut, nbQuestions: t.nb_questions, seuilPct: t.seuil_pct,
    ouverteLe: t.ouverte_le, soumiseLe: t.soumise_le,
    scorePct: t.score_pct, bonnes: t.bonnes, reussie: !!t.reussie,
    repondues: db().prepare(`SELECT COUNT(*) AS n FROM academy_tentative_questions
                             WHERE tentative_id = ? AND reponse_json IS NOT NULL AND reponse_json <> '[]'`).get(t.id).n,
  });

  function historiqueDe(email, formation) {
    return db().prepare('SELECT * FROM academy_tentatives WHERE email = ? AND formation = ? ORDER BY id DESC')
      .all(normalise(email), cleFormation(formation)).map(resumeTentative);
  }

  // La théorie se DÉDUIT de l'historique : « il existe une tentative réussie ».
  // Rien à maintenir, rien à défaire, et surtout rien qui puisse la reprendre —
  // une tentative ratée plus tard ne fait pas disparaître celle qui a réussi.
  function tentativeReussie(email, formation) {
    return db().prepare(`SELECT * FROM academy_tentatives WHERE email = ? AND formation = ? AND reussie = 1
                         ORDER BY score_pct DESC, id ASC LIMIT 1`)
      .get(normalise(email), cleFormation(formation)) || null;
  }

  // L'état complet, tel que l'écran l'affiche. Tout est recalculé : aucun de ces
  // drapeaux n'est stocké quelque part où il pourrait se désynchroniser.
  function etatPour(email, formationCle) {
    const mail = normalise(email);
    const cle = cleFormation(formationCle);
    const formation = formationAchevee(mail, cle);
    const enCours = tentativeEnCours(mail, cle);
    const reussie = tentativeReussie(mail, cle);
    const derniere = db().prepare(`SELECT * FROM academy_tentatives WHERE email = ? AND formation = ?
                                   AND statut = ? ORDER BY id DESC LIMIT 1`)
      .get(mail, cle, T_SOUMISE);
    const cert = boost.lireCertification(mail);
    const certifie = cert.statut === 'certifie';

    let etat = ETAT_FORMATION;
    if (formation.acheve) {
      if (reussie) etat = ETAT_VALIDEE;
      else if (enCours) etat = ETAT_EVALUATION;
      else if (derniere) etat = ETAT_ECHOUE;
      else etat = ETAT_DISPONIBLE;
    }

    return {
      cleFormation: cle,
      etat,
      formation,
      // Le QCM s'ouvre uniquement quand la formation est achevée.
      disponible: formation.acheve,
      // La configuration ANNONCÉE : celle qui s'appliquera à une nouvelle
      // tentative. Celle d'une tentative en cours est dans la tentative.
      config: lireConfig(cle),
      theorieValidee: !!reussie,
      scoreValide: reussie ? reussie.score_pct : null,
      valideeLe: reussie ? reussie.soumise_le : null,
      enCours: enCours ? resumeTentative(enCours) : null,
      derniere: derniere ? resumeTentative(derniere) : null,
      historique: historiqueDe(mail, cle),
      // Ce que la réussite ouvre — et ce qu'elle n'ouvre pas. Les deux sont
      // renvoyés côte à côte pour que l'écran ne puisse pas les confondre.
      certifie,
      certification: cert.statut,
      eligiblePratique: !!reussie && !certifie,
    };
  }

  // -- Démarrer --------------------------------------------------------------

  function demarrer(email, formationCle) {
    const mail = normalise(email);
    const cle = cleFormation(formationCle);
    const formation = formationAchevee(mail, cle);
    if (!formation.acheve) {
      return err(409, 'Termine d\'abord tous les contenus de la formation : l\'évaluation théorique s\'ouvrira ensuite.',
        { formationIncomplete: true, formation });
    }
    // Une tentative en cours est REPRISE, jamais doublée. Cliquer deux fois sur
    // « commencer » ne doit pas retirer au collaborateur le questionnaire
    // auquel il a déjà répondu à moitié.
    const enCours = tentativeEnCours(mail, cle);
    if (enCours) return ok({ tentative: vueTentative(enCours), reprise: true });

    const pool = questionsEligibles(cle);
    if (!pool.length) return err(409, 'Aucune question n\'est disponible pour le moment. Préviens ton référent.');

    const cfg = lireConfig(cle);
    const tirage = melanger(pool).slice(0, Math.min(cfg.nbQuestions, pool.length));

    const maintenant = nowIso();
    const d = db();
    let id = null;
    d.transaction(() => {
      // nb_questions = ce qui a RÉELLEMENT été tiré, pas ce qui était demandé :
      // si la banque est plus courte que la configuration, le score doit se
      // calculer sur les questions posées.
      const info = d.prepare(`INSERT INTO academy_tentatives (email, formation, statut, nb_questions, seuil_pct, ouverte_le)
                              VALUES (?, ?, ?, ?, ?, ?)`)
        .run(mail, cle, T_EN_COURS, tirage.length, cfg.seuilPct, maintenant);
      id = Number(info.lastInsertRowid);

      const insQ = d.prepare(`INSERT INTO academy_tentative_questions
          (tentative_id, question_id, module_id, module_titre, enonce, multiple, position, correct_json)
          VALUES (?,?,?,?,?,?,?,?)`);
      const insC = d.prepare('INSERT INTO academy_tentative_choix (tq_id, choix_id, texte, position) VALUES (?,?,?,?)');
      const majCorrect = d.prepare('UPDATE academy_tentative_questions SET correct_json = ? WHERE id = ?');

      tirage.forEach((q, i) => {
        const bons = q.choix.filter((c) => c.correct).length;
        const infoQ = insQ.run(id, q.id, q.moduleId, q.moduleTitre || null, q.enonce, bons > 1 ? 1 : 0, i + 1, '[]');
        const tqId = Number(infoQ.lastInsertRowid);
        // L'ordre des choix est tiré ici, une fois pour toutes. Le mélanger à
        // l'affichage donnerait un questionnaire différent à chaque rechargement
        // de la page — et rendrait « revenir sur ses réponses » incompréhensible.
        const corrects = [];
        melanger(q.choix).forEach((c, j) => {
          const infoC = insC.run(tqId, c.id, c.texte, j + 1);
          if (c.correct) corrects.push(Number(infoC.lastInsertRowid));
        });
        majCorrect.run(JSON.stringify(corrects.sort((a, b) => a - b)), tqId);
      });
    })();

    return ok({ tentative: vueTentative(ligneTentative(id, mail)), reprise: false }, 201);
  }

  // -- Lire ------------------------------------------------------------------

  // 404 et non 403 quand la tentative n'est pas la sienne : un 403 confirmerait
  // qu'elle existe, ce qui est déjà une information de trop. Même règle que
  // partout dans le Boost.
  function lireTentative(email, id) {
    const t = ligneTentative(id, email);
    if (!t) return err(404, 'Tentative introuvable.');
    return ok({ tentative: vueTentative(t) });
  }

  // -- Répondre --------------------------------------------------------------

  // La réponse ne peut désigner que des choix APPARTENANT à cette question de
  // cette tentative. C'est ce qui rend l'injection d'une question ou d'un choix
  // étranger impossible : les identifiants sont vérifiés contre la tentative,
  // jamais contre la banque.
  function repondre(email, tentativeId, tqId, choixDemandes) {
    const t = ligneTentative(tentativeId, email);
    if (!t) return err(404, 'Tentative introuvable.');
    if (t.statut !== T_EN_COURS) return err(409, 'Cette évaluation est déjà terminée : elle n\'est plus modifiable.');

    const q = db().prepare('SELECT id, multiple FROM academy_tentative_questions WHERE id = ? AND tentative_id = ?')
      .get(Number(tqId), t.id);
    if (!q) return err(404, 'Question introuvable dans cette évaluation.');

    const permis = db().prepare('SELECT id FROM academy_tentative_choix WHERE tq_id = ?').all(q.id).map((c) => c.id);
    const brut = Array.isArray(choixDemandes) ? choixDemandes : [choixDemandes];
    const demandes = trierNum(brut);
    // Un identifiant illisible est REFUSÉ, pas ignoré. Le laisser tomber
    // silencieusement transformerait une requête abîmée en « pas de réponse » :
    // le collaborateur croirait avoir répondu, et perdrait le point sans savoir
    // pourquoi.
    if (demandes.length !== brut.length || demandes.some((c) => !permis.includes(c))) {
      return err(400, 'Réponse invalide : ce choix n\'appartient pas à cette question.');
    }
    // Une question à réponse unique n'accepte qu'un choix. Sans ce garde-fou,
    // tout cocher garantirait la bonne réponse à qui poste directement.
    if (!q.multiple && demandes.length > 1) return err(400, 'Cette question n\'admet qu\'une seule réponse.');

    db().prepare('UPDATE academy_tentative_questions SET reponse_json = ?, repondu_le = ? WHERE id = ?')
      .run(JSON.stringify(demandes), nowIso(), q.id);

    return ok({ tentative: vueTentative(ligneTentative(t.id, email)) });
  }

  // -- Soumettre -------------------------------------------------------------

  // TOUTE la correction est ici, et nulle part ailleurs. Le navigateur envoie
  // des identifiants de choix ; il ne dit ni ce qui est juste, ni quel score il
  // pense avoir, ni quel seuil s'applique — ces trois-là viennent de la base.
  function terminer(email, tentativeId) {
    const mail = normalise(email);
    const t = ligneTentative(tentativeId, mail);
    if (!t) return err(404, 'Tentative introuvable.');
    if (t.statut !== T_EN_COURS) {
      return err(409, 'Cette évaluation a déjà été rendue.', { tentative: vueTentative(t) });
    }

    const qs = db().prepare('SELECT id, correct_json AS correctJson, reponse_json AS reponseJson FROM academy_tentative_questions WHERE tentative_id = ?')
      .all(t.id);

    const d = db();
    let bonnes = 0;
    const marquer = d.prepare('UPDATE academy_tentative_questions SET correcte = ? WHERE id = ?');
    d.transaction(() => {
      for (const q of qs) {
        const attendu = trierNum(JSON.parse(q.correctJson || '[]'));
        const donne = trierNum(JSON.parse(q.reponseJson || '[]'));
        // Choix multiple : il faut EXACTEMENT l'ensemble des bonnes réponses.
        // Ni moins (une réponse partielle n'est pas la réponse), ni plus (cocher
        // tout n'est pas répondre). Pas de demi-point.
        const juste = donne.length > 0 && memesIds(attendu, donne);
        if (juste) bonnes++;
        marquer.run(juste ? 1 : 0, q.id);
      }
      // Le seuil comparé est celui FIGÉ dans la tentative, pas celui du jour.
      const score = t.nb_questions ? Math.round((bonnes / t.nb_questions) * 100) : 0;
      const reussie = score >= t.seuil_pct ? 1 : 0;
      d.prepare('UPDATE academy_tentatives SET statut = ?, soumise_le = ?, score_pct = ?, bonnes = ?, reussie = ? WHERE id = ?')
        .run(T_SOUMISE, nowIso(), score, bonnes, reussie, t.id);
    })();

    const clos = ligneTentative(t.id, mail);
    // La réussite est reportée dans le système de certification EXISTANT. Elle
    // y inscrit « théorie validée, parcours pratique ouvert » — jamais
    // « certifié » : ce verdict-là appartient à l'évaluateur humain.
    if (clos.reussie) boost.enregistrerQcmTheorie(mail, clos.score_pct, 'academy');

    return ok({ tentative: vueTentative(clos), etat: etatPour(mail, clos.formation) });
  }

  return {
    assurerSchema, amorcer,
    lireConfig, definirConfig,
    questionsEligibles, formationAchevee,
    etatPour, demarrer, lireTentative, repondre, terminer,
    historiqueDe, tentativeEnCours,
  };
}

module.exports = {
  createAcademyQcm,
  AMORCE_QUESTIONS, DEFAUTS,
  T_EN_COURS, T_SOUMISE,
  ETAT_FORMATION, ETAT_DISPONIBLE, ETAT_EVALUATION, ETAT_ECHOUE, ETAT_VALIDEE,
};
