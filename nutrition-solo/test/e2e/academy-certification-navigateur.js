// ============================================================================
//  E2E NAVIGATEUR — My Coach Academy, certification finale (lot 4).
//
//  LE PARCOURS ENTIER SE REFERME ICI, dans un vrai navigateur et avec trois
//  comptes qui se répondent :
//
//    théorie seule       → non éligible, et l'API refuse de délivrer ;
//    + pratique validée  → ÉLIGIBLE — et toujours pas certifié ;
//    l'admin délivre     → « Coach Nutrition certifié », et l'espace /coach
//                          s'ouvre enfin : le parcours complet a servi à
//                          quelque chose ;
//    retrait motivé      → droits refermés, diplôme conservé dans l'historique ;
//    porte Boost         → impossible de certifier en contournant l'Academy ;
//    écarts              → nommés à l'écran, jamais tus.
//
//  Hors `npm test` :
//    npm install --no-save playwright
//    NUTRITION_DB=/tmp/e2e.sqlite ADMIN_EMAIL=patron@exemple.fr PORT=3222 node server.js &
//    BASE=http://127.0.0.1:3222 node test/e2e/academy-certification-navigateur.js
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
const THEO = 'theo.ce@exemple.fr';    // le parcours complet
const EVA = 'eva.ce@exemple.fr';      // l'évaluatrice
const NINA = 'nina.ce@exemple.fr';    // théorie seule : jamais éligible
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

async function validerTheorie(email, pin) {
  const t = (await jsonp('/account/login', { email, pin })).token;
  const f = (await get('/api/academy/formation', t)).formation;
  for (const c of f.modules.flatMap((m) => m.contenus)) {
    await jsonp(`/api/academy/contenus/${c.id}/terminer`, {}, 'POST', t);
  }
  const q = (await jsonp('/api/academy/qcm/tentatives', {}, 'POST', t)).tentative;
  for (const x of q.questions) {
    const bonnes = CORRIGE.get(x.enonce) || [];
    await jsonp(`/api/academy/qcm/tentatives/${q.id}/reponses/${x.id}`,
      { choix: x.choix.filter((c) => bonnes.includes(c.texte)).map((c) => c.id) }, 'PUT', t);
  }
  const r = await jsonp(`/api/academy/qcm/tentatives/${q.id}/terminer`, {}, 'POST', t);
  if (!r.tentative.resultat.reussie) throw new Error('la théorie devait être validée : ' + email);
  return t;
}

async function semer() {
  for (const [email, prenom, pin] of [[ADMIN, 'Stan', '7777'], [THEO, 'Théo', '4004'],
    [EVA, 'Eva', '3003'], [NINA, 'Nina', '5005']]) {
    await jsonp('/account/login', { email, prenom, pin });
  }
  const t = (await jsonp('/account/login', { email: ADMIN, pin: '7777' })).token;
  for (const e of [THEO, EVA, NINA]) {
    await jsonp('/api/boost/admin/collaborateurs', { email: e, role: 'collaborateur' }, 'POST', t);
  }
  await jsonp('/api/academy/admin/evaluateurs', { email: EVA }, 'POST', t);
  // Les deux valident leur théorie ; seul Théo passera la pratique.
  const tt = await validerTheorie(THEO, '4004');
  await validerTheorie(NINA, '5005');
  return { t, tt };
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
    'POST /api/academy/admin/certifications/' + THEO + '/retrait -> 400',
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

  // LOT 7 : les certifications vivent dans « Évaluer & certifier », onglet
  // « Certifications » — plus dans l'administration. On y entre par la barre
  // latérale, puis par l'onglet.
  const ongletCertifs = async () => {
    if (!(await page.locator('#acEval:not([hidden])').count())) {
      await page.click('#acRoleEval');
      await page.waitForSelector('#acEval:not([hidden])');
    }
    await page.click('.ac-adm-ong[data-onglet-eval="certifications"]');
    await page.waitForFunction(() => /Éligibles \(/.test(document.querySelector('#acEval').textContent));
  };

  // =========================================================================
  //  1. THÉORIE SEULE → NON ÉLIGIBLE
  // =========================================================================
  console.log('\n1. THÉORIE SEULE');

  await etape('Nina voit sa certification verrouillée, et ce qui lui manque', async () => {
    await seConnecter(NINA, '5005');
    const t = await contenu();
    if (!/Certification — Coach Nutrition/.test(t)) throw new Error('la carte de certification est absente');
    if (!/Non éligible/.test(t)) throw new Error('l\'état attendu manque');
    if (!/Certification verrouillée/.test(t)) throw new Error('le verrou n\'est pas annoncé');
    // Les prérequis, un par un : c'est la réponse à « où j'en suis ? ».
    if (!/Évaluation théorique \(QCM\)/.test(t)) throw new Error('le prérequis théorique n\'est pas listé');
    if (!/Évaluation pratique/.test(t)) throw new Error('le prérequis pratique n\'est pas listé');
    const remplis = await page.locator('.ac-cert-prereq .ac-pr-ok').count();
    const manquants = await page.locator('.ac-cert-prereq .ac-pr-non').count();
    if (remplis !== 1 || manquants !== 1) throw new Error('prérequis : ' + remplis + ' remplis, ' + manquants + ' manquants');
  });

  await etape('et l\'API refuse de la certifier, pas seulement l\'écran', async () => {
    const r = await fetch(BASE + '/api/academy/admin/certifications/' + NINA,
      { method: 'POST', headers: { Authorization: 'Bearer ' + jetonAdmin, 'Content-Type': 'application/json' }, body: '{}' });
    if (r.status !== 409) throw new Error('délivrance acceptée sans pratique : ' + r.status);
    const b = await r.json();
    if (!b.prerequisManquants || b.prerequisManquants[0] !== 'pratique') throw new Error('le refus ne dit pas ce qui manque');
  });

  // =========================================================================
  //  2. PRATIQUE VALIDÉE → ÉLIGIBLE, PAS CERTIFIÉ
  // =========================================================================
  console.log('\n2. ÉLIGIBLE');

  await etape('Eva valide la pratique de Théo', async () => {
    await seConnecter(EVA, '3003');
    await page.click('#acRoleEval');
    await page.waitForSelector('#acEval:not([hidden])');
    await page.click(`[data-collab="${THEO}"]`);
    await page.waitForSelector('#acEvOk');
    await page.fill('#acEvDate', '2026-09-10');
    await page.fill('#acEvCom', 'Conduite de rendez-vous nette.');
    await page.click('#acEvOk');
    await page.waitForFunction(() => /Étape pratique terminée/.test(document.querySelector('#acEval').textContent));
  });

  await etape('Théo devient ÉLIGIBLE — et l\'écran dit qu\'il n\'est pas certifié', async () => {
    await seConnecter(THEO, '4004');
    const t = await contenu();
    if (!/Éligible à la certification/.test(t)) throw new Error('l\'état attendu manque');
    if (!/Tout ton parcours est validé/.test(t)) throw new Error('la raison n\'est pas dite');
    if (!/pas encore Coach Nutrition certifié/.test(t)) throw new Error('ÉLIGIBLE se lit comme CERTIFIÉ : ambiguïté grave');
    if (!/prononcée par un administrateur/.test(t)) throw new Error('qui délivre n\'est pas dit');
    if (await page.locator('.ac-cert-prereq .ac-pr-non').count() !== 0) throw new Error('un prérequis manque encore');
  });

  await etape('et il n\'accède toujours pas aux dossiers du Boost', async () => {
    const vu = await page.evaluate(async () => {
      const s = JSON.parse(localStorage.getItem('mc-academy-session'));
      const h = { Authorization: 'Bearer ' + s.token };
      const c = await (await fetch('/api/academy/certification', { headers: h })).json();
      const d = await fetch('/api/boost/coach/dossiers', { headers: h });
      return { certifie: c.certifications[0].certifie, eligible: c.certifications[0].eligible, dossiers: d.status };
    });
    if (vu.eligible !== true) throw new Error('il devrait être éligible');
    if (vu.certifie !== false) throw new Error('ÊTRE ÉLIGIBLE L\'A CERTIFIÉ : régression majeure');
    if (vu.dossiers !== 403) throw new Error('un non-certifié accède aux dossiers : ' + vu.dossiers);
  });

  // =========================================================================
  //  3. LA DÉLIVRANCE
  // =========================================================================
  console.log('\n3. DÉLIVRANCE');

  await etape('l\'administrateur trouve Théo parmi les éligibles', async () => {
    await seConnecter(ADMIN, '7777', '#acAdmin');
    await ongletCertifs();
    const t = await contenu();
    if (!/Éligibles \(1\)/.test(t)) throw new Error('un seul éligible attendu : ' + (t.match(/Éligibles \(\d+\)/) || ['—'])[0]);
    if (!/Théo/.test(t)) throw new Error('Théo devrait être éligible');
    if (/Nina/.test(t)) throw new Error('Nina n\'a pas validé sa pratique : elle ne doit pas être proposée');
    if (!/Certifiés \(0\)/.test(t)) throw new Error('personne ne devrait être certifié');
  });

  await etape('la délivrance se confirme, en annonçant ce qu\'elle ouvre', async () => {
    await page.locator('.ac-adm-l', { hasText: THEO }).getByText('Délivrer la certification').click();
    await page.waitForSelector('#acCertDate');
    const t = await contenu();
    if (!/ouvrira immédiatement l'accès aux dossiers clients/.test(t)) {
      throw new Error('la conséquence de la délivrance n\'est pas annoncée');
    }
    await page.fill('#acCertDate', '2026-09-15');
    await page.fill('#acCertCom', 'Parcours net du début à la fin.');
    await page.locator('.ac-adm-l', { hasText: THEO }).getByText('Confirmer la délivrance').click();
    await page.waitForFunction(() => /Certifiés \(1\)/.test(document.querySelector('#acEval').textContent));
    if (!/Éligibles \(0\)/.test(await contenu())) throw new Error('il devrait avoir quitté les éligibles');
  });

  await etape('LE PARCOURS SE REFERME : Théo est certifié et accède à /coach', async () => {
    await seConnecter(THEO, '4004');
    const t = await contenu();
    if (!/Coach Nutrition certifié — obtenue le 15\/09\/2026/.test(t)) throw new Error('le diplôme daté manque : ' + t.slice(0, 300));
    if (!/Parcours net du début à la fin/.test(t)) throw new Error('le commentaire du délivreur manque');
    if (!/suivre des clients dans le Boost/.test(t)) throw new Error('ce que la certification ouvre n\'est pas dit');

    const vu = await page.evaluate(async () => {
      const s = JSON.parse(localStorage.getItem('mc-academy-session'));
      const h = { Authorization: 'Bearer ' + s.token };
      const c = await (await fetch('/api/academy/certification', { headers: h })).json();
      const d = await fetch('/api/boost/coach/dossiers', { headers: h });
      return { certifie: c.certifications[0].certifie, dossiers: d.status };
    });
    if (vu.certifie !== true) throw new Error('il devrait être certifié');
    if (vu.dossiers !== 200) throw new Error('l\'espace Coach devrait s\'ouvrir : ' + vu.dossiers);
  });

  await etape('l\'espace Coach s\'ouvre vraiment dans le navigateur', async () => {
    // La preuve que tout le parcours a servi à quelque chose : /coach n'était
    // qu'un écran d'attente jusqu'ici, il devient une liste de dossiers.
    await page.goto(BASE + '/coach', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#ecLogin:not([hidden])');
    await page.fill('#ecEmail', THEO);
    await page.fill('#ecPin', '4004');
    await page.click('#ecGo');
    await page.waitForSelector('#ecListe:not([hidden]), #ecBloc:not([hidden])', { timeout: 8000 });
    if (await page.locator('#ecBloc').isVisible()) {
      throw new Error('l\'espace Coach reste fermé : ' + (await page.innerText('#ecBlocT')).slice(0, 120));
    }
  });

  // =========================================================================
  //  4. LA PORTE PARALLÈLE
  // =========================================================================
  console.log('\n4. PORTE FERMÉE');

  await etape('on ne certifie pas Nina depuis l\'administration du Boost', async () => {
    const r = await fetch(BASE + '/api/boost/admin/certification/' + NINA, {
      method: 'PUT', headers: { Authorization: 'Bearer ' + jetonAdmin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ statut: 'certifie', evaluateur: 'Stan Martin', dateCertification: '2026-01-01' }),
    });
    if (r.status !== 409) throw new Error('la porte parallèle est restée ouverte : ' + r.status);
    const b = await r.json();
    if (b.academyRequise !== true) throw new Error('le refus ne renvoie pas vers l\'Academy');
    const cert = await get('/api/boost/admin/certification/' + NINA, jetonAdmin);
    if (cert.certification.statut === 'certifie') throw new Error('Nina a été certifiée malgré tout');
  });

  // =========================================================================
  //  5. LE RETRAIT
  // =========================================================================
  console.log('\n5. RETRAIT');

  await etape('le retrait exige un motif, et l\'annonce', async () => {
    await seConnecter(ADMIN, '7777', '#acAdmin');
    await ongletCertifs();
    await page.locator('.ac-adm-l', { hasText: THEO }).getByText('Retirer la certification').click();
    await page.waitForSelector('#acCertMotif');
    const t = await contenu();
    if (!/Motif du retrait \(obligatoire\)/.test(t)) throw new Error('le motif n\'est pas demandé');
    if (!/reste dans l'historique/.test(t)) throw new Error('l\'effet sur l\'historique n\'est pas dit');

    // Sans motif : refusé, et l'écran le dit.
    await page.locator('.ac-adm-l', { hasText: THEO }).getByText('Confirmer le retrait').click();
    await page.waitForFunction(() => /motif est requis/i.test(document.querySelector('#acEvalErr').textContent));
    if (!/Certifiés \(1\)/.test(await contenu())) throw new Error('le retrait a eu lieu sans motif');
  });

  await etape('avec motif, les droits se ferment et le diplôme reste', async () => {
    await page.fill('#acCertMotif', 'Suite à un signalement client.');
    await page.locator('.ac-adm-l', { hasText: THEO }).getByText('Confirmer le retrait').click();
    await page.waitForFunction(() => /Certifiés \(0\)/.test(document.querySelector('#acEval').textContent));
    if (!/Éligibles \(1\)/.test(await contenu())) throw new Error('il devrait redevenir éligible');

    const vu = await get('/api/academy/admin/certifications', jetonAdmin);
    if (vu.certifies.length !== 0) throw new Error('encore certifié');
    const cert = await get('/api/boost/admin/certification/' + THEO, jetonAdmin);
    if (cert.certification.statut !== 'non_certifie') throw new Error('droit Boost : ' + cert.certification.statut);
  });

  await etape('Théo lit le retrait, son motif, et perd l\'accès aux dossiers', async () => {
    await seConnecter(THEO, '4004');
    const t = await contenu();
    if (!/Éligible à la certification/.test(t)) throw new Error('son parcours reste validé');
    if (/obtenue le 15\/09\/2026/.test(t)) throw new Error('il se croit encore certifié');
    await page.click('.ac-cert-eligible .ac-qcm-histo summary');
    const histo = await page.locator('.ac-cert-eligible .ac-qcm-histo li').allInnerTexts();
    if (!histo.length) throw new Error('son historique est vide : le diplôme retiré a été effacé');
    if (!/signalement/.test(histo.join(' '))) throw new Error('le motif du retrait n\'est pas conservé : ' + histo.join(' | '));

    const vu = await page.evaluate(async () => {
      const s = JSON.parse(localStorage.getItem('mc-academy-session'));
      return (await fetch('/api/boost/coach/dossiers', { headers: { Authorization: 'Bearer ' + s.token } })).status;
    });
    if (vu !== 403) throw new Error('il accède encore aux dossiers : ' + vu);
  });

  // =========================================================================
  //  6. LES ÉCARTS
  // =========================================================================
  console.log('\n6. ÉCARTS');

  await etape('un écart Academy / Boost est NOMMÉ à l\'écran', async () => {
    // On redélivre, puis on suspend côté Boost : l'écart doit se voir.
    await jsonp('/api/academy/admin/certifications/' + THEO, { obtenueLe: '2026-10-01' }, 'POST', jetonAdmin);
    await jsonp('/api/boost/admin/certification/' + THEO, { statut: 'suspendu' }, 'PUT', jetonAdmin);

    await seConnecter(ADMIN, '7777', '#acAdmin');
    await ongletCertifs();
    const t = await contenu();
    if (!/Écarts entre l'Academy et le Boost/.test(t)) throw new Error('l\'écart est masqué');
    if (!/droits suspendus dans le Boost/.test(t)) throw new Error('la nature de l\'écart n\'est pas dite');
    if (!/situation attendue/.test(t)) throw new Error('une suspension devrait être signalée comme attendue');
    if (await page.locator('.ac-ecart-ko').count() !== 0) throw new Error('une suspension ne doit pas passer pour une anomalie');
  });

  await etape('l\'historique montre les deux diplômes, dont celui retiré', async () => {
    await seConnecter(THEO, '4004');
    await ouvrirEtapes();
    await page.click('.ac-cert-certifie .ac-qcm-histo summary');
    const lignes = await page.locator('.ac-cert-certifie .ac-qcm-histo li').allInnerTexts();
    if (lignes.length !== 2) throw new Error('diplômes listés : ' + lignes.length);
    const texte = lignes.join(' || ');
    if (!/01\/10\/2026/.test(texte) || !/15\/09\/2026/.test(texte)) throw new Error('dates : ' + texte);
    if (!/retirée/.test(texte)) throw new Error('LE DIPLÔME RETIRÉ A DISPARU');
  });

  // =========================================================================
  //  CONTRÔLES
  // =========================================================================
  console.log('\nCONTRÔLES');

  await etape('un collaborateur n\'atteint pas l\'écran de certification', async () => {
    const jetonNina = (await jsonp('/account/login', { email: NINA, pin: '5005' })).token;
    const r = await fetch(BASE + '/api/academy/admin/certifications', { headers: { Authorization: 'Bearer ' + jetonNina } });
    if (r.status !== 403) throw new Error('une collaboratrice gère les certifications : ' + r.status);
    await seConnecter(NINA, '5005');
    if (/Administration My Coach Academy/.test(await contenu())) throw new Error('l\'accès admin lui est offert');
  });

  await etape('affichage mobile : la certification reste lisible en 390 px', async () => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.waitForTimeout(300);
    let debord = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (debord > 2) throw new Error('débordement de la carte collaborateur : ' + debord + ' px');

    await seConnecter(ADMIN, '7777', '#acAdmin');
    await ongletCertifs();
    debord = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (debord > 2) throw new Error('débordement de l\'écran d\'administration : ' + debord + ' px');
    const b = await page.locator('.ac-adm-l', { hasText: THEO }).locator('.ec-btn').first().boundingBox();
    if (!b || b.height < 34) throw new Error('bouton trop petit en mobile');
    if (b.width < 200) throw new Error('bouton écrasé en mobile : ' + Math.round(b.width) + ' px');
    await page.setViewportSize({ width: 1100, height: 1000 });
  });

  await etape('aucune requête locale n\'a échoué hors refus provoqués', async () => {
    if (reponsesKo.length) throw new Error('requêtes en échec : ' + [...new Set(reponsesKo)].join(', '));
  });

  const OUT = process.env.OUT || '.';
  try {
    await page.goto(BASE + '/academy', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#acAdmin:not([hidden]), #acSommaire:not([hidden])', { timeout: 4000 });
    await page.screenshot({ path: OUT + '/academy-certification.png', fullPage: true });
  } catch (_) { /* la capture ne doit jamais faire échouer la suite */ }
  await nav.close();

  console.log('\n' + '='.repeat(60));
  if (erreurs.length) {
    console.log('ÉCHECS (' + erreurs.length + ') :');
    [...new Set(erreurs)].forEach((e) => console.log('  - ' + e));
    process.exit(1);
  }
  console.log('ACADEMY — CERTIFICATION FINALE : tout est passé, aucune erreur console.');
})();
