'use strict';
// ============================================================================
//  REMARQUES PAR PERSONNE — le module serveur et le texte copié, sans serveur.
//
//  Ce qui est verrouillé ici :
//   1. écrire remplace, remarque vide = supprimée ;
//   2. cloisonnement par mois, studio ET type (vente / non_reconduit) ;
//   3. rattachement par Id membre d'abord, identité ensuite — jamais sur un
//      homonyme porteur d'un autre Id ;
//   4. appliquer() ajoute `note` et ne touche AUCUN compteur ni aucun champ ;
//   5. le texte copié : format exact, deux sections, personnes sans remarque
//      absentes, doublons fusionnés, HTML échappé.
// ============================================================================

const { test } = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const N = require('../lib/recap2Notes.js');
const RR = require('../public/recap2-remarques.js');

const baseNeuve = () => { const d = new Database(':memory:'); N.creerTable(d); return d; };
const vente = (o) => Object.assign({ client: 'Daouda Sy', date: '05/08/2026', prestation: 'Challenge', commercial: 'Fabian F.',
  annulee: false, dateAnnulation: '', retrouve: true, site: 'My Coach Neuilly', dateVente: '05/08/2026', idClient: '5001', encaisse: true }, o);
const rapport = (mois = '2026-08') => ({
  businessVersion: 2, mois, m1: '2026-07',
  studios: {
    Neuilly: { studio: 'Neuilly',
      nonReconduction: { base: 10, nonReconduits: 2, taux: 0.2, tauxPct: 20, liste: [
        { client: 'AMIEL Anais', idClient: '6001', netM1: 60, netM: 0 },
        { client: 'BASSIN Robin', idClient: '6002', netM1: 45, netM: 0 },
      ] },
      clientsRetrouves: { ventesSignees: 3, annulees: 0, ventesActives: 3, signataires: 2, retrouves: 2, taux: 1, tauxPct: 100, liste: [
        vente({}),
        vente({ client: 'Aurélie Fourlin', idClient: '', retrouve: false, site: '', dateVente: '' }),
        vente({ client: 'Daouda Sy', date: '20/08/2026' }), // 2e vente de la même personne
      ] } },
    Lille: { studio: 'Lille',
      nonReconduction: { base: 5, nonReconduits: 1, taux: 0.2, tauxPct: 20, liste: [{ client: 'AMIEL Anais', idClient: '7001', netM1: 30, netM: 0 }] },
      clientsRetrouves: { ventesSignees: 0, annulees: 0, ventesActives: 0, signataires: 0, retrouves: 0, taux: null, tauxPct: null, liste: [] } },
  },
});
const lire = (db, r) => N.appliquer(r, N.notesDuMois(db, r.mois));
const poser = (db, o) => N.enregistrer(db, Object.assign({ mois: '2026-08', studio: 'Neuilly', type: 'vente', client: 'Daouda Sy', idClient: '5001', par: 'Stan' }, o));

test('écrire remplace ; vide = supprimée (auteur et date gardés)', () => {
  const db = baseNeuve();
  poser(db, { remarque: 'A demandé à résilier.' });
  poser(db, { remarque: '  A demandé à résilier, à revoir avec le coach leader.\r\n' });
  assert.equal(lire(db, rapport()).studios.Neuilly.clientsRetrouves.liste[0].note.remarque, 'A demandé à résilier, à revoir avec le coach leader.');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM recap2_notes').get().n, 1);
  const sup = poser(db, { remarque: '' });
  assert.deepEqual([sup.remarque, !!sup.modifieLe, sup.modifiePar], ['', true, 'Stan']);
  assert.equal(lire(db, rapport()).studios.Neuilly.clientsRetrouves.liste[0].note.remarque, '');
});

test('refus : type, mois, personne, longueur', () => {
  const db = baseNeuve();
  assert.throws(() => poser(db, { type: 'client', remarque: 'x' }));
  assert.throws(() => poser(db, { mois: '2026-8', remarque: 'x' }));
  assert.throws(() => poser(db, { client: ' ', remarque: 'x' }));
  assert.throws(() => poser(db, { remarque: 'x'.repeat(N.LONGUEUR_MAX + 1) }));
});

test('cloisonné par mois : une remarque d\'août n\'apparaît pas en septembre', () => {
  const db = baseNeuve();
  poser(db, { remarque: 'août' });
  poser(db, { type: 'non_reconduit', client: 'AMIEL Anais', idClient: '6001', remarque: 'août NR' });
  const sept = lire(db, rapport('2026-09')).studios.Neuilly;
  assert.equal(sept.clientsRetrouves.liste[0].note.remarque, '');
  assert.equal(sept.nonReconduction.liste[0].note.remarque, '');
});

test('cloisonné par type et par studio', () => {
  const db = baseNeuve();
  // Même Id membre posé comme non reconduit : ne touche pas la vente.
  poser(db, { type: 'non_reconduit', client: 'AMIEL Anais', idClient: '6001', remarque: 'NR Neuilly' });
  const r = lire(db, rapport());
  assert.equal(r.studios.Neuilly.nonReconduction.liste[0].note.remarque, 'NR Neuilly');
  assert.equal(r.studios.Neuilly.clientsRetrouves.liste[0].note.remarque, '', 'autre type');
  assert.equal(r.studios.Lille.nonReconduction.liste[0].note.remarque, '', 'autre studio, même nom');
  poser(db, { type: 'vente', client: 'Daouda Sy', idClient: '6001', remarque: 'vente même id' });
  assert.equal(lire(db, rapport()).studios.Neuilly.nonReconduction.liste[0].note.remarque, 'NR Neuilly', 'la vente ne remplace pas le NR');
});

test('rattachement : posée sans Id (à vérifier), retrouvée une fois la vente retrouvée', () => {
  const db = baseNeuve();
  poser(db, { client: 'Fourlin Aurelie', idClient: '', remarque: 'Aucun encaissement, à contacter.' });
  const r0 = rapport();
  assert.equal(lire(db, r0).studios.Neuilly.clientsRetrouves.liste[1].note.remarque, 'Aucun encaissement, à contacter.');
  const r1 = rapport();
  Object.assign(r1.studios.Neuilly.clientsRetrouves.liste[1], { retrouve: true, idClient: '5009' });
  assert.equal(lire(db, r1).studios.Neuilly.clientsRetrouves.liste[1].note.remarque, 'Aucun encaissement, à contacter.');
});

test('homonyme porteur d\'un autre Id : la remarque ne s\'applique pas', () => {
  const db = baseNeuve();
  poser(db, { remarque: 'autre personne', idClient: '9999' });
  assert.equal(lire(db, rapport()).studios.Neuilly.clientsRetrouves.liste[0].note.remarque, '');
});

test('deux ventes d\'une même personne : même remarque sur les deux lignes', () => {
  const db = baseNeuve();
  poser(db, { remarque: 'x' });
  const l = lire(db, rapport()).studios.Neuilly.clientsRetrouves.liste;
  assert.deepEqual([l[0].note.remarque, l[2].note.remarque], ['x', 'x']);
});

test('appliquer() : aucun compteur ni champ source modifié, original intact', () => {
  const db = baseNeuve();
  poser(db, { remarque: 'x' });
  poser(db, { type: 'non_reconduit', client: 'AMIEL Anais', idClient: '6001', remarque: 'y' });
  const r = rapport();
  const avant = JSON.stringify(r);
  const out = lire(db, r);
  assert.equal(JSON.stringify(r), avant);
  const sansNotes = JSON.parse(JSON.stringify(out));
  Object.values(sansNotes.studios).forEach((b) => {
    b.clientsRetrouves.liste.forEach((l) => delete l.note);
    b.nonReconduction.liste.forEach((l) => delete l.note);
  });
  assert.equal(JSON.stringify(sansNotes), avant);
});

test('ligneDe : par Id, par identité, refus d\'une personne absente ou d\'homonymes aux Id différents', () => {
  const r = rapport();
  assert.equal(N.ligneDe(r, { studio: 'Neuilly', type: 'non_reconduit', client: 'x', idClient: '6002' }).client, 'BASSIN Robin');
  assert.equal(N.ligneDe(r, { studio: 'Neuilly', type: 'vente', client: 'sy daouda' }).idClient, '5001');
  assert.equal(N.ligneDe(r, { studio: 'Neuilly', type: 'vente', client: 'AMIEL Anais' }), null, 'pas une vente');
  assert.equal(N.ligneDe(r, { studio: 'Neuilly', type: 'vente', client: 'Personne Inventée' }), null);
  r.studios.Neuilly.clientsRetrouves.liste.push(vente({ client: 'Daouda SY', idClient: '5002' }));
  assert.equal(N.ligneDe(r, { studio: 'Neuilly', type: 'vente', client: 'Daouda Sy' }), null, 'deux Id pour un même nom : refus');
});

// ── LE TEXTE COPIÉ ──────────────────────────────────────────────────────────
test('copie du club : format exact, deux sections, sans les personnes sans remarque', () => {
  const db = baseNeuve();
  poser(db, { remarque: 'A demandé à résilier, à revoir avec le coach leader.' });
  poser(db, { client: 'Aurélie Fourlin', idClient: '', remarque: 'Aucun encaissement depuis la signature, à contacter.' });
  poser(db, { type: 'non_reconduit', client: 'AMIEL Anais', idClient: '6001', remarque: 'Cliente contactée, situation sous contrôle.' });
  poser(db, { type: 'non_reconduit', client: 'BASSIN Robin', idClient: '6002', remarque: 'À creuser avec le coach.' });
  const r = RR.remarquesClub(lire(db, rapport()), 'Neuilly');
  assert.equal(r.nb, 4, 'Daouda Sy compté une fois malgré ses deux ventes');
  assert.equal(r.texte, [
    'NEUILLY — AOÛT 2026', '',
    'Ventes signées', '',
    'Daouda Sy', 'A demandé à résilier, à revoir avec le coach leader.', '',
    'Aurélie Fourlin', 'Aucun encaissement depuis la signature, à contacter.', '',
    'Clients non reconduits', '',
    'Anais Amiel', 'Cliente contactée, situation sous contrôle.', '',
    'Robin Bassin', 'À creuser avec le coach.', '',
  ].join('\n'));
  assert.match(r.html, /<b>NEUILLY — AOÛT 2026<\/b>/);
  assert.match(r.html, /<b>Clients non reconduits<\/b>/);
});

test('copie : une section vide n\'apparaît pas ; aucune remarque -> rien ; HTML échappé', () => {
  const db = baseNeuve();
  assert.deepEqual(RR.remarquesClub(lire(db, rapport()), 'Neuilly'), { nb: 0, texte: '', html: '' });
  poser(db, { type: 'non_reconduit', client: 'BASSIN Robin', idClient: '6002', remarque: '<script>x</script>\n2e ligne' });
  const r = RR.remarquesClub(lire(db, rapport()), 'Neuilly');
  assert.equal(r.nb, 1);
  assert.ok(!/Ventes signées/.test(r.texte), 'pas de section Ventes signées vide');
  assert.ok(!/Daouda|Fourlin|AMIEL/i.test(r.texte), 'aucune personne sans remarque');
  assert.ok(r.html.indexOf('<script>') < 0 && /&lt;script&gt;x&lt;\/script&gt;<br>2e ligne/.test(r.html));
  assert.deepEqual(RR.remarquesClub(lire(db, rapport()), 'Lille'), { nb: 0, texte: '', html: '' }, 'autre club : rien');
});

test('graphie « Prénom Nom » dans le texte copié', () => {
  const cas = {
    'AMIEL Anais': 'Anais Amiel',
    'BASSIN Robin': 'Robin Bassin',
    'DE OLIVEIRA Sylvie': 'Sylvie De Oliveira',
    'N\'DIAYE Marie-Claire': 'Marie-Claire N\'Diaye',
    'BEN-ALI Kaïssa': 'Kaïssa Ben-Ali',
    'Daouda Sy': 'Daouda Sy',
    'Najim Abd Al-nour': 'Najim Abd Al-nour',
    'Founaqa Mouna': 'Founaqa Mouna',
    'DUPONT MARIE': 'Dupont Marie',
    '  CAMACHO   Samuel ': 'Samuel Camacho',
  };
  Object.entries(cas).forEach(([brut, attendu]) => assert.equal(RR.prenomNom(brut), attendu, brut));
});
