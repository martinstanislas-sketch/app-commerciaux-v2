'use strict';
// ============================================================================
//  RECAP 2 — les DEUX métriques brutes, et rien d'autre.
//
//  Module PUR (aucune I/O, aucun DOM) : on lui passe des lignes DÉJÀ parsées
//  par le système RECAP existant (retention_imports) et il rend des nombres et
//  des listes. Chargé des deux côtés (UMD) : navigateur pour l'écran, Node pour
//  les tests.
//
//  ⚠️ VOLONTAIREMENT BRUT. Aucune qualification, aucun « NE », aucun « déjà
//  traité », aucun pack, aucun préavis, aucun ajustement manuel, aucun fichier
//  de résiliation n'entre ici. RECAP 2 AUDITE UN MOIS M et répond à deux
//  questions factuelles :
//    1. qui payait en M-1 et ne paie plus en M ?
//    2. les clients qui ont signé en M sont-ils bien saisis dans le CRM ?
//  `completion()` est l'ANCIENNE forme de la question 2 (contrats de M-1 ayant
//  payé en M) : conservée pour relire les rapports d'avant, plus jamais produite.
//  Le moteur `retention.js` reste la référence de l'ancien RECAP (et de FAN /
//  BOSS) : on lui EMPRUNTE ses briques (clé client, agrégation, dédup des
//  signataires), on ne le modifie pas et on n'en refait pas une deuxième version.
// ============================================================================

(function (root, factory) {
  const R = (root && root.Retention) || (typeof require !== 'undefined' ? require('./retention.js') : null);
  const G = (root && root.Recap2Regles) || (typeof require !== 'undefined' ? require('./recap2-regles.js') : null);
  const api = factory(R, G);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Recap2Metrics = api;
}(typeof self !== 'undefined' ? self : this, function (Retention, Regles) {

  // ── STUDIOS : les 6 studios en propre, dans l'ordre imposé ──────────────────
  // Table d'alias EXPLICITE : un nom de studio n'est reconnu que s'il figure
  // ici, à l'identique après normalisation. Aucun rapprochement approximatif —
  // « Ginkgo Sport », « Caen », « Tours », « Veigné », « Paris 15 » et tout
  // studio inconnu sont simplement ignorés (studioLabel -> null).
  const STUDIOS = [
    { label: 'Lille', alias: ['lille', 'vieuxlille', 'lillevieuxlille', 'mycoachlille', 'mycoachvieuxlille'] },
    { label: 'Wasquehal', alias: ['wasquehal', 'mycoachwasquehal'] },
    { label: 'Marcq', alias: ['marcq', 'marcqenbaroeul', 'mycoachmarcq', 'mycoachmarcqenbaroeul'] },
    { label: 'Boulogne', alias: ['boulogne', 'boulognebillancourt', 'mycoachboulogne', 'mycoachboulognebillancourt'] },
    { label: 'Levallois', alias: ['levallois', 'levalloisperret', 'mycoachlevallois', 'mycoachlevalloisperret'] },
    { label: 'Neuilly', alias: ['neuilly', 'neuillysurseine', 'mycoachneuilly', 'mycoachneuillysurseine'] },
  ];
  const LABELS = STUDIOS.map((s) => s.label);

  // Normalisation d'un nom de studio : minuscules, ligatures dépliées, sans
  // accents, sans ponctuation ni espaces. « Marcq-en-Barœul » -> marcqenbaroeul.
  function normStudio(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '');
  }
  // Index alias -> label, construit une fois.
  const INDEX = (() => {
    const m = new Map();
    STUDIOS.forEach((s) => s.alias.forEach((a) => m.set(normStudio(a), s.label)));
    return m;
  })();
  // Libellé d'affichage d'un studio source, ou null s'il n'est pas des nôtres.
  function studioLabel(nom) { return INDEX.get(normStudio(nom)) || null; }

  // ── Noms lisibles ──────────────────────────────────────────────────────────
  // Les lignes d'encaissement portent Nom/Prénom tels qu'exportés : on garde la
  // 1re graphie non vide rencontrée pour chaque clé. À défaut, la clé elle-même
  // (NOM|PRENOM) redonne les deux morceaux.
  function nomsDepuisLignes(lignes) {
    const m = new Map();
    (lignes || []).forEach((l) => {
      if (!l || !l.cle || m.has(l.cle)) return;
      if (l.nom || l.prenom) m.set(l.cle, { nom: String(l.nom || ''), prenom: String(l.prenom || '') });
    });
    return m;
  }
  function nomDeCle(cle, map) {
    const hit = map && map.get(cle);
    if (hit) return hit;
    const p = String(cle || '').split('|');
    return { nom: p[0] || '', prenom: p[1] || '' };
  }

  // ── INDICATEUR 1 — NON-RECONDUCTION ────────────────────────────────────────
  // Base   : clients UNIQUES dont le net M-1 > 0 (un client vu 5 fois = 1).
  // Perdus : parmi eux, ceux dont le net M <= 0 ou qui sont absents de M.
  // Le net est signé (un rejet annule son prélèvement) : c'est l'agrégation du
  // moteur existant, reprise telle quelle.
  function nonReconduction({ encM1, encM } = {}) {
    const agM1 = Retention.agregerParClient(encM1 || []);
    const agM = Retention.agregerParClient(encM || []);
    const noms = nomsDepuisLignes((encM1 || []).concat(encM || []));
    const nonReconduits = [];
    let base = 0;
    agM1.forEach((a, cle) => {
      if (!(a.net > 0)) return;          // n'a pas réellement payé en M-1 -> hors base
      base += 1;
      const aM = agM.get(cle);
      const netM = aM ? aM.net : 0;
      if (netM > 0) return;              // reconduit
      const n = nomDeCle(cle, noms);
      nonReconduits.push({ cle, nom: n.nom, prenom: n.prenom, netM1: a.net, netM });
    });
    nonReconduits.sort((x, y) => ((x.nom || '') + ' ' + (x.prenom || '')).localeCompare((y.nom || '') + ' ' + (y.prenom || ''), 'fr'));
    return {
      base,
      nb: nonReconduits.length,
      // Pas de dénominateur -> pas de taux. Jamais NaN, jamais un faux 0 %.
      taux: base > 0 ? nonReconduits.length / base : null,
      nonReconduits,
    };
  }

  // ── INDICATEUR 2 — COMPLÉTION DES NOUVEAUX CONTRATS ────────────────────────
  // Dénominateur : signataires UNIQUES de M-1 (dédup du moteur : deux contrats
  // au même jeu de clés candidates = une seule personne).
  // Numérateur   : ceux dont AU MOINS UNE clé candidate correspond à un client
  // au net M > 0 (le nom de fichier ne dit pas où s'arrête le prénom, d'où les
  // clés candidates ; une seule suffit, et on ne compte la personne qu'une fois).
  function completion({ contratsM1, encM } = {}) {
    const agM = Retention.agregerParClient(encM || []);
    const sig = Retention.dedupSignataires(contratsM1 || []);
    const contrats = sig.map((s) => {
      let netM = 0, cleMatch = null;
      (s.cles || []).forEach((k) => {
        const a = agM.get(k);
        if (a && a.net > netM) { netM = a.net; cleMatch = k; }
      });
      const prenom = Retention.titleCase(s.prenom || '');
      const nom = Retention.titleCase(s.nom || '');
      return { cle: cleMatch, nom, prenom, paye: netM > 0, netM, date: s.date || '' };
    });
    contrats.sort((x, y) => ((x.nom || '') + ' ' + (x.prenom || '')).localeCompare((y.nom || '') + ' ' + (y.prenom || ''), 'fr'));
    const nbPayes = contrats.filter((c) => c.paye).length;
    return {
      total: contrats.length,
      nbPayes,
      // Aucun contrat signé -> pas de dénominateur -> taux null (l'écran dira
      // « — » et « 0 nouveau contrat »), jamais 0 % ni NaN.
      taux: contrats.length > 0 ? nbPayes / contrats.length : null,
      contrats,
    };
  }

  // ── INDICATEUR 2 — CLIENTS RETROUVÉS DANS DECIPLUS ─────────────────────────
  //  Question posée : les ventes signées dans Fitness Booster PENDANT M ont-elles
  //  été saisies dans le CRM ?
  //
  //  ⚠️ CE QU'ON PROUVE, EXACTEMENT — et pas un mot de plus.
  //  On rapproche par le NOM (Fitness Booster ne porte aucun identifiant
  //  Deciplus). On sait donc dire : « ce signataire a AU MOINS UNE vente
  //  enregistrée dans Deciplus sur M ». On ne sait PAS certifier que c'est LE
  //  contrat signé : les deux outils ne nomment pas les prestations pareil, et
  //  un contrat commercial peut donner plusieurs ventes Deciplus (le challenge,
  //  puis un pack de suivi). D'où le libellé « clients retrouvés » et jamais
  //  « contrats retrouvés ».
  //
  //  Dénominateur : signataires UNIQUES (deux contrats d'une même personne = une
  //  personne). Le nombre de contrats bruts reste rendu à part pour que l'écart
  //  soit DIT, jamais avalé en silence.
  //
  //  `encM` est facultatif : il ne change aucun compte, il sert seulement à
  //  distinguer « retrouvé ET encaissé » de « retrouvé, pas encore encaissé » —
  //  l'information qui, confondue avec une absence, faussait l'ancien KPI.
  //  ⚠️ LES VENTES ANNULÉES SONT VISIBLES, MAIS HORS DU TAUX.
  //  On contrôle TOUT ce qui a été signé dans le mois — une vente annulée
  //  ensuite reste un acte de vente à regarder. Mais elle ne pénalise pas la
  //  saisie CRM : on ne peut pas reprocher à un commercial de n'avoir pas fait
  //  saisir un contrat qui n'existe plus. D'où deux listes distinctes et un
  //  dénominateur qui n'en compte qu'une.
  //
  //  Une annulée reste « ANNULÉ » même si une trace Deciplus existe : son
  //  statut principal est son annulation. On ne la cherche donc pas dans le
  //  journal des ventes, et elle ne porte ni `retrouve` ni Id_client.
  function clientsRetrouves({ signataires, annulees, ventesM, encM } = {}) {
    // Une clé -> la première vente qui la porte. Première suffit : on répond
    // « présent ou absent », pas « combien de fois ».
    const index = new Map();
    (ventesM || []).forEach((v) => { if (v && v.cle && !index.has(v.cle)) index.set(v.cle, v); });
    const agM = Retention.agregerParClient(encM || []);
    const sig = Retention.dedupSignataires(signataires || []);

    const clients = sig.map((s) => {
      let vente = null, netM = 0;
      (s.cles || []).forEach((k) => {
        if (!vente && index.has(k)) vente = index.get(k);
        const a = agM.get(k);
        if (a && a.net > netM) netM = a.net;
      });
      return {
        nom: Retention.titleCase(s.nom || ''),
        prenom: Retention.titleCase(s.prenom || ''),
        date: s.date || '',
        prestation: s.prestation || '',
        commercial: s.commercial || '',
        commercialId: s.commercialId || '',
        annulee: false,
        dateAnnulation: '',
        retrouve: !!vente,
        site: vente ? vente.site : null,
        dateVente: vente ? vente.date : '',
        prestationCrm: vente ? vente.prestation : '',
        // L'Id_client de la vente retrouvée : le SEUL moyen d'ouvrir la bonne
        // fiche Deciplus. On ne le déduit jamais d'un nom, et il n'existe que
        // pour un client retrouvé — un « à vérifier » n'a par définition aucune
        // vente, donc aucun id.
        idClient: vente ? String(vente.idClient || '') : '',
        encaisse: netM > 0,
        // Identifiants du contact VENDOR de la vente (facultatifs, aucun effet
        // sur le taux) : voir identifiantDeciplus().
        contactIdVendor: s.contactIdVendor || '',
        idDeciplusVendor: s.idDeciplusVendor || '',
      };
    });
    clients.sort((x, y) => ((x.nom || '') + ' ' + (x.prenom || '')).localeCompare((y.nom || '') + ' ' + (y.prenom || ''), 'fr'));

    const nbRetrouves = clients.filter((c) => c.retrouve).length;

    // Les annulées : rendues telles quelles, ni dédupliquées ni appariées.
    // Chaque vente annulée du mois est une ligne — c'est bien « toute vente
    // signée pendant M » que l'on veut voir.
    const annules = (annulees || []).map((a) => ({
      nom: Retention.titleCase(a.nom || ''),
      prenom: Retention.titleCase(a.prenom || ''),
      date: a.date || '',
      prestation: a.prestation || '',
      commercial: a.commercial || '',
      commercialId: a.commercialId || '',
      dateAnnulation: a.dateAnnulation || '',
      annulee: true,
      retrouve: false,
      site: null,
      dateVente: '',
      idClient: '',
      encaisse: false,
      contactIdVendor: a.contactIdVendor || '',
      idDeciplusVendor: a.idDeciplusVendor || '',
    }));
    annules.sort((x, y) => ((x.nom || '') + ' ' + (x.prenom || '')).localeCompare((y.nom || '') + ' ' + (y.prenom || ''), 'fr'));

    return {
      // `total` reste le DÉNOMINATEUR DU TAUX : les signataires actifs.
      total: clients.length,
      nbRetrouves,
      // Aucun signataire actif -> pas de dénominateur -> taux null (l'écran dira
      // « — »), jamais 0 % ni NaN. Des ventes annulées seules ne créent pas un
      // taux : il n'y avait rien à retrouver.
      taux: clients.length > 0 ? nbRetrouves / clients.length : null,
      clients,
      annules,
    };
  }

  // ── VUE PAR COMMERCIAL ─────────────────────────────────────────────────────
  //  Une LECTURE du rapport v2, pas un second calcul : on regroupe les lignes
  //  déjà produites par clientsRetrouves() sans rien recalculer ni réapparier.
  //  Le taux d'un commercial est donc, par construction, cohérent avec les
  //  cartes studio — c'est le même verdict « retrouvé », juste trié autrement.
  //
  //  ⚠️ NE CONCERNE QUE LE 2e KPI. La non-reconduction n'a aucun commercial :
  //  elle porte sur des clients qui payaient le mois d'avant, pas sur des
  //  ventes. Aucune fonction d'ici ne la touche.
  //
  //  ⚠️ LE NOM EXACT FAIT FOI. « Paméla  L. » (deux espaces) et « Paméla L. »
  //  resteraient DEUX commerciaux : on ne fusionne jamais deux libellés
  //  différents, au cas où ce seraient deux personnes. L'assainissement des
  //  espaces est réservé à l'AFFICHAGE (voir libelleCommercial), la clé métier
  //  reste la chaîne telle que Fitness Booster l'a donnée.

  // Toutes les ventes du rapport, à plat, chacune portant son studio d'origine.
  function ventesDuRapport(rapport) {
    const out = [];
    LABELS.forEach((s) => {
      const b = (rapport && rapport.studios && rapport.studios[s]) || null;
      const cr = b && b.clientsRetrouves;
      if (!cr || !Array.isArray(cr.liste)) return;
      cr.liste.forEach((v) => out.push(Object.assign({ studio: s }, v)));
    });
    return out;
  }

  // ── LA CLÉ D'UN COMMERCIAL : SON IDENTIFIANT VENDOR ───────────────────────
  //  Depuis le 2026-09-14, chaque vente porte `commercialId` (l'identifiant
  //  Vendor lu sur la vente elle-même) et chaque prise de référence `createurId`.
  //  C'est LUI qui regroupe : deux personnes au même nom affiché restent deux
  //  commerciaux, et un nom modifié dans Vendor ne coupe pas l'historique.
  //  Le nom ne sert plus qu'à l'affichage.
  //  Sans identifiant (rapport d'avant, ou identifiant illisible — signalé à la
  //  collecte), la clé retombe sur le NOM EXACT, comme avant : jamais de
  //  rapprochement « à peu près ».
  const cleCommercial = (v) => (v && v.commercialId ? 'id:' + v.commercialId : 'nom:' + String(v && v.commercial != null ? v.commercial : ''));
  // Une clé passée par l'écran, ou un nom brut (usage historique).
  const normCle = (c) => (/^(id|nom):/.test(String(c)) ? String(c) : 'nom:' + String(c == null ? '' : c));

  // Les prises de référence du rapport, à plat, chacune portant son studio.
  //  `indisponibles` : les studios dont la lecture Vendor a échoué — on ne les
  //  confond jamais avec « 0 prise de référence ».
  function referencesDuRapport(rapport) {
    const liste = [], indisponibles = [];
    let presentes = false;
    LABELS.forEach((s) => {
      const pr = rapport && rapport.studios && rapport.studios[s] && rapport.studios[s].prisesReference;
      if (!pr) return;
      presentes = true;
      if (pr.echec) { indisponibles.push({ studio: s, raison: pr.echec }); return; }
      (pr.liste || []).forEach((r) => liste.push(Object.assign({ studio: s }, r)));
    });
    return { presentes, liste, indisponibles };
  }

  // Les commerciaux du mois — ventes ET prises de référence —, avec leurs comptes.
  // ── VNI (visiteurs non inscrits) ─────────────────────────────────────────
  //  La liste ACTIVE de chaque studio, telle que le serveur l'a posée (les
  //  personnes transformées depuis la collecte en sont déjà retirées). Un repère
  //  de suivi : aucun KPI n'en dépend. `presents` : le rapport en porte-t-il ?
  //  `indisponibles` : studios dont la lecture a échoué — jamais « 0 VNI ».
  function vniDuRapport(rapport) {
    const liste = [], indisponibles = [];
    let presents = false;
    LABELS.forEach((s) => {
      const v = rapport && rapport.studios && rapport.studios[s] && rapport.studios[s].vni;
      if (!v) return;
      presents = true;
      if (v.echec) { indisponibles.push({ studio: s, raison: v.echec }); return; }
      (v.liste || []).forEach((l) => liste.push(Object.assign({ studio: s }, l)));
    });
    return { presents, liste, indisponibles };
  }

  // ── COMMERCIAL RESPONSABLE D'UN CLIENT NON RECONDUIT ───────────────────────
  //  Une donnée de SUIVI, jamais de calcul : aucun KPI ne la lit.
  //  Ordre de priorité, sans exception :
  //    1) le choix MANUEL posé dans RECAP 2 (`attribution`, lib/recap2NrCommerciaux.js),
  //       y compris « Non attribué » ;
  //    2) le vendeur de la PREMIÈRE vente connue de ce client (`vendeurOrigine`,
  //       lu par Id_client dans l'historique des ventes Deciplus), s'il figure
  //       dans la table ci-dessous ;
  //    3) sinon « Non attribué », avec le motif.
  //  ⚠️ TABLE EXPLICITE, correspondance EXACTE (espaces et casse seulement
  //  neutralisés). Jamais de ressemblance : « magali » n'est pas « Magali GUYOT »
  //  tant qu'on ne l'a pas ajouté ici. Les comptes génériques (STAN MULTI-SITES,
  //  Ginkgo, Admin…) n'y figurent pas et n'y figureront jamais.
  //  Clé = identifiant Vendor du commercial : la même que la vue commerciale.
  const VENDEURS_DECIPLUS = Object.freeze({
    'MARVIN BOULLIGNY': Object.freeze({ id: '1676534557603x269706782936696800', nom: 'Marvin B.' }),
    'FABIAN FERNEZ': Object.freeze({ id: '1638283322062x610405598290114400', nom: 'Fabian F.' }),
    'MAGALI GUYOT': Object.freeze({ id: '1669303222657x648298562822821900', nom: 'Magali G.' }),
    'BENJAMIN CONSTANTY': Object.freeze({ id: '1719949036540x783196276006537000', nom: 'Benjamin C.' }),
    'LUCA ROELOFFZEN': Object.freeze({ id: '1674481440746x588221726139669400', nom: 'Luca R.' }),
    'THIBAULT PREGUICA': Object.freeze({ id: '1782814078367x500550143389292000', nom: 'Thibault P.' }),
    'CÉDRIC HADDOU': Object.freeze({ id: '1639731900216x114031637613311040', nom: 'Cédric H.' }),
  });
  const cleVendeurDeciplus = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toUpperCase();
  function commercialDuVendeurDeciplus(vendeur) {
    const e = VENDEURS_DECIPLUS[cleVendeurDeciplus(vendeur)];
    return e ? { cle: 'id:' + e.id, nom: e.nom, commercialId: e.id } : null;
  }
  // L'attribution AUTOMATIQUE seule (sans le choix manuel).
  function attributionAutomatique(ligne) {
    const o = ligne && ligne.vendeurOrigine;
    const aucun = (motif) => ({ mode: 'aucun', cle: '', nom: '', commercialId: '', motif, vendeurOrigine: o || null });
    // Deux causes bien distinctes à l'absence de vendeur d'origine.
    if (!o) {
      return aucun(/^[0-9]{1,20}$/.test(String((ligne && ligne.idClient) || ''))
        ? 'historique des ventes Deciplus non collecté pour ce rapport'
        : 'ce rapport ne porte pas l\'Id membre Deciplus de ce client');
    }
    if (o.introuvable) return aucun('aucune vente avec vendeur pour ce client dans l\'historique des ventes Deciplus');
    if (o.ambigu) return aucun('plusieurs vendeurs Deciplus le ' + o.date + ' : ' + (o.vendeurs || []).join(', '));
    const c = commercialDuVendeurDeciplus(o.vendeur);
    const vente = 'première vente connue' + (o.numVente ? ' n°' + o.numVente : '') + ' du ' + o.date
      + (o.prestation ? ' « ' + o.prestation + ' »' : '') + ' — vendeur Deciplus « ' + o.vendeur + ' »';
    if (!c) return aucun(vente + ', absent de la table des commerciaux RECAP 2');
    return { mode: 'auto', cle: c.cle, nom: c.nom, commercialId: c.commercialId, motif: vente, vendeurOrigine: o };
  }
  // L'attribution EFFECTIVE : { mode: 'manuel'|'auto'|'aucun', cle, nom, motif, auto, … }.
  // `cle` vide = Non attribué.
  function attributionNonReconduit(ligne) {
    const auto = attributionAutomatique(ligne);
    const m = ligne && ligne.attribution;
    if (!m || !m.manuel) return Object.assign({ auto }, auto);
    const cle = String(m.cle || '');
    return {
      mode: 'manuel', cle, nom: cle ? String(m.nom || '') : '', commercialId: cle.indexOf('id:') === 0 ? cle.slice(3) : '',
      motif: 'choix manuel' + (m.modifiePar ? ' de ' + m.modifiePar : ''), modifieLe: m.modifieLe || '', modifiePar: m.modifiePar || '',
      vendeurOrigine: auto.vendeurOrigine, auto,
    };
  }
  function nonReconduitsDuRapport(rapport) {
    const liste = [];
    LABELS.forEach((s) => {
      const nr = rapport && rapport.studios && rapport.studios[s] && rapport.studios[s].nonReconduction;
      ((nr && nr.liste) || []).forEach((l) => liste.push(Object.assign({ studio: s }, l)));
    });
    return liste;
  }

  function commerciauxDuRapport(rapport) {
    const par = new Map();
    const entree = (cle, nom, id) => {
      if (!par.has(cle)) par.set(cle, { cle, commercial: nom, commercialId: id || '', ventes: 0, annulees: 0, retrouves: 0, references: 0, vni: 0, nonReconduits: 0, studios: [] });
      return par.get(cle);
    };
    ventesDuRapport(rapport).forEach((v) => {
      const e = entree(cleCommercial(v), String(v.commercial == null ? '' : v.commercial), v.commercialId);
      e.ventes += 1;
      if (v.annulee) e.annulees += 1;
      else if (v.retrouve) e.retrouves += 1;
      if (e.studios.indexOf(v.studio) < 0) e.studios.push(v.studio);
    });
    referencesDuRapport(rapport).liste.forEach((r) => {
      if (!r.createurId) return;
      const e = entree('id:' + r.createurId, r.createur || '', r.createurId);
      if (!e.commercial) e.commercial = r.createur || '';
      e.references += 1;
      if (e.studios.indexOf(r.studio) < 0) e.studios.push(r.studio);
    });
    // Un commercial qui n'a QUE des VNI ce mois-là doit pouvoir être choisi.
    vniDuRapport(rapport).liste.forEach((l) => {
      if (!l.commercialId) return;
      const e = entree('id:' + l.commercialId, l.commercial || '', l.commercialId);
      if (!e.commercial) e.commercial = l.commercial || '';
      e.vni += 1;
      if (e.studios.indexOf(l.studio) < 0) e.studios.push(l.studio);
    });
    // … et un commercial qui n'est responsable QUE de non-reconduits aussi.
    nonReconduitsDuRapport(rapport).forEach((l) => {
      const a = attributionNonReconduit(l);
      if (!a.cle) return;
      const e = entree(a.cle, a.nom, a.commercialId);
      if (!e.commercial) e.commercial = a.nom;
      e.nonReconduits += 1;
      if (e.studios.indexOf(l.studio) < 0) e.studios.push(l.studio);
    });
    return [...par.values()].sort((a, b) => b.ventes - a.ventes || b.references - a.references || b.vni - a.vni || b.nonReconduits - a.nonReconduits
      || a.commercial.localeCompare(b.commercial, 'fr'));
  }

  // Les commerciaux proposables pour un non-reconduit : ceux du mois + ceux de la
  // table (un commercial sans activité ce mois-ci reste choisissable). Jamais
  // « Pas de commercial » ni un nom vide.
  function commerciauxAttribuables(rapport) {
    const par = new Map();
    commerciauxDuRapport(rapport).forEach((c) => {
      const nom = libelleCommercial(c.commercial);
      if (!nom || /^pas de commercial$/i.test(nom)) return;
      par.set(c.cle, { cle: c.cle, nom });
    });
    Object.keys(VENDEURS_DECIPLUS).forEach((k) => {
      const e = VENDEURS_DECIPLUS[k];
      if (!par.has('id:' + e.id)) par.set('id:' + e.id, { cle: 'id:' + e.id, nom: e.nom });
    });
    return [...par.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  }

  // Le bilan consolidé d'UN commercial, tous studios confondus.
  //  ⚠️ DEUX COMPTES À NE PAS CONFONDRE :
  //   · `signees` = tout ce qu'il a signé dans le mois, ANNULÉES COMPRISES. Ce
  //     que la vue affiche, parce qu'on contrôle tout ce qui a été vendu ;
  //   · `total`   = ses ventes ACTIVES, et donc le dénominateur du taux. Une
  //     annulation ne pénalise pas sa saisie CRM.
  //  Les PRISES DE RÉFÉRENCE s'ajoutent à côté : un repère, qui n'entre dans
  //  aucun taux. Additionnées sur tous ses studios, par identifiant d'auteur.
  function consoliderCommercial(rapport, commercial) {
    const cle = normCle(commercial);
    const ventes = ventesDuRapport(rapport).filter((v) => cleCommercial(v) === cle);
    // Annulées en dernier : la vue se lit d'abord sur ce qui compte.
    ventes.sort((a, b) => (a.annulee ? 1 : 0) - (b.annulee ? 1 : 0)
      || (a.studio || '').localeCompare(b.studio || '', 'fr')
      || (a.client || '').localeCompare(b.client || '', 'fr'));
    const refs = referencesDuRapport(rapport);
    const references = cle.indexOf('id:') === 0
      ? refs.liste.filter((r) => 'id:' + r.createurId === cle).sort((a, b) => versIso(a.date).localeCompare(versIso(b.date))
        || (a.studio || '').localeCompare(b.studio || '', 'fr'))
      : [];
    const annulees = ventes.filter((v) => v.annulee).length;
    const actives = ventes.length - annulees;
    const retrouves = ventes.filter((v) => !v.annulee && v.retrouve).length;
    const vniR = vniDuRapport(rapport);
    const vni = cle.indexOf('id:') === 0
      ? vniR.liste.filter((l) => 'id:' + l.commercialId === cle) : [];
    const studios = ventes.concat(references).concat(vni).reduce((acc, v) => (acc.indexOf(v.studio) < 0 ? acc.concat([v.studio]) : acc), []);
    return {
      commercial,
      cle,
      commercialId: cle.indexOf('id:') === 0 ? cle.slice(3) : '',
      nom: (ventes[0] && ventes[0].commercial) || (references[0] && references[0].createur) || (vni[0] && vni[0].commercial) || (cle.indexOf('nom:') === 0 ? cle.slice(4) : ''),
      ventes,
      signees: ventes.length,
      annulees,
      total: actives,
      retrouves,
      aVerifier: actives - retrouves,
      studios,
      // Pas de vente active -> pas de dénominateur -> taux null, jamais 0 % ni
      // NaN. Des annulations seules ne créent pas un taux : rien à retrouver.
      taux: actives > 0 ? retrouves / actives : null,
      // Le 2e KPI « contrats validés » du commercial (même règle que la carte studio).
      valides: contratsValides(ventes).valides,
      tauxValides: contratsValides(ventes).taux,
      references,
      referencesPresentes: refs.presentes,
      referencesIndisponibles: refs.indisponibles,
      // VNI du commercial (dernier RDV venu du mois), tous studios confondus.
      vni, vniPresents: vniR.presents, vniIndisponibles: vniR.indisponibles,
    };
  }
  const versIso = (fr) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(fr || '')); return m ? m[3] + '-' + m[2] + '-' + m[1] : ''; };

  // ── SITE DECIPLUS DIVERGENT ────────────────────────────────────────────────
  //  La vente est portée par un studio dans Fitness Booster, mais Deciplus l'a
  //  enregistrée sur un AUTRE site (ex. FB Marcq, Deciplus Wasquehal).
  //  ⚠️ C'EST UNE ANOMALIE À CORRIGER, PAS UN ÉCHEC : le client est bien
  //  retrouvé, la vente reste « Retrouvée » et compte dans le taux. Ce test ne
  //  change AUCUN compteur — il sert uniquement à le signaler à l'écran.
  //  Ne s'applique qu'à une vente retrouvée avec un site connu : une annulée,
  //  un « à vérifier » ou une validation manuelle sans site n'ont rien à comparer.
  //  Un site Deciplus qui ne correspond à aucun des 6 studios est lui aussi
  //  divergent — on ne peut pas le rattacher au studio attendu.
  //  Rend { attendu, site } ou null.
  function siteDivergent(vente, studioAttendu) {
    if (!vente || vente.annulee || !vente.retrouve) return null;
    const site = String(vente.site == null ? '' : vente.site).trim();
    const attendu = studioAttendu || vente.studio || '';
    if (!site || !attendu) return null;
    return studioLabel(site) === attendu ? null : { attendu, site };
  }

  // ── CONTRATS VALIDÉS (2e KPI) ──────────────────────────────────────────────
  //  Une vente ACTIVE (non annulée) est VALIDÉE si au moins une condition est vraie :
  //   · « automatique »   : retrouvée dans Deciplus par la collecte ;
  //   · « rapprochement » : rapprochement Deciplus confirmé à la main ;
  //   · « prelevement »   : case Prélèvement cochée à la main ;
  //   · « verification »  : vente « à vérifier » VÉRIFIÉE à la main par un
  //                         administrateur (lib/recap2Verifications.js), après
  //                         contrôle humain. `retrouve` reste faux : le statut
  //                         affiché dit « Vérifiée », jamais « Retrouvée ».
  //  Une seule condition suffit, et une vente ne compte qu'UNE fois.
  //
  //  ⚠️ LA VALIDATION MANUELLE COMPLÈTE L'AUTOMATISATION, ELLE NE LA REMPLACE
  //  JAMAIS : `retrouve` reste la donnée de la collecte, intacte. Une vente
  //  validée par Prélèvement continue d'être cherchée à chaque collecte ; si elle
  //  est retrouvée ensuite, son motif devient « automatique » et la case reste
  //  cochée. Réservation ne valide rien. Calculé à la lecture, depuis les lignes :
  //  cocher ou décocher Prélèvement se voit immédiatement.
  const prelevementCoche = (v) => !!(v && v.controle && v.controle.prelevement === true);
  function motifValidation(v) {
    if (!v || v.annulee) return '';
    if (v.retrouve === true) return v.valideManuellement ? 'rapprochement' : 'automatique';
    if (v.verification && v.verification.verifiee === true) return 'verification';
    return prelevementCoche(v) ? 'prelevement' : '';
  }
  const venteValidee = (v) => motifValidation(v) !== '';
  // { actives, valides, parPrelevement, taux } sur la liste d'un studio (ou toute liste de ventes).
  function contratsValides(liste) {
    const actives = (liste || []).filter((v) => v && !v.annulee);
    const valides = actives.filter(venteValidee).length;
    return {
      actives: actives.length,
      valides,
      parPrelevement: actives.filter((v) => motifValidation(v) === 'prelevement').length,
      parVerification: actives.filter((v) => motifValidation(v) === 'verification').length,
      // Aucune vente active -> pas de dénominateur -> null, jamais 0 %.
      taux: actives.length ? valides / actives.length : null,
    };
  }

  // ── CA NET DU MOIS, PAR STUDIO ─────────────────────────────────────────────
  //  Un REPÈRE affiché à côté du nom du studio. PAS UN KPI : il n'entre dans
  //  aucun taux, aucun compteur, aucun contrôle.
  //
  //  Ce qu'il vaut : la somme de TOUS les encaissements Deciplus portés sur le
  //  site du studio pendant le mois audité (rapport.mois), remboursements et
  //  décaissements déduits. Toutes ventes confondues — pas seulement celles
  //  signées ce mois-là. Indépendant de tout commercial.
  //
  //  D'où il vient : AUCUN recalcul. La collecte recompte déjà, studio par
  //  studio, le CSV brut du mois (source.deciplus_M.controleParStudio) :
  //    · `sommeBrute`          = lignes AVEC adhérent ;
  //    · `montantSansAdherent` = lignes SANS adhérent, écartées des KPI mais
  //                              bien encaissées (225 € chez Lille en juillet).
  //  Le CA est leur somme. Dans l'export, un décaissement ou un remboursement
  //  porte déjà un montant NÉGATIF (vérifié le 2026-09-14 : 128/128 décaissements
  //  d'août négatifs, aucun positif) : la somme brute EST le net.
  //
  //  ⚠️ MOIS PAS ENCORE CLOS. L'export est filtré sur le mois ENTIER (01 → 30/09)
  //  même collecté le 13/09 : sa période ne dit donc rien. C'est la date de
  //  collecte (`genere`) qui le dit. Collecté avant la fin du mois -> `partielAu`
  //  = « 13/09 », et l'écran l'affiche : un CA partiel ne passe pas pour un mois.
  //
  //  Rend { montant, lignes, partielAu } ou null — jamais un faux 0 € :
  //    · pas de recomptage pour ce mois (rapport d'une autre forme) ;
  //    · recomptage en échec pour ce studio (lignes perdues, sommes divergentes) ;
  //    · montants illisibles.
  function caNetStudio(rapport, studio) {
    const src = rapport && rapport.source && rapport.mois ? rapport.source['deciplus_' + rapport.mois] : null;
    const c = src && src.controleParStudio ? src.controleParStudio[studio] : null;
    if (!c || c.ok !== true) return null;
    const avec = Number(c.sommeBrute);
    const sans = c.montantSansAdherent == null ? 0 : Number(c.montantSansAdherent);
    if (typeof c.sommeBrute !== 'number' || !Number.isFinite(avec) || !Number.isFinite(sans)) return null;
    const lignes = (Number(c.lignesBrutes) || 0) + (Number(c.lignesSansAdherent) || 0);
    // Au centime (« + 0 » : pas de -0 sur une somme nulle de négatifs).
    return { montant: Math.round((avec + sans) * 100) / 100 + 0, lignes, partielAu: collecteAvantFinDeMois(rapport) };
  }

  // « JJ/MM » si la collecte a eu lieu avant le 1er du mois suivant (heure
  // locale), sinon null. Date de collecte absente ou illisible -> null : on ne
  // prétend rien.
  function collecteAvantFinDeMois(rapport) {
    const m = /^(\d{4})-(\d{2})$/.exec(String(rapport.mois || ''));
    const g = rapport.genere ? new Date(rapport.genere) : null;
    if (!m || !g || isNaN(g)) return null;
    if (g >= new Date(Number(m[1]), Number(m[2]), 1)) return null;
    return String(g.getDate()).padStart(2, '0') + '/' + String(g.getMonth() + 1).padStart(2, '0');
  }

  // « 22 363 € » : arrondi à l'euro, milliers séparés par une espace fine
  // insécable (le montant ne se coupe jamais en fin de ligne).
  function eurosArrondis(n) {
    const v = Math.round(Number(n) || 0) + 0;
    return (v < 0 ? '−' : '') + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €';
  }

  // Libellé d'AFFICHAGE : espaces multiples réduits, extrémités coupées. Ne
  // sert JAMAIS de clé — deux commerciaux distincts gardent deux entrées même
  // si leur libellé nettoyé se ressemble.
  const libelleCommercial = (nom) => String(nom == null ? '' : nom).replace(/\s+/g, ' ').trim();

  // ── Assemblage d'un studio, disponibilité comprise ─────────────────────────
  // Convention d'entrée : `null` = import ABSENT (rien n'a jamais été déposé) ;
  // `[]` = import présent mais vide (ex. aucun contrat signé ce mois-là). Les
  // deux cas ne se disent pas pareil à l'écran, donc ils ne se confondent pas ici.
  // ── IDENTIFIANT DECIPLUS D'UNE VENTE ──────────────────────────────────────
  //  Priorité validée par Stan le 2026-09-16 :
  //    1. `idDeciplusVendor` — l'Id Deciplus de la fiche Vendor du contact de la
  //       vente (chaînage vente -> contact -> Id Deciplus, sans nom) ;
  //    2. `idClient`         — vente RETROUVÉE dans le journal Deciplus du mois ;
  //    3. `ficheId`          — fiche trouvée par identité exacte ET unique.
  //  Deux sources fiables qui DIVERGENT -> `aTrancher`, id vide : on ne choisit
  //  jamais. `candidatId` (quasi-homonyme) n'est JAMAIS une source. Aucun repli
  //  sur le nom. N'influence aucun KPI : `retrouve` et `idClient` sont inchangés.
  function identifiantDeciplus(ligne) {
    const l = ligne || {};
    const ok = (x) => /^[0-9]{1,20}$/.test(String(x == null ? '' : x));
    const sources = [];
    if (ok(l.idDeciplusVendor)) sources.push({ source: 'vendor', id: String(l.idDeciplusVendor) });
    if (l.retrouve === true && l.annulee !== true && ok(l.idClient)) sources.push({ source: 'journal', id: String(l.idClient) });
    if (ok(l.ficheId)) sources.push({ source: 'fiche', id: String(l.ficheId) });
    if (!sources.length) return { id: '', source: '', aTrancher: false, sources };
    if (new Set(sources.map((x) => x.id)).size > 1) return { id: '', source: '', aTrancher: true, sources };
    return { id: sources[0].id, source: sources[0].source, aTrancher: false, sources };
  }

  function analyserStudio({ encM1, encM, contratsM1 } = {}) {
    const manqueNR = [];
    if (!Array.isArray(encM1)) manqueNR.push('encM1');
    if (!Array.isArray(encM)) manqueNR.push('encM');
    const manqueC = [];
    if (!Array.isArray(contratsM1)) manqueC.push('contratsM1');
    if (!Array.isArray(encM)) manqueC.push('encM');
    return {
      nonReconduction: manqueNR.length
        ? { dispo: false, manque: manqueNR }
        : Object.assign({ dispo: true }, nonReconduction({ encM1, encM })),
      completion: manqueC.length
        ? { dispo: false, manque: manqueC }
        : Object.assign({ dispo: true }, completion({ contratsM1, encM })),
    };
  }

  // ── SUIVI DES NON-RECONDUCTIONS : INDICATEURS (bloc DISTINCT) ─────────────
  //  Le taux de non-reconduction (encaissements) n'est PAS touché : ces
  //  indicateurs lisent le statut EFFECTIF de chaque dossier — décision
  //  manuelle, sinon statut automatique du contrôle — un seul par dossier, donc
  //  aucun double compte (la somme des statuts = les non-reconduits détectés).
  //  Taux de récupération : COHORTE figée au premier contrôle concluant
  //  (lib/recap2NrControles.js) — récupérés parmi les éligibles ; le
  //  dénominateur ne change plus, les exclusions restent comptées par motif.
  const STATUTS_SUIVI_NR = ['a_traiter', 'sous_controle', 'resilie', 'reconduit_autrement', 'toujours_actif', 'suspendu', 'recupere', 'depart_confirme', 'a_creuser'];
  // Registre unique (public/recap2-regles.js) : statut effectif (contentieux et
  // rétractation priment sur une décision manuelle), déménagement récupérable.
  const recupOuverte = (l) => Regles.recuperationOuverte(l);
  const statutEffectifNR = (l) => Regles.statutEffectifNR(l);
  function indicateursNR(liste) {
    const L = liste || [];
    const n = {}; STATUTS_SUIVI_NR.concat(['non_controle']).forEach((s) => { n[s] = 0; });
    L.forEach((l) => { n[statutEffectifNR(l)] = (n[statutEffectifNR(l)] || 0) + 1; });
    const cohorte = L.filter((l) => l.cohorte);   // requalifiée à la lecture (lib/recap2NrControles.js)
    const eligibles = cohorte.filter((l) => l.cohorte.eligible === true);
    const recupEligibles = eligibles.filter((l) => statutEffectifNR(l) === 'recupere');
    const exclus = {};
    cohorte.filter((l) => l.cohorte.eligible === false).forEach((l) => { const m = l.cohorte.motifExclusion || 'autre'; exclus[m] = (exclus[m] || 0) + 1; });
    // Finance : exactement ce que le registre affiche — une décision manuelle
    // ne masque jamais une anomalie financière (arbitrage du 18/09/2026).
    let aVerifier = 0, nbEcarts = 0, divergences = 0;
    L.forEach((l) => {
      const f = l.analyse && l.analyse.finance;
      const items = f ? Regles.evaluerNR(l) : [];
      if (items.some((x) => x.regle === 'FIN-IMPOSSIBLE')) divergences += 1;
      if (items.some((x) => x.regle === 'FIN-ECART')) { aVerifier += Number(f.ecart); nbEcarts += 1; }
    });
    let chiffre = 0, chiffreInconnu = 0;
    L.filter((l) => statutEffectifNR(l) === 'recupere').forEach((l) => {
      const m = l.analyse && l.analyse.reconduction && l.analyse.reconduction.mensuel;
      if (m != null) chiffre += Number(m); else chiffreInconnu += 1;
    });
    const causes = {};
    L.filter((l) => ['a_traiter', 'sous_controle', 'resilie', 'depart_confirme', 'recupere'].indexOf(statutEffectifNR(l)) > -1 && l.analyse && l.analyse.cause)
      .forEach((l) => { const q = Regles.requalifierNR(l.analyse); const c = q.contentieux ? 'Contentieux' : q.cause.libelle; causes[c] = (causes[c] || 0) + 1; });
    return {
      detectees: L.length, parStatut: n,
      veritables: L.length - n.toujours_actif - n.reconduit_autrement - n.suspendu,
      resiliations: n.resilie + n.depart_confirme,
      // « dont contentieux » : la donnée Deciplus seule, jamais un statut manuel.
      contentieux: L.filter((l) => l.analyse && l.analyse.contentieux).length,
      suspensions: n.suspendu, reconductions: n.reconduit_autrement, toujoursActifs: n.toujours_actif,
      // « À récupérer » = possibilité commerciale ENCORE OUVERTE : À traiter, Sous
      // contrôle, et les « Résilié » manuels dont le déménagement reste
      // récupérable. Ces derniers restent aussi comptés dans « Résiliations »
      // (décision humaine visible) : deux indicateurs différents, jamais deux
      // fois dans le même.
      aRecuperer: n.a_traiter + n.sous_controle + L.filter((l) => statutEffectifNR(l) === 'resilie' && l.suivi && l.suivi.statut === 'resilie' && recupOuverte(l)).length,
      dontResilieRecuperable: L.filter((l) => statutEffectifNR(l) === 'resilie' && l.suivi && l.suivi.statut === 'resilie' && recupOuverte(l)).length,
      aCreuser: n.a_creuser, recuperes: n.recupere,
      cohorte: { eligibles: eligibles.length, recuperes: recupEligibles.length, enAttente: cohorte.filter((l) => l.cohorte.eligible === null).length, exclus,
        taux: eligibles.length ? recupEligibles.length / eligibles.length : null },
      chiffreMensuelRecupere: Math.round(chiffre * 100) / 100, chiffreInconnu,
      montantAVerifier: Math.round(aVerifier * 100) / 100, nbEcarts, divergences,
      causes: Object.entries(causes).sort((a, b) => b[1] - a[1]),
      suggestions: L.filter((l) => l.suggestion === 'recupere' && statutEffectifNR(l) !== 'recupere').length,
    };
  }

  return {
    STUDIOS, LABELS, normStudio, studioLabel,
    nonReconduction, completion, clientsRetrouves, analyserStudio,
    ventesDuRapport, commerciauxDuRapport, vniDuRapport, consoliderCommercial, libelleCommercial, referencesDuRapport, cleCommercial,
    siteDivergent, caNetStudio, eurosArrondis, contratsValides, motifValidation, venteValidee,
    VENDEURS_DECIPLUS, commercialDuVendeurDeciplus, attributionAutomatique, attributionNonReconduit, nonReconduitsDuRapport,
    STATUTS_SUIVI_NR, statutEffectifNR, indicateursNR,
    commerciauxAttribuables, identifiantDeciplus,
  };
}));
