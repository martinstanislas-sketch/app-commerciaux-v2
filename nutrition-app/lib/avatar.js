'use strict';
// ============================================================================
//  AVATAR — config -> SVG. Source de vérité UNIQUE du rendu.
//
//  On ne stocke JAMAIS une image : on stocke une config
//  { visage, peau, coiffure, couleur_cheveux, yeux, sourcils, bouche,
//    pilosite, tenue, accessoires[] }
//  et l'avatar se reconstruit à partir d'elle. Léger, modifiable, versionnable.
//
//  Ce fichier est chargé DES DEUX CÔTÉS (UMD) :
//    - serveur : rend le SVG servi à /nutrition/api/community/avatar/:key,
//      ce qui laisse intacts les 4 endroits qui affichent déjà un <img> ;
//    - navigateur : même rendu, en direct dans l'éditeur (aperçu immédiat).
//  Un seul code de rendu -> l'aperçu ne peut pas diverger de ce que voient
//  les autres membres.
//
//  DA : géométrique et sobre, cohérent avec l'identité premium. Les pièces
//  argent / or / platine se distinguent par leur MATIÈRE (dégradé + éclat),
//  pas seulement par leur forme — c'est ce qui valorise la progression.
// ============================================================================

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MCAvatar = api;
}(typeof self !== 'undefined' ? self : this, function () {

  // ── PALETTES ─────────────────────────────────────────────────────────────
  const PEAUX = [
    { id: 'p1', nom: 'Porcelaine', c: '#F7DECB', ombre: '#E8C4A8' },
    { id: 'p2', nom: 'Clair', c: '#F0C9A6', ombre: '#DDAE84' },
    { id: 'p3', nom: 'Doré', c: '#DFA878', ombre: '#C68B5C' },
    { id: 'p4', nom: 'Hâlé', c: '#C08552', ombre: '#A26B3D' },
    { id: 'p5', nom: 'Ambré', c: '#8D5524', ombre: '#6F411B' },
    { id: 'p6', nom: 'Ébène', c: '#5C3317', ombre: '#452510' },
  ];
  const CHEVEUX_COULEURS = [
    { id: 'c1', nom: 'Noir', c: '#1E1A17' },
    { id: 'c2', nom: 'Brun', c: '#4A2F1B' },
    { id: 'c3', nom: 'Châtain', c: '#7A5230' },
    { id: 'c4', nom: 'Blond', c: '#C9A227' },
    { id: 'c5', nom: 'Roux', c: '#A6421D' },
    { id: 'c6', nom: 'Gris', c: '#8B8B8B' },
    { id: 'c7', nom: 'Blanc', c: '#E3E3E3' },
    { id: 'c8', nom: 'Or', c: '#B6892E' },
  ];
  const VISAGES = [
    { id: 'ovale', nom: 'Ovale' },
    { id: 'rond', nom: 'Rond' },
    { id: 'carre', nom: 'Carré' },
  ];
  const COIFFURES = [
    { id: 'aucune', nom: 'Rasé' },
    { id: 'courte', nom: 'Courte' },
    { id: 'ondulee', nom: 'Ondulée' },
    { id: 'bouclee', nom: 'Bouclée' },
    { id: 'longue', nom: 'Longue' },
    { id: 'chignon', nom: 'Chignon' },
  ];
  const YEUX = [
    { id: 'ronds', nom: 'Ronds' },
    { id: 'amandes', nom: 'Amande' },
    { id: 'rieurs', nom: 'Rieurs' },
    { id: 'determines', nom: 'Déterminés' },
  ];
  const SOURCILS = [
    { id: 'droits', nom: 'Droits' },
    { id: 'arques', nom: 'Arqués' },
    { id: 'epais', nom: 'Épais' },
  ];
  const BOUCHES = [
    { id: 'sourire', nom: 'Sourire' },
    { id: 'neutre', nom: 'Neutre' },
    { id: 'franc', nom: 'Franc' },
    { id: 'moue', nom: 'Moue' },
  ];
  const PILOSITES = [
    { id: 'aucune', nom: 'Aucune' },
    { id: 'moustache', nom: 'Moustache' },
    { id: 'barbe_courte', nom: 'Barbe courte' },
    { id: 'barbe_pleine', nom: 'Barbe pleine' },
  ];
  const TENUES = [
    { id: 'tshirt', nom: 'T-shirt', c: '#2563EB' },
    { id: 'debardeur', nom: 'Débardeur', c: '#334155' },
    { id: 'hoodie', nom: 'Sweat', c: '#1E293B' },
    { id: 'polo', nom: 'Polo', c: '#0F766E' },
  ];

  // ── CATALOGUE D'ACCESSOIRES ──────────────────────────────────────────────
  // La condition de déblocage vit DANS LA DONNÉE, jamais en dur dans le code.
  // type: 'punch' (Punch cumulé) | 'badge' (cadeau déjà débloqué).
  // Aucun accessoire n'est achetable : uniquement débloquable par la progression.
  // ⚠️ Les seuils de Punch suivent LE PARCOURS : chacun vaut le cumul d'une
  // étape précise, pour qu'une récompense — et une seule — tombe à chaque
  // action. Ils sont dérivés (jamais recopiés) par lib/punchSeuils.js : modifier
  // une valeur ici déplace la récompense sur le Chemin.
  const ACCESSOIRES = [
    { id: 'bandeau', nom: 'Bandeau de sport', categorie: 'tete', tier: 'base', condition: { type: 'punch', valeur: 80 } },
    { id: 'casquette', nom: 'Casquette', categorie: 'tete', tier: 'base', condition: { type: 'punch', valeur: 135 } },
    { id: 'barrette', nom: 'Barrette', categorie: 'tete', tier: 'base', condition: { type: 'punch', valeur: 280 } },
    { id: 'lunettes', nom: 'Lunettes', categorie: 'visage', tier: 'base', condition: { type: 'punch', valeur: 385 } },
    { id: 'bonnet', nom: 'Bonnet', categorie: 'tete', tier: 'base', condition: { type: 'punch', valeur: 555 } },
    { id: 'brassard', nom: 'Brassard', categorie: 'tenue', tier: 'base', condition: { type: 'punch', valeur: 880 } },
    { id: 'medaille_argent', nom: 'Médaille d’argent', categorie: 'tenue', tier: 'argent', condition: { type: 'badge', valeur: 'badge_argent' } },
    { id: 'couronne_argent', nom: 'Couronne d’argent', categorie: 'tete', tier: 'argent', condition: { type: 'punch', valeur: 985 } },
    { id: 'lunettes_or', nom: 'Lunettes dorées', categorie: 'visage', tier: 'or', condition: { type: 'punch', valeur: 1270 } },
    { id: 'medaille_or', nom: 'Médaille d’or', categorie: 'tenue', tier: 'or', condition: { type: 'badge', valeur: 'badge_or' } },
    { id: 'couronne_or', nom: 'Couronne d’or', categorie: 'tete', tier: 'or', condition: { type: 'punch', valeur: 1795 } },
    { id: 'medaille_platine', nom: 'Médaille de platine', categorie: 'tenue', tier: 'platinium', condition: { type: 'badge', valeur: 'badge_platine' } },
    { id: 'aura_platine', nom: 'Aura de platine', categorie: 'aura', tier: 'platinium', condition: { type: 'punch', valeur: 2800 } },
  ];
  // Une seule pièce par emplacement : une casquette ET un bonnet n'ont pas de sens.
  const EMPLACEMENT_UNIQUE = ['tete', 'visage', 'aura'];

  const CONFIG_DEFAUT = {
    visage: 'ovale', peau: 'p2', coiffure: 'courte', couleur_cheveux: 'c2',
    yeux: 'ronds', sourcils: 'droits', bouche: 'sourire', pilosite: 'aucune',
    tenue: 'tshirt', accessoires: [],
  };

  const listeIds = (l) => l.map((x) => x.id);
  const trouve = (l, id, defaut) => l.find((x) => x.id === id) || l.find((x) => x.id === defaut) || l[0];

  // Nettoie une config venue du client : toute valeur inconnue retombe sur le
  // défaut. Le serveur ne fait JAMAIS confiance à ce qu'il reçoit.
  function normaliserConfig(brut) {
    const c = (brut && typeof brut === 'object') ? brut : {};
    const dansListe = (l, v, d) => (listeIds(l).includes(v) ? v : d);
    const idsAcc = ACCESSOIRES.map((a) => a.id);
    const accessoires = Array.isArray(c.accessoires)
      ? [...new Set(c.accessoires.filter((a) => idsAcc.includes(a)))]
      : [];
    // Un seul accessoire par emplacement unique : on garde le premier vu.
    const vus = new Set();
    const gardes = accessoires.filter((id) => {
      const a = ACCESSOIRES.find((x) => x.id === id);
      if (!a || !EMPLACEMENT_UNIQUE.includes(a.categorie)) return true;
      if (vus.has(a.categorie)) return false;
      vus.add(a.categorie); return true;
    });
    return {
      visage: dansListe(VISAGES, c.visage, CONFIG_DEFAUT.visage),
      peau: dansListe(PEAUX, c.peau, CONFIG_DEFAUT.peau),
      coiffure: dansListe(COIFFURES, c.coiffure, CONFIG_DEFAUT.coiffure),
      couleur_cheveux: dansListe(CHEVEUX_COULEURS, c.couleur_cheveux, CONFIG_DEFAUT.couleur_cheveux),
      yeux: dansListe(YEUX, c.yeux, CONFIG_DEFAUT.yeux),
      sourcils: dansListe(SOURCILS, c.sourcils, CONFIG_DEFAUT.sourcils),
      bouche: dansListe(BOUCHES, c.bouche, CONFIG_DEFAUT.bouche),
      pilosite: dansListe(PILOSITES, c.pilosite, CONFIG_DEFAUT.pilosite),
      tenue: dansListe(TENUES, c.tenue, CONFIG_DEFAUT.tenue),
      accessoires: gardes,
    };
  }

  // Avatar de départ, tiré au sort mais DÉTERMINISTE (même email -> même
  // avatar) : à la migration, chacun retrouve le sien sur tous ses appareils.
  function configParDefaut(graine) {
    let h = 0;
    const s = String(graine || '');
    for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
    const pick = (l, dec) => l[Math.abs((h >> dec)) % l.length].id;
    return normaliserConfig({
      visage: pick(VISAGES, 0), peau: pick(PEAUX, 3), coiffure: pick(COIFFURES, 6),
      couleur_cheveux: pick(CHEVEUX_COULEURS, 9), yeux: pick(YEUX, 12),
      sourcils: pick(SOURCILS, 15), bouche: pick(BOUCHES, 18),
      pilosite: 'aucune', tenue: pick(TENUES, 21), accessoires: [],
    });
  }

  // ── DÉBLOCAGES ───────────────────────────────────────────────────────────
  // `punch` = Punch cumulé ; `badges` = ids de cadeaux déjà obtenus.
  // Renvoie TOUS les accessoires, verrouillés compris : les voir est le moteur
  // de motivation, on n'en masque jamais aucun.
  function etatAccessoires({ punch, badges, equipes }) {
    const p = Number(punch) || 0;
    const b = new Set(Array.isArray(badges) ? badges : []);
    const eq = new Set(Array.isArray(equipes) ? equipes : []);
    return ACCESSOIRES.map((a) => {
      const debloque = a.condition.type === 'badge'
        ? b.has(a.condition.valeur)
        : p >= a.condition.valeur;
      return {
        ...a,
        debloque,
        equipe: debloque && eq.has(a.id),
        // Jamais de nombre nu : l'unité fait partie du libellé. Et quand la pièce
        // est verrouillée, le texte annonce la CONDITION — jamais « Débloqué »,
        // qui se lisait comme un état acquis sur une carte grisée.
        conditionTexte: debloque ? 'Débloqué'
          : (a.condition.type === 'badge'
            ? 'Avec le ' + String(a.condition.valeur).replace(/_/g, ' ')
            : 'Encore ' + Math.max(0, a.condition.valeur - p) + ' PUNCH'),
        restant: a.condition.type === 'punch' ? Math.max(0, a.condition.valeur - p) : 0,
      };
    });
  }
  function accessoiresDebloques(punch, badges) {
    return etatAccessoires({ punch, badges, equipes: [] }).filter((a) => a.debloque).map((a) => a.id);
  }

  // ── RENDU SVG ────────────────────────────────────────────────────────────
  const OR = { clair: '#F0D488', moyen: '#C79A3C', fonce: '#8A6A24' };
  const ARGENT = { clair: '#E8ECF2', moyen: '#AEB4BE', fonce: '#7C8391' };
  const PLATINE = { clair: '#DFF7FB', moyen: '#6FD3E0', fonce: '#3E97A6' };
  const MATIERE = { argent: ARGENT, or: OR, platinium: PLATINE };

  function cheveuxPath(coiffure, c) {
    switch (coiffure) {
      case 'aucune': return '';
      case 'courte': return `<path d="M26 42c0-13 9-21 22-21s22 8 22 21c0-6-6-9-22-9s-22 3-22 9z" fill="${c}"/>`;
      case 'ondulee': return `<path d="M25 44c-1-15 9-24 23-24s24 9 23 24c-2-7-5-10-8-8-3-6-9-6-15-3-6-3-12-2-15 4-3-1-6 1-8 7z" fill="${c}"/>`;
      case 'bouclee': return `<path d="M26 42c0-14 9-22 22-22s22 8 22 22c0-5-3-7-6-5-2-4-6-5-9-3-3-3-8-3-11 0-3-2-7-1-9 3-3-2-6 0-9 5z" fill="${c}"/>
        <circle cx="30" cy="38" r="5" fill="${c}"/><circle cx="66" cy="38" r="5" fill="${c}"/><circle cx="48" cy="24" r="6" fill="${c}"/>`;
      case 'longue': return `<path d="M24 46c0-16 10-25 24-25s24 9 24 25v22c0 3-2 5-5 5-4 0-5-3-5-7V44c0-5-6-8-14-8s-14 3-14 8v22c0 4-1 7-5 7-3 0-5-2-5-5z" fill="${c}"/>`;
      case 'chignon': return `<path d="M26 42c0-13 9-21 22-21s22 8 22 21c0-6-6-9-22-9s-22 3-22 9z" fill="${c}"/><circle cx="48" cy="16" r="8" fill="${c}"/>`;
      default: return '';
    }
  }

  function yeuxPath(yeux) {
    const oeil = (x) => {
      switch (yeux) {
        case 'amandes': return `<path d="M${x - 5} 52c2-3 8-3 10 0-2 3-8 3-10 0z" fill="#2A2A2A"/>`;
        case 'rieurs': return `<path d="M${x - 5} 53c2-4 8-4 10 0" stroke="#2A2A2A" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
        case 'determines': return `<rect x="${x - 5}" y="50" width="10" height="4" rx="2" fill="#2A2A2A"/>`;
        default: return `<circle cx="${x}" cy="52" r="3.2" fill="#2A2A2A"/>`;
      }
    };
    return oeil(39) + oeil(57);
  }

  function sourcilsPath(sourcils, c) {
    const s = (x, mir) => {
      const d = mir ? -1 : 1;
      switch (sourcils) {
        case 'arques': return `<path d="M${x - 6} 45c3-3 9-3 12 ${d > 0 ? 1 : 1}" stroke="${c}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
        case 'epais': return `<rect x="${x - 6}" y="43" width="12" height="3.4" rx="1.7" fill="${c}"/>`;
        default: return `<path d="M${x - 6} 45h12" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`;
      }
    };
    return s(39, false) + s(57, true);
  }

  function bouchePath(bouche) {
    switch (bouche) {
      case 'neutre': return '<path d="M42 66h12" stroke="#8B4A3F" stroke-width="2.2" stroke-linecap="round"/>';
      case 'franc': return '<path d="M41 64c3 5 11 5 14 0z" fill="#8B4A3F"/><path d="M41 64h14" stroke="#8B4A3F" stroke-width="1.6"/>';
      case 'moue': return '<path d="M43 67c2-3 8-3 10 0" stroke="#8B4A3F" stroke-width="2.2" fill="none" stroke-linecap="round"/>';
      default: return '<path d="M41 64c3 4 11 4 14 0" stroke="#8B4A3F" stroke-width="2.4" fill="none" stroke-linecap="round"/>';
    }
  }

  function pilositePath(pilosite, c) {
    switch (pilosite) {
      case 'moustache': return `<path d="M41 61c3-2 5-2 7 0 2-2 4-2 7 0-2 3-5 3-7 1-2 2-5 2-7-1z" fill="${c}"/>`;
      case 'barbe_courte': return `<path d="M32 58c0 12 7 19 16 19s16-7 16-19c0 7-7 10-16 10s-16-3-16-10z" fill="${c}" opacity=".85"/>`;
      case 'barbe_pleine': return `<path d="M31 52c0 18 8 27 17 27s17-9 17-27c0 9-2 13-6 14 0 4-5 6-11 6s-11-2-11-6c-4-1-6-5-6-14z" fill="${c}"/>`;
      default: return '';
    }
  }

  function visageGeom(visage) {
    switch (visage) {
      case 'rond': return { d: 'M48 26c14 0 21 10 21 24s-9 25-21 25-21-11-21-25 7-24 21-24z', rx: 21 };
      case 'carre': return { d: 'M29 34c0-6 8-8 19-8s19 2 19 8v26c0 9-8 15-19 15s-19-6-19-15z', rx: 19 };
      default: return { d: 'M48 25c12 0 20 9 20 23 0 16-9 27-20 27s-20-11-20-27c0-14 8-23 20-23z', rx: 20 };
    }
  }

  function tenuePath(tenue, c) {
    switch (tenue) {
      case 'debardeur': return `<path d="M28 96v-9c0-7 6-11 12-13 2 4 5 6 8 6s6-2 8-6c6 2 12 6 12 13v9z" fill="${c}"/>`;
      case 'hoodie': return `<path d="M24 96v-10c0-9 8-14 16-16 2 5 5 7 8 7s6-2 8-7c8 2 16 7 16 16v10z" fill="${c}"/><path d="M40 70c3 6 13 6 16 0" stroke="rgba(255,255,255,.25)" stroke-width="2" fill="none"/>`;
      case 'polo': return `<path d="M26 96v-10c0-8 7-12 14-14 2 5 5 7 8 7s6-2 8-7c7 2 14 6 14 14v10z" fill="${c}"/><path d="M44 72l4 6 4-6" stroke="rgba(255,255,255,.4)" stroke-width="1.8" fill="none"/>`;
      default: return `<path d="M26 96v-10c0-8 7-12 14-14 2 5 5 7 8 7s6-2 8-7c7 2 14 6 14 14v10z" fill="${c}"/>`;
    }
  }

  // Accessoires. `uid` préfixe les ids de <defs> : plusieurs avatars peuvent
  // coexister dans une même page (le fil communauté) sans collision d'id.
  function accessoirePath(id, uid) {
    const grad = (nom, m) => `<linearGradient id="${uid}-${nom}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${m.clair}"/><stop offset=".55" stop-color="${m.moyen}"/><stop offset="1" stop-color="${m.fonce}"/></linearGradient>`;
    switch (id) {
      case 'bandeau': return { defs: '', body: '<rect x="26" y="38" width="44" height="7" rx="3.5" fill="#2563EB"/><rect x="26" y="40" width="44" height="2" fill="rgba(255,255,255,.35)"/>' };
      case 'casquette': return { defs: '', body: '<path d="M26 40c0-12 9-19 22-19s22 7 22 19z" fill="#1E293B"/><path d="M68 40c8 0 12 2 13 5H62z" fill="#0F172A"/>' };
      case 'barrette': return { defs: grad('bar', OR), body: `<rect x="58" y="32" width="14" height="4" rx="2" fill="url(#${uid}-bar)"/>` };
      case 'bonnet': return { defs: '', body: '<path d="M26 42c0-13 9-22 22-22s22 9 22 22z" fill="#334155"/><rect x="24" y="40" width="48" height="8" rx="4" fill="#475569"/><circle cx="48" cy="17" r="4" fill="#94A3B8"/>' };
      case 'lunettes': return { defs: '', body: '<circle cx="39" cy="52" r="8" fill="none" stroke="#2A2A2A" stroke-width="2"/><circle cx="57" cy="52" r="8" fill="none" stroke="#2A2A2A" stroke-width="2"/><path d="M47 52h2" stroke="#2A2A2A" stroke-width="2"/>' };
      case 'lunettes_or': return { defs: grad('lo', OR), body: `<circle cx="39" cy="52" r="8" fill="rgba(240,212,136,.14)" stroke="url(#${uid}-lo)" stroke-width="2.4"/><circle cx="57" cy="52" r="8" fill="rgba(240,212,136,.14)" stroke="url(#${uid}-lo)" stroke-width="2.4"/><path d="M47 52h2" stroke="url(#${uid}-lo)" stroke-width="2.4"/>` };
      case 'brassard': return { defs: '', body: '<rect x="24" y="84" width="10" height="6" rx="3" fill="#2563EB"/>' };
      case 'couronne_argent':
      case 'couronne_or': {
        const m = id === 'couronne_or' ? OR : ARGENT;
        return { defs: grad('cr', m), body: `<path d="M32 30l5 8 6-10 5 10 6-10 5 10 5-8v8H32z" fill="url(#${uid}-cr)"/><rect x="32" y="36" width="32" height="4" rx="2" fill="${m.fonce}"/>` };
      }
      case 'medaille_argent':
      case 'medaille_or':
      case 'medaille_platine': {
        const m = MATIERE[id === 'medaille_or' ? 'or' : id === 'medaille_platine' ? 'platinium' : 'argent'];
        return {
          defs: grad('md', m),
          body: `<path d="M44 76l4 8 4-8" stroke="${m.fonce}" stroke-width="2.5" fill="none"/><circle cx="48" cy="88" r="7" fill="url(#${uid}-md)" stroke="${m.fonce}" stroke-width="1.2"/><circle cx="46" cy="86" r="2" fill="rgba(255,255,255,.6)"/>`,
        };
      }
      case 'aura_platine': return {
        defs: `<radialGradient id="${uid}-au"><stop offset=".6" stop-color="rgba(111,211,224,0)"/><stop offset="1" stop-color="rgba(111,211,224,.55)"/></radialGradient>`,
        body: `<circle cx="48" cy="48" r="47" fill="url(#${uid}-au)"/>`,
      };
      default: return { defs: '', body: '' };
    }
  }

  // ── CORPS ENTIER ─────────────────────────────────────────────────────────
  // Le buste s'arrête à y=96, pile en bas du viewBox : le personnage est fait
  // pour une VIGNETTE RONDE (profil, fil du groupe, éditeur). Sur le Chemin, il
  // se tient debout sur le sentier — il lui faut des jambes.
  // ⚠️ On n'a rien déplacé de ce qui existe : le repère est identique (tête
  // 25→75, torse jusqu'à 96), seul le viewBox s'allonge vers le BAS et les
  // membres s'y ajoutent. Tous les accessoires, posés en coordonnées absolues
  // (médaille en 88, brassard en 84…), tombent donc toujours juste.
  // Les jambes et les bras se dessinent AVANT le torse : c'est le vêtement qui
  // recouvre proprement les emmanchures et la taille, comme sur le buste.
  const CORPS_H = 176;          // hauteur du viewBox en pied
  const JAMBE = '#2B3444';      // collant sombre : lisible sur le sable du sentier
  const JAMBE_O = '#222A38';    // sa face à l'ombre
  // La lumière vient du HAUT-GAUCHE, partout et sans exception : c'est cette
  // règle unique qui donne du volume. Chaque membre a donc sa face claire et sa
  // face à l'ombre, du même côté sur toute la silhouette.
  const OMBRE = 'rgba(15,20,30,.16)';
  // DEUX NUANCES par vêtement, jamais une teinte en dur : un voile sombre sur la
  // face droite, une arête claire sur l'épaule gauche. Posées en OVERLAY, elles
  // marchent sur les quatre tenues sans avoir à calculer six couleurs.
  const VET_OMBRE = 'rgba(8,14,26,.17)';
  const VET_LUM = 'rgba(255,255,255,.14)';

  // ── Silhouette en pied : les proportions ──────────────────────────────────
  // La tête rapetisse de 12 % (cf. TETE_ECHELLE) et le torse s'allonge d'autant
  // — un personnage à grosse tête lit « mascotte », pas « athlète ».
  // ⚠️ Le buste des vignettes rondes garde EXACTEMENT sa coupe d'origine : tout
  // ce qui suit ne sert qu'au mode `corps: 'entier'`.
  const TETE_ECHELLE = 0.88;
  // Le mouvement, et non la pose de face au garde-à-vous : le corps penche
  // légèrement dans le sens de la marche, la tête se redresse à contresens.
  // Deux degrés suffisent — au-delà, il tombe.
  const INCLINAISON = -2;
  const TETE_REDRESSE = 3;

  // ── DEUX MORPHOLOGIES, UN SEUL CODE DE RENDU ─────────────────────────────
  // Seules les MESURES changent d'une silhouette à l'autre : même assemblage,
  // mêmes nuances, mêmes accessoires. Ajouter une troisième morphologie un jour
  // = ajouter une entrée ici, rien d'autre.
  //
  //  homme — épaules larges (52 à y=90), taille resserrée (34 à y=112) : le V.
  //  femme — carrure adoucie (44), taille MARQUÉE (30 à y=108) et hanches
  //          reprises (36 à y=118) : le sablier. Sportive et adulte, pas
  //          filiforme — l'écart taille/hanches fait le travail, sans caricature.
  //
  // Bras et jambes sont des TRAITS (stroke) et non des polygones : l'épaisseur
  // est constante du biceps au poignet, le coude s'arrondit tout seul, et un
  // coude se déplace en changeant UN point.
  // Membres décalés (un devant, un derrière) : une silhouette rigoureusement
  // symétrique est à l'arrêt, quoi qu'on fasse d'autre.
  const MORPHO = {
    homme: {
      torse: 'M39 72C29 74 22 80 22 90c0 9 7 14 9 22l1 8h32l1-8c2-8 9-13 9-22 0-10-7-16-17-18z',
      bassin: 'M32 116h32v10c0 5-4 8-9 8H41c-5 0-9-3-9-8z',
      bassinOmbre: 'M48 116h16v10c0 5-4 8-9 8h-7z',
      brasG: 'M28 88 L19 105 L27.5 115', brasD: 'M68 88 L77 103 L69.5 118',
      poingG: [27.5, 115], poingD: [69.5, 118], brasW: 9.6, poingR: 5.4,
      mancheG: 'M28 88 L24.5 98', mancheD: 'M68 88 L71.5 97', mancheW: 11.4,
      jambeAv: 'M40 128 L38 144 L36 156', jambeAr: 'M57 128 L59 146 L60 158', jambeW: 14,
      piedAv: 0, piedAr: 0, logoX: 33.5, voileX: 52,
      epaule: 'M39 70c-11 3-18 10-18 21l6 1c1-9 6-15 14-17z',
    },
    femme: {
      torse: 'M39 72C31 74 26 80 26 90c0 8 6 12 7 18l-3 10h36l-3-10c1-6 7-10 7-18 0-10-5-16-13-18z',
      bassin: 'M30 114h36v11c0 5-4 8-9 8H39c-5 0-9-3-9-8z',
      bassinOmbre: 'M48 114h18v11c0 5-4 8-9 8h-9z',
      brasG: 'M31 88 L23 105 L30.5 115', brasD: 'M65 88 L73 103 L66 117',
      poingG: [30.5, 115], poingD: [66, 117], brasW: 8.6, poingR: 4.9,
      mancheG: 'M31 88 L27.5 97', mancheD: 'M65 88 L68.5 96', mancheW: 10.4,
      jambeAv: 'M41 129 L39 144 L37 156', jambeAr: 'M56 129 L58 146 L59 158', jambeW: 12.6,
      piedAv: 1, piedAr: -1, logoX: 34.5, voileX: 50,
      epaule: 'M39 70c-9 3-15 10-15 21l6 1c1-9 5-15 12-17z',
    },
  };

  // Le membre et son volume : la forme pleine, puis la MÊME forme décalée d'un
  // cheveu vers le haut-gauche et repeinte en clair. Ce qui dépasse en bas à
  // droite devient la face à l'ombre — un seul tracé donne les deux faces.
  function membre(d, w, clair, sombre) {
    const trait = (col, dx, dy, lw) => `<path d="${d}"${dx || dy ? ` transform="translate(${dx} ${dy})"` : ''} fill="none" stroke="${col}" stroke-width="${lw}" stroke-linecap="round" stroke-linejoin="round"/>`;
    return trait(sombre, 0, 0, w) + trait(clair, -1.1, -0.7, w - 1.4);
  }

  // ── SILHOUETTE D'ORIGINE ─────────────────────────────────────────────────
  // ⚠️ TEMPORAIRE. La refonte athlétique (épaules larges, taille resserrée,
  // torse long) ne vaut QUE pour un corps d'homme : appliquée à une cliente,
  // elle donne un homme en perruque. Tant que la variante féminine n'est pas
  // dessinée, `sexe: 'femme'` et « autre » gardent EXACTEMENT le rendu qu'ils
  // avaient avant la refonte — reproduit ici tel quel, sans une virgule de
  // changement. Ces trois fonctions disparaîtront le jour où la silhouette
  // féminine existera.
  function membresPathOrigine(peau, tenueC) {
    return [
      `<path d="M29 82c-5 3-7 7-7 11l-1 17c0 2 1 4 3 4s4-2 4-4l2-16z" fill="${peau.c}"/>`,
      `<circle cx="24.5" cy="116" r="4.2" fill="${peau.c}"/>`,
      `<path d="M67 82c5 3 7 7 7 11l2 15c0 2-1 4-3 4s-4-2-4-4l-2-14z" fill="${peau.c}"/>`,
      `<circle cx="72.5" cy="113" r="4.2" fill="${peau.c}"/>`,
      `<path d="M27 84c2 2 3 5 3 8l-2 16-2 1 2-17c0-3-1-6-2-8z" fill="${OMBRE}"/>`,
      `<path d="M72 86c1 2 2 5 2 7l2 15-2 1-2-16c0-2-1-5-2-7z" fill="${OMBRE}"/>`,
      `<path d="M34 94h28v17c0 5-3 8-8 8H42c-5 0-8-3-8-8z" fill="${JAMBE}"/>`,
      `<path d="M48 94h14v17c0 5-3 8-8 8h-6z" fill="${JAMBE_O}"/>`,
      `<path d="M37 113h10l-1 22-1 20c0 3-2 4-4.5 4S36 158 36 155l1-20z" fill="${JAMBE}"/>`,
      `<path d="M51 113h10l1 21v24c0 3-2 4-4.5 4S53 161 53 158l-1-24z" fill="${JAMBE_O}"/>`,
      `<path d="M44 113h3l-1 22-1 20h-3l1-20z" fill="${OMBRE}"/>`,
      `<path d="M34 152h11c1.5 0 2.5 1 2.5 2.5v5c0 1.5-1 2.5-2.5 2.5H33c-1.5 0-2.5-1-2.5-2.5v-2c0-2 1-3.5 2.5-4.5z" fill="${tenueC}"/>`,
      `<path d="M30.5 159h17v2c0 1.5-1 2.5-2.5 2.5H33c-1.5 0-2.5-1-2.5-2.5z" fill="#F2F0EA"/>`,
      `<path d="M50 156h11c1.5 0 2.5 1 2.5 2.5v5c0 1.5-1 2.5-2.5 2.5H49c-1.5 0-2.5-1-2.5-2.5v-2c0-2 1-3.5 2.5-4.5z" fill="${tenueC}"/>`,
      `<path d="M46.5 163h17v2c0 1.5-1 2.5-2.5 2.5H49c-1.5 0-2.5-1-2.5-2.5z" fill="#F2F0EA"/>`,
    ].join('');
  }
  function manchesPathOrigine(tenue, c) {
    if (tenue === 'debardeur') return '';
    if (tenue === 'hoodie') {
      return `<path d="M29 82c-5 3-7 7-7 11l-1 15h9l2-15z" fill="${c}"/>`
        + `<path d="M67 82c5 3 7 7 7 11l2 13h-9l-2-13z" fill="${c}"/>`;
    }
    return `<path d="M29 82c-4 2-6 5-6.5 9l-.5 5h9l1.5-9z" fill="${c}"/>`
      + `<path d="M67 82c4 2 6 5 6.5 9l.5 4h-9l-1.5-8z" fill="${c}"/>`;
  }

  function membresPath(peau, tenueC, m) {
    const poing = ([x, y], r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${peau.c}"/>`
      + `<path d="M${x} ${y}a${r} ${r} 0 0 0 ${r} ${r} ${r} ${r} 0 0 1-${r}-${r}z" fill="${peau.ombre}"/>`;
    // Une basket = tige colorée + arête de volume + semelle claire débordante.
    // `dx` la décale avec sa jambe : les pieds suivent les jambes, toujours.
    const basket = (x, y, dx, volume) => {
      const g = (v) => (v + dx).toFixed(1);
      return `<path d="M${g(x)} ${y}h9c7 0 12 3 13 7 .4 2-.8 3.4-2.8 3.4H${g(x)}c-2.2 0-3.6-1.4-3.6-3.4v-3.6c0-2 1.4-3.4 3.6-3.4z" fill="${tenueC}"/>`
        + `<path d="M${g(x)} ${y}h5v10.4h-5c-2.2 0-3.6-1.4-3.6-3.4v-3.6c0-2 1.4-3.4 3.6-3.4z" fill="${volume}"/>`
        + `<path d="M${g(x - 3.6)} ${y + 7.4}h25.8c.3 1.6-.9 3-2.9 3H${g(x)}c-2.2 0-3.6-1.4-3.6-3z" fill="#F2F0EA"/>`;
    };
    return [
      // ── Bras fléchis, poings fermés au bout (le Punch, c'est 👊).
      membre(m.brasG, m.brasW, peau.c, peau.ombre),
      membre(m.brasD, m.brasW, peau.c, peau.ombre),
      poing(m.poingG, m.poingR),
      poing(m.poingD, m.poingR),

      // ── Bassin puis jambes, épaissies. C'est ce qui porte la silhouette :
      // des jambes fines sous le haut du corps donnent une toupie.
      `<path d="${m.bassin}" fill="${JAMBE}"/>`,
      `<path d="${m.bassinOmbre}" fill="${JAMBE_O}"/>`,
      membre(m.jambeAv, m.jambeW, JAMBE, JAMBE_O),
      membre(m.jambeAr, m.jambeW, JAMBE_O, '#1B2230'),

      // ── Baskets. Plus hautes et plus longues que des chaussons.
      basket(28, 155, m.piedAv, VET_LUM),
      basket(51, 158, m.piedAr, VET_OMBRE),
    ].join('');
  }

  // Le TORSE du mode en pied : sa propre silhouette, plus longue et taillée en V.
  // ⚠️ Il ne remplace pas tenuePath, il s'y substitue POUR CE MODE : tenuePath
  // sert aussi au buste des vignettes rondes, qu'on ne touche pas.
  // Les deux nuances sont posées dans un clip-path calé sur la silhouette : elles
  // ne peuvent pas déborder, quelle que soit la tenue.
  function torseEnPiedPath(tenue, c, uid, m) {
    const det = {
      hoodie: `<path d="M40 73c3 6 13 6 16 0" stroke="rgba(255,255,255,.22)" stroke-width="2" fill="none"/><path d="M46 76v9M50 76v9" stroke="rgba(255,255,255,.3)" stroke-width="1.4" stroke-linecap="round"/>`,
      polo: `<path d="M44 73l4 7 4-7" stroke="rgba(255,255,255,.4)" stroke-width="1.8" fill="none"/>`,
      debardeur: `<path d="M35 84c3-6 6-9 6-12M61 84c-3-6-6-9-6-12" stroke="rgba(0,0,0,.13)" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
    }[tenue] || '';
    return `<clipPath id="${uid}-t"><path d="${m.torse}"/></clipPath>`
      + `<path d="${m.torse}" fill="${c}"/>`
      + `<g clip-path="url(#${uid}-t)">`
      // Nuance 1 : toute la face droite dans l'ombre. Nuance 2 : l'arête de
      // l'épaule gauche, côté lumière.
      + `<path d="M${m.voileX} 66h32v60H${m.voileX}z" fill="${VET_OMBRE}"/>`
      + `<path d="${m.epaule}" fill="${VET_LUM}"/>`
      + `</g>` + det
      // Le logo My Coach : une tuile claire posée sur le pectoral gauche, assez
      // petite pour rester un détail — c'est un maillot d'équipe, pas un panneau.
      + `<rect x="${m.logoX}" y="93" width="9.2" height="9.2" rx="2.8" fill="#F7F8FA" opacity=".95"/>`
      + `<text x="${m.logoX + 4.6}" y="100" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="5.6" font-weight="700" fill="#2563EB">MC</text>`;
  }

  // Les MANCHES, posées APRÈS le torse donc par-dessus le haut du bras. Elles
  // suivent le tracé fléchi du bras : même chemin, trait plus épais.
  function manchesPath(tenue, c, m) {
    if (tenue === 'debardeur') return ''; // un débardeur n'a pas de manche, c'est le propos
    if (tenue === 'hoodie') {
      // Manches longues jusqu'au poignet — le sweat est le seul vêtement couvrant.
      return membre(m.brasG, m.mancheW, c, c) + membre(m.brasD, m.mancheW, c, c);
    }
    // T-shirt et polo : manches courtes, coupées à mi-biceps.
    return membre(m.mancheG, m.mancheW, c, c) + membre(m.mancheD, m.mancheW, c, c);
  }

  function volumeTorsePath(peau, athletique) {
    // L'ombre portée du menton sur le cou : le seul volume que le cou demande.
    return athletique
      ? `<path d="M43 70h10v5c0 2-2.5 3-5 3s-5-1-5-3z" fill="${peau.ombre}" opacity=".55"/>`
      : `<path d="M42 68h12v5c0 2-3 3-6 3s-6-1-6-3z" fill="${peau.ombre}" opacity=".55"/>`;
  }

  // Construit le SVG complet. `taille` sert d'attribut width/height ; le viewBox
  // reste fixe -> même rendu de la vignette 34px au grand format du profil.
  // `corps: 'entier'` allonge le viewBox et pose le personnage debout, sans le
  // disque de fond : c'est le mode du Chemin, et de lui seul.
  function rendreSVG(config, options) {
    const o = options || {};
    const c = normaliserConfig(config);
    const uid = 'a' + hashConfig(c).toString(36);
    const peau = trouve(PEAUX, c.peau, CONFIG_DEFAUT.peau);
    const chev = trouve(CHEVEUX_COULEURS, c.couleur_cheveux, CONFIG_DEFAUT.couleur_cheveux);
    const tenue = trouve(TENUES, c.tenue, CONFIG_DEFAUT.tenue);
    const g = visageGeom(c.visage);

    const accs = c.accessoires.map((id) => accessoirePath(id, uid));
    const arriere = accs.filter((_, i) => c.accessoires[i] === 'aura_platine');
    const devant = accs.filter((_, i) => c.accessoires[i] !== 'aura_platine');

    // En pied, le disque de fond disparaît : le personnage se tient sur le
    // sentier, il n'est plus une pastille posée dessus.
    const enPied = o.corps === 'entier';
    // La morphologie vient du QUESTIONNAIRE (profil.sexe) — pas d'un réglage de
    // plus à remplir dans l'éditeur.
    // ⚠️ « Autre / je préfère ne pas dire » et le sexe non renseigné gardent le
    // rendu D'ORIGINE, volontairement : ni le sablier ni le V ne conviennent à
    // quelqu'un qui a justement refusé de trancher, et le repli du chargement
    // (profil pas encore lu) ne doit imposer aucun corps.
    const morpho = MORPHO[o.sexe] || null;
    const athle = enPied && !!morpho;
    const m = morpho || MORPHO.homme;

    // La TÊTE et ce qui s'y accroche. En pied elle est mise à l'échelle et
    // redressée d'un bloc — d'où la séparation d'avec le reste des accessoires.
    // ⚠️ Le partage se fait par CATÉGORIE : une couronne ou des lunettes suivent
    // la tête, une médaille ou un brassard restent sur le corps, aux coordonnées
    // absolues où ils ont toujours été posés.
    const catDe = (id) => (ACCESSOIRES.find((a) => a.id === id) || {}).categorie;
    const accTete = athle ? accs.filter((_, i) => ['tete', 'visage'].includes(catDe(c.accessoires[i]))) : [];
    const accCorps = athle ? accs.filter((_, i) => !['tete', 'visage', 'aura'].includes(catDe(c.accessoires[i]))) : devant;

    const tete = [
      `<path d="${g.d}" fill="${peau.c}"/>`,
      `<ellipse cx="27" cy="54" rx="3" ry="4" fill="${peau.ombre}"/><ellipse cx="69" cy="54" rx="3" ry="4" fill="${peau.ombre}"/>`,
      cheveuxPath(c.coiffure, chev.c),
      sourcilsPath(c.sourcils, chev.c),
      yeuxPath(c.yeux),
      bouchePath(c.bouche),
      pilositePath(c.pilosite, chev.c),
      enPied ? accTete.map((a) => a.body).join('') : '',
    ].join('');
    // Réduction autour du MENTON (48,78) : la tête rapetisse vers le haut, le
    // cou et les épaules ne bougent pas d'un pixel.
    const teteEnPied = `<g transform="rotate(${TETE_REDRESSE} 48 78) translate(48 78) scale(${TETE_ECHELLE}) translate(-48 -78)">${tete}</g>`;

    const corps = [
      enPied ? '' : `<circle cx="48" cy="48" r="48" fill="${o.fond || '#EFF3FA'}"/>`,
      arriere.map((a) => a.body).join(''),
      enPied ? (athle ? membresPath(peau, tenue.c, m) : membresPathOrigine(peau, tenue.c)) : '',
      // Cou puis tenue : le col recouvre proprement la base du cou.
      athle ? `<path d="M43 68h10v18H43z" fill="${peau.ombre}"/>` : `<path d="M42 68h12v14H42z" fill="${peau.ombre}"/>`,
      athle ? torseEnPiedPath(c.tenue, tenue.c, uid, m) : tenuePath(c.tenue, tenue.c),
      enPied ? (athle ? manchesPath(c.tenue, tenue.c, m) : manchesPathOrigine(c.tenue, tenue.c)) : '',
      enPied ? volumeTorsePath(peau, athle) : '',
      athle ? teteEnPied : tete,
      accCorps.map((a) => a.body).join(''),
    ].join('');
    // Le personnage entier penche dans le sens de la marche. Pivot aux PIEDS :
    // c'est une jambe qui pousse, pas un buste qui bascule dans le vide.
    const scene = athle ? `<g transform="rotate(${INCLINAISON} 48 168)">${corps}</g>` : corps;

    const defs = accs.map((a) => a.defs).filter(Boolean).join('');
    const attrs = o.taille ? ` width="${o.taille}" height="${o.taille}"` : '';
    const vb = enPied ? `0 0 96 ${CORPS_H}` : '0 0 96 96';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${attrs} role="img" aria-label="${o.alt || 'Avatar'}">`
      + (defs ? '<defs>' + defs + '</defs>' : '') + scene + '</svg>';
  }

  // Empreinte de la config : sert d'identifiant de <defs> ET de jeton de cache
  // (l'URL de l'avatar change dès que la config change -> pas de vignette périmée).
  function hashConfig(config) {
    const s = JSON.stringify(normaliserConfig(config));
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) | 0;
    return h >>> 0; // non signé : l'empreinte part telle quelle dans une URL
  }

  return {
    PEAUX, CHEVEUX_COULEURS, VISAGES, COIFFURES, YEUX, SOURCILS, BOUCHES,
    PILOSITES, TENUES, ACCESSOIRES, CONFIG_DEFAUT, EMPLACEMENT_UNIQUE,
    normaliserConfig, configParDefaut, etatAccessoires, accessoiresDebloques,
    rendreSVG, hashConfig,
  };
}));
