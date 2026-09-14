'use strict';
// ============================================================================
//  MOTEUR DE RAPPROCHEMENT — les 10 cas exigés, plus les pièges réels.
//
//  Principe tenu par chaque test : le moteur PROPOSE et EXPLIQUE, il ne tranche
//  jamais. Un rapprochement proposé n'est pas un client retrouvé.
// ============================================================================

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const P = require('../lib/rapprochement.js');
const V = require('../lib/csvVentes.js');
const M = require('../../public/recap2-metrics.js');

const journal = (noms, extra = {}) => noms.map((n, i) => Object.assign({
  adherent: n, site: 'My Coach Lille', idClient: String(40000 + i), numVente: String(i),
}, typeof extra === 'function' ? extra(n, i) : extra));
const niveau = (a, b) => P.niveauDe(P.comparerIdentites(a, b).score);
const propose = (a, b) => niveau(a, b) !== 'faible';

// ── 1 à 4 : LES CAS ORTHOGRAPHIQUES ─────────────────────────────────────────
test('1. Aristide Guevonoux / Aristide GUEVENOUX -> proposé, confiance forte', () => {
  const c = P.comparerIdentites('Aristide Guevonoux', 'GUEVENOUX Aristide');
  assert.ok(c.score >= P.SEUIL.forte, 'score ' + c.score);
  assert.equal(P.niveauDe(c.score), 'forte');
  assert.match(c.indices.join(' | '), /identique/, 'le prénom exact est dit');
  assert.match(c.indices.join(' | '), /similaire à \d+ %/, 'et l\'écart chiffré');
});

test('2. Élodie Martin / Elodie Martin -> les accents ne comptent pas', () => {
  assert.equal(P.comparerIdentites('Élodie Martin', 'Elodie MARTIN').score, 1);
  assert.equal(P.niveauDe(1), 'tres_forte');
});

test('3. Jean-Pierre Dupont / Jean Pierre Dupont -> le tiret ne compte pas', () => {
  assert.equal(P.comparerIdentites('Jean-Pierre Dupont', 'Jean Pierre DUPONT').score, 1);
});

test('4. Aristide Guevonoux / Aristide Dupont -> AUCUNE proposition', () => {
  // Même prénom, nom sans rapport : c'est le faux positif à ne jamais produire.
  assert.equal(propose('Aristide Guevonoux', 'DUPONT Aristide'), false);
});

// ── 5 et 6 : L'EMAIL ────────────────────────────────────────────────────────
//  ⚠️ Aucune source ne fournit d'email aujourd'hui (vérifié sur les deux CRM).
//  Ces tests décrivent le comportement du moteur le jour où une source en
//  donnera un — le code est prêt, la donnée manque.
test('5. nom un peu différent + email identique -> proposition très forte', () => {
  const p = P.proposer('Aristide Guevonoux', journal(['GUEVENOUX Aristide']),
    { email: 'a@ex.com', emailDe: () => 'a@ex.com' });
  assert.equal(p.niveau, 'tres_forte');
  assert.equal(p.memeEmail, true);
  assert.equal(p.indices[0], 'email identique');
  assert.doesNotMatch(JSON.stringify(p), /a@ex\.com/, 'l\'adresse elle-même ne ressort JAMAIS');
});

test('6. nom complètement différent + email identique -> proposé, mais AVERTI', () => {
  const p = P.proposer('Aristide Guevonoux', journal(['MARTIN Sophie']),
    { email: 'a@ex.com', emailDe: () => 'a@ex.com' });
  assert.ok(p, 'l\'information ne doit surtout pas être masquée');
  assert.equal(p.memeEmail, true);
  assert.match(p.indices.join(' | '), /nom différent/, 'l\'écart de nom est DIT');
});

test('un email DIFFÉRENT ne crée aucune proposition à lui seul', () => {
  const p = P.proposer('Aristide Guevonoux', journal(['MARTIN Sophie']),
    { email: 'a@ex.com', emailDe: () => 'autre@ex.com' });
  assert.equal(p, null);
});

// ── 7 : L'AMBIGUÏTÉ ─────────────────────────────────────────────────────────
test('7. plusieurs candidats proches -> on ne tranche pas', () => {
  const p = P.proposer('Jean Dupont', journal(['DUPOND Jean', 'DUPONS Jean']));
  assert.equal(p.ambigu, true);
  assert.ok(p.second, 'le second est nommé, pour qu\'on voie le doute');
});

test('un candidat NETTEMENT meilleur n\'est pas ambigu', () => {
  const p = P.proposer('Aristide Guevonoux', journal(['GUEVENOUX Aristide', 'MARTIN Paul']));
  assert.equal(p.ambigu, false);
  assert.equal(p.adherent, 'GUEVENOUX Aristide');
});

test('on ne propose pas dix personnes : une, et la seconde seulement si elle talonne', () => {
  const p = P.proposer('Jean Dupont', journal(['DUPOND Jean', 'MARTIN Luc', 'BERNARD Paul']));
  assert.equal(p.adherent, 'DUPOND Jean');
  assert.equal(p.second, null, 'les autres ne sont pas dans le mouchoir');
});

// ── 8, 9, 10 : CE QUI NE DOIT PAS ENTRER DANS LE MOTEUR ─────────────────────
test('8. un client déjà retrouvé exactement ne passe pas par le moteur', () => {
  // C'est l'appelant qui garde cette porte : le moteur n'est sollicité que pour
  // les non-retrouvés. On verrouille l'invariant côté résultat.
  const r = M.clientsRetrouves({
    signataires: [{ cles: require('../../public/retention.js').clesContrat('Aline Lepretre'),
      prenom: 'Aline Lepretre', nom: '' }],
    annulees: [],
    ventesM: [{ cle: 'LEPRETRE|ALINE', site: 'My Coach Lille', date: '05/08/2026', prestation: 'X', adherent: 'LEPRETRE Aline', idClient: '42084' }],
    encM: [],
  });
  assert.equal(r.clients[0].retrouve, true, 'correspondance exacte : rien à proposer');
});

test('9. une vente annulée reste annulée, sans rapprochement', () => {
  const r = M.clientsRetrouves({
    signataires: [], annulees: [{ prenom: 'Dei Muteba', nom: '', date: '19/08/2026', dateAnnulation: '24/08/2026' }],
    ventesM: [], encM: [],
  });
  assert.equal(r.annules[0].annulee, true);
  assert.equal(r.annules[0].retrouve, false);
});

test('10. sans aucun email, le rapprochement orthographique fonctionne', () => {
  const p = P.proposer('Aristide Guevonoux', journal(['GUEVENOUX Aristide']));
  assert.ok(p);
  assert.equal(p.memeEmail, false);
  assert.equal(p.niveau, 'forte');
});

// ── LA MESURE ELLE-MÊME ─────────────────────────────────────────────────────
test('Le Goff / Legoff : le nombre de mots peut différer', () => {
  assert.equal(propose('Marie Le Goff', 'LEGOFF Marie'), true);
  assert.match(P.comparerIdentites('Marie Le Goff', 'LEGOFF Marie').indices.join(' | '),
    /en un mot ou en deux/);
});

test('Mohamed / Mohammed : une lettre doublée', () => {
  assert.equal(propose('Mohamed Benali', 'BENALI Mohammed'), true);
});

test('l\'inversion prénom / nom est gérée et signalée', () => {
  const c = P.comparerIdentites('Marie Dupont', 'DUPONT Marie');
  assert.equal(c.score, 1);
  assert.match(c.indices.join(' | '), /inversés/);
});

test('un mot long qui diffère coûte plus cher qu\'un mot court', () => {
  // ⚠️ LA PONDÉRATION EST PAR LONGUEUR, pas par rôle : c'est un PROXY du nom de
  // famille, pas une identification. Il tient parce qu'un patronyme est en
  // général plus long qu'un prénom — mais « BERTRAND » (8) pèse autant qu'un
  // nom. Ce qui est GARANTI, et vérifié ici : une faute sur un mot long fait
  // chuter bien moins qu'un mot entièrement différent, et les deux formes de
  // « même prénom, autre nom » restent sous le seuil.
  const faute = P.comparerIdentites('Aristide Guevonoux', 'GUEVENOUX Aristide').score;
  const autreNom = P.comparerIdentites('Aristide Guevonoux', 'DUPONT Aristide').score;
  const autrePrenom = P.comparerIdentites('Aristide Guevonoux', 'GUEVONOUX Bertrand').score;
  assert.ok(faute >= P.SEUIL.forte, 'une faute de frappe reste proposable');
  assert.equal(P.niveauDe(autreNom), 'faible', 'un autre nom ne passe pas');
  assert.equal(P.niveauDe(autrePrenom), 'faible', 'un autre prénom non plus');
  assert.ok(faute - autreNom > 0.25, 'l\'écart entre les deux est net');
});

test('les faux amis réels de juillet sont tous rejetés', () => {
  [['Manon Deffense', 'DÉFFENSE Pauline'], ['Esther Jhureea', 'LEMOINE Esther'],
    ['Arnaud Balou', 'SIRAUD Arnaud'], ['Jerome Vitry', 'LE HEN Jerome'],
    ['Sophie Maillart', 'DECAUDIN Sophie'], ['Jean Dupont', 'DURANT Jean']]
    .forEach(([a, b]) => assert.equal(propose(a, b), false, a + ' vs ' + b));
});

test('Jaro-Winkler et la distance normalisée : on garde la plus prudente', () => {
  assert.ok(P.jaroWinkler('GUEVENOUX', 'GUEVONOUX') > 0.9);
  assert.ok(P.similariteMot('GUEVENOUX', 'GUEVONOUX') <= P.jaroWinkler('GUEVENOUX', 'GUEVONOUX'));
  assert.equal(P.similariteMot('MARTIN', 'MARTIN'), 1);
});

test('entrées vides : aucune exception, aucune proposition', () => {
  assert.equal(P.comparerIdentites('', 'MARTIN Paul'), null);
  assert.equal(P.proposer('', journal(['MARTIN Paul'])), null);
  assert.equal(P.proposer('Jean Dupont', []), null);
  assert.equal(P.proposer('Jean Dupont', null), null);
});

test('un candidat déjà REFUSÉ par un humain n\'est plus proposé', () => {
  // Prépare le refus persistant : l'exclusion se fait par Id_client.
  const tous = journal(['GUEVENOUX Aristide']);
  assert.ok(P.proposer('Aristide Guevonoux', tous));
  assert.equal(P.proposer('Aristide Guevonoux', tous, { exclure: ['40000'] }), null);
});

// ── SUR LES VRAIES DONNÉES ──────────────────────────────────────────────────
const csv = (m) => path.join(__dirname, '..', '.session', 'exports', 'ventes-' + m + '.csv');
const rap = (m) => path.join(__dirname, '..', '.session', 'controle', 'recap2-' + m + '.json');
const dispo = (m) => fs.existsSync(csv(m)) && fs.existsSync(rap(m));

test('juillet réel : exactement 3 propositions, et pas une de plus',
  { skip: !dispo('2026-07') && 'données locales absentes' }, () => {
    const lignes = V.parser(fs.readFileSync(csv('2026-07'), 'utf8')).lignes;
    const r = JSON.parse(fs.readFileSync(rap('2026-07'), 'utf8'));
    if (r.businessVersion !== 2) return;
    const av = M.ventesDuRapport(r).filter((v) => !v.retrouve && !v.annulee);
    const proposes = av.map((v) => ({ c: v.client, p: P.proposer(v.client, lignes) }))
      .filter((x) => x.p && !x.p.ambigu);
    assert.deepEqual(proposes.map((x) => x.c).sort(),
      ['Aristide Guevonoux', 'Pamela Devaux', 'Shermila Paz Guevonoux'],
      'ni fausse piste, ni occasion ratée');
    proposes.forEach((x) => {
      assert.ok(x.p.idClient, x.c + ' : un Id_client, donc une fiche ouvrable');
      assert.ok(x.p.score >= P.SEUIL.forte);
    });
  });

test('août réel : aucune proposition — les 3 cas sont de vraies absences',
  { skip: !dispo('2026-08') && 'données locales absentes' }, () => {
    const lignes = V.parser(fs.readFileSync(csv('2026-08'), 'utf8')).lignes;
    const r = JSON.parse(fs.readFileSync(rap('2026-08'), 'utf8'));
    if (r.businessVersion !== 2) return;
    const av = M.ventesDuRapport(r).filter((v) => !v.retrouve && !v.annulee);
    const proposes = av.filter((v) => { const p = P.proposer(v.client, lignes); return p && !p.ambigu; });
    assert.deepEqual(proposes.map((v) => v.client), [],
      'le moteur ne doit pas inventer de piste là où il n\'y en a pas');
  });
