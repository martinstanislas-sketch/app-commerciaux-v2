// ============================================================================
//  E2E NAVIGATEUR — espace Coach Nutrition « Mes clients ».
//
//  Ce que les tests Node ne disent pas : que la page s'affiche, que la carte
//  d'un client est réellement cliquable, que la fiche s'ouvre, et surtout que
//  les trois portes (client, collaborateur non certifié, coach certifié)
//  mènent bien à trois écrans différents et lisibles.
//
//  Hors `npm test`, comme les autres e2e :
//    npm install --no-save playwright
//    NUTRITION_DB=/tmp/e2e.sqlite ADMIN_EMAIL=patron@exemple.fr PORT=3222 node server.js &
//    BASE=http://127.0.0.1:3222 node test/e2e/boost-coach-navigateur.js
// ============================================================================
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:3222';
const ADMIN = 'patron@exemple.fr';
const COACH_A = 'quentin.ec@exemple.fr';
const COACH_B = 'sophie.ec@exemple.fr';
const COLLAB = 'theo.ec@exemple.fr';
const CLI1 = 'lea.ec@exemple.fr';       // à démarrer
const CLI2 = 'marc.ec@exemple.fr';      // en cours
const CLI3 = 'nora.ec@exemple.fr';      // interrompu
const CLI_B = 'hugo.ec@exemple.fr';     // client du confrère
const erreurs = [];

const jsonp = (r, b, m, t) => fetch(BASE + r, {
  method: m || 'POST',
  headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
  body: b ? JSON.stringify(b) : undefined,
}).then((x) => x.json());

const jour = (d) => { const x = new Date(); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };

async function semer() {
  const comptes = [[ADMIN, 'Patron', '7777'], [COACH_A, 'Quentin', '2002'], [COACH_B, 'Sophie', '3003'],
    [COLLAB, 'Théo', '4004'], [CLI1, 'Léa', '1001'], [CLI2, 'Marc', '5005'], [CLI3, 'Nora', '6006'], [CLI_B, 'Hugo', '9009']];
  for (const [email, prenom, pin] of comptes) await jsonp('/account/login', { email, prenom, pin });
  const t = (await jsonp('/account/login', { email: ADMIN, pin: '7777' })).token;

  for (const e of [COACH_A, COACH_B, COLLAB]) await jsonp('/api/boost/admin/collaborateurs', { email: e, role: 'collaborateur' }, 'POST', t);
  for (const e of [COACH_A, COACH_B]) {
    await jsonp('/api/boost/admin/certification/' + encodeURIComponent(e),
      { statut: 'certifie', evaluateur: 'Stan Martin', dateCertification: '2026-07-15', scoreQcm: 88, resultatPratique: 'valide' }, 'PUT', t);
  }
  await jsonp('/api/boost/admin/certification/' + encodeURIComponent(COLLAB),
    { statut: 'en_cours', evaluateur: 'Stan Martin', scoreQcm: 61 }, 'PUT', t);

  const ids = {};
  for (const [cli, coach] of [[CLI1, COACH_A], [CLI2, COACH_A], [CLI3, COACH_A], [CLI_B, COACH_B]]) {
    const r = await jsonp('/api/boost/admin/dossiers', { clientEmail: cli, coachEmail: coach }, 'POST', t);
    ids[cli] = r.boost && r.boost.id;
  }
  // Trois situations distinctes chez le même coach, sinon l'écran n'a rien à
  // trier : Léa reste « à démarrer », Marc passe « en cours » (Étape 1 validée
  // par le coach lui-même, via sa vraie route), Nora est interrompue.
  const tCoach = (await jsonp('/account/login', { email: COACH_A, pin: '2002' })).token;
  await jsonp('/api/boost/coach/dossiers/' + ids[CLI2] + '/etapes/1/valider', {}, 'POST', tCoach);
  await jsonp('/api/boost/admin/dossiers/' + ids[CLI3] + '/interruption',
    { motif: 'Déménagement, accompagnement arrêté d\'un commun accord.' }, 'POST', t);
  return { t, ids };
}

(async () => {
  const { t: jetonAdmin, ids } = await semer();

  const nav = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const page = await nav.newPage({ viewport: { width: 1100, height: 900 } });
  page.setDefaultTimeout(5000);
  page.on('pageerror', (e) => erreurs.push('PAGE ERROR: ' + e.message));
  page.on('requestfailed', (r) => erreurs.push('REQUETE KO: ' + r.url().slice(0, 90)));
  const reponsesKo = [];
  page.on('response', (r) => { if (r.status() >= 400) reponsesKo.push(r.request().method() + ' ' + new URL(r.url()).pathname + ' -> ' + r.status()); });

  const etape = async (nom, fn) => {
    try { await fn(); console.log('  ✓ ' + nom); }
    catch (e) { console.log('  ✗ ' + nom + ' — ' + e.message); erreurs.push(nom + ' : ' + e.message); }
  };
  const corps = () => page.innerText('body');
  // innerText applique text-transform : les intitulés de la fiche, mis en
  // majuscules par le CSS, en ressortent « STATUT ». Pour vérifier le CONTENU
  // on lit textContent, qui rend ce que le code a produit.
  const contenu = () => page.evaluate(() => document.body.textContent);

  // Connexion par l'écran de la page Coach elle-même.
  async function seConnecter(email, pin) {
    await page.goto(BASE + '/coach', { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.removeItem('mc-coach-session'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#ecLogin:not([hidden])');
    await page.fill('#ecEmail', email);
    await page.fill('#ecPin', pin);
    await page.click('#ecGo');
  }

  await etape('la page /coach s\'ouvre sur un écran de connexion', async () => {
    await page.goto(BASE + '/coach', { waitUntil: 'networkidle' });
    await page.waitForSelector('#ecLogin:not([hidden])');
    const t = await corps();
    if (!/Espace Coach Nutrition/.test(t)) throw new Error('titre absent');
    // L'app client ne doit pas s'inviter ici.
    const scripts = await page.evaluate(() => [...document.scripts].map((s) => s.src));
    if (scripts.some((s) => /app\.js/.test(s))) throw new Error('app.js chargé sur la page Coach');
    // Rien qui suppose une session : ni nom, ni déconnexion.
    if (await page.locator('#ecMe').isVisible()) throw new Error('le bandeau de session s\'affiche sans session');
    for (const id of ['#ecBloc', '#ecListe', '#ecFiche']) {
      if (await page.locator(id).isVisible()) throw new Error(id + ' ne devrait pas être visible');
    }
  });

  await etape('un code erroné est refusé, avec le message du serveur', async () => {
    await page.fill('#ecEmail', COACH_A);
    await page.fill('#ecPin', '0000');
    await page.click('#ecGo');
    await page.waitForFunction(() => document.querySelector('#ecErr').textContent.length > 0);
    if (!/incorrect/i.test(await page.innerText('#ecErr'))) throw new Error('message inattendu : ' + await page.innerText('#ecErr'));
  });

  await etape('un client normal est renvoyé vers son espace, pas vers les dossiers', async () => {
    await seConnecter(CLI1, '1001');
    await page.waitForSelector('#ecBloc:not([hidden])');
    const t = await corps();
    if (!/Espace réservé aux Coachs Nutrition/.test(t)) throw new Error('message inattendu');
    if (/Mes clients/.test(t)) throw new Error('un client ne doit pas voir la liste');
    // Et aucun dossier n'a été chargé au passage.
    if (/lea\.ec@|marc\.ec@/.test(t)) throw new Error('des données de dossier ont fuité');
  });

  await etape('un collaborateur non certifié voit l\'espace, mais aucun dossier', async () => {
    await seConnecter(COLLAB, '4004');
    await page.waitForSelector('#ecBloc:not([hidden])');
    const t = await corps();
    if (!/certification Coach Nutrition n'est pas encore validée/.test(t)) throw new Error('message attendu absent');
    if (!/En cours de validation/.test(t)) throw new Error('le statut de sa certification devrait être dit');
    if (/Mes clients/.test(t)) throw new Error('aucune liste ne doit apparaître');
  });

  await etape('un coach certifié arrive directement sur « Mes clients »', async () => {
    await seConnecter(COACH_A, '2002');
    await page.waitForSelector('#ecListe:not([hidden])');
    const t = await corps();
    if (!/Mes clients/.test(t)) throw new Error('titre absent');
    if (!/Tes suivis Boost Nutrition/.test(t)) throw new Error('sous-titre absent');
    if (!/Quentin/.test(t)) throw new Error('le coach connecté n\'est pas nommé');
  });

  await etape('la vue principale ne montre que les suivis actifs', async () => {
    const cartes = await page.locator('#ecActifs .ec-cli').count();
    if (cartes !== 2) throw new Error('2 suivis actifs attendus, vus : ' + cartes);
    const visible = await page.innerText('#ecActifs');
    if (/Nora/.test(visible)) throw new Error('un dossier interrompu encombre la vue principale');
    // Le dossier clos est là, mais replié.
    if (!/Anciens suivis \(1\)/.test(await corps())) throw new Error('la section « Anciens suivis » manque');
    if (await page.locator('#ecAnciens').isVisible()) throw new Error('les anciens suivis devraient être repliés');
  });

  await etape('l\'ordre met « À démarrer » avant « En cours »', async () => {
    const noms = await page.locator('#ecActifs .ec-cli-nom').allInnerTexts();
    if (noms[0] !== 'Léa') throw new Error('ordre inattendu : ' + noms.join(', '));
    const badges = await page.locator('#ecActifs .ec-badge').allInnerTexts();
    if (badges[0] !== 'À démarrer' || badges[1] !== 'En cours') throw new Error('badges : ' + badges.join(', '));
  });

  await etape('les anciens suivis se déplient à la demande', async () => {
    await page.click('#ecAnciensB');
    await page.waitForSelector('#ecAnciens:not([hidden])');
    const t = await page.innerText('#ecAnciens');
    if (!/Nora/.test(t)) throw new Error('le dossier clos devrait apparaître');
    if (!/Interrompu/.test(t)) throw new Error('son statut devrait être dit');
    await page.click('#ecAnciensB');
  });

  await etape('la carte ne montre rien d\'inventé', async () => {
    const t = await page.innerText('#ecActifs');
    if (/undefined|NaN|\[object Object\]/.test(t)) throw new Error('trou dans le rendu : ' + t.slice(0, 120));
    // Ni action en cours, ni compteur de repas : ces données n'existent pas encore.
    if (/[Aa]ction en cours|repas depuis/.test(t)) throw new Error('une donnée inexistante est affichée');
    if (/Étape 0\/12/.test(t) === false) throw new Error('l\'Étape du client pas encore démarré manque');
  });

  await etape('cliquer sur un client ouvre sa fiche', async () => {
    // On vise le client par son nom, pas par sa position : un changement d'ordre
    // ne doit pas faire tester silencieusement un autre dossier.
    await page.locator('#ecActifs .ec-cli', { hasText: 'Marc' }).click();
    await page.waitForSelector('#ecFiche:not([hidden])');
    const t = await contenu();
    for (const attendu of ['Marc', 'Étape', 'Statut', 'Début', 'Date limite']) {
      if (!t.includes(attendu)) throw new Error('bloc absent de la fiche : ' + attendu);
    }
    if (!/Le contenu de l'Étape 2 sera disponible dans la prochaine brique/.test(t)) {
      throw new Error('la zone de rendez-vous ne dit pas ce qui vient');
    }
    if (/undefined|NaN/.test(t)) throw new Error('trou dans la fiche');
  });

  await etape('l\'historique se déplie depuis la fiche', async () => {
    await page.click('#ecHistB');
    await page.waitForSelector('#ecHist ol');
    const t = await page.innerText('#ecHist');
    if (!/Boost créé/.test(t)) throw new Error('création absente');
    if (!/Coach Nutrition attribué/.test(t)) throw new Error('attribution absente');
    await page.click('#ecHistB');
    if (await page.locator('#ecHist').isVisible()) throw new Error('le bouton devrait refermer l\'historique');
  });

  await etape('on revient à la liste sans rechargement', async () => {
    await page.click('#ecBack');
    await page.waitForSelector('#ecListe:not([hidden])');
    if (await page.locator('#ecFiche').isVisible()) throw new Error('la fiche devrait être masquée');
  });

  await etape('le dossier d\'un confrère reste inatteignable depuis le navigateur', async () => {
    // Appel direct à l'API, avec le jeton du coach A, sur le dossier du coach B.
    const r = await page.evaluate(async (id) => {
      const s = JSON.parse(localStorage.getItem('mc-coach-session'));
      const res = await fetch('/api/boost/coach/dossiers/' + id, { headers: { Authorization: 'Bearer ' + s.token } });
      return { status: res.status, texte: await res.text() };
    }, ids[CLI_B]);
    if (r.status !== 404) throw new Error('statut attendu 404, reçu ' + r.status);
    if (r.texte.includes('hugo')) throw new Error('le refus laisse fuiter le dossier');
  });

  await etape('retirer la certification ferme l\'accès au rechargement suivant', async () => {
    await jsonp('/api/boost/admin/certification/' + encodeURIComponent(COACH_A),
      { statut: 'suspendu', evaluateur: 'Stan Martin' }, 'PUT', jetonAdmin);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#ecBloc:not([hidden])');
    const t = await corps();
    if (!/n'est pas encore validée/.test(t)) throw new Error('l\'écran d\'attente devrait s\'afficher');
    if (/Mes clients|Marc|Léa/.test(t)) throw new Error('des dossiers restent visibles après retrait');

    await jsonp('/api/boost/admin/certification/' + encodeURIComponent(COACH_A),
      { statut: 'certifie', evaluateur: 'Stan Martin', dateCertification: '2026-07-15', scoreQcm: 88, resultatPratique: 'valide' }, 'PUT', jetonAdmin);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#ecListe:not([hidden])');
  });

  await etape('un coach ne voit pas les clients de son confrère', async () => {
    await seConnecter(COACH_B, '3003');
    await page.waitForSelector('#ecListe:not([hidden])');
    const t = await corps();
    if (!/Hugo/.test(t)) throw new Error('Sophie devrait voir son client');
    if (/Léa|Marc|Nora/.test(t)) throw new Error('les clients de Quentin ne doivent pas apparaître');
    const n = await page.locator('.ec-cli').count();
    if (n !== 1) throw new Error('1 dossier attendu, vus : ' + n);
  });

  await etape('la déconnexion ramène à l\'écran de connexion', async () => {
    await page.click('#ecOut');
    await page.waitForSelector('#ecLogin:not([hidden])');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#ecLogin:not([hidden])');
    if (/Mes clients/.test(await corps())) throw new Error('la session survit à la déconnexion');
  });

  await etape('affichage mobile : la liste reste lisible en 390 px', async () => {
    await seConnecter(COACH_A, '2002');
    await page.waitForSelector('#ecListe:not([hidden])');
    await page.setViewportSize({ width: 390, height: 800 });
    await page.waitForTimeout(300);
    const debord = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (debord > 2) throw new Error('débordement horizontal de ' + debord + ' px');
    const box = await page.locator('.ec-cli').first().boundingBox();
    if (!box || box.height < 70) throw new Error('carte effondrée en mobile');
    if (!/Étape/.test(await page.innerText('#ecActifs'))) throw new Error('l\'Étape a disparu en mobile');
  });

  await etape('aucune requête n\'a échoué en dehors des refus provoqués', async () => {
    const attendus = [
      'POST /account/login -> 401',                               // le code erroné, testé exprès
      'GET /api/boost/coach/dossiers/' + ids[CLI_B] + ' -> 404',  // le dossier du confrère, testé exprès
    ];
    const inattendus = reponsesKo.filter((r) => !attendus.includes(r));
    if (inattendus.length) throw new Error('requêtes en échec inattendues : ' + [...new Set(inattendus)].join(', '));
  });

  await page.setViewportSize({ width: 1100, height: 900 });
  await page.screenshot({ path: (process.env.OUT || '.') + '/coach-mes-clients.png', fullPage: true });
  await page.locator('#ecActifs .ec-cli').first().click();
  await page.waitForSelector('#ecFiche:not([hidden])');
  await page.screenshot({ path: (process.env.OUT || '.') + '/coach-fiche.png', fullPage: true });
  await nav.close();

  console.log('\n' + '='.repeat(60));
  if (erreurs.length) {
    console.log('ÉCHECS (' + erreurs.length + ') :');
    [...new Set(erreurs)].forEach((e) => console.log('  - ' + e));
    process.exit(1);
  }
  console.log('ESPACE COACH : tout est passé, aucune erreur console.');
})();
