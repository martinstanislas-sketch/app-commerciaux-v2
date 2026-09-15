'use strict';
// ============================================================================
//  FITNESS BOOSTER (Vendor) — PRISES DE RÉFÉRENCE d'un mois, par studio.
//
//  CE QUE VENDOR APPELLE « PRISE DE RÉFÉRENCE » (diagnostic du 2026-09-14, écran
//  et données identiques à 100 % sur août 2026, 6 studios, 13 sources) :
//    un contact (custom.sportif) du club, CRÉÉ pendant le mois, dont la source
//    est la source DU CLUB nommée exactement « Prise de référence ».
//  C'est la ligne « Prise de référence » du tableau « Sources des sportifs »,
//  page Statistiques → « Revenir aux anciennes performances » (/sales-stats).
//  Chaque club a SA source (un objet par club) : on n'en retient jamais une
//  autre, même homonyme.
//
//  ⚠️ CE QUI N'EN EST PAS : la source système « Parrainage » (ligne distincte
//  du même tableau), et le « dont N parrainage(s) » (des VENTES cochées « avec
//  parrainage »). Reproduire l'indicateur Vendor, c'est ne compter QUE sa ligne.
//
//  QUI : l'AUTEUR DE LA SAISIE (`Created By`), par son identifiant Vendor. Le
//  commercial attribué au contact peut changer ensuite : l'historique, lui, ne
//  doit pas être réécrit.
//
//  D'OÙ VIENNENT LES DONNÉES : de la session Vendor authentifiée, et d'elle
//  seule — les réponses que Vendor envoie à l'écran /sales-stats. Aucune
//  requête fabriquée, aucune API publique.
//
//  LECTURE SEULE : choix de la période dans les deux calendriers (un filtre
//  d'affichage). Aucun bouton d'action, aucune saisie, aucun export.
//
//  ⚠️ CONTRÔLES NON NÉGOCIABLES, avant de publier un chiffre (voir controler) :
//   1. club et période affichés = ceux demandés ;
//   2. exhaustivité : contacts du mois reçus = tuile « Contacts » de l'écran ;
//   3. les contacts reçus sont tous du club ;
//   4. références retenues = cellule « Prise de référence » affichée (0 si la
//      ligne est absente) ;
//   5. chaque auteur a un identifiant Vendor valable.
//  Un contrôle en échec = pas de chiffre pour CE studio. Les KPI n'en dépendent pas.
// ============================================================================

const { idBubble } = require('./booster.js');

const SOURCE_REFERENCE = 'Prise de référence';
const URL_ANCIENNES = 'https://app.fitness-booster.fr/sales-stats';

// Libellés du sélecteur de club de /sales-stats (≠ barre latérale de l'app).
const CLUBS_STATS = {
  Lille: 'My Coach - Lille',
  Wasquehal: 'My Coach - Wasquehal',
  Marcq: 'My Coach - Marcq-en-Barœul',
  Boulogne: 'My Coach - Boulogne-Billancourt',
  Levallois: 'My Coach - Levallois-Perret',
  Neuilly: 'My Coach - Neuilly-sur-Seine',
};

const espaces = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
// Le nom de source EXACT de Vendor : seuls les espaces sont neutralisés.
const estSourceReference = (nom) => espaces(nom) === SOURCE_REFERENCE;

// « Marvin B. » : prénom + initiale, comme Vendor l'affiche sur les contrats.
// Sert à l'AFFICHAGE uniquement ; la clé reste l'identifiant.
function nomCommercial(u) {
  if (!u) return '';
  const prenom = espaces(u.prenom);
  const nom = espaces(u.nom);
  return (prenom + (nom ? ' ' + nom[0].toUpperCase() + '.' : '')).trim();
}

// « 2026-08 » -> bornes [début, fin[ en heure LOCALE (celle de l'écran Vendor).
function bornesMois(ym) {
  const [a, m] = String(ym).split('-').map(Number);
  return { debut: new Date(a, m - 1, 1).getTime(), fin: new Date(a, m, 1).getTime() };
}
const dateFr = (ms) => {
  const d = new Date(ms);
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
};
// « 01/08/26 » attendu dans les calendriers pour un mois donné.
function periodeAttendue(ym) {
  const [a, m] = String(ym).split('-').map(Number);
  const dernier = new Date(a, m, 0).getDate();
  const mm = String(m).padStart(2, '0'), aa = String(a).slice(2);
  return ['01/' + mm + '/' + aa, String(dernier).padStart(2, '0') + '/' + mm + '/' + aa];
}

// ── Les libellés du tableau lus à l'écran ──────────────────────────────────
//  Une case voisine alignée sur la même hauteur peut coller son texte devant
//  le nom de la source (« Ventes annulées Prise de référence »). On rattache
//  chaque libellé au nom de source CONNU qui le termine, le plus long d'abord.
function rattacherLibelles(lignesEcran, nomsConnus) {
  const noms = [...new Set((nomsConnus || []).map(espaces).filter(Boolean))].sort((a, b) => b.length - a.length);
  const out = new Map();
  (lignesEcran || []).forEach((l) => {
    const lib = espaces(l.source);
    const nom = noms.find((n) => lib === n || lib.endsWith(' ' + n)) || lib;
    const e = out.get(nom) || { source: nom, contacts: 0, visiteurs: 0, clients: 0 };
    e.contacts += Number(l.contacts) || 0;
    e.visiteurs += Number(l.visiteurs) || 0;
    e.clients += Number(l.clients) || 0;
    out.set(nom, e);
  });
  return [...out.values()];
}

// ── Le cœur : quels contacts sont des prises de référence (pure) ───────────
//  contacts : [{ id, club, source, creeLe (ms), createur, client, statut }]
//  sources  : { id: { nom, club } }   users : { id: { prenom, nom } }
//  statuts  : { valeurBrute: libellé }
function retenirReferences({ contacts, sources, users, statuts, clubId, ym }) {
  const { debut, fin } = bornesMois(ym);
  const src = sources || {};
  const duMois = (contacts || []).filter((c) => c.creeLe >= debut && c.creeLe < fin);
  const retenues = duMois
    .filter((c) => {
      const s = src[idBubble(c.source)];
      return !!s && estSourceReference(s.nom) && idBubble(s.club) === clubId && idBubble(c.club) === clubId;
    })
    .sort((a, b) => a.creeLe - b.creeLe || String(a.id).localeCompare(String(b.id)))
    .map((c) => {
      const createurId = idBubble(c.createur);
      return {
        contactId: idBubble(c.id),
        client: espaces(c.client),
        date: dateFr(c.creeLe),
        createurId,
        createur: nomCommercial((users || {})[createurId]),
        statut: (statuts || {})[c.statut] || espaces(c.statut),
      };
    });
  const parSource = new Map();
  duMois.forEach((c) => {
    const s = src[idBubble(c.source)];
    const nom = s ? espaces(s.nom) : (idBubble(c.source) ? '(source non chargée)' : '(aucune source)');
    parSource.set(nom, (parSource.get(nom) || 0) + 1);
  });
  return {
    retenues,
    contactsDuMois: duMois.length,
    clubs: [...new Set(duMois.map((c) => idBubble(c.club)))],
    parSource: Object.fromEntries(parSource),
  };
}

// ── Les contrôles (pure) ───────────────────────────────────────────────────
function controler({ clubAffiche, clubAttendu, periodeAffichee, ym, tuileContacts, calcul, lignesEcran, clubId }) {
  const pb = [];
  if (espaces(clubAffiche) !== espaces(clubAttendu)) pb.push('club affiché « ' + (clubAffiche || '—') + ' » ≠ attendu « ' + clubAttendu + ' »');
  const att = periodeAttendue(ym);
  if (!Array.isArray(periodeAffichee) || periodeAffichee[0] !== att[0] || periodeAffichee[1] !== att[1]) {
    pb.push('période affichée ' + (periodeAffichee || []).join(' → ') + ' ≠ ' + att.join(' → '));
  }
  if (!clubId) pb.push('identifiant du club introuvable');
  if (typeof tuileContacts !== 'number') pb.push('tuile « Contacts » illisible');
  else if (calcul.contactsDuMois !== tuileContacts) {
    pb.push('exhaustivité : ' + calcul.contactsDuMois + ' contact(s) du mois reçus pour ' + tuileContacts + ' affiché(s)');
  }
  if (calcul.clubs.some((c) => c !== clubId)) pb.push('des contacts d\'un autre club ont été reçus');
  const noms = Object.keys(calcul.parSource);
  const ligne = rattacherLibelles(lignesEcran, noms.concat([SOURCE_REFERENCE])).find((l) => l.source === SOURCE_REFERENCE);
  const affiche = ligne ? ligne.contacts : 0;
  if (affiche !== calcul.retenues.length) {
    pb.push('« ' + SOURCE_REFERENCE + ' » : ' + calcul.retenues.length + ' retenue(s) pour ' + affiche + ' affichée(s) par Vendor');
  }
  const sansAuteur = calcul.retenues.filter((r) => !r.createurId).length;
  if (sansAuteur) pb.push(sansAuteur + ' prise(s) de référence sans identifiant Vendor d\'auteur');
  return { ok: pb.length === 0, problemes: pb, affiche };
}

// ── Lecture d'un studio (navigateur) ───────────────────────────────────────
//  Le club est déjà actif (collecte des contrats juste avant) : on le VÉRIFIE
//  sur /sales-stats, on ne le change pas.
//  ⚠️ DANS UN ONGLET DÉDIÉ, ouvert puis refermé. /sales-stats est une autre
//  application Bubble : y naviguer puis revenir dans l'onglet des contrats fait
//  perdre la page au pilote (« Target page closed », constaté le 2026-09-14),
//  et tous les studios suivants tombaient. L'onglet des contrats n'est plus touché.
async function lireReferences(contexte, studio, ym, { journal = () => {} } = {}) {
  const clubAttendu = CLUBS_STATS[studio];
  if (!clubAttendu) throw new Error('Studio inconnu : ' + studio);
  const contacts = new Map(), users = {}, sources = {};
  let capter = true;
  const surReponse = async (r) => {
    if (!capter || !/\/elasticsearch\//.test(r.url())) return;
    let j; try { j = JSON.parse(await r.text()); } catch (_) { return; }
    const w = (o) => {
      if (!o || typeof o !== 'object') return;
      const s = o._source || o;
      if (o._type === 'custom.sportif' && o._id) {
        contacts.set(o._id, { id: o._id, club: s.club_custom_club, source: s.source_custom_sportif_source, creeLe: s['Created Date'],
          createur: s['Created By'], client: s.nom_complet_text || ((s.prenom_text || '') + ' ' + (s.nom_text || '')), statut: s.statut_defaut_option_statuts_defaut || '' });
      } else if (o._type === 'user' && o._id) users[o._id] = { prenom: s.prenom_text || '', nom: s.nom_text || '' };
      else if (o._type === 'custom.sportif_source' && o._id) sources[o._id] = { nom: s.source_text || '', club: s.club_custom_club };
      Object.values(o).forEach(w);
    };
    w(j);
  };
  const page = await contexte.newPage();
  page.on('response', surReponse);
  try {
    await page.goto(URL_ANCIENNES, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const sel = page.locator('select').first();
    await sel.waitFor({ timeout: 30000 });
    await page.waitForTimeout(8000);
    const clubAffiche = await sel.evaluate((e) => (e.options[e.selectedIndex] || {}).text || '');
    if (espaces(clubAffiche) !== espaces(clubAttendu)) {
      throw new Error('club affiché « ' + clubAffiche + ' » ≠ attendu « ' + clubAttendu + ' » sur ' + URL_ANCIENNES);
    }
    contacts.clear(); // seules les réponses de la bonne période comptent
    // Les deux calendriers : de VRAIS clics (un réglage par script n'est pas
    // pris en compte par Vendor — constaté le 2026-09-14).
    const champs = [];
    for (let i = 0; i < await page.locator('input').count(); i++) {
      const el = page.locator('input').nth(i);
      if (/^\d{2}\/\d{2}\/\d{2}$/.test(await el.inputValue().catch(() => '')) && await el.isVisible()) champs.push(await el.getAttribute('id'));
    }
    if (champs.length < 2) throw new Error('calendriers de période introuvables');
    const [a, m] = ym.split('-').map(Number);
    const jours = [new Date(a, m - 1, 1), new Date(a, m, 0)];
    for (let k = 0; k < 2; k++) {
      await page.locator('#' + champs[k]).click({ force: true });
      await page.waitForTimeout(1200);
      const root = page.locator('#' + champs[k] + '_root');
      await root.locator('select.picker__select--year').selectOption(String(a)).catch(() => {});
      await root.locator('select.picker__select--month').selectOption(String(m - 1)).catch(() => {});
      await page.waitForTimeout(800);
      await root.locator('[data-pick="' + jours[k].getTime() + '"]').first().click({ timeout: 10000 });
      await page.waitForTimeout(2500);
      await page.keyboard.press('Escape').catch(() => {});
    }
    await page.mouse.click(1400, 700).catch(() => {});
    // ATTENTE ACTIVE : la tuile « Contacts » et les contacts reçus doivent se
    // stabiliser (même valeur deux lectures de suite).
    const lireEcran = () => page.evaluate(() => {
      const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const vis = (x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const e = [...document.querySelectorAll('div')].find((x) => x.children.length === 0 && n(x.innerText) === 'Contacts');
      let tuile = null;
      for (let p = e, k = 0; p && k < 4; k++) { p = p.parentElement; const mm = n(p && p.innerText).match(/^Contacts (\d+)/); if (mm) { tuile = +mm[1]; break; } }
      const ins = [...document.querySelectorAll('input')].filter((i) => vis(i) && !/picker__input/.test(i.className));
      const groupes = new Map();
      ins.forEach((i) => { const r = i.getBoundingClientRect(); const y = Math.round((r.top + r.height / 2 + window.scrollY) / 4); if (!groupes.has(y)) groupes.set(y, []); groupes.get(y).push(i); });
      const feuilles = [...document.querySelectorAll('div')].filter((x) => x.children.length === 0 && vis(x) && n(x.innerText));
      const lignes = [];
      for (const [y, g] of groupes) {
        if (g.length !== 3) continue;
        g.sort((u, v) => u.getBoundingClientRect().left - v.getBoundingClientRect().left);
        const x0 = g[0].getBoundingClientRect().left;
        const lib = feuilles.filter((f) => { const r = f.getBoundingClientRect(); return Math.abs(Math.round((r.top + r.height / 2 + window.scrollY) / 4) - y) <= 1 && r.right <= x0 + 2; }).map((f) => n(f.innerText));
        lignes.push({ source: lib.join(' '), contacts: +g[0].value, visiteurs: +g[1].value, clients: +g[2].value });
      }
      const periode = [...document.querySelectorAll('input')].filter((i) => /picker__input/.test(i.className) && vis(i) && /^\d{2}\/\d{2}\/\d{2}$/.test(i.value)).map((i) => i.value);
      // Libellés des statuts, depuis la définition de Vendor (jamais figés ici).
      const statuts = {};
      try { Object.entries(window.app.option_sets.statuts_defaut.values).forEach(([k, v]) => { statuts[v.db_value || k] = v['%d']; }); } catch (_) { /* libellé brut */ }
      return { tuile, lignes, periode, statuts };
    });
    const { debut, fin } = bornesMois(ym);
    const duMois = () => [...contacts.values()].filter((c) => c.creeLe >= debut && c.creeLe < fin).length;
    let ecran = null, stable = 0, prec = '';
    for (let i = 0; i < 40 && stable < 2; i++) {
      await page.waitForTimeout(1500);
      ecran = await lireEcran();
      const cle = ecran.tuile + '|' + duMois() + '|' + ecran.periode.join();
      stable = (ecran.tuile != null && ecran.tuile === duMois() && cle === prec) ? stable + 1 : 0;
      prec = cle;
    }
    capter = false;
    const clubIds = [...new Set([...contacts.values()].filter((c) => c.creeLe >= debut && c.creeLe < fin).map((c) => idBubble(c.club)))];
    const clubId = clubIds.length === 1 ? clubIds[0] : '';
    const calcul = retenirReferences({ contacts: [...contacts.values()], sources, users, statuts: ecran.statuts, clubId, ym });
    const verdict = controler({ clubAffiche, clubAttendu, periodeAffichee: ecran.periode, ym, tuileContacts: ecran.tuile, calcul, lignesEcran: ecran.lignes, clubId });
    journal(studio + ' : ' + calcul.retenues.length + ' prise(s) de référence (Vendor affiche ' + verdict.affiche + ') · '
      + calcul.contactsDuMois + '/' + ecran.tuile + ' contacts du mois' + (verdict.ok ? '' : ' — ⚠️ ' + verdict.problemes.join(' ; ')));
    return {
      studio, club: clubAffiche, mois: ym, ok: verdict.ok, problemes: verdict.problemes,
      total: calcul.retenues.length, affiche: verdict.affiche, tuileContacts: ecran.tuile, contactsDuMois: calcul.contactsDuMois,
      liste: calcul.retenues,
    };
  } finally {
    capter = false;
    page.off('response', surReponse);
    await page.close().catch(() => {});
  }
}

module.exports = {
  lireReferences, retenirReferences, controler, rattacherLibelles, estSourceReference, nomCommercial,
  bornesMois, periodeAttendue, SOURCE_REFERENCE, CLUBS_STATS, URL_ANCIENNES,
};
