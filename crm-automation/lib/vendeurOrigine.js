'use strict';
// ============================================================================
//  RECAP 2 — LE VENDEUR D'ORIGINE D'UN CLIENT NON RECONDUIT.
//
//  PUR : aucune I/O. On lui passe les lignes déjà parsées des journaux des
//  ventes Deciplus (lib/csvVentes.js), il rend, pour un Id_client, la PREMIÈRE
//  vente connue portant un vendeur.
//
//  ⚠️ UN SEUL LIEN : l'Id_client. La ligne de non-reconduction porte l'Id membre
//  Deciplus (journal des encaissements), le journal des ventes porte le même
//  Id_client sur chaque vente. Aucun nom de client n'intervient, nulle part.
//
//  RÈGLE (validée par Stan le 2026-09-15) :
//    · on lit l'historique des ventes collecté (24 mois glissants) ;
//    · on ne garde que les ventes dont la colonne « Vendeur » est renseignée
//      (≈ 90 % des lignes n'en ont pas : échéances, reconductions) ;
//    · la vente de référence est la PLUS ANCIENNE de ces ventes — la signature
//      d'origine connue ;
//    · si ce jour-là plusieurs vendeurs DIFFÉRENTS apparaissent, on ne choisit
//      pas : « ambigu », donc personne d'attribué.
//  Ce module rend le vendeur Deciplus BRUT. Le passage vendeur Deciplus ->
//  commercial RECAP 2 se fait ailleurs, par une table explicite
//  (Recap2Metrics.VENDEURS_DECIPLUS) — jamais ici, jamais par ressemblance.
// ============================================================================

const ID_RE = /^[0-9]{1,20}$/;

// « JJ/MM/AAAA » -> « AAAA-MM-JJ » (comparable), sinon ''.
function iso(dateFr) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(String(dateFr || '').trim());
  return m ? m[3] + '-' + m[2] + '-' + m[1] : '';
}

// Les `n` mois qui finissent à `mois` inclus, du plus ancien au plus récent.
function moisGlissants(mois, n) {
  const [a, m] = String(mois).split('-').map(Number);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(a, m - 1 - i, 1));
    out.push(d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'));
  }
  return out;
}

// Id_client -> { date: 'AAAA-MM-JJ', lignes: [...] } : les ventes à vendeur du
// jour le plus ancien. Les lignes sans Id_client plausible ou sans vendeur sont
// ignorées.
function indexer(lignes) {
  const index = new Map();
  (lignes || []).forEach((l) => {
    const id = String((l && l.idClient) || '').trim();
    const vendeur = String((l && l.vendeur) || '').trim();
    const d = iso(l && l.date);
    if (!ID_RE.test(id) || !vendeur || !d) return;
    const cur = index.get(id);
    if (!cur || d < cur.date) index.set(id, { date: d, lignes: [l] });
    else if (d === cur.date) cur.lignes.push(l);
  });
  return index;
}

// Le vendeur d'origine d'un Id_client :
//   { vendeur, date, numVente, prestation, site }   — une vente, un vendeur ;
//   { ambigu: true, vendeurs: [...], date }          — plusieurs vendeurs ce jour-là ;
//   { introuvable: true }                             — aucune vente à vendeur dans l'historique.
function origineDe(index, idClient) {
  const id = String(idClient || '').trim();
  const e = ID_RE.test(id) && index.get(id);
  if (!e) return { introuvable: true };
  const vendeurs = [...new Set(e.lignes.map((l) => String(l.vendeur).trim()))];
  const dateFr = e.lignes[0].date.slice(0, 10);
  if (vendeurs.length > 1) return { ambigu: true, vendeurs: vendeurs.slice(0, 5), date: dateFr };
  // Plusieurs lignes du même vendeur le même jour (pack + contrat + matériel) :
  // la plus petite n° de vente, pour une référence stable d'une collecte à l'autre.
  const l = e.lignes.slice().sort((x, y) => String(x.numVente).localeCompare(String(y.numVente), 'fr', { numeric: true }))[0];
  return { vendeur: vendeurs[0], date: dateFr, numVente: String(l.numVente || ''), prestation: String(l.prestation || ''), site: String(l.site || '') };
}

// Pose `vendeurOrigine` sur chaque non-reconduit du rapport qui a un Id_client,
// et la trace de l'historique lu dans `source.deciplus_ventes_historique`.
// ⚠️ Ne touche à AUCUN autre champ : ni compteur, ni taux, ni liste.
function poser(rapport, index, historique) {
  if (!rapport || !rapport.studios) return rapport;
  Object.keys(rapport.studios).forEach((s) => {
    const nr = rapport.studios[s] && rapport.studios[s].nonReconduction;
    if (!nr || !Array.isArray(nr.liste)) return;
    nr.liste.forEach((l) => {
      if (ID_RE.test(String(l.idClient || ''))) l.vendeurOrigine = origineDe(index, l.idClient);
    });
  });
  rapport.source = rapport.source || {};
  rapport.source.deciplus_ventes_historique = Object.assign({ regle: 'premiere_vente_avec_vendeur' }, historique || {});
  return rapport;
}

module.exports = { iso, moisGlissants, indexer, origineDe, poser, ID_RE };
