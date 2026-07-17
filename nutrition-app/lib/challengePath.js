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
// v5 : l'étape 27 accepte AUSSI une réponse à un membre ('groupe_reponse').
// v6 : « ebook » devient « guide » dans les libellés (titre + bouton), rien d'autre.
const punchSeuils = require('./punchSeuils');
const cadeaux = require('./cadeaux');

const CHALLENGE_PATH_SEED_VERSION = 6;
/* À la première personne : le client s'y projette (« Je… »), il ne lit pas un
   programme, il se raconte sa propre progression. */
const CHALLENGE_WEEK_TITLES = {
  1: 'Je démarre', 2: 'Je prends le rythme', 3: 'Je progresse',
  4: 'Je passe un cap', 5: 'Je ne lâche rien', 6: 'J’atteins mon objectif',
};
// Missions bonus : UNE par semaine, toujours FACULTATIVE — elle ne conditionne
// jamais l'avancement du parcours. Le client DÉCLARE ce qu'il a fait (sur
// parole, aucun justificatif), le coach tranche ; le Punch n'est crédité qu'à
// la validation, via addPunch (le point de passage unique).
const MISSIONS_BONUS = {
  1: { titre: 'Donne ton avis', texte: 'Laisse un avis Google sur ton expérience My Coach.', punch: 50 },
  2: { titre: 'Partage ta séance', texte: 'Publie une story Instagram pendant ou après ta séance.', punch: 50 },
  3: { titre: 'Invite un proche', texte: 'Viens avec un proche découvrir le studio.', punch: 50 },
  4: { titre: 'Raconte ton expérience', texte: 'Fais un témoignage vidéo de 30 secondes.', punch: 50 },
  5: { titre: 'Passe au micro', texte: 'Participe à un podcast avec ton coach.', punch: 50 },
  6: { titre: 'Ouvre une opportunité', texte: 'Mets le studio en relation avec une entreprise.', punch: 50 },
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
  { day: 2, week: 1, type: 'ebook', event: 'ebook', title: "Découvre ton guide", action: "Ouvrir mon guide", punch: 15, milestone: 0 },
  { day: 3, week: 1, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", punch: 25, milestone: 0 },
  { day: 4, week: 1, type: 'ebook', event: 'ebook', title: "Découvre ton guide", action: "Ouvrir mon guide", punch: 15, milestone: 0 },
  { day: 5, week: 1, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", punch: 25, milestone: 0 },
  { day: 6, week: 1, type: 'special', event: 'coach', title: "Message coach", action: "Écris un message à ton coach", punch: 20, milestone: 0 },
  { day: 7, week: 1, type: 'bilan', event: 'bilan', title: "Bilan de la semaine", action: "Ouvre ton bilan", punch: 20, milestone: 0 },
  // S2 — Prendre le rythme (index 8–14)
  { day: 8, week: 2, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", punch: 25, milestone: 0 },
  { day: 9, week: 2, type: 'ebook', event: 'ebook', title: "Découvre ton guide", action: "Ouvrir mon guide", punch: 15, milestone: 0 },
  { day: 10, week: 2, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", punch: 25, milestone: 0 },
  { day: 11, week: 2, type: 'ebook', event: 'ebook', title: "Découvre ton guide", action: "Ouvrir mon guide", punch: 15, milestone: 0 },
  { day: 12, week: 2, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", punch: 25, milestone: 0 },
  { day: 13, week: 2, type: 'special', event: 'groupe_photo', title: "Photo d'assiette", action: "Poste une photo de ton assiette au groupe", punch: 20, milestone: 0 },
  { day: 14, week: 2, type: 'bilan', event: 'bilan', title: "Bilan de la semaine", action: "Ouvre ton bilan", punch: 20, milestone: 0 },
  // S3 — Mi-parcours (index 15–21)
  { day: 15, week: 3, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", punch: 25, milestone: 0 },
  { day: 16, week: 3, type: 'ebook', event: 'ebook', title: "Découvre ton guide", action: "Ouvrir mon guide", punch: 15, milestone: 0 },
  { day: 17, week: 3, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", punch: 25, milestone: 0 },
  { day: 18, week: 3, type: 'ebook', event: 'ebook', title: "Découvre ton guide", action: "Ouvrir mon guide", punch: 15, milestone: 0 },
  { day: 19, week: 3, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", punch: 25, milestone: 0 },
  { day: 20, week: 3, type: 'special', event: 'coach', title: "Message coach", action: "Écris un message à ton coach", punch: 20, milestone: 0 },
  { day: 21, week: 3, type: 'check', event: 'photo', title: "Point mi-parcours", action: "Photos + mensurations mi-parcours", punch: 90, milestone: 1, jalon: 'mi', flow: ['photos', 'mensurations'] },
  // S4 — Relance (index 22–28)
  { day: 22, week: 4, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", punch: 25, milestone: 0 },
  { day: 23, week: 4, type: 'ebook', event: 'ebook', title: "Découvre ton guide", action: "Ouvrir mon guide", punch: 15, milestone: 0 },
  { day: 24, week: 4, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", punch: 25, milestone: 0 },
  { day: 25, week: 4, type: 'ebook', event: 'ebook', title: "Découvre ton guide", action: "Ouvrir mon guide", punch: 15, milestone: 0 },
  { day: 26, week: 4, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", punch: 25, milestone: 0 },
  // Encourager = poster OU répondre à quelqu'un : les deux sont un encouragement.
  // `events` (au pluriel) = la liste des événements acceptés ; les autres étapes
  // « groupe » gardent un seul événement (une réponse n'est ni une présentation
  // ni un partage de recette).
  { day: 27, week: 4, type: 'special', event: 'groupe', events: ['groupe', 'groupe_reponse'], title: "Communauté", action: "Encourage un membre du groupe : un post ou une réponse", punch: 20, milestone: 0 },
  { day: 28, week: 4, type: 'bilan', event: 'bilan', title: "Bilan de la semaine", action: "Ouvre ton bilan", punch: 20, milestone: 0 },
  // S5 — Tenir le cap (index 29–35)
  { day: 29, week: 5, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", punch: 25, milestone: 0 },
  { day: 30, week: 5, type: 'ebook', event: 'ebook', title: "Découvre ton guide", action: "Ouvrir mon guide", punch: 15, milestone: 0 },
  { day: 31, week: 5, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", punch: 25, milestone: 0 },
  { day: 32, week: 5, type: 'ebook', event: 'ebook', title: "Découvre ton guide", action: "Ouvrir mon guide", punch: 15, milestone: 0 },
  { day: 33, week: 5, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", punch: 25, milestone: 0 },
  { day: 34, week: 5, type: 'special', event: 'groupe', title: "Communauté", action: "Partage-nous ta meilleure recette sur le groupe", punch: 20, milestone: 0 },
  { day: 35, week: 5, type: 'bilan', event: 'bilan', title: "Bilan de la semaine", action: "Ouvre ton bilan", punch: 20, milestone: 0 },
  // S6 — Dernière ligne droite (index 36–42)
  { day: 36, week: 6, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", punch: 25, milestone: 0 },
  { day: 37, week: 6, type: 'ebook', event: 'ebook', title: "Découvre ton guide", action: "Ouvrir mon guide", punch: 15, milestone: 0 },
  { day: 38, week: 6, type: 'seance', event: 'seance', title: "Séance", action: "Valider la séance", punch: 25, milestone: 0 },
  { day: 39, week: 6, type: 'ebook', event: 'ebook', title: "Découvre ton guide", action: "Ouvrir mon guide", punch: 15, milestone: 0 },
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

// --- PALIERS DE SÉRIE 🔥 -> Punch 👊 ----------------------------------------
// Barème croissant : plus la série tient, plus le palier vaut. Récompense la
// SÉRIE EN COURS (pas le record) -> une série cassée repart de 3 jours.
// Au-delà de 42, on répète +400 tous les 7 jours (42, 49, 56…).
const PALIERS_SERIE = { 3: 15, 7: 40, 14: 90, 21: 150, 28: 220, 35: 300, 42: 400 };
const PALIER_AU_DELA = 400;
// Punch rapportés par une série qui atteint EXACTEMENT `streak` jours. 0 sinon.
function punchPalier(streak) {
  const n = Number(streak) || 0;
  if (n <= 0) return 0;
  if (PALIERS_SERIE[n]) return PALIERS_SERIE[n];
  if (n > 42 && n % 7 === 0) return PALIER_AU_DELA;
  return 0;
}

// Une étape accepte-t-elle cet événement ? `events` (liste) prime sur `event`
// (valeur unique) : certaines étapes ont plusieurs façons légitimes d'être faites.
function nodeAccepteEvent(node, eventType) {
  if (!node) return false;
  if (Array.isArray(node.events) && node.events.length) return node.events.includes(eventType);
  return node.event === eventType;
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
    streak_paliers TEXT NOT NULL DEFAULT '',       -- paliers déjà récompensés DANS la série en cours (JSON)
    last_win_date TEXT NOT NULL DEFAULT '',        -- dernier jour GAGNÉ (2 repas renseignés)
    theme_choisi TEXT NOT NULL DEFAULT '',         -- INUTILISÉE (ex-skin, cf. lib/cadeaux) : laissée en place, jamais lue
    theme_auto TEXT NOT NULL DEFAULT '',           -- INUTILISÉE (idem) : la supprimer demanderait une migration pour rien
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
  -- Déblocages acquis (vidéos, ebooks, cadeaux) : atteints, jamais repris.
  -- La PK (email, seuil, type) porte l'idempotence : un seuil qui déclenche deux
  -- récompenses (800 = ebooks + cadeau) en garde bien deux, mais chacune une fois.
  CREATE TABLE IF NOT EXISTS user_unlocks (
    client_email TEXT NOT NULL,
    seuil INTEGER NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '',
    unlocked_at TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (client_email, seuil, type)
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
  -- Bons des cadeaux PHYSIQUES (semaine ami, coaching, remise, massage) : le
  -- justificatif que le client présente au studio. Les cadeaux digitaux (thèmes)
  -- n'en ont pas — il n'y a rien à remettre en main propre.
  --   PK (email, cadeau) : un cadeau atteint = UN bon, même si la génération est
  --     rejouée (elle l'est : on la relance à chaque lecture de la boutique, pour
  --     que les comptes déjà chargés en Punch aient leur bon sans attendre un gain).
  --   code UNIQUE : c'est LA preuve présentée au comptoir, jamais deux identiques.
  --   statut : 'a_retirer' -> 'retire', dans ce sens uniquement (cf. retirerBon).
  -- Missions bonus (FACULTATIVES) : le client déclare ce qu'il a fait, le coach
  -- tranche. UNIQUE (email, week) : une seule réponse par mission — le client ne
  -- peut pas renvoyer une seconde déclaration pour la même semaine.
  CREATE TABLE IF NOT EXISTS nutrition_missions_bonus (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_email TEXT NOT NULL,
    week INTEGER NOT NULL,
    texte TEXT NOT NULL DEFAULT '',
    statut TEXT NOT NULL DEFAULT 'declaree',   -- 'declaree' -> 'validee' | 'refusee'
    punch INTEGER NOT NULL DEFAULT 0,          -- crédité seulement à la validation
    created_at TEXT NOT NULL DEFAULT '',
    decided_at TEXT NOT NULL DEFAULT '',
    decided_by TEXT NOT NULL DEFAULT '',
    UNIQUE (client_email, week)
  );
  CREATE TABLE IF NOT EXISTS nutrition_gift_bons (
    client_email TEXT NOT NULL,
    cadeau TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    statut TEXT NOT NULL DEFAULT 'a_retirer',
    created_at TEXT NOT NULL DEFAULT '',
    retire_at TEXT NOT NULL DEFAULT '',
    retire_par TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (client_email, cadeau)
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
      ajouterColonne('user_game_stats', 'streak_paliers', "TEXT NOT NULL DEFAULT ''");
      // Thème appliqué ('' = celui d'origine). Le thème ACQUIS se déduit du Punch
      // (cadeaux.themeTier) ; cette colonne ne garde que le CHOIX du client, la
      // seule chose qui ne se déduit de rien.
      ajouterColonne('user_game_stats', 'theme_choisi', "TEXT NOT NULL DEFAULT ''");
      ajouterColonne('user_game_stats', 'theme_auto', "TEXT NOT NULL DEFAULT ''");
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
  // Paliers déjà récompensés dans la série EN COURS. Une colonne illisible ne doit
  // jamais bloquer un gain : on repart d'une liste vide plutôt que de planter.
  function lirePaliers(brut) {
    try { const v = JSON.parse(brut || '[]'); return Array.isArray(v) ? v.map(Number).filter((n) => n > 0) : []; }
    catch (_) { return []; }
  }
  // --- PUNCH : point de passage UNIQUE -------------------------------------
  // Toute source de Punch (étape du parcours, palier de série) passe par ici :
  // c'est le seul endroit où le compteur monte, donc le seul endroit où évaluer
  // les déblocages. Le compteur est CUMULÉ et n'est jamais débité.
  // Renvoie les déblocages NOUVELLEMENT obtenus (souvent aucun).
  function addPunch(email, n, source) {
    const gain = Math.round(Number(n) || 0);
    if (!email || gain <= 0) return [];
    try {
      pathStatsRow(email); // garantit la ligne
      getDb().prepare("UPDATE user_game_stats SET punch = punch + ?, updated_at=datetime('now') WHERE client_email=?").run(gain, email);
      return evaluateUnlocks(email, source);
    } catch (e) { console.error('addPunch:', e && e.message); return []; }
  }

  // Déblocages déjà acquis (clés « seuil:type »).
  function unlockedThresholds(email) {
    const set = new Set();
    try { getDb().prepare('SELECT seuil, type FROM user_unlocks WHERE client_email=?').all(email).forEach((r) => set.add(r.seuil + ':' + r.type)); } catch (_) { /* table absente */ }
    return set;
  }

  // Compare le total aux seuils et enregistre ce qui vient de tomber. Idempotent
  // (INSERT OR IGNORE + PK). Chaque déblocage passe par onUnlock : un hook VIDE
  // pour l'instant, que les prochains lots (vidéos, ebooks, cadeaux) rempliront.
  function evaluateUnlocks(email, source) {
    const nouveaux = [];
    try {
      const total = (pathStatsRow(email) || {}).punch || 0;
      const deja = unlockedThresholds(email);
      const ins = getDb().prepare('INSERT OR IGNORE INTO user_unlocks (client_email, seuil, type, payload, unlocked_at) VALUES (?,?,?,?,?)');
      punchSeuils.seuilsAtteints(total, deja).forEach((s) => {
        const info = ins.run(email, s.seuil, s.type, JSON.stringify(s.payload || {}), new Date().toISOString());
        if (info.changes === 0) return; // déjà acquis (course entre deux appels)
        nouveaux.push(s);
        try { onUnlock(s.type, { email, seuil: s.seuil, source: source || '', ...(s.payload || {}) }); }
        catch (e) { console.error('onUnlock:', e && e.message); } // un hook qui tombe ne doit rien casser
      });
      // Signale le LOT de déblocages d'un coup (et non un par un) : c'est ce qui
      // permet à l'abonné (la notif push) d'en faire UNE seule, groupée si besoin.
      if (nouveaux.length && unlockNotifier) {
        try { unlockNotifier(email, nouveaux); }
        catch (e) { console.error('unlockNotifier:', e && e.message); } // idem : jamais bloquant
      }
    } catch (e) { console.error('evaluateUnlocks:', e && e.message); }
    return nouveaux;
  }

  // Abonné externe aux déblocages (posé par server.js : la notification push).
  // Un simple setter plutôt qu'un require : push.js dépend déjà de ce module,
  // l'inverse créerait un cycle.
  let unlockNotifier = null;
  function setUnlockNotifier(fn) { unlockNotifier = typeof fn === 'function' ? fn : null; }

  // Hook de déblocage. Les vidéos et les ebooks n'ont RIEN à faire ici : ils se
  // lisent depuis le total de Punch (server.js), donc ils sont déjà ouverts. Seuls
  // les cadeaux ont un effet de bord à poser : un bon à créer, un thème à activer.
  function onUnlock(type, payload) {
    if (type !== 'gift' || !payload || !payload.email) return;
    assurerCadeaux(payload.email);
  }

  // Pose ce que le total de Punch a déjà mérité : les bons des cadeaux physiques,
  // l'activation des thèmes. Idempotent, et volontairement rejouable à la lecture :
  // le déclencheur ne peut pas être le seul onUnlock, qui ne tombe qu'à l'instant
  // d'un gain — un compte migré depuis XP+gems n'aurait jamais eu son bon.
  // La vérité est le TOTAL, jamais user_unlocks (qui ne dit que ce qui a été célébré).
  function assurerCadeaux(email) {
    const crees = [];
    try {
      if (!email) return crees;
      const punch = (pathStatsRow(email) || {}).punch || 0;
      cadeaux.catalogue().forEach((c) => {
        if (punch < c.seuil || !cadeaux.estPhysique(c.id)) return;
        if (creerBon(email, c.id)) crees.push(c.id);
      });
      // Les badges (noir / doré) n'ont RIEN à poser ici : ils se déduisent du total de
      // Punch au moment de l'affichage (cadeaux.themeTier). Rien à stocker, donc rien
      // qui puisse dériver.
    } catch (e) { console.error('assurerCadeaux:', e && e.message); }
    return crees;
  }

  // Un bon, une fois.
  // ⚠️ PAS d'INSERT OR IGNORE ici : il avalerait AUSSI la collision de code (les deux
  // contraintes sont des UNIQUE aux yeux de SQLite), et le bon serait silencieusement
  // perdu — le client verrait une carte « Débloqué » qui n'ouvre rien. On teste donc
  // la présence (la PK) d'abord, et on laisse la collision de code lever pour la
  // retenter avec un autre tirage.
  function creerBon(email, cadeauId, essais) {
    if (getDb().prepare('SELECT 1 FROM nutrition_gift_bons WHERE client_email=? AND cadeau=?').get(email, cadeauId)) return false;
    try {
      getDb().prepare('INSERT INTO nutrition_gift_bons (client_email, cadeau, code, statut, created_at) VALUES (?,?,?,?,?)')
        .run(email, cadeauId, cadeaux.genererCode(), 'a_retirer', new Date().toISOString());
      return true;
    } catch (e) {
      // Deux causes possibles : la PK (le bon vient d'être posé en parallèle -> rien à
      // faire) ou le code (collision -> on retire au sort). On tranche en relisant.
      if (getDb().prepare('SELECT 1 FROM nutrition_gift_bons WHERE client_email=? AND cadeau=?').get(email, cadeauId)) return false;
      const n = Number(essais) || 0;
      if (n >= 3) { console.error('creerBon:', e && e.message); return false; }
      return creerBon(email, cadeauId, n + 1);
    }
  }

  // Les bons d'un client, indexés par cadeau -> le front colle chacun sur sa carte.
  function bonsDe(email) {
    const map = {};
    try {
      getDb().prepare('SELECT cadeau, code, statut, created_at, retire_at FROM nutrition_gift_bons WHERE client_email=?').all(email)
        .forEach((r) => { map[r.cadeau] = { code: r.code, statut: r.statut, date: r.created_at, retireLe: r.retire_at }; });
    } catch (_) { /* table absente */ }
    return map;
  }

  function bonParCode(code) {
    try { return getDb().prepare('SELECT * FROM nutrition_gift_bons WHERE code=?').get(String(code || '').trim().toUpperCase()) || null; }
    catch (_) { return null; }
  }

  // Retrait : UN SEUL possible. Le « WHERE statut='a_retirer' » est ce qui l'empêche
  // d'être joué deux fois — c'est la condition de l'UPDATE lui-même, atomique, et
  // non un test lu avant d'écrire (que deux coachs simultanés passeraient tous les
  // deux). changes === 0 => déjà retiré, et on le dit.
  function retirerBon(code, parQui) {
    const c = String(code || '').trim().toUpperCase();
    try {
      const bon = bonParCode(c);
      if (!bon) return { ok: false, erreur: 'inconnu' };
      const info = getDb().prepare("UPDATE nutrition_gift_bons SET statut='retire', retire_at=?, retire_par=? WHERE code=? AND statut='a_retirer'")
        .run(new Date().toISOString(), String(parQui || '').slice(0, 120), c);
      if (info.changes === 0) return { ok: false, erreur: 'deja', bon: bonParCode(c) };
      return { ok: true, bon: bonParCode(c) };
    } catch (e) { console.error('retirerBon:', e && e.message); return { ok: false, erreur: 'erreur' }; }
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
      // La série casse -> les paliers repartent de zéro : une nouvelle série pourra
      // à nouveau débloquer 3 / 7 / 14…
      getDb().prepare("UPDATE user_game_stats SET streak_current=0, streak_paliers='', last_win_date=?, updated_at=datetime('now') WHERE client_email=?")
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
      // Une série qui repart de 1 est une NOUVELLE série : ses paliers se remettent
      // à zéro (le reset de reconcileStreak ne couvre pas la reprise après un trou).
      let paliers = streak <= 1 ? [] : lirePaliers(s.streak_paliers);
      // Palier atteint ? Une seule fois par série : la liste tranche, même si un
      // jour était rejoué.
      const gainPalier = paliers.includes(streak) ? 0 : punchPalier(streak);
      if (gainPalier > 0) paliers = paliers.concat(streak);
      getDb().prepare("UPDATE user_game_stats SET streak_current=?, streak_best=?, streak_paliers=?, last_win_date=?, updated_at=datetime('now') WHERE client_email=?")
        .run(streak, best, JSON.stringify(paliers), today, email);
      const debloques = addPunch(email, gainPalier, 'palier:' + streak); // idem : un seul chemin
      return {
        gagne: true, nouveau: true, stats: pathStatsRow(email),
        // Le front s'en sert pour célébrer AU MOMENT où le palier tombe.
        palier: gainPalier > 0 ? { jours: streak, punch: gainPalier } : null,
        debloques,
      };
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
      } else if (!nodeAccepteEvent(node, eventType)) {
        return null; // pas le bon événement -> le retard décale la suite
      }
      const ins = getDb().prepare("INSERT OR IGNORE INTO user_node_progress (client_email, node_day, completed_at, punch_awarded, ref_id) VALUES (?,?,?,?,?)")
        .run(email, activeDay, new Date().toISOString(), node.punch, String(refId == null ? '' : refId));
      if (ins.changes === 0) return null; // déjà validé -> aucune double récompense (idempotence)
      addPunch(email, node.punch, 'etape:' + activeDay); // seul chemin d'ajout -> déblocages évalués
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
      type: n.type, event: n.event, events: n.events || null, title: n.title, action: n.action || '', punch: n.punch, milestone: !!n.milestone,
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
      // Déblocages : ce qui est acquis + le prochain à viser (« encore X Punch »).
      unlocks: [...unlockedThresholds(email)],
      prochainSeuil: punchSeuils.prochainSeuil(s.punch || 0),
      // Seuil -> le cadeau, AVEC son nom : sans ça, la célébration ne sait pas le
      // NOMMER et retombe sur « Atteint à 2000 Punch » au lieu de « Un massage sportif ».
      // Le libellé part d'ici (lib/cadeaux) plutôt que d'être recopié dans le front :
      // deux listes de noms finiraient par diverger, et le client verrait deux noms
      // pour le même cadeau selon l'écran.
      cadeaux: cadeaux.catalogue().reduce((m, c) => { m[c.seuil] = { id: c.id, label: c.label }; return m; }, {}),
      // TOUTES les récompenses (vidéos, guides, cadeaux) avec leur seuil : le Chemin
      // les matérialise le long du parcours. Rien n'est recalculé — c'est
      // punchSeuils, la source de vérité, qui est simplement mise en forme.
      recompenses: recompensesPubliques(s.punch || 0),
      weekTitles: CHALLENGE_WEEK_TITLES,
      // Mission bonus de la semaine : facultative, ne conditionne rien d'autre.
      missionBonus: missionBonusEtat(email),
      nodes,
    };
  }

  // --- MISSION BONUS (facultative) -----------------------------------------
  // La semaine de la mission = celle où le client EST sur le parcours (la
  // semaine de son étape active), pas la semaine calendaire : c'est le chapitre
  // qu'il regarde. Parcours terminé -> la mission de la semaine 6 reste lisible.
  function missionBonusWeek(email) {
    const activeDay = pathActiveDay(email);
    if (activeDay === null) return 6;
    const node = CHALLENGE_PATH_NODES.find((n) => n.day === activeDay);
    return (node && node.week) || 1;
  }
  function missionBonusEtat(email) {
    const week = missionBonusWeek(email);
    const def = MISSIONS_BONUS[week];
    if (!def) return null;
    let row = null;
    try { row = getDb().prepare('SELECT statut, created_at FROM nutrition_missions_bonus WHERE client_email=? AND week=?').get(email, week) || null; }
    catch (_) { /* table pas encore créée : la mission s'affiche « à faire » */ }
    return { week, titre: def.titre, texte: def.texte, punch: def.punch, statut: row ? row.statut : '', declaredAt: row ? row.created_at : '' };
  }
  // Déclaration du client : sur parole (aucun justificatif), une seule par
  // mission — l'unicité est portée par la contrainte UNIQUE, pas par une lecture
  // préalable (deux envois simultanés ne créeraient qu'une ligne).
  function declarerMissionBonus(email, texteClient) {
    const week = missionBonusWeek(email);
    const def = MISSIONS_BONUS[week];
    if (!def) return { error: 'Pas de mission cette semaine.' };
    const texte = String(texteClient || '').trim().slice(0, 1000);
    if (!texte) return { error: 'Dis-nous ce que tu as fait.' };
    try {
      const info = getDb().prepare("INSERT OR IGNORE INTO nutrition_missions_bonus (client_email, week, texte, statut, punch, created_at) VALUES (?,?,?,'declaree',?,?)")
        .run(email, week, texte, def.punch, new Date().toISOString());
      if (info.changes === 0) return { error: 'Tu as déjà répondu pour cette mission.' };
      return { ok: true };
    } catch (e) { console.error('mission bonus :', e && e.message); return { error: 'Impossible d’enregistrer ta réponse.' }; }
  }
  // Côté coach : toutes les déclarations, les « à trancher » d'abord.
  function missionsBonusDeclarees() {
    try {
      return getDb().prepare(`SELECT m.id, m.client_email, m.week, m.texte, m.statut, m.punch, m.created_at, m.decided_at,
          COALESCE(c.prenom, '') prenom, COALESCE(c.nom, '') nom
        FROM nutrition_missions_bonus m LEFT JOIN nutrition_clients c ON c.email = m.client_email
        ORDER BY (m.statut = 'declaree') DESC, m.id DESC`).all()
        .map((r) => ({ ...r, mission: (MISSIONS_BONUS[r.week] || {}).titre || ('Semaine ' + r.week) }));
    } catch (e) { console.error('missions bonus (coach) :', e && e.message); return []; }
  }
  // La décision est finale (une déclaration ne se retranche pas) ; le Punch ne
  // part QUE sur une validation, par addPunch — le point de passage unique.
  function deciderMissionBonus(id, action, par) {
    const row = getDb().prepare('SELECT * FROM nutrition_missions_bonus WHERE id=?').get(Number(id) || 0);
    if (!row) return { error: 'Déclaration introuvable.' };
    if (row.statut !== 'declaree') return { error: 'Cette déclaration est déjà tranchée.' };
    const statut = action === 'valider' ? 'validee' : 'refusee';
    getDb().prepare('UPDATE nutrition_missions_bonus SET statut=?, decided_at=?, decided_by=? WHERE id=?')
      .run(statut, new Date().toISOString(), String(par || ''), row.id);
    if (statut === 'validee') addPunch(row.client_email, row.punch, 'mission:' + row.week);
    return { ok: true, statut, punch: row.punch, email: row.client_email };
  }

  // Ce que le front doit savoir de chaque récompense pour la poser sur le Chemin.
  // ⚠️ `locked` se lit sur le TOTAL de Punch, jamais sur user_unlocks : cette table
  // ne dit que ce qui a été CÉLÉBRÉ. Un compte migré depuis XP+gems y est vide alors
  // qu'il a tout mérité — il verrait ses récompenses grisées.
  function recompensesPubliques(punch) {
    return punchSeuils.tousLesSeuils().map((s) => ({
      seuil: s.seuil,
      type: s.type,                                        // 'video' | 'ebook' | 'gift'
      cadeau: s.type === 'gift' ? (s.payload || {}).cadeau : '',
      label: libelleRecompense(s),
      locked: punch < s.seuil,
      restant: Math.max(0, s.seuil - punch),
      // Part du parcours franchie quand le seuil tombe : c'est ce qui permet de
      // rattacher la récompense à une étape, alors que l'une compte en Punch et
      // l'autre en jours. Même échelle que l'ordre des guides.
      ordre: s.seuil / punchSeuils.PUNCH_MAX_THEORIQUE,
    }));
  }
  // Le nom d'une récompense, dit à un seul endroit.
  function libelleRecompense(s) {
    if (s.type === 'gift') {
      const c = cadeaux.cadeau((s.payload || {}).cadeau);
      return (c && c.label) || (s.payload || {}).cadeau || 'Un cadeau';
    }
    if (s.type === 'ebook') {
      const n = Number((s.payload || {}).nombre) || 0;
      return n + (n > 1 ? ' nouveaux guides' : ' nouveau guide');
    }
    return 'Nouvelles séances vidéo';
  }

  return {
    ensureChallengePathSchema, awardClientEvent, recordEbookOpen, recordDayWin, dayWon, challengePublicState,
    pathFeatureEnabled, pathCurrentDay, pathActiveDay, pathStartYmd, cohortStartYmd, reconcileStreak,
    pathStatsRow, pathDoneDays, flowDone, addPunch, evaluateUnlocks, unlockedThresholds,
    assurerCadeaux, bonsDe, bonParCode, retirerBon, setUnlockNotifier,
    missionBonusEtat, declarerMissionBonus, missionsBonusDeclarees, deciderMissionBonus,
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
module.exports.nodeAccepteEvent = nodeAccepteEvent;
module.exports.punchPalier = punchPalier;
module.exports.PALIERS_SERIE = PALIERS_SERIE;
module.exports.FLOW_STEP_EVENT = FLOW_STEP_EVENT;
