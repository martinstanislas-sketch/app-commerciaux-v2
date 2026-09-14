'use strict';
// ============================================================================
//  LES RAPPROCHEMENTS VALIDÉS PAR UN HUMAIN — persistance et effet sur le KPI.
//
//  Le point qui justifie toute cette mécanique : les décisions NE VIVENT PAS
//  dans le JSON mensuel, qui est remplacé à chaque collecte. Elles sont en base
//  et APPLIQUÉES À LA LECTURE. Une recollecte ne peut donc pas les écraser.
// ============================================================================

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const Mat = require('../lib/recap2Matches.js');

const baseNeuve = () => { const d = new Database(':memory:'); Mat.creerTable(d); return d; };

// Un rapport minimal portant la proposition réelle de juillet.
const rapport = (mut) => {
  const l = {
    client: 'Aristide Guevonoux', date: '08/07/2026', prestation: 'Challenge', commercial: 'Fabian F.',
    annulee: false, dateAnnulation: '', retrouve: false, site: '', dateVente: '', idClient: '', encaisse: false,
    candidat: 'GUEVENOUX Aristide', candidatScore: 0.941, candidatNiveau: 'forte',
    candidatIndices: ['prénom identique', 'nom similaire à 89 %'],
    candidatSite: 'My Coach Vieux Lille', candidatId: '41856',
  };
  const autre = { client: 'Makanfing Konate', date: '16/07/2026', prestation: 'X', commercial: 'Luca R.',
    annulee: false, dateAnnulation: '', retrouve: false, site: '', dateVente: '', idClient: '', encaisse: false };
  const sur = { client: 'Chloé Le Bossenec', date: '03/07/2026', prestation: 'X', commercial: 'Fabian F.',
    annulee: false, dateAnnulation: '', retrouve: true, site: 'My Coach Vieux Lille',
    dateVente: '03/07/2026', idClient: '41800', encaisse: true };
  if (mut) mut(l);
  return { businessVersion: 2, mois: '2026-07', m1: '2026-06',
    studios: { Lille: { studio: 'Lille', clientsRetrouves: {
      ventesSignees: 3, annulees: 0, ventesActives: 3, signataires: 3, retrouves: 1,
      taux: 1 / 3, tauxPct: 33.3, liste: [sur, l, autre] } } } };
};
const lignes = (r) => r.studios.Lille.clientsRetrouves.liste;
const kpi = (r) => r.studios.Lille.clientsRetrouves;

// ── LA CLÉ D'IDENTITÉ ───────────────────────────────────────────────────────
test('la clé neutralise casse, accents, tirets ET l\'ordre des mots', () => {
  const k = Mat.cleIdentite('Aristide Guevonoux');
  assert.equal(Mat.cleIdentite('GUEVONOUX Aristide'), k, 'inversion : même personne');
  assert.equal(Mat.cleIdentite('aristide  guevonoux'), k);
  assert.equal(Mat.cleIdentite('Élodie Martin'), Mat.cleIdentite('ELODIE MARTIN'));
  assert.equal(Mat.cleIdentite('Jean-Pierre Dupont'), Mat.cleIdentite('Jean Pierre DUPONT'));
  assert.notEqual(k, Mat.cleIdentite('Aristide Dupont'), 'deux personnes restent distinctes');
});

test('l\'identifiant Fitness Booster prime sur le nom quand il existe', () => {
  assert.equal(Mat.cleDe({ fbContactId: '1782833692931x438', client: 'Aristide Guevonoux' }), 'fb:1782833692931x438');
  assert.match(Mat.cleDe({ client: 'Aristide Guevonoux' }), /^nom:/);
});

// ── LE CAS ARISTIDE, DE BOUT EN BOUT ────────────────────────────────────────
test('CONFIRMER : le proposé devient « retrouvé — validé manuellement », KPI recalculé', () => {
  const db = baseNeuve();
  const avant = Mat.appliquer(rapport(), Mat.toutesLesDecisions(db));
  assert.equal(kpi(avant).retrouves, 1, 'avant : une seule certitude');
  assert.equal(kpi(avant).proposes, 1);
  assert.equal(kpi(avant).aVerifier, 1);
  assert.equal(kpi(avant).tauxPct, 33.3);

  Mat.decider(db, { client: 'Aristide Guevonoux', idClient: '41856',
    nomDeciplus: 'GUEVENOUX Aristide', statut: 'confirmed', score: 0.941, decidePar: 'Stan' });

  const apres = Mat.appliquer(rapport(), Mat.toutesLesDecisions(db));
  const l = lignes(apres).find((x) => x.client === 'Aristide Guevonoux');
  assert.equal(l.retrouve, true);
  assert.equal(l.valideManuellement, true, 'distinct d\'un retrouvé automatique');
  assert.equal(l.idClient, '41856', 'sa fiche reste ouvrable');
  assert.equal(l.candidat, undefined, 'la proposition a fait son office');
  assert.equal(kpi(apres).retrouves, 2, 'le KPI intègre la validation');
  assert.equal(kpi(apres).valides, 1);
  assert.equal(kpi(apres).proposes, 0);
  assert.equal(kpi(apres).aVerifier, 1);
  assert.equal(kpi(apres).tauxPct, 66.7);
});

test('la validation SURVIT à une nouvelle collecte : elle n\'est pas dans le JSON', () => {
  const db = baseNeuve();
  Mat.decider(db, { client: 'Aristide Guevonoux', idClient: '41856', statut: 'confirmed' });
  // Une recollecte produit un JSON NEUF, sans aucune trace de la décision.
  const frais = rapport();
  assert.equal(lignes(frais)[1].retrouve, false, 'le JSON brut ignore tout de la validation');
  const lu = Mat.appliquer(frais, Mat.toutesLesDecisions(db));
  assert.equal(lignes(lu)[1].valideManuellement, true, 'et pourtant elle s\'applique encore');
  assert.equal(kpi(lu).retrouves, 2);
});

test('REFUSER : la proposition disparaît et ne revient pas', () => {
  const db = baseNeuve();
  Mat.decider(db, { client: 'Aristide Guevonoux', idClient: '41856',
    nomDeciplus: 'GUEVENOUX Aristide', statut: 'rejected', decidePar: 'Stan' });
  const apres = Mat.appliquer(rapport(), Mat.toutesLesDecisions(db));
  const l = lignes(apres).find((x) => x.client === 'Aristide Guevonoux');
  assert.equal(l.retrouve, false, 'un refus ne retrouve personne');
  assert.equal(l.candidat, undefined, 'la proposition est retirée');
  assert.equal(l.refuse, true, 'et le refus est DIT, pas silencieux');
  assert.equal(kpi(apres).retrouves, 1, 'le KPI ne bouge pas');
  assert.equal(kpi(apres).proposes, 0);
  assert.equal(kpi(apres).aVerifier, 2, 'il repasse à vérifier');
});

test('le refus est mémorisé pour que le moteur ne le repropose plus', () => {
  const db = baseNeuve();
  Mat.decider(db, { client: 'Aristide Guevonoux', idClient: '41856', statut: 'rejected' });
  const d = Mat.toutesLesDecisions(db).get(Mat.cleDe({ client: 'Aristide Guevonoux' }));
  assert.deepEqual(d.refuses, ['41856'], 'la liste d\'exclusion du moteur');
  assert.equal(d.confirme, null);
});

test('un refus ne touche QUE le couple refusé', () => {
  const db = baseNeuve();
  Mat.decider(db, { client: 'Aristide Guevonoux', idClient: '99999', statut: 'rejected' });
  const l = lignes(Mat.appliquer(rapport(), Mat.toutesLesDecisions(db)))[1];
  assert.equal(l.candidat, 'GUEVENOUX Aristide', 'un autre candidat reste proposé');
});

// ── LES GARDE-FOUS ──────────────────────────────────────────────────────────
test('une identité ne peut avoir QU\'UN rapprochement confirmé', () => {
  const db = baseNeuve();
  Mat.decider(db, { client: 'Aristide Guevonoux', idClient: '41856', statut: 'confirmed' });
  Mat.decider(db, { client: 'Aristide Guevonoux', idClient: '50000', statut: 'confirmed' });
  const d = Mat.toutesLesDecisions(db).get(Mat.cleDe({ client: 'Aristide Guevonoux' }));
  assert.equal(d.confirme.id_client, '50000', 'la dernière décision remplace la précédente');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM recap2_identity_matches WHERE statut='confirmed'").get().n, 1,
    'une personne ne peut pas être deux clients Deciplus');
});

test('on peut refuser plusieurs candidats pour la même personne', () => {
  const db = baseNeuve();
  Mat.decider(db, { client: 'Aristide Guevonoux', idClient: '1', statut: 'rejected' });
  Mat.decider(db, { client: 'Aristide Guevonoux', idClient: '2', statut: 'rejected' });
  assert.deepEqual(Mat.toutesLesDecisions(db).get(Mat.cleDe({ client: 'Aristide Guevonoux' })).refuses.sort(), ['1', '2']);
});

test('se corriger est possible : refuser puis confirmer', () => {
  const db = baseNeuve();
  Mat.decider(db, { client: 'Aristide Guevonoux', idClient: '41856', statut: 'rejected' });
  Mat.decider(db, { client: 'Aristide Guevonoux', idClient: '41856', statut: 'confirmed' });
  const apres = Mat.appliquer(rapport(), Mat.toutesLesDecisions(db));
  assert.equal(lignes(apres)[1].valideManuellement, true);
  assert.equal(kpi(apres).retrouves, 2);
});

test('oublier() rend le couple à nouveau proposable', () => {
  const db = baseNeuve();
  Mat.decider(db, { client: 'Aristide Guevonoux', idClient: '41856', statut: 'confirmed' });
  assert.equal(Mat.oublier(db, { client: 'Aristide Guevonoux', idClient: '41856' }), 1);
  assert.equal(kpi(Mat.appliquer(rapport(), Mat.toutesLesDecisions(db))).retrouves, 1);
});

test('un Id_client bricolé ou un statut inconnu sont refusés', () => {
  const db = baseNeuve();
  assert.throws(() => Mat.decider(db, { client: 'A B', idClient: 'DROP TABLE', statut: 'confirmed' }), /Id_client invalide/);
  assert.throws(() => Mat.decider(db, { client: 'A B', idClient: '1', statut: 'peut-etre' }), /statut inconnu/);
  assert.throws(() => Mat.decider(db, { client: '', idClient: '1', statut: 'confirmed' }), /identité vide/);
});

test('une vente ANNULÉE et un client DÉJÀ retrouvé ne sont jamais touchés', () => {
  const db = baseNeuve();
  Mat.decider(db, { client: 'Chloé Le Bossenec', idClient: '99999', statut: 'confirmed' });
  const r = rapport();
  lignes(r)[2].annulee = true;                       // Makanfing devient annulée
  const apres = Mat.appliquer(r, Mat.toutesLesDecisions(db));
  assert.equal(lignes(apres)[0].idClient, '41800', 'le retrouvé automatique garde SON id');
  assert.equal(lignes(apres)[0].valideManuellement, undefined);
  assert.equal(lignes(apres)[2].retrouve, false, 'une annulée reste annulée');
});

test('appliquer() ne modifie jamais le rapport d\'origine', () => {
  const db = baseNeuve();
  Mat.decider(db, { client: 'Aristide Guevonoux', idClient: '41856', statut: 'confirmed' });
  const origine = rapport();
  Mat.appliquer(origine, Mat.toutesLesDecisions(db));
  assert.equal(lignes(origine)[1].retrouve, false, 'le JSON sur disque reste le reflet brut de la collecte');
});

test('la table se crée sans risque deux fois de suite', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rec2m-')), 'db.sqlite');
  const d1 = new Database(f); Mat.creerTable(d1);
  Mat.decider(d1, { client: 'Aristide Guevonoux', idClient: '41856', statut: 'confirmed' });
  d1.close();
  const d2 = new Database(f); Mat.creerTable(d2);   // redémarrage du serveur
  assert.equal(Mat.toutesLesDecisions(d2).size, 1, 'la décision survit au redémarrage');
  d2.close();
});
