'use strict';
// ============================================================================
//  MY COACH ACADEMY — L'IMAGE DE COUVERTURE D'UNE FORMATION.
//
//  Une illustration, et rien d'autre. Ce module ne sait pas ce qu'est un
//  module, un contenu, un QCM ou une certification : il associe une clé de
//  formation à des octets d'image. Retirer une couverture ne retire rien
//  d'autre ; ne pas en poser laisse la formation entière.
//
//  POURQUOI UNE TABLE À PART, ET PAS UNE COLONNE DANS academy_formations.
//  Parce que academy_formations est le PIVOT du moteur : tout le monde la lit,
//  et `lister()` la renvoie en entier à chaque appel de catalogue. Y ranger un
//  BLOB de 150 Ko ferait voyager l'image à chaque lecture de réglages, de seuil
//  de QCM ou de statut de publication. La table séparée garde le catalogue
//  léger — c'est la même raison qui sépare déjà la fiche d'une ressource de ses
//  octets (lib/academyRessources.js).
//
//  ET POURQUOI PAS academy_ressource_fichiers, PUISQU'IL EXISTE DÉJÀ.
//  Parce que le moteur de la Boîte à outils est délibérément coupé du parcours
//  — un test vérifie qu'il ne sait nommer aucune table de formation. Lui faire
//  porter les couvertures rétablirait exactement le lien qu'on a pris soin de
//  ne pas créer. On réutilise le PATRON (BLOB en base, envoi en corps brut,
//  route qui sert les octets), pas la table.
//
//  OÙ VIVENT LES OCTETS : dans SQLite, donc sur le volume monté, comme les
//  photos de progression et les photos de plats (cf. l'en-tête de lib/db.js).
//  Rien sur le disque du conteneur, qui est reconstruit à chaque déploiement.
// ============================================================================

const { err, ok } = require('./boost');

// Trois formats, ceux que tout navigateur sait afficher. On lit le type
// DÉCLARÉ à l'envoi et on le confronte à cette liste : l'extension du nom de
// fichier, elle, est choisie par celui qui envoie.
const MIMES = ['image/jpeg', 'image/png', 'image/webp'];

// 4 Mo côté serveur. L'écran d'administration redimensionne et recomprime
// AVANT d'envoyer (une couverture y descend à quelques dizaines de Ko) ; cette
// limite n'est donc pas la taille attendue, c'est le garde-fou de ce qui
// arriverait si la compression échouait ou si quelqu'un appelait la route
// directement.
const TAILLE_MAX = 4 * 1024 * 1024;

const SCHEMA_COUVERTURES = `
-- Une ligne par formation qui porte une couverture. Pas de ligne = pas
-- d'image, et l'écran affiche son visuel de repli : une carte n'est jamais
-- cassée faute d'illustration.
CREATE TABLE IF NOT EXISTS academy_formation_couvertures (
  formation  TEXT PRIMARY KEY,
  mime       TEXT NOT NULL,
  taille     INTEGER NOT NULL,
  data       BLOB NOT NULL,
  maj_le     TEXT NOT NULL
);
`;

function createAcademyCouvertures({ getDb, nowIso, formations }) {
  const db = () => getDb();
  const normCle = (v) => String(v || '').trim().toLowerCase();

  const basesMigrees = new WeakSet();
  function assurerSchema() {
    const d = db();
    if (basesMigrees.has(d)) return true;
    d.exec(SCHEMA_COUVERTURES);
    basesMigrees.add(d);
    return true;
  }

  // L'ÉTAT DU CATALOGUE, SANS UN SEUL OCTET D'IMAGE. C'est ce que les routes
  // ajoutent au catalogue : « cette formation a-t-elle une couverture, et de
  // quand date-t-elle ». La date sert de repère de fraîcheur à l'écran, qui
  // garde les images en mémoire — sans elle, remplacer une image n'aurait
  // aucun effet visible avant un rechargement complet.
  function etat() {
    assurerSchema();
    const m = new Map();
    db().prepare('SELECT formation, maj_le AS majLe FROM academy_formation_couvertures').all()
      .forEach((r) => m.set(r.formation, r.majLe));
    return m;
  }

  // Les octets, pour la route qui les sert. Seule fonction qui charge un BLOB.
  function lire(cle) {
    assurerSchema();
    return db().prepare('SELECT mime, taille, data, maj_le AS majLe FROM academy_formation_couvertures WHERE formation = ?')
      .get(normCle(cle)) || null;
  }

  // Poser ou remplacer. UPSERT : une formation n'a qu'une couverture, et la
  // remplacer ne laisse pas l'ancienne derrière elle.
  function enregistrer(cle, { mime, data }) {
    assurerSchema();
    const f = formations.resoudre(cle, { inclureInactives: true });
    // On refuse une clé inconnue plutôt que de garder une image orpheline que
    // plus rien n'afficherait ni ne nettoierait.
    if (!f) return err(404, 'Formation inconnue.');

    const m = String(mime || '').split(';')[0].trim().toLowerCase();
    if (!MIMES.includes(m)) return err(415, 'Format non supporté. Attendu : JPG, PNG ou WebP.');
    if (!data || !data.length) return err(400, 'Image vide.');
    if (data.length > TAILLE_MAX) {
      return err(413, `Image trop lourde : ${Math.round(TAILLE_MAX / 1024 / 1024)} Mo au maximum.`);
    }

    const maintenant = nowIso();
    db().prepare(`INSERT INTO academy_formation_couvertures (formation, mime, taille, data, maj_le)
                  VALUES (?,?,?,?,?)
                  ON CONFLICT(formation) DO UPDATE SET mime = excluded.mime, taille = excluded.taille,
                    data = excluded.data, maj_le = excluded.maj_le`)
      .run(f.cle, m, data.length, data, maintenant);
    return ok({ formation: f.cle, mime: m, taille: data.length, majLe: maintenant });
  }

  // Retirer. La formation, elle, n'est pas touchée — elle retrouve simplement
  // le visuel de repli.
  function supprimer(cle) {
    assurerSchema();
    const info = db().prepare('DELETE FROM academy_formation_couvertures WHERE formation = ?').run(normCle(cle));
    return ok({ retirees: info.changes });
  }

  return { assurerSchema, etat, lire, enregistrer, supprimer };
}

module.exports = { createAcademyCouvertures, MIMES, TAILLE_MAX };
