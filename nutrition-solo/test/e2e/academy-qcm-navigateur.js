// ============================================================================
//  E2E NAVIGATEUR — My Coach Academy, évaluation théorique (lot 2).
//
//  Trois parcours, dans un vrai navigateur :
//    1. ÉCHEC   : formation terminée → QCM débloqué → réponses insuffisantes →
//                 « Formation théorique non validée » → on peut recommencer ;
//    2. RÉUSSITE: nouvelle tentative → toutes les bonnes réponses → « Théorie
//                 validée » → « Prochaine étape : évaluation pratique » → et
//                 SURTOUT : toujours PAS Coach Nutrition certifié → la
//                 déconnexion/reconnexion ne fait pas perdre la validation ;
//    3. REPRISE : tentative commencée, quittée en cours, retrouvée à
//                 l'identique — mêmes questions, mêmes ordres, mêmes réponses.
//
//  ⚠️ D'OÙ VIENNENT LES BONNES RÉPONSES DE CE TEST ?
//  Du FICHIER D'AMORÇAGE (lib/academyQcm.js), jamais du serveur. C'est le point :
//  s'il avait fallu interroger une route pour savoir quoi cocher, c'est que le
//  corrigé aurait fui. Le test surveille d'ailleurs TOUTES les réponses HTTP de
//  l'Academy et échoue si l'une d'elles laisse filtrer une correction.
//
//  Hors `npm test` :
//    npm install --no-save playwright
//    NUTRITION_DB=/tmp/e2e.sqlite ADMIN_EMAIL=patron@exemple.fr PORT=3222 node server.js &
//    BASE=http://127.0.0.1:3222 node test/e2e/academy-qcm-navigateur.js
// ============================================================================
const { chromium } = require('playwright');
const { AMORCE_QUESTIONS } = require('../../lib/academyQcm');

const BASE = process.env.BASE || 'http://127.0.0.1:3222';
const ADMIN = 'patron@exemple.fr';
const THEO = 'theo.qcm@exemple.fr';   // parcours 1 et 2
const MIA = 'mia.qcm@exemple.fr';     // parcours 3 : la reprise
const erreurs = [];
const local = (url) => url.startsWith(BASE);

// Le corrigé de DÉMONSTRATION, reconstruit depuis l'amorçage : énoncé -> textes
// des bonnes réponses. Aucune requête n'a été nécessaire pour l'obtenir.
const CORRIGE = new Map(AMORCE_QUESTIONS.map((q) =>
  [q.enonce, q.choix.filter(([, bon]) => bon).map(([texte]) => texte)]));

const jsonp = (r, b, m, t) => fetch(BASE + r, {
  method: m || 'POST',
  headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
  body: b ? JSON.stringify(b) : undefined,
}).then((x) => x.json());

async function semer() {
  for (const [email, prenom, pin] of [[ADMIN, 'Patron', '7777'], [THEO, 'Théo', '4004'], [MIA, 'Mia', '5005']]) {
    await jsonp('/account/login', { email, prenom, pin });
  }
  const t = (await jsonp('/account/login', { email: ADMIN, pin: '7777' })).token;
  for (const e of [THEO, MIA]) {
    await jsonp('/api/boost/admin/collaborateurs', { email: e, role: 'collaborateur' }, 'POST', t);
  }
  // Théo terminera SA formation dans le navigateur (c'est le parcours demandé).
  // Mia part formation déjà terminée : son parcours porte sur la reprise, pas
  // sur les vidéos, et les cliquer une seconde fois n'apprendrait rien.
  const tm = (await jsonp('/account/login', { email: MIA, pin: '5005' })).token;
  const f = (await fetch(BASE + '/api/academy/formation', { headers: { Authorization: 'Bearer ' + tm } }).then((x) => x.json())).formation;
  for (const c of f.modules.flatMap((m) => m.contenus)) {
    await jsonp(`/api/academy/contenus/${c.id}/terminer`, {}, 'POST', tm);
  }
  return { t };
}

(async () => {
  const { t: jetonAdmin } = await semer();

  const nav = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const page = await nav.newPage({ viewport: { width: 1100, height: 950 } });
  page.setDefaultTimeout(8000);
  page.on('pageerror', (e) => erreurs.push('PAGE ERROR: ' + e.message));
  page.on('requestfailed', (r) => { if (local(r.url())) erreurs.push('REQUETE KO: ' + r.url().slice(0, 90)); });

  const reponsesKo = [];
  const fuites = [];
  // Refus VOLONTAIREMENT provoqués par le test : on vérifie justement qu'ils ont
  // lieu. Les compter comme des pannes rendrait le contrôle final impossible.
  const refusVoulus = ['GET /api/boost/coach/dossiers -> 403'];
  page.on('response', async (r) => {
    if (!local(r.url())) return;
    if (r.status() >= 400) {
      const ligne = r.request().method() + ' ' + new URL(r.url()).pathname + ' -> ' + r.status();
      if (!refusVoulus.includes(ligne)) reponsesKo.push(ligne);
    }
    if (!/\/api\/academy\//.test(r.url())) return;
    // SURVEILLANCE DU CORRIGÉ : tout ce qui traverse le réseau est relu.
    try {
      const txt = await r.text();
      if (/"correct"|correct_json|correctJson|bonne_reponse|bonneReponse|"solution"/i.test(txt)) {
        fuites.push(new URL(r.url()).pathname);
      }
    } catch (_) { /* corps indisponible : rien à relire */ }
  });

  const etape = async (nom, fn) => {
    try { await fn(); console.log('  ✓ ' + nom); }
    catch (e) { console.log('  ✗ ' + nom + ' — ' + e.message); erreurs.push(nom + ' : ' + e.message); }
  };
  // On ne lit que les écrans VISIBLES : une section masquée garde son texte dans
  // le DOM, et le compter ferait passer l'ancien sommaire pour l'écran courant.
  const contenu = () => page.evaluate(() =>
    [...document.querySelectorAll('main > section, main > p')].filter((s) => !s.hidden)
      .map((s) => s.textContent).join('\n'));

  // .ac-q-num est en petites capitales par CSS : innerText renverrait le texte
  // transformé. On lit le texte brut.
  const position = () => page.evaluate(() => document.querySelector('.ac-q-num').textContent.trim());

  async function seConnecter(email, pin) {
    await page.goto(BASE + '/academy', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.removeItem('mc-academy-session'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#acLogin:not([hidden])');
    await page.fill('#acEmail', email);
    await page.fill('#acPin', pin);
    await page.click('#acGo');
    await entrerFormation();
  }

  // Depuis la refonte, les quatre étapes sont des accordéons : seule l'étape
  // courante est dépliée. Pour agir dans une autre, on l'ouvre — comme un humain.
  async function ouvrirEtapes() {
    await page.evaluate(() => {
      document.querySelectorAll('#acSommaire details.ac-et:not([open])').forEach((d) => { d.open = true; });
    });
  }

  // Depuis la refonte de la coquille, « Se déconnecter » vit dans le menu de
  // compte, en haut à droite : on l'ouvre avant de cliquer.
  async function seDeconnecter() {
    await page.click('#acCompte');
    await page.waitForSelector('#acMenu:not([hidden])');
    await page.click('#acOut');
    await page.waitForSelector('#acLogin:not([hidden])');
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

  // --- Répondre dans le navigateur ------------------------------------------
  //
  // Chaque clic déclenche un enregistrement serveur puis un rendu : on attend
  // que le nombre de choix cochés corresponde avant de cliquer le suivant,
  // sinon on cliquerait dans un écran déjà remplacé.
  async function repondreQuestion(juste) {
    const enonce = (await page.innerText('.ac-q-enonce')).trim();
    const bonnes = CORRIGE.get(enonce);
    if (!bonnes) throw new Error('énoncé absent du corrigé de démonstration : ' + enonce);
    const textes = (await page.locator('#acQcm .ac-choix').allInnerTexts()).map((t) => t.trim());
    const cibles = juste ? bonnes : [textes.find((t) => !bonnes.includes(t))];

    let coches = 0;
    for (const cible of cibles) {
      const i = textes.indexOf(cible);
      if (i < 0) throw new Error('choix introuvable à l\'écran : ' + cible);
      await page.locator('#acQcm .ac-choix').nth(i).click();
      coches++;
      await page.waitForFunction((n) => document.querySelectorAll('#acQcm .ac-choix-on').length === n, coches);
    }
    return { enonce, multiple: bonnes.length > 1 };
  }

  async function allerA(i, n) {
    await page.locator('.ac-q-dot').nth(i).click();
    await page.waitForFunction((t) => document.querySelector('.ac-q-num').textContent.trim() === t,
      'Question ' + (i + 1) + ' / ' + n);
  }

  // Répond à toutes les questions : justes pour les `justes` premières.
  async function repondreTout(justes) {
    const n = await page.locator('.ac-q-dot').count();
    for (let i = 0; i < n; i++) {
      await allerA(i, n);
      await repondreQuestion(i < justes);
    }
    return n;
  }

  async function photographier() {
    const n = await page.locator('.ac-q-dot').count();
    const snap = [];
    for (let i = 0; i < n; i++) {
      await allerA(i, n);
      snap.push({
        enonce: (await page.innerText('.ac-q-enonce')).trim(),
        choix: (await page.locator('#acQcm .ac-choix').allInnerTexts()).map((t) => t.trim()),
        coches: (await page.locator('#acQcm .ac-choix-on').allInnerTexts()).map((t) => t.trim()),
      });
    }
    return snap;
  }

  // =========================================================================
  //  PARCOURS 1 — ÉCHEC
  // =========================================================================
  console.log('\nPARCOURS 1 — ÉCHEC');

  await etape('avant la formation, le QCM est visiblement VERROUILLÉ', async () => {
    await seConnecter(THEO, '4004');
    const t = await contenu();
    if (!/Évaluation théorique — Coach Nutrition/.test(t)) throw new Error('la carte d\'évaluation est absente');
    if (!/Évaluation verrouillée/i.test(t)) throw new Error('le verrou n\'est pas annoncé');
    if (!/Formation en cours/.test(t)) throw new Error('l\'état « Formation en cours » manque');
    if (await page.locator('#acQcmGo').count()) throw new Error('un bouton de démarrage est offert malgré le verrou');
  });


  // LOT B : « Terminer et continuer » marque le contenu ET ouvre le suivant.
  // Terminer une formation entière est donc une suite de clics sur le même
  // bouton, jusqu'à ce qu'il disparaisse — sur le dernier contenu, il renvoie
  // aux étapes d'évaluation et l'écran de lecture se ferme.
  async function terminerToutDepuisLeLecteur() {
    for (let i = 0; i < 80; i++) {
      if (await page.locator('#acLecteur').isHidden()) return;
      if (!(await page.locator('#acFait').count())) {
        // Contenu déjà terminé : on avance sans rien revalider.
        if (!(await page.locator('#acSuiv').count())) return;
        const avant = await page.locator('.ac-lec-t').innerText();
        await page.click('#acSuiv');
        await page.waitForFunction((t) => {
          const el = document.querySelector('.ac-lec-t');
          return !el || el.textContent !== t;
        }, avant);
        continue;
      }
      const avant = await page.locator('.ac-lec-t').innerText();
      await page.click('#acFait');
      await page.waitForFunction((t) => {
        const el = document.querySelector('.ac-lec-t');
        const lec = document.querySelector('#acLecteur');
        return !lec || lec.hidden || !el || el.textContent !== t;
      }, avant);
    }
  }
  await etape('terminer tous les contenus de la formation', async () => {
    await page.evaluate(() => document.querySelectorAll('#acSommaire details.ac-mod:not([open])')
      .forEach((d) => { d.open = true; }));
    await page.locator('.ac-l').first().click();
    await page.waitForSelector('#acLecteur:not([hidden])');
    await terminerToutDepuisLeLecteur();
    if (await page.locator('#acSommaire').isHidden()) {
      await page.click('#acBack');
      await page.waitForSelector('#acSommaire:not([hidden])');
    }
    if (!/100 %/.test(await contenu())) throw new Error('la formation devrait être à 100 %');
  });

  await etape('la formation terminée DÉBLOQUE le QCM', async () => {
    const t = await contenu();
    if (!/Formation terminée — QCM disponible/.test(t)) throw new Error('l\'état attendu manque');
    if (/Évaluation verrouillée/i.test(t)) throw new Error('le verrou est resté');
    if (!/Commencer mon évaluation/.test(t)) throw new Error('le bouton de démarrage manque');
    if (!/seuil de réussite/i.test(t)) throw new Error('le seuil devrait être annoncé avant de commencer');
  });

  let nbQuestions = 0;
  await etape('le questionnaire s\'ouvre : « Question 1 / N », choix et progression', async () => {
    await page.click('#acQcmGo');
    await page.waitForSelector('#acQcm:not([hidden])');
    nbQuestions = await page.locator('.ac-q-dot').count();
    if (nbQuestions < 2) throw new Error('tirage vide ou trop court : ' + nbQuestions);
    const num = await position();
    if (num !== 'Question 1 / ' + nbQuestions) throw new Error('position inattendue : ' + num);
    if (!(await page.locator('#acQcm .ac-choix').count())) throw new Error('aucun choix affiché');
    if (!/Terminer mon évaluation/.test(await contenu())) throw new Error('le bouton de fin manque');
    if (!(await page.locator('#acQPrec').isDisabled())) throw new Error('« Précédent » devrait être désactivé sur la 1re question');
  });

  await etape('aucune bonne réponse n\'est visible dans la page', async () => {
    const html = await page.content();
    if (/data-correct|"correct"|bonne_reponse|correctJson/i.test(html)) throw new Error('le corrigé est dans le DOM');
  });

  await etape('on répond : 2 questions justes, le reste à côté', async () => {
    await repondreTout(2);
    const t = await contenu();
    if (/sans réponse/.test(t)) throw new Error('toutes les questions devraient être répondues');
    if (await page.locator('.ac-q-dot.ac-q-ok').count() !== nbQuestions) throw new Error('la progression ne suit pas');
  });

  await etape('« Terminer mon évaluation » rend un score insuffisant', async () => {
    await page.click('#acQFin');
    await page.waitForSelector('.ac-res-score');
    const t = await contenu();
    const score = (await page.innerText('.ac-res-score')).trim();
    if (!/^Score : \d+ %$/.test(score)) throw new Error('score mal présenté : ' + score);
    const pct = Number(score.match(/(\d+)/)[1]);
    const attendu = Math.round((2 / nbQuestions) * 100);
    if (pct !== attendu) throw new Error('score attendu ' + attendu + ' %, obtenu ' + pct + ' %');
    if (!/Formation théorique non validée/.test(t)) throw new Error('le verdict d\'échec manque');
    if (!new RegExp(2 + ' bonnes? réponses? sur ' + nbQuestions).test(t)) throw new Error('le détail des bonnes réponses manque');
    if (!/seuil de réussite/i.test(t)) throw new Error('le seuil n\'est pas rappelé');
    if (!/À revoir/.test(t)) throw new Error('les modules à revoir devraient être proposés');
    if (/Théorie validée/.test(t)) throw new Error('un échec ne valide rien');
  });

  await etape('après un échec, on peut recommencer', async () => {
    if (!(await page.locator('#acQRefaire').count())) throw new Error('le bouton « Recommencer » manque');
    await page.click('#acQBack');
    await page.waitForSelector('#acSommaire:not([hidden])');
    await ouvrirEtapes();
    const t = await contenu();
    if (!/Théorie non validée/.test(t)) throw new Error('l\'état attendu manque');
    if (!/Recommencer l'évaluation/.test(t)) throw new Error('on doit pouvoir repasser l\'évaluation');
  });

  // =========================================================================
  //  PARCOURS 2 — RÉUSSITE
  // =========================================================================
  console.log('\nPARCOURS 2 — RÉUSSITE');

  await etape('une nouvelle tentative tire un nouveau questionnaire', async () => {
    await page.click('#acQcmGo');
    await page.waitForSelector('#acQcm:not([hidden])');
    const num = await position();
    if (!/^Question 1 \/ \d+$/.test(num)) throw new Error('la nouvelle tentative ne repart pas de zéro : ' + num);
    if (await page.locator('.ac-q-dot.ac-q-ok').count() !== 0) throw new Error('des réponses de la tentative précédente ont survécu');
  });

  await etape('on répond correctement à toutes les questions', async () => {
    const n = await repondreTout(999);
    if (await page.locator('.ac-q-dot.ac-q-ok').count() !== n) throw new Error('toutes les questions devraient être répondues');
  });

  await etape('le score est suffisant : « Formation théorique validée »', async () => {
    await page.click('#acQFin');
    await page.waitForSelector('.ac-res-score');
    const t = await contenu();
    if (!/Score : 100 %/.test(t)) throw new Error('score : ' + (await page.innerText('.ac-res-score')));
    if (!/Formation théorique validée/.test(t)) throw new Error('le verdict de réussite manque');
    if (/non validée/.test(t)) throw new Error('verdict contradictoire à l\'écran');
  });

  await etape('« Théorie validée » puis « Prochaine étape : évaluation pratique »', async () => {
    const t = await contenu();
    if (!/Théorie validée/.test(t)) throw new Error('« Théorie validée » manque');
    if (!/Prochaine étape : évaluation pratique/.test(t)) throw new Error('la suite du parcours n\'est pas annoncée');
  });

  await etape('le collaborateur n\'est PAS Coach Nutrition certifié — et l\'écran le dit', async () => {
    const t = await contenu();
    if (!/pas encore Coach Nutrition certifié/.test(t)) throw new Error('l\'écran laisse croire à une certification');

    // Et le serveur le confirme : la réussite a ouvert la pratique, rien de plus.
    const vu = await page.evaluate(async () => {
      const s = JSON.parse(localStorage.getItem('mc-academy-session'));
      const h = { Authorization: 'Bearer ' + s.token };
      const qcm = await (await fetch('/api/academy/qcm', { headers: h })).json();
      const dossiers = await fetch('/api/boost/coach/dossiers', { headers: h });
      return { qcm: qcm.qcm, dossiers: dossiers.status };
    });
    if (vu.qcm.theorieValidee !== true) throw new Error('la théorie devrait être validée');
    if (vu.qcm.eligiblePratique !== true) throw new Error('il devrait être éligible à l\'évaluation pratique');
    if (vu.qcm.certifie !== false) throw new Error('RÉUSSIR LE QCM A CERTIFIÉ LE COACH : régression majeure');
    if (vu.qcm.certification !== 'en_cours') throw new Error('certification inattendue : ' + vu.qcm.certification);
    if (vu.dossiers !== 403) throw new Error('un non-certifié accède aux dossiers Boost : ' + vu.dossiers);
  });

  await etape('déconnexion, reconnexion : la théorie reste validée', async () => {
    await page.click('#acQBack');
    await page.waitForSelector('#acSommaire:not([hidden])');
    await seDeconnecter();

    await seConnecter(THEO, '4004');
    const t = await contenu();
    if (!/Théorie validée/.test(t)) throw new Error('la validation n\'a pas survécu à la reconnexion');
    if (!/Prochaine étape : évaluation pratique/.test(t)) throw new Error('la suite n\'est plus annoncée');
    if (!/pas encore Coach Nutrition certifié/.test(t)) throw new Error('le rappel de non-certification a disparu');
    if (!/Score : 100 %|100 %/.test(t)) throw new Error('le score validé n\'est plus affiché');
  });

  await etape('l\'historique garde les deux tentatives', async () => {
    await ouvrirEtapes();
    await page.click('.ac-qcm-histo summary');
    const lignes = await page.locator('.ac-qcm-histo li').allInnerTexts();
    if (lignes.length < 2) throw new Error('tentatives listées : ' + lignes.length);
    if (!lignes.some((l) => /réussie/.test(l))) throw new Error('la réussite n\'est pas dans l\'historique');
    if (!lignes.some((l) => /non validée/.test(l))) throw new Error('l\'échec n\'est plus dans l\'historique');
  });

  // =========================================================================
  //  PARCOURS 3 — REPRISE
  // =========================================================================
  console.log('\nPARCOURS 3 — REPRISE');

  let photo = null;
  await etape('une tentative est commencée, puis répondue à moitié', async () => {
    await seConnecter(MIA, '5005');
    if (!/Formation terminée — QCM disponible/.test(await contenu())) throw new Error('le QCM devrait être ouvert');
    await page.click('#acQcmGo');
    await page.waitForSelector('#acQcm:not([hidden])');

    const n = await page.locator('.ac-q-dot').count();
    await allerA(0, n);
    await repondreQuestion(true);
    await allerA(1, n);
    await repondreQuestion(false);

    await allerA(0, n);
    photo = await photographier();
    if (photo.length !== n) throw new Error('photographie incomplète');
    if (!photo[0].coches.length || !photo[1].coches.length) throw new Error('les deux réponses ne sont pas enregistrées');
    if (photo[2].coches.length) throw new Error('la 3e question ne devait pas être répondue');
  });

  await etape('on quitte l\'évaluation et on se déconnecte', async () => {
    await page.click('#acQBack');
    await page.waitForSelector('#acSommaire:not([hidden])');
    await ouvrirEtapes();
    const t = await contenu();
    if (!/Évaluation théorique en cours/.test(t)) throw new Error('l\'état « en cours » manque');
    if (!/2 réponses sur/.test(t)) throw new Error('le nombre de réponses saisies n\'est pas rappelé : ' + (t.match(/\d+ réponses? sur \d+/) || ['—'])[0]);
    if (!/Reprendre mon évaluation/.test(t)) throw new Error('le bouton de reprise manque');
    await seDeconnecter();
  });

  await etape('à la reconnexion, on retrouve EXACTEMENT la même tentative', async () => {
    await seConnecter(MIA, '5005');
    if (!/Reprendre mon évaluation/.test(await contenu())) throw new Error('la tentative en cours a disparu');
    await page.click('#acQcmGo');
    await page.waitForSelector('#acQcm:not([hidden])');

    const apres = await photographier();
    if (apres.length !== photo.length) throw new Error('le nombre de questions a changé');
    for (let i = 0; i < photo.length; i++) {
      if (apres[i].enonce !== photo[i].enonce) {
        throw new Error('question ' + (i + 1) + ' changée : « ' + apres[i].enonce +' » au lieu de « ' + photo[i].enonce + ' »');
      }
      if (apres[i].choix.join('|') !== photo[i].choix.join('|')) {
        throw new Error('ordre des choix changé sur la question ' + (i + 1));
      }
      if (apres[i].coches.join('|') !== photo[i].coches.join('|')) {
        throw new Error('réponses saisies perdues sur la question ' + (i + 1));
      }
    }
  });

  await etape('la tentative reprise se termine normalement', async () => {
    await page.click('#acQFin');
    await page.waitForSelector('.ac-res-score');
    if (!/Score : \d+ %/.test(await contenu())) throw new Error('pas de score au bout de la reprise');
  });

  // =========================================================================
  //  CONTRÔLES TRANSVERSES
  // =========================================================================
  console.log('\nCONTRÔLES');

  await etape('affichage mobile : le questionnaire reste utilisable en 390 px', async () => {
    await page.click('#acQBack');
    await page.waitForSelector('#acSommaire:not([hidden])');
    await page.setViewportSize({ width: 390, height: 850 });
    await page.waitForTimeout(300);
    let debord = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (debord > 2) throw new Error('débordement du sommaire de ' + debord + ' px');

    await page.click('#acQcmGo');
    await page.waitForSelector('#acQcm:not([hidden])');
    debord = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (debord > 2) throw new Error('débordement du questionnaire de ' + debord + ' px');
    const box = await page.locator('#acQcm .ac-choix').first().boundingBox();
    if (!box || box.height < 36) throw new Error('les choix sont trop petits pour être visés au doigt');
    await page.setViewportSize({ width: 1100, height: 950 });
  });

  await etape('un collaborateur désactivé perd le QCM au rechargement', async () => {
    await jsonp('/api/boost/admin/collaborateurs', { email: MIA, role: 'client' }, 'POST', jetonAdmin);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#acBloc:not([hidden])');
    const t = await contenu();
    if (!/réservée aux collaborateurs/i.test(t)) throw new Error('l\'accès devrait être fermé');
    if (/Question|Terminer mon évaluation/.test(t)) throw new Error('le questionnaire reste visible');
    await jsonp('/api/boost/admin/collaborateurs', { email: MIA, role: 'collaborateur' }, 'POST', jetonAdmin);
  });

  await etape('aucune réponse HTTP n\'a laissé filtrer le corrigé', async () => {
    if (fuites.length) throw new Error('corrigé exposé sur : ' + [...new Set(fuites)].join(', '));
  });

  await etape('aucune requête locale n\'a échoué', async () => {
    if (reponsesKo.length) throw new Error('requêtes en échec hors refus provoqués : ' + [...new Set(reponsesKo)].join(', '));
  });

  const OUT = process.env.OUT || '.';
  try {
    await page.goto(BASE + '/academy', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#acSommaire:not([hidden])', { timeout: 4000 });
    await page.screenshot({ path: OUT + '/academy-qcm.png', fullPage: true });
  } catch (_) { /* la capture ne doit jamais faire échouer la suite */ }
  await nav.close();

  console.log('\n' + '='.repeat(60));
  if (erreurs.length) {
    console.log('ÉCHECS (' + erreurs.length + ') :');
    [...new Set(erreurs)].forEach((e) => console.log('  - ' + e));
    process.exit(1);
  }
  console.log('ACADEMY — ÉVALUATION THÉORIQUE : tout est passé, aucune erreur console.');
})();
