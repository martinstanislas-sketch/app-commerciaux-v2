'use strict';
// ============================================================================
//  RECAP 2 — LES ACQUITTEMENTS MANUELS D'UN ADMINISTRATEUR.
//
//  DEUX TYPES, même principe, même table :
//    · `vente` — une vente que la collecte n'a PAS retrouvée dans Deciplus est
//      vérifiée à la main après contrôle humain. Elle s'affiche « Vérifiée
//      manuellement ✅ » — jamais « Retrouvée » — et compte comme conforme
//      dans le pourcentage « Contrats validés » ;
//    · `site`  — l'alerte « Site Deciplus divergent » d'une vente retrouvée est
//      acquittée. Elle s'affiche « Écart de site vérifié ✅ », sort du compteur
//      et du filtre des sites divergents. L'attribution de la vente au studio
//      n'est PAS touchée : aucun compteur ne change de studio.
//
//  ⚠️ LE RÉSULTAT AUTOMATIQUE EST CONSERVÉ INTACT. Ni `retrouve` ni `site` ne
//  sont JAMAIS modifiés : on sait donc toujours ce que la collecte, elle, a
//  trouvé. C'est ce qui rend le statut honnête et la traçabilité possible.
//
//  ⚠️ AUCUNE ÉCRITURE AILLEURS. Rien n'est créé ni modifié dans Deciplus, ni
//  dans le rapport mensuel, ni dans une case de contrôle : une ligne ici, et
//  c'est tout. Qui a validé et quand sont enregistrés.
//
//  ⚠️ EN BASE, JAMAIS DANS LE JSON MENSUEL, qui est remplacé à chaque collecte
//  (même principe que lib/recap2Checks.js) : la décision survit aux
//  recollectes, aux nouveaux contrôles automatiques et aux redéploiements.
//
//  ⚠️ LA CLÉ D'UNE VENTE : mois · studio · identité normalisée · date de
//  signature (cleVente de lib/recap2Checks.js) — la même que les cases et les
//  forçages. Annuler = supprimer la ligne : la vente redevient « À vérifier ».
// ============================================================================

const { cleVente } = require('./recap2Checks.js');

const MOIS_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const VALEURS = ['verifiee', 'a_verifier'];
const TYPES = ['vente', 'site'];

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS recap2_verifications (
    mois        TEXT NOT NULL,
    studio      TEXT NOT NULL,
    cle_vente   TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'vente',  -- vente (à vérifier) | site (écart)
    client      TEXT NOT NULL DEFAULT '',
    date_vente  TEXT NOT NULL DEFAULT '',
    modifie_le  TEXT NOT NULL,              -- ISO, date et heure de la validation
    modifie_par TEXT NOT NULL DEFAULT '',   -- qui a validé
    PRIMARY KEY (mois, studio, cle_vente, type)
  );
  CREATE INDEX IF NOT EXISTS idx_recap2_verif_mois ON recap2_verifications (mois);
`;

function creerTable(db) { db.exec(SCHEMA); }

// valeur : 'verifiee' (acquitter) ou 'a_verifier' (annuler l'acquittement).
// type   : 'vente' (vente à vérifier) ou 'site' (écart de site).
function verifier(db, { mois, studio, client, date, valeur, type = 'vente', par = '' }, maintenant = new Date().toISOString()) {
  if (!MOIS_RE.test(mois)) throw new Error('mois AAAA-MM requis');
  if (VALEURS.indexOf(valeur) < 0) throw new Error('valeur : verifiee ou a_verifier');
  if (TYPES.indexOf(type) < 0) throw new Error('type : vente ou site');
  const cle = cleVente({ client, date });
  if (!cle) throw new Error('vente non identifiable');
  if (valeur === 'a_verifier') {
    db.prepare('DELETE FROM recap2_verifications WHERE mois = ? AND studio = ? AND cle_vente = ? AND type = ?').run(mois, studio, cle, type);
    return { type, verifiee: false };
  }
  const qui = String(par).slice(0, 80);
  db.prepare(`INSERT OR REPLACE INTO recap2_verifications (mois, studio, cle_vente, type, client, date_vente, modifie_le, modifie_par)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(mois, studio, cle, type, client, date, maintenant, qui);
  return { type, verifiee: true, modifieLe: maintenant, modifiePar: qui };
}

function verificationsDuMois(db, mois) {
  const idx = new Map();
  db.prepare('SELECT * FROM recap2_verifications WHERE mois = ?').all(mois).forEach((r) => {
    const k = r.studio + '|' + r.cle_vente;
    if (!idx.has(k)) idx.set(k, {});
    idx.get(k)[r.type || 'vente'] = { verifiee: true, modifieLe: r.modifie_le, modifiePar: r.modifie_par };
  });
  return idx;
}

// À appliquer APRÈS Recap2Matches (qui peut rendre une vente « retrouvée ») :
// un acquittement devenu sans objet (vente retrouvée depuis, écart disparu) est
// simplement ignoré à l'affichage — sa ligne reste en base, rien n'est perdu.
function appliquer(rapport, index) {
  if (!rapport || !rapport.studios || !index || !index.size) return rapport;
  const copie = JSON.parse(JSON.stringify(rapport));
  Object.keys(copie.studios).forEach((s) => {
    const cr = copie.studios[s] && copie.studios[s].clientsRetrouves;
    if (!cr || !Array.isArray(cr.liste)) return;
    cr.liste.forEach((l) => {
      if (l.annulee) return;
      const e = index.get(s + '|' + cleVente(l));
      if (!e) return;
      const pose = (q) => ({ verifiee: true, modifieLe: q.modifieLe, modifiePar: q.modifiePar });
      if (e.vente && !l.retrouve) l.verification = pose(e.vente);
      if (e.site && l.retrouve) l.ecartSite = pose(e.site);
    });
  });
  return copie;
}

// Une vente peut-elle être acquittée ? Jamais si elle est annulée.
//  · vente : seulement si elle n'est PAS retrouvée (sinon il n'y a rien à vérifier) ;
//  · site  : seulement si elle EST retrouvée (l'écart de site n'existe que là).
function verifiable(l, type = 'vente') {
  if (!l || l.annulee) return false;
  return type === 'site' ? !!l.retrouve : !l.retrouve;
}

module.exports = { SCHEMA, VALEURS, TYPES, creerTable, verifier, verificationsDuMois, appliquer, verifiable };
