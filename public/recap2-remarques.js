'use strict';
// ============================================================================
//  RECAP 2 — LE TEXTE « REMARQUES DU CLUB », PRÊT À COLLER DANS UN MAIL.
//
//  Module PUR (aucune I/O, aucun DOM) : il lit les remarques déjà posées sur le
//  rapport par le serveur (`note` sur chaque ligne, cf. lib/recap2Notes.js) et
//  rend le texte à copier. Chargé des deux côtés (UMD) : navigateur pour le
//  bouton, Node pour les tests.
//
//  Format (texte brut) — chaque remarque garde son CONTEXTE (client, date,
//  vente concernée) ; une personne qui a deux ventes a deux blocs :
//      NEUILLY — AOÛT 2026
//
//      Ventes signées
//
//      Daouda Sy — vente du 12/08/2026 · Challenge 12 mois
//      À faire : Contacte le client pour planifier ses prochaines séances.
//      A demandé à résilier, à revoir avec le coach leader.
//
//      Clients non reconduits
//
//      Anais Amiel — client non reconduit
//      À faire : Contacte le client et propose-lui le Challenge Flex à 4 séances par mois.
//
//  Les remarques AUTOMATIQUES viennent du registre unique (public/recap2-regles.js) :
//  seules les ACTIONS sont copiées, chacune commençant exactement une fois par
//  « À faire : » (écrit dans le texte, jamais par CSS) ; les alertes techniques
//  (codes de contrôle, contrôle financier impossible…) restent à l'écran de
//  l'administrateur. Version personnalisée reprise telle qu'affichée. La
//  remarque manuelle suit, sans préfixe, une seule fois par personne et par
//  section. Plus une version HTML (titres et noms en gras) pour Gmail.
//  UNIQUEMENT les dossiers qui ont une remarque ; une section vide n'apparaît
//  pas. Aucun filtre de l'écran n'entre en compte : le club entier, sur le mois.
// ============================================================================

(function (racine, fabrique) {
  // Dépend de Recap2Metrics (attribution d'un non-reconduit) : même règle que l'écran,
  // et du registre Recap2Regles (les remarques automatiques adressées au conseiller).
  if (typeof module === 'object' && module.exports) module.exports = fabrique(require('./recap2-metrics.js'), require('./recap2-regles.js'));
  else racine.Recap2Remarques = fabrique(racine.Recap2Metrics, racine.Recap2Regles);
}(typeof self !== 'undefined' ? self : this, function (Metrics, Regles) {
  const MOIS = ['JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE'];
  const SECTIONS = [
    { type: 'vente', titre: 'Ventes signées', bloc: 'clientsRetrouves' },
    { type: 'non_reconduit', titre: 'Clients non reconduits', bloc: 'nonReconduction' },
    // VNI : la liste ACTIVE posée par le serveur (transformés déjà retirés).
    { type: 'vni', titre: 'VNI', bloc: 'vni' },
    // Membres suspendus HORS non-reconduits (contrôle Deciplus, lecture sûre).
    { type: 'suspension', titre: 'Suspensions à contrôler', bloc: 'suspensionsControle' },
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

  // Les remarques AUTOMATIQUES d'une ligne (actions seulement, version affichée,
  // préfixe « À faire : » exactement une fois). `type` : vente | non_reconduit | vni | suspension.
  function actionsLigne(l, type, ctx) {
    if (!Regles) return [];
    const items = type === 'vni' ? Regles.evaluerVni(l)
      : type === 'non_reconduit' ? Regles.evaluerNR(l)
        : type === 'suspension' ? Regles.evaluerSuspension(l)
          : Regles.evaluerVente(l, ctx);
    return Regles.versions(Regles.actions(items), l).map((v) => Regles.enAction(v.texte));
  }
  // Compatibilité : automatiques puis manuelle, pour une ligne isolée.
  function remarquesLigne(l, { type = 'vente', ctx = {} } = {}) {
    const manuelle = texteNote(l);
    const autos = actionsLigne(l, type, ctx);
    return manuelle ? autos.concat([manuelle]) : autos;
  }
  // Le contexte d'un dossier dans le texte copié.
  function contexte(l, type) {
    const nom = prenomNom(l.client);
    if (type === 'vente') {
      return nom + ' — vente' + (l.date ? ' du ' + l.date : '') + (l.prestation ? ' · ' + String(l.prestation).trim() : '') + (l.annulee ? ' (annulée)' : '');
    }
    if (type === 'vni') return nom + ' — VNI' + (l.dateVenue ? ' venu le ' + l.dateVenue : '');
    if (type === 'suspension') return nom + ' — suspension';
    return nom + ' — client non reconduit';
  }

  // Les dossiers à remarque d'une liste, dans l'ordre de l'écran. Chaque vente
  // est un dossier : une personne qui a deux ventes a deux blocs (rien n'est
  // perdu). La remarque manuelle (par personne) n'est écrite qu'une fois.
  function dossiersAvecRemarque(liste, type, ctx) {
    const out = [];
    const notesVues = [];
    (liste || []).forEach((l) => {
      const autos = actionsLigne(l, type, ctx);
      const manuelle = texteNote(l);
      const dejaNote = !!manuelle && notesVues.some((p) => memePersonne(p, l));
      if (manuelle && !dejaNote) notesVues.push(l);
      const remarques = autos.concat(manuelle && !dejaNote ? [manuelle] : []);
      if (!remarques.length) return;
      // Même dossier deux fois (même vente) : une seule fois.
      if (out.some((p) => p.cle === Regles.cleDossier(type, l))) return;
      out.push({ cle: Regles.cleDossier(type, l), client: prenomNom(l.client), titre: contexte(l, type), idClient: idDe(l.idClient),
        remarque: remarques.join('\n'), remarques });
    });
    return out;
  }
  // Compatibilité (anciens appels) : même règle.
  function personnesAvecRemarque(liste, options) {
    const o = options || {};
    return dossiersAvecRemarque(liste, o.type || 'vente', o.ctx || {});
  }

  function echapper(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // { nb, texte, html } — nb = 0 : rien à copier (texte et html vides).
  function remarquesClub(rapport, studio) {
    const b = rapport && rapport.studios && rapport.studios[studio];
    const ctx = Regles ? Regles.contexteRapport(rapport) : {};
    const sections = SECTIONS.map((s) => ({
      titre: s.titre,
      personnes: dossiersAvecRemarque(b && b[s.bloc] && b[s.bloc].liste, s.type, ctx),
    })).filter((s) => s.personnes.length);
    const nb = sections.reduce((n, s) => n + s.personnes.length, 0);
    if (!nb) return { nb: 0, texte: '', html: '' };

    const titre = String(studio || '').toUpperCase() + ' — ' + moisEnClair(rapport.mois);
    const texte = [titre].concat(sections.map((s) => s.titre + '\n\n'
      + s.personnes.map((p) => p.titre + '\n' + p.remarque).join('\n\n'))).join('\n\n') + '\n';
    const para = (contenu) => '<p style="margin:0 0 12px">' + contenu + '</p>';
    const html = '<div>' + para('<b>' + echapper(titre) + '</b>')
      + sections.map((s) => para('<b>' + echapper(s.titre) + '</b>')
        + s.personnes.map((p) => para('<b>' + echapper(p.titre) + '</b><br>' + echapper(p.remarque).replace(/\n/g, '<br>'))).join('')).join('')
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
    { titre: 'Ventes signées', bloc: 'clientsRetrouves', type: 'vente', cle: (l) => (l.commercialId ? 'id:' + l.commercialId : 'nom:' + String(l.commercial == null ? '' : l.commercial)) },
    { titre: 'Clients non reconduits', bloc: 'nonReconduction', type: 'non_reconduit', cle: (l) => ((Metrics && Metrics.attributionNonReconduit) ? Metrics.attributionNonReconduit(l).cle : '') },
    { titre: 'VNI', bloc: 'vni', type: 'vni', cle: (l) => (l.commercialId ? 'id:' + l.commercialId : '') },
  ];

  // { nb, texte, html, studios: [...], categories: [...] } — nb = 0 : rien à copier.
  function remarquesCommercial(rapport, cleCommercial, nomAffiche) {
    const cle = String(cleCommercial || '');
    const ctx = Regles ? Regles.contexteRapport(rapport) : {};
    const studios = [];
    Object.keys((rapport && rapport.studios) || {}).forEach((s) => {
      const b = rapport.studios[s];
      const sections = SECTIONS_COMMERCIAL.map((sec) => ({
        titre: sec.titre,
        personnes: dossiersAvecRemarque(((b && b[sec.bloc] && b[sec.bloc].liste) || []).filter((l) => cle && sec.cle(l) === cle), sec.type, ctx),
      })).filter((sec) => sec.personnes.length);
      if (sections.length) studios.push({ studio: s, sections });
    });
    const nb = studios.reduce((n, st) => n + st.sections.reduce((m, sec) => m + sec.personnes.length, 0), 0);
    if (!nb) return { nb: 0, texte: '', html: '', studios: [], categories: [] };

    const titre = String(nomAffiche || '').toUpperCase() + ' — ' + moisEnClair(rapport.mois);
    const texte = [titre].concat(studios.map((st) => String(st.studio).toUpperCase() + '\n\n'
      + st.sections.map((sec) => sec.titre + '\n\n' + sec.personnes.map((p) => p.titre + '\n' + p.remarque).join('\n\n')).join('\n\n'))).join('\n\n') + '\n';
    const para = (contenu, marge) => '<p style="margin:' + (marge || '0 0 12px') + '">' + contenu + '</p>';
    const html = '<div>' + para('<b>' + echapper(titre) + '</b>', '0 0 16px')
      + studios.map((st) => para('<b><u>' + echapper(String(st.studio).toUpperCase()) + '</u></b>', '16px 0 12px')
        + st.sections.map((sec) => para('<b>' + echapper(sec.titre) + '</b>')
          + sec.personnes.map((p) => para('<b>' + echapper(p.titre) + '</b><br>' + echapper(p.remarque).replace(/\n/g, '<br>'))).join('')).join('')).join('')
      + '</div>';
    return { nb, texte, html, studios: studios.map((st) => st.studio), categories: [...new Set(studios.flatMap((st) => st.sections.map((sec) => sec.titre)))] };
  }

  return { remarquesClub, remarquesCommercial, moisEnClair, cleIdentite, memePersonne, prenomNom, remarquesLigne, actionsLigne, dossiersAvecRemarque, personnesAvecRemarque, contexte };
}));
