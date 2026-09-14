'use strict';
// ============================================================================
//  RECAP 2 — LES CONTRÔLES MANUELS D'UNE VENTE : PRÉLÈVEMENT, RÉSERVATION.
//
//  Deux cases que Stan coche à la main, vente par vente :
//    · prélèvement  — « le prélèvement est bien paramétré » ;
//    · réservation  — « la réservation / prise de rendez-vous est faite ».
//  Indépendantes l'une de l'autre, et SANS AUCUN EFFET SUR LES KPI : ce sont
//  des marques de contrôle, pas des données de calcul.
//
//  ⚠️ POURQUOI EN BASE, ET PAS DANS LE JSON MENSUEL. Le JSON est REMPLACÉ à
//  chaque collecte : y écrire une case, ce serait la perdre à la recollecte
//  suivante. Les contrôles vivent donc en base (le volume Railway, qui survit
//  aux redéploiements) et sont APPLIQUÉS À LA LECTURE par-dessus le rapport
//  (`appliquer()`), comme les rapprochements décidés (lib/recap2Matches.js).
//
//  ⚠️ LA CLÉ D'UNE VENTE. Fitness Booster ne nous donne pas d'identifiant de
//  contrat. Une vente est donc identifiée par :
//      mois · studio · identité normalisée · date de signature
//  L'identité est normalisée comme pour les rapprochements (accents, casse,
//  tirets, ORDRE des mots neutralisés) : une graphie légèrement retouchée
//  entre deux collectes retrouve ses cases. La DATE distingue deux ventes du
//  même client dans le même mois. Limite assumée : si Fitness Booster change
//  l'identité ou la date d'une vente après coup, la case ne la retrouve plus —
//  elle reste en base, rien n'est perdu, mais elle ne s'affiche plus.
// ============================================================================

const { cleIdentite } = require('./recap2Matches.js');

const MOIS_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{2}\/\d{2}\/\d{4}$/;
const CHAMPS = ['prelevement', 'reservation'];

// La clé d'une vente dans son mois et son studio. '' si elle n'est pas
// identifiable — on refuse alors d'enregistrer plutôt que de mélanger.
function cleVente({ client, date } = {}) {
  const id = cleIdentite(client);
  const d = String(date || '').trim();
  if (!id || !DATE_RE.test(d)) return '';
  return 'nom:' + id + '|' + d;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS recap2_manual_checks (
    mois          TEXT NOT NULL,              -- AAAA-MM, mois audité
    studio        TEXT NOT NULL,              -- studio Fitness Booster de la vente
    cle_vente     TEXT NOT NULL,              -- « nom:<identité triée>|JJ/MM/AAAA »
    client        TEXT NOT NULL DEFAULT '',   -- graphie FB au moment du contrôle
    date_vente    TEXT NOT NULL DEFAULT '',   -- date de signature (JJ/MM/AAAA)
    prelevement   INTEGER NOT NULL DEFAULT 0, -- 0 / 1
    reservation   INTEGER NOT NULL DEFAULT 0, -- 0 / 1
    modifie_le    TEXT NOT NULL,              -- ISO
    modifie_par   TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (mois, studio, cle_vente)
  );
  CREATE INDEX IF NOT EXISTS idx_recap2_checks_mois ON recap2_manual_checks (mois);
`;

// Création sûre au démarrage : idempotente, sans toucher aux tables existantes.
function creerTable(db) { db.exec(SCHEMA); }

// ─── ÉCRITURE ───────────────────────────────────────────────────────────────
//  UNE case à la fois. On ne réécrit QUE la colonne demandée : cocher
//  « réservation » depuis la vue commercial ne peut pas décocher un
//  « prélèvement » coché une seconde plus tôt depuis la vue studio.
function enregistrer(db, { mois, studio, client, date, champ, valeur, par = '' } = {}) {
  if (!MOIS_RE.test(String(mois || ''))) throw new Error('mois invalide');
  const s = String(studio || '').trim();
  if (!s) throw new Error('studio requis');
  if (CHAMPS.indexOf(champ) < 0) throw new Error('contrôle inconnu : ' + champ);
  if (typeof valeur !== 'boolean') throw new Error('valeur : vrai ou faux attendu');
  const cle = cleVente({ client, date });
  if (!cle) throw new Error('vente non identifiable (client et date de signature requis)');

  const quand = new Date().toISOString();
  const v = valeur ? 1 : 0;
  // `champ` est dans CHAMPS (vérifié ci-dessus) : jamais une entrée libre dans le SQL.
  db.prepare(`INSERT INTO recap2_manual_checks
      (mois, studio, cle_vente, client, date_vente, ${champ}, modifie_le, modifie_par)
      VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(mois, studio, cle_vente) DO UPDATE SET
      ${champ} = excluded.${champ}, client = excluded.client,
      modifie_le = excluded.modifie_le, modifie_par = excluded.modifie_par`)
    .run(mois, s, cle, String(client || '').trim(), String(date || '').trim(), v, quand, String(par || ''));
  return lireUne(db, { mois, studio: s, cle });
}

function versObjet(r) {
  return r ? {
    prelevement: !!r.prelevement, reservation: !!r.reservation,
    modifieLe: r.modifie_le, modifiePar: r.modifie_par,
  } : null;
}
function lireUne(db, { mois, studio, cle }) {
  return versObjet(db.prepare('SELECT * FROM recap2_manual_checks WHERE mois = ? AND studio = ? AND cle_vente = ?')
    .get(mois, studio, cle));
}

// ─── LECTURE ────────────────────────────────────────────────────────────────
//  Les contrôles d'un mois, indexés par « studio|clé ». Une requête par lecture
//  de rapport : un mois compte quelques dizaines de ventes.
function controlesDuMois(db, mois) {
  const index = new Map();
  db.prepare('SELECT * FROM recap2_manual_checks WHERE mois = ?').all(mois)
    .forEach((r) => index.set(r.studio + '|' + r.cle_vente, versObjet(r)));
  return index;
}

// ─── APPLICATION À LA LECTURE ───────────────────────────────────────────────
//  Pose `controle` sur chaque ligne du 2e KPI. Le JSON sur disque n'est jamais
//  modifié, et AUCUN compteur n'est touché : on ajoute une information, on ne
//  recalcule rien. Une ligne sans contrôle enregistré reçoit deux cases vides,
//  pour que l'écran n'ait pas à distinguer « jamais coché » de « décoché ».
function appliquer(rapport, controles) {
  if (!rapport || !rapport.studios) return rapport;
  const copie = JSON.parse(JSON.stringify(rapport));
  Object.keys(copie.studios).forEach((s) => {
    const cr = copie.studios[s] && copie.studios[s].clientsRetrouves;
    if (!cr || !Array.isArray(cr.liste)) return;
    cr.liste.forEach((l) => {
      const c = controles.get(s + '|' + cleVente(l));
      l.controle = c || { prelevement: false, reservation: false, modifieLe: '', modifiePar: '' };
    });
  });
  return copie;
}

// La vente existe-t-elle dans ce rapport, pour ce studio ? Sert à refuser une
// case posée sur une vente inventée.
function venteExiste(rapport, { studio, client, date }) {
  const cr = rapport && rapport.studios && rapport.studios[studio] && rapport.studios[studio].clientsRetrouves;
  const cle = cleVente({ client, date });
  return !!(cle && cr && Array.isArray(cr.liste) && cr.liste.some((l) => cleVente(l) === cle));
}

module.exports = { SCHEMA, CHAMPS, creerTable, cleVente, enregistrer, controlesDuMois, appliquer, venteExiste };
