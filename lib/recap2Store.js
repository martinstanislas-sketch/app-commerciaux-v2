'use strict';
// ============================================================================
//  RECAP 2 — MAGASIN DE FICHIERS (validation + lecture + écriture atomique).
//
//  RECAP 2 n'a toujours AUCUNE persistance SQL : ses résultats sont produits
//  sur le Mac par crm-automation, puis déposés sur le serveur sous forme d'UN
//  fichier JSON par mois, dans le volume :
//
//      $DB_DIR/recap2/recap2-AAAA-MM.json
//
//  Ce module est le SEUL endroit qui connaît ce chemin et cette forme. Il est
//  volontairement sans dépendance (fs/path + le module de libellés studios),
//  pour être appelé des deux côtés :
//   · côté serveur  (server.js) : valider ce qui arrive, écrire, relire ;
//   · côté Mac (crm-automation/recap2-envoi.js) : valider AVANT d'envoyer, et
//     surtout n'envoyer QUE la forme canonique — jamais un CSV, un cookie ou
//     quoi que ce soit qui traînerait dans l'objet.
//
//  ⚠️ CE JSON CONTIENT DES NOMS DE CLIENTS (le détail nominatif des cartes
//  « non-reconduction » et « complétion » — on les conserve, c'est l'intérêt de
//  l'écran). D'où :
//   · le fichier vit dans le volume, JAMAIS dans public/ : rien n'est servi en
//     statique, la seule porte de sortie est la route admin GET /api/recap2 ;
//   · l'écriture se fait en 0600 ;
//   · la validation refuse tout ce qui n'est pas exactement la forme attendue.
//
//  ⚠️ AUCUNE ÉCRITURE EN BASE. Ni ici, ni ailleurs pour RECAP 2 : les tables
//  retention_* de l'ancien RECAP ne sont pas touchées.
// ============================================================================

const fs = require('fs');
const path = require('path');
const M = require('../public/recap2-metrics.js'); // LABELS : les 6 studios en propre

const MOIS_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// Bornes de bon sens. Elles ne protègent pas d'un attaquant (la clé de dépôt
// s'en charge) mais d'une bêtise : un CSV collé dans le JSON, un journal qui
// enfle, un fichier qui remplirait le volume.
const TAILLE_MAX = 4 * 1024 * 1024;   // 4 Mo : un mois réel pèse ~30 Ko
const TEXTE_MAX = 500;                // aucune chaîne légitime ne dépasse ça
const PROFONDEUR_MAX = 8;
const LISTE_MAX = 20000;              // détail nominatif d'un studio
const JOURNAL_MAX = 2000;

const CLES_RACINE = ['genere', 'mois', 'm1', 'source', 'studios', 'journal', 'erreurs'];
const CLES_STUDIO = ['studio', 'nonReconduction', 'completion', 'avertissements', 'controleBloquant'];
const CLES_NR = ['base', 'nonReconduits', 'taux', 'tauxPct', 'liste'];
const CLES_COMP = ['contratsSouscrits', 'annulesExclus', 'contratsValides', 'ontPaye',
  'taux', 'tauxPct', 'liste', 'contratsBruts', 'doublonsSignataire'];

const estObjet = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const estNombre = (x) => typeof x === 'number' && Number.isFinite(x);
const estTexte = (x) => typeof x === 'string';
const clesEnTrop = (o, permises) => Object.keys(o).filter((k) => !permises.includes(k));

function moisPrecedent(ym) {
  const [a, m] = String(ym).split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 2, 1));
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

// Le taux annoncé doit correspondre au rapport affiché, à l'arrondi près.
// Même règle que public/recap2.js : le serveur refuse d'archiver un chiffre que
// l'écran refuserait d'afficher.
function tauxCoherent(taux, num, den) {
  if (!estNombre(num) || !estNombre(den) || den <= 0) return taux == null;
  if (!estNombre(taux)) return false;
  return Math.abs(taux - num / den) < 0.0005;
}

// ─── Garde-fou générique : que des feuilles simples, courtes, peu profondes ──
// C'est CE contrôle qui rend impossible de faire passer un CSV d'encaissements,
// un cookie de session ou un PDF encodé dans un champ « libre » du rapport.
function verifierFeuilles(valeur, chemin, pb, profondeur) {
  if (profondeur > PROFONDEUR_MAX) { pb.push(chemin + ' : structure trop profonde'); return; }
  if (valeur === null) return;
  if (estTexte(valeur)) {
    if (valeur.length > TEXTE_MAX) pb.push(chemin + ' : texte de ' + valeur.length + ' caractères (max ' + TEXTE_MAX + ')');
    return;
  }
  if (typeof valeur === 'boolean') return;
  if (typeof valeur === 'number') {
    if (!Number.isFinite(valeur)) pb.push(chemin + ' : nombre non fini');
    return;
  }
  if (Array.isArray(valeur)) {
    if (valeur.length > LISTE_MAX) { pb.push(chemin + ' : liste de ' + valeur.length + ' entrées (max ' + LISTE_MAX + ')'); return; }
    valeur.forEach((v, i) => verifierFeuilles(v, chemin + '[' + i + ']', pb, profondeur + 1));
    return;
  }
  if (estObjet(valeur)) {
    Object.keys(valeur).forEach((k) => {
      if (k.length > 120) pb.push(chemin + ' : clé anormalement longue');
      verifierFeuilles(valeur[k], chemin + '.' + k, pb, profondeur + 1);
    });
    return;
  }
  pb.push(chemin + ' : type non sérialisable');
}

// ─── VALIDATION STRICTE ─────────────────────────────────────────────────────
//  Renvoie { ok, problemes[] }. On énumère TOUS les problèmes plutôt que de
//  s'arrêter au premier : quand la collecte change, on veut la liste complète.
function valider(rapport, moisAttendu) {
  const pb = [];
  if (!estObjet(rapport)) return { ok: false, problemes: ['racine : objet JSON attendu'] };

  const trop = clesEnTrop(rapport, CLES_RACINE);
  if (trop.length) pb.push('clés inattendues à la racine : ' + trop.join(', '));

  // Mois / mois précédent : la cohérence interne du fichier, et son accord avec
  // l'URL de dépôt (impossible de déposer juin sous l'étiquette juillet).
  if (!MOIS_RE.test(String(rapport.mois || ''))) pb.push('mois : AAAA-MM attendu');
  else if (moisAttendu && rapport.mois !== moisAttendu) {
    pb.push('mois : le fichier porte ' + rapport.mois + ', le dépôt annonce ' + moisAttendu);
  }
  if (!MOIS_RE.test(String(rapport.m1 || ''))) pb.push('m1 : AAAA-MM attendu');
  else if (MOIS_RE.test(String(rapport.mois || '')) && rapport.m1 !== moisPrecedent(rapport.mois)) {
    pb.push('m1 : ' + rapport.m1 + ' n\'est pas le mois précédant ' + rapport.mois);
  }

  if (!estTexte(rapport.genere) || isNaN(new Date(rapport.genere).getTime())) {
    pb.push('genere : date ISO attendue');
  }

  // Journal et erreurs : des lignes de texte, rien d'autre.
  [['journal', JOURNAL_MAX], ['erreurs', 200]].forEach(([cle, max]) => {
    const v = rapport[cle];
    if (v === undefined) return; // facultatif
    if (!Array.isArray(v)) { pb.push(cle + ' : tableau attendu'); return; }
    if (v.length > max) pb.push(cle + ' : ' + v.length + ' entrées (max ' + max + ')');
    if (!v.every(estTexte)) pb.push(cle + ' : que des chaînes');
  });

  // Source : la traçabilité de la collecte (fichiers, périodes, contrôles).
  // Les clés sont connues ; le contenu est libre mais soumis au garde-fou des
  // feuilles — donc jamais un CSV.
  if (rapport.source !== undefined) {
    if (!estObjet(rapport.source)) pb.push('source : objet attendu');
    else {
      Object.keys(rapport.source).forEach((k) => {
        if (!/^deciplus_\d{4}-\d{2}$/.test(k) && k !== 'fitnessBooster') pb.push('source : clé inattendue « ' + k + ' »');
        else if (!estObjet(rapport.source[k])) pb.push('source.' + k + ' : objet attendu');
      });
    }
  }

  // Studios : les 6 en propre, ni plus ni moins.
  if (!estObjet(rapport.studios)) pb.push('studios : objet attendu');
  else {
    const inconnus = clesEnTrop(rapport.studios, M.LABELS);
    if (inconnus.length) pb.push('studios : studio(s) hors périmètre : ' + inconnus.join(', '));
    const manquants = M.LABELS.filter((s) => !(s in rapport.studios));
    if (manquants.length) pb.push('studios : studio(s) manquant(s) : ' + manquants.join(', '));
    M.LABELS.filter((s) => s in rapport.studios).forEach((s) => validerStudio(rapport.studios[s], s, pb));
  }

  verifierFeuilles(rapport, 'racine', pb, 0);
  return { ok: pb.length === 0, problemes: pb };
}

function validerStudio(bloc, label, pb) {
  const ici = 'studios.' + label;
  if (!estObjet(bloc)) { pb.push(ici + ' : objet attendu'); return; }
  const trop = clesEnTrop(bloc, CLES_STUDIO);
  if (trop.length) pb.push(ici + ' : clés inattendues : ' + trop.join(', '));
  if (bloc.studio !== label) pb.push(ici + '.studio : « ' + bloc.studio +' » ne correspond pas à la clé');
  if (bloc.avertissements !== undefined
    && (!Array.isArray(bloc.avertissements) || !bloc.avertissements.every(estTexte))) {
    pb.push(ici + '.avertissements : tableau de chaînes attendu');
  }
  if (bloc.controleBloquant !== undefined) {
    if (!estObjet(bloc.controleBloquant)) pb.push(ici + '.controleBloquant : objet attendu');
    else if (typeof bloc.controleBloquant.ok !== 'boolean') pb.push(ici + '.controleBloquant.ok : booléen attendu');
  }

  // Non-reconduction : nul (KPI refusé, c'est légitime) ou complet et cohérent.
  const nr = bloc.nonReconduction;
  if (nr !== null && nr !== undefined) {
    const ou = ici + '.nonReconduction';
    if (!estObjet(nr)) pb.push(ou + ' : objet ou null attendu');
    else {
      const t = clesEnTrop(nr, CLES_NR);
      if (t.length) pb.push(ou + ' : clés inattendues : ' + t.join(', '));
      if (!estNombre(nr.base) || nr.base < 0) pb.push(ou + '.base : nombre positif attendu');
      if (!estNombre(nr.nonReconduits) || nr.nonReconduits < 0) pb.push(ou + '.nonReconduits : nombre positif attendu');
      if (estNombre(nr.base) && estNombre(nr.nonReconduits) && nr.nonReconduits > nr.base) {
        pb.push(ou + ' : plus de non-reconduits (' + nr.nonReconduits + ') que de base (' + nr.base + ')');
      }
      if (!tauxCoherent(nr.taux, nr.nonReconduits, nr.base)) {
        pb.push(ou + '.taux : incohérent avec ' + nr.nonReconduits + '/' + nr.base);
      }
      if (nr.tauxPct !== null && nr.tauxPct !== undefined && !estNombre(nr.tauxPct)) pb.push(ou + '.tauxPct : nombre ou null attendu');
      validerListe(nr.liste, ou + '.liste', pb, (e, ou2) => {
        // Le détail nominatif : on le CONSERVE, c'est ce que l'écran ouvre au clic.
        if (!estTexte(e.client) || !e.client.trim()) pb.push(ou2 + '.client : nom attendu');
        if (!estNombre(e.netM1)) pb.push(ou2 + '.netM1 : nombre attendu');
        if (!estNombre(e.netM)) pb.push(ou2 + '.netM : nombre attendu');
        const t2 = clesEnTrop(e, ['client', 'netM1', 'netM']);
        if (t2.length) pb.push(ou2 + ' : clés inattendues : ' + t2.join(', '));
      });
      if (Array.isArray(nr.liste) && estNombre(nr.nonReconduits) && nr.liste.length !== nr.nonReconduits) {
        pb.push(ou + ' : ' + nr.liste.length + ' nom(s) pour ' + nr.nonReconduits + ' non-reconduit(s)');
      }
    }
  }

  // Complétion : même logique.
  const co = bloc.completion;
  if (co !== null && co !== undefined) {
    const ou = ici + '.completion';
    if (!estObjet(co)) pb.push(ou + ' : objet ou null attendu');
    else {
      const t = clesEnTrop(co, CLES_COMP);
      if (t.length) pb.push(ou + ' : clés inattendues : ' + t.join(', '));
      if (!estNombre(co.contratsValides) || co.contratsValides < 0) pb.push(ou + '.contratsValides : nombre positif attendu');
      if (!estNombre(co.ontPaye) || co.ontPaye < 0) pb.push(ou + '.ontPaye : nombre positif attendu');
      if (estNombre(co.contratsValides) && estNombre(co.ontPaye) && co.ontPaye > co.contratsValides) {
        pb.push(ou + ' : plus de payés (' + co.ontPaye + ') que de contrats (' + co.contratsValides + ')');
      }
      if (!tauxCoherent(co.taux, co.ontPaye, co.contratsValides)) {
        pb.push(ou + '.taux : incohérent avec ' + co.ontPaye + '/' + co.contratsValides);
      }
      ['contratsSouscrits', 'annulesExclus', 'tauxPct', 'contratsBruts', 'doublonsSignataire'].forEach((k) => {
        if (co[k] !== null && co[k] !== undefined && !estNombre(co[k])) pb.push(ou + '.' + k + ' : nombre ou null attendu');
      });
      validerListe(co.liste, ou + '.liste', pb, (e, ou2) => {
        if (!estTexte(e.contrat) || !e.contrat.trim()) pb.push(ou2 + '.contrat : nom attendu');
        if (e.date !== undefined && !estTexte(e.date)) pb.push(ou2 + '.date : texte attendu');
        if (typeof e.paye !== 'boolean') pb.push(ou2 + '.paye : booléen attendu');
        const t2 = clesEnTrop(e, ['contrat', 'date', 'paye']);
        if (t2.length) pb.push(ou2 + ' : clés inattendues : ' + t2.join(', '));
      });
      if (Array.isArray(co.liste) && estNombre(co.contratsValides) && co.liste.length !== co.contratsValides) {
        pb.push(ou + ' : ' + co.liste.length + ' nom(s) pour ' + co.contratsValides + ' contrat(s) valide(s)');
      }
    }
  }
}

function validerListe(liste, ou, pb, valideur) {
  if (liste === undefined || liste === null) { pb.push(ou + ' : tableau attendu'); return; }
  if (!Array.isArray(liste)) { pb.push(ou + ' : tableau attendu'); return; }
  if (liste.length > LISTE_MAX) { pb.push(ou + ' : ' + liste.length + ' entrées (max ' + LISTE_MAX + ')'); return; }
  liste.forEach((e, i) => {
    if (!estObjet(e)) { pb.push(ou + '[' + i + '] : objet attendu'); return; }
    valideur(e, ou + '[' + i + ']');
  });
}

// ─── FORME CANONIQUE ────────────────────────────────────────────────────────
//  On ne stocke (et on n'envoie) que les champs connus, reconstruits un à un.
//  Une clé qu'on n'attend pas ne peut donc pas se retrouver sur le serveur,
//  même si la validation venait un jour à s'assouplir.
function nettoyer(rapport) {
  const propre = {};
  CLES_RACINE.forEach((k) => { if (rapport[k] !== undefined) propre[k] = rapport[k]; });
  propre.studios = {};
  M.LABELS.forEach((s) => {
    const b = rapport.studios && rapport.studios[s];
    if (!estObjet(b)) return;
    const n = {};
    CLES_STUDIO.forEach((k) => { if (b[k] !== undefined) n[k] = b[k]; });
    if (estObjet(b.nonReconduction)) {
      n.nonReconduction = {};
      CLES_NR.forEach((k) => { if (b.nonReconduction[k] !== undefined) n.nonReconduction[k] = b.nonReconduction[k]; });
      n.nonReconduction.liste = (b.nonReconduction.liste || []).map((e) => ({ client: e.client, netM1: e.netM1, netM: e.netM }));
    }
    if (estObjet(b.completion)) {
      n.completion = {};
      CLES_COMP.forEach((k) => { if (b.completion[k] !== undefined) n.completion[k] = b.completion[k]; });
      n.completion.liste = (b.completion.liste || []).map((e) => ({ contrat: e.contrat, date: e.date === undefined ? '' : e.date, paye: e.paye }));
    }
    propre.studios[s] = n;
  });
  return propre;
}

// ─── CHEMINS ────────────────────────────────────────────────────────────────
//  DB_DIR est le volume Railway (la base y vit déjà) ; en local, la racine du
//  projet. Ce dossier n'est JAMAIS servi en statique.
function dossier() {
  return path.join(process.env.DB_DIR || path.join(__dirname, '..'), 'recap2');
}

// Un mois -> un chemin, ou null. Le format AAAA-MM interdit déjà tout « ../ » ;
// on vérifie malgré tout que le chemin résolu reste DANS le dossier attendu.
function chemin(mois) {
  if (!MOIS_RE.test(String(mois || ''))) return null;
  const d = path.resolve(dossier());
  const f = path.resolve(d, 'recap2-' + mois + '.json');
  if (path.dirname(f) !== d) return null;
  return f;
}

// ─── ÉCRITURE ATOMIQUE ──────────────────────────────────────────────────────
//  .tmp puis rename() : sur le même système de fichiers, le remplacement est
//  atomique. Un lecteur voit soit l'ancien fichier, soit le nouveau — jamais un
//  JSON coupé en deux. AUCUNE COPIE .bak : le fichier est reproductible (il
//  suffit de relancer la collecte), et une copie de plus, ce sont des noms de
//  clients de plus qui traînent.
function ecrire(mois, rapport) {
  const f = chemin(mois);
  if (!f) throw new Error('mois invalide');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = f + '.tmp-' + process.pid + '-' + Date.now();
  try {
    fs.writeFileSync(tmp, JSON.stringify(rapport, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, f);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) { /* le .tmp n'existait pas */ }
    throw e;
  }
  return f;
}

// ─── LECTURE ────────────────────────────────────────────────────────────────
//  { etat: 'ok' | 'absent' | 'illisible', ... } — jamais d'exception à gérer
//  côté route.
function lire(mois) {
  const f = chemin(mois);
  if (!f) return { etat: 'illisible', raison: 'mois invalide' };
  if (!fs.existsSync(f)) return { etat: 'absent', fichier: f };
  try {
    return { etat: 'ok', fichier: f, rapport: JSON.parse(fs.readFileSync(f, 'utf8')) };
  } catch (e) {
    return { etat: 'illisible', fichier: f, raison: e.message };
  }
}

module.exports = {
  MOIS_RE, TAILLE_MAX, LABELS: M.LABELS,
  moisPrecedent, tauxCoherent, valider, nettoyer,
  dossier, chemin, ecrire, lire,
};
