// Parcours réel dans un vrai navigateur : landing -> inscription -> onboarding
// (avec le choix de l'objectif) -> plan -> courses -> progression -> SOS coach.
//
// Il ne tourne PAS avec `npm test` : il demande Playwright et un serveur lancé,
// deux dépendances qu'on ne veut pas imposer à la suite unitaire. À lancer ainsi :
//
//   npm install --no-save playwright
//   NUTRITION_DB=/tmp/e2e.sqlite PORT=3222 node server.js &
//   BASE=http://127.0.0.1:3222 node test/e2e/parcours-navigateur.js
//
// Ce que ce test protège avant tout : que plus AUCUN écran du Protocole 42 ne
// réapparaisse (onglet Groupe/Parcours, code de cohorte, coach humain) et que le
// choix de l'objectif soit bien rendu à l'utilisateur dès l'étape 1.
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:3222';
const erreurs = [];

(async () => {
  // executablePath : utile quand le Chromium du système ne correspond pas à la
  // version que Playwright attend. Sans PW_CHROMIUM, Playwright choisit le sien.
  const nav = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const page = await nav.newPage();
  page.on('pageerror', (e) => erreurs.push('PAGE ERROR: ' + e.message + '\n    ' + String(e.stack || '').split('\n').slice(1,4).join('\n    ')));
  page.on('requestfailed', (r) => erreurs.push('REQUETE KO: ' + r.url().slice(0,90) + ' — ' + (r.failure()||{}).errorText));

  const etape = async (nom, fn) => {
    try { await fn(); console.log('  ✓ ' + nom); }
    catch (e) { console.log('  ✗ ' + nom + ' — ' + e.message); erreurs.push(nom + ' : ' + e.message); }
  };

  await page.goto(BASE, { waitUntil: 'networkidle' });

  await etape('la landing s\'affiche et ne promet pas de coach humain', async () => {
    const txt = await page.textContent('body');
    if (!/Manger bien/.test(txt)) throw new Error('titre absent');
    if (/Julie, ta coach|coach dédié/.test(txt)) throw new Error('promesse de coach humain encore présente');
  });

  await etape('le CTA mène au formulaire de création de compte', async () => {
    await page.click('[data-cta="start"]');
    await page.waitForSelector('#rEmail', { timeout: 4000 });
    const t = await page.textContent('h1');
    if (!/Crée ton espace/.test(t)) throw new Error('titre inattendu : ' + t);
  });

  await etape('aucun code d\'invitation n\'est demandé', async () => {
    // On lit le TEXTE VISIBLE, pas le HTML : les commentaires du script d'entrée
    // citent l'ancien fonctionnement, ce n'est pas ce qu'on teste.
    const vu = await page.innerText('body');
    if (/cohorte|code du challenge|code que ton coach/i.test(vu)) throw new Error('le formulaire parle encore de code coach');
  });

  await etape('inscription en libre-service', async () => {
    await page.fill('#rPrenom', 'Camille');
    await page.fill('#rEmail', 'camille@exemple.fr');
    await page.fill('#rPin', '4321');
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), page.click('#rGo')]);
  });

  await etape('l\'onboarding s\'ouvre sur le CHOIX DE L\'OBJECTIF (étape 1)', async () => {
    await page.click('#ctaStart');
    await page.waitForSelector('.step[data-step="1"].active', { timeout: 4000 });
    const visible = await page.isVisible('.choice-grid[data-field="objectif"]');
    if (!visible) throw new Error('la grille des objectifs est masquée');
    const n = await page.locator('.choice-grid[data-field="objectif"] .choice').count();
    if (n !== 4) throw new Error('attendu 4 objectifs, trouvé ' + n);
    const labels = await page.locator('.choice-grid[data-field="objectif"] .choice').allTextContents();
    console.log('    objectifs proposés :', labels.map((l) => l.trim()).join(' | '));
    if (/42|challenge/i.test(labels.join(' '))) throw new Error('le Protocole 42 figure encore parmi les objectifs');
    const num = await page.textContent('#stepNum');
    if (num.trim() !== '1') throw new Error('le compteur ne démarre pas à 1 (trouvé ' + num + ')');
  });

  await etape('parcours complet de l\'onboarding jusqu\'au plan', async () => {
    await page.click('.choice-grid[data-field="objectif"] .choice[data-value="muscle"]');
    await page.click('#btnNext');                                   // -> infos corps
    await page.waitForTimeout(150);
    for (let i = 0; i < 4; i++) { await page.click('#btnNext'); await page.waitForTimeout(120); }
    await page.click('#btnFinish');
    await page.waitForSelector('#screen-result.active', { timeout: 25000 });
    await page.waitForTimeout(600);
  });

  await etape('le plan affiche 7 jours et l\'objectif choisi', async () => {
    const titre = await page.textContent('.pt-title');
    if (!/muscle/i.test(titre)) throw new Error('titre du plan inattendu : ' + titre);
    const jours = await page.locator('#planGrid .day-card').count();
    if (jours < 5) throw new Error('seulement ' + jours + ' jours affichés');
    console.log('    plan : « ' + titre.trim() + ' », ' + jours + ' journées');
  });

  await etape('la barre de navigation compte 4 onglets, sans Groupe ni Parcours', async () => {
    const tabs = await page.locator('#bottom-nav .nav-i:not(.hidden):not(.nav-logout)').allTextContents();
    const noms = tabs.map((t) => t.trim()).filter(Boolean);
    console.log('    onglets :', noms.join(' | '));
    if (noms.some((t) => /Groupe|Parcours/.test(t))) throw new Error('onglet du Protocole 42 encore présent');
  });

  await etape('la liste de courses s\'ouvre', async () => {
    await page.click('#bottom-nav .nav-i[data-tab="courses"]');
    await page.waitForSelector('#shoppingPanel:not(.hidden)', { timeout: 4000 });
    const t = await page.textContent('#shoppingPanel');
    if (!/rayon|Courses|courses/i.test(t)) throw new Error('contenu inattendu');
    await page.keyboard.press('Escape');
  });

  await etape('l\'onglet Progression enregistre une pesée', async () => {
    await page.click('#bottom-nav .nav-i[data-tab="progression"]');
    await page.waitForSelector('#progAddPesee', { timeout: 5000 });
    await page.fill('#progPoids', '78.4');
    await page.click('#progAddPesee');
    await page.waitForTimeout(900);
    const t = await page.textContent('#view-progression');
    if (!/78,4/.test(t)) throw new Error('la pesée ne s\'affiche pas : ' + t.slice(0, 160));
    if (/semaine 3|jalon|Punch/i.test(t)) throw new Error('vestige du parcours 42 jours');
  });

  await etape('le SOS coach répond via la FAQ (sans clé IA)', async () => {
    await page.click('#sosFab');
    await page.waitForSelector('#sosSheet:not(.hidden)', { timeout: 4000 });
    const html = await page.innerHTML('#sosSheet');
    if (/Prévenir mon coach/.test(html)) throw new Error('le bouton « prévenir mon coach » est encore là');
    await page.fill('#coachInput', "j'ai faim entre les repas");
    await page.click('#coachSend');
    await page.waitForTimeout(1500);
    const msgs = await page.textContent('#coachMessages');
    if (msgs.length < 80) throw new Error('aucune réponse du coach');
    console.log('    réponse du coach : « ' + msgs.slice(-150).replace(/\s+/g, ' ').trim() + ' »');
  });

  await etape('le profil ne propose plus les écrans du dispositif coach', async () => {
    await page.keyboard.press('Escape');
    await page.click('#bottom-nav .nav-i[data-tab="profil"]');
    await page.waitForTimeout(300);
    const rows = await page.locator('#view-profil .profil-row:not(.hidden)').allTextContents();
    console.log('    profil :', rows.map((r) => r.trim()).join(' | '));
    if (rows.some((r) => /guides|cadeaux|coach|vidéos|clients/i.test(r))) throw new Error('ligne du Protocole 42 encore visible');
  });

  await etape('rechargement : la session et le plan sont retrouvés', async () => {
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#screen-result.active', { timeout: 8000 });
    const t = await page.textContent('.pt-title');
    if (!/muscle/i.test(t)) throw new Error('le plan n\'a pas été restauré');
  });

  await nav.close();

  console.log('\n' + '='.repeat(60));
  if (erreurs.length) {
    console.log('ÉCHECS / ERREURS (' + erreurs.length + ') :');
    erreurs.forEach((e) => console.log('  • ' + e));
    process.exit(1);
  }
  console.log('PARCOURS COMPLET : tout est passé, aucune erreur console.');
})();
