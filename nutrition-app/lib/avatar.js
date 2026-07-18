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
  const ACCESSOIRES = [
    { id: 'bandeau', nom: 'Bandeau de sport', categorie: 'tete', tier: 'base', condition: { type: 'punch', valeur: 100 } },
    { id: 'casquette', nom: 'Casquette', categorie: 'tete', tier: 'base', condition: { type: 'punch', valeur: 200 } },
    { id: 'barrette', nom: 'Barrette', categorie: 'tete', tier: 'base', condition: { type: 'punch', valeur: 400 } },
    { id: 'lunettes', nom: 'Lunettes', categorie: 'visage', tier: 'base', condition: { type: 'punch', valeur: 500 } },
    { id: 'bonnet', nom: 'Bonnet', categorie: 'tete', tier: 'base', condition: { type: 'punch', valeur: 700 } },
    { id: 'brassard', nom: 'Brassard', categorie: 'tenue', tier: 'base', condition: { type: 'punch', valeur: 900 } },
    { id: 'medaille_argent', nom: 'Médaille d’argent', categorie: 'tenue', tier: 'argent', condition: { type: 'badge', valeur: 'badge_argent' } },
    { id: 'couronne_argent', nom: 'Couronne d’argent', categorie: 'tete', tier: 'argent', condition: { type: 'punch', valeur: 1100 } },
    { id: 'lunettes_or', nom: 'Lunettes dorées', categorie: 'visage', tier: 'or', condition: { type: 'punch', valeur: 1250 } },
    { id: 'medaille_or', nom: 'Médaille d’or', categorie: 'tenue', tier: 'or', condition: { type: 'badge', valeur: 'badge_or' } },
    { id: 'couronne_or', nom: 'Couronne d’or', categorie: 'tete', tier: 'or', condition: { type: 'punch', valeur: 1900 } },
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
        // Jamais de nombre nu : l'unité fait partie du libellé.
        conditionTexte: a.condition.type === 'badge'
          ? 'Débloqué avec le ' + String(a.condition.valeur).replace(/_/g, ' ')
          : (debloque ? 'Débloqué' : 'Encore ' + Math.max(0, a.condition.valeur - p) + ' PUNCH'),
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

  // Construit le SVG complet. `taille` sert d'attribut width/height ; le viewBox
  // reste fixe -> même rendu de la vignette 34px au grand format du profil.
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

    const corps = [
      `<circle cx="48" cy="48" r="48" fill="${o.fond || '#EFF3FA'}"/>`,
      arriere.map((a) => a.body).join(''),
      // Cou puis tenue : le col recouvre proprement la base du cou.
      `<path d="M42 68h12v14H42z" fill="${peau.ombre}"/>`,
      tenuePath(c.tenue, tenue.c),
      // Visage
      `<path d="${g.d}" fill="${peau.c}"/>`,
      `<ellipse cx="27" cy="54" rx="3" ry="4" fill="${peau.ombre}"/><ellipse cx="69" cy="54" rx="3" ry="4" fill="${peau.ombre}"/>`,
      cheveuxPath(c.coiffure, chev.c),
      sourcilsPath(c.sourcils, chev.c),
      yeuxPath(c.yeux),
      bouchePath(c.bouche),
      pilositePath(c.pilosite, chev.c),
      devant.map((a) => a.body).join(''),
    ].join('');

    const defs = accs.map((a) => a.defs).filter(Boolean).join('');
    const attrs = o.taille ? ` width="${o.taille}" height="${o.taille}"` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"${attrs} role="img" aria-label="${o.alt || 'Avatar'}">`
      + (defs ? '<defs>' + defs + '</defs>' : '') + corps + '</svg>';
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
