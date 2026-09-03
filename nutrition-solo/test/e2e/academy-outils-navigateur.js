'use strict';
// ============================================================================
//  E2E NAVIGATEUR — LA BOÎTE À OUTILS S'ADMINISTRE DEPUIS LA BIBLIOTHÈQUE.
//
//  CE QUE CETTE SUITE DÉROULE : un administrateur ouvre « Boîte à outils »
//  depuis la barre latérale, voit la bibliothèque que voient les
//  collaborateurs, et y fait TOUT ce qu'il faisait dans « Administrer » —
//  ajouter les quatre types, modifier, archiver, restaurer, supprimer, gérer
//  les catégories. Sans jamais passer par l'écran d'administration.
//
//  LES DEUX PROPRIÉTÉS QUI COMPTENT VRAIMENT, ET QUI SE CASSENT EN SILENCE :
//
//   1. LA VUE DU COLLABORATEUR N'A PAS BOUGÉ. Pas un bouton d'administration
//      dans son écran — ni visible, ni caché dans le HTML. Un bouton qui
//      s'affiche pour répondre 403 est un défaut d'écran à part entière.
//
//   2. IL N'Y A PLUS QU'UN SEUL ENDROIT. L'onglet « Administrer > Boîte à
//      outils » a disparu ; deux chemins vers un même geste, c'était deux
//      rendus à corriger le jour où il change.
//
//  Hors `npm test` (playwright n'est pas une dépendance de la suite) :
//    npm install --no-save playwright
//    NUTRITION_DB=/tmp/e2e-outils.sqlite ADMIN_EMAIL=patron@exemple.fr PORT=3223 node server.js &
//    BASE=http://127.0.0.1:3223 node test/e2e/academy-outils-navigateur.js
// ============================================================================

const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:3223';
const ADMIN = 'patron@exemple.fr';
const THEO = 'theo.out@exemple.fr';
const erreurs = [];
const local = (url) => url.startsWith(BASE);

const jsonp = (r, b, m, t) => fetch(BASE + r, {
  method: m || 'POST',
  headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
  body: b ? JSON.stringify(b) : undefined,
}).then((x) => x.json());

// Un PDF et un PNG MINIMAUX mais VALIDES : le serveur ne se fie pas à
// l'extension, il lit le type MIME annoncé — et refuserait un octet quelconque.
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\n' +
  'trailer<</Root 1 0 R>>\n%%EOF\n', 'utf8');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

async function semer() {
  for (const [email, prenom, pin] of [[ADMIN, 'Stan', '7777'], [THEO, 'Théo', '4004']]) {
    await jsonp('/account/login', { email, prenom, pin });
  }
  const t = (await jsonp('/account/login', { email: ADMIN, pin: '7777' })).token;
  await jsonp('/api/boost/admin/collaborateurs', { email: THEO, role: 'collaborateur' }, 'POST', t);
  return t;
}

(async () => {
  await semer();

  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport: { width: 1200, height: 1000 } });
  page.setDefaultTimeout(10000);
  page.on('pageerror', (e) => erreurs.push('PAGE ERROR: ' + e.message));
  page.on('requestfailed', (r) => { if (local(r.url())) erreurs.push('REQUETE KO: ' + r.url().slice(0, 90)); });
  const reponsesKo = [];
  page.on('response', (r) => {
    // La photo de la page de connexion est FACULTATIVE (cf. public/assets/
    // LISEZ-MOI.md) : son absence est un cas prévu, pas une panne.
    const chemin = local(r.url()) ? new URL(r.url()).pathname : '';
    if (chemin && chemin !== '/assets/login-hero.jpg' && r.status() >= 400) {
      reponsesKo.push(r.request().method() + ' ' + chemin + ' -> ' + r.status());
    }
  });

  const etape = async (nom, fn) => {
    try { await fn(); console.log('  ✓ ' + nom); }
    catch (e) { console.log('  ✗ ' + nom + ' — ' + e.message); erreurs.push(nom + ' : ' + e.message); }
  };
  const doit = (cond, message) => { if (!cond) throw new Error(message); };

  async function seConnecter(email, pin, ecran) {
    await page.goto(BASE + '/academy', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.removeItem('mc-academy-session'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#acLogin:not([hidden])');
    await page.fill('#acEmail', email);
    await page.fill('#acPin', pin);
    await page.click('#acGo');
    await page.waitForSelector(ecran + ':not([hidden])');
  }

  const ouvrirOutils = async () => {
    await page.click('[data-nav="outils"]');
    await page.waitForSelector('#acOutils:not([hidden])');
  };

  // La carte d'une ressource, retrouvée par son titre.
  const carte = (titre) => page.locator('#acOutils .ac-out-c', { hasText: titre });
  const titresGrille = () => page.$$eval('#acOutGrille .ac-out-c .ac-out-t', (n) => n.map((x) => x.textContent));

  // Le formulaire, du premier champ à l'enregistrement. C'est le MÊME que celui
  // de l'ancien écran d'administration — d'où les mêmes identifiants de champ.
  async function ajouter({ type, titre, description, categorie, fichier, yt, url }) {
    await page.click('[data-out="neuve"]');
    await page.waitForSelector('#acOutTitre');
    await page.selectOption('#acOutType2', type);
    await page.waitForSelector('#acOutTitre');
    await page.fill('#acOutTitre', titre);
    if (description) await page.fill('#acOutDesc', description);
    if (categorie) await page.selectOption('#acOutCat2', categorie);
    if (fichier) await page.setInputFiles('#acOutFichier', fichier);
    if (yt) await page.fill('#acOutYt', yt);
    if (url) await page.fill('#acOutUrl', url);
    await page.click('[data-out="enregistrer"]');
    await page.waitForSelector('#acOutGrille .ac-out-c');
  }

  console.log('\n  BOÎTE À OUTILS — administration dans la bibliothèque\n');

  // ==========================================================================
  //  1. L'ADMINISTRATEUR ARRIVE DANS LA BIBLIOTHÈQUE
  // ==========================================================================

  await etape('l\'administrateur ouvre la Boîte à outils depuis la barre latérale', async () => {
    await seConnecter(ADMIN, '7777', '#acAdmin');
    await ouvrirOutils();
    doit(await page.locator('.ac-out-filtres #acOutQ').isVisible(), 'la recherche a disparu');
    doit(await page.locator('#acOutCat').isVisible(), 'le filtre par catégorie a disparu');
    doit(await page.locator('#acOutType').isVisible(), 'le filtre par type a disparu');
  });

  await etape('la barre d\'administration est là, avec ses deux boutons', async () => {
    doit(await page.locator('[data-out="neuve"]').isVisible(), '« + Ajouter une ressource » manque');
    doit(await page.locator('[data-out="cats"]').isVisible(), '« Gérer les catégories » manque');
    const t = await page.locator('[data-out="neuve"]').textContent();
    doit(/Ajouter une ressource/.test(t), 'le bouton ne dit pas ce qu\'il fait : ' + t);
  });

  // ==========================================================================
  //  2. LES QUATRE TYPES, AJOUTÉS SANS QUITTER L'ÉCRAN
  // ==========================================================================

  await etape('ajouter un PDF', async () => {
    await ajouter({
      type: 'pdf', titre: 'Procédure E2E — PDF', description: 'Un document de test.',
      categorie: 'coaching', fichier: { name: 'procedure.pdf', mimeType: 'application/pdf', buffer: PDF },
    });
    doit((await titresGrille()).includes('Procédure E2E — PDF'), 'le PDF n\'apparaît pas dans la grille');
  });

  await etape('ajouter une image', async () => {
    await ajouter({
      type: 'image', titre: 'Affiche E2E — image', description: 'Un visuel de test.',
      categorie: 'nutrition', fichier: { name: 'affiche.png', mimeType: 'image/png', buffer: PNG },
    });
    doit((await titresGrille()).includes('Affiche E2E — image'), 'l\'image n\'apparaît pas');
  });

  await etape('ajouter une vidéo YouTube', async () => {
    await ajouter({
      type: 'video', titre: 'Tutoriel E2E — vidéo', description: 'Une vidéo de test.',
      yt: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
    doit((await titresGrille()).includes('Tutoriel E2E — vidéo'), 'la vidéo n\'apparaît pas');
  });

  await etape('ajouter un lien externe', async () => {
    await ajouter({
      type: 'lien', titre: 'Portail E2E — lien', description: 'Un lien de test.',
      url: 'https://exemple.fr/portail',
    });
    doit((await titresGrille()).includes('Portail E2E — lien'), 'le lien n\'apparaît pas');
  });

  // ==========================================================================
  //  3. MODIFIER, ARCHIVER, RESTAURER — DEPUIS LA CARTE
  // ==========================================================================

  await etape('modifier une ressource depuis sa carte', async () => {
    await carte('Portail E2E — lien').locator('[data-out="modifier"]').click();
    await page.waitForSelector('#acOutTitre');
    await page.fill('#acOutTitre', 'Portail E2E — renommé');
    await page.click('[data-out="enregistrer"]');
    await page.waitForSelector('#acOutGrille .ac-out-c');
    const titres = await titresGrille();
    doit(titres.includes('Portail E2E — renommé'), 'le nouveau titre n\'est pas là');
    doit(!titres.includes('Portail E2E — lien'), 'l\'ancien titre est resté');
  });

  await etape('archiver une ressource la retire de la bibliothèque', async () => {
    await carte('Tutoriel E2E — vidéo').locator('[data-out="archiver"]').click();
    await page.waitForFunction(() =>
      ![...document.querySelectorAll('#acOutGrille .ac-out-t')].some((x) => x.textContent.includes('Tutoriel E2E')));
    doit(!(await titresGrille()).includes('Tutoriel E2E — vidéo'), 'la ressource archivée reste affichée');
  });

  await etape('les archivées se retrouvent, et se restaurent', async () => {
    await page.click('[data-out="archives"]');
    await page.waitForSelector('.ac-out-c-off');
    const archivee = page.locator('.ac-out-c-off', { hasText: 'Tutoriel E2E' });
    doit(await archivee.count() > 0, 'la ressource archivée est introuvable');
    doit(await archivee.locator('[data-out="archiver"]').textContent() === 'Restaurer',
      'le bouton doit proposer « Restaurer »');
    await archivee.locator('[data-out="archiver"]').click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll('#acOutGrille .ac-out-c:not(.ac-out-c-off) .ac-out-t')]
        .some((x) => x.textContent.includes('Tutoriel E2E')));
  });

  await etape('supprimer demande confirmation, puis efface pour de bon', async () => {
    const cible = carte('Portail E2E — renommé');
    await cible.locator('[data-out="supprimer"]').click();
    // LE PREMIER CLIC N'EFFACE RIEN : il demande, et il dit ce qui va arriver.
    await page.waitForSelector('.ac-out-adm-avert');
    const avert = await page.locator('.ac-out-adm-avert').first().textContent();
    doit(/effacés définitivement/.test(avert), 'l\'avertissement ne dit pas ce qui arrive : ' + avert);
    doit((await titresGrille()).includes('Portail E2E — renommé'), 'la ressource a disparu avant confirmation');

    await page.click('[data-out="annuler-suppr"]');
    await page.waitForFunction(() => !document.querySelector('.ac-out-adm-avert'));
    doit((await titresGrille()).includes('Portail E2E — renommé'), 'annuler a tout de même supprimé');

    await carte('Portail E2E — renommé').locator('[data-out="supprimer"]').click();
    await page.waitForSelector('.ac-out-adm-avert');
    await page.click('[data-out="supprimer-ok"]');
    await page.waitForFunction(() =>
      ![...document.querySelectorAll('#acOutGrille .ac-out-t')].some((x) => x.textContent.includes('Portail E2E')));
  });

  // ==========================================================================
  //  4. LES CATÉGORIES, AU MÊME ENDROIT
  // ==========================================================================

  await etape('gérer les catégories : ajouter et renommer', async () => {
    await page.click('[data-out="cats"]');
    await page.waitForSelector('#acOutCatLib');
    await page.fill('#acOutCatLib', 'Juridique E2E');
    await page.click('[data-out="cat-ajouter"]');
    await page.waitForSelector('[data-out="cat-modifier"][data-cle="juridique_e2e"]');

    await page.click('[data-out="cat-modifier"][data-cle="juridique_e2e"]');
    await page.fill('#acOutCatNom', 'Juridique & contrats');
    await page.click('[data-out="cat-renommer"][data-cle="juridique_e2e"]');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('#acOutils .ac-adm-l-t')].some((x) => x.textContent.includes('Juridique & contrats')));
  });

  await etape('la nouvelle catégorie descend dans le filtre des collaborateurs', async () => {
    const options = await page.$$eval('#acOutCat option', (n) => n.map((x) => x.textContent));
    doit(options.includes('Juridique & contrats'), 'le filtre ne connaît pas la catégorie : ' + options.join(', '));
  });

  await etape('archiver une catégorie GARNIE demande confirmation', async () => {
    await page.click('[data-out="cat-archiver"][data-cle="coaching"]');
    await page.waitForSelector('.ac-adm-avert');
    const avert = await page.locator('.ac-adm-avert').first().textContent();
    doit(/Aucune ressource ne sera supprimée/.test(avert), 'l\'avertissement ne rassure pas : ' + avert);
    await page.click('[data-out="cat-annuler"]');
  });

  // ==========================================================================
  //  5. L'ANCIEN ONGLET A DISPARU
  // ==========================================================================

  await etape('« Administrer » n\'a plus d\'onglet Boîte à outils', async () => {
    await page.click('#acRoleAdmin');
    await page.waitForSelector('#acAdmin:not([hidden])');
    const onglets = await page.$$eval('#acAdmin .ac-adm-ong', (n) => n.map((x) => x.textContent.trim()));
    doit(!onglets.includes('Boîte à outils'), 'l\'onglet subsiste : ' + onglets.join(', '));
    // Depuis, « Évaluateurs » a suivi — le droit de certifier s'administre dans
    // Collaborateurs. Il ne reste donc AUCUN onglet : l'écran n'a plus qu'un
    // sujet, les contenus.
    doit(onglets.length === 0, 'il ne devait plus rester d\'onglets, il y en a ' + onglets.length);
    doit(await page.locator('#acAdmin [data-out]').count() === 0,
      'l\'écran d\'administration porte encore des gestes de ressources');
  });

  // ==========================================================================
  //  6. LE COLLABORATEUR — RIEN N'A CHANGÉ POUR LUI
  // ==========================================================================

  await etape('le collaborateur consulte la bibliothèque, sans aucun bouton d\'administration', async () => {
    await seConnecter(THEO, '4004', '#acAccueil');
    await ouvrirOutils();
    const titres = await titresGrille();
    doit(titres.includes('Procédure E2E — PDF'), 'le collaborateur ne voit pas les ressources');
    doit(await page.locator('#acOutils [data-out]').count() === 0,
      'un geste d\'administration est présent dans le HTML du collaborateur');
    doit(await page.locator('.ac-out-adm-barre').count() === 0, 'la barre d\'administration lui est servie');
    doit(await page.locator('.ac-out-adm-c').count() === 0, 'les actions de carte lui sont servies');
  });

  await etape('il cherche, filtre et ouvre comme avant', async () => {
    await page.fill('#acOutQ', 'Affiche E2E');
    await page.waitForFunction(() =>
      document.querySelectorAll('#acOutGrille .ac-out-c').length === 1);
    doit((await titresGrille())[0].includes('Affiche E2E'), 'la recherche ne filtre plus');
    await page.click('#acOutGrille [data-out-ouvrir]');
    await page.waitForSelector('#acOutVisu img.ac-out-img');
    await page.click('#acOutBack');
    await page.waitForSelector('#acOutGrille');
  });

  await etape('rien ne bouge sur son parcours : Mon Academy répond comme avant', async () => {
    await page.click('[data-nav="academy"]');
    await page.waitForSelector('#acAccueil:not([hidden])');
    doit(await page.locator('#acAccueil .ac-fc').count() > 0, 'les formations ont disparu de l\'accueil');
  });

  await nav.close();

  if (reponsesKo.length) erreurs.push('réponses en erreur : ' + reponsesKo.join(' | '));
  console.log('');
  if (erreurs.length) {
    console.log('  ✗ ' + erreurs.length + ' problème(s) :');
    erreurs.forEach((e) => console.log('    - ' + e));
    process.exit(1);
  }
  console.log('  ✓ Tout est vert.\n');
})();
