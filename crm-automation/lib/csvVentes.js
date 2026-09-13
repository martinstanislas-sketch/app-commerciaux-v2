'use strict';
// ============================================================================
//  PARSEUR du CSV « Journal des ventes » de Deciplus (vue history=sales).
//
//  PUR : aucune I/O, aucun navigateur. On lui passe le TEXTE du fichier, il rend
//  des lignes exploitables + les contrôles de conformité.
//
//  ⚠️ POURQUOI CE FICHIER EXISTE — et pourquoi le journal des ENCAISSEMENTS ne
//  pouvait pas faire ce travail.
//
//  Le journal des encaissements est un journal de PAIEMENTS : une ligne = un
//  euro qui bouge. Une vente signée le 29/08 dont la première échéance tombe en
//  septembre n'y a AUCUNE ligne. En déduire « ce client n'est pas dans le CRM »
//  serait faux : il y est, il n'a simplement pas encore payé.
//
//  Constaté sur août 2026 : sur 14 signataires Fitness Booster réputés « non
//  payés », 11 avaient bel et bien leur vente enregistrée dans Deciplus.
//
//  Le journal des VENTES, lui, liste ce qui a été VENDU, encaissé ou non — la
//  colonne « Info » porte d'ailleurs « Paiement différé » sur les ventes à
//  0,00 €. C'est donc la seule source qui prouve la présence CRM sans la
//  confondre avec un paiement.
//
//  Même structure de rapport que son jumeau :
//    L1        « ;;;;JOURNAL DES VENTES DU;AAAA-MM-JJ;AU;AAAA-MM-JJ » (tabulé)
//    L3        « Total des ventes;190555,75 »
//    L6..      récap par taux de TVA
//    puis      la ligne d'en-têtes du DÉTAIL, en « ; » avec guillemets.
//  UTF-8 AVEC BOM, fins de ligne mélangées CRLF/LF.
// ============================================================================

const { decouper, montant } = require('./csvEncaissements.js');

// Colonnes attendues dans le détail. On vérifie leur présence, pas leur ordre.
const COLONNES_REQUISES = ['Num. vente', 'Date de vente', 'Adhérent', 'Prestation', 'Site', 'Id_client'];

// « JJ/MM/AAAA » -> « AAAA-MM ».
function moisDe(dateFr) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(String(dateFr || '').trim());
  return m ? m[3] + '-' + m[2] : null;
}

// L'en-tête porte la période RÉELLEMENT exportée : c'est le contrôle que le
// filtre a bien été appliqué, et non laissé sur « aujourd'hui ».
function lirePeriode(texte) {
  const m = /JOURNAL DES VENTES DU;(\d{4}-\d{2}-\d{2});AU;(\d{4}-\d{2}-\d{2})/i.exec(texte);
  return m ? { du: m[1], au: m[2] } : null;
}

// Parse complet. Renvoie { periode, colonnes, lignes, totalAnnonce }.
// `lignes` : { numVente, date, mois, adherent, prestation, vendeur, info, site, idClient, ttc }
function parser(texte) {
  const txt = String(texte || '').replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const brutes = txt.split('\n');
  const periode = lirePeriode(txt);

  const iEntete = brutes.findIndex((l) => /^"?Num\. vente"?\s*;/.test(l) && /Date de vente/.test(l));
  if (iEntete < 0) throw new Error('En-têtes du détail introuvables (attendu une ligne "Num. vente";"Date de vente"…).');
  const colonnes = decouper(brutes[iEntete]).map((c) => c.trim());
  const manquantes = COLONNES_REQUISES.filter((c) => !colonnes.includes(c));
  if (manquantes.length) throw new Error('Colonnes manquantes dans le CSV des ventes : ' + manquantes.join(', '));

  const col = {};
  colonnes.forEach((c, i) => { col[c] = i; });
  const lignes = [];
  for (let i = iEntete + 1; i < brutes.length; i++) {
    const l = brutes[i];
    if (!l.trim()) continue;
    const v = decouper(l);
    if (v.length < colonnes.length - 1) continue; // ligne tronquée / pied de rapport
    const adherent = (v[col['Adhérent']] || '').trim();
    if (!adherent) continue;                      // écriture non rattachée à un client
    const date = (v[col['Date de vente']] || '').trim();
    lignes.push({
      numVente: (v[col['Num. vente']] || '').trim(),
      date, mois: moisDe(date),
      adherent,
      prestation: (v[col['Prestation']] || '').trim(),
      vendeur: (v[col['Vendeur']] || '').trim(),
      info: (v[col['Info']] || '').trim(),
      site: (v[col['Site']] || '').trim(),
      idClient: (v[col['Id_client']] || '').trim(),
      ttc: montant(v[col['prix TTC']]),
    });
  }

  const mt = /Total des ventes;([\-\d\s,.]+)/i.exec(txt);
  return { periode, colonnes, lignes, totalAnnonce: mt ? montant(mt[1]) : null };
}

// ─── CONTRÔLE DE CONFORMITÉ ─────────────────────────────────────────────────
//  On refuse un fichier plutôt que de conclure sur du sable. Un seul contrôle
//  est BLOQUANT ici : la période. Un journal des ventes de juillet relu comme
//  celui d'août transformerait des ventes présentes en ventes introuvables.
//
//  ⚠️ On n'exige PAS la présence des 6 studios : un studio peut n'avoir vendu
//  aucun contrat sur le mois sans que le fichier soit fautif. C'est le KPI qui
//  dira « 0 / 0 », pas le contrôle qui doit bloquer.
function verifier(parse, { moisAttendu } = {}) {
  const problemes = [];
  const avertissements = [];

  if (!parse || !Array.isArray(parse.lignes)) return { ok: false, problemes: ['fichier illisible'], avertissements };

  if (moisAttendu) {
    const p = parse.periode;
    if (!p) problemes.push('période absente de l\'en-tête du rapport');
    else if (p.du.slice(0, 7) !== moisAttendu || p.au.slice(0, 7) !== moisAttendu) {
      problemes.push('période du fichier « ' + p.du + ' → ' + p.au + ' » ≠ mois demandé ' + moisAttendu);
    }
    const horsMois = parse.lignes.filter((l) => l.mois && l.mois !== moisAttendu).length;
    if (horsMois) problemes.push(horsMois + ' ligne(s) datée(s) hors de ' + moisAttendu);
  }

  if (!parse.lignes.length) problemes.push('aucune ligne de vente dans le fichier');

  return { ok: problemes.length === 0, problemes, avertissements, lignes: parse.lignes.length };
}

// ─── VUE PAR CLÉS CANDIDATES ────────────────────────────────────────────────
//  Une entrée PAR CLÉ CANDIDATE du nom de l'adhérent — exactement la mécanique
//  déjà employée pour rapprocher un contrat PDF d'un encaissement : le libellé
//  « DUPONT Marie Claire » ne dit pas où s'arrête le nom, donc on génère toutes
//  les coupes et une seule suffit à reconnaître la personne.
//
//  ⚠️ TOUS SITES, volontairement. Constaté sur août 2026 : deux ventes comptées
//  par Fitness Booster sur Marcq étaient enregistrées dans Deciplus sur
//  Wasquehal. Chercher dans le seul site du studio les aurait déclarées
//  introuvables à tort. On garde donc le site trouvé pour pouvoir le DIRE quand
//  il diffère, plutôt que de restreindre la recherche et de mentir.
function vueParNom(lignes, clesDe) {
  const out = [];
  (lignes || []).forEach((l) => {
    clesDe(l.adherent).forEach((cle) => out.push({
      cle, site: l.site, date: l.date, prestation: l.prestation,
      adherent: l.adherent, numVente: l.numVente, idClient: l.idClient,
    }));
  });
  return out;
}

module.exports = { parser, verifier, vueParNom, lirePeriode, moisDe, COLONNES_REQUISES };
