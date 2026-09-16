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
// Clubs HORS RECAP 2, connus du sélecteur : ils servent UNIQUEMENT à vérifier la
// bascule en lecture seule (partir de Valence, passer par Ginkgo Sport). Aucune
// collecte ne les lit. Libellé = nom + ville, tels que la liste les affiche.
const CLUBS_HORS_RECAP = {
  Valence: { libelle: 'MyCoach by GINKGO Valence Valence', ville: 'Valence' },
  'Ginkgo Sport': { libelle: 'Ginkgo Sport Tourcoing', ville: 'Tourcoing' },
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

// ── LECTURE DU SÉLECTEUR, SANS DÉPENDRE D'UNE ÉCRITURE EXACTE ──────────────
//  LA PANNE DU 2026-09-16. Vendor avait rouvert le compte sur « MyCoach by
//  GINKGO Valence » (sans espace). Tout reposait sur le texte « My Coach … » :
//  le bloc à cliquer n'était pas trouvé (« Sélecteur de club impossible à
//  ouvrir ») et le club actif ne se lisait plus. On s'ancre désormais sur la
//  STRUCTURE relevée ce jour-là :
//   · le club ACTIF est le bloc cliquable tout en haut de la barre latérale,
//     HORS de la liste, qui porte [initiale] · nom · ville ;
//   · le menu OUVERT est une liste (.group-item) d'entrées cliquables qui
//     portent chacune [initiale] · nom · ville (+ parfois « Club désactivé ») ;
//   · une entrée se compare au libellé attendu casse, accents, espaces et
//     retours à la ligne neutralisés — jamais « à peu près ».
//  Les fonctions ci-dessous sont PURES (testées sans navigateur) : la page ne
//  fait que relever des descripteurs { lignes, haut, gauche, surface, … }.
const compact = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');
// Les lignes qui NOMMENT un club : sans la pastille d'initiale (« M », « G »)
// ni la mention « Club désactivé ».
function lignesClub(lignes) {
  return (lignes || []).map(norm).filter((l) => l && !/^\S$/u.test(l) && !/^club d[ée]sactiv[ée]$/i.test(l));
}
// Une entrée (ou le bloc actif) désigne-t-elle EXACTEMENT ce libellé ?
function entreeCorrespond(lignes, libelle) {
  const l = lignesClub(lignes);
  return l.length >= 2 && l.length <= 3 && !!compact(libelle) && compact(l.join(' ')) === compact(libelle);
}
// Descripteurs des éléments cliquables visibles de la barre latérale.
const relever = (page) => lirePage(page, () => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const multi = [...document.querySelectorAll('div')].some((e) => vis(e) && (e.innerText || '').replace(/\s+/g, ' ').trim() === 'Tous vos clubs Multi-sites');
  const blocs = [...document.querySelectorAll('.clickable-element')].filter(vis).map((e, index) => {
    const r = e.getBoundingClientRect();
    return {
      index, lignes: (e.innerText || '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 6),
      haut: Math.round(r.top), bas: Math.round(r.bottom), gauche: Math.round(r.left), droite: Math.round(r.right),
      surface: Math.round(r.width * r.height),
      dansListe: !!e.closest('.group-item'),
    };
  }).filter((b) => b.gauche < 320);
  return { multi, blocs };
}, null, { multi: false, blocs: [] });
// ⚠️ LA COLONNE DE LA BARRE LATÉRALE (constaté le 2026-09-16 sur Levallois). Le
// tableau de bord affiche aussi des listes cliquables à 2-3 lignes (28 relances
// à partir de x = 312 px) : prises pour le menu, elles le faisaient croire
// OUVERT, le club actif devenait « inconnu » et aucune entrée n'était trouvée.
// Le menu des clubs et le bloc actif vivent dans la barre latérale (x ≈ 24 → 215
// px) : on n'accepte que les éléments dont le bord DROIT y reste.
const LIMITE_BARRE = 300;
const dansBarre = (b) => !Number.isFinite(b.droite) || b.droite <= LIMITE_BARRE;
const estEntreeMenu = (b) => b.dansListe && dansBarre(b);
// Le menu est-il ouvert ? En-tête « Tous vos clubs Multi-sites », sinon au moins
// deux ENTRÉES DE LISTE distinctes, dans la barre latérale, qui nomment un club.
function menuEstOuvert(releve) {
  if (!releve) return false;
  if (releve.multi) return true;
  const noms = new Set((releve.blocs || []).filter(estEntreeMenu)
    .map((b) => lignesClub(b.lignes)).filter((l) => l.length >= 2 && l.length <= 3).map((l) => compact(l.join(' '))));
  return noms.size >= 2;
}
// Le bloc du club ACTIF : cliquable, hors liste, tout en haut, nom + ville.
function blocClubActif(releve) {
  return ((releve && releve.blocs) || [])
    .filter((b) => !b.dansListe && dansBarre(b) && b.haut < 120)
    .map((b) => Object.assign({}, b, { noms: lignesClub(b.lignes) }))
    .filter((b) => b.noms.length >= 2 && b.noms.length <= 3)
    .sort((a, b) => a.haut - b.haut || a.surface - b.surface)[0] || null;
}
// La VILLE du club actif (dernière ligne du bloc). '' = inconnu : menu ouvert,
// bloc absent, page en cours de rendu — jamais un faux positif.
function villeClubActif(releve) {
  if (!releve || menuEstOuvert(releve)) return '';
  const b = blocClubActif(releve);
  return b ? b.noms[b.noms.length - 1] : '';
}
// L'entrée de liste à cliquer pour ce libellé. Plusieurs éléments imbriqués
// d'une MÊME entrée se CHEVAUCHENT verticalement (à 2 px près, pas au pixel) :
// on garde le plus grand (la ligne entière). Une autre correspondance qui ne
// le chevauche pas = une deuxième entrée = ambiguïté, refusée.
function choisirEntree(releve, libelle) {
  const ok = ((releve && releve.blocs) || []).filter((b) => estEntreeMenu(b) && entreeCorrespond(b.lignes, libelle))
    .sort((a, b) => b.surface - a.surface);
  if (!ok.length) return { erreur: 'Entrée « ' + libelle + ' » absente du sélecteur' };
  const ligne = ok[0];
  const basDe = (b) => (Number.isFinite(b.bas) ? b.bas : b.haut + 1);
  const autre = ok.slice(1).some((b) => b.haut >= basDe(ligne) || basDe(b) <= ligne.haut);
  if (autre) return { erreur: 'Entrée « ' + libelle + ' » présente plusieurs fois dans le sélecteur' };
  return { entree: ligne };
}
async function menuOuvert(page) {
  return menuEstOuvert(await relever(page));
}

// Le nom de club tel que la barre latérale l'affiche (« Marcq-en-Barœul »).
const clubAttendu = (studio) => (CLUBS_FB[studio]
  ? CLUBS_FB[studio].replace('My Coach ', '')
  : ((CLUBS_HORS_RECAP[studio] || {}).ville || ''));
const libelleClub = (cle) => CLUBS_FB[cle] || (CLUBS_HORS_RECAP[cle] || {}).libelle || '';
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
  const libelle = libelleClub(studio);
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
const clubAffiche = async (page) => {
  const releve = await relever(page);
  if (menuEstOuvert(releve)) return '';
  const ville = villeClubActif(releve);
  if (ville) return ville;
  // Repli (écran sans bloc cliquable reconnu) : l'ancienne lecture « My Coach
  // \n <ville> » du texte de page, menu fermé uniquement.
  return lirePage(page, () => {
    if (!document.body) return '';
    const m = (document.body.innerText || '').match(/My Coach\s*\n\s*([^\n]{3,40})/);
    return m ? m[1].trim() : '';
  }, null, '');
};

// ⚠️ Sous ~1000 px de large, Vendor passe en disposition réduite et le
// sélecteur ne s'ouvre pas. Un navigateur sans fenêtre démarre en 800 × 600 :
// on agrandit la fenêtre (CDP) avant toute ouverture du menu.
async function assurerLargeur(page) {
  const w = await lirePage(page, () => window.innerWidth, null, 0);
  if (w >= 1000) return;
  try {
    const cdp = await page.context().newCDPSession(page);
    const { windowId } = await cdp.send('Browser.getWindowForTarget');
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { width: 1600, height: 1000 } });
    await page.waitForTimeout(2000);
  } catch (_) { /* on tente quand même : l'ouverture dira si c'est suffisant */ }
}

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
      await assurerLargeur(page);
      // ⚠️ NI COORDONNÉES FIXES, NI TEXTE « My Coach » : le bloc du club actif
      // est repéré par sa STRUCTURE (voir blocClubActif) et cliqué en son
      // centre réel, quel que soit le club ou son écriture.
      for (let i = 0; i < 4; i++) {
        const releve = await relever(page);
        if (menuEstOuvert(releve)) return;
        const b = blocClubActif(releve);
        if (b) {
          const pos = await lirePage(page, (idx) => {
            const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
            const e = [...document.querySelectorAll('.clickable-element')].filter(vis)[idx];
            if (!e) return null;
            const r = e.getBoundingClientRect();
            return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
          }, b.index, null);
          if (pos) await page.mouse.click(pos.x, pos.y);
        }
        await page.waitForTimeout(2500);
      }
      if (!(await menuOuvert(page))) throw new Error('Sélecteur de club impossible à ouvrir');
    },
    async amenerEntree(libelle) {
      // 1) Trouver L'ENTRÉE (structure + libellé exact neutralisé), puis
      //    défiler LA LISTE (et non la fenêtre) pour la centrer.
      const choix = choisirEntree(await relever(page), libelle);
      if (choix.erreur) throw new Error(choix.erreur);
      const trouve = await lirePage(page, (idx) => {
        const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const cible = [...document.querySelectorAll('.clickable-element')].filter(vis)[idx];
        if (!cible) return false;
        let sc = cible.parentElement;
        while (sc && !(sc.scrollHeight > sc.clientHeight + 1 && /(auto|scroll|hidden)/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
        if (sc) {
          const rs = sc.getBoundingClientRect(), rc = cible.getBoundingClientRect();
          sc.scrollTop += (rc.top - rs.top) - (rs.height - rc.height) / 2;
        }
        return true;
      }, choix.entree.index, false);
      if (!trouve) throw new Error('« ' + libelle + ' » : entrée disparue avant défilement');
      await page.waitForTimeout(800);
      // 2) Re-relever APRÈS défilement (les index visibles peuvent bouger), et
      //    exiger que le pointeur tombe bien sur l'entrée.
      const apres = choisirEntree(await relever(page), libelle);
      if (apres.erreur) throw new Error('« ' + libelle + ' » : entrée disparue après défilement');
      const pos = await lirePage(page, (idx) => {
        const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const cible = [...document.querySelectorAll('.clickable-element')].filter(vis)[idx];
        if (!cible) return { erreur: 'entrée disparue après défilement' };
        const r = cible.getBoundingClientRect();
        const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
        const dessus = document.elementFromPoint(x, y);
        if (!dessus || !cible.contains(dessus)) {
          return { erreur: 'entrée hors de la zone cliquable du menu (recouverte par « ' + ((dessus && dessus.innerText) || '').replace(/\s+/g, ' ').slice(0, 30) + ' »)' };
        }
        return { x, y };
      }, apres.entree.index, { erreur: 'page en cours de rechargement' });
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

// ── IDENTIFIANTS VENDOR (Bubble) ───────────────────────────────────────────
//  Un identifiant d'objet Bubble : « 1676534557603x269706782936696800 ». Dans
//  les données, une référence vers un autre objet arrive souvent préfixée
//  (« 1348695171700984260__LOOKUP__1676534557603x… ») : seul le dernier segment
//  est l'identifiant. Tout ce qui n'a pas cette forme rend '' — un identifiant
//  douteux n'est jamais « à peu près » celui de quelqu'un.
const RE_ID_BUBBLE = /^\d{10,16}x\d{10,24}$/;
function idBubble(v) {
  const id = String(v == null ? '' : v).split('__LOOKUP__').pop().trim();
  return RE_ID_BUBBLE.test(id) ? id : '';
}

// ── LE COMMERCIAL D'UN CONTRAT, PAR SON IDENTIFIANT (pure, testable) ───────
//  Chaque ligne du panneau « CONTRATS SOUSCRITS » est, pour Vendor, l'affichage
//  d'une vente (custom.commerciaux_vente). L'écran n'en montre que le nom du
//  commercial (« Fabian F. ») ; la vente, elle, porte son identifiant
//  (`commercial_user`). On lit donc, LIGNE PAR LIGNE, l'objet que Vendor a
//  lié à la cellule — jamais un rapprochement par nom.
//
//  `liaisons[i]` = { texte, type, venteId, commercialId } relevés sur la MÊME
//  ligne du groupe répétitif. Garde-fous, ligne par ligne :
//   · même nombre de liaisons que de lignes lues, sinon aucune n'est retenue ;
//   · le texte relu doit redonner la même identité et la même date (l'ordre des
//     lignes n'a pas bougé entre deux lectures) ;
//   · l'objet doit être une vente, avec des identifiants bien formés ;
//   · une même vente ne peut pas servir deux lignes.
//  Une ligne qui échoue garde son nom affiché et un `commercialId` VIDE : elle
//  est comptée dans `manquants`, jamais complétée « d'après le nom ».
function lierCommerciaux(lignes, liaisons) {
  const ok = Array.isArray(liaisons) && Array.isArray(lignes) && liaisons.length === lignes.length;
  const vues = new Set();
  let manquants = 0, sansCommercial = 0;
  const ids = (lignes || []).map((l, i) => {
    const li = ok ? liaisons[i] : null;
    const relu = li ? analyserLigne(li.texte) : null;
    const venteId = li ? idBubble(li.venteId) : '';
    const commercialId = li ? idBubble(li.commercialId) : '';
    // Le CONTACT de la vente (sportif_custom_sportif) : sert aux VNI, pour relier
    // une signature à la personne venue en rendez-vous — jamais par le nom.
    const contactId = li ? idBubble(li.contactId) : '';
    const lie = !!li && li.type === 'custom.commerciaux_vente' && !!venteId
      && relu.identite === l.identite && relu.date === l.date && !vues.has(venteId);
    if (!lie) { manquants += 1; return { venteId: '', commercialId: '', contactId: '' }; }
    vues.add(venteId);
    // Vente bien liée mais SANS commercial dans Vendor (« Pas de commercial ») :
    // l'identifiant vide est alors la vérité, pas une lecture ratée.
    if (!commercialId) {
      if (String(li.commercialId || '').trim()) { manquants += 1; return { venteId, commercialId: '', contactId }; }
      sansCommercial += 1;
    }
    return { venteId, commercialId, contactId };
  });
  return { ids, manquants, sansCommercial, sansContact: ids.filter((x) => x.venteId && !x.contactId).length };
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

  // L'IDENTIFIANT VENDOR DU COMMERCIAL, ligne par ligne (voir lierCommerciaux).
  //  Lecture de l'objet que Bubble a lié à chaque cellule. Un échec ici ne
  //  touche ni le compteur, ni les KPI : l'identifiant reste vide et c'est dit.
  const liaisons = await page.evaluate((n) => {
    const rgs = [...document.querySelectorAll('.bubble-element.RepeatingGroup')];
    const rg = rgs.find((e) => e.children.length === n);
    if (!rg) return null;
    return [...rg.children].map((ch) => {
      const r = { texte: ch.innerText || '', type: '', venteId: '', commercialId: '', contactId: '' };
      try {
        const inst = ch.bubble_data && ch.bubble_data.bubble_instance;
        let v = inst && inst.state('group_data');
        if (typeof v === 'function') v = v();
        const raw = v && typeof v.raw === 'function' ? v.raw() : null;
        if (raw) {
          r.type = String(raw._type || '');
          r.venteId = String(raw._id || '');
          r.commercialId = String(raw.commercial_user || '');
          r.contactId = String(raw.sportif_custom_sportif || '');
        }
      } catch (_) { /* liaison illisible : identifiant vide */ }
      return r;
    });
  }, compteur).catch(() => null);
  const lies = lierCommerciaux(lignes, liaisons);
  if (lies.manquants) {
    journal('⚠️ ' + studio + ' : identifiant Vendor du commercial illisible sur ' + lies.manquants + '/' + compteur + ' contrat(s) — nom affiché conservé, aucun rapprochement par nom');
  }
  if (lies.sansCommercial) journal(studio + ' : ' + lies.sansCommercial + ' vente(s) sans commercial dans Vendor');

  const contrats = lignes.map((l, i) => ({
    identite: l.identite, prestation: l.prestation, source: l.source,
    date: l.date, commercial: l.commercial, commercialId: lies.ids[i].commercialId, venteId: lies.ids[i].venteId,
    contactId: lies.ids[i].contactId || '',
    annulee: l.annulee, dateAnnulation: l.dateAnnulation,
  }));
  const annulees = contrats.filter((c) => c.annulee).length;
  journal(studio + ' : ' + compteur + ' contrat(s) souscrit(s), dont ' + annulees + ' annulé(s) — période ' + periodeDetail.du + ' → ' + periodeDetail.au
    + ' · identifiant commercial lu sur ' + (compteur - lies.manquants - lies.sansCommercial) + '/' + compteur
    + (lies.sansCommercial ? ' (+' + lies.sansCommercial + ' sans commercial)' : ''));

  await fermerPanneau(page);
  if (lies.sansContact) journal('⚠️ ' + studio + ' : identifiant du contact illisible sur ' + lies.sansContact + '/' + compteur + ' contrat(s) — non utilisé(s) pour les VNI');
  return { studio, club, mois: ym, compteur, contrats, annulees, periodeDetail, commerciauxSansId: lies.manquants, contratsSansContact: lies.sansContact };
}

module.exports = {
  lireStudio, analyserLigne, lierCommerciaux, idBubble, fermerPanneau, choisirClub, basculerClub, verifierClub, clubAttendu,
  CLUBS_FB, CLUBS_HORS_RECAP, TENTATIVES_BASCULE, decalageMois, urlStats, MOIS_FR2, norm,
  // Sélecteur de club, lecture pure (tests) et lecture du club actif (vérification).
  lignesClub, entreeCorrespond, menuEstOuvert, blocClubActif, villeClubActif, choisirEntree, clubAffiche, libelleClub,
};
