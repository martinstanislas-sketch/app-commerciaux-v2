// ============================================================================
//  E2E NAVIGATEUR — My Coach Academy (lot 1).
//
//  Le parcours demandé : connexion collaborateur → Academy → module → vidéo →
//  terminer → progression mise à jour → déconnexion → reconnexion → reprise.
//
//  ⚠️ LES REQUÊTES VERS YOUTUBE SONT IGNORÉES par les écouteurs d'erreur. Les
//  identifiants d'amorçage sont volontairement factices : l'iframe échouera, et
//  c'est normal. Ce qu'on vérifie ici, c'est que le lecteur est CORRECTEMENT
//  INTÉGRÉ (bonne URL, bon ratio, plein écran autorisé) — pas que YouTube
//  répond, ce qui ne dépend pas de nous et ferait dépendre la suite du réseau.
//
//  Hors `npm test` :
//    npm install --no-save playwright
//    NUTRITION_DB=/tmp/e2e.sqlite ADMIN_EMAIL=patron@exemple.fr PORT=3222 node server.js &
//    BASE=http://127.0.0.1:3222 node test/e2e/academy-navigateur.js
// ============================================================================
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:3222';
const ADMIN = 'patron@exemple.fr';
const COLLAB = 'theo.ac@exemple.fr';    // collaborateur actif, non certifié
const CLIENT = 'lea.ac@exemple.fr';     // client : ne doit pas entrer
const erreurs = [];
const local = (url) => url.startsWith(BASE);

const jsonp = (r, b, m, t) => fetch(BASE + r, {
  method: m || 'POST',
  headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
  body: b ? JSON.stringify(b) : undefined,
}).then((x) => x.json());

async function semer() {
  for (const [email, prenom, pin] of [[ADMIN, 'Patron', '7777'], [COLLAB, 'Théo', '4004'], [CLIENT, 'Léa', '1001']]) {
    await jsonp('/account/login', { email, prenom, pin });
  }
  const t = (await jsonp('/account/login', { email: ADMIN, pin: '7777' })).token;
  await jsonp('/api/boost/admin/collaborateurs', { email: COLLAB, role: 'collaborateur' }, 'POST', t);
  return { t };
}

(async () => {
  const { t: jetonAdmin } = await semer();

  const nav = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const page = await nav.newPage({ viewport: { width: 1100, height: 950 } });
  page.setDefaultTimeout(6000);
  page.on('pageerror', (e) => erreurs.push('PAGE ERROR: ' + e.message));
  page.on('requestfailed', (r) => { if (local(r.url())) erreurs.push('REQUETE KO: ' + r.url().slice(0, 90)); });
  const reponsesKo = [];
  page.on('response', (r) => {
    if (r.status() >= 400 && local(r.url())) reponsesKo.push(r.request().method() + ' ' + new URL(r.url()).pathname + ' -> ' + r.status());
  });

  const etape = async (nom, fn) => {
    try { await fn(); console.log('  ✓ ' + nom); }
    catch (e) { console.log('  ✗ ' + nom + ' — ' + e.message); erreurs.push(nom + ' : ' + e.message); }
  };
  const contenu = () => page.evaluate(() => document.body.textContent);

  async function seConnecter(email, pin) {
    await page.goto(BASE + '/academy', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.removeItem('mc-academy-session'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#acLogin:not([hidden])');
    await page.fill('#acEmail', email);
    await page.fill('#acPin', pin);
    await page.click('#acGo');
  }

  await etape('la page /academy s\'ouvre sur un écran de connexion', async () => {
    await page.goto(BASE + '/academy', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#acLogin:not([hidden])');
    if (!/My Coach Academy/.test(await contenu())) throw new Error('titre absent');
    const scripts = await page.evaluate(() => [...document.scripts].map((s) => s.src));
    if (scripts.some((s) => /app\.js|coach\.js/.test(s))) throw new Error('un autre espace est chargé');
    if (await page.locator('#acMe').isVisible()) throw new Error('bandeau de session sans session');
  });

  await etape('un client est renvoyé, sans voir la formation', async () => {
    await seConnecter(CLIENT, '1001');
    await page.waitForSelector('#acBloc:not([hidden])');
    const t = await contenu();
    if (!/réservée aux collaborateurs/i.test(t)) throw new Error('message inattendu');
    if (/Module 1/.test(t)) throw new Error('des contenus ont fuité');
  });

  await etape('un collaborateur NON certifié accède à sa formation', async () => {
    await seConnecter(COLLAB, '4004');
    await page.waitForSelector('#acSommaire:not([hidden])');
    const t = await contenu();
    // Depuis le lot 5, le titre vient du CATALOGUE : plus aucun nom de formation
    // écrit en dur dans l'écran. C'est le libellé de la formation qu'on attend.
    if (!/Coach Nutrition/.test(t)) throw new Error('titre absent');
    if (!/Les modules à suivre pour devenir Coach Nutrition certifié/.test(t)) {
      throw new Error('le sous-titre devrait reprendre le titre de certification du catalogue');
    }
    if (!/Ta progression/.test(t)) throw new Error('bloc de progression absent');
    if (!/0 %/.test(t)) throw new Error('la progression devrait partir de zéro');
  });

  await etape('les modules et contenus s\'affichent dans l\'ordre', async () => {
    const modules = await page.locator('.ac-mod-t').allInnerTexts();
    if (modules.length < 2) throw new Error('au moins deux modules attendus');
    if (!/Module 1/.test(modules[0]) || !/Module 2/.test(modules[1])) throw new Error('ordre : ' + modules.join(' | '));
    const titres = await page.locator('.ac-mod').first().locator('.ac-l-t').allInnerTexts();
    if (titres.length !== 3) throw new Error('3 contenus attendus dans le module 1');
    if (!/rôle du Coach Nutrition/.test(titres[0])) throw new Error('premier contenu inattendu : ' + titres[0]);
    // Tout est « à venir » au départ.
    if (await page.locator('.ac-avenir').count() !== 5) throw new Error('les 5 contenus devraient être à venir');
  });

  await etape('ouvrir une vidéo NE la termine pas', async () => {
    await page.locator('.ac-l', { hasText: 'rôle du Coach Nutrition' }).click();
    await page.waitForSelector('#acLecteur:not([hidden])');
    const t = await contenu();
    if (!/Le rôle du Coach Nutrition/.test(t)) throw new Error('titre du contenu absent');
    if (!/J'ai terminé ce contenu/.test(t)) throw new Error('le bouton de fin devrait être proposé');
    if (/Terminé le/.test(t)) throw new Error('le contenu ne doit pas être marqué terminé à l\'ouverture');
    // La progression n'a pas bougé : on le vérifie dans les données.
    const f = await page.evaluate(async () => {
      const s = JSON.parse(localStorage.getItem('mc-academy-session'));
      const r = await fetch('/api/academy/formation', { headers: { Authorization: 'Bearer ' + s.token } });
      return (await r.json()).formation;
    });
    if (f.termines !== 0) throw new Error('une ouverture a compté comme une complétion');
    if (f.modules[0].contenus[0].commence !== true) throw new Error('le contenu devrait être marqué commencé');
  });

  await etape('la vidéo YouTube est correctement intégrée', async () => {
    const src = await page.locator('.ac-video iframe').getAttribute('src');
    if (!/youtube-nocookie\.com\/embed\/DEMOaaaa001/.test(src)) throw new Error('src inattendu : ' + src);
    if (await page.locator('.ac-video iframe').getAttribute('allowfullscreen') === null) throw new Error('plein écran non autorisé');
    // Le ratio 16/9 doit tenir : une iframe sans hauteur s'effondrerait.
    const box = await page.locator('.ac-video').boundingBox();
    const ratio = box.width / box.height;
    if (Math.abs(ratio - 16 / 9) > 0.05) throw new Error('ratio inattendu : ' + ratio.toFixed(2));
  });

  await etape('« J\'ai terminé » fait avancer la progression', async () => {
    await page.click('#acFait');
    await page.waitForSelector('.ac-deja');
    if (!/Terminé le/.test(await contenu())) throw new Error('la complétion devrait être confirmée et datée');
    await page.click('#acBack');
    await page.waitForSelector('#acSommaire:not([hidden])');
    const t = await contenu();
    if (!/20 %/.test(t)) throw new Error('1 contenu sur 5 = 20 % — vu : ' + (t.match(/(\d+) %/) || [])[0]);
    if (await page.locator('.ac-fait').count() !== 1) throw new Error('un contenu devrait être marqué fait');
  });

  await etape('la navigation suivant/précédent enchaîne les contenus', async () => {
    await page.locator('.ac-l', { hasText: 'Poser un cadre bienveillant' }).click();
    await page.waitForSelector('#acLecteur:not([hidden])');
    await page.click('#acSuiv');
    await page.waitForFunction(() => /action unique/.test(document.querySelector('.ac-lec-t').textContent));
    await page.click('#acPrec');
    await page.waitForFunction(() => /cadre bienveillant/.test(document.querySelector('.ac-lec-t').textContent));
    // Le tout premier contenu n'a pas de précédent.
    await page.click('#acPrec');
    await page.waitForFunction(() => /rôle du Coach/.test(document.querySelector('.ac-lec-t').textContent));
    if (!(await page.locator('#acPrec').isDisabled())) throw new Error('« Précédent » devrait être désactivé au début');
  });

  await etape('on quitte, on revient : la reprise pointe le bon contenu', async () => {
    // On s'arrête sur le 2e contenu, ouvert mais non terminé.
    await page.click('#acBack');
    await page.locator('.ac-l', { hasText: 'Poser un cadre bienveillant' }).click();
    await page.waitForSelector('#acLecteur:not([hidden])');

    await page.click('#acOut');
    await page.waitForSelector('#acLogin:not([hidden])');
    await seConnecter(COLLAB, '4004');
    await page.waitForSelector('#acSommaire:not([hidden])');

    const t = await contenu();
    if (!/20 %/.test(t)) throw new Error('la progression devrait être retrouvée');
    const bouton = await page.innerText('#acReprendre');
    if (!/Poser un cadre bienveillant/.test(bouton)) throw new Error('reprise inattendue : ' + bouton);
    if (!/Reprendre/.test(bouton)) throw new Error('le bouton devrait proposer de reprendre');
  });

  await etape('le bouton de reprise ouvre bien ce contenu', async () => {
    await page.click('#acReprendre');
    await page.waitForSelector('#acLecteur:not([hidden])');
    if (!/Poser un cadre bienveillant/.test(await page.innerText('.ac-lec-t'))) throw new Error('mauvais contenu ouvert');
    await page.click('#acBack');
  });

  await etape('désactiver le collaborateur lui ferme l\'Academy au rechargement', async () => {
    await jsonp('/api/boost/admin/collaborateurs', { email: COLLAB, role: 'client' }, 'POST', jetonAdmin);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#acBloc:not([hidden])');
    const t = await contenu();
    if (!/réservée aux collaborateurs/i.test(t)) throw new Error('l\'accès devrait être fermé');
    if (/Module 1|Ta progression/.test(t)) throw new Error('des contenus restent visibles');

    await jsonp('/api/boost/admin/collaborateurs', { email: COLLAB, role: 'collaborateur' }, 'POST', jetonAdmin);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#acSommaire:not([hidden])');
  });

  await etape('affichage mobile : la formation reste lisible en 390 px', async () => {
    await page.setViewportSize({ width: 390, height: 850 });
    await page.waitForTimeout(300);
    const debord = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (debord > 2) throw new Error('débordement horizontal de ' + debord + ' px');
    await page.locator('.ac-l').first().click();
    await page.waitForSelector('#acLecteur:not([hidden])');
    const d2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (d2 > 2) throw new Error('débordement du lecteur de ' + d2 + ' px');
    const box = await page.locator('.ac-video').boundingBox();
    if (!box || box.height < 100) throw new Error('lecteur effondré en mobile');
    await page.setViewportSize({ width: 1100, height: 950 });
  });

  await etape('aucune requête locale n\'a échoué', async () => {
    if (reponsesKo.length) throw new Error('requêtes en échec : ' + [...new Set(reponsesKo)].join(', '));
  });

  // Capture du sommaire, quel que soit l'écran où l'on se trouve à ce stade.
  const OUT = process.env.OUT || '.';
  try {
    if (await page.locator('#acBack').count()) {
      await page.click('#acBack');
      await page.waitForSelector('#acSommaire:not([hidden])');
    }
    await page.screenshot({ path: OUT + '/academy.png', fullPage: true });
  } catch (_) { /* la capture ne doit jamais faire échouer la suite */ }
  await nav.close();

  console.log('\n' + '='.repeat(60));
  if (erreurs.length) {
    console.log('ÉCHECS (' + erreurs.length + ') :');
    [...new Set(erreurs)].forEach((e) => console.log('  - ' + e));
    process.exit(1);
  }
  console.log('MY COACH ACADEMY : tout est passé, aucune erreur console.');
})();
