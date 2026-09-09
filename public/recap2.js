'use strict';
// ============================================================================
//  RECAP 2 — écran minimal : 6 studios, 2 chiffres chacun.
//
//  COUCHE D'AFFICHAGE, ET RIEN D'AUTRE. Les chiffres sont produits en amont par
//  la collecte (crm-automation) et déposés dans un JSON que le serveur sert en
//  lecture seule :  GET /api/recap2/AAAA-MM  (route admin).
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
  let ouvert = '';          // détail ouvert : '<studio>|nr' ou '<studio>|comp'
  let filtreComp = {};      // studio -> 'tous' | 'payes' | 'nonpayes'
  let alertesOuvertes = false;

  function open() {
    if (!inited) { wire(); inited = true; }
    if (!$('#rec2-mois').value) $('#rec2-mois').value = moisParDefaut();
    mois = $('#rec2-mois').value;
    charger();
  }

  function wire() {
    $('#rec2-mois').addEventListener('change', () => {
      mois = $('#rec2-mois').value; ouvert = ''; alertesOuvertes = false; charger();
    });
    $('#rec2-body').addEventListener('click', onBodyClick);
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
        ? 'Passage ' + moisLabel(rapport.m1) + ' → ' + moisLabel(rapport.mois) + ' · 6 studios en propre'
        : (mois ? moisLabel(mois) : '');
    }
    if (etat === 'chargement') { host.innerHTML = '<p class="rec2-info">Chargement…</p>'; return; }
    if (etat === 'absent') {
      host.innerHTML = '<div class="rec2-vide"><p class="rec2-vide-t">Données non encore collectées pour ce mois.</p>'
        + (message ? '<p class="rec2-vide-s">Fichier attendu : <code>' + esc(message) + '</code></p>' : '')
        + '<p class="rec2-vide-s">Lance la collecte : <code>node crm-automation/recap2-collecte.js ' + esc(mois) + '</code></p></div>';
      return;
    }
    if (etat === 'erreur') { host.innerHTML = '<p class="rec2-info rec2-info-err">Lecture impossible' + (message ? ' — ' + esc(message) : '') + '.</p>'; return; }
    if (!rapport) { host.innerHTML = ''; return; }

    host.innerHTML = bandeauSource() + bandeauAlertes() + LABELS.map(blocStudio).join('');
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
    let corps;
    if (!b) {
      corps = '<div class="rec2-cards">' + carteNA('NON-RECONDUCTION', 'studio absent du fichier de collecte')
        + carteNA('COMPLÉTION', 'studio absent du fichier de collecte') + '</div>';
    } else if (b.controleBloquant && b.controleBloquant.ok === false) {
      // Contrôle bloquant : on n'affiche AUCUN chiffre pour ce studio.
      const r = (b.controleBloquant.raisons || []).join(' · ');
      corps = '<div class="rec2-cards">' + carteNA('NON-RECONDUCTION', r) + carteNA('COMPLÉTION', r) + '</div>';
    } else {
      const pb = incoherences(b);
      if (pb.length) {
        corps = '<div class="rec2-cards">' + carteNA('NON-RECONDUCTION', pb.join(' · ')) + carteNA('COMPLÉTION', pb.join(' · ')) + '</div>';
      } else {
        corps = '<div class="rec2-cards">' + carteNR(label, b.nonReconduction) + carteComp(label, b.completion) + '</div>' + detail(label, b);
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

  // ── DÉTAILS (fermés par défaut, un seul ouvert à la fois) ────────────────────
  function detail(label, b) {
    if (ouvert === label + '|nr') return detailNR(label, b.nonReconduction);
    if (ouvert === label + '|comp') return detailComp(label, b.completion);
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

  // ── INTERACTIONS ────────────────────────────────────────────────────────────
  function onBodyClick(e) {
    if (e.target.closest('[data-alertes]')) { alertesOuvertes = !alertesOuvertes; render(); return; }
    const fil = e.target.closest('[data-filtre]');
    if (fil) { const [label, val] = fil.dataset.filtre.split('|'); filtreComp[label] = val; render(); return; }
    if (e.target.closest('[data-close]')) { ouvert = ''; render(); return; }
    const btn = e.target.closest('[data-open]');
    if (!btn) return;
    ouvert = (ouvert === btn.dataset.open) ? '' : btn.dataset.open; // re-clic = referme
    render();
  }

  return { open };
})();
