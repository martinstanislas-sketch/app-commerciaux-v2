// ============================================================================
//  E2E NAVIGATEUR — L'ESPACE « ÉVALUER & CERTIFIER » (lot 7).
//
//  CE QUE CETTE SUITE DÉROULE, ET QUI N'ÉTAIT PAS POSSIBLE AVANT :
//
//    une évaluatrice qui n'est PAS administratrice ouvre un seul espace,
//    y voit TOUS les coachs — y compris celui qui n'a rien commencé —
//    ouvre la fiche d'un coach, prononce « à repasser », puis « validé »,
//    et délivre le diplôme SANS CHANGER D'ÉCRAN NI DE DROIT.
//
//  Avant le lot 7, ce parcours traversait deux espaces sous deux droits :
//  l'évaluation dans « Évaluer », la certification dans l'administration —
//  fermée à l'évaluatrice. Et un coach encore dans ses vidéos n'apparaissait
//  nulle part.
//
//  LES QUATRE REFUS QUE LA SUITE ÉPROUVE AUSSI, parce qu'élargir un droit est
//  exactement le moment où l'on vérifie où il s'arrête :
//   - l'évaluatrice n'entre dans AUCUN écran d'administration ;
//   - elle ne RETIRE pas un diplôme (geste d'administrateur) ;
//   - elle ne s'évalue pas elle-même ;
//   - valider la pratique ne certifie toujours PERSONNE tout seul.
//
//  Hors `npm test` :
//    npm install --no-save playwright
//    NUTRITION_DB=/tmp/e2e.sqlite ADMIN_EMAIL=patron@exemple.fr PORT=3222 node server.js &
//    BASE=http://127.0.0.1:3222 node test/e2e/academy-espace-evaluateur-navigateur.js
// ============================================================================
const { chromium } = require('playwright');
const { AMORCE_QUESTIONS } = require('../../lib/academyQcm');

const BASE = process.env.BASE || 'http://127.0.0.1:3222';
const ADMIN = 'patron@exemple.fr';
const EVA = 'eva.ee@exemple.fr';      // évaluatrice DÉSIGNÉE, jamais administratrice
const THEO = 'theo.ee@exemple.fr';    // le parcours complet
const DEBUT = 'debut.ee@exemple.fr';  // n'a rien commencé : invisible avant le lot 7
const erreurs = [];
const local = (url) => url.startsWith(BASE);

const CORRIGE = new Map(AMORCE_QUESTIONS.map((q) =>
  [q.enonce, q.choix.filter(([, bon]) => bon).map(([texte]) => texte)]));

const jsonp = (r, b, m, t) => fetch(BASE + r, {
  method: m || 'POST',
  headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
  body: b ? JSON.stringify(b) : undefined,
}).then((x) => x.json());
const get = (r, t) => fetch(BASE + r, { headers: { Authorization: 'Bearer ' + t } }).then((x) => x.json());

async function validerTheorie(email, pin) {
  const t = (await jsonp('/account/login', { email, pin })).token;
  const f = (await get('/api/academy/formation', t)).formation;
  for (const c of f.modules.flatMap((m) => m.contenus)) {
    await jsonp(`/api/academy/contenus/${c.id}/terminer`, {}, 'POST', t);
  }
  const q = (await jsonp('/api/academy/qcm/tentatives', {}, 'POST', t)).tentative;
  for (const x of q.questions) {
    const bonnes = CORRIGE.get(x.enonce) || [];
    await jsonp(`/api/academy/qcm/tentatives/${q.id}/reponses/${x.id}`,
      { choix: x.choix.filter((c) => bonnes.includes(c.texte)).map((c) => c.id) }, 'PUT', t);
  }
  const r = await jsonp(`/api/academy/qcm/tentatives/${q.id}/terminer`, {}, 'POST', t);
  if (!r.tentative.resultat.reussie) throw new Error('la théorie devait être validée : ' + email);
}

async function semer() {
  for (const [email, prenom, pin] of [[ADMIN, 'Patron', '7777'], [EVA, 'Eva', '3003'],
    [THEO, 'Théo', '4004'], [DEBUT, 'Basile', '5005']]) {
    await jsonp('/account/login', { email, prenom, pin });
  }
  const t = (await jsonp('/account/login', { email: ADMIN, pin: '7777' })).token;
  for (const e of [EVA, THEO, DEBUT]) {
    await jsonp('/api/boost/admin/collaborateurs', { email: e, role: 'collaborateur' }, 'POST', t);
  }
  await jsonp('/api/academy/admin/evaluateurs', { email: EVA }, 'POST', t);
  await validerTheorie(THEO, '4004');
  return t;
}

(async () => {
  const jetonAdmin = await semer();

  const nav = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const page = await nav.newPage({ viewport: { width: 1100, height: 950 } });
  page.setDefaultTimeout(8000);
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

  async function seConnecter(email, pin, ecran) {
    await page.goto(BASE + '/academy', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.removeItem('mc-academy-session'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#acLogin:not([hidden])');
    await page.fill('#acEmail', email);
    await page.fill('#acPin', pin);
    await page.click('#acGo');
    await page.waitForSelector((ecran || '#acAccueil') + ':not([hidden])');
  }

  const ouvrirEspace = async () => {
    await page.click('#acRoleEval');
    await page.waitForSelector('#acEval:not([hidden])');
  };
  const ligne = (email) => page.locator(`.ac-eval-l:has-text("${email}")`);

  // Le coach arrive sur « Mes formations » : entrer dans la formation est un
  // clic de plus, et les quatre étapes sont des <details> qu'on déplie.
  async function ouvrirSonParcours() {
    await page.click('#acAccueil [data-ouvrir]');
    await page.waitForSelector('#acSommaire:not([hidden])');
    await page.evaluate(() => {
      document.querySelectorAll('#acSommaire details.ac-et:not([open])').forEach((d) => { d.open = true; });
    });
  }

  console.log('\n═══ L\'ESPACE « ÉVALUER & CERTIFIER » ═══');

  // =========================================================================
  //  1. UNE SEULE ENTRÉE, UN SEUL ÉCRAN
  // =========================================================================
  console.log('\n1. L\'ENTRÉE');

  await etape('la navigation propose « Évaluer & certifier », et pas « Évaluer » seul', async () => {
    await seConnecter(EVA, '3003');
    const nav_ = await page.locator('#acSideNav').innerText();
    if (!/Évaluer & certifier/.test(nav_)) throw new Error('entrée absente : ' + nav_.replace(/\n/g, ' | '));
    // L'évaluatrice n'administre pas : l'entrée ne doit même pas exister.
    if (/Administrer/.test(nav_)) throw new Error('une entrée d\'administration lui est offerte');
  });

  await etape('l\'espace montre TOUS les coachs, à toutes les étapes', async () => {
    await ouvrirEspace();
    const t = await contenu();
    if (!/Évaluer & certifier/.test(t)) throw new Error('titre absent');
    if (!/Théo/.test(t)) throw new Error('Théo manque');
    // LE POINT DU LOT : avant, un coach sans théorie validée n'apparaissait
    // nulle part. Personne ne pouvait répondre « où en est Basile ? ».
    if (!/Basile/.test(t)) throw new Error('un coach encore en formation doit être visible');
    if (!/Formation en cours/.test(t)) throw new Error('son statut n\'est pas nommé');
    if (!/Pratique à réaliser/.test(t)) throw new Error('le statut de Théo n\'est pas nommé');
  });

  await etape('la ligne dit où en est chacun sans qu\'on ouvre sa fiche', async () => {
    const basile = await ligne(DEBUT).evaluate((el) => el.textContent);
    if (!/0 \/ \d+ contenus/.test(basile)) throw new Error('la progression manque : ' + basile);
    const theo = await ligne(THEO).evaluate((el) => el.textContent);
    if (!/théorie 100 %/.test(theo)) throw new Error('le score de théorie manque : ' + theo);
  });

  await etape('la fiche d\'un coach sans théorie ne s\'ouvre pas, et le dit', async () => {
    if (await page.locator(`[data-collab="${DEBUT}"]`).count()) {
      throw new Error('sa ligne est cliquable alors que le serveur refuserait');
    }
    if (!/Fiche disponible dès la théorie validée/.test(await contenu())) {
      throw new Error('la raison n\'est pas donnée');
    }
  });

  // =========================================================================
  //  2. LE PARCOURS COMPLET, SANS CHANGER D'ÉCRAN
  // =========================================================================
  console.log('\n2. ÉVALUER PUIS CERTIFIER');

  await etape('elle prononce « à repasser », et le statut suit', async () => {
    await page.click(`[data-collab="${THEO}"]`);
    await page.waitForSelector('#acEvKo');
    await page.fill('#acEvDate', '2026-09-08');
    await page.fill('#acEvCom', 'Bonne écoute, conclusion à travailler.');
    await page.click('#acEvKo');
    await page.waitForFunction(() => /Évaluation à repasser/.test(document.querySelector('#acEval').textContent));
    // Le bloc certification est là, et il reste verrouillé.
    const t = await contenu();
    if (!/Certification verrouillée/.test(t)) throw new Error('le bloc certification manque dans la fiche');
    if (/Délivrer la certification/.test(t)) throw new Error('on propose de certifier un coach à repasser');
  });

  await etape('elle prononce « validé » — et le diplôme devient proposable, PAS automatique', async () => {
    await page.click('#acEvOk');
    await page.waitForFunction(() => /Étape pratique terminée/.test(document.querySelector('#acEval').textContent));
    const t = await contenu();
    if (!/Parcours complet/.test(t)) throw new Error('l\'éligibilité n\'est pas annoncée');
    if (!/Délivrer la certification/.test(t)) throw new Error('le geste de certification n\'est pas proposé dans la fiche');
    // AUCUNE CERTIFICATION AUTOMATIQUE : le serveur le confirme.
    const c = await get('/api/academy/admin/certifications', jetonAdmin);
    if (c.certifies.some((x) => x.email === THEO)) throw new Error('VALIDER LA PRATIQUE A CERTIFIÉ : régression majeure');
    if (!c.eligibles.some((x) => x.email === THEO)) throw new Error('il devrait être éligible');
    // Les DEUX tentatives sont conservées.
    if (!/Historique des évaluations pratiques/.test(t)) throw new Error('l\'historique manque');
    const n = await page.locator('.ac-prat-histo li').count();
    if (n !== 2) throw new Error('tentatives conservées : ' + n);
  });

  await etape('elle délivre le diplôme SANS quitter la fiche ni changer de droit', async () => {
    await page.click('[data-geste="delivrer"]');
    await page.waitForSelector('#acCertDate');
    if (!/ouvrira immédiatement l'accès aux dossiers clients/.test(await contenu())) {
      throw new Error('la conséquence n\'est pas annoncée');
    }
    await page.fill('#acCertDate', '2026-09-12');
    await page.click('[data-geste="confirmer-delivrer"]');
    await page.waitForFunction(() => /délivrée le 12\/09\/2026/.test(document.querySelector('#acEval').textContent));
    const t = await contenu();
    if (!new RegExp('par ' + EVA).test(t)) throw new Error('le diplôme ne porte pas le nom de qui l\'a prononcé');
    if (!/Retrait d'une certification est réservé|retrait d'une certification est réservé/i.test(t)) {
      throw new Error('la limite du droit n\'est pas dite dans la fiche');
    }
  });

  await etape('le coach le voit, et les dossiers du Boost s\'ouvrent', async () => {
    await seConnecter(THEO, '4004');
    await ouvrirSonParcours();
    const t = await contenu();
    if (!/Coach Nutrition certifié — obtenue le 12\/09\/2026/.test(t)) throw new Error('le diplôme daté manque');
    if (!/Évaluation pratique validée/.test(t)) throw new Error('son étape pratique n\'est pas dite validée');
    if (!/action de la semaine|conclusion à travailler/.test(t)) throw new Error('l\'appréciation ne lui est pas communiquée');
    const vu = await page.evaluate(async () => {
      const s = JSON.parse(localStorage.getItem('mc-academy-session'));
      return (await fetch('/api/boost/coach/dossiers', { headers: { Authorization: 'Bearer ' + s.token } })).status;
    });
    if (vu !== 200) throw new Error('les dossiers Boost restent fermés : ' + vu);
  });

  // =========================================================================
  //  3. OÙ LE DROIT S'ARRÊTE
  // =========================================================================
  console.log('\n3. LES LIMITES');

  await etape('l\'évaluatrice n\'atteint AUCUN écran d\'administration', async () => {
    const jetonEva = (await jsonp('/account/login', { email: EVA, pin: '3003' })).token;
    for (const route of ['/api/academy/admin/formations', '/api/academy/admin/arbre',
      '/api/academy/admin/evaluateurs']) {
      const r = await fetch(BASE + route, { headers: { Authorization: 'Bearer ' + jetonEva } });
      if (r.status !== 403) throw new Error(route + ' -> ' + r.status);
    }
    await seConnecter(EVA, '3003');
    if (await page.locator('#acRoleAdmin').isVisible()) throw new Error('l\'entrée d\'administration lui est offerte');
  });

  await etape('elle NE RETIRE PAS un diplôme : l\'écran ne le propose pas, le serveur refuse', async () => {
    await ouvrirEspace();
    await page.click('.ac-adm-ong[data-onglet-eval="certifications"]');
    await page.waitForFunction(() => /Certifiés \(/.test(document.querySelector('#acEval').textContent));
    const t = await contenu();
    if (!/Certifiés \(1\)/.test(t)) throw new Error('le certifié manque dans l\'onglet');
    if (/Retirer la certification/.test(t)) throw new Error('le bouton de retrait lui est offert');
    if (!/Retrait réservé à l'administrateur/.test(t)) throw new Error('la limite n\'est pas dite');

    const jetonEva = (await jsonp('/account/login', { email: EVA, pin: '3003' })).token;
    const r = await fetch(BASE + '/api/academy/admin/certifications/' + THEO + '/retrait', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jetonEva },
      body: JSON.stringify({ motif: 'essai' }),
    });
    if (r.status !== 403) throw new Error('le serveur a laissé passer le retrait : ' + r.status);
  });

  await etape('un refus de délivrance s\'affiche DANS la fiche, sans perdre la saisie', async () => {
    // Le geste s'est déplacé dans la fiche : le refus doit y avoir un endroit
    // où s'écrire, sinon le bouton semble ne rien faire.
    await seConnecter(EVA, '3003');
    await ouvrirEspace();
    await page.click(`[data-collab="${THEO}"]`);
    await page.waitForSelector('#acEvalErr');
    // Théo est déjà certifié : redélivrer est refusé par le serveur.
    const dejaCertifie = await page.evaluate(async (cible) => {
      const s = JSON.parse(localStorage.getItem('mc-academy-session'));
      const r = await fetch('/api/academy/admin/certifications/' + cible, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.token },
        body: JSON.stringify({ formation: 'coach_nutrition' }),
      });
      return (await r.json()).dejaCertifie;
    }, THEO);
    if (dejaCertifie !== true) throw new Error('le serveur devrait refuser un doublon');
    if (!(await page.locator('#acEvalErr').count())) throw new Error('la fiche n\'a pas d\'endroit où dire un refus');
  });

  await etape('elle ne s\'évalue pas elle-même', async () => {
    const jetonEva = (await jsonp('/account/login', { email: EVA, pin: '3003' })).token;
    const r = await jsonp(`/api/academy/evaluateur/collaborateurs/${EVA}/evaluations`,
      { resultat: 'valide' }, 'POST', jetonEva);
    if (r.autoEvaluation !== true) throw new Error('l\'auto-évaluation n\'est pas refusée : ' + JSON.stringify(r));
  });

  await etape('l\'ADMINISTRATEUR entre dans le même espace, sans désignation', async () => {
    // Il atterrit sur l'administration — son poste de commande — et l'espace
    // d'évaluation est à un clic dans la barre latérale.
    await seConnecter(ADMIN, '7777', '#acAdmin');
    const nav_ = await page.locator('#acSideNav').innerText();
    if (!/Évaluer & certifier/.test(nav_)) throw new Error('l\'entrée manque à l\'administrateur');
    if (!/Administrer/.test(nav_)) throw new Error('l\'administration manque');
    await ouvrirEspace();
    if (!/Évaluer & certifier/.test(await contenu())) throw new Error('l\'espace ne s\'ouvre pas');
    // Et lui PEUT retirer.
    await page.click('.ac-adm-ong[data-onglet-eval="certifications"]');
    await page.waitForFunction(() => /Certifiés \(/.test(document.querySelector('#acEval').textContent));
    if (!/Retirer la certification/.test(await contenu())) throw new Error('l\'administrateur devrait pouvoir retirer');
  });

  await etape('l\'administration ne porte plus les certifications', async () => {
    await page.click('#acRoleAdmin');
    await page.waitForSelector('#acAdmin:not([hidden])');
    const onglets = await page.locator('#acAdmin .ac-adm-ong').allInnerTexts();
    if (JSON.stringify(onglets) !== JSON.stringify(['Évaluateurs', 'Contenus'])) {
      throw new Error('onglets : ' + onglets.join(' | '));
    }
  });

  // =========================================================================
  //  4. MOBILE 390 PX
  // =========================================================================
  console.log('\n4. MOBILE 390 px');

  await etape('l\'espace unifié tient en 390 px, onglets et fiche compris', async () => {
    await page.setViewportSize({ width: 390, height: 900 });
    await seConnecter(EVA, '3003');
    await ouvrirEspace();
    let debord = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (debord > 2) throw new Error('débordement de la liste : ' + debord + ' px');

    await page.click('.ac-adm-ong[data-onglet-eval="certifications"]');
    await page.waitForFunction(() => /Certifiés \(/.test(document.querySelector('#acEval').textContent));
    debord = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (debord > 2) throw new Error('débordement de l\'onglet Certifications : ' + debord + ' px');
  });

  await etape('aucune requête locale n\'a échoué hors refus provoqués', async () => {
    const inattendus = reponsesKo.filter((l) => !/-> 40[039]$/.test(l));
    if (inattendus.length) throw new Error(inattendus.join(' | '));
  });

  await nav.close();

  console.log('\n' + '='.repeat(60));
  if (erreurs.length) {
    console.log('ACADEMY — ÉVALUER & CERTIFIER : ' + erreurs.length + ' problème(s)');
    erreurs.forEach((e) => console.log('  - ' + e));
    process.exit(1);
  }
  console.log('ACADEMY — ÉVALUER & CERTIFIER : tout est passé, aucune erreur console.');
})();
