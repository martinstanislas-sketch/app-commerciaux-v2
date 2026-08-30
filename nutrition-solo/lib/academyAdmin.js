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
const { USAGE_MINI, USAGE_FINALE } = require('./academyQcm');
const { idYoutubeValide, TYPES, TYPE_VIDEO, TYPE_TEXTE } = require('./academy');
const { cleValide, CATEGORIES, categorieValide } = require('./academyFormations');

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
    `SELECT id, formation, module_id AS moduleId, usage, enonce, ordre, actif
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
      `SELECT id, module_id AS moduleId, usage, enonce, ordre, actif FROM academy_questions
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

    // Les cas d'évaluation, ARCHIVÉS COMPRIS : l'administration montre ce
    // qu'elle peut restaurer. L'évaluateur, lui, ne verra jamais qu'un cas actif.
    const cas = pratique.listerCasAdmin(f.cle);

    return { formation: f, modules: arbo, questions: banque, cas, verification: verifier(f.cle) };
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

    // Dans QUELLE banque cette question se range. Le défaut est « finale » :
    // c'est ce qu'étaient toutes les questions avant l'arrivée du mini-QCM, et
    // une saisie qui ne le précise pas ne doit pas atterrir par surprise dans
    // une épreuve pédagogique.
    const usage = d.usage === undefined ? (existante ? existante.usage : USAGE_FINALE) : String(d.usage || '').trim();
    if (![USAGE_MINI, USAGE_FINALE].includes(usage)) {
      return err(400, `L'usage d'une question vaut « ${USAGE_MINI} » ou « ${USAGE_FINALE} ».`);
    }
    // Une question de mini-QCM SANS module ne serait jamais tirée : le tirage
    // d'un mini est restreint au module. La refuser à la saisie évite une
    // question qui existe en base sans exister nulle part ailleurs.
    if (usage === USAGE_MINI && moduleId === null) {
      return err(400, 'Une question de mini-QCM doit être rattachée à un module.');
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
        dd.prepare(`UPDATE academy_questions SET module_id = ?, usage = ?, enonce = ?, ordre = ?, actif = ?, maj_le = ?
                    WHERE id = ?`).run(moduleId, usage, enonce, ordre, actif ? 1 : 0, maintenant, existante.id);
      } else {
        const info = dd.prepare(`INSERT INTO academy_questions (formation, module_id, usage, enonce, actif, ordre, cle, cree_le, maj_le)
                                 VALUES (?,?,?,?,?,?,NULL,?,?)`)
          .run(f.cle, moduleId, usage, enonce, actif ? 1 : 0, ordre, maintenant, maintenant);
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
    // `academy_evaluations` cite `cas_id` : un DELETE emporterait le référentiel
    // des évaluations déjà prononcées. Le cas rejoint donc l'archivage commun,
    // et `reordonner` le traite comme les autres — sa colonne parente est
    // `formation`, exactement comme pour un module ou une question.
    cas: 'academy_cas',
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
    const tirables = qcm.questionsEligibles(f.cle, { usage: USAGE_FINALE }).length;
    // ON NE COMPTE QUE LA BANQUE FINALE. Additionner les deux ferait dire à
    // l'avertissement du dessous que les questions de mini-QCM sont « écartées
    // du tirage » : elles ne le sont pas, elles relèvent de l'autre épreuve.
    const totalQuestions = db().prepare(
      'SELECT COUNT(*) AS n FROM academy_questions WHERE formation = ? AND usage = ? AND actif = 1')
      .get(f.cle, USAGE_FINALE).n;

    // ------------------------------------------------------------------------
    //  LES MINI-QCM, MODULE PAR MODULE.
    //
    //  Un mini-QCM est BLOQUANT : un module actif dont la banque mini est trop
    //  courte n'arrête pas seulement son propre exercice, il ferme tout ce qui
    //  vient après lui. C'est donc un blocage de publication, pas un
    //  avertissement.
    //
    //  UN MODULE SANS AUCUNE QUESTION MINI EST ACCEPTÉ, et c'est voulu : il vaut
    //  module d'introduction, franchi dès ses contenus terminés. La règle
    //  distingue « pas de mini » (légitime) de « un mini qu'on ne peut pas
    //  passer » (infranchissable) — c'est cette seconde situation qu'on refuse.
    // ------------------------------------------------------------------------
    const minisCourts = [];
    let modulesAvecMini = 0;
    for (const m of actifs) {
      const n = qcm.questionsEligibles(f.cle, { usage: USAGE_MINI, moduleId: m.id }).length;
      if (n === 0) continue;                       // module sans mini : légitime
      modulesAvecMini++;
      if (n < f.miniNbQuestions) minisCourts.push({ titre: m.titre, n });
    }
    for (const m of minisCourts) {
      blocages.push(`Le mini-QCM du module « ${m.titre} » tire ${f.miniNbQuestions} question${f.miniNbQuestions > 1 ? 's' : ''} mais n'en compte que ${m.n} d'exploitable${m.n > 1 ? 's' : ''}.`);
    }

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

    // UN AVERTISSEMENT, PAS UN BLOCAGE — et la nuance est tout le sujet. Le
    // schéma de `academy_cas` pose que « ZÉRO CAS EST UN CAS VALIDE » : c'est
    // ce qui garde Coach Nutrition intacte, où l'évaluateur se prononce en
    // champ libre. Bloquer ici rendrait cette formation-là impubliable.
    // Mais le taire laisserait découvrir le trou par un évaluateur devant un
    // écran sans référentiel.
    if (f.pratiqueObligatoire && !pratique.listerCas(f.cle).length) {
      avertissements.push('La formation exige une évaluation pratique mais ne propose aucun cas : l\'évaluateur se prononcera sans référentiel.');
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
        modulesAvecMini, miniNbQuestions: f.miniNbQuestions,
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

  // ==========================================================================
  //  IMPORT D'UNE FORMATION COMPLÈTE
  //
  //  CE N'EST PAS UN SECOND ÉCRIVAIN, et c'est tout le point. Il n'écrit pas
  //  une ligne de SQL : il ORCHESTRE `creerFormation`, `definirModule`,
  //  `definirContenu`, `definirQuestion` et `definirCas`. Il hérite donc, sans
  //  les redire, de la validation des identifiants YouTube, du refus d'une
  //  question incorrigeable, du refus d'un mini sans module, du cloisonnement
  //  par formation, du reflet Boost inaccordable et de la naissance en
  //  brouillon. Une règle écrite deux fois est une règle qui divergera.
  //
  //  DEUX PASSES, ET L'ORDRE EST LA GARANTIE :
  //   1. `analyser()` valide TOUT sans écrire, et collecte TOUTES les erreurs.
  //      Corriger un JSON de soixante-dix questions une erreur à la fois serait
  //      un supplice : chaque erreur porte son chemin exact.
  //   2. `ecrire()` ne s'exécute que si la passe 1 est vierge, et dans UNE
  //      SEULE TRANSACTION. Une erreur à la dernière question et rien n'existe.
  // ==========================================================================

  const IMPORT_DESCRIPTION_MAX = 2000;

  // Les champs qu'on refuse d'obéir, même écrits noir sur blanc. On ne les
  // ignore pas en silence : le rapport les nomme, sinon leur absence d'effet
  // passerait pour un bug.
  const CHAMPS_REFUSES = ['actif', 'publie', 'publiee', 'refletBoost', 'reflet_boost'];

  function analyser(donnees) {
    const erreurs = [];
    const avertissements = [];
    const E = (chemin, message) => erreurs.push({ chemin, message });
    const A = (chemin, message) => avertissements.push({ chemin, message });

    const d = donnees && typeof donnees === 'object' && !Array.isArray(donnees) ? donnees : null;
    if (!d) {
      E('racine', 'Le contenu doit être un objet JSON.');
      return { erreurs, avertissements, chiffres: null };
    }

    // -- La formation ---------------------------------------------------------
    const f = d.formation && typeof d.formation === 'object' ? d.formation : null;
    if (!f) E('formation', 'Le bloc « formation » est requis.');

    const cle = f ? String(f.cle || '').trim().toLowerCase() : '';
    if (f) {
      if (!cle) E('formation.cle', 'La clé de la formation est requise.');
      else if (!cleValide(cle)) {
        E('formation.cle', `« ${cle} » : minuscules, chiffres et « _ » uniquement, de 3 à 40 caractères.`);
      } else if (formations.lire(cle)) {
        // JAMAIS D'ÉCRASEMENT. Une clé déjà prise est un refus net : l'import
        // crée, il ne fusionne pas.
        E('formation.cle', `« ${cle} » : une formation porte déjà cette clé.`);
      }
      if (!String(f.libelle || '').trim()) E('formation.libelle', 'Le libellé est requis.');

      const certif = f.certificationActive === undefined ? true : !!f.certificationActive;
      if (certif && !String(f.titre || '').trim()) {
        E('formation.titre', 'Une formation qui certifie doit porter un titre de certification.');
      }

      // LA CATÉGORIE. Une valeur inconnue est une ERREUR : elle rangerait la
      // formation dans un onglet qui n'existe pas, donc nulle part.
      // Une catégorie ABSENTE n'est qu'un AVERTISSEMENT : la formation reste
      // entière, elle n'apparaît simplement que dans « toutes » — et l'exiger
      // invaliderait tout JSON écrit avant ce lot.
      if (f.categorie === undefined || f.categorie === null || String(f.categorie).trim() === '') {
        A('formation.categorie', `Aucune catégorie : la formation n'apparaîtra que dans « toutes ». Attendu : ${CATEGORIES.join(', ')}.`);
      } else if (!categorieValide(String(f.categorie).trim().toLowerCase())) {
        E('formation.categorie', `« ${String(f.categorie).trim()} » : catégorie inconnue. Attendu : ${CATEGORIES.join(', ')}.`);
      }
      for (const [champ, min, max] of [
        ['qcmNbQuestions', 1, 200], ['qcmSeuilPct', 0, 100],
        ['miniNbQuestions', 1, 200], ['miniSeuilPct', 0, 100], ['ordre', 0, 9999],
      ]) {
        const v = f[champ];
        if (v === undefined || v === null || v === '') continue;
        if (!Number.isInteger(Number(v)) || Number(v) < min || Number(v) > max) {
          E(`formation.${champ}`, `Doit être un entier entre ${min} et ${max}.`);
        }
      }
      for (const champ of CHAMPS_REFUSES) {
        if (f[champ] !== undefined) {
          A(`formation.${champ}`, 'Ignoré : une formation importée naît toujours en brouillon, sans reflet Boost.');
        }
      }
    }

    const miniNb = f && Number.isInteger(Number(f.miniNbQuestions)) ? Number(f.miniNbQuestions) : 5;
    const qcmNb = f && Number.isInteger(Number(f.qcmNbQuestions)) ? Number(f.qcmNbQuestions) : 5;

    // -- Une question, où qu'elle soit ----------------------------------------
    const verifierQuestion = (q, chemin) => {
      if (!q || typeof q !== 'object') { E(chemin, 'Question invalide.'); return; }
      const enonce = String(q.enonce || '').trim();
      if (!enonce) E(`${chemin}.enonce`, 'L\'énoncé est requis.');
      else if (enonce.length > ENONCE_MAX) E(`${chemin}.enonce`, `Énoncé trop long (${enonce.length} > ${ENONCE_MAX}).`);

      if (!Array.isArray(q.choix)) { E(`${chemin}.choix`, 'Les réponses doivent former une liste.'); return; }
      const choix = q.choix.filter((c) => c && String(c.texte || '').trim());
      if (choix.length < CHOIX_MIN) {
        E(`${chemin}.choix`, `${choix.length} réponse(s) exploitable(s) : il en faut au moins ${CHOIX_MIN}.`);
      }
      if (choix.some((c) => String(c.texte).trim().length > CHOIX_MAX)) {
        E(`${chemin}.choix`, `Une réponse dépasse ${CHOIX_MAX} caractères.`);
      }
      const bons = choix.filter((c) => c.correct === true).length;
      if (choix.length >= CHOIX_MIN) {
        // La règle du tirage, mot pour mot : sans elle la question existerait
        // en base sans jamais sortir.
        if (bons === 0) E(`${chemin}.choix`, 'Aucune réponse marquée « correct: true ».');
        else if (bons === choix.length) E(`${chemin}.choix`, 'Toutes les réponses sont correctes : la question ne se lit plus.');
      }
      const textes = choix.map((c) => String(c.texte).trim());
      if (new Set(textes).size !== textes.length) E(`${chemin}.choix`, 'Deux réponses identiques.');
    };

    // -- Les modules ----------------------------------------------------------
    const modules = Array.isArray(d.modules) ? d.modules : null;
    if (!modules) E('modules', 'Le bloc « modules » est requis et doit être une liste.');
    else if (!modules.length) E('modules', 'Une formation sans module serait vide.');

    let nbVideos = 0, nbMinis = 0;
    const ytVus = new Map();
    (modules || []).forEach((m, i) => {
      const chemin = `modules[${i}]`;
      if (!m || typeof m !== 'object') { E(chemin, 'Module invalide.'); return; }
      if (!String(m.titre || '').trim()) E(`${chemin}.titre`, 'Le titre du module est requis.');

      // Le contenu : une vidéo, ou un écrit. Pas les deux, pas aucun.
      const v = m.video && typeof m.video === 'object' ? m.video : null;
      const t = m.texte && typeof m.texte === 'object' ? m.texte : null;
      if (!v && !t) E(`${chemin}.video`, 'Le module n\'a aucun contenu : « video » ou « texte » est requis.');
      if (v && t) E(chemin, 'Un module porte « video » OU « texte », pas les deux.');
      if (v) {
        nbVideos++;
        if (!String(v.titre || '').trim()) E(`${chemin}.video.titre`, 'Le titre de la vidéo est requis.');
        const yt = String(v.youtubeId || '').trim();
        if (!idYoutubeValide(yt)) {
          // C'est ce qui part dans un attribut src d'iframe : le refus est net,
          // et il dit ce qui est attendu.
          E(`${chemin}.video.youtubeId`, `« ${yt || '(vide)'} » : 11 caractères attendus (l'identifiant seul, pas l'URL).`);
        } else {
          if (ytVus.has(yt)) A(`${chemin}.video.youtubeId`, `Même vidéo qu'au module ${ytVus.get(yt) + 1}.`);
          else ytVus.set(yt, i);
        }
        if (v.dureeMin !== undefined && v.dureeMin !== null && v.dureeMin !== ''
          && (!Number.isInteger(Number(v.dureeMin)) || Number(v.dureeMin) < 0 || Number(v.dureeMin) > DUREE_MAX)) {
          E(`${chemin}.video.dureeMin`, `Doit être un entier entre 0 et ${DUREE_MAX}.`);
        }
      }
      if (t) {
        if (!String(t.titre || '').trim()) E(`${chemin}.texte.titre`, 'Le titre du contenu est requis.');
        if (!String(t.texte || '').trim()) E(`${chemin}.texte.texte`, 'Un contenu écrit vide n\'a rien à suivre.');
      }

      // Les minis du module. ZÉRO EST LÉGITIME : le module vaut introduction,
      // franchi dès ses contenus terminés. Entre zéro et le quota, en revanche,
      // le module devient infranchissable — et ferme tout ce qui vient après.
      const qs = m.questions === undefined ? [] : m.questions;
      if (!Array.isArray(qs)) { E(`${chemin}.questions`, 'Les questions doivent former une liste.'); return; }
      qs.forEach((q, j) => verifierQuestion(q, `${chemin}.questions[${j}]`));
      nbMinis += qs.length;
      if (qs.length === 0) A(`${chemin}.questions`, 'Aucun mini-QCM : ce module vaudra module d\'introduction.');
      else if (qs.length < miniNb) {
        E(`${chemin}.questions`, `${qs.length} question(s) pour un mini qui en tire ${miniNb} : le module serait infranchissable.`);
      }
    });

    // -- Le QCM final ---------------------------------------------------------
    const finale = Array.isArray(d.finale) ? d.finale : null;
    if (!finale) E('finale', 'Le bloc « finale » est requis et doit être une liste.');
    else {
      finale.forEach((q, j) => verifierQuestion(q, `finale[${j}]`));
      if (finale.length < qcmNb) {
        E('finale', `${finale.length} question(s) pour un QCM qui en tire ${qcmNb} : l'épreuve serait impossible.`);
      } else if (finale.length === qcmNb) {
        A('finale', 'La banque compte exactement le nombre de questions tirées : tout le monde aura le même questionnaire.');
      }
    }

    // -- Les cas d'évaluation -------------------------------------------------
    const cas = d.cas === undefined ? [] : d.cas;
    if (!Array.isArray(cas)) E('cas', 'Les cas doivent former une liste.');
    else {
      cas.forEach((c, i) => {
        if (!c || typeof c !== 'object') { E(`cas[${i}]`, 'Cas invalide.'); return; }
        if (!String(c.titre || '').trim()) E(`cas[${i}].titre`, 'Le titre du cas est requis.');
      });
      const pratique = !f || f.pratiqueObligatoire === undefined ? true : !!f.pratiqueObligatoire;
      if (pratique && !cas.length) {
        A('cas', 'La formation exige une évaluation pratique mais n\'apporte aucun cas : l\'évaluateur se prononcera sans référentiel.');
      }
      if (!pratique && cas.length) {
        A('cas', 'La formation n\'exige pas d\'évaluation pratique : ces cas ne seront proposés à personne.');
      }
    }

    // Les énoncés en double, à travers TOUT l'import : la même question dans
    // deux modules est presque toujours un copier-coller oublié.
    const tous = [
      ...(modules || []).flatMap((m, i) => (Array.isArray(m && m.questions) ? m.questions : [])
        .map((q, j) => ({ e: String((q && q.enonce) || '').trim(), c: `modules[${i}].questions[${j}]` }))),
      ...(finale || []).map((q, j) => ({ e: String((q && q.enonce) || '').trim(), c: `finale[${j}]` })),
    ].filter((x) => x.e);
    const vus = new Map();
    for (const x of tous) {
      if (vus.has(x.e)) A(x.c, `Énoncé identique à ${vus.get(x.e)}.`);
      else vus.set(x.e, x.c);
    }

    return {
      erreurs,
      avertissements,
      chiffres: {
        cle,
        modules: (modules || []).length,
        videos: nbVideos,
        minis: nbMinis,
        finales: (finale || []).length,
        cas: Array.isArray(cas) ? cas.length : 0,
      },
    };
  }

  // L'écriture. Ne s'appelle QUE sur une analyse vierge, et TOUT passe par les
  // fonctions d'administration déjà éprouvées.
  function ecrire(d, auteur) {
    const f = d.formation;
    const dd = db();
    let cle = null;
    const echec = (r, chemin) => { throw Object.assign(new Error(r.body.error || 'Écriture refusée.'), { chemin }); };

    dd.transaction(() => {
      // La formation. `creerFormation` force le brouillon : l'import ne publie
      // rien, jamais, quoi que contienne le JSON.
      const rf = creerFormation({
        cle: String(f.cle).trim().toLowerCase(),
        libelle: f.libelle,
        description: f.description === undefined ? null
          : String(f.description || '').trim().slice(0, IMPORT_DESCRIPTION_MAX) || null,
        categorie: f.categorie === undefined ? null : f.categorie,
        titre: f.titre,
        ordre: f.ordre,
        qcmNbQuestions: f.qcmNbQuestions,
        qcmSeuilPct: f.qcmSeuilPct,
        miniNbQuestions: f.miniNbQuestions,
        miniSeuilPct: f.miniSeuilPct,
        pratiqueObligatoire: f.pratiqueObligatoire,
        certificationActive: f.certificationActive,
      }, auteur);
      if (!rf.ok) echec(rf, 'formation');
      cle = rf.body.formation.cle;

      d.modules.forEach((m, i) => {
        const rm = definirModule({ formation: cle, titre: m.titre, description: m.description, ordre: i + 1 });
        if (!rm.ok) echec(rm, `modules[${i}]`);
        const moduleId = rm.body.module.id;

        // Le type se DÉDUIT du bloc fourni : rien à saisir, rien à confondre.
        const v = m.video, t = m.texte;
        const rc = definirContenu(v
          ? { moduleId, type: 'video', titre: v.titre, description: v.description, youtubeId: v.youtubeId, dureeMin: v.dureeMin, ordre: 1 }
          : { moduleId, type: 'texte', titre: t.titre, description: t.description, texte: t.texte, ordre: 1 });
        if (!rc.ok) echec(rc, `modules[${i}].${v ? 'video' : 'texte'}`);

        (m.questions || []).forEach((q, j) => {
          // `usage` et `moduleId` sont DÉDUITS de l'emplacement : une question
          // écrite sous un module est un mini, sans que personne ait à le dire.
          const rq = definirQuestion({
            formation: cle, usage: USAGE_MINI, moduleId, enonce: q.enonce,
            choix: q.choix.map((c) => ({ texte: c.texte, correct: !!c.correct })),
            ordre: j + 1,
          });
          if (!rq.ok) echec(rq, `modules[${i}].questions[${j}]`);
        });
      });

      d.finale.forEach((q, j) => {
        const rq = definirQuestion({
          formation: cle, usage: USAGE_FINALE, moduleId: null, enonce: q.enonce,
          choix: q.choix.map((c) => ({ texte: c.texte, correct: !!c.correct })),
          ordre: 1000 + j,
        });
        if (!rq.ok) echec(rq, `finale[${j}]`);
      });

      (d.cas || []).forEach((c, i) => {
        const rk = pratique.definirCas({ formation: cle, titre: c.titre, consignes: c.consignes, ordre: i + 1 });
        if (!rk.ok) echec(rk, `cas[${i}]`);
      });
    })();

    return cle;
  }

  // Le point d'entrée. `apercu` n'écrit RIEN — pas même une transaction ouverte.
  function importer(donnees, { apercu = false } = {}, auteur) {
    const rapport = analyser(donnees);
    if (rapport.erreurs.length) {
      return err(400, `${rapport.erreurs.length} erreur(s) : rien n'a été créé.`, { rapport });
    }
    if (apercu) return ok({ apercu: true, rapport });

    let cle;
    try {
      cle = ecrire(donnees, auteur);
    } catch (e) {
      // La transaction a déjà tout annulé : on rapporte, on n'a rien laissé.
      return err(400, e.message, {
        rapport: { ...rapport, erreurs: [{ chemin: e.chemin || 'import', message: e.message }] },
      });
    }
    return ok({ formation: formations.lire(cle), rapport, arbre: arbre(cle) });
  }

  // `definirCas` n'est pas réécrit ici : il vit dans `academyPratique`, avec la
  // table qu'il sert et le cloisonnement qui va avec. L'administration ne fait
  // que l'exposer, comme elle expose déjà l'archivage et l'ordre.
  return {
    importer,
    arbre, verifier,
    definirModule, definirContenu, definirQuestion,
    definirCas: (donnees) => pratique.definirCas(donnees),
    basculerActif, reordonner,
    creerFormation, reglerFormation, publier, depublier,
  };
}

module.exports = { createAcademyAdmin, CHOIX_MIN };
