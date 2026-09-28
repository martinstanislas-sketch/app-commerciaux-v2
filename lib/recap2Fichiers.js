'use strict';
// ============================================================================
//  RECAP 2 — TRAÇABILITÉ DES FICHIERS ANALYSÉS.
//
//  Répond à une seule question : « quels fichiers ont réellement servi à
//  l'analyse affichée à l'écran ? ». Pour chacun : source, nom, mois, date
//  d'import, date de dernière analyse, statut.
//
//  ⚠️ LA LISTE COURANTE N'EST STOCKÉE NULLE PART : elle se DÉDUIT du JSON
//  mensuel (`rapport.source`, rempli par crm-automation/recap2-collecte.js).
//  Aucune copie, donc aucune divergence possible avec ce qui est affiché.
//
//  ⚠️ CE QUI EST STOCKÉ : les dépôts REMPLACÉS. Le dépôt d'un mois écrase le
//  JSON précédent (lib/recap2Store.js) ; sans trace, « Remplacé » serait
//  invérifiable. Chaque ligne de `recap2_depots` est un dépôt ; sa liste de
//  fichiers n'est figée qu'au moment où il est remplacé (NULL = dépôt en
//  vigueur). Que des noms de fichiers et des dates : AUCUN nom de client.
//
//  Statuts :
//   · pris      — « Pris en compte » : fichier du dépôt en vigueur, conforme ;
//   · non_pris  — « Non pris en compte » : non conforme, écarté ou en échec ;
//   · remplace  — « Remplacé » : fichier d'un dépôt antérieur du même mois.
//
//  Un rapport d'avant cette traçabilité n'a ni date d'import ni nom pour les
//  fichiers de paiements : ces champs valent null, rien n'est inventé.
// ============================================================================

const MOIS_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS recap2_depots (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    mois     TEXT NOT NULL,
    genere   TEXT NOT NULL DEFAULT '', -- horodatage de l'analyse (rapport.genere)
    recu_le  TEXT NOT NULL DEFAULT '', -- réception par le serveur ('' si inconnue)
    fichiers TEXT                      -- NULL tant que le dépôt est en vigueur
  );
  CREATE INDEX IF NOT EXISTS recap2_depots_mois ON recap2_depots (mois);
`;
function creerTable(db) { db.exec(SCHEMA); }

const texte = (x) => (typeof x === 'string' ? x : '');
const dateOuNull = (x) => (typeof x === 'string' && x && !isNaN(new Date(x)) ? x : null);
const joindre = (l) => (Array.isArray(l) ? l.filter((x) => typeof x === 'string').join(' · ') : '');

// ── LA LISTE, DÉDUITE DU RAPPORT ────────────────────────────────────────────
function lister(rapport) {
  const src = (rapport && rapport.source) || {};
  const analyseLe = dateOuNull(rapport && rapport.genere);
  const out = [];

  // Deciplus : encaissements (M-1, M) et journal des ventes (M).
  Object.keys(src).sort().forEach((k) => {
    const m = /^deciplus_(ventes_)?(\d{4}-\d{2})$/.exec(k);
    if (!m) return;
    const s = src[k] || {};
    const conforme = s.conforme !== false;
    let motif = conforme ? '' : (joindre(s.problemes) || 'fichier non conforme');
    // Un studio en échec de contrôle n'a aucun chiffre ; le fichier sert aux autres.
    if (conforme && s.controleParStudio && typeof s.controleParStudio === 'object') {
      const ko = Object.keys(s.controleParStudio).filter((st) => s.controleParStudio[st] && s.controleParStudio[st].ok === false);
      if (ko.length) motif = 'Contrôle en échec, non utilisé pour : ' + ko.join(', ');
    }
    out.push({
      source: 'Deciplus', nature: m[1] ? 'Journal des ventes' : 'Encaissements',
      nom: texte(s.fichier) || null, mois: m[2], importeLe: dateOuNull(s.exporteLe), analyseLe,
      statut: conforme ? 'pris' : 'non_pris', motif,
    });
  });

  // Deciplus : encaissements APRÈS M, lus pour les paiements sur 31 jours.
  // Le mois M lui-même est déjà listé ci-dessus.
  const pai = src.paiements || {};
  if (Array.isArray(pai.fichiers)) {
    pai.fichiers.forEach((f) => out.push({
      source: 'Deciplus', nature: 'Encaissements (paiements sur 31 jours)',
      nom: texte(f && f.fichier) || null, mois: texte(f && f.mois) || null,
      importeLe: dateOuNull(f && f.exporteLe), analyseLe,
      statut: f && f.pris ? 'pris' : 'non_pris', motif: texte(f && f.motif),
    }));
  } else if (Array.isArray(pai.moisLus)) {
    // Rapport d'avant la traçabilité : on sait quels mois ont été lus, pas plus.
    pai.moisLus.filter((ym) => ym !== (rapport && rapport.mois)).forEach((ym) => out.push({
      source: 'Deciplus', nature: 'Encaissements (paiements sur 31 jours)',
      nom: null, mois: texte(ym) || null, importeLe: null, analyseLe, statut: 'pris', motif: '',
    }));
  }

  // Fitness Booster : aucune exportation, une LECTURE À L'ÉCRAN par studio.
  const fb = src.fitnessBooster || {};
  Object.keys(fb).forEach((studio) => {
    const s = fb[studio] || {};
    out.push({
      source: 'Fitness Booster', nature: 'Contrats signés',
      nom: 'Lecture écran — Contrats ' + studio, mois: texte(rapport && rapport.mois) || null,
      importeLe: dateOuNull(s.luLe), analyseLe,
      statut: s.echec ? 'non_pris' : 'pris', motif: texte(s.echec),
    });
  });
  return out;
}

// Deux entrées identiques (même fichier, même import) ne comptent qu'une fois.
const cle = (f) => [f.source, f.nature, f.nom || '', f.mois || '', f.importeLe || ''].join('|');

// ── LE REGISTRE DES DÉPÔTS ─────────────────────────────────────────────────
//  Appelé APRÈS l'écriture du nouveau JSON. `precedent` = le rapport qu'il
//  vient de remplacer (null s'il n'y en avait pas).
function enregistrerDepot(db, mois, rapport, recuLe, precedent) {
  if (!MOIS_RE.test(mois)) throw new Error('mois invalide');
  const genere = texte(rapport && rapport.genere);
  const genereAvant = texte(precedent && precedent.genere);
  const vivant = db.prepare('SELECT id, genere FROM recap2_depots WHERE mois = ? AND fichiers IS NULL ORDER BY id DESC LIMIT 1').get(mois);
  const inserer = db.prepare('INSERT INTO recap2_depots (mois, genere, recu_le, fichiers) VALUES (?, ?, ?, ?)');
  db.transaction(() => {
    // Même analyse renvoyée (reprise après un dépôt en échec) : rien n'est remplacé.
    if (precedent && genereAvant === genere) {
      if (vivant && vivant.genere === genere) db.prepare('UPDATE recap2_depots SET recu_le = ? WHERE id = ?').run(recuLe, vivant.id);
      else inserer.run(mois, genere, recuLe, null);
      return;
    }
    if (precedent) {
      const liste = JSON.stringify(lister(precedent));
      if (vivant && vivant.genere === genereAvant) db.prepare('UPDATE recap2_depots SET fichiers = ? WHERE id = ?').run(liste, vivant.id);
      else inserer.run(mois, genereAvant, '', liste); // dépôt d'avant le registre
    }
    // Un dépôt « en vigueur » qui ne correspond plus au fichier est clos, vide.
    db.prepare("UPDATE recap2_depots SET fichiers = '[]' WHERE mois = ? AND fichiers IS NULL").run(mois);
    inserer.run(mois, genere, recuLe, null);
  })();
}

// ── CE QUE L'ÉCRAN AFFICHE ─────────────────────────────────────────────────
//  Les fichiers du rapport servi, puis ceux des dépôts remplacés (du plus
//  récent au plus ancien), sans doublon.
function fichiersAnalyses(db, mois, rapport) {
  const courants = lister(rapport);
  const vus = new Set(courants.map(cle));
  const remplaces = [];
  const genere = texte(rapport && rapport.genere);
  db.prepare('SELECT genere, fichiers FROM recap2_depots WHERE mois = ? AND fichiers IS NOT NULL ORDER BY id DESC').all(mois)
    .forEach((r) => {
      if (r.genere === genere) return;
      let liste = [];
      try { liste = JSON.parse(r.fichiers); } catch (_) { /* ligne illisible : ignorée */ }
      (Array.isArray(liste) ? liste : []).forEach((f) => {
        const k = cle(f);
        if (vus.has(k)) return;
        vus.add(k);
        remplaces.push(Object.assign({}, f, { statut: 'remplace', motif: '' }));
      });
    });
  return { analyseLe: dateOuNull(genere), fichiers: courants.concat(remplaces) };
}

module.exports = { creerTable, lister, enregistrerDepot, fichiersAnalyses };
