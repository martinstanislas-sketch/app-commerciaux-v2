'use strict';
// ============================================================================
//  MY COACH ACADEMY — certification finale (lot 4).
//
//  LE DERNIER MAILLON. Théorie validée, pratique validée : le collaborateur est
//  ÉLIGIBLE. Il n'est pas certifié pour autant — un administrateur délivre, et
//  ce geste-là ouvre les dossiers clients du Boost. C'est pour cette raison
//  qu'il ne tombe pas tout seul.
//
//  CINQ RÈGLES TIENNENT CE FICHIER :
//
//   1. LES PRÉREQUIS SE RELISENT À LA DÉLIVRANCE. Ils ne sont pas recalculés
//      ici : chaque lot répond de ce qu'il possède (le QCM pour la théorie, la
//      pratique pour la pratique). Les vérifier à l'affichage seulement
//      laisserait un appel direct passer devant.
//
//   2. L'ACADEMY EST LA SOURCE, LE BOOST EST LE REFLET. Le diplôme vit ici :
//      daté, signé, avec ses preuves recopiées. boost_certifications ne porte
//      que le DROIT COURANT — celui qu'on peut suspendre. Un diplôme ne
//      disparaît pas parce qu'on est suspendu, et une suspension levée ne
//      recrée pas un diplôme.
//
//   3. ON NE SUPPRIME RIEN. Retirer une certification écrit un retrait daté,
//      signé et MOTIVÉ sur la ligne ; redélivrer en écrit une nouvelle. Le
//      registre se lit comme un parcours, pas comme un état.
//
//   4. PERSONNE NE SE CERTIFIE SOI-MÊME. Un administrateur qui serait aussi
//      collaborateur ne peut pas se délivrer son propre titre.
//
//   5. LE MOTEUR NE CONNAÎT AUCUNE FORMATION. Il ne sait que lire un registre
//      (lib/academyFormations.js) et appliquer ce qu'il y trouve. « Coach
//      Nutrition » n'est écrit nulle part dans ce fichier.
// ============================================================================

const { err, ok, jourValide, aujourdhui } = require('./boost');

// Les détails de prérequis sont LUS PAR LE COLLABORATEUR : une date y sort en
// français, pas au format de stockage.
const enFrancais = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
};

const DELIVREE = 'delivree';
const RETIREE = 'retiree';

const SCHEMA_CERT = `
-- Le registre des diplômes. UNE LIGNE PAR DÉLIVRANCE, jamais mise à jour pour
-- en effacer une autre : un retrait renseigne ses colonnes sur la ligne
-- concernée, une nouvelle délivrance ajoute une ligne.
--
-- Nativement multi-formation : la colonne existe et l'index d'unicité porte sur
-- le couple. Une seule formation l'alimente aujourd'hui ; le jour où une
-- seconde arrivera, il n'y aura rien à migrer ici.
CREATE TABLE IF NOT EXISTS academy_certifications (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  formation     TEXT NOT NULL,
  statut        TEXT NOT NULL,          -- delivree | retiree
  -- Le JOUR du diplôme (AAAA-MM-JJ), qui n'est pas forcément celui de la
  -- saisie : on peut enregistrer lundi une certification prononcée vendredi.
  obtenue_le    TEXT NOT NULL,
  delivree_par  TEXT NOT NULL,
  delivree_le   TEXT NOT NULL,
  -- Preuves RECOPIÉES : un diplôme doit pouvoir se relire seul, des années
  -- plus tard, sans dépendre de données qui auront bougé.
  score_qcm     INTEGER,
  pratique_le   TEXT,
  pratique_par  TEXT,
  commentaire   TEXT,
  retiree_le    TEXT,
  retiree_par   TEXT,
  motif_retrait TEXT,
  maj_le        TEXT NOT NULL
);

-- LA protection contre les doublons, tenue par la base et non par du code :
-- au plus UNE certification active par couple (personne, formation). Les
-- lignes retirées ne comptent pas, donc redélivrer reste possible.
CREATE UNIQUE INDEX IF NOT EXISTS idx_academy_cert_active
  ON academy_certifications(email, formation) WHERE statut = 'delivree';
CREATE INDEX IF NOT EXISTS idx_academy_cert ON academy_certifications(email, id);
`;

// LES SEPT STATUTS DE LA LISTE UNIFIÉE. Ils ne sont ni stockés ni écrits : ce
// sont des NOMS donnés à des combinaisons déjà calculées ailleurs. En ajouter
// un huitième se fait ici et nulle part ailleurs.
//
// ⚠️ « théorie validée » N'EST PAS un statut : c'est le même moment que
// « pratique à réaliser », vu de l'autre côté. Deux libellés concurrents pour
// un seul état auraient obligé l'évaluateur à savoir lequel des deux compte.
const STATUTS_COACH = [
  'formation_en_cours',
  'pratique_a_realiser',
  'resultat_en_attente',
  'pratique_a_repasser',
  'pratique_validee',
  'certification_a_delivrer',
  'certifie',
];

// L'ordre de la liste dit CE QUI ATTEND UNE ACTION DE L'ÉVALUATEUR. Un dossier
// clos descend, un dossier qui l'attend remonte.
const RANG_STATUT = {
  certification_a_delivrer: 0,
  resultat_en_attente: 1,
  pratique_a_repasser: 2,
  pratique_a_realiser: 3,
  pratique_validee: 4,
  formation_en_cours: 5,
  certifie: 6,
};

function createAcademyCertifications({ getDb, nowIso, boost, qcm, pratique, formations, academy }) {
  const db = () => getDb();
  const normalise = (e) => String(e || '').trim().toLowerCase();

  const basesMigrees = new WeakSet();
  function assurerSchema() {
    const d = db();
    if (basesMigrees.has(d)) return true;
    // Les prérequis vivent dans les lots 2 et 3 : leurs tables doivent exister.
    pratique.assurerSchema();
    formations.assurerSchema();
    d.exec(SCHEMA_CERT);
    basesMigrees.add(d);
    return true;
  }

  // -- Lecture ---------------------------------------------------------------

  const prenomDe = (email) => {
    const u = db().prepare('SELECT prenom FROM users WHERE email = ?').get(normalise(email));
    return u && u.prenom ? u.prenom : '';
  };

  const vue = (r) => (r ? {
    id: r.id,
    email: r.email,
    formation: r.formation,
    statut: r.statut,
    active: r.statut === DELIVREE,
    obtenueLe: r.obtenue_le,
    delivreePar: r.delivree_par,
    delivreeLe: r.delivree_le,
    scoreQcm: r.score_qcm,
    pratiqueLe: r.pratique_le,
    pratiquePar: r.pratique_par,
    commentaire: r.commentaire,
    retireeLe: r.retiree_le,
    retireePar: r.retiree_par,
    motifRetrait: r.motif_retrait,
  } : null);

  // LA question que le reste de l'application pose : « cette personne a-t-elle
  // un diplôme ACTIF pour cette formation ? ». Relue à chaque appel.
  function certificationActive(email, formationCle) {
    const f = formations.lire(formationCle || (formations.defaut() || {}).cle);
    if (!f) return null;
    // Cette fonction est LE point d'entrée du Boost dans l'Academy : il peut
    // l'appeler avant que quiconque ait ouvert /academy, donc avant que la
    // table existe. On s'assure du schéma ici (l'appel est mémorisé par base,
    // il ne coûte rien) — sans quoi une administration Boost toute fraîche
    // tomberait en erreur au lieu de répondre « pas de diplôme ».
    assurerSchema();
    return db().prepare('SELECT * FROM academy_certifications WHERE email = ? AND formation = ? AND statut = ?')
      .get(normalise(email), f.cle, DELIVREE) || null;
  }

  const estCertifie = (email, formationCle) => !!certificationActive(email, formationCle);

  function historiqueDe(email, formationCle) {
    const f = formations.lire(formationCle || (formations.defaut() || {}).cle);
    if (!f) return [];
    return db().prepare('SELECT * FROM academy_certifications WHERE email = ? AND formation = ? ORDER BY id DESC')
      .all(normalise(email), f.cle).map(vue);
  }

  // Les prérequis d'une formation ne sont plus du code : ils se DÉDUISENT de
  // ses drapeaux. La théorie est toujours demandée ; l'évaluation pratique ne
  // l'est que si la formation la réclame. Une formation qui ne l'impose pas ne
  // « saute » pas l'étape — elle ne la demande pas, et rien dans le moteur n'a
  // à connaître le cas particulier.
  function prerequisDe(mail, f) {
    const t = qcm.etatPour(mail, f.cle);
    const liste = [{
      cle: 'theorie',
      libelle: 'Évaluation théorique (QCM)',
      rempli: !!t.theorieValidee,
      detail: t.scoreValide === null || t.scoreValide === undefined ? null : 'score : ' + t.scoreValide + ' %',
    }];
    if (f.pratiqueObligatoire) {
      const p = pratique.etatPour(mail, f.cle);
      liste.push({
        cle: 'pratique',
        libelle: 'Évaluation pratique',
        rempli: !!p.validee,
        detail: p.valideeLe ? 'validée le ' + enFrancais(p.valideeLe) : null,
      });
    }
    return liste;
  }

  // Les PREUVES recopiées dans le diplôme au moment de la délivrance : il doit
  // pouvoir se relire seul, des années plus tard, sans dépendre de données qui
  // auront bougé.
  function preuvesDe(mail, f) {
    const t = qcm.etatPour(mail, f.cle);
    const validee = f.pratiqueObligatoire
      ? (pratique.etatPour(mail, f.cle).historique.find((h) => h.resultat === 'valide') || null)
      : null;
    return {
      scoreQcm: t.scoreValide === undefined ? null : t.scoreValide,
      pratiqueLe: validee ? (validee.dateEvaluation || validee.decideLe) : null,
      pratiquePar: validee ? validee.evaluateur : null,
    };
  }

  // L'état d'une formation pour une personne : les prérequis un par un, ce
  // qu'il manque, et le diplôme s'il existe. Tout est recalculé.
  function etatFormation(email, f) {
    const mail = normalise(email);
    const prerequis = prerequisDe(mail, f);
    const manquants = prerequis.filter((p) => !p.rempli);
    const active = certificationActive(mail, f.cle);
    const collaborateur = boost.estCollaborateur(boost.lireUtilisateur(mail));

    // UNE FORMATION QUI NE CERTIFIE PAS n'a pas d'éligible ni de certifié : son
    // parcours est en cours, ou terminé. On ne fabrique pas un diplôme fictif
    // pour faire entrer le cas dans le même moule.
    if (!f.certificationActive) {
      return {
        formation: f.cle, libelle: f.libelle, titre: f.titre,
        certificationActive: false, pratiqueObligatoire: !!f.pratiqueObligatoire,
        prerequis, manquants: manquants.map((p) => p.cle),
        eligible: false, certifie: false,
        etat: collaborateur && !manquants.length ? 'parcours_termine' : 'parcours_en_cours',
        certification: null, historique: [], collaborateur,
      };
    }

    let etat = 'non_eligible';
    if (active) etat = 'certifie';
    else if (collaborateur && !manquants.length) etat = 'eligible';

    return {
      formation: f.cle,
      libelle: f.libelle,
      titre: f.titre,
      certificationActive: true,
      pratiqueObligatoire: !!f.pratiqueObligatoire,
      prerequis,
      manquants: manquants.map((p) => p.cle),
      // ÉLIGIBLE N'EST PAS CERTIFIÉ. Les deux sont renvoyés côte à côte pour
      // que l'écran ne puisse pas les confondre.
      eligible: etat === 'eligible',
      certifie: etat === 'certifie',
      etat,
      certification: vue(active),
      historique: historiqueDe(mail, f.cle),
      collaborateur,
    };
  }

  const etatPour = (email, formationCle) => {
    const f = formations.lire(formationCle || (formations.defaut() || {}).cle);
    return f ? etatFormation(email, f) : null;
  };

  // Toutes les formations du registre : c'est ce que lit la carte du
  // collaborateur, et ce qui la rendra multi-formation sans y retoucher.
  const etatCompletPour = (email) =>
    formations.lister().map((l) => etatFormation(email, formations.lire(l.cle)));

  // -- Délivrance ------------------------------------------------------------

  function delivrer(cible, auteur, donnees) {
    const mail = normalise(cible);
    const moi = normalise(auteur);
    const d = donnees || {};

    const f = formations.lire(d.formation || (formations.defaut() || {}).cle);
    if (!f) return err(404, 'Formation inconnue.');

    if (!mail) return err(400, 'Collaborateur manquant.');
    // PERSONNE NE SE CERTIFIE SOI-MÊME. Un administrateur peut être
    // collaborateur ; sans ce refus, il lui suffirait d'ouvrir son propre écran.
    if (mail === moi) return err(403, 'On ne se délivre pas sa propre certification.', { autoCertification: true });

    const u = boost.lireUtilisateur(mail);
    if (!u) return err(404, 'Collaborateur introuvable.');
    if (!boost.estCollaborateur(u)) return err(404, 'Collaborateur introuvable.');

    if (!f.certificationActive) {
      return err(409, 'Cette formation ne délivre pas de certification.', { sansCertification: true });
    }

    // LE CONTRÔLE QUI COMPTE : les prérequis sont relus ICI, à l'écriture. Les
    // vérifier seulement à l'affichage laisserait cette requête passer devant.
    const prerequis = prerequisDe(mail, f);
    const manquants = prerequis.filter((p) => !p.rempli);
    if (manquants.length) {
      return err(409, 'Prérequis non remplis : ' + manquants.map((p) => p.libelle).join(', ') + '.',
        { prerequisManquants: manquants.map((p) => p.cle), prerequis });
    }

    if (certificationActive(mail, f.cle)) {
      return err(409, 'Ce collaborateur est déjà certifié pour cette formation.',
        { dejaCertifie: true, certification: vue(certificationActive(mail, f.cle)) });
    }

    let date = d.obtenueLe ? String(d.obtenueLe).trim() : aujourdhui();
    if (!jourValide(date)) return err(400, 'Date de certification invalide (AAAA-MM-JJ).');

    const maintenant = nowIso();
    const preuves = preuvesDe(mail, f);
    const info = db().prepare(`INSERT INTO academy_certifications
        (email, formation, statut, obtenue_le, delivree_par, delivree_le,
         score_qcm, pratique_le, pratique_par, commentaire, maj_le)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(mail, f.cle, DELIVREE, date, moi, maintenant,
        preuves.scoreQcm === undefined ? null : preuves.scoreQcm,
        preuves.pratiqueLe || null, preuves.pratiquePar || null,
        d.commentaire ? String(d.commentaire).slice(0, 1000) : null, maintenant);

    // Le REFLET dans le Boost, pour les formations qui y ouvrent des droits.
    if (f.refletBoost) boost.enregistrerCertificationAcademy(mail, date, moi);

    return ok({ certification: vue(lireLigne(Number(info.lastInsertRowid))), etat: etatPour(mail, f.cle) }, 201);
  }

  const lireLigne = (id) => db().prepare('SELECT * FROM academy_certifications WHERE id = ?').get(Number(id)) || null;

  // -- Retrait ---------------------------------------------------------------

  // Retirer, c'est écrire un retrait — pas effacer une délivrance. La ligne
  // reste, avec sa date d'obtention, son délivreur et ses preuves ; elle gagne
  // la date, l'auteur et LE MOTIF du retrait. Sans motif, on ne saurait pas
  // dans six mois pourquoi quelqu'un a perdu son habilitation.
  function retirer(cible, auteur, donnees) {
    const mail = normalise(cible);
    const moi = normalise(auteur);
    const d = donnees || {};
    const f = formations.lire(d.formation || (formations.defaut() || {}).cle);
    if (!f) return err(404, 'Formation inconnue.');

    if (!f.certificationActive) {
      return err(409, 'Cette formation ne délivre pas de certification.', { sansCertification: true });
    }
    const motif = String(d.motif || '').trim();
    if (!motif) return err(400, 'Un motif est requis pour retirer une certification.', { motifRequis: true });

    const active = certificationActive(mail, f.cle);
    if (!active) return err(404, 'Aucune certification active pour ce collaborateur.');

    const maintenant = nowIso();
    db().prepare(`UPDATE academy_certifications SET statut = ?, retiree_le = ?, retiree_par = ?,
                    motif_retrait = ?, maj_le = ? WHERE id = ?`)
      .run(RETIREE, maintenant, moi, motif.slice(0, 1000), maintenant, active.id);

    // Le droit se ferme dans la seconde côté Boost.
    if (f.refletBoost) boost.retirerCertificationAcademy(mail, moi);

    return ok({ certification: vue(lireLigne(active.id)), etat: etatPour(mail, f.cle) });
  }

  // -- Vue de l'administrateur ----------------------------------------------

  // Trois listes, et surtout la troisième. Un écart entre l'Academy et le Boost
  // ne doit JAMAIS être masqué : c'est précisément ce qu'on veut voir.
  function listerAdmin(formationCle) {
    const f = formations.lire(formationCle || (formations.defaut() || {}).cle);
    if (!f) return { eligibles: [], certifies: [], ecarts: [] };

    if (!f.certificationActive) return { formation: f.cle, libelle: f.libelle, eligibles: [], certifies: [], ecarts: [] };

    const collaborateurs = boost.listerCollaborateurs();
    const eligibles = [];
    const certifies = [];
    const ecarts = [];

    for (const c of collaborateurs) {
      const e = etatFormation(c.email, f);
      const ligne = {
        email: c.email, prenom: c.prenom || '', etat: e.etat,
        prerequis: e.prerequis, manquants: e.manquants,
        certification: e.certification, nbCertifications: e.historique.length,
      };
      if (e.certifie) certifies.push(ligne);
      else if (e.eligible) eligibles.push(ligne);

      // Écart n°1 : diplôme actif ici, droit fermé là-bas.
      if (f.refletBoost && e.certifie) {
        const statutBoost = boost.lireCertification(c.email).statut;
        if (statutBoost !== 'certifie') {
          ecarts.push({
            email: c.email, prenom: c.prenom || '', academy: DELIVREE, boost: statutBoost,
            // Une suspension est une décision d'administration, pas une
            // anomalie : le diplôme reste, le droit est gelé. On le dit.
            anomalie: statutBoost !== 'suspendu',
            explication: statutBoost === 'suspendu'
              ? 'Certification délivrée par l\'Academy, droits suspendus dans le Boost.'
              : 'Certification délivrée par l\'Academy, mais le droit Boost a été modifié en dehors de l\'Academy.',
          });
        }
      }
      // Écart n°2 : droit ouvert là-bas sans diplôme ici. Depuis ce lot, la
      // porte est fermée : il ne peut s'agir que d'une certification prononcée
      // AVANT l'Academy. On l'affiche plutôt que de faire comme si de rien.
      if (f.refletBoost && !e.certifie) {
        const statutBoost = boost.lireCertification(c.email).statut;
        if (statutBoost === 'certifie') {
          ecarts.push({
            email: c.email, prenom: c.prenom || '', academy: 'aucune', boost: statutBoost,
            anomalie: true,
            explication: 'Certifié dans le Boost sans certification délivrée par l\'Academy (certification antérieure).',
          });
        }
      }
    }

    const rang = (l) => (l.prenom || l.email);
    eligibles.sort((a, b) => rang(a).localeCompare(rang(b)));
    certifies.sort((a, b) => rang(a).localeCompare(rang(b)));
    return { formation: f.cle, libelle: f.libelle, eligibles, certifies, ecarts };
  }

  // -- La liste unifiée de l'espace « Évaluer & certifier » -------------------
  //
  //  UN SEUL ÉCRAN POUR UN SEUL MÉTIER. Avant elle, suivre un coach demandait
  //  deux listes dans deux espaces sous deux droits : les éligibles à
  //  l'évaluation d'un côté, les éligibles à la certification de l'autre. Un
  //  coach qui n'avait pas encore validé sa théorie n'apparaissait nulle part.
  //
  //  CETTE FONCTION N'INVENTE AUCUNE RÈGLE. Elle COMPOSE ce que les lots
  //  précédents savent déjà dire — qcm.etatPour, pratique.etatPour,
  //  etatFormation, academy.formationPour — et se contente de leur donner un
  //  nom commun. C'est pour cela qu'elle vit ici : ce module est le seul à
  //  connaître déjà les quatre.
  //
  //  listerAdmin() reste intacte à côté : elle répond à une autre question
  //  (« où sont les écarts avec le Boost ? »), et rien ne gagnerait à les
  //  fondre.

  function statutCoach(p, e, f) {
    if (e.certifie) return 'certifie';
    if (e.eligible) return 'certification_a_delivrer';
    // Pratique acquise mais pas éligible : la formation ne certifie pas, ou un
    // autre prérequis manque. L'étape pratique n'en est pas moins terminée.
    if (f.pratiqueObligatoire && p.validee) return 'pratique_validee';
    if (p.etat === 'en_attente') return 'resultat_en_attente';
    if (p.etat === 'a_repasser') return 'pratique_a_repasser';
    // Théorie validée et rien d'engagé : c'est exactement « pratique à
    // réaliser ». Un formation sans pratique obligatoire ne passe jamais ici —
    // elle est éligible dès la théorie, donc traitée plus haut.
    if (p.theorieValidee) return 'pratique_a_realiser';
    return 'formation_en_cours';
  }

  function ligneCoach(c, f) {
    const p = pratique.etatPour(c.email, f.cle);
    const e = etatFormation(c.email, f);
    // La progression d'apprentissage est un CONFORT DE LECTURE : si le module
    // n'est pas branché, la ligne existe quand même, sans elle.
    let progression = null;
    if (academy && typeof academy.formationPour === 'function') {
      const fp = academy.formationPour(c.email, f.cle);
      progression = { total: fp.total, termines: fp.termines, pourcentage: fp.pourcentage };
    }
    return {
      email: c.email,
      prenom: c.prenom || '',
      statut: statutCoach(p, e, f),
      progression,
      theorieValidee: !!p.theorieValidee,
      scoreTheorie: p.scoreTheorie === undefined ? null : p.scoreTheorie,
      pratique: {
        etat: p.etat,
        validee: !!p.validee,
        valideeLe: p.valideeLe,
        close: !!p.close,
        enAttente: p.enAttente,
        derniere: p.derniere,
        nbTentatives: p.historique.length,
      },
      certification: {
        etat: e.etat,
        eligible: !!e.eligible,
        certifie: !!e.certifie,
        prerequis: e.prerequis,
        manquants: e.manquants,
        certification: e.certification,
        nbCertifications: e.historique.length,
      },
    };
  }

  function listerCoachs(formationCle) {
    const f = formations.lire(formationCle || (formations.defaut() || {}).cle);
    if (!f) return { formation: null, coachs: [] };
    const nom = (l) => (l.prenom || l.email);
    return {
      formation: f.cle,
      libelle: f.libelle,
      titre: f.titre,
      certificationActive: !!f.certificationActive,
      pratiqueObligatoire: !!f.pratiqueObligatoire,
      coachs: boost.listerCollaborateurs()
        .map((c) => ligneCoach(c, f))
        .sort((a, b) => (RANG_STATUT[a.statut] - RANG_STATUT[b.statut]) || nom(a).localeCompare(nom(b))),
    };
  }

  return {
    assurerSchema,
    formations: () => formations.lister(),
    etatPour, etatCompletPour, historiqueDe,
    certificationActive, estCertifie,
    delivrer, retirer, listerAdmin, listerCoachs,
  };
}

module.exports = { createAcademyCertifications, DELIVREE, RETIREE, STATUTS_COACH };
