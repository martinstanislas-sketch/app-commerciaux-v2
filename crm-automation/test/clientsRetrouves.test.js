'use strict';
// ============================================================================
//  LE 2e KPI, RÈGLE v2 — « CLIENTS RETROUVÉS DANS DECIPLUS ».
//
//  Ce que ces tests verrouillent, dans l'ordre d'importance :
//
//   1. UN CLIENT SANS PAIEMENT N'EST PAS UN CLIENT ABSENT. C'est la régression
//      qui a motivé tout ce travail : l'ancien KPI comptait comme manquants des
//      clients parfaitement saisis, dont l'échéance tombait le mois suivant.
//   2. Le dénominateur est le SIGNATAIRE UNIQUE, et l'écart avec le nombre de
//      ventes est DIT, jamais avalé.
//   3. La recherche est TOUS SITES, et le site trouvé est conservé.
//   4. Les deux règles métier ne se mélangent pas dans un même fichier, et un
//      vieux rapport ne s'affiche jamais sous le nouveau libellé.
// ============================================================================

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const M = require('../../public/recap2-metrics.js');
const R = require('../../public/retention.js');
const Store = require('../../lib/recap2Store.js');
const CTRL = require('../lib/recap2Controles.js');
const V = require('../lib/csvVentes.js');

// Un signataire Fitness Booster : l'identité arrive en UN champ « Prénom Nom ».
const sig = (identite, extra = {}) => Object.assign(
  { cles: R.clesContrat(identite), prenom: identite, nom: '' }, extra);
// Une entrée de la vue « journal des ventes », déjà éclatée en clés candidates.
const ventes = (identites, site = 'My Coach Lille') => {
  const out = [];
  identites.forEach((i) => R.clesContrat(i).forEach((cle) => out.push({
    cle, site, date: '12/08/2026', prestation: 'Challenge 12 mois', adherent: i, numVente: '1',
  })));
  return out;
};
// Une ligne d'encaissement, déjà éclatée en clés candidates.
const encs = (identites, montant = 150) => {
  const out = [];
  identites.forEach((i) => R.clesContrat(i).forEach((cle) => out.push({ cle, montant, decaissement: false })));
  return out;
};

// ── 1. LE CŒUR : présence ≠ paiement ────────────────────────────────────────
test('RETROUVÉ SANS AUCUN PAIEMENT — la régression que ce KPI existe pour tuer', () => {
  const r = M.clientsRetrouves({
    signataires: [sig('Cristina Haye')],
    ventesM: ventes(['HAYE Cristina']),
    encM: [], // aucun encaissement : l'échéance tombe le mois prochain
  });
  assert.equal(r.nbRetrouves, 1, 'la vente est dans le CRM, donc elle compte');
  assert.equal(r.taux, 1);
  assert.equal(r.clients[0].retrouve, true);
  assert.equal(r.clients[0].encaisse, false, 'et on sait dire qu\'elle n\'est pas encore encaissée');
});

test('un signataire vraiment absent du journal des ventes reste « à vérifier »', () => {
  const r = M.clientsRetrouves({
    signataires: [sig('Ritha Konzo')],
    ventesM: ventes(['DUPONT Marie']),
    encM: [],
  });
  assert.equal(r.nbRetrouves, 0);
  assert.equal(r.clients[0].retrouve, false);
  assert.equal(r.taux, 0);
});

test('un encaissement SEUL ne suffit pas : c\'est le journal des ventes qui fait foi', () => {
  // Le client a payé mais n'apparaît pas dans les ventes du mois (vente d'un
  // mois antérieur). Le KPI porte sur les signatures DU mois : il ne doit pas
  // se laisser convaincre par un prélèvement.
  const r = M.clientsRetrouves({
    signataires: [sig('Jean Martin')],
    ventesM: [],
    encM: encs(['MARTIN Jean']),
  });
  assert.equal(r.nbRetrouves, 0, 'payer n\'est pas la preuve demandée');
  assert.equal(r.clients[0].encaisse, true, 'le paiement est vu, mais il ne compte pas comme présence');
});

// ── 2. LE DÉNOMINATEUR ──────────────────────────────────────────────────────
test('deux ventes d\'une même personne = UN signataire au dénominateur', () => {
  const r = M.clientsRetrouves({
    signataires: [sig('Marie Dupont'), sig('Marie Dupont')],
    ventesM: ventes(['DUPONT Marie']),
    encM: [],
  });
  assert.equal(r.total, 1, 'dédupliqué');
  assert.equal(r.nbRetrouves, 1);
});

test('aucun signataire -> taux null, jamais 0 % ni NaN', () => {
  const r = M.clientsRetrouves({ signataires: [], ventesM: ventes(['DUPONT Marie']), encM: [] });
  assert.equal(r.total, 0);
  assert.equal(r.taux, null);
});

test('10 / 12 -> 83,3 % : le taux annoncé est bien le rapport affiché', () => {
  const noms = ['A Un', 'B Deux', 'C Trois', 'D Quatre', 'E Cinq', 'F Six',
    'G Sept', 'H Huit', 'I Neuf', 'J Dix', 'K Onze', 'L Douze'];
  const r = M.clientsRetrouves({
    signataires: noms.map((n) => sig(n)),
    ventesM: ventes(noms.slice(0, 10).map((n) => n.split(' ').reverse().join(' ').toUpperCase())),
    encM: [],
  });
  assert.equal(r.total, 12);
  assert.equal(r.nbRetrouves, 10);
  assert.equal(+(r.taux * 100).toFixed(1), 83.3);
});

// ── 3. TOUS SITES ───────────────────────────────────────────────────────────
test('une vente enregistrée sur un AUTRE site compte, et le site est rendu', () => {
  // Cas réel d'août 2026 : signé côté Marcq, saisi sur Wasquehal.
  const r = M.clientsRetrouves({
    signataires: [sig('Mustapha Teir')],
    ventesM: ventes(['TEIR Mustapha'], 'My Coach Wasquehal'),
    encM: [],
  });
  assert.equal(r.nbRetrouves, 1, 'chercher dans le seul site du studio l\'aurait perdu');
  assert.equal(r.clients[0].site, 'My Coach Wasquehal', 'le site est rendu pour pouvoir le signaler');
});

test('le détail porte tout ce qu\'il faut pour contrôler à l\'œil', () => {
  const r = M.clientsRetrouves({
    signataires: [sig('Cristina Haye', { date: '07/08/2026', prestation: 'Challenge 12 mois', commercial: 'Marvin' })],
    ventesM: ventes(['HAYE Cristina']),
    encM: [],
  });
  const c = r.clients[0];
  assert.equal(c.date, '07/08/2026');
  assert.equal(c.prestation, 'Challenge 12 mois');
  assert.equal(c.commercial, 'Marvin');
  assert.equal(c.dateVente, '12/08/2026', 'la date côté Deciplus, qui peut différer de la signature');
});

// ── 4. LES DEUX RÈGLES NE SE MÉLANGENT PAS ──────────────────────────────────
const rapportV2 = () => {
  const studios = {};
  Store.LABELS.forEach((s) => {
    studios[s] = {
      studio: s,
      nonReconduction: { base: 10, nonReconduits: 2, taux: 0.2, tauxPct: 20, liste: [
        { client: 'A', netM1: 50, netM: 0 }, { client: 'B', netM1: 60, netM: 0 }] },
      clientsRetrouves: {
        ventesSignees: 3, annulesExclus: 1, ventesValides: 2, signataires: 2, retrouves: 1,
        taux: 0.5, tauxPct: 50,
        liste: [
          { client: 'Cristina Haye', date: '07/08/2026', prestation: 'Challenge', commercial: 'Marvin', retrouve: true, site: 'My Coach Lille', dateVente: '08/08/2026', encaisse: false },
          { client: 'Ritha Konzo', date: '06/08/2026', prestation: 'Pack', commercial: 'Magali', retrouve: false, site: '', dateVente: '', encaisse: false },
        ],
      },
      avertissements: [], controleBloquant: { ok: true },
    };
  });
  const source = { fitnessBooster: {} };
  Store.LABELS.forEach((s) => { source.fitnessBooster[s] = { club: s, periodeDetail: { du: '01/08/26', au: '31/08/26' }, compteur: 3, annulees: 1, echec: null }; });
  source['deciplus_2026-07'] = { periode: { du: '2026-07-01', au: '2026-07-31' }, conforme: true, controleParStudio: {} };
  source['deciplus_2026-08'] = { periode: { du: '2026-08-01', au: '2026-08-31' }, conforme: true, controleParStudio: {} };
  source['deciplus_ventes_2026-08'] = { periode: { du: '2026-08-01', au: '2026-08-31' }, conforme: true, lignes: 3723 };
  Store.LABELS.forEach((s) => {
    source['deciplus_2026-07'].controleParStudio[s] = { ok: true, lignesBrutes: 5, lignesParsees: 5, problemes: [], avertissements: [] };
    source['deciplus_2026-08'].controleParStudio[s] = { ok: true, lignesBrutes: 5, lignesParsees: 5, problemes: [], avertissements: [] };
  });
  return { businessVersion: 2, genere: new Date().toISOString(), mois: '2026-08', m1: '2026-07', source, studios, journal: [], erreurs: [] };
};

test('un rapport v2 complet est accepté par le magasin', () => {
  const v = Store.valider(rapportV2(), '2026-08');
  assert.deepEqual(v.problemes, []);
  assert.equal(v.ok, true);
});

test('v2 qui porterait ENCORE une « complétion » -> refusé', () => {
  const r = rapportV2();
  r.studios.Lille.completion = { contratsValides: 2, ontPaye: 1, taux: 0.5, liste: [] };
  const v = Store.valider(r, '2026-08');
  assert.equal(v.ok, false);
  assert.match(v.problemes.join(' '), /remplacé par clientsRetrouves/);
});

test('un rapport SANS businessVersion ne peut pas porter le nouveau KPI', () => {
  const r = rapportV2();
  delete r.businessVersion;
  const v = Store.valider(r, '2026-08');
  assert.equal(v.ok, false);
  assert.match(v.problemes.join(' '), /absent de la règle v1/);
});

test('une version métier venue du futur est refusée plutôt qu\'affichée au hasard', () => {
  const r = rapportV2();
  r.businessVersion = 99;
  const v = Store.valider(r, '2026-08');
  assert.equal(v.ok, false);
  assert.match(v.problemes.join(' '), /businessVersion : 99 inconnue/);
});

test('plus de retrouvés que de signataires -> impossible, donc refusé', () => {
  const r = rapportV2();
  r.studios.Lille.clientsRetrouves.retrouves = 5;
  const v = Store.valider(r, '2026-08');
  assert.equal(v.ok, false);
  assert.match(v.problemes.join(' '), /plus de retrouvés/);
});

test('plus de signataires que de ventes valides -> impossible (la dédup ne crée personne)', () => {
  const r = rapportV2();
  r.studios.Lille.clientsRetrouves.signataires = 9;
  r.studios.Lille.clientsRetrouves.taux = 1 / 9;
  r.studios.Lille.clientsRetrouves.liste = [];
  const v = Store.valider(r, '2026-08');
  assert.equal(v.ok, false);
  assert.match(v.problemes.join(' '), /9 signataires pour 2 vente/);
});

test('la forme canonique ne laisse passer aucune clé étrangère', () => {
  const r = rapportV2();
  r.studios.Lille.clientsRetrouves.motDePasse = 'secret';
  r.studios.Lille.clientsRetrouves.liste[0].cookie = 'session=abc';
  const propre = Store.nettoyer(r);
  assert.equal(propre.studios.Lille.clientsRetrouves.motDePasse, undefined);
  assert.equal(propre.studios.Lille.clientsRetrouves.liste[0].cookie, undefined);
  assert.equal(propre.studios.Lille.clientsRetrouves.liste[0].client, 'Cristina Haye');
  assert.equal(propre.businessVersion, 2, 'la version métier survit au nettoyage');
});

// ── 5. LES CONTRÔLES BLOQUANTS ──────────────────────────────────────────────
test('rapport v2 sain : rien ne bloque, envoi autorisé', () => {
  const b = CTRL.analyser(rapportV2(), '2026-08');
  assert.equal(b.version, 2);
  assert.deepEqual(b.bloquants.map((x) => x.code), []);
  assert.equal(b.peutEnvoyer, true);
});

test('Fitness Booster lu sur M-1 au lieu de M -> BLOQUE', () => {
  // Le piège central de l'ancienne règle : si le détail FB porte sur juillet
  // alors qu'on audite août, les ventes contrôlées ne sont pas les bonnes.
  const r = rapportV2();
  r.source.fitnessBooster.Lille.periodeDetail = { du: '01/07/26', au: '31/07/26' };
  const b = CTRL.analyser(r, '2026-08');
  assert.equal(b.peutEnvoyer, false);
  assert.match(JSON.stringify(b.bloquants), /détail du 01\/07\/26/);
});

test('journal des ventes absent -> BLOQUE (la présence CRM serait invérifiable)', () => {
  const r = rapportV2();
  delete r.source['deciplus_ventes_2026-08'];
  const b = CTRL.analyser(r, '2026-08');
  assert.equal(b.peutEnvoyer, false);
  assert.match(JSON.stringify(b.bloquants), /journal des ventes de 2026-08 absent/);
});

test('journal des ventes d\'un autre mois -> BLOQUE', () => {
  const r = rapportV2();
  r.source['deciplus_ventes_2026-08'].periode = { du: '2026-07-01', au: '2026-07-31' };
  const b = CTRL.analyser(r, '2026-08');
  assert.equal(b.peutEnvoyer, false);
  assert.match(JSON.stringify(b.bloquants), /journal des ventes : période/);
});

test('0 vente signée : taux à null, ce n\'est PAS une anomalie', () => {
  const r = rapportV2();
  Store.LABELS.forEach((s) => {
    r.studios[s].clientsRetrouves = {
      ventesSignees: 0, annulesExclus: 0, ventesValides: 0, signataires: 0,
      retrouves: 0, taux: null, tauxPct: null, liste: [],
    };
  });
  const b = CTRL.analyser(r, '2026-08');
  assert.equal(b.peutEnvoyer, true);
});

// ── 6. SUR LES VRAIES DONNÉES D'AOÛT ────────────────────────────────────────
const CSV_VENTES = path.join(__dirname, '..', '.session', 'exports', 'ventes-2026-08.csv');
test('août 2026 réel : les « non payés » de l\'ancienne règle sont en fait dans le CRM',
  { skip: !fs.existsSync(CSV_VENTES) && 'CSV de ventes absent' }, () => {
    const p = V.parser(fs.readFileSync(CSV_VENTES, 'utf8'));
    const vue = V.vueParNom(p.lignes, R.clesContrat);
    // Les signataires d'août que l'ancienne complétion déclarait « non payés ».
    const anciens = ['Anis Mze Ali', 'Mustapha Teir', 'Philippe Tifaou', 'Cristina Haye',
      'Sarah Chaouch', 'Stephanie Tahon', 'Tiphaine Delaronciere', 'Christian Doressamy',
      'Aurélie Fourlin', 'Daouda Sy', 'Frédéric Dray'];
    const r = M.clientsRetrouves({ signataires: anciens.map((n) => sig(n)), ventesM: vue, encM: [] });
    assert.equal(r.nbRetrouves, anciens.length,
      'les 11 sont retrouvés dans le journal des ventes — l\'ancien KPI les comptait comme des manques');
  });

test('un rapport v2 ne porte AUCUN champ de l\'ancienne règle, pas même à null',
  { skip: !fs.existsSync(path.join(__dirname, '..', '.session', 'controle', 'recap2-2026-08.json')) && 'rapport local absent' }, () => {
    const r = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.session', 'controle', 'recap2-2026-08.json'), 'utf8'));
    if (r.businessVersion !== 2) return; // rapport d'avant la bascule : rien à exiger
    Store.LABELS.forEach((s) => {
      assert.equal('completion' in r.studios[s], false,
        s + ' : le champ « completion » n\'a plus lieu d\'être en règle v2');
      assert.ok(r.studios[s].clientsRetrouves, s + ' : le KPI v2 est bien là');
    });
  });
