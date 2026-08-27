'use strict';
// ============================================================================
//  BOOST NUTRITION — socle métier.
//
//  Un « Boost Nutrition » est un accompagnement de 12 Étapes conduit par un
//  Coach Nutrition certifié, borné à 16 semaines à compter de la validation de
//  l'Étape 1.
//
//  Ce fichier est VOLONTAIREMENT ISOLÉ du reste de l'app :
//   - il porte son propre schéma (tables `boost_*`), appliqué à part de celui de
//     lib/db.js. Le socle nutrition existant (plans, recettes, pesées, photos,
//     moteur calorique) n'est pas touché d'une ligne ;
//   - le schéma est PUREMENT ADDITIF : aucune table existante n'est altérée,
//     aucune colonne n'est ajoutée à `users`. Le Boost ne fait que LIRE `users`
//     (email, prénom) et s'y rattacher par clé étrangère.
//
//  QUI EST QUOI, ET OÙ C'EST ÉCRIT. Le rôle de collaborateur ne vit PAS dans le
//  compte : il vit dans `boost_collaborateurs`, une table du Boost. La raison
//  est structurelle, pas cosmétique — un compte `users` appartient au socle
//  nutrition, qui existait avant le Boost et doit continuer à tourner sans lui.
//  Y écrire une notion propre au Boost mélangerait deux cycles de vie : retirer
//  le Boost demanderait alors une migration de `users`, alors qu'ici il suffit
//  de supprimer les tables `boost_*`. Conséquence directe et voulue : le
//  `role` que manipule ce module est DÉRIVÉ à la lecture, jamais stocké dans le
//  compte (cf. lireUtilisateur).
//
//  L'administrateur, lui, reste défini par la variable d'environnement
//  ADMIN_EMAIL, exactement comme avant ce lot. C'est délibéré : mettre l'admin
//  en base ouvrirait une élévation de privilège par simple UPDATE, et changerait
//  une règle d'authentification déjà en production.
//
//  Les fonctions ne parlent pas HTTP : elles renvoient { ok, status, body } et
//  c'est le routeur qui répond — même parti pris que lib/auth.js, pour que tout
//  le socle soit testable sans serveur.
//
//  DÉCISIONS STRUCTURANTES (arbitrages validés) :
//   - un client ne peut avoir qu'UN SEUL Boost actif à la fois, mais il peut en
//     racheter un après un Boost terminé / expiré / interrompu. La contrainte
//     est posée DANS LE SCHÉMA (index unique partiel), pas seulement en code ;
//   - les 12 Étapes se valident DANS L'ORDRE, et seul le Coach Nutrition
//     attribué les valide. L'admin administre le Boost, il n'anime pas le suivi ;
//   - l'expiration n'est pas un cron : elle est DÉRIVÉE de l'échéance et
//     matérialisée à la première lecture qui suit la date. Pas de tâche de fond
//     à surveiller, et l'état est le même qu'on lise le dossier ou non ;
//   - la prolongation est le seul moyen de dépasser 16 semaines. Sans plafond de
//     nombre, mais jamais anonyme : datée, motivée, attribuée, journalisée.
// ============================================================================

const ETAPES_TOTAL = 12;
const SEMAINES_BASE = 16;          // durée d'un Boost à compter de l'Étape 1
const JOURS_PAR_SEMAINE = 7;

// Statuts d'un Boost. `a_demarrer` = acheté/créé, Étape 1 pas encore validée :
// le compte à rebours des 16 semaines n'a donc pas commencé.
const STATUT_A_DEMARRER = 'a_demarrer';
const STATUT_EN_COURS = 'en_cours';
const STATUT_TERMINE = 'termine';
const STATUT_EXPIRE = 'expire';
const STATUT_INTERROMPU = 'interrompu';
const STATUTS = [STATUT_A_DEMARRER, STATUT_EN_COURS, STATUT_TERMINE, STATUT_EXPIRE, STATUT_INTERROMPU];
// « Actif » au sens de la règle « un seul Boost à la fois » : un Boost pas
// encore démarré occupe la place autant qu'un Boost en cours.
const STATUTS_ACTIFS = [STATUT_A_DEMARRER, STATUT_EN_COURS];

// Certification Coach Nutrition. Le LMS / Academy vit AILLEURS (35 vidéos, QCM,
// évaluation pratique) : ici on ne conserve que le VERDICT et sa traçabilité.
const CERT_NON = 'non_certifie';
const CERT_EN_COURS = 'en_cours';
const CERT_OK = 'certifie';
const CERT_SUSPENDU = 'suspendu';
const CERT_STATUTS = [CERT_NON, CERT_EN_COURS, CERT_OK, CERT_SUSPENDU];
const PRATIQUE_RESULTATS = ['valide', 'non_valide', 'a_repasser'];

// Rôles. Ce sont des VALEURS CALCULÉES, pas des colonnes : `client` est
// simplement « compte connu de users, absent de boost_collaborateurs ».
// `admin` n'en fait volontairement pas partie (cf. en-tête).
const ROLE_CLIENT = 'client';
const ROLE_COLLABORATEUR = 'collaborateur';
const ROLES = [ROLE_CLIENT, ROLE_COLLABORATEUR];

const SCHEMA = `
-- Qui est collaborateur. Table DÉDIÉE : la table users n'apprend rien du Boost,
-- elle est seulement référencée. On pose actif = 0 plutôt que de supprimer la
-- ligne, pour que le retrait d'un collaborateur garde sa date et son auteur.
CREATE TABLE IF NOT EXISTS boost_collaborateurs (
  email   TEXT PRIMARY KEY REFERENCES users(email) ON DELETE CASCADE,
  actif   INTEGER NOT NULL DEFAULT 1,
  cree_le TEXT NOT NULL,
  maj_le  TEXT NOT NULL,
  maj_par TEXT
);

-- Certification Coach Nutrition : une ligne par collaborateur. Administrée à la
-- main en V1 (l'Academy n'écrit pas ici, elle n'est pas dans cette app).
CREATE TABLE IF NOT EXISTS boost_certifications (
  email              TEXT PRIMARY KEY REFERENCES users(email) ON DELETE CASCADE,
  statut             TEXT NOT NULL DEFAULT 'non_certifie',
  date_certification TEXT,
  evaluateur         TEXT,
  score_qcm          INTEGER,
  resultat_pratique  TEXT,
  commentaire        TEXT,
  maj_le             TEXT NOT NULL,
  maj_par            TEXT
);

-- Le Boost lui-même.
CREATE TABLE IF NOT EXISTS boosts (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  client_email           TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  -- SET NULL et non CASCADE : le départ d'un coach ne doit pas emporter le
  -- dossier de son client. Le Boost se retrouve simplement sans coach attribué.
  coach_email            TEXT REFERENCES users(email) ON DELETE SET NULL,
  statut                 TEXT NOT NULL DEFAULT 'a_demarrer',
  -- Date de validation de l'Étape 1 : c'est ELLE qui arme les 16 semaines,
  -- pas la date d'achat. Un Boost payé et jamais démarré n'expire pas.
  demarre_le             TEXT,
  echeance_le            TEXT,
  semaines_base          INTEGER NOT NULL DEFAULT ${SEMAINES_BASE},
  -- Le cumul des prolongations est stocké EN JOURS, pas en semaines : l'admin
  -- prolonge en choisissant une nouvelle date limite, qui ne tombe pas
  -- forcément sur un multiple de 7. On expose quand même l'équivalent en
  -- semaines quand il est entier, parce que c'est ainsi qu'on en parle.
  jours_prolongation     INTEGER NOT NULL DEFAULT 0,
  termine_le             TEXT,
  interrompu_le          TEXT,
  motif_interruption     TEXT,
  -- Aucun paiement branché en V1 (arbitrage n°5). Cette colonne est le point
  -- d'accroche prévu pour une référence externe (Stripe, facture…) : la brancher
  -- plus tard n'exigera pas de refonte.
  reference_externe      TEXT,
  cree_le                TEXT NOT NULL,
  cree_par               TEXT
);
CREATE INDEX IF NOT EXISTS idx_boosts_client ON boosts(client_email);
CREATE INDEX IF NOT EXISTS idx_boosts_coach ON boosts(coach_email);
-- La règle « un seul Boost actif par client » tenue par la base : même un bug
-- de code ou deux requêtes concurrentes ne peuvent pas en créer deux.
CREATE UNIQUE INDEX IF NOT EXISTS idx_boosts_un_seul_actif
  ON boosts(client_email) WHERE statut IN ('a_demarrer', 'en_cours');

-- Les 12 Étapes, créées d'un bloc avec le Boost.
CREATE TABLE IF NOT EXISTS boost_etapes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  boost_id     INTEGER NOT NULL REFERENCES boosts(id) ON DELETE CASCADE,
  numero       INTEGER NOT NULL,
  statut       TEXT NOT NULL DEFAULT 'a_venir',
  validee_le   TEXT,
  validee_par  TEXT,
  UNIQUE(boost_id, numero)
);
CREATE INDEX IF NOT EXISTS idx_boost_etapes ON boost_etapes(boost_id, numero);

-- Prolongations. Exceptionnelles, sans plafond de nombre, jamais anonymes.
CREATE TABLE IF NOT EXISTS boost_prolongations (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  boost_id  INTEGER NOT NULL REFERENCES boosts(id) ON DELETE CASCADE,
  jours     INTEGER NOT NULL,
  motif     TEXT NOT NULL,
  auteur    TEXT NOT NULL,
  cree_le   TEXT NOT NULL,
  echeance_avant TEXT,
  echeance_apres TEXT
);
CREATE INDEX IF NOT EXISTS idx_boost_prolongations ON boost_prolongations(boost_id, id);

-- Journal d'administration : qui a fait quoi, quand, sur quel dossier.
CREATE TABLE IF NOT EXISTS boost_journal (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  boost_id INTEGER NOT NULL REFERENCES boosts(id) ON DELETE CASCADE,
  action   TEXT NOT NULL,
  detail   TEXT,
  auteur   TEXT,
  cree_le  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_boost_journal ON boost_journal(boost_id, id);
`;

// --- Dates ------------------------------------------------------------------
// Tout se joue en jours calendaires (AAAA-MM-JJ), en UTC : une échéance à 16
// semaines ne doit pas glisser d'un jour selon le fuseau du serveur.

const jourValide = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const aujourdhui = () => new Date().toISOString().slice(0, 10);

function ajouterJours(date, n) {
  const d = new Date(String(date) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + Number(n || 0));
  return d.toISOString().slice(0, 10);
}

// Échéance = Étape 1 + 16 semaines + les jours de prolongation accordés.
function calculerEcheance(demarreLe, semainesBase, joursProlongation) {
  if (!jourValide(demarreLe)) return null;
  const base = Number(semainesBase || SEMAINES_BASE) * JOURS_PAR_SEMAINE;
  return ajouterJours(demarreLe, base + Number(joursProlongation || 0));
}

// Nombre de jours entre deux dates calendaires (b - a).
function joursEntre(a, b) {
  if (!jourValide(a) || !jourValide(b)) return null;
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
}

// On parle en semaines quand ça tombe juste, sinon on n'invente pas un arrondi
// qui ferait mentir l'affichage.
const enSemaines = (jours) => (Number(jours || 0) % JOURS_PAR_SEMAINE === 0 ? Number(jours || 0) / JOURS_PAR_SEMAINE : null);

// Jours restants avant échéance. Négatif = dépassé.
function joursRestants(echeance, jour) {
  if (!jourValide(echeance)) return null;
  const a = Date.parse(String(echeance) + 'T00:00:00Z');
  const b = Date.parse(String(jour || aujourdhui()) + 'T00:00:00Z');
  return Math.round((a - b) / 864e5);
}

// JSON tolérant : une colonne illisible ne doit jamais faire tomber une route.
// Volontairement local — lib/boost.js ne dépend que de ce qu'on lui injecte.
function lireJson(txt, repli) {
  if (!txt) return repli;
  try { return JSON.parse(txt); } catch (_) { return repli; }
}

const err = (status, error, extra = {}) => ({ ok: false, status, body: { ok: false, error, ...extra } });
const ok = (body = {}, status = 200) => ({ ok: true, status, body: { ok: true, ...body } });

function createBoost({ getDb, nowIso }) {
  const db = () => getDb();

  // -- Schéma ---------------------------------------------------------------
  // Que des CREATE TABLE IF NOT EXISTS : aucun ALTER, aucune table existante
  // touchée. Appliqué UNE FOIS PAR BASE OUVERTE et non à chaque appel — le
  // routeur l'invoque en tête de chaque requête Boost (c'est ce qui rend le
  // socle autonome, sans ordre de démarrage à respecter), il ne faut donc pas
  // rejouer le DDL à chaque fois. Le repère est posé sur l'objet base lui-même :
  // rouvrir une base — ce que font les tests — réapplique bien le schéma.
  const basesMigrees = new WeakSet();
  function assurerSchema() {
    const d = db();
    if (basesMigrees.has(d)) return true;
    d.exec(SCHEMA);
    basesMigrees.add(d);
    return true;
  }

  const normalise = (e) => String(e || '').trim().toLowerCase();

  function journaliser(boostId, action, detail, auteur) {
    db().prepare('INSERT INTO boost_journal (boost_id, action, detail, auteur, cree_le) VALUES (?, ?, ?, ?, ?)')
      .run(Number(boostId), String(action), detail ? JSON.stringify(detail) : null,
        auteur ? normalise(auteur) : null, nowIso());
  }

  function lireJournal(boostId) {
    return db().prepare('SELECT id, action, detail, auteur, cree_le AS creeLe FROM boost_journal WHERE boost_id = ? ORDER BY id ASC')
      .all(Number(boostId))
      .map((r) => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null }));
  }

  // -- Rôles ----------------------------------------------------------------

  // Vrai si le compte figure comme collaborateur ACTIF dans la table Boost.
  // C'est la seule source de vérité du rôle : `users` n'en sait rien.
  function collaborateurActif(email) {
    const row = db().prepare('SELECT actif FROM boost_collaborateurs WHERE email = ?').get(normalise(email));
    return !!(row && row.actif);
  }

  // `users` est lu, jamais écrit. Le `role` renvoyé est CALCULÉ au vol : il
  // n'existe nulle part en base, et un compte qui n'a jamais croisé le Boost
  // ressort naturellement en `client` sans qu'aucune ligne n'ait été créée.
  function lireUtilisateur(email) {
    const mail = normalise(email);
    const u = db().prepare('SELECT email, prenom FROM users WHERE email = ?').get(mail);
    if (!u) return null;
    return {
      email: u.email,
      prenom: u.prenom || '',
      role: collaborateurActif(mail) ? ROLE_COLLABORATEUR : ROLE_CLIENT,
    };
  }

  // Un compte existe d'abord (email + PIN, inscription normale), puis l'admin le
  // désigne comme collaborateur. On ne crée JAMAIS de compte ici, et on ne
  // modifie JAMAIS celui qui existe : l'écriture va dans boost_collaborateurs.
  function definirRole(email, role, auteur) {
    if (!ROLES.includes(role)) return err(400, 'Rôle inconnu.');
    const mail = normalise(email);
    const u = lireUtilisateur(mail);
    if (!u) return err(404, 'Ce compte n\'existe pas encore : la personne doit d\'abord créer son espace (email + code PIN).');
    // Repasser un collaborateur en client lui retire de fait tout accès Boost ;
    // ses dossiers restent attribués mais deviennent illisibles pour lui. La
    // ligne est conservée (actif = 0) pour garder la date et l'auteur du retrait.
    const actif = role === ROLE_COLLABORATEUR ? 1 : 0;
    db().prepare(`INSERT INTO boost_collaborateurs (email, actif, cree_le, maj_le, maj_par)
                  VALUES (?, ?, ?, ?, ?)
                  ON CONFLICT(email) DO UPDATE SET actif = excluded.actif,
                    maj_le = excluded.maj_le, maj_par = excluded.maj_par`)
      .run(mail, actif, nowIso(), nowIso(), normalise(auteur) || null);
    return ok({ collaborateur: lireUtilisateur(mail) });
  }

  const estCollaborateur = (u) => !!u && u.role === ROLE_COLLABORATEUR;

  // -- Certification --------------------------------------------------------

  function lireCertification(email) {
    const mail = normalise(email);
    const row = db().prepare('SELECT * FROM boost_certifications WHERE email = ?').get(mail);
    if (row) {
      return {
        email: row.email,
        statut: row.statut,
        dateCertification: row.date_certification,
        evaluateur: row.evaluateur,
        scoreQcm: row.score_qcm,
        resultatPratique: row.resultat_pratique,
        commentaire: row.commentaire,
        majLe: row.maj_le,
        majPar: row.maj_par,
      };
    }
    // Absence de ligne = non certifié. Pas de "null" à interpréter côté appelant :
    // c'est exactement ce genre de trou qui finit par valoir un accès accordé.
    return { email: mail, statut: CERT_NON, dateCertification: null, evaluateur: null,
      scoreQcm: null, resultatPratique: null, commentaire: null, majLe: null, majPar: null };
  }

  // LE point de contrôle unique : est-ce que ce compte peut porter des dossiers
  // Boost ? Collaborateur ET certifié. Relu à CHAQUE requête, jamais mis en
  // cache : retirer une certification doit fermer l'accès dans la seconde, sans
  // avoir à retoucher les attributions déjà faites.
  function estCoachCertifie(email) {
    const u = lireUtilisateur(email);
    if (!estCollaborateur(u)) return false;
    return lireCertification(email).statut === CERT_OK;
  }

  function definirCertification(email, donnees, auteur) {
    const mail = normalise(email);
    const u = lireUtilisateur(mail);
    if (!u) return err(404, 'Compte introuvable.');
    if (!estCollaborateur(u)) return err(409, 'Ce compte n\'est pas un collaborateur : désigne-le d\'abord comme tel.');

    const statut = String(donnees.statut || '').trim();
    if (!CERT_STATUTS.includes(statut)) return err(400, 'Statut de certification inconnu.');

    const evaluateur = String(donnees.evaluateur || '').trim().slice(0, 120);
    let date = donnees.dateCertification;
    const score = donnees.scoreQcm === null || donnees.scoreQcm === undefined || donnees.scoreQcm === ''
      ? null : Number(donnees.scoreQcm);
    const pratique = donnees.resultatPratique ? String(donnees.resultatPratique).trim() : null;

    if (score !== null && (!Number.isFinite(score) || score < 0 || score > 100)) {
      return err(400, 'Le score QCM doit être compris entre 0 et 100.');
    }
    if (pratique && !PRATIQUE_RESULTATS.includes(pratique)) {
      return err(400, 'Résultat pratique inconnu.');
    }
    // Une certification qui ouvre des dossiers clients ne s'accorde pas sans
    // dire QUI l'a prononcée ni QUAND : sinon la trace ne vaut rien le jour où
    // on doit répondre de l'habilitation d'un coach.
    if (statut === CERT_OK) {
      if (!evaluateur) return err(400, 'Un évaluateur est requis pour certifier.');
      if (!date) date = aujourdhui();
      if (!jourValide(date)) return err(400, 'Date de certification invalide (AAAA-MM-JJ).');
    }
    if (date && !jourValide(date)) return err(400, 'Date de certification invalide (AAAA-MM-JJ).');

    db().prepare(`INSERT INTO boost_certifications
        (email, statut, date_certification, evaluateur, score_qcm, resultat_pratique, commentaire, maj_le, maj_par)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET statut = excluded.statut,
          date_certification = excluded.date_certification, evaluateur = excluded.evaluateur,
          score_qcm = excluded.score_qcm, resultat_pratique = excluded.resultat_pratique,
          commentaire = excluded.commentaire, maj_le = excluded.maj_le, maj_par = excluded.maj_par`)
      .run(mail, statut, date || null, evaluateur || null, score, pratique,
        String(donnees.commentaire || '').slice(0, 1000) || null, nowIso(), normalise(auteur) || null);

    return ok({ certification: lireCertification(mail) });
  }

  // Report d'une réussite au QCM théorique de l'Academy. Volontairement ÉTROIT :
  // il n'écrit que le score et l'avancement, et n'ouvre jamais la certification.
  //
  //  ⚠️ CE N'EST PAS UNE CERTIFICATION. Réussir le QCM valide LA THÉORIE et rend
  //  éligible à l'évaluation pratique. Le statut `certifie` reste prononcé par
  //  un humain via definirCertification(), avec un évaluateur et une date — ce
  //  que l'Academy ne peut pas fournir et n'a pas à décider.
  //
  //  Trois interdits, chacun pour une raison qui s'est déjà vue ailleurs :
  //   - un coach DÉJÀ CERTIFIÉ n'est jamais rétrogradé. Passer sa ligne en
  //     « en_cours » lui fermerait ses dossiers clients dans la seconde ;
  //   - une SUSPENSION n'est pas levée par un QCM. C'est une décision
  //     d'administration ; la relever depuis une réussite automatique viderait
  //     la suspension de son sens ;
  //   - le score enregistré ne BAISSE jamais. Repasser le QCM pour s'entraîner
  //     ne doit pas dégrader une trace déjà écrite.
  //
  //  Les autres colonnes (évaluateur, date, résultat pratique, commentaire) ne
  //  sont pas touchées : la mise à jour les nomme une par une plutôt que de
  //  réécrire la ligne entière, qui les effacerait.
  function enregistrerQcmTheorie(email, scoreQcm, auteur) {
    const mail = normalise(email);
    const u = lireUtilisateur(mail);
    if (!u) return err(404, 'Compte introuvable.');
    if (!estCollaborateur(u)) return err(409, 'Ce compte n\'est pas un collaborateur.');

    const score = Number(scoreQcm);
    if (!Number.isFinite(score) || score < 0 || score > 100) return err(400, 'Le score QCM doit être compris entre 0 et 100.');

    const actuelle = lireCertification(mail);
    // Seul le passage depuis « non certifié » est automatique. Tout autre statut
    // a été posé par quelqu'un : on le laisse en place.
    const statut = actuelle.statut === CERT_NON ? CERT_EN_COURS : actuelle.statut;
    const meilleur = actuelle.scoreQcm === null || actuelle.scoreQcm === undefined
      ? Math.round(score) : Math.max(Number(actuelle.scoreQcm), Math.round(score));

    const existe = db().prepare('SELECT email FROM boost_certifications WHERE email = ?').get(mail);
    if (existe) {
      db().prepare('UPDATE boost_certifications SET statut = ?, score_qcm = ?, maj_le = ?, maj_par = ? WHERE email = ?')
        .run(statut, meilleur, nowIso(), normalise(auteur) || null, mail);
    } else {
      db().prepare(`INSERT INTO boost_certifications (email, statut, score_qcm, maj_le, maj_par) VALUES (?, ?, ?, ?, ?)`)
        .run(mail, statut, meilleur, nowIso(), normalise(auteur) || null);
    }
    return ok({ certification: lireCertification(mail) });
  }

  // La jointure part de la table Boost, pas de `users` : c'est le Boost qui sait
  // qui sont ses collaborateurs, le compte n'apporte que le prénom.
  //
  // `tous` inclut les collaborateurs désactivés : l'écran d'administration doit
  // pouvoir les RÉACTIVER, ce qui suppose de les voir. Les autres appelants ne
  // veulent que les actifs, d'où le défaut restrictif.
  function listerCollaborateurs({ tous = false } = {}) {
    return db().prepare(`SELECT c.email AS email, u.prenom AS prenom, c.actif AS actif,
                                c.maj_le AS majLe, c.maj_par AS majPar
                         FROM boost_collaborateurs c
                         JOIN users u ON u.email = c.email
                         ${tous ? '' : 'WHERE c.actif = 1'}
                         ORDER BY c.actif DESC, c.email ASC`)
      .all()
      .map((u) => {
        const cert = lireCertification(u.email);
        const actif = !!u.actif;
        return {
          email: u.email,
          prenom: u.prenom || '',
          role: actif ? ROLE_COLLABORATEUR : ROLE_CLIENT,
          actif,
          majLe: u.majLe,
          majPar: u.majPar,
          certification: cert,
          // LA colonne qui décide de tout dans l'écran d'attribution : être
          // certifié ne suffit pas, encore faut-il être actif.
          peutSuivre: actif && cert.statut === CERT_OK,
          nbClients: db().prepare(`SELECT COUNT(*) AS n FROM boosts WHERE coach_email = ? AND statut IN (${STATUTS_ACTIFS.map(() => '?').join(',')})`)
            .get(u.email, ...STATUTS_ACTIFS).n,
        };
      });
  }

  // Clients à qui l'admin peut ouvrir un Boost. On part de `users` (lecture
  // seule) en retirant les collaborateurs actifs, qui ne peuvent pas être
  // clients de leur propre dispositif. Le drapeau `boostActif` évite à l'admin
  // de choisir un client qui se verrait refuser à l'étape suivante : le refus
  // existe côté serveur, mais le faire découvrir après coup est une mauvaise
  // manière de dire non.
  function listerClients({ q = '', limite = 50 } = {}) {
    const filtre = String(q || '').trim().toLowerCase();
    const max = Math.max(1, Math.min(200, Number(limite) || 50));
    const rows = db().prepare(`SELECT u.email AS email, u.prenom AS prenom
                               FROM users u
                               WHERE u.email NOT IN (SELECT email FROM boost_collaborateurs WHERE actif = 1)
                                 AND (? = '' OR LOWER(u.email) LIKE ? OR LOWER(u.prenom) LIKE ?)
                               ORDER BY u.email ASC
                               LIMIT ?`)
      .all(filtre, '%' + filtre + '%', '%' + filtre + '%', max);
    return rows.map((u) => {
      const actif = boostActifDuClient(u.email);
      return {
        email: u.email,
        prenom: u.prenom || '',
        boostActif: actif ? { id: actif.id, statut: actif.statut } : null,
      };
    });
  }

  // -- Lecture d'un Boost ---------------------------------------------------

  function etapesDe(boostId) {
    return db().prepare('SELECT numero, statut, validee_le AS valideeLe, validee_par AS valideePar FROM boost_etapes WHERE boost_id = ? ORDER BY numero ASC')
      .all(Number(boostId));
  }

  function prolongationsDe(boostId) {
    return db().prepare('SELECT id, jours, motif, auteur, cree_le AS creeLe, echeance_avant AS echeanceAvant, echeance_apres AS echeanceApres FROM boost_prolongations WHERE boost_id = ? ORDER BY id ASC')
      .all(Number(boostId))
      .map((p) => ({ ...p, semaines: enSemaines(p.jours) }));
  }

  // Matérialise l'expiration : un Boost en cours dont l'échéance est passée
  // DEVIENT expiré, en base, avec une ligne de journal. On ne se contente pas de
  // l'afficher comme expiré — sinon la place resterait occupée et le client ne
  // pourrait pas racheter un Boost.
  function rafraichirExpiration(boost, jour) {
    if (!boost || boost.statut !== STATUT_EN_COURS || !boost.echeance_le) return boost;
    const restant = joursRestants(boost.echeance_le, jour || aujourdhui());
    if (restant === null || restant >= 0) return boost;
    db().prepare('UPDATE boosts SET statut = ? WHERE id = ? AND statut = ?')
      .run(STATUT_EXPIRE, boost.id, STATUT_EN_COURS);
    journaliser(boost.id, 'expiration', { echeanceLe: boost.echeance_le, constateLe: jour || aujourdhui() }, null);
    return { ...boost, statut: STATUT_EXPIRE };
  }

  function prenomDe(email) {
    if (!email) return '';
    const u = db().prepare('SELECT prenom FROM users WHERE email = ?').get(normalise(email));
    return (u && u.prenom) || '';
  }

  function ligneBoost(id) {
    return db().prepare('SELECT * FROM boosts WHERE id = ?').get(Number(id)) || null;
  }

  function vueBoost(row, jour) {
    if (!row) return null;
    const b = rafraichirExpiration(row, jour);
    const etapes = etapesDe(b.id);
    const validees = etapes.filter((e) => e.statut === 'validee').length;
    return {
      id: b.id,
      clientEmail: b.client_email,
      // Le prénom accompagne toujours l'email : une liste d'administration qui
      // n'affiche que des adresses oblige à les déchiffrer une par une.
      clientPrenom: prenomDe(b.client_email),
      coachEmail: b.coach_email,
      coachPrenom: prenomDe(b.coach_email),
      statut: b.statut,
      actif: STATUTS_ACTIFS.includes(b.statut),
      demarreLe: b.demarre_le,
      echeanceLe: b.echeance_le,
      joursRestants: b.echeance_le ? joursRestants(b.echeance_le, jour) : null,
      semainesBase: b.semaines_base,
      joursProlongation: b.jours_prolongation,
      semainesProlongation: enSemaines(b.jours_prolongation),
      etapesValidees: validees,
      etapesTotal: ETAPES_TOTAL,
      // L'Étape « en cours » est la première non validée. 12/12 -> null.
      etapeCourante: validees >= ETAPES_TOTAL ? null : validees + 1,
      etapes,
      prolongations: prolongationsDe(b.id),
      termineLe: b.termine_le,
      interrompuLe: b.interrompu_le,
      motifInterruption: b.motif_interruption,
      referenceExterne: b.reference_externe,
      creeLe: b.cree_le,
      creePar: b.cree_par,
    };
  }

  function lireBoost(id, jour) { return vueBoost(ligneBoost(id), jour); }

  function boostActifDuClient(email, jour) {
    const rows = db().prepare(`SELECT * FROM boosts WHERE client_email = ? AND statut IN (${STATUTS_ACTIFS.map(() => '?').join(',')})`)
      .all(normalise(email), ...STATUTS_ACTIFS);
    // Passer par vueBoost fait tomber au passage un Boost dont l'échéance vient
    // d'être franchie : il ne comptera plus comme actif au prochain appel.
    for (const r of rows) {
      const v = vueBoost(r, jour);
      if (v && v.actif) return v;
    }
    return null;
  }

  function dossierDuClient(email, jour) {
    const rows = db().prepare('SELECT * FROM boosts WHERE client_email = ? ORDER BY id DESC').all(normalise(email));
    const tous = rows.map((r) => vueBoost(r, jour));
    return { actuel: tous.find((b) => b.actif) || null, historique: tous.filter((b) => !b.actif) };
  }

  // Les dossiers d'un coach, RANGÉS PAR URGENCE et non par date de création :
  // « À démarrer » en tête (personne n'attend plus que ces clients-là), puis
  // « en cours », puis les dossiers clos. C'est trié ici et non côté écran pour
  // que l'ordre soit une règle du dispositif, testable, et pas une décision
  // d'affichage qu'on redécouvrirait à chaque nouvelle interface.
  const RANG_STATUT = { [STATUT_A_DEMARRER]: 0, [STATUT_EN_COURS]: 1, [STATUT_EXPIRE]: 2, [STATUT_INTERROMPU]: 3, [STATUT_TERMINE]: 4 };
  function boostsDuCoach(email, jour) {
    return db().prepare('SELECT * FROM boosts WHERE coach_email = ? ORDER BY id DESC')
      .all(normalise(email))
      .map((r) => vueBoost(r, jour))
      .sort((a, b) => (RANG_STATUT[a.statut] - RANG_STATUT[b.statut]) || (b.id - a.id));
  }

  function listerBoosts(jour) {
    return db().prepare('SELECT * FROM boosts ORDER BY id DESC').all().map((r) => vueBoost(r, jour));
  }

  // -- Écritures ------------------------------------------------------------

  function creerBoostPour({ clientEmail, coachEmail, referenceExterne }, auteur, jour) {
    const client = lireUtilisateur(clientEmail);
    if (!client) return err(404, 'Client introuvable : il doit d\'abord créer son espace.');
    if (client.role !== ROLE_CLIENT) return err(409, 'Ce compte est un collaborateur : il ne peut pas recevoir un Boost.');

    // Arbitrage n°4 : un seul Boost actif. Le contrôle est ici pour rendre un
    // message clair ; l'index unique partiel reste le garde-fou de dernier recours.
    const dejaActif = boostActifDuClient(clientEmail, jour);
    if (dejaActif) {
      return err(409, 'Ce client a déjà un Boost en cours. Il pourra en racheter un une fois celui-ci terminé, expiré ou interrompu.',
        { boostId: dejaActif.id, statut: dejaActif.statut });
    }

    let coach = null;
    if (coachEmail) {
      coach = normalise(coachEmail);
      if (!estCoachCertifie(coach)) {
        return err(409, 'Ce collaborateur n\'est pas un Coach Nutrition certifié : impossible de lui attribuer un client.');
      }
    }

    const d = db();
    const creer = d.transaction(() => {
      const info = d.prepare(`INSERT INTO boosts (client_email, coach_email, statut, semaines_base, reference_externe, cree_le, cree_par)
                              VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(normalise(clientEmail), coach, STATUT_A_DEMARRER, SEMAINES_BASE,
          String(referenceExterne || '').slice(0, 200) || null, nowIso(), normalise(auteur) || null);
      const id = Number(info.lastInsertRowid);
      // Les 12 Étapes existent dès la création : le parcours est le même pour
      // tout le monde, il ne se fabrique pas au fil de l'eau.
      const insEtape = d.prepare('INSERT INTO boost_etapes (boost_id, numero, statut) VALUES (?, ?, ?)');
      for (let n = 1; n <= ETAPES_TOTAL; n++) insEtape.run(id, n, 'a_venir');
      return id;
    });

    let id;
    try {
      id = creer();
    } catch (e) {
      if (String(e && e.message).includes('UNIQUE') || String(e && e.code).includes('CONSTRAINT')) {
        return err(409, 'Ce client a déjà un Boost en cours.');
      }
      throw e;
    }
    journaliser(id, 'creation', { clientEmail: normalise(clientEmail), coachEmail: coach, referenceExterne: referenceExterne || null }, auteur);
    if (coach) journaliser(id, 'attribution', { coachEmail: coach }, auteur);
    return ok({ boost: lireBoost(id, jour) }, 201);
  }

  function attribuerCoach(boostId, coachEmail, auteur, jour) {
    const row = ligneBoost(boostId);
    if (!row) return err(404, 'Boost introuvable.');
    const b = rafraichirExpiration(row, jour);
    if (!STATUTS_ACTIFS.includes(b.statut)) {
      return err(409, 'Ce Boost n\'est plus actif : aucune attribution possible.');
    }
    const coach = normalise(coachEmail);
    // Le cœur de l'arbitrage n°4 sur les droits : un collaborateur NON certifié
    // ne reçoit aucun dossier. Le refus est ici, à l'attribution, ET à la
    // lecture (cf. estCoachCertifie relu à chaque requête).
    if (!estCoachCertifie(coach)) {
      return err(409, 'Ce collaborateur n\'est pas un Coach Nutrition certifié : impossible de lui attribuer un client.');
    }
    const avant = b.coach_email;
    db().prepare('UPDATE boosts SET coach_email = ? WHERE id = ?').run(coach, b.id);
    journaliser(b.id, 'attribution', { avant: avant || null, apres: coach }, auteur);
    return ok({ boost: lireBoost(b.id, jour) });
  }

  // Validation d'une Étape. Réservée au Coach Nutrition attribué (arbitrage n°2 :
  // l'admin administre le Boost, il n'anime pas le suivi) — le routeur applique
  // ce filtre, on revalide ici l'état du dossier.
  function validerEtape(boostId, numero, auteur, jour) {
    const n = Number(numero);
    if (!Number.isInteger(n) || n < 1 || n > ETAPES_TOTAL) {
      return err(400, `Numéro d'étape invalide (1 à ${ETAPES_TOTAL}).`);
    }
    const row = ligneBoost(boostId);
    if (!row) return err(404, 'Boost introuvable.');
    const b = rafraichirExpiration(row, jour);
    if (!STATUTS_ACTIFS.includes(b.statut)) {
      const raison = b.statut === STATUT_EXPIRE
        ? 'Ce Boost est expiré : une prolongation exceptionnelle est nécessaire pour le reprendre.'
        : 'Ce Boost n\'est plus actif.';
      return err(409, raison, { statut: b.statut });
    }
    const etapes = etapesDe(b.id);
    const etape = etapes.find((e) => e.numero === n);
    if (!etape) return err(404, 'Étape introuvable.');
    if (etape.statut === 'validee') return err(409, `L'Étape ${n}/${ETAPES_TOTAL} est déjà validée.`);
    // Ordre strict : on ne saute pas d'Étape. Un dossier où l'Étape 7 serait
    // validée sans la 3 ne raconterait plus rien de l'accompagnement réel.
    if (n > 1) {
      const precedente = etapes.find((e) => e.numero === n - 1);
      if (!precedente || precedente.statut !== 'validee') {
        return err(409, `L'Étape ${n - 1}/${ETAPES_TOTAL} doit être validée avant l'Étape ${n}/${ETAPES_TOTAL}.`);
      }
    }

    const d = db();
    const jourValidation = jourValide(jour) ? jour : aujourdhui();
    d.transaction(() => {
      d.prepare('UPDATE boost_etapes SET statut = ?, validee_le = ?, validee_par = ? WHERE boost_id = ? AND numero = ?')
        .run('validee', jourValidation, normalise(auteur) || null, b.id, n);

      // Règle des 16 semaines : c'est l'Étape 1 qui arme le compte à rebours.
      if (n === 1) {
        const echeance = calculerEcheance(jourValidation, b.semaines_base, b.jours_prolongation);
        d.prepare('UPDATE boosts SET statut = ?, demarre_le = ?, echeance_le = ? WHERE id = ?')
          .run(STATUT_EN_COURS, jourValidation, echeance, b.id);
      }
      if (n === ETAPES_TOTAL) {
        d.prepare('UPDATE boosts SET statut = ?, termine_le = ? WHERE id = ?')
          .run(STATUT_TERMINE, jourValidation, b.id);
      }
    })();

    journaliser(b.id, 'etape_validee', { numero: n, jour: jourValidation }, auteur);
    if (n === 1) journaliser(b.id, 'demarrage', { demarreLe: jourValidation, echeanceLe: calculerEcheance(jourValidation, b.semaines_base, b.jours_prolongation) }, auteur);
    if (n === ETAPES_TOTAL) journaliser(b.id, 'terminaison', { termineLe: jourValidation }, auteur);

    return ok({ boost: lireBoost(b.id, jour) });
  }

  // Prolongation exceptionnelle. Pas de plafond de nombre (arbitrage n°3), mais
  // aucune ne passe sans motif ni auteur : c'est ce qui la garde exceptionnelle.
  function prolonger(boostId, { semaines, jours, nouvelleEcheance, motif }, auteur, jour) {
    const texte = String(motif || '').trim();
    if (texte.length < 10) {
      return err(400, 'Un motif explicite est obligatoire pour prolonger un Boost (10 caractères minimum).');
    }
    if (!auteur) return err(400, 'Auteur manquant.');
    // Une seule façon d'exprimer la prolongation à la fois : accepter deux
    // expressions contradictoires obligerait à en privilégier une en silence.
    const exprimees = [semaines, jours, nouvelleEcheance].filter((v) => v !== undefined && v !== null && v !== '');
    if (exprimees.length === 0) {
      return err(400, 'Indique une nouvelle date limite, ou une durée à ajouter.');
    }
    if (exprimees.length > 1) {
      return err(400, 'Choisis soit une nouvelle date limite, soit une durée — pas les deux.');
    }
    if (nouvelleEcheance !== undefined && nouvelleEcheance !== null && nouvelleEcheance !== ''
        && !jourValide(nouvelleEcheance)) {
      return err(400, 'Nouvelle date limite invalide (AAAA-MM-JJ).');
    }

    const row = ligneBoost(boostId);
    if (!row) return err(404, 'Boost introuvable.');
    const b = rafraichirExpiration(row, jour);
    // Prolonger a un sens sur un Boost en cours ET sur un Boost expiré (c'est
    // même là qu'il en a le plus : rouvrir un accompagnement dépassé). En
    // revanche on ne ressuscite pas un Boost terminé ou interrompu : ce serait
    // effacer une décision, pas prolonger un accompagnement.
    if (![STATUT_EN_COURS, STATUT_EXPIRE].includes(b.statut)) {
      return err(409, b.statut === STATUT_A_DEMARRER
        ? 'Ce Boost n\'a pas encore démarré : les 16 semaines ne courent pas, il n\'y a rien à prolonger.'
        : 'Seul un Boost en cours ou expiré peut être prolongé.', { statut: b.statut });
    }
    if (!b.demarre_le) return err(409, 'Ce Boost n\'a pas de date de démarrage.');

    // Tout se ramène à un CUMUL DE JOURS accordés depuis le départ. Le calcul
    // repart toujours de l'Étape 1 : une prolongation ne s'empile pas sur une
    // échéance déjà repoussée, elle redéfinit la durée totale accordée. C'est ce
    // qui rend une date limite choisie à la main exacte, sans dérive.
    const cumulAvant = Number(b.jours_prolongation || 0);
    const baseJours = Number(b.semaines_base || SEMAINES_BASE) * JOURS_PAR_SEMAINE;
    let cumul;
    if (nouvelleEcheance) {
      cumul = joursEntre(b.demarre_le, nouvelleEcheance) - baseJours;
    } else if (jours !== undefined && jours !== null && jours !== '') {
      cumul = cumulAvant + Number(jours);
    } else {
      cumul = cumulAvant + Number(semaines) * JOURS_PAR_SEMAINE;
    }
    if (!Number.isInteger(cumul)) return err(400, 'Durée de prolongation invalide.');

    const ajoutes = cumul - cumulAvant;
    if (ajoutes <= 0) {
      return err(400, nouvelleEcheance
        ? `La nouvelle date limite doit être postérieure à l'actuelle (${b.echeance_le}).`
        : 'La prolongation doit ajouter au moins un jour.');
    }
    // Plafond par prolongation : une saisie du type « 2027 » au lieu de « 2026 »
    // ne doit pas accorder deux ans d'accompagnement sans que personne ne bronche.
    if (ajoutes > 365) {
      return err(400, 'Une prolongation ne peut pas dépasser 365 jours d\'un coup.');
    }

    const echeanceAvant = b.echeance_le;
    const echeanceApres = calculerEcheance(b.demarre_le, b.semaines_base, cumul);
    const d = db();
    d.transaction(() => {
      d.prepare('UPDATE boosts SET jours_prolongation = ?, echeance_le = ?, statut = ? WHERE id = ?')
        .run(cumul, echeanceApres, STATUT_EN_COURS, b.id);
      d.prepare('INSERT INTO boost_prolongations (boost_id, jours, motif, auteur, cree_le, echeance_avant, echeance_apres) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(b.id, ajoutes, texte.slice(0, 1000), normalise(auteur), nowIso(), echeanceAvant, echeanceApres);
    })();
    journaliser(b.id, 'prolongation', {
      jours: ajoutes, semaines: enSemaines(ajoutes), motif: texte.slice(0, 1000),
      cumulJours: cumul, echeanceAvant, echeanceApres, statutAvant: b.statut,
    }, auteur);

    // Le statut est repassé « en cours », mais lireBoost rejoue l'expiration :
    // une prolongation qui laisse l'échéance dans le passé n'aura donc rien
    // ressuscité, et la réponse le dit franchement au lieu de l'afficher vert.
    return ok({ boost: lireBoost(b.id, jour) });
  }

  function interrompre(boostId, motif, auteur, jour) {
    const texte = String(motif || '').trim();
    if (texte.length < 3) return err(400, 'Un motif est requis pour interrompre un Boost.');
    const row = ligneBoost(boostId);
    if (!row) return err(404, 'Boost introuvable.');
    const b = rafraichirExpiration(row, jour);
    if ([STATUT_TERMINE, STATUT_INTERROMPU].includes(b.statut)) {
      return err(409, 'Ce Boost est déjà clos.', { statut: b.statut });
    }
    const quand = jourValide(jour) ? jour : aujourdhui();
    db().prepare('UPDATE boosts SET statut = ?, interrompu_le = ?, motif_interruption = ? WHERE id = ?')
      .run(STATUT_INTERROMPU, quand, texte.slice(0, 1000), b.id);
    journaliser(b.id, 'interruption', { motif: texte.slice(0, 1000), jour: quand, statutAvant: b.statut }, auteur);
    return ok({ boost: lireBoost(b.id, jour) });
  }

  return {
    assurerSchema,
    // rôles & certification
    lireUtilisateur, definirRole, estCollaborateur, listerCollaborateurs, listerClients,
    lireCertification, definirCertification, estCoachCertifie, enregistrerQcmTheorie,
    // lecture
    lireBoost, listerBoosts, boostActifDuClient, dossierDuClient, boostsDuCoach, lireJournal,
    // écriture
    creerBoostPour, attribuerCoach, validerEtape, prolonger, interrompre,
    // Collaborateurs pour lib/boostSeances.js. Exposés à dessein : le module
    // des séances doit lire un dossier, constater son expiration et écrire au
    // journal — sans réécrire ces règles de son côté, ce qui les ferait diverger.
    ligneBoost, rafraichirExpiration, journaliser,
  };
}

module.exports = {
  createBoost,
  ETAPES_TOTAL, SEMAINES_BASE, JOURS_PAR_SEMAINE,
  STATUT_A_DEMARRER, STATUT_EN_COURS, STATUT_TERMINE, STATUT_EXPIRE, STATUT_INTERROMPU,
  STATUTS, STATUTS_ACTIFS,
  CERT_NON, CERT_EN_COURS, CERT_OK, CERT_SUSPENDU, CERT_STATUTS, PRATIQUE_RESULTATS,
  ROLE_CLIENT, ROLE_COLLABORATEUR, ROLES,
  calculerEcheance, joursRestants, ajouterJours, joursEntre,
  // Utilitaires purs partagés avec lib/boostSeances.js : les dupliquer les
  // ferait diverger le jour où l'un des deux modules change de convention.
  jourValide, aujourdhui, lireJson, err, ok,
};
