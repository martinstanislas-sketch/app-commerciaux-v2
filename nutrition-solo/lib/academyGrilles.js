'use strict';
// ============================================================================
//  MY COACH ACADEMY — LA GRILLE D'ÉVALUATION PRATIQUE.
//
//  CE QUE CE FICHIER APPORTE, ET CE QU'IL NE TOUCHE PAS.
//
//  Il apporte une STRUCTURE : trois axes, trois critères par axe, chaque
//  critère acquis ou non acquis, et le résultat de l'axe CALCULÉ — jamais
//  choisi. Rien de plus. Pas de note, pas de points, pas de niveau
//  intermédiaire : deux états, et un compte sur trois.
//
//  ⚠️ IL NE DÉCIDE PAS SI L'ÉVALUATION EST RÉUSSIE. Cette décision appartient
//  au certificateur, qui prononce « validée » ou « à repasser » — exactement
//  comme avant ce lot (cf. `enregistrerResultat` dans academyPratique.js). La
//  grille DÉCRIT ce qui est acquis ; elle ne conclut pas à sa place. Le jour où
//  une règle automatique sera décidée, elle s'écrira ici, et à un seul endroit.
//
//  ⚠️ LES CRITÈRES SONT PROPRES À CHAQUE FORMATION. Ceux de Fitness Boxe ne
//  sont pas universels : ils sont amorcés pour `fitness_boxe` et pour elle
//  seule. Une autre formation posera les siens, dans la même structure — c'est
//  la structure qui est réutilisable, pas le contenu.
//
//  ⚠️ UNE FORMATION SANS GRILLE RESTE ENTIÈRE. Zéro critère est un cas valide :
//  l'évaluateur retrouve alors exactement le formulaire d'avant. C'est ce qui
//  garde intactes les évaluations et les formations qui n'ont pas de grille.
//
//  LES LIBELLÉS SONT FIGÉS DANS L'ÉVALUATION, comme le titre d'un cas et comme
//  les questions d'une tentative de QCM : relire une évaluation de l'an dernier
//  ne doit pas dépendre d'un référentiel qui aura bougé depuis.
// ============================================================================

const { err, ok } = require('./boost');
const {
  COACH_NUTRITION,
  GRILLE_COACH_NUTRITION, MARQUEUR_GRILLE_NUTRITION,
  CAS_COACH_NUTRITION, MARQUEUR_CAS_NUTRITION,
} = require('./academyPratiqueCoachNutrition');

// LES TROIS RÉSULTATS D'AXE. Ils se DÉDUISENT du compte, et d'un seul endroit.
const MAITRISE = 'maitrise';
const A_RENFORCER = 'a_renforcer';
const NON_MAITRISE = 'non_maitrise';

const LIB_AXE = {
  [MAITRISE]: 'Maîtrisé',
  [A_RENFORCER]: 'À renforcer',
  [NON_MAITRISE]: 'Non maîtrisé',
};

// 3/3 maîtrisé, 2/3 à renforcer, 0 ou 1 non maîtrisé. La règle tient en une
// ligne, et c'est la SEULE qui décide d'un axe — l'écran la relit, il ne la
// recopie pas.
function statutAxe(acquis, total) {
  if (total > 0 && acquis === total) return MAITRISE;
  if (acquis >= total - 1 && acquis > 0) return A_RENFORCER;
  return NON_MAITRISE;
}

const SCHEMA_GRILLES = `
-- LE RÉFÉRENTIEL DES CRITÈRES, rattaché à UNE formation.
--
-- Calqué sur academy_cas : une colonne formation qui cloisonne, un axe et un
-- ordre qui rangent, un actif qui retire sans effacer, une cle stable pour
-- l'amorçage. Aucune ligne de moteur n'est propre à un parcours.
CREATE TABLE IF NOT EXISTS academy_criteres (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  formation  TEXT NOT NULL,
  -- L'AXE EST UN NUMÉRO ET UN TITRE. Le numéro range, le titre s'affiche : on
  -- ne déduit pas l'un de l'autre, et renommer un axe ne déplace rien.
  axe        INTEGER NOT NULL,
  axe_titre  TEXT NOT NULL,
  ordre      INTEGER NOT NULL DEFAULT 0,
  titre      TEXT NOT NULL,
  -- Ce que le certificateur observe, en une phrase. C'est le texte qu'il lit
  -- pendant la mise en situation : il est aussi important que le titre.
  enonce     TEXT,
  actif      INTEGER NOT NULL DEFAULT 1,
  cle        TEXT UNIQUE,
  cree_le    TEXT NOT NULL,
  maj_le     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_academy_criteres ON academy_criteres(formation, axe, ordre);

-- LE RELEVÉ D'UNE ÉVALUATION : une ligne par critère renseigné.
--
-- Tout est RECOPIÉ — l'axe, son titre, le titre du critère, sa place. Modifier
-- le référentiel, en retirer un critère, en corriger la formulation : rien de
-- tout cela ne doit réécrire une évaluation déjà prononcée.
--
-- La colonne critere_id dit d'où venait la ligne, SANS clé étrangère dure :
-- retirer un critère du référentiel ne doit ni effacer ni invalider les
-- relevés qui s'en sont servis.
CREATE TABLE IF NOT EXISTS academy_evaluation_criteres (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  evaluation_id INTEGER NOT NULL REFERENCES academy_evaluations(id) ON DELETE CASCADE,
  critere_id    INTEGER,
  axe           INTEGER NOT NULL,
  axe_titre     TEXT NOT NULL,
  ordre         INTEGER NOT NULL DEFAULT 0,
  titre         TEXT NOT NULL,
  -- 1 = acquis, 0 = non acquis. DEUX ÉTATS, et pas un de plus : un « à peu
  -- près » se noterait ici le jour où la colonne accepterait un troisième.
  acquis        INTEGER NOT NULL,
  cree_le       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_academy_eval_criteres ON academy_evaluation_criteres(evaluation_id, axe, ordre);
`;

// ---------------------------------------------------------------------------
//  LA GRILLE FITNESS BOXE — une DONNÉE, pas une règle.
//
//  Neuf critères, trois par axe, tels qu'ils ont été rédigés. Aucun texte n'est
//  reformulé, ni ici ni à l'écriture en base. Ils valent pour les six cas
//  pratiques de la formation : le cas change, la grille reste.
// ---------------------------------------------------------------------------
const FITNESS_BOXE = 'fitness_boxe';
const MARQUEUR_BOXE = 'grille_fitness_boxe_v1';

const GRILLE_FITNESS_BOXE = [
  {
    axe: 1,
    titre: 'Technique & pédagogie',
    criteres: [
      { cle: 'fb-c1', titre: 'Démonstration',
        enonce: 'Démontre correctement les mouvements et techniques proposés.' },
      { cle: 'fb-c2', titre: 'Consignes',
        enonce: 'Donne des consignes simples, précises et compréhensibles.' },
      { cle: 'fb-c3', titre: 'Observation & correction',
        enonce: 'Observe l’exécution, identifie les erreurs importantes et les corrige de manière adaptée.' },
    ],
  },
  {
    axe: 2,
    titre: 'Adaptation & coaching',
    criteres: [
      { cle: 'fb-c4', titre: 'Prise en compte du pratiquant',
        enonce: 'Tient compte du niveau, de l’objectif et des capacités du pratiquant.' },
      { cle: 'fb-c5', titre: 'Ajustement',
        enonce: 'Adapte l’exercice, le rythme ou la difficulté en fonction de ce qu’il observe.' },
      { cle: 'fb-c6', titre: 'Progression',
        enonce: 'Construit une progression cohérente permettant au pratiquant de réussir puis d’évoluer.' },
    ],
  },
  {
    axe: 3,
    titre: 'Sécurité & maîtrise',
    criteres: [
      { cle: 'fb-c7', titre: 'Matériel & placements',
        enonce: 'Utilise correctement le matériel et maîtrise les placements et les distances.' },
      { cle: 'fb-c8', titre: 'Dosage',
        enonce: 'Adapte l’intensité et la difficulté au niveau et à la situation.' },
      { cle: 'fb-c9', titre: 'Gestion des situations à risque',
        enonce: 'Identifie une situation à risque et intervient de manière appropriée.' },
    ],
  },
];


// ---------------------------------------------------------------------------
//  LES SIX MISES EN SITUATION FITNESS BOXE.
//
//  Elles remplacent un pavé de 250 mots — identique pour les six cas — par ce
//  que le certificateur a réellement besoin de savoir : ce qu'il LIT, le RÔLE
//  qu'il joue, les TROIS comportements qu'il provoque, dans l'ordre.
//
//  RÈGLE DE RÉDACTION, ET ELLE EST LA RAISON D'ÊTRE DE CE BLOC : si le
//  certificateur doit se demander COMMENT jouer un comportement, le scénario
//  est trop compliqué. Aucune compétence technique, aucune pathologie, aucune
//  blessure simulée, aucun danger réel.
//
//  CHAQUE CAS PORTE SON POINT DE VIGILANCE — garde basse, gant desserré, tête
//  détournée, déséquilibre, distance aux paos, puissance non contrôlée. C'est
//  lui qui rend le neuvième critère observable ; sans lui, le certificateur
//  devrait inventer une situation à risque, ou cocher au hasard.
//
//  ⚠️ LE RATTACHEMENT SE FAIT PAR `ordre`, AVEC LE TITRE EN GARDE-FOU. Les six
//  cas existent déjà en base, sans clé stable : on ne les recrée pas, on écrit
//  leur scénario. Se tromper de cas donnerait au certificateur le rôle d'un
//  autre client — et l'erreur ne se verrait qu'en séance.
// ---------------------------------------------------------------------------
const MARQUEUR_SCENARIOS = 'scenarios_fitness_boxe_v1';

const SCENARIOS_FITNESS_BOXE = [
  {
    ordre: 1,
    titre: 'Client débutant — se dépenser et améliorer son cardio',
    lire: 'Tu prends en charge un client débutant en Fitness Boxe. Il n\u2019a jamais pratiqué. '
      + 'Son objectif : se dépenser et améliorer son cardio. Fais-moi vivre une courte séquence adaptée.',
    role: 'Tu joues le client débutant : tu fais ce qu\u2019il te demande, sans rien anticiper.',
    jouer: [
      'Suis normalement ses consignes.',
      'Laisse retomber ta garde après chaque frappe.',
      'Souffle et ralentis : le rythme devient trop fort pour toi.',
    ],
    evalue: 'correction · ajustement · dosage',
  },
  {
    ordre: 2,
    titre: 'Client débutant — se détendre après une journée chargée',
    lire: 'Ton client arrive après une journée chargée. Il veut bouger, se dépenser et penser à autre chose. '
      + 'Fais-moi vivre une courte séquence adaptée.',
    role: 'Tu joues le client fatigué, volontaire mais la tête ailleurs.',
    jouer: [
      'Écoute à moitié, demande-lui de répéter la consigne.',
      'Dans une combinaison en deux temps, frappe deux fois du même bras.',
      'Desserre un gant pour souffler, et repars comme ça.',
    ],
    evalue: 'consignes · prise en compte · matériel et gestion du risque',
  },
  {
    ordre: 3,
    titre: 'Cliente débutante — gagner en confiance',
    lire: 'Ta cliente n\u2019est pas sûre d\u2019y arriver. Elle souhaite reprendre confiance dans ses capacités. '
      + 'Fais-moi vivre une courte séquence adaptée.',
    role: 'Tu joues la cliente hésitante, qui doute d\u2019elle à voix haute.',
    jouer: [
      'Frappe timidement, dis « je ne sais pas si je fais bien ».',
      'Détourne la tête et ferme les yeux au moment de frapper.',
      'Arrête-toi après un enchaînement raté : « c\u2019est trop compliqué pour moi ».',
    ],
    evalue: 'correction · progression · gestion du risque',
  },
  {
    ordre: 4,
    titre: 'Client débutant — améliorer sa coordination',
    lire: 'Ton client a du mal à coordonner ses appuis, ses déplacements et ses mouvements. '
      + 'Fais-moi vivre une courte séquence adaptée.',
    role: 'Tu joues le client maladroit, appliqué mais désordonné.',
    jouer: [
      'Avance le mauvais pied, croise tes appuis.',
      'Inverse l\u2019ordre de la combinaison qu\u2019il vient de montrer.',
      'Perds l\u2019équilibre en avançant, sans tomber.',
    ],
    evalue: 'démonstration · ajustement · placements',
  },
  {
    ordre: 5,
    titre: 'Client régulier — retrouver du plaisir et de la variété',
    lire: 'Ton client trouve ses séances répétitives. Il veut quelque chose de plus dynamique et engageant. '
      + 'Fais-moi vivre une courte séquence adaptée.',
    role: 'Tu joues le client à l\u2019aise, qui s\u2019ennuie vite.',
    jouer: [
      'Exécute correctement, puis dis que c\u2019est trop facile.',
      'Pendant le travail aux paos, avance et rapproche-toi trop de lui.',
      'Demande-lui « on fait quoi après ? » au milieu de l\u2019exercice.',
    ],
    evalue: 'ajustement · progression · distances et dosage',
  },
  {
    ordre: 6,
    titre: 'Client à l\u2019aise — se dépasser sans perdre le contrôle',
    lire: 'Ton client maîtrise déjà un travail simple et veut être davantage challengé, '
      + 'sans sortir du cadre fitness box My Coach. Fais-moi vivre une courte séquence adaptée.',
    role: 'Tu joues le client sûr de lui, qui pousse le curseur.',
    jouer: [
      'Exécute bien, et demande à aller plus vite.',
      'Frappe de plus en plus fort, en perdant la précision.',
      'Enchaîne sans t\u2019arrêter quand il annonce la fin de la série.',
    ],
    evalue: 'ajustement · progression · dosage et gestion du risque',
  },
];

function createAcademyGrilles({ getDb, nowIso }) {
  const db = () => getDb();

  const basesMigrees = new WeakSet();
  function assurerSchema() {
    const d = db();
    if (basesMigrees.has(d)) { amorcer(); return true; }
    d.exec(SCHEMA_GRILLES);
    basesMigrees.add(d);
    amorcer();
    return true;
  }

  //  LES DEUX AMORÇAGES SE REJOUENT TANT QU'ILS N'ONT PAS ABOUTI, et c'est
  //  nécessaire : ils dépendent de données posées AILLEURS — academy_config
  //  pour leur marqueur, les six cas pour les scénarios — qui peuvent arriver
  //  après le premier appel. Un amorçage tenté une seule fois, au tout premier
  //  accès, échouerait alors en silence jusqu'au prochain redémarrage.
  //
  //  Le coût est un SELECT indexé par appel, et il disparaît dès que le
  //  marqueur est posé : chacun sort sur sa première ligne.
  function amorcer() {
    amorcerFitnessBoxe();
    amorcerScenariosFitnessBoxe();
    // Nutrition Certifié passe par les DEUX FONCTIONS GÉNÉRIQUES ci-dessous.
    // Les quatre formations qui suivront poseront leurs données de la même
    // façon : une constante, deux appels, aucune ligne de moteur en plus.
    amorcerGrille(COACH_NUTRITION, GRILLE_COACH_NUTRITION, MARQUEUR_GRILLE_NUTRITION);
    amorcerCas(COACH_NUTRITION, CAS_COACH_NUTRITION, MARQUEUR_CAS_NUTRITION);
  }

  // Le marqueur, lu et posé au même endroit pour les deux amorçages. Il porte
  // sa VERSION dans son nom (`…_v1`) : corriger un libellé se fait en changeant
  // le texte ET en bumpant la version, ce qui rejoue la mise à jour une fois.
  const dejaAmorce = (marqueur) => {
    try { return !!db().prepare('SELECT cle FROM academy_config WHERE cle = ?').get(marqueur); }
    catch (_) { return true; }   // academy_config pas encore posée : on repassera
  };
  const poserMarqueur = (marqueur, valeur, maintenant) =>
    db().prepare('INSERT INTO academy_config (cle, valeur, maj_le) VALUES (?,?,?) ON CONFLICT(cle) DO NOTHING')
      .run(marqueur, String(valeur), maintenant);

  // ==========================================================================
  //  AMORCER UNE GRILLE — pour n'importe quelle formation.
  //
  //  Repéré par `cle` : un critère déjà posé est MIS À JOUR, jamais dupliqué.
  //  Rien n'est supprimé — un critère retiré du code reste en base, actif, et
  //  les relevés qui le citent restent lisibles.
  // ==========================================================================
  function amorcerGrille(formation, grille, marqueur) {
    if (dejaAmorce(marqueur)) return 0;
    const d = db();
    const maintenant = nowIso();
    const existe = d.prepare('SELECT id FROM academy_criteres WHERE cle = ?');
    const ins = d.prepare(`INSERT INTO academy_criteres
        (formation, axe, axe_titre, ordre, titre, enonce, actif, cle, cree_le, maj_le)
        VALUES (?,?,?,?,?,?,1,?,?,?)`);
    const maj = d.prepare(`UPDATE academy_criteres SET formation = ?, axe = ?, axe_titre = ?,
        ordre = ?, titre = ?, enonce = ?, maj_le = ? WHERE id = ?`);
    let ecrits = 0;
    d.transaction(() => {
      for (const bloc of grille) {
        bloc.criteres.forEach((c, i) => {
          const ligne = existe.get(c.cle);
          if (ligne) maj.run(formation, bloc.axe, bloc.titre, i + 1, c.titre, c.enonce, maintenant, ligne.id);
          else ins.run(formation, bloc.axe, bloc.titre, i + 1, c.titre, c.enonce, c.cle, maintenant, maintenant);
          ecrits++;
        });
      }
      poserMarqueur(marqueur, ecrits, maintenant);
    })();
    return ecrits;
  }

  // ==========================================================================
  //  AMORCER DES CAS — pour n'importe quelle formation.
  //
  //  ⚠️ CETTE FONCTION CRÉE DES CAS, contrairement à `amorcerScenariosFitnessBoxe`
  //  qui n'écrivait que le scénario de six cas déjà en base. Les deux gestes
  //  coexistent parce que les deux situations existent : une formation qui a
  //  déjà ses cas, une formation qui n'en a aucun.
  //
  //  Repéré par `cle`, comme la grille : rejouer n'ajoute rien, et un cas déjà
  //  posé voit son scénario mis à jour sans changer d'identifiant — les
  //  évaluations déjà prononcées le citent par `cas_id`.
  //
  //  `consignes` n'est JAMAIS touchée : le pavé d'une autre formation reste
  //  intact, et un cas neuf n'en reçoit pas — son scénario le remplace.
  // ==========================================================================
  //  `academy_cas` et sa colonne `scenario` appartiennent à academyPratique.
  //  Elles sont normalement posées avant nous (cf. l'ordre des assurerSchema
  //  dans academyRoutes), mais un appel direct depuis un test peut inverser
  //  l'ordre. On VÉRIFIE plutôt que de supposer : sans la colonne, on ne pose
  //  pas le marqueur, et l'amorçage se rejoue au prochain appel.
  const colonneExiste = (table, colonne) => {
    try { return db().prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === colonne); }
    catch (_) { return false; }
  };

  function amorcerCas(formation, cas, marqueur) {
    if (dejaAmorce(marqueur)) return 0;
    if (!colonneExiste('academy_cas', 'scenario')) return 0;
    const d = db();
    const maintenant = nowIso();
    const existe = d.prepare('SELECT id FROM academy_cas WHERE cle = ?');
    const ins = d.prepare(`INSERT INTO academy_cas
        (formation, titre, consignes, ordre, actif, cle, scenario, cree_le, maj_le)
        VALUES (?,?,NULL,?,1,?,?,?,?)`);
    const maj = d.prepare('UPDATE academy_cas SET titre = ?, ordre = ?, scenario = ?, maj_le = ? WHERE id = ?');
    let ecrits = 0;
    d.transaction(() => {
      for (const c of cas) {
        const json = JSON.stringify({ v: 1, ...c.scenario });
        const ligne = existe.get(c.cle);
        if (ligne) maj.run(c.titre, c.ordre, json, maintenant, ligne.id);
        else ins.run(formation, c.titre, c.ordre, c.cle, json, maintenant, maintenant);
        ecrits++;
      }
      poserMarqueur(marqueur, ecrits, maintenant);
    })();
    return ecrits;
  }

  // Les titres en base emploient l'apostrophe typographique ou l'ASCII selon
  // qui les a saisis : on compare des titres NORMALISÉS, sinon le garde-fou
  // refuserait un cas parfaitement correct.
  const memeTitre = (a, b) => String(a || '').replace(/[\u2019\u2018]/g, "'").trim().toLowerCase().replace(/\s+/g, ' ')
    === String(b || '').replace(/[\u2019\u2018]/g, "'").trim().toLowerCase().replace(/\s+/g, ' ');

  //  ON N'AJOUTE ET ON NE SUPPRIME AUCUN CAS : on écrit le scénario des six qui
  //  existent, retrouvés par leur `ordre` et vérifiés par leur titre. Leurs
  //  identifiants ne bougent pas — les évaluations déjà enregistrées les citent.
  //
  //  `consignes` EST CONSERVÉE TELLE QUELLE. Le pavé d'origine reste en base :
  //  s'il faut un jour revenir en arrière, rien n'a été perdu.
  function amorcerScenariosFitnessBoxe() {
    const d = db();
    try {
      if (d.prepare('SELECT cle FROM academy_config WHERE cle = ?').get(MARQUEUR_SCENARIOS)) return 0;
    } catch (_) { return 0; }

    const lire = d.prepare(`SELECT id, titre FROM academy_cas
                            WHERE formation = ? AND ordre = ? AND actif = 1 ORDER BY id ASC LIMIT 1`);
    // Résolution AVANT toute écriture : un seul cas introuvable, et on ne
    // touche à rien — écrire la moitié des scénarios serait pire que rien.
    const cibles = [];
    for (const sc of SCENARIOS_FITNESS_BOXE) {
      const c = lire.get(FITNESS_BOXE, sc.ordre);
      if (!c || !memeTitre(c.titre, sc.titre)) return 0;
      cibles.push({ sc, id: c.id });
    }

    const maintenant = nowIso();
    let ecrits = 0;
    d.transaction(() => {
      const maj = d.prepare(`UPDATE academy_cas SET lire = ?, role = ?, jouer = ?, evalue = ?, maj_le = ?
                             WHERE id = ?`);
      for (const { sc, id } of cibles) {
        maj.run(sc.lire, sc.role, JSON.stringify(sc.jouer), sc.evalue, maintenant, id);
        ecrits++;
      }
      d.prepare('INSERT INTO academy_config (cle, valeur, maj_le) VALUES (?,?,?) ON CONFLICT(cle) DO NOTHING')
        .run(MARQUEUR_SCENARIOS, String(ecrits), maintenant);
    })();
    return ecrits;
  }

  // Amorçage idempotent, repéré par un marqueur comme les banques de questions :
  // redémarrer ne duplique rien, et un critère reformulé depuis l'administration
  // n'est jamais réécrasé.
  function amorcerFitnessBoxe() {
    const d = db();
    try {
      if (d.prepare('SELECT cle FROM academy_config WHERE cle = ?').get(MARQUEUR_BOXE)) return 0;
    } catch (_) { return 0; }   // academy_config pas encore posée : on repassera

    const maintenant = nowIso();
    const existe = d.prepare('SELECT id FROM academy_criteres WHERE cle = ?');
    const ins = d.prepare(`INSERT INTO academy_criteres
        (formation, axe, axe_titre, ordre, titre, enonce, actif, cle, cree_le, maj_le)
        VALUES (?,?,?,?,?,?,1,?,?,?)`);
    let ajouts = 0;
    d.transaction(() => {
      for (const bloc of GRILLE_FITNESS_BOXE) {
        bloc.criteres.forEach((c, i) => {
          if (existe.get(c.cle)) return;
          ins.run(FITNESS_BOXE, bloc.axe, bloc.titre, i + 1, c.titre, c.enonce, c.cle, maintenant, maintenant);
          ajouts++;
        });
      }
      d.prepare('INSERT INTO academy_config (cle, valeur, maj_le) VALUES (?,?,?) ON CONFLICT(cle) DO NOTHING')
        .run(MARQUEUR_BOXE, String(ajouts), maintenant);
    })();
    return ajouts;
  }

  // -- Le référentiel --------------------------------------------------------

  const ligneCritere = (r) => ({
    id: r.id, cle: r.cle, axe: r.axe, axeTitre: r.axe_titre,
    ordre: r.ordre, titre: r.titre, enonce: r.enonce || '',
  });

  // Les critères d'une formation, à plat. Vide = pas de grille, et c'est un cas
  // valide : l'écran retombe alors sur le formulaire libre.
  function criteresDe(formationCle) {
    assurerSchema();
    return db().prepare(`SELECT * FROM academy_criteres WHERE formation = ? AND actif = 1
                         ORDER BY axe ASC, ordre ASC, id ASC`)
      .all(String(formationCle || '')).map(ligneCritere);
  }

  // La MÊME liste, groupée par axe : c'est la forme que l'écran affiche, et
  // celle que la validation parcourt. Un seul regroupement, pas deux.
  function grillePour(formationCle) {
    const par = new Map();
    for (const c of criteresDe(formationCle)) {
      if (!par.has(c.axe)) par.set(c.axe, { axe: c.axe, axeTitre: c.axeTitre, criteres: [] });
      par.get(c.axe).criteres.push(c);
    }
    return [...par.values()];
  }

  const aUneGrille = (formationCle) => criteresDe(formationCle).length > 0;

  // -- Le relevé d'une évaluation -------------------------------------------

  const ligneRelevee = (r) => ({
    critereId: r.critere_id, axe: r.axe, axeTitre: r.axe_titre,
    ordre: r.ordre, titre: r.titre, acquis: !!r.acquis,
  });

  function releveDe(evaluationId) {
    assurerSchema();
    return db().prepare(`SELECT * FROM academy_evaluation_criteres WHERE evaluation_id = ?
                         ORDER BY axe ASC, ordre ASC, id ASC`)
      .all(Number(evaluationId)).map(ligneRelevee);
  }

  // LE RÉSULTAT DES AXES, calculé depuis le relevé et de nulle part ailleurs.
  // Il n'est jamais stocké : un résultat stocké finit par mentir le jour où une
  // ligne du relevé change.
  function axesDe(lignes) {
    const par = new Map();
    for (const l of lignes || []) {
      if (!par.has(l.axe)) par.set(l.axe, { axe: l.axe, axeTitre: l.axeTitre, acquis: 0, total: 0 });
      const a = par.get(l.axe);
      a.total++;
      if (l.acquis) a.acquis++;
    }
    return [...par.values()].map((a) => ({
      ...a,
      statut: statutAxe(a.acquis, a.total),
      libelle: LIB_AXE[statutAxe(a.acquis, a.total)],
    }));
  }

  // Le relevé ET ses axes, la forme que servent les routes.
  function pour(evaluationId) {
    const lignes = releveDe(evaluationId);
    return lignes.length ? { criteres: lignes, axes: axesDe(lignes) } : null;
  }

  // -- L'écriture ------------------------------------------------------------

  //  LA VALIDATION D'UNE SAISIE. Trois refus, et chacun protège une promesse :
  //
  //   · la grille se remplit ENTIÈREMENT ou pas du tout. Un axe à 2 critères
  //     renseignés donnerait « 2/2 maîtrisé » — un résultat faux qui a l'air
  //     juste ;
  //   · un critère ne vaut que `true` ou `false`. Rien d'autre n'entre ;
  //   · un critère inconnu de CETTE formation est refusé, jamais ignoré :
  //     l'ignorer enregistrerait une grille incomplète sans le dire.
  function verifierSaisie(formationCle, saisie) {
    const attendus = criteresDe(formationCle);
    if (!attendus.length) return { grille: false, lignes: [] };

    const recus = Array.isArray(saisie) ? saisie : [];
    const parId = new Map(attendus.map((c) => [c.id, c]));
    const parCle = new Map(attendus.map((c) => [c.cle, c]));
    const vus = new Map();

    for (const r of recus) {
      const brut = r && (r.id !== undefined && r.id !== null && r.id !== '' ? r.id : r.cle);
      const c = parId.get(Number(brut)) || parCle.get(String(brut));
      if (!c) {
        return { erreur: err(400, 'Critère inconnu pour cette formation.', { critereInconnu: true }) };
      }
      if (r.acquis !== true && r.acquis !== false) {
        return { erreur: err(400, `Le critère « ${c.titre} » doit être acquis ou non acquis.`) };
      }
      vus.set(c.id, { critere: c, acquis: r.acquis });
    }

    const manquants = attendus.filter((c) => !vus.has(c.id));
    if (manquants.length) {
      return {
        erreur: err(400,
          `La grille doit être complète : ${manquants.length} critère${manquants.length > 1 ? 's' : ''} ` +
          `sans réponse (${manquants.map((c) => c.titre).join(', ')}).`,
          { grilleIncomplete: true, manquants: manquants.map((c) => c.cle) }),
      };
    }

    const lignes = attendus.map((c) => ({ critere: c, acquis: vus.get(c.id).acquis }));
    return { grille: true, lignes, tousAcquis: lignes.every((l) => l.acquis) };
  }

  // Écrire le relevé. Appelé DANS la transaction du verdict : une évaluation
  // prononcée sans sa grille, ou l'inverse, serait un dossier à moitié écrit.
  function enregistrer(evaluationId, lignes) {
    const d = db();
    const maintenant = nowIso();
    // Une évaluation ne se prononce qu'une fois (cf. academyPratique), mais on
    // repart d'un relevé propre : deux écritures ne doivent pas s'additionner.
    d.prepare('DELETE FROM academy_evaluation_criteres WHERE evaluation_id = ?').run(Number(evaluationId));
    const ins = d.prepare(`INSERT INTO academy_evaluation_criteres
        (evaluation_id, critere_id, axe, axe_titre, ordre, titre, acquis, cree_le)
        VALUES (?,?,?,?,?,?,?,?)`);
    for (const l of lignes) {
      ins.run(Number(evaluationId), l.critere.id, l.critere.axe, l.critere.axeTitre,
        l.critere.ordre, l.critere.titre, l.acquis ? 1 : 0, maintenant);
    }
    return lignes.length;
  }

  return {
    assurerSchema, amorcer, amorcerFitnessBoxe, amorcerScenariosFitnessBoxe,
    amorcerGrille, amorcerCas,
    criteresDe, grillePour, aUneGrille,
    releveDe, axesDe, pour,
    verifierSaisie, enregistrer,
  };
}

module.exports = {
  createAcademyGrilles,
  statutAxe, LIB_AXE,
  MAITRISE, A_RENFORCER, NON_MAITRISE,
  GRILLE_FITNESS_BOXE, MARQUEUR_BOXE, FITNESS_BOXE,
  GRILLE_COACH_NUTRITION, MARQUEUR_GRILLE_NUTRITION,
  CAS_COACH_NUTRITION, MARQUEUR_CAS_NUTRITION, COACH_NUTRITION,
  SCENARIOS_FITNESS_BOXE, MARQUEUR_SCENARIOS,
};
