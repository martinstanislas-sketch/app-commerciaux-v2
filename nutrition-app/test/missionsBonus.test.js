'use strict';
// Tests des MISSIONS BONUS (facultatives) : déclaration sur parole, une seule
// réponse par mission, décision finale du coach, Punch crédité SEULEMENT à la
// validation — et jamais aucun effet sur l'avancement du parcours.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createChallengeEngine } = require('../lib/challengePath');

function makeEngine() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
    CREATE TABLE nutrition_parcours_pesees (client_email TEXT, type TEXT, date TEXT, PRIMARY KEY(client_email, type));
    CREATE TABLE nutrition_clients (email TEXT PRIMARY KEY, prenom TEXT DEFAULT '', nom TEXT DEFAULT '', data TEXT);
    CREATE TABLE nutrition_client_meta (client_email TEXT PRIMARY KEY, ville TEXT DEFAULT '', challenge_no INTEGER DEFAULT 0, updated_at TEXT DEFAULT '');
    CREATE TABLE nutrition_access_codes (ville TEXT, challenge_no INTEGER, code TEXT, actif INTEGER DEFAULT 1, start_date TEXT NOT NULL DEFAULT '', updated_at TEXT DEFAULT '', PRIMARY KEY (ville, challenge_no));
    CREATE TABLE nutrition_parcours_photos (id INTEGER PRIMARY KEY AUTOINCREMENT, client_email TEXT NOT NULL DEFAULT '',
      jalon TEXT NOT NULL DEFAULT '', type TEXT NOT NULL DEFAULT '', data TEXT NOT NULL DEFAULT '', mime TEXT NOT NULL DEFAULT '',
      auteur_role TEXT NOT NULL DEFAULT '', auteur_id INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT '');
  `);
  const engine = createChallengeEngine({ getDb: () => db });
  engine.ensureChallengePathSchema();
  db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('challenge_path_enabled','on','')").run();
  db.prepare('INSERT INTO nutrition_clients (email, prenom, nom, data) VALUES (?,?,?,?)')
    .run('a@a.fr', 'Alice', 'Martin', JSON.stringify({ startDate: '2020-01-01' }));
  return { db, engine, email: 'a@a.fr' };
}

// Fait avancer le parcours jusqu'à la semaine voulue en validant les étapes.
function avancerJusquaSemaine(db, email, jours) {
  const ins = db.prepare("INSERT OR IGNORE INTO user_node_progress (client_email, node_day, completed_at, punch_awarded) VALUES (?,?,'2020-01-02T00:00:00Z',0)");
  for (let d = 0; d < jours; d++) ins.run(email, d);
}

test('mission bonus : seule la semaine 1 est ouverte au départ, sans statut', () => {
  const { engine, email } = makeEngine();
  const liste = engine.missionsBonusListe(email);
  assert.equal(liste.length, 1);
  assert.equal(liste[0].week, 1);
  assert.equal(liste[0].titre, 'Donne ton avis');
  assert.ok(liste[0].punch > 0);
  assert.equal(liste[0].statut, '');
});

test('missions passées rattrapables, futures masquées', () => {
  const { db, engine, email } = makeEngine();
  avancerJusquaSemaine(db, email, 8); // étapes 0-7 faites -> étape active en semaine 2
  const liste = engine.missionsBonusListe(email);
  assert.deepEqual(liste.map((m) => m.week), [1, 2], 'semaines 1 et 2 ouvertes, 3+ masquées');
  // Rattrapage : la mission de la semaine 1, jamais faite, se déclare encore.
  assert.equal(engine.declarerMissionBonus(email, 1, "Avis Google posté, mieux vaut tard.").ok, true);
  assert.equal(engine.missionsBonusListe(email).find((m) => m.week === 1).statut, 'validee');
  // Une mission future ne se déclare pas.
  assert.ok(engine.declarerMissionBonus(email, 3, 'Trop tôt !').error, 'semaine 3 pas encore ouverte');
});

test('mission bonus : exposée dans l’état public du parcours', () => {
  const { engine, email } = makeEngine();
  const st = engine.challengePublicState(email);
  assert.ok(Array.isArray(st.missionsBonus));
  assert.equal(st.missionsBonus[0].week, 1);
});

test('déclaration : une seule réponse par mission, texte requis', () => {
  const { engine, email } = makeEngine();
  assert.ok(engine.declarerMissionBonus(email, 1, '   ').error, 'texte vide -> refusé');
  assert.equal(engine.declarerMissionBonus(email, 1, "J'ai laissé un avis Google.").ok, true);
  assert.equal(engine.missionsBonusListe(email)[0].statut, 'validee');
  assert.ok(engine.declarerMissionBonus(email, 1, 'Encore !').error, 'pas de second envoi');
});

test('coach : la liste porte le client, la semaine, la mission, le texte, la date', () => {
  const { engine, email } = makeEngine();
  engine.declarerMissionBonus(email, 1, "J'ai laissé un avis Google.");
  const rows = engine.missionsBonusDeclarees();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].client_email, email);
  assert.equal(rows[0].prenom, 'Alice');
  assert.equal(rows[0].week, 1);
  assert.equal(rows[0].mission, 'Donne ton avis');
  assert.equal(rows[0].texte, "J'ai laissé un avis Google.");
  assert.ok(rows[0].created_at);
});

test('pur déclaratif : la déclaration crédite le Punch tout de suite (une seule fois)', () => {
  const { engine, email } = makeEngine();
  const avant = engine.pathStatsRow(email).punch || 0;
  const r = engine.declarerMissionBonus(email, 1, 'Fait !');
  assert.equal(r.ok, true);
  assert.ok(r.punch > 0, 'la déclaration renvoie le Punch gagné');
  assert.equal(engine.pathStatsRow(email).punch, avant + r.punch, 'crédité immédiatement');
  assert.equal(engine.missionsBonusListe(email)[0].statut, 'validee', 'auto-validée');
  // Pas de second envoi : ni doublon, ni double crédit.
  assert.ok(engine.declarerMissionBonus(email, 1, 'Encore !').error, 'déjà déclarée');
  assert.equal(engine.pathStatsRow(email).punch, avant + r.punch, 'toujours un seul crédit');
});

test('pur déclaratif : le coach voit la déclaration mais n’a rien à trancher', () => {
  const { engine, email } = makeEngine();
  engine.declarerMissionBonus(email, 1, 'Fait !');
  const row = engine.missionsBonusDeclarees()[0];
  assert.equal(row.statut, 'validee', 'déjà validée dès la déclaration');
  // La route de décision devient inerte : rien à trancher sur une déclaration validée.
  assert.ok(engine.deciderMissionBonus(row.id, 'valider').error, 'pas de re-décision');
});

test('la mission ne touche pas au parcours : l’étape active ne bouge pas', () => {
  const { engine, email } = makeEngine();
  const avant = engine.pathActiveDay(email);
  engine.declarerMissionBonus(email, 1, 'Fait !');
  assert.equal(engine.pathActiveDay(email), avant);
});

// --- Position des récompenses sur le sentier --------------------------------
// `ordre` doit poser chaque récompense sur l'étape où son seuil tombe dans un
// déroulé PARFAIT (toutes les étapes validées + jour gagné chaque jour).
test('récompenses : posées à l’étape où le seuil tombe si tout est validé', () => {
  const { engine, email } = makeEngine();
  const { CHALLENGE_PATH_NODES, punchPalier } = require('../lib/challengePath');
  let c = 0;
  const cumul = CHALLENGE_PATH_NODES.map((n, i) => { c += n.punch + punchPalier(i + 1); return c; });
  const dernier = CHALLENGE_PATH_NODES.length - 1;
  const recs = engine.challengePublicState(email).recompenses;
  assert.ok(recs.length > 0);
  for (const r of recs) {
    const k = Math.round(r.ordre * dernier);
    assert.equal(r.ordre, k / dernier, 'ordre = un index d’étape exact');
    if (r.seuil <= cumul[dernier]) {
      // Atteignable par un parcours parfait : posée là où son seuil tombe.
      assert.ok(cumul[k] >= r.seuil, `seuil ${r.seuil} atteint à l'étape ${k}`);
      if (k > 0) assert.ok(cumul[k - 1] < r.seuil, `seuil ${r.seuil} pas encore atteint à l'étape ${k - 1}`);
    } else {
      // Au-delà du parcours (2395) : ces cadeaux EXIGENT des missions bonus -> posés en fin de chemin.
      assert.equal(k, dernier, `le cadeau à ${r.seuil} se pose à la fin du chemin`);
    }
  }
  // Monotone : les tris par `ordre` (guides, boutique) restent valides.
  const ordres = recs.map((r) => r.ordre);
  assert.deepEqual(ordres, [...ordres].sort((a, b) => a - b));
});

test('mission « avis » : le lien Google suit la ville du challenge', () => {
  const { db, engine, email } = makeEngine();
  // Sans meta : pas de lien, la mission reste entière.
  assert.equal(engine.missionsBonusListe(email)[0].lien, '');
  // Lille (peu importe la casse) : le lien du studio est servi.
  db.prepare("INSERT INTO nutrition_client_meta (client_email, ville) VALUES (?, 'Lille')").run(email);
  assert.equal(engine.missionsBonusListe(email)[0].lien, 'https://g.page/r/CTvKa-eHYYRsEBM/review');
  // Une autre ville : pas de lien.
  db.prepare("UPDATE nutrition_client_meta SET ville='Neuilly-sur-Seine' WHERE client_email=?").run(email);
  assert.equal(engine.missionsBonusListe(email)[0].lien, '');
});

// --- Corrélation étapes validées <-> récompenses ----------------------------
// Le sentier promet une récompense « à cette étape » : celui qui valide tout le
// travail jusque-là doit la recevoir, même avec une série 🔥 imparfaite (donc
// moins de Punch réel que la courbe parfaite).
test('étapes validées => récompense débloquée, même sans le Punch réel', () => {
  const { db, engine, email } = makeEngine();
  const { CHALLENGE_PATH_NODES, punchPalier } = require('../lib/challengePath');
  let c = 0;
  const cumul = CHALLENGE_PATH_NODES.map((n, i) => { c += n.punch + punchPalier(i + 1); return c; });
  // ⚠️ Les seuils SUIVENT les étapes (une récompense par action) : on ne les code
  // plus en dur ici, on prend le 1er lot de vidéos et le seuil juste après.
  const { VIDEO_LOTS } = require('../lib/punchSeuils');
  const sLot = VIDEO_LOTS[0];
  const kLot = cumul.findIndex((x) => x >= sLot);
  // Le client valide les étapes 0..kLot SANS aucun jour gagné : Punch réel = 0 ici
  // (les étapes sont insérées sans passer par addPunch, comme un compte en retard).
  avancerJusquaSemaine(db, email, kLot + 1);
  assert.equal(engine.pathStatsRow(email).punch, 0, 'Punch réel nul dans ce scénario');
  // La progression déverrouille quand même : la récompense n'est plus grisée.
  const st = engine.challengePublicState(email);
  const rLot = st.recompenses.find((r) => r.seuil === sLot && r.type === 'video');
  assert.equal(rLot.locked, false, 'validé jusqu’à la récompense -> débloquée');
  assert.equal(rLot.restant, 0);
  // Et une récompense posée PLUS LOIN reste verrouillée.
  const suivant = st.recompenses.find((r) => r.seuil > cumul[kLot]);
  assert.equal(suivant.locked, true);
  // Au prochain gain, l'enregistrement (célébration/notification) rattrape.
  engine.addPunch(email, 1, 'test');
  assert.ok(engine.unlockedThresholds(email).has(sLot + ':video'));
  assert.ok(!engine.unlockedThresholds(email).has(suivant.seuil + ':' + suivant.type));
});
