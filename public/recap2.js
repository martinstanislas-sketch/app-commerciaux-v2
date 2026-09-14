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

  function open() {
    if (!inited) { wire(); inited = true; }
    if (!$('#rec2-mois').value) $('#rec2-mois').value = moisParDefaut();
    mois = $('#rec2-mois').value;
    charger();
  }

  function wire() {
    $('#rec2-mois').addEventListener('change', () => {
      mois = $('#rec2-mois').value; ouvert = ''; alertesOuvertes = false;
      commercial = ''; filtreCom = 'tous'; charger();
    });
    $('#rec2-body').addEventListener('click', onBodyClick);
    const sel = $('#rec2-commercial');
    if (sel) sel.addEventListener('change', () => { commercial = sel.value; filtreCom = 'tous'; ouvert = ''; render(); });
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
    if (commercial && !liste.some((c) => c.commercial === commercial)) commercial = '';
    const opts = ['<option value="">Tous les commerciaux</option>'].concat(liste.map((c) => {
      const lbl = MM.libelleCommercial(c.commercial) || '(sans nom)';
      return '<option value="' + esc(c.commercial) + '"' + (c.commercial === commercial ? ' selected' : '') + '>'
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
    etat = 'chargement'; rapport = null; message = ''; render();
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
    return '<section class="rec2-studio"><h3 class="rec2-studio-nom">' + esc(label.toUpperCase()) + '</h3>' + corps + '</section>';
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
  const titre2 = () => (estV2() ? 'CLIENTS RETROUVÉS DANS DECIPLUS' : 'COMPLÉTION (ancienne règle)');

  function carteCrm(label, d) {
    if (!d) return carteNA(titre2(), 'indicateur absent du fichier');
    const n = d.signataires;
    const sous = n > 0
      ? d.retrouves + ' / ' + n + ' signataire' + (n > 1 ? 's' : '') + ' de ' + moisLabel(rapport.mois)
      : '0 vente signée';
    return carte(label, 'crm', titre2(), pct(d.taux), sous, ouvert === label + '|crm', n > 0);
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
  function nomClient(v) {
    const nom = esc(v.client);
    if (!v || !v.retrouve) return nom;                    // un « à vérifier » n'a pas de fiche
    const R = window.Retention;
    const href = (R && R.lienDeciplusId) ? R.lienDeciplusId(v.idClient) : null;
    if (!href) return nom;                                // id absent ou douteux -> texte simple
    return '<a class="rec2-lien-fiche" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer"'
      + ' title="Ouvrir la fiche Deciplus dans un nouvel onglet">' + nom + '</a>';
  }

  // ── DÉTAILS (fermés par défaut, un seul ouvert à la fois) ────────────────────
  function detail(label, b) {
    if (ouvert === label + '|nr') return detailNR(label, b.nonReconduction);
    if (ouvert === label + '|comp') return detailComp(label, b.completion);
    if (ouvert === label + '|crm') return detailCrm(label, b.clientsRetrouves);
    return '';
  }
  const detailHead = (titre) => '<div class="rec2-det-head"><span>' + titre + '</span>'
    + '<button type="button" class="rec2-det-x" data-close="1" aria-label="Fermer le détail">✕ Fermer</button></div>';

  function detailNR(label, d) {
    const liste = (d && d.liste) || [];
    const m1 = cap(moisLabel(rapport.m1)), m = cap(moisLabel(rapport.mois));
    const lignes = liste.map((c) => '<tr><td>' + esc(c.client) + '</td>'
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
    const liste = tous.filter((c) => f === 'tous' || (f === 'retrouves' ? c.retrouve : !c.retrouve));
    const nbT = tous.filter((c) => c.retrouve).length;
    const chip = (val, txt, n) => '<button type="button" class="rec2-chip' + (f === val ? ' is-on' : '')
      + '" data-filtrecrm="' + esc(label) + '|' + val + '">' + txt + ' <b>' + n + '</b></button>';
    const chips = '<div class="rec2-chips">' + chip('tous', 'Tous', tous.length)
      + chip('retrouves', 'Retrouvés', nbT) + chip('verifier', 'À vérifier', tous.length - nbT) + '</div>';

    const statut = (c) => {
      if (!c.retrouve) return '<span class="rec2-etat is-non">À vérifier</span>';
      const ailleurs = c.site && window.Recap2Metrics && window.Recap2Metrics.studioLabel
        && window.Recap2Metrics.studioLabel(c.site) !== label;
      const notes = [];
      if (c.dateVente) notes.push('le ' + esc(c.dateVente));
      if (ailleurs) notes.push('site ' + esc(c.site));
      if (c.encaisse === false) notes.push('pas encore encaissé');
      return '<span class="rec2-etat is-oui">Retrouvée</span>'
        + (notes.length ? ' <span class="rec2-det-date">' + notes.join(' · ') + '</span>' : '');
    };
    const lignes = liste.map((c) => '<tr><td>' + nomClient(c)
      + (c.date ? ' <span class="rec2-det-date">signé le ' + esc(c.date) + '</span>' : '') + '</td>'
      + '<td>' + esc(c.prestation || '—') + '</td>'
      + '<td>' + esc(c.commercial || '—') + '</td>'
      + '<td class="rec2-num">' + statut(c) + '</td></tr>').join('');
    const corps = liste.length
      ? '<table class="rec2-table"><thead><tr><th>Signataire ' + esc(cap(moisLabel(rapport.mois)))
        + '</th><th>Prestation</th><th>Commercial</th><th class="rec2-num">Dans Deciplus</th></tr></thead><tbody>'
        + lignes + '</tbody></table>'
      : '<p class="rec2-info">Aucune vente dans ce filtre.</p>';
    const notes = [];
    if (d && d.annulesExclus) notes.push(d.annulesExclus + ' vente(s) annulée(s) exclue(s) du calcul.');
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
    const nom = MM.libelleCommercial(commercial) || '(sans nom)';

    if (!d.total) {
      return '<section class="rec2-com"><div class="rec2-com-head"><h3 class="rec2-com-nom">'
        + esc(nom.toUpperCase()) + ' — ' + esc(cap(moisLabel(rapport.mois))) + '</h3></div>'
        + '<p class="rec2-info">Aucune vente pour ce commercial sur ce mois.</p></section>';
    }

    const liste = d.ventes.filter((v) => filtreCom === 'tous'
      || (filtreCom === 'retrouves' ? v.retrouve : !v.retrouve));
    const chip = (val, txt, n) => '<button type="button" class="rec2-chip' + (filtreCom === val ? ' is-on' : '')
      + '" data-filtrecom="' + val + '">' + txt + ' <b>' + n + '</b></button>';

    const statut = (v) => {
      if (!v.retrouve) return '<span class="rec2-etat is-non">À vérifier</span>';
      const ailleurs = v.site && MM.studioLabel && MM.studioLabel(v.site) !== v.studio;
      const notes = [];
      if (v.dateVente) notes.push('le ' + esc(v.dateVente));
      if (ailleurs) notes.push('site ' + esc(v.site));
      if (v.encaisse === false) notes.push('pas encore encaissé');
      return '<span class="rec2-etat is-oui">Retrouvée</span>'
        + (notes.length ? ' <span class="rec2-det-date">' + notes.join(' · ') + '</span>' : '');
    };

    const lignes = liste.map((v) => '<tr>'
      + '<td class="rec2-com-studio">' + esc(v.studio) + '</td>'
      + '<td>' + nomClient(v) + '</td>'
      + '<td class="rec2-num">' + esc(v.date || '—') + '</td>'
      + '<td>' + esc(v.prestation || '—') + '</td>'
      + '<td>' + esc(nom) + '</td>'
      + '<td class="rec2-num">' + statut(v) + '</td></tr>').join('');

    const corps = liste.length
      ? '<table class="rec2-table rec2-com-table"><thead><tr><th>Studio</th><th>Signataire</th>'
        + '<th class="rec2-num">Signé le</th><th>Prestation</th><th>Commercial</th>'
        + '<th class="rec2-num">Dans Deciplus</th></tr></thead><tbody>' + lignes + '</tbody></table>'
      : '<p class="rec2-info">Aucune vente dans ce filtre.</p>';

    const stats = '<div class="rec2-com-stats">'
      + '<span class="rec2-com-taux">' + pct(d.taux) + '</span>'
      + '<span class="rec2-com-det"><b>' + d.total + '</b> vente' + (d.total > 1 ? 's' : '') + ' valide' + (d.total > 1 ? 's' : '') + '</span>'
      + '<span class="rec2-com-det"><b>' + d.retrouves + '</b> retrouvée' + (d.retrouves > 1 ? 's' : '') + ' dans Deciplus</span>'
      + '<span class="rec2-com-det"><b>' + d.aVerifier + '</b> à vérifier</span>'
      + '</div>';
    const ou = '<p class="rec2-com-studios">Studios : ' + esc(d.studios.join(', ')) + '</p>';

    return '<section class="rec2-com">'
      + '<div class="rec2-com-head"><h3 class="rec2-com-nom">' + esc(nom.toUpperCase()) + ' — '
      + esc(cap(moisLabel(rapport.mois))) + '</h3>'
      + '<button type="button" class="rec2-det-x" data-toutcom="1">✕ Tous les commerciaux</button></div>'
      + stats + ou
      + '<div class="rec2-chips">' + chip('tous', 'Tous', d.total)
      + chip('retrouves', 'Retrouvés', d.retrouves) + chip('verifier', 'À vérifier', d.aVerifier) + '</div>'
      + corps
      + '<p class="rec2-det-note">Ce filtre ne concerne que « clients retrouvés dans Deciplus ». '
      + 'La non-reconduction, ci-dessous, ne dépend d\'aucun commercial.</p>'
      + '</section>';
  }

  // ── INTERACTIONS ────────────────────────────────────────────────────────────
  function onBodyClick(e) {
    if (e.target.closest('[data-alertes]')) { alertesOuvertes = !alertesOuvertes; render(); return; }
    const fil = e.target.closest('[data-filtre]');
    if (fil) { const [label, val] = fil.dataset.filtre.split('|'); filtreComp[label] = val; render(); return; }
    const fCom = e.target.closest('[data-filtrecom]');
    if (fCom) { filtreCom = fCom.dataset.filtrecom; render(); return; }
    if (e.target.closest('[data-toutcom]')) {
      commercial = ''; filtreCom = 'tous';
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

  return { open };
})();
