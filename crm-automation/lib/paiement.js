'use strict';
// ============================================================================
//  PAIEMENT D'UNE VENTE RETROUVÉE — la fenêtre des 31 jours.
//
//  LE FAUX POSITIF DU 2026-09-14. Muriel Darmon (Id_client 42321) signe le
//  28/08 ; son premier prélèvement tombe le 02/09. RECAP 2 ne regardait que les
//  encaissements du MOIS de la vente, dans le STUDIO de la vente, par le NOM :
//  elle apparaissait « pas encore encaissée ». Sur août, 22 ventes retrouvées
//  sur 38 étaient dans ce cas — 13 payées au mois suivant, 2 payées en août mais
//  sur un autre site Deciplus.
//
//  LA RÈGLE (validée par Stan) :
//   · rapprochement par ID_CLIENT, TOUS SITES CONFONDUS — l'encaissement d'un
//     autre site compte, et un homonyme (DARMON Ursula) ne compte jamais ;
//   · fenêtre : jour de signature → signature + 31 jours, bornes incluses.
//     Elle peut déborder sur M+2 (signature le 31/08 → 01/10) : on ne raisonne
//     pas en mois, on raisonne en JOURS ;
//   · montant NET (encaissements − rejets − remboursements) strictement positif,
//     ET au moins un encaissement positif. Un prélèvement rejeté ne fait pas
//     passer le client en « encaissé » ;
//   · quatre issues, dont trois métier :
//       encaisse     net positif dans la fenêtre ;
//       attendu      rien encore, et les 31 jours ne sont pas écoulés — neutre ;
//       aucun        rien, les 31 jours sont écoulés ET les données couvrent
//                    TOUTE la fenêtre — la seule vraie anomalie ;
//       indetermine  rien, fenêtre écoulée, mais les données ne la couvrent pas
//                    entièrement (un export a manqué). On ne conclut pas : dire
//                    « aucun encaissement » sans les données serait inventer.
//
//  ⚠️ AUCUN KPI N'EN DÉPEND. Ni le mois de rattachement de la vente, ni le taux
//  de clients retrouvés, ni la non-reconduction : c'est une information de
//  contrôle posée sur une ligne déjà retrouvée.
// ============================================================================

const JOURS_FENETRE = 31;
const JOUR_MS = 86400000;

// « JJ/MM/AAAA » ou « AAAA-MM-JJ » -> numéro de jour (UTC). NaN si illisible.
// On compte en JOURS entiers : pas d'heure, pas de fuseau, pas de surprise
// au changement d'heure.
function jour(texte) {
  const s = String(texte == null ? '' : texte).trim();
  let a, m, j;
  let r = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (r) { j = +r[1]; m = +r[2]; a = +r[3]; }
  else if ((r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) { a = +r[1]; m = +r[2]; j = +r[3]; }
  else return NaN;
  const t = Date.UTC(a, m - 1, j);
  const d = new Date(t);
  // Refuse le 31/02 et consorts plutôt que de glisser au mois suivant.
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== j) return NaN;
  return Math.round(t / JOUR_MS);
}
const texte = (n) => {
  const d = new Date(n * JOUR_MS);
  return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear();
};
// Le jour CALENDAIRE local d'un instant (heure de l'export, de la collecte).
const jourLocal = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / JOUR_MS);
};

// ── COUVERTURE DES DONNÉES ────────────────────────────────────────────────
//  Chaque export d'encaissements couvre [début de période, fin de période],
//  mais un mois EN COURS n'est connu que jusqu'à la VEILLE de son export : les
//  prélèvements du jour même peuvent ne pas être passés. On prend donc
//  min(fin de période, veille de l'export).
//  La couverture est l'intervalle CONTINU obtenu en enchaînant les fichiers :
//  au premier trou, elle s'arrête — un mois manquant au milieu interdit de
//  conclure au-delà.
//   fichiers : [{ periode: { du: 'AAAA-MM-JJ', au: 'AAAA-MM-JJ' }, exporteLe: Date|ISO }]
//   rend     : { du, au } en numéros de jour, ou null
function couverture(fichiers) {
  const plages = (fichiers || [])
    .filter((f) => f && f.periode)
    .map((f) => {
      const du = jour(f.periode.du);
      let au = jour(f.periode.au);
      if (f.exporteLe) au = Math.min(au, jourLocal(f.exporteLe) - 1);
      return { du, au };
    })
    .filter((p) => Number.isFinite(p.du) && Number.isFinite(p.au) && p.au >= p.du)
    .sort((x, y) => x.du - y.du);
  if (!plages.length) return null;
  const out = { du: plages[0].du, au: plages[0].au };
  for (let i = 1; i < plages.length; i++) {
    if (plages[i].du > out.au + 1) break;          // un trou : on s'arrête
    out.au = Math.max(out.au, plages[i].au);
  }
  return out;
}

// Les mois d'encaissements à consulter pour couvrir TOUTES les fenêtres des
// ventes signées en M : de M jusqu'au mois de (dernier jour de M + 31 jours),
// sans dépasser le mois en cours (un mois futur n'a pas encore de données).
function moisNecessaires(mois, aujourdhui = new Date()) {
  const [a, m] = String(mois).split('-').map(Number);
  const dernier = Math.round(Date.UTC(a, m, 0) / JOUR_MS);     // dernier jour de M
  const fin = new Date((dernier + JOURS_FENETRE) * JOUR_MS);
  const limite = Date.UTC(fin.getUTCFullYear(), fin.getUTCMonth(), 1);
  const courant = Date.UTC(aujourdhui.getFullYear(), aujourdhui.getMonth(), 1);
  const out = [];
  for (let d = new Date(Date.UTC(a, m - 1, 1)); d.getTime() <= Math.min(limite, courant); d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    out.push(d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'));
  }
  return out;
}

// Index des encaissements par Id_client (idMembre Deciplus), tous sites.
// Une ligne sans idMembre ne peut appartenir à personne avec certitude : ignorée.
function indexerParId(lignes) {
  const index = new Map();
  (lignes || []).forEach((l) => {
    const id = String((l && l.idMembre) || '').trim();
    if (!/^[0-9]{1,20}$/.test(id)) return;
    if (!index.has(id)) index.set(id, []);
    index.get(id).push(l);
  });
  return index;
}

// ── LE STATUT ─────────────────────────────────────────────────────────────
//  idClient      : Id_client de la vente RETROUVÉE (sans id, pas de statut)
//  dateSignature : « JJ/MM/AAAA » — la date de signature Fitness Booster
//  parId         : indexerParId(encaissements de toutes les périodes lues)
//  couvert       : couverture(...) — ce que les données disent vraiment
//  aujourdhui    : jour de la collecte (Date)
//  Rend { etat, premier, finFenetre, couvertJusquau } ou null.
function statutPaiement({ idClient, dateSignature, parId, couvert, aujourdhui = new Date() } = {}) {
  const id = String(idClient || '').trim();
  const debut = jour(dateSignature);
  if (!/^[0-9]{1,20}$/.test(id) || !Number.isFinite(debut)) return null;
  const fin = debut + JOURS_FENETRE;

  const lignes = ((parId && parId.get(id)) || [])
    .map((l) => ({ l, j: jour(l.date) }))
    .filter((x) => Number.isFinite(x.j) && x.j >= debut && x.j <= fin);
  // Centimes entiers : 69 − 69 doit valoir 0, pas 1e-14.
  const netCentimes = lignes.reduce((s, x) => s + Math.round((Number(x.l.montant) || 0) * 100), 0);
  const positifs = lignes
    .filter((x) => (Number(x.l.montant) || 0) > 0 && !x.l.decaissement)
    .sort((p, q) => p.j - q.j);

  const base = {
    finFenetre: texte(fin),
    couvertJusquau: couvert && Number.isFinite(couvert.au) ? texte(couvert.au) : '',
  };
  if (netCentimes > 0 && positifs.length) {
    return Object.assign({ etat: 'encaisse', premier: texte(positifs[0].j) }, base);
  }
  const toutCouvert = !!couvert && couvert.du <= debut && couvert.au >= fin;
  if (toutCouvert) return Object.assign({ etat: 'aucun', premier: '' }, base);
  if (jourLocal(aujourdhui) <= fin) return Object.assign({ etat: 'attendu', premier: '' }, base);
  return Object.assign({ etat: 'indetermine', premier: '' }, base);
}

const ETATS = ['encaisse', 'attendu', 'aucun', 'indetermine'];

module.exports = { JOURS_FENETRE, ETATS, jour, texte, jourLocal, couverture, moisNecessaires, indexerParId, statutPaiement };
