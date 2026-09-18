'use strict';
// ============================================================================
//  RECAP 2 — VNI (VISITEURS NON INSCRITS) : LA RÈGLE, ET LE RETRAIT RÉTROACTIF.
//
//  Module PUR, partagé par la collecte (crm-automation/lib/boosterVni.js) et
//  par le serveur (lecture d'un rapport). Aucune I/O ici, sauf `lireTous`, qui
//  reçoit ses fonctions de lecture en paramètre.
//
//  RÈGLE MÉTIER (tranchée par Stan le 2026-09-15) :
//    VNI = personne VENUE à un rendez-vous commercial dans le mois et qui n'a
//    JAMAIS réalisé de vente / signature ENSUITE. Est une transformation :
//    abonnement, achat sans abonnement, vente annulée ensuite. Une signature
//    ultérieure — quel que soit le délai — retire la personne des VNI du mois
//    de son rendez-vous.
//
//  ⚠️ LE RETRAIT RÉTROACTIF NE RÉÉCRIT JAMAIS UN RAPPORT.
//    liste VNI affichée aujourd'hui
//      = VNI historiques du mois (rapport du mois, figés à sa collecte)
//      − personnes ayant une transformation connue AUJOURD'HUI,
//        datée du jour de leur venue ou après.
//    « Connue aujourd'hui » = l'union des transformations portées par TOUS les
//    rapports déposés, quel que soit leur mois : la collecte d'octobre apporte
//    la signature d'octobre, et août la voit sans être recollecté.
//
//  ⚠️ RAPPROCHEMENT PAR IDENTIFIANT UNIQUEMENT : identifiant de contact Vendor
//    (`contactId`) ou Id membre Deciplus (`idClient`). Jamais par nom.
// ============================================================================

const ID_VENDOR_RE = /^[0-9]{10,16}x[0-9]{10,24}$/; // même forme que booster.js idBubble
const ID_CLIENT_RE = /^[0-9]{1,20}$/;
const DATE_RE = /^\d{2}\/\d{2}\/\d{4}$/;
const SOURCES = ['vendor-statut', 'vendor-vente', 'fb-contrat', 'deciplus-vente', 'vendor-statut-actuel'];

const idVendor = (x) => { const s = String(x == null ? '' : x).split('__LOOKUP__').pop().trim(); return ID_VENDOR_RE.test(s) ? s : ''; };
const idClient = (x) => { const s = String(x == null ? '' : x).trim(); return ID_CLIENT_RE.test(s) ? s : ''; };

// « JJ/MM/AAAA » <-> numéro de jour (comparaisons au JOUR : la venue et la
// signature du même jour comptent comme « après »).
function jour(texte) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(texte || ''));
  if (!m) return NaN;
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  if (d.getUTCDate() !== +m[1] || d.getUTCMonth() !== +m[2] - 1) return NaN;
  return Math.round(d.getTime() / 86400000);
}
// Un instant (ms) -> « JJ/MM/AAAA » à l'heure de Paris (celle des studios).
function dateParis(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return p.day + '/' + p.month + '/' + p.year;
}

// ─── L'INDEX DES TRANSFORMATIONS ────────────────────────────────────────────
//  Pour la règle, seule compte la DERNIÈRE date connue par identifiant :
//  « existe-t-il une transformation datée ≥ venue » ⇔ « la plus récente ≥ venue ».
//  Deux clés, jamais mêlées : `v:<contact Vendor>` et `d:<Id Deciplus>`.
function indexer(transformations, index = new Map()) {
  (transformations || []).forEach((t) => {
    const j = jour(t && t.date);
    if (!Number.isFinite(j)) return;
    [idVendor(t.contactId) && 'v:' + idVendor(t.contactId), idClient(t.idClient) && 'd:' + idClient(t.idClient)]
      .filter(Boolean).forEach((k) => {
        const p = index.get(k);
        if (!p || j > p.jour) index.set(k, { jour: j, date: t.date, source: t.source });
      });
  });
  return index;
}

// La transformation qui retire cette personne, ou null.
function transformationDe(personne, index) {
  const venue = jour(personne && personne.dateVenue);
  if (!Number.isFinite(venue)) return null;
  const cles = [idVendor(personne.contactId) && 'v:' + idVendor(personne.contactId), idClient(personne.idClient) && 'd:' + idClient(personne.idClient)].filter(Boolean);
  for (const k of cles) {
    const t = index.get(k);
    if (t && t.jour >= venue) return t;
  }
  return null;
}

// Compacte une liste brute de transformations : une entrée par identifiant,
// sa date la plus récente. `depuis` (« JJ/MM/AAAA ») écarte l'historique trop
// ancien pour concerner une venue suivie par RECAP 2.
function compacter(transformations, { depuis = '' } = {}) {
  const borne = jour(depuis);
  const parCle = new Map();
  (transformations || []).forEach((t) => {
    const j = jour(t && t.date);
    const cv = idVendor(t && t.contactId), cd = idClient(t && t.idClient);
    if (!Number.isFinite(j) || (!cv && !cd) || SOURCES.indexOf(t.source) < 0) return;
    if (Number.isFinite(borne) && j < borne) return;
    const cle = cv + '|' + cd;
    const p = parCle.get(cle);
    if (!p || j > jour(p.date)) parCle.set(cle, { contactId: cv, idClient: cd, date: t.date, source: t.source });
  });
  return [...parCle.values()].sort((a, b) => jour(a.date) - jour(b.date) || (a.contactId + a.idClient).localeCompare(b.contactId + b.idClient));
}

// ─── APPLICATION À LA LECTURE (serveur) ─────────────────────────────────────
//  Pose sur chaque bloc `vni` la liste ACTIVE. Copie profonde : le rapport lu
//  n'est pas modifié. AUCUN autre champ que `vni` n'est touché.
//   · `liste`             : VNI encore actifs aujourd'hui ;
//   · `retires`           : nombre retiré depuis la collecte (signature ultérieure) ;
//   · `transformesDepuis` : qui, quand, par quelle source — avec le nom et le
//     commercial DÉJÀ présents dans la liste historique, pour que l'écran puisse
//     afficher « Transformé depuis le … » au lieu d'un simple compteur.
function appliquer(rapport, index, { connuesJusquau = '' } = {}) {
  if (!rapport || !rapport.studios) return rapport;
  const copie = JSON.parse(JSON.stringify(rapport));
  Object.keys(copie.studios).forEach((s) => {
    const v = copie.studios[s] && copie.studios[s].vni;
    if (!v || !Array.isArray(v.liste)) return;
    const actifs = [], retires = [];
    v.liste.forEach((p) => {
      const t = transformationDe(p, index);
      if (t) retires.push({ contactId: p.contactId || '', idClient: p.idClient || '', client: p.client || '',
        commercial: p.commercial || '', commercialId: p.commercialId || '', dateVenue: p.dateVenue, transformeLe: t.date, source: t.source });
      else actifs.push(p);
    });
    v.historique = v.liste.length;
    v.liste = actifs;
    v.retires = retires.length;
    v.transformesDepuis = retires;
    if (connuesJusquau) v.transformationsConnuesJusquau = connuesJusquau;
  });
  return copie;
}

// Toutes les transformations connues, tous rapports confondus. `lister()` rend
// les mois disponibles, `lire(mois)` un rapport (ou null). La date de collecte
// la plus récente dit jusqu'où on sait.
function lireTous({ lister, lire }) {
  const index = new Map();
  let jusquau = NaN, texte = '';
  (lister() || []).forEach((mois) => {
    const r = lire(mois);
    if (!r || !Array.isArray(r.transformations)) return;
    indexer(r.transformations, index);
    const g = Date.parse(r.genere || '');
    if (Number.isFinite(g) && !(g <= jusquau)) { jusquau = g; texte = dateParis(g); }
  });
  return { index, connuesJusquau: texte };
}

module.exports = {
  SOURCES, ID_VENDOR_RE, ID_CLIENT_RE, DATE_RE,
  idVendor, idClient, jour, dateParis, indexer, transformationDe, compacter, appliquer, lireTous,
};
