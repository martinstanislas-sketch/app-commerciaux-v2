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
const BANQUE_CN = require('./academyBanqueCoachNutrition');

// Valeurs d'AMORÇAGE, et rien d'autre. La logique lit toujours la table
// academy_config : ces deux nombres servent à la remplir la première fois, puis
// n'ont plus voix au chapitre. C'est ce qui permettra à l'administration (lot 4)
// de les changer sans redéploiement.
const CFG_NB = 'qcm_nb_questions';
const CFG_SEUIL = 'qcm_seuil_pct';
const DEFAUTS = { nbQuestions: 5, seuilPct: 80 };

const T_EN_COURS = 'en_cours';
const T_SOUMISE = 'soumise';

// ---------------------------------------------------------------------------
//  DEUX BANQUES, DEUX ÉPREUVES.
//
//  `usage` range une question dans l'une des deux banques ; `portee` dit pour
//  laquelle des deux épreuves une tentative a été ouverte. Les deux mots
//  décrivent la même séparation vue de deux côtés, et le moteur les tient
//  APPARIÉS : une tentative de portée « module » ne tire que des questions
//  d'usage « mini », et réciproquement. Jamais de mélange, jamais de défaut
//  implicite qui rattraperait un oubli d'appel.
//
//  Le défaut est « finale » des deux côtés : c'est ce qu'était l'existant avant
//  l'arrivée du mini-QCM, et c'est donc ce que doivent devenir les lignes déjà
//  en base sans qu'on en réécrive une seule.
// ---------------------------------------------------------------------------
const USAGE_MINI = 'mini';
const USAGE_FINALE = 'finale';
const PORTEE_MODULE = 'module';
const PORTEE_FINALE = 'finale';
const usageDePortee = (p) => (p === PORTEE_MODULE ? USAGE_MINI : USAGE_FINALE);

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
  -- LA colonne qui sépare les deux banques : « mini » pour les mini-QCM de fin
  -- de module, « finale » pour le QCM de certification théorique. Le tirage
  -- filtre dessus systématiquement — c'est ce qui rend le mélange impossible,
  -- plutôt qu'improbable.
  usage       TEXT NOT NULL DEFAULT 'finale',
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
  -- Pour QUELLE épreuve cette tentative a été ouverte. « finale » = le QCM de
  -- certification théorique ; « module » = le mini-QCM de fin de module, et
  -- module_id dit alors lequel.
  --
  -- ⚠️ TOUTES les lectures qui répondent « la théorie est-elle validée ? »
  -- filtrent sur portee = 'finale'. Sans ce filtre, réussir un mini-QCM
  -- validerait la théorie — silencieusement, et sans que rien ne le signale.
  portee       TEXT NOT NULL DEFAULT 'finale',
  module_id    INTEGER,
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
    // Base existante : les questions déjà en place sont celles du QCM final, et
    // les tentatives déjà passées sont des tentatives finales. Le défaut des
    // colonnes dit donc la vérité — aucune ligne à réécrire.
    ajouterColonne(d, 'academy_questions', 'usage', `TEXT NOT NULL DEFAULT '${USAGE_FINALE}'`);
    ajouterColonne(d, 'academy_tentatives', 'portee', `TEXT NOT NULL DEFAULT '${PORTEE_FINALE}'`);
    ajouterColonne(d, 'academy_tentatives', 'module_id', 'INTEGER');
    // ⚠️ LES INDEX QUI CITENT CES COLONNES VIENNENT APRÈS L'ALTER, ET PAS DANS
    // LE SCHÉMA. Sur une base NEUVE, le CREATE TABLE pose déjà les colonnes et
    // un index déclaré plus haut passerait ; sur une base EXISTANTE, le
    // CREATE TABLE IF NOT EXISTS ne fait rien, l'index s'exécuterait avant
    // l'ALTER et échouerait sur « no such column ». Le piège ne se voit qu'en
    // migration réelle — jamais dans une suite de tests partie d'une base vide.
    d.exec(`CREATE INDEX IF NOT EXISTS idx_academy_questions_u
              ON academy_questions(formation, usage, actif);
            CREATE INDEX IF NOT EXISTS idx_academy_tentatives_p
              ON academy_tentatives(email, formation, portee, module_id);`);
    basesMigrees.add(d);
    amorcer();
    importerBanqueCoachNutrition();
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

  // -- La banque réelle de Coach Nutrition -----------------------------------
  //
  //  IMPORT UNIQUE, repéré par un marqueur dans academy_config. Une fois posé,
  //  plus rien n'est rejoué : ni les 60 questions, ni les réglages. C'est ce qui
  //  permet de redémarrer le serveur sans réécraser une question retouchée
  //  depuis l'écran d'administration — l'inverse serait un piège, puisque
  //  l'administration est justement faite pour corriger une coquille.
  //
  //  ⚠️ TOUT OU RIEN. Si un seul module attendu manque à l'appel, on n'écrit
  //  RIEN et on le dit. Écrire les sept modules trouvés et taire le huitième
  //  laisserait une formation à moitié posée, qu'aucun contrôle ne rattraperait
  //  ensuite puisque le marqueur serait, lui, bien en place.

  // Les titres en base emploient l'apostrophe ASCII, le document source
  // l'apostrophe typographique. On compare donc des titres NORMALISÉS : sinon
  // le garde-fou refuserait un module parfaitement correct.
  const memeTitre = (a, b) => String(a || '').replace(/[’‘]/g, "'").trim().toLowerCase().replace(/\s+/g, ' ')
    === String(b || '').replace(/[’‘]/g, "'").trim().toLowerCase().replace(/\s+/g, ' ');

  function importerBanqueCoachNutrition() {
    const d = db();
    if (d.prepare('SELECT cle FROM academy_config WHERE cle = ?').get(BANQUE_CN.MARQUEUR)) return 0;
    // La formation doit exister : sur une base neuve, l'amorçage du catalogue
    // l'a posée avant nous (assurerSchema du lot 5 tourne en premier).
    const f = formations.lire(COACH_NUTRITION);
    if (!f) return 0;

    // Résolution des modules AVANT toute écriture.
    const lireModule = d.prepare(`SELECT id, titre FROM academy_modules
                                  WHERE formation = ? AND ordre = ? AND actif = 1
                                  ORDER BY id ASC LIMIT 1`);
    const cibles = [];
    for (const bloc of BANQUE_CN.MINI) {
      const m = lireModule.get(COACH_NUTRITION, bloc.ordre);
      if (!m || !memeTitre(m.titre, bloc.titre)) return 0;
      cibles.push({ bloc, moduleId: m.id });
    }

    const maintenant = nowIso();
    const existe = d.prepare('SELECT id FROM academy_questions WHERE cle = ?');
    const insQ = d.prepare(`INSERT INTO academy_questions
        (formation, module_id, usage, enonce, actif, ordre, cle, cree_le, maj_le)
        VALUES (?,?,?,?,1,?,?,?,?)`);
    const insC = d.prepare(`INSERT INTO academy_choix
        (question_id, texte, correct, actif, ordre, cle, cree_le, maj_le)
        VALUES (?,?,?,1,?,?,?,?)`);

    let ajouts = 0;
    const poser = (cle, moduleId, usage, ordre, q) => {
      if (existe.get(cle)) return;
      const info = insQ.run(COACH_NUTRITION, moduleId, usage, q.enonce, ordre, cle, maintenant, maintenant);
      const qid = Number(info.lastInsertRowid);
      q.choix.forEach(([texte, correct], i) => {
        insC.run(qid, texte, correct ? 1 : 0, i + 1, `${cle}-c${i + 1}`, maintenant, maintenant);
      });
      ajouts++;
    };

    d.transaction(() => {
      for (const { bloc, moduleId } of cibles) {
        bloc.questions.forEach((q, i) => poser(`${bloc.prefixe}-q${i + 1}`, moduleId, USAGE_MINI, i + 1, q));
      }
      // Les questions finales ne portent aucun module : elles sont transversales.
      BANQUE_CN.FINALE.forEach((q, i) => {
        poser(`cn-fin-q${String(i + 1).padStart(2, '0')}`, null, USAGE_FINALE, i + 1, q);
      });
      // LES QUESTIONS DE DÉMONSTRATION SORTENT DU TIRAGE. Elles appartiennent
      // à la banque finale que celle-ci remplace : les laisser actives ferait
      // tirer le QCM final dans un mélange de vraies questions et de questions
      // d'appareillage — un QCM de certification à moitié factice, sans que
      // rien ne le signale. On archive, on ne supprime pas : l'historique des
      // tentatives passées y fait référence.
      d.prepare(`UPDATE academy_questions SET actif = 0, maj_le = ?
                 WHERE formation = ? AND cle LIKE 'demo-q%' AND actif = 1`)
        .run(maintenant, COACH_NUTRITION);

      // Les réglages que cette banque suppose, posés une seule fois. Ensuite
      // ils se modifient depuis l'administration comme n'importe quel réglage.
      const r = BANQUE_CN.REGLAGES;
      d.prepare(`UPDATE academy_formations SET qcm_nb_questions = ?, qcm_seuil_pct = ?,
                   mini_nb_questions = ?, mini_seuil_pct = ?, maj_le = ? WHERE cle = ?`)
        .run(r.qcmNbQuestions, r.qcmSeuilPct, r.miniNbQuestions, r.miniSeuilPct, maintenant, COACH_NUTRITION);
      d.prepare('INSERT INTO academy_config (cle, valeur, maj_le) VALUES (?,?,?) ON CONFLICT(cle) DO NOTHING')
        .run(BANQUE_CN.MARQUEUR, String(ajouts), maintenant);
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

  // Le mini-QCM a SES réglages. Les confondre avec ceux du QCM final ferait
  // passer l'épreuve de fin de module à 90 % le jour où on durcit la
  // certification — ce que personne n'aurait demandé.
  function lireConfigMini(formation) {
    const f = formations.lire(cleFormation(formation));
    return f
      ? { nbQuestions: f.miniNbQuestions, seuilPct: f.miniSeuilPct }
      : { nbQuestions: DEFAUTS.nbQuestions, seuilPct: DEFAUTS.seuilPct };
  }

  const configDe = (formation, portee) =>
    (portee === PORTEE_MODULE ? lireConfigMini(formation) : lireConfig(formation));

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
  //  DEUX FILTRES DE PLUS, ET ILS NE SONT PAS FACULTATIFS. `usage` sépare les
  //  deux banques ; `moduleId` restreint le mini-QCM à SON module. Le défaut est
  //  la banque finale : un appel qui oublierait de préciser ne piochera jamais,
  //  par accident, dans les questions pédagogiques.
  function questionsEligibles(formation, { usage = USAGE_FINALE, moduleId = null } = {}) {
    const params = [cleFormation(formation), usage];
    let filtreModule = '';
    if (moduleId !== null && moduleId !== undefined) {
      filtreModule = ' AND q.module_id = ?';
      params.push(Number(moduleId));
    }
    const qs = db().prepare(`SELECT q.id AS id, q.enonce AS enonce, q.module_id AS moduleId, m.titre AS moduleTitre
                             FROM academy_questions q
                             LEFT JOIN academy_modules m ON m.id = q.module_id
                             WHERE q.formation = ? AND q.usage = ? AND q.actif = 1
                               AND (q.module_id IS NULL OR m.actif = 1)${filtreModule}
                             ORDER BY q.ordre ASC, q.id ASC`).all(...params);
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

  // ==========================================================================
  //  LE PARCOURS SÉQUENTIEL
  //
  //  Le verrou vit ICI et pas dans lib/academy.js, pour une raison de sens de
  //  dépendance : le QCM connaît déjà la progression (il en dépend), la
  //  progression ne connaît pas le QCM. Le faire descendre d'un cran créerait
  //  un cycle entre les deux moteurs.
  //
  //  UN MODULE EST « FRANCHI » quand ses contenus sont terminés ET que son
  //  mini-QCM est réussi. Un module SANS banque mini est franchi dès ses
  //  contenus terminés — c'est le cas voulu du module d'introduction, et c'est
  //  une règle générale plutôt qu'une exception nommée : le jour où un autre
  //  module se passe de mini, rien n'est à retoucher.
  //
  //  UN MODULE EST OUVERT quand tous ceux qui le précèdent sont franchis.
  // ==========================================================================

  // Un module sans aucun contenu ne peut pas être « achevé » au sens de la
  // progression — et bloquerait alors tout le parcours derrière lui. Il compte
  // donc comme fait : il n'y a rien à y faire.
  const contenusFaits = (m) => m.total === 0 || !!m.acheve;

  function etatMinis(email, formation, parcours) {
    const mail = normalise(email);
    const cle = cleFormation(formation);
    const p = parcours || academy.formationPour(mail, cle);
    const cfg = lireConfigMini(cle);

    let precedentsFranchis = true;
    return p.modules.map((m) => {
      const aBanque = questionsEligibles(cle, { usage: USAGE_MINI, moduleId: m.id }).length > 0;
      const reussie = tentativeReussie(mail, cle, PORTEE_MODULE, m.id);
      const enCours = tentativeEnCours(mail, cle, PORTEE_MODULE, m.id);
      const derniere = derniereSoumise(mail, cle, PORTEE_MODULE, m.id);
      const faits = contenusFaits(m);

      const deverrouille = precedentsFranchis;
      const disponible = deverrouille && faits && aBanque;
      const franchi = deverrouille && faits && (!aBanque || !!reussie);
      // Le verrou du module SUIVANT se referme dès qu'un module n'est pas franchi.
      precedentsFranchis = precedentsFranchis && franchi;

      return {
        moduleId: m.id,
        moduleTitre: m.titre,
        ordre: m.ordre,
        aBanque,
        contenusAcheves: faits,
        deverrouille,
        disponible,
        franchi,
        reussi: !!reussie,
        scorePct: reussie ? reussie.score_pct : (derniere ? derniere.score_pct : null),
        config: cfg,
        enCours: enCours ? resumeTentative(enCours) : null,
        derniere: derniere ? resumeTentative(derniere) : null,
      };
    });
  }

  // La formation telle que l'écran du collaborateur doit la voir : l'arbre de
  // lib/academy.js, plus l'état du mini et le verrou de chaque module. Les
  // routes servent CECI et non `academy.formationPour` : sinon l'écran
  // afficherait un parcours ouvert que le serveur refuserait ensuite.
  function parcoursPour(email, formation) {
    const mail = normalise(email);
    const cle = cleFormation(formation);
    const p = academy.formationPour(mail, cle);
    const minis = etatMinis(mail, cle, p);
    const parMod = new Map(minis.map((x) => [x.moduleId, x]));
    return {
      ...p,
      modules: p.modules.map((m) => ({ ...m, mini: parMod.get(m.id) || null })),
      minis,
      minisFranchis: minis.every((x) => !x.aBanque || x.reussi),
    };
  }

  // LE GARDE-FOU SERVEUR du verrou. Un verrou seulement dessiné à l'écran n'est
  // pas un verrou : il suffirait d'appeler la route directement pour ouvrir un
  // contenu d'un module encore fermé.
  function contenuAccessible(email, contenuId) {
    const c = academy.lireContenu(contenuId);
    if (!c) return err(404, 'Contenu introuvable.');
    const etat = etatMinis(email, c.formation).find((m) => m.moduleId === c.moduleId);
    if (etat && !etat.deverrouille) {
      return err(409, 'Ce module n\'est pas encore ouvert : réussis d\'abord le mini-QCM du module précédent.',
        { moduleVerrouille: true });
    }
    return ok({ contenu: c });
  }

  // -- Tentatives ------------------------------------------------------------

  const ligneTentative = (id, email) =>
    db().prepare('SELECT * FROM academy_tentatives WHERE id = ? AND email = ?').get(Number(id), normalise(email));

  // ==========================================================================
  //  LES QUATRE LECTURES CLOISONNÉES.
  //
  //  tentativeEnCours, tentativeReussie, derniereSoumise et historiqueDe
  //  répondent toutes, d'une façon ou d'une autre, à « où en est cette personne
  //  sur cette épreuve ». Elles portent donc TOUTES la portée, sans valeur par
  //  défaut permissive : le défaut est « finale », et une tentative de module ne
  //  peut jamais y répondre par accident.
  //
  //  C'est ici, et uniquement ici, que se joue la garantie promise : réussir un
  //  mini-QCM ne valide pas la théorie.
  // ==========================================================================
  function filtrePortee(portee, moduleId) {
    if (portee !== PORTEE_MODULE) return { sql: ' AND portee = ?', params: [PORTEE_FINALE] };
    if (moduleId === null || moduleId === undefined) return { sql: ' AND portee = ?', params: [PORTEE_MODULE] };
    return { sql: ' AND portee = ? AND module_id = ?', params: [PORTEE_MODULE, Number(moduleId)] };
  }

  const tentativeEnCours = (email, formation, portee = PORTEE_FINALE, moduleId = null) => {
    const f = filtrePortee(portee, moduleId);
    return db().prepare(`SELECT * FROM academy_tentatives WHERE email = ? AND formation = ? AND statut = ?${f.sql}
                         ORDER BY id DESC LIMIT 1`)
      .get(normalise(email), cleFormation(formation), T_EN_COURS, ...f.params);
  };

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
    const vue = {
      id: t.id,
      statut: t.statut,
      portee: t.portee || PORTEE_FINALE,
      moduleId: t.module_id || null,
      nbQuestions: t.nb_questions,
      seuilPct: t.seuil_pct,
      ouverteLe: t.ouverte_le,
      soumiseLe: t.soumise_le,
      repondues: vues.filter((q) => q.reponse.length > 0).length,
      questions: vues,
      resultat: t.statut === T_SOUMISE ? resultatDe(t) : null,
    };
    // La clé `corrige` n'est même pas POSÉE quand il n'y en a pas. Un
    // `corrige: null` traînant dans une réponse du QCM final apprendrait à un
    // lecteur attentif qu'un corrigé circule quelque part, et ferait mentir la
    // règle affichée en tête de fichier.
    const corrige = corrigeDe(t);
    return corrige ? { ...vue, corrige } : vue;
  }

  // ==========================================================================
  //  LE CORRIGÉ — LA SEULE ENTORSE, ET ELLE EST VERROUILLÉE PAR LA PORTÉE.
  //
  //  La règle fondatrice de ce fichier est que les bonnes réponses ne quittent
  //  jamais le serveur. Le mini-QCM la lève, parce qu'un exercice qui ne dit pas
  //  ce qui était juste n'apprend rien. Mais elle n'est levée QUE là, et le
  //  verrou est la portée elle-même — pas un paramètre d'appel qu'un appelant
  //  distrait pourrait passer à vrai sur une tentative finale.
  //
  //  Deux conditions, toutes deux nécessaires : portée « module », et tentative
  //  RENDUE. Tant qu'elle est en cours, le corrigé n'existe pas.
  //
  //  Comme les deux banques sont disjointes, révéler le corrigé d'un mini ne
  //  divulgue aucune question du QCM final.
  //
  //  La bonne réponse n'est renvoyée que sur les questions MANQUÉES : sur une
  //  question réussie, le collaborateur l'a déjà sous les yeux.
  // ==========================================================================
  function corrigeDe(t) {
    if (!t || t.portee !== PORTEE_MODULE || t.statut !== T_SOUMISE) return null;
    const qs = db().prepare(`SELECT id, position, enonce, multiple, correcte,
                                    correct_json AS correctJson, reponse_json AS reponseJson
                             FROM academy_tentative_questions WHERE tentative_id = ?
                             ORDER BY position ASC, id ASC`).all(t.id);
    const lireChoix = db().prepare('SELECT id, texte FROM academy_tentative_choix WHERE tq_id = ? ORDER BY position ASC, id ASC');
    return qs.map((q) => {
      const juste = !!q.correcte;
      return {
        id: q.id,
        position: q.position,
        enonce: q.enonce,
        multiple: !!q.multiple,
        correcte: juste,
        reponse: trierNum(JSON.parse(q.reponseJson || '[]')),
        bonnes: juste ? null : trierNum(JSON.parse(q.correctJson || '[]')),
        choix: lireChoix.all(q.id),
      };
    });
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

  function historiqueDe(email, formation, portee = PORTEE_FINALE, moduleId = null) {
    const f = filtrePortee(portee, moduleId);
    return db().prepare(`SELECT * FROM academy_tentatives WHERE email = ? AND formation = ?${f.sql} ORDER BY id DESC`)
      .all(normalise(email), cleFormation(formation), ...f.params).map(resumeTentative);
  }

  const derniereSoumise = (email, formation, portee = PORTEE_FINALE, moduleId = null) => {
    const f = filtrePortee(portee, moduleId);
    return db().prepare(`SELECT * FROM academy_tentatives WHERE email = ? AND formation = ? AND statut = ?${f.sql}
                         ORDER BY id DESC LIMIT 1`)
      .get(normalise(email), cleFormation(formation), T_SOUMISE, ...f.params) || null;
  };

  // La théorie se DÉDUIT de l'historique : « il existe une tentative réussie ».
  // Rien à maintenir, rien à défaire, et surtout rien qui puisse la reprendre —
  // une tentative ratée plus tard ne fait pas disparaître celle qui a réussi.
  function tentativeReussie(email, formation, portee = PORTEE_FINALE, moduleId = null) {
    const f = filtrePortee(portee, moduleId);
    return db().prepare(`SELECT * FROM academy_tentatives WHERE email = ? AND formation = ? AND reussie = 1${f.sql}
                         ORDER BY score_pct DESC, id ASC LIMIT 1`)
      .get(normalise(email), cleFormation(formation), ...f.params) || null;
  }

  // L'état complet, tel que l'écran l'affiche. Tout est recalculé : aucun de ces
  // drapeaux n'est stocké quelque part où il pourrait se désynchroniser.
  function etatPour(email, formationCle) {
    const mail = normalise(email);
    const cle = cleFormation(formationCle);
    const formation = formationAchevee(mail, cle);
    const enCours = tentativeEnCours(mail, cle, PORTEE_FINALE);
    const reussie = tentativeReussie(mail, cle, PORTEE_FINALE);
    const derniere = derniereSoumise(mail, cle, PORTEE_FINALE);
    const cert = boost.lireCertification(mail);
    const certifie = cert.statut === 'certifie';

    // Le QCM final ne s'ouvre pas seulement quand les contenus sont terminés :
    // il faut aussi que tous les mini-QCM aient été franchis. Sans cette
    // condition, le mini du DERNIER module ne bloquerait rien — il n'a aucun
    // module suivant à garder — et se contournerait en allant droit au QCM final.
    const minis = etatMinis(mail, cle);
    const minisFranchis = minis.every((m) => !m.aBanque || m.reussi);
    const ouvert = formation.acheve && minisFranchis;

    let etat = ETAT_FORMATION;
    if (ouvert) {
      if (reussie) etat = ETAT_VALIDEE;
      else if (enCours) etat = ETAT_EVALUATION;
      else if (derniere) etat = ETAT_ECHOUE;
      else etat = ETAT_DISPONIBLE;
    }

    return {
      cleFormation: cle,
      etat,
      formation,
      // Le QCM s'ouvre quand la formation est achevée ET tous les minis franchis.
      disponible: ouvert,
      minis,
      minisFranchis,
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

  function demarrer(email, formationCle, { moduleId = null } = {}) {
    const mail = normalise(email);
    const cle = cleFormation(formationCle);
    const portee = (moduleId === null || moduleId === undefined) ? PORTEE_FINALE : PORTEE_MODULE;

    let cibleModule = null;
    if (portee === PORTEE_MODULE) {
      // Le module doit relever de CETTE formation : un identifiant de module
      // venu d'ailleurs ouvrirait un mini-QCM sur un parcours étranger.
      const etats = etatMinis(mail, cle);
      cibleModule = etats.find((m) => m.moduleId === Number(moduleId)) || null;
      if (!cibleModule) return err(404, 'Module introuvable dans cette formation.');
      if (!cibleModule.deverrouille) {
        return err(409, 'Ce module n\'est pas encore ouvert : réussis d\'abord le mini-QCM du module précédent.',
          { moduleVerrouille: true });
      }
      if (!cibleModule.contenusAcheves) {
        return err(409, 'Termine d\'abord tous les contenus du module : son mini-QCM s\'ouvrira ensuite.',
          { moduleIncomplet: true });
      }
    } else {
      const formation = formationAchevee(mail, cle);
      if (!formation.acheve) {
        return err(409, 'Termine d\'abord tous les contenus de la formation : l\'évaluation théorique s\'ouvrira ensuite.',
          { formationIncomplete: true, formation });
      }
      // Le mini du dernier module n'a aucun module suivant à garder : c'est le
      // QCM final qui le tient. Sans cette vérification, il ne bloquerait rien.
      const minis = etatMinis(mail, cle);
      if (!minis.every((m) => !m.aBanque || m.reussi)) {
        return err(409, 'Réussis d\'abord les mini-QCM de chaque module : l\'évaluation théorique s\'ouvrira ensuite.',
          { minisIncomplets: true, minis });
      }
    }

    // Une tentative en cours est REPRISE, jamais doublée. Cliquer deux fois sur
    // « commencer » ne doit pas retirer au collaborateur le questionnaire
    // auquel il a déjà répondu à moitié.
    const enCours = tentativeEnCours(mail, cle, portee, moduleId);
    if (enCours) return ok({ tentative: vueTentative(enCours), reprise: true });

    const pool = questionsEligibles(cle, { usage: usageDePortee(portee), moduleId });
    if (!pool.length) return err(409, 'Aucune question n\'est disponible pour le moment. Préviens ton référent.');

    const cfg = configDe(cle, portee);
    const tirage = melanger(pool).slice(0, Math.min(cfg.nbQuestions, pool.length));

    const maintenant = nowIso();
    const d = db();
    let id = null;
    d.transaction(() => {
      // nb_questions = ce qui a RÉELLEMENT été tiré, pas ce qui était demandé :
      // si la banque est plus courte que la configuration, le score doit se
      // calculer sur les questions posées.
      const info = d.prepare(`INSERT INTO academy_tentatives
          (email, formation, portee, module_id, statut, nb_questions, seuil_pct, ouverte_le)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(mail, cle, portee, portee === PORTEE_MODULE ? Number(moduleId) : null,
          T_EN_COURS, tirage.length, cfg.seuilPct, maintenant);
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
    //
    // ⚠️ SEULE UNE TENTATIVE FINALE ÉCRIT ICI. Un mini-QCM est un jalon
    // d'apprentissage : il ouvre le module suivant, il ne valide pas la théorie
    // et ne touche jamais au dossier de certification. C'est la deuxième moitié
    // de la garantie — la première étant le cloisonnement des lectures d'état.
    if (clos.reussie && clos.portee === PORTEE_FINALE) {
      boost.enregistrerQcmTheorie(mail, clos.score_pct, 'academy');
    }

    // Un mini rend le parcours (le verrou du module suivant vient peut-être de
    // sauter) ; une finale rend l'état de l'évaluation théorique.
    if (clos.portee === PORTEE_MODULE) {
      return ok({ tentative: vueTentative(clos), parcours: parcoursPour(mail, clos.formation) });
    }
    return ok({ tentative: vueTentative(clos), etat: etatPour(mail, clos.formation) });
  }

  return {
    assurerSchema, amorcer, importerBanqueCoachNutrition,
    lireConfig, lireConfigMini, definirConfig,
    questionsEligibles, formationAchevee,
    etatPour, demarrer, lireTentative, repondre, terminer,
    historiqueDe, tentativeEnCours,
    etatMinis, parcoursPour, contenuAccessible,
  };
}

module.exports = {
  createAcademyQcm,
  AMORCE_QUESTIONS, DEFAUTS,
  T_EN_COURS, T_SOUMISE,
  USAGE_MINI, USAGE_FINALE, PORTEE_MODULE, PORTEE_FINALE,
  ETAT_FORMATION, ETAT_DISPONIBLE, ETAT_EVALUATION, ETAT_ECHOUE, ETAT_VALIDEE,
};
