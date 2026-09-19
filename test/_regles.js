'use strict';
// Aide de test : lecture du registre unique des remarques (public/recap2-regles.js).
const G = require('../public/recap2-regles.js');
const txt = (items) => G.actions(items).map((x) => x.texte);
// T.<ID DE RÈGLE> = texte exact (gabarit) de la règle.
const T = Object.fromEntries(G.REGLES.map((r) => [r.id, r.texte]));
module.exports = {
  G, T, txt,
  vni: (l) => txt(G.evaluerVni(l)),
  vente: (l, ctx) => txt(G.evaluerVente(l, Object.assign({ controle: true, contentieux: new Set() }, ctx || {}))),
  nr: (l) => txt(G.evaluerNR(l)),
  susp: (l) => txt(G.evaluerSuspension(l)),
  regles: (items) => items.map((x) => x.regle),
};
