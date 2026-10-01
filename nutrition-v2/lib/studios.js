'use strict';
// Codes d'accès par studio My Coach.
// Pour ajouter un studio ou changer un code : modifier cette liste puis pousser.
// Les codes ne quittent jamais le serveur : l'application ne reçoit que le nom
// du studio correspondant au code saisi.

const STUDIOS = [
  { id: 'wasquehal', nom: 'Wasquehal', code: 'mcwasquehal' },
  { id: 'vieux-lille', nom: 'Vieux-Lille', code: 'mcvieuxlille' },
  { id: 'marcq', nom: 'Marcq-en-Barœul', code: 'mcmarcq' },
  { id: 'boulogne', nom: 'Boulogne-Billancourt', code: 'mcboulogne' },
  { id: 'neuilly', nom: 'Neuilly-sur-Seine', code: 'mcneuilly' },
  { id: 'levallois', nom: 'Levallois-Perret', code: 'mclevallois' },
  { id: 'tours', nom: 'Tours', code: 'mctours' },
  { id: 'veigne', nom: 'Veigné', code: 'mcveigne' },
  { id: 'paris15', nom: 'Paris 15', code: 'mcparis15' },
  { id: 'caen', nom: 'Caen', code: 'mccaen' },
  { id: 'nice', nom: 'Nice', code: 'mcnice' },
  { id: 'valence', nom: 'Valence', code: 'mcvalence' },
];

// Insensible aux majuscules, aux espaces et aux accents (« MC Veigné » = « mcveigne »).
function normaliserCode(code) {
  return String(code || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '').slice(0, 60);
}

// Renvoie { id, nom } du studio, ou null si le code est inconnu.
function trouverStudio(code) {
  const n = normaliserCode(code);
  if (!n) return null;
  const s = STUDIOS.find((x) => x.code === n);
  return s ? { id: s.id, nom: s.nom } : null;
}

// Protection contre les essais répétés : au-delà de MAX_ECHECS codes faux en
// FENETRE_MS depuis une même adresse, les essais sont refusés jusqu'à la fin de
// la fenêtre. Mémoire vive uniquement (remise à zéro au redémarrage).
const MAX_ECHECS = 10;
const FENETRE_MS = 15 * 60 * 1000;
function createLimiteur({ max = MAX_ECHECS, fenetreMs = FENETRE_MS } = {}) {
  const echecs = new Map();
  const entree = (ip, now) => {
    const e = echecs.get(ip);
    if (!e || now - e.debut > fenetreMs) return null;
    return e;
  };
  const nettoyage = setInterval(() => {
    const now = Date.now();
    for (const [ip, e] of echecs) if (now - e.debut > fenetreMs) echecs.delete(ip);
  }, 60 * 1000);
  if (nettoyage.unref) nettoyage.unref();
  return {
    bloque(ip, now = Date.now()) { const e = entree(ip, now); return !!e && e.n >= max; },
    echec(ip, now = Date.now()) {
      const e = entree(ip, now);
      if (e) e.n++; else echecs.set(ip, { n: 1, debut: now });
    },
    reussite(ip) { echecs.delete(ip); },
  };
}

module.exports = { STUDIOS, normaliserCode, trouverStudio, createLimiteur, MAX_ECHECS, FENETRE_MS };
