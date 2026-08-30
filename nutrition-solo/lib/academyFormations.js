'use strict';
// ============================================================================
//  MY COACH ACADEMY — le catalogue des formations (lot 5).
//
//  CE FICHIER EST LE PIVOT DU MOTEUR. Avant lui, « Coach Nutrition » était
//  partout : dans les modules, dans la banque de questions, dans le seuil du
//  QCM, dans l'évaluation pratique. Après lui, Nutrition est UNE LIGNE de
//  table — la première, pas un cas particulier.
//
//  POURQUOI UNE TABLE, ALORS QUE LE LOT 4 DÉFENDAIT UN REGISTRE EN CODE.
//  Parce que ce que porte une formation a changé de nature. Au lot 4, un
//  prérequis était une FONCTION — « le QCM est-il validé ? » — donc du code, et
//  une table n'aurait servi qu'à ranger des libellés. Ici les prérequis
//  deviennent des DRAPEAUX : pratique obligatoire oui/non, certification
//  oui/non, seuil, nombre de questions. Des drapeaux se rangent dans des
//  colonnes, et le registre en code deviendrait l'obstacle qu'il faudrait
//  rouvrir à chaque formation. On assume le renversement.
//
//  CE QUE LE MOTEUR N'A PLUS À SAVOIR :
//   - combien de questions tirer        -> qcm_nb_questions
//   - à partir de quel score on passe   -> qcm_seuil_pct
//   - s'il faut une évaluation humaine  -> pratique_obligatoire
//   - si le parcours délivre un titre   -> certification_active
//   - si ce titre ouvre des droits      -> reflet_boost
//
//  ⚠️ `reflet_boost` est la seule trace de Nutrition dans le dispositif, et
//  c'est une DONNÉE, pas une règle : seule la certification Coach Nutrition
//  ouvre les dossiers du Boost. Une formation « Vente » aura ce drapeau à 0 et
//  n'écrira jamais dans boost_certifications.
// ============================================================================

const { err, ok } = require('./boost');

const COACH_NUTRITION = 'coach_nutrition';

// Garde-fous de saisie, pas des valeurs métier : les valeurs vivent en base.
const NB_MIN = 1, NB_MAX = 200;
const SEUIL_MIN = 0, SEUIL_MAX = 100;

// Une clé de formation sert de valeur dans une dizaine de colonnes et voyage
// dans des URL : on la tient courte et sans surprise.
// LES CATÉGORIES DU CATALOGUE. Une liste FERMÉE, et un seul endroit qui la
// connaît : l'administration, l'import et l'écran coach la lisent tous ici. Le
// jour où une sixième arrive, elle s'ajoute sur cette ligne et nulle part
// ailleurs — c'est ce qui interdit qu'une formation soit un jour classée par du
// code plutôt que par sa donnée.
//
// La catégorie est NULLABLE, et ce n'est pas un oubli : les formations
// antérieures n'en ont pas, et personne ne doit leur en inventer une. Sans
// catégorie, une formation reste entière — elle n'apparaît simplement dans
// aucun onglet de catégorie, seulement dans « toutes ».
const CATEGORIES = ['essentiel', 'signature', 'expertise', 'management', 'boite_a_outils'];
const categorieValide = (v) => CATEGORIES.includes(String(v || ''));

const CLE_RE = /^[a-z][a-z0-9_]{2,39}$/;
const cleValide = (v) => CLE_RE.test(String(v || ''));

const SCHEMA_FORMATIONS = `
-- Le catalogue. Une ligne = une formation, certifiante ou non.
CREATE TABLE IF NOT EXISTS academy_formations (
  cle                  TEXT PRIMARY KEY,
  libelle              TEXT NOT NULL,
  -- Le titre que porte celui qui l'obtient (« Coach Nutrition certifié »).
  -- Vide pour une formation qui ne certifie pas.
  titre_certifie       TEXT,
  ordre                INTEGER NOT NULL DEFAULT 0,
  actif                INTEGER NOT NULL DEFAULT 1,
  -- Le QCM se règle PAR FORMATION : deux parcours n'ont ni la même longueur
  -- d'épreuve ni la même exigence.
  qcm_nb_questions     INTEGER NOT NULL DEFAULT 5,
  qcm_seuil_pct        INTEGER NOT NULL DEFAULT 80,
  -- Le mini-QCM de fin de module se règle SÉPARÉMENT du QCM final. Les deux
  -- épreuves n'ont ni la même longueur, ni la même exigence, ni le même rôle :
  -- l'une jalonne l'apprentissage, l'autre valide la théorie. Un seul couple de
  -- réglages pour les deux obligerait un jour à choisir laquelle sacrifier.
  mini_nb_questions    INTEGER NOT NULL DEFAULT 5,
  mini_seuil_pct       INTEGER NOT NULL DEFAULT 80,
  -- Les deux drapeaux qui dessinent le parcours. À 0, l'étape n'est pas
  -- « sautée » : elle n'est pas demandée.
  pratique_obligatoire INTEGER NOT NULL DEFAULT 1,
  certification_active INTEGER NOT NULL DEFAULT 1,
  reflet_boost         INTEGER NOT NULL DEFAULT 0,
  -- La présentation de la formation, telle que l'administration la saisit.
  -- Nullable : une formation peut très bien n'avoir que son libellé.
  description          TEXT,
  -- La grande famille du catalogue. NULLABLE : voir CATEGORIES ci-dessus.
  categorie            TEXT,
  cree_le              TEXT NOT NULL,
  maj_le               TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_academy_formations ON academy_formations(actif, ordre);
`;

// L'amorçage : la formation historique, telle qu'elle fonctionnait avant ce
// lot. Ces valeurs ne servent QUE si academy_config est muette — sinon on
// reprend les réglages réellement en place (cf. amorcer()).
const AMORCE = {
  cle: COACH_NUTRITION,
  libelle: 'Coach Nutrition',
  titreCertifie: 'Coach Nutrition certifié',
  ordre: 1,
  qcmNbQuestions: 5,
  qcmSeuilPct: 80,
  miniNbQuestions: 5,
  miniSeuilPct: 80,
};

function createAcademyFormations({ getDb, nowIso }) {
  const db = () => getDb();

  const basesMigrees = new WeakSet();
  function assurerSchema() {
    const d = db();
    if (basesMigrees.has(d)) return true;
    d.exec(SCHEMA_FORMATIONS);
    // Base existante : les deux réglages du mini-QCM se posent avec leur défaut.
    // Une formation déjà en service se retrouve donc avec un mini de 5 questions
    // à 80 % — ce qu'elle aurait eu si le mini avait existé dès l'origine.
    ajouterColonne(d, 'academy_formations', 'mini_nb_questions', 'INTEGER NOT NULL DEFAULT 5');
    ajouterColonne(d, 'academy_formations', 'mini_seuil_pct', 'INTEGER NOT NULL DEFAULT 80');
    // La description arrive après coup, donc NULLABLE et sans défaut : une
    // formation déjà en service n'en a pas, et n'a aucune raison d'en inventer.
    ajouterColonne(d, 'academy_formations', 'description', 'TEXT');
    // La catégorie arrive après coup. Nullable et SANS DÉFAUT : attribuer
    // d'office « essentiel » à quatre formations en service serait décider à la
    // place de celui qui les a écrites.
    ajouterColonne(d, 'academy_formations', 'categorie', 'TEXT');
    basesMigrees.add(d);
    amorcer();
    return true;
  }

  // Amorçage idempotent. LE POINT DÉLICAT EST LA REPRISE DES RÉGLAGES : une
  // base existante range son seuil et son nombre de questions dans
  // academy_config (là où le lot 2 les mettait). On les reprend au lieu de les
  // écraser — perdre un réglage à la migration est le genre de dégât qu'on ne
  // remarque qu'au premier QCM passé de travers.
  function amorcer() {
    const d = db();
    if (d.prepare('SELECT cle FROM academy_formations WHERE cle = ?').get(AMORCE.cle)) return 0;

    let nb = AMORCE.qcmNbQuestions;
    let seuil = AMORCE.qcmSeuilPct;
    try {
      const map = new Map(d.prepare('SELECT cle, valeur FROM academy_config').all().map((r) => [r.cle, r.valeur]));
      const entier = (v, defaut) => {
        const n = Number.parseInt(v, 10);
        return Number.isFinite(n) && n > 0 ? n : defaut;
      };
      nb = entier(map.get('qcm_nb_questions'), nb);
      seuil = entier(map.get('qcm_seuil_pct'), seuil);
    } catch (_) { /* base neuve : academy_config n'existe pas encore */ }

    const maintenant = nowIso();
    d.prepare(`INSERT INTO academy_formations
        (cle, libelle, titre_certifie, ordre, actif, qcm_nb_questions, qcm_seuil_pct,
         pratique_obligatoire, certification_active, reflet_boost, cree_le, maj_le)
        VALUES (?,?,?,?,1,?,?,1,1,1,?,?)`)
      .run(AMORCE.cle, AMORCE.libelle, AMORCE.titreCertifie, AMORCE.ordre, nb, seuil, maintenant, maintenant);
    return 1;
  }

  const vue = (r) => (r ? {
    cle: r.cle,
    libelle: r.libelle,
    description: r.description || null,
    categorie: r.categorie || null,
    titre: r.titre_certifie || null,
    ordre: r.ordre,
    actif: !!r.actif,
    qcmNbQuestions: r.qcm_nb_questions,
    qcmSeuilPct: r.qcm_seuil_pct,
    miniNbQuestions: r.mini_nb_questions,
    miniSeuilPct: r.mini_seuil_pct,
    pratiqueObligatoire: !!r.pratique_obligatoire,
    certificationActive: !!r.certification_active,
    refletBoost: !!r.reflet_boost,
  } : null);

  function lister({ toutes = false } = {}) {
    assurerSchema();
    return db().prepare(`SELECT * FROM academy_formations ${toutes ? '' : 'WHERE actif = 1'}
                         ORDER BY ordre ASC, cle ASC`).all().map(vue);
  }

  // LA fonction que tout le moteur appelle. Elle renvoie null pour une clé
  // inconnue : personne ne doit se rabattre silencieusement sur une autre
  // formation, ce serait mélanger deux parcours.
  function lire(cle) {
    assurerSchema();
    return vue(db().prepare('SELECT * FROM academy_formations WHERE cle = ?').get(String(cle || '').trim()));
  }

  // La formation par défaut : la première du catalogue. C'est elle qui rend ce
  // lot ADDITIF — les routes et les écrans fonctionnent sans paramètre tant
  // qu'il n'y a qu'une formation.
  function defaut() {
    const l = lister();
    return l.length ? l[0] : null;
  }

  // Résout une clé venue de l'extérieur. Absente -> formation par défaut.
  // Inconnue ou inactive -> null, et l'appelant répond 404.
  //
  //  `inclureInactives` EST LA SEULE PORTE VERS UN BROUILLON, et elle n'est
  //  ouverte que depuis les routes gardées par exigeAdmin (lot 6). Le défaut
  //  reste le refus : une formation en construction n'existe pas pour un
  //  collaborateur, et ce n'est pas à l'appelant de s'en souvenir.
  function resoudre(cle, { inclureInactives = false } = {}) {
    if (cle === undefined || cle === null || String(cle).trim() === '') {
      if (!inclureInactives) return defaut();
      // Côté administration, « aucune formation précisée » ne doit pas tomber
      // sur rien le jour où toutes les formations sont des brouillons.
      const d = defaut();
      if (d) return d;
      const toutes = lister({ toutes: true });
      return toutes.length ? toutes[0] : null;
    }
    const f = lire(cle);
    if (!f) return null;
    return (f.actif || inclureInactives) ? f : null;
  }

  // Créer ou modifier une formation. Prévu pour l'administration ; c'est aussi
  // ce qui permet d'en poser une seconde SANS TOUCHER AU CODE.
  function definir(donnees, auteur) {
    assurerSchema();
    const d = donnees || {};
    const cle = String(d.cle || '').trim().toLowerCase();
    if (!cleValide(cle)) {
      return err(400, 'Clé de formation invalide : minuscules, chiffres et « _ », de 3 à 40 caractères.');
    }
    const libelle = String(d.libelle || '').trim().slice(0, 120);
    if (!libelle) return err(400, 'Le libellé de la formation est requis.');

    const existante = lire(cle);
    // Facultative. Absente d'un corps de requête, elle NE S'EFFACE PAS : régler
    // un seuil ne doit pas emporter la présentation du parcours.
    const description = d.description === undefined
      ? (existante ? existante.description : null)
      : (String(d.description || '').trim().slice(0, 2000) || null);
    // MÊME RÈGLE QUE LA DESCRIPTION, et elle est le vrai piège de ce lot :
    // ABSENTE DU CORPS, LA CATÉGORIE NE S'EFFACE PAS. Le formulaire de réglages
    // n'envoie pas tous les champs ; sans cette garde, enregistrer un seuil
    // déclasserait la formation sans que personne ne l'ait demandé.
    let categorie;
    if (d.categorie === undefined) {
      categorie = existante ? existante.categorie : null;
    } else if (d.categorie === null || String(d.categorie).trim() === '') {
      categorie = null;                       // « — aucune — », un choix légitime
    } else {
      categorie = String(d.categorie).trim().toLowerCase();
      if (!categorieValide(categorie)) {
        return err(400, `Catégorie inconnue : « ${categorie} ». Attendu : ${CATEGORIES.join(', ')}.`);
      }
    }
    const entier = (v, defaut, min, max) => {
      if (v === undefined || v === null || v === '') return defaut;
      const n = Number(v);
      return Number.isInteger(n) && n >= min && n <= max ? n : null;
    };
    const nb = entier(d.qcmNbQuestions, existante ? existante.qcmNbQuestions : AMORCE.qcmNbQuestions, NB_MIN, NB_MAX);
    if (nb === null) return err(400, `Le nombre de questions doit être un entier entre ${NB_MIN} et ${NB_MAX}.`);
    const seuil = entier(d.qcmSeuilPct, existante ? existante.qcmSeuilPct : AMORCE.qcmSeuilPct, SEUIL_MIN, SEUIL_MAX);
    if (seuil === null) return err(400, `Le seuil de réussite doit être un entier entre ${SEUIL_MIN} et ${SEUIL_MAX}.`);
    const miniNb = entier(d.miniNbQuestions, existante ? existante.miniNbQuestions : AMORCE.miniNbQuestions, NB_MIN, NB_MAX);
    if (miniNb === null) return err(400, `Le nombre de questions du mini-QCM doit être un entier entre ${NB_MIN} et ${NB_MAX}.`);
    const miniSeuil = entier(d.miniSeuilPct, existante ? existante.miniSeuilPct : AMORCE.miniSeuilPct, SEUIL_MIN, SEUIL_MAX);
    if (miniSeuil === null) return err(400, `Le seuil du mini-QCM doit être un entier entre ${SEUIL_MIN} et ${SEUIL_MAX}.`);
    const ordre = entier(d.ordre, existante ? existante.ordre : lister({ toutes: true }).length + 1, 0, 9999);
    if (ordre === null) return err(400, 'Ordre invalide.');

    const drapeau = (v, defaut) => (v === undefined || v === null ? defaut : !!v);
    const certif = drapeau(d.certificationActive, existante ? existante.certificationActive : true);
    const titre = String(d.titre || (existante ? existante.titre : '') || '').trim().slice(0, 120);
    // Une formation qui certifie doit dire QUEL titre elle délivre : sans lui,
    // l'écran annoncerait « certifié » sans dire certifié de quoi.
    if (certif && !titre) return err(400, 'Une formation qui certifie doit porter un titre de certification.');

    const maintenant = nowIso();
    db().prepare(`INSERT INTO academy_formations
        (cle, libelle, description, categorie, titre_certifie, ordre, actif, qcm_nb_questions, qcm_seuil_pct,
         mini_nb_questions, mini_seuil_pct,
         pratique_obligatoire, certification_active, reflet_boost, cree_le, maj_le)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(cle) DO UPDATE SET libelle = excluded.libelle,
          description = excluded.description, categorie = excluded.categorie,
          titre_certifie = excluded.titre_certifie, ordre = excluded.ordre, actif = excluded.actif,
          qcm_nb_questions = excluded.qcm_nb_questions, qcm_seuil_pct = excluded.qcm_seuil_pct,
          mini_nb_questions = excluded.mini_nb_questions, mini_seuil_pct = excluded.mini_seuil_pct,
          pratique_obligatoire = excluded.pratique_obligatoire,
          certification_active = excluded.certification_active,
          reflet_boost = excluded.reflet_boost, maj_le = excluded.maj_le`)
      .run(cle, libelle, description, categorie, titre || null, ordre,
        drapeau(d.actif, existante ? existante.actif : true) ? 1 : 0,
        nb, seuil, miniNb, miniSeuil,
        drapeau(d.pratiqueObligatoire, existante ? existante.pratiqueObligatoire : true) ? 1 : 0,
        certif ? 1 : 0,
        // Le reflet Boost ne s'accorde JAMAIS depuis une saisie ordinaire : il
        // ouvre des dossiers clients. Il reste ce qu'il était, et vaut 0 pour
        // toute formation nouvelle.
        existante && existante.refletBoost ? 1 : 0,
        maintenant, maintenant);

    return ok({ formation: lire(cle) });
  }

  return { assurerSchema, amorcer, lister, lire, defaut, resoudre, definir };
}

// ---------------------------------------------------------------------------
//  Aide de migration partagée par les moteurs des lots 1 à 3.
//
//  Les tables existent déjà chez les déploiements en service : leur ajouter une
//  colonne demande un ALTER. On le fait de façon idempotente, en relisant le
//  schéma réel plutôt qu'en tenant un numéro de version — c'est la même méthode
//  que lib/boostSeances.js, et elle survit à une base rejouée.
// ---------------------------------------------------------------------------
function ajouterColonne(d, table, nom, definition) {
  const presentes = d.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (presentes.includes(nom)) return false;
  d.exec(`ALTER TABLE ${table} ADD COLUMN ${nom} ${definition}`);
  return true;
}

const aColonne = (d, table, nom) =>
  d.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === nom);

module.exports = {
  createAcademyFormations, ajouterColonne, aColonne,
  COACH_NUTRITION, AMORCE, cleValide,
  CATEGORIES, categorieValide,
};
