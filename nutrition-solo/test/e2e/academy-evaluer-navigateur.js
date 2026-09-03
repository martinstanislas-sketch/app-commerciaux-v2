'use strict';
// ============================================================================
//  E2E NAVIGATEUR — « ÉVALUER & CERTIFIER », UN COACH = UNE LIGNE.
//
//  CE QUE CETTE SUITE ÉPROUVE, avec trois coachs et deux formations — donc six
//  dossiers, et SIX LIGNES dans l'ancien écran :
//
//   1. TROIS LIGNES, PAS SIX. La vue globale est centrée sur le coach, et le
//      détail n'apparaît QUE si on le demande. C'est la raison d'être du lot :
//      dix formations ne doivent plus faire dix lignes permanentes.
//
//   2. CHAQUE ÉTAT SE LIT SANS OUVRIR. À commencer, en cours, à évaluer, à
//      certifier, certifié : les badges et la jauge disent où en est chacun.
//
//   3. LES COMPTEURS COMPTENT DES DOSSIERS. « 1 à évaluer » veut dire une
//      évaluation à mener — pas un coach concerné. Et cliquer dessus mène à la
//      file correspondante.
//
//   4. LES GESTES N'ONT PAS BOUGÉ. Depuis le détail d'un coach, ouvrir une
//      fiche vise toujours le couple (coach, formation) : prononcer sur le
//      mauvais parcours serait la faute la plus grave de cette page.
//
//   5. L'ÉVALUATRICE N'A PAS GAGNÉ DE DROITS. Elle voit le même écran, sans
//      l'entrée d'administration ni le retrait de diplôme.
//
//  Hors `npm test` :
//    npm install --no-save playwright
//    NUTRITION_DB=/tmp/e2e-eval.sqlite ADMIN_EMAIL=patron@exemple.fr PORT=3225 node server.js &
//    BASE=http://127.0.0.1:3225 node test/e2e/academy-evaluer-navigateur.js
// ============================================================================

const { chromium } = require('playwright');
const { AMORCE_QUESTIONS } = require('../../lib/academyQcm');

const BASE = process.env.BASE || 'http://127.0.0.1:3225';
const ADMIN = 'patron@exemple.fr';
const EVA = 'eva.ev@exemple.fr';      // l'évaluatrice désignée, non administratrice
const ANNA = 'anna.ev@exemple.fr';    // n'a rien commencé
const BRUNO = 'bruno.ev@exemple.fr';  // théorie validée : à évaluer
const CLARA = 'clara.ev@exemple.fr';  // certifiée d'un côté, à certifier de l'autre
const BOXE = 'e2e_boxe';
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

const question = (n, p) => ({
  enonce: `${p} ${n} ?`,
  choix: [
    { texte: `Bonne ${p} ${n}`, correct: true },
    { texte: `Mauvaise A ${p} ${n}`, correct: false },
    { texte: `Mauvaise B ${p} ${n}`, correct: false },
  ],
});

// LA SECONDE FORMATION, posée par l'import : c'est la porte prévue pour ça, et
// elle crée modules, contenus, questions et cas en un seul appel.
const FORMATION_B = {
  formation: {
    cle: BOXE, libelle: 'Fitness Boxe E2E', ordre: 9,
    qcmNbQuestions: 2, qcmSeuilPct: 50, miniNbQuestions: 2, miniSeuilPct: 50,
    pratiqueObligatoire: true, certificationActive: true, titre: 'Fitness Boxe E2E certifié',
    categorie: 'expertise',
  },
  modules: [{
    titre: 'Garde et appuis', description: 'Les fondamentaux.',
    video: { titre: 'La garde', youtubeId: 'N5jHrHsGD9w', dureeMin: 12 },
    questions: [question(1, 'M1'), question(2, 'M1')],
  }],
  finale: [question(1, 'F'), question(2, 'F')],
  cas: [{ titre: 'Corriger une garde', consignes: 'SITUATION : …' }],
};

// Terminer les contenus d'une formation, puis passer son QCM. Les bonnes
// réponses viennent de la banque, jamais d'une route : aucune ne les donne.
async function validerTheorie(jeton, formation) {
  const f = (await get('/api/academy/formation?formation=' + formation, jeton)).formation;
  for (const m of f.modules) {
    for (const c of m.contenus) await jsonp(`/api/academy/contenus/${c.id}/terminer`, {}, 'POST', jeton);
    // Un module qui porte un mini-QCM doit être franchi avant le suivant.
    if (m.mini && m.mini.aBanque) {
      // La formation voyage AVEC le module : sans elle, le serveur cherche le
      // module dans la formation par défaut et le refuse, à juste titre.
      const t = (await jsonp('/api/academy/qcm/tentatives', { moduleId: m.id, formation }, 'POST', jeton)).tentative;
      if (t) {
        for (const x of t.questions) {
          const bonnes = x.choix.filter((c) => /^Bonne /.test(c.texte)).map((c) => c.id);
          await jsonp(`/api/academy/qcm/tentatives/${t.id}/reponses/${x.id}`, { choix: bonnes }, 'PUT', jeton);
        }
        await jsonp(`/api/academy/qcm/tentatives/${t.id}/terminer`, {}, 'POST', jeton);
      }
    }
  }
  const q = (await jsonp('/api/academy/qcm/tentatives', { formation }, 'POST', jeton)).tentative;
  if (!q) return false;
  for (const x of q.questions) {
    const bonnes = CORRIGE.get(x.enonce)
      ? x.choix.filter((c) => CORRIGE.get(x.enonce).includes(c.texte)).map((c) => c.id)
      : x.choix.filter((c) => /^Bonne /.test(c.texte)).map((c) => c.id);
    await jsonp(`/api/academy/qcm/tentatives/${q.id}/reponses/${x.id}`, { choix: bonnes }, 'PUT', jeton);
  }
  const r = await jsonp(`/api/academy/qcm/tentatives/${q.id}/terminer`, {}, 'POST', jeton);
  return !!(r.tentative && r.tentative.resultat && r.tentative.resultat.reussie);
}

async function semer() {
  const jetons = {};
  for (const [email, prenom, pin] of [[ADMIN, 'Stan', '7777'], [EVA, 'Eva', '5005'],
    [ANNA, 'Anna', '1001'], [BRUNO, 'Bruno', '2002'], [CLARA, 'Clara', '3003']]) {
    jetons[email] = (await jsonp('/account/login', { email, prenom, pin })).token;
  }
  const t = jetons[ADMIN];
  for (const e of [EVA, ANNA, BRUNO, CLARA]) {
    await jsonp('/api/boost/admin/collaborateurs', { email: e, role: 'collaborateur' }, 'POST', t);
    jetons[e] = (await jsonp('/account/login', { email: e, pin: { [EVA]: '5005', [ANNA]: '1001', [BRUNO]: '2002', [CLARA]: '3003' }[e] })).token;
  }
  await jsonp('/api/academy/admin/evaluateurs', { email: EVA, evaluateur: true }, 'POST', t);

  // La seconde formation, importée puis publiée.
  const imp = await jsonp('/api/academy/admin/import', { json: FORMATION_B, apercu: false }, 'POST', t);
  if (!imp.ok) throw new Error('import refusé : ' + JSON.stringify(imp).slice(0, 300));
  const pub = await jsonp(`/api/academy/admin/formations/${BOXE}/publier`, {}, 'POST', t);
  if (!pub.ok) throw new Error('publication refusée : ' + JSON.stringify(pub).slice(0, 300));

  // ANNA ne fait rien : elle doit rester visible — « à commencer ».

  // BRUNO valide la théorie de la formation historique : à évaluer.
  const f0 = (await get('/api/academy/formations', jetons[BRUNO])).formations[0].cle;
  if (!(await validerTheorie(jetons[BRUNO], f0))) throw new Error('théorie de Bruno non validée');

  // UNE FORMATION QUI PORTE UNE GRILLE EXIGE SES CRITÈRES. Coach Nutrition a
  // reçu la sienne : prononcer un verdict sans elle est refusé, et c'est
  // voulu. On la lit là où l'écran la lit — sur la fiche — plutôt que de
  // recopier des clés qui bougeraient avec le référentiel.
  const criteresDe = async (cible, formation) => {
    const f = await get(`/api/academy/evaluateur/collaborateurs/${encodeURIComponent(cible)}` +
      `?formation=${encodeURIComponent(formation)}`, t);
    return ((f && f.grille) || []).flatMap((a_) => a_.criteres.map((c_) => ({ id: c_.id, acquis: true })));
  };

  // CLARA : certifiée sur la formation historique, à certifier sur la boxe.
  if (!(await validerTheorie(jetons[CLARA], f0))) throw new Error('théorie de Clara non validée');
  await jsonp(`/api/academy/evaluateur/collaborateurs/${encodeURIComponent(CLARA)}/evaluations`,
    { resultat: 'valide', dateEvaluation: '2026-07-10', cas: 'Amorçage E2E', formation: f0,
      criteres: await criteresDe(CLARA, f0) }, 'POST', t);
  const c = await jsonp(`/api/academy/admin/certifications/${encodeURIComponent(CLARA)}`,
    { obtenueLe: '2026-07-15', formation: f0 }, 'POST', t);
  if (!c.ok) throw new Error('certification refusée : ' + JSON.stringify(c).slice(0, 300));

  if (!(await validerTheorie(jetons[CLARA], BOXE))) throw new Error('théorie boxe de Clara non validée');
  await jsonp(`/api/academy/evaluateur/collaborateurs/${encodeURIComponent(CLARA)}/evaluations`,
    { resultat: 'valide', dateEvaluation: '2026-07-20', cas: 'Amorçage E2E boxe', formation: BOXE,
      criteres: await criteresDe(CLARA, BOXE) }, 'POST', t);

  return jetons;
}

(async () => {
  await semer();

  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport: { width: 1300, height: 1000 } });
  page.setDefaultTimeout(10000);
  page.on('pageerror', (e) => erreurs.push('PAGE ERROR: ' + e.message));
  const reponsesKo = [];
  page.on('response', (r) => {
    const chemin = local(r.url()) ? new URL(r.url()).pathname : '';
    if (chemin && chemin !== '/assets/login-hero.jpg' && r.status() >= 400) {
      reponsesKo.push(r.request().method() + ' ' + chemin + ' -> ' + r.status());
    }
  });

  const etape = async (nom, fn) => {
    try { await fn(); console.log('  ✓ ' + nom); }
    catch (e) { console.log('  ✗ ' + nom + ' — ' + e.message); erreurs.push(nom + ' : ' + e.message); }
  };
  const doit = (c, m) => { if (!c) throw new Error(m); };

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

  const ouvrirEval = async () => {
    await page.click('#acRoleEval');
    await page.waitForSelector('#acEval:not([hidden])');
    await page.waitForSelector('.ac-evc');
  };
  // Les lignes de coach, en-tête exclu.
  const lignes = () => page.$$eval('#acEvalCorps .ac-evc:not(.ac-evr-h)', (n) =>
    n.map((x) => x.querySelector('.ac-evr-coach b').textContent));
  const ligneDe = (nom) => page.locator('#acEvalCorps .ac-evc:not(.ac-evr-h)', { hasText: nom });
  const kpi = (libelle) => page.locator('.ac-kpi', { hasText: libelle });
  // CHANGER DE VUE EST ASYNCHRONE : le clic relit le serveur, et les lignes de
  // l'ancienne vue portent le même sélecteur que celles de la nouvelle. On
  // attend donc que la carte cliquée s'annonce active, pas qu'une ligne existe.
  const ouvrirVue = async (libelle) => {
    await kpi(libelle).click();
    await page.waitForFunction((lib) => {
      const c = [...document.querySelectorAll('.ac-kpi')].find((x) => x.textContent.includes(lib));
      return c && c.getAttribute('aria-pressed') === 'true';
    }, libelle);
    await page.waitForSelector('#acEvalCorps');
  };

  console.log('\n  ÉVALUER & CERTIFIER — un coach = une ligne\n');

  // ==========================================================================
  //  1. TROIS COACHS, TROIS LIGNES — POUR SIX DOSSIERS
  // ==========================================================================

  await etape('la vue globale montre UNE ligne par coach, pas une par dossier', async () => {
    await seConnecter(ADMIN, '7777', '#acAdmin');
    await ouvrirEval();
    const noms = await lignes();
    doit(noms.length === 4, 'il devait y avoir 4 lignes (Eva, Anna, Bruno, Clara), il y en a ' + noms.length +
      ' : ' + noms.join(', '));
    for (const n of ['Anna', 'Bruno', 'Clara']) doit(noms.includes(n), n + ' manque à la liste');
    // Le détail n'est JAMAIS affiché par défaut.
    doit(await page.locator('.ac-evd').count() === 0, 'un détail est déplié alors que personne ne l\'a demandé');
  });

  await etape('chaque ligne porte progression, badges et médaille', async () => {
    const anna = ligneDe('Anna');
    doit(/0 \/ 2 formation/.test(await anna.locator('.ac-evc-prog').textContent()),
      'Anna n\'a rien commencé : 0 / 2 attendu');
    const clara = ligneDe('Clara');
    doit(await clara.locator('.ac-evb-medaille').count() === 1, 'Clara doit porter sa médaille');
    doit(await clara.locator('.ac-evb-cert').count() === 1, 'Clara a une certification à délivrer');
    const bruno = ligneDe('Bruno');
    doit(await bruno.locator('.ac-evb-eval').count() === 1, 'Bruno attend une évaluation');
    doit(await bruno.locator('.ac-evb-medaille').count() === 0, 'Bruno n\'a aucune certification');
  });

  // ==========================================================================
  //  2. LE DÉTAIL, SUR DEMANDE
  // ==========================================================================

  await etape('« Voir le parcours » déplie le détail sous la ligne, et le referme', async () => {
    await ligneDe('Clara').locator('[data-coach]').click();
    await page.waitForSelector('.ac-evd');
    const detail = ligneDe('Clara').locator('.ac-evd');
    const formations = await detail.locator('.ac-evdl:not(.ac-evdl-h) .ac-evdl-f').allTextContents();
    doit(formations.length === 2, 'Clara doit avoir ses deux dossiers, vu : ' + formations.join(', '));
    const etats = await detail.locator('.ac-eval-etat').allTextContents();
    // ⚠️ PLUS D'ÉTAT « À CERTIFIER » : Clara, dont la pratique est validée sur
    // la boxe, est certifiée sur ses DEUX dossiers.
    doit(etats.filter((e) => /Certifié/.test(e)).length === 2,
      'ses deux dossiers doivent être certifiés : ' + etats.join(' | '));
    doit(await detail.locator('.ac-pt').count() > 0, 'la puce d\'état doit être rendue');

    await ligneDe('Clara').locator('[data-coach]').click();
    await page.waitForFunction(() => !document.querySelector('.ac-evd'));
  });

  await etape('« À commencer » se dit, sans inventer un huitième statut', async () => {
    await ligneDe('Anna').locator('[data-coach]').click();
    await page.waitForSelector('.ac-evd');
    const etats = await ligneDe('Anna').locator('.ac-evd .ac-eval-etat').allTextContents();
    doit(etats.every((e) => /À commencer/.test(e)), 'Anna n\'a rien commencé : ' + etats.join(' | '));
    doit(await ligneDe('Anna').locator('.ac-evd .ac-st-formation-en-cours').count() === 2,
      'la pastille doit rester celle du statut serveur « formation_en_cours »');
    await ligneDe('Anna').locator('[data-coach]').click();
    await page.waitForFunction(() => !document.querySelector('.ac-evd'));
  });

  // ==========================================================================
  //  3. LES COMPTEURS SONT DES RACCOURCIS, ET COMPTENT DES DOSSIERS
  // ==========================================================================

  await etape('les deux compteurs comptent des dossiers', async () => {
    const lire = async (libelle) => Number(await kpi(libelle).locator('.ac-kpi-tx b').textContent());
    doit(await lire('À évaluer') === 1, '« À évaluer » devait valoir 1 (Bruno)');
    // Deux dossiers certifiés pour Clara : l'historique, et la boxe que la
    // validation de sa pratique vient de certifier automatiquement.
    doit(await lire('Certifiés') === 2, '« Certifiés » devait valoir 2 (les deux dossiers de Clara)');
  });

  await etape('cliquer « À évaluer » ouvre la file, et n\'y met que ce qui attend', async () => {
    await ouvrirVue('À évaluer');
    const l = await page.$$eval('#acEvalCorps .ac-evr:not(.ac-evr-h)', (n) => n.map((x) => x.textContent));
    doit(l.length === 1, 'la file devait contenir un seul dossier, elle en a ' + l.length);
    doit(/Bruno/.test(l[0]), 'le dossier de la file doit être celui de Bruno : ' + l[0].slice(0, 80));
    doit(await kpi('À évaluer').getAttribute('aria-pressed') === 'true', 'la carte active doit le dire');
  });

  await etape('cliquer « Certifiés » ouvre la vue des certifications', async () => {
    await ouvrirVue('Certifiés');
    const l = await page.$$eval('#acEvalCorps .ac-evr:not(.ac-evr-h)', (n) => n.map((x) => x.textContent));
    doit(l.length >= 1 && l.some((x) => /Clara/.test(x)), 'la vue devait tenir les dossiers de Clara');
    doit(l.some((x) => /Fitness Boxe E2E/.test(x)), 'et viser LA BONNE formation : ' + (l[0] || '').slice(0, 120));
  });

  await etape('« Certifications » montre les diplômes obtenus', async () => {
    await page.click('[data-onglet-eval="certifications"]');
    await page.waitForFunction(() => {
      const o = document.querySelector('#acEval [data-onglet-eval="certifications"]');
      return o && o.classList.contains('on');
    });
    await page.waitForFunction(() => /Clara/.test((document.querySelector('#acEvalCorps') || {}).textContent || ''));
    const txt = await page.locator('#acEvalCorps').textContent();
    doit(/Clara/.test(txt), 'la certifiée doit y être : ' + txt.slice(0, 120));
  });

  // ==========================================================================
  //  4. LES FILTRES
  // ==========================================================================

  await etape('la recherche et le filtre d\'état trient sans recharger', async () => {
    await page.click('[data-onglet-eval="coachs"]');
    await page.waitForSelector('#acEvalCorps .ac-evc:not(.ac-evr-h)');
    await page.waitForFunction(() =>
      document.querySelectorAll('#acEvalCorps .ac-evc:not(.ac-evr-h)').length === 4);
    await page.fill('#acEvalQ', 'bru');
    await page.waitForFunction(() =>
      document.querySelectorAll('#acEvalCorps .ac-evc:not(.ac-evr-h)').length === 1);
    doit((await lignes())[0] === 'Bruno', 'la recherche doit isoler Bruno');
    // Le champ garde le curseur : c'est ce que garantit le rendu du corps seul.
    doit(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'acEvalQ',
      'le champ de recherche a perdu le focus');

    await page.fill('#acEvalQ', '');
    await page.selectOption('#acEvalEtat', 'certifies');
    await page.waitForFunction(() =>
      document.querySelectorAll('#acEvalCorps .ac-evc:not(.ac-evr-h)').length === 1);
    doit((await lignes())[0] === 'Clara', 'le filtre « certifiés » doit isoler Clara');
    await page.selectOption('#acEvalEtat', 'tous');
    await page.waitForFunction(() =>
      document.querySelectorAll('#acEvalCorps .ac-evc:not(.ac-evr-h)').length === 4);
  });

  // ==========================================================================
  //  5. LES GESTES VISENT LE DOSSIER
  // ==========================================================================

  await etape('depuis le détail, la fiche ouverte est celle du BON parcours', async () => {
    await ligneDe('Bruno').locator('[data-coach]').click();
    await page.waitForSelector('.ac-evd');
    await ligneDe('Bruno').locator('.ac-evd [data-collab]').first().click();
    await page.waitForSelector('#acEval .ac-eval-fiche, #acEvalRetour');
    const txt = await page.locator('#acEval').textContent();
    doit(/Bruno|bruno\.ev/.test(txt), 'la fiche doit être celle de Bruno');
    await page.click('#acEvalRetour');
    await page.waitForSelector('.ac-evc');
  });

  // ==========================================================================
  //  6. L'ÉVALUATRICE N'A PAS GAGNÉ DE DROITS
  // ==========================================================================

  await etape('l\'évaluatrice voit le même écran, sans administration', async () => {
    await seConnecter(EVA, '5005', '#acAccueil');
    await page.click('#acRoleEval');
    await page.waitForSelector('#acEval:not([hidden])');
    await page.waitForSelector('.ac-evc');
    const noms = await lignes();
    doit(noms.length === 4, 'elle doit voir les mêmes coachs, vu : ' + noms.join(', '));
    doit(await page.locator('#acEvalAdmin').count() === 0, 'elle ne doit pas avoir l\'entrée d\'administration');
    const visible = await page.evaluate(() => {
      const b = document.querySelector('#acRoleAdmin');
      return !!b && !b.hidden;
    });
    doit(!visible, 'le bouton Administrer ne doit pas lui être proposé');
  });

  await etape('et elle ne peut pas retirer un diplôme', async () => {
    await page.click('[data-onglet-eval="certifications"]');
    await page.waitForSelector('#acEvalCorps');
    doit(await page.locator('[data-geste="retirer"]').count() === 0,
      'le retrait de diplôme reste à l\'administrateur');
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
