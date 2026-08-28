// ============================================================================
//  E2E NAVIGATEUR — My Coach Academy, évaluation pratique (lot 3).
//
//  Le parcours demandé, dans un vrai navigateur et avec DEUX comptes qui se
//  répondent :
//
//    THÉORIE NON VALIDÉE  → l'évaluation pratique est visiblement verrouillée ;
//    THÉORIE VALIDÉE      → elle devient « À réaliser » ;
//    L'ÉVALUATEUR         → ouvre une séance, le collaborateur voit « Résultat
//                           en attente » ;
//    « À REPASSER »       → l'étape n'est PAS validée, et le collaborateur lit
//                           l'appréciation de son évaluateur ;
//    NOUVELLE TENTATIVE   → « Évaluation validée », et la première tentative
//                           est TOUJOURS dans l'historique ;
//    ÉTAPE CLOSE          → plus aucune tentative ne peut s'ouvrir, ni depuis
//                           l'écran ni par appel direct à l'API ;
//    ÉCRAN D'ADMIN        → l'administrateur désigne et retire un évaluateur
//                           sans jamais devenir évaluateur lui-même ;
//    ET SURTOUT           → le collaborateur n'est PAS Coach Nutrition
//                           certifié, et les deux écrans le disent.
//
//  ⚠️ CE QUI EST VÉRIFIÉ EN PLUS, PARCE QUE C'EST TOUT L'ENJEU DU LOT :
//  qu'un collaborateur ordinaire ne voie AUCUN moyen de se valider lui-même —
//  ni bouton, ni route qui réponde.
//
//  Hors `npm test` :
//    npm install --no-save playwright
//    NUTRITION_DB=/tmp/e2e.sqlite ADMIN_EMAIL=patron@exemple.fr PORT=3222 node server.js &
//    BASE=http://127.0.0.1:3222 node test/e2e/academy-pratique-navigateur.js
// ============================================================================
// LOT A : « Évaluer » et « Administrer » ont quitté le parcours de l'apprenant
// pour l'en-tête (#acRoleEval / #acRoleAdmin). Ce sont des changements de rôle,
// pas des étapes de formation. Les boutons existent toujours dans le DOM mais
// restent `hidden` pour qui n'a pas le droit : on juge donc leur VISIBILITÉ,
// pas leur présence.
const { chromium } = require('playwright');
const { AMORCE_QUESTIONS } = require('../../lib/academyQcm');

const BASE = process.env.BASE || 'http://127.0.0.1:3222';
const ADMIN = 'patron@exemple.fr';
const THEO = 'theo.pr@exemple.fr';    // le collaborateur évalué
const EVA = 'eva.pr@exemple.fr';      // l'évaluatrice désignée
const NINA = 'nina.pr@exemple.fr';    // collaboratrice sans théorie validée
const erreurs = [];
const local = (url) => url.startsWith(BASE);

// Le corrigé de DÉMONSTRATION, reconstruit depuis l'amorçage : c'est ainsi que
// le test fait valider la théorie de Théo par le vrai chemin (lot 2), au lieu
// de bricoler la base pour arriver au lot 3.
const CORRIGE = new Map(AMORCE_QUESTIONS.map((q) =>
  [q.enonce, q.choix.filter(([, bon]) => bon).map(([texte]) => texte)]));

const jsonp = (r, b, m, t) => fetch(BASE + r, {
  method: m || 'POST',
  headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
  body: b ? JSON.stringify(b) : undefined,
}).then((x) => x.json());

const get = (r, t) => fetch(BASE + r, { headers: { Authorization: 'Bearer ' + t } }).then((x) => x.json());

async function semer() {
  for (const [email, prenom, pin] of [[ADMIN, 'Patron', '7777'], [THEO, 'Théo', '4004'],
    [EVA, 'Eva', '3003'], [NINA, 'Nina', '5005']]) {
    await jsonp('/account/login', { email, prenom, pin });
  }
  const t = (await jsonp('/account/login', { email: ADMIN, pin: '7777' })).token;
  for (const e of [THEO, EVA, NINA]) {
    await jsonp('/api/boost/admin/collaborateurs', { email: e, role: 'collaborateur' }, 'POST', t);
  }
  // Eva n'est PAS désignée ici : c'est l'administrateur qui le fera DEPUIS
  // L'ÉCRAN, au début du parcours. Faire tourner l'évaluation pratique ne doit
  // plus demander le moindre appel API à la main.

  // La théorie de Théo est validée par le vrai parcours des lots 1 et 2 : les
  // contenus terminés, puis le QCM répondu correctement.
  const tt = (await jsonp('/account/login', { email: THEO, pin: '4004' })).token;
  const f = (await get('/api/academy/formation', tt)).formation;
  for (const c of f.modules.flatMap((m) => m.contenus)) {
    await jsonp(`/api/academy/contenus/${c.id}/terminer`, {}, 'POST', tt);
  }
  return { t, tt };
}

// Fait valider la théorie d'un compte par le VRAI chemin des lots 1 et 2 :
// contenus terminés, puis QCM répondu correctement. Jamais en bricolant la base.
async function validerLaTheorie(email, pin) {
  const t = (await jsonp('/account/login', { email, pin })).token;
  const f = (await get('/api/academy/formation', t)).formation;
  for (const c of f.modules.flatMap((m) => m.contenus)) {
    await jsonp(`/api/academy/contenus/${c.id}/terminer`, {}, 'POST', t);
  }
  await validerQcm(t);
  return t;
}

async function validerQcm(jeton) {
  const t = (await jsonp('/api/academy/qcm/tentatives', {}, 'POST', jeton)).tentative;
  for (const q of t.questions) {
    const bonnes = CORRIGE.get(q.enonce);
    const ids = q.choix.filter((c) => bonnes.includes(c.texte)).map((c) => c.id);
    await jsonp(`/api/academy/qcm/tentatives/${t.id}/reponses/${q.id}`, { choix: ids }, 'PUT', jeton);
  }
  const r = await jsonp(`/api/academy/qcm/tentatives/${t.id}/terminer`, {}, 'POST', jeton);
  if (!r.tentative.resultat.reussie) throw new Error('la théorie devait être validée');
}

(async () => {
  const { t: jetonAdmin, tt: jetonTheo } = await semer();

  const nav = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const page = await nav.newPage({ viewport: { width: 1100, height: 1000 } });
  page.setDefaultTimeout(8000);
  page.on('pageerror', (e) => erreurs.push('PAGE ERROR: ' + e.message));
  page.on('requestfailed', (r) => { if (local(r.url())) erreurs.push('REQUETE KO: ' + r.url().slice(0, 90)); });

  const reponsesKo = [];
  // Refus VOLONTAIREMENT provoqués : on vérifie justement qu'ils ont lieu.
  const refusVoulus = [
    'GET /api/boost/coach/dossiers -> 403',
    'GET /api/academy/evaluateur/collaborateurs -> 403',
    'POST /api/academy/evaluateur/collaborateurs/' + THEO + '/evaluations -> 403',
    'POST /api/academy/evaluateur/collaborateurs/' + THEO + '/evaluations -> 409',
    'GET /api/academy/admin/evaluateurs -> 403',
  ];
  page.on('response', (r) => {
    if (!local(r.url()) || r.status() < 400) return;
    const ligne = r.request().method() + ' ' + decodeURIComponent(new URL(r.url()).pathname) + ' -> ' + r.status();
    if (!refusVoulus.includes(ligne)) reponsesKo.push(ligne);
  });

  const etape = async (nom, fn) => {
    try { await fn(); console.log('  ✓ ' + nom); }
    catch (e) { console.log('  ✗ ' + nom + ' — ' + e.message); erreurs.push(nom + ' : ' + e.message); }
  };
  // On ne lit que les écrans VISIBLES : une section masquée garde son texte dans
  // le DOM, et le compter ferait passer l'ancien écran pour l'écran courant.
  const contenu = () => page.evaluate(() =>
    [...document.querySelectorAll('main > section, main > p')].filter((s) => !s.hidden)
      .map((s) => s.textContent).join('\n'));

  async function seConnecter(email, pin, attendu) {
    await page.goto(BASE + '/academy', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.removeItem('mc-academy-session'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#acLogin:not([hidden])');
    await page.fill('#acEmail', email);
    await page.fill('#acPin', pin);
    await page.click('#acGo');
    // Sans écran attendu, on vise la formation : on passe donc par l'accueil.
    if (attendu) await page.waitForSelector(attendu + ':not([hidden])');
    else await entrerFormation();
  }

  // Depuis la refonte, les quatre étapes sont des accordéons : seule l'étape
  // courante est dépliée. Pour agir dans une autre, on l'ouvre — comme un humain.
  async function ouvrirEtapes() {
    await page.evaluate(() => {
      document.querySelectorAll('#acSommaire details.ac-et:not([open])').forEach((d) => { d.open = true; });
    });
  }

  // DEPUIS LE LOT A, LE COLLABORATEUR ARRIVE SUR « MES FORMATIONS ».
  // Entrer dans une formation est un clic de plus — c'est le nouveau parcours,
  // pas un détour de test : l'accueil est le point d'entrée, même avec une
  // seule formation.
  async function entrerFormation(libelle) {
    await page.waitForSelector('#acAccueil:not([hidden])');
    const carte = libelle
      // La carte est un <article> ; c'est son bouton qui ouvre la formation.
      ? page.locator('#acAccueil .ac-fc', { hasText: libelle }).locator('[data-ouvrir]')
      : page.locator('#acAccueil [data-ouvrir]');
    await carte.first().click();
    await page.waitForSelector('#acSommaire:not([hidden])');
  }

  // =========================================================================
  //  0. L'ADMINISTRATEUR DÉSIGNE L'ÉVALUATRICE — DEPUIS L'ÉCRAN
  // =========================================================================
  console.log('\n0. GESTION DES ÉVALUATEURS');

  await etape('l\'administrateur entre dans l\'Academy et voit la gestion', async () => {
    // Il n'est ni collaborateur ni évaluateur : il arrive directement sur ce
    // qui le concerne, sans sommaire vide.
    await seConnecter(ADMIN, '7777', '#acAdmin');
    const t = await contenu();
    if (!/Évaluateurs/.test(t)) throw new Error('titre absent');
    if (!/Être administrateur ne suffit pas/.test(t)) throw new Error('la règle n\'est pas rappelée');
    if (!/0 évaluateur autorisé/.test(t)) throw new Error('le compteur devrait partir de zéro : ' + (t.match(/\d+ évaluateurs? autorisés?/) || ['—'])[0]);
  });

  await etape('chaque compte affiche son état « Évaluateur / Non évaluateur »', async () => {
    const lignes = await page.locator('.ac-adm-l').count();
    if (lignes < 3) throw new Error('les trois collaborateurs devraient être listés, vu : ' + lignes);
    if (await page.locator('.ac-etat-eval-oui').count() !== 0) throw new Error('personne ne devrait être évaluateur');
    if (await page.locator('.ac-etat-eval-non').count() !== lignes) throw new Error('tous devraient être « Non évaluateur »');
    const t = await contenu();
    if (!/Non évaluateur/.test(t)) throw new Error('l\'état n\'est pas nommé');
    if (!/Désigner comme évaluateur/.test(t)) throw new Error('le geste n\'est pas proposé');
  });

  await etape('il désigne Eva évaluatrice, et l\'état bascule', async () => {
    await page.locator('.ac-adm-l', { hasText: EVA }).getByText('Désigner comme évaluateur').click();
    await page.waitForFunction((mail) => {
      const l = [...document.querySelectorAll('.ac-adm-l')].find((x) => x.textContent.includes(mail));
      return l && l.querySelector('.ac-etat-eval-oui');
    }, EVA);
    // On lit le texte BRUT : la pastille est en petites capitales par CSS, et
    // innerText renverrait le texte transformé.
    const ligne = page.locator('.ac-adm-l', { hasText: EVA });
    const brut = await ligne.evaluate((el) => el.textContent);
    // textContent colle les éléments sans espace : pas de \b utilisable ici.
    if (!brut.replace('Non évaluateur', '').includes('Évaluateur')) throw new Error('l\'état n\'a pas basculé : ' + brut);
    if (!/Retirer le droit d'évaluer/.test(brut)) throw new Error('le geste inverse n\'est pas proposé');
    if (/Désigner comme évaluateur/.test(brut)) throw new Error('on propose encore de la désigner');
    if (!/1 évaluateur autorisé/.test(await contenu())) throw new Error('le compteur n\'a pas suivi');
    // Et le SERVEUR l'a bien enregistré, ce qui est la seule chose qui compte.
    const moi = await get('/api/academy/moi', (await jsonp('/account/login', { email: EVA, pin: '3003' })).token);
    if (moi.evaluateur !== true) throw new Error('le droit n\'a pas été accordé côté serveur');
  });

  await etape('l\'administrateur ne s\'est pas rendu évaluateur au passage', async () => {
    const moi = await get('/api/academy/moi', jetonAdmin);
    if (moi.admin !== true) throw new Error('il devrait rester administrateur');
    if (moi.evaluateur !== false) throw new Error('ADMINISTRER A RENDU ÉVALUATEUR : régression majeure');
    const t = await contenu();
    // Il apparaît dans la liste comme les autres, sans droit.
    if (/Espace évaluateur/.test(t)) throw new Error('un espace d\'évaluation lui est offert');
  });

  await etape('le retrait demande une confirmation, et l\'annulation ne fait rien', async () => {
    const ligne = page.locator('.ac-adm-l', { hasText: EVA });
    await ligne.getByText('Retirer le droit d\'évaluer').click();
    await page.waitForSelector('.ac-adm-l-retrait');
    const t = await contenu();
    if (!/Confirmer le retrait/.test(t)) throw new Error('aucune confirmation demandée');
    if (!/ne pourra plus enregistrer d'évaluation pratique/.test(t)) throw new Error('la conséquence n\'est pas dite');
    if (!/restent dans l'historique/.test(t)) throw new Error('l\'effet sur l\'historique n\'est pas précisé');

    await ligne.getByText('Annuler').click();
    await page.waitForFunction(() => !document.querySelector('.ac-adm-l-retrait'));
    if (!/1 évaluateur autorisé/.test(await contenu())) throw new Error('l\'annulation a retiré le droit');
    const moi = await get('/api/academy/moi', (await jsonp('/account/login', { email: EVA, pin: '3003' })).token);
    if (moi.evaluateur !== true) throw new Error('le droit a sauté malgré l\'annulation');
  });

  await etape('confirmer le retrait le retire vraiment, puis on le rend', async () => {
    const ligne = page.locator('.ac-adm-l', { hasText: EVA });
    await ligne.getByText('Retirer le droit d\'évaluer').click();
    await page.waitForSelector('.ac-adm-l-retrait');
    await ligne.getByText('Confirmer le retrait').click();
    await page.waitForFunction(() => /0 évaluateur autorisé/.test(document.querySelector('#acAdmin').textContent));
    let moi = await get('/api/academy/moi', (await jsonp('/account/login', { email: EVA, pin: '3003' })).token);
    if (moi.evaluateur !== false) throw new Error('le retrait n\'a pas pris côté serveur');

    // On la redésigne : c'est elle qui évaluera dans la suite du parcours.
    await ligne.getByText('Désigner comme évaluateur').click();
    await page.waitForFunction(() => /1 évaluateur autorisé/.test(document.querySelector('#acAdmin').textContent));
    moi = await get('/api/academy/moi', (await jsonp('/account/login', { email: EVA, pin: '3003' })).token);
    if (moi.evaluateur !== true) throw new Error('la redésignation n\'a pas pris');
  });

  await etape('l\'écran de gestion reste lisible en 390 px', async () => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.waitForTimeout(300);
    const debord = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (debord > 2) throw new Error('débordement de ' + debord + ' px');
    const b = await page.locator('.ac-adm-l', { hasText: EVA }).locator('.ec-btn').first().boundingBox();
    if (!b || b.height < 34) throw new Error('bouton trop petit en mobile');
    if (b.width < 200) throw new Error('bouton écrasé en mobile : ' + Math.round(b.width) + ' px');
    await page.setViewportSize({ width: 1100, height: 1000 });
  });

  // =========================================================================
  //  1. THÉORIE NON VALIDÉE → PRATIQUE VERROUILLÉE
  // =========================================================================
  console.log('\n1. THÉORIE NON VALIDÉE');

  await etape('la pratique est visiblement verrouillée, et le dit', async () => {
    await seConnecter(NINA, '5005');
    const t = await contenu();
    if (!/Évaluation pratique — Coach Nutrition/.test(t)) throw new Error('la carte de pratique est absente');
    if (!/Non accessible/.test(t)) throw new Error('l\'état « Non accessible » manque');
    if (!/valide d'abord l'évaluation théorique/i.test(t)) throw new Error('le verrou n\'explique pas quoi faire');
  });

  await etape('aucun bouton ne permet de lancer ou de valider quoi que ce soit', async () => {
    if (await page.locator('#acRoleEval').isVisible()) throw new Error('un accès évaluateur est offert à une collaboratrice');
    const t = await contenu();
    if (/Enregistrer : évaluation validée|Ouvrir mes évaluations/.test(t)) throw new Error('un geste d\'évaluateur est offert');
  });

  await etape('et l\'API refuse aussi, pas seulement l\'écran', async () => {
    const vu = await page.evaluate(async (cible) => {
      const s = JSON.parse(localStorage.getItem('mc-academy-session'));
      const h = { Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' };
      const liste = await fetch('/api/academy/evaluateur/collaborateurs', { headers: h });
      const auto = await fetch('/api/academy/evaluateur/collaborateurs/' + cible + '/evaluations',
        { method: 'POST', headers: h, body: JSON.stringify({ resultat: 'valide' }) });
      return { liste: liste.status, auto: auto.status };
    }, THEO);
    if (vu.liste !== 403) throw new Error('une collaboratrice liste les dossiers : ' + vu.liste);
    if (vu.auto !== 403) throw new Error('une collaboratrice peut évaluer : ' + vu.auto);
  });

  // =========================================================================
  //  2. THÉORIE VALIDÉE → PRATIQUE « À RÉALISER »
  // =========================================================================
  console.log('\n2. THÉORIE VALIDÉE');

  await etape('Théo valide sa théorie : la pratique passe à « À réaliser »', async () => {
    await validerQcm(jetonTheo);
    await seConnecter(THEO, '4004');
    const t = await contenu();
    if (!/Théorie validée/.test(t)) throw new Error('la théorie devrait être validée');
    if (!/À réaliser/.test(t)) throw new Error('l\'état « À réaliser » manque');
    if (!/Ta théorie est validée : tu peux passer à l'évaluation pratique/.test(t)) {
      throw new Error('la prochaine étape n\'est pas annoncée clairement');
    }
    if (!/certification Coach Nutrition sera prononcée dans un second temps/.test(t)) {
      throw new Error('le rappel « ceci n\'est pas la certification » manque');
    }
  });

  await etape('un collaborateur, même à théorie validée, ne s\'auto-valide pas', async () => {
    if (await page.locator('#acRoleEval').isVisible()) throw new Error('accès évaluateur offert à un simple collaborateur');
    const vu = await page.evaluate(async (moi) => {
      const s = JSON.parse(localStorage.getItem('mc-academy-session'));
      const h = { Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' };
      const r = await fetch('/api/academy/evaluateur/collaborateurs/' + moi + '/evaluations',
        { method: 'POST', headers: h, body: JSON.stringify({ resultat: 'valide' }) });
      return r.status;
    }, THEO);
    if (vu !== 403) throw new Error('un collaborateur a pu se valider lui-même : ' + vu);
    if (!/À réaliser/.test(await contenu())) throw new Error('son état a bougé');
  });

  // =========================================================================
  //  3. L'ÉVALUATRICE OUVRE UNE SÉANCE
  // =========================================================================
  console.log('\n3. L\'ÉVALUATRICE');

  await etape('Eva voit son espace évaluateur, et Théo dans la liste', async () => {
    await seConnecter(EVA, '3003');
    // Lot A : l'entrée « Évaluer » est dans l'en-tête, plus dans le parcours.
    if (!(await page.locator('#acRoleEval').isVisible())) throw new Error('l\'entrée évaluateur manque');
    await page.click('#acRoleEval');
    await page.waitForSelector('#acEval:not([hidden])');
    const t = await contenu();
    if (!/Évaluations pratiques/.test(t)) throw new Error('titre absent');
    if (!/Théo/.test(t)) throw new Error('Théo devrait être éligible');
    if (/Nina/.test(t)) throw new Error('Nina n\'a pas validé sa théorie : elle ne doit pas apparaître');
  });

  await etape('la fiche de Théo affiche son état et l\'historique vide', async () => {
    await page.locator('.ac-eval-l', { hasText: 'Théo' }).click();
    await page.waitForSelector('#acEvOk');
    const t = await contenu();
    if (!/Théorie validée — score : 100 %/.test(t)) throw new Error('le score théorique n\'est pas rappelé');
    if (!/À réaliser/.test(t)) throw new Error('l\'état courant manque');
    if (!/ne certifie pas le collaborateur/.test(t)) throw new Error('l\'évaluatrice doit lire que son verdict ne certifie pas');
    if (!/communiquée au collaborateur/.test(t)) throw new Error('elle doit savoir que son appréciation sera lue');
  });

  await etape('elle ouvre une séance sans saisir le résultat', async () => {
    await page.fill('#acEvDate', '2026-09-03');
    await page.fill('#acEvCas', 'Mise en situation S1');
    await page.click('#acEvOuvrir');
    await page.waitForFunction(() => /Résultat en attente/.test(document.querySelector('#acEval').textContent));
    const t = await contenu();
    if (!/Séance ouverte le/.test(t)) throw new Error('la séance ouverte n\'est pas rappelée');
    if (await page.locator('#acEvOuvrir').count()) throw new Error('on ne doit pas pouvoir ouvrir une seconde séance');
  });

  await etape('Théo voit « Résultat en attente »', async () => {
    await seConnecter(THEO, '4004');
    const t = await contenu();
    if (!/Résultat en attente/.test(t)) throw new Error('l\'état attendu manque');
    if (!/ouverte pour le 03\/09\/2026/.test(t)) throw new Error('la date de la séance n\'est pas affichée');
    if (/Évaluation validée/.test(t)) throw new Error('une séance ouverte ne vaut pas une validation');
  });

  // =========================================================================
  //  4. « À REPASSER »
  // =========================================================================
  console.log('\n4. À REPASSER');

  await etape('Eva prononce « à repasser » avec une appréciation', async () => {
    await seConnecter(EVA, '3003');
    await page.click('#acRoleEval');
    await page.waitForSelector('#acEval:not([hidden])');
    await page.locator('.ac-eval-l', { hasText: 'Théo' }).click();
    await page.waitForSelector('#acEvKo');
    await page.fill('#acEvCom', 'Cadre bien posé, mais l\'action de la semaine reste floue.');
    await page.click('#acEvKo');
    await page.waitForFunction(() => /Évaluation à repasser/.test(document.querySelector('#acEval').textContent));
    const t = await contenu();
    if (!/Historique/.test(t)) throw new Error('l\'historique devrait apparaître');
    if (!/À repasser/.test(t)) throw new Error('le verdict n\'est pas dans l\'historique');
  });

  await etape('Théo lit « Évaluation à repasser » — et NON validée', async () => {
    await seConnecter(THEO, '4004');
    const t = await contenu();
    if (!/Évaluation à repasser/.test(t)) throw new Error('l\'état attendu manque');
    if (/Évaluation pratique validée/.test(t)) throw new Error('« à repasser » a été pris pour une validation');
    if (!/action de la semaine reste floue/.test(t)) throw new Error('l\'appréciation ne lui est pas communiquée');
    if (!/reconvoquera/.test(t)) throw new Error('la suite n\'est pas annoncée');
    // Et le serveur dit la même chose.
    const vu = await page.evaluate(async () => {
      const s = JSON.parse(localStorage.getItem('mc-academy-session'));
      return (await (await fetch('/api/academy/pratique', { headers: { Authorization: 'Bearer ' + s.token } })).json()).pratique;
    });
    if (vu.validee !== false) throw new Error('validee devrait être faux');
    if (vu.etat !== 'a_repasser') throw new Error('état : ' + vu.etat);
  });

  // =========================================================================
  //  5. NOUVELLE TENTATIVE → VALIDÉE, HISTORIQUE CONSERVÉ
  // =========================================================================
  console.log('\n5. NOUVELLE TENTATIVE');

  await etape('Eva enregistre une seconde évaluation, validée', async () => {
    await seConnecter(EVA, '3003');
    await page.click('#acRoleEval');
    await page.waitForSelector('#acEval:not([hidden])');
    await page.locator('.ac-eval-l', { hasText: 'Théo' }).click();
    await page.waitForSelector('#acEvOk');
    await page.fill('#acEvDate', '2026-09-10');
    await page.fill('#acEvCas', 'Mise en situation S4');
    await page.fill('#acEvCom', 'Action unique posée, reformulation nette.');
    await page.click('#acEvOk');
    await page.waitForFunction(() => /Évaluation validée/.test(document.querySelector('#acEval').textContent));
  });

  await etape('les DEUX tentatives sont dans l\'historique de l\'évaluatrice', async () => {
    const lignes = await page.locator('.ac-prat-histo li').allInnerTexts();
    if (lignes.length !== 2) throw new Error('tentatives listées : ' + lignes.length);
    const texte = lignes.join(' || ');
    if (!/10\/09\/2026/.test(texte) || !/03\/09\/2026/.test(texte)) throw new Error('dates : ' + texte);
    if (!/Validée/.test(texte)) throw new Error('la validation manque');
    if (!/À repasser/.test(texte)) throw new Error('LA PREMIÈRE TENTATIVE A ÉTÉ ÉCRASÉE');
    if (!/action de la semaine reste floue/.test(texte)) throw new Error('l\'appréciation d\'origine a disparu');
  });

  await etape('Théo lit « Évaluation validée » et retrouve ses deux tentatives', async () => {
    await seConnecter(THEO, '4004');
    await ouvrirEtapes();
    const t = await contenu();
    if (!/Évaluation pratique validée le 10\/09\/2026/.test(t)) throw new Error('la validation datée manque');
    if (!/reformulation nette/.test(t)) throw new Error('l\'appréciation de la tentative validée manque');
    await page.click('.ac-prat-validee .ac-qcm-histo summary');
    const lignes = await page.locator('.ac-prat-validee .ac-qcm-histo li').allInnerTexts();
    if (lignes.length !== 2) throw new Error('son historique compte ' + lignes.length + ' tentative(s)');
    if (!/À repasser/.test(lignes.join(' || '))) throw new Error('sa première tentative a disparu');
  });

  await etape('l\'étape pratique est CLOSE : plus aucune tentative possible', async () => {
    await seConnecter(EVA, '3003');
    await page.click('#acRoleEval');
    await page.waitForSelector('#acEval:not([hidden])');
    await page.locator('.ac-eval-l', { hasText: 'Théo' }).click();
    await page.waitForFunction(() => /Étape pratique terminée/.test(document.querySelector('#acEval').textContent));

    // L'écran ne propose plus rien.
    for (const sel of ['#acEvOk', '#acEvKo', '#acEvOuvrir']) {
      if (await page.locator(sel).count()) throw new Error('le formulaire est resté : ' + sel);
    }
    if (!/Aucune nouvelle évaluation ne peut être ouverte/.test(await contenu())) {
      throw new Error('l\'évaluatrice n\'est pas prévenue de la clôture');
    }

    // Et le SERVEUR refuse, ce qui est la vraie protection.
    const vu = await page.evaluate(async (cible) => {
      const s = JSON.parse(localStorage.getItem('mc-academy-session'));
      const h = { Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' };
      const r = await fetch('/api/academy/evaluateur/collaborateurs/' + cible + '/evaluations',
        { method: 'POST', headers: h, body: JSON.stringify({ resultat: 'a_repasser' }) });
      return { status: r.status, corps: await r.json() };
    }, THEO);
    if (vu.status !== 409) throw new Error('une 4e tentative a été acceptée : ' + vu.status);
    if (vu.corps.dejaValidee !== true) throw new Error('le refus ne dit pas pourquoi');
  });

  await etape('la validation n\'a pas bougé après ces tentatives', async () => {
    await seConnecter(THEO, '4004');
    const t = await contenu();
    if (!/Évaluation pratique validée le 10\/09\/2026/.test(t)) throw new Error('la validation a été rétrogradée');
    if (!/ne se repasse pas/.test(t)) throw new Error('la clôture n\'est pas annoncée au collaborateur');
    const vu = await page.evaluate(async () => {
      const s = JSON.parse(localStorage.getItem('mc-academy-session'));
      return (await (await fetch('/api/academy/pratique', { headers: { Authorization: 'Bearer ' + s.token } })).json()).pratique;
    });
    if (vu.validee !== true || vu.close !== true) throw new Error('état : ' + JSON.stringify(vu.etat));
    if (vu.historique.length !== 2) throw new Error('historique : ' + vu.historique.length + ' tentative(s)');
  });

  // =========================================================================
  //  6. AUCUNE CERTIFICATION AUTOMATIQUE
  // =========================================================================
  console.log('\n6. PAS DE CERTIFICATION');

  await etape('l\'écran ne laisse jamais croire que Théo est certifié', async () => {
    const t = await contenu();
    if (!/certification Coach Nutrition sera prononcée dans un second temps/.test(t)) {
      throw new Error('le rappel a disparu au moment où il compte le plus');
    }
    if (/Tu es Coach Nutrition certifié/.test(t)) throw new Error('l\'écran le déclare certifié');
  });

  await etape('et le serveur non plus : pratique validée, coach NON certifié', async () => {
    const vu = await page.evaluate(async () => {
      const s = JSON.parse(localStorage.getItem('mc-academy-session'));
      const h = { Authorization: 'Bearer ' + s.token };
      const p = await (await fetch('/api/academy/pratique', { headers: h })).json();
      const d = await fetch('/api/boost/coach/dossiers', { headers: h });
      return { pratique: p.pratique, dossiers: d.status };
    });
    if (vu.pratique.validee !== true) throw new Error('sa pratique devrait être validée');
    if (vu.pratique.certifie !== false) throw new Error('VALIDER LA PRATIQUE A CERTIFIÉ LE COACH : régression majeure');
    if (vu.pratique.certification !== 'en_cours') throw new Error('certification : ' + vu.pratique.certification);
    if (vu.dossiers !== 403) throw new Error('un non-certifié accède aux dossiers Boost : ' + vu.dossiers);

    // Le résultat pratique est bien inscrit dans le système existant.
    const cert = (await get('/api/boost/admin/collaborateurs', jetonAdmin))
      .collaborateurs.find((c) => c.email === THEO).certification;
    if (cert.resultatPratique !== 'valide') throw new Error('resultat_pratique : ' + cert.resultatPratique);
    if (cert.statut !== 'en_cours') throw new Error('statut : ' + cert.statut);
  });

  // =========================================================================
  //  CONTRÔLES TRANSVERSES
  // =========================================================================
  console.log('\nCONTRÔLES');

  await etape('l\'administrateur n\'évalue pas : administrer n\'est pas habiliter', async () => {
    const liste = await fetch(BASE + '/api/academy/evaluateur/collaborateurs',
      { headers: { Authorization: 'Bearer ' + jetonAdmin } });
    if (liste.status !== 403) throw new Error('l\'admin liste les dossiers d\'évaluation : ' + liste.status);
    const moi = await get('/api/academy/moi', jetonAdmin);
    if (moi.evaluateur !== false) throw new Error('l\'admin est évaluateur sans avoir été désigné');
    // Mais il garde le droit de désigner, et l'écran le lui offre.
    const admins = await get('/api/academy/admin/evaluateurs', jetonAdmin);
    if (!admins.ok) throw new Error('l\'admin ne peut plus gérer les évaluateurs');
    if (!admins.evaluateurs.some((e) => e.email === EVA && e.actif)) throw new Error('Eva devrait être listée active');
    if (!admins.comptes.some((c) => c.email === EVA && c.evaluateur)) throw new Error('la liste de l\'écran est incohérente');
    // Une collaboratrice ordinaire n'atteint pas cet écran.
    const nina = await fetch(BASE + '/api/academy/admin/evaluateurs',
      { headers: { Authorization: 'Bearer ' + (await jsonp('/account/login', { email: NINA, pin: '5005' })).token } });
    if (nina.status !== 403) throw new Error('une collaboratrice gère les évaluateurs : ' + nina.status);
  });

  await etape('retirer le droit d\'évaluer ferme l\'espace au rechargement', async () => {
    await seConnecter(EVA, '3003');
    // Lot A : l'entrée « Évaluer » est dans l'en-tête. Elle existe toujours dans
    // le DOM, mais reste `hidden` pour qui n'a pas le droit : on juge donc sa
    // VISIBILITÉ, qui est ce que voit réellement la personne.
    if (!(await page.locator('#acRoleEval').isVisible())) throw new Error('Eva devrait être évaluatrice');
    await jsonp('/api/academy/admin/evaluateurs', { email: EVA, evaluateur: false }, 'POST', jetonAdmin);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#acAccueil:not([hidden])');
    if (await page.locator('#acRoleEval').isVisible()) throw new Error('l\'accès est resté ouvert');
    await jsonp('/api/academy/admin/evaluateurs', { email: EVA, evaluateur: true }, 'POST', jetonAdmin);
  });

  await etape('affichage mobile : la fiche d\'évaluation reste utilisable en 390 px', async () => {
    // Le dossier de Théo est clos : il n'a plus de formulaire. On fait donc
    // valider la théorie de Nina — toutes les vérifications qui la voulaient
    // absente de la liste sont derrière nous — pour éprouver une fiche ENCORE
    // OUVERTE, celle où l'évaluatrice a réellement des boutons à viser.
    await validerLaTheorie(NINA, '5005');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#acAccueil:not([hidden])');
    await page.setViewportSize({ width: 390, height: 900 });
    await page.waitForTimeout(300);
    await page.click('#acRoleEval');
    await page.waitForSelector('#acEval:not([hidden])');
    let debord = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (debord > 2) throw new Error('débordement de la liste de ' + debord + ' px');

    await page.locator('.ac-eval-l', { hasText: 'Nina' }).click();
    await page.waitForSelector('#acEvOk');
    debord = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (debord > 2) throw new Error('débordement de la fiche de ' + debord + ' px');
    for (const sel of ['#acEvOk', '#acEvKo']) {
      const box = await page.locator(sel).boundingBox();
      if (!box || box.height < 36) throw new Error('bouton de verdict trop petit en mobile : ' + sel);
      if (box.width < 200) throw new Error('bouton de verdict écrasé en mobile : ' + sel + ' (' + Math.round(box.width) + ' px)');
    }
    await page.setViewportSize({ width: 1100, height: 1000 });
  });

  await etape('la carte du collaborateur reste lisible en 390 px', async () => {
    // seConnecter entre déjà dans la formation quand aucun écran n'est attendu.
    await seConnecter(THEO, '4004');
    await page.setViewportSize({ width: 390, height: 900 });
    await page.waitForTimeout(300);
    const debord = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (debord > 2) throw new Error('débordement du sommaire de ' + debord + ' px');
    const t = await contenu();
    if (!/Évaluation pratique validée/.test(t)) throw new Error('la carte de pratique a disparu en mobile');
    await page.setViewportSize({ width: 1100, height: 1000 });
  });

  await etape('aucune requête locale n\'a échoué hors refus provoqués', async () => {
    if (reponsesKo.length) throw new Error('requêtes en échec : ' + [...new Set(reponsesKo)].join(', '));
  });

  const OUT = process.env.OUT || '.';
  try {
    await page.goto(BASE + '/academy', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#acSommaire:not([hidden])', { timeout: 4000 });
    await page.screenshot({ path: OUT + '/academy-pratique.png', fullPage: true });
  } catch (_) { /* la capture ne doit jamais faire échouer la suite */ }
  await nav.close();

  console.log('\n' + '='.repeat(60));
  if (erreurs.length) {
    console.log('ÉCHECS (' + erreurs.length + ') :');
    [...new Set(erreurs)].forEach((e) => console.log('  - ' + e));
    process.exit(1);
  }
  console.log('ACADEMY — ÉVALUATION PRATIQUE : tout est passé, aucune erreur console.');
})();
