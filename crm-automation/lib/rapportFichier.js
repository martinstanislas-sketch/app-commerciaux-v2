'use strict';
// ============================================================================
//  OÙ ÉCRIRE LE RAPPORT DE COLLECTE — et surtout, où NE PAS l'écrire.
//
//  Le 10 septembre 2026, une collecte de juillet a vu son navigateur tomber en
//  plein export. Elle est allée au bout de son code malgré tout et a déposé son
//  rapport vide — aucun KPI, deux erreurs — PAR-DESSUS le rapport valide du
//  mois, qui était le seul exemplaire local. Le fichier n'était pas
//  irremplaçable (il se recollecte), mais le remplacer était gratuit et idiot.
//
//  Règle : une collecte EN ÉCHEC n'écrase jamais un rapport EXPLOITABLE. Elle
//  écrit à côté, en « .echec.json », pour le diagnostic. L'envoi, lui, ne
//  regarde que le fichier principal — il ne peut donc pas partir avec un
//  rapport en échec, et le bon fichier reste là où il l'attend.
//
//  « Exploitable » ne veut pas dire « bien formé » : une collecte ratée produit
//  un rapport parfaitement conforme et entièrement vide. On exige donc qu'il
//  PASSERAIT les contrôles bloquants — le même juge que l'envoi.
// ============================================================================

const fs = require('fs');
const path = require('path');
const CTRL = require('./recap2Controles.js');

const nomPrincipal = (mois) => 'recap2-' + mois + '.json';
const nomEchec = (mois) => 'recap2-' + mois + '.echec.json';

// Le rapport déjà sur place vaut-il d'être protégé ?
function ancienExploitable(dossier, mois) {
  const f = path.join(dossier, nomPrincipal(mois));
  if (!fs.existsSync(f)) return null;
  let j = null;
  try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return null; }
  try { return CTRL.analyser(j, mois).peutEnvoyer ? j : null; } catch (_) { return null; }
}

// Décide du fichier de destination. Ne touche à rien : rend une intention.
//   { cible, conserve, ancienGenere }
function choisirCible(dossier, mois, { enEchec } = {}) {
  const principal = path.join(dossier, nomPrincipal(mois));
  if (!enEchec) return { cible: principal, conserve: false, ancienGenere: null };
  const ancien = ancienExploitable(dossier, mois);
  if (!ancien) return { cible: principal, conserve: false, ancienGenere: null };
  return { cible: path.join(dossier, nomEchec(mois)), conserve: true, ancienGenere: ancien.genere || null };
}

// Écrit, puis range : une collecte réussie efface le diagnostic précédent, qui
// n'a plus rien à dire et finirait par être lu pour le bon fichier.
function ecrire(dossier, mois, rapport, { enEchec } = {}) {
  fs.mkdirSync(dossier, { recursive: true });
  const d = choisirCible(dossier, mois, { enEchec });
  fs.writeFileSync(d.cible, JSON.stringify(rapport, null, 2));
  const diagnostic = path.join(dossier, nomEchec(mois));
  let nettoye = false;
  if (!enEchec && fs.existsSync(diagnostic)) {
    try { fs.unlinkSync(diagnostic); nettoye = true; } catch (_) { /* déjà parti */ }
  }
  return Object.assign({}, d, { nettoye, diagnostic });
}

module.exports = { choisirCible, ecrire, ancienExploitable, nomPrincipal, nomEchec };
