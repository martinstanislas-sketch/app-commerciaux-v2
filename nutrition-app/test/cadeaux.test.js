'use strict';
// La boutique de cadeaux : le dernier maillon du Punch. Ce qui est ATTEINT reste
// acquis (cumul pur), un cadeau physique donne un bon, et ce bon ne se retire
// qu'UNE fois — c'est un massage réel au bout, pas un compteur.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const cadeaux = require('../lib/cadeaux');
const punchSeuils = require('../lib/punchSeuils');
const { VIDEO_LOTS, EBOOK_TIERS, GIFTS, tousLesSeuils, cleSeuil, avatarSeuils } = punchSeuils;
const createChallengeEngine = require('../lib/challengePath');

function makeEngine() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
    CREATE TABLE nutrition_parcours_pesees (client_email TEXT, type TEXT, date TEXT, PRIMARY KEY(client_email, type));
    CREATE TABLE nutrition_clients (email TEXT PRIMARY KEY, data TEXT);
    CREATE TABLE nutrition_client_meta (client_email TEXT PRIMARY KEY, ville TEXT DEFAULT '', challenge_no INTEGER DEFAULT 0, updated_at TEXT DEFAULT '');
    CREATE TABLE nutrition_access_codes (ville TEXT, challenge_no INTEGER, code TEXT, actif INTEGER DEFAULT 1, start_date TEXT NOT NULL DEFAULT '', updated_at TEXT DEFAULT '', PRIMARY KEY (ville, challenge_no));
    CREATE TABLE nutrition_parcours_photos (id INTEGER PRIMARY KEY AUTOINCREMENT, client_email TEXT, jalon TEXT, type TEXT, data TEXT, mime TEXT, auteur_role TEXT, auteur_id INTEGER, created_at TEXT);
  `);
  const engine = createChallengeEngine({ getDb: () => db });
  engine.ensureChallengePathSchema();
  db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('challenge_path_enabled','on','')").run();
  db.prepare('INSERT INTO nutrition_clients (email, data) VALUES (?,?)').run('a@a.fr', JSON.stringify({ startDate: '2020-01-01' }));
  const email = 'a@a.fr';
  engine.pathStatsRow(email);
  return { db, engine, email };
}

// --- Le catalogue : les seuils viennent de punchSeuils, JAMAIS d'ici ---------
test('catalogue : chaque cadeau des seuils a un sens (label + nature)', () => {
  const cat = cadeaux.catalogue();
  assert.equal(cat.length, Object.keys(punchSeuils.GIFTS).length, 'aucun cadeau orphelin ni en trop');
  cat.forEach((c) => {
    assert.ok(c.label && c.label !== c.id, `le cadeau ${c.id} n'a pas de nom lisible`);
    assert.ok(['digital', 'physique'].includes(c.nature), `nature inconnue pour ${c.id}`);
    assert.equal(punchSeuils.GIFTS[c.seuil], c.id, 'le seuil vient de punchSeuils');
  });
});

test('catalogue : les 9 cadeaux, dans l\'ordre des paliers', () => {
  // 5 cadeaux retirés du barème (ambassadeur, accès prioritaire, mois offert,
  // remise abo, badge argent) -> 9 restants. Badge argent parti, le 1er liseré
  // est l'or ; sa médaille d'avatar est retirée avec lui (cf. lib/avatar).
  assert.deepEqual(cadeaux.catalogue().map((c) => [c.seuil, c.id]), [
    [200, 'bilan_proche'], [515, 'chanson'],
    [920, 'coaching_individuel'], [1350, 'badge_or'],
    [1670, 'deux_semaines_proche'], [1730, 'coaching_nutrition'],
    [2500, 'badge_platine'], [3500, 'shooting'], [4000, 'massage'],
  ]);
  assert.ok(cadeaux.catalogue().every((c) => c.seuil <= punchSeuils.PUNCH_MAX_THEORIQUE), 'un cadeau inatteignable serait un mensonge');
});

test('catalogue : badges digitaux, prestations physiques', () => {
  // C'est ce qui décide bon-ou-pas : une erreur ici et un massage s'« activerait ».
  ['badge_or', 'badge_platine']
    .forEach((id) => assert.equal(cadeaux.estPhysique(id), false, id + ' est digital'));
  ['bilan_proche', 'chanson', 'coaching_individuel', 'deux_semaines_proche', 'coaching_nutrition', 'shooting', 'massage']
    .forEach((id) => assert.equal(cadeaux.estPhysique(id), true, id + ' se retire au studio'));
});

// --- Le liseré se DÉDUIT du total ------------------------------------------
test('themeTier : deux paliers or < platine, rien en dessous', () => {
  // ⚠️ Le badge argent a été RETIRÉ : seuilDe('badge_argent') renvoie null, et
  // themeTier doit l'ignorer — sinon `n >= null` (soit n >= 0) donnerait « argent »
  // à tout le monde. Les bornes restantes sont LUES dans punchSeuils.
  assert.equal(cadeaux.seuilDe('badge_argent'), null, 'le badge argent n\'est plus au barème');
  const or = cadeaux.seuilDe('badge_or');
  const platine = cadeaux.seuilDe('badge_platine');
  assert.ok(or < platine, 'les deux paliers restent ordonnés');
  assert.equal(cadeaux.themeTier(0), '', 'plus de palier argent sous l\'or');
  assert.equal(cadeaux.themeTier(or - 1), '');
  assert.equal(cadeaux.themeTier(or), 'or', 'l\'or est le 1er liseré');
  assert.equal(cadeaux.themeTier(platine - 1), 'or');
  assert.equal(cadeaux.themeTier(platine), 'platine', 'le platine au sommet');
  assert.equal(cadeaux.themeTier(4095), 'platine');
});

// --- Les codes : lus à voix haute, retapés à la main -------------------------
test('genererCode : format MC-XXXX-XXXX, sans caractère ambigu', () => {
  for (let i = 0; i < 200; i++) {
    const c = cadeaux.genererCode();
    assert.ok(cadeaux.codeValide(c), `code invalide : ${c}`);
    assert.ok(!/[OIL01]/.test(c), `${c} contient un caractère confondable (O/I/L/0/1)`);
  }
});

test('genererCode : deux bons ne partagent pas un code', () => {
  const vus = new Set();
  for (let i = 0; i < 500; i++) vus.add(cadeaux.genererCode());
  assert.equal(vus.size, 500, 'collision sur 500 tirages : le tirage n\'est pas aléatoire');
});

test('genererCode : tirage UNIFORME (un alphabet biaisé, c\'est de l\'entropie en moins)', () => {
  // 31 ne divise pas 256 : un simple modulo favoriserait les 8 premières lettres
  // d'environ 13 %. On vérifie que l'écart reste dans le bruit d'échantillonnage.
  const n = {};
  for (let i = 0; i < 4000; i++) [...cadeaux.genererCode().replace(/^MC-|-/g, '')].forEach((ch) => { n[ch] = (n[ch] || 0) + 1; });
  const compte = Object.values(n);
  const attendu = 4000 * 8 / 31;
  const ecartMax = Math.max(...compte.map((c) => Math.abs(c - attendu) / attendu));
  assert.equal(Object.keys(n).length, 31, 'tout l\'alphabet doit sortir');
  assert.ok(ecartMax < 0.13, `écart de ${(ecartMax * 100).toFixed(1)} % : le tirage est biaisé`);
});

test('creerBon : une collision de code ne fait JAMAIS perdre un bon', () => {
  // Le piège : INSERT OR IGNORE avale la collision de code comme un doublon de PK
  // -> aucun bon créé, et le client tape sur une carte « Débloqué » qui n'ouvre rien.
  // On force la collision en pré-occupant le code du premier tirage.
  const { engine, db, email } = makeEngine();
  const vrai = cadeaux.genererCode;
  const pris = vrai();          // ce code appartient DÉJÀ à quelqu'un d'autre
  const file = [pris, vrai()];  // le 1er tirage tombera dessus -> collision forcée
  db.prepare("INSERT INTO nutrition_gift_bons (client_email, cadeau, code, statut, created_at) VALUES ('autre@a.fr','massage',?,'a_retirer','')").run(pris);
  cadeaux.genererCode = () => file.shift() || vrai();
  try {
    // Punch posé en SQL (pas addPunch) : assurerCadeaux ne tournera qu'UNE fois.
    // Sinon un 2e passage repêcherait le bon et masquerait le défaut.
    db.prepare('UPDATE user_game_stats SET punch=300 WHERE client_email=?').run(email);
    engine.assurerCadeaux(email);
    const bons = engine.bonsDe(email);
    assert.ok(bons.bilan_proche, 'le bon existe malgré la collision');
    assert.notEqual(bons.bilan_proche.code, pris, 'et il a bien un AUTRE code que celui déjà pris');
  } finally { cadeaux.genererCode = vrai; }
});

// --- Les bons : ce que le Punch pose réellement ------------------------------
test('assurerCadeaux : seuls les cadeaux ATTEINTS et PHYSIQUES donnent un bon', () => {
  const { engine, email } = makeEngine();
  engine.addPunch(email, 800, 'test'); // franchit 200 + 515 (physiques)
  const bons = engine.bonsDe(email);
  assert.deepEqual(Object.keys(bons).sort(), ['bilan_proche', 'chanson'], 'aucun bon pour un digital');
  assert.equal(bons.bilan_proche.statut, 'a_retirer');
  assert.ok(cadeaux.codeValide(bons.bilan_proche.code));
});

test('assurerCadeaux : le massage attend 4000, le shooting 3500', () => {
  const { engine, email } = makeEngine();
  engine.addPunch(email, 3000, 'test'); // physiques ≤ 3000 : 200,515,920,1670,1730 = 5
  assert.deepEqual(Object.keys(engine.bonsDe(email)).sort(),
    ['bilan_proche', 'chanson', 'coaching_individuel', 'coaching_nutrition', 'deux_semaines_proche'].sort(),
    'ni shooting ni massage à 3000');
  assert.ok(!engine.bonsDe(email).massage, 'le massage n\'est pas encore là');
  engine.addPunch(email, 1000, 'test'); // 4000
  assert.ok(engine.bonsDe(email).massage, 'le massage tombe à 4000 pile');
});

test('assurerCadeaux : rejouer ne recrée jamais un bon (même code, même statut)', () => {
  const { engine, db, email } = makeEngine();
  engine.addPunch(email, 1730, 'test'); // physiques ≤ 1730 : 200,515,920,1670,1730 = 5
  const avant = engine.bonsDe(email);
  engine.assurerCadeaux(email); engine.assurerCadeaux(email); // la boutique relance à chaque lecture
  assert.deepEqual(engine.bonsDe(email), avant, 'un bon relu reste LE même bon');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM nutrition_gift_bons WHERE client_email=?').get(email).c, 5);
});

test('assurerCadeaux : un compte déjà chargé en Punch obtient ses bons à la lecture', () => {
  // Le cas des comptes migrés depuis XP+gems : aucun gain à venir, donc aucun
  // onUnlock — sans rattrapage à la lecture, leurs cadeaux resteraient invisibles.
  const { engine, db, email } = makeEngine();
  db.prepare('UPDATE user_game_stats SET punch=1730 WHERE client_email=?').run(email); // pas via addPunch : aucun hook
  assert.deepEqual(engine.bonsDe(email), {}, 'rien tant que la boutique n\'est pas lue');
  engine.assurerCadeaux(email);
  assert.equal(Object.keys(engine.bonsDe(email)).length, 5, 'la lecture rattrape tout');
});

test('le Punch ne descend jamais : un bon reste acquis quoi qu\'il arrive', () => {
  const { engine, db, email } = makeEngine();
  engine.addPunch(email, 1730, 'test');
  engine.addPunch(email, -1730, 'triche'); // refusé par addPunch
  assert.equal(db.prepare('SELECT punch FROM user_game_stats WHERE client_email=?').get(email).punch, 1730);
  assert.ok(engine.bonsDe(email).coaching_nutrition, 'le coaching nutrition (1730) est acquis, définitivement');
});

// --- Le retrait : UNE seule fois --------------------------------------------
test('retirerBon : le premier passage retire, le second est refusé', () => {
  const { engine, email } = makeEngine();
  engine.addPunch(email, 1730, 'test');
  const code = engine.bonsDe(email).coaching_nutrition.code;

  const un = engine.retirerBon(code, 'Quentin');
  assert.equal(un.ok, true);
  assert.equal(un.bon.statut, 'retire');
  assert.equal(un.bon.retire_par, 'Quentin', 'on sait QUI a validé');
  assert.ok(un.bon.retire_at, 'et quand');

  const deux = engine.retirerBon(code, 'Quentin');
  assert.equal(deux.ok, false);
  assert.equal(deux.erreur, 'deja', 'un massage ne se retire pas deux fois');
  assert.equal(engine.bonParCode(code).retire_par, 'Quentin', 'la 2e tentative n\'écrase pas la 1re');
});

test('retirerBon : code inconnu ou vide -> refus net, sans effet de bord', () => {
  const { engine, email } = makeEngine();
  engine.addPunch(email, 1730, 'test');
  assert.equal(engine.retirerBon('MC-ZZZZ-ZZZZ', 'Quentin').erreur, 'inconnu');
  assert.equal(engine.retirerBon('', 'Quentin').erreur, 'inconnu');
  assert.equal(engine.bonsDe(email).coaching_nutrition.statut, 'a_retirer', 'les vrais bons sont intacts');
});

test('retirerBon : la casse et les espaces ne font pas perdre un cadeau', () => {
  // Le code est retapé par un coach au comptoir : « mc-abcd-efgh » doit marcher.
  const { engine, email } = makeEngine();
  engine.addPunch(email, 1730, 'test');
  const code = engine.bonsDe(email).coaching_nutrition.code;
  assert.equal(engine.retirerBon('  ' + code.toLowerCase() + ' ', 'Quentin').ok, true);
});

test('retirerBon : chaque cadeau a SON bon (en retirer un ne retire pas les autres)', () => {
  const { engine, email } = makeEngine();
  engine.addPunch(email, 1730, 'test');
  const bons = engine.bonsDe(email);
  engine.retirerBon(bons.coaching_nutrition.code, 'Quentin');
  const apres = engine.bonsDe(email);
  assert.equal(apres.coaching_nutrition.statut, 'retire');
  assert.equal(apres.deux_semaines_proche.statut, 'a_retirer', 'les autres cadeaux ne sont pas emportés');
});

// --- Les badges : rien à activer, rien à choisir -----------------------------
// Ils ont commencé en SKINS (toute l'app basculait en sombre/doré) : trop intrusif.
// Ce ne sont plus que des liserés autour de la photo, dans le fil. Donc : aucun état
// à stocker, et rien qui puisse dériver entre le compteur et ce que le groupe voit.
test('badge : atteindre 1350 donne le liseré OR — et ne pose AUCUN bon', () => {
  const { engine, email } = makeEngine();
  engine.addPunch(email, 1350, 'test'); // franchit plusieurs physiques + le badge OR (1er liseré)
  assert.equal(cadeaux.themeTier(1350), 'or');
  // Les physiques ≤ 1350 posent leur bon ; le badge (digital) n'en pose aucun.
  assert.deepEqual(Object.keys(engine.bonsDe(email)).sort(),
    ['bilan_proche', 'chanson', 'coaching_individuel'].sort(), 'un badge ne se retire pas au studio');
});

test('badge : il se déduit du Punch, il ne se stocke pas', () => {
  // Le seul moyen de le porter est de l'avoir mérité : aucune colonne à falsifier,
  // aucun choix à forger — le compteur est la seule source.
  const { engine, db, email } = makeEngine();
  db.prepare('UPDATE user_game_stats SET punch=100 WHERE client_email=?').run(email);
  assert.equal(cadeaux.themeTier(db.prepare('SELECT punch FROM user_game_stats WHERE client_email=?').get(email).punch), '',
    'à 100 Punch : aucun liseré');
  engine.addPunch(email, 1250, 'test'); // 1350
  assert.equal(cadeaux.themeTier(1350), 'or');
});

test('badge : relire la boutique ne change RIEN chez le client', () => {
  // assurerCadeaux est rejoué à chaque lecture : il ne doit toucher qu'aux bons.
  const { engine, db, email } = makeEngine();
  engine.addPunch(email, 1350, 'test');
  const avant = db.prepare('SELECT * FROM user_game_stats WHERE client_email=?').get(email);
  engine.assurerCadeaux(email); engine.assurerCadeaux(email);
  const apres = db.prepare('SELECT * FROM user_game_stats WHERE client_email=?').get(email);
  assert.equal(apres.punch, avant.punch, 'le compteur ne bouge pas');
  assert.equal(engine.challengePublicState(email).theme, undefined, 'plus aucun thème n\'est transporté au front');
});

// --- L'état public : ce que le front reçoit ---------------------------------
test('état public : les cadeaux sont NOMMÉS (sinon la célébration dit « Atteint à 1730 Punch »)', () => {
  const { engine, email } = makeEngine();
  engine.addPunch(email, 1730, 'test');
  const st = engine.challengePublicState(email);
  assert.deepEqual(st.cadeaux[1730], { id: 'coaching_nutrition', label: 'Coaching nutrition personnalisé en visio', icon: '🥗' });
  assert.ok(st.unlocks.includes('1730:gift'));
});

test('état public : le nom d\'un cadeau vient de lib/cadeaux, jamais d\'une 2e liste', () => {
  // Le front n'a plus le droit de tenir sa propre table de noms : deux listes
  // finiraient par diverger et le client lirait deux noms pour le même cadeau.
  const { engine, email } = makeEngine();
  engine.addPunch(email, 2295, 'test');
  const st = engine.challengePublicState(email);
  cadeaux.catalogue().forEach((c) => assert.equal(st.cadeaux[c.seuil].label, c.label, c.id + ' : un seul nom possible'));
});

// --- Les récompenses posées sur le Chemin ------------------------------------
// Le Chemin les MATÉRIALISE : les 3 types doivent y être, à leur seuil, avec leur
// état. Rien n'est recalculé ici — c'est punchSeuils mis en forme.
test('Chemin : les 4 types de récompense sont exposés, à leur seuil', () => {
  const { engine, email } = makeEngine();
  engine.pathStatsRow(email);
  const rec = engine.challengePublicState(email).recompenses;
  const parType = rec.reduce((a, r) => { a[r.type] = (a[r.type] || 0) + 1; return a; }, {});
  const punchSeuils = require('../lib/punchSeuils');
  assert.deepEqual(parType, {
    // Une ligne de la table = UNE récompense : plus de lots ni de paliers groupés.
    video: punchSeuils.nbDeType('video'), ebook: punchSeuils.nbDeType('guide'),
    gift: Object.keys(GIFTS).length,
    // 4e type : les accessoires d'avatar (dont les médailles liées aux badges).
    avatar: avatarSeuils().length,
  });
  // Chaque récompense reprend EXACTEMENT un seuil de la config : aucun inventé.
  // ⚠️ On compare des MULTI-ENSEMBLES : deux vidéos peuvent partager un seuil,
  // seul le rang les distingue (cf. cleSeuil) — comparer des seuils nus ferait
  // disparaître les doublons légitimes.
  const attendus = tousLesSeuils().map((s) => s.seuil + ':' + s.type).sort();
  assert.deepEqual(rec.map((r) => r.seuil + ':' + r.type).sort(), attendus);
});

test('Chemin : débloqué / verrouillé se lit sur le TOTAL, avec les Punch restants', () => {
  const { engine, email } = makeEngine();
  engine.addPunch(email, 620, 'test');
  const rec = engine.challengePublicState(email).recompenses;
  const à = (seuil, type) => rec.find((r) => r.seuil === seuil && r.type === type);
  assert.equal(à(200, 'gift').locked, false, '200 est atteint');
  assert.equal(à(515, 'gift').locked, false, 'le seuil sous le total est atteint');
  assert.equal(à(4000, 'gift').locked, true);
  assert.equal(à(4000, 'gift').restant, 3380, 'ce qu\'il reste à faire, en clair');
  assert.equal(à(200, 'gift').restant, 0, 'rien à faire : c\'est acquis');
});

test('Chemin : un compte JAMAIS célébré voit quand même ses récompenses', () => {
  // Le piège : user_unlocks ne dit que ce qui a été CÉLÉBRÉ. Un compte migré depuis
  // XP+gems y est vide alors qu'il a tout mérité -> il verrait tout grisé.
  const { engine, db, email } = makeEngine();
  engine.pathStatsRow(email);
  db.prepare('UPDATE user_game_stats SET punch=4095 WHERE client_email=?').run(email); // aucun addPunch, au max
  const st = engine.challengePublicState(email);
  assert.deepEqual(st.unlocks, [], 'rien n\'a jamais été célébré');
  assert.equal(st.recompenses.every((r) => !r.locked), true, 'et pourtant TOUT est débloqué');
});

test('Chemin : franchir un seuil fait passer sa récompense de verrouillée à débloquée', () => {
  const { engine, email } = makeEngine();
  engine.addPunch(email, 3990, 'test');
  const massage = (e) => e.challengePublicState(email).recompenses.find((r) => r.seuil === 4000 && r.type === 'gift');
  assert.equal(massage(engine).locked, true);
  assert.equal(massage(engine).restant, 10, 'plus que 10 Punch');
  engine.addPunch(email, 10, 'test'); // 4000 pile
  assert.equal(massage(engine).locked, false, 'le marqueur s\'allume');
  assert.equal(massage(engine).restant, 0);
});

test('Chemin : chaque récompense est NOMMÉE et sait où se poser', () => {
  const { engine, email } = makeEngine();
  engine.pathStatsRow(email);
  const rec = engine.challengePublicState(email).recompenses;
  const à = (seuil, type) => rec.find((r) => r.seuil === seuil && r.type === type);
  assert.equal(à(4000, 'gift').label, 'Un massage sportif', 'le nom vient de lib/cadeaux');
  assert.equal(à(4000, 'gift').cadeau, 'massage', 'et l\'id, pour ouvrir la boutique dessus');
  const punchSeuils = require('../lib/punchSeuils');
  assert.equal(à(punchSeuils.seuilGuide(1), 'ebook').label, 'Un nouveau guide', 'une ligne = un guide');
  assert.equal(à(punchSeuils.seuilVideo(1), 'video').label, 'Une nouvelle séance vidéo');
  // `ordre` place le marqueur le long du parcours : borné, et croissant avec le seuil.
  // ⚠️ `ordre` peut valoir 0 : une récompense tombe désormais dès la PREMIÈRE
  // étape (« Commencer », 80 Punch), qui est l'origine de l'échelle.
  rec.forEach((r) => assert.ok(r.ordre >= 0 && r.ordre <= 1, 'ordre hors bornes pour ' + r.seuil));
  assert.ok(à(punchSeuils.seuilGuide(1), 'ebook').ordre < à(4000, 'gift').ordre, 'un seuil plus haut se pose plus loin');
});
