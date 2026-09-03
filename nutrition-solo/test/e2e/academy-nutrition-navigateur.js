// ============================================================================
//  E2E NAVIGATEUR — Nutrition Certifié, le parcours du certificateur.
//
//  CE QUE CE SCRIPT REGARDE, ET POURQUOI IL EXISTE :
//
//   ① le certificateur choisit un cas et LIT une consigne courte ;
//   ② « Commencer la mise en situation » ouvre la séance — et rien d'autre ;
//   ③ son rôle, puis ce qu'il dit spontanément ;
//   ④ ce que le client répond SI on l'interroge, en petites rubriques ;
//   ⑤ comment il réagit aux propositions du coach ;
//   ⑥ ce qui est attendu, et le point à observer ;
//   ⑦ neuf critères, deux états ;
//   ⑧ trois résultats d'axe calculés, puis le verdict.
//
//  L'ENJEU EST LA LISIBILITÉ AUTANT QUE LA MÉCANIQUE : un certificateur qui
//  doit chercher sa réplique pendant que le coach lui parle est un
//  certificateur qui improvise. On capture donc l'écran pour le regarder.
//
//  Hors `npm test` :
//    npm install --no-save playwright
//    NUTRITION_DB=/tmp/e2e-nutri.sqlite ADMIN_EMAIL=patron@exemple.fr PORT=3223 node server.js &
//    BASE=http://127.0.0.1:3223 node test/e2e/academy-nutrition-navigateur.js
// ============================================================================
const { chromium } = require('playwright');
const { AMORCE_QUESTIONS } = require('../../lib/academyQcm');

const BASE = process.env.BASE || 'http://127.0.0.1:3223';
const OUT = process.env.OUT || '.';
const ADMIN = 'patron@exemple.fr';
const EVA = 'eva.nu@exemple.fr';    // la certificatrice
const THEO = 'theo.nu@exemple.fr';  // le coach évalué

const CORRIGE = new Map(AMORCE_QUESTIONS.map((q) =>
  [q.enonce, q.choix.filter(([, bon]) => bon).map(([texte]) => texte)]));

const jsonp = (r, b, m, t) => fetch(BASE + r, {
  method: m || 'POST',
  headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
  body: b ? JSON.stringify(b) : undefined,
}).then((x) => x.json());
const get = (r, t) => fetch(BASE + r, { headers: { Authorization: 'Bearer ' + t } }).then((x) => x.json());

let echecs = 0;
const doit = (c, m) => { if (!c) { echecs++; console.log('    ✖ ' + m); } };
async function etape(titre, fn) {
  try { await fn(); console.log('  ✔ ' + titre); }
  catch (e) { echecs++; console.log('  ✖ ' + titre + '\n      ' + e.message); }
}

async function semer() {
  for (const [email, prenom, pin] of [[ADMIN, 'Patron', '7777'], [EVA, 'Eva', '3003'], [THEO, 'Théo', '4004']]) {
    await jsonp('/account/login', { email, prenom, pin });
  }
  const t = (await jsonp('/account/login', { email: ADMIN, pin: '7777' })).token;
  for (const e of [EVA, THEO]) {
    await jsonp('/api/boost/admin/collaborateurs', { email: e, role: 'collaborateur' }, 'POST', t);
  }
  await jsonp('/api/academy/admin/evaluateurs', { email: EVA, evaluateur: true }, 'POST', t);

  // La théorie de Théo par le VRAI chemin : contenus terminés, puis QCM réussi.
  const tt = (await jsonp('/account/login', { email: THEO, pin: '4004' })).token;
  const f = (await get('/api/academy/formation', tt)).formation;
  for (const c of f.modules.flatMap((m) => m.contenus)) {
    await jsonp(`/api/academy/contenus/${c.id}/terminer`, {}, 'POST', tt);
  }
  const q = (await jsonp('/api/academy/qcm/tentatives', {}, 'POST', tt)).tentative;
  for (const x of q.questions) {
    const bonnes = CORRIGE.get(x.enonce) || [];
    const ids = x.choix.filter((c) => bonnes.includes(c.texte)).map((c) => c.id);
    await jsonp(`/api/academy/qcm/tentatives/${q.id}/reponses/${x.id}`, { choix: ids }, 'PUT', tt);
  }
  const r = await jsonp(`/api/academy/qcm/tentatives/${q.id}/terminer`, {}, 'POST', tt);
  if (!r.tentative.resultat.reussie) throw new Error('la théorie devait être validée');
}

(async () => {
  await semer();
  const nav = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const page = await nav.newPage({ viewport: { width: 1100, height: 1200 } });
  page.setDefaultTimeout(10000);
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push('PAGE ERROR: ' + e.message));

  console.log('\n  NUTRITION CERTIFIÉ — le parcours du certificateur\n');

  await page.goto(BASE + '/academy');
  await page.waitForSelector('#acLogin:not([hidden])');
  await page.fill('#acEmail', EVA);
  await page.fill('#acPin', '3003');
  await page.click('#acGo');
  await page.waitForSelector('#acAccueil:not([hidden])');

  await etape('la certificatrice atteint la fiche de son coach', async () => {
    await page.click('#acRoleEval');
    await page.waitForSelector('#acEval:not([hidden])');
    await page.click(`[data-coach="${THEO}"]`);
    await page.waitForSelector('.ac-evd');
    await page.locator('.ac-evd [data-collab]').first().click();
    await page.waitForSelector('.ac-as-carte');
  });

  await etape('① UN SEUL BLOC AVANT DE COMMENCER : ce qu\'on lit au coach', async () => {
    const num = await page.$$eval('.ac-as-num', (n) => n.map((x) => x.textContent.trim()));
    doit(num.length === 1 && /① Lis ceci au coach/.test(num[0]),
      'avant de commencer, un seul bloc : ' + num.join(' | '));
    doit(await page.locator('#acEvCommencer').isVisible(), 'le bouton « Commencer » doit être offert');
    doit(await page.locator('.ac-as-dl').count() === 0,
      'aucune rubrique ne doit être visible tant que la séance n\'est pas ouverte');
    await page.screenshot({ path: OUT + '/nutrition-01-lire.png', fullPage: true });
  });

  await etape('② à ⑥ apparaissent APRÈS « Commencer la mise en situation »', async () => {
    await page.click('#acEvCommencer');
    await page.waitForSelector('.ac-as-dl');
    const num = await page.$$eval('.ac-as-num', (n) => n.map((x) => x.textContent.trim()));
    for (const attendu of ['② Ton rôle', '③ Dis spontanément',
      '④ Si le coach te questionne', '⑤ Si le coach propose…', '⑥ Ce qui est attendu']) {
      doit(num.some((x) => x === attendu), 'bloc manquant : ' + attendu + ' — vus : ' + num.join(' | '));
    }
    doit(await page.locator('.ac-as-obs-t').count() === 1, 'le point à observer doit être encadré');
    await page.screenshot({ path: OUT + '/nutrition-02-jouer.png', fullPage: true });
  });

  await etape('les rubriques sont lisibles : un intitulé court, une réplique', async () => {
    const lignes = await page.$$eval('.ac-as-dl .ac-as-dr', (n) => n.map((x) => ({
      cle: (x.querySelector('dt') || {}).textContent || '',
      valeur: (x.querySelector('dd') || {}).textContent || '',
    })));
    doit(lignes.length >= 15, 'il devait y avoir au moins 15 répliques prêtes, il y en a ' + lignes.length);
    for (const l of lignes) doit(l.valeur.trim().length > 0, 'une rubrique sans réplique : ' + l.cle);
    doit(lignes.some((l) => /Santé/i.test(l.cle)), 'la rubrique Santé doit être servie dans chaque cas');
    // AUCUN DÉBORDEMENT HORIZONTAL : le certificateur lit sur un portable.
    const large = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth);
    doit(!large, 'l\'écran déborde horizontalement');
  });

  await etape('⑦ neuf critères, deux états, aucune note', async () => {
    const criteres = await page.$$eval('.ac-gr-c, [data-critere]', (n) => n.length);
    doit(criteres >= 9, 'les neuf critères doivent être offerts (vus : ' + criteres + ')');
    await page.screenshot({ path: OUT + '/nutrition-03-grille.png', fullPage: true });
  });

  await etape('⑧ les trois résultats d\'axe se CALCULENT sous les yeux du certificateur', async () => {
    // 3/3 sur le premier axe, 2/3 sur le deuxième, 0/3 sur le troisième.
    const parAxe = [3, 2, 0];
    doit(await page.locator('.ac-gr-carte').count() === 3,
      'trois axes attendus, vus : ' + await page.locator('.ac-gr-carte').count());
    // CHAQUE CLIC REDESSINE LA GRILLE : on relocalise à chaque fois plutôt que
    // de garder des poignées, qui se détacheraient du DOM au premier rendu.
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        await page.locator('.ac-gr-carte').nth(i).locator('.ac-gr-c').nth(j)
          .locator(j < parAxe[i] ? '.ac-gr-oui' : '.ac-gr-non').click();
      }
    }
    const res = await page.$$eval('.ac-gr-carte .ac-gr-res', (n) => n.map((x) => x.textContent.trim()));
    doit(/Maîtrisé/.test(res[0]), 'axe 1 à 3/3 doit afficher « Maîtrisé » : ' + res[0]);
    doit(/À renforcer/.test(res[1]), 'axe 2 à 2/3 doit afficher « À renforcer » : ' + res[1]);
    doit(/Non maîtrisé/.test(res[2]), 'axe 3 à 0/3 doit afficher « Non maîtrisé » : ' + res[2]);

    // LE COMMENTAIRE DEVIENT OBLIGATOIRE dès qu'un critère n'est pas acquis :
    // c'est tout ce que le coach recevra pour progresser.
    const libelle = await page.locator('#acEvComT').textContent();
    doit(/obligatoire|améliorer/i.test(libelle), 'le commentaire doit s\'annoncer obligatoire : ' + libelle);
    await page.screenshot({ path: OUT + '/nutrition-04-axes.png', fullPage: true });
  });

  if (erreurs.length) { echecs++; console.log('\n  ERREURS PAGE :\n   ' + erreurs.join('\n   ')); }
  await nav.close();
  console.log('\n  ' + (echecs ? '✖ ' + echecs + ' problème(s)' : '✔ parcours conforme') + '\n');
  process.exit(echecs ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
