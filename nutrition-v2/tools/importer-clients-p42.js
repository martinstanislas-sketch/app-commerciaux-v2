'use strict';
// ============================================================================
//  IMPORT DES CLIENTS PROTOCOLE 42 -> base de la v2.
//
//  Source : la base de l'app principale (data.db), table `nutrition_clients`
//  (email, prenom, data JSON = { profil, preferences, plan, ... }).
//  Cible  : la base de la v2 (NUTRITION_DB), table `users`.
//
//  Usage :
//    node tools/importer-clients-p42.js /chemin/vers/data.db            # simulation, n'écrit rien
//    node tools/importer-clients-p42.js /chemin/vers/data.db --appliquer
//
//  Règles :
//   - LECTURE SEULE sur la source (ouverte en readonly).
//   - Un compte déjà présent dans la v2 avec un plan n'est jamais écrasé.
//   - L'objectif « challenge » (Protocole 42) n'existe pas dans la v2 : il est
//     converti en « perte » (déficit doux de 15 %). Le plan déjà généré est
//     conservé tel quel ; seul un « Nouveau plan » utilisera le nouveau calcul.
//   - Rien d'autre n'est repris (suivi, messages, Punch, photos…) : hors MVP.
// ============================================================================

const Database = require('better-sqlite3');
const { getDb, nowIso } = require('../lib/db');
const { normEmail, emailValide } = require('../lib/auth');

const OBJECTIFS_V2 = new Set(['perte', 'maintien', 'muscle', 'energie']);

function convertir(row) {
  let d = {};
  try { d = JSON.parse(row.data || '{}') || {}; } catch (_) { d = {}; }
  const profil = d.profil && typeof d.profil === 'object' ? { ...d.profil } : null;
  let objectifConverti = false;
  if (profil && !OBJECTIFS_V2.has(profil.objectif)) {
    profil.objectif = 'perte';
    objectifConverti = true;
  }
  return {
    email: normEmail(row.email),
    prenom: String(row.prenom || '').slice(0, 60),
    profil,
    preferences: d.preferences && typeof d.preferences === 'object' ? d.preferences : null,
    plan: d.plan && Array.isArray(d.plan.jours) ? d.plan : null,
    creeLe: row.created_at || nowIso(),
    objectifConverti,
  };
}

function importer(sourcePath, appliquer) {
  const src = new Database(sourcePath, { readonly: true, fileMustExist: true });
  const rows = src.prepare('SELECT email, prenom, data, created_at FROM nutrition_clients').all();
  src.close();

  const db = getDb();
  const existe = db.prepare('SELECT plan FROM users WHERE email = ?');
  const ins = db.prepare(`INSERT INTO users (email, prenom, profil, preferences, plan, plan_maj, cree_le)
    VALUES (@email, @prenom, @profil, @preferences, @plan, @planMaj, @creeLe)
    ON CONFLICT(email) DO UPDATE SET prenom = CASE WHEN users.prenom = '' THEN excluded.prenom ELSE users.prenom END,
      profil = excluded.profil, preferences = excluded.preferences, plan = excluded.plan, plan_maj = excluded.plan_maj`);

  const bilan = { total: rows.length, importes: 0, sansPlan: 0, dejaLa: 0, emailInvalide: 0, objectifConverti: 0 };
  const aEcrire = [];
  for (const row of rows) {
    const c = convertir(row);
    if (!emailValide(c.email)) { bilan.emailInvalide++; continue; }
    const deja = existe.get(c.email);
    if (deja && deja.plan) { bilan.dejaLa++; continue; }
    if (!c.plan) bilan.sansPlan++;
    if (c.objectifConverti) bilan.objectifConverti++;
    aEcrire.push(c);
  }
  if (appliquer) {
    db.transaction(() => {
      for (const c of aEcrire) {
        ins.run({
          email: c.email, prenom: c.prenom, creeLe: c.creeLe,
          profil: c.profil ? JSON.stringify(c.profil) : null,
          preferences: c.preferences ? JSON.stringify(c.preferences) : null,
          plan: c.plan ? JSON.stringify(c.plan) : null,
          planMaj: c.plan ? nowIso() : null,
        });
      }
    })();
  }
  bilan.importes = aEcrire.length;
  return bilan;
}

if (require.main === module) {
  const [source, flag] = process.argv.slice(2);
  if (!source) { console.error('Usage : node tools/importer-clients-p42.js <data.db> [--appliquer]'); process.exit(1); }
  const appliquer = flag === '--appliquer';
  const b = importer(source, appliquer);
  console.log(appliquer ? '\nIMPORT EFFECTUÉ' : '\nSIMULATION (rien n\'a été écrit — ajoute --appliquer)');
  console.log(`  Clients dans Protocole 42 : ${b.total}`);
  console.log(`  ${appliquer ? 'Importés' : 'À importer'}          : ${b.importes} (dont ${b.sansPlan} sans plan)`);
  console.log(`  Déjà dans la v2 avec plan : ${b.dejaLa} (non touchés)`);
  console.log(`  E-mail invalide (ignorés) : ${b.emailInvalide}`);
  console.log(`  Objectif challenge -> perte : ${b.objectifConverti}\n`);
}

module.exports = { importer, convertir };
