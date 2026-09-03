// ============================================================================
//  E2E NAVIGATEUR — « MON ACCOMPAGNEMENT », CÔTÉ CLIENT.
//
//  CE QUE CETTE SUITE DÉROULE, ET QUI N'ÉTAIT PAS POSSIBLE AVANT :
//
//    le coach anime son dossier de son côté (rendez-vous après rendez-vous),
//    et le CLIENT voit son écran changer entre chaque : l'Étape avance, son
//    objectif change, l'action se remplace, le constat du rendez-vous passé
//    apparaît — jusqu'aux trois règles qu'il emporte au bilan.
//
//  Avant ce lot, `/api/boost/mien` existait et personne ne l'appelait : un
//  client suivait seize semaines d'accompagnement sans qu'aucun écran ne lui
//  dise où il en était ni ce qu'il avait à faire.
//
//  LES QUATRE REFUS QUE LA SUITE ÉPROUVE AUSSI, parce qu'ouvrir un écran est
//  exactement le moment où l'on vérifie ce qu'il ne montre pas :
//   - la note interne du coach n'apparaît JAMAIS à l'écran du client ;
//   - son bloc de travail (réussites, difficultés, observations) non plus ;
//   - aucun email interne ne traverse ;
//   - le client ne peut RIEN écrire : le verdict appartient au coach.
//
//  Et deux règles d'affichage qui se cassent silencieusement :
//   - UNE SEULE action affichée, jamais deux ;
//   - l'action montrée est celle de l'Étape N-1 (une Étape est une période).
//
//  Hors `npm test` :
//    npm install --no-save playwright
//    NUTRITION_DB=/tmp/e2e.sqlite ADMIN_EMAIL=patron@exemple.fr PORT=3222 node server.js &
//    BASE=http://127.0.0.1:3222 node test/e2e/boost-client-navigateur.js
// ============================================================================
const { chromium } = require('playwright');
const { AMORCE_QUESTIONS } = require('../../lib/academyQcm');

const BASE = process.env.BASE || 'http://127.0.0.1:3222';
const ADMIN = 'patron@exemple.fr';
const COACH = 'quentin.ec@exemple.fr';
const CLI = 'lea.ec@exemple.fr';
const erreurs = [];
const local = (url) => url.startsWith(BASE);

// Ce qui ne doit JAMAIS atteindre l'écran du client. Semé à chaque rendez-vous.
const NOTE_INTERNE = 'NOTEINTERNECOACHSECRETE';
const OBSERVATION = 'OBSERVATIONDETRAVAILDUCOACH';
const DIFFICULTE = 'DIFFICULTENOTEEPARLECOACH';

const CORRIGE = new Map(AMORCE_QUESTIONS.map((q) =>
  [q.enonce, q.choix.filter(([, bon]) => bon).map(([texte]) => texte)]));

const jsonp = (r, b, m, t) => fetch(BASE + r, {
  method: m || 'POST',
  headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
  body: b ? JSON.stringify(b) : undefined,
}).then((x) => x.json());
const get = (r, t) => fetch(BASE + r, { headers: { Authorization: 'Bearer ' + t } }).then((x) => x.json());

// Un Coach Nutrition certifié s'obtient par le PARCOURS RÉEL de l'Academy :
// la porte directe du Boost est fermée depuis le lot 4.
async function certifier(email, jeton, jetonAdmin) {
  await jsonp('/api/academy/admin/evaluateurs', { email: ADMIN }, 'POST', jetonAdmin);
  const f = (await get('/api/academy/formation', jeton)).formation;
  for (const c of f.modules.flatMap((m) => m.contenus)) {
    await jsonp(`/api/academy/contenus/${c.id}/terminer`, {}, 'POST', jeton);
  }
  const q = (await jsonp('/api/academy/qcm/tentatives', {}, 'POST', jeton)).tentative;
  for (const x of q.questions) {
    const bonnes = CORRIGE.get(x.enonce) || [];
    await jsonp(`/api/academy/qcm/tentatives/${q.id}/reponses/${x.id}`,
      { choix: x.choix.filter((c) => bonnes.includes(c.texte)).map((c) => c.id) }, 'PUT', jeton);
  }
  await jsonp(`/api/academy/qcm/tentatives/${q.id}/terminer`, {}, 'POST', jeton);
  await jsonp(`/api/academy/evaluateur/collaborateurs/${encodeURIComponent(email)}/evaluations`,
    { resultat: 'valide', dateEvaluation: '2026-07-10' }, 'POST', jetonAdmin);
  const c = await jsonp(`/api/academy/admin/certifications/${encodeURIComponent(email)}`,
    { obtenueLe: '2026-07-15' }, 'POST', jetonAdmin);
  if (!c.ok) throw new Error('certification refusée : ' + JSON.stringify(c));
}

const S1 = {
  donnees: {
    objectif: { choix: 'perte', texte: 'Retrouver de l\'énergie le matin.' },
    habitudes: { petitDejeuner: 'Café seul' },
    difficultes: { choix: ['temps'], precision: 'Semaine chargée.' },
    journalPhotoExplique: true,
  },
  action: { intitule: 'Un petit-dejeuner proteine', detail: 'Oeufs ou skyr, pas de sucre seul.', frequence: 'Tous les matins en semaine' },
  noteCoach: NOTE_INTERNE,
};
const suivi = (n) => ({
  donnees: {
    actionPrecedente: { resultat: 'partielle', commentaire: 'Bien tenu en semaine, decroche le week-end.' },
    bilan: { reussites: 'Petit-dejeuner mieux tenu', difficultes: DIFFICULTE, observations: OBSERVATION },
    decision: 'ajuster', adhesion: 8,
  },
  action: { intitule: `Action de l Etape ${n}`, detail: 'Detail visible du client.', frequence: '3 fois par semaine' },
  noteCoach: NOTE_INTERNE,
});

(async () => {
  // ---- Amorçage par l'API : coach certifié, client, dossier attribué -------
  for (const [email, prenom, pin] of [[ADMIN, 'Patron', '7777'], [COACH, 'Quentin', '2002'], [CLI, 'Lea', '1001']]) {
    await jsonp('/account/login', { email, prenom, pin });
  }
  const jetonAdmin = (await jsonp('/account/login', { email: ADMIN, pin: '7777' })).token;
  const jetonCoach = (await jsonp('/account/login', { email: COACH, pin: '2002' })).token;
  await jsonp('/api/boost/admin/collaborateurs', { email: COACH, role: 'collaborateur' }, 'POST', jetonAdmin);
  await certifier(COACH, jetonCoach, jetonAdmin);
  const dossier = (await jsonp('/api/boost/admin/dossiers',
    { clientEmail: CLI, coachEmail: COACH }, 'POST', jetonAdmin)).boost.id;
  const rdv = (n, sfx) => `/api/boost/coach/dossiers/${dossier}/seances/${n}${sfx || ''}`;

  const nav = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const page = await nav.newPage({ viewport: { width: 1100, height: 950 } });
  page.setDefaultTimeout(9000);
  page.on('pageerror', (e) => erreurs.push('PAGE ERROR: ' + e.message));
  const reponsesKo = [];
  page.on('response', (r) => {
    if (r.status() >= 400 && local(r.url())) reponsesKo.push(r.request().method() + ' ' + new URL(r.url()).pathname + ' -> ' + r.status());
  });

  const etape = async (nom, fn) => {
    try { await fn(); console.log('  ✓ ' + nom); }
    catch (e) { console.log('  ✗ ' + nom + ' — ' + e.message); erreurs.push(nom + ' : ' + e.message); }
  };
  const contenu = () => page.evaluate(() => document.body.innerText);

  // Le portail d'entrée : landing -> « Se connecter » -> email + code.
  async function seConnecter(email, pin, prenom) {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);
    await page.locator('[data-cta="login"]').first().click();
    await page.waitForSelector('#rGo');
    if (await page.locator('#rPrenom').count()) {
      await page.fill('#rPrenom', prenom); await page.fill('#rEmail', email);
    }
    await page.fill('#rPin', pin);
    await page.click('#rGo');
    await page.waitForTimeout(2200);
    await faireOnboarding();
  }
  // L'ONBOARDING NUTRITION EST LE PÉAGE DE TOUTE L'APP. La coquille — barre
  // d'onglets comprise — vit dans #screen-result, qui ne s'affiche qu'une fois
  // le plan construit. Un client accompagné doit donc l'avoir fait pour
  // atteindre son suivi : ce n'est pas un détour de test, c'est le parcours.
  async function faireOnboarding() {
    const cta = page.locator('#ctaStart');
    if (await cta.count() && await cta.isVisible()) { await cta.click(); await page.waitForTimeout(400); }
    if (!(await page.locator('[data-step="1"].active').count())) return; // déjà fait
    await page.locator('[data-step="1"] .choice[data-value="perte"]').click();
    await page.click('#btnNext'); await page.waitForTimeout(250);
    await page.evaluate(() => {
      const s = document.querySelector('[data-step="2"]');
      const set = (n, v) => { const e = s.querySelector(`[name="${n}"]`); if (!e) return;
        e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); };
      set('age', '35'); set('taille_cm', '170'); set('poids_kg', '72');
      const sx = s.querySelector('[data-field="sexe"] .choice, [name="sexe"]');
      if (sx && sx.tagName === 'BUTTON') sx.click();
    });
    let garde = 0;
    while (await page.locator('#btnNext').isVisible() && garde++ < 10) {
      await page.click('#btnNext'); await page.waitForTimeout(250);
    }
    await page.click('#btnFinish');
    await page.waitForSelector('#screen-result.active', { timeout: 15000 });
    await page.waitForTimeout(900);
  }

  const ouvrirSuivi = async () => {
    await page.waitForSelector('#navAccompagnement:not(.hidden)');
    await page.click('#navAccompagnement');
    await page.waitForTimeout(400);
  };

  console.log('\n═══ MON ACCOMPAGNEMENT — CÔTÉ CLIENT ═══');

  // =========================================================================
  //  1. AVANT LE PREMIER RENDEZ-VOUS
  // =========================================================================
  console.log('\n1. AVANT LE DÉMARRAGE');

  await etape('l\'onglet « Suivi » apparaît, et annonce l\'Étape 1', async () => {
    await seConnecter(CLI, '1001', 'Lea');
    await ouvrirSuivi();
    const t = await contenu();
    if (!/Étape 1 sur 12/.test(t)) throw new Error('l\'Étape courante n\'est pas annoncée : ' + t.slice(0, 200));
    if (!/Faire le point/.test(t)) throw new Error('le titre de l\'Étape manque');
    if (!/définir la première priorité/.test(t)) throw new Error('l\'objectif de l\'Étape manque');
    if (!/Quentin/.test(t)) throw new Error('le prénom du coach manque');
    if (!/premier rendez-vous n'a pas encore eu lieu/.test(t)) throw new Error('l\'état « à démarrer » n\'est pas dit');
  });

  // =========================================================================
  //  2. LE COACH ANIME, L'ÉCRAN DU CLIENT SUIT
  // =========================================================================
  console.log('\n2. LE PARCOURS');

  await etape('après le rendez-vous de découverte, son action apparaît', async () => {
    const r = await jsonp(rdv(1, '/valider'), S1, 'POST', jetonCoach);
    if (!r.ok) throw new Error('S1 refusé : ' + JSON.stringify(r).slice(0, 160));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#screen-result.active', { timeout: 15000 });
    await page.waitForTimeout(1200);
    await ouvrirSuivi();
    const t = await contenu();
    if (!/Étape 2 sur 12/.test(t)) throw new Error('l\'Étape n\'a pas avancé');
    if (!/Passer à l'action/.test(t)) throw new Error('le titre de l\'Étape 2 manque');
    if (!/Un petit-dejeuner proteine/.test(t)) throw new Error('SON ACTION N\'EST PAS AFFICHÉE');
    if (!/Oeufs ou skyr/.test(t)) throw new Error('le détail de l\'action manque');
    if (!/Tous les matins en semaine/.test(t)) throw new Error('la fréquence manque');
    // Une Étape est une PÉRIODE : à l'Étape 2 on travaille l'action décidée à l'Étape 1.
    if (!/décidée à l'Étape 1/i.test(t)) throw new Error('l\'Étape de décision est fausse ou absente');
    if (!/jusqu'à ton prochain rendez-vous/.test(t)) throw new Error('l\'échéance n\'est pas dite comme il faut');
  });

  await etape('le rappel de l\'action est aussi sur l\'écran Repas', async () => {
    await page.click('#bottom-nav [data-tab="plan"]');
    await page.waitForTimeout(400);
    const r = page.locator('#rappelAction');
    if (!(await r.count())) throw new Error('le rappel manque : l\'action ne se verrait qu\'en ouvrant un onglet');
    if (!/Un petit-dejeuner proteine/.test(await r.innerText())) throw new Error('le rappel ne nomme pas l\'action');
    await r.click();
    await page.waitForSelector('#view-accompagnement .acc-c-action', { timeout: 9000 });
    if (!/Mon action en cours/i.test(await contenu())) throw new Error('le rappel n\'ouvre pas le suivi');
  });

  await etape('au rendez-vous suivant : le constat, puis la nouvelle action', async () => {
    if (!(await jsonp(rdv(2, '/valider'), suivi(2), 'POST', jetonCoach)).ok) throw new Error('S2 refusé');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#screen-result.active', { timeout: 15000 });
    await page.waitForTimeout(1200);
    await ouvrirSuivi();
    const t = await contenu();
    if (!/Étape 3 sur 12/.test(t)) throw new Error('l\'Étape n\'a pas avancé');
    if (!/Partiellement réalisée/.test(t)) throw new Error('le constat sur l\'action passée manque');
    if (!/decroche le week-end/.test(t)) throw new Error('le commentaire du coach ne lui parvient pas');
    if (!/Action de l Etape 2/.test(t)) throw new Error('la nouvelle action manque');
    // UNE SEULE action affichée : l'ancienne a disparu de la carte.
    const carte = await page.locator('.acc-c-action').innerText();
    if (/Un petit-dejeuner proteine/.test(carte)) throw new Error('DEUX ACTIONS AFFICHÉES : l\'ancienne est restée');
  });

  await etape('le parcours se relit, étape par étape, et déplie le passé', async () => {
    const lignes = await page.locator('.acc-ps .acc-p').count();
    if (lignes !== 12) throw new Error('les douze Étapes devraient être listées, vu : ' + lignes);
    // Une Étape franchie s'ouvre sur ce qui s'y est décidé.
    await page.locator('details.acc-p').first().click();
    await page.waitForTimeout(250);
    const t = await contenu();
    if (!/Retrouver de l'énergie/.test(t)) throw new Error('l\'objectif que le client a formulé manque');
  });

  await etape('jusqu\'au bilan : les trois règles qu\'il emporte', async () => {
    for (let n = 3; n <= 11; n++) {
      if (!(await jsonp(rdv(n, '/valider'), suivi(n), 'POST', jetonCoach)).ok) throw new Error('rendez-vous ' + n + ' refusé');
    }
    const bilan = {
      donnees: {
        actionPrecedente: { resultat: 'realisee', commentaire: 'Bien installe.' },
        bilan: { progres: 'Energie retrouvee', plusFacile: 'Les matins', appris: 'Anticiper' },
        regles: ['Un petit-dejeuner proteine', 'Je prepare le dimanche', 'Je bois avant de manger'],
        fragiles: OBSERVATION, confiance: 8,
      },
      noteCoach: NOTE_INTERNE,
    };
    if (!(await jsonp(rdv(12, '/valider'), bilan, 'POST', jetonCoach)).ok) throw new Error('bilan refusé');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#screen-result.active', { timeout: 15000 });
    await page.waitForTimeout(1200);
    await ouvrirSuivi();
    const t = await contenu();
    // LE BOOST EST CLOS — et c'est justement là que les règles comptent.
    if (!/Les 12 Étapes sont derrière toi/.test(t)) throw new Error('la clôture n\'est pas annoncée');
    if (!/Ce que tu emportes/i.test(t)) throw new Error('les règles ne sont pas présentées');
    for (const r of ['Je prepare le dimanche', 'Je bois avant de manger']) {
      if (!t.includes(r)) throw new Error('règle manquante : ' + r);
    }
    if (/Mon action en cours/i.test(t)) throw new Error('LE BILAN NE CRÉE AUCUNE ACTION : il ne doit plus y en avoir');
  });

  // =========================================================================
  //  3. CE QUE L'ÉCRAN NE MONTRE JAMAIS
  // =========================================================================
  console.log('\n3. L\'ÉTANCHÉITÉ');

  await etape('ni note interne, ni bloc de travail du coach, ni email', async () => {
    // On regarde le DOM entier, pas seulement le texte visible : une donnée
    // posée dans un attribut ou un noeud masqué serait tout aussi divulguée.
    const dom = await page.evaluate(() => document.documentElement.outerHTML);
    for (const [quoi, aiguille] of [['la note interne du coach', NOTE_INTERNE],
      ['ses observations de travail', OBSERVATION], ['ses difficultés notées', DIFFICULTE],
      ['l\'email du coach', COACH], ['l\'email de l\'administrateur', ADMIN]]) {
      if (dom.includes(aiguille)) throw new Error(quoi + ' est dans la page : fuite');
    }
    // Et la note existe bel et bien côté coach : c'est un FILTRE, pas un vide.
    const cote = await get(rdv(2), jetonCoach);
    if (cote.seance.noteCoach !== NOTE_INTERNE) throw new Error('la note interne devrait exister côté coach');
  });

  await etape('le client ne peut RIEN écrire : le verdict appartient au coach', async () => {
    const boutons = await page.locator('#view-accompagnement button:not(summary)').count();
    const champs = await page.locator('#view-accompagnement input, #view-accompagnement textarea, #view-accompagnement select').count();
    if (champs !== 0) throw new Error('un champ de saisie traîne dans l\'écran : ' + champs);
    if (boutons !== 0) throw new Error('un bouton d\'action traîne dans l\'écran : ' + boutons);
    // Et le serveur refuse de toute façon.
    const r = await page.evaluate(async (id) => {
      const c = JSON.parse(localStorage.getItem('nutri-compte'));
      const res = await fetch('/api/boost/coach/dossiers/' + id + '/seances/2/valider', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + c.token },
        body: JSON.stringify({ donnees: {}, action: { intitule: 'pirate' } }),
      });
      return res.status;
    }, dossier);
    if (r !== 403) throw new Error('un client a atteint une route de coach : ' + r);
  });

  await etape('un client SANS accompagnement ne voit pas l\'onglet', async () => {
    await jsonp('/account/login', { email: 'sans.ec@exemple.fr', prenom: 'Sam', pin: '5005' });
    await seConnecter('sans.ec@exemple.fr', '5005', 'Sam');
    await page.waitForTimeout(1200);
    const nav = page.locator('#navAccompagnement');
    if (await nav.isVisible()) throw new Error('l\'onglet est offert à qui n\'a aucun accompagnement');
  });

  // =========================================================================
  //  4. MOBILE 390 PX
  // =========================================================================
  console.log('\n4. MOBILE 390 px');

  await etape('l\'écran tient en 390 px, rappel compris', async () => {
    await page.setViewportSize({ width: 390, height: 900 });
    await seConnecter(CLI, '1001', 'Lea');
    await ouvrirSuivi();
    const debord = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (debord > 2) throw new Error('débordement de ' + debord + ' px');
  });

  await etape('aucune requête locale n\'a échoué hors refus provoqués', async () => {
    const inattendus = reponsesKo.filter((l) => !/-> 40[0134]$/.test(l));
    if (inattendus.length) throw new Error(inattendus.join(' | '));
  });

  await nav.close();

  console.log('\n' + '='.repeat(60));
  if (erreurs.length) {
    console.log('BOOST — MON ACCOMPAGNEMENT : ' + erreurs.length + ' problème(s)');
    erreurs.forEach((e) => console.log('  - ' + e));
    process.exit(1);
  }
  console.log('BOOST — MON ACCOMPAGNEMENT : tout est passé, aucune erreur console.');
})();
