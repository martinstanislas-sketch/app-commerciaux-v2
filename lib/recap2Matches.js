'use strict';
// ============================================================================
//  RECAP 2 — LES RAPPROCHEMENTS DÉCIDÉS PAR UN HUMAIN.
//
//  Le moteur (crm-automation/lib/rapprochement.js) PROPOSE ; ici on garde ce
//  qu'un humain a TRANCHÉ. Deux décisions, et deux seulement :
//    · confirmed — « oui, c'est la même personne » -> le client devient
//      « retrouvé, validé manuellement » et compte dans le KPI ;
//    · rejected  — « non » -> ce couple précis n'est plus jamais proposé.
//
//  ⚠️ POURQUOI CES DÉCISIONS NE VIVENT PAS DANS LE JSON MENSUEL.
//  Le JSON est REMPLACÉ à chaque collecte. Y écrire les validations, ce serait
//  les perdre à la première recollecte du mois — exactement ce qu'on veut
//  éviter. Elles vivent donc en base, et sont APPLIQUÉES À LA LECTURE
//  (`appliquer()`), par-dessus le rapport déposé. Une nouvelle collecte ne peut
//  donc pas les écraser : elle ne les voit même pas.
//
//  ⚠️ LA CLÉ D'IDENTITÉ. Fitness Booster possède un identifiant contact stable
//  (relevé dans l'URL de la fiche : « sportif-lateral=1782833692931x4381… »),
//  mais l'obtenir coûte un clic et un onglet PAR CLIENT pendant la collecte.
//  Tant qu'on ne le collecte pas, la clé est l'identité NORMALISÉE (accents,
//  casse, tirets, ordre des mots neutralisés) — la même normalisation que le
//  moteur de rapprochement, pour que les deux parlent de la même chose. Le
//  champ `fb_contact_id` est déjà là : le jour où la collecte le rapporte, il
//  devient la clé prioritaire sans migration.
//
//  ⚠️ AUCUNE ÉCRITURE DANS LES CRM. On enregistre une décision chez NOUS ;
//  Deciplus et Fitness Booster ne sont jamais modifiés.
// ============================================================================

// Normalisation d'identité : doit rester ALIGNÉE sur celle du moteur de
// rapprochement. Accents, casse, apostrophes, tirets, ponctuation, puis les
// mots TRIÉS — « Aristide Guevonoux » et « Guevonoux Aristide » sont la même
// personne, et doivent donner la même clé.
function cleIdentite(identite) {
  return String(identite == null ? '' : identite)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[''`´]/g, ' ')
    .replace(/[-_]/g, ' ')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim().split(/\s+/).filter(Boolean)
    .sort()
    .join(' ');
}

// La clé effective d'une personne : l'identifiant Fitness Booster s'il existe,
// sinon l'identité normalisée. Préfixée pour qu'on sache toujours laquelle
// on lit, et pour qu'un jour la bascule soit lisible en base.
function cleDe({ fbContactId, client } = {}) {
  const id = String(fbContactId || '').trim();
  if (id) return 'fb:' + id;
  const c = cleIdentite(client);
  return c ? 'nom:' + c : '';
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS recap2_identity_matches (
    cle_identite   TEXT NOT NULL,           -- « fb:<id> » ou « nom:<identité triée> »
    id_client      TEXT NOT NULL,           -- Id_client Deciplus, chiffres
    statut         TEXT NOT NULL,           -- 'confirmed' | 'rejected'
    client_fb      TEXT NOT NULL DEFAULT '',-- graphie Fitness Booster au moment de la décision
    nom_deciplus   TEXT NOT NULL DEFAULT '',-- graphie Deciplus au moment de la décision
    fb_contact_id  TEXT NOT NULL DEFAULT '',-- identifiant stable FB, quand on l'aura
    score          REAL,                    -- score du moteur ayant proposé
    methode        TEXT NOT NULL DEFAULT '',-- 'fuzzy' | 'email' | 'manuel'
    decide_le      TEXT NOT NULL,           -- ISO
    decide_par     TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (cle_identite, id_client)
  );
  CREATE INDEX IF NOT EXISTS idx_recap2_matches_cle ON recap2_identity_matches (cle_identite);
`;

// Création sûre au démarrage : idempotente, sans toucher aux tables existantes.
function creerTable(db) { db.exec(SCHEMA); }

// ─── ÉCRITURE ───────────────────────────────────────────────────────────────
//  Une décision REMPLACE la précédente sur le même couple : se tromper puis se
//  corriger doit être possible, sans accumuler deux vérités contradictoires.
//
//  ⚠️ UN SEUL rapprochement CONFIRMÉ par identité. Confirmer un nouveau candidat
//  retire le précédent : une personne ne peut pas être deux clients Deciplus.
//  Les REFUS, eux, s'accumulent — on peut refuser dix candidats.
function decider(db, { client, fbContactId = '', idClient, nomDeciplus = '', statut,
  score = null, methode = 'fuzzy', decidePar = '' } = {}) {
  const cle = cleDe({ fbContactId, client });
  const id = String(idClient || '').trim();
  if (!cle) throw new Error('identité vide');
  if (!/^[0-9]{1,20}$/.test(id)) throw new Error('Id_client invalide');
  if (statut !== 'confirmed' && statut !== 'rejected') throw new Error('statut inconnu : ' + statut);

  const quand = new Date().toISOString();
  const tx = db.transaction(() => {
    if (statut === 'confirmed') {
      db.prepare('DELETE FROM recap2_identity_matches WHERE cle_identite = ? AND statut = ?').run(cle, 'confirmed');
    }
    db.prepare(`INSERT INTO recap2_identity_matches
      (cle_identite, id_client, statut, client_fb, nom_deciplus, fb_contact_id, score, methode, decide_le, decide_par)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(cle_identite, id_client) DO UPDATE SET
        statut=excluded.statut, client_fb=excluded.client_fb, nom_deciplus=excluded.nom_deciplus,
        fb_contact_id=excluded.fb_contact_id, score=excluded.score, methode=excluded.methode,
        decide_le=excluded.decide_le, decide_par=excluded.decide_par`)
      .run(cle, id, statut, String(client || ''), String(nomDeciplus || ''),
        String(fbContactId || ''), score == null ? null : Number(score), String(methode || ''),
        quand, String(decidePar || ''));
  });
  tx();
  return { cle, idClient: id, statut, decideLe: quand };
}

// Annule une décision (le couple redevient proposable).
function oublier(db, { client, fbContactId = '', idClient }) {
  const cle = cleDe({ fbContactId, client });
  return db.prepare('DELETE FROM recap2_identity_matches WHERE cle_identite = ? AND id_client = ?')
    .run(cle, String(idClient || '')).changes;
}

// ─── LECTURE ────────────────────────────────────────────────────────────────
//  Toutes les décisions, indexées par clé d'identité. Une seule requête : le
//  rapport a peu de lignes, la table restera petite, inutile de requêter par
//  client.
function toutesLesDecisions(db) {
  const index = new Map();
  db.prepare('SELECT * FROM recap2_identity_matches').all().forEach((r) => {
    if (!index.has(r.cle_identite)) index.set(r.cle_identite, { confirme: null, refuses: [] });
    const e = index.get(r.cle_identite);
    if (r.statut === 'confirmed') e.confirme = r;
    else e.refuses.push(String(r.id_client));
  });
  return index;
}

// ─── APPLICATION À LA LECTURE ───────────────────────────────────────────────
//  LE point d'entrée : on pose les décisions humaines PAR-DESSUS le rapport
//  déposé, et on RECALCULE les compteurs. Le JSON sur disque n'est jamais
//  modifié — il reste le reflet brut de la collecte.
//
//  Trois effets, dans cet ordre :
//   1. un couple REFUSÉ perd sa proposition (et on n'en invente pas d'autre
//      ici : le moteur ne tourne pas côté serveur) ;
//   2. une identité CONFIRMÉE devient « retrouvée, validée manuellement »,
//      avec l'Id_client décidé — donc sa fiche reste ouvrable ;
//   3. `retrouves`, `valides`, `proposes` et le TAUX sont recalculés.
//
//  Le taux compte les retrouvés automatiques ET les validés : une fois qu'un
//  humain a tranché, c'est une certitude, elle doit compter.
function appliquer(rapport, decisions) {
  if (!rapport || !rapport.studios) return rapport;
  const copie = JSON.parse(JSON.stringify(rapport));
  Object.keys(copie.studios).forEach((s) => {
    const cr = copie.studios[s] && copie.studios[s].clientsRetrouves;
    if (!cr || !Array.isArray(cr.liste)) return;

    cr.liste.forEach((l) => {
      if (l.annulee || l.retrouve) return;             // rien à décider
      const e = decisions.get(cleDe({ fbContactId: l.fbContactId, client: l.client }));
      if (!e) return;
      if (e.confirme) {
        l.retrouve = true;
        l.valideManuellement = true;
        l.idClient = String(e.confirme.id_client);
        l.site = l.site || '';
        l.valideLe = e.confirme.decide_le;
        l.valideNom = e.confirme.nom_deciplus || l.candidat || '';
        // La proposition a fait son office : elle disparaît.
        ['candidat', 'candidatScore', 'candidatNiveau', 'candidatIndices', 'candidatSite', 'candidatId',
          'ficheId', 'ficheNom', 'ficheSite']
          .forEach((k) => { delete l[k]; });
        return;
      }
      // Refusé : on retire la proposition portant cet Id_client, et on note le
      // refus pour que l'écran puisse le dire plutôt que de laisser croire à un
      // oubli. On ne cherche PAS de second candidat ici — c'est le rôle du
      // moteur, à la prochaine collecte, qui lira ces refus.
      if (l.candidatId && e.refuses.indexOf(String(l.candidatId)) >= 0) {
        ['candidat', 'candidatScore', 'candidatNiveau', 'candidatIndices', 'candidatSite', 'candidatId']
          .forEach((k) => { delete l[k]; });
        l.refuse = true;
      }
    });

    // Recompte : les décisions viennent de changer la population.
    const actives = cr.liste.filter((l) => !l.annulee);
    const retrouves = actives.filter((l) => l.retrouve).length;
    cr.retrouves = retrouves;
    cr.valides = actives.filter((l) => l.valideManuellement).length;
    cr.proposes = actives.filter((l) => !l.retrouve && l.candidat).length;
    cr.aVerifier = actives.length - retrouves - cr.proposes;
    cr.taux = actives.length ? retrouves / actives.length : null;
    cr.tauxPct = cr.taux == null ? null : +(cr.taux * 100).toFixed(1);
  });
  return copie;
}

module.exports = { SCHEMA, creerTable, cleIdentite, cleDe, decider, oublier, toutesLesDecisions, appliquer };
