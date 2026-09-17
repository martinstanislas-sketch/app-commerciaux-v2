'use strict';
// ============================================================================
//  RECAP 2 — LE TEXTE « REMARQUES DU CLUB », PRÊT À COLLER DANS UN MAIL.
//
//  Module PUR (aucune I/O, aucun DOM) : il lit les remarques déjà posées sur le
//  rapport par le serveur (`note` sur chaque ligne, cf. lib/recap2Notes.js) et
//  rend le texte à copier. Chargé des deux côtés (UMD) : navigateur pour le
//  bouton, Node pour les tests.
//
//  Format (texte brut) :
//      NEUILLY — AOÛT 2026
//
//      Ventes signées
//
//      Daouda Sy
//      A demandé à résilier, à revoir avec le coach leader.
//
//      Clients non reconduits
//
//      Amiel Anais
//      Cliente contactée, situation sous contrôle.
//
//  Les remarques AUTOMATIQUES (public/recap2-conseils.js) sont reprises ici,
//  sur les ventes signées uniquement, AVANT la remarque manuelle et sans marque
//  distinctive : le conseiller lit une suite de phrases. Elles ne sont pas
//  stockées — recalculées à chaque copie, donc jamais en double et à jour.
//
//  Plus une version HTML (titres et noms en gras) pour un collage propre dans
//  Gmail. UNIQUEMENT les personnes qui ont une remarque ; une section sans
//  remarque n'apparaît pas. Une personne présente sur plusieurs lignes d'une
//  même liste (deux ventes) n'est écrite qu'une fois.
//  Aucun filtre de l'écran (commercial, statut) n'entre en compte : le club
//  entier, sur le mois du rapport.
// ============================================================================

(function (racine, fabrique) {
  // Dépend de Recap2Metrics (attribution d'un non-reconduit) : même règle que l'écran,
  // et de Recap2Conseils (les remarques automatiques adressées au conseiller).
  if (typeof module === 'object' && module.exports) module.exports = fabrique(require('./recap2-metrics.js'), require('./recap2-conseils.js'));
  else racine.Recap2Remarques = fabrique(racine.Recap2Metrics, racine.Recap2Conseils);
}(typeof self !== 'undefined' ? self : this, function (Metrics, Conseils) {
  const MOIS = ['JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE'];
  const SECTIONS = [
    { type: 'vente', titre: 'Ventes signées', bloc: 'clientsRetrouves', auto: true },
    { type: 'non_reconduit', titre: 'Clients non reconduits', bloc: 'nonReconduction' },
    // VNI : la liste ACTIVE posée par le serveur (transformés déjà retirés).
    { type: 'vni', titre: 'VNI', bloc: 'vni' },
  ];

  function moisEnClair(ym) {
    const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''));
    return m ? MOIS[+m[2] - 1] + ' ' + m[1] : String(ym || '');
  }

  // Même normalisation que le serveur (lib/recap2Matches.js cleIdentite) :
  // accents, casse, ponctuation et ORDRE des mots neutralisés.
  function cleIdentite(identite) {
    return String(identite == null ? '' : identite)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/['’`´]/g, ' ').replace(/[-_]/g, ' ')
      .toUpperCase().replace(/[^A-Z0-9]+/g, ' ')
      .trim().split(/\s+/).filter(Boolean).sort().join(' ');
  }
  // ── LA GRAPHIE D'UN NOM DANS LE TEXTE COPIÉ : « Prénom Nom » ────────────────
  //  Deciplus écrit « NOM Prénom » (nom en capitales), Fitness Booster déjà
  //  « Prénom Nom ». Règle, dans cet ordre :
  //   · des mots en CAPITALES ET des mots qui ne le sont pas -> les capitales
  //     sont le nom : « AMIEL Anais » -> « Anais Amiel »,
  //     « DE OLIVEIRA Sylvie » -> « Sylvie De Oliveira » ;
  //   · tout en capitales -> impossible de savoir qui est quoi : ordre gardé,
  //     casse adoucie (« DUPONT MARIE » -> « Dupont Marie ») ;
  //   · sinon, le nom est déjà propre : inchangé (« Daouda Sy »).
  //  Uniquement pour l'AFFICHAGE du texte copié : aucune clé ne dépend de ça.
  const aLettres = (m) => /\p{L}/u.test(m);
  const enCapitales = (m) => aLettres(m) && m === m.toUpperCase() && m.replace(/[^\p{L}]/gu, '').length >= 2;
  const casseDouce = (m) => m.toLowerCase().replace(/(^|[-'’\s])(\p{L})/gu, (x, sep, l) => sep + l.toUpperCase());
  function prenomNom(nom) {
    const mots = String(nom == null ? '' : nom).trim().split(/\s+/).filter(Boolean);
    if (!mots.length) return '';
    const caps = mots.filter(enCapitales);
    const autres = mots.filter((m) => !enCapitales(m));
    if (caps.length && autres.length) return autres.concat(caps.map(casseDouce)).join(' ');
    if (caps.length) return mots.map(casseDouce).join(' ');
    return mots.join(' ');
  }

  const idDe = (x) => (/^[0-9]{1,20}$/.test(String(x || '')) ? String(x) : '');
  const texteNote = (l) => String((l && l.note && l.note.remarque) || '').trim();

  // Même personne ? Même Id membre ; sinon même identité, sans Id contradictoire.
  function memePersonne(a, b) {
    const ia = idDe(a.idClient), ib = idDe(b.idClient);
    if (ia && ib) return ia === ib;
    // Deux contacts Vendor distincts (VNI homonymes) sont deux personnes.
    const va = String(a.contactId || ''), vb = String(b.contactId || '');
    if (va && vb) return va === vb;
    return cleIdentite(a.client) === cleIdentite(b.client);
  }

  // Les remarques d'une ligne : les automatiques (ventes signées d'un mois
  // contrôlé) puis la manuelle. La manuelle n'est jamais remplacée.
  function remarquesLigne(l, { auto, controle }) {
    const autos = auto && Conseils ? Conseils.conseilsVente(l, { controle }) : [];
    const manuelle = texteNote(l);
    return manuelle ? autos.concat([manuelle]) : autos;
  }

  // Les personnes à remarque d'une liste, dans l'ordre de l'écran, sans doublon.
  //  `auto` : la liste porte-t-elle des remarques automatiques (ventes signées) ;
  //  `controle` : le mois a-t-il été contrôlé (cf. Recap2Conseils.moisControle).
  function personnesAvecRemarque(liste, options) {
    const o = options || {};
    const out = [];
    (liste || []).forEach((l) => {
      const remarques = remarquesLigne(l, o);
      if (!remarques.length) return;
      if (out.some((p) => memePersonne(p, l))) return;
      out.push({ client: prenomNom(l.client), idClient: idDe(l.idClient), remarque: remarques.join('\n'), remarques });
    });
    return out;
  }

  function echapper(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // { nb, texte, html } — nb = 0 : rien à copier (texte et html vides).
  function remarquesClub(rapport, studio) {
    const b = rapport && rapport.studios && rapport.studios[studio];
    const controle = !!(Conseils && Conseils.moisControle(rapport));
    const sections = SECTIONS.map((s) => ({
      titre: s.titre,
      personnes: personnesAvecRemarque(b && b[s.bloc] && b[s.bloc].liste, { auto: s.auto, controle }),
    })).filter((s) => s.personnes.length);
    const nb = sections.reduce((n, s) => n + s.personnes.length, 0);
    if (!nb) return { nb: 0, texte: '', html: '' };

    const titre = String(studio || '').toUpperCase() + ' — ' + moisEnClair(rapport.mois);
    const texte = [titre].concat(sections.map((s) => s.titre + '\n\n'
      + s.personnes.map((p) => p.client + '\n' + p.remarque).join('\n\n'))).join('\n\n') + '\n';
    const para = (contenu) => '<p style="margin:0 0 12px">' + contenu + '</p>';
    const html = '<div>' + para('<b>' + echapper(titre) + '</b>')
      + sections.map((s) => para('<b>' + echapper(s.titre) + '</b>')
        + s.personnes.map((p) => para('<b>' + echapper(p.client) + '</b><br>' + echapper(p.remarque).replace(/\n/g, '<br>'))).join('')).join('')
      + '</div>';
    return { nb, texte, html };
  }

  // ── REMARQUES D'UN COMMERCIAL ────────────────────────────────────────────
  //  commercial + mois > studio > type > personne + remarque. Même règle de clé
  //  que la vue commerciale (Recap2Metrics.cleCommercial) : l'identifiant Vendor
  //  s'il existe (« id:… »), sinon le nom exact affiché (« nom:… »).
  //   · Ventes signées : le commercial de la vente ;
  //   · Clients non reconduits : le commercial RESPONSABLE, tel que l'écran
  //     l'affiche (Recap2Metrics.attributionNonReconduit) — choix manuel d'abord,
  //     sinon vendeur de la première vente Deciplus (par Id_client, table
  //     explicite), sinon personne. « Non attribué » ne sort chez aucun commercial ;
  //   · VNI            : le commercial du dernier RDV venu du mois (déjà calculé).
  const SECTIONS_COMMERCIAL = [
    { titre: 'Ventes signées', bloc: 'clientsRetrouves', auto: true, cle: (l) => (l.commercialId ? 'id:' + l.commercialId : 'nom:' + String(l.commercial == null ? '' : l.commercial)) },
    { titre: 'Clients non reconduits', bloc: 'nonReconduction', cle: (l) => ((Metrics && Metrics.attributionNonReconduit) ? Metrics.attributionNonReconduit(l).cle : '') },
    { titre: 'VNI', bloc: 'vni', cle: (l) => (l.commercialId ? 'id:' + l.commercialId : '') },
  ];

  // { nb, texte, html, studios: [...], categories: [...] } — nb = 0 : rien à copier.
  function remarquesCommercial(rapport, cleCommercial, nomAffiche) {
    const cle = String(cleCommercial || '');
    const controle = !!(Conseils && Conseils.moisControle(rapport));
    const studios = [];
    Object.keys((rapport && rapport.studios) || {}).forEach((s) => {
      const b = rapport.studios[s];
      const sections = SECTIONS_COMMERCIAL.map((sec) => ({
        titre: sec.titre,
        personnes: personnesAvecRemarque(((b && b[sec.bloc] && b[sec.bloc].liste) || []).filter((l) => cle && sec.cle(l) === cle), { auto: sec.auto, controle }),
      })).filter((sec) => sec.personnes.length);
      if (sections.length) studios.push({ studio: s, sections });
    });
    const nb = studios.reduce((n, st) => n + st.sections.reduce((m, sec) => m + sec.personnes.length, 0), 0);
    if (!nb) return { nb: 0, texte: '', html: '', studios: [], categories: [] };

    const titre = String(nomAffiche || '').toUpperCase() + ' — ' + moisEnClair(rapport.mois);
    const texte = [titre].concat(studios.map((st) => String(st.studio).toUpperCase() + '\n\n'
      + st.sections.map((sec) => sec.titre + '\n\n' + sec.personnes.map((p) => p.client + '\n' + p.remarque).join('\n\n')).join('\n\n'))).join('\n\n') + '\n';
    const para = (contenu, marge) => '<p style="margin:' + (marge || '0 0 12px') + '">' + contenu + '</p>';
    const html = '<div>' + para('<b>' + echapper(titre) + '</b>', '0 0 16px')
      + studios.map((st) => para('<b><u>' + echapper(String(st.studio).toUpperCase()) + '</u></b>', '16px 0 12px')
        + st.sections.map((sec) => para('<b>' + echapper(sec.titre) + '</b>')
          + sec.personnes.map((p) => para('<b>' + echapper(p.client) + '</b><br>' + echapper(p.remarque).replace(/\n/g, '<br>'))).join('')).join('')).join('')
      + '</div>';
    return { nb, texte, html, studios: studios.map((st) => st.studio), categories: [...new Set(studios.flatMap((st) => st.sections.map((sec) => sec.titre)))] };
  }

  return { remarquesClub, remarquesCommercial, moisEnClair, cleIdentite, memePersonne, prenomNom, remarquesLigne };
}));
