'use strict';
// Une collecte en échec n'écrase jamais un rapport exploitable. C'est arrivé
// une fois ; ces tests sont là pour que ça n'arrive plus.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const F = require('../lib/rapportFichier.js');
const CTRL = require('../lib/recap2Controles.js');
const M = require('../../public/recap2-metrics.js');

const bac = () => fs.mkdtempSync(path.join(os.tmpdir(), 'recap2-'));

// Un rapport qui passerait les contrôles bloquants — donc une vraie référence.
function rapportBon(mois, m1, genere) {
  const studios = {}, controleParStudio = {}, fitnessBooster = {};
  M.LABELS.forEach((s) => {
    studios[s] = {
      studio: s,
      nonReconduction: { base: 10, nonReconduits: 2, taux: 0.2, tauxPct: 20, liste: [
        { client: 'A', netM1: 60, netM: 0 }, { client: 'B', netM1: 60, netM: 0 }] },
      completion: { contratsSouscrits: 2, annulesExclus: 0, contratsValides: 2, ontPaye: 1, taux: 0.5, tauxPct: 50,
        liste: [{ contrat: 'C', date: '01/06/26', paye: true }, { contrat: 'D', date: '02/06/26', paye: false }] },
      avertissements: [], controleBloquant: { ok: true, detail: {} },
    };
    controleParStudio[s] = { ok: true, problemes: [], lignesBrutes: 10, lignesParsees: 10, avertissements: [] };
    fitnessBooster[s] = { club: s, periodeDetail: { du: '01/06/26', au: '30/06/26' }, compteur: 2, annulees: 0, echec: null };
  });
  return {
    genere: genere || new Date().toISOString(), mois, m1,
    source: {
      ['deciplus_' + m1]: { periode: { du: m1 + '-01', au: m1 + '-30' }, conforme: true, problemes: [], avertissements: [], controleParStudio },
      ['deciplus_' + mois]: { periode: { du: mois + '-01', au: mois + '-31' }, conforme: true, problemes: [], avertissements: [], controleParStudio },
      fitnessBooster,
    },
    studios, journal: [], erreurs: [],
  };
}

// Ce que produit une collecte dont le navigateur est tombé : conforme, et vide.
function rapportRate(mois, m1) {
  const studios = {};
  M.LABELS.forEach((s) => { studios[s] = { studio: s, nonReconduction: null, completion: null, avertissements: ['encaissements manquants (M et/ou M-1)'] }; });
  return { genere: new Date().toISOString(), mois, m1, source: { fitnessBooster: {} }, studios, journal: [], erreurs: ['Deciplus : navigateur fermé'] };
}

test('le rapport raté est bien conforme ET vide — c\'est tout le piège', () => {
  const Store = require('../../lib/recap2Store.js');
  const rate = rapportRate('2026-07', '2026-06');
  assert.equal(Store.valider(rate, '2026-07').ok, true, 'structurellement irréprochable');
  assert.equal(CTRL.analyser(rate, '2026-07').peutEnvoyer, false, 'et pourtant inexploitable');
});

test('collecte réussie : écrit le fichier principal', () => {
  const d = bac();
  const r = F.ecrire(d, '2026-07', rapportBon('2026-07', '2026-06'), { enEchec: false });
  assert.equal(path.basename(r.cible), 'recap2-2026-07.json');
  assert.equal(r.conserve, false);
  assert.ok(fs.existsSync(path.join(d, 'recap2-2026-07.json')));
});

test('collecte en ÉCHEC par-dessus un rapport exploitable : le bon fichier survit', () => {
  const d = bac();
  const bon = rapportBon('2026-07', '2026-06', '2026-09-09T07:30:24.425Z');
  F.ecrire(d, '2026-07', bon, { enEchec: false });
  const avant = fs.readFileSync(path.join(d, 'recap2-2026-07.json'), 'utf8');

  const r = F.ecrire(d, '2026-07', rapportRate('2026-07', '2026-06'), { enEchec: true });
  assert.equal(r.conserve, true);
  assert.equal(r.ancienGenere, '2026-09-09T07:30:24.425Z');
  assert.equal(path.basename(r.cible), 'recap2-2026-07.echec.json');
  assert.equal(fs.readFileSync(path.join(d, 'recap2-2026-07.json'), 'utf8'), avant, 'le bon fichier est INTACT');
  assert.ok(fs.existsSync(path.join(d, 'recap2-2026-07.echec.json')), 'le diagnostic est là, à côté');
});

test('collecte en échec par-dessus un rapport DÉJÀ raté : on remplace, rien à protéger', () => {
  const d = bac();
  F.ecrire(d, '2026-07', rapportRate('2026-07', '2026-06'), { enEchec: true });
  const r = F.ecrire(d, '2026-07', rapportRate('2026-07', '2026-06'), { enEchec: true });
  assert.equal(r.conserve, false);
  assert.equal(path.basename(r.cible), 'recap2-2026-07.json');
  assert.ok(!fs.existsSync(path.join(d, 'recap2-2026-07.echec.json')));
});

test('collecte en échec sans rien sur place : écrit normalement', () => {
  const d = bac();
  const r = F.ecrire(d, '2026-08', rapportRate('2026-08', '2026-07'), { enEchec: true });
  assert.equal(r.conserve, false);
  assert.equal(path.basename(r.cible), 'recap2-2026-08.json');
});

test('une collecte réussie efface le diagnostic précédent', () => {
  const d = bac();
  F.ecrire(d, '2026-07', rapportBon('2026-07', '2026-06'), { enEchec: false });
  F.ecrire(d, '2026-07', rapportRate('2026-07', '2026-06'), { enEchec: true });
  assert.ok(fs.existsSync(path.join(d, 'recap2-2026-07.echec.json')));

  const r = F.ecrire(d, '2026-07', rapportBon('2026-07', '2026-06'), { enEchec: false });
  assert.equal(r.nettoye, true);
  assert.ok(!fs.existsSync(path.join(d, 'recap2-2026-07.echec.json')), 'un fichier d\'échec périmé finit par être lu pour le bon');
});

test('un fichier illisible ne protège rien', () => {
  const d = bac();
  fs.writeFileSync(path.join(d, 'recap2-2026-07.json'), '{ ceci n\'est pas du JSON');
  const r = F.ecrire(d, '2026-07', rapportRate('2026-07', '2026-06'), { enEchec: true });
  assert.equal(r.conserve, false);
  assert.equal(path.basename(r.cible), 'recap2-2026-07.json');
});

test('l\'envoi ne regarde que le fichier principal : le .echec.json ne peut pas partir', () => {
  const d = bac();
  F.ecrire(d, '2026-07', rapportBon('2026-07', '2026-06'), { enEchec: false });
  F.ecrire(d, '2026-07', rapportRate('2026-07', '2026-06'), { enEchec: true });
  // Ce que recap2-envoi.js lira, c'est ceci — et c'est le bon rapport.
  const lu = JSON.parse(fs.readFileSync(path.join(d, F.nomPrincipal('2026-07')), 'utf8'));
  assert.equal(CTRL.analyser(lu, '2026-07').peutEnvoyer, true);
});
