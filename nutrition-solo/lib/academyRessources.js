'use strict';
// ============================================================================
//  MY COACH ACADEMY — LA BOÎTE À OUTILS.
//
//  UNE RESSOURCE N'EST PAS UNE FORMATION, ET CE FICHIER EST LÀ POUR QUE ÇA LE
//  RESTE. « Boîte à outils » était jusqu'ici une CATÉGORIE du catalogue des
//  formations : une famille de parcours, au même titre qu'Essentiel ou
//  Expertise. Elle devient une bibliothèque — des documents qu'on consulte,
//  pas un cursus qu'on suit.
//
//  La différence n'est pas cosmétique, elle est structurelle. Ce module
//  n'écrit RIEN dans academy_vus, academy_position, academy_tentatives,
//  academy_evaluations ni boost_certifications, et il n'en lit rien non plus.
//  Aucune clé étrangère ne le relie au parcours. C'est ce qui garantit qu'un
//  PDF ouvert ne fera jamais avancer une barre de progression, ne comptera
//  jamais dans un pourcentage, et n'ouvrira jamais un droit.
//
//  ⚠️ EN CONSÉQUENCE, `ordre` ET `actif` NE VEULENT PAS DIRE LA MÊME CHOSE
//  QU'AILLEURS. Dans une formation, archiver un contenu doit préserver la
//  progression de ceux qui l'ont terminé — d'où l'interdiction absolue de
//  supprimer. Ici, personne n'a « terminé » quoi que ce soit : archiver suffit,
//  et la suppression définitive d'une ressource devient un geste légitime. On
//  la réserve tout de même à un second appel explicite (cf. supprimer).
//
//  OÙ VIVENT LES OCTETS. Dans SQLite, en BLOB, comme les photos de progression
//  et les photos de plats (cf. l'en-tête de lib/db.js). Pas sur le disque : le
//  système de fichiers d'un conteneur est reconstruit à chaque déploiement,
//  alors que la base, elle, est sur le volume monté. Un dossier `uploads/`
//  aurait perdu tous les PDF à la première mise en ligne.
//
//  Les octets vivent dans une table SÉPARÉE de la fiche. Afficher la
//  bibliothèque lit `academy_ressources` — quelques centaines d'octets par
//  carte — et ne charge jamais un seul mégaoctet de PDF. Les deux tables en une
//  seule auraient rendu chaque affichage proportionnel au poids des fichiers.
// ============================================================================

const { err, ok } = require('./boost');
const { idYoutubeValide } = require('./academy');

// LES QUATRE TYPES. Liste fermée : ce que l'écran sait afficher, et rien
// d'autre. Chaque type dit ce qu'il exige — c'est cette table qui remplace une
// cascade de `if` dans la validation.
const TYPE_PDF = 'pdf';
const TYPE_IMAGE = 'image';
const TYPE_VIDEO = 'video';
const TYPE_LIEN = 'lien';
const TYPES = [TYPE_PDF, TYPE_IMAGE, TYPE_VIDEO, TYPE_LIEN];

// Les types MIME acceptés, par type de ressource. On ne se fie JAMAIS à
// l'extension du nom de fichier : elle est choisie par celui qui envoie.
const MIMES = {
  [TYPE_PDF]: ['application/pdf'],
  [TYPE_IMAGE]: ['image/jpeg', 'image/png', 'image/webp'],
};
const MIMES_ACCEPTES = [...MIMES[TYPE_PDF], ...MIMES[TYPE_IMAGE]];

// 20 Mo par fichier. Assez pour un support de formation illustré, trop peu pour
// qu'une vidéo se retrouve ici par erreur — les vidéos ont leur type, et il ne
// stocke aucun octet.
const TAILLE_MAX = 20 * 1024 * 1024;

// LES CATÉGORIES D'AMORÇAGE — le DOMAINE d'une ressource, jamais son format.
//
//  ⚠️ NE PAS CONFONDRE AVEC LE TYPE. La catégorie dit à quoi sert la ressource
//  et pour quel métier ; le type dit sous quelle forme elle se présente. « Process
//  pesée client » est de catégorie Coaching et de type PDF ; « Tutoriel Deciplus »
//  est de catégorie Outils & applications et de type Vidéo. Les deux axes sont
//  indépendants, et c'est ce qui permet de filtrer sur l'un sans perdre l'autre.
//
//  Elles couvrent les cinq profils que l'Academy servira : coachs, conseillers
//  forme, coach leaders, direction et franchisés.
//
//  Elles sont en TABLE, pas en constante : tu dois pouvoir en ajouter, en
//  renommer, en réordonner et en archiver une sans redéploiement. Cette liste ne
//  sert qu'à REMPLIR une base — jamais à contraindre ce qu'elle contient. Le
//  jour où tu renommes « Divers » depuis l'administration, c'est ton libellé qui
//  fait foi, pas cette ligne (cf. migrerCategories).
const CATEGORIES_AMORCE = [
  ['coaching', 'Coaching'],
  ['nutrition', 'Nutrition'],
  ['commercial', 'Commercial & vente'],
  ['experience_client', 'Expérience & fidélisation client'],
  ['management', 'Management & RH'],
  ['communication', 'Communication & marketing'],
  ['pilotage_kpi', 'Pilotage & KPI'],
  ['administratif', 'Administratif & procédures'],
  ['franchise', 'Franchise'],
  ['outils_applications', 'Outils & applications'],
  ['divers', 'Divers'],
];

// LA MIGRATION DES CATÉGORIES DÉJÀ AMORCÉES.
//
//  Cinq des huit premières catégories changent de LIBELLÉ sans changer de CLÉ :
//  « Commercial » devient « Commercial & vente », et ainsi de suite. Garder la
//  clé est le point important — c'est elle que porte `academy_ressources.categorie`.
//  Une ressource déjà classée en « commercial » suit donc son intitulé sans
//  qu'on ait à la réécrire, et sans qu'aucune ne se retrouve orpheline.
//
//  Chaque ligne dit : « si cette catégorie porte ENCORE son libellé d'amorçage,
//  alors elle n'a pas été retouchée, et je peux la renommer ». C'est ce garde
//  qui rend la migration à la fois idempotente — au second passage le libellé a
//  changé, la condition ne s'applique plus — et respectueuse : un libellé que tu
//  aurais toi-même saisi depuis l'administration n'est jamais réécrasé.
const CATEGORIES_RENOMMEES = [
  ['commercial', 'Commercial', 'Commercial & vente'],
  ['management', 'Management', 'Management & RH'],
  ['communication', 'Communication', 'Communication & marketing'],
  ['administratif', 'Administratif', 'Administratif & procédures'],
];

// Même grammaire de clé que les formations : elle voyage dans des URL et sert
// de valeur en base.
const CLE_RE = /^[a-z][a-z0-9_]{1,39}$/;
const cleValide = (v) => CLE_RE.test(String(v || ''));

// Une URL externe ne doit être QUE http(s). `javascript:` dans un href est du
// code exécuté au clic ; `data:` sert des pages arbitraires sous notre origine
// aux yeux de l'utilisateur. On valide à l'écriture ET on revalide à la
// lecture — même règle que l'identifiant YouTube.
function urlValide(v) {
  const s = String(v || '').trim();
  if (!s || s.length > 2000) return false;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (_) { return false; }
}

// Un nom de fichier part dans un en-tête Content-Disposition : ni guillemet,
// ni retour à la ligne, sinon le nom devient un moyen d'écrire des en-têtes.
function nomPropre(v, defaut) {
  const s = String(v || '').replace(/[\r\n"\\]/g, ' ').replace(/[/\\]/g, '-').trim().slice(0, 120);
  return s || defaut;
}

const SCHEMA_RESSOURCES = `
-- Les sous-catégories. En table pour être administrables : Coaching, Nutrition,
-- Commercial… ne sont que les huit premières lignes, pas une règle du code.
CREATE TABLE IF NOT EXISTS academy_ressource_categories (
  cle      TEXT PRIMARY KEY,
  libelle  TEXT NOT NULL,
  ordre    INTEGER NOT NULL DEFAULT 0,
  actif    INTEGER NOT NULL DEFAULT 1,
  cree_le  TEXT NOT NULL,
  maj_le   TEXT NOT NULL
);

-- Les octets, à part de la fiche (cf. en-tête). Une ligne par fichier envoyé.
CREATE TABLE IF NOT EXISTS academy_ressource_fichiers (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  mime    TEXT NOT NULL,
  nom     TEXT NOT NULL,
  taille  INTEGER NOT NULL,
  data    BLOB NOT NULL,
  cree_le TEXT NOT NULL
);

-- La fiche. AUCUNE colonne de progression, aucune référence à une formation,
-- à un module ou à un contenu : c'est ce qui rend impossible qu'une ressource
-- entre un jour dans un calcul de parcours.
CREATE TABLE IF NOT EXISTS academy_ressources (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT NOT NULL,                     -- pdf | image | video | lien
  titre       TEXT NOT NULL,
  description TEXT,
  -- Nullable : une ressource sans sous-catégorie reste consultable, elle
  -- n'apparaît simplement dans aucun filtre autre que « toutes ».
  categorie   TEXT REFERENCES academy_ressource_categories(cle),
  youtube_id  TEXT,
  url         TEXT,
  fichier_id  INTEGER REFERENCES academy_ressource_fichiers(id) ON DELETE SET NULL,
  ordre       INTEGER NOT NULL DEFAULT 0,
  actif       INTEGER NOT NULL DEFAULT 1,
  cree_le     TEXT NOT NULL,
  maj_le      TEXT NOT NULL,
  cree_par    TEXT
);
CREATE INDEX IF NOT EXISTS idx_academy_ressources ON academy_ressources(actif, categorie, ordre);
`;

function createAcademyRessources({ getDb, nowIso }) {
  const db = () => getDb();

  const basesMigrees = new WeakSet();
  function assurerSchema() {
    const d = db();
    if (basesMigrees.has(d)) return true;
    d.exec(SCHEMA_RESSOURCES);
    basesMigrees.add(d);
    amorcer();
    return true;
  }

  // Amorçage idempotent, repéré par la clé : redémarrer ne duplique rien, et une
  // sous-catégorie renommée par l'administrateur n'est jamais réécrasée.
  function amorcer() {
    const d = db();
    const maintenant = nowIso();
    let ajouts = 0;
    d.transaction(() => {
      CATEGORIES_AMORCE.forEach(([cle, libelle], i) => {
        const info = d.prepare(`INSERT INTO academy_ressource_categories (cle, libelle, ordre, actif, cree_le, maj_le)
                                VALUES (?,?,?,1,?,?) ON CONFLICT(cle) DO NOTHING`)
          .run(cle, libelle, i + 1, maintenant, maintenant);
        ajouts += info.changes;
      });
      migrerCategories(d, maintenant);
    })();
    return ajouts;
  }

  // Renomme et replace les catégories d'amorçage QUI N'ONT PAS ÉTÉ RETOUCHÉES.
  //
  //  AUCUNE RESSOURCE N'EST TOUCHÉE ICI, et c'est tout l'intérêt : on ne
  //  déplace que des libellés et des rangs. `academy_ressources.categorie`
  //  porte la CLÉ, qui ne bouge pas — la migration est donc structurellement
  //  incapable de déclasser ou de perdre une fiche.
  function migrerCategories(d, maintenant) {
    // Le libellé : seulement s'il est encore celui d'origine (cf. le commentaire
    // de CATEGORIES_RENOMMEES).
    const renommer = d.prepare(`UPDATE academy_ressource_categories SET libelle = ?, maj_le = ?
                                WHERE cle = ? AND libelle = ?`);
    for (const [cle, avant, apres] of CATEGORIES_RENOMMEES) renommer.run(apres, maintenant, cle, avant);

    // Le rang : même prudence, mais le garde ne peut pas être le libellé — il
    // vient justement de changer. On ne replace QUE les catégories d'amorçage,
    // et seulement si l'ordre actuel est encore exactement celui qu'elles
    // avaient à leur création : huit rangs consécutifs à partir de 1, dans
    // l'ordre historique. Dès que tu as réordonné toi-même, la condition tombe
    // et la migration ne touche plus à rien.
    const ORDRE_HISTORIQUE = ['coaching', 'nutrition', 'commercial', 'management',
      'communication', 'administratif', 'franchise', 'divers'];
    const actuelles = d.prepare('SELECT cle, ordre FROM academy_ressource_categories ORDER BY ordre ASC, cle ASC')
      .all();
    const intactes = ORDRE_HISTORIQUE.every((cle, i) => {
      const c = actuelles.find((x) => x.cle === cle);
      return c && c.ordre === i + 1;
    });
    if (!intactes) return;
    const replacer = d.prepare('UPDATE academy_ressource_categories SET ordre = ?, maj_le = ? WHERE cle = ?');
    CATEGORIES_AMORCE.forEach(([cle], i) => replacer.run(i + 1, maintenant, cle));
  }

  // -- Les sous-catégories ---------------------------------------------------

  const vueCategorie = (r) => (r ? {
    cle: r.cle, libelle: r.libelle, ordre: r.ordre, actif: !!r.actif,
  } : null);

  function listerCategories({ toutes = false } = {}) {
    assurerSchema();
    return db().prepare(`SELECT * FROM academy_ressource_categories ${toutes ? '' : 'WHERE actif = 1'}
                         ORDER BY ordre ASC, cle ASC`).all().map(vueCategorie);
  }

  function lireCategorie(cle) {
    assurerSchema();
    return vueCategorie(db().prepare('SELECT * FROM academy_ressource_categories WHERE cle = ?')
      .get(String(cle || '').trim().toLowerCase()));
  }

  // Créer ou renommer. La CLÉ ne change jamais : c'est elle que portent les
  // ressources déjà classées. Renommer « Divers » en « Autres » doit déplacer
  // le libellé, pas orpheliner les fiches.
  function definirCategorie(donnees) {
    assurerSchema();
    const d = donnees || {};
    const cle = String(d.cle || '').trim().toLowerCase();
    if (!cleValide(cle)) {
      return err(400, 'Clé de catégorie invalide : minuscules, chiffres et « _ », de 2 à 40 caractères.');
    }
    const libelle = String(d.libelle || '').trim().slice(0, 80);
    if (!libelle) return err(400, 'Le libellé de la catégorie est requis.');

    const existante = lireCategorie(cle);
    const entier = (v, defaut) => {
      if (v === undefined || v === null || v === '') return defaut;
      const n = Number(v);
      return Number.isInteger(n) && n >= 0 && n <= 9999 ? n : null;
    };
    const suivant = db().prepare('SELECT MAX(ordre) AS n FROM academy_ressource_categories').get().n || 0;
    const ordre = entier(d.ordre, existante ? existante.ordre : suivant + 1);
    if (ordre === null) return err(400, 'Ordre invalide.');
    const actif = d.actif === undefined || d.actif === null ? (existante ? existante.actif : true) : !!d.actif;

    const maintenant = nowIso();
    db().prepare(`INSERT INTO academy_ressource_categories (cle, libelle, ordre, actif, cree_le, maj_le)
                  VALUES (?,?,?,?,?,?)
                  ON CONFLICT(cle) DO UPDATE SET libelle = excluded.libelle, ordre = excluded.ordre,
                    actif = excluded.actif, maj_le = excluded.maj_le`)
      .run(cle, libelle, ordre, actif ? 1 : 0, maintenant, maintenant);
    return ok({ categorie: lireCategorie(cle) });
  }

  // Désactiver une sous-catégorie NE DÉCLASSE PAS ses ressources : elles gardent
  // leur clé et réapparaîtront si on la réactive. Une sous-catégorie masquée
  // dont les fiches auraient été vidées ne se rallumerait jamais vraiment.
  //  ⚠️ ARCHIVER UNE CATÉGORIE N'EFFACE RIEN, ET LE DIT. Les ressources gardent
  //  leur clé : elles restent consultables, elles disparaissent seulement du
  //  filtre, et elles le retrouvent si on réactive la catégorie. La réponse
  //  porte le NOMBRE de ressources concernées pour que l'écran puisse
  //  l'annoncer — un archivage silencieux sur une catégorie garnie laisserait
  //  croire à une suppression.
  function basculerCategorie(cle, actif) {
    assurerSchema();
    const c = lireCategorie(cle);
    if (!c) return err(404, 'Catégorie introuvable.');
    db().prepare('UPDATE academy_ressource_categories SET actif = ?, maj_le = ? WHERE cle = ?')
      .run(actif ? 1 : 0, nowIso(), c.cle);
    // ⚠️ `ressourcesConcernees`, PAS `ressources` : la route ajoute à sa réponse
    // la bibliothèque complète sous la clé `ressources`, et le compteur y était
    // écrasé avant d'atteindre l'écran. Deux choses différentes, deux noms.
    return ok({ categorie: lireCategorie(c.cle), ressourcesConcernees: compterRessources(c.cle) });
  }

  // Combien de fiches portent cette catégorie, archivées comprises : c'est ce
  // qui est en jeu quand on masque ou qu'on renomme.
  const compterRessources = (cle) =>
    db().prepare('SELECT COUNT(*) AS n FROM academy_ressources WHERE categorie = ?').get(String(cle || '')).n;

  // Réordonner les catégories. Même forme que celle des ressources : tous les
  // rangs réécrits en une transaction, dans l'ordre reçu. Elle ne touche QUE la
  // colonne `ordre` de cette table — aucune ressource n'est lue ni écrite, donc
  // réordonner ne peut pas en déplacer une.
  function reordonnerCategories(cles) {
    assurerSchema();
    if (!Array.isArray(cles) || !cles.length) return err(400, 'Aucune catégorie à ordonner.');
    const lignes = cles.map((c) => lireCategorie(c));
    if (lignes.some((l) => !l)) return err(404, 'Catégorie introuvable.');
    const maintenant = nowIso();
    const dd = db();
    dd.transaction(() => {
      const maj = dd.prepare('UPDATE academy_ressource_categories SET ordre = ?, maj_le = ? WHERE cle = ?');
      lignes.forEach((l, i) => maj.run(i + 1, maintenant, l.cle));
    })();
    return ok({ ordre: lignes.map((l) => l.cle) });
  }

  // -- Les ressources --------------------------------------------------------

  // LA VUE QUI PART À L'ÉCRAN. Elle ne porte JAMAIS les octets, et elle
  // revalide l'identifiant YouTube et l'URL : ce qui finit dans un attribut
  // `src` ou `href` ne doit pas dépendre de ce qu'une base contient.
  const vue = (r) => (r ? {
    id: r.id,
    type: r.type,
    titre: r.titre,
    description: r.description || '',
    categorie: r.categorie || null,
    categorieLibelle: r.categorie_libelle || null,
    youtubeId: idYoutubeValide(r.youtube_id) ? r.youtube_id : null,
    url: urlValide(r.url) ? r.url : null,
    // On expose l'existence et le poids du fichier, jamais son identifiant
    // interne : le fichier se demande PAR la ressource (/ressources/:id/fichier),
    // ce qui laisse un seul chemin à garder.
    fichier: r.fichier_id ? {
      nom: r.fichier_nom || 'document',
      mime: r.fichier_mime || 'application/octet-stream',
      taille: r.fichier_taille || 0,
    } : null,
    ordre: r.ordre,
    actif: !!r.actif,
    majLe: r.maj_le,
  } : null);

  const SELECT = `
    SELECT r.*, c.libelle AS categorie_libelle,
           f.nom AS fichier_nom, f.mime AS fichier_mime, f.taille AS fichier_taille
    FROM academy_ressources r
    LEFT JOIN academy_ressource_categories c ON c.cle = r.categorie
    LEFT JOIN academy_ressource_fichiers f ON f.id = r.fichier_id`;

  function lire(id) {
    assurerSchema();
    return vue(db().prepare(`${SELECT} WHERE r.id = ?`).get(Number(id)));
  }

  // La bibliothèque telle que l'écran la reçoit. LES TROIS FILTRES SONT
  // APPLIQUÉS ICI, pas côté navigateur : filtrer à l'écran obligerait à
  // envoyer toute la bibliothèque à chaque ouverture, et le jour où elle
  // compte trois cents fiches, ça se voit.
  function lister({ q, categorie, type, toutes = false } = {}) {
    assurerSchema();
    const conditions = [];
    const valeurs = [];
    if (!toutes) conditions.push('r.actif = 1');

    const t = String(type || '').trim().toLowerCase();
    if (t && t !== 'tous') {
      if (!TYPES.includes(t)) return [];
      conditions.push('r.type = ?');
      valeurs.push(t);
    }

    const cat = String(categorie || '').trim().toLowerCase();
    if (cat && cat !== 'toutes') {
      conditions.push('r.categorie = ?');
      valeurs.push(cat);
    }

    // La recherche porte sur le titre ET la description : chercher « facture »
    // doit trouver la fiche dont seul le résumé le dit. LIKE avec des jokers de
    // part et d'autre ; on échappe les caractères que LIKE interprète, sinon un
    // « % » saisi ramènerait toute la bibliothèque.
    const mot = String(q || '').trim().toLowerCase().slice(0, 80);
    if (mot) {
      const motif = '%' + mot.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
      conditions.push("(LOWER(r.titre) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(r.description, '')) LIKE ? ESCAPE '\\')");
      valeurs.push(motif, motif);
    }

    const ou = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    return db().prepare(`${SELECT} ${ou}
                         ORDER BY COALESCE(c.ordre, 9999) ASC, r.ordre ASC, r.id ASC`)
      .all(...valeurs).map(vue);
  }

  // -- Écriture --------------------------------------------------------------

  // Enregistrer un fichier envoyé. Le TYPE MIME est celui déclaré par l'envoi,
  // mais il est confronté à une liste fermée : un exécutable annoncé en PDF est
  // refusé, et un PDF annoncé en `text/html` aussi — c'est ce dernier cas qui
  // compte, puisque le navigateur exécuterait le HTML sous notre origine.
  function enregistrerFichier({ mime, nom, data }) {
    assurerSchema();
    const m = String(mime || '').split(';')[0].trim().toLowerCase();
    if (!MIMES_ACCEPTES.includes(m)) {
      return err(415, 'Format non supporté. Attendu : PDF, JPG, PNG ou WebP.');
    }
    if (!data || !data.length) return err(400, 'Fichier vide.');
    if (data.length > TAILLE_MAX) {
      return err(413, `Fichier trop lourd : ${Math.round(TAILLE_MAX / 1024 / 1024)} Mo au maximum.`);
    }
    const defaut = m === 'application/pdf' ? 'document.pdf' : 'image';
    const info = db().prepare(`INSERT INTO academy_ressource_fichiers (mime, nom, taille, data, cree_le)
                               VALUES (?,?,?,?,?)`)
      .run(m, nomPropre(nom, defaut), data.length, data, nowIso());
    return ok({
      fichierId: Number(info.lastInsertRowid),
      mime: m,
      nom: nomPropre(nom, defaut),
      taille: data.length,
      // Le type de ressource que ce fichier permet : l'écran n'a pas à le
      // déduire d'une extension.
      type: MIMES[TYPE_PDF].includes(m) ? TYPE_PDF : TYPE_IMAGE,
    });
  }

  // Les octets, pour la route qui les sert. Seule fonction du module qui charge
  // un BLOB — tout le reste travaille sur les fiches.
  function lireFichierDe(ressourceId) {
    assurerSchema();
    const r = db().prepare(`SELECT f.mime, f.nom, f.taille, f.data
                            FROM academy_ressources r
                            JOIN academy_ressource_fichiers f ON f.id = r.fichier_id
                            WHERE r.id = ? AND r.actif = 1`).get(Number(ressourceId));
    return r || null;
  }

  // CRÉER OU MODIFIER. Une seule fonction, distinguées par la présence d'un
  // `id` — comme definirModule / definirContenu de l'administration.
  //
  //  LE POINT DUR EST LA VALIDATION PAR TYPE. Une ressource incomplète ne doit
  //  pas exister : un PDF sans fichier afficherait une carte « Télécharger »
  //  qui ne télécharge rien. On refuse à l'écriture plutôt que d'inventer un
  //  état « brouillon » que personne n'a demandé.
  function definir(donnees, auteur) {
    assurerSchema();
    const d = donnees || {};
    const existante = d.id ? lire(d.id) : null;
    if (d.id && !existante) return err(404, 'Ressource introuvable.');

    const type = String(d.type || (existante ? existante.type : '')).trim().toLowerCase();
    if (!TYPES.includes(type)) {
      return err(400, `Type de ressource inconnu. Attendu : ${TYPES.join(', ')}.`);
    }

    const titre = String(d.titre === undefined && existante ? existante.titre : (d.titre || '')).trim().slice(0, 160);
    if (!titre) return err(400, 'Le titre de la ressource est requis.');

    const description = d.description === undefined
      ? (existante ? existante.description : '')
      : String(d.description || '').trim().slice(0, 600);

    // La sous-catégorie, même règle que la catégorie d'une formation : absente
    // du corps, elle NE S'EFFACE PAS. Le formulaire n'envoie pas toujours tout.
    let categorie;
    if (d.categorie === undefined) {
      categorie = existante ? existante.categorie : null;
    } else if (d.categorie === null || String(d.categorie).trim() === '') {
      categorie = null;
    } else {
      categorie = String(d.categorie).trim().toLowerCase();
      const c = lireCategorie(categorie);
      if (!c) return err(400, `Catégorie inconnue : « ${categorie} ».`);
    }

    // -- Ce que le type exige, et lui seul. Les champs des AUTRES types sont
    //    remis à null : changer une fiche « lien » en « vidéo » ne doit pas
    //    laisser traîner une URL que plus rien n'affiche.
    let youtube = null;
    let url = null;
    let fichierId = null;

    if (type === TYPE_VIDEO) {
      const brut = d.youtubeId === undefined && existante ? existante.youtubeId : d.youtubeId;
      youtube = extraireIdYoutube(brut);
      if (!youtube) {
        return err(400, 'Identifiant YouTube invalide. Colle l\'URL de la vidéo ou son identifiant (11 caractères).');
      }
    } else if (type === TYPE_LIEN) {
      const brut = d.url === undefined && existante ? existante.url : d.url;
      url = String(brut || '').trim();
      if (!urlValide(url)) return err(400, 'Lien invalide : une adresse http(s) est attendue.');
    } else {
      // pdf | image : un fichier est obligatoire. On accepte celui qui vient
      // d'être envoyé, ou celui que la fiche portait déjà.
      const brut = d.fichierId === undefined || d.fichierId === null || d.fichierId === ''
        ? (existante && existante.fichier ? fichierIdDe(existante.id) : null)
        : Number(d.fichierId);
      if (!Number.isInteger(brut) || brut <= 0) {
        return err(400, type === TYPE_PDF ? 'Envoie le fichier PDF de la ressource.' : 'Envoie l\'image de la ressource.');
      }
      const f = db().prepare('SELECT id, mime FROM academy_ressource_fichiers WHERE id = ?').get(brut);
      if (!f) return err(404, 'Fichier introuvable : renvoie-le.');
      // Le fichier doit correspondre au type annoncé : un PDF déclaré « image »
      // s'afficherait dans une balise <img> qui ne montrerait rien.
      if (!MIMES[type].includes(f.mime)) {
        return err(400, type === TYPE_PDF
          ? 'Ce fichier n\'est pas un PDF.'
          : 'Ce fichier n\'est pas une image (JPG, PNG ou WebP).');
      }
      fichierId = f.id;
    }

    const entier = (v, defaut) => {
      if (v === undefined || v === null || v === '') return defaut;
      const n = Number(v);
      return Number.isInteger(n) && n >= 0 && n <= 9999 ? n : null;
    };
    // Le rang suivant se compte DANS LA SOUS-CATÉGORIE : c'est là que l'écran
    // groupe les fiches, donc là que l'ordre a un sens.
    const suivant = categorie
      ? (db().prepare('SELECT MAX(ordre) AS n FROM academy_ressources WHERE categorie = ?').get(categorie).n || 0)
      : (db().prepare('SELECT MAX(ordre) AS n FROM academy_ressources WHERE categorie IS NULL').get().n || 0);
    const ordre = entier(d.ordre, existante ? existante.ordre : suivant + 1);
    if (ordre === null) return err(400, 'Ordre invalide.');
    const actif = d.actif === undefined || d.actif === null ? (existante ? existante.actif : true) : !!d.actif;

    const maintenant = nowIso();
    const dd = db();
    let id = existante ? existante.id : null;
    dd.transaction(() => {
      if (existante) {
        // Le fichier REMPLACÉ part avec la mise à jour : plus rien ne le
        // référence, et un BLOB orphelin de 20 Mo dans une base sauvegardée
        // entière n'est pas un détail.
        const ancien = fichierIdDe(existante.id);
        dd.prepare(`UPDATE academy_ressources SET type = ?, titre = ?, description = ?, categorie = ?,
                      youtube_id = ?, url = ?, fichier_id = ?, ordre = ?, actif = ?, maj_le = ?
                    WHERE id = ?`)
          .run(type, titre, description, categorie, youtube, url, fichierId, ordre, actif ? 1 : 0,
            maintenant, existante.id);
        if (ancien && ancien !== fichierId) {
          dd.prepare('DELETE FROM academy_ressource_fichiers WHERE id = ?').run(ancien);
        }
      } else {
        const info = dd.prepare(`INSERT INTO academy_ressources
            (type, titre, description, categorie, youtube_id, url, fichier_id, ordre, actif, cree_le, maj_le, cree_par)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(type, titre, description, categorie, youtube, url, fichierId, ordre, actif ? 1 : 0,
            maintenant, maintenant, auteur || null);
        id = Number(info.lastInsertRowid);
      }
    })();
    return ok({ ressource: lire(id) });
  }

  const fichierIdDe = (id) => {
    const r = db().prepare('SELECT fichier_id AS f FROM academy_ressources WHERE id = ?').get(Number(id));
    return r && r.f ? Number(r.f) : null;
  };

  // Archiver / restaurer. Le geste ordinaire : la fiche disparaît de la
  // bibliothèque, ses octets restent, et un clic la rend.
  function basculerActif(id, actif) {
    assurerSchema();
    const r = lire(id);
    if (!r) return err(404, 'Ressource introuvable.');
    db().prepare('UPDATE academy_ressources SET actif = ?, maj_le = ? WHERE id = ?')
      .run(actif ? 1 : 0, nowIso(), r.id);
    return ok({ ressource: lire(r.id) });
  }

  // Supprimer pour de bon, fichier compris. LÉGITIME ICI, et nulle part
  // ailleurs dans l'Academy : aucune progression, aucune tentative, aucune
  // évaluation ne pointe vers une ressource — il n'y a rien à emporter en
  // cascade. C'est ce qui distingue une bibliothèque d'un parcours.
  function supprimer(id) {
    assurerSchema();
    const r = lire(id);
    if (!r) return err(404, 'Ressource introuvable.');
    const dd = db();
    const fichier = fichierIdDe(r.id);
    dd.transaction(() => {
      dd.prepare('DELETE FROM academy_ressources WHERE id = ?').run(r.id);
      if (fichier) dd.prepare('DELETE FROM academy_ressource_fichiers WHERE id = ?').run(fichier);
    })();
    return ok({ supprimee: r.id });
  }

  // Réordonner, sur le modèle de l'administration des contenus : tous les
  // frères réécrits en une transaction, dans l'ordre reçu. On n'ordonne que des
  // fiches d'une MÊME sous-catégorie — c'est l'ensemble que l'écran affiche.
  function reordonner(ids) {
    assurerSchema();
    if (!Array.isArray(ids) || !ids.length) return err(400, 'Aucune ressource à ordonner.');
    const lignes = ids.map((i) =>
      db().prepare('SELECT id, categorie FROM academy_ressources WHERE id = ?').get(Number(i)));
    if (lignes.some((l) => !l)) return err(404, 'Ressource introuvable.');
    const familles = new Set(lignes.map((l) => String(l.categorie || '')));
    if (familles.size > 1) {
      return err(400, 'On ne peut ordonner que des ressources d\'une même catégorie.');
    }
    const maintenant = nowIso();
    const dd = db();
    dd.transaction(() => {
      const maj = dd.prepare('UPDATE academy_ressources SET ordre = ?, maj_le = ? WHERE id = ?');
      lignes.forEach((l, i) => maj.run(i + 1, maintenant, l.id));
    })();
    return ok({ ordre: lignes.map((l) => l.id) });
  }

  return {
    assurerSchema, amorcer,
    listerCategories, lireCategorie, definirCategorie, basculerCategorie,
    reordonnerCategories, compterRessources,
    lister, lire, definir, basculerActif, supprimer, reordonner,
    enregistrerFichier, lireFichierDe,
  };
}

// UNE URL YOUTUBE OU UN IDENTIFIANT — l'un ou l'autre. Personne ne devrait
// avoir à extraire onze caractères à la main d'une adresse copiée depuis la
// barre du navigateur ; on accepte les trois formes que YouTube produit.
function extraireIdYoutube(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  if (idYoutubeValide(s)) return s;
  let u;
  try { u = new URL(s); } catch (_) { return null; }
  const hote = u.hostname.replace(/^www\./, '');
  let candidat = '';
  if (hote === 'youtu.be') candidat = u.pathname.slice(1);
  else if (hote === 'youtube.com' || hote === 'm.youtube.com' || hote === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') candidat = u.searchParams.get('v') || '';
    else if (u.pathname.startsWith('/embed/')) candidat = u.pathname.slice(7);
    else if (u.pathname.startsWith('/shorts/')) candidat = u.pathname.slice(8);
    else if (u.pathname.startsWith('/live/')) candidat = u.pathname.slice(6);
  }
  candidat = candidat.split('/')[0].split('?')[0];
  return idYoutubeValide(candidat) ? candidat : null;
}

module.exports = {
  createAcademyRessources, extraireIdYoutube, urlValide, nomPropre,
  TYPES, TYPE_PDF, TYPE_IMAGE, TYPE_VIDEO, TYPE_LIEN,
  MIMES, MIMES_ACCEPTES, TAILLE_MAX, CATEGORIES_AMORCE, CATEGORIES_RENOMMEES, cleValide,
};
