'use strict';
// ============================================================================
//  CHEMIN DU CHALLENGE — moteur du parcours gamifié 42 jours (type Duolingo).
//
//  Principes (cf. ticket) :
//   - Séquentiel strict : 1 seul nœud actif à la fois (= 1er nœud non validé).
//     Un nœud non fait ne disparaît jamais ; le retard décale simplement la suite.
//   - Validation par ÉVÉNEMENT RÉEL de l'app (séance, ebook ouvert, photo…),
//     jamais par simple clic.
//   - On récompense les COMPORTEMENTS, jamais le poids perdu.
//   - Rollover de journée = Europe/Paris.
//   - Streak (🔥) = jours consécutifs GAGNÉS (2 repas renseignés). Un seul jour
//     manqué remet la série à 0 : il n'y a plus de protection (les jokers ont
//     été retirés).
//   - Punch (👊) : monnaie UNIQUE du parcours, selon le barème de chaque nœud.
//     Elle remplace les anciens XP (⭐) et gems (💎), fusionnés par addition.
//
//  Factory injectable : createChallengeEngine({ getDb }) -> API. `getDb()` doit
//  renvoyer une instance better-sqlite3. Les helpers purs (dates, réducteurs) et
//  les données de seed sont aussi exportés directement pour les tests unitaires.
// ============================================================================

// v3 : XP + gems fusionnés en Punch, jokers retirés.
// v4 : l'étape 13 se valide par une photo POSTÉE AU GROUPE (event 'groupe_photo')
//      et non plus par l'écran d'analyse d'assiette (event 'plate').
const CHALLENGE_PATH_SEED_VERSION = 4;
const CHALLENGE_WEEK_TITLES = {
  1: 'Lancement', 2: 'Prendre le rythme', 3: 'Mi-parcours',
  4: 'Relance', 5: 'Tenir le cap', 6: 'Dernière ligne droite',
};
// Les 43 étapes, indexées 0 -> 42 (l'étape 0 = « Commencer »), réparties en 6
// semaines : S1 0–7 (8 étapes), puis 7 par semaine.
//   `event`  = l'événement réel de l'app qui valide l'étape (cœur du moteur).
//   `action` = le libellé du bouton présenté au client.
//   `flow`   = sous-étapes des étapes COMPOSITES (0/21/41) : donnée exposée pour
//              la Phase 2. En attendant, l'étape se valide dès la 1re sous-étape
//              (event 'photo') pour ne jamais geler le parcours.
//   `jalon`  = debut | mi | fin -> ces étapes + le bilan final sont les ★ dorés.
// Plus aucune étape « pesée » : la pesée reste saisie par le coach dans Mon
// Parcours et continue d'ancrer la date de départ (cf. pathStartYmd).
const CHALLENGE_PATH_NODES = [
  // S1 — Lancement (index 0–7)
  { day: 0, week: 1, type: 'commencer', event: 'photo', title: "Commencer", action: "Photos + mensurations + présente-toi au groupe", punch: 80, milestone: 1, jalon: 'debut', flow: ['photos', 'mensurations', 'groupe'] },
  { day: 1, week: 1, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", punch: 25, milestone: 0 },
  { day: 2, week: 1, type: 'ebook', event: 'ebook', title: "Découvre ton ebook", action: "Ouvrir le ebook", punch: 15, milestone: 0 },
  { day: 3, week: 1, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", punch: 25, milestone: 0 },
  { day: 4, week: 1, type: 'ebook', event: 'ebook', title: "Découvre ton ebook", action: "Ouvrir le ebook", punch: 15, milestone: 0 },
  { day: 5, week: 1, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", punch: 25, milestone: 0 },
  { day: 6, week: 1, type: 'special', event: 'coach', title: "Message coach", action: "Écris un message à ton coach", punch: 20, milestone: 0 },
  { day: 7, week: 1, type: 'bilan', event: 'bilan', title: "Bilan de la semaine", action: "Ouvre ton bilan", punch: 20, milestone: 0 },
  // S2 — Prendre le rythme (index 8–14)
  { day: 8, week: 2, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", punch: 25, milestone: 0 },
  { day: 9, week: 2, type: 'ebook', event: 'ebook', title: "Découvre ton ebook", action: "Ouvrir le ebook", punch: 15, milestone: 0 },
  { day: 10, week: 2, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", punch: 25, milestone: 0 },
  { day: 11, week: 2, type: 'ebook', event: 'ebook', title: "Découvre ton ebook", action: "Ouvrir le ebook", punch: 15, milestone: 0 },
  { day: 12, week: 2, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", punch: 25, milestone: 0 },
  { day: 13, week: 2, type: 'special', event: 'groupe_photo', title: "Photo d'assiette", action: "Poste une photo de ton assiette au groupe", punch: 20, milestone: 0 },
  { day: 14, week: 2, type: 'bilan', event: 'bilan', title: "Bilan de la semaine", action: "Ouvre ton bilan", punch: 20, milestone: 0 },
  // S3 — Mi-parcours (index 15–21)
  { day: 15, week: 3, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", punch: 25, milestone: 0 },
  { day: 16, week: 3, type: 'ebook', event: 'ebook', title: "Découvre ton ebook", action: "Ouvrir le ebook", punch: 15, milestone: 0 },
  { day: 17, week: 3, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", punch: 25, milestone: 0 },
  { day: 18, week: 3, type: 'ebook', event: 'ebook', title: "Découvre ton ebook", action: "Ouvrir le ebook", punch: 15, milestone: 0 },
  { day: 19, week: 3, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", punch: 25, milestone: 0 },
  { day: 20, week: 3, type: 'special', event: 'coach', title: "Message coach", action: "Écris un message à ton coach", punch: 20, milestone: 0 },
  { day: 21, week: 3, type: 'check', event: 'photo', title: "Point mi-parcours", action: "Photos + mensurations mi-parcours", punch: 90, milestone: 1, jalon: 'mi', flow: ['photos', 'mensurations'] },
  // S4 — Relance (index 22–28)
  { day: 22, week: 4, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", punch: 25, milestone: 0 },
  { day: 23, week: 4, type: 'ebook', event: 'ebook', title: "Découvre ton ebook", action: "Ouvrir le ebook", punch: 15, milestone: 0 },
  { day: 24, week: 4, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", punch: 25, milestone: 0 },
  { day: 25, week: 4, type: 'ebook', event: 'ebook', title: "Découvre ton ebook", action: "Ouvrir le ebook", punch: 15, milestone: 0 },
  { day: 26, week: 4, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", punch: 25, milestone: 0 },
  { day: 27, week: 4, type: 'special', event: 'groupe', title: "Communauté", action: "Encourage un membre du groupe", punch: 20, milestone: 0 },
  { day: 28, week: 4, type: 'bilan', event: 'bilan', title: "Bilan de la semaine", action: "Ouvre ton bilan", punch: 20, milestone: 0 },
  // S5 — Tenir le cap (index 29–35)
  { day: 29, week: 5, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", punch: 25, milestone: 0 },
  { day: 30, week: 5, type: 'ebook', event: 'ebook', title: "Découvre ton ebook", action: "Ouvrir le ebook", punch: 15, milestone: 0 },
  { day: 31, week: 5, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", punch: 25, milestone: 0 },
  { day: 32, week: 5, type: 'ebook', event: 'ebook', title: "Découvre ton ebook", action: "Ouvrir le ebook", punch: 15, milestone: 0 },
  { day: 33, week: 5, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", punch: 25, milestone: 0 },
  { day: 34, week: 5, type: 'special', event: 'groupe', title: "Communauté", action: "Partage-nous ta meilleure recette sur le groupe", punch: 20, milestone: 0 },
  { day: 35, week: 5, type: 'bilan', event: 'bilan', title: "Bilan de la semaine", action: "Ouvre ton bilan", punch: 20, milestone: 0 },
  // S6 — Dernière ligne droite (index 36–42)
  { day: 36, week: 6, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", punch: 25, milestone: 0 },
  { day: 37, week: 6, type: 'ebook', event: 'ebook', title: "Découvre ton ebook", action: "Ouvrir le ebook", punch: 15, milestone: 0 },
  { day: 38, week: 6, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", punch: 25, milestone: 0 },
  { day: 39, week: 6, type: 'ebook', event: 'ebook', title: "Découvre ton ebook", action: "Ouvrir le ebook", punch: 15, milestone: 0 },
  { day: 40, week: 6, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", punch: 25, milestone: 0 },
  { day: 41, week: 6, type: 'check', event: 'photo', title: "Point final", action: "Photos + mensurations finales", punch: 100, milestone: 1, jalon: 'fin', flow: ['photos', 'mensurations'] },
  { day: 42, week: 6, type: 'final', event: 'bilan', title: "Bilan final", action: "Bilan final, recap complet, badge finisher", punch: 100, milestone: 1 },
];

// ---------------------------------------------------------------------------
//  Helpers PURS (aucune DB) — testables directement.
// ---------------------------------------------------------------------------
// Date -> 'YYYY-MM-DD' en Europe/Paris (DST géré par Intl). '' si invalide.
function pathParisYmd(input) {
  try {
    const d = input ? new Date(input) : new Date();
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch (_) { return ''; }
}
// Nombre de jours calendaires (B - A) entre deux 'YYYY-MM-DD' (UTC -> pas de DST).
function pathDaysBetween(ymdA, ymdB) {
  const a = Date.parse(ymdA + 'T00:00:00Z'), b = Date.parse(ymdB + 'T00:00:00Z');
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}
// 'YYYY-MM-DD' - n jours (via midi UTC pour éviter les bords DST).
function pathYmdMinusDays(ymd, n) {
  const t = Date.parse(ymd + 'T12:00:00Z');
  if (isNaN(t)) return ymd;
  return pathParisYmd(new Date(t - n * 86400000));
}
// Série AFFICHÉE — lecture seule, n'écrit RIEN.
// Un seul jour plein manqué depuis le dernier jour gagné rompt la chaîne : on
// affiche 0 (elle repartira à 1 au prochain jour gagné). Le jour courant, lui,
// ne compte pas comme manqué tant qu'il n'est pas fini.
function streakAffiche(streak, lastWin, today) {
  const s = streak > 0 ? streak : 0;
  if (!lastWin || s === 0) return s;
  const missed = pathDaysBetween(lastWin, today) - 1;
  return missed <= 0 ? s : 0;             // aujourd'hui ou hier : intacte ; sinon rompue
}

// Streak après un jour gagné (réconciliation des jours manqués déjà faite en amont).
function streakAfterOpen(streak, last, today) {
  if (last === today) return streak;           // déjà compté aujourd'hui
  if (!last) return 1;                          // toute première ouverture
  if (pathDaysBetween(last, today) === 1) return streak + 1; // jour consécutif
  return streak <= 0 ? 1 : streak + 1;          // reprise après reset / trou déjà soldé
}
// Sous-étape d'un flow -> événement réel de l'app qui la satisfait.
// Ordre LIBRE : le client peut poster au groupe avant de faire ses photos.
const FLOW_STEP_EVENT = { photos: 'photo', mensurations: 'mensurations', groupe: 'groupe' };

// ⚠️ Le Chemin nomme ses jalons debut/mi/fin, Mon Parcours les nomme depart/s3/s6.
// Les photos sont rangées sous les SECONDS : sans cette traduction, on compterait 0.
const JALON_VERS_PARCOURS = { debut: 'depart', mi: 's3', fin: 's6' };
// Les 3 photos EXIGÉES pour valider la sous-étape « photos ». Le 4e emplacement
// de Mon Parcours (« libre ») reste un bonus : il n'entre pas dans le compte.
const PHOTOS_REQUISES = ['face', 'profil', 'dos'];

// Étape active à partir de l'ensemble des étapes validées (séquentiel strict).
// Les étapes sont indexées 0 -> total-1 (l'étape 0 = « Commencer »).
// ⚠️ Renvoie null (et JAMAIS undefined/false) quand tout est fini : l'étape 0
// étant falsy, tout appelant DOIT tester `=== null` et non `!valeur`.
function activeDayFromDone(doneSet, total) {
  for (let d = 0; d < total; d++) if (!doneSet.has(d)) return d;
  return null;
}

// ---------------------------------------------------------------------------
//  Schéma SQL (exporté pour les tests : une seule source de vérité).
// ---------------------------------------------------------------------------
const CHALLENGE_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS path_nodes (
    day INTEGER PRIMARY KEY,
    week INTEGER NOT NULL,
    type TEXT NOT NULL,
    validation_event TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    punch INTEGER NOT NULL DEFAULT 0,
    is_milestone INTEGER NOT NULL DEFAULT 0,
    meta TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS user_node_progress (
    client_email TEXT NOT NULL,
    node_day INTEGER NOT NULL,
    completed_at TEXT NOT NULL DEFAULT '',
    punch_awarded INTEGER NOT NULL DEFAULT 0,
    ref_id TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (client_email, node_day)
  );
  CREATE TABLE IF NOT EXISTS user_game_stats (
    client_email TEXT PRIMARY KEY,
    punch INTEGER NOT NULL DEFAULT 0,              -- monnaie unique (ex-XP + ex-gems)
    streak_current INTEGER NOT NULL DEFAULT 0,
    streak_best INTEGER NOT NULL DEFAULT 0,
    last_win_date TEXT NOT NULL DEFAULT '',        -- dernier jour GAGNÉ (2 repas renseignés)
    updated_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS user_ebook_opens (
    client_email TEXT NOT NULL,
    ebook_id INTEGER NOT NULL,
    day_ymd TEXT NOT NULL,
    opened_at TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (client_email, ebook_id, day_ymd)
  );
  -- Texte du bilan hebdo, mis en cache par semaine : un bilan rouvert ne doit pas
  -- rappeler l'IA (coût) ni changer de mots sous les yeux du client.
  CREATE TABLE IF NOT EXISTS user_bilan_texte (
    client_email TEXT NOT NULL,
    week INTEGER NOT NULL,
    texte TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',   -- 'ia' | 'modele'
    created_at TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (client_email, week)
  );
  CREATE TABLE IF NOT EXISTS user_bilan_seen (
    client_email TEXT NOT NULL,
    week INTEGER NOT NULL,
    seen_at TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (client_email, week)
  );
  -- Sous-étapes des étapes COMPOSITES (0/21/41). L'étape ne passe au vert que
  -- lorsque TOUTES les sous-étapes de son flow sont faites, dans l'ordre libre.
  CREATE TABLE IF NOT EXISTS user_node_flow (
    client_email TEXT NOT NULL,
    node_day INTEGER NOT NULL,
    step TEXT NOT NULL,
    done_at TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (client_email, node_day, step)
  );
  -- Jours GAGNÉS (série 🔥) : un jour est gagné dès que le client a renseigné au
  -- moins 2 repas sur 3, quel que soit le statut (on récompense l'engagement, pas
  -- la perfection). La PK (email, jour) garantit l'idempotence : un jour ne peut
  -- alimenter la série qu'une seule fois.
  CREATE TABLE IF NOT EXISTS user_day_wins (
    client_email TEXT NOT NULL,
    day_ymd TEXT NOT NULL,
    repas INTEGER NOT NULL DEFAULT 0,
    won_at TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (client_email, day_ymd)
  );
`;

// ---------------------------------------------------------------------------
//  Factory : lie le moteur à une DB (getDb) et renvoie l'API utilisée par server.js.
// ---------------------------------------------------------------------------
function createChallengeEngine({ getDb }) {
  function pathFeatureEnabled() {
    try {
      const r = getDb().prepare("SELECT value FROM app_settings WHERE key='challenge_path_enabled'").get();
      return !!r && ['on', '1', 'true', 'yes'].includes(String(r.value).toLowerCase());
    } catch (_) { return false; }
  }

  // Une colonne ne s'ajoute qu'une fois : CREATE TABLE IF NOT EXISTS ne touche pas
  // les tables déjà en place (prod), d'où ces ALTER conditionnels.
  function ajouterColonne(table, colonne, definition) {
    const cols = getDb().prepare('PRAGMA table_info(' + table + ')').all();
    if (!cols.length || cols.some((c) => c.name === colonne)) return false;
    getDb().exec('ALTER TABLE ' + table + ' ADD COLUMN ' + colonne + ' ' + definition);
    return true;
  }
  // Fusion XP + gems -> Punch. La somme ne doit être faite QU'UNE FOIS : si on la
  // rejouait à chaque démarrage, les compteurs doubleraient. D'où le drapeau en
  // base (et non un simple test « punch == 0 », qu'un compte à 0 ferait rejouer).
  // Les anciennes colonnes (xp_total, gems, jokers, xp_awarded…) sont laissées en
  // place mais ne sont plus ni lues ni écrites : la migration reste réversible
  // (un retour arrière du déploiement retrouve ses données).
  function migrerVersPunch() {
    try {
      ajouterColonne('path_nodes', 'punch', 'INTEGER NOT NULL DEFAULT 0');
      ajouterColonne('user_node_progress', 'punch_awarded', 'INTEGER NOT NULL DEFAULT 0');
      const neuve = ajouterColonne('user_game_stats', 'punch', 'INTEGER NOT NULL DEFAULT 0');
      const fait = (getDb().prepare("SELECT value FROM app_settings WHERE key='challenge_punch_migrated'").get() || {}).value;
      if (String(fait) === '1') return;
      if (neuve) {
        // Base existante : le total Punch reprend l'ancien XP + les anciens gems.
        const anciennes = getDb().prepare('PRAGMA table_info(user_game_stats)').all().map((c) => c.name);
        if (anciennes.includes('xp_total') && anciennes.includes('gems')) {
          getDb().exec('UPDATE user_game_stats SET punch = COALESCE(xp_total,0) + COALESCE(gems,0)');
        }
        if (anciennes.includes('punch_awarded')) { /* rien : historique par nœud, non recalculé */ }
      }
      const pn = getDb().prepare('PRAGMA table_info(user_node_progress)').all().map((c) => c.name);
      if (pn.includes('xp_awarded') && pn.includes('gems_awarded')) {
        getDb().exec('UPDATE user_node_progress SET punch_awarded = COALESCE(xp_awarded,0) + COALESCE(gems_awarded,0) WHERE punch_awarded = 0');
      }
      getDb().prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('challenge_punch_migrated', '1', datetime('now','localtime')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").run();
    } catch (e) { console.error('migrerVersPunch :', e && e.message); }
  }

  function ensureChallengePathSchema() {
    try {
      getDb().exec(CHALLENGE_SCHEMA_SQL);
      // Migration : la série est désormais alimentée par les REPAS renseignés et
      // non plus par l'ouverture d'ebook -> `last_win_date` remplace
      // `last_ebook_open_date` (conservée telle quelle, devenue inutilisée).
      // On reprend l'ancienne valeur pour ne casser aucune série en cours.
      const cols = getDb().prepare('PRAGMA table_info(user_game_stats)').all();
      if (cols.length && !cols.some((c) => c.name === 'last_win_date')) {
        getDb().exec("ALTER TABLE user_game_stats ADD COLUMN last_win_date TEXT NOT NULL DEFAULT ''");
        getDb().exec('UPDATE user_game_stats SET last_win_date = last_ebook_open_date');
      }
      migrerVersPunch();
      const seededV = (getDb().prepare("SELECT value FROM app_settings WHERE key='challenge_path_seed_v'").get() || {}).value;
      const count = getDb().prepare('SELECT COUNT(*) c FROM path_nodes').get().c;
      if (count !== CHALLENGE_PATH_NODES.length || String(seededV) !== String(CHALLENGE_PATH_SEED_VERSION)) {
        const up = getDb().prepare(`INSERT INTO path_nodes (day, week, type, validation_event, title, punch, is_milestone, meta)
          VALUES (?,?,?,?,?,?,?,?)
          ON CONFLICT(day) DO UPDATE SET week=excluded.week, type=excluded.type, validation_event=excluded.validation_event,
            title=excluded.title, punch=excluded.punch, is_milestone=excluded.is_milestone, meta=excluded.meta`);
        const tx = getDb().transaction(() => {
          CHALLENGE_PATH_NODES.forEach((n) => up.run(n.day, n.week, n.type, n.event, n.title, n.punch, n.milestone, n.jalon || ''));
        });
        tx();
        getDb().prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('challenge_path_seed_v', ?, datetime('now','localtime')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").run(String(CHALLENGE_PATH_SEED_VERSION));
      }
    } catch (e) { console.error('ensureChallengePathSchema :', e && e.message); }
  }

  // Date de début de la COHORTE du client (ville + n° de challenge), '' si aucune.
  // C'est la date collective posée par le coach : elle lance le parcours pour tout
  // le groupe le même jour.
  function cohortStartYmd(email) {
    if (!email) return '';
    try {
      const meta = getDb().prepare('SELECT ville, challenge_no FROM nutrition_client_meta WHERE client_email=?').get(email);
      if (!meta) return '';
      const row = getDb().prepare('SELECT start_date FROM nutrition_access_codes WHERE ville=? AND challenge_no=?').get(meta.ville, meta.challenge_no);
      if (row && row.start_date) return pathParisYmd(row.start_date);
    } catch (_) { /* colonne/table absente : on retombe sur l'individuel */ }
    return '';
  }
  // Date de départ du parcours (YMD Paris), par ordre de priorité :
  //  1. la date de la COHORTE si le coach en a posé une -> challenge collectif ;
  //  2. sinon la pesée 'depart' du client ;
  //  3. sinon data.startDate (1re ouverture du plan).
  // '' = pas démarré. Une date de cohorte FUTURE donne un jour <= 0 -> chemin
  // verrouillé jusqu'au jour J (cf. pathCurrentDay / awardClientEvent).
  function pathStartYmd(email) {
    if (!email) return '';
    const coh = cohortStartYmd(email);
    if (coh) return coh;
    try {
      const dep = getDb().prepare("SELECT date FROM nutrition_parcours_pesees WHERE client_email=? AND type='depart'").get(email);
      if (dep && dep.date) return pathParisYmd(dep.date);
    } catch (_) { /* table absente en test */ }
    try {
      const r = getDb().prepare('SELECT data FROM nutrition_clients WHERE email=?').get(email);
      const d = r && r.data ? JSON.parse(r.data) : {};
      if (d && d.startDate) return pathParisYmd(d.startDate);
    } catch (_) { /* ignore */ }
    return '';
  }
  // Jour de challenge 1-based aujourd'hui (Paris). 0 si pas démarré. Peut dépasser 42.
  function pathCurrentDay(email) {
    const start = pathStartYmd(email);
    if (!start) return 0;
    return pathDaysBetween(start, pathParisYmd()) + 1;
  }
  function pathDoneDays(email) {
    const set = new Set();
    try { getDb().prepare("SELECT node_day FROM user_node_progress WHERE client_email=? AND completed_at!=''").all(email).forEach((r) => set.add(r.node_day)); } catch (_) { /* ignore */ }
    return set;
  }
  function pathActiveDay(email) {
    return activeDayFromDone(pathDoneDays(email), CHALLENGE_PATH_NODES.length);
  }
  // Sous-étapes déjà faites d'une étape composite (ordre libre).
  function flowDone(email, day) {
    const set = new Set();
    try { getDb().prepare('SELECT step FROM user_node_flow WHERE client_email=? AND node_day=?').all(email, day).forEach((r) => set.add(r.step)); } catch (_) { /* table absente */ }
    return set;
  }
  // Combien des 3 photos exigées le client a-t-il déposées pour ce jalon ?
  // (les doublons d'un même type ne comptent qu'une fois -> DISTINCT).
  function photosFaites(email, jalonChemin) {
    const jal = JALON_VERS_PARCOURS[jalonChemin];
    if (!jal) return 0;
    try {
      const marks = PHOTOS_REQUISES.map(() => '?').join(',');
      const r = getDb().prepare('SELECT COUNT(DISTINCT type) n FROM nutrition_parcours_photos WHERE client_email=? AND jalon=? AND type IN (' + marks + ')')
        .get(email, jal, ...PHOTOS_REQUISES);
      return (r && r.n) || 0;
    } catch (_) { return 0; } // table absente -> on ne valide pas (on ne devine pas)
  }
  function pathStatsRow(email) {
    let s = getDb().prepare('SELECT * FROM user_game_stats WHERE client_email=?').get(email);
    if (!s) {
      getDb().prepare("INSERT OR IGNORE INTO user_game_stats (client_email, updated_at) VALUES (?, datetime('now'))").run(email);
      s = getDb().prepare('SELECT * FROM user_game_stats WHERE client_email=?').get(email);
    }
    return s;
  }
  // Rattrapage de la série : un seul jour plein NON GAGNÉ depuis le dernier jour
  // gagné suffit à remettre la série à 0 (elle repartira à 1 au prochain jour
  // gagné). Idempotent (avance last_win à hier).
  function reconcileStreak(email) {
    try {
      if (!pathFeatureEnabled()) return pathStatsRow(email);
      const s = pathStatsRow(email);
      const last = s.last_win_date || '';
      if (!last) return s;
      const today = pathParisYmd();
      const missed = pathDaysBetween(last, today) - 1;
      if (missed <= 0) return s;
      getDb().prepare("UPDATE user_game_stats SET streak_current=0, last_win_date=?, updated_at=datetime('now') WHERE client_email=?")
        .run(pathYmdMinusDays(today, 1), email);
      return getDb().prepare('SELECT * FROM user_game_stats WHERE client_email=?').get(email);
    } catch (e) { console.error('reconcileStreak:', e && e.message); return pathStatsRow(email); }
  }
  // Un jour est GAGNÉ dès 2 repas renseignés (quel que soit le statut). Appelé en
  // direct quand le client renseigne son 2e repas du jour. Idempotent : la PK de
  // user_day_wins garantit qu'un jour n'alimente la série qu'une seule fois.
  // Renvoie { gagne, nouveau, stats } — `nouveau` = la série vient de monter.
  function recordDayWin(email, repas) {
    const vide = { gagne: false, nouveau: false, stats: null };
    try {
      if (!email || !pathFeatureEnabled()) return vide;
      const today = pathParisYmd();
      reconcileStreak(email); // solde d'abord les jours manqués
      const deja = getDb().prepare('SELECT 1 FROM user_day_wins WHERE client_email=? AND day_ymd=?').get(email, today);
      if (deja) return { gagne: true, nouveau: false, stats: pathStatsRow(email) };
      getDb().prepare('INSERT OR IGNORE INTO user_day_wins (client_email, day_ymd, repas, won_at) VALUES (?,?,?,?)')
        .run(email, today, Number(repas) || 0, new Date().toISOString());
      const s = pathStatsRow(email);
      const streak = streakAfterOpen(s.streak_current || 0, s.last_win_date || '', today);
      const best = Math.max(streak, s.streak_best || 0);
      getDb().prepare("UPDATE user_game_stats SET streak_current=?, streak_best=?, last_win_date=?, updated_at=datetime('now') WHERE client_email=?")
        .run(streak, best, today, email);
      return { gagne: true, nouveau: true, stats: pathStatsRow(email) };
    } catch (e) { console.error('recordDayWin:', e && e.message); return vide; }
  }
  // Le jour courant est-il déjà gagné ? (utilisé par la notif du soir)
  function dayWon(email, ymd) {
    try { return !!getDb().prepare('SELECT 1 FROM user_day_wins WHERE client_email=? AND day_ymd=?').get(email, ymd || pathParisYmd()); } catch (_) { return false; }
  }
  // Ouverture d'ebook : log quotidien uniquement. Depuis que la série est
  // alimentée par les REPAS, l'ebook ne la fait plus monter (il valide toujours
  // les étapes « ebook » du parcours via awardClientEvent).
  function recordEbookOpen(email, ebookId) {
    try {
      if (!email) return;
      getDb().prepare("INSERT OR IGNORE INTO user_ebook_opens (client_email, ebook_id, day_ymd, opened_at) VALUES (?,?,?,?)")
        .run(email, Number(ebookId) || 0, pathParisYmd(), new Date().toISOString());
    } catch (e) { console.error('recordEbookOpen:', e && e.message); }
  }
  // CŒUR DU MOTEUR : un événement réel valide (si pertinent) le nœud actif.
  // Idempotent (PK client_email+node_day). Ne fait rien si flag OFF, parcours non
  // démarré, terminé, ou si l'événement ne correspond pas au type du nœud actif.
  function awardClientEvent(email, eventType, refId) {
    try {
      if (!email || !pathFeatureEnabled()) return null;
      if (pathCurrentDay(email) <= 0) return null; // parcours non démarré
      const activeDay = pathActiveDay(email);
      if (activeDay === null) return null; // terminé (=== null : l'étape 0 est falsy !)
      const node = CHALLENGE_PATH_NODES.find((n) => n.day === activeDay);
      if (!node) return null;
      if (node.flow && node.flow.length) {
        // ÉTAPE COMPOSITE : on coche la sous-étape correspondante. L'étape n'est
        // validée que lorsque TOUT son flow est fait (ordre libre).
        const step = node.flow.find((s) => FLOW_STEP_EVENT[s] === eventType);
        if (!step) return null; // événement hors du flow -> ignoré
        // « photos » exige les 3 prises (face/profil/dos) : une seule photo ne
        // coche rien. Le client peut donc les déposer en plusieurs fois.
        if (step === 'photos' && photosFaites(email, node.jalon) < PHOTOS_REQUISES.length) return null;
        getDb().prepare('INSERT OR IGNORE INTO user_node_flow (client_email, node_day, step, done_at) VALUES (?,?,?,?)')
          .run(email, activeDay, step, new Date().toISOString());
        const faits = flowDone(email, activeDay);
        if (!node.flow.every((s) => faits.has(s))) return null; // il en manque encore
      } else if (node.event !== eventType) {
        return null; // pas le bon événement -> le retard décale la suite
      }
      const ins = getDb().prepare("INSERT OR IGNORE INTO user_node_progress (client_email, node_day, completed_at, punch_awarded, ref_id) VALUES (?,?,?,?,?)")
        .run(email, activeDay, new Date().toISOString(), node.punch, String(refId == null ? '' : refId));
      if (ins.changes === 0) return null; // déjà validé -> aucune double récompense (idempotence)
      pathStatsRow(email);
      getDb().prepare("UPDATE user_game_stats SET punch = punch + ?, updated_at=datetime('now') WHERE client_email=?").run(node.punch, email);
      return { day: activeDay, title: node.title, punch: node.punch, milestone: !!node.milestone, nextDay: pathActiveDay(email) };
    } catch (e) { console.error('awardClientEvent:', e && e.message); return null; }
  }
  // État public du Chemin pour le client courant (consommé par l'onglet front).
  function challengePublicState(email) {
    const enabled = pathFeatureEnabled();
    const day = pathCurrentDay(email);
    const started = day > 0;
    // Date d'ancrage : permet au front d'annoncer « ton chemin démarre le X »
    // quand la cohorte a une date de début encore à venir.
    const startsOn = pathStartYmd(email);
    // LECTURE PURE : on ne réconcilie PAS ici — ouvrir son app ne doit rien
    // écrire. On projette seulement l'affichage de la série.
    const s = pathStatsRow(email);
    const streakVu = streakAffiche(s.streak_current || 0, s.last_win_date || '', pathParisYmd());
    const done = pathDoneDays(email);
    const activeDay = pathActiveDay(email);
    const nodes = CHALLENGE_PATH_NODES.map((n) => ({
      day: n.day, week: n.week, weekTitle: CHALLENGE_WEEK_TITLES[n.week] || '',
      // `event` est exposé : le front route vers l'écran qui produit ce vrai
      // événement de validation (et non d'après le type d'affichage).
      type: n.type, event: n.event, title: n.title, action: n.action || '', punch: n.punch, milestone: !!n.milestone,
      // Étapes composites (Commencer / Points mi-parcours et final) : `flow` liste les
      // sous-étapes et `flowDone` celles déjà faites -> le front affiche les ✓.
      jalon: n.jalon || '', flow: n.flow || null,
      flowDone: n.flow ? [...flowDone(email, n.day)] : null,
      // Compteur des photos exigées -> le front affiche « 2/3 photos ajoutées »
      // et le client comprend pourquoi sa sous-étape n'est pas encore cochée.
      photos: (n.flow || []).includes('photos') ? { fait: photosFaites(email, n.jalon), requis: PHOTOS_REQUISES.length } : null,
      status: done.has(n.day) ? 'done' : (n.day === activeDay ? 'active' : 'locked'),
    }));
    return {
      enabled, started, day, activeDay, startsOn, totalDays: CHALLENGE_PATH_NODES.length,
      stats: { punch: s.punch || 0, streak: streakVu, streakBest: s.streak_best || 0 },
      weekTitles: CHALLENGE_WEEK_TITLES,
      nodes,
    };
  }

  return {
    ensureChallengePathSchema, awardClientEvent, recordEbookOpen, recordDayWin, dayWon, challengePublicState,
    pathFeatureEnabled, pathCurrentDay, pathActiveDay, pathStartYmd, cohortStartYmd, reconcileStreak,
    pathStatsRow, pathDoneDays, flowDone,
  };
}

module.exports = createChallengeEngine;
module.exports.createChallengeEngine = createChallengeEngine;
module.exports.CHALLENGE_PATH_NODES = CHALLENGE_PATH_NODES;
module.exports.CHALLENGE_WEEK_TITLES = CHALLENGE_WEEK_TITLES;
module.exports.CHALLENGE_PATH_SEED_VERSION = CHALLENGE_PATH_SEED_VERSION;
module.exports.CHALLENGE_SCHEMA_SQL = CHALLENGE_SCHEMA_SQL;
module.exports.pathParisYmd = pathParisYmd;
module.exports.pathDaysBetween = pathDaysBetween;
module.exports.pathYmdMinusDays = pathYmdMinusDays;
module.exports.streakAfterOpen = streakAfterOpen;
module.exports.streakAffiche = streakAffiche;
module.exports.activeDayFromDone = activeDayFromDone;
module.exports.FLOW_STEP_EVENT = FLOW_STEP_EVENT;
