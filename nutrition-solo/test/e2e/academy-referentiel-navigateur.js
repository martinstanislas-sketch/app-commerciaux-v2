'use strict';
// ============================================================================
//  E2E NAVIGATEUR — LE RÉFÉRENTIEL DU CERTIFICATEUR.
//
//  TROIS PROFILS, ÉPROUVÉS DANS UN VRAI NAVIGATEUR :
//
//   · CERTIFICATRICE PURE (ni collaboratrice, ni administratrice) — elle
//     ARRIVE sur « Évaluer & certifier », n'a PAS « Mon Academy », et consulte
//     le référentiel entier : contenus, QCM avec corrigé, mises en situation,
//     grille, critères de certification.
//   · COACH PUR — il garde « Mon Academy » et ne voit NI « Évaluer &
//     certifier » NI « Formations ». La route du référentiel lui répond 403,
//     pas seulement l'écran.
//   · LES DEUX RÔLES — les deux espaces s'ouvrent, et le corrigé du QCM lui
//     est masqué tant que sa propre théorie n'est pas validée.
//
//  ⚠️ ET RIEN N'EST ÉCRIT. On compte les lignes de progression, de tentative
//  et d'évaluation avant et après un parcours complet du référentiel.
//
//  Hors `npm test` :
//    npm install --no-save playwright
//    NUTRITION_DB=/tmp/e2e-referentiel.sqlite ADMIN_EMAIL=patron@exemple.fr PORT=3241 node server.js &
//    BASE=http://127.0.0.1:3241 node test/e2e/academy-referentiel-navigateur.js
// ============================================================================

const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:3241';
const ADMIN = 'patron@exemple.fr';
const CERT = 'carla.n@exemple.fr';   // certificatrice PURE
const COACH = 'theo.n@exemple.fr';   // coach pur
const DEUX = 'dana.n@exemple.fr';    // les deux rôles
const PIN = { [ADMIN]: '7777', [CERT]: '5005', [COACH]: '4004', [DEUX]: '6006' };
const erreurs = [];

const j = (r, b, m, t) => fetch(BASE + r, { method: m || 'POST',
  headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
  body: b ? JSON.stringify(b) : undefined }).then((x) => x.json());

(async () => {
  for (const e of [ADMIN, CERT, COACH, DEUX]) {
    await j('/account/login', { email: e, prenom: e.split('.')[0], pin: PIN[e] });
  }
  const t = (await j('/account/login', { email: ADMIN, pin: PIN[ADMIN] })).token;
  // SEULS COACH ET DANA SE FORMENT. Carla reste hors des collaborateurs : c'est
  // tout l'objet de cette suite.
  for (const e of [COACH, DEUX]) {
    await j('/api/boost/admin/collaborateurs', { email: e, role: 'collaborateur' }, 'POST', t);
  }
  for (const e of [CERT, DEUX]) {
    await j('/api/academy/admin/evaluateurs', { email: e, evaluateur: true }, 'POST', t);
  }

  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport: { width: 1280, height: 950 } });
  page.setDefaultTimeout(10000);
  page.on('pageerror', (e) => erreurs.push('PAGE ERROR: ' + e.message));
  // ⚠️ ON N'ÉCOUTE QUE `pageerror` — les erreurs de SCRIPT. Les messages de
  // console « failed to load resource » remontent aussi les refus que cette
  // suite PROVOQUE elle-même (les 403 qu'elle vérifie) et les couvertures
  // absentes d'une base neuve : les compter serait se plaindre de ce qu'on a
  // demandé. On garde donc la trace, sans en faire un échec.
  const reseau = [];
  page.on('response', (r) => { if (r.status() >= 400) reseau.push(r.status() + ' ' + r.url()); });

  const etape = async (nom, fn) => {
    try { await fn(); console.log('  ✓ ' + nom); }
    catch (e) { console.log('  ✗ ' + nom + ' — ' + e.message); erreurs.push(nom); }
  };
  const doit = (c, m) => { if (!c) throw new Error(m); };

  const connecter = async (email) => {
    await page.goto(BASE + '/academy', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.removeItem('mc-academy-session'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#acLogin:not([hidden])');
    await page.fill('#acEmail', email);
    await page.fill('#acPin', PIN[email]);
    await page.click('#acGo');
    await page.waitForSelector('#acAccueil:not([hidden]), #acEval:not([hidden]), #acAdmin:not([hidden])');
    await page.waitForSelector('#acSideNav [data-nav]');
  };
  const navigation = () => page.$$eval('#acSideNav [data-nav]', (n) => n.map((b) => b.dataset.nav));
  const appeler = (route) => page.evaluate(async (r) => {
    const s = JSON.parse(localStorage.getItem('mc-academy-session'));
    const rep = await fetch(r, { headers: { Authorization: 'Bearer ' + s.token } });
    return { status: rep.status, corps: await rep.json().catch(() => null) };
  }, route);

  const compter = async () => (await appeler('/api/academy/referentiel')) && page.evaluate(async () => {
    const s = JSON.parse(localStorage.getItem('mc-academy-session'));
    const r = await fetch('/api/academy/evaluateur/coachs?formation=toutes',
      { headers: { Authorization: 'Bearer ' + s.token } });
    const d = await r.json();
    // La somme des contenus terminés de tous les dossiers : si une consultation
    // écrivait une progression, elle bougerait.
    return (d.coachs || []).reduce((n, c) => n + ((c.progression && c.progression.termines) || 0), 0);
  });

  console.log('\n  RÉFÉRENTIEL — le certificateur consulte, il ne progresse pas\n');

  // =========================================================================
  //  1. LA CERTIFICATRICE PURE
  // =========================================================================

  await etape('elle ARRIVE sur « Évaluer & certifier », pas sur un tableau d\'apprenante', async () => {
    await connecter(CERT);
    doit(await page.locator('#acEval').isVisible(), 'elle devrait arriver sur l\'espace d\'évaluation');
    doit(!(await page.locator('#acAccueil').isVisible()), 'le tableau de l\'apprenant ne doit pas s\'ouvrir');
  });

  await etape('sa barre latérale n\'a PAS « Mon Academy »', async () => {
    const items = await navigation();
    doit(!items.includes('academy'), '« Mon Academy » ne doit pas lui être proposée : ' + items.join(', '));
    doit(items.includes('evaluer'), '« Évaluer & certifier » manque');
    doit(items.includes('referentiel'), '« Formations » manque');
    doit(items.includes('outils'), 'la Boîte à outils manque');
  });

  await etape('« Formations » ouvre le référentiel, avec ses trois familles', async () => {
    await page.click('[data-nav="referentiel"]');
    await page.waitForSelector('#acReferentiel:not([hidden])');
    const txt = await page.locator('#acReferentiel').textContent();
    doit(/Le référentiel des formations/.test(txt), 'le titre de l\'écran manque');
    const familles = await page.$$eval('#acReferentiel [data-refcat]', (n) => n.map((b) => b.textContent));
    for (const f of ['Essentiel', 'Expertise', 'Leader']) {
      doit(familles.some((x) => x.includes(f)), 'la famille ' + f + ' manque : ' + familles.join(' | '));
    }
    doit((await page.locator('#acReferentiel .ac-rf-c').count()) > 0, 'aucune formation affichée');
  });

  await etape('les cartes disent ce qu\'elles CONTIENNENT, jamais où l\'on en est', async () => {
    const txt = await page.locator('#acReferentiel').textContent();
    for (const interdit of ['Commencer cette formation', '% complété', 'Reprendre']) {
      doit(!txt.includes(interdit), '« ' + interdit + ' » n\'a rien à faire ici');
    }
    doit(/modules/.test(txt) && /questions/.test(txt), 'les dénombrements manquent');
    doit((await page.locator('#acReferentiel [data-ref]').first().textContent()) === 'Voir la formation',
      'le bouton doit dire « Voir la formation »');
  });

  await etape('la fiche ouvre les quatre volets du référentiel', async () => {
    await page.locator('#acReferentiel [data-ref]').first().click();
    await page.waitForSelector('#acReferentiel .ac-adm-onglets');
    const volets = await page.$$eval('#acReferentiel [data-refvolet]', (n) => n.map((b) => b.textContent));
    for (const v of ['Consulter le contenu', 'Voir le QCM théorique', 'Voir l’évaluation pratique',
      'Voir les critères de certification']) {
      doit(volets.includes(v), 'le volet « ' + v + ' » manque : ' + volets.join(' | '));
    }
  });

  await etape('le contenu se déplie : modules, chapitres, vidéo, texte', async () => {
    doit((await page.locator('#acReferentiel .ac-rf-mod').count()) > 0, 'aucun module');
    await page.locator('#acReferentiel [data-refcontenu]').first().click();
    await page.waitForSelector('#acReferentiel .ac-rf-corps');
    const ouvert = await page.locator('#acReferentiel .ac-rf-ct.on').count();
    doit(ouvert === 1, 'un seul contenu doit être déplié à la fois, vu : ' + ouvert);
  });

  await etape('le QCM théorique est servi AVEC son corrigé', async () => {
    await page.click('[data-refvolet="qcm"]');
    await page.waitForSelector('#acReferentiel .ac-rf-qs');
    const attendues = await page.locator('#acReferentiel .ac-rf-ch-ok').count();
    doit(attendues > 0, 'les réponses attendues devraient être marquées');
    const txt = await page.locator('#acReferentiel').textContent();
    doit(/Tirage/.test(txt) && /Validation/.test(txt), 'les règles du QCM manquent');
  });

  await etape('l\'évaluation pratique : cas, scénario, grille et critères', async () => {
    await page.click('[data-refvolet="pratique"]');
    await page.waitForSelector('#acReferentiel .ac-rf-cts');
    await page.locator('#acReferentiel [data-refcas]').first().click();
    await page.waitForSelector('#acReferentiel .ac-rf-corps');
    const txt = await page.locator('#acReferentiel').textContent();
    doit(/grille de notation/i.test(txt), 'la grille manque');
    doit((await page.locator('#acReferentiel .ac-rf-crits > li').count()) > 0, 'aucun critère affiché');
  });

  await etape('les critères de certification sont dits', async () => {
    await page.click('[data-refvolet="certification"]');
    await page.waitForSelector('#acReferentiel .ac-rf-etapes, #acReferentiel .ec-vide');
    const txt = await page.locator('#acReferentiel').textContent();
    doit(/Évaluation théorique|ne délivre pas de certification/.test(txt),
      'les étapes de certification manquent : ' + txt.slice(0, 200));
  });

  await etape('CONSULTER N\'ÉCRIT RIEN — pas une progression de plus', async () => {
    const avant = await compter();
    // Le référentiel entier, formation par formation.
    const cles = await page.evaluate(async () => {
      const s = JSON.parse(localStorage.getItem('mc-academy-session'));
      const r = await fetch('/api/academy/referentiel', { headers: { Authorization: 'Bearer ' + s.token } });
      return (await r.json()).formations.map((f) => f.cle);
    });
    for (const cle of cles) {
      const r = await appeler('/api/academy/referentiel/' + cle);
      doit(r.status === 200, cle + ' devrait s\'ouvrir, vu ' + r.status);
    }
    doit((await compter()) === avant, 'une consultation a modifié une progression');
  });

  await etape('le parcours d\'apprenant lui reste fermé, côté SERVEUR', async () => {
    for (const route of ['/api/academy/formation', '/api/academy/qcm', '/api/academy/certification']) {
      const r = await appeler(route);
      doit(r.status === 403, route + ' devrait répondre 403, vu ' + r.status);
    }
  });

  // =========================================================================
  //  2. LE COACH PUR
  // =========================================================================

  await etape('le coach garde « Mon Academy » et n\'a ni « Formations » ni « Évaluer »', async () => {
    await connecter(COACH);
    doit(await page.locator('#acAccueil').isVisible(), 'il devrait arriver sur son tableau');
    const items = await navigation();
    doit(items.includes('academy'), '« Mon Academy » manque');
    doit(!items.includes('referentiel'), '« Formations » ne doit pas lui être proposée');
    doit(!items.includes('evaluer'), '« Évaluer & certifier » ne doit pas lui être proposée');
  });

  await etape('et le référentiel lui répond 403, pas seulement un bouton masqué', async () => {
    const l = await appeler('/api/academy/referentiel');
    doit(l.status === 403, 'la liste devrait répondre 403, vu ' + l.status);
    const f = await appeler('/api/academy/referentiel/coach_nutrition');
    doit(f.status === 403, 'la fiche devrait répondre 403, vu ' + f.status);
  });

  // =========================================================================
  //  3. LES DEUX RÔLES
  // =========================================================================

  await etape('coach ET certificatrice : les deux espaces sont proposés', async () => {
    await connecter(DEUX);
    const items = await navigation();
    for (const cle of ['academy', 'evaluer', 'referentiel', 'outils']) {
      doit(items.includes(cle), 'l\'entrée ' + cle + ' manque : ' + items.join(', '));
    }
  });

  await etape('son corrigé est MASQUÉ tant que sa propre théorie n\'est pas validée', async () => {
    await page.click('[data-nav="referentiel"]');
    await page.waitForSelector('#acReferentiel .ac-rf-c');
    await page.locator('#acReferentiel [data-ref]').first().click();
    await page.waitForSelector('#acReferentiel .ac-adm-onglets');
    await page.click('[data-refvolet="qcm"]');
    await page.waitForSelector('#acReferentiel .ac-rf-qs');
    doit((await page.locator('#acReferentiel .ac-rf-ch-ok').count()) === 0,
      'aucune réponse ne doit être désignée : elle doit encore passer ce QCM');
    doit(await page.locator('#acReferentiel .ac-rf-avis').isVisible(),
      'la raison du masquage doit être dite');
    // Et elle voit tout de même les questions : c'est ce qu'elle évalue.
    doit((await page.locator('#acReferentiel .ac-rf-q').count()) > 0, 'les questions doivent rester lisibles');
  });

  await etape('elle garde SON parcours d\'apprenante, intact', async () => {
    const r = await appeler('/api/academy/formation');
    doit(r.status === 200, 'son parcours devrait s\'ouvrir, vu ' + r.status);
    await page.click('[data-nav="academy"]');
    await page.waitForSelector('#acAccueil:not([hidden])');
    doit(/complété/.test(await page.locator('#acAccueil').textContent()),
      'son tableau d\'apprenante doit rester celui d\'avant');
  });

  await nav.close();
  if (reseau.length) console.log('\n  (réponses ≥ 400 observées : ' + reseau.join(' | ') + ')');
  console.log(erreurs.length ? '\n  ✗ ' + erreurs.length + ' échec(s) : ' + erreurs.join(' | ') + '\n'
    : '\n  ✓ RÉFÉRENTIEL — les trois profils sont conformes\n');
  process.exit(erreurs.length ? 1 : 0);
})();
