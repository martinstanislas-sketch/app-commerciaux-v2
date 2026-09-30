'use strict';
// ============================================================================
//  AUTHENTIFICATION — lien magique par e-mail (remplace le code PIN).
//
//   1. demanderLien(email)  -> crée un jeton à usage unique (15 min) et renvoie
//      l'URL à envoyer. Le compte est créé à ce moment-là s'il n'existe pas.
//   2. consommerLien(token) -> vérifie le jeton (existe, pas expiré, pas déjà
//      utilisé), le marque utilisé, et renvoie l'email -> server.js ouvre une
//      session de 60 jours.
//
//  Anti-abus : au plus MAX_LIENS_PAR_HEURE demandes par adresse et par heure.
//  Seule l'empreinte du jeton est stockée (cf. lib/db.js).
// ============================================================================

const crypto = require('crypto');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LIEN_MINUTES = 15;
const SESSION_DAYS = 60;
const MAX_LIENS_PAR_HEURE = 5;

function normEmail(e) { return String(e || '').trim().toLowerCase(); }
function emailValide(e) { return EMAIL_RE.test(normEmail(e)); }
const empreinte = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

function createAuth({ getDb, nowIso }) {
  const db = () => getDb();

  function findUser(email) {
    return db().prepare('SELECT * FROM users WHERE email = ?').get(normEmail(email)) || null;
  }

  function demanderLien(email, maintenant = Date.now()) {
    const mail = normEmail(email);
    if (!emailValide(mail)) return { ok: false, status: 400, error: 'Adresse e-mail invalide.' };

    const depuis = new Date(maintenant - 3600e3).toISOString();
    const recents = db().prepare('SELECT COUNT(*) AS n FROM magic_links WHERE email = ? AND cree_le > ?').get(mail, depuis).n;
    if (recents >= MAX_LIENS_PAR_HEURE) {
      return { ok: false, status: 429, error: 'Trop de demandes. Réessaie dans une heure ou utilise le dernier lien reçu.' };
    }

    const nouveau = !findUser(mail);
    if (nouveau) {
      db().prepare('INSERT INTO users (email, cree_le) VALUES (?, ?)').run(mail, nowIso());
    }
    const token = crypto.randomBytes(32).toString('base64url');
    const expire = new Date(maintenant + LIEN_MINUTES * 60e3).toISOString();
    db().prepare('INSERT INTO magic_links (token_hash, email, cree_le, expire_le) VALUES (?, ?, ?, ?)')
      .run(empreinte(token), mail, new Date(maintenant).toISOString(), expire);
    return { ok: true, email: mail, token, expire, nouveau };
  }

  function consommerLien(token, maintenant = Date.now()) {
    if (!token) return { ok: false, error: 'Lien invalide.' };
    const row = db().prepare('SELECT * FROM magic_links WHERE token_hash = ?').get(empreinte(token));
    if (!row) return { ok: false, error: 'Ce lien n\'est pas valide.' };
    if (row.utilise_le) return { ok: false, error: 'Ce lien a déjà été utilisé. Demande-en un nouveau.' };
    if (Date.parse(row.expire_le) < maintenant) return { ok: false, error: 'Ce lien a expiré. Demande-en un nouveau.' };
    db().prepare('UPDATE magic_links SET utilise_le = ? WHERE token_hash = ?').run(nowIso(), row.token_hash);
    db().prepare('UPDATE users SET vu_le = ? WHERE email = ?').run(nowIso(), row.email);
    return { ok: true, email: row.email };
  }

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

  return { findUser, demanderLien, consommerLien, creerSession, lireSession, supprimerSession };
}

module.exports = { createAuth, normEmail, emailValide, LIEN_MINUTES, SESSION_DAYS, MAX_LIENS_PAR_HEURE };
