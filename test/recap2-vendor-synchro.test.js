'use strict';
// ============================================================================
//  VENDOR — SYNCHRONISATION CRM FORCÉE : les règles, sans navigateur.
//  (le seul endroit du projet qui écrira dans un CRM ; cf. crm-automation/lib/vendorSynchro.js)
// ============================================================================

const { test } = require('node:test');
const assert = require('node:assert/strict');
const V = require('../crm-automation/lib/vendorSynchro.js');

test('trois tentatives au maximum, jamais de boucle', () => {
  assert.equal(V.MAX_TENTATIVES, 3);
});

test('état lu dans le texte de la fiche : coche verte, avertissement, ou on ne touche à rien', () => {
  assert.equal(V.etatSynchro('Fiche contact — Synchronisation CRM ✅ — Historique'), 'ok');
  assert.equal(V.etatSynchro('Synchronisation CRM ⚠️ Forcer la synchronisation'), 'avertissement');
  assert.equal(V.etatSynchro('Synchronisation CRM Erreur lors du dernier envoi'), 'avertissement');
  assert.equal(V.etatSynchro('Fiche contact — aucune mention'), 'inconnu', 'sans la mention : on ne clique pas');
  assert.equal(V.etatSynchro(''), 'inconnu');
  assert.equal(V.etatSynchro(null), 'inconnu');
});

test('périmètre : uniquement les VNI sans Id Deciplus ET avec un contact Vendor', () => {
  const liste = [
    { client: 'A', contactId: 'c1', idClient: '' },
    { client: 'B', contactId: 'c2', idClient: '40862' },
    { client: 'C', contactId: '', idClient: '' },
    { client: 'D', contactId: 'c4', idClient: 'abc' },
  ];
  assert.deepEqual(V.aSynchroniser(liste).map((x) => x.client), ['A', 'D']);
  assert.deepEqual(V.aSynchroniser(null), []);
});

test('bilan : synchronisations forcées, fiches reliées, anomalies après 3 échecs', () => {
  const b = V.bilan([
    { studio: 'Lille', contactId: 'c1', client: 'A', tentatives: 1, etatFinal: 'ok', idClientApres: '40862' },
    { studio: 'Neuilly', contactId: 'c2', client: 'B', tentatives: 2, etatFinal: 'ok', idClientApres: '' },
    { studio: 'Marcq', contactId: 'c3', client: 'C', tentatives: 3, etatFinal: 'avertissement', motif: '3 tentatives sans coche verte' },
  ]);
  assert.deepEqual([b.traitees, b.synchronisationsForcees, b.reussies, b.reliees], [3, 6, 2, 1]);
  assert.deepEqual(b.synchroSansFiche, ['c2'], 'synchronisée mais toujours absente de Deciplus : dit à part');
  assert.deepEqual(b.anomalies, [{ studio: 'Marcq', contactId: 'c3', client: 'C', tentatives: 3, etat: 'avertissement', motif: '3 tentatives sans coche verte' }]);
  assert.equal(b.personnes.length, 3, 'les personnes concernées sont toutes listées');
});
