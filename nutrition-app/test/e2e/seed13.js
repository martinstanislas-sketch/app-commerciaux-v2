'use strict';
// Pose la progression 0..12 de Dave : on veut tester l'étape 13, pas les 13 d'avant.
const D = require('/Users/stan/App commerciaux V2/node_modules/better-sqlite3');
const db = new D(process.argv[process.argv.length - 1]);
const st = db.prepare('INSERT OR IGNORE INTO user_node_progress (client_email, node_day, completed_at, punch_awarded, ref_id) VALUES (?,?,?,0,?)');
for (let d = 0; d <= 12; d++) st.run('dave@t.fr', d, '2026-07-01', '');
console.log('progression 0..12 posée');
