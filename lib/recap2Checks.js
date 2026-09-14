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

// ── RÉSILIATION (ajoutée le 2026-09-14) ────────────────────────────────────
//  Une vente RETROUVÉE peut être marquée « Résiliée » à la main, avec une date
//  OBLIGATOIRE (délai signature -> résiliation mesurable ensuite).
//  ⚠️ RÉSILIÉ ≠ ANNULÉ. La vente a existé : elle reste signée, active,
//  retrouvée, dans l'historique du commercial et dans tous les KPI. C'est une
//  information de plus — elle ne masque ni paiement ni anomalie.
//  Une vente ANNULÉE dans Fitness Booster peut aussi être marquée résiliée
//  (la cliente a signé puis résilié) : elle garde `annulee` en source et reste
//  traitée comme annulée dans TOUS les calculs ; seul l'affichage la qualifie.
//  Auteur et date PROPRES à la résiliation (`resilie_le/par`) : cocher
//  « Réservation » plus tard ne doit pas effacer qui a résilié, et quand.
const COLONNES_RESILIATION = [
  ['resilie', "INTEGER NOT NULL DEFAULT 0"],        // 0 / 1
  ['date_resiliation', "TEXT NOT NULL DEFAULT ''"], // JJ/MM/AAAA, obligatoire si resilie = 1
  ['resilie_le', "TEXT NOT NULL DEFAULT ''"],       // ISO de la dernière décision (pose OU retrait)
  ['resilie_par', "TEXT NOT NULL DEFAULT ''"],
];

// Création sûre au démarrage : idempotente, sans toucher aux données.
// La table existe déjà en production (volume Railway) : les colonnes de
// résiliation y sont AJOUTÉES si elles manquent — jamais de recréation.
function creerTable(db) {
  db.exec(SCHEMA);
  const existantes = new Set(db.prepare('PRAGMA table_info(recap2_manual_checks)').all().map((c) => c.name));
  COLONNES_RESILIATION.forEach(([nom, type]) => {
    if (!existantes.has(nom)) db.exec('ALTER TABLE recap2_manual_checks ADD COLUMN ' + nom + ' ' + type);
  });
}

// « JJ/MM/AAAA » -> numéro de jour, NaN si illisible (31/02 refusé).
function jourDe(texte) {
  const r = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(texte || '').trim());
  if (!r) return NaN;
  const [j, m, a] = [+r[1], +r[2], +r[3]];
  const d = new Date(Date.UTC(a, m - 1, j));
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== j) return NaN;
  return Math.round(d.getTime() / 86400000);
}
// Le jour d'AUJOURD'HUI à Paris : le serveur tourne en UTC, pas le studio.
function jourParis(maintenant = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(maintenant).map((x) => [x.type, x.value]));
  return jourDe(p.day + '/' + p.month + '/' + p.year);
}

// Pose ou retire la résiliation d'UNE vente. `dateSignature` est celle du
// RAPPORT (jamais une date fournie par l'appelant) : c'est elle qui borne.
function resilier(db, { mois, studio, client, dateSignature, resilie, dateResiliation = '', par = '', maintenant = new Date() } = {}) {
  if (!MOIS_RE.test(String(mois || ''))) throw new Error('mois invalide');
  const s = String(studio || '').trim();
  if (!s) throw new Error('studio requis');
  if (typeof resilie !== 'boolean') throw new Error('resilie : vrai ou faux attendu');
  const cle = cleVente({ client, date: dateSignature });
  if (!cle) throw new Error('vente non identifiable (client et date de signature requis)');

  let dateR = '';
  if (resilie) {
    dateR = String(dateResiliation || '').trim();
    const jR = jourDe(dateR);
    if (!Number.isFinite(jR)) throw new Error('date de résiliation obligatoire (JJ/MM/AAAA)');
    if (jR < jourDe(dateSignature)) throw new Error('la résiliation ne peut pas précéder la signature (' + dateSignature + ')');
    if (jR > jourParis(maintenant)) throw new Error('la date de résiliation ne peut pas être dans le futur');
  }
  const quand = maintenant.toISOString();
  db.prepare(`INSERT INTO recap2_manual_checks
      (mois, studio, cle_vente, client, date_vente, modifie_le, modifie_par, resilie, date_resiliation, resilie_le, resilie_par)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(mois, studio, cle_vente) DO UPDATE SET
      resilie = excluded.resilie, date_resiliation = excluded.date_resiliation,
      resilie_le = excluded.resilie_le, resilie_par = excluded.resilie_par, client = excluded.client`)
    .run(mois, s, cle, String(client || '').trim(), String(dateSignature || '').trim(), quand, String(par || ''),
      resilie ? 1 : 0, dateR, quand, String(par || ''));
  const r = db.prepare('SELECT * FROM recap2_manual_checks WHERE mois = ? AND studio = ? AND cle_vente = ?').get(mois, s, cle);
  return versResiliation(r);
}

// La résiliation telle que l'écran la lit. `delaiJours` : signature -> résiliation.
function versResiliation(r) {
  const resilie = !!(r && r.resilie);
  const date = resilie ? String(r.date_resiliation || '') : '';
  const delai = resilie ? jourDe(date) - jourDe(r.date_vente) : NaN;
  return {
    resilie, date,
    delaiJours: Number.isFinite(delai) ? delai : null,
    modifieLe: (r && r.resilie_le) || '', modifiePar: (r && r.resilie_par) || '',
  };
}

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
    .forEach((r) => index.set(r.studio + '|' + r.cle_vente, Object.assign(versObjet(r), { resiliation: versResiliation(r) })));
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
      l.controle = c
        ? { prelevement: c.prelevement, reservation: c.reservation, modifieLe: c.modifieLe, modifiePar: c.modifiePar }
        : { prelevement: false, reservation: false, modifieLe: '', modifiePar: '' };
      // Éligibles : une vente RETROUVÉE (validée à la main comprise) ou une vente
      // ANNULÉE dans Fitness Booster — cas réel de Dei Muteba, « annulée » dans
      // FB alors qu'elle a signé puis résilié. Jamais un « à vérifier ».
      // `annulee` reste la donnée source, intacte : la résiliation QUALIFIE ce
      // qui s'est passé, elle ne recalcule rien.
      // Une marque restée en base sur une ligne qui n'est plus éligible
      // (rapprochement retiré) n'est pas affichée — ni effacée : rien ne se perd.
      const eligible = l.retrouve === true || l.annulee === true;
      l.resiliation = (c && eligible) ? c.resiliation
        : { resilie: false, date: '', delaiJours: null, modifieLe: '', modifiePar: '' };
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

// La ligne d'une vente dans un rapport (déjà enrichi des décisions), ou null.
function ligneDe(rapport, { studio, client, date }) {
  const cr = rapport && rapport.studios && rapport.studios[studio] && rapport.studios[studio].clientsRetrouves;
  const cle = cleVente({ client, date });
  if (!cle || !cr || !Array.isArray(cr.liste)) return null;
  return cr.liste.find((l) => cleVente(l) === cle) || null;
}

module.exports = {
  SCHEMA, CHAMPS, creerTable, cleVente, enregistrer, controlesDuMois, appliquer, venteExiste,
  resilier, ligneDe, jourDe, jourParis,
};
