'use strict';
// ============================================================================
//  MY COACH ACADEMY — amorçage de « Cycle menstruel & entraînement ».
//
//  POURQUOI UN SECOND FICHIER PLUTÔT QU'UNE BRANCHE DANS academyQcm.js.
//  L'import de la banque Coach Nutrition y vit déjà, mais il est câblé sur elle
//  et gardé par son propre marqueur. L'élargir obligerait à rouvrir un fichier
//  de mille lignes qui porte le tirage, le gel des tentatives et la correction
//  — c'est-à-dire à risquer une régression sur la formation en production pour
//  une raison qui n'a rien à voir avec elle. Ce module écrit UNE formation, la
//  sienne, et ne touche à rien d'autre.
//
//  TROIS RÈGLES, LES MÊMES QUE POUR LA BANQUE VOISINE :
//
//   1. TOUT OU RIEN. Une seule transaction : si un identifiant de vidéo est
//      refusé ou si un module manque, RIEN n'est écrit et on le dit. Écrire
//      neuf modules sur dix laisserait une formation à moitié posée que le
//      marqueur, lui, déclarerait terminée.
//
//   2. IDEMPOTENT. Le marqueur en `academy_config` ferme la porte au second
//      passage : redémarrer le serveur ne réécrase jamais une question
//      retouchée depuis l'écran d'administration.
//
//   3. ELLE NAÎT EN BROUILLON (`actif = 0`). Personne ne la voit tant que
//      l'administrateur ne l'a pas publiée depuis l'écran — c'est le
//      comportement de toute formation nouvelle, et il vaut ici aussi.
//
//  ⚠️ CE MODULE NE POSE PAS reflet_boost. Il passe par formations.definir(),
//  qui refuse de l'accorder à une formation nouvelle. Être certifié « Cycle
//  menstruel » n'ouvrira donc aucun dossier client du Boost Nutrition.
// ============================================================================

const BANQUE = require('./academyBanqueCycleMenstruel');
const { idYoutubeValide } = require('./academy');

const USAGE_MINI = 'mini';
const USAGE_FINALE = 'finale';

function createAmorcageCycleMenstruel({ getDb, nowIso, formations, qcm, pratique }) {
  const db = () => getDb();

  // -- Les cas pratiques -----------------------------------------------------
  //
  //  SÉPARÉ DE L'AMORÇAGE DE LA BANQUE, et sous son propre marqueur. Les six
  //  cas arrivent après coup, sur des bases où la formation est déjà posée :
  //  les greffer au marqueur existant les aurait rendus inatteignables sans
  //  réécrire les dix modules et les soixante-dix questions.
  //
  //  Idempotent et tout-ou-rien, comme son voisin. Ne lève jamais.
  function amorcerCas() {
    if (!pratique || typeof pratique.assurerSchema !== 'function') return 0;
    const d = db();
    pratique.assurerSchema();               // la table academy_cas doit exister
    formations.assurerSchema();

    if (d.prepare('SELECT cle FROM academy_config WHERE cle = ?').get(BANQUE.MARQUEUR_CAS)) return 0;
    // Pas de formation, pas de cas : on ne pose pas un référentiel orphelin.
    if (!formations.lire(BANQUE.FORMATION.cle)) return 0;

    const maintenant = nowIso();
    let poses = 0;
    try {
      d.transaction(() => {
        const ins = d.prepare(`INSERT INTO academy_cas
            (formation, titre, consignes, ordre, actif, cle, cree_le, maj_le)
            VALUES (?,?,?,?,1,?,?,?)
            ON CONFLICT(cle) DO NOTHING`);
        for (const c of BANQUE.CAS) {
          poses += ins.run(BANQUE.FORMATION.cle, c.titre, c.consignes || null, c.ordre, c.cle, maintenant, maintenant).changes;
        }
        d.prepare('INSERT INTO academy_config (cle, valeur, maj_le) VALUES (?,?,?) ON CONFLICT(cle) DO NOTHING')
          .run(BANQUE.MARQUEUR_CAS, String(poses), maintenant);
      })();
    } catch (e) {
      console.warn('⚠️  Cycle menstruel : cas pratiques non amorcés — ' + e.message + '.');
      return 0;
    }
    return poses;
  }

  // -- Les consignes, posées après coup -------------------------------------
  //
  //  Les six intitulés existaient avant leur contenu pédagogique. Sur une base
  //  déjà amorcée, MARQUEUR_CAS ferme la porte : ce second repère est le seul
  //  moyen de compléter les lignes en place. Il ne crée aucun cas, n'en
  //  renomme aucun, ne touche ni aux id ni à l'ordre — il remplit une colonne
  //  restée vide, et seulement si elle l'est encore. Une consigne retouchée
  //  depuis la base n'est jamais réécrasée.
  function amorcerConsignesCas() {
    if (!pratique || typeof pratique.assurerSchema !== 'function') return 0;
    const d = db();
    pratique.assurerSchema();

    if (d.prepare('SELECT cle FROM academy_config WHERE cle = ?').get(BANQUE.MARQUEUR_CONSIGNES)) return 0;
    if (!formations.lire(BANQUE.FORMATION.cle)) return 0;

    const maintenant = nowIso();
    let remplies = 0;
    try {
      d.transaction(() => {
        const maj = d.prepare(`UPDATE academy_cas SET consignes = ?, maj_le = ?
                               WHERE cle = ? AND formation = ?
                                 AND (consignes IS NULL OR consignes = '')`);
        for (const c of BANQUE.CAS) {
          if (!c.consignes) continue;
          remplies += maj.run(c.consignes, maintenant, c.cle, BANQUE.FORMATION.cle).changes;
        }
        d.prepare('INSERT INTO academy_config (cle, valeur, maj_le) VALUES (?,?,?) ON CONFLICT(cle) DO NOTHING')
          .run(BANQUE.MARQUEUR_CONSIGNES, String(remplies), maintenant);
      })();
    } catch (e) {
      console.warn('⚠️  Cycle menstruel : consignes des cas non posées — ' + e.message + '.');
      return 0;
    }
    return remplies;
  }

  // Renvoie le nombre de questions posées, 0 si l'amorçage n'avait rien à faire.
  // Ne lève jamais : un amorçage qui empêche l'app de démarrer serait pire que
  // l'absence de la formation.
  function amorcer() {
    const d = db();
    // Les tables des lots 1, 2 et 5 doivent exister avant qu'on y écrive.
    qcm.assurerSchema();
    formations.assurerSchema();

    // Les cas, sous leur propre marqueur. APPELÉ DEUX FOIS, et c'est voulu :
    // ici pour les bases où la formation est déjà posée (le seul chemin qui
    // marche, puisque la banque ne se rejoue pas), et une seconde fois en fin
    // d'amorçage pour les bases neuves — où la formation n'existe pas encore
    // à cette ligne. L'appel est idempotent : le second ne fait rien si le
    // premier a travaillé.
    const cas = amorcerCas();
    if (cas) console.log(`  Academy : « Cycle menstruel » — ${cas} cas pratiques posés.`);
    const cons = amorcerConsignesCas();
    if (cons) console.log(`  Academy : « Cycle menstruel » — ${cons} consignes de cas renseignées.`);
    // La valeur de retour reste le nombre de QUESTIONS : c'est ce que le
    // démarrage annonce, et les cas ont leur propre ligne ci-dessus.
    if (d.prepare('SELECT cle FROM academy_config WHERE cle = ?').get(BANQUE.MARQUEUR)) return 0;

    // CONTRÔLE AVANT ÉCRITURE. Un identifiant YouTube invalide ou dupliqué se
    // voit ici, pas à moitié posé en base.
    const vus = new Set();
    for (const m of BANQUE.MODULES) {
      if (!idYoutubeValide(m.youtubeId)) {
        console.warn(`⚠️  Cycle menstruel : identifiant YouTube invalide au module ${m.ordre} — amorçage annulé.`);
        return 0;
      }
      if (vus.has(m.youtubeId)) {
        console.warn(`⚠️  Cycle menstruel : identifiant YouTube en double au module ${m.ordre} — amorçage annulé.`);
        return 0;
      }
      vus.add(m.youtubeId);
    }

    const f = BANQUE.FORMATION;
    const maintenant = nowIso();
    const existeQ = d.prepare('SELECT id FROM academy_questions WHERE cle = ?');
    const insM = d.prepare(`INSERT INTO academy_modules (formation, titre, description, ordre, actif, cle, cree_le, maj_le)
                            VALUES (?,?,?,?,1,?,?,?)`);
    const insC = d.prepare(`INSERT INTO academy_contenus (module_id, type, titre, description, youtube_id, ordre, actif, cle, cree_le, maj_le)
                            VALUES (?,'video',?,?,?,1,1,?,?,?)`);
    const insQ = d.prepare(`INSERT INTO academy_questions (formation, module_id, usage, enonce, actif, ordre, cle, cree_le, maj_le)
                            VALUES (?,?,?,?,1,?,?,?,?)`);
    const insX = d.prepare(`INSERT INTO academy_choix (question_id, texte, correct, actif, ordre, cle, cree_le, maj_le)
                            VALUES (?,?,?,1,?,?,?,?)`);

    const poser = (cle, moduleId, usage, ordre, q) => {
      if (existeQ.get(cle)) return 0;
      const info = insQ.run(f.cle, moduleId, usage, q.enonce, ordre, cle, maintenant, maintenant);
      const qid = Number(info.lastInsertRowid);
      q.choix.forEach(([texte, correct], i) => {
        insX.run(qid, texte, correct ? 1 : 0, i + 1, `${cle}-c${i + 1}`, maintenant, maintenant);
      });
      return 1;
    };

    let ajouts = 0;
    let echec = null;
    try {
      d.transaction(() => {
        // La formation d'abord : en BROUILLON, et sans reflet Boost.
        const r = formations.definir({
          cle: f.cle,
          libelle: f.libelle,
          titre: f.titre,
          ordre: f.ordre,
          actif: false,
          pratiqueObligatoire: f.pratiqueObligatoire,
          certificationActive: f.certificationActive,
          qcmNbQuestions: BANQUE.REGLAGES.qcmNbQuestions,
          qcmSeuilPct: BANQUE.REGLAGES.qcmSeuilPct,
          miniNbQuestions: BANQUE.REGLAGES.miniNbQuestions,
          miniSeuilPct: BANQUE.REGLAGES.miniSeuilPct,
        }, 'amorcage');
        if (!r.ok) { echec = r.body && r.body.error; throw new Error('ANNULER'); }

        for (const m of BANQUE.MODULES) {
          const cleM = `${m.prefixe}`;
          const info = insM.run(f.cle, m.titre, m.description, m.ordre, cleM, maintenant, maintenant);
          const moduleId = Number(info.lastInsertRowid);
          insC.run(moduleId, m.titre, m.description, m.youtubeId, `${cleM}-v1`, maintenant, maintenant);
          // Les cinq questions du mini de CE module, rattachées à son id.
          m.questions.forEach((q, i) => { ajouts += poser(`${cleM}-q${i + 1}`, moduleId, USAGE_MINI, i + 1, q); });
        }

        // Les finales ne portent aucun module : elles sont transversales.
        BANQUE.FINALE.forEach((q, i) => {
          ajouts += poser(`cm-fin-q${String(i + 1).padStart(2, '0')}`, null, USAGE_FINALE, i + 1, q);
        });

        d.prepare('INSERT INTO academy_config (cle, valeur, maj_le) VALUES (?,?,?) ON CONFLICT(cle) DO NOTHING')
          .run(BANQUE.MARQUEUR, String(ajouts), maintenant);
      })();
    } catch (e) {
      if (e && e.message === 'ANNULER') {
        console.warn('⚠️  Cycle menstruel : amorçage annulé — ' + (echec || 'formation refusée') + '.');
        return 0;
      }
      console.warn('⚠️  Cycle menstruel : amorçage impossible — ' + e.message + '. L\'app démarre normalement.');
      return 0;
    }
    // Base neuve : la formation vient seulement d'être créée, c'est maintenant
    // que ses cas peuvent s'y rattacher.
    const casApres = amorcerCas();
    if (casApres) console.log(`  Academy : « Cycle menstruel » — ${casApres} cas pratiques posés.`);
    const consApres = amorcerConsignesCas();
    if (consApres) console.log(`  Academy : « Cycle menstruel » — ${consApres} consignes de cas renseignées.`);
    return ajouts;
  }

  return { amorcer, amorcerCas, amorcerConsignesCas };
}

module.exports = { createAmorcageCycleMenstruel, BANQUE };
