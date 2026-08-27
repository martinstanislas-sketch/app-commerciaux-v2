// ============================================================================
//  E2E NAVIGATEUR — S1, le premier rendez-vous.
//
//  Le parcours réel demandé : Mes clients → client « À démarrer » → S1 →
//  brouillon → on quitte → on revient → validation → Étape 1 terminée.
//
//  Ce que seul un navigateur peut dire ici : que le formulaire se remplit et se
//  relit vraiment (pastilles cochées, champs repeuplés), que le refus nomme ce
//  qui manque à l'écran, et qu'après validation la fiche bascule sans qu'on ait
//  à recharger la page.
//
//  Hors `npm test` :
//    npm install --no-save playwright
//    NUTRITION_DB=/tmp/e2e.sqlite ADMIN_EMAIL=patron@exemple.fr PORT=3222 node server.js &
//    BASE=http://127.0.0.1:3222 node test/e2e/boost-s1-navigateur.js
// ============================================================================
const { chromium } = require('playwright');
// Depuis le lot 4, un Coach Nutrition certifié s'amorce par le PARCOURS RÉEL :
// la porte directe du Boost est fermée. Chaque suite prouve donc la chaîne
// complète en passant — contenus, QCM, évaluation pratique, délivrance.
const { creerAide } = require('./aideAcademy');

const BASE = process.env.BASE || 'http://127.0.0.1:3222';
const ADMIN = 'patron@exemple.fr';
const COACH = 'quentin.s1@exemple.fr';
const CLIENT = 'lea.s1@exemple.fr';
const erreurs = [];

const jsonp = (r, b, m, t) => fetch(BASE + r, {
  method: m || 'POST',
  headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
  body: b ? JSON.stringify(b) : undefined,
}).then((x) => x.json());

async function semer() {
  for (const [email, prenom, pin] of [[ADMIN, 'Patron', '7777'], [COACH, 'Quentin', '2002'], [CLIENT, 'Léa', '1001']]) {
    await jsonp('/account/login', { email, prenom, pin });
  }
  const t = (await jsonp('/account/login', { email: ADMIN, pin: '7777' })).token;
  await jsonp('/api/boost/admin/collaborateurs', { email: COACH, role: 'collaborateur' }, 'POST', t);
  await creerAide(BASE).certifier({ email: COACH, pin: '2002', jetonAdmin: t });
  const r = await jsonp('/api/boost/admin/dossiers', { clientEmail: CLIENT, coachEmail: COACH }, 'POST', t);
  // Ce script part d'un dossier neuf. Relancé sur une base déjà utilisée, la
  // création est refusée (un seul Boost actif par client) : on le dit au lieu
  // de planter sur un « undefined » qui n'apprend rien.
  if (!r.ok) throw new Error('préparation impossible (' + (r.error || '?') + ') — relance sur une base vierge.');
  return { t, id: r.boost.id };
}

(async () => {
  const { t: jetonAdmin, id } = await semer();

  const nav = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const page = await nav.newPage({ viewport: { width: 1100, height: 950 } });
  page.setDefaultTimeout(5000);
  page.on('pageerror', (e) => erreurs.push('PAGE ERROR: ' + e.message));
  const reponsesKo = [];
  page.on('response', (r) => { if (r.status() >= 400) reponsesKo.push(r.request().method() + ' ' + new URL(r.url()).pathname + ' -> ' + r.status()); });

  const etape = async (nom, fn) => {
    try { await fn(); console.log('  ✓ ' + nom); }
    catch (e) { console.log('  ✗ ' + nom + ' — ' + e.message); erreurs.push(nom + ' : ' + e.message); }
  };
  const contenu = () => page.evaluate(() => document.body.textContent);

  async function seConnecter() {
    await page.goto(BASE + '/coach', { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.removeItem('mc-coach-session'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#ecLogin:not([hidden])');
    await page.fill('#ecEmail', COACH);
    await page.fill('#ecPin', '2002');
    await page.click('#ecGo');
    await page.waitForSelector('#ecListe:not([hidden])');
  }

  await etape('Mes clients → le client « À démarrer » s\'ouvre sur S1', async () => {
    await seConnecter();
    await page.locator('.ec-cli', { hasText: 'Léa' }).click();
    await page.waitForSelector('#ecS1');
    const t = await contenu();
    for (const bloc of ['Ton objectif', 'Comment tu manges', 'Ce qui te pose le plus de difficultés',
      'Ton action de la semaine', 'Journal photo', 'Notes Coach Nutrition']) {
      if (!t.includes(bloc)) throw new Error('bloc absent : ' + bloc);
    }
    if (!/environ 40 minutes/.test(t)) throw new Error('la durée du rendez-vous n\'est pas indiquée');
  });

  await etape('l\'action de la semaine est la zone mise en avant', async () => {
    const action = await page.locator('.ec-rdv-action').boundingBox();
    const autre = await page.locator('.ec-rdv-bloc').first().boundingBox();
    if (!action) throw new Error('zone action absente');
    // Elle se distingue par son fond : les autres blocs sont blancs.
    const fond = await page.locator('.ec-rdv-action').evaluate((e) => getComputedStyle(e).backgroundColor);
    const fondAutre = await page.locator('.ec-rdv-bloc').first().evaluate((e) => getComputedStyle(e).backgroundColor);
    if (fond === fondAutre) throw new Error('la zone action ne se distingue pas visuellement');
    if (action.width < 300 || autre.width < 300) throw new Error('mise en page effondrée');
  });

  await etape('refus de valider un rendez-vous vide, avec ce qui manque', async () => {
    await page.click('#rdvValider');
    await page.waitForSelector('.ec-rdv-manque');
    const t = await page.innerText('.ec-rdv-manque');
    for (const m of ['objectif', 'action de la semaine', 'journal photo']) {
      if (!new RegExp(m, 'i').test(t)) throw new Error('manque non signalé : ' + m);
    }
  });

  await etape('le rendez-vous se remplit : objectif, habitudes, difficultés', async () => {
    await page.locator('.ec-chip', { hasText: 'Perdre du poids' }).click();
    await page.fill('#s1objTexte', 'Perdre 8 kg avant l\'été, sans se priver au point de craquer.');
    await page.fill('[data-hab="petitDejeuner"]', 'Café seul, jamais faim le matin');
    await page.fill('[data-hab="diner"]', 'Tard, vers 21h30');
    await page.fill('[data-hab="collations"]', 'Biscuits vers 17h');
    await page.locator('.ec-chip', { hasText: 'Envies de sucre' }).click();
    await page.locator('.ec-chip', { hasText: 'Week-end' }).click();
    await page.fill('#s1difTexte', 'Craque surtout le dimanche soir.');
    await page.fill('#rdvNote', 'Horaires de nuit. Ne pas surcharger.');
  });

  await etape('« Enregistrer le brouillon » ne démarre PAS le Boost', async () => {
    await page.click('#rdvBrouillon');
    await page.waitForSelector('.ec-rdv-msg');
    if (!/Brouillon enregistré/.test(await page.innerText('.ec-rdv-msg'))) throw new Error('confirmation absente');
    // Le dossier n'a pas bougé : c'est le point le plus important du brouillon.
    const b = await page.evaluate(async (bid) => {
      const s = JSON.parse(localStorage.getItem('mc-coach-session'));
      const r = await fetch('/api/boost/coach/dossiers/' + bid, { headers: { Authorization: 'Bearer ' + s.token } });
      return (await r.json()).boost;
    }, id);
    if (b.statut !== 'a_demarrer') throw new Error('statut devenu ' + b.statut);
    if (b.etapesValidees !== 0) throw new Error('une Étape a été validée par un brouillon');
    if (b.demarreLe) throw new Error('les 16 semaines ont démarré sur un brouillon');
  });

  await etape('on quitte, on se reconnecte : le brouillon est retrouvé', async () => {
    await page.click('#ecOut');
    await page.waitForSelector('#ecLogin:not([hidden])');
    await seConnecter();
    await page.locator('.ec-cli', { hasText: 'Léa' }).click();
    await page.waitForSelector('#ecS1');

    // Les champs libres sont repeuplés…
    const txt = await page.inputValue('#s1objTexte');
    if (!/Perdre 8 kg/.test(txt)) throw new Error('objectif perdu : ' + txt);
    if (!/21h30/.test(await page.inputValue('[data-hab="diner"]'))) throw new Error('habitudes perdues');
    if (!/Horaires de nuit/.test(await page.inputValue('#rdvNote'))) throw new Error('notes coach perdues');
    // …et les pastilles cochées le sont restées.
    const objCoche = await page.locator('input[name="s1obj"]:checked').getAttribute('value');
    if (objCoche !== 'perte') throw new Error('objectif décoché : ' + objCoche);
    const difs = await page.locator('[data-dif]:checked').count();
    if (difs !== 2) throw new Error('difficultés cochées : ' + difs + ' au lieu de 2');
  });

  await etape('sans action de la semaine, la validation est toujours refusée', async () => {
    await page.check('#s1Photo');
    await page.click('#rdvValider');
    await page.waitForSelector('.ec-rdv-manque');
    const t = await page.innerText('.ec-rdv-manque');
    if (!/action de la semaine/i.test(t)) throw new Error('le manque attendu n\'est pas dit');
    if (/objectif/i.test(t)) throw new Error('l\'objectif est renseigné, il ne devrait plus manquer');
  });

  await etape('l\'action de la semaine se renseigne', async () => {
    // Le formulaire a été re-rendu après le refus : les saisies doivent tenir.
    if (!/Perdre 8 kg/.test(await page.inputValue('#s1objTexte'))) throw new Error('saisies perdues au refus');
    const photo = await page.isChecked('#s1Photo');
    if (!photo) throw new Error('la case journal photo a été perdue au refus');
    await page.fill('#actIntitule', 'Ajouter une source de protéines au petit-déjeuner');
    await page.fill('#actDetail', 'Œuf, skyr ou fromage blanc');
    await page.fill('#actFreq', '5 fois par semaine');
  });

  await etape('validation : le Boost démarre et l\'écran enchaîne sur S2', async () => {
    await page.click('#rdvValider');
    // Depuis le lot S2-S11, valider S1 ouvre directement le rendez-vous suivant :
    // le coach n'a rien à rouvrir pour enchaîner.
    await page.waitForSelector('#ecSuivi', { timeout: 8000 });
    const t = await contenu();
    if (!/Rendez-vous — Étape 2\/12/.test(t)) throw new Error('le rendez-vous S2 devrait s\'ouvrir');
    if (await page.locator('#ecS1').count() !== 0) throw new Error('le formulaire S1 est encore là');
  });

  await etape('les faits de la fiche sont à jour, sans rechargement', async () => {
    const t = await contenu();
    if (!/Étape 1\/12/.test(t)) throw new Error('compteur d\'Étape non mis à jour');
    if (!/En cours/.test(t)) throw new Error('le statut devrait être « En cours »');
    if (!/Prochaine : Étape 2/.test(t)) throw new Error('la prochaine Étape n\'est pas indiquée');
    if (!/Perdre 8 kg/.test(t)) throw new Error('le rappel du rendez-vous précédent devrait remonter dans S2');
    if (/undefined|NaN/.test(t)) throw new Error('trou dans la fiche');
  });

  await etape('le contenu du rendez-vous reste consultable dans l\'historique', async () => {
    await page.click('#ecHistoB');
    await page.waitForSelector('#ecHisto:not([hidden])');
    const t = await page.innerText('#ecHisto');
    for (const attendu of ['Étape 1/12', 'Perdre du poids', 'Perdre 8 kg', 'Ajouter une source de protéines']) {
      if (!t.includes(attendu)) throw new Error('information perdue après validation : ' + attendu);
    }
    // Les notes internes ne descendent PAS dans l'historique.
    if (/Horaires de nuit/.test(t)) throw new Error('une note interne a fuité dans l\'historique');
    await page.click('#ecHistoB');
  });

  await etape('S1 ne peut pas être validée une deuxième fois', async () => {
    const r = await page.evaluate(async (bid) => {
      const s = JSON.parse(localStorage.getItem('mc-coach-session'));
      const res = await fetch('/api/boost/coach/dossiers/' + bid + '/seances/1/valider', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.token },
        body: JSON.stringify({ donnees: { objectif: { choix: 'perte' }, journalPhotoExplique: true }, action: { intitule: 'x' } }),
      });
      return res.status;
    }, id);
    if (r !== 409) throw new Error('statut attendu 409, reçu ' + r);
  });

  await etape('la liste montre le client passé « En cours »', async () => {
    await page.click('#ecBack');
    await page.waitForSelector('#ecListe:not([hidden])');
    const t = await page.innerText('#ecActifs');
    if (!/En cours/.test(t)) throw new Error('le statut n\'a pas suivi dans la liste');
    if (!/Étape 1\/12/.test(t)) throw new Error('l\'Étape n\'a pas suivi dans la liste');
  });

  await etape('affichage mobile : le rendez-vous reste conduisible en 390 px', async () => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.locator('.ec-cli', { hasText: 'Léa' }).click();
    // S1 étant validée, le client s'ouvre désormais sur son rendez-vous suivant.
    await page.waitForSelector('#ecSuivi');
    const debord = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (debord > 2) throw new Error('débordement horizontal de ' + debord + ' px');
    await page.setViewportSize({ width: 1100, height: 950 });
  });

  await etape('aucune requête n\'a échoué en dehors des refus provoqués', async () => {
    const attendus = [
      'POST /api/boost/coach/dossiers/' + id + '/seances/1/valider -> 400',  // les deux refus, testés exprès
      'POST /api/boost/coach/dossiers/' + id + '/seances/1/valider -> 409',  // la double validation
    ];
    const inattendus = reponsesKo.filter((r) => !attendus.includes(r));
    if (inattendus.length) throw new Error('requêtes en échec inattendues : ' + [...new Set(inattendus)].join(', '));
  });

  // Captures : le rendez-vous vierge puis le rendez-vous validé.
  const OUT = process.env.OUT || '.';
  await page.screenshot({ path: OUT + '/s1-valide.png', fullPage: true });
  const autre = await jsonp('/api/boost/admin/dossiers', { clientEmail: ADMIN, coachEmail: COACH }, 'POST', jetonAdmin);
  if (autre.ok) {
    await page.click('#ecBack');
    await page.waitForSelector('#ecListe:not([hidden])');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#ecListe:not([hidden])');
    await page.locator('.ec-cli', { hasText: 'Patron' }).click();
    await page.waitForSelector('#ecS1');
    await page.screenshot({ path: OUT + '/s1-vierge.png', fullPage: true });
  }
  await nav.close();

  console.log('\n' + '='.repeat(60));
  if (erreurs.length) {
    console.log('ÉCHECS (' + erreurs.length + ') :');
    [...new Set(erreurs)].forEach((e) => console.log('  - ' + e));
    process.exit(1);
  }
  console.log('S1 — PREMIER RENDEZ-VOUS : tout est passé, aucune erreur console.');
})();
