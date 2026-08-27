// ============================================================================
//  E2E NAVIGATEUR — S12, le bilan final et l'autonomie.
//
//  Le parcours demandé, jusqu'au bout : S1-S11 validées → ouvrir S12 → vérifier
//  le rappel du départ → remplir partiellement → brouillon → quitter/revenir →
//  retrouver le brouillon → compléter → terminer le Boost → Étape 12 terminée →
//  statut Terminé → plan d'autonomie affiché → AUCUNE action active.
//
//  Ce dernier point est le seul qui ne se voit pas à l'écran : on le vérifie
//  donc en base, via l'API, depuis le navigateur. Un Boost terminé qui laisse
//  une consigne hebdomadaire courante ne provoque aucun bug visible — et un
//  client qui continue d'appliquer une action après la fin de son
//  accompagnement, si.
//
//  Hors `npm test` :
//    npm install --no-save playwright
//    NUTRITION_DB=/tmp/e2e.sqlite ADMIN_EMAIL=patron@exemple.fr PORT=3222 node server.js &
//    BASE=http://127.0.0.1:3222 node test/e2e/boost-s12-navigateur.js
// ============================================================================
const { chromium } = require('playwright');
// Depuis le lot 4, un Coach Nutrition certifié s'amorce par le PARCOURS RÉEL :
// la porte directe du Boost est fermée. Chaque suite prouve donc la chaîne
// complète en passant — contenus, QCM, évaluation pratique, délivrance.
const { creerAide } = require('./aideAcademy');

const BASE = process.env.BASE || 'http://127.0.0.1:3222';
const ADMIN = 'patron@exemple.fr';
const COACH = 'quentin.s12@exemple.fr';
const CLIENT = 'lea.s12@exemple.fr';
const erreurs = [];

const jsonp = (r, b, m, t) => fetch(BASE + r, {
  method: m || 'POST',
  headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
  body: b ? JSON.stringify(b) : undefined,
}).then((x) => x.json());

async function semer() {
  for (const [email, prenom, pin] of [[ADMIN, 'Patron', '7777'], [COACH, 'Quentin', '2002'], [CLIENT, 'Léa', '1001']]) {
    await jsonp('/account/login', { email, prenom, pin });
  }
  const t = (await jsonp('/account/login', { email: ADMIN, pin: '7777' })).token;
  await jsonp('/api/boost/admin/collaborateurs', { email: COACH, role: 'collaborateur' }, 'POST', t);
  await creerAide(BASE).certifier({ email: COACH, pin: '2002', jetonAdmin: t });
  const r = await jsonp('/api/boost/admin/dossiers', { clientEmail: CLIENT, coachEmail: COACH }, 'POST', t);
  if (!r.ok) throw new Error('préparation impossible (' + (r.error || '?') + ') — relance sur une base vierge.');
  const id = r.boost.id;

  // S1 à S11 posées par l'API : ce script teste LE BILAN, les rendez-vous
  // précédents ont leurs propres suites.
  const tc = (await jsonp('/account/login', { email: COACH, pin: '2002' })).token;
  await jsonp(`/api/boost/coach/dossiers/${id}/seances/1/valider`, {
    donnees: {
      objectif: { choix: 'perte', texte: 'Perdre 8 kg avant l\'été.' },
      habitudes: { diner: 'Tard, vers 21h30', collations: 'Biscuits vers 17h' },
      difficultes: { choix: ['temps', 'sucre'], precision: 'Craque le dimanche soir.' },
      journalPhotoExplique: true,
    },
    action: { intitule: 'Protéines au petit-déjeuner', frequence: '5 fois par semaine' },
    noteCoach: 'Note interne de S1.',
  }, 'POST', tc);
  for (let n = 2; n <= 11; n++) {
    await jsonp(`/api/boost/coach/dossiers/${id}/seances/${n}/valider`, {
      donnees: {
        actionPrecedente: { resultat: 'realisee', commentaire: `Constat de l'Étape ${n}.` },
        bilan: { reussites: '', difficultes: '', observations: '' },
        decision: 'ajuster', adhesion: 7,
      },
      action: { intitule: `Action de l'Étape ${n}`, frequence: '3 fois par semaine' },
      noteCoach: `Note interne de l'Étape ${n}.`,
    }, 'POST', tc);
  }
  return { t, id };
}

(async () => {
  const { id } = await semer();

  const nav = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const page = await nav.newPage({ viewport: { width: 1100, height: 950 } });
  page.setDefaultTimeout(6000);
  page.on('pageerror', (e) => erreurs.push('PAGE ERROR: ' + e.message));
  const reponsesKo = [];
  page.on('response', (r) => { if (r.status() >= 400) reponsesKo.push(r.request().method() + ' ' + new URL(r.url()).pathname + ' -> ' + r.status()); });

  const etape = async (nom, fn) => {
    try { await fn(); console.log('  ✓ ' + nom); }
    catch (e) { console.log('  ✗ ' + nom + ' — ' + e.message); erreurs.push(nom + ' : ' + e.message); }
  };
  const contenu = () => page.evaluate(() => document.body.textContent);
  const parApi = (route) => page.evaluate(async (r) => {
    const s = JSON.parse(localStorage.getItem('mc-coach-session'));
    const res = await fetch(r, { headers: { Authorization: 'Bearer ' + s.token } });
    return res.json();
  }, route);

  async function seConnecter() {
    await page.goto(BASE + '/coach', { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.removeItem('mc-coach-session'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#ecLogin:not([hidden])');
    await page.fill('#ecEmail', COACH);
    await page.fill('#ecPin', '2002');
    await page.click('#ecGo');
    await page.waitForSelector('#ecListe:not([hidden])');
  }

  await etape('le client arrivé au bout ouvre sur le bilan', async () => {
    await seConnecter();
    await page.locator('.ec-cli', { hasText: 'Léa' }).click();
    await page.waitForSelector('#ecBilan');
    const t = await contenu();
    if (!/Étape 12\/12 — Ton bilan/.test(t)) throw new Error('titre du bilan attendu');
    if (/Ton action jusqu/.test(t)) throw new Error('aucune action de semaine ne doit être proposée');
  });

  await etape('le bilan ouvre sur le constat de l\'action de S11', async () => {
    const prec = await page.innerText('.ec-rdv-prec');
    if (!/Ton action depuis le dernier rendez-vous/.test(prec)) throw new Error('section absente');
    if (!/Action de l'Étape 11/.test(prec)) throw new Error('l\'action de S11 n\'est pas reprise : ' + prec);
    if (await page.locator('.ec-rdv-prec .ec-chip').count() !== 3) throw new Error('les trois constats devraient être offerts');
    // Elle vient AVANT le rappel du départ.
    const a = await page.locator('.ec-rdv-prec').boundingBox();
    const b = await page.locator('.ec-depart').boundingBox();
    if (!(a.y < b.y)) throw new Error('le constat devrait précéder le rappel du départ');
  });

  await etape('le rappel du point de départ est là, sans rien ressaisir', async () => {
    const t = await page.innerText('.ec-depart');
    if (!/Perdre 8 kg/.test(t)) throw new Error('objectif initial absent');
    if (!/Manque de temps/.test(t) || !/Envies de sucre/.test(t)) throw new Error('difficultés absentes');
    if (!/dimanche soir/.test(t)) throw new Error('précision absente');
    if (!/21h30/.test(t)) throw new Error('les habitudes de S1 devraient être rappelées');
    if (!/Biscuits vers 17h/.test(t)) throw new Error('habitudes incomplètes');
  });

  await etape('le chemin parcouru montre les onze actions', async () => {
    const n = await page.locator('.ec-chemin li').count();
    if (n !== 11) throw new Error('11 actions attendues, vues : ' + n);
    const t = await page.innerText('.ec-chemin');
    if (!/Protéines au petit-déjeuner/.test(t)) throw new Error('l\'action de S1 manque');
    if (!/Réalisée/.test(t)) throw new Error('les résultats manquent');
    if (!/Ajuster/.test(t)) throw new Error('les décisions manquent');
    if (!/adhésion 7\/10/.test(t)) throw new Error('les adhésions manquent');
    // À l'ouverture, la dernière action n'est pas encore constatée : c'est le
    // rendez-vous en cours qui va le faire. On le dit, on ne l'invente pas.
    if (!/pas encore constatée/.test(t)) throw new Error('la dernière action devrait être signalée sans résultat');
  });

  await etape('refus de terminer un bilan vide, avec ce qui manque', async () => {
    await page.click('#rdvValider');
    await page.waitForSelector('.ec-rdv-manque');
    const t = await page.innerText('.ec-rdv-manque');
    for (const m of ['résultat de l\'action précédente', 'bilan de ce qui a changé', 'au moins une règle', 'confiance']) {
      if (!t.includes(m)) throw new Error('manque non signalé : ' + m);
    }
  });

  await etape('remplissage partiel puis « Enregistrer le brouillon »', async () => {
    await page.locator('.ec-chip', { hasText: /^Partiellement réalisée$/ }).click();
    await page.fill('#svResCom', 'Tenue quatre jours sur sept.');
    await page.fill('[data-bilan12="progres"]', 'Six kilos en moins et un bien meilleur sommeil.');
    await page.fill('[data-regle="0"]', 'Préparer mes déjeuners la veille');
    await page.fill('#bilFragiles', 'Les week-ends et les repas au restaurant.');
    await page.fill('#rdvNote', 'Note interne du bilan.');
    await page.click('#rdvBrouillon');
    await page.waitForSelector('.ec-rdv-msg');
    if (!/Brouillon enregistré/.test(await page.innerText('.ec-rdv-msg'))) throw new Error('confirmation absente');
  });

  await etape('le brouillon ne termine pas le Boost', async () => {
    const b = await parApi('/api/boost/coach/dossiers/' + id);
    if (b.boost.statut !== 'en_cours') throw new Error('statut devenu ' + b.boost.statut);
    if (b.boost.etapesValidees !== 11) throw new Error('une Étape a été validée par un brouillon');
    if (b.boost.termineLe) throw new Error('le Boost a été clos par un brouillon');
  });

  await etape('on quitte, on revient : le brouillon est retrouvé', async () => {
    await page.click('#ecOut');
    await page.waitForSelector('#ecLogin:not([hidden])');
    await seConnecter();
    await page.locator('.ec-cli', { hasText: 'Léa' }).click();
    await page.waitForSelector('#ecBilan');
    if (!/Six kilos en moins/.test(await page.inputValue('[data-bilan12="progres"]'))) throw new Error('bilan perdu');
    const res = await page.locator('input[name="svRes"]:checked').getAttribute('value');
    if (res !== 'partielle') throw new Error('constat décoché : ' + res);
    if (!/quatre jours/.test(await page.inputValue('#svResCom'))) throw new Error('commentaire du constat perdu');
    if (!/déjeuners la veille/.test(await page.inputValue('[data-regle="0"]'))) throw new Error('règle perdue');
    if (!/restaurant/.test(await page.inputValue('#bilFragiles'))) throw new Error('points fragiles perdus');
    if (!/Note interne du bilan/.test(await page.inputValue('#rdvNote'))) throw new Error('note coach perdue');
  });

  await etape('la confiance manquante bloque encore la fin', async () => {
    await page.click('#rdvValider');
    await page.waitForSelector('.ec-rdv-manque');
    const t = await page.innerText('.ec-rdv-manque');
    if (!/confiance/.test(t)) throw new Error('la confiance devrait manquer');
    if (/au moins une règle/.test(t)) throw new Error('la règle est renseignée, elle ne devrait plus manquer');
    // La saisie survit au refus.
    if (!/Six kilos/.test(await page.inputValue('[data-bilan12="progres"]'))) throw new Error('saisie perdue au refus');
  });

  await etape('on complète : deuxième règle et confiance', async () => {
    await page.fill('[data-regle="1"]', 'Une source de protéines à chaque repas');
    await page.locator('.ec-note', { hasText: /^8$/ }).click();
  });

  await etape('« Terminer mon Boost Nutrition » clôt l\'accompagnement', async () => {
    await page.click('#rdvValider');
    await page.waitForSelector('.ec-fin', { timeout: 10000 });
    const t = await contenu();
    if (!/Boost Nutrition terminé/.test(t)) throw new Error('l\'écran de fin devrait s\'afficher');
    if (await page.locator('#ecBilan').count() !== 0) throw new Error('le formulaire est encore là');
  });

  await etape('la fiche indique Étape 12/12 et le statut Terminé', async () => {
    const t = await contenu();
    if (!/Étape 12\/12/.test(t)) throw new Error('compteur d\'Étape non mis à jour');
    if (!/Terminé/.test(t)) throw new Error('le statut devrait être « Terminé »');
    if (!/Parcours terminé/.test(t)) throw new Error('la fiche devrait dire que le parcours est fini');
  });

  await etape('le plan d\'autonomie est présenté', async () => {
    const t = await page.innerText('.ec-plan');
    if (!/Ton plan pour la suite/.test(t)) throw new Error('titre du plan absent');
    if (!/Préparer mes déjeuners la veille/.test(t)) throw new Error('première règle absente');
    if (!/Une source de protéines à chaque repas/.test(t)) throw new Error('deuxième règle absente');
    const n = await page.locator('.ec-plan-l li').count();
    if (n !== 2) throw new Error('2 règles attendues, vues : ' + n);
    // Les points de vigilance aussi, et la suite du parcours.
    const page2 = await contenu();
    if (!/restaurant/.test(page2)) throw new Error('les points de vigilance devraient être rappelés');
    if (!/accompagnement nutrition standard/.test(page2)) throw new Error('la suite devrait être dite');
  });

  await etape('AUCUNE action n\'est active après la fin du Boost', async () => {
    // Invisible à l'écran : on le vérifie dans les données.
    const s = await parApi('/api/boost/coach/dossiers/' + id + '/seances/12');
    const actions = s.seance.actions;
    if (actions.length !== 11) throw new Error('11 actions attendues (S1 à S11), vues : ' + actions.length);
    if (actions.some((a) => a.numero === 12)) throw new Error('le bilan a créé une action');
    const actives = actions.filter((a) => a.statut === 'active');
    if (actives.length !== 0) throw new Error(actives.length + ' action(s) encore active(s) après la fin');
    if (s.seance.action !== null) throw new Error('une action active est encore servie');
    // La dernière action a bien été constatée par le bilan.
    const onze = actions.find((a) => a.numero === 11);
    if (onze.resultat !== 'partielle') throw new Error('le constat de S11 n\'a pas été enregistré');
    if (onze.evalueeAEtape !== 12) throw new Error('le constat devrait être attribué à l\'Étape 12');
    // Et la synthèse ne laisse plus aucune action sans verdict.
    if (s.seance.synthese.some((a) => !a.resultat)) throw new Error('une action reste sans résultat dans la synthèse');
  });

  await etape('l\'historique complet reste consultable', async () => {
    await page.click('#ecHistoB');
    await page.waitForSelector('#ecHisto:not([hidden])');
    const n = await page.locator('.ec-histo-l').count();
    if (n !== 12) throw new Error('12 rendez-vous attendus, vus : ' + n);
    // textContent et non innerText : les intitulés sont mis en majuscules par le
    // CSS, et innerText applique text-transform — « Règles conservées » en
    // ressortirait en « RÈGLES CONSERVÉES ».
    const t = await page.evaluate(() => document.querySelector('#ecHisto').textContent);
    if (!/Perdre 8 kg/.test(t)) throw new Error('l\'objectif initial devrait rester consultable');
    if (!/Règles conservées/.test(t)) throw new Error('les règles du bilan devraient figurer');
    if (!/Préparer mes déjeuners la veille/.test(t)) throw new Error('le contenu des règles devrait figurer');
    if (!/Confiance pour continuer seul/.test(t)) throw new Error('la confiance devrait figurer');
    if (/Note interne/.test(t)) throw new Error('une note interne a fuité dans l\'historique');
    await page.click('#ecHistoB');
  });

  await etape('le Boost terminé quitte la vue principale', async () => {
    await page.click('#ecBack');
    await page.waitForSelector('#ecListe:not([hidden])');
    const actifs = await page.locator('#ecActifs .ec-cli').count();
    if (actifs !== 0) throw new Error('un dossier clos ne doit pas encombrer la vue de travail');
    if (!/Anciens suivis \(1\)/.test(await contenu())) throw new Error('il devrait être rangé dans les anciens suivis');
  });

  await etape('S12 est verrouillée', async () => {
    const r = await page.evaluate(async (bid) => {
      const s = JSON.parse(localStorage.getItem('mc-coach-session'));
      const res = await fetch('/api/boost/coach/dossiers/' + bid + '/seances/12', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.token },
        body: JSON.stringify({ donnees: { regles: ['Réécriture'] } }),
      });
      return res.status;
    }, id);
    if (r !== 409) throw new Error('statut attendu 409, reçu ' + r);
  });

  await etape('affichage mobile : le bilan reste conduisible en 390 px', async () => {
    await page.setViewportSize({ width: 390, height: 850 });
    await page.locator('#ecAnciensB').click();
    await page.waitForSelector('#ecAnciens:not([hidden])');
    await page.locator('#ecAnciens .ec-cli').first().click();
    await page.waitForSelector('.ec-fin');
    const debord = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (debord > 2) throw new Error('débordement horizontal de ' + debord + ' px');
    if (!/Ton plan pour la suite/.test(await contenu())) throw new Error('le plan a disparu en mobile');
    await page.setViewportSize({ width: 1100, height: 950 });
  });

  await etape('aucune requête n\'a échoué en dehors des refus provoqués', async () => {
    const attendus = [
      'POST /api/boost/coach/dossiers/' + id + '/seances/12/valider -> 400',  // les deux refus, testés exprès
      'PUT /api/boost/coach/dossiers/' + id + '/seances/12 -> 409',           // la réécriture, testée exprès
    ];
    const inattendus = reponsesKo.filter((r) => !attendus.includes(r));
    if (inattendus.length) throw new Error('requêtes en échec inattendues : ' + [...new Set(inattendus)].join(', '));
  });

  const OUT = process.env.OUT || '.';
  await page.screenshot({ path: OUT + '/s12-fin.png', fullPage: true });
  await nav.close();

  console.log('\n' + '='.repeat(60));
  if (erreurs.length) {
    console.log('ÉCHECS (' + erreurs.length + ') :');
    [...new Set(erreurs)].forEach((e) => console.log('  - ' + e));
    process.exit(1);
  }
  console.log('S12 — BILAN FINAL : tout est passé, aucune erreur console.');
})();
