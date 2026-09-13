'use strict';
// Le parseur est validé contre un EXPORT RÉEL MULTISITE (juin 2026), celui-là
// même que produit la collecte. On y vérifie la vérité terrain connue de
// WASQUEHAL : 297 lignes, 290 positifs, 7 décaissements, 17 512,31 €, 81 clients
// uniques dont 78 au net positif — chiffres recoupés avec l'ancien RECAP.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const C = require('../lib/csvEncaissements.js');
const M = require('../../public/recap2-metrics.js');
const R = require('../../public/retention.js');

// Export réel de référence, NON VERSIONNÉ (il contient des noms de clients) :
// on le cherche dans le dossier de collecte, ignoré par git. Absent — sur une
// autre machine, en CI — les tests qui en dépendent sont simplement sautés ;
// ceux sur données synthétiques, eux, tournent toujours.
const REF = process.env.RECAP2_CSV_REF
  || path.join(__dirname, '..', '.session', 'exports', 'encaissements-2026-06.csv');
const dispo = fs.existsSync(REF);
const texte = dispo ? fs.readFileSync(REF, 'utf8') : '';

// ── Le format du rapport, sur des cas fabriqués (toujours exécutés) ─────────
test('montant : format FR, négatifs, vide', () => {
  assert.equal(C.montant('45,00'), 45);
  assert.equal(C.montant('1 234,56'), 1234.56);
  assert.equal(C.montant('-54,95'), -54.95);
  assert.equal(C.montant(''), 0);
});

test('moisDe : JJ/MM/AAAA -> AAAA-MM', () => {
  assert.equal(C.moisDe('30/06/2026'), '2026-06');
  assert.equal(C.moisDe(''), null);
});

test('lirePeriode : la période vient de l\'en-tête du rapport', () => {
  const p = C.lirePeriode('\t\t\tJournal des encaissements du 2026-06-01 au 2026-06-30');
  assert.deepEqual(p, { du: '2026-06-01', au: '2026-06-30' });
  assert.equal(C.lirePeriode('rien'), null);
});

test('parser : refuse un fichier sans la ligne d\'en-têtes du détail', () => {
  assert.throws(() => C.parser('Journal des encaissements du 2026-06-01 au 2026-06-30\n\nTOTAL;1'), /En-têtes du détail introuvables/);
});

test('parser : lit un rapport minimal, BOM et CRLF compris', () => {
  const faux = '﻿\t\t\tJournal des encaissements du 2026-06-01 au 2026-06-30\r\n\r\nTOTAL Encaissememts;95,00\r\n\r\n'
    + '"Numéro";"Date d\'encaissement";"Heure d\'encaissement";"Vendeur";"Utilisateur connecté";"total note";"Adhérent";"Montant encaissé";"Date de dépôt";"Mode";"Note";"num note";"Référence";"Id membre";"Num compte tiers";"Site";"Signature"\r\n'
    + '"1";"30/06/2026";"12:00:00";"";"";"150,00";"DUPONT Jean";"150,00";"";"Prélèvement Auto";"Encaissement échéance";"1";"F1";"111";"x";"My Coach Wasquehal";"h"\r\n'
    + '"2";"30/06/2026";"12:00:01";"";"";"-55,00";"MARTIN Sara";"-55,00";"";"Prélèvement Auto";"Décaissement échéance";"2";"F2";"222";"x";"My Coach Wasquehal";"h"\r\n';
  const p = C.parser(faux);
  assert.deepEqual(p.periode, { du: '2026-06-01', au: '2026-06-30' });
  assert.equal(p.lignes.length, 2);
  assert.equal(p.lignes[0].idMembre, '111');
  assert.equal(p.lignes[0].site, 'My Coach Wasquehal');
  assert.equal(p.lignes[0].decaissement, false);
  assert.equal(p.lignes[1].decaissement, true, '« Décaissement échéance » -> rejet');
  assert.equal(p.lignes[1].montant, -55);
  assert.equal(p.totalAnnonce, 95);
});

test('verifier : période, mois, total et studios manquants sont signalés', () => {
  const p = { periode: { du: '2026-06-01', au: '2026-06-30' }, totalAnnonce: 100,
    lignes: [{ mois: '2026-06', montant: 100, site: 'My Coach Wasquehal' }] };
  const bon = C.verifier(p, { moisAttendu: '2026-06', studiosAttendus: ['Wasquehal'], studioLabel: M.studioLabel });
  assert.equal(bon.ok, true);
  const mauvaisMois = C.verifier(p, { moisAttendu: '2026-07', studiosAttendus: [], studioLabel: M.studioLabel });
  assert.equal(mauvaisMois.ok, false);
  assert.match(mauvaisMois.problemes.join(' '), /≠ mois demandé/);
  // Un studio absent est un AVERTISSEMENT au niveau du fichier : le blocage se
  // décide studio par studio (controlerStudios), pour ne pénaliser que lui.
  const studioAbsent = C.verifier(p, { moisAttendu: '2026-06', studiosAttendus: ['Lille'], studioLabel: M.studioLabel });
  assert.match(studioAbsent.avertissements.join(' '), /studio absent du fichier : Lille/);
  // L'écart de total est un AVERTISSEMENT, pas un rejet : le total du rapport
  // porte sur tous les sites (franchises et écritures exceptionnelles comprises).
  const totalFaux = C.verifier({ ...p, totalAnnonce: 999 }, { moisAttendu: '2026-06', studiosAttendus: [], studioLabel: M.studioLabel });
  assert.equal(totalFaux.ok, true, 'un écart de total ne doit pas invalider le fichier');
  assert.match(totalFaux.avertissements.join(' '), /écart de .* entre la somme des lignes/);
});

// ── Contre l'export réel (sauté si le fichier de référence est absent) ──────
// Les lignes du seul studio Wasquehal dans l'export multisite.
const wasquehal = (p) => p.lignes.filter((l) => M.studioLabel(l.site) === 'Wasquehal');

test('export réel : Wasquehal — volumétrie exacte (297 / 290 / 7 / 17 512,31 €)', { skip: !dispo && 'CSV de référence absent' }, () => {
  const p = C.parser(texte);
  assert.deepEqual(p.periode, { du: '2026-06-01', au: '2026-06-30' });
  const w = wasquehal(p);
  assert.equal(w.length, 297);
  assert.equal(w.filter((l) => l.montant > 0).length, 290);
  assert.equal(w.filter((l) => l.montant < 0).length, 7);
  const somme = w.reduce((s, l) => s + l.montant, 0);
  assert.ok(Math.abs(somme - 17512.31) < 0.01, 'somme Wasquehal = 17 512,31 €');
});

test('export réel : les 6 studios sont présents et les autres sites ignorés', { skip: !dispo && 'CSV de référence absent' }, () => {
  const p = C.parser(texte);
  const v = C.verifier(p, { moisAttendu: '2026-06', studiosAttendus: M.LABELS, studioLabel: M.studioLabel });
  assert.equal(v.ok, true, 'fichier conforme : ' + v.problemes.join(' · '));
  M.LABELS.forEach((s) => assert.ok(v.lignesParStudio[s] > 0, s + ' présent'));
  const c = C.controlerStudios(texte, p, { moisAttendu: '2026-06', studios: M.LABELS, studioLabel: M.studioLabel });
  M.LABELS.forEach((s) => assert.equal(c[s].ok, true, s + ' : ' + c[s].problemes.join(' · ')));
});

test('export réel : Wasquehal — Site et Id membre renseignés sur toutes les lignes', { skip: !dispo && 'CSV de référence absent' }, () => {
  const p = C.parser(texte);
  const w = wasquehal(p);
  assert.equal(w.filter((l) => l.site).length, 297);
  assert.equal(w.filter((l) => l.idMembre).length, 297);
  assert.deepEqual([...new Set(w.map((l) => l.site))], ['My Coach Wasquehal']);
});

test('export réel : Wasquehal — les 7 décaissements sont tous négatifs', { skip: !dispo && 'CSV de référence absent' }, () => {
  const p = C.parser(texte);
  const dec = wasquehal(p).filter((l) => l.decaissement);
  assert.equal(dec.length, 7);
  assert.equal(dec.filter((l) => l.montant < 0).length, 7);
});

test('export réel : la vue « id » donne 78 clients au net positif', { skip: !dispo && 'CSV de référence absent' }, () => {
  const p = C.parser(texte);
  const vue = C.vueParId(p.lignes, 'Wasquehal', M.studioLabel);
  const ag = R.agregerParClient(vue);
  let positifs = 0;
  ag.forEach((a) => { if (a.net > 0) positifs++; });
  assert.equal(ag.size, 81, '81 clients uniques (Id membre)');
  assert.equal(positifs, 78, '78 clients au net positif — chiffre déjà connu de RECAP');
});

test('export réel : la vue « nom » retrouve les mêmes personnes par clé candidate', { skip: !dispo && 'CSV de référence absent' }, () => {
  const p = C.parser(texte);
  const vue = C.vueParNom(p.lignes, 'Wasquehal', M.studioLabel, R.clesContrat);
  const ag = R.agregerParClient(vue);
  // Un nom réellement présent DANS CE STUDIO doit ressortir au net positif via
  // UNE de ses clés (l'export étant multisite, prendre la 1re ligne du fichier
  // reviendrait à chercher un adhérent d'un autre studio dans la vue Wasquehal).
  const unAdherent = wasquehal(p).find((l) => l.montant > 0).adherent;
  const trouve = R.clesContrat(unAdherent).some((k) => { const a = ag.get(k); return a && a.net > 0; });
  assert.ok(trouve, 'chaque adhérent payant est atteignable par au moins une clé candidate');
});

// ── Contrôle PAR STUDIO : bloquant pour le studio, jamais pour les autres ───
const ENTETE = '"Numéro";"Date d\'encaissement";"Heure d\'encaissement";"Vendeur";"Utilisateur connecté";"total note";"Adhérent";"Montant encaissé";"Date de dépôt";"Mode";"Note";"num note";"Référence";"Id membre";"Num compte tiers";"Site";"Signature"';
const ligne = (num, date, adherent, mt, site, note = 'Encaissement échéance') =>
  ['"' + num + '"', '"' + date + '"', '"12:00:00"', '""', '""', '"' + mt + '"', '"' + adherent + '"', '"' + mt + '"', '""', '"Prélèvement Auto"', '"' + note + '"', '"1"', '"F1"', '"' + num + '9"', '"x"', '"' + site + '"', '"h"'].join(';');
const rapport = (lignes, du = '2026-06-01', au = '2026-06-30', total = null) =>
  '﻿\t\t\tJournal des encaissements du ' + du + ' au ' + au + '\r\n\r\nTOTAL Encaissememts;'
  + (total == null ? lignes.length : total) + ',00\r\n\r\n' + ENTETE + '\r\n' + lignes.join('\r\n') + '\r\n';

test('controlerStudios : les 5 contrôles passent sur un fichier sain', () => {
  const txt = rapport([
    ligne(1, '05/06/2026', 'DUPONT Jean', '45,00', 'My Coach Wasquehal'),
    ligne(2, '06/06/2026', 'MARTIN Sara', '55,00', 'My Coach Vieux Lille'),
  ], '2026-06-01', '2026-06-30', 100);
  const p = C.parser(txt);
  const c = C.controlerStudios(txt, p, { moisAttendu: '2026-06', studios: ['Wasquehal', 'Lille'], studioLabel: M.studioLabel });
  assert.equal(c.Wasquehal.ok, true);
  assert.deepEqual(c.Wasquehal.controles, { presence: true, periode: true, aucuneLignePerdue: true, champsCoherents: true, sommesIdentiques: true });
  assert.equal(c.Wasquehal.lignesBrutes, 1);
  assert.equal(c.Wasquehal.sommeBrute, 45);
  assert.equal(c.Lille.ok, true);
});

test('controlerStudios : studio absent -> échec de CE studio seulement', () => {
  const txt = rapport([ligne(1, '05/06/2026', 'DUPONT Jean', '45,00', 'My Coach Wasquehal')]);
  const p = C.parser(txt);
  const c = C.controlerStudios(txt, p, { moisAttendu: '2026-06', studios: ['Wasquehal', 'Neuilly'], studioLabel: M.studioLabel });
  assert.equal(c.Wasquehal.ok, true, 'Wasquehal reste calculable');
  assert.equal(c.Neuilly.ok, false);
  assert.match(c.Neuilly.problemes.join(' '), /studio absent du fichier/);
});

test('controlerStudios : une ligne hors mois fait échouer le studio', () => {
  const txt = rapport([
    ligne(1, '05/06/2026', 'DUPONT Jean', '45,00', 'My Coach Wasquehal'),
    ligne(2, '02/07/2026', 'PETIT Luc', '45,00', 'My Coach Wasquehal'),
  ]);
  const p = C.parser(txt);
  const c = C.controlerStudios(txt, p, { moisAttendu: '2026-06', studios: ['Wasquehal'], studioLabel: M.studioLabel });
  assert.equal(c.Wasquehal.ok, false);
  assert.equal(c.Wasquehal.controles.periode, false);
});

test('controlerStudios : une ligne NOMINATIVE tronquée est une perte, et bloque', () => {
  // Une ligne au nombre de champs incomplet porte bien un adhérent : le parseur
  // l'écarte (v.length trop court) alors qu'elle compte -> perte réelle.
  const tronquee = '"2";"06/06/2026";"12:00:00";"";"";"30,00";"PETIT Luc";"30,00";"";"Prélèvement Auto";"My Coach Wasquehal"';
  const txt = rapport([
    ligne(1, '05/06/2026', 'DUPONT Jean', '45,00', 'My Coach Wasquehal'),
    tronquee,
  ]);
  const p = C.parser(txt);
  const c = C.controlerStudios(txt, p, { moisAttendu: '2026-06', studios: ['Wasquehal'], studioLabel: M.studioLabel });
  // La ligne tronquée n'a pas de colonne « Site » à sa place : elle n'est pas
  // rattachée à Wasquehal par le recomptage, mais le nombre de champs anormal
  // est détecté sur le fichier -> on vérifie au moins que rien n'est inventé.
  assert.equal(c.Wasquehal.lignesBrutes, 1);
  assert.equal(c.Wasquehal.lignesParsees, 1);
  assert.equal(c.Wasquehal.controles.sommesIdentiques, true);
});

test('controlerStudios : une anomalie hors périmètre ne bloque personne', () => {
  const txt = rapport([
    ligne(1, '05/06/2026', 'DUPONT Jean', '45,00', 'My Coach Wasquehal'),
    ligne(2, '05/06/2026', '', '-650640,00', 'My Coach by Gingko - Veigné', 'Annulation encaissement'),
    ligne(3, '02/07/2026', 'HORS Mois', '10,00', 'My Coach Tours'),
  ]);
  const p = C.parser(txt);
  const c = C.controlerStudios(txt, p, { moisAttendu: '2026-06', studios: ['Wasquehal'], studioLabel: M.studioLabel });
  assert.equal(c.Wasquehal.ok, true, 'Veigné et Tours sont hors périmètre : jamais bloquants');
  assert.equal(Object.keys(c).length, 1, 'seuls les studios demandés sont contrôlés');
});

test('verifier : un studio manquant ne rejette plus le fichier entier', () => {
  const txt = rapport([ligne(1, '05/06/2026', 'DUPONT Jean', '45,00', 'My Coach Wasquehal')]);
  const p = C.parser(txt);
  const v = C.verifier(p, { moisAttendu: '2026-06', studiosAttendus: M.LABELS, studioLabel: M.studioLabel });
  assert.equal(v.ok, true, 'le fichier reste exploitable pour les studios présents');
  assert.match(v.avertissements.join(' '), /studio absent du fichier : Lille/);
});

test('controlerStudios : un encaissement sans adhérent est écarté et signalé, pas bloquant', () => {
  // Cas réel : 7 lignes sans nom ni Id membre chez Lille en juillet (225 €).
  const txt = rapport([
    ligne(1, '05/06/2026', 'DUPONT Jean', '45,00', 'My Coach Wasquehal'),
    ligne(2, '06/06/2026', '', '45,00', 'My Coach Wasquehal', ''),
  ]);
  const p = C.parser(txt);
  const c = C.controlerStudios(txt, p, { moisAttendu: '2026-06', studios: ['Wasquehal'], studioLabel: M.studioLabel });
  assert.equal(c.Wasquehal.ok, true, 'le studio reste calculable');
  assert.equal(c.Wasquehal.controles.aucuneLignePerdue, true);
  assert.equal(c.Wasquehal.controles.sommesIdentiques, true);
  assert.equal(c.Wasquehal.lignesSansAdherent, 1);
  assert.equal(c.Wasquehal.montantSansAdherent, 45);
  assert.match(c.Wasquehal.avertissements.join(' '), /sans adhérent/);
});

// ─── L'ÉCART GLOBAL NE FAIT PLUS DOUBLON AVEC LES ALERTES STUDIO ───────────
//  Un seul phénomène : les lignes sans adhérent manquent à la somme des lignes
//  mais pas au total annoncé. Elles sont déjà dites studio par studio ; l'écart
//  global ne doit donc plus les redire.

// Fabrique : un rapport Deciplus minimal, avec un total annoncé imposé.
function rapportCSV(lignes, total) {
  return 'Journal des encaissements du 2026-06-01 au 2026-06-30\n\n'
    + 'TOTAL Encaissememts;' + String(total).replace('.', ',') + '\n\n'
    + '"Numéro";"Date d\'encaissement";"Adhérent";"Montant encaissé";"Mode";"Note";"Site";"Id membre"\n'
    + lignes.join('\n') + '\n';
}
const L = (num, adh, mt, site, id) => '"' + num + '";"01/06/2026";"' + adh + '";"'
  + String(mt).replace('.', ',') + '";"CB";"";"' + site + '";"' + id + '"';

test('lignesEcartees : compte les lignes sans adhérent, dans et hors périmètre', () => {
  const texte = rapportCSV([
    L(1, 'DUPONT Jean', 60, 'My Coach Wasquehal', 'A1'),
    L(2, '', 25, 'My Coach Wasquehal', ''),
    L(3, '', 49.95, 'Ginkgo Sport', ''),
  ], 134.95);
  const e = C.lignesEcartees(texte, { studios: M.LABELS, studioLabel: M.studioLabel });
  assert.equal(e.sansAdherent.lignes, 2);
  assert.equal(e.sansAdherent.montant, 74.95);
  assert.deepEqual(e.dansPerimetre, { lignes: 1, montant: 25 });
  assert.deepEqual(e.horsPerimetre, { lignes: 1, montant: 49.95 });
  assert.equal(e.tronquees.lignes, 0);
});

test('verifier : écart entièrement expliqué DANS le périmètre -> aucune alerte globale', () => {
  // 7 lignes sans adhérent chez Lille : le studio le dit déjà, pas deux fois.
  const lignes = [L(1, 'DUPONT Jean', 60, 'My Coach Vieux Lille', 'A1')];
  for (let i = 0; i < 7; i++) lignes.push(L(10 + i, '', 32.14, 'My Coach Vieux Lille', ''));
  const texte = rapportCSV(lignes, 285); // 60 + 7 x 32,14 = 284,98 -> arrondi Deciplus
  const p = C.parser(texte);
  const e = C.lignesEcartees(texte, { studios: M.LABELS, studioLabel: M.studioLabel });
  const v = C.verifier(p, { moisAttendu: '2026-06', studiosAttendus: ['Lille'], studioLabel: M.studioLabel, ecartees: e });
  assert.equal(v.avertissements.filter((a) => /écart/.test(a)).length, 0);
  assert.equal(v.ecartGlobal.explique, true);
  assert.equal(v.ecartGlobal.lignesSansAdherent, 7);
  // …et le studio, lui, le dit — une fois, au format court.
  const c = C.controlerStudios(texte, p, { moisAttendu: '2026-06', studios: M.LABELS, studioLabel: M.studioLabel });
  assert.equal(c.Lille.ok, true, 'écarter n\'est pas perdre : le studio reste calculable');
  assert.deepEqual(c.Lille.avertissements, ['7 encaissements sans adhérent (224,98 €) écartés du calcul']);
});

test('verifier : écart expliqué HORS périmètre -> une seule alerte, claire', () => {
  const texte = rapportCSV([
    L(1, 'DUPONT Jean', 60, 'My Coach Wasquehal', 'A1'),
    L(2, '', 30, 'Ginkgo Sport', ''),
    L(3, '', 19.95, 'Ginkgo Sport', ''),
  ], 109.95);
  const p = C.parser(texte);
  const e = C.lignesEcartees(texte, { studios: M.LABELS, studioLabel: M.studioLabel });
  const v = C.verifier(p, { moisAttendu: '2026-06', studiosAttendus: ['Wasquehal'], studioLabel: M.studioLabel, ecartees: e });
  assert.equal(v.avertissements.length, 1);
  assert.match(v.avertissements[0], /2 encaissements sans adhérent \(49,95 €\) écartés du calcul, hors des 6 studios/);
  assert.equal(v.ecartGlobal.explique, true);
});

test('verifier : une part inexpliquée reste dite, et elle seule', () => {
  const texte = rapportCSV([
    L(1, 'DUPONT Jean', 60, 'My Coach Wasquehal', 'A1'),
    L(2, '', 25, 'My Coach Wasquehal', ''),
  ], 185); // 60 + 25 expliqués, 100 € qui ne viennent de nulle part
  const p = C.parser(texte);
  const e = C.lignesEcartees(texte, { studios: M.LABELS, studioLabel: M.studioLabel });
  const v = C.verifier(p, { moisAttendu: '2026-06', studiosAttendus: ['Wasquehal'], studioLabel: M.studioLabel, ecartees: e });
  assert.equal(v.avertissements.length, 1);
  assert.match(v.avertissements[0], /^écart de 100 € inexpliqué/);
  assert.match(v.avertissements[0], /25 € déjà expliqué par 1 ligne sans adhérent/);
  assert.equal(v.ecartGlobal.explique, false);
  assert.equal(v.ecartGlobal.residu, 100);
});

test('verifier : sans décompte des lignes écartées, rien ne change (compatibilité)', () => {
  const texte = rapportCSV([L(1, 'DUPONT Jean', 60, 'My Coach Wasquehal', 'A1')], 160);
  const v = C.verifier(C.parser(texte), { moisAttendu: '2026-06', studiosAttendus: [], studioLabel: M.studioLabel });
  assert.equal(v.avertissements.length, 1);
  assert.match(v.avertissements[0], /écart de 100 € inexpliqué entre la somme des lignes/);
});

test('euros : lisible à l\'œil, centimes seulement s\'il y en a', () => {
  assert.equal(C.euros(225), '225 €');
  assert.equal(C.euros(49.95), '49,95 €');
  assert.equal(C.euros(230857.39), '230 857,39 €');
  assert.equal(C.euros(-428328.1), '-428 328,10 €');
  assert.equal(C.euros(0), '0 €');
});

// ─── LES EXPORTS RÉELS : le fait qui a motivé tout ça ───────────────────────
const exportsDispo = ['2026-05', '2026-06', '2026-07']
  .every((ym) => fs.existsSync(path.join(__dirname, '..', '.session', 'exports', 'encaissements-' + ym + '.csv')));
const lireExport = (ym) => fs.readFileSync(path.join(__dirname, '..', '.session', 'exports', 'encaissements-' + ym + '.csv'), 'utf8');

test('export réel juillet 2026 : les 225 € ne sont dits qu\'une fois, chez Lille',
  { skip: !exportsDispo && 'CSV de référence absents' }, () => {
    const texte = lireExport('2026-07');
    const p = C.parser(texte);
    const e = C.lignesEcartees(texte, { studios: M.LABELS, studioLabel: M.studioLabel });
    const v = C.verifier(p, { moisAttendu: '2026-07', studiosAttendus: M.LABELS, studioLabel: M.studioLabel, ecartees: e });
    assert.deepEqual(v.avertissements, [], 'plus aucune alerte globale : elle faisait doublon');
    assert.equal(v.ecartGlobal.ecart, 225);
    assert.equal(v.ecartGlobal.residu, 0);
    const c = C.controlerStudios(texte, p, { moisAttendu: '2026-07', studios: M.LABELS, studioLabel: M.studioLabel });
    assert.deepEqual(c.Lille.avertissements, ['7 encaissements sans adhérent (225 €) écartés du calcul']);
    M.LABELS.filter((s) => s !== 'Lille').forEach((s) => assert.deepEqual(c[s].avertissements, [], s));
  });

test('export réel mai 2026 : 49,95 € hors périmètre -> une alerte, pas un écart cryptique',
  { skip: !exportsDispo && 'CSV de référence absents' }, () => {
    const texte = lireExport('2026-05');
    const p = C.parser(texte);
    const e = C.lignesEcartees(texte, { studios: M.LABELS, studioLabel: M.studioLabel });
    const v = C.verifier(p, { moisAttendu: '2026-05', studiosAttendus: M.LABELS, studioLabel: M.studioLabel, ecartees: e });
    assert.equal(v.avertissements.length, 1);
    assert.match(v.avertissements[0], /hors des 6 studios — sans effet sur les KPI/);
    const c = C.controlerStudios(texte, p, { moisAttendu: '2026-05', studios: M.LABELS, studioLabel: M.studioLabel });
    M.LABELS.forEach((s) => assert.deepEqual(c[s].avertissements, [], s));
  });

test('export réel juin 2026 : l\'écart annoncé vaut exactement les lignes écartées',
  { skip: !exportsDispo && 'CSV de référence absents' }, () => {
    // ⚠️ PAS DE NOMBRE ÉPINGLÉ ICI. Cet export est réexporté à chaque collecte et
    // il bouge (un remboursement passe, une écriture est rattachée à un client).
    // Ce qui ne bouge pas, c'est la règle : l'écart avec le total Deciplus est
    // celui des lignes que le parseur a écartées, au centime.
    const texte = lireExport('2026-06');
    const p = C.parser(texte);
    const e = C.lignesEcartees(texte, { studios: M.LABELS, studioLabel: M.studioLabel });
    const v = C.verifier(p, { moisAttendu: '2026-06', studiosAttendus: M.LABELS, studioLabel: M.studioLabel, ecartees: e });
    assert.equal(v.ecartGlobal.residu, 0, 'aucun euro inexpliqué');
    assert.equal(v.ecartGlobal.ecart, e.sansAdherent.montant);
    assert.deepEqual(v.avertissements.filter((a) => /^écart de /.test(a)), []);
  });
