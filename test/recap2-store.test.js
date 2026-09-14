'use strict';
// RECAP 2 — le magasin de fichiers est la SEULE porte d'écriture du serveur :
// il doit refuser tout ce qui n'est pas exactement la forme attendue, écrire de
// façon atomique, ne laisser ni .tmp ni .bak, et conserver le détail nominatif.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// DB_DIR est lu à chaque appel : on le pointe sur un dossier jetable AVANT
// d'importer le module, et on le garde pour toute la suite.
const BAC = fs.mkdtempSync(path.join(os.tmpdir(), 'recap2-store-'));
process.env.DB_DIR = BAC;
const S = require('../lib/recap2Store.js');

// ── Fabrique : le rapport minimal mais COMPLET d'un mois ────────────────────
const studio = (nom) => ({
  studio: nom,
  nonReconduction: { base: 4, nonReconduits: 1, taux: 0.25, tauxPct: 25, liste: [{ client: 'DUPONT Marie', netM1: 60, netM: 0 }] },
  completion: { contratsSouscrits: 3, annulesExclus: 1, contratsValides: 2, ontPaye: 1, taux: 0.5, tauxPct: 50, liste: [{ contrat: 'Léa Martin', date: '06/05/2026', paye: true }, { contrat: 'Paul Durand', date: '07/05/2026', paye: false }] },
  avertissements: [],
  controleBloquant: { ok: true, detail: {} },
});
function rapport(mois = '2026-07') {
  return {
    genere: '2026-09-09T06:41:37.896Z', mois, m1: S.moisPrecedent(mois),
    source: { ['deciplus_' + S.moisPrecedent(mois)]: { fichier: 'encaissements.csv' }, fitnessBooster: {} },
    studios: Object.fromEntries(S.LABELS.map((s) => [s, studio(s)])),
    journal: ['[06:41:37] collecte'], erreurs: [],
  };
}
const refuse = (r, mois, motif) => {
  const v = S.valider(r, mois);
  assert.equal(v.ok, false, 'aurait dû être refusé : ' + motif);
  return v.problemes.join(' | ');
};

// ── VALIDATION : ce qui doit passer ─────────────────────────────────────────
test('valider : un rapport complet et cohérent passe', () => {
  const v = S.valider(rapport(), '2026-07');
  assert.deepEqual(v.problemes, []);
  assert.equal(v.ok, true);
});

test('valider : un KPI refusé par la collecte (null) reste acceptable', () => {
  const r = rapport();
  r.studios.Lille.nonReconduction = null;
  r.studios.Lille.completion = null;
  r.studios.Lille.controleBloquant = { ok: false, raisons: ['CSV non conforme'] };
  assert.equal(S.valider(r, '2026-07').ok, true, 'un studio sans chiffre est un état légitime');
});

// ── VALIDATION : ce qui doit être refusé ────────────────────────────────────
test('valider : le mois du fichier doit être celui du dépôt', () => {
  assert.match(refuse(rapport('2026-06'), '2026-07', 'mois discordant'), /le fichier porte 2026-06/);
});

test('valider : m1 doit être le mois précédent', () => {
  const r = rapport(); r.m1 = '2026-05';
  assert.match(refuse(r, '2026-07', 'm1 faux'), /n'est pas le mois précédant/);
});

test('valider : aucune clé inattendue à la racine (ni CSV, ni cookie)', () => {
  const r = rapport(); r.cookies = 'session=abc';
  assert.match(refuse(r, '2026-07', 'clé pirate'), /clés inattendues à la racine : cookies/);
});

test('valider : aucune chaîne longue nulle part (un CSV collé est refusé)', () => {
  const r = rapport(); r.journal = ['x'.repeat(5000)];
  assert.match(refuse(r, '2026-07', 'CSV déguisé en journal'), /caractères \(max 500\)/);
});

test('valider : les 6 studios, ni plus ni moins', () => {
  const r1 = rapport(); delete r1.studios.Neuilly;
  assert.match(refuse(r1, '2026-07', 'studio manquant'), /manquant\(s\) : Neuilly/);
  const r2 = rapport(); r2.studios.Caen = studio('Caen');
  assert.match(refuse(r2, '2026-07', 'studio hors périmètre'), /hors périmètre : Caen/);
});

test('valider : un taux qui ne colle pas à son rapport est refusé', () => {
  const r = rapport(); r.studios.Lille.nonReconduction.taux = 0.9;
  assert.match(refuse(r, '2026-07', 'taux menteur'), /taux : incohérent avec 1\/4/);
});

test('valider : plus de perdus que de base, ou plus de payés que de contrats', () => {
  const r1 = rapport(); r1.studios.Lille.nonReconduction.nonReconduits = 9;
  assert.match(refuse(r1, '2026-07', 'nb > base'), /plus de non-reconduits/);
  const r2 = rapport(); r2.studios.Lille.completion.ontPaye = 5;
  assert.match(refuse(r2, '2026-07', 'payés > contrats'), /plus de payés/);
});

test('valider : le détail nominatif doit compter autant de noms que le compteur', () => {
  const r = rapport(); r.studios.Lille.nonReconduction.liste = [];
  assert.match(refuse(r, '2026-07', 'liste tronquée'), /0 nom\(s\) pour 1 non-reconduit/);
});

test('valider : une entrée de détail mal formée est refusée', () => {
  const r = rapport(); r.studios.Lille.completion.liste[0] = { contrat: 'Léa Martin', paye: 'oui' };
  assert.match(refuse(r, '2026-07', 'paye non booléen'), /paye : booléen attendu/);
});

// ── NON-RECONDUITS : l'Id membre qui ouvre la fiche Deciplus ────────────────
test('non-reconduits : idClient facultatif, des chiffres ou vide, rien d\'autre', () => {
  const avec = rapport(); avec.studios.Lille.nonReconduction.liste[0].idClient = '42321';
  assert.equal(S.valider(avec, '2026-07').ok, true, 'un Id membre numérique passe');
  const vide = rapport(); vide.studios.Lille.nonReconduction.liste[0].idClient = '';
  assert.equal(S.valider(vide, '2026-07').ok, true, 'vide : pas de fiche, pas de lien');
  assert.equal(S.valider(rapport(), '2026-07').ok, true, 'absent : un rapport d\'avant reste valide');
  ['NOM:DUPONT MARIE', '42321 ', '../42321', 'javascript:alert(1)'].forEach((id) => {
    const r = rapport(); r.studios.Lille.nonReconduction.liste[0].idClient = id;
    assert.match(refuse(r, '2026-07', 'id bricolé ' + id), /n'est pas un Id_client Deciplus/);
  });
  const nombre = rapport(); nombre.studios.Lille.nonReconduction.liste[0].idClient = 42321;
  assert.match(refuse(nombre, '2026-07', 'id numérique brut'), /idClient : texte attendu/);
});

test('non-reconduits : nettoyer garde l\'Id membre plausible, n\'en invente aucun', () => {
  const r = rapport();
  r.studios.Lille.nonReconduction.liste[0].idClient = '42321';
  r.studios.Marcq.nonReconduction.liste[0].idClient = '';
  const p = S.nettoyer(r);
  assert.deepEqual(p.studios.Lille.nonReconduction.liste[0], { client: 'DUPONT Marie', idClient: '42321', netM1: 60, netM: 0 });
  assert.deepEqual(p.studios.Marcq.nonReconduction.liste[0], { client: 'DUPONT Marie', netM1: 60, netM: 0 });
  assert.deepEqual(p.studios.Boulogne.nonReconduction.liste[0], { client: 'DUPONT Marie', netM1: 60, netM: 0 }, 'rapport d\'avant : inchangé');
  ['base', 'nonReconduits', 'taux', 'tauxPct'].forEach((k) => {
    assert.equal(p.studios.Lille.nonReconduction[k], r.studios.Lille.nonReconduction[k], k + ' inchangé');
  });
  assert.equal(S.valider(p, '2026-07').ok, true, 'la forme canonique reste valide');
});

test('valider : compteurs non numériques refusés', () => {
  const r = rapport(); r.studios.Lille.nonReconduction.base = '4';
  assert.match(refuse(r, '2026-07', 'base texte'), /base : nombre positif attendu/);
});

test('valider : ce qui n\'est pas un objet est refusé d\'emblée', () => {
  [null, undefined, 'coucou', 42, []].forEach((x) => assert.equal(S.valider(x, '2026-07').ok, false));
});

// ── FORME CANONIQUE ─────────────────────────────────────────────────────────
test('nettoyer : garde les noms de clients, jette tout le reste', () => {
  const r = rapport();
  r.studios.Lille.secret = 'jeton-CRM';
  r.studios.Lille.nonReconduction.brut = 'ligne;CSV;entière';
  r.studios.Lille.nonReconduction.liste[0].idMembre = 123456;
  const p = S.nettoyer(r);
  assert.equal(p.studios.Lille.secret, undefined);
  assert.equal(p.studios.Lille.nonReconduction.brut, undefined);
  assert.deepEqual(p.studios.Lille.nonReconduction.liste[0], { client: 'DUPONT Marie', netM1: 60, netM: 0 });
  assert.equal(p.studios.Lille.completion.liste[1].contrat, 'Paul Durand', 'le détail complétion survit');
  assert.equal(S.valider(p, '2026-07').ok, true, 'la forme canonique reste valide');
});

// ── CHEMINS ─────────────────────────────────────────────────────────────────
test('chemin : AAAA-MM seulement, et toujours dans DB_DIR/recap2', () => {
  assert.equal(path.dirname(S.chemin('2026-07')), path.join(BAC, 'recap2'));
  ['../evasion', '2026-13', '2026-7', '', null, '2026-07/../../etc/passwd', '..%2F..'].forEach((m) => {
    assert.equal(S.chemin(m), null, 'refusé : ' + m);
  });
});

// ── ÉCRITURE ATOMIQUE ───────────────────────────────────────────────────────
test('ecrire : crée le fichier, sans .tmp ni .bak résiduel', () => {
  const f = S.ecrire('2026-07', S.nettoyer(rapport()));
  const dossier = path.dirname(f);
  const restes = fs.readdirSync(dossier).filter((n) => n.includes('.tmp') || n.endsWith('.bak'));
  assert.deepEqual(restes, [], 'aucun résidu');
  assert.deepEqual(fs.readdirSync(dossier), ['recap2-2026-07.json']);
  assert.equal((fs.statSync(f).mode & 0o777), 0o600, 'lisible par le seul propriétaire');
});

test('ecrire : réécrire un mois remplace, sans laisser de copie', () => {
  const r = S.nettoyer(rapport());
  S.ecrire('2026-07', r);
  r.genere = '2026-09-10T08:00:00.000Z';
  S.ecrire('2026-07', r);
  const dossier = path.join(BAC, 'recap2');
  assert.deepEqual(fs.readdirSync(dossier), ['recap2-2026-07.json'], 'un seul fichier par mois');
  assert.equal(S.lire('2026-07').rapport.genere, '2026-09-10T08:00:00.000Z');
});

test('lire : absent, illisible, ok', () => {
  assert.equal(S.lire('2026-01').etat, 'absent');
  assert.equal(S.lire('pasunmois').etat, 'illisible');
  fs.writeFileSync(S.chemin('2026-02'), '{ ceci n\'est pas du JSON');
  assert.equal(S.lire('2026-02').etat, 'illisible');
  const l = S.lire('2026-07');
  assert.equal(l.etat, 'ok');
  assert.equal(l.rapport.studios.Wasquehal.completion.liste.length, 2);
});
