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
//   - Streak (🔥) = jours consécutifs d'ouverture de l'ebook du jour. Un jour
//     manqué consomme 1 joker s'il en reste, sinon le streak retombe à 0.
//   - Jokers (🃏) : +1 par semaine entièrement validée, max 3.
//   - XP (⭐) et gems (💎) selon le barème de chaque nœud.
//
//  Factory injectable : createChallengeEngine({ getDb }) -> API. `getDb()` doit
//  renvoyer une instance better-sqlite3. Les helpers purs (dates, réducteurs) et
//  les données de seed sont aussi exportés directement pour les tests unitaires.
// ============================================================================

const CHALLENGE_PATH_SEED_VERSION = 2;
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
  { day: 0, week: 1, type: 'commencer', event: 'photo', title: "Commencer", action: "Photos + mensurations + présente-toi au groupe", xp: 30, gems: 50, milestone: 1, jalon: 'debut', flow: ['photos', 'mensurations', 'groupe'] },
  { day: 1, week: 1, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", xp: 25, gems: 0, milestone: 0 },
  { day: 2, week: 1, type: 'ebook', event: 'ebook', title: "Découvre ton ebook", action: "Ouvrir le ebook", xp: 15, gems: 0, milestone: 0 },
  { day: 3, week: 1, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", xp: 25, gems: 0, milestone: 0 },
  { day: 4, week: 1, type: 'ebook', event: 'ebook', title: "Découvre ton ebook", action: "Ouvrir le ebook", xp: 15, gems: 0, milestone: 0 },
  { day: 5, week: 1, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", xp: 25, gems: 0, milestone: 0 },
  { day: 6, week: 1, type: 'special', event: 'coach', title: "Message coach", action: "Écris un message à ton coach", xp: 20, gems: 0, milestone: 0 },
  { day: 7, week: 1, type: 'bilan', event: 'bilan', title: "Bilan de la semaine", action: "Ouvre ton bilan", xp: 20, gems: 0, milestone: 0 },
  // S2 — Prendre le rythme (index 8–14)
  { day: 8, week: 2, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", xp: 25, gems: 0, milestone: 0 },
  { day: 9, week: 2, type: 'ebook', event: 'ebook', title: "Découvre ton ebook", action: "Ouvrir le ebook", xp: 15, gems: 0, milestone: 0 },
  { day: 10, week: 2, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", xp: 25, gems: 0, milestone: 0 },
  { day: 11, week: 2, type: 'ebook', event: 'ebook', title: "Découvre ton ebook", action: "Ouvrir le ebook", xp: 15, gems: 0, milestone: 0 },
  { day: 12, week: 2, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", xp: 25, gems: 0, milestone: 0 },
  { day: 13, week: 2, type: 'special', event: 'plate', title: "Photo d'assiette", action: "Envoie une photo de ton assiette du jour", xp: 20, gems: 0, milestone: 0 },
  { day: 14, week: 2, type: 'bilan', event: 'bilan', title: "Bilan de la semaine", action: "Ouvre ton bilan", xp: 20, gems: 0, milestone: 0 },
  // S3 — Mi-parcours (index 15–21)
  { day: 15, week: 3, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", xp: 25, gems: 0, milestone: 0 },
  { day: 16, week: 3, type: 'ebook', event: 'ebook', title: "Découvre ton ebook", action: "Ouvrir le ebook", xp: 15, gems: 0, milestone: 0 },
  { day: 17, week: 3, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", xp: 25, gems: 0, milestone: 0 },
  { day: 18, week: 3, type: 'ebook', event: 'ebook', title: "Découvre ton ebook", action: "Ouvrir le ebook", xp: 15, gems: 0, milestone: 0 },
  { day: 19, week: 3, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", xp: 25, gems: 0, milestone: 0 },
  { day: 20, week: 3, type: 'special', event: 'coach', title: "Message coach", action: "Écris un message à ton coach", xp: 20, gems: 0, milestone: 0 },
  { day: 21, week: 3, type: 'check', event: 'photo', title: "Point mi-parcours", action: "Photos + mensurations mi-parcours", xp: 40, gems: 50, milestone: 1, jalon: 'mi', flow: ['photos', 'mensurations'] },
  // S4 — Relance (index 22–28)
  { day: 22, week: 4, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", xp: 25, gems: 0, milestone: 0 },
  { day: 23, week: 4, type: 'ebook', event: 'ebook', title: "Découvre ton ebook", action: "Ouvrir le ebook", xp: 15, gems: 0, milestone: 0 },
  { day: 24, week: 4, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", xp: 25, gems: 0, milestone: 0 },
  { day: 25, week: 4, type: 'ebook', event: 'ebook', title: "Découvre ton ebook", action: "Ouvrir le ebook", xp: 15, gems: 0, milestone: 0 },
  { day: 26, week: 4, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", xp: 25, gems: 0, milestone: 0 },
  { day: 27, week: 4, type: 'special', event: 'groupe', title: "Communauté", action: "Encourage un membre du groupe", xp: 20, gems: 0, milestone: 0 },
  { day: 28, week: 4, type: 'bilan', event: 'bilan', title: "Bilan de la semaine", action: "Ouvre ton bilan", xp: 20, gems: 0, milestone: 0 },
  // S5 — Tenir le cap (index 29–35)
  { day: 29, week: 5, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", xp: 25, gems: 0, milestone: 0 },
  { day: 30, week: 5, type: 'ebook', event: 'ebook', title: "Découvre ton ebook", action: "Ouvrir le ebook", xp: 15, gems: 0, milestone: 0 },
  { day: 31, week: 5, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", xp: 25, gems: 0, milestone: 0 },
  { day: 32, week: 5, type: 'ebook', event: 'ebook', title: "Découvre ton ebook", action: "Ouvrir le ebook", xp: 15, gems: 0, milestone: 0 },
  { day: 33, week: 5, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", xp: 25, gems: 0, milestone: 0 },
  { day: 34, week: 5, type: 'special', event: 'groupe', title: "Communauté", action: "Partage-nous ta meilleure recette sur le groupe", xp: 20, gems: 0, milestone: 0 },
  { day: 35, week: 5, type: 'bilan', event: 'bilan', title: "Bilan de la semaine", action: "Ouvre ton bilan", xp: 20, gems: 0, milestone: 0 },
  // S6 — Dernière ligne droite (index 36–42)
  { day: 36, week: 6, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", xp: 25, gems: 0, milestone: 0 },
  { day: 37, week: 6, type: 'ebook', event: 'ebook', title: "Découvre ton ebook", action: "Ouvrir le ebook", xp: 15, gems: 0, milestone: 0 },
  { day: 38, week: 6, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", xp: 25, gems: 0, milestone: 0 },
  { day: 39, week: 6, type: 'ebook', event: 'ebook', title: "Découvre ton ebook", action: "Ouvrir le ebook", xp: 15, gems: 0, milestone: 0 },
  { day: 40, week: 6, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", xp: 25, gems: 0, milestone: 0 },
  { day: 41, week: 6, type: 'check', event: 'photo', title: "Point final", action: "Photos + mensurations finales", xp: 50, gems: 50, milestone: 1, jalon: 'fin', flow: ['photos', 'mensurations'] },
  { day: 42, week: 6, type: 'final', event: 'bilan', title: "Bilan final", action: "Bilan final, recap complet, badge finisher", xp: 50, gems: 50, milestone: 1 },
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
// Applique `missed` jours manqués à {streak, jokers} : 1 joker sauve 1 jour, sinon reset.
function applyMissedDays(streak, jokers, missed) {
  let s = streak, j = jokers;
  for (let i = 0; i < missed; i++) {
    if (s <= 0) { s = 0; break; }
    if (j > 0) j -= 1; else { s = 0; break; }
  }
  return { streak: s, jokers: j };
}
// Streak après ouverture de l'ebook du jour (réconciliation des jours manqués déjà faite en amont).
function streakAfterOpen(streak, last, today) {
  if (last === today) return streak;           // déjà compté aujourd'hui
  if (!last) return 1;                          // toute première ouverture
  if (pathDaysBetween(last, today) === 1) return streak + 1; // jour consécutif
  return streak <= 0 ? 1 : streak + 1;          // reprise après reset / trou déjà soldé
}
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
    xp INTEGER NOT NULL DEFAULT 0,
    gems INTEGER NOT NULL DEFAULT 0,
    is_milestone INTEGER NOT NULL DEFAULT 0,
    meta TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS user_node_progress (
    client_email TEXT NOT NULL,
    node_day INTEGER NOT NULL,
    completed_at TEXT NOT NULL DEFAULT '',
    xp_awarded INTEGER NOT NULL DEFAULT 0,
    gems_awarded INTEGER NOT NULL DEFAULT 0,
    ref_id TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (client_email, node_day)
  );
  CREATE TABLE IF NOT EXISTS user_game_stats (
    client_email TEXT PRIMARY KEY,
    xp_total INTEGER NOT NULL DEFAULT 0,
    gems INTEGER NOT NULL DEFAULT 0,
    streak_current INTEGER NOT NULL DEFAULT 0,
    streak_best INTEGER NOT NULL DEFAULT 0,
    jokers INTEGER NOT NULL DEFAULT 0,
    last_ebook_open_date TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS user_ebook_opens (
    client_email TEXT NOT NULL,
    ebook_id INTEGER NOT NULL,
    day_ymd TEXT NOT NULL,
    opened_at TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (client_email, ebook_id, day_ymd)
  );
  CREATE TABLE IF NOT EXISTS user_bilan_seen (
    client_email TEXT NOT NULL,
    week INTEGER NOT NULL,
    seen_at TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (client_email, week)
  );
  CREATE TABLE IF NOT EXISTS user_weeks_rewarded (
    client_email TEXT NOT NULL,
    week INTEGER NOT NULL,
    rewarded_at TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (client_email, week)
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

  function ensureChallengePathSchema() {
    try {
      getDb().exec(CHALLENGE_SCHEMA_SQL);
      const seededV = (getDb().prepare("SELECT value FROM app_settings WHERE key='challenge_path_seed_v'").get() || {}).value;
      const count = getDb().prepare('SELECT COUNT(*) c FROM path_nodes').get().c;
      if (count !== CHALLENGE_PATH_NODES.length || String(seededV) !== String(CHALLENGE_PATH_SEED_VERSION)) {
        const up = getDb().prepare(`INSERT INTO path_nodes (day, week, type, validation_event, title, xp, gems, is_milestone, meta)
          VALUES (?,?,?,?,?,?,?,?,?)
          ON CONFLICT(day) DO UPDATE SET week=excluded.week, type=excluded.type, validation_event=excluded.validation_event,
            title=excluded.title, xp=excluded.xp, gems=excluded.gems, is_milestone=excluded.is_milestone, meta=excluded.meta`);
        const tx = getDb().transaction(() => {
          CHALLENGE_PATH_NODES.forEach((n) => up.run(n.day, n.week, n.type, n.event, n.title, n.xp, n.gems, n.milestone, n.jalon || ''));
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
  function pathStatsRow(email) {
    let s = getDb().prepare('SELECT * FROM user_game_stats WHERE client_email=?').get(email);
    if (!s) {
      getDb().prepare("INSERT OR IGNORE INTO user_game_stats (client_email, updated_at) VALUES (?, datetime('now'))").run(email);
      s = getDb().prepare('SELECT * FROM user_game_stats WHERE client_email=?').get(email);
    }
    return s;
  }
  // +1 joker (max 3) quand les 7 nœuds d'une semaine sont validés (une seule fois par semaine).
  function grantWeekJokerIfComplete(email, week) {
    try {
      const weekDays = CHALLENGE_PATH_NODES.filter((n) => n.week === week).map((n) => n.day);
      const done = pathDoneDays(email);
      if (!weekDays.every((d) => done.has(d))) return;
      const info = getDb().prepare("INSERT OR IGNORE INTO user_weeks_rewarded (client_email, week, rewarded_at) VALUES (?,?,datetime('now'))").run(email, week);
      if (info.changes === 0) return; // semaine déjà récompensée
      pathStatsRow(email);
      getDb().prepare("UPDATE user_game_stats SET jokers = MIN(3, jokers + 1), updated_at=datetime('now') WHERE client_email=?").run(email);
    } catch (e) { console.error('grantWeekJoker:', e && e.message); }
  }
  // Rattrapage du streak : chaque jour plein manqué depuis la dernière ouverture consomme
  // 1 joker s'il en reste, sinon remet le streak à 0. Idempotent (avance last_open à hier).
  function reconcileStreak(email) {
    try {
      if (!pathFeatureEnabled()) return pathStatsRow(email);
      const s = pathStatsRow(email);
      const last = s.last_ebook_open_date || '';
      if (!last) return s;
      const today = pathParisYmd();
      const missed = pathDaysBetween(last, today) - 1;
      if (missed <= 0) return s;
      const next = applyMissedDays(s.streak_current || 0, s.jokers || 0, missed);
      getDb().prepare("UPDATE user_game_stats SET streak_current=?, jokers=?, last_ebook_open_date=?, updated_at=datetime('now') WHERE client_email=?")
        .run(next.streak, next.jokers, pathYmdMinusDays(today, 1), email);
      return getDb().prepare('SELECT * FROM user_game_stats WHERE client_email=?').get(email);
    } catch (e) { console.error('reconcileStreak:', e && e.message); return pathStatsRow(email); }
  }
  // Ouverture d'ebook : log quotidien (streak) + incrément du streak (1×/jour).
  function recordEbookOpen(email, ebookId) {
    try {
      if (!email) return;
      const today = pathParisYmd();
      getDb().prepare("INSERT OR IGNORE INTO user_ebook_opens (client_email, ebook_id, day_ymd, opened_at) VALUES (?,?,?,?)")
        .run(email, Number(ebookId) || 0, today, new Date().toISOString());
      if (!pathFeatureEnabled()) return;
      reconcileStreak(email); // solde d'abord les jours manqués (jokers)
      const s = pathStatsRow(email);
      if ((s.last_ebook_open_date || '') === today) return; // déjà compté aujourd'hui
      const streak = streakAfterOpen(s.streak_current || 0, s.last_ebook_open_date || '', today);
      const best = Math.max(streak, s.streak_best || 0);
      getDb().prepare("UPDATE user_game_stats SET streak_current=?, streak_best=?, last_ebook_open_date=?, updated_at=datetime('now') WHERE client_email=?")
        .run(streak, best, today, email);
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
      if (!node || node.event !== eventType) return null; // pas le bon événement -> le retard décale la suite
      const ins = getDb().prepare("INSERT OR IGNORE INTO user_node_progress (client_email, node_day, completed_at, xp_awarded, gems_awarded, ref_id) VALUES (?,?,?,?,?,?)")
        .run(email, activeDay, new Date().toISOString(), node.xp, node.gems, String(refId == null ? '' : refId));
      if (ins.changes === 0) return null; // déjà validé -> aucune double récompense (idempotence)
      pathStatsRow(email);
      getDb().prepare("UPDATE user_game_stats SET xp_total = xp_total + ?, gems = gems + ?, updated_at=datetime('now') WHERE client_email=?").run(node.xp, node.gems, email);
      grantWeekJokerIfComplete(email, node.week);
      return { day: activeDay, title: node.title, xp: node.xp, gems: node.gems, milestone: !!node.milestone, nextDay: pathActiveDay(email) };
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
    if (enabled && started) reconcileStreak(email);
    const s = pathStatsRow(email);
    const done = pathDoneDays(email);
    const activeDay = pathActiveDay(email);
    const nodes = CHALLENGE_PATH_NODES.map((n) => ({
      day: n.day, week: n.week, weekTitle: CHALLENGE_WEEK_TITLES[n.week] || '',
      type: n.type, title: n.title, action: n.action || '', xp: n.xp, gems: n.gems, milestone: !!n.milestone,
      // Étapes composites (Commencer / Points mi-parcours et final) : la donnée est
      // exposée pour la Phase 2 (enchaînement des sous-étapes). Aucun comportement ici.
      jalon: n.jalon || '', flow: n.flow || null,
      status: done.has(n.day) ? 'done' : (n.day === activeDay ? 'active' : 'locked'),
    }));
    return {
      enabled, started, day, activeDay, startsOn, totalDays: CHALLENGE_PATH_NODES.length,
      stats: { xp: s.xp_total || 0, gems: s.gems || 0, streak: s.streak_current || 0, streakBest: s.streak_best || 0, jokers: s.jokers || 0 },
      weekTitles: CHALLENGE_WEEK_TITLES,
      nodes,
    };
  }

  return {
    ensureChallengePathSchema, awardClientEvent, recordEbookOpen, challengePublicState,
    pathFeatureEnabled, pathCurrentDay, pathActiveDay, pathStartYmd, cohortStartYmd, reconcileStreak,
    grantWeekJokerIfComplete, pathStatsRow, pathDoneDays,
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
module.exports.applyMissedDays = applyMissedDays;
module.exports.streakAfterOpen = streakAfterOpen;
module.exports.activeDayFromDone = activeDayFromDone;
