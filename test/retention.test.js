'use strict';
// Le moteur de rétention doit reproduire EXACTEMENT la logique validée sur
// données réelles. Chaque règle de la spec (§2.5, §3, §4, §5, §6) a son test,
// et les pièges métier (montée en gamme, mois à 4 vs 5 semaines) sont couverts.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../public/retention.js');

// Fabrique une ligne d'encaissement.
const P = (nom, prenom, montant, dec = false) => ({ cle: R.cleClient(nom, prenom), montant, decaissement: dec });

// --- §2.5 NORMALISATION ------------------------------------------------------
test('normNom : majuscules, sans accents, espaces réduits', () => {
  assert.equal(R.normNom('Méddah'), 'MEDDAH');
  assert.equal(R.normNom('  Jean-François  '), 'JEAN FRANCOIS');
  assert.equal(R.normNom('Éloïse   Dûpont'), 'ELOISE DUPONT');
  assert.equal(R.cleClient('Picquet', 'Caroline'), 'PICQUET|CAROLINE');
});

// --- §2.1 CONTRATS : parsing du nom de fichier -------------------------------
test('parseContratFilename : date, studio, nom (les 2 exemples de la spec)', () => {
  const a = R.parseContratFilename('2606051-caroline-picquet-contrat-My-coach-lille.pdf');
  assert.equal(a.date, '2026-06-05');
  assert.equal(a.studio, 'Lille');
  assert.equal(a.nomComplet, 'caroline picquet');
  const b = R.parseContratFilename('2606021-saphia-meddah-contrat-My-coach-wasquehal.pdf');
  assert.equal(b.date, '2026-06-02');
  assert.equal(b.studio, 'Wasquehal');
});

test('parseContratFilename : séquence après les 6 chiffres ignorée, studio composé', () => {
  const c = R.parseContratFilename('26060512-marie-curie-contrat-My-coach-saint-andre.pdf');
  assert.equal(c.date, '2026-06-05', 'seuls les 6 premiers chiffres = la date');
  assert.equal(c.studio, 'Saint Andre', 'le studio composé passe en Title Case');
  assert.equal(R.parseContratFilename('pas-un-contrat.pdf'), null);
});

test('clesContrat : deux ordres candidats, et noms composés', () => {
  assert.deepEqual(R.clesContrat('caroline picquet').sort(), ['CAROLINE|PICQUET', 'PICQUET|CAROLINE'].sort());
  // Nom composé : toutes les coupes, dans les deux lectures -> l'une matchera.
  const c = R.clesContrat('jean marie dupont');
  assert.ok(c.includes('DUPONT|JEAN MARIE'), 'prénom composé « jean marie »');
  assert.ok(c.includes('MARIE DUPONT|JEAN'), 'nom composé « marie dupont »');
});

// --- §4.1 AGRÉGATS PAR CLIENT ------------------------------------------------
test('agréger : net (positifs + négatifs), pu = mode, décaissement, nb échéances', () => {
  const ag = R.agregerParClient([
    P('Dupont', 'Jean', 69), P('Dupont', 'Jean', 69), P('Dupont', 'Jean', 69),
    P('Dupont', 'Jean', 69), P('Dupont', 'Jean', -69, true), // un rejet : s'annule
  ]);
  const a = ag.get('DUPONT|JEAN');
  assert.equal(a.net, 69 * 4 - 69, 'net = somme signée');
  assert.equal(a.pu, 69, 'prix unitaire = valeur la plus fréquente des positifs');
  assert.equal(a.nbEcheances, 4, 'nb de lignes positives');
  assert.equal(a.aDecaissement, true, 'au moins un décaissement');
});

test('mode : à fréquence égale, le montant le plus élevé (tarif de référence)', () => {
  assert.equal(R.modeMontant([50, 50, 69, 69]), 69);
  assert.equal(R.modeMontant([]), 0);
  assert.equal(R.modeMontant([80, 60, 60]), 60);
});

// --- §4.2/§4.3 BASE ET CLASSEMENT --------------------------------------------
test('base : seuls les clients à net(M-1) > 0 en font partie', () => {
  const r = R.calculerStudio({
    encM1: [
      P('Paye', 'Anna', 69), P('Paye', 'Anna', 69),          // net > 0 -> base
      P('Rejete', 'Bob', 69), P('Rejete', 'Bob', -69, true), // net = 0 -> PAS base
    ],
    encM: [P('Paye', 'Anna', 69), P('Paye', 'Anna', 69)],
    signataires: [], choix: {},
  });
  assert.equal(r.base, 1, 'Bob (net M-1 = 0) n\'est pas dans la base');
});

test('classement : FIDÈLE / baisse de tarif / disparu (impayé, parti)', () => {
  const r = R.calculerStudio({
    encM1: [
      P('Fidele', 'F', 69), P('Fidele', 'F', 69),
      P('Baisse', 'B', 69), P('Baisse', 'B', 69),           // pu 69 en M-1
      P('Impaye', 'I', 69), P('Impaye', 'I', 69),
      P('Parti', 'P', 69), P('Parti', 'P', 69),
    ],
    encM: [
      P('Fidele', 'F', 69), P('Fidele', 'F', 69),           // inchangé -> FIDÈLE
      P('Baisse', 'B', 49), P('Baisse', 'B', 49),           // pu ET net en baisse -> baisse
      P('Impaye', 'I', 69), P('Impaye', 'I', -69, true),    // net<=0 + décaissement -> IMPAYÉ
      // Parti : aucune ligne en M -> PARTI
    ],
    signataires: [], choix: {},
  });
  assert.equal(r.nbFideles, 1);
  assert.deepEqual(r.baisses.map((b) => b.cle), ['BAISSE|B']);
  assert.equal(r.nbImpayes, 1);
  assert.equal(r.nbPartis, 1);
  assert.deepEqual(r.disparus.map((d) => d.type).sort(), ['IMPAYE', 'PARTI']);
});

// LE piège métier : le PU décide, pas le total mensuel.
test('piège : mois à 5 semaines ne signale PAS une baisse (net monte, pu stable)', () => {
  const r = R.calculerStudio({
    encM1: [P('X', 'Y', 69), P('X', 'Y', 69), P('X', 'Y', 69), P('X', 'Y', 69)],       // 4 semaines
    encM: [P('X', 'Y', 69), P('X', 'Y', 69), P('X', 'Y', 69), P('X', 'Y', 69), P('X', 'Y', 69)], // 5 semaines
    signataires: [], choix: {},
  });
  assert.equal(r.baisses.length, 0, 'pu identique -> FIDÈLE malgré le net qui monte');
  assert.equal(r.nbFideles, 1);
});

test('piège : montée en gamme (pu monte, net monte) n\'est PAS une baisse', () => {
  const r = R.calculerStudio({
    encM1: [P('X', 'Y', 49), P('X', 'Y', 49), P('X', 'Y', 49), P('X', 'Y', 49)],
    encM: [P('X', 'Y', 69), P('X', 'Y', 69), P('X', 'Y', 69), P('X', 'Y', 69)],
    signataires: [], choix: {},
  });
  assert.equal(r.baisses.length, 0);
  assert.equal(r.nbFideles, 1);
});

test('baisse exige pu EN BAISSE *et* net EN BAISSE (sinon fidèle)', () => {
  // pu baisse (69->49) mais net MONTE (4×69=276 -> 6×49=294) : PAS une baisse.
  const r = R.calculerStudio({
    encM1: [P('X', 'Y', 69), P('X', 'Y', 69), P('X', 'Y', 69), P('X', 'Y', 69)],
    encM: [P('X', 'Y', 49), P('X', 'Y', 49), P('X', 'Y', 49), P('X', 'Y', 49), P('X', 'Y', 49), P('X', 'Y', 49)],
    signataires: [], choix: {},
  });
  assert.equal(r.baisses.length, 0, 'net en hausse -> fidèle, même si pu baisse');
});

// --- §4.4 NOUVEAUX CONTRATS --------------------------------------------------
test('nouveaux : signataire payé en M (net>0) = payé, sinon non payé', () => {
  const r = R.calculerStudio({
    encM1: [], encM: [P('Neuf', 'Paye', 69), P('Neuf', 'Paye', 69)],
    signataires: [
      { cles: R.clesContrat('paye neuf'), nom: 'Neuf', prenom: 'Paye' },
      { cles: R.clesContrat('sanspaiement nouveau'), nom: 'Nouveau', prenom: 'Sanspaiement' },
    ],
    choix: {},
  });
  assert.equal(r.nouveauxPayes, 1);
  assert.equal(r.nouveauxNonPayes.length, 1);
});

// --- §4.5 À QUALIFIER --------------------------------------------------------
test('à qualifier : net(M)>0, hors base, hors signataires', () => {
  const r = R.calculerStudio({
    encM1: [P('Ancien', 'A', 69), P('Ancien', 'A', 69)],   // base
    encM: [
      P('Ancien', 'A', 69), P('Ancien', 'A', 69),          // fidèle
      P('Revenu', 'R', 69), P('Revenu', 'R', 69),          // net>0, pas en base, pas signataire -> à qualifier
    ],
    signataires: [], choix: {},
  });
  assert.deepEqual(r.aQualifier.map((q) => q.cle), ['REVENU|R']);
});

// --- §5 + §6 MENUS ET NOTE ---------------------------------------------------
test('note : formule §6 avec les valeurs par défaut', () => {
  // base=3 (A fidèle, B baisse, C parti). Défaut baisse=arrangement (denom seul).
  const r = R.calculerStudio({
    encM1: [P('A', 'a', 69), P('A', 'a', 69), P('B', 'b', 69), P('B', 'b', 69), P('C', 'c', 69), P('C', 'c', 69)],
    encM: [P('A', 'a', 69), P('A', 'a', 69), P('B', 'b', 49), P('B', 'b', 49)],
    signataires: [], choix: {},
  });
  // fideles=1 (A), base=3, nsig=0, anomalies=0, qual=0.
  assert.equal(r.base, 3);
  assert.equal(r.fideles, 1);
  assert.equal(r.numerateur, 1);
  assert.equal(r.denominateur, 3);
  assert.ok(Math.abs(r.note - 1 / 3) < 1e-9);
});

test('§5.1 « sous contrôle » compte la baisse comme fidèle (num + denom)', () => {
  const input = {
    encM1: [P('A', 'a', 69), P('A', 'a', 69), P('B', 'b', 69), P('B', 'b', 69)],
    encM: [P('A', 'a', 69), P('A', 'a', 69), P('B', 'b', 49), P('B', 'b', 49)],
    signataires: [],
  };
  const defaut = R.calculerStudio(Object.assign({ choix: {} }, input));
  assert.equal(defaut.numerateur, 1, 'arrangement (défaut) : B reste au dénominateur seul');
  assert.equal(defaut.denominateur, 2);
  const controle = R.calculerStudio(Object.assign({ choix: { 'B|B': 'sous_controle' } }, input));
  assert.equal(controle.fideles, 2, 'sous contrôle : B rejoint les fidèles');
  assert.equal(controle.numerateur, 2);
  assert.equal(controle.denominateur, 2);
});

test('§5.2 nouveaux non payés : anomalie (denom seul) vs décalage (num+denom)', () => {
  const base = {
    encM1: [], encM: [],
    signataires: [{ cles: R.clesContrat('x nonpaye'), nom: 'Nonpaye', prenom: 'X' }],
  };
  const anomalie = R.calculerStudio(Object.assign({ choix: {} }, base)); // défaut = anomalie
  assert.equal(anomalie.anomalies, 1);
  assert.equal(anomalie.numerateur, 0);
  assert.equal(anomalie.denominateur, 1, 'l\'anomalie pénalise (dénominateur seul)');
  const cle = anomalie.nouveauxNonPayes[0].cle;
  const decalage = R.calculerStudio(Object.assign({ choix: { [cle]: 'decalage' } }, base));
  assert.equal(decalage.nsig, 1);
  assert.equal(decalage.numerateur, 1, 'décalage : compté comme signé');
  assert.equal(decalage.denominateur, 1);
});

test('§5.3 à qualifier : pack exclu, suspendu/nouveau comptent des 2 côtés', () => {
  const base = {
    encM1: [], encM: [P('Q', 'q', 69), P('Q', 'q', 69)],
    signataires: [],
  };
  const pack = R.calculerStudio(Object.assign({ choix: {} }, base)); // défaut = pack
  assert.equal(pack.qualActifs, 0);
  assert.equal(pack.numerateur, 0);
  assert.equal(pack.denominateur, 0, 'pack de séance : hors calcul');
  const suspendu = R.calculerStudio(Object.assign({ choix: { 'Q|Q': 'suspendu' } }, base));
  assert.equal(suspendu.qualActifs, 1);
  assert.equal(suspendu.numerateur, 1);
  assert.equal(suspendu.denominateur, 1);
});

test('disparus affichés = disparus de la base + anomalies', () => {
  const r = R.calculerStudio({
    encM1: [P('Parti', 'p', 69), P('Parti', 'p', 69)],
    encM: [],
    signataires: [{ cles: R.clesContrat('x mort'), nom: 'Mort', prenom: 'X' }], // non payé -> anomalie par défaut
    choix: {},
  });
  assert.equal(r.nbPartis, 1);
  assert.equal(r.anomalies, 1);
  assert.equal(r.disparusAffichage, 2, '1 parti + 1 anomalie');
});

test('disparu « pack de séance » : EXCLU du dénominateur (remonte la note)', () => {
  const input = {
    encM1: [P('Fidele', 'F', 69), P('Fidele', 'F', 69), P('Parti', 'P', 69), P('Parti', 'P', 69)],
    encM: [P('Fidele', 'F', 69), P('Fidele', 'F', 69)], // Parti disparaît
    signataires: [],
  };
  // Défaut « parti » : 1 fidèle / (2 base) = 1/2.
  const defaut = R.calculerStudio(Object.assign({ choix: {} }, input));
  assert.equal(defaut.nbPartis, 1);
  assert.ok(Math.abs(defaut.note - 1 / 2) < 1e-9, 'parti compté -> 50 %');
  assert.equal(defaut.disparusAffichage, 1);
  // « Pack de séance » : le disparu sort du calcul -> 1 fidèle / (1 base) = 100 %.
  const pack = R.calculerStudio(Object.assign({ choix: { 'PARTI|P': 'pack' } }, input));
  assert.equal(pack.nbDisparuPack, 1);
  assert.equal(pack.nbPartis, 0, 'plus compté comme parti');
  assert.equal(pack.disparusAffichage, 0);
  assert.ok(Math.abs(pack.note - 1) < 1e-9, 'pack exclu -> 100 %');
});

test('disparu « impayé » vs « résilié » : même note (qualification, pas de calcul)', () => {
  const input = {
    encM1: [P('Fidele', 'F', 69), P('Fidele', 'F', 69), P('Parti', 'P', 69), P('Parti', 'P', 69)],
    encM: [P('Fidele', 'F', 69), P('Fidele', 'F', 69)],
    signataires: [],
  };
  const impaye = R.calculerStudio(Object.assign({ choix: { 'PARTI|P': 'impaye' } }, input));
  const resilie = R.calculerStudio(Object.assign({ choix: { 'PARTI|P': 'resilie' } }, input));
  assert.ok(Math.abs(impaye.note - resilie.note) < 1e-9, 'la note ne dépend pas de impayé/résilié');
  assert.ok(Math.abs(impaye.note - 1 / 2) < 1e-9);
  assert.equal(impaye.nbImpayes, 1); assert.equal(impaye.nbPartis, 0);
  assert.equal(resilie.nbPartis, 1); assert.equal(resilie.nbImpayes, 0);
});

// --- §6 NOTE RÉSEAU ----------------------------------------------------------
test('note réseau : Σ numérateurs / Σ dénominateurs (pondérée)', () => {
  const gros = { numerateur: 90, denominateur: 100 }; // 90 %
  const petit = { numerateur: 1, denominateur: 10 };  // 10 %
  // Pondérée : 91/110 ≈ 82,7 %, tirée vers le gros studio (≠ moyenne simple 50 %).
  assert.ok(Math.abs(R.noteReseau([gros, petit]) - 91 / 110) < 1e-9);
  assert.equal(R.noteReseau([]), 0);
});

// --- §3 DÉTECTION DU STUDIO --------------------------------------------------
test('détection M : studio = plus grand nombre de signataires dans le fichier', () => {
  const sig = {
    Lille: new Set(['A|A', 'B|B', 'C|C']),
    Wasquehal: new Set(['X|X', 'Y|Y']),
  };
  const fichier = new Set(['A|A', 'B|B', 'Z|Z']); // 2 signataires de Lille
  assert.equal(R.detecterStudioM(fichier, sig).studio, 'Lille');
});

test('détection M-1 : Jaccard maximal sur la clientèle des fichiers M', () => {
  const fichiersM = {
    Lille: new Set(['A|A', 'B|B', 'C|C', 'D|D']),
    Wasquehal: new Set(['X|X', 'Y|Y']),
  };
  const m1 = new Set(['A|A', 'B|B', 'C|C']); // très proche de Lille
  assert.equal(R.detecterStudioM1(m1, fichiersM).studio, 'Lille');
  assert.ok(Math.abs(R.jaccard(new Set(['a', 'b']), new Set(['b', 'c'])) - 1 / 3) < 1e-9);
});

// --- §7.1 LIEN DECIPLUS ------------------------------------------------------
test('lien Deciplus : URL depuis l\'Id_client, null si inconnu', () => {
  const map = { 'DUPONT|JEAN': '12345' };
  assert.equal(R.lienDeciplus('DUPONT|JEAN', map), 'https://ginkgo-sport.deciplus.pro/nextgen/legacy?path=check.php?idj=12345');
  assert.equal(R.lienDeciplus('INCONNU|X', map), null, 'nom absent du fichier membres -> pas de lien');
});

// --- DÉDUP -------------------------------------------------------------------
test('dédup signataires : un contrat identique n\'est compté qu\'une fois', () => {
  const r = R.calculerStudio({
    encM1: [], encM: [],
    signataires: [
      { cles: R.clesContrat('jean dupont'), nom: 'Dupont', prenom: 'Jean' },
      { cles: R.clesContrat('jean dupont'), nom: 'Dupont', prenom: 'Jean' }, // doublon
    ],
    choix: {},
  });
  assert.equal(r.nouveauxNonPayes.length, 1, 'le doublon est écarté');
});
