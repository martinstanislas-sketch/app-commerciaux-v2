// ============================================================================
//  E2E NAVIGATEUR — My Coach Academy, administration des contenus (lot 6).
//
//  CE QUI EST DÉMONTRÉ ICI, ET QUE RIEN D'AUTRE NE DÉMONTRE : une formation
//  entière se construit À LA SOURIS, dans /academy, sans une ligne de SQL et
//  sans toucher au code.
//
//     nouvelle formation → réglages → modules → vidéos → questions → publication
//
//  ⚠️ AUCUNE ÉCRITURE DIRECTE EN BASE DANS CE FICHIER. C'est la différence avec
//  la suite multi-formation, qui posait sa fixture en SQL pour prouver que le
//  MOTEUR était générique. Ici on prouve l'inverse du même énoncé : que
//  l'ADMINISTRATEUR n'a plus besoin de ce SQL. Si un geste manquait à l'écran,
//  ce fichier ne pourrait pas s'exécuter.
//
//  Trois propriétés sont attaquées en plus du parcours :
//   - le brouillon est invisible du collaborateur, catalogue ET accès direct ;
//   - une formation incohérente ne se publie pas, et le refus dit pourquoi ;
//   - le corrigé n'apparaît jamais dans l'écran du collaborateur.
//
//  Hors `npm test` :
//    NUTRITION_DB=/tmp/e2e.sqlite ADMIN_EMAIL=patron@exemple.fr PORT=3222 node server.js &
//    BASE=http://127.0.0.1:3222 node test/e2e/academy-admin-navigateur.js
// ============================================================================
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:3222';
const ADMIN = 'patron@exemple.fr';
const THEO = 'theo.ad@exemple.fr';
const CLE = 'coach_sommeil';
const LIBELLE = 'Coach Sommeil';
const erreurs = [];
const local = (url) => url.startsWith(BASE);

const jsonp = (r, b, m, t) => fetch(BASE + r, {
  method: m || 'POST',
  headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
  body: b ? JSON.stringify(b) : undefined,
}).then((x) => x.json());

async function semer() {
  for (const [email, prenom, pin] of [[ADMIN, 'Stan', '7777'], [THEO, 'Théo', '4004']]) {
    await jsonp('/account/login', { email, prenom, pin });
  }
  const t = (await jsonp('/account/login', { email: ADMIN, pin: '7777' })).token;
  await jsonp('/api/boost/admin/collaborateurs', { email: THEO, role: 'collaborateur' }, 'POST', t);
  return t;
}

(async () => {
  const jetonAdmin = await semer();

  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport: { width: 1100, height: 1000 } });
  page.setDefaultTimeout(8000);
  page.on('pageerror', (e) => erreurs.push('PAGE ERROR: ' + e.message));
  page.on('requestfailed', (r) => { if (local(r.url())) erreurs.push('REQUETE KO: ' + r.url().slice(0, 90)); });
  const reponsesKo = [];
  page.on('response', (r) => {
    // Les refus VOLONTAIRES du lot (publication impossible, brouillon
    // inaccessible) sont attendus : on ne les compte pas comme des pannes.
    const attendu = new URL(r.url()).pathname.startsWith('/api/academy/admin/')
      ? [400, 404, 409]                       // refus volontaires : saisie invalide, publication bloquée
      : [404];                                // brouillon inaccessible, éprouvé exprès
    if (local(r.url()) && r.status() >= 400 && !attendu.includes(r.status())) {
      reponsesKo.push(r.request().method() + ' ' + new URL(r.url()).pathname + ' -> ' + r.status());
    }
  });

  const etape = async (nom, fn) => {
    try { await fn(); console.log('  ✓ ' + nom); }
    catch (e) { console.log('  ✗ ' + nom + ' — ' + e.message); erreurs.push(nom + ' : ' + e.message); }
  };
  const contenu = () => page.evaluate(() =>
    [...document.querySelectorAll('main > section, main > p')].filter((s) => !s.hidden)
      .map((s) => s.textContent).join('\n'));

  // L'administrateur n'est pas collaborateur : il n'a pas de sommaire, il
  // arrive directement sur l'administration. Deux écrans d'arrivée différents,
  // et c'est le comportement voulu depuis le lot 3.
  const ECRAN = { [ADMIN]: '#acAdmin', [THEO]: '#acSommaire' };

  async function seConnecter(email, pin, attendu) {
    await page.goto(BASE + '/academy', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.removeItem('mc-academy-session'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#acLogin:not([hidden])');
    await page.fill('#acEmail', email);
    await page.fill('#acPin', pin);
    await page.click('#acGo');
    await page.waitForSelector((attendu || ECRAN[email] || '#acSommaire') + ':not([hidden])');
  }

  // Ouvrir l'onglet Contenus, depuis n'importe où dans l'écran.
  async function ouvrirContenus() {
    if (await page.locator('#acAdmin').isHidden()) {
      await page.click('#acAdminGo');
      await page.waitForSelector('#acAdmin:not([hidden])');
    }
    await page.locator('.ac-adm-ong', { hasText: 'Contenus' }).click();
    await page.waitForSelector('.ac-adm-sel');
  }

  // Choisir une formation dans le sélecteur d'administration (brouillons compris).
  async function choisirAdmin(libelle) {
    await page.locator('#acAdmin [data-formation-adm]', { hasText: libelle }).first().click();
    await page.waitForFunction((l) => {
      const on = document.querySelector('#acAdmin .ac-sel-b.on');
      return on && on.textContent.includes(l);
    }, libelle);
  }

  // =========================================================================
  //  1. L'ONGLET EXISTE, ET IL EST RÉSERVÉ
  // =========================================================================
  console.log('\n1. L\'ONGLET CONTENUS');

  await etape('le collaborateur ne voit aucune administration', async () => {
    await seConnecter(THEO, '4004');
    const t = await contenu();
    if (/Administration My Coach Academy/.test(t)) throw new Error('l\'entrée d\'administration est visible');
  });

  await etape('l\'administrateur trouve « Contenus » à côté des deux autres onglets', async () => {
    await seConnecter(ADMIN, '7777');
    const onglets = await page.locator('.ac-adm-ong').allInnerTexts();
    const attendus = ['Évaluateurs', 'Certifications', 'Contenus'];
    if (JSON.stringify(onglets) !== JSON.stringify(attendus)) {
      throw new Error('onglets : ' + onglets.join(' | '));
    }
  });

  // =========================================================================
  //  2. LE PARCOURS COMPLET, À LA SOURIS
  // =========================================================================
  console.log('\n2. CONSTRUIRE UNE FORMATION, SANS SQL');

  await etape('créer une formation : elle naît en BROUILLON', async () => {
    await ouvrirContenus();
    await page.click('[data-adm="formation-neuve"]');
    await page.waitForSelector('#acFCle');
    await page.fill('#acFLibelle', LIBELLE);
    await page.fill('#acFCle', CLE);
    await page.fill('#acFTitre', 'Coach Sommeil certifié');
    await page.click('[data-adm="formation-creer"]');
    await page.waitForSelector('.ac-adm-pub');
    const t = await contenu();
    if (!/Brouillon/.test(t)) throw new Error('elle devrait naître en brouillon');
    if (!/Invisible des collaborateurs/.test(t)) throw new Error('son invisibilité n\'est pas annoncée');
  });

  await etape('la publication est refusée et le refus DIT ce qui manque', async () => {
    const bloc = await page.locator('.ac-adm-blocages').innerText();
    if (!/Aucun module actif/.test(bloc)) throw new Error('blocages annoncés : ' + bloc);
    const bouton = page.locator('[data-adm="publier"]');
    if (!(await bouton.isDisabled())) throw new Error('le bouton Publier devrait être inactif');
  });

  await etape('régler la formation : 2 questions tirées, seuil 60 %, sans pratique', async () => {
    await page.locator('.ac-adm-som').click();
    await page.waitForSelector('#acRNb');
    await page.fill('#acRNb', '2');
    await page.fill('#acRSeuil', '60');
    await page.uncheck('#acRPratique');
    await page.click('[data-adm="reglages-enregistrer"]');
    await page.waitForFunction(() => document.querySelector('#acAdmin').textContent.includes('pour 2 tirées'));
    if (!/2 tirées/.test(await contenu())) throw new Error('le réglage n\'a pas pris');
  });

  await etape('ajouter deux modules', async () => {
    for (const titre of ['Comprendre le sommeil', 'Accompagner un client']) {
      await page.click('[data-adm="module-neuf"]');
      await page.waitForSelector('#acMTitre');
      await page.fill('#acMTitre', titre);
      await page.click('[data-adm="module-enregistrer"]');
      await page.waitForFunction((t) => document.querySelector('#acAdmin').textContent.includes(t), titre);
    }
    const mods = await page.locator('.ac-adm-mod').count();
    if (mods !== 2) throw new Error('modules : ' + mods);
  });

  await etape('ajouter une vidéo SANS lien : elle se saisit, elle bloque la publication', async () => {
    await page.locator('.ac-adm-mod').first().locator('[data-adm="contenu-neuf"]').click();
    await page.waitForSelector('#acCTitre');
    await page.fill('#acCTitre', 'Les cycles du sommeil');
    await page.click('[data-adm="contenu-enregistrer"]');
    await page.waitForFunction(() => document.querySelector('#acAdmin').textContent.includes('Les cycles du sommeil'));
    if (!/lien manquant ou invalide/.test(await contenu())) throw new Error('le manque n\'est pas signalé sur la ligne');
    const bloc = await page.locator('.ac-adm-blocages').innerText();
    if (!/identifiant YouTube valide/.test(bloc)) throw new Error('blocages : ' + bloc);
  });

  await etape('un identifiant YouTube mal formé est refusé, et l\'écran le dit', async () => {
    await page.locator('.ac-adm-ligne-c', { hasText: 'Les cycles du sommeil' })
      .locator('[data-adm="modifier"]').click();
    await page.waitForSelector('#acCYt');
    await page.fill('#acCYt', 'https://youtu.be/quelquechose');
    await page.click('[data-adm="contenu-enregistrer"]');
    await page.waitForFunction(() => (document.querySelector('#acAdmErr') || {}).textContent);
    const msg = await page.locator('#acAdmErr').innerText();
    if (!/YouTube/.test(msg)) throw new Error('message : ' + msg);
  });

  await etape('poser le bon identifiant lève le blocage de cette vidéo', async () => {
    await page.fill('#acCYt', 'SOMMEILaa01');
    await page.fill('#acCDuree', '9');
    await page.click('[data-adm="contenu-enregistrer"]');
    await page.waitForFunction(() => !document.querySelector('#acAdmin').textContent.includes('lien manquant'));
    if (!/SOMMEILaa01/.test(await contenu())) throw new Error('l\'identifiant n\'est pas affiché');
  });

  await etape('ajouter une seconde vidéo dans le second module', async () => {
    await page.locator('.ac-adm-mod').nth(1).locator('[data-adm="contenu-neuf"]').click();
    await page.waitForSelector('#acCTitre');
    await page.fill('#acCTitre', 'Le premier rendez-vous sommeil');
    await page.fill('#acCYt', 'SOMMEILaa02');
    await page.click('[data-adm="contenu-enregistrer"]');
    await page.waitForFunction(() => document.querySelector('#acAdmin').textContent.includes('SOMMEILaa02'));
  });

  await etape('une question sans mauvaise réponse est refusée à la saisie', async () => {
    await page.click('[data-adm="question-neuve"]');
    await page.waitForSelector('#acQEnonce');
    await page.fill('#acQEnonce', 'Question impossible ?');
    await page.fill('#acQC0', 'Vrai');
    await page.check('#acQC0ok');
    await page.fill('#acQC1', 'Vrai aussi');
    await page.check('#acQC1ok');
    await page.click('[data-adm="question-enregistrer"]');
    await page.waitForFunction(() => (document.querySelector('#acAdmErr') || {}).textContent);
    const msg = await page.locator('#acAdmErr').innerText();
    if (!/mauvaise réponse/.test(msg)) throw new Error('message : ' + msg);
  });

  await etape('ajouter deux questions correctes', async () => {
    // Le formulaire est resté tel qu'il a été tapé — c'est justement la
    // propriété qu'on éprouve ici : un refus ne fait pas retaper la saisie.
    if (!(await page.isChecked('#acQC0ok'))) throw new Error('le refus a effacé la saisie');
    await page.uncheck('#acQC1ok');
    await page.fill('#acQEnonce', 'Combien de cycles de sommeil par nuit en moyenne ?');
    await page.fill('#acQC0', 'Quatre à six');
    await page.fill('#acQC1', 'Un seul');
    await page.click('[data-adm="question-enregistrer"]');
    await page.waitForFunction(() => document.querySelector('#acAdmin').textContent.includes('Combien de cycles'));

    await page.click('[data-adm="question-neuve"]');
    await page.waitForSelector('#acQEnonce');
    await page.fill('#acQEnonce', 'Le coach peut-il prescrire un somnifère ?');
    await page.fill('#acQC0', 'Non, jamais');
    await page.check('#acQC0ok');
    await page.fill('#acQC1', 'Oui, s\'il est formé');
    await page.click('[data-adm="question-enregistrer"]');
    await page.waitForFunction(() => document.querySelector('#acAdmin').textContent.includes('somnifère'));
  });

  await etape('réordonner les modules à la souris', async () => {
    const TITRES = '.ac-adm-mod > .ac-adm-ligne .ac-l-t b';
    const avant = await page.locator(TITRES).allInnerTexts();
    await page.locator('.ac-adm-mod').nth(1).locator('[data-adm="monter"]').first().click();
    await page.waitForFunction((a) => {
      const t = document.querySelector(a.sel);
      return t && t.textContent !== a.premier;
    }, { sel: TITRES, premier: avant[0] });
    const apres = await page.locator(TITRES).allInnerTexts();
    if (apres[0] !== avant[1]) throw new Error('ordre : ' + apres.join(' | '));
    // On remet en place pour la suite.
    await page.locator('.ac-adm-mod').nth(1).locator('[data-adm="monter"]').first().click();
    await page.waitForFunction((a) => {
      const t = document.querySelector(a.sel);
      return t && t.textContent === a.premier;
    }, { sel: TITRES, premier: avant[0] });
  });

  // =========================================================================
  //  3. LE BROUILLON EST INVISIBLE
  // =========================================================================
  console.log('\n3. LE BROUILLON EST INVISIBLE');

  await etape('le collaborateur ne voit pas la formation en construction', async () => {
    await seConnecter(THEO, '4004');
    const t = await contenu();
    if (/Coach Sommeil|cycles du sommeil|SOMMEILaa01/.test(t)) {
      throw new Error('un brouillon est visible du collaborateur');
    }
    // Il n'y a qu'une formation publiée : le sélecteur ne doit même pas exister.
    if (await page.locator('#acSommaire .ac-sel-b').count()) {
      throw new Error('un sélecteur apparaît alors qu\'une seule formation est publiée');
    }
  });

  await etape('ni en nommant sa clé dans l\'URL de l\'API', async () => {
    const r = await page.evaluate(async (args) => {
      const s = JSON.parse(localStorage.getItem('mc-academy-session'));
      const res = await fetch('/api/academy/formation?formation=' + args.cle,
        { headers: { Authorization: 'Bearer ' + s.token } });
      return { status: res.status, txt: await res.text() };
    }, { cle: CLE });
    if (r.status !== 404) throw new Error('statut ' + r.status + ' : ' + r.txt.slice(0, 120));
    if (/SOMMEIL/.test(r.txt)) throw new Error('une vidéo du brouillon a fuité');
  });

  // =========================================================================
  //  4. PUBLIER
  // =========================================================================
  console.log('\n4. PUBLIER');

  await etape('l\'administrateur publie : plus aucun blocage', async () => {
    await seConnecter(ADMIN, '7777');
    await ouvrirContenus();
    await choisirAdmin(LIBELLE);
    if (await page.locator('.ac-adm-blocages').count()) {
      throw new Error('blocages restants : ' + await page.locator('.ac-adm-blocages').innerText());
    }
    await page.click('[data-adm="publier"]');
    await page.waitForFunction(() => document.querySelector('#acAdmin').textContent.includes('Formation publiée'));
    if (!/Visible des collaborateurs/.test(await contenu())) throw new Error('la publication n\'est pas annoncée');
  });

  await etape('le collaborateur la voit et peut la suivre', async () => {
    await seConnecter(THEO, '4004');
    const boutons = await page.locator('#acSommaire .ac-sel-b').allInnerTexts();
    if (!boutons.includes(LIBELLE)) throw new Error('formations : ' + boutons.join(' | '));
    await page.locator('#acSommaire .ac-sel-b', { hasText: LIBELLE }).click();
    await page.waitForFunction(() => {
      const on = document.querySelector('#acSommaire .ac-sel-b.on');
      return on && on.textContent.trim() === 'Coach Sommeil';
    });
    const t = await contenu();
    if (!/Comprendre le sommeil/.test(t)) throw new Error('les modules saisis n\'apparaissent pas');
    if (!/Les cycles du sommeil/.test(t)) throw new Error('les vidéos saisies n\'apparaissent pas');
    // Les drapeaux réglés à la souris se retrouvent à l'écran : pas de pratique.
    if (/Évaluation pratique/.test(t)) throw new Error('la pratique a été désactivée, elle ne doit pas s\'afficher');
  });

  await etape('la vidéo saisie est bien celle qui se joue', async () => {
    await page.locator('.ac-l').first().click();
    await page.waitForSelector('#acLecteur:not([hidden])');
    const src = await page.locator('#acLecteur iframe').getAttribute('src');
    if (!src || !src.includes('SOMMEILaa01')) throw new Error('src du lecteur : ' + src);
    await page.click('#acBack');
    await page.waitForSelector('#acSommaire:not([hidden])');
  });

  await etape('le QCM saisi se passe, avec le seuil saisi', async () => {
    for (let i = 0; i < 2; i++) {
      await page.locator('.ac-l').filter({ hasNotText: '✓' }).first().click();
      await page.waitForSelector('#acLecteur:not([hidden])');
      await page.click('#acFait');
      await page.waitForSelector('.ac-deja');
      await page.click('#acBack');
      await page.waitForSelector('#acSommaire:not([hidden])');
    }
    const t = await contenu();
    if (!/60 %/.test(t)) throw new Error('le seuil saisi n\'apparaît pas : ' + t.slice(0, 400));
    if (!(await page.locator('#acQcmGo').count())) throw new Error('le QCM ne s\'ouvre pas : ' + t.slice(0, 400));
  });

  await etape('LE CORRIGÉ N\'APPARAÎT NULLE PART dans l\'écran du collaborateur', async () => {
    await page.click('#acQcmGo');
    await page.waitForSelector('.ac-q-choix');
    // 1. Rien dans le HTML rendu : ni marque de classe, ni attribut.
    const html = await page.locator('#acQcm').innerHTML();
    if (/correct/i.test(html)) throw new Error('le mot « correct » apparaît dans le questionnaire rendu');
    // 2. Rien dans l'état JavaScript de la page : c'est là que le corrigé
    //    voyagerait s'il traversait une réponse d'API.
    const fuite = await page.evaluate(() => {
      const vu = JSON.stringify(window.tentative || null) + JSON.stringify(window.formation || null);
      return /correct/i.test(vu);
    });
    if (fuite) throw new Error('le corrigé est présent dans l\'état de la page');
    // 3. Et la réponse d'API elle-même, relue depuis le navigateur.
    const brut = await page.evaluate(async () => {
      const s = JSON.parse(localStorage.getItem('mc-academy-session'));
      const r = await fetch('/api/academy/qcm', { headers: { Authorization: 'Bearer ' + s.token } });
      return r.text();
    });
    if (/"correct"|correct_json/.test(brut)) throw new Error('la route du QCM porte le corrigé');
  });

  // =========================================================================
  //  5. ARCHIVER N'EFFACE PAS
  // =========================================================================
  console.log('\n5. ARCHIVER N\'EFFACE PAS');

  await etape('archiver un contenu terminé laisse la progression intacte', async () => {
    await seConnecter(ADMIN, '7777');
    await ouvrirContenus();
    await choisirAdmin(LIBELLE);
    await page.locator('.ac-adm-ligne-c', { hasText: 'Les cycles du sommeil' })
      .locator('[data-adm="basculer"]').click();
    await page.waitForFunction(() => document.querySelector('#acAdmin').textContent.includes('archivé'));

    // Restauré, il retrouve sa place ET son état côté collaborateur.
    await page.locator('.ac-adm-ligne-c', { hasText: 'Les cycles du sommeil' })
      .locator('[data-adm="basculer"]').click();
    await page.waitForFunction(() => !document.querySelector('#acAdmin').textContent.includes('· archivé'));

    await seConnecter(THEO, '4004');
    await page.locator('#acSommaire .ac-sel-b', { hasText: LIBELLE }).click();
    await page.waitForFunction(() => {
      const on = document.querySelector('#acSommaire .ac-sel-b.on');
      return on && on.textContent.trim() === 'Coach Sommeil';
    });
    if (!/100 %/.test(await contenu())) throw new Error('la progression a bougé après un archivage');
  });

  await etape('dépublier la retire du catalogue du collaborateur', async () => {
    await seConnecter(ADMIN, '7777');
    await ouvrirContenus();
    await choisirAdmin(LIBELLE);
    await page.click('[data-adm="depublier"]');
    await page.waitForFunction(() => document.querySelector('#acAdmin').textContent.includes('Brouillon'));

    await seConnecter(THEO, '4004');
    if (/Coach Sommeil/.test(await contenu())) throw new Error('elle reste visible après dépublication');

    // On republie : rien n'a été perdu entre-temps.
    await seConnecter(ADMIN, '7777');
    await ouvrirContenus();
    await choisirAdmin(LIBELLE);
    await page.click('[data-adm="publier"]');
    await page.waitForFunction(() => document.querySelector('#acAdmin').textContent.includes('Formation publiée'));
  });

  // =========================================================================
  //  6. MOBILE 390 px
  // =========================================================================
  console.log('\n6. MOBILE 390 px');

  await etape('l\'administration des contenus tient en 390 px', async () => {
    await page.setViewportSize({ width: 390, height: 780 });
    await seConnecter(ADMIN, '7777');
    await ouvrirContenus();
    await choisirAdmin(LIBELLE);

    const debord = async (ou) => {
      const d = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (d > 1) throw new Error(ou + ' déborde de ' + d + ' px');
    };
    await debord('arbre');

    // Les boutons restent atteignables au doigt.
    const b = await page.locator('.ac-adm-ligne [data-adm="modifier"]').first().boundingBox();
    if (!b || b.height < 30) throw new Error('bouton trop petit au doigt : ' + JSON.stringify(b));

    // Un formulaire ouvert ne déborde pas non plus — c'est là qu'un champ
    // large casse la page.
    await page.locator('.ac-adm-ligne-c', { hasText: 'Les cycles du sommeil' })
      .locator('[data-adm="modifier"]').click();
    await page.waitForSelector('#acCYt');
    await debord('formulaire de contenu');
    await page.click('[data-adm="annuler"]');

    await page.locator('.ac-adm-som').click();
    await page.waitForSelector('#acRNb');
    await debord('réglages');

    await page.setViewportSize({ width: 1100, height: 1000 });
  });

  await etape('aucune requête locale n\'a échoué', async () => {
    if (reponsesKo.length) throw new Error('requêtes en échec : ' + [...new Set(reponsesKo)].join(', '));
  });

  const OUT = process.env.OUT || '.';
  try {
    await seConnecter(ADMIN, '7777');
    await ouvrirContenus();
    await page.screenshot({ path: OUT + '/academy-admin-contenus.png', fullPage: true });
  } catch (_) { /* la capture ne doit jamais faire échouer la suite */ }
  await nav.close();

  console.log('\n' + '='.repeat(60));
  if (erreurs.length) {
    console.log('ÉCHECS (' + erreurs.length + ') :');
    [...new Set(erreurs)].forEach((e) => console.log('  - ' + e));
    process.exit(1);
  }
  console.log('ACADEMY — ADMINISTRATION DES CONTENUS : tout est passé, aucune erreur console.');
})();
