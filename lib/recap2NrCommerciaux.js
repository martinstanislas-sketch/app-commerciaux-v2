'use strict';
// ============================================================================
//  RECAP 2 — LE COMMERCIAL RESPONSABLE D'UN CLIENT NON RECONDUIT, CHOISI À LA MAIN.
//
//  L'attribution AUTOMATIQUE vient du rapport (`vendeurOrigine`, première vente
//  Deciplus à vendeur, par Id_client) et de la table explicite des vendeurs
//  (public/recap2-metrics.js). Ce module ne stocke que la RÉATTRIBUTION MANUELLE,
//  qui l'emporte toujours — « Non attribué » compris (commercial_cle = '').
//  Revenir à l'automatique = supprimer la marque.
//
//  ⚠️ SANS AUCUN EFFET SUR UN KPI, NI SUR LA VENTE HISTORIQUE. C'est le
//  responsable du suivi dans RECAP 2, rien d'autre : `appliquer()` ajoute un
//  champ `attribution` aux lignes et ne touche à aucun compteur ni à
//  `vendeurOrigine`.
//
//  ⚠️ EN BASE, JAMAIS DANS LE JSON MENSUEL : le JSON est remplacé à chaque
//  collecte, un choix écrit dedans serait perdu.
//
//  ⚠️ LA CLÉ : exactement celle des statuts de suivi (lib/recap2NrStatuts.js) —
//  mois · studio · « id:<Id membre> », ou l'identité normalisée si le rapport
//  n'a pas d'Id. Jamais une marque d'un homonyme à l'Id différent.
// ============================================================================

const { cleIdentite } = require('./recap2Matches.js');

const MOIS_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const ID_RE = /^[0-9]{1,20}$/;
// Clé d'un commercial : identifiant Vendor, ou nom exact (commercial sans id).
const CLE_COMMERCIAL_RE = /^(id:[0-9a-z]{6,60}|nom:.{1,80})$/i;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS recap2_nr_commerciaux (
    mois            TEXT NOT NULL,             -- AAAA-MM, mois du rapport (M)
    studio          TEXT NOT NULL,
    cle_client      TEXT NOT NULL,             -- « id:<Id membre> » ou « nom:<identité triée> »
    id_client       TEXT NOT NULL DEFAULT '',
    cle_nom         TEXT NOT NULL DEFAULT '',
    client          TEXT NOT NULL DEFAULT '',  -- graphie du rapport au moment du choix
    commercial_cle  TEXT NOT NULL DEFAULT '',  -- « id:<Vendor> » / « nom:<exact> » ; '' = Non attribué
    commercial_nom  TEXT NOT NULL DEFAULT '',  -- libellé affiché au moment du choix
    modifie_le      TEXT NOT NULL,
    modifie_par     TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (mois, studio, cle_client)
  );
  CREATE INDEX IF NOT EXISTS idx_recap2_nr_commerciaux_mois ON recap2_nr_commerciaux (mois);
`;

function creerTable(db) {
  db.exec(SCHEMA);
}

function cles({ mois, studio, client, idClient }) {
  if (!MOIS_RE.test(String(mois || ''))) throw new Error('mois invalide');
  const s = String(studio || '').trim();
  if (!s) throw new Error('studio requis');
  const nom = cleIdentite(client);
  if (!nom) throw new Error('client non identifiable');
  const id = ID_RE.test(String(idClient || '')) ? String(idClient) : '';
  return { s, nom, id, cle: id ? 'id:' + id : 'nom:' + nom };
}

// ─── ÉCRITURE ───────────────────────────────────────────────────────────────
//  `client` / `idClient` : ceux de la LIGNE DU RAPPORT (la route les relit).
//  `commercialCle` '' = « Non attribué » choisi explicitement.
function enregistrer(db, { mois, studio, client, idClient = '', commercialCle = '', commercialNom = '', par = '', maintenant = new Date() } = {}) {
  const k = cles({ mois, studio, client, idClient });
  const cc = String(commercialCle || '');
  if (cc && !CLE_COMMERCIAL_RE.test(cc)) throw new Error('commercial invalide');
  const cn = cc ? String(commercialNom || '').trim().slice(0, 80) : '';
  db.prepare(`INSERT INTO recap2_nr_commerciaux
      (mois, studio, cle_client, id_client, cle_nom, client, commercial_cle, commercial_nom, modifie_le, modifie_par)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(mois, studio, cle_client) DO UPDATE SET
      commercial_cle = excluded.commercial_cle, commercial_nom = excluded.commercial_nom,
      cle_nom = excluded.cle_nom, client = excluded.client,
      modifie_le = excluded.modifie_le, modifie_par = excluded.modifie_par`)
    .run(mois, k.s, k.cle, k.id, k.nom, String(client || '').trim(), cc, cn, maintenant.toISOString(), String(par || ''));
  return versAttribution(db.prepare('SELECT * FROM recap2_nr_commerciaux WHERE mois = ? AND studio = ? AND cle_client = ?').get(mois, k.s, k.cle));
}

// Retour à l'attribution automatique : on efface la marque de cette personne —
// celle posée par Id ET une éventuelle marque posée par identité avant que le
// rapport ne porte l'Id (jamais celle d'un homonyme à l'Id différent).
function supprimer(db, { mois, studio, client, idClient = '' } = {}) {
  const k = cles({ mois, studio, client, idClient });
  const r = db.prepare(`DELETE FROM recap2_nr_commerciaux
    WHERE mois = ? AND studio = ? AND (cle_client = ? OR (cle_nom = ? AND (id_client = '' OR ? = '' OR id_client = ?)))`)
    .run(mois, k.s, k.cle, k.nom, k.id, k.id);
  return r.changes;
}

function versAttribution(r) {
  return {
    manuel: true,
    cle: (r && r.commercial_cle) || '',
    nom: (r && r.commercial_cle && r.commercial_nom) || '',
    modifieLe: (r && r.modifie_le) || '',
    modifiePar: (r && r.modifie_par) || '',
  };
}

// ─── LECTURE ────────────────────────────────────────────────────────────────
function attributionsDuMois(db, mois) {
  const parId = new Map();
  const parNom = new Map();
  db.prepare('SELECT * FROM recap2_nr_commerciaux WHERE mois = ? ORDER BY modifie_le DESC').all(mois).forEach((r) => {
    if (r.id_client) {
      const k = r.studio + '|' + r.id_client;
      if (!parId.has(k)) parId.set(k, r);
    }
    const k = r.studio + '|' + r.cle_nom;
    if (!parNom.has(k)) parNom.set(k, []);
    parNom.get(k).push(r);
  });
  return { parId, parNom };
}

function marqueDe(index, studio, ligne) {
  const id = ID_RE.test(String(ligne.idClient || '')) ? String(ligne.idClient) : '';
  if (id && index.parId.has(studio + '|' + id)) return index.parId.get(studio + '|' + id);
  const candidates = index.parNom.get(studio + '|' + cleIdentite(ligne.client)) || [];
  return candidates.find((r) => !r.id_client || !id || r.id_client === id) || null;
}

// Pose `attribution` (choix manuel) sur les lignes qui en ont un. Copie profonde :
// le JSON sur disque n'est jamais modifié, et AUCUN compteur n'est touché.
function appliquer(rapport, index) {
  if (!rapport || !rapport.studios) return rapport;
  const copie = JSON.parse(JSON.stringify(rapport));
  Object.keys(copie.studios).forEach((s) => {
    const nr = copie.studios[s] && copie.studios[s].nonReconduction;
    if (!nr || !Array.isArray(nr.liste)) return;
    nr.liste.forEach((l) => {
      const r = marqueDe(index, s, l);
      if (r) l.attribution = versAttribution(r);
      else delete l.attribution;
    });
  });
  return copie;
}

module.exports = { SCHEMA, creerTable, enregistrer, supprimer, attributionsDuMois, appliquer, CLE_COMMERCIAL_RE };
