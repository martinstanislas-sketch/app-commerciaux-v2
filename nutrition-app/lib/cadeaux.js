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

// ⚠️ Les deux cadeaux « digitaux » sont des BADGES, pas des thèmes d'application.
// Ils ont commencé leur vie en skins (toute l'app basculait en sombre ou en doré) :
// c'était trop intrusif — on ne change pas l'écran de quelqu'un dans son dos parce
// qu'il a passé un palier. Ils ne sont plus qu'un liseré autour de sa photo dans le
// fil : sa distinction se voit du GROUPE, ce qui est tout l'intérêt, et son app ne
// bouge pas. Les ids restent (`theme_*`) : ils sont la clé des seuils.
const CADEAUX = {
  bilan_proche: {
    label: 'Bilan forme offert à un proche', nature: 'physique', icon: '🎁',
    desc: 'Ton proche bénéficie d\'un rendez-vous coach : objectifs, évaluation et premières recommandations.',
  },
  badge_argent: {
    label: 'Badge Argent', nature: 'digital', icon: '🥈', tier: 'argent',
    desc: 'Un liseré argenté autour de ta photo : tout le groupe voit ta progression.',
  },
  chanson: {
    label: 'Choisis ta chanson préférée', nature: 'physique', icon: '🎵',
    desc: 'Ta chanson diffusée pendant ton prochain training au studio.',
  },
  ambassadeur: {
    label: 'Statut Ambassadeur My Coach', nature: 'digital', icon: '🎖️',
    desc: 'Un statut exclusif sur ton profil pour valoriser ton engagement dans la communauté.',
  },
  coaching_individuel: {
    label: 'Un coaching individuel', nature: 'physique', icon: '🏋️',
    desc: 'Une séance privée avec ton coach, consacrée à tes objectifs et ta technique.',
  },
  acces_prioritaire: {
    label: 'Accès prioritaire aux challenges (1 mois)', nature: 'digital', icon: '⚡',
    desc: 'Pendant 30 jours, réserve ta place aux prochains challenges avant tout le monde.',
  },
  badge_or: {
    label: 'Badge Or', nature: 'digital', icon: '🏅', tier: 'or',
    desc: 'Un liseré doré, plus visible et prestigieux, autour de ta photo.',
  },
  deux_semaines_proche: {
    label: 'Deux semaines offertes à un proche', nature: 'physique', icon: '🎟️',
    desc: 'La personne de ton choix découvre le studio gratuitement deux semaines (valeur 150 €).',
  },
  coaching_nutrition: {
    label: 'Coaching nutrition personnalisé en visio', nature: 'physique', icon: '🥗',
    desc: 'Un rendez-vous à distance pour analyser tes habitudes et adapter ta nutrition.',
  },
  mois_offert: {
    label: 'Un mois offert', nature: 'physique', icon: '🗓️',
    desc: 'Quatre semaines d\'accompagnement offertes (valeur 300 €).',
  },
  badge_platine: {
    label: 'Badge Platine', nature: 'digital', icon: '💎', tier: 'platine',
    desc: 'Le liseré le plus prestigieux, réservé à un engagement exceptionnel.',
  },
  remise_abo: {
    label: 'Une remise sur ton abonnement', nature: 'physique', icon: '🏷️',
    desc: 'Ta régularité paie : ton coach applique la remise au studio.',
  },
  shooting: {
    label: 'Shooting photo transformation', nature: 'physique', icon: '📸',
    desc: 'Une séance photo pour immortaliser ta transformation.',
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

// Le liseré se DÉDUIT du total de Punch : rien à stocker, rien à choisir, donc
// aucune dérive possible entre le compteur et ce que le groupe voit. Trois paliers,
// le plus haut atteint l'emporte : platine > or > argent. Les seuils sont LUS
// dans punchSeuils (seuilDe), jamais recopiés : ils suivent les étapes du parcours.
function themeTier(punch) {
  const n = Number(punch) || 0;
  if (n >= seuilDe('badge_platine')) return 'platine';
  if (n >= seuilDe('badge_or')) return 'or';
  if (n >= seuilDe('badge_argent')) return 'argent';
  return '';
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
  themeTier, genererCode, codeValide,
};
