require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const Anthropic = require('@anthropic-ai/sdk').default;
const { getDb, ensureWeeklySettings, generatePin } = require('./db');
const { sendEmail, verifyConnection } = require('./email');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '20mb' })); // 20mb : audio communauté + upload ebooks (PDF base64)
app.use(express.static(path.join(__dirname, 'public')));

// Static serving for COACH app at /coach
app.use('/coach', express.static(path.join(__dirname, 'public', 'coach')));

// Page autonome Standards (photos quotidiennes) — club en test : Tours
app.get('/standard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'standard.html'));
});

// ─── Sessions (persistantes : cache memoire + SQLite) ───────
// Stockees en base (table `sessions`) pour SURVIVRE aux redeploiements (le
// process redemarre et viderait une Map memoire -> "Session expiree"). On garde
// un cache memoire pour la vitesse, avec ecriture immediate en base (write-through)
// et rehydratation au demarrage. Interface compatible Map (get/set/delete).

const sessions = (() => {
  const cache = new Map();
  let ready = false;
  function db() { try { return getDb(); } catch (_) { return null; } }
  function ensure() {
    if (ready) return;
    const d = db();
    if (!d) return; // base pas encore prete : on reessaiera au prochain appel
    try {
      d.exec('CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, data TEXT NOT NULL, created_at INTEGER NOT NULL)');
      d.prepare('DELETE FROM sessions WHERE created_at < ?').run(Date.now() - 90 * 86400000); // purge > 90 j
      for (const row of d.prepare('SELECT token, data FROM sessions').all()) {
        try { cache.set(row.token, JSON.parse(row.data)); } catch (_) { /* ligne corrompue ignoree */ }
      }
      ready = true;
    } catch (_) { /* on reessaiera au prochain appel */ }
  }
  return {
    get(token) { ensure(); return cache.get(token); },
    has(token) { ensure(); return cache.has(token); },
    set(token, data) {
      ensure();
      cache.set(token, data);
      const d = db();
      if (d) { try { d.prepare('INSERT OR REPLACE INTO sessions (token, data, created_at) VALUES (?, ?, ?)').run(token, JSON.stringify(data), Date.now()); } catch (e) { console.warn('Session non persistée en DB (sera perdue au redéploiement) :', e && e.message); } }
      return this;
    },
    delete(token) {
      ensure();
      cache.delete(token);
      const d = db();
      if (d) { try { d.prepare('DELETE FROM sessions WHERE token = ?').run(token); } catch (e) { console.warn('Session non supprimée en DB (token reste valide jusqu’à purge) :', e && e.message); } }
      return true;
    },
    // Invalide toutes les sessions d'un client (par email) -> coupe immédiatement son accès.
    purgeEmail(email) {
      ensure();
      if (!email) return 0;
      const toDel = [];
      for (const [tok, data] of cache.entries()) { if (data && data.email === email) toDel.push(tok); }
      toDel.forEach((tok) => this.delete(tok));
      return toDel.length;
    },
  };
})();

// ─── Auth Middleware ────────────────────────────────────────

function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non connecté' });
  }
  const token = authHeader.slice(7);
  const session = sessions.get(token);
  if (!session) {
    return res.status(401).json({ error: 'Session expirée' });
  }
  req.session = session;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  }
  next();
}

// ─── CLOISON : les sessions NUTRITION n'entrent pas dans le métier ───────────
// ⚠️ Les deux mondes partagent le même magasin de sessions, et `requireAuth` ne
// regarde QUE l'existence du jeton — jamais le rôle. Un compte client nutrition
// (role 'nutrition_demo', posé par /nutrition/account/login et /nutrition/demo/start)
// passait donc `requireAuth` sur TOUTES les routes métier : chiffre d'affaires,
// commerciaux, coachs — et certaines routes en écriture, faute d'un requireAdmin.
//
// Ce garde est monté sur le PRÉFIXE /api : il couvre les routes existantes ET
// celles qu'on ajoutera demain, ce qu'une liste à maintenir n'aurait pas fait.
// ⚠️ Il ne couvre pas /nutrition/api/* : ces chemins ne commencent pas par /api,
// et c'est bien l'intention — le client nutrition y est chez lui.
// On lit le jeton nous-mêmes : ce middleware s'exécute AVANT requireAuth, donc
// `req.session` n'existe pas encore.
function refuserSessionNutrition(req, res, next) {
  const h = req.headers['authorization'] || '';
  if (h.startsWith('Bearer ')) {
    const s = sessions.get(h.slice(7));
    // `demo` couvre la session démo publique, `nutrition_demo` le compte client.
    // La règle vit dans clientAuth (testée) plutôt qu'ici, en ligne.
    if (estSessionNutrition(s)) {
      return res.status(403).json({ error: 'Accès réservé à l\'équipe.' });
    }
  }
  next(); // pas de jeton, ou un jeton interne : requireAuth fait son travail ensuite
}
app.use('/api', refuserSessionNutrition);

// --- Code PIN client (protège l'accès au compte nutrition) ---
// Extraits dans nutrition-app/lib/clientAuth.js pour être testables ; réimportés
// ici sous les mêmes noms (utilisés aussi par la route account/set-pin).
const { PIN_RE, hashPin, verifyPin, estSessionNutrition } = require('./nutrition-app/lib/clientAuth');

// ─── Module Nutrition (My Coach Nutrition) ──────────────────
// Monté sous /nutrition. Réservé à l'administrateur principal.
//  - Les PAGES (/nutrition/...) sont servies en statique ; le blocage d'accès
//    se fait côté page (script qui vérifie le rôle admin via la session locale).
//  - Les DONNÉES/API (/nutrition/api/*) sont protégées côté serveur par
//    requireAuth + requireAdmin (token Bearer admin obligatoire).
// Permission évolutive : aujourd'hui = rôle 'admin' ; ouvrable plus tard à
// d'autres profils via une permission 'can_access_nutrition_module'.
// Accès au module nutrition : admin OU permission can_access_nutrition_module
// (évolutif : aujourd'hui seul l'admin a un compte avec accès, mais le jour où
// les sessions porteront des permissions, un client/coach pourra soumettre).
function requireNutritionAccess(req, res, next) {
  const s = req.session;
  const perms = (s && s.permissions) || [];
  if (s && (s.role === 'admin' || (Array.isArray(perms) && perms.includes('can_access_nutrition_module')))) return next();
  return res.status(403).json({ error: 'Accès réservé au module nutrition' });
}

// Tables du module nutrition : demandes d'aide + scans produits + avis coach.
function ensureNutritionHelpTable() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS nutrition_help_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      difficultes TEXT NOT NULL DEFAULT '[]',
      message TEXT NOT NULL DEFAULT '',
      statut TEXT NOT NULL DEFAULT 'a_traiter'
    );
    CREATE TABLE IF NOT EXISTS nutrition_scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      barcode TEXT NOT NULL DEFAULT '',
      product_name TEXT NOT NULL DEFAULT '',
      brand TEXT NOT NULL DEFAULT '',
      nutriscore TEXT NOT NULL DEFAULT '',
      coherence TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS nutrition_scan_advice (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      barcode TEXT NOT NULL DEFAULT '',
      product_name TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      statut TEXT NOT NULL DEFAULT 'a_traiter'
    );
    CREATE TABLE IF NOT EXISTS nutrition_adherence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_name TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      suivi INTEGER NOT NULL DEFAULT 0,
      adapte INTEGER NOT NULL DEFAULT 0,
      autre INTEGER NOT NULL DEFAULT 0,
      saute INTEGER NOT NULL DEFAULT 0,
      score INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_nutrition_adherence_client_date ON nutrition_adherence(client_name, date);
    CREATE TABLE IF NOT EXISTS nutrition_demo (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      code TEXT NOT NULL DEFAULT '2026',
      enabled INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT DEFAULT NULL,
      uses INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS nutrition_demo_access (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      accessed_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS nutrition_plate_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      meal_label TEXT NOT NULL DEFAULT '',
      precision_txt TEXT NOT NULL DEFAULT '',
      aliments TEXT NOT NULL DEFAULT '[]',
      kcal INTEGER NOT NULL DEFAULT 0,
      proteines INTEGER NOT NULL DEFAULT 0,
      glucides INTEGER NOT NULL DEFAULT 0,
      lipides INTEGER NOT NULL DEFAULT 0,
      coherence TEXT NOT NULL DEFAULT '',
      ia_comment TEXT NOT NULL DEFAULT '{}',
      thumb TEXT NOT NULL DEFAULT '',
      client_message TEXT NOT NULL DEFAULT '',
      advice_statut TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS nutrition_google_token (
      client_name TEXT PRIMARY KEY,
      access_token TEXT NOT NULL DEFAULT '',
      refresh_token TEXT NOT NULL DEFAULT '',
      expiry INTEGER NOT NULL DEFAULT 0,
      calendar_id TEXT NOT NULL DEFAULT '',
      calendar_name TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS nutrition_clients (
      email TEXT PRIMARY KEY,
      prenom TEXT NOT NULL DEFAULT '',
      nom TEXT NOT NULL DEFAULT '',
      data TEXT,
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS nutrition_community_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'message',
      photo TEXT NOT NULL DEFAULT '', -- dataURL ; visible par TOUT le groupe (≠ photos privées du Parcours)
      created_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS nutrition_community_reactions (
      message_id INTEGER NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (message_id, email)
    );
    CREATE TABLE IF NOT EXISTS nutrition_quick_options (
      slot TEXT PRIMARY KEY,
      nom TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      actif INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT ''
    );
    -- Challenge 6 semaines « Mon Parcours » : 3 pesées officielles (depart/s3/s6),
    -- photos d'évolution PRIVÉES (base64 en DB), séances validées.
    CREATE TABLE IF NOT EXISTS nutrition_parcours_pesees (
      client_email TEXT NOT NULL,
      type TEXT NOT NULL,
      poids REAL NOT NULL DEFAULT 0,
      date TEXT NOT NULL DEFAULT '',
      auteur_role TEXT NOT NULL DEFAULT '',
      auteur_id INTEGER NOT NULL DEFAULT 0,
      commentaire TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (client_email, type)
    );
    CREATE TABLE IF NOT EXISTS nutrition_parcours_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_email TEXT NOT NULL DEFAULT '',
      jalon TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL DEFAULT '',
      mime TEXT NOT NULL DEFAULT '',
      auteur_role TEXT NOT NULL DEFAULT '',
      auteur_id INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS nutrition_parcours_seances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_email TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL DEFAULT '',
      auteur_role TEXT NOT NULL DEFAULT '',
      auteur_id INTEGER NOT NULL DEFAULT 0,
      type TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT ''
    );
    -- Célébration de perte (S3/S6) déjà VUE par le client (affichée une seule fois).
    CREATE TABLE IF NOT EXISTS nutrition_parcours_celebrations_seen (
      client_email TEXT NOT NULL,
      jalon TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (client_email, jalon)
    );
    -- Mensurations saisies par le client (cm) : une entrée par date (upsert).
    CREATE TABLE IF NOT EXISTS nutrition_parcours_mensurations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_email TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL DEFAULT '',
      taille REAL, hanches REAL, poitrine REAL, bras REAL, cuisse REAL,
      created_at TEXT NOT NULL DEFAULT '',
      UNIQUE (client_email, date)
    );
    CREATE TABLE IF NOT EXISTS nutrition_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_email TEXT NOT NULL,
      coach_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT '',
      last_message_at TEXT NOT NULL DEFAULT '',
      statut TEXT NOT NULL DEFAULT 'active',
      UNIQUE(client_email, coach_id)
    );
    -- Multi-coach : coachs SUPPLÉMENTAIRES attribués à un client (au-delà du référent
    -- nutrition_clients.coach_id). Fil de messagerie PARTAGÉ : le client écrit une fois
    -- (au référent) ; tout coach listé ici — ou le référent — voit et répond.
    CREATE TABLE IF NOT EXISTS nutrition_client_coaches (
      client_email TEXT NOT NULL,
      coach_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (client_email, coach_id)
    );
    CREATE TABLE IF NOT EXISTS nutrition_client_meta (
      client_email TEXT PRIMARY KEY,
      ville TEXT NOT NULL DEFAULT '',
      challenge_no INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS nutrition_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      sender_role TEXT NOT NULL,
      sender_label TEXT NOT NULL DEFAULT '',
      contenu TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT '',
      lu INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS nutrition_message_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_label TEXT NOT NULL DEFAULT '',
      conversation_id INTEGER NOT NULL,
      action TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS nutrition_recipe_photos (
      recipe_id TEXT PRIMARY KEY,
      data TEXT NOT NULL DEFAULT '',
      mime TEXT NOT NULL DEFAULT '',
      auteur_role TEXT NOT NULL DEFAULT '',
      auteur_id INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS nutrition_coach_faq (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL DEFAULT '',
      reponse TEXT NOT NULL DEFAULT '',
      mots_cles TEXT NOT NULL DEFAULT '',
      categorie TEXT NOT NULL DEFAULT '',
      ordre INTEGER NOT NULL DEFAULT 0,
      actif INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS nutrition_community_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL DEFAULT '',
      actor_email TEXT NOT NULL DEFAULT '',
      actor_name TEXT NOT NULL DEFAULT '',
      emoji TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL DEFAULT '',
      dedup_key TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT ''
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_comm_events_dedup ON nutrition_community_events(dedup_key);
    CREATE TABLE IF NOT EXISTS nutrition_community_event_reactions (
      event_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (event_id, email)
    );
    CREATE TABLE IF NOT EXISTS nutrition_community_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_comm_comments_item ON nutrition_community_comments(item_id);
    -- Invitations client : jeton généré par le coach. Un email INCONNU ne peut créer
    -- son espace (poser son PIN) qu'avec un jeton valide -> plus de prise de compte
    -- par simple connaissance de l'email + nom. Les clients déjà inscrits se connectent
    -- sans invitation (leur PIN existant fait foi).
    CREATE TABLE IF NOT EXISTS nutrition_invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL DEFAULT '',        -- si renseigné : l'invitation n'est valable que pour cet email
      prenom TEXT NOT NULL DEFAULT '',
      nom TEXT NOT NULL DEFAULT '',
      coach_id INTEGER DEFAULT NULL,
      coach_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT '',
      expires_at TEXT NOT NULL DEFAULT '',
      used_at TEXT NOT NULL DEFAULT '',
      used_email TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_invites_email ON nutrition_invites(email);
    -- Connexion simplifiée : le coach PRÉ-CRÉE l'espace du client (aucun lien à envoyer),
    -- et lui donne oralement le CODE de sa cohorte (ville + n° de challenge). À sa 1re
    -- connexion, le client prouve son appartenance avec ce code puis pose son PIN.
    -- Le code protège la fenêtre de réclamation : sans lui, connaître email+prénom+nom
    -- ne suffit pas à s'emparer d'un compte pré-créé.
    -- Cette table décrit la COHORTE (ville + n° de challenge) : son code d'entrée
    -- ET sa date de début. start_date (YYYY-MM-DD) lance le parcours pour tout le
    -- groupe le même jour ; vide = chacun démarre à sa pesée de départ (comportement
    -- historique). Une date FUTURE tient le chemin verrouillé jusqu'au jour J.
    CREATE TABLE IF NOT EXISTS nutrition_access_codes (
      ville TEXT NOT NULL DEFAULT '',
      challenge_no INTEGER NOT NULL DEFAULT 0,
      code TEXT NOT NULL DEFAULT '',
      actif INTEGER NOT NULL DEFAULT 1,
      start_date TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (ville, challenge_no)
    );
  `);
  // Coach « réponses préenregistrées » (gratuit) : graine VERSIONNÉE.
  // - table vide      -> on insère tout (1re installation).
  // - version montée  -> on COMPLÈTE : on ajoute uniquement les nouvelles entrées
  //   (question encore absente). On ne touche jamais au contenu édité par l'admin,
  //   et une entrée d'un lot déjà appliqué supprimée par l'admin ne « revient » pas
  //   (le complément ne se rejoue qu'au prochain bump de version).
  try {
    const { COACH_FAQ_SEED, SEED_VERSION } = require('./nutrition-app/lib/coachFaq');
    const n = getDb().prepare('SELECT COUNT(*) AS n FROM nutrition_coach_faq').get().n;
    const verRow = getDb().prepare("SELECT value FROM app_settings WHERE key = 'nutrition_coach_faq_seed_v'").get();
    const storedV = verRow ? (Number(verRow.value) || 0) : 0;
    const ins = getDb().prepare("INSERT INTO nutrition_coach_faq (question, reponse, mots_cles, categorie, ordre, actif, updated_at) VALUES (?,?,?,?,?,1,datetime('now','localtime'))");
    if (!n) {
      COACH_FAQ_SEED.forEach((e, i) => ins.run(e.q, e.r, e.k, e.c || '', i + 1));
      console.warn('Coach FAQ : graine initiale insérée (' + COACH_FAQ_SEED.length + ' réponses).');
    } else if (storedV < SEED_VERSION) {
      const exists = getDb().prepare('SELECT 1 FROM nutrition_coach_faq WHERE question = ? LIMIT 1');
      let added = 0;
      COACH_FAQ_SEED.forEach((e, i) => { if (!exists.get(e.q)) { ins.run(e.q, e.r, e.k, e.c || '', i + 1); added++; } });
      if (added) console.warn('Coach FAQ : complément v' + SEED_VERSION + ' (+' + added + ' réponses).');
    }
    getDb().prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('nutrition_coach_faq_seed_v', ?, datetime('now','localtime')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").run(String(SEED_VERSION));
  } catch (e) { console.error('Seed coach FAQ :', e && e.message); }
  // Migration : attribution d'un coach sportif à un client nutrition (socle des espaces par rôle).
  try {
    const ncCols = getDb().prepare('PRAGMA table_info(nutrition_clients)').all();
    if (!ncCols.some((c) => c.name === 'coach_id')) {
      getDb().exec('ALTER TABLE nutrition_clients ADD COLUMN coach_id INTEGER DEFAULT NULL');
    }
  } catch (e) { console.error('Migration nutrition_clients.coach_id :', e && e.message); }
  // Migration : code PIN par client (protège l'accès au compte = photos, poids, messages).
  try {
    const ncCols = getDb().prepare('PRAGMA table_info(nutrition_clients)').all();
    if (!ncCols.some((c) => c.name === 'pin_hash')) {
      getDb().exec("ALTER TABLE nutrition_clients ADD COLUMN pin_hash TEXT NOT NULL DEFAULT ''");
    }
  } catch (e) { console.error('Migration nutrition_clients.pin_hash :', e && e.message); }
  // Migration : photo de profil PUBLIQUE (avatar communauté). `avatar` = data URI base64,
  // `avatar_key` = clé aléatoire non devinable servant d'URL image (capability URL) :
  // permet un <img src> direct (une balise image ne peut pas envoyer d'en-tête d'auth)
  // sans exposer l'email. Le client choisit lui-même de partager sa photo au groupe.
  try {
    const ncCols = getDb().prepare('PRAGMA table_info(nutrition_clients)').all();
    if (!ncCols.some((c) => c.name === 'avatar')) {
      getDb().exec("ALTER TABLE nutrition_clients ADD COLUMN avatar TEXT NOT NULL DEFAULT ''");
    }
    if (!ncCols.some((c) => c.name === 'avatar_key')) {
      getDb().exec("ALTER TABLE nutrition_clients ADD COLUMN avatar_key TEXT NOT NULL DEFAULT ''");
    }
    // Avatar personnalisable : on stocke la CONFIG (JSON), jamais une image —
    // le SVG est reconstruit à la volée. `avatar` (photo importée) est conservé
    // en REPLI tant que le client n'a pas créé son avatar : rien n'est détruit.
    if (!ncCols.some((c) => c.name === 'avatar_config')) {
      getDb().exec("ALTER TABLE nutrition_clients ADD COLUMN avatar_config TEXT NOT NULL DEFAULT ''");
    }
  } catch (e) { console.error('Migration nutrition_clients.avatar :', e && e.message); }
  // Migration : espace PRÉ-CRÉÉ par un coach (connexion simplifiée, sans lien d'invitation).
  // 1 = créé par un coach et pas encore réclamé -> la 1re connexion exigera le CODE de la
  // cohorte du client (en plus du PIN qu'il choisit). Remis à 0 une fois le compte réclamé.
  // Les comptes HÉRITÉS (sans PIN, d'avant ce système) gardent pre_created = 0 : leur
  // comportement actuel est préservé, on ne les bloque pas.
  try {
    const ncCols = getDb().prepare('PRAGMA table_info(nutrition_clients)').all();
    if (!ncCols.some((c) => c.name === 'pre_created')) {
      getDb().exec('ALTER TABLE nutrition_clients ADD COLUMN pre_created INTEGER NOT NULL DEFAULT 0');
    }
  } catch (e) { console.error('Migration nutrition_clients.pre_created :', e && e.message); }
  // Verrouillage anti-force-brute du PIN : compteur d'échecs + drapeau de blocage.
  // Un compte se bloque après MAX_PIN_FAILS codes erronés (cf. clientAuth) et ne
  // se rouvre que par un coach ou l'admin — jamais tout seul.
  try {
    const ncCols = getDb().prepare('PRAGMA table_info(nutrition_clients)').all();
    if (!ncCols.some((c) => c.name === 'pin_fails')) {
      getDb().exec('ALTER TABLE nutrition_clients ADD COLUMN pin_fails INTEGER NOT NULL DEFAULT 0');
    }
    if (!ncCols.some((c) => c.name === 'pin_locked')) {
      getDb().exec('ALTER TABLE nutrition_clients ADD COLUMN pin_locked INTEGER NOT NULL DEFAULT 0');
    }
  } catch (e) { console.error('Migration nutrition_clients.pin_fails/pin_locked :', e && e.message); }
  // Migration : date de début de la COHORTE (lance le parcours pour tout le groupe).
  // Vide = comportement historique (chacun démarre à sa pesée de départ) -> les
  // groupes existants ne bougent pas tant qu'aucune date n'est posée à la main.
  try {
    const acCols = getDb().prepare('PRAGMA table_info(nutrition_access_codes)').all();
    if (acCols.length && !acCols.some((c) => c.name === 'start_date')) {
      getDb().exec("ALTER TABLE nutrition_access_codes ADD COLUMN start_date TEXT NOT NULL DEFAULT ''");
    }
  } catch (e) { console.error('Migration nutrition_access_codes.start_date :', e && e.message); }
  // Migration : cloisonnement de la Communauté par groupe (ville + n° de challenge).
  try {
    const cmCols = getDb().prepare('PRAGMA table_info(nutrition_community_messages)').all();
    if (!cmCols.some((c) => c.name === 'group_key')) {
      getDb().exec("ALTER TABLE nutrition_community_messages ADD COLUMN group_key TEXT NOT NULL DEFAULT ''");
    }
  } catch (e) { console.error('Migration community group_key :', e && e.message); }
  // Migration : photo jointe à un post communautaire (dataURL base64, comme l'avatar).
  // ⚠️ Ces photos sont vues par TOUT le groupe — rien à voir avec les photos de Mon
  // Parcours, qui restent privées (client + coach) dans nutrition_parcours_photos.
  try {
    const cmCols = getDb().prepare('PRAGMA table_info(nutrition_community_messages)').all();
    if (cmCols.length && !cmCols.some((c) => c.name === 'photo')) {
      getDb().exec("ALTER TABLE nutrition_community_messages ADD COLUMN photo TEXT NOT NULL DEFAULT ''");
    }
  } catch (e) { console.error('Migration community photo :', e && e.message); }
  // Migration : unification de l'identité client sur l'email. Les tables historiques
  // (aide/scans/avis/adhérence/assiettes) lient un client par `client_name` (texte libre
  // = nom de session) ≠ email -> impossible à scoper proprement par coach. On ajoute une
  // colonne `client_email` (remplie en avant par les routes), puis on backfill sans risque :
  // uniquement quand le nom correspond à UN SEUL client (sinon on laisse vide).
  try {
    const legacyTables = ['nutrition_help_requests', 'nutrition_scans', 'nutrition_scan_advice', 'nutrition_adherence', 'nutrition_plate_analysis'];
    legacyTables.forEach((t) => {
      const cols = getDb().prepare('PRAGMA table_info(' + t + ')').all();
      if (!cols.some((c) => c.name === 'client_email')) {
        getDb().exec("ALTER TABLE " + t + " ADD COLUMN client_email TEXT NOT NULL DEFAULT ''");
      }
    });
    // Carte nom -> email, en marquant les noms ambigus (plusieurs clients) comme non résolubles.
    const nameToEmail = {};
    const ambiguous = new Set();
    const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
    getDb().prepare("SELECT email, prenom, nom FROM nutrition_clients").all().forEach((c) => {
      const keys = [norm((c.prenom || '') + ' ' + (c.nom || '')), norm(c.prenom)];
      keys.forEach((k) => {
        if (!k) return;
        if (ambiguous.has(k)) return;
        if (nameToEmail[k] && nameToEmail[k] !== c.email) { ambiguous.add(k); delete nameToEmail[k]; }
        else nameToEmail[k] = c.email;
      });
    });
    legacyTables.forEach((t) => {
      const rows = getDb().prepare("SELECT DISTINCT client_name FROM " + t + " WHERE client_email = '' AND client_name != ''").all();
      const upd = getDb().prepare("UPDATE " + t + " SET client_email = ? WHERE client_name = ? AND client_email = ''");
      rows.forEach((r) => { const e2 = nameToEmail[norm(r.client_name)]; if (e2) upd.run(e2, r.client_name); });
    });
  } catch (e) { console.error('Migration unification client_email :', e && e.message); }
  // Seed config démo (une seule ligne).
  getDb().prepare("INSERT OR IGNORE INTO nutrition_demo (id, code, enabled) VALUES (1, '2026', 1)").run();
  // Migration : bascule l'ancien code par défaut vers '2026' (sans écraser un code personnalisé saisi par l'admin).
  getDb().prepare("UPDATE nutrition_demo SET code = '2026' WHERE id = 1 AND code = 'MYCOACH-DEMO-CLIENT-2026'").run();
}
function getDemoConfig() {
  return getDb().prepare('SELECT code, enabled, expires_at, uses FROM nutrition_demo WHERE id = 1').get()
    || { code: '2026', enabled: 1, expires_at: null, uses: 0 };
}
// Accès au module nutrition pour USAGE client (admin OU session démo).
// Les routes coach restent en requireAdmin (declarees avant le catch-all).
function requireNutritionUse(req, res, next) {
  const s = req.session;
  const perms = (s && s.permissions) || [];
  if (s && (s.role === 'admin' || s.role === 'nutrition_demo' || (Array.isArray(perms) && perms.includes('can_access_nutrition_module')))) return next();
  return res.status(403).json({ error: 'Accès réservé au module nutrition' });
}

// Coach sportif OU admin (pour les vues coach de la nutrition). Expose le
// périmètre dans req.nutritionScope : { isAdmin, coachId } -> les requêtes
// filtrent ensuite par coachId (un coach ne voit QUE ses clients ; admin = tout).
function requireCoachOrAdmin(req, res, next) {
  const s = req.session;
  if (!s) return res.status(401).json({ error: 'Non connecté' });
  if (s.role === 'admin') { req.nutritionScope = { isAdmin: true, coachId: null }; return next(); }
  if ((s.role === 'coach' || s.role === 'coach-leader') && s.coach_id) {
    req.nutritionScope = { isAdmin: false, coachId: s.coach_id };
    return next();
  }
  return res.status(403).json({ error: 'Accès réservé aux coachs et administrateurs' });
}

// Scope SQL des vues legacy par coach. Admin -> aucune restriction. Coach -> filtre
// sur les emails de SES clients (via client_email rempli sur les tables historiques) ;
// un coach sans client (ou des lignes sans email résolu) ne voit rien (1=0).
function coachLegacyScope(sc, col) {
  if (sc.isAdmin) return { where: '', and: '', params: [] };
  // Multi-coach : clients suivis en tant que référent OU coach supplémentaire.
  const set = new Set();
  try { getDb().prepare('SELECT email FROM nutrition_clients WHERE coach_id = ?').all(sc.coachId).forEach((r) => set.add(r.email)); } catch (_) { /* ignore */ }
  try { getDb().prepare('SELECT client_email FROM nutrition_client_coaches WHERE coach_id = ?').all(sc.coachId).forEach((r) => set.add(r.client_email)); } catch (_) { /* ignore */ }
  const emails = [...set].filter(Boolean);
  if (!emails.length) return { where: ' WHERE 1=0', and: ' AND 1=0', params: [] };
  const ph = emails.map(() => '?').join(',');
  return { where: ' WHERE ' + col + " != '' AND " + col + ' IN (' + ph + ')', and: ' AND ' + col + " != '' AND " + col + ' IN (' + ph + ')', params: emails };
}

// ─── Google Agenda (OAuth + synchronisation) ────────────────
// Scope minimal : calendar.app.created -> l'app ne gere QUE son propre calendrier
// "My Coach Nutrition", sans acceder a l'agenda personnel du client.
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
function googleCfg() { return { id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET, redirect: process.env.GOOGLE_REDIRECT_URI }; }
function googleConfigured() { const c = googleCfg(); return !!(c.id && c.secret && c.redirect); }
function googleClientKey(req) { return (req.session && req.session.name) || 'Client'; }
function gPad(n) { return String(n).padStart(2, '0'); }
function isoLocal(d) {
  const off = -d.getTimezoneOffset(); const sign = off >= 0 ? '+' : '-';
  return d.getFullYear() + '-' + gPad(d.getMonth() + 1) + '-' + gPad(d.getDate()) + 'T' + gPad(d.getHours()) + ':' + gPad(d.getMinutes()) + ':00' + sign + gPad(Math.floor(Math.abs(off) / 60)) + ':' + gPad(Math.abs(off) % 60);
}
function signState(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.GOOGLE_CLIENT_SECRET || 'mcn-secret').update(data).digest('base64url');
  return data + '.' + sig;
}
function verifyState(state) {
  const parts = String(state || '').split('.'); if (parts.length !== 2) return null;
  const exp = crypto.createHmac('sha256', process.env.GOOGLE_CLIENT_SECRET || 'mcn-secret').update(parts[0]).digest('base64url');
  if (exp !== parts[1]) return null;
  try { return JSON.parse(Buffer.from(parts[0], 'base64url').toString()); } catch (_) { return null; }
}
async function googleTokenRequest(params) {
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
  return r.json();
}
// Renvoie une ligne token a jour (rafraichit si expire), ou null.
async function googleValidToken(clientName) {
  const row = getDb().prepare('SELECT * FROM nutrition_google_token WHERE client_name = ?').get(clientName);
  if (!row) return null;
  if (Date.now() < row.expiry - 60000 && row.access_token) return row;
  const c = googleCfg();
  const tok = await googleTokenRequest({ client_id: c.id, client_secret: c.secret, refresh_token: row.refresh_token, grant_type: 'refresh_token' });
  if (!tok.access_token) return null;
  const expiry = Date.now() + (tok.expires_in || 3600) * 1000;
  getDb().prepare('UPDATE nutrition_google_token SET access_token = ?, expiry = ?, updated_at = ? WHERE client_name = ?').run(tok.access_token, expiry, new Date().toISOString(), clientName);
  row.access_token = tok.access_token; row.expiry = expiry;
  return row;
}
async function gcal(token, method, path, body) {
  const r = await fetch('https://www.googleapis.com/calendar/v3' + path, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  let json = {}; try { json = await r.json(); } catch (_) { /* no body */ }
  return { status: r.status, json };
}
// Construit les evenements Google a partir du plan (anti-doublon par id deterministe).
// Horaires FIXES des repas (aligne avec le client / export .ics) : petit-dej 7h,
// collation du matin 10h, dejeuner 12h, collation de l'apres-midi 15h30, diner 19h,
// collation du soir 21h ; collation « apres sport » a 17h par defaut. [h, min, duree_min].
const GHEURES = { 'petit-dejeuner': [7, 0, 30], dejeuner: [12, 0, 45], diner: [19, 0, 45] };
const GCOLLATION_HEURES = { matin: [10, 0, 15], 'apres-midi': [15, 30, 15], 'apres-sport': [17, 0, 15], soir: [21, 0, 15] };
function gCollationMoment(label) {
  const n = String(label || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (n.includes('sport')) return 'apres-sport';
  if (n.includes('matin')) return 'matin';
  if (n.includes('soir')) return 'soir';
  return 'apres-midi';
}
function gCreneauHeures(creneau, label) {
  if (creneau === 'collation') return GCOLLATION_HEURES[gCollationMoment(label)] || GCOLLATION_HEURES['apres-midi'];
  return GHEURES[creneau] || [12, 0, 30];
}
function buildPlanEvents(plan, scope, planId, dinerTard) {
  if (!plan || !Array.isArray(plan.jours)) return [];
  const base = new Date(); base.setHours(0, 0, 0, 0);
  const jours = scope === 'jour' ? plan.jours.slice(0, 1) : plan.jours;
  const out = [];
  jours.forEach((jour, di) => {
    (jour.repas || []).forEach((repas) => {
      const r = repas.recette; if (!r) return;
      if (scope === 'rappels' && repas.creneau === 'collation') return; // rappels = repas principaux
      const [hh, mm, dur] = gCreneauHeures(repas.creneau, repas.label);
      const start = new Date(base); start.setDate(base.getDate() + di); start.setHours(hh, mm, 0, 0);
      const end = new Date(start); end.setMinutes(start.getMinutes() + dur);
      const dateKey = start.getFullYear() + gPad(start.getMonth() + 1) + gPad(start.getDate());
      const id = 'mcn' + crypto.createHash('sha1').update(String(planId) + dateKey + repas.creneau).digest('hex').slice(0, 26);
      const ingr = (r.ingredients || []).slice(0, 5).map((i) => i.nom).join(', ');
      const desc = `${r.nom}\n${r.kcal} kcal · ${r.proteines} g proteines\nIngredients : ${ingr}\n\nMy Coach Nutrition`;
      out.push({ id, summary: `My Coach Nutrition · ${repas.label}`, description: desc, start: { dateTime: isoLocal(start) }, end: { dateTime: isoLocal(end) } });
    });
  });
  return out;
}

// Chemin du challenge : moteur gamifié 42 jours (module dédié, testable).
const {
  ensureChallengePathSchema, awardClientEvent, awardSeanceBonus, recordEbookOpen, recordDayWin, challengePublicState, unlockedThresholds, pathStartYmd,
  assurerCadeaux, bonsDe, bonParCode, retirerBon, setUnlockNotifier, punchProgression,
  declarerMissionBonus, missionsBonusDeclarees, deciderMissionBonus,
} = require('./nutrition-app/lib/challengePath')({ getDb });
// Bilan hebdo : seuils + rédaction par modèles (pur, testable). L'IA est chargée
// à la demande, pour ne pas dépendre du SDK Anthropic quand elle n'est pas utilisée.
const bilanHebdo = require('./nutrition-app/lib/bilanHebdo');
// Seuils de Punch : LA source de vérité des déblocages (vidéos, ebooks, cadeaux).
const punchSeuils = require('./nutrition-app/lib/punchSeuils');
// Le calendrier du challenge (jours de séance, départ un lundi) : une seule
// source, partagée par la route de validation et le contrôle des groupes.
const challengeCal = require('./nutrition-app/lib/challengePath');
// Répartition des ebooks (intro / Chemin / paliers de Punch), validée par id.
const ebooksSources = require('./nutrition-app/lib/ebooksSources');
// Cadeaux : ce qu'est chaque cadeau (nom, digital/physique) + le thème selon le Punch.
const cadeaux = require('./nutrition-app/lib/cadeaux');
// Avatar : config -> SVG. Le MÊME module sert au navigateur (aperçu de l'éditeur),
// donc l'aperçu ne peut pas diverger de ce que voient les autres membres.
const avatarLib = require('./nutrition-app/lib/avatar');
function nutritionAiBilan() { return require('./nutrition-app/lib/aiGenerator'); }

try {
  const nutritionApp = require('./nutrition-app/server');
  ensureNutritionHelpTable();
  ensureChallengePathSchema();

  // Notifications push (Web Push / VAPID) : moteur + routes + scénarios.
  const push = require('./nutrition-app/lib/push')({ app, getDb, mw: { requireAuth, requireNutritionUse, requireCoachOrAdmin } });
  // Déblocage de récompense -> notification (le moteur signale, le push décide :
  // c'est CE moteur-ci qui écrit le Punch, donc lui seul voit tomber les seuils).
  try { setUnlockNotifier(push.notifyUnlocks); } catch (e) { console.warn('unlock notifier :', e && e.message); }

  // --- TABLE DES DÉBLOCAGES : la donnée fait foi, plus le code ---------------
  // Les seuils vivent en base pour être ajustables SANS redéploiement. Le JSON
  // du dépôt n'est que le seed : il remplit la table au premier démarrage, puis
  // c'est la base qui gouverne. `setTable` injecte l'ensemble dans le moteur.
  function ensureDeblocagesSchema() {
    getDb().prepare(`CREATE TABLE IF NOT EXISTS nutrition_deblocages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seuil INTEGER NOT NULL,
      type TEXT NOT NULL,
      nom TEXT NOT NULL DEFAULT '',
      rang INTEGER,
      ref TEXT,
      bonus_accessoire TEXT,
      maj_at TEXT
    )`).run();
    const n = getDb().prepare('SELECT COUNT(*) c FROM nutrition_deblocages').get().c;
    if (!n) {
      const ins = getDb().prepare('INSERT INTO nutrition_deblocages (seuil, type, nom, rang, ref, bonus_accessoire, maj_at) VALUES (?,?,?,?,?,?,?)');
      const now = new Date().toISOString();
      getDb().transaction((lignes) => lignes.forEach((d) => ins.run(d.seuil, d.type, d.nom, d.rang, d.ref, d.bonus_accessoire, now)))(punchSeuils.tableReference());
      console.log('Déblocages : table semée depuis lib/deblocages.json');
    }
  }
  // Retrait UNIQUE de cadeaux décidés hors ligne (le seed ne se rejoue pas sur
  // une table déjà remplie). Guardé par un drapeau : joué une seule fois, jamais
  // au redémarrage — un cadeau que l'admin RÉ-AJOUTERAIT ensuite n'est pas
  // resupprimé. ⚠️ Un client qui avait DÉJÀ gagné un de ces cadeaux garde son bon
  // (nutrition_gift_bons), on ne touche qu'au barème à venir.
  function purgeCadeauxRetires() {
    const VERSION = 'v1-2026-07';
    const A_RETIRER = ['ambassadeur', 'acces_prioritaire', 'mois_offert', 'remise_abo', 'badge_argent'];
    try {
      const faite = (getDb().prepare("SELECT value FROM app_settings WHERE key='deblocages_purge'").get() || {}).value;
      if (faite === VERSION) return;
      const ph = A_RETIRER.map(() => '?').join(',');
      const r = getDb().prepare('DELETE FROM nutrition_deblocages WHERE ref IN (' + ph + ')').run(...A_RETIRER);
      getDb().prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('deblocages_purge', ?, datetime('now','localtime')) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(VERSION);
      if (r.changes) console.log('Déblocages : ' + r.changes + ' cadeau(x) retiré(s) du barème (' + A_RETIRER.join(', ') + ')');
    } catch (e) { console.error('Déblocages : purge impossible —', e && e.message); }
  }
  function chargerDeblocages() {
    try {
      ensureDeblocagesSchema();
      purgeCadeauxRetires(); // avant la lecture -> le moteur voit la table nettoyée
      const rows = getDb().prepare('SELECT seuil, type, nom, rang, ref, bonus_accessoire FROM nutrition_deblocages ORDER BY seuil').all();
      // ⚠️ `setTable` REFUSE une table vide : en cas de base vidée par erreur, le
      // moteur garde la référence du dépôt plutôt que de ne plus rien débloquer.
      if (!punchSeuils.setTable(rows)) console.warn('Déblocages : table vide en base -> référence du dépôt conservée');
    } catch (e) { console.error('Déblocages : chargement impossible, référence conservée —', e && e.message); }
  }
  chargerDeblocages();

  // Le RANG d'une vidéo (1..27) : les vidéos sont téléversées par l'admin, leur
  // ordre ne peut pas être écrit en dur. On le calcule une fois — par lot, puis
  // par id, ce qui reproduit exactement l'ordre historique — et on le met en
  // cache. Le cache est vidé dès qu'une vidéo est ajoutée ou retirée.
  let _rangsVideos = null;
  function rangsVideos() {
    if (_rangsVideos) return _rangsVideos;
    const m = new Map();
    try {
      getDb().prepare("SELECT id FROM nutrition_ebooks WHERE type = 'video' ORDER BY COALESCE(video_lot, 99), COALESCE(sort_order, 9999), id").all()
        .forEach((r, i) => m.set(Number(r.id), i + 1));
    } catch (e) { console.warn('rangs vidéos :', e && e.message); }
    _rangsVideos = m;
    return m;
  }
  function viderCacheRangsVideos() { _rangsVideos = null; }
  ebooksSources.setRangVideo((id) => rangsVideos().get(Number(id)) || null);

  // --- ADMIN : lire et ajuster les seuils, sans redéploiement ----------------
  // GET  -> la table courante + le contexte (plafonds, nb de contenus réels).
  // PUT  -> remplace la table ENTIÈRE, puis la réinjecte dans le moteur.
  // ⚠️ Remplacement complet et transactionnel, pas une édition ligne à ligne :
  // une table partiellement écrite laisserait des clients avec des récompenses
  // impossibles à atteindre. Tout passe, ou rien ne change.
  app.get('/nutrition/api/admin/deblocages', requireAuth, requireAdmin, (req, res) => {
    try {
      ensureDeblocagesSchema();
      const lignes = getDb().prepare('SELECT id, seuil, type, nom, rang, ref, bonus_accessoire FROM nutrition_deblocages ORDER BY seuil, type').all();
      const nbVideos = getDb().prepare("SELECT COUNT(*) c FROM nutrition_ebooks WHERE type='video'").get().c;
      res.json({
        ok: true, lignes,
        plafondParcours: punchSeuils.REFERENCE.plafond_parcours_parfait,
        plafondAbsolu: punchSeuils.PUNCH_MAX_THEORIQUE,
        contenus: { videos: nbVideos, guides: ebooksSources.RANG_GUIDE.size },
      });
    } catch (e) { console.error('admin deblocages GET :', e); res.status(500).json({ ok: false }); }
  });
  app.put('/nutrition/api/admin/deblocages', requireAuth, requireAdmin, (req, res) => {
    try {
      const brut = Array.isArray((req.body || {}).lignes) ? req.body.lignes : null;
      if (!brut) return res.status(400).json({ ok: false, error: 'Liste attendue.' });
      const lignes = punchSeuils.normaliser(brut); // même nettoyage que le moteur
      if (!lignes.length) return res.status(400).json({ ok: false, error: 'Aucune ligne exploitable.' });
      // Un seuil au-dessus du plafond serait INATTEIGNABLE : la récompense
      // n'existerait que sur le papier. On refuse plutôt que de l'accepter en
      // silence — c'est exactement le genre d'erreur qu'on ne voit jamais.
      const trop = lignes.filter((d) => d.seuil > punchSeuils.PUNCH_MAX_THEORIQUE);
      if (trop.length) {
        return res.status(400).json({ ok: false, error: trop.length + ' seuil(s) au-dessus du plafond de ' + punchSeuils.PUNCH_MAX_THEORIQUE + ' Punch : ' + trop.map((d) => d.nom || d.type).join(', ') });
      }
      // ⚠️ Deux récompenses de même TYPE au même seuil sont indistinguables :
      // la clé de user_unlocks est (client_email, seuil, type). La seconde ne
      // serait jamais débloquée, sans le moindre message. On refuse.
      const dup = punchSeuils.collisions(lignes);
      if (dup.length) {
        return res.status(400).json({ ok: false, error: 'Deux récompenses partagent seuil et type — la seconde ne se débloquerait jamais : ' + dup.map((d) => d.seuil + ' (' + d.type + ' / ' + d.avec + ')').join(', ') });
      }
      const now = new Date().toISOString();
      const ins = getDb().prepare('INSERT INTO nutrition_deblocages (seuil, type, nom, rang, ref, bonus_accessoire, maj_at) VALUES (?,?,?,?,?,?,?)');
      getDb().transaction(() => {
        getDb().prepare('DELETE FROM nutrition_deblocages').run();
        lignes.forEach((d) => ins.run(d.seuil, d.type, d.nom, d.rang, d.ref, d.bonus_accessoire, now));
      })();
      chargerDeblocages(); // le moteur travaille sur la nouvelle table dès maintenant
      res.json({ ok: true, lignes: punchSeuils.table().length });
    } catch (e) { console.error('admin deblocages PUT :', e); res.status(500).json({ ok: false, error: 'Enregistrement impossible.' }); }
  });
  // Retour à la table du dépôt : la sortie de secours quand une édition a mal
  // tourné et que plus personne ne sait quelle était la bonne valeur.
  app.post('/nutrition/api/admin/deblocages/reset', requireAuth, requireAdmin, (req, res) => {
    try {
      const ref = punchSeuils.tableReference();
      const now = new Date().toISOString();
      const ins = getDb().prepare('INSERT INTO nutrition_deblocages (seuil, type, nom, rang, ref, bonus_accessoire, maj_at) VALUES (?,?,?,?,?,?,?)');
      getDb().transaction(() => {
        getDb().prepare('DELETE FROM nutrition_deblocages').run();
        ref.forEach((d) => ins.run(d.seuil, d.type, d.nom, d.rang, d.ref, d.bonus_accessoire, now));
      })();
      chargerDeblocages();
      res.json({ ok: true, lignes: punchSeuils.table().length });
    } catch (e) { console.error('admin deblocages reset :', e); res.status(500).json({ ok: false }); }
  });

  // --- CHEMIN DU CHALLENGE : état + validations auto-déclarées + flag admin. ---
  // État complet du parcours pour le client courant (nœuds, statut, stats de jeu).
  app.get('/nutrition/api/challenge/state', requireAuth, requireNutritionUse, (req, res) => {
    try {
      const email = (req.session && req.session.email) || '';
      if (!email) return res.status(403).json({ ok: false });
      res.json({ ok: true, state: challengePublicState(email) });
    } catch (e) { console.error('challenge state :', e); res.status(500).json({ ok: false }); }
  });
  // SÉRIE 🔥 : le client a renseigné au moins 2 repas de SA journée -> le jour est
  // gagné. Le serveur reste juge du JOUR (pas d'antidatage), de l'idempotence (un
  // seul gain par jour) et détient la série. Le décompte des repas
  // vient du client (les statuts vivent dans son blob), on le journalise tel quel.
  app.post('/nutrition/api/challenge/jour-gagne', requireAuth, requireNutritionUse, (req, res) => {
    try {
      const email = (req.session && req.session.email) || '';
      if (!email) return res.status(403).json({ ok: false });
      const repas = Math.max(0, Math.min(20, Math.round(Number((req.body || {}).repas) || 0)));
      if (repas < 2) return res.status(400).json({ ok: false, error: 'Il faut au moins 2 repas renseignés.' });
      const r = recordDayWin(email, repas);
      // `palier` : le front célèbre AU MOMENT où il tombe (null la plupart du temps).
      res.json({ ok: true, gagne: r.gagne, nouveau: r.nouveau, palier: r.palier || null, state: challengePublicState(email) });
    } catch (e) { console.error('challenge jour-gagne :', e); res.status(500).json({ ok: false }); }
  });

  // Nœud « Aventure » : SEUL type auto-déclaré (pas de preuve d'événement possible).
  app.post('/nutrition/api/challenge/aventure', requireAuth, requireNutritionUse, (req, res) => {
    try {
      const email = (req.session && req.session.email) || '';
      if (!email) return res.status(403).json({ ok: false });
      const reward = awardClientEvent(email, 'aventure', 'aventure');
      res.json({ ok: true, reward, state: challengePublicState(email) });
    } catch (e) { console.error('challenge aventure :', e); res.status(500).json({ ok: false }); }
  });
  // TEXTE du bilan hebdo. Les CHIFFRES sont calculés par l'app (front) et envoyés
  // ici ; l'IA ne fait que les habiller. Elle n'est qu'un bonus : sans clé, en
  // échec ou hors-ligne, on renvoie le texte MODÈLE — l'écran n'est jamais vide et
  // l'étape reste validable. Le texte est mis en cache par semaine : un bilan
  // rouvert ne rappelle jamais l'API (coût + réponse qui changerait sous les yeux).
  app.post('/nutrition/api/challenge/bilan-texte', requireAuth, requireNutritionUse, async (req, res) => {
    try {
      const email = (req.session && req.session.email) || '';
      if (!email) return res.status(403).json({ ok: false });
      const b = req.body || {};
      const week = Math.max(1, Math.min(6, Number(b.week) || 1));
      const final = !!b.final;
      const cache = getDb().prepare('SELECT texte, source FROM user_bilan_texte WHERE client_email=? AND week=?').get(email, week);
      if (cache && cache.texte) {
        try { return res.json({ ok: true, texte: JSON.parse(cache.texte), source: cache.source, cache: true }); } catch (_) { /* cache illisible -> on régénère */ }
      }
      const stats = b.stats || {};
      const highlights = bilanHebdo.highlightsSemaine(stats);
      let texte = null, source = 'modele';
      try {
        const p = bilanHebdo.promptBilan(stats, highlights, { final });
        const brut = await nutritionAiBilan().redigerBilanIA(p); // '' si IA indisponible
        const parse = bilanHebdo.parseReponseIa(brut);
        if (parse) { texte = parse; source = 'ia'; }
      } catch (e) { console.warn('bilan-texte IA :', e && e.message); } // l'IA tombe -> on continue
      if (!texte) texte = bilanHebdo.texteBilanTemplate(stats, highlights, { final });
      try {
        getDb().prepare("INSERT INTO user_bilan_texte (client_email, week, texte, source, created_at) VALUES (?,?,?,?,?) ON CONFLICT(client_email, week) DO UPDATE SET texte=excluded.texte, source=excluded.source")
          .run(email, week, JSON.stringify(texte), source, new Date().toISOString());
      } catch (e) { console.warn('bilan-texte cache :', e && e.message); }
      res.json({ ok: true, texte, highlights, source, cache: false });
    } catch (e) { console.error('bilan-texte :', e); res.status(500).json({ ok: false, error: 'Bilan indisponible.' }); }
  });
  // « Bilan consulté » : le client a cliqué « Terminer ma semaine » -> événement réel.
  app.post('/nutrition/api/challenge/bilan-seen', requireAuth, requireNutritionUse, (req, res) => {
    try {
      const email = (req.session && req.session.email) || '';
      if (!email) return res.status(403).json({ ok: false });
      const week = Math.max(1, Math.min(6, Number((req.body || {}).week) || 1));
      try { getDb().prepare("INSERT OR IGNORE INTO user_bilan_seen (client_email, week, seen_at) VALUES (?,?,?)").run(email, week, new Date().toISOString()); } catch (_) { /* ignore */ }
      const reward = awardClientEvent(email, 'bilan', 'week' + week);
      res.json({ ok: true, reward, state: challengePublicState(email) });
    } catch (e) { console.error('challenge bilan-seen :', e); res.status(500).json({ ok: false }); }
  });
  // MISSION BONUS (facultative — ne bloque jamais le parcours) : le client
  // DÉCLARE ce qu'il a fait (sur parole), le coach tranche depuis son espace ;
  // les Punch ne sont crédités qu'à la validation.
  app.post('/nutrition/api/challenge/mission-bonus', requireAuth, requireNutritionUse, (req, res) => {
    try {
      const email = (req.session && req.session.email) || '';
      if (!email) return res.status(403).json({ ok: false });
      const r = declarerMissionBonus(email, (req.body || {}).week, (req.body || {}).texte);
      if (r.error) return res.status(400).json({ ok: false, error: r.error });
      res.json({ ok: true, reward: { punch: r.punch, title: r.titre }, state: challengePublicState(email) });
    } catch (e) { console.error('mission bonus :', e); res.status(500).json({ ok: false }); }
  });
  // COACH : les déclarations de missions bonus (à trancher d'abord, puis l'historique).
  app.get('/nutrition/api/coach/missions-bonus', requireAuth, requireCoachOrAdmin, (req, res) => {
    try { res.json({ ok: true, missions: missionsBonusDeclarees() }); }
    catch (e) { console.error('missions bonus (coach) :', e); res.status(500).json({ ok: false }); }
  });
  app.post('/nutrition/api/coach/missions-bonus/:id/decision', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const action = String((req.body || {}).action || '');
      if (!['valider', 'refuser'].includes(action)) return res.status(400).json({ ok: false, error: 'Action invalide.' });
      const par = (req.session && (req.session.email || req.session.name)) || 'coach';
      const r = deciderMissionBonus(req.params.id, action, par);
      if (r.error) return res.status(400).json({ ok: false, error: r.error });
      res.json({ ok: true, statut: r.statut });
    } catch (e) { console.error('mission bonus décision :', e); res.status(500).json({ ok: false }); }
  });

  // ADMIN : lire l'état du Chemin. Sans ça, l'interrupteur du panneau admin ne
  // saurait pas s'il doit s'afficher allumé ou éteint — et il n'y avait AUCUN moyen
  // de connaître l'état sans lire la base à la main.
  app.get('/nutrition/api/challenge/flag', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      if (!req.session || req.session.role !== 'admin') return res.status(403).json({ ok: false, error: 'Admin requis.' });
      const r = getDb().prepare("SELECT value FROM app_settings WHERE key='challenge_path_enabled'").get();
      const v = String((r && r.value) || '').toLowerCase();
      res.json({ ok: true, enabled: ['on', '1', 'true', 'yes'].includes(v) });
    } catch (e) { console.error('challenge flag GET :', e); res.status(500).json({ ok: false }); }
  });
  // ADMIN : activer/désactiver le Chemin (feature flag global, activation par cohorte).
  app.post('/nutrition/api/challenge/flag', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      if (!req.session || req.session.role !== 'admin') return res.status(403).json({ ok: false, error: 'Admin requis.' });
      const on = ['on', '1', 'true', 'yes', true].includes((req.body || {}).enabled) ? 'on' : 'off';
      getDb().prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('challenge_path_enabled', ?, datetime('now','localtime')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").run(on);
      res.json({ ok: true, enabled: on === 'on' });
    } catch (e) { console.error('challenge flag :', e); res.status(500).json({ ok: false }); }
  });

  // COACH : taux d'ouverture des notifications par type (sur ses clients).
  app.get('/nutrition/api/coach/push-stats', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const sc = req.nutritionScope;
      const agg = "SELECT type, COUNT(*) sent, SUM(CASE WHEN opened_at!='' THEN 1 ELSE 0 END) opened FROM nutrition_push_log";
      let rows;
      if (sc.isAdmin) rows = getDb().prepare(agg + ' GROUP BY type').all();
      else { const em = clientEmailsForCoach(sc.coachId); rows = em.length ? getDb().prepare(agg + ' WHERE client_email IN (' + em.map(() => '?').join(',') + ') GROUP BY type').all(...em) : []; }
      const LABEL = { messages: 'Messages coach', recap: 'Récap hebdo', photos: 'Photos parcours', seances: 'Rappels séance' };
      const stats = rows.map((r) => ({ type: r.type, label: LABEL[r.type] || r.type, sent: r.sent, opened: r.opened || 0, rate: r.sent ? Math.round((r.opened || 0) / r.sent * 100) : 0 }));
      res.json({ ok: true, stats });
    } catch (e) { console.error('push-stats:', e); res.status(500).json({ ok: false }); }
  });
  // COACH : alertes (client n'a pas ajouté ses photos malgré relance).
  app.get('/nutrition/api/coach/push-alerts', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const sc = req.nutritionScope;
      const base = "SELECT id, client_email, type, message, created_at FROM nutrition_push_coach_alerts WHERE seen=0";
      let rows;
      if (sc.isAdmin) rows = getDb().prepare(base + ' ORDER BY id DESC LIMIT 100').all();
      else { const em = clientEmailsForCoach(sc.coachId); rows = em.length ? getDb().prepare(base + ' AND client_email IN (' + em.map(() => '?').join(',') + ') ORDER BY id DESC LIMIT 100').all(...em) : []; }
      res.json({ ok: true, alerts: rows });
    } catch (e) { res.status(500).json({ ok: false }); }
  });
  app.post('/nutrition/api/coach/push-alerts/:id/seen', requireAuth, requireCoachOrAdmin, (req, res) => {
    try { getDb().prepare('UPDATE nutrition_push_coach_alerts SET seen=1 WHERE id=?').run(Number(req.params.id)); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ ok: false }); }
  });

  // ============ EBOOKS / GUIDES (débloqués selon la progression du challenge) ============
  try {
    getDb().exec(`CREATE TABLE IF NOT EXISTS nutrition_ebooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      cover_data TEXT NOT NULL DEFAULT '',
      pdf_data TEXT NOT NULL DEFAULT '',
      pdf_mime TEXT NOT NULL DEFAULT 'application/pdf',
      unlock_day INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      type TEXT NOT NULL DEFAULT 'ebook',    -- 'ebook' (PDF) | 'video' (YouTube non répertorié)
      youtube_id TEXT NOT NULL DEFAULT '',   -- vidéo : l'ID extrait, jamais l'URL brute
      video_lot INTEGER NOT NULL DEFAULT 0,  -- vidéo : 1..5 -> le palier de Punch qui l'ouvre
      created_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS nutrition_ebook_reads (
      client_email TEXT NOT NULL,
      ebook_id INTEGER NOT NULL,
      opened_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (client_email, ebook_id)
    );`);
    // Migration : la table existe déjà en prod -> ALTER conditionnels.
    const cols = getDb().prepare('PRAGMA table_info(nutrition_ebooks)').all().map((c) => c.name);
    if (cols.length && !cols.includes('type')) {
      getDb().exec("ALTER TABLE nutrition_ebooks ADD COLUMN type TEXT NOT NULL DEFAULT 'ebook'");
      getDb().exec("ALTER TABLE nutrition_ebooks ADD COLUMN youtube_id TEXT NOT NULL DEFAULT ''");
      getDb().exec('ALTER TABLE nutrition_ebooks ADD COLUMN video_lot INTEGER NOT NULL DEFAULT 0');
    }
    seedVideosSeances();
  } catch (e) { console.error('ebooks schema:', e && e.message); }

  // Les 27 séances vidéo, versionnées : on ne les réimporte pas à chaque démarrage,
  // et on ne touche JAMAIS aux ebooks PDF existants (type = 'video' uniquement).
  // Drapeau : dès que l'admin gère les vidéos via le panneau, on cesse de semer
  // (sinon le seed ré-ajouterait les supprimées et écraserait les modifs).
  function videosGereesAdmin() {
    try { return ((getDb().prepare("SELECT value FROM app_settings WHERE key='videos_admin_managed'").get() || {}).value) === '1'; }
    catch (_) { return false; }
  }
  function marquerVideosGerees() {
    try { getDb().prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('videos_admin_managed','1',datetime('now','localtime')) ON CONFLICT(key) DO UPDATE SET value='1'").run(); }
    catch (_) { /* ignore */ }
  }
  function seedVideosSeances() {
    try {
      if (videosGereesAdmin()) return; // l'admin possède le catalogue -> ne plus semer
      const V = require('./nutrition-app/lib/videosSeances');
      // v2 : lots RÉÉQUILIBRÉS par visage de miniature (jamais plus de 2 fois la
      // même personne par lot) + « Générique » corrigé en Quentin (c'est lui sur
      // ces gabarits). Les vidéos déjà en base sont MISES À JOUR (lot, coach,
      // ordre), jamais dupliquées ni supprimées.
      const VERSION = '2';
      const fait = (getDb().prepare("SELECT value FROM app_settings WHERE key='videos_seed_v'").get() || {}).value;
      const nb = getDb().prepare("SELECT COUNT(*) c FROM nutrition_ebooks WHERE type='video'").get().c;
      if (String(fait) === VERSION && nb === V.VIDEOS_SEED.length) return;
      const up = getDb().prepare(`INSERT INTO nutrition_ebooks (title, description, category, cover_data, pdf_data, type, youtube_id, video_lot, sort_order, active, created_at)
        VALUES (?,?,?,?,'','video',?,?,?,1,?)`);
      const maj = getDb().prepare("UPDATE nutrition_ebooks SET video_lot=?, description=?, sort_order=? WHERE type='video' AND youtube_id=?");
      const existe = getDb().prepare("SELECT 1 FROM nutrition_ebooks WHERE type='video' AND youtube_id=?");
      const now = new Date().toISOString();
      const tx = getDb().transaction(() => {
        V.VIDEOS_SEED.forEach((v, i) => {
          const id = V.extraireYoutubeId(v.url);
          if (!id) return; // lien illisible
          if (existe.get(id)) maj.run(v.lot, 'Séance avec ' + v.coach, 1000 + i, id);
          else up.run(v.titre, 'Séance avec ' + v.coach, 'Séances', V.miniatureYoutube(id), id, v.lot, 1000 + i, now);
        });
      });
      tx();
      getDb().prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('videos_seed_v', ?, datetime('now','localtime')) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(VERSION);
      viderCacheRangsVideos(); // le catalogue vient de bouger -> les rangs sont à refaire
      console.log('[VIDEOS] ' + getDb().prepare("SELECT COUNT(*) c FROM nutrition_ebooks WHERE type='video'").get().c + ' séances vidéo en base');
    } catch (e) { console.error('seedVideosSeances:', e && e.message); }
  }

  function ebookSecret() {
    const row = getDb().prepare("SELECT value FROM app_settings WHERE key='ebook_secret'").get();
    if (row && row.value) return row.value;
    const s = crypto.randomBytes(32).toString('hex');
    getDb().prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('ebook_secret', ?, datetime('now','localtime')) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(s);
    return s;
  }
  // Jour de challenge du client (depuis la pesée de départ, sinon startDate) ; 0 si pas démarré.
  function clientChallengeDay(email) {
    if (!email) return 0;
    const dep = getDb().prepare("SELECT date FROM nutrition_parcours_pesees WHERE client_email=? AND type='depart'").get(email);
    let sd = dep && dep.date;
    if (!sd) { try { const r = getDb().prepare('SELECT data FROM nutrition_clients WHERE email=?').get(email); const d = r && r.data ? JSON.parse(r.data) : {}; sd = d.startDate; } catch (_) { /* ignore */ } }
    if (!sd) return 0;
    const t = Date.parse(sd); if (isNaN(t)) return 0;
    return Math.max(0, Math.floor((Date.now() - t) / 86400000));
  }
  // unlock_day = seuil de jour de challenge (0 = jour 1 / dès le départ ... 41 = jour 42).
  function ebookUnlockLabel(day) { return day <= 0 ? '' : 'Jour ' + (day + 1); }
  function ebookUnlockDay(v) { const n = Number(v); return (Number.isInteger(n) && n >= 0 && n <= 41) ? n : 0; }
  // Longueur du parcours, prise au moteur plutôt que codée en dur : c'est le
  // dénominateur qui ramène un jour de Chemin sur la même échelle qu'un palier de
  // Punch (cf. `ordre`). Un parcours qui s'allongerait un jour ne fausserait pas le tri.
  const JOURS_CHALLENGE = require('./nutrition-app/lib/challengePath').CHALLENGE_PATH_NODES.length - 1;
  function signEbookToken(ebookId, email) {
    const exp = Date.now() + 5 * 60000;
    const payload = ebookId + ':' + email + ':' + exp;
    const sig = crypto.createHmac('sha256', ebookSecret()).update(payload).digest('base64url');
    return Buffer.from(payload).toString('base64url') + '.' + sig;
  }
  function verifyEbookToken(token) {
    try {
      const [p, sig] = String(token || '').split('.');
      if (!p || !sig) return null;
      const payload = Buffer.from(p, 'base64url').toString();
      const expect = crypto.createHmac('sha256', ebookSecret()).update(payload).digest('base64url');
      if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
      const parts = payload.split(':'); const exp = Number(parts[2]);
      if (!(exp > Date.now())) return null;
      return { ebookId: Number(parts[0]), email: parts[1] };
    } catch (_) { return null; }
  }

  // CLIENT : liste des guides (verrouillés/déverrouillés selon la progression).
  app.get('/nutrition/api/ebooks', requireAuth, requireNutritionUse, (req, res) => {
    try {
      const email = (req.session && req.session.email) || '';
      const day = clientChallengeDay(email);
      const rows = getDb().prepare("SELECT id, title, description, category, cover_data, unlock_day, type, youtube_id, video_lot FROM nutrition_ebooks WHERE active=1 ORDER BY type ASC, unlock_day ASC, video_lot ASC, sort_order ASC, id ASC").all();
      const readSet = new Set();
      try { getDb().prepare('SELECT ebook_id FROM nutrition_ebook_reads WHERE client_email=?').all(email).forEach((r) => readSet.add(r.ebook_id)); } catch (_) { /* table absente */ }
      // Les VIDÉOS ne se débloquent pas au jour du challenge mais au PUNCH cumulé :
      // rien n'est offert au départ. Les ebooks PDF gardent leur déblocage par
      // progression, inchangé.
      // ⚠️ On lit la PROGRESSION (Punch réel OU étapes validées, cf.
      // punchProgression), pas la table des déblocages : celle-ci n'est écrite
      // qu'au moment d'un gain (evaluateUnlocks). La progression est la vérité ;
      // user_unlocks ne sert qu'à savoir ce qui a DÉJÀ été célébré.
      const punch = punchDeverrouille(email);
      // ⚠️ Le seuil d'une vidéo vient de SON RANG, plus de son lot : depuis le
      // passage aux seuils individuels, `VIDEO_LOTS[lot-1]` désignait la vidéo
      // n°lot et affichait donc un seuil faux dès le 2e lot.
      const seuilVideo = (id) => punchSeuils.seuilVideo(ebooksSources.rangVideo(id));
      const seuilGuide = (id) => punchSeuils.seuilGuide(ebooksSources.RANG_GUIDE.get(Number(id)));
      const ebooks = rows.map((r) => {
        const estVideo = r.type === 'video';
        const seuil = estVideo ? seuilVideo(r.id) : 0;
        // EBOOKS : 3 canaux (intro / Chemin / Punch), répartis par id. Un ebook
        // inconnu de la répartition retombe sur son unlock_day historique -> jamais
        // verrouillé à vie, même si l'admin en ajoute un demain.
        const src = estVideo ? null : ebooksSources.sourceEbook(r.id);
        // LE verrou vient de la règle centrale (ebooksSources.estVerrouille) : la
        // même que celle des routes de lecture — un guide affiché « débloqué » doit
        // TOUJOURS s'ouvrir au clic.
        const locked = ebooksSources.estVerrouille(r, { day, punch });
        let label, ordre;
        // `ordre` = OÙ, dans le parcours, ce guide tombe. 0 = au départ, 1 = à la toute
        // fin. C'est ce qui permet de trier « le plus récemment reçu d'abord » alors
        // que les canaux ne comptent PAS dans la même unité : le Chemin avance en
        // JOURS, les paliers en PUNCH. Ramenés à une même échelle (la part du parcours
        // franchie), ils redeviennent comparables — un ebook à 1600 Punch (0,67) et un
        // ebook du jour 30 (0,71) arrivent bien tous les deux vers les deux tiers.
        if (estVideo) { label = (seuil ? seuil + ' Punch' : 'À venir'); ordre = (seuil || 0) / punchSeuils.PUNCH_MAX_THEORIQUE; }
        else if (!src) { label = ebookUnlockLabel(r.unlock_day); ordre = r.unlock_day / JOURS_CHALLENGE; }
        else if (src.source === 'intro') { label = 'Offert'; ordre = 0; }
        else if (src.source === 'chemin') { label = ebookUnlockLabel(src.jour); ordre = src.jour / JOURS_CHALLENGE; }
        else {
          // ⚠️ `src.seuil` est le PALIER HISTORIQUE de EBOOK_PUNCH, qui ne sert
          // plus qu'à ordonner les guides. Le vrai seuil est celui de la table.
          const sg = seuilGuide(r.id) || src.seuil;
          label = sg + ' Punch'; ordre = sg / punchSeuils.PUNCH_MAX_THEORIQUE;
        }
        return {
          id: r.id, title: r.title, description: r.description, category: r.category,
          cover: r.cover_data || '', unlockDay: r.unlock_day, locked,
          unlockLabel: label,
          ordre, // part du parcours où le guide tombe -> tri « le plus récent d'abord »
          source: estVideo ? 'video' : ((src && src.source) || 'jour'),
          read: readSet.has(r.id),
          type: r.type || 'ebook',
          // L'ID n'est exposé que si la vidéo est débloquée : sinon le lien fuite
          // et le lot ne veut plus rien dire.
          videoId: estVideo && !locked ? r.youtube_id : '',
          videoLot: estVideo ? r.video_lot : 0,
        };
      });
      res.json({ ok: true, ebooks, day });
    } catch (e) { console.error('ebooks GET:', e); res.status(500).json({ ok: false }); }
  });
  // CLIENT : demande d'ouverture -> URL signée (5 min) si débloqué.
  app.post('/nutrition/api/ebooks/:id/open', requireAuth, requireNutritionUse, (req, res) => {
    try {
      const email = (req.session && req.session.email) || '';
      const id = Number(req.params.id);
      const eb = getDb().prepare('SELECT id, unlock_day, type, video_lot FROM nutrition_ebooks WHERE id=? AND active=1').get(id);
      if (!eb) return res.status(404).json({ ok: false });
      // La MÊME règle que la liste (canaux offert / Chemin / Punch) : un guide
      // débloqué au Punch se lit immédiatement, peu importe le jour du challenge.
      if (ebooksSources.estVerrouille(eb, { day: clientChallengeDay(email), punch: punchDeverrouille(email) })) return res.status(403).json({ ok: false, locked: true });
      // Marque le guide comme lu -> le badge « Nouveau » disparaît ensuite.
      try { getDb().prepare('INSERT OR IGNORE INTO nutrition_ebook_reads (client_email, ebook_id, opened_at) VALUES (?,?,?)').run(email, id, new Date().toISOString()); } catch (_) { /* ignore */ }
      recordEbookOpen(email, id);            // log quotidien + streak (Chemin du challenge)
      // ⚠️ Le retour d'awardClientEvent est RENVOYÉ (il était jeté) : sans lui le
      // client valide une étape, gagne son Punch et ne voit rien. `state` porte
      // les déblocages (guide, vidéo, cadeau…) que l'étape vient de faire tomber.
      const reward = awardClientEvent(email, 'ebook', id);
      res.json({ ok: true, url: '/nutrition/api/ebooks/' + id + '/file?k=' + encodeURIComponent(signEbookToken(id, email)), reward, state: challengePublicState(email) });
    } catch (e) { res.status(500).json({ ok: false }); }
  });
  // « Je l'ai vu » — sans AUCUN effet de bord.
  // ⚠️ Volontairement distinct de /open : celui-ci valide en plus une étape
  // « ebook » du Chemin et alimente la série. Regarder une séance vidéo ne doit
  // ni valider un guide, ni compter comme une lecture de guide — il ne reste
  // donc que la marque « vu », celle qui éteint la pastille « Nouveau ».
  app.post('/nutrition/api/ebooks/:id/vu', requireAuth, requireNutritionUse, (req, res) => {
    try {
      const email = (req.session && req.session.email) || '';
      const id = Number(req.params.id);
      const eb = getDb().prepare('SELECT id, unlock_day, type, video_lot FROM nutrition_ebooks WHERE id=? AND active=1').get(id);
      if (!eb) return res.status(404).json({ ok: false });
      // Même règle de verrouillage que la liste : on ne marque pas vu ce qui
      // n'est pas encore accessible.
      if (ebooksSources.estVerrouille(eb, { day: clientChallengeDay(email), punch: punchDeverrouille(email) })) return res.status(403).json({ ok: false, locked: true });
      try { getDb().prepare('INSERT OR IGNORE INTO nutrition_ebook_reads (client_email, ebook_id, opened_at) VALUES (?,?,?)').run(email, id, new Date().toISOString()); } catch (_) { /* ignore */ }
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ ok: false }); }
  });
  // Fichier PDF via URL signée (navigation directe -> visionneuse native ; jamais d'URL publique).
  app.get('/nutrition/api/ebooks/:id/file', (req, res) => {
    try {
      const id = Number(req.params.id);
      const v = verifyEbookToken(req.query.k);
      if (!v || v.ebookId !== id) return res.status(403).end();
      const eb = getDb().prepare('SELECT id, title, pdf_data, pdf_mime, unlock_day, type, video_lot FROM nutrition_ebooks WHERE id=? AND active=1').get(id);
      if (!eb || !eb.pdf_data) return res.status(404).end();
      // Même règle que la liste et l'ouverture (canaux offert / Chemin / Punch).
      if (ebooksSources.estVerrouille(eb, { day: clientChallengeDay(v.email), punch: punchDeverrouille(v.email) })) return res.status(403).end();
      const m = /^data:[^;]+;base64,(.+)$/.exec(eb.pdf_data);
      const buf = Buffer.from(m ? m[1] : eb.pdf_data, 'base64');
      res.setHeader('Content-Type', eb.pdf_mime || 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="guide-' + id + '.pdf"');
      res.send(buf);
    } catch (e) { console.error('ebook file:', e); res.status(500).end(); }
  });

  // ADMIN : gestion des guides.
  app.get('/nutrition/api/admin/ebooks', requireAuth, requireAdmin, (req, res) => {
    try {
      const rows = getDb().prepare("SELECT id, title, description, category, unlock_day, sort_order, active, length(pdf_data) pdflen, CASE WHEN cover_data!='' THEN 1 ELSE 0 END hascover FROM nutrition_ebooks ORDER BY unlock_day ASC, id ASC").all();
      res.json({ ok: true, ebooks: rows.map((r) => ({ id: r.id, title: r.title, description: r.description, category: r.category, unlockDay: r.unlock_day, sortOrder: r.sort_order, active: r.active, hasCover: !!r.hascover, sizeKo: Math.round((r.pdflen || 0) * 0.75 / 1024) })) });
    } catch (e) { res.status(500).json({ ok: false }); }
  });
  app.post('/nutrition/api/admin/ebooks', requireAuth, requireAdmin, (req, res) => {
    try {
      const b = req.body || {};
      const title = String(b.title || '').trim().slice(0, 160);
      if (!title) return res.status(400).json({ ok: false, error: 'Titre requis.' });
      const pdf = String(b.pdfData || '');
      if (!/^data:application\/pdf;base64,/.test(pdf)) return res.status(400).json({ ok: false, error: 'PDF requis.' });
      if (pdf.length > 14000000) return res.status(413).json({ ok: false, error: 'PDF trop lourd (max ~10 Mo).' });
      const cover = String(b.coverData || '');
      const cd = /^data:image\/(png|jpeg|webp);base64,/.test(cover) ? cover.slice(0, 400000) : '';
      const unlock = ebookUnlockDay(b.unlockDay);
      const maxOrder = getDb().prepare('SELECT COALESCE(MAX(sort_order),0) m FROM nutrition_ebooks').get().m;
      const info = getDb().prepare('INSERT INTO nutrition_ebooks (title, description, category, cover_data, pdf_data, pdf_mime, unlock_day, sort_order, active, created_at) VALUES (?,?,?,?,?,?,?,?,1,?)')
        .run(title, String(b.description || '').slice(0, 600), String(b.category || '').slice(0, 60), cd, pdf, 'application/pdf', unlock, maxOrder + 1, new Date().toISOString());
      res.json({ ok: true, id: info.lastInsertRowid });
    } catch (e) { console.error('ebook create:', e); res.status(500).json({ ok: false, error: 'Création impossible.' }); }
  });
  app.post('/nutrition/api/admin/ebooks/:id', requireAuth, requireAdmin, (req, res) => {
    try {
      const id = Number(req.params.id); const b = req.body || {};
      if (!getDb().prepare('SELECT id FROM nutrition_ebooks WHERE id=?').get(id)) return res.status(404).json({ ok: false });
      const sets = [], vals = [];
      if ('title' in b) { sets.push('title=?'); vals.push(String(b.title).slice(0, 160)); }
      if ('description' in b) { sets.push('description=?'); vals.push(String(b.description).slice(0, 600)); }
      if ('category' in b) { sets.push('category=?'); vals.push(String(b.category).slice(0, 60)); }
      if ('unlockDay' in b) { sets.push('unlock_day=?'); vals.push(ebookUnlockDay(b.unlockDay)); }
      if ('active' in b) { sets.push('active=?'); vals.push(b.active ? 1 : 0); }
      if ('sortOrder' in b) { sets.push('sort_order=?'); vals.push(Number(b.sortOrder) || 0); }
      if (b.pdfData && /^data:application\/pdf;base64,/.test(b.pdfData)) { if (b.pdfData.length > 14000000) return res.status(413).json({ ok: false, error: 'PDF trop lourd.' }); sets.push('pdf_data=?'); vals.push(b.pdfData); }
      if ('coverData' in b) { sets.push('cover_data=?'); vals.push(/^data:image\/(png|jpeg|webp);base64,/.test(b.coverData || '') ? String(b.coverData).slice(0, 400000) : ''); }
      if (!sets.length) return res.json({ ok: true });
      vals.push(id);
      getDb().prepare('UPDATE nutrition_ebooks SET ' + sets.join(', ') + ' WHERE id=?').run(...vals);
      res.json({ ok: true });
    } catch (e) { console.error('ebook update:', e); res.status(500).json({ ok: false }); }
  });
  app.delete('/nutrition/api/admin/ebooks/:id', requireAuth, requireAdmin, (req, res) => {
    try { getDb().prepare('DELETE FROM nutrition_ebooks WHERE id=?').run(Number(req.params.id)); viderCacheRangsVideos(); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ ok: false }); }
  });

  // ============ VIDÉOS (séances YouTube, débloquées par palier de Punch 1..5) ============
  const VIDEOS_LIB = require('./nutrition-app/lib/videosSeances');
  const clampLot = (v) => Math.max(1, Math.min(5, Number(v) || 1));
  app.get('/nutrition/api/admin/videos', requireAuth, requireAdmin, (req, res) => {
    try {
      const rows = getDb().prepare("SELECT id, title, description, category, youtube_id, video_lot, sort_order, active FROM nutrition_ebooks WHERE type='video' ORDER BY video_lot ASC, sort_order ASC, id ASC").all();
      res.json({ ok: true, videos: rows.map((r) => ({ id: r.id, title: r.title, description: r.description, category: r.category, youtubeId: r.youtube_id, lot: r.video_lot || 1, sortOrder: r.sort_order, active: r.active, thumb: VIDEOS_LIB.miniatureYoutube(r.youtube_id) })) });
    } catch (e) { res.status(500).json({ ok: false }); }
  });
  app.post('/nutrition/api/admin/videos', requireAuth, requireAdmin, (req, res) => {
    try {
      const b = req.body || {};
      const title = String(b.title || '').trim().slice(0, 160);
      if (!title) return res.status(400).json({ ok: false, error: 'Titre requis.' });
      const yid = VIDEOS_LIB.extraireYoutubeId(b.youtubeUrl || b.youtubeId || '');
      if (!yid) return res.status(400).json({ ok: false, error: 'URL YouTube invalide.' });
      const lot = clampLot(b.lot);
      const maxOrder = getDb().prepare("SELECT COALESCE(MAX(sort_order),0) m FROM nutrition_ebooks WHERE type='video'").get().m;
      const info = getDb().prepare("INSERT INTO nutrition_ebooks (title, description, category, cover_data, pdf_data, type, youtube_id, video_lot, unlock_day, sort_order, active, created_at) VALUES (?,?,?,?,'','video',?,?,0,?,1,?)")
        .run(title, String(b.description || '').slice(0, 600), String(b.category || 'Séances').slice(0, 60), VIDEOS_LIB.miniatureYoutube(yid), yid, lot, maxOrder + 1, new Date().toISOString());
      marquerVideosGerees(); viderCacheRangsVideos();
      res.json({ ok: true, id: info.lastInsertRowid });
    } catch (e) { console.error('video create:', e); res.status(500).json({ ok: false, error: 'Création impossible.' }); }
  });
  app.post('/nutrition/api/admin/videos/:id', requireAuth, requireAdmin, (req, res) => {
    try {
      const id = Number(req.params.id); const b = req.body || {};
      if (!getDb().prepare("SELECT id FROM nutrition_ebooks WHERE id=? AND type='video'").get(id)) return res.status(404).json({ ok: false });
      const sets = [], vals = [];
      if ('title' in b) { sets.push('title=?'); vals.push(String(b.title).slice(0, 160)); }
      if ('description' in b) { sets.push('description=?'); vals.push(String(b.description).slice(0, 600)); }
      if ('category' in b) { sets.push('category=?'); vals.push(String(b.category).slice(0, 60)); }
      if ('lot' in b) { sets.push('video_lot=?'); vals.push(clampLot(b.lot)); }
      if ('active' in b) { sets.push('active=?'); vals.push(b.active ? 1 : 0); }
      if ('sortOrder' in b) { sets.push('sort_order=?'); vals.push(Number(b.sortOrder) || 0); }
      if ('youtubeUrl' in b || 'youtubeId' in b) {
        const yid = VIDEOS_LIB.extraireYoutubeId(b.youtubeUrl || b.youtubeId || '');
        if (!yid) return res.status(400).json({ ok: false, error: 'URL YouTube invalide.' });
        sets.push('youtube_id=?'); vals.push(yid); sets.push('cover_data=?'); vals.push(VIDEOS_LIB.miniatureYoutube(yid));
      }
      if (!sets.length) return res.json({ ok: true });
      vals.push(id);
      getDb().prepare('UPDATE nutrition_ebooks SET ' + sets.join(', ') + " WHERE id=? AND type='video'").run(...vals);
      marquerVideosGerees(); viderCacheRangsVideos();
      res.json({ ok: true });
    } catch (e) { console.error('video update:', e); res.status(500).json({ ok: false }); }
  });
  app.delete('/nutrition/api/admin/videos/:id', requireAuth, requireAdmin, (req, res) => {
    try { getDb().prepare("DELETE FROM nutrition_ebooks WHERE id=? AND type='video'").run(Number(req.params.id)); marquerVideosGerees(); viderCacheRangsVideos(); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ ok: false }); }
  });

  // ============ CADEAUX (boutique débloquée par le Punch cumulé) ============
  // Même règle que les vidéos et les ebooks : le verrou se lit sur le TOTAL de
  // Punch, jamais sur user_unlocks (qui ne dit que ce qui a été célébré). Cumul
  // pur : rien n'est débité, donc un cadeau atteint est un cadeau gardé.
  // ⚠️ LE Punch qui DÉVERROUILLE, dit à un seul endroit. Il avait divergé : la
  // liste et /open lisaient la progression (Punch réel OU étapes validées),
  // /file lisait le Punch RÉEL. Un guide affiché « débloqué », dont l'URL signée
  // était bien délivrée, renvoyait alors 403 au téléchargement -> PAGE BLANCHE.
  // Trois routes, trois occasions de se tromper : il n'y en a plus qu'une.
  function punchDeverrouille(email) {
    try { return Number(punchProgression(email)) || 0; } catch (_) { return 0; }
  }
  // Le Punch RÉELLEMENT gagné : ce qu'on AFFICHE au compteur. Ne sert jamais à
  // déverrouiller quoi que ce soit (cf. punchDeverrouille).
  function punchDuClient(email) {
    try { return (getDb().prepare('SELECT punch FROM user_game_stats WHERE client_email=?').get(email) || {}).punch || 0; }
    catch (_) { return 0; }
  }
  // CLIENT : la boutique. La lecture RATTRAPE ce qui est dû (bons, thème) : c'est ce
  // qui garantit qu'un compte déjà chargé en Punch — migré depuis XP+gems — voit ses
  // cadeaux sans attendre son prochain gain.
  app.get('/nutrition/api/gifts', requireAuth, requireNutritionUse, (req, res) => {
    try {
      const email = (req.session && req.session.email) || '';
      if (!email) return res.status(403).json({ ok: false });
      assurerCadeaux(email);
      const punch = punchDuClient(email);          // AFFICHÉ : le Punch réellement gagné
      const punchDeb = punchProgression(email);    // DÉVERROUILLE : réel OU étapes validées
      const bons = bonsDe(email);
      const cadeauxListe = cadeaux.catalogue().map((c) => {
        const locked = punchDeb < c.seuil;
        return {
          id: c.id, label: c.label, desc: c.desc, icon: c.icon, nature: c.nature, seuil: c.seuil,
          locked, restant: locked ? c.seuil - punchDeb : 0,
          // Le bon n'est jamais exposé tant que le cadeau est verrouillé : un code qui
          // fuite avant l'heure, c'est un cadeau retiré sans avoir été mérité.
          bon: (!locked && bons[c.id]) ? bons[c.id] : null,
        };
      });
      const prochain = cadeauxListe.find((c) => c.locked) || null;
      res.json({
        ok: true, punch, tier: cadeaux.themeTier(punchDeb),
        cadeaux: cadeauxListe,
        prochain: prochain ? { label: prochain.label, restant: prochain.restant, seuil: prochain.seuil } : null,
      });
    } catch (e) { console.error('gifts GET:', e); res.status(500).json({ ok: false }); }
  });
  // COACH : lire un bon présenté au studio, puis le retirer.
  // Pas de cloisonnement au portefeuille du coach ici, à la différence des autres
  // routes coach : au comptoir, c'est le CODE qui fait foi et le client est devant
  // le coach — un remplaçant doit pouvoir valider. On journalise qui a validé.
  function bonPourCoach(bon) {
    if (!bon) return null;
    const c = cadeaux.cadeau(bon.cadeau);
    // Le coach doit lire un PRÉNOM : c'est ce qu'il a devant lui au comptoir, et le
    // seul moyen de vérifier que le bon appartient bien à la personne qui le tend.
    // Repli sur l'email si le nom manque — jamais rien.
    let client = bon.client_email;
    try {
      const r = getDb().prepare('SELECT prenom, nom FROM nutrition_clients WHERE email=?').get(bon.client_email);
      const nom = [r && r.prenom, r && r.nom].filter(Boolean).join(' ').trim();
      if (nom) client = nom;
    } catch (_) { /* colonnes absentes -> l'email fait l'affaire */ }
    return {
      code: bon.code, client, email: bon.client_email,
      cadeau: (c && c.label) || bon.cadeau, icon: (c && c.icon) || '🎁',
      statut: bon.statut, date: bon.created_at, retireLe: bon.retire_at || '', retirePar: bon.retire_par || '',
    };
  }
  app.get('/nutrition/api/coach/gifts/:code', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const bon = bonParCode(req.params.code);
      if (!bon) return res.status(404).json({ ok: false, error: 'Code inconnu.' });
      res.json({ ok: true, bon: bonPourCoach(bon) });
    } catch (e) { res.status(500).json({ ok: false }); }
  });
  app.post('/nutrition/api/coach/gifts/:code/retirer', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const par = (req.session && (req.session.name || req.session.email)) || 'coach';
      const r = retirerBon(req.params.code, par);
      if (r.ok) return res.json({ ok: true, bon: bonPourCoach(r.bon) });
      if (r.erreur === 'deja') return res.status(409).json({ ok: false, error: 'Ce bon a déjà été retiré.', bon: bonPourCoach(r.bon) });
      if (r.erreur === 'inconnu') return res.status(404).json({ ok: false, error: 'Code inconnu.' });
      res.status(500).json({ ok: false, error: 'Validation impossible.' });
    } catch (e) { console.error('gift retirer:', e); res.status(500).json({ ok: false }); }
  });

  // Coach IA : on charge le module IA (même instance que celle utilisée par la route
  // /nutrition/api/coach montée plus bas) pour pouvoir piloter son activation depuis
  // l'app. Au boot, on applique le réglage admin persisté (app_settings).
  const nutritionAi = require('./nutrition-app/lib/aiGenerator');
  const applyCoachIaSetting = () => {
    try {
      const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get('nutrition_coach_ia');
      const v = row && row.value;
      nutritionAi.setCoachIaOverride(v === 'on' ? true : (v === 'off' ? false : null));
    } catch (_) { /* table absente au tout premier boot -> auto */ }
  };
  applyCoachIaSetting();

  // --- Demandes d'aide alimentaire ---
  // Soumission : tout utilisateur ayant accès au module (client inclus à terme).
  // ⚠️ requireNutritionUse (et non requireNutritionAccess) : cette route est faite
  // POUR les clients (SOS coach, « un mot pour ton coach », besoin d'aide de la
  // communauté). Elle était réservée au staff -> tout client recevait 403 et voyait
  // « Envoi impossible ». Même contrôle, plus le rôle client.
  app.post('/nutrition/api/help-request', requireAuth, requireNutritionUse, (req, res) => {
    try {
      const { clientName, difficultes, message } = req.body || {};
      const nom = String(clientName || req.session.name || 'Client').slice(0, 120);
      const diffs = Array.isArray(difficultes) ? difficultes.map(d => String(d).slice(0, 120)).slice(0, 20) : [];
      const msg = String(message || '').slice(0, 2000);
      if (!diffs.length && !msg.trim()) {
        return res.status(400).json({ ok: false, error: 'Indiquez au moins une difficulté ou un message.' });
      }
      const info = getDb().prepare(
        'INSERT INTO nutrition_help_requests (client_name, client_email, created_at, difficultes, message, statut) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(nom, (req.session && req.session.email) || '', new Date().toISOString(), JSON.stringify(diffs), msg, 'a_traiter');
      // Une demande d'aide EST un message du client à son coach (SOS, « un mot pour
      // ton coach », besoin d'aide de la communauté). Sans ça, ces envois ne
      // validaient pas les étapes « message coach » (6/20) : le client écrivait
      // vraiment à son coach et son étape restait bloquée.
      const email = (req.session && req.session.email) || '';
      const reward = awardClientEvent(email, 'coach', info.lastInsertRowid);
      // reward + state : même raison que /api/messages/coach — l'étape se valide à
      // l'ENVOI, encore faut-il que le front puisse l'afficher tout de suite.
      res.json({ ok: true, id: info.lastInsertRowid, reward, state: email ? challengePublicState(email) : null });
    } catch (e) {
      console.error('Erreur help-request POST :', e);
      res.status(500).json({ ok: false, error: 'Enregistrement impossible.' });
    }
  });

  // Vue coach : liste des demandes (admin uniquement pour l'instant).
  app.get('/nutrition/api/help-requests', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const sc = coachLegacyScope(req.nutritionScope, 'client_email');
      const rows = getDb().prepare('SELECT * FROM nutrition_help_requests' + sc.where + ' ORDER BY id DESC').all(...sc.params);
      const demandes = rows.map(r => ({
        id: r.id, clientName: r.client_name, createdAt: r.created_at,
        difficultes: (() => { try { return JSON.parse(r.difficultes); } catch (_) { return []; } })(),
        message: r.message, statut: r.statut,
      }));
      res.json({ ok: true, demandes });
    } catch (e) {
      console.error('Erreur help-requests GET :', e);
      res.status(500).json({ ok: false, error: 'Lecture impossible.' });
    }
  });

  // Changement de statut (admin = tous ; coach = uniquement les demandes de SES clients).
  app.patch('/nutrition/api/help-requests/:id', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const statut = String((req.body || {}).statut || '');
      if (!['a_traiter', 'en_cours', 'traite'].includes(statut)) {
        return res.status(400).json({ ok: false, error: 'Statut invalide.' });
      }
      const sc = req.nutritionScope;
      const id = Number(req.params.id);
      if (!sc.isAdmin) {
        const row = getDb().prepare('SELECT client_email FROM nutrition_help_requests WHERE id = ?').get(id);
        if (!row) return res.status(404).json({ ok: false, error: 'Demande introuvable.' });
        const owned = row.client_email && coachSeesClient(sc.coachId, row.client_email);
        if (!owned) return res.status(403).json({ ok: false, error: 'Demande non attribuée.' });
      }
      const info = getDb().prepare('UPDATE nutrition_help_requests SET statut = ? WHERE id = ?').run(statut, id);
      res.json({ ok: info.changes > 0 });
    } catch (e) {
      console.error('Erreur help-requests PATCH :', e);
      res.status(500).json({ ok: false, error: 'Mise à jour impossible.' });
    }
  });

  // --- Mur collectif de la communauté (challenge) ---
  // Derniers messages du groupe + taille du groupe (clients inscrits).
  // Réactions autorisées sur le mur (libellés non sensibles, encouragements).
  const COMMUNITY_REACTIONS = ['bravo', 'force', 'moi-aussi', 'bien-joue', 'courage', 'aide'];

  // Clé de groupe d'un client pour cloisonner la Communauté = ville + n° de challenge.
  // '' = client non rangé (canal « sans groupe »). Les messages coach sont diffusés à tous.
  function clientGroupKey(email) {
    if (!email) return '';
    try {
      const m = getDb().prepare('SELECT ville, challenge_no FROM nutrition_client_meta WHERE client_email = ?').get(email);
      if (!m) return '';
      const ville = String(m.ville || '').trim().toLowerCase();
      const no = Number(m.challenge_no || 0);
      if (!ville || !no) return ''; // groupe défini seulement si ville ET n° présents
      return ville + '#' + no;
    } catch (_) { return ''; }
  }
  // Photo d'un post : dataURL jpeg/png uniquement, et plafonnée. Le front compresse
  // déjà (compressImage -> jpeg), mais le serveur ne fait jamais confiance au client :
  // il reste seul juge du format et du poids. Renvoie { data } ou { error }.
  const PHOTO_POST_MAX_OCTETS = 3 * 1024 * 1024; // ~3 Mo décodés : large pour une photo compressée
  function verifierPhotoPost(brut) {
    if (brut == null || brut === '') return { data: '' }; // pas de photo : cas normal
    const s = String(brut);
    const m = /^data:image\/(jpeg|jpg|png);base64,([A-Za-z0-9+/=]+)$/.exec(s);
    if (!m) return { error: 'Format non accepté : envoie une photo JPG ou PNG.' };
    // 4 caractères base64 = 3 octets -> taille réelle sans décoder.
    const octets = Math.floor(m[2].length * 3 / 4);
    if (octets > PHOTO_POST_MAX_OCTETS) return { error: 'Photo trop lourde (3 Mo maximum).' };
    return { data: s };
  }
  // Groupe du visiteur pour une lecture de la Communauté : le groupe du client, ou null
  // pour coach/admin (voit tout). Le rôle coach/admin n'est jamais cloisonné.
  function viewerGroupForRead(req) {
    const s = req.session || {};
    const isStaff = ['admin', 'coach', 'coach-leader'].includes(s.role || '');
    if (isStaff || !s.email) return null;
    return clientGroupKey(s.email);
  }

  // Payload du mur collectif (messages + réactions agrégées + taille du groupe).
  // Factorisé pour être réutilisé par la vue CLIENT et la vue COACH.
  // Photo de profil (avatar) par email -> URL image publique (capability URL). Une seule
  // requête pour tout un lot d'auteurs ; sans photo -> pas d'entrée (le front affiche l'initiale).
  function avatarUrlsByEmail(db, emails) {
    const uniq = [...new Set((emails || []).filter(Boolean))];
    const map = {};
    if (!uniq.length) return map;
    try {
      const ph = uniq.map(() => '?').join(',');
      // Un avatar personnalisé compte autant qu'une photo : la condition retient
      // désormais l'un OU l'autre (sinon les avatars n'apparaîtraient pas dans le fil).
      db.prepare("SELECT email, avatar_key, avatar, avatar_config FROM nutrition_clients WHERE email IN (" + ph + ") AND avatar_key <> '' AND (avatar <> '' OR avatar_config <> '')").all(...uniq)
        .forEach((r) => {
          const cfg = lireAvatarConfig(r.avatar_config);
          // L'empreinte en suffixe rend l'URL auto-invalidante : elle change à
          // chaque modification de l'avatar, donc le cache ne sert jamais l'ancien.
          map[r.email] = '/nutrition/api/community/avatar/' + r.avatar_key
            + (cfg ? '?v=' + avatarLib.hashConfig(cfg).toString(36) : '');
        });
    } catch (_) { /* colonnes absentes -> pas d'avatars */ }
    return map;
  }
  // Lit la config stockée. Renvoie null si absente ou illisible -> on retombe
  // sur la photo, jamais d'avatar cassé affiché.
  function lireAvatarConfig(brut) {
    const s = String(brut || '').trim();
    if (!s) return null;
    try { return avatarLib.normaliserConfig(JSON.parse(s)); } catch (_) { return null; }
  }
  // Thème de chacun, pour le badge affiché à côté du nom dans le fil. Il se DÉDUIT
  // du Punch (jamais d'une colonne à tenir à jour) : le badge ne peut donc pas
  // mentir sur ce que la personne a réellement atteint. Doré > sombre.
  // Une seule requête pour tout le fil, comme les avatars : un SELECT par post
  // serait 50 requêtes à chaque rafraîchissement.
  function themeTiersByEmail(db, emails) {
    const uniq = [...new Set((emails || []).filter(Boolean))];
    const map = {};
    if (!uniq.length) return map;
    try {
      const ph = uniq.map(() => '?').join(',');
      db.prepare('SELECT client_email, punch FROM user_game_stats WHERE client_email IN (' + ph + ')').all(...uniq)
        .forEach((r) => { const t = cadeaux.themeTier(r.punch); if (t) map[r.client_email] = t; });
    } catch (_) { /* table absente -> aucun badge, le fil reste lisible */ }
    return map;
  }
  function communityWallPayload(meEmail, limit, viewerGroup) {
    const db = getDb();
    // viewerGroup null -> staff (voit tout) ; sinon on ne montre que le groupe du client
    // (group_key = son groupe) + les messages coach (diffusion à tous).
    const rows = (viewerGroup == null)
      ? db.prepare('SELECT id, email, author, message, kind, created_at FROM nutrition_community_messages ORDER BY id DESC LIMIT ?').all(limit)
      : db.prepare("SELECT id, email, author, message, kind, created_at FROM nutrition_community_messages WHERE (group_key = ? OR (kind = 'coach' AND group_key = '')) ORDER BY id DESC LIMIT ?").all(viewerGroup, limit);
    const reacByMsg = {};
    try {
      const ids = rows.map((r) => r.id);
      if (ids.length) {
        const ph = ids.map(() => '?').join(',');
        db.prepare('SELECT message_id, type, email FROM nutrition_community_reactions WHERE message_id IN (' + ph + ')').all(...ids)
          .forEach((x) => {
            const e = reacByMsg[x.message_id] || (reacByMsg[x.message_id] = { counts: {}, mine: null });
            e.counts[x.type] = (e.counts[x.type] || 0) + 1;
            if (meEmail && x.email === meEmail) e.mine = x.type;
          });
      }
    } catch (_) { /* table absente -> pas de réactions */ }
    const cmtByMsg = {}; // nombre de commentaires par message (item_id = 'p'+id)
    try {
      const ids = rows.map((r) => 'p' + r.id);
      if (ids.length) {
        const ph = ids.map(() => '?').join(',');
        db.prepare('SELECT item_id, COUNT(*) AS n FROM nutrition_community_comments WHERE item_id IN (' + ph + ') GROUP BY item_id').all(...ids)
          .forEach((x) => { cmtByMsg[x.item_id] = x.n; });
      }
    } catch (_) { /* table absente -> pas de commentaires */ }
    const avm = avatarUrlsByEmail(db, rows.map((r) => r.email));
    const messages = rows.map((r) => ({
      id: r.id, who: r.author || 'Client', when: r.created_at,
      text: r.message, kind: r.kind || 'message', mine: !!meEmail && r.email === meEmail,
      avatarUrl: avm[r.email] || '',
      reactions: (reacByMsg[r.id] && reacByMsg[r.id].counts) || {},
      myReaction: (reacByMsg[r.id] && reacByMsg[r.id].mine) || null,
      commentCount: cmtByMsg['p' + r.id] || 0,
    }));
    let members = 0;
    try {
      members = viewerGroup
        ? db.prepare("SELECT COUNT(*) AS n FROM nutrition_client_meta WHERE (LOWER(TRIM(ville)) || '#' || challenge_no) = ?").get(viewerGroup).n
        : db.prepare('SELECT COUNT(*) AS n FROM nutrition_clients').get().n;
    } catch (_) { /* ignore */ }
    return { messages, members };
  }

  app.get('/nutrition/api/community/messages', requireAuth, requireNutritionUse, (req, res) => {
    try {
      const me = (req.session && req.session.email) || '';
      const limit = Math.min(Math.max(Number(req.query.limit) || 40, 1), 100);
      res.json({ ok: true, ...communityWallPayload(me, limit, viewerGroupForRead(req)) });
    } catch (e) {
      console.error('Erreur community/messages GET :', e);
      res.status(500).json({ ok: false, error: 'Lecture impossible.' });
    }
  });

  // Mur collectif — accès COACH/ADMIN. Le coach passe requireCoachOrAdmin (il n'a
  // pas la permission nutrition qui gate requireNutritionUse). Lecture du mur +
  // publication d'un message « coach » (épinglé côté client), signé de son prénom.
  app.get('/nutrition/api/coach/community', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 40, 1), 100);
      // Mur d'UN groupe précis (ville + n°) si fourni ; sinon vue globale (tous les murs).
      const ville = String((req.query || {}).ville || '').trim().toLowerCase();
      const no = Math.round(Number((req.query || {}).challengeNo) || 0);
      const groupKey = (ville && no) ? (ville + '#' + no) : null;
      const coachKey = 'coach:' + (req.session.coach_id || req.session.name || 'staff'); // identité du coach pour « ma réaction »
      res.json({ ok: true, groupKey: groupKey || '', ...communityWallPayload(coachKey, limit, groupKey) });
    } catch (e) { console.error('coach community GET :', e); res.status(500).json({ ok: false, error: 'Lecture impossible.' }); }
  });
  app.post('/nutrition/api/coach/community', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const b = req.body || {};
      const author = String((req.session && req.session.name) || 'Coach').slice(0, 80);
      const msg = String(b.message || '').slice(0, 500).trim();
      if (!msg) return res.status(400).json({ ok: false, error: 'Message vide.' });
      // Ciblage : ville + n° de challenge -> canal du groupe ; sinon '' = diffusion à tous.
      const ville = String(b.ville || '').trim().toLowerCase();
      const no = Math.max(0, Math.round(Number(b.challengeNo) || 0));
      const groupKey = (ville && no) ? (ville + '#' + no) : '';
      const now = new Date().toISOString();
      const info = getDb().prepare('INSERT INTO nutrition_community_messages (email, author, message, kind, created_at, group_key) VALUES (?, ?, ?, ?, ?, ?)').run('', author, msg, 'coach', now, groupKey);
      res.json({ ok: true, message: { id: info.lastInsertRowid, who: author, when: now, text: msg, kind: 'coach', groupKey, mine: true, reactions: {}, myReaction: null } });
    } catch (e) { console.error('coach community POST :', e); res.status(500).json({ ok: false, error: 'Publication impossible.' }); }
  });
  // Coach/admin : réagir à un message du mur (toggle). Identité = clé coach (pas un email client).
  app.post('/nutrition/api/coach/community/:id/react', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const key = 'coach:' + (req.session.coach_id || req.session.name || 'staff');
      const id = Number(req.params.id);
      const type = String((req.body || {}).type || '');
      if (!Number.isInteger(id) || !COMMUNITY_REACTIONS.includes(type)) return res.status(400).json({ ok: false, error: 'Réaction invalide.' });
      const exists = getDb().prepare('SELECT type FROM nutrition_community_reactions WHERE message_id = ? AND email = ?').get(id, key);
      if (exists && exists.type === type) {
        getDb().prepare('DELETE FROM nutrition_community_reactions WHERE message_id = ? AND email = ?').run(id, key);
      } else {
        getDb().prepare("INSERT INTO nutrition_community_reactions (message_id, email, type, created_at) VALUES (?,?,?,?) ON CONFLICT(message_id, email) DO UPDATE SET type = excluded.type, created_at = excluded.created_at").run(id, key, type, new Date().toISOString());
      }
      const counts = {};
      getDb().prepare('SELECT type, COUNT(*) AS n FROM nutrition_community_reactions WHERE message_id = ? GROUP BY type').all(id).forEach((x) => { counts[x.type] = x.n; });
      const mine = getDb().prepare('SELECT type FROM nutrition_community_reactions WHERE message_id = ? AND email = ?').get(id, key);
      res.json({ ok: true, id, reactions: counts, myReaction: mine ? mine.type : null });
    } catch (e) { console.error('coach community react POST :', e); res.status(500).json({ ok: false, error: 'Réaction impossible.' }); }
  });
  // Coach/admin : lire les commentaires sous un message du mur (item_id = 'p'+id).
  app.get('/nutrition/api/coach/community/comments', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const item = String((req.query || {}).item || '');
      if (!/^[ep]\d+$/.test(item)) return res.status(400).json({ ok: false, error: 'Élément invalide.' });
      const rows = getDb().prepare('SELECT id, author, text, created_at FROM nutrition_community_comments WHERE item_id = ? ORDER BY id ASC LIMIT 200').all(item);
      res.json({ ok: true, item, comments: rows.map((r) => ({ id: r.id, who: r.author || 'Un membre', text: r.text, when: r.created_at })) });
    } catch (e) { console.error('coach community comments GET :', e); res.status(500).json({ ok: false, error: 'Lecture impossible.' }); }
  });
  // Coach/admin : répondre (commenter) sous un message du mur.
  app.post('/nutrition/api/coach/community/comments', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const b = req.body || {};
      const item = String(b.item || '');
      if (!/^[ep]\d+$/.test(item)) return res.status(400).json({ ok: false, error: 'Élément invalide.' });
      const author = String((req.session && req.session.name) || 'Coach').slice(0, 80);
      const text = String(b.text || '').slice(0, 500).trim();
      if (!text) return res.status(400).json({ ok: false, error: 'Commentaire vide.' });
      const now = new Date().toISOString();
      const info = getDb().prepare('INSERT INTO nutrition_community_comments (item_id, email, author, text, created_at) VALUES (?,?,?,?,?)').run(item, '', author, text, now);
      res.json({ ok: true, comment: { id: info.lastInsertRowid, who: author, text, when: now } });
    } catch (e) { console.error('coach community comments POST :', e); res.status(500).json({ ok: false, error: 'Publication impossible.' }); }
  });

  // Publier un message sur le mur collectif (client / coach / démo connecté).
  // kind='coach' réservé aux coachs/admin (message du coach épinglé visuellement).
  app.post('/nutrition/api/community/messages', requireAuth, requireNutritionUse, (req, res) => {
    try {
      const role = (req.session && req.session.role) || '';
      const isCoach = ['admin', 'coach', 'coach-leader'].includes(role);
      const author = isCoach ? 'Coach' : String((req.session && req.session.name) || 'Client').slice(0, 80);
      const email = (req.session && req.session.email) || '';
      let kind = String((req.body || {}).kind || 'message');
      if (kind === 'coach' && !isCoach) kind = 'message';
      if (!['message', 'partage', 'coach'].includes(kind)) kind = 'message';
      const msg = String((req.body || {}).message || '').slice(0, 500).trim();
      // Photo jointe (facultative) : un post peut être texte seul, photo seule, ou les deux.
      const photo = verifierPhotoPost((req.body || {}).photo);
      if (photo.error) return res.status(400).json({ ok: false, error: photo.error });
      if (!msg && !photo.data) return res.status(400).json({ ok: false, error: 'Écris un message ou ajoute une photo.' });
      const now = new Date().toISOString();
      // Un post client est cloisonné à SON groupe ; un message coach est diffusé à tous ('').
      const groupKey = (kind === 'coach') ? '' : clientGroupKey(email);
      const info = getDb().prepare(
        'INSERT INTO nutrition_community_messages (email, author, message, kind, created_at, group_key, photo) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(email, author, msg, kind, now, groupKey, photo.data);
      // Seuls les posts CLIENT valident un nœud. Un post AVEC photo peut valider une
      // étape « photo au groupe » (13) ; sinon c'est un post comme un autre (27, 34).
      // On tente la photo d'abord et on s'arrête au premier succès : un seul post ne
      // doit jamais valider deux étapes d'affilée.
      let reward = null;
      if (!isCoach) {
        reward = photo.data ? awardClientEvent(email, 'groupe_photo', info.lastInsertRowid) : null;
        if (!reward) reward = awardClientEvent(email, 'groupe', info.lastInsertRowid);
      }
      res.json({ ok: true, message: { id: info.lastInsertRowid, who: author, when: now, text: msg, kind, mine: true, reactions: {}, myReaction: null, photoId: photo.data ? info.lastInsertRowid : null },
        reward, state: (!isCoach && email) ? challengePublicState(email) : null });
    } catch (e) {
      console.error('Erreur community/messages POST :', e);
      res.status(500).json({ ok: false, error: 'Publication impossible.' });
    }
  });

  // Photo d'un post : servie aux membres du MÊME groupe (et au coach/admin). On ne
  // met pas l'image dans le fil JSON — 50 posts photo feraient une réponse énorme.
  app.get('/nutrition/api/community/photo/:id', requireAuth, requireNutritionUse, (req, res) => {
    try {
      const id = Number(req.params.id) || 0;
      const row = getDb().prepare('SELECT photo, kind, group_key FROM nutrition_community_messages WHERE id = ?').get(id);
      if (!row || !row.photo) return res.status(404).end();
      const vg = viewerGroupForRead(req); // null = coach/admin -> voit tout
      // Un client ne voit que les photos de son groupe (un post coach est diffusé à tous).
      if (vg != null && row.kind !== 'coach' && String(row.group_key || '') !== String(vg)) return res.status(403).end();
      const m = /^data:(image\/[^;]+);base64,(.+)$/.exec(row.photo);
      if (!m) return res.status(404).end();
      res.setHeader('Content-Type', m[1]);
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.end(Buffer.from(m[2], 'base64'));
    } catch (e) { console.error('community/photo GET :', e); res.status(500).end(); }
  });

  // Supprimer un post : son AUTEUR, ou le coach/admin (modération). Une photo postée
  // par erreur doit pouvoir disparaître — sinon elle resterait visible du groupe à vie.
  app.delete('/nutrition/api/community/messages/:id', requireAuth, requireNutritionUse, (req, res) => {
    try {
      const id = Number(req.params.id) || 0;
      const s = req.session || {};
      const isStaff = ['admin', 'coach', 'coach-leader'].includes(s.role || '');
      const email = String(s.email || '');
      const row = getDb().prepare('SELECT email FROM nutrition_community_messages WHERE id = ?').get(id);
      if (!row) return res.status(404).json({ ok: false, error: 'Post introuvable.' });
      if (!isStaff && String(row.email || '') !== email) return res.status(403).json({ ok: false, error: 'Tu ne peux supprimer que tes propres posts.' });
      getDb().prepare('DELETE FROM nutrition_community_messages WHERE id = ?').run(id);
      // Les réactions et commentaires orphelins partent avec le post.
      try { getDb().prepare('DELETE FROM nutrition_community_reactions WHERE message_id = ?').run(id); } catch (_) { /* ignore */ }
      try { getDb().prepare("DELETE FROM nutrition_community_comments WHERE item_id = ?").run('p' + id); } catch (_) { /* ignore */ }
      res.json({ ok: true });
    } catch (e) { console.error('community/messages DELETE :', e); res.status(500).json({ ok: false, error: 'Suppression impossible.' }); }
  });

  // Réagir à un message (toggle : re-cliquer la même réaction l'enlève).
  app.post('/nutrition/api/community/messages/:id/react', requireAuth, requireNutritionUse, (req, res) => {
    try {
      const email = (req.session && req.session.email) || '';
      if (!email) return res.status(403).json({ ok: false, error: 'Connexion requise.' });
      const id = Number(req.params.id);
      const type = String((req.body || {}).type || '');
      if (!Number.isInteger(id) || !COMMUNITY_REACTIONS.includes(type)) return res.status(400).json({ ok: false, error: 'Réaction invalide.' });
      const exists = getDb().prepare('SELECT type FROM nutrition_community_reactions WHERE message_id = ? AND email = ?').get(id, email);
      if (exists && exists.type === type) {
        getDb().prepare('DELETE FROM nutrition_community_reactions WHERE message_id = ? AND email = ?').run(id, email);
      } else {
        getDb().prepare("INSERT INTO nutrition_community_reactions (message_id, email, type, created_at) VALUES (?,?,?,?) ON CONFLICT(message_id, email) DO UPDATE SET type = excluded.type, created_at = excluded.created_at").run(id, email, type, new Date().toISOString());
      }
      const counts = {};
      getDb().prepare('SELECT type, COUNT(*) AS n FROM nutrition_community_reactions WHERE message_id = ? GROUP BY type').all(id).forEach((x) => { counts[x.type] = x.n; });
      const mine = getDb().prepare('SELECT type FROM nutrition_community_reactions WHERE message_id = ? AND email = ?').get(id, email);
      res.json({ ok: true, id, reactions: counts, myReaction: mine ? mine.type : null });
    } catch (e) {
      console.error('Erreur community react POST :', e);
      res.status(500).json({ ok: false, error: 'Réaction impossible.' });
    }
  });

  // Vue d'ensemble du groupe : statistiques RÉELLES (agrégées depuis nutrition_adherence
  // + partages) + messages coach auto-générés + posts système. Aucune donnée sensible
  // individuelle (poids, calories, santé) : uniquement de l'agrégé positif.
  app.get('/nutrition/api/community/overview', requireAuth, requireNutritionUse, (req, res) => {
    try {
      const db = getDb();
      const today = new Date().toISOString().slice(0, 10);
      const since = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
      const vgOv = viewerGroupForRead(req); // membres = ceux du groupe du client
      let members = 0;
      try {
        members = vgOv
          ? db.prepare("SELECT COUNT(*) AS n FROM nutrition_client_meta WHERE (LOWER(TRIM(ville)) || '#' || challenge_no) = ?").get(vgOv).n
          : db.prepare('SELECT COUNT(*) AS n FROM nutrition_clients').get().n;
      } catch (_) { /* ignore */ }

      // Repas validés/adaptés/sautés sur 7 jours (table d'adhérence existante).
      let sv = { v: 0, a: 0, o: 0, s: 0 };
      try {
        const r = db.prepare('SELECT COALESCE(SUM(suivi),0) v, COALESCE(SUM(adapte),0) a, COALESCE(SUM(autre),0) o, COALESCE(SUM(saute),0) s FROM nutrition_adherence WHERE date >= ?').get(since);
        if (r) sv = { v: r.v || 0, a: r.a || 0, o: r.o || 0, s: r.s || 0 };
      } catch (_) { /* table absente */ }
      const repasValides = sv.v;
      const repasTotal = sv.v + sv.a + sv.o + sv.s;
      const pctValides = repasTotal ? Math.round((repasValides / repasTotal) * 100) : 0;

      // Journées validées partagées cette semaine + membres actifs aujourd'hui.
      let journeesValidees = 0, actifsAujourdhui = 0;
      try { journeesValidees = db.prepare("SELECT COUNT(*) n FROM nutrition_community_messages WHERE kind = 'partage' AND created_at >= ?").get(since + 'T00:00:00.000Z').n; } catch (_) { /* ignore */ }
      try { actifsAujourdhui = db.prepare('SELECT COUNT(DISTINCT client_email) n FROM nutrition_adherence WHERE date = ? AND client_email != \'\'').get(today).n; } catch (_) { /* ignore */ }

      // Objectif collectif de la semaine = semaine pleine (3 repas x 7 j x membres).
      const objectifRepas = Math.max(members, 1) * 21;
      const restant = Math.max(0, objectifRepas - repasValides);
      const pctObjectif = Math.min(100, Math.round((repasValides / objectifRepas) * 100));

      let phrase;
      if (repasValides === 0) phrase = 'C’est parti pour la semaine — valide tes repas pour faire avancer le groupe ensemble !';
      else if (restant === 0) phrase = 'Objectif de la semaine atteint, bravo le groupe ! 🎉';
      else phrase = `Le groupe avance bien, encore ${restant} repas à valider pour l’objectif de la semaine.`;

      // Messages du coach auto-générés selon les données (non sensibles).
      const coachAuto = [];
      if (pctValides >= 80) coachAuto.push(`Bravo au groupe : ${pctValides}% des repas validés cette semaine. On garde le rythme ! 💪`);
      else if (pctValides > 0 && pctValides < 50) coachAuto.push(`Léger relâchement cette semaine (${pctValides}% de repas validés). On se remotive, un repas à la fois 🙌`);
      if (pctObjectif >= 80 && pctObjectif < 100) coachAuto.push(`Plus que ${restant} repas validés pour l’objectif collectif — on y est presque !`);
      coachAuto.push('Pensez à votre collation protéinée de l’après-midi : c’est elle qui coupe les fringales de 18 h.');

      // Posts système (mur) calculés, non persistés.
      const systemPosts = [];
      if (repasValides > 0) systemPosts.push(`Le groupe a validé ${repasValides} repas cette semaine. 💪`);
      if (journeesValidees > 0) systemPosts.push(`${journeesValidees} journée${journeesValidees > 1 ? 's' : ''} validée${journeesValidees > 1 ? 's' : ''} partagée${journeesValidees > 1 ? 's' : ''} cette semaine.`);
      if (actifsAujourdhui > 0) systemPosts.push(`${actifsAujourdhui} membre${actifsAujourdhui > 1 ? 's ont' : ' a'} avancé sur leur plan aujourd’hui.`);

      res.json({
        ok: true,
        groupe: 'Groupe Challenge 6 semaines',
        members,
        stats: { repasValides, repasTotal, pctValides, journeesValidees, actifsAujourdhui },
        objectif: { cible: objectifRepas, restant, pct: pctObjectif },
        phrase, coachAuto, systemPosts,
      });
    } catch (e) {
      console.error('Erreur community/overview :', e);
      res.status(500).json({ ok: false, error: 'Lecture impossible.' });
    }
  });

  // ====== Fil d'activité de la communauté : événements AUTO-générés (réels) ======
  // Détecte les réussites réelles des membres et publie des « moments » dans le fil :
  // bienvenues, séries de jours validés, séances de la semaine, jalons collectifs.
  // 100% calculé depuis les données existantes (adhérence, séances, inscriptions) ;
  // aucun événement fabriqué. Persisté (id stable) -> réactions possibles ; idempotent
  // via dedup_key (chaque palier ne se publie qu'une fois).
  const FEED_REACTIONS = ['love', 'fire', 'muscle', 'clap'];
  function isoWeekStart(d) {
    const dt = new Date(d); const day = (dt.getUTCDay() + 6) % 7; // lundi = 0
    dt.setUTCDate(dt.getUTCDate() - day); return dt.toISOString().slice(0, 10);
  }
  function prenomDe(c) { return ((c && (c.prenom || c.nom)) || 'Un membre').toString().trim().split(' ')[0] || 'Un membre'; }
  function insertEvent(db, ev) {
    try {
      db.prepare('INSERT OR IGNORE INTO nutrition_community_events (type, actor_email, actor_name, emoji, text, dedup_key, created_at) VALUES (?,?,?,?,?,?,?)')
        .run(ev.type, ev.email || '', ev.name || '', ev.emoji || '', ev.text, ev.dedup, ev.when || new Date().toISOString());
    } catch (_) { /* doublon -> ignoré */ }
  }
  function genererEvenementsCommunaute(db) {
    const now = new Date();
    const weekStart = isoWeekStart(now);
    const todayStr = now.toISOString().slice(0, 10);
    let clients = [];
    try { clients = db.prepare('SELECT email, prenom, nom, created_at FROM nutrition_clients').all(); } catch (_) { return; }
    const byEmail = {}; clients.forEach((c) => { if (c.email) byEmail[c.email] = c; });
    // 1) Bienvenue (membres inscrits < 30 j) — une fois par membre.
    const since30 = new Date(now.getTime() - 30 * 864e5).toISOString();
    for (const c of clients) {
      if (!c.email || !c.created_at || c.created_at < since30) continue;
      insertEvent(db, { type: 'welcome', email: c.email, name: prenomDe(c), emoji: '👋', text: `Bienvenue à ${prenomDe(c)} dans le groupe`, dedup: 'welcome:' + c.email, when: c.created_at });
    }
    // 2) Séries de jours validés d'affilée (paliers).
    const STREAK_MILESTONES = [3, 5, 7, 10, 14, 21, 30];
    try {
      for (const c of clients) {
        if (!c.email) continue;
        const dates = db.prepare('SELECT date FROM nutrition_adherence WHERE client_email = ? AND suivi > 0 ORDER BY date DESC LIMIT 60').all(c.email).map((r) => r.date);
        if (!dates.length) continue;
        // streak récent uniquement (dernier jour = aujourd'hui ou hier).
        if (Date.parse(todayStr + 'T00:00:00Z') - Date.parse(dates[0] + 'T00:00:00Z') > 864e5) continue;
        let streak = 1;
        for (let i = 1; i < dates.length; i++) {
          if (Math.round((Date.parse(dates[i - 1] + 'T00:00:00Z') - Date.parse(dates[i] + 'T00:00:00Z')) / 864e5) === 1) streak++; else break;
        }
        const top = STREAK_MILESTONES.filter((m) => streak >= m).pop();
        if (top) insertEvent(db, { type: 'streak', email: c.email, name: prenomDe(c), emoji: '🔥', text: `${prenomDe(c)} a validé ${top} journées d'affilée`, dedup: 'streak:' + c.email + ':' + top });
      }
    } catch (_) { /* ignore */ }
    // 3) Séances de la semaine (paliers par nombre de séances).
    try {
      const rows = db.prepare('SELECT client_email, COUNT(*) n FROM nutrition_parcours_seances WHERE date >= ? AND client_email != \'\' GROUP BY client_email').all(weekStart);
      for (const r of rows) {
        const c = byEmail[r.client_email]; if (!c || r.n < 1) continue;
        const ord = r.n === 1 ? '1re' : (r.n + 'e');
        insertEvent(db, { type: 'session', email: r.client_email, name: prenomDe(c), emoji: '💪', text: `${prenomDe(c)} a terminé sa ${ord} séance de la semaine`, dedup: 'session:' + r.client_email + ':' + weekStart + ':' + r.n });
      }
    } catch (_) { /* ignore */ }
    // 4) Jalons collectifs : repas validés cette semaine.
    try {
      const sum = db.prepare('SELECT COALESCE(SUM(suivi),0) v FROM nutrition_adherence WHERE date >= ?').get(weekStart).v || 0;
      const top = [50, 100, 200, 300, 500].filter((m) => sum >= m).pop();
      if (top) insertEvent(db, { type: 'group_meals', email: '', name: 'Le groupe', emoji: '🔥', text: `Le groupe a dépassé ${top} repas validés cette semaine`, dedup: 'group_meals:' + weekStart + ':' + top });
    } catch (_) { /* ignore */ }
  }

  // Fil = événements auto + publications des membres (message/partage), triés par date.
  app.get('/nutrition/api/community/feed', requireAuth, requireNutritionUse, (req, res) => {
    try {
      const db = getDb();
      const me = (req.session && req.session.email) || '';
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
      try { genererEvenementsCommunaute(db); } catch (e) { console.warn('genEvents :', e && e.message); }
      const evs = db.prepare('SELECT id, type, actor_name, actor_email, emoji, text, created_at FROM nutrition_community_events ORDER BY created_at DESC, id DESC LIMIT ?').all(limit);
      const evReac = {}; const evIds = evs.map((e) => e.id);
      if (evIds.length) {
        const ph = evIds.map(() => '?').join(',');
        db.prepare('SELECT event_id, type, email FROM nutrition_community_event_reactions WHERE event_id IN (' + ph + ')').all(...evIds)
          .forEach((x) => { const e = evReac[x.event_id] || (evReac[x.event_id] = { counts: {}, mine: null }); e.counts[x.type] = (e.counts[x.type] || 0) + 1; if (me && x.email === me) e.mine = x.type; });
      }
      const vg = viewerGroupForRead(req); // cloisonnement : le client ne voit que son groupe (+ coach)
      const posts = (vg == null)
        ? db.prepare("SELECT id, author, message, kind, email, created_at, (photo != '') AS has_photo FROM nutrition_community_messages WHERE kind IN ('message','partage','coach') ORDER BY id DESC LIMIT ?").all(limit)
        : db.prepare("SELECT id, author, message, kind, email, created_at, (photo != '') AS has_photo FROM nutrition_community_messages WHERE kind IN ('message','partage','coach') AND (group_key = ? OR (kind = 'coach' AND group_key = '')) ORDER BY id DESC LIMIT ?").all(vg, limit);
      const postReac = {}; const postIds = posts.map((p) => p.id);
      if (postIds.length) {
        const ph = postIds.map(() => '?').join(',');
        db.prepare('SELECT message_id, type, email FROM nutrition_community_reactions WHERE message_id IN (' + ph + ')').all(...postIds)
          .forEach((x) => { const e = postReac[x.message_id] || (postReac[x.message_id] = { counts: {}, mine: null }); e.counts[x.type] = (e.counts[x.type] || 0) + 1; if (me && x.email === me) e.mine = x.type; });
      }
      const emails = [...evs.map((e) => e.actor_email), ...posts.map((p) => p.email)];
      const avm = avatarUrlsByEmail(db, emails);
      const tiers = themeTiersByEmail(db, emails); // badge de thème : visible de TOUT le groupe
      const items = [];
      for (const e of evs) items.push({ id: 'e' + e.id, kind: 'event', subkind: e.type, who: e.actor_name || 'Le groupe', avatarUrl: avm[e.actor_email] || '', tier: tiers[e.actor_email] || '', emoji: e.emoji || '', text: e.text, when: e.created_at, reactions: (evReac[e.id] && evReac[e.id].counts) || {}, myReaction: (evReac[e.id] && evReac[e.id].mine) || null, mine: false });
      for (const p of posts) items.push({ id: 'p' + p.id, kind: 'post', subkind: p.kind, who: p.author || 'Un membre', avatarUrl: avm[p.email] || '', tier: tiers[p.email] || '', emoji: p.kind === 'partage' ? '✅' : (p.kind === 'coach' ? '📣' : '💬'), text: p.message, when: p.created_at, reactions: (postReac[p.id] && postReac[p.id].counts) || {}, myReaction: (postReac[p.id] && postReac[p.id].mine) || null, mine: !!me && p.email === me, photoId: p.has_photo ? p.id : null });
      items.sort((a, b) => String(b.when || '').localeCompare(String(a.when || '')));
      const out = items.slice(0, limit);
      // Nombre de commentaires par élément (badge sur la carte).
      try {
        const ids = out.map((i) => i.id);
        if (ids.length) {
          const ph = ids.map(() => '?').join(',');
          const cc = {};
          db.prepare('SELECT item_id, COUNT(*) n FROM nutrition_community_comments WHERE item_id IN (' + ph + ') GROUP BY item_id').all(...ids).forEach((x) => { cc[x.item_id] = x.n; });
          out.forEach((i) => { i.comments = cc[i.id] || 0; });
        }
      } catch (_) { out.forEach((i) => { i.comments = 0; }); }
      res.json({ ok: true, items: out, reactions: FEED_REACTIONS });
    } catch (e) { console.error('community/feed :', e); res.status(500).json({ ok: false, error: 'Lecture impossible.' }); }
  });

  // Réagir à un élément du fil (événement « e123 » ou publication « p45 »), toggle.
  app.post('/nutrition/api/community/react', requireAuth, requireNutritionUse, (req, res) => {
    try {
      const db = getDb();
      const email = (req.session && req.session.email) || '';
      if (!email) return res.status(403).json({ ok: false, error: 'Connexion requise.' });
      const id = String((req.body || {}).id || '');
      const type = String((req.body || {}).type || '');
      if (!FEED_REACTIONS.includes(type)) return res.status(400).json({ ok: false, error: 'Réaction invalide.' });
      const m = id.match(/^([ep])(\d+)$/);
      if (!m) return res.status(400).json({ ok: false, error: 'Élément invalide.' });
      const num = Number(m[2]);
      const T = m[1] === 'e'
        ? { table: 'nutrition_community_event_reactions', col: 'event_id' }
        : { table: 'nutrition_community_reactions', col: 'message_id' };
      const ex = db.prepare('SELECT type FROM ' + T.table + ' WHERE ' + T.col + ' = ? AND email = ?').get(num, email);
      if (ex && ex.type === type) {
        db.prepare('DELETE FROM ' + T.table + ' WHERE ' + T.col + ' = ? AND email = ?').run(num, email);
      } else {
        db.prepare('INSERT INTO ' + T.table + ' (' + T.col + ', email, type, created_at) VALUES (?,?,?,?) ON CONFLICT(' + T.col + ', email) DO UPDATE SET type = excluded.type, created_at = excluded.created_at').run(num, email, type, new Date().toISOString());
      }
      const counts = {};
      db.prepare('SELECT type, COUNT(*) n FROM ' + T.table + ' WHERE ' + T.col + ' = ? GROUP BY type').all(num).forEach((x) => { counts[x.type] = x.n; });
      const mine = db.prepare('SELECT type FROM ' + T.table + ' WHERE ' + T.col + ' = ? AND email = ?').get(num, email);
      res.json({ ok: true, id, reactions: counts, myReaction: mine ? mine.type : null });
    } catch (e) { console.error('community/react :', e); res.status(500).json({ ok: false, error: 'Réaction impossible.' }); }
  });

  // Commentaires d'un élément du fil (événement ou publication). id = « e123 » / « p45 ».
  app.get('/nutrition/api/community/comments', requireAuth, requireNutritionUse, (req, res) => {
    try {
      const me = (req.session && req.session.email) || '';
      const item = String((req.query || {}).item || '');
      if (!/^[ep]\d+$/.test(item)) return res.status(400).json({ ok: false, error: 'Élément invalide.' });
      const rows = getDb().prepare('SELECT id, email, author, text, created_at FROM nutrition_community_comments WHERE item_id = ? ORDER BY id ASC LIMIT 200').all(item);
      const avm = avatarUrlsByEmail(getDb(), rows.map((r) => r.email));
      const comments = rows.map((r) => ({ id: r.id, who: r.author || 'Un membre', text: r.text, when: r.created_at, avatarUrl: avm[r.email] || '', mine: !!me && r.email === me }));
      res.json({ ok: true, item, comments });
    } catch (e) { console.error('community/comments GET :', e); res.status(500).json({ ok: false, error: 'Lecture impossible.' }); }
  });
  app.post('/nutrition/api/community/comments', requireAuth, requireNutritionUse, (req, res) => {
    try {
      const b = req.body || {};
      const email = (req.session && req.session.email) || '';
      if (!email) return res.status(403).json({ ok: false, error: 'Connexion requise.' });
      const item = String(b.item || '');
      if (!/^[ep]\d+$/.test(item)) return res.status(400).json({ ok: false, error: 'Élément invalide.' });
      const role = (req.session && req.session.role) || '';
      const isCoach = ['admin', 'coach', 'coach-leader'].includes(role);
      const author = isCoach ? 'Coach' : String((req.session && req.session.name) || 'Un membre').slice(0, 80);
      const text = String(b.text || '').slice(0, 500).trim();
      if (!text) return res.status(400).json({ ok: false, error: 'Commentaire vide.' });
      const now = new Date().toISOString();
      const info = getDb().prepare('INSERT INTO nutrition_community_comments (item_id, email, author, text, created_at) VALUES (?,?,?,?,?)').run(item, email, author, text, now);
      // Répondre à un membre EST un encouragement : ça valide l'étape 27, qui accepte
      // le post OU la réponse. Événement distinct de 'groupe' pour ne pas valider
      // « présente-toi au groupe » (0) ni « partage ta recette » (34) avec un commentaire.
      const reward = isCoach ? null : awardClientEvent(email, 'groupe_reponse', info.lastInsertRowid);
      res.json({ ok: true, comment: { id: info.lastInsertRowid, who: author, text, when: now, mine: true },
        reward, state: (!isCoach && email) ? challengePublicState(email) : null });
    } catch (e) { console.error('community/comments POST :', e); res.status(500).json({ ok: false, error: 'Publication impossible.' }); }
  });

  // ====== Options rapides boutique (alternatives pratiques sur les collations) ======
  // Catalogue des créneaux gérables + valeurs par défaut (fusionnées avec la base).
  const QUICK_OPTION_SLOTS = [
    { slot: 'matin', label: 'Collation du matin', nom: 'Raw Barre Bio', url: 'https://bilobanutrition.fr/search?q=raw+barre+bio' },
    { slot: 'apres-midi', label: 'Collation de l’après-midi', nom: 'Barre protéinée', url: 'https://bilobanutrition.fr/search?q=barre+proteinee' },
    { slot: 'apres-sport', label: 'Collation après le sport', nom: 'Protein Water', url: 'https://bilobanutrition.fr/search?q=protein+water' },
    { slot: 'soir', label: 'Collation du soir', nom: 'Raw Barre Bio', url: 'https://bilobanutrition.fr/search?q=raw+barre+bio' },
  ];
  function quickOptionsEffectif() {
    const rows = {};
    try { getDb().prepare('SELECT slot, nom, description, url, actif FROM nutrition_quick_options').all().forEach((r) => { rows[r.slot] = r; }); } catch (_) { /* table absente */ }
    return QUICK_OPTION_SLOTS.map((d) => {
      const r = rows[d.slot];
      return {
        slot: d.slot, label: d.label,
        nom: (r && r.nom) || d.nom,
        description: (r && r.description) || '',
        url: (r && r.url) || d.url,
        actif: r ? !!r.actif : true,
      };
    });
  }
  // Lecture : tout utilisateur du module (le client filtre les actives à l'affichage).
  app.get('/nutrition/api/quick-options', requireAuth, requireNutritionUse, (req, res) => {
    try { res.json({ ok: true, options: quickOptionsEffectif() }); }
    catch (e) { console.error('quick-options GET :', e); res.status(500).json({ ok: false, error: 'Lecture impossible.' }); }
  });
  // Gestion : super-admin uniquement (le coach ne gère pas en V1).
  app.post('/nutrition/api/quick-options/:slot', requireAuth, requireAdmin, (req, res) => {
    try {
      const slot = String(req.params.slot || '');
      if (!QUICK_OPTION_SLOTS.some((s) => s.slot === slot)) return res.status(404).json({ ok: false, error: 'Créneau inconnu.' });
      const b = req.body || {};
      const nom = String(b.nom || '').slice(0, 80).trim();
      const description = String(b.description || '').slice(0, 160).trim();
      let url = String(b.url || '').slice(0, 400).trim();
      if (url && !/^https?:\/\//i.test(url)) return res.status(400).json({ ok: false, error: 'Le lien doit commencer par http(s)://.' });
      const actif = b.actif ? 1 : 0;
      getDb().prepare("INSERT INTO nutrition_quick_options (slot, nom, description, url, actif, updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(slot) DO UPDATE SET nom = excluded.nom, description = excluded.description, url = excluded.url, actif = excluded.actif, updated_at = excluded.updated_at")
        .run(slot, nom, description, url, actif, new Date().toISOString());
      res.json({ ok: true, options: quickOptionsEffectif() });
    } catch (e) { console.error('quick-options POST :', e); res.status(500).json({ ok: false, error: 'Enregistrement impossible.' }); }
  });

  // ====== Challenge 6 semaines : « Mon Parcours » ======
  const PARCOURS_JALONS = ['depart', 's3', 's6'];
  const PARCOURS_PHOTO_TYPES = ['face', 'profil', 'dos', 'libre'];
  const JOUR_MS = 864e5;

  function profilDeClient(email) {
    try {
      const row = getDb().prepare('SELECT data FROM nutrition_clients WHERE email = ?').get(email);
      if (row && row.data) { const d = JSON.parse(row.data); return d.profil || {}; }
    } catch (_) { /* illisible */ }
    return {};
  }
  // Le client peut-il être vu/édité par le requêteur ? (lui-même, son coach, ou admin)
  function accesParcours(req, email) {
    const s = req.session || {};
    if (s.role === 'admin') return { ok: true, role: 'admin', id: 0 };
    if ((s.role === 'coach' || s.role === 'coach-leader') && s.coach_id) {
      if (coachSeesClient(s.coach_id, email)) return { ok: true, role: 'coach', id: s.coach_id };
      return { ok: false };
    }
    if (s.email && s.email === email) return { ok: true, role: 'client', id: 0 };
    return { ok: false };
  }
  // Construit l'objet parcours (données brutes ; les statuts/étapes/badges sont calculés au front).
  // Objectif de séances du challenge : 3 par semaine, sur 6 semaines.
  const SEANCES_PAR_SEMAINE = 3;
  function buildParcours(email) {
    const db = getDb();
    const profil = profilDeClient(email);
    const perte = Math.max(1, Number(profil.perte_objectif_kg) || 6);
    const peseesRows = db.prepare('SELECT type, poids, date, auteur_role, commentaire FROM nutrition_parcours_pesees WHERE client_email = ?').all(email);
    const pesees = {};
    peseesRows.forEach((r) => { pesees[r.type] = { poids: r.poids, date: r.date, auteur: r.auteur_role, commentaire: r.commentaire || '' }; });
    const depart = pesees.depart || null;
    const poidsDepart = depart ? depart.poids : (Number(profil.poids || profil.poids_kg) || null);
    const poidsObjectif = (poidsDepart != null) ? Math.round((poidsDepart - perte) * 10) / 10 : null;
    const startDate = depart ? depart.date : '';
    const dStart = startDate ? Date.parse(startDate) : null;
    const jalons = {
      depart: { date: startDate || '' },
      s3: { date: dStart ? new Date(dStart + 21 * JOUR_MS).toISOString().slice(0, 10) : '' },
      s6: { date: dStart ? new Date(dStart + 42 * JOUR_MS).toISOString().slice(0, 10) : '' },
    };
    const today = Date.now();
    const jourActuel = dStart ? Math.min(42, Math.max(0, Math.floor((today - dStart) / JOUR_MS))) : 0;
    const finDate = jalons.s6.date;

    const photos = db.prepare('SELECT id, jalon, type, auteur_role, created_at FROM nutrition_parcours_photos WHERE client_email = ? ORDER BY id').all(email)
      .map((p) => ({ id: p.id, jalon: p.jalon, type: p.type, auteur: p.auteur_role, createdAt: p.created_at }));
    const seances = db.prepare('SELECT date FROM nutrition_parcours_seances WHERE client_email = ? ORDER BY date').all(email).map((r) => r.date);
    let mensurations = [];
    try { mensurations = db.prepare('SELECT id, date, taille, hanches, poitrine, bras, cuisse FROM nutrition_parcours_mensurations WHERE client_email = ? ORDER BY date').all(email); } catch (_) { /* table absente */ }

    // Régularité : agrégée depuis nutrition_adherence depuis le départ (sinon 7 derniers jours).
    let reg = { journeesValidees: 0, repasValides: 0, repasTotal: 0, pct: 0 };
    try {
      const since = startDate || new Date(today - 6 * JOUR_MS).toISOString().slice(0, 10);
      const rows = db.prepare('SELECT suivi, adapte, autre, saute FROM nutrition_adherence WHERE client_email = ? AND date >= ?').all(email, since);
      let v = 0, tot = 0, jours = 0;
      rows.forEach((r) => { v += r.suivi; tot += r.suivi + r.adapte + r.autre + r.saute; if (r.suivi > 0) jours += 1; });
      reg = { journeesValidees: jours, repasValides: v, repasTotal: tot, pct: tot ? Math.round((v / tot) * 100) : 0 };
    } catch (_) { /* table absente */ }

    // Célébration : à afficher UNE fois côté client si la dernière pesée officielle
    // (S3 puis S6) montre une PERTE vs la précédente. Jamais en cas de stagnation/hausse
    // (le coach gère ça en bilan). Flag "vu" en base -> ne réapparaît plus.
    let celebration = null;
    try {
      const seen = new Set(db.prepare('SELECT jalon FROM nutrition_parcours_celebrations_seen WHERE client_email = ?').all(email).map((r) => r.jalon));
      const candidats = [];
      if (pesees.s6 && pesees.s6.poids > 0) candidats.push({ jalon: 's6', prev: (pesees.s3 && pesees.s3.poids > 0) ? pesees.s3 : depart });
      if (pesees.s3 && pesees.s3.poids > 0) candidats.push({ jalon: 's3', prev: depart });
      for (const c of candidats) {
        if (seen.has(c.jalon) || !c.prev || !(c.prev.poids > 0)) continue;
        if (!(pesees[c.jalon].poids < c.prev.poids)) continue; // perte uniquement
        const kgPerdu = (poidsDepart != null) ? Math.round((poidsDepart - pesees[c.jalon].poids) * 10) / 10 : 0;
        if (!(kgPerdu > 0)) continue;
        celebration = {
          jalon: c.jalon,
          kgPerdu,
          objectifPerte: perte,
          objectifAtteint: c.jalon === 's6' && kgPerdu >= perte,
          pctObjectif: perte > 0 ? kgPerdu / perte : 0,
        };
        break; // la plus récente non vue
      }
    } catch (_) { /* table absente */ }

    return {
      objectifPerte: perte, poidsDepart, poidsObjectif, startDate, jourActuel, dureeJours: 42, finDate,
      pesees, jalons, photos, seances, mensurations, regularite: reg,
      // ⚠️ 3 séances par semaine sur les 6 semaines = 18. Le total est DÉRIVÉ de
      // l'hebdo et de la durée, jamais saisi à côté : deux nombres écrits à la
      // main finissent toujours par se contredire (c'était 4 et 24).
      seancesObjHebdo: SEANCES_PAR_SEMAINE, seancesObjTotal: SEANCES_PAR_SEMAINE * (42 / 7), celebration,
      // ⚠️ LA date de départ du CHALLENGE, qui n'est pas `startDate` (celle de la
      // pesée de départ) : elle vient d'abord de la COHORTE. Sans elle, un client
      // dont le groupe démarre lundi mais qui n'est pas encore pesé pourrait
      // valider des séances avant le jour J.
      departChallenge: (() => { try { return pathStartYmd(email) || ''; } catch (_) { return ''; } })(),
    };
  }

  // CLIENT : son propre parcours.
  app.get('/nutrition/api/parcours', requireAuth, requireNutritionUse, (req, res) => {
    try {
      const email = (req.session && req.session.email) || '';
      if (!email) return res.json({ ok: true, parcours: null, noAccount: true });
      res.json({ ok: true, parcours: buildParcours(email) });
    } catch (e) { console.error('parcours GET :', e); res.status(500).json({ ok: false, error: 'Lecture impossible.' }); }
  });
  // CLIENT : marque la célébration d'un jalon comme VUE (animation affichée une seule fois).
  app.post('/nutrition/api/parcours/celebration-seen', requireAuth, requireNutritionUse, (req, res) => {
    try {
      const email = (req.session && req.session.email) || '';
      const jalon = String((req.body || {}).jalon || '');
      if (!email || !['s3', 's6'].includes(jalon)) return res.status(400).json({ ok: false, error: 'Requête invalide.' });
      getDb().prepare('INSERT OR IGNORE INTO nutrition_parcours_celebrations_seen (client_email, jalon, created_at) VALUES (?,?,?)').run(email, jalon, new Date().toISOString());
      res.json({ ok: true });
    } catch (e) { console.error('celebration-seen :', e); res.status(500).json({ ok: false }); }
  });
  // CLIENT : enregistre ses mensurations (cm) pour une date (upsert par date).
  app.post('/nutrition/api/parcours/mensuration', requireAuth, requireNutritionUse, (req, res) => {
    try {
      const email = (req.session && req.session.email) || '';
      if (!email) return res.status(403).json({ ok: false, error: 'Accès refusé.' });
      const b = req.body || {};
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date || '')) ? b.date : new Date().toISOString().slice(0, 10);
      const num = (v) => { const n = Number(v); return (Number.isFinite(n) && n > 0 && n < 400) ? Math.round(n * 10) / 10 : null; };
      const m = { taille: num(b.taille), hanches: num(b.hanches), poitrine: num(b.poitrine), bras: num(b.bras), cuisse: num(b.cuisse) };
      if (Object.values(m).every((v) => v == null)) return res.status(400).json({ ok: false, error: 'Renseigne au moins une mesure.' });
      getDb().prepare('INSERT INTO nutrition_parcours_mensurations (client_email, date, taille, hanches, poitrine, bras, cuisse, created_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(client_email, date) DO UPDATE SET taille=excluded.taille, hanches=excluded.hanches, poitrine=excluded.poitrine, bras=excluded.bras, cuisse=excluded.cuisse')
        .run(email, date, m.taille, m.hanches, m.poitrine, m.bras, m.cuisse, new Date().toISOString());
      const reward = awardClientEvent(email, 'mensurations', date); // Chemin du challenge (inerte si flag OFF)
      // ⚠️ `pourMoi` : coach et admin peuvent saisir POUR un client. La récompense
      // appartient alors au client, pas à celui qui tape — sinon le coach voit
      // l'animation de quelqu'un d'autre, et le client ne la voit jamais.
      const pourMoi = ((req.session && req.session.email) || '') === email;
      res.json({ ok: true, parcours: buildParcours(email), reward: pourMoi ? reward : null, state: pourMoi ? challengePublicState(email) : null });
    } catch (e) { console.error('mensuration POST :', e); res.status(500).json({ ok: false, error: 'Enregistrement impossible.' }); }
  });
  // CLIENT : supprime une de ses entrées de mensurations.
  app.delete('/nutrition/api/parcours/mensuration/:id', requireAuth, requireNutritionUse, (req, res) => {
    try {
      const email = (req.session && req.session.email) || '';
      const id = Number(req.params.id);
      const row = getDb().prepare('SELECT client_email FROM nutrition_parcours_mensurations WHERE id = ?').get(id);
      if (!row || row.client_email !== email) return res.status(403).json({ ok: false, error: 'Accès refusé.' });
      getDb().prepare('DELETE FROM nutrition_parcours_mensurations WHERE id = ?').run(id);
      res.json({ ok: true, parcours: buildParcours(email) });
    } catch (e) { console.error('mensuration DELETE :', e); res.status(500).json({ ok: false }); }
  });
  // COACH/ADMIN : parcours d'un client attribué.
  app.get('/nutrition/api/coach/parcours/:email', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const email = String(req.params.email || '');
      const acc = accesParcours(req, email);
      if (!acc.ok) return res.status(403).json({ ok: false, error: 'Client non attribué.' });
      res.json({ ok: true, parcours: buildParcours(email) });
    } catch (e) { console.error('coach parcours GET :', e); res.status(500).json({ ok: false, error: 'Lecture impossible.' }); }
  });

  // Enregistrer une pesée officielle (client pour lui-même ; coach/admin pour son client via ?email).
  app.post('/nutrition/api/parcours/pesee', requireAuth, (req, res) => {
    try {
      const b = req.body || {};
      const email = String(b.email || (req.session && req.session.email) || '');
      const acc = accesParcours(req, email);
      if (!acc.ok || !email) return res.status(403).json({ ok: false, error: 'Accès refusé.' });
      const type = String(b.type || '');
      if (!PARCOURS_JALONS.includes(type)) return res.status(400).json({ ok: false, error: 'Jalon invalide.' });
      const poids = Math.round((Number(b.poids) || 0) * 10) / 10;
      if (!(poids > 0 && poids < 400)) return res.status(400).json({ ok: false, error: 'Poids invalide.' });
      const commentaire = String(b.commentaire || '').slice(0, 400);
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date || '')) ? b.date : new Date().toISOString().slice(0, 10);
      getDb().prepare("INSERT INTO nutrition_parcours_pesees (client_email, type, poids, date, auteur_role, auteur_id, commentaire, updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(client_email, type) DO UPDATE SET poids = excluded.poids, date = excluded.date, auteur_role = excluded.auteur_role, auteur_id = excluded.auteur_id, commentaire = excluded.commentaire, updated_at = excluded.updated_at")
        .run(email, type, poids, date, acc.role, acc.id, commentaire, new Date().toISOString());
      const reward = awardClientEvent(email, 'pesee', type); // valide le nœud pesée du client (même si saisie par le coach)
      const pourMoi = ((req.session && req.session.email) || '') === email; // cf. mensurations
      res.json({ ok: true, parcours: buildParcours(email), reward: pourMoi ? reward : null, state: pourMoi ? challengePublicState(email) : null });
    } catch (e) { console.error('parcours pesee POST :', e); res.status(500).json({ ok: false, error: 'Enregistrement impossible.' }); }
  });

  // Valider une séance (client ou coach/admin).
  app.post('/nutrition/api/parcours/seance', requireAuth, (req, res) => {
    try {
      const b = req.body || {};
      const email = String(b.email || (req.session && req.session.email) || '');
      const acc = accesParcours(req, email);
      if (!acc.ok || !email) return res.status(403).json({ ok: false, error: 'Accès refusé.' });
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date || '')) ? b.date : new Date().toISOString().slice(0, 10);
      const type = String(b.type || '').slice(0, 40);
      // ⚠️ LE PROGRAMME EST DATÉ : séances le lundi, le mercredi et le vendredi.
      // Refusé côté SERVEUR et pas seulement grisé côté client — sinon la règle
      // n'existe que dans l'affichage, et le compteur finit par mentir.
      if (!challengeCal.estJourDeSeance(date)) {
        return res.status(400).json({ ok: false, error: 'Les séances du challenge ont lieu le lundi, le mercredi et le vendredi.' });
      }
      // … et pas avant le jour J. Avant le départ, le client prépare (photos,
      // mensurations, groupe, plan, courses) mais ne s'entraîne pas encore.
      const depart = pathStartYmd(email);
      if (depart && date < depart) {
        return res.status(400).json({ ok: false, error: 'Ton challenge démarre le ' + depart.split('-').reverse().join('/') + '. D\'ici là, prépare-toi : photos, mensurations, plan et liste de courses.' });
      }
      // Une seule séance par jour : si déjà validée -> on l'enlève (toggle).
      const exists = getDb().prepare('SELECT id FROM nutrition_parcours_seances WHERE client_email = ? AND date = ?').get(email, date);
      let reward = null;
      if (exists) getDb().prepare('DELETE FROM nutrition_parcours_seances WHERE client_email = ? AND date = ?').run(email, date);
      else {
        const info = getDb().prepare('INSERT INTO nutrition_parcours_seances (client_email, date, auteur_role, auteur_id, type, created_at) VALUES (?,?,?,?,?,?)').run(email, date, acc.role, acc.id, type, new Date().toISOString());
        reward = awardClientEvent(email, 'seance', info.lastInsertRowid); // valide UNIQUEMENT à l'ajout, jamais au retrait (toggle)
        // Aucune étape validée (le parcours est séquentiel : l'étape en cours
        // n'est pas toujours une séance) -> petit gain hors parcours, pour
        // qu'AUCUNE action ne reste sans récompense. Jamais les deux : une
        // action, une récompense.
        if (!reward) reward = awardSeanceBonus(email, date);
      }
      const pourMoi = ((req.session && req.session.email) || '') === email; // cf. mensurations
      res.json({ ok: true, parcours: buildParcours(email), reward: pourMoi ? reward : null, state: pourMoi ? challengePublicState(email) : null });
    } catch (e) { console.error('parcours seance POST :', e); res.status(500).json({ ok: false, error: 'Enregistrement impossible.' }); }
  });

  // Ajouter une photo d'évolution (PRIVÉE). Client pour lui ; coach/admin via ?email.
  app.post('/nutrition/api/parcours/photo', requireAuth, (req, res) => {
    try {
      const b = req.body || {};
      const email = String(b.email || (req.session && req.session.email) || '');
      const acc = accesParcours(req, email);
      if (!acc.ok || !email) return res.status(403).json({ ok: false, error: 'Accès refusé.' });
      const jalon = String(b.jalon || '');
      const type = String(b.type || '');
      if (!PARCOURS_JALONS.includes(jalon) || !PARCOURS_PHOTO_TYPES.includes(type)) return res.status(400).json({ ok: false, error: 'Jalon ou type invalide.' });
      const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(String(b.data || ''));
      if (!m) return res.status(400).json({ ok: false, error: 'Image invalide (jpg/png/webp).' });
      if (m[2].length > 4_000_000) return res.status(413).json({ ok: false, error: 'Image trop lourde (max ~3 Mo).' });
      const info = getDb().prepare('INSERT INTO nutrition_parcours_photos (client_email, jalon, type, data, mime, auteur_role, auteur_id, created_at) VALUES (?,?,?,?,?,?,?,?)')
        .run(email, jalon, type, b.data, m[1], acc.role, acc.id, new Date().toISOString());
      const reward = awardClientEvent(email, 'photo', info.lastInsertRowid); // Chemin du challenge (inerte si flag OFF)
      const pourMoi = ((req.session && req.session.email) || '') === email; // cf. mensurations
      res.json({ ok: true, id: info.lastInsertRowid, parcours: buildParcours(email), reward: pourMoi ? reward : null, state: pourMoi ? challengePublicState(email) : null });
    } catch (e) { console.error('parcours photo POST :', e); res.status(500).json({ ok: false, error: 'Enregistrement impossible.' }); }
  });

  // Servir une photo d'évolution — PRIVÉE : uniquement le client concerné, son coach, ou l'admin.
  app.get('/nutrition/api/parcours/photo/:id', requireAuth, (req, res) => {
    try {
      const row = getDb().prepare('SELECT client_email, data, mime FROM nutrition_parcours_photos WHERE id = ?').get(Number(req.params.id));
      // 404 si introuvable OU si pas le droit : on ne révèle jamais l'existence d'une photo
      // d'un autre client (pas d'oracle d'énumération par id).
      if (!row || !accesParcours(req, row.client_email).ok) return res.status(404).end();
      const m = /^data:[^;]+;base64,(.+)$/.exec(row.data || '');
      if (!m) return res.status(404).end();
      res.setHeader('Content-Type', row.mime || 'image/jpeg');
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.end(Buffer.from(m[1], 'base64'));
    } catch (e) { console.error('parcours photo GET :', e); res.status(500).end(); }
  });

  // Supprimer une photo (le client la sienne ; admin tout ; coach celles de ses clients).
  app.delete('/nutrition/api/parcours/photo/:id', requireAuth, (req, res) => {
    try {
      const row = getDb().prepare('SELECT client_email FROM nutrition_parcours_photos WHERE id = ?').get(Number(req.params.id));
      // 404 pour introuvable ET pour non-autorisé (pas d'oracle d'existence).
      if (!row || !accesParcours(req, row.client_email).ok) return res.status(404).json({ ok: false, error: 'Photo introuvable.' });
      getDb().prepare('DELETE FROM nutrition_parcours_photos WHERE id = ?').run(Number(req.params.id));
      res.json({ ok: true, parcours: buildParcours(row.client_email) });
    } catch (e) { console.error('parcours photo DELETE :', e); res.status(500).json({ ok: false, error: 'Suppression impossible.' }); }
  });

  // ====== Messagerie privée client <-> coach (jamais client <-> client) ======
  // Helpers : résout le coach attribué d'un client (par email).
  function coachOf(email) {
    if (!email) return null;
    const cli = getDb().prepare('SELECT coach_id FROM nutrition_clients WHERE email = ?').get(email);
    if (!cli || !cli.coach_id) return null;
    return getDb().prepare('SELECT id, name FROM coaches WHERE id = ? AND archived = 0').get(cli.coach_id) || null;
  }
  // ── Multi-coach : tous les coachs d'un client = référent (nutrition_clients.coach_id)
  // ∪ coachs supplémentaires (nutrition_client_coaches). Le fil de messagerie reste
  // UNIQUE (clé sur le référent) ; l'ACCÈS est élargi à tous ces coachs (fil partagé).
  function coachIdsForClient(email) {
    if (!email) return [];
    const ids = new Set();
    try {
      const cli = getDb().prepare('SELECT coach_id FROM nutrition_clients WHERE email = ?').get(email);
      if (cli && cli.coach_id) ids.add(cli.coach_id);
    } catch (_) { /* ignore */ }
    try {
      getDb().prepare('SELECT coach_id FROM nutrition_client_coaches WHERE client_email = ?').all(email).forEach((r) => ids.add(r.coach_id));
    } catch (_) { /* table absente */ }
    return [...ids];
  }
  function coachSeesClient(coachId, email) {
    return !!coachId && !!email && coachIdsForClient(email).includes(coachId);
  }
  // Emails des clients qu'un coach suit (référent OU coach supplémentaire).
  function clientEmailsForCoach(coachId) {
    const s = new Set();
    try { getDb().prepare('SELECT email FROM nutrition_clients WHERE coach_id = ?').all(coachId).forEach((r) => s.add(r.email)); } catch (_) { /* ignore */ }
    try { getDb().prepare('SELECT client_email FROM nutrition_client_coaches WHERE coach_id = ?').all(coachId).forEach((r) => s.add(r.client_email)); } catch (_) { /* ignore */ }
    return [...s].filter(Boolean);
  }
  // Fragment SQL "client_email IN (...)" scopé à un coach (ou pas de restriction pour l'admin).
  function coachEmailsInClause(sc, col) {
    if (sc.isAdmin) return { clause: '', params: [] };
    const emails = clientEmailsForCoach(sc.coachId);
    if (!emails.length) return { clause: ' AND 1=0', params: [] };
    return { clause: ' AND ' + col + ' IN (' + emails.map(() => '?').join(',') + ')', params: emails };
  }

  // CLIENT : sa conversation avec SON coach (le destinataire n'est jamais choisi par le client).
  app.get('/nutrition/api/messages/coach', requireAuth, requireNutritionUse, (req, res) => {
    try {
      const email = req.session && req.session.email;
      if (!email) return res.json({ ok: true, coach: null, conversationId: null, messages: [] });
      const coach = coachOf(email);
      if (!coach) return res.json({ ok: true, coach: null, conversationId: null, messages: [] });
      const conv = getDb().prepare('SELECT id FROM nutrition_conversations WHERE client_email = ? AND coach_id = ?').get(email, coach.id);
      let messages = [];
      if (conv) {
        messages = getDb().prepare('SELECT id, sender_role, sender_label, contenu, created_at FROM nutrition_messages WHERE conversation_id = ? ORDER BY id ASC LIMIT 300').all(conv.id)
          .map((m) => ({ id: m.id, role: m.sender_role, who: m.sender_label, text: m.contenu, when: m.created_at, mine: m.sender_role === 'client' }));
        getDb().prepare("UPDATE nutrition_messages SET lu = 1 WHERE conversation_id = ? AND sender_role != 'client' AND lu = 0").run(conv.id);
      }
      res.json({ ok: true, coach: { id: coach.id, name: coach.name }, conversationId: conv ? conv.id : null, messages });
    } catch (e) { console.error('messages/coach GET :', e); res.status(500).json({ ok: false, error: 'Lecture impossible.' }); }
  });

  // CLIENT : envoyer un message à SON coach (crée la conversation au besoin).
  app.post('/nutrition/api/messages/coach', requireAuth, requireNutritionUse, (req, res) => {
    try {
      const email = req.session && req.session.email;
      if (!email) return res.status(403).json({ ok: false, error: 'Compte client requis.' });
      const coach = coachOf(email);
      if (!coach) return res.status(409).json({ ok: false, error: 'no_coach' });
      const msg = String((req.body || {}).message || '').slice(0, 2000).trim();
      if (!msg) return res.status(400).json({ ok: false, error: 'Message vide.' });
      const now = new Date().toISOString();
      let conv = getDb().prepare('SELECT id FROM nutrition_conversations WHERE client_email = ? AND coach_id = ?').get(email, coach.id);
      if (!conv) {
        const info = getDb().prepare('INSERT INTO nutrition_conversations (client_email, coach_id, created_at, last_message_at, statut) VALUES (?,?,?,?,?)').run(email, coach.id, now, now, 'active');
        conv = { id: info.lastInsertRowid };
      }
      const label = String((req.session && req.session.name) || 'Client').slice(0, 80);
      const info = getDb().prepare('INSERT INTO nutrition_messages (conversation_id, sender_role, sender_label, contenu, created_at, lu) VALUES (?,?,?,?,?,0)').run(conv.id, 'client', label, msg, now);
      getDb().prepare('UPDATE nutrition_conversations SET last_message_at = ? WHERE id = ?').run(now, conv.id);
      // L'ENVOI suffit à valider l'étape « Message coach » (6/20) : ce que le coach
      // en fait ensuite (lire, répondre, rien) n'entre JAMAIS en compte.
      const reward = awardClientEvent(email, 'coach', info.lastInsertRowid);
      // ⚠️ On renvoie reward + state, comme toute route qui valide une étape : sans
      // eux le front n'a aucun moyen de savoir que l'étape vient de tomber, et le
      // client voit son étape rester grise après l'envoi — il croit qu'elle attend
      // son coach. La validation, elle, avait bien eu lieu en base.
      res.json({ ok: true, message: { id: info.lastInsertRowid, role: 'client', who: label, text: msg, when: now, mine: true }, reward, state: challengePublicState(email) });
    } catch (e) { console.error('messages/coach POST :', e); res.status(500).json({ ok: false, error: 'Envoi impossible.' }); }
  });

  // COACH/ADMIN : liste des conversations (scopée par coach_id ; admin = toutes).
  app.get('/nutrition/api/coach/conversations', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const sc = req.nutritionScope;
      const base = `SELECT c.id, c.client_email, c.coach_id, c.last_message_at,
        (SELECT contenu FROM nutrition_messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_text,
        (SELECT sender_role FROM nutrition_messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_role,
        (SELECT COUNT(*) FROM nutrition_messages m WHERE m.conversation_id = c.id) AS total,
        (SELECT COUNT(*) FROM nutrition_messages m WHERE m.conversation_id = c.id AND m.sender_role = 'client' AND m.lu = 0) AS unread
        FROM nutrition_conversations c`;
      let rows;
      if (sc.isAdmin) {
        rows = getDb().prepare(base + ' ORDER BY c.last_message_at DESC').all();
      } else {
        // Fil partagé : le coach voit les conversations de TOUS ses clients (référent + supplémentaires).
        const emails = clientEmailsForCoach(sc.coachId);
        rows = emails.length
          ? getDb().prepare(base + ' WHERE c.client_email IN (' + emails.map(() => '?').join(',') + ') ORDER BY c.last_message_at DESC').all(...emails)
          : [];
      }
      const coachMap = {};
      if (sc.isAdmin) { try { getDb().prepare('SELECT id, name FROM coaches WHERE archived = 0').all().forEach((c) => { coachMap[c.id] = c.name; }); } catch (_) { /* ignore */ } }
      const conversations = rows.map((r) => {
        const cli = getDb().prepare('SELECT prenom, nom FROM nutrition_clients WHERE email = ?').get(r.client_email);
        const clientName = cli ? ([cli.prenom, cli.nom].filter(Boolean).join(' ') || r.client_email) : r.client_email;
        // Super_admin : supervision = métadonnées seulement (participants, volume, activité),
        // JAMAIS le contenu. Le coach (propriétaire) voit l'aperçu de SA conversation.
        if (sc.isAdmin) {
          return { id: r.id, clientEmail: r.client_email, clientName, coachId: r.coach_id, coachName: (r.coach_id && coachMap[r.coach_id]) || null, lastRole: r.last_role || '', lastAt: r.last_message_at, total: r.total, redacted: true };
        }
        return { id: r.id, clientEmail: r.client_email, clientName, coachId: r.coach_id, lastText: r.last_text || '', lastRole: r.last_role || '', lastAt: r.last_message_at, total: r.total, unread: r.unread };
      });
      res.json({ ok: true, scope: sc.isAdmin ? 'admin' : 'coach', conversations });
    } catch (e) { console.error('coach/conversations GET :', e); res.status(500).json({ ok: false, error: 'Lecture impossible.' }); }
  });

  // COACH/ADMIN : messages d'une conversation (uniquement la sienne ; admin = support).
  app.get('/nutrition/api/coach/conversations/:id/messages', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const sc = req.nutritionScope;
      const conv = getDb().prepare('SELECT id, client_email, coach_id FROM nutrition_conversations WHERE id = ?').get(Number(req.params.id));
      if (!conv) return res.status(404).json({ ok: false, error: 'Conversation introuvable.' });
      if (!sc.isAdmin && !coachSeesClient(sc.coachId, conv.client_email)) return res.status(403).json({ ok: false, error: 'Hors de votre périmètre.' });
      // Super_admin : par défaut supervision = on voit la FORME de l'échange (qui, quand)
      // mais PAS le contenu. Le contenu n'est révélé qu'en mode support EXPLICITE
      // (?support=1), tracé dans le journal d'audit.
      const support = sc.isAdmin && String((req.query || {}).support || '') === '1';
      const redacted = sc.isAdmin && !support;
      const rawMsgs = getDb().prepare('SELECT id, sender_role, sender_label, contenu, created_at FROM nutrition_messages WHERE conversation_id = ? ORDER BY id ASC LIMIT 400').all(conv.id);
      const messages = rawMsgs.map((m) => ({
        id: m.id, role: m.sender_role, who: m.sender_label, when: m.created_at, mine: m.sender_role !== 'client',
        text: redacted ? '' : m.contenu, len: redacted ? (m.contenu ? m.contenu.length : 0) : undefined,
      }));
      if (!sc.isAdmin) getDb().prepare("UPDATE nutrition_messages SET lu = 1 WHERE conversation_id = ? AND sender_role = 'client' AND lu = 0").run(conv.id);
      if (support) {
        try { getDb().prepare('INSERT INTO nutrition_message_audit (admin_label, conversation_id, action, created_at) VALUES (?,?,?,?)').run(String((req.session && req.session.name) || 'Admin').slice(0, 80), conv.id, 'reveal', new Date().toISOString()); } catch (e) { console.warn('Audit messagerie non enregistré :', e && e.message); }
      }
      const cli = getDb().prepare('SELECT prenom, nom FROM nutrition_clients WHERE email = ?').get(conv.client_email);
      res.json({ ok: true, clientEmail: conv.client_email, clientName: cli ? ([cli.prenom, cli.nom].filter(Boolean).join(' ') || conv.client_email) : conv.client_email, messages, redacted, support: !!support });
    } catch (e) { console.error('coach conv messages GET :', e); res.status(500).json({ ok: false, error: 'Lecture impossible.' }); }
  });

  // COACH/ADMIN : répondre dans une conversation (uniquement la sienne ; admin = support).
  app.post('/nutrition/api/coach/conversations/:id/reply', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const sc = req.nutritionScope;
      const conv = getDb().prepare('SELECT id, client_email, coach_id FROM nutrition_conversations WHERE id = ?').get(Number(req.params.id));
      if (!conv) return res.status(404).json({ ok: false, error: 'Conversation introuvable.' });
      const coachIsAssigned = coachSeesClient(sc.coachId, conv.client_email);
      if (!sc.isAdmin && !coachIsAssigned) return res.status(403).json({ ok: false, error: 'Hors de votre périmètre.' });
      const msg = String((req.body || {}).message || '').slice(0, 2000).trim();
      if (!msg) return res.status(400).json({ ok: false, error: 'Message vide.' });
      const now = new Date().toISOString();
      const label = String((req.session && req.session.name) || 'Coach').slice(0, 80);
      // Un coach attribué (référent OU supplémentaire) répond en tant que 'coach' ;
      // l'admin non attribué qui intervient est tracé comme 'super_admin' (support).
      const role = (sc.isAdmin && !coachIsAssigned) ? 'super_admin' : 'coach';
      const info = getDb().prepare('INSERT INTO nutrition_messages (conversation_id, sender_role, sender_label, contenu, created_at, lu) VALUES (?,?,?,?,?,0)').run(conv.id, role, label, msg, now);
      getDb().prepare('UPDATE nutrition_conversations SET last_message_at = ? WHERE id = ?').run(now, conv.id);
      if (role === 'super_admin') {
        try { getDb().prepare('INSERT INTO nutrition_message_audit (admin_label, conversation_id, action, created_at) VALUES (?,?,?,?)').run(label, conv.id, 'reply', now); } catch (e) { console.warn('Audit messagerie non enregistré :', e && e.message); }
      }
      // Scénario A : notifie le client du message de son coach (immédiat + regroupement).
      try { push.notifyCoachMessage(conv.client_email, label, conv.id, msg); } catch (e) { console.warn('push coach msg :', e && e.message); }
      res.json({ ok: true, message: { id: info.lastInsertRowid, role, who: label, text: msg, when: now, mine: true } });
    } catch (e) { console.error('coach reply POST :', e); res.status(500).json({ ok: false, error: 'Envoi impossible.' }); }
  });

  // COACH/ADMIN : ouvrir (ou créer) la conversation avec un client attribué.
  app.post('/nutrition/api/coach/conversations', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const sc = req.nutritionScope;
      const email = String((req.body || {}).client_email || '').trim();
      if (!email) return res.status(400).json({ ok: false, error: 'Client manquant.' });
      const cli = getDb().prepare('SELECT coach_id FROM nutrition_clients WHERE email = ?').get(email);
      if (!cli) return res.status(404).json({ ok: false, error: 'Client introuvable.' });
      if (!sc.isAdmin && !coachSeesClient(sc.coachId, email)) return res.status(403).json({ ok: false, error: 'Hors de votre périmètre.' });
      // Fil PARTAGÉ : la conversation est toujours celle du référent du client (coach_id),
      // quel que soit le coach qui l'ouvre. Tous les coachs attribués y accèdent.
      const coachId = cli.coach_id;
      if (!coachId) return res.status(409).json({ ok: false, error: 'Ce client n’a pas de coach attribué.' });
      const now = new Date().toISOString();
      let conv = getDb().prepare('SELECT id FROM nutrition_conversations WHERE client_email = ? AND coach_id = ?').get(email, coachId);
      if (!conv) { const i = getDb().prepare('INSERT INTO nutrition_conversations (client_email, coach_id, created_at, last_message_at, statut) VALUES (?,?,?,?,?)').run(email, coachId, now, now, 'active'); conv = { id: i.lastInsertRowid }; }
      res.json({ ok: true, conversationId: conv.id });
    } catch (e) { console.error('coach conv create POST :', e); res.status(500).json({ ok: false, error: 'Impossible.' }); }
  });

  // SUPER_ADMIN : journal d'audit des accès au contenu des messageries (révélation
  // en mode support + réponses admin). Transparence sur l'usage du mode support.
  app.get('/nutrition/api/admin/message-audit', requireAuth, requireAdmin, (req, res) => {
    try {
      const rows = getDb().prepare(`SELECT a.id, a.admin_label, a.conversation_id, a.action, a.created_at,
        c.client_email, c.coach_id FROM nutrition_message_audit a
        LEFT JOIN nutrition_conversations c ON c.id = a.conversation_id
        ORDER BY a.id DESC LIMIT 200`).all();
      const entries = rows.map((r) => {
        const cli = r.client_email ? getDb().prepare('SELECT prenom, nom FROM nutrition_clients WHERE email = ?').get(r.client_email) : null;
        return { id: r.id, adminLabel: r.admin_label, action: r.action, when: r.created_at, conversationId: r.conversation_id,
          clientName: cli ? ([cli.prenom, cli.nom].filter(Boolean).join(' ') || r.client_email) : (r.client_email || '—') };
      });
      res.json({ ok: true, entries });
    } catch (e) { console.error('message-audit GET :', e); res.status(500).json({ ok: false, error: 'Lecture impossible.' }); }
  });

  // Compteur de notifications non-lues, selon le rôle : client = messages reçus de
  // SON coach ; coach = messages reçus de SES clients ; admin = supervision (0).
  app.get('/nutrition/api/notifications', requireAuth, (req, res) => {
    try {
      const s = req.session || {};
      let messages = 0;
      if (s.role === 'coach' || s.role === 'coach-leader') {
        if (s.coach_id) {
          // Fil partagé : messages non lus des clients suivis (référent OU supplémentaire).
          const emails = clientEmailsForCoach(s.coach_id);
          if (emails.length) {
            const r = getDb().prepare(`SELECT COUNT(*) AS n FROM nutrition_messages m
              JOIN nutrition_conversations c ON c.id = m.conversation_id
              WHERE c.client_email IN (${emails.map(() => '?').join(',')}) AND m.sender_role = 'client' AND m.lu = 0`).get(...emails);
            messages = (r && r.n) || 0;
          }
        }
      } else if (s.role !== 'admin' && s.email) {
        const r = getDb().prepare(`SELECT COUNT(*) AS n FROM nutrition_messages m
          JOIN nutrition_conversations c ON c.id = m.conversation_id
          WHERE c.client_email = ? AND m.sender_role != 'client' AND m.lu = 0`).get(s.email);
        messages = (r && r.n) || 0;
      }
      res.json({ ok: true, messages, total: messages });
    } catch (e) { console.error('notifications GET :', e); res.json({ ok: true, messages: 0, total: 0 }); }
  });

  // SUPER_ADMIN : état + pilotage de l'activation du Coach IA depuis l'app.
  // mode = 'on' (forcé actif) | 'off' (forcé inactif) | 'auto' (suit les variables d'env).
  // La CLÉ ANTHROPIC_API_KEY reste obligatoire et 100% serveur (jamais exposée).
  app.get('/nutrition/api/coach-ia-config', requireAuth, requireAdmin, (req, res) => {
    try { res.json({ ok: true, ...nutritionAi.coachIaInfos() }); }
    catch (e) { console.error('coach-ia-config GET :', e); res.status(500).json({ ok: false, error: 'Lecture impossible.' }); }
  });
  app.post('/nutrition/api/coach-ia-config', requireAuth, requireAdmin, (req, res) => {
    try {
      const mode = String((req.body || {}).mode || '').toLowerCase();
      if (!['on', 'off', 'auto'].includes(mode)) return res.status(400).json({ ok: false, error: 'Mode invalide.' });
      if (mode === 'auto') getDb().prepare('DELETE FROM app_settings WHERE key = ?').run('nutrition_coach_ia');
      else getDb().prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('nutrition_coach_ia', ?, datetime('now','localtime')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").run(mode);
      nutritionAi.setCoachIaOverride(mode === 'on' ? true : (mode === 'off' ? false : null));
      res.json({ ok: true, ...nutritionAi.coachIaInfos() });
    } catch (e) { console.error('coach-ia-config POST :', e); res.status(500).json({ ok: false, error: 'Enregistrement impossible.' }); }
  });

  // ====== Coach « réponses préenregistrées » (GRATUIT, aucun appel IA) ======
  // match/suggest = PUBLIC (texte générique, aucune donnée perso) -> marche aussi
  // en démo. Gestion du contenu = admin uniquement. Routes AVANT le portail
  // d'auth global (app.use('/nutrition/api', requireAuth...)).
  const coachFaq = require('./nutrition-app/lib/coachFaq');
  // Le client pose une question -> meilleure réponse préenregistrée (ou rien).
  app.post('/nutrition/api/coach-faq/match', (req, res) => {
    try {
      const question = String((req.body || {}).question || '');
      if (question.trim().length < 2) return res.json({ ok: true, match: null });
      const rows = getDb().prepare('SELECT id, question, reponse, mots_cles, actif FROM nutrition_coach_faq WHERE actif = 1').all();
      const m = coachFaq.matchFaq(question, rows);
      if (!m) return res.json({ ok: true, match: null });
      res.json({ ok: true, match: { id: m.row.id, question: m.row.question, reponse: m.row.reponse } });
    } catch (e) { console.error('coach-faq/match :', e); res.status(500).json({ ok: false, error: 'Recherche impossible.' }); }
  });
  // Suggestions affichées en « chips » (questions garanties d'avoir une réponse).
  app.get('/nutrition/api/coach-faq/suggest', (req, res) => {
    try {
      const rows = getDb().prepare('SELECT question FROM nutrition_coach_faq WHERE actif = 1 ORDER BY ordre ASC, id ASC LIMIT 6').all();
      res.json({ ok: true, questions: rows.map((r) => r.question) });
    } catch (e) { res.json({ ok: true, questions: [] }); }
  });
  // ADMIN : liste complète (gestion).
  app.get('/nutrition/api/coach-faq', requireAuth, requireAdmin, (req, res) => {
    try { res.json({ ok: true, items: getDb().prepare('SELECT id, question, reponse, mots_cles, categorie, ordre, actif FROM nutrition_coach_faq ORDER BY ordre ASC, id ASC').all() }); }
    catch (e) { console.error('coach-faq GET :', e); res.status(500).json({ ok: false, error: 'Lecture impossible.' }); }
  });
  // ADMIN : créer (sans id) ou mettre à jour (avec id) une réponse.
  app.post('/nutrition/api/coach-faq', requireAuth, requireAdmin, (req, res) => {
    try {
      const b = req.body || {};
      const question = String(b.question || '').trim();
      const reponse = String(b.reponse || '').trim();
      if (!question || !reponse) return res.status(400).json({ ok: false, error: 'Question et réponse requises.' });
      const mots = String(b.mots_cles || '').trim();
      const cat = String(b.categorie || '').trim().slice(0, 40);
      const ordre = Number.isFinite(Number(b.ordre)) ? Number(b.ordre) : 0;
      const actif = (b.actif === 0 || b.actif === false || b.actif === '0') ? 0 : 1;
      if (b.id) {
        getDb().prepare("UPDATE nutrition_coach_faq SET question=?, reponse=?, mots_cles=?, categorie=?, ordre=?, actif=?, updated_at=datetime('now','localtime') WHERE id=?")
          .run(question, reponse, mots, cat, ordre, actif, Number(b.id));
      } else {
        getDb().prepare("INSERT INTO nutrition_coach_faq (question, reponse, mots_cles, categorie, ordre, actif, updated_at) VALUES (?,?,?,?,?,?,datetime('now','localtime'))")
          .run(question, reponse, mots, cat, ordre, actif);
      }
      res.json({ ok: true });
    } catch (e) { console.error('coach-faq POST :', e); res.status(500).json({ ok: false, error: 'Enregistrement impossible.' }); }
  });
  // ADMIN : supprimer une réponse.
  app.delete('/nutrition/api/coach-faq/:id', requireAuth, requireAdmin, (req, res) => {
    try { getDb().prepare('DELETE FROM nutrition_coach_faq WHERE id = ?').run(Number(req.params.id)); res.json({ ok: true }); }
    catch (e) { console.error('coach-faq DELETE :', e); res.status(500).json({ ok: false, error: 'Suppression impossible.' }); }
  });

  // ====== Photos de plats (admin/coach ajoutent ; clients voient) ======
  function getRecipesCatalogue() { try { return require('./nutrition-app/lib/recipes-v2').RECIPES || []; } catch (_) { return []; } }

  // Index des plats AYANT une photo (public) -> le front n'affiche l'<img> que pour ceux-là.
  app.get('/nutrition/api/recipe-photos-index', (req, res) => {
    try {
      const photos = {};
      getDb().prepare('SELECT recipe_id, updated_at FROM nutrition_recipe_photos').all().forEach((r) => { photos[r.recipe_id] = r.updated_at || '1'; });
      res.set('Cache-Control', 'no-cache');
      res.json({ ok: true, photos });
    } catch (e) { res.json({ ok: true, photos: {} }); }
  });

  // Sert la photo d'un plat (PUBLIC : un <img> n'envoie pas de token).
  app.get('/nutrition/api/recipe-photo/:id', (req, res) => {
    try {
      const row = getDb().prepare('SELECT data FROM nutrition_recipe_photos WHERE recipe_id = ?').get(String(req.params.id));
      const m = row && row.data && /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(row.data);
      if (!m) return res.status(404).end();
      res.set('Content-Type', m[1]);
      res.set('Cache-Control', 'public, max-age=300');
      res.send(Buffer.from(m[2], 'base64'));
    } catch (e) { res.status(404).end(); }
  });

  // Liste des plats avec statut photo (gestion admin/coach).
  app.get('/nutrition/api/recipes-list', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const withPhoto = new Set(getDb().prepare('SELECT recipe_id FROM nutrition_recipe_photos').all().map((r) => r.recipe_id));
      const recipes = getRecipesCatalogue().map((r) => ({ id: r.id, nom: r.nom, type: r.type, cuisines: r.cuisines || [], hasPhoto: withPhoto.has(r.id) }));
      res.json({ ok: true, total: recipes.length, recipes });
    } catch (e) { console.error('recipes-list GET :', e); res.status(500).json({ ok: false, error: 'Lecture impossible.' }); }
  });

  // Ajoute/remplace la photo d'un plat. Coach : seulement si le plat n'a PAS de photo. Admin : toujours.
  app.post('/nutrition/api/recipes/:id/photo', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const id = String(req.params.id);
      if (!getRecipesCatalogue().some((r) => r.id === id)) return res.status(404).json({ ok: false, error: 'Plat inconnu.' });
      const url = String((req.body || {}).imageDataUrl || '');
      if (url.length > 3000000) return res.status(413).json({ ok: false, error: 'Image trop lourde (compresse-la).' });
      const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(url);
      if (!m) return res.status(400).json({ ok: false, error: 'Format non supporté (jpg, png, webp).' });
      const sc = req.nutritionScope;
      const existing = getDb().prepare('SELECT recipe_id FROM nutrition_recipe_photos WHERE recipe_id = ?').get(id);
      if (existing && !sc.isAdmin) return res.status(403).json({ ok: false, error: 'Ce plat a déjà une photo — seul un admin peut la remplacer.' });
      const now = new Date().toISOString();
      getDb().prepare('INSERT INTO nutrition_recipe_photos (recipe_id, data, mime, auteur_role, auteur_id, updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(recipe_id) DO UPDATE SET data=excluded.data, mime=excluded.mime, auteur_role=excluded.auteur_role, auteur_id=excluded.auteur_id, updated_at=excluded.updated_at')
        .run(id, url, m[1], sc.isAdmin ? 'super_admin' : 'coach', (req.session && req.session.coach_id) || 0, now);
      res.json({ ok: true, updatedAt: now });
    } catch (e) { console.error('recipe photo POST :', e); res.status(500).json({ ok: false, error: 'Enregistrement impossible.' }); }
  });

  // Supprime la photo d'un plat (admin seulement).
  app.delete('/nutrition/api/recipes/:id/photo', requireAuth, requireAdmin, (req, res) => {
    try {
      getDb().prepare('DELETE FROM nutrition_recipe_photos WHERE recipe_id = ?').run(String(req.params.id));
      res.json({ ok: true });
    } catch (e) { console.error('recipe photo DELETE :', e); res.status(500).json({ ok: false, error: 'Suppression impossible.' }); }
  });

  // --- Scan de produits (code-barres -> Open Food Facts) ---
  // Journalise un scan (pour les stats coach "produits les plus scannés").
  app.post('/nutrition/api/scan', requireAuth, requireNutritionAccess, (req, res) => {
    try {
      const { clientName, barcode, productName, brand, nutriscore, coherence } = req.body || {};
      const coh = ['compatible', 'moderation', 'a_eviter'].includes(coherence) ? coherence : '';
      getDb().prepare(
        'INSERT INTO nutrition_scans (client_name, client_email, created_at, barcode, product_name, brand, nutriscore, coherence) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        String(clientName || req.session.name || 'Client').slice(0, 120), (req.session && req.session.email) || '', new Date().toISOString(),
        String(barcode || '').slice(0, 40), String(productName || '').slice(0, 200),
        String(brand || '').slice(0, 120), String(nutriscore || '').slice(0, 2), coh
      );
      res.json({ ok: true });
    } catch (e) {
      console.error('Erreur scan POST :', e);
      res.status(500).json({ ok: false, error: 'Enregistrement impossible.' });
    }
  });

  // Demande d'avis du coach sur un produit scanné.
  app.post('/nutrition/api/scan-advice', requireAuth, requireNutritionAccess, (req, res) => {
    try {
      const { clientName, barcode, productName, message } = req.body || {};
      const info = getDb().prepare(
        'INSERT INTO nutrition_scan_advice (client_name, client_email, created_at, barcode, product_name, message, statut) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(
        String(clientName || req.session.name || 'Client').slice(0, 120), (req.session && req.session.email) || '', new Date().toISOString(),
        String(barcode || '').slice(0, 40), String(productName || '').slice(0, 200),
        String(message || '').slice(0, 2000), 'a_traiter'
      );
      res.json({ ok: true, id: info.lastInsertRowid });
    } catch (e) {
      console.error('Erreur scan-advice POST :', e);
      res.status(500).json({ ok: false, error: 'Enregistrement impossible.' });
    }
  });

  // Vue coach : demandes d'avis + produits les plus scannés + scans récents.
  app.get('/nutrition/api/scans', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const db = getDb();
      const scA = coachLegacyScope(req.nutritionScope, 'client_email');
      const advice = db.prepare('SELECT * FROM nutrition_scan_advice' + scA.where + ' ORDER BY id DESC').all(...scA.params).map(r => ({
        id: r.id, clientName: r.client_name, createdAt: r.created_at,
        barcode: r.barcode, productName: r.product_name, message: r.message, statut: r.statut,
      }));
      const scS = coachLegacyScope(req.nutritionScope, 'client_email');
      const topProducts = db.prepare(`
        SELECT barcode, product_name AS productName, COUNT(*) AS count,
               MAX(coherence) AS coherence
        FROM nutrition_scans WHERE barcode != ''` + scS.and + `
        GROUP BY barcode ORDER BY count DESC, MAX(id) DESC LIMIT 20
      `).all(...scS.params);
      const recent = db.prepare('SELECT * FROM nutrition_scans' + scS.where + ' ORDER BY id DESC LIMIT 40').all(...scS.params).map(r => ({
        id: r.id, clientName: r.client_name, createdAt: r.created_at, barcode: r.barcode,
        productName: r.product_name, brand: r.brand, nutriscore: r.nutriscore, coherence: r.coherence,
      }));
      res.json({ ok: true, advice, topProducts, recent });
    } catch (e) {
      console.error('Erreur scans GET :', e);
      res.status(500).json({ ok: false, error: 'Lecture impossible.' });
    }
  });

  // Changement de statut d'une demande d'avis (admin = tous ; coach = SES clients).
  app.patch('/nutrition/api/scan-advice/:id', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const statut = String((req.body || {}).statut || '');
      if (!['a_traiter', 'en_cours', 'traite'].includes(statut)) {
        return res.status(400).json({ ok: false, error: 'Statut invalide.' });
      }
      const sc = req.nutritionScope;
      const id = Number(req.params.id);
      if (!sc.isAdmin) {
        const row = getDb().prepare('SELECT client_email FROM nutrition_scan_advice WHERE id = ?').get(id);
        if (!row) return res.status(404).json({ ok: false, error: 'Demande introuvable.' });
        const owned = row.client_email && coachSeesClient(sc.coachId, row.client_email);
        if (!owned) return res.status(403).json({ ok: false, error: 'Demande non attribuée.' });
      }
      const info = getDb().prepare('UPDATE nutrition_scan_advice SET statut = ? WHERE id = ?').run(statut, id);
      res.json({ ok: info.changes > 0 });
    } catch (e) {
      console.error('Erreur scan-advice PATCH :', e);
      res.status(500).json({ ok: false, error: 'Mise à jour impossible.' });
    }
  });

  // --- Suivi d'adherence au plan (resume quotidien par client) ---
  // Enregistrement (upsert) du resume d'une journee.
  app.post('/nutrition/api/adherence', requireAuth, requireNutritionAccess, (req, res) => {
    try {
      const { clientName, date, suivi, adapte, autre, saute, score } = req.body || {};
      const d = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? date : new Date().toISOString().slice(0, 10);
      const nom = String(clientName || req.session.name || 'Client').slice(0, 120);
      const n = (v) => Math.max(0, Math.min(50, parseInt(v, 10) || 0));
      const sc = Math.max(0, Math.min(100, parseInt(score, 10) || 0));
      getDb().prepare(`INSERT INTO nutrition_adherence (client_name, client_email, date, suivi, adapte, autre, saute, score, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(client_name, date) DO UPDATE SET
          client_email = excluded.client_email, suivi = excluded.suivi, adapte = excluded.adapte, autre = excluded.autre,
          saute = excluded.saute, score = excluded.score, updated_at = excluded.updated_at`)
        .run(nom, (req.session && req.session.email) || '', d, n(suivi), n(adapte), n(autre), n(saute), sc, new Date().toISOString());
      res.json({ ok: true });
    } catch (e) {
      console.error('Erreur adherence POST :', e);
      res.status(500).json({ ok: false, error: 'Enregistrement impossible.' });
    }
  });

  // Vue coach : adherence des clients sur 7 jours + alertes (admin = tous ; coach = SES clients).
  app.get('/nutrition/api/adherence/coach', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const db = getDb();
      const sc = coachLegacyScope(req.nutritionScope, 'client_email');
      const today = new Date().toISOString().slice(0, 10);
      const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
      const rows = db.prepare('SELECT * FROM nutrition_adherence WHERE date >= ?' + sc.and + ' ORDER BY date DESC').all(since, ...sc.params);
      const helps = db.prepare("SELECT client_name, client_email, created_at, difficultes, statut FROM nutrition_help_requests WHERE created_at >= ?" + sc.and).all(since + 'T00:00:00.000Z', ...sc.params);
      // Identité stable : email si présent (sinon nom legacy). Le nom affiché est résolu
      // depuis nutrition_clients quand l'email est connu -> deux clients de même nom ne
      // fusionnent plus, et adhérence + aide se joignent par la même clé.
      const nomParEmail = {};
      try { db.prepare("SELECT email, prenom, nom FROM nutrition_clients").all().forEach((c) => { nomParEmail[c.email] = [c.prenom, c.nom].filter(Boolean).join(' ') || c.email; }); } catch (_) { /* table absente */ }
      const cleId = (r) => (r.client_email ? 'e:' + r.client_email : 'n:' + r.client_name);
      const nomAff = (r) => (r.client_email && nomParEmail[r.client_email]) || r.client_name || r.client_email || 'Client';
      const byClient = {};
      rows.forEach((r) => {
        const k = cleId(r);
        const c = byClient[k] || (byClient[k] = { key: k, clientName: nomAff(r), suivi: 0, adapte: 0, autre: 0, saute: 0, days: 0, scoreSum: 0, lastDate: '' });
        c.suivi += r.suivi; c.adapte += r.adapte; c.autre += r.autre; c.saute += r.saute; c.days += 1; c.scoreSum += r.score;
        if (r.date > c.lastDate) c.lastDate = r.date;
      });
      const helpByClient = {};
      helps.forEach((h) => { (helpByClient[cleId(h)] || (helpByClient[cleId(h)] = [])).push(h); });
      const parseDiff = (h) => { try { return JSON.parse(h.difficultes); } catch (_) { return []; } };
      const build = (c) => {
        const help = helpByClient[c.key] || [];
        const aTraiter = help.some((h) => h.statut === 'a_traiter');
        const score = c.days ? Math.round(c.scoreSum / c.days) : 0;
        const daysSince = c.lastDate ? Math.round((Date.parse(today) - Date.parse(c.lastDate)) / 864e5) : 99;
        const alerts = [];
        if (aTraiter) alerts.push("Demande d'aide en attente");
        if (c.days && score < 50) alerts.push('Adherence faible (< 50%)');
        if ((c.autre + c.saute) >= 3) alerts.push('Plusieurs repas a reprendre');
        if (c.days && daysSince >= 3) alerts.push('Aucun suivi depuis ' + daysSince + ' j');
        if (!c.days && !aTraiter) alerts.push('Aucun suivi cette semaine');
        const statut = aTraiter ? 'besoin_aide' : (alerts.length ? 'a_surveiller' : 'ok');
        const lastHelp = help[0] ? { difficultes: parseDiff(help[0]), createdAt: help[0].created_at, statut: help[0].statut } : null;
        return { clientName: c.clientName, suivi: c.suivi, adapte: c.adapte, autre: c.autre, saute: c.saute, days: c.days, score, lastDate: c.lastDate, alerts, statut, lastHelp };
      };
      const clients = Object.values(byClient).map(build);
      // Clients ayant une demande d'aide mais aucune adhérence cette semaine.
      Object.keys(helpByClient).forEach((k) => {
        if (!byClient[k]) clients.push(build({ key: k, clientName: nomAff(helpByClient[k][0]), suivi: 0, adapte: 0, autre: 0, saute: 0, days: 0, scoreSum: 0, lastDate: '' }));
      });
      const rank = { besoin_aide: 0, a_surveiller: 1, ok: 2 };
      clients.sort((a, b) => (rank[a.statut] - rank[b.statut]) || (a.score - b.score));
      res.json({ ok: true, clients });
    } catch (e) {
      console.error('Erreur adherence coach GET :', e);
      res.status(500).json({ ok: false, error: 'Lecture impossible.' });
    }
  });

  // --- Mode démonstration client ---
  // Démarrage d'une session démo via le code unique (PUBLIC, sans auth).
  app.post('/nutrition/demo/start', (req, res) => {
    try {
      const code = String((req.body || {}).code || '').trim();
      const cfg = getDemoConfig();
      if (!cfg.enabled) return res.json({ ok: false, reason: 'disabled' });
      if (cfg.expires_at && Date.now() > Date.parse(cfg.expires_at + 'T23:59:59')) return res.json({ ok: false, reason: 'expired' });
      if (!code || code.toLowerCase() !== String(cfg.code).toLowerCase()) return res.json({ ok: false, reason: 'invalid' });
      const token = crypto.randomUUID();
      const until = Date.now() + 4 * 3600 * 1000; // session démo de 4 h
      sessions.set(token, { role: 'nutrition_demo', name: 'Démo', demo: true });
      getDb().prepare('UPDATE nutrition_demo SET uses = uses + 1 WHERE id = 1').run();
      getDb().prepare('INSERT INTO nutrition_demo_access (accessed_at) VALUES (?)').run(new Date().toISOString());
      res.json({ ok: true, token, until });
    } catch (e) {
      console.error('Erreur demo/start :', e);
      res.status(500).json({ ok: false, reason: 'error' });
    }
  });

  // --- Comptes clients (email + prenom + nom + CODE PIN) ---
  // PUBLIC : cree OU identifie un client et ouvre une session "usage nutrition".
  // Le PIN protege l'acces au compte (photos d'evolution, poids, messages). 1re
  // connexion -> le PIN saisi devient le PIN du compte ; ensuite il est exige.
  // Coach attribué PAR DÉFAUT à tout nouveau client nutrition : Quentin (Lille), PIN « quen ».
  // Résolu dynamiquement (et non par ID en dur) pour rester valable quelle que soit la base
  // (dev vs prod) : par PIN d'abord — l'identifiant unique fourni —, puis nom+studio en secours.
  // Renvoie null si ce coach n'existe pas encore (le client est alors créé sans coach, comme avant).
  function defaultNutritionCoachId() {
    try {
      const db = getDb();
      const byPin = db.prepare("SELECT id FROM coaches WHERE pin = 'quen' AND archived = 0").get();
      if (byPin) return byPin.id;
      const byNameStudio = db.prepare("SELECT id FROM coaches WHERE name = 'Quentin' AND studio = 'Lille' AND archived = 0").get();
      if (byNameStudio) return byNameStudio.id;
      const byName = db.prepare("SELECT id FROM coaches WHERE name = 'Quentin' AND archived = 0").get();
      return byName ? byName.id : null;
    } catch (_) { return null; }
  }

  // URL publique correcte derrière le proxy Railway (TLS terminé en amont) :
  // on respecte x-forwarded-proto pour ne pas générer un lien http://.
  function publicBaseUrl(req) {
    const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || req.protocol || 'https';
    return proto + '://' + req.get('host');
  }
  // Contenu de l'email d'invitation client (HTML sobre, compatible clients mail).
  function inviteEmailContent(coachName, url, prenom) {
    const hello = prenom ? ('Bonjour ' + escHtml(prenom)) : 'Bonjour';
    const coach = coachName ? escHtml(coachName) : 'Ton coach';
    const subject = coach + ' t’invite sur My Coach Nutrition';
    const html = ''
      + '<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;color:#1F2430;">'
      + '<div style="text-align:center;padding:24px 0;">'
      + '<div style="display:inline-block;width:56px;height:56px;border-radius:16px;background:#2563EB;line-height:56px;color:#fff;font-size:26px;font-weight:800;">🌱</div>'
      + '<h1 style="font-size:22px;margin:14px 0 0;">My Coach Nutrition</h1></div>'
      + '<p style="font-size:15px;line-height:1.6;">' + hello + ',</p>'
      + '<p style="font-size:15px;line-height:1.6;"><b>' + coach + '</b> t’invite à créer ton espace personnel pour recevoir ton plan alimentaire sur mesure, ta liste de courses et ton suivi.</p>'
      + '<div style="text-align:center;margin:26px 0;">'
      + '<a href="' + url + '" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 26px;border-radius:14px;">Créer mon espace</a></div>'
      + '<p style="font-size:13px;line-height:1.6;color:#6B6B63;">Tu choisiras un code PIN à la première connexion pour protéger tes données. Ce lien est personnel et valable 21 jours.</p>'
      + '<p style="font-size:12px;line-height:1.6;color:#9A9890;">Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur :<br>' + url + '</p>'
      + '</div>';
    const text = coach + ' t’invite sur My Coach Nutrition.\n\nCrée ton espace ici : ' + url + '\n\nTu choisiras un code PIN à la première connexion. Lien valable 21 jours.';
    return { subject, html, text };
  }
  // Échappement minimal pour l'email (réutilise l'idée de escapeHtml côté serveur).
  function escHtml(s) { return String(s == null ? '' : s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])); }

  // Envoi d'email via l'API HTTPS de Brevo (sortie sur le port 443) — contourne le
  // blocage des ports SMTP sortants (fréquent sur Railway/PaaS). Nécessite BREVO_API_KEY
  // + un expéditeur vérifié (BREVO_SENDER, sinon SMTP_USER/SMTP_FROM).
  async function sendViaBrevo({ to, subject, html, text }) {
    const key = process.env.BREVO_API_KEY;
    if (!key) throw new Error('BREVO_API_KEY manquant');
    // Extrait l'email d'un éventuel « Nom <email> ».
    const rawFrom = process.env.BREVO_SENDER || process.env.SMTP_FROM || process.env.SMTP_USER || '';
    const m = /<([^>]+)>/.exec(rawFrom);
    const senderEmail = (m ? m[1] : rawFrom).trim();
    const senderName = process.env.BREVO_SENDER_NAME || 'My Coach Nutrition';
    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: { name: senderName, email: senderEmail }, to: [{ email: to }], subject, htmlContent: html, textContent: text }),
    });
    if (!resp.ok) {
      let body = ''; try { body = await resp.text(); } catch (_) { /* ignore */ }
      throw new Error('Brevo ' + resp.status + ' ' + body.slice(0, 200));
    }
    return { ok: true };
  }

  // Authentification client : toute la logique (PIN, code de cohorte, invitations)
  // vit dans nutrition-app/lib/clientAuth.js -> testable hors HTTP. Voir la suite
  // nutrition-app/test/clientAuth.test.js avant toute modification des règles.
  const clientAuth = require('./nutrition-app/lib/clientAuth').createClientAuth({
    getDb, defaultCoachId: defaultNutritionCoachId,
  });
  const validateInvite = clientAuth.validateInvite;
  const genAccessCode = clientAuth.genUniqueAccessCode; // unique : le code sert de clé d'entrée

  // BACKFILL : le code du challenge est la porte d'entrée -> un groupe SANS code est
  // un groupe que personne ne peut rejoindre. On équipe donc au démarrage tous les
  // groupes déjà existants (ville + n° de challenge tirés des fiches clients).
  // Idempotent : un groupe qui a déjà un code n'est jamais touché.
  function backfillAccessCodes() {
    try {
      const groupes = getDb().prepare("SELECT DISTINCT ville, challenge_no FROM nutrition_client_meta WHERE TRIM(ville) <> ''").all();
      let crees = 0;
      groupes.forEach((g) => {
        const ex = getDb().prepare('SELECT code FROM nutrition_access_codes WHERE ville = ? AND challenge_no = ?').get(g.ville, g.challenge_no);
        if (ex && ex.code) return;
        getDb().prepare('INSERT INTO nutrition_access_codes (ville, challenge_no, code, actif, updated_at) VALUES (?,?,?,1,?) ON CONFLICT(ville, challenge_no) DO UPDATE SET code = excluded.code, actif = 1, updated_at = excluded.updated_at')
          .run(g.ville, g.challenge_no, clientAuth.genUniqueAccessCode(), new Date().toISOString());
        crees++;
      });
      if (crees) console.log('Codes de challenge : ' + crees + ' groupe(s) équipé(s) automatiquement.');
    } catch (e) { console.error('backfillAccessCodes :', e && e.message); }
  }
  backfillAccessCodes();

  // ÉTAPE 1 de la connexion client : valide identité + code du challenge SANS rien
  // créer, et indique au front s'il doit faire choisir un PIN ou juste le demander.
  app.post('/nutrition/account/join-check', (req, res) => {
    try {
      const r = clientAuth.joinCheck(req.body || {});
      return res.status(r.status).json(r.body);
    } catch (e) {
      console.error('Erreur /nutrition/account/join-check :', e);
      res.status(500).json({ ok: false, error: 'Vérification impossible.' });
    }
  });

  app.post('/nutrition/account/login', (req, res) => {
    try {
      const r = clientAuth.loginClient(req.body || {});
      if (!r.ok) return res.status(r.status).json(r.body);
      // La session n'est posée qu'ici : le module reste pur (testable sans HTTP).
      const token = crypto.randomUUID();
      const until = Date.now() + 30 * 24 * 3600 * 1000; // session 30 jours
      sessions.set(token, { role: 'nutrition_demo', name: r.body.prenom, demo: true, client: true, email: r.body.email });
      res.json({ ok: true, isNew: r.body.isNew, token, until, prenom: r.body.prenom, nom: r.body.nom, data: r.body.data });
    } catch (e) {
      console.error('Erreur /nutrition/account/login :', e);
      res.status(500).json({ ok: false, error: 'Connexion impossible.' });
    }
  });

  // ---- Invitations client (sécurise la création de compte) ----
  // Coach/admin : générer un lien d'invitation (optionnellement lié à un email précis).
  app.post('/nutrition/api/coach/invites', requireAuth, requireCoachOrAdmin, async (req, res) => {
    try {
      const b = req.body || {};
      const email = String(b.email || '').trim().toLowerCase().slice(0, 160);
      if (email && email.indexOf('@') < 1) return res.status(400).json({ ok: false, error: 'Email invalide.' });
      const prenom = String(b.prenom || '').trim().slice(0, 80);
      const nom = String(b.nom || '').trim().slice(0, 80);
      const sc = req.nutritionScope || {};
      const coachId = sc.isAdmin ? (b.coachId ? Number(b.coachId) : null) : sc.coachId;
      const coachName = String((req.session && req.session.name) || '').slice(0, 80);
      const token = crypto.randomBytes(16).toString('hex');
      const now = new Date().toISOString();
      const expires = new Date(Date.now() + 21 * 24 * 3600 * 1000).toISOString(); // 21 jours
      getDb().prepare('INSERT INTO nutrition_invites (token, email, prenom, nom, coach_id, coach_name, created_at, expires_at) VALUES (?,?,?,?,?,?,?,?)')
        .run(token, email, prenom, nom, coachId || null, coachName, now, expires);
      const base = publicBaseUrl(req);
      const url = base + '/nutrition/?inv=' + token;
      // Envoi automatique de l'email si un destinataire est fourni ET que le SMTP est
      // configuré. Sinon on renvoie quand même le lien (le coach le copie/partage).
      // Auto-envoi de l'email UNIQUEMENT via l'API HTTPS Brevo (le SMTP est bloqué sur
      // Railway et ferait « pendre » la requête ~12 s). Sans Brevo, le coach partage le
      // lien lui-même (boutons WhatsApp / Email côté client) -> réponse instantanée.
      let emailSent = false, emailError = '', emailErrorMsg = '';
      if (email && process.env.BREVO_API_KEY) {
        try {
          const content = inviteEmailContent(coachName, url, prenom);
          await sendViaBrevo({ to: email, subject: content.subject, html: content.html, text: content.text });
          emailSent = true;
        } catch (e) {
          const msg = String((e && e.message) || '');
          emailError = 'send';
          emailErrorMsg = msg.slice(0, 220);
          console.warn('Invitation email (Brevo) non envoyé :', msg);
        }
      }
      res.json({ ok: true, token, url, email, prenom, nom, expiresAt: expires, emailSent, emailError, emailErrorMsg });
    } catch (e) { console.error('coach/invites POST :', e); res.status(500).json({ ok: false, error: 'Création impossible.' }); }
  });
  // Coach/admin : lister ses invitations (en attente + utilisées).
  app.get('/nutrition/api/coach/invites', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const sc = req.nutritionScope || {};
      const rows = sc.isAdmin
        ? getDb().prepare('SELECT id, token, email, prenom, nom, coach_name, created_at, expires_at, used_at, used_email FROM nutrition_invites ORDER BY id DESC LIMIT 100').all()
        : getDb().prepare('SELECT id, token, email, prenom, nom, coach_name, created_at, expires_at, used_at, used_email FROM nutrition_invites WHERE coach_id = ? ORDER BY id DESC LIMIT 100').all(sc.coachId);
      const base = publicBaseUrl(req);
      const now = Date.now();
      const invites = rows.map((r) => ({
        id: r.id, email: r.email, prenom: r.prenom, nom: r.nom, coachName: r.coach_name,
        url: base + '/nutrition/?inv=' + r.token,
        createdAt: r.created_at, expiresAt: r.expires_at,
        used: !!r.used_at, usedEmail: r.used_email,
        expired: !r.used_at && r.expires_at && Date.parse(r.expires_at) < now,
      }));
      res.json({ ok: true, invites });
    } catch (e) { console.error('coach/invites GET :', e); res.status(500).json({ ok: false, error: 'Lecture impossible.' }); }
  });
  // Coach/admin : révoquer une invitation non utilisée.
  app.delete('/nutrition/api/coach/invites/:id', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const sc = req.nutritionScope || {};
      const id = Number(req.params.id);
      const row = getDb().prepare('SELECT coach_id, used_at FROM nutrition_invites WHERE id = ?').get(id);
      if (!row) return res.status(404).json({ ok: false, error: 'Introuvable.' });
      if (!sc.isAdmin && row.coach_id !== sc.coachId) return res.status(403).json({ ok: false, error: 'Non autorisé.' });
      getDb().prepare('DELETE FROM nutrition_invites WHERE id = ?').run(id);
      res.json({ ok: true });
    } catch (e) { console.error('coach/invites DELETE :', e); res.status(500).json({ ok: false, error: 'Suppression impossible.' }); }
  });
  // PUBLIC : valider un jeton pour pré-remplir la page de connexion. Ne révèle que ce
  // que le coach a saisi (email/prénom pré-remplis) — nécessaire à l'onboarding.
  app.get('/nutrition/api/invites/:token', (req, res) => {
    try {
      const check = validateInvite(String(req.params.token || ''), '');
      if (!check.ok) return res.json({ ok: true, valid: false, reason: check.error });
      const inv = check.invite;
      res.json({ ok: true, valid: true, email: inv.email || '', prenom: inv.prenom || '', nom: inv.nom || '', coachName: inv.coach_name || '' });
    } catch (e) { console.error('invites GET :', e); res.status(500).json({ ok: false }); }
  });

  // Restaure la session depuis un token valide (sans re-saisir le PIN) : le token
  // EST la preuve d'authentification. Utilisé au démarrage de l'app.
  app.get('/nutrition/account/me', requireAuth, (req, res) => {
    try {
      const email = (req.session && req.session.email) || '';
      if (!email) return res.status(403).json({ ok: false });
      const row = getDb().prepare('SELECT prenom, nom, data, avatar, avatar_key, avatar_config FROM nutrition_clients WHERE email = ?').get(email);
      // Compte supprimé (vrai client, hors démo) -> accès révoqué : on force la reconnexion.
      if (!row && !req.session.demo) return res.status(403).json({ ok: false, deleted: true });
      let data = null; try { data = row && row.data ? JSON.parse(row.data) : null; } catch (_) { data = null; }
      // L'avatar personnalisé prime ; la photo importée avant la bascule reste
      // le repli tant qu'aucun avatar n'a été créé.
      const cfg = lireAvatarConfig(row && row.avatar_config);
      const cle = (row && row.avatar_key) || '';
      const avatarUrl = cle && cfg ? '/nutrition/api/community/avatar/' + cle + '?v=' + avatarLib.hashConfig(cfg).toString(36)
        : ((row && row.avatar && cle) ? '/nutrition/api/community/avatar/' + cle : '');
      res.json({
        ok: true, email, prenom: (row && row.prenom) || req.session.name || '', nom: (row && row.nom) || '',
        data, avatarUrl,
        avatarConfig: cfg,                       // null tant que l'avatar n'est pas créé
        aPhoto: !!(row && row.avatar),           // pour proposer « Crée ton avatar » à la migration
      });
    } catch (e) {
      console.error('Erreur /nutrition/account/me :', e);
      res.status(500).json({ ok: false });
    }
  });

  // Photo de profil : le client (connecté) ajoute / change sa photo (partagée à la communauté).
  // L'image arrive déjà redimensionnée côté client (carré ~256px, JPEG) -> petite taille.
  app.post('/nutrition/account/avatar', requireAuth, (req, res) => {
    try {
      const email = (req.session && req.session.email) || '';
      if (!email) return res.status(403).json({ ok: false });
      const data = String((req.body && req.body.data) || '');
      if (!/^data:image\/(jpeg|png|webp);base64,.+/.test(data)) return res.status(400).json({ ok: false, error: 'Image requise (JPEG/PNG/WebP).' });
      if (data.length > 900000) return res.status(413).json({ ok: false, error: 'Photo trop lourde (max ~600 Ko).' });
      let key = '';
      try { const r = getDb().prepare('SELECT avatar_key FROM nutrition_clients WHERE email = ?').get(email); key = (r && r.avatar_key) || ''; } catch (_) { /* ignore */ }
      if (!key) key = crypto.randomBytes(8).toString('hex');
      getDb().prepare('UPDATE nutrition_clients SET avatar = ?, avatar_key = ?, updated_at = ? WHERE email = ?').run(data, key, new Date().toISOString(), email);
      res.json({ ok: true, avatarUrl: '/nutrition/api/community/avatar/' + key });
    } catch (e) { console.error('account/avatar POST :', e); res.status(500).json({ ok: false, error: 'Enregistrement impossible.' }); }
  });
  // Retirer sa photo de profil.
  app.delete('/nutrition/account/avatar', requireAuth, (req, res) => {
    try {
      const email = (req.session && req.session.email) || '';
      if (!email) return res.status(403).json({ ok: false });
      getDb().prepare("UPDATE nutrition_clients SET avatar = '', updated_at = ? WHERE email = ?").run(new Date().toISOString(), email);
      res.json({ ok: true });
    } catch (e) { console.error('account/avatar DELETE :', e); res.status(500).json({ ok: false, error: 'Suppression impossible.' }); }
  });
  // AVATAR PERSONNALISABLE : on enregistre la CONFIG, jamais une image.
  // Le serveur ne fait pas confiance à ce qu'il reçoit : normaliserConfig()
  // ramène toute valeur inconnue au défaut, et les accessoires non débloqués
  // sont RETIRÉS ici — un client ne peut pas s'équiper d'une pièce qu'il n'a
  // pas gagnée en forgeant la requête. Rien n'est achetable, tout se mérite.
  app.post('/nutrition/account/avatar-config', requireAuth, (req, res) => {
    try {
      const email = (req.session && req.session.email) || '';
      if (!email) return res.status(403).json({ ok: false });
      const cfg = avatarLib.normaliserConfig((req.body && req.body.config) || {});
      // Ce que ce client a réellement débloqué, recalculé côté serveur.
      const punch = punchDuClientPourAvatar(email);
      const badges = badgesDuClientPourAvatar(email);
      const autorises = new Set(avatarLib.accessoiresDebloques(punch, badges));
      const refuses = cfg.accessoires.filter((a) => !autorises.has(a));
      cfg.accessoires = cfg.accessoires.filter((a) => autorises.has(a));

      let key = '';
      try { const r = getDb().prepare('SELECT avatar_key FROM nutrition_clients WHERE email = ?').get(email); key = (r && r.avatar_key) || ''; } catch (_) { /* ignore */ }
      if (!key) key = crypto.randomBytes(8).toString('hex');
      getDb().prepare('UPDATE nutrition_clients SET avatar_config = ?, avatar_key = ?, updated_at = ? WHERE email = ?')
        .run(JSON.stringify(cfg), key, new Date().toISOString(), email);
      res.json({
        ok: true, config: cfg,
        avatarUrl: '/nutrition/api/community/avatar/' + key + '?v=' + avatarLib.hashConfig(cfg).toString(36),
        refuses, // accessoires écartés faute d'être débloqués (le front peut le dire)
      });
    } catch (e) { console.error('account/avatar-config POST :', e); res.status(500).json({ ok: false, error: 'Enregistrement impossible.' }); }
  });
  // Punch cumulé servant aux déblocages d'accessoires. On lit la PROGRESSION
  // (Punch réel ou étapes validées), jamais user_unlocks — cette table ne
  // retient que ce qui a déjà été célébré.
  function punchDuClientPourAvatar(email) {
    try { return Number(punchProgression(email)) || 0; } catch (_) { return 0; }
  }
  // Badges = cadeaux déjà atteints (badge_argent / or / platine), déduits du Punch.
  function badgesDuClientPourAvatar(email) {
    const p = punchDuClientPourAvatar(email);
    return Object.keys(punchSeuils.GIFTS).filter((s) => p >= Number(s)).map((s) => punchSeuils.GIFTS[s]);
  }
  // Servir un avatar par sa clé (capability URL). PUBLIC volontairement : la clé aléatoire
  // fait office de secret, et la photo est de toute façon partagée au groupe. Permet un
  // <img src> direct dans le fil (impossible d'envoyer un en-tête d'auth depuis une balise img).
  app.get('/nutrition/api/community/avatar/:key', (req, res) => {
    try {
      const key = String(req.params.key || '');
      if (!/^[a-f0-9]{8,32}$/.test(key)) return res.status(404).end();
      const row = getDb().prepare('SELECT avatar, avatar_config FROM nutrition_clients WHERE avatar_key = ?').get(key);
      if (!row) return res.status(404).end();
      // L'avatar personnalisé PRIME sur la photo. En servant le SVG à cette même
      // URL, les 4 endroits qui affichent déjà un <img> (fil, commentaires,
      // composer, profil) et l'anneau de tier fonctionnent sans être touchés.
      const cfg = lireAvatarConfig(row.avatar_config);
      if (cfg) {
        res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
        // Immuable : l'URL porte l'empreinte de la config (?v=), donc une
        // modification produit une NOUVELLE URL — jamais de vignette périmée.
        res.setHeader('Cache-Control', req.query.v ? 'public, max-age=31536000, immutable' : 'public, max-age=60');
        return res.end(avatarLib.rendreSVG(cfg));
      }
      // Repli : la photo importée avant la bascule, tant qu'aucun avatar n'existe.
      const m = row.avatar && /^data:(image\/[^;]+);base64,(.+)$/.exec(row.avatar);
      if (!m) return res.status(404).end();
      res.setHeader('Content-Type', m[1]);
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.end(Buffer.from(m[2], 'base64'));
    } catch (e) { console.error('community/avatar GET :', e); res.status(500).end(); }
  });

  // Changer son code PIN (client connecté). Requiert le PIN actuel s'il existe.
  app.post('/nutrition/account/set-pin', requireAuth, (req, res) => {
    try {
      const email = (req.session && req.session.email) || '';
      if (!email) return res.status(403).json({ ok: false, error: 'Connexion requise.' });
      const b = req.body || {};
      const nouveau = String(b.pin || '').trim();
      if (!PIN_RE.test(nouveau)) return res.status(400).json({ ok: false, error: 'Le code PIN doit comporter 4 à 6 chiffres.' });
      const row = getDb().prepare('SELECT pin_hash FROM nutrition_clients WHERE email = ?').get(email);
      if (row && row.pin_hash && !verifyPin(String(b.current || ''), row.pin_hash)) {
        return res.status(401).json({ ok: false, error: 'Code PIN actuel incorrect.' });
      }
      getDb().prepare('UPDATE nutrition_clients SET pin_hash = ?, updated_at = ? WHERE email = ?').run(hashPin(nouveau), new Date().toISOString(), email);
      res.json({ ok: true });
    } catch (e) { console.error('set-pin :', e); res.status(500).json({ ok: false, error: 'Modification impossible.' }); }
  });

  // Déconnexion : invalide le token côté serveur (mémoire + DB).
  app.post('/nutrition/account/logout', requireAuth, (req, res) => {
    try {
      const authHeader = req.headers['authorization'] || '';
      if (authHeader.startsWith('Bearer ')) sessions.delete(authHeader.slice(7));
      res.json({ ok: true });
    } catch (e) { console.error('logout :', e); res.status(500).json({ ok: false }); }
  });

  // Sauvegarde des donnees du client connecte (profil + plan + suivi).
  // Protege par le token de session client (requireAuth).
  app.post('/nutrition/account/save', requireAuth, (req, res) => {
    try {
      const email = req.session && req.session.email;
      if (!email || !req.session.client) return res.status(403).json({ ok: false, error: 'Session client requise.' });
      let dataStr = '';
      try { dataStr = JSON.stringify((req.body || {}).data || {}); } catch (_) { return res.status(400).json({ ok: false, error: 'Données invalides.' }); }
      if (dataStr.length > 2000000) return res.status(413).json({ ok: false, error: 'Trop volumineux.' });
      const now = new Date().toISOString();
      const upd = getDb().prepare('UPDATE nutrition_clients SET data = ?, updated_at = ? WHERE email = ?').run(dataStr, now, email);
      if (!upd.changes) {
        getDb().prepare('INSERT OR IGNORE INTO nutrition_clients (email, prenom, nom, data, coach_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?)').run(email, req.session.name || '', '', dataStr, defaultNutritionCoachId(), now, now);
      }
      res.json({ ok: true });
    } catch (e) {
      console.error('Erreur /nutrition/account/save :', e);
      res.status(500).json({ ok: false, error: 'Sauvegarde impossible.' });
    }
  });

  // Liste des clients inscrits (administrateur principal).
  app.get('/nutrition/api/clients', requireAuth, requireAdmin, (req, res) => {
    try {
      const rows = getDb().prepare("SELECT email, prenom, nom, data, coach_id, created_at, updated_at, pin_locked FROM nutrition_clients ORDER BY datetime(CASE WHEN updated_at != '' THEN updated_at ELSE created_at END) DESC").all();
      const coachMap = {};
      try { getDb().prepare('SELECT id, name FROM coaches WHERE archived = 0').all().forEach((c) => { coachMap[c.id] = c.name; }); } catch (_) { /* table absente */ }
      // Coachs supplémentaires (multi-coach) groupés par client, en une requête.
      const extraByEmail = {};
      try { getDb().prepare('SELECT client_email, coach_id FROM nutrition_client_coaches').all().forEach((x) => { (extraByEmail[x.client_email] = extraByEmail[x.client_email] || []).push(x.coach_id); }); } catch (_) { /* table absente */ }
      const metaByEmail = {};
      try { getDb().prepare('SELECT client_email, ville, challenge_no FROM nutrition_client_meta').all().forEach((m) => { metaByEmail[m.client_email] = { ville: m.ville || '', challengeNo: m.challenge_no || 0 }; }); } catch (_) { /* table absente */ }
      const clients = rows.map((r) => {
        let objectif = '', hasPlan = false, savedAt = '';
        try {
          const d = r.data ? JSON.parse(r.data) : null;
          if (d) {
            hasPlan = !!d.plan;
            objectif = (d.profil && (d.profil.objectif || d.profil.but)) || '';
            savedAt = d.savedAt || '';
          }
        } catch (_) { /* données illisibles -> ignorées */ }
        const coachIds = [...new Set([...(r.coach_id ? [r.coach_id] : []), ...(extraByEmail[r.email] || [])])];
        const mm = metaByEmail[r.email] || {};
        return { email: r.email, prenom: r.prenom, nom: r.nom, createdAt: r.created_at, updatedAt: r.updated_at, objectif, hasPlan, savedAt,
          coachId: r.coach_id || null, coachName: (r.coach_id && coachMap[r.coach_id]) || null,
          coachIds, coachNames: coachIds.map((id) => coachMap[id]).filter(Boolean),
          ville: mm.ville || '', challengeNo: mm.challengeNo || 0, pinLocked: !!r.pin_locked };
      });
      res.json({ ok: true, total: clients.length, clients });
    } catch (e) {
      console.error('Erreur /nutrition/api/clients :', e);
      res.status(500).json({ ok: false, error: 'Lecture impossible.' });
    }
  });

  // Liste des coachs sportifs (pour l'attribution coach -> client). Admin seulement.
  app.get('/nutrition/api/coaches', requireAuth, requireAdmin, (req, res) => {
    try {
      const rows = getDb().prepare('SELECT id, name, studio FROM coaches WHERE archived = 0 ORDER BY name COLLATE NOCASE').all();
      res.json({ ok: true, coaches: rows });
    } catch (e) {
      console.error('Erreur /nutrition/api/coaches :', e);
      res.status(500).json({ ok: false, error: 'Lecture impossible.' });
    }
  });

  // Attribue le(s) coach(s) sportif(s) d'un client nutrition. Admin seulement.
  // Accepte `coach_ids: [id,...]` (multi) OU `coach_id` (single, rétro-compat). Le
  // `primary` (sinon le 1er) devient le RÉFÉRENT (nutrition_clients.coach_id) — c'est
  // lui qui porte le fil de messagerie ; les autres sont des coachs SUPPLÉMENTAIRES
  // (nutrition_client_coaches) qui voient et répondent au même fil (partagé).
  app.post('/nutrition/api/clients/:email/coach', requireAuth, requireAdmin, (req, res) => {
    try {
      const email = String(req.params.email || '').trim();
      if (!email) return res.status(400).json({ ok: false, error: 'Email manquant.' });
      const db = getDb();
      if (!db.prepare('SELECT email FROM nutrition_clients WHERE email = ?').get(email)) {
        return res.status(404).json({ ok: false, error: 'Client introuvable.' });
      }
      const b = req.body || {};
      let ids = Array.isArray(b.coach_ids)
        ? b.coach_ids
        : ((b.coach_id === null || b.coach_id === '' || b.coach_id === undefined) ? [] : [b.coach_id]);
      ids = ids.map((x) => Number(x)).filter((x) => Number.isInteger(x));
      // Ne garde que les coachs existants et actifs, sans doublon (ordre préservé).
      const uniq = [...new Set(ids)].filter((id) => db.prepare('SELECT id FROM coaches WHERE id = ? AND archived = 0').get(id));
      let primary = Number(b.primary);
      if (!uniq.includes(primary)) primary = uniq.length ? uniq[0] : null;
      db.prepare('UPDATE nutrition_clients SET coach_id = ? WHERE email = ?').run(primary, email);
      db.prepare('DELETE FROM nutrition_client_coaches WHERE client_email = ?').run(email);
      const now = new Date().toISOString();
      const insert = db.prepare('INSERT OR IGNORE INTO nutrition_client_coaches (client_email, coach_id, created_at) VALUES (?,?,?)');
      uniq.forEach((id) => { if (id !== primary) insert.run(email, id, now); });
      res.json({ ok: true, coachId: primary, primary, coachIds: uniq });
    } catch (e) {
      console.error('Erreur attribution coach :', e);
      res.status(500).json({ ok: false, error: 'Attribution impossible.' });
    }
  });

  // Réinitialise le code PIN d'un client (support). Le client en définit un nouveau
  // à sa prochaine connexion. Admin uniquement.
  app.post('/nutrition/api/clients/:email/reset-pin', requireAuth, requireAdmin, (req, res) => {
    try {
      const email = String(req.params.email || '').trim();
      if (!email) return res.status(400).json({ ok: false, error: 'Email manquant.' });
      // On vide le PIN (le client en repose un) ET on lève le verrou anti-force-
      // brute : sans ça, un compte réinitialisé resterait marqué bloqué.
      const upd = getDb().prepare("UPDATE nutrition_clients SET pin_hash = '', pin_fails = 0, pin_locked = 0, updated_at = ? WHERE email = ?").run(new Date().toISOString(), email);
      if (!upd.changes) return res.status(404).json({ ok: false, error: 'Client introuvable.' });
      res.json({ ok: true });
    } catch (e) { console.error('reset-pin :', e); res.status(500).json({ ok: false, error: 'Réinitialisation impossible.' }); }
  });

  // Débloquer un compte verrouillé après trop de PIN erronés. Le client GARDE son
  // PIN (contrairement à reset-pin) : il retape son vrai code. Coach OU admin ;
  // ⚠️ un coach ne peut débloquer que SES clients (le scope le lui interdit sinon).
  app.post('/nutrition/api/clients/:email/unlock-pin', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const email = String(req.params.email || '').trim().toLowerCase();
      if (!email) return res.status(400).json({ ok: false, error: 'Email manquant.' });
      const sc = req.nutritionScope;
      if (!sc.isAdmin) {
        // Le client doit être rattaché à ce coach (référent ou coach supplémentaire).
        const emails = new Set();
        try { getDb().prepare('SELECT email FROM nutrition_clients WHERE coach_id = ?').all(sc.coachId).forEach((r) => emails.add(String(r.email).toLowerCase())); } catch (_) { /* ignore */ }
        try { getDb().prepare('SELECT client_email FROM nutrition_client_coaches WHERE coach_id = ?').all(sc.coachId).forEach((r) => emails.add(String(r.client_email).toLowerCase())); } catch (_) { /* ignore */ }
        if (!emails.has(email)) return res.status(403).json({ ok: false, error: 'Ce client n’est pas dans ton groupe.' });
      }
      const n = clientAuth.unlockPin(email);
      if (!n) return res.status(404).json({ ok: false, error: 'Client introuvable.' });
      res.json({ ok: true });
    } catch (e) { console.error('unlock-pin :', e); res.status(500).json({ ok: false, error: 'Déblocage impossible.' }); }
  });

  // Clients du coach connecté (admin = tous). Scopé par coach_id côté serveur.
  app.get('/nutrition/api/coach/clients', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const sc = req.nutritionScope;
      const order = " ORDER BY datetime(CASE WHEN updated_at != '' THEN updated_at ELSE created_at END) DESC";
      const cols = 'SELECT email, prenom, nom, data, coach_id, created_at, updated_at FROM nutrition_clients';
      let rows;
      if (sc.isAdmin) {
        rows = getDb().prepare(cols + order).all();
      } else {
        const emails = clientEmailsForCoach(sc.coachId); // référent + supplémentaires
        rows = emails.length
          ? getDb().prepare(cols + ' WHERE email IN (' + emails.map(() => '?').join(',') + ')' + order).all(...emails)
          : [];
      }
      const coachMap = {};
      try { getDb().prepare('SELECT id, name FROM coaches WHERE archived = 0').all().forEach((c) => { coachMap[c.id] = c.name; }); } catch (_) { /* ignore */ }
      const clients = rows.map((r) => {
        let objectif = '', hasPlan = false, savedAt = '';
        try {
          const d = r.data ? JSON.parse(r.data) : null;
          if (d) { hasPlan = !!d.plan; objectif = (d.profil && (d.profil.objectif || d.profil.but)) || ''; savedAt = d.savedAt || ''; }
        } catch (_) { /* illisible */ }
        return { email: r.email, prenom: r.prenom, nom: r.nom, createdAt: r.created_at, updatedAt: r.updated_at, objectif, hasPlan, savedAt, coachId: r.coach_id || null, coachName: (r.coach_id && coachMap[r.coach_id]) || null };
      });
      // ── Signaux pour la pastille d'état (requêtes GROUPÉES, jamais une par client) :
      //    pesées officielles présentes + jour de challenge + adhérence moyenne 14 j.
      const emailsList = clients.map((c) => c.email);
      if (emailsList.length) {
        const inClause = '(' + emailsList.map(() => '?').join(',') + ')';
        const peseeMap = {};
        try {
          getDb().prepare("SELECT client_email, type, date FROM nutrition_parcours_pesees WHERE type IN ('depart','s3','s6') AND client_email IN " + inClause).all(...emailsList)
            .forEach((r) => { const m = peseeMap[r.client_email] || (peseeMap[r.client_email] = {}); m[r.type] = true; if (r.type === 'depart') m.departDate = r.date; });
        } catch (_) { /* pas de pesées -> pas de signal pesée */ }
        const adhMap = {};
        try {
          const since = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
          getDb().prepare("SELECT client_email, ROUND(AVG(score)) score FROM nutrition_adherence WHERE date >= ? AND client_email IN " + inClause + ' GROUP BY client_email').all(since, ...emailsList)
            .forEach((r) => { adhMap[r.client_email] = r.score; });
        } catch (_) { /* pas d'adhérence -> score null */ }
        const metaMap = {};
        try {
          getDb().prepare('SELECT client_email, ville, challenge_no FROM nutrition_client_meta WHERE client_email IN ' + inClause).all(...emailsList)
            .forEach((r) => { metaMap[r.client_email] = { ville: r.ville || '', challengeNo: r.challenge_no || 0 }; });
        } catch (_) { /* pas de meta -> valeurs par défaut */ }
        const jourChallenge = (dateStr) => { const t = Date.parse(dateStr); if (isNaN(t)) return null; return Math.min(42, Math.max(1, Math.floor((Date.now() - t) / 864e5) + 1)); };
        clients.forEach((c) => {
          const pm = peseeMap[c.email] || {};
          c.pesees = { depart: !!pm.depart, s3: !!pm.s3, s6: !!pm.s6 };
          c.challengeDay = pm.departDate ? jourChallenge(pm.departDate) : null;
          c.adhScore = (c.email in adhMap) ? adhMap[c.email] : null;
          const mm = metaMap[c.email] || {};
          c.ville = mm.ville || '';
          c.challengeNo = mm.challengeNo || 0;
        });
      }
      res.json({ ok: true, total: clients.length, scope: sc.isAdmin ? 'admin' : 'coach', clients });
    } catch (e) {
      console.error('Erreur /nutrition/api/coach/clients :', e);
      res.status(500).json({ ok: false, error: 'Lecture impossible.' });
    }
  });

  // Fiche détaillée d'un client (coach = uniquement SES clients ; admin = tous). Identité
  // par email : profil/objectif/pesées viennent du blob `data` (clé email, propre) ; le suivi
  // récent (adhérence/aide) est scopé via `client_email` désormais rempli sur les tables legacy.
  // Coach/admin : supprimer définitivement un client (compte + toutes ses données).
  app.delete('/nutrition/api/coach/clients/:email', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const sc = req.nutritionScope;
      const email = String(req.params.email || '').trim().toLowerCase();
      if (!email) return res.status(400).json({ ok: false, error: 'Email manquant.' });
      if (!sc.isAdmin && !coachSeesClient(sc.coachId, email)) return res.status(403).json({ ok: false, error: 'Client non attribué.' });
      const db = getDb();
      const del = (sql, ...args) => { try { db.prepare(sql).run(...args); } catch (_) { /* table absente -> on ignore */ } };
      // Messages (via les conversations du client) puis le reste des données personnelles.
      del('DELETE FROM nutrition_messages WHERE conversation_id IN (SELECT id FROM nutrition_conversations WHERE client_email = ?)', email);
      ['nutrition_conversations', 'nutrition_client_coaches', 'nutrition_client_meta', 'nutrition_ebook_reads',
        'nutrition_parcours_celebrations_seen', 'nutrition_parcours_mensurations', 'nutrition_parcours_pesees',
        'nutrition_parcours_photos', 'nutrition_parcours_seances', 'nutrition_adherence', 'nutrition_scans',
        'nutrition_help_requests', 'nutrition_push_subscriptions', 'nutrition_push_prefs', 'nutrition_push_queue',
        'nutrition_push_log', 'nutrition_push_flags', 'nutrition_push_coach_alerts',
        // Chemin du challenge : sans ça, un email recréé plus tard hériterait du
        // Punch, de la série et des nœuds déjà validés de l'ancien compte.
        'user_node_progress', 'user_game_stats', 'user_ebook_opens', 'user_bilan_seen',
        'user_node_flow', 'user_day_wins', 'user_bilan_texte',
      ].forEach((t) => del('DELETE FROM ' + t + ' WHERE client_email = ?', email));
      del('DELETE FROM nutrition_clients WHERE email = ?', email); // le compte (clé = email)
      try { sessions.purgeEmail(email); } catch (_) { /* accès coupé au plus tard à l'expiration du token */ }
      res.json({ ok: true });
    } catch (e) { console.error('coach client DELETE :', e); res.status(500).json({ ok: false, error: 'Suppression impossible.' }); }
  });
  // Coach/admin : ranger un client (ville + n° de challenge).
  // --- CONNEXION SIMPLIFIÉE : pré-création d'un client + codes de cohorte ---
  // (genAccessCode vient de clientAuth : 6 chiffres, parlable à l'oral.)

  // COACH/ADMIN : pré-crée l'espace d'un client (aucun lien à envoyer). Le client se
  // connectera avec email + prénom + nom + le CODE de sa cohorte, puis posera son PIN.
  app.post('/nutrition/api/coach/clients', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const sc = req.nutritionScope;
      const b = req.body || {};
      const email = String(b.email || '').trim().toLowerCase().slice(0, 160);
      const prenom = String(b.prenom || '').trim().slice(0, 80);
      const nom = String(b.nom || '').trim().slice(0, 80);
      if (!email || email.indexOf('@') < 1 || !prenom || !nom) return res.status(400).json({ ok: false, error: 'Email, prénom et nom requis.' });
      const exists = getDb().prepare('SELECT email FROM nutrition_clients WHERE email = ?').get(email);
      if (exists) return res.status(409).json({ ok: false, error: 'Ce client a déjà un espace.' });
      const ville = String(b.ville || '').trim().slice(0, 80);
      const challengeNo = Math.max(0, Math.min(999, Math.round(Number(b.challengeNo) || 0)));
      if (!ville) return res.status(400).json({ ok: false, error: 'La ville est requise (elle détermine le code du groupe).' });
      // Le coach ne peut créer que pour lui-même ; l'admin peut cibler un coach précis.
      const coachId = sc.isAdmin ? (Math.round(Number(b.coachId) || 0) || defaultNutritionCoachId()) : sc.coachId;
      const now = new Date().toISOString();
      // pin_hash vide + pre_created = 1 -> la 1re connexion exigera le code de la cohorte.
      getDb().prepare('INSERT INTO nutrition_clients (email, prenom, nom, data, pin_hash, coach_id, pre_created, created_at, updated_at) VALUES (?,?,?,?,?,?,1,?,?)')
        .run(email, prenom, nom, null, '', coachId, now, now);
      getDb().prepare('INSERT INTO nutrition_client_meta (client_email, ville, challenge_no, updated_at) VALUES (?,?,?,?) ON CONFLICT(client_email) DO UPDATE SET ville = excluded.ville, challenge_no = excluded.challenge_no, updated_at = excluded.updated_at')
        .run(email, ville, challengeNo, now);
      // Un code doit exister pour ce groupe, sinon le client ne pourra pas se connecter.
      let cr = getDb().prepare('SELECT code FROM nutrition_access_codes WHERE ville = ? AND challenge_no = ?').get(ville, challengeNo);
      if (!cr || !cr.code) {
        const code = genAccessCode();
        getDb().prepare('INSERT INTO nutrition_access_codes (ville, challenge_no, code, actif, updated_at) VALUES (?,?,?,1,?) ON CONFLICT(ville, challenge_no) DO UPDATE SET code = excluded.code, actif = 1, updated_at = excluded.updated_at')
          .run(ville, challengeNo, code, now);
        cr = { code };
      }
      res.json({ ok: true, email, prenom, nom, ville, challengeNo, code: cr.code });
    } catch (e) { console.error('coach clients POST :', e); res.status(500).json({ ok: false, error: 'Création impossible.' }); }
  });

  // COACH/ADMIN : lit (ou crée) le code d'une cohorte, à communiquer oralement au client.
  app.get('/nutrition/api/coach/access-codes', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const ville = String(req.query.ville || '').trim().slice(0, 80);
      const challengeNo = Math.max(0, Math.min(999, Math.round(Number(req.query.challengeNo) || 0)));
      if (!ville) {
        const rows = getDb().prepare('SELECT ville, challenge_no, code, actif, start_date FROM nutrition_access_codes ORDER BY ville, challenge_no').all();
        return res.json({ ok: true, codes: rows.map((r) => ({ ville: r.ville, challengeNo: r.challenge_no, code: r.code, actif: !!r.actif, startDate: r.start_date || '' })) });
      }
      const row = getDb().prepare('SELECT code, actif, start_date FROM nutrition_access_codes WHERE ville = ? AND challenge_no = ?').get(ville, challengeNo);
      res.json({ ok: true, ville, challengeNo, code: (row && row.code) || '', actif: !!(row && row.actif), startDate: (row && row.start_date) || '' });
    } catch (e) { console.error('access-codes GET :', e); res.status(500).json({ ok: false }); }
  });

  // COACH/ADMIN : (re)génère ou désactive le code d'une cohorte.
  app.post('/nutrition/api/coach/access-codes', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const b = req.body || {};
      const ville = String(b.ville || '').trim().slice(0, 80);
      const challengeNo = Math.max(0, Math.min(999, Math.round(Number(b.challengeNo) || 0)));
      if (!ville) return res.status(400).json({ ok: false, error: 'Ville requise.' });
      const ex = getDb().prepare('SELECT code, actif, start_date FROM nutrition_access_codes WHERE ville = ? AND challenge_no = ?').get(ville, challengeNo);
      // NON DESTRUCTIF : on ne régénère le code que si on le demande explicitement
      // (ou s'il n'en existe pas). Régler une date ne doit JAMAIS changer le code
      // du groupe — sinon les clients pas encore inscrits seraient largués.
      const code = b.regenerate ? genAccessCode()
        : (b.code ? String(b.code).trim().slice(0, 12) : ((ex && ex.code) || genAccessCode()));
      const actif = (b.actif === undefined) ? (ex ? ex.actif : 1) : (b.actif === false ? 0 : 1);
      // startDate : 'YYYY-MM-DD' pour lancer le groupe ce jour-là, '' pour retirer la
      // date (retour au démarrage individuel). Absent = on ne touche pas à l'existant.
      let startDate = ex ? (ex.start_date || '') : '';
      if (b.startDate !== undefined) {
        const s = String(b.startDate || '').trim();
        if (s && !/^\d{4}-\d{2}-\d{2}$/.test(s)) return res.status(400).json({ ok: false, error: 'Date invalide (attendu AAAA-MM-JJ).' });
        // ⚠️ UN CHALLENGE DÉMARRE UN LUNDI. On REFUSE plutôt que de corriger dans
        // le dos du coach : une date changée en silence lui ferait croire son
        // groupe lancé à une autre date que celle qu'il a annoncée à ses clients.
        // Le lundi le plus proche est proposé, il reste maître de la décision.
        if (s && !challengeCal.estLundi(s)) {
          const prop = challengeCal.lundiSuivant(s);
          return res.status(400).json({
            ok: false,
            error: 'Un challenge démarre un lundi. Le prochain lundi est le ' + prop.split('-').reverse().join('/') + '.',
            lundiPropose: prop,
          });
        }
        startDate = s;
      }
      getDb().prepare('INSERT INTO nutrition_access_codes (ville, challenge_no, code, actif, start_date, updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(ville, challenge_no) DO UPDATE SET code = excluded.code, actif = excluded.actif, start_date = excluded.start_date, updated_at = excluded.updated_at')
        .run(ville, challengeNo, code, actif, startDate, new Date().toISOString());
      res.json({ ok: true, ville, challengeNo, code, actif: !!actif, startDate });
    } catch (e) { console.error('access-codes POST :', e); res.status(500).json({ ok: false, error: 'Enregistrement impossible.' }); }
  });

  // ── GROUPES (cohortes) ─────────────────────────────────────────────────────
  // Un groupe = ville + n° de challenge (la clé partout ailleurs : nutrition_client_meta,
  // group_key des messages de communauté). La table nutrition_access_codes fait office
  // de registre des groupes : une ligne = un groupe, et son code = la porte d'entrée.
  // Avant, un groupe n'existait qu'à travers ses clients (il fallait créer un client
  // pour faire naître un groupe) ; ces routes permettent de le créer d'abord, vide.
  function groupKeyOf(ville, no) { return String(ville || '').trim().toLowerCase() + '#' + (Number(no) || 0); }
  function groupMemberCount(ville, no) {
    try {
      return getDb().prepare("SELECT COUNT(*) n FROM nutrition_client_meta WHERE LOWER(TRIM(ville)) = ? AND challenge_no = ?")
        .get(String(ville || '').trim().toLowerCase(), Number(no) || 0).n;
    } catch (_) { return 0; }
  }

  // Liste des groupes AVEC leur effectif — y compris les groupes encore vides,
  // que la liste de clients du coach ne peut pas montrer.
  app.get('/nutrition/api/coach/groups', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const rows = getDb().prepare('SELECT ville, challenge_no, code, actif, start_date FROM nutrition_access_codes ORDER BY challenge_no DESC, ville').all();
      const groups = rows.map((r) => ({
        ville: r.ville,
        challengeNo: r.challenge_no,
        code: r.code || '',
        actif: !!r.actif,
        startDate: r.start_date || '',
        membres: groupMemberCount(r.ville, r.challenge_no),
      }));
      res.json({ ok: true, groups });
    } catch (e) { console.error('groups GET :', e); res.status(500).json({ ok: false }); }
  });

  // Crée un groupe vide + son code de connexion UNIQUE (généré automatiquement).
  app.post('/nutrition/api/coach/groups', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const b = req.body || {};
      const ville = String(b.ville || '').trim().slice(0, 80);
      const challengeNo = Math.max(0, Math.min(999, Math.round(Number(b.challengeNo) || 0)));
      if (!ville) return res.status(400).json({ ok: false, error: 'Ville requise.' });
      if (!challengeNo) return res.status(400).json({ ok: false, error: 'Numéro de challenge requis.' });
      let startDate = String(b.startDate || '').trim();
      if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return res.status(400).json({ ok: false, error: 'Date invalide (attendu AAAA-MM-JJ).' });
      // Doublon : on compare sur la clé normalisée, pas sur la casse saisie —
      // « lyon » et « Lyon » sont le MÊME groupe partout ailleurs.
      const dup = getDb().prepare("SELECT ville, challenge_no FROM nutrition_access_codes WHERE LOWER(TRIM(ville)) = ? AND challenge_no = ?")
        .get(ville.toLowerCase(), challengeNo);
      if (dup) return res.status(409).json({ ok: false, error: 'Ce groupe existe déjà : ' + dup.ville + ' · Challenge n°' + dup.challenge_no + '.' });
      const code = genAccessCode(); // unique : vérifié contre les codes déjà attribués
      getDb().prepare('INSERT INTO nutrition_access_codes (ville, challenge_no, code, actif, start_date, updated_at) VALUES (?,?,?,1,?,?)')
        .run(ville, challengeNo, code, startDate, new Date().toISOString());
      res.json({ ok: true, group: { ville, challengeNo, code, actif: true, startDate, membres: 0 } });
    } catch (e) { console.error('groups POST :', e); res.status(500).json({ ok: false, error: 'Création impossible.' }); }
  });

  // Renomme un groupe (faute de frappe sur la ville, mauvais n°). La clé du groupe
  // étant recopiée dans les fiches clients ET dans le group_key des messages, il faut
  // déplacer les trois d'un bloc — sinon les membres se retrouvent orphelins.
  app.post('/nutrition/api/coach/groups/rename', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const b = req.body || {};
      const ville = String(b.ville || '').trim().slice(0, 80);
      const challengeNo = Math.max(0, Math.min(999, Math.round(Number(b.challengeNo) || 0)));
      const newVille = String(b.newVille || '').trim().slice(0, 80);
      const newNo = Math.max(0, Math.min(999, Math.round(Number(b.newChallengeNo) || 0)));
      if (!ville || !newVille) return res.status(400).json({ ok: false, error: 'Ville requise.' });
      if (!newNo) return res.status(400).json({ ok: false, error: 'Numéro de challenge requis.' });
      const row = getDb().prepare('SELECT code, actif, start_date FROM nutrition_access_codes WHERE ville = ? AND challenge_no = ?').get(ville, challengeNo);
      if (!row) return res.status(404).json({ ok: false, error: 'Groupe introuvable.' });
      const meme = groupKeyOf(ville, challengeNo) === groupKeyOf(newVille, newNo);
      if (!meme) {
        const dup = getDb().prepare("SELECT 1 FROM nutrition_access_codes WHERE LOWER(TRIM(ville)) = ? AND challenge_no = ?")
          .get(newVille.toLowerCase(), newNo);
        if (dup) return res.status(409).json({ ok: false, error: 'Un autre groupe porte déjà ce nom.' });
      }
      const now = new Date().toISOString();
      getDb().transaction(() => {
        getDb().prepare('UPDATE nutrition_access_codes SET ville = ?, challenge_no = ?, updated_at = ? WHERE ville = ? AND challenge_no = ?')
          .run(newVille, newNo, now, ville, challengeNo);
        getDb().prepare("UPDATE nutrition_client_meta SET ville = ?, challenge_no = ?, updated_at = ? WHERE LOWER(TRIM(ville)) = ? AND challenge_no = ?")
          .run(newVille, newNo, now, ville.toLowerCase(), challengeNo);
        try {
          getDb().prepare('UPDATE nutrition_community_messages SET group_key = ? WHERE group_key = ?')
            .run(groupKeyOf(newVille, newNo), groupKeyOf(ville, challengeNo));
        } catch (_) { /* mur de communauté absent : le renommage reste valide */ }
      })();
      res.json({ ok: true, group: { ville: newVille, challengeNo: newNo, code: row.code || '', actif: !!row.actif, startDate: row.start_date || '', membres: groupMemberCount(newVille, newNo) } });
    } catch (e) { console.error('groups rename :', e); res.status(500).json({ ok: false, error: 'Renommage impossible.' }); }
  });

  // Supprime un groupe — refusé s'il a encore des membres (on ne largue personne).
  // Pour fermer un groupe plein : le désactiver (POST access-codes { actif:false }).
  app.delete('/nutrition/api/coach/groups', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const b = req.body || {};
      const ville = String(b.ville || req.query.ville || '').trim().slice(0, 80);
      const challengeNo = Math.max(0, Math.min(999, Math.round(Number(b.challengeNo || req.query.challengeNo) || 0)));
      if (!ville) return res.status(400).json({ ok: false, error: 'Ville requise.' });
      const n = groupMemberCount(ville, challengeNo);
      if (n) return res.status(409).json({ ok: false, error: 'Ce groupe compte ' + n + ' membre(s) : désactive son code plutôt que de le supprimer.' });
      const info = getDb().prepare('DELETE FROM nutrition_access_codes WHERE ville = ? AND challenge_no = ?').run(ville, challengeNo);
      if (!info.changes) return res.status(404).json({ ok: false, error: 'Groupe introuvable.' });
      res.json({ ok: true });
    } catch (e) { console.error('groups DELETE :', e); res.status(500).json({ ok: false, error: 'Suppression impossible.' }); }
  });

  app.post('/nutrition/api/coach/clients/:email/meta', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const sc = req.nutritionScope;
      const email = String(req.params.email || '').trim().toLowerCase();
      if (!email) return res.status(400).json({ ok: false, error: 'Email manquant.' });
      if (!sc.isAdmin && !coachSeesClient(sc.coachId, email)) return res.status(403).json({ ok: false, error: 'Client non attribué.' });
      const b = req.body || {};
      const ville = String(b.ville || '').trim().slice(0, 80);
      const challengeNo = Math.max(0, Math.min(999, Math.round(Number(b.challengeNo) || 0)));
      getDb().prepare('INSERT INTO nutrition_client_meta (client_email, ville, challenge_no, updated_at) VALUES (?,?,?,?) ON CONFLICT(client_email) DO UPDATE SET ville = excluded.ville, challenge_no = excluded.challenge_no, updated_at = excluded.updated_at')
        .run(email, ville, challengeNo, new Date().toISOString());
      res.json({ ok: true, ville, challengeNo });
    } catch (e) { console.error('coach client meta POST :', e); res.status(500).json({ ok: false, error: 'Enregistrement impossible.' }); }
  });
  app.get('/nutrition/api/coach/clients/:email', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const sc = req.nutritionScope;
      const email = String(req.params.email || '').trim();
      if (!email) return res.status(400).json({ ok: false, error: 'Email manquant.' });
      const row = getDb().prepare('SELECT email, prenom, nom, data, coach_id, created_at, updated_at, pin_locked FROM nutrition_clients WHERE email = ?').get(email);
      if (!row) return res.status(404).json({ ok: false, error: 'Client introuvable.' });
      if (!sc.isAdmin && !coachSeesClient(sc.coachId, email)) return res.status(403).json({ ok: false, error: 'Client non attribué.' });

      let profil = {}, objectif = '', hasPlan = false, planJours = 0, savedAt = '', startDate = '';
      let pesees = [];
      try {
        const d = row.data ? JSON.parse(row.data) : null;
        if (d) {
          profil = d.profil || {};
          objectif = (profil.objectif || profil.but) || '';
          hasPlan = !!d.plan;
          planJours = (d.plan && Array.isArray(d.plan.jours) && d.plan.jours.length) || 0;
          savedAt = d.savedAt || '';
          startDate = d.startDate || '';
          pesees = Array.isArray(d.pesees) ? d.pesees.slice(-12).map((p) => ({ ts: p.ts || 0, poids: p.poids, masse_musculaire: p.masse_musculaire, fatigue: p.fatigue })) : [];
        }
      } catch (_) { /* data illisible -> fiche minimale */ }

      // Profil épuré (on ne renvoie que des champs d'affichage, pas tout le blob).
      const profilPublic = {
        sexe: profil.sexe || '', age: profil.age || '', taille: profil.taille || '',
        poidsDepart: profil.poids || profil.poids_depart || '', poidsCible: profil.poids_cible || profil.objectif_poids || '',
        activite: profil.activite || '', allergies: Array.isArray(profil.allergies) ? profil.allergies : [],
        regimes: Array.isArray(profil.regimes) ? profil.regimes : (Array.isArray(profil.regime) ? profil.regime : []),
        ajustementKcal: Math.round(Number(profil.ajustementKcal) || 0),
      };

      const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
      let adherence = [], help = [], scansCount = 0;
      try {
        adherence = getDb().prepare("SELECT date, suivi, adapte, autre, saute, score FROM nutrition_adherence WHERE client_email = ? AND date >= ? ORDER BY date DESC LIMIT 14").all(email, since);
      } catch (_) { /* ignore */ }
      try {
        help = getDb().prepare("SELECT created_at, difficultes, message, statut FROM nutrition_help_requests WHERE client_email = ? ORDER BY id DESC LIMIT 5").all(email)
          .map((h) => ({ createdAt: h.created_at, statut: h.statut, message: h.message, difficultes: (() => { try { return JSON.parse(h.difficultes); } catch (_) { return []; } })() }));
      } catch (_) { /* ignore */ }
      try { scansCount = getDb().prepare("SELECT COUNT(*) AS n FROM nutrition_scans WHERE client_email = ?").get(email).n; } catch (_) { /* ignore */ }

      const adhDays = adherence.length;
      const adhScore = adhDays ? Math.round(adherence.reduce((s, a) => s + (a.score || 0), 0) / adhDays) : null;

      let ville = '', challengeNo = 0;
      try { const mm = getDb().prepare('SELECT ville, challenge_no FROM nutrition_client_meta WHERE client_email = ?').get(email); if (mm) { ville = mm.ville || ''; challengeNo = mm.challenge_no || 0; } } catch (_) { /* pas de meta */ }
      res.json({
        ok: true,
        client: {
          email: row.email, prenom: row.prenom, nom: row.nom, coachId: row.coach_id || null,
          createdAt: row.created_at, updatedAt: row.updated_at,
          objectif, hasPlan, planJours, savedAt, startDate,
          profil: profilPublic, pesees, adherence, adhScore, adhDays,
          help, scansCount, ville, challengeNo, pinLocked: !!row.pin_locked,
        },
      });
    } catch (e) {
      console.error('Erreur fiche client :', e);
      res.status(500).json({ ok: false, error: 'Lecture impossible.' });
    }
  });

  // Gestion du code démo (administrateur principal).
  app.get('/nutrition/api/demo-config', requireAuth, requireAdmin, (req, res) => {
    const cfg = getDemoConfig();
    const accesses = getDb().prepare('SELECT accessed_at FROM nutrition_demo_access ORDER BY id DESC LIMIT 10').all().map((r) => r.accessed_at);
    res.json({ ok: true, code: cfg.code, enabled: !!cfg.enabled, expiresAt: cfg.expires_at, uses: cfg.uses, accesses });
  });
  app.post('/nutrition/api/demo-config', requireAuth, requireAdmin, (req, res) => {
    try {
      const b = req.body || {};
      const cur = getDemoConfig();
      const code = b.code != null ? String(b.code).trim().slice(0, 60) : cur.code;
      if (!code) return res.status(400).json({ ok: false, error: 'Code requis.' });
      const enabled = b.enabled != null ? (b.enabled ? 1 : 0) : cur.enabled;
      const expires = ('expiresAt' in b) ? (b.expiresAt ? String(b.expiresAt).slice(0, 10) : null) : cur.expires_at;
      getDb().prepare('UPDATE nutrition_demo SET code = ?, enabled = ?, expires_at = ? WHERE id = 1').run(code, enabled, expires || null);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ ok: false, error: 'Mise à jour impossible.' }); }
  });
  app.post('/nutrition/api/demo-reset', requireAuth, requireAdmin, (req, res) => {
    getDb().prepare('UPDATE nutrition_demo SET uses = 0 WHERE id = 1').run();
    getDb().prepare('DELETE FROM nutrition_demo_access').run();
    res.json({ ok: true });
  });

  // ⚠️ DESTRUCTIF : réinitialise TOUTES les données clients de la nutrition (pour un
  // lancement propre). Efface les comptes clients + tout leur suivi/communauté/messages.
  // GARDE le CONTENU/CONFIG : réponses du coach (FAQ), options rapides, photos des plats,
  // code démo. Ne touche RIEN des apps commerciale/coaching. Admin uniquement + double
  // garde (body.confirm === 'RESET').
  app.post('/nutrition/api/admin/reset-clients', requireAuth, requireAdmin, (req, res) => {
    try {
      if (String((req.body || {}).confirm || '') !== 'RESET') {
        return res.status(400).json({ ok: false, error: 'Confirmation requise (RESET).' });
      }
      const db = getDb();
      const tables = [
        'nutrition_clients', 'nutrition_adherence', 'nutrition_help_requests',
        'nutrition_scans', 'nutrition_scan_advice', 'nutrition_plate_analysis',
        'nutrition_google_token', 'nutrition_parcours_pesees', 'nutrition_parcours_photos',
        'nutrition_parcours_seances', 'nutrition_parcours_mensurations', 'nutrition_community_messages', 'nutrition_community_reactions',
        'nutrition_community_events', 'nutrition_community_event_reactions', 'nutrition_community_comments',
        'nutrition_conversations', 'nutrition_messages', 'nutrition_message_audit', 'nutrition_demo_access',
        'nutrition_invites',
      ];
      const counts = {};
      const tx = db.transaction(() => {
        for (const t of tables) {
          try { counts[t] = db.prepare('DELETE FROM ' + t).run().changes; } catch (_) { counts[t] = 0; }
        }
      });
      tx();
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      console.warn('RESET données clients nutrition (admin) : ' + total + ' lignes supprimées.');
      res.json({ ok: true, total, counts });
    } catch (e) { console.error('reset-clients :', e); res.status(500).json({ ok: false, error: 'Réinitialisation impossible.' }); }
  });

  // --- Analyse d'assiette en photo : sauvegarde + vue coach ---
  app.post('/nutrition/api/plate-save', requireAuth, requireNutritionAccess, (req, res) => {
    try {
      const b = req.body || {};
      const n = (v) => { const x = Math.round(Number(v)); return (isFinite(x) && x >= 0) ? x : 0; };
      const coh = ['coherent', 'correct', 'reprendre'].includes(b.coherence) ? b.coherence : '';
      const thumb = (typeof b.thumb === 'string' && b.thumb.startsWith('data:image')) ? b.thumb.slice(0, 400000) : '';
      const info = getDb().prepare(`INSERT INTO nutrition_plate_analysis
        (client_name, client_email, created_at, meal_label, precision_txt, aliments, kcal, proteines, glucides, lipides, coherence, ia_comment, thumb, client_message, advice_statut)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        String(b.clientName || req.session.name || 'Client').slice(0, 120), (req.session && req.session.email) || '', new Date().toISOString(),
        String(b.mealLabel || '').slice(0, 80), String(b.precision || '').slice(0, 300),
        JSON.stringify(Array.isArray(b.aliments) ? b.aliments.slice(0, 12) : []),
        n(b.kcal), n(b.proteines), n(b.glucides), n(b.lipides), coh,
        JSON.stringify({ pointPositif: String(b.pointPositif || '').slice(0, 240), axe: String(b.axe || '').slice(0, 240), action: String(b.action || '').slice(0, 240), coherencePlan: String(b.coherencePlan || '').slice(0, 240) }),
        thumb, String(b.clientMessage || '').slice(0, 500), b.askCoach ? 'a_traiter' : ''
      );
      const moi = (req.session && req.session.email) || '';
      const reward = awardClientEvent(moi, 'plate', info.lastInsertRowid); // nœud "photo d'assiette"
      res.json({ ok: true, id: info.lastInsertRowid, reward, state: moi ? challengePublicState(moi) : null });
    } catch (e) { console.error('Erreur plate-save :', e); res.status(500).json({ ok: false, error: 'Enregistrement impossible.' }); }
  });
  app.get('/nutrition/api/plate-analyses', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const sc = coachLegacyScope(req.nutritionScope, 'client_email');
      const rows = getDb().prepare('SELECT * FROM nutrition_plate_analysis' + sc.where + ' ORDER BY id DESC LIMIT 100').all(...sc.params);
      const items = rows.map((r) => ({
        id: r.id, clientName: r.client_name, createdAt: r.created_at, mealLabel: r.meal_label,
        precision: r.precision_txt, aliments: (() => { try { return JSON.parse(r.aliments); } catch (_) { return []; } })(),
        kcal: r.kcal, proteines: r.proteines, glucides: r.glucides, lipides: r.lipides, coherence: r.coherence,
        iaComment: (() => { try { return JSON.parse(r.ia_comment); } catch (_) { return {}; } })(),
        thumb: r.thumb, clientMessage: r.client_message, adviceStatut: r.advice_statut,
      }));
      res.json({ ok: true, items });
    } catch (e) { console.error('Erreur plate-analyses :', e); res.status(500).json({ ok: false, error: 'Lecture impossible.' }); }
  });
  app.patch('/nutrition/api/plate-advice/:id', requireAuth, requireCoachOrAdmin, (req, res) => {
    try {
      const statut = String((req.body || {}).statut || '');
      if (!['a_traiter', 'en_cours', 'traite'].includes(statut)) return res.status(400).json({ ok: false, error: 'Statut invalide.' });
      const sc = req.nutritionScope;
      const id = Number(req.params.id);
      if (!sc.isAdmin) {
        const row = getDb().prepare('SELECT client_email FROM nutrition_plate_analysis WHERE id = ?').get(id);
        if (!row) return res.status(404).json({ ok: false, error: 'Analyse introuvable.' });
        const owned = row.client_email && coachSeesClient(sc.coachId, row.client_email);
        if (!owned) return res.status(403).json({ ok: false, error: 'Analyse non attribuée.' });
      }
      const info = getDb().prepare('UPDATE nutrition_plate_analysis SET advice_statut = ? WHERE id = ?').run(statut, id);
      res.json({ ok: info.changes > 0 });
    } catch (e) { res.status(500).json({ ok: false, error: 'Mise à jour impossible.' }); }
  });

  // --- Google Agenda : statut / connexion OAuth / sync / deconnexion ---
  app.get('/nutrition/api/google/status', requireAuth, requireNutritionUse, (req, res) => {
    const row = getDb().prepare('SELECT calendar_name FROM nutrition_google_token WHERE client_name = ?').get(googleClientKey(req));
    res.json({ ok: true, configured: googleConfigured(), connected: !!row, calendarName: row ? row.calendar_name : '' });
  });
  app.get('/nutrition/api/google/connect', requireAuth, requireNutritionUse, (req, res) => {
    if (!googleConfigured()) return res.json({ ok: false, configured: false });
    const c = googleCfg();
    const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
      client_id: c.id, redirect_uri: c.redirect, response_type: 'code', scope: GOOGLE_SCOPE,
      access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true',
      state: signState({ n: googleClientKey(req), t: Date.now() }),
    });
    res.json({ ok: true, configured: true, url });
  });
  // Retour OAuth (navigation navigateur -> pas de Bearer). Page qui se referme.
  app.get('/nutrition/api/google/callback', async (req, res) => {
    const page = (msg, ok) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:Inter,system-ui,sans-serif;background:#F7F3EC;color:#1F2328;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;margin:0"><div style="max-width:320px;padding:24px"><div style="width:60px;height:60px;border-radius:50%;margin:0 auto 14px;background:${ok ? '#E7F7EE' : '#FDECEC'};display:flex;align-items:center;justify-content:center;font-size:28px">${ok ? '✓' : '×'}</div><h2 style="margin:0 0 6px;font-size:19px">${msg}</h2><p style="color:#6B7280;font-size:14px;margin:0">Vous pouvez fermer cette fenetre.</p></div><script>try{if(window.opener)window.opener.postMessage('mcn-google-${ok ? 'connected' : 'error'}','*')}catch(e){}setTimeout(function(){window.close()},1400)</script></body></html>`;
    try {
      if (req.query.error || !req.query.code) return res.send(page('Connexion annulee.', false));
      const st = verifyState(req.query.state); if (!st) return res.send(page('Lien invalide ou expire.', false));
      const c = googleCfg();
      const tok = await googleTokenRequest({ code: req.query.code, client_id: c.id, client_secret: c.secret, redirect_uri: c.redirect, grant_type: 'authorization_code' });
      if (!tok.access_token) return res.send(page('La connexion a echoue.', false));
      const expiry = Date.now() + (tok.expires_in || 3600) * 1000;
      let calId = '', calName = 'My Coach Nutrition';
      try { const cr = await gcal(tok.access_token, 'POST', '/calendars', { summary: 'My Coach Nutrition' }); if (cr.status < 300 && cr.json.id) { calId = cr.json.id; calName = cr.json.summary || calName; } } catch (_) { /* fallback */ }
      if (!calId) { calId = 'primary'; calName = 'Agenda principal'; }
      getDb().prepare(`INSERT INTO nutrition_google_token (client_name, access_token, refresh_token, expiry, calendar_id, calendar_name, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(client_name) DO UPDATE SET access_token = excluded.access_token,
          refresh_token = CASE WHEN excluded.refresh_token != '' THEN excluded.refresh_token ELSE nutrition_google_token.refresh_token END,
          expiry = excluded.expiry, calendar_id = excluded.calendar_id, calendar_name = excluded.calendar_name, updated_at = excluded.updated_at`)
        .run(st.n, tok.access_token, tok.refresh_token || '', expiry, calId, calName, new Date().toISOString());
      res.send(page('Google Agenda connecte !', true));
    } catch (e) { console.error('google callback :', e); res.send(page('Erreur de connexion.', false)); }
  });
  app.post('/nutrition/api/google/sync', requireAuth, requireNutritionUse, async (req, res) => {
    try {
      const { scope = 'semaine', plan, planId, dinerTard } = req.body || {};
      const tokRow = await googleValidToken(googleClientKey(req));
      if (!tokRow) return res.json({ ok: false, error: 'not_connected' });
      const events = buildPlanEvents(plan, scope, planId || 'plan', !!dinerTard);
      if (!events.length) return res.json({ ok: false, error: 'empty' });
      let count = 0, fail = 0;
      for (const ev of events) {
        const calPath = '/calendars/' + encodeURIComponent(tokRow.calendar_id) + '/events';
        const ins = await gcal(tokRow.access_token, 'POST', calPath, ev);
        if (ins.status === 409) { const up = await gcal(tokRow.access_token, 'PUT', calPath + '/' + ev.id, ev); if (up.status < 300) count++; else fail++; }
        else if (ins.status < 300) count++; else fail++;
      }
      res.json({ ok: count > 0, count, fail, calendarName: tokRow.calendar_name });
    } catch (e) { console.error('google sync :', e); res.status(500).json({ ok: false, error: 'sync' }); }
  });
  app.post('/nutrition/api/google/disconnect', requireAuth, requireNutritionUse, (req, res) => {
    getDb().prepare('DELETE FROM nutrition_google_token WHERE client_name = ?').run(googleClientKey(req));
    res.json({ ok: true });
  });

  // Génération / lecture du module : admin OU session démo (les routes coach
  // ci-dessus restent en requireAdmin). Les écritures client (help/scan/adherence)
  // sont en requireNutritionAccess et ne sont jamais appelées en mode démo.
  app.use('/nutrition/api', requireAuth, requireNutritionUse);
  // Le moteur d'avatar est servi au navigateur depuis lib/ — PAS de copie dans
  // public/ : une seule source, donc l'aperçu de l'éditeur ne peut pas dériver
  // du SVG que le serveur rend pour les autres membres.
  app.get('/nutrition/avatar.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.sendFile(path.join(__dirname, 'nutrition-app', 'lib', 'avatar.js'));
  });
  app.use('/nutrition', nutritionApp);                  // sert le module (pages + statique)
} catch (e) {
  console.warn('Module Nutrition non chargé :', e.message);
}

// ─── Week-Month Majority Helper ─────────────────────────────
// A week (Mon-Sun) belongs to the month where the majority of its 7 days fall.
// e.g. March 30 → April 5 = 2 days in March, 5 in April → counts as April.
// Uses pure arithmetic (no Date objects) to avoid timezone/DST issues.
const _pad2 = n => String(n).padStart(2, '0');

// Days in a given month (1-indexed)
function _daysInMonth(year, month) {
  // month is 1-12
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// Day of week for a date (0=Sun, 1=Mon, ... 6=Sat) — Zeller-like via UTC
function _dayOfWeek(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Add days to a {y,m,d} date, returns {y,m,d}
function _addDays(y, m, d, n) {
  const ms = Date.UTC(y, m - 1, d) + n * 86400000;
  const dt = new Date(ms);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function _dateStr(y, m, d) {
  return `${y}-${_pad2(m)}-${_pad2(d)}`;
}

function getWeekStartsForMonth(month) {
  const year = parseInt(month.split('-')[0]);
  const mon = parseInt(month.split('-')[1]);
  const lastDayNum = _daysInMonth(year, mon);

  // Find Monday on or before (firstOfMonth - 6 days) to catch overlapping weeks
  let s = _addDays(year, mon, 1, -6);
  while (_dayOfWeek(s.y, s.m, s.d) !== 1) {
    s = _addDays(s.y, s.m, s.d, -1);
  }

  const result = [];
  let cur = { ...s };
  // Loop while cur <= last day of month
  while (cur.y < year || (cur.y === year && cur.m < mon) || (cur.y === year && cur.m === mon && cur.d <= lastDayNum)) {
    let daysInMonth = 0;
    for (let i = 0; i < 7; i++) {
      const dd = _addDays(cur.y, cur.m, cur.d, i);
      if (dd.y === year && dd.m === mon) daysInMonth++;
    }
    if (daysInMonth >= 4) result.push(_dateStr(cur.y, cur.m, cur.d));
    cur = _addDays(cur.y, cur.m, cur.d, 7);
  }
  return result;
}

// Returns the date range covered by a set of week_starts (each week = 7 days)
function getDateRangeFromWeeks(weekStarts) {
  if (!weekStarts.length) return { from: '9999-12-31', to: '0000-01-01' };
  const first = weekStarts[0];
  const last = weekStarts[weekStarts.length - 1];
  const [ly, lm, ld] = last.split('-').map(Number);
  const end = _addDays(ly, lm, ld, 6);
  return { from: first, to: _dateStr(end.y, end.m, end.d) };
}

// ─── Auth Routes ────────────────────────────────────────────

app.post('/api/auth/login', (req, res) => {
  const { pin } = req.body;
  if (!pin || typeof pin !== 'string' || !pin.trim()) {
    return res.status(400).json({ error: 'Code PIN requis' });
  }

  const db = getDb();
  // Lecture du PIN admin depuis la DB (fallback env var)
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('admin_pin');
  const adminPin = (row && row.value) || process.env.ADMIN_PIN || 'ginkgo';

  // Check admin PIN
  if (pin.trim() === adminPin) {
    const token = crypto.randomUUID();
    sessions.set(token, { role: 'admin', name: 'Stan', sales_rep_id: null });
    return res.json({ token, role: 'admin', name: 'Stan', sales_rep_id: null });
  }

  // Check consultant code (accès Pilotage en lecture seule + commentaires)
  // Code en dur (peut être surchargé par PILOTAGE_CONSULTANT_PIN dans .env).
  // Nom affiché à l'écran et utilisé comme auteur des commentaires = « Mathieu ».
  const consultantPin = process.env.PILOTAGE_CONSULTANT_PIN || 'MJJ#MCG';
  if (pin.trim() === consultantPin) {
    const token = crypto.randomUUID();
    sessions.set(token, { role: 'consultant', name: 'Mathieu', sales_rep_id: null });
    return res.json({ token, role: 'consultant', name: 'Mathieu', sales_rep_id: null });
  }

  // Check Standards admin PINs : superviseurs métier en lecture seule sur
  // TOUS les studios et TOUS les jours. Aucun pouvoir de modification.
  const STANDARDS_VIEWER_PINS = {
    [process.env.STANDARDS_ADMIN_PIN_1 || 'marvindr']: 'Marvin',
    [process.env.STANDARDS_ADMIN_PIN_2 || 'quentinamc']: 'Quentin',
  };
  const stdViewerName = STANDARDS_VIEWER_PINS[pin.trim()];
  if (stdViewerName) {
    const token = crypto.randomUUID();
    sessions.set(token, { role: 'standards_admin', name: stdViewerName, sales_rep_id: null });
    return res.json({ token, role: 'standards_admin', name: stdViewerName, sales_rep_id: null });
  }

  // Mots de passe uniques des pages /standard par club : « tours » ouvre la
  // prise de poste de Tours, « veigne » celle de Veigné. Session équivalente
  // à un coach leader du studio (jour courant uniquement, pas d'historique,
  // les deux rangées modifiables). Surchargables via STANDARD_PAGE_PIN_*.
  const STANDARD_PAGE_PINS = {
    [String(process.env.STANDARD_PAGE_PIN_TOURS || 'tours').toLowerCase()]: 'Tours',
    [String(process.env.STANDARD_PAGE_PIN_VEIGNE || 'veigne').toLowerCase()]: 'Veigné',
  };
  const pageStudio = STANDARD_PAGE_PINS[pin.trim().toLowerCase()];
  if (pageStudio) {
    const token = crypto.randomUUID();
    const sess = {
      role: 'coach_leader', name: `Coach ${pageStudio}`, studio: pageStudio,
      can_view_history: false, coach_slot: null, sales_rep_id: null,
    };
    sessions.set(token, sess);
    return res.json({ token, ...sess });
  }

  // Check commercial / phoneur PIN
  const rep = db.prepare('SELECT id, name, role FROM sales_reps WHERE pin = ? AND archived = 0').get(pin.trim());
  if (rep) {
    const token = crypto.randomUUID();
    const role = rep.role || 'commercial';
    sessions.set(token, { role, name: rep.name, sales_rep_id: rep.id });
    return res.json({ token, role, name: rep.name, sales_rep_id: rep.id });
  }

  // Check coach LEADER PIN (table coach_leaders dédiée) — rôle : 'coach_leader'
  // can_view_history : 1 = leader complet (voit tout), 0 = assistant (today only)
  // coach_slot : NULL = voit tout, 1 ou 2 = ne voit que sa rangée
  const cl = db.prepare('SELECT id, name, studio, can_view_history, coach_slot FROM coach_leaders WHERE pin = ? AND archived = 0').get(pin.trim());
  if (cl) {
    const token = crypto.randomUUID();
    const canViewHistory = !!cl.can_view_history;
    const coachSlot = cl.coach_slot || null;
    sessions.set(token, { role: 'coach_leader', name: cl.name, coach_leader_id: cl.id, studio: cl.studio, can_view_history: canViewHistory, coach_slot: coachSlot, sales_rep_id: null });
    return res.json({ token, role: 'coach_leader', name: cl.name, coach_leader_id: cl.id, studio: cl.studio, can_view_history: canViewHistory, coach_slot: coachSlot, sales_rep_id: null });
  }

  // Check coach PIN (table coaches)
  const coach = db.prepare('SELECT id, name, role, studio, is_leader FROM coaches WHERE pin = ? AND archived = 0').get(pin.trim());
  if (coach) {
    const token = crypto.randomUUID();
    const role = coach.is_leader ? 'coach-leader' : (coach.role || 'coach');
    sessions.set(token, {
      role,
      name: coach.name,
      sales_rep_id: null,
      coach_id: coach.id,
      is_leader: !!coach.is_leader,
      studio: coach.studio
    });
    return res.json({
      token, role, name: coach.name, sales_rep_id: null,
      coach_id: coach.id, is_leader: !!coach.is_leader, studio: coach.studio
    });
  }

  // Check special role PINs from env (academy, director)
  const academyPin = process.env.ACADEMY_PIN;
  if (academyPin && pin.trim() === academyPin) {
    const token = crypto.randomUUID();
    sessions.set(token, { role: 'academy', name: 'Academy', sales_rep_id: null });
    return res.json({ token, role: 'academy', name: 'Academy', sales_rep_id: null });
  }
  const directorPin = process.env.DIRECTOR_PIN;
  if (directorPin && pin.trim() === directorPin) {
    const token = crypto.randomUUID();
    sessions.set(token, { role: 'director', name: 'Directeur', sales_rep_id: null });
    return res.json({ token, role: 'director', name: 'Directeur', sales_rep_id: null });
  }

  // Code Guest : reconnu mais pas de token immédiat. Le front affichera
  // un sous-formulaire pour saisir studio + prénom, puis appellera
  // /api/auth/guest-login pour finaliser.
  const guestCodeCheck = process.env.GUEST_CODE || 'guest';
  if (pin.trim() === guestCodeCheck) {
    return res.json({ guest_pending: true });
  }

  return res.status(401).json({ error: 'Code incorrect' });
});

// ─── Guest login ─────────────────────────────────────────────
// Personne extérieure qui passe occasionnellement dans un studio.
// Code partagé (env GUEST_CODE, défaut "guest"). À la connexion, on
// demande le studio + le prénom pour identifier le guest.
// Le guest a les mêmes droits qu'un assistant studio : photos
// quotidiennes seulement, modification du jour courant uniquement.
app.post('/api/auth/guest-login', (req, res) => {
  const pin = String((req.body && req.body.pin) || '').trim();
  const studio = String((req.body && req.body.studio) || '').trim();
  const name = String((req.body && req.body.name) || '').trim();
  const guestCode = process.env.GUEST_CODE || 'guest';
  if (!pin) return res.status(400).json({ error: 'Code requis' });
  if (pin !== guestCode) return res.status(401).json({ error: 'Code guest incorrect' });
  if (!studio) return res.status(400).json({ error: 'Studio requis' });
  if (!name || name.length < 2) return res.status(400).json({ error: 'Prénom requis (2 caractères min)' });
  // coach_slot optionnel : si fourni (1 ou 2) → guest filtré sur cette rangée
  let coachSlot = null;
  if (req.body && req.body.coach_slot != null) {
    const n = parseInt(req.body.coach_slot, 10);
    if (n === 1 || n === 2) coachSlot = n;
  }
  const token = crypto.randomUUID();
  const safeName = name.replace(/[<>"'`]/g, '').slice(0, 40);
  sessions.set(token, {
    role: 'guest',
    name: safeName,
    studio,
    can_view_history: false,
    coach_slot: coachSlot,
    sales_rep_id: null,
  });
  res.json({ token, role: 'guest', name: safeName, studio, can_view_history: false, coach_slot: coachSlot, sales_rep_id: null });
});

// ─── Change PIN ──────────────────────────────────────────────
// Le salarié connecté peut changer son propre code PIN. Le nouveau PIN
// doit être unique sur l'ensemble des tables (sales_reps, coaches,
// coach_leaders, admin) — l'admin garde la main car l'update va
// directement dans la même ligne qu'il gère côté admin.
//
// Rôles autorisés : admin, commercial, phoneur, coach, coach-leader,
// coach_leader. Rôles hardcodés (consultant, academy, director,
// standards_admin) ou éphémères (guest) ne peuvent pas changer leur PIN.
app.post('/api/auth/change-pin', requireAuth, (req, res) => {
  const current = String((req.body && req.body.current_pin) || '').trim();
  const next = String((req.body && req.body.new_pin) || '').trim();
  if (!current || !next) return res.status(400).json({ error: 'Code actuel et nouveau code requis' });
  if (next.length < 4) return res.status(400).json({ error: 'Le nouveau code doit faire au moins 4 caractères' });
  if (next.length > 32) return res.status(400).json({ error: 'Code trop long (32 caractères max)' });
  if (current === next) return res.status(400).json({ error: 'Le nouveau code doit être différent de l\'ancien' });

  const db = getDb();
  const role = req.session.role;
  const session = req.session;

  // Trouve la ligne du salarié + vérifie son code actuel
  let table, idCol, currentRow;
  if (role === 'admin') {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('admin_pin');
    const adminPin = (row && row.value) || process.env.ADMIN_PIN || 'ginkgo';
    if (current !== adminPin) return res.status(401).json({ error: 'Code actuel incorrect' });
    table = 'admin'; // marqueur spécial
  } else if (['commercial', 'phoneur'].includes(role) && session.sales_rep_id) {
    table = 'sales_reps'; idCol = session.sales_rep_id;
    currentRow = db.prepare('SELECT pin FROM sales_reps WHERE id = ? AND archived = 0').get(idCol);
  } else if (['coach', 'coach-leader'].includes(role) && session.coach_id) {
    table = 'coaches'; idCol = session.coach_id;
    currentRow = db.prepare('SELECT pin FROM coaches WHERE id = ? AND archived = 0').get(idCol);
  } else if (role === 'coach_leader' && session.coach_leader_id) {
    table = 'coach_leaders'; idCol = session.coach_leader_id;
    currentRow = db.prepare('SELECT pin FROM coach_leaders WHERE id = ? AND archived = 0').get(idCol);
  } else {
    return res.status(403).json({ error: 'Ton type de compte ne permet pas de changer le code en autonomie. Demande à l\'admin.' });
  }
  if (table !== 'admin') {
    if (!currentRow) return res.status(404).json({ error: 'Compte introuvable' });
    if (currentRow.pin !== current) return res.status(401).json({ error: 'Code actuel incorrect' });
  }

  // Unicité du nouveau code sur l'ensemble des tables (hors propre ligne)
  const adminRow = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('admin_pin');
  const adminPinActuel = (adminRow && adminRow.value) || process.env.ADMIN_PIN || 'ginkgo';
  if (table !== 'admin' && next === adminPinActuel) {
    return res.status(409).json({ error: 'Ce code est déjà utilisé' });
  }
  const takenSr = db.prepare('SELECT id FROM sales_reps WHERE pin = ? AND archived = 0' + (table === 'sales_reps' ? ' AND id != ?' : '')).get(...(table === 'sales_reps' ? [next, idCol] : [next]));
  const takenC  = db.prepare('SELECT id FROM coaches WHERE pin = ? AND archived = 0'    + (table === 'coaches'    ? ' AND id != ?' : '')).get(...(table === 'coaches'    ? [next, idCol] : [next]));
  const takenCl = db.prepare('SELECT id FROM coach_leaders WHERE pin = ? AND archived = 0' + (table === 'coach_leaders' ? ' AND id != ?' : '')).get(...(table === 'coach_leaders' ? [next, idCol] : [next]));
  if (takenSr || takenC || takenCl) return res.status(409).json({ error: 'Ce code est déjà utilisé' });

  // Update
  if (table === 'admin') {
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run('admin_pin', next);
  } else if (table === 'sales_reps') {
    db.prepare('UPDATE sales_reps SET pin = ? WHERE id = ?').run(next, idCol);
  } else if (table === 'coaches') {
    db.prepare('UPDATE coaches SET pin = ? WHERE id = ?').run(next, idCol);
  } else if (table === 'coach_leaders') {
    db.prepare('UPDATE coach_leaders SET pin = ? WHERE id = ?').run(next, idCol);
  }
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non connecté' });
  }
  const token = authHeader.slice(7);
  const session = sessions.get(token);
  if (!session) {
    return res.status(401).json({ error: 'Session expirée' });
  }
  res.json(session);
});

app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    sessions.delete(authHeader.slice(7));
  }
  res.json({ success: true });
});

// ─── P.R.E.L : uploads hebdomadaires + diff S vs S-1 ────────────
// Routes admin uniquement. Le parsing XLSX est fait côté client
// (SheetJS déjà chargé), le serveur reçoit du JSON normalisé.

app.post('/api/prel/upload', requireAuth, requireAdmin, (req, res) => {
  const { filename, rows, target_slot } = req.body || {};
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'rows array non vide requis' });
  }
  const targetSlot = ['cur', 'prev'].includes(String(target_slot || '').toLowerCase())
    ? String(target_slot).toLowerCase()
    : null;
  const db = getDb();
  // Calcule les couples (club × week_start) présents dans le nouveau fichier
  // pour REMPLACER les anciennes données de ces semaines (évite l'accumulation
  // si on ré-uploade le même fichier ou un fichier qui chevauche).
  const combos = new Set();
  for (const r of rows) {
    if (r && r.club && r.week_start) combos.add(`${r.club}|||${r.week_start}`);
  }
  const ins = db.prepare(`INSERT INTO prel_uploads (filename, rows_count) VALUES (?, 0)`).run(String(filename || 'inconnu'));
  const uploadId = ins.lastInsertRowid;
  const stmt = db.prepare(`
    INSERT INTO prel_rows (upload_id, club, week_start, id_client, id_prestation, membre, etat, echeance, ttc, vendeur, prestation, raison, tel, email)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const delStmt = db.prepare(`DELETE FROM prel_rows WHERE club = ? AND week_start = ?`);
  const clubs = new Set();
  let minWeek = null, maxWeek = null;
  let replacedCount = 0;
  const tx = db.transaction(() => {
    // 1. Purge les anciennes lignes pour chaque couple (club, week_start) ré-uploadé
    for (const combo of combos) {
      const [club, week] = combo.split('|||');
      const before = db.prepare(`SELECT COUNT(*) AS c FROM prel_rows WHERE club = ? AND week_start = ?`).get(club, week).c;
      delStmt.run(club, week);
      replacedCount += before;
    }
    // 2. Insère les nouvelles lignes
    for (const r of rows) {
      if (!r || !r.club || !r.week_start) continue;
      stmt.run(
        uploadId,
        String(r.club),
        String(r.week_start),
        Number.isInteger(r.id_client) ? r.id_client : null,
        Number.isInteger(r.id_prestation) ? r.id_prestation : null,
        r.membre || null,
        r.etat || null,
        r.echeance || null,
        (typeof r.ttc === 'number' && !Number.isNaN(r.ttc)) ? r.ttc : null,
        r.vendeur || null,
        r.prestation || null,
        r.raison || null,
        r.tel || null,
        r.email || null,
      );
      clubs.add(r.club);
      if (minWeek === null || r.week_start < minWeek) minWeek = r.week_start;
      if (maxWeek === null || r.week_start > maxWeek) maxWeek = r.week_start;
    }
    db.prepare(`UPDATE prel_uploads SET rows_count = ?, week_start_min = ?, week_start_max = ?, clubs_csv = ? WHERE id = ?`)
      .run(rows.length, minWeek, maxWeek, Array.from(clubs).join(','), uploadId);
  });
  tx();

  // Si l'upload cible un slot, on l'assigne automatiquement à la semaine
  // la plus représentée dans le fichier (en pratique : la semaine principale
  // du fichier — la majorité des lignes y tombent).
  let assignedSlot = null;
  let assignedWeek = null;
  if (targetSlot) {
    // Trouve la semaine majoritaire dans les rows insérés
    const weekCounts = {};
    for (const r of rows) {
      if (r && r.week_start) weekCounts[r.week_start] = (weekCounts[r.week_start] || 0) + 1;
    }
    const sortedWeeks = Object.entries(weekCounts).sort((a, b) => b[1] - a[1]);
    if (sortedWeeks.length > 0) {
      assignedWeek = sortedWeeks[0][0];
      prelSetSlot(db, targetSlot, assignedWeek);
      assignedSlot = targetSlot;
    }
  }

  res.json({
    ok: true,
    upload_id: uploadId,
    rows_count: rows.length,
    replaced_count: replacedCount,
    week_start_min: minWeek,
    week_start_max: maxWeek,
    clubs: Array.from(clubs),
    assigned_slot: assignedSlot,
    assigned_week: assignedWeek,
  });
});

// Ventes de la semaine — utilisé dans la vue P.R.E.L pour donner le
// contexte business à côté des perdus / nouveaux contrats.
app.get('/api/prel/sales-week', requireAuth, requireAdmin, (req, res) => {
  const week = String(req.query.week || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return res.status(400).json({ error: 'week=YYYY-MM-DD requis' });
  const db = getDb();
  const totals = db.prepare(`
    SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
    FROM sales WHERE week_start = ?
  `).get(week);
  const byRep = db.prepare(`
    SELECT s.sales_rep_id AS rep_id, r.name AS rep_name,
           COUNT(*) AS count, COALESCE(SUM(s.amount), 0) AS amount
    FROM sales s
    LEFT JOIN sales_reps r ON r.id = s.sales_rep_id
    WHERE s.week_start = ?
    GROUP BY s.sales_rep_id, r.name
    ORDER BY amount DESC, r.name ASC
  `).all(week);
  res.json({
    week_start: week,
    total_count: totals.count || 0,
    total_amount: totals.total || 0,
    by_rep: byRep,
  });
});

app.get('/api/prel/weeks', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT week_start, COUNT(*) AS rows_count, COUNT(DISTINCT club) AS clubs_count
    FROM prel_rows
    GROUP BY week_start
    ORDER BY week_start DESC
  `).all();
  res.json({ weeks: rows });
});

// ─── RECAP RÉTENTION : persistance par MOIS ABSOLU (studio, mois, type) ──────
// Le calcul et le parsing vivent CÔTÉ NAVIGATEUR (cf. RGPD : le fichier membres
// avec les IBAN ne quitte jamais le poste). Le serveur ne fait que STOCKER des
// données déjà parsées et ASSAINIES.
//
// Évolution (juillet 2026) : on abandonne le modèle relatif (enc_m1/enc_m) au
// profit d'un modèle par MOIS ABSOLU. Chaque import est archivé sous son vrai
// mois (déduit des dates du fichier côté navigateur). Conséquences :
//   • le M-1 d'un mois = le M d'un mois déjà importé -> plus besoin de le
//     redéposer, on le relit dans `retention_imports` ;
//   • les membres (clé -> Id_client Deciplus) forment un mapping CUMULATIF et
//     PERMANENT dans `retention_membres_map` : un seul import suffit, jamais
//     remplacé en bloc, jamais purgé.
// `contenu` est du JSON assaini (aucune donnée bancaire) ; la map membres ne
// contient que { cle_client -> id_client }.
function ensureRetentionSchema() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS retention_imports (
      studio TEXT NOT NULL,
      mois TEXT NOT NULL,
      type TEXT NOT NULL,
      contenu TEXT NOT NULL DEFAULT '[]',
      uploaded_at TEXT NOT NULL DEFAULT '',
      uploaded_by TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (studio, mois, type)
    );
    CREATE TABLE IF NOT EXISTS retention_membres_map (
      cle_client TEXT NOT NULL,
      id_client TEXT NOT NULL,
      studio TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (cle_client, studio)
    );
    CREATE TABLE IF NOT EXISTS retention_choices (
      mois TEXT NOT NULL,
      studio TEXT NOT NULL,
      client_key TEXT NOT NULL,
      categorie TEXT NOT NULL,
      valeur TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (mois, studio, client_key, categorie)
    );
  `);
  // Migration douce : retention_choices a existé (1er commit RECAP) SANS
  // updated_at ; CREATE IF NOT EXISTS ne l'ajoute pas -> on complète à la main.
  const cols = getDb().prepare('PRAGMA table_info(retention_choices)').all().map((c) => c.name);
  if (!cols.includes('updated_at')) {
    getDb().exec("ALTER TABLE retention_choices ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''");
  }
}
ensureRetentionSchema();

// ─── LEADS (saisie manuelle par club/mois + comparatif N-1) ──────────────────
function ensureLeadsSchema() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS leads (
      club TEXT NOT NULL,
      mois TEXT NOT NULL,               -- AAAA-MM
      nb INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (club, mois)
    );
  `);
}
ensureLeadsSchema();

// Seed historique (Meta Ads juin 2025 → juillet 2026). Leads = « Qté totale »
// mensuelle par club ; la campagne « Nord (groupé) » a été répartie ÷3 sur
// Lille/Marcq/Wasquehal. Inséré une seule fois ; N'ÉCRASE JAMAIS une saisie
// manuelle (ON CONFLICT DO NOTHING) -> ré-remplit seulement les cases vides.
const LEADS_SEED = {"2025-06":{"Boulogne":230,"Lille":150,"Marcq":106,"Wasquehal":113,"Neuilly":144,"Levallois":138},"2025-07":{"Boulogne":173,"Lille":180,"Marcq":95,"Wasquehal":95,"Neuilly":166,"Levallois":166},"2025-08":{"Boulogne":193,"Lille":136,"Marcq":104,"Wasquehal":103,"Neuilly":182,"Levallois":173},"2025-09":{"Boulogne":133,"Lille":71,"Marcq":175,"Wasquehal":70,"Neuilly":138,"Levallois":133},"2025-10":{"Boulogne":135,"Lille":55,"Marcq":348,"Wasquehal":138,"Neuilly":129,"Levallois":171},"2025-11":{"Boulogne":134,"Lille":52,"Marcq":275,"Wasquehal":236,"Neuilly":107,"Levallois":209},"2025-12":{"Boulogne":171,"Lille":68,"Marcq":239,"Wasquehal":324,"Neuilly":164,"Levallois":196},"2026-01":{"Boulogne":188,"Lille":123,"Marcq":217,"Wasquehal":290,"Neuilly":181,"Levallois":213},"2026-02":{"Boulogne":121,"Lille":100,"Marcq":187,"Wasquehal":96,"Neuilly":145,"Levallois":162},"2026-03":{"Boulogne":155,"Lille":162,"Marcq":147,"Wasquehal":78,"Neuilly":152,"Levallois":189},"2026-04":{"Boulogne":121,"Lille":112,"Marcq":61,"Wasquehal":132,"Neuilly":126,"Levallois":175},"2026-05":{"Boulogne":91,"Lille":92,"Marcq":44,"Wasquehal":117,"Neuilly":158,"Levallois":165},"2026-06":{"Boulogne":142,"Lille":72,"Marcq":132,"Wasquehal":66,"Neuilly":102,"Levallois":121},"2026-07":{"Boulogne":109,"Lille":76,"Marcq":87,"Wasquehal":67,"Neuilly":102,"Levallois":209}};
function seedLeads() {
  try {
    const V = '1';
    const fait = (getDb().prepare("SELECT value FROM app_settings WHERE key='leads_seed_v'").get() || {}).value;
    if (String(fait) === V) return;
    const up = getDb().prepare('INSERT INTO leads (club, mois, nb, updated_at) VALUES (?,?,?,?) ON CONFLICT(club, mois) DO NOTHING');
    const now = new Date().toISOString();
    const tx = getDb().transaction(() => {
      Object.keys(LEADS_SEED).forEach((mois) => {
        const row = LEADS_SEED[mois];
        Object.keys(row).forEach((club) => up.run(club, mois, row[club], now));
      });
    });
    tx();
    getDb().prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('leads_seed_v', ?, datetime('now','localtime')) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(V);
    console.log('[LEADS] seed historique appliqué');
  } catch (e) { console.error('seedLeads:', e && e.message); }
}
seedLeads();

const LEAD_CLUBS = ['Lille', 'Marcq', 'Wasquehal', 'Boulogne', 'Neuilly', 'Levallois'];
const LEAD_MOIS_RE = /^\d{4}-\d{2}$/;
function leadMoisN1(ym) { const [a, m] = String(ym || '').split('-').map(Number); return (a && m) ? (a - 1) + '-' + String(m).padStart(2, '0') : ''; }

// Un mois : nb de leads par club + le même mois N-1.
app.get('/api/leads/:mois', requireAuth, requireAdmin, (req, res) => {
  const mois = String(req.params.mois || '');
  if (!LEAD_MOIS_RE.test(mois)) return res.status(400).json({ error: 'mois=AAAA-MM requis' });
  const moisN1 = leadMoisN1(mois);
  try {
    const lire = (ym) => {
      const map = {};
      getDb().prepare('SELECT club, nb FROM leads WHERE mois = ?').all(ym).forEach((r) => { map[r.club] = r.nb; });
      return map;
    };
    const cur = lire(mois), prev = lire(moisN1);
    const rows = LEAD_CLUBS.map((club) => ({ club, nb: cur[club] || 0, nbN1: prev[club] || 0 }));
    res.json({ ok: true, mois, moisN1, clubs: LEAD_CLUBS, rows });
  } catch (e) { console.error('leads GET:', e && e.message); res.status(500).json({ error: 'Lecture impossible.' }); }
});

// Enregistre le nb de leads d'un club pour un mois (upsert).
app.patch('/api/leads/:mois', requireAuth, requireAdmin, (req, res) => {
  const mois = String(req.params.mois || '');
  if (!LEAD_MOIS_RE.test(mois)) return res.status(400).json({ error: 'mois=AAAA-MM requis' });
  const b = req.body || {};
  const club = String(b.club || '');
  if (!LEAD_CLUBS.includes(club)) return res.status(400).json({ error: 'club inconnu' });
  const nb = Math.max(0, Math.min(1000000, Math.round(Number(b.nb) || 0)));
  try {
    getDb().prepare(`INSERT INTO leads (club, mois, nb, updated_at) VALUES (?,?,?,?)
      ON CONFLICT(club, mois) DO UPDATE SET nb=excluded.nb, updated_at=excluded.updated_at`)
      .run(club, mois, nb, new Date().toISOString());
    res.json({ ok: true, nb });
  } catch (e) { console.error('leads PATCH:', e && e.message); res.status(500).json({ error: 'Enregistrement impossible.' }); }
});

const RETENTION_MOIS_RE = /^\d{4}-\d{2}$/; // AAAA-MM
const RETENTION_IMPORT_TYPES = ['encaissements', 'contrats', 'resiliations'];
function moisPrecedentSrv(ym) {
  const [a, m] = String(ym || '').split('-').map(Number);
  if (!a || !m) return null;
  const d = new Date(Date.UTC(a, m - 2, 1));
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}
function moisSuivantSrv(ym) {
  const [a, m] = String(ym || '').split('-').map(Number);
  if (!a || !m) return null;
  const d = new Date(Date.UTC(a, m, 1));
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

// Liste des mois archivés (pour le sélecteur + écran Historique). Un mois est
// « consolidé » dès que le mois suivant existe (son M-1 ne bougera plus).
app.get('/api/retention/mois', requireAuth, requireAdmin, (req, res) => {
  const rows = getDb().prepare(
    `SELECT mois, COUNT(DISTINCT studio) AS studios, MAX(uploaded_at) AS dernier
       FROM retention_imports WHERE type = 'encaissements' GROUP BY mois ORDER BY mois DESC`
  ).all();
  const presents = new Set(rows.map((r) => r.mois));
  const mois = rows.map((r) => ({
    mois: r.mois, studios: r.studios, dernier: r.dernier,
    consolide: presents.has(moisSuivantSrv(r.mois)),
  }));
  res.json({ mois });
});

// Map membres complète (défini AVANT /:mois pour ne pas être capté comme un mois).
app.get('/api/retention/membres', requireAuth, requireAdmin, (req, res) => {
  res.json(lireMembres(getDb()));
});

// Liste des clubs connus (imports club par club : l'admin choisit le club dans
// un menu plutôt que de laisser deviner). Union des studios déjà vus.
app.get('/api/retention/studios', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const a = db.prepare('SELECT DISTINCT studio FROM retention_imports').all().map((r) => r.studio);
  const b = db.prepare("SELECT DISTINCT studio FROM retention_membres_map WHERE studio <> '*'").all().map((r) => r.studio);
  const studios = [...new Set([...a, ...b])].filter(Boolean).sort((x, y) => x.localeCompare(y, 'fr'));
  res.json({ studios });
});

// Chargement d'un mois M : ses imports (M) + les encaissements archivés de M-1
// (repris automatiquement, par studio) + les choix du mois + la map membres.
app.get('/api/retention/:mois', requireAuth, requireAdmin, (req, res) => {
  const mois = String(req.params.mois || '');
  if (!RETENTION_MOIS_RE.test(mois)) return res.status(400).json({ error: 'mois=AAAA-MM requis' });
  const db = getDb();
  const m1 = moisPrecedentSrv(mois);
  const rowsToImports = (rows) => rows.map((r) => ({
    studio: r.studio, mois: r.mois, type: r.type,
    contenu: safeJson(r.contenu), uploaded_at: r.uploaded_at, uploaded_by: r.uploaded_by,
  }));
  const importsM = rowsToImports(
    db.prepare('SELECT studio, mois, type, contenu, uploaded_at, uploaded_by FROM retention_imports WHERE mois = ?').all(mois)
  );
  // Du M-1 on ne relit QUE les encaissements (le M-1 ne sert qu'à établir la base).
  const importsM1 = rowsToImports(
    db.prepare("SELECT studio, mois, type, contenu, uploaded_at, uploaded_by FROM retention_imports WHERE mois = ? AND type = 'encaissements'").all(m1)
  );
  const choices = db.prepare('SELECT studio, client_key, categorie, valeur FROM retention_choices WHERE mois = ?').all(mois);
  res.json({ mois, m1, importsM, importsM1, choices, membres: lireMembres(db) });
});

// Dépôt d'imports (un fichier d'encaissements couvre plusieurs studios -> le
// front envoie une tranche par studio). Chaque (studio, mois, type) est REMPLACÉ.
app.post('/api/retention/imports', requireAuth, requireAdmin, (req, res) => {
  const b = req.body || {};
  const items = Array.isArray(b.imports) ? b.imports : [];
  const bons = items.filter((d) => d && d.studio && RETENTION_MOIS_RE.test(String(d.mois || '')) && RETENTION_IMPORT_TYPES.includes(d.type));
  if (!bons.length) return res.status(400).json({ error: 'Aucun import valide (studio, mois=AAAA-MM, type=encaissements|contrats).' });
  const db = getDb();
  const now = new Date().toISOString();
  const par = (req.session && req.session.name) || 'admin';
  try {
    const ins = db.prepare(
      `INSERT INTO retention_imports (studio, mois, type, contenu, uploaded_at, uploaded_by) VALUES (?,?,?,?,?,?)
       ON CONFLICT(studio, mois, type) DO UPDATE SET contenu=excluded.contenu, uploaded_at=excluded.uploaded_at, uploaded_by=excluded.uploaded_by`
    );
    db.transaction(() => {
      bons.forEach((d) => ins.run(String(d.studio), String(d.mois), d.type, JSON.stringify(d.contenu == null ? [] : d.contenu), now, par));
    })();
    res.json({ ok: true, imports: bons.length, uploaded_at: now });
  } catch (e) { console.error('retention imports :', e && e.message); res.status(500).json({ error: 'Enregistrement impossible.' }); }
});

// Fusion CUMULATIVE de la map membres (clé -> Id_client). Jamais remplacée en
// bloc, jamais purgée : clé inconnue -> ajout ; connue même id -> rien ; connue
// autre id -> mise à jour (cas rare, tracé). Une entrée absente du nouvel import
// N'EST PAS supprimée.
app.post('/api/retention/membres', requireAuth, requireAdmin, (req, res) => {
  const b = req.body || {};
  const entries = Array.isArray(b.entries) ? b.entries : [];
  const db = getDb();
  const now = new Date().toISOString();
  let ajouts = 0, maj = 0, inchanges = 0;
  try {
    const sel = db.prepare('SELECT id_client FROM retention_membres_map WHERE cle_client = ? AND studio = ?');
    const ins = db.prepare('INSERT INTO retention_membres_map (cle_client, id_client, studio, updated_at) VALUES (?,?,?,?)');
    const upd = db.prepare('UPDATE retention_membres_map SET id_client = ?, updated_at = ? WHERE cle_client = ? AND studio = ?');
    db.transaction(() => {
      entries.forEach((e) => {
        if (!e || !e.cle || e.id == null || !e.studio) return;
        const cle = String(e.cle), id = String(e.id).trim(), studio = String(e.studio);
        if (!id) return;
        const ex = sel.get(cle, studio);
        if (!ex) { ins.run(cle, id, studio, now); ajouts++; }
        else if (ex.id_client === id) { inchanges++; }
        else { console.warn(`retention membres : ${cle} @ ${studio} change d'id ${ex.id_client} -> ${id}`); upd.run(id, now, cle, studio); maj++; }
      });
    })();
    res.json({ ok: true, ajouts, maj, inchanges, membres: lireMembres(db) });
  } catch (e) { console.error('retention membres :', e && e.message); res.status(500).json({ error: 'Enregistrement impossible.' }); }
});

// Map membres complète (pour résoudre les liens Deciplus côté front : studio puis
// global, homonymes -> pas de lien) + stats par studio (compteur, dernier import).
function lireMembres(db) {
  const rows = db.prepare('SELECT cle_client, id_client, studio, updated_at FROM retention_membres_map').all();
  const stats = {};
  rows.forEach((r) => {
    const s = stats[r.studio] || (stats[r.studio] = { count: 0, dernier: '' });
    s.count++;
    if (r.updated_at > s.dernier) s.dernier = r.updated_at;
  });
  return {
    total: rows.length, stats,
    map: rows.map((r) => ({ cle: r.cle_client, id: r.id_client, studio: r.studio })),
  };
}

// Un seul choix de menu (changement en direct) -> upsert léger.
app.patch('/api/retention/:mois/choix', requireAuth, requireAdmin, (req, res) => {
  const mois = String(req.params.mois || '');
  if (!RETENTION_MOIS_RE.test(mois)) return res.status(400).json({ error: 'mois=AAAA-MM requis' });
  const b = req.body || {};
  if (!b.studio || !b.client_key || !b.categorie) return res.status(400).json({ error: 'studio, client_key, categorie requis' });
  try {
    getDb().prepare(
      `INSERT INTO retention_choices (mois, studio, client_key, categorie, valeur, updated_at) VALUES (?,?,?,?,?,?)
       ON CONFLICT(mois, studio, client_key, categorie) DO UPDATE SET valeur=excluded.valeur, updated_at=excluded.updated_at`
    ).run(mois, String(b.studio), String(b.client_key), String(b.categorie), String(b.valeur || ''), new Date().toISOString());
    res.json({ ok: true });
  } catch (e) { console.error('retention choix :', e && e.message); res.status(500).json({ error: 'Enregistrement impossible.' }); }
});

function safeJson(s) { try { return JSON.parse(s); } catch (_) { return null; } }

// ─── Export « Besoin d'infos » vers Google Sheets (compte de service) ────────
// Auth par JWT RS256 signé avec la clé privée du compte de service (aucune
// dépendance externe : crypto natif). Le Sheet doit être PARTAGÉ en éditeur
// avec l'email du compte de service.
let _gsheetTok = { token: '', exp: 0 };
async function googleServiceToken(scope) {
  const now = Math.floor(Date.now() / 1000);
  if (_gsheetTok.token && _gsheetTok.exp > now + 60) return _gsheetTok.token;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON manquant');
  const sa = JSON.parse(raw);
  if (!sa.client_email || !sa.private_key) throw new Error('JSON compte de service invalide');
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b64({ alg: 'RS256', typ: 'JWT' });
  const claim = b64({ iss: sa.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const sig = crypto.createSign('RSA-SHA256').update(head + '.' + claim).sign(sa.private_key, 'base64url');
  const jwt = head + '.' + claim + '.' + sig;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const tok = await r.json();
  if (!tok.access_token) throw new Error('Token Google refusé : ' + (tok.error_description || tok.error || 'inconnu'));
  _gsheetTok = { token: tok.access_token, exp: now + (tok.expires_in || 3600) };
  return tok.access_token;
}

// POST /api/retention/besoin/export : écrase l'onglet cible avec la liste
// courante des fiches « besoin d'infos » (Club, Nom, Prénom, Qualification).
app.post('/api/retention/besoin/export', requireAuth, requireAdmin, async (req, res) => {
  const sheetId = process.env.RECAP_BESOIN_SHEET_ID;
  if (!sheetId) return res.status(400).json({ error: 'Google Sheet non configuré (variable RECAP_BESOIN_SHEET_ID).' });
  const tab = process.env.RECAP_BESOIN_SHEET_TAB || "Besoins d'infos";
  const rows = Array.isArray(req.body && req.body.rows) ? req.body.rows : [];
  const rangeA = "'" + tab.replace(/'/g, "''") + "'!A:E";
  const range1 = "'" + tab.replace(/'/g, "''") + "'!A1";
  try {
    const token = await googleServiceToken('https://www.googleapis.com/auth/spreadsheets');
    const auth = { Authorization: 'Bearer ' + token };
    const base = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(sheetId) + '/values/';
    // 1) Vide l'ancienne liste (colonnes A→D de l'onglet).
    await fetch(base + encodeURIComponent(rangeA) + ':clear', { method: 'POST', headers: auth });
    // 2) Écrit l'en-tête + les fiches courantes.
    const values = [['Club', 'Nom', 'Prénom', 'Qualification', 'Note']].concat(
      rows.map((r) => [String(r.club || ''), String(r.nom || ''), String(r.prenom || ''), String(r.qual || ''), String(r.note || '')]));
    const up = await fetch(base + encodeURIComponent(range1) + '?valueInputOption=RAW', {
      method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, auth),
      body: JSON.stringify({ values }),
    });
    const j = await up.json();
    if (j.error) return res.status(502).json({ error: 'Google Sheets : ' + (j.error.message || 'erreur') });
    res.json({ ok: true, count: rows.length });
  } catch (e) { console.error('besoin export :', e && e.message); res.status(500).json({ error: e.message || 'Export impossible.' }); }
});

// Suivi hebdomadaire des prélèvements — vue de pilotage dirigeant.
// Lit les données DÉJÀ stockées dans prel_rows (aucune donnée bancaire n'y est
// persistée) et les agrège par club + statut pour une semaine donnée.
// Aucune ré-importation : on relit simplement l'existant.
app.get('/api/prel/suivi', requireAuth, requireAdmin, (req, res) => {
  const week = String(req.query.week || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return res.status(400).json({ error: 'week=YYYY-MM-DD requis' });
  const db = getDb();
  const rows = db.prepare(`
    SELECT club, membre, prestation, ttc, echeance, etat, vendeur, raison
    FROM prel_rows
    WHERE week_start = ?
    ORDER BY club ASC, membre ASC
  `).all(week);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const normEtat = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  function classify(etat, echeance) {
    const e = normEtat(etat);
    let overdue = false;
    if (echeance && /^\d{4}-\d{2}-\d{2}$/.test(echeance)) {
      overdue = new Date(echeance + 'T00:00:00') < today;
    }
    if (e.includes('encaiss') || e === 'ok') return { code: 'paye', label: 'Payé' };
    if (e.includes('impay')) return { code: 'impaye', label: 'Impayé' };
    if (e.includes('suspend')) return { code: 'suspendu', label: 'Suspendu' };
    // Envoyé / A faire / état inconnu / vide → à contrôler
    if (overdue) return { code: 'controle', label: 'À contrôler', anomaly: true };
    return { code: 'controle', label: 'En attente' };
  }

  const clubsMap = {};
  const totals = { attendu: 0, paye: 0, impaye: 0, suspendu: 0, controle: 0, count: 0 };
  for (const r of rows) {
    const st = classify(r.etat, r.echeance);
    const ttc = (typeof r.ttc === 'number' && !Number.isNaN(r.ttc)) ? r.ttc : 0;
    const club = r.club || 'Studio non précisé';
    if (!clubsMap[club]) clubsMap[club] = { club, lines: [], attendu: 0, paye: 0, impaye: 0, suspendu: 0, controle: 0, count: 0 };
    const c = clubsMap[club];
    c.lines.push({
      membre: r.membre || '—',
      prestation: r.prestation || '—',
      ttc,
      echeance: r.echeance || null,
      etat: r.etat || '',
      status: st.code,
      statusLabel: st.label,
      anomaly: !!st.anomaly,
      vendeur: r.vendeur || '—',
      raison: r.raison || '',
    });
    c.count++; c.attendu += ttc; totals.count++; totals.attendu += ttc;
    if (st.code === 'paye') { c.paye += ttc; totals.paye += ttc; }
    else if (st.code === 'impaye') { c.impaye += ttc; totals.impaye += ttc; }
    else if (st.code === 'suspendu') { c.suspendu += ttc; totals.suspendu += ttc; }
    else { c.controle += ttc; totals.controle += ttc; }
  }
  const clubs = Object.values(clubsMap).sort((a, b) => a.club.localeCompare(b.club));
  clubs.forEach(c => { c.taux = c.attendu > 0 ? c.paye / c.attendu : 0; });
  totals.taux = totals.attendu > 0 ? totals.paye / totals.attendu : 0;
  res.json({ week_start: week, totals, clubs });
});

app.get('/api/prel/uploads', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM prel_uploads ORDER BY uploaded_at DESC LIMIT 100`).all();
  res.json({ uploads: rows });
});

app.delete('/api/prel/uploads/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide' });
  const db = getDb();
  db.prepare(`DELETE FROM prel_uploads WHERE id = ?`).run(id);
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────
// SLOTS S-1 / S : système figé d'emplacements pour la comparaison.
//
// Plutôt que d'auto-détecter les 2 semaines les plus volumineuses
// (qui peut tomber sur d'anciennes données de test), l'utilisateur définit
// explicitement quelle semaine est S et quelle semaine est S-1.
//
// Stockage : 2 clés dans app_settings
//   • prel_slot_cur_week  → semaine S (la plus récente)
//   • prel_slot_prev_week → semaine S-1 (la précédente)
//
// Endpoints :
//   GET  /api/prel/slots          → état actuel des 2 slots + métadata
//   POST /api/prel/slots/set      → { slot: 'cur'|'prev', week_start }
//   POST /api/prel/slots/clear    → { slot: 'cur'|'prev' }
//   POST /api/prel/slots/rotate   → S devient S-1, S est vidée
//   POST /api/prel/slots/cleanup  → supprime toutes les semaines hors slots
// ─────────────────────────────────────────────────────────────────────────

const PREL_SLOT_KEYS = { cur: 'prel_slot_cur_week', prev: 'prel_slot_prev_week' };
function prelGetSlot(db, slot) {
  const key = PREL_SLOT_KEYS[slot];
  if (!key) return null;
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(key);
  return row && row.value ? String(row.value) : null;
}
function prelSetSlot(db, slot, value) {
  const key = PREL_SLOT_KEYS[slot];
  if (!key) return;
  if (value == null) {
    db.prepare(`DELETE FROM app_settings WHERE key = ?`).run(key);
  } else {
    db.prepare(`
      INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now','localtime'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now','localtime')
    `).run(key, String(value));
  }
}
function prelWeekMeta(db, week) {
  if (!week) return null;
  const r = db.prepare(`
    SELECT COUNT(*) AS rows_count, COUNT(DISTINCT club) AS clubs_count
    FROM prel_rows WHERE week_start = ?
  `).get(week);
  // Dernier upload contenant cette semaine
  const up = db.prepare(`
    SELECT filename, uploaded_at FROM prel_uploads
    WHERE week_start_min <= ? AND week_start_max >= ?
    ORDER BY uploaded_at DESC LIMIT 1
  `).get(week, week);
  return {
    week_start: week,
    rows_count: r ? r.rows_count : 0,
    clubs_count: r ? r.clubs_count : 0,
    filename: up ? up.filename : null,
    uploaded_at: up ? up.uploaded_at : null,
  };
}

app.get('/api/prel/slots', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const curWeek = prelGetSlot(db, 'cur');
  const prevWeek = prelGetSlot(db, 'prev');
  res.json({
    cur: prelWeekMeta(db, curWeek),
    prev: prelWeekMeta(db, prevWeek),
  });
});

app.post('/api/prel/slots/set', requireAuth, requireAdmin, (req, res) => {
  const slot = String((req.body && req.body.slot) || '').toLowerCase();
  const weekStart = String((req.body && req.body.week_start) || '').trim();
  if (!['cur', 'prev'].includes(slot)) return res.status(400).json({ error: 'slot doit être cur ou prev' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return res.status(400).json({ error: 'week_start invalide (YYYY-MM-DD)' });
  const db = getDb();
  // Vérifie que la semaine existe en base
  const exists = db.prepare(`SELECT 1 FROM prel_rows WHERE week_start = ? LIMIT 1`).get(weekStart);
  if (!exists) return res.status(400).json({ error: `Aucune donnée pour la semaine ${weekStart}` });
  prelSetSlot(db, slot, weekStart);
  res.json({ ok: true, slot, week_start: weekStart });
});

app.post('/api/prel/slots/clear', requireAuth, requireAdmin, (req, res) => {
  const slot = String((req.body && req.body.slot) || '').toLowerCase();
  if (!['cur', 'prev'].includes(slot)) return res.status(400).json({ error: 'slot doit être cur ou prev' });
  const db = getDb();
  prelSetSlot(db, slot, null);
  res.json({ ok: true });
});

app.post('/api/prel/slots/rotate', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const curWeek = prelGetSlot(db, 'cur');
  // Rotation atomique : S devient S-1, S est vidée
  const tx = db.transaction(() => {
    prelSetSlot(db, 'prev', curWeek);
    prelSetSlot(db, 'cur', null);
  });
  tx();
  res.json({ ok: true, prev_week: curWeek, cur_week: null });
});

// Nettoyage : supprime toutes les lignes pour les semaines qui NE sont PAS
// dans les slots (utile pour purger les anciennes données de test).
app.post('/api/prel/slots/cleanup', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const curWeek = prelGetSlot(db, 'cur');
  const prevWeek = prelGetSlot(db, 'prev');
  const keep = [curWeek, prevWeek].filter(Boolean);
  if (keep.length === 0) {
    return res.status(400).json({ error: 'Aucun slot défini — refuse de tout supprimer.' });
  }
  // Liste les semaines qui vont être supprimées (pour info)
  const toDelete = db.prepare(`
    SELECT week_start, COUNT(*) AS rows_count
    FROM prel_rows
    WHERE week_start NOT IN (${keep.map(() => '?').join(',')})
    GROUP BY week_start
  `).all(...keep);
  const totalRows = toDelete.reduce((s, w) => s + w.rows_count, 0);
  const totalWeeks = toDelete.length;
  if (totalRows === 0) {
    return res.json({ ok: true, deleted_rows: 0, deleted_weeks: 0, message: 'Aucune donnée hors slots à supprimer.' });
  }
  db.prepare(`DELETE FROM prel_rows WHERE week_start NOT IN (${keep.map(() => '?').join(',')})`).run(...keep);
  res.json({
    ok: true,
    deleted_rows: totalRows,
    deleted_weeks: totalWeeks,
    weeks: toDelete.map(w => w.week_start),
    kept: keep,
  });
});


// Comparaison S vs S-1 : pour chaque club, retourne la liste des clients
// présents en S-1 (état « prélevé / réussi ») mais absents OU non-prélevés
// en S. Définition d'un prélèvement réussi (cf. format Vendor du client) :
//   - « Encaisse »  (encaissé / réussi — état dominant dans les exports)
//   - « OK »        (fallback pour d'autres formats éventuels)
//   - « Encaissé »  (variante avec accent)
// Tous les autres états — Suspendu, Impayé, A faire, Envoyé, etc. —
// comptent comme NON-prélevé.
const PREL_ETATS_OK = ['OK', 'ENCAISSE', 'ENCAISSÉ'];
function prelIsOk(etat) {
  return PREL_ETATS_OK.includes(String(etat || '').toUpperCase().trim());
}

app.get('/api/prel/comparison', requireAuth, requireAdmin, (req, res) => {
  const week = String(req.query.week || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return res.status(400).json({ error: 'week=YYYY-MM-DD requis' });
  const includeArchived = String(req.query.include_archived || '').trim() === '1';
  const db = getDb();
  // Détermination de S-1 :
  //   1. Si ?prev= est fourni dans l'URL → on l'utilise
  //   2. Sinon, si un slot prev existe ET que `week` matche le slot cur → on prend le slot prev
  //   3. Sinon, fallback : S - 7 jours
  let prevWeek = String(req.query.prev || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(prevWeek)) {
    const slotCur = prelGetSlot(db, 'cur');
    const slotPrev = prelGetSlot(db, 'prev');
    if (slotCur === week && slotPrev) {
      prevWeek = slotPrev;
    } else {
      const [y, m, d] = week.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() - 7);
      prevWeek = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2,'0')}-${String(dt.getUTCDate()).padStart(2,'0')}`;
    }
  }
  const clubs = db.prepare(`
    SELECT DISTINCT club FROM prel_rows
    WHERE week_start = ? OR week_start = ?
    ORDER BY club ASC
  `).all(week, prevWeek).map(r => r.club);
  // Pré-charge les archivés de la semaine S (par club, par id_client)
  const archivedAll = db.prepare(`SELECT * FROM prel_archived WHERE week_start = ?`).all(week);
  const archivedByClub = {};
  archivedAll.forEach(a => {
    archivedByClub[a.club] = archivedByClub[a.club] || new Map();
    archivedByClub[a.club].set(a.id_client, a);
  });
  // ───────────────────────────────────────────────────────────────────────
  // Détection « TTC en centimes » au runtime (pas de modif des données stockées) :
  // Les exports Vendor / Déciplus stockent souvent les montants en entiers
  // (6900 = 69,00 €). Si l'import historique n'a pas converti, on corrige
  // ICI à la volée, à chaque comparaison.
  // Heuristique GLOBALE (toutes lignes S-1 confondues) :
  //   médiane > 500 ET ≥ 90% des valeurs sont des entiers
  // ───────────────────────────────────────────────────────────────────────
  const globalPrevTtc = db.prepare(`
    SELECT ttc FROM prel_rows
    WHERE week_start = ? AND ttc IS NOT NULL
  `).all(prevWeek).map(r => Number(r.ttc)).filter(v => !Number.isNaN(v));
  let ttcDivisor = 1;
  if (globalPrevTtc.length >= 5) {
    const sorted = [...globalPrevTtc].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    const intRatio = globalPrevTtc.filter(v => Number.isInteger(v)).length / globalPrevTtc.length;
    if (med > 500 && intRatio > 0.9) {
      ttcDivisor = 100;
      console.log(`[prel/comparison] TTC en centimes détecté pour semaine ${prevWeek} (médiane ${med}, ${(intRatio * 100).toFixed(0)}% entiers) → ÷ 100 à la volée`);
    }
  }

  const result = clubs.map(club => {
    const prevAll = db.prepare(`
      SELECT id, id_client, id_prestation, membre, etat, echeance, ttc, vendeur, prestation, raison, tel, email
      FROM prel_rows
      WHERE club = ? AND week_start = ?
    `).all(club, prevWeek);
    const prev = prevAll.filter(r => prelIsOk(r.etat));
    const cur = db.prepare(`
      SELECT id_client, id_prestation, etat
      FROM prel_rows
      WHERE club = ? AND week_start = ?
    `).all(club, week);
    const curOkClients = new Set();
    cur.forEach(r => { if (prelIsOk(r.etat)) curOkClients.add(r.id_client); });
    // Regroupe les prestations PAR CLIENT (pour sommer le TTC total perdu)
    // Dédup : si la même (id_prestation, echeance) revient plusieurs fois pour
    // un même client (artefact d'import ou Excel avec lignes répétées), on ne
    // la compte qu'une seule fois. Fallback : (echeance, ttc) si id_prestation
    // est null.
    const byClient = new Map(); // id_client → { ...firstRow, ttc_total, prestations:[] }
    for (const r of prev) {
      if (curOkClients.has(r.id_client)) continue; // pas perdu → on saute
      const key = r.id_client != null ? r.id_client : `mb:${(r.membre || '').toLowerCase().trim()}`;
      if (!byClient.has(key)) {
        byClient.set(key, {
          id_client: r.id_client,
          membre: r.membre,
          email: r.email,
          tel: r.tel,
          ttc_total: 0,
          prestations: [],
          _seen: new Set(), // pour dédup interne
        });
      }
      const entry = byClient.get(key);
      const dedupKey = (r.id_prestation != null)
        ? `p:${r.id_prestation}|${r.echeance || ''}`
        : `f:${r.echeance || ''}|${r.ttc != null ? r.ttc : ''}|${r.prestation || ''}`;
      if (entry._seen.has(dedupKey)) continue; // doublon déjà comptabilisé
      entry._seen.add(dedupKey);
      const ttc = (Number(r.ttc) || 0) / ttcDivisor;
      entry.ttc_total += ttc;
      entry.prestations.push({
        prestation: r.prestation,
        ttc,
        echeance: r.echeance,
        vendeur: r.vendeur,
        raison: r.raison,
      });
    }
    // Nettoie le set interne avant la sérialisation
    for (const e of byClient.values()) { delete e._seen; }
    // Sépare archivés vs actifs
    const archivedMap = archivedByClub[club] || new Map();
    const perdusActifs = [];
    const perdusArchives = [];
    for (const entry of byClient.values()) {
      const archived = entry.id_client != null && archivedMap.get(entry.id_client);
      if (archived) {
        perdusArchives.push({ ...entry, archived: true, archived_note: archived.note, archived_at: archived.archived_at });
      } else {
        perdusActifs.push(entry);
      }
    }
    const perdus = includeArchived ? [...perdusActifs, ...perdusArchives] : perdusActifs;
    // Montant total perdu = somme cumulée des TTC S-1 (toutes prestations
    // des clients NON archivés). Si includeArchived=1 on inclut tout.
    const montant_total = perdusActifs.reduce((s, p) => s + (p.ttc_total || 0), 0);
    const prevClientsUniq = new Set();
    prev.forEach(r => { if (r.id_client != null) prevClientsUniq.add(r.id_client); });
    return {
      club,
      week_prev: prevWeek,
      week_cur: week,
      prev_count: prevClientsUniq.size,
      cur_ok_count: curOkClients.size,
      perdus_count: perdusActifs.length,
      archived_count: perdusArchives.length,
      montant_total,
      perdus,
    };
  });
  res.json({
    week_cur: week,
    week_prev: prevWeek,
    clubs: result,
    include_archived: includeArchived,
    ttc_divisor_applied: ttcDivisor,
  });
});

// Archive un client comme « sous contrôle » pour une semaine donnée.
// Body : { club, week_start, id_client, membre?, note? }
app.post('/api/prel/archive', requireAuth, requireAdmin, (req, res) => {
  const { club, week_start, id_client, membre, note } = req.body || {};
  if (!club || !week_start || id_client == null) {
    return res.status(400).json({ error: 'club, week_start, id_client requis' });
  }
  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO prel_archived (club, week_start, id_client, membre, note, archived_by)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(club, week_start, id_client) DO UPDATE SET
        membre = COALESCE(excluded.membre, prel_archived.membre),
        note = COALESCE(excluded.note, prel_archived.note),
        archived_at = datetime('now','localtime')
    `).run(String(club), String(week_start), parseInt(id_client, 10),
           membre || null, note || null, req.session.name || 'admin');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Désarchive (retour dans la liste des perdus)
app.delete('/api/prel/archive', requireAuth, requireAdmin, (req, res) => {
  const { club, week_start, id_client } = req.body || {};
  if (!club || !week_start || id_client == null) {
    return res.status(400).json({ error: 'club, week_start, id_client requis' });
  }
  const db = getDb();
  db.prepare(`DELETE FROM prel_archived WHERE club = ? AND week_start = ? AND id_client = ?`)
    .run(String(club), String(week_start), parseInt(id_client, 10));
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────
// Diagnostic + correction des TTC stockés en CENTIMES dans prel_rows.
// Les exports Vendor / Déciplus stockent souvent les montants en entiers
// (6900 = 69,00 €). Si l'import historique n'a pas fait la conversion,
// les cumuls deviennent absurdes (×100).
//
// GET  /api/prel/ttc-diagnostic       → médiane, min, max, ratio entiers
// POST /api/prel/fix-ttc-units        → divise par 100 les valeurs détectées
//                                       comme centimes (apply=1 pour exécuter)
// ─────────────────────────────────────────────────────────────────────────
app.get('/api/prel/ttc-diagnostic', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const week = String(req.query.week || '').trim();
  const params = [];
  let where = `ttc IS NOT NULL`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    where += ` AND week_start = ?`;
    params.push(week);
  }
  const rows = db.prepare(`SELECT ttc FROM prel_rows WHERE ${where}`).all(...params);
  if (rows.length === 0) {
    return res.json({ ok: true, count: 0, message: 'Aucune ligne avec TTC' });
  }
  const vals = rows.map(r => Number(r.ttc)).filter(v => !Number.isNaN(v)).sort((a, b) => a - b);
  const median = vals[Math.floor(vals.length / 2)];
  const intCount = vals.filter(v => Number.isInteger(v)).length;
  const intRatio = intCount / vals.length;
  const probableCents = median > 500 && intRatio > 0.9;
  // Échantillon de quelques valeurs
  const sample = vals.slice(0, 5).concat(vals.slice(-5));
  res.json({
    ok: true,
    count: vals.length,
    median,
    min: vals[0],
    max: vals[vals.length - 1],
    int_ratio: intRatio,
    probable_cents: probableCents,
    sample,
    week_filter: /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : null,
  });
});

app.post('/api/prel/fix-ttc-units', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const week = String((req.body && req.body.week) || '').trim();
  const apply = !!(req.body && req.body.apply);
  const params = [];
  let where = `ttc IS NOT NULL`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    where += ` AND week_start = ?`;
    params.push(week);
  }
  const rows = db.prepare(`SELECT id, ttc FROM prel_rows WHERE ${where}`).all(...params);
  if (rows.length === 0) {
    return res.json({ ok: true, count: 0, message: 'Aucune ligne avec TTC' });
  }
  const vals = rows.map(r => Number(r.ttc)).filter(v => !Number.isNaN(v)).sort((a, b) => a - b);
  const median = vals[Math.floor(vals.length / 2)];
  const intRatio = vals.filter(v => Number.isInteger(v)).length / vals.length;
  const probableCents = median > 500 && intRatio > 0.9;
  if (!probableCents) {
    return res.json({
      ok: true,
      applied: false,
      count: rows.length,
      median,
      int_ratio: intRatio,
      message: 'Les TTC ne ressemblent pas à des centimes (médiane ≤ 500 ou trop peu d\'entiers). Aucune correction appliquée.',
    });
  }
  if (!apply) {
    return res.json({
      ok: true,
      applied: false,
      dry_run: true,
      count: rows.length,
      median,
      int_ratio: intRatio,
      preview: `${rows.length} lignes seraient divisées par 100. Médiane ${median} → ${median / 100} €. Re-poste avec apply=true.`,
    });
  }
  const upd = db.prepare(`UPDATE prel_rows SET ttc = ttc / 100.0 WHERE id = ?`);
  const tx = db.transaction(() => {
    let n = 0;
    for (const r of rows) { upd.run(r.id); n++; }
    return n;
  });
  const updated = tx();
  res.json({
    ok: true,
    applied: true,
    updated,
    median_before: median,
    median_after: median / 100,
    message: `${updated} lignes corrigées (÷ 100).`,
  });
});

// Liste des archivés pour une semaine (toutes clubs confondus)
app.get('/api/prel/archived', requireAuth, requireAdmin, (req, res) => {
  const week = String(req.query.week || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return res.status(400).json({ error: 'week=YYYY-MM-DD requis' });
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM prel_archived WHERE week_start = ? ORDER BY club, membre
  `).all(week);
  res.json({ archived: rows });
});

// ─── Pilotage : Commentaires (laissés par consultants) ───────────
// Tout utilisateur authentifié peut POST un commentaire.
// Seul l'admin peut LIRE / MARQUER COMME LU.

app.post('/api/pilotage/comments', requireAuth, (req, res) => {
  const { target_label, comment_text, context_json } = req.body || {};
  const text = (comment_text || '').toString().trim();
  if (!text) return res.status(400).json({ error: 'comment_text requis' });
  if (text.length > 5000) return res.status(400).json({ error: 'Commentaire trop long (max 5000 caractères)' });
  const label = (target_label || '').toString().trim().slice(0, 200);
  let ctxJson = null;
  if (context_json) {
    try { ctxJson = typeof context_json === 'string' ? context_json : JSON.stringify(context_json); }
    catch (_) { ctxJson = null; }
    if (ctxJson && ctxJson.length > 4000) ctxJson = null;
  }
  const db = getDb();
  const result = db.prepare(
    `INSERT INTO pilotage_comments (target_label, comment_text, author_name, author_role, context_json)
     VALUES (?, ?, ?, ?, ?)`
  ).run(label, text, req.session.name || 'Inconnu', req.session.role || 'unknown', ctxJson);
  res.json({ success: true, id: result.lastInsertRowid });
});

app.get('/api/pilotage/comments', requireAuth, requireAdmin, (req, res) => {
  const onlyUnread = String(req.query.unread || '').trim() === '1';
  const db = getDb();
  const rows = onlyUnread
    ? db.prepare(`SELECT * FROM pilotage_comments WHERE read_at IS NULL ORDER BY created_at DESC LIMIT 200`).all()
    : db.prepare(`SELECT * FROM pilotage_comments ORDER BY created_at DESC LIMIT 200`).all();
  const unreadCount = db.prepare(`SELECT COUNT(*) AS c FROM pilotage_comments WHERE read_at IS NULL`).get().c;
  res.json({ comments: rows, unread_count: unreadCount });
});

app.post('/api/pilotage/comments/:id/read', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide' });
  const db = getDb();
  db.prepare(`UPDATE pilotage_comments SET read_at = datetime('now','localtime') WHERE id = ?`).run(id);
  res.json({ success: true });
});

app.delete('/api/pilotage/comments/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide' });
  const db = getDb();
  db.prepare(`DELETE FROM pilotage_comments WHERE id = ?`).run(id);
  res.json({ success: true });
});

// ─── Feature Status ─────────────────────────────────────────

app.get('/api/status', (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const smtpOk = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  res.json({
    ai: !!(apiKey && apiKey !== 'votre_cle_api_ici'),
    email: smtpOk,
    webhook: !!process.env.WEBHOOK_API_KEY,
  });
});

// ─── Webhook Auth Middleware ─────────────────────────────────

function webhookAuth(req, res, next) {
  const apiKey = process.env.WEBHOOK_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'WEBHOOK_API_KEY non configurée sur le serveur' });
  }
  const authHeader = req.headers['authorization'];
  if (!authHeader || authHeader !== `Bearer ${apiKey}`) {
    return res.status(401).json({ error: 'Non autorisé : clé API manquante ou invalide' });
  }
  next();
}

// ─── Webhook Validation ─────────────────────────────────────

const VALID_RIB_STATUSES = ['Reçu', 'En attente', 'Non fourni'];

function validateSalePayload(sale, db) {
  const errors = [];

  if (!sale.date) errors.push('date est requis');
  if (sale.amount === undefined || sale.amount === null) errors.push('amount est requis');
  if (!sale.commercial_name && !sale.external_id && !sale.sales_rep_id) {
    errors.push('Un de commercial_name, external_id ou sales_rep_id est requis');
  }

  if (sale.date && !/^\d{4}-\d{2}-\d{2}$/.test(sale.date)) {
    errors.push('date doit être au format YYYY-MM-DD');
  }

  if (sale.amount !== undefined && (typeof sale.amount !== 'number' || sale.amount < 0)) {
    errors.push('amount doit être un nombre positif');
  }

  if (sale.rib_status && !VALID_RIB_STATUSES.includes(sale.rib_status)) {
    errors.push(`rib_status doit être : ${VALID_RIB_STATUSES.join(', ')}`);
  }

  let resolvedRepId = sale.sales_rep_id || null;

  if (!resolvedRepId && sale.external_id) {
    const rep = db.prepare('SELECT id FROM sales_reps WHERE external_id = ?').get(sale.external_id);
    if (!rep) errors.push(`Aucun commercial avec external_id "${sale.external_id}"`);
    else resolvedRepId = rep.id;
  }

  if (!resolvedRepId && sale.commercial_name) {
    const rep = db.prepare('SELECT id FROM sales_reps WHERE LOWER(name) = LOWER(?)').get(sale.commercial_name);
    if (!rep) errors.push(`Aucun commercial avec le nom "${sale.commercial_name}"`);
    else resolvedRepId = rep.id;
  }

  return { errors, resolvedRepId };
}

// ─── Helpers ────────────────────────────────────────────────

function escapeCsvField(value) {
  const str = String(value ?? '');
  // Neutralize Excel formula injection
  if (/^[=+\-@]/.test(str)) {
    return `"'${str.replace(/"/g, '""')}"`;
  }
  // Quote if contains delimiter, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function isValidDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function getMonday(dateStr) {
  // Parse as local date parts to avoid timezone issues
  const [y, m, dd] = dateStr.split('-').map(Number);
  const d = new Date(y, m - 1, dd);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  const ry = d.getFullYear();
  const rm = String(d.getMonth() + 1).padStart(2, '0');
  const rd = String(d.getDate()).padStart(2, '0');
  return `${ry}-${rm}-${rd}`;
}

// ─── GET /api/sales-reps ────────────────────────────────────

app.get('/api/sales-reps', requireAuth, (req, res) => {
  const db = getDb();
  const reps = db.prepare('SELECT * FROM sales_reps WHERE archived = 0 ORDER BY id').all();
  res.json(reps);
});

// ─── POST /api/sales-reps (admin only) ──────────────────────

app.post('/api/sales-reps', requireAuth, requireAdmin, (req, res) => {
  const { name, start_week, role } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Le nom est requis' });
  }
  const trimmedName = name.trim();
  const repRole = (role === 'phoneur') ? 'phoneur' : 'commercial';
  const db = getDb();

  // Compute start_week
  let startWeek = null;
  if (start_week) startWeek = getMonday(start_week);

  // Check if name already exists (any archived status)
  const existing = db.prepare('SELECT id, archived FROM sales_reps WHERE LOWER(name) = LOWER(?)').get(trimmedName);
  if (existing) {
    if (existing.archived) {
      // Un-archive: réactiver le commercial existant en préservant son historique (PIN, ventes, settings)
      db.prepare('UPDATE sales_reps SET archived = 0, role = ?, start_week = ? WHERE id = ?').run(repRole, startWeek, existing.id);
      const restored = db.prepare('SELECT * FROM sales_reps WHERE id = ?').get(existing.id);
      return res.status(200).json(restored);
    }
    return res.status(409).json({ error: 'Ce nom existe déjà' });
  }

  // Generate PIN for new rep
  const allPins = db.prepare('SELECT pin FROM sales_reps WHERE pin IS NOT NULL').all().map(r => r.pin);
  const pin = generatePin(trimmedName, allPins);

  // Insert with role
  const result = db.prepare('INSERT INTO sales_reps (name, pin, start_week, role) VALUES (?, ?, ?, ?)').run(trimmedName, pin, startWeek, repRole);
  const newRep = db.prepare('SELECT * FROM sales_reps WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(newRep);
});

// ─── DELETE /api/sales-reps/:id (admin only) — soft delete ──

app.delete('/api/sales-reps/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const repId = parseInt(req.params.id);

  const rep = db.prepare('SELECT * FROM sales_reps WHERE id = ?').get(repId);
  if (!rep) return res.status(404).json({ error: 'Commercial non trouvé' });

  // Soft delete: archive the rep (keeps all historical data intact)
  db.prepare('UPDATE sales_reps SET archived = 1 WHERE id = ?').run(repId);
  res.json({ ok: true, archived: true });
});

// ─── PUT /api/sales-reps/:id/pin (admin only) ───────────────

app.put('/api/sales-reps/:id/pin', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const repId = parseInt(req.params.id);
  const { pin } = req.body;

  if (!pin || typeof pin !== 'string' || pin.trim().length < 2) {
    return res.status(400).json({ error: 'PIN requis (min 2 caractères)' });
  }

  const rep = db.prepare('SELECT * FROM sales_reps WHERE id = ?').get(repId);
  if (!rep) return res.status(404).json({ error: 'Commercial non trouvé' });

  // Check PIN not already used by another rep
  const existing = db.prepare('SELECT id FROM sales_reps WHERE pin = ? AND id != ? AND archived = 0').get(pin.trim(), repId);
  if (existing) return res.status(409).json({ error: 'Ce PIN est déjà utilisé par un autre commercial' });

  db.prepare('UPDATE sales_reps SET pin = ? WHERE id = ?').run(pin.trim(), repId);
  res.json({ ok: true, pin: pin.trim() });
});

// ─── GET /api/weeks/:week_start/dashboard ───────────────────

app.get('/api/weeks/:week_start/dashboard', requireAuth, (req, res) => {
  const db = getDb();
  const weekStart = req.params.week_start;

  ensureWeeklySettings(weekStart);

  const reps = db.prepare("SELECT * FROM sales_reps WHERE role != 'phoneur' AND archived = 0 ORDER BY id").all();

  const settings = db.prepare(`
    SELECT ws.*, sr.name as rep_name, sr.role as rep_role
    FROM weekly_settings ws
    JOIN sales_reps sr ON sr.id = ws.sales_rep_id
    WHERE ws.week_start = ? AND sr.role != 'phoneur' AND sr.archived = 0
    ORDER BY ws.sales_rep_id
  `).all(weekStart);
  // Valeurs gérées via les défauts à la création de la semaine (hours=0, target=300 pour commercial)
  // mais entièrement éditables ensuite

  const salesByRep = db.prepare(`
    SELECT sales_rep_id,
           COALESCE(SUM(amount), 0) as total_ca,
           COUNT(*) as nb_ventes
    FROM sales
    WHERE week_start = ? AND validated = 1
    GROUP BY sales_rep_id
  `).all(weekStart);

  const salesMap = {};
  for (const s of salesByRep) {
    salesMap[s.sales_rep_id] = s;
  }

  // Count missing RIBs per rep for this week (only validated sales)
  const ribManquants = db.prepare(`
    SELECT sales_rep_id, COUNT(*) as count
    FROM sales
    WHERE week_start = ? AND rib_status != 'Reçu' AND validated = 1
    GROUP BY sales_rep_id
  `).all(weekStart);
  const ribMap = {};
  for (const r of ribManquants) { ribMap[r.sales_rep_id] = r.count; }

  const dashboard = settings.map(s => {
    const salesData = salesMap[s.sales_rep_id] || { total_ca: 0, nb_ventes: 0 };
    const ca = salesData.total_ca;
    const nbVentes = salesData.nb_ventes;
    const panierMoyen = nbVentes > 0 ? ca / nbVentes : 0;
    const ratio = s.hours_worked > 0 ? ca / s.hours_worked : 0;
    const objectifAtteint = ratio >= s.target_per_hour;

    return {
      sales_rep_id: s.sales_rep_id,
      rep_name: s.rep_name,
      rep_role: s.rep_role,
      hours_worked: s.hours_worked,
      target_per_hour: s.target_per_hour,
      locked: s.locked,
      transcript: s.transcript || '',
      ca,
      nb_ventes: nbVentes,
      panier_moyen: panierMoyen,
      ratio,
      objectif_atteint: objectifAtteint,
      rib_manquants: ribMap[s.sales_rep_id] || 0
    };
  });

  // Rankings
  const classementCA = [...dashboard].sort((a, b) => b.ca - a.ca);
  const classementRatio = [...dashboard].sort((a, b) => b.ratio - a.ratio);
  const classementPanier = [...dashboard].sort((a, b) => b.panier_moyen - a.panier_moyen);

  res.json({
    week_start: weekStart,
    commerciaux: dashboard,
    classement_ca: classementCA.map((c, i) => ({ rang: i + 1, name: c.rep_name, value: c.ca })),
    classement_ratio: classementRatio.map((c, i) => ({ rang: i + 1, name: c.rep_name, value: c.ratio })),
    classement_panier: classementPanier.map((c, i) => ({ rang: i + 1, name: c.rep_name, value: c.panier_moyen }))
  });
});

// ─── PUT /api/weeks/:week_start/settings/:sales_rep_id ──────

app.put('/api/weeks/:week_start/settings/:sales_rep_id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { week_start, sales_rep_id } = req.params;
  let { hours_worked, target_per_hour } = req.body;

  ensureWeeklySettings(week_start);

  // Heures et target éditables pour tous les rôles (defaults gérés à la création de la semaine)

  // Check lock
  const existing = db.prepare(
    'SELECT locked FROM weekly_settings WHERE week_start = ? AND sales_rep_id = ?'
  ).get(week_start, sales_rep_id);

  if (existing && existing.locked) {
    return res.status(403).json({ error: 'Semaine verrouillée' });
  }

  db.prepare(`
    UPDATE weekly_settings
    SET hours_worked = ?, target_per_hour = ?
    WHERE week_start = ? AND sales_rep_id = ?
  `).run(hours_worked, target_per_hour, week_start, sales_rep_id);

  res.json({ success: true });
});

// ─── PUT /api/weeks/:week_start/lock ────────────────────────

app.put('/api/weeks/:week_start/lock', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { week_start } = req.params;
  const { locked } = req.body;

  db.prepare(`
    UPDATE weekly_settings SET locked = ? WHERE week_start = ?
  `).run(locked ? 1 : 0, week_start);

  res.json({ success: true });
});

// ─── POST /api/sales ────────────────────────────────────────

app.post('/api/sales', requireAuth, (req, res) => {
  const db = getDb();
  const { sales_rep_id, date, amount, client_first_name, client_last_name, rib_status, client_email, remark } = req.body;

  if (!isValidDate(date)) {
    return res.status(400).json({ error: 'Date invalide (format attendu : YYYY-MM-DD)' });
  }

  const weekStart = getMonday(date);

  // Check lock
  const setting = db.prepare(
    'SELECT locked FROM weekly_settings WHERE week_start = ? AND sales_rep_id = ?'
  ).get(weekStart, sales_rep_id);

  if (setting && setting.locked) {
    return res.status(403).json({ error: 'Semaine verrouillée' });
  }

  // Sales added by commercial are not validated (need admin validation)
  // Sales added by admin are auto-validated
  const session = sessions.get(req.headers.authorization?.replace('Bearer ', ''));
  const isAdminUser = session && session.role === 'admin';
  const validated = isAdminUser ? 1 : 0;

  const result = db.prepare(`
    INSERT INTO sales (sales_rep_id, date, amount, client_first_name, client_last_name, week_start, rib_status, client_email, remark, validated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(sales_rep_id, date, amount, client_first_name || '', client_last_name || '', weekStart, rib_status || 'Non fourni', client_email || '', remark || '', validated);

  res.json({ id: result.lastInsertRowid, validated });
});

// ─── POST /api/sales/:id/validate (admin only) ────────────────

app.post('/api/sales/:id/validate', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(id);
  if (!sale) return res.status(404).json({ error: 'Vente non trouvée' });

  db.prepare('UPDATE sales SET validated = 1 WHERE id = ?').run(id);
  res.json({ success: true });
});

// ─── POST /api/sales/:id/unvalidate (admin only) ──────────────

app.post('/api/sales/:id/unvalidate', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(id);
  if (!sale) return res.status(404).json({ error: 'Vente non trouvée' });

  db.prepare('UPDATE sales SET validated = 0 WHERE id = ?').run(id);
  res.json({ success: true });
});

// ─── PUT /api/sales/:id ─────────────────────────────────────

app.put('/api/sales/:id', requireAuth, (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const { sales_rep_id, date, amount, client_first_name, client_last_name, rib_status, client_email, remark } = req.body;

  if (!isValidDate(date)) {
    return res.status(400).json({ error: 'Date invalide (format attendu : YYYY-MM-DD)' });
  }

  const weekStart = getMonday(date);

  const existing = db.prepare('SELECT * FROM sales WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Vente non trouvée' });

  // Check lock on original week
  const setting = db.prepare(
    'SELECT locked FROM weekly_settings WHERE week_start = ? AND sales_rep_id = ?'
  ).get(existing.week_start, existing.sales_rep_id);

  if (setting && setting.locked) {
    return res.status(403).json({ error: 'Semaine verrouillée' });
  }

  db.prepare(`
    UPDATE sales SET sales_rep_id = ?, date = ?, amount = ?, client_first_name = ?, client_last_name = ?, week_start = ?, rib_status = ?, client_email = ?, remark = ?
    WHERE id = ?
  `).run(sales_rep_id, date, amount, client_first_name || '', client_last_name || '', weekStart, rib_status || 'Non fourni', client_email || '', remark || '', id);

  res.json({ success: true });
});

// ─── DELETE /api/sales/:id ──────────────────────────────────

app.delete('/api/sales/:id', requireAuth, (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const existing = db.prepare('SELECT * FROM sales WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Vente non trouvée' });

  const setting = db.prepare(
    'SELECT locked FROM weekly_settings WHERE week_start = ? AND sales_rep_id = ?'
  ).get(existing.week_start, existing.sales_rep_id);

  if (setting && setting.locked) {
    return res.status(403).json({ error: 'Semaine verrouillée' });
  }

  db.prepare('DELETE FROM sales WHERE id = ?').run(id);
  res.json({ success: true });
});

// ─── POST /api/sales/:id/validate-rib ───────────────────────

app.post('/api/sales/:id/validate-rib', requireAuth, (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(id);
  if (!sale) return res.status(404).json({ error: 'Vente non trouvée' });

  // Validate RIB and assign to current week (when button was clicked)
  const today = new Date();
  const day = today.getDay(); // 0=Sun
  const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(today.setDate(diff));
  const currentWeekStart = monday.toISOString().slice(0, 10);

  db.prepare('UPDATE sales SET rib_status = ?, week_start = ? WHERE id = ?').run('Reçu', currentWeekStart, id);
  res.json({ success: true });
});

// ─── POST /api/sales/:id/relance ────────────────────────────

app.post('/api/sales/:id/relance', requireAuth, async (req, res) => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return res.status(503).json({ error: 'Email non configuré. Les relances nécessitent SMTP_HOST, SMTP_USER et SMTP_PASS dans .env', feature: 'email' });
  }

  const db = getDb();
  const { id } = req.params;
  const { level } = req.body; // 1, 2 or 3

  if (![1, 2, 3].includes(level)) {
    return res.status(400).json({ error: 'level doit être 1, 2 ou 3' });
  }

  const sale = db.prepare(`
    SELECT s.*, sr.name as rep_name
    FROM sales s JOIN sales_reps sr ON sr.id = s.sales_rep_id
    WHERE s.id = ?
  `).get(id);

  if (!sale) return res.status(404).json({ error: 'Vente non trouvée' });
  if (sale.rib_status === 'Reçu') return res.status(400).json({ error: 'RIB déjà reçu' });

  // Check sequential: R2 needs R1, R3 needs R2
  if (level === 2 && !sale.r1_sent) return res.status(400).json({ error: 'R1 doit être envoyée avant R2' });
  if (level === 3 && !sale.r2_sent) return res.status(400).json({ error: 'R2 doit être envoyée avant R3' });

  // Check not already sent
  const col = `r${level}_sent`;
  if (sale[col]) return res.status(400).json({ error: `R${level} déjà envoyée le ${sale[col]}` });

  if (!sale.client_email) {
    return res.status(400).json({ error: 'Email client manquant. Modifiez la vente pour ajouter un email.' });
  }

  const clientName = `${sale.client_first_name} ${sale.client_last_name}`.trim() || 'Client';
  const now = new Date().toISOString().slice(0, 10);

  // Email templates
  const templates = {
    1: {
      subject: 'Rappel — RIB en attente pour votre dossier',
      html: `<p>Bonjour ${clientName},</p>
<p>Nous vous rappelons que nous n'avons pas encore reçu votre RIB concernant votre dossier du ${new Date(sale.date).toLocaleDateString('fr-FR')} d'un montant de ${sale.amount} €.</p>
<p>Merci de nous le transmettre dans les meilleurs délais.</p>
<p>Cordialement,<br>L'équipe My Coach Ginkgo</p>`
    },
    2: {
      subject: '2ème relance — RIB toujours manquant',
      html: `<p>Bonjour ${clientName},</p>
<p>Malgré notre précédente relance, nous n'avons toujours pas reçu votre RIB concernant votre dossier du ${new Date(sale.date).toLocaleDateString('fr-FR')} d'un montant de ${sale.amount} €.</p>
<p><strong>Sans réponse de votre part sous 48h, nous serons dans l'obligation d'engager une procédure de recouvrement.</strong></p>
<p>Cordialement,<br>L'équipe My Coach Ginkgo</p>`
    },
    3: {
      subject: 'Mise en contentieux — RIB non fourni',
      html: `<p>Bonjour ${clientName},</p>
<p>Suite à nos relances restées sans réponse concernant votre dossier du ${new Date(sale.date).toLocaleDateString('fr-FR')} d'un montant de ${sale.amount} €, <strong>votre dossier est transmis au service contentieux</strong>.</p>
<p>Cordialement,<br>L'équipe My Coach Ginkgo</p>`
    }
  };

  const template = templates[level];

  try {
    // Send email to client
    await sendEmail({
      to: sale.client_email,
      subject: template.subject,
      html: template.html
    });

    // R3: also send dossier to Fabian (contentieux)
    if (level === 3) {
      const CONTENTIEUX_EMAIL = process.env.CONTENTIEUX_EMAIL || 'fabianfernez@gmail.com';
      await sendEmail({
        to: CONTENTIEUX_EMAIL,
        subject: `[Contentieux] Dossier ${clientName} — RIB non fourni`,
        html: `<h3>Dossier transmis au contentieux</h3>
<table style="border-collapse:collapse;">
<tr><td style="padding:4px 12px;font-weight:bold;">Client</td><td style="padding:4px 12px;">${clientName}</td></tr>
<tr><td style="padding:4px 12px;font-weight:bold;">Email</td><td style="padding:4px 12px;">${sale.client_email}</td></tr>
<tr><td style="padding:4px 12px;font-weight:bold;">Montant</td><td style="padding:4px 12px;">${sale.amount} €</td></tr>
<tr><td style="padding:4px 12px;font-weight:bold;">Date vente</td><td style="padding:4px 12px;">${new Date(sale.date).toLocaleDateString('fr-FR')}</td></tr>
<tr><td style="padding:4px 12px;font-weight:bold;">Commercial</td><td style="padding:4px 12px;">${sale.rep_name}</td></tr>
<tr><td style="padding:4px 12px;font-weight:bold;">R1 envoyée</td><td style="padding:4px 12px;">${sale.r1_sent || '—'}</td></tr>
<tr><td style="padding:4px 12px;font-weight:bold;">R2 envoyée</td><td style="padding:4px 12px;">${sale.r2_sent || '—'}</td></tr>
<tr><td style="padding:4px 12px;font-weight:bold;">R3 envoyée</td><td style="padding:4px 12px;">${now}</td></tr>
</table>`
      });
    }

    // Update DB
    db.prepare(`UPDATE sales SET ${col} = ? WHERE id = ?`).run(now, id);

    res.json({ success: true, level, sent_date: now });
  } catch (err) {
    console.error(`Erreur envoi relance R${level}:`, err.message);
    res.status(500).json({ error: `Erreur d'envoi email: ${err.message}` });
  }
});

// ─── GET /api/weeks/:week_start/sales ───────────────────────

app.get('/api/weeks/:week_start/sales', requireAuth, (req, res) => {
  const db = getDb();
  const { week_start } = req.params;
  const { sales_rep_id } = req.query;

  let query = `
    SELECT s.*, sr.name as rep_name
    FROM sales s
    JOIN sales_reps sr ON sr.id = s.sales_rep_id
    WHERE s.week_start = ?
  `;
  const params = [week_start];

  if (sales_rep_id) {
    query += ' AND s.sales_rep_id = ?';
    params.push(sales_rep_id);
  }

  query += ' ORDER BY s.date DESC, s.id DESC';

  const sales = db.prepare(query).all(...params);
  res.json(sales);
});

// ─── GET /api/months/:yyyy-mm/summary ───────────────────────

app.get('/api/months/:month/summary', requireAuth, (req, res) => {
  const db = getDb();
  const month = req.params.month; // "2025-02"

  const year = parseInt(month.split('-')[0]);
  const mon = parseInt(month.split('-')[1]);
  const lastDay = new Date(year, mon, 0).toISOString().slice(0, 10);

  // Week-month majority rule: only include weeks where ≥4 of 7 days fall in this month
  const monthWeeks = getWeekStartsForMonth(month);
  const { from: dateFrom, to: dateTo } = getDateRangeFromWeeks(monthWeeks);

  const reps = db.prepare("SELECT * FROM sales_reps WHERE role != 'phoneur' AND archived = 0 AND (start_week IS NULL OR start_week <= ?) ORDER BY id").all(lastDay);

  // Get all validated sales from weeks attributed to this month
  const placeholders = monthWeeks.map(() => '?').join(',');
  const allSales = monthWeeks.length > 0 ? db.prepare(`
    SELECT s.*, sr.name as rep_name
    FROM sales s
    JOIN sales_reps sr ON sr.id = s.sales_rep_id
    WHERE s.week_start IN (${placeholders}) AND s.validated = 1
    ORDER BY s.amount DESC
  `).all(...monthWeeks) : [];

  // Total hours per rep across attributed weeks
  const weeklySettings = monthWeeks.length > 0 ? db.prepare(`
    SELECT ws.*, sr.name as rep_name
    FROM weekly_settings ws
    JOIN sales_reps sr ON sr.id = ws.sales_rep_id
    WHERE ws.week_start IN (${placeholders})
  `).all(...monthWeeks) : [];

  // Per-rep stats with cumulated monthly ratio + best single sale
  // Only count sales with RIB received in the recap
  const repStats = reps.map(rep => {
    const repSales = allSales.filter(s => s.sales_rep_id === rep.id && s.rib_status === 'Reçu');
    const ca = repSales.reduce((sum, s) => sum + s.amount, 0);
    const nbVentes = repSales.length;
    const panierMoyen = nbVentes > 0 ? ca / nbVentes : 0;

    const repWeeks = weeklySettings.filter(ws => ws.sales_rep_id === rep.id);
    const totalHours = repWeeks.reduce((sum, ws) => sum + ws.hours_worked, 0);
    const ratioMensuel = totalHours > 0 ? ca / totalHours : 0;
    const objectifCA = repWeeks.reduce((sum, ws) => sum + ws.hours_worked * ws.target_per_hour, 0);

    // Best single sale for this rep
    const bestSale = repSales.length > 0 ? repSales[0].amount : 0; // already sorted DESC

    return {
      sales_rep_id: rep.id,
      name: rep.name,
      ca,
      nb_ventes: nbVentes,
      panier_moyen: panierMoyen,
      total_hours: totalHours,
      ratio_mensuel: ratioMensuel,
      best_sale: bestSale,
      objectif_ca: objectifCA
    };
  });

  // Global
  const globalCA = repStats.reduce((s, r) => s + r.ca, 0);
  const globalNbVentes = repStats.reduce((s, r) => s + r.nb_ventes, 0);
  const globalPanierMoyen = globalNbVentes > 0 ? globalCA / globalNbVentes : 0;

  // Best sale(s) — deduplicated: one per commercial at max amount
  let bestSales = [];
  if (allSales.length > 0) {
    const maxAmount = allSales[0].amount;
    const tiedSales = allSales.filter(s => s.amount === maxAmount);
    // Keep one per commercial
    const seen = new Set();
    for (const s of tiedSales) {
      if (!seen.has(s.sales_rep_id)) {
        seen.add(s.sales_rep_id);
        bestSales.push({
          amount: s.amount,
          rep_name: s.rep_name,
          client: `${s.client_first_name} ${s.client_last_name}`.trim(),
          date: s.date
        });
      }
    }
  }

  res.json({
    month,
    rep_stats: repStats,
    global: {
      ca: globalCA,
      nb_ventes: globalNbVentes,
      panier_moyen: globalPanierMoyen
    },
    best_sales: bestSales
  });
});

// ─── GET /api/months/:month/analysis-data ─────────────────────
// Returns per-rep data needed for individual analysis:
// - monthly counters (HS, references, rdv_fixes, entretien_premier_mois, contact_entreprise)
// - sales without RIB count
// - commercial days worked (distinct days with daily_action_values)
// - days with ALL predefined actions completed vs total commercial days

app.get('/api/months/:month/analysis-data', requireAuth, (req, res) => {
  const db = getDb();
  const month = req.params.month;
  const year = parseInt(month.split('-')[0]);
  const mon = parseInt(month.split('-')[1]);
  const lastDay = new Date(year, mon, 0).toISOString().slice(0, 10);

  // Week-month majority rule
  const monthWeeks = getWeekStartsForMonth(month);
  const { from: dateFrom, to: dateTo } = getDateRangeFromWeeks(monthWeeks);

  const reps = db.prepare("SELECT * FROM sales_reps WHERE role != 'phoneur' AND archived = 0 AND (start_week IS NULL OR start_week <= ?) ORDER BY id").all(lastDay);

  // Total predefined actions count (yesno + counters)
  const PREDEFINED_ACTION_COUNT = 9; // 5 yesno + 4 counters

  const placeholdersA = monthWeeks.map(() => '?').join(',');

  const result = reps.map(rep => {
    // 1. Monthly counters — combine predefined: and club2: (normalize to predefined:)
    const counters = db.prepare(`
      SELECT
        CASE WHEN action_key LIKE 'club2:%' THEN 'predefined:' || SUBSTR(action_key, 7) ELSE action_key END as norm_key,
        SUM(value) as total
      FROM daily_action_values
      WHERE sales_rep_id = ? AND date >= ? AND date <= ? AND (action_key LIKE 'predefined:%' OR action_key LIKE 'club2:%')
      GROUP BY norm_key
    `).all(rep.id, dateFrom, dateTo);

    const totals = {};
    counters.forEach(c => { totals[c.norm_key.replace('predefined:', '')] = c.total; });

    // 2. Sales without RIB for this rep (from weeks attributed to this month, validated only)
    const salesNoRib = monthWeeks.length > 0 ? db.prepare(`
      SELECT COUNT(*) as count FROM sales
      WHERE sales_rep_id = ? AND week_start IN (${placeholdersA}) AND rib_status != 'Reçu' AND validated = 1
    `).get(rep.id, ...monthWeeks) : { count: 0 };

    // 3. Total sales count (validated only) for reference comparison
    const totalSalesAll = monthWeeks.length > 0 ? db.prepare(`
      SELECT COUNT(*) as count FROM sales
      WHERE sales_rep_id = ? AND week_start IN (${placeholdersA}) AND validated = 1
    `).get(rep.id, ...monthWeeks) : { count: 0 };

    // 4. Commercial days = distinct days with at least one action value > 0 (either club)
    const commercialDays = db.prepare(`
      SELECT COUNT(DISTINCT date) as count
      FROM daily_action_values
      WHERE sales_rep_id = ? AND date >= ? AND date <= ? AND (action_key LIKE 'predefined:%' OR action_key LIKE 'club2:%') AND value > 0
    `).get(rep.id, dateFrom, dateTo);

    // 5. Days with ALL actions completed per used club
    const dayDetails = db.prepare(`
      SELECT date,
        CASE WHEN action_key LIKE 'predefined:%' THEN 'c1' ELSE 'c2' END as club,
        COUNT(DISTINCT CASE WHEN action_key LIKE 'club2:%' THEN 'predefined:' || SUBSTR(action_key, 7) ELSE action_key END) as actions_done
      FROM daily_action_values
      WHERE sales_rep_id = ? AND date >= ? AND date <= ? AND (action_key LIKE 'predefined:%' OR action_key LIKE 'club2:%') AND value > 0
      GROUP BY date, club
    `).all(rep.id, dateFrom, dateTo);

    // Group by date
    const dayMap = {};
    dayDetails.forEach(d => {
      if (!dayMap[d.date]) dayMap[d.date] = {};
      dayMap[d.date][d.club] = d.actions_done;
    });
    let completeDaysCount = 0;
    for (const [, clubs] of Object.entries(dayMap)) {
      let allComplete = true;
      for (const [, count] of Object.entries(clubs)) {
        if (count < PREDEFINED_ACTION_COUNT) allComplete = false;
      }
      if (allComplete) completeDaysCount++;
    }

    // 6. RDV objectif per day = 2 (10 per week / 5 days)
    const rdvObjectifParJour = 2;

    return {
      sales_rep_id: rep.id,
      name: rep.name,
      counters: totals,
      sales_no_rib: salesNoRib?.count || 0,
      total_sales_all: totalSalesAll?.count || 0,
      commercial_days: commercialDays?.count || 0,
      complete_days: completeDaysCount,
      rdv_objectif_par_jour: rdvObjectifParJour
    };
  });

  res.json({ month, reps: result });
});

// ─── GET /api/months/:month/weekly-breakdown ─────────────────

app.get('/api/months/:month/weekly-breakdown', requireAuth, (req, res) => {
  const db = getDb();
  const month = req.params.month;
  const year = parseInt(month.split('-')[0]);
  const mon = parseInt(month.split('-')[1]);
  const lastDay = new Date(year, mon, 0).toISOString().slice(0, 10);

  // Week-month majority rule
  const monthWeeks = getWeekStartsForMonth(month);

  const reps = db.prepare("SELECT * FROM sales_reps WHERE role != 'phoneur' AND archived = 0 AND (start_week IS NULL OR start_week <= ?) ORDER BY id").all(lastDay);

  const weeklyData = monthWeeks.map(ws => {
    const [wy, wm, wd] = ws.split('-').map(Number);
    const weekEndDate = new Date(wy, wm - 1, wd + 6);

    const startDate = new Date(wy, wm - 1, wd);
    const startLabel = startDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    const endLabel = weekEndDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

    const repData = reps.filter(rep => !rep.start_week || rep.start_week <= ws).map(rep => {
      // All validated sales for this rep in this week
      const salesRow = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as ca, COUNT(*) as nb_ventes
        FROM sales
        WHERE sales_rep_id = ? AND week_start = ? AND rib_status = 'Reçu' AND validated = 1
      `).get(rep.id, ws);

      const settings = db.prepare(`
        SELECT hours_worked, target_per_hour
        FROM weekly_settings
        WHERE week_start = ? AND sales_rep_id = ?
      `).get(ws, rep.id);

      const ca = salesRow.ca;
      const nbVentes = salesRow.nb_ventes;
      const panierMoyen = nbVentes > 0 ? ca / nbVentes : 0;
      const hours = settings ? settings.hours_worked : 0;
      const ratio = hours > 0 ? ca / hours : 0;

      return {
        sales_rep_id: rep.id,
        name: rep.name,
        ca,
        nb_ventes: nbVentes,
        panier_moyen: panierMoyen,
        hours_worked: hours,
        ratio
      };
    });

    return {
      week_start: ws,
      label: `${startLabel} - ${endLabel}`,
      reps: repData
    };
  });

  res.json({ month, weeks: weeklyData });
});

// ─── Transcript ─────────────────────────────────────────────

app.get('/api/weeks/:week_start/transcript/:sales_rep_id', requireAuth, (req, res) => {
  const db = getDb();
  const { week_start, sales_rep_id } = req.params;
  ensureWeeklySettings(week_start);

  const row = db.prepare(
    'SELECT transcript FROM weekly_settings WHERE week_start = ? AND sales_rep_id = ?'
  ).get(week_start, sales_rep_id);

  res.json({ transcript: row?.transcript || '' });
});

app.put('/api/weeks/:week_start/transcript/:sales_rep_id', requireAuth, (req, res) => {
  const db = getDb();
  const { week_start, sales_rep_id } = req.params;
  const { transcript } = req.body;

  ensureWeeklySettings(week_start);

  db.prepare(
    'UPDATE weekly_settings SET transcript = ? WHERE week_start = ? AND sales_rep_id = ?'
  ).run(transcript || '', week_start, sales_rep_id);

  res.json({ success: true });
});

// ─── Chat Messages ──────────────────────────────────────────

app.get('/api/weeks/:week_start/messages/:sales_rep_id', requireAuth, (req, res) => {
  const db = getDb();
  const { week_start, sales_rep_id } = req.params;

  const messages = db.prepare(
    'SELECT * FROM transcript_messages WHERE week_start = ? AND sales_rep_id = ? ORDER BY created_at ASC'
  ).all(week_start, sales_rep_id);

  // Also return legacy transcript if any
  const legacy = db.prepare(
    'SELECT transcript FROM weekly_settings WHERE week_start = ? AND sales_rep_id = ?'
  ).get(week_start, sales_rep_id);

  res.json({ messages, legacy_transcript: legacy?.transcript || '' });
});

app.post('/api/weeks/:week_start/messages/:sales_rep_id', requireAuth, (req, res) => {
  const db = getDb();
  const { week_start, sales_rep_id } = req.params;
  const { message } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message vide' });
  }

  const result = db.prepare(
    'INSERT INTO transcript_messages (sales_rep_id, week_start, message) VALUES (?, ?, ?)'
  ).run(sales_rep_id, week_start, message.trim());

  const created = db.prepare('SELECT * FROM transcript_messages WHERE id = ?').get(result.lastInsertRowid);
  res.json(created);
});

app.delete('/api/messages/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const existing = db.prepare('SELECT * FROM transcript_messages WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Message non trouvé' });

  db.prepare('DELETE FROM transcript_messages WHERE id = ?').run(id);
  res.json({ success: true });
});

// ─── Transcript Analysis (AI) ────────────────────────────────

app.post('/api/analyze-transcript', requireAuth, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'votre_cle_api_ici') {
    return res.status(503).json({ error: 'Analyse IA non configurée. Définissez ANTHROPIC_API_KEY dans .env', feature: 'ai' });
  }

  const { transcript, rep_name, week_start, hours_worked, target_per_hour, ca, nb_ventes, panier_moyen, ratio } = req.body;

  if (!transcript || !transcript.trim()) {
    return res.status(400).json({ error: 'Transcript vide' });
  }

  try {
    const client = new Anthropic({ apiKey });

    const weekEnd = (() => {
      const [y, m, d] = week_start.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      dt.setDate(dt.getDate() + 6);
      return dt.toLocaleDateString('fr-FR');
    })();
    const weekStartFR = (() => {
      const [y, m, d] = week_start.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString('fr-FR');
    })();

    const contextInfo = `
Contexte du conseiller commercial : ${rep_name}
Semaine du ${weekStartFR} au ${weekEnd}
- Heures travaillées : ${hours_worked}h
- Objectif : ${target_per_hour} €/h
- CA réalisé : ${ca} €
- Nombre de ventes : ${nb_ventes}
- Panier moyen : ${panier_moyen.toFixed(0)} €
- Ratio CA/h : ${ratio.toFixed(2)} €/h
- Objectif atteint : ${ratio >= target_per_hour ? 'Oui' : 'Non'}
`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Tu es un manager commercial expert. Analyse le transcript suivant d'un échange avec un conseiller commercial et produis une synthèse structurée en bullet points.

${contextInfo}

TRANSCRIPT DE L'ÉCHANGE :
${transcript}

Produis une synthèse en français avec ces 3 sections, chacune sous forme de bullet points concis :

**Points clés de l'échange**
- Les idées principales discutées, les constats sur la performance, les points forts et axes d'amélioration identifiés

**Plan d'action pour la semaine prochaine**
- Comment le conseiller va atteindre son objectif la semaine suivante, les actions concrètes prévues

**Éléments complémentaires**
- Tout autre élément pertinent (état d'esprit, besoins de formation, alertes, etc.)

Sois synthétique et direct. Utilise des bullet points courts et percutants.`
        }
      ]
    });

    const analysis = message.content[0].text;
    res.json({ analysis });
  } catch (e) {
    console.error('Erreur analyse transcript:', e.message);
    if (e.message?.includes('API key') || e.message?.includes('authentication') || e.status === 401) {
      return res.status(500).json({ error: 'Clé API Anthropic manquante ou invalide. Définissez ANTHROPIC_API_KEY dans vos variables d\'environnement.' });
    }
    res.status(500).json({ error: 'Erreur lors de l\'analyse: ' + e.message });
  }
});

// ─── CSV Exports ────────────────────────────────────────────

app.get('/api/export/week/:week_start', requireAuth, (req, res) => {
  const db = getDb();
  const { week_start } = req.params;

  const sales = db.prepare(`
    SELECT s.date, sr.name as commercial, s.amount, s.client_first_name, s.client_last_name, s.rib_status
    FROM sales s
    JOIN sales_reps sr ON sr.id = s.sales_rep_id
    WHERE s.week_start = ?
    ORDER BY s.date, sr.name
  `).all(week_start);

  let csv = 'Date,Commercial,Montant,Prénom Client,Nom Client,Statut RIB\n';
  for (const s of sales) {
    csv += `${escapeCsvField(s.date)},${escapeCsvField(s.commercial)},${s.amount},${escapeCsvField(s.client_first_name)},${escapeCsvField(s.client_last_name)},${escapeCsvField(s.rib_status || 'Non fourni')}\n`;
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=ventes-semaine-${week_start}.csv`);
  res.send('\uFEFF' + csv); // BOM for Excel
});

app.get('/api/export/month/:month', requireAuth, (req, res) => {
  const db = getDb();
  const month = req.params.month;
  const year = parseInt(month.split('-')[0]);
  const mon = parseInt(month.split('-')[1]);
  const firstDay = `${month}-01`;
  const lastDay = new Date(year, mon, 0).toISOString().slice(0, 10);

  const sales = db.prepare(`
    SELECT s.date, sr.name as commercial, s.amount, s.client_first_name, s.client_last_name, s.rib_status
    FROM sales s
    JOIN sales_reps sr ON sr.id = s.sales_rep_id
    WHERE s.date >= ? AND s.date <= ?
    ORDER BY s.date, sr.name
  `).all(firstDay, lastDay);

  let csv = 'Date,Commercial,Montant,Prénom Client,Nom Client,Statut RIB\n';
  for (const s of sales) {
    csv += `${escapeCsvField(s.date)},${escapeCsvField(s.commercial)},${s.amount},${escapeCsvField(s.client_first_name)},${escapeCsvField(s.client_last_name)},${escapeCsvField(s.rib_status || 'Non fourni')}\n`;
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=ventes-mois-${month}.csv`);
  res.send('\uFEFF' + csv);
});

// ─── Daily Actions: Types CRUD ──────────────────────────────

app.get('/api/daily-actions/types/:sales_rep_id', requireAuth, (req, res) => {
  const db = getDb();
  const types = db.prepare(
    'SELECT * FROM daily_action_types WHERE sales_rep_id = ? ORDER BY sort_order, id'
  ).all(req.params.sales_rep_id);
  res.json(types);
});

app.post('/api/daily-actions/types/:sales_rep_id', requireAuth, (req, res) => {
  const db = getDb();
  const { name, type } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nom requis' });
  if (!['counter', 'yesno'].includes(type)) return res.status(400).json({ error: 'Type invalide' });

  const maxOrder = db.prepare(
    'SELECT MAX(sort_order) as m FROM daily_action_types WHERE sales_rep_id = ?'
  ).get(req.params.sales_rep_id);

  const result = db.prepare(
    'INSERT INTO daily_action_types (sales_rep_id, name, type, sort_order) VALUES (?, ?, ?, ?)'
  ).run(req.params.sales_rep_id, name.trim(), type, (maxOrder?.m || 0) + 1);

  const newType = db.prepare('SELECT * FROM daily_action_types WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(newType);
});

app.delete('/api/daily-actions/types/:id', requireAuth, (req, res) => {
  const db = getDb();
  const typeId = parseInt(req.params.id);
  // Delete associated values
  db.prepare("DELETE FROM daily_action_values WHERE action_key = 'custom:' || ?").run(typeId);
  const result = db.prepare('DELETE FROM daily_action_types WHERE id = ?').run(typeId);
  if (result.changes === 0) return res.status(404).json({ error: 'Type non trouvé' });
  res.json({ ok: true });
});

// ─── Daily Actions: Values ──────────────────────────────────

// ─── Admin: All actions for all commercials for a week ────────
app.get('/api/admin/actions/:weekStart', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const weekStart = req.params.weekStart;

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }

  const reps = db.prepare("SELECT id, name FROM sales_reps WHERE role != 'phoneur' AND archived = 0 ORDER BY name").all();

  const result = reps.map(rep => {
    const rows = db.prepare(`
      SELECT action_key, date, value
      FROM daily_action_values
      WHERE sales_rep_id = ? AND date >= ? AND date <= ? AND (action_key LIKE 'predefined:%' OR action_key LIKE 'club2:%')
    `).all(rep.id, days[0], days[6]);

    // Build per-day map
    const byDay = {};
    days.forEach(d => { byDay[d] = {}; });
    rows.forEach(r => {
      if (!byDay[r.date]) byDay[r.date] = {};
      byDay[r.date][r.action_key] = r.value;
    });

    return {
      sales_rep_id: rep.id,
      name: rep.name,
      days: byDay
    };
  });

  res.json({ week_start: weekStart, days, reps: result });
});

// ─── Admin: Actions summary for a month (comparison table) ───
app.get('/api/admin/actions-summary/:month', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const month = req.params.month;
  const firstDay = month + '-01';
  const year = parseInt(month.split('-')[0]);
  const mon = parseInt(month.split('-')[1]);
  const lastDay = new Date(year, mon, 0).toISOString().slice(0, 10);

  const reps = db.prepare("SELECT id, name FROM sales_reps WHERE role != 'phoneur' AND archived = 0 ORDER BY name").all();

  const result = reps.map(rep => {
    // Hours from weekly_settings
    const hoursRow = db.prepare(`
      SELECT COALESCE(SUM(hours_worked), 0) as total_hours
      FROM weekly_settings
      WHERE sales_rep_id = ? AND week_start >= date(?, '-6 days') AND week_start <= ?
    `).get(rep.id, firstDay, lastDay);

    // Action counters (predefined + club2 summed)
    const actions = db.prepare(`
      SELECT action_key, SUM(value) as total
      FROM daily_action_values
      WHERE sales_rep_id = ? AND date >= ? AND date <= ? AND (action_key LIKE 'predefined:%' OR action_key LIKE 'club2:%')
      GROUP BY action_key
    `).all(rep.id, firstDay, lastDay);

    const totals = {};
    actions.forEach(a => {
      // Normalize key: 'predefined:references' and 'club2:references' both → 'references'
      const key = a.action_key.replace('predefined:', '').replace('club2:', '');
      totals[key] = (totals[key] || 0) + a.total;
    });

    // Count days with all yesno actions done (both clubs if used)
    const daysWorked = db.prepare(`
      SELECT COUNT(DISTINCT date) as count
      FROM daily_action_values
      WHERE sales_rep_id = ? AND date >= ? AND date <= ? AND (action_key LIKE 'predefined:%' OR action_key LIKE 'club2:%') AND value > 0
    `).get(rep.id, firstDay, lastDay);

    return {
      sales_rep_id: rep.id,
      name: rep.name,
      total_hours: hoursRow.total_hours,
      days_active: daysWorked?.count || 0,
      totals
    };
  });

  res.json({ month, reps: result });
});

app.get('/api/daily-actions/values/:sales_rep_id/:date', requireAuth, (req, res) => {
  const db = getDb();
  const values = db.prepare(
    'SELECT * FROM daily_action_values WHERE sales_rep_id = ? AND date = ?'
  ).all(req.params.sales_rep_id, req.params.date);
  res.json(values);
});

app.put('/api/daily-actions/values/:sales_rep_id/:date', requireAuth, (req, res) => {
  const db = getDb();
  const { action_key, value } = req.body;
  if (!action_key) return res.status(400).json({ error: 'action_key requis' });

  db.prepare(`
    INSERT INTO daily_action_values (sales_rep_id, action_key, date, value)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(sales_rep_id, action_key, date) DO UPDATE SET value = excluded.value
  `).run(req.params.sales_rep_id, action_key, req.params.date, value || 0);

  res.json({ ok: true });
});

// ─── Admin: Energy levels per week ───────────────────────────

app.get('/api/admin/energy/:weekStart', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const weekStart = req.params.weekStart; // format: 2026-03-09 (Monday)

  // Build 7 days from weekStart
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }

  const reps = db.prepare("SELECT id, name FROM sales_reps WHERE role != 'phoneur' AND archived = 0 ORDER BY name").all();

  const result = reps.map(rep => {
    // Get energy from both clubs and average per day
    const rows = db.prepare(`
      SELECT date, AVG(value) as value FROM daily_action_values
      WHERE sales_rep_id = ? AND (action_key = 'predefined:energie' OR action_key = 'club2:energie') AND date >= ? AND date <= ? AND value > 0
      GROUP BY date
    `).all(rep.id, days[0], days[6]);

    const byDate = {};
    rows.forEach(r => { byDate[r.date] = Math.round(r.value); });

    const values = days.map(d => byDate[d] || null);
    const filled = values.filter(v => v !== null);
    const avg = filled.length > 0 ? Math.round((filled.reduce((s, v) => s + v, 0) / filled.length) * 10) / 10 : null;

    return {
      sales_rep_id: rep.id,
      name: rep.name,
      days: values,
      avg,
      count: filled.length
    };
  });

  res.json({ week_start: weekStart, days, reps: result });
});

// ─── Monthly aggregation of daily action counters ────────────

app.get('/api/daily-actions/monthly/:month', requireAuth, (req, res) => {
  const db = getDb();
  const month = req.params.month; // format: 2026-03
  const startDate = month + '-01';
  const endDate = month + '-31';

  // Combine predefined: and club2: counters by normalizing keys to predefined:
  const rows = db.prepare(`
    SELECT sales_rep_id,
      CASE WHEN action_key LIKE 'club2:%' THEN 'predefined:' || SUBSTR(action_key, 7) ELSE action_key END as action_key,
      SUM(value) as total
    FROM daily_action_values
    WHERE date >= ? AND date <= ? AND (action_key LIKE 'predefined:%' OR action_key LIKE 'club2:%')
    GROUP BY sales_rep_id, CASE WHEN action_key LIKE 'club2:%' THEN 'predefined:' || SUBSTR(action_key, 7) ELSE action_key END
  `).all(startDate, endDate);

  res.json(rows);
});

// ─── Discipline badge: count non-zero actions per rep for a month ──
app.get('/api/daily-actions/discipline/:month', requireAuth, (req, res) => {
  const db = getDb();
  const month = req.params.month;
  const startDate = month + '-01';
  const endDate = month + '-31';

  const rows = db.prepare(`
    SELECT sales_rep_id, COUNT(*) as total_actions
    FROM daily_action_values
    WHERE date >= ? AND date <= ? AND value > 0 AND (action_key LIKE 'predefined:%' OR action_key LIKE 'club2:%')
    GROUP BY sales_rep_id
  `).all(startDate, endDate);

  res.json(rows);
});

// ─── Phoning: monthly aggregation for a phoneur ─────────────
app.get('/api/phoning/monthly/:sales_rep_id/:month', requireAuth, (req, res) => {
  const db = getDb();
  const repId = parseInt(req.params.sales_rep_id);
  const month = req.params.month;
  const startDate = month + '-01';
  const endDate = month + '-31';

  // Aggregate all phoning: values for this rep/month
  const rows = db.prepare(`
    SELECT action_key, SUM(value) as total
    FROM daily_action_values
    WHERE sales_rep_id = ? AND date >= ? AND date <= ? AND action_key LIKE 'phoning:%'
    GROUP BY action_key
  `).all(repId, startDate, endDate);

  // Count distinct days worked (at least one phoning value > 0)
  const daysWorked = db.prepare(`
    SELECT COUNT(DISTINCT date) as count
    FROM daily_action_values
    WHERE sales_rep_id = ? AND date >= ? AND date <= ? AND action_key LIKE 'phoning:%' AND value > 0
  `).get(repId, startDate, endDate);

  res.json({ totals: rows, days_worked: daysWorked?.count || 0 });
});

// ─── Phoning: all phoneurs monthly summary (admin) ───────────
app.get('/api/phoning/all-monthly/:month', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const month = req.params.month;
  const startDate = month + '-01';
  const endDate = month + '-31';

  // Get all phoneurs
  const phoneurs = db.prepare("SELECT id, name FROM sales_reps WHERE role = 'phoneur' AND archived = 0 ORDER BY name").all();

  const results = phoneurs.map(p => {
    const rows = db.prepare(`
      SELECT action_key, SUM(value) as total
      FROM daily_action_values
      WHERE sales_rep_id = ? AND date >= ? AND date <= ? AND action_key LIKE 'phoning:%'
      GROUP BY action_key
    `).all(p.id, startDate, endDate);

    const daysWorked = db.prepare(`
      SELECT COUNT(DISTINCT date) as count
      FROM daily_action_values
      WHERE sales_rep_id = ? AND date >= ? AND date <= ? AND action_key LIKE 'phoning:%' AND value > 0
    `).get(p.id, startDate, endDate);

    const totals = {};
    rows.forEach(r => { totals[r.action_key.replace('phoning:', '')] = r.total; });

    return {
      sales_rep_id: p.id,
      name: p.name,
      days_worked: daysWorked?.count || 0,
      totals
    };
  });

  res.json({ month, phoneurs: results });
});

// ─── Admin: Control tab data ─────────────────────────────────

app.get('/api/control/:sales_rep_id/:week_start', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const repId = parseInt(req.params.sales_rep_id);
  const weekStart = req.params.week_start;

  // 1. CA de la semaine (only validated sales count)
  const caRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as ca, COUNT(*) as nb_ventes
    FROM sales WHERE sales_rep_id = ? AND week_start = ? AND validated = 1
  `).get(repId, weekStart);

  // 2. Ventes de la semaine avec détails (show all, including non-validated)
  const sales = db.prepare(`
    SELECT id, date, amount, client_first_name, client_last_name, rib_status, controlled, sales_rep_id, validated
    FROM sales WHERE sales_rep_id = ? AND week_start = ?
    ORDER BY date DESC, id DESC
  `).all(repId, weekStart);

  // 3. Heures et objectif de la semaine
  const settings = db.prepare(`
    SELECT hours_worked, target_per_hour, hours_controlled
    FROM weekly_settings WHERE week_start = ? AND sales_rep_id = ?
  `).get(weekStart, repId);

  // 4. Badges du mois (besoin du mois en cours basé sur la semaine)
  const month = weekStart.slice(0, 7);

  res.json({
    ca: caRow.ca,
    nb_ventes: caRow.nb_ventes,
    sales,
    hours_worked: settings?.hours_worked || 0,
    target_per_hour: settings?.target_per_hour || 250,
    hours_controlled: settings?.hours_controlled || 0,
    month
  });
});

// ─── Admin: Toggle sale controlled ───────────────────────────

app.put('/api/sales/:id/controlled', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const saleId = parseInt(req.params.id);
  const { controlled } = req.body;
  const val = controlled ? 1 : 0;
  db.prepare('UPDATE sales SET controlled = ? WHERE id = ?').run(val, saleId);
  res.json({ ok: true, controlled: val });
});

// ─── Admin: Control hours (validate + update) ───────────────

app.put('/api/control/:sales_rep_id/:week_start/hours', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const repId = parseInt(req.params.sales_rep_id);
  const weekStart = req.params.week_start;
  const { hours_worked, hours_controlled } = req.body;

  ensureWeeklySettings(weekStart);

  if (hours_worked !== undefined) {
    db.prepare('UPDATE weekly_settings SET hours_worked = ? WHERE week_start = ? AND sales_rep_id = ?')
      .run(hours_worked, weekStart, repId);
  }
  if (hours_controlled !== undefined) {
    db.prepare('UPDATE weekly_settings SET hours_controlled = ? WHERE week_start = ? AND sales_rep_id = ?')
      .run(hours_controlled ? 1 : 0, weekStart, repId);
  }

  res.json({ ok: true });
});

// ─── Admin: Remove rep from a specific week ─────────────────

app.delete('/api/weeks/:week_start/rep/:sales_rep_id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const weekStart = req.params.week_start;
  const repId = parseInt(req.params.sales_rep_id);

  // Get week end date (Sunday)
  const startD = new Date(weekStart + 'T00:00:00');
  const endD = new Date(startD);
  endD.setDate(endD.getDate() + 6);
  const weekEnd = endD.toISOString().slice(0, 10);

  // Delete weekly_settings for this rep/week
  db.prepare('DELETE FROM weekly_settings WHERE week_start = ? AND sales_rep_id = ?').run(weekStart, repId);

  // Delete sales for this rep/week
  db.prepare('DELETE FROM sales WHERE week_start = ? AND sales_rep_id = ?').run(weekStart, repId);

  // Delete daily action values for this rep in this week's date range
  db.prepare('DELETE FROM daily_action_values WHERE sales_rep_id = ? AND date >= ? AND date <= ?').run(repId, weekStart, weekEnd);

  // Delete transcript messages for this rep/week
  db.prepare('DELETE FROM transcript_messages WHERE sales_rep_id = ? AND week_start = ?').run(repId, weekStart);

  res.json({ ok: true });
});

// ─── Webhook: POST /api/webhook/sales (single) ──────────────

app.post('/api/webhook/sales', webhookAuth, (req, res) => {
  const db = getDb();
  const sale = req.body;

  const { errors, resolvedRepId } = validateSalePayload(sale, db);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation échouée', details: errors });
  }

  const weekStart = getMonday(sale.date);
  ensureWeeklySettings(weekStart);

  const setting = db.prepare(
    'SELECT locked FROM weekly_settings WHERE week_start = ? AND sales_rep_id = ?'
  ).get(weekStart, resolvedRepId);

  if (setting && setting.locked) {
    return res.status(403).json({ error: 'Semaine verrouillée', week_start: weekStart });
  }

  const ribStatus = sale.rib_status || 'Non fourni';

  const result = db.prepare(`
    INSERT INTO sales (sales_rep_id, date, amount, client_first_name, client_last_name, week_start, rib_status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    resolvedRepId,
    sale.date,
    sale.amount,
    sale.client_first_name || '',
    sale.client_last_name || '',
    weekStart,
    ribStatus
  );

  res.status(201).json({
    success: true,
    id: Number(result.lastInsertRowid),
    week_start: weekStart,
    sales_rep_id: resolvedRepId,
    rib_status: ribStatus
  });
});

// ─── Webhook: POST /api/webhook/sales/bulk ───────────────────

app.post('/api/webhook/sales/bulk', webhookAuth, (req, res) => {
  const db = getDb();
  const { sales } = req.body;

  if (!Array.isArray(sales) || sales.length === 0) {
    return res.status(400).json({ error: 'Le body doit contenir un tableau "sales" non vide' });
  }

  if (sales.length > 100) {
    return res.status(400).json({ error: 'Maximum 100 ventes par requête bulk' });
  }

  const results = [];
  const insertStmt = db.prepare(`
    INSERT INTO sales (sales_rep_id, date, amount, client_first_name, client_last_name, week_start, rib_status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAll = db.transaction(() => {
    for (let i = 0; i < sales.length; i++) {
      const sale = sales[i];
      const { errors, resolvedRepId } = validateSalePayload(sale, db);

      if (errors.length > 0) {
        results.push({ index: i, success: false, errors });
        continue;
      }

      const weekStart = getMonday(sale.date);
      ensureWeeklySettings(weekStart);

      const setting = db.prepare(
        'SELECT locked FROM weekly_settings WHERE week_start = ? AND sales_rep_id = ?'
      ).get(weekStart, resolvedRepId);

      if (setting && setting.locked) {
        results.push({ index: i, success: false, errors: ['Semaine verrouillée : ' + weekStart] });
        continue;
      }

      const ribStatus = sale.rib_status || 'Non fourni';

      const result = insertStmt.run(
        resolvedRepId,
        sale.date,
        sale.amount,
        sale.client_first_name || '',
        sale.client_last_name || '',
        weekStart,
        ribStatus
      );

      results.push({
        index: i,
        success: true,
        id: Number(result.lastInsertRowid),
        week_start: weekStart
      });
    }
  });

  try {
    insertAll();
  } catch (e) {
    return res.status(500).json({ error: 'Erreur bulk insert : ' + e.message });
  }

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  res.status(successCount > 0 ? 201 : 400).json({
    total: sales.length,
    success: successCount,
    failed: failCount,
    results
  });
});

// ─── Webhook: GET /api/webhook/sales-reps ────────────────────

app.get('/api/webhook/sales-reps', webhookAuth, (req, res) => {
  const db = getDb();
  const reps = db.prepare('SELECT id, name, external_id FROM sales_reps ORDER BY id').all();
  res.json(reps);
});

// ─── Webhook: PUT /api/webhook/sales-reps/:id ────────────────

app.put('/api/webhook/sales-reps/:id', webhookAuth, (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const { external_id } = req.body;

  const rep = db.prepare('SELECT * FROM sales_reps WHERE id = ?').get(id);
  if (!rep) return res.status(404).json({ error: 'Commercial non trouvé' });

  if (external_id) {
    const existing = db.prepare('SELECT id FROM sales_reps WHERE external_id = ? AND id != ?').get(external_id, id);
    if (existing) {
      return res.status(409).json({ error: `external_id "${external_id}" est déjà assigné à un autre commercial` });
    }
  }

  db.prepare('UPDATE sales_reps SET external_id = ? WHERE id = ?').run(external_id || null, id);
  res.json({ success: true, id: Number(id), external_id: external_id || null });
});

// ─── Email ──────────────────────────────────────────────────

app.post('/api/email/test', requireAuth, requireAdmin, async (req, res) => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return res.status(503).json({ error: 'Email non configuré. Définissez SMTP_HOST, SMTP_USER et SMTP_PASS dans .env', feature: 'email' });
  }
  const testTo = process.env.SMTP_FROM || process.env.SMTP_USER;
  if (!testTo) {
    return res.status(503).json({ error: 'SMTP_FROM ou SMTP_USER manquant dans .env', feature: 'email' });
  }

  try {
    await verifyConnection();
    const info = await sendEmail({
      to: testTo,
      subject: 'Test Email - App Commerciaux',
      html: '<h2>Test réussi</h2><p>L\'envoi d\'email fonctionne correctement depuis l\'application.</p>',
      text: 'Test réussi. L\'envoi d\'email fonctionne correctement depuis l\'application.',
    });
    console.log('Email de test envoyé:', info.messageId);
    res.json({ success: true, messageId: info.messageId });
  } catch (e) {
    console.error('Erreur envoi email test:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/email/send', requireAuth, requireAdmin, async (req, res) => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return res.status(503).json({ error: 'Email non configuré. Définissez SMTP_HOST, SMTP_USER et SMTP_PASS dans .env', feature: 'email' });
  }

  const { to, subject, html, text } = req.body;

  // Validation
  const errors = [];
  if (!to || typeof to !== 'string' || !to.includes('@')) {
    errors.push('Destinataire (to) invalide');
  }
  if (!subject || typeof subject !== 'string' || !subject.trim()) {
    errors.push('Sujet (subject) requis');
  }
  if (!html && !text) {
    errors.push('Corps du message (html ou text) requis');
  }
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation échouée', details: errors });
  }

  try {
    const info = await sendEmail({ to: to.trim(), subject: subject.trim(), html, text });
    console.log('Email envoyé à', to, ':', info.messageId);
    res.json({ success: true, messageId: info.messageId });
  } catch (e) {
    console.error('Erreur envoi email:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Admin Notes (Remarques) ────────────────────────────────

app.get('/api/notes', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const notes = db.prepare('SELECT * FROM admin_notes ORDER BY updated_at DESC').all();
  res.json(notes);
});

app.post('/api/notes', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Contenu requis' });
  const result = db.prepare('INSERT INTO admin_notes (content) VALUES (?)').run(content.trim());
  const note = db.prepare('SELECT * FROM admin_notes WHERE id = ?').get(result.lastInsertRowid);
  res.json(note);
});

app.put('/api/notes/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Contenu requis' });
  db.prepare("UPDATE admin_notes SET content = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(content.trim(), req.params.id);
  const note = db.prepare('SELECT * FROM admin_notes WHERE id = ?').get(req.params.id);
  if (!note) return res.status(404).json({ error: 'Note introuvable' });
  res.json(note);
});

app.delete('/api/notes/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM admin_notes WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Note introuvable' });
  res.json({ success: true });
});

// ─── Action Day Remarks ────────────────────────────────────
app.get('/api/action-remarks/:weekStart', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const weekStart = req.params.weekStart;
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }
  const rows = db.prepare(`
    SELECT sales_rep_id, date, remark FROM action_day_remarks
    WHERE date >= ? AND date <= ?
  `).all(days[0], days[6]);
  // Return as { "repId:date": remark }
  const map = {};
  rows.forEach(r => { map[`${r.sales_rep_id}:${r.date}`] = r.remark; });
  res.json(map);
});

app.put('/api/action-remarks/:sales_rep_id/:date', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { sales_rep_id, date } = req.params;
  const { remark } = req.body;
  db.prepare(`
    INSERT INTO action_day_remarks (sales_rep_id, date, remark)
    VALUES (?, ?, ?)
    ON CONFLICT(sales_rep_id, date) DO UPDATE SET remark = excluded.remark
  `).run(parseInt(sales_rep_id), date, remark || '');
  res.json({ ok: true });
});

// ─── PERSO: Workout tracking V2 (admin only) ────────────────

// ═══ Helper: compute 1RM Epley ═══
function estimated1RM(weight, reps) {
  if (!weight || !reps || reps <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

// ═══ Helper: check & update PRs after a set is completed ═══
function checkAndUpdatePRs(db, exerciseId, sessionId, setLogId, weight, reps) {
  const prs = [];
  if (!weight || weight <= 0 || !reps || reps <= 0) return prs;

  // max_weight
  const curMaxWeight = db.prepare("SELECT * FROM personal_records WHERE exercise_id = ? AND record_type = 'max_weight'").get(exerciseId);
  if (!curMaxWeight || weight > curMaxWeight.value) {
    db.prepare("DELETE FROM personal_records WHERE exercise_id = ? AND record_type = 'max_weight'").run(exerciseId);
    db.prepare("INSERT INTO personal_records (exercise_id, record_type, value, unit, session_id, set_log_id, previous_value) VALUES (?, 'max_weight', ?, 'kg', ?, ?, ?)").run(exerciseId, weight, sessionId, setLogId, curMaxWeight?.value || null);
    prs.push({ type: 'max_weight', value: weight, prev: curMaxWeight?.value, unit: 'kg' });
  }

  // estimated_1rm (only if reps <= 12 for formula reliability)
  if (reps <= 12) {
    const e1rm = Math.round(estimated1RM(weight, reps) * 10) / 10;
    const curE1rm = db.prepare("SELECT * FROM personal_records WHERE exercise_id = ? AND record_type = 'estimated_1rm'").get(exerciseId);
    if (!curE1rm || e1rm > curE1rm.value) {
      db.prepare("DELETE FROM personal_records WHERE exercise_id = ? AND record_type = 'estimated_1rm'").run(exerciseId);
      db.prepare("INSERT INTO personal_records (exercise_id, record_type, value, unit, session_id, set_log_id, previous_value) VALUES (?, 'estimated_1rm', ?, 'kg', ?, ?, ?)").run(exerciseId, e1rm, sessionId, setLogId, curE1rm?.value || null);
      prs.push({ type: 'estimated_1rm', value: e1rm, prev: curE1rm?.value, unit: 'kg' });
    }
  }

  // max_volume_set (weight * reps for single set)
  const vol = weight * reps;
  const curMaxVol = db.prepare("SELECT * FROM personal_records WHERE exercise_id = ? AND record_type = 'max_volume_set'").get(exerciseId);
  if (!curMaxVol || vol > curMaxVol.value) {
    db.prepare("DELETE FROM personal_records WHERE exercise_id = ? AND record_type = 'max_volume_set'").run(exerciseId);
    db.prepare("INSERT INTO personal_records (exercise_id, record_type, value, unit, session_id, set_log_id, previous_value) VALUES (?, 'max_volume_set', ?, 'kg', ?, ?, ?)").run(exerciseId, vol, sessionId, setLogId, curMaxVol?.value || null);
    prs.push({ type: 'max_volume_set', value: vol, prev: curMaxVol?.value, unit: 'kg' });
  }

  // Mark set_log is_pr
  if (prs.length > 0) {
    db.prepare("UPDATE perso_set_logs SET is_pr = 1 WHERE id = ?").run(setLogId);
  }

  return prs;
}

// ═══ Helper: progressive overload suggestion ═══
function getProgressionSuggestion(db, exerciseId, energyLevel) {
  // Find last completed exercise log with set_logs
  const lastPerf = db.prepare(`
    SELECT p.id, p.session_id, p.date, e.body_part, e.target_reps, e.target_sets
    FROM perso_performances p
    JOIN perso_exercises e ON e.id = p.exercise_id
    JOIN perso_sessions s ON s.id = p.session_id
    WHERE p.exercise_id = ? AND s.status = 'completed'
    ORDER BY p.date DESC, p.id DESC LIMIT 1
  `).get(exerciseId);

  if (!lastPerf) return null;

  const lastSets = db.prepare(`
    SELECT * FROM perso_set_logs
    WHERE performance_id = ? AND is_warmup = 0 AND completed = 1
    ORDER BY set_number
  `).all(lastPerf.id);

  if (lastSets.length === 0) return null;

  const targetReps = lastPerf.target_reps || 10;
  const allHitTarget = lastSets.every(s => s.reps >= targetReps);
  const increment = lastPerf.body_part === 'lower' ? 5 : 2.5;

  let suggestedWeight = lastSets[0]?.weight_kg || 0;
  let suggestedReps = targetReps;
  let message = '';

  if (allHitTarget) {
    suggestedWeight = suggestedWeight + increment;
    message = `Toutes les séries à ${targetReps} reps atteintes. +${increment} kg`;
  } else {
    message = `Reps incomplètes. Même charge, vise ${targetReps} reps partout`;
  }

  // Low energy adjustment
  if (energyLevel && energyLevel <= 2) {
    suggestedWeight = Math.round((suggestedWeight * 0.95) * 2) / 2; // round to 0.5
    message += ' (énergie basse: -5%)';
  }

  return {
    lastDate: lastPerf.date,
    lastSets: lastSets.map(s => ({ weight_kg: s.weight_kg, reps: s.reps })),
    suggestedWeight: Math.round(suggestedWeight * 2) / 2, // round to 0.5
    suggestedReps,
    suggestedSets: lastPerf.target_sets || lastSets.length || 3,
    message
  };
}

// ═══ Exercises ═══════════════════════════════════════════════

app.get('/api/perso/exercises', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { q } = req.query;
  let rows;
  if (q && q.trim()) {
    rows = db.prepare("SELECT * FROM perso_exercises WHERE LOWER(name) LIKE ? ORDER BY name LIMIT 20").all('%' + q.trim().toLowerCase() + '%');
  } else {
    rows = db.prepare('SELECT * FROM perso_exercises ORDER BY name').all();
  }
  res.json(rows);
});

app.get('/api/perso/exercises/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const ex = db.prepare('SELECT * FROM perso_exercises WHERE id = ?').get(id);
  if (!ex) return res.status(404).json({ error: 'Exercice introuvable' });

  // Personal records
  ex.records = db.prepare("SELECT * FROM personal_records WHERE exercise_id = ? ORDER BY record_type").all(id);

  // Last completed performance with sets
  const lastPerf = db.prepare(`
    SELECT p.id, p.date FROM perso_performances p
    JOIN perso_sessions s ON s.id = p.session_id
    WHERE p.exercise_id = ? AND s.status = 'completed'
    ORDER BY p.date DESC, p.id DESC LIMIT 1
  `).get(id);
  if (lastPerf) {
    ex.last = {
      date: lastPerf.date,
      sets: db.prepare("SELECT weight_kg, reps FROM perso_set_logs WHERE performance_id = ? AND is_warmup = 0 AND completed = 1 ORDER BY set_number").all(lastPerf.id)
    };
  }

  // Backward compat: old-style last for display
  const oldLast = db.prepare("SELECT * FROM perso_performances WHERE exercise_id = ? AND (charge > 0 OR reps > 0) ORDER BY date DESC, id DESC LIMIT 1").get(id);
  ex.lastLegacy = oldLast;

  res.json(ex);
});

app.post('/api/perso/exercises', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { name, muscle_group, goal_charge, body_part, exercise_type, target_sets, target_reps, default_rest_seconds, video_url } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nom requis' });
  const trimmed = name.trim();
  let ex = db.prepare('SELECT * FROM perso_exercises WHERE LOWER(name) = LOWER(?)').get(trimmed);
  if (!ex) {
    const result = db.prepare(`
      INSERT INTO perso_exercises (name, muscle_group, goal_charge, body_part, exercise_type, target_sets, target_reps, default_rest_seconds, video_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(trimmed, muscle_group || '', goal_charge || null, body_part || 'upper', exercise_type || 'compound', target_sets || 3, target_reps || 10, default_rest_seconds || 120, video_url || null);
    ex = db.prepare('SELECT * FROM perso_exercises WHERE id = ?').get(result.lastInsertRowid);
  }
  res.json(ex);
});

app.put('/api/perso/exercises/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const { muscle_group, goal_charge, body_part, exercise_type, target_sets, target_reps, default_rest_seconds, video_url } = req.body;
  const fields = [];
  const vals = [];
  if (muscle_group !== undefined) { fields.push('muscle_group = ?'); vals.push(muscle_group); }
  if (goal_charge !== undefined) { fields.push('goal_charge = ?'); vals.push(goal_charge); }
  if (body_part !== undefined) { fields.push('body_part = ?'); vals.push(body_part); }
  if (exercise_type !== undefined) { fields.push('exercise_type = ?'); vals.push(exercise_type); }
  if (target_sets !== undefined) { fields.push('target_sets = ?'); vals.push(target_sets); }
  if (target_reps !== undefined) { fields.push('target_reps = ?'); vals.push(target_reps); }
  if (default_rest_seconds !== undefined) { fields.push('default_rest_seconds = ?'); vals.push(default_rest_seconds); }
  if (video_url !== undefined) { fields.push('video_url = ?'); vals.push(video_url || null); }
  if (fields.length > 0) {
    vals.push(id);
    db.prepare(`UPDATE perso_exercises SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  }
  res.json({ ok: true });
});

app.delete('/api/perso/exercises/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM perso_exercises WHERE id = ?').run(parseInt(req.params.id));
  res.json({ ok: true });
});

// Exercise history V2 (aggregated per session)
app.get('/api/perso/exercises/:id/history', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const exId = parseInt(req.params.id);
  const { period } = req.query; // '1m', '3m', '6m', '1y', 'all'
  let dateFilter = '';
  if (period && period !== 'all') {
    const months = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 }[period] || 3;
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    dateFilter = ` AND p.date >= '${d.toISOString().slice(0, 10)}'`;
  }
  const rows = db.prepare(`
    SELECT p.id, p.date, p.feeling,
           e.name as exercise_name
    FROM perso_performances p
    JOIN perso_exercises e ON e.id = p.exercise_id
    WHERE p.exercise_id = ?${dateFilter}
    ORDER BY p.date ASC, p.id ASC
  `).all(exId);

  const getSetLogs = db.prepare("SELECT * FROM perso_set_logs WHERE performance_id = ? AND is_warmup = 0 AND completed = 1 ORDER BY set_number");

  const history = rows.map(r => {
    const sets = getSetLogs.all(r.id);
    const maxWeight = sets.reduce((m, s) => Math.max(m, s.weight_kg || 0), 0);
    const totalVolume = sets.reduce((v, s) => v + (s.weight_kg || 0) * (s.reps || 0), 0);
    const best1RM = sets.filter(s => s.reps <= 12).reduce((m, s) => Math.max(m, estimated1RM(s.weight_kg || 0, s.reps || 0)), 0);
    return {
      date: r.date,
      feeling: r.feeling,
      sets: sets.map(s => ({ weight_kg: s.weight_kg, reps: s.reps, is_pr: !!s.is_pr })),
      maxWeight,
      totalVolume,
      estimated1RM: Math.round(best1RM * 10) / 10
    };
  });
  res.json(history);
});

// Exercise records
app.get('/api/perso/exercises/:id/records', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const records = db.prepare("SELECT * FROM personal_records WHERE exercise_id = ? ORDER BY record_type").all(parseInt(req.params.id));
  res.json(records);
});

// ═══ Templates ═══════════════════════════════════════════════

app.get('/api/perso/templates', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const templates = db.prepare('SELECT * FROM perso_templates ORDER BY favorite DESC, name').all();
  const getExercises = db.prepare(`
    SELECT te.sort_order, te.target_sets, te.target_reps, te.superset_group,
           e.id, e.name, e.muscle_group, e.body_part, e.exercise_type, e.goal_charge,
           e.default_rest_seconds, e.target_sets as ex_target_sets, e.target_reps as ex_target_reps, e.video_url
    FROM perso_template_exercises te
    JOIN perso_exercises e ON e.id = te.exercise_id
    WHERE te.template_id = ?
    ORDER BY te.sort_order, te.id
  `);
  const getLastUsed = db.prepare(
    'SELECT MAX(date) AS last_used FROM perso_sessions WHERE template_id = ?'
  );
  templates.forEach(t => {
    t.exercises = getExercises.all(t.id);
    t.last_used = getLastUsed.get(t.id)?.last_used || null;
  });
  res.json(templates);
});

app.post('/api/perso/templates', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { name, exercise_ids, superset_groups } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nom requis' });
  const result = db.prepare('INSERT INTO perso_templates (name) VALUES (?)').run(name.trim());
  const tid = result.lastInsertRowid;
  if (Array.isArray(exercise_ids)) {
    const insert = db.prepare('INSERT INTO perso_template_exercises (template_id, exercise_id, sort_order, superset_group) VALUES (?, ?, ?, ?)');
    exercise_ids.forEach((eid, i) => insert.run(tid, eid, i, superset_groups?.[i] || null));
  }
  res.json({ id: tid });
});

app.put('/api/perso/templates/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const { name, favorite, exercise_ids, superset_groups } = req.body;
  if (name !== undefined) db.prepare('UPDATE perso_templates SET name = ? WHERE id = ?').run(name.trim(), id);
  if (favorite !== undefined) db.prepare('UPDATE perso_templates SET favorite = ? WHERE id = ?').run(favorite ? 1 : 0, id);
  if (Array.isArray(exercise_ids)) {
    db.prepare('DELETE FROM perso_template_exercises WHERE template_id = ?').run(id);
    const insert = db.prepare('INSERT INTO perso_template_exercises (template_id, exercise_id, sort_order, superset_group) VALUES (?, ?, ?, ?)');
    exercise_ids.forEach((eid, i) => insert.run(id, eid, i, superset_groups?.[i] || null));
  }
  res.json({ ok: true });
});

app.delete('/api/perso/templates/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM perso_templates WHERE id = ?').run(parseInt(req.params.id));
  res.json({ ok: true });
});

// ═══ Sessions & Performances V2 ═════════════════════════════

// Get session by date (with full set_logs + suggestions)
// Sessions range (for calendar)
app.get('/api/perso/sessions/range', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });
  const rows = db.prepare(`
    SELECT id, date, status, name, template_id, started_at, ended_at
    FROM perso_sessions
    WHERE date >= ? AND date <= ?
    ORDER BY date ASC
  `).all(from, to);
  // Include performances for volume calculation
  const perfStmt = db.prepare(`SELECT p.id, p.exercise_id, e.name as exercise_name,
    (SELECT json_group_array(json_object('id', sl.id, 'weight_kg', sl.weight_kg, 'reps', sl.reps, 'completed', sl.completed, 'is_warmup', sl.is_warmup))
     FROM perso_set_logs sl WHERE sl.performance_id = p.id) as set_logs_json
    FROM perso_performances p JOIN perso_exercises e ON e.id = p.exercise_id WHERE p.session_id = ?`);
  rows.forEach(r => {
    const perfs = perfStmt.all(r.id);
    r.performances = perfs.map(p => ({ ...p, set_logs: JSON.parse(p.set_logs_json || '[]') }));
  });
  res.json(rows);
});

// Recent PRs
app.get('/api/perso/records/recent', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const limit = parseInt(req.query.limit) || 5;
  const rows = db.prepare(`
    SELECT r.*, e.name as exercise_name
    FROM personal_records r
    JOIN perso_exercises e ON e.id = r.exercise_id
    ORDER BY r.achieved_at DESC, r.id DESC
    LIMIT ?
  `).all(limit);
  res.json(rows);
});

app.get('/api/perso/sessions/:date', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { date } = req.params;
  let session = db.prepare('SELECT * FROM perso_sessions WHERE date = ? ORDER BY id DESC LIMIT 1').get(date);
  if (!session) return res.json(null);

  // Get daily energy for progressive overload suggestions
  const daily = db.prepare('SELECT energy FROM perso_daily WHERE date = ?').get(date);
  const energyLevel = daily?.energy || null;

  const performances = db.prepare(`
    SELECT p.*, e.name as exercise_name, e.muscle_group, e.goal_charge,
           e.body_part, e.exercise_type, e.target_sets as ex_target_sets,
           e.target_reps as ex_target_reps, e.default_rest_seconds, e.video_url
    FROM perso_performances p
    JOIN perso_exercises e ON e.id = p.exercise_id
    WHERE p.session_id = ?
    ORDER BY p.sort_order, p.id
  `).all(session.id);

  const getSetLogs = db.prepare("SELECT * FROM perso_set_logs WHERE performance_id = ? ORDER BY set_number");

  performances.forEach(p => {
    p.set_logs = getSetLogs.all(p.id);
    // Progressive overload suggestion
    p.suggestion = getProgressionSuggestion(db, p.exercise_id, energyLevel);
    // Records for this exercise
    p.records = db.prepare("SELECT record_type, value, unit FROM personal_records WHERE exercise_id = ?").all(p.exercise_id);
  });

  session.performances = performances;
  session.energy_level = session.energy_level || energyLevel;
  res.json(session);
});

// List sessions for a month (for calendar)
app.get('/api/perso/sessions', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { month } = req.query; // 'YYYY-MM'
  if (!month) return res.status(400).json({ error: 'month requis' });
  const rows = db.prepare(`
    SELECT id, date, status, name, template_id, started_at, ended_at
    FROM perso_sessions
    WHERE date LIKE ?
    ORDER BY date ASC
  `).all(month + '%');
  res.json(rows);
});

// Create session
app.post('/api/perso/sessions', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { date, template_id } = req.body;
  if (!date) return res.status(400).json({ error: 'Date requise' });

  let sessionName = 'Séance libre';
  if (template_id) {
    const tpl = db.prepare('SELECT name FROM perso_templates WHERE id = ?').get(template_id);
    if (tpl) sessionName = tpl.name;
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const result = db.prepare(`
    INSERT INTO perso_sessions (date, template_id, name, started_at, status) VALUES (?, ?, ?, ?, 'in_progress')
  `).run(date, template_id || null, sessionName, now);
  const sid = result.lastInsertRowid;

  // If template, pre-create performances with set_logs pre-filled from suggestion
  if (template_id) {
    const exs = db.prepare(`
      SELECT te.exercise_id, te.sort_order, te.target_sets, te.target_reps, te.superset_group,
             e.target_sets as ex_target_sets, e.target_reps as ex_target_reps
      FROM perso_template_exercises te
      JOIN perso_exercises e ON e.id = te.exercise_id
      WHERE te.template_id = ? ORDER BY te.sort_order
    `).all(template_id);

    const daily = db.prepare('SELECT energy FROM perso_daily WHERE date = ?').get(date);
    const energy = daily?.energy || null;

    const insertPerf = db.prepare("INSERT INTO perso_performances (session_id, exercise_id, charge, sets, reps, feeling, date, sort_order, superset_group) VALUES (?, ?, 0, 0, 0, 'moyen', ?, ?, ?)");
    const insertSet = db.prepare("INSERT INTO perso_set_logs (performance_id, set_number, weight_kg, reps, completed) VALUES (?, ?, ?, ?, 0)");

    exs.forEach(e => {
      const perfResult = insertPerf.run(sid, e.exercise_id, date, e.sort_order, e.superset_group || null);
      const perfId = perfResult.lastInsertRowid;
      const suggestion = getProgressionSuggestion(db, e.exercise_id, energy);
      const nSets = e.target_sets || e.ex_target_sets || 3;
      const targetReps = e.target_reps || e.ex_target_reps || 10;
      for (let i = 0; i < nSets; i++) {
        insertSet.run(perfId, i + 1, suggestion?.suggestedWeight || 0, suggestion?.suggestedReps || targetReps);
      }
    });
  }

  res.json({ id: sid });
});

// Update session (status, notes, end)
app.put('/api/perso/sessions/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const { status, notes, body_weight_kg, energy_level, name } = req.body;
  const fields = [];
  const vals = [];
  if (status !== undefined) {
    fields.push('status = ?'); vals.push(status);
    if (status === 'completed') {
      fields.push('ended_at = ?'); vals.push(new Date().toISOString().replace('T', ' ').slice(0, 19));
      // Recalculate max_total_tonnage PR for each exercise in this session
      const perfs = db.prepare("SELECT id, exercise_id FROM perso_performances WHERE session_id = ?").all(id);
      const session = db.prepare("SELECT id FROM perso_sessions WHERE id = ?").get(id);
      for (const p of perfs) {
        const sets = db.prepare("SELECT weight_kg, reps FROM perso_set_logs WHERE performance_id = ? AND is_warmup = 0 AND completed = 1").all(p.id);
        const tonnage = sets.reduce((s, x) => s + (x.weight_kg || 0) * (x.reps || 0), 0);
        if (tonnage > 0) {
          const cur = db.prepare("SELECT * FROM personal_records WHERE exercise_id = ? AND record_type = 'max_total_tonnage'").get(p.exercise_id);
          if (!cur || tonnage > cur.value) {
            db.prepare("DELETE FROM personal_records WHERE exercise_id = ? AND record_type = 'max_total_tonnage'").run(p.exercise_id);
            db.prepare("INSERT INTO personal_records (exercise_id, record_type, value, unit, session_id, previous_value) VALUES (?, 'max_total_tonnage', ?, 'kg', ?, ?)").run(p.exercise_id, tonnage, id, cur?.value || null);
          }
        }
      }
    }
  }
  if (notes !== undefined) { fields.push('notes = ?'); vals.push(notes); }
  if (body_weight_kg !== undefined) { fields.push('body_weight_kg = ?'); vals.push(body_weight_kg); }
  if (energy_level !== undefined) { fields.push('energy_level = ?'); vals.push(energy_level); }
  if (name !== undefined) { fields.push('name = ?'); vals.push(name); }
  if (fields.length > 0) {
    vals.push(id);
    db.prepare(`UPDATE perso_sessions SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  }
  res.json({ ok: true });
});

app.delete('/api/perso/sessions/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM perso_sessions WHERE id = ?').run(parseInt(req.params.id));
  res.json({ ok: true });
});

// Add performance (exercise_log) to session
app.post('/api/perso/sessions/:id/performances', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const session_id = parseInt(req.params.id);
  const { exercise_id, date } = req.body;
  if (!exercise_id) return res.status(400).json({ error: 'Exercice requis' });
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 as n FROM perso_performances WHERE session_id = ?').get(session_id).n;
  const result = db.prepare("INSERT INTO perso_performances (session_id, exercise_id, charge, sets, reps, feeling, date, sort_order) VALUES (?, ?, 0, 0, 0, 'moyen', ?, ?)").run(session_id, exercise_id, date, maxOrder);
  const perfId = result.lastInsertRowid;

  // Pre-create set_logs with suggestion
  const session = db.prepare('SELECT * FROM perso_sessions WHERE id = ?').get(session_id);
  const daily = db.prepare('SELECT energy FROM perso_daily WHERE date = ?').get(session?.date || date);
  const ex = db.prepare('SELECT * FROM perso_exercises WHERE id = ?').get(exercise_id);
  const suggestion = getProgressionSuggestion(db, exercise_id, daily?.energy || null);
  const nSets = ex?.target_sets || 3;
  const targetReps = ex?.target_reps || 10;
  const insertSet = db.prepare("INSERT INTO perso_set_logs (performance_id, set_number, weight_kg, reps, completed) VALUES (?, ?, ?, ?, 0)");
  for (let i = 0; i < nSets; i++) {
    insertSet.run(perfId, i + 1, suggestion?.suggestedWeight || 0, suggestion?.suggestedReps || targetReps);
  }

  res.json({ id: perfId });
});

// Update performance feeling/notes
app.put('/api/perso/performances/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const { feeling, notes } = req.body;
  const fields = [];
  const vals = [];
  if (feeling !== undefined) { fields.push('feeling = ?'); vals.push(feeling); }
  if (notes !== undefined) { fields.push('notes = ?'); vals.push(notes); }
  if (fields.length > 0) {
    vals.push(id);
    db.prepare(`UPDATE perso_performances SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  }
  res.json({ ok: true });
});

app.delete('/api/perso/performances/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM perso_performances WHERE id = ?').run(parseInt(req.params.id));
  res.json({ ok: true });
});

// ═══ Set Logs ════════════════════════════════════════════════

// Add a set to a performance
app.post('/api/perso/performances/:id/sets', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const perfId = parseInt(req.params.id);
  const { weight_kg, reps, is_warmup } = req.body;
  const maxNum = db.prepare('SELECT COALESCE(MAX(set_number), 0) + 1 as n FROM perso_set_logs WHERE performance_id = ?').get(perfId).n;
  const result = db.prepare("INSERT INTO perso_set_logs (performance_id, set_number, weight_kg, reps, is_warmup, completed) VALUES (?, ?, ?, ?, ?, 0)").run(perfId, maxNum, weight_kg || 0, reps || 0, is_warmup ? 1 : 0);
  res.json({ id: result.lastInsertRowid, set_number: maxNum });
});

// Update a set (weight, reps, rpe, rir, completed)
app.put('/api/perso/set-logs/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const { weight_kg, reps, rpe, rir, is_warmup, completed, rest_seconds } = req.body;

  const fields = [];
  const vals = [];
  if (weight_kg !== undefined) { fields.push('weight_kg = ?'); vals.push(weight_kg); }
  if (reps !== undefined) { fields.push('reps = ?'); vals.push(reps); }
  if (rpe !== undefined) { fields.push('rpe = ?'); vals.push(rpe); }
  if (rir !== undefined) { fields.push('rir = ?'); vals.push(rir); }
  if (is_warmup !== undefined) { fields.push('is_warmup = ?'); vals.push(is_warmup ? 1 : 0); }
  if (rest_seconds !== undefined) { fields.push('rest_seconds = ?'); vals.push(rest_seconds); }
  if (completed !== undefined) { fields.push('completed = ?'); vals.push(completed ? 1 : 0); }

  if (fields.length > 0) {
    vals.push(id);
    db.prepare(`UPDATE perso_set_logs SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  }

  // PR check when completing a set
  let prs = [];
  if (completed) {
    const setLog = db.prepare("SELECT sl.*, p.exercise_id, p.session_id FROM perso_set_logs sl JOIN perso_performances p ON p.id = sl.performance_id WHERE sl.id = ?").get(id);
    if (setLog && !setLog.is_warmup) {
      prs = checkAndUpdatePRs(db, setLog.exercise_id, setLog.session_id, id, setLog.weight_kg, setLog.reps);
    }
  }

  res.json({ ok: true, prs });
});

// Delete a set
app.delete('/api/perso/set-logs/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM perso_set_logs WHERE id = ?').run(parseInt(req.params.id));
  res.json({ ok: true });
});

// ═══ Daily tracking (weight, energy) ════════════════════════

app.get('/api/perso/daily/:date', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM perso_daily WHERE date = ?').get(req.params.date);
  res.json(row || { date: req.params.date, weight: null, energy: null });
});

app.put('/api/perso/daily/:date', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const { date } = req.params;
  const { weight, energy } = req.body;
  db.prepare(`
    INSERT INTO perso_daily (date, weight, energy) VALUES (?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      weight = COALESCE(excluded.weight, perso_daily.weight),
      energy = COALESCE(excluded.energy, perso_daily.energy)
  `).run(date, weight !== undefined ? weight : null, energy !== undefined ? energy : null);
  res.json({ ok: true });
});

// ─── Task Vault (Kanban board) ──────────────────────────────

// Resolve current user's key string ("admin" or "rep:<id>")
function getUserKey(session) {
  if (!session) return null;
  if (session.role === 'admin') return 'admin';
  return session.sales_rep_id ? `rep:${session.sales_rep_id}` : null;
}

// Display name for a userKey
function userKeyToName(db, userKey) {
  if (!userKey) return '';
  if (userKey === 'admin') return 'Stan';
  const m = userKey.match(/^rep:(\d+)$/);
  if (m) {
    const row = db.prepare('SELECT name FROM sales_reps WHERE id = ?').get(parseInt(m[1], 10));
    return row?.name || 'Inconnu';
  }
  return userKey;
}

// Ensure a user has at least the default columns; if zero, seed.
function ensureUserColumns(db, userKey) {
  const count = db.prepare('SELECT COUNT(*) AS c FROM task_columns WHERE created_by = ?').get(userKey).c;
  if (count === 0) {
    const ins = db.prepare('INSERT INTO task_columns (name, color, position, created_by) VALUES (?, ?, ?, ?)');
    ins.run('Demain', '#6366F1', 0, userKey);
    ins.run('En attente', '#EC4899', 1, userKey);
  }
}

// Verify ownership before any write: throws 403 if not creator nor admin
function assertOwnTaskOrAdmin(req, taskId) {
  const db = getDb();
  const row = db.prepare('SELECT created_by FROM tasks WHERE id = ?').get(taskId);
  if (!row) return { ok: false, code: 404, msg: 'Tâche introuvable' };
  const userKey = getUserKey(req.session);
  if (req.session.role === 'admin') return { ok: true, row };
  if (row.created_by === userKey) return { ok: true, row };
  return { ok: false, code: 403, msg: 'Tâche non autorisée' };
}

function assertOwnColumnOrAdmin(req, colId) {
  const db = getDb();
  const row = db.prepare('SELECT created_by FROM task_columns WHERE id = ?').get(colId);
  if (!row) return { ok: false, code: 404, msg: 'Colonne introuvable' };
  const userKey = getUserKey(req.session);
  if (req.session.role === 'admin') return { ok: true, row };
  if (row.created_by === userKey) return { ok: true, row };
  return { ok: false, code: 403, msg: 'Colonne non autorisée' };
}

// List of all users (for admin: pick a board to view OR pick an assignee)
app.get('/api/tasks/users', requireAuth, (req, res) => {
  const db = getDb();
  const reps = db.prepare('SELECT id, name, role FROM sales_reps WHERE archived = 0 ORDER BY name ASC').all();
  const users = [
    { key: 'admin', name: 'Stan', role: 'admin' },
    ...reps.map(r => ({ key: `rep:${r.id}`, name: r.name, role: r.role || 'commercial' }))
  ];
  res.json(users);
});

// GET all columns with their tasks (scoped to current user, or to ?as=<userKey> for admin)
app.get('/api/tasks/board', requireAuth, (req, res) => {
  const db = getDb();
  let userKey = getUserKey(req.session);
  // Admin can view another user's board with ?as=<userKey>
  if (req.session.role === 'admin' && req.query.as) {
    userKey = String(req.query.as);
  }
  if (!userKey) return res.status(400).json({ error: 'User key indisponible' });

  ensureUserColumns(db, userKey);

  // Board ne montre que les colonnes ACTIVES (non archivées).
  const columns = db.prepare('SELECT id, name, color, position FROM task_columns WHERE created_by = ? AND COALESCE(archived, 0) = 0 ORDER BY position ASC, id ASC').all(userKey);

  // Own tasks: created_by = userKey AND column belongs to userKey
  const ownTasks = db.prepare(`
    SELECT id, column_id, parent_id, text, highlighted, completed, position, due, description, tags, created_by, assigned_to, created_at
    FROM tasks
    WHERE created_by = ? AND column_id IN (SELECT id FROM task_columns WHERE created_by = ?)
    ORDER BY position ASC, id ASC
  `).all(userKey, userKey);

  // Assigned tasks: assigned_to = userKey AND created by someone else
  // These will be displayed in a virtual column "📌 Assignées à moi"
  const assignedTasks = db.prepare(`
    SELECT id, column_id, parent_id, text, highlighted, completed, position, due, description, tags, created_by, assigned_to, created_at
    FROM tasks
    WHERE assigned_to = ? AND created_by != ?
    ORDER BY position ASC, id ASC
  `).all(userKey, userKey);

  const enrich = (t) => {
    try { t.tags = t.tags ? JSON.parse(t.tags) : []; } catch { t.tags = []; }
    t.created_by_name = userKeyToName(db, t.created_by);
    t.assigned_to_name = t.assigned_to ? userKeyToName(db, t.assigned_to) : null;
  };
  ownTasks.forEach(enrich);
  assignedTasks.forEach(enrich);

  // Build the board: real columns first
  const byCol = {};
  columns.forEach(c => { byCol[c.id] = { ...c, tasks: [] }; });
  ownTasks.forEach(t => { if (byCol[t.column_id]) byCol[t.column_id].tasks.push(t); });

  const result = Object.values(byCol);

  // Add virtual "Assignées à moi" column if there are any assigned tasks
  if (assignedTasks.length > 0) {
    // Re-assign column_id to virtual id (-1) so the front-end can render them
    assignedTasks.forEach(t => { t.column_id = -1; t.parent_id = null; });
    result.unshift({
      id: -1,
      name: 'Assignées à moi',
      color: '#F59E0B',
      position: -1,
      is_virtual: true,
      tasks: assignedTasks
    });
  }

  res.json({
    board: result,
    viewing_user_key: userKey,
    viewing_user_name: userKeyToName(db, userKey),
    is_viewing_other: userKey !== getUserKey(req.session)
  });
});

// Create a column (scoped to current user, or admin acting "as" a user)
app.post('/api/tasks/columns', requireAuth, (req, res) => {
  const db = getDb();
  const { name, color } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nom requis' });
  let userKey = getUserKey(req.session);
  if (req.session.role === 'admin' && req.body.as) userKey = String(req.body.as);
  if (!userKey) return res.status(400).json({ error: 'User key indisponible' });
  const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) AS p FROM task_columns WHERE created_by = ?').get(userKey).p;
  const info = db.prepare('INSERT INTO task_columns (name, color, position, created_by) VALUES (?, ?, ?, ?)').run(name.trim(), color || '#6366F1', maxPos + 1, userKey);
  res.json({ id: info.lastInsertRowid, name: name.trim(), color: color || '#6366F1', position: maxPos + 1, tasks: [], created_by: userKey });
});

// Update a column (only owner or admin)
app.put('/api/tasks/columns/:id', requireAuth, (req, res) => {
  const check = assertOwnColumnOrAdmin(req, req.params.id);
  if (!check.ok) return res.status(check.code).json({ error: check.msg });
  const db = getDb();
  const { name, color, archived } = req.body;
  const fields = [];
  const values = [];
  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (color !== undefined) { fields.push('color = ?'); values.push(color); }
  if (archived !== undefined) {
    const v = archived ? 1 : 0;
    fields.push('archived = ?'); values.push(v);
    if (v === 1) { fields.push("archived_at = datetime('now','localtime')"); }
    else        { fields.push('archived_at = NULL'); }
  }
  if (fields.length === 0) return res.json({ ok: true });
  values.push(req.params.id);
  db.prepare(`UPDATE task_columns SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  res.json({ ok: true });
});

// Liste des colonnes ARCHIVÉES pour l'utilisateur courant (ou un autre via ?as=).
// Renvoie nom, couleur, position, archived_at + count des tâches dans chaque colonne.
app.get('/api/tasks/columns/archived', requireAuth, (req, res) => {
  const db = getDb();
  let userKey = getUserKey(req.session);
  if (req.session.role === 'admin' && req.query.as) userKey = String(req.query.as);
  if (!userKey) return res.status(400).json({ error: 'User key indisponible' });
  const cols = db.prepare(`
    SELECT c.id, c.name, c.color, c.position, c.archived_at,
           (SELECT COUNT(*) FROM tasks t WHERE t.column_id = c.id) AS task_count
    FROM task_columns c
    WHERE c.created_by = ? AND COALESCE(c.archived, 0) = 1
    ORDER BY c.archived_at DESC, c.id DESC
  `).all(userKey);
  res.json({ columns: cols });
});

// Delete a column (only owner or admin)
app.delete('/api/tasks/columns/:id', requireAuth, (req, res) => {
  const check = assertOwnColumnOrAdmin(req, req.params.id);
  if (!check.ok) return res.status(check.code).json({ error: check.msg });
  const db = getDb();
  db.prepare('DELETE FROM task_columns WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Create a task (created_by = current user, or admin acting "as" someone)
app.post('/api/tasks', requireAuth, (req, res) => {
  const db = getDb();
  const { column_id, text, parent_id, assigned_to } = req.body;
  if (!column_id || !text || !text.trim()) return res.status(400).json({ error: 'column_id et text requis' });
  // Resolve creator: by default the current user; admin can override with ?as=
  let createdBy = getUserKey(req.session);
  if (req.session.role === 'admin' && req.body.as) createdBy = String(req.body.as);
  if (!createdBy) return res.status(400).json({ error: 'User key indisponible' });
  // Verify column belongs to creator (or admin acting on another user's board)
  const col = db.prepare('SELECT created_by FROM task_columns WHERE id = ?').get(column_id);
  if (!col) return res.status(404).json({ error: 'Colonne introuvable' });
  if (req.session.role !== 'admin' && col.created_by !== createdBy) {
    return res.status(403).json({ error: 'Colonne non autorisée' });
  }
  const maxPos = db.prepare(
    parent_id
      ? 'SELECT COALESCE(MAX(position), -1) AS p FROM tasks WHERE parent_id = ?'
      : 'SELECT COALESCE(MAX(position), -1) AS p FROM tasks WHERE column_id = ? AND parent_id IS NULL'
  ).get(parent_id || column_id).p;
  const info = db.prepare('INSERT INTO tasks (column_id, parent_id, text, position, created_by, assigned_to) VALUES (?, ?, ?, ?, ?, ?)').run(
    column_id, parent_id || null, text.trim(), maxPos + 1, createdBy, assigned_to || null
  );
  res.json({
    id: info.lastInsertRowid,
    column_id, parent_id: parent_id || null,
    text: text.trim(), highlighted: 0, completed: 0, position: maxPos + 1,
    created_by: createdBy, assigned_to: assigned_to || null,
    created_by_name: userKeyToName(db, createdBy),
    assigned_to_name: assigned_to ? userKeyToName(db, assigned_to) : null
  });
});

// Update a task (only owner, assignee or admin)
app.put('/api/tasks/:id', requireAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT created_by, assigned_to FROM tasks WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Tâche introuvable' });
  const userKey = getUserKey(req.session);
  const canEdit = req.session.role === 'admin' || row.created_by === userKey || row.assigned_to === userKey;
  if (!canEdit) return res.status(403).json({ error: 'Tâche non autorisée' });

  const { text, highlighted, completed, column_id, position, parent_id, due, description, tags, assigned_to } = req.body;
  const fields = [];
  const values = [];
  if (text !== undefined) { fields.push('text = ?'); values.push(text); }
  if (highlighted !== undefined) { fields.push('highlighted = ?'); values.push(highlighted ? 1 : 0); }
  if (completed !== undefined) { fields.push('completed = ?'); values.push(completed ? 1 : 0); }
  if (column_id !== undefined) { fields.push('column_id = ?'); values.push(column_id); }
  if (position !== undefined) { fields.push('position = ?'); values.push(position); }
  if (parent_id !== undefined) { fields.push('parent_id = ?'); values.push(parent_id || null); }
  if (due !== undefined) { fields.push('due = ?'); values.push(due || null); }
  if (description !== undefined) { fields.push('description = ?'); values.push(description || null); }
  if (tags !== undefined) { fields.push('tags = ?'); values.push(Array.isArray(tags) ? JSON.stringify(tags) : null); }
  if (assigned_to !== undefined) { fields.push('assigned_to = ?'); values.push(assigned_to || null); }
  if (fields.length === 0) return res.json({ ok: true });
  values.push(req.params.id);
  db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  res.json({ ok: true });
});

// Delete a task (only creator or admin)
app.delete('/api/tasks/:id', requireAuth, (req, res) => {
  const check = assertOwnTaskOrAdmin(req, req.params.id);
  if (!check.ok) return res.status(check.code).json({ error: check.msg });
  const db = getDb();
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Bulk reorder/move tasks (drag & drop)
// Body: { updates: [{ id, column_id, parent_id, position }, ...] }
app.post('/api/tasks/reorder', requireAuth, (req, res) => {
  const db = getDb();
  const { updates } = req.body;
  if (!Array.isArray(updates)) return res.status(400).json({ error: 'updates array required' });
  // Ownership check: all tasks must belong to the current user (or admin can move anything)
  if (req.session.role !== 'admin') {
    const userKey = getUserKey(req.session);
    const checkStmt = db.prepare('SELECT created_by, assigned_to FROM tasks WHERE id = ?');
    for (const u of updates) {
      const r = checkStmt.get(u.id);
      if (!r) return res.status(404).json({ error: `Tâche ${u.id} introuvable` });
      if (r.created_by !== userKey && r.assigned_to !== userKey) {
        return res.status(403).json({ error: `Tâche ${u.id} non autorisée` });
      }
    }
  }
  const stmt = db.prepare('UPDATE tasks SET column_id = ?, parent_id = ?, position = ? WHERE id = ?');
  const tx = db.transaction((updates) => {
    for (const u of updates) stmt.run(u.column_id, u.parent_id || null, u.position, u.id);
  });
  tx(updates);
  res.json({ ok: true });
});

// Restore a deleted task (undo) — preserves created_by/assigned_to from payload
app.post('/api/tasks/restore', requireAuth, (req, res) => {
  const db = getDb();
  const { task, subtasks } = req.body;
  if (!task) return res.status(400).json({ error: 'task required' });
  const userKey = getUserKey(req.session);
  // Only the original creator or admin can restore
  if (req.session.role !== 'admin' && task.created_by !== userKey) {
    return res.status(403).json({ error: 'Tâche non autorisée' });
  }
  const insertTask = db.prepare('INSERT INTO tasks (id, column_id, parent_id, text, highlighted, completed, position, due, description, tags, created_by, assigned_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const tagsToJson = (tags) => Array.isArray(tags) ? JSON.stringify(tags) : (tags || null);
  const tx = db.transaction(() => {
    insertTask.run(task.id, task.column_id, task.parent_id || null, task.text, task.highlighted ? 1 : 0, task.completed ? 1 : 0, task.position, task.due || null, task.description || null, tagsToJson(task.tags), task.created_by || userKey, task.assigned_to || null);
    if (Array.isArray(subtasks)) {
      for (const s of subtasks) {
        insertTask.run(s.id, s.column_id, s.parent_id || null, s.text, s.highlighted ? 1 : 0, s.completed ? 1 : 0, s.position, s.due || null, s.description || null, tagsToJson(s.tags), s.created_by || userKey, s.assigned_to || null);
      }
    }
  });
  try { tx(); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Reorder columns: receives { order: [colId1, colId2, ...] }
app.post('/api/tasks/columns/reorder', requireAuth, (req, res) => {
  const db = getDb();
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' });
  // Verify all columns belong to current user (or admin)
  if (req.session.role !== 'admin') {
    const userKey = getUserKey(req.session);
    const checkStmt = db.prepare('SELECT created_by FROM task_columns WHERE id = ?');
    for (const id of order) {
      const r = checkStmt.get(id);
      if (!r) return res.status(404).json({ error: `Colonne ${id} introuvable` });
      if (r.created_by !== userKey) return res.status(403).json({ error: `Colonne ${id} non autorisée` });
    }
  }
  const stmt = db.prepare('UPDATE task_columns SET position = ? WHERE id = ?');
  const tx = db.transaction(() => {
    order.forEach((id, idx) => stmt.run(idx, id));
  });
  tx();
  res.json({ ok: true });
});

// ─── Admin PIN: change endpoint ─────────────────────────────

app.put('/api/admin/pin', requireAuth, requireAdmin, (req, res) => {
  const { currentPin, newPin } = req.body;
  if (!newPin || typeof newPin !== 'string' || newPin.trim().length < 4) {
    return res.status(400).json({ error: 'Le nouveau PIN doit faire au moins 4 caractères' });
  }
  const db = getDb();
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('admin_pin');
  const stored = (row && row.value) || process.env.ADMIN_PIN || 'ginkgo';
  if (!currentPin || currentPin !== stored) {
    return res.status(403).json({ error: 'PIN actuel incorrect' });
  }
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at) VALUES ('admin_pin', ?, datetime('now','localtime'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(newPin.trim());
  res.json({ ok: true });
});

// ─── NEWS (admin uniquement) ────────────────────────────────
// Liste, création, modification, suppression et épinglage de posts
// chronologiques. L'onglet est caché aux non-admins côté front, et
// chaque endpoint enforce `requireAdmin` côté back.

function newsRowToJson(r) {
  let tags = [];
  if (r.tags) {
    try { tags = JSON.parse(r.tags); } catch (_) { tags = []; }
    if (!Array.isArray(tags)) tags = [];
  }
  return {
    id: r.id,
    title: r.title,
    body: r.body || '',
    tags,
    pinned: !!r.pinned,
    author: r.author || null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

app.get('/api/news', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const tag = (req.query.tag || '').toString().trim();
  let rows;
  if (tag) {
    // Filtre simple : on cherche le tag exact dans le JSON
    const pattern = `%"${tag.replace(/[%_]/g, '')}"%`;
    rows = db.prepare(`
      SELECT * FROM news_posts
      WHERE tags LIKE ?
      ORDER BY pinned DESC, created_at DESC
    `).all(pattern);
  } else {
    rows = db.prepare(`
      SELECT * FROM news_posts
      ORDER BY pinned DESC, created_at DESC
    `).all();
  }
  // Aggrège la liste de tous les tags pour le filtre
  const allTags = new Set();
  db.prepare(`SELECT tags FROM news_posts WHERE tags IS NOT NULL`).all().forEach(r => {
    try {
      const arr = JSON.parse(r.tags);
      if (Array.isArray(arr)) arr.forEach(t => { if (t) allTags.add(String(t)); });
    } catch (_) { /* tag JSON corrompu sur cette ligne -> ignoré (volontaire) */ }
  });
  res.json({
    posts: rows.map(newsRowToJson),
    all_tags: Array.from(allTags).sort(),
  });
});

app.post('/api/news', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const title = String((req.body && req.body.title) || '').trim();
  const body = String((req.body && req.body.body) || '').trim();
  if (!title) return res.status(400).json({ error: 'Titre requis' });
  if (title.length > 200) return res.status(400).json({ error: 'Titre trop long (max 200)' });
  if (body.length > 20000) return res.status(400).json({ error: 'Corps trop long (max 20000)' });
  let tags = [];
  if (Array.isArray(req.body && req.body.tags)) {
    tags = req.body.tags.map(t => String(t).trim()).filter(Boolean).slice(0, 10);
  }
  const pinned = req.body && req.body.pinned ? 1 : 0;
  const info = db.prepare(`
    INSERT INTO news_posts (title, body, tags, pinned, author)
    VALUES (?, ?, ?, ?, ?)
  `).run(title, body, JSON.stringify(tags), pinned, req.session.name || 'admin');
  const row = db.prepare(`SELECT * FROM news_posts WHERE id = ?`).get(info.lastInsertRowid);
  res.json(newsRowToJson(row));
});

app.put('/api/news/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide' });
  const existing = db.prepare(`SELECT * FROM news_posts WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: 'Post introuvable' });
  const fields = [];
  const values = [];
  if (req.body.title !== undefined) {
    const t = String(req.body.title).trim();
    if (!t) return res.status(400).json({ error: 'Titre vide' });
    if (t.length > 200) return res.status(400).json({ error: 'Titre trop long' });
    fields.push('title = ?'); values.push(t);
  }
  if (req.body.body !== undefined) {
    const b = String(req.body.body).trim();
    if (b.length > 20000) return res.status(400).json({ error: 'Corps trop long' });
    fields.push('body = ?'); values.push(b);
  }
  if (req.body.tags !== undefined) {
    let tags = [];
    if (Array.isArray(req.body.tags)) {
      tags = req.body.tags.map(t => String(t).trim()).filter(Boolean).slice(0, 10);
    }
    fields.push('tags = ?'); values.push(JSON.stringify(tags));
  }
  if (req.body.pinned !== undefined) {
    fields.push('pinned = ?'); values.push(req.body.pinned ? 1 : 0);
  }
  if (fields.length === 0) return res.json(newsRowToJson(existing));
  fields.push(`updated_at = datetime('now','localtime')`);
  values.push(id);
  db.prepare(`UPDATE news_posts SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  const row = db.prepare(`SELECT * FROM news_posts WHERE id = ?`).get(id);
  res.json(newsRowToJson(row));
});

app.delete('/api/news/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide' });
  db.prepare(`DELETE FROM news_posts WHERE id = ?`).run(id);
  res.json({ ok: true });
});

// ─── CONTRATS signés (admin uniquement) ──────────────────────
// Stockage des PDF de contrats avec analyse croisée vs P.R.E.L :
// détecte les clients signés en S-1 mais non prélevés (Encaisse) en S.

// Mapping studio brut (extrait du filename) → club canonique (cohérent avec P.R.E.L).
const CONTRACT_STUDIO_MAP = {
  'my coach lille':                 'Lille',
  'my coach vieux lille':           'Lille',
  'my coach boulogne':              'Boulogne-Billancourt',
  'my coach boulogne billancourt':  'Boulogne-Billancourt',
  'my coach levallois':             'Levallois-Perret',
  'my coach levallois perret':      'Levallois-Perret',
  'my coach marcq':                 'Marcq-en-Barœul',
  'my coach marcq en baroeul':      'Marcq-en-Barœul',
  'my coach neuilly':               'Neuilly-sur-Seine',
  'my coach neuilly sur seine':     'Neuilly-sur-Seine',
  'my coach wasquehal':             'Wasquehal',
};
function contractResolveStudio(raw) {
  if (!raw) return null;
  const norm = String(raw).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (CONTRACT_STUDIO_MAP[norm]) return CONTRACT_STUDIO_MAP[norm];
  for (const [k, v] of Object.entries(CONTRACT_STUDIO_MAP)) {
    if (norm.includes(k)) return v;
  }
  return null;
}

// Normalise un nom pour stockage / affichage :
// lowercase, sans accents, espaces simples, trim. Garde l'ordre original.
function contractNormalizeName(...parts) {
  return parts
    .filter(Boolean)
    .map(s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))
    .join(' ')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Clé de matching robuste aux inversions « Prénom Nom » ↔ « NOM Prénom ».
// Vendor exporte typiquement "PELLIEUX Sylvain" alors que les contrats
// arrivent en "Liam Savey". On trie les tokens alphabétiquement pour
// rendre la comparaison commutative.
function contractMatchKey(...parts) {
  const norm = contractNormalizeName(...parts);
  if (!norm) return '';
  return norm.split(/\s+/).filter(Boolean).sort().join(' ');
}

// Capitalise chaque mot d'une chaîne : "liam savey" → "Liam Savey", "de la cruz" → "De La Cruz".
// Gère les particules courantes (de, du, da, etc.) en conservant la casse pour les
// noms composés (Jean-Pierre → Jean-Pierre, jean-pierre → Jean-Pierre).
function contractTitleCase(s) {
  if (!s) return s;
  return String(s)
    .toLowerCase()
    .split(/(\s+|-+)/) // garde les séparateurs
    .map(part => {
      if (!part || /^\s+$|^-+$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join('');
}

// Parse le filename : YYMMDDX-prenom-nom-contrat-Studio.pdf
//   → { signed_date, first_name, last_name, raw_studio, club }
function contractParseFilename(filename) {
  const name = String(filename || '').replace(/\.pdf$/i, '');
  // Capture les 6 premiers chiffres (date) + index optionnel + reste
  const m = /^(\d{2})(\d{2})(\d{2})\d*[-_](.+?)[-_]contrat[-_](.+)$/i.exec(name);
  if (!m) return null;
  const [, yy, mm, dd, namePart, studioPart] = m;
  const year = 2000 + parseInt(yy, 10);
  const day = parseInt(dd, 10);
  const month = parseInt(mm, 10);
  if (year < 2020 || year > 2099 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const signedDate = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const nameTokens = namePart.split(/[-_]+/).filter(Boolean);
  const firstName = contractTitleCase(nameTokens[0] || '');
  const lastName = contractTitleCase(nameTokens.slice(1).join(' '));
  const rawStudio = studioPart.replace(/[-_]+/g, ' ').trim();
  const club = contractResolveStudio(rawStudio);
  return {
    signed_date: signedDate,
    first_name: firstName,
    last_name: lastName,
    raw_studio: rawStudio,
    club,
  };
}

// Lundi ISO de la semaine d'une date YYYY-MM-DD
function contractMondayOf(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0=dim, 1=lun, …, 6=sam
  const offset = (dow === 0 ? -6 : 1 - dow);
  dt.setUTCDate(dt.getUTCDate() + offset);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}-${String(dt.getUTCDate()).padStart(2,'0')}`;
}

// Construit un index { club: Map<matchKey, id_client> } à partir de prel_rows.
// Permet de retrouver le id_client d'un contrat → URL Déciplus.
function buildPrelIdClientIndex(db) {
  const rows = db.prepare(`
    SELECT DISTINCT club, membre, id_client
    FROM prel_rows
    WHERE id_client IS NOT NULL AND membre IS NOT NULL
  `).all();
  const idx = {};
  for (const r of rows) {
    const key = contractMatchKey(r.membre);
    if (!key || !r.club) continue;
    if (!idx[r.club]) idx[r.club] = new Map();
    // Si plusieurs id_client pour le même nom (rare), on garde le 1er
    if (!idx[r.club].has(key)) idx[r.club].set(key, r.id_client);
  }
  return idx;
}
function lookupIdClient(idx, club, contractMatchKeyStr) {
  if (!club || !contractMatchKeyStr || !idx[club]) return null;
  return idx[club].get(contractMatchKeyStr) || null;
}

function contractRowToJson(r, { includeBlob = false } = {}) {
  return {
    id: r.id,
    filename: r.filename,
    signed_date: r.signed_date,
    week_start: r.week_start,
    member_first_name: r.member_first_name,
    member_last_name: r.member_last_name,
    member_normalized: r.member_normalized,
    club: r.club,
    raw_studio: r.raw_studio,
    pdf_size: r.pdf_size,
    uploaded_at: r.uploaded_at,
    uploaded_by: r.uploaded_by,
    has_pdf: !!(r.pdf_blob && r.pdf_size > 0),
  };
}

// POST /api/contracts/upload
// body: { items: [{ filename, pdf_base64 }] }
// Parse chaque filename → insère un contrat. Ignore les filenames non
// reconnus. Si un contrat existe déjà (même filename), on remplace son
// PDF (idempotent).
app.post('/api/contracts/upload', requireAuth, requireAdmin, (req, res) => {
  const items = (req.body && req.body.items) || [];
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items requis (array non vide)' });
  }
  const db = getDb();
  const results = { inserted: 0, replaced: 0, skipped: 0, errors: [] };
  const insStmt = db.prepare(`
    INSERT INTO contracts (filename, signed_date, week_start, member_first_name,
      member_last_name, member_normalized, club, raw_studio, pdf_blob, pdf_size, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updStmt = db.prepare(`
    UPDATE contracts SET pdf_blob = ?, pdf_size = ?, uploaded_at = datetime('now','localtime'), uploaded_by = ?
    WHERE filename = ?
  `);
  const findStmt = db.prepare(`SELECT id FROM contracts WHERE filename = ?`);
  const tx = db.transaction(() => {
    for (const item of items) {
      const filename = String(item.filename || '').trim();
      const base64 = String(item.pdf_base64 || '');
      if (!filename) { results.skipped++; results.errors.push({ filename, reason: 'filename vide' }); continue; }
      const parsed = contractParseFilename(filename);
      if (!parsed) { results.skipped++; results.errors.push({ filename, reason: 'filename non reconnu (format attendu YYMMDDX-prenom-nom-contrat-Studio.pdf)' }); continue; }
      if (!parsed.club) { results.skipped++; results.errors.push({ filename, reason: `studio non reconnu : "${parsed.raw_studio}"` }); continue; }
      let pdfBuf = null;
      let pdfSize = 0;
      if (base64) {
        try {
          // Retire un éventuel préfixe data:application/pdf;base64,
          const clean = base64.replace(/^data:[^,]*,/, '');
          pdfBuf = Buffer.from(clean, 'base64');
          pdfSize = pdfBuf.length;
        } catch (e) {
          results.errors.push({ filename, reason: 'base64 invalide' });
        }
      }
      const memberNorm = contractNormalizeName(parsed.first_name, parsed.last_name);
      const weekStart = contractMondayOf(parsed.signed_date);
      const existing = findStmt.get(filename);
      if (existing) {
        updStmt.run(pdfBuf, pdfSize, req.session.name || 'admin', filename);
        results.replaced++;
      } else {
        insStmt.run(
          filename,
          parsed.signed_date,
          weekStart,
          parsed.first_name,
          parsed.last_name,
          memberNorm,
          parsed.club,
          parsed.raw_studio,
          pdfBuf,
          pdfSize,
          req.session.name || 'admin',
        );
        results.inserted++;
      }
    }
  });
  tx();
  res.json({ ok: true, ...results });
});

// GET /api/contracts — liste avec filtres optionnels
//   ?club=Lille       → uniquement un club
//   ?week=YYYY-MM-DD  → uniquement une semaine (lundi)
app.get('/api/contracts', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const where = [];
  const params = [];
  if (req.query.club) { where.push('club = ?'); params.push(String(req.query.club)); }
  if (req.query.week) { where.push('week_start = ?'); params.push(String(req.query.week)); }
  const sql = `
    SELECT id, filename, signed_date, week_start, member_first_name, member_last_name,
           member_normalized, club, raw_studio, pdf_size, uploaded_at, uploaded_by,
           (pdf_blob IS NOT NULL AND pdf_size > 0) AS has_pdf_flag
    FROM contracts
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY signed_date DESC, id DESC
  `;
  const rows = db.prepare(sql).all(...params);
  // Index id_client basé sur prel_rows (pour le bouton « Fiche » Déciplus)
  // Fallback uniquement si pas de id_client manuel sur le contrat.
  const idClientIdx = buildPrelIdClientIndex(db);
  // Liste des semaines + clubs distincts pour les filtres
  const weeks = db.prepare(`SELECT DISTINCT week_start FROM contracts ORDER BY week_start DESC`).all().map(r => r.week_start);
  const clubs = db.prepare(`SELECT DISTINCT club FROM contracts WHERE club IS NOT NULL ORDER BY club ASC`).all().map(r => r.club);
  res.json({
    contracts: rows.map(r => {
      const matchKey = contractMatchKey(r.member_first_name, r.member_last_name);
      const idClient = (r.id_client != null && Number.isInteger(r.id_client))
        ? r.id_client
        : lookupIdClient(idClientIdx, r.club, matchKey);
      return {
        id: r.id, filename: r.filename, signed_date: r.signed_date, week_start: r.week_start,
        member_first_name: r.member_first_name, member_last_name: r.member_last_name,
        member_normalized: r.member_normalized, club: r.club, raw_studio: r.raw_studio,
        pdf_size: r.pdf_size, uploaded_at: r.uploaded_at, uploaded_by: r.uploaded_by,
        has_pdf: !!r.has_pdf_flag,
        id_client: idClient,
        id_client_manual: r.id_client, // pour distinguer manuel vs deviné
      };
    }),
    weeks, clubs,
  });
});

// PUT /api/contracts/:id — mettre à jour des champs (id_client manuel,
// éventuellement d'autres plus tard). Permet de lier un contrat à sa
// fiche Déciplus quand l'auto-détection ne suffit pas.
app.put('/api/contracts/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide' });
  const existing = db.prepare(`SELECT id FROM contracts WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: 'Contrat introuvable' });
  const fields = [];
  const values = [];
  if (req.body && req.body.id_client !== undefined) {
    const v = req.body.id_client;
    if (v === null || v === '') {
      fields.push('id_client = NULL');
    } else {
      const n = parseInt(v, 10);
      if (!Number.isInteger(n) || n < 1) return res.status(400).json({ error: 'id_client doit être un entier positif' });
      fields.push('id_client = ?'); values.push(n);
    }
  }
  if (fields.length === 0) return res.json({ ok: true });
  values.push(id);
  db.prepare(`UPDATE contracts SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  res.json({ ok: true });
});

// GET /api/contracts/:id/pdf — stream du PDF stocké en blob
app.get('/api/contracts/:id/pdf', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide' });
  const row = db.prepare(`SELECT filename, pdf_blob, pdf_size FROM contracts WHERE id = ?`).get(id);
  if (!row || !row.pdf_blob) return res.status(404).json({ error: 'PDF introuvable' });
  res.setHeader('Content-Type', 'application/pdf');
  // inline pour ouverture dans le navigateur; pour forcer download, mettre 'attachment'
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(row.filename)}"`);
  res.setHeader('Content-Length', String(row.pdf_size || row.pdf_blob.length));
  res.send(row.pdf_blob);
});

app.delete('/api/contracts/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide' });
  db.prepare(`DELETE FROM contracts WHERE id = ?`).run(id);
  res.json({ ok: true });
});

// GET /api/contracts/analysis
// Analyse croisée S-1 (signature) → S (prélèvement attendu).
// Renvoie pour chaque contrat signé en S-1 :
//   • match: 'paid' | 'missing' | 'no_data'
//   • si missing : le contrat est dans la liste rouge à relancer
// Le matching se fait par nom normalisé (prénom + nom) vs prel_rows.membre.
// Détection « paid » = au moins 1 ligne prel_rows pour ce membre dans la
// semaine S avec état dans PREL_ETATS_OK (Encaisse / OK / Encaissé).
app.get('/api/contracts/analysis', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  // Détermine S et S-1 :
  //   • ?week= explicite → on l'utilise comme S
  //   • sinon → slot cur, sinon lundi du serveur
  //   • S-1 = ?prev= si fourni, sinon slot prev si week == slot cur, sinon S-7 jours
  let weekS = String(req.query.week || '').trim();
  let weekPrev = String(req.query.prev || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekS)) {
    const slotCur = prelGetSlot(db, 'cur');
    if (slotCur) {
      weekS = slotCur;
    } else {
      const today = new Date();
      const dow = today.getDay();
      const offset = (dow === 0 ? -6 : 1 - dow);
      today.setDate(today.getDate() + offset);
      weekS = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekPrev)) {
    const slotCur = prelGetSlot(db, 'cur');
    const slotPrev = prelGetSlot(db, 'prev');
    if (slotCur === weekS && slotPrev) {
      weekPrev = slotPrev;
    } else {
      // S-1 = S - 7 jours (calcul arithmétique)
      const [y, m, d] = weekS.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() - 7);
      weekPrev = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}-${String(dt.getUTCDate()).padStart(2,'0')}`;
    }
  }
  // Charge les contrats signés en S-1 (avec id_client manuel s'il existe)
  const contracts = db.prepare(`
    SELECT id, filename, signed_date, week_start, member_first_name, member_last_name,
           member_normalized, club, pdf_size, id_client AS id_client_manual,
           (pdf_blob IS NOT NULL AND pdf_size > 0) AS has_pdf_flag
    FROM contracts
    WHERE week_start = ?
    ORDER BY club, member_last_name, member_first_name
  `).all(weekPrev);
  // Charge les prélèvements de S, indexés par (club, matchKey)
  const prelRows = db.prepare(`
    SELECT membre, club, etat, id_client FROM prel_rows WHERE week_start = ?
  `).all(weekS);
  const prelHasData = prelRows.length > 0;
  // Index : club → Map<matchKey, { id_client, isOk }>
  // matchKey trie les tokens du nom alphabétiquement → résout l'inversion
  // « Prénom Nom » (contrat) ↔ « NOM Prénom » (Vendor / prel_rows)
  const indexByClub = {};
  for (const r of prelRows) {
    const key = contractMatchKey(r.membre);
    if (!key || !r.club) continue;
    if (!indexByClub[r.club]) indexByClub[r.club] = new Map();
    const cur = indexByClub[r.club].get(key) || { id_client: null, isOk: false };
    if (prelIsOk(r.etat)) cur.isOk = true;
    if (r.id_client != null && cur.id_client == null) cur.id_client = r.id_client;
    indexByClub[r.club].set(key, cur);
  }
  // Index id_client toutes semaines confondues (fallback : si le client
  // n'est pas dans S mais a été vu une fois, on peut quand même générer
  // l'URL Déciplus pour le bouton « Fiche »)
  const fallbackIdClientIdx = buildPrelIdClientIndex(db);
  // Pour chaque contrat, détermine le statut + id_client.
  // Priorité id_client : manuel (contracts.id_client) > PREL S match > fallback global.
  const enriched = contracts.map(c => {
    const matchKey = contractMatchKey(c.member_first_name, c.member_last_name);
    let match = 'no_data';
    let idClient = (c.id_client_manual != null && Number.isInteger(c.id_client_manual))
      ? c.id_client_manual
      : null;
    if (prelHasData) {
      const idx = indexByClub[c.club];
      const entry = idx && idx.get(matchKey);
      if (entry) {
        if (idClient == null) idClient = entry.id_client;
        match = entry.isOk ? 'paid' : 'present_not_paid';
      } else {
        match = 'missing';
      }
    }
    // Si pas trouvé dans S et toujours pas d'id, tente l'index global
    if (idClient == null) {
      idClient = lookupIdClient(fallbackIdClientIdx, c.club, matchKey);
    }
    return {
      id: c.id, filename: c.filename, signed_date: c.signed_date, week_start: c.week_start,
      member_first_name: c.member_first_name, member_last_name: c.member_last_name,
      member_normalized: c.member_normalized || contractNormalizeName(c.member_first_name, c.member_last_name),
      club: c.club, pdf_size: c.pdf_size,
      has_pdf: !!c.has_pdf_flag,
      match,
      id_client: idClient,
      id_client_manual: c.id_client_manual || null,
    };
  });
  // Agrégats par club
  const byClub = {};
  for (const c of enriched) {
    if (!byClub[c.club]) byClub[c.club] = { club: c.club, total: 0, paid: 0, missing: 0, present_not_paid: 0, no_data: 0, contracts: [] };
    byClub[c.club].total++;
    byClub[c.club][c.match]++;
    byClub[c.club].contracts.push(c);
  }
  res.json({
    week_signed: weekPrev,
    week_payment: weekS,
    prel_has_data: prelHasData,
    total_contracts: enriched.length,
    counts: {
      paid: enriched.filter(c => c.match === 'paid').length,
      missing: enriched.filter(c => c.match === 'missing').length,
      present_not_paid: enriched.filter(c => c.match === 'present_not_paid').length,
      no_data: enriched.filter(c => c.match === 'no_data').length,
    },
    clubs: Object.values(byClub).sort((a, b) => a.club.localeCompare(b.club)),
    contracts: enriched,
  });
});

// ─── COCKPIT : suivi mensuel KPIs par club ──────────────────
// Liste de clubs (à éditer ici pour reconfigurer le tableau de bord).
const COCKPIT_CLUBS = [
  'Boulogne-Billancourt',
  'Lille',
  'Levallois-Perret',
  'Marcq-en-Barœul',
  'Neuilly-sur-Seine',
  'Wasquehal',
];

function isValidIsoMonth(s) {
  return /^\d{4}-\d{2}-01$/.test(String(s || ''));
}

// Calcule le même mois de l'année précédente (N-1) à partir d'un YYYY-MM-01.
// Ex: 2026-06-01 → 2025-06-01.
function cockpitPreviousYearSameMonth(iso) {
  const [y, m] = iso.split('-').map(Number);
  return `${y - 1}-${String(m).padStart(2, '0')}-01`;
}

// KPI dont l'objectif est calculé automatiquement à partir de la valeur
// du même mois en N-1 (pas saisissable côté UI). Doit rester cohérent
// avec la flag `autoObjective: 'previous_year_same_month'` côté front.
const COCKPIT_AUTO_OBJECTIVE_N_MINUS_1 = new Set(['meta_ads']);

app.get('/api/cockpit/clubs', requireAuth, requireAdmin, (req, res) => {
  res.json({ clubs: COCKPIT_CLUBS });
});

// GET /api/cockpit/data?club=X&month=YYYY-MM-01
// → { objectifs: { kpi_id: val }, valeurs: { kpi_id: val } } pour ce club+mois.
app.get('/api/cockpit/data', requireAuth, requireAdmin, (req, res) => {
  const club = String(req.query.club || '').trim();
  const month = String(req.query.month || '').trim();
  if (!club) return res.status(400).json({ error: 'club requis' });
  if (!isValidIsoMonth(month)) return res.status(400).json({ error: 'month requis (YYYY-MM-01)' });
  const db = getDb();
  const objs = db.prepare(`SELECT kpi_id, objectif FROM kpi_objectives WHERE club = ?`).all(club);
  const vals = db.prepare(`SELECT kpi_id, valeur FROM kpi_values WHERE club = ? AND month = ?`).all(club, month);
  const objectifs = {};
  objs.forEach(r => { objectifs[r.kpi_id] = r.objectif; });
  const valeurs = {};
  vals.forEach(r => { valeurs[r.kpi_id] = r.valeur; });

  // Objectifs auto-calculés : pour chaque KPI marqué N-1, l'objectif =
  // valeur du même mois de l'année précédente pour ce même club.
  // Écrase toute saisie manuelle (la cellule est lecture seule côté UI).
  if (COCKPIT_AUTO_OBJECTIVE_N_MINUS_1.size > 0) {
    const prevYearMonth = cockpitPreviousYearSameMonth(month);
    const autoIds = Array.from(COCKPIT_AUTO_OBJECTIVE_N_MINUS_1);
    const prevRows = db.prepare(`
      SELECT kpi_id, valeur FROM kpi_values
      WHERE club = ? AND month = ? AND kpi_id IN (${autoIds.map(() => '?').join(',')})
    `).all(club, prevYearMonth, ...autoIds);
    prevRows.forEach(r => { objectifs[r.kpi_id] = r.valeur; });
    // Si pas de valeur en N-1, on force l'objectif à null
    autoIds.forEach(id => {
      if (!prevRows.find(r => r.kpi_id === id)) objectifs[id] = null;
    });
  }

  res.json({ club, month, objectifs, valeurs });
});

// GET /api/cockpit/average?month=YYYY-MM-01
// → { objectifs: { kpi_id: { avg, n } }, valeurs: { kpi_id: { avg, n } } }
//   Moyenne arithmétique sur les clubs ayant une valeur non null.
//   n = nombre de clubs renseignés (sur COCKPIT_CLUBS.length).
app.get('/api/cockpit/average', requireAuth, requireAdmin, (req, res) => {
  const month = String(req.query.month || '').trim();
  if (!isValidIsoMonth(month)) return res.status(400).json({ error: 'month requis (YYYY-MM-01)' });
  const db = getDb();
  const totalClubs = COCKPIT_CLUBS.length;
  const objs = db.prepare(`
    SELECT kpi_id, AVG(objectif) AS avg, COUNT(*) AS n
    FROM kpi_objectives WHERE objectif IS NOT NULL AND club IN (${COCKPIT_CLUBS.map(() => '?').join(',')})
    GROUP BY kpi_id
  `).all(...COCKPIT_CLUBS);
  const vals = db.prepare(`
    SELECT kpi_id, AVG(valeur) AS avg, COUNT(*) AS n
    FROM kpi_values WHERE month = ? AND valeur IS NOT NULL
      AND club IN (${COCKPIT_CLUBS.map(() => '?').join(',')})
    GROUP BY kpi_id
  `).all(month, ...COCKPIT_CLUBS);
  const objectifs = {};
  objs.forEach(r => { objectifs[r.kpi_id] = { avg: r.avg, n: r.n }; });
  const valeurs = {};
  vals.forEach(r => { valeurs[r.kpi_id] = { avg: r.avg, n: r.n }; });

  // Objectifs auto-calculés en mode moyenne : pour les KPI marqués N-1,
  // moyenne (par club) des valeurs du même mois N-1. Compte les clubs qui
  // ont une valeur en N-1.
  if (COCKPIT_AUTO_OBJECTIVE_N_MINUS_1.size > 0) {
    const prevYearMonth = cockpitPreviousYearSameMonth(month);
    const autoIds = Array.from(COCKPIT_AUTO_OBJECTIVE_N_MINUS_1);
    const prevAvg = db.prepare(`
      SELECT kpi_id, AVG(valeur) AS avg, COUNT(*) AS n
      FROM kpi_values WHERE month = ? AND valeur IS NOT NULL
        AND kpi_id IN (${autoIds.map(() => '?').join(',')})
        AND club IN (${COCKPIT_CLUBS.map(() => '?').join(',')})
      GROUP BY kpi_id
    `).all(prevYearMonth, ...autoIds, ...COCKPIT_CLUBS);
    autoIds.forEach(id => { objectifs[id] = { avg: null, n: 0 }; });
    prevAvg.forEach(r => { objectifs[r.kpi_id] = { avg: r.avg, n: r.n }; });
  }

  res.json({ month, total_clubs: totalClubs, objectifs, valeurs });
});

// PUT /api/cockpit/objectif  body { club, kpi_id, objectif }
app.put('/api/cockpit/objectif', requireAuth, requireAdmin, (req, res) => {
  const { club, kpi_id } = req.body || {};
  const objectif = req.body && req.body.objectif;
  if (!club || !kpi_id) return res.status(400).json({ error: 'club + kpi_id requis' });
  if (!COCKPIT_CLUBS.includes(club)) return res.status(400).json({ error: 'club inconnu' });
  const db = getDb();
  const v = (objectif === null || objectif === '' || objectif === undefined)
    ? null
    : Number(objectif);
  if (v !== null && !Number.isFinite(v)) return res.status(400).json({ error: 'objectif doit être un nombre' });
  if (v === null) {
    db.prepare(`DELETE FROM kpi_objectives WHERE club = ? AND kpi_id = ?`).run(String(club), String(kpi_id));
  } else {
    db.prepare(`
      INSERT INTO kpi_objectives (club, kpi_id, objectif) VALUES (?, ?, ?)
      ON CONFLICT(club, kpi_id) DO UPDATE SET objectif = excluded.objectif
    `).run(String(club), String(kpi_id), v);
  }
  res.json({ ok: true });
});

// PUT /api/cockpit/valeur  body { club, month, kpi_id, valeur }
app.put('/api/cockpit/valeur', requireAuth, requireAdmin, (req, res) => {
  const { club, month, kpi_id } = req.body || {};
  const valeur = req.body && req.body.valeur;
  if (!club || !kpi_id) return res.status(400).json({ error: 'club + kpi_id requis' });
  if (!COCKPIT_CLUBS.includes(club)) return res.status(400).json({ error: 'club inconnu' });
  if (!isValidIsoMonth(month)) return res.status(400).json({ error: 'month requis (YYYY-MM-01)' });
  const db = getDb();
  const v = (valeur === null || valeur === '' || valeur === undefined)
    ? null
    : Number(valeur);
  if (v !== null && !Number.isFinite(v)) return res.status(400).json({ error: 'valeur doit être un nombre' });
  if (v === null) {
    db.prepare(`DELETE FROM kpi_values WHERE club = ? AND month = ? AND kpi_id = ?`)
      .run(String(club), String(month), String(kpi_id));
  } else {
    db.prepare(`
      INSERT INTO kpi_values (club, month, kpi_id, valeur) VALUES (?, ?, ?, ?)
      ON CONFLICT(club, month, kpi_id) DO UPDATE SET valeur = excluded.valeur
    `).run(String(club), String(month), String(kpi_id), v);
  }
  res.json({ ok: true });
});

// ─── COACH LEADERS : gestion par l'admin ────────────────────
app.get('/api/coach-leaders', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, name, pin, studio, can_view_history, coach_slot, archived, created_at
    FROM coach_leaders
    WHERE archived = 0
    ORDER BY studio ASC, name ASC
  `).all();
  res.json({ leaders: rows });
});

// Studios disponibles pour le guest login : agrège les studios des
// coach_leaders + COCKPIT_CLUBS (fallback). Endpoint public (pas d'auth).
app.get('/api/auth/guest-studios', (req, res) => {
  const db = getDb();
  const studios = new Set();
  try {
    db.prepare(`SELECT DISTINCT studio FROM coach_leaders WHERE archived = 0`).all()
      .forEach(r => { if (r.studio) studios.add(r.studio); });
  } catch (_) { /* table coach_leaders absente -> fallback Cockpit ci-dessous (volontaire) */ }
  // Fallback : si aucun coach leader, on propose la liste des clubs Cockpit
  if (studios.size === 0 && typeof COCKPIT_CLUBS !== 'undefined' && Array.isArray(COCKPIT_CLUBS)) {
    COCKPIT_CLUBS.forEach(c => studios.add(c));
  }
  res.json({ studios: Array.from(studios).sort() });
});

app.post('/api/coach-leaders', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const name = String((req.body && req.body.name) || '').trim();
  const pin = String((req.body && req.body.pin) || '').trim();
  const studio = String((req.body && req.body.studio) || '').trim();
  // Par défaut accès historique = OUI (coach leader complet).
  // Si false → simple assistant studio (today seulement, rangée filtrée).
  const canViewHistory = req.body && req.body.can_view_history === false ? 0 : 1;
  // coach_slot : 1 ou 2 si assistant. NULL si leader complet.
  // (un leader peut tout voir donc on ignore coach_slot pour lui)
  let coachSlot = null;
  if (canViewHistory === 0 && req.body && req.body.coach_slot != null) {
    const n = parseInt(req.body.coach_slot, 10);
    if (n === 1 || n === 2) coachSlot = n;
  }
  if (!name) return res.status(400).json({ error: 'Nom requis' });
  if (!pin || pin.length < 4) return res.status(400).json({ error: 'PIN requis (4 caractères minimum)' });
  if (!studio) return res.status(400).json({ error: 'Studio requis' });
  const taken = db.prepare(`SELECT id FROM coach_leaders WHERE pin = ?`).get(pin)
    || db.prepare(`SELECT id FROM sales_reps WHERE pin = ?`).get(pin)
    || db.prepare(`SELECT id FROM coaches WHERE pin = ?`).get(pin);
  if (taken) return res.status(409).json({ error: 'PIN déjà utilisé par un autre compte' });
  try {
    const info = db.prepare(`
      INSERT INTO coach_leaders (name, pin, studio, can_view_history, coach_slot) VALUES (?, ?, ?, ?, ?)
    `).run(name, pin, studio, canViewHistory, coachSlot);
    res.json({ ok: true, id: info.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/coach-leaders/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide' });
  const existing = db.prepare(`SELECT id FROM coach_leaders WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: 'Coach leader introuvable' });
  const fields = [];
  const values = [];
  if (req.body.name !== undefined) {
    const v = String(req.body.name).trim();
    if (!v) return res.status(400).json({ error: 'Nom vide' });
    fields.push('name = ?'); values.push(v);
  }
  if (req.body.pin !== undefined) {
    const v = String(req.body.pin).trim();
    if (!v || v.length < 4) return res.status(400).json({ error: 'PIN trop court' });
    // Unicité : check sur coach_leaders (autres) + sales_reps + coaches
    const taken = db.prepare(`SELECT id FROM coach_leaders WHERE pin = ? AND id != ?`).get(v, id)
      || db.prepare(`SELECT id FROM sales_reps WHERE pin = ?`).get(v)
      || db.prepare(`SELECT id FROM coaches WHERE pin = ?`).get(v);
    if (taken) return res.status(409).json({ error: 'PIN déjà utilisé par un autre compte' });
    fields.push('pin = ?'); values.push(v);
  }
  if (req.body.studio !== undefined) {
    const v = String(req.body.studio).trim();
    if (!v) return res.status(400).json({ error: 'Studio vide' });
    fields.push('studio = ?'); values.push(v);
  }
  if (req.body.can_view_history !== undefined) {
    const v = req.body.can_view_history === true || req.body.can_view_history === 1 ? 1 : 0;
    fields.push('can_view_history = ?'); values.push(v);
    // Si on repasse en leader, on nettoie coach_slot
    if (v === 1) { fields.push('coach_slot = NULL'); }
  }
  if (req.body.coach_slot !== undefined) {
    const raw = req.body.coach_slot;
    if (raw === null || raw === '' || raw === 'null') {
      fields.push('coach_slot = NULL');
    } else {
      const n = parseInt(raw, 10);
      if (n !== 1 && n !== 2) return res.status(400).json({ error: 'coach_slot doit être 1 ou 2' });
      fields.push('coach_slot = ?'); values.push(n);
    }
  }
  if (fields.length === 0) return res.json({ ok: true });
  values.push(id);
  db.prepare(`UPDATE coach_leaders SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  res.json({ ok: true });
});

app.delete('/api/coach-leaders/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide' });
  // Suppression définitive (le PIN redevient libre pour réutilisation).
  // Les photos déjà uploadées par ce coach leader restent dans
  // standards_daily — leur champ uploaded_by est juste un nom texte.
  db.prepare(`DELETE FROM coach_leaders WHERE id = ?`).run(id);
  res.json({ ok: true });
});

// ─── STANDARDS : checklist d'évaluation par studio + mois ───
// Critères structurés en 4 catégories x 5 critères. Stockés en dur
// côté serveur (envoyés au front via GET /api/standards/criteria),
// modifiables ici sans toucher au front.
const STANDARDS_CRITERIA = [
  { category: 'Personnalisation', items: [
    { id: 'perso_1', label: 'L\'adhérent voit son nom et son programme du jour au tableau' },
  ]},
  { category: 'Accompagnement', items: [
    { id: 'accomp_1', label: 'Le suivi client est bien rempli et sans attente' },
  ]},
  { category: 'Exigence', items: [
    { id: 'exig_1', label: 'Propre, rangé, matériel à sa place — l\'effet « waouh »' },
    { id: 'exig_2', label: 'CHIC du coach' },
  ]},
];

function isValidStandardsMonth(s) { return /^\d{4}-\d{2}-01$/.test(String(s || '')); }

// Helper d'autorisation : admin OK pour tout studio,
// coach_leader / guest OK seulement pour leur propre studio.
function authStandardsStudio(req, studio) {
  if (req.session.role === 'admin') return true;
  if (req.session.role === 'standards_admin') return true; // lecture seule, tous studios
  if (req.session.role === 'coach_leader' && req.session.studio === studio) return true;
  if (req.session.role === 'guest' && req.session.studio === studio) return true;
  return false;
}

// Restriction sur la consultation des jours passés. Coach leader avec
// can_view_history=true peut consulter les jours passés. Tous les autres
// (assistant studio, guest) ne peuvent voir QUE today.
function standardsCanViewDate(req, date) {
  if (req.session.role === 'admin') return true;
  if (req.session.role === 'standards_admin') return true; // historique complet
  if (req.session.role === 'coach_leader' && req.session.can_view_history === true) return true;
  // Tous les autres : today uniquement
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return date === today;
}

app.get('/api/standards/criteria', requireAuth, (req, res) => {
  if (req.session.role !== 'admin' && req.session.role !== 'coach_leader') {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  res.json({ categories: STANDARDS_CRITERIA });
});

app.get('/api/standards/studios', requireAuth, (req, res) => {
  if (req.session.role !== 'admin' && req.session.role !== 'standards_admin') {
    return res.status(403).json({ error: 'Accès réservé aux administrateurs Standards' });
  }
  // Renvoie la liste des studios distincts en base (depuis coach_leaders)
  const db = getDb();
  const rows = db.prepare(`
    SELECT DISTINCT studio FROM coach_leaders WHERE archived = 0 ORDER BY studio ASC
  `).all();
  res.json({ studios: rows.map(r => r.studio) });
});

app.get('/api/standards/evaluations', requireAuth, (req, res) => {
  const studio = String(req.query.studio || '').trim();
  const month = String(req.query.month || '').trim();
  if (!studio) return res.status(400).json({ error: 'studio requis' });
  if (!isValidStandardsMonth(month)) return res.status(400).json({ error: 'month requis (YYYY-MM-01)' });
  if (!authStandardsStudio(req, studio)) return res.status(403).json({ error: 'Accès refusé sur ce studio' });
  const db = getDb();
  const rows = db.prepare(`
    SELECT criterion_id, status, comment, evaluated_by, updated_at, photo_size,
           (photo_blob IS NOT NULL AND photo_size > 0) AS has_photo_flag
    FROM standards_evaluations WHERE studio = ? AND month = ?
  `).all(studio, month);
  const byCriterion = {};
  rows.forEach(r => {
    byCriterion[r.criterion_id] = {
      criterion_id: r.criterion_id,
      status: r.status,
      comment: r.comment,
      evaluated_by: r.evaluated_by,
      updated_at: r.updated_at,
      photo_size: r.photo_size || 0,
      has_photo: !!r.has_photo_flag,
    };
  });
  // Calcule le score : OK / (OK + NOK)
  const flatItems = STANDARDS_CRITERIA.flatMap(c => c.items.map(i => i.id));
  let okCount = 0, nokCount = 0, evalCount = 0;
  for (const id of flatItems) {
    const e = byCriterion[id];
    if (!e || !e.status || e.status === 'na') continue;
    evalCount++;
    if (e.status === 'ok') okCount++;
    if (e.status === 'nok') nokCount++;
  }
  const totalItems = flatItems.length;
  const denom = okCount + nokCount;
  const score = denom > 0 ? Math.round((okCount / denom) * 100) : null;
  res.json({
    studio, month,
    evaluations: byCriterion,
    counts: { ok: okCount, nok: nokCount, na: evalCount === 0 ? 0 : (evalCount - okCount - nokCount), unrated: totalItems - okCount - nokCount },
    total_items: totalItems,
    score_pct: score,
  });
});

app.put('/api/standards/evaluation', requireAuth, (req, res) => {
  const studio = String((req.body && req.body.studio) || '').trim();
  const month = String((req.body && req.body.month) || '').trim();
  const criterion_id = String((req.body && req.body.criterion_id) || '').trim();
  const status = (req.body && req.body.status) || null;
  const comment = (req.body && req.body.comment) || null;
  if (!studio || !criterion_id) return res.status(400).json({ error: 'studio + criterion_id requis' });
  if (!isValidStandardsMonth(month)) return res.status(400).json({ error: 'month requis (YYYY-MM-01)' });
  if (!authStandardsStudio(req, studio)) return res.status(403).json({ error: 'Accès refusé sur ce studio' });
  if (status !== null && !['ok', 'nok', 'na'].includes(String(status))) {
    return res.status(400).json({ error: 'status doit être ok | nok | na | null' });
  }
  // Vérifie que le criterion_id existe dans la structure
  const known = STANDARDS_CRITERIA.flatMap(c => c.items.map(i => i.id));
  if (!known.includes(criterion_id)) return res.status(400).json({ error: 'criterion_id inconnu' });
  const db = getDb();
  // Si tout est vide ET pas de photo associée → supprime la ligne
  const hasPhoto = db.prepare(`
    SELECT 1 FROM standards_evaluations
    WHERE studio = ? AND month = ? AND criterion_id = ? AND photo_blob IS NOT NULL AND photo_size > 0
  `).get(studio, month, criterion_id);
  if (status === null && (comment === null || comment === '') && !hasPhoto) {
    db.prepare(`DELETE FROM standards_evaluations WHERE studio = ? AND month = ? AND criterion_id = ?`)
      .run(studio, month, criterion_id);
  } else {
    db.prepare(`
      INSERT INTO standards_evaluations (studio, month, criterion_id, status, comment, evaluated_by)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(studio, month, criterion_id) DO UPDATE SET
        status = excluded.status,
        comment = excluded.comment,
        evaluated_by = excluded.evaluated_by,
        updated_at = datetime('now','localtime')
    `).run(studio, month, criterion_id, status, comment, req.session.name || 'inconnu');
  }
  res.json({ ok: true });
});

// Upload d'une photo pour un critère donné. Body : { studio, month,
// criterion_id, photo_base64, mime } — base64 avec ou sans préfixe data:.
app.put('/api/standards/evaluation/photo', requireAuth, (req, res) => {
  const studio = String((req.body && req.body.studio) || '').trim();
  const month = String((req.body && req.body.month) || '').trim();
  const criterion_id = String((req.body && req.body.criterion_id) || '').trim();
  const photo_base64 = (req.body && req.body.photo_base64) || '';
  let mime = (req.body && req.body.mime) || 'image/jpeg';
  if (!studio || !criterion_id) return res.status(400).json({ error: 'studio + criterion_id requis' });
  if (!isValidStandardsMonth(month)) return res.status(400).json({ error: 'month requis (YYYY-MM-01)' });
  if (!authStandardsStudio(req, studio)) return res.status(403).json({ error: 'Accès refusé sur ce studio' });
  if (!photo_base64) return res.status(400).json({ error: 'photo_base64 requis' });
  const known = STANDARDS_CRITERIA.flatMap(c => c.items.map(i => i.id));
  if (!known.includes(criterion_id)) return res.status(400).json({ error: 'criterion_id inconnu' });
  // Décode base64 (avec ou sans préfixe data:)
  let buf;
  try {
    const clean = String(photo_base64).replace(/^data:[^,]*,/, '');
    buf = Buffer.from(clean, 'base64');
  } catch (e) {
    return res.status(400).json({ error: 'base64 invalide' });
  }
  if (!buf.length) return res.status(400).json({ error: 'photo vide' });
  if (buf.length > 8 * 1024 * 1024) return res.status(413).json({ error: 'photo trop lourde (max 8 Mo)' });
  // Si mime non précisé, on tente une détection rapide via magic bytes
  if (!/^image\//.test(mime)) mime = 'image/jpeg';
  const db = getDb();
  db.prepare(`
    INSERT INTO standards_evaluations (studio, month, criterion_id, photo_blob, photo_size, photo_mime, evaluated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(studio, month, criterion_id) DO UPDATE SET
      photo_blob = excluded.photo_blob,
      photo_size = excluded.photo_size,
      photo_mime = excluded.photo_mime,
      evaluated_by = excluded.evaluated_by,
      updated_at = datetime('now','localtime')
  `).run(studio, month, criterion_id, buf, buf.length, mime, req.session.name || 'inconnu');
  res.json({ ok: true, size: buf.length, mime });
});

// Récupère la photo (stream binaire avec auth Bearer).
app.get('/api/standards/evaluation/photo', requireAuth, (req, res) => {
  const studio = String(req.query.studio || '').trim();
  const month = String(req.query.month || '').trim();
  const criterion_id = String(req.query.criterion_id || '').trim();
  if (!studio || !criterion_id) return res.status(400).json({ error: 'studio + criterion_id requis' });
  if (!isValidStandardsMonth(month)) return res.status(400).json({ error: 'month requis (YYYY-MM-01)' });
  if (!authStandardsStudio(req, studio)) return res.status(403).json({ error: 'Accès refusé sur ce studio' });
  const db = getDb();
  const row = db.prepare(`
    SELECT photo_blob, photo_size, photo_mime FROM standards_evaluations
    WHERE studio = ? AND month = ? AND criterion_id = ?
  `).get(studio, month, criterion_id);
  if (!row || !row.photo_blob) return res.status(404).json({ error: 'Photo introuvable' });
  res.setHeader('Content-Type', row.photo_mime || 'image/jpeg');
  res.setHeader('Content-Length', String(row.photo_size || row.photo_blob.length));
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.send(row.photo_blob);
});

// ─── STANDARDS daily (matin / après-midi) ───────────────────
// Format quotidien : par studio + jour + créneau, une photo libre.

// Slots fixes — id + label. N'importe quel coach leader du studio
// peut remplir n'importe quel slot (un par jour).
// 6 catégories de base — dupliquées en deux groupes (Coach 1 / Coach 2)
const STANDARDS_DAILY_BASE = [
  { id: 'excel_adherent', label: 'Suivi Adh', icon: '📊' },
  { id: 'tableau_pret', label: 'Tableau prêt', icon: '📋' },
  { id: 'salle_entrainement', label: 'Training 1', icon: '🏋️' },
  { id: 'salle_entrainement_2', label: 'Training 2', icon: '🤸' },
  { id: 'sdb', label: 'SDB', icon: '🚿' },
  { id: 'chic_coach', label: 'Chic', icon: '👔' },
];
// Génère les 12 slots définitifs : c1_<id> et c2_<id> avec le champ
// `coach` (1 ou 2) pour permettre le regroupement côté front.
const STANDARDS_DAILY_SLOTS_DEF = [1, 2].flatMap(coachNum =>
  STANDARDS_DAILY_BASE.map(b => ({
    id: `c${coachNum}_${b.id}`,
    label: b.label,
    icon: b.icon,
    coach: coachNum,
  }))
);
const STANDARDS_DAILY_SLOTS = STANDARDS_DAILY_SLOTS_DEF.map(s => s.id);

app.get('/api/standards/daily/slots', requireAuth, (req, res) => {
  if (!['admin', 'standards_admin', 'coach_leader', 'guest'].includes(req.session.role)) {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  res.json({ slots: STANDARDS_DAILY_SLOTS_DEF });
});

// ─── Check-in quotidien (mood + tâches) ─────────────────────
// Doit être rempli AVANT de pouvoir uploader une photo Standards.
// Une ligne par studio × date × coach_slot (matin/après-midi).
const STANDARDS_MOODS = ['en_feu', 'bien', 'neutre', 'fatigue', 'pas_top'];

function slotToCoachNum(slot) {
  if (slot.startsWith('c1_')) return 1;
  if (slot.startsWith('c2_')) return 2;
  return null;
}

app.get('/api/standards/checkin', requireAuth, (req, res) => {
  const studio = String(req.query.studio || '').trim();
  const date = String(req.query.date || '').trim();
  if (!studio) return res.status(400).json({ error: 'studio requis' });
  if (!isValidStandardsDate(date)) return res.status(400).json({ error: 'date requise (YYYY-MM-DD)' });
  if (!authStandardsStudio(req, studio)) return res.status(403).json({ error: 'Accès refusé sur ce studio' });
  if (!standardsCanViewDate(req, date)) return res.status(403).json({ error: 'Accès refusé sur cette date' });
  const db = getDb();
  const rows = db.prepare(`
    SELECT coach_slot, mood, story_done, report_done, coach_name, updated_at
    FROM standards_daily_checkin WHERE studio = ? AND date = ?
  `).all(studio, date);
  const bySlot = {};
  rows.forEach(r => {
    bySlot[r.coach_slot] = {
      mood: r.mood,
      story_done: !!r.story_done,
      report_done: !!r.report_done,
      coach_name: r.coach_name,
      updated_at: r.updated_at,
    };
  });
  res.json({ studio, date, slots: bySlot });
});

app.put('/api/standards/checkin', requireAuth, (req, res) => {
  const studio = String((req.body && req.body.studio) || '').trim();
  const date = String((req.body && req.body.date) || '').trim();
  const coach_slot = parseInt((req.body && req.body.coach_slot), 10);
  const mood = String((req.body && req.body.mood) || '').trim();
  const story_done = (req.body && req.body.story_done) ? 1 : 0;
  const report_done = (req.body && req.body.report_done) ? 1 : 0;
  if (!studio) return res.status(400).json({ error: 'studio requis' });
  if (!isValidStandardsDate(date)) return res.status(400).json({ error: 'date requise (YYYY-MM-DD)' });
  if (!(coach_slot === 1 || coach_slot === 2)) return res.status(400).json({ error: 'coach_slot doit être 1 ou 2' });
  if (!STANDARDS_MOODS.includes(mood)) return res.status(400).json({ error: 'humeur invalide' });
  if (!authStandardsStudio(req, studio)) return res.status(403).json({ error: 'Accès refusé sur ce studio' });
  if (!standardsCanModify(req, date)) return res.status(403).json({ error: 'Modification uniquement pour le jour en cours' });
  // Les superviseurs (standards_admin) sont en lecture seule
  if (req.session.role === 'standards_admin') return res.status(403).json({ error: 'Lecture seule' });
  // Si le user a un coach_slot fixé (assistant studio / guest), il ne peut
  // remplir que SA rangée
  if ((req.session.coach_slot === 1 || req.session.coach_slot === 2) && req.session.coach_slot !== coach_slot) {
    return res.status(403).json({ error: 'Tu ne peux remplir que ta rangée' });
  }
  const db = getDb();
  db.prepare(`
    INSERT INTO standards_daily_checkin (studio, date, coach_slot, mood, story_done, report_done, coach_name)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(studio, date, coach_slot) DO UPDATE SET
      mood = excluded.mood,
      story_done = excluded.story_done,
      report_done = excluded.report_done,
      coach_name = excluded.coach_name,
      updated_at = datetime('now','localtime')
  `).run(studio, date, coach_slot, mood, story_done, report_done, req.session.name || 'inconnu');
  res.json({ ok: true });
});

// ─── Validation de la prise de poste ────────────────────────
// Le coach valide sa prise de poste quand TOUTES les photos de sa rangée
// sont uploadées. Une ligne par studio × date × shift (1 matin, 2 après-midi).

app.get('/api/standards/shift-validation', requireAuth, (req, res) => {
  const studio = String(req.query.studio || '').trim();
  const date = String(req.query.date || '').trim();
  if (!studio) return res.status(400).json({ error: 'studio requis' });
  if (!isValidStandardsDate(date)) return res.status(400).json({ error: 'date requise (YYYY-MM-DD)' });
  if (!authStandardsStudio(req, studio)) return res.status(403).json({ error: 'Accès refusé sur ce studio' });
  if (!standardsCanViewDate(req, date)) return res.status(403).json({ error: 'Accès refusé sur cette date' });
  const db = getDb();
  const rows = db.prepare(`
    SELECT shift, validated_by, validated_at
    FROM standards_shift_validation WHERE studio = ? AND date = ?
  `).all(studio, date);
  const byShift = {};
  rows.forEach(r => { byShift[r.shift] = { validated_by: r.validated_by, validated_at: r.validated_at }; });
  res.json({ studio, date, shifts: byShift });
});

app.put('/api/standards/shift-validation', requireAuth, (req, res) => {
  const studio = String((req.body && req.body.studio) || '').trim();
  const date = String((req.body && req.body.date) || '').trim();
  const shift = parseInt((req.body && req.body.shift), 10);
  if (!studio) return res.status(400).json({ error: 'studio requis' });
  if (!isValidStandardsDate(date)) return res.status(400).json({ error: 'date requise (YYYY-MM-DD)' });
  if (!(shift === 1 || shift === 2)) return res.status(400).json({ error: 'shift doit être 1 ou 2' });
  if (!authStandardsStudio(req, studio)) return res.status(403).json({ error: 'Accès refusé sur ce studio' });
  if (!standardsCanModify(req, date)) return res.status(403).json({ error: 'Validation uniquement pour le jour en cours' });
  if (req.session.role === 'standards_admin') return res.status(403).json({ error: 'Lecture seule' });
  // Un coach affecté à une rangée ne peut valider que la sienne
  if ((req.session.coach_slot === 1 || req.session.coach_slot === 2) && req.session.coach_slot !== shift) {
    return res.status(403).json({ error: 'Tu ne peux valider que ta prise de poste' });
  }
  // Garde-fou serveur : toutes les photos de la rangée doivent être présentes
  const prefix = `c${shift}_`;
  const expected = STANDARDS_DAILY_SLOTS.filter(s => s.startsWith(prefix));
  const db = getDb();
  const filled = db.prepare(`
    SELECT slot FROM standards_daily
    WHERE studio = ? AND date = ? AND photo_blob IS NOT NULL AND photo_size > 0
  `).all(studio, date).map(r => r.slot);
  const missing = expected.filter(id => !filled.includes(id));
  if (missing.length > 0) {
    return res.status(400).json({ error: `Encore ${missing.length} photo${missing.length > 1 ? 's' : ''} à prendre avant de valider` });
  }
  // Idempotent : la première validation gagne, on renvoie l'état courant
  db.prepare(`
    INSERT INTO standards_shift_validation (studio, date, shift, validated_by)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(studio, date, shift) DO NOTHING
  `).run(studio, date, shift, req.session.name || 'inconnu');
  const row = db.prepare(`
    SELECT validated_by, validated_at FROM standards_shift_validation
    WHERE studio = ? AND date = ? AND shift = ?
  `).get(studio, date, shift);
  res.json({ ok: true, validation: row });
});

// Helper : vérifie qu'un check-in existe pour (studio, date, coach_slot)
function checkinExists(studio, date, coach_slot) {
  const db = getDb();
  const row = db.prepare('SELECT 1 FROM standards_daily_checkin WHERE studio = ? AND date = ? AND coach_slot = ?').get(studio, date, coach_slot);
  return !!row;
}

// ─── Indicateurs du jour (compteurs + action clé) ───────────
// Une ligne par studio × jour. Compteurs (prises_ref, call_non_freq,
// avis_google, temoignages, surpack_eur) modifiables par tous ceux qui
// ont accès au studio aujourd'hui. action_cle uniquement par le coach
// leader complet (can_view_history = true) ou l'admin.
const KPI_COUNTERS = ['prises_ref', 'call_non_freq', 'avis_google', 'temoignages'];
const KPI_DEFAULTS = { prises_ref: 0, call_non_freq: 0, avis_google: 0, temoignages: 0, surpack_eur: 0, action_cle: null };
const KPI_CLUB_OWNER = '__club__';

// Détermine le scope KPI selon le rôle :
//  - guest    → ligne PRIVÉE par guest (clé = `guest:<safeName>`)
//  - autres   → ligne PARTAGÉE du club (`__club__`)
function kpiOwnerKey(session) {
  if (session.role === 'guest') {
    const safe = String(session.name || 'inconnu').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    return `guest:${safe || 'inconnu'}`;
  }
  return KPI_CLUB_OWNER;
}
function canEditKpiCounters(req) {
  if (req.session.role === 'admin') return true;
  if (req.session.role === 'standards_admin') return false; // read-only
  if (['coach_leader', 'guest', 'coach', 'coach-leader'].includes(req.session.role)) return true;
  return false;
}
function canEditKpiActionCle(req) {
  if (req.session.role === 'admin') return true;
  // Coach leader complet → édite l'action clé du club
  if (req.session.role === 'coach_leader' && req.session.can_view_history === true) return true;
  // Guest → édite SA propre action clé (scope guest:NAME)
  if (req.session.role === 'guest') return true;
  return false;
}

app.get('/api/standards/daily/kpi', requireAuth, (req, res) => {
  const studio = String(req.query.studio || '').trim();
  const date = String(req.query.date || '').trim();
  if (!studio) return res.status(400).json({ error: 'studio requis' });
  if (!isValidStandardsDate(date)) return res.status(400).json({ error: 'date requise (YYYY-MM-DD)' });
  if (!authStandardsStudio(req, studio)) return res.status(403).json({ error: 'Accès refusé sur ce studio' });
  if (!standardsCanViewDate(req, date)) return res.status(403).json({ error: 'Accès refusé sur cette date' });
  const db = getDb();
  const owner = kpiOwnerKey(req.session);
  const row = db.prepare(`
    SELECT prises_ref, call_non_freq, avis_google, temoignages, surpack_eur, action_cle, updated_at
    FROM standards_daily_kpi WHERE studio = ? AND date = ? AND owner_key = ?
  `).get(studio, date, owner);
  res.json({ studio, date, kpi: row || { ...KPI_DEFAULTS, updated_at: null } });
});

app.put('/api/standards/daily/kpi', requireAuth, (req, res) => {
  const studio = String((req.body && req.body.studio) || '').trim();
  const date = String((req.body && req.body.date) || '').trim();
  if (!studio) return res.status(400).json({ error: 'studio requis' });
  if (!isValidStandardsDate(date)) return res.status(400).json({ error: 'date requise (YYYY-MM-DD)' });
  if (!authStandardsStudio(req, studio)) return res.status(403).json({ error: 'Accès refusé sur ce studio' });
  if (!standardsCanModify(req, date)) return res.status(403).json({ error: 'Modification uniquement pour le jour en cours' });

  const body = req.body || {};
  const updates = {};
  // Compteurs entiers
  for (const k of KPI_COUNTERS) {
    if (body[k] != null) {
      if (!canEditKpiCounters(req)) return res.status(403).json({ error: 'Tu ne peux pas modifier les compteurs' });
      const n = parseInt(body[k], 10);
      if (!Number.isFinite(n) || n < 0 || n > 9999) return res.status(400).json({ error: `${k} doit être un entier ≥ 0` });
      updates[k] = n;
    }
  }
  // Surpack € : nombre décimal positif
  if (body.surpack_eur != null) {
    if (!canEditKpiCounters(req)) return res.status(403).json({ error: 'Tu ne peux pas modifier les compteurs' });
    const v = parseFloat(body.surpack_eur);
    if (!Number.isFinite(v) || v < 0 || v > 1e7) return res.status(400).json({ error: 'surpack_eur doit être un nombre ≥ 0' });
    updates.surpack_eur = Math.round(v * 100) / 100;
  }
  // Action clé : coach leader complet ou admin uniquement
  if ('action_cle' in body) {
    if (!canEditKpiActionCle(req)) return res.status(403).json({ error: "Seul le coach leader peut renseigner l'action clé du moment" });
    const raw = body.action_cle == null ? null : String(body.action_cle);
    if (raw && raw.length > 500) return res.status(400).json({ error: 'Action clé trop longue (500 caractères max)' });
    updates.action_cle = raw ? raw.trim() : null;
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Aucun champ à mettre à jour' });

  const db = getDb();
  const owner = kpiOwnerKey(req.session);
  // Récupère la ligne existante du scope (ou défauts)
  const existing = db.prepare('SELECT * FROM standards_daily_kpi WHERE studio = ? AND date = ? AND owner_key = ?').get(studio, date, owner) || { ...KPI_DEFAULTS };
  const merged = { ...existing, ...updates };
  db.prepare(`
    INSERT INTO standards_daily_kpi (studio, date, owner_key, prises_ref, call_non_freq, avis_google, temoignages, surpack_eur, action_cle, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
    ON CONFLICT(studio, date, owner_key) DO UPDATE SET
      prises_ref = excluded.prises_ref,
      call_non_freq = excluded.call_non_freq,
      avis_google = excluded.avis_google,
      temoignages = excluded.temoignages,
      surpack_eur = excluded.surpack_eur,
      action_cle = excluded.action_cle,
      updated_at = excluded.updated_at
  `).run(studio, date, owner, merged.prises_ref, merged.call_non_freq, merged.avis_google, merged.temoignages, merged.surpack_eur, merged.action_cle);
  res.json({ ok: true, kpi: merged });
});

function isValidStandardsDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
}

// Modification autorisée :
//   - admin : tout
//   - coach_leader / guest : today uniquement
function standardsCanModify(req, date) {
  if (req.session.role === 'admin') return true;
  if (!['coach_leader', 'guest'].includes(req.session.role)) return false;
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return date === today;
}

app.get('/api/standards/daily', requireAuth, (req, res) => {
  const studio = String(req.query.studio || '').trim();
  const date = String(req.query.date || '').trim();
  if (!studio) return res.status(400).json({ error: 'studio requis' });
  if (!isValidStandardsDate(date)) return res.status(400).json({ error: 'date requise (YYYY-MM-DD)' });
  if (!authStandardsStudio(req, studio)) return res.status(403).json({ error: 'Accès refusé sur ce studio' });
  if (!standardsCanViewDate(req, date)) return res.status(403).json({ error: "Accès refusé : consultation des jours passés non autorisée" });
  const db = getDb();
  const rows = db.prepare(`
    SELECT slot, photo_size, photo_mime, uploaded_by, uploaded_at,
           (photo_blob IS NOT NULL AND photo_size > 0) AS has_photo_flag
    FROM standards_daily WHERE studio = ? AND date = ?
  `).all(studio, date);
  const bySlot = {};
  STANDARDS_DAILY_SLOTS.forEach(id => { bySlot[id] = null; });
  rows.forEach(r => {
    bySlot[r.slot] = {
      has_photo: !!r.has_photo_flag,
      photo_size: r.photo_size || 0,
      photo_mime: r.photo_mime || null,
      uploaded_by: r.uploaded_by || null,
      uploaded_at: r.uploaded_at || null,
    };
  });
  res.json({ studio, date, slots: bySlot });
});

app.put('/api/standards/daily/photo', requireAuth, (req, res) => {
  const studio = String((req.body && req.body.studio) || '').trim();
  const date = String((req.body && req.body.date) || '').trim();
  const slot = String((req.body && req.body.slot) || '').trim();
  const photo_base64 = (req.body && req.body.photo_base64) || '';
  let mime = (req.body && req.body.mime) || 'image/jpeg';
  if (!studio || !slot) return res.status(400).json({ error: 'studio + slot requis' });
  if (!STANDARDS_DAILY_SLOTS.includes(slot)) return res.status(400).json({ error: 'slot inconnu' });
  if (!isValidStandardsDate(date)) return res.status(400).json({ error: 'date requise (YYYY-MM-DD)' });
  if (!authStandardsStudio(req, studio)) return res.status(403).json({ error: 'Accès refusé sur ce studio' });
  if (!standardsCanModify(req, date)) return res.status(403).json({ error: "Modification autorisée uniquement pour le jour en cours" });
  // Un coach affecté à une rangée (matin/après-midi) ne peut uploader
  // que sur SA rangée — celle du collègue reste en lecture seule.
  if ((req.session.coach_slot === 1 || req.session.coach_slot === 2) && slotToCoachNum(slot) !== req.session.coach_slot) {
    return res.status(403).json({ error: 'Tu ne peux modifier que ta prise de poste' });
  }
  // Plus de gating sur le check-in d'énergie : le rituel est optionnel
  // pour tous les rôles. Le formulaire reste affiché pour celles et ceux
  // qui veulent renseigner leur humeur, mais ne bloque jamais l'upload.
  if (!photo_base64) return res.status(400).json({ error: 'photo_base64 requis' });
  let buf;
  try {
    const clean = String(photo_base64).replace(/^data:[^,]*,/, '');
    buf = Buffer.from(clean, 'base64');
  } catch (e) {
    return res.status(400).json({ error: 'base64 invalide' });
  }
  if (!buf.length) return res.status(400).json({ error: 'photo vide' });
  if (buf.length > 8 * 1024 * 1024) return res.status(413).json({ error: 'photo trop lourde (max 8 Mo)' });
  if (!/^image\//.test(mime)) mime = 'image/jpeg';
  const db = getDb();
  db.prepare(`
    INSERT INTO standards_daily (studio, date, slot, photo_blob, photo_size, photo_mime, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(studio, date, slot) DO UPDATE SET
      photo_blob = excluded.photo_blob,
      photo_size = excluded.photo_size,
      photo_mime = excluded.photo_mime,
      uploaded_by = excluded.uploaded_by,
      uploaded_at = datetime('now','localtime')
  `).run(studio, date, slot, buf, buf.length, mime, req.session.name || 'inconnu');
  res.json({ ok: true, size: buf.length, mime });
});

app.get('/api/standards/daily/photo', requireAuth, (req, res) => {
  const studio = String(req.query.studio || '').trim();
  const date = String(req.query.date || '').trim();
  const slot = String(req.query.slot || '').trim();
  if (!studio || !slot) return res.status(400).json({ error: 'studio + slot requis' });
  if (!isValidStandardsDate(date)) return res.status(400).json({ error: 'date requise (YYYY-MM-DD)' });
  if (!authStandardsStudio(req, studio)) return res.status(403).json({ error: 'Accès refusé sur ce studio' });
  if (!standardsCanViewDate(req, date)) return res.status(403).json({ error: "Accès refusé : consultation des jours passés non autorisée" });
  const db = getDb();
  const row = db.prepare(`
    SELECT photo_blob, photo_size, photo_mime FROM standards_daily
    WHERE studio = ? AND date = ? AND slot = ?
  `).get(studio, date, slot);
  if (!row || !row.photo_blob) return res.status(404).json({ error: 'Photo introuvable' });
  res.setHeader('Content-Type', row.photo_mime || 'image/jpeg');
  res.setHeader('Content-Length', String(row.photo_size || row.photo_blob.length));
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.send(row.photo_blob);
});

app.delete('/api/standards/daily/photo', requireAuth, (req, res) => {
  const studio = String((req.body && req.body.studio) || req.query.studio || '').trim();
  const date = String((req.body && req.body.date) || req.query.date || '').trim();
  const slot = String((req.body && req.body.slot) || req.query.slot || '').trim();
  if (!studio || !slot) return res.status(400).json({ error: 'studio + slot requis' });
  if (!isValidStandardsDate(date)) return res.status(400).json({ error: 'date requise (YYYY-MM-DD)' });
  if (!authStandardsStudio(req, studio)) return res.status(403).json({ error: 'Accès refusé sur ce studio' });
  if (!standardsCanModify(req, date)) return res.status(403).json({ error: "Suppression autorisée uniquement pour le jour en cours" });
  // Même règle que l'upload : chacun ne touche qu'à sa rangée
  if ((req.session.coach_slot === 1 || req.session.coach_slot === 2) && slotToCoachNum(slot) !== req.session.coach_slot) {
    return res.status(403).json({ error: 'Tu ne peux modifier que ta prise de poste' });
  }
  const db = getDb();
  db.prepare(`DELETE FROM standards_daily WHERE studio = ? AND date = ? AND slot = ?`)
    .run(studio, date, slot);
  res.json({ ok: true });
});

// Supprime la photo d'un critère donné.
app.delete('/api/standards/evaluation/photo', requireAuth, (req, res) => {
  const studio = String((req.body && req.body.studio) || req.query.studio || '').trim();
  const month = String((req.body && req.body.month) || req.query.month || '').trim();
  const criterion_id = String((req.body && req.body.criterion_id) || req.query.criterion_id || '').trim();
  if (!studio || !criterion_id) return res.status(400).json({ error: 'studio + criterion_id requis' });
  if (!isValidStandardsMonth(month)) return res.status(400).json({ error: 'month requis (YYYY-MM-01)' });
  if (!authStandardsStudio(req, studio)) return res.status(403).json({ error: 'Accès refusé sur ce studio' });
  const db = getDb();
  const row = db.prepare(`
    SELECT status, comment FROM standards_evaluations
    WHERE studio = ? AND month = ? AND criterion_id = ?
  `).get(studio, month, criterion_id);
  if (!row) return res.json({ ok: true });
  // Si plus rien d'autre, on supprime la ligne ; sinon on vide juste la photo
  if (!row.status && !row.comment) {
    db.prepare(`DELETE FROM standards_evaluations WHERE studio = ? AND month = ? AND criterion_id = ?`)
      .run(studio, month, criterion_id);
  } else {
    db.prepare(`
      UPDATE standards_evaluations SET photo_blob = NULL, photo_size = 0, photo_mime = NULL,
        updated_at = datetime('now','localtime')
      WHERE studio = ? AND month = ? AND criterion_id = ?
    `).run(studio, month, criterion_id);
  }
  res.json({ ok: true });
});

// ─── Mount COACH routes under /api/coach/* ──────────────────

try {
  const mountCoachRoutes = require('./coach-routes');
  mountCoachRoutes(app, getDb, sessions, { requireAuth, requireAdmin });
  console.log('✓ Routes coaching montées sous /api/coach/*');
} catch (e) {
  console.error('✗ Erreur chargement coach-routes:', e.message);
}

// ─── Start ──────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
  const _db = getDb(); // Init DB on startup
  // Réinitialisation d'un code admin oublié : si la variable d'env
  // ADMIN_PIN_RESET est définie (Railway → Variables), on force ce code au
  // démarrage. À utiliser UNE fois pour reprendre la main, puis SUPPRIMER la
  // variable (sinon le code est ré-imposé à chaque redémarrage).
  try {
    const resetPin = String(process.env.ADMIN_PIN_RESET || '').trim();
    if (resetPin) {
      _db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('admin_pin', ?, datetime('now','localtime')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").run(resetPin);
      console.log('🔑 ADMIN_PIN_RESET actif : code admin réinitialisé. SUPPRIME la variable ADMIN_PIN_RESET après connexion.');
    }
  } catch (e) { console.error('ADMIN_PIN_RESET:', e.message); }
});
