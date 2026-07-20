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
  // Retrouve le GROUPE à partir du seul code du challenge (auto-inscription).
  // Le code est la porte d'entrée : il détermine la ville + le n° de challenge.
  // Renvoie { ville, challenge_no } ou null (inconnu, inactif, ou ambigu).
  function findGroupByCode(code) {
    const c = String(code || '').trim().toUpperCase();
    if (!c) return null;
    let rows = [];
    try {
      rows = getDb().prepare('SELECT ville, challenge_no FROM nutrition_access_codes WHERE actif = 1 AND UPPER(TRIM(code)) = ?').all(c);
    } catch (_) { return null; }
    if (rows.length !== 1) return null; // 0 = inconnu ; >1 = collision -> on refuse par prudence
    return rows[0];
  }
  // Génère un code qui n'est utilisé par AUCUN autre groupe (le code sert de clé
  // d'entrée : deux groupes avec le même code rendraient le rattachement ambigu).
  function genUniqueAccessCode() {
    for (let i = 0; i < 50; i++) {
      const c = genAccessCode();
      let taken = 0;
      try { taken = getDb().prepare('SELECT COUNT(*) n FROM nutrition_access_codes WHERE code = ?').get(c).n; } catch (_) { taken = 0; }
      if (!taken) return c;
    }
    return genAccessCode(); // improbable : on rend la main plutôt que boucler
  }

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
      const preCree = !!(row && row.pre_created);
      const code = String(b.code || '').trim();
      const invite = String(b.invite || '').trim();
      let groupe = null;     // groupe rejoint via le code (email inconnu)
      let inviteRow = null;  // secours : invitation par lien

      if (row) {
        // Espace PRÉ-CRÉÉ par un coach : on exige le code de SA cohorte (preuve
        // d'appartenance). Les comptes HÉRITÉS (pre_created = 0, sans PIN) gardent
        // l'ancien comportement : pas de code.
        if (preCree) {
          const chk = validateAccessCode(email, code);
          if (!chk.ok) return { ok: false, status: 403, body: { ok: false, needCode: true, error: chk.error } };
        }
      } else {
        // Email INCONNU : le CODE DU CHALLENGE est la voie normale (auto-inscription :
        // il détermine le groupe rejoint). Le lien d'invitation reste un secours.
        if (code) {
          groupe = findGroupByCode(code);
          if (!groupe) return { ok: false, status: 403, body: { ok: false, needCode: true, error: 'Code du challenge invalide. Demande-le à ton coach.' } };
        } else if (invite) {
          const check = validateInvite(invite, email);
          if (!check.ok) return { ok: false, status: 403, body: { ok: false, needInvite: true, error: check.error } };
          inviteRow = check.invite;
        } else {
          return { ok: false, status: 403, body: { ok: false, needCode: true, error: 'Entre le code de ton challenge (ton coach te le donne).' } };
        }
      }
      if (!PIN_RE.test(pin)) {
        return { ok: false, status: 400, body: { ok: false, setPin: true, needCode: preCree || !!groupe, error: 'Choisis un code PIN de 4 à 6 chiffres pour protéger ton espace.' } };
      }
      const ph = hashPin(pin);
      if (row) {
        // Compte déjà présent (pré-créé ou hérité, sans PIN) : on pose le PIN maintenant.
        // pre_created repasse à 0 : l'espace est réclamé, le code ne sera plus demandé.
        getDb().prepare('UPDATE nutrition_clients SET prenom = ?, nom = ?, pin_hash = ?, pre_created = 0, updated_at = ? WHERE email = ?').run(prenom, nom, ph, now, email);
        try { data = row.data ? JSON.parse(row.data) : null; } catch (_) { data = null; }
        isNew = !data;
      } else {
        // Création : coach par défaut (les auto-inscrits sont réattribués depuis l'admin).
        const coachId = (inviteRow && inviteRow.coach_id) || (typeof defaultCoachId === 'function' ? defaultCoachId() : null);
        getDb().prepare('INSERT INTO nutrition_clients (email, prenom, nom, data, pin_hash, coach_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)').run(email, prenom, nom, null, ph, coachId, now, now);
        // Rattachement au groupe porté par le code -> communauté + classements corrects.
        if (groupe) {
          getDb().prepare('INSERT INTO nutrition_client_meta (client_email, ville, challenge_no, updated_at) VALUES (?,?,?,?) ON CONFLICT(client_email) DO UPDATE SET ville = excluded.ville, challenge_no = excluded.challenge_no, updated_at = excluded.updated_at')
            .run(email, groupe.ville, groupe.challenge_no, now);
        }
        if (inviteRow) getDb().prepare('UPDATE nutrition_invites SET used_at = ?, used_email = ? WHERE id = ?').run(now, email, inviteRow.id);
      }
    }
    return { ok: true, status: 200, body: { isNew, prenom, nom, data, email } };
  }

  // ÉTAPE 1 de la connexion : valide l'identité + le code SANS rien créer, et dit au
  // front quel écran afficher ensuite. Le PIN est demandé à l'étape 2 (loginClient).
  //  -> mode 'pin-login' : compte déjà protégé, il n'a qu'à saisir son PIN (pas de code)
  //  -> mode 'pin-set'   : il va choisir son PIN (1re connexion), `groupe` = groupe rejoint
  function joinCheck(input) {
    const b = input || {};
    const email = String(b.email || '').trim().toLowerCase().slice(0, 160);
    const prenom = String(b.prenom || '').trim().slice(0, 80);
    const nom = String(b.nom || '').trim().slice(0, 80);
    const code = String(b.code || '').trim();
    if (!email || email.indexOf('@') < 1 || !prenom || !nom) {
      return { ok: false, status: 400, body: { ok: false, error: 'Email, prénom et nom requis.' } };
    }
    const row = getDb().prepare('SELECT email, pin_hash, pre_created FROM nutrition_clients WHERE email = ?').get(email);
    // Compte déjà protégé : le code ne sert à rien, on va droit au PIN.
    if (row && row.pin_hash) return { ok: true, status: 200, body: { ok: true, mode: 'pin-login' } };
    if (row) {
      // Compte sans PIN : pré-créé -> code de son groupe exigé ; hérité -> rien.
      if (row.pre_created) {
        const chk = validateAccessCode(email, code);
        if (!chk.ok) return { ok: false, status: 403, body: { ok: false, needCode: true, error: chk.error } };
      }
      return { ok: true, status: 200, body: { ok: true, mode: 'pin-set' } };
    }
    // Email inconnu : le code du challenge décide du groupe rejoint.
    if (!code) {
      // Secours : arrivé par un lien d'invitation -> pas de code à saisir.
      const invite = String(b.invite || '').trim();
      if (invite) {
        const chk = validateInvite(invite, email);
        if (!chk.ok) return { ok: false, status: 403, body: { ok: false, needInvite: true, error: chk.error } };
        return { ok: true, status: 200, body: { ok: true, mode: 'pin-set' } };
      }
      return { ok: false, status: 403, body: { ok: false, needCode: true, error: 'Entre le code de ton challenge (ton coach te le donne).' } };
    }
    const g = findGroupByCode(code);
    if (!g) return { ok: false, status: 403, body: { ok: false, needCode: true, error: 'Code du challenge invalide. Demande-le à ton coach.' } };
    const label = g.ville + (g.challenge_no ? ' #' + g.challenge_no : '');
    return { ok: true, status: 200, body: { ok: true, mode: 'pin-set', groupe: label } };
  }

  return { validateInvite, validateAccessCode, genAccessCode, genUniqueAccessCode, findGroupByCode, joinCheck, loginClient };
}

// ─── CLOISON MÉTIER / NUTRITION ─────────────────────────────────────────────
// Les deux mondes partagent le même magasin de sessions, et `requireAuth` ne
// regarde que l'existence du jeton. Cette fonction dit si une session vient du
// côté NUTRITION — client ou démo — et n'a donc rien à faire sur les routes
// métier (chiffre d'affaires, commerciaux, coachs).
// ⚠️ Extraite ici pour être TESTABLE : en ligne dans server.js, une régression
// sur ce contrôle serait passée inaperçue.
function estSessionNutrition(session) {
  if (!session || typeof session !== 'object') return false;
  return session.demo === true || session.role === 'nutrition_demo';
}

module.exports = createClientAuth;
module.exports.estSessionNutrition = estSessionNutrition;
module.exports.createClientAuth = createClientAuth;
module.exports.PIN_RE = PIN_RE;
module.exports.hashPin = hashPin;
module.exports.verifyPin = verifyPin;
module.exports.genAccessCode = genAccessCode;
