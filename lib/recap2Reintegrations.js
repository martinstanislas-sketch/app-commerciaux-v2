'use strict';
// ============================================================================
//  RECAP 2 — RÉINTÉGRATION MANUELLE D'UNE VENTE DÉTECTÉE « ANNULÉE ».
//
//  La collecte marque `annulee: true` une vente annulée dans Vendor. Un
//  administrateur peut décider qu'elle doit malgré tout COMPTER : « Réintégrer
//  dans les chiffres ». Réversible par « Remettre en annulée ».
//
//  ⚠️ APPLIQUÉE À LA LECTURE, EN PREMIER, JAMAIS ÉCRITE DANS LE JSON MENSUEL :
//  la ligne réintégrée passe `annulee: false` dans la COPIE servie à l'écran,
//  avant les cases manuelles, le contrôle automatique et les remarques. Tout ce
//  qui se calcule depuis les lignes la traite donc comme une vente active :
//  nombre de ventes, filtre « Annulées », contrats validés, cases Prélèvement /
//  Réservation / Résilié, remarques automatiques. Le rapport brut reste intact,
//  Deciplus et Vendor ne sont jamais touchés.
//
//  ⚠️ LA SOURCE RESTE DITE : `annulationAuto` garde la détection d'origine
//  (« Détectée automatiquement comme annulée le … »), `reintegration` dit qui
//  a décidé et quand. Statut final dans les KPI : « Vente comptabilisée ».
//
//  ⚠️ SI LA SOURCE CHANGE : une vente qui n'est plus annulée à la collecte
//  suivante n'a plus besoin du forçage — on le SIGNALE (`plusNecessaire`),
//  sans rien effacer : la décision et son historique restent.
//
//  CLÉ D'UNE VENTE : mois · studio · cleVente (identité + date de signature),
//  la même que les cases manuelles (lib/recap2Checks.js).
// ============================================================================

const { cleVente } = require('./recap2Checks.js');

const MOIS_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DECISIONS = ['reintegree', 'maintenue'];

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS recap2_reintegrations (
    mois        TEXT NOT NULL,
    studio      TEXT NOT NULL,
    cle_vente   TEXT NOT NULL,
    client      TEXT NOT NULL DEFAULT '',
    date_vente  TEXT NOT NULL DEFAULT '',
    decision    TEXT NOT NULL,            -- reintegree | maintenue
    annulee_le  TEXT NOT NULL DEFAULT '', -- date d'annulation détectée, au moment de la décision
    modifie_le  TEXT NOT NULL,
    modifie_par TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (mois, studio, cle_vente)
  );
  CREATE TABLE IF NOT EXISTS recap2_reintegrations_historique (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    mois        TEXT NOT NULL,
    studio      TEXT NOT NULL,
    cle_vente   TEXT NOT NULL,
    client      TEXT NOT NULL DEFAULT '',
    avant       TEXT NOT NULL DEFAULT '',
    apres       TEXT NOT NULL,
    le          TEXT NOT NULL,
    par         TEXT NOT NULL DEFAULT ''
  );
`;
function creerTable(db) { db.exec(SCHEMA); }

function decider(db, { mois, studio, ligne, decision, par = '' }, maintenant = new Date().toISOString()) {
  if (!MOIS_RE.test(String(mois || ''))) throw new Error('mois invalide');
  if (DECISIONS.indexOf(decision) < 0) throw new Error('décision : reintegree ou maintenue');
  const cle = cleVente(ligne || {});
  if (!cle) throw new Error('vente non identifiable');
  const qui = String(par || '').slice(0, 80);
  const ancien = db.prepare('SELECT decision FROM recap2_reintegrations WHERE mois = ? AND studio = ? AND cle_vente = ?').get(mois, studio, cle);
  const avant = ancien ? ancien.decision : '';
  db.transaction(() => {
    db.prepare(`INSERT INTO recap2_reintegrations (mois, studio, cle_vente, client, date_vente, decision, annulee_le, modifie_le, modifie_par)
      VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(mois, studio, cle_vente) DO UPDATE SET decision = excluded.decision, client = excluded.client,
        annulee_le = CASE WHEN excluded.annulee_le <> '' THEN excluded.annulee_le ELSE recap2_reintegrations.annulee_le END,
        modifie_le = excluded.modifie_le, modifie_par = excluded.modifie_par`)
      .run(mois, studio, cle, String(ligne.client || '').trim(), String(ligne.date || ''), decision, String(ligne.dateAnnulation || ''), maintenant, qui);
    if (avant !== decision) {
      db.prepare(`INSERT INTO recap2_reintegrations_historique (mois, studio, cle_vente, client, avant, apres, le, par) VALUES (?,?,?,?,?,?,?,?)`)
        .run(mois, studio, cle, String(ligne.client || '').trim(), avant, decision, maintenant, qui);
    }
  })();
  return { decision, modifieLe: maintenant, modifiePar: qui };
}

function decisionsDuMois(db, mois) {
  const idx = new Map();
  db.prepare('SELECT * FROM recap2_reintegrations WHERE mois = ?').all(mois).forEach((r) => idx.set(r.studio + '|' + r.cle_vente, r));
  return idx;
}
function historique(db, mois) {
  return db.prepare('SELECT * FROM recap2_reintegrations_historique WHERE mois = ? ORDER BY id').all(mois);
}

// Copie profonde ; seules les lignes de ventes concernées changent.
function appliquer(rapport, idx) {
  if (!rapport || !rapport.studios || !idx || !idx.size) return rapport;
  const copie = JSON.parse(JSON.stringify(rapport));
  Object.keys(copie.studios).forEach((s) => {
    const b = copie.studios[s] && copie.studios[s].clientsRetrouves;
    if (!b || !Array.isArray(b.liste)) return;
    b.liste.forEach((l) => {
      const d = idx.get(s + '|' + cleVente(l));
      if (!d) return;
      const trace = { modifieLe: d.modifie_le, modifiePar: d.modifie_par };
      if (d.decision === 'reintegree' && l.annulee === true) {
        l.annulee = false;
        // Les compteurs SERVIS suivent (le JSON brut, lui, ne change pas) : une
        // vente active et un signataire de plus, une annulée de moins, taux recalculé.
        b.annulees = Math.max(0, (Number(b.annulees) || 0) - 1);
        if (Number.isFinite(Number(b.ventesActives))) b.ventesActives = Number(b.ventesActives) + 1;
        if (Number.isFinite(Number(b.signataires))) b.signataires = Number(b.signataires) + 1;
        if (b.annulesExclus != null) b.annulesExclus = Math.max(0, (Number(b.annulesExclus) || 0) - 1);
        if (Number.isFinite(Number(b.retrouves)) && b.signataires > 0) {
          b.taux = Number(b.retrouves) / b.signataires;
          b.tauxPct = +(b.taux * 100).toFixed(1);
        }
        l.annulationAuto = { dateAnnulation: l.dateAnnulation || d.annulee_le || '' };
        l.reintegration = Object.assign({ decision: 'reintegree', statutFinal: 'Vente comptabilisée' }, trace);
      } else if (d.decision === 'reintegree') {
        // La source ne dit plus « annulée » : le forçage n'est plus nécessaire.
        l.reintegration = Object.assign({ decision: 'reintegree', plusNecessaire: true, annuleeLe: d.annulee_le }, trace);
      } else if (l.annulee === true) {
        l.reintegration = Object.assign({ decision: 'maintenue' }, trace);
      }
    });
  });
  return copie;
}

// La ligne brute (avant décisions) d'une vente annulée — ou déjà réintégrée.
function ligneDe(rapport, { studio, client, date }) {
  const b = rapport && rapport.studios && rapport.studios[studio] && rapport.studios[studio].clientsRetrouves;
  const cle = cleVente({ client, date });
  if (!b || !cle) return null;
  const memes = (b.liste || []).filter((l) => cleVente(l) === cle);
  return memes.length ? memes[0] : null;
}

module.exports = { SCHEMA, DECISIONS, creerTable, decider, decisionsDuMois, historique, appliquer, ligneDe };
