'use strict';
// ============================================================================
//  RECAP 2 — écran minimal : 6 studios, 2 chiffres chacun.
//
//  COUCHE D'AFFICHAGE, ET RIEN D'AUTRE. Les chiffres sont produits en amont par
//  la collecte (crm-automation, sur le Mac), déposés sur le serveur par
//  recap2-envoi.js dans $DB_DIR/recap2/, et servis en lecture seule :
//  GET /api/recap2/AAAA-MM  (route admin).
//
//  ⚠️ ON NE RECALCULE RIEN ICI. Le JSON porte les résultats définitifs ; créer
//  une seconde logique métier dans le navigateur, c'est se garantir deux
//  vérités qui divergeront. On se limite à des CONTRÔLES DE COHÉRENCE (le mois
//  correspond, les 6 studios sont là, les nombres sont des nombres, le taux
//  colle au rapport numérateur/dénominateur) : si l'un échoue, on le dit au
//  lieu d'afficher un chiffre en lequel personne ne peut avoir confiance.
//
//  ⚠️ AUCUNE ÉCRITURE, NULLE PART. Ni base, ni fichier. RECAP 2 ne touche pas
//  aux tables retention_* de l'ancien RECAP, qui reste intact et indépendant.
//
//  Règles métier (fixées et validées ailleurs, rappelées ici pour la lecture) :
//   · non-reconduction = clients uniques au net M-1 > 0 SANS net M > 0, sur les
//     clients uniques au net M-1 > 0. Rapprochement M-1 ↔ M par Id membre Deciplus.
//   · complétion = signataires uniques valides de M-1 ayant un net M > 0, sur
//     les signataires uniques valides de M-1. Source de vérité : Fitness Booster.
//     Ventes annulées exclues ; plusieurs contrats d'une même personne = 1.
// ============================================================================

const Recap2UI = (function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const T = () => (window.localStorage.getItem('authToken') || '');
  const H = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + T() });
  // L'ordre des studios vient du module partagé : une seule liste de référence.
  const LABELS = (window.Recap2Metrics && window.Recap2Metrics.LABELS)
    || ['Lille', 'Wasquehal', 'Marcq', 'Boulogne', 'Levallois', 'Neuilly'];

  let mois = '', inited = false;
  let etat = 'vide';        // 'vide' | 'chargement' | 'ok' | 'absent' | 'erreur'
  let rapport = null;       // le JSON tel que servi
  let message = '';         // texte d'erreur / de fichier attendu
  let ouvert = '';          // détail ouvert : '<studio>|nr' ou '<studio>|crm'
  let filtreComp = {};      // studio -> 'tous' | 'payes' | 'nonpayes'   (règle v1)
  let filtreCrm = {};       // studio -> 'tous' | 'retrouves' | 'verifier' (règle v2)

  // La RÈGLE MÉTIER qui a produit le rapport affiché.
  //  v1 (clé absente) : 2e KPI = « complétion » (contrats de M-1 ayant payé en M)
  //  v2               : 2e KPI = « clients retrouvés dans Deciplus » (signataires
  //                     de M présents dans le journal des ventes de M)
  // ⚠️ Les rapports de juin/juillet/août d'avant le changement sont en v1. On ne
  // doit JAMAIS afficher leurs chiffres sous le libellé de la v2 : ils ne
  // répondent pas à la même question.
  const versionMetier = () => ((rapport && Number.isFinite(rapport.businessVersion)) ? rapport.businessVersion : 1);
  const estV2 = () => versionMetier() >= 2;
  let alertesOuvertes = false;
  // Commercial sélectionné : '' = tous. La valeur est la chaîne EXACTE fournie
  // par Fitness Booster, jamais un libellé nettoyé — deux commerciaux dont les
  // noms diffèrent ne doivent pas se retrouver confondus par le filtre.
  let commercial = '';
  let filtreCom = 'tous';   // 'tous' | 'retrouves' | 'verifier'
  let refsOuvertes = false; // détail des prises de référence du commercial

  function open() {
    if (!inited) { wire(); inited = true; }
    if (!$('#rec2-mois').value) $('#rec2-mois').value = moisParDefaut();
    mois = $('#rec2-mois').value;
    charger();
  }

  function wire() {
    $('#rec2-mois').addEventListener('change', () => {
      mois = $('#rec2-mois').value; ouvert = ''; alertesOuvertes = false;
      commercial = ''; filtreCom = 'tous'; refsOuvertes = false; charger();
    });
    $('#rec2-body').addEventListener('click', onBodyClick);
    // Les cases de contrôle : `change`, pour ne réagir qu'à un vrai basculement.
    $('#rec2-body').addEventListener('change', (e) => {
      const box = e.target.closest && e.target.closest('input[data-ctl]');
      if (box && rapport) { enregistrerControle(box); return; }
      const resil = e.target.closest && e.target.closest('input[data-resil]');
      if (resil && rapport) basculerResiliation(resil);
    });
    const sel = $('#rec2-commercial');
    if (sel) sel.addEventListener('change', () => { commercial = sel.value; filtreCom = 'tous'; refsOuvertes = false; ouvert = ''; render(); });
  }

  // Le sélecteur est rempli DEPUIS LE RAPPORT : aucun nom en dur. Il n'apparaît
  // que sur un rapport v2 — la règle v1 n'a pas de commercial dans son détail.
  function majSelecteurCommercial() {
    const wrap = $('#rec2-commercial-wrap');
    const sel = $('#rec2-commercial');
    if (!wrap || !sel) return;
    const dispo = (etat === 'ok' && rapport && estV2());
    wrap.hidden = !dispo;
    if (!dispo) { commercial = ''; sel.innerHTML = ''; return; }
    const MM = window.Recap2Metrics;
    const liste = MM ? MM.commerciauxDuRapport(rapport) : [];
    // Si le commercial retenu n'existe pas dans ce mois, on retombe sur « tous »
    // plutôt que d'afficher une vue vide sans l'expliquer.
    //  La valeur d'une option est la CLÉ du commercial (son identifiant Vendor) ;
    //  le nom n'est que le texte affiché.
    if (commercial && !liste.some((c) => c.cle === commercial)) commercial = '';
    const avecIds = liste.some((c) => c.commercialId);
    const opts = ['<option value="">Tous les commerciaux</option>'].concat(liste.map((c) => {
      const lbl = (MM.libelleCommercial(c.commercial) || '(sans nom)')
        + (avecIds && !c.commercialId && !/^pas de commercial$/i.test(String(c.commercial).trim()) ? ' — identifiant Vendor manquant' : '');
      return '<option value="' + esc(c.cle) + '"' + (c.cle === commercial ? ' selected' : '') + '>'
        + esc(lbl) + ' (' + c.ventes + ')</option>';
    }));
    sel.innerHTML = opts.join('');
    sel.value = commercial;
  }

  // Mois par défaut = dernier mois calendaire révolu.
  function moisParDefaut() {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function moisLabel(ym) {
    const [a, m] = String(ym || '').split('-').map(Number);
    if (!a || !m) return ym || '';
    return new Date(a, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }
  const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

  // ── CHARGEMENT ──────────────────────────────────────────────────────────────
  async function charger() {
    etat = 'chargement'; rapport = null; message = ''; editionResil = null; render();
    try {
      const r = await fetch('/api/recap2/' + mois, { headers: H() });
      const j = await r.json().catch(() => null);
      if (r.status === 404) {
        etat = 'absent';
        message = (j && j.fichierAttendu) ? j.fichierAttendu : '';
      } else if (!r.ok) {
        etat = 'erreur'; message = (j && j.error) || ('HTTP ' + r.status);
      } else {
        rapport = j; etat = 'ok';
      }
    } catch (_) { etat = 'erreur'; message = 'réseau indisponible'; }
    render();
  }

  // ── CONTRÔLES DE COHÉRENCE (on vérifie, on ne recalcule pas) ────────────────
  const estNombre = (x) => typeof x === 'number' && Number.isFinite(x);
  // Le taux annoncé doit correspondre au rapport affiché, à l'arrondi près.
  function tauxCoherent(taux, num, den) {
    if (!estNombre(num) || !estNombre(den) || den <= 0) return taux == null;
    if (!estNombre(taux)) return false;
    return Math.abs(taux - num / den) < 0.0005;
  }
  // Renvoie la liste des incohérences d'un bloc studio (vide = tout va bien).
  function incoherences(bloc) {
    const pb = [];
    const nr = bloc && bloc.nonReconduction;
    if (nr) {
      if (!estNombre(nr.base) || !estNombre(nr.nonReconduits)) pb.push('non-reconduction : compteurs non numériques');
      else if (nr.nonReconduits > nr.base) pb.push('non-reconduction : plus de perdus que de base');
      else if (!tauxCoherent(nr.taux, nr.nonReconduits, nr.base)) pb.push('non-reconduction : taux incohérent avec ' + nr.nonReconduits + '/' + nr.base);
    }
    const co = bloc && bloc.completion;
    if (co) {
      if (!estNombre(co.contratsValides) || !estNombre(co.ontPaye)) pb.push('complétion : compteurs non numériques');
      else if (co.ontPaye > co.contratsValides) pb.push('complétion : plus de payés que de contrats');
      else if (!tauxCoherent(co.taux, co.ontPaye, co.contratsValides)) pb.push('complétion : taux incohérent avec ' + co.ontPaye + '/' + co.contratsValides);
    }
    const cr = bloc && bloc.clientsRetrouves;
    if (cr) {
      if (!estNombre(cr.signataires) || !estNombre(cr.retrouves)) pb.push('clients retrouvés : compteurs non numériques');
      else if (cr.retrouves > cr.signataires) pb.push('clients retrouvés : plus de retrouvés que de signataires');
      else if (!tauxCoherent(cr.taux, cr.retrouves, cr.signataires)) pb.push('clients retrouvés : taux incohérent avec ' + cr.retrouves + '/' + cr.signataires);
    }
    return pb;
  }

  // ── RENDU ───────────────────────────────────────────────────────────────────
  const pct = (x) => (x == null ? '—' : (x * 100).toFixed(1).replace('.', ',') + ' %');
  const eur = (n) => (Number(n) || 0).toFixed(2).replace('.', ',') + ' €';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function fmtDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return String(iso || '');
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function render() {
    const host = $('#rec2-body'); if (!host) return;
    const sub = $('#rec2-sub');
    if (sub) {
      sub.textContent = (etat === 'ok' && rapport)
        ? (estV2()
          ? 'Contrôle de ' + moisLabel(rapport.mois) + ' · base ' + moisLabel(rapport.m1) + ' · 6 studios en propre'
          : 'Passage ' + moisLabel(rapport.m1) + ' → ' + moisLabel(rapport.mois) + ' · 6 studios en propre (ancienne règle)')
        : (mois ? moisLabel(mois) : '');
    }
    if (etat === 'chargement') { host.innerHTML = '<p class="rec2-info">Chargement…</p>'; return; }
    if (etat === 'absent') {
      host.innerHTML = '<div class="rec2-vide"><p class="rec2-vide-t">Données non encore collectées pour ce mois.</p>'
        + (message ? '<p class="rec2-vide-s">Fichier attendu : <code>' + esc(message) + '</code></p>' : '')
        + '<p class="rec2-vide-s">Sur le Mac : <code>node crm-automation/recap2-collecte.js ' + esc(mois) + '</code>'
        + ' puis <code>node crm-automation/recap2-envoi.js ' + esc(mois) + '</code></p></div>';
      return;
    }
    if (etat === 'erreur') { host.innerHTML = '<p class="rec2-info rec2-info-err">Lecture impossible' + (message ? ' — ' + esc(message) : '') + '.</p>'; return; }
    if (!rapport) { host.innerHTML = ''; return; }

    majSelecteurCommercial();
    host.innerHTML = bandeauSource() + bandeauAlertes() + vueCommercial() + LABELS.map(blocStudio).join('');
  }

  // Fraîcheur + provenance, discrets, en haut.
  function bandeauSource() {
    const manquants = LABELS.filter((s) => !(rapport.studios && rapport.studios[s]));
    return '<div class="rec2-meta">'
      + '<span>Données actualisées le <b>' + esc(fmtDate(rapport.genere)) + '</b></span>'
      + '<span class="rec2-meta-src">Source : Deciplus + Fitness Booster</span>'
      + (manquants.length ? '<span class="rec2-meta-ko">⚠ studio(s) absent(s) du fichier : ' + esc(manquants.join(', ')) + '</span>' : '')
      + '</div>';
  }

  // Un seul indicateur discret ; le détail s'ouvre au clic.
  function bandeauAlertes() {
    const liste = [];
    LABELS.forEach((s) => {
      const b = (rapport.studios || {})[s];
      (b && b.avertissements || []).forEach((a) => liste.push({ studio: s, texte: a }));
      incoherences(b).forEach((a) => liste.push({ studio: s, texte: 'cohérence — ' + a }));
    });
    Object.keys(rapport.source || {}).forEach((k) => {
      ((rapport.source[k] || {}).avertissements || []).forEach((a) => liste.push({ studio: k, texte: a }));
    });
    (rapport.erreurs || []).forEach((e) => liste.push({ studio: 'collecte', texte: e, bloquant: true }));
    if (!liste.length) return '';
    const n = liste.length;
    return '<div class="rec2-alertes">'
      + '<button type="button" class="rec2-alertes-btn" data-alertes="1" aria-expanded="' + (alertesOuvertes ? 'true' : 'false') + '">'
      + '⚠ ' + n + ' contrôle' + (n > 1 ? 's' : '') + ' à vérifier</button>'
      + (alertesOuvertes ? '<ul class="rec2-alertes-liste">'
        + liste.map((a) => '<li><b>' + esc(a.studio) + '</b> — ' + esc(a.texte) + '</li>').join('') + '</ul>' : '')
      + '</div>';
  }

  function blocStudio(label) {
    const b = (rapport.studios || {})[label];
    const t2 = titre2();
    let corps;
    if (!b) {
      corps = '<div class="rec2-cards">' + carteNA('NON-RECONDUCTION', 'studio absent du fichier de collecte')
        + carteNA(t2, 'studio absent du fichier de collecte') + '</div>';
    } else if (b.controleBloquant && b.controleBloquant.ok === false) {
      // Contrôle bloquant : on n'affiche AUCUN chiffre pour ce studio.
      const r = (b.controleBloquant.raisons || []).join(' · ');
      corps = '<div class="rec2-cards">' + carteNA('NON-RECONDUCTION', r) + carteNA(t2, r) + '</div>';
    } else {
      const pb = incoherences(b);
      if (pb.length) {
        corps = '<div class="rec2-cards">' + carteNA('NON-RECONDUCTION', pb.join(' · ')) + carteNA(t2, pb.join(' · ')) + '</div>';
      } else if (commercial && estV2()) {
        // Un commercial est sélectionné : sa vue consolidée, plus haut, porte
        // déjà le 2e KPI. On ne répète pas une carte studio qui, elle, compte
        // TOUS les commerciaux — deux chiffres différents côte à côte se
        // liraient comme une contradiction.
        corps = '<div class="rec2-cards rec2-cards-1">' + carteNR(label, b.nonReconduction) + '</div>' + detail(label, b);
      } else {
        const c2 = estV2() ? carteCrm(label, b.clientsRetrouves) : carteComp(label, b.completion);
        corps = '<div class="rec2-cards">' + carteNR(label, b.nonReconduction) + c2 + '</div>' + detail(label, b);
      }
    }
    return '<section class="rec2-studio"><div class="rec2-studio-tete"><h3 class="rec2-studio-nom">' + esc(label.toUpperCase()) + '</h3>'
      + caStudio(label, b) + '</div>' + corps + '</section>';
  }

  // Le CA net du mois, discret, à côté du nom. Un repère, pas un KPI : il ne
  // dépend ni du commercial sélectionné ni d'aucun filtre (calcul et garde-fous
  // dans Recap2Metrics.caNetStudio). Rien d'affiché plutôt qu'un chiffre douteux :
  // studio bloqué, ou recomptage Deciplus du mois absent / en échec.
  function caStudio(label, b) {
    const MM = window.Recap2Metrics;
    if (!b || (b.controleBloquant && b.controleBloquant.ok === false) || !MM || !MM.caNetStudio) return '';
    const ca = MM.caNetStudio(rapport, label);
    if (!ca) return '';
    const titre = 'Net encaissé dans Deciplus sur ' + moisLabel(rapport.mois)
      + (ca.partielAu ? ', jusqu\'au ' + ca.partielAu + ' seulement — mois non clos à la collecte' : '')
      + ' — ' + ca.lignes + ' lignes : tous les encaissements du studio, remboursements et décaissements déduits. '
      + 'Indépendant du commercial sélectionné.';
    return '<span class="rec2-studio-ca" title="' + esc(titre) + '">CA ' + esc(moisLabel(rapport.mois).toUpperCase())
      + (ca.partielAu ? ' <i class="rec2-studio-ca-partiel">(au ' + esc(ca.partielAu) + ')</i>' : '')
      + ' : <b>' + esc(MM.eurosArrondis(ca.montant)) + '</b></span>';
  }

  function carte(label, ind, titre, valeur, sous, actif, cliquable) {
    const tag = cliquable ? 'button' : 'div';
    const attrs = cliquable ? ' type="button" data-open="' + esc(label) + '|' + ind + '" aria-expanded="' + (actif ? 'true' : 'false') + '"' : '';
    return '<' + tag + ' class="rec2-card' + (actif ? ' is-open' : '') + (cliquable ? '' : ' is-na') + '"' + attrs + '>'
      + '<span class="rec2-card-lbl">' + titre + '</span>'
      + '<span class="rec2-card-val">' + valeur + '</span>'
      + '<span class="rec2-card-sub">' + sous + '</span>'
      + (cliquable ? '<span class="rec2-card-hint">' + (actif ? 'Masquer le détail' : 'Voir le détail') + '</span>' : '')
      + '</' + tag + '>';
  }
  const carteNA = (titre, raison) => carte('', '', titre, '—', esc(raison || 'indisponible'), false, false);

  function carteNR(label, d) {
    if (!d) return carteNA('NON-RECONDUCTION', 'indicateur absent du fichier');
    const sous = d.base > 0
      ? d.nonReconduits + ' / ' + d.base + ' client' + (d.base > 1 ? 's' : '')
      : 'aucun client prélevé le mois précédent';
    return carte(label, 'nr', 'NON-RECONDUCTION', pct(d.taux), sous, ouvert === label + '|nr', d.base > 0);
  }
  function carteComp(label, d) {
    if (!d) return carteNA('COMPLÉTION', 'indicateur absent du fichier');
    // Aucun signataire valide -> « — », jamais 0 %.
    const sous = d.contratsValides > 0
      ? d.ontPaye + ' / ' + d.contratsValides + ' nouveau' + (d.contratsValides > 1 ? 'x' : '') + ' client' + (d.contratsValides > 1 ? 's' : '')
      : '0 nouveau contrat';
    return carte(label, 'comp', 'COMPLÉTION', pct(d.taux), sous, ouvert === label + '|comp', d.contratsValides > 0);
  }

  // Le titre du 2e KPI DIT la règle qui l'a produit.
  //  ⚠️ « CLIENTS RETROUVÉS » et non « VENTES INTÉGRÉES » : on rapproche par le
  //  nom, donc on prouve qu'un signataire a une vente dans Deciplus sur le mois,
  //  pas que CE contrat précis y est. Le libellé ne promet que ça.
  const titre2 = () => (estV2() ? 'CONTRATS VALIDÉS' : 'COMPLÉTION (ancienne règle)');

  function carteCrm(label, d) {
    if (!d) return carteNA(titre2(), 'indicateur absent du fichier');
    // CONTRATS VALIDÉS : retrouvée automatiquement, rapprochement confirmé, OU
    // Prélèvement coché (Recap2Metrics.contratsValides). Calculé depuis les
    // lignes : cocher/décocher Prélèvement se voit immédiatement.
    const cv = window.Recap2Metrics.contratsValides(d.liste);
    const n = cv.actives;
    const sous = n > 0
      ? cv.valides + ' / ' + n + ' contrat' + (n > 1 ? 's' : '') + ' validé' + (cv.valides > 1 ? 's' : '')
      : '0 vente signée';
    // Repérable sans ouvrir le détail. Le chiffre de la carte, lui, ne bouge pas.
    const rep = repartition(d.liste, label);
    const nDiv = rep.divergents;
    const alerte = nDiv
      ? '<span class="rec2-card-div">⚠ ' + nDiv + ' site' + (nDiv > 1 ? 's' : '') + ' Deciplus divergent' + (nDiv > 1 ? 's' : '') + '</span>'
      : '';
    // Compteur INFORMATIF : les résiliées restent dans le chiffre de la carte.
    const resil = rep.resilies
      ? '<span class="rec2-card-resil">' + rep.resilies + ' résilié' + (rep.resilies > 1 ? 's' : '') + '</span>'
      : '';
    return carte(label, 'crm', titre2(), pct(cv.taux), sous + alerte + resil, ouvert === label + '|crm', n > 0);
  }

  // ── NOM CLIQUABLE VERS LA FICHE DECIPLUS ────────────────────────────────────
  //  Le nom d'un client RETROUVÉ devient un lien vers sa fiche membre, ouvert
  //  dans un nouvel onglet — on contrôle sans perdre sa place dans RECAP 2.
  //
  //  ⚠️ UNIQUEMENT depuis l'Id_client rendu par Deciplus. Jamais une recherche
  //  par nom, jamais un id reconstruit : un mauvais lien ouvrirait la fiche de
  //  quelqu'un d'autre, ce qui est pire que pas de lien du tout. Sans id
  //  exploitable, le nom reste du texte simple.
  //
  //  `rel="noopener noreferrer"` : la page ouverte ne doit pas pouvoir manipuler
  //  celle-ci via window.opener.
  //  DEUX destinations, jamais confondues :
  //   · client RETROUVÉ avec un Id_client fiable -> SA FICHE, directement ;
  //   · sinon (« à vérifier », ou annulé) -> l'écran Membres, pour chercher à la
  //     main. Vérifié le 2026-09-14 : Deciplus ignore les paramètres d'URL sur
  //     select.php, on ne peut donc pas préremplir la recherche. Le lien le dit
  //     (libellé, infobulle, icône ↗) et ne se fait JAMAIS passer pour une fiche.
  //     Pour épargner la ressaisie, le nom part dans le presse-papiers au clic.
  function nomClient(v) {
    const nom = esc(v.client);
    const R = window.Retention;
    if (!v || !R) return nom;
    const href = (v.retrouve && R.lienDeciplusId) ? R.lienDeciplusId(v.idClient) : null;
    if (href) {
      return '<a class="rec2-lien-fiche" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer"'
        + ' title="Ouvrir la fiche Deciplus dans un nouvel onglet">' + nom + '</a>';
    }
    // « À vérifier » dont la FICHE a été trouvée (recherche Membres, identité
    // exacte et unique) : on ouvre cette fiche — et le libellé dit bien qu'il
    // n'y a pas de vente derrière.
    const hrefFiche = (!v.retrouve && !v.annulee && v.ficheId && R.lienDeciplusId) ? R.lienDeciplusId(v.ficheId) : null;
    if (hrefFiche) {
      return '<a class="rec2-lien-fiche" href="' + esc(hrefFiche) + '" target="_blank" rel="noopener noreferrer"'
        + ' title="Ouvrir la fiche Deciplus trouvée — aucune vente saisie pour cette signature">' + nom + '</a>';
    }
    // ON NE FABRIQUE AUCUN ID : pas de fiche, donc une recherche assumée.
    const rech = R.lienRechercheDeciplus ? R.lienRechercheDeciplus() : null;
    if (!rech) return nom;
    return '<a class="rec2-lien-rech" href="' + esc(rech) + '" target="_blank" rel="noopener noreferrer"'
      + ' data-copier="' + esc(v.client) + '"'
      + ' title="Rechercher « ' + esc(v.client) + ' » dans Deciplus — la recherche n\'est pas préremplie,'
      + ' le nom est copié dans le presse-papiers">' + nom + '<span class="rec2-lien-ico" aria-hidden="true"> ↗</span>'
      + '<span class="rec2-sr">(rechercher dans Deciplus)</span></a>';
  }

  // ── LES TROIS STATUTS MÉTIER ────────────────────────────────────────────────
  //  · ANNULÉ      la vente a été annulée dans Fitness Booster. C'est son statut
  //                PRINCIPAL : il prime, même si une trace Deciplus existait.
  //                Elle est visible — on contrôle tout ce qui a été signé — mais
  //                hors du taux : on ne reproche pas l'absence au CRM d'un
  //                contrat qui n'existe plus.
  //  · Retrouvée   une vente Deciplus du mois existe au nom du signataire.
  //  · À vérifier  aucune vente trouvée. Jamais « absent du CRM » : une saisie
  //                faite le mois suivant sort du champ de l'audit.
  // Le statut d'une vente validée SEULEMENT par la case Prélèvement : la
  // validation manuelle d'abord, puis ce que la recherche automatique en dit
  // toujours (elle continue à chaque collecte).
  function statutVente(v, studioAttendu) {
    const auto = statutVenteAuto(v, studioAttendu);
    if (window.Recap2Metrics.motifValidation(v) !== 'prelevement') return auto;
    return '<span class="rec2-etat is-valide">Validée manuellement — prélèvement vérifié</span>'
      + '<div class="rec2-valid-auto">Recherche Deciplus automatique : ' + auto + '</div>';
  }
  function statutVenteAuto(v, studioAttendu) {
    if (v.annulee && v.resiliation && v.resiliation.resilie) {
      // ANNULÉE dans FB mais RÉSILIÉE en réalité : la qualification manuelle
      // s'affiche en premier ; la source reste dite, en second.
      return '<span class="rec2-etat is-resil" title="' + esc(infoResiliation(v.resiliation)) + '">Résilié le ' + esc(v.resiliation.date) + '</span>'
        + '<div class="rec2-resil-source">Annulée dans Fitness Booster' + (v.dateAnnulation ? ' le ' + esc(v.dateAnnulation) : '') + '</div>';
    }
    if (v.annulee) {
      return '<span class="rec2-etat is-annul">Annulé</span>'
        + (v.dateAnnulation ? ' <span class="rec2-det-date">le ' + esc(v.dateAnnulation) + '</span>' : '');
    }
    if (v.retrouve && v.valideManuellement) {
      // Une certitude, mais obtenue par décision humaine : on le DIT, pour
      // qu'on sache toujours d'où vient un chiffre.
      return '<span class="rec2-etat is-valide">Retrouvé — validé manuellement</span>'
        + (v.valideNom ? ' <span class="rec2-det-date">' + esc(v.valideNom) + '</span>' : '')
        + badgeResiliation(v)
        + anomalieSite(v, studioAttendu);
    }
    if (!v.retrouve && v.candidat) {
      // RAPPROCHEMENT PROPOSÉ : un vrai statut, avec de quoi décider sans
      // quitter l'écran — la fiche du candidat, puis confirmer ou refuser.
      const R = window.Retention;
      const href = (R && R.lienDeciplusId) ? R.lienDeciplusId(v.candidatId) : null;
      const NIV = { tres_forte: 'très forte', forte: 'élevée', moyenne: 'moyenne' };
      const raisons = (v.candidatIndices || []).map((x) => '<li>' + esc(x) + '</li>').join('');
      const jeton = esc(v.client) + '|' + esc(v.candidatId || '') + '|' + esc(v.candidat || '');
      return '<div class="rec2-prop">'
        + '<span class="rec2-etat is-prop">Rapprochement proposé</span>'
        + '<div class="rec2-prop-qui">' + (href
          ? '<a class="rec2-lien-fiche" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer"'
            + ' title="Ouvrir la fiche Deciplus de ce candidat">' + esc(v.candidat) + ' ↗</a>'
          : esc(v.candidat))
        + ' <span class="rec2-det-date">confiance ' + esc(NIV[v.candidatNiveau] || 'moyenne')
        + (v.candidatSite ? ' · ' + esc(v.candidatSite) : '') + '</span></div>'
        + (raisons ? '<ul class="rec2-prop-pourquoi">' + raisons + '</ul>' : '')
        + '<div class="rec2-prop-actions">'
        + '<button type="button" class="rec2-btn-ok" data-match="confirmed|' + jeton + '">✓ Confirmer</button>'
        + '<button type="button" class="rec2-btn-non" data-match="rejected|' + jeton + '">✕ Refuser</button>'
        + '</div></div>';
    }
    if (!v.retrouve) {
      // « À VÉRIFIER » : aucune vente trouvée. Deux cas, jamais confondus :
      //  · FICHE TROUVÉE — la personne existe dans Deciplus, mais aucune vente
      //    n'y est saisie. Accès direct à sa fiche ; RIEN à confirmer, aucun
      //    effet sur le KPI : trouver la fiche ne prouve pas la vente ;
      //  · rien de fiable — une vraie action de recherche. Deciplus ne permet
      //    pas de préremplir la recherche par un lien : on ouvre l'écran
      //    Membres et on copie le nom, et le libellé le dit.
      const R = window.Retention;
      const refus = v.refuse ? ' <span class="rec2-det-date">rapprochement refusé</span>' : '';
      const hrefFiche = (v.ficheId && R && R.lienDeciplusId) ? R.lienDeciplusId(v.ficheId) : null;
      if (hrefFiche) {
        return '<span class="rec2-etat is-non">À vérifier</span>'
          + ' <span class="rec2-det-date">fiche trouvée, aucune vente saisie</span>' + refus
          + '<div class="rec2-action"><a class="rec2-lien-fiche" href="' + esc(hrefFiche) + '" target="_blank" rel="noopener noreferrer"'
          + ' title="Fiche Deciplus ' + esc(v.ficheNom || v.client) + (v.ficheSite ? ' · ' + esc(v.ficheSite) : '') + '">Ouvrir la fiche Deciplus ↗</a></div>';
      }
      const rech = (R && R.lienRechercheDeciplus) ? R.lienRechercheDeciplus() : null;
      return '<span class="rec2-etat is-non">À vérifier</span>' + refus
        + (rech ? '<div class="rec2-action"><a class="rec2-lien-rech" href="' + esc(rech) + '" target="_blank" rel="noopener noreferrer"'
          + ' data-copier="' + esc(v.client) + '" title="Ouvre l\'écran Membres de Deciplus — la recherche n\'est pas préremplie, le nom « '
          + esc(v.client) + ' » est copié dans le presse-papiers">Rechercher dans Deciplus ↗</a></div>' : '');
    }
    const notes = [];
    if (v.dateVente) notes.push('le ' + esc(v.dateVente));
    const pai = etatPaiement(v);
    if (pai.note) notes.push(pai.note);
    return '<span class="rec2-etat is-oui">Retrouvée</span>'
      + (notes.length ? ' <span class="rec2-det-date">' + notes.join(' · ') + '</span>' : '')
      + badgeResiliation(v)
      + pai.alerte
      + anomalieSite(v, studioAttendu);
  }

  // ── PAIEMENT SUR 31 JOURS ───────────────────────────────────────────────────
  //  Posé par la collecte (crm-automation/lib/paiement.js), par Id_client, tous
  //  sites. Aucun effet sur un KPI. Seul « aucun » est une anomalie visible.
  //  Un rapport d'avant cette règle n'a que `encaisse` : on garde l'ancien
  //  libellé, pour ne jamais lui prêter une précision qu'il n'a pas.
  function etatPaiement(v) {
    const p = v.paiement;
    if (!p) return { note: v.encaisse === false ? 'pas encore encaissé' : '', alerte: '' };
    const court = (d) => String(d || '').slice(0, 5);
    if (p.etat === 'encaisse') {
      const suivant = p.premier && v.date && p.premier.slice(3) !== String(v.date).slice(3);
      return { note: 'encaissé le ' + esc(court(p.premier)) + (suivant ? ' (mois suivant)' : ''), alerte: '' };
    }
    if (p.etat === 'attendu') return { note: 'premier encaissement attendu', alerte: '' };
    if (p.etat === 'indetermine') {
      return { note: 'encaissement non vérifiable' + (p.couvertJusquau ? ' (données au ' + esc(court(p.couvertJusquau)) + ')' : ''), alerte: '' };
    }
    return {
      note: '',
      alerte: '<div class="rec2-pai"><span class="rec2-etat is-pai" title="Aucun encaissement net positif entre la signature et le '
        + esc(p.finFenetre || '') + ', données vérifiées jusqu\'au ' + esc(p.couvertJusquau || '') + '">⚠ Aucun encaissement sous 31 jours</span></div>',
    };
  }

  // ── SITE DECIPLUS DIVERGENT ─────────────────────────────────────────────────
  //  Une anomalie à CORRIGER dans Deciplus, affichée SOUS le statut : la vente
  //  reste « Retrouvée » et compte dans le taux, mais on doit la voir d'un coup
  //  d'œil. La règle vit dans Recap2Metrics.siteDivergent — une seule définition
  //  pour le détail studio, la vue commercial, la carte et le filtre.
  function divergence(v, studioAttendu) {
    const MM = window.Recap2Metrics;
    return (MM && MM.siteDivergent) ? MM.siteDivergent(v, studioAttendu) : null;
  }
  function anomalieSite(v, studioAttendu) {
    const d = divergence(v, studioAttendu);
    if (!d) return '';
    return '<div class="rec2-div">'
      + '<span class="rec2-etat is-div">⚠ Site Deciplus divergent</span>'
      + '<span class="rec2-div-qui">Studio attendu : <b>' + esc(d.attendu) + '</b>'
      + ' · Site Deciplus trouvé : <b>' + esc(d.site) + '</b></span></div>';
  }

  // Le filtre d'une ligne : 'tous' | 'retrouves' | 'proposes' | 'verifier' |
  //  'divergents' | 'annules'.
  //  « Retrouvés » englobe les deux certitudes — automatique et validée — mais
  //  le détail de la ligne dit toujours laquelle des deux s'applique.
  //  « Sites divergents » est un sous-ensemble des retrouvés : un filtre de
  //  repérage, pas une population de plus dans le décompte.
  //  `studio` : le studio attendu (détail studio) ; absent, celui de la ligne.
  function passeFiltre(v, f, studio) {
    if (f === 'resilies') return !!(v.resiliation && v.resiliation.resilie);
    if (f === 'divergents') return !!divergence(v, studio);
    if (f === 'annules') return !!v.annulee;
    if (f === 'retrouves') return !v.annulee && !!v.retrouve;
    const prel = window.Recap2Metrics.motifValidation(v) === 'prelevement';
    if (f === 'prelevements') return prel;
    if (f === 'proposes') return !v.annulee && !v.retrouve && !!v.candidat && !prel;
    if (f === 'verifier') return !v.annulee && !v.retrouve && !v.candidat && !prel;
    return true;
  }
  // Les cinq populations d'une liste, comptées une fois pour toutes.
  //  `divergents` est compté À PART : il est inclus dans `retrouves`, et
  //  n'entre dans aucune soustraction.
  function repartition(liste, studio) {
    const l = liste || [];
    const annulees = l.filter((v) => v.annulee).length;
    const retrouves = l.filter((v) => !v.annulee && v.retrouve).length;
    const valides = l.filter((v) => !v.annulee && v.retrouve && v.valideManuellement).length;
    // Validées par la seule case Prélèvement : ni « proposées » ni « à vérifier ».
    const prelevements = l.filter((v) => window.Recap2Metrics.motifValidation(v) === 'prelevement').length;
    const proposes = l.filter((v) => !v.annulee && !v.retrouve && v.candidat && window.Recap2Metrics.motifValidation(v) !== 'prelevement').length;
    const divergents = l.filter((v) => divergence(v, studio)).length;
    // Résiliés : un repérage, compté à part — ils restent dans `retrouves` et `actives`.
    // Une annulée FB marquée résiliée compte ici — et reste comptée dans `annulees`.
    const resilies = l.filter((v) => v.resiliation && v.resiliation.resilie).length;
    return { total: l.length, annulees, actives: l.length - annulees, retrouves, valides, proposes, divergents, resilies, prelevements,
      aVerifier: l.length - annulees - retrouves - proposes - prelevements };
  }

  // Le bandeau chiffré, identique partout : signées, annulées, actives,
  // retrouvées, à vérifier — puis le taux, calculé sur les seules actives.
  function comptes(liste, signataires, retrouves) {
    const annulees = liste.filter((v) => v.annulee).length;
    const actives = liste.length - annulees;
    const nbR = retrouves == null ? liste.filter((v) => !v.annulee && v.retrouve).length : retrouves;
    return { signees: liste.length, annulees, actives: signataires == null ? actives : signataires, retrouves: nbR };
  }

  // ── CASES DE CONTRÔLE MANUEL : PRÉLÈVEMENT / RÉSERVATION ────────────────────
  //  Deux cases indépendantes, cochées à la main. L'état vient du SERVEUR
  //  (`v.controle`, posé à la lecture) : il survit au rechargement, à la
  //  reconnexion, au redéploiement et à une nouvelle collecte.
  //  ⚠️ AUCUN EFFET SUR LES KPI : rien ici n'entre dans un compteur.
  //  Une vente annulée n'a rien à contrôler : pas de case, un tiret.
  const CONTROLES = [
    { champ: 'prelevement', libelle: 'Prélèvement', aide: 'Prélèvement bien paramétré' },
    { champ: 'reservation', libelle: 'Réservation', aide: 'Réservation / prise de rendez-vous faite' },
  ];
  function casesControle(v, studio) {
    return casesPrelevementReservation(v, studio) + celluleResiliation(v, studio);
  }
  function casesPrelevementReservation(v, studio) {
    return CONTROLES.map((c) => {
      if (v.annulee) return '<td class="rec2-ctl"><span class="rec2-ctl-na" aria-hidden="true">—</span></td>';
      const coche = !!(v.controle && v.controle[c.champ]);
      const qui = (v.controle && coche && v.controle.modifieLe)
        ? ' — coché le ' + fmtDate(v.controle.modifieLe) + (v.controle.modifiePar ? ' par ' + v.controle.modifiePar : '')
        : '';
      return '<td class="rec2-ctl"><input type="checkbox" class="rec2-ctl-box"'
        + (coche ? ' checked' : '')
        + ' data-ctl="' + c.champ + '" data-studio="' + esc(studio) + '" data-client="' + esc(v.client)
        + '" data-date="' + esc(v.date || '') + '"'
        + ' title="' + esc(c.aide + qui) + '" aria-label="' + esc(c.aide + ' — ' + v.client) + '"></td>';
    }).join('');
  }
  const entetesControle = () => CONTROLES.map((c) => '<th class="rec2-ctl" title="' + esc(c.aide) + '">' + c.libelle + '</th>').join('')
    + '<th class="rec2-ctl" title="Vente résiliée après signature — information, sans effet sur les KPI">Résilié</th>';

  // Enregistre UNE case. Pas d'optimisme : la case est bloquée pendant l'appel,
  // et c'est la réponse du serveur qui fait foi. En cas d'échec, elle revient à
  // son état précédent et on le dit.
  async function enregistrerControle(box) {
    const d = box.dataset;
    const valeur = box.checked;
    box.disabled = true;
    try {
      const r = await fetch('/api/recap2/checks', {
        method: 'POST', headers: H(),
        body: JSON.stringify({ mois: rapport.mois, studio: d.studio, client: d.client, date: d.date, champ: d.ctl, valeur }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.controle) throw new Error((j && j.error) || ('HTTP ' + r.status));
      // On pose la réponse sur la ligne du RAPPORT : vue studio et vue
      // commercial lisent le même objet, elles sont donc à jour ensemble.
      const cr = rapport.studios && rapport.studios[d.studio] && rapport.studios[d.studio].clientsRetrouves;
      const ligne = cr && (cr.liste || []).find((l) => l.client === d.client && (l.date || '') === d.date);
      if (ligne) ligne.controle = j.controle;
      render();
    } catch (err) {
      box.checked = !valeur;
      box.disabled = false;
      alert('Contrôle non enregistré : ' + (err && err.message ? err.message : 'erreur'));
    }
  }

  // ── RÉSILIATION MANUELLE ────────────────────────────────────────────────────
  //  ⚠️ RÉSILIÉ ≠ ANNULÉ. Une vente résiliée a été signée : elle reste
  //  « Retrouvée », dans les ventes signées et actives, dans le taux et dans
  //  l'historique du commercial. Le badge est une information de plus — il ne
  //  masque ni un statut de paiement, ni une anomalie.
  //  Sur une vente RETROUVÉE (validée à la main comprise) ou ANNULÉE dans Fitness
  //  Booster — une annulée qualifiée « Résiliée » reste annulée dans les calculs.
  //  Date OBLIGATOIRE : ni avant la signature, ni dans le futur.
  //  Enregistrement en deux temps (date, puis confirmation) pour éviter une
  //  fausse manipulation. Pas de fenêtre de dialogue : tout se passe dans la ligne.
  let editionResil = null;   // { cle, etape: 'date' | 'confirmer' | 'retirer', date: 'AAAA-MM-JJ', erreur }
  const cleResil = (studio, v) => studio + '|' + v.client + '|' + (v.date || '');
  const versIso = (fr) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(fr || '')); return m ? m[3] + '-' + m[2] + '-' + m[1] : ''; };
  const versFr = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; };
  const isoAujourdhui = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  // Retrouvée (validée à la main comprise) OU annulée dans Fitness Booster.
  const resiliable = (v) => v.retrouve === true || v.annulee === true;

  function infoResiliation(r) {
    const qui = (r.modifiePar ? 'par ' + r.modifiePar + ' ' : '') + (r.modifieLe ? 'le ' + fmtDate(r.modifieLe) : '');
    const delai = r.delaiJours == null ? '' : ' — ' + r.delaiJours + ' jour' + (r.delaiJours > 1 ? 's' : '') + ' après la signature';
    return 'Résiliation enregistrée ' + qui + delai;
  }
  function badgeResiliation(v) {
    const r = v.resiliation;
    if (!r || !r.resilie) return '';
    return '<div class="rec2-resil"><span class="rec2-etat is-resil" title="' + esc(infoResiliation(r)) + '">Résilié le '
      + esc(r.date) + '</span></div>';
  }

  function celluleResiliation(v, studio) {
    if (!resiliable(v)) return '<td class="rec2-ctl"><span class="rec2-ctl-na" aria-hidden="true">—</span></td>';
    const cle = cleResil(studio, v);
    const e = editionResil && editionResil.cle === cle ? editionResil : null;
    const data = ' data-studio="' + esc(studio) + '" data-client="' + esc(v.client) + '" data-date="' + esc(v.date || '') + '"';
    const btn = (action, texte, cls) => '<button type="button" class="' + cls + '" data-resil-action="' + action + '"' + data + '>' + texte + '</button>';
    const erreur = e && e.erreur ? '<div class="rec2-resil-err">' + esc(e.erreur) + '</div>' : '';
    if (e && e.etape === 'date') {
      return '<td class="rec2-ctl rec2-resil-edit"><label class="rec2-resil-lbl">Date de résiliation'
        + '<input type="date" class="rec2-resil-date" min="' + esc(versIso(v.date)) + '" max="' + isoAujourdhui() + '" value="' + esc(e.date || '') + '"' + data + '></label>'
        + '<div class="rec2-prop-actions">' + btn('valider', 'Valider la date', 'rec2-btn-ok') + btn('annuler', 'Annuler', 'rec2-btn-non') + '</div>' + erreur + '</td>';
    }
    if (e && e.etape === 'confirmer') {
      return '<td class="rec2-ctl rec2-resil-edit"><div class="rec2-resil-q">Marquer comme résilié le ' + esc(versFr(e.date)) + ' ?</div>'
        + '<div class="rec2-prop-actions">' + btn('confirmer', 'Oui, résilier', 'rec2-btn-non') + btn('annuler', 'Annuler', 'rec2-btn-ok') + '</div>' + erreur + '</td>';
    }
    if (e && e.etape === 'retirer') {
      return '<td class="rec2-ctl rec2-resil-edit"><div class="rec2-resil-q">Retirer la résiliation du ' + esc((v.resiliation && v.resiliation.date) || '') + ' ?</div>'
        + '<div class="rec2-prop-actions">' + btn('retirer', 'Oui, retirer', 'rec2-btn-non') + btn('annuler', 'Annuler', 'rec2-btn-ok') + '</div>' + erreur + '</td>';
    }
    const coche = !!(v.resiliation && v.resiliation.resilie);
    return '<td class="rec2-ctl"><input type="checkbox" class="rec2-ctl-box rec2-resil-box"' + (coche ? ' checked' : '') + ' data-resil="1"' + data
      + ' title="' + (coche ? 'Résilié le ' + esc(v.resiliation.date) + ' — décocher pour retirer' : 'Marquer cette vente comme résiliée') + '"'
      + ' aria-label="' + esc('Résilié — ' + v.client) + '"></td>';
  }

  // La case : cochée -> on demande la date ; décochée -> on demande de confirmer le retrait.
  function basculerResiliation(box) {
    const d = box.dataset;
    const cle = d.studio + '|' + d.client + '|' + d.date;
    editionResil = box.checked ? { cle, etape: 'date', date: '' } : { cle, etape: 'retirer' };
    render();
    const champ = $('#rec2-body input.rec2-resil-date');
    if (champ) champ.focus();
  }

  async function actionResiliation(bouton) {
    const d = bouton.dataset;
    const action = d.resilAction;
    if (!editionResil) return;
    if (action === 'annuler') { editionResil = null; render(); return; }
    if (action === 'valider') {
      const champ = bouton.closest('td').querySelector('input.rec2-resil-date');
      const iso = champ ? champ.value : '';
      const sig = versIso(d.date);
      editionResil.date = iso;
      if (!iso) editionResil.erreur = 'La date de résiliation est obligatoire.';
      else if (sig && iso < sig) editionResil.erreur = 'La résiliation ne peut pas précéder la signature (' + d.date + ').';
      else if (iso > isoAujourdhui()) editionResil.erreur = 'La date de résiliation ne peut pas être dans le futur.';
      else { editionResil.erreur = ''; editionResil.etape = 'confirmer'; }
      render(); return;
    }
    // Enregistrer (confirmer) ou retirer : c'est le serveur qui fait foi.
    const resilie = action === 'confirmer';
    $$('#rec2-body [data-resil-action]').forEach((b) => { b.disabled = true; });
    try {
      const r = await fetch('/api/recap2/resiliation', {
        method: 'POST', headers: H(),
        body: JSON.stringify({ mois: rapport.mois, studio: d.studio, client: d.client, date: d.date, resilie, dateResiliation: resilie ? versFr(editionResil.date) : '' }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.resiliation) throw new Error((j && j.error) || ('HTTP ' + r.status));
      // Posée sur la ligne du RAPPORT : vue studio et vue commercial à jour ensemble.
      const cr = rapport.studios && rapport.studios[d.studio] && rapport.studios[d.studio].clientsRetrouves;
      const ligne = cr && (cr.liste || []).find((l) => l.client === d.client && (l.date || '') === d.date);
      if (ligne) ligne.resiliation = j.resiliation;
      editionResil = null;
    } catch (err) {
      editionResil.erreur = 'Non enregistré : ' + (err && err.message ? err.message : 'erreur');
    }
    render();
  }

  // La classe d'une ligne : annulée (barrée) ou site divergent (liseré d'alerte).
  function classeLigne(v, studio) {
    // Une annulée FB qualifiée « Résiliée » n'est plus barrée : elle a existé.
    if (v.annulee && v.resiliation && v.resiliation.resilie) return ' class="rec2-ligne-resil"';
    if (v.annulee) return ' class="rec2-ligne-annul"';
    return divergence(v, studio) ? ' class="rec2-ligne-div"' : '';
  }
  // Le filtre de repérage, habillé en alerte pour se distinguer des populations.
  const chipDiv = (chip, n) => chip('divergents', '⚠ Sites divergents', n).replace('rec2-chip', 'rec2-chip rec2-chip-div');

  // ── DÉTAILS (fermés par défaut, un seul ouvert à la fois) ────────────────────
  function detail(label, b) {
    if (ouvert === label + '|nr') return detailNR(label, b.nonReconduction);
    if (ouvert === label + '|comp') return detailComp(label, b.completion);
    if (ouvert === label + '|crm') return detailCrm(label, b.clientsRetrouves);
    return '';
  }
  const detailHead = (titre) => '<div class="rec2-det-head"><span>' + titre + '</span>'
    + '<button type="button" class="rec2-det-x" data-close="1" aria-label="Fermer le détail">✕ Fermer</button></div>';

  // Le nom d'un client non reconduit : lien vers SA fiche Deciplus quand l'Id
  // membre est connu (même lien, même garde que pour un client retrouvé).
  // Sans id — un rapport déposé avant, ou une clé de repli — texte simple :
  // aucune recherche par nom, aucun id reconstruit.
  function nomNonReconduit(c) {
    const R = window.Retention;
    const href = (c.idClient && R && R.lienDeciplusId) ? R.lienDeciplusId(c.idClient) : null;
    if (!href) return esc(c.client);
    return '<a class="rec2-lien-fiche" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer"'
      + ' title="Ouvrir la fiche Deciplus dans un nouvel onglet">' + esc(c.client) + '</a>';
  }

  function detailNR(label, d) {
    const liste = (d && d.liste) || [];
    const m1 = cap(moisLabel(rapport.m1)), m = cap(moisLabel(rapport.mois));
    const lignes = liste.map((c) => '<tr><td>' + nomNonReconduit(c) + '</td>'
      + '<td class="rec2-num">' + esc(eur(c.netM1)) + '</td>'
      + '<td class="rec2-num">' + esc(eur(c.netM)) + '</td></tr>').join('');
    const corps = liste.length
      ? '<table class="rec2-table"><thead><tr><th>Client</th><th class="rec2-num">Net ' + esc(m1) + '</th><th class="rec2-num">Net ' + esc(m) + '</th></tr></thead><tbody>' + lignes + '</tbody></table>'
      : '<p class="rec2-info">Aucun client non reconduit.</p>';
    return '<div class="rec2-detail">' + detailHead(esc(label) + ' · clients non reconduits — ' + liste.length) + corps + '</div>';
  }

  function detailComp(label, d) {
    const tous = (d && d.liste) || [];
    const f = filtreComp[label] || 'tous';
    const liste = tous.filter((c) => f === 'tous' || (f === 'payes' ? c.paye : !c.paye));
    const nbPayes = tous.filter((c) => c.paye).length;
    const chip = (val, txt, n) => '<button type="button" class="rec2-chip' + (f === val ? ' is-on' : '') + '" data-filtre="' + esc(label) + '|' + val + '">' + txt + ' <b>' + n + '</b></button>';
    const chips = '<div class="rec2-chips">' + chip('tous', 'Tous', tous.length)
      + chip('payes', 'Payés', nbPayes) + chip('nonpayes', 'Non payés', tous.length - nbPayes) + '</div>';
    const lignes = liste.map((c) => '<tr><td>' + esc(c.contrat) + (c.date ? ' <span class="rec2-det-date">' + esc(c.date) + '</span>' : '') + '</td>'
      + '<td class="rec2-num"><span class="rec2-etat ' + (c.paye ? 'is-oui' : 'is-non') + '">' + (c.paye ? 'Payé' : 'Non payé') + '</span></td></tr>').join('');
    const corps = liste.length
      ? '<table class="rec2-table"><thead><tr><th>Nouveau client ' + esc(cap(moisLabel(rapport.m1))) + '</th><th class="rec2-num">Paiement ' + esc(cap(moisLabel(rapport.mois))) + '</th></tr></thead><tbody>' + lignes + '</tbody></table>'
      : '<p class="rec2-info">Aucun contrat dans ce filtre.</p>';
    const rappel = (d && d.annulesExclus)
      ? '<p class="rec2-det-note">' + d.annulesExclus + ' vente(s) annulée(s) exclue(s) du calcul.</p>' : '';
    return '<div class="rec2-detail">' + detailHead(esc(label) + ' · nouveaux clients ' + esc(moisLabel(rapport.m1)) + ' — ' + tous.length) + chips + corps + rappel + '</div>';
  }

  // Détail du 2e KPI, règle v2 : une ligne par signataire, contrôlable à l'œil.
  //  Le STATUT dit ce qu'on sait, et rien de plus :
  //   · « Retrouvée »  -> une vente existe dans Deciplus sur le mois, au nom du
  //     signataire. Si elle n'est pas encore encaissée, on le précise — ce n'est
  //     PAS un manque, c'est une échéance à venir ;
  //   · « À vérifier » -> aucune vente trouvée. On ne dit pas « absent du CRM » :
  //     une saisie faite le mois suivant est hors du champ de cet audit.
  function detailCrm(label, d) {
    const tous = (d && d.liste) || [];
    const f = filtreCrm[label] || 'tous';
    const liste = tous.filter((c) => passeFiltre(c, f, label));
    const c = repartition(tous, label);
    const chip = (val, txt, n) => '<button type="button" class="rec2-chip' + (f === val ? ' is-on' : '')
      + '" data-filtrecrm="' + esc(label) + '|' + val + '">' + txt + ' <b>' + n + '</b></button>';
    const chips = '<div class="rec2-chips">' + chip('tous', 'Tous', c.total)
      + chip('retrouves', 'Retrouvés', c.retrouves)
      + (c.proposes ? chip('proposes', 'Rapprochements proposés', c.proposes) : '')
      + (c.prelevements ? chip('prelevements', 'Validés par prélèvement', c.prelevements) : '')
      + chip('verifier', 'À vérifier', c.aVerifier)
      + (c.divergents ? chipDiv(chip, c.divergents) : '')
      + (c.resilies ? chip('resilies', 'Résiliés', c.resilies) : '')
      + (c.annulees ? chip('annules', 'Annulés', c.annulees) : '') + '</div>';

    const lignes = liste.map((v) => '<tr' + classeLigne(v, label) + '><td>' + nomClient(v)
      + (v.date ? ' <span class="rec2-det-date">signé le ' + esc(v.date) + '</span>' : '') + '</td>'
      + casesControle(v, label)
      + '<td>' + esc(v.prestation || '—') + '</td>'
      + '<td>' + esc(v.commercial || '—') + '</td>'
      + '<td class="rec2-num">' + statutVente(v, label) + '</td></tr>').join('');
    const corps = liste.length
      ? '<table class="rec2-table"><thead><tr><th>Signataire ' + esc(cap(moisLabel(rapport.mois)))
        + '</th>' + entetesControle() + '<th>Prestation</th><th>Commercial</th><th class="rec2-num">Dans Deciplus</th></tr></thead><tbody>'
        + lignes + '</tbody></table>'
      : '<p class="rec2-info">Aucune vente dans ce filtre.</p>';
    const notes = [];
    if (c.annulees) notes.push(c.annulees + ' vente(s) annulée(s) : affichée(s) ici, hors du taux.');
    if (d && d.doublonsSignataire) {
      notes.push(d.doublonsSignataire + ' vente(s) d\'un signataire déjà compté : le taux se lit en signataires uniques.');
    }
    const pied = notes.length ? '<p class="rec2-det-note">' + esc(notes.join(' ')) + '</p>' : '';
    return '<div class="rec2-detail">' + detailHead(esc(label) + ' · ventes signées en ' + esc(moisLabel(rapport.mois)) + ' — ' + tous.length)
      + chips + corps + pied + '</div>';
  }

  // ── VUE CONSOLIDÉE D'UN COMMERCIAL ──────────────────────────────────────────
  //  Répond à quatre questions, dans cet ordre : qu'a-t-il vendu ce mois-ci,
  //  combien sont saisies dans Deciplus, lesquelles contrôler, dans quels
  //  studios. D'où le bandeau chiffré puis UN tableau, tous studios confondus.
  //
  //  ⚠️ Aucun recalcul : on relit les verdicts « retrouvé » déjà écrits dans le
  //  rapport. Le taux du commercial ne peut donc pas diverger des cartes studio.
  function vueCommercial() {
    if (!commercial || !estV2()) return '';
    const MM = window.Recap2Metrics;
    if (!MM || !MM.consoliderCommercial) return '';
    const d = MM.consoliderCommercial(rapport, commercial);
    const nom = MM.libelleCommercial(d.nom) || '(sans nom)';

    if (!d.signees) {
      return '<section class="rec2-com"><div class="rec2-com-head"><h3 class="rec2-com-nom">'
        + esc(nom.toUpperCase()) + ' — ' + esc(cap(moisLabel(rapport.mois))) + '</h3>'
        + '<button type="button" class="rec2-det-x" data-toutcom="1">✕ Tous les commerciaux</button></div>'
        + (d.referencesPresentes ? '<div class="rec2-com-stats">' + compteurReferences(d) + '</div>' : '')
        + '<p class="rec2-info">Aucune vente pour ce commercial sur ce mois.</p>'
        + detailReferences(d) + '</section>';
    }

    const liste = d.ventes.filter((v) => passeFiltre(v, filtreCom));
    const chip = (val, txt, n) => '<button type="button" class="rec2-chip' + (filtreCom === val ? ' is-on' : '')
      + '" data-filtrecom="' + val + '">' + txt + ' <b>' + n + '</b></button>';

    const lignes = liste.map((v) => '<tr' + classeLigne(v, v.studio) + '>'
      + '<td class="rec2-com-studio">' + esc(v.studio) + '</td>'
      + '<td>' + nomClient(v) + '</td>'
      + casesControle(v, v.studio)
      + '<td class="rec2-num">' + esc(v.date || '—') + '</td>'
      + '<td>' + esc(v.prestation || '—') + '</td>'
      + '<td>' + esc(nom) + '</td>'
      + '<td class="rec2-num">' + statutVente(v, v.studio) + '</td></tr>').join('');

    const corps = liste.length
      ? '<table class="rec2-table rec2-com-table"><thead><tr><th>Studio</th><th>Signataire</th>' + entetesControle()
        + '<th class="rec2-num">Signé le</th><th>Prestation</th><th>Commercial</th>'
        + '<th class="rec2-num">Dans Deciplus</th></tr></thead><tbody>' + lignes + '</tbody></table>'
      : '<p class="rec2-info">Aucune vente dans ce filtre.</p>';

    // Le compte se lit de haut en bas : signées -> annulées -> actives, puis ce
    // que devient l'actif. Le taux ne porte QUE sur les ventes actives.
    const rep0 = repartition(d.ventes);
    const n = (x, un, pl) => '<span class="rec2-com-det"><b>' + x + '</b> ' + (x > 1 ? pl : un) + '</span>';
    const stats = '<div class="rec2-com-stats">'
      + '<span class="rec2-com-taux">' + pct(d.tauxValides) + '</span>'
      + n(d.signees, 'vente signée', 'ventes signées')
      + (d.annulees ? n(d.annulees, 'annulée', 'annulées') : '')
      + n(d.total, 'vente active', 'ventes actives')
      + n(rep0.retrouves, 'retrouvée dans Deciplus', 'retrouvées dans Deciplus')
      + (rep0.valides ? n(rep0.valides, 'validée à la main', 'validées à la main') : '')
      + (rep0.proposes ? n(rep0.proposes, 'rapprochement proposé', 'rapprochements proposés') : '')
      + (rep0.prelevements ? n(rep0.prelevements, 'validée par prélèvement', 'validées par prélèvement') : '')
      + n(rep0.aVerifier, 'à vérifier', 'à vérifier')
      + (rep0.resilies ? n(rep0.resilies, 'résilié', 'résiliés') : '')
      + (rep0.divergents ? '<span class="rec2-com-det rec2-com-det-div"><b>' + rep0.divergents + '</b> '
        + (rep0.divergents > 1 ? 'sites Deciplus divergents' : 'site Deciplus divergent') + '</span>' : '')
      + (d.referencesPresentes ? compteurReferences(d) : '')
      + '</div>';
    const ou = '<p class="rec2-com-studios">Studios : ' + esc(d.studios.join(', ')) + '</p>';

    return '<section class="rec2-com">'
      + '<div class="rec2-com-head"><h3 class="rec2-com-nom">' + esc(nom.toUpperCase()) + ' — '
      + esc(cap(moisLabel(rapport.mois))) + '</h3>'
      + '<button type="button" class="rec2-det-x" data-toutcom="1">✕ Tous les commerciaux</button></div>'
      + stats + ou + detailReferences(d)
      + '<div class="rec2-chips">' + chip('tous', 'Tous', rep0.total)
      + chip('retrouves', 'Retrouvés', rep0.retrouves)
      + (rep0.proposes ? chip('proposes', 'Rapprochements proposés', rep0.proposes) : '')
      + (rep0.prelevements ? chip('prelevements', 'Validés par prélèvement', rep0.prelevements) : '')
      + chip('verifier', 'À vérifier', rep0.aVerifier)
      + (rep0.divergents ? chipDiv(chip, rep0.divergents) : '')
      + (rep0.resilies ? chip('resilies', 'Résiliés', rep0.resilies) : '')
      + (rep0.annulees ? chip('annules', 'Annulés', rep0.annulees) : '') + '</div>'
      + corps
      + '<p class="rec2-det-note">Ce filtre ne concerne que « clients retrouvés dans Deciplus ». '
      + 'La non-reconduction, ci-dessous, ne dépend d\'aucun commercial.</p>'
      + '</section>';
  }

  // ── PRISES DE RÉFÉRENCE (Vendor) ────────────────────────────────────────────
  //  Ce que Vendor compte dans sa ligne « Prise de référence » : les contacts
  //  créés dans le mois avec cette source, attribués à leur AUTEUR (identifiant
  //  Vendor). Additionnées sur tous les studios du commercial. Un repère : aucun
  //  taux, aucun KPI n'en dépend. Un studio dont la lecture a échoué est DIT,
  //  jamais compté comme 0.
  function compteurReferences(d) {
    const n = d.references.length;
    return '<button type="button" class="rec2-com-det rec2-com-refs" data-refs="1" aria-expanded="' + (refsOuvertes ? 'true' : 'false') + '">'
      + '<b>' + n + '</b> ' + (n > 1 ? 'prises de référence' : 'prise de référence') + '</button>';
  }
  function detailReferences(d) {
    if (!d.referencesPresentes) return '';
    const manque = d.referencesIndisponibles.length
      ? '<p class="rec2-info rec2-info-err">Prises de référence indisponibles pour : '
        + esc(d.referencesIndisponibles.map((x) => x.studio).join(', ')) + ' — le total ne les inclut pas.</p>'
      : '';
    if (!refsOuvertes) return manque;
    const nomAff = (r) => (window.Recap2Metrics.libelleCommercial(r.createur) || '(sans nom)');
    const corps = d.references.length
      ? '<table class="rec2-table rec2-refs-table"><thead><tr><th class="rec2-num">Date</th><th>Studio</th>'
        + '<th>Contact référencé</th><th>Commercial</th><th>Statut</th></tr></thead><tbody>'
        + d.references.map((r) => '<tr><td class="rec2-num">' + esc(r.date) + '</td><td>' + esc(r.studio) + '</td>'
          + '<td>' + esc(r.client || '—') + '</td><td>' + esc(nomAff(r)) + '</td><td>' + esc(r.statut || '—') + '</td></tr>').join('')
        + '</tbody></table>'
      : '<p class="rec2-info">Aucune prise de référence sur ce mois.</p>';
    return '<div class="rec2-refs"><div class="rec2-det-head"><span>Prises de référence — ' + esc(cap(moisLabel(rapport.mois))) + '</span>'
      + '<button type="button" class="rec2-det-x" data-refs="1" aria-label="Fermer le détail des prises de référence">✕ Fermer</button></div>' + corps
      + '<p class="rec2-det-note">Source : Vendor, ligne « Prise de référence » (Anciennes performances → Sources des sportifs), '
      + 'attribuée à l\'auteur de la saisie.</p></div>' + manque;
  }

  // ── INTERACTIONS ────────────────────────────────────────────────────────────
  function onBodyClick(e) {
    const resil = e.target.closest('[data-resil-action]');
    if (resil) { actionResiliation(resil); return; }
    const dec = e.target.closest('[data-match]');
    if (dec) { deciderRapprochement(dec); return; }
    // Un lien de RECHERCHE : on copie le nom pour n'avoir qu'à le coller, et on
    // laisse le navigateur ouvrir l'onglet. La copie ne doit jamais bloquer le
    // lien — elle échoue silencieusement si le navigateur la refuse.
    const rech = e.target.closest('[data-copier]');
    if (rech) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(rech.dataset.copier).catch(() => {});
        }
      } catch (_) { /* sans conséquence : le lien s'ouvre quand même */ }
      return; // on ne préempte pas la navigation
    }
    if (e.target.closest('[data-alertes]')) { alertesOuvertes = !alertesOuvertes; render(); return; }
    const fil = e.target.closest('[data-filtre]');
    if (fil) { const [label, val] = fil.dataset.filtre.split('|'); filtreComp[label] = val; render(); return; }
    if (e.target.closest('[data-refs]')) { refsOuvertes = !refsOuvertes; render(); return; }
    const fCom = e.target.closest('[data-filtrecom]');
    if (fCom) { filtreCom = fCom.dataset.filtrecom; render(); return; }
    if (e.target.closest('[data-toutcom]')) {
      commercial = ''; filtreCom = 'tous'; refsOuvertes = false;
      const sel = $('#rec2-commercial'); if (sel) sel.value = '';
      render(); return;
    }
    const filC = e.target.closest('[data-filtrecrm]');
    if (filC) { const [label, val] = filC.dataset.filtrecrm.split('|'); filtreCrm[label] = val; render(); return; }
    if (e.target.closest('[data-close]')) { ouvert = ''; render(); return; }
    const btn = e.target.closest('[data-open]');
    if (!btn) return;
    ouvert = (ouvert === btn.dataset.open) ? '' : btn.dataset.open; // re-clic = referme
    render();
  }

  // ── CONFIRMER / REFUSER ─────────────────────────────────────────────────────
  //  Une seule source de vérité : le serveur. On enregistre, puis on RECHARGE le
  //  mois — le rapport revient avec les décisions déjà posées dessus. Les vues
  //  studio et commercial sont donc d'accord sans effort : elles lisent le même
  //  rapport, et le KPI vient du serveur, jamais d'un calcul local optimiste.
  async function deciderRapprochement(bouton) {
    const [statut, client, idClient, nomDeciplus] = String(bouton.dataset.match || '').split('|');
    if (!client || !idClient) return;
    // Garde-fou léger sur le refus seulement : confirmer se répare d'un clic,
    // refuser fait disparaître la proposition.
    if (statut === 'rejected'
      && !window.confirm('Refuser ce rapprochement ?\n\n' + client + '   ✕   ' + nomDeciplus
        + '\n\nIl ne sera plus proposé.')) return;

    const boutons = $$('#rec2-body [data-match]');
    boutons.forEach((b) => { b.disabled = true; });
    const avant = bouton.textContent;
    bouton.textContent = '…';
    try {
      const r = await fetch('/api/recap2/matches', {
        method: 'POST', headers: H(),
        body: JSON.stringify({ client, idClient, nomDeciplus, statut, methode: 'fuzzy' }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        throw new Error((j && j.error) || ('HTTP ' + r.status));
      }
      await charger();   // le serveur repose les décisions : l'écran suit
    } catch (err) {
      boutons.forEach((b) => { b.disabled = false; });
      bouton.textContent = avant;
      alert('Décision non enregistrée : ' + (err && err.message ? err.message : 'erreur'));
    }
  }

  return { open };
})();
