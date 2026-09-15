'use strict';
// ============================================================================
//  RECAP 2 — PRISES DE RÉFÉRENCE ET RATTACHEMENT DES COMMERCIAUX PAR IDENTIFIANT.
//
//   · le magasin accepte la nouvelle section, strictement, et les rapports
//     d'avant restent valides ;
//   · la vue commerciale regroupe par identifiant Vendor (le nom n'affiche que)
//     et additionne les prises de référence sur tous les studios ;
//   · un studio en échec n'est jamais compté comme 0 ;
//   · aucun KPI ne bouge ;
//   · août 2026 réel : 9 prises de référence, la répartition exacte de Vendor.
// ============================================================================

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Store = require('../lib/recap2Store.js');
const M = require('../public/recap2-metrics.js');

const MARVIN = '1676534557603x269706782936696800';
const BENJAMIN = '1719949036540x783196276006537000';
const HOMONYME = '1799999999999x111111111111111111';
const ref = (o) => Object.assign({ contactId: '17860174' + String(Math.floor(Math.random() * 1e5)).padStart(5, '0') + 'x189275338672439300',
  client: 'Réf Test', date: '06/08/2026', createurId: MARVIN, createur: 'Marvin B.', statut: 'Contact - Abandonné' }, o);
const vente = (o) => Object.assign({ client: 'Anne A', date: '05/08/2026', prestation: 'COACHING', commercial: 'Marvin B.', commercialId: MARVIN,
  annulee: false, dateAnnulation: '', retrouve: true, site: 'My Coach Neuilly', dateVente: '05/08/2026', idClient: '42001', encaisse: true }, o);

// Un rapport v2 minimal et valide pour le magasin.
function rapport({ refs = {}, ventes = {} } = {}) {
  const studios = {};
  M.LABELS.forEach((s) => {
    const liste = ventes[s] || [];
    const actives = liste.filter((v) => !v.annulee);
    const ret = actives.filter((v) => v.retrouve).length;
    studios[s] = {
      studio: s, avertissements: [],
      nonReconduction: { base: 10, nonReconduits: 1, taux: 0.1, tauxPct: 10, liste: [{ client: 'X Y', netM1: 10, netM: 0 }] },
      clientsRetrouves: { ventesSignees: liste.length, annulees: liste.length - actives.length, ventesActives: actives.length,
        signataires: actives.length, retrouves: ret, taux: actives.length ? ret / actives.length : null,
        tauxPct: actives.length ? +(ret / actives.length * 100).toFixed(1) : null, liste },
    };
    if (refs[s] !== undefined) studios[s].prisesReference = refs[s];
  });
  return { businessVersion: 2, genere: '2026-09-14T16:43:53.932Z', mois: '2026-08', m1: '2026-07', source: {}, studios, journal: [], erreurs: [] };
}
const avecRefs = (liste) => ({ total: liste.length, affiche: liste.length, liste });

test('magasin : section valide acceptée, rapport d\'avant (sans section) toujours valide', () => {
  const r = rapport({ refs: { Neuilly: avecRefs([ref({}), ref({ createurId: BENJAMIN, createur: 'Benjamin C.' })]), Marcq: avecRefs([]), Lille: { echec: 'exhaustivité : 110 reçus pour 111' } },
    ventes: { Neuilly: [vente({})] } });
  assert.deepEqual(Store.valider(r, '2026-08').problemes, []);
  assert.deepEqual(Store.valider(rapport(), '2026-08').problemes, [], 'les rapports déjà déposés restent valides');
  const propre = Store.nettoyer(r);
  assert.equal(propre.studios.Neuilly.prisesReference.total, 2);
  assert.equal(propre.studios.Lille.prisesReference.echec, 'exhaustivité : 110 reçus pour 111');
  assert.equal(propre.studios.Neuilly.clientsRetrouves.liste[0].commercialId, MARVIN);
});

test('magasin : incohérences refusées (total, affiché, identifiants, échec mêlé, doublon)', () => {
  const pb = (pr) => Store.valider(rapport({ refs: { Neuilly: pr } }), '2026-08').problemes.join(' | ');
  const deux = [ref({}), ref({})];
  assert.match(pb({ total: 3, affiche: 3, liste: deux }), /2 ligne\(s\) pour un total de 3/);
  assert.match(pb({ total: 2, affiche: 1, liste: deux }), /affiche : doit égaler le total/);
  assert.match(pb(avecRefs([ref({ createurId: 'Marvin B.' })])), /createurId : identifiant Vendor attendu/);
  assert.match(pb(avecRefs([ref({ date: '2026-08-06' })])), /date : JJ\/MM\/AAAA/);
  assert.match(pb({ echec: 'x', total: 0, liste: [] }), /un échec ne porte ni total ni liste/);
  const c = ref({});
  assert.match(pb(avecRefs([c, Object.assign({}, c)])), /contact en double/);
  assert.match(Store.valider(rapport({ ventes: { Neuilly: [vente({ commercialId: 'Marvin B.' })] } }), '2026-08').problemes.join(), /commercialId : identifiant Vendor ou vide/);
});

test('vue commerciale : regroupement par IDENTIFIANT — deux homonymes restent deux commerciaux', () => {
  const r = rapport({ ventes: { Neuilly: [vente({}), vente({ client: 'Bruno B', commercialId: HOMONYME })] } });
  const liste = M.commerciauxDuRapport(r);
  assert.equal(liste.length, 2, 'même nom affiché « Marvin B. », deux identifiants');
  assert.deepEqual(liste.map((c) => c.cle).sort(), ['id:' + HOMONYME, 'id:' + MARVIN].sort());
  assert.equal(M.consoliderCommercial(r, 'id:' + MARVIN).signees, 1);
});

test('vue commerciale : un nom changé dans Vendor ne coupe pas l\'historique (même identifiant)', () => {
  const r = rapport({ ventes: { Neuilly: [vente({})], Boulogne: [vente({ client: 'Chloé C', commercial: 'Marvin Bxx.' })] } });
  const liste = M.commerciauxDuRapport(r);
  assert.equal(liste.length, 1);
  assert.equal(liste[0].ventes, 2);
});

test('prises de référence : additionnées sur tous les studios, par identifiant d\'auteur', () => {
  const r = rapport({
    refs: { Boulogne: avecRefs([ref({ createurId: BENJAMIN, createur: 'Benjamin C.', date: '08/08/2026' })]),
      Neuilly: avecRefs([ref({}), ref({ date: '06/08/2026' }), ref({ createurId: BENJAMIN, createur: 'Benjamin C.', date: '12/08/2026' })]) },
    ventes: { Neuilly: [vente({})] },
  });
  const liste = M.commerciauxDuRapport(r);
  const benjamin = liste.find((c) => c.cle === 'id:' + BENJAMIN);
  assert.ok(benjamin, 'un commercial sans vente mais avec des références apparaît');
  assert.deepEqual([benjamin.ventes, benjamin.references, benjamin.studios.sort()], [0, 2, ['Boulogne', 'Neuilly']]);
  const d = M.consoliderCommercial(r, 'id:' + BENJAMIN);
  assert.deepEqual(d.references.map((x) => x.studio + ' ' + x.date), ['Boulogne 08/08/2026', 'Neuilly 12/08/2026'], 'triées par date');
  assert.equal(d.nom, 'Benjamin C.');
  assert.equal(M.consoliderCommercial(r, 'id:' + MARVIN).references.length, 2);
});

test('un studio en échec est DIT, jamais compté comme 0', () => {
  const r = rapport({ refs: { Neuilly: avecRefs([ref({})]), Lille: { echec: 'club affiché faux' } }, ventes: { Neuilly: [vente({})] } });
  const d = M.consoliderCommercial(r, 'id:' + MARVIN);
  assert.equal(d.references.length, 1);
  assert.deepEqual(d.referencesIndisponibles.map((x) => x.studio), ['Lille']);
  assert.equal(M.consoliderCommercial(rapport({ ventes: { Neuilly: [vente({})] } }), 'id:' + MARVIN).referencesPresentes, false, 'rapport d\'avant : rien d\'affiché');
});

test('rapport d\'avant (sans identifiant) : la vue par nom fonctionne comme avant', () => {
  const r = rapport({ ventes: { Neuilly: [vente({ commercialId: undefined })] } });
  assert.equal(M.consoliderCommercial(r, 'Marvin B.').signees, 1, 'appel historique par nom');
  assert.equal(M.commerciauxDuRapport(r)[0].cle, 'nom:Marvin B.');
});

test('aucun KPI ne bouge : les références ne touchent ni le magasin des KPI ni la vue', () => {
  const sans = rapport({ ventes: { Neuilly: [vente({}), vente({ client: 'Z', retrouve: false, idClient: '', encaisse: false })] } });
  const avec = JSON.parse(JSON.stringify(sans));
  avec.studios.Neuilly.prisesReference = avecRefs([ref({}), ref({})]);
  ['nonReconduction', 'clientsRetrouves'].forEach((k) => {
    assert.deepEqual(Store.nettoyer(avec).studios.Neuilly[k], Store.nettoyer(sans).studios.Neuilly[k], k);
  });
  const a = M.consoliderCommercial(avec, 'id:' + MARVIN), s = M.consoliderCommercial(sans, 'id:' + MARVIN);
  ['signees', 'annulees', 'total', 'retrouves', 'aVerifier', 'taux'].forEach((k) => assert.equal(a[k], s[k], k));
});

test('écran : compteur « N prises de référence » et détail date · studio · contact · commercial · statut', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'recap2.js'), 'utf8');
  const compteur = src.slice(src.indexOf('function compteurReferences'), src.indexOf('function detailReferences'));
  assert.match(compteur, /d\.references\.length/);
  assert.match(compteur, /'prises de référence' : 'prise de référence'/);
  const detail = src.slice(src.indexOf('function detailReferences'), src.indexOf('// ── INTERACTIONS'));
  assert.match(detail, /<th class="rec2-num">Date<\/th><th>Studio<\/th>'\s*\+ '<th>Contact référencé<\/th><th>Commercial<\/th><th>Statut<\/th>/);
  assert.match(detail, /referencesIndisponibles/, 'les studios en échec sont nommés');
  const sel = src.slice(src.indexOf('function majSelecteurCommercial'), src.indexOf('function moisParDefaut'));
  assert.match(sel, /value="' \+ esc\(c\.cle\)/, 'la valeur du sélecteur est la clé (identifiant), pas le nom');
});

// ── AOÛT 2026 RÉEL ─────────────────────────────────────────────────────────
const REEL = path.join(__dirname, '..', 'crm-automation', '.session', 'controle', 'recap2-2026-08.json');
const reel = fs.existsSync(REEL) ? JSON.parse(fs.readFileSync(REEL, 'utf8')) : null;
const avecSection = reel && M.LABELS.every((s) => reel.studios[s] && reel.studios[s].prisesReference);
test('août 2026 réel : 9 prises de référence, répartition identique à Vendor', { skip: !avecSection && 'rapport local sans prises de référence' }, () => {
  const parStudio = Object.fromEntries(M.LABELS.map((s) => [s, reel.studios[s].prisesReference.total]));
  assert.deepEqual(parStudio, { Lille: 1, Wasquehal: 2, Marcq: 0, Boulogne: 1, Levallois: 2, Neuilly: 3 });
  M.LABELS.forEach((s) => assert.equal(reel.studios[s].prisesReference.affiche, reel.studios[s].prisesReference.total, s + ' = écran Vendor'));
  const parAuteur = {};
  M.referencesDuRapport(reel).liste.forEach((r) => { parAuteur[r.createurId] = (parAuteur[r.createurId] || 0) + 1; });
  assert.deepEqual(parAuteur, {
    '1676534557603x269706782936696800': 2, // Marvin B. — Neuilly
    '1719949036540x783196276006537000': 2, // Benjamin C. — Boulogne + Neuilly
    '1674481440746x588221726139669400': 2, // Luca R. — Levallois
    '1669303222657x648298562822821900': 2, // Magali G. — Wasquehal
    '1638283322062x610405598290114400': 1, // Fabian F. — Lille
  });
  assert.deepEqual(Store.valider(reel, '2026-08').problemes, []);
});
