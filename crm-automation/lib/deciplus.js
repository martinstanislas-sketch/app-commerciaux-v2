'use strict';
// ============================================================================
//  COLLECTEUR DECIPLUS — encaissements d'un mois, export CSV natif, multisite.
//
//  LECTURE SEULE. On pose des filtres (période, tous les sites), on déclenche
//  l'export CSV que Deciplus fabrique lui-même, et c'est tout. Aucune donnée
//  n'est écrite dans le CRM.
//
//  ⚠️ INTERDICTION ABSOLUE : /nextgen/prelevements.php. Cet écran s'appelle
//  aussi « Encaissements » dans le menu, mais c'est l'écran de TRAITEMENT des
//  échéances (« Traiter les échéances », « les factures seront générées ») :
//  y cliquer génère des factures. La fonction garde() refuse toute URL qui le
//  contient, ainsi que tout verbe d'écriture.
//
//  ⚠️ `?history=boxing` ne s'applique pas à froid : au premier chargement l'app
//  retombe sur l'onglet « Ventes ». Il faut donc charger l'app, PUIS naviguer.
// ============================================================================

const path = require('path');
const fs = require('fs');

const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const INTERDIT = /(prelevements\.php|presta_echeance\.php|delete|supprim|valider|enregistr|traiter|cloture|clôture|impaye|resili)/i;

function garde(url) {
  if (INTERDIT.test(url)) throw new Error('URL refusée par le garde-fou Deciplus : ' + url);
  if (!/^https:\/\/[a-z0-9.-]+\.deciplus\.pro\//i.test(url)) throw new Error('URL hors Deciplus : ' + url);
  return url;
}

const BASE = 'https://ginkgo-sport.deciplus.pro/nextgen/';

// Texte de la barre de filtres — sert à TOUS les contrôles.
const barre = (page) => page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' '));

// Les deux journaux du Manager. Même écran, même barre de filtres, même export :
// seuls l'onglet, le libellé de la borne de date et le nom du fichier changent.
//   · boxing = ENCAISSEMENTS -> ce qui a été PAYÉ  (« Encaissé entre le »)
//   · sales  = VENTES        -> ce qui a été VENDU (« Vendu entre le »)
// Le second est la seule source qui prouve qu'une vente existe dans le CRM sans
// la confondre avec un paiement (cf. lib/csvVentes.js).
const ONGLETS = {
  boxing: { nom: 'Encaissements', prefixe: 'encaissements' },
  sales: { nom: 'Ventes', prefixe: 'ventes' },
};

async function ouvrirOnglet(page, cle, journal) {
  const o = ONGLETS[cle];
  if (!o) throw new Error('Onglet Deciplus inconnu : ' + cle);
  // 1) charger l'app (à froid, l'onglet par défaut est « Ventes »)
  if (!page.url().includes('/nextgen/historybeta')) {
    await page.goto(garde(BASE + 'historybeta'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(9000);
  }
  // 2) basculer sur l'onglet visé par navigation interne
  await page.goto(garde(BASE + 'historybeta?history=' + cle), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);
  const tab = await page.evaluate(() => (document.querySelector('[role=tab][aria-selected=true]') || {}).id || '');
  if (!new RegExp('_' + cle + '$').test(tab)) {
    throw new Error('Onglet ' + o.nom + ' non actif (onglet courant : ' + tab + ')');
  }
  journal('onglet ' + o.nom + ' actif (' + tab + ')');
}

// Les deux champs de date de la barre : ce sont des <span> porteurs de JJ/MM/AAAA.
// On les repère par leur position (le premier = « Encaissé entre le », le second
// = « Et le »), jamais par une classe auto-générée.
async function champsDate(page) {
  return page.evaluate(() => [...document.querySelectorAll('span,div')]
    .filter((e) => {
      const t = (e.innerText || '').trim();
      const r = e.getBoundingClientRect();
      return /^\d{2}\/\d{2}\/\d{4}$/.test(t) && r.width > 0 && r.top < 220 && e.children.length === 0;
    })
    .map((e) => { const r = e.getBoundingClientRect(); return { val: (e.innerText || '').trim(), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })
    .sort((a, b) => a.x - b.x));
}

async function poserDate(page, rang, annee, moisIdx, jour) {
  // ATTENTE ACTIVE : après un rechargement (ou un export), la barre de filtres
  // met un temps variable à se peindre. Une attente fixe échouait au 2e mois.
  let ch = [];
  for (let i = 0; i < 20; i++) {
    ch = await champsDate(page);
    if (ch.length >= rang + 1) break;
    await page.waitForTimeout(1000);
  }
  if (ch.length < rang + 1) throw new Error('Champ de date introuvable (rang ' + rang + ') après 20 s d\'attente');
  const panneau = page.locator('.p-datepicker-panel');
  // ⚠️ FERMER D'ABORD tout calendrier resté ouvert. Sinon, en posant la 2e date,
  // on croit son calendrier ouvert alors que c'est CELUI DU 1er CHAMP : on
  // repose la première date et la seconde n'est jamais renseignée (le contrôle
  // « date non posée » l'a attrapé, mais autant ne pas provoquer le cas).
  for (let i = 0; i < 3 && (await panneau.first().isVisible().catch(() => false)); i++) {
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(900);
  }
  // Puis ouvrir celui du champ visé, et s'assurer qu'il est bien ouvert.
  for (let i = 0; i < 4; i++) {
    if (await panneau.first().isVisible().catch(() => false)) break;
    await page.mouse.click(ch[rang].x, ch[rang].y);
    await page.waitForTimeout(2200);
  }
  if (!(await panneau.first().isVisible().catch(() => false))) {
    throw new Error('Calendrier du champ de date (rang ' + rang + ') impossible à ouvrir');
  }
  // Année puis mois puis jour — l'ordre importe : changer l'année réinitialise la grille.
  const selAnnee = page.locator('.p-datepicker-select-year');
  const titre = (await selAnnee.count()) ? await selAnnee.first().innerText().catch(() => '') : String(annee);
  if (String(annee) !== titre.trim() && (await selAnnee.count())) {
    await selAnnee.first().click({ timeout: 6000 });
    await page.waitForTimeout(1000);
    // ⚠️ PrimeVue duplique le libellé dans un <div class="p-hidden-accessible">
    // destiné aux lecteurs d'écran : getByText() tombait sur ce doublon, que la
    // vraie cellule recouvre -> clic éternellement « intercepté ». On vise donc
    // explicitement la cellule cliquable.
    // Le libellé de l'année sélectionnée est DUPLIQUÉ dans sa cellule
    // (« 2026\n2026 ») : on matche donc sur le DÉBUT, jamais sur l'égalité.
    await page.locator('[data-pc-section="year"]').filter({ hasText: new RegExp('^' + annee) }).first().click({ timeout: 6000 });
    await page.waitForTimeout(1200);
  }
  await page.locator('.p-datepicker-select-month').first().click({ timeout: 6000 });
  // ⚠️ ATTENDRE que la grille des mois soit rendue avant de viser une cellule :
  // sans cette attente le sélecteur ne trouvait rien, et le repli getByText()
  // tombait sur le doublon `data-pc-section="hiddenmonth"` que PrimeVue destine
  // aux lecteurs d'écran — cliquable en apparence, mais recouvert par la vraie
  // cellule, d'où un « intercepts pointer events » sans fin.
  // La section sémantique `month` désigne LA cellule cliquable, sans ambiguïté.
  // ⚠️ DEUX PIÈGES dans cette grille, constatés à l'écran :
  //   · les mois y sont ABRÉGÉS (« janv », « févr », « avr », « juill »…), donc
  //     un libellé complet ne matche jamais ;
  //   · la cellule du mois DÉJÀ SÉLECTIONNÉ contient son libellé EN DOUBLE
  //     (« juin\njuin »), donc une égalité de texte échoue précisément sur elle.
  // On vise donc la cellule par son RANG (la grille va de janvier à décembre) :
  // insensible aux abréviations, à la casse et au doublon.
  const grille = page.locator('[data-pc-section="month"]');
  await grille.first().waitFor({ state: 'visible', timeout: 8000 });
  const n = await grille.count();
  if (n < 12) throw new Error('Grille des mois inattendue (' + n + ' cellules)');
  const cellule = grille.nth(moisIdx);
  const libelle = (await cellule.innerText()).split('\n')[0].trim();
  if (!MOIS_FR[moisIdx].startsWith(libelle.toLowerCase().replace(/\.$/, ''))) {
    throw new Error('Cellule de rang ' + moisIdx + ' = « ' + libelle + " », incohérent avec " + MOIS_FR[moisIdx]);
  }
  await cellule.click({ timeout: 6000 });
  await page.waitForTimeout(1400);
  await page.locator('.p-datepicker-day-cell:not(.p-datepicker-other-month) .p-datepicker-day:not(.p-disabled)', { hasText: new RegExp('^' + jour + '$') })
    .first().click({ timeout: 6000 });
  await page.waitForTimeout(3000);

  // CONTRÔLE APRÈS ÉCRITURE : le champ doit porter la date demandée. Sans cela,
  // un clic avalé passerait inaperçu et on exporterait la mauvaise période.
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(800);
  const attendue = String(jour).padStart(2, '0') + '/' + String(moisIdx + 1).padStart(2, '0') + '/' + annee;
  const apres = await champsDate(page);
  if (!apres[rang] || apres[rang].val !== attendue) {
    throw new Error('Date non posée (rang ' + rang + ') : attendu ' + attendue + ', lu ' + ((apres[rang] || {}).val || 'rien'));
  }
}

// Dernier jour d'un mois AAAA-MM.
const finDeMois = (ym) => { const [a, m] = ym.split('-').map(Number); return new Date(Date.UTC(a, m, 0)).getUTCDate(); };

// Exporte le journal `onglet` du mois `ym`, TOUS SITES, et rend le chemin du CSV.
async function exporterOnglet(page, onglet, ym, dossier, journal = () => {}) {
  const o = ONGLETS[onglet];
  if (!o) throw new Error('Onglet Deciplus inconnu : ' + onglet);
  const [annee, mois] = ym.split('-').map(Number);
  await ouvrirOnglet(page, onglet, journal);

  await poserDate(page, 0, annee, mois - 1, 1);
  await poserDate(page, 1, annee, mois - 1, finDeMois(ym));

  // Contrôle AVANT export : la barre doit afficher la période demandée.
  const jj = (n) => String(n).padStart(2, '0');
  const attDu = jj(1) + '/' + jj(mois) + '/' + annee;
  const attAu = jj(finDeMois(ym)) + '/' + jj(mois) + '/' + annee;
  const txt = await barre(page);
  if (!txt.includes(attDu) || !txt.includes(attAu)) {
    throw new Error('Période non conforme avant export : attendu ' + attDu + ' → ' + attAu);
  }
  if (!/Tous les sites/.test(txt)) {
    throw new Error('Le filtre de site n\'est pas sur « Tous les sites » — export multisite impossible');
  }
  const nbLignes = (txt.match(/([\d\s]+)Lignes/) || [])[1];
  journal('filtres conformes : ' + attDu + ' → ' + attAu + ' · tous les sites · ' + (nbLignes || '?').trim() + ' lignes');

  fs.mkdirSync(dossier, { recursive: true });
  const dest = path.join(dossier, o.prefixe + '-' + ym + '.csv');
  const attente = page.waitForEvent('download', { timeout: 120000 });
  await page.getByText('Effectuer une action', { exact: true }).first().click({ timeout: 8000 });
  await page.waitForTimeout(1200);
  await page.getByText('Exporter au format', { exact: true }).first().click({ timeout: 8000 });
  await page.waitForTimeout(1200);
  await page.locator('[role=menuitem][aria-label="Csv"]').first().click({ timeout: 8000 });
  const dl = await attente;
  await dl.saveAs(dest);
  journal('CSV reçu : ' + dl.suggestedFilename() + ' → ' + path.basename(dest));
  return dest;
}

// Remet les filtres comme on les a trouvés (option native, aucune écriture).
async function reinitialiserFiltres(page) {
  try {
    await page.getByText('Effectuer une action', { exact: true }).first().click({ timeout: 6000 });
    await page.waitForTimeout(800);
    await page.locator('[role=menuitem][aria-label="Réinitialiser les filtres"]').first().click({ timeout: 6000 });
    await page.waitForTimeout(2500);
  } catch (_) { /* sans conséquence : l'état des filtres n'est pas une donnée */ }
}

// Les deux usages nommés, pour que l'appelant ne manipule jamais la clé d'onglet.
const exporterMois = (page, ym, dossier, journal) => exporterOnglet(page, 'boxing', ym, dossier, journal);
const exporterVentesMois = (page, ym, dossier, journal) => exporterOnglet(page, 'sales', ym, dossier, journal);

module.exports = { exporterMois, exporterVentesMois, exporterOnglet, reinitialiserFiltres, garde, MOIS_FR, finDeMois, ONGLETS };
