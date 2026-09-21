'use strict';
// ============================================================================
//  ACCÈS COACH PROTOCOLE 42 — comptes individuels email + mot de passe,
//  invitations par l'admin, révocation. Logique pure (aucune route HTTP ici) :
//  server.js pose les sessions, ce module décide. -> testable sans serveur.
//  Voir nutrition-app/test/coachAccess.test.js avant toute modification.
//
//  Trois rôles :
//   - ADMIN  : PIN admin existant (inchangé). Seul à gérer les coachs.
//   - COACH  : ligne de `coaches` (id = coach_id des sessions) + compte dans
//              `coach_accounts` (email, mot de passe). SEULE connexion coach :
//              email + mot de passe (l'ancienne connexion par PIN est supprimée).
//              Un coach historique sans compte doit être invité pour en créer un.
//   - CLIENT : inchangé (clientAuth.js).
//
//  Règles (ne PAS les changer sans rejouer la suite de tests) :
//   - le rôle n'est JAMAIS lu dans une requête : une invitation crée toujours
//     un compte 'coach', jamais 'admin' ;
//   - une invitation ne vaut que pour SON email (l'email vient de l'invitation,
//     jamais du formulaire du coach) ; usage unique ; expire au bout de 7 jours ;
//   - le jeton n'est stocké que haché (sha256) : une fuite de la base ne donne
//     pas de lien utilisable ;
//   - un coach révoqué (p42_access = 0) ou archivé perd l'accès immédiatement.
//
//  Tables séparées de `coaches` exprès : de nombreuses routes font
//  `SELECT * FROM coaches` et renvoient le résultat ; un mot de passe haché
//  n'a rien à faire dans ces réponses.
// ============================================================================
const crypto = require('crypto');

// Périmètre coach -> clients. Un seul studio utilise le Protocole 42 : tout
// coach autorisé voit tous les clients. Passer à 'assigned' rétablit le
// périmètre « ses clients » (référent + coachs supplémentaires) sans toucher
// aux routes : elles passent toutes par les helpers de server.js qui lisent
// cette valeur.
const COACH_CLIENT_SCOPE = 'all';
// Messagerie privée client <-> coach. 'all' : tout coach autorisé lit et répond
// dans le fil de n'importe quel client (boîte partagée). 'assigned' : seuls le
// référent et les coachs supplémentaires du client. N'affecte pas l'admin, dont
// la lecture reste masquée par défaut et tracée dans l'audit (mode support).
const COACH_MESSAGING_SCOPE = 'all';

const INVITE_TTL_MS = 7 * 24 * 3600 * 1000;
const PASSWORD_MIN = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normEmail(e) { return String(e || '').trim().toLowerCase().slice(0, 160); }
function hashToken(t) { return crypto.createHash('sha256').update(String(t)).digest('hex'); }

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return 'scrypt$' + salt + '$' + crypto.scryptSync(String(pw), salt, 64).toString('hex');
}
function verifyPassword(pw, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const a = Buffer.from(parts[2], 'hex');
  const b = crypto.scryptSync(String(pw || ''), parts[1], 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function passwordError(pw) {
  const s = String(pw || '');
  if (s.length < PASSWORD_MIN) return 'Le mot de passe doit contenir au moins ' + PASSWORD_MIN + ' caractères.';
  if (s.length > 200) return 'Mot de passe trop long.';
  if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) return 'Le mot de passe doit contenir au moins une lettre et un chiffre.';
  return '';
}

function ensureTables(db) {
  db.exec(`
    -- Compte individuel d'un coach (1 ligne max par coach). email NULL = coach
    -- sans compte (pas de connexion possible) dont seul l'accès est suivi ici.
    CREATE TABLE IF NOT EXISTS coach_accounts (
      coach_id INTEGER PRIMARY KEY,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL DEFAULT '',
      p42_access INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT '',
      revoked_at TEXT NOT NULL DEFAULT '',
      last_login_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS coach_invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      coach_id INTEGER DEFAULT NULL,          -- coach existant à rattacher (sinon créé à l'acceptation)
      created_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT '',
      expires_at TEXT NOT NULL DEFAULT '',
      used_at TEXT NOT NULL DEFAULT '',
      revoked_at TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_coach_invites_email ON coach_invites(email);
  `);
}

function createCoachAccess({ getDb, now = () => new Date() }) {
  const db = () => getDb();
  const iso = () => now().toISOString();

  // Un coach peut-il utiliser le Protocole 42 ? Lu en base à CHAQUE requête
  // (pas figé dans la session) : une révocation prend effet immédiatement.
  function hasAccess(coachId) {
    const id = Number(coachId);
    if (!Number.isInteger(id) || id <= 0) return false;
    const c = db().prepare('SELECT id FROM coaches WHERE id = ? AND archived = 0').get(id);
    if (!c) return false;
    const acc = db().prepare('SELECT p42_access FROM coach_accounts WHERE coach_id = ?').get(id);
    return !acc || acc.p42_access === 1; // pas de ligne = pas révoqué (la connexion exige un compte)
  }

  function inviteStatus(r, t) {
    if (r.used_at) return 'utilisee';
    if (r.revoked_at) return 'annulee';
    if (r.expires_at && Date.parse(r.expires_at) < t) return 'expiree';
    return 'en_attente';
  }

  // ADMIN : crée une invitation. Renvoie le jeton EN CLAIR une seule fois (pour
  // construire le lien) ; seule son empreinte est conservée.
  function createInvite({ name, email, coachId, createdBy }) {
    const em = normEmail(email);
    const nm = String(name || '').trim().slice(0, 80);
    if (!nm) return { ok: false, status: 400, error: 'Le nom du coach est requis.' };
    if (!EMAIL_RE.test(em)) return { ok: false, status: 400, error: 'Adresse email invalide.' };
    const taken = db().prepare('SELECT coach_id FROM coach_accounts WHERE email = ?').get(em);
    if (taken) return { ok: false, status: 409, error: 'Un compte coach existe déjà avec cet email.' };
    let linkId = null;
    if (coachId !== undefined && coachId !== null && coachId !== '') {
      linkId = Number(coachId);
      const c = Number.isInteger(linkId) ? db().prepare('SELECT id FROM coaches WHERE id = ? AND archived = 0').get(linkId) : null;
      if (!c) return { ok: false, status: 400, error: 'Coach existant introuvable.' };
      const acc = db().prepare("SELECT email FROM coach_accounts WHERE coach_id = ? AND email IS NOT NULL AND email <> ''").get(linkId);
      if (acc) return { ok: false, status: 409, error: 'Ce coach a déjà un compte (' + acc.email + ').' };
    } else {
      // Nouveau coach : le nom est unique dans `coaches` -> on prévient tout de
      // suite plutôt que d'échouer au moment où le coach accepte.
      const dup = db().prepare('SELECT id FROM coaches WHERE name = ? COLLATE NOCASE').get(nm);
      if (dup) return { ok: false, status: 409, error: 'Un coach nommé « ' + nm + ' » existe déjà : choisis-le dans « Coach existant » ou précise le nom.' };
    }
    const token = crypto.randomBytes(32).toString('base64url');
    const t = now();
    // Une seule invitation valable par email : les précédentes sont annulées.
    db().prepare("UPDATE coach_invites SET revoked_at = ? WHERE email = ? AND used_at = '' AND revoked_at = ''").run(t.toISOString(), em);
    const expires = new Date(t.getTime() + INVITE_TTL_MS).toISOString();
    const info = db().prepare('INSERT INTO coach_invites (token_hash, email, name, coach_id, created_by, created_at, expires_at) VALUES (?,?,?,?,?,?,?)')
      .run(hashToken(token), em, nm, linkId, String(createdBy || '').slice(0, 80), t.toISOString(), expires);
    return { ok: true, id: Number(info.lastInsertRowid), token, email: em, name: nm, expiresAt: expires };
  }

  function findValidInvite(token) {
    const tk = String(token || '');
    if (tk.length < 20 || tk.length > 200) return { ok: false, error: 'Lien d’invitation invalide.' };
    const r = db().prepare('SELECT * FROM coach_invites WHERE token_hash = ?').get(hashToken(tk));
    if (!r) return { ok: false, error: 'Lien d’invitation invalide.' };
    const st = inviteStatus(r, now().getTime());
    if (st === 'utilisee') return { ok: false, error: 'Cette invitation a déjà été utilisée. Connecte-toi avec ton email et ton mot de passe.' };
    if (st === 'annulee') return { ok: false, error: 'Cette invitation a été annulée. Demande un nouveau lien à l’administrateur.' };
    if (st === 'expiree') return { ok: false, error: 'Cette invitation a expiré. Demande un nouveau lien à l’administrateur.' };
    return { ok: true, invite: r };
  }

  // PUBLIC : l'écran d'accueil du coach n'affiche que son nom et SON email.
  function checkInvite(token) {
    const v = findValidInvite(token);
    if (!v.ok) return v;
    return { ok: true, name: v.invite.name, email: v.invite.email };
  }

  // PUBLIC : le coach choisit son mot de passe -> compte créé/activé, rôle 'coach'.
  function acceptInvite({ token, password }) {
    const v = findValidInvite(token);
    if (!v.ok) return { ok: false, status: 400, error: v.error };
    const pe = passwordError(password);
    if (pe) return { ok: false, status: 400, error: pe };
    const inv = v.invite;
    const t = iso();
    const ph = hashPassword(password);
    let coachId;
    try {
      db().transaction(() => {
        if (db().prepare('SELECT 1 FROM coach_accounts WHERE email = ?').get(inv.email)) throw new Error('email_pris');
        if (inv.coach_id) {
          const c = db().prepare('SELECT id FROM coaches WHERE id = ? AND archived = 0').get(inv.coach_id);
          if (!c) throw new Error('coach_absent');
          coachId = c.id;
        } else {
          // role 'coach' écrit en dur : jamais issu de la requête.
          coachId = Number(db().prepare("INSERT INTO coaches (name, role) VALUES (?, 'coach')").run(inv.name).lastInsertRowid);
        }
        const acc = db().prepare('SELECT email FROM coach_accounts WHERE coach_id = ?').get(coachId);
        if (acc && acc.email) throw new Error('deja_compte');
        db().prepare(`INSERT INTO coach_accounts (coach_id, email, password_hash, p42_access, created_at, updated_at, revoked_at)
          VALUES (?,?,?,1,?,?,'')
          ON CONFLICT(coach_id) DO UPDATE SET email = excluded.email, password_hash = excluded.password_hash,
            p42_access = 1, revoked_at = '', updated_at = excluded.updated_at`).run(coachId, inv.email, ph, t, t);
        db().prepare('UPDATE coach_invites SET used_at = ? WHERE id = ?').run(t, inv.id);
      })();
    } catch (e) {
      const msg = {
        email_pris: 'Un compte coach existe déjà avec cet email.',
        coach_absent: 'Le coach lié à cette invitation n’existe plus.',
        deja_compte: 'Ce coach a déjà un compte.',
      }[e && e.message];
      if (msg) return { ok: false, status: 409, error: msg };
      if (/UNIQUE/.test(String(e && e.message))) return { ok: false, status: 409, error: 'Un coach porte déjà ce nom. Demande à l’administrateur de te lier au coach existant.' };
      throw e;
    }
    return { ok: true, coach: coachForSession(coachId) };
  }

  // Connexion email + mot de passe. Message identique pour email inconnu et
  // mot de passe faux : on ne révèle pas quels emails ont un compte.
  function login({ email, password }) {
    const em = normEmail(email);
    const bad = { ok: false, status: 401, error: 'Email ou mot de passe incorrect.' };
    if (!em || !password) return bad;
    const acc = db().prepare('SELECT coach_id, password_hash, p42_access FROM coach_accounts WHERE email = ?').get(em);
    if (!acc || !acc.password_hash) {
      verifyPassword(password, 'scrypt$00$00'); // temps de réponse comparable
      return bad;
    }
    if (!verifyPassword(password, acc.password_hash)) return bad;
    if (!hasAccess(acc.coach_id)) return { ok: false, status: 403, error: 'Ton accès coach a été désactivé. Contacte l’administrateur.' };
    db().prepare('UPDATE coach_accounts SET last_login_at = ? WHERE coach_id = ?').run(iso(), acc.coach_id);
    return { ok: true, coach: coachForSession(acc.coach_id) };
  }

  function coachForSession(coachId) {
    const c = db().prepare('SELECT id, name, studio, is_leader FROM coaches WHERE id = ?').get(coachId);
    const acc = db().prepare('SELECT email FROM coach_accounts WHERE coach_id = ?').get(coachId);
    return { id: c.id, name: c.name, studio: c.studio || '', isLeader: !!c.is_leader, email: (acc && acc.email) || '' };
  }

  // ADMIN : coachs actifs + état de leur accès + invitations récentes.
  function listForAdmin() {
    const t = now().getTime();
    const coaches = db().prepare(`SELECT c.id, c.name, c.studio, c.is_leader,
        a.email, a.p42_access, a.revoked_at, a.last_login_at, a.created_at AS account_created_at
      FROM coaches c LEFT JOIN coach_accounts a ON a.coach_id = c.id
      WHERE c.archived = 0 ORDER BY c.name COLLATE NOCASE`).all().map((r) => ({
      id: r.id, name: r.name, studio: r.studio || '', isLeader: !!r.is_leader,
      email: r.email || '', hasPassword: !!r.email,
      access: r.p42_access === null || r.p42_access === undefined ? true : r.p42_access === 1,
      revokedAt: r.revoked_at || '', lastLoginAt: r.last_login_at || '',
    }));
    const invites = db().prepare('SELECT id, email, name, coach_id, created_by, created_at, expires_at, used_at, revoked_at FROM coach_invites ORDER BY id DESC LIMIT 50').all()
      .map((r) => ({ id: r.id, email: r.email, name: r.name, coachId: r.coach_id, createdBy: r.created_by, createdAt: r.created_at, expiresAt: r.expires_at, status: inviteStatus(r, t) }));
    return { coaches, invites };
  }

  function setAccess(coachId, allowed) {
    const id = Number(coachId);
    const c = Number.isInteger(id) ? db().prepare('SELECT id FROM coaches WHERE id = ?').get(id) : null;
    if (!c) return { ok: false, status: 404, error: 'Coach introuvable.' };
    const t = iso();
    db().prepare(`INSERT INTO coach_accounts (coach_id, email, p42_access, created_at, updated_at, revoked_at) VALUES (?, NULL, ?, ?, ?, ?)
      ON CONFLICT(coach_id) DO UPDATE SET p42_access = excluded.p42_access, revoked_at = excluded.revoked_at, updated_at = excluded.updated_at`)
      .run(id, allowed ? 1 : 0, t, t, allowed ? '' : t);
    return { ok: true };
  }

  function cancelInvite(id) {
    const r = db().prepare("UPDATE coach_invites SET revoked_at = ? WHERE id = ? AND used_at = '' AND revoked_at = ''").run(iso(), Number(id));
    return r.changes ? { ok: true } : { ok: false, status: 404, error: 'Invitation introuvable ou déjà utilisée.' };
  }

  return { hasAccess, createInvite, checkInvite, acceptInvite, login, listForAdmin, setAccess, cancelInvite };
}

module.exports = {
  createCoachAccess, ensureTables, hashPassword, verifyPassword, passwordError, hashToken,
  COACH_CLIENT_SCOPE, COACH_MESSAGING_SCOPE, INVITE_TTL_MS, PASSWORD_MIN,
};
