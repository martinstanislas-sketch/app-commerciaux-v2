'use strict';
// ============================================================================
//  RECAP 2 — ANALYSES LANCÉES DEPUIS L'ÉCRAN, EXÉCUTÉES PAR L'AGENT DU MAC.
//
//  Le serveur ne sait PAS collecter : Deciplus et Fitness Booster ne se lisent
//  que dans le Chromium du Mac, avec la session ouverte à la main. Le bouton
//  « Lancer l'analyse du mois » ne fait donc que DÉPOSER UNE DEMANDE ici ;
//  l'agent du Mac (crm-automation/recap2-agent.js) vient la prendre, exécute
//  les étapes et rend compte. Le Mac n'ouvre aucun port : il ne fait que des
//  appels sortants, avec la clé de dépôt RECAP2_INGEST_KEY.
//
//  Cycle d'une analyse : demandee -> en_cours -> terminee | echec.
//
//  ⚠️ UNE SEULE ANALYSE À LA FOIS, TOUS MOIS CONFONDUS : il n'y a qu'un
//  Chromium, et deux collectes simultanées s'y marcheraient dessus.
//
//  ⚠️ JAMAIS « EN COURS » POUR TOUJOURS. Une demande que l'agent ne prend pas,
//  ou une analyse dont il ne donne plus de nouvelles, passe en échec à la
//  lecture suivante, avec la raison. Le bouton redevient alors utilisable.
//
//  Traçabilité : qui a demandé, quand, chaque étape (début, fin, résultat) et
//  l'horodatage `genere` du rapport déposé — le même que celui des fichiers
//  analysés (lib/recap2Fichiers.js). Aucun nom de client.
// ============================================================================

const MOIS_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// Les étapes, dans l'ordre d'exécution. L'agent s'arrête à la première en échec.
const ETAPES = [
  { id: 'recap2', libelle: 'Analyse RECAP 2 (Deciplus + Fitness Booster)' },
  { id: 'operationnel', libelle: 'Contrôle opérationnel (Prélèvement / Réservation / Résilié)' },
  { id: 'nr_controle', libelle: 'Contrôle des non-reconduits' },
];
const ID_ETAPES = ETAPES.map((e) => e.id);

// Délais au-delà desquels on cesse d'attendre l'agent.
const ATTENTE_MAX_MS = 15 * 60 * 1000;  // demande jamais prise
const SILENCE_MAX_MS = 20 * 60 * 1000;  // analyse sans nouvelles
const AGENT_ACTIF_MS = 2 * 60 * 1000;   // dernier signe de vie de l'agent

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS recap2_analyses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    mois        TEXT NOT NULL,
    statut      TEXT NOT NULL,            -- demandee | en_cours | terminee | echec
    demande_le  TEXT NOT NULL,
    demande_par TEXT NOT NULL DEFAULT '',
    demarre_le  TEXT NOT NULL DEFAULT '',
    termine_le  TEXT NOT NULL DEFAULT '',
    maj_le      TEXT NOT NULL DEFAULT '', -- dernière nouvelle de l'agent
    etapes      TEXT NOT NULL DEFAULT '[]',
    genere      TEXT NOT NULL DEFAULT '', -- rapport.genere du dépôt produit
    erreur      TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS recap2_analyses_mois ON recap2_analyses (mois);
  CREATE TABLE IF NOT EXISTS recap2_agent (
    id     INTEGER PRIMARY KEY CHECK (id = 1),
    vu_le  TEXT NOT NULL
  );
`;
function creerTable(db) { db.exec(SCHEMA); }

const maintenant = () => new Date().toISOString();
const texte = (x, max) => String(x == null ? '' : x).slice(0, max || 300);
const depuis = (iso, now) => (iso ? now - new Date(iso).getTime() : Infinity);

function lireLigne(r) {
  if (!r) return null;
  let etapes = [];
  try { etapes = JSON.parse(r.etapes); } catch (_) { /* illisible : vide */ }
  return {
    id: r.id, mois: r.mois, statut: r.statut, demandeLe: r.demande_le, demandePar: r.demande_par,
    demarreLe: r.demarre_le || null, termineLe: r.termine_le || null, genere: r.genere || null,
    erreur: r.erreur || '', etapes: Array.isArray(etapes) ? etapes : [],
  };
}

function signeDeVie(db, now) {
  db.prepare('INSERT INTO recap2_agent (id, vu_le) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET vu_le = excluded.vu_le').run(now || maintenant());
}
function agentVuLe(db) {
  const r = db.prepare('SELECT vu_le FROM recap2_agent WHERE id = 1').get();
  return r ? r.vu_le : null;
}

// Une demande oubliée ou une analyse muette passe en échec, avec la raison.
function expirer(db, nowMs) {
  const now = nowMs || Date.now();
  const iso = new Date(now).toISOString();
  const fin = db.prepare("UPDATE recap2_analyses SET statut = 'echec', termine_le = ?, erreur = ? WHERE id = ?");
  db.prepare("SELECT id, statut, demande_le, maj_le FROM recap2_analyses WHERE statut IN ('demandee', 'en_cours')").all()
    .forEach((r) => {
      if (r.statut === 'demandee' && depuis(r.demande_le, now) > ATTENTE_MAX_MS) {
        fin.run(iso, 'Le Mac n\'a pas pris la demande : agent arrêté, Mac éteint ou en veille.', r.id);
      } else if (r.statut === 'en_cours' && depuis(r.maj_le, now) > SILENCE_MAX_MS) {
        fin.run(iso, 'Plus aucune nouvelle du Mac pendant l\'analyse : agent interrompu.', r.id);
      }
    });
}

function active(db) {
  return lireLigne(db.prepare("SELECT * FROM recap2_analyses WHERE statut IN ('demandee', 'en_cours') ORDER BY id LIMIT 1").get());
}

// ── LE BOUTON ───────────────────────────────────────────────────────────────
function demander(db, mois, par) {
  if (!MOIS_RE.test(mois)) return { erreur: 'mois=AAAA-MM requis', status: 400 };
  expirer(db);
  const enCours = active(db);
  if (enCours) return { erreur: 'Une analyse est déjà en cours (' + enCours.mois + ').', status: 409, analyse: enCours };
  const now = maintenant();
  const etapes = ETAPES.map((e) => ({ id: e.id, libelle: e.libelle, statut: 'a_faire' }));
  const id = db.prepare('INSERT INTO recap2_analyses (mois, statut, demande_le, demande_par, etapes) VALUES (?, ?, ?, ?, ?)')
    .run(mois, 'demandee', now, texte(par, 120), JSON.stringify(etapes)).lastInsertRowid;
  return { analyse: lireLigne(db.prepare('SELECT * FROM recap2_analyses WHERE id = ?').get(id)) };
}

// ── L'AGENT ─────────────────────────────────────────────────────────────────
//  prendre : signe de vie + la plus ancienne demande, passée en_cours.
function prendre(db) {
  const now = maintenant();
  signeDeVie(db, now);
  expirer(db);
  let pris = null;
  db.transaction(() => {
    const r = db.prepare("SELECT * FROM recap2_analyses WHERE statut = 'demandee' ORDER BY id LIMIT 1").get();
    if (!r || db.prepare("SELECT 1 FROM recap2_analyses WHERE statut = 'en_cours'").get()) return;
    db.prepare("UPDATE recap2_analyses SET statut = 'en_cours', demarre_le = ?, maj_le = ? WHERE id = ?").run(now, now, r.id);
    pris = lireLigne(db.prepare('SELECT * FROM recap2_analyses WHERE id = ?').get(r.id));
  })();
  return pris;
}

//  rendreCompte : état d'une étape ({ etape, statut: en_cours|ok|echec, message }),
//  ou fin de l'analyse ({ fin: true, ok, erreur, genere }).
function rendreCompte(db, id, corps) {
  const r = db.prepare('SELECT * FROM recap2_analyses WHERE id = ?').get(id);
  if (!r) return { erreur: 'analyse inconnue', status: 404 };
  if (r.statut !== 'en_cours') return { erreur: 'analyse non en cours (' + r.statut + ')', status: 409 };
  const now = maintenant();
  signeDeVie(db, now);
  const c = corps || {};
  // Simple signe de vie pendant une étape longue (la collecte dure ~10 min).
  if (c.vie) {
    db.prepare('UPDATE recap2_analyses SET maj_le = ? WHERE id = ?').run(now, id);
    return { analyse: lireLigne(db.prepare('SELECT * FROM recap2_analyses WHERE id = ?').get(id)) };
  }
  if (c.fin) {
    const ok = c.ok === true;
    db.prepare('UPDATE recap2_analyses SET statut = ?, termine_le = ?, maj_le = ?, genere = ?, erreur = ? WHERE id = ?')
      .run(ok ? 'terminee' : 'echec', now, now, texte(c.genere, 40), ok ? '' : texte(c.erreur || 'échec sans détail', 500), id);
  } else {
    if (ID_ETAPES.indexOf(c.etape) < 0 || ['en_cours', 'ok', 'echec'].indexOf(c.statut) < 0) {
      return { erreur: 'étape ou statut inconnu', status: 400 };
    }
    const etapes = lireLigne(r).etapes.map((e) => {
      if (e.id !== c.etape) return e;
      const n = Object.assign({}, e, { statut: c.statut });
      if (c.statut === 'en_cours') n.debut = now;
      else { n.fin = now; n.message = texte(c.message, 300); }
      return n;
    });
    db.prepare('UPDATE recap2_analyses SET etapes = ?, maj_le = ? WHERE id = ?').run(JSON.stringify(etapes), now, id);
  }
  return { analyse: lireLigne(db.prepare('SELECT * FROM recap2_analyses WHERE id = ?').get(id)) };
}

// ── CE QUE L'ÉCRAN LIT ─────────────────────────────────────────────────────
//  La dernière analyse du mois, l'analyse active (tous mois) et l'agent.
function etat(db, mois, nowMs) {
  expirer(db, nowMs);
  const vu = agentVuLe(db);
  return {
    derniere: lireLigne(db.prepare('SELECT * FROM recap2_analyses WHERE mois = ? ORDER BY id DESC LIMIT 1').get(mois)),
    active: active(db),
    agentVuLe: vu,
    agentActif: depuis(vu, nowMs || Date.now()) < AGENT_ACTIF_MS,
  };
}

module.exports = { creerTable, ETAPES, demander, prendre, rendreCompte, etat, expirer, signeDeVie };
