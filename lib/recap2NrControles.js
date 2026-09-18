'use strict';
// ============================================================================
//  RECAP 2 — CONTRÔLE DES NON-RECONDUITS : DÉPÔT, COHORTE, APPLICATION.
//
//  Le contrôle tourne sur le Mac (crm-automation/recap2-nr-controle.js : lecture
//  Deciplus en GET, moteur lib/recap2NrAnalyse.js) et dépose ici son résultat.
//  Le serveur ne lit jamais Deciplus ni Vendor.
//
//  ⚠️ EN BASE, JAMAIS DANS LE JSON MENSUEL : survit aux recollectes et aux
//  redéploiements. Le taux de non-reconduction (encaissements) n'est JAMAIS
//  touché : `appliquer` pose `analyse` et `cohorte` sur chaque ligne, rien d'autre.
//
//  ⚠️ LA DÉCISION MANUELLE L'EMPORTE (lib/recap2NrStatuts.js) : le statut
//  automatique n'est qu'une proposition, affichée tant qu'aucun statut n'est
//  posé à la main. Un nouveau contrôle ne l'écrase jamais.
//
//  COHORTE DE RÉCUPÉRATION (règle validée par Stan le 2026-09-18) : pour chaque
//  dossier, le PREMIER contrôle concluant fige son éligibilité. Éligible = statut
//  automatique « À traiter » à ce moment-là. Exclus, avec leur motif conservé :
//  contentieux, départ irrécupérable, toujours actif, reconduit autrement,
//  suspension. « À creuser » reste en attente jusqu'à un contrôle concluant.
//  Le taux = récupérés (statut manuel) / éligibles : le dénominateur ne bouge
//  plus, un changement de statut ne peut pas le gonfler artificiellement.
//
//  ⚠️ AUCUNE NOTE BRUTE ICI : le dépôt ne contient que des indications générées
//  et des remarques issues des gabarits connus (vérifié à la réception).
// ============================================================================

const { cleIdentite } = require('./recap2Matches.js');
const Analyse = require('./recap2NrAnalyse.js');
const Conseils = require('../public/recap2-conseils.js');

const MOIS_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const ID_RE = /^[0-9]{1,20}$/;
const HORODATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const TYPES = ['nr', 'suspension'];
const STATUTS = Analyse.STATUTS_AUTO;
const REMARQUES_FIXES = Object.values(Conseils.TEXTES_NR);
const REMARQUES_GABARITS = /^(Vérifie la situation financière du client\. |Vérifie que l’écart de |Vérifie le montant du contrat : |Vérifie les encaissements du client : |Prolonge le contrat de \d+ jours dans Deciplus)/;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS recap2_nr_controles (
    mois        TEXT NOT NULL,
    studio      TEXT NOT NULL,
    type        TEXT NOT NULL,              -- nr | suspension
    cle_client  TEXT NOT NULL,              -- id:<Id membre> | nom:<identité>
    id_client   TEXT NOT NULL DEFAULT '',
    client      TEXT NOT NULL DEFAULT '',
    analyse     TEXT NOT NULL,              -- JSON (statut, cause, indication, suspension, finance, remarques)
    controle_le TEXT NOT NULL,
    recu_le     TEXT NOT NULL,
    PRIMARY KEY (mois, studio, type, cle_client)
  );
  CREATE INDEX IF NOT EXISTS idx_recap2_nr_controles_mois ON recap2_nr_controles (mois);
  CREATE TABLE IF NOT EXISTS recap2_nr_cohorte (
    mois                TEXT NOT NULL,
    studio              TEXT NOT NULL,
    cle_client          TEXT NOT NULL,
    client              TEXT NOT NULL DEFAULT '',
    eligible            INTEGER,             -- 1 éligible | 0 exclu | NULL en attente
    motif_exclusion     TEXT NOT NULL DEFAULT '',
    premier_statut      TEXT NOT NULL DEFAULT '',
    premier_controle_le TEXT NOT NULL DEFAULT '',
    fige_le             TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (mois, studio, cle_client)
  );
  CREATE TABLE IF NOT EXISTS recap2_nr_depots (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    mois        TEXT NOT NULL,
    controle_le TEXT NOT NULL,
    recu_le     TEXT NOT NULL,
    resume      TEXT NOT NULL DEFAULT '{}',
    limites     TEXT NOT NULL DEFAULT '[]'
  );
`;
function creerTable(db) { db.exec(SCHEMA); }

const cleDe = (l) => (ID_RE.test(String(l.idClient || '')) ? 'id:' + l.idClient : 'nom:' + cleIdentite(l.client));
// Dernier filet contre les coordonnées : email, téléphone, IBAN.
const masquer = (t) => String(t || '')
  .replace(/[\w.+-]+@[\w.-]+\.\w+/g, '«email»')
  .replace(/(?:\+33|0033)?\s?[0-9](?:[\s.-]?[0-9]{2}){4}/g, '«tél»')
  .replace(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}\b/g, '«iban»');
const court = (t, n) => masquer(t).slice(0, n);

// ── DÉPÔT ───────────────────────────────────────────────────────────────────
function valider(depot, rapport, studiosConnus) {
  const pb = [];
  if (!depot || !Array.isArray(depot.resultats)) return ['resultats : tableau attendu'];
  if (!HORODATE_RE.test(String(depot.controleLe || ''))) pb.push('controleLe : AAAA-MM-JJTHH:MM attendu');
  depot.resultats.forEach((r, i) => {
    const ou = 'resultats[' + i + ']';
    if (!r || typeof r !== 'object') { pb.push(ou + ' : objet attendu'); return; }
    if (TYPES.indexOf(r.type) < 0) pb.push(ou + '.type : nr ou suspension');
    if (studiosConnus.indexOf(r.studio) < 0) pb.push(ou + '.studio inconnu');
    if (r.idClient && !ID_RE.test(String(r.idClient))) pb.push(ou + '.idClient : chiffres attendus');
    const a = r.analyse || {};
    if (r.type === 'nr' && STATUTS.indexOf(a.statut) < 0) pb.push(ou + '.analyse.statut inconnu');
    if (r.type === 'suspension' && !(a.statut === '' || STATUTS.indexOf(a.statut) > -1)) pb.push(ou + '.analyse.statut inconnu');
    if (!Array.isArray(a.remarques) || a.remarques.length > 3) pb.push(ou + '.analyse.remarques : 0 à 3 attendues');
    (a.remarques || []).forEach((t) => { if (REMARQUES_FIXES.indexOf(t) < 0 && !REMARQUES_GABARITS.test(String(t))) pb.push(ou + ' : remarque hors gabarit'); });
    if (r.type === 'nr') {
      const b = rapport && rapport.studios && rapport.studios[r.studio];
      const liste = (b && b.nonReconduction && b.nonReconduction.liste) || [];
      const ok = liste.some((l) => (r.idClient ? String(l.idClient || '') === String(r.idClient) : !l.idClient && cleIdentite(l.client) === cleIdentite(r.client)));
      if (!ok) pb.push(ou + ' : non-reconduit absent du rapport');
    } else if (!r.idClient) pb.push(ou + ' : une suspension exige un Id Deciplus');
  });
  return pb;
}

// Ne garde QUE les champs attendus, bornés et masqués.
function nettoyerAnalyse(a) {
  const f = a.finance || null, s = a.suspension || null, c = a.cause || null, rc = a.reconduction || null;
  const n = (x) => (x == null || !Number.isFinite(Number(x)) ? null : Math.round(Number(x) * 100) / 100);
  return {
    statut: String(a.statut || ''), contentieux: !!a.contentieux, irrecuperable: !!a.irrecuperable,
    cause: c ? { code: court(c.code, 30), libelle: court(c.libelle, 60), certitude: court(c.certitude, 20), indice: court(c.indice, 120) } : null,
    indication: court(a.indication, 240),
    suspension: s ? { debut: court(s.debut, 10), fin: court(s.fin, 10), repriseDate: court(s.repriseDate, 10), indeterminee: !!s.indeterminee, active: !!s.active,
      terminee: !!s.terminee, raisonRenseignee: !!s.raisonRenseignee, raisonSource: court(s.raisonSource, 80), montantSuspendu: n(s.montantSuspendu),
      prolongation: s.prolongation ? { verifiable: !!s.prolongation.verifiable, manqueJours: n(s.prolongation.manqueJours), motif: court(s.prolongation.motif, 60) } : null } : null,
    finance: f ? { contratVendor: n(f.contratVendor), contratDeciplus: n(f.contratDeciplus), contratReference: n(f.contratReference), facture: n(f.facture),
      encaisse: n(f.encaisse), journalNet: n(f.journalNet), remboursements: n(f.remboursements), avoirs: null, net: n(f.net), ecart: n(f.ecart),
      anomalie: court(f.anomalie, 30), justification: court(f.justification, 80), valide: false, limites: (f.limites || []).slice(0, 5).map((x) => court(x, 120)) } : null,
    reconduction: rc ? { produit: court(rc.produit, 80), debut: court(rc.debut, 10), mensuel: n(rc.mensuel) } : null,
    remarques: (a.remarques || []).slice(0, 3).map((x) => court(x, 400)),
    motifExclusion: court(a.motifExclusion, 60),
  };
}

function enregistrer(db, mois, depot, maintenant = new Date().toISOString()) {
  if (!MOIS_RE.test(mois)) throw new Error('mois AAAA-MM requis');
  const ins = db.prepare(`INSERT OR REPLACE INTO recap2_nr_controles (mois, studio, type, cle_client, id_client, client, analyse, controle_le, recu_le)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  const coh = db.prepare('SELECT * FROM recap2_nr_cohorte WHERE mois = ? AND studio = ? AND cle_client = ?');
  const insCoh = db.prepare(`INSERT OR REPLACE INTO recap2_nr_cohorte (mois, studio, cle_client, client, eligible, motif_exclusion, premier_statut, premier_controle_le, fige_le)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  const resume = {};
  db.transaction(() => {
    depot.resultats.forEach((r) => {
      const a = nettoyerAnalyse(r.analyse || {});
      const cle = cleDe(r);
      const controleLe = String(r.controleLe || depot.controleLe);
      ins.run(mois, r.studio, r.type, cle, ID_RE.test(String(r.idClient || '')) ? String(r.idClient) : '', String(r.client || '').slice(0, 120), JSON.stringify(a), controleLe, maintenant);
      resume[r.type + ':' + (a.statut || 'aucun')] = (resume[r.type + ':' + (a.statut || 'aucun')] || 0) + 1;
      if (r.type !== 'nr') return;
      // Cohorte : figée au PREMIER contrôle concluant, jamais réécrite ensuite.
      const e = Analyse.eligibilite(a);
      const deja = coh.get(mois, r.studio, cle);
      if (deja && deja.eligible !== null) return;
      insCoh.run(mois, r.studio, cle, String(r.client || '').slice(0, 120), e.eligible === null ? null : (e.eligible ? 1 : 0), e.motif,
        a.statut, controleLe, e.eligible === null ? '' : maintenant);
    });
    db.prepare('INSERT INTO recap2_nr_depots (mois, controle_le, recu_le, resume, limites) VALUES (?,?,?,?,?)')
      .run(mois, String(depot.controleLe), maintenant, JSON.stringify(resume), JSON.stringify((depot.limites || []).slice(0, 10).map((x) => court(x, 200))));
  })();
  return { n: depot.resultats.length, resume };
}

function controlesDuMois(db, mois) {
  const nr = new Map(), susp = [];
  db.prepare('SELECT * FROM recap2_nr_controles WHERE mois = ?').all(mois).forEach((r) => {
    const v = { analyse: JSON.parse(r.analyse), controleLe: r.controle_le, client: r.client, idClient: r.id_client };
    if (r.type === 'nr') nr.set(r.studio + '|' + r.cle_client, v);
    else susp.push(Object.assign({ studio: r.studio }, v));
  });
  const cohorte = new Map();
  db.prepare('SELECT * FROM recap2_nr_cohorte WHERE mois = ?').all(mois).forEach((r) => cohorte.set(r.studio + '|' + r.cle_client, {
    eligible: r.eligible === null ? null : !!r.eligible, motifExclusion: r.motif_exclusion, premierStatut: r.premier_statut, premierControleLe: r.premier_controle_le }));
  const dernier = db.prepare('SELECT * FROM recap2_nr_depots WHERE mois = ? ORDER BY id DESC LIMIT 1').get(mois);
  return { nr, susp, cohorte, dernier: dernier ? { controleLe: dernier.controle_le, limites: JSON.parse(dernier.limites) } : null };
}

// ── APPLICATION À LA LECTURE ────────────────────────────────────────────────
//  Après lib/recap2NrStatuts.js (le `suivi` manuel est déjà posé). Pose
//  `analyse`, `cohorte` et, le cas échéant, `suggestion` ('recupere') sur les
//  lignes ; `suspensionsControle` sur le bloc du studio. Aucun compteur touché.
function appliquer(rapport, idx) {
  if (!rapport || !rapport.studios || !idx || (!idx.nr.size && !idx.susp.length)) return rapport;
  const copie = JSON.parse(JSON.stringify(rapport));
  Object.keys(copie.studios).forEach((s) => {
    const b = copie.studios[s];
    const nr = b && b.nonReconduction;
    if (nr && Array.isArray(nr.liste)) {
      nr.liste.forEach((l) => {
        const cle = s + '|' + cleDe(l);
        const c = idx.nr.get(cle);
        if (!c) return;
        l.analyse = Object.assign({}, c.analyse, { controleLe: c.controleLe });
        const k = idx.cohorte.get(cle);
        if (k) l.cohorte = k;
        const manuel = l.suivi && l.suivi.statut;
        // Une nouvelle prestation APRÈS une première analyse « À traiter » peut
        // seulement SUGGÉRER « Récupéré » ; jamais le poser.
        if (k && k.eligible === true && /^(reconduit_autrement|toujours_actif)$/.test(c.analyse.statut) && manuel !== 'recupere') l.suggestion = 'recupere';
      });
      if (idx.dernier) nr.controleAnalyse = idx.dernier;
    }
    const sp = idx.susp.filter((x) => x.studio === s && x.analyse && x.analyse.statut);
    if (b && sp.length) b.suspensionsControle = { liste: sp.map((x) => ({ client: x.client, idClient: x.idClient, analyse: Object.assign({}, x.analyse, { controleLe: x.controleLe }) })) };
  });
  return copie;
}

module.exports = { SCHEMA, TYPES, creerTable, valider, enregistrer, controlesDuMois, appliquer, nettoyerAnalyse, masquer };
