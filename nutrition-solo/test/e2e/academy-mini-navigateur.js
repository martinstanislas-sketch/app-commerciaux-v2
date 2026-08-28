// ============================================================================
//  E2E NAVIGATEUR — MY COACH ACADEMY : L'ENCHAÎNEMENT DE FIN DE MODULE.
//
//  CE FICHIER EXISTE À CAUSE D'UNE IMPASSE RÉELLE. À la fin de la dernière
//  vidéo d'un module, le bouton « Suivant » ouvrait le premier contenu du
//  module d'après — c'est-à-dire d'un module ENCORE VERROUILLÉ. Le serveur
//  refusait (409), et l'écran ne savait dire que « Contenu introuvable ». Le
//  parcours s'arrêtait là, sans que rien n'indique quoi faire.
//
//  Le chemin attendu, et ce que cette suite déroule bout à bout :
//
//    dernière vidéo du module
//      -> le bouton annonce le MINI-QCM (pas « Suivant »)
//      -> le mini s'ouvre
//      -> on le rate : correction affichée, on peut recommencer
//      -> on le réussit : correction, puis un bouton qui NOMME le module suivant
//      -> ce bouton ouvre la première vidéo du module suivant
//
//  ⚠️ CE QUI EST ÉPROUVÉ ICI EST L'ENCHAÎNEMENT, pas le verrou lui-même : le
//  verrou est tenu par le serveur et attaqué au clavier dans
//  test/academyMiniQcm.test.js. Ici, on vérifie qu'un humain qui suit les
//  boutons ne tombe jamais sur une porte fermée.
//
//  Hors `npm test` :
//    npm install --no-save playwright
//    NUTRITION_DB=/tmp/e2e.sqlite ADMIN_EMAIL=patron@exemple.fr PORT=3222 node server.js &
//    NUTRITION_DB=/tmp/e2e.sqlite BASE=http://127.0.0.1:3222 node test/e2e/academy-mini-navigateur.js
// ============================================================================
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:3222';
const ADMIN = 'patron@exemple.fr';
const LOU = 'lou.mini@exemple.fr';
const erreurs = [];
const local = (url) => url.startsWith(BASE);

// Cinq questions par module, volontairement transparentes : la BONNE réponse
// commence par « Oui ». C'est ce qui permet au test de réussir ou de rater le
// mini à volonté, sans jamais lire le corrigé côté serveur.
const BONNE = 'Oui — la bonne réponse';
const MAUVAISE = 'Non — une mauvaise réponse';

const jsonp = (r, b, m, t) => fetch(BASE + r, {
  method: m || 'POST',
  headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
  body: b ? JSON.stringify(b) : undefined,
}).then((x) => x.json());

const get = (r, t) => fetch(BASE + r, { headers: { Authorization: 'Bearer ' + t } }).then((x) => x.json());

async function semer() {
  for (const [email, prenom, pin] of [[ADMIN, 'Patron', '7777'], [LOU, 'Lou', '4004']]) {
    await jsonp('/account/login', { email, prenom, pin });
  }
  const t = (await jsonp('/account/login', { email: ADMIN, pin: '7777' })).token;
  await jsonp('/api/boost/admin/collaborateurs', { email: LOU, role: 'collaborateur' }, 'POST', t);

  // On pose une banque MINI sur le premier module : c'est lui dont on va
  // atteindre la fin dans le navigateur.
  const f = (await get('/api/academy/formation', (await jsonp('/account/login', { email: LOU, pin: '4004' })).token)).formation;
  const m1 = f.modules[0];
  for (let i = 1; i <= 5; i++) {
    await jsonp('/api/academy/admin/questions', {
      moduleId: m1.id, usage: 'mini', enonce: `Mini du module 1 — question ${i} ?`,
      choix: [{ texte: BONNE, correct: true }, { texte: MAUVAISE, correct: false }],
    }, 'POST', t);
  }
  return { t, m1, m2: f.modules[1] };
}

(async () => {
  const { m1, m2 } = await semer();

  const nav = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const page = await nav.newPage({ viewport: { width: 1100, height: 950 } });
  page.setDefaultTimeout(8000);
  page.on('pageerror', (e) => erreurs.push('PAGE ERROR: ' + e.message));
  page.on('requestfailed', (r) => { if (local(r.url())) erreurs.push('REQUETE KO: ' + r.url().slice(0, 90)); });

  // TOUTE réponse locale en erreur est fatale ici : le propos du fichier est
  // justement qu'aucun clic proposé à l'écran n'aboutit à un refus.
  const reponsesKo = [];
  page.on('response', (r) => {
    if (!local(r.url())) return;
    if (r.status() >= 400) reponsesKo.push(r.request().method() + ' ' + new URL(r.url()).pathname + ' -> ' + r.status());
  });

  const etape = async (nom, fn) => {
    try { await fn(); console.log('  ✓ ' + nom); }
    catch (e) { console.log('  ✗ ' + nom + ' — ' + e.message); erreurs.push(nom + ' : ' + e.message); }
  };
  const contenu = () => page.evaluate(() =>
    [...document.querySelectorAll('main > section, main > p')].filter((s) => !s.hidden)
      .map((s) => s.textContent).join('\n'));

  async function seConnecter(email, pin) {
    await page.goto(BASE + '/academy', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.removeItem('mc-academy-session'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#acLogin:not([hidden])');
    await page.fill('#acEmail', email);
    await page.fill('#acPin', pin);
    await page.click('#acGo');
    await page.waitForSelector('#acAccueil:not([hidden])');
    await page.locator('#acAccueil [data-ouvrir]').first().click();
    await page.waitForSelector('#acSommaire:not([hidden])');
  }

  // Répond aux 5 questions du mini affiché, puis rend la copie.
  async function passerLeMini({ juste }) {
    await page.waitForSelector('#acQcm:not([hidden]) .ac-q-choix');
    for (let i = 0; i < 5; i++) {
      const bon = page.locator('#acQcm .ac-choix', { hasText: BONNE });
      const mauvais = page.locator('#acQcm .ac-choix', { hasText: MAUVAISE });
      await (juste ? bon : mauvais).first().click();
      const suiv = page.locator('#acQSuiv');
      if (await suiv.isEnabled()) await suiv.click();
    }
    await page.click('#acQFin');
    await page.waitForSelector('#acQcm .ac-res');
  }

  console.log('\n1. JUSQU\'À LA FIN DU MODULE 1');

  await seConnecter(LOU, '4004');

  await etape('le module suivant est annoncé verrouillé, sans ses titres', async () => {
    const t = await contenu();
    if (!/Réussis le mini-QCM du module précédent/.test(t)) throw new Error('le module 2 ne s\'annonce pas verrouillé');
    if (await page.locator('.ac-mod-lock').count() < 1) throw new Error('aucun module verrouillé à l\'écran');
  });

  await etape('on enchaîne les vidéos du module 1 jusqu\'à la dernière', async () => {
    await page.locator('#acSommaire [data-contenu]').first().click();
    await page.waitForSelector('#acLecteur:not([hidden])');
    // Deux « Terminer et continuer » : il reste ensuite la 3e et dernière vidéo.
    for (let i = 0; i < 2; i++) {
      const b = page.locator('#acFait');
      const libelle = (await b.innerText()).trim();
      if (!/Terminer et continuer/.test(libelle)) throw new Error('bouton inattendu en cours de module : ' + libelle);
      await b.click();
      await page.waitForTimeout(250);
    }
  });

  console.log('\n2. LE BOUTON DE FIN DE MODULE');

  await etape('sur la dernière vidéo, le bouton annonce le MINI-QCM et non « Suivant »', async () => {
    const libelle = (await page.locator('#acFait').innerText()).trim();
    if (/Suivant/.test(libelle)) throw new Error('L\'IMPASSE EST DE RETOUR : le bouton annonce encore « Suivant »');
    if (!/mini-QCM/i.test(libelle)) throw new Error('le bouton devrait annoncer le mini-QCM : ' + libelle);
  });

  await etape('il ouvre le mini-QCM du module, pas « Contenu introuvable »', async () => {
    await page.click('#acFait');
    await page.waitForSelector('#acQcm:not([hidden])');
    const t = await contenu();
    if (/Contenu introuvable/.test(t)) throw new Error('L\'IMPASSE EST DE RETOUR : « Contenu introuvable »');
    if (!/Mini-QCM/.test(t)) throw new Error('l\'écran ouvert n\'est pas le mini-QCM');
    if (!/Question 1 \/ 5/.test(t)) throw new Error('le mini devrait poser 5 questions');
  });

  console.log('\n3. RATÉ, PUIS RÉUSSI');

  await etape('un mini raté affiche la correction et propose de recommencer', async () => {
    await passerLeMini({ juste: false });
    const t = await contenu();
    if (!/Mini-QCM non réussi/.test(t)) throw new Error('le mini raté ne le dit pas');
    if (!/Correction/.test(t)) throw new Error('la correction manque');
    if (!/bonne réponse/.test(t)) throw new Error('la bonne réponse n\'est pas montrée sur les questions ratées');
    if (!await page.locator('#acQRefaire').count()) throw new Error('aucun bouton pour recommencer');
    // Ce que le mini n'est PAS : une étape de certification.
    if (!/ne compte pas dans ta certification/.test(t)) throw new Error('l\'écran laisse croire à une étape de certification');
  });

  await etape('le mini réussi affiche un bouton qui NOMME le module suivant', async () => {
    await page.click('#acQRefaire');
    await passerLeMini({ juste: true });
    const t = await contenu();
    if (!/Mini-QCM réussi/.test(t)) throw new Error('le mini réussi ne le dit pas');
    const suite = page.locator('#acQSuite');
    if (!await suite.count()) throw new Error('aucun bouton pour continuer après un mini réussi');
    const libelle = (await suite.innerText()).trim();
    if (!libelle.includes(m2.titre)) throw new Error('le bouton ne nomme pas le module suivant : ' + libelle);
  });

  console.log('\n4. LA SUITE DU PARCOURS');

  await etape('ce bouton ouvre la première vidéo du module suivant', async () => {
    await page.click('#acQSuite');
    await page.waitForSelector('#acLecteur:not([hidden])');
    const t = await contenu();
    if (/Contenu introuvable/.test(t)) throw new Error('L\'IMPASSE EST DE RETOUR après le mini');
    if (!t.includes(m2.titre)) throw new Error('on n\'est pas dans le module suivant');
  });

  await etape('le sommaire latéral montre le mini franchi et n\'offre plus de ligne verrouillée', async () => {
    const mini = page.locator('#acLecteur .ac-sl-mini');
    if (!await mini.count()) throw new Error('le mini n\'apparaît pas dans le sommaire latéral');
    // Le module 1 est franchi : sa ligne de mini est cochée.
    if (!await page.locator('#acLecteur .ac-sl-mini.ac-sl-fait').count()) {
      throw new Error('le mini réussi n\'est pas marqué comme fait dans le sommaire');
    }
    // Aucune ligne cliquable ne doit pointer un module encore fermé.
    const verrous = await page.locator('#acLecteur .ac-sl-lock').count();
    const cliquablesVerrouillees = await page.locator('#acLecteur .ac-sl-lock [data-contenu]').count();
    if (verrous && cliquablesVerrouillees) throw new Error('un module verrouillé propose encore ses contenus');
  });

  await etape('retour au sommaire : le module 1 est validé, le module 2 ouvert', async () => {
    await page.click('#acBack');
    await page.waitForSelector('#acSommaire:not([hidden])');
    const t = await contenu();
    if (!/Mini-QCM du module — réussi/.test(t)) throw new Error('le sommaire n\'affiche pas le mini réussi');
    if (/Réussis le mini-QCM du module précédent/.test(t) === false) {
      // Le module 3 doit à son tour être annoncé verrouillé — sauf s'il n'existe pas.
      if (await page.locator('.ac-mod').count() > 2) throw new Error('le module 3 devrait rester verrouillé');
    }
  });

  await etape('aucune requête locale n\'a échoué', async () => {
    if (reponsesKo.length) throw new Error('des clics proposés à l\'écran ont été refusés : ' + [...new Set(reponsesKo)].join(', '));
  });

  const OUT = process.env.OUT || '.';
  try {
    await page.screenshot({ path: OUT + '/academy-mini.png', fullPage: true });
  } catch (_) { /* la capture ne doit jamais faire échouer la suite */ }
  await nav.close();

  console.log('\n' + '='.repeat(60));
  if (erreurs.length) {
    console.log('ÉCHECS (' + erreurs.length + ') :');
    [...new Set(erreurs)].forEach((e) => console.log('  - ' + e));
    process.exit(1);
  }
  console.log('ACADEMY — FIN DE MODULE : l\'enchaînement tient, aucune impasse.');
})();
