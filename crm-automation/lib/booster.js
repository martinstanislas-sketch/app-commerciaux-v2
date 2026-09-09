'use strict';
// ============================================================================
//  COLLECTEUR FITNESS BOOSTER — nouveaux contrats signés d'un mois, par studio.
//
//  LECTURE SEULE : bascule de club, sélection de période, ouverture du détail.
//  Aucun champ rempli, aucun enregistrement, aucun téléchargement.
//
//  Ce qu'on lit : l'écran « new-sales-stats », tuile CONTRATS SOUSCRITS, puis
//  son détail nominatif (« Cliquez sur les chiffres pour voir le détail »).
//
//  ⚠️ CONTRÔLE NON NÉGOCIABLE : le nombre de lignes extraites doit égaler le
//  compteur affiché. Sinon on ÉCHOUE pour ce studio — un taux calculé sur une
//  liste tronquée serait faux sans que rien ne le signale.
//
//  ⚠️ Les classes CSS de Bubble sont auto-générées (cnaUcaP…) et changent à
//  chaque redéploiement : on s'ancre sur les TEXTES et sur la structure (le
//  groupe répétitif dont le nombre d'enfants égale le compteur).
// ============================================================================

// Libellés de club côté Fitness Booster (relevés dans le sélecteur).
const CLUBS_FB = {
  Lille: 'My Coach Lille',
  Wasquehal: 'My Coach Wasquehal',
  Marcq: 'My Coach Marcq-en-Barœul',
  Boulogne: 'My Coach Boulogne-Billancourt',
  Levallois: 'My Coach Levallois-Perret',
  Neuilly: 'My Coach Neuilly-sur-Seine',
};
const MOIS_FR2 = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

// Écart en mois entre `ym` et le mois courant (2026-08 -> -1 en septembre 2026).
function decalageMois(ym, aujourdhui = new Date()) {
  const [a, m] = ym.split('-').map(Number);
  return (a * 12 + (m - 1)) - (aujourdhui.getFullYear() * 12 + aujourdhui.getMonth());
}
const urlStats = (ym) => 'https://app.fitness-booster.fr/new-sales-stats?filtre=mois-precedent&mois='
  + decalageMois(ym) + '&menu=statistiques';

// ── Bascule de club ────────────────────────────────────────────────────────
// Le menu est défilant, chaque entrée tient sur DEUX lignes (« My Coach » puis
// la ville) : on normalise les espaces avant de comparer.
// ⚠️ « menu ouvert » se détecte sur « Tous vos clubs », JAMAIS sur le nom du
// club : une fois Lille actif, l'en-tête de la barre latérale se lit aussi
// « My Coach Lille » et le test serait toujours vrai.
// Referme le panneau de détail s'il est ouvert. INDISPENSABLE : laissé ouvert,
// il recouvre la barre latérale et bloque toute bascule de club ensuite.
async function fermerPanneau(page) {
  for (let i = 0; i < 2; i++) {
    const ouvert = await page.evaluate(() => /Cliquez sur les chiffres/.test(document.body.innerText || '')
      && /FERMER/.test(document.body.innerText || ''));
    if (!ouvert) return;
    await page.getByText('FERMER', { exact: true }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(800);
  }
}

async function menuOuvert(page) {
  return page.evaluate(() => {
    const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
    return [...document.querySelectorAll('div')].some((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && n(e.innerText) === 'Tous vos clubs Multi-sites';
    });
  });
}

async function choisirClub(page, studio, journal = () => {}) {
  const libelle = CLUBS_FB[studio];
  if (!libelle) throw new Error('Studio inconnu côté Fitness Booster : ' + studio);
  await fermerPanneau(page); // sinon le panneau intercepte le clic
  for (let i = 0; i < 4; i++) {
    if (await menuOuvert(page)) break;
    await page.mouse.click(120, 39); // le bloc « My Coach … » en haut à gauche
    await page.waitForTimeout(2500);
  }
  if (!(await menuOuvert(page))) throw new Error('Sélecteur de club impossible à ouvrir');
  const h = await page.evaluateHandle((lbl) => {
    const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const els = [...document.querySelectorAll('div')].filter((e) => n(e.innerText) === lbl && e.getBoundingClientRect().width > 0);
    return els.sort((a, b) => a.getElementsByTagName('*').length - b.getElementsByTagName('*').length)[0] || null;
  }, libelle);
  const el = h.asElement();
  if (!el) throw new Error('Entrée « ' + libelle + ' » absente du sélecteur');
  await el.scrollIntoViewIfNeeded({ timeout: 5000 });
  await page.waitForTimeout(400);
  const box = await el.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(7000);
  journal('club sélectionné : ' + libelle);
}

// Le club réellement affiché dans la barre latérale.
// ⚠️ À lire UNIQUEMENT liste refermée : ouverte, la première occurrence de
// « My Coach \n <ville> » est une ENTRÉE DU MENU et non le club actif — c'est
// ainsi qu'on a cru lire « Neuilly » alors qu'on demandait Lille.
const clubAffiche = (page) => page.evaluate(() => {
  const m = (document.body.innerText || '').match(/My Coach\s*\n\s*([^\n]{3,40})/);
  return m ? m[1].trim() : '';
});

// ── Lecture d'un studio pour un mois ───────────────────────────────────────
async function lireStudio(page, studio, ym, journal = () => {}) {
  await choisirClub(page, studio, journal);
  await page.goto(urlStats(ym), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);

  // CONTRÔLE 1 : le bon club est affiché (liste refermée avant de lire).
  if (await menuOuvert(page)) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(1200); }
  const club = await clubAffiche(page);
  const attendu = CLUBS_FB[studio].replace('My Coach ', '');
  if (club !== attendu) throw new Error('Club affiché « ' + club + ' » ≠ attendu « ' + attendu + ' »');

  // CONTRÔLE 2 : le compteur existe.
  const compteur = await page.evaluate(() => {
    const m = (document.body.innerText || '').match(/(\d+)\s*\n\s*CONTRATS\s*\n\s*SOUSCRITS/);
    return m ? Number(m[1]) : null;
  });
  if (compteur == null) throw new Error('Tuile CONTRATS SOUSCRITS introuvable');

  if (compteur === 0) {
    journal(studio + ' : 0 contrat souscrit — pas de détail à ouvrir');
    return { studio, club, mois: ym, compteur: 0, contrats: [], annulees: 0, periodeDetail: null };
  }

  // Ouvrir le détail : clic sur le bloc de la tuile.
  const cible = await page.evaluate(() => {
    const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const lab = [...document.querySelectorAll('div,span')].find((e) => n(e.innerText) === 'CONTRATS SOUSCRITS');
    if (!lab) return null;
    let e = lab, c = null;
    for (let i = 0; i < 6 && e; i++) { if (e.classList && e.classList.contains('clickable-element')) { c = e; break; } e = e.parentElement; }
    c = c || lab;
    const r = c.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  if (!cible) throw new Error('Bloc CONTRATS SOUSCRITS non cliquable');
  await page.mouse.click(cible.x, cible.y);
  // ATTENTE ACTIVE du panneau : une attente fixe de 8 s suffisait 4 fois sur 5,
  // et Marcq est tombé sur la 5e. On attend l'en-tête « Du … au … ».
  const lirePeriode = () => page.evaluate(() => {
    const m = (document.body.innerText || '').match(/Du (\d{2}\/\d{2}\/\d{2}) au (\d{2}\/\d{2}\/\d{2})/);
    return m ? { du: m[1], au: m[2] } : null;
  });
  let periodeDetail = null;
  for (let i = 0; i < 20 && !periodeDetail; i++) { await page.waitForTimeout(1000); periodeDetail = await lirePeriode(); }
  if (!periodeDetail) throw new Error('Période du détail illisible après 20 s (panneau non ouvert ?)');
  // ⚠️ « 01/06/26 » = JOUR/MOIS/ANNÉE : le 1er groupe est le JOUR, pas le mois.
  const [, , mm, aa] = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(periodeDetail.du) || [];
  const attMois = ym.split('-')[1], attAn = ym.slice(2, 4);
  if (mm !== attMois || aa !== attAn) {
    throw new Error('Période du détail ' + periodeDetail.du + ' → ' + periodeDetail.au + ' ≠ mois demandé ' + ym);
  }

  // Extraction : le groupe répétitif dont le nombre d'enfants égale le compteur.
  const lignes = await page.evaluate((n) => {
    const rgs = [...document.querySelectorAll('.bubble-element.RepeatingGroup')];
    const rg = rgs.find((e) => e.children.length === n) || rgs.find((e) => e.children.length > 0 && e.children.length <= n);
    if (!rg) return null;
    return [...rg.children].map((ch) => {
      const t = (ch.innerText || '');
      const l = t.split('\n').map((s) => s.trim()).filter(Boolean);
      return {
        rang: l[0] || '', identite: l[1] || '', prestation: l[2] || '', source: l[3] || '',
        dateEtCommercial: l[4] || '', annulee: /Vente annul/i.test(t),
      };
    });
  }, compteur);
  if (!lignes) throw new Error('Liste de détail introuvable');

  // CONTRÔLE 4, le plus important : lignes extraites = compteur affiché.
  if (lignes.length !== compteur) {
    throw new Error('Extraction incomplète : ' + lignes.length + ' ligne(s) lues pour un compteur de ' + compteur);
  }

  const contrats = lignes.map((l) => {
    const date = (l.dateEtCommercial.split('|')[0] || '').trim();
    const commercial = (l.dateEtCommercial.split('|')[1] || '').trim();
    return { identite: l.identite, prestation: l.prestation, source: l.source, date, commercial, annulee: l.annulee };
  });
  const annulees = contrats.filter((c) => c.annulee).length;
  journal(studio + ' : ' + compteur + ' contrat(s) souscrit(s), dont ' + annulees + ' annulé(s) — période ' + periodeDetail.du + ' → ' + periodeDetail.au);

  await fermerPanneau(page);
  return { studio, club, mois: ym, compteur, contrats, annulees, periodeDetail };
}

module.exports = { lireStudio, fermerPanneau, choisirClub, CLUBS_FB, decalageMois, urlStats, MOIS_FR2, norm };
