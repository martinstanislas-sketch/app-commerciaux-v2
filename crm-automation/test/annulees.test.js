'use strict';
// ============================================================================
//  LES VENTES ANNULÉES — visibles dans le contrôle, hors du taux.
//
//  RÈGLE MÉTIER. On contrôle TOUT ce qui a été signé pendant le mois : une
//  vente annulée ensuite reste un acte de vente à regarder. Mais elle ne
//  pénalise pas la saisie CRM — on ne peut pas reprocher l'absence dans
//  Deciplus d'un contrat qui n'existe plus.
//
//  D'où l'invariant central de ce fichier :
//     signées = annulées + actives        (rien ne se perd)
//     taux    = retrouvées / actives      (les annulées n'y entrent jamais)
//
//  Et la règle d'affichage : une annulée reste « ANNULÉ » même si une trace
//  Deciplus existait — son statut principal est son annulation.
// ============================================================================

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const M = require('../../public/recap2-metrics.js');
const R = require('../../public/retention.js');
const Store = require('../../lib/recap2Store.js');
const FB = require('../lib/booster.js');

const sig = (identite, extra = {}) => Object.assign(
  { cles: R.clesContrat(identite), prenom: identite, nom: '' }, extra);
const annul = (identite, extra = {}) => Object.assign(
  { prenom: identite, nom: '', date: '19/08/2026', prestation: 'Challenge', commercial: 'Magali G.' }, extra);
const ventes = (identites, site = 'My Coach Lille') => {
  const out = [];
  identites.forEach((i) => R.clesContrat(i).forEach((cle) => out.push({
    cle, site, date: '12/08/2026', prestation: 'Challenge', adherent: i, numVente: '1', idClient: '41718',
  })));
  return out;
};

// ── LE CALCUL ───────────────────────────────────────────────────────────────
test('l\'exemple métier : 12 signées, 1 annulée, 11 actives, 10 retrouvées -> 90,9 %', () => {
  const noms = ['A Un', 'B Deux', 'C Trois', 'D Quatre', 'E Cinq', 'F Six',
    'G Sept', 'H Huit', 'I Neuf', 'J Dix', 'K Onze'];
  const r = M.clientsRetrouves({
    signataires: noms.map((n) => sig(n)),
    annulees: [annul('L Douze')],
    ventesM: ventes(noms.slice(0, 10).map((n) => n.split(' ').reverse().join(' ').toUpperCase())),
    encM: [],
  });
  assert.equal(r.total, 11, 'le dénominateur, ce sont les ACTIVES');
  assert.equal(r.nbRetrouves, 10);
  assert.equal(r.annules.length, 1);
  assert.equal(r.clients.length + r.annules.length, 12, 'rien ne se perd : 12 ventes signées');
  assert.equal(+(r.taux * 100).toFixed(1), 90.9);
});

test('une annulée n\'entre JAMAIS au dénominateur', () => {
  const sans = M.clientsRetrouves({ signataires: [sig('A Un')], annulees: [], ventesM: [], encM: [] });
  const avec = M.clientsRetrouves({ signataires: [sig('A Un')], annulees: [annul('B Deux'), annul('C Trois')], ventesM: [], encM: [] });
  assert.equal(sans.total, avec.total, 'ajouter des annulations ne change pas le dénominateur');
  assert.equal(sans.taux, avec.taux, 'ni le taux');
  assert.equal(avec.annules.length, 2, 'mais elles sont bien là, visibles');
});

test('que des annulations : taux null, jamais 0 % — il n\'y avait rien à retrouver', () => {
  const r = M.clientsRetrouves({ signataires: [], annulees: [annul('A Un')], ventesM: [], encM: [] });
  assert.equal(r.total, 0);
  assert.equal(r.taux, null);
  assert.equal(r.annules.length, 1);
});

// ── LES CHAMPS CONSERVÉS ────────────────────────────────────────────────────
test('une annulée garde client, date de signature, prestation, commercial — et sa date d\'annulation', () => {
  const r = M.clientsRetrouves({
    signataires: [],
    annulees: [annul('Dei Muteba', {
      date: '19/08/2026', prestation: 'CHALLENGE 12MOIS HEURES CREUSES',
      commercial: 'Magali G.', dateAnnulation: '24/08/2026',
    })],
    ventesM: [], encM: [],
  });
  const a = r.annules[0];
  assert.equal(a.prenom, 'Dei Muteba');
  assert.equal(a.date, '19/08/2026', 'la date de SIGNATURE');
  assert.equal(a.dateAnnulation, '24/08/2026', 'et celle de l\'annulation');
  assert.equal(a.prestation, 'CHALLENGE 12MOIS HEURES CREUSES');
  assert.equal(a.commercial, 'Magali G.');
  assert.equal(a.annulee, true);
});

test('une annulation sans date reste une annulation', () => {
  const r = M.clientsRetrouves({ signataires: [], annulees: [annul('X Y', { dateAnnulation: '' })], ventesM: [], encM: [] });
  assert.equal(r.annules[0].annulee, true);
  assert.equal(r.annules[0].dateAnnulation, '', 'on n\'invente pas de date');
});

test('une annulée n\'est jamais « retrouvée », même si son nom est dans le journal des ventes', () => {
  // Le cœur de la règle d'affichage : son statut principal est l'annulation.
  const r = M.clientsRetrouves({
    signataires: [],
    annulees: [annul('Dei Muteba')],
    ventesM: ventes(['MUTEBA Dei']),   // une trace Deciplus EXISTE
    encM: [],
  });
  assert.equal(r.annules[0].retrouve, false, 'l\'annulation prime');
  assert.equal(r.annules[0].idClient, '', 'donc aucun lien vers une fiche');
  assert.equal(r.nbRetrouves, 0);
});

// ── LA VUE PAR COMMERCIAL ───────────────────────────────────────────────────
const vente = (o) => Object.assign({
  client: 'X', date: '01/08/2026', prestation: 'Challenge', commercial: 'Fabian F.',
  annulee: false, dateAnnulation: '', retrouve: true, site: '', dateVente: '', idClient: '41718', encaisse: true,
}, o);

function rapport(parStudio) {
  const studios = {};
  M.LABELS.forEach((s) => {
    const liste = parStudio[s] || [];
    const actives = liste.filter((v) => !v.annulee);
    studios[s] = {
      studio: s,
      nonReconduction: { base: 10, nonReconduits: 3, taux: 0.3, tauxPct: 30, liste: [
        { client: 'P', netM1: 50, netM: 0 }, { client: 'Q', netM1: 60, netM: 0 }, { client: 'R', netM1: 70, netM: 0 }] },
      clientsRetrouves: {
        ventesSignees: liste.length, annulees: liste.length - actives.length,
        ventesActives: actives.length, signataires: actives.length,
        retrouves: actives.filter((v) => v.retrouve).length,
        taux: actives.length ? actives.filter((v) => v.retrouve).length / actives.length : null,
        liste,
      },
      avertissements: [], controleBloquant: { ok: true },
    };
  });
  return { businessVersion: 2, mois: '2026-08', m1: '2026-07', studios, source: {}, journal: [], erreurs: [] };
}

test('la vue commercial montre l\'annulée, tous studios confondus, sans fausser son taux', () => {
  const r = rapport({
    Lille: [vente({ client: 'A' }), vente({ client: 'B', retrouve: false })],
    Marcq: [vente({ client: 'C', annulee: true, retrouve: false, dateAnnulation: '24/08/2026' })],
    Neuilly: [vente({ client: 'D', commercial: 'Marvin B.' })],
  });
  const d = M.consoliderCommercial(r, 'Fabian F.');
  assert.equal(d.signees, 3, 'ses 3 ventes du mois, annulée comprise');
  assert.equal(d.annulees, 1);
  assert.equal(d.total, 2, 'dénominateur : les actives');
  assert.equal(d.retrouves, 1);
  assert.equal(d.aVerifier, 1);
  assert.equal(d.taux, 0.5, '1/2, l\'annulée n\'a pas pesé');
  assert.deepEqual(d.studios.sort(), ['Lille', 'Marcq'], 'le studio de l\'annulée reste visible');
  const a = d.ventes.find((v) => v.client === 'C');
  assert.equal(a.studio, 'Marcq');
  assert.equal(a.dateAnnulation, '24/08/2026');
});

test('les annulées sont rendues en dernier : la vue se lit d\'abord sur ce qui compte', () => {
  const r = rapport({ Lille: [vente({ client: 'Z', annulee: true, retrouve: false }), vente({ client: 'A' })] });
  const d = M.consoliderCommercial(r, 'Fabian F.');
  assert.equal(d.ventes[0].client, 'A');
  assert.equal(d.ventes[1].client, 'Z');
});

test('le décompte par commercial sépare annulées et retrouvées', () => {
  const r = rapport({
    Lille: [vente({ client: 'A' }), vente({ client: 'B', annulee: true, retrouve: false })],
  });
  const c = M.commerciauxDuRapport(r).find((x) => x.commercial === 'Fabian F.');
  assert.equal(c.ventes, 2, 'le sélecteur annonce TOUT ce qu\'il a signé');
  assert.equal(c.annulees, 1);
  assert.equal(c.retrouves, 1, 'une annulée n\'est pas comptée comme retrouvée');
});

// ── LES FILTRES ─────────────────────────────────────────────────────────────
test('Tous / Retrouvés / À vérifier / Annulés partitionnent exactement', () => {
  const r = rapport({
    Lille: [vente({ client: 'A' }), vente({ client: 'B', retrouve: false }),
      vente({ client: 'C', annulee: true, retrouve: false })],
  });
  const d = M.consoliderCommercial(r, 'Fabian F.');
  const passe = (v, f) => (f === 'annules' ? !!v.annulee
    : f === 'retrouves' ? (!v.annulee && v.retrouve)
      : f === 'verifier' ? (!v.annulee && !v.retrouve) : true);
  const n = (f) => d.ventes.filter((v) => passe(v, f)).length;
  assert.equal(n('tous'), 3);
  assert.equal(n('retrouves'), 1);
  assert.equal(n('verifier'), 1);
  assert.equal(n('annules'), 1);
  assert.equal(n('retrouves') + n('verifier') + n('annules'), n('tous'), 'aucun recouvrement, aucun oubli');
});

// ── LE SCHÉMA ───────────────────────────────────────────────────────────────
const rapportV2 = () => {
  const r = rapport({});
  M.LABELS.forEach((s) => {
    r.studios[s].clientsRetrouves = {
      ventesSignees: 3, annulees: 1, ventesActives: 2, signataires: 2, retrouves: 1,
      taux: 0.5, tauxPct: 50,
      liste: [
        { client: 'Cristina Haye', date: '07/08/2026', prestation: 'Challenge', commercial: 'Marvin', annulee: false, dateAnnulation: '', retrouve: true, site: 'My Coach Lille', dateVente: '08/08/2026', idClient: '41718', encaisse: false },
        { client: 'Ritha Konzo', date: '06/08/2026', prestation: 'Pack', commercial: 'Magali', annulee: false, dateAnnulation: '', retrouve: false, site: '', dateVente: '', idClient: '', encaisse: false },
        { client: 'Dei Muteba', date: '19/08/2026', prestation: 'Challenge', commercial: 'Magali', annulee: true, dateAnnulation: '24/08/2026', retrouve: false, site: '', dateVente: '', idClient: '', encaisse: false },
      ],
    };
  });
  const source = { fitnessBooster: {} };
  M.LABELS.forEach((s) => { source.fitnessBooster[s] = { club: s, periodeDetail: { du: '01/08/26', au: '31/08/26' }, compteur: 3, annulees: 1, echec: null }; });
  source['deciplus_2026-07'] = { periode: { du: '2026-07-01', au: '2026-07-31' }, conforme: true, controleParStudio: {} };
  source['deciplus_2026-08'] = { periode: { du: '2026-08-01', au: '2026-08-31' }, conforme: true, controleParStudio: {} };
  source['deciplus_ventes_2026-08'] = { periode: { du: '2026-08-01', au: '2026-08-31' }, conforme: true, lignes: 3723 };
  M.LABELS.forEach((s) => {
    source['deciplus_2026-07'].controleParStudio[s] = { ok: true, lignesBrutes: 5, lignesParsees: 5, problemes: [], avertissements: [] };
    source['deciplus_2026-08'].controleParStudio[s] = { ok: true, lignesBrutes: 5, lignesParsees: 5, problemes: [], avertissements: [] };
  });
  r.source = source;
  r.genere = new Date().toISOString();
  return r;
};

test('un rapport portant des annulées est accepté', () => {
  const v = Store.valider(rapportV2(), '2026-08');
  assert.deepEqual(v.problemes, []);
});

test('le magasin refuse une annulée marquée « retrouvée »', () => {
  const r = rapportV2();
  r.studios.Lille.clientsRetrouves.liste[2].retrouve = true;
  const v = Store.valider(r, '2026-08');
  assert.match(v.problemes.join(' '), /annulée ne peut pas être marquée/);
});

test('le magasin recoupe les DEUX populations de la liste', () => {
  const r = rapportV2();
  r.studios.Lille.clientsRetrouves.annulees = 2; // annoncé 2, une seule dans la liste
  assert.match(Store.valider(r, '2026-08').problemes.join(' '), /1 ligne\(s\) annulée\(s\) pour 2 annoncée\(s\)/);
  const r2 = rapportV2();
  r2.studios.Lille.clientsRetrouves.signataires = 5;
  assert.match(Store.valider(r2, '2026-08').problemes.join(' '), /2 nom\(s\) actif\(s\) pour 5 signataire\(s\)/);
});

test('nettoyer() : une annulée perd tout statut « retrouvé » et tout identifiant', () => {
  const r = rapportV2();
  r.studios.Lille.clientsRetrouves.liste[2].idClient = '99999';
  const l = Store.nettoyer(r).studios.Lille.clientsRetrouves.liste[2];
  assert.equal(l.annulee, true);
  assert.equal(l.retrouve, false);
  assert.equal(l.idClient, '', 'pas de lien vers une fiche pour une vente annulée');
  assert.equal(l.dateAnnulation, '24/08/2026', 'la date d\'annulation, elle, est conservée');
});

test('un rapport SANS annulées (déjà déposé) reste valide', () => {
  const r = rapportV2();
  M.LABELS.forEach((s) => {
    const c = r.studios[s].clientsRetrouves;
    c.liste = c.liste.slice(0, 2);
    delete c.annulees;
    c.annulesExclus = 1;          // l'ancienne clé, telle qu'elle a été déposée
    delete c.ventesActives;
    c.ventesValides = 2;
  });
  assert.deepEqual(Store.valider(r, '2026-08').problemes, []);
});

// ── LA LECTURE DE LA LIGNE FITNESS BOOSTER ──────────────────────────────────
test('la date d\'annulation est lue, même quand la ligne n\'a pas de « source »', () => {
  // Ligne réelle de Marcq : pas de segment source, l'annulation juste après la date.
  const l = FB.analyserLigne(['6', 'Dei Muteba', 'CHALLENGE 12MOIS HEURES CREUSES',
    '19/08/2026 |  Magali G.', 'Vente annulée le 24/08/2026', 'Voir la fiche du contact', 'Signer le SEPA'].join('\n'));
  assert.equal(l.annulee, true);
  assert.equal(l.dateAnnulation, '24/08/2026');
  assert.equal(l.date, '19/08/2026');
  assert.equal(l.prestation, 'CHALLENGE 12MOIS HEURES CREUSES');
  assert.equal(l.commercial, 'Magali G.');
});

test('une annulation APRÈS le mois audité est rendue telle quelle', () => {
  // Réel : vente d'août annulée le 07/09. On ne la censure pas, on la montre.
  const l = FB.analyserLigne(['2', 'Lydie Babdor', 'Challenge 12 mois heures creuse', 'FAP',
    '18/08/2026 |  Luca R.', 'Vente annulée le 07/09/2026', 'Voir la fiche du contact'].join('\n'));
  assert.equal(l.dateAnnulation, '07/09/2026');
  assert.equal(l.date, '18/08/2026');
});

// ── SUR LE VRAI RAPPORT ─────────────────────────────────────────────────────
const REEL = path.join(__dirname, '..', '.session', 'controle', 'recap2-2026-08.json');
test('août réel : signées = actives + annulées, et le taux ne porte que sur les actives',
  { skip: !fs.existsSync(REEL) && 'rapport local absent' }, () => {
    const r = JSON.parse(fs.readFileSync(REEL, 'utf8'));
    if (r.businessVersion !== 2) return;
    M.LABELS.forEach((s) => {
      const c = r.studios[s].clientsRetrouves;
      if (c.annulees === undefined) return; // rapport d'avant cette règle
      const annulees = c.liste.filter((v) => v.annulee).length;
      const actives = c.liste.length - annulees;
      assert.equal(annulees, c.annulees, s + ' : annulées');
      assert.equal(actives, c.signataires, s + ' : actives');
      assert.equal(c.liste.length, c.signataires + c.annulees, s + ' : rien ne se perd');
      if (c.signataires > 0) {
        assert.ok(Math.abs(c.taux - c.retrouves / c.signataires) < 0.0005, s + ' : taux sur les actives');
      }
      c.liste.filter((v) => v.annulee).forEach((v) => {
        assert.equal(v.retrouve, false, s + ' / ' + v.client + ' : une annulée n\'est pas « retrouvée »');
      });
    });
  });
