'use strict';
// ============================================================================
//  MISE À JOUR EN PLACE D'UNE FORMATION ACADEMY EXISTANTE.
//
//  L'import d'administration (`POST /api/academy/admin/import`) REFUSE une clé
//  déjà prise : il crée, il ne fusionne pas. C'est une bonne règle pour un
//  écran ; elle ne couvre pas le cas « je réécris le contenu d'une formation
//  déjà en ligne, sans lui inventer une deuxième clé ».
//
//  Ce script fait exactement ça, et rien d'autre :
//   - la LIGNE de la formation n'est pas touchée (clé, ordre, actif, seuils,
//     catégorie, certification, reflet Boost : tout reste comme avant) ;
//   - son CONTENU pédagogique est remplacé : modules, contenus, mini-QCM,
//     QCM final, cas d'évaluation ;
//   - tout passe par les fonctions d'administration déjà éprouvées, dans UNE
//     transaction : à la moindre erreur, il ne reste rien du remplacement.
//
//  Usage :  node tools/maj-formation-pilates.js <fichier.json> [--ecrire]
//  Sans --ecrire, le script VALIDE ET RAPPORTE sans écrire une ligne.
// ============================================================================

const fs = require('fs');
const path = require('path');

const fichier = process.argv[2];
const ECRIRE = process.argv.includes('--ecrire');
if (!fichier) {
  console.error('Usage : node tools/maj-formation-pilates.js <fichier.json> [--ecrire]');
  process.exit(2);
}

const app = require('../server');
const { getDb } = require('../lib/db');
const admin = app.academyAdmin;
const formations = app.academyFormations;
const d = getDb();

const CIBLE = 'pilates';
// Ce que l'on doit trouver à l'arrivée. Le script échoue s'il manque une seule
// pièce : « ça a tourné » ne vaut pas « c'est complet ».
const ATTENDU = { modules: 10, videos: 10, minis: 50, finales: 20, cas: 5 };

const donnees = JSON.parse(fs.readFileSync(fichier, 'utf8'));

// -- 1. La cible ------------------------------------------------------------
const f = formations.lire(CIBLE);
if (!f) { console.error(`La formation « ${CIBLE} » n'existe pas : rien à mettre à jour.`); process.exit(1); }

const cleJson = String((donnees.formation || {}).cle || '').trim().toLowerCase();
if (cleJson && cleJson !== CIBLE) {
  console.error(`Le JSON porte la clé « ${cleJson} », la cible est « ${CIBLE} ». Refus : on ne devine pas.`);
  process.exit(1);
}

// -- 2. Validation SANS ÉCRITURE -------------------------------------------
// L'analyseur d'import refuse une clé existante. On lui présente donc le même
// JSON sous une clé libre : tout le reste (modules, vidéos, questions, choix,
// cas) est vérifié à l'identique, et la clé n'est pas ce qu'on lui demande.
const CLE_BLANC = 'zz_verif_maj_temporaire';
const pourVerif = { ...donnees, formation: { ...(donnees.formation || {}), cle: CLE_BLANC } };
const verif = admin.importer(pourVerif, { apercu: true }, 'script:maj-pilates');
if (!verif.ok) {
  console.error('\nLE JSON EST REFUSÉ — rien n\'a été touché :\n');
  for (const e of (verif.body.rapport || {}).erreurs || []) console.error(`  ✗ ${e.chemin} : ${e.message}`);
  process.exit(1);
}
const chiffres = verif.body.rapport.chiffres;
const avert = verif.body.rapport.avertissements || [];

console.log('\n=== CE QUE PORTE LE JSON ===');
console.log(`  modules : ${chiffres.modules}   vidéos : ${chiffres.videos}   mini-QCM : ${chiffres.minis}   finales : ${chiffres.finales}   cas : ${chiffres.cas}`);
if (avert.length) {
  console.log('\n  Avertissements (n\'empêchent rien) :');
  for (const a of avert) console.log(`    · ${a.chemin} : ${a.message}`);
}

const ecarts = Object.entries(ATTENDU).filter(([k, v]) => chiffres[k] !== v);
if (ecarts.length) {
  console.error('\nLE COMPTE N\'Y EST PAS — refus avant toute écriture :');
  for (const [k, v] of ecarts) console.error(`  ✗ ${k} : ${chiffres[k]} au lieu de ${v}`);
  process.exit(1);
}

// -- 3. L'état d'avant, et le témoin des AUTRES formations ------------------
// Une empreinte de tout ce qui n'est pas Pilates. Si elle bouge d'un seul
// caractère, le script le dit : « je n'ai touché qu'à Pilates » doit être
// prouvé, pas affirmé.
function empreinteAutres() {
  const q = (sql) => JSON.stringify(d.prepare(sql).all());
  return q(`SELECT cle, libelle, ordre, actif, qcm_nb_questions, qcm_seuil_pct, mini_nb_questions,
                   mini_seuil_pct, pratique_obligatoire, certification_active, categorie
            FROM academy_formations WHERE cle <> '${CIBLE}' ORDER BY cle`)
    + q(`SELECT id, formation, titre, ordre, actif FROM academy_modules WHERE formation <> '${CIBLE}' ORDER BY id`)
    + q(`SELECT c.id, c.module_id, c.type, c.titre, c.youtube_id, c.ordre, c.actif
         FROM academy_contenus c JOIN academy_modules m ON m.id = c.module_id
         WHERE m.formation <> '${CIBLE}' ORDER BY c.id`)
    + q(`SELECT id, formation, usage, module_id, enonce, ordre, actif FROM academy_questions
         WHERE formation <> '${CIBLE}' ORDER BY id`)
    + q(`SELECT ch.id, ch.question_id, ch.texte, ch.correct, ch.ordre, ch.actif
         FROM academy_choix ch JOIN academy_questions q ON q.id = ch.question_id
         WHERE q.formation <> '${CIBLE}' ORDER BY ch.id`)
    + q(`SELECT id, formation, titre, ordre, actif FROM academy_cas WHERE formation <> '${CIBLE}' ORDER BY id`);
}
const avant = empreinteAutres();

const compterPilates = () => ({
  modules: d.prepare(`SELECT COUNT(*) n FROM academy_modules WHERE formation = ?`).get(CIBLE).n,
  contenus: d.prepare(`SELECT COUNT(*) n FROM academy_contenus c JOIN academy_modules m ON m.id = c.module_id WHERE m.formation = ?`).get(CIBLE).n,
  videos: d.prepare(`SELECT COUNT(*) n FROM academy_contenus c JOIN academy_modules m ON m.id = c.module_id WHERE m.formation = ? AND c.type = 'video' AND c.youtube_id IS NOT NULL`).get(CIBLE).n,
  minis: d.prepare(`SELECT COUNT(*) n FROM academy_questions WHERE formation = ? AND usage = 'mini'`).get(CIBLE).n,
  finales: d.prepare(`SELECT COUNT(*) n FROM academy_questions WHERE formation = ? AND usage = 'finale'`).get(CIBLE).n,
  cas: d.prepare(`SELECT COUNT(*) n FROM academy_cas WHERE formation = ?`).get(CIBLE).n,
});
console.log('\n=== PILATES AVANT ===');
console.log(' ', JSON.stringify(compterPilates()));

if (!ECRIRE) {
  console.log('\nAperçu seul : AUCUNE écriture. Relancer avec --ecrire pour appliquer.');
  process.exit(0);
}

// -- 4. Le remplacement, en une transaction --------------------------------
const echec = (r, chemin) => { throw Object.assign(new Error(r.body.error || 'Écriture refusée.'), { chemin }); };

d.transaction(() => {
  // L'ancien contenu part EXPLICITEMENT, dans l'ordre des dépendances : on ne
  // s'en remet pas au réglage `foreign_keys` de la connexion pour que les
  // cascades jouent. Ce qui doit disparaître disparaît, nommément.
  const modulesAnciens = d.prepare(`SELECT id FROM academy_modules WHERE formation = ?`).all(CIBLE).map((m) => m.id);
  d.prepare(`DELETE FROM academy_choix WHERE question_id IN
             (SELECT id FROM academy_questions WHERE formation = ?)`).run(CIBLE);
  d.prepare(`DELETE FROM academy_questions WHERE formation = ?`).run(CIBLE);
  if (modulesAnciens.length) {
    const trous = modulesAnciens.map(() => '?').join(',');
    // La progression suit le contenu : les vues et la position d'un contenu
    // qui n'existe plus n'ont plus de sens. C'est dit ici plutôt que laissé
    // à une cascade silencieuse.
    d.prepare(`DELETE FROM academy_vus WHERE contenu_id IN
               (SELECT id FROM academy_contenus WHERE module_id IN (${trous}))`).run(...modulesAnciens);
    d.prepare(`UPDATE academy_position SET contenu_id = NULL WHERE contenu_id IN
               (SELECT id FROM academy_contenus WHERE module_id IN (${trous}))`).run(...modulesAnciens);
    d.prepare(`DELETE FROM academy_contenus WHERE module_id IN (${trous})`).run(...modulesAnciens);
    d.prepare(`DELETE FROM academy_modules WHERE formation = ?`).run(CIBLE);
  }
  d.prepare(`DELETE FROM academy_cas WHERE formation = ?`).run(CIBLE);

  // Le nouveau contenu entre par les mêmes portes que l'import : mêmes
  // contrôles, mêmes valeurs par défaut, même déduction du type et de l'usage.
  donnees.modules.forEach((m, i) => {
    const rm = admin.definirModule({ formation: CIBLE, titre: m.titre, description: m.description, ordre: i + 1 });
    if (!rm.ok) echec(rm, `modules[${i}]`);
    const moduleId = rm.body.module.id;

    const v = m.video, t = m.texte;
    const rc = admin.definirContenu(v
      ? { moduleId, type: 'video', titre: v.titre, description: v.description, youtubeId: v.youtubeId, dureeMin: v.dureeMin, ordre: 1 }
      : { moduleId, type: 'texte', titre: t.titre, description: t.description, texte: t.texte, ordre: 1 });
    if (!rc.ok) echec(rc, `modules[${i}].${v ? 'video' : 'texte'}`);

    (m.questions || []).forEach((q, j) => {
      const rq = admin.definirQuestion({
        formation: CIBLE, usage: 'mini', moduleId, enonce: q.enonce,
        choix: q.choix.map((c) => ({ texte: c.texte, correct: !!c.correct })),
        ordre: j + 1,
      });
      if (!rq.ok) echec(rq, `modules[${i}].questions[${j}]`);
    });
  });

  donnees.finale.forEach((q, j) => {
    const rq = admin.definirQuestion({
      formation: CIBLE, usage: 'finale', moduleId: null, enonce: q.enonce,
      choix: q.choix.map((c) => ({ texte: c.texte, correct: !!c.correct })),
      ordre: 1000 + j,
    });
    if (!rq.ok) echec(rq, `finale[${j}]`);
  });

  (donnees.cas || []).forEach((c, i) => {
    const rk = admin.definirCas({ formation: CIBLE, titre: c.titre, consignes: c.consignes, ordre: i + 1 });
    if (!rk.ok) echec(rk, `cas[${i}]`);
  });
})();

// -- 5. La vérification -----------------------------------------------------
const apres = compterPilates();
console.log('\n=== PILATES APRÈS ===');
console.log(' ', JSON.stringify(apres));

const problemes = [];
if (apres.modules !== ATTENDU.modules) problemes.push(`modules : ${apres.modules} au lieu de ${ATTENDU.modules}`);
if (apres.videos !== ATTENDU.videos) problemes.push(`vidéos : ${apres.videos} au lieu de ${ATTENDU.videos}`);
if (apres.minis !== ATTENDU.minis) problemes.push(`mini-QCM : ${apres.minis} au lieu de ${ATTENDU.minis}`);
if (apres.finales !== ATTENDU.finales) problemes.push(`finales : ${apres.finales} au lieu de ${ATTENDU.finales}`);
if (apres.cas !== ATTENDU.cas) problemes.push(`cas : ${apres.cas} au lieu de ${ATTENDU.cas}`);
if (empreinteAutres() !== avant) problemes.push('UNE AUTRE FORMATION A BOUGÉ');

const fApres = formations.lire(CIBLE);
if (!fApres || fApres.cle !== CIBLE) problemes.push('la clé de la formation a changé');

if (problemes.length) {
  console.error('\n✗ VÉRIFICATION EN ÉCHEC :');
  for (const p of problemes) console.error(`   ${p}`);
  console.error('\n  La sauvegarde est dans ../.backups/.');
  process.exit(1);
}
console.log('\n✓ 10 modules, 10 vidéos, 50 mini-QCM, 20 finales, 5 cas. Aucune autre formation modifiée.');
console.log(`✓ Clé « ${fApres.cle} » inchangée, formation conservée.`);
