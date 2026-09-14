'use strict';
// ============================================================================
//  FICHE DECIPLUS D'UN « À VÉRIFIER » — trouvée, mais sans vente saisie.
//
//  LE CAS DU 2026-09-14. Esther JHUREEA (Wasquehal) signe le 24/08. Aucune vente
//  à son nom dans le journal des ventes de juillet, août ni septembre — la vente
//  n'a jamais été saisie. Sa FICHE, elle, existe (idj 42350). RECAP 2 ne
//  connaissait un Id_client que par le journal des ventes : il n'avait donc
//  aucun moyen d'ouvrir sa fiche.
//
//  CE QU'ON FAIT : pour un « à vérifier » sans piste de vente, on cherche la
//  fiche avec la RECHERCHE MEMBRES de Deciplus — exactement l'appel que fait
//  l'écran Membres quand on tape un nom (`ajax_find.php`). Lecture seule.
//  Le résultat : « À vérifier — fiche trouvée, aucune vente saisie », avec un
//  accès direct à la fiche. Le statut NE CHANGE PAS, aucun KPI ne bouge, et il
//  n'y a rien à confirmer : trouver la fiche ne prouve pas que la vente existe.
//
//  ⚠️ JAMAIS LA FICHE DE QUELQU'UN D'AUTRE. On ne retient une fiche que si
//  l'identité correspond EXACTEMENT (accents, casse, tirets et ordre des mots
//  neutralisés — pas de ressemblance) et SANS AMBIGUÏTÉ : une seule fiche,
//  ou une seule dans le studio de la vente. Deux homonymes au même endroit :
//  on ne propose rien.
//
//  ⚠️ Données relevées : l'id, « NOM Prénom » et le club. Rien d'autre — la
//  réponse Deciplus porte aussi une date de naissance, qui n'est jamais gardée.
//
//  Pourquoi pas un lien de recherche prérempli ? Vérifié le 2026-09-14 : l'écran
//  Membres (select.php) ignore tout paramètre d'URL — la recherche est lancée en
//  JavaScript depuis les champs saisis. Aucun lien ne peut la préremplir.
// ============================================================================

const { cleIdentite } = require('../../lib/recap2Matches.js');

const URL_MEMBRES = 'https://ginkgo-sport.deciplus.pro/nextgen/legacy?path=select.php';

// Les NOMS à interroger pour une identité Fitness Booster. On ne sait pas où
// finit le prénom (« Esther Jhureea » mais « Decuzzi Sara », « Shermila Paz
// Guevonoux ») : on essaie chaque découpage, en tête et en queue. La recherche
// Deciplus sur le nom est « commence par », le filtre exact se fait ensuite.
function nomsARechercher(identite) {
  const mots = String(identite || '').trim().split(/\s+/).filter(Boolean);
  if (mots.length < 2) return mots.length ? [mots[0]] : [];
  const out = [];
  for (let k = 1; k < mots.length; k++) {
    out.push(mots.slice(k).join(' '));   // « Prénom | Nom »
    out.push(mots.slice(0, k).join(' ')); // « Nom | Prénom »
  }
  return [...new Set(out)];
}

// Choisit LA fiche, ou rien.
//  joueurs : entrées Deciplus { idj, nom, prenom, nom_zone }
function choisirFiche(identite, joueurs, studio, studioLabel) {
  const cle = cleIdentite(identite);
  if (!cle) return null;
  const vus = new Map();
  (joueurs || []).forEach((j) => {
    if (!j || !/^[0-9]{1,20}$/.test(String(j.idj || ''))) return;
    if (cleIdentite((j.nom || '') + ' ' + (j.prenom || '')) !== cle) return;
    vus.set(String(j.idj), j);
  });
  const exacts = [...vus.values()];
  let retenu = null;
  if (exacts.length === 1) retenu = exacts[0];
  else if (exacts.length > 1 && studioLabel) {
    const ici = exacts.filter((j) => studioLabel(j.nom_zone) === studio);
    if (ici.length === 1) retenu = ici[0];
  }
  if (!retenu) return null;
  return {
    idClient: String(retenu.idj),
    nom: ((retenu.nom || '') + ' ' + (retenu.prenom || '')).trim(),
    site: String(retenu.nom_zone || ''),
  };
}

// ── LE NAVIGATEUR ─────────────────────────────────────────────────────────
//  Ouvre l'écran Membres dans un ONGLET À PART (la page d'export n'est pas
//  dérangée) et rend une fonction de recherche. `garde` = garde-fou d'URL de
//  lib/deciplus.js : aucune adresse interdite ne peut être visitée.
async function ouvrirRecherche(contexte, garde) {
  garde(URL_MEMBRES);
  const page = await contexte.newPage();
  await page.goto(URL_MEMBRES, { waitUntil: 'domcontentloaded' });
  let frame = null;
  for (let i = 0; i < 25 && !frame; i++) {
    frame = page.frames().find((f) => /\/select\.php\?_vue_iframe/.test(f.url()));
    if (!frame) await page.waitForTimeout(1000);
  }
  if (!frame) { await page.close().catch(() => {}); throw new Error('écran Membres Deciplus introuvable'); }

  async function interroger(nom) {
    const q = new URLSearchParams({ nom, prenom: '', jcode: '', tel: '', jcrit5: '', entreprise: '', email: '' });
    garde('https://ginkgo-sport.deciplus.pro/ajax_find.php?' + q.toString());
    return frame.evaluate(async (qs) => {
      const r = await fetch('/ajax_find.php?' + qs, { credentials: 'include' });
      if (!r.ok) throw new Error('recherche Membres : HTTP ' + r.status);
      const j = JSON.parse(await r.text());
      // On ne remonte QUE ce qui sert au choix : id, nom, prénom, club.
      return (j.joueurs || []).map((x) => ({ idj: x.idj, nom: x.nom, prenom: x.prenom, nom_zone: x.nom_zone }));
    }, q.toString());
  }

  async function chercher(identite, studio, studioLabel) {
    const joueurs = [];
    for (const nom of nomsARechercher(identite)) {
      if (nom.length < 2) continue;
      (await interroger(nom)).forEach((x) => joueurs.push(x));
    }
    return choisirFiche(identite, joueurs, studio, studioLabel);
  }

  return { chercher, fermer: () => page.close().catch(() => {}) };
}

module.exports = { URL_MEMBRES, nomsARechercher, choisirFiche, ouvrirRecherche };
