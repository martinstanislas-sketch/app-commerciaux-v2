'use strict';
// ============================================================================
//  VUE PAR COMMERCIAL — une LECTURE du rapport v2, jamais un second calcul.
//
//  Ce que ces tests verrouillent :
//   1. un commercial qui vend dans plusieurs studios est consolidé en UNE vue ;
//   2. son taux vaut retrouvés / ventes, et reste cohérent avec les studios ;
//   3. les ventes annulées n'y entrent jamais (elles n'entrent pas dans le
//      détail en amont) ;
//   4. le studio d'ORIGINE Fitness Booster reste porté par chaque ligne ;
//   5. le site Deciplus divergent est conservé, pas gommé ;
//   6. les filtres Tous / Retrouvés / À vérifier partitionnent exactement ;
//   7. la NON-RECONDUCTION n'est jamais touchée par ce filtre ;
//   8. les rapports v1 restent lisibles et ne produisent aucun commercial.
// ============================================================================

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const M = require('../../public/recap2-metrics.js');

// Un rapport v2 minimal, écrit à la main pour que chaque cas soit lisible.
const vente = (o) => Object.assign({
  client: 'X', date: '01/08/2026', prestation: 'Challenge', commercial: 'Fabian F.',
  retrouve: true, site: '', dateVente: '', encaisse: true,
}, o);

function rapport(parStudio) {
  const studios = {};
  M.LABELS.forEach((s) => {
    const liste = parStudio[s] || [];
    studios[s] = {
      studio: s,
      nonReconduction: { base: 10, nonReconduits: 3, taux: 0.3, tauxPct: 30, liste: [] },
      clientsRetrouves: {
        ventesSignees: liste.length, annulesExclus: 0, ventesValides: liste.length,
        signataires: liste.length, retrouves: liste.filter((v) => v.retrouve).length,
        taux: liste.length ? liste.filter((v) => v.retrouve).length / liste.length : null,
        liste,
      },
      avertissements: [], controleBloquant: { ok: true },
    };
  });
  return { businessVersion: 2, mois: '2026-08', m1: '2026-07', studios, source: {}, journal: [], erreurs: [] };
}

// ── 1. PLUSIEURS STUDIOS, UNE SEULE VUE ─────────────────────────────────────
test('un commercial qui vend dans 3 studios est consolidé en une vue', () => {
  const r = rapport({
    Lille: [vente({ client: 'A' }), vente({ client: 'B' })],
    Wasquehal: [vente({ client: 'C' })],
    Marcq: [vente({ client: 'D', retrouve: false })],
    Neuilly: [vente({ client: 'E', commercial: 'Marvin B.' })], // un autre : exclu
  });
  const d = M.consoliderCommercial(r, 'Fabian F.');
  assert.equal(d.total, 4, 'ses 4 ventes, et seulement les siennes');
  assert.deepEqual(d.studios.sort(), ['Lille', 'Marcq', 'Wasquehal']);
  assert.equal(d.ventes.some((v) => v.client === 'E'), false, 'la vente d\'un autre commercial n\'entre pas');
});

// ── 2. LE CALCUL ────────────────────────────────────────────────────────────
test('taux = retrouvés / ventes, et « à vérifier » complète exactement', () => {
  const r = rapport({
    Lille: [vente({ client: 'A' }), vente({ client: 'B' }), vente({ client: 'C', retrouve: false })],
    Boulogne: [vente({ client: 'D' })],
  });
  const d = M.consoliderCommercial(r, 'Fabian F.');
  assert.equal(d.total, 4);
  assert.equal(d.retrouves, 3);
  assert.equal(d.aVerifier, 1);
  assert.equal(d.total, d.retrouves + d.aVerifier, 'aucune vente ne disparaît entre les deux');
  assert.equal(+(d.taux * 100).toFixed(1), 75);
});

test('un commercial sans vente : taux null, jamais 0 % ni NaN', () => {
  const d = M.consoliderCommercial(rapport({ Lille: [vente({})] }), 'Fantôme X.');
  assert.equal(d.total, 0);
  assert.equal(d.taux, null);
  assert.deepEqual(d.ventes, []);
});

// ── 3. VENTES ANNULÉES ──────────────────────────────────────────────────────
test('les ventes annulées ne sont pas dans le dénominateur du commercial', () => {
  // Une annulée n'entre JAMAIS dans le détail : la collecte l'écarte avant.
  // On le vérifie par le bout visible : le total du commercial suit la liste,
  // et `annulesExclus` reste une information de studio, pas une vente à compter.
  const r = rapport({ Lille: [vente({ client: 'A' }), vente({ client: 'B' })] });
  r.studios.Lille.clientsRetrouves.ventesSignees = 3;
  r.studios.Lille.clientsRetrouves.annulesExclus = 1;
  const d = M.consoliderCommercial(r, 'Fabian F.');
  assert.equal(d.total, 2, '3 signées − 1 annulée = 2 valides, et c\'est bien 2 qu\'on compte');
});

// ── 4. LE STUDIO D'ORIGINE ──────────────────────────────────────────────────
test('chaque ligne porte son studio Fitness Booster d\'origine', () => {
  const r = rapport({ Lille: [vente({ client: 'A' })], Neuilly: [vente({ client: 'B' })] });
  const d = M.consoliderCommercial(r, 'Fabian F.');
  assert.equal(d.ventes.find((v) => v.client === 'A').studio, 'Lille');
  assert.equal(d.ventes.find((v) => v.client === 'B').studio, 'Neuilly');
});

// ── 5. SITE DECIPLUS DIVERGENT ──────────────────────────────────────────────
test('le site Deciplus divergent est conservé sur la ligne', () => {
  // Cas réel d'août : porté par Marcq côté FB, enregistré sur Wasquehal.
  const r = rapport({ Marcq: [vente({ client: 'Mustapha Teir', site: 'My Coach Wasquehal', dateVente: '27/08/2026' })] });
  const v = M.consoliderCommercial(r, 'Fabian F.').ventes[0];
  assert.equal(v.studio, 'Marcq', 'l\'origine reste Marcq');
  assert.equal(v.site, 'My Coach Wasquehal', 'et le site trouvé reste dicible');
  assert.notEqual(M.studioLabel(v.site), v.studio, 'c\'est bien une divergence, pas un doublon d\'info');
});

test('« pas encore encaissé » reste une note, jamais un « à vérifier »', () => {
  const r = rapport({ Lille: [vente({ client: 'A', retrouve: true, encaisse: false })] });
  const v = M.consoliderCommercial(r, 'Fabian F.').ventes[0];
  assert.equal(v.retrouve, true, 'le paiement n\'est PAS le critère de présence CRM');
  assert.equal(v.encaisse, false);
  assert.equal(M.consoliderCommercial(r, 'Fabian F.').aVerifier, 0);
});

// ── 6. LES FILTRES ──────────────────────────────────────────────────────────
test('Tous / Retrouvés / À vérifier partitionnent exactement la liste', () => {
  const r = rapport({
    Lille: [vente({ client: 'A' }), vente({ client: 'B', retrouve: false })],
    Marcq: [vente({ client: 'C' })],
  });
  const d = M.consoliderCommercial(r, 'Fabian F.');
  const retrouves = d.ventes.filter((v) => v.retrouve);
  const verifier = d.ventes.filter((v) => !v.retrouve);
  assert.equal(retrouves.length, d.retrouves);
  assert.equal(verifier.length, d.aVerifier);
  assert.equal(retrouves.length + verifier.length, d.ventes.length);
});

// ── LA LISTE DES COMMERCIAUX ────────────────────────────────────────────────
test('les commerciaux sont dérivés des données, jamais écrits en dur', () => {
  const r = rapport({
    Lille: [vente({ commercial: 'Fabian F.' }), vente({ commercial: 'Fabian F.' })],
    Neuilly: [vente({ commercial: 'Marvin B.' })],
  });
  const liste = M.commerciauxDuRapport(r);
  assert.deepEqual(liste.map((c) => c.commercial), ['Fabian F.', 'Marvin B.'], 'triés par volume décroissant');
  assert.equal(liste[0].ventes, 2);
});

test('deux libellés DIFFÉRENTS restent deux commerciaux — aucune fusion', () => {
  // « Paméla  L. » (deux espaces) existe dans les vraies données. On ne le
  // confond pas avec « Paméla L. » : ce pourrait être deux personnes.
  const r = rapport({
    Lille: [vente({ commercial: 'Paméla  L.' })],
    Marcq: [vente({ commercial: 'Paméla L.' })],
  });
  assert.equal(M.commerciauxDuRapport(r).length, 2, 'deux entrées distinctes');
  assert.equal(M.consoliderCommercial(r, 'Paméla  L.').total, 1, 'chacun garde ses ventes');
  // L'assainissement est réservé à l'AFFICHAGE.
  assert.equal(M.libelleCommercial('Paméla  L.'), 'Paméla L.');
});

// ── 7. LA NON-RECONDUCTION NE BOUGE PAS ─────────────────────────────────────
test('NON-RECONDUCTION : le filtre commercial ne la touche pas', () => {
  const r = rapport({ Lille: [vente({ client: 'A' })], Neuilly: [vente({ client: 'B', commercial: 'Marvin B.' })] });
  const avant = JSON.parse(JSON.stringify(M.LABELS.map((s) => r.studios[s].nonReconduction)));
  M.consoliderCommercial(r, 'Fabian F.');
  M.commerciauxDuRapport(r);
  M.ventesDuRapport(r);
  const apres = M.LABELS.map((s) => r.studios[s].nonReconduction);
  assert.deepEqual(apres, avant, 'aucune fonction de cette vue ne modifie la non-reconduction');
  // Et elle ne porte aucun commercial : ce n'est pas une vente.
  assert.equal('commercial' in (r.studios.Lille.nonReconduction || {}), false);
});

// ── 8. LES RAPPORTS v1 ──────────────────────────────────────────────────────
test('un rapport v1 ne produit aucun commercial, et ne casse pas', () => {
  const v1 = {
    mois: '2026-06', m1: '2026-05', studios: {}, source: {}, journal: [], erreurs: [],
  };
  M.LABELS.forEach((s) => {
    v1.studios[s] = {
      studio: s,
      nonReconduction: { base: 10, nonReconduits: 3, taux: 0.3, tauxPct: 30, liste: [] },
      completion: { contratsValides: 2, ontPaye: 1, taux: 0.5, tauxPct: 50, liste: [{ contrat: 'A', date: '', paye: true }] },
      avertissements: [], controleBloquant: { ok: true },
    };
  });
  assert.deepEqual(M.commerciauxDuRapport(v1), [], 'pas de commercial dans la règle v1');
  assert.deepEqual(M.ventesDuRapport(v1), []);
  assert.equal(M.consoliderCommercial(v1, 'Fabian F.').total, 0);
});

test('un rapport vide ou biscornu ne fait pas tomber la vue', () => {
  [null, undefined, {}, { studios: null }, { studios: { Lille: {} } }].forEach((r) => {
    assert.deepEqual(M.ventesDuRapport(r), []);
    assert.deepEqual(M.commerciauxDuRapport(r), []);
    assert.equal(M.consoliderCommercial(r, 'X').total, 0);
  });
});

// ── SUR LE VRAI RAPPORT D'AOÛT ──────────────────────────────────────────────
const REEL = path.join(__dirname, '..', '.session', 'controle', 'recap2-2026-08.json');
const dispo = fs.existsSync(REEL);

test('août 2026 réel : la somme des commerciaux = la somme des studios',
  { skip: !dispo && 'rapport local absent' }, () => {
    const r = JSON.parse(fs.readFileSync(REEL, 'utf8'));
    if (r.businessVersion !== 2) return;
    const parStudio = M.LABELS.reduce((a, s) => {
      const cr = r.studios[s].clientsRetrouves;
      return { t: a.t + cr.signataires, r: a.r + cr.retrouves };
    }, { t: 0, r: 0 });
    const parCom = M.commerciauxDuRapport(r).reduce((a, c) => ({ t: a.t + c.ventes, r: a.r + c.retrouves }), { t: 0, r: 0 });
    assert.deepEqual(parCom, parStudio,
      'aucune vente ne peut apparaître ou disparaître selon l\'axe de lecture');
  });

test('août 2026 réel : un commercial multi-studios est bien consolidé',
  { skip: !dispo && 'rapport local absent' }, () => {
    const r = JSON.parse(fs.readFileSync(REEL, 'utf8'));
    if (r.businessVersion !== 2) return;
    const multi = M.commerciauxDuRapport(r).find((c) => c.studios.length > 1);
    assert.ok(multi, 'au moins un commercial vend dans plusieurs studios');
    const d = M.consoliderCommercial(r, multi.commercial);
    assert.equal(d.total, multi.ventes);
    assert.equal(d.retrouves, multi.retrouves);
    assert.ok(d.studios.length > 1);
    // Chaque ligne consolidée existe bien dans le studio qu'elle annonce.
    d.ventes.forEach((v) => {
      const source = r.studios[v.studio].clientsRetrouves.liste;
      assert.ok(source.some((x) => x.client === v.client && x.commercial === v.commercial),
        v.client + ' doit exister dans ' + v.studio);
    });
  });

// ── LIEN VERS LA FICHE DECIPLUS ─────────────────────────────────────────────
//  Le lien se construit EXCLUSIVEMENT depuis l'Id_client rendu par Deciplus.
//  Ces tests décrivent la règle côté données ; le rendu HTML l'applique
//  telle quelle (public/recap2.js, nomClient()).
const R = require('../../public/retention.js');
const Store = require('../../lib/recap2Store.js');

// La décision exacte que prend l'écran : lien, ou texte simple.
const lienDe = (v) => (v && v.retrouve ? R.lienDeciplusId(v.idClient) : null);

test('1. client retrouvé AVEC Id_client -> lien vers la bonne fiche', () => {
  const v = vente({ client: 'Camille Gremez', retrouve: true, idClient: '41718' });
  assert.equal(lienDe(v), 'https://ginkgo-sport.deciplus.pro/nextgen/legacy?path=check.php?idj=41718');
});

test('2. client retrouvé SANS Id_client -> aucun lien, le nom reste du texte', () => {
  assert.equal(lienDe(vente({ retrouve: true, idClient: '' })), null);
  assert.equal(lienDe(vente({ retrouve: true, idClient: undefined })), null);
  assert.equal(lienDe(vente({ retrouve: true, idClient: null })), null);
});

test('3. client « à vérifier » -> jamais de lien, même si un id traînait', () => {
  // Ceinture : un « à vérifier » n'a pas de vente, donc pas d'id. Si un id
  // apparaissait malgré tout, on ne doit PAS en faire un lien.
  assert.equal(lienDe(vente({ retrouve: false, idClient: '' })), null);
  assert.equal(lienDe(vente({ retrouve: false, idClient: '41718' })), null);
});

test('ON NE FABRIQUE JAMAIS D\'ID : tout ce qui n\'est pas numérique est refusé', () => {
  ['', ' ', 'abc', '12a', '4171 8', '../../etc', '<script>', '0x10', '-5', '1.5', null, undefined]
    .forEach((id) => assert.equal(R.lienDeciplusId(id), null, 'refusé : ' + JSON.stringify(id)));
  assert.equal(R.lienDeciplusId('  41718  '), 'https://ginkgo-sport.deciplus.pro/nextgen/legacy?path=check.php?idj=41718',
    'les espaces autour sont tolérés, le contenu non');
});

test('le magasin refuse un Id_client bricolé, et un id sur un « à vérifier »', () => {
  const base = () => {
    const r = rapport({ Lille: [vente({ client: 'A', retrouve: true, idClient: '41718' })] });
    r.studios.Lille.clientsRetrouves.ventesSignees = 1;
    return r;
  };
  assert.equal(Store.valider(base(), '2026-08').ok, false, 'ce rapport de test n\'a pas de source : on ne juge que le message');
  const pbDe = (mut) => { const r = base(); mut(r.studios.Lille.clientsRetrouves.liste[0]); return Store.valider(r, '2026-08').problemes.join(' '); };
  assert.match(pbDe((l) => { l.idClient = '41a18'; }), /n'est pas un Id_client Deciplus/);
  assert.match(pbDe((l) => { l.retrouve = false; }), /« à vérifier » ne peut pas porter d'Id_client/);
  assert.doesNotMatch(pbDe(() => {}), /Id_client/, 'un id valide sur un retrouvé ne pose aucun problème');
});

test('nettoyer() efface tout id non plausible ou orphelin', () => {
  const r = rapport({ Lille: [
    vente({ client: 'A', retrouve: true, idClient: '41718' }),
    vente({ client: 'B', retrouve: true, idClient: 'DROP TABLE' }),
    vente({ client: 'C', retrouve: false, idClient: '999' }),
  ] });
  const l = Store.nettoyer(r).studios.Lille.clientsRetrouves.liste;
  assert.equal(l.find((x) => x.client === 'A').idClient, '41718', 'le bon id survit');
  assert.equal(l.find((x) => x.client === 'B').idClient, '', 'l\'id douteux est effacé');
  assert.equal(l.find((x) => x.client === 'C').idClient, '', 'l\'id orphelin est effacé');
});

test('4. le lien s\'ouvre dans un NOUVEL onglet, sans donner la main à la page ouverte', () => {
  // Le rendu est dans public/recap2.js : on vérifie le contrat sur la source,
  // faute de DOM ici. target=_blank ET rel=noopener noreferrer, ensemble.
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'recap2.js'), 'utf8');
  const bloc = src.slice(src.indexOf('function nomClient'), src.indexOf('function nomClient') + 1200);
  assert.match(bloc, /target="_blank"/, 'nouvel onglet');
  assert.match(bloc, /rel="noopener noreferrer"/, 'la page ouverte ne doit pas manipuler RECAP 2');
  assert.match(bloc, /lienDeciplusId/, 'le lien vient de l\'Id_client, jamais d\'une recherche par nom');
  assert.match(bloc, /if \(!v \|\| !v\.retrouve\) return nom;/, 'un « à vérifier » n\'est jamais un lien');
});

test('août 2026 réel : les retrouvés portent un id, les « à vérifier » aucun',
  { skip: !dispo && 'rapport local absent' }, () => {
    const r = JSON.parse(fs.readFileSync(REEL, 'utf8'));
    if (r.businessVersion !== 2) return;
    const toutes = M.ventesDuRapport(r);
    if (!toutes.some((v) => 'idClient' in v)) return; // rapport d'avant le lien
    toutes.filter((v) => !v.retrouve).forEach((v) => {
      assert.equal(v.idClient || '', '', v.client + ' : un « à vérifier » ne porte pas d\'id');
    });
    const avecLien = toutes.filter((v) => v.retrouve && lienDe(v));
    assert.ok(avecLien.length > 0, 'au moins un client retrouvé est cliquable');
    avecLien.forEach((v) => assert.match(lienDe(v), /^https:\/\/ginkgo-sport\.deciplus\.pro\/nextgen\/legacy\?path=check\.php\?idj=\d+$/));
  });
