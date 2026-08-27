'use strict';
// ============================================================================
//  MY COACH ACADEMY — administration des contenus (lot 6).
//
//  LE LOT 5 A RENDU L'AJOUT D'UNE FORMATION POSSIBLE PAR LES SEULES DONNÉES.
//  Il restait à l'ouvrir : les seules façons d'écrire un module, une vidéo ou
//  une question étaient le fichier d'amorçage et le SQL à la main. Ce fichier
//  est cette porte, et rien d'autre.
//
//  CE QU'IL N'EST PAS :
//   - un second moteur. Il n'invente aucune règle de parcours : le tirage, la
//     progression, le seuil, la certification restent où ils sont. Il écrit ce
//     qu'ils lisent ;
//   - une table de plus. Le schéma du lot 5 portait déjà `actif`, `ordre`,
//     `cle` et la colonne `formation`. Rien à ajouter, rien à altérer.
//
//  TROIS RÈGLES QU'IL TIENT, ET QU'UN ÉCRAN NE PEUT PAS TENIR À SA PLACE :
//
//   1. ON N'EFFACE JAMAIS. `academy_contenus` cascade sur `academy_vus` :
//      supprimer une vidéo effacerait le « terminé » de tous ceux qui l'ont
//      suivie. Archiver, c'est `actif = 0` — la ligne reste, l'historique aussi.
//
//   2. ON NE TRAVERSE JAMAIS UNE FORMATION. Un module, un contenu, une question
//      appartiennent à un parcours et n'en changent pas. Le cloisonnement du
//      lot 5 se perdrait par la porte de l'administration avant de se perdre
//      ailleurs.
//
//   3. ON NE PUBLIE PAS UN PARCOURS INFRANCHISSABLE. Une formation sans
//      contenu, avec une vidéo sans lien, ou dont la banque est plus courte que
//      son propre tirage, est une formation que personne ne peut terminer. Le
//      refus est explicite et nommé : `verifier()` dit CE QUI manque.
//
//  ⚠️ C'EST LE SEUL FICHIER DE L'APPLICATION QUI LAISSE SORTIR
//  `academy_choix.correct`. Il ne le fait que par `arbre()`, appelée par une
//  seule route, elle-même derrière exigeAdmin. Aucune autre lecture d'ici ne
//  porte le corrigé, et aucune route collaborateur n'appelle ce module.
// ============================================================================

const { err, ok } = require('./boost');
const { idYoutubeValide, TYPES, TYPE_VIDEO, TYPE_TEXTE } = require('./academy');

// Bornes de saisie, pas des valeurs métier.
const TITRE_MAX = 200;
const TEXTE_MAX = 20000;
const ENONCE_MAX = 1000;
const CHOIX_MAX = 500;
const DUREE_MAX = 999;

// Une question corrigeable demande au moins deux choix, au moins une bonne
// réponse et au moins une mauvaise. C'est exactement le filtre qu'applique
// déjà `questionsEligibles` au tirage — on le rejoue À L'ÉCRITURE pour que le
// refus soit dit à celui qui saisit, au lieu d'une disparition silencieuse.
const CHOIX_MIN = 2;

function createAcademyAdmin({ getDb, nowIso, academy, qcm, pratique, formations }) {
  const db = () => getDb();

  const texte = (v, max) => String(v === null || v === undefined ? '' : v).trim().slice(0, max);
  const drapeau = (v, defaut) => (v === undefined || v === null ? defaut : !!v);

  function entier(v, defaut, min, max) {
    if (v === undefined || v === null || v === '') return defaut;
    const n = Number(v);
    return Number.isInteger(n) && n >= min && n <= max ? n : null;
  }

  // La formation d'un appel d'administration. Les brouillons en font partie :
  // c'est tout l'objet du lot.
  const resoudreAdmin = (cle) => formations.resoudre(cle, { inclureInactives: true });

  // -- Lectures de service ---------------------------------------------------

  const lireModule = (id) => db().prepare(
    `SELECT id, formation, titre, description, ordre, actif FROM academy_modules WHERE id = ?`).get(Number(id));

  const lireContenuBrut = (id) => db().prepare(
    `SELECT id, module_id AS moduleId, type, titre, description, youtube_id AS youtubeId,
            texte, duree_min AS dureeMin, ordre, actif
     FROM academy_contenus WHERE id = ?`).get(Number(id));

  const lireQuestionBrute = (id) => db().prepare(
    `SELECT id, formation, module_id AS moduleId, enonce, ordre, actif
     FROM academy_questions WHERE id = ?`).get(Number(id));

  // Le rang suivant parmi les frères. Calculé, pas deviné : deux ajouts
  // successifs ne doivent pas se retrouver au même rang.
  function rangSuivant(sql, param) {
    const r = db().prepare(sql).get(param);
    return (r && r.n ? r.n : 0) + 1;
  }

  // -- L'arbre d'administration ---------------------------------------------
  //
  //  Tout ce que porte une formation, INACTIFS COMPRIS — c'est précisément ce
  //  qu'un écran d'administration doit montrer : ce qui est archivé se
  //  restaure, donc se voit.
  //
  //  ⚠️ `correct` sort ici. Une seule route l'appelle, derrière exigeAdmin.
  function arbre(formationCle) {
    const f = resoudreAdmin(formationCle);
    if (!f) return null;

    const modules = db().prepare(
      `SELECT id, titre, description, ordre, actif FROM academy_modules
       WHERE formation = ? ORDER BY ordre ASC, id ASC`).all(f.cle);

    const lireContenus = db().prepare(
      `SELECT id, module_id AS moduleId, type, titre, description, youtube_id AS youtubeId,
              texte, duree_min AS dureeMin, ordre, actif
       FROM academy_contenus WHERE module_id = ? ORDER BY ordre ASC, id ASC`);

    const arbo = modules.map((m) => ({
      ...m,
      actif: !!m.actif,
      contenus: lireContenus.all(m.id).map((c) => ({
        ...c,
        actif: !!c.actif,
        // Le drapeau que l'écran attend pour dire « lien manquant » sans avoir
        // à connaître la forme d'un identifiant YouTube.
        youtubeValide: !c.youtubeId ? null : idYoutubeValide(c.youtubeId),
      })),
    }));

    const questions = db().prepare(
      `SELECT id, module_id AS moduleId, enonce, ordre, actif FROM academy_questions
       WHERE formation = ? ORDER BY ordre ASC, id ASC`).all(f.cle);
    const lireChoix = db().prepare(
      'SELECT id, texte, correct, actif, ordre FROM academy_choix WHERE question_id = ? ORDER BY ordre ASC, id ASC');

    const banque = questions.map((q) => {
      const choix = lireChoix.all(q.id).map((c) => ({ ...c, correct: !!c.correct, actif: !!c.actif }));
      const vivants = choix.filter((c) => c.actif);
      const bons = vivants.filter((c) => c.correct).length;
      return {
        ...q,
        actif: !!q.actif,
        choix,
        multiple: bons > 1,
        // « Tirable » se calcule ici avec la MÊME règle que le tirage, pour que
        // l'écran n'ait jamais à la redire de son côté.
        tirable: !!q.actif && vivants.length >= CHOIX_MIN && bons >= 1 && bons < vivants.length,
      };
    });

    return { formation: f, modules: arbo, questions: banque, verification: verifier(f.cle) };
  }

  // -- Écriture : modules ----------------------------------------------------

  function definirModule(donnees) {
    const d = donnees || {};
    const existant = d.id ? lireModule(d.id) : null;
    if (d.id && !existant) return err(404, 'Module introuvable.');

    // Un module NE CHANGE PAS de formation. Le déplacer emporterait ses
    // contenus, la progression qui s'y rattache et les questions qui le citent.
    const f = existant ? resoudreAdmin(existant.formation) : resoudreAdmin(d.formation);
    if (!f) return err(404, 'Formation inconnue.');

    const titre = texte(d.titre, TITRE_MAX);
    if (!titre) return err(400, 'Le titre du module est requis.');
    const description = texte(d.description, TEXTE_MAX) || null;

    const ordre = entier(d.ordre,
      existant ? existant.ordre : rangSuivant('SELECT MAX(ordre) AS n FROM academy_modules WHERE formation = ?', f.cle),
      0, 9999);
    if (ordre === null) return err(400, 'Ordre invalide.');
    const actif = drapeau(d.actif, existant ? !!existant.actif : true);

    const maintenant = nowIso();
    let id = existant ? existant.id : null;
    if (existant) {
      db().prepare(`UPDATE academy_modules SET titre = ?, description = ?, ordre = ?, actif = ?, maj_le = ?
                    WHERE id = ?`).run(titre, description, ordre, actif ? 1 : 0, maintenant, existant.id);
    } else {
      // `cle` reste NULLE. Elle est UNIQUE À TRAVERS TOUTES LES FORMATIONS et
      // ne sert qu'à repérer l'amorçage : la remplir depuis l'administration
      // ferait entrer en collision deux formations sans rapport.
      const info = db().prepare(`INSERT INTO academy_modules (formation, titre, description, ordre, actif, cle, cree_le, maj_le)
                                 VALUES (?,?,?,?,?,NULL,?,?)`)
        .run(f.cle, titre, description, ordre, actif ? 1 : 0, maintenant, maintenant);
      id = Number(info.lastInsertRowid);
    }
    return ok({ module: { ...lireModule(id), actif: !!lireModule(id).actif } });
  }

  // -- Écriture : contenus ---------------------------------------------------

  function definirContenu(donnees) {
    const d = donnees || {};
    const existant = d.id ? lireContenuBrut(d.id) : null;
    if (d.id && !existant) return err(404, 'Contenu introuvable.');

    // Le module cible : celui reçu, ou celui d'origine. Le contenu peut changer
    // de module — mais jamais de formation.
    const cible = lireModule(d.moduleId !== undefined && d.moduleId !== null && d.moduleId !== ''
      ? d.moduleId
      : (existant ? existant.moduleId : null));
    if (!cible) return err(404, 'Module introuvable.');
    if (existant) {
      const origine = lireModule(existant.moduleId);
      if (origine && origine.formation !== cible.formation) {
        return err(400, 'Un contenu ne peut pas être déplacé dans une autre formation.');
      }
    }
    if (!resoudreAdmin(cible.formation)) return err(404, 'Formation inconnue.');

    const type = TYPES.includes(String(d.type || '')) ? String(d.type)
      : (existant ? existant.type : TYPE_VIDEO);

    const titre = texte(d.titre, TITRE_MAX);
    if (!titre) return err(400, 'Le titre du contenu est requis.');

    // L'identifiant YouTube est REFUSÉ À L'ÉCRITURE s'il est mal formé : c'est
    // ce qui part dans un attribut src d'iframe. Vide est permis — une vidéo
    // dont le lien n'est pas encore connu se saisit, elle empêche seulement la
    // publication.
    let youtube = d.youtubeId === undefined
      ? (existant ? existant.youtubeId : null)
      : (texte(d.youtubeId, 40) || null);
    if (youtube && !idYoutubeValide(youtube)) {
      return err(400, 'Identifiant YouTube invalide : 11 caractères (lettres, chiffres, « - » et « _ »), sans URL ni balise.');
    }
    if (type === TYPE_TEXTE) youtube = null;

    const corps = d.texte === undefined ? (existant ? existant.texte : null) : (texte(d.texte, TEXTE_MAX) || null);
    const description = d.description === undefined
      ? (existant ? existant.description : null)
      : (texte(d.description, TEXTE_MAX) || null);

    const duree = entier(d.dureeMin, existant ? existant.dureeMin : null, 0, DUREE_MAX);
    if (duree === null && d.dureeMin !== undefined && d.dureeMin !== null && d.dureeMin !== '') {
      return err(400, `La durée doit être un entier entre 0 et ${DUREE_MAX} minutes.`);
    }

    const ordre = entier(d.ordre,
      existant ? existant.ordre : rangSuivant('SELECT MAX(ordre) AS n FROM academy_contenus WHERE module_id = ?', cible.id),
      0, 9999);
    if (ordre === null) return err(400, 'Ordre invalide.');
    const actif = drapeau(d.actif, existant ? !!existant.actif : true);

    const maintenant = nowIso();
    let id = existant ? existant.id : null;
    if (existant) {
      db().prepare(`UPDATE academy_contenus SET module_id = ?, type = ?, titre = ?, description = ?,
                      youtube_id = ?, texte = ?, duree_min = ?, ordre = ?, actif = ?, maj_le = ?
                    WHERE id = ?`)
        .run(cible.id, type, titre, description, youtube, corps, duree, ordre, actif ? 1 : 0, maintenant, existant.id);
    } else {
      const info = db().prepare(`INSERT INTO academy_contenus
          (module_id, type, titre, description, youtube_id, texte, duree_min, ordre, actif, cle, cree_le, maj_le)
          VALUES (?,?,?,?,?,?,?,?,?,NULL,?,?)`)
        .run(cible.id, type, titre, description, youtube, corps, duree, ordre, actif ? 1 : 0, maintenant, maintenant);
      id = Number(info.lastInsertRowid);
    }
    const l = lireContenuBrut(id);
    return ok({ contenu: { ...l, actif: !!l.actif } });
  }

  // -- Écriture : questions et choix ----------------------------------------
  //
  //  Une question et ses choix s'écrivent ENSEMBLE, en une transaction. Les
  //  séparer laisserait exister, entre deux requêtes, une question sans
  //  corrigé — donc une question que le tirage écarte sans le dire.

  function definirQuestion(donnees) {
    const d = donnees || {};
    const existante = d.id ? lireQuestionBrute(d.id) : null;
    if (d.id && !existante) return err(404, 'Question introuvable.');

    const f = existante ? resoudreAdmin(existante.formation) : resoudreAdmin(d.formation);
    if (!f) return err(404, 'Formation inconnue.');

    const enonce = texte(d.enonce, ENONCE_MAX);
    if (!enonce) return err(400, 'L\'énoncé de la question est requis.');

    // Le module de rattachement est facultatif — mais s'il est donné, il doit
    // relever de la MÊME formation : une question ne cite pas le module d'un
    // autre parcours.
    let moduleId = d.moduleId === undefined ? (existante ? existante.moduleId : null) : d.moduleId;
    if (moduleId === '' || moduleId === null) moduleId = null;
    if (moduleId !== null) {
      const m = lireModule(moduleId);
      if (!m) return err(404, 'Module introuvable.');
      if (m.formation !== f.cle) return err(400, 'Ce module appartient à une autre formation.');
      moduleId = m.id;
    }

    // Les choix. Fournis -> ils remplacent les précédents. Absents -> on ne
    // touche pas au corrigé existant (modifier un énoncé ne doit pas effacer
    // ses réponses).
    let choix = null;
    if (d.choix !== undefined) {
      if (!Array.isArray(d.choix)) return err(400, 'Les réponses proposées doivent former une liste.');
      choix = d.choix
        .map((c) => ({ texte: texte(c && c.texte, CHOIX_MAX), correct: !!(c && c.correct) }))
        .filter((c) => c.texte);
    } else if (!existante) {
      return err(400, 'Une question doit être créée avec ses réponses.');
    }

    if (choix) {
      const bons = choix.filter((c) => c.correct).length;
      if (choix.length < CHOIX_MIN) return err(400, `Une question demande au moins ${CHOIX_MIN} réponses proposées.`);
      if (bons < 1) return err(400, 'Une question doit avoir au moins une bonne réponse.');
      if (bons === choix.length) return err(400, 'Une question doit avoir au moins une mauvaise réponse : sinon tout le monde la réussit sans la lire.');
    }

    const ordre = entier(d.ordre,
      existante ? existante.ordre : rangSuivant('SELECT MAX(ordre) AS n FROM academy_questions WHERE formation = ?', f.cle),
      0, 9999);
    if (ordre === null) return err(400, 'Ordre invalide.');
    const actif = drapeau(d.actif, existante ? !!existante.actif : true);

    const maintenant = nowIso();
    const dd = db();
    let id = existante ? existante.id : null;
    dd.transaction(() => {
      if (existante) {
        dd.prepare(`UPDATE academy_questions SET module_id = ?, enonce = ?, ordre = ?, actif = ?, maj_le = ?
                    WHERE id = ?`).run(moduleId, enonce, ordre, actif ? 1 : 0, maintenant, existante.id);
      } else {
        const info = dd.prepare(`INSERT INTO academy_questions (formation, module_id, enonce, actif, ordre, cle, cree_le, maj_le)
                                 VALUES (?,?,?,?,?,NULL,?,?)`)
          .run(f.cle, moduleId, enonce, actif ? 1 : 0, ordre, maintenant, maintenant);
        id = Number(info.lastInsertRowid);
      }
      if (choix) {
        // On REMPLACE les choix. Les tentatives passées ne s'en aperçoivent
        // pas : elles portent leur propre copie figée dans
        // academy_tentative_choix, corrigé compris (lot 2).
        dd.prepare('DELETE FROM academy_choix WHERE question_id = ?').run(id);
        const ins = dd.prepare(`INSERT INTO academy_choix (question_id, texte, correct, actif, ordre, cle, cree_le, maj_le)
                                VALUES (?,?,?,1,?,NULL,?,?)`);
        choix.forEach((c, i) => ins.run(id, c.texte, c.correct ? 1 : 0, i + 1, maintenant, maintenant));
      }
    })();

    const q = lireQuestionBrute(id);
    const lus = dd.prepare('SELECT id, texte, correct, actif, ordre FROM academy_choix WHERE question_id = ? ORDER BY ordre ASC, id ASC').all(id);
    return ok({ question: { ...q, actif: !!q.actif, choix: lus.map((c) => ({ ...c, correct: !!c.correct, actif: !!c.actif })) } });
  }

  // -- Archiver / restaurer --------------------------------------------------
  //
  //  Le seul geste de retrait de tout le lot, et il ne détruit rien. Un
  //  DELETE sur un contenu emporterait `academy_vus` en cascade : la
  //  progression de chaque collaborateur qui l'avait terminé disparaîtrait
  //  sans que personne ne l'ait demandé.

  const TABLES = {
    module: 'academy_modules',
    contenu: 'academy_contenus',
    question: 'academy_questions',
  };

  function basculerActif(type, id, actif) {
    const table = TABLES[String(type || '')];
    if (!table) return err(400, 'Type inconnu.');
    const ligne = db().prepare(`SELECT id FROM ${table} WHERE id = ?`).get(Number(id));
    if (!ligne) return err(404, 'Élément introuvable.');
    db().prepare(`UPDATE ${table} SET actif = ?, maj_le = ? WHERE id = ?`)
      .run(actif ? 1 : 0, nowIso(), ligne.id);
    return ok({ id: ligne.id, type, actif: !!actif });
  }

  // -- Réordonner ------------------------------------------------------------
  //
  //  Tous les frères réécrits en une transaction, dans l'ordre reçu. Incrémenter
  //  ou décrémenter au coup par coup laisserait des rangs en double le jour où
  //  deux administrateurs déplacent en même temps.

  function reordonner(type, ids) {
    const table = TABLES[String(type || '')];
    if (!table) return err(400, 'Type inconnu.');
    if (!Array.isArray(ids) || !ids.length) return err(400, 'Aucun élément à ordonner.');

    const lignes = ids.map((i) => db().prepare(`SELECT id FROM ${table} WHERE id = ?`).get(Number(i)));
    if (lignes.some((l) => !l)) return err(404, 'Élément introuvable.');

    // Le cloisonnement, ici aussi : on n'ordonne que des frères. Une liste qui
    // mélange deux modules — ou deux formations — est refusée.
    const parent = type === 'contenu'
      ? 'module_id'
      : 'formation';
    const parents = new Set(lignes.map((l) =>
      String(db().prepare(`SELECT ${parent} AS p FROM ${table} WHERE id = ?`).get(l.id).p)));
    if (parents.size > 1) return err(400, 'On ne peut ordonner que des éléments d\'un même ensemble.');

    const maintenant = nowIso();
    const d = db();
    d.transaction(() => {
      const maj = d.prepare(`UPDATE ${table} SET ordre = ?, maj_le = ? WHERE id = ?`);
      lignes.forEach((l, i) => maj.run(i + 1, maintenant, l.id));
    })();
    return ok({ type, ordre: lignes.map((l) => l.id) });
  }

  // -- Vérification et publication -------------------------------------------
  //
  //  UN SEUL PRINCIPE : on refuse de publier ce que personne ne pourrait
  //  terminer. Rien de plus. Tout le reste est un AVERTISSEMENT — une formation
  //  peut être maigre, mal équilibrée, sans évaluateur disponible aujourd'hui,
  //  et rester une formation valable.

  function verifier(formationCle) {
    const f = resoudreAdmin(formationCle);
    if (!f) return null;

    const blocages = [];
    const avertissements = [];

    const modules = db().prepare('SELECT id, titre, actif FROM academy_modules WHERE formation = ?').all(f.cle);
    const actifs = modules.filter((m) => m.actif);
    if (!actifs.length) blocages.push('Aucun module actif : la formation serait vide.');

    const lireContenus = db().prepare(
      'SELECT id, type, titre, youtube_id AS youtubeId, texte, actif FROM academy_contenus WHERE module_id = ?');
    let contenusActifs = 0;
    for (const m of actifs) {
      const cs = lireContenus.all(m.id).filter((c) => c.actif);
      contenusActifs += cs.length;
      if (!cs.length) avertissements.push(`Le module « ${m.titre} » est actif mais ne contient aucun contenu.`);
      for (const c of cs) {
        // Une vidéo sans lien valide affiche un lecteur vide : le collaborateur
        // ne peut ni la suivre ni, en conscience, la déclarer terminée.
        if (c.type === TYPE_VIDEO && !idYoutubeValide(c.youtubeId)) {
          blocages.push(`La vidéo « ${c.titre} » n'a pas d'identifiant YouTube valide.`);
        }
        if (c.type === TYPE_TEXTE && !String(c.texte || '').trim()) {
          blocages.push(`Le contenu écrit « ${c.titre} » est vide.`);
        }
      }
    }
    if (actifs.length && !contenusActifs) blocages.push('Aucun contenu actif : il n\'y aurait rien à suivre.');

    // La banque se mesure avec la RÈGLE DU TIRAGE, pas avec un compte de lignes :
    // une question sans bonne réponse est en base sans être tirable.
    const tirables = qcm.questionsEligibles(f.cle).length;
    const totalQuestions = db().prepare(
      'SELECT COUNT(*) AS n FROM academy_questions WHERE formation = ? AND actif = 1').get(f.cle).n;

    if (tirables < f.qcmNbQuestions) {
      blocages.push(`Le QCM tire ${f.qcmNbQuestions} question${f.qcmNbQuestions > 1 ? 's' : ''} mais la banque n'en compte que ${tirables} d'exploitable${tirables > 1 ? 's' : ''}.`);
    } else if (tirables === f.qcmNbQuestions) {
      avertissements.push('La banque compte exactement le nombre de questions tirées : tout le monde aura le même questionnaire.');
    }
    if (totalQuestions > tirables) {
      avertissements.push(`${totalQuestions - tirables} question${totalQuestions - tirables > 1 ? 's actives sont écartées' : ' active est écartée'} du tirage (module archivé, ou corrigé incomplet).`);
    }

    // Une formation qui certifie doit dire quel titre elle délivre. `definir()`
    // le garantit déjà à la saisie ; on le revérifie, parce qu'une ligne peut
    // venir d'avant cette règle.
    if (f.certificationActive && !f.titre) {
      blocages.push('La formation certifie mais ne porte aucun titre de certification.');
    }

    // Un avertissement, PAS un blocage : le droit d'évaluer se désigne dans un
    // autre écran, et rien n'empêche de publier aujourd'hui pour désigner
    // demain. Mais le dire évite de découvrir le trou par un collaborateur bloqué.
    if (f.pratiqueObligatoire && !pratique.listerEvaluateurs().length) {
      avertissements.push('La formation exige une évaluation pratique mais aucun évaluateur n\'est désigné : personne ne pourra la valider.');
    }

    return {
      formation: f.cle,
      publiable: blocages.length === 0,
      publiee: !!f.actif,
      blocages,
      avertissements,
      chiffres: {
        modules: actifs.length, modulesTotal: modules.length,
        contenus: contenusActifs, questionsTirables: tirables, questionsTotal: totalQuestions,
        qcmNbQuestions: f.qcmNbQuestions,
      },
    };
  }

  // Créer une formation. TOUJOURS EN BROUILLON : la publication est un geste
  // distinct, vérifié. Une formation qui naîtrait publiée apparaîtrait au
  // catalogue des collaborateurs avant d'avoir la moindre vidéo.
  function creerFormation(donnees, auteur) {
    const d = donnees || {};
    if (formations.lire(String(d.cle || '').trim().toLowerCase())) {
      return err(409, 'Une formation porte déjà cette clé.');
    }
    return formations.definir({ ...d, actif: false }, auteur);
  }

  // Modifier les réglages. `actif` est RETIRÉ du corps quoi qu'il contienne :
  // publier et dépublier sont deux routes à part, et l'une d'elles vérifie.
  function reglerFormation(donnees, auteur) {
    const d = { ...(donnees || {}) };
    const f = resoudreAdmin(d.cle);
    if (!f) return err(404, 'Formation inconnue.');
    delete d.actif;
    return formations.definir({ ...d, cle: f.cle, actif: f.actif }, auteur);
  }

  function publier(formationCle, auteur) {
    const f = resoudreAdmin(formationCle);
    if (!f) return err(404, 'Formation inconnue.');
    const v = verifier(f.cle);
    if (!v.publiable) {
      return err(409, 'Cette formation ne peut pas être publiée en l\'état.', { verification: v });
    }
    const r = formations.definir({
      cle: f.cle, libelle: f.libelle, titre: f.titre, ordre: f.ordre, actif: true,
      qcmNbQuestions: f.qcmNbQuestions, qcmSeuilPct: f.qcmSeuilPct,
      pratiqueObligatoire: f.pratiqueObligatoire, certificationActive: f.certificationActive,
    }, auteur);
    if (!r.ok) return r;
    return ok({ formation: formations.lire(f.cle), verification: verifier(f.cle) });
  }

  // Dépublier ne se vérifie pas : retirer du catalogue une formation devenue
  // caduque doit toujours rester possible. Rien n'est effacé — la progression,
  // les tentatives et les certifications déjà délivrées restent en base.
  function depublier(formationCle, auteur) {
    const f = resoudreAdmin(formationCle);
    if (!f) return err(404, 'Formation inconnue.');
    const r = formations.definir({
      cle: f.cle, libelle: f.libelle, titre: f.titre, ordre: f.ordre, actif: false,
      qcmNbQuestions: f.qcmNbQuestions, qcmSeuilPct: f.qcmSeuilPct,
      pratiqueObligatoire: f.pratiqueObligatoire, certificationActive: f.certificationActive,
    }, auteur);
    if (!r.ok) return r;
    return ok({ formation: formations.lire(f.cle), verification: verifier(f.cle) });
  }

  return {
    arbre, verifier,
    definirModule, definirContenu, definirQuestion,
    basculerActif, reordonner,
    creerFormation, reglerFormation, publier, depublier,
  };
}

module.exports = { createAcademyAdmin, CHOIX_MIN };
