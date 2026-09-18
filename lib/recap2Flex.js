'use strict';
// ============================================================================
//  RECAP 2 — LE CHALLENGE FLEX SUR LES VNI : CONTRÔLE VENDOR ET DÉCISION MANUELLE.
//
//  POURQUOI CE MODULE. Un VNI est un visiteur qui n'a pas souscrit. La question
//  opérationnelle est simple : lui a-t-on proposé le Challenge Flex (4 séances
//  par mois) ? La réponse ne vit ni dans le rapport, ni dans Deciplus — qui
//  n'enregistre que ce qui est VENDU — mais dans Vendor, qui journalise les
//  devis envoyés (« Devis envoyé (Formule X) ») et les notes des conseillers.
//
//  Le contrôle tourne sur le Mac, à la demande (crm-automation/recap2-flex.js),
//  et dépose ici son résultat, daté. Le serveur ne lit jamais Vendor.
//
//  LES STATUTS (règle validée par Stan le 2026-09-18) :
//   · « Flex proposé »      — un devis ou une note NOMME le Flex ; les formules
//     « 4 coachings par mois » et « Pack 4 coaching / mois » en font partie ;
//   · « Transformé depuis » — le prospect a souscrit depuis sa venue. Deux
//     sources, dans cet ordre de priorité :
//       1. une signature connue des rapports RECAP 2 (lib/recap2Vni.js, appliquée
//          AVANT ce module : la personne a déjà quitté la liste) ;
//       2. le statut ACTUEL « Client - Avec Abonnement » de la fiche Vendor, lu
//          par le contrôle sur la fiche dont l'identifiant de contact est EXACT
//          (règle validée par Stan le 2026-09-18). Jamais sur le seul nom.
//          Aucune date de signature n'est inventée : on affiche « abonnement
//          détecté dans Vendor » avec la date de la collecte ;
//   · « À vérifier »        — la fiche Vendor n'a pas pu être attribuée avec
//     certitude : AUCUN statut Flex n'est supposé ; la seule remarque produite
//     demande de vérifier l'identité du prospect dans Vendor ;
//   · « Flex à proposer »   — tout le reste.
//
//  ⚠️ L'ABSENCE DE TRACE NE PROUVE RIEN. « Flex à proposer » ne dit pas que
//  l'offre n'a jamais été évoquée — un devis n'est pas toujours émis — il dit
//  qu'il faut la proposer ou la reproposer. C'est pourquoi le statut ne
//  s'appelle pas « non proposé ».
//
//  ⚠️ LA DÉCISION MANUELLE L'EMPORTE TOUJOURS, dans les deux sens : après son
//  action, le conseiller pose « Flex proposé », « Prospect non intéressé » ou
//  « À reproposer plus tard ». Datée, attribuée, réversible — et elle fait
//  taire la remarque, puisque l'action a été faite. Chaque décision et chaque
//  retour au contrôle automatique sont inscrits dans recap2_flex_historique
//  (avant, après, qui, quand), jamais effacés.
//
//  ⚠️ EN BASE, JAMAIS DANS LE JSON MENSUEL (même principe que les cases
//  manuelles) : tout survit aux recollectes et aux redéploiements.
//
//  ⚠️ LA CLÉ D'UN VNI : mois · studio · identifiant de contact Vendor. Jamais
//  le nom : deux homonymes sont deux personnes.
// ============================================================================

const MOIS_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const ID_VENDOR_RE = /^[0-9]{10,16}x[0-9]{10,24}$/;
const HORODATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

const STATUTS = { PROPOSE: 'Flex proposé', TRANSFORME: 'Transformé depuis', A_PROPOSER: 'Flex à proposer', A_VERIFIER: 'À vérifier',
  ABONNE_VENDOR: 'Abonnement détecté dans Vendor' };
// Ce que le contrôle a le droit de conclure. « Transformé depuis » (signature
// RECAP 2) n'en fait PAS partie : c'est la règle VNI existante qui le pose.
const STATUTS_AUTO = [STATUTS.PROPOSE, STATUTS.A_PROPOSER, STATUTS.A_VERIFIER, STATUTS.ABONNE_VENDOR];
// Source affichée d'une transformation détectée par le statut Vendor.
const SOURCE_ABONNE_VENDOR = 'vendor-abonnement';
// Les trois décisions du conseiller, après son action.
const MANUELS = { PROPOSE: 'propose', NON_INTERESSE: 'non_interesse', REPROPOSER: 'reproposer' };
const LIBELLE_MANUEL = { propose: 'Flex proposé', non_interesse: 'Prospect non intéressé', reproposer: 'À reproposer plus tard' };
const VALEURS_MANUELLES = Object.values(MANUELS);

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS recap2_flex_controles (
    mois        TEXT NOT NULL,
    studio      TEXT NOT NULL,
    contact_id  TEXT NOT NULL,              -- identifiant de contact Vendor
    client      TEXT NOT NULL DEFAULT '',   -- graphie au moment du contrôle
    statut      TEXT NOT NULL,              -- Flex proposé | Flex à proposer | À vérifier | Abonnement détecté dans Vendor
    preuves     TEXT NOT NULL DEFAULT '[]', -- JSON : [{type:'devis'|'note', quand, texte}]
    controle_le TEXT NOT NULL,              -- heure de Paris de la lecture Vendor
    recu_le     TEXT NOT NULL,              -- ISO, réception serveur
    PRIMARY KEY (mois, studio, contact_id)
  );
  CREATE INDEX IF NOT EXISTS idx_recap2_flex_mois ON recap2_flex_controles (mois);
`;
const SCHEMA_MANUEL = `
  CREATE TABLE IF NOT EXISTS recap2_flex_decisions (
    mois        TEXT NOT NULL,
    studio      TEXT NOT NULL,
    contact_id  TEXT NOT NULL,
    valeur      TEXT NOT NULL,              -- propose | non_interesse | reproposer
    client      TEXT NOT NULL DEFAULT '',
    modifie_le  TEXT NOT NULL,
    modifie_par TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (mois, studio, contact_id)
  );
  CREATE TABLE IF NOT EXISTS recap2_flex_historique (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    mois        TEXT NOT NULL,
    studio      TEXT NOT NULL,
    contact_id  TEXT NOT NULL,
    client      TEXT NOT NULL DEFAULT '',
    avant       TEXT NOT NULL,              -- auto | propose | non_interesse | reproposer
    apres       TEXT NOT NULL,
    le          TEXT NOT NULL,
    par         TEXT NOT NULL DEFAULT ''
  );
`;

function creerTable(db) { db.exec(SCHEMA); db.exec(SCHEMA_MANUEL); }

// ── DÉPÔT DU CONTRÔLE ───────────────────────────────────────────────────────
//  Forme stricte, et chaque VNI doit exister dans le rapport du mois : aucun
//  contrôle orphelin, aucune personne inventée.
function valider(depot, rapport) {
  const pb = [];
  if (!depot || !Array.isArray(depot.resultats)) return ['resultats : tableau attendu'];
  if (!HORODATE_RE.test(String(depot.controleLe || ''))) pb.push('controleLe : AAAA-MM-JJTHH:MM attendu');
  const connus = new Set();
  Object.keys((rapport && rapport.studios) || {}).forEach((s) => {
    (((rapport.studios[s] || {}).vni || {}).liste || []).forEach((l) => { if (l.contactId) connus.add(s + '|' + l.contactId); });
  });
  depot.resultats.forEach((r, i) => {
    const ou = 'resultats[' + i + ']';
    if (!r || typeof r !== 'object') { pb.push(ou + ' : objet attendu'); return; }
    if (!ID_VENDOR_RE.test(String(r.contactId || ''))) pb.push(ou + '.contactId : identifiant de contact Vendor attendu');
    if (STATUTS_AUTO.indexOf(r.statut) < 0) pb.push(ou + '.statut : ' + STATUTS_AUTO.join(' / ') + ' attendus');
    if (r.preuves != null && !Array.isArray(r.preuves)) pb.push(ou + '.preuves : tableau attendu');
    if (!connus.has(r.studio + '|' + r.contactId)) pb.push(ou + ' : VNI absent du rapport');
  });
  return pb;
}

function enregistrer(db, mois, depot, maintenant = new Date().toISOString()) {
  if (!MOIS_RE.test(mois)) throw new Error('mois AAAA-MM requis');
  const ins = db.prepare(`INSERT OR REPLACE INTO recap2_flex_controles
    (mois, studio, contact_id, client, statut, preuves, controle_le, recu_le)
    VALUES (@mois, @studio, @contact, @client, @statut, @preuves, @controleLe, @recuLe)`);
  const tx = db.transaction((rows) => rows.forEach((r) => ins.run({
    mois, studio: r.studio, contact: String(r.contactId), client: String(r.client || ''), statut: r.statut,
    preuves: JSON.stringify((r.preuves || []).slice(0, 10)),
    controleLe: String(r.controleLe || depot.controleLe), recuLe: maintenant,
  })));
  tx(depot.resultats);
  return depot.resultats.length;
}

function controlesDuMois(db, mois) {
  const idx = new Map();
  db.prepare('SELECT * FROM recap2_flex_controles WHERE mois = ?').all(mois).forEach((r) => {
    idx.set(r.studio + '|' + r.contact_id, { statut: r.statut, preuves: JSON.parse(r.preuves), controleLe: r.controle_le });
  });
  return idx;
}

// ── DÉCISION MANUELLE ───────────────────────────────────────────────────────
//  valeur 'auto' = retour au contrôle automatique (la ligne est supprimée).
function decider(db, { mois, studio, contactId, valeur, client = '', par = '' }, maintenant = new Date().toISOString()) {
  if (!MOIS_RE.test(mois)) throw new Error('mois AAAA-MM requis');
  if (!ID_VENDOR_RE.test(String(contactId || ''))) throw new Error('identifiant de contact Vendor requis');
  if (valeur !== 'auto' && VALEURS_MANUELLES.indexOf(valeur) < 0) throw new Error('valeur : ' + VALEURS_MANUELLES.join(', ') + ' ou auto');
  const id = String(contactId);
  const qui = String(par).slice(0, 80);
  const ancienne = db.prepare('SELECT valeur FROM recap2_flex_decisions WHERE mois = ? AND studio = ? AND contact_id = ?').get(mois, studio, id);
  const avant = ancienne ? ancienne.valeur : 'auto';
  db.transaction(() => {
    if (valeur === 'auto') {
      db.prepare('DELETE FROM recap2_flex_decisions WHERE mois = ? AND studio = ? AND contact_id = ?').run(mois, studio, id);
    } else {
      db.prepare(`INSERT OR REPLACE INTO recap2_flex_decisions (mois, studio, contact_id, valeur, client, modifie_le, modifie_par)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(mois, studio, id, valeur, String(client || ''), maintenant, qui);
    }
    if (avant !== valeur) {
      db.prepare(`INSERT INTO recap2_flex_historique (mois, studio, contact_id, client, avant, apres, le, par)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(mois, studio, id, String(client || ''), avant, valeur, maintenant, qui);
    }
  })();
  if (valeur === 'auto') return { valeur: 'auto' };
  return { valeur, libelle: LIBELLE_MANUEL[valeur], modifieLe: maintenant, modifiePar: qui };
}

function historique(db, mois) {
  return db.prepare('SELECT * FROM recap2_flex_historique WHERE mois = ? ORDER BY id').all(mois);
}

function decisionsDuMois(db, mois) {
  const idx = new Map();
  db.prepare('SELECT * FROM recap2_flex_decisions WHERE mois = ?').all(mois).forEach((r) => {
    idx.set(r.studio + '|' + r.contact_id, { valeur: r.valeur, libelle: LIBELLE_MANUEL[r.valeur], modifieLe: r.modifie_le, modifiePar: r.modifie_par });
  });
  return idx;
}

// ── APPLICATION À LA LECTURE ────────────────────────────────────────────────
//  À appliquer APRÈS Recap2Vni.appliquer : les personnes dont une signature
//  RECAP 2 est connue ont déjà quitté la liste (source prioritaire).
//  Ici :
//   · « Abonnement détecté dans Vendor » → la personne est RETIRÉE de la liste
//     active et rejoint `transformesDepuis` (ligne grisée, sans action), exactement
//     comme un retrait par signature : `retires` augmente, rien d'autre ;
//   · sinon, pose `ligne.flex` (statut, source, preuves, décision).
//  La décision manuelle ne ramène pas un abonné dans la liste : il a souscrit.
function appliquer(rapport, controles, decisions = new Map()) {
  if (!rapport || !rapport.studios) return rapport;
  if ((!controles || !controles.size) && (!decisions || !decisions.size)) return rapport;
  const copie = JSON.parse(JSON.stringify(rapport));
  Object.keys(copie.studios).forEach((s) => {
    const v = copie.studios[s] && copie.studios[s].vni;
    if (!v || !Array.isArray(v.liste)) return;
    const actifs = [];
    v.liste.forEach((l) => {
      const cle = s + '|' + String(l.contactId || '');
      const c = (controles && controles.get(cle)) || null;
      const d = (decisions && decisions.get(cle)) || null;
      if (c && c.statut === STATUTS.ABONNE_VENDOR) {
        if (!Array.isArray(v.transformesDepuis)) v.transformesDepuis = [];
        v.transformesDepuis.push({ contactId: l.contactId || '', idClient: l.idClient || '', client: l.client || '',
          commercial: l.commercial || '', commercialId: l.commercialId || '', dateVenue: l.dateVenue,
          transformeLe: '', source: SOURCE_ABONNE_VENDOR, detecteLe: c.controleLe || '' });
        v.retires = (v.retires || 0) + 1;
        return;
      }
      actifs.push(l);
      if (!c && !d) return;
      l.flex = {
        statut: d ? d.libelle : c.statut,
        source: d ? 'manuel' : 'auto',
        preuves: c ? c.preuves : [],
        controleLe: c ? c.controleLe : '',
        statutAuto: c ? c.statut : '',
        decision: d || null,
      };
    });
    v.liste = actifs;
  });
  return copie;
}

// ── CLASSEMENT D'UNE FICHE LUE (utilisé par crm-automation/recap2-flex.js) ───
//  `ouverte` : la fiche affichée porte l'identifiant de contact EXACT attendu.
//  Sans cette certitude, « À vérifier » — jamais de conclusion sur le nom.
const ABONNE_RE = /^Client\s*[-–]\s*Avec Abonnement/i;
function classer({ ouverte, statutVendor = '', preuves = [] }) {
  if (!ouverte) return STATUTS.A_VERIFIER;
  if (ABONNE_RE.test(String(statutVendor).trim())) return STATUTS.ABONNE_VENDOR;
  return preuves.length ? STATUTS.PROPOSE : STATUTS.A_PROPOSER;
}

module.exports = {
  SCHEMA, SCHEMA_MANUEL, STATUTS, STATUTS_AUTO, SOURCE_ABONNE_VENDOR, classer, MANUELS, LIBELLE_MANUEL, VALEURS_MANUELLES,
  creerTable, valider, enregistrer, controlesDuMois, decider, decisionsDuMois, appliquer, historique,
};
