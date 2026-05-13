#!/usr/bin/env node
/**
 * Migration script: import COACH app data into Suivi Commerciaux unified DB.
 *
 * Reads from:   /Users/stan/APP COACH/data.db
 * Writes to:    /Users/stan/App commerciaux V2/data.db  (or DB_DIR/data.db in prod)
 *
 * IMPORTANT:
 * - Idempotent: re-running won't duplicate (INSERT OR IGNORE strategies)
 * - Source DB is opened READ-ONLY (no risk of corruption)
 * - Renamed tables: daily_action_values → coach_daily_action_values,
 *                   admin_notes         → coach_admin_notes,
 *                   sessions            → coach_sessions
 * - Skipped tables: perso_*, sqlite_sequence, _migrations
 */

const Database = require('better-sqlite3');
const path = require('path');

const SOURCE_DB = process.env.COACH_DB_SRC || '/Users/stan/APP COACH/data.db';
const TARGET_DIR = process.env.DB_DIR || __dirname;
const TARGET_DB = path.join(TARGET_DIR, 'data.db');

console.log(`📂 Source : ${SOURCE_DB}`);
console.log(`📂 Target : ${TARGET_DB}`);

const src = new Database(SOURCE_DB, { readonly: true });
const dst = new Database(TARGET_DB);
dst.pragma('foreign_keys = OFF'); // permettre l'import sans bloquer sur FK

const stats = { imported: {}, skipped: {}, errors: [] };

function importTable(srcTable, dstTable, columns) {
  try {
    const rows = src.prepare(`SELECT ${columns.join(', ')} FROM ${srcTable}`).all();
    if (rows.length === 0) {
      stats.skipped[srcTable] = '0 rows';
      return;
    }
    const placeholders = columns.map(() => '?').join(', ');
    const insertSql = `INSERT OR IGNORE INTO ${dstTable} (${columns.join(', ')}) VALUES (${placeholders})`;
    const stmt = dst.prepare(insertSql);
    let count = 0;
    const tx = dst.transaction((rows) => {
      for (const r of rows) {
        const values = columns.map(c => r[c]);
        const info = stmt.run(...values);
        if (info.changes > 0) count++;
      }
    });
    tx(rows);
    stats.imported[`${srcTable} → ${dstTable}`] = `${count}/${rows.length}`;
  } catch (e) {
    stats.errors.push(`${srcTable}: ${e.message}`);
    console.error(`❌ ${srcTable}: ${e.message}`);
  }
}

console.log('\n🚀 Démarrage de l\'import...\n');

// ── 1. Coaches ──
importTable('coaches', 'coaches',
  ['id', 'name', 'pin', 'role', 'studio', 'start_month', 'archived', 'is_leader', 'in_accompagnement']);

// ── 2. Sessions → coach_sessions ──
importTable('sessions', 'coach_sessions',
  ['token', 'role', 'name', 'coach_id', 'is_leader', 'created_at']);

// ── 3. Monthly data ──
importTable('monthly_data', 'monthly_data',
  ['id', 'coach_id', 'month', 'taux_resiliation', 'taux_non_frequentants', 'nb_adherents',
   'commentaire_manager', 'created_at', 'updated_at', 'chiffre_affaires', 'nouveaux_clients',
   'taux_occupation', 'taux_contribution', 'depenses', 'les_sa']);

// ── 4. Members (resiliation, non-freq, nouveaux) ──
importTable('resiliation_members', 'resiliation_members',
  ['id', 'coach_id', 'month', 'member_name', 'created_at']);
importTable('non_frequentant_members', 'non_frequentant_members',
  ['id', 'coach_id', 'month', 'member_name', 'created_at']);
importTable('nouveaux_clients_members', 'nouveaux_clients_members',
  ['id', 'coach_id', 'month', 'member_name', 'created_at']);

// ── 5. Daily actions → coach_daily_action_values ──
importTable('daily_action_values', 'coach_daily_action_values',
  ['id', 'coach_id', 'action_key', 'date', 'value', 'text_value']);

// ── 6. Community ──
importTable('community_messages', 'community_messages',
  ['id', 'coach_id', 'type', 'content', 'audio_data', 'audio_duration',
   'is_cr', 'created_at', 'target_club', 'is_system']);
importTable('message_likes', 'message_likes',
  ['id', 'message_id', 'coach_id', 'created_at']);

// ── 7. Formations & quiz ──
importTable('formations', 'formations',
  ['id', 'name', 'category', 'created_at', 'description', 'video_url', 'sort_order']);
importTable('formation_validations', 'formation_validations',
  ['id', 'formation_id', 'coach_id', 'status', 'validated_at', 'comment']);
importTable('formation_events', 'formation_events',
  ['id', 'title', 'event_date', 'studio', 'notes', 'created_at']);
importTable('quiz_questions', 'quiz_questions',
  ['id', 'formation_id', 'question', 'option_a', 'option_b', 'option_c', 'option_d',
   'correct_answer', 'explanation']);
importTable('quiz_results', 'quiz_results',
  ['id', 'formation_id', 'coach_id', 'score', 'total', 'passed', 'taken_at']);

// ── 8. CA & objectifs ──
importTable('ca_objectifs', 'ca_objectifs',
  ['id', 'club', 'month', 'objectif', 'objectif_min']);
importTable('club_daily_action', 'club_daily_action',
  ['studio', 'action_text', 'updated_at']);

// ── 9. Gamification ──
importTable('xp_log', 'xp_log',
  ['id', 'coach_id', 'amount', 'reason', 'ref_id', 'created_at']);
importTable('coach_badges', 'coach_badges',
  ['id', 'coach_id', 'badge_key', 'unlocked_at']);
importTable('coach_streaks', 'coach_streaks',
  ['id', 'coach_id', 'current_streak', 'best_streak', 'last_validation_week']);

// ── 10. Évaluations & revues ──
importTable('leader_evaluations', 'leader_evaluations',
  ['id', 'coach_id', 'month', 'score', 'points_forts', 'points_ameliorer', 'plan_action',
   'created_at', 'updated_at', 'score_engagement', 'score_loyal', 'score_infos',
   'score_team', 'score_eclat', 'score_succes', 'comment_engagement', 'comment_loyal',
   'comment_infos', 'comment_team', 'comment_eclat', 'comment_succes', 'global_comment',
   'eval_data', 'remarques']);

// studio_reviews: introspection des colonnes (schéma peut varier légèrement)
try {
  const srcCols = src.prepare("PRAGMA table_info(studio_reviews)").all().map(c => c.name);
  const dstCols = dst.prepare("PRAGMA table_info(studio_reviews)").all().map(c => c.name);
  const commonCols = srcCols.filter(c => dstCols.includes(c));
  importTable('studio_reviews', 'studio_reviews', commonCols);
} catch (e) { stats.errors.push('studio_reviews: ' + e.message); }

importTable('dr_weekly_reports', 'dr_weekly_reports',
  ['id', 'week', 'top_leader_1', 'top_leader_1_comment', 'top_leader_2', 'top_leader_2_comment',
   'flop_leader_1', 'flop_leader_1_comment', 'flop_leader_2', 'flop_leader_2_comment',
   'top_club_1', 'top_club_1_comment', 'top_club_2', 'top_club_2_comment',
   'flop_club_1', 'flop_club_1_comment', 'flop_club_2', 'flop_club_2_comment',
   'priority_1', 'priority_2', 'priority_3', 'arbitrage', 'created_at', 'updated_at']);

// ── 11. Admin notes → coach_admin_notes ──
importTable('admin_notes', 'coach_admin_notes',
  ['id', 'content', 'created_at', 'updated_at']);

// ── 12. Misc ──
importTable('monthly_focus', 'monthly_focus',
  ['month', 'content', 'updated_at']);
importTable('ressources', 'ressources',
  ['id', 'youtube_url', 'video_id', 'title', 'category', 'created_at']);

// ── Réactivation des FK ──
dst.pragma('foreign_keys = ON');
src.close();
dst.close();

// ── Rapport ──
console.log('\n📊 RAPPORT D\'IMPORT\n');
console.log('✅ Tables importées:');
Object.entries(stats.imported).forEach(([k, v]) => console.log(`   ${k}: ${v}`));
if (Object.keys(stats.skipped).length > 0) {
  console.log('\n⏭️  Tables vides (skip):');
  Object.entries(stats.skipped).forEach(([k, v]) => console.log(`   ${k}: ${v}`));
}
if (stats.errors.length > 0) {
  console.log('\n❌ Erreurs:');
  stats.errors.forEach(e => console.log(`   ${e}`));
  process.exit(1);
}

console.log('\n✨ Migration terminée avec succès !');
