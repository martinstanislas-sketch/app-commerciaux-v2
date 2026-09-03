// ============================================================================
//  PRÉPARER UN COACH DE DÉMONSTRATION, prêt à être évalué sur Nutrition Certifié.
//
//  Il emprunte le VRAI chemin de l'application : création du compte, ajout aux
//  collaborateurs, contenus terminés, mini-QCM puis QCM final réussis. Toutes
//  les écritures passent par l'API — aucun INSERT à la main.
//
//  Le corrigé, lui, se lit en base : il n'est jamais servi au coach, et c'est
//  très bien ainsi. C'est exactement ce que fait test/aideAcademy.js.
//
//  Usage :
//    PIN_ADMIN=<ton code> node tools/preparer-coach-demo.js
// ============================================================================
const path = require('path');
const RACINE = path.join(__dirname, '..');
const Database = require('better-sqlite3');

const BASE = process.env.BASE || 'http://localhost:3000';
const DB = process.env.DB || path.join(RACINE, 'data/nutrition.sqlite');
const ADMIN = process.env.ADMIN || 'martin.stanislas@gmail.com';
const PIN_ADMIN = process.env.PIN_ADMIN;
const COACH = process.env.COACH || 'coach.demo@mycoach.fr';
const PIN_COACH = process.env.PIN_COACH || '1234';
const F = 'coach_nutrition';

const j = (r, b, m, t) => fetch(BASE + r, {
  method: m || 'POST',
  headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
  body: b ? JSON.stringify(b) : undefined,
}).then((x) => x.json());
const g = (r, t) => fetch(BASE + r, { headers: { Authorization: 'Bearer ' + t } }).then((x) => x.json());

(async () => {
  if (!PIN_ADMIN) throw new Error('PIN_ADMIN manquant.');
  const db = new Database(DB, { readonly: true });
  const corrige = db.prepare('SELECT id, correct_json AS c FROM academy_tentative_questions WHERE tentative_id = ?');

  const ta = (await j('/account/login', { email: ADMIN, pin: PIN_ADMIN })).token;
  if (!ta) throw new Error('connexion administrateur refusée (PIN ?)');

  await j('/account/login', { email: COACH, prenom: 'Coach démo', pin: PIN_COACH });
  await j('/api/boost/admin/collaborateurs', { email: COACH, role: 'collaborateur' }, 'POST', ta);
  const tc = (await j('/account/login', { email: COACH, pin: PIN_COACH })).token;
  if (!tc) throw new Error('connexion du coach de démonstration refusée');

  const passer = async (moduleId) => {
    const r = await j('/api/academy/qcm/tentatives', moduleId ? { formation: F, moduleId } : { formation: F }, 'POST', tc);
    const t = r.tentative;
    if (!t) return null;
    const k = new Map(corrige.all(t.id).map((x) => [x.id, JSON.parse(x.c)]));
    for (const q of t.questions) {
      await j(`/api/academy/qcm/tentatives/${t.id}/reponses/${q.id}`, { choix: k.get(q.id) || [] }, 'PUT', tc);
    }
    return (await j(`/api/academy/qcm/tentatives/${t.id}/terminer`, {}, 'POST', tc)).tentative.resultat;
  };

  // La progression est verrouillée module par module : on boucle jusqu'à ce que
  // le QCM final s'ouvre.
  for (let tour = 1; tour <= 25; tour++) {
    const f = (await g(`/api/academy/formation?formation=${F}`, tc)).formation;
    for (const c of f.modules.flatMap((m) => m.contenus)) {
      await j(`/api/academy/contenus/${c.id}/terminer`, {}, 'POST', tc);
    }
    const e = (await g(`/api/academy/qcm?formation=${F}`, tc)).qcm || {};
    if (e.disponible) break;
    let bouge = false;
    for (const m of (e.minis || [])) {
      if (m.aBanque && !m.reussi && m.disponible) {
        const r = await passer(m.moduleId);
        if (r) { bouge = true; console.log('  mini « ' + m.moduleTitre + ' » : ' + (r.reussie ? 'réussi' : 'ÉCHOUÉ ' + r.scorePct + ' %')); }
      }
    }
    if (!bouge) { console.log('  (progression bloquée au tour ' + tour + ')'); break; }
  }

  const fin = await passer(null);
  console.log('  QCM final : ' + (fin ? (fin.reussie ? 'réussi (' + fin.scorePct + ' %)' : 'ÉCHOUÉ ' + fin.scorePct + ' %') : 'non ouvert'));

  const c = await g(`/api/academy/evaluateur/coachs?formation=${F}`, ta);
  const ligne = (c.coachs || []).find((x) => x.email === COACH);
  console.log('\n  → ' + COACH + '  (PIN ' + PIN_COACH + ')  | statut : ' + (ligne ? ligne.statut : 'introuvable'));
})().catch((e) => { console.error('ÉCHEC :', e.message); process.exit(1); });
