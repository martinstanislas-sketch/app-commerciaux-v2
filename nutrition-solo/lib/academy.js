'use strict';
// ============================================================================
//  MY COACH ACADEMY — formation Coach Nutrition (lot 1 : le socle).
//
//  Ce module porte les CONTENUS de formation et la PROGRESSION individuelle.
//  Il ne porte ni QCM, ni certification : le QCM viendra au lot suivant, et la
//  certification vit déjà dans lib/boost.js — l'Academy l'alimentera, elle n'en
//  créera jamais une seconde.
//
//  CE QU'IL NE FAIT PAS, ET C'EST STRUCTURANT :
//   - il ne crée aucun compte. Un collaborateur de l'Academy EST un
//     collaborateur du Boost (table boost_collaborateurs), authentifié par le
//     même email + PIN. Deux systèmes de comptes, c'est deux fois les mêmes
//     règles à tenir, et un jour deux vérités ;
//   - il ne stocke aucune vidéo. Seul l'identifiant YouTube est conservé (11
//     caractères) ; la lecture se fait chez YouTube, en « non répertorié ».
//     L'app ne sert donc jamais d'octet de vidéo, et n'a pas à s'en soucier.
//
//  ⚠️ « NON RÉPERTORIÉ » N'EST PAS « PRIVÉ ». L'identifiant est lisible dans le
//  source de la page par tout collaborateur connecté. C'est acceptable pour de
//  la formation interne, mais il ne faut pas confondre les deux : une vidéo
//  dont le lien circule est publique.
// ============================================================================

const { err, ok } = require('./boost');
const { ajouterColonne, aColonne, COACH_NUTRITION } = require('./academyFormations');

// Un identifiant YouTube fait 11 caractères dans un alphabet restreint. On le
// valide à l'écriture ET on le re-valide à la lecture : ce qui part dans un
// attribut src d'iframe ne doit jamais être du texte libre.
const YOUTUBE_RE = /^[A-Za-z0-9_-]{11}$/;
const idYoutubeValide = (v) => YOUTUBE_RE.test(String(v || ''));

const TYPE_VIDEO = 'video';
const TYPE_TEXTE = 'texte';
const TYPES = [TYPE_VIDEO, TYPE_TEXTE];

const SCHEMA_ACADEMY = `
-- Modules de formation. L'ordre et l'activation sont des DONNÉES, pas du code :
-- c'est ce qui permettra à l'admin de les gérer sans redéploiement (lot 4).
CREATE TABLE IF NOT EXISTS academy_modules (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  -- LA colonne qui cloisonne tout le contenu pédagogique : les contenus
  -- suivent leur module, la progression suit les contenus. Une seule
  -- colonne à poser, et l'arborescence entière est rattachée.
  formation   TEXT NOT NULL DEFAULT 'coach_nutrition',
  titre       TEXT NOT NULL,
  description TEXT,
  ordre       INTEGER NOT NULL DEFAULT 0,
  actif       INTEGER NOT NULL DEFAULT 1,
  cle         TEXT UNIQUE,          -- repère stable pour l'amorçage, jamais affiché
  cree_le     TEXT NOT NULL,
  maj_le      TEXT NOT NULL
);

-- Contenus d'un module. youtube_id ne contient QUE l'identifiant : ni URL, ni
-- balise. Construire l'iframe est le travail de l'écran, pas celui de la base.
CREATE TABLE IF NOT EXISTS academy_contenus (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  module_id   INTEGER NOT NULL REFERENCES academy_modules(id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT 'video',   -- video | texte
  titre       TEXT NOT NULL,
  description TEXT,
  youtube_id  TEXT,
  texte       TEXT,
  duree_min   INTEGER,
  ordre       INTEGER NOT NULL DEFAULT 0,
  actif       INTEGER NOT NULL DEFAULT 1,
  cle         TEXT UNIQUE,
  cree_le     TEXT NOT NULL,
  maj_le      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_academy_contenus ON academy_contenus(module_id, ordre);
CREATE INDEX IF NOT EXISTS idx_academy_modules_f ON academy_modules(formation, actif, ordre);

-- Progression individuelle. DEUX dates distinctes, et c'est tout l'enjeu :
-- ouvrir un contenu n'est pas l'avoir terminé. Confondre les deux ferait d'un
-- clic malheureux une formation validée.
CREATE TABLE IF NOT EXISTS academy_vus (
  email      TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  contenu_id INTEGER NOT NULL REFERENCES academy_contenus(id) ON DELETE CASCADE,
  ouvert_le  TEXT NOT NULL,
  termine_le TEXT,
  PRIMARY KEY (email, contenu_id)
);
CREATE INDEX IF NOT EXISTS idx_academy_vus ON academy_vus(email);

-- Dernier contenu consulté, pour la reprise. Une ligne par collaborateur : on
-- pourrait le déduire des dates d'ouverture, mais revenir en arrière sur une
-- vidéo déjà vue changerait alors le point de reprise sans qu'on l'ait voulu.
-- Une position PAR FORMATION : quelqu'un peut être au milieu de deux parcours
-- sans que l'un déplace le point de reprise de l'autre.
CREATE TABLE IF NOT EXISTS academy_position (
  email      TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  formation  TEXT NOT NULL DEFAULT 'coach_nutrition',
  contenu_id INTEGER REFERENCES academy_contenus(id) ON DELETE SET NULL,
  maj_le     TEXT NOT NULL,
  PRIMARY KEY (email, formation)
);
`;

// Contenus de DÉMONSTRATION. Ils portent « (démonstration) » dans leur titre et
// des identifiants YouTube volontairement factices : personne ne doit les
// prendre pour la vraie formation. Les 35 vidéos réelles seront saisies depuis
// l'interface d'administration (lot 4), sans toucher à ce fichier.
const AMORCE = [
  {
    cle: 'demo-m1', titre: 'Module 1 — Les fondamentaux (démonstration)', ordre: 1,
    description: 'Contenus d\'exemple servant à éprouver le fonctionnement de l\'Academy.',
    contenus: [
      { cle: 'demo-m1-c1', titre: 'Le rôle du Coach Nutrition', youtube: 'DEMOaaaa001', duree: 8,
        description: 'Ce qu\'un Coach Nutrition fait, et ce qu\'il ne fait pas.' },
      { cle: 'demo-m1-c2', titre: 'Poser un cadre bienveillant', youtube: 'DEMOaaaa002', duree: 11,
        description: 'Constater sans juger : la posture qui rend le suivi tenable.' },
      { cle: 'demo-m1-c3', titre: 'La règle de l\'action unique', youtube: 'DEMOaaaa003', duree: 6,
        description: 'Pourquoi une seule action à la fois, et jamais deux.' },
    ],
  },
  {
    cle: 'demo-m2', titre: 'Module 2 — Conduire un rendez-vous (démonstration)', ordre: 2,
    description: 'Deuxième module d\'exemple, pour vérifier l\'enchaînement des modules.',
    contenus: [
      { cle: 'demo-m2-c1', titre: 'Le premier rendez-vous (S1)', youtube: 'DEMOaaaa004', duree: 14,
        description: 'Découvrir le client sans transformer l\'entretien en questionnaire.' },
      { cle: 'demo-m2-c2', titre: 'Le suivi hebdomadaire (S2-S11)', youtube: 'DEMOaaaa005', duree: 12,
        description: 'Constater, décider, poser la suite.' },
    ],
  },
];

function createAcademy({ getDb, nowIso, boost, formations }) {
  const db = () => getDb();
  const normalise = (e) => String(e || '').trim().toLowerCase();

  const basesMigrees = new WeakSet();
  function assurerSchema() {
    const d = db();
    // LE BOOST D'ABORD, ET AVANT LE GARDE-FOU.
    //
    //  L'Academy lit boost_collaborateurs dès sa toute première route :
    //  `peutSeFormer` demande au Boost si l'appelant est collaborateur, parce
    //  qu'un collaborateur de l'Academy EST un collaborateur du Boost (lot 1).
    //  Mais chaque module pose son schéma à la demande, sur SON préfixe : sur
    //  une base vierge dont la première page ouverte est /academy, aucune route
    //  /api/boost n'a encore été traversée. La table n'existait donc pas, et
    //  GET /api/academy/moi répondait 500 — « Espace indisponible » à l'écran.
    //
    //  Appelé HORS du garde-fou, et c'est voulu : boost.assurerSchema() porte
    //  le sien (idempotent, une seule exécution par base), l'appel est donc
    //  gratuit, et la dépendance tient même sur une base dont le schéma Academy
    //  a déjà été posé. On déclare ici une dépendance qui existait déjà dans le
    //  code sans être exprimée nulle part.
    boost.assurerSchema();
    if (basesMigrees.has(d)) return true;
    // Le catalogue d'abord : c'est lui qui donne la formation par défaut, et
    // les migrations ci-dessous rattachent l'existant à cette formation-là.
    formations.assurerSchema();
    d.exec(SCHEMA_ACADEMY);
    migrerVersMultiFormation(d);
    basesMigrees.add(d);
    amorcer();
    return true;
  }

  // MIGRATION D'UNE BASE EXISTANTE. Les tables sont déjà là, sans la colonne :
  // on l'ajoute avec la valeur qui rattache tout l'existant à Coach Nutrition.
  // Aucune donnée n'est perdue, aucune ligne n'est réécrite.
  function migrerVersMultiFormation(d) {
    ajouterColonne(d, 'academy_modules', 'formation', `TEXT NOT NULL DEFAULT '${COACH_NUTRITION}'`);

    // academy_position change de CLÉ PRIMAIRE (email -> email + formation), et
    // SQLite ne sait pas l'altérer : il faut reconstruire. On le fait en une
    // transaction, en recopiant chaque ligne sur la formation historique.
    // Rien ne référence cette table, la reconstruction est donc sans risque.
    if (!aColonne(d, 'academy_position', 'formation')) {
      d.transaction(() => {
        d.exec(`CREATE TABLE academy_position_v2 (
                  email      TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
                  formation  TEXT NOT NULL DEFAULT '${COACH_NUTRITION}',
                  contenu_id INTEGER REFERENCES academy_contenus(id) ON DELETE SET NULL,
                  maj_le     TEXT NOT NULL,
                  PRIMARY KEY (email, formation)
                )`);
        d.exec(`INSERT INTO academy_position_v2 (email, formation, contenu_id, maj_le)
                SELECT email, '${COACH_NUTRITION}', contenu_id, maj_le FROM academy_position`);
        d.exec('DROP TABLE academy_position');
        d.exec('ALTER TABLE academy_position_v2 RENAME TO academy_position');
      })();
    }
  }

  // La formation visée par un appel. Absente -> celle du catalogue par défaut :
  // c'est ce qui laisse fonctionner tout l'existant sans le réécrire.
  function cleFormation(formation) {
    if (formation) return typeof formation === 'string' ? formation : formation.cle;
    const f = formations.defaut();
    return f ? f.cle : COACH_NUTRITION;
  }

  // Amorçage idempotent, sur le modèle de la FAQ coach : on n'insère que ce qui
  // manque, repéré par `cle`. Redémarrer ne duplique rien, et un contenu réécrit
  // par l'administrateur n'est jamais réécrasé.
  function amorcer() {
    const d = db();
    const maintenant = nowIso();
    const modExiste = d.prepare('SELECT id FROM academy_modules WHERE cle = ?');
    const conExiste = d.prepare('SELECT id FROM academy_contenus WHERE cle = ?');
    let ajouts = 0;
    d.transaction(() => {
      for (const m of AMORCE) {
        let ligne = modExiste.get(m.cle);
        if (!ligne) {
          const info = d.prepare(`INSERT INTO academy_modules (formation, titre, description, ordre, actif, cle, cree_le, maj_le)
                                  VALUES (?,?,?,?,1,?,?,?)`)
            .run(COACH_NUTRITION, m.titre, m.description, m.ordre, m.cle, maintenant, maintenant);
          ligne = { id: Number(info.lastInsertRowid) };
          ajouts++;
        }
        m.contenus.forEach((c, i) => {
          if (conExiste.get(c.cle)) return;
          d.prepare(`INSERT INTO academy_contenus (module_id, type, titre, description, youtube_id, duree_min, ordre, actif, cle, cree_le, maj_le)
                     VALUES (?,?,?,?,?,?,?,1,?,?,?)`)
            .run(ligne.id, TYPE_VIDEO, c.titre, c.description, c.youtube, c.duree, i + 1, c.cle, maintenant, maintenant);
          ajouts++;
        });
      }
    })();
    return ajouts;
  }

  // -- Accès ---------------------------------------------------------------

  // L'Academy est ouverte aux collaborateurs ACTIFS, certifiés ou non — c'est
  // justement la formation qui doit leur permettre de le devenir. Un
  // collaborateur désactivé la perd, comme il perd les dossiers : la lecture se
  // fait à chaque requête, jamais en cache.
  function peutSeFormer(email) {
    return boost.estCollaborateur(boost.lireUtilisateur(email));
  }

  // -- Lecture de la formation ---------------------------------------------

  function modulesActifs(formation) {
    return db().prepare(`SELECT id, formation, titre, description, ordre FROM academy_modules
                         WHERE formation = ? AND actif = 1 ORDER BY ordre ASC, id ASC`)
      .all(cleFormation(formation));
  }

  function contenusActifs(moduleId) {
    return db().prepare(`SELECT id, module_id AS moduleId, type, titre, description, youtube_id AS youtubeId,
                                texte, duree_min AS dureeMin, ordre
                         FROM academy_contenus WHERE module_id = ? AND actif = 1 ORDER BY ordre ASC, id ASC`)
      .all(Number(moduleId))
      // Ceinture et bretelles : un identifiant abîmé en base ne doit pas partir
      // dans un attribut src. Il ressort vide, l'écran affiche un contenu sans
      // lecteur plutôt qu'une iframe cassée.
      .map((c) => ({ ...c, youtubeId: idYoutubeValide(c.youtubeId) ? c.youtubeId : null }));
  }

  function progressionDe(email) {
    const rows = db().prepare('SELECT contenu_id AS contenuId, ouvert_le AS ouvertLe, termine_le AS termineLe FROM academy_vus WHERE email = ?')
      .all(normalise(email));
    return new Map(rows.map((r) => [r.contenuId, r]));
  }

  function positionDe(email, formation) {
    const r = db().prepare('SELECT contenu_id AS contenuId FROM academy_position WHERE email = ? AND formation = ?')
      .get(normalise(email), cleFormation(formation));
    return r ? r.contenuId : null;
  }

  // La formation telle que l'écran la reçoit : modules ordonnés, contenus
  // ordonnés, état de chacun, et le contenu par lequel reprendre.
  function formationPour(email, formation) {
    const mail = normalise(email);
    const cle = cleFormation(formation);
    const vus = progressionDe(mail);
    let total = 0;
    let termines = 0;

    const modules = modulesActifs(cle).map((m) => {
      const contenus = contenusActifs(m.id).map((c) => {
        const v = vus.get(c.id) || null;
        return {
          ...c,
          commence: !!v,
          termine: !!(v && v.termineLe),
          ouvertLe: v ? v.ouvertLe : null,
          termineLe: v ? v.termineLe : null,
        };
      });
      const faits = contenus.filter((c) => c.termine).length;
      total += contenus.length;
      termines += faits;
      return {
        ...m,
        contenus,
        total: contenus.length,
        termines: faits,
        pourcentage: contenus.length ? Math.round((faits / contenus.length) * 100) : 0,
        acheve: contenus.length > 0 && faits === contenus.length,
      };
    });

    // La reprise se CALCULE, elle ne se stocke pas : ajouter un contenu au
    // milieu de la formation ne doit rien avoir à resynchroniser.
    const tous = modules.flatMap((m) => m.contenus);
    const position = positionDe(mail, cle);
    const premierNonFait = tous.find((c) => !c.termine) || null;
    const reprise = (position && tous.some((c) => c.id === position && !c.termine))
      ? position
      : (premierNonFait ? premierNonFait.id : null);

    return {
      formation: cle,
      modules,
      total,
      termines,
      pourcentage: total ? Math.round((termines / total) * 100) : 0,
      acheve: total > 0 && termines === total,
      dernierConsulte: position,
      reprise,
    };
  }

  function lireContenu(id) {
    const c = db().prepare(`SELECT id, module_id AS moduleId, type, titre, description, youtube_id AS youtubeId,
                                   texte, duree_min AS dureeMin, ordre, actif
                            FROM academy_contenus WHERE id = ?`).get(Number(id));
    if (!c || !c.actif) return null;
    const m = db().prepare('SELECT id, titre, actif, formation FROM academy_modules WHERE id = ?').get(c.moduleId);
    if (!m || !m.actif) return null;
    // UN BROUILLON N'EXISTE PAS (lot 6). Cette route-ci prend un identifiant de
    // contenu SANS clé de formation : c'était donc le seul chemin par lequel un
    // collaborateur pouvait atteindre — en devinant un numéro — le titre et la
    // vidéo d'une formation encore en construction. On referme ici, au plus
    // près de la lecture, plutôt que dans chaque appelant.
    const f = formations.lire(m.formation);
    if (!f || !f.actif) return null;
    // La formation vient du MODULE : un identifiant de contenu suffit donc à
    // savoir de quel parcours il relève, sans que l'appelant ait à le dire.
    return { ...c, youtubeId: idYoutubeValide(c.youtubeId) ? c.youtubeId : null,
      moduleTitre: m.titre, formation: m.formation };
  }

  // -- Écriture de la progression ------------------------------------------
  //
  //  Les deux gestes ne prennent JAMAIS d'email en paramètre : il vient du
  //  jeton, côté route. C'est ce qui rend structurellement impossible de
  //  toucher à la progression d'un autre collaborateur.

  // Ouvrir un contenu : on note qu'il a été commencé et on déplace le point de
  // reprise. On ne le termine SURTOUT pas — ouvrir une page n'est pas avoir
  // regardé une vidéo, et confondre les deux viderait la formation de son sens.
  function ouvrirContenu(email, contenuId) {
    const c = lireContenu(contenuId);
    if (!c) return err(404, 'Contenu introuvable.');
    const mail = normalise(email);
    const maintenant = nowIso();
    const d = db();
    d.transaction(() => {
      d.prepare(`INSERT INTO academy_vus (email, contenu_id, ouvert_le) VALUES (?, ?, ?)
                 ON CONFLICT(email, contenu_id) DO NOTHING`)
        .run(mail, c.id, maintenant);
      d.prepare(`INSERT INTO academy_position (email, formation, contenu_id, maj_le) VALUES (?, ?, ?, ?)
                 ON CONFLICT(email, formation) DO UPDATE SET contenu_id = excluded.contenu_id, maj_le = excluded.maj_le`)
        .run(mail, c.formation, c.id, maintenant);
    })();
    return ok({ contenu: c, formation: formationPour(mail, c.formation) });
  }

  // Terminer : la confirmation explicite du collaborateur. C'est une
  // DÉCLARATION, pas une preuve de visionnage — on ne peut pas prouver qu'une
  // vidéo YouTube a été regardée, et prétendre le contraire serait mentir sur
  // ce que mesure la progression.
  function terminerContenu(email, contenuId) {
    const c = lireContenu(contenuId);
    if (!c) return err(404, 'Contenu introuvable.');
    const mail = normalise(email);
    const maintenant = nowIso();
    db().prepare(`INSERT INTO academy_vus (email, contenu_id, ouvert_le, termine_le) VALUES (?, ?, ?, ?)
                  ON CONFLICT(email, contenu_id) DO UPDATE SET
                    termine_le = COALESCE(academy_vus.termine_le, excluded.termine_le)`)
      .run(mail, c.id, maintenant, maintenant);
    return ok({ contenu: c, formation: formationPour(mail, c.formation) });
  }

  return {
    assurerSchema, amorcer, peutSeFormer,
    formationPour, lireContenu, ouvrirContenu, terminerContenu,
    positionDe, progressionDe, modulesActifs, cleFormation,
  };
}

module.exports = {
  createAcademy, idYoutubeValide,
  TYPE_VIDEO, TYPE_TEXTE, TYPES, AMORCE,
};
