// ============================================================================
//  E2E NAVIGATEUR — My Coach Academy multi-formation (lot 5, dernière tranche).
//
//  CE QUI EST DÉMONTRÉ DANS UN VRAI NAVIGATEUR : deux formations coexistent
//  dans /academy sans jamais se mélanger. On passe de l'une à l'autre et on
//  vérifie, à chaque bascule, que RIEN de la précédente ne reste à l'écran.
//
//  ⚠️ LA FORMATION B EST UNE FIXTURE, posée par ses seules DONNÉES : une ligne
//  de catalogue, deux modules, deux vidéos, trois questions. Aucune ligne de
//  moteur ni de front n'a été écrite pour elle — c'est précisément ce que ce
//  fichier doit prouver. Elle n'est jamais amorcée en production.
//
//  Hors `npm test` :
//    NUTRITION_DB=/tmp/e2e.sqlite ADMIN_EMAIL=patron@exemple.fr PORT=3222 node server.js &
//    BASE=http://127.0.0.1:3222 node test/e2e/academy-multiformation-navigateur.js
// ============================================================================
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:3222';
const ADMIN = 'patron@exemple.fr';
const THEO = 'theo.mf@exemple.fr';
const EVA = 'eva.mf@exemple.fr';
const A = 'coach_nutrition';
const B = 'formation_test_b';
const erreurs = [];
const local = (url) => url.startsWith(BASE);

const jsonp = (r, b, m, t) => fetch(BASE + r, {
  method: m || 'POST',
  headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
  body: b ? JSON.stringify(b) : undefined,
}).then((x) => x.json());

async function semer() {
  for (const [email, prenom, pin] of [[ADMIN, 'Stan', '7777'], [THEO, 'Théo', '4004'], [EVA, 'Eva', '3003']]) {
    await jsonp('/account/login', { email, prenom, pin });
  }
  const t = (await jsonp('/account/login', { email: ADMIN, pin: '7777' })).token;
  for (const e of [THEO, EVA]) {
    await jsonp('/api/boost/admin/collaborateurs', { email: e, role: 'collaborateur' }, 'POST', t);
  }
  await jsonp('/api/academy/admin/evaluateurs', { email: EVA }, 'POST', t);
  return t;
}

(async () => {
  const jetonAdmin = await semer();

  // ---- LA FIXTURE : une formation entière, par ses seules DONNÉES ---------
  //
  //  On écrit dans LA MÊME base que le serveur, en SQL direct : c'est
  //  exactement ce qu'on demandera demain pour poser une vraie formation —
  //  une ligne de catalogue, des modules, des contenus, des questions. Aucune
  //  ligne de moteur ni de front n'est écrite pour elle.
  //
  //  ⚠️ On ne charge PAS server.js ici : le processus de test ouvrirait sa
  //  propre connexion sur un autre fichier. NUTRITION_DB est passé par le
  //  lanceur, comme pour le serveur.
  const Database = require('better-sqlite3');
  const db = new Database(process.env.NUTRITION_DB, { timeout: 5000 });
  const maintenant = new Date().toISOString();
  db.prepare(`INSERT OR REPLACE INTO academy_formations
      (cle, libelle, titre_certifie, ordre, actif, qcm_nb_questions, qcm_seuil_pct,
       pratique_obligatoire, certification_active, reflet_boost, cree_le, maj_le)
      VALUES (?,?,NULL,2,1,3,60,0,0,0,?,?)`).run(B, 'Formation de test B', maintenant, maintenant);

  const idModule = (cle) => db.prepare('SELECT id FROM academy_modules WHERE cle = ?').get(cle).id;
  db.transaction(() => {
    for (const [cle, titre, ordre] of [['b-m1', 'Module B1', 1], ['b-m2', 'Module B2', 2]]) {
      db.prepare(`INSERT OR IGNORE INTO academy_modules (formation, titre, description, ordre, actif, cle, cree_le, maj_le)
                  VALUES (?,?,?,?,1,?,?,?)`)
        .run(B, titre, 'Module de la formation de test.', ordre, cle, maintenant, maintenant);
    }
    [['b-c1', 'b-m1', 'Vidéo B — première', 'BBBBbbbb001', 4],
     ['b-c2', 'b-m2', 'Vidéo B — seconde', 'BBBBbbbb002', 6]].forEach(([cle, mod, titre, yt, duree], i) => {
      db.prepare(`INSERT OR IGNORE INTO academy_contenus (module_id, type, titre, youtube_id, duree_min, ordre, actif, cle, cree_le, maj_le)
                  VALUES (?,'video',?,?,?,?,1,?,?,?)`)
        .run(idModule(mod), titre, yt, duree, i + 1, cle, maintenant, maintenant);
    });
    [['b-q1', 'Question B numéro un ?'], ['b-q2', 'Question B numéro deux ?'],
     ['b-q3', 'Question B numéro trois ?']].forEach(([cle, enonce], iq) => {
      db.prepare(`INSERT OR IGNORE INTO academy_questions (formation, module_id, enonce, actif, ordre, cle, cree_le, maj_le)
                  VALUES (?,?,?,1,?,?,?,?)`)
        .run(B, idModule('b-m1'), enonce, iq + 1, cle, maintenant, maintenant);
      const qid = db.prepare('SELECT id FROM academy_questions WHERE cle = ?').get(cle).id;
      [['Réponse B juste', 1], ['Réponse B fausse', 0]].forEach(([texte, correct], j) => {
        db.prepare(`INSERT OR IGNORE INTO academy_choix (question_id, texte, correct, actif, ordre, cle, cree_le, maj_le)
                    VALUES (?,?,?,1,?,?,?,?)`)
          .run(qid, texte, correct, j + 1, `${cle}-c${j + 1}`, maintenant, maintenant);
      });
    });
  })();
  db.close();

  const nav = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const page = await nav.newPage({ viewport: { width: 1100, height: 1000 } });
  page.setDefaultTimeout(8000);
  page.on('pageerror', (e) => erreurs.push('PAGE ERROR: ' + e.message));
  page.on('requestfailed', (r) => { if (local(r.url())) erreurs.push('REQUETE KO: ' + r.url().slice(0, 90)); });
  const reponsesKo = [];
  page.on('response', (r) => {
    if (local(r.url()) && r.status() >= 400) {
      reponsesKo.push(r.request().method() + ' ' + new URL(r.url()).pathname + ' -> ' + r.status());
    }
  });

  const etape = async (nom, fn) => {
    try { await fn(); console.log('  ✓ ' + nom); }
    catch (e) { console.log('  ✗ ' + nom + ' — ' + e.message); erreurs.push(nom + ' : ' + e.message); }
  };
  const contenu = () => page.evaluate(() =>
    [...document.querySelectorAll('main > section, main > p')].filter((s) => !s.hidden)
      .map((s) => s.textContent).join('\n'));

  async function seConnecter(email, pin, attendu) {
    await page.goto(BASE + '/academy', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.removeItem('mc-academy-session'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#acLogin:not([hidden])');
    await page.fill('#acEmail', email);
    await page.fill('#acPin', pin);
    await page.click('#acGo');
    await page.waitForSelector((attendu || '#acSommaire') + ':not([hidden])');
  }

  const choisir = async (cle, libelle) => {
    await page.locator('#acSommaire .ac-sel-b', { hasText: libelle }).click();
    await page.waitForFunction((l) => {
      const on = document.querySelector('#acSommaire .ac-sel-b.on');
      return on && on.textContent.trim() === l;
    }, libelle);
  };

  // =========================================================================
  //  1. LE CATALOGUE
  // =========================================================================
  console.log('\n1. CATALOGUE');

  await etape('les deux formations apparaissent, sans avoir touché au front', async () => {
    await seConnecter(THEO, '4004');
    const boutons = await page.locator('#acSommaire .ac-sel-b').allInnerTexts();
    if (boutons.length !== 2) throw new Error('formations proposées : ' + boutons.join(' | '));
    if (!boutons.includes('Coach Nutrition')) throw new Error('A absente : ' + boutons.join(' | '));
    if (!boutons.includes('Formation de test B')) throw new Error('B absente : ' + boutons.join(' | '));
  });

  await etape('la formation A est ouverte par défaut, avec SON nom', async () => {
    const t = await contenu();
    if (!/Coach Nutrition/.test(t)) throw new Error('le nom de A manque');
    if (!/Module 1 — Les fondamentaux/.test(t)) throw new Error('les modules de A manquent');
    if (/Module B1|Vidéo B/.test(t)) throw new Error('des données de B sont visibles dans A');
  });

  // =========================================================================
  //  2. PROGRESSION DE A
  // =========================================================================
  console.log('\n2. FORMATION A');

  await etape('on avance dans A : un contenu terminé', async () => {
    await page.locator('.ac-l').first().click();
    await page.waitForSelector('#acLecteur:not([hidden])');
    await page.click('#acFait');
    await page.waitForSelector('.ac-deja');
    await page.click('#acBack');
    await page.waitForSelector('#acSommaire:not([hidden])');
    if (!/20 %/.test(await contenu())) throw new Error('A devrait être à 20 %');
  });

  await etape('A montre sa pratique et sa certification (drapeaux à OUI)', async () => {
    const t = await contenu();
    if (!/Évaluation pratique — Coach Nutrition/.test(t)) throw new Error('la carte pratique de A manque');
    if (!/Certification — Coach Nutrition/.test(t)) throw new Error('la carte certification de A manque');
  });

  // =========================================================================
  //  3. BASCULE VERS B
  // =========================================================================
  console.log('\n3. BASCULE VERS B');

  await etape('on sélectionne B : TOUT ce qui appartenait à A disparaît', async () => {
    await choisir(B, 'Formation de test B');
    const t = await contenu();
    if (!/Formation de test B/.test(t)) throw new Error('le nom de B manque');
    if (/Module 1 — Les fondamentaux|Module 2 — Conduire/.test(t)) throw new Error('LES MODULES DE A SONT RESTÉS');
    if (/rôle du Coach Nutrition|cadre bienveillant/.test(t)) throw new Error('LES VIDÉOS DE A SONT RESTÉES');
    if (/20 %/.test(t)) throw new Error('LA PROGRESSION DE A EST RESTÉE');
  });

  await etape('B affiche SES modules et SES vidéos', async () => {
    const modules = await page.locator('.ac-mod-t').allInnerTexts();
    if (modules.join('|') !== 'Module B1|Module B2') throw new Error('modules : ' + modules.join(' | '));
    const titres = await page.locator('.ac-l-t').allInnerTexts();
    if (titres.length !== 2) throw new Error('contenus de B : ' + titres.length);
    if (!titres.some((x) => /Vidéo B/.test(x))) throw new Error('vidéos : ' + titres.join(' | '));
  });

  await etape('sa progression repart de zéro, indépendamment de A', async () => {
    if (!/0 %/.test(await contenu())) throw new Error('B devrait être à 0 %');
  });

  await etape('B N\'AFFICHE NI PRATIQUE NI CERTIFICATION (drapeaux à NON)', async () => {
    const t = await contenu();
    if (/Évaluation pratique/.test(t)) throw new Error('une carte pratique s\'affiche pour une formation qui n\'en demande pas');
    if (/Certification —/.test(t)) throw new Error('une carte certification s\'affiche pour une formation qui n\'en délivre pas');
  });

  // =========================================================================
  //  4. LE QCM DE B
  // =========================================================================
  console.log('\n4. QCM DE B');

  await etape('on termine les contenus de B et son QCM s\'ouvre', async () => {
    for (let i = 0; i < 2; i++) {
      await page.locator('.ac-l').nth(i).click();
      await page.waitForSelector('#acLecteur:not([hidden])');
      if (await page.locator('#acFait').count()) { await page.click('#acFait'); await page.waitForSelector('.ac-deja'); }
      await page.click('#acBack');
      await page.waitForSelector('#acSommaire:not([hidden])');
    }
    const t = await contenu();
    if (!/100 %/.test(t)) throw new Error('B devrait être à 100 %');
    if (!/Formation terminée — QCM disponible/.test(t)) throw new Error('le QCM de B ne s\'ouvre pas');
    if (!/3 questions tirées au hasard · seuil de réussite : 60 %/.test(t)) {
      throw new Error('les réglages de B ne sont pas ceux annoncés : ' + (t.match(/\d+ questions[^.]*/) || ['—'])[0]);
    }
  });

  await etape('le QCM de B ne tire QUE ses propres questions', async () => {
    await page.click('#acQcmGo');
    await page.waitForSelector('#acQcm:not([hidden])');
    const n = await page.locator('.ac-q-dot').count();
    if (n !== 3) throw new Error('questions tirées : ' + n);
    for (let i = 0; i < n; i++) {
      await page.locator('.ac-q-dot').nth(i).click();
      await page.waitForFunction((k) => document.querySelector('.ac-q-num').textContent.includes('/ 3'), i);
      const e = (await page.locator('.ac-q-enonce').evaluate((el) => el.textContent)).trim();
      if (!/^Question B/.test(e)) throw new Error('UNE QUESTION DE A A FUI DANS LE TIRAGE DE B : ' + e);
    }
  });

  await etape('le seuil de B (60 %) est réellement appliqué', async () => {
    // 2 bonnes sur 3 = 67 % : passe le seuil de B, aurait échoué à celui de A.
    for (let i = 0; i < 3; i++) {
      await page.locator('.ac-q-dot').nth(i).click();
      await page.waitForFunction(() => document.querySelector('.ac-q-enonce'));
      const cible = i < 2 ? 'Réponse B juste' : 'Réponse B fausse';
      const textes = (await page.locator('#acQcm .ac-choix').allInnerTexts()).map((x) => x.trim());
      await page.locator('#acQcm .ac-choix').nth(textes.indexOf(cible)).click();
      await page.waitForFunction((k) => document.querySelectorAll('#acQcm .ac-choix-on').length === 1, i);
    }
    await page.click('#acQFin');
    await page.waitForSelector('.ac-res-score');
    const t = await contenu();
    if (!/Score : 67 %/.test(t)) throw new Error('score : ' + (await page.innerText('.ac-res-score')));
    if (!/seuil de réussite : 60 %/.test(t)) throw new Error('le seuil affiché n\'est pas celui de B');
    if (!/Formation théorique validée/.test(t)) throw new Error('67 % devrait passer le seuil de B');
  });

  // =========================================================================
  //  5. RETOUR À A
  // =========================================================================
  console.log('\n5. RETOUR À A');

  await etape('A a gardé son état, et n\'a rien reçu de B', async () => {
    await page.click('#acQBack');
    await page.waitForSelector('#acSommaire:not([hidden])');
    await choisir(A, 'Coach Nutrition');
    const t = await contenu();
    if (!/20 %/.test(t)) throw new Error('la progression de A a bougé : ' + (t.match(/\d+ %/) || ['—'])[0]);
    if (!/Formation en cours/.test(t)) throw new Error('le QCM de A devrait rester verrouillé');
    if (/Théorie validée/.test(t)) throw new Error('LA VALIDATION THÉORIQUE DE B A CONTAMINÉ A');
    if (/Module B1|Vidéo B|Question B/.test(t)) throw new Error('des données de B sont visibles dans A');
    if (!/Module 1 — Les fondamentaux/.test(t)) throw new Error('les modules de A ont disparu');
  });

  await etape('et B a gardé le sien', async () => {
    await choisir(B, 'Formation de test B');
    const t = await contenu();
    if (!/100 %/.test(t)) throw new Error('la progression de B a été perdue');
    if (!/Théorie validée/.test(t)) throw new Error('la validation théorique de B a été perdue');
    if (/Évaluation pratique|Certification —/.test(t)) throw new Error('B affiche une étape qu\'elle ne demande pas');
  });

  // =========================================================================
  //  6. ÉVALUATEUR ET ADMIN
  // =========================================================================
  console.log('\n6. ÉVALUATEUR / ADMIN');

  await etape('l\'évaluateur lit POUR QUELLE formation il évalue', async () => {
    await seConnecter(EVA, '3003');
    await page.click('#acEvalGo');
    await page.waitForSelector('#acEval:not([hidden])');
    const t = await contenu();
    if (!/Coach Nutrition/.test(t)) throw new Error('la formation concernée n\'est pas annoncée');
    if (!(await page.locator('#acEval .ac-sel-b').count())) throw new Error('aucun sélecteur de formation');
    // B ne demande pas de pratique : personne n'y est évaluable.
    await page.locator('#acEval .ac-sel-b', { hasText: 'Formation de test B' }).click();
    await page.waitForFunction(() => /Formation de test B/.test(document.querySelector('#acEval').textContent));
    if (!/Aucun collaborateur/.test(await contenu())) throw new Error('B ne devrait proposer personne à évaluer');
  });

  await etape('l\'administrateur lit POUR QUELLE formation il certifie', async () => {
    await seConnecter(ADMIN, '7777', '#acAdmin');
    await page.click('.ac-adm-ong[data-onglet="certifications"]');
    await page.waitForFunction(() => /Éligibles \(/.test(document.querySelector('#acAdmin').textContent));
    if (!/Certifications de/.test(await contenu())) throw new Error('la formation concernée n\'est pas annoncée');
    await page.locator('#acAdmin .ac-sel-b', { hasText: 'Formation de test B' }).click();
    await page.waitForFunction(() => /Formation de test B/.test(document.querySelector('#acAdmin').textContent));
    const t = await contenu();
    if (!/Éligibles \(0\)/.test(t) || !/Certifiés \(0\)/.test(t)) {
      throw new Error('une formation sans certification ne délivre rien : ' + (t.match(/Éligibles \(\d+\)/) || ['—'])[0]);
    }
  });

  // =========================================================================
  //  7. MOBILE 390 PX
  // =========================================================================
  console.log('\n7. MOBILE 390 px');

  await etape('le parcours complet tient en 390 px, bascule comprise', async () => {
    await seConnecter(THEO, '4004');
    await page.setViewportSize({ width: 390, height: 900 });
    await page.waitForTimeout(300);
    const debord = async (ou) => {
      const d = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (d > 2) throw new Error('débordement de ' + d + ' px : ' + ou);
    };
    await debord('sommaire A');
    const b = await page.locator('#acSommaire .ac-sel-b').first().boundingBox();
    if (!b || b.height < 34) throw new Error('sélecteur trop petit au doigt');

    await choisir(B, 'Formation de test B');
    await debord('sommaire B');
    await page.locator('.ac-l').first().click();
    await page.waitForSelector('#acLecteur:not([hidden])');
    await debord('lecteur B');
    await page.click('#acBack');
    await page.waitForSelector('#acSommaire:not([hidden])');
    await choisir(A, 'Coach Nutrition');
    await debord('retour A');
    await page.setViewportSize({ width: 1100, height: 1000 });
  });

  await etape('aucune requête locale n\'a échoué', async () => {
    if (reponsesKo.length) throw new Error('requêtes en échec : ' + [...new Set(reponsesKo)].join(', '));
  });

  const OUT = process.env.OUT || '.';
  try {
    await page.goto(BASE + '/academy', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#acSommaire:not([hidden])', { timeout: 4000 });
    await page.screenshot({ path: OUT + '/academy-multiformation.png', fullPage: true });
  } catch (_) { /* la capture ne doit jamais faire échouer la suite */ }
  await nav.close();

  console.log('\n' + '='.repeat(60));
  if (erreurs.length) {
    console.log('ÉCHECS (' + erreurs.length + ') :');
    [...new Set(erreurs)].forEach((e) => console.log('  - ' + e));
    process.exit(1);
  }
  console.log('ACADEMY — MULTI-FORMATION : tout est passé, aucune erreur console.');
})();
