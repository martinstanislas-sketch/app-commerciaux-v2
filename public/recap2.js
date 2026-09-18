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
  let filtreNR = {};        // studio -> 'tous' | un statut effectif | 'non_controle'

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
  let vniComOuvert = false; // détail des VNI du commercial
  let animerOuverture = false; // le prochain rendu fait entrer le détail en fondu

  function open() {
    if (!inited) { wire(); inited = true; }
    if (!$('#rec2-mois').value) $('#rec2-mois').value = moisParDefaut();
    mois = $('#rec2-mois').value;
    charger();
  }

  function wire() {
    $('#rec2-mois').addEventListener('change', () => {
      mois = $('#rec2-mois').value; ouvert = ''; alertesOuvertes = false;
      commercial = ''; filtreCom = 'tous'; refsOuvertes = false; vniComOuvert = false; charger();
    });
    $('#rec2-body').addEventListener('click', onBodyClick);
    // Les cases de contrôle : `change`, pour ne réagir qu'à un vrai basculement.
    $('#rec2-body').addEventListener('change', (e) => {
      const box = e.target.closest && e.target.closest('input[data-ctl]');
      if (box && rapport) { enregistrerControle(box); return; }
      const force = e.target.closest && e.target.closest('select[data-force]');
      if (force && rapport) { enregistrerForcage(force); return; }
      const verif = e.target.closest && e.target.closest('select[data-verif]');
      if (verif && rapport) { enregistrerVerification(verif); return; }
      const reint = e.target.closest && e.target.closest('select[data-reintegration]');
      if (reint && rapport) { enregistrerReintegration(reint); return; }
      const flex = e.target.closest && e.target.closest('select[data-flex]');
      if (flex && rapport) { enregistrerFlex(flex); return; }
      const nrSel = e.target.closest && e.target.closest('select[data-nrstatut]');
      if (nrSel && rapport) { enregistrerStatutNR(nrSel); return; }
      const nrCom = e.target.closest && e.target.closest('select[data-nrcom]');
      if (nrCom && rapport) { enregistrerCommercialNR(nrCom); return; }
      const resil = e.target.closest && e.target.closest('input[data-resil]');
      if (resil && rapport) basculerResiliation(resil);
    });
    // Le texte d'une remarque en cours de saisie : gardé dans l'état, pour qu'un
    // rendu (autre case cochée, filtre) ne l'efface pas.
    $('#rec2-body').addEventListener('input', (e) => {
      const zone = e.target.closest && e.target.closest('textarea[data-note-texte]');
      if (zone && editionNote) editionNote.texte = zone.value;
      const zoneAuto = e.target.closest && e.target.closest('textarea[data-auto-texte]');
      if (zoneAuto && editionAuto) editionAuto.texte = zoneAuto.value;
    });
    suivreHautDePage();
    const sel = $('#rec2-commercial');
    if (sel) sel.addEventListener('change', () => { commercial = sel.value; filtreCom = 'tous'; refsOuvertes = false; vniComOuvert = false; ouvert = ''; render(); });
  }

  // ── EN-TÊTE DE STUDIO COLLANT ──────────────────────────────────────────────
  //  Pur affichage. L'en-tête d'un studio reste visible pendant qu'on parcourt
  //  ce studio, calé SOUS la barre du haut — elle-même collante et de hauteur
  //  variable selon la largeur d'écran, d'où la mesure. `is-colle` ne sert qu'à
  //  poser l'ombre de séparation quand l'en-tête est effectivement décollé.
  function suivreHautDePage() {
    const tab = $('#tab-recap2');
    const barre = document.querySelector('body > header');
    if (!tab || !barre) return;
    const maj = () => {
      const collante = getComputedStyle(barre).position === 'sticky';
      tab.style.setProperty('--rec2-haut', (collante ? barre.offsetHeight : 0) + 'px');
      mesurerEntetes();
      marquerEntetesColles();
    };
    if (window.ResizeObserver) new ResizeObserver(maj).observe(barre);
    window.addEventListener('resize', maj);
    let attente = false;
    window.addEventListener('scroll', () => {
      if (attente) return;
      attente = true;
      requestAnimationFrame(() => { attente = false; marquerEntetesColles(); });
    }, { passive: true });
    maj();
  }
  // Chaque studio connaît la hauteur de SON en-tête (elle varie si la ligne passe
  // sur deux lignes) : l'en-tête de colonnes de ses tableaux se cale juste dessous.
  function mesurerEntetes() {
    $$('#rec2-body .rec2-studio-tete').forEach((t) => {
      t.parentElement.style.setProperty('--rec2-tete', t.offsetHeight + 'px');
    });
  }
  function marquerEntetesColles() {
    const tab = $('#tab-recap2');
    if (!tab || !tab.classList.contains('active')) return;
    const haut = parseFloat(tab.style.getPropertyValue('--rec2-haut')) || 0;
    $$('#rec2-body .rec2-studio-tete').forEach((t) => {
      const section = t.parentElement.getBoundingClientRect();
      t.classList.toggle('is-colle', section.top < haut - 1 && section.bottom > haut + t.offsetHeight);
    });
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
    etat = 'chargement'; rapport = null; message = ''; editionResil = null; editionNote = null; editionAuto = null; render();
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
  // Affichage à l'entier le plus proche (14,7 % -> 15 %). Format seulement : le
  // taux lui-même, les contrôles de cohérence et les ratios restent intacts.
  // toFixed(6) d'abord : 0,145 × 100 vaut 14,4999… en flottant, et doit donner 15.
  const pct = (x) => (x == null ? '—' : Math.round(Number((x * 100).toFixed(6))) + ' %');
  const eur = (n) => (Number(n) || 0).toFixed(2).replace('.', ',') + ' €';
  // Cellule de montant : négatif en rouge, nul atténué. Le texte est celui de eur().
  const celluleMontant = (n) => {
    const c = Math.round((Number(n) || 0) * 100);
    return '<td class="rec2-num rec2-montant' + (c < 0 ? ' is-neg' : c === 0 ? ' is-nul' : '') + '">' + esc(eur(n)) + '</td>';
  };
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
    // Fraîcheur/provenance à gauche, contrôles à droite, sur UNE ligne ; la
    // liste des contrôles, quand elle est ouverte, se déplie en dessous.
    const alertes = bandeauAlertes();
    host.innerHTML = '<div class="rec2-barre">' + bandeauSource() + alertes.bouton + '</div>' + alertes.liste
      + vueCommercial() + LABELS.map(blocStudio).join('');
    mesurerEntetes();
    marquerEntetesColles();
    if (animerOuverture) {
      animerOuverture = false;
      const d = host.querySelector('.rec2-detail, .rec2-alertes-liste');
      if (d) d.classList.add('rec2-anim-entree');
    }
  }

  // ── MICRO-INTERACTIONS (affichage seulement) ────────────────────────────────
  const mouvementReduit = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  // Referme en fondu, PUIS applique exactement le même changement d'état qu'avant.
  function fermerEnDouceur(el, appliquer) {
    if (!el || mouvementReduit()) { appliquer(); render(); return; }
    el.classList.add('rec2-anim-sortie');
    setTimeout(() => { appliquer(); render(); }, 150);
  }
  // « Copié ✓ » sur le bouton pendant 2 s, uniquement après une copie réussie.
  function confirmerCopie(bouton) {
    if (!bouton.dataset.libelle) bouton.dataset.libelle = bouton.textContent;
    bouton.style.minWidth = bouton.offsetWidth + 'px';   // pas de saut de mise en page
    bouton.textContent = 'Copié ✓';
    bouton.classList.add('is-copie');
    clearTimeout(bouton._minuteur);
    bouton._minuteur = setTimeout(() => {
      bouton.textContent = bouton.dataset.libelle;
      bouton.classList.remove('is-copie');
      bouton.style.minWidth = '';
    }, 2000);
  }

  // Fraîcheur + provenance, discrets, en haut.
  function bandeauSource() {
    const manquants = LABELS.filter((s) => !(rapport.studios && rapport.studios[s]));
    return '<div class="rec2-meta">'
      + '<span>Données actualisées le <b>' + esc(fmtDate(rapport.genere)) + '</b></span>'
      + '<span class="rec2-meta-sep" aria-hidden="true">·</span>'
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
    if (!liste.length) return { bouton: '', liste: '' };
    const n = liste.length;
    return {
      bouton: '<div class="rec2-alertes">'
        + '<button type="button" class="rec2-alertes-btn" data-alertes="1" aria-expanded="' + (alertesOuvertes ? 'true' : 'false') + '">'
        + '<span class="rec2-alertes-ico" aria-hidden="true">⚠</span> ' + n + ' contrôle' + (n > 1 ? 's' : '') + ' à vérifier</button></div>',
      liste: alertesOuvertes ? '<ul class="rec2-alertes-liste">'
        + liste.map((a) => '<li><b>' + esc(a.studio) + '</b> — ' + esc(a.texte) + '</li>').join('') + '</ul>' : '',
    };
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
      corps = '<div class="rec2-cards">' + carteNA('NON-RECONDUCTION', r) + carteNA(t2, r) + '</div>' + detailVniOuvert(label, b);
    } else {
      const pb = incoherences(b);
      if (pb.length) {
        corps = '<div class="rec2-cards">' + carteNA('NON-RECONDUCTION', pb.join(' · ')) + carteNA(t2, pb.join(' · ')) + '</div>' + detailVniOuvert(label, b);
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
    return '<section class="rec2-studio"><div class="rec2-studio-tete"><h3 class="rec2-studio-nom">' + esc(label) + '</h3>'
      + caStudio(label, b) + compteurVniStudio(label, b) + boutonCopierClub(label, b) + '</div>' + corps + '</section>';
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
    return '<span class="rec2-studio-ca" title="' + esc(titre) + '"><span class="rec2-studio-ca-lbl">CA ' + esc(moisLabel(rapport.mois).toUpperCase())
      + (ca.partielAu ? ' <i class="rec2-studio-ca-partiel">(au ' + esc(ca.partielAu) + ')</i>' : '')
      + '</span> <b>' + esc(MM.eurosArrondis(ca.montant)) + '</b></span>';
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
  // ── RÉINTÉGRATION MANUELLE D'UNE VENTE ANNULÉE ─────────────────────────────
  //  Trois informations toujours distinctes : statut automatique (Annulée),
  //  décision manuelle (Réintégrée dans les chiffres), statut final dans les
  //  KPI (Vente comptabilisée). Administrateur seulement, réversible.
  function blocReintegration(v, studio) {
    const r = v.reintegration;
    const admin = !!(window.isAdmin && window.isAdmin());
    const d = ' data-studio="' + esc(studio || '') + '" data-client="' + esc(v.client) + '" data-date="' + esc(v.date || '') + '"';
    const choix = (sel) => admin ? '<div class="rec2-verif"><select class="rec2-verif-sel" data-reintegration="1"' + d
      + ' aria-label="' + esc('Vente annulée — ' + v.client) + '">'
      + '<option value="maintenir"' + (sel === 'maintenir' ? ' selected' : '') + '>' + (sel === 'reintegrer' ? 'Remettre en annulée' : 'Maintenir annulée') + '</option>'
      + '<option value="reintegrer"' + (sel === 'reintegrer' ? ' selected' : '') + '>Réintégrer dans les chiffres</option></select></div>' : '';
    if (r && r.decision === 'reintegree' && !r.plusNecessaire) {
      return '<div class="rec2-reint">'
        + '<span class="rec2-etat is-valide">Réintégrée manuellement ✅' + (r.modifiePar ? ' par ' + esc(r.modifiePar) : '') + (r.modifieLe ? ' le ' + esc(fmtDate(r.modifieLe)) : '') + '</span>'
        + '<div class="rec2-reint-lignes"><div>Statut automatique : <b>Annulée</b>'
        + (v.annulationAuto && v.annulationAuto.dateAnnulation ? ' — détectée automatiquement comme annulée le ' + esc(v.annulationAuto.dateAnnulation) : '') + '</div>'
        + '<div>Décision manuelle : <b>Réintégrée dans les chiffres</b></div>'
        + '<div>Statut final dans les KPI : <b>Vente comptabilisée</b></div></div>' + choix('reintegrer') + '</div>';
    }
    if (r && r.plusNecessaire) {
      return '<div class="rec2-reint"><span class="rec2-auto-alerte">Réintégration manuelle plus nécessaire : la vente n’est plus annulée à la dernière collecte'
        + ' (décision du ' + esc(fmtDate(r.modifieLe)) + (r.modifiePar ? ' par ' + esc(r.modifiePar) : '') + ' conservée dans l’historique).</span></div>';
    }
    if (v.annulee) return choix('maintenir');
    return '';
  }
  async function enregistrerReintegration(sel) {
    const d = sel.dataset;
    sel.disabled = true;
    try {
      const r = await fetch('/api/recap2/reintegration', { method: 'POST', headers: H(),
        body: JSON.stringify({ mois: rapport.mois, studio: d.studio, client: d.client, date: d.date, decision: sel.value }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.ok) throw new Error((j && j.error) || ('HTTP ' + r.status));
      charger(); // tout se recalcule côté serveur (compteurs, contrôles, remarques)
    } catch (err) {
      sel.disabled = false;
      alert('Décision non enregistrée : ' + (err && err.message ? err.message : 'erreur'));
      render();
    }
  }

  function statutVente(v, studioAttendu) {
    const auto = v.reintegration ? blocReintegration(v, studioAttendu) + (v.annulee ? '' : statutVenteAuto(v, studioAttendu))
      : statutVenteAuto(v, studioAttendu) + (v.annulee ? blocReintegration(v, studioAttendu) : '');
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
    if (!v.retrouve && v.verification && v.verification.verifiee) {
      // VÉRIFIÉE À LA MAIN : un administrateur a contrôlé lui-même, après coup.
      //  On ne dit JAMAIS « Retrouvée » : la collecte, elle, n'a rien trouvé, et
      //  ce résultat automatique reste intact dans les données (`retrouve`).
      //  Elle compte comme conforme dans « Contrats validés ».
      const q = v.verification;
      const qui = (q.modifiePar ? ' par ' + q.modifiePar : '') + (q.modifieLe ? ' le ' + fmtDate(q.modifieLe) : '');
      return '<span class="rec2-etat is-verif" title="'
        + esc('Vérifiée à la main' + qui + ' — recherche automatique : aucune vente Deciplus trouvée')
        + '">Vérifiée manuellement ✅</span>'
        + ' <span class="rec2-det-date">vérifiée à la main' + esc(qui) + '</span>'
        + lienFiche(v) + choixVerification(v, studioAttendu);
    }
    if (!v.retrouve) {
      // « À VÉRIFIER » : aucune vente trouvée. Deux cas, jamais confondus :
      //  · FICHE TROUVÉE — la personne existe dans Deciplus, mais aucune vente
      //    n'y est saisie. Accès direct à sa fiche ; RIEN à confirmer, aucun
      //    effet sur le KPI : trouver la fiche ne prouve pas la vente ;
      //  · rien de fiable — une vraie action de recherche. Deciplus ne permet
      //    pas de préremplir la recherche par un lien : on ouvre l'écran
      //    Membres et on copie le nom, et le libellé le dit.
      const refus = v.refuse ? ' <span class="rec2-det-date">rapprochement refusé</span>' : '';
      const precision = v.ficheId ? ' <span class="rec2-det-date">fiche trouvée, aucune vente saisie</span>' : '';
      return '<span class="rec2-etat is-non">À vérifier</span>' + precision + refus
        + lienFiche(v) + choixVerification(v, studioAttendu);
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

  // Le lien Deciplus d'une vente NON retrouvée : sa fiche si on l'a trouvée,
  // sinon l'écran Membres (Deciplus refuse de préremplir une recherche). Il
  // reste accessible, vérifiée à la main ou non.
  function lienFiche(v) {
    const R = window.Retention;
    if (!R) return '';
    const hrefFiche = (v.ficheId && R.lienDeciplusId) ? R.lienDeciplusId(v.ficheId) : null;
    if (hrefFiche) {
      return '<div class="rec2-action"><a class="rec2-lien-fiche" href="' + esc(hrefFiche) + '" target="_blank" rel="noopener noreferrer"'
        + ' title="Fiche Deciplus ' + esc(v.ficheNom || v.client) + (v.ficheSite ? ' · ' + esc(v.ficheSite) : '') + '">Ouvrir la fiche Deciplus ↗</a></div>';
    }
    const rech = R.lienRechercheDeciplus ? R.lienRechercheDeciplus() : null;
    if (!rech) return '';
    return '<div class="rec2-action"><a class="rec2-lien-rech" href="' + esc(rech) + '" target="_blank" rel="noopener noreferrer"'
      + ' data-copier="' + esc(v.client) + '" title="Ouvre l\'écran Membres de Deciplus — la recherche n\'est pas préremplie, le nom « '
      + esc(v.client) + ' » est copié dans le presse-papiers">Rechercher dans Deciplus ↗</a></div>';
  }

  // ── VÉRIFICATION MANUELLE D'UNE VENTE « À VÉRIFIER » ────────────────────────
  //  Réservée à l'administrateur (le serveur le vérifie aussi). Deux choix
  //  seulement : « Validée manuellement » ou « Laisser à vérifier ». Rien n'est
  //  écrit dans Deciplus ; `retrouve` n'est jamais modifié.
  function choixVerification(v, studio) {
    if (!(window.isAdmin && window.isAdmin())) return '';
    const verifiee = !!(v.verification && v.verification.verifiee);
    const opt = (val, txt) => '<option value="' + val + '"' + (verifiee === (val === 'verifiee') ? ' selected' : '') + '>' + txt + '</option>';
    return '<div class="rec2-verif"><select class="rec2-verif-sel" data-verif="vente"'
      + ' data-studio="' + esc(studio) + '" data-client="' + esc(v.client) + '" data-date="' + esc(v.date || '') + '"'
      + ' aria-label="' + esc('Vérification manuelle — ' + v.client) + '"'
      + ' title="Après contrôle humain : valider cette vente, ou la laisser à vérifier.">'
      + opt('a_verifier', 'Laisser à vérifier') + opt('verifiee', 'Validée manuellement') + '</select></div>';
  }
  async function enregistrerVerification(sel) {
    const d = sel.dataset;
    sel.disabled = true;
    try {
      const r = await fetch('/api/recap2/verification', {
        method: 'POST', headers: H(),
        body: JSON.stringify({ mois: rapport.mois, studio: d.studio, client: d.client, date: d.date, valeur: sel.value, type: d.verif }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.ok) throw new Error((j && j.error) || ('HTTP ' + r.status));
      const cr = rapport.studios && rapport.studios[d.studio] && rapport.studios[d.studio].clientsRetrouves;
      const ligne = cr && (cr.liste || []).find((l) => l.client === d.client && (l.date || '') === d.date);
      if (ligne) {
        if (j.ligne && j.ligne.verification) ligne.verification = j.ligne.verification; else delete ligne.verification;
        if (j.ligne && j.ligne.ecartSite) ligne.ecartSite = j.ligne.ecartSite; else delete ligne.ecartSite;
      }
      render();
    } catch (err) {
      sel.disabled = false;
      alert('Vérification non enregistrée : ' + (err && err.message ? err.message : 'erreur'));
      render();
    }
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
      return { note: 'encaissé le ' + esc(court(p.premier)) + (suivant
        ? ' <span class="rec2-decale" title="Premier encaissement le mois suivant la signature — dans les 31 jours, ce n\'est pas une anomalie">mois suivant</span>'
        : ''), alerte: '' };
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
  //  Un écart ACQUITTÉ à la main (« Écart de site vérifié ») ne compte plus
  //  nulle part : ni compteur, ni filtre, ni liseré. L'écart brut, lui, reste
  //  lisible dans les données (`site`) et s'affiche encore sur la ligne.
  function divergenceBrute(v, studioAttendu) {
    const MM = window.Recap2Metrics;
    return (MM && MM.siteDivergent) ? MM.siteDivergent(v, studioAttendu) : null;
  }
  const ecartSiteVerifie = (v) => !!(v && v.ecartSite && v.ecartSite.verifiee);
  function divergence(v, studioAttendu) {
    return ecartSiteVerifie(v) ? null : divergenceBrute(v, studioAttendu);
  }
  function anomalieSite(v, studioAttendu) {
    const d = divergenceBrute(v, studioAttendu);
    if (!d) return '';
    const ou = '<span class="rec2-div-qui">Studio attendu : <b>' + esc(d.attendu) + '</b>'
      + ' · Site Deciplus trouvé : <b>' + esc(d.site) + '</b></span>';
    if (ecartSiteVerifie(v)) {
      // ACQUITTÉ : l'écart automatique reste affiché et enregistré tel quel ;
      // seule l'alerte à traiter disparaît. La vente n'a pas changé de studio.
      const q = v.ecartSite;
      const qui = (q.modifiePar ? ' par ' + q.modifiePar : '') + (q.modifieLe ? ' le ' + fmtDate(q.modifieLe) : '');
      return '<div class="rec2-div">'
        + '<span class="rec2-etat is-verif" title="' + esc('Écart de site vérifié à la main' + qui
          + ' — le site Deciplus trouvé reste inchangé, et la vente reste comptée sur ' + d.attendu) + '">Écart de site vérifié ✅</span>'
        + ou + '<span class="rec2-det-date">vérifié à la main' + esc(qui) + '</span>'
        + choixEcartSite(v, studioAttendu) + '</div>';
    }
    return '<div class="rec2-div">'
      + '<span class="rec2-etat is-div">⚠ Site Deciplus divergent</span>'
      + ou + choixEcartSite(v, studioAttendu) + '</div>';
  }
  // Acquitter l'écart, ou le remettre à traiter. Administrateur seulement.
  function choixEcartSite(v, studio) {
    if (!(window.isAdmin && window.isAdmin())) return '';
    const fait = ecartSiteVerifie(v);
    const opt = (val, txt) => '<option value="' + val + '"' + (fait === (val === 'verifiee') ? ' selected' : '') + '>' + txt + '</option>';
    return '<div class="rec2-verif"><select class="rec2-verif-sel" data-verif="site"'
      + ' data-studio="' + esc(studio) + '" data-client="' + esc(v.client) + '" data-date="' + esc(v.date || '') + '"'
      + ' aria-label="' + esc('Écart de site — ' + v.client) + '"'
      + ' title="Après contrôle humain : marquer cet écart comme vérifié, ou le laisser à traiter. Rien n\'est modifié dans Deciplus, et la vente reste comptée sur son studio.">'
      + opt('a_verifier', 'Écart à traiter') + opt('verifiee', 'Marquer comme vérifié') + '</select></div>';
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
    const verifiee = window.Recap2Metrics.motifValidation(v) === 'verification';
    if (f === 'verifiees') return verifiee;
    if (f === 'verifier') return !v.annulee && !v.retrouve && !v.candidat && !prel && !verifiee;
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
    // Vérifiées à la main : ni « proposées », ni « à vérifier », ni « retrouvées ».
    const verifiees = l.filter((v) => window.Recap2Metrics.motifValidation(v) === 'verification').length;
    const proposes = l.filter((v) => !v.annulee && !v.retrouve && v.candidat
      && ['prelevement', 'verification'].indexOf(window.Recap2Metrics.motifValidation(v)) < 0).length;
    const divergents = l.filter((v) => divergence(v, studio)).length;
    // Résiliés : un repérage, compté à part — ils restent dans `retrouves` et `actives`.
    // Une annulée FB marquée résiliée compte ici — et reste comptée dans `annulees`.
    const resilies = l.filter((v) => v.resiliation && v.resiliation.resilie).length;
    return { total: l.length, annulees, actives: l.length - annulees, retrouves, valides, proposes, divergents, resilies, prelevements, verifiees,
      aVerifier: l.length - annulees - retrouves - proposes - prelevements - verifiees };
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
    return avecAuto(casesPrelevementReservation(v, studio), v, ['prelevement', 'reservation'], studio)
      + avecAuto(celluleResiliation(v, studio), v, ['resilie'], studio);
  }
  // ── CONTRÔLE AUTOMATIQUE (Deciplus, lib/recap2Automatique.js) ──────────────
  //  Affiché SOUS la case manuelle, jamais à sa place : la case reste l'outil
  //  de correction et, cochée, elle l'emporte (« manuel »). Aucun compteur n'en dépend.
  const AUTO_TXT = { ok: '✅', ko: '❌', a_verifier: 'À vérifier' };
  // Source affichée : « auto » (moteur) ou « manuel » (forçage 3 états, ou case
  // historique cochée). Le sélecteur pose / retire le forçage — jamais la case.
  function pastilleAuto(v, champ, studio) {
    const o = v.operationnel;
    if (!o) return '';
    const val = o[champ];
    const src = o.sources && o.sources[champ];
    const manuel = src === 'force' || src === 'manuel';
    const auto = v.automatique && v.automatique[champ];
    const fo = o.forcages && o.forcages[champ];
    const titre = manuel
      ? (src === 'force' ? 'Forcé à la main' + (fo && fo.modifieLe ? ' le ' + fmtDate(fo.modifieLe) + (fo.modifiePar ? ' par ' + fo.modifiePar : '') : '') : 'Case cochée à la main')
        + (auto ? ' — automatique : ' + AUTO_TXT[auto] : '')
      : 'Contrôle automatique Deciplus' + (v.automatique && v.automatique.raison ? ' — ' + v.automatique.raison : '');
    const pastille = val
      ? '<span class="rec2-auto-val is-' + val + (manuel ? ' is-manuel' : '') + '">' + (manuel ? 'manuel ' : 'auto ') + AUTO_TXT[val] + '</span>'
      : '';
    const choix = [['auto', 'Automatique'], ['ok', 'Forcé ✅'], ['ko', 'Forcé ❌']]
      .map(([x, t]) => '<option value="' + x + '"' + ((fo ? fo.valeur : 'auto') === x ? ' selected' : '') + '>' + t + '</option>').join('');
    return '<div class="rec2-auto" title="' + esc(titre) + '">' + pastille
      + '<select class="rec2-force" data-force="' + champ + '" data-studio="' + esc(studio) + '" data-client="' + esc(v.client)
      + '" data-date="' + esc(v.date || '') + '" aria-label="' + esc('Forçage ' + champ + ' — ' + v.client) + '">' + choix + '</select></div>';
  }
  async function enregistrerForcage(sel) {
    const d = sel.dataset;
    sel.disabled = true;
    try {
      const r = await fetch('/api/recap2/forcage', {
        method: 'POST', headers: H(),
        body: JSON.stringify({ mois: rapport.mois, studio: d.studio, client: d.client, date: d.date, champ: d.force, valeur: sel.value }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.ok) throw new Error((j && j.error) || ('HTTP ' + r.status));
      const cr = rapport.studios && rapport.studios[d.studio] && rapport.studios[d.studio].clientsRetrouves;
      const ligne = cr && (cr.liste || []).find((l) => l.client === d.client && (l.date || '') === d.date);
      if (ligne) ligne.operationnel = j.operationnel;
      render();
    } catch (err) {
      sel.disabled = false;
      alert('Forçage non enregistré : ' + (err && err.message ? err.message : 'erreur'));
      render();
    }
  }
  // Insère la pastille dans chaque <td> produit par les cellules existantes.
  function avecAuto(html, v, champs, studio) {
    if (!v.operationnel) return html;
    let i = 0;
    return html.replace(/<\/td>/g, (m) => pastilleAuto(v, champs[i++], studio) + m);
  }
  // ── REMARQUES AUTOMATIQUES ADRESSÉES AU CONSEILLER ────────────────────────
  //  Calculées (public/recap2-conseils.js) à partir de l'état AFFICHÉ, forçage
  //  compris : rien en base, aucun doublon, et elles s'effacent d'elles-mêmes
  //  quand le problème est réglé. Elles ne remplacent JAMAIS la remarque
  //  manuelle, qui garde sa ligne et son bouton juste en dessous.
  function blocConseils(v, studio) {
    const C = window.Recap2Conseils;
    if (!C) return '';
    return blocRemarquesAuto('vente', studio, v, C.conseilsVente(v, { controle: C.moisControle(rapport) }),
      'Remarque automatique, d\'après le contrôle Deciplus — elle disparaîtra une fois le point réglé.');
  }
  // ── REMARQUE AUTOMATIQUE MODIFIABLE ─────────────────────────────────────────
  //  Chaque remarque automatique peut être réécrite à la main (administrateur).
  //  Le texte d'origine est gardé en base (lib/recap2RemarquesAuto.js) : la
  //  version modifiée s'affiche et se copie à sa place, et « Revenir à la
  //  version automatique » la retire. Si la règle cesse de produire la
  //  remarque (point réglé), la version modifiée disparaît avec elle.
  let editionAuto = null;   // { cle, texte, erreur, enCours }
  // Modifier une remarque : un administrateur, ou l'auteur de la remarque.
  const utilisateur = () => { try { return JSON.parse(localStorage.getItem('currentUser') || '{}'); } catch (_) { return {}; } };
  const estAdminR2 = () => !!(window.isAdmin && window.isAdmin());
  const peutModifier = (auteur) => estAdminR2() || (!!auteur && String(utilisateur().name || '') === String(auteur));
  // L'historique (admin) d'une remarque, affiché À LA DEMANDE dans le panneau d'édition.
  let historiqueOuvert = null; // { cle, lignes: [...] }
  async function afficherHistorique(cle, filtre) {
    try {
      const j = await (await fetch('/api/recap2/historique/' + rapport.mois, { headers: H() })).json();
      historiqueOuvert = { cle, lignes: filtre(j) };
    } catch (_) { historiqueOuvert = { cle, lignes: [] }; }
    render();
  }
  const blocHistorique = (cle) => (historiqueOuvert && historiqueOuvert.cle === cle)
    ? '<ul class="rec2-histo">' + (historiqueOuvert.lignes.length ? historiqueOuvert.lignes.map((h) => '<li><span class="rec2-det-date">' + esc(fmtDate(h.le)) + (h.par ? ' · ' + esc(h.par) : '') + '</span> '
      + (h.avant ? '<s>' + esc(h.avant) + '</s> → ' : '') + (h.apres ? esc(h.apres) : '<i>' + esc(h.vide || 'supprimée') + '</i>') + '</li>').join('') : '<li>Aucune version antérieure.</li>') + '</ul>'
    : '';
  const cleAuto = (type, studio, l, origine) => [type, studio, l.client || '', l.idClient || '', type === 'vni' ? (l.contactId || '') : '', origine].join('|');
  function blocRemarquesAuto(type, studio, l, origines, titreAuto) {
    const C = window.Recap2Conseils;
    if (!origines || !origines.length) return '';
    const admin = !!(window.isAdmin && window.isAdmin());
    const versions = C && C.versions ? C.versions(origines, l) : origines.map((t) => ({ origine: t, texte: t, modifiee: false }));
    const data = ' data-type="' + type + '" data-studio="' + esc(studio || '') + '" data-client="' + esc(l.client || '')
      + '" data-idclient="' + esc(l.idClient || '') + '" data-idvendor="' + esc(type === 'vni' ? (l.contactId || '') : '') + '"';
    return '<div class="rec2-conseils">' + versions.map((v) => {
      const cle = cleAuto(type, studio, l, v.origine);
      const d = data + ' data-origine="' + esc(v.origine) + '"';
      const btn = (action, texte, cls) => '<button type="button" class="' + cls + '" data-auto-action="' + action + '"' + d + '>' + texte + '</button>';
      if (editionAuto && editionAuto.cle === cle) {
        const e = editionAuto;
        return '<div class="rec2-note-edit rec2-auto-edit">'
          + '<textarea class="rec2-note-zone" rows="2" maxlength="1000" data-auto-texte="1"' + (e.enCours ? ' disabled' : '') + '>' + esc(e.texte) + '</textarea>'
          + '<div class="rec2-det-date">Version automatique : « ' + esc(v.origine) + ' »</div>'
          + '<div class="rec2-prop-actions">' + btn('enregistrer', 'Enregistrer', 'rec2-btn-ok')
          + (v.modifiee ? btn('revenir', 'Revenir à la version automatique', 'rec2-btn-non') : '')
          + btn('annuler', 'Annuler', 'rec2-btn-non') + (admin ? btn('historique', 'Historique', 'rec2-note-ajout') : '') + '</div>'
          + (e.erreur ? '<div class="rec2-resil-err">' + esc(e.erreur) + '</div>' : '') + blocHistorique('auto|' + cle) + '</div>';
      }
      const perso = ((l.remarquesAuto || {})[v.origine]) || {};
      const titre = v.modifiee
        ? 'Personnalisée' + (v.modifiePar ? ' par ' + v.modifiePar : '') + (v.modifieLe ? ' le ' + fmtDate(v.modifieLe) : '') + '\nVersion automatique : « À faire : ' + v.origine + ' »'
        : titreAuto;
      const edit = v.modifiee ? peutModifier(perso.auteur || v.modifiePar) : admin;
      return '<div class="rec2-conseil-ligne"><span class="rec2-conseil' + (v.modifiee ? ' is-modifiee' : '') + '" title="' + esc(titre) + '">' + esc(v.texte) + '</span>'
        + (v.modifiee ? '<span class="rec2-conseil-marque">Remarque automatique personnalisée' + (v.modifiePar ? ' — par ' + esc(v.modifiePar) : '') + (v.modifieLe ? ' le ' + esc(fmtDate(v.modifieLe)) : '') + '</span>' : '')
        + (edit ? '<span class="rec2-conseil-actions">' + btn('ouvrir', '✏️ Modifier', 'rec2-note-ajout')
          + (v.modifiee ? btn('revenir', 'Revenir à la version automatique', 'rec2-note-ajout') : '') + '</span>' : '')
        + '</div>';
    }).join('') + '</div>';
  }
  function lignesPersonneAuto(d) {
    return lignesPersonne(d.type, d.studio, d.client, d.idclient, d.idvendor);
  }
  async function actionRemarqueAuto(bouton) {
    const d = bouton.dataset;
    const action = d.autoAction;
    const ligne0 = lignesPersonneAuto(d)[0];
    if (!ligne0) return;
    const cle = cleAuto(d.type, d.studio, ligne0, d.origine);
    if (action === 'ouvrir') {
      const m = (ligne0.remarquesAuto || {})[d.origine];
      editionAuto = { cle, texte: (m && m.texte) || d.origine, erreur: '', enCours: false };
      render();
      const zone = $('#rec2-body textarea[data-auto-texte]');
      if (zone) { zone.focus(); zone.setSelectionRange(zone.value.length, zone.value.length); }
      return;
    }
    if (action === 'annuler') { editionAuto = null; historiqueOuvert = null; render(); return; }
    if (action === 'historique') {
      return afficherHistorique('auto|' + cle, (j) => (j.remarquesAuto || []).filter((h) => h.studio === d.studio && h.type === d.type && h.texte_auto === d.origine
        && (h.client === ligne0.client)).map((h) => Object.assign({}, h, { vide: 'retour à la version automatique' })));
    }
    if (action === 'enregistrer' && editionAuto && editionAuto.cle === cle && !String(editionAuto.texte || '').trim()) {
      editionAuto.erreur = 'La remarque ne peut pas être vide. Utilise « Revenir à la version automatique ».'; render(); return;
    }
    // Enregistrer, ou revenir à la version automatique (texte vide) : le serveur fait foi.
    const texte = action === 'revenir' ? '' : String((editionAuto && editionAuto.cle === cle) ? editionAuto.texte : '');
    if (action === 'enregistrer' && (!editionAuto || editionAuto.cle !== cle)) return;
    if (editionAuto && editionAuto.cle === cle) { editionAuto.enCours = true; editionAuto.erreur = ''; render(); }
    try {
      const r = await fetch('/api/recap2/remarque-auto', {
        method: 'POST', headers: H(),
        body: JSON.stringify({ mois: rapport.mois, studio: d.studio, type: d.type, client: d.client, idClient: d.idclient, idVendor: d.idvendor || '', texteAuto: d.origine, texte }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.version) throw new Error((j && j.error) || ('HTTP ' + r.status));
      lignesPersonneAuto(d).forEach((l) => {
        const m = Object.assign({}, l.remarquesAuto || {});
        if (j.version.texte) m[d.origine] = { texte: j.version.texte, modifieLe: j.version.modifieLe, modifiePar: j.version.modifiePar };
        else delete m[d.origine];
        l.remarquesAuto = m;
      });
      editionAuto = null;
    } catch (err) {
      if (editionAuto && editionAuto.cle === cle) { editionAuto.enCours = false; editionAuto.erreur = 'Non enregistré : ' + (err && err.message ? err.message : 'erreur'); }
      else alert('Non enregistré : ' + (err && err.message ? err.message : 'erreur'));
    }
    render();
  }
  function blocAuto(v) {
    const a = v.automatique;
    if (!a) return '';
    const heure = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(a.controleLe || '');
    const quand = heure ? 'Contrôlé le ' + heure[3] + '/' + heure[2] + '/' + heure[1] + ' à ' + heure[4] + ':' + heure[5] : '';
    const alertes = (a.alertes || []).map((x) => '<span class="rec2-auto-alerte">' + esc(x) + '</span>').join('');
    const at = a.attribution;
    const attribution = at ? '<span class="rec2-auto-attrib">' + esc(at.compte
      ? 'Vente comptée ici' + (at.commercial ? ' · ' + at.commercial : '')
      : 'Non comptée — ' + at.motif) + '</span>' : '';
    return '<div class="rec2-auto-bloc">' + alertes + attribution + (quand ? '<span class="rec2-det-date">' + quand + '</span>' : '') + '</div>';
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

  // ── REMARQUES PAR PERSONNE (ventes signées / non reconduits) ────────────────
  //  Une remarque libre par personne, liée au MOIS du rapport, au studio et au
  //  type de liste. L'état vient du SERVEUR (`l.note`, posé à la lecture) : il
  //  survit à l'actualisation, à la reconnexion, au redéploiement et à une
  //  nouvelle collecte. Une remarque vide = supprimée.
  //  ⚠️ AUCUN EFFET SUR LES KPI NI SUR LES STATUTS : rien ici n'entre dans un calcul.
  //  Pas de fenêtre de dialogue : le champ s'ouvre dans la ligne.
  let editionNote = null;   // { cle, texte, erreur, enCours }
  const cleNote = (type, studio, l) => type + '|' + studio + '|' + (l.client || '') + '|' + (l.idClient || '') + '|' + (type === 'vni' ? (l.contactId || '') : '');
  const noteTexte = (l) => String((l && l.note && l.note.remarque) || '');
  const EXTRAIT_NOTE = 70;

  function blocNote(type, studio, l) {
    const cle = cleNote(type, studio, l);
    const data = ' data-type="' + type + '" data-studio="' + esc(studio) + '" data-client="' + esc(l.client)
      + '" data-idclient="' + esc(l.idClient || '') + '" data-idvendor="' + esc(type === 'vni' ? (l.contactId || '') : '') + '"';
    const btn = (action, texte, cls) => '<button type="button" class="' + cls + '" data-note-action="' + action + '"' + data + '>' + texte + '</button>';
    const existante = noteTexte(l);
    if (editionNote && editionNote.cle === cle) {
      const e = editionNote;
      return '<div class="rec2-note-edit">'
        + '<textarea class="rec2-note-zone" rows="2" maxlength="2000" data-note-texte="1" placeholder="Remarque sur ' + esc(l.client) + ' — ' + esc(moisLabel(rapport.mois)) + '"'
        + (e.enCours ? ' disabled' : '') + '>' + esc(e.texte) + '</textarea>'
        + '<div class="rec2-prop-actions">' + (e.confirmer
          ? '<span class="rec2-note-confirm">Supprimer définitivement cette remarque ?</span>' + btn('supprimer', 'Confirmer la suppression', 'rec2-btn-non') + btn('garder', 'Garder', 'rec2-btn-ok')
          : btn('enregistrer', 'Enregistrer', 'rec2-btn-ok') + (existante ? btn('demander-suppression', 'Supprimer', 'rec2-btn-non') : '') + btn('annuler', 'Annuler', 'rec2-btn-non')
            + (existante && estAdminR2() ? btn('historique', 'Historique', 'rec2-note-ajout') : ''))
        + '</div>' + blocHistorique('note|' + cle)
        + (e.erreur ? '<div class="rec2-resil-err">' + esc(e.erreur) + '</div>' : '') + '</div>';
    }
    if (existante) {
      const n = l.note;
      const qui = (n.modifiePar ? ' par ' + n.modifiePar : '') + (n.modifieLe ? ' le ' + fmtDate(n.modifieLe) : '');
      const extrait = existante.length > EXTRAIT_NOTE ? existante.slice(0, EXTRAIT_NOTE).trim() + '…' : existante;
      const edit = peutModifier(n.auteur || n.modifiePar);
      return '<div class="rec2-note"><button type="button" class="rec2-note-voir" data-note-action="' + (edit ? 'ouvrir' : 'voir') + '"' + data
        + ' title="' + esc(existante + '\n\nRemarque enregistrée' + qui) + '">📝 <span>' + esc(extrait) + '</span></button>'
        + (edit ? ' <button type="button" class="rec2-note-ajout rec2-note-modif" data-note-action="ouvrir"' + data + '>✏️ Modifier</button>' : '')
        + (n.modifiee && n.modifiePar ? '<div class="rec2-det-date">Modifiée par ' + esc(n.modifiePar) + (n.modifieLe ? ' le ' + esc(fmtDate(n.modifieLe)) : '') + '</div>' : '')
        + '</div>';
    }
    return '<div class="rec2-note">' + btn('ouvrir', '+ Ajouter une remarque', 'rec2-note-ajout') + '</div>';
  }

  // Les lignes de la MÊME personne dans la liste du type (deux ventes d'une
  // même personne partagent leur remarque) — même règle que le serveur.
  function lignesPersonne(type, studio, client, idClient, idVendor) {
    const b = rapport && rapport.studios && rapport.studios[studio];
    const bloc = b && (type === 'vente' ? b.clientsRetrouves : type === 'vni' ? b.vni : type === 'suspension' ? b.suspensionsControle : b.nonReconduction);
    const RR = window.Recap2Remarques;
    const ref = { client, idClient, contactId: idVendor || '' };
    return ((bloc && bloc.liste) || []).filter((l) => (RR ? RR.memePersonne(l, ref) : (l.client === client && String(l.idClient || '') === idClient)));
  }

  async function actionNote(bouton) {
    const d = bouton.dataset;
    const action = d.noteAction;
    const cle = d.type + '|' + d.studio + '|' + d.client + '|' + d.idclient + '|' + (d.idvendor || '');
    if (action === 'ouvrir') {
      const ligne = lignesPersonne(d.type, d.studio, d.client, d.idclient, d.idvendor)[0];
      editionNote = { cle, texte: noteTexte(ligne), erreur: '', enCours: false };
      render();
      const zone = $('#rec2-body textarea[data-note-texte]');
      if (zone) { zone.focus(); zone.setSelectionRange(zone.value.length, zone.value.length); }
      return;
    }
    if (action === 'voir') return;
    if (!editionNote || editionNote.cle !== cle) return;
    if (action === 'annuler') { editionNote = null; historiqueOuvert = null; render(); return; }
    if (action === 'historique') {
      return afficherHistorique('note|' + cle, (j) => (j.remarques || []).filter((h) => h.studio === d.studio && h.type === d.type && h.client === d.client));
    }
    // Une remarque vide ne s'enregistre pas : pour l'effacer, « Supprimer ».
    if (action === 'enregistrer' && !String(editionNote.texte || '').trim()) {
      editionNote.erreur = 'La remarque ne peut pas être vide. Pour l’effacer, utilise « Supprimer ».'; render(); return;
    }
    // La suppression demande une confirmation explicite, dans la ligne.
    if (action === 'demander-suppression') { editionNote.confirmer = true; render(); return; }
    if (action === 'garder') { editionNote.confirmer = false; render(); return; }
    if (action === 'supprimer' && !editionNote.confirmer) return;
    // Enregistrer (texte vide = supprimer) ou supprimer : le serveur fait foi.
    const remarque = action === 'supprimer' ? '' : String(editionNote.texte || '');
    editionNote.enCours = true; editionNote.erreur = ''; render();
    try {
      const r = await fetch('/api/recap2/note', {
        method: 'POST', headers: H(),
        body: JSON.stringify({ mois: rapport.mois, studio: d.studio, type: d.type, client: d.client, idClient: d.idclient, idVendor: d.idvendor || '', remarque, supprimer: action === 'supprimer' }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.note) throw new Error((j && j.error) || ('HTTP ' + r.status));
      lignesPersonne(d.type, d.studio, d.client, d.idclient, d.idvendor).forEach((l) => { l.note = j.note; });
      editionNote = null;
    } catch (err) {
      if (editionNote) { editionNote.enCours = false; editionNote.erreur = 'Non enregistré : ' + (err && err.message ? err.message : 'erreur'); }
    }
    render();
  }

  // ── COPIER LES REMARQUES DU CLUB ────────────────────────────────────────────
  //  Un clic = le texte dans le presse-papiers, en HTML (collage propre dans
  //  Gmail) ET en texte brut. Aucun fichier, aucun téléchargement. Le texte est
  //  construit par Recap2Remarques depuis le rapport affiché, sans filtre.
  function boutonCopierClub(label, b) {
    if (!b || (b.controleBloquant && b.controleBloquant.ok === false) || !window.Recap2Remarques) return '';
    return '<span class="rec2-copier"><button type="button" class="rec2-copier-btn" data-copier-club="' + esc(label) + '">Copier les remarques du club</button>'
      + '<span class="rec2-copier-msg" role="status" aria-live="polite"></span></span>';
  }

  async function ecrirePressePapiers(texte, html) {
    try {
      if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([texte], { type: 'text/plain' }),
        })]);
        return true;
      }
    } catch (_) { /* on tente le texte brut */ }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(texte); return true; }
    } catch (_) { /* dernier recours ci-dessous */ }
    try {
      const zone = document.createElement('textarea');
      zone.value = texte; zone.setAttribute('readonly', ''); zone.style.position = 'fixed'; zone.style.opacity = '0';
      document.body.appendChild(zone); zone.select();
      const ok = document.execCommand('copy');
      zone.remove();
      return ok;
    } catch (_) { return false; }
  }

  async function copierRemarquesClub(bouton) {
    const label = bouton.dataset.copierClub;
    const msg = bouton.parentNode && bouton.parentNode.querySelector('.rec2-copier-msg');
    const dire = (t, ok) => {
      if (!msg) return;
      msg.textContent = t; msg.classList.toggle('is-ok', !!ok);
      clearTimeout(msg._minuteur);
      msg._minuteur = setTimeout(() => { msg.textContent = ''; }, 3000);
    };
    const r = window.Recap2Remarques.remarquesClub(rapport, label);
    if (!r.nb) { dire('Aucune remarque à copier pour ce mois', false); return; }
    const ok = await ecrirePressePapiers(r.texte, r.html);
    if (ok) confirmerCopie(bouton);
    dire(ok ? 'Remarques copiées' : 'Copie impossible — le navigateur a refusé l\'accès au presse-papiers', ok);
  }

  // ── COPIER LES REMARQUES DU COMMERCIAL ──────────────────────────────────────
  //  Visible seulement dans la vue d'un commercial précis. Même presse-papiers
  //  que la copie du club. Studios > Ventes signées / Clients non reconduits /
  //  VNI. Un non-reconduit y figure s'il est ATTRIBUÉ à ce commercial (choix
  //  manuel, sinon première vente Deciplus) — voir Recap2Remarques.remarquesCommercial.
  function boutonCopierCommercial(nom) {
    if (!commercial || !window.Recap2Remarques || !window.Recap2Remarques.remarquesCommercial) return '';
    return '<span class="rec2-copier"><button type="button" class="rec2-copier-btn" data-copier-com="1" data-nom="' + esc(nom) + '"'
      + ' title="Ventes signées, clients non reconduits dont il est responsable et VNI de ce commercial, regroupés par studio.">Copier les remarques du commercial</button>'
      + '<span class="rec2-copier-msg" role="status" aria-live="polite"></span></span>';
  }
  async function copierRemarquesCommercial(bouton) {
    const msg = bouton.parentNode && bouton.parentNode.querySelector('.rec2-copier-msg');
    const dire = (t, ok) => {
      if (!msg) return;
      msg.textContent = t; msg.classList.toggle('is-ok', !!ok);
      clearTimeout(msg._minuteur);
      msg._minuteur = setTimeout(() => { msg.textContent = ''; }, 3000);
    };
    const r = window.Recap2Remarques.remarquesCommercial(rapport, commercial, bouton.dataset.nom);
    if (!r.nb) { dire('Aucune remarque à copier pour ce commercial sur ce mois', false); return; }
    const ok = await ecrirePressePapiers(r.texte, r.html);
    if (ok) confirmerCopie(bouton);
    dire(ok ? 'Remarques du commercial copiées' : 'Copie impossible — le navigateur a refusé l\'accès au presse-papiers', ok);
  }

  // ── DÉTAILS (fermés par défaut, un seul ouvert à la fois) ────────────────────
  function detail(label, b) {
    if (ouvert === label + '|nr') return detailNR(label, b.nonReconduction);
    if (ouvert === label + '|comp') return detailComp(label, b.completion);
    if (ouvert === label + '|crm') return detailCrm(label, b.clientsRetrouves);
    return detailVniOuvert(label, b);
  }
  const detailVniOuvert = (label, b) => ((b && ouvert === label + '|vni') ? detailVni(label, b.vni) : '');
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

  // ── SUIVI DES NON-RECONDUITS : UN STATUT PAR DOSSIER ─────────────────────────
  //  Statut EFFECTIF = décision manuelle (lib/recap2NrStatuts.js), sinon statut
  //  AUTOMATIQUE du contrôle Deciplus (lib/recap2NrAnalyse.js). L'état vient du
  //  SERVEUR : il survit au rechargement, au redéploiement et à une nouvelle
  //  collecte. « Automatique » = aucune décision manuelle.
  //  ⚠️ AUCUN EFFET SUR LE TAUX DE NON-RECONDUCTION.
  const STATUTS_NR = [
    { val: 'a_traiter', libelle: 'À traiter', classe: 'is-faire' },
    { val: 'sous_controle', libelle: 'Sous contrôle', classe: 'is-ok' },
    { val: 'resilie', libelle: 'Résilié', classe: 'is-non' },
    { val: 'reconduit_autrement', libelle: 'Reconduit autrement', classe: 'is-oui' },
    { val: 'toujours_actif', libelle: 'Toujours actif', classe: 'is-oui' },
    { val: 'suspendu', libelle: 'Suspendu temporairement', classe: 'is-susp' },
    { val: 'recupere', libelle: 'Récupéré', classe: 'is-oui' },
    { val: 'depart_confirme', libelle: 'Départ confirmé', classe: 'is-non' },
    { val: 'a_creuser', libelle: 'À creuser', classe: 'is-non' },
  ];
  const LIB_NR = Object.fromEntries(STATUTS_NR.map((s) => [s.val, s.libelle]));
  const statutNR = (c) => (c && c.suivi && c.suivi.statut) || '';               // manuel
  const statutAutoNR = (c) => (c && c.analyse && c.analyse.statut) || '';        // contrôle
  const statutEffNR = (c) => statutNR(c) || statutAutoNR(c) || 'non_controle';
  function selectStatutNR(c, studio) {
    if (!(window.isAdmin && window.isAdmin())) return '';
    const actuel = statutNR(c);
    const auto = statutAutoNR(c);
    const opt = (v, t) => '<option value="' + v + '"' + (actuel === v ? ' selected' : '') + '>' + esc(t) + '</option>';
    const qui = (actuel && c.suivi.modifieLe) ? 'Décidé le ' + fmtDate(c.suivi.modifieLe) + (c.suivi.modifiePar ? ' par ' + c.suivi.modifiePar : '') : 'Aucune décision manuelle';
    return '<select class="rec2-verif-sel rec2-nr-statut-sel" data-nrstatut="1" data-studio="' + esc(studio) + '" data-client="' + esc(c.client)
      + '" data-idclient="' + esc(c.idClient || '') + '" title="' + esc(qui) + '" aria-label="' + esc('Statut — ' + c.client) + '">'
      + opt('', 'Automatique' + (auto ? ' : ' + LIB_NR[auto] : ' (non contrôlé)'))
      + STATUTS_NR.map((s) => opt(s.val, s.libelle)).join('') + '</select>';
  }
  // Le bloc d'analyse sous le nom : statut, indication, cause, finance, remarques.
  function blocAnalyseNR(c, studio) {
    const a = c.analyse;
    const eff = statutEffNR(c);
    const def = STATUTS_NR.find((s) => s.val === eff);
    const manuel = statutNR(c);
    const titre = a ? 'Contrôle Deciplus du ' + fmtDate(a.controleLe) + (manuel && a.statut ? ' — statut automatique : ' + LIB_NR[a.statut] : '') : 'Mois non contrôlé';
    let h = '<div class="rec2-flex">';
    if (def) h += '<span class="rec2-etat ' + def.classe + '" title="' + esc(titre) + '">' + esc(def.libelle) + '</span>'
      + (manuel ? ' <span class="rec2-det-date">décision manuelle</span>' : '');
    if (c.suggestion === 'recupere' && manuel !== 'recupere') h += '<span class="rec2-nr-suggest" title="Nouvelle prestation détectée après une première analyse « À traiter ». Seul un administrateur peut poser le statut.">Suggestion : Récupéré ?</span>';
    if (a && a.indication) h += '<span class="rec2-nr-indic">' + esc(a.indication) + '</span>';
    if (a && a.finance && (a.finance.ecart != null || a.finance.anomalie)) {
      const f = a.finance;
      const lim = (f.limites || []).join(' · ');
      const parts = [];
      if (f.contratVendor != null) parts.push('Vendor ' + eurosFr(f.contratVendor));
      if (f.contratDeciplus != null) parts.push('Deciplus ' + eurosFr(f.contratDeciplus));
      if (f.facture != null) parts.push('facturé ' + eurosFr(f.facture));
      if (f.encaisse != null) parts.push('encaissé ' + eurosFr(f.encaisse));
      if (f.remboursements) parts.push('remboursé ' + eurosFr(f.remboursements));
      h += '<span class="rec2-nr-fin" title="' + esc('Calcul non définitif — ' + lim) + '">' + esc(parts.join(' · ')) + '</span>';
    }
    const C = window.Recap2Conseils;
    const conseils = (C && C.conseilsNonReconduit) ? C.conseilsNonReconduit(c) : [];
    h += blocRemarquesAuto('non_reconduit', studio, c, conseils, 'Remarque automatique, d\'après le contrôle Deciplus des non-reconduits.');
    return h + selectStatutNR(c, studio) + '</div>';
  }
  const eurosFr = (x) => (x == null ? '—' : (Math.round(Number(x) * 100) / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' €');

  // Enregistre le statut. Pas d'optimisme : c'est la réponse du serveur qui fait foi.
  async function enregistrerStatutNR(sel) {
    const d = sel.dataset;
    const statut = sel.value;
    sel.disabled = true;
    try {
      const r = await fetch('/api/recap2/nr-statut', {
        method: 'POST', headers: H(),
        body: JSON.stringify({ mois: rapport.mois, studio: d.studio, client: d.client, idClient: d.idclient, statut }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.suivi) throw new Error((j && j.error) || ('HTTP ' + r.status));
      const nr = rapport.studios && rapport.studios[d.studio] && rapport.studios[d.studio].nonReconduction;
      const ligne = nr && (nr.liste || []).find((l) => l.client === d.client && String(l.idClient || '') === d.idclient);
      if (ligne) { ligne.suivi = j.suivi; if (j.suivi.statut === 'recupere') delete ligne.suggestion; }
      render();
    } catch (err) {
      render(); // l'écran revient à l'état connu du serveur
      alert('Statut non enregistré : ' + (err && err.message ? err.message : 'erreur'));
    }
  }

  // Le bloc DISTINCT des indicateurs de suivi (le taux historique n'y figure pas).
  function blocIndicateursNR(d) {
    const MM = window.Recap2Metrics;
    const tous = (d && d.liste) || [];
    if (!MM || !MM.indicateursNR || !tous.some((c) => c.analyse)) return '';
    const k = MM.indicateursNR(tous);
    const pct = (x) => (x == null ? '—' : Math.round(x * 100) + ' %');
    const tuile = (t, v, info) => '<div class="rec2-nr-kpi" title="' + esc(info) + '"><span>' + esc(t) + '</span><b>' + v + '</b></div>';
    const exclus = Object.entries(k.cohorte.exclus).map(([m, n]) => m + ' ' + n).join(', ');
    return '<div class="rec2-nr-kpis"><div class="rec2-nr-kpis-titre">Suivi des non-reconductions'
      + (d.controleAnalyse ? ' <span class="rec2-det-date">contrôle Deciplus du ' + esc(fmtDate(d.controleAnalyse.controleLe)) + '</span>' : '') + '</div><div class="rec2-nr-kpis-grille">'
      + tuile('Détectées', k.detectees, 'Non-reconductions du taux historique (encaissements), inchangé.')
      + tuile('Véritables', k.veritables, 'Détectées moins Toujours actif, Reconduit autrement et Suspendu.')
      + tuile('Résiliations', k.resiliations, 'Résilié + Départ confirmé, dont ' + k.contentieux + ' contentieux.')
      + tuile('dont contentieux', k.contentieux, 'Catégorie Deciplus « Contentieux » ou transfert confirmé par une note.')
      + tuile('Toujours actifs', k.toujoursActifs, 'Contrat de référence toujours actif, échéances à venir.')
      + tuile('Reconduits autrement', k.reconductions, 'Nouveau contrat, nouvelle formule, renouvellement, transfert, prestation utilisable.')
      + tuile('Suspendus', k.suspensions, 'Suspension temporaire.')
      + tuile('À récupérer', k.aRecuperer, 'À traiter + Sous contrôle.')
      + tuile('Récupérés', k.recuperes, 'Statut manuel « Récupéré ».')
      + tuile('Taux de récupération', pct(k.cohorte.taux), 'Récupérés parmi les ' + k.cohorte.eligibles + ' dossiers éligibles (« À traiter » au premier contrôle). Exclus : ' + (exclus || 'aucun') + '. En attente : ' + k.cohorte.enAttente + '.')
      + tuile('Chiffre mensuel récupéré', eurosFr(k.chiffreMensuelRecupere), 'Valeur des nouveaux contrats ÷ durée en mois' + (k.chiffreInconnu ? ' (' + k.chiffreInconnu + ' montant(s) inconnu(s))' : '') + '.')
      + tuile('Montant à vérifier', eurosFr(k.montantAVerifier), k.nbEcarts + ' écart(s) contractuel(s) non justifié(s), ' + k.divergences + ' anomalie(s) de montant. Avoirs non lisibles : calcul à confirmer.')
      + '</div>' + (k.causes.length ? '<p class="rec2-det-note">Principales causes : ' + esc(k.causes.slice(0, 5).map(([c, n]) => c + ' ' + n).join(' · ')) + '.</p>' : '')
      + '</div>';
  }
  // Les membres suspendus HORS non-reconduits (lecture sûre uniquement).
  function blocSuspensions(label) {
    const b = rapport.studios && rapport.studios[label];
    const l = (b && b.suspensionsControle && b.suspensionsControle.liste) || [];
    if (!l.length) return '';
    const C = window.Recap2Conseils;
    const lignes = l.map((x) => '<tr><td>' + nomNonReconduit(x) + '<div class="rec2-flex"><span class="rec2-etat is-susp">Suspendu temporairement</span>'
      + (x.analyse.indication ? '<span class="rec2-nr-indic">' + esc(x.analyse.indication) + '</span>' : '')
      + blocRemarquesAuto('suspension', label, x, C ? C.conseilsSuspension(x) : [], 'Remarque automatique, d\'après le contrôle Deciplus des suspensions.') + '</div></td></tr>').join('');
    return '<div class="rec2-nr-susp"><div class="rec2-nr-kpis-titre">Suspensions à contrôler (hors non-reconduits) — ' + l.length + '</div>'
      + '<table class="rec2-table"><tbody>' + lignes + '</tbody></table></div>';
  }

  // ── COMMERCIAL RESPONSABLE D'UN NON-RECONDUIT ───────────────────────────────
  //  Automatique = vendeur de la première vente Deciplus du client (par
  //  Id_client, table explicite des vendeurs) ; le choix manuel l'emporte
  //  toujours, « Non attribué » compris. Règle unique :
  //  Recap2Metrics.attributionNonReconduit. AUCUN EFFET SUR UN KPI.
  function celluleCommercialNR(c, studio) {
    const MM = window.Recap2Metrics;
    if (!MM || !MM.attributionNonReconduit) return '<td class="rec2-nr-com">—</td>';
    const a = MM.attributionNonReconduit(c);
    const choix = MM.commerciauxAttribuables(rapport);
    const opt = (val, txt, sel) => '<option value="' + esc(val) + '"' + (sel ? ' selected' : '') + '>' + esc(txt) + '</option>';
    let opts = opt('', 'Non attribué', !a.cle) + choix.map((ch) => opt(ch.cle, ch.nom, ch.cle === a.cle)).join('');
    if (a.cle && !choix.some((ch) => ch.cle === a.cle)) opts += opt(a.cle, a.nom || 'commercial', true);
    if (a.mode === 'manuel') opts += opt('auto', '↺ Automatique : ' + (a.auto.cle ? a.auto.nom : 'Non attribué'), false);
    const o = a.vendeurOrigine;
    let info = '';
    if (a.mode === 'manuel') info = 'choix manuel';
    else if (a.mode === 'auto') info = 'auto · 1re vente ' + o.date;
    else if (o && o.vendeur) info = 'Deciplus : ' + o.vendeur;
    else if (o && o.ambigu) info = 'Deciplus : plusieurs vendeurs';
    const titre = a.mode === 'manuel'
      ? 'Choisi à la main' + (a.modifiePar ? ' par ' + a.modifiePar : '') + (a.modifieLe ? ' le ' + fmtDate(a.modifieLe) : '') + '. Automatique : ' + (a.auto.cle ? a.auto.nom + ' — ' : 'Non attribué — ') + a.auto.motif
      : (a.mode === 'auto' ? 'Automatique : ' : 'Non attribué : ') + a.motif;
    return '<td class="rec2-nr-com"><select class="rec2-nr-com-sel' + (a.cle ? '' : ' is-aucun') + (a.mode === 'manuel' ? ' is-manuel' : '') + '"'
      + ' data-nrcom="1" data-studio="' + esc(studio) + '" data-client="' + esc(c.client) + '" data-idclient="' + esc(c.idClient || '') + '"'
      + ' title="' + esc(titre) + '" aria-label="' + esc('Commercial responsable — ' + c.client) + '">' + opts + '</select>'
      + (info ? '<div class="rec2-nr-com-info" title="' + esc(titre) + '">' + esc(info) + '</div>' : '') + '</td>';
  }

  // Pas d'optimisme : le sélecteur est bloqué pendant l'appel, la réponse du
  // serveur fait foi, et en cas d'échec l'écran revient à l'état connu.
  async function enregistrerCommercialNR(sel) {
    const d = sel.dataset;
    const commercial = sel.value;
    sel.disabled = true;
    try {
      const r = await fetch('/api/recap2/nr-commercial', {
        method: 'POST', headers: H(),
        body: JSON.stringify({ mois: rapport.mois, studio: d.studio, client: d.client, idClient: d.idclient, commercial }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.ok) throw new Error((j && j.error) || ('HTTP ' + r.status));
      const nr = rapport.studios && rapport.studios[d.studio] && rapport.studios[d.studio].nonReconduction;
      const ligne = nr && (nr.liste || []).find((l) => l.client === d.client && String(l.idClient || '') === d.idclient);
      if (ligne) { if (j.attribution) ligne.attribution = j.attribution; else delete ligne.attribution; }
      majSelecteurCommercial();
      render();
    } catch (err) {
      render();
      alert('Commercial non enregistré : ' + (err && err.message ? err.message : 'erreur'));
    }
  }

  function detailNR(label, d) {
    const tous = (d && d.liste) || [];
    const nb = { tous: tous.length, non_controle: 0 };
    STATUTS_NR.forEach((s) => { nb[s.val] = 0; });
    tous.forEach((c) => { nb[statutEffNR(c)] = (nb[statutEffNR(c)] || 0) + 1; });
    if (filtreNR[label] && !nb[filtreNR[label]]) filtreNR[label] = 'tous';
    const f = filtreNR[label] || 'tous';
    const liste = tous.filter((c) => f === 'tous' || statutEffNR(c) === f);
    const m1 = cap(moisLabel(rapport.m1)), m = cap(moisLabel(rapport.mois));
    const chip = (val, txt, n) => '<button type="button" class="rec2-chip' + (f === val ? ' is-on' : '')
      + '" data-filtrenr="' + esc(label) + '|' + val + '"' + (n ? '' : ' disabled aria-disabled="true"') + '>' + txt + ' <b>' + n + '</b></button>';
    const chips = tous.length
      ? '<div class="rec2-chips">' + chip('tous', 'Tous', nb.tous)
        + STATUTS_NR.map((s) => chip(s.val, s.libelle, nb[s.val])).join('')
        + (nb.non_controle ? chip('non_controle', 'Non contrôlés', nb.non_controle) : '') + '</div>'
      : '';
    const lignes = liste.map((c) => '<tr><td>' + nomNonReconduit(c) + blocAnalyseNR(c, label) + blocNote('non_reconduit', label, c) + '</td>'
      + celluleCommercialNR(c, label)
      + celluleMontant(c.netM1)
      + celluleMontant(c.netM) + '</tr>').join('');
    const corps = liste.length
      ? '<table class="rec2-table rec2-table-nr"><thead><tr><th>Client</th><th>Commercial</th>'
        + '<th class="rec2-num">Net ' + esc(m1) + '</th><th class="rec2-num">Net ' + esc(m) + '</th></tr></thead><tbody>' + lignes + '</tbody></table>'
      : '<p class="rec2-info">' + (tous.length ? 'Aucun client dans ce filtre.' : 'Aucun client non reconduit.') + '</p>';
    const pied = tous.length
      ? '<p class="rec2-det-note">Statuts de suivi et indicateurs : sans effet sur le taux de non-reconduction (encaissements).</p>' : '';
    return '<div class="rec2-detail">' + detailHead(esc(label) + ' · clients non reconduits — ' + tous.length) + blocIndicateursNR(d) + chips + corps + pied + blocSuspensions(label) + '</div>';
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
      + (c.verifiees ? chip('verifiees', 'Vérifiées à la main', c.verifiees) : '')
      + chip('verifier', 'À vérifier', c.aVerifier)
      + (c.divergents ? chipDiv(chip, c.divergents) : '')
      + (c.resilies ? chip('resilies', 'Résiliés', c.resilies) : '')
      + (c.annulees ? chip('annules', 'Annulés', c.annulees) : '') + '</div>';

    const lignes = liste.map((v) => '<tr' + classeLigne(v, label) + '><td>' + nomClient(v)
      + (v.date ? ' <span class="rec2-det-date">signé le ' + esc(v.date) + '</span>' : '') + blocAuto(v) + blocConseils(v, label) + blocNote('vente', label, v) + '</td>'
      + casesControle(v, label)
      + '<td>' + esc(v.prestation || '—') + '</td>'
      + '<td>' + esc(v.commercial || '—') + '</td>'
      + '<td class="rec2-num">' + statutVente(v, label) + '</td></tr>').join('');
    const corps = liste.length
      ? '<table class="rec2-table rec2-table-crm"><thead><tr><th>Signataire ' + esc(cap(moisLabel(rapport.mois)))
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
        + esc(nom) + ' — ' + esc(cap(moisLabel(rapport.mois))) + '</h3>'
        + boutonCopierCommercial(nom) + '<button type="button" class="rec2-det-x" data-toutcom="1">✕ Tous les commerciaux</button></div>'
        + ((d.referencesPresentes || d.vniPresents) ? '<div class="rec2-com-stats">' + (d.referencesPresentes ? compteurReferences(d) : '') + compteurVniCom(d) + '</div>' : '')
        + '<p class="rec2-info">Aucune vente pour ce commercial sur ce mois.</p>'
        + detailReferences(d) + detailVniCom(d) + '</section>';
    }

    const liste = d.ventes.filter((v) => passeFiltre(v, filtreCom));
    const chip = (val, txt, n) => '<button type="button" class="rec2-chip' + (filtreCom === val ? ' is-on' : '')
      + '" data-filtrecom="' + val + '">' + txt + ' <b>' + n + '</b></button>';

    const lignes = liste.map((v) => '<tr' + classeLigne(v, v.studio) + '>'
      + '<td class="rec2-com-studio">' + esc(v.studio) + '</td>'
      + '<td>' + nomClient(v) + blocConseils(v, v.studio) + blocNote('vente', v.studio, v) + '</td>'
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
      + compteurVniCom(d)
      + '</div>';
    const ou = '<p class="rec2-com-studios">Studios : ' + esc(d.studios.join(', ')) + '</p>';

    return '<section class="rec2-com">'
      + '<div class="rec2-com-head"><h3 class="rec2-com-nom">' + esc(nom) + ' — '
      + esc(cap(moisLabel(rapport.mois))) + '</h3>'
      + boutonCopierCommercial(nom) + '<button type="button" class="rec2-det-x" data-toutcom="1">✕ Tous les commerciaux</button></div>'
      + stats + ou + detailReferences(d) + detailVniCom(d)
      + '<div class="rec2-chips">' + chip('tous', 'Tous', rep0.total)
      + chip('retrouves', 'Retrouvés', rep0.retrouves)
      + (rep0.proposes ? chip('proposes', 'Rapprochements proposés', rep0.proposes) : '')
      + (rep0.prelevements ? chip('prelevements', 'Validés par prélèvement', rep0.prelevements) : '')
      + (rep0.verifiees ? chip('verifiees', 'Vérifiées à la main', rep0.verifiees) : '')
      + chip('verifier', 'À vérifier', rep0.aVerifier)
      + (rep0.divergents ? chipDiv(chip, rep0.divergents) : '')
      + (rep0.resilies ? chip('resilies', 'Résiliés', rep0.resilies) : '')
      + (rep0.annulees ? chip('annules', 'Annulés', rep0.annulees) : '') + '</div>'
      + corps
      + '<p class="rec2-det-note">Ce filtre ne concerne que « clients retrouvés dans Deciplus ». '
      + 'La non-reconduction, ci-dessous, ne dépend d\'aucun commercial.</p>'
      + '</section>';
  }

  // ── VNI (VISITEURS NON INSCRITS) ────────────────────────────────────────────
  //  Venus à un rendez-vous dans le mois, jamais transformés depuis. La liste
  //  vient du SERVEUR : historique du mois − transformations connues aujourd'hui
  //  (tous rapports). Rien n'est recalculé ici. Aucun KPI n'en dépend.
  //  Commercial = celui du DERNIER rendez-vous venu du mois.
  const nbTexte = (n, un, pl) => n + ' ' + (n > 1 ? pl : un);
  function repartitionVni(liste, champ) {
    const par = new Map();
    liste.forEach((l) => { const k = l[champ] || '—'; par.set(k, (par.get(k) || 0) + 1); });
    return [...par.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'fr'))
      .map(([k, n]) => esc(champ === 'commercial' ? (window.Recap2Metrics.libelleCommercial(k) || k) : k) + ' <b>' + n + '</b>').join(' · ');
  }
  function compteurVniStudio(label, b) {
    const v = b && b.vni;
    if (!v) return '';
    if (v.echec) return '<span class="rec2-vni-indispo" title="' + esc(v.echec) + '">VNI indisponibles</span>';
    const n = (v.liste || []).length;
    const actif = ouvert === label + '|vni';
    return '<button type="button" class="rec2-vni-chip' + (actif ? ' is-on' : '') + '" data-open="' + esc(label) + '|vni" aria-expanded="' + (actif ? 'true' : 'false') + '"'
      + ' title="Visiteurs non inscrits : venus en rendez-vous ce mois-ci, sans vente ni signature depuis">' + n + ' VNI</button>';
  }
  function nomVni(l) {
    const R = window.Retention;
    const href = (l.idClient && R && R.lienDeciplusId) ? R.lienDeciplusId(l.idClient) : null;
    if (!href) return esc(l.client);
    return '<a class="rec2-lien-fiche" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer" title="Ouvrir la fiche Deciplus dans un nouvel onglet">' + esc(l.client) + '</a>';
  }
  // ── CHALLENGE FLEX D'UN VNI ────────────────────────────────────────────────
  //  Statut posé par le contrôle Vendor (lib/recap2Flex.js) ou par la décision
  //  du conseiller, qui l'emporte toujours. La remarque « À faire : … » n'existe
  //  que pour « Flex à proposer » : ailleurs, l'action est faite ou sans objet.
  const FLEX_CLASSE = { 'Flex proposé': 'is-ok', 'Flex à proposer': 'is-faire', 'À vérifier': 'is-non',
    'Prospect non intéressé': 'is-ok', 'À reproposer plus tard': 'is-faire', 'Transformé depuis': 'is-oui' };
  function blocFlex(l) {
    const f = l.flex;
    if (!f || !f.statut) return '';
    const d = f.decision;
    const preuve = (f.preuves || [])[0];
    const titre = d
      ? 'Décidé à la main' + (d.modifiePar ? ' par ' + d.modifiePar : '') + (d.modifieLe ? ' le ' + fmtDate(d.modifieLe) : '')
        + (f.statutAuto ? ' — contrôle Vendor : ' + f.statutAuto : '')
      : 'Contrôle Vendor' + (f.controleLe ? ' du ' + fmtDate(f.controleLe) : '')
        + (preuve ? ' — ' + preuve.type + ' ' + preuve.quand + ' : ' + preuve.texte : '');
    const C = window.Recap2Conseils;
    const conseils = (C && C.conseilsVni) ? C.conseilsVni(l) : [];
    return '<div class="rec2-flex">'
      + '<span class="rec2-etat ' + (FLEX_CLASSE[f.statut] || 'is-non') + '" title="' + esc(titre) + '">' + esc(f.statut) + '</span>'
      + (d ? ' <span class="rec2-det-date">décision du conseiller</span>' : '')
      + blocRemarquesAuto('vni', l.studio, l, conseils, 'Remarque automatique, d\'après le contrôle Vendor du Challenge Flex.')
      + choixFlex(l) + '</div>';
  }
  // Après son action, le conseiller dit ce qu'il en est. Réversible.
  function choixFlex(l) {
    if (!(window.isAdmin && window.isAdmin())) return '';
    const v = (l.flex && l.flex.decision) ? l.flex.decision.valeur : 'auto';
    const opt = (x, t) => '<option value="' + x + '"' + (v === x ? ' selected' : '') + '>' + t + '</option>';
    return '<div class="rec2-verif"><select class="rec2-verif-sel" data-flex="1" data-studio="' + esc(l.studio || '')
      + '" data-contact="' + esc(l.contactId || '') + '" aria-label="' + esc('Challenge Flex — ' + l.client) + '"'
      + ' title="Après ton action : dis où en est le Challenge Flex pour ce prospect.">'
      + opt('auto', 'Contrôle automatique') + opt('propose', 'Flex proposé')
      + opt('non_interesse', 'Prospect non intéressé') + opt('reproposer', 'À reproposer plus tard') + '</select></div>';
  }
  async function enregistrerFlex(sel) {
    const d = sel.dataset;
    sel.disabled = true;
    try {
      const r = await fetch('/api/recap2/flex-decision', {
        method: 'POST', headers: H(),
        body: JSON.stringify({ mois: rapport.mois, studio: d.studio, contactId: d.contact, valeur: sel.value }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.ok) throw new Error((j && j.error) || ('HTTP ' + r.status));
      const b = rapport.studios && rapport.studios[d.studio];
      const ligne = ((b && b.vni && b.vni.liste) || []).find((x) => String(x.contactId || '') === d.contact);
      if (ligne) { if (j.flex) ligne.flex = j.flex; else delete ligne.flex; }
      render();
    } catch (err) {
      sel.disabled = false;
      alert('Décision non enregistrée : ' + (err && err.message ? err.message : 'erreur'));
      render();
    }
  }

  function piedVni(v) {
    const morceaux = [];
    if (v.retires) morceaux.push(nbTexte(v.retires, 'personne transformée depuis la collecte, retirée', 'personnes transformées depuis la collecte, retirées') + ' de la liste');
    if (v.transformationsConnuesJusquau) morceaux.push('transformations connues au ' + v.transformationsConnuesJusquau);
    morceaux.push('sans effet sur les KPI');
    return '<p class="rec2-det-note">' + esc(morceaux.join(' · ')) + '.</p>';
  }
  //  `transformes` : les personnes RETIRÉES de la liste parce qu'elles ont
  //  souscrit depuis leur venue. Affichées grisées, en fin de tableau, sans
  //  aucune action. Deux sources : une signature RECAP 2 (datée, prioritaire),
  //  ou le statut « Client - Avec Abonnement » lu sur la fiche Vendor — on
  //  affiche alors la date de la COLLECTE, jamais une date de signature inventée.
  function libelleTransforme(t) {
    if (t.source === 'vendor-abonnement') {
      const quand = t.detecteLe ? fmtDate(t.detecteLe) : '';
      return { texte: 'Transformé — abonnement détecté dans Vendor' + (quand ? ' (collecte du ' + quand + ')' : ''),
        titre: 'Retiré des VNI : la fiche Vendor de ce contact (identifiant exact) porte le statut « Client - Avec Abonnement »'
          + (quand ? ' lors de la collecte du ' + quand : '') + '. Date de signature inconnue.' };
    }
    return { texte: 'Transformé depuis' + (t.transformeLe ? ' le ' + t.transformeLe : ''),
      titre: 'Retiré des VNI : signature connue le ' + (t.transformeLe || '?') + (t.source ? ' (source : ' + t.source + ')' : '') };
  }
  function lignesTransformes(transformes, avecStudio) {
    return (transformes || []).map((t) => {
      const lib = libelleTransforme(t);
      return '<tr class="rec2-ligne-transforme">'
        + (avecStudio ? '<td class="rec2-com-studio">' + esc(t.studio || '') + '</td>' : '')
        + '<td>' + esc(t.client || '—') + '<div class="rec2-flex"><span class="rec2-etat is-oui" title="' + esc(lib.titre) + '">'
        + esc(lib.texte) + '</span></div></td>'
        + '<td class="rec2-num">' + esc(t.dateVenue || '—') + '</td>'
        + '<td>' + esc(window.Recap2Metrics.libelleCommercial(t.commercial) || t.commercial || '—') + '</td>'
        + '<td>—</td></tr>';
    }).join('');
  }
  function tableVni(liste, avecStudio, transformes) {
    if (!liste.length && !(transformes || []).length) return '<p class="rec2-info">Aucun VNI.</p>';
    const lignes = liste.map((l) => '<tr>'
      + (avecStudio ? '<td class="rec2-com-studio">' + esc(l.studio) + '</td>' : '')
      + '<td>' + nomVni(l) + blocFlex(l) + blocNote('vni', l.studio, l) + '</td>'
      + '<td class="rec2-num">' + esc(l.dateVenue) + (l.venues > 1 ? ' <span class="rec2-det-date">' + l.venues + ' venues</span>' : '') + '</td>'
      + '<td>' + esc(window.Recap2Metrics.libelleCommercial(l.commercial) || l.commercial || '—') + '</td>'
      + '<td>' + esc(l.statutVendor || '—') + '</td></tr>').join('');
    return '<table class="rec2-table"><thead><tr>' + (avecStudio ? '<th>Studio</th>' : '') + '<th>Visiteur</th><th class="rec2-num">Dernier RDV venu</th>'
      + '<th>Commercial</th><th>Statut Vendor</th></tr></thead><tbody>' + lignes + lignesTransformes(transformes, avecStudio) + '</tbody></table>';
  }
  function detailVni(label, v) {
    if (!v || v.echec) return '';
    // On pose le studio sur les lignes du RAPPORT : la remarque s'y enregistre.
    const liste = (v.liste || []).map((l) => Object.assign(l, { studio: label }));
    return '<div class="rec2-detail">' + detailHead(esc(label) + ' · VNI de ' + esc(moisLabel(rapport.mois)) + ' — ' + liste.length)
      + (liste.length ? '<p class="rec2-com-studios">Par commercial : ' + repartitionVni(liste, 'commercial') + '</p>' : '')
      + tableVni(liste, false, (v.transformesDepuis || []).map((t) => Object.assign({}, t, { studio: label }))) + piedVni(v) + '</div>';
  }
  function compteurVniCom(d) {
    if (!d.vniPresents) return '';
    return '<button type="button" class="rec2-com-det rec2-com-refs" data-vnicom="1" aria-expanded="' + (vniComOuvert ? 'true' : 'false') + '">'
      + '<b>' + d.vni.length + '</b> VNI</button>';
  }
  function detailVniCom(d) {
    if (!d.vniPresents) return '';
    const manque = d.vniIndisponibles.length
      ? '<p class="rec2-info rec2-info-err">VNI indisponibles pour : ' + esc(d.vniIndisponibles.map((x) => x.studio).join(', ')) + ' — le total ne les inclut pas.</p>' : '';
    if (!vniComOuvert) return manque;
    // Les lignes du RAPPORT elles-mêmes (pas des copies) : une remarque posée ici
    // se voit aussi dans le détail du studio.
    const lignes = d.vni.map((x) => {
      const b = rapport.studios[x.studio];
      const l = ((b && b.vni && b.vni.liste) || []).find((y) => y.contactId === x.contactId) || x;
      return Object.assign(l, { studio: x.studio });
    });
    return '<div class="rec2-refs"><div class="rec2-det-head"><span>VNI — ' + esc(cap(moisLabel(rapport.mois))) + '</span>'
      + '<button type="button" class="rec2-det-x" data-vnicom="1" aria-label="Fermer le détail des VNI">✕ Fermer</button></div>'
      + (lignes.length ? '<p class="rec2-com-studios">Par studio : ' + repartitionVni(lignes, 'studio') + '</p>' : '')
      + tableVni(lignes, true)
      + '<p class="rec2-det-note">Venus en rendez-vous ce mois-ci (dernier RDV venu avec ce commercial), sans vente ni signature depuis. Sans effet sur les KPI.</p></div>' + manque;
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
    const actNote = e.target.closest('[data-note-action]');
    if (actNote) { actionNote(actNote); return; }
    const actAuto = e.target.closest('[data-auto-action]');
    if (actAuto) { actionRemarqueAuto(actAuto); return; }
    const copieCom = e.target.closest('[data-copier-com]');
    if (copieCom) { copierRemarquesCommercial(copieCom); return; }
    const copieClub = e.target.closest('[data-copier-club]');
    if (copieClub) { copierRemarquesClub(copieClub); return; }
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
    if (e.target.closest('[data-alertes]')) {
      if (alertesOuvertes) { fermerEnDouceur($('#rec2-body .rec2-alertes-liste'), () => { alertesOuvertes = false; }); return; }
      alertesOuvertes = true; animerOuverture = true; render(); return;
    }
    const fil = e.target.closest('[data-filtre]');
    if (fil) { const [label, val] = fil.dataset.filtre.split('|'); filtreComp[label] = val; render(); return; }
    if (e.target.closest('[data-refs]')) { refsOuvertes = !refsOuvertes; render(); return; }
    if (e.target.closest('[data-vnicom]')) { vniComOuvert = !vniComOuvert; render(); return; }
    const fCom = e.target.closest('[data-filtrecom]');
    if (fCom) { filtreCom = fCom.dataset.filtrecom; render(); return; }
    if (e.target.closest('[data-toutcom]')) {
      commercial = ''; filtreCom = 'tous'; refsOuvertes = false; vniComOuvert = false;
      const sel = $('#rec2-commercial'); if (sel) sel.value = '';
      render(); return;
    }
    const filNR = e.target.closest('[data-filtrenr]');
    if (filNR) { const [label, val] = filNR.dataset.filtrenr.split('|'); filtreNR[label] = val; render(); return; }
    const filC = e.target.closest('[data-filtrecrm]');
    if (filC) { const [label, val] = filC.dataset.filtrecrm.split('|'); filtreCrm[label] = val; render(); return; }
    const fermer = e.target.closest('[data-close]');
    if (fermer) { fermerEnDouceur(fermer.closest('.rec2-detail'), () => { ouvert = ''; }); return; }
    const btn = e.target.closest('[data-open]');
    if (!btn) return;
    if (ouvert === btn.dataset.open) { // re-clic = referme
      fermerEnDouceur(btn.closest('.rec2-studio') && btn.closest('.rec2-studio').querySelector('.rec2-detail'), () => { ouvert = ''; });
      return;
    }
    ouvert = btn.dataset.open;
    animerOuverture = true;
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
