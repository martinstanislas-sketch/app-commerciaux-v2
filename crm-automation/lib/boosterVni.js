'use strict';
// ============================================================================
//  VNI D'UN MOIS — calcul à la collecte, depuis ce que Vendor a envoyé à l'écran
//  Statistiques (/sales-stats), croisé avec les contrats Fitness Booster et le
//  journal des ventes Deciplus. Module PUR : aucune navigation ici (la capture
//  est faite par boosterReferences.lireReferences, pendant la même visite).
//
//  SOURCE (diagnostic du 2026-09-15, 6 studios exacts sur août) :
//   · VENU = changement de statut vers « Visiteur - Présent », créé dans le mois.
//     Date = sa date de création ; studio = son club ; commercial = celui qui a
//     noté la présence (`commercial_user`, sinon `Created By`) — pas le
//     commercial attribué au contact.
//   · Contrôle d'exhaustivité : personnes distinctes « Visiteur - Présent » +
//     personnes passées directement « Client » dans le mois = tuile « Visiteurs ».
//
//  UNE PERSONNE = son Id Deciplus s'il existe (il relie ses fiches de clubs
//  différents), sinon son identifiant de contact Vendor. Plusieurs venues dans
//  le mois -> une ligne : la DERNIÈRE (date, studio, commercial).
//
//  TRANSFORMATIONS (lib/recap2Vni.js pour la règle) — toutes par identifiant :
//   · vendor-statut        passage « Client - Avec/Sans Abonnement » ;
//   · vendor-vente         vente Vendor liée au contact (annulée comprise) ;
//   · fb-contrat           contrat Fitness Booster du mois (annulé compris) ;
//   · deciplus-vente       ligne du journal des ventes Deciplus du mois ;
//   · vendor-statut-actuel contact dont le statut ACTUEL est client (date du
//                          dernier changement) — filet de sécurité qui couvre
//                          aussi un mois jamais recollecté.
// ============================================================================

const V = require('../../lib/recap2Vni.js');

const LIB_PRESENT = 'Visiteur - Présent';
const RE_CLIENT = /^Client - (Avec|Sans) Abonnement$/;
// Clés internes de Vendor, si l'écran n'a pas rendu les libellés.
const CLE_PRESENT = 'vni_walk_in';
const CLES_CLIENT = ['client', 's_ance'];

const espaces = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const libelle = (statuts, brut) => (statuts && statuts[brut]) || '';
const estPresent = (statuts, brut) => libelle(statuts, brut) ? libelle(statuts, brut) === LIB_PRESENT : brut === CLE_PRESENT;
const estClient = (statuts, brut) => libelle(statuts, brut) ? RE_CLIENT.test(libelle(statuts, brut)) : CLES_CLIENT.indexOf(brut) >= 0;

// « Marvin B. » (affichage seulement ; la clé reste l'identifiant).
function nomCommercial(u) {
  if (!u) return '';
  const prenom = espaces(u.prenom), nom = espaces(u.nom);
  return (prenom + (nom ? ' ' + nom[0].toUpperCase() + '.' : '')).trim();
}
const nomContact = (c) => espaces((c && ((c.prenom || '') + ' ' + (c.nom || ''))) || '') || espaces(c && c.client);
// « 2026-08 » -> « 08/2026 », pour tester l'appartenance d'une date au mois.
const moisTexte = (ym) => ym.slice(5, 7) + '/' + ym.slice(0, 4);
// Premier jour du mois, douze mois avant : l'historique plus ancien ne peut
// concerner aucune venue suivie.
function depuisDouzeMois(ym) {
  const [a, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(a - 1, m - 1, 1));
  return '01/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear();
}

// lectures : { studio: { ok, vni: { clubId, tuileVisiteurs, statuts, ecranOk, contacts, evenements, ventes, users }, problemes } }
// contratsFB : { studio: { contrats: [{ date, contactId }], echec } }
// ventesDeciplus : [{ date: 'JJ/MM/AAAA', idClient }] | null
function calculer({ ym, lectures = {}, contratsFB = {}, ventesDeciplus = null, studios }) {
  const avertissements = [];
  const statuts = Object.assign({}, ...Object.values(lectures).map((l) => (l && l.vni && l.vni.statuts) || {}));
  const contacts = new Map();
  const users = {};
  Object.values(lectures).forEach((l) => {
    if (!l || !l.vni) return;
    (l.vni.contacts || []).forEach((c) => { if (V.idVendor(c.id)) contacts.set(V.idVendor(c.id), c); });
    Object.assign(users, l.vni.users || {});
  });
  const deciplusDe = (contactId) => V.idClient((contacts.get(contactId) || {}).deciplusId);

  // ── 1) TRANSFORMATIONS CONNUES À CETTE COLLECTE ────────────────────────────
  const brutes = [];
  const evenementsVus = new Map();
  Object.values(lectures).forEach((l) => ((l && l.vni && l.vni.evenements) || []).forEach((e) => evenementsVus.set(e.id, e)));
  evenementsVus.forEach((e) => {
    if (!estClient(statuts, e.statut) || !Number.isFinite(e.creeLe)) return;
    const c = V.idVendor(e.contact);
    if (c) brutes.push({ contactId: c, idClient: deciplusDe(c), date: V.dateParis(e.creeLe), source: 'vendor-statut' });
  });
  Object.values(lectures).forEach((l) => ((l && l.vni && l.vni.ventes) || []).forEach((v) => {
    const c = V.idVendor(v.contact);
    if (c && Number.isFinite(v.creeLe)) brutes.push({ contactId: c, idClient: deciplusDe(c), date: V.dateParis(v.creeLe), source: 'vendor-vente' });
  }));
  let contratsSansContact = 0;
  Object.values(contratsFB).forEach((r) => ((r && !r.echec && r.contrats) || []).forEach((k) => {
    const c = V.idVendor(k.contactId);
    if (!c) { contratsSansContact += 1; return; }
    brutes.push({ contactId: c, idClient: deciplusDe(c), date: k.date, source: 'fb-contrat' });
  }));
  if (contratsSansContact) avertissements.push(contratsSansContact + ' contrat(s) Fitness Booster sans identifiant de contact : non utilisé(s) pour les VNI (aucun rapprochement par nom)');
  (ventesDeciplus || []).forEach((l) => { if (V.idClient(l.idClient)) brutes.push({ contactId: '', idClient: l.idClient, date: l.date, source: 'deciplus-vente' }); });
  if (!ventesDeciplus) avertissements.push('journal des ventes Deciplus indisponible : transformations Deciplus non lues pour ce mois');
  contacts.forEach((c, id) => {
    if (estClient(statuts, c.statut) && Number.isFinite(c.statutChangeLe)) {
      brutes.push({ contactId: id, idClient: deciplusDe(id), date: V.dateParis(c.statutChangeLe), source: 'vendor-statut-actuel' });
    }
  });
  const transformations = V.compacter(brutes, { depuis: depuisDouzeMois(ym) });
  const index = V.indexer(transformations);

  // ── 2) LES VENUES, STUDIO PAR STUDIO, AVEC LEUR CONTRÔLE ───────────────────
  const blocs = {};
  const venuesOk = [];
  (studios || Object.keys(lectures)).forEach((studio) => {
    const l = lectures[studio];
    const x = l && l.vni;
    const pb = [];
    if (!x) { blocs[studio] = { echec: 'lecture Vendor indisponible' + (l && l.problemes && l.problemes.length ? ' (' + l.problemes.join(' ; ') + ')' : '') }; return; }
    if (!x.ecranOk) pb.push('club ou période affichés ≠ demandés');
    const clubId = V.idVendor(x.clubId);
    if (!clubId) pb.push('identifiant du club introuvable');
    const duMois = (e) => V.idVendor(e.club) === clubId && Number.isFinite(e.creeLe) && V.dateParis(e.creeLe).slice(3) === moisTexte(ym);
    const evs = (x.evenements || []).filter(duMois);
    const presents = evs.filter((e) => estPresent(statuts, e.statut));
    const personnesPresentes = new Set(presents.map((e) => V.idVendor(e.contact)));
    const directs = new Set(evs.filter((e) => estClient(statuts, e.statut)).map((e) => V.idVendor(e.contact)).filter((c) => !personnesPresentes.has(c)));
    const reconstitues = personnesPresentes.size + directs.size;
    if (typeof x.tuileVisiteurs !== 'number') pb.push('tuile « Visiteurs » illisible');
    else if (reconstitues !== x.tuileVisiteurs) pb.push('exhaustivité : ' + reconstitues + ' visiteur(s) reconstitué(s) pour ' + x.tuileVisiteurs + ' affiché(s) par Vendor');
    const sansCommercial = presents.filter((e) => !V.idVendor(e.commercial) && !V.idVendor(e.createur)).length;
    if (sansCommercial) pb.push(sansCommercial + ' venue(s) sans identifiant Vendor de commercial');
    if (pb.length) { blocs[studio] = { echec: pb.join(' ; ') }; return; }
    blocs[studio] = { visiteurs: reconstitues, tuileVisiteurs: x.tuileVisiteurs, venus: 0, transformes: 0, liste: [] };
    presents.forEach((e) => venuesOk.push({ studio, e }));
  });

  // ── 3) UNE LIGNE PAR PERSONNE : SA DERNIÈRE VENUE DU MOIS ──────────────────
  const parPersonne = new Map();
  venuesOk.forEach((v) => {
    const contactId = V.idVendor(v.e.contact);
    if (!contactId) return;
    const idClient = deciplusDe(contactId);
    const cle = idClient ? 'd:' + idClient : 'v:' + contactId;
    const p = parPersonne.get(cle) || { venues: 0, derniere: null };
    p.venues += 1;
    if (!p.derniere || v.e.creeLe > p.derniere.e.creeLe) p.derniere = v;
    parPersonne.set(cle, p);
  });
  parPersonne.forEach((p) => {
    const { studio, e } = p.derniere;
    const contactId = V.idVendor(e.contact);
    const contact = contacts.get(contactId) || {};
    const commercialId = V.idVendor(e.commercial) || V.idVendor(e.createur);
    const ligne = {
      contactId, idClient: deciplusDe(contactId), client: nomContact(contact) || '(nom indisponible dans Vendor)',
      dateVenue: V.dateParis(e.creeLe), venues: p.venues,
      commercial: nomCommercial(users[commercialId]), commercialId,
      statutVendor: libelle(statuts, contact.statut) || espaces(contact.statut),
    };
    const b = blocs[studio];
    b.venus += 1;
    if (V.transformationDe(ligne, index)) b.transformes += 1;
    else b.liste.push(Object.assign(ligne, { _t: e.creeLe }));
  });
  Object.values(blocs).forEach((b) => {
    if (!b.liste) return;
    b.liste.sort((a, c) => a._t - c._t || a.client.localeCompare(c.client, 'fr'));
    b.liste.forEach((l) => { delete l._t; });
  });
  return { studios: blocs, transformations, avertissements };
}

module.exports = { calculer, nomCommercial, depuisDouzeMois, LIB_PRESENT, RE_CLIENT };
