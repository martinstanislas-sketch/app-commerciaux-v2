'use strict';
// ============================================================================
//  RECAP 2 — L'HISTORIQUE DES VENTES DECIPLUS (24 mois glissants).
//
//  Sert UNIQUEMENT à retrouver le vendeur d'origine des clients non reconduits
//  (lib/vendeurOrigine.js). Aucun KPI n'en dépend.
//
//  LECTURE SEULE côté Deciplus : le même export CSV natif que le journal des
//  ventes de M (lib/deciplus.js), un mois après l'autre, tous sites.
//
//  ⚠️ UN MOIS CLOS NE CHANGE PLUS : un CSV déjà présent dans le dossier des
//  exports est réutilisé tel quel. La première collecte exporte donc jusqu'à 23
//  mois ; les suivantes, un seul (le mois qui entre dans la fenêtre).
//  ⚠️ NON BLOQUANT : un mois qui échoue est listé dans `manquants` et la
//  collecte continue. Un client dont la vente d'origine tombait dans ce mois
//  restera simplement « Non attribué » — jamais attribué à tort.
// ============================================================================

const fs = require('fs');
const path = require('path');
const VENTES = require('./csvVentes.js');
const ORIGINE = require('./vendeurOrigine.js');

const PROFONDEUR = 24;
const fichierDe = (dossier, ym) => path.join(dossier, 'ventes-' + ym + '.csv');

// Exporte les journaux ABSENTS de la fenêtre. Rend la liste des mois exportés.
async function exporterManquants({ page, mois, dossier, dire = () => {}, DEC, REESSAI, tentatives = 2, profondeur = PROFONDEUR }) {
  const exportes = [];
  const echecs = [];
  for (const ym of ORIGINE.moisGlissants(mois, profondeur)) {
    if (fs.existsSync(fichierDe(dossier, ym))) continue;
    try {
      await REESSAI.avecReessai('export ventes Deciplus ' + ym + ' (historique)', tentatives, (n) => {
        dire('Deciplus : historique des VENTES ' + ym + (n > 1 ? ' — tentative ' + n : '') + '…');
        return DEC.exporterVentesMois(page, ym, dossier, dire);
      }, { remise: () => DEC.reinitialiserFiltres(page), journal: dire });
      exportes.push(ym);
    } catch (e) {
      echecs.push(ym);
      dire('ℹ️ historique des ventes ' + ym + ' indisponible (' + e.message + ') — vendeurs d\'origine de ce mois non lus');
    }
  }
  return { exportes, echecs };
}

// Lit la fenêtre disponible sur disque. Un CSV non conforme (mauvaise période)
// est écarté et compté dans `manquants`, jamais lu.
function lire({ mois, dossier, profondeur = PROFONDEUR }) {
  const fenetre = ORIGINE.moisGlissants(mois, profondeur);
  const lignes = [];
  const lus = [];
  const manquants = [];
  fenetre.forEach((ym) => {
    const f = fichierDe(dossier, ym);
    if (!fs.existsSync(f)) { manquants.push(ym); return; }
    try {
      const p = VENTES.parser(fs.readFileSync(f, 'utf8'));
      const v = VENTES.verifier(p, { moisAttendu: ym });
      if (!v.ok) { manquants.push(ym); return; }
      p.lignes.forEach((l) => lignes.push(l));
      lus.push(ym);
    } catch (_) { manquants.push(ym); }
  });
  return {
    lignes,
    historique: { du: fenetre[0], au: fenetre[fenetre.length - 1], moisLus: lus.length, manquants, lignes: lignes.length },
  };
}

module.exports = { PROFONDEUR, exporterManquants, lire, fichierDe };
