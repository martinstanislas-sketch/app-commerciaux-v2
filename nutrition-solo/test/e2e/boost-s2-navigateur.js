// ============================================================================
//  E2E NAVIGATEUR — S2 à S11, la boucle de suivi.
//
//  Le parcours demandé : S1 validée → ouvrir S2 → constater l'action de S1 →
//  remplir partiellement → brouillon → quitter/revenir → terminer → valider →
//  Étape 2 terminée → nouvelle action active → ouvrir S3.
//
//  Puis, et c'est le point : REJOUER LE MÊME ÉCRAN PLUS LOIN DANS LA BOUCLE.
//  Un écran qui marche à S2 et pas à S7 serait un écran codé pour S2. On va
//  donc jusqu'à l'Étape 8 et on vérifie qu'on y retrouve exactement les mêmes
//  gestes, avec la bonne action à évaluer.
//
//  Hors `npm test` :
//    npm install --no-save playwright
//    NUTRITION_DB=/tmp/e2e.sqlite ADMIN_EMAIL=patron@exemple.fr PORT=3222 node server.js &
//    BASE=http://127.0.0.1:3222 node test/e2e/boost-s2-navigateur.js
// ============================================================================
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:3222';
const ADMIN = 'patron@exemple.fr';
const COACH = 'quentin.s2@exemple.fr';
const CLIENT = 'lea.s2@exemple.fr';
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
  await jsonp('/api/boost/admin/certification/' + encodeURIComponent(COACH),
    { statut: 'certifie', evaluateur: 'Stan Martin', dateCertification: '2026-07-15', scoreQcm: 88, resultatPratique: 'valide' }, 'PUT', t);
  const r = await jsonp('/api/boost/admin/dossiers', { clientEmail: CLIENT, coachEmail: COACH }, 'POST', t);
  // Ce script part d'un dossier neuf. Relancé sur une base déjà utilisée, la
  // création est refusée (un seul Boost actif par client) : on le dit au lieu
  // de planter sur un « undefined » qui n'apprend rien.
  if (!r.ok) throw new Error('préparation impossible (' + (r.error || '?') + ') — relance sur une base vierge.');
  const id = r.boost.id;

  // S1 est posée par l'API : ce script teste la BOUCLE, pas le rendez-vous
  // fondateur, déjà couvert par boost-s1-navigateur.js.
  const tc = (await jsonp('/account/login', { email: COACH, pin: '2002' })).token;
  await jsonp(`/api/boost/coach/dossiers/${id}/seances/1/valider`, {
    donnees: {
      objectif: { choix: 'perte', texte: 'Perdre 8 kg avant l\'été.' },
      habitudes: { diner: 'Tard, vers 21h30' },
      difficultes: { choix: ['temps', 'sucre'], precision: '' },
      journalPhotoExplique: true,
    },
    action: { intitule: 'Ajouter une source de protéines au petit-déjeuner', detail: 'Œuf ou skyr', frequence: '5 fois par semaine' },
    noteCoach: 'Note interne de S1.',
  }, 'POST', tc);
  return { t, tc, id };
}

(async () => {
  const { t: jetonAdmin, tc: jetonCoach, id } = await semer();

  const nav = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const page = await nav.newPage({ viewport: { width: 1100, height: 950 } });
  page.setDefaultTimeout(6000);
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
  const ouvrirClient = async () => {
    await page.locator('.ec-cli', { hasText: 'Léa' }).click();
    await page.waitForSelector('#ecSuivi');
  };


  // ⚠️ Attendre « #ecSuivi » après une validation ne prouve RIEN : le formulaire
  // de l'Étape précédente est encore dans le DOM le temps que la fiche se
  // recharge, donc l'attente est satisfaite immédiatement et on relit l'ancien
  // écran. On attend donc que le TITRE porte la nouvelle Étape.
  const attendreEtape = (n) => page.waitForFunction(
    (x) => {
      const t = document.querySelector('.ec-rdv-t2');
      return !!t && t.textContent.includes('Étape ' + x + '/12');
    }, n, { timeout: 10000 });

  // Conduit un rendez-vous de suivi de bout en bout, quelle que soit l'Étape.
  async function conduire(resultat, decision, action, adhesion) {
    // Correspondance EXACTE : « Réalisée » est contenu dans « Partiellement
    // réalisée » et « Non réalisée », un hasText large viserait trois pastilles.
    await page.locator('.ec-chip', { hasText: new RegExp('^' + resultat + '$') }).click();
    await page.fill('#svResCom', 'Constat de la période.');
    await page.locator('.ec-chip-dec', { hasText: decision }).click();
    if (action) await page.fill('#actIntitule', action);
    await page.locator('.ec-note', { hasText: new RegExp('^' + adhesion + '$') }).click();
    await page.click('#rdvValider');
  }

  await etape('S2 s\'ouvre sur l\'action décidée en S1', async () => {
    await seConnecter();
    await ouvrirClient();
    const t = await contenu();
    if (!/Rendez-vous — Étape 2\/12/.test(t)) throw new Error('titre inattendu');
    if (!/Ton action depuis le dernier rendez-vous/.test(t)) throw new Error('bloc action précédente absent');
    const prec = await page.innerText('.ec-rdv-prec');
    if (!/Ajouter une source de protéines au petit-déjeuner/.test(prec)) throw new Error('action de S1 non reprise');
    if (!/5 fois par semaine/.test(prec)) throw new Error('la fréquence n\'est pas reprise');
    // ZÉRO PRÉPARATION : ce qui s'est dit en S1 remonte tout seul.
    if (!/Perdre 8 kg/.test(t)) throw new Error('le rappel du rendez-vous précédent manque');
  });

  await etape('l\'écran suit l\'ordre du rendez-vous', async () => {
    const t = await contenu();
    const ordre = ['Ton action depuis le dernier rendez-vous', 'Comment ça s\'est passé',
      'Que fait-on de cette action', 'Ton action jusqu\'au prochain rendez-vous',
      'À quel point tu te sens capable', 'Notes Coach Nutrition', 'Valider le rendez-vous'];
    let pos = -1;
    for (const titre of ordre) {
      const i = t.indexOf(titre);
      if (i <= pos) throw new Error('ordre rompu à : ' + titre);
      pos = i;
    }
  });

  await etape('refus de valider un rendez-vous vide, avec ce qui manque', async () => {
    await page.click('#rdvValider');
    await page.waitForSelector('.ec-rdv-manque');
    const t = await page.innerText('.ec-rdv-manque');
    for (const m of ['résultat de l\'action précédente', 'décision', 'action jusqu\'au prochain', 'adhésion']) {
      if (!t.includes(m)) throw new Error('manque non signalé : ' + m);
    }
  });

  await etape('remplissage partiel puis « Enregistrer le brouillon »', async () => {
    await page.locator('.ec-chip', { hasText: 'Partiellement réalisée' }).click();
    await page.fill('#svResCom', 'Tenue 3 jours sur 5.');
    await page.fill('[data-bilan="difficultes"]', 'Le week-end reste dur');
    await page.fill('#rdvNote', 'Note interne de S2.');
    await page.click('#rdvBrouillon');
    await page.waitForSelector('.ec-rdv-msg');
    if (!/Brouillon enregistré/.test(await page.innerText('.ec-rdv-msg'))) throw new Error('confirmation absente');
  });

  await etape('le brouillon n\'a rien validé ni remplacé', async () => {
    const b = await page.evaluate(async (bid) => {
      const s = JSON.parse(localStorage.getItem('mc-coach-session'));
      const r = await fetch('/api/boost/coach/dossiers/' + bid + '/seances/2', { headers: { Authorization: 'Bearer ' + s.token } });
      return r.json();
    }, id);
    if (b.boost.etapesValidees !== 1) throw new Error('une Étape a été validée par un brouillon');
    // Le client suit encore l'action de S1 : la remplacer maintenant reviendrait
    // à changer sa consigne alors que le rendez-vous n'a pas eu lieu.
    if (b.seance.action.numero !== 1) throw new Error('l\'action active a changé sur un brouillon');
    if (b.seance.action.resultat) throw new Error('un résultat a été enregistré par un brouillon');
  });

  await etape('on quitte, on revient : le brouillon est retrouvé', async () => {
    await page.click('#ecOut');
    await page.waitForSelector('#ecLogin:not([hidden])');
    await seConnecter();
    await ouvrirClient();
    if (!/Tenue 3 jours sur 5/.test(await page.inputValue('#svResCom'))) throw new Error('commentaire perdu');
    if (!/week-end/i.test(await page.inputValue('[data-bilan="difficultes"]'))) throw new Error('bilan perdu');
    if (!/Note interne de S2/.test(await page.inputValue('#rdvNote'))) throw new Error('note coach perdue');
    const res = await page.locator('input[name="svRes"]:checked').getAttribute('value');
    if (res !== 'partielle') throw new Error('résultat décoché : ' + res);
  });

  await etape('« Continuer » reprend l\'action précédente sans la retaper', async () => {
    await page.locator('.ec-chip-dec', { hasText: 'Continuer' }).click();
    const v = await page.inputValue('#actIntitule');
    if (!/Ajouter une source de protéines/.test(v)) throw new Error('l\'action n\'a pas été reprise : ' + v);
    // On repart sur « Ajuster » pour la suite du scénario.
    await page.locator('.ec-chip-dec', { hasText: 'Ajuster' }).click();
    await page.fill('#actIntitule', 'Ajouter des protéines au petit-déjeuner ET au goûter');
  });

  await etape('validation de S2 : Étape 2 terminée, S3 ouverte', async () => {
    await page.locator('.ec-note', { hasText: /^8$/ }).click();
    await page.click('#rdvValider');
    await attendreEtape(3);
    const t = await contenu();
    if (!/Étape 2\/12/.test(t)) throw new Error('le compteur d\'Étape n\'a pas suivi');
  });

  await etape('S3 présente la nouvelle action, devenue la seule active', async () => {
    const prec = await page.innerText('.ec-rdv-prec');
    if (!/Ajouter des protéines au petit-déjeuner ET au goûter/.test(prec)) {
      throw new Error('nouvelle action non reprise — vu : ' + prec.replace(/\s+/g, ' ').slice(0, 200));
    }
    if (/Adhésion annoncée : 8\/10/.test(prec) === false) throw new Error('l\'adhésion annoncée manque');
    const b = await page.evaluate(async (bid) => {
      const s = JSON.parse(localStorage.getItem('mc-coach-session'));
      const r = await fetch('/api/boost/coach/dossiers/' + bid + '/seances/3', { headers: { Authorization: 'Bearer ' + s.token } });
      return r.json();
    }, id);
    const actives = b.seance.actions.filter((a) => a.statut === 'active');
    if (actives.length !== 1) throw new Error(actives.length + ' actions actives');
    if (actives[0].numero !== 2) throw new Error('la nouvelle action devrait porter le numéro 2');
    const ancienne = b.seance.actions.find((a) => a.numero === 1);
    if (ancienne.statut !== 'remplacee') throw new Error('l\'ancienne n\'est pas historisée');
    if (ancienne.resultat !== 'partielle') throw new Error('son résultat n\'est pas inscrit');
  });

  await etape('l\'historique montre S1 et S2', async () => {
    await page.click('#ecHistoB');
    await page.waitForSelector('#ecHisto:not([hidden])');
    const t = await page.innerText('#ecHisto');
    if (!/Étape 1\/12/.test(t) || !/Étape 2\/12/.test(t)) throw new Error('les deux rendez-vous devraient figurer');
    if (!/Partiellement réalisée/.test(t)) throw new Error('le résultat manque');
    if (!/Ajuster/.test(t)) throw new Error('la décision manque');
    if (!/adhésion 8\/10/.test(t)) throw new Error('l\'adhésion manque');
    // Les notes internes restent dans leur zone.
    if (/Note interne/.test(t)) throw new Error('une note interne a fuité dans l\'historique');
    await page.click('#ecHistoB');
  });

  // ---- LE POINT DU LOT : le même écran, plus loin dans la boucle ----------

  await etape('le même écran conduit les Étapes 3 à 7 sans rien changer', async () => {
    for (let n = 3; n <= 7; n++) {
      const t = await contenu();
      if (!new RegExp('Rendez-vous — Étape ' + n + '/12').test(t)) throw new Error('Étape ' + n + ' attendue');
      await conduire('Réalisée', 'Changer', 'Action décidée à l\'Étape ' + n, 9);
      await attendreEtape(n + 1);
    }
  });

  await etape('à l\'Étape 8, tout fonctionne comme à S2', async () => {
    const t = await contenu();
    if (!/Rendez-vous — Étape 8\/12/.test(t)) throw new Error('Étape 8 attendue');
    // Les mêmes gestes, la bonne action à évaluer : l'écran est bien générique.
    const prec = await page.innerText('.ec-rdv-prec');
    if (!/Action décidée à l'Étape 7/.test(prec)) throw new Error('mauvaise action à évaluer : ' + prec);
    for (const bloc of ['Comment ça s\'est passé', 'Que fait-on de cette action',
      'À quel point tu te sens capable', 'Notes Coach Nutrition']) {
      if (!t.includes(bloc)) throw new Error('bloc absent à l\'Étape 8 : ' + bloc);
    }
    if (await page.locator('.ec-note').count() !== 10) throw new Error('les 10 notes d\'adhésion devraient être là');
  });

  await etape('l\'Étape 8 se valide comme les autres', async () => {
    await conduire('Non réalisée', 'Changer', 'Action décidée à l\'Étape 8', 5);
    await attendreEtape(9);
  });

  await etape('l\'historique a suivi les huit rendez-vous', async () => {
    await page.click('#ecHistoB');
    await page.waitForSelector('#ecHisto:not([hidden])');
    const n = await page.locator('.ec-histo-l').count();
    if (n !== 8) throw new Error('8 rendez-vous attendus dans l\'historique, vus : ' + n);
    const t = await page.innerText('#ecHisto');
    if (!/Non réalisée/.test(t)) throw new Error('le dernier résultat manque');
    if (!/adhésion 5\/10/.test(t)) throw new Error('la dernière adhésion manque');
    await page.click('#ecHistoB');
  });

  await etape('une Étape validée n\'est plus modifiable', async () => {
    const r = await page.evaluate(async (bid) => {
      const s = JSON.parse(localStorage.getItem('mc-coach-session'));
      const res = await fetch('/api/boost/coach/dossiers/' + bid + '/seances/2', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.token },
        body: JSON.stringify({ donnees: { decision: 'changer' }, action: { intitule: 'Réécriture' } }),
      });
      return res.status;
    }, id);
    if (r !== 409) throw new Error('statut attendu 409, reçu ' + r);
  });

  await etape('affichage mobile : le rendez-vous reste conduisible en 390 px', async () => {
    await page.setViewportSize({ width: 390, height: 850 });
    await page.waitForTimeout(300);
    const debord = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (debord > 2) throw new Error('débordement horizontal de ' + debord + ' px');
    const t = await contenu();
    if (!/Ton action jusqu/.test(t)) throw new Error('la zone action a disparu en mobile');
    if (await page.locator('.ec-note').count() !== 10) throw new Error('les notes d\'adhésion ne tiennent pas');
    await page.setViewportSize({ width: 1100, height: 950 });
  });

  await etape('aucune requête n\'a échoué en dehors des refus provoqués', async () => {
    const attendus = [
      'POST /api/boost/coach/dossiers/' + id + '/seances/2/valider -> 400',  // le rendez-vous vide, testé exprès
      'PUT /api/boost/coach/dossiers/' + id + '/seances/2 -> 409',           // la réécriture, testée exprès
    ];
    const inattendus = reponsesKo.filter((r) => !attendus.includes(r));
    if (inattendus.length) throw new Error('requêtes en échec inattendues : ' + [...new Set(inattendus)].join(', '));
  });

  const OUT = process.env.OUT || '.';
  await page.screenshot({ path: OUT + '/s2-suivi.png', fullPage: true });
  await nav.close();

  console.log('\n' + '='.repeat(60));
  if (erreurs.length) {
    console.log('ÉCHECS (' + erreurs.length + ') :');
    [...new Set(erreurs)].forEach((e) => console.log('  - ' + e));
    process.exit(1);
  }
  console.log('S2-S11 — BOUCLE DE SUIVI : tout est passé, aucune erreur console.');
})();
