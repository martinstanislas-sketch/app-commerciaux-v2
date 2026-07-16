'use strict';
// ============================================================================
//  CADEAUX — ce qu'est chaque cadeau. Les SEUILS, eux, restent dans punchSeuils.
//
//  punchSeuils.GIFTS dit « 2000 Punch -> massage ». Ce fichier dit ce qu'EST un
//  massage : son nom, s'il s'active tout seul ou s'il faut passer au studio. Le
//  seuil n'est jamais redéclaré ici — sinon deux vérités et un jour deux valeurs.
//
//  ⚠️ Cumul pur : on ATTEINT un cadeau, on ne l'achète pas. Rien n'est débité,
//  donc rien ne se reperd. Le verrouillage se lit sur le TOTAL de Punch (comme
//  les vidéos et les ebooks) et jamais sur user_unlocks : cette table dit ce qui
//  a été CÉLÉBRÉ, pas ce qui est acquis — un compte migré n'a rien dedans.
//
//  Deux natures, deux traitements :
//   - digital  (thèmes)  : rien à remettre en main propre -> activation directe ;
//   - physique (le reste): se retire au studio -> un bon à code unique fait foi.
// ============================================================================

const crypto = require('crypto');
const punchSeuils = require('./punchSeuils');

const CADEAUX = {
  theme_dark: {
    label: 'Thème sombre', nature: 'digital', icon: '🌙', theme: 'dark',
    desc: 'Une nouvelle allure pour toute l\'app, et un badge visible du groupe.',
  },
  ami_semaine: {
    label: 'Une semaine offerte à un ami', nature: 'physique', icon: '🎟️',
    desc: 'Un proche s\'entraîne avec toi pendant une semaine, gratuitement.',
  },
  coaching_1to1: {
    label: 'Un coaching individuel', nature: 'physique', icon: '🏋️',
    desc: 'Une séance en tête à tête avec ton coach, rien que pour toi.',
  },
  theme_gold: {
    label: 'Thème doré', nature: 'digital', icon: '✨', theme: 'gold',
    desc: 'Le thème le plus rare de l\'app, et le badge doré en communauté.',
  },
  remise_abo: {
    label: 'Une remise sur ton abonnement', nature: 'physique', icon: '🏷️',
    desc: 'Ta régularité paie : ton coach applique la remise au studio.',
  },
  massage: {
    label: 'Un massage sportif', nature: 'physique', icon: '💆',
    desc: 'La récompense ultime : un vrai moment de récupération.',
  },
};

// Le catalogue = les seuils (punchSeuils) + le sens (ici), joints par id, triés
// par seuil croissant -> l'ordre d'affichage de la boutique est celui du parcours.
function catalogue() {
  return Object.keys(punchSeuils.GIFTS)
    .map(Number)
    .sort((a, b) => a - b)
    .map((seuil) => {
      const id = punchSeuils.GIFTS[seuil];
      return Object.assign({ id, seuil }, CADEAUX[id] || { label: id, nature: 'physique', icon: '🎁', desc: '' });
    });
}

function cadeau(id) { return CADEAUX[id] || null; }
function estPhysique(id) { const c = CADEAUX[id]; return !!c && c.nature === 'physique'; }
function seuilDe(id) {
  const s = Object.keys(punchSeuils.GIFTS).find((k) => punchSeuils.GIFTS[k] === id);
  return s === undefined ? null : Number(s);
}

// Le thème acquis se DÉDUIT du total de Punch : pas de colonne à tenir à jour, donc
// pas de dérive possible entre le compteur et le badge. Doré > sombre : le doré est
// plus haut (1350 > 450), il l'emporte toujours.
function themeTier(punch) {
  const n = Number(punch) || 0;
  if (n >= seuilDe('theme_gold')) return 'gold';
  if (n >= seuilDe('theme_dark')) return 'dark';
  return '';
}
// Ce thème est-il permis à ce total ? (le doré autorise aussi le sombre : un palier
// plus haut ne retire jamais ce qui était acquis en dessous)
function themeAutorise(punch, theme) {
  if (!theme) return true; // revenir au thème d'origine est toujours permis
  const tier = themeTier(punch);
  if (theme === 'dark') return tier === 'dark' || tier === 'gold';
  if (theme === 'gold') return tier === 'gold';
  return false;
}

// Code d'un bon : MC-XXXX-XXXX. Alphabet SANS 0/O/1/I/L — le code est lu à voix haute
// et retapé à la main par un coach au comptoir ; une confusion coûterait un cadeau.
// Tiré au sort cryptographiquement : un code devinable serait un cadeau volé.
// ⚠️ 31 ne divise pas 256 : un simple `octet % 31` tirerait les 8 premières lettres
// ~13 % plus souvent que les autres. On REJETTE donc les octets de la tranche
// incomplète (>= 248) au lieu de les replier — le tirage est alors uniforme, et
// c'est ce qui fait tenir les ~39 bits d'entropie annoncés.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 caractères
const LIMITE = Math.floor(256 / ALPHABET.length) * ALPHABET.length; // 248
function genererCode() {
  let c = '';
  while (c.length < 8) {
    for (const b of crypto.randomBytes(8)) {
      if (b >= LIMITE) continue; // tranche incomplète -> on retire, sinon biais
      c += ALPHABET[b % ALPHABET.length];
      if (c.length === 8) break;
    }
  }
  return 'MC-' + c.slice(0, 4) + '-' + c.slice(4, 8);
}
function codeValide(code) { return /^MC-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(String(code || '').trim().toUpperCase()); }

module.exports = {
  CADEAUX, catalogue, cadeau, estPhysique, seuilDe,
  themeTier, themeAutorise, genererCode, codeValide,
};
