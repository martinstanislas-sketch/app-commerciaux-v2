'use strict';
// ============================================================================
//  PHASE D'OBSERVATION — CARTOGRAPHIE DU CRM, EN LECTURE SEULE.
//
//  Ce script s'ATTACHE (CDP) à la fenêtre déjà ouverte et connectée par
//  open-crm.js, regarde, et se DÉTACHE sans rien fermer. Il ne se connecte pas,
//  ne stocke aucun identifiant, ne télécharge rien.
//
//  ⚠️ GARDE-FOUS, non négociables :
//   · aucun clic sur un bouton d'action — on ne fait que des `goto` (GET) et de
//     la lecture de DOM ;
//   · toute URL qui ressemble à une écriture (supprimer, delete, valider,
//     archiver, annuler, payer, envoyer…) est REFUSÉE par urlSure() ;
//   · aucune donnée client n'est recopiée : on relève des structures (titres de
//     colonnes, noms de filtres, sélecteurs), jamais le contenu des lignes.
//
//  Usage :
//    node observe-crm.js etat
//    node observe-crm.js liens [url]
//    node observe-crm.js page <url>
// ============================================================================

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const CDP = process.env.CRM_DEBUG_URL || 'http://127.0.0.1:9222';
const SORTIE = process.env.CRM_OBS_DIR || path.join(__dirname, '.session', 'observation');

// Les DEUX outils métier, et rien d'autre : Deciplus porte les encaissements,
// Fitness Booster porte les nouveaux contrats signés.
const HOTES = ['deciplus.pro', 'fitness-booster.fr'];
// Un mot de cette liste dans l'URL = on ne suit pas. Filet volontairement large.
const INTERDITS = /(delete|supprim|remove|destroy|valider?|validate|archiv|annul|cancel|desactiv|deactivate|payer|encaisser|envoyer|send|create|creer|nouveau|new|edit|modifi|update|save|enregistr|resili|logout|deconnex|signout)/i;
// Exceptions NOMMÉES : écrans de consultation dont l'URL contient par hasard un
// mot du filtre. « new-sales-stats » est le tableau de bord des ventes de
// Fitness Booster — il ne fait que LIRE, son nom contient « new ».
const LISTE_BLANCHE = [/\/new-sales-stats(\?|$)/];
function urlSure(u) {
  try {
    const url = new URL(u);
    if (!/^https?:$/.test(url.protocol)) return false;
    if (!HOTES.some((h) => url.hostname === h || url.hostname.endsWith('.' + h))) return false; // on ne sort pas des 2 outils
    const chemin = url.pathname + url.search;
    if (LISTE_BLANCHE.some((r) => r.test(chemin))) return true;
    return !INTERDITS.test(chemin);
  } catch (_) { return false; }
}

// Ce qu'on relève d'une page : sa structure, jamais ses données.
// ⚠️ Deciplus sert ses écrans historiques dans des IFRAMES : on inspecte donc
// le document principal ET chaque cadre, sinon on ne voit qu'une coquille vide.
async function radiographieComplete(page) {
  const cadres = page.frames();
  const parCadre = [];
  for (const f of cadres) {
    try {
      const r = await radiographie(f);
      r.cadre = f.url();
      r.estPrincipal = (f === page.mainFrame());
      if (r.nbLiens || r.tables.length || r.champs.length || r.exports.length) parCadre.push(r);
    } catch (_) { /* cadre détaché ou cross-origin */ }
  }
  return { titre: await page.title().catch(() => ''), nbCadres: cadres.length, cadres: parCadre };
}

async function radiographie(page) {
  return page.evaluate(() => {
    const txt = (el) => (el && (el.innerText || el.textContent) || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const sel = (el) => {
      if (!el) return '';
      if (el.id) return '#' + el.id;
      const cls = (el.className && typeof el.className === 'string') ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      return el.tagName.toLowerCase() + cls;
    };
    // Boutons / liens dont le libellé sent l'export.
    const MOTS_EXPORT = /(export|excel|csv|xls|télécharg|telecharg|download|imprimer|pdf|extraction|extraire)/i;
    const cliquables = [...document.querySelectorAll('a,button,input[type=button],input[type=submit],[role=button]')];
    const exports = cliquables.filter((el) => visible(el) && (MOTS_EXPORT.test(txt(el)) || MOTS_EXPORT.test(el.getAttribute('title') || '') || MOTS_EXPORT.test(el.className || '') || MOTS_EXPORT.test(el.getAttribute('href') || '')))
      .map((el) => ({ tag: el.tagName.toLowerCase(), texte: txt(el), titre: el.getAttribute('title') || '', href: el.getAttribute('href') || '', selecteur: sel(el) }));

    // Filtres : champs de date, listes déroulantes (mois/année/club), recherche.
    const champs = [...document.querySelectorAll('input,select')].filter(visible).map((el) => {
      const o = {
        tag: el.tagName.toLowerCase(), type: el.type || '', name: el.name || '', id: el.id || '',
        placeholder: el.placeholder || '', selecteur: sel(el),
      };
      if (el.tagName === 'SELECT') {
        o.nbOptions = el.options.length;
        o.options = [...el.options].slice(0, 12).map((x) => (x.textContent || '').trim().slice(0, 40));
      }
      return o;
    });

    // Tableaux : combien, quelles colonnes, combien de lignes (pas leur contenu).
    const tables = [...document.querySelectorAll('table')].filter(visible).map((t) => ({
      selecteur: sel(t),
      colonnes: [...t.querySelectorAll('thead th, thead td, tr:first-child th')].map((th) => txt(th)).filter(Boolean).slice(0, 20),
      lignes: t.querySelectorAll('tbody tr').length || Math.max(0, t.querySelectorAll('tr').length - 1),
    }));

    // Liens de navigation (menus).
    const liens = [...document.querySelectorAll('a[href]')].filter(visible).map((a) => ({
      texte: txt(a), href: a.getAttribute('href'), selecteur: sel(a),
    })).filter((l) => l.texte);

    return {
      titre: document.title,
      h1: [...document.querySelectorAll('h1,h2,.page-title,.title')].map(txt).filter(Boolean).slice(0, 6),
      exports, champs, tables, liens,
      nbLiens: liens.length,
    };
  });
}

(async () => {
  const cmd = process.argv[2] || 'etat';
  const arg = process.argv[3] || '';
  fs.mkdirSync(SORTIE, { recursive: true });

  const navigateur = await chromium.connectOverCDP(CDP);
  const contexte = navigateur.contexts()[0];
  // On travaille dans l'onglet DÉJÀ ouvert sur le bon outil (donc déjà connecté).
  // `cible` = un hôte (deciplus / fitness-booster) ou une URL complète.
  const hoteDe = (u) => { try { return new URL(u).hostname; } catch (_) { return ''; } };
  // 4e argument = onglet visé (deciplus | fitness-booster). Sans lui, on déduit
  // de l'URL passée en 3e argument, sinon Deciplus par défaut.
  // ⚠️ Le libellé d'un clic N'EST PAS un indice d'onglet : sans ce 4e argument
  // on cliquait dans le mauvais onglet.
  const indice = process.argv[4] || '';
  const MOTS_ONGLET = /^(deciplus|ginkgo|fitness-booster|fitness|app)$/i;
  const cible = indice || (/^https?:/.test(arg) ? hoteDe(arg) : (MOTS_ONGLET.test(arg) ? arg : 'deciplus'));
  const page = contexte.pages().find((p) => hoteDe(p.url()).includes(cible.replace(/^www\./, '')))
    || contexte.pages().find((p) => p.url().includes('deciplus'))
    || contexte.pages()[0];

  const cliche = async (nom) => {
    const f = path.join(SORTIE, nom + '-' + (hoteDe(page.url()).split('.')[0] || 'x') + '.png');
    await page.screenshot({ path: f, fullPage: false }).catch(() => {});
    return f;
  };

  if (cmd === 'etat') {
    const cookies = await contexte.cookies();
    const rc = await radiographieComplete(page);
    const r = rc.cadres[0] || { h1: [], champs: [], nbLiens: 0 };
    console.log(JSON.stringify({
      url: page.url(), titre: rc.titre, h1: r.h1, nbCadres: rc.nbCadres,
      cadres: rc.cadres.map((c) => c.cadre),
      connecte: !/login|connexion|signin/i.test(page.url()) && !r.champs.some((c) => c.type === 'password'),
      cookies: cookies.length, domaines: [...new Set(cookies.map((c) => c.domain))],
      nbLiens: r.nbLiens, cliche: await cliche('etat'),
    }, null, 2));
  } else if (cmd === 'liens') {
    if (arg) {
      if (!urlSure(arg)) { console.error('URL refusée par le garde-fou : ' + arg); process.exit(2); }
      await page.goto(arg, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
    }
    const rc = await radiographieComplete(page);
    console.log(JSON.stringify({ url: page.url(), titre: rc.titre, cadres: rc.cadres.map((c) => ({ cadre: c.cadre, liens: c.liens })) }, null, 2));
  } else if (cmd === 'page') {
    if (!urlSure(arg)) { console.error('URL refusée par le garde-fou : ' + arg); process.exit(2); }
    await page.goto(arg, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const rc = await radiographieComplete(page);
    const nom = 'page-' + arg.replace(/[^a-z0-9]+/gi, '-').slice(-60);
    console.log(JSON.stringify({
      url: page.url(), titre: rc.titre, nbCadres: rc.nbCadres,
      cadres: rc.cadres.map((c) => ({ cadre: c.cadre, h1: c.h1, exports: c.exports, champs: c.champs, tables: c.tables })),
      cliche: await cliche(nom),
    }, null, 2));
  } else if (cmd === 'clic') {
    // CLIC DE NAVIGATION UNIQUEMENT. Le libellé visé doit être un item de menu :
    // s'il ressemble à une action (supprimer, valider, enregistrer, payer...),
    // on refuse. On ne remplit aucun champ, on ne soumet aucun formulaire.
    if (!arg || INTERDITS.test(arg)) { console.error('Libellé refusé par le garde-fou : ' + arg); process.exit(2); }
    const avant = page.url();
    // Résolution tolérante : ces SPA imbriquent le libellé dans des <li>/<span>.
    // On cherche la FEUILLE visible dont le texte est exactement le libellé.
    const ok = await page.evaluate((lbl) => {
      const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const cands = [...document.querySelectorAll('li,a,button,span,div,td')]
        .filter((el) => visible(el) && norm(el.innerText || el.textContent) === norm(lbl))
        .sort((a, b) => a.getElementsByTagName('*').length - b.getElementsByTagName('*').length);
      if (!cands.length) return false;
      cands[0].click();
      return true;
    }, arg);
    if (!ok) { console.error('Libellé introuvable à l\'écran : ' + arg); process.exit(3); }
    await page.waitForTimeout(3500);
    const rc = await radiographieComplete(page);
    console.log(JSON.stringify({
      avant, apres: page.url(), titre: rc.titre, nbCadres: rc.nbCadres,
      cadres: rc.cadres.map((c) => ({ cadre: c.cadre, h1: c.h1, exports: c.exports, champs: c.champs.slice(0, 25), tables: c.tables })),
      cliche: await cliche('clic-' + arg.replace(/[^a-z0-9]+/gi, '-').toLowerCase()),
    }, null, 2));
  } else if (cmd === 'clicsel') {
    // Clic par SÉLECTEUR CSS (pour les icônes sans libellé, ex. l'onglet « + »).
    // Même garde-fou : si le texte de l'élément évoque une action, on refuse.
    const info = await page.evaluate((css) => {
      const el = document.querySelector(css);
      if (!el) return null;
      return { texte: (el.innerText || el.textContent || '').trim().slice(0, 60), aria: el.getAttribute('aria-label') || '' };
    }, arg);
    if (!info) { console.error('Sélecteur introuvable : ' + arg); process.exit(3); }
    if (INTERDITS.test(info.texte + ' ' + info.aria)) { console.error('Élément refusé par le garde-fou : ' + JSON.stringify(info)); process.exit(2); }
    await page.locator(arg).first().click({ timeout: 8000 });
    await page.waitForTimeout(3000);
    const rc2 = await radiographieComplete(page);
    console.log(JSON.stringify({ url: page.url(), cible: info, titre: rc2.titre, cliche: await cliche('clicsel') }, null, 2));
  } else if (cmd === 'clicreel') {
    // CLIC SOURIS RÉEL (événement de confiance) : certains routeurs SPA ignorent
    // un el.click() synthétique. On vise le centre de la boîte de l'élément.
    // Même garde-fou : libellé d'action -> refus.
    if (!arg || INTERDITS.test(arg)) { console.error('Libellé refusé par le garde-fou : ' + arg); process.exit(2); }
    const boite = await page.evaluate((lbl) => {
      const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const c = [...document.querySelectorAll('li,a,button,span,div,td')]
        .filter((el) => vis(el) && norm(el.innerText || el.textContent) === norm(lbl))
        .sort((a, b) => a.getElementsByTagName('*').length - b.getElementsByTagName('*').length)[0];
      if (!c) return null;
      c.scrollIntoView({ block: 'center' });
      const r = c.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, arg);
    if (!boite) { console.error('Libellé introuvable : ' + arg); process.exit(3); }
    await page.mouse.move(boite.x, boite.y);
    await page.waitForTimeout(150);
    await page.mouse.click(boite.x, boite.y);
    await page.waitForTimeout(6000);
    const rc3 = await radiographieComplete(page);
    console.log(JSON.stringify({
      url: page.url(), titre: rc3.titre,
      cadres: rc3.cadres.map((c) => ({ h1: c.h1, exports: c.exports.map((e) => e.texte || e.titre), tables: c.tables, champs: c.champs.slice(0, 20) })),
      cliche: await cliche('reel-' + arg.replace(/[^a-z0-9]+/gi, '-').toLowerCase()),
    }, null, 2));
  } else if (cmd === 'clicxy') {
    // Clic souris réel à des coordonnées CSS (dernier recours pour les widgets
    // qui masquent leur <input>, comme les radios Bubble).
    const [x, y] = String(arg).split(',').map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) { console.error('Coordonnées invalides'); process.exit(2); }
    await page.mouse.move(x, y); await page.waitForTimeout(120); await page.mouse.click(x, y);
    await page.waitForTimeout(4000);
    console.log(JSON.stringify({ url: page.url(), cliche: await cliche('clicxy') }, null, 2));
  } else if (cmd === 'texte') {
    // Texte visible, TRONQUÉ et CAVIARDÉ : tout jeton d'au moins 20 caractères
    // (clé d'API, secret, token) est remplacé — il ne doit apparaître ni à
    // l'écran, ni dans un fichier, ni dans la conversation.
    const brut = await page.evaluate(() => (document.body.innerText || '').replace(/\n{3,}/g, '\n\n').slice(0, 6000));
    // Un mot ordinaire n'est pas un secret : on ne masque que ce qui MÉLANGE
    // lettres et chiffres (ou est anormalement long) — signature d'une clé.
    const masque = brut
      .replace(/\b(?=[A-Za-z0-9_\-]{20,}\b)(?=[^\s]*\d)[A-Za-z0-9_\-]{20,}\b/g, '«JETON MASQUÉ»')
      .replace(/\b[A-Za-z0-9+/]{32,}={0,2}\b/g, '«JETON MASQUÉ»');
    console.log(JSON.stringify({ url: page.url(), texte: masque }, null, 2));
  } else if (cmd === 'cadres') {
    const f = page.frames().map((x) => ({ url: x.url().slice(0, 140), nom: x.name() }));
    console.log(JSON.stringify(f, null, 2));
  } else if (cmd === 'html') {
    // Lecture brute d'un morceau de structure (balises/attributs), tronquée.
    const out = await page.evaluate((css) => [...document.querySelectorAll(css)].slice(0, 5)
      .map((el) => el.outerHTML.replace(/\s+/g, ' ').slice(0, 1200)), arg);
    console.log(JSON.stringify(out, null, 2));
  } else if (cmd === 'nav') {
    // Relève la barre de navigation : ces applis sont des SPA, leurs menus ne
    // sont pas des <a href> mais des éléments porteurs d'attributs. On note leur
    // libellé et leurs attributs -> on saura ensuite naviguer par URL.
    const items = await page.evaluate(() => {
      const txt = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const cand = [...document.querySelectorAll('nav *, header *, aside *, .menu *, [class*=menu] *, [class*=nav] *, a, button, li')];
      const vus = new Set();
      return cand.filter(visible).map((el) => {
        const t = txt(el);
        if (!t || t.length > 40 || vus.has(t)) return null;
        if (el.children.length > 2) return null; // on garde les feuilles
        vus.add(t);
        const attrs = {};
        [...el.attributes].forEach((a) => { if (/^(href|data-|id|name|onclick|routerlink|ng-|to)/i.test(a.name)) attrs[a.name] = String(a.value).slice(0, 120); });
        return { texte: t, tag: el.tagName.toLowerCase(), attrs };
      }).filter(Boolean).slice(0, 120);
    });
    console.log(JSON.stringify({ url: page.url(), items }, null, 2));
  } else if (cmd === 'onglet') {
    // Ouvre un NOUVEL onglet et s'arrête là : c'est toi qui te connectes.
    // Aucun champ n'est rempli, aucun bouton n'est cliqué, rien n'est lu.
    if (!urlSure(arg)) { console.error('URL refusée par le garde-fou : ' + arg); process.exit(2); }
    const onglet = await contexte.newPage();
    await onglet.goto(arg, { waitUntil: 'domcontentloaded' }).catch((e) => console.error('chargement : ' + e.message));
    await onglet.bringToFront();
    await onglet.waitForTimeout(2000);
    console.log(JSON.stringify({
      ouvert: onglet.url(), titre: await onglet.title().catch(() => ''),
      onglets: contexte.pages().map((p) => p.url()),
    }, null, 2));
  } else {
    console.error('commande inconnue : ' + cmd);
    process.exit(2);
  }

  // On se DÉTACHE : la fenêtre et la session restent intactes.
  await navigateur.close();
})().catch((e) => { console.error('Erreur : ' + e.message); process.exit(1); });
