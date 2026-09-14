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

// ⚠️ CHANGER DE CLUB RECHARGE LA PAGE (Bubble). Une lecture surprise pendant ce
// rechargement lève « Execution context was destroyed » ou trouve un
// document sans body. Ce n'est pas une réponse : c'est « pas encore ». On
// attend la fin du chargement et on rend `defaut` — « inconnu », que les
// vérifications traitent toujours comme un échec, jamais comme un succès.
async function lirePage(page, fn, arg, defaut) {
  try {
    return await page.evaluate(fn, arg);
  } catch (e) {
    if (!/context was destroyed|navigation|Cannot read properties of null|Target closed/i.test(e.message || '')) throw e;
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
    return defaut;
  }
}

async function menuOuvert(page) {
  return lirePage(page, () => {
    const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
    return [...document.querySelectorAll('div')].some((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && n(e.innerText) === 'Tous vos clubs Multi-sites';
    });
  }, null, false);
}

// Le nom de club tel que la barre latérale l'affiche (« Marcq-en-Barœul »).
const clubAttendu = (studio) => (CLUBS_FB[studio] || '').replace('My Coach ', '');
// Le club affiché est-il EXACTEMENT celui demandé ? Seuls les espaces sont
// neutralisés : « Marcq » n'est pas « Marcq-en-Barœul », et un affichage vide
// (menu encore ouvert, page en cours de rendu) n'est jamais un succès.
function verifierClub(affiche, studio) {
  const att = clubAttendu(studio);
  return !!att && norm(affiche) === att;
}

// ── LA BASCULE, SANS NAVIGATEUR ────────────────────────────────────────────
//  LE BUG DU 2026-09-14 (collecte de juillet). Le menu des clubs est une liste
//  DÉFILANTE : 250 px visibles pour 630 px de contenu. Wasquehal, Marcq,
//  Boulogne, Levallois et Neuilly sont sous le pli de cette liste. L'ancien
//  code visait le centre de l'entrée — mais à ce point-là, l'élément du dessus
//  était la barre latérale (ou « Créer un club », « Alertes »). Le clic tombait
//  À CÔTÉ du menu, qui se refermait sans rien changer ; on écrivait « club
//  sélectionné » sans l'avoir vérifié, et c'est la lecture des stats qui
//  constatait « Lille ». Lille « réussissait » parce qu'il était déjà actif.
//
//  D'où trois règles, ici :
//   1. l'entrée est amenée DANS la zone visible de la liste, et on exige
//      qu'elle soit bien l'élément sous le pointeur avant de cliquer ;
//   2. après le clic, on ATTEND le club affiché et on le compare exactement ;
//   3. un club resté faux après `tentatives` passages est un ÉCHEC — le studio
//      ne sera pas lu, et la collecte reste bloquante.
//
//  `ops` isole tout ce qui touche la page (testé avec un faux navigateur) :
//    fermerMenu() · clubAffiche() · ouvrirMenu() · amenerEntree(libelle) -> {x,y}
//    · cliquer({x,y}) · attendreClub(attendu) -> club lu en fin d'attente
const TENTATIVES_BASCULE = 3;

async function basculerClub(ops, studio, { tentatives = TENTATIVES_BASCULE, journal = () => {} } = {}) {
  const libelle = CLUBS_FB[studio];
  if (!libelle) throw new Error('Studio inconnu côté Fitness Booster : ' + studio);
  const attendu = clubAttendu(studio);
  const n = Math.max(1, Number(tentatives) || 1);
  let raison = '';
  // ⚠️ Toute exception d'un passage (page rechargée en pleine lecture, menu
  // introuvable…) compte comme un passage RATÉ, rejoué — jamais comme une
  // réussite, et jamais comme un abandon avant la limite.
  for (let i = 1; i <= n; i++) {
    try {
      await ops.fermerMenu();
      const avant = await ops.clubAffiche();
      if (verifierClub(avant, studio)) {
        journal('club vérifié : ' + libelle + (i === 1 ? ' (déjà actif)' : ''));
        return norm(avant);
      }
      await ops.ouvrirMenu();
      const pos = await ops.amenerEntree(libelle);
      await ops.cliquer(pos);
      const lu = await ops.attendreClub(attendu);
      if (verifierClub(lu, studio)) {
        journal('club sélectionné et vérifié : ' + libelle + (i > 1 ? ' (tentative ' + i + ')' : ''));
        return norm(lu);
      }
      raison = 'Club affiché « ' + (lu || '—') + ' » ≠ attendu « ' + attendu + ' »';
    } catch (e) {
      raison = e.message;
    }
    if (i < n) journal('↻ bascule vers ' + attendu + ' — tentative ' + i + '/' + n + ' : ' + raison);
  }
  throw new Error('Bascule vers « ' + attendu + ' » impossible après ' + n + ' tentative(s) — ' + raison);
}

// Le club réellement affiché dans la barre latérale.
// ⚠️ À lire UNIQUEMENT liste refermée : ouverte, la première occurrence de
// « My Coach \n <ville> » est une ENTRÉE DU MENU et non le club actif — c'est
// ainsi qu'on a cru lire « Neuilly » alors qu'on demandait Lille. Menu ouvert,
// on rend donc '' : « inconnu », jamais un faux positif.
const clubAffiche = (page) => lirePage(page, () => {
  if (!document.body) return '';
  const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const ouvert = [...document.querySelectorAll('div')].some((e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && n(e.innerText) === 'Tous vos clubs Multi-sites';
  });
  if (ouvert) return '';
  const m = (document.body.innerText || '').match(/My Coach\s*\n\s*([^\n]{3,40})/);
  return m ? m[1].trim() : '';
}, null, '');

// Les opérations réelles, sur la page Fitness Booster.
function opsPage(page) {
  return {
    async fermerMenu() {
      for (let i = 0; i < 3 && (await menuOuvert(page)); i++) {
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(1000);
      }
    },
    clubAffiche: () => clubAffiche(page),
    async ouvrirMenu() {
      await fermerPanneau(page); // sinon le panneau intercepte le clic
      for (let i = 0; i < 4; i++) {
        if (await menuOuvert(page)) return;
        await page.mouse.click(120, 39); // le bloc « My Coach … » en haut à gauche
        await page.waitForTimeout(2500);
      }
      if (!(await menuOuvert(page))) throw new Error('Sélecteur de club impossible à ouvrir');
    },
    async amenerEntree(libelle) {
      // 1) Défiler LA LISTE (et non la fenêtre) pour centrer l'entrée.
      const trouve = await page.evaluate((lbl) => {
        const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
        // Une ENTRÉE du menu vit dans une cellule de liste (.group-item) : cela
        // écarte l'en-tête de la barre latérale, qui porte le même texte.
        const txt = [...document.querySelectorAll('.group-item div')]
          .filter((e) => n(e.innerText) === lbl && e.getBoundingClientRect().width > 0)
          .sort((a, b) => a.getElementsByTagName('*').length - b.getElementsByTagName('*').length)[0];
        if (!txt) return false;
        const cible = txt.closest('.clickable-element') || txt;
        let sc = cible.parentElement;
        while (sc && !(sc.scrollHeight > sc.clientHeight + 1 && /(auto|scroll|hidden)/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
        if (sc) {
          const rs = sc.getBoundingClientRect(), rc = cible.getBoundingClientRect();
          sc.scrollTop += (rc.top - rs.top) - (rs.height - rc.height) / 2;
        }
        return true;
      }, libelle);
      if (!trouve) throw new Error('Entrée « ' + libelle + ' » absente du sélecteur');
      await page.waitForTimeout(800);
      // 2) Mesurer APRÈS défilement, et exiger que le pointeur tombe sur l'entrée.
      const pos = await page.evaluate((lbl) => {
        const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const txt = [...document.querySelectorAll('.group-item div')]
          .filter((e) => n(e.innerText) === lbl && e.getBoundingClientRect().width > 0)
          .sort((a, b) => a.getElementsByTagName('*').length - b.getElementsByTagName('*').length)[0];
        if (!txt) return { erreur: 'entrée disparue après défilement' };
        const cible = txt.closest('.clickable-element') || txt;
        const r = cible.getBoundingClientRect();
        const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
        const dessus = document.elementFromPoint(x, y);
        if (!dessus || !cible.contains(dessus)) {
          return { erreur: 'entrée hors de la zone cliquable du menu (recouverte par « ' + n(dessus && dessus.innerText).slice(0, 30) + ' »)' };
        }
        return { x, y };
      }, libelle);
      if (pos.erreur) throw new Error('« ' + libelle + ' » : ' + pos.erreur);
      return pos;
    },
    cliquer: (pos) => page.mouse.click(pos.x, pos.y),
    async attendreClub(attendu, delaiMs = 25000) {
      // ATTENTE ACTIVE : la bascule recharge la page, puis Bubble repeint la
      // barre latérale. On rend le dernier club lu — c'est basculerClub qui
      // juge. Un club correct doit être lu DEUX FOIS de suite : une lecture
      // attrapée juste avant le rechargement pourrait encore montrer l'ancien
      // état, ou un état transitoire.
      let lu = '', stable = 0;
      const fin = Date.now() + delaiMs;
      while (Date.now() < fin) {
        await page.waitForTimeout(1000);
        lu = await clubAffiche(page);
        stable = norm(lu) === attendu ? stable + 1 : 0;
        if (stable >= 2) return lu;
      }
      return lu;
    },
  };
}

async function choisirClub(page, studio, journal = () => {}) {
  return basculerClub(opsPage(page), studio, { journal });
}

// ── ANALYSE D'UNE LIGNE DE DÉTAIL (pure, testable sans navigateur) ─────────
//  Une ligne complète se présente ainsi :
//     [0] rang · [1] identité · [2] prestation · [3] source
//     [4] « 05/08/2026 |  Fabian F. »
//     [5] « Voir la fiche du contact » · [6] PDF · [7] mandat SEPA
//
//  ⚠️ ON NE LIT PLUS PAR POSITION. Bubble peint la ligne PAR MORCEAUX : surpris
//  en flagrant délit le 2026-09-14 sur Marcq, les segments 2 à 4 manquaient
//  encore, si bien que l[2] valait « Voir la fiche du contact » et que date
//  comme commercial ressortaient VIDES. Le compteur était bon (les lignes
//  existaient), donc rien ne le signalait : le rapport est parti avec 5 ventes
//  sans commercial. Le KPI restait juste — il ne dépend que de l'identité — mais
//  la vue par commercial devenait fausse en silence.
//
//  La DATE identifie donc sa ligne par son MOTIF (JJ/MM/AAAA en tête de
//  segment). « Voir le contrat PDF(05/08/26) » ne peut pas être confondue avec
//  elle : année sur deux chiffres, et pas en tête de segment.
const RE_DATE = /^(\d{2}\/\d{2}\/\d{4})\s*(?:\|\s*(.*))?$/;
const RE_UI = /^(Voir la fiche|Voir le contrat|Voir le mandat|Signer le SEPA)/i;
// « Vente annulée le 24/08/2026 ». La date d'annulation peut tomber APRÈS le
// mois audité (constaté : une vente d'août annulée le 07/09) — on la rend telle
// quelle, c'est une information de contrôle, pas un critère de calcul.
// ⚠️ PAS de « \w » après « annul » : la classe \w ignore le « é » d'« annulée »,
// si bien que la date n'était jamais capturée. On reste sur la MÊME ligne
// (`[^\n]*?`) pour ne pas aller chercher la date d'une autre ligne.
const RE_ANNUL = /Vente annul/i;
const RE_ANNUL_DATE = /Vente annul[^\n]*?(\d{2}\/\d{2}\/\d{4})/i;

function analyserLigne(texte) {
  const t = String(texte == null ? '' : texte);
  const segs = t.split('\n').map((s) => s.trim()).filter(Boolean);
  const iDate = segs.findIndex((s) => RE_DATE.test(s));
  const m = iDate >= 0 ? RE_DATE.exec(segs[iDate]) : null;
  const identite = segs[1] && !RE_UI.test(segs[1]) ? segs[1] : '';
  // Entre l'identité et la date : prestation puis source. Tout libellé
  // d'interface qui s'y glisse est écarté plutôt que pris pour une prestation.
  const milieu = (iDate > 2 ? segs.slice(2, iDate) : []).filter((s) => !RE_UI.test(s));
  return {
    rang: segs[0] || '',
    identite,
    prestation: milieu[0] || '',
    source: milieu[1] || '',
    date: m ? m[1] : '',
    commercial: m && m[2] ? m[2].trim() : '',
    annulee: RE_ANNUL.test(t),
    // La date d'annulation quand Fitness Booster la donne ; '' sinon. On
    // n'invente rien : une annulation sans date reste une annulation.
    dateAnnulation: (RE_ANNUL_DATE.exec(t) || [])[1] || '',
    // Une ligne sans date ou sans identité n'est pas « une donnée absente » :
    // c'est une lecture trop tôt. On attend, puis on échoue.
    complete: !!m && !!identite,
  };
}

// ── Lecture d'un studio pour un mois ───────────────────────────────────────
async function lireStudio(page, studio, ym, journal = () => {}) {
  await choisirClub(page, studio, journal);
  await page.goto(urlStats(ym), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);

  // CONTRÔLE 1 : le bon club est TOUJOURS affiché une fois la page de stats
  // rechargée (liste refermée avant de lire). La bascule a été vérifiée juste
  // avant ; on revérifie ici, car c'est cette page-là qu'on va lire.
  if (await menuOuvert(page)) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(1200); }
  const club = await clubAffiche(page);
  if (!verifierClub(club, studio)) {
    throw new Error('Club affiché « ' + (club || '—') + ' » ≠ attendu « ' + clubAttendu(studio) + ' »');
  }

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

  // ── Extraction : le groupe répétitif dont le nombre d'enfants égale le compteur.
  //
  //  ⚠️ ON NE LIT PLUS LES CHAMPS PAR POSITION. Une ligne complète ressemble à :
  //     [0] rang · [1] identité · [2] prestation · [3] source
  //     [4] « 05/08/2026 |  Fabian F. »
  //     [5] « Voir la fiche du contact » · [6] PDF · [7] mandat SEPA
  //  Mais Bubble peint la ligne PAR MORCEAUX. Surpris en flagrant délit le
  //  2026-09-14 sur Marcq : les segments 2 à 4 n'étaient pas encore là, donc
  //  l[2] valait « Voir la fiche du contact » et la date comme le commercial
  //  ressortaient VIDES. Le compteur, lui, était bon (les lignes existaient) :
  //  le contrôle ne voyait rien, et le rapport partait avec 5 ventes sans
  //  commercial. Le KPI restait juste — il ne dépend que de l'identité — mais
  //  la vue par commercial, elle, devenait fausse en silence.
  //
  //  D'où deux garde-fous :
  //   · la DATE identifie sa ligne par son motif (JJ/MM/AAAA en début de
  //     segment) et non par son rang — « Voir le contrat PDF(05/08/26) » ne
  //     peut pas être pris pour elle : année sur 2 chiffres, et pas en tête ;
  //   · une ligne SANS date est réputée pas encore peinte : on attend, puis on
  //     ÉCHOUE. Mieux vaut rejouer le studio que publier des champs vides.
  //  Le DOM ne rend que du BRUT (les segments de texte de chaque ligne) ; toute
  //  l'interprétation se fait dans Node, par analyserLigne() — pure, exportée,
  //  et donc testable sans navigateur. C'est ce qui permet de rejouer à froid la
  //  ligne à moitié peinte qui nous a piégés.
  const BRUT = (n) => {
    const rgs = [...document.querySelectorAll('.bubble-element.RepeatingGroup')];
    const rg = rgs.find((e) => e.children.length === n) || rgs.find((e) => e.children.length > 0 && e.children.length <= n);
    if (!rg) return null;
    return [...rg.children].map((ch) => (ch.innerText || ''));
  };

  // ATTENTE ACTIVE de lignes COMPLÈTES, pas seulement présentes.
  let lignes = null;
  for (let i = 0; i < 15; i++) {
    const brut = await page.evaluate(BRUT, compteur);
    lignes = brut && brut.map(analyserLigne);
    if (lignes && lignes.length === compteur && lignes.every((l) => l.complete)) break;
    await page.waitForTimeout(1000);
  }
  if (!lignes) throw new Error('Liste de détail introuvable');

  // CONTRÔLE 4, le plus important : lignes extraites = compteur affiché.
  if (lignes.length !== compteur) {
    throw new Error('Extraction incomplète : ' + lignes.length + ' ligne(s) lues pour un compteur de ' + compteur);
  }
  // CONTRÔLE 5 : chaque ligne est réellement peinte. Un champ vide n'est jamais
  // « une donnée absente » ici — c'est une lecture trop tôt.
  const creuses = lignes.filter((l) => !l.complete);
  if (creuses.length) {
    throw new Error('Lignes incomplètes après 15 s : ' + creuses.length + '/' + compteur
      + ' sans date ni identité exploitables (panneau à moitié peint)');
  }

  const contrats = lignes.map((l) => ({
    identite: l.identite, prestation: l.prestation, source: l.source,
    date: l.date, commercial: l.commercial,
    annulee: l.annulee, dateAnnulation: l.dateAnnulation,
  }));
  const annulees = contrats.filter((c) => c.annulee).length;
  journal(studio + ' : ' + compteur + ' contrat(s) souscrit(s), dont ' + annulees + ' annulé(s) — période ' + periodeDetail.du + ' → ' + periodeDetail.au);

  await fermerPanneau(page);
  return { studio, club, mois: ym, compteur, contrats, annulees, periodeDetail };
}

module.exports = {
  lireStudio, analyserLigne, fermerPanneau, choisirClub, basculerClub, verifierClub, clubAttendu,
  CLUBS_FB, TENTATIVES_BASCULE, decalageMois, urlStats, MOIS_FR2, norm,
};
