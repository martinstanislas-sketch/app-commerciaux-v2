'use strict';
// ============================================================================
//  BOUTIQUE DÉPENSABLE — le Punch s'échange contre des cadeaux.
//
//  Contrairement aux vidéos/ebooks (débloqués GRATUITEMENT en atteignant un
//  seuil, jamais repris), les cadeaux s'ACHÈTENT : le solde dépensable baisse.
//    solde = Punch cumulé (gagné) − somme des cadeaux déjà achetés.
//  Le Punch cumulé, lui, n'est jamais débité : il continue de piloter la
//  progression (vidéos, ebooks) et l'affichage « Punch gagnés ».
//
//  Un cadeau ne s'achète qu'UNE fois (PK client+cadeau côté table).
//  `nature` : 'physique' -> un bon (code) à présenter au studio ;
//             'digital'  -> effet in-app (badge/liseré, statut, accès).
//  LA source de vérité du catalogue et des prix, nulle part ailleurs.
// ============================================================================

const CADEAUX_BOUTIQUE = [
  { id: 'bilan_proche',        prix: 300,  nature: 'physique', icon: '🎁', label: 'Bilan forme offert à un proche',
    desc: "Ton proche bénéficie d’un rendez-vous avec un coach : échange sur ses objectifs, évaluation de sa condition physique et premières recommandations personnalisées." },
  { id: 'badge_argent',        prix: 450,  nature: 'digital',  icon: '🥈', tier: 'argent', label: 'Badge Argent',
    desc: "Un liseré argenté premium apparaît autour de ta photo de profil pour valoriser ta progression." },
  { id: 'chanson',             prix: 600,  nature: 'physique', icon: '🎵', label: 'Choisis ta chanson préférée',
    desc: "Choisis une chanson qui sera diffusée pendant ton prochain training au studio." },
  { id: 'ambassadeur',         prix: 800,  nature: 'digital',  icon: '🎖️', tier: 'ambassadeur', label: 'Statut Ambassadeur My Coach',
    desc: "Un statut exclusif apparaît sur ton profil pour valoriser ton engagement dans la communauté My Coach." },
  { id: 'coaching_individuel', prix: 1000, nature: 'physique', icon: '🏋️', label: 'Coaching individuel',
    desc: "Une séance privée avec ton coach, entièrement consacrée à tes objectifs, ta technique et ta progression." },
  { id: 'acces_prioritaire',   prix: 1200, nature: 'digital',  icon: '⚡', label: 'Accès prioritaire aux challenges (1 mois)',
    desc: "Pendant 30 jours, réserve ta place aux prochains challenges avant leur ouverture aux autres adhérents." },
  { id: 'badge_or',            prix: 1350, nature: 'digital',  icon: '🏅', tier: 'or', label: 'Badge Or',
    desc: "Un liseré doré, plus visible et prestigieux, apparaît autour de ta photo de profil." },
  { id: 'deux_semaines_proche',prix: 1500, nature: 'physique', icon: '🎟️', label: 'Deux semaines offertes à un proche',
    desc: "La personne de ton choix découvre le studio gratuitement pendant deux semaines (valeur 150 €)." },
  { id: 'coaching_nutrition',  prix: 1800, nature: 'physique', icon: '🥗', label: 'Coaching nutrition personnalisé en visio',
    desc: "Un rendez-vous individuel à distance pour analyser tes habitudes et recevoir des conseils nutritionnels adaptés." },
  { id: 'mois_offert',         prix: 2000, nature: 'physique', icon: '🗓️', label: 'Un mois offert',
    desc: "Quatre semaines d’accompagnement offertes (valeur 300 €)." },
  { id: 'badge_platine',       prix: 2500, nature: 'digital',  icon: '💎', tier: 'platine', label: 'Badge Platine',
    desc: "Le liseré le plus prestigieux de l’application, réservé aux membres au niveau d’engagement exceptionnel." },
  { id: 'remise_abo',          prix: 3000, nature: 'physique', icon: '🏷️', label: 'Remise sur ton abonnement',
    desc: "Une réduction appliquée à ta prochaine mensualité (montant à définir avec le studio)." },
  { id: 'shooting',            prix: 3500, nature: 'physique', icon: '📸', label: 'Shooting photo transformation',
    desc: "Une séance photo pour immortaliser ta progression et mettre en valeur ta transformation." },
  { id: 'massage',             prix: 4000, nature: 'physique', icon: '💆', label: 'Massage sportif',
    desc: "Un massage dédié à la récupération musculaire, au relâchement des tensions et au bien-être." },
];

// Catalogue trié par prix croissant (l'ordre d'affichage de la boutique).
function catalogue() { return CADEAUX_BOUTIQUE.slice().sort((a, b) => a.prix - b.prix); }
function cadeau(id) { return CADEAUX_BOUTIQUE.find((c) => c.id === id) || null; }
function prixDe(id) { const c = cadeau(id); return c ? c.prix : null; }
function estPhysique(id) { const c = cadeau(id); return !!c && c.nature === 'physique'; }
// Le meilleur liseré possédé (le plus cher des badges achetés) -> l'app le montre.
const ORDRE_TIERS = { argent: 1, or: 2, platine: 3 };
function meilleurTier(idsAchetes) {
  let best = '';
  (idsAchetes || []).forEach((id) => {
    const c = cadeau(id);
    if (c && c.tier && ORDRE_TIERS[c.tier] && (!best || ORDRE_TIERS[c.tier] > ORDRE_TIERS[best])) best = c.tier;
  });
  return best;
}

module.exports = { CADEAUX_BOUTIQUE, catalogue, cadeau, prixDe, estPhysique, meilleurTier, ORDRE_TIERS };
