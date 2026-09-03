'use strict';
// ============================================================================
//  E2E NAVIGATEUR — LE DROIT DE CERTIFIER, DANS LA LIGNE DU COLLABORATEUR.
//
//  CE QUE CETTE SUITE ÉPROUVE, dans un vrai navigateur :
//
//   1. AUCUN DROIT N'EST PERDU. Une évaluatrice désignée AVANT le changement
//      apparaît « Certificateur » activé, sans qu'on ait rien migré.
//   2. LA BASCULE EST IMMÉDIATE, DES DEUX CÔTÉS. Activer ouvre « Évaluer &
//      certifier » à la personne concernée ; retirer le referme — et le
//      serveur le confirme, pas seulement l'écran.
//   3. L'ADMINISTRATEUR L'A PAR SON RÔLE : c'est dit, et l'interrupteur est
//      verrouillé — pas de second droit pour la même personne.
//   4. LA GARDE EST SERVEUR. Une certificatrice non administratrice qui
//      appelle la route au clavier reçoit un 403.
//   5. L'ANCIEN ÉCRAN A DISPARU d'« Administrer ».
//
//  Hors `npm test` :
//    npm install --no-save playwright
//    NUTRITION_DB=/tmp/e2e-certif.sqlite ADMIN_EMAIL=patron@exemple.fr PORT=3231 node server.js &
//    BASE=http://127.0.0.1:3231 node test/e2e/academy-certificateur-navigateur.js
// ============================================================================

const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:3231';
const ADMIN = 'patron@exemple.fr', EVA = 'eva.n@exemple.fr', THEO = 'theo.n@exemple.fr';
const erreurs = [];
const j = (r, b, m, t) => fetch(BASE + r, { method: m || 'POST',
  headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
  body: b ? JSON.stringify(b) : undefined }).then((x) => x.json());

(async () => {
  for (const [e, p] of [[ADMIN, 'Stan'], [EVA, 'Eva'], [THEO, 'Théo']]) {
    await j('/account/login', { email: e, prenom: p, pin: e === ADMIN ? '7777' : (e === EVA ? '5005' : '4004') });
  }
  const t = (await j('/account/login', { email: ADMIN, pin: '7777' })).token;
  // L'ADMINISTRATEUR EST AUSSI COLLABORATEUR ici : c'est le seul moyen
  // d'observer son interrupteur verrouillé, qui est une des propriétés du lot.
  for (const e of [ADMIN, EVA, THEO]) {
    await j('/api/boost/admin/collaborateurs', { email: e, role: 'collaborateur' }, 'POST', t);
  }
  // L'état d'AVANT : Eva évaluatrice par l'ancien mécanisme.
  await j('/api/academy/admin/evaluateurs', { email: EVA, evaluateur: true }, 'POST', t);

  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport: { width: 1280, height: 950 } });
  page.setDefaultTimeout(10000);
  page.on('pageerror', (e) => erreurs.push('PAGE ERROR: ' + e.message));
  const etape = async (nom, fn) => {
    try { await fn(); console.log('  ✓ ' + nom); }
    catch (e) { console.log('  ✗ ' + nom + ' — ' + e.message); erreurs.push(nom); }
  };
  const doit = (c, m) => { if (!c) throw new Error(m); };
  // L'ÉCRAN D'ARRIVÉE DÉPEND DU RÔLE : un administrateur qui est AUSSI
  // collaborateur arrive sur « Mes formations », pas sur l'administration. On
  // attend donc l'un ou l'autre plutôt que de parier sur le mauvais.
  const connecter = async (email, pin) => {
    await page.goto(BASE + '/academy', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.removeItem('mc-academy-session'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#acLogin:not([hidden])');
    await page.fill('#acEmail', email); await page.fill('#acPin', pin);
    await page.click('#acGo');
    await page.waitForSelector('#acAccueil:not([hidden]), #acAdmin:not([hidden]), #acEval:not([hidden])');
    await page.waitForSelector('#acSideNav [data-nav]');
  };
  const ligne = (mail) => page.locator('#acCollab .ac-adm-ligne', { hasText: mail });
  const ouvrirCollab = async () => {
    await page.click('[data-nav="collaborateurs"]');
    await page.waitForSelector('#acCollab:not([hidden])');
    await page.waitForSelector('.ac-adm-ligne');
  };

  console.log('\n  CERTIFICATEUR — administré dans Collaborateurs\n');

  await etape('l\'ancienne évaluatrice apparaît « Certificateur » activé', async () => {
    await connecter(ADMIN, '7777', '#acAdmin');
    await ouvrirCollab();
    const sw = ligne(EVA).locator('.ac-sw-in');
    doit(await sw.isChecked(), 'son interrupteur devrait être allumé');
    doit(/Certificateur/.test(await ligne(EVA).locator('.ac-cert-sw-t').textContent()), 'le libellé manque');
  });

  await etape('un collaborateur ordinaire a l\'interrupteur éteint', async () => {
    doit(!(await ligne(THEO).locator('.ac-sw-in').isChecked()), 'il ne devrait pas être certificateur');
  });

  await etape('activer : enregistré, avec un retour visuel discret', async () => {
    await ligne(THEO).locator('.ac-cert-sw').click();
    await page.waitForSelector('.ac-adm-flash');
    const msg = await page.locator('.ac-adm-flash').textContent();
    doit(/Droit de certificateur activé/.test(msg), 'le message attendu manque : ' + msg);
    doit(await ligne(THEO).locator('.ac-sw-in').isChecked(), 'l\'interrupteur doit rester allumé');
    // Et le serveur le confirme, pas seulement l'écran.
    const vu = await page.evaluate(async () => {
      const s = JSON.parse(localStorage.getItem('mc-academy-session'));
      const r = await fetch('/api/academy/admin/collaborateurs', { headers: { Authorization: 'Bearer ' + s.token } });
      return (await r.json()).collaborateurs;
    });
    doit(vu.find((c) => c.email === 'theo.n@exemple.fr').certificateur === true, 'le serveur ne l\'a pas enregistré');
  });

  await etape('l\'accès à « Évaluer & certifier » s\'ouvre pour lui', async () => {
    await connecter(THEO, '4004', '#acAccueil');
    doit(await page.locator('#acRoleEval').isVisible(), 'l\'entrée devrait lui être ouverte');
    await page.click('#acRoleEval');
    await page.waitForSelector('#acEval:not([hidden])');
    doit(/Évaluer & certifier/.test(await page.locator('#acEval').textContent()), 'l\'écran ne s\'ouvre pas');
  });

  await etape('retirer : l\'accès se referme', async () => {
    await connecter(ADMIN, '7777', '#acAdmin');
    await ouvrirCollab();
    await ligne(THEO).locator('.ac-cert-sw').click();
    await page.waitForFunction(() => /retiré/.test((document.querySelector('.ac-adm-flash') || {}).textContent || ''));
    await connecter(THEO, '4004', '#acAccueil');
    const visible = await page.evaluate(() => {
      const b = document.querySelector('#acRoleEval');
      return !!b && !b.hidden;
    });
    doit(!visible, 'l\'entrée devrait lui être refermée');
    const st = await page.evaluate(async () => {
      const s = JSON.parse(localStorage.getItem('mc-academy-session'));
      const r = await fetch('/api/academy/evaluateur/coachs?formation=toutes', { headers: { Authorization: 'Bearer ' + s.token } });
      return r.status;
    });
    doit(st === 403, 'le serveur devrait refuser, vu : ' + st);
  });

  await etape('l\'administrateur : droit inclus, interrupteur verrouillé', async () => {
    await connecter(ADMIN, '7777', '#acAdmin');
    await ouvrirCollab();
    const l = ligne(ADMIN);
    if (await l.count()) {
      doit(await l.locator('.ac-cert-sw-admin').count() === 1, 'son droit doit être annoncé comme inclus');
      doit(await l.locator('.ac-sw-in').count() === 0, 'aucun interrupteur basculable pour lui');
      doit(/inclus avec le rôle Administrateur/.test(await l.textContent()), 'la mention manque');
    } else {
      console.log('     (l\'administrateur n\'est pas collaborateur ici : cas non observable)');
    }
  });

  await etape('« Administrer » n\'a plus d\'onglet Évaluateurs', async () => {
    await page.click('[data-nav="administrer"]');
    await page.waitForSelector('#acAdmin:not([hidden])');
    const txt = await page.locator('#acAdmin').textContent();
    doit(!/Évaluateurs/.test(txt), 'l\'onglet subsiste : ' + txt.slice(0, 120));
    doit(await page.locator('#acAdmin .ac-adm-ong').count() === 0, 'une barre d\'onglets subsiste');
    doit(/Contenus|Modules|formation/i.test(txt), 'l\'écran des contenus doit s\'afficher directement');
  });

  await etape('un non-administrateur ne voit pas l\'écran Collaborateurs', async () => {
    await connecter(EVA, '5005', '#acAccueil');
    const visible = await page.evaluate(() => {
      const n = [...document.querySelectorAll('#acSideNav [data-nav]')].map((x) => x.dataset.nav);
      return n.includes('collaborateurs');
    });
    doit(!visible, 'l\'entrée Collaborateurs ne doit pas lui être proposée');
    const st = await page.evaluate(async () => {
      const s = JSON.parse(localStorage.getItem('mc-academy-session'));
      const r = await fetch('/api/academy/admin/evaluateurs', {
        method: 'POST', headers: { Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'theo.n@exemple.fr', evaluateur: true }) });
      return r.status;
    });
    doit(st === 403, 'le serveur devrait refuser sa tentative, vu : ' + st);
  });

  await nav.close();
  console.log('');
  if (erreurs.length) { console.log('  ✗ ' + erreurs.length + ' problème(s)'); process.exit(1); }
  console.log('  ✓ Tout est vert.\n');
})();
