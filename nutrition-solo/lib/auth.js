'use strict';
// ============================================================================
//  AUTHENTIFICATION — email + code PIN, en libre-service.
//
//  Ce que ça change par rapport à l'app Protocole 42 : là-bas, un compte était
//  PRÉ-CRÉÉ par un coach et il fallait un code de cohorte pour le réclamer. Ici
//  il n'y a pas de coach : n'importe qui s'inscrit seul, en une étape.
//
//   - Email inconnu  -> création du compte + pose du PIN dans la foulée.
//   - Email connu    -> PIN exigé et vérifié.
//
//  ⚠️ VERROUILLAGE TEMPORAIRE, PAS DÉFINITIF. L'app Protocole 42 bloquait le
//  compte pour de bon après 5 PIN erronés, parce qu'un coach pouvait déverrouiller.
//  Sans coach, un blocage définitif enfermerait l'utilisateur dehors pour toujours.
//  On applique donc une temporisation qui double à chaque série de 5 échecs
//  (1 min, 2, 4, 8… plafonnée à 1 h) : ça rend le tirage au sort sans espoir
//  (4 à 6 chiffres = 10 000 à 1 000 000 de combinaisons) sans jamais condamner
//  un compte qui garde du poids, des photos corporelles et un historique.
//
//  Les fonctions ne posent PAS la session : elles renvoient { ok, status, body }
//  et c'est server.js qui crée le jeton. -> testable sans HTTP.
// ============================================================================

const crypto = require('crypto');

const PIN_RE = /^\d{4,6}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_PIN_FAILS = 5;            // échecs tolérés avant temporisation
const LOCK_BASE_MS = 60 * 1000;     // 1 min, doublée à chaque nouvelle série
const LOCK_MAX_MS = 60 * 60 * 1000; // plafond : 1 h
const SESSION_DAYS = 60;

function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(String(pin), salt, 32).toString('hex');
}

function verifyPin(pin, stored) {
  if (!stored || stored.indexOf(':') < 0 || !PIN_RE.test(String(pin || ''))) return false;
  const [salt, h] = stored.split(':');
  const a = Buffer.from(h, 'hex');
  const b = crypto.scryptSync(String(pin), salt, 32);
  // timingSafeEqual exige deux Buffer de même longueur, d'où le test préalable.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function normEmail(e) { return String(e || '').trim().toLowerCase(); }
function emailValide(e) { return EMAIL_RE.test(normEmail(e)); }

// Durée de temporisation pour un nombre d'échecs cumulés. Renvoie 0 tant que la
// première série de 5 n'est pas atteinte.
function attenteMs(fails) {
  const series = Math.floor(Number(fails || 0) / MAX_PIN_FAILS);
  if (series < 1) return 0;
  return Math.min(LOCK_MAX_MS, LOCK_BASE_MS * Math.pow(2, series - 1));
}

// `bloque` stocke l'instant (ms epoch) jusqu'auquel la connexion est refusée.
function tempsRestantMs(user, maintenant) {
  const jusqua = Number(user && user.bloque) || 0;
  return Math.max(0, jusqua - (maintenant || Date.now()));
}

function texteAttente(ms) {
  const min = Math.ceil(ms / 60000);
  return min <= 1 ? 'une minute' : `${min} minutes`;
}

function createAuth({ getDb, nowIso }) {
  const db = () => getDb();

  function findUser(email) {
    return db().prepare('SELECT * FROM users WHERE email = ?').get(normEmail(email)) || null;
  }

  // Connexion / inscription. Un seul point d'entrée : le front n'a pas à savoir
  // si le compte existe avant d'appeler (et l'API ne le dit pas non plus tant
  // qu'aucun PIN n'est fourni — inutile d'offrir un test d'existence d'email).
  function login({ email, prenom, pin }, maintenant = Date.now()) {
    const mail = normEmail(email);
    if (!emailValide(mail)) {
      return { ok: false, status: 400, body: { ok: false, error: 'Adresse email invalide.' } };
    }
    const user = findUser(mail);

    // --- Compte inexistant : inscription en libre-service ---
    if (!user) {
      if (!PIN_RE.test(String(pin || ''))) {
        return { ok: false, status: 200, body: { ok: false, nouveau: true, besoinPin: true, error: 'Choisis un code à 4 à 6 chiffres pour protéger ton espace.' } };
      }
      const p = String(prenom || '').trim().slice(0, 60);
      db().prepare('INSERT INTO users (email, prenom, pin_hash, cree_le, vu_le) VALUES (?, ?, ?, ?, ?)')
        .run(mail, p, hashPin(pin), nowIso(), nowIso());
      return { ok: true, status: 200, email: mail, body: { ok: true, nouveau: true, compte: { email: mail, prenom: p } } };
    }

    // --- Compte existant : temporisation puis vérification du PIN ---
    const restant = tempsRestantMs(user, maintenant);
    if (restant > 0) {
      return { ok: false, status: 429, body: { ok: false, attente: restant, error: `Trop de codes erronés. Réessaie dans ${texteAttente(restant)}.` } };
    }
    if (!pin) {
      return { ok: false, status: 200, body: { ok: false, besoinPin: true, prenom: user.prenom || '' } };
    }
    if (!verifyPin(pin, user.pin_hash)) {
      const fails = Number(user.pin_fails || 0) + 1;
      const attente = attenteMs(fails);
      db().prepare('UPDATE users SET pin_fails = ?, bloque = ? WHERE email = ?')
        .run(fails, attente ? maintenant + attente : 0, mail);
      const body = attente
        ? { ok: false, attente, error: `Code incorrect. Réessaie dans ${texteAttente(attente)}.` }
        : { ok: false, restants: MAX_PIN_FAILS - (fails % MAX_PIN_FAILS), error: 'Code incorrect.' };
      return { ok: false, status: attente ? 429 : 401, body };
    }
    // Succès : le compteur d'échecs repart de zéro.
    db().prepare('UPDATE users SET pin_fails = 0, bloque = 0, vu_le = ? WHERE email = ?').run(nowIso(), mail);
    return { ok: true, status: 200, email: mail, body: { ok: true, compte: { email: mail, prenom: user.prenom || '' } } };
  }

  // --- Sessions ---------------------------------------------------------
  function creerSession(email) {
    const token = crypto.randomBytes(32).toString('hex');
    const expire = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
    db().prepare('INSERT INTO sessions (token, email, cree_le, expire_le) VALUES (?, ?, ?, ?)')
      .run(token, normEmail(email), nowIso(), expire);
    return { token, expire };
  }

  function lireSession(token) {
    if (!token) return null;
    const s = db().prepare('SELECT * FROM sessions WHERE token = ?').get(String(token));
    if (!s) return null;
    if (Date.parse(s.expire_le) < Date.now()) {
      db().prepare('DELETE FROM sessions WHERE token = ?').run(s.token);
      return null;
    }
    return s;
  }

  function supprimerSession(token) {
    if (token) db().prepare('DELETE FROM sessions WHERE token = ?').run(String(token));
  }

  // Changement de PIN : l'ancien est exigé. Sans coach pour arbitrer, c'est la
  // seule preuve que la personne devant l'écran est bien la propriétaire.
  function changerPin(email, ancien, nouveau) {
    const user = findUser(email);
    if (!user) return { ok: false, status: 404, body: { ok: false, error: 'Compte introuvable.' } };
    if (!verifyPin(ancien, user.pin_hash)) {
      return { ok: false, status: 401, body: { ok: false, error: 'Code actuel incorrect.' } };
    }
    if (!PIN_RE.test(String(nouveau || ''))) {
      return { ok: false, status: 400, body: { ok: false, error: 'Le nouveau code doit faire 4 à 6 chiffres.' } };
    }
    db().prepare('UPDATE users SET pin_hash = ?, pin_fails = 0, bloque = 0 WHERE email = ?')
      .run(hashPin(nouveau), normEmail(email));
    return { ok: true, status: 200, body: { ok: true } };
  }

  return { findUser, login, creerSession, lireSession, supprimerSession, changerPin };
}

module.exports = {
  createAuth,
  hashPin, verifyPin, normEmail, emailValide, attenteMs, tempsRestantMs,
  PIN_RE, MAX_PIN_FAILS, LOCK_BASE_MS, LOCK_MAX_MS, SESSION_DAYS,
};
