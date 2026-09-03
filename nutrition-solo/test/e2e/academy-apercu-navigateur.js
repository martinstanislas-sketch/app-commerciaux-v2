// ============================================================================
//  E2E NAVIGATEUR — L'APERÇU DES ÉVALUATIONS PRATIQUES (administrateur).
//
//  CE QUE CE SCRIPT PROUVE, ET QU'AUCUN TEST SERVEUR NE PEUT PROUVER :
//
//   · l'administrateur atteint le mode SANS AUCUN COACH en base — la seule
//     personne créée par ce script est l'administrateur lui-même ;
//   · l'onglet vit dans Administrer, à côté de Contenus ;
//   · le parcours affiché est CELUI DU CERTIFICATEUR : ① seul, puis ② à ⑥ après
//     « Commencer la mise en situation », puis la grille ;
//   · les axes se calculent et le commentaire devient obligatoire, exactement
//     comme dans une vraie évaluation ;
//   · le pied ne propose PAS de verdict : « Fin de la prévisualisation » ;
//   · et surtout : après tout cela, academy_evaluations est TOUJOURS VIDE.
//
//  Hors `npm test` :
//    npm install --no-save playwright
//    NUTRITION_DB=/tmp/e2e-apercu.sqlite ADMIN_EMAIL=patron@exemple.fr PORT=3225 node server.js &
//    BASE=http://127.0.0.1:3225 DB=/tmp/e2e-apercu.sqlite node test/e2e/academy-apercu-navigateur.js
// ============================================================================
const { chromium } = require('playwright');
const Database = require('better-sqlite3');

const BASE = process.env.BASE || 'http://127.0.0.1:3225';
const DB = process.env.DB || '/tmp/e2e-apercu.sqlite';
const OUT = process.env.OUT || '.';
const ADMIN = 'patron@exemple.fr';

let echecs = 0;
const doit = (c, m) => { if (!c) { echecs++; console.log('    ✖ ' + m); } };
async function etape(titre, fn) {
  try { await fn(); console.log('  ✔ ' + titre); }
  catch (e) { echecs++; console.log('  ✖ ' + titre + '\n      ' + e.message); }
}
const compte = (table) => {
  const d = new Database(DB, { readonly: true });
  try { return d.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n; }
  catch (_) { return -1; } finally { d.close(); }
};

(async () => {
  // ⚠️ ON NE CRÉE QUE L'ADMINISTRATEUR. Aucun coach, aucun collaborateur,
  // aucune théorie : c'est exactement la situation que ce mode doit servir.
  await fetch(BASE + '/account/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN, prenom: 'Patron', pin: '7777' }),
  });

  const nav = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const page = await nav.newPage({ viewport: { width: 1100, height: 1200 } });
  page.setDefaultTimeout(10000);
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push('PAGE ERROR: ' + e.message));

  console.log('\n  APERÇU DES ÉVALUATIONS PRATIQUES — parcours administrateur\n');

  await page.goto(BASE + '/academy');
  await page.waitForSelector('#acLogin:not([hidden])');
  await page.fill('#acEmail', ADMIN);
  await page.fill('#acPin', '7777');
  await page.click('#acGo');
  // UN ADMINISTRATEUR QUI N'EST PAS COLLABORATEUR ARRIVE DIRECTEMENT DANS
  // L'ADMINISTRATION — et c'est bien la situation de ce mode : personne à
  // former, personne à évaluer, juste des contenus à contrôler.
  await page.waitForSelector('#acAdmin:not([hidden])');

  await etape('l\'onglet vit dans Administrer, à côté de Contenus', async () => {
    const onglets = await page.$$eval('#acAdmin [data-onglet]', (n) => n.map((x) => x.textContent.trim()));
    doit(onglets.length === 2, 'deux onglets attendus, vus : ' + onglets.join(' | '));
    doit(onglets.includes('Contenus'), 'l\'onglet Contenus doit rester');
    doit(onglets.includes('Aperçu des évaluations pratiques'), 'l\'onglet d\'aperçu manque');
  });

  await etape('SANS AUCUN COACH, la liste des formations s\'affiche', async () => {
    doit(compte('academy_evaluations') === 0, 'aucune évaluation ne doit exister au départ');
    await page.click('[data-onglet="apercu"]');
    await page.waitForSelector('.ac-ap-liste');
    const lignes = await page.$$eval('.ac-ap-l', (n) => n.map((x) => x.textContent.trim()));
    doit(lignes.length >= 1, 'au moins une formation doit être listée');
    doit(lignes.some((l) => /Nutrition/.test(l) && /6 cas/.test(l) && /9 critères/.test(l)),
      'Nutrition Certifié doit annoncer 6 cas et 9 critères : ' + lignes.join(' // '));
    await page.screenshot({ path: OUT + '/apercu-01-liste.png', fullPage: true });
  });

  await etape('« Prévisualiser » ouvre l\'écran initial du certificateur — et lui seul', async () => {
    await page.locator('.ac-ap-l', { hasText: 'Nutrition' }).locator('[data-apercu]').click();
    await page.waitForSelector('.ac-as-carte');
    doit(await page.locator('.ac-ap-bandeau').isVisible(), 'le bandeau MODE APERÇU doit être visible');
    doit(/aucune donnée ne sera enregistrée/i.test(await page.locator('.ac-ap-bandeau').textContent()),
      'le bandeau doit dire que rien n\'est enregistré');
    doit(await page.locator('#acApCas').isVisible(), 'le sélecteur de cas doit être en haut');
    const num = await page.$$eval('.ac-as-num', (n) => n.map((x) => x.textContent.trim()));
    doit(num.length === 1 && /① Lis ceci au coach/.test(num[0]),
      'un seul bloc avant de commencer : ' + num.join(' | '));
    doit(await page.locator('#acEvCommencer').isVisible(), 'le bouton « Commencer » doit être offert');
    await page.screenshot({ path: OUT + '/apercu-02-lire.png', fullPage: true });
  });

  await etape('« Commencer » révèle ② à ⑥ et la grille — sans rien écrire', async () => {
    await page.click('#acEvCommencer');
    await page.waitForSelector('.ac-as-dl');
    const num = await page.$$eval('.ac-as-num', (n) => n.map((x) => x.textContent.trim()));
    for (const a of ['② Ton rôle', '③ Dis spontanément', '④ Si le coach te questionne',
      '⑤ Si le coach propose…', '⑥ Ce qui est attendu']) {
      doit(num.includes(a), 'bloc manquant : ' + a);
    }
    doit(await page.locator('.ac-gr-carte').count() === 3, 'les trois axes doivent être offerts');
    doit(compte('academy_evaluations') === 0,
      '⚠️ « Commencer » a créé une évaluation : la garde du mode aperçu a lâché');
  });

  await etape('le pied ne propose AUCUN verdict, seulement la fin de l\'aperçu', async () => {
    doit(await page.locator('#acEvOk').count() === 0, '« Enregistrer : validée » ne doit pas exister');
    doit(await page.locator('#acEvKo').count() === 0, '« Enregistrer : à repasser » ne doit pas exister');
    doit(await page.locator('#acApFin').isVisible(), '« Fin de la prévisualisation » doit être offert');
  });

  await etape('LES 9 CRITÈRES SONT CLIQUABLES : 3 axes × 3, deux états chacun', async () => {
    doit(await page.locator('.ac-gr-c').count() === 9, 'neuf critères attendus');
    doit(await page.locator('.ac-gr-oui').count() === 9, 'neuf boutons « Acquis »');
    doit(await page.locator('.ac-gr-non').count() === 9, 'neuf boutons « Non acquis »');
    // Avant tout clic, chaque axe s'annonce « à renseigner » — jamais un résultat.
    const vides = await page.$$eval('.ac-gr-res-vide', (n) => n.map((x) => x.textContent.trim()));
    doit(vides.length === 3, 'les trois axes doivent partir vierges');
    doit(vides.every((v) => /0\/3 — à renseigner/.test(v)), 'départ à 0/3 : ' + vides.join(' | '));
  });

  await etape('LE RÉSULTAT DE CHAQUE AXE APPARAÎT AU FIL DES CLICS : 3/3, 2/3, 1/3', async () => {
    const parAxe = [3, 2, 1];
    const attendu = [
      { n: '3/3', pastille: '\uD83D\uDFE2', libelle: 'Maîtrisé' },
      { n: '2/3', pastille: '\uD83D\uDFE0', libelle: 'À renforcer' },
      { n: '1/3', pastille: '\uD83D\uDD34', libelle: 'Non maîtrisé' },
    ];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        await page.locator('.ac-gr-carte').nth(i).locator('.ac-gr-c').nth(j)
          .locator(j < parAxe[i] ? '.ac-gr-oui' : '.ac-gr-non').click();
        // LE RÉSULTAT N'APPARAÎT QU'UNE FOIS L'AXE COMPLET : deux critères sur
        // trois donneraient « 2/2 maîtrisé », un résultat faux qui a l'air juste.
        const enCours = await page.locator('.ac-gr-carte').nth(i).locator('.ac-gr-res').textContent();
        if (j < 2) doit(/à renseigner/.test(enCours), 'axe ' + (i + 1) + ' annonce un résultat trop tôt : ' + enCours);
      }
      const fini = await page.locator('.ac-gr-carte').nth(i).locator('.ac-gr-res').textContent();
      doit(fini.includes(attendu[i].n), 'axe ' + (i + 1) + ' doit afficher ' + attendu[i].n + ' — vu : ' + fini);
      doit(fini.includes(attendu[i].pastille), 'axe ' + (i + 1) + ' doit porter sa pastille — vu : ' + fini);
      doit(fini.includes(attendu[i].libelle), 'axe ' + (i + 1) + ' doit dire « ' + attendu[i].libelle + ' »');
    }

    // Le résumé reprend les trois axes, avec les mêmes pastilles.
    const resume = await page.$$eval('.ac-gr-resume-li', (n) => n.map((x) => x.textContent.trim()));
    doit(resume.length === 3, 'le résumé doit reprendre les trois axes');
    doit(/3\/3/.test(resume[0]) && /2\/3/.test(resume[1]) && /1\/3/.test(resume[2]),
      'le résumé doit porter les trois comptes : ' + resume.join(' | '));

    doit(/obligatoire/i.test(await page.locator('#acEvComT').textContent()),
      'le commentaire doit devenir obligatoire dès qu\'un critère est Non acquis');
    doit(compte('academy_evaluations') === 0, 'cocher la grille ne doit rien écrire');
    await page.screenshot({ path: OUT + '/apercu-03-grille.png', fullPage: true });
  });

  await etape('9/9 acquis : le commentaire redevient FACULTATIF', async () => {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        await page.locator('.ac-gr-carte').nth(i).locator('.ac-gr-c').nth(j).locator('.ac-gr-oui').click();
      }
    }
    const res = await page.$$eval('.ac-gr-carte .ac-gr-res', (n) => n.map((x) => x.textContent.trim()));
    doit(res.every((r) => /3\/3/.test(r) && /Maîtrisé/.test(r)), 'les trois axes doivent être maîtrisés');
    doit(/facultatif/i.test(await page.locator('#acEvComT').textContent()),
      'le commentaire doit redevenir facultatif : ' + await page.locator('#acEvComT').textContent());
  });

  await etape('on recommence immédiatement avec un autre cas', async () => {
    await page.click('#acApFin');
    await page.waitForSelector('.ac-ap-liste');
    await page.locator('.ac-ap-l', { hasText: 'Nutrition' }).locator('[data-apercu]').click();
    await page.waitForSelector('#acApCas');
    const titre1 = await page.locator('.ac-as-t').first().textContent();
    // Le sixième cas — celui qui ouvre une orientation.
    await page.selectOption('#acApCas', { index: 5 });
    await page.waitForSelector('.ac-as-carte');
    const titre2 = await page.locator('.ac-as-t').first().textContent();
    doit(titre1 !== titre2, 'changer de cas doit changer ce qu\'on lit au coach');
    doit(/Douleurs digestives/.test(titre2), 'le sixième cas attendu : ' + titre2);
    // La grille repart à zéro : c'est une nouvelle mise en situation.
    await page.click('#acEvCommencer');
    await page.waitForSelector('.ac-gr-carte');
    const vides = await page.$$eval('.ac-gr-res-vide', (n) => n.length);
    doit(vides === 3, 'la grille doit repartir vierge (axes non renseignés : ' + vides + ')');
  });

  await etape('UNE FORMATION SANS GRILLE LE DIT — au lieu de sauter l\'étape', async () => {
    await page.click('#acApFin');
    await page.waitForSelector('.ac-ap-liste');
    // Cycle menstruel a ses six cas mais aucun critère : c'est le cas de Pilates,
    // d'Haltérophilie et des autres tant que leur référentiel n'est pas amorcé.
    const sans = page.locator('.ac-ap-l', { hasText: 'Cycle menstruel' });
    doit(await sans.count() === 1, 'une formation sans grille doit être listée');
    doit(/aucune grille/.test(await sans.textContent()), 'la liste doit annoncer l\'absence de grille');
    await sans.locator('[data-apercu]').click();
    await page.waitForSelector('.ac-as-carte');
    await page.click('#acEvCommencer');
    await page.waitForSelector('.ac-gr-absente');
    doit(await page.locator('.ac-gr-carte').count() === 0, 'aucun axe ne doit être inventé');
    const t = await page.locator('.ac-gr-absente').textContent();
    doit(/n['\u2019]a pas encore de grille/.test(t), 'l\'écran doit dire pourquoi : ' + t.slice(0, 80));
    doit(await page.locator('#acEvCom').count() === 1, 'le champ libre du certificateur reste offert');
    await page.screenshot({ path: OUT + '/apercu-04-sans-grille.png', fullPage: true });
    await page.click('#acApFin');
    await page.waitForSelector('.ac-ap-liste');
  });

  await etape('APRÈS TOUT LE PARCOURS, la base métier est intacte', async () => {
    for (const t of ['academy_evaluations', 'academy_evaluation_criteres', 'boost_certifications']) {
      doit(compte(t) === 0, t + ' devrait être vide, il contient ' + compte(t) + ' ligne(s)');
    }
  });

  await etape('l\'onglet Contenus fonctionne toujours', async () => {
    await page.click('[data-onglet="contenus"]');
    await page.waitForSelector('.ac-adm-mod');
    doit(await page.locator('.ac-ap-bandeau').count() === 0, 'le bandeau d\'aperçu doit disparaître');
  });

  if (erreurs.length) { echecs++; console.log('\n  ERREURS PAGE :\n   ' + erreurs.join('\n   ')); }
  await nav.close();
  console.log('\n  ' + (echecs ? '✖ ' + echecs + ' problème(s)' : '✔ parcours conforme') + '\n');
  process.exit(echecs ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
