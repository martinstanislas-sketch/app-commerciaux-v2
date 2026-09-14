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
  const api = factory(R);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Recap2Metrics = api;
}(typeof self !== 'undefined' ? self : this, function (Retention) {

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
      dateAnnulation: a.dateAnnulation || '',
      annulee: true,
      retrouve: false,
      site: null,
      dateVente: '',
      idClient: '',
      encaisse: false,
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

  // Les commerciaux présents dans les ventes du mois, dérivés des données.
  // Rendus avec leur compte, pour que le sélecteur puisse les ordonner.
  function commerciauxDuRapport(rapport) {
    const par = new Map();
    ventesDuRapport(rapport).forEach((v) => {
      const nom = String(v.commercial == null ? '' : v.commercial);
      if (!par.has(nom)) par.set(nom, { commercial: nom, ventes: 0, annulees: 0, retrouves: 0, studios: [] });
      const e = par.get(nom);
      e.ventes += 1;
      if (v.annulee) e.annulees += 1;
      else if (v.retrouve) e.retrouves += 1;
      if (e.studios.indexOf(v.studio) < 0) e.studios.push(v.studio);
    });
    return [...par.values()].sort((a, b) => b.ventes - a.ventes
      || a.commercial.localeCompare(b.commercial, 'fr'));
  }

  // Le bilan consolidé d'UN commercial, tous studios confondus.
  //  ⚠️ DEUX COMPTES À NE PAS CONFONDRE :
  //   · `signees` = tout ce qu'il a signé dans le mois, ANNULÉES COMPRISES. Ce
  //     que la vue affiche, parce qu'on contrôle tout ce qui a été vendu ;
  //   · `total`   = ses ventes ACTIVES, et donc le dénominateur du taux. Une
  //     annulation ne pénalise pas sa saisie CRM.
  function consoliderCommercial(rapport, commercial) {
    const ventes = ventesDuRapport(rapport).filter((v) => v.commercial === commercial);
    // Annulées en dernier : la vue se lit d'abord sur ce qui compte.
    ventes.sort((a, b) => (a.annulee ? 1 : 0) - (b.annulee ? 1 : 0)
      || (a.studio || '').localeCompare(b.studio || '', 'fr')
      || (a.client || '').localeCompare(b.client || '', 'fr'));
    const annulees = ventes.filter((v) => v.annulee).length;
    const actives = ventes.length - annulees;
    const retrouves = ventes.filter((v) => !v.annulee && v.retrouve).length;
    return {
      commercial,
      ventes,
      signees: ventes.length,
      annulees,
      total: actives,
      retrouves,
      aVerifier: actives - retrouves,
      studios: ventes.reduce((acc, v) => (acc.indexOf(v.studio) < 0 ? acc.concat([v.studio]) : acc), []),
      // Pas de vente active -> pas de dénominateur -> taux null, jamais 0 % ni
      // NaN. Des annulations seules ne créent pas un taux : rien à retrouver.
      taux: actives > 0 ? retrouves / actives : null,
    };
  }

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

  // Libellé d'AFFICHAGE : espaces multiples réduits, extrémités coupées. Ne
  // sert JAMAIS de clé — deux commerciaux distincts gardent deux entrées même
  // si leur libellé nettoyé se ressemble.
  const libelleCommercial = (nom) => String(nom == null ? '' : nom).replace(/\s+/g, ' ').trim();

  // ── Assemblage d'un studio, disponibilité comprise ─────────────────────────
  // Convention d'entrée : `null` = import ABSENT (rien n'a jamais été déposé) ;
  // `[]` = import présent mais vide (ex. aucun contrat signé ce mois-là). Les
  // deux cas ne se disent pas pareil à l'écran, donc ils ne se confondent pas ici.
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

  return {
    STUDIOS, LABELS, normStudio, studioLabel,
    nonReconduction, completion, clientsRetrouves, analyserStudio,
    ventesDuRapport, commerciauxDuRapport, consoliderCommercial, libelleCommercial,
    siteDivergent,
  };
}));
