'use strict';
// ============================================================================
//  E2E NAVIGATEUR — LA GRILLE D'ÉVALUATION PRATIQUE (Fitness Boxe).
//
//  CE QUE CETTE SUITE DÉROULE, dans un vrai navigateur :
//
//   1. TROIS CARTES, NEUF CRITÈRES, deux choix par critère. Rien d'autre : ni
//      note, ni points, ni niveau intermédiaire.
//   2. LE RÉSULTAT D'UN AXE SE CALCULE DANS SON TITRE, et se met à jour au
//      clic — 2/3 « À renforcer », 3/3 « Maîtrisé ».
//   3. LE RÉSUMÉ N'APPARAÎT QUE COMPLET : afficher un résultat sur une grille
//      à moitié remplie serait afficher un résultat faux.
//   4. UN CRITÈRE NON ACQUIS REND LE COMMENTAIRE OBLIGATOIRE, et le refus se
//      dit AVANT l'aller-retour — sans perdre la saisie.
//   5. LE RELEVÉ SURVIT AU VERDICT : il se relit dans l'historique.
//
//  ⚠️ CE QUE LA SUITE NE VÉRIFIE PAS, PARCE QUE ÇA N'EXISTE PAS : une règle de
//  réussite automatique. Le verdict global reste prononcé par le certificateur.
//
//  Hors `npm test` :
//    npm install --no-save playwright
//    NUTRITION_DB=/tmp/e2e-grille.sqlite ADMIN_EMAIL=patron@exemple.fr PORT=3234 node server.js &
//    NUTRITION_DB=/tmp/e2e-grille.sqlite BASE=http://127.0.0.1:3234 node test/e2e/academy-grille-navigateur.js
// ============================================================================

const { chromium } = require('playwright');
const Database = require('better-sqlite3');
const BASE = process.env.BASE || 'http://127.0.0.1:3234';
const ADMIN='patron@exemple.fr', EVA='eva.g@exemple.fr', THEO='theo.g@exemple.fr', BOXE='fitness_boxe';
const erreurs=[];
const j=(r,b,m,t)=>fetch(BASE+r,{method:m||'POST',headers:{'Content-Type':'application/json',...(t?{Authorization:'Bearer '+t}:{})},body:b?JSON.stringify(b):undefined}).then(x=>x.json());

(async()=>{
  for (const [e,p,pin] of [[ADMIN,'Stan','7777'],[EVA,'Eva','5005'],[THEO,'Théo','4004']]) await j('/account/login',{email:e,prenom:p,pin});
  const t=(await j('/account/login',{email:ADMIN,pin:'7777'})).token;
  for (const e of [EVA,THEO]) await j('/api/boost/admin/collaborateurs',{email:e,role:'collaborateur'},'POST',t);
  await j('/api/academy/admin/evaluateurs',{email:EVA,evaluateur:true},'POST',t);
  // La formation Fitness Boxe, ses 6 cas, et la théorie de Théo.
  const db=new Database(process.env.NUTRITION_DB,{timeout:5000});
  const now=new Date().toISOString();
  db.prepare(`INSERT INTO academy_formations (cle,libelle,titre_certifie,ordre,actif,qcm_nb_questions,qcm_seuil_pct,mini_nb_questions,mini_seuil_pct,pratique_obligatoire,certification_active,reflet_boost,cree_le,maj_le)
    VALUES (?,?,?,20,1,1,0,5,80,1,1,0,?,?) ON CONFLICT(cle) DO NOTHING`).run(BOXE,'Fitness Boxe','Fitness Boxe My Coach certifié',now,now);
  // LES SIX TITRES RÉELS : c'est par eux que les scénarios se rattachent
  // (cf. amorcerScenariosFitnessBoxe, qui vérifie le titre avant d'écrire).
  const TITRES = [
    'Client débutant — se dépenser et améliorer son cardio',
    'Client débutant — se détendre après une journée chargée',
    'Cliente débutante — gagner en confiance',
    'Client débutant — améliorer sa coordination',
    'Client régulier — retrouver du plaisir et de la variété',
    'Client à l\u2019aise — se dépasser sans perdre le contrôle',
  ];
  TITRES.forEach((titre, i) => db.prepare(`INSERT OR IGNORE INTO academy_cas (formation,titre,consignes,ordre,actif,cle,cree_le,maj_le) VALUES (?,?,?,?,1,?,?,?)`)
    .run(BOXE, titre, 'SITUATION PRÉSENTÉE AU COACH\nAncien pavé de consignes.', i + 1, `e2e-cas-${i + 1}`, now, now));
  db.prepare(`INSERT INTO academy_tentatives (email,formation,portee,statut,nb_questions,seuil_pct,ouverte_le,soumise_le,score_pct,bonnes,reussie) VALUES (?,?,'finale','soumise',1,0,?,?,100,1,1)`).run(THEO,BOXE,now,now);
  db.close();

  const nav=await chromium.launch();
  const page=await nav.newPage({viewport:{width:1280,height:1000}});
  page.setDefaultTimeout(10000);
  page.on('pageerror',e=>erreurs.push('PAGE ERROR: '+e.message));
  const etape=async(n,f)=>{try{await f();console.log('  ✓ '+n);}catch(e){console.log('  ✗ '+n+' — '+e.message);erreurs.push(n);}};
  const doit=(c,m)=>{if(!c)throw new Error(m);};
  const connecter=async(email,pin)=>{
    await page.goto(BASE+'/academy',{waitUntil:'domcontentloaded'});
    await page.evaluate(()=>localStorage.removeItem('mc-academy-session'));
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForSelector('#acLogin:not([hidden])');
    await page.fill('#acEmail',email); await page.fill('#acPin',pin);
    await page.click('#acGo'); await page.waitForSelector('#acSideNav [data-nav]');
  };
  const ouvrirFiche=async()=>{
    await page.click('#acRoleEval'); await page.waitForSelector('#acEval:not([hidden])');
    await page.selectOption('#acEvalFormation', BOXE);
    await page.waitForFunction(()=>document.querySelectorAll('#acEvalCorps .ac-evc:not(.ac-evr-h)').length>0);
    const ligne=page.locator('#acEvalCorps .ac-evc:not(.ac-evr-h)',{hasText:'Théo'});
    await ligne.locator('[data-coach]').click();
    await page.waitForSelector('.ac-evd');
    await ligne.locator(`.ac-evd [data-collab="${THEO}"]`).first().click();
    // NOUVEAU PARCOURS : on lit d'abord, on commence, ET SEULEMENT ALORS la
    // grille apparaît. Neuf décisions avant d'avoir rien observé seraient neuf
    // décisions au hasard.
    await page.waitForSelector('#acEvCommencer');
    if (await page.locator('#acEvGrille').count()) throw new Error('la grille précède la mise en situation');
    await page.selectOption('#acEvCasId', { index: 1 });
    await page.waitForSelector('#acEvCommencer');
    await page.click('#acEvCommencer');
    await page.waitForSelector('#acEvGrille');
  };
  const repondre=async(i,val)=>{
    const b=page.locator('#acEvGrille .ac-gr-c').nth(i).locator(val?'.ac-gr-oui':'.ac-gr-non');
    await b.click();
  };

  console.log('\n  ÉVALUATION PRATIQUE — la grille Fitness Boxe\n');

  await etape('la grille s\'affiche : 3 cartes, 9 critères, résultats à renseigner', async () => {
    await connecter(EVA,'5005');
    await ouvrirFiche();
    doit(await page.locator('#acEvGrille .ac-gr-carte').count()===3,'trois cartes attendues');
    doit(await page.locator('#acEvGrille .ac-gr-c').count()===9,'neuf critères attendus');
    const titres=await page.$$eval('#acEvGrille .ac-gr-h',n=>n.map(x=>x.textContent));
    doit(/Technique & pédagogie/.test(titres[0]),'axe 1 : '+titres[0]);
    doit(/à renseigner/.test(titres[0]),'le titre doit dire que rien n\'est renseigné');
    doit(await page.locator('.ac-gr-resume').count()===0,'aucun résumé avant que tout soit rempli');
  });

  await etape('le rôle et les trois comportements guident le certificateur', async () => {
    const role = await page.locator('.ac-as-role').textContent();
    doit(/Ton rôle/i.test(role), 'le rôle doit être annoncé : ' + role);
    const jouer = await page.locator('.ac-as-jouer').textContent();
    for (const m of ['Au départ', 'Puis', 'Ensuite']) {
      doit(new RegExp(m, 'i').test(jouer), 'moment manquant : ' + m);
    }
    doit(await page.locator('.ac-as-l li').count() === 3, 'trois comportements attendus');
    doit(/Permet d/.test(jouer), 'le lien avec les critères doit être dit');
  });

  await etape('un critère acquis passe au vert, un non acquis au rouge', async () => {
    await repondre(0,true); await repondre(1,false);
    doit(await page.locator('#acEvGrille .ac-gr-c').nth(0).evaluate(el=>el.classList.contains('ac-gr-c-oui')),'acquis → vert');
    doit(await page.locator('#acEvGrille .ac-gr-c').nth(1).evaluate(el=>el.classList.contains('ac-gr-c-non')),'non acquis → rouge');
  });

  await etape('le résultat de l\'axe se calcule dans son titre', async () => {
    await repondre(2,true);   // axe 1 : 2/3
    const t=await page.locator('#acEvGrille .ac-gr-h').first().textContent();
    doit(/À renforcer/.test(t)&&/2\/3/.test(t),'axe 1 devait être « À renforcer — 2/3 », vu : '+t);
    await repondre(1,true);   // axe 1 : 3/3
    const t2=await page.locator('#acEvGrille .ac-gr-h').first().textContent();
    doit(/Maîtrisé/.test(t2)&&/3\/3/.test(t2),'axe 1 devait passer « Maîtrisé — 3/3 », vu : '+t2);
  });

  await etape('le résumé apparaît quand les 9 critères sont renseignés', async () => {
    for (const i of [3,4,5]) await repondre(i,true);       // axe 2 : 3/3
    await repondre(6,true); await repondre(7,false); await repondre(8,false);  // axe 3 : 1/3
    await page.waitForSelector('.ac-gr-resume');
    const r=await page.locator('.ac-gr-resume').textContent();
    doit(/Résultat de l'évaluation/i.test(r),'le titre du résumé manque');
    doit(/Maîtrisé/.test(r)&&/Non maîtrisé/.test(r),'les résultats d\'axe manquent : '+r);
    doit(/reste le tien/.test(r),'le résumé doit rappeler que le verdict global appartient au certificateur');
  });

  await etape('le commentaire devient obligatoire, et le refus est dit AVANT l\'envoi', async () => {
    // Le LIBELLÉ de la question change : « qu'est-ce qu'il doit améliorer ? »
    // ne se demande que s'il y a quelque chose à améliorer.
    const q = await page.locator('#acEvComT').textContent();
    doit(/améliorer/i.test(q) && /obligatoire/i.test(q), 'la question attendue manque : ' + q);
    await page.click('#acEvOk');
    await page.waitForFunction(()=>/commentaire/i.test(document.querySelector('#acEvErr').textContent));
    doit(await page.locator('.ac-gr-resume').count()===1,'la saisie ne doit pas être perdue');
  });

  await etape('avec commentaire, l\'évaluation s\'enregistre et le relevé est conservé', async () => {
    await page.fill('#acEvCom','Le dosage et la gestion du risque sont à retravailler.');
    await page.click('#acEvKo');
    await page.waitForFunction(()=>/à repasser/i.test(document.querySelector('.ac-prat-histo') ? document.querySelector('.ac-prat-histo').textContent : ''),
      null, { timeout: 10000 }).catch(async () => {
      throw new Error('verdict non enregistré — écran : ' + (await page.locator('#acEvErr').textContent().catch(() => '?')));
    });
    const h=await page.locator('.ac-prat-histo').textContent();
    doit(/3\/3/.test(h)&&/1\/3/.test(h),'le relevé doit rester lisible dans l\'historique : '+h);
    // Et le serveur l'a bien enregistré.
    const vu=await page.evaluate(async (mail)=>{
      const s=JSON.parse(localStorage.getItem('mc-academy-session'));
      const r=await fetch('/api/academy/evaluateur/collaborateurs/'+encodeURIComponent(mail)+'?formation=fitness_boxe',{headers:{Authorization:'Bearer '+s.token}});
      const d=await r.json();
      return d.pratique.historique[0].grille;
    }, THEO);
    doit(vu && vu.criteres.length===9,'les neuf critères devaient être enregistrés');
    doit(vu.axes.map(a=>a.statut).join(',')==='maitrise,maitrise,non_maitrise','axes : '+vu.axes.map(a=>a.statut));
  });

  await etape('une grille toute acquise n\'exige pas de commentaire', async () => {
    // Une évaluation prononcée est close : la suivante repart de l'étape ①.
    await page.waitForSelector('#acEvCommencer');
    await page.click('#acEvCommencer');
    await page.waitForSelector('#acEvGrille');
    for (let i=0;i<9;i++) await repondre(i,true);
    await page.waitForSelector('.ac-gr-resume');
    const q2 = await page.locator('#acEvComT').textContent();
    doit(/facultatif/i.test(q2), 'aucune obligation ne doit s\'afficher : ' + q2);
    await page.click('#acEvOk');
    await page.waitForFunction(()=>/Étape pratique terminée/.test(document.querySelector('#acEval').textContent));
  });

  await nav.close();
  console.log('');
  if (erreurs.length){console.log('  ✗ '+erreurs.length+' problème(s)');process.exit(1);}
  console.log('  ✓ Tout est vert.\n');
})();
