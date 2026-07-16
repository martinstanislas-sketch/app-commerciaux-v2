'use strict';
// ============================================================================
//  AUTHENTIFICATION CLIENT NUTRITION — logique extraite de server.js pour être
//  testable (elle vivait dans une closure de route, donc intestable).
//
//  Règles (ne PAS les changer sans rejouer la suite de tests) :
//   - Compte AVEC pin_hash          -> PIN obligatoire et vérifié.
//   - Compte PRÉ-CRÉÉ par un coach  -> code de cohorte EXIGÉ + pose du PIN.
//     (`pre_created = 1` ; repasse à 0 une fois l'espace réclamé)
//   - Compte HÉRITÉ sans PIN        -> pose du PIN, AUCUN code (rétro-compat).
//   - Email INCONNU                 -> invitation par lien obligatoire (secours).
//
//  Le code de cohorte est la preuve d'appartenance : sans lui, connaître
//  email + prénom + nom ne suffit pas à s'emparer d'un espace pré-créé.
//
//  `loginClient` ne crée PAS la session : il renvoie { ok, status, body } et
//  c'est l'appelant (server.js) qui pose le token. -> testable sans HTTP.
// ============================================================================
const crypto = require('crypto');

// --- Code PIN (pur : ne dépend que de `crypto`) ---
const PIN_RE = /^\d{4,6}$/;
function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(String(pin), salt, 32).toString('hex');
}
function verifyPin(pin, stored) {
  if (!stored || stored.indexOf(':') < 0 || !PIN_RE.test(String(pin || ''))) return false;
  const [salt, h] = stored.split(':');
  const a = Buffer.from(h, 'hex');
  const b = crypto.scryptSync(String(pin), salt, 32);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// Code de cohorte : 6 chiffres, facile à donner à l'oral.
function genAccessCode() { return String(crypto.randomInt(100000, 1000000)); }

function createClientAuth({ getDb, defaultCoachId }) {
  // Valide un jeton d'invitation pour la CRÉATION d'un compte (email inconnu).
  // Renvoie { ok:true, invite } ou { ok:false, error }.
  function validateInvite(token, email) {
    // Voie normale désormais : le coach PRÉ-CRÉE l'espace (le client se connecte alors
    // avec le code de sa cohorte). Le lien d'invitation reste un secours (client à distance).
    if (!token) return { ok: false, error: 'Ton espace n’existe pas encore. Demande à ton coach de te créer un accès.' };
    let inv = null;
    try { inv = getDb().prepare('SELECT * FROM nutrition_invites WHERE token = ?').get(String(token)); } catch (_) { inv = null; }
    if (!inv) return { ok: false, error: 'Invitation introuvable. Demande un nouveau lien à ton coach.' };
    if (inv.used_at) return { ok: false, error: 'Cette invitation a déjà été utilisée.' };
    if (inv.expires_at && Date.parse(inv.expires_at) < Date.now()) return { ok: false, error: 'Cette invitation a expiré. Demande un nouveau lien à ton coach.' };
    if (inv.email && inv.email.toLowerCase() !== String(email || '').toLowerCase()) return { ok: false, error: 'Cette invitation est liée à une autre adresse email.' };
    return { ok: true, invite: inv };
  }

  // Vérifie le CODE de cohorte d'un client PRÉ-CRÉÉ par un coach.
  // Le code est celui du groupe du client (ville + n° de challenge de sa fiche meta).
  function validateAccessCode(email, code) {
    if (!code) return { ok: false, error: 'Entre le code de ton groupe (ton coach te le donne).' };
    let meta = null;
    try { meta = getDb().prepare('SELECT ville, challenge_no FROM nutrition_client_meta WHERE client_email = ?').get(email); } catch (_) { meta = null; }
    if (!meta) return { ok: false, error: 'Ton espace n’est pas encore rattaché à un groupe. Préviens ton coach.' };
    let row = null;
    try { row = getDb().prepare('SELECT code, actif FROM nutrition_access_codes WHERE ville = ? AND challenge_no = ?').get(meta.ville, meta.challenge_no); } catch (_) { row = null; }
    if (!row || !row.actif || !row.code) return { ok: false, error: 'Aucun code actif pour ton groupe. Préviens ton coach.' };
    if (String(code).trim().toUpperCase() !== String(row.code).trim().toUpperCase()) return { ok: false, error: 'Code incorrect. Demande-le à ton coach.' };
    return { ok: true };
  }

  // Connexion / création d'un espace client. Ne pose pas la session.
  // -> { ok:false, status, body } | { ok:true, status:200, body:{ isNew, prenom, nom, data, email } }
  function loginClient(input) {
    const b = input || {};
    const email = String(b.email || '').trim().toLowerCase().slice(0, 160);
    const prenom = String(b.prenom || '').trim().slice(0, 80);
    const nom = String(b.nom || '').trim().slice(0, 80);
    const pin = String(b.pin || '').trim();
    if (!email || email.indexOf('@') < 1 || !prenom || !nom) {
      return { ok: false, status: 400, body: { ok: false, error: 'Email, prénom et nom requis.' } };
    }
    const now = new Date().toISOString();
    const row = getDb().prepare('SELECT * FROM nutrition_clients WHERE email = ?').get(email);
    let data = null, isNew = true;

    if (row && row.pin_hash) {
      // Compte protégé : le PIN est obligatoire et doit correspondre.
      if (!pin) return { ok: false, status: 401, body: { ok: false, needPin: true } };
      if (!verifyPin(pin, row.pin_hash)) return { ok: false, status: 401, body: { ok: false, needPin: true, error: 'Code PIN incorrect.' } };
      getDb().prepare('UPDATE nutrition_clients SET prenom = ?, nom = ?, updated_at = ? WHERE email = ?').run(prenom, nom, now, email);
      try { data = row.data ? JSON.parse(row.data) : null; } catch (_) { data = null; }
      isNew = !data;
    } else {
      // Compte nouveau OU ancien sans PIN : on EXIGE de définir un PIN maintenant.
      // Espace PRÉ-CRÉÉ par un coach : on exige EN PLUS le code de sa cohorte (preuve
      // d'appartenance). Les comptes HÉRITÉS (pre_created = 0, sans PIN) gardent
      // l'ancien comportement : pas de code.
      const preCree = !!(row && row.pre_created);
      if (preCree) {
        const chk = validateAccessCode(email, String(b.code || '').trim());
        if (!chk.ok) return { ok: false, status: 403, body: { ok: false, needCode: true, error: chk.error } };
      }
      if (!PIN_RE.test(pin)) {
        return { ok: false, status: 400, body: { ok: false, setPin: true, needCode: preCree, error: 'Choisis un code PIN de 4 à 6 chiffres pour protéger ton espace.' } };
      }
      const ph = hashPin(pin);
      if (row) {
        // Compte déjà présent (pré-créé ou hérité, sans PIN) : on pose le PIN maintenant.
        // pre_created repasse à 0 : l'espace est réclamé, le code ne sera plus demandé.
        getDb().prepare('UPDATE nutrition_clients SET prenom = ?, nom = ?, pin_hash = ?, pre_created = 0, updated_at = ? WHERE email = ?').run(prenom, nom, ph, now, email);
        try { data = row.data ? JSON.parse(row.data) : null; } catch (_) { data = null; }
        isNew = !data;
      } else {
        // Email INCONNU : création d'un nouvel espace -> invitation OBLIGATOIRE.
        const check = validateInvite(String(b.invite || '').trim(), email);
        if (!check.ok) return { ok: false, status: 403, body: { ok: false, needInvite: true, error: check.error } };
        const coachId = check.invite.coach_id || (typeof defaultCoachId === 'function' ? defaultCoachId() : null);
        getDb().prepare('INSERT INTO nutrition_clients (email, prenom, nom, data, pin_hash, coach_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)').run(email, prenom, nom, null, ph, coachId, now, now);
        getDb().prepare('UPDATE nutrition_invites SET used_at = ?, used_email = ? WHERE id = ?').run(now, email, check.invite.id);
      }
    }
    return { ok: true, status: 200, body: { isNew, prenom, nom, data, email } };
  }

  return { validateInvite, validateAccessCode, genAccessCode, loginClient };
}

module.exports = createClientAuth;
module.exports.createClientAuth = createClientAuth;
module.exports.PIN_RE = PIN_RE;
module.exports.hashPin = hashPin;
module.exports.verifyPin = verifyPin;
module.exports.genAccessCode = genAccessCode;
