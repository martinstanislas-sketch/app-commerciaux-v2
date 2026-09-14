'use strict';
// ============================================================================
//  LES DEUX DESTINATIONS D'UN NOM CLIQUABLE — et la frontière entre elles.
//
//   · client RETROUVÉ + Id_client fiable  -> SA FICHE Deciplus, directement ;
//   · tout le reste (« à vérifier », annulé) -> l'écran MEMBRES, pour chercher.
//
//  ⚠️ POURQUOI PAS UNE RECHERCHE PRÉREMPLIE. Vérifié sur le CRM le 2026-09-14 :
//  `select.php` ignore les paramètres d'URL — le contenu de l'écran est
//  RIGOUREUSEMENT identique avec et sans « ?nom=… », les champs restent vides
//  et aucune recherche ne s'exécute. On ne peut donc qu'ouvrir l'écran. Le lien
//  le dit (libellé, infobulle, icône) et ne se fait jamais passer pour une
//  fiche ; le nom part dans le presse-papiers pour éviter la ressaisie.
//
//  ⚠️ ON NE FABRIQUE JAMAIS D'ID. Un lien de fiche erroné ouvrirait le dossier
//  de quelqu'un d'autre : c'est pire que pas de lien du tout.
// ============================================================================

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const R = require('../../public/retention.js');
const M = require('../../public/recap2-metrics.js');

const FICHE = /^https:\/\/ginkgo-sport\.deciplus\.pro\/nextgen\/legacy\?path=check\.php\?idj=\d+$/;
const MEMBRES = 'https://ginkgo-sport.deciplus.pro/nextgen/legacy?path=select.php';

// La décision exacte que prend l'écran (public/recap2.js, nomClient()).
function destination(v) {
  const href = (v && v.retrouve) ? R.lienDeciplusId(v.idClient) : null;
  if (href) return { type: 'fiche', href };
  return { type: 'recherche', href: R.lienRechercheDeciplus(), copie: v && v.client };
}

const ligne = (o) => Object.assign(
  { client: 'X Y', retrouve: false, annulee: false, idClient: '' }, o);

// ── 1. RETROUVÉ + Id_client -> FICHE DIRECTE ────────────────────────────────
test('1. retrouvé avec Id_client -> sa fiche, directement', () => {
  const d = destination(ligne({ client: 'Aline Lepretre', retrouve: true, idClient: '42084' }));
  assert.equal(d.type, 'fiche');
  assert.match(d.href, FICHE);
  assert.ok(d.href.endsWith('idj=42084'));
});

// ── 2. À VÉRIFIER -> RECHERCHE ──────────────────────────────────────────────
test('2. « à vérifier » -> l\'écran Membres, et le nom à coller', () => {
  const d = destination(ligne({ client: 'Esther Jhureea', retrouve: false }));
  assert.equal(d.type, 'recherche');
  assert.equal(d.href, MEMBRES);
  assert.equal(d.copie, 'Esther Jhureea', 'le nom part au presse-papiers');
  assert.doesNotMatch(d.href, /check\.php/, 'ce n\'est PAS une fiche');
});

test('un retrouvé SANS id bascule aussi sur la recherche, jamais sur une fiche', () => {
  const d = destination(ligne({ client: 'Sans Id', retrouve: true, idClient: '' }));
  assert.equal(d.type, 'recherche');
  assert.equal(d.href, MEMBRES);
});

test('une vente ANNULÉE mène à la recherche, pas à une fiche', () => {
  // Elle n'a pas d'Id_client par construction : on ne la cherche pas dans le
  // journal des ventes. Son nom reste consultable à la main.
  const d = destination(ligne({ client: 'Dei Muteba', annulee: true, retrouve: false }));
  assert.equal(d.type, 'recherche');
});

// ── 3. AUCUNE FABRICATION D'ID ──────────────────────────────────────────────
test('3. aucun id fabriqué : tout ce qui n\'est pas numérique bascule en recherche', () => {
  ['abc', '12a', '-5', '1.5', ' ', '../../etc', '<script>', 'null', '0x10']
    .forEach((id) => {
      const d = destination(ligne({ client: 'A B', retrouve: true, idClient: id }));
      assert.equal(d.type, 'recherche', 'refusé comme fiche : ' + JSON.stringify(id));
    });
  assert.equal(R.lienDeciplusId('41718'), 'https://ginkgo-sport.deciplus.pro/nextgen/legacy?path=check.php?idj=41718');
});

test('l\'écran Membres ne porte AUCUN paramètre de recherche', () => {
  // Deciplus les ignore : en ajouter donnerait l'illusion d'une recherche
  // préremplie qui n'existe pas.
  const u = R.lienRechercheDeciplus();
  assert.equal(u, MEMBRES);
  assert.doesNotMatch(u, /[?&]nom=/);
  assert.doesNotMatch(u, /[?&]prenom=/);
});

// ── 4. LE RENDU : nouvel onglet, et jamais d'ambiguïté ──────────────────────
test('4. les deux liens s\'ouvrent dans un nouvel onglet, sans donner la main', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'recap2.js'), 'utf8');
  const i = src.indexOf('function nomClient');
  const bloc = src.slice(i, i + 1800);
  assert.equal((bloc.match(/target="_blank"/g) || []).length, 2, 'les DEUX destinations');
  assert.equal((bloc.match(/rel="noopener noreferrer"/g) || []).length, 2);
  assert.match(bloc, /lienDeciplusId/, 'la fiche vient de l\'Id_client');
  assert.match(bloc, /lienRechercheDeciplus/, 'la recherche vient du helper dédié');
  assert.match(bloc, /data-copier=/, 'le nom est copié pour éviter la ressaisie');
  assert.match(bloc, /rec2-lien-rech/, 'une classe distincte : l\'œil ne doit pas confondre');
  assert.match(bloc, /↗/, 'l\'icône dit que ce n\'est pas la fiche');
});

test('le clic de recherche ne bloque jamais l\'ouverture du lien', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'recap2.js'), 'utf8');
  const i = src.indexOf('const rech = e.target.closest(\'[data-copier]\')');
  assert.ok(i > 0, 'le gestionnaire existe');
  const bloc = src.slice(i, i + 500);
  assert.match(bloc, /catch/, 'une copie refusée par le navigateur est sans conséquence');
  assert.doesNotMatch(bloc, /preventDefault/, 'on ne préempte pas la navigation');
});

// ── SUR LE RAPPORT RÉEL ─────────────────────────────────────────────────────
const REEL = path.join(__dirname, '..', '.session', 'controle', 'recap2-2026-08.json');
test('août réel : chaque ligne a une destination, et la bonne',
  { skip: !fs.existsSync(REEL) && 'rapport local absent' }, () => {
    const r = JSON.parse(fs.readFileSync(REEL, 'utf8'));
    if (r.businessVersion !== 2) return;
    const toutes = M.ventesDuRapport(r);
    assert.ok(toutes.length > 0);
    let fiches = 0, recherches = 0;
    toutes.forEach((v) => {
      const d = destination(v);
      if (d.type === 'fiche') {
        fiches += 1;
        assert.equal(v.retrouve, true, v.client + ' : une fiche suppose un client retrouvé');
        assert.equal(v.annulee, false, v.client + ' : une annulée n\'a pas de fiche');
        assert.match(d.href, FICHE);
      } else {
        recherches += 1;
        assert.equal(d.href, MEMBRES);
      }
    });
    assert.ok(fiches > 0, 'des fiches directes');
    assert.ok(recherches > 0, 'et des recherches pour le reste');
    assert.equal(fiches + recherches, toutes.length, 'aucune ligne sans destination');
  });
