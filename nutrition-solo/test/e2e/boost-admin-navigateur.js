// ============================================================================
//  E2E NAVIGATEUR — écran d'administration du Boost Nutrition.
//
//  Ce que les tests Node ne peuvent PAS dire : que l'écran s'affiche vraiment,
//  que les boutons répondent, que le CSS ne l'aplatit pas, et qu'aucune erreur
//  console ne se produit. C'est exactement ce que ce script vérifie, en pilotant
//  un vrai navigateur sur un vrai serveur.
//
//  Hors `npm test` comme parcours-navigateur.js (Playwright + serveur lancé) :
//
//    npm install --no-save playwright
//    NUTRITION_DB=/tmp/e2e.sqlite ADMIN_EMAIL=patron@exemple.fr PORT=3222 node server.js &
//    BASE=http://127.0.0.1:3222 ADMIN=patron@exemple.fr node test/e2e/boost-admin-navigateur.js
//
//  Les comptes sont semés par l'API (inscription libre-service) : ce script
//  teste l'ÉCRAN d'administration, pas le formulaire d'inscription, déjà couvert
//  par parcours-navigateur.js.
// ============================================================================
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:3222';
const ADMIN = process.env.ADMIN || 'patron@exemple.fr';
const PIN_ADMIN = '7777';
const COACH = 'quentin.e2e@exemple.fr';
const CLIENT = 'lea.e2e@exemple.fr';
const erreurs = [];

async function inscrire(email, prenom, pin) {
  const res = await fetch(BASE + '/account/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, prenom, pin }),
  });
  return res.json();
}

// L'app n'ouvre son écran principal que si un plan existe (loadLocal). Sans lui,
// l'admin est renvoyé sur l'onboarding et n'atteint jamais l'onglet Profil, d'où
// part l'accès au Boost. On lui pose donc un VRAI plan, produit par le
// générateur du serveur : ce script teste l'écran d'administration, pas la
// génération de plan — déjà couverte par parcours-navigateur.js.
const PROFIL = { sexe: 'homme', age: 42, taille_cm: 178, poids_kg: 82, activite: 'modere', objectif: 'maintien' };
async function planReel() {
  const res = await fetch(BASE + '/api/plan', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profil: PROFIL, preferences: {}, seed: 7 }),
  });
  const d = await res.json();
  if (!d.ok || !d.plan) throw new Error('plan de préparation impossible');
  return d.plan;
}

(async () => {
  // Comptes du scénario, créés comme le ferait n'importe qui : email + PIN.
  await inscrire(ADMIN, 'Patron', PIN_ADMIN);
  await inscrire(COACH, 'Quentin', '2002');
  await inscrire(CLIENT, 'Léa', '1001');

  const plan = await planReel();

  const nav = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const page = await nav.newPage({ viewport: { width: 1180, height: 900 } });
  // Timeout court et explicite : avec les 30 s par défaut, une étape qui échoue
  // en entraîne quinze autres et le script paraît « bloqué » au lieu d'échouer.
  page.setDefaultTimeout(5000);
  page.on('pageerror', (e) => erreurs.push('PAGE ERROR: ' + e.message));
  page.on('requestfailed', (r) => erreurs.push('REQUETE KO: ' + r.url().slice(0, 90)));
  // On note les réponses en échec AVEC leur route : deux d'entre elles sont
  // provoquées exprès par ce script (email inconnu, certification sans
  // évaluateur). Les compter comme des erreurs de console, sans savoir
  // lesquelles, empêcherait de voir une vraie panne au milieu.
  const reponsesKo = [];
  page.on('response', (r) => {
    if (r.status() >= 400) reponsesKo.push(r.request().method() + ' ' + new URL(r.url()).pathname + ' -> ' + r.status());
  });

  const etape = async (nom, fn) => {
    try { await fn(); console.log('  ✓ ' + nom); }
    catch (e) { console.log('  ✗ ' + nom + ' — ' + e.message); erreurs.push(nom + ' : ' + e.message); }
  };
  const corps = () => page.innerText('body');
  // innerText applique text-transform : les intitulés de colonnes, mis en
  // majuscules par le CSS, en ressortent « ÉTAPE ». Pour vérifier le CONTENU on
  // lit donc textContent, qui rend ce que le code a produit.
  const contenu = () => page.evaluate(() => document.body.textContent);

  await page.goto(BASE, { waitUntil: 'networkidle' });

  await etape('connexion de l\'administrateur', async () => {
    await page.click('[data-cta="login"]');
    await page.waitForSelector('#rPin');
    const prenom = await page.$('#rPrenom');
    if (prenom && await prenom.isVisible()) await prenom.fill('Patron');
    const email = await page.$('#rEmail');
    if (email && await email.isVisible()) await email.fill(ADMIN);
    await page.fill('#rPin', PIN_ADMIN);
    await page.click('#rGo');
    // La connexion est actée quand le compte est posé par le portail d'entrée.
    await page.waitForFunction((m) => window.__NUTRI_USER && window.__NUTRI_USER.email === m, ADMIN, { timeout: 8000 });
  });

  await etape('l\'écran principal s\'ouvre (plan de préparation posé)', async () => {
    await page.evaluate(([mail, p, profil]) => {
      localStorage.setItem('nutri-state-' + mail, JSON.stringify({ profil, preferences: {}, plan: p, portions: 1 }));
    }, [ADMIN, plan, PROFIL]);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#screen-result:not(.hidden)', { timeout: 8000 });
    const nav2 = page.locator('#bottom-nav');
    if (!(await nav2.isVisible())) throw new Error('barre de navigation absente');
  });

  await etape('la ligne « Boost Nutrition » est visible pour l\'admin', async () => {
    await page.click('#bottom-nav .nav-i[data-tab="profil"]');
    await page.waitForTimeout(300);
    const ligne = page.locator('#btnBoostAdmin');
    if (!(await ligne.isVisible())) throw new Error('la ligne d\'accès reste cachée pour l\'admin');
  });

  await etape('le panneau s\'ouvre sur la vue Boosts, vide et explicite', async () => {
    await page.click('#btnBoostAdmin');
    await page.waitForSelector('#boostAdminPanel:not(.hidden)');
    await page.waitForFunction(() => !/Chargement/.test(document.querySelector('#boostAdminBody').innerText), null);
    const t = await corps();
    if (!/Créer un Boost/.test(t)) throw new Error('action de départ absente');
    if (!/Aucun Boost/.test(t)) throw new Error('état vide non expliqué');
  });

  await etape('le panneau n\'est pas aplati par le CSS (mise en page réelle)', async () => {
    const box = await page.locator('#boostAdminPanel .panel-inner').boundingBox();
    if (!box || box.height < 200 || box.width < 300) throw new Error('panneau effondré : ' + JSON.stringify(box));
    const onglets = await page.locator('#boostAdminPanel .badm-tab').count();
    if (onglets !== 2) throw new Error('onglets attendus : 2, vus : ' + onglets);
    const b = await page.locator('.badm-tab[data-vue="boosts"]').boundingBox();
    const c = await page.locator('.badm-tab[data-vue="coachs"]').boundingBox();
    // Les deux onglets doivent être côte à côte, pas empilés l'un sur l'autre.
    if (Math.abs(b.y - c.y) > 4) throw new Error('les onglets ne sont pas alignés');
    if (c.x <= b.x) throw new Error('les onglets se chevauchent');
  });

  await etape('onglet Coachs : ajout d\'un collaborateur existant', async () => {
    await page.click('.badm-tab[data-vue="coachs"]');
    await page.waitForTimeout(200);
    if (!/Aucun collaborateur déclaré/.test(await corps())) throw new Error('état vide attendu');
    await page.click('#badmAjoutCollab');
    await page.fill('#badmCollabMail', COACH);
    await page.click('#badmCollabOk');
    await page.waitForSelector('#badmCertStatut');
    const t = await corps();
    if (!/quentin\.e2e/.test(t)) throw new Error('le collaborateur n\'apparaît pas');
    if (!/Non certifié/.test(t)) throw new Error('il devrait être marqué non certifié');
  });

  await etape('un email inconnu est refusé avec le message du serveur', async () => {
    await page.click('#badmAjoutCollab');
    await page.fill('#badmCollabMail', 'fantome@exemple.fr');
    await page.click('#badmCollabOk');
    await page.waitForTimeout(600);
    if (!/n'existe pas encore/.test(await corps())) throw new Error('le refus du serveur n\'est pas affiché');
    await page.click('[data-annuler]');
  });

  await etape('renseigner la certification (les 5 informations)', async () => {
    await page.click('[data-cert="' + COACH + '"]');
    await page.waitForSelector('#badmCertStatut');
    await page.selectOption('#badmCertStatut', 'certifie');
    await page.fill('#badmCertDate', '2026-07-15');
    await page.fill('#badmCertEval', 'Stan Martin');
    await page.fill('#badmCertScore', '88');
    await page.selectOption('#badmCertPratique', 'valide');
    await page.click('#badmCertOk');
    await page.waitForTimeout(700);
    const t = await corps();
    for (const attendu of ['Certifié', '15/07/2026', 'Stan Martin', '88/100', 'Validée']) {
      if (!t.includes(attendu)) throw new Error('information absente après enregistrement : ' + attendu);
    }
  });

  await etape('certifier sans évaluateur est refusé, et le dit', async () => {
    await page.click('[data-cert="' + COACH + '"]');
    await page.waitForSelector('#badmCertEval');
    await page.fill('#badmCertEval', '');
    await page.click('#badmCertOk');
    await page.waitForTimeout(600);
    if (!/évaluateur est requis/i.test(await corps())) throw new Error('le refus n\'est pas affiché');
    await page.click('[data-annuler]');
    await page.waitForTimeout(200);
  });

  await etape('créer un Boost : le client se cherche et se choisit', async () => {
    await page.click('.badm-tab[data-vue="boosts"]');
    await page.waitForTimeout(200);
    await page.click('#badmNouveau');
    await page.waitForSelector('#badmCliQ');
    await page.fill('#badmCliQ', 'lea.e2e');
    await page.waitForFunction(() => document.querySelectorAll('#badmCliList [data-client]').length === 1, null);
    // La recherche ne doit pas voler le focus du champ à chaque frappe.
    const focus = await page.evaluate(() => document.activeElement && document.activeElement.id);
    if (focus !== 'badmCliQ') throw new Error('le focus a quitté la recherche (id actif : ' + focus + ')');
    await page.click('[data-client="' + CLIENT + '"]');
    await page.selectOption('#badmCreerCoach', COACH);
    await page.fill('#badmCreerRef', 'FACTURE-E2E-001');
    await page.click('#badmCreerOk');
    await page.waitForTimeout(800);
  });

  await etape('la liste affiche les 6 colonnes demandées', async () => {
    const t = await contenu();
    for (const attendu of ['lea.e2e@exemple.fr', 'Coach Nutrition', 'Quentin', 'Étape', '0/12', 'Début', 'Date limite', 'À démarrer']) {
      if (!t.includes(attendu)) throw new Error('colonne absente : ' + attendu);
    }
    if (/undefined|NaN|\[object Object\]/.test(t)) throw new Error('trou dans le rendu de la liste');
  });

  await etape('les actions offertes correspondent au statut « À démarrer »', async () => {
    const n = async (sel) => page.locator(sel).count();
    if (await n('[data-form="coach"]') !== 1) throw new Error('« Réattribuer » attendu');
    if (await n('[data-form="prolonger"]') !== 0) throw new Error('« Prolonger » ne doit pas être offert avant l\'Étape 1');
    if (await n('[data-form="interrompre"]') !== 1) throw new Error('« Interrompre » attendu');
  });

  await etape('un deuxième Boost pour le même client est refusé, visiblement', async () => {
    await page.click('#badmNouveau');
    await page.waitForSelector('#badmCliQ');
    await page.fill('#badmCliQ', 'lea.e2e');
    await page.waitForFunction(() => document.querySelectorAll('#badmCliList [data-client]').length === 1, null);
    const desactive = await page.locator('[data-client="' + CLIENT + '"]').isDisabled();
    if (!desactive) throw new Error('le client déjà pris devrait être grisé');
    if (!/Boost À démarrer/.test(await corps())) throw new Error('la raison du grisage n\'est pas dite');
    await page.click('[data-annuler]');
  });

  await etape('réattribution : le formulaire s\'ouvre sous la ligne concernée', async () => {
    await page.click('[data-form="coach"]');
    await page.waitForSelector('#badmCoachSel');
    const form = await page.locator('.badm-form').boundingBox();
    const ligne = await page.locator('.badm-row').first().boundingBox();
    if (form.y < ligne.y) throw new Error('le formulaire doit s\'ouvrir SOUS la ligne');
    await page.click('[data-annuler]');
  });

  await etape('l\'historique se déplie et raconte le dossier', async () => {
    await page.click('[data-journal]');
    await page.waitForSelector('#badmJournalBox ol');
    const t = await page.innerText('#badmJournalBox');
    if (!/Boost créé/.test(t)) throw new Error('création absente de l\'historique');
    if (!/Coach Nutrition attribué|Coach attribué/.test(t)) throw new Error('attribution absente');
    if (!new RegExp(ADMIN).test(t)) throw new Error('l\'auteur n\'est pas tracé');
    await page.click('[data-journal]');
  });

  await etape('interruption : motif obligatoire, puis dossier clos', async () => {
    await page.click('[data-form="interrompre"]');
    await page.waitForSelector('#badmIntMotif');
    await page.click('#badmIntOk');
    await page.waitForTimeout(400);
    if (!/motif est obligatoire/i.test(await corps())) throw new Error('le motif vide devrait être refusé');
    await page.fill('#badmIntMotif', 'Test de bout en bout : arrêt de l\'accompagnement.');
    await page.click('#badmIntOk');
    await page.waitForTimeout(800);
    const t = await corps();
    if (!/Interrompu/.test(t)) throw new Error('le statut n\'est pas passé à Interrompu');
    // Un dossier clos ne propose plus d'action, sauf l'historique.
    if (await page.locator('[data-form="interrompre"]').count() !== 0) throw new Error('actions encore offertes sur un dossier clos');
    if (await page.locator('[data-journal]').count() !== 1) throw new Error('l\'historique doit rester consultable');
  });

  await etape('affichage mobile : la ligne reste lisible en 390 px', async () => {
    await page.setViewportSize({ width: 390, height: 780 });
    await page.waitForTimeout(300);
    const box = await page.locator('.badm-row').first().boundingBox();
    if (!box || box.height < 80) throw new Error('ligne effondrée en mobile');
    const debord = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (debord > 2) throw new Error('débordement horizontal de ' + debord + ' px');
    // Les intitulés de colonnes doivent rester présents : « 0/12 » seul ne dit rien.
    if (!/Étape/.test(await contenu())) throw new Error('les intitulés de colonnes ont disparu en mobile');
    // Et ils doivent être RENDUS, pas seulement présents dans le DOM.
    const visible = await page.locator('.badm-cells i').first().isVisible();
    if (!visible) throw new Error('les intitulés de colonnes ne sont pas affichés en mobile');
    await page.setViewportSize({ width: 1180, height: 900 });
  });

  await etape('aucune requête n\'a échoué en dehors des refus provoqués', async () => {
    const attendus = [
      'POST /api/boost/admin/collaborateurs -> 404',      // email inconnu, testé exprès
      'PUT /api/boost/admin/certification/' + encodeURIComponent(COACH) + ' -> 400', // certifier sans évaluateur
    ];
    const inattendus = reponsesKo.filter((r) => !attendus.includes(r));
    if (inattendus.length) throw new Error('requêtes en échec inattendues : ' + inattendus.join(', '));
    for (const a of attendus) {
      if (!reponsesKo.includes(a)) throw new Error('le refus attendu n\'a pas eu lieu : ' + a);
    }
  });

  await page.screenshot({ path: process.env.SHOT || 'boost-admin.png', fullPage: true });
  await nav.close();

  console.log('\n' + '='.repeat(60));
  if (erreurs.length) {
    console.log('ÉCHECS (' + erreurs.length + ') :');
    erreurs.forEach((e) => console.log('  - ' + e));
    process.exit(1);
  }
  console.log('ADMINISTRATION DU BOOST : tout est passé, aucune erreur console.');
})();
