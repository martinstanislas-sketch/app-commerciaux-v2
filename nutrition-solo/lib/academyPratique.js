'use strict';
// ============================================================================
//  MY COACH ACADEMY — évaluation pratique (lot 3).
//
//  L'ÉTAPE QUI N'EST PAS AUTOMATISÉE. Le QCM du lot 2 mesure ce qu'un serveur
//  sait mesurer : des réponses. Savoir conduire un rendez-vous ne se mesure pas
//  comme ça. Cette étape enregistre donc UNE DÉCISION HUMAINE, et rien d'autre.
//
//  QUATRE PARTIS PRIS :
//
//   1. LA THÉORIE NE SE RECALCULE PAS ICI. « La théorie est-elle validée ? » a
//      une seule réponse dans l'application, et elle vit dans le lot 2
//      (academyQcm.etatPour). La relire est gratuit ; la redémontrer serait un
//      second système qui, un jour, dirait autre chose.
//
//   2. ON N'ÉCRASE JAMAIS UNE ÉVALUATION. Une tentative close est immuable,
//      exactement comme une tentative de QCM rendue. Repasser l'évaluation crée
//      une LIGNE DE PLUS. L'historique n'est pas une fonctionnalité de confort :
//      c'est ce qui permet de répondre, un an après, de l'habilitation d'un
//      coach.
//
//   3. PERSONNE NE S'AUTO-VALIDE. Un évaluateur ne peut pas s'évaluer lui-même,
//      et un collaborateur ordinaire n'atteint aucune route d'écriture. C'est la
//      seule chose qui donne du poids au résultat.
//
//   4. VALIDER LA PRATIQUE NE CERTIFIE PAS. On inscrit le résultat dans la
//      colonne prévue pour lui (boost_certifications.resultat_pratique) et on
//      NE TOUCHE PAS au statut. Devenir Coach Nutrition certifié est un geste
//      distinct, qui viendra dans son propre lot.
//
//  Ce que ce module NE fait pas : la certification finale, l'administration de
//  l'Academy, et les cas pratiques. Ce dernier point est un choix : l'évaluation
//  doit fonctionner en V1 même si l'évaluateur travaille avec ses propres
//  supports. Une simple étiquette libre (`cas`) note lequel a servi ; une table
//  de cas se construira le jour où on en aura vraiment.
// ============================================================================

const { err, ok, jourValide, aujourdhui } = require('./boost');
const { ajouterColonne } = require('./academyFormations');

// Une seule formation aujourd'hui. La colonne existe pour que l'arrivée d'une
// seconde ne demande pas de migration — pas pour être configurable maintenant.
const FORMATION = 'coach_nutrition';

// V1 volontairement binaire : l'évaluateur considère-t-il que le collaborateur
// maîtrise assez la pratique pour poursuivre ? Les deux valeurs appartiennent
// déjà à la liste du Boost (PRATIQUE_RESULTATS) : aucune nouvelle convention.
const RES_VALIDE = 'valide';
const RES_A_REPASSER = 'a_repasser';
const RESULTATS = [RES_VALIDE, RES_A_REPASSER];

// Les cinq états que l'écran doit pouvoir présenter. CALCULÉS à chaque lecture,
// jamais stockés : un état stocké finit par mentir le jour où la théorie bouge.
const ETAT_NON_ACCESSIBLE = 'non_accessible';
const ETAT_A_REALISER = 'a_realiser';
const ETAT_EN_ATTENTE = 'en_attente';
const ETAT_VALIDEE = 'validee';
const ETAT_A_REPASSER = 'a_repasser';

const SCHEMA_PRATIQUE = `
-- Qui a le droit d'évaluer. Table DÉDIÉE et minimale, calquée sur
-- boost_collaborateurs : aucun second système d'authentification, aucune
-- colonne ajoutée ailleurs. On pose actif = 0 plutôt que de supprimer la ligne,
-- pour garder la date et l'auteur du retrait.
--
-- LA DÉSIGNATION EST TOUJOURS EXPLICITE, administrateur compris. Administrer
-- l'Academy et faire passer une évaluation pratique sont deux métiers : que
-- l'un entraîne l'autre ferait de chaque administrateur un évaluateur sans que
-- personne ne l'ait décidé. Pas d'amorçage impossible pour autant : désigner
-- un évaluateur relève du droit d'ADMIN, pas du droit d'évaluer.
CREATE TABLE IF NOT EXISTS academy_evaluateurs (
  email   TEXT PRIMARY KEY REFERENCES users(email) ON DELETE CASCADE,
  actif   INTEGER NOT NULL DEFAULT 1,
  cree_le TEXT NOT NULL,
  maj_le  TEXT NOT NULL,
  maj_par TEXT
);

-- Une ligne = UNE TENTATIVE d'évaluation pratique. Jamais mise à jour une fois
-- close : repasser l'évaluation ajoute une ligne. C'est ce qui rend impossible
-- d'écraser silencieusement une décision passée.
--
-- resultat NULL = séance ouverte, verdict pas encore saisi (« résultat en
-- attente »). C'est un état réel : l'évaluation a lieu, la saisie suit.
CREATE TABLE IF NOT EXISTS academy_evaluations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  formation       TEXT NOT NULL DEFAULT '${FORMATION}',
  -- Le TITRE du cas, RECOPIÉ à la saisie. Il reste une étiquette libre : un
  -- évaluateur peut travailler avec ses propres supports, et une formation
  -- peut n'avoir aucun référentiel. Quand un cas du référentiel est choisi,
  -- son titre est copié ici — comme un diplôme recopie ses preuves : relire
  -- une évaluation de l'an dernier ne doit pas dépendre d'un référentiel qui
  -- aura bougé depuis.
  cas             TEXT,
  -- D'OÙ VENAIT L'ÉTIQUETTE, quand elle vient du référentiel. Volontairement
  -- SANS clé étrangère dure : retirer un cas du référentiel ne doit pas
  -- emporter ni invalider les évaluations qui s'en sont servies.
  cas_id          INTEGER,
  ouvert_par      TEXT,
  ouverte_le      TEXT NOT NULL,
  -- Le JOUR de la séance (AAAA-MM-JJ), qui n'est pas forcément celui de la
  -- saisie : un évaluateur note souvent son verdict le lendemain.
  date_evaluation TEXT,
  evaluateur      TEXT,          -- qui a PRONONCÉ le résultat
  resultat        TEXT,          -- NULL | valide | a_repasser
  commentaire     TEXT,
  decide_le       TEXT,          -- date de saisie du verdict
  maj_le          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_academy_evaluations ON academy_evaluations(email, id);

-- LE RÉFÉRENTIEL DES CAS PRATIQUES, rattaché à UNE FORMATION.
--
-- Calqué sur academy_modules : une colonne formation qui cloisonne, un ordre
-- qui range, un actif qui retire sans effacer, une cle stable pour l'amorçage.
-- Aucune ligne de moteur n'est propre à un parcours : une formation nouvelle
-- pose ses cas comme elle pose ses modules, par ses seules données.
--
-- ZÉRO CAS EST UN CAS VALIDE, et c'est ce qui garde Coach Nutrition intacte :
-- sans référentiel, l'évaluateur retrouve exactement le champ libre d'avant.
CREATE TABLE IF NOT EXISTS academy_cas (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  formation TEXT NOT NULL,
  titre     TEXT NOT NULL,
  -- Ce que l'évaluateur doit mettre en œuvre. Facultatif : un intitulé suffit
  -- à désigner une situation, et personne ne doit inventer des consignes pour
  -- remplir une colonne.
  consignes TEXT,
  ordre     INTEGER NOT NULL DEFAULT 0,
  actif     INTEGER NOT NULL DEFAULT 1,
  cle       TEXT UNIQUE,
  cree_le   TEXT NOT NULL,
  maj_le    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_academy_cas ON academy_cas(formation, ordre);
`;

function createAcademyPratique({ getDb, nowIso, boost, qcm, formations }) {
  const db = () => getDb();
  const normalise = (e) => String(e || '').trim().toLowerCase();

  // La formation visée. Absente -> celle du catalogue par défaut.
  const cleFormation = (f) => (f ? (typeof f === 'string' ? f : f.cle)
    : ((formations.defaut() || {}).cle || FORMATION));

  const basesMigrees = new WeakSet();
  function assurerSchema() {
    const d = db();
    if (basesMigrees.has(d)) return true;
    // Les tables du lot 3 s'appuient sur les comptes et sur le QCM : les socles
    // précédents doivent exister d'abord (clés étrangères actives).
    qcm.assurerSchema();
    d.exec(SCHEMA_PRATIQUE);
    // Les évaluations posées avant le référentiel n'ont pas cette colonne :
    // elles gardent leur étiquette libre, et `cas_id` reste NULL chez elles.
    ajouterColonne(d, 'academy_evaluations', 'cas_id', 'INTEGER');
    basesMigrees.add(d);
    return true;
  }

  // -- Le référentiel de cas d'une formation ---------------------------------

  const vueCas = (r) => ({
    id: r.id, formation: r.formation, titre: r.titre,
    consignes: r.consignes || null, ordre: r.ordre,
  });

  // Les cas PROPOSABLES d'une formation. Une autre formation n'en voit jamais
  // un seul : c'est la même colonne qui cloisonne les modules et les questions.
  function listerCas(formationCle) {
    assurerSchema();
    return db().prepare(`SELECT * FROM academy_cas WHERE formation = ? AND actif = 1
                         ORDER BY ordre ASC, id ASC`)
      .all(cleFormation(formationCle)).map(vueCas);
  }

  // La liste D'ADMINISTRATION : archivés compris, et le drapeau avec. Elle ne
  // remplace PAS `listerCas` — celle-ci sert l'évaluateur, et un cas archivé ne
  // doit jamais lui être proposé. Deux publics, deux listes.
  function listerCasAdmin(formationCle) {
    assurerSchema();
    return db().prepare(`SELECT * FROM academy_cas WHERE formation = ?
                         ORDER BY ordre ASC, id ASC`)
      .all(cleFormation(formationCle))
      .map((r) => ({ ...vueCas(r), actif: !!r.actif }));
  }

  // Écrire un cas. Créer et modifier sont le MÊME geste, distingués par la
  // présence d'un identifiant — comme pour un module ou une question.
  //
  // ⚠️ AUCUNE SUPPRESSION ICI, et ce n'est pas un oubli : `academy_evaluations`
  // cite `cas_id`. Effacer un cas effacerait le référentiel des évaluations
  // déjà prononcées dessus. L'archivage passe par `basculerActif`, comme
  // partout ailleurs dans l'administration.
  const TITRE_CAS_MAX = 200;
  const CONSIGNES_MAX = 5000;

  function definirCas(donnees) {
    assurerSchema();
    const d = donnees || {};
    const existant = d.id
      ? db().prepare('SELECT * FROM academy_cas WHERE id = ?').get(Number(d.id))
      : null;
    if (d.id && !existant) return err(404, 'Cas introuvable.');

    // Un cas NE CHANGE PAS de formation. Le déplacer emporterait les
    // évaluations déjà prononcées dessus, qui le citent par son identifiant.
    // On lit donc la formation de la LIGNE quand elle existe, jamais du corps.
    //
    // `inclureInactives` est indispensable : on administre d'abord des
    // brouillons, et `resoudre()` seul les tient pour inexistants.
    const demandee = String(d.formation || '').trim().toLowerCase();
    // Modifier un cas EN LE DÉSIGNANT DEPUIS UNE AUTRE FORMATION est refusé.
    // Sans ce refus, la route écrirait dans la formation B tout en renvoyant
    // l'arbre de la formation A : une écriture invisible dans l'écran qui l'a
    // provoquée. C'est le même garde-fou que pour le module d'une question.
    if (existant && demandee && demandee !== existant.formation) {
      return err(400, 'Ce cas appartient à une autre formation.');
    }
    const cle = existant ? existant.formation : demandee;
    const f = cle ? formations.resoudre(cle, { inclureInactives: true }) : null;
    if (!f) return err(404, 'Formation inconnue.');

    const titre = String(d.titre || '').trim().slice(0, TITRE_CAS_MAX);
    if (!titre) return err(400, 'Le titre du cas est requis.');
    // Les consignes restent FACULTATIVES, comme le dit le schéma : un intitulé
    // suffit à désigner une situation, et personne ne doit inventer des
    // consignes pour remplir une colonne.
    const consignes = String(d.consignes || '').trim().slice(0, CONSIGNES_MAX) || null;

    const entier = (v, defaut) => {
      if (v === undefined || v === null || v === '') return defaut;
      const n = Number(v);
      return Number.isInteger(n) && n >= 0 && n <= 9999 ? n : null;
    };
    const suivant = (db().prepare('SELECT MAX(ordre) AS n FROM academy_cas WHERE formation = ?')
      .get(f.cle).n || 0) + 1;
    const ordre = entier(d.ordre, existant ? existant.ordre : suivant);
    if (ordre === null) return err(400, 'Ordre invalide.');
    const actif = d.actif === undefined || d.actif === null
      ? (existant ? !!existant.actif : true) : !!d.actif;

    const maintenant = nowIso();
    let id = existant ? existant.id : null;
    if (existant) {
      db().prepare(`UPDATE academy_cas SET titre = ?, consignes = ?, ordre = ?, actif = ?, maj_le = ?
                    WHERE id = ?`).run(titre, consignes, ordre, actif ? 1 : 0, maintenant, existant.id);
    } else {
      // `cle` reste NULLE. Elle est UNIQUE À TRAVERS TOUTES LES FORMATIONS et
      // ne sert qu'à repérer l'amorçage : la remplir depuis l'administration
      // ferait entrer en collision deux formations sans rapport.
      const info = db().prepare(`INSERT INTO academy_cas (formation, titre, consignes, ordre, actif, cle, cree_le, maj_le)
                                 VALUES (?,?,?,?,?,NULL,?,?)`)
        .run(f.cle, titre, consignes, ordre, actif ? 1 : 0, maintenant, maintenant);
      id = Number(info.lastInsertRowid);
    }
    const r = db().prepare('SELECT * FROM academy_cas WHERE id = ?').get(id);
    return ok({ cas: { ...vueCas(r), actif: !!r.actif } });
  }

  // Un cas n'est utilisable QUE dans sa formation. Renvoyer null plutôt que de
  // se rabattre sur une autre : un identifiant venu d'ailleurs doit être un
  // refus franc, pas une étiquette silencieusement fausse.
  function lireCasDe(formationCle, casId) {
    if (casId === undefined || casId === null || casId === '') return null;
    const n = Number(casId);
    if (!Number.isInteger(n)) return null;
    const r = db().prepare('SELECT * FROM academy_cas WHERE id = ? AND formation = ? AND actif = 1')
      .get(n, cleFormation(formationCle));
    return r ? vueCas(r) : null;
  }

  // -- Droit d'évaluer -------------------------------------------------------

  // Relu à CHAQUE requête, jamais mis en cache : retirer le droit d'évaluer doit
  // fermer la porte dans la seconde, comme pour les collaborateurs du Boost.
  //
  // Aucune exception, pas même pour l'administrateur : être admin donne le droit
  // de DÉSIGNER des évaluateurs, jamais celui d'évaluer. Un admin qui veut faire
  // passer une pratique se désigne lui-même — le geste est alors tracé, et c'est
  // exactement ce qu'on veut d'une habilitation.
  function estEvaluateur(email) {
    const mail = normalise(email);
    if (!mail) return false;
    const row = db().prepare('SELECT actif FROM academy_evaluateurs WHERE email = ?').get(mail);
    return !!(row && row.actif);
  }

  // Réservé à l'administrateur (la route s'en charge). Volontairement la SEULE
  // écriture d'administration du lot : on n'en profite pas pour construire
  // l'administration complète de l'Academy.
  function definirEvaluateur(email, oui, auteur) {
    const mail = normalise(email);
    const u = boost.lireUtilisateur(mail);
    if (!u) return err(404, 'Ce compte n\'existe pas encore : la personne doit d\'abord créer son espace.');
    const maintenant = nowIso();
    db().prepare(`INSERT INTO academy_evaluateurs (email, actif, cree_le, maj_le, maj_par) VALUES (?, ?, ?, ?, ?)
                  ON CONFLICT(email) DO UPDATE SET actif = excluded.actif,
                    maj_le = excluded.maj_le, maj_par = excluded.maj_par`)
      .run(mail, oui ? 1 : 0, maintenant, maintenant, normalise(auteur) || null);
    return ok({ evaluateur: { email: mail, prenom: u.prenom || '', actif: !!oui } });
  }

  // La liste qu'affiche l'écran d'administration : tout compte susceptible
  // d'évaluer, avec son droit actuel. C'est-à-dire les collaborateurs ACTIFS —
  // les candidats naturels — PLUS toute personne déjà désignée même si elle a
  // cessé d'être collaboratrice : sans elle, on ne pourrait plus lui retirer
  // son droit depuis l'écran, et il faudrait ressortir la ligne de commande.
  //
  // Ce n'est PAS un second système de permissions : la vérité reste
  // academy_evaluateurs, relue à chaque requête par estEvaluateur().
  function listerGestionEvaluateurs() {
    const droits = new Map(db().prepare('SELECT email, actif FROM academy_evaluateurs').all()
      .map((r) => [r.email, !!r.actif]));
    const vus = new Set();
    const lignes = boost.listerCollaborateurs().map((c) => {
      vus.add(c.email);
      return {
        email: c.email, prenom: c.prenom || '',
        collaborateur: true, evaluateur: droits.get(c.email) === true,
      };
    });
    for (const [email, actif] of droits) {
      if (vus.has(email) || !actif) continue;
      lignes.push({ email, prenom: prenomDe(email), collaborateur: false, evaluateur: true });
    }
    // Les évaluateurs en tête : c'est la question qu'on vient se poser en
    // ouvrant cet écran, « qui a le droit aujourd'hui ? ».
    return lignes.sort((a, b) => (Number(b.evaluateur) - Number(a.evaluateur)) || a.email.localeCompare(b.email));
  }

  function listerEvaluateurs() {
    return db().prepare(`SELECT e.email AS email, u.prenom AS prenom, e.actif AS actif, e.maj_le AS majLe, e.maj_par AS majPar
                         FROM academy_evaluateurs e JOIN users u ON u.email = e.email
                         ORDER BY e.actif DESC, e.email ASC`).all()
      .map((r) => ({ ...r, actif: !!r.actif }));
  }

  // -- Lecture ---------------------------------------------------------------

  const prenomDe = (email) => {
    const u = db().prepare('SELECT prenom FROM users WHERE email = ?').get(normalise(email));
    return u && u.prenom ? u.prenom : '';
  };

  // La vue d'une tentative. Le commentaire de l'évaluateur EST montré au
  // collaborateur concerné : c'est une appréciation qui lui est destinée, et
  // l'écran de saisie le dit à l'évaluateur avant qu'il l'écrive. Le jour où
  // une note privée sera nécessaire, ce sera une colonne distincte — pas un
  // champ qu'on aurait laissé ambigu.
  const vue = (r) => ({
    id: r.id,
    formation: r.formation,
    cas: r.cas || null,
    // L'origine de l'étiquette, quand elle vient du référentiel. L'écran s'en
    // sert pour resélectionner le bon cas ; le titre, lui, reste dans `cas`.
    casId: r.cas_id === undefined || r.cas_id === null ? null : r.cas_id,
    ouverteLe: r.ouverte_le,
    ouvertPar: r.ouvert_par || null,
    dateEvaluation: r.date_evaluation || null,
    evaluateur: r.evaluateur || null,
    evaluateurPrenom: r.evaluateur ? prenomDe(r.evaluateur) : '',
    resultat: r.resultat || null,
    enAttente: !r.resultat,
    commentaire: r.commentaire || null,
    decideLe: r.decide_le || null,
  });

  // ⚠️ LA COLONNE `formation` EXISTAIT DEPUIS LE LOT 3, MAIS AUCUNE REQUÊTE NE
  // LA LISAIT : une pratique validée dans une formation en validait donc une
  // autre. C'est ce filtre-là, et ses quatre voisins, qui cloisonnent enfin.
  function historiqueDe(email, formationCle) {
    return db().prepare('SELECT * FROM academy_evaluations WHERE email = ? AND formation = ? ORDER BY id DESC')
      .all(normalise(email), cleFormation(formationCle)).map(vue);
  }

  const lireEvaluation = (id) => {
    const r = db().prepare('SELECT * FROM academy_evaluations WHERE id = ?').get(Number(id));
    return r || null;
  };

  const enAttenteDe = (email, formationCle) =>
    db().prepare(`SELECT * FROM academy_evaluations WHERE email = ? AND formation = ?
                  AND resultat IS NULL ORDER BY id DESC LIMIT 1`)
      .get(normalise(email), cleFormation(formationCle)) || null;

  // Une validation est ACQUISE et CLÔT l'étape : on cherche donc « existe-t-il
  // une évaluation validée », et non « la dernière est-elle validée ». Comme
  // plus aucune tentative ne peut s'ouvrir ensuite (cf. ouvrir()), aucun verdict
  // postérieur ne peut venir la rétrograder — la règle tient par construction,
  // pas seulement par comparaison de dates.
  const validationDe = (email, formationCle) =>
    db().prepare(`SELECT * FROM academy_evaluations WHERE email = ? AND formation = ? AND resultat = ?
                  ORDER BY id ASC LIMIT 1`)
      .get(normalise(email), cleFormation(formationCle), RES_VALIDE) || null;

  // L'état complet, tel que l'écran l'affiche. Tout est recalculé.
  function etatPour(email, formationCle) {
    const mail = normalise(email);
    const cle = cleFormation(formationCle);
    // LA source unique : le lot 2. Rien n'est recalculé ici.
    const theorie = qcm.etatPour(mail, cle);
    const validee = validationDe(mail, cle);
    const attente = enAttenteDe(mail, cle);
    const derniere = db().prepare(`SELECT * FROM academy_evaluations WHERE email = ? AND formation = ?
                                   ORDER BY id DESC LIMIT 1`).get(mail, cle);
    // ⚠️ MÊME GARDE QU'À L'ÉCRITURE (reporterDansCertification). Sans elle, un
    // coach certifié Coach Nutrition lisait « Tu es <titre de l'autre
    // formation> » sur la carte Terrain d'un parcours qu'il venait de
    // commencer.
    const cert = certificationBoostDe(cle, mail);

    let etat = ETAT_NON_ACCESSIBLE;
    if (theorie.theorieValidee) {
      if (validee) etat = ETAT_VALIDEE;
      else if (attente) etat = ETAT_EN_ATTENTE;
      else if (derniere && derniere.resultat === RES_A_REPASSER) etat = ETAT_A_REPASSER;
      else etat = ETAT_A_REALISER;
    }

    return {
      cleFormation: cle,
      etat,
      // Le prérequis, relu et renvoyé tel quel : l'écran n'a pas à le déduire.
      theorieValidee: !!theorie.theorieValidee,
      accessible: !!theorie.theorieValidee,
      scoreTheorie: theorie.scoreValide,
      validee: !!validee,
      valideeLe: validee ? (validee.date_evaluation || validee.decide_le) : null,
      // L'étape est close : plus aucune tentative ne s'ouvrira. L'écran s'en
      // sert pour ne plus proposer de formulaire — le serveur refuserait de
      // toute façon.
      close: !!validee,
      enAttente: attente ? vue(attente) : null,
      derniere: derniere ? vue(derniere) : null,
      historique: historiqueDe(mail, cle),
      // Ce que la pratique validée n'ouvre PAS, renvoyé à côté pour que l'écran
      // ne puisse pas confondre les deux.
      certifie: !!cert && cert.statut === 'certifie',
      certification: cert ? cert.statut : null,
    };
  }

  // -- Vue de l'évaluateur ---------------------------------------------------

  // Les collaborateurs qu'un évaluateur peut convoquer : actifs, théorie
  // validée. Ceux dont la théorie n'est pas faite n'apparaissent pas — les
  // afficher grisés inviterait à chercher comment passer outre.
  function listerEligibles(formationCle) {
    const cle = cleFormation(formationCle);
    const collabs = boost.listerCollaborateurs();
    return collabs
      .map((c) => {
        const e = etatPour(c.email, cle);
        return {
          email: c.email,
          prenom: c.prenom || '',
          etat: e.etat,
          theorieValidee: e.theorieValidee,
          scoreTheorie: e.scoreTheorie,
          validee: e.validee,
          close: e.close,
          enAttente: e.enAttente,
          derniere: e.derniere,
          nbTentatives: e.historique.length,
          certifie: e.certifie,
        };
      })
      .filter((c) => c.theorieValidee)
      .sort((a, b) => {
        // Ce qui demande une action d'abord : séances à saisir, puis à
        // convoquer, puis les dossiers clos.
        const rang = { en_attente: 0, a_repasser: 1, a_realiser: 2, validee: 3, non_accessible: 4 };
        return (rang[a.etat] - rang[b.etat]) || a.email.localeCompare(b.email);
      });
  }

  function ficheDe(email, formationCle) {
    const mail = normalise(email);
    const cle = cleFormation(formationCle);
    const u = boost.lireUtilisateur(mail);
    if (!u) return err(404, 'Collaborateur introuvable.');
    if (!boost.estCollaborateur(u)) return err(404, 'Collaborateur introuvable.');
    const e = etatPour(mail, cle);
    if (!e.theorieValidee) {
      return err(409, 'Ce collaborateur n\'a pas encore validé la partie théorique.',
        { theorieNonValidee: true, email: mail });
    }
    // Le référentiel voyage AVEC la fiche : l'écran de saisie a besoin des deux
    // au même moment, et une seconde route ne dirait rien de plus.
    return ok({
      collaborateur: { email: mail, prenom: u.prenom || '' },
      pratique: e,
      cas: listerCas(cle),
    });
  }

  // -- Écriture --------------------------------------------------------------

  // Les trois refus qui donnent son poids au résultat, réunis en un seul
  // endroit pour qu'aucune route ne puisse en oublier un.
  function verifierCible(cible, auteur, formationCle) {
    const mail = normalise(cible);
    const moi = normalise(auteur);
    if (!mail) return err(400, 'Collaborateur manquant.');
    // Personne ne s'auto-valide, évaluateur ou non. C'est le refus le plus
    // important du lot : sans lui, le droit d'évaluer vaudrait droit de se
    // certifier soi-même.
    if (mail === moi) return err(403, 'On n\'évalue pas sa propre pratique.', { autoEvaluation: true });
    const u = boost.lireUtilisateur(mail);
    if (!u || !boost.estCollaborateur(u)) return err(404, 'Collaborateur introuvable.');
    // Le prérequis est relu ICI, à l'écriture. Le vérifier seulement à
    // l'affichage laisserait un appel direct à l'API passer devant.
    if (!qcm.etatPour(mail, cleFormation(formationCle)).theorieValidee) {
      return err(409, 'La partie théorique de ce collaborateur n\'est pas validée : l\'évaluation pratique reste verrouillée.',
        { theorieNonValidee: true });
    }
    return ok({ collaborateur: u });
  }

  // `formationCle` est indispensable ici : c'est elle qui décide si le cas
  // demandé appartient bien au référentiel de CETTE formation.
  function normaliserSaisie(donnees, formationCle) {
    const d = donnees || {};
    const resultat = d.resultat === undefined || d.resultat === null || d.resultat === ''
      ? null : String(d.resultat).trim();
    if (resultat !== null && !RESULTATS.includes(resultat)) {
      return { erreur: err(400, 'Résultat inconnu : attendu « valide » ou « a_repasser ».') };
    }
    let date = d.dateEvaluation ? String(d.dateEvaluation).trim() : null;
    if (date && !jourValide(date)) return { erreur: err(400, 'Date d\'évaluation invalide (AAAA-MM-JJ).') };
    // LE CAS. Trois entrées possibles, une seule sortie : un titre recopié.
    //  - un `casId` du référentiel  -> son titre est copié, l'origine gardée ;
    //  - un `cas` en texte libre    -> conservé tel quel (l'existant) ;
    //  - rien                       -> rien, un cas n'a jamais été obligatoire.
    let casId = null;
    let cas = d.cas ? String(d.cas).slice(0, 200) : null;
    if (d.casId !== undefined && d.casId !== null && d.casId !== '') {
      const choisi = lireCasDe(formationCle, d.casId);
      // Un identifiant venu d'une autre formation est REFUSÉ, pas ignoré :
      // l'ignorer enregistrerait l'évaluation sous une étiquette vide, et
      // l'évaluateur croirait avoir désigné une situation.
      if (!choisi) {
        return { erreur: err(400, 'Cas pratique inconnu pour cette formation.', { casInconnu: true }) };
      }
      casId = choisi.id;
      cas = choisi.titre.slice(0, 200);
    }
    return {
      resultat,
      date,
      cas,
      casId,
      commentaire: d.commentaire ? String(d.commentaire).slice(0, 2000) : null,
    };
  }

  // Ouvrir une évaluation. Deux usages, une seule route : sans résultat, la
  // séance est ouverte et le verdict suivra (« résultat en attente ») ; avec
  // résultat, l'évaluateur qui saisit à chaud clôt en une fois.
  function ouvrir(cible, auteur, donnees) {
    const mail = normalise(cible);
    const moi = normalise(auteur);
    const cle = cleFormation((donnees || {}).formation);
    // La formation doit exister ET être active : sinon on ouvrirait une
    // évaluation rattachée à un parcours qui n'existe pas.
    if (!formations.resoudre(cle)) return err(404, 'Formation inconnue.');

    const controle = verifierCible(mail, moi, cle);
    if (!controle.ok) return controle;

    const saisie = normaliserSaisie(donnees, cle);
    if (saisie.erreur) return saisie.erreur;

    // L'ÉTAPE EST TERMINÉE. Une pratique validée ferme le parcours pratique :
    // plus de tentative, donc plus de verdict postérieur capable de la
    // rétrograder. Le refus vit ICI, côté serveur — l'écran qui masque le
    // formulaire n'est qu'une politesse, pas une protection.
    const acquise = validationDe(mail, cle);
    if (acquise) {
      return err(409, 'L\'évaluation pratique de ce collaborateur est déjà validée : l\'étape est terminée.',
        { dejaValidee: true, evaluation: vue(acquise) });
    }

    // Deux séances ouvertes en même temps rendraient « où en est-il ? »
    // impossible à répondre. On renvoie celle qui attend plutôt qu'un refus sec.
    const attente = enAttenteDe(mail, cle);
    if (attente) {
      return err(409, 'Une évaluation est déjà ouverte pour ce collaborateur : saisis son résultat.',
        { evaluation: vue(attente) });
    }

    const maintenant = nowIso();
    const clos = saisie.resultat !== null;
    const info = db().prepare(`INSERT INTO academy_evaluations
        (email, formation, cas, cas_id, ouvert_par, ouverte_le, date_evaluation, evaluateur, resultat, commentaire, decide_le, maj_le)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(mail, cle, saisie.cas, saisie.casId, moi, maintenant,
        saisie.date || (clos ? aujourdhui() : null),
        clos ? moi : null, saisie.resultat, saisie.commentaire,
        clos ? maintenant : null, maintenant);

    const id = Number(info.lastInsertRowid);
    if (clos) reporterDansCertification(mail, saisie.resultat, moi, cle);
    return ok({ evaluation: vue(lireEvaluation(id)), pratique: etatPour(mail, cle) }, 201);
  }

  // Saisir le verdict d'une séance ouverte. Une évaluation close est IMMUABLE :
  // on ne corrige pas une décision prononcée, on en prononce une nouvelle.
  function enregistrerResultat(id, auteur, donnees) {
    const moi = normalise(auteur);
    const r = lireEvaluation(id);
    if (!r) return err(404, 'Évaluation introuvable.');
    if (r.resultat) {
      return err(409, 'Cette évaluation a déjà été prononcée : ouvre une nouvelle évaluation pour ce collaborateur.',
        { evaluation: vue(r) });
    }
    const controle = verifierCible(r.email, moi, r.formation);
    if (!controle.ok) return controle;

    // Même verrou qu'à l'ouverture. Il ne peut normalement pas se déclencher —
    // une séance ne survit pas à une validation, puisque valider est justement
    // ce qui clôt la dernière séance ouverte — mais une règle qui protège une
    // habilitation ne se garde pas à un seul endroit.
    const acquise = validationDe(r.email, r.formation);
    if (acquise) {
      return err(409, 'L\'évaluation pratique de ce collaborateur est déjà validée : l\'étape est terminée.',
        { dejaValidee: true, evaluation: vue(acquise) });
    }

    // La formation est celle de la SÉANCE OUVERTE, pas une clé venue du corps
    // de la requête : sinon un `formation` glissé dans le JSON ferait accepter
    // le cas d'un autre parcours.
    const saisie = normaliserSaisie(donnees, r.formation);
    if (saisie.erreur) return saisie.erreur;
    if (!saisie.resultat) return err(400, 'Un résultat est requis : « valide » ou « a_repasser ».');

    const maintenant = nowIso();
    db().prepare(`UPDATE academy_evaluations SET evaluateur = ?, resultat = ?, commentaire = ?,
                    date_evaluation = COALESCE(?, date_evaluation, ?),
                    cas = COALESCE(?, cas), cas_id = COALESCE(?, cas_id),
                    decide_le = ?, maj_le = ? WHERE id = ?`)
      .run(moi, saisie.resultat, saisie.commentaire, saisie.date, aujourdhui(),
        saisie.cas, saisie.casId,
        maintenant, maintenant, r.id);

    reporterDansCertification(r.email, saisie.resultat, moi, r.formation);
    return ok({ evaluation: vue(lireEvaluation(r.id)), pratique: etatPour(r.email, r.formation) });
  }

  // Report dans le système de certification EXISTANT — la colonne
  // resultat_pratique, qui n'attendait que ça. Le STATUT n'est jamais touché :
  // valider la pratique ne certifie personne, et le lot qui certifiera devra le
  // faire explicitement.
  // Le pendant EN LECTURE de reporterDansCertification, sous le même drapeau.
  function certificationBoostDe(formationCle, email) {
    const f = formations.lire(cleFormation(formationCle));
    if (!f || !f.refletBoost) return null;
    if (typeof boost.lireCertification !== 'function') return null;
    return boost.lireCertification(email);
  }

  function reporterDansCertification(email, resultat, auteur, formationCle) {
    // Seule une formation qui ouvre des droits dans le Boost y écrit son
    // résultat pratique. Une formation « Vente » n'a rien à y refléter.
    const f = formations.lire(cleFormation(formationCle));
    if (!f || !f.refletBoost) return null;
    if (typeof boost.enregistrerPratique !== 'function') return null;
    return boost.enregistrerPratique(email, resultat, auteur);
  }

  return {
    assurerSchema,
    estEvaluateur, definirEvaluateur, listerEvaluateurs, listerGestionEvaluateurs,
    etatPour, historiqueDe, listerEligibles, ficheDe,
    listerCas, listerCasAdmin, lireCasDe, definirCas,
    ouvrir, enregistrerResultat, lireEvaluation,
  };
}

module.exports = {
  createAcademyPratique,
  FORMATION, RESULTATS, RES_VALIDE, RES_A_REPASSER,
  ETAT_NON_ACCESSIBLE, ETAT_A_REALISER, ETAT_EN_ATTENTE, ETAT_VALIDEE, ETAT_A_REPASSER,
};
