'use strict';
// ============================================================================
//  RECAP 2 — CONTRÔLE OPÉRATIONNEL AUTOMATIQUE : STOCKAGE ET LECTURE.
//
//  Le moteur (lib/recap2Operationnel.js) tourne sur le Mac, seul poste qui lit
//  Deciplus (crm-automation/recap2-operationnel.js). Son résultat est déposé
//  ici avec la clé RECAP2_INGEST_KEY, stocké EN BASE (comme les cases
//  manuelles, il survit à une recollecte) et APPLIQUÉ À LA LECTURE.
//
//  ⚠️ SÉPARÉ DES CASES MANUELLES ET DES KPI. Le résultat est posé dans
//  `ligne.automatique` ; la vue fusionnée dans `ligne.operationnel`. On ne
//  touche JAMAIS `controle` (la case « Prélèvement » alimente contratsValides),
//  `resiliation` (compteur « Résiliés »), `retrouve`, `idClient` ni un compteur.
//
//  ⚠️ PRIORITÉ AU MANUEL. Une case cochée à la main (`controle.prelevement` /
//  `controle.reservation` à true) ou une résiliation posée à la main
//  (`resiliation.resilie` à true) l'emporte sur l'automatique, et la vue le dit
//  (`sources`). Limite assumée : une case manuelle DÉCOCHÉE ne se distingue pas
//  d'une case jamais touchée — elle ne contredit donc pas un ✅ automatique.
// ============================================================================

const { cleVente } = require('./recap2Checks.js');
const OP = require('./recap2Operationnel.js');

const MOIS_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const VERDICTS = [OP.OK, OP.KO, OP.AV];
const ALERTES = Object.values(OP.ALERTES);
const HORODATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS recap2_controles_auto (
    mois          TEXT NOT NULL,
    studio        TEXT NOT NULL,
    cle_vente     TEXT NOT NULL,              -- même clé que recap2_manual_checks
    client        TEXT NOT NULL DEFAULT '',
    date_vente    TEXT NOT NULL DEFAULT '',
    id_deciplus   TEXT NOT NULL DEFAULT '',
    prelevement   TEXT NOT NULL,              -- ok / ko / a_verifier
    reservation   TEXT NOT NULL,
    resilie       TEXT NOT NULL,
    alertes       TEXT NOT NULL DEFAULT '[]', -- JSON, libellés de OP.ALERTES
    regles        TEXT NOT NULL DEFAULT '[]', -- JSON
    contrat       TEXT NOT NULL DEFAULT 'null',
    raison        TEXT NOT NULL DEFAULT '',
    attribution   TEXT NOT NULL DEFAULT 'null',
    controle_le   TEXT NOT NULL,              -- heure de Paris du contrôle Deciplus
    recu_le       TEXT NOT NULL,              -- ISO, réception serveur
    PRIMARY KEY (mois, studio, cle_vente)
  );
  CREATE INDEX IF NOT EXISTS idx_recap2_auto_mois ON recap2_controles_auto (mois);
`;
// FORÇAGES MANUELS À 3 ÉTATS : une ligne = « forcé ✅ » ou « forcé ❌ » ; pas de
// ligne = « automatique ». Table à part : ni les cases historiques
// (recap2_manual_checks, qui alimentent des compteurs) ni aucun KPI n'en dépendent.
// Clé = mois · studio · vente (cleVente) · champ : survit aux recollectes et aux
// nouveaux contrôles automatiques.
const SCHEMA_FORCAGES = `
  CREATE TABLE IF NOT EXISTS recap2_forcages (
    mois        TEXT NOT NULL,
    studio      TEXT NOT NULL,
    cle_vente   TEXT NOT NULL,
    champ       TEXT NOT NULL,              -- prelevement / reservation / resilie
    valeur      TEXT NOT NULL,              -- ok / ko
    client      TEXT NOT NULL DEFAULT '',
    date_vente  TEXT NOT NULL DEFAULT '',
    modifie_le  TEXT NOT NULL,
    modifie_par TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (mois, studio, cle_vente, champ)
  );
`;
const CHAMPS = ['prelevement', 'reservation', 'resilie'];
function creerTable(db) { db.exec(SCHEMA); db.exec(SCHEMA_FORCAGES); }

// valeur : 'ok' | 'ko' (forcé) ou 'auto' (retour à l'automatique = suppression).
function forcer(db, { mois, studio, client, date, champ, valeur, par = '' }, maintenant = new Date().toISOString()) {
  if (!MOIS_RE.test(mois)) throw new Error('mois AAAA-MM requis');
  if (!CHAMPS.includes(champ)) throw new Error('champ : prelevement, reservation ou resilie');
  if (![OP.OK, OP.KO, 'auto'].includes(valeur)) throw new Error('valeur : ok, ko ou auto');
  const cle = cleVente({ client, date });
  if (!cle) throw new Error('vente non identifiable');
  if (valeur === 'auto') {
    db.prepare('DELETE FROM recap2_forcages WHERE mois = ? AND studio = ? AND cle_vente = ? AND champ = ?').run(mois, studio, cle, champ);
    return { champ, valeur: 'auto' };
  }
  db.prepare(`INSERT OR REPLACE INTO recap2_forcages (mois, studio, cle_vente, champ, valeur, client, date_vente, modifie_le, modifie_par)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(mois, studio, cle, champ, valeur, client, date, maintenant, String(par).slice(0, 80));
  return { champ, valeur, modifieLe: maintenant, modifiePar: String(par).slice(0, 80) };
}

function forcagesDuMois(db, mois) {
  const idx = new Map();
  db.prepare('SELECT * FROM recap2_forcages WHERE mois = ?').all(mois).forEach((r) => {
    const k = r.studio + '|' + r.cle_vente;
    if (!idx.has(k)) idx.set(k, {});
    idx.get(k)[r.champ] = { valeur: r.valeur, modifieLe: r.modifie_le, modifiePar: r.modifie_par };
  });
  return idx;
}

// Validation d'un dépôt : forme stricte, et chaque vente DOIT exister dans le
// rapport du mois (aucun contrôle orphelin).
function valider(depot, rapport, venteExiste) {
  const pb = [];
  if (!depot || !Array.isArray(depot.resultats)) return ['resultats : tableau attendu'];
  if (!HORODATE_RE.test(String(depot.controleLe || ''))) pb.push('controleLe : AAAA-MM-JJTHH:MM attendu');
  depot.resultats.forEach((r, i) => {
    const ou = 'resultats[' + i + ']';
    if (!r || typeof r !== 'object') { pb.push(ou + ' : objet attendu'); return; }
    ['prelevement', 'reservation', 'resilie'].forEach((k) => { if (!VERDICTS.includes(r[k])) pb.push(ou + '.' + k + ' : ok / ko / a_verifier attendu'); });
    if (!Array.isArray(r.alertes) || r.alertes.some((a) => !ALERTES.includes(a))) pb.push(ou + '.alertes : alertes métier connues attendues');
    if (r.idDeciplus && !/^[0-9]{1,20}$/.test(String(r.idDeciplus))) pb.push(ou + '.idDeciplus : Id Deciplus attendu');
    if (!venteExiste(rapport, { studio: r.studio, client: r.client, date: r.date })) pb.push(ou + ' : vente absente du rapport');
  });
  return pb;
}

function enregistrer(db, mois, depot, maintenant = new Date().toISOString()) {
  if (!MOIS_RE.test(mois)) throw new Error('mois AAAA-MM requis');
  const ins = db.prepare(`INSERT OR REPLACE INTO recap2_controles_auto
    (mois, studio, cle_vente, client, date_vente, id_deciplus, prelevement, reservation, resilie, alertes, regles, contrat, raison, attribution, controle_le, recu_le)
    VALUES (@mois, @studio, @cle, @client, @date, @id, @p, @r, @x, @alertes, @regles, @contrat, @raison, @attribution, @controleLe, @recuLe)`);
  const tx = db.transaction((rows) => rows.forEach((r) => ins.run({
    mois, studio: r.studio, cle: cleVente({ client: r.client, date: r.date }), client: r.client, date: r.date, id: String(r.idDeciplus || ''),
    p: r.prelevement, r: r.reservation, x: r.resilie, alertes: JSON.stringify(r.alertes || []), regles: JSON.stringify(r.regles || []),
    contrat: JSON.stringify(r.contrat || null), raison: String(r.raison || '').slice(0, 300), attribution: JSON.stringify(r.attribution || null),
    controleLe: String(r.controleLe || depot.controleLe), recuLe: maintenant,
  })));
  tx(depot.resultats);
  return depot.resultats.length;
}

function resultatsDuMois(db, mois) {
  const idx = new Map();
  db.prepare('SELECT * FROM recap2_controles_auto WHERE mois = ?').all(mois).forEach((r) => {
    idx.set(r.studio + '|' + r.cle_vente, {
      prelevement: r.prelevement, reservation: r.reservation, resilie: r.resilie,
      alertes: JSON.parse(r.alertes), regles: JSON.parse(r.regles), contrat: JSON.parse(r.contrat),
      raison: r.raison, attribution: JSON.parse(r.attribution), idDeciplus: r.id_deciplus, controleLe: r.controle_le,
    });
  });
  return idx;
}

// À appliquer APRÈS Recap2Checks.appliquer (qui pose `controle` / `resiliation`).
function appliquer(rapport, index, forcages = new Map()) {
  if (!rapport || !rapport.studios || ((!index || !index.size) && (!forcages || !forcages.size))) return rapport;
  const copie = JSON.parse(JSON.stringify(rapport));
  Object.keys(copie.studios).forEach((s) => {
    const cr = copie.studios[s] && copie.studios[s].clientsRetrouves;
    if (!cr || !Array.isArray(cr.liste)) return;
    cr.liste.forEach((l) => {
      const cle = s + '|' + cleVente(l);
      const fo = (forcages && forcages.get(cle)) || null;
      const a = (index && index.get(cle)) || null;
      if (!a && !fo) return;
      if (a) l.automatique = a;
      const manuel = {
        controle: {
          prelevement: l.controle && l.controle.prelevement === true ? true : undefined,
          reservation: l.controle && l.controle.reservation === true ? true : undefined,
        },
        resiliation: { resilie: l.resiliation && l.resiliation.resilie === true ? true : undefined },
      };
      manuel.forcages = fo ? Object.fromEntries(Object.entries(fo).map(([k, x]) => [k, x.valeur])) : {};
      const base = a || { prelevement: null, reservation: null, resilie: null };
      const f = OP.fusionnerManuel(base, manuel);
      l.operationnel = { prelevement: f.prelevement, reservation: f.reservation, resilie: f.resilie, sources: f.sources,
        forcages: fo || {}, alertes: a ? a.alertes : [], controleLe: a ? a.controleLe : '' };
    });
  });
  return copie;
}

module.exports = { SCHEMA, SCHEMA_FORCAGES, CHAMPS, creerTable, valider, enregistrer, resultatsDuMois, appliquer, forcer, forcagesDuMois };
