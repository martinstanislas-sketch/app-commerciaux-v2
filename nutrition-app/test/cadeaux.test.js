'use strict';
// La boutique de cadeaux : le dernier maillon du Punch. Ce qui est ATTEINT reste
// acquis (cumul pur), un cadeau physique donne un bon, et ce bon ne se retire
// qu'UNE fois — c'est un massage réel au bout, pas un compteur.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const cadeaux = require('../lib/cadeaux');
const punchSeuils = require('../lib/punchSeuils');
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

test('catalogue : les seuils demandés par Stan, dans l\'ordre', () => {
  // Le tableau de la commande, verrouillé : massage à 2000, remise à 1500.
  assert.deepEqual(cadeaux.catalogue().map((c) => [c.seuil, c.id]), [
    [450, 'theme_dark'], [800, 'ami_semaine'], [1200, 'coaching_1to1'],
    [1350, 'theme_gold'], [1500, 'remise_abo'], [2000, 'massage'],
  ]);
  assert.ok(cadeaux.catalogue().every((c) => c.seuil <= punchSeuils.PUNCH_MAX_THEORIQUE), 'un cadeau inatteignable serait un mensonge');
});

test('catalogue : les thèmes sont digitaux, tout le reste est physique', () => {
  // C'est ce qui décide bon-ou-pas : une erreur ici et un massage s'« activerait ».
  assert.equal(cadeaux.estPhysique('theme_dark'), false);
  assert.equal(cadeaux.estPhysique('theme_gold'), false);
  ['ami_semaine', 'coaching_1to1', 'remise_abo', 'massage'].forEach((id) => assert.equal(cadeaux.estPhysique(id), true, id + ' se retire au studio'));
});

// --- Le thème se DÉDUIT du total -------------------------------------------
test('themeTier : doré prioritaire sur sombre, rien sous 450', () => {
  assert.equal(cadeaux.themeTier(0), '');
  assert.equal(cadeaux.themeTier(449), '');
  assert.equal(cadeaux.themeTier(450), 'dark');
  assert.equal(cadeaux.themeTier(1349), 'dark');
  assert.equal(cadeaux.themeTier(1350), 'gold', 'le doré l\'emporte dès son seuil');
  assert.equal(cadeaux.themeTier(2395), 'gold');
});

test('themeAutorise : le doré n\'enlève pas le droit au sombre', () => {
  assert.equal(cadeaux.themeAutorise(1350, 'dark'), true, 'un palier plus haut ne retire rien');
  assert.equal(cadeaux.themeAutorise(450, 'gold'), false, 'on ne choisit pas ce qu\'on n\'a pas atteint');
  assert.equal(cadeaux.themeAutorise(0, ''), true, 'revenir au thème d\'origine est toujours permis');
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
    db.prepare('UPDATE user_game_stats SET punch=800 WHERE client_email=?').run(email);
    engine.assurerCadeaux(email);
    const bons = engine.bonsDe(email);
    assert.ok(bons.ami_semaine, 'le bon existe malgré la collision');
    assert.notEqual(bons.ami_semaine.code, pris, 'et il a bien un AUTRE code que celui déjà pris');
  } finally { cadeaux.genererCode = vrai; }
});

// --- Les bons : ce que le Punch pose réellement ------------------------------
test('assurerCadeaux : seuls les cadeaux ATTEINTS et PHYSIQUES donnent un bon', () => {
  const { engine, email } = makeEngine();
  engine.addPunch(email, 800, 'test'); // franchit 450 (thème) + 800 (ami)
  const bons = engine.bonsDe(email);
  assert.deepEqual(Object.keys(bons), ['ami_semaine'], 'le thème (digital) ne donne PAS de bon');
  assert.equal(bons.ami_semaine.statut, 'a_retirer');
  assert.ok(cadeaux.codeValide(bons.ami_semaine.code));
});

test('assurerCadeaux : le massage attend 2000, la remise 1500', () => {
  const { engine, email } = makeEngine();
  engine.addPunch(email, 1500, 'test');
  assert.deepEqual(Object.keys(engine.bonsDe(email)).sort(), ['ami_semaine', 'coaching_1to1', 'remise_abo'], 'pas de massage à 1500');
  engine.addPunch(email, 500, 'test'); // 2000
  assert.ok(engine.bonsDe(email).massage, 'le massage tombe à 2000 pile');
});

test('assurerCadeaux : rejouer ne recrée jamais un bon (même code, même statut)', () => {
  const { engine, db, email } = makeEngine();
  engine.addPunch(email, 2000, 'test');
  const avant = engine.bonsDe(email);
  engine.assurerCadeaux(email); engine.assurerCadeaux(email); // la boutique relance à chaque lecture
  assert.deepEqual(engine.bonsDe(email), avant, 'un bon relu reste LE même bon');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM nutrition_gift_bons WHERE client_email=?').get(email).c, 4);
});

test('assurerCadeaux : un compte déjà chargé en Punch obtient ses bons à la lecture', () => {
  // Le cas des comptes migrés depuis XP+gems : aucun gain à venir, donc aucun
  // onUnlock — sans rattrapage à la lecture, leurs cadeaux resteraient invisibles.
  const { engine, db, email } = makeEngine();
  db.prepare('UPDATE user_game_stats SET punch=2000 WHERE client_email=?').run(email); // pas via addPunch : aucun hook
  assert.deepEqual(engine.bonsDe(email), {}, 'rien tant que la boutique n\'est pas lue');
  engine.assurerCadeaux(email);
  assert.equal(Object.keys(engine.bonsDe(email)).length, 4, 'la lecture rattrape tout');
});

test('le Punch ne descend jamais : un bon reste acquis quoi qu\'il arrive', () => {
  const { engine, db, email } = makeEngine();
  engine.addPunch(email, 2000, 'test');
  engine.addPunch(email, -2000, 'triche'); // refusé par addPunch
  assert.equal(db.prepare('SELECT punch FROM user_game_stats WHERE client_email=?').get(email).punch, 2000);
  assert.ok(engine.bonsDe(email).massage, 'le massage est acquis, définitivement');
});

// --- Le retrait : UNE seule fois --------------------------------------------
test('retirerBon : le premier passage retire, le second est refusé', () => {
  const { engine, email } = makeEngine();
  engine.addPunch(email, 2000, 'test');
  const code = engine.bonsDe(email).massage.code;

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
  engine.addPunch(email, 2000, 'test');
  assert.equal(engine.retirerBon('MC-ZZZZ-ZZZZ', 'Quentin').erreur, 'inconnu');
  assert.equal(engine.retirerBon('', 'Quentin').erreur, 'inconnu');
  assert.equal(engine.bonsDe(email).massage.statut, 'a_retirer', 'les vrais bons sont intacts');
});

test('retirerBon : la casse et les espaces ne font pas perdre un cadeau', () => {
  // Le code est retapé par un coach au comptoir : « mc-abcd-efgh » doit marcher.
  const { engine, email } = makeEngine();
  engine.addPunch(email, 2000, 'test');
  const code = engine.bonsDe(email).massage.code;
  assert.equal(engine.retirerBon('  ' + code.toLowerCase() + ' ', 'Quentin').ok, true);
});

test('retirerBon : chaque cadeau a SON bon (retirer le massage ne retire pas la remise)', () => {
  const { engine, email } = makeEngine();
  engine.addPunch(email, 2000, 'test');
  const bons = engine.bonsDe(email);
  engine.retirerBon(bons.massage.code, 'Quentin');
  const apres = engine.bonsDe(email);
  assert.equal(apres.massage.statut, 'retire');
  assert.equal(apres.remise_abo.statut, 'a_retirer', 'les autres cadeaux ne sont pas emportés');
});

// --- Les thèmes : activation directe ----------------------------------------
test('thème : atteindre 450 l\'active tout seul (aucun bon à présenter)', () => {
  const { engine, email } = makeEngine();
  engine.addPunch(email, 450, 'test');
  assert.equal(engine.themeClient(email), 'dark', 'activation directe');
  assert.deepEqual(engine.bonsDe(email), {}, 'un cadeau digital ne se retire pas au studio');
});

test('thème : relire la boutique ne repose JAMAIS le skin dans le dos du client', () => {
  // Le piège : « jamais activé » et « revenu au thème d'origine » valent tous les
  // deux '' — sans mémoire du palier déjà activé, chaque lecture le rappliquerait.
  const { engine, email } = makeEngine();
  engine.addPunch(email, 450, 'test');
  assert.equal(engine.themeClient(email), 'dark', 'activation directe au déblocage');
  engine.choisirTheme(email, ''); // il préfère finalement le thème d'origine
  engine.assurerCadeaux(email); engine.assurerCadeaux(email); // deux passages en boutique
  assert.equal(engine.themeClient(email), '', 'son choix tient');
});

test('thème : un NOUVEAU palier s\'active directement, une seule fois', () => {
  const { engine, email } = makeEngine();
  engine.addPunch(email, 450, 'test');
  engine.choisirTheme(email, '');
  engine.addPunch(email, 900, 'test'); // 1350 -> le doré est un cadeau NEUF : il se montre
  assert.equal(engine.themeClient(email), 'gold', 'activation directe du doré');
  engine.choisirTheme(email, 'dark'); // il repasse au sombre
  engine.assurerCadeaux(email);
  assert.equal(engine.themeClient(email), 'dark', 'le doré ne se réimpose pas ensuite');
});

test('thème : on ne peut pas choisir un thème non atteint', () => {
  const { engine, email } = makeEngine();
  engine.addPunch(email, 450, 'test');
  assert.deepEqual(engine.choisirTheme(email, 'gold'), { ok: false, erreur: 'verrouille' });
  assert.equal(engine.themeClient(email), 'dark', 'le refus ne casse pas le thème en place');
});

test('thème : un skin en base que le Punch ne justifie pas ne s\'affiche pas', () => {
  // Le compteur est la vérité : une valeur douteuse en base ne doit rien accorder.
  const { engine, db, email } = makeEngine();
  db.prepare("UPDATE user_game_stats SET theme_choisi='gold', punch=100 WHERE client_email=?").run(email);
  assert.equal(engine.themeClient(email), '', 'le badge doré se mérite');
});

// --- L'état public : ce que le front reçoit ---------------------------------
test('état public : les cadeaux sont NOMMÉS (sinon la célébration dit « Atteint à 2000 Punch »)', () => {
  const { engine, email } = makeEngine();
  engine.addPunch(email, 2000, 'test');
  const st = engine.challengePublicState(email);
  assert.deepEqual(st.cadeaux[2000], { id: 'massage', label: 'Un massage sportif' });
  assert.equal(st.theme, 'gold');
  assert.ok(st.unlocks.includes('2000:gift'));
});

test('état public : le nom d\'un cadeau vient de lib/cadeaux, jamais d\'une 2e liste', () => {
  // Le front n'a plus le droit de tenir sa propre table de noms : deux listes
  // finiraient par diverger et le client lirait deux noms pour le même cadeau.
  const { engine, email } = makeEngine();
  engine.addPunch(email, 2000, 'test');
  const st = engine.challengePublicState(email);
  cadeaux.catalogue().forEach((c) => assert.equal(st.cadeaux[c.seuil].label, c.label, c.id + ' : un seul nom possible'));
});
